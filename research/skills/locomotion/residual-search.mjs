/**
 * Phase-dependent sagittal residual search; a development screen, excluding stops and equipment.
 * --config names the residual environment wrapper; --out prefixes retained evidence.
 * --basis sine uses twelve coefficients; quadrature adds cosine, giving twenty-four.
 * --start reads unit-cube coefficients, zero residual at .5, each mapped to [-1,1].
 * --from selects the first rolling window's end; --seconds ends the run. Neither changes a gate.
 * --resume continues the saved CMA state and rows under the same protocol and code identity.
 */
import { isMainThread, parentPort, workerData } from 'node:worker_threads';
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { cmaSearch, workerPool } from '../../cma.mjs';
import { residualEnvironment, RESIDUAL_LAYOUT, residualLayout } from './residual-environment.mjs';
import { recoveryNetwork } from '../../../src/core/math/learning/recovery-network.ts';

const CHANNELS = [0, 3, 4, 6, 9, 10];
function networkAt(u, basis) {
  const names = basis === 'quadrature' ? ['phase sin', 'phase cos'] : ['phase sin'];
  const first = names.flatMap(phase => [1, -1].map(sign => RESIDUAL_LAYOUT.inputs.map(name => name === phase ? sign : 0)));
  return { actions: 12, layers: [{ weights: first, bias: new Array(first.length).fill(0) },
    { weights: RESIDUAL_LAYOUT.outputs.map((_, i) => {
      const j = CHANNELS.indexOf(i);
      return first.map((_, k) => j < 0 ? 0 : 2 * u[first.length * j + k] - 1);
    }), bias: new Array(12).fill(0) }] };
}

if (!isMainThread) {
  const env = await residualEnvironment({ ...workerData, trace: true, poses: false });
  parentPort.on('message', async ({ id, x: u }) => {
    try {
      const policy = recoveryNetwork(networkAt(u, workerData.basis));
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
      // Partial survival guides development but ranks below every completed forward run.
      parentPort.postMessage({ id, r: { score: complete ? Math.max(0, held) : -1 + Math.min(1, count / (workerData.seconds * 120)),
        held: Number.isFinite(held) ? held : null, enteredAt, complete, harness: env.harness, ...result.info } });
    } catch (error) { parentPort.postMessage({ id, r: { error: String(error.stack ?? error), score: -1 } }); }
  });
} else {
  const { values: o } = parseArgs({ options: { config: { type: 'string' }, out: { type: 'string' },
    generations: { type: 'string', default: '2' }, lambda: { type: 'string', default: '24' },
    sigma: { type: 'string', default: '.02' }, workers: { type: 'string', default: '8' },
    from: { type: 'string', default: '4' }, seconds: { type: 'string', default: '14' }, start: { type: 'string' },
    resume: { type: 'boolean' }, basis: { type: 'string', default: 'sine' } } });
  if (!o.config || !o.out) throw Error('--config and --out name calibration and retained search evidence');
  const config = JSON.parse(readFileSync(o.config, 'utf8'));
  const settings = { ...JSON.parse(readFileSync(config.environment, 'utf8')), ...config,
    seconds: Number(o.seconds), creditFrom: Number(o.from), basis: o.basis };
  if (!['sine', 'quadrature'].includes(settings.basis)) throw Error('basis is sine or quadrature');
  const dimensions = CHANNELS.length * (settings.basis === 'quadrature' ? 4 : 2);
  if (!(settings.creditFrom >= 1 && settings.seconds > settings.creditFrom) || !Number.isFinite(settings.seconds)) throw Error('the credit window follows entry and precedes the episode end');
  const hash = file => createHash('sha256').update(readFileSync(file)).digest('hex');
  const identity = { settings, layout: residualLayout(settings.residual), channels: CHANNELS,
    code: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    diff: execFileSync('git', ['diff', 'HEAD'], { encoding: 'utf8' }),
    search: hash(new URL(import.meta.url)), environment: hash(new URL('./residual-environment.mjs', import.meta.url)),
    calibration: { cycle: JSON.parse(readFileSync(settings.settings, 'utf8')), stride: JSON.parse(readFileSync(settings.stride, 'utf8')) } };
  const saved = o.resume ? JSON.parse(readFileSync(o.out + '-checkpoint.json', 'utf8')) : null;
  if (o.resume && o.start) throw Error('--resume uses the saved start');
  if (saved && JSON.stringify(JSON.parse(readFileSync(o.out + '-protocol.json', 'utf8'))) !== JSON.stringify(identity))
    throw Error('residual checkpoint protocol, calibration or code differs');
  if (!saved) writeFileSync(o.out + '-protocol.json', JSON.stringify(identity) + '\n');
  const pool = workerPool(new URL(import.meta.url), settings, Number(o.workers));
  const score = async u => {
    const row = await pool.evaluate(u);
    if (row.error) throw Error(row.error);
    appendFileSync(o.out + '-rows.jsonl', JSON.stringify({ u, ...row }) + '\n');
    return row;
  };
  try {
    const previous = saved ? JSON.parse(readFileSync(o.out + '-baseline.json', 'utf8')) : null;
    const start = previous?.u ?? (o.start ? JSON.parse(readFileSync(o.start, 'utf8')) : new Array(dimensions).fill(.5));
    if (start.length !== dimensions || !start.every(x => Number.isFinite(x) && x >= 0 && x <= 1))
      throw Error(`start needs ${dimensions} finite unit-cube coefficients for ${settings.basis}`);
    if (!saved) {
      const baseline = await score(start);
      writeFileSync(o.out + '-baseline.json', JSON.stringify({ u: start, network: networkAt(start, settings.basis), ...baseline }) + '\n');
      console.log(JSON.stringify({ baseline }));
    }
    await cmaSearch({ n: dimensions, start, sigma: Number(o.sigma), lambda: Number(o.lambda), generations: Number(o.generations), seed: 1, score, resume: saved,
      onGeneration: (entry, { best, checkpoint }) => {
        appendFileSync(o.out + '.jsonl', JSON.stringify({ ...entry, best: best.score, reading: best.r }) + '\n');
        writeFileSync(o.out + '-checkpoint.json', JSON.stringify(checkpoint) + '\n');
        writeFileSync(o.out + '-policy.json', JSON.stringify(networkAt(best.u, settings.basis)) + '\n');
        console.log(JSON.stringify({ ...entry, best: best.score, reading: best.r }));
      } });
  } finally { await pool.terminate(); }
}
