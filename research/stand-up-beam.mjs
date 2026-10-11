import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { serialize, deserialize } from 'node:v8';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { isMainThread, parentPort, workerData } from 'node:worker_threads';
import { parseArgs } from 'node:util';
import { cmaSearch, workerPool } from './cma.mjs';
import { recoveryEnvironment } from './stand-up-environment.mjs';
import { recoveryScore } from './stand-up-search.mjs';
import { recoveryDesign } from './stand-up-design.mjs';

const read = path => deserialize(gunzipSync(readFileSync(path)));
const write = (path, value) => {
  mkdirSync(dirname(path), { recursive: true }); writeFileSync(`${path}.tmp`, gzipSync(serialize(value))); renameSync(`${path}.tmp`, path);
};
const hash = value => createHash('sha256').update(serialize(value)).digest('hex');
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const cell = row => [Math.round(row.observation.height * 10), Math.round(row.rootUp * 4),
  row.observation.contacts.filter(c => c.fixed !== null && c.impulse > 0).map(c => c.segment).sort().join(',')].join('/');

/** Search a physical continuation, committing only its prefix and retaining future lookahead. */
export async function beamEvaluator(seed, node, config, standing) {
  const e = await recoveryEnvironment({ ...seed.configuration, spec: recoveryDesign(seed.configuration) });
  e.restore(node.checkpoint);
  const original = e.observe().joints, n = e.channels.length;
  const start = original.map((j, i) => clamp(j.angle, e.channels[i].min, e.channels[i].max));
  const control = (u, step) => {
    const destination = u.slice(0, n).map((v, i) => e.channels[i].min + (e.channels[i].max - e.channels[i].min) * v);
    const following = step >= config.window, p = Math.min(1, following ? (step - config.window) / config.lookahead : step / config.window);
    const smooth = p * p * (3 - 2 * p), from = following ? destination : start, to = following ? standing : destination;
    const angles = from.map((v, i) => clamp(v + (to[i] - v) * smooth
      + (following ? 0 : original[i].rate * config.window / 120 * p * (1 - p) * (1 - p)), e.channels[i].min, e.channels[i].max));
    return { kind: 'targets', angles, response: .05 + .2 * u[n], speed: 8, activation: .5 + .5 * u[n + 1] };
  };
  return {
    initial: [...start.map((v, i) => (v - e.channels[i].min) / (e.channels[i].max - e.channels[i].min)), .4, 1],
    evaluate(u, capture = false) {
      e.restore(node.checkpoint);
      let steps = 0, boundary = null, boundaryCheckpoint = null, atWindow = null, last = e.measure();
      const rows = [], digest = createHash('sha256');
      try {
        for (let k = 0; k < config.window + config.lookahead + 360; k++) {
          if (k >= config.window + config.lookahead && e.experiment.handover === null) break;
          steps++; last = e.step(control(u, k), { automaticHandover: true });
          digest.update(JSON.stringify(last.observation));
          if (capture) rows.push(last);
          if (steps === config.advance) { boundary = last; if (capture) boundaryCheckpoint = e.save(); }
          if (steps === config.window) atWindow = last;
          if (last.result.success || last.result.failure) break;
        }
        const result = e.result(), finalScore = recoveryScore(result, last);
        const score = result.success || finalScore <= -1000000 ? finalScore
          : .25 * recoveryScore(atWindow?.result ?? result, atWindow ?? last) + .75 * finalScore;
        return { score, result, steps, digest: digest.digest('hex'), cell: boundary ? cell(boundary) : 'invalid',
          boundary: boundary && { height: boundary.observation.height, rootUp: boundary.rootUp, elapsed: boundary.result.elapsed },
          final: { height: last.observation.height, rootUp: last.rootUp },
          ...(capture ? { rows, checkpoint: boundaryCheckpoint } : {}) };
      } catch (error) { return { score: -1000000, error: String(error.stack ?? error), steps, cell: 'invalid' }; }
    },
    dispose() { e.dispose(); },
  };
}

async function beamSearch({ input, reference, output, workers = 3, layers = 24, generations = 20,
  width = 3, stepBudget = 5000000, wallSeconds = 3600, randomSeed = 1, rewind = 0 }) {
  const seed = read(input), guidance = read(reference), started = performance.now();
  assert.equal(guidance.result.success, true);
  for (const [name, value] of Object.entries({ workers, layers, generations, width, stepBudget, wallSeconds }))
    assert.ok(Number.isSafeInteger(value) && value > 0, `invalid ${name}`);
  assert.ok(workers <= 4 && width <= 4);
  assert.deepEqual(seed.identity.channels.map(c => c.name), guidance.identity.channels.map(c => c.name));
  const standingRow = guidance.rows[Math.min(guidance.rows.length - 1, Math.round((guidance.result.handover - guidance.before.observation.time) * 120))];
  const standing = standingRow.observation.joints.map(j => j.angle);
  const config = { advance: 30, window: 60, lookahead: 60 }, maximumSteps = config.window + config.lookahead + 360;
  const identity = { seed: hash(seed), guidance: hash(guidance), config, workers, width, randomSeed,
    source: hash(readFileSync(new URL(import.meta.url))), optimizer: hash(readFileSync(new URL('./cma.mjs', import.meta.url))) };
  const masterPath = `${output}.checkpoint`, rootPath = `${output}.nodes/root`;
  let master;
  if (existsSync(masterPath)) { master = read(masterPath); assert.deepEqual(master.identity, identity, 'beam resume configuration must agree'); }
  else {
    write(rootPath, { checkpoint: seed.initial, rows: [], score: 0, cell: 'root', policy: [] });
    master = { identity, frontier: [rootPath], history: [], layer: 0, parent: 0, children: [], steps: 0, milliseconds: 0, success: null, branch: 0 };
  }
  if (rewind) {
    assert.ok(Number.isSafeInteger(rewind) && rewind > 0 && rewind <= master.history.length, 'rewind names completed beam layers');
    master.layer -= rewind; master.frontier = master.history[master.layer]; master.history.length = master.layer;
    master.parent = 0; master.children = []; master.success = null; master.branch++;
  }
  const previousMilliseconds = master.milliseconds;
  const persist = () => { master.milliseconds = previousMilliseconds + performance.now() - started; write(masterPath, master); };
  const available = count => master.steps + count <= stepBudget && previousMilliseconds + performance.now() - started < wallSeconds * 1000;
  try {
    for (; master.layer < layers && !master.success;) {
      for (; master.parent < master.frontier.length && !master.success; master.parent++) {
        const path = master.frontier[master.parent], node = read(path), localPath = `${output}.nodes/search-${master.branch}-${master.layer}-${master.parent}`;
        const local = existsSync(localPath) ? read(localPath) : { optimizer: null, cache: {}, archive: [], steps: 0 };
        const evaluator = await beamEvaluator(seed, node, config, standing);
        const pool = workerPool(new URL(import.meta.url), { beam: true, input: resolve(input), node: resolve(path), config, standing }, workers);
        const lambda = workers * 4, pending = new Set();
        try {
          if (!available(lambda * maximumSteps)) return;
          await cmaSearch({ n: evaluator.initial.length, start: evaluator.initial, sigma: .2, lambda, generations,
            seed: randomSeed + master.branch * 100003 + master.layer * 97 + master.parent, resume: local.optimizer ?? undefined,
            score: async u => {
              const key = hash(u);
              if (local.cache[key]) return local.cache[key];
              if (!available(maximumSteps)) throw new Error('beam compute budget exhausted');
              // Persist the full reservation before dispatch; an interrupted worker cannot lose its charge.
              master.steps += maximumSteps; persist();
              const task = pool.evaluate(u); pending.add(task);
              let result;
              try { result = await task; }
              catch (error) { result = { score: -1000000, error: String(error), cell: 'invalid', steps: maximumSteps }; }
              finally { pending.delete(task); }
              master.steps += result.steps - maximumSteps; local.steps += result.steps;
              local.cache[key] = result;
              if (!result.error) {
                const previous = local.archive.find(c => c.cell === result.cell);
                if (!previous || previous.score < result.score) {
                  local.archive = local.archive.filter(c => c !== previous); local.archive.push({ ...result, u });
                  local.archive.sort((a, b) => b.score - a.score); local.archive.length = Math.min(local.archive.length, width * 4);
                }
              }
              write(localPath, local); persist(); return result;
            },
            onGeneration(entry, state) {
              local.optimizer = state.checkpoint; local.cache = {}; write(localPath, local); persist();
              console.log(JSON.stringify({ layer: master.layer, parent: master.parent, ...entry, steps: master.steps,
                wallSeconds: master.milliseconds / 1000, boundary: local.archive[0]?.boundary, final: local.archive[0]?.final }));
              return available(lambda * maximumSteps) && !local.archive.some(c => c.result.success);
            } });
          for (let i = 0; i < Math.min(width, local.archive.length) && available(maximumSteps); i++) {
            master.steps += maximumSteps; persist();
            const candidate = local.archive[i], selected = evaluator.evaluate(candidate.u, true); master.steps += selected.steps - maximumSteps;
            assert.equal(selected.digest, candidate.digest, 'selected beam continuation must reproduce');
            if (selected.result.success) {
              master.success = selected.result;
              write(output, { ...seed, rows: [...node.rows, ...selected.rows], result: selected.result,
                beam: { identity, policy: [...node.policy, { u: candidate.u, steps: selected.rows.length }] },
                compute: { steps: master.steps, milliseconds: previousMilliseconds + performance.now() - started } });
              break;
            }
            if (!selected.checkpoint || selected.result.failure) continue;
            const childPath = `${output}.nodes/node-${master.branch}-${master.layer}-${master.parent}-${i}`;
            write(childPath, { checkpoint: selected.checkpoint, rows: [...node.rows, ...selected.rows.slice(0, config.advance)],
              result: selected.rows[config.advance - 1].result,
              score: selected.score, cell: selected.cell, policy: [...node.policy, { u: candidate.u, steps: config.advance }] });
            master.children.push({ path: childPath, score: selected.score, cell: selected.cell });
          }
        } finally { await Promise.allSettled([...pending]); await pool.terminate(); evaluator.dispose(); persist(); }
      }
      if (master.success) break;
      master.children.sort((a, b) => b.score - a.score);
      const distinct = [];
      for (const child of master.children) if (!distinct.some(c => c.cell === child.cell)) distinct.push(child);
      if (!distinct.length) break;
      master.history.push(master.frontier);
      master.frontier = distinct.slice(0, width).map(c => c.path); master.children = []; master.parent = 0; master.layer++; persist();
    }
  } finally {
    persist();
    if (!master.success) {
      const best = read(master.frontier[0]);
      if (best.rows.length) write(output, { ...seed, rows: best.rows, result: best.result, beam: { identity, policy: best.policy },
        compute: { steps: master.steps, milliseconds: master.milliseconds } });
    }
    console.log(JSON.stringify({ output, layer: master.layer, steps: master.steps,
      wallSeconds: master.milliseconds / 1000, success: master.success, frontier: master.frontier }));
  }
}

if (!isMainThread && workerData?.beam) {
  const evaluator = await beamEvaluator(read(workerData.input), read(workerData.node), workerData.config, workerData.standing);
  parentPort.on('message', ({ id, x }) => parentPort.postMessage({ id, r: evaluator.evaluate(x) }));
} else if (isMainThread && process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { values } = parseArgs({ options: Object.fromEntries(['input', 'reference', 'output', 'workers', 'layers', 'generations', 'width',
    'stepBudget', 'wallSeconds', 'randomSeed', 'rewind'].map(name => [name, { type: 'string' }])) });
  await beamSearch(Object.fromEntries(Object.entries(values).map(([k, v]) => [k, ['input', 'reference', 'output'].includes(k) ? v : Number(v)])));
}
