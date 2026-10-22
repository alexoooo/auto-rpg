import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { serialize, deserialize } from 'node:v8';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { isMainThread, parentPort, workerData } from 'node:worker_threads';
import { parseArgs } from 'node:util';
import assert from 'node:assert/strict';
import { FEEDBACK_PARAMETERS, feedbackRecipe } from './stand-up-feedback-recipe.ts';
export { FEEDBACK_PARAMETERS, feedbackRecipe } from './stand-up-feedback-recipe.ts';
import { recoveryEnvironment } from './stand-up-environment.mjs';
import { recoveryDesign, recoveryDesignTable } from './stand-up-design.mjs';
import { cmaSearch, workerPool } from './cma.mjs';
import { recoveryScore } from './stand-up-search.mjs';

const initial = FEEDBACK_PARAMETERS.map(([, lo, hi, value]) => (value - lo) / (hi - lo));
const hash = value => createHash('sha256').update(serialize(value)).digest('hex');
const read = path => {
  const bytes = readFileSync(path);
  return bytes[0] === 0x1f && bytes[1] === 0x8b ? deserialize(gunzipSync(bytes)) : JSON.parse(bytes.toString('utf8'));
};
const write = (path, value) => {
  mkdirSync(dirname(path), { recursive: true }); writeFileSync(`${path}.tmp`, gzipSync(serialize(value))); renameSync(`${path}.tmp`, path);
};

export async function feedbackTrial(configuration, u = initial, capture = false) {
  const spec = recoveryDesign(configuration), recipe = feedbackRecipe(spec, u);
  const e = await recoveryEnvironment({ ...configuration, spec, recipe });
  const started = performance.now(), rows = [], peaks = e.channels.map(() => 0);
  try {
    await e.fall({ kind: configuration.kind ?? 'lab', degrees: configuration.degrees ?? 0 });
    const checkpoint = e.save(), before = e.measure();
    if (e.result().takeover !== null) for (let k = 0; k < (configuration.seconds ?? 16) * 120; k++) {
      const row = e.step();
      if (capture) rows.push(row);
      row.observation.joints.forEach((j, i) => { peaks[i] = Math.max(peaks[i], Math.abs(j.effort)); });
      if (row.result.success || row.result.failure) break;
    }
    const result = e.result(), measurement = e.measure();
    return { identity: e.identity, score: result.fell ? recoveryScore(result, measurement) : -1000000,
      result, steps: e.stand.world.steps, milliseconds: performance.now() - started,
      final: { height: measurement.observation.height, rootUp: measurement.rootUp, phase: e.legacy.state.rise.phase, stage: e.legacy.state.rise.stage,
        retries: e.legacy.state.retries, tries: e.legacy.state.rise.tries, furthest: e.legacy.state.rise.furthest }, peaks,
      ...(capture ? { version: 1, initial: checkpoint, before, configuration: { ...configuration, recipe },
        rows, recipe: { kind: configuration.kind ?? 'lab', degrees: configuration.degrees ?? 0 }, design: recoveryDesignTable(configuration) } : {}) };
  } catch (error) { return { score: -1000000, error: String(error.stack ?? error), steps: e.stand.world.steps, milliseconds: performance.now() - started }; }
  finally { e.dispose(); }
}

async function search(options) {
  const { output, workers = 3, generations = 100, randomSeed = 1, stepBudget = 2000000, wallSeconds = 1800,
    model = 'workshop-fighter', contact = 'shoe', strength = 1, speed = 1, weight = 1, seconds = 16, degrees = 0,
    held = 'empty', mode = 'search', sigma = .18, seed } = options;
  const configuration = { model, held, contact, strength, speed, weight, seconds, degrees };
  assert.ok(output && Number.isSafeInteger(workers) && workers > 0 && workers <= 4);
  assert.ok(Number.isFinite(seconds) && seconds > 0 && Number.isSafeInteger(stepBudget) && stepBudget > 0 && Number.isFinite(wallSeconds) && wallSeconds > 0);
  let start = initial;
  if (seed) {
    const witness = read(seed);
    assert.equal(witness.result.success, true, 'a feedback seed is a verified demonstration');
    assert.deepEqual(witness.feedback.parameters, FEEDBACK_PARAMETERS, 'feedback seed parameter meanings must match');
    feedbackRecipe(recoveryDesign(configuration), witness.feedback.u);
    start = witness.feedback.u;
  }
  if (mode === 'record') {
    const r = await feedbackTrial(configuration, start, true);
    write(output, { ...r, feedback: { u: start, parameters: FEEDBACK_PARAMETERS } });
    console.log(JSON.stringify({ result: r.result, error: r.error })); return;
  }
  const physical = await recoveryEnvironment({ ...configuration, spec: recoveryDesign(configuration), recipe: feedbackRecipe(recoveryDesign(configuration)) });
  const physicalIdentity = physical.identity; physical.dispose();
  const identity = { configuration, workers, randomSeed, sigma, parameters: FEEDBACK_PARAMETERS,
    physical: physicalIdentity, start, seed: seed ? hash(readFileSync(seed)) : null,
    source: hash(readFileSync(new URL(import.meta.url))), environment: hash(readFileSync(new URL('./stand-up-environment.mjs', import.meta.url))),
    optimizer: hash(readFileSync(new URL('./cma.mjs', import.meta.url))) };
  let saved = existsSync(`${output}.checkpoint`) ? read(`${output}.checkpoint`)
    : { identity, optimizer: null, cache: {}, steps: 0, evaluations: 0, milliseconds: 0, best: null };
  assert.deepEqual(saved.identity, identity, 'feedback search resume configuration must match');
  const started = performance.now(), previousMilliseconds = saved.milliseconds, maximumSteps = Math.ceil((seconds + 8) * 120), lambda = 4 * workers;
  const persist = () => { saved.milliseconds = previousMilliseconds + performance.now() - started; write(`${output}.checkpoint`, saved); };
  const available = count => saved.steps + count <= stepBudget && previousMilliseconds + performance.now() - started < wallSeconds * 1000;
  const pool = workerPool(new URL(import.meta.url), { feedback: true, configuration }, workers), pending = new Set();
  try {
    await cmaSearch({ n: initial.length, start, sigma, lambda, generations, seed: randomSeed, resume: saved.optimizer ?? undefined,
      score: async u => {
        const key = hash(u); if (saved.cache[key]) return saved.cache[key];
        if (!available(maximumSteps)) throw new Error('feedback search budget exhausted');
        saved.steps += maximumSteps; persist();
        const task = pool.evaluate(u); pending.add(task);
        let r;
        try { r = await task; } catch (error) { r = { score: -1000000, error: String(error), steps: maximumSteps }; }
        finally { pending.delete(task); }
        saved.steps += r.steps - maximumSteps; saved.evaluations++; saved.cache[key] = r;
        if (!saved.best || r.score > saved.best.score) saved.best = { ...r, u };
        persist(); return r;
      },
      onGeneration(entry, state) {
        saved.optimizer = state.checkpoint; saved.cache = {}; persist();
        console.log(JSON.stringify({ ...entry, steps: saved.steps, evaluations: saved.evaluations, wallSeconds: saved.milliseconds / 1000,
          result: saved.best?.result, final: saved.best?.final }));
        return available(lambda * maximumSteps);
      } });
  } finally { await Promise.allSettled([...pending]); await pool.terminate(); persist(); }
  if (saved.best && available(maximumSteps)) {
    saved.steps += maximumSteps; persist();
    const winner = await feedbackTrial(configuration, saved.best.u, true); saved.steps += winner.steps - maximumSteps;
    assert.deepEqual(winner.result, saved.best.result, 'the selected feedback recipe must reproduce');
    write(output, { ...winner, feedback: { u: saved.best.u, parameters: FEEDBACK_PARAMETERS },
      compute: { steps: saved.steps, evaluations: saved.evaluations, milliseconds: previousMilliseconds + performance.now() - started } }); persist();
  }
  console.log(JSON.stringify({ output, result: saved.best?.result, steps: saved.steps, evaluations: saved.evaluations, wallSeconds: saved.milliseconds / 1000 }));
}

if (!isMainThread && workerData?.feedback) parentPort.on('message', async ({ id, x }) => {
  parentPort.postMessage({ id, r: await feedbackTrial(workerData.configuration, x) });
});
else if (isMainThread && process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const names = ['output', 'workers', 'generations', 'randomSeed', 'stepBudget', 'wallSeconds', 'model', 'contact', 'strength', 'speed', 'weight',
    'seconds', 'degrees', 'held', 'mode', 'sigma', 'seed'];
  const { values } = parseArgs({ options: Object.fromEntries(names.map(name => [name, { type: 'string' }])) });
  await search(Object.fromEntries(Object.entries(values).map(([k, v]) => [k,
    ['output', 'model', 'contact', 'held', 'mode', 'seed'].includes(k) ? v : Number(v)])));
}
