import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { deserialize, serialize } from 'node:v8';
import { parseArgs } from 'node:util';
import { recoveryEnvironment, checkRecoveryAction } from './stand-up-environment.mjs';
import { recoveryDesign } from './stand-up-design.mjs';
import { feedbackRecipe } from '../src/lab/recovery-recipe.ts';
import seed from './stand-up-feedback-seed.json' with { type: 'json' };
import { unassistedAudit, unassistedResult } from './stand-up-unassisted.mjs';

export const ACCEPTANCE_REF = 'stand-up-acceptance-v1';
const directory = new URL('./stand-up-acceptance/', import.meta.url);
const root = fileURLToPath(new URL('../', import.meta.url));
export const digest = bytes => createHash('sha256').update(bytes).digest('hex');

/** A pinned world and the fastest recorded optimized recipe, with its actual compliant-sole anatomy. */
export async function acceptanceEnvironment(configuration, balance = 0) {
  const spec = recoveryDesign(configuration);
  return recoveryEnvironment({ ...configuration, spec, baseline: 'support-recovery', balance,
    host: 'stance', recipe: feedbackRecipe(spec, seed.feedback.u), comparison: true });
}

/** The comparison is executed in the frozen checkout; candidate actions live outside tracked evaluator files. */
export function frozenRevision() {
  const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  const revision = git(['rev-parse', `${ACCEPTANCE_REF}^{commit}`]);
  assert.equal(git(['rev-parse', 'HEAD']), revision, `run from the ${ACCEPTANCE_REF} checkout`);
  assert.equal(git(['diff', revision, '--', '.']), '', 'tracked files must match the frozen evaluator');
  return revision;
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

/** Same complete physics/host/controller checkpoint for each continuation; no prefix regeneration or case replacement. */
export async function evaluateAcceptanceCase(c, manifest, candidateFactory, controller = 'optimized') {
  const checkpoint = readFileSync(new URL(c.file, directory));
  assert.equal(digest(checkpoint), c.sha256, 'saved fall bytes match their frozen identity');
  const negative = controller === 'assisted-negative-control';
  const e = await acceptanceEnvironment(c.configuration, negative ? 100 : 0);
  let audit;
  try {
    let saved = gunzipSync(checkpoint);
    if (negative) {
      const decoded = deserialize(saved);
      assert.deepEqual(decoded.identity, { ...e.identity, balance: 0 }, 'negative control differs only in the assistance ceiling');
      decoded.identity = e.identity;
      saved = serialize(decoded);
    }
    e.restore(saved);
    assert.deepEqual({ ...e.identity, balance: 0 }, c.identity);
    assert.equal(e.result().fell, true);
    assert.equal(e.result().assisted, false);
    assert.equal(e.result().handover, null);
    const initial = digest(JSON.stringify(e.observe()));
    assert.equal(initial, c.observationSha256, 'restored starting observation must match');
    audit = unassistedAudit(e.stand.built, () => e.stand.world.steps);
    if (controller !== 'optimized' && !negative) e.selectComparison(controller);
    const policy = candidateFactory && await candidateFactory(structuredClone({ channels: e.channels, configuration: c.configuration }));
    if (candidateFactory) assert.equal(typeof policy, 'function', 'createPolicy returns an action function');
    const trace = createHash('sha256');
    let result;
    const firstStep = e.stand.world.steps;
    while (e.result().elapsed < manifest.protocol.episodeSeconds) {
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
    if (result.success && result.seconds > manifest.protocol.handoverDeadline) {
      result.success = false; result.failure = 'handover deadline';
    }
    if (!result.success && !result.failure) result.failure = 'episode deadline';
    return { case: c.id, controller: candidateFactory ? 'action module' : controller, checkpointSha256: c.sha256, initialObservationSha256: initial,
      identity: e.identity, steps: e.stand.world.steps - firstStep, traceSha256: trace.digest('hex'), result };
  } finally { audit?.dispose(); e.dispose(); }
}

/** A nonzero assistance request exercises the real force path as a rejection control. */
export async function rejectAssistedAction(c, manifest) {
  if (c) {
    const row = await evaluateAcceptanceCase(c, manifest, null, 'assisted-negative-control');
    assert.equal(row.result.success, false);
    assert.equal(row.result.failure, 'external actuation');
    assert.ok(row.result.externalActuation.some(v => v.method === 'applyForce'));
    assert.ok(row.result.externalActuation.some(v => v.method === 'applyTorque'));
    return { ...row, role: 'negative control; identical saved fall, Balance 100 enabled solely to demonstrate rejection' };
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
  const { values } = parseArgs({ options: { candidate: { type: 'string' }, controller: { type: 'string', default: 'standard' }, output: { type: 'string', default: '.tools/stand-up-acceptance/report.json' } } });
  assert.ok(['optimized', 'standard'].includes(values.controller), 'unknown built-in comparison');
  assert.ok(!values.candidate || values.controller === 'standard', 'choose a candidate module or a built-in controller');
  const revision = frozenRevision(), started = performance.now();
  const manifest = JSON.parse(readFileSync(new URL('cases.json', directory), 'utf8'));
  assert.equal(process.versions.node, manifest.node, 'use the captured Node version for these V8 checkpoints');
  assert.equal(manifest.cases.length, 16, 'all frozen cases are required');
  assert.equal(new Set(manifest.cases.map(c => c.id)).size, 16, 'case identities are unique');
  const factory = values.candidate ? (await import(pathToFileURL(resolve(values.candidate)).href)).createPolicy : null;
  if (values.candidate) assert.equal(typeof factory, 'function', 'candidate exports createPolicy');
  const report = { evaluatorRef: ACCEPTANCE_REF, evaluatorCommit: revision, manifestSha256: digest(JSON.stringify(manifest)),
    protocol: manifest.protocol, candidate: values.candidate ? { path: resolve(values.candidate), sha256: digest(readFileSync(values.candidate)) }
      : { kind: values.controller, note: values.controller === 'optimized' ? 'reproducibility control, no new recovery' : 'existing controller, Balance zero' },
    baseline: [], candidateRows: [], negativeControl: null, recoveryGoal: 'NOT ACHIEVED; this is an acceptance-process repair' };
  mkdirSync(dirname(resolve(values.output)), { recursive: true });
  const write = () => writeFileSync(values.output, JSON.stringify(report, null, 2) + '\n');
  write();
  for (const c of manifest.cases) {
    const baseline = await evaluateAcceptanceCase(c, manifest);
    assert.deepEqual(baseline, c.reference, 'frozen baseline result and full physical trace must reproduce');
    report.baseline.push(baseline);
    const candidate = await evaluateAcceptanceCase(c, manifest, factory, factory ? 'optimized' : values.controller);
    if (!factory && values.controller === 'optimized') assert.deepEqual(candidate, baseline, 'identical restored continuations must agree');
    report.candidateRows.push(candidate); write();
    console.log(JSON.stringify({ case: c.id, baseline: baseline.result.seconds, baselineSuccess: baseline.result.success,
      candidate: candidate.result.seconds, candidateSuccess: candidate.result.success, failure: candidate.result.failure }));
  }
  report.negativeControl = await rejectAssistedAction(manifest.cases[0], manifest);
  assert.equal(frozenRevision(), revision, 'the evaluator must remain frozen throughout the run');
  report.summary = { baseline: summarizeAcceptance(report.baseline), candidate: summarizeAcceptance(report.candidateRows),
    assistedActionRejected: true, matchedInitialStates: report.baseline.every((b, i) => b.initialObservationSha256 === report.candidateRows[i].initialObservationSha256),
    lostCompletions: report.baseline.filter((b, i) => b.result.success && !report.candidateRows[i].result.success).map(b => b.case),
    gainedCompletions: report.baseline.filter((b, i) => !b.result.success && report.candidateRows[i].result.success).map(b => b.case),
    robustnessQualified: false, criteriaChanged: false };
  report.wallSeconds = (performance.now() - started) / 1000; write();
  console.log(JSON.stringify({ ...report.summary, recoveryGoal: report.recoveryGoal, output: resolve(values.output), wallSeconds: report.wallSeconds }, null, 2));
  if (report.candidateRows.some(r => r.result.externalActuation.length)) process.exitCode = 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
