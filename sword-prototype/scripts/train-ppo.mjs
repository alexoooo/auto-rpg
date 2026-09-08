// Fit `golem-policy` by PPO on the dense reward, in mirrored self-play. Session 13 of the style set.
//
//   node scripts/train-ppo.mjs [--seed 20260913] [--iterations 30] [--bouts 32] [--cap 60]
//        [--workers N] [--random 40] [--half-life 4] [--lambda 0.95] [--clip 0.2]
//        [--entropy 0.003] [--rate 1e-4] [--value-rate 1e-3] [--sigma-rate 10x rate]
//        [--epochs 4] [--batch 4096] [--target-kl 0.03]
//        [--sigma-floor -3] [--sigma-roof 0.5] [--evaluate 5] [--eval-bouts 96]
//        [--final-bouts 4x eval] [--value-hidden 64,64]
//        [--out src/golem/policy-weights.ts] [--log tournaments/ppo-....jsonl] [--resume f.json]
//
// **What is fitted.** Nine numbers and three gates a twelfth of a second, straight onto the fourth
// executor's command surface. Nothing chooses a name; there is no vocabulary between the network
// and the body. That is the whole difference from `golem-learner`, and it is the difference the
// plan set spent Session 12 building the surface for.
//
// **Why PPO and not another fitted Q.** Fitted Q needs an argmax over the action space at every
// target, and this action space is nine-dimensional and continuous: there is no argmax to take.
// A policy-gradient method never needs one -- it moves the density toward the actions that paid
// and away from the ones that did not -- and the clipped surrogate is the version of that which
// can take several passes over a batch without walking off the trust region it collected under.
//
// **Where the signal comes from.** `src/golem/reward.ts`: the bar margin, differenced ask by ask,
// which telescopes to the outcome exactly (Session 08's identity), plus a win term and two small
// charges taken from the tournament's own clinch and idle-travel instruments. Session 09 measured
// what the alternative costs: one scalar a bout, sigma 0.032 points at 384 bouts, and an evolution
// strategy that could not move a confident imitation. This is about two hundred and fifty rewards
// a side a bout instead of one.
//
// **Self-play, mirrored.** Both sides of every bout are the same weights on the same body, so a
// bout is a fair test of the mind and *both* sides are data. The opposition therefore improves
// exactly as fast as the policy does, which is the property Session 14's league exists to make
// use of and which this session only has to not break: no fixed opponent to overfit, and no pool
// of past selves yet either.
//
// **The self-play return is not the progress curve, and cannot be.** Both sides of a mirrored bout
// are recorded, and one side's bar margin is the other's negated exactly, so the mean return over
// an iteration is zero up to the two penalties whatever the policy has learned. Anybody reading a
// flat line there and concluding the fit had stalled would be reading an identity. The curve this
// session is written on is therefore the *rating*: the paired bar margin against the uniform
// baseline over the same bodies and seeds, taken every `--evaluate` iterations *and at iteration
// zero*, which is the same number the session's bar is stated in and is the only one that can move.
// The zeroth point is not a formality: the untrained policy is not the uniform baseline -- it plays
// the mean of a randomly initialised head, which is a nearly constant command -- so without it a
// run cannot tell a fit that worked from an initialisation that was already there.
//
// **The rate and the batch are one knob, and the defaults above were measured rather than taken
// from a paper.** Adam divides by its own second moment, so a step is `rate` in magnitude whatever
// the gradient is, and with cold moments every one of the 87,308 weights moves by exactly the rate
// in the direction one minibatch chose. At 3e-4 that is about 0.18 nats in a single step, so the
// trust region below stopped every fit after its first minibatch -- 512 samples of the 57,000 the
// harness had just collected. The calibration table is in the Session 13 entry of
// `docs/measurements.md`; what it landed on is a batch of 4,096 and a rate of 1e-4, at which all
// fifty-six steps of four epochs are applied and the fit ends at a KL near 0.01. One iteration of
// every run is still spent this way -- the first, where the moments are cold -- and that is left
// in rather than special-cased, because a run that needs its first iteration back is too short.
//
// **What is reported an iteration** is shape rather than progress -- what the policy is doing, so
// that a run which has gone wrong says so long before the next rating: how many bouts decided, the
// mean episode length, what fraction of the return the two penalties accounted for, the value
// function's explained variance, the KL between the collecting policy and the fitted one, the
// fraction of samples whose ratio was clipped, the entropy, and each `logSigma`. A KL that runs
// away, an entropy that collapses, or a penalty that came to dominate the return is a run to stop
// -- the last of those is `reward.ts`'s own instruction and this is where it is checked.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { forward, initWeights, netScratch, netSize, backwardFrom } from "../src/golem/neural-net.ts";
import { PILOT_FEATURE_COUNT, PILOT_FEATURES_VERSION } from "../src/golem/pilot.ts";
import {
  ACTION_AXES, ACTION_WIDTH, POLICY_LAYOUT, POLICY_VERSION, VALUE_LAYOUT,
  actionEntropy, actionLogProb, checkPolicyWeights, entropyGrad, freshNormalisation,
  freshPolicyTable, logProbGrad, normalise,
} from "../src/golem/policy.ts";
import { GOLEM_REWARD, stepReward } from "../src/golem/reward.ts";
import { mulberry32 } from "../src/rng.ts";
import { buildPool, runJobs, scheduleJobs } from "./tournament.mjs";
import { columnsOf, meanOf, semOf } from "./train-learner.mjs";
import { evaluate } from "./tune.mjs";

/** The name the rollouts and the evaluation give the fit, and the two it is rated against. */
export const FIT_NAME = "fit";
export const UNIFORM_NAME = "uniform";

/** The hand-coded opposition an evaluation rates every contender over. */
export const PPO_LEAGUE = Object.freeze([
  "golem-driver", "golem-form", "golem-brawler", "golem-duelist", "golem-fencer",
]);

const round5 = (x) => Math.round(x * 1e5) / 1e5;
const round4 = (x) => Math.round(x * 1e4) / 1e4;

// ------------------------------------------------------------------------------- the rollout

/**
 * Every recorded side of a run's rows, laid end to end with its episode boundaries kept.
 *
 * A pilot pack is one side of one bout: `count` asks, each with the raw observation it read, the
 * action it drew, the log-probability that draw actually had, and the four numbers the reward is
 * made of. `done` marks the last ask of a side, which is the only episode boundary there is --
 * see `advantages` for why this arena has no other kind.
 */
export function mergeRollouts(parts) {
  let count = 0;
  for (const part of parts) count += part.logp.length;
  const width = PILOT_FEATURE_COUNT;
  const out = {
    count, episodes: parts.length, width,
    x: new Float32Array(count * width),
    a: new Float64Array(count * ACTION_WIDTH),
    logp: new Float64Array(count),
    reward: new Float64Array(count),
    /** What the two shaping terms took out of that reward, so a run can report their share. */
    penalty: new Float64Array(count),
    seconds: new Float64Array(count),
    done: new Uint8Array(count),
  };
  let at = 0;
  for (const part of parts) {
    const n = part.logp.length;
    if (n === 0) continue;
    if (part.x.length !== n * width) {
      throw new Error(`a pack has ${part.x.length / n} columns; this build reads ${width}`);
    }
    out.x.set(part.x, at * width);
    out.a.set(part.a, at * ACTION_WIDTH);
    out.logp.set(part.logp, at);
    out.seconds.set(part.seconds, at);
    out.done.set(part.done, at);
    // The outcome is read once, on the window the recorder marked `done`, and is the side's own:
    // `winner` is the name of a side of the bout and `part.side` says which one this pack is.
    const outcome = part.winner === null ? 0 : part.winner === part.side ? 1 : -1;
    for (let i = 0; i < n; i += 1) {
      const done = part.done[i] === 1;
      const w = {
        dealt: part.dealt[i], taken: part.taken[i], seconds: part.seconds[i],
        clinchSeconds: part.clinch[i], idleMetres: part.idle[i], done, outcome,
      };
      out.reward[at + i] = stepReward(w);
      out.penalty[at + i] = stepReward({ ...w, clinchSeconds: 0, idleMetres: 0 }) - out.reward[at + i];
    }
    at += n;
  }
  if (at !== count) throw new Error(`merged ${at} of ${count} asks`);
  return out;
}

/**
 * The running mean and variance of the observation, extended by a batch of raw rows.
 *
 * Chan's parallel form, so that a resumed run continues one accumulation rather than restarting
 * it: the two counts, the two means and the two sums of squared deviation compose exactly. The
 * result is *frozen for the next whole iteration* -- collected under and fitted under -- because a
 * normalisation that moved between the draw and the gradient would make the log-probability the
 * trainer recomputes disagree with the one the body acted on.
 */
export function extendNormalisation(prior, rollout) {
  const width = rollout.width;
  const n = rollout.count;
  if (n === 0) return prior;
  const mean = new Float64Array(width);
  const m2 = new Float64Array(width);
  for (let i = 0; i < n; i += 1) {
    const row = i * width;
    for (let k = 0; k < width; k += 1) {
      const delta = rollout.x[row + k] - mean[k];
      mean[k] += delta / (i + 1);
      m2[k] += delta * (rollout.x[row + k] - mean[k]);
    }
  }
  const countA = prior.count;
  const total = countA + n;
  const out = { count: total, mean: new Array(width), variance: new Array(width) };
  for (let k = 0; k < width; k += 1) {
    if (countA === 0) {
      out.mean[k] = mean[k];
      out.variance[k] = n > 1 ? m2[k] / n : 1;
      continue;
    }
    const delta = mean[k] - prior.mean[k];
    out.mean[k] = prior.mean[k] + delta * (n / total);
    const m2A = prior.variance[k] * countA;
    out.variance[k] = (m2A + m2[k] + delta * delta * (countA * n / total)) / total;
  }
  return out;
}

/**
 * Generalised advantage estimation over a rollout, per episode, with a per-step discount.
 *
 * The discount is a **half-life in seconds** rather than a per-step gamma, because a step here is
 * a window between two asks and a window is not always the same length: the cadence is 12 Hz but
 * an ask is also raised on an event, and the last window of a bout is whatever was left. So
 * `gamma_t = 2^(-seconds_t / halfLife)`, which is the same number of half-lives however the asks
 * happened to fall, and two runs at different `askHz` are discounting the same fight the same way.
 *
 * **This arena has no truncation.** The usual GAE has to bootstrap `V(s_T)` at a time limit,
 * because the episode continues and the agent simply stopped watching. Here the 60 s cap ends the
 * bout, and the bar margin at the cap *is* the result the tournament scores -- Session 11 measured
 * that 531 of 1,024 bouts end that way and they are half of the league table. So every episode is
 * terminal, the value after the last ask is zero, and the undiscounted sum of the rewards of an
 * episode is exactly that side's bar margin plus its win term. Nothing is estimated at the end.
 */
export function advantages(rollout, values, { halfLife = 4, lambda = 0.95 } = {}) {
  const n = rollout.count;
  const advantage = new Float64Array(n);
  const returns = new Float64Array(n);
  let running = 0;
  for (let i = n - 1; i >= 0; i -= 1) {
    const gamma = Math.pow(2, -rollout.seconds[i] / halfLife);
    const terminal = rollout.done[i] === 1;
    if (terminal) running = 0;
    const nextValue = terminal ? 0 : values[i + 1];
    const delta = rollout.reward[i] + gamma * nextValue - values[i];
    running = delta + gamma * lambda * running;
    advantage[i] = running;
    returns[i] = running + values[i];
  }
  return { advantage, returns };
}

/** The critic's value at every row of a rollout, under the frozen normalisation. */
export function valuesOf(rollout, valueWeights, norm, layout = VALUE_LAYOUT) {
  const scratch = netScratch(layout);
  const raw = new Float64Array(rollout.width);
  const observation = new Float64Array(rollout.width);
  const out = new Float64Array(rollout.count);
  for (let i = 0; i < rollout.count; i += 1) {
    const row = i * rollout.width;
    for (let k = 0; k < rollout.width; k += 1) raw[k] = rollout.x[row + k];
    normalise(raw, norm, observation);
    out[i] = forward(layout, valueWeights, observation, scratch)[0];
  }
  return out;
}

/** What fraction of the return's variance the critic accounts for; 0 is a constant, 1 is exact. */
export function explainedVariance(values, returns) {
  const n = returns.length;
  if (n < 2) return 0;
  let mean = 0;
  for (let i = 0; i < n; i += 1) mean += returns[i];
  mean /= n;
  let total = 0;
  let residual = 0;
  for (let i = 0; i < n; i += 1) {
    total += (returns[i] - mean) ** 2;
    residual += (returns[i] - values[i]) ** 2;
  }
  return total === 0 ? 0 : 1 - residual / total;
}

// ---------------------------------------------------------------------------------- the fit

/**
 * The clipped surrogate at one sample, as a number.
 *
 * `min(r A, clip(r, 1-e, 1+e) A)` plus the entropy bonus, where `r` is the ratio of this head's
 * density at the action to the density the *collecting* head had -- which is `oldLogp`, recorded
 * by the worker at the moment of the draw and never recomputed. This is the thing that is
 * maximised, and `surrogateGrad` below is its gradient; they are two functions rather than one so
 * that a test can difference the first and compare it against the second.
 */
export function surrogateObjective(head, logSigma, action, oldLogp, adv, { clip = 0.2, entropy = 0 } = {}) {
  const ratio = Math.exp(actionLogProb(head, logSigma, action) - oldLogp);
  const bounded = Math.min(Math.max(ratio, 1 - clip), 1 + clip) * adv;
  return Math.min(ratio * adv, bounded) + entropy * actionEntropy(head, logSigma);
}

/**
 * Its gradient, as the *loss* gradient -- the objective's negative, since Adam descends.
 *
 * Added into `delta`, one number an output of the head, which is what `backwardFrom` continues
 * from; and into `sigmaGrad`, which is a parameter rather than an output and therefore takes its
 * gradient directly. The comparison `unclipped <= bounded` is the whole of the clipping: when the
 * unclipped term is the smaller it *is* the objective and carries the gradient, and when it is not
 * the objective is a constant in the weights over the neighbourhood and carries none. The entropy
 * bonus is outside the clip and is always paid.
 */
export function surrogateGrad(
  head, logSigma, action, oldLogp, adv, { clip = 0.2, entropy = 0 } = {}, scale, delta, sigmaGrad,
) {
  const logp = actionLogProb(head, logSigma, action);
  const ratio = Math.exp(logp - oldLogp);
  const unclipped = ratio * adv;
  const bounded = Math.min(Math.max(ratio, 1 - clip), 1 + clip) * adv;
  const active = unclipped <= bounded;
  if (active) logProbGrad(head, logSigma, action, -adv * ratio * scale, delta, sigmaGrad);
  if (entropy !== 0) entropyGrad(head, logSigma, -entropy * scale, delta, sigmaGrad);
  const h = actionEntropy(head, logSigma);
  return { logp, ratio, active, entropy: h, objective: Math.min(unclipped, bounded) + entropy * h };
}

const ADAM = Object.freeze({ beta1: 0.9, beta2: 0.999, eps: 1e-8 });

/** One Adam state per parameter block, so the actor, the spread and the critic move separately. */
function adamState(size) {
  return { m: new Float64Array(size), v: new Float64Array(size), step: 0 };
}

function adamStep(weights, grad, state, rate) {
  state.step += 1;
  const c1 = 1 - ADAM.beta1 ** state.step;
  const c2 = 1 - ADAM.beta2 ** state.step;
  for (let k = 0; k < weights.length; k += 1) {
    const g = grad[k];
    state.m[k] = ADAM.beta1 * state.m[k] + (1 - ADAM.beta1) * g;
    state.v[k] = ADAM.beta2 * state.v[k] + (1 - ADAM.beta2) * g * g;
    weights[k] -= rate * (state.m[k] / c1) / (Math.sqrt(state.v[k] / c2) + ADAM.eps);
  }
}

/**
 * One PPO update: `epochs` passes of minibatch Adam over the rollout, actor and critic together.
 *
 * The surrogate is the clipped one, `min(r A, clip(r, 1-e, 1+e) A)` with `r` the ratio of the
 * fitted density to the *collecting* one at the action that was actually played. The comparison
 * is the whole of the clipping: when the unclipped term is the smaller of the two it is the
 * objective and carries the gradient, and when it is not the objective is a constant in the
 * weights and carries none. That one line is why several epochs over one batch do not walk the
 * policy somewhere the batch says nothing about.
 *
 * **Advantages are standardised over the whole rollout**, not over the minibatch: a minibatch here
 * is a few hundred consecutive-ish asks and standardising inside one would give a quiet stretch of
 * a bout the same spread as an exchange. **The log-probability the ratio is taken against is the
 * one the worker recorded**, never a recomputation, for the reason `golem-policy`'s own note gives.
 *
 * `logSigma` is a parameter and not an output, so its gradient accumulates straight over the
 * minibatch rather than through the network, and it is held inside `[floor, roof]` afterwards --
 * a spread that collapses stops exploring for the rest of the run and one that runs away makes
 * every ratio meaningless, and both are cheap to simply forbid.
 *
 * **The spread has its own step size, and it has to.** Adam's step is `+-rate` per parameter
 * whatever the gradient's size, so nine numbers and eighty-seven thousand travel the same distance
 * per update -- but the actor's rate is set by how far *the policy* may move in one fit, and at the
 * setting that allows, `logSigma` can cross at most `rate * updates` over a whole run. At the
 * calibrated 1e-4 that is 0.17 over thirty iterations, which is a spread that cannot sharpen. The
 * multiplier is the smallest fix that does not couple the two: the trust region still bounds what
 * a fit may do, and the floor and roof still bound where the spread may end up.
 */
export function ppoFit(rollout, {
  weights, logSigma, valueWeights, layout = POLICY_LAYOUT, valueLayout = VALUE_LAYOUT,
  norm, seed, halfLife = 4, lambda = 0.95, clip = 0.2, entropy = 0.003,
  rate = 3e-4, valueRate = 1e-3, sigmaRate = null, epochs = 3, batch = 512, targetKl = 0.02,
  sigmaFloor = -3, sigmaRoof = 0.5, actor = null, spread = null, critic = null,
}) {
  const spreadRate = sigmaRate === null ? rate * 10 : sigmaRate;
  const n = rollout.count;
  const width = rollout.width;
  const values = valuesOf(rollout, valueWeights, norm, valueLayout);
  const { advantage, returns } = advantages(rollout, values, { halfLife, lambda });
  const before = explainedVariance(values, returns);
  // Standardised over the rollout; a batch with no spread at all is left alone rather than
  // divided by nothing, which is the degenerate case of a run where nothing has happened yet.
  const advMean = meanOf(Array.from(advantage));
  let advVar = 0;
  for (let i = 0; i < n; i += 1) advVar += (advantage[i] - advMean) ** 2;
  const advSd = Math.sqrt(advVar / Math.max(1, n));
  const scaled = new Float64Array(n);
  for (let i = 0; i < n; i += 1) scaled[i] = advSd > 1e-9 ? (advantage[i] - advMean) / advSd : 0;

  const size = netSize(layout);
  const valueSize = netSize(valueLayout);
  actor ??= adamState(size);
  spread ??= adamState(ACTION_AXES);
  critic ??= adamState(valueSize);
  const scratch = netScratch(layout);
  const valueScratch = netScratch(valueLayout);
  const raw = new Float64Array(width);
  const observation = new Float64Array(width);
  const action = new Float64Array(ACTION_WIDTH);
  const delta = new Float64Array(ACTION_WIDTH);
  const valueDelta = new Float64Array(1);
  const grad = new Float64Array(size);
  const sigmaGrad = new Float64Array(ACTION_AXES);
  const valueGrad = new Float64Array(valueSize);
  const random = mulberry32((seed ^ 0x9907e0) >>> 0);
  const order = Array.from({ length: n }, (_, i) => i);
  const load = (i) => {
    const row = i * width;
    for (let k = 0; k < width; k += 1) raw[k] = rollout.x[row + k];
    normalise(raw, norm, observation);
    const at = i * ACTION_WIDTH;
    for (let k = 0; k < ACTION_WIDTH; k += 1) action[k] = rollout.a[at + k];
  };

  // The read-out of the pass that most recently finished, so a run reports what the weights it is
  // carrying were last measured at rather than an average over epochs that no longer describe them.
  const seen = { kl: 0, clipped: 0, entropy: 0, valueLoss: 0, count: 0 };
  let read = { kl: 0, clipFraction: 0, entropy: 0, valueLoss: 0 };
  const readOut = () => {
    if (seen.count === 0) return;
    read = {
      kl: seen.kl / seen.count, clipFraction: seen.clipped / seen.count,
      entropy: seen.entropy / seen.count, valueLoss: seen.valueLoss / seen.count,
    };
  };
  let ran = 0;
  let updates = 0;
  let stopped = null;
  outer:
  for (let epoch = 1; epoch <= epochs; epoch += 1) {
    for (let i = order.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    seen.kl = 0; seen.clipped = 0; seen.entropy = 0; seen.valueLoss = 0; seen.count = 0;
    for (let at = 0; at < order.length; at += batch) {
      const end = Math.min(order.length, at + batch);
      const scale = 1 / (end - at);
      grad.fill(0);
      sigmaGrad.fill(0);
      valueGrad.fill(0);
      let batchKl = 0;
      for (let m = at; m < end; m += 1) {
        const i = order[m];
        load(i);
        const head = forward(layout, weights, observation, scratch);
        delta.fill(0);
        const term = surrogateGrad(head, logSigma, action, rollout.logp[i], scaled[i],
          { clip, entropy }, scale, delta, sigmaGrad);
        backwardFrom(layout, weights, observation, scratch, delta, grad);
        // The critic, on the same forward-normalised observation and its own half of the batch.
        const value = forward(valueLayout, valueWeights, observation, valueScratch)[0];
        const error = value - returns[i];
        valueDelta[0] = error * scale;
        backwardFrom(valueLayout, valueWeights, observation, valueScratch, valueDelta, valueGrad);
        // Half the squared change in the log-probability -- Schulman's k2 -- rather than either
        // the plain difference or `exp(d) - 1 - d`. The plain difference is unbiased but *signed*,
        // and goes negative on any batch the new policy happens to like better, which is useless
        // as a trust region because that is one of the two directions worth catching. `exp(d)`
        // is unbiased and non-negative but exponentially heavy tailed: one sample at `d = 5`
        // contributes 142 nats, so a batch of five hundred trips on a single outlier and the
        // criterion fires at random. This one is biased low by a third order term and is
        // quadratic, which is the trade this needs -- it is being compared against a threshold,
        // not reported as a quantity.
        const moved = term.logp - rollout.logp[i];
        const k2 = 0.5 * moved * moved;
        batchKl += k2;
        seen.kl += k2;
        if (!term.active) seen.clipped += 1;
        seen.entropy += term.entropy;
        seen.valueLoss += error * error;
        seen.count += 1;
      }
      // The trust region, enforced rather than only hoped for. The clip bounds each *sample's*
      // ratio and says nothing about how far the whole policy has moved, and this arena walks
      // straight into the case where that is not enough: as the spread tightens onto a command
      // that works, the density at a fixed action becomes enormously sensitive to the mean, so a
      // step of the size that was reasonable at exp(-0.7) is a different policy at exp(-4). A
      // bandit run without this diverges after about thirty-five iterations having already found
      // the answer, which is how the check came to be here. The minibatch that failed is not
      // applied -- its gradient is the one that would have made the move.
      if (targetKl > 0 && batchKl / (end - at) > 1.5 * targetKl) {
        stopped = { epoch, kl: batchKl / (end - at) };
        readOut();
        break outer;
      }
      updates += 1;
      adamStep(weights, grad, actor, rate);
      adamStep(logSigma, sigmaGrad, spread, spreadRate);
      for (let j = 0; j < ACTION_AXES; j += 1) {
        logSigma[j] = Math.min(Math.max(logSigma[j], sigmaFloor), sigmaRoof);
      }
      adamStep(valueWeights, valueGrad, critic, valueRate);
    }
    ran = epoch;
    readOut();
  }
  const after = valuesOf(rollout, valueWeights, norm, valueLayout);
  return {
    actor, spread, critic, epochs: ran, updates, stopped,
    ...read,
    explainedBefore: before,
    explainedAfter: explainedVariance(after, returns),
    advantageSd: advSd,
  };
}

// ------------------------------------------------------------------------------ the collection

/**
 * One iteration's rollouts: mirrored self-play, both sides recorded, drawn rather than greedy.
 *
 * `mirror` puts one build on both sides of a pairing, so what differs across a bout is the two
 * streams and nothing else; and because the two sides are the same weights, both packs are data
 * about the same policy and a bout is worth twice what it would be against a fixed opponent.
 */
export async function collectRollouts({
  pool, weights, logSigma, norm, seed, bouts, workers, cap, name = FIT_NAME, onProgress = null,
}) {
  const contenders = {
    [name]: {
      pi: Array.from(weights), logSigma: Array.from(logSigma),
      normalisation: { count: norm.count, mean: Array.from(norm.mean), variance: Array.from(norm.variance) },
      sample: true,
    },
  };
  const jobs = scheduleJobs({
    pool, policies: [name], pairings: Math.max(1, Math.ceil(bouts / 2)), seed, cap,
    mirror: true, contenders, pairs: [[name, name]],
  });
  const rows = await runJobs(jobs, { workers, contenders, record: [name], onProgress });
  const parts = [];
  let margin = 0;
  let decided = 0;
  for (const row of rows) {
    if (row === null) continue;
    if (row.winner !== null) decided += 1;
    for (const side of ["left", "right"]) {
      const pack = row.samples?.[side];
      if (!pack || pack.logp.length === 0) continue;
      if (pack.kind !== "pilot") throw new Error(`a rollout collected ${pack.kind} samples; PPO reads the pilot columns`);
      parts.push({ ...pack, side });
      margin += pack.margin;
    }
  }
  const rollout = mergeRollouts(parts);
  rollout.bouts = rows.length;
  rollout.decided = rows.length === 0 ? 0 : decided / rows.length;
  rollout.margin = parts.length === 0 ? 0 : margin / parts.length;
  return rollout;
}

/**
 * The undiscounted return of every episode, the asks it took, and what the shaping cost it.
 *
 * The *share* is the number `reward.ts` asks a run to report: the two penalties over the size of
 * everything paid, where size is taken as an absolute value because the bar term is signed and a
 * ratio of two signed sums is not a share of anything. A run where that share is large is a run
 * whose policy was paid mostly for standing somewhere rather than for fighting, and the module's
 * instruction for it is to throw the run away.
 */
export function episodeReturns(rollout) {
  const returns = [];
  const lengths = [];
  const charges = [];
  const bares = [];
  let sum = 0;
  let charge = 0;
  let count = 0;
  for (let i = 0; i < rollout.count; i += 1) {
    sum += rollout.reward[i];
    charge += rollout.penalty?.[i] ?? 0;
    count += 1;
    if (rollout.done[i] === 1) {
      returns.push(sum);
      charges.push(charge);
      bares.push(sum + charge);
      lengths.push(count);
      sum = 0;
      charge = 0;
      count = 0;
    }
  }
  const penalty = charges.length === 0 ? 0 : charges.reduce((a, b) => a + b, 0) / charges.length;
  const bare = bares.length === 0 ? 0 : bares.reduce((a, b) => a + Math.abs(b), 0) / bares.length;
  return { returns, lengths, penalty, bare, share: penalty + bare === 0 ? 0 : penalty / (penalty + bare) };
}

// ------------------------------------------------------------------------------ the evaluation

/**
 * The fit, the uniform baseline and the shipped minds over one league, on a held-out seed.
 *
 * The number the session is written on is the **paired** one: `evaluate` puts every contender in
 * front of the same bodies from the same seeds, so the fit's bar margin and the baseline's are two
 * columns of one table and their difference is a paired difference. Cohen's d on that difference
 * is the set's criterion and has been since Session 03 of the matchup set -- a mind against its
 * own noise is not a number, and this is the arrangement in which it is one.
 */
export async function ratePolicy({
  weights, logSigma, norm, league = PPO_LEAGUE, pool, seed, bouts, workers, cap,
  mirror = true, onProgress = null,
}) {
  const contenders = {
    [FIT_NAME]: {
      pi: Array.from(weights), logSigma: Array.from(logSigma),
      normalisation: { count: norm.count, mean: Array.from(norm.mean), variance: Array.from(norm.variance) },
      sample: false,
    },
    [UNIFORM_NAME]: { uniform: true },
    driver: { policy: "golem-driver" },
  };
  const names = Object.keys(contenders);
  const { rows, results } = await evaluate({ contenders, league, pool, seed, bouts, workers, cap, mirror, onProgress });
  const { per, points, bar } = columnsOf(rows, names);
  const differences = {};
  for (const other of names) {
    if (other === FIT_NAME) continue;
    const p = points[FIT_NAME].map((x, i) => x - points[other][i]);
    const b = bar[FIT_NAME].map((x, i) => x - bar[other][i]);
    differences[other] = {
      points: meanOf(p), pointsSem: semOf(p),
      bar: meanOf(b), barSem: semOf(b), d: cohensD(b),
    };
  }
  return { per, names, results, points, bar, differences };
}

/** Cohen's d of a paired column: its mean over its own standard deviation. */
export function cohensD(diffs) {
  if (diffs.length < 2) return 0;
  const mean = meanOf(diffs);
  const sd = Math.sqrt(diffs.reduce((a, b) => a + (b - mean) ** 2, 0) / (diffs.length - 1));
  return sd < 1e-12 ? 0 : mean / sd;
}

// ---------------------------------------------------------------------------------- the module

/**
 * The module text: a header that says where the numbers came from, then the literal.
 *
 * Sixteen numbers a line, as `renderLearnerModule` writes its own, so a refit diffs by row. The
 * weight import is type-only and the reward's is not: `policy.ts` imports this file for its
 * default table, so a value imported back the other way would be a cycle -- but `reward.ts`
 * imports nothing, so the table can name the coefficients it was fitted under rather than
 * copying them, and a build whose reward table has moved says so by not matching.
 */
export function renderPolicyModule(table) {
  checkPolicyWeights(table);
  const rows = [];
  for (let i = 0; i < table.weights.length; i += 16) rows.push("  " + table.weights.slice(i, i + 16).join(","));
  const body = "\"weights\":[\n" + rows.join(",\n") + "\n]";
  const named = JSON.stringify({ ...table, weights: [], reward: null }).replace("\"weights\":[]", body);
  const beaten = Object.entries(table.baselines)
    .map(([name, score]) => `${name} ${score.toFixed(3)}`).join(", ");
  return [
    "// GENERATED by scripts/train-ppo.mjs -- do not edit; regenerate.",
    "//",
    `// Policy weights, version ${table.version} over feature version ${table.features}, ` +
    `${table.weights.length} numbers laid out ${JSON.stringify(table.layout)}, ` +
    `and ${table.logSigma.length} spreads.`,
    table.date
      ? `// Fitted ${table.date} from seed ${table.seed}: ${table.iterations} PPO iterations on ` +
        `${table.steps} asks from ${table.bouts} mirrored self-play bouts; half-life ` +
        `${table.halfLife} s, lambda ${table.lambda}, clip ${table.clip}, entropy ${table.entropy}. ` +
        `Scored ${table.score.toFixed(3)} points a bout against ${beaten || "nothing"} on the held-out seed.`
      : "// Unfitted: zero weights, so that the mind loads; the trainer overwrites this file.",
    "//",
    "// What an output means is in src/golem/policy.ts, what the columns are in src/golem/pilot.ts,",
    "// and what a step was paid in src/golem/reward.ts; a build that reads another version",
    "// refuses this file by name.",
    "import type { PolicyWeights } from \"./policy.ts\";",
    "import { GOLEM_REWARD } from \"./reward.ts\";",
    "",
    `export const POLICY_WEIGHTS: PolicyWeights = ${named.replace("\"reward\":null", "\"reward\":GOLEM_REWARD")};`,
    "",
  ].join("\n");
}

/** The shipped table around a fit: the shape from `freshPolicyTable`, the run's own header on top. */
export function policyTable(weights, logSigma, header) {
  return {
    ...freshPolicyTable(Array.from(weights, round5), Array.from(logSigma, round5)),
    ...header,
  };
}

// ------------------------------------------------------------------------------------- main

const isMain = process.argv[1] !== undefined
  && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  const argv = process.argv.slice(2);
  const flag = (name, fallback) => {
    const at = argv.indexOf(`--${name}`);
    return at >= 0 && argv[at + 1] !== undefined ? argv[at + 1] : fallback;
  };
  const seed = Number(flag("seed", 20260913)) >>> 0;
  const iterations = Math.max(1, Number(flag("iterations", 30)));
  const bouts = Math.max(2, Number(flag("bouts", 32)));
  const cap = Number(flag("cap", 60));
  const random = Math.max(0, Number(flag("random", 40)));
  const workers = Math.max(1, Number(flag("workers", Math.max(1, availableParallelism() - 2))));
  const halfLife = Number(flag("half-life", 4));
  const lambda = Number(flag("lambda", 0.95));
  const clip = Number(flag("clip", 0.2));
  const entropy = Number(flag("entropy", 0.003));
  const rate = Number(flag("rate", 1e-4));
  const valueRate = Number(flag("value-rate", 1e-3));
  const sigmaRate = Number(flag("sigma-rate", rate * 10));
  const epochs = Math.max(1, Number(flag("epochs", 4)));
  const batch = Math.max(1, Number(flag("batch", 4096)));
  const targetKl = Math.max(0, Number(flag("target-kl", 0.03)));
  const sigmaFloor = Number(flag("sigma-floor", -3));
  const sigmaRoof = Number(flag("sigma-roof", 0.5));
  const every = Math.max(0, Number(flag("evaluate", 5)));
  const evalBouts = Math.max(2, Number(flag("eval-bouts", 96)));
  // The last rating is the session's number and the periodic ones are its curve, so they are not
  // the same size: a curve wants a point often and the number wants a small standard error.
  const finalBouts = Math.max(2, Number(flag("final-bouts", evalBouts * 4)));
  // The critic does not ship, so its width is a knob and not a frozen choice; the actor's is not.
  const valueHidden = flag("value-hidden", "64,64")
    .split(",").map((s) => Math.max(1, Number(s.trim()))).filter((n) => Number.isFinite(n));
  const valueLayout = Object.freeze({ ...VALUE_LAYOUT, hidden: Object.freeze(valueHidden) });
  const league = flag("league", PPO_LEAGUE.join(",")).split(",").map((s) => s.trim()).filter(Boolean);
  const resumeFrom = flag("resume", null);
  const write = flag("out", null);
  const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 13);
  // Concatenated rather than interpolated: a backticked span that looks like a path is a durable
  // reference to the documentation tests, and this one names a file that never exists.
  const out = resolve(flag("log", "tournaments/ppo-" + stamp + "-" + seed + ".jsonl"));
  const checkpoint = out.replace(/\.jsonl$/, "") + "-checkpoint.json";
  if (existsSync(out)) throw new Error(`${out} exists; a run does not append to another run's log`);
  mkdirSync(dirname(out), { recursive: true });
  const log = (line) => writeFileSync(out, JSON.stringify(line) + "\n", { flag: "a" });
  const progress = (label) => ({ done, total, seconds }) => {
    if (done % 128 === 0 || done === total) console.log(`  ${label}: ${done}/${total} bouts, ${seconds.toFixed(0)} s`);
  };

  const date = new Date().toISOString().slice(0, 10);
  let weights = initWeights(POLICY_LAYOUT, seed);
  let valueWeights = initWeights(valueLayout, (seed ^ 0x1c) >>> 0);
  let logSigma = new Float64Array(ACTION_AXES).fill(-0.7);
  let norm = freshNormalisation(PILOT_FEATURE_COUNT);
  let startAt = 1;
  let totalBouts = 0;
  let totalSteps = 0;
  let actor = null;
  let spread = null;
  let critic = null;
  if (resumeFrom !== null) {
    const saved = JSON.parse(readFileSync(resolve(resumeFrom), "utf8"));
    weights = Float64Array.from(saved.weights);
    valueWeights = Float64Array.from(saved.valueWeights);
    logSigma = Float64Array.from(saved.logSigma);
    norm = saved.normalisation;
    startAt = saved.iteration + 1;
    totalBouts = saved.bouts ?? 0;
    totalSteps = saved.steps ?? 0;
    console.log(`  resuming at iteration ${startAt} from ${resumeFrom}`);
  }

  log({
    type: "header", seed, date, version: POLICY_VERSION, features: PILOT_FEATURES_VERSION,
    layout: POLICY_LAYOUT, valueLayout, reward: GOLEM_REWARD, league,
    iterations, bouts, cap, random, workers, halfLife, lambda, clip, entropy, rate, valueRate,
    sigmaRate, epochs, batch, targetKl, sigmaFloor, sigmaRoof,
    evaluate: every, evalBouts, finalBouts, resumeFrom,
  });
  console.log(`ppo: seed ${seed}, ${iterations} iterations of ${bouts} mirrored bouts, `
    + `${netSize(POLICY_LAYOUT)} actor weights, ${workers} workers`);

  let rated = null;
  /**
   * One point of the curve: the fit against the uniform baseline and the driver, paired.
   *
   * Taken at iteration zero as well as every `--evaluate` after it, because the curve has to
   * start somewhere honest. The untrained policy is not the uniform baseline -- it plays the
   * *mean* of a randomly initialised head, which is a constant-ish command and already a
   * different thing from a uniform draw -- so whatever it scores is the number the fit has to
   * improve on, and a session that reported only the last point could not tell the two apart.
   */
  const ratePoint = async (iteration, wanted) => {
    const eseed = (seed ^ 0xc0f1c0f1) >>> 0;
    const epool = buildPool({ seed: eseed, random });
    const result = await ratePolicy({
      weights, logSigma, norm, league, pool: epool, seed: eseed,
      bouts: Math.max(2, Math.ceil(wanted / league.length / 2) * 2),
      workers, cap, mirror: true, onProgress: progress(`rate ${iteration}`),
    });
    console.log(`  === rating after iteration ${iteration}: ${result.per} bouts a contender ===`);
    for (const name of result.names) {
      const r = result.results[name];
      console.log(`    ${name.padEnd(8)} points ${meanOf(result.points[name]).toFixed(4)} `
        + `bar ${meanOf(result.bar[name]) >= 0 ? "+" : ""}${meanOf(result.bar[name]).toFixed(4)}  `
        + `w/d/l ${r.wins}/${r.draws}/${r.losses}  strokes ${(r.strokes ?? 0).toFixed(1)} `
        + `dmg/stroke ${(r.strokeDamage ?? 0).toFixed(2)} clinch ${(r.clinchSeconds ?? 0).toFixed(1)}`);
    }
    for (const [other, d] of Object.entries(result.differences)) {
      console.log(`    fit - ${other.padEnd(8)} points ${d.points >= 0 ? "+" : ""}${d.points.toFixed(4)} `
        + `+- ${d.pointsSem.toFixed(4)}  bar ${d.bar >= 0 ? "+" : ""}${d.bar.toFixed(4)} `
        + `+- ${d.barSem.toFixed(4)}  d ${d.d >= 0 ? "+" : ""}${d.d.toFixed(3)}`);
    }
    log({
      type: "rating", iteration, per: result.per,
      results: Object.fromEntries(Object.entries(result.results).map(([k, r]) => [k, { score: round4(r.score), margin: round4(r.margin), bouts: r.bouts }])),
      differences: Object.fromEntries(Object.entries(result.differences).map(([k, d]) => [k, {
        points: round4(d.points), pointsSem: round4(d.pointsSem),
        bar: round4(d.bar), barSem: round4(d.barSem), d: round4(d.d),
      }])),
      structural: result.results,
    });
    return result;
  };
  if (every > 0 && startAt === 1) rated = await ratePoint(0, evalBouts);

  for (let iteration = startAt; iteration <= iterations; iteration += 1) {
    const started = Date.now();
    const pool = buildPool({ seed: (seed ^ iteration) >>> 0, random });
    const rollout = await collectRollouts({
      pool, weights, logSigma, norm, seed: (seed + iteration * 7919) >>> 0, bouts, workers, cap,
      onProgress: progress(`iteration ${iteration}`),
    });
    const collected = (Date.now() - started) / 1000;
    if (rollout.count === 0) throw new Error("an iteration collected no asks at all");
    const { returns, lengths, share, penalty, bare } = episodeReturns(rollout);
    const fit = ppoFit(rollout, {
      weights, logSigma, valueWeights, valueLayout, norm, seed: (seed ^ iteration * 31) >>> 0,
      halfLife, lambda, clip, entropy, rate, valueRate, sigmaRate, epochs, batch, targetKl,
      sigmaFloor, sigmaRoof, actor, spread, critic,
    });
    ({ actor, spread, critic } = fit);
    totalBouts += rollout.bouts;
    totalSteps += rollout.count;
    // Frozen for the *next* iteration, and only now: the rollout above was drawn under the old
    // one and its log-probabilities belong to it.
    norm = extendNormalisation(norm, rollout);
    const line = {
      type: "iteration", iteration, bouts: rollout.bouts, steps: rollout.count,
      episodes: returns.length, decided: round4(rollout.decided), margin: round4(rollout.margin),
      ret: round5(meanOf(returns)), retSem: round5(semOf(returns)),
      length: round4(meanOf(lengths)), penaltyShare: round4(share),
      penalty: round5(penalty), bare: round5(bare),
      kl: round5(fit.kl), clipFraction: round4(fit.clipFraction), entropy: round4(fit.entropy),
      valueLoss: round5(fit.valueLoss), explained: round4(fit.explainedAfter),
      advantageSd: round5(fit.advantageSd),
      epochsRun: fit.epochs, updates: fit.updates,
      stopped: fit.stopped === null ? null : round5(fit.stopped.kl),
      logSigma: Array.from(logSigma, round4),
      collectSeconds: round4(collected), seconds: round4((Date.now() - started) / 1000),
    };
    log(line);
    console.log(`  it ${String(iteration).padStart(2)}: return ${line.ret >= 0 ? "+" : ""}${line.ret.toFixed(4)} `
      + `+- ${line.retSem.toFixed(4)}  decided ${(rollout.decided * 100).toFixed(0)}%  `
      + `asks ${line.length.toFixed(0)}  penalty ${(share * 100).toFixed(1)}%  `
      + `KL ${fit.kl.toFixed(5)}  clip ${(fit.clipFraction * 100).toFixed(1)}%  `
      + `H ${fit.entropy.toFixed(2)}  EV ${fit.explainedAfter.toFixed(3)}  `
      + `sigma ${Math.exp(logSigma[0]).toFixed(3)}  `
      + `${fit.updates} steps${fit.stopped === null ? "" : ` (stopped in epoch ${fit.stopped.epoch})`}  `
      + `${line.seconds.toFixed(0)} s`);
    writeFileSync(checkpoint, JSON.stringify({
      iteration, seed, date, bouts: totalBouts, steps: totalSteps,
      weights: Array.from(weights, round5), valueWeights: Array.from(valueWeights, round5),
      logSigma: Array.from(logSigma, round5), normalisation: norm,
    }));

    const last = iteration === iterations;
    if (every > 0 && (last || iteration % every === 0)) {
      rated = await ratePoint(iteration, last ? finalBouts : evalBouts);
    }
  }

  const baselines = {};
  if (rated !== null) for (const name of rated.names) if (name !== FIT_NAME) baselines[name] = rated.results[name].score;
  const table = policyTable(weights, logSigma, {
    seed, date, iterations, bouts: totalBouts, steps: totalSteps,
    halfLife, lambda, clip, entropy, reward: GOLEM_REWARD,
    normalisation: {
      count: norm.count, mean: Array.from(norm.mean, round5), variance: Array.from(norm.variance, round5),
    },
    score: rated === null ? 0 : rated.results[FIT_NAME].score, baselines,
  });
  log({ type: "weights", table: { ...table, weights: [] } });
  const text = renderPolicyModule(table);
  if (write !== null) {
    writeFileSync(resolve(write), text);
    console.log(`  wrote ${write} (${(text.length / 1024).toFixed(1)} KB)`);
  }
  console.log(`log: ${out}`);
  console.log(`checkpoint: ${checkpoint}`);
}
