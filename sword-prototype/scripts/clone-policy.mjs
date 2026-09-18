// Behaviour cloning from `golem-driver`: start at a hand-coded mind's competence, not at random.
// Cell CR of the learn set.
//
//   node scripts/clone-policy.mjs collect [--bouts 256] [--opponent golem-fencer] [--cap 60]
//                                         [--seed 20260918] [--out DIR]
//   node scripts/clone-policy.mjs fit [--in DIR] [--epochs 40] [--batch 256] [--rate 0.001]
//                                     [--out snapshots/cr-clone.json]
//
// ## Why this needs no gradient, and why that is the whole argument
//
// Thirteen sessions of record say the actor gradient has no reproducible content against a mind
// that fights back, and AW back-computed the bill: **4,800-9,200 bouts an iteration** for a
// half-useful direction, against the 32 every run in the record actually used. That is a property
// of the *policy-gradient estimator* -- an advantage read off a return, divided by its own noise --
// and not of the data.
//
// Supervised regression has no advantage estimate, no reward table and no rollout variance. Every
// ask of every driver bout is a free labelled example: the pilot is a function from 71 features to
// a 12-field command, and `watchedPilot` hands us both halves. So the 150-300x starvation simply
// does not apply here, and the sample count is whatever we care to run.
//
// ## The seam, which is smaller than the plan expected
//
// CR was planned as a `decisionRecorder` in `tournament-worker.mjs` plus a `pilot` kind in
// `scripts/decision-log.mjs`. **Neither is needed.** `golemDriven(seed, T, pilot)` takes the pilot
// as an argument and `watchedPilot(pilot, onAsk)` already wraps one, so the recording happens here
// and no shared file moves. The features are computed by calling `pilotFeatures` in the hook, which
// is the same function `golemPolicy` calls on the same step from the same reading -- one ask, one
// row, identical columns.
//
// ## What it cannot fix, and what comes next
//
// Behaviour cloning has exactly one reliable failure mode: the clone's own small errors walk it
// into states the driver never visited, where it has been taught nothing. The standard fix is
// DAgger -- run the clone, collect the states *it* reaches, and ask the driver what it would have
// done there -- which is cheap here in a way it never is with human demonstrations, because the
// expert is a function we can call on any state. That is the second round and it is not this file's
// first result.

import { availableParallelism } from "node:os";
import { execFile } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const NL = /\r?\n/;

const flagOf = (argv, name, fallback) => {
  const at = argv.indexOf(name);
  return at === -1 || at + 1 >= argv.length ? fallback : argv[at + 1];
};

// ------------------------------------------------------------------------------ the target action

/**
 * The inverse of `commandFromAction`: what the head would have had to emit to write this command.
 *
 * The nine axes are the command's own value mapped onto its published range, which is exactly the
 * decode run backwards -- `AXIS_CENTRE + AXIS_HALF * a`, solved for `a` and clipped, because a
 * driver row outside its own range is a row the executor would have clamped anyway.
 *
 * **The three gates are a threshold at zero, not at a half.** `meanAction` reads
 * `head[gateAt + j] > 0`, and only then does `commandFromAction` see a value that is already one or
 * nought. A clone fitted to regress its gate logit toward 1.0 would be fitted against the wrong
 * decision boundary; the target here is the *bit*, and the loss below is logistic on it.
 */
export function actionFromCommand(command, ranges, axes, gates) {
  const out = new Float64Array(axes.length + gates.length);
  for (let j = 0; j < axes.length; j += 1) {
    const [low, high] = ranges[axes[j]];
    const centre = (low + high) / 2;
    const half = (high - low) / 2;
    const a = half === 0 ? 0 : (command[axes[j]] - centre) / half;
    out[j] = a < -1 ? -1 : a > 1 ? 1 : a;
  }
  for (let j = 0; j < gates.length; j += 1) {
    out[axes.length + j] = command[gates[j]] >= 0.5 ? 1 : 0;
  }
  return out;
}

// ---------------------------------------------------------------------------------- the collector

/** One shard: some seeds of driver-against-opponent, every ask written down as a row. */
async function collect({ seeds, cap, opponent, file }) {
  const { freshHavok, runBout } = await import("./bout-runner.mjs");
  const { golemDriver, DRIVER } = await import("../src/golem/styles/driver.ts");
  const { golemFencer } = await import("../src/golem/tactics-v2.ts");
  const { golemBrawler } = await import("../src/golem/styles/brawler.ts");
  const { defaultGolemSetup } = await import("../src/golem/build.ts");
  const { COMMAND_AXES, COMMAND_GATES, COMMAND_RANGES } = await import("../src/golem/tactics-v4.ts");
  const { POLICY_WEIGHTS } = await import("../src/golem/policy-weights.ts");
  const { pilotFeatures, pilotFeatureCount, pilotTrace } = await import("../src/golem/pilot.ts");

  const columns = pilotFeatureCount(POLICY_WEIGHTS.features);
  const width = COMMAND_AXES.length + COMMAND_GATES.length;
  const physics = await freshHavok();
  const rows = [];
  let bouts = 0;

  for (const seed of seeds) {
    // A trace a bout, because a version-2 observation is a function of what this body has seen
    // since the bell -- carrying one across bouts would label every row with a history the policy
    // will never have at inference.
    const trace = POLICY_WEIGHTS.features >= 2 ? pilotTrace() : null;
    const raw = new Float64Array(columns);
    const driven = golemDriver(seed, DRIVER, (reading, view, command) => {
      pilotFeatures(reading, view, raw, trace);
      const target = actionFromCommand(command, COMMAND_RANGES, COMMAND_AXES, COMMAND_GATES);
      const row = new Float64Array(1 + columns + width);
      row[0] = bouts;
      row.set(raw, 1);
      row.set(target, 1 + columns);
      rows.push(row);
    });
    const right = opponent === "golem-brawler" ? golemBrawler(seed + 17) : golemFencer(seed + 17);
    runBout({
      left: "golem-driver", right: opponent,
      leftUnit: "golem", rightUnit: "golem",
      leftGolem: defaultGolemSetup(), rightGolem: defaultGolemSetup(),
      locomotionMode: "supported", seeds: [seed, seed + 17], maxSeconds: cap, physics,
      leftMind: {
        name: "golem-driver", driven, decide: (v, dt) => driven.decide(v, dt),
      },
      rightMind: right,
    });
    bouts += 1;
  }

  const stride = 1 + columns + width;
  const flat = new Float64Array(rows.length * stride);
  for (let i = 0; i < rows.length; i += 1) flat.set(rows[i], i * stride);
  writeFileSync(file, Buffer.from(flat.buffer, flat.byteOffset, flat.byteLength));
  return { file, rows: rows.length, stride, columns, width, bouts };
}

/** Every shard back as one block, with the bout ids made unique across shards. */
function loadShards(dir) {
  const meta = JSON.parse(readFileSync(resolve(dir, "meta.json"), "utf8"));
  const { columns, width } = meta;
  const stride = 1 + columns + width;
  const parts = [];
  let total = 0;
  let boutBase = 0;
  for (const shard of meta.shards) {
    const buffer = readFileSync(resolve(dir, shard.file));
    const block = new Float64Array(
      buffer.buffer, buffer.byteOffset, buffer.byteLength / Float64Array.BYTES_PER_ELEMENT,
    );
    // A shard numbered its bouts from zero, so without this every shard's bout 0 would be one
    // group and the held-out split would leak across shards rather than hold a bout out.
    for (let i = 0; i < block.length; i += stride) block[i] += boutBase;
    boutBase += shard.bouts;
    parts.push(block);
    total += block.length / stride;
  }
  const flat = new Float64Array(total * stride);
  let at = 0;
  for (const part of parts) { flat.set(part, at); at += part.length; }
  return { flat, stride, columns, width, rows: total, bouts: boutBase, meta };
}

// ------------------------------------------------------------------------------------ the fit

/** Column means and variances over the training rows, which is what `normalise` reads. */
function normalisationOf(flat, stride, columns, pick) {
  const mean = new Array(columns).fill(0);
  const variance = new Array(columns).fill(0);
  for (const i of pick) {
    for (let k = 0; k < columns; k += 1) mean[k] += flat[i * stride + 1 + k];
  }
  for (let k = 0; k < columns; k += 1) mean[k] /= Math.max(1, pick.length);
  for (const i of pick) {
    for (let k = 0; k < columns; k += 1) {
      const d = flat[i * stride + 1 + k] - mean[k];
      variance[k] += d * d;
    }
  }
  for (let k = 0; k < columns; k += 1) variance[k] /= Math.max(1, pick.length);
  return { count: pick.length, mean, variance };
}

const sigmoid = (x) => 1 / (1 + Math.exp(-x));

async function fit(argv) {
  const dir = flagOf(argv, "--in", resolve(ROOT, "tournaments/cr-clone"));
  const epochs = Number(flagOf(argv, "--epochs", "40"));
  const batch = Number(flagOf(argv, "--batch", "256"));
  const rate = Number(flagOf(argv, "--rate", "0.001"));
  const out = flagOf(argv, "--out", "snapshots/cr-clone.json");
  const holdFraction = Number(flagOf(argv, "--holdout", "0.2"));

  // Below this the driver simply does not move the axis over the block, and a ratio against that
  // spread is a number about the denominator rather than about the clone. Reported as `flat`.
  const LIVE_SD = 0.02;
  const { forward, backwardFrom, initWeights, netScratch, netSize } =
    await import("../src/golem/neural-net.ts");
  const { POLICY_WEIGHTS } = await import("../src/golem/policy-weights.ts");
  const { headSpecOfTable, normalise, policyLayout } = await import("../src/golem/policy.ts");

  const spec = headSpecOfTable(POLICY_WEIGHTS);
  if (spec.kinds.some((k) => k !== "gaussian")) {
    // A beta axis is two softplus parameters and a categorical is a bin vote; both want a different
    // loss, and quietly fitting a squared error onto them would produce a table that loads, runs,
    // and is wrong in a way no gate would catch.
    throw new Error(`clone-policy fits a gaussian head; this table's axes are ${spec.kinds}`);
  }
  const { flat, stride, columns, width, rows, bouts } = loadShards(dir);
  const layout = policyLayout(POLICY_WEIGHTS.features, spec);
  if (layout.inputs !== columns) {
    throw new Error(`the shards carry ${columns} columns; the layout reads ${layout.inputs}`);
  }
  const axes = spec.at.length;
  const gates = width - axes;

  // Held out **by bout**, not by row. Twelve asks a second off one bout are not twelve independent
  // observations, and a row-wise split would put a state's own neighbours on both sides of the
  // wall and report a memorised frame as generalisation.
  const heldBouts = new Set();
  const every = Math.max(1, Math.round(1 / Math.max(1e-9, holdFraction)));
  for (let b = 0; b < bouts; b += 1) if (b % every === 0) heldBouts.add(b);
  const train = [];
  const held = [];
  for (let i = 0; i < rows; i += 1) {
    (heldBouts.has(flat[i * stride]) ? held : train).push(i);
  }

  const norm = normalisationOf(flat, stride, columns, train);
  const weights = initWeights(layout, 20260918);
  const grad = new Float64Array(netSize(layout));
  const scratch = netScratch(layout);
  const input = new Float64Array(columns);
  const rawRow = new Float64Array(columns);
  const delta = new Float64Array(layout.outputs);
  // Adam, because the columns are on wildly different scales even after normalisation and a plain
  // step size that suits the gate logits is far too large for the axes.
  const m = new Float64Array(weights.length);
  const v = new Float64Array(weights.length);
  const b1 = 0.9;
  const b2 = 0.999;
  let step = 0;

  const readInto = (i, into) => {
    for (let k = 0; k < columns; k += 1) rawRow[k] = flat[i * stride + 1 + k];
    normalise(rawRow, norm, into);
  };

  /** Mean squared error a column and gate accuracy, on whichever block is handed in. */
  const score = (pick) => {
    const sse = new Array(axes).fill(0);
    const sum = new Array(axes).fill(0);
    const sumsq = new Array(axes).fill(0);
    const right = new Array(gates).fill(0);
    const ones = new Array(gates).fill(0);
    for (const i of pick) {
      readInto(i, input);
      const head = forward(layout, weights, input, scratch);
      for (let j = 0; j < axes; j += 1) {
        const t = flat[i * stride + 1 + columns + j];
        const e = head[spec.at[j]] - t;
        sse[j] += e * e;
        sum[j] += t;
        sumsq[j] += t * t;
      }
      for (let j = 0; j < gates; j += 1) {
        const t = flat[i * stride + 1 + columns + axes + j];
        const said = head[spec.gateAt + j] > 0 ? 1 : 0;
        if (said === t) right[j] += 1;
        ones[j] += t;
      }
    }
    const n = Math.max(1, pick.length);
    // R-squared against the driver's own spread on that axis, which is the only baseline that
    // means anything: an axis the driver never moves is trivially predictable and must not be
    // allowed to report as a success.
    const sd = sum.map((_, j) => Math.sqrt(Math.max(0, sumsq[j] / n - (sum[j] / n) ** 2)));
    const r2 = sse.map((e, j) => (sd[j] < LIVE_SD ? null : 1 - (e / n) / (sd[j] * sd[j])));
    // **A gate agreement is unreadable without its base rate.** `commit` raised on four asks in
    // five would hand a constant predictor 0.80, which is most of the way to a bar stated in the
    // nineties. What is reported is the lift over always guessing the majority class, so a clone
    // that has learned nothing about when to swing scores zero rather than 0.80.
    const base = ones.map((o) => Math.max(o / n, 1 - o / n));
    const agree = right.map((r) => r / n);
    return {
      r2, sd, mse: sse.map((e) => e / n), gate: agree, base,
      lift: agree.map((a, j) => (base[j] >= 1 ? 0 : (a - base[j]) / (1 - base[j]))),
      rate: ones.map((o) => o / n),
    };
  };

  console.log(`clone: ${rows} rows over ${bouts} bouts, ${train.length} train`
    + ` / ${held.length} held out, ${netSize(layout)} weights`);

  const order = Uint32Array.from(train);
  let seed = 20260918 >>> 0;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let epoch = 1; epoch <= epochs; epoch += 1) {
    for (let i = order.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rnd() * (i + 1));
      const t = order[i]; order[i] = order[j]; order[j] = t;
    }
    let loss = 0;
    for (let start = 0; start < order.length; start += batch) {
      const end = Math.min(order.length, start + batch);
      grad.fill(0);
      for (let at = start; at < end; at += 1) {
        const i = order[at];
        readInto(i, input);
        const head = forward(layout, weights, input, scratch);
        delta.fill(0);
        for (let j = 0; j < axes; j += 1) {
          const e = head[spec.at[j]] - flat[i * stride + 1 + columns + j];
          delta[spec.at[j]] = e;
          loss += 0.5 * e * e;
        }
        for (let j = 0; j < gates; j += 1) {
          // Logistic on the bit, so the gradient is the same `p - t` shape as the axes and the
          // decision boundary the loss pushes against is the one `meanAction` actually reads.
          const p = sigmoid(head[spec.gateAt + j]);
          const t = flat[i * stride + 1 + columns + axes + j];
          delta[spec.gateAt + j] = p - t;
          loss -= t * Math.log(p + 1e-12) + (1 - t) * Math.log(1 - p + 1e-12);
        }
        backwardFrom(layout, weights, input, scratch, delta, grad);
      }
      const n = end - start;
      step += 1;
      const c1 = 1 - b1 ** step;
      const c2 = 1 - b2 ** step;
      for (let k = 0; k < weights.length; k += 1) {
        const g = grad[k] / n;
        m[k] = b1 * m[k] + (1 - b1) * g;
        v[k] = b2 * v[k] + (1 - b2) * g * g;
        weights[k] -= rate * (m[k] / c1) / (Math.sqrt(v[k] / c2) + 1e-8);
      }
    }
    if (epoch % 5 === 0 || epoch === epochs || epoch === 1) {
      const s = score(held);
      const live = s.r2.filter((x) => x !== null);
      const meanR2 = live.length === 0
        ? NaN : live.reduce((a, b) => a + b, 0) / live.length;
      console.log(`  epoch ${String(epoch).padStart(3)}  train loss`
        + ` ${(loss / Math.max(1, order.length)).toFixed(4)}`
        + `  held R2 ${meanR2.toFixed(4)} over ${live.length}/${axes} live`
        + `  gate lift ${s.lift.map((g) => g.toFixed(3)).join(" ")}`);
    }
  }

  const final = score(held);
  const { COMMAND_AXES, COMMAND_GATES } = await import("../src/golem/tactics-v4.ts");
  console.log("");
  console.log("| axis | driver sd | R2 on held-out bouts | rmse |");
  console.log("| --- | ---: | ---: | ---: |");
  for (let j = 0; j < axes; j += 1) {
    console.log(`| ${COMMAND_AXES[j]} | ${final.sd[j].toFixed(4)}`
      + ` | ${final.r2[j] === null ? "flat" : final.r2[j].toFixed(4)}`
      + ` | ${Math.sqrt(final.mse[j]).toFixed(4)} |`);
  }
  console.log("");
  console.log("| gate | raised | agreement | majority | lift |");
  console.log("| --- | ---: | ---: | ---: | ---: |");
  for (let j = 0; j < gates; j += 1) {
    console.log(`| ${COMMAND_GATES[j]} | ${final.rate[j].toFixed(4)}`
      + ` | ${final.gate[j].toFixed(4)} | ${final.base[j].toFixed(4)}`
      + ` | ${final.lift[j].toFixed(4)} |`);
  }
  const liveR2 = final.r2.filter((x) => x !== null);
  console.log("");
  console.log(`held-out R2 ${(liveR2.reduce((a, b) => a + b, 0)
    / Math.max(1, liveR2.length)).toFixed(4)} meaned over ${liveR2.length} live axes of ${axes};`
    + ` commit lift ${final.lift[0].toFixed(4)}`);

  const table = {
    ...POLICY_WEIGHTS,
    weights: Array.from(weights),
    normalisation: norm,
    seed: 20260918,
    date: new Date().toISOString().slice(0, 10),
    iterations: epochs,
    bouts,
    steps: train.length,
    note: `CR: behaviour cloning from golem-driver over ${bouts} bouts, ${train.length} asks.`
      + " Supervised regression onto the pilot surface -- no advantage, no reward, no rollout.",
  };
  mkdirSync(dirname(resolve(ROOT, out)), { recursive: true });
  writeFileSync(resolve(ROOT, out), `${JSON.stringify(table)}\n`);
  console.log("");
  console.log(`wrote ${out}`);
}

// ------------------------------------------------------------------------------------- the driver

async function main(argv) {
  const what = argv[0] ?? "collect";
  if (what === "fit") return fit(argv.slice(1));
  if (what !== "collect") throw new Error(`clone-policy takes "collect" or "fit", not "${what}"`);

  const rest = argv.slice(1);
  const count = Number(flagOf(rest, "--bouts", "256"));
  const cap = Number(flagOf(rest, "--cap", "60"));
  const base = Number(flagOf(rest, "--seed", "20260918"));
  const opponent = flagOf(rest, "--opponent", "golem-fencer");
  const dir = resolve(ROOT, flagOf(rest, "--out", "tournaments/cr-clone"));
  mkdirSync(dir, { recursive: true });
  for (const stale of readdirSync(dir)) {
    if (stale.endsWith(".bin") || stale === "meta.json") {
      writeFileSync(resolve(dir, stale), "");
    }
  }

  const shards = Math.max(1, Math.min(availableParallelism(), 16));
  const seeds = Array.from({ length: count }, (_, i) => base + i * 101);
  const slice = Math.ceil(seeds.length / shards);
  const plan = Array.from({ length: shards }, (_, s) => ({
    seeds: seeds.slice(s * slice, (s + 1) * slice), cap, opponent,
    file: resolve(dir, "shard-".concat(s, ".bin")),
  })).filter((c) => c.seeds.length > 0);

  console.log(`clone collect: golem-driver against ${opponent}, ${count} bouts at cap ${cap} s,`
    + ` ${plan.length} shards`);

  const runOne = (c) => new Promise((done) => {
    execFile(process.execPath, [process.argv[1], "--child", JSON.stringify(c)], {
      encoding: "utf8", cwd: ROOT, maxBuffer: 1 << 26,
    }, (error, stdout, stderr) => {
      const line = (stdout ?? "").split(NL).find((l) => l.startsWith("|CELL|"));
      if (line === undefined) {
        const why = (stderr ?? "").trim().split(NL).filter((l) => l.trim() !== "").pop();
        done({ failed: why ?? "no output" });
      } else done(JSON.parse(line.slice(6)));
    });
  });

  const lanes = Math.max(1, Math.min(availableParallelism(), plan.length));
  const results = new Array(plan.length);
  let next = 0;
  const lane = async () => {
    while (next < plan.length) {
      const at = next++;
      results[at] = await runOne(plan[at]);
    }
  };
  await Promise.all(Array.from({ length: lanes }, lane));

  const bad = results.filter((r) => r.failed);
  for (const f of bad) console.log(`FAILED: ${f.failed}`);
  if (bad.length > 0) throw new Error(`${bad.length} of ${plan.length} shards failed`);

  const meta = {
    opponent, cap, bouts: count, seed: base,
    columns: results[0].columns, width: results[0].width,
    shards: results.map((r) => ({ file: r.file.split(/[\\/]/).pop(), rows: r.rows, bouts: r.bouts })),
  };
  writeFileSync(resolve(dir, "meta.json"), `${JSON.stringify(meta, null, 2)}\n`);
  const rows = results.reduce((a, r) => a + r.rows, 0);
  console.log(`collected ${rows} asks over ${count} bouts into ${dir}`);
}

const RUN_AS = process.argv[1] ?? "";
const childAt = process.argv.indexOf("--child");
if (RUN_AS.endsWith("clone-policy.mjs") && childAt !== -1) {
  collect(JSON.parse(process.argv[childAt + 1]))
    .then((out) => console.log(`|CELL|${JSON.stringify(out)}`))
    .catch((error) => { console.error(error); process.exit(1); });
} else if (RUN_AS.endsWith("clone-policy.mjs")) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
