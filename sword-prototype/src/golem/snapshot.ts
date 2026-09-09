import {
  checkPolicyWeights, freshPolicyTable, type Normalisation, type PolicyWeights,
} from "./policy.ts";

/**
 * A checkpoint off a run, playing in the arena: `golem-snapshot`. Session 03 of the learn set.
 *
 * ## The hole this fills
 *
 * Nothing in `src/` has ever loaded a fitted table at run time. `golemPolicyMind` hard-wires
 * `POLICY_WEIGHTS`, which is one table -- the one that shipped -- so the only mind a person could
 * watch was the mind a session had already decided to keep. Every intermediate the fit passed
 * through lives in `tournaments/` as JSON and has been readable only by a script that prints
 * numbers. The owner's brief asked for the opposite: "a way to watch the AI policy in the UI, or at
 * least snapshots of it", and watching iteration 8 beside iteration 93 on one matchup is a question
 * about behaviour that no rating column answers.
 *
 * ## One slot, and why the shape of `Policy` forces it
 *
 * `Policy.create(seed)` in `src/mind.ts` is **synchronous**, and the setup screen renders its picker
 * from `driverOptions` before any bout exists. A table is a two-megabyte fetch. So the table cannot
 * be an argument to the factory and cannot be awaited inside it: it is fetched first, installed
 * here with `installSnapshot`, and the factory reads `installedSnapshot()`. The alternative -- an
 * async policy factory -- would have made every one of the nineteen other policies async in order
 * to serve one, and would have moved the picker's build behind a promise for a screen that has to
 * be up before anything is loaded at all.
 *
 * The slot holds one snapshot. Watching two of them against each other wants a second slot and is
 * a one-line generalisation of this file once somebody wants it; what a *single* slot buys is that
 * the mind's name, the picker's label and the readout's provenance are one fact rather than three
 * that can disagree.
 *
 * ## Every table goes through `checkPolicyWeights`
 *
 * A snapshot is `weights`, `logSigma` and a normalisation, and nothing else this build needs. It
 * is assembled by `freshPolicyTable` and handed straight to `checkPolicyWeights`, which is the
 * same six refusals the shipped table is loaded under: version, feature version, layout, weight
 * count, spread count and normalisation width. A checkpoint written by a run that moved the
 * surface therefore does not load, and the refusal names which check failed rather than the file.
 *
 * **The three formats carry different amounts of provenance, and this file does not invent any.**
 * `saveLeague` in `scripts/league.mjs` writes `policy` and `features` beside the weights, so
 * a league state is refused by version outright. A per-iteration checkpoint from
 * `scripts/train-ppo.mjs` carries neither -- it is `{iteration, seed, date, bouts, steps,
 * weights, valueWeights, logSigma, normalisation}` and no more -- so a checkpoint is read under
 * *this* build's versions and it is the four shape checks that catch a moved surface. That is
 * honest rather than ideal: the layout, the weight count, the spread count and the column count
 * are all functions of the surface, and a change that moved none of them would have to be a
 * rescaling of a column, which is exactly what `PILOT_FEATURES_VERSION` is bumped for and exactly
 * what a version-less file cannot be checked against. A pool member is the same story with
 * `bornAt` for an iteration and its own `norm` spelling.
 *
 * ## Greedy and drawn are two fighters
 *
 * `scripts/idle-probe.mjs` measured it and `policy.ts`'s module note carries the numbers: the
 * same weights *drawn* finish three and a half times as many bouts against a motionless dummy as
 * the head's mean does, and lose bar against an opponent that punishes a bad command. They are not
 * the same mind and a readout that did not say which was playing would be a readout of an unnamed
 * thing, so `sample` rides in the slot beside the table and the command readout names it.
 */
export interface SnapshotSource {
  /** Which of the three file shapes this came out of. */
  readonly kind: "checkpoint" | "pool" | "league";
  /** Where it came from, as the person named it: a `/runs/` path, or a dropped file's name. */
  readonly path: string;
  /** Which iteration of its run wrote it. Zero for a file that does not say. */
  readonly iteration: number;
  /**
   * What the run thought it was worth, on whatever pool that run rated on.
   *
   * Zero for a file that carries no rating, which is most of them: a per-iteration checkpoint is
   * written before anything has rated it and a pool member carries only the bar margins its
   * exploiters earned against it. It is here because a picker row that says "it 40" and nothing
   * else is a row you cannot choose between two of, and because a score from one pool is not
   * comparable with a score from another -- which is why the readout prints it beside the path
   * that produced it rather than on its own.
   */
  readonly score: number;
}

export interface InstalledSnapshot {
  readonly table: PolicyWeights;
  /** True plays the draw, false plays the head's mean. See the module note. */
  readonly sample: boolean;
  readonly source: SnapshotSource;
}

// --------------------------------------------------------------------------------- reading a file

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * A field that has to be an array of finite numbers, refused by name and by what was there.
 *
 * Refused rather than coerced, for the reason `matchupFromQuery` in `src/bout.ts` gives about a
 * link: a half-decoded table would be a mind fighting under numbers nobody wrote, and it would run
 * perfectly happily. `Number.isFinite` is checked per entry because JSON carries `null` for a
 * `NaN` that a writer let through, and a null in a weight vector propagates through the whole head
 * on the first forward pass and comes out as a command of nothing.
 */
function numbers(value: unknown, what: string): number[] {
  if (!Array.isArray(value)) {
    throw new Error(`snapshot ${what} is ${value === undefined ? "missing" : "not an array"}`);
  }
  for (let i = 0; i < value.length; i += 1) {
    if (typeof value[i] !== "number" || !Number.isFinite(value[i])) {
      throw new Error(`snapshot ${what} holds ${JSON.stringify(value[i])} at ${i}, which is not a finite number`);
    }
  }
  return value as number[];
}

/** The running statistics, under whichever of its two spellings the writer used. */
function normalisation(value: unknown, what: string): Normalisation {
  if (!isRecord(value)) throw new Error(`snapshot ${what} is ${value === undefined ? "missing" : "not an object"}`);
  const count = typeof value.count === "number" && Number.isFinite(value.count) ? value.count : 0;
  return {
    count,
    mean: numbers(value.mean, `${what}.mean`),
    variance: numbers(value.variance, `${what}.variance`),
  };
}

const integer = (value: unknown, fallback = 0): number =>
  (typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : fallback);
const finite = (value: unknown, fallback = 0): number =>
  (typeof value === "number" && Number.isFinite(value) ? value : fallback);
const text = (value: unknown, fallback = ""): string => (typeof value === "string" ? value : fallback);

/**
 * The header a snapshot may override, and the rest of the table the build supplies.
 *
 * `version` and `features` are *optional* here on purpose. `freshPolicyTable` fills them from this
 * build, which is the right answer for a file that does not name them and the wrong one for a file
 * that does -- so a league state, which names both, overrides them and is refused by
 * `checkPolicyWeights` when they disagree, while a checkpoint leaves them alone and is checked by
 * shape. The module note above says what that costs.
 */
interface SnapshotHeader {
  readonly version?: number;
  readonly features?: number;
  readonly iterations: number;
  readonly seed: number;
  readonly date: string;
  readonly bouts: number;
  readonly steps: number;
  readonly opponent: string | null;
  readonly score: number;
}

function assemble(
  weights: readonly number[], logSigma: readonly number[], norm: Normalisation, header: SnapshotHeader,
): PolicyWeights {
  return checkPolicyWeights({
    ...freshPolicyTable(weights, logSigma),
    ...header,
    normalisation: norm,
  });
}

/**
 * A per-iteration checkpoint, as `scripts/train-ppo.mjs` writes one every iteration.
 *
 * `valueWeights` is deliberately not read. The critic is a training artifact -- `policy.ts` says so
 * where `VALUE_LAYOUT` is declared -- and a mind that loaded it would be carrying a second network
 * it never asks anything.
 */
export function tableFromCheckpoint(json: unknown): PolicyWeights {
  if (!isRecord(json)) throw new Error("a checkpoint is a JSON object; this is not one");
  return assemble(
    numbers(json.weights, "weights"),
    numbers(json.logSigma, "logSigma"),
    normalisation(json.normalisation, "normalisation"),
    {
      iterations: integer(json.iteration),
      seed: integer(json.seed),
      date: text(json.date),
      bouts: integer(json.bouts),
      steps: integer(json.steps),
      // A checkpoint does not say who it sparred with -- the flag lives in the run's log header and
      // not in the file that is written every iteration -- and inventing "itself" here would be a
      // provenance claim this file cannot make. Null already means mirrored self-play, so it is
      // written as the honest absence it is and the readout names the path instead.
      opponent: null,
      score: 0,
    },
  );
}

/**
 * One member of a league's pool, as `roleToJson` in `scripts/league.mjs` writes one.
 *
 * `bornAt` is the iteration the role was copied at and `history` is the bar margin each exploiter
 * earned against it, so the last entry is the freshest thing anybody measured about this member and
 * is what the picker shows as a score.
 *
 * **In the runs on this machine both are empty**: every pool file under `tournaments/` was
 * written with `bornAt` 0 and no history, because `league.mjs` copies the main into the pool
 * without stamping either. So the iteration a person means when they say "pool-40" lives in the
 * file's *name* and not in the file, and this reader will not go and get it from there -- a name is
 * one script's convention and somebody who renames a checkpoint has not changed what is in it. The
 * consequence is visible rather than hidden: `snapshotOptionLabel` names the path when a file
 * cannot say which iteration it is, so two pool members are still two rows a person can tell apart.
 */
export function tableFromPoolMember(json: unknown): PolicyWeights {
  if (!isRecord(json)) throw new Error("a pool member is a JSON object; this is not one");
  const history = Array.isArray(json.history) ? json.history : [];
  return assemble(
    numbers(json.weights, "weights"),
    numbers(json.logSigma, "logSigma"),
    normalisation(json.norm, "norm"),
    {
      iterations: integer(json.bornAt),
      seed: integer(json.seed),
      date: "",
      bouts: 0,
      steps: 0,
      opponent: null,
      score: history.length === 0 ? 0 : finite(history[history.length - 1]),
    },
  );
}

/**
 * A whole league state, of which this takes the `main` role and nothing else.
 *
 * The main is what the run would ship; the exploiters are minds fitted to beat it and are not the
 * league's answer to anything. Reading one of those would be watching the sparring partner, which
 * is a thing somebody may want and is a second slot rather than a second guess made here.
 *
 * This is the one of the three formats that carries its own versions, so it is refused by version
 * as well as by shape -- and that refusal is `checkPolicyWeights`'s rather than a second copy of
 * `loadLeague`'s, so the arena and the trainer refuse the same file for the same reason.
 */
export function tableFromLeague(json: unknown): PolicyWeights {
  if (!isRecord(json)) throw new Error("a league state is a JSON object; this is not one");
  if (!isRecord(json.main)) throw new Error("a league state carries its shipped mind under `main`; this one does not");
  const main = json.main;
  return assemble(
    numbers(main.weights, "main.weights"),
    numbers(main.logSigma, "main.logSigma"),
    normalisation(main.norm, "main.norm"),
    {
      version: integer(json.policy, -1),
      features: integer(json.features, -1),
      iterations: integer(json.iteration),
      seed: integer(json.seed),
      date: text(json.date),
      bouts: integer(json.bouts),
      steps: integer(json.steps),
      opponent: null,
      score: 0,
    },
  );
}

/**
 * Which of the three a parsed file is, decided by what it carries and not by its name.
 *
 * A URL says nothing about a format and neither does a dropped file: `pool-40.json` is a
 * convention of one script, and somebody who renames a checkpoint has not changed what is in it.
 * The three shapes are genuinely distinguishable -- a league has `main`, a pool member spells its
 * statistics `norm` and a checkpoint spells them `normalisation` -- so this reads the shape and
 * refuses anything that is none of them by saying what all three look like.
 */
export function snapshotFromJson(json: unknown, path: string): { table: PolicyWeights; source: SnapshotSource } {
  if (!isRecord(json)) throw new Error(`${path} is not a JSON object`);
  if (isRecord(json.main)) {
    const table = tableFromLeague(json);
    return { table, source: { kind: "league", path, iteration: table.iterations, score: table.score } };
  }
  if (isRecord(json.norm)) {
    const table = tableFromPoolMember(json);
    return { table, source: { kind: "pool", path, iteration: table.iterations, score: table.score } };
  }
  if (isRecord(json.normalisation)) {
    const table = tableFromCheckpoint(json);
    return { table, source: { kind: "checkpoint", path, iteration: table.iterations, score: table.score } };
  }
  throw new Error(`${path} is none of the three snapshot shapes: a league state has \`main\`, `
    + "a pool member has `norm`, and a checkpoint has `normalisation`");
}

// ------------------------------------------------------------------------------------- the slot

let installed: InstalledSnapshot | null = null;

/**
 * Put a table in the slot the factory reads, and answer what went in.
 *
 * The table is checked again on the way in even though every path above has already checked it,
 * because this is exported and a caller that assembled a table some other way is exactly the
 * caller a version refusal exists for. It costs six comparisons once.
 */
export function installSnapshot(
  table: PolicyWeights, { sample = false, source }: { sample?: boolean; source: SnapshotSource },
): InstalledSnapshot {
  installed = { table: checkPolicyWeights(table), sample, source };
  return installed;
}

/** What is in the slot, or null. The factory refuses by name on the null. */
export function installedSnapshot(): InstalledSnapshot | null {
  return installed;
}

/**
 * Empty the slot.
 *
 * For a test, and for nothing in the page: there is no button that takes a snapshot back out,
 * because the way to stop watching one is to pick another policy. A test needs it because the slot
 * is module state and a test file that installed one would otherwise change the answer every later
 * test in the same process gets from `driverOptions`.
 */
export function clearSnapshot(): void {
  installed = null;
}

/**
 * What the picker calls the row, which is the label plus whatever the file could say about itself.
 *
 * The plain label when nothing is installed, because the row is offered as incompatible in that
 * state and a row that named an iteration nobody had loaded would be worse than a bare one.
 */
export function snapshotOptionLabel(): string {
  const held = installed;
  if (held === null) return "Golem snapshot";
  return `Golem snapshot -- ${describe(held, held.source.path.split("/").pop() ?? held.source.path)}`;
}

/**
 * Everything the file managed to say about itself, in the order a person reads it.
 *
 * The last path segment first, because that is what somebody typed and is the only thing that
 * separates two pool members of the same league (see `tableFromPoolMember`); the iteration only
 * when the file carries a non-zero one, because "it 0" printed against a member that simply does
 * not stamp itself is a claim rather than an absence; the score only when something rated it.
 */
function describe(held: InstalledSnapshot, name: string): string {
  const parts = [name];
  if (held.source.iteration !== 0) parts.push(`it ${held.source.iteration}`);
  if (held.source.score !== 0) parts.push(`score ${held.source.score.toFixed(3)}`);
  parts.push(held.sample ? "drawn" : "greedy");
  return parts.join(", ");
}

/** One line naming what is playing, for the command readout and the boot note. */
export function snapshotProvenance(): string | null {
  const held = installed;
  if (held === null) return null;
  return `${held.source.kind} ${describe(held, held.source.path)}`;
}
