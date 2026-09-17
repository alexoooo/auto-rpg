// Put a changed stroke against the shipped one and score it the way the project scores a mind.
//
//   node scripts/stroke-duel.mjs --row chamberReach --values -0.2,0,0.15
//   node scripts/stroke-duel.mjs --arms chamberReach:0,cutRoll:0,strokeSeconds:0.35
//     [--replicates 4] [--bouts 128] [--cap 150] [--seed 20260906] [--sigmas 2] [--json PATH]
//
// `--row` with `--values` sweeps one row; `--arms` puts several rows on one table against
// **one shared control**, which is legitimate here in a way it was not in CB: the control is
// the shipped stroke against itself and is identical whatever row an arm names, so sharing it
// costs nothing and buys back half the compute. It is replicated like every other arm.
//
// **Why this exists, and what it is not.** `scripts/stroke-sweep.mjs` is a mirror: both fighters
// read `STROKE_SHAPES.sword`, which is one module global, so a swept row moves both of them. That
// answers "is this configuration more dangerous than that one" and it cannot answer "does a golem
// with this change beat a golem without it". The second question is the one this project judges a
// designed mind by, and until `strokeOver` landed on `FencerTactics` the architecture could not
// express it. CF measured `chamberReach` at 17 % more damage a second in a mirror; this asks
// whether that is worth anything across the table.
//
// **The control is the point of the design.** Every run scores the shipped stroke against itself
// first. Side-swapped mirrored bouts should put that at 0.500, and if they do not then the harness
// has a side bias and no margin below it means anything. A bench whose null case is not checked is
// a bench that reports its own asymmetry as a finding.
//
// **The denominator, stated once because it is not the usual one.** Margins here, as in
// `stroke-sweep.mjs`, are quoted in units of the pooled spread of a *single replicate*, not the
// standard error of the mean of them. That is deliberately conservative -- with four replicates the
// standard error is half the number quoted -- and it is consistent with every margin in
// `docs/measurements.md`. A "2 sd clear" here is a stronger claim than a 95 % interval, not a
// weaker one.
import { availableParallelism } from "node:os";
import { execFile } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { writeFile } from "node:fs/promises";

import { LIVE_STROKE_ROWS } from "../src/golem/stroke-rows.ts";
import { mean, sd, verdict } from "./stroke-sweep.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const NL = String.fromCharCode(10);
const at = (p) => pathToFileURL(`${ROOT}/${p}`).href;

/**
 * One cell: `bouts` side-swapped bouts of the challenger's stroke against the shipped one.
 *
 * `null` for `over` is the control, and it builds the challenger from the shipped table rather
 * than skipping the override path, so the control exercises the same code the contenders do.
 *
 * The challenger takes each side for half the bouts and the seed pair is swapped with it, so a
 * seed that favours a position favours neither fighter. The score is the project's:
 * `scripts/tournament.mjs` scores a win 1, a loss 0 and a draw 0.5, and nothing here invents its
 * own statistic on top of that.
 */
export async function cell({ row, value, seed, bouts, cap }) {
  const { GOLEM_TACTICS_V2, golemFencer } = await import(at("src/golem/tactics-v2.ts"));
  const { freshHavok, runBout } = await import(at("scripts/bout-runner.mjs"));
  const { seedFor } = await import(at("scripts/tournament.mjs"));
  const { defaultGolemSetup } = await import(at("src/golem/build.ts"));
  const setup = defaultGolemSetup();

  const over = value === null ? null : { [row]: value };
  const mind = (mindSeed, strokeOver) => {
    const tactics = strokeOver === null
      ? GOLEM_TACTICS_V2
      : { ...GOLEM_TACTICS_V2, strokeOver };
    const fencer = golemFencer(mindSeed, tactics);
    return { name: "golem-fencer", fencer, decide: (view, dt) => fencer.decide(view, dt) };
  };

  let score = 0;
  let wins = 0;
  let draws = 0;
  let losses = 0;
  let seconds = 0;
  let ran = 0;
  for (let k = 0; k < Math.max(1, bouts / 2); k += 1) {
    for (const challengerLeft of [true, false]) {
      const seeds = [seedFor(seed, k, challengerLeft ? 0 : 1), seedFor(seed, k, challengerLeft ? 1 : 0)];
      const result = await runBout({
        left: "golem-fencer", right: "golem-fencer",
        leftUnit: "golem", rightUnit: "golem",
        leftGolem: setup, rightGolem: setup,
        locomotionMode: "supported",
        seeds,
        leftMind: mind(seeds[0], challengerLeft ? over : null),
        rightMind: mind(seeds[1], challengerLeft ? null : over),
        maxSeconds: cap, physics: await freshHavok(),
      });
      const mine = challengerLeft ? "left" : "right";
      const theirs = challengerLeft ? "right" : "left";
      if (result.winner === mine) { score += 1; wins += 1; } else if (result.winner === theirs) {
        losses += 1;
      } else { score += 0.5; draws += 1; }
      ran += 1;
      seconds += result.seconds ?? 0;
    }
  }
  return {
    bouts: ran,
    score: score / Math.max(1, ran),
    wins, draws, losses,
    seconds: seconds / Math.max(1, ran),
  };
}

/**
 * The arms to run, from either spelling, each with a key the table and the plan agree on.
 *
 * Refuses both spellings at once rather than picking one, and refuses a row a fencer cannot
 * actually override -- `LIVE_STROKE_ROWS` is the same list `?tactic=` and the sweep validate
 * against, so a row that stops being live stops being offered in all three places together.
 */
export const readArms = (row, values, spec) => {
  if (spec !== null && (row !== null || values !== null)) {
    throw new Error("--arms and --row/--values are two spellings of one thing; pass one");
  }
  const pairs = spec !== null
    ? spec.split(",").filter((part) => part.trim() !== "").map((part) => {
      const at = part.indexOf(":");
      if (at === -1) throw new Error(`--arms wants name:value, got "${part}"`);
      return [part.slice(0, at).trim(), part.slice(at + 1).trim()];
    })
    : (values ?? "").split(",").filter((v) => v.trim() !== "")
      .map((v) => [row ?? "", v.trim()]);
  if (pairs.length === 0) {
    throw new Error("nothing to run: pass --arms name:value,... or --row R --values a,b");
  }
  return pairs.map(([name, raw]) => {
    if (!LIVE_STROKE_ROWS.includes(name)) {
      throw new Error(`"${name}" is not one of ${LIVE_STROKE_ROWS.join(", ")}`);
    }
    const value = Number(raw);
    if (!Number.isFinite(value)) throw new Error(`"${name}" was given a non-number`);
    return { row: name, value, key: `${name}:${value}` };
  });
};

async function main(argv) {
  const flag = (name, fallback = null) => {
    const i = argv.indexOf(name);
    return i === -1 || i + 1 >= argv.length ? fallback : argv[i + 1];
  };
  const num = (name, fallback) => {
    const raw = flag(name, null);
    if (raw === null) return fallback;
    const v = Number(raw);
    if (!Number.isFinite(v)) throw new Error(`${name} wants a number, not ${raw}`);
    return v;
  };
  const arms = readArms(flag("--row", null), flag("--values", null), flag("--arms", null));
  const replicates = Math.max(2, num("--replicates", 4));
  const bouts = num("--bouts", 128);
  const cap = num("--cap", 150);
  const base = num("--seed", 20260906);
  const sigmas = num("--sigmas", 2);

  const seeds = Array.from({ length: replicates }, (_, i) => base + i);
  // The control runs first, because if it does not come back at 0.500 the rest of the table is a
  // measurement of the harness. Its null row and null value are what `cell` reads as the shipped
  // stroke against itself.
  const wanted = [{ row: null, value: null, key: "control" }, ...arms];
  const plan = wanted.flatMap((arm) => seeds.map((seed) => ({ ...arm, seed })));

  const what = arms.length === 1 ? arms[0].row : `${arms.length} arms`;
  console.log(`stroke duel: ${what} against the shipped stroke, ${plan.length} cells`
    + ` (${wanted.length} arms x ${replicates} replicates x ${bouts} bouts),`
    + ` ${availableParallelism()} cores`);
  console.log("the first arm is the shipped stroke against itself, which has to come back at 0.500");

  const results = await Promise.all(plan.map((c) => new Promise((resolve) => {
    const spec = JSON.stringify({ row: c.row, value: c.value, seed: c.seed, bouts, cap });
    execFile(process.execPath, [process.argv[1], "--child", spec], {
      encoding: "utf8", cwd: ROOT, maxBuffer: 1 << 28,
    }, (error, stdout, stderr) => {
      const line = (stdout ?? "").split(NL).find((l) => l.startsWith("|CELL|"));
      if (line === undefined) {
        const why = (stderr ?? "").trim().split(NL).filter((l) => l.trim() !== "").pop();
        resolve({ ...c, failed: why ?? "no output" });
      } else resolve({ ...c, ...JSON.parse(line.slice(6)) });
    });
  })));

  const ok = (key) => results.filter((r) => r.key === key && !r.failed);
  const noise = mean(wanted.map((a) => sd(ok(a.key).map((r) => r.score))).filter((x) => x > 0));
  const control = mean(ok("control").map((r) => r.score));

  const dump = flag("--json", null);
  if (dump !== null) {
    await writeFile(dump, `${JSON.stringify({
      arms, replicates, bouts, cap, seed: base, sigmas, control, cells: results,
    }, null, 2)}${NL}`, "utf8");
    console.log(`every cell written to ${dump}`);
  }

  console.log("");
  console.log(`pooled replicate sd of the paired score: ${noise.toFixed(4)}`);
  console.log(`a binomial of ${bouts} bouts would give ${Math.sqrt(0.25 / bouts).toFixed(4)}`);
  console.log("");
  console.log("| arm | cells | score | vs control | verdict | W-D-L | seconds |");
  console.log("| --- | ---: | ---: | ---: | --- | ---: | ---: |");
  for (const arm of wanted) {
    const rs = ok(arm.key);
    const isControl = arm.row === null;
    const name = isControl ? "shipped v shipped" : `${arm.row} ${arm.value}`;
    if (rs.length === 0) {
      console.log(`| ${name} | 0 | every cell failed | | | | |`);
      continue;
    }
    const m = mean(rs.map((r) => r.score));
    const v = isControl
      ? { why: "the control", better: false, worse: false }
      : verdict(m, control, noise, sigmas);
    const gap = isControl ? "--" : `${m - control >= 0 ? "+" : ""}${(m - control).toFixed(4)}`;
    const w = rs.reduce((a, r) => a + r.wins, 0);
    const d = rs.reduce((a, r) => a + r.draws, 0);
    const l = rs.reduce((a, r) => a + r.losses, 0);
    console.log(`| ${name} | ${rs.length} | ${m.toFixed(4)} | ${gap} | ${v.why} | ${w}-${d}-${l}`
      + ` | ${mean(rs.map((r) => r.seconds)).toFixed(1)} |`);
  }

  console.log("");
  const drift = Math.abs(control - 0.5);
  // The bar is the wider of the measured replicate spread and what a fair coin would give over the
  // control's own bouts. Replicates that happen to agree would otherwise hand the control a
  // denominator near zero and refuse the run over a rounding error.
  const bar = Math.max(noise, Math.sqrt(0.25 / (bouts * ok("control").length)));
  if (drift > 2 * bar) {
    console.log(`REFUSED: the control came back at ${control.toFixed(4)}, which is`
      + ` ${(drift / bar).toFixed(1)} sd off 0.500.`);
    console.log("The shipped stroke beat itself, so this bench has a side bias and nothing in the");
    console.log("table above is a property of the row. Fix the harness before reading a margin.");
    return;
  }
  console.log(`The control is ${control.toFixed(4)}, within ${(2 * bar).toFixed(4)} of 0.500, so`
    + " the bench is even-handed.");
  const scored = wanted.filter((a) => a.row !== null)
    .map((a) => ({ ...a, m: mean(ok(a.key).map((r) => r.score)) }))
    .sort((a, b) => b.m - a.m);
  // Losses are named before wins, and named at all, for the reason CE had to fix in the sweep: a
  // row that makes the golem measurably worse is a finding, and printing only winners reports it
  // as an absence.
  for (const l of scored.filter(({ m }) => verdict(m, control, noise, sigmas).worse)) {
    console.log(`${l.row} ${l.value} LOSES to the shipped stroke at ${l.m.toFixed(4)}.`);
  }
  const winners = scored.filter(({ m }) => verdict(m, control, noise, sigmas).better);
  if (winners.length === 0) {
    console.log(`Nothing beats the shipped stroke across the table by ${sigmas} sd. A mirror`);
    console.log("statistic moving without this one moving is the interesting outcome, not a null.");
    return;
  }
  console.log(`${winners[0].row} ${winners[0].value} beats the shipped stroke`
    + ` at ${winners[0].m.toFixed(4)}.`);
  console.log("This is the project's own criterion and it is still not a ruling: every fitted head");
  console.log("in the tree was trained under the shipped stroke, so re-rate before moving a row.");
}

/**
 * The child dispatch, guarded on this file being the one that was *run*.
 *
 * Without the guard, any module that imports a helper from here inherits this branch: the import
 * executes the top level, `--child` is still on the argv of the process that is running, and this
 * file answers a child call meant for the importer -- printing its own `|CELL|` line first and
 * handing the parent a cell with the wrong statistics on it. That is not hypothetical; it is how
 * `scripts/stroke-duel.mjs` first came back with a table of NaN while reporting sane bout lengths,
 * because the sweep's cell and the duel's cell both end in `seconds`.
 */
const RUN_AS = process.argv[1] ?? "";
const childAt = process.argv.indexOf("--child");
if (RUN_AS.endsWith("stroke-duel.mjs") && childAt !== -1) {
  cell(JSON.parse(process.argv[childAt + 1]))
    .then((out) => console.log(`|CELL|${JSON.stringify(out)}`))
    .catch((error) => { console.error(error); process.exit(1); });
} else if (RUN_AS.endsWith("stroke-duel.mjs")) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
