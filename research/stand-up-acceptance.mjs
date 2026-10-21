import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { deserialize, serialize } from 'node:v8';
import { parseArgs } from 'node:util';
import { recoveryEnvironment, checkRecoveryAction } from './stand-up-environment.mjs';
import { unassistedAudit, unassistedResult } from './stand-up-unassisted.mjs';

/**
 * **The stand-up screen's protocol**: on the Node stand (the stance host, Rapier, 120 Hz, Balance
 * 0), a body stands 240 steps and is shoved twice, 60 N s 0.2 s apart, and the screen takes it at
 * the first takeover of its recovery; the clock runs from that takeover. It succeeds standing upright
 * on two loaded feet, quiet 0.5 s, then holding 2 s and walking 1 s at least 0.1 m, with no external
 * actuation and efforts within the muscles', by 35 s; at 38 s the episode ends.
 */
const PROTOCOL = Object.freeze({ harness: 'Node stand, stance host, Rapier, 120 Hz, Balance 0', fall: Object.freeze({ impulse: 60, separation: .2 }),
  episodeSeconds: 38, handoverDeadline: 35 });
/** Its cases: the Warrior and the Rogue, empty-handed and with the club, each shoved four ways. */
export const SCREEN_CASES = Object.freeze(['workshop-fighter', 'workshop-rogue'].flatMap(model => ['empty', 'club'].flatMap(held =>
  [0, 90, 180, 270].map(degrees => Object.freeze({ id: `${model}-${held}-${degrees}`, configuration: Object.freeze({ model, held }), degrees })))));
export const digest = bytes => createHash('sha256').update(bytes).digest('hex');

/** The screen's world: the game's body and its Stand up, with standard support recovery to compare. */
export async function acceptanceEnvironment({ model, held }, balance = 0) {
  return recoveryEnvironment({ model, held, baseline: 'step-up', balance, host: 'stance', comparison: true });
}

/** A case's fall, made afresh: the body shoved by the protocol and saved at its recovery's takeover. */
export async function screenFall(c) {
  const e = await acceptanceEnvironment(c.configuration);
  try {
    await e.fall({ degrees: c.degrees, ...PROTOCOL.fall });
    assert.equal(e.result().fell, true, `${c.id} falls`);
    assert.notEqual(e.result().takeover, null, `${c.id} is taken over by its recovery`);
    return e.save();
  } finally { e.dispose(); }
}

/** Every case, including timeouts, contributes to the denominator and failure-inclusive median. */
export function summarizeAcceptance(rows) {
  const times = rows.map(({ result: r }) => r.fell === true && r.success === true && !r.failure
    && !r.assisted && r.externalActuation.length === 0 && r.effortViolation < .0001
    && Number.isFinite(r.seconds) && r.seconds >= 0 && r.seconds <= 35 ? r.seconds : Infinity).sort((a, b) => a - b);
  const n = times.length, median = n ? (times[Math.floor((n - 1) / 2)] + times[Math.floor(n / 2)]) / 2 : Infinity;
  return { cases: n, within6: times.filter(t => t <= 6).length, within12: times.filter(t => t <= 12).length,
    within35: times.filter(t => t <= 35).length, failureInclusiveMedian: Number.isFinite(median) ? median : null,
    medianMeaning: Number.isFinite(median) ? 'seconds' : 'not reached; failures are infinity',
    rejectedExternalActuation: rows.filter(r => r.result.externalActuation.length > 0).length };
}

/** One continuation of a case's saved fall (`screenFall`), by step-up, a built-in comparison or a candidate's actions. */
export async function evaluateAcceptanceCase(c, saved, candidateFactory, controller = 'step-up') {
  const negative = controller === 'assisted-negative-control';
  const e = await acceptanceEnvironment(c.configuration, negative ? 100 : 0);
  let audit;
  try {
    if (negative) {
      const decoded = deserialize(saved);
      assert.deepEqual(decoded.identity, { ...e.identity, balance: 0 }, 'negative control differs only in the assistance ceiling');
      decoded.identity = e.identity;
      saved = serialize(decoded);
    }
    e.restore(saved);
    assert.equal(e.result().fell, true);
    assert.equal(e.result().assisted, false);
    assert.equal(e.result().handover, null);
    const initial = digest(JSON.stringify(e.observe()));
    audit = unassistedAudit(e.stand.built, () => e.stand.world.steps);
    if (controller !== 'step-up' && !negative) e.selectComparison(controller);
    const policy = candidateFactory && await candidateFactory(structuredClone({ channels: e.channels, configuration: c.configuration }));
    if (candidateFactory) assert.equal(typeof policy, 'function', 'createPolicy returns an action function');
    const trace = createHash('sha256');
    let result;
    const firstStep = e.stand.world.steps;
    while (e.result().elapsed < PROTOCOL.episodeSeconds) {
      let action;
      if (policy) {
        action = checkRecoveryAction(await policy(structuredClone(e.observe())), e.channels);
        if (action.assist && [...action.assist.force, ...action.assist.moment].some(v => v !== 0)) {
          audit.events.push({ step: e.stand.world.steps, segment: 'candidate', method: 'requested assist', value: action.assist });
          result = unassistedResult(e.result(), audit.events); break;
        }
      }
      if (negative) action = { kind: 'muscles', activation: e.channels.map(() => 0), velocity: e.channels.map(() => 0),
        assist: { force: [0, 1, 0], moment: [1, 0, 0] } };
      const row = e.step(action, { automaticHandover: true });
      trace.update(JSON.stringify(row.observation));
      result = unassistedResult(row.result, audit.events);
      if (result.success || result.failure) break;
    }
    result ??= unassistedResult(e.result(), audit.events);
    if (result.success && result.seconds > PROTOCOL.handoverDeadline) {
      result.success = false; result.failure = 'handover deadline';
    }
    if (!result.success && !result.failure) result.failure = 'episode deadline';
    return { case: c.id, controller: candidateFactory ? 'action module' : controller, initialObservationSha256: initial,
      identity: e.identity, steps: e.stand.world.steps - firstStep, traceSha256: trace.digest('hex'), result };
  } finally { audit?.dispose(); e.dispose(); }
}

/** A nonzero assistance request exercises the real force path as a rejection control. */
export async function rejectAssistedAction(c, saved) {
  if (c) {
    const row = await evaluateAcceptanceCase(c, saved, null, 'assisted-negative-control');
    assert.equal(row.result.success, false);
    assert.equal(row.result.failure, 'external actuation');
    assert.ok(row.result.externalActuation.some(v => v.method === 'applyForce'));
    assert.ok(row.result.externalActuation.some(v => v.method === 'applyTorque'));
    return { ...row, role: 'negative control; the same fall, Balance 100 enabled solely to demonstrate rejection' };
  }
  const e = await recoveryEnvironment({ balance: 100 });
  let audit;
  try {
    await e.fall();
    assert.equal(e.result().fell, true);
    audit = unassistedAudit(e.stand.built, () => e.stand.world.steps);
    e.step({ kind: 'muscles', activation: e.channels.map(() => 0), velocity: e.channels.map(() => 0),
      assist: { force: [0, 1, 0], moment: [1, 0, 0] } });
    assert.ok(audit.events.some(v => v.method === 'applyForce'), 'assisted action delivers a force');
    assert.ok(audit.events.some(v => v.method === 'applyTorque'), 'assisted action delivers a moment');
    const result = unassistedResult(e.result(), audit.events);
    assert.equal(result.success, false);
    assert.equal(result.failure, 'external actuation');
    assert.throws(() => audit.check(), /rejected external actuation/);
    return { role: 'negative control only; not a matched performance comparison', identity: e.identity, result };
  } finally { audit?.dispose(); e.dispose(); }
}

async function main() {
  const { values } = parseArgs({ options: { candidate: { type: 'string' }, controller: { type: 'string', default: 'support-recovery' }, output: { type: 'string', default: '.tmp/stand-up-acceptance/report.json' } } });
  assert.ok(['step-up', 'support-recovery'].includes(values.controller), 'unknown built-in comparison');
  assert.ok(!values.candidate || values.controller === 'support-recovery', 'choose a candidate module or a built-in controller');
  const started = performance.now();
  const factory = values.candidate ? (await import(pathToFileURL(resolve(values.candidate)).href)).createPolicy : null;
  if (values.candidate) assert.equal(typeof factory, 'function', 'candidate exports createPolicy');
  const report = { protocol: PROTOCOL, candidate: values.candidate ? { path: resolve(values.candidate), sha256: digest(readFileSync(values.candidate)) }
      : { kind: values.controller, note: values.controller === 'step-up' ? 'reproducibility control, no new recovery' : 'existing controller, Balance zero' },
    baseline: [], candidateRows: [], negativeControl: null };
  mkdirSync(dirname(resolve(values.output)), { recursive: true });
  const write = () => writeFileSync(values.output, JSON.stringify(report, null, 2) + '\n');
  write();
  let first = null;
  for (const c of SCREEN_CASES) {
    const saved = await screenFall(c);
    first ??= { c, saved };
    const baseline = await evaluateAcceptanceCase(c, saved);
    report.baseline.push(baseline);
    const candidate = await evaluateAcceptanceCase(c, saved, factory, factory ? 'step-up' : values.controller);
    if (!factory && values.controller === 'step-up') assert.deepEqual(candidate, baseline, 'identical restored continuations must agree');
    report.candidateRows.push(candidate); write();
    console.log(JSON.stringify({ case: c.id, baseline: baseline.result.seconds, baselineSuccess: baseline.result.success,
      candidate: candidate.result.seconds, candidateSuccess: candidate.result.success, failure: candidate.result.failure }));
  }
  report.negativeControl = await rejectAssistedAction(first.c, first.saved);
  report.summary = { baseline: summarizeAcceptance(report.baseline), candidate: summarizeAcceptance(report.candidateRows),
    assistedActionRejected: true, matchedInitialStates: report.baseline.every((b, i) => b.initialObservationSha256 === report.candidateRows[i].initialObservationSha256),
    lostCompletions: report.baseline.filter((b, i) => b.result.success && !report.candidateRows[i].result.success).map(b => b.case),
    gainedCompletions: report.baseline.filter((b, i) => !b.result.success && report.candidateRows[i].result.success).map(b => b.case) };
  report.wallSeconds = (performance.now() - started) / 1000; write();
  console.log(JSON.stringify({ ...report.summary, output: resolve(values.output), wallSeconds: report.wallSeconds }, null, 2));
  if (report.candidateRows.some(r => r.result.externalActuation.length)) process.exitCode = 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
