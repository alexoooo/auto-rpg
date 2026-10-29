/** The posture audit's search (`search`, research/core-posture-trials.mjs) with a margin objective: the most support margin at a share of at most `cap`. */
import { statics, knobsOf, rangesOf, seedAngles, SEEDS, random, marginOf } from "../../research/core-posture-trials.mjs";

const normal = (u) => () => Math.sqrt(-2 * Math.log(1 - u())) * Math.cos(2 * Math.PI * u());
function coordinates(row, knobs, ranges) {
  const base = row.symmetric ? 2 : 3;
  return { size: base + knobs.length,
    encode(p) { const z = [p.height / 2, p.pitch / Math.PI]; if (!row.symmetric) z.push(p.roll / Math.PI); for (const [i] of knobs) z.push((p.angles[i] - ranges[i].lo) / (ranges[i].hi - ranges[i].lo)); return z; },
    decode(z, from) { const angles = [...from.angles]; knobs.forEach((knob, k) => { const [i] = knob, u = Math.min(1, Math.max(0, z[base + k])); for (const j of knob) angles[j] = ranges[i].lo + u * (ranges[i].hi - ranges[i].lo); });
      return { height: 2 * z[0], pitch: Math.PI * z[1], roll: row.symmetric ? 0 : Math.PI * z[2], angles }; } };
}
/** A reading's score, least best: off its ground or overlapping 1000 up; unbalanced 100 + its miss; over the cap 10 + its share; else less its margin. */
export function marginScore(body, reading, cap) {
  if (reading.score >= 1000) return reading.score;
  if (!reading.solved.balanced) return reading.score;
  const margin = marginOf(reading.solved.bearing.map((b) => b.point), reading.centre);
  return reading.solved.share > cap ? 10 + reading.solved.share : -margin;
}
export function marginSearch(body, row, { seed = 0, evals = 1500, height, start, cap = .6 } = {}) {
  const ranges = rangesOf(body, "built"), knobs = knobsOf(body, row), coords = coordinates(row, knobs, ranges);
  const given = SEEDS[row.seed];
  const from = start ?? { height: 1, pitch: given.pitch, roll: 0, angles: seedAngles(body, given, ranges) };
  const uniform = random(seed * 7919 + 17), gauss = normal(uniform), D = coords.size;
  let mean = coords.encode(from);
  if (seed > 0 && !start) mean = mean.map((v, d) => (d === 0 ? v : d < (row.symmetric ? 2 : 3) ? v + 0.15 * gauss() : uniform()));
  const evaluate = (z) => { const r = statics(body, row, coords.decode(z, from), { height, knobs }); return { ...r, m: marginScore(body, r, cap) }; };
  let best = evaluate(mean); mean = coords.encode(best.posture);
  let sigma = seed > 0 && !start ? 0.25 : 0.08, used = 1;
  const lambda = 4 + Math.floor(3 * Math.log(D)), mu = Math.floor(lambda / 2);
  const raw = Array.from({ length: mu }, (_, i) => Math.log(mu + 0.5) - Math.log(i + 1)), total = raw.reduce((a, b) => a + b, 0);
  const weights = raw.map((w) => w / total), mueff = 1 / weights.reduce((s, w) => s + w * w, 0);
  const cs = (mueff + 2) / (D + mueff + 5), ds = 1 + 2 * Math.max(0, Math.sqrt((mueff - 1) / (D + 1)) - 1) + cs;
  const cc = 4 / (D + 4), c1 = 2 / ((D + 1.3) * (D + 1.3) + mueff) * (D + 2) / 3;
  const cmu = Math.min(1 - c1, 2 * (mueff - 2 + 1 / mueff) / ((D + 2) * (D + 2) + mueff) * (D + 2) / 3);
  const chiN = Math.sqrt(D) * (1 - 1 / (4 * D) + 1 / (21 * D * D));
  const C = new Array(D).fill(1), ps = new Array(D).fill(0), pc = new Array(D).fill(0);
  let stale = 0;
  while (used + lambda <= evals && sigma > 1e-4 && stale < 60) {
    const off = [];
    for (let k = 0; k < lambda; k++) { const y = Array.from({ length: D }, () => gauss()).map((g, d) => Math.sqrt(C[d]) * g); const r = evaluate(mean.map((m, d) => m + sigma * y[d])); off.push({ z: coords.encode(r.posture), r }); }
    used += lambda;
    off.sort((a, b) => a.r.m - b.r.m);
    if (off[0].r.m < best.m - 1e-6) { best = off[0].r; stale = 0; } else stale++;
    const old = mean;
    mean = Array.from({ length: D }, (_, d) => weights.reduce((s, w, i) => s + w * off[i].z[d], 0));
    const step = mean.map((m, d) => (m - old[d]) / sigma);
    for (let d = 0; d < D; d++) ps[d] = (1 - cs) * ps[d] + Math.sqrt(cs * (2 - cs) * mueff) * step[d] / Math.sqrt(C[d]);
    const psNorm = Math.sqrt(ps.reduce((s, v) => s + v * v, 0));
    const hsig = psNorm / Math.sqrt(1 - (1 - cs) ** (2 * used / lambda)) < (1.4 + 2 / (D + 1)) * chiN ? 1 : 0;
    for (let d = 0; d < D; d++) { pc[d] = (1 - cc) * pc[d] + hsig * Math.sqrt(cc * (2 - cc) * mueff) * step[d];
      const rank = weights.reduce((s, w, i) => { const y = (off[i].z[d] - old[d]) / sigma; return s + w * y * y; }, 0);
      C[d] = Math.max(1e-12, (1 - c1 - cmu) * C[d] + c1 * pc[d] * pc[d] + cmu * rank); }
    sigma *= Math.exp((cs / ds) * (psNorm / chiN - 1));
  }
  const snapped = statics(body, row, best.posture, { height, knobs, snap: true });
  const s = { ...snapped, m: marginScore(body, snapped, cap) };
  return { ...(s.m <= best.m + 1e-3 ? s : best), evals: used };
}
