/** Residual policy development screen; entry/hold readings omit stopping and loadout confirmation. */
import { parseArgs } from 'node:util';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { residualEnvironment } from './residual-environment.mjs';
import { recoveryNetwork } from '../../../src/core/math/learning/recovery-network.ts';

const { values: o } = parseArgs({ options: { config: { type: 'string' }, policy: { type: 'string' },
  out: { type: 'string' }, starts: { type: 'string', default: '2.2,4.2,5.8' }, seconds: { type: 'string' },
  'from-rest': { type: 'boolean' }, poses: { type: 'boolean' }, contacts: { type: 'boolean' } } });
if (!o.config || !o.out) throw Error('--config and --out name the pretraining protocol and saved rows');
const config = JSON.parse(readFileSync(o.config, 'utf8'));
const settings = { ...JSON.parse(readFileSync(config.environment, 'utf8')), ...config, trace: true, poses: o.poses === true, contacts: o.contacts === true,
  ...(o.seconds === undefined ? o['from-rest'] ? { seconds: 14 } : {} : { seconds: Number(o.seconds) }) };
const policyBytes = o.policy ? readFileSync(o.policy) : null;
const policy = policyBytes ? recoveryNetwork(JSON.parse(policyBytes)) : () => new Array(12).fill(0);
const env = await residualEnvironment(settings), trials = [];
try {
  for (const start of o['from-rest'] ? [0] : o.starts.split(',').map(Number)) {
    let observation = await env.reset({ start, fromRest: o['from-rest'] });
    const initial = env.reading(), samples = [];
    let result;
    do {
      result = env.step(policy(observation), { squashed: true });
      samples.push(...result.samples); observation = result.observation;
    } while (!result.terminated && !result.truncated);
    let held = Infinity, reachedAt = null;
    for (let i = 119; i < samples.length; i++) {
      const speed = samples.slice(i - 119, i + 1).reduce((sum, sample) => sum + sample.velocity[2], 0) / 120;
      if (o['from-rest'] && samples[i].time <= 4 && speed >= 4) reachedAt ??= samples[i].time;
      if (!o['from-rest'] || (samples[i].time >= 4 && samples[i].time <= 14)) held = Math.min(held, speed);
    }
    const corridor = Math.max(...samples.map(sample => Math.abs(sample.centre[0] - initial.lineX)));
    const along = samples.reduce((sum, sample) => sum + sample.velocity[2], 0) / samples.length;
    const controlAlong = samples.reduce((sum, sample) => sum + sample.control.velocity[2], 0) / samples.length;
    const row = { start, initial, ...result.info, controlAlong, along, corridor, held: Number.isFinite(held) ? held : null,
      terminated: result.terminated, truncated: result.truncated, samples };
    if (o['from-rest']) {
      const enteredAt = samples.find(sample => sample.running)?.time ?? null;
      row.entryAndHold = { reachedAt, enteredAt,
        complete: enteredAt !== null && enteredAt <= 4 && !result.terminated && samples.length >= 14 * 120
          && reachedAt !== null && held >= 4 && corridor <= 1 };
    }
    trials.push(row);
    const { samples: _, initial: __, ...summary } = row; console.log(JSON.stringify(summary));
  }
  const trees = ['src', 'assets', 'vendor', 'tests'];
  const code = { trees: Object.fromEntries(trees.map(path => [path,
    execFileSync('git', ['rev-parse', `HEAD:${path}`], { encoding: 'utf8' }).trim()])),
    diff: execFileSync('git', ['diff', 'HEAD', '--', ...trees], { encoding: 'utf8' }), node: process.version,
    reader: createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex'),
    environment: createHash('sha256').update(readFileSync(new URL('./residual-environment.mjs', import.meta.url))).digest('hex') };
  writeFileSync(o.out, JSON.stringify({ protocol: 'residual development screen, physical COM at 120 Hz', settings,
    harness: env.harness, layout: env.layout, code,
    calibration: { settings: JSON.parse(readFileSync(settings.settings, 'utf8')), stride: JSON.parse(readFileSync(settings.stride, 'utf8')) },
    policy: o.policy ?? null, policyHash: policyBytes ? createHash('sha256').update(policyBytes).digest('hex') : null, trials }) + '\n');
} finally { env.dispose(); }
