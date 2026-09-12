/**
 * Reading a run the harness wrote, and turning it into arrays something can draw.
 * Session 02 of the learn set.
 *
 * ## Why this is a module of its own, with no DOM in it
 *
 * The curve page is the first thing in this prototype whose subject is a *file* rather than a
 * scene, and that changes where the defects live. Nothing here can be wrong in a way a screenshot
 * shows: a reader that takes `clipFraction` where it meant `kl`, or that drops the last row of a
 * run that is still going, draws a perfectly convincing line. The only instrument that catches
 * that is a test, and the Node runner has no DOM -- so every row parser and every series builder
 * is a pure function over text, in this file, and everything that touches an element is in
 * `chart.ts` and `main.ts`, which are not tested and are not allowed to decide anything.
 *
 * The split is worth stating as a rule rather than a habit: **if a function here needs an
 * element, it is in the wrong file, and if a function there needs to know what a column means, so
 * is it.**
 *
 * ## The row shapes are the harness's, and this file does not get to have an opinion
 *
 * `scripts/train-ppo.mjs` and `scripts/league.mjs` have been writing JSONL rows an iteration since
 * the style set, and `scripts/rate-snapshots.mjs` and `scripts/probe-snapshots.mjs` write curve
 * rows with `--out`. Every run already on disk is drawable because this file reads what they
 * write today, unchanged -- which is also why its tests are built from lines copied out of real
 * runs rather than from shapes somebody invented while reading the writers. A fixture assembled
 * from the writer's source and a fixture copied from its output disagree exactly where a reader
 * would be wrong, and only the second one can see it.
 *
 * Two consequences of that fidelity are worth knowing before adding a column:
 *
 * - **A train row and a league row are not the same row.** `retSem` and `collectSeconds` are on
 *   the trainer's rows and not the league's; `byOpponent`, `shares`, `pool` and `snapshot` are on
 *   the league's and not the trainer's. One `Iteration` type carries both, with `null` and empty
 *   collections where the file said nothing. A missing field is a fact about the run, so it is
 *   never filled in with a zero -- a zero would draw.
 * - **An iteration is not always a number.** Both curve scripts end their file with a row whose
 *   `iteration` is the string `main`: the live weights rather than a snapshot, which on an arm
 *   that stopped off a snapshot is the only rating of where the run actually got to. `Series.at`
 *   keeps that name, and `Series.x` puts the row one snapshot-gap past the last numbered one so
 *   the line does not lie about where it sits.
 *
 * ## Every series carries its pool, and this is the load-bearing rule
 *
 * `scripts/rate-snapshots.mjs` says it in its own header and the learn set froze it: a rating is
 * only comparable to another rating on the same pool. The evaluation pool is fifty-two draws and
 * thirty-seven of them carry no weapon that has ever finished a fight, so a bar margin averaged
 * over it and a bar margin averaged over the fifteen bodies where a fight can end are two
 * instruments that happen to print the same units. Overlaying them is not a slightly misleading
 * chart, it is a wrong answer with a legend on it.
 *
 * So a `Pool` travels with every series, `onePool` refuses a set that does not agree and names the
 * labels that differ, and the label is built from what the file actually said rather than from
 * what a run of that name usually means. A log records the seed, the random-pair count and the
 * terminal classes; a rate-curve row records the build count and the classes; a probe row records
 * neither, and its build count is recovered by summing the classes it rolled up. Two labels
 * therefore compare equal only when the two files said the same things, which is the direction to
 * be wrong in: a refusal costs a click, and a false overlay costs a conclusion.
 *
 * ## What is refused, and what is merely skipped
 *
 * A half-written last line is skipped, exactly as `readLog` in `scripts/league.mjs` skips it,
 * because the page's whole purpose is to be opened while the run is still writing. A bad line
 * anywhere else is refused: the harness appends whole rows, so a broken line in the middle is a
 * damaged file and drawing nine tenths of it silently is how a night gets misread.
 *
 * A row whose `version` this file does not know is refused by name and by number rather than
 * read hopefully. Every header the two trainers write carries `version: 1`, and the set's
 * artifact contract says a session that moves the surface says so; a reader that shrugs at a
 * version it has never seen is a reader that will one day draw version 2's `margin` on version
 * 1's axis. Curve rows carry no version today, and an absent version means the shape this file
 * was written against -- which is a different statement from a version it was told and did not
 * recognise.
 */

/** The one row version this file knows. A header saying anything else is refused. */
export const LOG_VERSION = 1;

/**
 * The classes a per-iteration row is expected to carry once Session 06 charges for them.
 *
 * The names are `src/engagement.ts`'s own and `scripts/tournament.mjs` already prints both, which
 * is the point: the column travels with the counter rather than being renamed on the way into a
 * log, so the page draws them the day the trainer starts writing them and not a session later.
 */
export const ENGAGEMENT_COLUMNS = ["nearRangeStallSeconds", "retreatOutsideReachSeconds"] as const;

type Row = Record<string, unknown>;

const isRow = (value: unknown): value is Row =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const numberAt = (row: Row, key: string): number | null => {
  const value = row[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
};

const textAt = (row: Row, key: string): string | null => {
  const value = row[key];
  return typeof value === "string" ? value : null;
};

const boolAt = (row: Row, key: string): boolean | null => {
  const value = row[key];
  return typeof value === "boolean" ? value : null;
};

const numbersAt = (row: Row, key: string): number[] => {
  const value = row[key];
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is number => typeof entry === "number");
};

const textsAt = (row: Row, key: string): string[] => {
  const value = row[key];
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
};

const numberMapAt = (row: Row, key: string): Record<string, number> => {
  const value = row[key];
  const out: Record<string, number> = {};
  if (!isRow(value)) return out;
  for (const [name, entry] of Object.entries(value)) {
    if (typeof entry === "number" && Number.isFinite(entry)) out[name] = entry;
  }
  return out;
};

const rowAt = (row: Row, key: string): Row => {
  const value = row[key];
  return isRow(value) ? value : {};
};

// ------------------------------------------------------------------ the pool a series was rated on

/**
 * Which fifty-two-or-fewer builds a run drew from, as far as the file admits.
 *
 * **It is the run's pool and not only its rating's**, which is why the label governs every axis
 * and not just the two bar-margin panels. A log's seed, random-pair count and terminal classes are
 * what `poolFor` is handed for the collection *and* what the evaluation pool is derived from, so
 * two runs whose labels differ were fitted on different fights as well as rated on them: their KL,
 * their entropy and their seconds an iteration are no more comparable than their margins. A curve
 * row records less -- the builds and the classes -- and says so by carrying less in its label.
 */
export interface Pool {
  /** The armed terminal classes kept, or the empty list for the whole pool. */
  readonly terminals: readonly string[];
  /** How many builds the pool drew, when the file says or the row can be summed. */
  readonly builds: number | null;
  /** The run seed the pool was drawn from, when the file says. */
  readonly seed: number | null;
  /** The random-pair count the pool was drawn with, when the file says. */
  readonly random: number | null;
  /**
   * The arrangement: one build in both corners, or two the pair predicate accepts. Null when the
   * file does not say, which is every curve row written before Session 06 of the learn set.
   *
   * It is a fact about the pool and not about the rating, which is why it lives here and governs
   * the label with the rest of them. The same fifty-two draws played mirrored and played as random
   * viable pairs are two different sets of bodies -- thirteen of them against all fifty-two -- and
   * Session 10's own arms are the case that forced the field: an arm rates on both every snapshot
   * now, so two rows of one curve can agree on seed, classes and count and still be two
   * instruments.
   */
  readonly mirror: boolean | null;
  /** One line, and the only thing two series are compared on. */
  readonly label: string;
}

/**
 * The label, built from what the file said and nothing else.
 *
 * Deliberately not normalised into some canonical description of "the pool a run of this shape
 * would have used": a log knows its seed and its random count and not its build count, a rate row
 * knows its build count and not its seed, and pretending the two are the same pool because they
 * probably are is the exact mistake this whole apparatus exists to refuse.
 */
export function poolLabel(pool: Omit<Pool, "label">): string {
  const parts = [pool.terminals.length === 0 ? "whole pool" : [...pool.terminals].join("+")];
  if (pool.builds !== null) parts.push(`${pool.builds} builds`);
  if (pool.mirror !== null) parts.push(pool.mirror ? "mirrored" : "random pairs");
  if (pool.random !== null) parts.push(`random ${pool.random}`);
  if (pool.seed !== null) parts.push(`seed ${pool.seed}`);
  return parts.join(", ");
}

const makePool = (over: Partial<Omit<Pool, "label">>): Pool => {
  const facts = {
    terminals: over.terminals ?? [],
    builds: over.builds ?? null,
    seed: over.seed ?? null,
    random: over.random ?? null,
    mirror: over.mirror ?? null,
  };
  return { ...facts, label: poolLabel(facts) };
};

// ------------------------------------------------------------------------------- what a run holds

/** The run's opening row: the settings a reader needs to know what the rest of it means. */
export interface Header {
  readonly version: number;
  readonly seed: number | null;
  readonly date: string | null;
  /** `POLICY_VERSION` and `PILOT_FEATURES_VERSION` as the run recorded them. */
  readonly policy: number | null;
  readonly features: number | null;
  readonly reward: Readonly<Record<string, number>>;
  /** The hand-coded minds a `train-ppo` run collected against. */
  readonly league: readonly string[];
  /** The league arm's fixed opponent, when it had one. */
  readonly anchor: string | null;
  readonly iterations: number | null;
  readonly bouts: number | null;
  readonly workers: number | null;
  /** The checkpoint the run started from, when it did not start cold. */
  readonly from: string | null;
  /** The iteration a resumed run picked up at, when this header is a resumption's. */
  readonly resumedAt: number | null;
  /** Session 04's `--label`, echoed so a sweep's arms can be told apart in a legend. */
  readonly label: string | null;
  readonly pool: Pool;
}

/** One iteration of a fit. Fields the run's own kind does not write are null or empty. */
export interface Iteration {
  readonly iteration: number;
  readonly ret: number | null;
  readonly retSem: number | null;
  readonly decided: number | null;
  readonly margin: number | null;
  readonly kl: number | null;
  readonly clipFraction: number | null;
  readonly entropy: number | null;
  readonly explained: number | null;
  readonly logSigma: readonly number[];
  readonly seconds: number | null;
  readonly collectSeconds: number | null;
  readonly penaltyShare: number | null;
  /** Session 06's two charges, read under `src/engagement.ts`'s own names. */
  readonly nearRangeStallSeconds: number | null;
  readonly retreatOutsideReachSeconds: number | null;
  /** A league row's margin against each side it played, keyed by that side's name. */
  readonly byOpponent: Readonly<Record<string, number>>;
  /** How the iteration's bouts were divided between them. */
  readonly shares: Readonly<Record<string, number>>;
  /** The snapshot iterations in the league's pool after this turn. */
  readonly pool: readonly number[];
  /** The iteration a snapshot was written at on this turn, or null. */
  readonly snapshot: number | null;
}

/** One opponent's share of a rating: the paired bar margin, its standard error, and Cohen's d. */
export interface Difference {
  readonly bar: number | null;
  readonly barSem: number | null;
  readonly d: number | null;
  readonly points: number | null;
  readonly pointsSem: number | null;
}

/** A rating the run stopped to take, or a row of a curve script's output. */
export interface Rating {
  /** The snapshot rated: an iteration, or `main` for the live weights. */
  readonly at: string;
  /** Where the row sits on an iteration axis. `main` is placed past the last snapshot. */
  readonly iteration: number;
  /** Bouts a contender the rating was bought at, when the row says. */
  readonly per: number | null;
  readonly differences: Readonly<Record<string, Difference>>;
  /** A probe row's decisiveness columns, empty on a rating that is not one. */
  readonly probe: Readonly<Record<string, number>>;
  /** The fraction of the rating's own bouts that ended in a kill, when it can be worked out. */
  readonly decided: number | null;
  readonly pool: Pool;
}

/** Which harness wrote the file. */
export type RunKind = "train" | "league" | "curve";

/** A run, read. */
export interface Run {
  readonly kind: RunKind;
  /** The path the page loaded it under, and what a legend calls it. */
  readonly name: string;
  readonly header: Header | null;
  readonly pool: Pool;
  readonly iterations: readonly Iteration[];
  readonly ratings: readonly Rating[];
  /** Half-written lines skipped at the end, which is how a live run reads. */
  readonly skipped: number;
  /** Headers after the first: a run that died and was resumed writes one per resumption. */
  readonly resumes: readonly Header[];
}

/**
 * How far into a file a run has been read, which is the only thing about a run that moves while
 * the harness is still writing it. Session 11 of the learn set.
 *
 * The page re-fetches on a timer now, so every ten seconds it holds two readings of the same file
 * and has to decide whether to draw the second one. Redrawing unconditionally is the version that
 * looks right and is not: `drawLines` builds fresh SVG, so a redraw takes the cursor readout out
 * from under whatever the person was reading, and doing that six times a minute for twelve hours
 * makes a page nobody can inspect while the thing it is about is happening. So the decision is
 * made here, on counts, and `reachMoved` is what the timer asks.
 *
 * `skipped` rides with the three counts rather than being derived from them. A league appends and
 * its half-written last line becomes a whole row, which shows up in `iterations`; a curve is
 * rewritten whole by `scripts/rate-snapshots.mjs` every time it is re-taken, and a rewrite caught
 * mid-flight is a file that got *shorter*. Both are movement and both are worth drawing -- which
 * is why the test below the interface is inequality and not growth.
 */
export interface Reach {
  readonly iterations: number;
  readonly ratings: number;
  readonly resumes: number;
  readonly skipped: number;
}

/** What a run has in it, counted. */
export function reachOf(run: Run): Reach {
  return {
    iterations: run.iterations.length, ratings: run.ratings.length,
    resumes: run.resumes.length, skipped: run.skipped,
  };
}

/**
 * Whether a re-read is worth a redraw, which is whether anything in it is a different count.
 *
 * Not "is it longer". A run that shrank is a file being rewritten under the page, and a page that
 * refused to draw that would sit on a stale curve until the next append -- which for a curve file,
 * the one kind nothing ever appends to, is forever. Nothing read for the first time is unmoved, so
 * a `null` before is movement.
 */
export function reachMoved(before: Reach | null, after: Reach): boolean {
  if (before === null) return true;
  return before.iterations !== after.iterations || before.ratings !== after.ratings
    || before.resumes !== after.resumes || before.skipped !== after.skipped;
}

// ------------------------------------------------------------------------------------- the lexer

interface Lines {
  readonly rows: readonly Row[];
  readonly skipped: number;
}

/**
 * Every whole row of a JSONL file, with a half-written last line skipped.
 *
 * The asymmetry is the point and it is `readLog`'s in `scripts/league.mjs`: the last line of a
 * file being appended to may be a fragment and that is expected, while a fragment anywhere else
 * means the file was truncated or interleaved and a chart drawn from the good nine tenths of it
 * is a chart nobody can tell from a correct one.
 */
export function readRows(text: string, name: string): Lines {
  const lines = text.split("\n").map((line) => line.trim()).filter((line) => line !== "");
  const rows: Row[] = [];
  let skipped = 0;
  lines.forEach((line, index) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      if (index !== lines.length - 1) {
        throw new Error(`${name}: row ${index + 1} of ${lines.length} is not JSON, and only a `
          + "file's last row may be half-written");
      }
      skipped += 1;
      return;
    }
    if (!isRow(parsed)) {
      throw new Error(`${name}: row ${index + 1} is ${Array.isArray(parsed) ? "an array" : typeof parsed}`
        + ", and every row the harness writes is an object");
    }
    rows.push(parsed);
  });
  return { rows, skipped };
}

/** Refuse a row whose version this file was not written against, by name and by number. */
function checkVersion(row: Row, name: string, what: string): void {
  const version = numberAt(row, "version");
  if (version !== null && version !== LOG_VERSION) {
    throw new Error(`${name}: the ${what} says version ${version}, and this page reads version `
      + `${LOG_VERSION}`);
  }
}

// ------------------------------------------------------------------------------------ the readers

function readHeader(row: Row, name: string): Header {
  checkVersion(row, name, "header");
  const pool = makePool({
    terminals: textsAt(row, "terminals"),
    seed: numberAt(row, "seed"),
    random: numberAt(row, "random"),
  });
  return {
    version: numberAt(row, "version") ?? LOG_VERSION,
    seed: numberAt(row, "seed"),
    date: textAt(row, "date"),
    policy: numberAt(row, "policy"),
    features: numberAt(row, "features"),
    reward: numberMapAt(row, "reward"),
    league: textsAt(row, "league"),
    anchor: textAt(row, "anchor"),
    iterations: numberAt(row, "iterations"),
    bouts: numberAt(row, "bouts"),
    workers: numberAt(row, "workers"),
    from: textAt(row, "from"),
    resumedAt: numberAt(row, "resumedAt"),
    label: textAt(row, "label"),
    pool,
  };
}

function readIteration(row: Row, name: string): Iteration {
  checkVersion(row, name, "iteration row");
  const iteration = numberAt(row, "iteration");
  if (iteration === null) throw new Error(`${name}: an iteration row with no iteration number`);
  return {
    iteration,
    ret: numberAt(row, "ret"),
    retSem: numberAt(row, "retSem"),
    decided: numberAt(row, "decided"),
    margin: numberAt(row, "margin"),
    kl: numberAt(row, "kl"),
    clipFraction: numberAt(row, "clipFraction"),
    entropy: numberAt(row, "entropy"),
    explained: numberAt(row, "explained"),
    logSigma: numbersAt(row, "logSigma"),
    seconds: numberAt(row, "seconds"),
    collectSeconds: numberAt(row, "collectSeconds"),
    penaltyShare: numberAt(row, "penaltyShare"),
    nearRangeStallSeconds: numberAt(row, "nearRangeStallSeconds"),
    retreatOutsideReachSeconds: numberAt(row, "retreatOutsideReachSeconds"),
    byOpponent: numberMapAt(row, "byOpponent"),
    shares: numberMapAt(row, "shares"),
    pool: numbersAt(row, "pool"),
    snapshot: numberAt(row, "snapshot"),
  };
}

function readDifferences(row: Row): Record<string, Difference> {
  const out: Record<string, Difference> = {};
  const differences = rowAt(row, "differences");
  for (const [opponent, value] of Object.entries(differences)) {
    if (!isRow(value)) continue;
    out[opponent] = {
      bar: numberAt(value, "bar"),
      barSem: numberAt(value, "barSem"),
      d: numberAt(value, "d"),
      points: numberAt(value, "points"),
      pointsSem: numberAt(value, "pointsSem"),
    };
  }
  return out;
}

/** The fraction of a structural entry's bouts that ended in a kill rather than on the clock. */
function decidedFrom(fit: Row): number | null {
  const wins = numberAt(fit, "wins");
  const draws = numberAt(fit, "draws");
  const losses = numberAt(fit, "losses");
  if (wins === null || draws === null || losses === null) return null;
  const played = wins + draws + losses;
  return played === 0 ? null : (wins + losses) / played;
}

function readRating(row: Row, name: string, pool: Pool): Rating {
  checkVersion(row, name, "rating row");
  const iteration = numberAt(row, "iteration");
  if (iteration === null) throw new Error(`${name}: a rating row with no iteration number`);
  return {
    at: String(iteration),
    iteration,
    per: numberAt(row, "per"),
    differences: readDifferences(row),
    probe: {},
    decided: decidedFrom(rowAt(row, "structural")),
    pool,
  };
}

/**
 * A `train-ppo` log, and a league log, which differ by which columns their rows carry.
 *
 * Both are read through one function because a caller that has to know which of the two it is
 * holding before it can ask for `decided` is a caller that will get it wrong for the third kind.
 * `Run.kind` says which it was, and every column absent from that kind reads null.
 */
function readRunLog(text: string, name: string, kind: RunKind): Run {
  const { rows, skipped } = readRows(text, name);
  const headers: Header[] = [];
  const iterations: Iteration[] = [];
  const ratings: Rating[] = [];
  for (const row of rows) {
    const type = textAt(row, "type");
    if (type === "header") headers.push(readHeader(row, name));
    else if (type === "iteration") iterations.push(readIteration(row, name));
    else if (type === "rating") ratings.push(readRating(row, name, headers.at(0)?.pool ?? makePool({})));
  }
  const header = headers.at(0) ?? null;
  const resumes = headers.slice(1);
  // A run that died and was resumed writes a second header. Its pool must be the first one's:
  // a resumption onto different classes or a different seed is two runs in one file, and every
  // point after the join would be drawn on the earlier run's axis and its legend.
  for (const later of resumes) {
    if (later.pool.label !== header?.pool.label) {
      throw new Error(`${name}: resumed onto a different pool -- ${header?.pool.label ?? "none"} `
        + `and then ${later.pool.label}`);
    }
  }
  return {
    kind,
    name,
    header,
    pool: header?.pool ?? makePool({}),
    iterations,
    ratings,
    skipped,
    resumes,
  };
}

/** A `scripts/train-ppo.mjs` log. */
export function readTrainLog(text: string, name = "train-ppo log"): Run {
  return readRunLog(text, name, "train");
}

/** A `scripts/league.mjs` log. */
export function readLeagueLog(text: string, name = "league log"): Run {
  return readRunLog(text, name, "league");
}

/**
 * Which of the three readers a file wants, decided by what is in it.
 *
 * Deliberately not decided by the file's name. `league.jsonl` is the league's own spelling and
 * nothing else in `tournaments/` follows a convention: the trainer's logs are whatever `--log`
 * said, a rate curve is whatever `--out` said, and the record's own arms are ppo-run1.jsonl,
 * sweep-k.jsonl and v2-pool.jsonl. A page that guessed from a name would be wrong on a run
 * somebody named after the question it was asking, which is every interesting run.
 *
 * The tells are structural and cheap: only the two trainers write a `type` field at all, and only
 * a league writes `byOpponent` or names an `anchor`. A file with no `type` anywhere is a curve.
 */
export function readRun(text: string, name: string): Run {
  const { rows } = readRows(text, name);
  const typed = rows.some((row) => textAt(row, "type") !== null);
  if (!typed) return readCurve(text, name);
  const league = rows.some((row) =>
    Object.keys(numberMapAt(row, "byOpponent")).length > 0
    || (textAt(row, "type") === "header" && textAt(row, "anchor") !== null));
  return league ? readLeagueLog(text, name) : readTrainLog(text, name);
}

/** A probe row's pool: the classes it rolled up, summed, because the row does not say. */
function probePool(row: Row): Pool {
  const mirror = boolAt(rowAt(row, "pool"), "mirror") ?? boolAt(row, "mirror");
  const byTerminal = row["byTerminal"];
  if (!Array.isArray(byTerminal)) return makePool({ mirror });
  let builds = 0;
  for (const group of byTerminal) {
    if (!isRow(group)) continue;
    builds += numberAt(group, "builds") ?? 0;
  }
  return makePool({ builds: builds === 0 ? null : builds, mirror });
}

const PROBE_COLUMNS = ["killRate", "maul", "mace", "p", "always", "ever"] as const;

/**
 * The baselines a rate-snapshots curve file can carry, named here rather than written twice.
 *
 * A row that lacks one is skipped, so widening this list reads older files exactly as it read them
 * before: every curve drawn from a run that predates a baseline simply has no series for it. That
 * is why `fencer` could be appended rather than versioned.
 *
 * It is appended because Session 02 of the signal set made `golem-fencer` a paired contender on
 * every rating path, and for one commit the block was written to disk and read by nothing --
 * `rateSnapshots` put it in the file and this list did not name it, so the page could not offer
 * the series. A criterion the record states its bars on has to be drawable, or the next set reads
 * its curves off the two opponents that happened to be here first.
 */
const CURVE_BASELINES = ["uniform", "driver", "fencer"] as const;

/**
 * A curve written by `scripts/rate-snapshots.mjs` or `scripts/probe-snapshots.mjs`.
 *
 * One reader for both because a curve file is one row a snapshot either way and the two are told
 * apart by which columns a row carries, not by anything in its name -- and a caller who had to
 * know which script produced a file before opening it would have to be told by a person.
 *
 * The `main` row is the reason `Rating.at` is a string. Both scripts append the live weights under
 * that name after whatever snapshots were asked for, and it is the only rating of where an arm
 * actually got to whenever the arm did not stop on a snapshot. It is placed one snapshot-gap past
 * the last numbered row so that a line through it says "after" rather than "at 0".
 */
export function readCurve(text: string, name = "curve"): Run {
  const { rows, skipped } = readRows(text, name);
  const numbered: number[] = [];
  for (const row of rows) {
    const iteration = row["iteration"];
    if (typeof iteration === "number") numbered.push(iteration);
  }
  const last = numbered.length === 0 ? 0 : numbered[numbered.length - 1]!;
  const step = numbered.length < 2 ? 1 : last - numbered[numbered.length - 2]!;
  const ratings: Rating[] = [];
  let pool = makePool({});
  for (const row of rows) {
    checkVersion(row, name, "curve row");
    const iteration = row["iteration"];
    if (typeof iteration !== "number" && iteration !== "main") {
      throw new Error(`${name}: a curve row whose iteration is neither a number nor "main"`);
    }
    const stated = rowAt(row, "pool");
    // `mirror` inside the pool block since Session 10 of the learn set, and beside it since
    // Session 06; a row from either is read, and a row from before both leaves it null rather than
    // guessing the arrangement it was probably taken under.
    const rowPool = "pool" in row
      ? makePool({
        builds: numberAt(stated, "builds"), terminals: textsAt(stated, "terminals"),
        mirror: boolAt(stated, "mirror") ?? boolAt(row, "mirror"),
      })
      : probePool(row);
    pool = rowPool;
    const differences: Record<string, Difference> = {};
    for (const opponent of CURVE_BASELINES) {
      if (!isRow(row[opponent])) continue;
      const value = rowAt(row, opponent);
      differences[opponent] = {
        bar: numberAt(value, "bar"),
        // The rate curve prints its standard error as `sem` where a log's rating row prints
        // `barSem`. Both are the same quantity and the band is the same 1.96 of it.
        barSem: numberAt(value, "sem") ?? numberAt(value, "barSem"),
        d: numberAt(value, "d"),
        points: null,
        pointsSem: null,
      };
    }
    const probe: Record<string, number> = {};
    for (const column of PROBE_COLUMNS) {
      const value = numberAt(row, column);
      if (value !== null) probe[column] = value;
    }
    ratings.push({
      at: String(iteration),
      iteration: typeof iteration === "number" ? iteration : last + step,
      per: numberAt(row, "per"),
      differences,
      probe,
      decided: decidedFrom(rowAt(row, "fit")),
      pool: rowPool,
    });
  }
  // Two rows of one curve file on two pools would be a file written by two runs, which no script
  // here does; refusing it costs nothing and reading it would put two instruments on one line.
  for (const rating of ratings) {
    if (rating.pool.label !== pool.label) {
      throw new Error(`${name}: two pools in one curve -- ${rating.pool.label} and ${pool.label}`);
    }
  }
  return { kind: "curve", name, header: null, pool, iterations: [], ratings, skipped, resumes: [] };
}

// -------------------------------------------------------------------------------------- a sweep

/** Session 04's manifest, as much of it as a chart needs. */
export interface Sweep {
  readonly name: string;
  readonly script: string;
  readonly pool: Pool;
  readonly arms: readonly Run[];
  /** Arms the manifest names that have not written a log yet. */
  readonly missing: readonly string[];
}

const SWEEP_SCRIPTS = ["train-ppo", "league"];

/**
 * A whole sweep: the manifest Session 04 copies beside its arms, and each arm's log.
 *
 * The manifest is the only place a sweep's pool is stated once for every arm, which is what makes
 * a sweep the one case where overlaying several runs is known-safe before any of them is read --
 * and the check below is what keeps that a fact rather than an assumption, because an arm resumed
 * by hand with different flags would otherwise be drawn on its siblings' axis.
 *
 * An arm with no log is not an error. A sweep is opened while it is running, and an arm that has
 * not written its first row yet is named in `missing` so the page can say so instead of silently
 * showing three lines where the manifest asked for four.
 */
export function readSweep(manifestText: string, logsByArm: Readonly<Record<string, string>>): Sweep {
  let parsed: unknown;
  try {
    parsed = JSON.parse(manifestText);
  } catch {
    throw new Error("sweep manifest: not JSON");
  }
  if (!isRow(parsed)) throw new Error("sweep manifest: not an object");
  checkVersion(parsed, "sweep manifest", "manifest");
  const script = textAt(parsed, "script");
  if (script === null || !SWEEP_SCRIPTS.includes(script)) {
    throw new Error(`sweep manifest: names the script ${script === null ? "nothing" : script}, and `
      + `this page reads ${SWEEP_SCRIPTS.join(" and ")}`);
  }
  const stated = rowAt(parsed, "pool");
  const pool = makePool({
    terminals: textsAt(stated, "terminals"),
    random: numberAt(stated, "random"),
    seed: numberAt(parsed, "seed"),
  });
  const name = textAt(parsed, "name") ?? "sweep";
  const armRows = Array.isArray(parsed["arms"]) ? parsed["arms"] : [];
  const arms: Run[] = [];
  const missing: string[] = [];
  for (const entry of armRows) {
    if (!isRow(entry)) continue;
    const armName = textAt(entry, "name");
    if (armName === null) throw new Error(`${name}: an arm with no name`);
    const text = logsByArm[armName];
    if (text === undefined) {
      missing.push(armName);
      continue;
    }
    const run = script === "league"
      ? readLeagueLog(text, `${name}/${armName}`)
      : readTrainLog(text, `${name}/${armName}`);
    if (run.header !== null && run.header.pool.label !== pool.label) {
      throw new Error(`${name}: the arm ${armName} ran on ${run.header.pool.label} where the `
        + `manifest says ${pool.label}`);
    }
    arms.push(run);
  }
  return { name, script, pool, arms, missing };
}

// -------------------------------------------------------------------------------------- series

/** One line on a chart, with everything a legend and a hover need and no elements. */
export interface Series {
  /** Run, column and opponent in one string, which is what the legend prints. */
  readonly label: string;
  readonly run: string;
  readonly column: string;
  /** The side the column is about, or the empty string when it is about none. */
  readonly opponent: string;
  readonly pool: Pool;
  readonly x: readonly number[];
  readonly y: readonly number[];
  /** The 95 % band, where the row printed a standard error. Empty otherwise. */
  readonly lo: readonly number[];
  readonly hi: readonly number[];
  /** Each point's own row name, so `main` reads as `main` rather than as a number. */
  readonly at: readonly string[];
  /** Where to watch that point, or null. Session 03 makes the arena answer these. */
  readonly link: readonly (string | null)[];
}

/** Columns read off an iteration row, spelled as the file spells them. */
const ITERATION_COLUMNS = [
  "ret", "decided", "margin", "kl", "clipFraction", "entropy", "explained", "penaltyShare",
  "seconds", "collectSeconds", ...ENGAGEMENT_COLUMNS,
];

/**
 * Every column this run can be asked for.
 *
 * Built from the run rather than from a list, because which columns exist is a fact about the
 * file: a league log has no `collectSeconds`, a `train-ppo` log has no `versus:`, and a page that
 * offered all of them would offer flat empty lines for half of what it listed.
 */
export function columnsOf(run: Run): string[] {
  const columns: string[] = [];
  const first = run.iterations.at(0);
  if (first !== undefined) {
    for (const column of ITERATION_COLUMNS) {
      if (iterationValue(first, column) !== null) columns.push(column);
    }
    for (let axis = 0; axis < first.logSigma.length; axis += 1) columns.push(`sigma:${axis}`);
    for (const opponent of Object.keys(first.byOpponent)) columns.push(`versus:${opponent}`);
    for (const opponent of Object.keys(first.shares)) columns.push(`share:${opponent}`);
  }
  const rating = run.ratings.at(0);
  if (rating !== undefined) {
    for (const opponent of Object.keys(rating.differences)) {
      columns.push(`bar:${opponent}`, `d:${opponent}`);
    }
    for (const column of Object.keys(rating.probe)) columns.push(`probe:${column}`);
    if (rating.decided !== null && !columns.includes("decided")) columns.push("decided");
  }
  return columns;
}

function iterationValue(iteration: Iteration, column: string): number | null {
  switch (column) {
    case "ret": return iteration.ret;
    case "decided": return iteration.decided;
    case "margin": return iteration.margin;
    case "kl": return iteration.kl;
    case "clipFraction": return iteration.clipFraction;
    case "entropy": return iteration.entropy;
    case "explained": return iteration.explained;
    case "penaltyShare": return iteration.penaltyShare;
    case "seconds": return iteration.seconds;
    case "collectSeconds": return iteration.collectSeconds;
    case "nearRangeStallSeconds": return iteration.nearRangeStallSeconds;
    case "retreatOutsideReachSeconds": return iteration.retreatOutsideReachSeconds;
    default: return null;
  }
}

/**
 * The standard error printed beside an iteration column, where one is.
 *
 * Exactly one of them has a partner today -- the return, whose `retSem` the trainer writes and the
 * league does not. It is a function rather than a table because a table of one entry that has to
 * be read through a second lookup is two ways of saying one thing, and because the next column
 * with an error will want to say which one under its own name.
 */
function iterationSem(iteration: Iteration, column: string): number | null {
  return column === "ret" ? iteration.retSem : null;
}

/** The directory a run's file sits in, which is where its snapshots sit too. */
const directoryOf = (name: string): string => {
  const cut = name.lastIndexOf("/");
  return cut < 0 ? "" : name.slice(0, cut);
};

/**
 * Where to watch a mind, as a query the arena will answer once Session 03 lands.
 *
 * A league arm writes one file a snapshot -- pool-<iteration>.json beside its log -- so a point
 * whose row recorded a snapshot gets a link and the rest get none. **The row is what says so, not
 * the iteration number**: a league at `--pool-every 8` snapshots on eight iterations in ninety and
 * a link built by arithmetic would offer eighty-two doors onto files that were never written.
 *
 * A `train-ppo` run writes **one** checkpoint and overwrites it every iteration, so there is
 * exactly one thing to watch on that curve and it is the newest row.
 *
 * A curve file gets none, which is a limitation rather than an oversight. Neither
 * `scripts/rate-snapshots.mjs` nor `scripts/probe-snapshots.mjs` records the directory it rated,
 * and a link assembled from the curve file's own path is a guess that happens to be right whenever
 * the curve was written beside its arm. A link that is wrong is worse than a link that is absent,
 * and the league's own log carries the same snapshots with the directory attached.
 */
export function snapshotLink(run: Run, at: string): string | null {
  if (run.kind === "train") {
    const last = run.iterations.at(-1);
    if (last === undefined || at !== String(last.iteration)) return null;
    const file = run.name.replace(/\.jsonl$/, "") + "-checkpoint.json";
    return `index.html?snapshot=${encodeURI(file)}`;
  }
  if (run.kind !== "league") return null;
  const directory = directoryOf(run.name);
  if (directory === "") return null;
  const taken = run.iterations.some((entry) => entry.snapshot !== null && String(entry.snapshot) === at);
  if (!taken) return null;
  return `index.html?snapshot=${encodeURI(`${directory}/pool-${at}.json`)}`;
}

const BAND = 1.96;

/**
 * One column of one run, as a line with its pool bolted to it.
 *
 * The band is 1.96 standard errors because that is the interval every script in this tree prints
 * beside its own margins, and a chart whose band and a log's `+-` mean different things is a
 * chart that will be read against that log.
 */
export function series(run: Run, column: string): Series {
  const x: number[] = [];
  const y: number[] = [];
  const lo: number[] = [];
  const hi: number[] = [];
  const at: string[] = [];
  const link: (string | null)[] = [];
  const colon = column.indexOf(":");
  const family = colon < 0 ? "" : column.slice(0, colon);
  const rest = colon < 0 ? "" : column.slice(colon + 1);
  const push = (
    step: number, name: string, value: number | null, sem: number | null,
  ): void => {
    if (value === null) return;
    x.push(step);
    y.push(value);
    at.push(name);
    link.push(snapshotLink(run, name));
    if (sem !== null) {
      lo.push(value - BAND * sem);
      hi.push(value + BAND * sem);
    }
  };

  if (family === "bar" || family === "d") {
    for (const rating of run.ratings) {
      const difference = rating.differences[rest];
      if (difference === undefined) continue;
      const value = family === "bar" ? difference.bar : difference.d;
      push(rating.iteration, rating.at, value, family === "bar" ? difference.barSem : null);
    }
  } else if (family === "probe") {
    for (const rating of run.ratings) {
      push(rating.iteration, rating.at, rating.probe[rest] ?? null, null);
    }
  } else if (family === "versus") {
    for (const iteration of run.iterations) {
      push(iteration.iteration, String(iteration.iteration), iteration.byOpponent[rest] ?? null, null);
    }
  } else if (family === "share") {
    for (const iteration of run.iterations) {
      push(iteration.iteration, String(iteration.iteration), iteration.shares[rest] ?? null, null);
    }
  } else if (family === "sigma") {
    const axis = Number(rest);
    for (const iteration of run.iterations) {
      push(iteration.iteration, String(iteration.iteration), iteration.logSigma[axis] ?? null, null);
    }
  } else if (colon >= 0) {
    throw new Error(`${run.name}: no column family ${family}`);
  } else if (run.iterations.length > 0 && ITERATION_COLUMNS.includes(column)) {
    for (const iteration of run.iterations) {
      push(
        iteration.iteration, String(iteration.iteration),
        iterationValue(iteration, column), iterationSem(iteration, column),
      );
    }
  } else if (column === "decided") {
    for (const rating of run.ratings) push(rating.iteration, rating.at, rating.decided, null);
  } else {
    throw new Error(`${run.name}: no column ${column}`);
  }

  // A column no row of this run answered is refused rather than returned empty. The families
  // above are keyed by an opponent's name, and `versus:golem-fencer` asked of a run that never
  // played the fencer would otherwise come back as a legend entry with an invisible line under
  // it -- which reads as "it did nothing" and means "you asked the wrong question".
  if (y.length === 0) {
    throw new Error(`${run.name}: no column ${column} -- no row of this run carries one`);
  }

  // A band is drawn point by point, so a partial one -- some rows carrying a standard error and
  // some not -- would be drawn against the wrong points. Either every point has one or none does.
  const banded = lo.length === y.length;
  const opponent = family === "bar" || family === "d" || family === "versus" || family === "share"
    ? rest
    : "";
  return {
    label: `${run.name} ${column}`,
    run: run.name,
    column,
    opponent,
    pool: run.pool,
    x,
    y,
    lo: banded ? lo : [],
    hi: banded ? hi : [],
    at,
    link,
  };
}

/**
 * The one pool every one of these series was measured on, or a refusal naming the ones that differ.
 *
 * This is the page's load-bearing correctness rule and it is a function rather than a warning
 * because a warning is a thing a reader scrolls past. Two ratings on two pools are two
 * instruments; drawing them on one axis produces a chart that is wrong in exactly the way nobody
 * checks, because it looks like the chart they expected.
 */
export function onePool(list: readonly Series[]): Pool {
  const first = list.at(0);
  if (first === undefined) throw new Error("no series to draw");
  const differing = list.filter((entry) => entry.pool.label !== first.pool.label);
  if (differing.length > 0) {
    const named = differing
      .map((entry) => `${entry.run} on ${entry.pool.label}`)
      .join("; ");
    throw new Error(`two pools on one axis: ${first.run} on ${first.pool.label}; ${named}. A `
      + "rating is only comparable to another rating on the same pool.");
  }
  return first.pool;
}
