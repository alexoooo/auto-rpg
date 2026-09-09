import type { FighterView, Intent } from "../mind.ts";
import { mulberry32 } from "../rng.ts";
import { forward, netScratch, netSize, type NetLayout } from "./neural-net.ts";
import {
  PILOT_FEATURE_COUNT, PILOT_FEATURES_VERSION, pilotFeatures,
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
 */
export const POLICY_VERSION = 2;

/** Nine means and three gate logits, in `COMMAND_AXES` then `COMMAND_GATES` order. */
export const ACTION_AXES = COMMAND_AXES.length;
export const ACTION_GATES = COMMAND_GATES.length;
export const ACTION_WIDTH = ACTION_AXES + ACTION_GATES;

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
  /** One log-standard-deviation an axis, in the normalised coordinate. */
  readonly logSigma: readonly number[];
  readonly weights: readonly number[];
}

/**
 * Refuse a table this build cannot read, by name; return it otherwise.
 *
 * Six refusals, which is `checkLearnerWeights`'s four plus the two this head has that a softmax
 * did not: a `logSigma` of the wrong length is a table for a different action space, and a
 * normalisation of the wrong length is a table for different columns. Both would otherwise run.
 */
export function checkPolicyWeights(table: PolicyWeights): PolicyWeights {
  if (table.version !== POLICY_VERSION) {
    throw new Error(`policy weights are version ${table.version}; this build reads version ${POLICY_VERSION}`);
  }
  if (table.features !== PILOT_FEATURES_VERSION) {
    throw new Error(`policy weights read feature version ${table.features}; this build publishes version ${PILOT_FEATURES_VERSION}`);
  }
  const layout = table.layout;
  if (layout.inputs !== POLICY_LAYOUT.inputs || layout.outputs !== POLICY_LAYOUT.outputs
    || layout.hidden.length !== POLICY_LAYOUT.hidden.length
    || layout.hidden.some((n, i) => n !== POLICY_LAYOUT.hidden[i])) {
    throw new Error(`policy weights are laid out ${JSON.stringify(layout)}; this build reads ${JSON.stringify(POLICY_LAYOUT)}`);
  }
  if (table.weights.length !== netSize(layout)) {
    throw new Error(`policy weights hold ${table.weights.length} numbers; the layout wants ${netSize(layout)}`);
  }
  if (table.logSigma.length !== ACTION_AXES) {
    throw new Error(`policy weights carry ${table.logSigma.length} spreads; the action has ${ACTION_AXES} continuous axes`);
  }
  const norm = table.normalisation;
  if (norm.mean.length !== PILOT_FEATURE_COUNT || norm.variance.length !== PILOT_FEATURE_COUNT) {
    throw new Error(`policy normalisation is ${norm.mean.length}/${norm.variance.length} wide; the columns are ${PILOT_FEATURE_COUNT}`);
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
 * The observation, normalised and clipped.
 *
 * Clipped at five standard deviations, which is the usual guard and matters here because a column
 * that was constant over the rollouts -- and several are, on a body that has no spare hand -- has
 * a variance near zero and would otherwise turn one unusual body into an enormous input.
 */
export function normalise(raw: Float64Array, norm: Normalisation, into: Float64Array): Float64Array {
  for (let k = 0; k < raw.length; k += 1) {
    const sd = Math.sqrt(norm.variance[k] + 1e-8);
    into[k] = clamp((raw[k] - norm.mean[k]) / sd, -5, 5);
  }
  return into;
}

/** A normalisation that does nothing, which is what an unfitted table carries. */
export function freshNormalisation(width = PILOT_FEATURE_COUNT): Normalisation {
  return { count: 0, mean: new Array(width).fill(0), variance: new Array(width).fill(1) };
}

// -------------------------------------------------------------------------------- the distribution

const LOG_2PI = Math.log(2 * Math.PI);
const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x));

/**
 * Draw an action from the head, and return its log-probability.
 *
 * The nine are `mu + sigma * z` with `z` a standard normal from the Box-Muller transform of two
 * uniforms; the three are coin flips at the head's own sigmoid. The log-probability returned is
 * of the raw draw, before any clip -- see the module note on why.
 */
export function sampleAction(
  head: Float64Array, logSigma: Float64Array, random: () => number, into: Float64Array,
): number {
  let logp = 0;
  for (let j = 0; j < ACTION_AXES; j += 1) {
    const u1 = Math.max(random(), 1e-12);
    const u2 = random();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    const sigma = Math.exp(logSigma[j]);
    into[j] = head[j] + sigma * z;
    logp += -0.5 * (z * z + LOG_2PI) - logSigma[j];
  }
  for (let j = 0; j < ACTION_GATES; j += 1) {
    const p = sigmoid(head[ACTION_AXES + j]);
    const bit = random() < p ? 1 : 0;
    into[ACTION_AXES + j] = bit;
    logp += Math.log(Math.max(bit === 1 ? p : 1 - p, 1e-12));
  }
  return logp;
}

/** The head's own answer with nothing drawn: the mean, and each gate at its more likely side. */
export function meanAction(head: Float64Array, into: Float64Array): Float64Array {
  for (let j = 0; j < ACTION_AXES; j += 1) into[j] = head[j];
  for (let j = 0; j < ACTION_GATES; j += 1) into[ACTION_AXES + j] = head[ACTION_AXES + j] > 0 ? 1 : 0;
  return into;
}

/** The log-probability this head gives an action it did not necessarily draw. */
export function actionLogProb(head: Float64Array, logSigma: Float64Array, action: Float64Array): number {
  let logp = 0;
  for (let j = 0; j < ACTION_AXES; j += 1) {
    const sigma = Math.exp(logSigma[j]);
    const z = (action[j] - head[j]) / sigma;
    logp += -0.5 * (z * z + LOG_2PI) - logSigma[j];
  }
  for (let j = 0; j < ACTION_GATES; j += 1) {
    const p = sigmoid(head[ACTION_AXES + j]);
    logp += Math.log(Math.max(action[ACTION_AXES + j] === 1 ? p : 1 - p, 1e-12));
  }
  return logp;
}

/** The differential entropy of the nine plus the entropy of the three, in nats. */
export function actionEntropy(head: Float64Array, logSigma: Float64Array): number {
  let h = 0;
  for (let j = 0; j < ACTION_AXES; j += 1) h += logSigma[j] + 0.5 * (LOG_2PI + 1);
  for (let j = 0; j < ACTION_GATES; j += 1) {
    const p = sigmoid(head[ACTION_AXES + j]);
    if (p > 1e-12 && p < 1 - 1e-12) h += -p * Math.log(p) - (1 - p) * Math.log(1 - p);
  }
  return h;
}

/**
 * The gradient of `log pi(a | s)` with respect to the head's twelve outputs and the nine spreads.
 *
 * Both are *added* into the caller's arrays, so a minibatch accumulates and the trainer owns the
 * sign. For the nine: `dlogp/dmu = z / sigma` and `dlogp/dlogSigma = z^2 - 1`, with `z` the
 * standardised residual. For the three: `dlogp/dlogit = bit - p`, which is a Bernoulli's whole
 * gradient and is the same expression the cross-entropy of a two-class softmax reduces to.
 */
export function logProbGrad(
  head: Float64Array, logSigma: Float64Array, action: Float64Array, scale: number,
  headGrad: Float64Array, sigmaGrad: Float64Array,
): void {
  for (let j = 0; j < ACTION_AXES; j += 1) {
    const sigma = Math.exp(logSigma[j]);
    const z = (action[j] - head[j]) / sigma;
    headGrad[j] += scale * (z / sigma);
    sigmaGrad[j] += scale * (z * z - 1);
  }
  for (let j = 0; j < ACTION_GATES; j += 1) {
    const p = sigmoid(head[ACTION_AXES + j]);
    headGrad[ACTION_AXES + j] += scale * (action[ACTION_AXES + j] - p);
  }
}

/**
 * The gradient of the entropy, added in the same way.
 *
 * The Gaussian half is `dH/dlogSigma = 1`, flat, which is what makes the entropy bonus a straight
 * push against the spread collapsing -- and it is why `logSigma` is read by the signature and not
 * by the body: the Gaussian's entropy depends on the spread, but its *derivative* does not.
 * The Bernoulli half is `dH/dlogit = -logit * p * (1 - p)`, which is zero at an undecided gate and
 * pulls a confident one back toward the coin.
 */
export function entropyGrad(
  head: Float64Array, _logSigma: Float64Array, scale: number,
  headGrad: Float64Array, sigmaGrad: Float64Array,
): void {
  for (let j = 0; j < ACTION_AXES; j += 1) sigmaGrad[j] += scale;
  for (let j = 0; j < ACTION_GATES; j += 1) {
    const logit = head[ACTION_AXES + j];
    const p = sigmoid(logit);
    headGrad[ACTION_AXES + j] += scale * (-logit * p * (1 - p));
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
  const weights = Float64Array.from(table.weights);
  const logSigma = Float64Array.from(table.logSigma);
  const scratch = netScratch(table.layout);
  const raw = new Float64Array(PILOT_FEATURE_COUNT);
  const observation = new Float64Array(PILOT_FEATURE_COUNT);
  const action = new Float64Array(ACTION_WIDTH);
  const command = freshCommand();
  const random = mulberry32((seed ^ 0x9017c1) >>> 0);
  let asks = 0;
  let drawn = 0;

  const pilot: Pilot = (reading, view): StyleCommand => {
    pilotFeatures(reading, view, raw);
    normalise(raw, table.normalisation, observation);
    const head = forward(table.layout, weights, observation, scratch);
    let logp = 0;
    if (sample) { logp = sampleAction(head, logSigma, random, action); drawn += 1; }
    else { meanAction(head, action); logp = actionLogProb(head, logSigma, action); }
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

/** The table a trainer starts from: the shipped shape, no numbers, and the reward it will pay. */
export function freshPolicyTable(weights: readonly number[], logSigma: readonly number[]): PolicyWeights {
  return {
    version: POLICY_VERSION, features: PILOT_FEATURES_VERSION, layout: POLICY_LAYOUT,
    seed: 0, date: "", iterations: 0, bouts: 0, steps: 0,
    halfLife: 0, lambda: 0, clip: 0, entropy: 0,
    reward: GOLEM_REWARD, normalisation: freshNormalisation(),
    opponent: null, terminals: [],
    score: 0, baselines: {}, logSigma, weights,
  };
}
