/**
 * The dwell grid, the eight names a behaviour record gives it, and what a
 * controller may say about having a dwell head at all.
 *
 * **A leaf with no imports, and that is the whole reason it is a file rather
 * than a paragraph in `meta.ts`.** The grid was declared there, beside the
 * constant it has to contain; the record that names a dwell is validated in
 * `learning/tournament.ts`, which cannot import `meta.ts`. `options.ts` imports
 * `learning/engagement.ts`, which imports `tournament.ts`, so those two are
 * already cyclic, and `meta.ts` builds `META_OUTPUT_NAMES` out of `options.ts`'s
 * frozen tables at module scope -- so `tournament.ts -> meta.ts -> options.ts`
 * closes the cycle through a module body that reads a partially-initialised
 * binding. Measured rather than feared (`.review/dwell/cycle.mjs`): every test
 * whose first import is `options.ts` dies with
 * `Cannot access 'MOVEMENT_NAMES' before initialization`, which is the same
 * failure `tournament.ts`'s own header comment records from the last time
 * somebody put a table on the wrong side of that edge.
 *
 * This is the fix `TACTIC_KEY_DELIMITER` already carries in `options.ts`, for
 * the same reason: a table lives where both of its readers can reach it, not
 * beside whichever reader was written first. `meta.ts` re-exports
 * `PERSISTENCE_SECONDS`, so nothing that already imported it from there had to
 * move -- one binding under two spellings of its address, not two tables.
 */

/**
 * The dwell times PPO's sixth head chooses between, in seconds.
 *
 * **A binned categorical, and the objection `PPO_POLICY_HEADS` raises against a
 * learned persistence does not reach one.** That note declines a continuous
 * action as "a Gaussian or Beta parameterisation with a different
 * log-probability in the importance ratio, a different entropy term and a
 * different clipping story". A grid reuses all three unchanged: the same
 * categorical log-probability, the same ratio, the same clipped surrogate, and
 * an entropy bounded by `log k`. A differential entropy is bounded by nothing
 * and can be negative, which would silently change what the pinned mean
 * per-head entropy in `tests/ppo.test.mjs` is a number about.
 *
 * **Eight, and two constraints plus one preference get there.** The two
 * constraints are real. The grid must reach `MIN_PERSISTENCE` and
 * `MAX_PERSISTENCE`, because those are the clamp `research-policy.ts` applies to
 * a label: a bin outside them would name a dwell the runtime silently replaces,
 * which is an importance ratio evaluated at an action nobody took. And it must
 * contain `UNLEARNED_PERSISTENCE` exactly, so a learned dwell can be compared
 * with the constant -- though **note what that does not mean**: no PPO artifact
 * is checked in (`asset-src/learning/` holds `neat-qd`, `dagger` and
 * `lookahead`), and `deployedResearchMind`'s shape guard refuses a five-head PPO
 * payload outright, so nothing existing re-decodes and no digest moves. The
 * comparison is one a future run can make, not one this change performs.
 *
 * **Uniformity is a preference, and this said it was a constraint.** The entropy
 * bonus is flat over *bins*, which is true under any grid, so an uneven grid is
 * not unfair in the term -- it spends exploration unevenly per second of dwell,
 * and only measuring behaviour in dwell-seconds makes that a defect. Uniform is
 * chosen because it pre-judges nothing about where the resolution should sit,
 * and its cost is measured below and real: three of the eight bins buy under
 * 0.007 s of mean dwell between them. A grid denser at the bottom would fit the
 * measured behaviour better and was declined for one reason -- that saturation
 * is a property of the current skill durations against the current opponents,
 * and baking one sweep's coverage space into the output contract is the trap
 * `meta.ts` keeps records about.
 *
 * Given uniform, eight follows: a step reaching 0.10 and 0.80 and landing on
 * 0.40 must divide both 0.70 and 0.30, so it is at most `gcd(0.70, 0.30) = 0.10`
 * and eight is the **coarsest** such grid. The finer ones are `1 + 7k` points
 * for a step of `0.10 / k` -- 15, 22, 29, 36 and so on, an infinite family and
 * not the three values an earlier note listed as though it were the set. 0.10 s
 * is 24 solver steps at `CONFIG.world.physicsHz` and six decision steps at the
 * 60 Hz the decision loop runs at.
 *
 * **Spelled as literals, and a generated grid really does miss two of them.**
 * `Array.from({ length: 8 }, (_, i) => 0.10 + i * 0.10)` differs from the
 * literal at `i = 2` and `i = 6`: 0.30000000000000004 and 0.7000000000000001.
 * It does *not* differ at 0.40 -- `0.1 + 3 * 0.1 === 0.4` is true, which is one
 * float claim that turned out not to be the trap it reads as -- and `(i + 1) / 10`
 * reproduces all eight exactly. Literals rather than either, because
 * `decodeMetaPersistence`'s own note is what happens when a spelling that looks
 * like a derivation moves a decoded dwell in its last bit.
 *
 * **The top half of the grid barely separates, and that is a fact about the
 * bodies rather than about the grid.** `researchLabelMind` re-decides at
 * `min(persistence, the skill finishing)`, so a long request is only spent when
 * the skill outlasts it. Measured with the persistence forced to each bin over
 * every one of the 90 jobs of `researchMatrix("train", 310013)`, 1200 solver
 * steps each, an untrained randomly-initialised recurrent policy, the league
 * opponent `indexedLeagueOpponent` picks per index (`.review/persist/sweep.mjs`;
 * `docs/measurements.md` carries the table): mean real dwell runs 0.109 s at the
 * 0.10 bin to 0.359 s at the 0.80 bin, and the share of boundaries the timer
 * rather than the skill ended runs 97.6 % to 4.8 %. The last three bins are
 * within 0.007 s of each other in mean dwell -- under half a decision step --
 * while still differing in the tail, because only a long request can hold a
 * decision for 0.82 s. So the head's real resolution is in the lower half, which
 * is the half a policy would use to decide *faster* than the constant.
 *
 * **Those numbers were measured twice and the first set was wrong.** The sweep
 * that produced them drove all of one decision's heads from one seeded stream,
 * so adding this head changed the number of draws per decision and every bout
 * diverged -- and because the sweep *forces* the persistence, nothing in it
 * could notice it was reporting the tree from before the change.
 * `.review/persist/sweep.mjs` gives each head its own stream;
 * `docs/measurements.md` records both sets and what moved.
 */
export const PERSISTENCE_SECONDS: readonly number[] =
  Object.freeze([0.10, 0.20, 0.30, 0.40, 0.50, 0.60, 0.70, 0.80]);

/**
 * What a behaviour record calls each bin: the dwell in seconds, to two places.
 *
 * **Derived by rendering the literal, never by arithmetic on it, and the
 * difference is the whole point of this constant.** `(0.30).toFixed(2)` is
 * `"0.30"` and `Number("0.30") === 0.30` is exact, because decimal-string
 * parsing is correctly rounded to the same double the literal denotes -- so a
 * key survives `JSON.stringify` and comes back naming the same bin. `String()`
 * does not: run over a *generated* grid it writes `"0.30000000000000004"` and
 * `"0.7000000000000001"`, two keys no reader would think to look for, and the
 * whole reason `PERSISTENCE_SECONDS` is eight literals rather than a loop.
 * `a_dwell_bin_key_survives_a_round_trip_through_json_on_every_bin` in
 * `tests/ai-tournament.test.mjs` is what says so rather than this paragraph.
 */
export const PERSISTENCE_BIN_KEYS: readonly string[] =
  Object.freeze(PERSISTENCE_SECONDS.map((seconds) => seconds.toFixed(2)));

/**
 * The bin a dwell belongs to, chosen by distance and never by equality.
 *
 * **`indexOf` is the trap here and it is a measured one.** Over the grid a loop
 * produces, `PERSISTENCE_SECONDS.indexOf` answers -1 on two of eight values, so
 * a record keyed that way would silently lose a bin the day anybody regenerated
 * the table. Nearest-by-distance answers 2 and 6 for exactly those two numbers.
 *
 * It also has to answer for a dwell that is not on the grid at all, which is
 * most of them: `dagger` regresses the dwell through a sigmoid and `neat-qd`
 * decodes a clamped scalar, so neither lands on a bin except by accident. Only
 * `ppo` picks a grid index and only `lookahead` names a grid member by constant.
 * `researchLabelMind` then clamps a label into
 * `[MIN_PERSISTENCE, MAX_PERSISTENCE]`, which are this grid's own endpoints, so
 * nearest-by-distance over the raw label and over the clamped dwell are always
 * the same bin -- the record therefore describes the dwell the runtime used and
 * not a number the runtime threw away.
 *
 * A dwell exactly between two bins takes the lower: the comparison is strict, so
 * 0.45 is bin 3 rather than bin 4. Which one it is matters less than that it is
 * the same one every time.
 */
export function persistenceBin(seconds: number): number {
  if (!Number.isFinite(seconds)) throw new Error(`a dwell must be a finite number of seconds, not ${seconds}`);
  let best = 0;
  for (let index = 1; index < PERSISTENCE_SECONDS.length; index += 1) {
    if (Math.abs(seconds - (PERSISTENCE_SECONDS[index] as number)) <
        Math.abs(seconds - (PERSISTENCE_SECONDS[best] as number))) best = index;
  }
  return best;
}

/** The name a record writes for this dwell. One spelling, shared by the producer and the validator. */
export const persistenceBinKey = (seconds: number): string => PERSISTENCE_BIN_KEYS[persistenceBin(seconds)] as string;

/** Why this is not a dwell bin name, or null when it is. A phrase, in the shape `tacticKeyFailure` uses. */
export const persistenceBinFailure = (key: string): string | null =>
  PERSISTENCE_BIN_KEYS.includes(key) ? null : `a dwell bin of ${PERSISTENCE_BIN_KEYS.join(", ")}, not "${key}"`;

/**
 * The dwell half of a behaviour record: the marginal over the eight bins, and
 * the subset of it the controller could actually have decided.
 *
 * **Two maps and not one, because one map cannot tell a head that collapsed from
 * a head that does not exist.** `bins` is every decision, keyed by the dwell it
 * asked for; `freeBins` is the same count restricted to decisions where the
 * controller had two or more dwells to name. A look-ahead candidate writes
 * `{"0.40": n}` and `{}` -- constant by construction. A PPO candidate whose
 * dwell head settled on one bin writes `{"0.40": n}` and `{"0.40": n}` -- a head
 * that had the whole grid and used one of it. Before this pair the two printed
 * byte for byte the same thing, and `headUtilisation` printed neither, because
 * the dwell is not a field of `TacticTuple` and no marginal of the joint map can
 * reach it.
 *
 * **It is carried beside the joint map rather than added to the key, and that is
 * a measurement rather than taste.** The five-name key already occupies 555 of
 * 2,520 cells at 2.39 counts each over a 39-job sweep; multiplying it by eight
 * would make a table of ones out of a table of ones and twos. `FREE_CHOICE_HEADS`
 * in `options.ts` carries the same argument for the effector's map, which is the
 * construct this one is modelled on.
 */
export interface PersistenceCounts {
  readonly bins: Readonly<Record<string, number>>;
  readonly freeBins: Readonly<Record<string, number>>;
}

/** The two halves, named once, so a fold or a check cannot cover one and forget the other. */
export const PERSISTENCE_RECORD_HALVES: readonly (keyof PersistenceCounts)[] =
  Object.freeze(["bins", "freeBins"] as const);

/** What a bout that recorded no decision has, and what a control row carries. */
export const emptyPersistenceCounts = (): PersistenceCounts =>
  Object.freeze({ bins: Object.freeze({}), freeBins: Object.freeze({}) });

/** One record frozen into the shape a row carries, tolerating a producer that wrote neither half. */
export const freezePersistenceCounts = (record: Partial<PersistenceCounts> | null | undefined): PersistenceCounts =>
  Object.freeze({ bins: Object.freeze({ ...record?.bins }), freeBins: Object.freeze({ ...record?.freeBins }) });

/** Both halves summed over a set of rows. The one production fold, for the reason `mergeBehaviourRecord` gives. */
export function mergePersistenceCounts(records: readonly (PersistenceCounts | undefined)[]): PersistenceCounts {
  const merged: Record<keyof PersistenceCounts, Record<string, number>> = { bins: {}, freeBins: {} };
  for (const record of records) {
    for (const half of PERSISTENCE_RECORD_HALVES) {
      for (const [bin, count] of Object.entries(record?.[half] ?? {})) merged[half][bin] = (merged[half][bin] ?? 0) + count;
    }
  }
  return Object.freeze({ bins: Object.freeze(merged.bins), freeBins: Object.freeze(merged.freeBins) });
}

/**
 * Why this dwell record cannot have come from a bout, or null when it could.
 *
 * A phrase and not a boolean, for the reason `tacticKeyFailure` gives: a row
 * refused out of a file somebody has to fix by hand has to say which part of it
 * was wrong.
 *
 * **The third check is the one that is not a spelling test, and it is stronger
 * than the free-choice record's.** Every decision names exactly one dwell, so
 * `bins` sums to the decision count the joint map already carries. A record that
 * folds nothing therefore cannot pass as a record of a candidate that never
 * varied -- which is the failure `AGENTS.md` describes as "a digest that folds
 * nothing reads exactly like a digest that folds everything", one layer down.
 * The fourth is the subset rule the effector's map is checked by: a free choice
 * is a subset of all choices of the same bin.
 */
export function persistenceRecordFailure(record: unknown, decisions: number): string | null {
  if (!record || typeof record !== "object" || Array.isArray(record)) return "a dwell record with a bins and a freeBins map";
  const halves = record as Record<string, unknown>;
  for (const key of Object.keys(halves)) {
    if (!(PERSISTENCE_RECORD_HALVES as readonly string[]).includes(key)) {
      return `a dwell record of ${PERSISTENCE_RECORD_HALVES.join(" and ")}, not "${key}"`;
    }
  }
  for (const half of PERSISTENCE_RECORD_HALVES) {
    const map = halves[half];
    if (!map || typeof map !== "object" || Array.isArray(map)) return `a dwell ${half} map`;
    for (const [bin, count] of Object.entries(map as Record<string, unknown>)) {
      const failure = persistenceBinFailure(bin);
      if (failure) return `${failure} in its dwell ${half}`;
      if (!Number.isSafeInteger(count) || (count as number) < 0) return `a whole non-negative dwell ${half} count for "${bin}", not ${count}`;
    }
  }
  const counted = record as PersistenceCounts;
  const total = Object.values(counted.bins).reduce((sum, count) => sum + count, 0);
  if (total !== decisions) return `one dwell for each of its ${decisions} decisions, not ${total}`;
  for (const [bin, count] of Object.entries(counted.freeBins)) {
    if (count > (counted.bins[bin] ?? 0)) {
      return `no more free dwell choices of "${bin}" than the ${counted.bins[bin] ?? 0} it recorded, not ${count}`;
    }
  }
  return null;
}

/**
 * What a controller says about its own dwell: how many distinct dwells it can
 * name.
 *
 * **This is a declaration and it is deliberately not an inference, because every
 * inference available is the defect being fixed.** Counting the bins a bout
 * actually used cannot separate a collapsed head from a constant; reading the
 * algorithm name off the manifest is the thing `scripts/evaluate-ai.mjs` already
 * does and the thing entry 14 of the found-not-fixed register says is not
 * enough, because three of the four algorithms decide a dwell and one does not.
 * So the number is stated at the site that produces the dwell, where a reader
 * changing that site sees it:
 *
 * - `ppo` declares its head's own row count, taken off the decoded weights --
 *   the one branch where the number is evidence rather than a claim, and it is
 *   the artifact's evidence rather than the code's.
 * - `dagger` and `neat-qd` declare `PERSISTENCE_SECONDS.length`. Both produce a
 *   *continuous* dwell, from a sigmoid and from a clamped scalar, so the honest
 *   width is how many dwells the record can distinguish them naming, which is
 *   the grid it bins them into.
 * - `lookahead` declares **1**, and it is the sharpest case: `lookaheadMind`
 *   writes `UNLEARNED_PERSISTENCE` at its own call site and its re-decision
 *   condition carries no clock term at all, so the dwell it reports is not
 *   merely constant, it is never spent. A record that let it print a one-bin
 *   spike beside PPO's would be reporting a head that does not exist.
 *
 * **Silence means one, and that direction is chosen rather than convenient.** A
 * controller that says nothing gets `freeBins: {}`, so the record under-claims
 * rather than claiming a head nobody declared -- and every probe in the suite
 * that hardcodes a dwell is a controller with exactly one, so the default is
 * also right for them. `every_deployed_algorithm_declares_whether_it_has_a_dwell_head`
 * is what stops the four production branches resting on it.
 */
export interface PersistenceHead {
  readonly persistenceOptions: number;
}

/** The declaration read off a controller, refusing a malformed one by name. */
export function persistenceOptionsOf(mind: unknown): number {
  const declared = (mind as Partial<PersistenceHead> | null | undefined)?.persistenceOptions;
  if (declared === undefined) return 1;
  if (!Number.isSafeInteger(declared) || declared < 1) {
    throw new Error(`a controller declared ${declared} dwell options; the contract is a whole number of at least 1`);
  }
  return declared;
}
