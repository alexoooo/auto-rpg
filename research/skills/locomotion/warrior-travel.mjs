/**
 * Travel on an open floor through the configured Option Mind, with its published caps.
 * Node lone world, gameplay engine and command delay, 120 Hz, Balance 0. Each output retains the
 * orders, body, mind, code identity and per-step centre-of-mass motion; this development screen
 * screens one movement case. A screen is not independent confirmation of its envelope.
 *
 * node research/skills/locomotion/warrior-travel.mjs --out research/runs/warrior-travel/forward.json
 *   [--mode forward|heading|facing|circle|corner|reverse] [--way 90] [--sense -1|1]
 *   [--pace 1] [--held club|sword|buckler+club|buckler+sword] [--seed 1] [--gusts]
 *   [--settings walk-run-record-settings.json]
 */
import '../../../tests/harness/preload-data.mjs';
import { parseArgs } from 'node:util';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { LONE_WORLD } from '../../../src/app/node/evaluation.ts';
import { defaultMind } from '../../../src/app/catalog.ts';
import { DEFAULT_ENGINE } from '../../../src/core/physics/engines.ts';
import { massCentreToRef, massOf } from '../../../src/core/bodies/read-motion.ts';
import { Quaternion, Vector3 } from '../../../src/core/math/vector.ts';
import { recordingKey } from '../../../src/core/world/recording.ts';
import { MOVE } from '../../../src/skills/locomotion/move-part.ts';
import { STOCK_GAITS } from '../../../src/skills/locomotion/gaits.ts';
import { stanceEnvelope } from '../../../src/skills/locomotion/stance/envelope.ts';
import { walkRunEnvelope } from '../../../src/skills/locomotion/walk-run/envelope.ts';

const { values: o } = parseArgs({ options: {
  out: { type: 'string' }, way: { type: 'string', default: '0' },
  mode: { type: 'string', default: 'forward' }, sense: { type: 'string', default: '1' }, pace: { type: 'string' },
  settings: { type: 'string' },
  held: { type: 'string', default: 'empty' }, seed: { type: 'string', default: '1' }, gusts: { type: 'boolean' },
} });
if (!o.out) throw Error('--out names the retained development reading');
const way = Number(o.way), seed = Number(o.seed);
if (!Number.isFinite(way) || !Number.isInteger(seed)) throw Error('way must be finite and seed an integer');
const loadouts = {
  empty: { left: 'empty', right: 'empty' }, club: { left: 'empty', right: 'club' },
  sword: { left: 'empty', right: 'sword' }, 'buckler+club': { left: 'buckler', right: 'club' },
  'buckler+sword': { left: 'buckler', right: 'sword' },
};
if (!Object.hasOwn(loadouts, o.held)) throw Error('held names a rated Warrior loadout');
const direction = { x: Math.sin(way * Math.PI / 180), z: Math.cos(way * Math.PI / 180) };
if (!['forward', 'heading', 'facing', 'circle', 'corner', 'reverse'].includes(o.mode)) throw Error('mode names a travel capability');
if (o.pace !== undefined && o.mode !== 'facing') throw Error('pace is declared only for facing-held travel');
const sense = Number(o.sense);
if (sense !== -1 && sense !== 1) throw Error('sense is -1 or 1');
if (o.mode === 'forward' && way % 360 !== 0) throw Error('use heading for travel away from forward');
const turning = ['circle', 'corner', 'reverse'].includes(o.mode), circle = o.mode === 'circle';
const pace = circle ? 2 : o.mode === 'facing' && way % 360 !== 0 ? Number(o.pace ?? 1) : 4;
if (!Number.isFinite(pace) || pace < 1) throw Error('a facing-held development pace is at least 1 m/s');
const start = 1, deadline = o.mode === 'heading' ? 6 : 4, hold = 10;
const cue = circle ? start + deadline : start + deadline + hold;
const transition = circle ? 2 * Math.PI : o.mode === 'corner' ? 5 : 7;
const finalAngle = circle ? sense * 2 * Math.PI : o.mode === 'corner' ? sense * Math.PI / 2 : sense * Math.PI;
const final = turning ? { x: Math.sin(finalAngle), z: Math.cos(finalAngle) } : direction;
const stop = turning ? cue + transition + (circle ? 2 : hold) : start + deadline + hold, end = stop + 4;
const moveOrder = (direction, pace) => ({ move: { kind: 'direct', direction }, gait: 'run', pace, face: o.mode === 'facing' ? { x: 0, z: 1 } : null });
const script = [{ at: start, orders: moveOrder(turning ? { x: 0, z: 1 } : direction, pace) }];
if (circle) {
  // The cue and its direction are stepped together, with no lag from a coarse heading script.
  for (let k = 0; k / 120 < transition; k++) {
    const angle = sense * k / 120;
    script.push({ at: cue + k / 120, orders: moveOrder({ x: Math.sin(angle), z: Math.cos(angle) }, pace) });
  }
  script.push({ at: cue + transition, orders: moveOrder(final, pace) });
} else if (turning) {
  script.push({ at: cue, orders: moveOrder(final, pace) });
}
script.push({ at: stop, orders: { move: null, face: o.mode === 'facing' ? { x: 0, z: 1 } : final } });
let mind = defaultMind('workshop-fighter');
const tuning = o.settings ? JSON.parse(readFileSync(o.settings, 'utf8')) : null;
if (tuning) {
  mind = { ...mind, tuning: { ...mind.tuning, parts: { ...mind.tuning?.parts, legs: { ...MOVE,
    gaits: STOCK_GAITS.map(gait => ({ ...gait, legs: { ...gait.legs, tuning } })) } } } };
}
const lone = { model: 'workshop-fighter', mind, balance: 0,
  floorSize: 400, loadout: loadouts[o.held], seed, ...(o.gusts ? { gusts: true } : {}), script };
const built = await LONE_WORLD.build({ kind: 'lone', engine: DEFAULT_ENGINE, lone });
if ('refused' in built) throw Error(built.refused);
try {
  const { world, body } = built, parts = [...body.built.segments.values()], mass = massOf(parts);
  const walkEnvelope = stanceEnvelope(body.built.spec), runEnvelope = tuning?.envelope ?? walkRunEnvelope(body.built.spec);
  const calibration = {
    walk: Object.fromEntries(Object.entries(walkEnvelope.ways).map(([way, quantity]) => [way, quantity.value])),
    run: Object.fromEntries(Object.entries(runEnvelope.ways).map(([way, quantity]) => [way, quantity.value])),
    runEligible: runEnvelope.ways.forward.value > walkEnvelope.ways.forward.value,
  };
  const centre = new Vector3(), work = new Vector3(), velocity = new Vector3(), rows = [];
  const rootName = body.built.spec.segments.find(segment => !body.built.spec.joints.some(joint => joint.child === segment.name)).name;
  const rootPart = body.built.segments.get(rootName), root = new Quaternion(), restInverse = Quaternion.Inverse(rootPart.rest);
  const atStart = new Vector3();
  let nextCue = 0, requested = turning ? { x: 0, z: 1 } : direction;
  let fellAt = null, projected = 0, reachedAt = null, leastHeld = Infinity, corridor = 0, stoppedAt = null, lag = 0, facingError = 0, route = null;
  for (let step = 1; step <= Math.round(end * world.hz); step++) {
    while (nextCue < script.length && Math.round(script[nextCue].at * world.hz) <= step - 1) {
      requested = script[nextCue].orders.move?.direction ?? requested;
      nextCue++;
    }
    world.step();
    massCentreToRef(parts, mass, centre, work, velocity);
    const time = world.time, along = velocity.x * requested.x + velocity.z * requested.z;
    rootPart.pose.rotation.multiplyToRef(restInverse, root);
    const yaw = Math.atan2(2 * (root.w * root.y + root.x * root.z), 1 - 2 * (root.x * root.x + root.y * root.y));
    if (o.mode === 'facing' && time >= start) facingError = Math.max(facingError, Math.abs(yaw));
    if (step === Math.round(start * world.hz)) atStart.copyFrom(centre);
    if (body.body.down && fellAt === null) fellAt = time;
    projected += along / world.hz;
    rows.push({ time, centre: [centre.x, centre.y, centre.z], velocity: [velocity.x, velocity.y, velocity.z],
      requested, projected, yaw, down: body.body.down, activity: body.body.has });
    if (!turning && time >= start) corridor = Math.max(corridor, Math.abs((centre.x - atStart.x) * direction.z - (centre.z - atStart.z) * direction.x));
    if (circle && time >= cue && time <= cue + transition) lag = Math.max(lag, Math.abs(Math.atan2(velocity.x * requested.z - velocity.z * requested.x, along)));
    if (step >= world.hz) {
      const previous = rows[step - world.hz - 1];
      const speed = projected - (previous?.projected ?? 0);
      if (time >= start + 1 && time <= start + deadline && speed >= pace && reachedAt === null) reachedAt = time - start;
      if (!turning && time >= start + deadline + 1 && time <= stop) leastHeld = Math.min(leastHeld, speed);
    }
  }
  // A valid stop stays below the limit for the complete two-second settling interval.
  const stopping = rows.filter(row => row.time >= stop);
  let quietFrom = null;
  for (const row of stopping) {
    const speed = Math.hypot(row.velocity[0], row.velocity[2]);
    if (speed < .15 && !row.down) quietFrom ??= row.time;
    else quietFrom = null;
    if (quietFrom !== null && row.time - quietFrom >= 2 && quietFrom - stop <= 2) { stoppedAt = quietFrom - stop; break; }
  }
  const preStop = rows[Math.round(stop * world.hz) - 1].projected - rows[Math.round((stop - 1) * world.hz) - 1].projected;
  const speedAt = time => {
    const i = Math.round(time * world.hz) - 1;
    return rows[i].projected - (rows[i - world.hz]?.projected ?? 0);
  };
  const minimum = (from, to) => {
    let value = Infinity;
    for (let k = Math.round((from + 1) * world.hz); k <= Math.floor(to * world.hz); k++) value = Math.min(value, speedAt(k / world.hz));
    return value;
  };
  let turnedAt = null, entryHeld = null;
  if (turning) {
    entryHeld = minimum(start + deadline, cue);
    if (circle) { entryHeld = speedAt(cue); leastHeld = minimum(cue - 1, stop); }
    else {
      for (let k = Math.round((cue + 1) * world.hz); k <= Math.round((cue + transition) * world.hz); k++)
        if (speedAt(k / world.hz) >= pace) { turnedAt = k / world.hz - cue; break; }
      leastHeld = minimum(cue + transition, stop);
      const origin = rows[Math.round(cue * world.hz) - 1].centre;
      for (const row of rows.filter(row => row.time >= cue + transition))
        corridor = Math.max(corridor, Math.abs((row.centre[0] - origin[0]) * final.z - (row.centre[2] - origin[2]) * final.x));
      for (const row of rows.filter(row => row.time >= start && row.time <= cue)) corridor = Math.max(corridor, Math.abs(row.centre[0] - atStart.x));
    }
  }
  const entryMade = reachedAt !== null && (!turning || entryHeld >= pace);
  if (o.mode === 'reverse' && entryMade) {
    let previous = rows[Math.round(cue * world.hz) - 1].yaw, turn = 0;
    for (const row of rows.filter(row => row.time > cue)) {
      turn += Math.atan2(Math.sin(row.yaw - previous), Math.cos(row.yaw - previous));
      previous = row.yaw;
      if (Math.abs(turn) >= Math.PI / 4) { route = Math.sign(turn); break; }
    }
  }
  const reading = { reachedAt, held: Number.isFinite(leastHeld) ? leastHeld : null, corridor: circle ? null : corridor, fellAt,
    entryMade, entryHeld, turnedAt, lag: circle ? lag : null, facingError: o.mode === 'facing' ? facingError : null,
    route, stopEntered: preStop >= pace, stoppedAt,
    met: entryMade && leastHeld >= pace && (circle ? lag <= 20 * Math.PI / 180 : corridor <= 1)
      && (o.mode !== 'facing' || facingError <= 20 * Math.PI / 180) && (o.mode !== 'reverse' || route === sense)
      && (!turning || circle || turnedAt !== null) && fellAt === null && preStop >= pace && stoppedAt !== null };
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
  writeFileSync(o.out, JSON.stringify({ protocol: 'warrior-travel-development',
    reader: createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex'),
    condition: { mode: o.mode, way, sense, pace, loadout: loadouts[o.held], seed, gusts: !!o.gusts }, engine: DEFAULT_ENGINE,
    hz: world.hz, delay: world.delay, commit: git('rev-parse', 'HEAD'), diff: git('diff', '--', 'src', 'assets'),
    body: recordingKey(body.built.spec), lone, calibration, reading, rows }) + '\n');
  console.log(JSON.stringify({ out: o.out, engine: DEFAULT_ENGINE, hz: world.hz, delay: world.delay, calibration, reading }));
} finally { built.dispose(); }
