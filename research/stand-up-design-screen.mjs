import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { recoveryEnvironment } from './stand-up-environment.mjs';
import { recoveryDesign, recoveryDesignTable } from './stand-up-design.mjs';

/** Declared finite screening cells; all use the unchanged support-recovery controller. */
const CELLS = Object.freeze([
  Object.freeze({ contact: 'baseline' }), Object.freeze({ contact: 'shoe' }),
  Object.freeze({ contact: 'shoe', strength: 1.5 }), Object.freeze({ contact: 'shoe', strength: 3 }),
  Object.freeze({ contact: 'shoe', speed: 2 }), Object.freeze({ contact: 'shoe', weight: .6 }),
]);

export async function screenRecoveryDesigns({ seconds = 40, model = 'workshop-fighter', held = 'empty', onTrial } = {}) {
  const rows = [];
  for (const cell of CELLS) for (const degrees of [0, 90]) {
    const configuration = { model, held, ...cell }, started = performance.now();
    const e = await recoveryEnvironment({ ...configuration, spec: recoveryDesign(configuration) });
    const effort = e.channels.map(() => 0), bound = e.channels.map(() => 0);
    let error = null;
    try {
      await e.fall({ degrees });
      if (e.result().takeover !== null) for (let k = 0; k < Math.ceil(seconds * 120); k++) {
        const row = e.step();
        for (let i = 0; i < effort.length; i++) {
          effort[i] = Math.max(effort[i], Math.abs(row.observation.joints[i].effort));
          bound[i] = Math.max(bound[i], row.observation.joints[i].positive, row.observation.joints[i].negative);
        }
        if (row.result.success || row.result.failure) break;
      }
    } catch (caught) { error = String(caught.stack ?? caught); }
    const row = { configuration, recipe: { kind: 'lab', degrees, shoves: [60, 60], spacing: 24 }, identity: e.identity,
      design: recoveryDesignTable(configuration), outcome: error ? 'invalid' : !e.result().fell ? 'no fall' : e.result().success ? 'recovered' : 'failed',
      result: e.result(), error, measured: e.channels.map((c, i) => ({ name: c.name, peakEffort: effort[i], peakMotorBound: bound[i] })),
      compute: { steps: e.stand.world.steps, milliseconds: performance.now() - started } };
    e.dispose(); rows.push(row); onTrial?.(row);
  }
  return { harness: 'Node Stance Lab recovery search', cells: CELLS, seconds, model, held, rows };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { values } = parseArgs({ options: { output: { type: 'string' }, seconds: { type: 'string' }, model: { type: 'string' }, held: { type: 'string' } } });
  if (!values.output) throw new Error('design screening needs an output path');
  mkdirSync(dirname(values.output), { recursive: true });
  const result = await screenRecoveryDesigns({ ...values, seconds: Number(values.seconds ?? 40), onTrial: row => {
    console.log(JSON.stringify({ configuration: row.configuration, degrees: row.recipe.degrees, outcome: row.outcome, result: row.result, compute: row.compute }));
  } });
  writeFileSync(values.output, JSON.stringify(result, null, 2));
}
