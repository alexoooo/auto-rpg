/**
 * The model contract, which is the state columns **and the cell key grammar**.
 *
 * **2 since stage C2c widened the key**, and the bump is what makes a stale
 * artifact say so. `cells` is a plain string-keyed map, so a model fitted under
 * the two-field `movement+action` grammar decodes perfectly against the
 * four-field `movement+action+effector+target` one and then matches nothing:
 * `calibratedPlannedTactics` would filter every cell out and `lookaheadMind`
 * would report `no calibrated model for any tactic on [...]`, which reads as an
 * under-spent training budget rather than as an artifact from the wrong
 * grammar. `deployedResearchMind` refuses it by version instead, before a mind
 * is built.
 *
 * Nothing checked in is affected, confirmed rather than assumed: the one
 * committed look-ahead artifact (`asset-src/learning/research/session18-minimum`)
 * is already refused one layer up, at `featureVersion` 3 against runtime 4, and
 * carries the pre-C1 220-cell table.
 */
export const TACTICAL_MODEL_VERSION = 2;
export const TACTICAL_STATE_COLUMNS = Object.freeze([
  "reachMargin", "facingError", "threatAlignment", "contactProbability", "vitalityPotential",
] as const);
export type TacticalStateColumn = typeof TACTICAL_STATE_COLUMNS[number];

export interface TacticalState {
  readonly reachMargin: number;
  readonly facingError: number;
  readonly threatAlignment: number;
  readonly contactProbability: number;
  readonly vitalityPotential: number;
}

export interface TacticalTraceRow {
  readonly tactic: string;
  readonly before: TacticalState;
  readonly after: TacticalState;
  readonly contact: boolean;
  readonly bodyLoadout?: string;
  readonly split?: "train" | "validation" | "test";
  readonly traceIndex?: number;
}

export interface TacticalDelta extends TacticalState {}
/**
 * How wrong this cell's constant delta was, one column at a time and each in its
 * own unit.
 *
 * **Two of these three used to be quantities that could not report an error.**
 * `signedReachError` was the *signed* mean of the residuals about a fitted mean,
 * which is identically zero in-sample by construction -- the fitted delta is
 * that mean, so the residuals sum to zero. Measured across 54 fitted groups on
 * 18,494 real Havok rows the worst magnitude it ever reached was **5.489e-17**,
 * against **the worst group's** mean absolute residual of 0.1617 m and RMS of
 * 0.2119 m on the same rows with the same delta -- worst against worst, which is
 * the comparison that matters and which this sentence used to make while calling
 * both figures means. The means over the 54 groups are **0.0757 m** and
 * **0.1123 m** (`.review/rev19/worsts.mjs`, which prints them as `worstMae` and
 * `worstRms`); the conclusion is untouched either way, because 5e-17 is not a
 * distance beside any of the four. It read as a distance in metres and it was a
 * rounding error. `reachError` is the mean absolute residual, which cannot
 * cancel.
 *
 * `contactBrier` was the raw Brier score, and it could not report an error
 * either -- for a different reason worth keeping. This model has no covariates,
 * so a cell's contact prediction is a constant: every trace row carries
 * `before.contactProbability === 0` **by construction**, because
 * `collectTacticalTrace` builds every `before` with
 * `tacticalStateFromView(view, 0)` and that parameter is the only writer of the
 * column. This said "0 of 18,494 otherwise", which is a true count stating a
 * structural fact as an empirical one -- a weaker claim than the code supports,
 * and one that would go on reading true after a change that made it false in
 * general. So `delta.contactProbability` *is* the group's contact rate `p`. A constant
 * predictor against outcomes of rate `q` scores `q(1-q) + (p-q)^2`. In-sample
 * `p === q`, so the score is exactly the irreducible `q(1-q)`, which is at most
 * 0.25 -- the limit it was compared against was its own ceiling. Out of sample it
 * correlated with `q(1-q)` at **0.9959** over 126 held-out folds (mean 0.1390
 * against a floor of 0.1353, so the model contributed 2.7 %), and all seven folds
 * that breached 0.25 had a held-out contact rate in [0.3, 0.7] while none outside
 * that band ever did. It refused cells whose *outcome* was uncertain, which is
 * precisely the cell a look-ahead most needs to search.
 *
 * `contactRateError` is what is left when the irreducible part is removed:
 * `sqrt(Brier - q(1-q))`, which for a constant predictor is exactly `|p - q|` and
 * so is a probability rather than a squared one. **A constant predictor's only
 * possible error is a calibration gap, and a calibration gap is invisible
 * in-sample by construction** -- so unlike the other two columns this one is
 * identically zero unless the validation split is real, which is why
 * `train-lookahead.mjs` warns when the budget cannot make one.
 *
 * **The `max(0, ...)` is not the future-proofing this said it was, and it fires
 * on the cells the model gets exactly right.** The claim was that "the excess is
 * non-negative for any constant prediction", which is true in exact arithmetic
 * and false in IEEE doubles: where `p === q` the excess is algebraically zero and
 * is computed as a row-summed Brier minus a separately-computed `q(1-q)`, so it
 * lands a few ulps either side. Measured on the 1,190,400-step sweep,
 * **497 of 2,325 records have `brier - q(1-q) < 0`**, most negative -8.327e-17,
 * and **all 497 have `p === q` exactly** (`.review/rev19/clampreal.mjs`). Take
 * the clamp away and `Math.sqrt(-8.3e-17)` is `NaN`, `NaN > limit` is `false`,
 * and the gate **admits** every one of them without reading the column at all --
 * a fail-open guard on precisely the cells whose fit is perfect. `p = 1/3,
 * q = 7/21` is the smallest case and
 * `the_contact_column_clamps_the_negative_excess_a_perfect_fit_produces` is
 * built on it. The three smaller budgets produce no negative excess at all
 * (0 of 2,325 at each), because their row counts make `p` and `q` fractions
 * whose arithmetic is exact -- so a suite that never spends 1,190,400 solver
 * steps cannot meet this by accident, which is why it went five sessions
 * documented as unreachable.
 *
 * `contactRate` is `q` itself, reported and never gated. It is the one thing the
 * raw Brier was reliably telling you, and dropping the column without it would
 * lose it: a `contactRateError` of 0 on a cell that never contacts and one on a
 * cell that contacts half the time are the same number about different cells.
 */
export interface TacticalCalibration { readonly reachError: number; readonly contactRate: number;
  readonly contactRateError: number; readonly vitalityDeltaError: number }
export interface FittedTactic { readonly delta: TacticalDelta; readonly calibration: TacticalCalibration; readonly samples: number }
export interface TacticalModel { readonly version: number; readonly featureNames: readonly TacticalStateColumn[];
  readonly tactics: Readonly<Record<string, FittedTactic>>; readonly cells: Readonly<Record<string, Readonly<Record<string, FittedTactic>>>>;
  readonly digest: string }

const finiteState = (state: TacticalState, label: string): void => {
  for (const name of TACTICAL_STATE_COLUMNS) if (!Number.isFinite(state[name])) throw new Error(`${label}.${name} is non-finite`);
};

export function fitTacticalModel(rows: readonly TacticalTraceRow[]): TacticalModel {
  if (rows.some((row) => row.split !== undefined && row.split !== "train")) {
    const split = rows.find((row) => row.split !== undefined && row.split !== "train")!.split;
    throw new Error(`tactical model fitting cannot read ${split} rows`);
  }
  for (const row of rows) { finiteState(row.before, "trace before"); finiteState(row.after, "trace after"); }
  // `fitGroups`, not a second copy of it. The grouping, the delta and all three
  // statistics were spelled out here as well, and the two copies differed only in
  // parentheses -- which is how one of them got a `Math.abs` on the reach residual
  // and the other did not, and how the version without it survived long enough to
  // become a gate that could not fire.
  const tactics = fitGroups(rows);
  const cells: Record<string, Record<string, FittedTactic>> = {};
  for (const row of rows) {
    const cell = row.bodyLoadout ?? "default"; (cells[cell] ??= {});
  }
  for (const cell of Object.keys(cells).sort()) {
    const cellRows = rows.filter((row) => (row.bodyLoadout ?? "default") === cell);
    const model = fitGroups(cellRows); cells[cell] = model;
  }
  const body = { version: TACTICAL_MODEL_VERSION, featureNames: TACTICAL_STATE_COLUMNS,
    tactics, cells };
  return Object.freeze({ ...body, tactics: Object.freeze(tactics),
    cells: Object.freeze(Object.fromEntries(Object.entries(cells).map(([cell, fitted]) => [cell, Object.freeze(fitted)]))),
    digest: digest(body) });
}

const fitGroups = (rows: readonly TacticalTraceRow[]): Record<string, FittedTactic> => {
  const groups = new Map<string, TacticalTraceRow[]>();
  for (const row of rows) { const group = groups.get(row.tactic) ?? []; group.push(row); groups.set(row.tactic, group); }
  const tactics: Record<string, FittedTactic> = {};
  for (const [tactic, group] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
    const delta = Object.fromEntries(TACTICAL_STATE_COLUMNS.map((name) => [name,
      group.reduce((sum, row) => sum + row.after[name] - row.before[name], 0) / group.length])) as unknown as TacticalDelta;
    const calibration = calibrationFor(group, delta);
    tactics[tactic] = Object.freeze({ delta: Object.freeze(delta), samples: group.length, calibration: Object.freeze(calibration) });
  }
  return tactics;
};

/**
 * The one place a calibration record is computed, in-sample and out.
 *
 * The two continuous residuals are spelled **identically** on purpose:
 * `delta.X - (after.X - before.X)`, the amount the constant delta over-predicts
 * this row's actual movement. The reach one used to read
 * `before.reachMargin + delta.reachMargin - after.reachMargin`, which is the same
 * algebra with the parentheses moved -- and the asymmetry is what let the reach
 * column lose its `Math.abs` while the vitality column kept one, invisibly,
 * because the two lines no longer looked like each other. If a third continuous
 * column is added, write it this way too.
 */
const calibrationFor = (rows: readonly TacticalTraceRow[], delta: TacticalDelta): TacticalCalibration => {
  const mean = (of: (row: TacticalTraceRow) => number): number => rows.reduce((sum, row) => sum + of(row), 0) / rows.length;
  const contactRate = mean((row) => row.contact ? 1 : 0);
  const brier = mean((row) => (Math.max(0, Math.min(1, row.before.contactProbability + delta.contactProbability)) -
    (row.contact ? 1 : 0)) ** 2);
  return {
    reachError: mean((row) => Math.abs(delta.reachMargin - (row.after.reachMargin - row.before.reachMargin))),
    contactRate,
    contactRateError: Math.sqrt(Math.max(0, brier - contactRate * (1 - contactRate))),
    vitalityDeltaError: mean((row) => Math.abs(delta.vitalityPotential - (row.after.vitalityPotential - row.before.vitalityPotential))),
  };
};

const stable = (value: unknown): string => value === null || typeof value !== "object" ? JSON.stringify(value) : Array.isArray(value) ?
  `[${value.map(stable).join(",")}]` : `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))
    .map(([key, entry]) => `${JSON.stringify(key)}:${stable(entry)}`).join(",")}}`;
const digest = (value: unknown): string => { let hash = 0x811c9dc5; for (const byte of new TextEncoder().encode(stable(value))) {
  hash ^= byte; hash = Math.imul(hash, 0x01000193) >>> 0; } return hash.toString(16).padStart(8, "0"); };

/** Replaces only calibration fields from frozen validation traces; coefficients remain train-only. */
export function calibrateTacticalModel(model: TacticalModel, rows: readonly TacticalTraceRow[]): TacticalModel {
  if (rows.some((row) => row.split !== "validation")) throw new Error("tactical calibration can read validation rows only");
  const tactics = { ...model.tactics }; const cells: Record<string, Record<string, FittedTactic>> = {};
  for (const [cell, fitted] of Object.entries(model.cells)) cells[cell] = { ...fitted };
  for (const cell of Object.keys(cells)) for (const [tactic, fitted] of Object.entries(cells[cell]!)) {
    const sample = rows.filter((row) => row.bodyLoadout === cell && row.tactic === tactic);
    if (sample.length) cells[cell]![tactic] = Object.freeze({ ...fitted, calibration: Object.freeze(calibrationFor(sample, fitted.delta)) });
  }
  const body = { version: model.version, featureNames: model.featureNames, tactics, cells };
  return Object.freeze({ ...body, digest: digest(body) });
}

export function predictTactical(model: TacticalModel, tactic: string, state: TacticalState): TacticalState {
  finiteState(state, "tactical state"); const fitted = model.tactics[tactic];
  if (!fitted) throw new Error(`tactical model has no coefficients for "${tactic}"`);
  return Object.freeze(Object.fromEntries(TACTICAL_STATE_COLUMNS.map((name) => [name, state[name] + fitted.delta[name]])) as unknown as TacticalState);
}

export function predictTacticalCell(model: TacticalModel, bodyLoadout: string, tactic: string, state: TacticalState): TacticalState {
  finiteState(state, "tactical state"); const fitted = model.cells[bodyLoadout]?.[tactic];
  if (!fitted) throw new Error(`lookahead refuses ${bodyLoadout}: tactic "${tactic}" has no fitted model`);
  return Object.freeze(Object.fromEntries(TACTICAL_STATE_COLUMNS.map((name) =>
    [name, state[name] + fitted.delta[name]])) as unknown as TacticalState);
}

/**
 * One number per gated column, each in that column's own unit -- and **two** for
 * the reach column, because one of the five movements is not the same question
 * as the other four. `contactRate` is not here because it is a property of the
 * world rather than of the fit: a cell that contacts nine times in ten is not
 * miscalibrated for it.
 *
 * The three used to be three copies of `0.25` measuring a signed distance in
 * metres, a squared probability and a fraction of a health bar, which is a single
 * number wearing three units. `LOOKAHEAD_CALIBRATION_LIMITS` in `deployment.ts`
 * carries the measurement behind each one, and the argument for the split.
 */
export interface CalibrationLimits { readonly reachError: number; readonly approachReachError: number;
  readonly contactRateError: number; readonly vitalityDeltaError: number }

/**
 * The movements whose reach change **terminates**, and which a constant delta
 * therefore cannot describe.
 *
 * Exactly one, and it is worth saying why it is not two. `disengage` also moves
 * the reach margin every step and is the *best*-fitting movement of the five --
 * mean `reachError` 0.0902 against `close`'s 0.2915 on the 1,190,400-step record
 * -- because a retreat runs at a constant back-speed and does not stop. What
 * breaks `close` is that a fighter closing decelerates as it arrives and then
 * stops when it contacts, so the residual about the mean closure is large by
 * construction and shrinks with the bout window rather than with the fit. So the
 * discriminator is termination, not "the reach changes", and a movement added to
 * `MOVEMENT_NAMES` belongs here only if it ends.
 *
 * Spelled here rather than imported from `options.ts` because the cell key
 * grammar is this module's own contract -- see the file docstring -- and
 * `the_approach_set_names_movements_the_option_table_actually_has` pins the set
 * against the option table so a rename cannot make this a list of movements that
 * do not exist.
 */
export const APPROACH_MOVEMENTS: readonly string[] = Object.freeze(["close"]);

/**
 * Which reach tolerance a cell key is judged against.
 *
 * The movement is the first field of `movement+action+effector+target`, which is
 * `plannedTacticKey`'s grammar and this module's declared contract; a key that
 * is not in that grammar gets the ordinary limit, which is the strict one.
 *
 * **A missing number is refused by name rather than compared against.**
 * `undefined` loses every `>` comparison silently, so a limits record written
 * before the reach column split in two would not refuse a thing and would look
 * exactly like a gate that had nothing to refuse. TypeScript catches that inside
 * `src/`; the `.mjs` suites and `scripts/` are outside `tsconfig.json`'s
 * `include` and are where every hand-written limits literal actually lives.
 */
export const reachLimitFor = (tactic: string, limits: CalibrationLimits): number => {
  const limit = APPROACH_MOVEMENTS.includes(tactic.split("+")[0] as string) ? limits.approachReachError : limits.reachError;
  if (typeof limit !== "number" || Number.isNaN(limit)) {
    throw new Error(`calibration limits are missing a reach tolerance for tactic "${tactic}"`);
  }
  return limit;
};
/**
 * How much of its own tolerance a cell spends, summed over the gated columns.
 *
 * Zero is a perfect fit and 1.0 per column is the refusal threshold, so this is
 * dimensionless and every column contributes on the scale of the decision that
 * column is actually used for. The trainer's best-of-three seed selection reads
 * it, and it used to sum the three raw numbers instead: measured at the 2x budget
 * the winning candidate came to `|signedReachError|` 1.145 + `contactBrier` 42.778
 * + `vitalityDeltaError` 1.373, so **94.4 % of the champion score was the Brier**,
 * which was itself 99.6 % irreducible outcome variance. The champion seed was
 * being chosen by which validation bouts happened to contact least ambiguously.
 * The share is 94.5 % at 4x and 88.8 % at 8x; `docs/measurements.md` "Session 19",
 * section 6, has the decomposition. **Fixing it moved no champion and did move the
 * inputs**, which the record under-sold: at 595,200 the old score picked its winner
 * by 0.003 % against 1.225 % under severity, and at 1,190,400 the ranking of the
 * two also-rans swaps.
 *
 * **It takes the cell key**, because the reach tolerance depends on the movement
 * and a score whose scales disagreed with the gate's would rank candidates by a
 * threshold nothing enforces.
 */
export const calibrationSeverity = (tactic: string, calibration: TacticalCalibration, limits: CalibrationLimits): number =>
  calibration.reachError / reachLimitFor(tactic, limits) + calibration.contactRateError / limits.contactRateError +
  calibration.vitalityDeltaError / limits.vitalityDeltaError;

/**
 * Why this cell cannot be planned over, or null if it can.
 *
 * Asked rather than thrown because a search has two different questions for it.
 * "May I trust this one prediction" is a throw, and `requireCalibration` below
 * is exactly this sentence thrown. "Which of the tactics this body can perform
 * can I predict at all" is a filter, and a filter that has to catch an exception
 * per candidate is a filter written as control flow. Both read one copy of the
 * rule, which is the point: the refusal a caller reports and the set it searches
 * cannot disagree about which cells are fit to use.
 */
export function calibrationRefusal(model: TacticalModel, tactic: string, bodyLoadout: string,
  limits: CalibrationLimits): string | null {
  const calibration = model.cells[bodyLoadout]?.[tactic]?.calibration ?? (bodyLoadout === "default" ? model.tactics[tactic]?.calibration : undefined);
  if (!calibration) return `lookahead refuses ${bodyLoadout}: tactic "${tactic}" has no calibrated model`;
  // No `Math.abs` on any of the three: all three columns are magnitudes now, and
  // the one that was not -- the reach column -- was wrapped here rather than at
  // the statistic, which is how a signed mean that is identically zero looked
  // like a bounded distance for the whole of its life.
  //
  // The reach comparison reads `reachLimitFor` and not `limits.reachError`,
  // which is the one line that keeps a single scalar from quietly becoming a
  // switch that turns approach planning off for every body at once.
  if (calibration.reachError > reachLimitFor(tactic, limits) || calibration.contactRateError > limits.contactRateError ||
      calibration.vitalityDeltaError > limits.vitalityDeltaError) {
    return `lookahead refuses ${bodyLoadout}: calibration failed for tactic "${tactic}"`;
  }
  return null;
}

export function requireCalibration(model: TacticalModel, tactic: string, bodyLoadout: string, limits: CalibrationLimits): void {
  const refusal = calibrationRefusal(model, tactic, bodyLoadout, limits);
  if (refusal) throw new Error(refusal);
}
