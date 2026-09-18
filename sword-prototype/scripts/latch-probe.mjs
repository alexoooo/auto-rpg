// The latch probe: what `latchAbort` costs a mind that is played, as against one being trained.
// Cell CP of the learn set.
//
//   node scripts/latch-probe.mjs [--seeds 64] [--cap 60] [--opponent golem-fencer]
//                                [--seed 20260917] [--weights snapshots/ao-ramp11.json]
//
// ## The question, and why the record could not answer it
//
// `latchAbort` decides whether the abort gate is read once, on the ask that starts a stroke, or on
// every ask inside it. The shipped row is `false` -- re-read -- and `snapshots/README.md` warns
// that a snapshot watched under it is "a mind that flinches out of nearly every swing", while
// `docs/design.md` says the greedy read behaves "as though it were already latched". Both cannot
// be the headline, and the owner has asked which twice.
//
// The reason both are on record is that they are readings of **different minds**. A policy head is
// a Gaussian with a learned sigma: `sample = true` draws from it and `sample = false` takes the
// mean. Training rolls out drawn, so a gate near a coin flip is re-drawn five to eight times a
// stroke and the stroke survives `(1 - p)^n`. Rating and play are greedy, where the same head is a
// threshold that either clears 0.5 or does not, and re-reading a deterministic function of a
// slowly-moving state changes almost nothing. So the row can be expensive for the fit and free for
// the fight, which is a sentence the record contains nowhere.
//
// This measures the two reads side by side on one instrument, which is the only way the claim
// stops being two quotes that disagree.
//
// **The bar is secondary and is reported with its interval.** Completion is a per-stroke rate with
// hundreds of strokes behind it and is readable at this size; the score is a per-bout rate and at
// a few hundred bouts can only exclude a large difference. Read the first, and treat the second as
// a floor under "and it did not obviously cost anything".

import { availableParallelism } from "node:os";
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const NL = /\r?\n/;

/** One cell: some seeds of one arm, in a child, so a crashed bout cannot take the table with it. */
async function cell({ sample, latchAbort, seeds, cap, opponent, weightsPath }) {
  const { freshHavok, runBout } = await import("./bout-runner.mjs");
  const { golemPolicy } = await import("../src/golem/policy.ts");
  const { POLICY_WEIGHTS } = await import("../src/golem/policy-weights.ts");
  const { GOLEM_TACTICS_V4 } = await import("../src/golem/tactics-v4.ts");
  const { golemFencer } = await import("../src/golem/tactics-v2.ts");
  const { golemDuelist } = await import("../src/golem/tactics.ts");
  const { defaultGolemSetup } = await import("../src/golem/build.ts");

  const weights = weightsPath === null
    ? POLICY_WEIGHTS
    : JSON.parse(readFileSync(resolve(ROOT, weightsPath), "utf8")).weights ?? POLICY_WEIGHTS;
  const physics = await freshHavok();
  const table = { ...GOLEM_TACTICS_V4, latchAbort };

  let strokes = 0;
  let aborts = 0;
  let asks = 0;
  let raised = 0;
  let score = 0;
  let seconds = 0;
  let decided = 0;
  for (const seed of seeds) {
    const mind = golemPolicy(seed, weights, table, null, sample,
      (reading, view, command) => { asks += 1; if (command.abort >= 0.5) raised += 1; });
    const right = opponent === "golem-duelist" ? golemDuelist(seed + 17) : golemFencer(seed + 17);
    const bout = runBout({
      left: "golem-policy", right: opponent,
      leftUnit: "golem", rightUnit: "golem",
      leftGolem: defaultGolemSetup(), rightGolem: defaultGolemSetup(),
      locomotionMode: "supported", seeds: [seed, seed + 17], maxSeconds: cap, physics,
      leftMind: { name: "golem-policy", driven: mind.driven, decide: (v, dt) => mind.decide(v, dt) },
      rightMind: right,
    });
    strokes += mind.driven.strokes;
    aborts += mind.driven.aborts;
    seconds += bout.seconds;
    if (bout.winner === "left") score += 1;
    else if (bout.winner === null) score += 0.5;
    if (bout.winner !== null) decided += 1;
  }
  const n = seeds.length;
  return {
    strokes, aborts, asks, raised, bouts: n,
    score: score / n, decided: decided / n, seconds: seconds / n,
  };
}

const flagOf = (argv, name, fallback) => {
  const at = argv.indexOf(name);
  return at === -1 || at + 1 >= argv.length ? fallback : argv[at + 1];
};

async function main(argv) {
  const count = Number(flagOf(argv, "--seeds", "64"));
  const cap = Number(flagOf(argv, "--cap", "60"));
  const base = Number(flagOf(argv, "--seed", "20260917"));
  const opponent = flagOf(argv, "--opponent", "golem-fencer");
  const weightsPath = flagOf(argv, "--weights", null);
  const shards = Math.max(1, Math.min(availableParallelism(), 16));

  const seeds = Array.from({ length: count }, (_, i) => base + i * 101);
  const arms = [
    { read: "greedy", sample: false, latchAbort: false },
    { read: "greedy", sample: false, latchAbort: true },
    { read: "drawn", sample: true, latchAbort: false },
    { read: "drawn", sample: true, latchAbort: true },
  ];
  // Each arm is cut into shards over the *same* seed list, so the two latch arms of one read see
  // the identical bouts. Pairing is the whole design: the difference between two arms on one seed
  // is the row, and the difference between two seeds is the draw.
  const slice = Math.ceil(seeds.length / shards);
  const plan = arms.flatMap((arm) => Array.from({ length: shards }, (_, s) => ({
    ...arm, seeds: seeds.slice(s * slice, (s + 1) * slice),
  }))).filter((c) => c.seeds.length > 0);

  console.log(`latch probe: ${weightsPath ?? "POLICY_WEIGHTS"} against ${opponent},`
    + ` ${count} seeds x 4 arms at cap ${cap} s, ${plan.length} cells`);

  const runOne = (c) => new Promise((done) => {
    const spec = JSON.stringify({ ...c, cap, opponent, weightsPath });
    execFile(process.execPath, [process.argv[1], "--child", spec], {
      encoding: "utf8", cwd: ROOT, maxBuffer: 1 << 28,
    }, (error, stdout, stderr) => {
      const line = (stdout ?? "").split(NL).find((l) => l.startsWith("|CELL|"));
      if (line === undefined) {
        const why = (stderr ?? "").trim().split(NL).filter((l) => l.trim() !== "").pop();
        done({ ...c, failed: why ?? "no output" });
      } else done({ ...c, ...JSON.parse(line.slice(6)) });
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

  for (const f of results.filter((r) => r.failed)) {
    console.log(`FAILED ${f.read} latch=${f.latchAbort}: ${f.failed}`);
  }

  const fold = (read, latchAbort) => {
    const rs = results.filter((r) => !r.failed && r.read === read && r.latchAbort === latchAbort);
    const sum = (k) => rs.reduce((a, r) => a + r[k], 0);
    const strokes = sum("strokes");
    const bouts = sum("bouts");
    const weighted = (k) => (bouts === 0 ? 0 : rs.reduce((a, r) => a + r[k] * r.bouts, 0) / bouts);
    return {
      strokes, bouts,
      completion: strokes === 0 ? 0 : (strokes - sum("aborts")) / strokes,
      p: sum("asks") === 0 ? 0 : sum("raised") / sum("asks"),
      score: weighted("score"), decided: weighted("decided"), seconds: weighted("seconds"),
      perBout: bouts === 0 ? 0 : strokes / bouts,
    };
  };

  console.log("");
  console.log("| read | latchAbort | strokes | completed | raised | strokes/bout"
    + " | score | decided | bout |");
  console.log("| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
  const out = {};
  for (const read of ["greedy", "drawn"]) {
    for (const latchAbort of [false, true]) {
      const f = fold(read, latchAbort);
      out[`${read}:${latchAbort}`] = f;
      console.log(`| ${read} | ${latchAbort} | ${f.strokes} | ${f.completion.toFixed(4)}`
        + ` | ${f.p.toFixed(4)} | ${f.perBout.toFixed(1)} | ${f.score.toFixed(4)}`
        + ` | ${f.decided.toFixed(3)} | ${f.seconds.toFixed(1)} s |`);
    }
  }

  console.log("");
  for (const read of ["greedy", "drawn"]) {
    const off = out[`${read}:false`];
    const on = out[`${read}:true`];
    const ratio = off.completion === 0 ? Infinity : on.completion / off.completion;
    // The binomial standard error on the paired score difference, which is the honest width of a
    // per-bout rate at this many bouts. Quoted so nobody reads a score gap narrower than its own
    // noise as a result.
    const se = Math.sqrt(0.25 / Math.max(1, off.bouts)) * Math.SQRT2;
    console.log(`${read}: the latch multiplies completion by ${ratio.toFixed(2)}`
      + ` (${off.completion.toFixed(4)} -> ${on.completion.toFixed(4)}), and moves the score by`
      + ` ${on.score - off.score >= 0 ? "+" : ""}${(on.score - off.score).toFixed(4)}`
      + ` against a +-${(2 * se).toFixed(4)} two-sigma band.`);
  }
}

/**
 * The child dispatch, guarded on this file being the one that was *run*.
 *
 * Without the guard, any module that imports a helper from here inherits this branch: the import
 * executes the top level, `--child` is still on the argv of the process that is running, and this
 * file answers a child call meant for the importer. `scripts/stroke-duel.mjs` has the scar.
 */
const RUN_AS = process.argv[1] ?? "";
const childAt = process.argv.indexOf("--child");
if (RUN_AS.endsWith("latch-probe.mjs") && childAt !== -1) {
  cell(JSON.parse(process.argv[childAt + 1]))
    .then((out) => console.log(`|CELL|${JSON.stringify(out)}`))
    .catch((error) => { console.error(error); process.exit(1); });
} else if (RUN_AS.endsWith("latch-probe.mjs")) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
