/** Several physical starts per phase; checkpoint selection reads every phase, the game's own orders among them. */
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
import { GOING } from '../../../src/skills/locomotion/move-part.ts';
import { STOCK_GAITS } from '../../../src/skills/locomotion/gaits.ts';
import { readTravel } from '../../../src/evaluation/travel/read.ts';
import { TRAVEL, travelScript } from '../../../src/evaluation/travel/protocol.ts';
import { traceOf } from '../../../src/evaluation/trace.ts';
import { travelEnvironment } from './travel-environment.mjs';
import { slowingCues, slowingSeconds, PLACE_NEAR, PLACE_SPARE } from './travel-curriculum.mjs';
import { workerJobs } from '../../worker-jobs.mjs';
import { BUILD_IDENTITY } from '../../../scripts/build-identity.mjs';

const read = path => JSON.parse(readFileSync(path, 'utf8'));
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const direction = heading => ({ x: sin(heading), z: cos(heading) });
const go = (heading, pace = 4) => ({ move: { kind: 'direct', direction: direction(heading) }, gait: 'run', pace, face: null });
const stop = heading => ({ move: null, face: direction(heading) });
const mean = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

/** A slowed run is met when its last two seconds average within this band of the order, none of it a second slower than `below` under it. */
const SLOW_BAND = { below: .3, above: .6 };
const MOVING = { headings: [.43, 3.73], at: [5.075, 5.325, 5.575, 5.825] };

/** Development headings and rest recipes differ from training's original quiet start; `slow` adds slowing orders or sequences (0 a stop) from the moving starts. */
export function developmentCases(slow = []) {
  const rests = [
    { settle: 1.4, yaw: -.12, lower: 0 },
    { settle: 2.1, yaw: .12, lower: .015 },
    { settle: 2.8, yaw: 0, lower: .03 },
  ];
  return [
    ...[.19, 1.27, 2.61, 4.43].flatMap((heading, h) => rests.map((rest, r) => ({
      id: `rest-${h}-${r}`, phase: 'entry', heading, ...rest, seed: 1103 + 13 * h + r,
    }))),
    ...MOVING.headings.flatMap((heading, h) => MOVING.at.map((at, p) => ({
      id: `moving-${h}-${p}`, phase: 'hold', heading, at, seed: 1301 + h,
    }))),
    ...slow.flatMap(item => MOVING.headings.flatMap((heading, h) => MOVING.at.map((at, p) => {
      const orders = Array.isArray(item) ? item : [item], key = orders.join('>');
      return { id: `slow-${key}-${h}-${p}`, phase: 'slow', key, orders, pace: orders.at(-1), heading, at, seed: 1301 + h };
    }))),
    ...GAME.headings.flatMap((heading, h) => GAME.paces.map((pace, k) => ({
      id: `pace-${pace}-${h}`, phase: 'pace', pace, heading, ...rests[(h + k) % rests.length], seed: 1501 + 7 * h + k,
    }))),
    ...GAME.headings.flatMap((heading, h) => GAME.places.map((way, k) => ({
      id: `place-${k}-${h}`, phase: 'place', way, heading, ...rests[(h + k) % rests.length], seed: 1601 + 7 * h + k,
    }))),
  ];
}

/**
 * The game's own orders, as the screen plays them: starts from a stand at the paces the navigator
 * asks; places (a way of points, each [metres, degrees] from the last, the first from where the
 * body faces, a second leg a corner; `then`, a place ordered `at` s on instead) from a stand.
 */
const GAME = {
  headings: [.19, 1.27, 2.61, 4.43],
  paces: [1, 2, 3],
  places: [{ points: [[5, 0]] }, { points: [[10, 30]] }, { points: [[3, -90]] }, { points: [[7, 150]] },
    { points: [[6, 0], [4, 90]] }, { points: [[5, 20], [5, -90]] }, { points: [[9, 0]], then: { at: 2.5, points: [[6, -80]] } }],
};

function mindOf(tuning) {
  const base = defaultMind('workshop-fighter');
  return { ...base, tuning: { ...base.tuning, parts: { ...base.tuning?.parts, legs: { ...GOING,
    gaits: STOCK_GAITS.map(gait => gait.legs.kind === 'walk-run' ? { ...gait, legs: { ...gait.legs, tuning } } : gait) } } } };
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
/** Plays `program` from the case's reached moving start; no entry when the start was not reached. */
async function playMoving(basePath, policy, c, program) {
  const key = `${basePath}/${c.heading}/${c.seed}`;
  let env = moving.get(key);
  if (!env) {
    env = await travelEnvironment({ settings: basePath, heading: c.heading, seed: c.seed,
      warmPaces: [4], starts: MOVING.at, trace: true, scripts: [{ ...program, start: 'moving' }] });
    moving.set(key, env);
  }
  const id = `4/${c.at}`, entry = env.entries.find(one => one.id === id);
  if (!entry) return { entry: null, rejected: env.rejected.find(one => one.requested === c.at) };
  let observation = await env.reset({ program: { ...program, start: id } }), result;
  const initial = env.reading();
  for (;;) {
    result = env.step(policy(observation), { squashed: true }); observation = result.observation;
    if (result.terminated || result.truncated) break;
  }
  return { entry, initial, samples: env.samples(), hz: env.harness.hz };
}

async function slowCase(basePath, policy, c) {
  const item = c.orders ?? c.pace, cues = slowingCues(item, pace => go(c.heading, pace), stop(c.heading));
  const program = { seconds: slowingSeconds(item), cues };
  const { entry, rejected, initial, samples, hz } = await playMoving(basePath, policy, c, program);
  if (!entry) return { case: c, fixtureReached: false, rejected, beforeStop: { met: false, fall: false, held: null }, stop: { entered: false, met: false } };
  const forward = direction(c.heading), along = samples.map(s => s.velocity[0] * forward.x + s.velocity[2] * forward.z);
  const complete = samples.length === Math.round(program.seconds * hz), fall = samples.some(s => s.down);
  const corridor = samples.reduce((most, s) => Math.max(most,
    Math.abs((s.centre[0] - initial.centre[0]) * forward.z - (s.centre[2] - initial.centre[2]) * forward.x)), 0);
  const last = along.slice(-2 * hz), final = complete ? mean(last) : null;
  let slowest = Infinity;
  for (let i = 0; complete && i + hz <= last.length; i++) slowest = Math.min(slowest, mean(last.slice(i, i + hz)));
  if (c.pace > 0) {
    const met = complete && !fall && corridor <= TRAVEL.corridor && final <= c.pace + SLOW_BAND.above && slowest >= c.pace - SLOW_BAND.below;
    return { case: c, fixtureReached: true, entry, beforeStop: { met, complete, fall, final, slowest: complete ? slowest : null, corridor, held: null },
      stop: { entered: false, met: false, fall: false }, digest: digest(samples), played: samples.length / hz };
  }
  // A sequence ending in a stop is read by the stop gate: quiet from within TRAVEL.stop s of the order, for TRAVEL.quiet s.
  const ordered = Math.round(cues.at(-1).at * hz);
  let quiet = 0, quietFrom = null, stoppedAt = null;
  for (let i = ordered; i < samples.length; i++) {
    if (Math.hypot(samples[i].velocity[0], samples[i].velocity[2]) < TRAVEL.still && samples[i].standing) {
      quietFrom ??= (i + 1 - ordered) / hz; quiet++;
      if (quiet > TRAVEL.quiet * hz && quietFrom <= TRAVEL.stop) { stoppedAt = quietFrom; break; }
    } else { quiet = 0; quietFrom = null; }
  }
  const met = complete && !fall && corridor <= TRAVEL.corridor && stoppedAt !== null;
  return { case: c, fixtureReached: true, entry, beforeStop: { met, complete, fall, final, stoppedAt, corridor, held: null },
    stop: { entered: false, met: false, fall: false }, digest: digest(samples), played: samples.length / hz };
}

/** Plays `program` from a quiet rest after the case's settle, turned and lowered as it says. */
async function playRest(basePath, policy, c, program) {
  const env = await travelEnvironment({ settings: basePath, heading: c.heading, seed: c.seed, restTimes: [c.settle], yaws: [c.yaw], lowers: [c.lower],
    trace: true, scripts: [{ ...program, start: 'rest' }] });
  try {
    let observation = await env.reset({ program: { ...program, start: 'rest' } }), result;
    const initial = env.reading();
    for (;;) {
      result = env.step(policy(observation), { squashed: true }); observation = result.observation;
      if (result.terminated || result.truncated) break;
    }
    return { initial, samples: env.samples(), hz: env.harness.hz };
  } finally { env.dispose(); }
}

/** A start from a stand at a pace the navigator asks: met when its last 2 s average within `SLOW_BAND` of the pace, upright, in its corridor. */
async function paceCase(basePath, policy, c) {
  const program = { seconds: TRAVEL.start + 6, cues: [{ at: 0, orders: go(c.heading, c.pace) }] };
  const { initial, samples, hz } = await playRest(basePath, policy, c, program);
  const forward = direction(c.heading), along = samples.map(s => s.velocity[0] * forward.x + s.velocity[2] * forward.z);
  const complete = samples.length === Math.round(program.seconds * hz), fall = samples.some(s => s.down);
  const final = complete ? mean(along.slice(-2 * hz)) : null;
  const corridor = samples.reduce((most, s) => Math.max(most,
    Math.abs((s.centre[0] - initial.centre[0]) * forward.z - (s.centre[2] - initial.centre[2]) * forward.x)), 0);
  const met = complete && !fall && corridor <= TRAVEL.corridor && final >= c.pace - SLOW_BAND.below && final <= c.pace + SLOW_BAND.above;
  return { case: c, fixtureReached: true, beforeStop: { met, complete, fall, final, corridor, held: null },
    stop: { entered: false, met: false, fall: false }, digest: digest(samples), played: samples.length / hz };
}

/** A way's points from (0, 0), each [metres, degrees] turned from the leg before it, the first from `heading`. */
function wayOf(heading, legs) {
  let way = heading, x = 0, z = 0;
  return legs.map(([metres, degrees]) => { way += degrees * Math.PI / 180; x += metres * sin(way); z += metres * cos(way); return { x, z }; });
}
const lengthOf = points => points.reduce((sum, p, i) => sum + Math.hypot(p.x - (i ? points[i - 1].x : 0), p.z - (i ? points[i - 1].z : 0)), 0);
/** How far `at` is off the way from `from` through `points`, m. */
function offWay(at, from, points) {
  let least = Infinity;
  for (const to of points) {
    const dx = to.x - from.x, dz = to.z - from.z, l2 = dx * dx + dz * dz;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((at.x - from.x) * dx + (at.z - from.z) * dz) / l2)) : 0;
    least = Math.min(least, Math.hypot(at.x - from.x - t * dx, at.z - from.z - t * dz)); from = to;
  }
  return least;
}

/**
 * A place as the game orders it, by the run: met when the body ends upright, quiet `TRAVEL.quiet` s
 * and within half a metre of it, never more than `TRAVEL.corridor` off the way (once a second place
 * is ordered, off either way, the second's from where the order found the body). Every point is
 * from where the case began, as the game's are from where the order was given.
 */
async function placeCase(basePath, policy, c) {
  const place = points => ({ move: { kind: 'place', points, near: PLACE_NEAR }, gait: 'run', face: null });
  const first = wayOf(c.heading, c.way.points), then = c.way.then ? wayOf(c.heading, c.way.then.points) : null;
  const program = { seconds: PLACE_SPARE + lengthOf(first) + (then ? c.way.then.at + lengthOf(then) : 0),
    cues: [{ at: 0, orders: place(first) }, ...(then ? [{ at: c.way.then.at, orders: place(then) }] : [])] };
  const { initial, samples, hz } = await playRest(basePath, policy, c, program), o = { x: initial.centre[0], z: initial.centre[2] };
  const way = first.map(p => ({ x: o.x + p.x, z: o.z + p.z }));
  const changed = then ? Math.min(samples.length - 1, Math.round(c.way.then.at * hz)) : Infinity;
  const turned = then ? { x: samples[changed].centre[0], z: samples[changed].centre[2] } : null;
  const later = then ? then.map(p => ({ x: o.x + p.x, z: o.z + p.z })) : null;
  const end = (later ?? way).at(-1), fall = samples.some(s => s.down);
  let corridor = 0, arrivedAt = null;
  for (const [i, s] of samples.entries()) {
    const at = { x: s.centre[0], z: s.centre[2] };
    corridor = Math.max(corridor, i < changed ? offWay(at, o, way) : Math.min(offWay(at, o, way), offWay(at, turned, later)));
    if (arrivedAt === null && (!then || i >= changed) && Math.hypot(at.x - end.x, at.z - end.z) <= .5) arrivedAt = i / hz;
  }
  const quiet = samples.slice(-TRAVEL.quiet * hz), last = samples.at(-1), miss = Math.hypot(last.centre[0] - end.x, last.centre[2] - end.z);
  const still = quiet.length === TRAVEL.quiet * hz && quiet.every(s => s.standing && Math.hypot(s.velocity[0], s.velocity[2]) < TRAVEL.still);
  const met = !fall && still && miss <= .5 && corridor <= TRAVEL.corridor;
  return { case: c, fixtureReached: true, beforeStop: { met, fall, miss, still, arrivedAt, corridor, held: null },
    stop: { entered: false, met: false, fall: false }, digest: digest(samples), played: samples.length / hz };
}

async function holdCase(basePath, policy, c) {
  const program = { seconds: 14, cues: [{ at: 0, orders: go(c.heading) }, { at: 10, orders: stop(c.heading) }] };
  const { entry, rejected, initial, samples, hz } = await playMoving(basePath, policy, c, program);
  if (!entry) return { case: c, fixtureReached: false, rejected,
    beforeStop: { met: false, fall: false, entry: false, held: null, corridor: null }, stop: { entered: false, met: false } };
  const cut = 10 * hz, prefix = samples.slice(0, cut);
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
  for (const c of manifest.cases) rows.push(c.phase === 'entry' ? await entryCase(tuning, c)
    : c.phase === 'slow' ? await slowCase(settings, policy, c) : c.phase === 'pace' ? await paceCase(settings, policy, c)
    : c.phase === 'place' ? await placeCase(settings, policy, c) : await holdCase(settings, policy, c));
  const entries = rows.filter(row => row.case.phase === 'entry'), holds = rows.filter(row => row.case.phase === 'hold');
  const slows = rows.filter(row => row.case.phase === 'slow'), running = [...entries, ...holds];
  const summary = { id: candidate.id, cases: rows.length, fixtures: rows.filter(row => row.fixtureReached).length,
    falls: rows.filter(row => row.beforeStop.fall).length, entries: entries.filter(row => row.beforeStop.entry).length,
    entryCases: entries.length, entryRate: entries.filter(row => row.beforeStop.entry).length / entries.length,
    held: mean(running.map(row => row.beforeStop.held ?? 0)), entryHeld: mean(entries.map(row => row.beforeStop.held ?? 0)),
    movingHeld: mean(holds.map(row => row.beforeStop.held ?? 0)), movingMet: holds.filter(row => row.beforeStop.met).length,
    firstLeg: { left: entries.filter(row => row.beforeStop.firstLeg === 'left').length, right: entries.filter(row => row.beforeStop.firstLeg === 'right').length },
    slowCases: slows.length, slowMet: slows.filter(row => row.beforeStop.met).length, slowFalls: slows.filter(row => row.beforeStop.fall).length,
    slowFinal: mean(slows.map(row => row.beforeStop.final ?? 0)),
    paceCases: rows.filter(row => row.case.phase === 'pace').length, paceMet: rows.filter(row => row.case.phase === 'pace' && row.beforeStop.met).length,
    placeCases: rows.filter(row => row.case.phase === 'place').length, placeMet: rows.filter(row => row.case.phase === 'place' && row.beforeStop.met).length,
    met: rows.filter(row => row.beforeStop.met).length,
    stopFalls: rows.filter(row => row.stop.fall).length, stops: rows.filter(row => row.stop.met).length,
    totalFalls: rows.filter(row => row.beforeStop.fall || row.stop.fall).length };
  return { candidate, summary, settings: tuning, fixtureSettings: read(settings), cases: manifest.cases,
    code: manifest.code,
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
  manifest.cases ??= developmentCases(manifest.slow ?? []);
  manifest.code = { build: BUILD_IDENTITY, commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() };
  mkdirSync(o.out, { recursive: true }); writeFileSync(`${o.out}/manifest.json`, JSON.stringify(manifest) + '\n');
  const results = await workerJobs(manifest.candidates.map(candidate => ({ manifest, candidate })), {
    lanes: Number(o.workers), create: () => new Worker(new URL(import.meta.url)),
    result: answer => { const result = answer.result; writeFileSync(`${o.out}/${result.candidate.id}.json`, JSON.stringify(result) + '\n');
      console.log(JSON.stringify(result.summary)); return result.summary; },
  });
  const valid = results.every(result => result.fixtures === result.cases);
  // Every phase counts, whichever stage trained it: a checkpoint that loses one ranks below one that keeps it.
  results.sort((a, b) => a.totalFalls - b.totalFalls || b.met - a.met || b.stops - a.stops || b.held - a.held);
  const rank = ['whole-trial falls', 'cases met, every phase', 'stops', 'mean held speed'];
  writeFileSync(`${o.out}/ranking.json`, JSON.stringify({ valid, rank, results }) + '\n');
  if (!valid) { console.error('The development fixtures must all reach their stated starts before checkpoints are ranked'); process.exitCode = 1; }
}
