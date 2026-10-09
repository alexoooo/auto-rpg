/**
 * **Diagonal CMA-ES in the unit cube** (Hansen 2016, "The CMA evolution strategy: a tutorial", its
 * covariance kept to the diagonal), and a pool of worker threads to score its candidates in. A
 * candidate is a point in [0, 1]^n; each is clamped to the cube before it is scored. The search is
 * seeded (mulberry32), so a run can be made again.
 */
import { Worker } from "node:worker_threads";

/**
 * Worker threads of the module at `url`, each started with `workerData`: `evaluate(x)` posts
 * `{ id, x }` to the next idle one and resolves with the `r` it posts back as `{ id, r }`.
 */
export function workerPool(url, workerData, count) {
  const workers = Array.from({ length: count }, () => new Worker(url, { workerData }));
  let nextId = 0; const waiting = new Map(), idle = [...workers], queue = [];
  const pump = () => { while (idle.length && queue.length) { const { id, x } = queue.shift(); idle.pop().postMessage({ id, x }); } };
  for (const w of workers) w.on("message", ({ id, r }) => { waiting.get(id)(r); waiting.delete(id); idle.push(w); pump(); });
  return {
    evaluate: (x) => new Promise((done) => { const id = nextId++; waiting.set(id, done); queue.push({ id, x }); pump(); }),
    terminate() { for (const w of workers) w.terminate(); },
  };
}

/**
 * Search `n` numbers from `start` (the cube's middle if not given) at step `sigma`, `lambda`
 * candidates a generation for `generations`, each scored by `score(u)` (a promise of an object
 * with a `score`, the higher the better). `onGeneration(entry, search)` hears each generation's
 * best, median and step, with the search's best so far and its mean. Returns the best
 * (`{ score, u, r, g }`), the last mean and the log.
 */
export async function cmaSearch({ n, start, sigma = 0.25, lambda, generations, seed = 1, score, onGeneration }) {
  let state = seed >>> 0;
  const random = () => { state = (state + 0x6d2b79f5) >>> 0; let t = state; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const gauss = () => { let u = 0; while (!u) u = random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random()); };
  let m = start ? start.map((v) => Math.min(1, Math.max(0, v))) : new Array(n).fill(0.5);
  const C = new Array(n).fill(1), mu = lambda >> 1;
  const weights = Array.from({ length: mu }, (_, i) => Math.log(mu + 0.5) - Math.log(i + 1)), total = weights.reduce((a, b) => a + b);
  for (let i = 0; i < mu; i++) weights[i] /= total;
  const mueff = 1 / weights.reduce((a, w) => a + w * w, 0);
  const cs = (mueff + 2) / (n + mueff + 5), ds = 1 + cs, cc = 4 / (n + 4), c1 = 2 / ((n + 1.3) * (n + 1.3) + mueff);
  const cmu = Math.min(1 - c1, 2 * (mueff - 2 + 1 / mueff) / ((n + 2) * (n + 2) + mueff)) * (n + 2) / 3;
  const chiN = Math.sqrt(n) * (1 - 1 / (4 * n) + 1 / (21 * n * n));
  let ps = new Array(n).fill(0), pc = new Array(n).fill(0), best = { score: -Infinity };
  const log = [];
  for (let g = 0; g < generations; g++) {
    // The first generation's first candidate is the start itself.
    const us = Array.from({ length: lambda }, (_, k) => g === 0 && k === 0 && start ? m.slice() : m.map((mi, i) => Math.min(1, Math.max(0, mi + sigma * Math.sqrt(C[i]) * gauss()))));
    const rs = await Promise.all(us.map((u) => score(u)));
    const order = rs.map((_, i) => i).sort((a, b) => rs[b].score - rs[a].score);
    if (rs[order[0]].score > best.score) best = { score: rs[order[0]].score, u: us[order[0]], r: rs[order[0]], g };
    const old = m.slice();
    m = m.map((_, i) => order.slice(0, mu).reduce((a, k, j) => a + weights[j] * us[k][i], 0));
    const y = m.map((mi, i) => (mi - old[i]) / sigma);
    ps = ps.map((p, i) => (1 - cs) * p + Math.sqrt(cs * (2 - cs) * mueff) * y[i] / Math.sqrt(C[i]));
    const norm = Math.sqrt(ps.reduce((a, p) => a + p * p, 0));
    pc = pc.map((p, i) => (1 - cc) * p + Math.sqrt(cc * (2 - cc) * mueff) * y[i]);
    for (let i = 0; i < n; i++) {
      let rank = 0; for (let j = 0; j < mu; j++) { const d = (us[order[j]][i] - old[i]) / sigma; rank += weights[j] * d * d; }
      C[i] = (1 - c1 - cmu) * C[i] + c1 * pc[i] * pc[i] + cmu * rank;
    }
    sigma *= Math.exp((cs / ds) * (norm / chiN - 1));
    const median = rs.map((r) => r.score).sort((a, b) => a - b)[lambda >> 1];
    log.push({ g, best: +rs[order[0]].score.toFixed(4), median: +median.toFixed(4), sigma: +sigma.toFixed(3), errors: rs.filter((r) => r.error).length });
    onGeneration?.(log.at(-1), { best, mean: m, log });
  }
  return { best, mean: m, log };
}
