import type { FighterView, Intent } from "../mind.ts";
import { mulberry32 } from "../rng.ts";
import { forward, netScratch, netSize, type NetLayout } from "./neural-net.ts";
import {
  PILOT_FEATURE_COUNT, PILOT_FEATURE_VERSIONS_READ, PILOT_FEATURES_DEFAULT,
  pilotFeatureCount, pilotFeatures, pilotTrace,
  type Pilot, type PilotHook, type PilotReading,
} from "./pilot.ts";
import { GOLEM_REWARD, type RewardTable } from "./reward.ts";
import { POLICY_WEIGHTS } from "./policy-weights.ts";
import {
  COMMAND_AXES, COMMAND_GATES, COMMAND_RANGES, GOLEM_TACTICS_V4, freshCommand, golemDriven,
  type DrivenTactics, type GolemDriven, type StyleCommand,
} from "./tactics-v4.ts";

/**
 * The golem's fitted mind over the fourth executor: `golem-policy`. Session 13 of the style set.
 *
 * ## What is different about this one
 *
 * Every learned mind before it chose a *name*. `golem-neural` scored eight, `golem-learner`
 * fifteen, and both were bounded above by the vocabulary somebody else had frozen: Session 12
 * measured that ceiling directly, transcribing a hand-coded style onto the continuous surface and
 * finding it moved four of nine axes and committed at swing 1.000 in 1,452 of 1,452 gates. This
 * one writes the nine numbers itself.
 *
 * ## The head, and why it is shaped like this
 *
 * Twelve outputs. The first nine are the **means** of nine independent Gaussians, in a normalised
 * coordinate where each axis runs -1 to +1 across its whole published range; the last three are
 * the **logits** of three independent Bernoullis, which is what `commit`, `abort` and `parry` are.
 * The spread of the nine is `logSigma`, one number an axis, **state-independent**: it is a
 * parameter of the policy and not a function of what it is looking at. That is the standard
 * choice for on-policy control and it is the right one here for a reason particular to this
 * arena -- a state-dependent sigma can collapse on the states it visits most, and the states this
 * policy visits most at the start of a fit are the ones where nothing is happening.
 *
 * **A sample is clipped, not squashed.** The Gaussian is unbounded, the axis is not, and the two
 * usual answers are a `tanh` squash with its log-determinant correction or a clip. This ships the
 * clip: the density the trainer differentiates is the density of the *raw* draw, so the surrogate
 * is exact, and the executor's own clamp -- which Session 12 built and counted -- is what makes
 * the command legal. The alternative was rejected because a squash makes the log-probability a
 * function of the action's own value, and the one thing this file must not do is make the number
 * the trainer reads disagree with the number the body did.
 *
 * ## What the mind may not do
 *
 * It reads `pilotFeatures` and nothing else: the reading, the view, no module ids, no capability
 * the executor does not publish. No learning inside a bout, no memory across one. The shipped
 * mind plays the **mean** -- `sample` false -- so a bout under a seed is the bout; the trainer's
 * rollouts play the draw, out of a stream of its own, so that at `sample` false nothing is drawn
 * at all and the greedy mind is byte for byte the mind it would be if this argument did not
 * exist. That is `golem-learner`'s rule, kept.
 *
 * **That default was re-decided on numbers in Session 14 rather than inherited, and the two
 * instruments disagreed.** Against a mirrored idle dummy the same weights *drawn* finish 36 of 208
 * bouts where the mean finishes 10 -- three and a half times as often, and the same ordering holds
 * for every fit this programme has measured. Against the five hand-coded minds of the rating
 * league, over 400 bouts a contender under common random numbers, the draw is **worse** than the
 * mean by 0.0355 of a bar (+-0.0305, d -0.114), and the mean is the read that draws level with
 * `golem-driver`. Those are not in conflict: the draw's extra spread occasionally reaches a strike
 * band the mean never enters, which is what a motionless dummy rewards, and it costs bar against
 * an opponent that punishes a bad command. The rating is the criterion the set selects on and the
 * probe is a tripwire, so the mean ships -- and what the probe is saying is that the mean still
 * does not reach, which is a fit that is not finished rather than a reason to ship its noise.
 *
 * **Version 2** is Session 14's, and the thing it refuses is subtle enough to be worth naming: the
 * network did not change, the columns did not change, and a version-1 table would load and run.
 * What changed is `COMMAND_RANGES.standOff`, from `[0, 3]` to `[0, 2]`, and every one of these
 * weights is read through `commandFromAction`, which decodes an axis against the midpoint and the
 * half-width of its range. So a version-1 number means a different stand-off under this build than
 * it meant under the one that fitted it -- a table that still loads and quietly fights at a
 * different distance, which is exactly the failure a version is for.
 *
 * ## Version 3, and the three shapes the head may now take
 *
 * Session 09 of the learn set. A version-3 table carries two more fields -- `head` and `sigma` --
 * and a version-2 table is read as `{head: "gaussian", sigma: "constant"}`, which is the only shape
 * this file had. Both versions load: the shipped mind is a version-2 table and the whole point of
 * this session is to run the alternatives as *arms* against it rather than to replace it.
 *
 * - **`head: "mixed"`** puts a nine-bin categorical on `standOff` and `advance` and leaves the
 *   other seven Gaussian. Those two are the axes that decide range, and Session 07's probe found
 *   the bottom third of `standOff` to be a physical floor the axis cannot get under -- so a
 *   Gaussian spends density on distances that do not exist, and a categorical can put mass on two
 *   separated distances at once, which no unimodal density can express at all.
 * - **`head: "beta"`** puts a Beta on the three axes whose range is `[0, 1]` -- `targetHeight`,
 *   `swing` and `bite`. Their draw is *clipped* under a Gaussian, and a clip piles probability onto
 *   the two endpoints while the density the trainer differentiates says otherwise; a Beta is
 *   supported exactly on the interval, so the number the surrogate reads is the number the body
 *   did. Both shape parameters are `1 + softplus(z)`, which keeps the density bounded and unimodal:
 *   the unconstrained Beta's U-shape puts unbounded density at the ends, which is the shape a clip
 *   was already producing by accident.
 * - **`sigma: "state"`** makes each Gaussian axis's spread an output of the network rather than a
 *   parameter of the policy, squashed into the same `[floor, roof]` the fit clamps the constant one
 *   into. The module note above argues *against* this, on the grounds that a state-dependent spread
 *   can collapse on the states the policy visits most and the states it visits most early are the
 *   ones where nothing is happening. That argument is still the reason it is not the default; it is
 *   also an argument that was never measured, which is what makes it an arm.
 *
 * **The action vector does not change shape.** It is nine axis values in the normalised coordinate
 * and three gate bits under every head, so `commandFromAction`, `ACTION_WIDTH`, the rollout pack's
 * stride and every recorded run stay exactly as they are. What changes is the width of the
 * *network's* output, which is `HeadSpec.width`, and a table declares its own.
 */
export const POLICY_VERSION = 3;

/** Every table version this build can drive a mind under. Ordered, oldest first. */
export const POLICY_VERSIONS_READ: readonly number[] = Object.freeze([2, 3]);

/** Nine means and three gate logits, in `COMMAND_AXES` then `COMMAND_GATES` order. */
export const ACTION_AXES = COMMAND_AXES.length;
export const ACTION_GATES = COMMAND_GATES.length;
export const ACTION_WIDTH = ACTION_AXES + ACTION_GATES;

// -------------------------------------------------------------------------------- the head's shape

/** Which family an axis's distribution comes from under a given head. */
export type AxisKind = "gaussian" | "categorical" | "beta";
/** The three heads a version-3 table may declare. `gaussian` is version 2's, unchanged. */
export type HeadKind = "gaussian" | "mixed" | "beta";
/** Whether the Gaussian spread is a parameter of the policy or an output of the network. */
export type SigmaKind = "constant" | "state";

/**
 * How many bins a categorical axis is cut into: nine, one for each ninth of the normalised range.
 *
 * Nine is a number with two justifications and no tuning. It is the count of axes, so a reader who
 * sees a 9 in this file is already used to it meaning "one per axis" and has to be told it does
 * not; and Session 07's probe found the bottom **third** of `standOff` to be a physical floor, so
 * a bin count that is a multiple of three puts the boundary of that dead region on a bin edge
 * rather than through the middle of one. A finer grid would spend more of the head's outputs
 * distinguishing distances the body cannot tell apart -- Session 07 measured the viable pool's
 * reach spanning a factor of 3.4, which is the scale at which a distance stops meaning one thing.
 */
export const HEAD_BINS = 9;

/** The axes `head: "mixed"` makes categorical: the two that decide range. */
export const MIXED_AXES: readonly string[] = Object.freeze(["standOff", "advance"]);

/** The axes `head: "beta"` makes Beta: the three whose published range is exactly `[0, 1]`. */
export const BETA_AXES: readonly string[] = Object.freeze(["targetHeight", "swing", "bite"]);

/**
 * The squash a state-dependent spread is read through, in log space.
 *
 * The same two numbers `ppoFit` clamps the *constant* spread into, so that the two spread models
 * are answerable to the same floor and the same roof and an arm that changes one changes only one
 * thing. A floor at all is what stops a policy that has found something from turning deterministic
 * and stopping the exploration that found it; a roof is what stops the entropy bonus from paying
 * for noise forever.
 */
export const SIGMA_FLOOR = -3;
export const SIGMA_ROOF = 0.5;

/**
 * Where every parameter of the head lives in the network's output row.
 *
 * The row is laid out axis by axis in `COMMAND_AXES` order -- one output for a Gaussian mean,
 * `HEAD_BINS` logits for a categorical, two shape logits for a Beta -- then the three gate logits,
 * then, under `sigma: "state"`, nine more for the spreads. A Gaussian head with a constant spread
 * is nine plus three, which is `ACTION_WIDTH`, which is what version 2 was; that is not a
 * coincidence to be relied on anywhere except here, where it is what makes the shipped table load.
 */
export interface HeadSpec {
  readonly head: HeadKind;
  readonly sigma: SigmaKind;
  /** One entry an axis, in `COMMAND_AXES` order. */
  readonly kinds: readonly AxisKind[];
  /** Where each axis's parameters begin in the output row, and how many outputs it owns. */
  readonly at: readonly number[];
  readonly span: readonly number[];
  /** Where the three gate logits begin. */
  readonly gateAt: number;
  /** Where the nine state spreads begin, or -1 under a constant spread. */
  readonly sigmaAt: number;
  /** The squash a state-dependent spread is read through. */
  readonly floor: number;
  readonly roof: number;
  /** The network's output width under this head. */
  readonly width: number;
}

const HEAD_SPECS = new Map<string, HeadSpec>();

/**
 * The head a table declares, built once and shared.
 *
 * Cached by name because it is immutable, small, and read on the hot path of every ask: a fit
 * builds one per shard and a bout builds one per mind, and neither should be allocating nine
 * arrays to find out where a Gaussian's mean is.
 */
export function headSpecOf(
  head: HeadKind = "gaussian", sigma: SigmaKind = "constant",
  floor: number = SIGMA_FLOOR, roof: number = SIGMA_ROOF,
): HeadSpec {
  const key = `${head}/${sigma}/${floor}/${roof}`;
  const found = HEAD_SPECS.get(key);
  if (found !== undefined) return found;
  const kinds: AxisKind[] = COMMAND_AXES.map((name): AxisKind => {
    if (head === "mixed" && MIXED_AXES.includes(name)) return "categorical";
    if (head === "beta" && BETA_AXES.includes(name)) return "beta";
    return "gaussian";
  });
  const at: number[] = [];
  const span: number[] = [];
  let width = 0;
  for (const kind of kinds) {
    const n = kind === "categorical" ? HEAD_BINS : kind === "beta" ? 2 : 1;
    at.push(width);
    span.push(n);
    width += n;
  }
  const gateAt = width;
  width += ACTION_GATES;
  const sigmaAt = sigma === "state" ? width : -1;
  if (sigma === "state") width += ACTION_AXES;
  const spec: HeadSpec = Object.freeze({
    head, sigma, kinds: Object.freeze(kinds), at: Object.freeze(at), span: Object.freeze(span),
    gateAt, sigmaAt, floor, roof, width,
  });
  HEAD_SPECS.set(key, spec);
  return spec;
}

/** Version 2's head: nine Gaussian means, three gate logits, a spread that is a parameter. */
export const GAUSSIAN_HEAD: HeadSpec = headSpecOf("gaussian", "constant");

/** The head a table declares, defaulted the way a version-2 table is read. */
export function headSpecOfTable(table: {
  readonly head?: HeadKind; readonly sigma?: SigmaKind;
  readonly sigmaFloor?: number; readonly sigmaRoof?: number;
}): HeadSpec {
  return headSpecOf(
    table.head ?? "gaussian", table.sigma ?? "constant",
    table.sigmaFloor ?? SIGMA_FLOOR, table.sigmaRoof ?? SIGMA_ROOF,
  );
}

/**
 * The shape every table this build reads has to have: two hidden layers of 256, tanh.
 *
 * Wider than anything this repository has fitted, on the owner's instruction and against the
 * evidence: `golem-neural`'s 2x64 over eight names could not be moved by an evolution strategy,
 * and `golem-learner`'s 2x64 over fifteen was stopped before its fit because the objective was
 * flat. Neither failure was diagnosed as width, and this is not a claim that width was the
 * problem -- it is the one free parameter that was never tried, taken while the vocabulary and
 * the signal were both being replaced.
 */
export const POLICY_LAYOUT: NetLayout = Object.freeze({
  inputs: PILOT_FEATURE_COUNT, hidden: Object.freeze([256, 256]), outputs: ACTION_WIDTH,
});

/**
 * The critic: the same width, one output, its own weights.
 *
 * Separate rather than a second head on a shared trunk, which is the other standard choice. The
 * reason is the one this arena has already demonstrated: the value of a state here is dominated
 * by *whose body can finish a bout at all* -- Session 08 found a style is worth six times as much
 * on a long maul as on a long blade -- and a trunk shared with the actor would spend its capacity
 * learning that before it learned anything about acting. The critic does not ship; it is a
 * training artifact and lives in the run's checkpoint.
 */
export const VALUE_LAYOUT: NetLayout = Object.freeze({
  inputs: PILOT_FEATURE_COUNT, hidden: Object.freeze([256, 256]), outputs: 1,
});

/**
 * The layout a table has, given the columns it reads and the head it declares.
 *
 * `POLICY_LAYOUT` and `VALUE_LAYOUT` above are what these return for version-1 columns under the
 * Gaussian head, and they stay exported under their own names because the shipped table is exactly
 * that and a reader should not have to call a function to find out the shipped shape. Everything
 * Session 09 varies -- nine more columns, a wider output row, a critic that reads both bodies --
 * moves the *numbers* in a layout and never the two hidden 256s, which is what makes an arm's
 * checkpoint comparable to the control's.
 */
export function policyLayout(features: number, spec: HeadSpec = GAUSSIAN_HEAD): NetLayout {
  return Object.freeze({
    inputs: pilotFeatureCount(features), hidden: POLICY_LAYOUT.hidden, outputs: spec.width,
  });
}

/**
 * The critic's layout, doubled at `central` because a central critic reads both sides' columns.
 *
 * Training only. A value function is not part of the shipped artifact, so it may read things the
 * actor may not -- the opponent's own pilot view, here -- without breaking the rule that the mind
 * reads `pilotFeatures` and nothing else. What it buys is a baseline that knows which of the two
 * bodies is about to land, which is variance the actor's own advantage no longer has to carry.
 */
export function valueLayout(features: number, central = false): NetLayout {
  return Object.freeze({
    inputs: pilotFeatureCount(features) * (central ? 2 : 1), hidden: VALUE_LAYOUT.hidden, outputs: 1,
  });
}

/**
 * Running mean and variance over the observation, frozen into the artifact.
 *
 * A policy that read unnormalised features on the host that fitted it and normalised ones on the
 * host that runs it is not the same policy, and this repository's contract is that a bout under a
 * seed is the bout. So the statistics are part of the table, not part of the trainer: they are
 * accumulated over the rollouts, written into the module, and applied identically wherever the
 * mind loads. `count` is carried so that a resumed run continues the same accumulation rather
 * than restarting it.
 */
export interface Normalisation {
  readonly count: number;
  readonly mean: readonly number[];
  readonly variance: readonly number[];
}

export interface PolicyWeights {
  /** `POLICY_VERSION` of the build that wrote the table. */
  readonly version: number;
  /** `PILOT_FEATURES_VERSION` the table was fitted on. */
  readonly features: number;
  readonly layout: NetLayout;
  readonly seed: number;
  readonly date: string;
  /** How the fit was run, and what it saw. */
  readonly iterations: number;
  readonly bouts: number;
  readonly steps: number;
  /** The knobs of the return, in the header because a policy fitted under others is a different
   *  policy and a reader has no other way to tell. */
  readonly halfLife: number;
  readonly lambda: number;
  readonly clip: number;
  readonly entropy: number;
  readonly reward: RewardTable;
  readonly normalisation: Normalisation;
  /** Who the fit sparred with -- null is mirrored self-play -- and which armed hands its pool was
   *  filtered to, empty being all of them. A mind fitted against one opponent on one weapon class
   *  is a different mind, and the header is the only place a reader can be told. */
  readonly opponent: string | null;
  readonly terminals: readonly string[];
  /** The confirmation, and what it was measured against. */
  readonly score: number;
  readonly baselines: Readonly<Record<string, number>>;
  /**
   * The shape of the head, and of its spread. Absent on a version-2 table, which is read as the
   * Gaussian head with a constant spread -- the only shape this file had before Session 09.
   */
  readonly head?: HeadKind;
  readonly sigma?: SigmaKind;
  /** The squash a state-dependent spread was fitted through, absent meaning this build's own. */
  readonly sigmaFloor?: number;
  readonly sigmaRoof?: number;
  /** One log-standard-deviation an axis, in the normalised coordinate. Under `sigma: "state"` it
   *  is what the fit's constant spread reached and the mind does not read it. */
  readonly logSigma: readonly number[];
  readonly weights: readonly number[];
}

/**
 * Refuse a table this build cannot read, by name; return it otherwise.
 *
 * Nine refusals: `checkLearnerWeights`'s four, the two this head had that a softmax did not -- a
 * `logSigma` of the wrong length is a table for a different action space and a normalisation of
 * the wrong length is a table for different columns -- and three Session 09 added, which are the
 * three ways a table can name a shape this build does not have.
 *
 * **The two version checks are membership rather than equality**, and that is the change with
 * teeth. Two policy versions and two observation versions are readable at once *on purpose*: the
 * shipped mind is a version-2 table over version-1 columns and every arm of Session 09 that moves
 * either number has to be run beside it, in one process, in one evaluation call. What still stops
 * a table meaning the wrong thing is that the layout is checked against the shape its own declared
 * version and head imply, so a version-1 table -- whose `standOff` decodes against a different
 * range -- is refused for being version 1 and a version-3 table that names a head it was not
 * fitted under is refused for the width that head implies.
 */
export function checkPolicyWeights(table: PolicyWeights): PolicyWeights {
  if (!POLICY_VERSIONS_READ.includes(table.version)) {
    throw new Error(`policy weights are version ${table.version}; this build reads version ${POLICY_VERSIONS_READ.join(" and ")}`);
  }
  if (!PILOT_FEATURE_VERSIONS_READ.includes(table.features)) {
    throw new Error(`policy weights read feature version ${table.features}; this build reads feature version ${PILOT_FEATURE_VERSIONS_READ.join(" and ")}`);
  }
  if (table.version < 3 && (table.head !== undefined || table.sigma !== undefined)) {
    throw new Error(`policy weights are version ${table.version} and name a head; a head is version 3 and later`);
  }
  const head = table.head ?? "gaussian";
  if (head !== "gaussian" && head !== "mixed" && head !== "beta") {
    throw new Error(`policy weights name head "${head}"; this build reads gaussian, mixed and beta`);
  }
  const sigma = table.sigma ?? "constant";
  if (sigma !== "constant" && sigma !== "state") {
    throw new Error(`policy weights name spread "${sigma}"; this build reads constant and state`);
  }
  const want = policyLayout(table.features, headSpecOfTable(table));
  const layout = table.layout;
  if (layout.inputs !== want.inputs || layout.outputs !== want.outputs
    || layout.hidden.length !== want.hidden.length
    || layout.hidden.some((n, i) => n !== want.hidden[i])) {
    throw new Error(`policy weights are laid out ${JSON.stringify(layout)}; a ${head} head with a ${sigma} spread on feature version ${table.features} reads ${JSON.stringify(want)}`);
  }
  if (table.weights.length !== netSize(layout)) {
    throw new Error(`policy weights hold ${table.weights.length} numbers; the layout wants ${netSize(layout)}`);
  }
  if (table.logSigma.length !== ACTION_AXES) {
    throw new Error(`policy weights carry ${table.logSigma.length} spreads; the action has ${ACTION_AXES} continuous axes`);
  }
  const columns = pilotFeatureCount(table.features);
  const norm = table.normalisation;
  if (norm.mean.length !== columns || norm.variance.length !== columns) {
    throw new Error(`policy normalisation is ${norm.mean.length}/${norm.variance.length} wide; the columns are ${columns}`);
  }
  return table;
}

// -------------------------------------------------------------------- the normalised coordinate

/** The centre and half-width of every axis, so a normalised -1..+1 maps onto its published range. */
const AXIS_CENTRE = Float64Array.from(COMMAND_AXES, (name) => {
  const [low, high] = COMMAND_RANGES[name];
  return (low + high) / 2;
});
const AXIS_HALF = Float64Array.from(COMMAND_AXES, (name) => {
  const [low, high] = COMMAND_RANGES[name];
  return (high - low) / 2;
});

const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x);

/**
 * Write a sampled action into a command.
 *
 * The nine are clipped to the axis, which is where an unbounded draw meets a bounded body; the
 * three gates are already zero or one. The executor clamps again and counts it, and a run whose
 * refusal counters are not zero has a bug here rather than a policy that is exploring.
 */
export function commandFromAction(action: Float64Array, into: StyleCommand): StyleCommand {
  for (let j = 0; j < ACTION_AXES; j += 1) {
    into[COMMAND_AXES[j]] = AXIS_CENTRE[j] + AXIS_HALF[j] * clamp(action[j], -1, 1);
  }
  for (let j = 0; j < ACTION_GATES; j += 1) into[COMMAND_GATES[j]] = action[ACTION_AXES + j] > 0.5 ? 1 : 0;
  return into;
}

/**
 * Below this a fitted variance means the column never moved, and the fit's own first layer never
 * took a gradient through it. Zero is what the fit saw; zero is what inference reads.
 *
 * **The clip below was written as the guard against a constant column and is the mechanism of the
 * defect instead.** The divisor is `sqrt(variance + 1e-8)`, so a variance of exactly zero divides
 * by a ten-thousandth and the clip is reached at a raw difference of a quarter of a millimetre.
 * The shipped table was accumulated over 11,390,700 observations of *mirrored* self-play and seven
 * of its seventy-one columns came back at exactly zero -- `bias`, `reachEdge`, the two `buckler`
 * one-hots, the two `locomotion` health slots and `interceptWall`. A column that is identically
 * zero takes no gradient, so the 256 first-layer weights reading each of them are still at their
 * Glorot draw: that layer's rms is 0.07846 against an initialisation rms of 0.07821, and column
 * nine's own is 0.07851. A mirror has no reach edge; a random viable pair does, and measured over
 * 9658 asks of sixteen such bouts `reachEdge` is off its mean on 88.9 % of them and saturates at
 * +-5 on every one of those, contributing a pre-activation sd of 0.393 against the sixty-four live
 * columns' 0.627.
 *
 * **Zero is not a choice among several; it is the value the fit itself saw.** On every one of
 * those 11,390,700 rows the raw value equalled the mean, so `(raw - mean) / 1e-4` was exactly 0.
 * The floor is therefore provably a no-op on every observation the fit was taken over, and differs
 * only on inputs the fit never saw -- which is the whole of the defect. That is why this is a
 * correctness fix rather than a change of policy, why no weight and no number of the shipped table
 * moved with it, and why `checkPolicyWeights` does not refuse a zero variance: the shipped table
 * has seven of them and has to keep loading.
 *
 * **What it was worth was measured, and it is a wash.** Two arms in one paired rating over 600
 * random viable bouts at seed 20260906: the floored reader is +0.0080 +-0.0227 of a bar margin
 * against the saturating one, d +0.028 where the session's bar asked +0.10. On the mirror it is
 * *identically* zero, bout for bout, which is what the argument above predicts.
 * `docs/measurements.md` under Session 03 of the signal set carries the table.
 */
export const DEAD_VARIANCE = 1e-6;

/**
 * A variance on its way into a table, floored.
 *
 * `normalise` floors at read time, because the shipped table is not rewritten and a reader is the
 * only place its seven dead columns can be repaired. A *writer* floors as well so that the next
 * table to ship one says so on its face, and so that "this column is dead" is one predicate rather
 * than a constant every later reader has to remember to apply for themselves.
 */
export function flooredVariance(variance: number): number {
  return variance < DEAD_VARIANCE ? 0 : variance;
}

/**
 * The observation, normalised and clipped.
 *
 * Clipped at five standard deviations, which is the usual guard and matters here because a column
 * that was constant over the rollouts -- and several are, on a body that has no spare hand -- has
 * a variance near zero and would otherwise turn one unusual body into an enormous input. A column
 * *below* `DEAD_VARIANCE` is not clipped but zeroed, for the argument written there: the clip is
 * what a dead column saturates into rather than what saves it from doing so.
 */
export function normalise(raw: Float64Array, norm: Normalisation, into: Float64Array): Float64Array {
  for (let k = 0; k < raw.length; k += 1) {
    if (norm.variance[k] < DEAD_VARIANCE) { into[k] = 0; continue; }
    const sd = Math.sqrt(norm.variance[k] + 1e-8);
    into[k] = clamp((raw[k] - norm.mean[k]) / sd, -5, 5);
  }
  return into;
}

/** A normalisation that does nothing, which is what an unfitted table carries. */
export function freshNormalisation(width = PILOT_FEATURE_COUNT): Normalisation {
  // Through the floor rather than a bare 1, so that the one table in the tree nobody fitted cannot
  // become the one table whose columns a reader is entitled to zero.
  return {
    count: 0, mean: new Array(width).fill(0), variance: new Array(width).fill(flooredVariance(1)),
  };
}

// -------------------------------------------------------------------------------- the distribution

const LOG_2PI = Math.log(2 * Math.PI);
const LOG_2 = Math.LN2;
const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x));
/** `log(1 + e^x)`, straightened above 30 where the exponential overflows and the answer is `x`. */
const softplus = (x: number): number => (x > 30 ? x : Math.log1p(Math.exp(x)));

/** The centre of bin `b`, in the normalised -1..+1 coordinate. */
export function binCentre(b: number): number {
  return -1 + (2 * b + 1) / HEAD_BINS;
}

/** Which bin a normalised axis value falls in; the two ends are closed. */
export function binOf(a: number): number {
  const b = Math.floor(((clamp(a, -1, 1) + 1) / 2) * HEAD_BINS);
  return b < 0 ? 0 : b > HEAD_BINS - 1 ? HEAD_BINS - 1 : b;
}

// The Lanczos approximation, g = 7, n = 9 -- accurate to about fifteen digits over the range a
// Beta's shape parameters can reach here, which is 1 upward.
const LANCZOS: readonly number[] = Object.freeze([
  676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
  12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
]);

/** `log Gamma(x)`, which is what a Beta's normalising constant is made of. */
export function lgamma(x: number): number {
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
  const z = x - 1;
  let a = 0.99999999999980993;
  for (let i = 0; i < LANCZOS.length; i += 1) a += LANCZOS[i] / (z + i + 1);
  const t = z + LANCZOS.length - 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a);
}

/** `d/dx log Gamma(x)`: recurred up to 6 and then the asymptotic series, which is the usual pair. */
export function digamma(x: number): number {
  let v = x;
  let r = 0;
  while (v < 6) { r -= 1 / v; v += 1; }
  const f = 1 / (v * v);
  return r + Math.log(v) - 0.5 / v
    + f * (-1 / 12 + f * (1 / 120 + f * (-1 / 252 + f * (1 / 240 + f * (-1 / 132)))));
}

/** `d^2/dx^2 log Gamma(x)`, which the Beta's *entropy* gradient needs and its score does not. */
export function trigamma(x: number): number {
  let v = x;
  let r = 0;
  while (v < 6) { r += 1 / (v * v); v += 1; }
  const f = 1 / (v * v);
  return r + (1 / v) * (1 + 0.5 / v + f * (1 / 6 + f * (-1 / 30 + f * (1 / 42 + f * (-1 / 30)))));
}

/** A standard normal from two uniforms, Box-Muller, exactly the pair the Gaussian head drew. */
function stdNormal(random: () => number): number {
  const u1 = Math.max(random(), 1e-12);
  const u2 = random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/**
 * A Gamma draw at unit scale, Marsaglia and Tsang's method.
 *
 * Valid for a shape of 1 or more, which is all this file ever asks for: both of a Beta's shape
 * parameters here are `1 + softplus`, and the reason they are is precisely that the method below
 * -- and the density it is drawing from -- both stop being well behaved under 1.
 */
function gammaDraw(shape: number, random: () => number): number {
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (let tries = 0; tries < 256; tries += 1) {
    let x = 0;
    let v = 0;
    do { x = stdNormal(random); v = 1 + c * x; } while (v <= 0);
    v = v * v * v;
    const u = Math.max(random(), 1e-12);
    if (Math.log(u) < 0.5 * x * x + d - d * v + d * Math.log(v)) return d * v;
  }
  return d;
}

/** `log Beta(x; alpha, beta)` on the unit interval. */
function betaLogPdf(x: number, alpha: number, beta: number): number {
  return (alpha - 1) * Math.log(x) + (beta - 1) * Math.log1p(-x)
    + lgamma(alpha + beta) - lgamma(alpha) - lgamma(beta);
}

/** The differential entropy of a Beta, in nats, on the unit interval. */
function betaEntropy(alpha: number, beta: number): number {
  return lgamma(alpha) + lgamma(beta) - lgamma(alpha + beta)
    - (alpha - 1) * digamma(alpha) - (beta - 1) * digamma(beta)
    + (alpha + beta - 2) * digamma(alpha + beta);
}

/** The log of a categorical axis's normaliser, read off the head in place. */
function logSumExpAt(head: Float64Array, at: number): number {
  let top = -Infinity;
  for (let k = 0; k < HEAD_BINS; k += 1) if (head[at + k] > top) top = head[at + k];
  let sum = 0;
  for (let k = 0; k < HEAD_BINS; k += 1) sum += Math.exp(head[at + k] - top);
  return top + Math.log(sum);
}

/** A categorical axis's probabilities, written into a nine-long scratch. */
function softmaxAt(head: Float64Array, at: number, into: Float64Array): Float64Array {
  const lse = logSumExpAt(head, at);
  for (let k = 0; k < HEAD_BINS; k += 1) into[k] = Math.exp(head[at + k] - lse);
  return into;
}

// Scratches. Every public function below runs to completion before the next one starts -- the
// trainer's inner loop is `actionLogProb`, then `logProbGrad`, then `entropyGrad`, then
// `actionEntropy`, in that order and never nested -- so one of each is enough, and one of each is
// what keeps a fit from allocating twelve arrays per sample per epoch.
const SIGMA_SCRATCH = new Float64Array(ACTION_AXES);
const BIN_SCRATCH = new Float64Array(HEAD_BINS);

/**
 * The nine spreads this ask is drawn at, in log space.
 *
 * Under `sigma: "constant"` they are the policy's own nine parameters, copied. Under
 * `sigma: "state"` they are nine of the network's outputs squashed into `[floor, roof]` by a
 * sigmoid -- the *same* interval the fit clamps the constant spread into, so that the two spread
 * models are answerable to the same bounds and the arm is one change. A squash rather than a clamp
 * because a clamp has zero gradient outside its range and a spread that walked out of it would
 * never walk back.
 */
export function axisLogSigma(
  head: Float64Array, logSigma: Float64Array, spec: HeadSpec, into: Float64Array,
): Float64Array {
  if (spec.sigmaAt < 0) {
    for (let j = 0; j < ACTION_AXES; j += 1) into[j] = logSigma[j];
    return into;
  }
  const span = spec.roof - spec.floor;
  for (let j = 0; j < ACTION_AXES; j += 1) into[j] = spec.floor + span * sigmoid(head[spec.sigmaAt + j]);
  return into;
}

/**
 * Draw an action from the head, and return its log-probability.
 *
 * A Gaussian axis is `mu + sigma * z` with `z` a standard normal from the Box-Muller transform of
 * two uniforms; the three gates are coin flips at the head's own sigmoid; and the two shapes
 * Session 09 added draw the way their families do -- a categorical by inverse transform on one
 * uniform, a Beta as the ratio of two Gamma draws. The log-probability returned is of the raw
 * draw, before any clip -- see the module note on why -- and for a Beta there is nothing to clip,
 * which is the point of it.
 *
 * **Under the Gaussian head this is byte for byte the function that shipped.** Every axis takes
 * exactly two uniforms in exactly the same order and every gate takes one, so a seeded run of the
 * shipped mind draws the same numbers it drew before this session touched the file.
 */
export function sampleAction(
  head: Float64Array, logSigma: Float64Array, random: () => number, into: Float64Array,
  spec: HeadSpec = GAUSSIAN_HEAD,
): number {
  const ls = axisLogSigma(head, logSigma, spec, SIGMA_SCRATCH);
  let logp = 0;
  for (let j = 0; j < ACTION_AXES; j += 1) {
    const at = spec.at[j];
    const kind = spec.kinds[j];
    if (kind === "categorical") {
      const p = softmaxAt(head, at, BIN_SCRATCH);
      const u = random();
      let b = HEAD_BINS - 1;
      let cum = 0;
      for (let k = 0; k < HEAD_BINS; k += 1) { cum += p[k]; if (u < cum) { b = k; break; } }
      into[j] = binCentre(b);
      logp += Math.log(Math.max(p[b], 1e-12));
    } else if (kind === "beta") {
      const alpha = 1 + softplus(head[at]);
      const beta = 1 + softplus(head[at + 1]);
      const g1 = gammaDraw(alpha, random);
      const g2 = gammaDraw(beta, random);
      const x = clamp(g1 / (g1 + g2), 1e-9, 1 - 1e-9);
      into[j] = 2 * x - 1;
      logp += betaLogPdf(x, alpha, beta) - LOG_2;
    } else {
      const z = stdNormal(random);
      into[j] = head[at] + Math.exp(ls[j]) * z;
      logp += -0.5 * (z * z + LOG_2PI) - ls[j];
    }
  }
  for (let j = 0; j < ACTION_GATES; j += 1) {
    const p = sigmoid(head[spec.gateAt + j]);
    const bit = random() < p ? 1 : 0;
    into[ACTION_AXES + j] = bit;
    logp += Math.log(Math.max(bit === 1 ? p : 1 - p, 1e-12));
  }
  return logp;
}

/**
 * The head's own answer with nothing drawn, which is the shipped mind's read.
 *
 * The *mode*, axis by axis, not the mean: a Gaussian's mean and mode are the same number, a
 * categorical's mode is the centre of its heaviest bin, and a Beta's is `(a-1)/(a+b-2)` when it
 * has one, falling back to the mean when both shapes are 1 and the density is flat. Taking the
 * mode rather than the mean is what makes this the greedy read of every head rather than only of
 * the symmetric one -- a Beta leaning hard on one end has a mean well inside the interval and a
 * mode at the end, and it is the end the policy is asking for.
 */
export function meanAction(
  head: Float64Array, into: Float64Array, spec: HeadSpec = GAUSSIAN_HEAD,
): Float64Array {
  for (let j = 0; j < ACTION_AXES; j += 1) {
    const at = spec.at[j];
    const kind = spec.kinds[j];
    if (kind === "categorical") {
      let best = 0;
      for (let k = 1; k < HEAD_BINS; k += 1) if (head[at + k] > head[at + best]) best = k;
      into[j] = binCentre(best);
    } else if (kind === "beta") {
      const alpha = 1 + softplus(head[at]);
      const beta = 1 + softplus(head[at + 1]);
      const denom = alpha + beta - 2;
      const x = denom > 1e-9 ? (alpha - 1) / denom : alpha / (alpha + beta);
      into[j] = 2 * clamp(x, 0, 1) - 1;
    } else {
      into[j] = head[at];
    }
  }
  for (let j = 0; j < ACTION_GATES; j += 1) into[ACTION_AXES + j] = head[spec.gateAt + j] > 0 ? 1 : 0;
  return into;
}

/** The log-probability this head gives an action it did not necessarily draw. */
export function actionLogProb(
  head: Float64Array, logSigma: Float64Array, action: Float64Array, spec: HeadSpec = GAUSSIAN_HEAD,
): number {
  const ls = axisLogSigma(head, logSigma, spec, SIGMA_SCRATCH);
  let logp = 0;
  for (let j = 0; j < ACTION_AXES; j += 1) {
    const at = spec.at[j];
    const kind = spec.kinds[j];
    if (kind === "categorical") {
      logp += head[at + binOf(action[j])] - logSumExpAt(head, at);
    } else if (kind === "beta") {
      const alpha = 1 + softplus(head[at]);
      const beta = 1 + softplus(head[at + 1]);
      const x = clamp((action[j] + 1) / 2, 1e-9, 1 - 1e-9);
      logp += betaLogPdf(x, alpha, beta) - LOG_2;
    } else {
      const z = (action[j] - head[at]) / Math.exp(ls[j]);
      logp += -0.5 * (z * z + LOG_2PI) - ls[j];
    }
  }
  for (let j = 0; j < ACTION_GATES; j += 1) {
    const p = sigmoid(head[spec.gateAt + j]);
    logp += Math.log(Math.max(action[ACTION_AXES + j] === 1 ? p : 1 - p, 1e-12));
  }
  return logp;
}

/**
 * The entropy of the whole head, in nats.
 *
 * Differential for the continuous axes and discrete for the categorical ones, which are not the
 * same kind of number -- so a categorical axis is reported as the differential entropy of the
 * piecewise-uniform density it induces on the axis, which is its discrete entropy plus
 * `log(2 / HEAD_BINS)`, the log-width of a bin. That is a constant and changes no gradient; what
 * it buys is that the `H` a run prints means the same thing under all three heads, and a reader
 * comparing two arms' iteration rows is comparing two numbers on one scale.
 */
export function actionEntropy(
  head: Float64Array, logSigma: Float64Array, spec: HeadSpec = GAUSSIAN_HEAD,
): number {
  const ls = axisLogSigma(head, logSigma, spec, SIGMA_SCRATCH);
  let h = 0;
  for (let j = 0; j < ACTION_AXES; j += 1) {
    const at = spec.at[j];
    const kind = spec.kinds[j];
    if (kind === "categorical") {
      const p = softmaxAt(head, at, BIN_SCRATCH);
      let hk = 0;
      for (let k = 0; k < HEAD_BINS; k += 1) if (p[k] > 1e-12) hk -= p[k] * Math.log(p[k]);
      h += hk + Math.log(2 / HEAD_BINS);
    } else if (kind === "beta") {
      h += betaEntropy(1 + softplus(head[at]), 1 + softplus(head[at + 1])) + LOG_2;
    } else {
      h += ls[j] + 0.5 * (LOG_2PI + 1);
    }
  }
  for (let j = 0; j < ACTION_GATES; j += 1) {
    const p = sigmoid(head[spec.gateAt + j]);
    if (p > 1e-12 && p < 1 - 1e-12) h += -p * Math.log(p) - (1 - p) * Math.log(1 - p);
  }
  return h;
}

/**
 * The gradient of `log pi(a | s)` with respect to the head's outputs and the nine spreads.
 *
 * Both are *added* into the caller's arrays, so a minibatch accumulates and the trainer owns the
 * sign. Axis by axis:
 *
 * - **Gaussian**: `dlogp/dmu = z / sigma` and `dlogp/dlogSigma = z^2 - 1`, with `z` the
 *   standardised residual. Under a state-dependent spread that second one does not go into
 *   `sigmaGrad` at all -- it goes into the *head*, through the sigmoid squash, whose derivative is
 *   `(roof - floor) * p * (1 - p)`.
 * - **Categorical**: `dlogp/dlogit_k = [k = drawn] - p_k`, a softmax's whole gradient.
 * - **Beta**: `dlogp/dalpha = log x - (psi(alpha) - psi(alpha + beta))` and its mirror in beta,
 *   each carried back through `alpha = 1 + softplus(z)` whose derivative is `sigmoid(z)`.
 * - **Bernoulli gate**: `dlogp/dlogit = bit - p`.
 */
export function logProbGrad(
  head: Float64Array, logSigma: Float64Array, action: Float64Array, scale: number,
  headGrad: Float64Array, sigmaGrad: Float64Array, spec: HeadSpec = GAUSSIAN_HEAD,
): void {
  const ls = axisLogSigma(head, logSigma, spec, SIGMA_SCRATCH);
  const span = spec.roof - spec.floor;
  for (let j = 0; j < ACTION_AXES; j += 1) {
    const at = spec.at[j];
    const kind = spec.kinds[j];
    if (kind === "categorical") {
      const b = binOf(action[j]);
      const lse = logSumExpAt(head, at);
      for (let k = 0; k < HEAD_BINS; k += 1) {
        headGrad[at + k] += scale * ((k === b ? 1 : 0) - Math.exp(head[at + k] - lse));
      }
    } else if (kind === "beta") {
      const alpha = 1 + softplus(head[at]);
      const beta = 1 + softplus(head[at + 1]);
      const x = clamp((action[j] + 1) / 2, 1e-9, 1 - 1e-9);
      const dab = digamma(alpha + beta);
      headGrad[at] += scale * (Math.log(x) - digamma(alpha) + dab) * sigmoid(head[at]);
      headGrad[at + 1] += scale * (Math.log1p(-x) - digamma(beta) + dab) * sigmoid(head[at + 1]);
    } else {
      const sigma = Math.exp(ls[j]);
      const z = (action[j] - head[at]) / sigma;
      headGrad[at] += scale * (z / sigma);
      if (spec.sigmaAt < 0) {
        sigmaGrad[j] += scale * (z * z - 1);
      } else {
        const p = sigmoid(head[spec.sigmaAt + j]);
        headGrad[spec.sigmaAt + j] += scale * (z * z - 1) * span * p * (1 - p);
      }
    }
  }
  for (let j = 0; j < ACTION_GATES; j += 1) {
    const p = sigmoid(head[spec.gateAt + j]);
    headGrad[spec.gateAt + j] += scale * (action[ACTION_AXES + j] - p);
  }
}

/**
 * The gradient of the entropy, added in the same way.
 *
 * The Gaussian half is `dH/dlogSigma = 1`, flat, which is what makes the entropy bonus a straight
 * push against the spread collapsing -- and it is why `logSigma` is read by the signature and not
 * by the body under the constant spread: the Gaussian's entropy depends on the spread, but its
 * *derivative* does not. Under a state-dependent spread the same flat 1 is carried through the
 * squash instead, so the bonus pushes the network's own output rather than a parameter.
 *
 * The Bernoulli half is `dH/dlogit = -logit * p * (1 - p)`, zero at an undecided gate and pulling
 * a confident one back toward the coin. A categorical's is `dH/dlogit_k = -p_k * (log p_k + H)`,
 * which is the same shape one dimension up. A Beta's is
 * `dH/dalpha = -(alpha - 1) trigamma(alpha) + (alpha + beta - 2) trigamma(alpha + beta)`, through
 * the same softplus chain the score uses -- and it is the one entropy gradient here that needs a
 * second derivative of the log-gamma.
 */
export function entropyGrad(
  head: Float64Array, _logSigma: Float64Array, scale: number,
  headGrad: Float64Array, sigmaGrad: Float64Array, spec: HeadSpec = GAUSSIAN_HEAD,
): void {
  const span = spec.roof - spec.floor;
  for (let j = 0; j < ACTION_AXES; j += 1) {
    const at = spec.at[j];
    const kind = spec.kinds[j];
    if (kind === "categorical") {
      const p = softmaxAt(head, at, BIN_SCRATCH);
      let hk = 0;
      for (let k = 0; k < HEAD_BINS; k += 1) if (p[k] > 1e-12) hk -= p[k] * Math.log(p[k]);
      for (let k = 0; k < HEAD_BINS; k += 1) {
        headGrad[at + k] += scale * -p[k] * (Math.log(Math.max(p[k], 1e-12)) + hk);
      }
    } else if (kind === "beta") {
      const alpha = 1 + softplus(head[at]);
      const beta = 1 + softplus(head[at + 1]);
      const tab = trigamma(alpha + beta);
      headGrad[at] += scale * (-(alpha - 1) * trigamma(alpha) + (alpha + beta - 2) * tab)
        * sigmoid(head[at]);
      headGrad[at + 1] += scale * (-(beta - 1) * trigamma(beta) + (alpha + beta - 2) * tab)
        * sigmoid(head[at + 1]);
    } else if (spec.sigmaAt < 0) {
      sigmaGrad[j] += scale;
    } else {
      const p = sigmoid(head[spec.sigmaAt + j]);
      headGrad[spec.sigmaAt + j] += scale * span * p * (1 - p);
    }
  }
  for (let j = 0; j < ACTION_GATES; j += 1) {
    const logit = head[spec.gateAt + j];
    const p = sigmoid(logit);
    headGrad[spec.gateAt + j] += scale * (-logit * p * (1 - p));
  }
}

// ------------------------------------------------------------------------------------ the mind

/** What a rollout is told about each ask, beside the reading and the command. */
export interface PolicyStep {
  /** The normalised observation, this ask's own copy. */
  readonly observation: Float64Array;
  /** The raw observation, so a run can accumulate the statistics it will freeze. */
  readonly raw: Float64Array;
  readonly action: Float64Array;
  readonly logp: number;
}

export type PolicyHook = (step: PolicyStep, reading: PilotReading, view: FighterView) => void;

export interface GolemPolicy {
  readonly driven: GolemDriven;
  /** How many asks the network answered, and how many of those were drawn rather than the mean. */
  readonly asks: number;
  readonly drawn: number;
  /** The head of the last ask, for a test and the readout. */
  readonly lastHead: Float64Array;
  decide(view: FighterView, dt: number): Intent;
}

/**
 * The fourth executor under the policy network.
 *
 * `sample` true draws from the head, out of a stream of its own; false plays the mean and draws
 * nothing at all, which is the shipped mind. `onStep` is how a rollout is taken -- it is handed
 * the observation, the action and the log-probability the draw actually had, because a trainer
 * that recomputed the log-probability from the weights it has now would be computing the wrong
 * number the moment it took a gradient step.
 */
export function golemPolicy(
  seed: number, table: PolicyWeights = POLICY_WEIGHTS, T: DrivenTactics = GOLEM_TACTICS_V4,
  onStep: PolicyHook | null = null, sample = false, onAsk: PilotHook | null = null,
): GolemPolicy {
  checkPolicyWeights(table);
  const spec = headSpecOfTable(table);
  const columns = pilotFeatureCount(table.features);
  const weights = Float64Array.from(table.weights);
  const logSigma = Float64Array.from(table.logSigma);
  const scratch = netScratch(table.layout);
  const raw = new Float64Array(columns);
  const observation = new Float64Array(columns);
  const action = new Float64Array(ACTION_WIDTH);
  const command = freshCommand();
  const random = mulberry32((seed ^ 0x9017c1) >>> 0);
  // The trace belongs to the mind and lives exactly as long as it does, which is one bout: a
  // version-2 observation is a function of what this body has seen since the bell and nothing before.
  const trace = table.features >= 2 ? pilotTrace() : null;
  let asks = 0;
  let drawn = 0;

  const pilot: Pilot = (reading, view): StyleCommand => {
    pilotFeatures(reading, view, raw, trace);
    normalise(raw, table.normalisation, observation);
    const head = forward(table.layout, weights, observation, scratch);
    let logp = 0;
    if (sample) { logp = sampleAction(head, logSigma, random, action, spec); drawn += 1; }
    else { meanAction(head, action, spec); logp = actionLogProb(head, logSigma, action, spec); }
    asks += 1;
    commandFromAction(action, command);
    onStep?.({
      observation: Float64Array.from(observation), raw: Float64Array.from(raw),
      action: Float64Array.from(action), logp,
    }, reading, view);
    onAsk?.(reading, view, command);
    return command;
  };

  const driven = golemDriven(seed, T, pilot);
  return {
    driven,
    get asks(): number { return asks; },
    get drawn(): number { return drawn; },
    get lastHead(): Float64Array { return scratch[scratch.length - 1]; },
    decide: (view, dt) => driven.decide(view, dt),
  };
}

/** The uniform baseline's own stream, so that it never shares a draw with a fitted mind. */
const UNIFORM_STREAM = 0x1f0a2b3c;

/**
 * The null hypothesis: a command drawn uniformly from its own range, every ask, reading nothing.
 *
 * This is the baseline the session's mechanical bar is stated against, and it is here rather than
 * in the trainer because it is the *policy's* null and not the trainer's: it is exactly what this
 * mind is when its weights carry no information, and a fit that cannot beat it has learned
 * nothing about the arena rather than something small. It is not registered as a policy and does
 * not appear in the picker -- Session 11's `zeros` and `passive` gaps were the same kind of
 * object, a designed opponent that exists to be measured against.
 *
 * Uniform on every axis and a fair coin on every gate, which means it commits to a stroke about
 * half the time it is asked and aborts about half of those. It fights, after a fashion.
 */
export function uniformPilot(seed: number): Pilot {
  const random = mulberry32((seed ^ UNIFORM_STREAM) >>> 0);
  const command = freshCommand();
  return (): StyleCommand => {
    for (let j = 0; j < ACTION_AXES; j += 1) {
      command[COMMAND_AXES[j]] = AXIS_CENTRE[j] + AXIS_HALF[j] * (random() * 2 - 1);
    }
    for (let j = 0; j < ACTION_GATES; j += 1) command[COMMAND_GATES[j]] = random() < 0.5 ? 1 : 0;
    return command;
  };
}

/**
 * The table a trainer starts from: the declared shape, no numbers, and the reward it will pay.
 *
 * Version 3 always, and it always names its head -- even the Gaussian one, which a version-2 table
 * left unsaid. A table that says what it is costs one line of JSON and saves a reader the
 * inference; the *reading* side stays permissive, because the shipped artifact predates the field
 * and has to keep loading.
 */
export function freshPolicyTable(
  weights: readonly number[], logSigma: readonly number[],
  features: number = PILOT_FEATURES_DEFAULT, spec: HeadSpec = GAUSSIAN_HEAD,
): PolicyWeights {
  return {
    version: POLICY_VERSION, features, layout: policyLayout(features, spec),
    seed: 0, date: "", iterations: 0, bouts: 0, steps: 0,
    halfLife: 0, lambda: 0, clip: 0, entropy: 0,
    reward: GOLEM_REWARD, normalisation: freshNormalisation(pilotFeatureCount(features)),
    opponent: null, terminals: [],
    score: 0, baselines: {},
    head: spec.head, sigma: spec.sigma, sigmaFloor: spec.floor, sigmaRoof: spec.roof,
    logSigma, weights,
  };
}
