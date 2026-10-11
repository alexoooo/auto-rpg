import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { serialize, deserialize } from 'node:v8';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { isMainThread, parentPort, workerData } from 'node:worker_threads';
import { parseArgs } from 'node:util';
import assert from 'node:assert/strict';
import { RISE, stageFaults } from '../src/core/mind/rise/stages.ts';
import { deepFreeze } from '../src/core/state.ts';
import { recoveryEnvironment } from './stand-up-environment.mjs';
import { recoveryDesign, recoveryDesignTable } from './stand-up-design.mjs';
import { cmaSearch, workerPool } from './cma.mjs';
import { recoveryScore } from './stand-up-search.mjs';

/** Bounded controller parameters; the independent final-standing predicate is not a parameter. */
export const FEEDBACK_PARAMETERS = deepFreeze([
  ['roll', .1, 1, 1], ['prepare', .1, 1, 1], ['poses', .1, 1, 1], ['bearing', .15, 1, 1],
  ['response', .1, 1, 1], ['speed', 1, 4, 1], ['progressSpeed', .1, 1.2, .1],
  ['settleSpeed', .1, 1, .1], ['settleSeconds', .025, .5, .5], ['near', .05, .1, .05], ['turn', .15, .45, .15],
  ['hip', -.2, .2, 0], ['knee', -.2, .2, 0], ['shoulder', -.25, .25, 0], ['wrist', -.4, .4, 0],
  ['height', -.05, .05, 0], ['pitch', -.1, .1, 0],
]);
const initial = FEEDBACK_PARAMETERS.map(([, lo, hi, value]) => (value - lo) / (hi - lo));
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const hash = value => createHash('sha256').update(serialize(value)).digest('hex');
const read = path => deserialize(gunzipSync(readFileSync(path)));
const write = (path, value) => {
  mkdirSync(dirname(path), { recursive: true }); writeFileSync(`${path}.tmp`, gzipSync(serialize(value))); renameSync(`${path}.tmp`, path);
};

/** Preserve the feedback/contact policy while varying its entire supported movement recipe. */
export function feedbackRecipe(spec, u = initial) {
  if (u.length !== FEEDBACK_PARAMETERS.length || Array.from(u).some(v => !Number.isFinite(v) || v < 0 || v > 1)) throw new Error('invalid recovery feedback candidate');
  const p = Object.fromEntries(FEEDBACK_PARAMETERS.map(([name, lo, hi], i) => [name, lo + (hi - lo) * u[i]]));
  const shift = name => name.startsWith('hip.') && name.endsWith(' flexion') ? p.hip
    : name.startsWith('knee.') ? p.knee : name.startsWith('shoulder.') && name.endsWith(' flexion') ? p.shoulder
      : name.startsWith('wrist.') && name.endsWith(' pronation') ? p.wrist : 0;
  const posture = value => value === 'reference' ? value : Object.fromEntries(spec.joints.flatMap(j => j.dofs.map(d => {
    const name = `${j.name} ${d.positive}`;
    return [name, clamp((value[name] ?? 0) + shift(name), d.min.value + d.bind.value, d.max.value + d.bind.value)];
  })));
  const pose = (stage, factor, changePosture) => ({ ...stage, posture: changePosture ? posture(stage.posture) : stage.posture,
    seconds: stage.seconds * factor, drive: { within: (stage.drive?.within ?? .2) * p.response, speed: (stage.drive?.speed ?? 3) * p.speed } });
  const recipe = deepFreeze({ ...RISE,
    roll: Object.fromEntries(Object.entries(RISE.roll).map(([lie, stages]) => [lie, stages.map(s => pose(s, p.roll, false))])),
    rise: RISE.rise.map((s, i) => {
      switch (s.kind) {
        case 'pose': return pose(s, i < 3 ? p.prepare : p.poses, true);
        case 'bear': return { ...s, seconds: s.seconds * p.bearing, posture: posture(s.posture),
          ...(s.postureSeconds !== undefined ? { postureSeconds: s.postureSeconds * p.response } : {}),
          height: s.height === null ? null : clamp(s.height + p.height, .1, 1.1), pitch: s.pitch === null ? null : s.pitch + p.pitch };
        default: throw new Error('unknown recovery stage');
      }
    }), progress: { speed: p.progressSpeed, near: p.near, turn: p.turn, settleSpeed: p.settleSpeed, settleSeconds: p.settleSeconds } });
  const faults = stageFaults(recipe, spec); if (faults.length) throw new Error(faults.join('; '));
  return recipe;
}

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
    return { score: result.fell ? recoveryScore(result, measurement) : -1000000,
      result, steps: e.stand.world.steps, milliseconds: performance.now() - started,
      final: { height: measurement.observation.height, rootUp: measurement.rootUp, phase: e.legacy.state.rise.phase, stage: e.legacy.state.rise.stage,
        retries: e.legacy.state.retries, tries: e.legacy.state.rise.tries, furthest: e.legacy.state.rise.furthest }, peaks,
      ...(capture ? { version: 1, initial: checkpoint, before, identity: e.identity, configuration: { ...configuration, recipe },
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
