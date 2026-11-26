/**
 * **Boosted trees**, as the fitted value and the move prior are fitted (`research/minds/fitted-value.mjs`,
 * `research/minds/move-prior.mjs`) and kept (`Trees`, `src/minds/option/predictions/value/boosted-trees.ts`): each
 * feature binned at its quantiles, then trees grown on a loss's gradients.
 */

/** Each feature's bin edges: up to `bins - 1` thresholds at its quantiles over a sample of the rows. */
export function binsOf(X, n, F, bins = 64, sample = 200000) {
  const edges = [], step = Math.max(1, Math.floor(n / sample));
  for (let f = 0; f < F; f++) {
    const v = []; for (let i = 0; i < n; i += step) v.push(X[i * F + f]);
    v.sort((a, b) => a - b);
    const e = []; for (let q = 1; q < bins; q++) { const t = v[Math.floor(q * v.length / bins)]; if (!e.length || t > e[e.length - 1]) e.push(t); }
    edges.push(Float32Array.from(e));
  }
  return edges;
}

/** Each row's bin of each feature: bin b where the value is at most edge b, the last above every edge. */
export function binned(X, n, F, edges) {
  const B = new Uint8Array(n * F);
  for (let i = 0; i < n; i++) for (let f = 0; f < F; f++) {
    const e = edges[f], x = X[i * F + f]; let lo = 0, hi = e.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (x <= e[m]) hi = m; else lo = m + 1; }
    B[i * F + f] = lo;
  }
  return B;
}

/**
 * **Boosted trees on a loss** over the rows `train` (binned `B`), from `base`: each round
 * `gradients(pred, g, h)` writes each fitted row's gradient and hessian at the trees' sum so far
 * (`pred`), and one tree grows level by level on a `subsample` of the rows and a `colsample` of the
 * features, split where the gain is most with at least `minLeaf` rows a side, its leaves the
 * Newton step shrunk by `lambda` and `rate`. Squared error's hessian is 1 (`squared`). Each tree
 * flat as the assets keep it (`Trees`). The draws are seeded: a fit of the same rows is the same.
 * `after(round, pred)`, where given, reads the sum after each round.
 */
export function boost(B, F, edges, n, train, gradients, { rounds, rate, depth, minLeaf, lambda, subsample, colsample, base }, after) {
  const pred = new Float64Array(n).fill(base), g = new Float64Array(n), h = new Float64Array(n), trees = [], bins = 256, GH = new Float64Array(F * bins * 3);
  let seed = 7; const draw = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (let round = 0; round < rounds; round++) {
    gradients(pred, g, h);
    const rows = train.filter(() => draw() < subsample), cols = []; for (let f = 0; f < F; f++) if (draw() < colsample) cols.push(f);
    const nodes = [], splits = [];
    const grow = (idx, level) => {
      const at = nodes.length; nodes.push(null);
      let G = 0, H = 0; for (const i of idx) { G += g[i]; H += h[i]; }
      const leaf = () => { nodes[at] = [-G / (H + lambda) * rate]; return at; };
      if (level >= depth || idx.length < 2 * minLeaf) return leaf();
      GH.fill(0);
      for (const i of idx) { const o = i * F; for (const f of cols) { const k = (f * bins + B[o + f]) * 3; GH[k] += g[i]; GH[k + 1] += h[i]; GH[k + 2]++; } }
      const parent = G * G / (H + lambda);
      let best = 1e-9, bf = -1, bb = -1;
      for (const f of cols) {
        let gl = 0, hl = 0, nl = 0;
        for (let b = 0; b < edges[f].length; b++) {
          const k = (f * bins + b) * 3; gl += GH[k]; hl += GH[k + 1]; nl += GH[k + 2];
          if (nl < minLeaf) continue; if (idx.length - nl < minLeaf) break;
          const gr = G - gl, hr = H - hl, gain = gl * gl / (hl + lambda) + gr * gr / (hr + lambda) - parent;
          if (gain > best) { best = gain; bf = f; bb = b; }
        }
      }
      if (bf < 0) return leaf();
      const below = [], above = []; for (const i of idx) (B[i * F + bf] <= bb ? below : above).push(i);
      const node = [bf, edges[bf][bb], 0, 0]; nodes[at] = node; splits[at] = bb;
      node[2] = grow(below, level + 1); node[3] = grow(above, level + 1);
      return at;
    };
    grow(rows, 0);
    trees.push(nodes);
    for (let i = 0; i < n; i++) { let k = 0; while (nodes[k].length > 1) k = B[i * F + nodes[k][0]] <= splits[k] ? nodes[k][2] : nodes[k][3]; pred[i] += nodes[k][0]; }
    after?.(round, pred);
  }
  return { trees, pred };
}

/** Squared error's gradients toward `y` over the rows `train` (`boost`). */
export const squared = (train, y) => (pred, g, h) => { for (const i of train) { g[i] = pred[i] - y[i]; h[i] = 1; } };
