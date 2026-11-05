// A quadruped's righting recipe, found by search: `node scripts/skills/recovery/righting/righting.mjs --model rat [--write]`.
//
// The recipe (`RightingRecipe`, src/skills/recovery/righting/righting.ts) is a few poses of the legs, neck and
// tail, each held until the trunk is up to its mark or for its time; the search (CMA-ES, Hansen's
// standard settings) chooses them for the body lying on its right side. Each candidate plays from
// every start in --starts (lying:heading in degrees; a left start plays it mirrored), and from every
// fight in --forks where its righting took the body (`righting-forks.mjs`), through the
// game's own mind (`righting-worker.mjs`, Node stand, Rapier, 120 Hz), and scores its worst start
// and its mean alike: the trunk's up and height at the end, less the time down in the last 2 s,
// with a bonus for handing back early. --seed-from starts from a recipe's poses (its side's where
// it has none of the part); --part back searches the poses for the body on its back, over --base's
// recipe; --write keeps the best as the model's
// record in assets/skills/recovery/righting/righting.json (`research/skills/framework/skill-records.mjs`). Options: --gens 50 --pop 24 --workers 19 --frames 3 --seconds 9
// --sigma .4 --seed 1.
import { fork } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { deserialize } from "node:v8";
import { writeRecord } from "../../../../research/skills/framework/skill-records.mjs";
import { reptileSpec } from "../../../../src/core/bodies/quadruped/spec.ts";
import { bodyKey } from "../../../../src/core/bodies/spec/body.ts";

const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i < 0 ? fallback : process.argv[i + 1]; };
const MODEL = arg("model", "rat"), GENS = Number(arg("gens", 50)), POP = Number(arg("pop", 24)), WORKERS = Number(arg("workers", 19));
const FRAMES = Number(arg("frames", 3)), SECONDS = Number(arg("seconds", 9));
const FORKS = arg("forks") ? resolve(arg("forks")) : null;
const STARTS = [...arg("starts", "right:0,right:30,right:135,right:270,left:0,left:120,tilted:45,tilted:250").split(",").filter(Boolean)
  .map((s) => { const [lying, degrees] = s.split(":"); return { lying, heading: Number(degrees) * Math.PI / 180 }; }),
  ...FORKS ? deserialize(readFileSync(FORKS)).map((f, fork) => ({ lying: "fork", fork, gap: f.gap, clock: f.clock })) : []];
const ROOT = resolve(import.meta.dirname, "../..");
const data = JSON.parse(readFileSync(resolve(ROOT, `assets/${MODEL}/body.json`), "utf8"));
const standing = data.segments.find((s) => s.name === "trunk").proximal[1];

// The recipe's settings the search does not choose: the reference pose held 1 s before it reads
// how it lies, the reptile's posture servo time, the trunk's up and the centre's speed that it
// holds .25 s to hand back, and the seconds of poses before it has timed out.
const FIXED = { settle: 1, servo: .15, upright: .95, calm: .1, still: .25, limit: 6 };
// The searched freedoms: the hips', the knees' and elbows', the neck's and the tail's base.
const CHANNELS = data.joints.filter((j) => /^(girdle|bend)\.|^neck$|^tail\.base$/.test(j.name))
  .flatMap((j) => j.limits.map((limits, axis) => ({ name: `${j.name} axis${axis}`, limits })));
const PER = CHANNELS.length + 2, DIM = PER * FRAMES;
const HOLD = [.2, 1.5], MARK = 1.05;
const toUnit = (v) => (Math.tanh(v) + 1) / 2, fromUnit = (u) => Math.atanh(Math.min(.999, Math.max(-.999, 2 * u - 1)));
const PART = arg("part", "side"), BASE = arg("base") ? JSON.parse(readFileSync(arg("base"), "utf8")) : null;
if (PART !== "side" && !BASE) throw new Error(`--part ${PART} needs --base, the recipe its side's poses are from`);
const poses = (x) => Array.from({ length: FRAMES }, (_, k) => {
  const g = x.slice(k * PER, (k + 1) * PER);
  return { targets: Object.fromEntries(CHANNELS.map((c, i) => [c.name, c.limits[0] + toUnit(g[i]) * (c.limits[1] - c.limits[0])])),
    hold: HOLD[0] + toUnit(g[PER - 2]) * (HOLD[1] - HOLD[0]), up: MARK * toUnit(g[PER - 1]) };
});
const decode = (x) => ({ ...FIXED, ...BASE ? { side: BASE.side, back: BASE.back } : {}, [PART]: poses(x) });
const encode = (recipe) => (recipe[PART] ?? recipe.side).flatMap((f) => [...CHANNELS.map((c) => fromUnit(((f.targets[c.name] ?? 0) - c.limits[0]) / (c.limits[1] - c.limits[0]))),
  fromUnit((f.hold - HOLD[0]) / (HOLD[1] - HOLD[0])), fromUnit(f.up / MARK)]);
const scoreOf = (r) => 2 * r.up + 2 * r.height / standing - r.down + (r.handed === null ? 0 : 1 - r.handed / SECONDS);

const pool = [], waiting = new Map();
let nextId = 0;
await Promise.all(Array.from({ length: WORKERS }, () => new Promise((ok) => {
  const w = fork(resolve(import.meta.dirname, "righting-worker.mjs"), [], { stdio: ["ignore", "ignore", "inherit", "ipc"] });
  w.on("message", (m) => { if (m.ready) { pool.push(w); ok(); return; } const done = waiting.get(m.id); waiting.delete(m.id); done(m); });
})));
const free = [...pool], queue = [];
const pump = () => {
  while (free.length && queue.length) {
    const w = free.pop(), { job, ok } = queue.shift(), id = nextId++;
    waiting.set(id, (m) => { free.push(w); ok(m); pump(); });
    w.send({ ...job, id });
  }
};
const run = (job) => new Promise((ok) => { queue.push({ job, ok }); pump(); });
const evaluate = async (x) => {
  const recipe = decode(x), answers = await Promise.all(STARTS.map(({ lying, heading, fork }) => run({ data, model: MODEL, recipe, lying, heading, forks: FORKS, fork, seconds: SECONDS })));
  const failed = answers.find((a) => a.error);
  if (failed) throw new Error(failed.error);
  const scores = answers.map((a) => scoreOf(a.result)), worst = Math.min(...scores);
  return { score: (worst + scores.reduce((a, b) => a + b, 0) / scores.length) / 2, scores, results: answers.map((a) => a.result), recipe };
};

// CMA-ES.
let seed = Number(arg("seed", 1));
const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const gauss = () => { let u = 0; while (u === 0) u = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand()); };
const n = DIM, lambda = POP, mu = Math.floor(lambda / 2);
const raw = Array.from({ length: mu }, (_, i) => Math.log(mu + .5) - Math.log(i + 1)), sum = raw.reduce((a, b) => a + b), w = raw.map((v) => v / sum);
const mueff = 1 / w.reduce((a, b) => a + b * b, 0);
const cc = (4 + mueff / n) / (n + 4 + 2 * mueff / n), cs = (mueff + 2) / (n + mueff + 5);
const c1 = 2 / ((n + 1.3) ** 2 + mueff), cmu = Math.min(1 - c1, 2 * (mueff - 2 + 1 / mueff) / ((n + 2) ** 2 + mueff));
const damps = 1 + 2 * Math.max(0, Math.sqrt((mueff - 1) / (n + 1)) - 1) + cs, chiN = Math.sqrt(n) * (1 - 1 / (4 * n) + 1 / (21 * n * n));
const from = arg("seed-from");
let mean = from ? encode(JSON.parse(readFileSync(from, "utf8"))) : new Array(n).fill(0), sigma = Number(arg("sigma", from ? .4 : .8));
if (mean.length !== n) throw new Error(`--seed-from has ${mean.length / PER} poses, not ${FRAMES}`);
let pc = new Array(n).fill(0), ps = new Array(n).fill(0), B, D;
const C = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => i === j ? 1 : 0));
const eigen = () => { // Jacobi rotations: C = B diag(D)^2 B'.
  const A = C.map((r) => [...r]), V = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => i === j ? 1 : 0));
  for (let sweep = 0; sweep < 50; sweep++) {
    let off = 0;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += A[p][q] ** 2;
    if (off < 1e-20) break;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
      if (Math.abs(A[p][q]) < 1e-15) continue;
      const theta = (A[q][q] - A[p][p]) / (2 * A[p][q]), t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < n; k++) { const a = A[k][p], b = A[k][q]; A[k][p] = c * a - s * b; A[k][q] = s * a + c * b; }
      for (let k = 0; k < n; k++) { const a = A[p][k], b = A[q][k]; A[p][k] = c * a - s * b; A[q][k] = s * a + c * b; }
      for (let k = 0; k < n; k++) { const a = V[k][p], b = V[k][q]; V[k][p] = c * a - s * b; V[k][q] = s * a + c * b; }
    }
  }
  B = V; D = A.map((r, i) => Math.sqrt(Math.max(1e-20, r[i])));
};
eigen();
let best = { score: -Infinity };
const started = Date.now();
for (let gen = 0; gen < GENS; gen++) {
  const ys = [], xs = [];
  for (let k = 0; k < lambda; k++) {
    const z = Array.from({ length: n }, gauss), y = B.map((row) => row.reduce((s, b, j) => s + b * D[j] * z[j], 0));
    ys.push(y); xs.push(mean.map((m, i) => m + sigma * y[i]));
  }
  const results = await Promise.all(xs.map(evaluate));
  const order = results.map((_, i) => i).sort((a, b) => results[b].score - results[a].score), top = results[order[0]];
  if (top.score > best.score) best = top;
  const old = mean;
  mean = new Array(n).fill(0);
  for (let k = 0; k < mu; k++) for (let i = 0; i < n; i++) mean[i] += w[k] * xs[order[k]][i];
  const yw = mean.map((m, i) => (m - old[i]) / sigma);
  const t = D.map((d, j) => B.reduce((s, row, i) => s + row[j] * yw[i], 0) / d), whitened = B.map((row) => row.reduce((s, b, j) => s + b * t[j], 0));
  ps = ps.map((p, i) => (1 - cs) * p + Math.sqrt(cs * (2 - cs) * mueff) * whitened[i]);
  const norm = Math.sqrt(ps.reduce((a, b) => a + b * b, 0)), hsig = norm / Math.sqrt(1 - (1 - cs) ** (2 * (gen + 1))) / chiN < 1.4 + 2 / (n + 1) ? 1 : 0;
  pc = pc.map((p, i) => (1 - cc) * p + hsig * Math.sqrt(cc * (2 - cc) * mueff) * yw[i]);
  for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) {
    let rank = 0;
    for (let k = 0; k < mu; k++) rank += w[k] * ys[order[k]][i] * ys[order[k]][j];
    C[i][j] = C[j][i] = (1 - c1 - cmu) * C[i][j] + c1 * (pc[i] * pc[j] + (1 - hsig) * cc * (2 - cc) * C[i][j]) + cmu * rank;
  }
  sigma *= Math.exp((cs / damps) * (norm / chiN - 1));
  eigen();
  console.log(`gen ${gen} best ${top.score.toFixed(3)} [${top.scores.map((s) => s.toFixed(2)).join(" ")}] all-time ${best.score.toFixed(3)} sigma ${sigma.toFixed(3)} ${((Date.now() - started) / 1000).toFixed(0)} s`);
}
for (const worker of pool) worker.kill();
const starts = STARTS.map((s, i) => ({ ...s, ...best.results[i] }));
console.log(JSON.stringify({ starts, score: best.score }));
if (process.argv.includes("--write")) {
  const made = `Found on the ${MODEL} by scripts/skills/recovery/righting/righting.mjs: CMA-ES over each pose's angles of the hips, knees and elbows, the neck and the tail's base, its hold and its mark, each candidate played through the game's mind (Node stand, Rapier, 120 Hz) and scored on its worst start and its mean; ${STARTS.length} starts, score ${best.score.toFixed(2)}.`;
  writeRecord("righting", bodyKey(reptileSpec(data, MODEL, `${MODEL}-anatomy`)), made, best.recipe);
} else {
  const out = arg("out", resolve(ROOT, `.tmp/righting/${MODEL}.json`));
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(best.recipe, null, 2) + "\n");
}
