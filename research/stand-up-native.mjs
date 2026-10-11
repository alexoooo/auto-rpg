import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, renameSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { serialize, deserialize } from 'node:v8';
import { gzipSync, gunzipSync } from 'node:zlib';
import { parseArgs } from 'node:util';
import { Quaternion } from '@babylonjs/core/Maths/math.vector.js';
import { boundedWork, linearWork, solveLinearTo, boundedLeastSquaresTo } from '../src/core/math/flat.ts';
import { recoveryEnvironment } from './stand-up-environment.mjs';
import { modelSpec } from '../src/core/models.ts';
import { withSoles } from '../src/core/human/sole.ts';
import { recoveryScore } from './stand-up-search.mjs';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const read = path => deserialize(gunzipSync(readFileSync(path)));
const write = (path, value) => {
  mkdirSync(dirname(path), { recursive: true }); writeFileSync(`${path}.tmp`, gzipSync(serialize(value))); renameSync(`${path}.tmp`, path);
};
const commands = x => ({ kind: 'muscles', activation: x.map(Math.abs), velocity: x.map(v => v >= 0 ? '+inf' : '-inf'), handPoses: { left: 'open', right: 'open' } });

/** Interpolate a measured physical reference; this only sets costs, never the body. */
function referenceAt(seed, step) {
  const rows = [seed.before.observation, ...seed.rows.map(r => r.observation)];
  const last = Math.max(0, Math.min(rows.length - 1, Math.round((seed.result.handover - rows[0].time) * 120)));
  const p = clamp(step, 0, last), a = rows[Math.floor(p)], b = rows[Math.min(last, Math.ceil(p))], u = p - Math.floor(p);
  return a.segments.map((s, i) => {
    const t = b.segments[i], sign = s.rotation.reduce((sum, v, k) => sum + v * t.rotation[k], 0) < 0 ? -1 : 1;
    const rotation = new Quaternion(...s.rotation.map((v, k) => v * (1 - u) + sign * t.rotation[k] * u)).normalize().asArray();
    const interpolate = field => s[field].map((v, k) => v * (1 - u) + t[field][k] * u);
    return { name: s.name, centre: interpolate('centre'), velocity: interpolate('velocity'), spin: interpolate('spin'), rotation };
  });
}

/** Actual-engine one-step optimization follows a complete measured recovery at a chosen duration. */
export async function nativeRecovery({ input, output, seconds, iterations = 2, response = .15, stepBudget = 300000,
  maximumSteps, angularWeight = .2, rootWeight = 3 } = {}) {
  const seed = read(input);
  assert.equal(seed.result.success, true, 'native tracking needs a complete physical demonstration');
  seconds ??= seed.result.seconds;
  assert.ok(seconds > 0 && Number.isFinite(seconds) && Number.isSafeInteger(iterations) && iterations >= 0 && iterations <= 8);
  const e = await recoveryEnvironment({ ...seed.configuration,
    ...(seed.configuration.contact === 'shoe' ? { spec: withSoles(modelSpec(seed.configuration.model)) } : {}) });
  e.restore(seed.initial);
  const n = e.channels.length, linear = linearWork(n), bounded = boundedWork(n), rows = [], started = performance.now();
  const remainingSeconds = seconds - (seed.before.observation.time - seed.result.takeover);
  assert.ok(remainingSeconds > 0);
  const scale = (seed.result.handover - seed.before.observation.time) / remainingSeconds;
  let x = Array(n).fill(0), steps = 0, peakCost = 0;
  const hash = bytes => createHash('sha256').update(bytes).digest('hex');
  const configuration = { input: resolve(input), inputSha: hash(readFileSync(input)), sourceSha: hash(readFileSync(new URL(import.meta.url))),
    seconds, iterations, response, angularWeight, rootWeight, stepBudget };
  let previousMilliseconds = 0;
  if (output && existsSync(`${output}.checkpoint`)) {
    const saved = read(`${output}.checkpoint`);
    assert.deepEqual(saved.configuration, configuration, 'native recovery resume configuration must match');
    e.restore(saved.state); rows.push(...saved.rows); x = saved.x; steps = saved.steps;
    previousMilliseconds = saved.progress.wallSeconds * 1000; peakCost = saved.peakCost;
  }
  try {
    const limit = maximumSteps ?? Math.ceil((remainingSeconds + 5) * 120);
    for (let step = rows.length; step < limit; step++) {
      if (steps + 3 + iterations * (n + 4) > stepBudget) break;
      if (e.experiment.handover !== null) {
        const row = e.step({ kind: 'host' }); rows.push(row); steps++;
        if (row.result.success || row.result.failure) break;
        continue;
      }
      const before = e.observe(), checkpoint = e.save(), now = referenceAt(seed, step * scale), next = referenceAt(seed, (step + 1) * scale);
      const moving = step / 120 < remainingSeconds;
      const target = before.segments.map((s, i) => {
        const q = new Quaternion(...now[i].rotation).multiply(Quaternion.Inverse(new Quaternion(...s.rotation))), sign = q.w < 0 ? -1 : 1;
        return { linear: s.velocity.map((_, k) => (moving ? next[i].velocity[k] * scale : 0) + (now[i].centre[k] - s.centre[k]) / response),
          angular: s.spin.map((_, k) => (moving ? next[i].spin[k] * scale : 0) + 2 * sign * [q.x, q.y, q.z][k] / response) };
      });
      const evaluateAction = action => {
        e.restore(checkpoint); steps++;
        const row = e.step(action, { automaticHandover: true });
        const residual = row.observation.segments.flatMap((s, i) => {
          const weight = s.name === 'lowerTrunk' ? rootWeight : 1;
          return [...s.velocity.map((v, k) => weight * (v - target[i].linear[k])), ...s.spin.map((v, k) => weight * angularWeight * (v - target[i].angular[k]))];
        });
        return { row, action, residual, cost: residual.reduce((sum, v) => sum + v * v, 0) };
      };
      const evaluate = z => evaluateAction(commands(z));
      let current = evaluate(x);
      for (let iteration = 0; iteration < iterations; iteration++) {
        const columns = [];
        for (let i = 0; i < n; i++) {
          const z = [...x], epsilon = x[i] + .005 <= 1 ? .005 : -.005; z[i] += epsilon;
          const other = evaluate(z); columns.push(other.residual.map((v, k) => (v - current.residual[k]) / epsilon));
        }
        const H = new Float64Array(n * n), rhs = new Float64Array(n), free = new Float64Array(n), delta = new Float64Array(n);
        for (let i = 0; i < n; i++) {
          for (let j = 0; j < n; j++) H[i * n + j] = columns[i].reduce((sum, v, k) => sum + v * columns[j][k], 0) + (i === j ? 1e-6 : 0);
          rhs[i] = -columns[i].reduce((sum, v, k) => sum + v * current.residual[k], 0);
        }
        solveLinearTo(linear, H, rhs, n, free);
        boundedLeastSquaresTo(bounded, H, free, x.map(v => Math.max(-1 - v, -.3)), x.map(v => Math.min(1 - v, .3)), n, delta);
        let improved = false;
        for (const length of [1, .5, .25, .125]) {
          const z = x.map((v, i) => clamp(v + length * delta[i], -1, 1)), candidate = evaluate(z);
          if (candidate.cost < current.cost) { x = z; current = candidate; improved = true; break; }
        }
        if (!improved) break;
      }
      const original = seed.rows[Math.min(seed.rows.length - 1, Math.floor(step * scale))].action;
      const replay = evaluateAction(original);
      if (replay.cost < current.cost) {
        current = replay;
        x = current.row.observation.joints.map(j => clamp(j.effort / Math.max(.001, j.effort >= 0 ? j.positive : j.negative), -1, 1));
      }
      e.restore(checkpoint); steps++;
      const row = e.step(current.action, { automaticHandover: true });
      assert.deepEqual(row.observation, current.row.observation, 'the selected native rollout must reproduce on execution');
      rows.push(row); peakCost = Math.max(peakCost, current.cost);
      if ((step + 1) % 60 === 0) {
        const progress = { step: step + 1, simulated: e.result().elapsed, steps, wallSeconds: (previousMilliseconds + performance.now() - started) / 1000,
          cost: current.cost, height: row.observation.height, rootUp: row.rootUp, result: e.result() };
        console.log(JSON.stringify(progress));
        if (output) write(`${output}.checkpoint`, { configuration, initial: seed.initial, rows, state: e.save(), x, steps, peakCost, progress });
      }
      if (row.result.success || row.result.failure) break;
    }
    const result = { ...seed, rows, result: e.result(), native: configuration,
      compute: { steps, milliseconds: previousMilliseconds + performance.now() - started, peakCost }, score: recoveryScore(e.result(), e.measure()) };
    if (output) write(output, result);
    return result;
  } finally { e.dispose(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { values } = parseArgs({ options: { input: { type: 'string' }, output: { type: 'string' }, seconds: { type: 'string' },
    iterations: { type: 'string' }, response: { type: 'string' }, stepBudget: { type: 'string' }, maximumSteps: { type: 'string' } } });
  const options = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, ['input', 'output'].includes(k) ? v : Number(v)]));
  const result = await nativeRecovery(options); console.log(JSON.stringify({ result: result.result, compute: result.compute, score: result.score }));
}
