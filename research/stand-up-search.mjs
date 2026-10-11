import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { serialize, deserialize } from 'node:v8';
import { gzipSync, gunzipSync } from 'node:zlib';
import { availableParallelism } from 'node:os';
import { isMainThread, parentPort, workerData } from 'node:worker_threads';
import { parseArgs } from 'node:util';
import { recoveryEnvironment } from './stand-up-environment.mjs';
import { cmaSearch, workerPool } from './cma.mjs';
import { recoveryDesign, recoveryDesignTable } from './stand-up-design.mjs';

const digest = value => createHash('sha256').update(serialize(value)).digest('hex');
const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
const read = path => deserialize(gunzipSync(readFileSync(path)));
const write = (path, value) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(`${path}.tmp`, gzipSync(serialize(value)));
  renameSync(`${path}.tmp`, path);
};
const environment = configuration => {
  return recoveryEnvironment({ ...configuration, spec: recoveryDesign(configuration) });
};

/** Success dominates every progress heuristic; duration includes all time since takeover. */
export function recoveryScore(result, measurement) {
  if (result.failure || result.assisted || !Number.isFinite(result.effortViolation) || result.effortViolation >= .0001) return -1000000;
  if (result.success) return 1000000 - 1000 * Math.min(120, result.seconds);
  const { observation: o, rootUp, soleUp } = measurement;
  if (![o.height, rootUp, ...soleUp].every(Number.isFinite)) return -1000000;
  const speed = Math.sqrt(o.segments.reduce((sum, s) => sum + s.velocity.reduce((a, v) => a + v * v, 0), 0) / o.segments.length);
  // These bounded terms guide failed candidates; none can declare a recovery.
  return 100 * clamp(o.height, 0, 1.2) + 40 * rootUp + 10 * soleUp.reduce((a, v) => a + v, 0)
    - 5 * Math.min(10, speed) + 10 * Math.min(.5, result.quiet);
}

/** A complete baseline trace, with actions indexed before and observations after each world step. */
export async function recordRecovery({ model = 'workshop-fighter', held = 'empty', baseline = 'support-recovery',
  kind = 'lab', degrees = 90, seconds = 45, contact = 'baseline', strength = 1, speed = 1, weight = 1 } = {}) {
  const configuration = { model, held, baseline, contact, strength, speed, weight };
  const e = await environment(configuration);
  try {
    await e.fall({ kind, degrees });
    assert.notEqual(e.result().takeover, null, 'the recipe must produce an actual recovery takeover');
    const initial = e.save(), before = e.measure(), rows = [], started = performance.now();
    for (let k = 0; k < Math.ceil(seconds * 120); k++) {
      const row = e.step(); rows.push(row);
      if (row.result.success || row.result.failure) break;
    }
    return { version: 1, configuration, design: recoveryDesignTable(configuration), recipe: { kind, degrees }, identity: e.identity,
      initial, before, rows, result: e.result(), compute: { steps: rows.length, milliseconds: performance.now() - started } };
  } finally { e.dispose(); }
}

/** Retiming and smooth muscle-command residuals on a continuous window of an executed tape. */
export function trajectoryAction(seed, config, u, step) {
  const { start, length, knots, rateRange, velocityRadius, activationRadius } = config;
  const duration = Math.max(1, Math.round(length * (rateRange[0] + (rateRange[1] - rateRange[0]) * u[0])));
  const relative = step - start;
  if (relative < 0) return seed.rows[step].action;
  if (config.representation === 'targets') {
    const n = seed.identity.channels.length, p = clamp(relative / duration, 0, 1) * (knots - 1);
    const a = Math.floor(p), b = Math.min(knots - 1, a + 1), blend = (p - a) * (p - a) * (3 - 2 * (p - a));
    const value = i => (1 - blend) * u[1 + a * (n + 2) + i] + blend * u[1 + b * (n + 2) + i];
    return { kind: 'targets', angles: seed.identity.channels.map((c, i) => clamp(c.min + (c.max - c.min) * value(i), c.min, c.max)),
      response: .05 + .25 * value(n), speed: 6, activation: .3 + .7 * value(n + 1) };
  }
  if (relative >= duration) return seed.rows[start + length + relative - duration]?.action ?? { kind: 'host' };
  const position = relative / duration;
  const index = start + Math.min(length - 1, Math.floor(relative * length / duration));
  const original = seed.rows[index].action;
  if (original.kind === 'host') return original;
  const n = seed.identity.channels.length, t = position * (knots - 1), a = Math.floor(t), b = Math.min(knots - 1, a + 1);
  const blend = (t - a) * (t - a) * (3 - 2 * (t - a));
  const residual = i => 2 * ((1 - blend) * u[1 + a * 2 * n + i] + blend * u[1 + b * 2 * n + i]) - 1;
  return { ...original,
    velocity: original.velocity.map((v, i) => typeof v === 'number' ? v + velocityRadius * residual(i) : v),
    activation: original.activation.map((v, i) => clamp(v + activationRadius * residual(n + i), 0, 1)) };
}

/** Every candidate restores the same complete prefix and physically executes its entire future. */
export async function trajectoryEvaluator(seed, config) {
  const e = await environment(seed.configuration);
  e.restore(seed.initial);
  for (let k = 0; k < config.start; k++) e.step(seed.rows[k].action);
  const prefix = e.save();
  return {
    prefixSteps: config.start,
    evaluate(u, { capture = false } = {}) {
      e.restore(prefix);
      const started = performance.now(), rows = [], trace = createHash('sha256');
      let steps = 0, measurement = e.measure();
      try {
        const duration = Math.max(1, Math.round(config.length * (config.rateRange[0] + (config.rateRange[1] - config.rateRange[0]) * u[0])));
        const limit = (config.representation === 'targets' ? duration : seed.rows.length - config.start + duration - config.length) + config.tailSteps;
        for (let k = 0; k < limit; k++) {
          steps++;
          const row = e.step(trajectoryAction(seed, config, u, config.start + k), { automaticHandover: true });
          measurement = row;
          trace.update(JSON.stringify(row.observation));
          if (capture) rows.push(row);
          if (row.result.success || row.result.failure) break;
        }
        const result = e.result();
        return { score: recoveryScore(result, measurement), result, steps, milliseconds: performance.now() - started,
          digest: trace.digest('hex'), final: { height: measurement.observation.height, rootUp: measurement.rootUp, soleUp: measurement.soleUp },
          ...(capture ? { rows: [...seed.rows.slice(0, config.start), ...rows] } : {}) };
      } catch (error) {
        return { score: -1000000, error: String(error.stack ?? error), steps, milliseconds: performance.now() - started };
      }
    },
    dispose() { e.dispose(); },
  };
}

/** Reproduce all physical observations in a fresh world, not just the final success flag. */
export async function replayRecovery(seed) {
  const e = await environment(seed.configuration);
  try {
    e.restore(seed.initial);
    for (let i = 0; i < seed.rows.length; i++) assert.deepEqual(e.step(seed.rows[i].action).observation, seed.rows[i].observation, `replay step ${i}`);
    assert.deepEqual(e.result(), seed.result);
    return { steps: seed.rows.length, result: e.result() };
  } finally { e.dispose(); }
}

async function search({ input, output, pilot, generations = 100, workers = Math.min(3, Math.max(1, availableParallelism() - 1)),
  start = 0, length, knots = 3, seed: randomSeed = 1, stepBudget = 36000000, wallSeconds = 14400,
  representation = 'commands', sigma = representation === 'targets' ? .2 : .025, independent = false, reference }) {
  const seed = read(input), n = seed.identity.channels.length;
  const guidance = reference ? read(reference) : seed;
  assert.deepEqual(guidance.identity.channels.map(c => c.name), seed.identity.channels.map(c => c.name), 'trajectory guidance channels must agree');
  length ??= seed.rows.length - start;
  if (!Number.isSafeInteger(start) || start < 0 || !Number.isSafeInteger(length) || length < 1 || start + length > seed.rows.length
    || !Number.isSafeInteger(knots) || knots < 2 || knots > 12 || !Number.isSafeInteger(workers) || workers < 1 || workers > 4
    || !Number.isSafeInteger(stepBudget) || stepBudget < 1 || !Number.isFinite(wallSeconds) || wallSeconds <= 0
    || !['targets', 'commands'].includes(representation) || (representation === 'targets' && start !== 0)) throw new Error('invalid trajectory search configuration');
  const config = { start, length, knots, representation, rateRange: representation === 'targets' ? [3 * 120 / length, 6 * 120 / length] : [.7, 1.1],
    velocityRadius: 3, activationRadius: .35, tailSteps: representation === 'targets' ? 420 : 120 };
  const variables = 1 + (representation === 'targets' ? n + 2 : 2 * n) * knots, lambda = 4 * workers;
  const initial = Array(variables).fill(.5);
  if (representation === 'targets') {
    initial[0] = 1;
    for (let k = 0; k < knots; k++) {
      const row = guidance.rows[Math.round(k * (guidance.rows.length - 1) / (knots - 1))];
      for (let i = 0; i < n; i++) initial[1 + k * (n + 2) + i] = independent ? .5
        : clamp((row.observation.joints[i].angle - seed.identity.channels[i].min) / (seed.identity.channels[i].max - seed.identity.channels[i].min), 0, 1);
      initial[1 + k * (n + 2) + n] = .4; initial[1 + k * (n + 2) + n + 1] = 1;
    }
  } else initial[0] = (1 - config.rateRange[0]) / (config.rateRange[1] - config.rateRange[0]);
  const identity = { seed: digest(seed), reference: digest(guidance), config, randomSeed, lambda, variables, sigma, independent, pilot: !!pilot,
    searchSource: digest(readFileSync(new URL(import.meta.url))), optimizerSource: digest(readFileSync(new URL('./cma.mjs', import.meta.url))) };
  const checkpointPath = `${output}.checkpoint`;
  let saved = existsSync(checkpointPath) ? read(checkpointPath) : { identity, optimizer: null, cache: {}, evaluations: 0, steps: 0, milliseconds: 0, best: null };
  assert.deepEqual(saved.identity, identity, 'search resume configuration must match');
  const maximumSteps = representation === 'targets' ? 720 + config.tailSteps : seed.rows.length - start + Math.ceil(.1 * length) + config.tailSteps;
  const budget = { evaluations: pilot ? 256 : Infinity, steps: stepBudget, milliseconds: Math.min(wallSeconds, pilot ? 600 : Infinity) * 1000 };
  const started = performance.now(), previousMilliseconds = saved.milliseconds;
  const persist = () => { saved.milliseconds = previousMilliseconds + performance.now() - started; write(checkpointPath, saved); };
  // Each worker constructs its prefix once. Prefixes, tails and unsuccessful trials all consume budget.
  assert.ok(saved.steps + workers * start <= budget.steps, 'worker prefixes exceed the remaining search budget');
  saved.steps += workers * start;
  persist();
  const pool = workerPool(new URL(import.meta.url), { recoverySearch: true, input: resolve(input), config }, workers);
  let stopped = false;
  const interrupt = () => { stopped = true; };
  process.on('SIGINT', interrupt); process.on('SIGTERM', interrupt);
  const pending = new Set();
  const score = async u => {
    const key = digest(u);
    if (saved.cache[key]) return saved.cache[key];
    if (stopped || saved.steps + maximumSteps > budget.steps
      || saved.evaluations >= budget.evaluations
      || previousMilliseconds + performance.now() - started >= budget.milliseconds) {
      stopped = true; throw new Error('declared search budget exhausted');
    }
    // An interrupted worker remains charged at its reserved upper bound after a restart.
    saved.steps += maximumSteps; saved.evaluations++; persist();
    const task = pool.evaluate(u); pending.add(task);
    let result;
    try { result = await task; }
    catch (error) { result = { score: -1000000, error: String(error), steps: maximumSteps }; }
    finally { pending.delete(task); }
    saved.steps += result.steps - maximumSteps;
    saved.cache[key] = result;
    if (!saved.best || result.score > saved.best.score) saved.best = { u, ...result };
    persist();
    return result;
  };
  try {
    await cmaSearch({ n: variables, start: initial, sigma, lambda, generations, seed: randomSeed, resume: saved.optimizer ?? undefined, score,
      onGeneration(entry, state) {
        saved.optimizer = state.checkpoint; saved.cache = {}; persist();
        console.log(JSON.stringify({ ...entry, evaluations: saved.evaluations, steps: saved.steps, wallSeconds: saved.milliseconds / 1000,
          result: saved.best?.result, final: saved.best?.final }));
        return !stopped && saved.evaluations + lambda <= budget.evaluations && saved.steps + lambda * maximumSteps <= budget.steps
          && saved.milliseconds < budget.milliseconds;
      } });
  } catch (error) {
    console.log(JSON.stringify({ stopped: String(error), steps: saved.steps, evaluations: saved.evaluations }));
    if (!stopped) throw error;
  } finally {
    await Promise.allSettled([...pending]); await pool.terminate(); persist();
    process.off('SIGINT', interrupt); process.off('SIGTERM', interrupt);
  }
  // Materializing the winner is another physical evaluation, accounted separately from sampling.
  if (saved.best && saved.steps + start + maximumSteps <= budget.steps
    && previousMilliseconds + performance.now() - started < budget.milliseconds) {
    saved.steps += start + maximumSteps; persist();
    const evaluator = await trajectoryEvaluator(seed, config);
    try {
      const winner = evaluator.evaluate(saved.best.u, { capture: true });
      saved.steps += winner.steps - maximumSteps;
      assert.equal(winner.digest, saved.best.digest, 'winner must reproduce independently of worker order');
      write(output, { ...seed, rows: winner.rows, result: winner.result, lineage: { parent: resolve(input), identity, u: saved.best.u },
        compute: { steps: saved.steps, evaluations: saved.evaluations, milliseconds: previousMilliseconds + performance.now() - started } });
    } finally { evaluator.dispose(); persist(); }
  }
  console.log(JSON.stringify({ output, evaluations: saved.evaluations, steps: saved.steps, wallSeconds: saved.milliseconds / 1000,
    stepsPerSecond: saved.steps / (saved.milliseconds / 1000), result: saved.best?.result }));
}

if (!isMainThread && workerData?.recoverySearch) {
  const evaluator = await trajectoryEvaluator(read(workerData.input), workerData.config);
  parentPort.on('message', ({ id, x }) => parentPort.postMessage({ id, r: evaluator.evaluate(x) }));
} else if (isMainThread && process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    input: { type: 'string' }, output: { type: 'string' }, model: { type: 'string' }, held: { type: 'string' }, baseline: { type: 'string' },
    kind: { type: 'string' }, degrees: { type: 'string' }, seconds: { type: 'string' }, generations: { type: 'string' },
    workers: { type: 'string' }, start: { type: 'string' }, length: { type: 'string' }, knots: { type: 'string' }, seed: { type: 'string' },
    representation: { type: 'string' }, sigma: { type: 'string' }, independent: { type: 'boolean' },
    contact: { type: 'string' }, reference: { type: 'string' },
    strength: { type: 'string' }, speed: { type: 'string' }, weight: { type: 'string' },
    stepBudget: { type: 'string' }, wallSeconds: { type: 'string' } } });
  const options = Object.fromEntries(Object.entries(values).map(([k, v]) => [k,
    ['degrees', 'seconds', 'generations', 'workers', 'start', 'length', 'knots', 'seed', 'stepBudget', 'wallSeconds', 'sigma', 'strength', 'speed', 'weight'].includes(k) ? Number(v) : v]));
  const mode = positionals[0];
  if (mode === 'record') { assert.ok(options.output); const record = await recordRecovery(options); write(options.output, record); console.log(JSON.stringify(record.result)); }
  else if (mode === 'replay') { console.log(JSON.stringify(await replayRecovery(read(options.input)))); }
  else if (mode === 'pilot' || mode === 'search') { assert.ok(options.input && options.output); await search({ ...options, pilot: mode === 'pilot' }); }
  else throw new Error('use record, replay, pilot or search');
}
