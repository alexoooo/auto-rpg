/**
 * **A straight punch's records**: each body's searched schedule (`research/punch-drill.mjs` results)
 * as the straight punch's settings for both hands, the left mirrored from the right, with the
 * drive's settings the search played it with (`AROUND`), where it is admitted (`reach`, `band`, `aside` and `above`:
 * where the steered punch lands, read on held-out trials, `punch-policy-check.mjs`; `aside` of
 * the punching shoulder's line, `squared`), and, with `--policy`, the steer's trained network
 * (`research/run-train.py`'s `policy.json`), written as the core reads them (`PunchRecord`,
 * `src/core/skills/strikes/punch-records.ts`) into `<out>.json` (`assets/core/straight-punch` where not
 * given), each by its body's key (`bodyKey`: `workshop-fighter+toes`) beside the records already
 * there, and the bodies with one into `<out>.meta.json`. With `--halts`, the punch stops a walk at
 * once as it commits (`StraightPunch.halts`), as it was trained. A held blow's schedule (one searched
 * with `--blow <kind>`) is written as its blow's record (`HeldBlowRecord`, `assets/core/<kind>`
 * where `--out` is not given), its network read by its blow's layout.
 *
 *   node research/punch-export.mjs [--policy <policy.json>] --made "<how it was made>" [--halts] [--out <path>] <bodyKey>=<schedule.json>@<reach>,<band>,<aside>,<above> [...]
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { PUNCH_ACTIONS } from '../src/core/skills/strikes/learned-punch.ts';
import { HELD_BLOWS } from '../src/core/skills/strikes/held-blow.ts';
import { AROUND, decode, mirrored } from './punch-drill.mjs';

/**
 * The longest a punch's drive runs, s: a still blow touches by 0.19 s, and a drive that chases a foe
 * stepping back for longer carries its body over. A held blow keeps the search's (`AROUND`): drawn
 * back, it touches later.
 */
const LONGEST = 0.3;

const { values, positionals } = parseArgs({ options: { policy: { type: 'string' }, made: { type: 'string' }, halts: { type: 'boolean' }, out: { type: 'string' } }, allowPositionals: true });
if (!values.made || !positionals.length) throw new Error('usage: [--policy <policy.json>] --made <text> <bodyKey>=<schedule.json>@<reach>,<band>,<aside>,<above> ...');
const blows = new Set(positionals.map((pair) => JSON.parse(readFileSync(pair.split('=')[1].split('@')[0], 'utf8')).cell.blow ?? null));
if (blows.size !== 1) throw new Error(`one skill's records at a time, not ${[...blows].join(', ')}`);
const blow = [...blows][0], out = values.out ?? (blow ? `assets/core/${blow}` : 'assets/core/straight-punch');
const actions = blow ? HELD_BLOWS[blow].layout.outputs.length : PUNCH_ACTIONS;
const policy = values.policy ? JSON.parse(readFileSync(values.policy, 'utf8')) : null;
if (policy && policy.actions !== actions) throw new Error(`${values.policy}: ${policy.actions} outputs, not the layout's ${actions}`);
const records = existsSync(`${out}.json`) ? JSON.parse(readFileSync(`${out}.json`, 'utf8')) : {};
for (const pair of positionals) {
  const [model, rest] = pair.split('='), [file, window] = rest.split('@'), [reach, band, aside, above] = (window ?? '').split(',').map(Number);
  if (!(reach > 0 && band > 0 && aside > 0 && Number.isFinite(above))) throw new Error(`${pair}: name where the punch is admitted, <schedule.json>@<reach>,<band>,<aside>,<above>`);
  const found = JSON.parse(readFileSync(file, 'utf8')), cell = found.cell, flags = { driven: !!cell.driven, fire: !!cell.fire, brake: !!cell.brake, ease: !!cell.ease, wrist: !!cell.blow, free: !!cell.free, chamber: !!cell.chamber };
  const sided = (hand) => {
    const x = [...found.best.x];
    if (hand !== cell.hand) mirrored(x, cell.hand, hand, flags.wrist);
    return decode(x, hand, cell.gap ?? undefined, new Set((cell.without ?? []).map((c) => hand === cell.hand ? c : c.replace(`.${cell.hand} `, `.${hand} `))), flags);
  };
  const right = sided('right'), left = sided('left');
  if (right.driven) throw new Error(`${file}: a learned punch's schedule drives no point`);
  const settings = { ...AROUND, longest: blow ? AROUND.longest : LONGEST, reach, band, aside, squared: true, above, lead: right.lead, through: right.through, ...right.beneath, ...(right.fire === undefined ? {} : { fire: right.fire }),
    ...(right.brake === undefined ? {} : { brake: right.brake }), ...(right.ease === undefined ? {} : { ease: right.ease }), ...(values.halts ? { halts: true } : {}),
    timed: { left: left.pushes, right: right.pushes }, ...(policy ? { steered: true } : {}) };
  records[model] = { made: values.made, settings, network: policy ? { actions: policy.actions, layers: policy.layers } : null };
}
writeFileSync(`${out}.json`, JSON.stringify(records) + '\n');
writeFileSync(`${out}.meta.json`, JSON.stringify({ bodies: Object.keys(records) }) + '\n');
console.log(`records ${Object.keys(records).join(', ')}`);
