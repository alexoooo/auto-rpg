import { UNLEARNED_PERSISTENCE } from "./meta.ts";

export interface AdvantageStep {
  readonly reward: number;
  readonly value: number;
  readonly nextValue: number;
  readonly terminal: boolean;
  /**
   * How long this step lasted, in seconds. **Required, and not defaulted to 1.**
   *
   * A default would be a silent unit: a caller that forgot it would get exactly
   * the flat per-step discount this signature exists to remove, and nothing
   * would say so. It is refused by name beside the three numbers above instead.
   */
  readonly durationSeconds: number;
}

/**
 * Generalized advantage estimation over a **semi-MDP**: gamma and lambda are
 * rates per second, and each step is discounted by the time it took.
 *
 * **This was flat per boundary, and while persistence was the constant
 * `UNLEARNED_PERSISTENCE` that was exactly right.** Every boundary lasted the
 * same requested time, so per-boundary and per-second discounting differ by a
 * constant and the constant cancels. Learning the persistence breaks that, and
 * the failure is the quiet kind: a bout reaching the same terminal reward in
 * fewer boundaries is discounted less, so a persistence head trained under a
 * flat gamma learns to hold a decision for reasons that have nothing to do with
 * whether holding it is tactically good, and the training curve goes up.
 *
 * **Measured on the tree that ships** (`.review/persist/sweep.mjs`;
 * `docs/measurements.md` carries the tables and the coverage space, and records
 * that the first version of this measurement was taken on the tree *before* the
 * sixth head and had to be thrown away). Boundaries per bout run **42.50** at
 * the 0.10 bin to **12.83** at the 0.80 bin over a bout clock that stays within
 * 4.61-4.79 s, so a flat 0.99 weights a bout-end terminal by `0.99 ** (n - 1)` =
 * **0.6590** against **0.8879**: a **34.7 %** spread in what a terminal is worth,
 * decided by dwell and by nothing tactical. Against the 0.40 bin alone it is
 * 2.6 %, not the 4.5 % a boundary count of `bout / requested` predicts, because
 * a request above 0.5 s is mostly not spent -- `researchLabelMind` re-decides at
 * `min(persistence, the skill finishing)`.
 *
 * **The spread is a magnitude and its sign follows the terminal's.** An earlier
 * version of this note called it "a 35 % return advantage to maximal
 * persistence", which is only true where terminals are net positive. On this
 * coverage space they are not: wins against losses run 14/20, 3/15, 11/13, 9/10,
 * 9/16, 8/14, 8/12 and 10/13 across the eight bins, net-negative in all of them,
 * so a flat gamma *penalises* long dwell here. An untrained policy losing is not
 * a surprise and a trained one may flip it. What is invariant is that the weight
 * on a terminal moves by a third with the dwell, for a reason that is not about
 * the fight.
 *
 * **Like for like, per bout, it is the smaller of the two biases.** Only 18-34
 * of 90 bouts reach a terminal at this budget, so the weight spread is worth at
 * most `4 * 0.2289 * (34 / 90) = 0.35` a bout and about 0.23 at the median bin
 * -- against **0.72** a bout for the progress term below. Roughly 3x apart, not
 * the same order, and this note claimed otherwise.
 *
 * **What the change is worth as measured is small, and it is taken on principle
 * rather than on effect size.** Mean discounted return per bout, this recursion
 * against the flat one over the same 90 bouts: -0.048, -0.048, -0.002, -0.004,
 * -0.003, -0.003, -0.006, -0.006. Non-monotone, largest magnitude 0.048. The
 * argument for it is that a discount per boundary is not a discount at all once
 * boundary length is a learned quantity; the argument is *not* that it moves the
 * numbers, because it barely does at this budget.
 *
 * **What it does not fix.** The progress term of `tacticalBoundaryReward` is
 * clipped per boundary and therefore does not telescope, so more boundaries
 * accrue more of it: clipped progress per bout tracks boundary count at
 * 0.0221-0.0263 per boundary across the whole grid, which is 1.054 a bout at the
 * 0.10 bin against 0.336 at the 0.80 bin. That bias exists with or without this
 * change and is independent of it -- an earlier note said fixing the discount
 * "unmasks" it, which is a claim about interaction that the measurement does not
 * support. It is registered in
 * `docs/plans/combat-followups-99-found-not-fixed.md` with its coverage space.
 */
export function generalizedAdvantages(steps: readonly AdvantageStep[], gamma: number, lambda: number): number[] {
  if (![gamma, lambda].every((value) => Number.isFinite(value) && value >= 0 && value <= 1)) {
    throw new Error("GAE gamma and lambda must be finite within 0..1");
  }
  const advantages = Array(steps.length).fill(0) as number[]; let next = 0;
  for (let index = steps.length - 1; index >= 0; index -= 1) {
    const step = steps[index] as AdvantageStep;
    if (![step.reward, step.value, step.nextValue].every(Number.isFinite)) throw new Error(`GAE step ${index} is non-finite`);
    // Zero is legal and one boundary in every trajectory can be it: the last
    // decision may land on the final published sample, and no elapsed time is
    // `gamma ** 0 === 1`, which is the right answer rather than a special case.
    if (!Number.isFinite(step.durationSeconds) || step.durationSeconds < 0) {
      throw new Error(`GAE step ${index} has a duration of ${step.durationSeconds} seconds`);
    }
    const continuation = step.terminal ? 0 : 1;
    // **`gamma ** dt * lambda`, and not `(gamma * lambda) ** dt`.** Both are
    // valid GAE families -- at `lambda = 1` they are the same expression, which
    // is what makes the estimator telescope to the Monte-Carlo advantage under
    // either -- and they differ in what `lambda` is a rate *of*.
    //
    // `gamma` is physical: it is a statement about reward arriving later in
    // seconds, so it belongs in the exponent. `lambda` is not. It interpolates
    // between TD(0) and Monte Carlo over *n-step returns*, and n counts
    // decisions; a boundary is one decision however long it took. Put it in the
    // exponent and the credit-assignment window becomes a function of the dwell
    // the sixth head is learning: over ten boundaries the trace decays by
    // `0.9405` at the 0.10 bin and by `0.9405 ** 8 = 0.605` at the 0.80 bin, so
    // a long-dwell policy is scored with a shorter horizon in decisions for
    // reasons that are not about bias and variance. That is the same coupling
    // this function's own docstring is about, reintroduced one term over.
    //
    // The two coincide at the reference as well: `gamma ** 0.4 * 0.95` is
    // exactly `0.99 * 0.95`. `the_trace_decays_per_decision_and_the_discount_per_second`
    // is the pin, at a lambda and a duration where they come apart.
    const delta = step.reward + gamma ** step.durationSeconds * step.nextValue * continuation - step.value;
    next = delta + gamma ** step.durationSeconds * lambda * continuation * next; advantages[index] = next;
  }
  return advantages;
}

/**
 * The discount PPO trains under, per **second** of bout clock, and the trace
 * decay, per **decision**.
 *
 * Only one of the two is converted, which is the whole content of the pair.
 * `PPO_GAMMA_PER_SECOND` is the per-second rate whose effect over one
 * `UNLEARNED_PERSISTENCE` boundary is exactly the 0.99 the flat scheme used.
 * `PPO_TRACE_LAMBDA` is the same 0.95 as before with no conversion at all,
 * because `generalizedAdvantages`' note argues lambda is a per-decision knob;
 * `gamma ** 0.4 * 0.95` is exactly `0.99 * 0.95`, so the reference boundary is
 * unchanged in both terms.
 *
 * **The exactness is real and the reason once written here was not.** This said
 * it followed from `1 / 0.4 === 2.5`. It does not: `(0.99 ** (1 / p)) ** p`
 * returns 0.99 exactly for all eight grid values, including 0.3, 0.6 and 0.7
 * where `1 / p` has no exact double, and for arbitrary `p` in `(0, 1]` -- one
 * miss in 4,000 sampled for gamma, four for lambda. It is the exponent being at
 * or below one that does it: raising by `p <= 1` contracts the relative error of
 * the first power rather than amplifying it. Above one it fails 91 % of the
 * time. **So exactness here is a checked property, not a derived one**, and the
 * check is two-sided in
 * `the_per_second_rate_reproduces_the_flat_discount_at_the_unlearned_persistence`.
 *
 * That also removes a wrinkle the old spelling had: `(gamma * lambda) ** p` is
 * *not* exact at 0.2, 0.3 and 0.6, so a trace factor built as a product would
 * have been exact at five of eight grid values and not at three. Multiplying by
 * a plain 0.95 has no such seam.
 *
 * **The reference is the requested 0.4 s, a boundary requested at 0.4 s does not
 * last 0.4 s, and the discounting therefore does move.** Measured mean dwell at
 * that bin is 0.307 s, so the effective horizon lengthens from `100 * 0.307 =
 * 30.7` s to `1 / (1 - PPO_GAMMA_PER_SECOND) = 40.3` s, and a bout-end terminal
 * at that bin is weighted 0.8879 under the new rate against 0.8653 under the old
 * flat one -- **2.6 % apart**. This paragraph used to say "the discounting does
 * not move at all", which was an inference from exact *constants* to unchanged
 * *trajectories* and is the kind of claim this file exists to stop.
 *
 * The named constant is the reference rather than the measured mean dwell
 * because a mean dwell is a measurement whose coverage space drifts with the
 * skills, and pinning an algorithm's horizon to one is the trap this repository
 * has a rule about. The cost of that choice is the 2.6 % above, stated.
 */
export const PPO_GAMMA_PER_SECOND = 0.99 ** (1 / UNLEARNED_PERSISTENCE);
export const PPO_TRACE_LAMBDA = 0.95;
/** Worker count schedules this graph but is not part of it. */
export const PPO_TRAINING_SEMANTICS_VERSION = 2;
export const PPO_ROLLOUT_BUNDLE_SIZE = 8;

export function clippedPolicyTerm(oldProbability: number, newProbability: number, advantage: number, epsilon: number): number {
  if (!(oldProbability > 0) || !Number.isFinite(newProbability) || !Number.isFinite(advantage) || epsilon < 0) {
    throw new Error("invalid PPO policy sample");
  }
  const ratio = newProbability / oldProbability;
  const clipped = Math.max(1 - epsilon, Math.min(1 + epsilon, ratio));
  return Math.min(ratio * advantage, clipped * advantage);
}

export function clippedValueLoss(oldValue: number, newValue: number, target: number, epsilon: number): number {
  const clipped = oldValue + Math.max(-epsilon, Math.min(epsilon, newValue - oldValue));
  return 0.5 * Math.max((newValue - target) ** 2, (clipped - target) ** 2);
}

export function clipGradientNorm(gradient: readonly number[], maximum: number): number[] {
  if (!(maximum > 0) || !Number.isFinite(maximum) || gradient.some((value) => !Number.isFinite(value))) {
    throw new Error("invalid gradient or clipping maximum");
  }
  const norm = Math.hypot(...gradient); const scale = norm > maximum ? maximum / norm : 1;
  return gradient.map((value) => value * scale);
}

/** Fisher-Yates driven only by seed and index, so worker completion order is irrelevant. */
export function deterministicMinibatchOrder(length: number, seed: number): number[] {
  if (!Number.isSafeInteger(length) || length < 0) throw new Error(`invalid minibatch length ${length}`);
  let state = seed >>> 0; const next = (): number => {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return state >>> 0;
  };
  const order = Array.from({ length }, (_, index) => index);
  for (let index = order.length - 1; index > 0; index -= 1) {
    const other = next() % (index + 1); [order[index], order[other]] = [order[other] as number, order[index] as number];
  }
  return order;
}

export interface TacticalBoundary {
  readonly startVitalityPotential: number;
  readonly endVitalityPotential: number;
  readonly nearRangeProgress: number;
  readonly terminal: -1 | 0 | 1;
  /**
   * Absent from **reward** on purpose -- time alive pays a healthy runner --
   * and read by the **discount**, which is not the same thing.
   *
   * **It had no producer at all until the persistence head landed.** The field
   * was declared, `collectPpoTrajectory` never wrote it, and its only appearance
   * in the tree was `tests/ppo.test.mjs` passing `durationSeconds: 600` to prove
   * the reward ignores it -- a declared optional nothing writes, which is the
   * same defect as a field nothing reads pointed the other way. It is written
   * now, and `generalizedAdvantages` is what reads it.
   *
   * **Optional here and required on `AdvantageStep`, which is not an
   * inconsistency but is worth naming.** This interface is the *reward's* view
   * of a boundary and `tacticalBoundaryReward` genuinely ignores the field, so
   * demanding it would make every reward test carry a number the function throws
   * away. The collector's record is a superset -- it also carries `startClock`,
   * `value`, `hidden` and the six per-head triples -- and it is a plain object in
   * `scripts/`, which `tsconfig.json`'s `include` does not cover, so **no static
   * check sees any of those fields.** `generalizedAdvantages`' refusal by name is
   * the only guard on the duration, and it is the reason that refusal exists
   * rather than a default of 1.
   */
  readonly durationSeconds?: number;
}

export function tacticalBoundaryReward(boundary: TacticalBoundary, progressLimit = 0.2): number {
  if (!Number.isFinite(progressLimit) || progressLimit < 0) throw new Error("progress reward limit must be non-negative");
  const progress = Math.max(-progressLimit, Math.min(progressLimit, boundary.nearRangeProgress));
  return boundary.terminal * 4 + (boundary.endVitalityPotential - boundary.startVitalityPotential) + progress;
}

export interface FrozenLeagueEntry { readonly id: string; readonly kind: "specialist" | "scripted-meta" | "random-meta" | "dagger" | "ppo";
  readonly digest: string }

/** A league is copied all the way down: training workers never receive a live champion array. */
export function freezeOpponentLeague(entries: readonly FrozenLeagueEntry[]): readonly Readonly<FrozenLeagueEntry>[] {
  const ids = new Set<string>();
  const frozen = entries.map((entry) => {
    if (!entry.id || !entry.digest || ids.has(entry.id)) throw new Error(`invalid or duplicate frozen league entry "${entry.id}"`);
    ids.add(entry.id); return Object.freeze({ ...entry });
  });
  return Object.freeze(frozen);
}

export function indexedLeagueOpponent(league: readonly FrozenLeagueEntry[], seed: number, jobIndex: number): FrozenLeagueEntry {
  if (!league.length) throw new Error("opponent league is empty");
  if (!Number.isSafeInteger(jobIndex) || jobIndex < 0) throw new Error(`invalid league job index ${jobIndex}`);
  let mixed = (seed ^ Math.imul(jobIndex + 1, 0x9e3779b1)) >>> 0;
  mixed = (mixed ^ (mixed >>> 16)) >>> 0; return league[mixed % league.length] as FrozenLeagueEntry;
}

export type PpoInitialization = "random" | "dagger";
export interface PpoArmJob { readonly index: number; readonly seed: number; readonly initialization: PpoInitialization;
  readonly solverSteps: number }
export function equalBudgetPpoArms(seed: number, solverSteps: number): readonly PpoArmJob[] {
  if (!Number.isSafeInteger(seed) || !Number.isSafeInteger(solverSteps) || solverSteps <= 0) throw new Error("invalid PPO arm budget");
  return Object.freeze((["random", "dagger"] as const).map((initialization, index) =>
    Object.freeze({ index, seed, initialization, solverSteps })));
}

export interface PpoOptimizerState { readonly update: number; readonly firstMoment: readonly number[];
  readonly secondMoment: readonly number[]; readonly consumedSolverSteps: number }
export function encodePpoResume(weights: readonly number[], optimizer: PpoOptimizerState, rows: readonly unknown[], training: unknown = null): Uint8Array {
  const finite = [...weights, ...optimizer.firstMoment, ...optimizer.secondMoment];
  if (finite.some((value) => !Number.isFinite(value)) || !Number.isSafeInteger(optimizer.update) || optimizer.update < 0 ||
      !Number.isSafeInteger(optimizer.consumedSolverSteps) || optimizer.consumedSolverSteps < 0) throw new Error("invalid PPO resume state");
  const stable = (value: unknown): string => {
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stable(entry)}`).join(",")}}`;
  };
  return new TextEncoder().encode(stable({ optimizer, rows, training, weights }));
}

export function selectPpoArm(rows: readonly { readonly split: string; readonly arm: PpoInitialization;
  readonly macro: number }[]): PpoInitialization {
  if (rows.some((row) => row.split === "test")) throw new Error("PPO arm selection cannot read test rows");
  const validation = rows.filter((row) => row.split === "validation");
  if (!validation.length) throw new Error("PPO arm selection requires validation rows");
  return [...validation].sort((a, b) => b.macro - a.macro || a.arm.localeCompare(b.arm))[0]!.arm;
}

export interface PpoHeadLayer { readonly rows: number; readonly columns: number; weights: number[]; bias: number[] }

/**
 * The categorical heads PPO trains, in output-contract order.
 *
 * **Six, and every size, offset and divisor below is derived from this array
 * rather than written beside it -- with one stated exception, which is the whole
 * trap the sixth head sets.** The entropy report was `entropy /
 * (rows.length * 2)` -- the head count spelled as a literal, correct for exactly
 * as long as `headGradient` was called twice per row -- and the only assertion
 * on it anywhere in the tree was `report.entropy > 0`, which any positive
 * divisor satisfies. Adding three heads without moving the 2 would have reported
 * two and a half times the mean per-head entropy under a name that says
 * otherwise, and nothing would have gone red.
 *
 * **The exception is any count of *contract outputs*.** For the five heads above
 * `persistence`, a head's logit count and its share of the 26-wide output
 * contract are the same number, because a categorical over n options occupies n
 * contract slots. The persistence head breaks the coincidence: eight logits over
 * `PERSISTENCE_SECONDS`, one contract slot. `train-ppo.mjs` therefore keeps
 * `HEAD_LOGITS` and `HEAD_CONTRACT_SLOTS` as two named tables, and a single one
 * summed over this array would have recorded `producedOutputs: 33` against a
 * contract of 26 while looking exactly as derived as it did at 25.
 *
 * **Persistence used to be excluded here, and the reason given was that it is a
 * *continuous* action** -- "a Gaussian or Beta head with a different
 * log-probability in the importance ratio, a different entropy term and a
 * different clipping story". That objection is sound and none of it reaches a
 * binned head, which reuses the categorical log-probability, the same ratio, the
 * same clipping and a `log k` entropy bound. `PERSISTENCE_SECONDS` in `meta.ts`
 * is the grid and carries why it is eight; `UNLEARNED_PERSISTENCE` stays, on the
 * grid, because `lookahead.ts` and `train-lookahead.mjs` still name it.
 *
 * **The reason the constant was safe was not the reason that was written down.**
 * A single persistence also made every boundary the same length, which is what
 * made a flat per-boundary gamma correct; `generalizedAdvantages` above carries
 * the measurement and what learning the persistence does to it.
 */
export const PPO_POLICY_HEADS = Object.freeze(["movement", "action", "effector", "target", "stance", "persistence"] as const);
export type PpoPolicyHeadName = typeof PPO_POLICY_HEADS[number];

export interface PpoTrainableHeads extends Record<PpoPolicyHeadName, PpoHeadLayer> { value: PpoHeadLayer }
export interface PpoTrainableNetwork extends PpoTrainableHeads {
  update?: PpoHeadLayer; reset?: PpoHeadLayer; candidate?: PpoHeadLayer;
}
/**
 * One option boundary: what was sampled from each head, what it was legal to
 * sample, and what it cost.
 *
 * **The value regression target is `valueTarget` and used to be `target`.** That
 * name is standard RL and it collided head-on with the aim head the moment there
 * was one: `row.target` would have meant "the value to regress toward" beside
 * `row.targetSupported` meaning "the aim indices that were legal". Renamed here
 * rather than spelling the aim head something it is not called anywhere else in
 * the contract.
 */
export interface PpoPolicyBoundary {
  /** True only for the first boundary after a recurrent-policy reset. */
  readonly episodeStart?: boolean;
  readonly input?: readonly number[]; readonly previousHidden?: readonly number[];
  readonly hidden: readonly number[];
  readonly movement: number; readonly action: number; readonly effector: number;
  readonly target: number; readonly stance: number; readonly persistence: number;
  readonly movementSupported: readonly number[]; readonly actionSupported: readonly number[];
  readonly effectorSupported: readonly number[]; readonly targetSupported: readonly number[];
  readonly stanceSupported: readonly number[]; readonly persistenceSupported: readonly number[];
  readonly oldMovementProbability: number; readonly oldActionProbability: number;
  readonly oldEffectorProbability: number; readonly oldTargetProbability: number;
  readonly oldStanceProbability: number; readonly oldPersistenceProbability: number;
  readonly oldValue: number; readonly valueTarget: number; readonly advantage: number;
}
/** What one head contributed to one boundary, read by name so a typo is a compile error. */
const HEAD_SAMPLE: Readonly<Record<PpoPolicyHeadName, (row: PpoPolicyBoundary) =>
Readonly<{ index: number; supported: readonly number[]; oldProbability: number }>>> = Object.freeze({
  movement: (row) => ({ index: row.movement, supported: row.movementSupported, oldProbability: row.oldMovementProbability }),
  action: (row) => ({ index: row.action, supported: row.actionSupported, oldProbability: row.oldActionProbability }),
  effector: (row) => ({ index: row.effector, supported: row.effectorSupported, oldProbability: row.oldEffectorProbability }),
  target: (row) => ({ index: row.target, supported: row.targetSupported, oldProbability: row.oldTargetProbability }),
  stance: (row) => ({ index: row.stance, supported: row.stanceSupported, oldProbability: row.oldStanceProbability }),
  // The index into `PERSISTENCE_SECONDS`, never the dwell in seconds: this is
  // the sample a categorical log-probability is taken at, and a head whose
  // "index" was a duration would renormalize over a support of eight numbers
  // that are not the eight indices its logits are.
  persistence: (row) => ({ index: row.persistence, supported: row.persistenceSupported,
    oldProbability: row.oldPersistenceProbability }),
});
export interface PpoUpdateReport { readonly policyLoss: number; readonly valueLoss: number;
  readonly entropy: number; readonly headEntropies: Readonly<Record<PpoPolicyHeadName, number>>;
  readonly recurrentGradientNorm: number;
  readonly unclippedGradientNorm: number; readonly clippedGradientNorm: number }

const distribution = (layer: PpoHeadLayer, hidden: readonly number[], supported: readonly number[]): number[] => {
  const logits = Array(layer.rows).fill(Number.NEGATIVE_INFINITY);
  for (const row of supported) { let value = layer.bias[row] as number;
    for (let column = 0; column < layer.columns; column += 1) value += (layer.weights[row * layer.columns + column] as number) * (hidden[column] as number);
    logits[row] = value; }
  const peak = Math.max(...supported.map((index) => logits[index] as number)); const masses = logits.map((value) => Math.exp(value - peak));
  const total = supported.reduce((sum, index) => sum + (masses[index] as number), 0);
  return masses.map((mass, index) => supported.includes(index) ? mass / total : 0);
};

/** One deterministic PPO epoch over the trainable policy/value heads. */
export function ppoHeadUpdate(heads: PpoTrainableNetwork, rows: readonly PpoPolicyBoundary[], seed: number,
  learningRate = 0.002, epsilon = 0.2, valueEpsilon = 0.2, entropyCoefficient = 0.01,
  gradientMaximum = 0.5): PpoUpdateReport {
  if (!rows.length) throw new Error("PPO update needs at least one option-boundary row");
  // Sizes and offsets accumulated over `PPO_POLICY_HEADS` rather than named one
  // by one: the two `offset` arguments, the value offset and the final descent
  // loop were four separate places that had to agree about the buffer's layout,
  // and three of them spelled it as arithmetic on two head sizes.
  const policyLayers = PPO_POLICY_HEADS.map((name) => heads[name]);
  const offsets: number[] = []; let cursor = 0;
  for (const layer of policyLayers) { offsets.push(cursor); cursor += layer.weights.length + layer.bias.length; }
  const valueOffset = cursor;
  const valueSize = heads.value.weights.length + heads.value.bias.length;
  const gradient = Array(valueOffset + valueSize).fill(0);
  const hiddenGradient = rows.map((row) => Array(row.hidden.length).fill(0));
  let policyLoss = 0; let valueLoss = 0; let entropy = 0;
  const headEntropyTotals = Object.fromEntries(PPO_POLICY_HEADS.map((name) => [name, 0])) as Record<PpoPolicyHeadName, number>;
  const headGradient = (layer: PpoHeadLayer, probabilities: readonly number[], supported: readonly number[], selected: number,
    oldProbability: number, advantage: number, offset: number, name: PpoPolicyHeadName): void => {
    const probability = probabilities[selected] as number; const ratio = probability / oldProbability;
    const clipped = Math.max(1 - epsilon, Math.min(1 + epsilon, ratio)); const usePolicyGradient = ratio * advantage <= clipped * advantage;
    policyLoss -= Math.min(ratio * advantage, clipped * advantage);
    const headEntropy = -supported.reduce((sum, index) => sum + (probabilities[index] as number) * Math.log(Math.max(1e-12, probabilities[index] as number)), 0);
    entropy += headEntropy; headEntropyTotals[name] += headEntropy;
    for (const output of supported) {
      const probabilityOutput = probabilities[output] as number;
      const policyDerivative = usePolicyGradient ? -advantage * ratio * ((output === selected ? 1 : 0) - probabilityOutput) : 0;
      const entropyDerivative = entropyCoefficient * probabilityOutput * (Math.log(Math.max(1e-12, probabilityOutput)) + headEntropy);
      const derivative = policyDerivative + entropyDerivative;
      const weightOffset = offset + output * layer.columns;
      for (let column = 0; column < layer.columns; column += 1) {
        gradient[weightOffset + column] += derivative * (rows[currentRow]!.hidden[column] as number);
        hiddenGradient[currentRow]![column] += derivative * (layer.weights[output * layer.columns + column] as number);
      }
      gradient[offset + layer.weights.length + output] += derivative;
    }
  };
  let currentRow = 0;
  for (const index of deterministicMinibatchOrder(rows.length, seed)) {
    currentRow = index; const row = rows[index] as PpoPolicyBoundary;
    PPO_POLICY_HEADS.forEach((name, head) => {
      const layer = heads[name]; const sample = HEAD_SAMPLE[name](row);
      const probabilities = distribution(layer, row.hidden, sample.supported);
      headGradient(layer, probabilities, sample.supported, sample.index, sample.oldProbability, row.advantage, offsets[head] as number, name);
    });
    let prediction = heads.value.bias[0] as number;
    for (let column = 0; column < heads.value.columns; column += 1) prediction += (heads.value.weights[column] as number) * (row.hidden[column] as number);
    const clippedPrediction = row.oldValue + Math.max(-valueEpsilon, Math.min(valueEpsilon, prediction - row.oldValue));
    const rawLoss = 0.5 * (prediction - row.valueTarget) ** 2; const clippedLoss = 0.5 * (clippedPrediction - row.valueTarget) ** 2;
    valueLoss += Math.max(rawLoss, clippedLoss); const derivative = rawLoss >= clippedLoss ? prediction - row.valueTarget :
      Math.abs(prediction - row.oldValue) <= valueEpsilon ? clippedPrediction - row.valueTarget : 0;
    for (let column = 0; column < heads.value.columns; column += 1) gradient[valueOffset + column] += derivative * (row.hidden[column] as number);
    for (let column = 0; column < heads.value.columns; column += 1) hiddenGradient[index]![column] +=
      derivative * (heads.value.weights[column] as number);
    gradient[valueOffset + heads.value.weights.length] += derivative;
  }
  const recurrentLayers = heads.update && heads.reset && heads.candidate ?
    [heads.update, heads.reset, heads.candidate] as const : null;
  const recurrentGradient = recurrentLayers ? recurrentLayers.map((layer) =>
    Array(layer.weights.length + layer.bias.length).fill(0)) : [];
  if (recurrentLayers) {
    if (rows.some((row) => !row.input || !row.previousHidden)) throw new Error("recurrent PPO rows require input and previousHidden");
    const units = rows[0]!.hidden.length; const truncate = 16;
    for (let chunkEnd = rows.length; chunkEnd > 0; chunkEnd -= truncate) {
      const chunkStart = Math.max(0, chunkEnd - truncate); let nextHiddenGradient = Array(units).fill(0);
      for (let index = chunkEnd - 1; index >= chunkStart; index -= 1) {
        const row = rows[index]!; const input = row.input!; const previous = row.previousHidden!; const joined = [...input, ...previous];
        const denseGate = (layer: PpoHeadLayer, values: readonly number[]) => Array.from({ length: layer.rows }, (_, output) =>
          (layer.bias[output] as number) + values.reduce((sum, value, column) =>
            sum + value * (layer.weights[output * layer.columns + column] as number), 0));
        const update = denseGate(heads.update!, joined).map((value) => 1 / (1 + Math.exp(-Math.max(-60, Math.min(60, value)))));
        const reset = denseGate(heads.reset!, joined).map((value) => 1 / (1 + Math.exp(-Math.max(-60, Math.min(60, value)))));
        const candidateInput = [...input, ...previous.map((value, unit) => value * (reset[unit] as number))];
        const candidate = denseGate(heads.candidate!, candidateInput).map(Math.tanh);
        const dh = hiddenGradient[index]!.map((value, unit) => value + (nextHiddenGradient[unit] as number));
        const daCandidate = dh.map((value, unit) => value * (update[unit] as number) * (1 - (candidate[unit] as number) ** 2));
        const daUpdate = dh.map((value, unit) => value * ((candidate[unit] as number) - (previous[unit] as number)) *
          (update[unit] as number) * (1 - (update[unit] as number)));
        const candidateInputGradient = Array(candidateInput.length).fill(0); const joinedGradient = Array(joined.length).fill(0);
        const accumulate = (layer: PpoHeadLayer, layerGradient: number[], activationGradient: readonly number[], values: readonly number[],
          inputGradient: number[]) => activationGradient.forEach((derivative, output) => {
            for (let column = 0; column < layer.columns; column += 1) {
              layerGradient[output * layer.columns + column] += derivative * (values[column] as number);
              inputGradient[column] += derivative * (layer.weights[output * layer.columns + column] as number);
            }
            layerGradient[layer.weights.length + output] += derivative;
          });
        accumulate(heads.candidate!, recurrentGradient[2]!, daCandidate, candidateInput, candidateInputGradient);
        const daReset = previous.map((value, unit) => (candidateInputGradient[input.length + unit] as number) * value *
          (reset[unit] as number) * (1 - (reset[unit] as number)));
        accumulate(heads.reset!, recurrentGradient[1]!, daReset, joined, joinedGradient);
        accumulate(heads.update!, recurrentGradient[0]!, daUpdate, joined, joinedGradient);
        nextHiddenGradient = previous.map((_, unit) => dh[unit]! * (1 - (update[unit] as number)) +
          (candidateInputGradient[input.length + unit] as number) * (reset[unit] as number) +
          (joinedGradient[input.length + unit] as number));
        // A rollout bundle is a fixed ordered concatenation of independent
        // bouts. The hidden state resets between them, so its adjoint must too:
        // carrying this vector into the prior row trains a transition that was
        // never executed and makes shard packing part of PPO semantics.
        if (row.episodeStart) nextHiddenGradient.fill(0);
      }
    }
  }
  const scale = 1 / rows.length; const recurrentAveraged = recurrentGradient.flat().map((value) => value * scale);
  const averaged = [...recurrentAveraged, ...gradient.map((value) => value * scale)];
  const recurrentGradientNorm = Math.hypot(...recurrentAveraged); const unclippedGradientNorm = Math.hypot(...averaged);
  const clippedGradient = clipGradientNorm(averaged, gradientMaximum); let at = 0;
  if (recurrentLayers) for (const layer of recurrentLayers) {
    layer.weights = layer.weights.map((value) => value - learningRate * (clippedGradient[at++] as number));
    layer.bias = layer.bias.map((value) => value - learningRate * (clippedGradient[at++] as number));
  }
  for (const layer of [...policyLayers, heads.value]) {
    layer.weights = layer.weights.map((value) => value - learningRate * (clippedGradient[at++] as number));
    layer.bias = layer.bias.map((value) => value - learningRate * (clippedGradient[at++] as number));
  }
  // `PPO_POLICY_HEADS.length` is exactly the number of `headGradient` calls per
  // row, which is what makes this the *mean per-head* entropy the field name
  // claims. It was a literal `2`.
  const headEntropies = Object.freeze(Object.fromEntries(PPO_POLICY_HEADS.map((name) =>
    [name, headEntropyTotals[name] / rows.length])) as Record<PpoPolicyHeadName, number>);
  return Object.freeze({ policyLoss: policyLoss / rows.length, valueLoss: valueLoss / rows.length,
    entropy: entropy / (rows.length * PPO_POLICY_HEADS.length), headEntropies, recurrentGradientNorm,
    unclippedGradientNorm, clippedGradientNorm: Math.hypot(...clippedGradient) });
}

export function decodePpoResume(bytes: Uint8Array): Readonly<{ weights: readonly number[]; optimizer: PpoOptimizerState;
  rows: readonly unknown[]; training: unknown }> {
  let parsed: unknown; try { parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch (error) { throw new Error("PPO resume is not valid UTF-8 JSON", { cause: error }); }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") throw new Error("PPO resume root must be an object");
  const state = parsed as { weights?: unknown; optimizer?: unknown; rows?: unknown; training?: unknown };
  if (!Array.isArray(state.weights) || !state.optimizer || typeof state.optimizer !== "object" || !Array.isArray(state.rows)) {
    throw new Error("PPO resume is missing weights, optimizer or report rows");
  }
  const optimizer = state.optimizer as PpoOptimizerState;
  encodePpoResume(state.weights as number[], optimizer, state.rows, state.training ?? null);
  return Object.freeze({ weights: Object.freeze([...(state.weights as number[])]), optimizer: Object.freeze({ ...optimizer,
    firstMoment: Object.freeze([...optimizer.firstMoment]), secondMoment: Object.freeze([...optimizer.secondMoment]) }),
    rows: Object.freeze([...state.rows]), training: state.training ?? null });
}
