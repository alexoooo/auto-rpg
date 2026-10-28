/**
 * **A learned punch's data**: each body's searched schedule (`research/punch-drill.mjs` results)
 * as the straight punch's settings for both hands, the left mirrored from the right, with the
 * drive's settings the search played it with (`AROUND`), where it is admitted (`reach`, `band`, `aside` and `above`:
 * where the steered punch lands, read on held-out trials, `punch-policy-check.mjs`; `aside` of
 * the punching shoulder's line, `squared`), and the
 * steer's trained network (`research/run-train.py`'s `policy.json`), written as the core reads them
 * (`PunchPolicy`, `src/core/skills/learned-punch.ts`): `<out>.json` (`assets/core/learned-punch` where
 * not given), and the bodies it has settings for in `<out>.meta.json`. With `--steered stance`,
 * the network's legs' outputs are asks of the stance (`PunchPolicy.steered`).
 *
 *   node research/punch-export.mjs --policy <policy.json> --made "<how it was made>" [--steered stance] [--out <path>] <model>=<schedule.json>@<reach>,<band>,<aside>,<above> [...]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { punchActions } from '../src/core/skills/learned-punch.ts';
import { AROUND, decode, mirrored } from './punch-drill.mjs';

/** The longest a drive runs, s: a still blow touches by 0.19 s, and a drive that chases a foe stepping back for longer carries its body over. */
const LONGEST = 0.3;

const { values, positionals } = parseArgs({ options: { policy: { type: 'string' }, made: { type: 'string' }, steered: { type: 'string' }, out: { type: 'string' } }, allowPositionals: true });
if (values.steered !== undefined && values.steered !== 'stance') throw new Error('--steered is stance or not given');
const out = values.out ?? 'assets/core/learned-punch';
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
  bodies[model] = { ...AROUND, longest: LONGEST, reach, band, aside, squared: true, above, lead: right.lead, through: right.through, ...right.beneath, ...(right.fire === undefined ? {} : { fire: right.fire }),
    ...(right.brake === undefined ? {} : { brake: right.brake }), ...(right.ease === undefined ? {} : { ease: right.ease }),
    timed: { left: left.pushes, right: right.pushes } };
}
if (policy.actions !== punchActions(values.steered ?? true)) throw new Error(`${values.policy}: ${policy.actions} outputs, not a steer laid out ${values.steered ?? 'by channel'}`);
writeFileSync(`${out}.json`, JSON.stringify({ made: values.made, bodies, ...(values.steered ? { steered: values.steered } : {}), actions: policy.actions, layers: policy.layers }) + '\n');
writeFileSync(`${out}.meta.json`, JSON.stringify({ bodies: Object.keys(bodies) }) + '\n');
console.log(`bodies ${Object.keys(bodies).join(', ')}; ${policy.layers.length} layers`);
