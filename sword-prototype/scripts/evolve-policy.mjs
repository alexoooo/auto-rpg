// CT: evolution instead of a gradient, over a mind small enough for one to work on.
//
//   node scripts/evolve-policy.mjs distil [--in DIR,DIR] [--columns core|all] [--ridge 1]
//                                         [--out tournaments/ct/seed.json]
//   node scripts/evolve-policy.mjs evolve [--genome PATH] [--generations 40] [--lambda 16]
//                                         [--seeds 16] [--cap 40] [--sigma 0.1]
//                                         [--opponent golem-fencer] [--draw-weight 0.25]
//                                         [--out PATH]
//   node scripts/evolve-policy.mjs calibrate [--table snapshots/cr-dagger1.json] [--sigma 0.15]
//                                            [--generations 40] [--lambda 16] [--seeds 24]
//                                            [--cap 60] [--opponent golem-fencer] [--out PATH]
//
// ## The argument, which is empirical rather than fashionable
//
// **The one optimiser in this tree that ever produced a mind everything else is measured against is
// the `(1+lambda)` ES in `scripts/tune.mjs`**, which tuned `golem-fencer`'s 62 numbers. PPO has
// never shipped anything here, and thirteen sessions say why: a per-step advantage read off a
// return, divided by its own noise, has no reproducible content in this cell at any batch size the
// project can afford. Evolution needs none of that. It needs whole policies *ranked*, which is
// exactly what a paired bout table already produces, and it is immune to the failure that killed
// the gradient because it never forms a per-step signal at all.
//
// The honest caveat is parameter count: gradient-free search scales badly with it, and the shipped
// actor is 87,308 weights. So this evolves the compact mind in `compact-policy.mjs` -- 240 numbers
// over the nineteen columns `driver.ts` actually consults, or 864 over all seventy-one -- and the
// reason to think that is enough is no longer an argument from source code. CR measured the
// expert's whole output and found **five effective degrees of freedom**.
//
// ## Why `distil` comes before `evolve`
//
// Evolution from a random start is a long shot. Evolution seeded from a mind that already fights is
// a search with somewhere to stand, and CR collected 326,868 labelled asks that cost one run. The
// distillation is a ridge regression -- closed form, seconds, no hyper-parameters worth arguing
// about -- and it answers a question worth having on its own: **can a linear map express this
// expert at all?** If it can, the 87,308-weight actor was never the necessary shape. If it cannot,
// the number says how much shape is missing before any generation is spent finding out.
//
// Gate targets are regressed onto **-1 and +1**, not 0 and 1, because a compact gate fires when its
// output is above **zero**. Regressing onto {0, 1} and thresholding at zero would build a mind that
// raises every gate on every ask.
//
// ## `calibrate`, and why it exists beside the compact mind rather than instead of it
//
// The compact route pays for a searchable parameter count by **throwing the clone away**: a linear
// map over the pilot's columns is not the 87,308-weight mind CR fitted, it is a fresh mind fitted to
// the same labels, and the distillation measured what that costs. The third mode pays nothing. It
// **freezes the clone** and searches a 21-number calibration of its output layer: a gain and an
// offset on each of the nine axis means, and an offset on each of the three gate logits.
//
// The reparameterisation is exact and needs no change to `policy.ts`. An output is `w . h + b`, so
// scaling row `j` of the final layer by `g` and writing the bias as `g * b + c` makes the head read
// `g * (w . h + b) + c` -- which is the calibration, applied where it belongs, before any clip and
// before the gate is thresholded. **The zero genome is the clone, bit for bit**, so the search
// starts at a mind that already fights and every generation is a comparison against it.
//
// Twenty-one numbers is a space a `(1+lambda)` can actually cover, and it is aimed at the one
// residual CR4 measured: the clone completes *every* stroke it starts against the driver's half,
// because it raises `abort` at moments the latch does not sample. A gate offset is exactly the
// knob that moves. Gate *gains* are not in the genome: only the sign of a gate logit is read, so a
// positive gain changes nothing and a negative one inverts the gate, and neither is a search
// direction worth spending a generation on.

import { availableParallelism } from "node:os";
import { execFile } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  COMPACT_OUTPUTS, columnsOf, compactSize, compactTable,
} from "./compact-policy.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const NL = /\r?\n/;
const AXES = 9;

const flagOf = (argv, name, fallback) => {
  const at = argv.indexOf(name);
  return at === -1 || at + 1 >= argv.length ? fallback : argv[at + 1];
};

const mean = (xs) => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length);

// ------------------------------------------------------------------------------------ the distil

/**
 * Solve `(A) x = b` in place by Gaussian elimination with partial pivoting.
 *
 * Small and dense -- twenty to seventy-two rows -- so there is nothing to be gained from anything
 * cleverer, and a pivot is the difference between a solution and a division by a column that some
 * feature happened to make constant.
 */
export function solve(A, b, n) {
  for (let col = 0; col < n; col += 1) {
    let best = col;
    for (let r = col + 1; r < n; r += 1) {
      if (Math.abs(A[r * n + col]) > Math.abs(A[best * n + col])) best = r;
    }
    if (best !== col) {
      for (let k = 0; k < n; k += 1) {
        const t = A[col * n + k]; A[col * n + k] = A[best * n + k]; A[best * n + k] = t;
      }
      const t = b[col]; b[col] = b[best]; b[best] = t;
    }
    const pivot = A[col * n + col];
    if (Math.abs(pivot) < 1e-12) continue;
    for (let r = col + 1; r < n; r += 1) {
      const f = A[r * n + col] / pivot;
      if (f === 0) continue;
      for (let k = col; k < n; k += 1) A[r * n + k] -= f * A[col * n + k];
      b[r] -= f * b[col];
    }
  }
  const x = new Float64Array(n);
  for (let r = n - 1; r >= 0; r -= 1) {
    let sum = b[r];
    for (let k = r + 1; k < n; k += 1) sum -= A[r * n + k] * x[k];
    const pivot = A[r * n + r];
    x[r] = Math.abs(pivot) < 1e-12 ? 0 : sum / pivot;
  }
  return x;
}

async function distil(argv) {
  const dirs = flagOf(argv, "--in", "tournaments/cr-clone,tournaments/cr-dagger1")
    .split(",").map((d) => d.trim()).filter((d) => d !== "");
  const which = flagOf(argv, "--columns", "core");
  const ridge = Number(flagOf(argv, "--ridge", "1"));
  const out = flagOf(argv, "--out", "tournaments/ct/seed.json");

  const { loadShards } = await import("./clone-policy.mjs");
  const { PILOT_FEATURE_NAMES } = await import("../src/golem/pilot.ts");
  const { COMMAND_AXES, COMMAND_GATES } = await import("../src/golem/tactics-v4.ts");

  const { flat, stride, columns: width, rows, bouts } =
    loadShards(dirs.map((d) => resolve(ROOT, d)));
  const picked = columnsOf(which, 1);
  const m = picked.length;

  // Held out by bout, as the big fit is, so the two numbers are comparable rather than merely
  // similar-looking: a linear map read on training rows would flatter itself exactly here.
  const heldBouts = new Set();
  for (let b = 0; b < bouts; b += 1) if (b % 5 === 0) heldBouts.add(b);
  const train = [];
  const held = [];
  for (let i = 0; i < rows; i += 1) (heldBouts.has(flat[i * stride]) ? held : train).push(i);

  const norm = { mean: new Float64Array(m), sd: new Float64Array(m) };
  for (const i of train) {
    for (let k = 0; k < m; k += 1) norm.mean[k] += flat[i * stride + 1 + picked[k]];
  }
  for (let k = 0; k < m; k += 1) norm.mean[k] /= Math.max(1, train.length);
  for (const i of train) {
    for (let k = 0; k < m; k += 1) {
      const d = flat[i * stride + 1 + picked[k]] - norm.mean[k];
      norm.sd[k] += d * d;
    }
  }
  for (let k = 0; k < m; k += 1) norm.sd[k] = Math.sqrt(norm.sd[k] / Math.max(1, train.length));

  const n = m + 1;
  const row = new Float64Array(n);
  const readRow = (i) => {
    for (let k = 0; k < m; k += 1) {
      const sd = norm.sd[k];
      const x = sd < 1e-9 ? 0 : (flat[i * stride + 1 + picked[k]] - norm.mean[k]) / sd;
      row[k] = x < -5 ? -5 : x > 5 ? 5 : x;
    }
    row[m] = 1;
    return row;
  };
  /** The target for output `j`: an axis as it stands, a gate mapped onto -1 and +1. */
  const targetOf = (i, j) => {
    const t = flat[i * stride + 1 + width + j];
    return j < AXES ? t : 2 * t - 1;
  };

  // One Gram matrix for every output, because the design matrix is shared: this is the whole cost
  // of the distillation and it is O(rows * n^2) once rather than once an output.
  const gram = new Float64Array(n * n);
  const rhs = Array.from({ length: COMPACT_OUTPUTS }, () => new Float64Array(n));
  for (const i of train) {
    const x = readRow(i);
    for (let a = 0; a < n; a += 1) {
      const xa = x[a];
      if (xa === 0) continue;
      for (let b = a; b < n; b += 1) gram[a * n + b] += xa * x[b];
      for (let j = 0; j < COMPACT_OUTPUTS; j += 1) rhs[j][a] += xa * targetOf(i, j);
    }
  }
  for (let a = 0; a < n; a += 1) for (let b = 0; b < a; b += 1) gram[a * n + b] = gram[b * n + a];

  const genome = new Float64Array(compactSize(m));
  for (let j = 0; j < COMPACT_OUTPUTS; j += 1) {
    const A = Float64Array.from(gram);
    // The bias is not shrunk -- a constant axis is held entirely in its bias, and penalising that
    // would pull five of the nine axes off the value the expert never varies.
    for (let a = 0; a < m; a += 1) A[a * n + a] += ridge;
    const w = solve(A, Float64Array.from(rhs[j]), n);
    for (let a = 0; a < m; a += 1) genome[a * COMPACT_OUTPUTS + j] = w[a];
    genome[m * COMPACT_OUTPUTS + j] = w[m];
  }

  // Scored exactly as the big fit scores, so the two tables may be read against each other.
  const sse = new Array(AXES).fill(0);
  const sum = new Array(AXES).fill(0);
  const sumsq = new Array(AXES).fill(0);
  const right = new Array(3).fill(0);
  const ones = new Array(3).fill(0);
  for (const i of held) {
    const x = readRow(i);
    for (let j = 0; j < COMPACT_OUTPUTS; j += 1) {
      let said = genome[m * COMPACT_OUTPUTS + j];
      for (let k = 0; k < m; k += 1) said += genome[k * COMPACT_OUTPUTS + j] * x[k];
      if (j < AXES) {
        const t = flat[i * stride + 1 + width + j];
        const clipped = said < -1 ? -1 : said > 1 ? 1 : said;
        sse[j] += (clipped - t) ** 2;
        sum[j] += t;
        sumsq[j] += t * t;
      } else {
        const bit = flat[i * stride + 1 + width + j];
        if ((said > 0 ? 1 : 0) === bit) right[j - AXES] += 1;
        ones[j - AXES] += bit;
      }
    }
  }
  const h = Math.max(1, held.length);
  console.log(`distil: ${rows} rows, ${train.length} train / ${held.length} held out,`
    + ` ${which} columns (${m}) -> ${genome.length} numbers, ridge ${ridge}`);
  console.log("");
  console.log("| axis | driver sd | R2 held out |");
  console.log("| --- | ---: | ---: |");
  const live = [];
  for (let j = 0; j < AXES; j += 1) {
    const sd = Math.sqrt(Math.max(0, sumsq[j] / h - (sum[j] / h) ** 2));
    const r2 = sd < 0.02 ? null : 1 - (sse[j] / h) / (sd * sd);
    if (r2 !== null) live.push(r2);
    console.log(`| ${COMMAND_AXES[j]} | ${sd.toFixed(4)}`
      + ` | ${r2 === null ? "flat" : r2.toFixed(4)} |`);
  }
  console.log("");
  console.log("| gate | raised | agreement | majority | lift |");
  console.log("| --- | ---: | ---: | ---: | ---: |");
  for (let j = 0; j < 3; j += 1) {
    const rate = ones[j] / h;
    const agree = right[j] / h;
    const base = Math.max(rate, 1 - rate);
    console.log(`| ${COMMAND_GATES[j]} | ${rate.toFixed(4)} | ${agree.toFixed(4)}`
      + ` | ${base.toFixed(4)} | ${(base >= 1 ? 0 : (agree - base) / (1 - base)).toFixed(4)} |`);
  }
  console.log("");
  console.log(`linear R2 ${mean(live).toFixed(4)} over ${live.length} live axes`);

  const table = compactTable(genome, {
    columns: picked, norm, features: 1,
    note: `CT distil: ridge ${ridge} over ${train.length} asks from ${dirs.join(" + ")},`
      + ` ${which} columns. The seed evolution starts from.`,
  });
  table.names = picked.map((at) => PILOT_FEATURE_NAMES[at]);
  mkdirSync(dirname(resolve(ROOT, out)), { recursive: true });
  writeFileSync(resolve(ROOT, out), `${JSON.stringify(table)}\n`);
  console.log(`wrote ${out}`);
}

// ------------------------------------------------------------------------------- the calibration

/** Nine log-gains and nine offsets for the axis means, then three offsets for the gate logits. */
export const CALIBRATION_GENES = AXES * 2 + 3;

/**
 * A policy table with its output layer rescaled and shifted, which is the same mind seen through a
 * calibration rather than a different mind that resembles it.
 *
 * `out[j] = w[j] . h + b[j]`, so `g * out[j] + c` is `(g * w[j]) . h + (g * b[j] + c)`. The gain is
 * carried as a **logarithm** so that the zero genome is the identity and a step is multiplicative:
 * a search stepping additively on a gain would cross zero and invert an axis on the way past.
 */
export function calibrated(table, genes) {
  const widths = [table.layout.inputs, ...table.layout.hidden, table.layout.outputs];
  let at = 0;
  for (let l = 0; l + 2 < widths.length; l += 1) at += widths[l + 1] * (widths[l] + 1);
  const n = widths[widths.length - 2];
  const m = widths[widths.length - 1];
  if (m !== COMPACT_OUTPUTS) {
    throw new Error(`a calibration wants a ${COMPACT_OUTPUTS}-wide head; this table's is ${m}`);
  }
  if (genes.length !== CALIBRATION_GENES) {
    throw new Error(`a calibration is ${CALIBRATION_GENES} numbers; given ${genes.length}`);
  }
  const weights = Float64Array.from(table.weights);
  for (let j = 0; j < m; j += 1) {
    // A gate reads only the sign of its logit, so it takes an offset and no gain.
    const gain = j < AXES ? Math.exp(genes[j]) : 1;
    const shift = j < AXES ? genes[AXES + j] : genes[AXES * 2 + (j - AXES)];
    const row = at + j * n;
    for (let k = 0; k < n; k += 1) weights[row + k] *= gain;
    weights[at + m * n + j] = weights[at + m * n + j] * gain + shift;
  }
  return { ...table, weights: Array.from(weights) };
}

// ------------------------------------------------------------------------------------ the evolve

/** One candidate over some seeds, in a child. Returns the mean score and what it did. */
async function cell({ weights, spec, seeds, cap, opponent, kind = "compact", table = null }) {
  const { freshHavok, runBout } = await import("./bout-runner.mjs");
  const { compactPilot } = await import("./compact-policy.mjs");
  const { golemPolicy } = await import("../src/golem/policy.ts");
  const { GOLEM_TACTICS_V4, golemDriven } = await import("../src/golem/tactics-v4.ts");
  const { golemFencer } = await import("../src/golem/tactics-v2.ts");
  const { golemDriver, DRIVER } = await import("../src/golem/styles/driver.ts");
  const { golemBrawler } = await import("../src/golem/styles/brawler.ts");
  const { defaultGolemSetup } = await import("../src/golem/build.ts");

  const physics = await freshHavok();
  const genome = Float64Array.from(weights);
  // Built once a child rather than once a bout: a calibrated table is 87,308 numbers and rebuilding
  // it per seed would cost more than the bouts do.
  const loaded = kind === "calibrate"
    ? calibrated(JSON.parse(readFileSync(resolve(ROOT, table), "utf8")), genome) : null;
  let score = 0;
  let wins = 0;
  let draws = 0;
  let strokes = 0;
  let aborts = 0;
  let damage = 0;
  let taken = 0;
  let decided = 0;
  for (const seed of seeds) {
    let driven = null;
    let leftMind = null;
    if (loaded === null) {
      driven = golemDriven(seed, GOLEM_TACTICS_V4, compactPilot(genome, spec));
      leftMind = { name: "golem-compact", driven, decide: (v, dt) => driven.decide(v, dt) };
    } else {
      // Greedy, as every rating in this record is: the calibration moves the mean of the head, and
      // a candidate drawn from its own spread would be scored on the draw and not on the change.
      const mind = golemPolicy(seed, loaded, GOLEM_TACTICS_V4, null, false, null);
      driven = mind.driven;
      leftMind = { name: "golem-calibrated", driven, decide: (v, dt) => mind.decide(v, dt) };
    }
    const right = opponent === "golem-driver" ? golemDriver(seed + 17, DRIVER)
      : opponent === "golem-brawler" ? golemBrawler(seed + 17) : golemFencer(seed + 17);
    const rightMind = opponent === "golem-driver"
      ? { name: "golem-driver", driven: right, decide: (v, dt) => right.decide(v, dt) } : right;
    const bout = runBout({
      left: leftMind.name, right: opponent,
      leftUnit: "golem", rightUnit: "golem",
      leftGolem: defaultGolemSetup(), rightGolem: defaultGolemSetup(),
      locomotionMode: "supported", seeds: [seed, seed + 17], maxSeconds: cap, physics,
      leftMind, rightMind,
    });
    score += bout.winner === "left" ? 1 : bout.winner === null ? 0.5 : 0;
    if (bout.winner === "left") wins += 1;
    if (bout.winner === null) draws += 1;
    if (bout.winner !== null) decided += 1;
    strokes += driven.strokes;
    aborts += driven.aborts;
    damage += bout.left.damage;
    taken += bout.right.damage;
  }
  const n = seeds.length;
  return {
    score: score / n, wins: wins / n, draws: draws / n, decided: decided / n,
    strokes: strokes / n, completion: strokes === 0 ? 0 : (strokes - aborts) / strokes,
    damage: damage / n, taken: taken / n,
  };
}

/**
 * What selection actually climbs, which is deliberately not the score.
 *
 * **A score of 0.5 for a draw makes standing still a winning strategy**, and this is not a
 * hypothetical: CR2 found the shipped policy scoring 0.5117 against `golem-fencer` on a `decided`
 * of 0.3984 -- it draws three fights in five by stalling out a 60-second cap, takes 35.5 damage
 * where the driver takes 59.5, and collects the draw. A `(1+lambda)` handed that objective would
 * find the same hole faster than any gradient did, because search is very good at holes.
 *
 * So a draw is worth `drawWeight`, a quarter by default: less than half a win, so a mind that
 * fights and sometimes wins outranks a mind that never loses because it never fights. **The
 * reported `score` stays the record's own win-draw-loss number** so that a row here can be read
 * against CR2's table; only the ranking uses this.
 */
const fitnessOf = (r, drawWeight) => r.wins + drawWeight * r.draws;

/** A Gaussian pair from a uniform stream, which is all an ES needs of its randomness. */
function gaussian(rnd) {
  const u = Math.max(1e-12, rnd());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd());
}

/**
 * A `(1+lambda)` over whatever `entryOf` turns a genome into, with the parent re-scored every
 * generation on fresh seeds.
 *
 * Shared by both modes on purpose. The two searches differ only in what a genome *is* -- 240 or 864
 * numbers that are a whole mind, or 21 that are a calibration of one -- and a second copy of the
 * loop would be a second set of selection rules to keep in step with this one.
 */
async function runSearch({
  start, generations, lambda, count, cap, opponent, drawWeight, base, sigma, entryOf, write,
}) {
  let parent = Float64Array.from(start);
  let rng = (base ^ 0x5eed) >>> 0;
  const rnd = () => {
    rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0;
    return rng / 4294967296;
  };

  const runOne = (c) => new Promise((done) => {
    execFile(process.execPath, [process.argv[1], "--child", JSON.stringify(c)], {
      encoding: "utf8", cwd: ROOT, maxBuffer: 1 << 26,
    }, (error, stdout, stderr) => {
      const line = (stdout ?? "").split(NL).find((l) => l.startsWith("|CELL|"));
      if (line === undefined) {
        const why = (stderr ?? "").trim().split(NL).filter((l) => l.trim() !== "").pop();
        done({ failed: why ?? "no output", score: -1 });
      } else done(JSON.parse(line.slice(6)));
    });
  });

  const lanes = Math.max(1, Math.min(availableParallelism(), lambda + 1));
  console.log("");
  console.log(`a draw is worth ${drawWeight} in selection; the score column stays win-draw-loss`);
  console.log("");
  console.log("| gen | sigma | parent fit | best fit | score | decided | strokes"
    + " | completion | kept |");
  console.log("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |");

  let parentScore = null;
  for (let gen = 1; gen <= generations; gen += 1) {
    // Fresh seeds every generation, and **the parent is re-scored on them**. A parent carried on
    // last generation's seeds is a parent scored on the draw it was selected for, which is how a
    // (1+lambda) run climbs a seed set rather than a skill.
    const seeds = Array.from({ length: count }, () => base + Math.floor(rnd() * 1e6));
    const children = Array.from({ length: lambda }, () => {
      const w = Float64Array.from(parent);
      for (let k = 0; k < w.length; k += 1) w[k] += sigma * gaussian(rnd);
      return w;
    });
    const plan = [parent, ...children].map((weights) => entryOf(weights, seeds, cap, opponent));
    const results = new Array(plan.length);
    let next = 0;
    const lane = async () => {
      while (next < plan.length) {
        const at = next++;
        results[at] = await runOne(plan[at]);
      }
    };
    await Promise.all(Array.from({ length: lanes }, lane));

    const fit = results.map((r) => (r.failed ? -1 : fitnessOf(r, drawWeight)));
    let bestAt = 0;
    for (let i = 1; i < results.length; i += 1) if (fit[i] > fit[bestAt]) bestAt = i;
    const best = results[bestAt];
    const kept = bestAt !== 0;
    if (kept) parent = children[bestAt - 1];
    parentScore = best.score;
    // The one-fifth rule, on whether a child beat the parent at all: too many wins means the step
    // is small enough that everything is uphill, too few that it is stepping past the hill.
    const better = fit.slice(1).filter((f) => f > fit[0]).length;
    sigma *= better > lambda / 5 ? 1.15 : 0.9;
    sigma = Math.min(1, Math.max(1e-3, sigma));

    console.log(`| ${gen} | ${sigma.toFixed(4)} | ${fit[0].toFixed(4)}`
      + ` | ${fit[bestAt].toFixed(4)} | ${best.score.toFixed(4)} | ${best.decided.toFixed(3)}`
      + ` | ${best.strokes.toFixed(1)} | ${best.completion.toFixed(3)}`
      + ` | ${kept ? "child" : "parent"} |`);

    write(parent, gen, parentScore, fit[bestAt]);
  }
  return { parent, score: parentScore };
}

async function evolve(argv) {
  const genomePath = flagOf(argv, "--genome", "tournaments/ct/seed.json");
  const generations = Number(flagOf(argv, "--generations", "40"));
  const lambda = Number(flagOf(argv, "--lambda", "16"));
  const count = Number(flagOf(argv, "--seeds", "16"));
  const cap = Number(flagOf(argv, "--cap", "40"));
  const opponent = flagOf(argv, "--opponent", "golem-fencer");
  const drawWeight = Number(flagOf(argv, "--draw-weight", "0.25"));
  const out = flagOf(argv, "--out", "tournaments/ct/evolved.json");
  const base = Number(flagOf(argv, "--seed", "20260921"));
  const sigma = Number(flagOf(argv, "--sigma", "0.1"));

  const table = JSON.parse(readFileSync(resolve(ROOT, genomePath), "utf8"));
  const spec = { columns: table.columns, norm: table.norm, features: table.features };

  console.log(`evolve: ${table.weights.length} numbers over ${table.columns.length} columns,`
    + ` (1+${lambda}) against ${opponent}, ${count} seeds a candidate at cap ${cap} s,`
    + ` ${generations} generations`);

  const { score } = await runSearch({
    start: table.weights, generations, lambda, count, cap, opponent, drawWeight, base, sigma,
    entryOf: (weights, seeds) => ({
      kind: "compact", weights: Array.from(weights), spec, seeds, cap, opponent,
    }),
    write: (parent, gen, parentScore, fit) => {
      const written = compactTable(parent, {
        columns: table.columns, norm: table.norm, features: table.features,
        note: `CT evolve: generation ${gen} of ${generations}, (1+${lambda}) against ${opponent},`
          + ` ${count} seeds a candidate, draw weight ${drawWeight},`
          + ` score ${parentScore.toFixed(4)} at fitness ${fit.toFixed(4)}.`,
      });
      written.names = table.names;
      mkdirSync(dirname(resolve(ROOT, out)), { recursive: true });
      writeFileSync(resolve(ROOT, out), `${JSON.stringify(written)}\n`);
    },
  });
  console.log("");
  console.log(`wrote ${out} at ${score === null ? "nothing" : score.toFixed(4)}`);
}

async function calibrate(argv) {
  const tablePath = flagOf(argv, "--table", "snapshots/cr-dagger1.json");
  const generations = Number(flagOf(argv, "--generations", "40"));
  const lambda = Number(flagOf(argv, "--lambda", "16"));
  const count = Number(flagOf(argv, "--seeds", "24"));
  const cap = Number(flagOf(argv, "--cap", "60"));
  const opponent = flagOf(argv, "--opponent", "golem-fencer");
  const drawWeight = Number(flagOf(argv, "--draw-weight", "0.25"));
  const out = flagOf(argv, "--out", "tournaments/ct/calibrated.json");
  const genesOut = flagOf(argv, "--genes", "tournaments/ct/calibration.json");
  const base = Number(flagOf(argv, "--seed", "20260922"));
  const sigma = Number(flagOf(argv, "--sigma", "0.15"));

  const { COMMAND_AXES, COMMAND_GATES } = await import("../src/golem/tactics-v4.ts");
  const table = JSON.parse(readFileSync(resolve(ROOT, tablePath), "utf8"));
  console.log(`calibrate: ${CALIBRATION_GENES} numbers over the output layer of ${tablePath},`
    + ` (1+${lambda}) against ${opponent}, ${count} seeds a candidate at cap ${cap} s,`
    + ` ${generations} generations`);
  console.log("");
  console.log("generation 0 is the clone itself: the zero genome is the identity calibration,"
    + " so the parent row of generation 1 is that mind's own fitness on those seeds");

  const { parent, score } = await runSearch({
    // **Zero, always.** The point of this mode is that the search begins at a mind that already
    // fights, and any other start would give that up for nothing.
    start: new Float64Array(CALIBRATION_GENES),
    generations, lambda, count, cap, opponent, drawWeight, base, sigma,
    entryOf: (weights, seeds) => ({
      kind: "calibrate", weights: Array.from(weights), spec: null, table: tablePath,
      seeds, cap, opponent,
    }),
    write: (genes, gen, parentScore, fit) => {
      const note = `CT calibrate: generation ${gen} of ${generations}, (1+${lambda}) against`
        + ` ${opponent}, ${count} seeds a candidate, draw weight ${drawWeight},`
        + ` score ${parentScore.toFixed(4)} at fitness ${fit.toFixed(4)}.`
        + ` A ${CALIBRATION_GENES}-number calibration of an output layer, folded in.`;
      mkdirSync(dirname(resolve(ROOT, out)), { recursive: true });
      writeFileSync(resolve(ROOT, genesOut), `${JSON.stringify({
        kind: "calibration", table: tablePath, genes: Array.from(genes), generation: gen, note,
      }, null, 2)}\n`);
      writeFileSync(resolve(ROOT, out),
        `${JSON.stringify({ ...calibrated(table, genes), note })}\n`);
    },
  });
  console.log("");
  console.log("| gene | gain | offset |");
  console.log("| --- | ---: | ---: |");
  for (let j = 0; j < AXES; j += 1) {
    console.log(`| ${COMMAND_AXES[j]} | ${Math.exp(parent[j]).toFixed(4)}`
      + ` | ${parent[AXES + j].toFixed(4)} |`);
  }
  for (let j = 0; j < 3; j += 1) {
    console.log(`| ${COMMAND_GATES[j]} | -- | ${parent[AXES * 2 + j].toFixed(4)} |`);
  }
  console.log("");
  console.log(`wrote ${out} and ${genesOut} at ${score === null ? "nothing" : score.toFixed(4)}`);
}

async function main(argv) {
  const what = argv[0] ?? "distil";
  if (what === "distil") return distil(argv.slice(1));
  if (what === "evolve") return evolve(argv.slice(1));
  if (what === "calibrate") return calibrate(argv.slice(1));
  throw new Error(`evolve-policy takes "distil", "evolve" or "calibrate", not "${what}"`);
}

const RUN_AS = process.argv[1] ?? "";
const childAt = process.argv.indexOf("--child");
if (RUN_AS.endsWith("evolve-policy.mjs") && childAt !== -1) {
  cell(JSON.parse(process.argv[childAt + 1]))
    .then((o) => console.log(`|CELL|${JSON.stringify(o)}`))
    .catch((error) => { console.error(error); process.exit(1); });
} else if (RUN_AS.endsWith("evolve-policy.mjs")) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
