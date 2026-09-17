// Re-read one of the stroke-shape constants the tuner cannot reach, against its own noise.
//
//   node scripts/stroke-sweep.mjs --row cutRoll --values 0,0.15,0.30,0.45
//     [--replicates 4] [--bouts 16] [--cap 150] [--seed 20260906] [--sigmas 2]
//
// **Why this exists.** `scripts/tune.mjs` evolves sixty-two rows of the fencer's table and its
// `INERT_ROWS` names nine it structurally cannot move: the sword's stroke shape, which
// `STROKE_SHAPES.sword` reads live from the duelist's `GOLEM_TACTICS` rather than from the
// fencer's copy, so a champion's override of one of them moves no decision at all. The tuner is
// right to refuse them. The consequence is that those nine are the only numeric rows in the
// fencer's reach that no automatic process has ever re-read; every one was swept by hand against a
// tree that has since changed its death model, its damage ramp and its cut law, and BY found the
// first one anybody checked three grid steps off. This is the process that was missing.
//
// **Every cell is replicated, and that is the whole point of the file.** CB swept seven of these
// rows with one run a cell and reported all seven mistuned. CC then measured the run-to-run spread
// of the statistic at *fixed* parameters -- sd 0.016, range 0.053 over eight replicates -- and
// found CB's shipped cell was a single run reused across all seven rows, which happened to be the
// lowest of the eight. Twenty-eight comparisons against one unlucky control; five of the seven
// evaporated. A sweep that does not replicate its baseline is not a cheaper sweep, it is a sweep
// that reports its own noise, so the replicate count has a floor of two and no way to turn it off.
//
// **Two statistics, because CD caught them pointing opposite ways.** Median edge alignment is the
// unselected proxy; damage a second is the objective. `strokeSeconds` 0.35 turned the blade 3.9 sd
// better and made the fight 30 % less dangerous a second, because a slower stroke buys its angle
// with time and a median over contacts weights a contact the same whether it arrived in a second or
// in a minute. Both columns are printed against their own pooled noise and `summarise` says so out
// loud when they disagree, so that trap is the tool's to remember rather than its reader's.
//
// **`--json <path>` writes every cell before anything is summarised.** CD wanted a column the run
// had not printed, and the only way to get it was to spend the whole sweep again. With the dump,
// asking a new question of an old sweep is a re-read.
//
// **The alignment statistic is a median over every armed contact.** Not over the contacts the
// damage model scored: a contact enters that set partly by being well aligned, and the 2026-09-05
// sweep that chose `cutRoll` read the selected version and so could not see the population a roll
// constant fails. BZ showed the unselected column is indifferent to `combat.drawFraction` and reads
// the geometry alone, which is what makes it the right thing to sweep a stroke shape on. Damage per
// bout is printed and is not ranked on: BS put its standard error at half its own range.
//
// **A winner is named only if it clears the noise.** `--sigmas` is how many standard deviations of
// the pooled replicate spread a value must beat the shipped row by before this file will call it
// better; under that it prints "inside the noise" and names nothing. That refusal is the
// deliverable as much as the table is.
//
// **A child process a cell, deliberately.** `GOLEM_TACTICS` has to be mutated before the modules
// that read it are first imported, and a fresh module graph is the only way to get that per cell.
// The alternative -- one process re-importing with a cache-buster -- would also re-import Havok.
import { availableParallelism } from "node:os";
import { execFile } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { writeFile } from "node:fs/promises";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const NL = String.fromCharCode(10);
const at = (p) => pathToFileURL(`${ROOT}/${p}`).href;

/**
 * The stroke-shape rows `scripts/tune.mjs` cannot move.
 *
 * `guardReach` is in that file's `INERT_ROWS` and not here: it is inert for a second reason, the
 * `guardByTheirs` switch being on, so sweeping it would measure nothing and the refusal is worth
 * more as a sentence than as an empty table.
 */
export const SHAPE_ROWS = Object.freeze([
  "chamberSwing", "chamberLift", "chamberReach", "followSwing", "followLift",
  "strokeSeconds", "chamberSeconds", "cutRoll",
]);

export const mean = (xs) => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length);

/** Sample standard deviation. Zero under two values, which is a width nobody has measured. */
export const sd = (xs) => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
};

export const median = (xs) => {
  if (xs.length === 0) return 0;
  const a = [...xs].sort((x, y) => x - y);
  return a[Math.floor(a.length / 2)];
};

/**
 * The verdict on one swept value against the shipped one, in units of the pooled replicate noise.
 *
 * Pooled rather than each value's own spread, because a handful of replicates estimates a width
 * badly and a row that happened to draw four similar numbers would otherwise be handed a tiny
 * denominator and an enormous margin. A noise estimate of zero refuses rather than dividing.
 */
export const verdict = (value, shipped, noise, sigmas) => {
  const gap = value - shipped;
  if (!(noise > 0)) return { gap, sigmas: 0, better: false, why: "no noise estimate" };
  const z = gap / noise;
  if (z >= sigmas) return { gap, sigmas: z, better: true, why: `${z.toFixed(1)} sd clear` };
  return { gap, sigmas: z, better: false, why: `inside the noise (${z.toFixed(1)} sd)` };
};

/** The name each statistic goes by in prose, and the key it lives under on a cell. */
export const STATISTICS = Object.freeze([
  { key: "align", label: "alignment" },
  { key: "rate", label: "damage/second" },
]);

/**
 * Both statistics, each against its own pooled replicate noise.
 *
 * Two, not one, because CD found they can point opposite ways: `strokeSeconds` 0.35 turned the
 * blade 3.9 sd better and made the fight 30 % less dangerous a second, and a sweep that printed
 * only the first would have reported that as a clean win. Alignment is the unselected proxy and
 * damage a second is the objective; the tool is not entitled to decide between them, but it is
 * obliged to put them side by side.
 */
export const statsFor = ({ wanted, shipped, sigmas, cells }) => {
  const out = {};
  for (const { key } of STATISTICS) {
    const noise = mean(wanted.map((v) => sd(cells(v).map((r) => r[key]))).filter((x) => x > 0));
    const by = new Map(wanted.map((v) => [v, mean(cells(v).map((r) => r[key]))]));
    const base = by.get(shipped) ?? 0;
    const verdicts = new Map(wanted.map((v) => [v, v === shipped
      ? { why: "shipped", better: false, sigmas: 0, gap: 0 }
      : verdict(by.get(v) ?? 0, base, noise, sigmas)]));
    out[key] = { noise, shipped: base, by, verdicts };
  }
  return out;
};

/**
 * What the table means, including the case where the two statistics disagree.
 *
 * Separate from printing it so a test can read the sentence rather than the run. The disagreement
 * branch is the one that matters: it is the finding CD had to make by hand, and a tool that makes
 * its reader re-derive a known trap every time has not learned anything.
 */
export const summarise = (row, shipped, stats, sigmas) => {
  const winners = (key) => [...stats[key].verdicts]
    .filter(([, v]) => v.better)
    .map(([value, v]) => ({ value, sigmas: v.sigmas, at: stats[key].by.get(value) }))
    .sort((a, b) => b.at - a.at);
  const align = winners("align");
  const rate = winners("rate");
  const lines = [];
  const name = (w) => `${row} ${w.value}`;

  if (align.length === 0 && rate.length === 0) {
    lines.push(`Nothing beats the shipped ${shipped} by ${sigmas} sd on either statistic.`);
    lines.push("That is a result rather than a blank: either the row is where it should be, or");
    lines.push("this grid is too narrow to say which way it should move.");
    return lines;
  }
  for (const { key, label } of STATISTICS) {
    const w = winners(key);
    if (w.length === 0) {
      lines.push(`On ${label}, nothing clears the shipped ${shipped} by ${sigmas} sd.`);
      continue;
    }
    lines.push(`On ${label}, ${name(w[0])} beats the shipped ${shipped} by`
      + ` ${w[0].sigmas.toFixed(1)} sd (${stats[key].shipped.toFixed(3)} ->`
      + ` ${w[0].at.toFixed(3)}).`);
  }
  if (align.length > 0 && rate.length > 0 && align[0].value !== rate[0].value) {
    lines.push("**The two statistics name different values.** Alignment is a proxy and damage a");
    lines.push("second is closer to the objective, so prefer the second and treat the gap as a");
    lines.push("sign this row trades blade angle against tempo rather than improving both.");
  } else if (align.length > 0 && rate.length === 0) {
    lines.push("**Better turned, no more dangerous.** The proxy moved and the objective did not,");
    lines.push("which is the shape of a slower stroke buying its angle with time. Do not ship it");
    lines.push("on the alignment column alone.");
  }
  lines.push("A measurement, not a ruling: moving one of these rows changes behaviour and");
  lines.push("invalidates every fitted head, so re-rate first, and read docs/design.md.");
  return lines;
};

/** One cell: the row set to one value, one seed base, `bouts` side-swapped mirrored bouts. */
export async function cell({ row, value, seed, bouts, cap }) {
  const { GOLEM_TACTICS } = await import(at("src/golem/tactics.ts"));
  if (row !== null) GOLEM_TACTICS[row] = value;
  const { freshHavok, runBout } = await import(at("scripts/bout-runner.mjs"));
  const { seedFor } = await import(at("scripts/tournament.mjs"));
  const { defaultGolemSetup } = await import(at("src/golem/build.ts"));
  const setup = defaultGolemSetup();

  const aligns = [];
  let paid = 0;
  let damage = 0;
  let seconds = 0;
  let ran = 0;
  for (let k = 0; k < Math.max(1, bouts / 2); k += 1) {
    for (const swapped of [false, true]) {
      const mineIsLeft = !swapped;
      const result = await runBout({
        left: "golem-fencer", right: "golem-fencer",
        leftUnit: "golem", rightUnit: "golem",
        leftGolem: setup, rightGolem: setup,
        locomotionMode: "supported",
        seeds: [seedFor(seed, k, swapped ? 1 : 0), seedFor(seed, k, swapped ? 0 : 1)],
        maxSeconds: cap, physics: await freshHavok(),
        onEvent(event) {
          if (event.side !== (mineIsLeft ? "left" : "right")) return;
          const r = event.report;
          if (r.weapon === "empty") return;
          aligns.push(Math.abs(r.edgeAlignment ?? 0));
          if (r.damage > 0) paid += 1;
          damage += r.damage;
        },
      });
      ran += 1;
      seconds += result.seconds ?? 0;
    }
  }
  const perBout = damage / Math.max(1, ran);
  const secsPerBout = seconds / Math.max(1, ran);
  return {
    contacts: aligns.length,
    align: median(aligns),
    pays: paid / Math.max(1, aligns.length),
    damage: perBout,
    seconds: secsPerBout,
    // Damage a second, not a bout. CD found the two statistics disagree and one of them is the
    // objective: a slower stroke lands better-turned contacts and takes so much longer doing it
    // that the fight gets less dangerous. A median over contacts cannot see that, because it
    // weights a contact the same whether it arrived in a second or in a minute.
    rate: perBout / Math.max(1e-9, secsPerBout),
  };
}

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
  const row = flag("--row", null);
  if (row === null || !SHAPE_ROWS.includes(row)) {
    throw new Error(`--row wants one of ${SHAPE_ROWS.join(", ")}; got ${row ?? "nothing"}`);
  }
  const values = (flag("--values", "") || "").split(",").filter((v) => v !== "").map(Number);
  if (values.length === 0) throw new Error("--values wants a comma-separated list of numbers");
  if (values.some((v) => !Number.isFinite(v))) {
    throw new Error("--values has something in it that is not a number");
  }
  const replicates = Math.max(2, num("--replicates", 4));
  const bouts = num("--bouts", 16);
  const cap = num("--cap", 150);
  const base = num("--seed", 20260906);
  const sigmas = num("--sigmas", 2);

  const shipped = (await import(at("src/golem/tactics.ts"))).GOLEM_TACTICS[row];
  const seeds = Array.from({ length: replicates }, (_, i) => base + i);
  const wanted = [shipped, ...values.filter((v) => v !== shipped)];
  const plan = wanted.flatMap((value) => seeds.map((seed) => ({ value, seed })));

  console.log(`stroke sweep: ${row}, shipped ${shipped}, ${plan.length} cells`
    + ` (${wanted.length} values x ${replicates} replicates x ${bouts} bouts),`
    + ` ${availableParallelism()} cores`);
  console.log("every value is replicated, because a sweep that shares one baseline reports its noise");

  const results = await Promise.all(plan.map((c) => new Promise((resolve) => {
    const spec = JSON.stringify({ ...c, row, bouts, cap });
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

  const byValue = new Map();
  for (const r of results) {
    if (!byValue.has(r.value)) byValue.set(r.value, []);
    byValue.get(r.value).push(r);
  }
  const ok = (value) => (byValue.get(value) ?? []).filter((r) => !r.failed);
  const stats = statsFor({ wanted, shipped, sigmas, cells: ok });
  const { align, rate } = stats;

  // Every cell, raw, before anything is summarised. CD wanted a column the run had not printed and
  // the only way to get it was to spend the whole sweep again; with this file that is a re-read.
  const dump = flag("--json", null);
  if (dump !== null) {
    await writeFile(dump, `${JSON.stringify({
      row, shipped, values: wanted, replicates, bouts, cap, seed: base, sigmas, cells: results,
    }, null, 2)}${NL}`, "utf8");
    console.log(`every cell written to ${dump}`);
  }

  console.log("");
  console.log(`pooled replicate sd -- alignment ${align.noise.toFixed(3)},`
    + ` damage/second ${rate.noise.toFixed(3)}`);
  console.log("");
  console.log("| value | cells | align | vs shipped | verdict"
    + " | dmg/s | vs shipped | verdict | damage/bout | seconds |");
  console.log("| ---: | ---: | ---: | ---: | --- | ---: | ---: | --- | ---: | ---: |");
  for (const value of wanted) {
    const rs = ok(value);
    if (rs.length === 0) {
      console.log(`| ${value} | 0 | every cell failed | | | | | | | |`);
      continue;
    }
    const cells = [`| ${value}${value === shipped ? " (ships)" : ""} | ${rs.length}`];
    for (const stat of [align, rate]) {
      const m = stat.by.get(value);
      const v = stat.verdicts.get(value);
      const gap = value === shipped ? "--"
        : `${m - stat.shipped >= 0 ? "+" : ""}${(m - stat.shipped).toFixed(3)}`;
      cells.push(`| ${m.toFixed(3)} | ${gap} | ${v.why}`);
    }
    cells.push(`| ${mean(rs.map((r) => r.damage)).toFixed(1)}`
      + ` | ${mean(rs.map((r) => r.seconds)).toFixed(1)} |`);
    console.log(cells.join(" "));
  }

  console.log("");
  for (const line of summarise(row, shipped, stats, sigmas)) console.log(line);
}

const childAt = process.argv.indexOf("--child");
if (childAt !== -1) {
  cell(JSON.parse(process.argv[childAt + 1]))
    .then((out) => console.log(`|CELL|${JSON.stringify(out)}`))
    .catch((error) => { console.error(error); process.exit(1); });
} else if (process.argv[1] && process.argv[1].endsWith("stroke-sweep.mjs")) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
