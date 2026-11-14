/** Map a retained entry policy's named inputs/outputs onto one travel actor; retain its hidden layers.
 * node research/skills/locomotion/travel-seed.mjs --seed research/runs/warrior-travel/restored-entry --out .tmp/warrior-travel/unified
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';
import { parseArgs } from 'node:util';
import { availableParallelism } from 'node:os';
import assert from 'node:assert/strict';
import { sourced } from '../../../src/core/quantity.ts';
import { TRAVEL_LAYOUT } from '../../../src/skills/locomotion/walk-run/walk-run/learned-run.ts';
import { travelCurriculum } from './travel-curriculum.mjs';

const { values: o } = parseArgs({ options: { seed: { type: 'string' }, out: { type: 'string' } } });
if (!o.seed || !o.out) throw Error('Travel seed transfer names a retained seed folder and disposable output');
const destination = relative(resolve('.tmp'), resolve(o.out));
if (destination.startsWith('..') || isAbsolute(destination) || !destination) throw Error('Travel transfer output belongs in .tmp/<task>/');
const read = file => JSON.parse(readFileSync(`${o.seed}/${file}`, 'utf8'));
const source = read('policy.json'), layout = read('layout.json'), settings = read('selected-settings.json');
assert.deepEqual(TRAVEL_LAYOUT.inputs.slice(0, layout.inputs.length), layout.inputs);
assert.deepEqual(TRAVEL_LAYOUT.outputs.slice(0, layout.outputs.length), layout.outputs);
const inputs = TRAVEL_LAYOUT.inputs.map(name => layout.inputs.indexOf(name)), outputs = TRAVEL_LAYOUT.outputs.map(name => layout.outputs.indexOf(name));
const last = source.layers.at(-1), travel = { ...source, actions: outputs.length, layers: source.layers.map((layer, k) => k === 0
  ? { weights: layer.weights.map(row => inputs.map(i => i < 0 ? 0 : row[i])), bias: layer.bias.slice() }
  : k === source.layers.length - 1 ? { weights: outputs.map(i => i < 0 ? new Array(last.weights[0].length).fill(0) : layer.weights[i].slice()),
    bias: outputs.map(i => i < 0 ? 0 : layer.bias[i]) } : layer),
  ...(source.normalization ? { normalization: { ...source.normalization,
    mean: inputs.map(i => i < 0 ? 0 : source.normalization.mean[i]), scale: inputs.map(i => i < 0 ? 1 : source.normalization.scale[i]) } } : {}) };
const old = settings.learned;
settings.learned = { travel, reference: old.reference, velocityScale: old.velocityScale, referenceScale: old.referenceScale,
  interval: old.interval, entry: old.entry, trim: old.trim, stanceScale: { height: .03, heading: .15 } };
settings.envelope = { ...settings.envelope, ways: { ...settings.envelope.ways,
  forward: sourced(6.5, 'm/s', 'travel-training-ceiling', 'maximum requested curriculum pace') }, tried: null };
mkdirSync(o.out, { recursive: true });
const write = (name, data) => writeFileSync(`${o.out}/${name}`, JSON.stringify(data) + '\n');
write('settings.json', settings); write('layout.json', { ...TRAVEL_LAYOUT, interval: old.interval });
write('environment.json', { kind: 'travel-orders', settings: `${o.out}/settings.json`, scripts: travelCurriculum(1) });
write('config.json', { environment: `${o.out}/environment.json`, workers: availableParallelism(), each: 1, seed: 703 });
console.log(JSON.stringify({ out: o.out, inputs: inputs.length, actions: outputs.length, hidden: source.layers[0].bias.length,
  start: `${o.seed}/policy.json`, sourceLayout: `${o.seed}/layout.json`, workers: availableParallelism() }));
