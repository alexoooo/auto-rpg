/** Development braking screen; an unreached entry speed cannot satisfy the stop gate. */
import { parseArgs } from 'node:util';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { residualEnvironment } from './residual-environment.mjs';
import { recoveryNetwork } from '../../../src/core/math/learning/recovery-network.ts';

const { values: o } = parseArgs({ options: { config: { type: 'string' }, policy: { type: 'string' },
  'braking-policy': { type: 'string' },
  out: { type: 'string' }, stop: { type: 'string', default: '14' }, 'stance-trace': { type: 'boolean' } } });
if (!o.config || !o.out) throw Error('--config and --out name the protocol and retained evidence');
const stop = Number(o.stop);
if (!Number.isInteger(stop) || stop < 1) throw Error('stop is a positive whole number of seconds after movement starts');
const config = JSON.parse(readFileSync(o.config, 'utf8'));
const settings = { ...JSON.parse(readFileSync(config.environment, 'utf8')), ...config, seconds: stop + 4, trace: true, contacts: true,
  ...(o['stance-trace'] ? { stanceTrace: true } : {}) };
const bytes = o.policy ? readFileSync(o.policy) : null;
const policy = bytes ? recoveryNetwork(JSON.parse(bytes)) : () => new Array(12).fill(0);
const brakeBytes = o['braking-policy'] ? readFileSync(o['braking-policy']) : null;
const brakingPolicy = brakeBytes ? recoveryNetwork(JSON.parse(brakeBytes)) : policy;
const env = await residualEnvironment(settings), samples = [];
try {
  let observation = await env.reset({ fromRest: true }), result, ordered = false;
  do {
    if (!ordered && samples.length >= stop * env.harness.hz) { env.halt(); ordered = true; }
    result = env.step((ordered ? brakingPolicy : policy)(observation), { squashed: true });
    observation = result.observation; samples.push(...result.samples);
  } while (!result.terminated && !result.truncated);
  const entry = samples.length >= stop * env.harness.hz
    ? samples.slice((stop - 1) * env.harness.hz, stop * env.harness.hz).reduce((n, s) => n + s.velocity[2], 0) / env.harness.hz : null;
  let quiet = null, settledAt = null;
  for (const s of samples) if (s.time > stop) {
    const standing = !s.physicalDown && !s.postureDown && Object.values(s.feet).some(contacts => contacts.some(c => c.impulse > 0 && c.normal[1] < -.5));
    if (standing && Math.hypot(s.velocity[0], s.velocity[2]) < .15) quiet ??= s.time;
    else quiet = null;
    if (quiet !== null && Math.round((s.time - quiet) * env.harness.hz) >= 2 * env.harness.hz
      && Math.round((quiet - stop) * env.harness.hz) <= 2 * env.harness.hz) { settledAt = quiet - stop; break; }
  }
  const entryMade = entry !== null && entry >= settings.pace;
  const reading = { entry, entryMade, ordered, settledAt, fell: samples.some(s => s.physicalDown), ...result.info };
  writeFileSync(o.out, JSON.stringify({ settings, stop, harness: env.harness, reading, samples,
    calibration: { running: JSON.parse(readFileSync(settings.settings, 'utf8')), stride: JSON.parse(readFileSync(settings.stride, 'utf8')),
      ...(settings.braking ? { braking: JSON.parse(readFileSync(settings.braking, 'utf8')) } : {}) },
    policyHash: bytes ? createHash('sha256').update(bytes).digest('hex') : null,
    brakingPolicyHash: brakeBytes ? createHash('sha256').update(brakeBytes).digest('hex') : null,
    environmentHash: createHash('sha256').update(readFileSync(new URL('./residual-environment.mjs', import.meta.url))).digest('hex'),
    readerHash: createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex') }) + '\n');
  console.log(JSON.stringify(reading));
} finally { env.dispose(); }
