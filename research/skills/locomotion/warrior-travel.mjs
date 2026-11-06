/**
 * Forward travel on an open floor through the configured Option Mind, with its published caps.
 * Node lone world, gameplay engine and command delay, 120 Hz, Balance 0. Each output retains the
 * orders, body, mind, code identity and per-step centre-of-mass motion; this development screen
 * establishes only forward travel, heading entry and stopping, not the complete travel gate.
 *
 * node research/skills/locomotion/warrior-travel.mjs --out research/runs/warrior-travel/forward.json
 *   [--way 90] [--held club|sword|buckler+club|buckler+sword] [--seed 1] [--gusts]
 */
import '../../../tests/harness/preload-data.mjs';
import { parseArgs } from 'node:util';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { LONE_WORLD } from '../../../src/app/node/evaluation.ts';
import { defaultMind } from '../../../src/app/catalog.ts';
import { DEFAULT_ENGINE } from '../../../src/core/physics/engines.ts';
import { massCentreToRef, massOf } from '../../../src/core/bodies/read-motion.ts';
import { Vector3 } from '../../../src/core/math/vector.ts';
import { recordingKey } from '../../../src/core/world/recording.ts';

const { values: o } = parseArgs({ options: {
  out: { type: 'string' }, way: { type: 'string', default: '0' },
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
const start = 1, deadline = way % 360 === 0 ? 4 : 6, hold = 10, stop = start + deadline + hold, end = stop + 4;
const lone = { model: 'workshop-fighter', mind: defaultMind('workshop-fighter'), balance: 0,
  floorSize: 400, loadout: loadouts[o.held], seed, ...(o.gusts ? { gusts: true } : {}), script: [
    { at: start, orders: { move: { kind: 'direct', direction }, gait: 'run', pace: 4, face: null } },
    { at: stop, orders: { move: null, face: direction } },
  ] };
const built = await LONE_WORLD.build({ kind: 'lone', engine: DEFAULT_ENGINE, lone });
if ('refused' in built) throw Error(built.refused);
try {
  const { world, body } = built, parts = [...body.built.segments.values()], mass = massOf(parts);
  const centre = new Vector3(), work = new Vector3(), velocity = new Vector3(), rows = [];
  const atStart = new Vector3();
  let fellAt = null, projected = 0, reachedAt = null, leastHeld = Infinity, corridor = 0, stoppedAt = null;
  for (let step = 1; step <= Math.round(end * world.hz); step++) {
    world.step();
    massCentreToRef(parts, mass, centre, work, velocity);
    const time = world.time, along = velocity.x * direction.x + velocity.z * direction.z;
    if (step === Math.round(start * world.hz)) atStart.copyFrom(centre);
    if (body.body.down && fellAt === null) fellAt = time;
    projected += along / world.hz;
    rows.push({ time, centre: [centre.x, centre.y, centre.z], velocity: [velocity.x, velocity.y, velocity.z],
      projected, down: body.body.down, activity: body.body.has });
    if (time >= start) corridor = Math.max(corridor, Math.abs((centre.x - atStart.x) * direction.z - (centre.z - atStart.z) * direction.x));
    if (step >= world.hz) {
      const previous = rows[step - world.hz - 1];
      const speed = projected - (previous?.projected ?? 0);
      if (time >= start + 1 && time <= start + deadline && speed >= 4 && reachedAt === null) reachedAt = time - start;
      if (time >= start + deadline + 1 && time <= stop) leastHeld = Math.min(leastHeld, speed);
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
  const reading = { reachedAt, held: Number.isFinite(leastHeld) ? leastHeld : null, corridor, fellAt,
    stopEntered: preStop >= 4, stoppedAt,
    met: reachedAt !== null && leastHeld >= 4 && corridor <= 1 && fellAt === null && preStop >= 4 && stoppedAt !== null };
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
  writeFileSync(o.out, JSON.stringify({ protocol: 'warrior-forward-development', engine: DEFAULT_ENGINE,
    hz: world.hz, delay: world.delay, commit: git('rev-parse', 'HEAD'), diff: git('diff', '--', 'src', 'assets'),
    body: recordingKey(body.built.spec), lone, reading, rows }) + '\n');
  console.log(JSON.stringify({ out: o.out, engine: DEFAULT_ENGINE, hz: world.hz, delay: world.delay, reading }));
} finally { built.dispose(); }
