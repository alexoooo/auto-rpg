/**
 * Phase-dependent sagittal residual search; a development screen, excluding stops and equipment.
 * --config names the residual environment wrapper; --out prefixes retained evidence.
 * --start reads twelve unit-cube coefficients, zero residual at .5, each mapped to [-1,1].
 * --from selects the first rolling window's end; --seconds ends the run. Neither changes a gate.
 */
import { isMainThread, parentPort, workerData } from 'node:worker_threads';
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { cmaSearch, workerPool } from '../../cma.mjs';
import { residualEnvironment, RESIDUAL_LAYOUT } from './residual-environment.mjs';
import { recoveryNetwork } from '../../../src/core/math/learning/recovery-network.ts';

const CHANNELS = [0, 3, 4, 6, 9, 10];
function networkAt(u) {
  const first = [1, -1].map(sign => RESIDUAL_LAYOUT.inputs.map(name => name === 'phase sin' ? sign : 0));
  return { actions: 12, layers: [{ weights: first, bias: [0, 0] },
    { weights: RESIDUAL_LAYOUT.outputs.map((_, i) => {
      const j = CHANNELS.indexOf(i);
      return j < 0 ? [0, 0] : [2 * u[2 * j] - 1, 2 * u[2 * j + 1] - 1];
    }), bias: new Array(12).fill(0) }] };
}

if (!isMainThread) {
  const env = await residualEnvironment({ ...workerData, trace: true, poses: false });
  parentPort.on('message', async ({ id, x: u }) => {
    try {
      const policy = recoveryNetwork(networkAt(u));
      let observation = await env.reset({ fromRest: true }), result, sum = 0, count = 0, held = Infinity, enteredAt = null;
      const window = new Float64Array(120);
      do {
        result = env.step(policy(observation), { squashed: true }); observation = result.observation;
        for (const sample of result.samples) {
          enteredAt ??= sample.running ? sample.time : null;
          const slot = count % 120; sum += sample.velocity[2] - window[slot]; window[slot] = sample.velocity[2]; count++;
          if (count >= 120 && sample.time >= workerData.creditFrom) held = Math.min(held, sum / 120);
        }
      } while (!result.terminated && !result.truncated);
      const complete = !result.terminated && count >= workerData.seconds * 120 && enteredAt !== null && enteredAt <= 4;
      parentPort.postMessage({ id, r: { score: complete ? Math.max(0, held) : 0,
        held: Number.isFinite(held) ? held : null, enteredAt, complete, harness: env.harness, ...result.info } });
    } catch (error) { parentPort.postMessage({ id, r: { error: String(error.stack ?? error), score: -1 } }); }
  });
} else {
  const { values: o } = parseArgs({ options: { config: { type: 'string' }, out: { type: 'string' },
    generations: { type: 'string', default: '2' }, lambda: { type: 'string', default: '24' },
    sigma: { type: 'string', default: '.02' }, workers: { type: 'string', default: '8' },
    from: { type: 'string', default: '4' }, seconds: { type: 'string', default: '14' }, start: { type: 'string' } } });
  if (!o.config || !o.out) throw Error('--config and --out name calibration and retained search evidence');
  const config = JSON.parse(readFileSync(o.config, 'utf8'));
  const settings = { ...JSON.parse(readFileSync(config.environment, 'utf8')), ...config,
    seconds: Number(o.seconds), creditFrom: Number(o.from) };
  if (!(settings.creditFrom >= 1 && settings.seconds > settings.creditFrom) || !Number.isFinite(settings.seconds)) throw Error('the credit window follows entry and precedes the episode end');
  const hash = file => createHash('sha256').update(readFileSync(file)).digest('hex');
  const identity = { settings, layout: RESIDUAL_LAYOUT, channels: CHANNELS,
    code: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    diff: execFileSync('git', ['diff', 'HEAD'], { encoding: 'utf8' }),
    search: hash(new URL(import.meta.url)), environment: hash(new URL('./residual-environment.mjs', import.meta.url)),
    calibration: { cycle: JSON.parse(readFileSync(settings.settings, 'utf8')), stride: JSON.parse(readFileSync(settings.stride, 'utf8')) } };
  writeFileSync(o.out + '-protocol.json', JSON.stringify(identity) + '\n');
  const pool = workerPool(new URL(import.meta.url), settings, Number(o.workers));
  const score = async u => {
    const row = await pool.evaluate(u);
    if (row.error) throw Error(row.error);
    appendFileSync(o.out + '-rows.jsonl', JSON.stringify({ u, ...row }) + '\n');
    return row;
  };
  try {
    const start = o.start ? JSON.parse(readFileSync(o.start, 'utf8')) : new Array(12).fill(.5), baseline = await score(start);
    writeFileSync(o.out + '-baseline.json', JSON.stringify({ u: start, network: networkAt(start), ...baseline }) + '\n');
    console.log(JSON.stringify({ baseline }));
    await cmaSearch({ n: 12, start, sigma: Number(o.sigma), lambda: Number(o.lambda), generations: Number(o.generations), seed: 1, score,
      onGeneration: (entry, { best, checkpoint }) => {
        appendFileSync(o.out + '.jsonl', JSON.stringify({ ...entry, best: best.score, reading: best.r }) + '\n');
        writeFileSync(o.out + '-checkpoint.json', JSON.stringify(checkpoint) + '\n');
        writeFileSync(o.out + '-policy.json', JSON.stringify(networkAt(best.u)) + '\n');
        console.log(JSON.stringify({ ...entry, best: best.score, reading: best.r }));
      } });
  } finally { await pool.terminate(); }
}
