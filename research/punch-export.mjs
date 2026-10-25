/**
 * **A learned punch's data**: each body's searched schedule (`research/punch-drill.mjs` results)
 * as the straight punch's settings for both hands, the left mirrored from the right, with the
 * drive's settings the search played it with (`AROUND`), where it is admitted (`reach`, `band`, `aside` and `above`:
 * where the steered punch lands, read on held-out trials, `punch-policy-check.mjs`), and the
 * steer's trained network (`research/run-train.py`'s `policy.json`), written as the core reads them
 * (`PunchPolicy`, `src/core/skills/learned-punch.ts`): `assets/core/learned-punch.json`, and the bodies
 * it has settings for in `assets/core/learned-punch.meta.json`.
 *
 *   node research/punch-export.mjs --policy <policy.json> --made "<how it was made>" <model>=<schedule.json>@<reach>,<band>,<aside>,<above> [...]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { AROUND, decode, mirrored } from './punch-drill.mjs';

const { values, positionals } = parseArgs({ options: { policy: { type: 'string' }, made: { type: 'string' } }, allowPositionals: true });
if (!values.policy || !values.made || !positionals.length) throw new Error('usage: --policy <policy.json> --made <text> <model>=<schedule.json>@<reach>,<band>,<aside>,<above> ...');
const policy = JSON.parse(readFileSync(values.policy, 'utf8'));
const bodies = {};
for (const pair of positionals) {
  const [model, rest] = pair.split('='), [file, window] = rest.split('@'), [reach, band, aside, above] = (window ?? '').split(',').map(Number);
  if (!(reach > 0 && band > 0 && aside > 0 && Number.isFinite(above))) throw new Error(`${pair}: name where the punch is admitted, <schedule.json>@<reach>,<band>,<aside>,<above>`);
  const found = JSON.parse(readFileSync(file, 'utf8')), cell = found.cell, flags = { driven: !!cell.driven, fire: !!cell.fire, brake: !!cell.brake, ease: !!cell.ease };
  const sided = (hand) => {
    const x = [...found.best.x];
    if (hand !== cell.hand) mirrored(x, cell.hand, hand);
    return decode(x, hand, cell.gap ?? undefined, new Set((cell.without ?? []).map((c) => hand === cell.hand ? c : c.replace(`.${cell.hand} `, `.${hand} `))), flags);
  };
  const right = sided('right'), left = sided('left');
  if (right.driven) throw new Error(`${file}: a learned punch's schedule drives no point`);
  bodies[model] = { ...AROUND, reach, band, aside, above, lead: right.lead, through: right.through, ...right.beneath, ...(right.fire === undefined ? {} : { fire: right.fire }),
    ...(right.brake === undefined ? {} : { brake: right.brake }), ...(right.ease === undefined ? {} : { ease: right.ease }),
    timed: { left: left.pushes, right: right.pushes } };
}
writeFileSync('assets/core/learned-punch.json', JSON.stringify({ made: values.made, bodies, actions: policy.actions, layers: policy.layers }) + '\n');
writeFileSync('assets/core/learned-punch.meta.json', JSON.stringify({ bodies: Object.keys(bodies) }) + '\n');
console.log(`bodies ${Object.keys(bodies).join(', ')}; ${policy.layers.length} layers`);
