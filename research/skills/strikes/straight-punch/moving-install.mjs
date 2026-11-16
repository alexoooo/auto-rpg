/**
 * **`moving`'s trained steer installed in its record**: the network of a `research/run-train.py`
 * policy (`policy-<n>.json`), checked against `moving`'s layout (`MOVING_LAYOUT`), written into
 * `assets/skills/strikes/straight-punch/moving.json` for each body named, its settings `steered`,
 * and how it was made appended to its `made`. A body not named keeps its record as it is. With
 * `--remove`, each body named is left unsteered with no network.
 *
 *   node research/skills/strikes/straight-punch/moving-install.mjs --policy <policy.json> --made "<how it was made>" <model> [...]
 *   node research/skills/strikes/straight-punch/moving-install.mjs --remove <model> [...]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { MOVING_LAYOUT } from "../../../../src/skills/strikes/straight-punch/index.ts";

const FILE = 'assets/skills/strikes/straight-punch/moving.json';
const { values, positionals } = parseArgs({ options: { policy: { type: 'string' }, made: { type: 'string' }, remove: { type: 'boolean' } }, allowPositionals: true });
if (!positionals.length || (values.remove ? values.policy || values.made : !values.policy || !values.made))
  throw new Error('usage: --policy <policy.json> --made <text> <model> ... | --remove <model> ...');
const records = JSON.parse(readFileSync(FILE, 'utf8'));
let network = null;
if (!values.remove) {
  const { actions, layers, normalization, actionLimit } = JSON.parse(readFileSync(values.policy, 'utf8'));
  if (actions !== MOVING_LAYOUT.outputs.length) throw new Error(`${values.policy}: ${actions} outputs, not moving's layout's ${MOVING_LAYOUT.outputs.length}`);
  network = { actions, layers, ...(normalization ? { normalization } : {}), ...(actionLimit === undefined ? {} : { actionLimit }) };
}
for (const model of positionals) {
  const record = records[model];
  if (!record) throw new Error(`${model} has no record of moving`);
  record.network = network;
  record.settings = { ...record.settings, steered: !values.remove };
  if (values.made) record.made += values.made;
}
writeFileSync(FILE, JSON.stringify(records) + '\n');
console.log(positionals.map((model) => `${model}: ${values.remove ? 'unsteered' : `steered by ${values.policy}`}`).join('\n'));
