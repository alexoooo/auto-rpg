/**
 * **One run trial, retained**: a trial of a body's run row (`move-drill.mjs`; Travel on the Warrior,
 * Locomotion `run` on the Rogue) by its name, from the cells' training twins (`--cell`, their own
 * cases), played through the cell's own subject (`option-drill`) at the game's rate with its physical
 * reading, its value as the cell values it and, each second, the body's activity and the walk and
 * run's handover state; with `--rows`, each step's centre of mass, its velocity and whether the body
 * is down. `--list` prints the trials' names.
 *
 *   node research/skills/locomotion/travel-case.mjs --out .tmp/<task>/case.json --trial '<name>' [--body workshop-fighter] [--loadout empty,empty] [--cell] [--settings walk-run.json] [--rows]
 *   node research/skills/locomotion/travel-case.mjs --list [--body workshop-rogue] [--cell]
 *
 * `--settings` is the run gait's research tuning (`walk`, `run`, `braking`, `stride`, `learned`).
 */
import '../../../tests/harness/preload-data.mjs';
import { parseArgs } from 'node:util';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { isRefused } from '../../../src/core/refusal.ts';
import { EVALUATIONS, WORLD_BUILDERS } from '../../../src/app/node/evaluation.ts';
import { DEFAULT_ENGINE } from '../../../src/core/physics/engines.ts';
import { massCentreToRef, massOf } from '../../../src/core/bodies/read-motion.ts';
import { Vector3 } from '../../../src/core/math/vector.ts';
import { FALL_PRICE, keep, trialValue } from '../../../src/evaluation/table/judge.ts';
import { drillTrials, subjectOf } from '../../drill-trials.mjs';
import { moveRow, moveValue } from './move-drill.mjs';

const { values: o } = parseArgs({ options: {
  out: { type: 'string' }, trial: { type: 'string' }, body: { type: 'string', default: 'workshop-fighter' }, loadout: { type: 'string' },
  cell: { type: 'boolean' }, settings: { type: 'string' }, list: { type: 'boolean' }, rows: { type: 'boolean' },
} });
const trials = moveRow({ body: o.body, skill: 'run', ...(o.loadout ? { loadout: o.loadout } : {}) }).cells.flatMap(cell => drillTrials(cell, o.cell ? 'cell' : 'twin'));
if (o.list) { for (const one of trials) console.log(`${one.name} ${one.drill}/${one.protocol} ${JSON.stringify(one.condition)}`); process.exit(0); }
if (!o.out || !o.trial) throw Error('--out names the retained reading and --trial the trial (--list names them)');
const trial = trials.find(one => one.name === o.trial);
if (!trial) throw Error(`no run trial ${o.trial} on ${o.body} (--list names them)`);
const subject = subjectOf(trial), evaluation = EVALUATIONS[trial.drill], cases = evaluation.protocols[trial.protocol];
const value = o.settings ? moveValue(subject.value, { gaits: { run: JSON.parse(readFileSync(o.settings, 'utf8')) } }) : subject.value;
const recipe = cases.world([value], trial.condition, cases.engine ?? DEFAULT_ENGINE, [subject.character ?? {}]);
if (isRefused(recipe)) throw Error(recipe.refused);
const builder = WORLD_BUILDERS[recipe.kind], built = await builder.build(recipe);
if (isRefused(built)) throw Error(built.refused);

// Shared gait instances appear under more than one slot; retain each physical state once.
function handovers(state, seen = new Set()) {
  if (!state || typeof state !== 'object' || seen.has(state)) return [];
  seen.add(state);
  return Object.entries(state).flatMap(([key, child]) => key === 'walkRun'
    ? seen.has(child) ? [] : (seen.add(child), [structuredClone(child)]) : handovers(child, seen));
}
const snapshots = [], rows = [], start = performance.now();
const parts = [...built.body.built.segments.values()], mass = massOf(parts), centre = new Vector3(), work = new Vector3(), velocity = new Vector3();
try {
  const reader = cases.read(built, trial.condition);
  let steps = 0;
  while (!reader.ended) {
    built.world.step(); reader.afterStep(); steps++;
    if (o.rows) {
      massCentreToRef(parts, mass, centre, work, velocity);
      rows.push({ time: built.world.time, centre: [centre.x, centre.y, centre.z], velocity: [velocity.x, velocity.y, velocity.z], down: built.body.body.down });
    }
    if (steps % built.world.hz === 0) snapshots.push({ seconds: steps / built.world.hz,
      activity: built.body.body.has, handovers: handovers(built.body.minded.state) });
  }
  const reading = reader.reading(), outcome = evaluation.outcome?.(reading).label ?? null;
  const result = { harness: { name: 'Node lone world', engine: cases.engine ?? DEFAULT_ENGINE, hz: built.world.hz },
    revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    worktree: execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }),
    trial, recipe, reading, outcome, value: trialValue(trial.judge.judge, { kept: keep(trial.judge, reading), outcome }, FALL_PRICE),
    snapshots, ...(o.rows ? { rows } : {}), wallSeconds: (performance.now() - start) / 1000 };
  writeFileSync(o.out, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ trial: trial.name, outcome, value: result.value, wallSeconds: result.wallSeconds }));
} finally { built.dispose(); }
