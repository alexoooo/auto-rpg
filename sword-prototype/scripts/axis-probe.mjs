// The action-surface probe: pin one command axis at a time on a viable body and measure what the
// fourth executor actually does with it. Session 07 of the learn set.
//
//     node scripts/axis-probe.mjs --axis standOff --bouts 16           -- one grid, one base
//     node scripts/axis-probe.mjs --axis all --bouts 16 --workers 16   -- the whole grid, both bases
//     node scripts/axis-probe.mjs --axis geometry --opponent idle      -- the feet, uncontested
//     node scripts/axis-probe.mjs --read tournaments/x.jsonl           -- the tables again, from the log
//
// **Why this exists, and why it does not go anywhere near a learner.** The owner's brief for the
// set asks "whether the low-level action options are actually good for what they are supposed to
// do". The record has an answer derived rather than measured: the feet settle at
// `hold - advance / closeGain`, a saturated advance buys 0.56 m at `closeGain` 1.8, a stroke opens
// inside 0.92 of a reach. Each of those is arithmetic somebody read off `src/golem/tactics-v4.ts`
// and none of them has ever been put in front of a body. This script prints each one as a
// **predicted** number beside the measured one, on the same row, so a claim that is wrong is wrong
// in public.
//
// It measures the executor and not the learner, deliberately and at some cost in realism. A fitted
// policy compensates for a bad axis -- it learns to write 1.4 where the axis it was given means
// 0.9 -- and a rating taken over one hides the defect entirely, which is exactly how a surface with
// a dead axis in it survives a whole plan set. So every side here is either `uniform`, the null
// that reads nothing and draws each axis from its own published range, or `golem-driver`, the
// designed mind over this executor, and in both cases the named axes are overwritten on every ask
// before the executor sees them.
//
// **A cell is one pin, and every cell fights the same bodies from the same seeds.** The pairings,
// the builds and the two per-side seeds are drawn once, by `scheduleJobs` from the run's seed
// alone, and then handed to every cell -- so two rows of the table differ in the pinned value and
// in nothing else, which is the set's frozen choice 3 spelled out as a job list. The opponent is
// `golem-driver` in every cell for the same reason: an opponent that changed with the cell would
// put two variables in one column.
//
// Results go to a JSON-lines file under `tournaments/`, gitignored; the tables go to
// `docs/measurements.md` with the seed that regenerates the file.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { isMainThread } from "node:worker_threads";

import { armedTerminal } from "../src/golem/viability.ts";
import { GOLEM_TACTICS_V4 } from "../src/golem/tactics-v4.ts";
import { GOLEM_TACTICS } from "../src/golem/tactics.ts";
import { TOURNAMENT_VERSION, buildPool, runJobs, scheduleJobs } from "./tournament.mjs";

/** Bumped when a cell's shape or a row's probe columns change; `--read` refuses another. */
export const AXIS_PROBE_VERSION = 1;

/** The two pilots a cell may pin over. */
export const PROBE_BASES = Object.freeze(["uniform", "golem-driver"]);

/**
 * The mind every cell of a run fights, and the two the tables were taken against.
 *
 * `golem-driver` is the default because it is the set's designed reference and because half the
 * plan's columns -- damage dealt and taken, the decided fraction, what a stroke was worth -- are
 * only meaningful against something that fights back.
 *
 * **And half of them are only meaningful against something that does not.** A stand-off is a
 * distance between two bodies and both of them have an opinion about it, so "the feet hold within
 * 0.1 reach of `standOff`" measured against a mind that is itself holding at 1.06 of a reach is a
 * measurement of the *negotiation* and not of the axis. `idle` -- the motionless opponent Session
 * 01's viability floor was taken against -- is the arrangement in which the executor's own fixed
 * point is the only thing deciding the gap, and the geometric grid is run against it as well. Two
 * runs, named in the entry, never one column.
 */
export const PROBE_OPPONENT = "golem-driver";

/**
 * An inclusive grid, snapped to the step's own decimals.
 *
 * `0.4 + 0.2 * 7` is `1.7999999999999998` in this arithmetic, and a cell named `standOff=1.8` whose
 * pin is that number would be a row nobody could reproduce by typing the label back in. Rounding to
 * the step's decimal count is what makes the label and the pin the same value.
 */
export function grid(from, to, step) {
  const decimals = (String(step).split(".")[1] ?? "").length;
  const round = (x) => Number(x.toFixed(decimals + 2));
  const values = [];
  for (let i = 0; round(from + step * i) <= to + step / 2; i += 1) values.push(round(from + step * i));
  return values;
}

/**
 * Every cell of the plan's grid for one base, the control first.
 *
 * The grids are the plan's: `standOff` 0.4 to 2.0 by 0.2; `advance` and `strafe` -1 to +1 by 0.25,
 * each at `standOff` 1.5 and at 1.0; `swing` and `bite` at three values; the three gates each
 * forced on and off; `askHz` at 6, 12 and 24 through the executor's table.
 *
 * **Two of them pin a second field and it is written down rather than discovered.** A `swing` cell
 * and a `bite` cell also hold `commit` at one, because both axes are properties of a *stroke* and
 * under a base that opens one on a coin half the samples would be a body that never swung; holding
 * the gate is what makes the cell about the arc. And the `advance` and `strafe` cells hold
 * `standOff`, which is the plan's own arrangement -- an advance is a displacement of a fixed point
 * and means nothing without saying which fixed point.
 *
 * The control pins nothing at all. It is the row every other row in the base is read against, and
 * it is a cell rather than a special case so that it runs the same bodies through the same code.
 */
export function probeCells(base) {
  const cells = [];
  const add = (label, pinned, table = null) => {
    cells.push({ name: `${base}/${label}`, base, label, pinned, table });
  };
  add("control", {});
  for (const value of grid(0.4, 2.0, 0.2)) add(`standOff=${value}`, { standOff: value });
  for (const at of [1.5, 1.0]) {
    for (const value of grid(-1, 1, 0.25)) add(`advance=${value}@so${at}`, { standOff: at, advance: value });
    for (const value of grid(-1, 1, 0.25)) add(`strafe=${value}@so${at}`, { standOff: at, strafe: value });
  }
  for (const value of [0, 0.5, 1]) add(`swing=${value}`, { swing: value, commit: 1 });
  for (const value of [0, 0.5, 1]) add(`bite=${value}`, { bite: value, commit: 1 });
  for (const gate of ["commit", "abort", "parry"]) {
    for (const value of [0, 1]) add(`${gate}=${value}`, { [gate]: value });
  }
  for (const hz of [6, 12, 24]) add(`askHz=${hz}`, {}, { askHz: hz });
  return cells;
}

/**
 * The three paired comparisons the record already names, as cells of the same run.
 *
 * Each is two cells that differ in one row of the executor's table and in nothing else, which is
 * what makes the difference between them a measurement rather than two numbers side by side.
 *
 * - **`strokeOutOfRange`** true against false, under `uniform` with the commit gate held. The
 *   record says the fourth executor gave up v3's range gate; what that bought is the strokes it
 *   started outside strike range, and what those landed. The pair says both: the difference in
 *   `started` is how many strokes the gate would have refused, and the difference in `blows` and
 *   `damage` is what they were worth.
 * - **`closeGain`** 1.8 against 3.6, at `standOff` 1.5 with the advance saturated. The record's
 *   claim is that a saturated advance buys `1 / closeGain` metres -- 0.56 at 1.8 -- and therefore
 *   cannot bring a body at 1.5 of their reach into strike. Doubling the gain is the arm that says
 *   whether the arithmetic is what is actually limiting it.
 * - **`holdMetres`** off against on, at `standOff` 1.0, which is the midpoint of the axis's range
 *   and therefore the *zero of the action space* under `commandFromAction`. What the pair measures
 *   is not which is better but how much the physical distance that zero means moves from bout to
 *   bout: `gap sd` is the column, and the whole candidate rests on it.
 */
export function comparisonCells() {
  const cells = [];
  const add = (label, pinned, table) => {
    cells.push({ name: `uniform/${label}`, base: "uniform", label, pinned, table });
  };
  for (const value of [true, false]) {
    add(`strokeOutOfRange=${value}`, { commit: 1 }, { strokeOutOfRange: value });
  }
  for (const value of [1.8, 3.6]) {
    add(`closeGain=${value}@so1.5adv1`, { standOff: 1.5, advance: 1 }, { closeGain: value });
  }
  for (const value of [false, true]) {
    add(`holdMetres=${value}@so1.0`, { standOff: 1.0 }, { holdMetres: value });
  }
  return cells;
}

/** The whole run's cells: both bases' grids, then the three comparisons. */
export function allCells() {
  return [...PROBE_BASES.flatMap((base) => probeCells(base)), ...comparisonCells()];
}

/** The three axes whose claims are about where the feet end up rather than about the arm. */
export const GEOMETRY_AXES = Object.freeze(["standOff", "advance", "strafe"]);

/**
 * The cells of one grid.
 *
 * `--axis all` is everything; `--axis comparisons` is the three paired arms; `--axis geometry` is
 * the control plus the three axes that decide where the body stands, which is the set of rows worth
 * re-taking against a motionless opponent; anything else is one axis's rows plus the control.
 */
export function cellsFor(axis, base) {
  if (axis === "all") return allCells();
  if (axis === "comparisons") return comparisonCells();
  if (axis === "geometry") {
    return probeCells(base).filter((cell) => cell.label === "control"
      || GEOMETRY_AXES.some((name) => cell.label.startsWith(`${name}=`)));
  }
  const cells = probeCells(base).filter((cell) => cell.label === "control"
    || cell.label.startsWith(`${axis}=`));
  if (cells.length <= 1) {
    throw new Error(`--axis ${axis}: no cell of the ${base} grid pins it; the grid pins ` +
      `${[...new Set(probeCells(base).map((cell) => cell.label.split("=")[0]))].join(", ")}`);
  }
  return cells;
}

/**
 * The job list: one shared draw of pairings, replayed once per cell.
 *
 * `scheduleJobs` is asked for the pairings *once*, with `golem-driver` on both sides, and every
 * cell then gets a copy of that list with its own name written over the probed corner. So the
 * bodies, the pairing order and both per-side seeds are identical across the whole grid and the
 * only thing that differs between two rows is the pin -- common random numbers, which is worth
 * about a factor of the between-body variance and is the reason a sixteen-bout cell says anything
 * at all.
 *
 * **The probed corner is the pairing's first side and not the left one.** `scheduleJobs` emits
 * every pairing twice with the sides swapped, so side A is `left` in the first and `right` in the
 * second; writing the cell's name on `left` both times would give it the first body once and the
 * second body once and call that a side swap.
 */
export function probeJobs({ pool, cells, bouts, seed, cap, viable = true, opponent = PROBE_OPPONENT }) {
  const shared = scheduleJobs({
    pool, policies: [opponent], pairings: Math.max(1, Math.ceil(bouts / 2)), seed, cap,
    pairs: [[opponent, opponent]], viable,
  });
  const jobs = [];
  for (const cell of cells) {
    for (const job of shared) {
      const probed = job.swapped ? "right" : "left";
      jobs.push({
        ...job, index: jobs.length,
        left: { ...job.left }, right: { ...job.right },
        [probed]: { ...job[probed], policy: cell.name },
      });
    }
  }
  return jobs;
}

/** The contender record every worker is handed: one entry a cell, keyed by the cell's name. */
export function probeContenders(cells) {
  const contenders = {};
  for (const cell of cells) {
    contenders[cell.name] = { base: cell.base, pinned: cell.pinned, table: cell.table };
  }
  return contenders;
}

// ------------------------------------------------------------------------------- the summary

const mean = (xs) => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length);
/** The sample standard deviation, which is zero for one row rather than a division by zero. */
const sd = (xs) => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((total, x) => total + (x - m) ** 2, 0) / (xs.length - 1));
};

/** Which corner of a row the cell was played in: the pairing's first side, as `probeJobs` wrote it. */
export const probedSide = (row) => (row.swapped ? "right" : "left");

/**
 * One cell's rows, summarised, with the record's own arithmetic printed beside the measurement.
 *
 * **What is predicted and from what.** `predictedGap` is `hold - advance / closeGain`, the fixed
 * point of `intent.forward = clamp((gap - hold) * closeGain + advance, -1, 1)` -- the gap at which
 * the feet stop pushing either way. `hold` is taken from the executor's own reading rather than
 * recomputed, so what is being predicted is where the *feet* end up and not whether the stand-off
 * multiplies correctly; `advance` is what the cell actually commanded, read off the recorded
 * command pack rather than off the pin, so a cell that pins nothing still gets its prediction from
 * the mean advance its base happened to write. `predictedStrikeOverMyReach` is `strikeFraction`,
 * the record's 0.92, and it is the one prediction that can fail in a direction nobody expects:
 * `strike` is `max(reach * strikeFraction, near + slack)`, so a body whose inner radius is large
 * opens its stroke further out than 0.92 and the second term is what actually binds.
 */
export function summariseCell(cell, rows) {
  const sides = rows.map((row) => row[probedSide(row)]);
  const others = rows.map((row) => row[probedSide(row) === "left" ? "right" : "left"]);
  const per = (read) => mean(sides.map(read));
  const axes = sides.filter((side) => side.commandAxes !== undefined).map((side) => side.commandAxes);
  const axisMean = (field) => (axes.length === 0 ? 0 : mean(axes.map((pack) => pack[field].mean)));
  const closeGain = cell.table?.closeGain ?? GOLEM_TACTICS_V4.closeGain;
  const hold = per((side) => side.hold ?? 0);
  const advance = axisMean("advance");
  const theirReach = per((side) => side.theirReach ?? 0);
  const predictedGap = hold - advance / closeGain;
  return {
    name: cell.name,
    base: cell.base,
    label: cell.label,
    bouts: rows.length,
    decided: rows.length === 0 ? 0 : rows.filter((row) => row.winner !== null).length / rows.length,
    won: rows.length === 0 ? 0 : rows.filter((row) => row.winner === probedSide(row)).length / rows.length,
    // What the feet did, and what the record says they should have done.
    hold,
    gap: per((side) => side.gap ?? 0),
    gapSd: sd(sides.map((side) => side.gap ?? 0)),
    gapOverTheirReach: per((side) => side.gapOverTheirReach ?? 0),
    predictedGap,
    predictedGapOverTheirReach: theirReach > 1e-6 ? predictedGap / theirReach : 0,
    theirReach,
    myReach: per((side) => side.myReach ?? 0),
    // Where the stroke opens, and the 0.92 the record derives it from.
    strike: per((side) => side.strike ?? 0),
    strikeOverMyReach: per((side) => side.strikeOverMyReach ?? 0),
    predictedStrikeOverMyReach: GOLEM_TACTICS.strikeFraction,
    insideStrike: per((side) => side.insideStrike ?? 0),
    insideStrikeSeconds: per((side) => side.insideStrikeSeconds ?? 0),
    // What it did with the arm.
    strokesStarted: per((side) => side.strokesStarted ?? 0),
    aborts: per((side) => side.aborts ?? 0),
    strokes: per((side) => side.strokes ?? 0),
    blows: per((side) => side.blows ?? 0),
    strokeDamage: per((side) => side.strokeDamage ?? 0),
    damageDealt: per((side) => side.damage ?? 0),
    damageTaken: mean(others.map((side) => side.damage ?? 0)),
    stallSeconds: per((side) => side.nearRangeStallSeconds ?? 0),
    outsideSeconds: per((side) => side.retreatOutsideReachSeconds ?? 0),
    // What it commanded, off the recorded pack rather than off the pin.
    commandedStandOff: axisMean("standOff"),
    commandedAdvance: advance,
    commandedSwing: axisMean("swing"),
    asks: per((side) => side.asks ?? 0),
    seconds: mean(rows.map((row) => row.seconds)),
  };
}

/** Every cell of a run, in the order the header lists them; a cell with no rows is dropped. */
export function summariseProbe(rows, cells) {
  const byName = new Map(cells.map((cell) => [cell.name, []]));
  for (const row of rows) {
    const name = row[probedSide(row)].policy;
    const bucket = byName.get(name);
    if (bucket === undefined) throw new Error(`a row names "${name}", which is not a cell of this run`);
    bucket.push(row);
  }
  return cells.filter((cell) => byName.get(cell.name).length > 0)
    .map((cell) => summariseCell(cell, byName.get(cell.name)));
}

// ------------------------------------------------------------------- the four written-ahead calls

/**
 * The plan's four predictions, written before any data existed, each scored held or missed.
 *
 * They are scored exactly as written and never reworded. Two of them are one-sided claims about a
 * grid, one is a claim about a single saturated cell, and the fourth is a claim about three weapon
 * classes that has to be read per class, which is why this returns a `detail` string a table can
 * print rather than only a boolean.
 *
 * A prediction whose cells were not in the run is scored `null` rather than held, so a partial run
 * cannot quietly count a claim nobody measured.
 */
export function scorePredictions(summary, rows) {
  const find = (name) => summary.find((cell) => cell.name === name) ?? null;
  const scored = [];
  const say = (claim, held, detail) => scored.push({ claim, held, detail });

  // 1. The feet hold within 0.1 reach of `standOff` above 0.8, and not below.
  const stands = grid(0.4, 2.0, 0.2).map((value) => ({ value, cell: find(`uniform/standOff=${value}`) }))
    .filter((entry) => entry.cell !== null);
  if (stands.length === 0) say("the feet hold within 0.1 reach of standOff above 0.8, and not below", null, "not run");
  else {
    const err = (entry) => Math.abs(entry.cell.gapOverTheirReach - entry.value);
    const above = stands.filter((entry) => entry.value >= 0.8);
    const below = stands.filter((entry) => entry.value < 0.8);
    const held = above.every((entry) => err(entry) <= 0.1) && below.every((entry) => err(entry) > 0.1);
    say("the feet hold within 0.1 reach of standOff above 0.8, and not below", held,
      `worst above 0.8 is ${above.length === 0 ? "--" : Math.max(...above.map(err)).toFixed(3)} reach; ` +
      `worst below is ${below.length === 0 ? "--" : Math.max(...below.map(err)).toFixed(3)}`);
  }

  // 2. A saturated advance never crosses into strike from 1.5.
  const saturated = find("uniform/advance=1@so1.5");
  if (saturated === null) say("a saturated advance never crosses into strike from standOff 1.5", null, "not run");
  else {
    say("a saturated advance never crosses into strike from standOff 1.5", saturated.insideStrike < 0.005,
      `inside strike ${(saturated.insideStrike * 100).toFixed(1)} % of samples, ` +
      `gap ${saturated.gapOverTheirReach.toFixed(2)} of their reach against a strike at ` +
      `${saturated.strikeOverMyReach.toFixed(2)} of mine`);
  }

  // 3. Out-of-range strokes are a third of strokes started under `uniform` and land nothing.
  const open = find("uniform/strokeOutOfRange=true");
  const gated = find("uniform/strokeOutOfRange=false");
  if (open === null || gated === null) {
    say("out-of-range strokes are a third of strokes started under uniform and land nothing", null, "not run");
  } else {
    const share = open.strokesStarted > 0 ? (open.strokesStarted - gated.strokesStarted) / open.strokesStarted : 0;
    const landed = open.blows - gated.blows;
    say("out-of-range strokes are a third of strokes started under uniform and land nothing",
      share >= 0.28 && share <= 0.39 && Math.abs(landed) < 0.05,
      `${(share * 100).toFixed(1)} % of strokes started, and the open row lands ` +
      `${landed >= 0 ? "+" : ""}${landed.toFixed(3)} blows a stroke against the gated one`);
  }

  // 4. `parry` forced on takes less damage than forced off on blade and plate, and not on maul.
  const parry = { on: "uniform/parry=1", off: "uniform/parry=0" };
  const taken = {};
  for (const [state, name] of Object.entries(parry)) {
    taken[state] = {};
    for (const row of rows) {
      const side = probedSide(row);
      if (row[side].policy !== name) continue;
      const klass = armedTerminal(row[side].setup);
      (taken[state][klass] ??= []).push(row[side === "left" ? "right" : "left"].damage);
    }
  }
  const classes = ["blade", "plate", "maul"];
  const seen = classes.filter((klass) => (taken.on[klass]?.length ?? 0) > 0 && (taken.off[klass]?.length ?? 0) > 0);
  if (seen.length === 0) say("parry on takes less damage than parry off on blade and plate, and not on maul", null, "not run");
  else {
    const delta = Object.fromEntries(seen.map((klass) => [klass, mean(taken.on[klass]) - mean(taken.off[klass])]));
    const held = (delta.blade ?? 1) < 0 && (delta.plate ?? 1) < 0 && (delta.maul ?? -1) >= 0;
    say("parry on takes less damage than parry off on blade and plate, and not on maul", held,
      seen.map((klass) => `${klass} ${delta[klass] >= 0 ? "+" : ""}${delta[klass].toFixed(1)}`).join(", ") +
      " damage taken, on minus off");
  }
  return scored;
}

// ------------------------------------------------------------------------------- the printing

const pad = (value, width) => String(value).padStart(width);
const fixed = (value, digits, width) => pad(value.toFixed(digits), width);

export function formatProbe(summary, scored = null) {
  const lines = [];
  const head =
    "  bouts  decided  won   gap m  pred m  gap/R  pred  sd   strike/R  pred  inside%  started  aborts  blows  dealt  taken  stall  outside";
  const row = (cell) =>
    `${pad(cell.bouts, 5)}  ${fixed(cell.decided * 100, 0, 6)}%  ${fixed(cell.won * 100, 0, 3)}%  ` +
    `${fixed(cell.gap, 2, 6)}  ${fixed(cell.predictedGap, 2, 6)}  ` +
    `${fixed(cell.gapOverTheirReach, 2, 5)}  ${fixed(cell.predictedGapOverTheirReach, 2, 4)}  ` +
    `${fixed(cell.gapSd, 2, 4)}  ${fixed(cell.strikeOverMyReach, 2, 8)}  ` +
    `${fixed(cell.predictedStrikeOverMyReach, 2, 4)}  ${fixed(cell.insideStrike * 100, 1, 7)}  ` +
    `${fixed(cell.strokesStarted, 1, 7)}  ${fixed(cell.aborts, 1, 6)}  ${fixed(cell.blows, 2, 5)}  ` +
    `${fixed(cell.damageDealt, 1, 5)}  ${fixed(cell.damageTaken, 1, 5)}  ` +
    `${fixed(cell.stallSeconds, 1, 5)}  ${fixed(cell.outsideSeconds, 1, 7)}`;
  const width = Math.max(20, ...summary.map((cell) => cell.name.length));
  lines.push(`=== the action surface, one pinned axis a row -- ${summary.length} cells ===`);
  lines.push(`  ${"cell".padEnd(width)}${head}`);
  for (const cell of summary) lines.push(`  ${cell.name.padEnd(width)}${row(cell)}`);
  if (scored !== null) {
    lines.push("");
    lines.push("=== the four predictions the plan wrote before the run ===");
    for (const entry of scored) {
      const verdict = entry.held === null ? "not run" : entry.held ? "HELD" : "MISSED";
      lines.push(`  ${verdict.padEnd(8)}${entry.claim}`);
      lines.push(`          ${entry.detail}`);
    }
  }
  return lines.join("\n");
}

/** The rows of a probe log, refused by version; the header comes back beside them. */
export function readProbe(path) {
  const lines = readFileSync(path, "utf8").split("\n").filter((line) => line.length > 0);
  if (lines.length === 0) throw new Error(`${path} is empty`);
  const header = JSON.parse(lines[0]);
  if (header.probe !== AXIS_PROBE_VERSION) {
    throw new Error(`${path} was written under probe version ${header.probe}; this is ${AXIS_PROBE_VERSION}`);
  }
  return { header, rows: lines.slice(1).map((line) => JSON.parse(line)) };
}

// ------------------------------------------------------------------------------------- the run

/**
 * One whole probe: pool, cells, shared pairings, workers, file, tables.
 *
 * `axis` and `base` pick the cells when `cells` is not given, which is the plan's
 * `axisProbe({pool, axis, values, base, bouts, workers, seed})` with the grids named rather than
 * passed -- the grids are the measurement and a caller that could pass its own would be able to
 * take a table nobody could reproduce from the run's own header.
 */
export async function axisProbe({
  seed, bouts, workers, cap = 60, random = 40, axis = "all", base = "uniform", terminals = "viable",
  pool = null, cells = null, out, onProgress = null, opponent = PROBE_OPPONENT,
}) {
  pool ??= buildPool({ seed, random });
  cells ??= cellsFor(axis, base);
  const viable = terminals !== "all";
  const jobs = probeJobs({ pool, cells, bouts, seed, cap, viable, opponent });
  const contenders = probeContenders(cells);
  mkdirSync(dirname(out), { recursive: true });
  const header = {
    version: TOURNAMENT_VERSION, probe: AXIS_PROBE_VERSION, seed, date: new Date().toISOString(),
    bouts, cap, random, terminals, axis, base, opponent,
    cells: cells.map(({ name, base: on, label, pinned, table }) => ({ name, base: on, label, pinned, table })),
    pool: pool.map(({ name, setup, caption }) => ({ name, setup, caption })),
  };
  writeFileSync(out, `${JSON.stringify(header)}\n`);
  const rows = await runJobs(jobs, {
    workers, contenders,
    onRow(row) { appendFileSync(out, JSON.stringify(row) + "\n"); },
    onProgress,
  });
  const summary = summariseProbe(rows, cells);
  return { header, cells, jobs, rows, summary, scored: scorePredictions(summary, rows), out };
}

const isMain = isMainThread && process.argv[1] !== undefined
  && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  const argv = process.argv.slice(2);
  const flag = (name, fallback) => {
    const at = argv.indexOf(`--${name}`);
    return at >= 0 && argv[at + 1] !== undefined ? argv[at + 1] : fallback;
  };
  const read = flag("read", null);
  if (read !== null) {
    const { header, rows } = readProbe(read);
    console.log(`${read}: seed ${header.seed}, ${rows.length} rows over ${header.cells.length} cells, ${header.date}`);
    const summary = summariseProbe(rows, header.cells);
    console.log(formatProbe(summary, scorePredictions(summary, rows)));
  } else {
    const seed = Number(flag("seed", 20260906)) >>> 0;
    const bouts = Math.max(2, Number(flag("bouts", 16)));
    const workers = Math.max(1, Number(flag("workers", Math.max(1, Math.floor(availableParallelism() / 2)))));
    const random = Math.max(0, Number(flag("random", 40)));
    const cap = Number(flag("cap", 60));
    const axis = flag("axis", "all");
    const base = flag("base", "uniform");
    if (!PROBE_BASES.includes(base)) {
      throw new Error(`--base takes ${PROBE_BASES.join(" or ")}, not "${base}"`);
    }
    // The set's frozen choice 1: every pool draws through Session 01's predicate, and `all` is the
    // one word that puts the whole pool back. Spelled out rather than defaulted silently, as
    // `--pairs` is in `scripts/tournament.mjs`, so a run's shell history says which pool its table
    // is about.
    const terminals = flag("terminals", "viable");
    if (terminals !== "viable" && terminals !== "all") {
      throw new Error(`--terminals takes "viable" or "all", not "${terminals}"`);
    }
    // Refused here rather than in a worker, and by the harness's own list: `scheduleJobs` checks a
    // policy name against what the golem offers, so a typo is a message at the top of the run and
    // not a hundred and twenty-eight cells of the wrong opponent.
    const opponent = flag("opponent", PROBE_OPPONENT);
    const cells = cellsFor(axis, base);
    const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 13);
    const out = resolve(flag("out", "tournaments/" + stamp + "-" + seed + "-axis-" + axis + ".jsonl"));
    if (existsSync(out)) throw new Error(`${out} exists; name another with --out`);
    console.log(`seed ${seed}, ${cells.length} cells x ${bouts} bouts = ${cells.length * bouts}, ` +
      `${workers} workers, cap ${cap} s, ${random} drawn builds, ${terminals} pairs, ` +
      `every cell against ${opponent}`);
    let lastReport = 0;
    const { summary, scored } = await axisProbe({
      seed, bouts, workers, cap, random, axis, base, terminals, out, opponent,
      onProgress({ done, total, seconds }) {
        if (done === total || seconds - lastReport >= 10) {
          lastReport = seconds;
          console.error(`  ${done}/${total} bouts, ${(done / seconds).toFixed(1)} a second`);
        }
      },
    });
    console.log(formatProbe(summary, scored));
    console.log(`\n${cells.length * bouts} rows in ${out}`);
  }
}
