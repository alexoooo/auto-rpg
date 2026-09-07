// The tournament: seeded golem-versus-golem bouts across every hardware thread, over random and
// reference builds, rated per policy and per policy-by-build-class.
//
//     npm run tournament                                   -- 64 bouts of the duelist against itself
//     npm run tournament -- --bouts 512 --workers 8        -- more, on fewer threads
//     npm run tournament -- --policies golem-duelist,golem-fencer
//     npm run tournament -- --seed 777001 --random 40      -- another corpus, a bigger random pool
//     npm run tournament -- --read tournaments/x.jsonl     -- the tables again, from the log
//
// Every bout is `scripts/bout-runner.mjs`'s, run in `scripts/tournament-worker.mjs` on a fresh
// Havok module, so a row here is the same bout the measure runs and the page runs. Results go
// to a JSON-lines file under `tournaments/`, which is gitignored: what is committed is the
// summary in `docs/measurements.md`, with the seed that regenerates the file.
//
// **A job is plain data and a run is a function of its seed.** The pool of builds, the pairings,
// the policy assignment and every bout's seeds come from `--seed` alone through `mulberry32`
// and `seedFor`, and each job is run side-swapped as the next job. Workers pull jobs in index
// order and rows are written in index order whatever order they finish in, so the file two runs
// produce under one seed is the same file to the byte -- `tests/tournament.test.mjs` asserts it
// over two workers. **Ratings are Elo**, walked over the rows in index order with one K, per
// policy from the bouts whose policies differ and per policy-by-build-class from the bouts
// whose classes differ; a mirror bout of one policy on one class rates nothing and is kept for
// its structural columns. Pool and pairings, never best-of-N: the dev host runs 32 bouts at
// once and a bracket is a queue.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Worker, isMainThread } from "node:worker_threads";

import { defaultGolemSetup, describeGolemSetup, golemSetupRefusal, randomGolemSetup } from "../src/golem/build.ts";
import { REACH_BANDS, reachBand } from "../src/golem/champion.ts";
import { mulberry32 } from "../src/rng.ts";
import { unitDefinition } from "../src/units.ts";

/** Bumped when a row's shape changes; `--read` refuses a file written under another. */
export const TOURNAMENT_VERSION = 1;

/** Elo's K. Twenty-four: fast enough for a few hundred bouts to separate, slow enough not to chase noise. */
export const ELO_K = 24;
export const ELO_START = 1000;

/**
 * The reach bands a build class is made of live in `src/golem/champion.ts` since Session 07,
 * because the champion mind reads its own arm's band off its view with the same edges; they are
 * re-exported here so a reader of the tournament finds them where Session 04 put them. A build's
 * class is its armed terminal crossed with its band, so a rating can say "blades at long reach"
 * without naming a chain.
 */
export { REACH_BANDS, reachBand };

const setup = (over) => ({ ...defaultGolemSetup(), ...over });
const both = (chain, terminal) => ({ primary: { chain, terminal }, secondary: { chain, terminal } });

/**
 * The reference pool: a dozen named builds a rating has a stable floor to stand on.
 *
 * The random draw over 2376 assemblies gives a rating breadth; these give it a place to come
 * back to, so a policy rated on Monday and a policy rated on Friday were rated on at least
 * twelve of the same bodies. One slot moved at a time from the default where that is the point
 * (the wheel, the multileg, the plated trunk, the ram head), and the four weapons of the matchup
 * set each in the default's hands. Every one is checked by `golemSetupRefusal` at load, so a
 * pair the registry stops offering fails the run at the top rather than in a worker.
 */
export const REFERENCE_BUILDS = Object.freeze([
  { name: "default", setup: setup({}) },
  { name: "two-blades", setup: setup(both("wrist", "blade")) },
  { name: "mace", setup: setup({ primary: { chain: "wrist", terminal: "mace" } }) },
  { name: "maul", setup: setup(both("wrist", "maul")) },
  { name: "whip", setup: setup({ primary: { chain: "wrist", terminal: "whip" } }) },
  { name: "fists", setup: setup(both("wrist", "fist")) },
  { name: "ram-capped", setup: setup({ head: "head.ram", ...both("none", "none") }) },
  { name: "ram-blade", setup: setup({ head: "head.ram" }) },
  { name: "wheel", setup: setup({ locomotion: "locomotion.wheel" }) },
  { name: "multileg", setup: setup({ locomotion: "locomotion.multileg" }) },
  { name: "plated", setup: setup({ torso: "torso.plated" }) },
  { name: "pitch-blade", setup: setup({ primary: { chain: "pitch", terminal: "blade" }, secondary: { chain: "pitch", terminal: "plate" } }) },
].map((build) => Object.freeze({ ...build, setup: Object.freeze(build.setup) })));

for (const build of REFERENCE_BUILDS) {
  const refusal = golemSetupRefusal(build.setup);
  if (refusal !== null) throw new Error(`reference build "${build.name}" is refused: ${refusal}`);
}

/**
 * A seed per side per pairing, from the run's seed and the pairing number. The measure's
 * `seedFor` restated here rather than imported, because this file must load without Havok: the
 * pool and the schedule are tested and read back without a worker in sight.
 */
export function seedFor(runSeed, pairing, slot) {
  let x = (runSeed ^ Math.imul(pairing + 1, 0x9e3779b9) ^ Math.imul(slot + 1, 0x85ebca6b)) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d) >>> 0;
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b) >>> 0;
  return (x ^ (x >>> 16)) >>> 0;
}

/** The reference pool plus `random` seeded draws, each named by its place and captioned. */
export function buildPool({ seed, random }) {
  const rng = mulberry32(seed ^ 0x5eed);
  const drawn = Array.from({ length: random }, (_, i) => ({
    name: `draw-${i + 1}`,
    setup: randomGolemSetup(rng),
  }));
  return [...REFERENCE_BUILDS, ...drawn].map((build) => ({
    ...build, caption: describeGolemSetup(build.setup),
  }));
}

/** The ordered policy pairs a run cycles through: every policy against every policy, itself included. */
export function policyPairs(policies) {
  const pairs = [];
  for (const a of policies) for (const b of policies) pairs.push([a, b]);
  return pairs;
}

/**
 * The job list: `pairings` draws of two builds from the pool, each run twice with the sides
 * swapped and the seeds swapped with them, policies cycling over the ordered pairs.
 *
 * `contenders` names minds that are not policies the golem offers: a name the tuner made up
 * for a vector, which the worker builds as a champion over that vector (Session 07). `pairs`
 * replaces the cycle over every ordered pair with the ones given, so a run can rate each of
 * several contenders against a league and never against each other; the builds and the seeds
 * per pairing come from the seed alone whatever the pairs are, which is what lets the tuner
 * put every contender in front of the same bodies with the same streams.
 */
export function scheduleJobs({
  pool, policies, pairings, seed, cap, cross = false, mirror = false, contenders = null, pairs = null,
}) {
  const golem = unitDefinition("golem");
  for (const policy of policies) {
    if (contenders !== null && policy in contenders) continue;
    if (!golem.driverOptions.some((option) => option.name === policy)) {
      throw new Error(`"${policy}" is not a policy the golem offers`);
    }
  }
  if (pairs !== null) {
    for (const pair of pairs) for (const policy of pair) {
      if (!policies.includes(policy)) throw new Error(`pair names "${policy}", which is not among the run's policies`);
    }
  }
  if (pool.length === 0) throw new Error("a tournament needs a build to run");
  const rng = mulberry32(seed ^ 0x0b0e);
  // `cross` drops the mirror pairs, so a run that exists to compare two policies spends its
  // whole budget on bouts between them; a mirror bout rates no policy and half a default run is
  // mirrors. The class ratings lose nothing, since a mirror bout on one class rated no class.
  const cycle = pairs !== null ? pairs : cross ? policyPairs(policies).filter(([a, b]) => a !== b) : policyPairs(policies);
  if (cycle.length === 0) throw new Error(pairs !== null ? "pairs is empty" : "--cross wants at least two policies");
  // `mirror` puts one build on both sides of every pairing, so what differs across a bout is
  // the mind alone. Over random pairs of bodies the body decides most bouts before either mind
  // has done anything -- a maul wins 232 of 234 against anything that is not one -- and a policy
  // rated on that pool is rated on a coin the body has already flipped. Session 05 of the
  // matchup set added it for exactly that reason; `docs/measurements.md` has the two tables.
  const jobs = [];
  for (let pairing = 0; pairing < pairings; pairing += 1) {
    const a = pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
    const drawn = pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
    // Drawn either way, so a mirror run and a plain run under one seed walk the same stream.
    const b = mirror ? a : drawn;
    const [policyA, policyB] = cycle[pairing % cycle.length];
    const sideA = { build: a.name, setup: a.setup, policy: policyA, seed: seedFor(seed, pairing, 0) };
    const sideB = { build: b.name, setup: b.setup, policy: policyB, seed: seedFor(seed, pairing, 1) };
    jobs.push({ index: jobs.length, pairing, swapped: false, cap, left: sideA, right: sideB, seeds: [sideA.seed, sideB.seed] });
    jobs.push({ index: jobs.length, pairing, swapped: true, cap, left: sideB, right: sideA, seeds: [sideB.seed, sideA.seed] });
  }
  return jobs;
}

/** The hand a build fights with: its primary, or its secondary when the primary is capped. */
export function armedHand(build) {
  return build.primary.terminal !== "none" ? "primary" : "secondary";
}

/** The terminal in that hand. */
export function armedTerminal(build) {
  return build[armedHand(build)].terminal;
}

/**
 * `blade/long`, `mace/mid`, `none/short`: the class a rating row is keyed by. The reach is the
 * armed hand's own, as the worker read it off the published view, and not the body's:
 * `BodyView.reach` is the primary socket's, and a build with a capped primary and a whip on the
 * secondary publishes the cap's 0.24 m there while lashing at two.
 */
export function buildClass(side) {
  return `${armedTerminal(side.setup)}/${reachBand(side.reach)}`;
}

const expected = (mine, theirs) => 1 / (1 + 10 ** ((theirs - mine) / 400));

/**
 * Elo over the rows in index order, for one keying of the two sides.
 *
 * `key(side)` names the entity a side plays as; when both sides of a row are the same entity
 * the row is counted but moves nothing. A draw is half a win each way.
 */
export function elo(rows, key, k = ELO_K) {
  const table = new Map();
  const entry = (name) => {
    if (!table.has(name)) table.set(name, { name, rating: ELO_START, bouts: 0, wins: 0, draws: 0, losses: 0 });
    return table.get(name);
  };
  for (const row of [...rows].sort((a, b) => a.index - b.index)) {
    const left = entry(key(row.left));
    const right = entry(key(row.right));
    const scoreLeft = row.winner === "left" ? 1 : row.winner === "right" ? 0 : 0.5;
    for (const [side, score] of [[left, scoreLeft], [right, 1 - scoreLeft]]) {
      side.bouts += 1;
      if (score === 1) side.wins += 1; else if (score === 0) side.losses += 1; else side.draws += 1;
    }
    if (left === right) continue;
    const gainLeft = k * (scoreLeft - expected(left.rating, right.rating));
    left.rating += gainLeft;
    right.rating -= gainLeft;
  }
  return [...table.values()].sort((a, b) => b.rating - a.rating || a.name.localeCompare(b.name));
}

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const quantile = (xs, q) => {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
};

/**
 * The mean of one column over the sides that carry it, or `undefined` if none do.
 *
 * A column added without a version bump is absent from every row of an older file, and
 * `--read` of one has to summarise what is there rather than print zeroes that read as
 * measurements. A side missing the column is skipped, not counted as zero, so a file where half
 * the rows predate a column would still report the half that has it -- which cannot happen
 * inside one run and is the honest answer if it ever does.
 */
const column = (sides, read) => {
  const seen = [];
  for (const side of sides) {
    const value = read(side);
    if (value !== undefined && value !== null) seen.push(value);
  }
  return seen.length === 0 ? undefined : mean(seen);
};

/** The structural columns for the sides `pick` selects, so a rating is never read alone. */
function structural(rows, pick) {
  const sides = [];
  const winners = [];
  const seconds = [];
  const changed = [];
  for (const row of rows) {
    for (const name of ["left", "right"]) {
      if (!pick(row[name])) continue;
      sides.push(row[name]);
      seconds.push(row.seconds);
      changed.push(row.leadChanges > 0 ? 1 : 0);
      if (row.winner === name) winners.push(row[name].vitality);
    }
  }
  return {
    bouts: sides.length,
    damage: mean(sides.map((side) => side.damage)),
    contacts: mean(sides.map((side) => side.contacts)),
    severs: sides.reduce((sum, side) => sum + side.severs, 0),
    winnerBar: mean(winners),
    insideInner: mean(sides.map((side) => side.insideInner)),
    leadChanged: mean(changed),
    seconds: quantile(seconds, 0.5),
    // Session 00 of the style set: what a stroke was, beside what a contact was. Every one of
    // these is a mean over the sides that carry it, so a file written before they existed
    // summarises without them rather than with zeroes.
    strokes: column(sides, (side) => side.strokes),
    blows: column(sides, (side) => side.blows),
    strokeDamage: column(sides, (side) => side.strokeDamage),
    scoringSpeed: column(sides, (side) => side.scoringSpeed),
    caughtFraction: column(sides, (side) => side.caughtFraction),
    catches: column(sides, (side) => side.catches),
    committedFraction: column(sides, (side) => side.committedFraction),
    clinchSeconds: column(sides, (side) => side.clinchSeconds),
    idleTravelMetres: column(sides, (side) => side.idleTravelMetres),
    tangentialTravelMetres: column(sides, (side) => side.tangentialTravelMetres),
    radialClosingMetres: column(sides, (side) => side.radialClosingMetres),
    nearRangeStallSeconds: column(sides, (side) => side.nearRangeStallSeconds),
    retreatOutsideReachSeconds: column(sides, (side) => side.retreatOutsideReachSeconds),
  };
}

/** Ratings and structural columns per policy and per policy-by-class, plus a policy matrix. */
export function summarize(rows) {
  const byPolicy = elo(rows, (side) => side.policy).map((entry) => ({
    ...entry, ...structural(rows, (side) => side.policy === entry.name),
  }));
  const classKey = (side) => `${side.policy} @ ${buildClass(side)}`;
  const byClass = elo(rows, classKey).map((entry) => ({
    ...entry, ...structural(rows, (side) => classKey(side) === entry.name),
  }));
  const policies = byPolicy.map((entry) => entry.name);
  const matrix = policies.map((a) => policies.map((b) => {
    let wins = 0, bouts = 0;
    for (const row of rows) {
      for (const [me, them] of [["left", "right"], ["right", "left"]]) {
        if (row[me].policy !== a || row[them].policy !== b) continue;
        bouts += 1;
        if (row.winner === me) wins += 1; else if (row.winner === null) wins += 0.5;
      }
    }
    return { wins, bouts };
  }));
  const decided = rows.filter((row) => row.winner !== null).length;
  return { bouts: rows.length, decided, byPolicy, byClass, policies, matrix };
}

const pad = (value, width) => String(value).padStart(width);
const fixed = (value, digits, width) => pad(value.toFixed(digits), width);
/** A column an older file does not carry prints as a dash rather than as a number nobody took. */
const maybe = (value, digits, width) => (value === undefined ? pad("--", width) : fixed(value, digits, width));

export function formatSummary(summary) {
  const lines = [];
  const columns = "   elo  bouts  w/d/l          damage/bout  contacts  severs  winner bar  inside inner  lead changed  p50 s";
  const row = (entry) =>
    `${fixed(entry.rating, 0, 6)}  ${pad(entry.bouts, 5)}  ${pad(`${entry.wins}/${entry.draws}/${entry.losses}`, 12)}  ` +
    `${fixed(entry.damage, 1, 11)}  ${fixed(entry.contacts, 1, 8)}  ${pad(entry.severs, 6)}  ` +
    `${fixed(entry.winnerBar, 3, 10)}  ${fixed(entry.insideInner * 100, 1, 11)}%  ${fixed(entry.leadChanged * 100, 1, 11)}%  ` +
    `${fixed(entry.seconds, 1, 5)}`;
  // The second block: what one stroke was. A rating says who won and the first block says how
  // much landed; neither can tell a cut from a rake, and the flail complaint this set answers is
  // a complaint about strokes. Printed as its own table rather than widened onto the first,
  // because thirteen columns on one line wrap in every terminal the run is read in.
  const strokeColumns = "  strokes  blows  dmg/stroke  v@blow  caught%  catches  commit%  clinch s  idle m  tangent m  closing m  stall s  outside s";
  const strokeRow = (entry) =>
    `${maybe(entry.strokes, 1, 9)}  ${maybe(entry.blows, 2, 5)}  ${maybe(entry.strokeDamage, 2, 10)}  ` +
    `${maybe(entry.scoringSpeed, 1, 6)}  ${maybe(entry.caughtFraction === undefined ? undefined : entry.caughtFraction * 100, 1, 6)}%  ` +
    `${maybe(entry.catches, 1, 7)}  ${maybe(entry.committedFraction === undefined ? undefined : entry.committedFraction * 100, 1, 6)}%  ` +
    `${maybe(entry.clinchSeconds, 1, 8)}  ${maybe(entry.idleTravelMetres, 1, 6)}  ${maybe(entry.tangentialTravelMetres, 1, 9)}  ` +
    `${maybe(entry.radialClosingMetres, 1, 9)}  ${maybe(entry.nearRangeStallSeconds, 1, 7)}  ${maybe(entry.retreatOutsideReachSeconds, 1, 9)}`;
  lines.push(`=== policies -- ${summary.bouts} bouts, ${summary.decided} decided ===`);
  lines.push(`  ${"policy".padEnd(20)}${columns}`);
  for (const entry of summary.byPolicy) lines.push(`  ${entry.name.padEnd(20)}${row(entry)}`);
  lines.push("");
  lines.push("=== policies, by the stroke -- a stroke is one burst on one effector, 0.25 s apart ===");
  lines.push(`  ${"policy".padEnd(20)}${strokeColumns}`);
  for (const entry of summary.byPolicy) lines.push(`  ${entry.name.padEnd(20)}${strokeRow(entry)}`);
  if (summary.policies.length > 1) {
    lines.push("");
    lines.push("=== policy against policy -- wins for the row, draws as a half ===");
    lines.push(`  ${"".padEnd(20)}${summary.policies.map((name) => pad(name, 20)).join("")}`);
    summary.policies.forEach((name, i) => {
      lines.push(`  ${name.padEnd(20)}${summary.matrix[i].map((cell) =>
        pad(cell.bouts === 0 ? "-" : `${cell.wins}/${cell.bouts}`, 20)).join("")}`);
    });
  }
  lines.push("");
  lines.push("=== policy by build class -- the armed terminal, and the reach band it was published at ===");
  lines.push(`  ${"policy @ class".padEnd(36)}${columns}`);
  for (const entry of summary.byClass) lines.push(`  ${entry.name.padEnd(36)}${row(entry)}`);
  lines.push("");
  lines.push("=== policy by build class, by the stroke ===");
  lines.push(`  ${"policy @ class".padEnd(36)}${strokeColumns}`);
  for (const entry of summary.byClass) lines.push(`  ${entry.name.padEnd(36)}${strokeRow(entry)}`);
  return lines.join("\n");
}

/** The rows of a JSON-lines file, refused by version; the header is returned beside them. */
export function readRows(path) {
  const lines = readFileSync(path, "utf8").split("\n").filter((line) => line.length > 0);
  if (lines.length === 0) throw new Error(`${path} is empty`);
  const header = JSON.parse(lines[0]);
  if (header.version !== TOURNAMENT_VERSION) {
    throw new Error(`${path} was written under tournament version ${header.version}; this is ${TOURNAMENT_VERSION}`);
  }
  return { header, rows: lines.slice(1).map((line) => JSON.parse(line)) };
}

const workerUrl = new URL("./tournament-worker.mjs", import.meta.url);

/**
 * Run the jobs over `workers` threads and return the rows in index order.
 *
 * Each worker takes one job at a time and asks for the next by returning a row; the rows are
 * collected by index and handed to `onRow` as the contiguous prefix grows, which is how the
 * file is written in order while the run is still going. A worker that throws fails the run,
 * by design: a tournament with a hole in it is not the tournament its seed names.
 */
/**
 * The window cap of the exchange log, seconds. An option that runs longer than this is cut into
 * windows so that a long hold is several records of "nothing happened" and not one, which is
 * what makes the transition table's rows comparable: every record is at most this long.
 */
export const EXCHANGE_WINDOW_SECONDS = 0.5;
/**
 * An option that lasted under this was a flicker -- the void switching on and off as the read
 * of their arm flickers between chamber and commit at 240 Hz -- and not a decision. The window
 * keeps its start and takes the new option's name, so the log holds no zero-length records.
 */
export const EXCHANGE_FLICKER_SECONDS = 0.05;

/**
 * The gap that separates one stroke of one effector from the next, seconds.
 *
 * A pass of one blade books a burst of contacts on the per-part cooldown, 0.09 s apart, inside
 * a single 0.15 s commit; a quarter second is longer than any such burst and shorter than the
 * 0.30 s recover that follows one, so reports on one effector closer together than this are one
 * stroke and the next one is another. It is the window Session 12b of the golem set used to say
 * what one pass is, and Session 01 of this set charges for a part once inside the same window:
 * what the instrument counts here is what the rule will later refuse to bill twice.
 */
export const STROKE_GAP_SECONDS = 0.25;

/**
 * What makes a blow committed: the body was leaning into it, or walking into it.
 *
 * Both are read off the striker's own published view at the sample the blow landed on --
 * `trunkLean` as the solver achieved it, normalized, and the rate the two stances are closing,
 * over `CLOSING_LAG_SECONDS`. A blow thrown from a standing body with a still gap is an arm
 * reaching out, which is most of what the flail complaint is about; either number clearing its
 * threshold says the body was behind it. The lean threshold is well under `commitLean` 0.40, so
 * a real commit clears it part-way through the waist's slew, and the closing threshold is under
 * the speed a walking step makes.
 *
 * **Read the closing half as "moving", not as "arriving".** Measured over the fencer's own
 * bouts, a blow lands with the gap closing at 0.3 m/s or more about a quarter of the time and
 * with it *opening* that fast about as often: the swing in and out nets 0.03 m/s. So a high
 * committed column is not by itself a body that went somewhere, and the Session 00 entry says
 * so beside the number. What would move the net is an option that drives forward through the
 * chamber and the commit, which is Session 04's `cut`.
 */
export const COMMITTED_LEAN = 0.15;
export const COMMITTED_CLOSING_MPS = 0.3;

/** How long nothing may land, either way, before two bodies at touching distance are clinched. */
export const CLINCH_QUIET_SECONDS = 0.75;

/**
 * How far back the closing rate is read, seconds.
 *
 * The gap differenced sample to sample at 240 Hz is a speed plus a step of solver noise, and it
 * put five points on the committed column; read a tenth of a second back instead and that goes
 * away, while a step-in still shows, since the chamber it would be part of runs 0.22 s. Reading
 * the gap that far back is the whole of the filter -- no decay constant to pick and nothing
 * carried between bouts.
 *
 * A longer window was measured and rejected. Over the fencer's own bouts the mean closing rate
 * at a blow is 0.03 m/s at this lag and 0.09 m/s at a full second, while the mean *magnitude*
 * is 0.40 and 0.24: the bodies swing in and out at a third of a metre a second and arrive
 * nowhere, at every window that was tried. That is a fact about the fighting rather than about
 * the filter, so the shortest window that is not noise is the one kept, and the Session 00
 * entry in `docs/measurements.md` prints the table and says what the column therefore means.
 */
export const CLOSING_LAG_SECONDS = 0.1;

/**
 * Which slot a limb key names, over `side.golem.slot.part`; the rule `slotHealth` uses.
 *
 * A key with fewer than two segments is a block report (`block:shield`) or a body that is not a
 * golem, and names no slot.
 */
export function slotOf(key) {
  const parts = String(key).split(".");
  return parts.length < 2 ? null : parts[parts.length - 2];
}

/**
 * One side's strokes, gathered from the contact events its own effectors booked.
 *
 * The instrument exists because the row's `contacts` column cannot tell a cut from a rake: a
 * stroke that drags a blade across a trunk books four contacts on the per-part cooldown and
 * reads as four blows, and the baseline the set is measured against needs to know which. A
 * stroke here is a burst on one effector; per stroke it keeps how many blows it booked, what
 * they came to, and the one that scored most -- that blow's speed, kind and part, and whether
 * the body was behind it. Two effectors swinging at once are two strokes, kept apart by their
 * `effectorId`, which is why the open strokes are a map and not one slot.
 *
 * A blow on a hand slot is filed as **caught**: today it is a blade meeting a plate or another
 * blade, which wounds what it hit and is counted nowhere; Session 01 books it as a block. The
 * column is here first so the rule's effect is one table.
 */
export function strokeInstrument() {
  const open = new Map();
  const done = [];
  let lean = 0;
  let closing = 0;
  const shut = (stroke) => {
    const slot = stroke.key === null ? null : slotOf(stroke.key);
    stroke.caught = slot === "primary" || slot === "secondary";
    done.push(stroke);
  };
  return {
    strokes: done,
    /** The posture the next blow is stamped with, written once a sample from the striker's view. */
    posture(nowLean, nowClosing) {
      lean = nowLean;
      closing = nowClosing;
    },
    event(event) {
      const report = event.report;
      let stroke = open.get(event.effectorId);
      if (stroke !== undefined && report.at - stroke.last >= STROKE_GAP_SECONDS) {
        shut(stroke);
        stroke = undefined;
      }
      if (stroke === undefined) {
        stroke = { blows: 0, damage: 0, best: -1, speed: 0, kind: null, key: null,
          committed: false, caught: false, at: report.at, last: report.at };
        open.set(event.effectorId, stroke);
      }
      stroke.blows += 1;
      stroke.damage += report.damage;
      stroke.last = report.at;
      // Strictly greater, from a floor below zero, so the first blow of a stroke is the scoring
      // blow until one beats it and a stroke that scored nothing still names where it landed.
      if (report.damage > stroke.best) {
        stroke.best = report.damage;
        stroke.speed = report.speed;
        stroke.kind = report.kind;
        stroke.key = report.key;
        stroke.committed = lean >= COMMITTED_LEAN || closing >= COMMITTED_CLOSING_MPS;
      }
    },
    /** Close the strokes still open at the verdict and return them all, oldest first. */
    close() {
      for (const stroke of open.values()) shut(stroke);
      open.clear();
      done.sort((a, b) => a.at - b.at);
      return done;
    },
  };
}

/** The stroke columns of one side, as means over its strokes; a side that never swung is zero. */
export function strokeColumns(strokes) {
  const count = strokes.length;
  const per = (read) => (count === 0 ? 0 : strokes.reduce((total, stroke) => total + read(stroke), 0) / count);
  return {
    strokes: count,
    blows: per((stroke) => stroke.blows),
    strokeDamage: per((stroke) => stroke.damage),
    scoringSpeed: per((stroke) => stroke.speed),
    caughtFraction: per((stroke) => (stroke.caught ? 1 : 0)),
    committedFraction: per((stroke) => (stroke.committed ? 1 : 0)),
  };
}

export function runJobs(jobs, {
  workers, onRow = null, onProgress = null, overrides = null, exchanges = false, contenders = null, record = null,
  behaviour = false,
}) {
  return new Promise((resolvePromise, reject) => {
    const rows = new Array(jobs.length).fill(null);
    let next = 0;
    let done = 0;
    let flushed = 0;
    const pool = [];
    const started = Date.now();
    const finish = () => {
      for (const worker of pool) worker.postMessage({ type: "stop" });
      resolvePromise(rows);
    };
    const fail = (error) => {
      for (const worker of pool) worker.terminate();
      reject(error instanceof Error ? error : new Error(String(error)));
    };
    const feed = (worker) => {
      if (next >= jobs.length) return;
      worker.postMessage({ type: "job", job: jobs[next] });
      next += 1;
    };
    if (jobs.length === 0) { resolvePromise(rows); return; }
    const count = Math.max(1, Math.min(workers, jobs.length));
    for (let i = 0; i < count; i += 1) {
      const worker = new Worker(workerUrl, { workerData: { overrides, exchanges, contenders, record, behaviour } });
      pool.push(worker);
      worker.on("message", (message) => {
        if (message.type === "ready") { feed(worker); return; }
        if (message.type === "error") { fail(new Error(`job ${message.index} failed in a worker: ${message.message}`)); return; }
        rows[message.row.index] = message.row;
        done += 1;
        while (flushed < rows.length && rows[flushed] !== null) {
          onRow?.(rows[flushed]);
          flushed += 1;
        }
        onProgress?.({ done, total: jobs.length, seconds: (Date.now() - started) / 1000 });
        if (done === jobs.length) finish(); else feed(worker);
      });
      worker.on("error", fail);
      worker.on("exit", (code) => { if (code !== 0 && done < jobs.length) fail(new Error(`a worker exited with ${code}`)); });
    }
  });
}

/**
 * A whole run: pool, schedule, workers, file, summary. Returns the rows and the summary.
 *
 * `out` is written as it goes: the header line first, then a row per finished job in index
 * order. Nothing about the date goes into a row, so two files from one seed differ in the
 * header's `date` field and nowhere else.
 */
export async function runTournament({
  seed, bouts, workers, policies, random, cap, out, onProgress = null, overrides = null, cross = false,
  mirror = false, exchanges = false, contenders = null, pairs = null, pool = null, behaviour = false,
}) {
  pool ??= buildPool({ seed, random });
  const jobs = scheduleJobs({ pool, policies, pairings: Math.ceil(bouts / 2), seed, cap, cross, mirror, contenders, pairs });
  mkdirSync(dirname(out), { recursive: true });
  const header = {
    version: TOURNAMENT_VERSION, seed, date: new Date().toISOString(), policies, bouts: jobs.length, cap, random,
    overrides, cross, mirror, exchanges, behaviour, contenders, pairs,
    pool: pool.map(({ name, setup, caption }) => ({ name, setup, caption })),
  };
  const lines = [JSON.stringify(header)];
  writeFileSync(out, `${lines[0]}\n`);
  const rows = await runJobs(jobs, {
    workers, exchanges, contenders, behaviour,
    overrides,
    onRow(row) {
      const line = JSON.stringify(row);
      lines.push(line);
      writeFileSync(out, lines.join("\n") + "\n");
    },
    onProgress,
  });
  return { header, pool, jobs, rows, summary: summarize(rows), out };
}

/**
 * `--override name=value,name=value` for the fencer's table, `GOLEM_TACTICS_V2`: every worker
 * assigns these over it before its first bout, and the run's header records them. Numbers and
 * the two booleans parse; anything else is refused, because a value that arrives as a string
 * would compare as one at 240 Hz and never say so. Null when there are none, so a header from
 * before this flag reads the same as one written with it empty.
 */
export function parseOverrides(text) {
  const entries = text.split(",").map((pair) => pair.trim()).filter(Boolean);
  if (entries.length === 0) return null;
  const overrides = {};
  for (const entry of entries) {
    const at = entry.indexOf("=");
    if (at <= 0) throw new Error(`--override wants name=value, got "${entry}"`);
    const name = entry.slice(0, at).trim();
    const raw = entry.slice(at + 1).trim();
    const value = raw === "true" ? true : raw === "false" ? false : Number(raw);
    if (typeof value === "number" && !Number.isFinite(value)) {
      throw new Error(`--override ${name}: "${raw}" is neither a number nor true/false`);
    }
    overrides[name] = value;
  }
  return overrides;
}

// `isMainThread` because a worker inherits the main script's `argv`, and a worker that imports
// this module for `armedHand` must not start a second tournament from inside the first.
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
    const { header, rows } = readRows(read);
    console.log(`${read}: seed ${header.seed}, ${rows.length} of ${header.bouts} bouts, policies ${header.policies.join(", ")}, ${header.date}`);
    console.log(formatSummary(summarize(rows)));
  } else {
    const seed = Number(flag("seed", 20260906)) >>> 0;
    const bouts = Math.max(2, Number(flag("bouts", 64)));
    // Half the hardware threads, not all of them. Measured on the 16-core, 32-thread dev host
    // over the same 256 bouts: 8 workers 4.2 bouts a second, 16 workers 5.5, 32 workers 5.1. A
    // golem bout is an iterative solver over two dozen constraints and the second thread on a
    // core buys nothing; past the core count the workers take turns. `docs/measurements.md`,
    // Session 04 of the matchup set, has the table.
    const workers = Math.max(1, Number(flag("workers", Math.max(1, Math.floor(availableParallelism() / 2)))));
    const policies = flag("policies", "golem-duelist").split(",").map((name) => name.trim()).filter(Boolean);
    const random = Math.max(0, Number(flag("random", 20)));
    const cap = Number(flag("cap", 60));
    const overrides = parseOverrides(flag("override", ""));
    const cross = argv.includes("--cross");
    const mirror = argv.includes("--mirror");
    // `--exchanges` puts the fencer sides' option windows on every row, for the duel model's
    // calibration (`scripts/calibrate-duel-model.mjs`). Rows grow by a few kilobytes each.
    const exchanges = argv.includes("--exchanges");
    // `--behaviour` puts the whole behaviour record of both sides on every row. The eight
    // stroke columns and the four engagement ones are on every row already; this is for a
    // question they were not chosen to answer, and it costs a kilobyte or two a row.
    const behaviour = argv.includes("--behaviour");
    const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 13);
    // Concatenated rather than a template, because the docs gate reads a backticked span that ends
    // in a file extension as a path reference, and this one is a name the run makes up.
    const out = resolve(flag("out", "tournaments/" + stamp + "-" + seed + "-" + policies.join("+") + ".jsonl"));
    if (existsSync(out)) throw new Error(`${out} exists; name another with --out`);
    console.log(`seed ${seed}, ${bouts} bouts, ${workers} workers, cap ${cap} s, policies ${policies.join(", ")}, ` +
      `${REFERENCE_BUILDS.length} reference builds + ${random} drawn${cross ? ", cross pairs only" : ""}${mirror ? ", one build both sides" : ""}${exchanges ? ", exchange log on" : ""}${behaviour ? ", behaviour records on" : ""}` +
      (overrides ? `, overriding ${JSON.stringify(overrides)}` : ""));
    let lastReport = 0;
    const { rows, summary } = await runTournament({
      seed, bouts, workers, policies, random, cap, out, overrides, cross, mirror, exchanges, behaviour,
      onProgress({ done, total, seconds }) {
        if (done === total || seconds - lastReport >= 10) {
          lastReport = seconds;
          console.error(`  ${done}/${total} bouts, ${(done / seconds).toFixed(1)} a second`);
        }
      },
    });
    console.log(formatSummary(summary));
    console.log(`\n${rows.length} rows in ${out}`);
  }
}
