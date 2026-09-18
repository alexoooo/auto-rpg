/**
 * Why a cloned mind goes silent against a body that does nothing.
 *
 * CS1 found that the DAgger clone throws **zero** strokes against `golem-idle` and raises `commit`
 * on none of its asks, while fighting the unseen `golem-brawler` perfectly well. CT4c then refused
 * the cheap explanation: a calibration that adds **+0.71** to the commit logit does not make it fire
 * once, so whatever kills the gate is further back than the output layer.
 *
 * This asks the two questions that are left, offline, over two collections of recorded asks:
 *
 * - **How far outside its training distribution is the clone standing?** Every feature is reported
 *   as the shift in the mind's own normalised units -- the z it reads, not the metres -- because a
 *   column the fit saw between -2 and +2 and now reads at -30 is one the first layer has never had
 *   a gradient for, and that is a different failure from one it simply disagrees with.
 * - **Which of those shifts actually moves `commit`?** A first-order attribution: the gradient of
 *   the commit logit with respect to each normalised input, averaged over the states in question,
 *   times how far that input moved. It is a linearisation of a tanh network and is quoted as one --
 *   it says where to look, not what the answer is.
 *
 * Usage: `node scripts/gate-probe.mjs <base collection> <other collection> [table]`
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadShards } from "./clone-policy.mjs";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");
const GATES = ["commit", "abort", "parry"];
const AXES = 9;

const argv = process.argv.slice(2);
const baseDir = argv[0] ?? "tournaments/cr-dagger1";
const otherDir = argv[1] ?? "tournaments/cs2-idle";
const tablePath = argv[2] ?? "snapshots/cr-dagger1.json";
/**
 * The five-sigma clip, as a knob, so that the question "is the clip the cause" can be asked without
 * refitting anything. Inference uses 5; passing something larger lets a bounded column reach the far
 * end of its own declared range and reports what the same weights then do there.
 */
const CLIP = Number(argv[3] ?? "5");

const table = JSON.parse(readFileSync(resolve(ROOT, tablePath), "utf8"));
const widths = [table.layout.inputs, ...table.layout.hidden, table.layout.outputs];
const W = Float64Array.from(table.weights);
const mean = table.normalisation.mean;
const sd = table.normalisation.variance.map((v) => Math.sqrt(v));
// The published names, from the same file inference reads them from, so a row here cannot drift
// out of step with the column it is naming.
const { pilotFeatureNames } = await import("../src/golem/pilot.ts");
const names = pilotFeatureNames(table.features ?? 1);

/** The forward pass, keeping every activation, because the backward pass needs them. */
function forward(input) {
  const acts = [input];
  let at = 0;
  let x = input;
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
    acts.push(y);
    x = y;
  }
  return acts;
}

/** d(logit[which]) / d(input), by reverse mode through the same tanh layers. */
function gradient(acts, which) {
  const offsets = [];
  let at = 0;
  for (let l = 0; l + 1 < widths.length; l += 1) { offsets.push(at); at += widths[l + 1] * (widths[l] + 1); }
  let g = new Float64Array(widths[widths.length - 1]);
  g[which] = 1;
  for (let l = widths.length - 2; l >= 0; l -= 1) {
    const n = widths[l];
    const m = widths[l + 1];
    const base = offsets[l];
    const up = new Float64Array(n);
    const y = acts[l + 1];
    const last = l + 2 === widths.length;
    for (let j = 0; j < m; j += 1) {
      const d = last ? g[j] : g[j] * (1 - y[j] * y[j]);
      if (d === 0) continue;
      const row = base + j * n;
      for (let k = 0; k < n; k += 1) up[k] += W[row + k] * d;
    }
    g = up;
  }
  return g;
}

function survey(dir, step) {
  const { flat, stride, columns, width, rows } = loadShards([resolve(ROOT, dir)]);
  const n = Math.floor(rows / step);
  const zSum = new Float64Array(columns);
  const gSum = new Float64Array(columns);
  const logit = new Float64Array(GATES.length);
  const square = new Float64Array(GATES.length);
  const fires = new Float64Array(GATES.length);
  const top = new Float64Array(GATES.length).fill(Number.NEGATIVE_INFINITY);
  const input = new Float64Array(columns);
  for (let i = 0; i < n; i += 1) {
    const at = (i * step) * stride;
    for (let k = 0; k < columns; k += 1) {
      const s = sd[k];
      const z = s < 1e-9 ? 0 : (flat[at + 1 + k] - mean[k]) / s;
      const c = z < -CLIP ? -CLIP : z > CLIP ? CLIP : z;
      input[k] = c;
      zSum[k] += z;
    }
    const acts = forward(input);
    const head = acts[acts.length - 1];
    for (let j = 0; j < GATES.length; j += 1) {
      logit[j] += head[AXES + j];
      square[j] += head[AXES + j] * head[AXES + j];
      if (head[AXES + j] > top[j]) top[j] = head[AXES + j];
      if (head[AXES + j] > 0) fires[j] += 1;
    }
    const g = gradient(acts, AXES);
    for (let k = 0; k < columns; k += 1) gSum[k] += g[k];
  }
  return {
    dir, rows, n, columns, width,
    z: Array.from(zSum, (v) => v / n),
    grad: Array.from(gSum, (v) => v / n),
    logit: Array.from(logit, (v) => v / n),
    // The spread is the whole of the idle story: a gate with a mean below zero still fires when it
    // moves, and one that has stopped moving never does however close to zero it has parked.
    sd: Array.from(square, (v, j) => Math.sqrt(Math.max(0, v / n - (logit[j] / n) ** 2))),
    fires: Array.from(fires, (v) => v / n),
    // The one number that settles whether a gate is suppressed or frozen: the closest it ever came.
    top: Array.from(top),
  };
}

const STEP = 9;
const a = survey(baseDir, STEP);
const b = survey(otherDir, STEP);
console.log(`gate probe: ${a.n} rows from ${a.dir}, ${b.n} from ${b.dir},`
  + ` table ${tablePath}, clip ${CLIP}`);
console.log("");
console.log("| gate | base mean | base sd | base max | base fires"
  + " | other mean | other sd | other max | other fires |");
console.log("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
for (let j = 0; j < GATES.length; j += 1) {
  console.log(`| ${GATES[j]} | ${a.logit[j].toFixed(2)} | ${a.sd[j].toFixed(2)}`
    + ` | ${a.top[j].toFixed(2)} | ${a.fires[j].toFixed(4)} | ${b.logit[j].toFixed(2)}`
    + ` | ${b.sd[j].toFixed(2)} | ${b.top[j].toFixed(2)} | ${b.fires[j].toFixed(4)} |`);
}

const shift = a.z.map((v, k) => b.z[k] - v);
const pull = shift.map((d, k) => d * (a.grad[k] + b.grad[k]) / 2);
const order = shift.map((_, k) => k).sort((p, q) => Math.abs(pull[q]) - Math.abs(pull[p]));
console.log("");
console.log("The twenty features that move the commit logit most, base to other:");
console.log("");
console.log("| feature | base z | other z | shift | d logit / d z | attributed |");
console.log("| --- | ---: | ---: | ---: | ---: | ---: |");
for (const k of order.slice(0, 20)) {
  console.log(`| \`${names[k] ?? k}\` | ${a.z[k].toFixed(2)} | ${b.z[k].toFixed(2)}`
    + ` | ${shift[k].toFixed(2)} | ${((a.grad[k] + b.grad[k]) / 2).toFixed(3)}`
    + ` | ${pull[k].toFixed(3)} |`);
}
console.log("");
console.log(`attributed total ${pull.reduce((s, v) => s + v, 0).toFixed(2)},`
  + ` actual logit move ${(b.logit[0] - a.logit[0]).toFixed(2)}`);
const far = shift.map((_, k) => k).filter((k) => Math.abs(b.z[k]) > 5);
console.log(`${far.length} features sit past the five-sigma clip in the other collection:`
  + ` ${far.map((k) => names[k] ?? k).join(", ") || "none"}`);
