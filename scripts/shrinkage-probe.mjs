/**
 * What a calibration actually changed, read in command space rather than in logits.
 *
 * Offline and cheap: it loads the recorded `(pilot features, driver command)` pairs a DAgger round
 * left behind, runs the clone forward over every ninth row, and reports three things a side.
 *
 * - **The driver's own spread per axis.** Three of the nine come back at exactly zero -- the
 *   hand-coded mind holds `standOff`, `targetLateral` and `reach` constant across every ask it has
 *   ever been recorded making. A clone fitted on that data reproduces the constant perfectly and
 *   has no variation to learn from, so those rows are invisible to anything that starts from one.
 * - **The ratio of the driver's spread to the clone's**, which is the shrinkage a least-squares fit
 *   would have introduced. It is what a per-axis gain would have to undo if shrinkage were the
 *   mechanism. CT5 ran this and the ratios do not track the genes: they are not.
 * - **The calibration applied to the clone's own mean**, decoded through `COMMAND_RANGES`, which is
 *   the only form in which "reach 0.700 to 1.000" is a sentence about a sword rather than about a
 *   weight.
 *
 * Usage: `node scripts/shrinkage-probe.mjs` -- the paths are the CR round and CT3's genes, which is
 * all this has ever been pointed at; widen it when there is a second thing to point it at.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadShards } from "./clone-policy.mjs";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");
const AXES = ["standOff", "strafe", "lean", "advance", "targetHeight",
  "targetLateral", "reach", "swing", "bite"];
const GATES = ["commit", "abort", "parry"];
const GENES = JSON.parse(readFileSync(resolve(ROOT, "tournaments/ct/ct3-gen11-genes.json"), "utf8")).genes;

const table = JSON.parse(readFileSync(resolve(ROOT, "snapshots/cr-dagger1.json"), "utf8"));
const widths = [table.layout.inputs, ...table.layout.hidden, table.layout.outputs];
const W = Float64Array.from(table.weights);
const mean = table.normalisation.mean;
const sd = table.normalisation.variance.map((v) => Math.sqrt(v));

function forward(input) {
  let x = input;
  let at = 0;
  for (let l = 0; l + 1 < widths.length; l += 1) {
    const n = widths[l];
    const m = widths[l + 1];
    const last = l + 2 === widths.length;
    const y = new Float64Array(m);
    for (let j = 0; j < m; j += 1) {
      let sum = W[at + m * n + j];
      const row = at + j * n;
      for (let k = 0; k < n; k += 1) sum += W[row + k] * x[k];
      y[j] = last ? sum : Math.tanh(sum);
    }
    at += m * (n + 1);
    x = y;
  }
  return x;
}

const { flat, stride, columns, width, rows } = loadShards([resolve(ROOT, "tournaments/cr-dagger1")]);
const STEP = 9;
const n = Math.floor(rows / STEP);
const pred = Array.from({ length: width }, () => []);
const want = Array.from({ length: width }, () => []);
const input = new Float64Array(columns);
for (let i = 0; i < n; i += 1) {
  const base = (i * STEP) * stride;
  for (let k = 0; k < columns; k += 1) {
    const s = sd[k];
    const z = s < 1e-9 ? 0 : (flat[base + 1 + k] - mean[k]) / s;
    input[k] = z < -5 ? -5 : z > 5 ? 5 : z;
  }
  const head = forward(input);
  for (let j = 0; j < width; j += 1) {
    pred[j].push(head[j]);
    want[j].push(flat[base + 1 + columns + j]);
  }
}

const stat = (a) => {
  const m = a.reduce((s, x) => s + x, 0) / a.length;
  const v = a.reduce((s, x) => s + (x - m) * (x - m), 0) / a.length;
  return { mean: m, sd: Math.sqrt(v) };
};

console.log(`shrinkage diagnostic: ${n} rows of ${rows}, every ${STEP}th, clone snapshots/cr-dagger1.json`);
console.log("");
console.log("| axis | driver sd | clone sd | driver/clone | CT3 gain | driver mean | clone mean | CT3 offset |");
console.log("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
const ratios = [];
const gains = [];
for (let j = 0; j < AXES.length; j += 1) {
  const p = stat(pred[j]);
  const w = stat(want[j]);
  const ratio = p.sd < 1e-9 ? NaN : w.sd / p.sd;
  const gain = Math.exp(GENES[j]);
  ratios.push(ratio);
  gains.push(gain);
  console.log(`| ${AXES[j]} | ${w.sd.toFixed(4)} | ${p.sd.toFixed(4)} | ${ratio.toFixed(4)}`
    + ` | ${gain.toFixed(4)} | ${w.mean.toFixed(4)} | ${p.mean.toFixed(4)}`
    + ` | ${GENES[AXES.length + j].toFixed(4)} |`);
}
console.log("");
for (let j = 0; j < GATES.length; j += 1) {
  const p = stat(pred[AXES.length + j]);
  const w = stat(want[AXES.length + j]);
  console.log(`${GATES[j]}: driver rate ${w.mean.toFixed(4)}, clone logit mean ${p.mean.toFixed(4)}`
    + ` sd ${p.sd.toFixed(4)}, clone fires ${pred[AXES.length + j].filter((x) => x > 0).length / n}`
    + `, CT3 offset ${GENES[AXES.length * 2 + j].toFixed(4)}`);
}

// The decode `commandFromAction` applies, so a number below is metres or a fraction and not a
// logit. A gain-and-offset is affine, so the calibrated mean is exact -- except where it clamps,
// which is the whole of what happened to `reach` and is worth seeing happen.
const RANGES = [[0, 2], [-1, 1], [-1, 1], [-1, 1], [0, 1], [-1, 1], [-1, 1], [0, 1], [0, 1]];
const decode = (j, a) => {
  const [lo, hi] = RANGES[j];
  const clipped = a < -1 ? -1 : a > 1 ? 1 : a;
  return (lo + hi) / 2 + ((hi - lo) / 2) * clipped;
};
console.log("");
console.log("In command space -- what the calibration changed, decoded through COMMAND_RANGES:");
console.log("");
console.log("| axis | driver | driver sd | clone | ct3 | clamped |");
console.log("| --- | ---: | ---: | ---: | ---: | --- |");
for (let j = 0; j < AXES.length; j += 1) {
  const p = stat(pred[j]);
  const w = stat(want[j]);
  const after = p.mean * Math.exp(GENES[j]) + GENES[AXES.length + j];
  const half = (RANGES[j][1] - RANGES[j][0]) / 2;
  console.log(`| ${AXES[j]} | ${decode(j, w.mean).toFixed(3)} | ${(w.sd * half).toExponential(2)}`
    + ` | ${decode(j, p.mean).toFixed(3)} | ${decode(j, after).toFixed(3)}`
    + ` | ${Math.abs(after) > 1 ? "yes" : ""} |`);
}

const corr = (a, b) => {
  const ma = a.reduce((s, x) => s + x, 0) / a.length;
  const mb = b.reduce((s, x) => s + x, 0) / b.length;
  let num = 0; let da = 0; let db = 0;
  for (let i = 0; i < a.length; i += 1) {
    num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2;
  }
  return num / Math.sqrt(da * db);
};
console.log("");
// The three axes the driver holds constant have no ratio to correlate -- a zero spread is not a
// small one -- so the shrinkage question is asked only of the six that move.
const live = ratios.map((r, j) => [r, gains[j]]).filter(([r]) => Number.isFinite(r) && r > 0);
console.log("");
console.log(`correlation of log(driver/clone) with the CT3 log-gene, over the ${live.length} axes`
  + ` the driver actually varies: ${corr(live.map(([r]) => Math.log(r)),
    live.map(([, g]) => Math.log(g))).toFixed(4)}`);
console.log(`the other ${ratios.length - live.length} have a driver spread of exactly zero:`
  + ` ${AXES.filter((_, j) => !(Number.isFinite(ratios[j]) && ratios[j] > 0)).join(", ")}`);
