/**
 * **A straight punch's records**: each body's searched schedule (`research/skills/strikes/straight-punch/punch-drill.mjs` results)
 * as the settings it was searched and confirmed with: its tuning for both hands, the left mirrored
 * from the right (`settingsOf`), over the body's record it played over (its window, pace, return
 * and the rest), and, with `--policy`, the steer's trained network (`research/run-train.py`'s
 * `policy.json`), written as the core reads them (`PunchRecord`,
 * `src/skills/strikes/straight-punch/data/records.ts`) into `<out>.json` (`assets/skills/strikes/straight-punch/straight-punch` where not
 * given), each by its body's key (`bodyKey`: `workshop-fighter+toes`) beside the records already
 * there, and the bodies with one into `<out>.meta.json`. With `--halts`, the punch stops a walk at
 * once as it commits (`StraightPunch.halts`), as it was trained. A held blow's schedule (one searched
 * with `--skill thrust`) is written as its blow's record (`HeldBlowRecord`, `assets/skills/strikes/<kind>/<kind>`
 * where `--out` is not given), its network read by its blow's layout. A body is written over the
 * record it has: one with none has no table cell, so no search on its drill.
 *
 *   node research/skills/strikes/straight-punch/punch-export.mjs [--policy <policy.json>] --made "<how it was made>" [--halts] [--out <path>] <bodyKey>=<search.json> [...]
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { PUNCH_ACTIONS } from "../../../../src/skills/strikes/learned-punch.ts";
import { HELD_BLOWS } from "../../../../src/skills/strikes/held-blow.ts";
import { SKILLS, settingsOf } from './punch-drill.mjs';

/** The network as the core reads it (`Network`): the actor, with training's observation transform and action clamp where it has them. */
const networkOf = ({ actions, layers, normalization, actionLimit }) =>
  ({ actions, layers, ...(normalization ? { normalization } : {}), ...(actionLimit === undefined ? {} : { actionLimit }) });

const { values, positionals } = parseArgs({ options: { policy: { type: 'string' }, made: { type: 'string' }, halts: { type: 'boolean' }, out: { type: 'string' } }, allowPositionals: true });
if (!values.made || !positionals.length) throw new Error('usage: [--policy <policy.json>] --made <text> <bodyKey>=<search.json> ...');
const skills = new Set(positionals.map((pair) => SKILLS[JSON.parse(readFileSync(pair.split('=')[1], 'utf8')).cell.skill]));
if (skills.size !== 1 || skills.has(undefined)) throw new Error(`one skill's records at a time, each a search of punch-drill.mjs, not ${[...skills].join(', ')}`);
const skill = [...skills][0], blow = skill === 'straight-punch' ? null : skill, out = values.out ?? `assets/skills/strikes/${skill}/${skill}`;
const actions = blow ? HELD_BLOWS[blow].layout.outputs.length : PUNCH_ACTIONS;
const policy = values.policy ? JSON.parse(readFileSync(values.policy, 'utf8')) : null;
if (policy && policy.actions !== actions) throw new Error(`${values.policy}: ${policy.actions} outputs, not the layout's ${actions}`);
const records = existsSync(`${out}.json`) ? JSON.parse(readFileSync(`${out}.json`, 'utf8')) : {};
for (const pair of positionals) {
  const [model, file] = pair.split('='), found = JSON.parse(readFileSync(file, 'utf8'));
  if (!records[model]) throw new Error(`${model} has no ${skill} record to write the search over`);
  const settings = { ...records[model].settings, ...settingsOf(found.best.x, found.cell), ...(values.halts ? { halts: true } : {}), ...(policy ? { steered: true } : {}) };
  records[model] = { made: values.made, settings, network: policy ? networkOf(policy) : null };
}
writeFileSync(`${out}.json`, JSON.stringify(records) + '\n');
writeFileSync(`${out}.meta.json`, JSON.stringify({ bodies: Object.keys(records) }) + '\n');
console.log(`records ${Object.keys(records).join(', ')}`);
