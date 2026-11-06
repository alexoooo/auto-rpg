/** One current Travel case through Option Mind, with physical readings and gait handover state. */
import '../../../tests/harness/preload-data.mjs';
import { parseArgs } from 'node:util';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { EVALUATIONS, LONE_WORLD } from '../../../src/app/node/evaluation.ts';

const { values: o } = parseArgs({ options: {
  out: { type: 'string' }, mode: { type: 'string', default: 'forward' },
  way: { type: 'string', default: '0' }, sense: { type: 'string', default: '1' },
  seed: { type: 'string', default: '1' }, gusts: { type: 'boolean' },
} });
if (!o.out) throw Error('--out names the retained reading');
const drill = EVALUATIONS.travel, protocol = drill.protocols.minimum;
const condition = protocol.conditions.find(c => c.mode === o.mode && c.way === Number(o.way)
  && c.sense === Number(o.sense) && c.seed === Number(o.seed) && c.gusts === Boolean(o.gusts)
  && c.loadout.left === 'empty' && c.loadout.right === 'empty');
if (!condition) throw Error('arguments must select a minimum-protocol empty-handed case');
const subject = drill.subjects([])[0];
const recipe = protocol.world([subject.value], condition, protocol.engine, [subject.character ?? {}]);
const built = await LONE_WORLD.build(recipe);
if ('refused' in built) throw Error(built.refused);

// Shared gait instances appear under more than one slot; retain each physical state once.
function handovers(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return [];
  seen.add(value);
  return Object.entries(value).flatMap(([key, child]) => key === 'walkRun'
    ? seen.has(child) ? [] : (seen.add(child), [structuredClone(child)]) : handovers(child, seen));
}
const snapshots = [], start = performance.now();
try {
  const reader = protocol.read(built, condition);
  let steps = 0;
  while (!reader.ended) {
    built.world.step(); reader.afterStep(); steps++;
    if (steps % built.world.hz === 0) snapshots.push({ seconds: steps / built.world.hz,
      activity: built.body.body.has, handovers: handovers(built.body.minded.state) });
  }
  const result = { harness: { name: 'Node lone world', engine: protocol.engine, hz: built.world.hz, balance: 0 },
    revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    worktree: execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }),
    condition, recipe, reading: reader.reading(), snapshots, wallSeconds: (performance.now() - start) / 1000 };
  writeFileSync(o.out, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ reading: result.reading, wallSeconds: result.wallSeconds }));
} finally { built.dispose(); }
