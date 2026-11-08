/** Several physical starts per phase; checkpoint selection reads only the trained phases. */
import '../../../tests/harness/preload-data.mjs';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { Worker, isMainThread, parentPort } from 'node:worker_threads';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { LONE_WORLD } from '../../../src/app/node/evaluation.ts';
import { defaultMind } from '../../../src/app/catalog.ts';
import { DEFAULT_ENGINE } from '../../../src/core/physics/engines.ts';
import { Vector3 } from '../../../src/core/math/vector.ts';
import { sin, cos } from '../../../src/core/math/real.ts';
import { massCentreToRef, massOf } from '../../../src/core/bodies/read-motion.ts';
import { footStatesOf, groundContact } from '../../../src/control/support.ts';
import { recoveryNetwork } from '../../../src/core/math/learning/recovery-network.ts';
import { MOVE } from '../../../src/skills/locomotion/move-part.ts';
import { STOCK_GAITS } from '../../../src/skills/locomotion/gaits.ts';
import { readTravel } from '../../../src/evaluation/travel/read.ts';
import { TRAVEL, travelScript } from '../../../src/evaluation/travel/protocol.ts';
import { traceOf } from '../../../src/evaluation/trace.ts';
import { travelEnvironment } from './travel-environment.mjs';
import { workerJobs } from '../../worker-jobs.mjs';
import { BUILD_IDENTITY } from '../../../scripts/build-identity.mjs';

const read = path => JSON.parse(readFileSync(path, 'utf8'));
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const direction = heading => ({ x: sin(heading), z: cos(heading) });
const go = heading => ({ move: { kind: 'direct', direction: direction(heading) }, gait: 'run', pace: 4, face: null });
const stop = heading => ({ move: null, face: direction(heading) });
const mean = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

/** Development headings and rest recipes differ from training's original quiet start. */
export function developmentCases() {
  const rests = [
    { settle: 1.4, yaw: -.12, lower: 0 },
    { settle: 2.1, yaw: .12, lower: .015 },
    { settle: 2.8, yaw: 0, lower: .03 },
  ];
  return [
    ...[.19, 1.27, 2.61, 4.43].flatMap((heading, h) => rests.map((rest, r) => ({
      id: `rest-${h}-${r}`, phase: 'entry', heading, ...rest, seed: 1103 + 13 * h + r,
    }))),
    ...[.43, 3.73].flatMap((heading, h) => [5.075, 5.325, 5.575, 5.825].map((at, p) => ({
      id: `moving-${h}-${p}`, phase: 'hold', heading, at, seed: 1301 + h,
    }))),
  ];
}

function mindOf(tuning) {
  const base = defaultMind('workshop-fighter');
  return { ...base, tuning: { ...base.tuning, parts: { ...base.tuning?.parts, legs: { ...MOVE,
    gaits: STOCK_GAITS.map(gait => ({ ...gait, legs: { ...gait.legs, tuning } })) } } } };
}

function entryWorld(tuning, c) {
  const condition = { model: 'workshop-fighter', mode: 'forward', way: 0, sense: 1, pace: 4,
    heading: c.heading, seed: c.seed, gusts: false, loadout: { left: 'empty', right: 'empty' } };
  const warmup = c.settle - TRAVEL.start;
  const script = [{ at: 0, orders: { ...stop(c.heading), lower: c.lower } },
    ...travelScript(condition).cues.filter(cue => cue.at > 0).map(cue => ({ ...cue, at: cue.at + warmup }))];
  return { condition, warmup, world: { kind: 'lone', engine: DEFAULT_ENGINE, lone: {
    model: 'workshop-fighter', mind: mindOf(tuning), heading: c.heading + c.yaw, seed: c.seed,
    balance: 0, floorSize: 400, loadout: condition.loadout, script,
  } } };
}

async function entryCase(tuning, c) {
  const recipe = entryWorld(tuning, c), built = await LONE_WORLD.build(recipe.world);
  if ('refused' in built) throw Error(built.refused);
  try {
    const { world, body } = built, trace = traceOf([body.built]);
    // The reader measures elapsed trial time; physics and the world's clock are never reset.
    for (let i = 0; i < Math.round(recipe.warmup * world.hz); i++) { world.step(); trace.take(); }
    const reader = readTravel(built, recipe.condition), p = travelScript(recipe.condition);
    const parts = [...body.built.segments.values()], mass = massOf(parts), feet = footStatesOf(body.built);
    const centre = new Vector3(), work = new Vector3(), velocity = new Vector3();
    let steps = 0, beforeStop, rest;
    while (!reader.ended) {
      world.step(); trace.take(); reader.afterStep(); steps++;
      if (steps === Math.round(TRAVEL.start * world.hz)) {
        massCentreToRef(parts, mass, centre, work, velocity);
        rest = { speed: Math.hypot(velocity.x, velocity.z), centre: [centre.x, centre.y, centre.z],
          support: feet.filter(foot => foot.contactParts.some(part => part.chain.every(joint => joint.attached())
            && body.built.physics.contactsOf(part.segment.body).some(contact => groundContact(contact, .5)))).map(foot => foot.side) };
      }
      if (steps === Math.round(p.stop * world.hz)) beforeStop = reader.reading();
    }
    const full = reader.reading(), run = beforeStop;
    if (!run) throw Error('Entry fixture did not reach its stop boundary');
    const short = run.short.filter(reason => !['incomplete', 'stop entry not reached', 'stop and settle'].includes(reason));
    return { case: c, fixtureReached: run.fromRest && rest.support.length === 2, rest,
      beforeStop: { met: short.length === 0, short, fall: run.fellAt !== null, firstLeg: run.firstLeg,
        entry: run.entryMade, reachedAt: run.reachedAt, held: run.held, corridor: run.corridor },
      stop: { entered: full.stopEntered, stoppedAt: full.stoppedAt,
        fall: full.fellAt !== null && full.fellAt > p.stop, fellAt: full.fellAt, corridor: full.corridor,
        met: full.stopEntered && full.stoppedAt !== null && full.fellAt === null && full.corridor <= TRAVEL.corridor },
      digest: trace.digest(), played: world.time };
  } finally { built.dispose(); }
}

const moving = new Map();
async function holdCase(basePath, policy, c) {
  const key = `${basePath}/${c.heading}/${c.seed}`;
  let env = moving.get(key);
  if (!env) {
    env = await travelEnvironment({ settings: basePath, heading: c.heading, seed: c.seed,
      warmPaces: [4], starts: [5.075, 5.325, 5.575, 5.825], trace: true,
      scripts: [{ start: 'moving', seconds: 14, cues: [{ at: 0, orders: go(c.heading) }, { at: 10, orders: stop(c.heading) }] }] });
    moving.set(key, env);
  }
  const id = `4/${c.at}`, entry = env.entries.find(one => one.id === id);
  if (!entry) return { case: c, fixtureReached: false, rejected: env.rejected.find(one => one.requested === c.at),
    beforeStop: { met: false, fall: false, entry: false, held: null, corridor: null }, stop: { entered: false, met: false } };
  const program = { start: id, seconds: 14, cues: [{ at: 0, orders: go(c.heading) }, { at: 10, orders: stop(c.heading) }] };
  let observation = await env.reset({ program }), result;
  const initial = env.reading();
  for (;;) {
    result = env.step(policy(observation), { squashed: true }); observation = result.observation;
    if (result.terminated || result.truncated) break;
  }
  const samples = env.samples(), hz = env.harness.hz, cut = 10 * hz, prefix = samples.slice(0, cut);
  const forward = direction(c.heading), cumulative = [];
  let sum = 0, held = Infinity, corridor = 0;
  for (let i = 0; i < prefix.length; i++) {
    const sample = prefix[i];
    sum += (sample.velocity[0] * forward.x + sample.velocity[2] * forward.z) / hz; cumulative.push(sum);
    if (i >= hz - 1) held = Math.min(held, sum - (i >= hz ? cumulative[i - hz] : 0));
    corridor = Math.max(corridor, Math.abs((sample.centre[0] - initial.centre[0]) * forward.z - (sample.centre[2] - initial.centre[2]) * forward.x));
  }
  const fall = prefix.some(sample => sample.down), complete = prefix.length === cut;
  const stopped = samples.slice(cut), entered = complete && prefix.length >= hz
    && cumulative.at(-1) - cumulative[prefix.length - hz - 1] >= 4;
  const stopCorridor = stopped.reduce((maximum, sample) => Math.max(maximum,
    Math.abs((sample.centre[0] - initial.centre[0]) * forward.z - (sample.centre[2] - initial.centre[2]) * forward.x)), corridor);
  let quiet = 0, quietFrom = null, stoppedAt = null;
  for (let i = 0; i < stopped.length; i++) {
    const sample = stopped[i];
    if (Math.hypot(sample.velocity[0], sample.velocity[2]) < TRAVEL.still && sample.standing) {
      quietFrom ??= (i + 1) / hz; quiet++;
      if (quiet > TRAVEL.quiet * hz && quietFrom <= TRAVEL.stop) stoppedAt ??= quietFrom;
    } else { quiet = 0; quietFrom = null; }
  }
  return { case: c, fixtureReached: true, entry,
    beforeStop: { met: complete && !fall && held >= 4 && corridor <= 1, complete, fall, entry: true,
      held: Number.isFinite(held) ? held : null, corridor },
    stop: { entered, stoppedAt, corridor: stopCorridor, fall: stopped.some(sample => sample.down),
      met: entered && stoppedAt !== null && !fall && !stopped.some(sample => sample.down) && stopCorridor <= TRAVEL.corridor },
    digest: digest(samples), played: samples.length / hz };
}

async function screenCandidate(manifest, candidate) {
  const settings = candidate.settings ?? manifest.settings, tuning = read(settings);
  if (candidate.policy) tuning.learned.travel = read(candidate.policy);
  const policy = recoveryNetwork(tuning.learned.travel), rows = [];
  for (const c of manifest.cases) rows.push(c.phase === 'entry' ? await entryCase(tuning, c) : await holdCase(settings, policy, c));
  const entries = rows.filter(row => row.case.phase === 'entry'), holds = rows.filter(row => row.case.phase === 'hold');
  const summary = { id: candidate.id, cases: rows.length, fixtures: rows.filter(row => row.fixtureReached).length,
    falls: rows.filter(row => row.beforeStop.fall).length, entries: entries.filter(row => row.beforeStop.entry).length,
    entryCases: entries.length, entryRate: entries.filter(row => row.beforeStop.entry).length / entries.length,
    held: mean(rows.map(row => row.beforeStop.held ?? 0)), entryHeld: mean(entries.map(row => row.beforeStop.held ?? 0)),
    movingHeld: mean(holds.map(row => row.beforeStop.held ?? 0)), movingMet: holds.filter(row => row.beforeStop.met).length,
    firstLeg: { left: entries.filter(row => row.beforeStop.firstLeg === 'left').length, right: entries.filter(row => row.beforeStop.firstLeg === 'right').length },
    stopFalls: rows.filter(row => row.stop.fall).length, stops: rows.filter(row => row.stop.met).length,
    totalFalls: rows.filter(row => row.beforeStop.fall || row.stop.fall).length };
  return { candidate, summary, settings: tuning, fixtureSettings: read(settings), cases: manifest.cases,
    code: manifest.code, stopTrained: manifest.stopTrained === true,
    harness: { name: 'Node lone world Option Mind', engine: DEFAULT_ENGINE, hz: 120, balance: 0 }, rows };
}

if (!isMainThread) {
  parentPort.on('message', async ({ manifest, candidate }) => {
    try { parentPort.postMessage({ result: await screenCandidate(manifest, candidate) }); }
    catch (error) { parentPort.postMessage({ error: String(error.stack ?? error) }); }
  });
} else if (import.meta.url === pathToFileURL(resolve(process.argv[1] ?? '')).href) {
  const { values: o } = parseArgs({ options: { manifest: { type: 'string' }, out: { type: 'string' }, workers: { type: 'string', default: '6' } } });
  if (!o.manifest || !o.out) throw Error('Name the candidate/case manifest and disposable output folder');
  const manifest = read(o.manifest);
  manifest.cases ??= developmentCases();
  manifest.code = { build: BUILD_IDENTITY, commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() };
  mkdirSync(o.out, { recursive: true }); writeFileSync(`${o.out}/manifest.json`, JSON.stringify(manifest) + '\n');
  const results = await workerJobs(manifest.candidates.map(candidate => ({ manifest, candidate })), {
    lanes: Number(o.workers), create: () => new Worker(new URL(import.meta.url)),
    result: answer => { const result = answer.result; writeFileSync(`${o.out}/${result.candidate.id}.json`, JSON.stringify(result) + '\n');
      console.log(JSON.stringify(result.summary)); return result.summary; },
  });
  const valid = results.every(result => result.fixtures === result.cases);
  const stopTrained = manifest.stopTrained === true;
  results.sort((a, b) => (stopTrained ? a.totalFalls - b.totalFalls : a.falls - b.falls)
    || b.entryRate - a.entryRate || (stopTrained ? b.stops - a.stops : 0) || b.held - a.held);
  const rank = stopTrained ? ['whole-trial falls', 'entry rate', 'stops', 'mean held speed']
    : ['before-stop falls', 'entry rate', 'mean held speed'];
  writeFileSync(`${o.out}/ranking.json`, JSON.stringify({ valid, rank, results }) + '\n');
  if (!valid) { console.error('The development fixtures must all reach their stated starts before checkpoints are ranked'); process.exitCode = 1; }
}
