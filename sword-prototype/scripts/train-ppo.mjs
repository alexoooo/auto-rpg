// Fit `golem-policy` by PPO on the dense reward, in mirrored self-play. Session 13 of the style set.
//
//   node scripts/train-ppo.mjs [--seed 20260913] [--iterations 30] [--bouts 32] [--cap 60]
//        [--workers N] [--shards 8] [--random 40] [--half-life 4] [--lambda 0.95] [--clip 0.2]
//        [--entropy 0.003] [--rate 1e-4] [--value-rate 1e-3] [--sigma-rate 10x rate]
//        [--epochs 4] [--batch 4096] [--target-kl 0.03]
//        [--sigma-floor -3] [--sigma-roof 0.5] [--evaluate 5] [--eval-bouts 96]
//        [--final-bouts 4x eval] [--value-hidden 64,64] [--opponent golem-driver]
//        [--terminals maul,mace|all]   -- absent is the viable set; `all` is every build
//        [--reward-win 0.5] [--reward-clinch 0.004] [--reward-idle 0.004] [--reward-tick 0]
//        [--reward-closing 0] [--reward-stall 0] [--reward-outside 0] [--reward-swing 0]
//        [--out src/golem/policy-weights.ts] [--log tournaments/ppo-....jsonl] [--resume f.json]
//        [--from other-checkpoint.json]  -- another run's weights, a fresh log [--label arm-1]
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
// **Self-play, mirrored, and it is `--opponent` that turns it off.** Both sides of every bout are
// the same weights on the same body, so a bout is a fair test of the mind and *both* sides are
// data, and the opposition improves exactly as fast as the policy does. Session 14's calibration
// found what that costs, and it is not small: see the next paragraph, and the entry in
// `docs/measurements.md`. `--opponent <policy>` puts a fixed mind on the other side instead, in
// both corners, with only the fit's own sides recorded -- half the samples a bout, and a mean
// return that is not zero by construction.
//
// **The self-play return is not the progress curve, and cannot be -- and that is not only a
// reporting problem.** Both sides of a mirrored bout are recorded, and one side's bar margin is
// the other's negated exactly, so the mean return over an iteration is zero up to the two
// penalties whatever the policy has learned. Anybody reading a flat line there and concluding the
// fit had stalled would be reading an identity. Worse, the identity says *which terms a mirrored
// fit can optimise in the mean at all*: the margin and `win` are both antisymmetric and cancel,
// so the only two that survive are `clinch` and `idle`, and both of those are charges for
// engaging. Session 13's fit found the equilibrium that permits -- standing at 2.27 times its
// opponent's reach and swinging at nothing -- and Session 14's calibration is the measurement of
// it. `--opponent` and the four `--reward-*` flags exist because of that finding. The curve this
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
// -- the last of those is `reward.ts`'s own instruction and this is where it is checked. The
// penalty share counts every shaping row in the table, the clock included, and never `win`; since
// Session 06 of the learn set the row also carries `penaltyRows`, that same share split by row,
// because a table with four charges and a credit in it cannot be audited against one number.
//
// **The entropy bonus pushes the spread up by exactly its own coefficient, and 0.003 was too
// much.** The differential entropy of a diagonal Gaussian is the sum of its `logSigma` plus a
// constant, so the bonus contributes precisely `entropy` to the gradient on every spread, every
// sample, whatever the state -- a constant upward force. The surrogate's own force on the same
// nine numbers is the score function times the advantage, and the advantage shrinks as the critic
// fits, so the sign of the drift is set by which of the two is larger late in a run. Measured over
// seven runs in the Session 14 entry of `docs/measurements.md`: at 0.003 the mean `logSigma` rises
// at t 18 and t 33 over forty iterations, and at 0.0003 it falls in four runs out of four. The
// default here is the historical 0.003 and is left alone so that older runs stay readable; what
// the league runs at is 0.0003, and a run that means to sharpen should pass it.
//
// **The reward coefficients are flags, and a swept table may not ship.** Eight of them since
// Session 06 of the learn set, which added the closing metre and the three habits the owner's eye
// picked out. They can be flags only because `mergeRollouts` applies the table in the main thread,
// over packs that carry every quantity in `PACK_COLUMNS` raw, so the same collected bouts pay
// differently under a different table and no worker has to be rebuilt. `--out` refuses a fit paid
// under anything but `GOLEM_REWARD`, because `renderPolicyModule` writes the shipped table's
// *name* into the generated module: a module saying `reward: GOLEM_REWARD` over weights fitted to
// something else would be a lie with nothing in the tree able to catch it. Read the checkpoint
// instead, or move the table in `src/golem/reward.ts` first.
//
// **A restarted run is the same run, and that took three changes rather than one.** Session 04 of
// the learn set runs several arms at once and restarts any that dies from its last checkpoint, so
// "resumed" had to stop meaning "nearly the same". `--resume` continues *its own* log -- the
// refusal that a run does not append to another run's log now excuses exactly the checkpoint that
// log wrote and nothing else, which is `resumesOwnLog`. `--from` is the other half and is what the
// old `--resume` was being used for by hand: another run's weights, a fresh log, the iteration
// counter back at one. And the checkpoint carries `adam`, because Adam's moments are not a
// convenience -- with cold moments every one of the 87,308 weights moves by exactly the rate in
// the direction one minibatch chose, which is the calibration's own finding about the first
// iteration of a run, and a run restarted four times overnight would pay it four times. They are
// written at full precision where the weights are rounded to five places: a second moment is
// around 1e-8 and `round5` would set it to zero, which is the same as not saving it.
//
// **`--shards` puts the fit on K threads and is not allowed to move a number.** Session 05 of the
// learn set. The record's 109 s iteration is 86 s of `ppoFit` on one thread, and Session 04
// measured the same shape from the other end: tripling an arm's collectors bought 1.29x because
// about two thirds of a league iteration is a thread no collector touches. `FitPool` below splits
// each minibatch K ways over persistent workers, sums the K partials **in shard order 0..K-1** and
// takes one Adam step here; the shuffle, the standardisation, the trust region and the read-out are
// where they were. The set's ninth frozen choice is that this may not change a number, so the bar
// is equality with the single thread to 1e-9 on a real rollout and the test in `tests/ppo.test.mjs`
// is that comparison and not a bandit that happens to converge. **The default is eight, which is
// the knee of the measured curve rather than its fastest point**: the first eight threads give back
// 83 % of themselves and the next eight give back 27 %, so eight beside twenty-two collectors is
// the shipped configuration and sixteen is merely the quickest. `--shards 1` allocates no shared
// memory at all and runs the code this script has always run, which is what makes a comparison
// against a number taken before this session repeatable.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Worker, isMainThread } from "node:worker_threads";

import { forward, initWeights, netScratch, netSize, backwardFrom } from "../src/golem/neural-net.ts";
import { PILOT_FEATURE_COUNT, PILOT_FEATURES_VERSION } from "../src/golem/pilot.ts";
import {
  ACTION_AXES, ACTION_WIDTH, POLICY_LAYOUT, POLICY_VERSION, VALUE_LAYOUT,
  actionEntropy, actionLogProb, checkPolicyWeights, entropyGrad, freshNormalisation,
  freshPolicyTable, logProbGrad, normalise,
} from "../src/golem/policy.ts";
import { GOLEM_REWARD, stepReward } from "../src/golem/reward.ts";
import { mulberry32 } from "../src/rng.ts";
import { VIABLE_TERMINALS, viableMirror } from "../src/golem/viability.ts";
import { armedTerminal, buildPool, runJobs, scheduleJobs } from "./tournament.mjs";
import { columnsOf, meanOf, semOf } from "./train-learner.mjs";
import { evaluate } from "./tune.mjs";
import { CTL, COMMAND, FIT_ROLE, NOTE_BYTES, PARAM, SCALARS, readNote } from "./fit-worker.mjs";

/** The name the rollouts and the evaluation give the fit, and the two it is rated against. */
export const FIT_NAME = "fit";
export const UNIFORM_NAME = "uniform";

/** The hand-coded opposition an evaluation rates every contender over. */
export const PPO_LEAGUE = Object.freeze([
  "golem-driver", "golem-form", "golem-brawler", "golem-duelist", "golem-fencer",
]);

/** The reward table's rows, so a run can say whether the table it paid is the shipped one. */
export const REWARD_KEYS = Object.freeze([
  "win", "clinch", "idle", "tick", "closing", "stall", "outside", "swing",
]);

/**
 * The rows that are *shaping*, in the order a table lists them, which is what a share is taken of.
 *
 * `win` is not here and that is the whole of the distinction: it is paid on the outcome, so a
 * share that counted it would say a run was dominated by shaping when what it was dominated by was
 * winning. Every other row is a coefficient on a quantity a body accumulated by standing somewhere
 * or doing something, and `src/golem/reward.ts` asks a run to report what fraction of the return
 * they came to -- per row since Session 06 of the learn set, because a table with four charges in
 * it cannot be audited against one number.
 */
export const SHAPING_ROWS = Object.freeze([
  "clinch", "idle", "tick", "closing", "stall", "outside", "swing",
]);

/**
 * The raw columns a pilot pack must carry, by name, before this file will price one.
 *
 * A pack collected by an older worker has fewer, and the failure without this check is silent and
 * expensive: `undefined` times a coefficient is `NaN`, one `NaN` reward poisons its whole episode's
 * advantages, and what a run reports is a fit that quietly stopped learning. Named rather than
 * counted, so the message says which column and therefore which worker wrote the pack.
 */
export const PACK_COLUMNS = Object.freeze([
  "dealt", "taken", "seconds", "clinch", "idle", "closing", "stall", "outside", "swing", "done",
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
 *
 * **The reward is applied here and not in the worker**, which is why a table can be swept at all:
 * a pack carries the quantities in `PACK_COLUMNS` raw, so the same collected bouts would pay
 * differently under a different table and the coefficients are a flag rather than a rebuild.
 * `reward` defaults to the shipped table so every caller that does not care reads as it did before.
 *
 * **What each row took out is kept per row and not only in total**, which is Session 06 of the
 * learn set's requirement of this function: a table with four charges and a credit in it is
 * auditable against the behaviour it was meant to move only if a run can say which row did the
 * moving. `charges` is one signed array a row, positive meaning taken out of the return, and
 * `penalty` is their sum -- so `closing`, the one row that pays, lowers the penalty exactly as
 * much as it raises the reward.
 */
export function mergeRollouts(parts, reward = GOLEM_REWARD) {
  let count = 0;
  for (const part of parts) count += part.logp.length;
  const width = PILOT_FEATURE_COUNT;
  const out = {
    count, episodes: parts.length, width,
    x: new Float32Array(count * width),
    a: new Float64Array(count * ACTION_WIDTH),
    logp: new Float64Array(count),
    reward: new Float64Array(count),
    /**
     * What the shaping rows took out of that reward in total, so a run can report their share.
     *
     * Every row of `SHAPING_ROWS` and nothing else: `win` is left in the reward, because it is paid
     * on the outcome and a share that counted it would say a run was dominated by shaping when
     * what it was dominated by was winning. `closing` is a credit and enters here negative, which
     * is what makes the sum still the honest answer to "what did shaping do to this return".
     */
    penalty: new Float64Array(count),
    /** The same number split by row, so a table can be audited against the row it was meant to move. */
    charges: Object.fromEntries(SHAPING_ROWS.map((row) => [row, new Float64Array(count)])),
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
    for (const column of PACK_COLUMNS) {
      const held = part[column];
      if (held === undefined || held === null) {
        throw new Error(`a pack carries no "${column}" column; this build prices `
          + `${PACK_COLUMNS.join(", ")}, and a pack written by an older worker cannot be re-priced`);
      }
      if (held.length !== n) {
        throw new Error(`a pack's "${column}" column is ${held.length} long over ${n} asks`);
      }
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
        clinchSeconds: part.clinch[i], idleMetres: part.idle[i],
        closingMetres: part.closing[i], stallSeconds: part.stall[i],
        outsideSeconds: part.outside[i], emptyStrokes: part.swing[i],
        done, outcome,
      };
      out.reward[at + i] = stepReward(w, reward);
      // Each row's own contribution, signed so that positive is taken out of the return. Written
      // out a row at a time rather than by differencing `stepReward` against a window with the
      // quantities zeroed, which is how this read before there were seven of them: that spelling
      // needed a list of field names kept in step with `RewardWindow` by hand, and a row added to
      // one and forgotten in the other would have been counted in the reward and not in the share.
      const charge = out.charges;
      charge.clinch[at + i] = reward.clinch * part.clinch[i];
      charge.idle[at + i] = reward.idle * part.idle[i];
      charge.tick[at + i] = reward.tick * part.seconds[i];
      charge.closing[at + i] = -reward.closing * part.closing[i];
      charge.stall[at + i] = reward.stall * part.stall[i];
      charge.outside[at + i] = reward.outside * part.outside[i];
      charge.swing[at + i] = reward.swing * part.swing[i];
      let total = 0;
      for (const row of SHAPING_ROWS) total += charge[row][at + i];
      out.penalty[at + i] = total;
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

// ------------------------------------------------------------------------------- the shard pool

/** Where the shards' entry point lives, resolved once so a pool can be opened from any cwd. */
const FIT_WORKER = new URL("./fit-worker.mjs", import.meta.url);

/** How long the main thread will wait on a barrier before it decides a shard has died, in ms. */
const BARRIER_TIMEOUT = 120_000;

/**
 * A persistent pool of worker threads that computes `ppoFit`'s minibatch gradients.
 *
 * **What it buys and what it costs.** The fit is the binding constraint of this plan set: the
 * record's 109 s iteration is 86 s of `ppoFit` on one thread, and Session 04 measured the same
 * fact from the other end -- three arms at ten collectors do 2.15 times the work of one arm at
 * thirty, and not the 2.4 the bar wanted, because roughly two thirds of an iteration is a thread
 * no collector can help. This is that thread cut K ways. It costs one `SharedArrayBuffer`
 * allocation an iteration and three array copies a minibatch step, and it buys nothing at all in
 * accuracy: the set's ninth frozen choice is that the sharded fit may not change a number.
 *
 * **The sum is taken in shard order and that is the whole design.** Each shard owns a contiguous
 * slice of the minibatch by index, sums its slice's gradients into its own arrays, and counts up a
 * barrier; the main thread then adds the K partials into one gradient triple **in shard order
 * 0..K-1** and takes one Adam step. Floating-point addition is not associative, so a pool that
 * summed in completion order would answer differently on every run of the same seed and there
 * would be no test to write. What is left is a fixed reassociation of one sum, which moves a
 * gradient in its last bits and a weight by far less than the 1e-9 the bar is stated at -- and at
 * K = 1 moves nothing at all, because adding one partial to zero is exact. The equality test says
 * both of those out loud.
 *
 * **Three arrays cross a step and five cross an iteration.** The rollout's `x`, `a` and `logp`,
 * the standardised advantages and the returns are copied into shared memory once an iteration by
 * `bind`, together with the frozen normalisation and the two surrogate constants; the weights, the
 * critic's weights and the nine spreads are copied once a *step*, because Adam has just moved
 * them. At the shipped layout that second copy is 87,308 + 8,833 + 9 doubles, about 770 KB, which
 * is a memcpy against a minibatch of four thousand backward passes.
 *
 * **The shards block on Atomics and never return to their event loop.** A step is a few
 * milliseconds and a message round trip is a scheduler decision. The one thing that must be a
 * message is the binding, because a `SharedArrayBuffer` only reaches another thread through the
 * port; the shard picks that up with `receiveMessageOnPort` from inside the wait, which is what
 * keeps `bind` -- and therefore `ppoFit` -- synchronous.
 */
export class FitPool {
  constructor({ shards, layout, valueLayout, workers, control, notes }) {
    this.shards = shards;
    this.layout = layout;
    this.valueLayout = valueLayout;
    this.size = netSize(layout);
    this.valueSize = netSize(valueLayout);
    this.workers = workers;
    this.control = control;
    this.ctl = new Int32Array(control);
    this.notes = new Uint8Array(notes);
    this.bound = null;
    this.closed = false;
    // The sums the caller reads, owned by the pool and rewritten by every step, so a minibatch
    // allocates nothing. `ppoFit` hands them straight to `adamStep`.
    this.grad = new Float64Array(this.size);
    this.sigmaGrad = new Float64Array(ACTION_AXES);
    this.valueGrad = new Float64Array(this.valueSize);
  }

  /**
   * K threads started and waiting, with the module graph already imported.
   *
   * Asynchronous because a `Worker` is, and because a pool that returned before its threads had
   * finished importing would put the cost of the import inside the first minibatch and call it a
   * fit time. Every caller opens one pool for a whole run.
   */
  static async open({ shards, layout = POLICY_LAYOUT, valueLayout = VALUE_LAYOUT }) {
    if (!Number.isInteger(shards) || shards < 1) throw new Error(`a fit pool of ${shards} shards is not a pool`);
    const control = new SharedArrayBuffer(CTL.LENGTH * 4);
    const notes = new SharedArrayBuffer(shards * NOTE_BYTES);
    const workers = [];
    await Promise.all(Array.from({ length: shards }, (_, shard) => new Promise((ready, fail) => {
      const worker = new Worker(FIT_WORKER, {
        workerData: { role: FIT_ROLE, shard, shards, control, notes },
      });
      // A shard that is waiting on Atomics is not work the process should stay alive for: a run
      // that throws before it reaches `close` should still exit, and say why.
      worker.unref();
      workers.push(worker);
      worker.once("message", () => ready());
      worker.once("error", fail);
    })));
    return new FitPool({ shards, layout, valueLayout, workers, control, notes });
  }

  /** Every shard told what generation it is on, and waited for. */
  #command(command) {
    if (this.closed) throw new Error("this fit pool has been closed");
    Atomics.store(this.ctl, CTL.DONE, 0);
    Atomics.store(this.ctl, CTL.COMMAND, command);
    Atomics.add(this.ctl, CTL.GENERATION, 1);
    Atomics.notify(this.ctl, CTL.GENERATION);
    if (command === COMMAND.QUIT) return;
    for (;;) {
      const done = Atomics.load(this.ctl, CTL.DONE);
      if (done >= this.shards) break;
      if (Atomics.wait(this.ctl, CTL.DONE, done, BARRIER_TIMEOUT) === "timed-out"
        && Atomics.load(this.ctl, CTL.DONE) === done) {
        throw new Error(`a fit shard has not answered in ${BARRIER_TIMEOUT / 1000} s; `
          + `${done} of ${this.shards} finished`);
      }
    }
    if (Atomics.load(this.ctl, CTL.ERROR) === 1) {
      const said = [];
      for (let shard = 0; shard < this.shards; shard += 1) {
        const note = readNote(this.notes, shard);
        if (note !== "") said.push(`shard ${shard}: ${note}`);
      }
      throw new Error(`a fit shard failed -- ${said.join(" | ")}`);
    }
  }

  /**
   * One iteration's rollout, advantages, returns and frozen normalisation put into shared memory.
   *
   * Fresh buffers rather than a grown capacity, because a rollout is about 57,000 asks at the
   * shipped configuration and the whole binding is some tens of megabytes allocated once against
   * an iteration that runs for a minute. `x` is widened from the pack's `Float32Array` here
   * exactly as `ppoFit`'s own `load` widens it, which is lossless and is why the two paths read
   * the same number.
   *
   * The normalisation is the one the rollout was *collected* under: both callers extend theirs
   * with `extendNormalisation` after the fit returns and never during it, so what a shard reads
   * cannot move while it is reading it. That is the invariant this session was told to be careful
   * about, and the only place it could be broken is here.
   */
  bind(rollout, scaled, returns, norm, { clip = 0.2, entropy = 0 } = {}) {
    const { count, width } = rollout;
    const shared = (Kind, length) => new Kind(new SharedArrayBuffer(length * Kind.BYTES_PER_ELEMENT));
    const bound = {
      count, width,
      x: shared(Float64Array, count * width),
      a: shared(Float64Array, count * ACTION_WIDTH),
      logp: shared(Float64Array, count),
      scaled: shared(Float64Array, count),
      returns: shared(Float64Array, count),
      mean: shared(Float64Array, width),
      variance: shared(Float64Array, width),
      order: shared(Int32Array, count),
      weights: shared(Float64Array, this.size),
      valueWeights: shared(Float64Array, this.valueSize),
      logSigma: shared(Float64Array, ACTION_AXES),
      params: shared(Float64Array, PARAM.LENGTH),
      grads: shared(Float64Array, this.shards * this.size),
      sigmaGrads: shared(Float64Array, this.shards * ACTION_AXES),
      valueGrads: shared(Float64Array, this.shards * this.valueSize),
      scalars: shared(Float64Array, this.shards * SCALARS.LENGTH),
    };
    bound.x.set(rollout.x);
    bound.a.set(rollout.a);
    bound.logp.set(rollout.logp);
    bound.scaled.set(scaled);
    bound.returns.set(returns);
    for (let k = 0; k < width; k += 1) { bound.mean[k] = norm.mean[k]; bound.variance[k] = norm.variance[k]; }
    bound.params[PARAM.CLIP] = clip;
    bound.params[PARAM.ENTROPY] = entropy;
    this.bound = bound;
    for (const worker of this.workers) {
      worker.postMessage({
        type: "bind", layout: this.layout, valueLayout: this.valueLayout,
        size: this.size, valueSize: this.valueSize, count, width, normCount: norm.count,
        x: bound.x.buffer, a: bound.a.buffer, logp: bound.logp.buffer,
        scaled: bound.scaled.buffer, returns: bound.returns.buffer,
        mean: bound.mean.buffer, variance: bound.variance.buffer, order: bound.order.buffer,
        weights: bound.weights.buffer, valueWeights: bound.valueWeights.buffer,
        logSigma: bound.logSigma.buffer, params: bound.params.buffer,
        grads: bound.grads.buffer, sigmaGrads: bound.sigmaGrads.buffer,
        valueGrads: bound.valueGrads.buffer, scalars: bound.scalars.buffer,
      });
    }
    this.#command(COMMAND.BIND);
    return this;
  }

  /**
   * One minibatch, sharded, summed in shard order, and reported the way the inner loop reports it.
   *
   * The returned arrays are the pool's own and are rewritten by the next step, which is what keeps
   * a minibatch free of allocation; `ppoFit` hands them to `adamStep` and never keeps them. The
   * four scalars are the same four sums the single thread accumulates -- `kl`, the clipped count,
   * the entropy and the value loss -- with the clipped count exact, being a sum of ones.
   */
  step({ at, end, epoch = 0, order, weights, valueWeights, logSigma }) {
    const bound = this.bound;
    if (bound === null) throw new Error("a fit pool steps only after it has been bound to a rollout");
    for (let m = at; m < end; m += 1) bound.order[m] = order[m];
    bound.weights.set(weights);
    bound.valueWeights.set(valueWeights);
    bound.logSigma.set(logSigma);
    Atomics.store(this.ctl, CTL.AT, at);
    Atomics.store(this.ctl, CTL.END, end);
    Atomics.store(this.ctl, CTL.EPOCH, epoch);
    this.#command(COMMAND.STEP);
    // Shard order 0..K-1, over every block, and never a completion order. This is the line the
    // equality test is about.
    this.grad.fill(0);
    this.sigmaGrad.fill(0);
    this.valueGrad.fill(0);
    let kl = 0;
    let clipped = 0;
    let entropy = 0;
    let valueLoss = 0;
    for (let shard = 0; shard < this.shards; shard += 1) {
      const gradAt = shard * this.size;
      for (let k = 0; k < this.size; k += 1) this.grad[k] += bound.grads[gradAt + k];
      const sigmaAt = shard * ACTION_AXES;
      for (let k = 0; k < ACTION_AXES; k += 1) this.sigmaGrad[k] += bound.sigmaGrads[sigmaAt + k];
      const valueAt = shard * this.valueSize;
      for (let k = 0; k < this.valueSize; k += 1) this.valueGrad[k] += bound.valueGrads[valueAt + k];
      const scalarAt = shard * SCALARS.LENGTH;
      kl += bound.scalars[scalarAt + SCALARS.KL];
      clipped += bound.scalars[scalarAt + SCALARS.CLIPPED];
      entropy += bound.scalars[scalarAt + SCALARS.ENTROPY];
      valueLoss += bound.scalars[scalarAt + SCALARS.VALUE_LOSS];
    }
    return {
      grad: this.grad, sigmaGrad: this.sigmaGrad, valueGrad: this.valueGrad,
      kl, clipped, entropy, valueLoss, count: end - at,
    };
  }

  /** The threads asked to stop, and waited for, so a run's exit is not a `terminate`. */
  async close() {
    if (this.closed) return;
    this.#command(COMMAND.QUIT);
    this.closed = true;
    this.bound = null;
    await Promise.all(this.workers.map((worker) => new Promise((done) => {
      worker.once("exit", done);
      worker.ref();
    })));
  }
}

const ADAM = Object.freeze({ beta1: 0.9, beta2: 0.999, eps: 1e-8 });

/** One Adam state per parameter block, so the actor, the spread and the critic move separately. */
function adamState(size) {
  return { m: new Float64Array(size), v: new Float64Array(size), step: 0 };
}

/**
 * The three Adam blocks a fit carries, in the order a checkpoint writes them.
 *
 * Named rather than spelled out at each site because `scripts/league.mjs` persists the same three
 * for the main and for every exploiter, and a fourth block added here should turn that file red
 * rather than be quietly dropped from half the roles.
 */
export const MOMENT_KEYS = Object.freeze(["actor", "spread", "critic"]);

/** One Adam block as JSON: the two moments flat, and the step count that debiases them. */
export function adamToJson(state) {
  if (state === null || state === undefined) return null;
  return { m: Array.from(state.m), v: Array.from(state.v), step: state.step };
}

/**
 * And back, at the width the reader expects, or null with a reason.
 *
 * A width mismatch is not an error and must not be: `--value-hidden` moves the critic's size, and
 * a checkpoint written under a different one has value moments there is nothing sensible to do
 * with -- the same case `roleFromCheckpoint` in `scripts/league.mjs` handles for the weights
 * themselves. It starts that one block cold and says which, rather than refusing a checkpoint
 * whose actor is perfectly good.
 */
export function adamFromJson(json, size) {
  if (json === null || json === undefined) return { state: null, note: "absent" };
  if (!Array.isArray(json.m) || !Array.isArray(json.v) || json.m.length !== json.v.length) {
    return { state: null, note: "malformed" };
  }
  if (json.m.length !== size) return { state: null, note: `${json.m.length} moments, not ${size}` };
  return {
    state: { m: Float64Array.from(json.m), v: Float64Array.from(json.v), step: json.step ?? 0 },
    note: null,
  };
}

/** The three blocks together, for a checkpoint. */
export function momentsToJson(moments) {
  const out = {};
  for (const key of MOMENT_KEYS) out[key] = adamToJson(moments?.[key] ?? null);
  return out;
}

/**
 * The three blocks read back, with a sentence a run prints for every one that did not come.
 *
 * The warnings are the point of the return shape. A resumed arm that silently started Adam cold
 * would look like a resumed arm that did not, and the difference is a whole iteration of the
 * largest steps the rate allows -- see this file's own note on the first iteration of a run.
 */
export function momentsFromJson(json, sizes) {
  const moments = {};
  const warnings = [];
  for (const key of MOMENT_KEYS) {
    const { state, note } = adamFromJson(json?.[key] ?? null, sizes[key]);
    moments[key] = state;
    if (note !== null) warnings.push(`${key} moments ${note}; that block starts cold`);
  }
  return { moments, warnings };
}

/** Where a run's checkpoint sits, given its log: one rule, because the sweep runner needs it too. */
export const checkpointFor = (logPath) => logPath.replace(/\.jsonl$/, "") + "-checkpoint.json";

/**
 * Whether a `--resume` continues the log it is being pointed at, which is the one case that may
 * append to an existing log.
 *
 * A run does not append to another run's log, and that refusal has been worth its keep -- but it
 * also refused the one thing `--resume` is for, so every hand-restarted run in the record started
 * a second log file and the curve had to be stitched afterwards. The rule that separates them is
 * exact rather than a heuristic: the checkpoint being resumed is the checkpoint *this* log writes.
 * Anything else -- another arm's checkpoint, a copy, a checkpoint from a different directory -- is
 * `--from`, which starts a fresh log and says so in its header.
 */
export function resumesOwnLog(logPath, resumeFrom) {
  if (resumeFrom === null || resumeFrom === undefined) return false;
  return resolve(resumeFrom) === checkpointFor(resolve(logPath));
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
 *
 * **`pool` moves the inner loop onto worker threads and moves nothing else.** Session 05 of the
 * learn set. With a `FitPool` the minibatch body below becomes one `pool.step`, whose K shards run
 * the same loop over contiguous slices and whose partials the pool sums in shard order; everything
 * outside it -- the shuffle, the standardisation, the trust region, the read-out, the Adam steps,
 * the `stopped` path where the failing minibatch is not applied -- is the code it always was, on
 * the thread it always ran on. `shards` is carried beside the pool so a caller says the number
 * once and a mismatch is refused rather than silently ignored.
 */
export function ppoFit(rollout, {
  weights, logSigma, valueWeights, layout = POLICY_LAYOUT, valueLayout = VALUE_LAYOUT,
  norm, seed, halfLife = 4, lambda = 0.95, clip = 0.2, entropy = 0.003,
  rate = 3e-4, valueRate = 1e-3, sigmaRate = null, epochs = 3, batch = 512, targetKl = 0.02,
  sigmaFloor = -3, sigmaRoof = 0.5, actor = null, spread = null, critic = null,
  shards = 1, pool = null,
}) {
  if (pool !== null && pool.shards !== shards) {
    throw new Error(`a fit of ${shards} shards was handed a pool of ${pool.shards}`);
  }
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
  // The rollout, its advantages, its returns and the frozen normalisation into shared memory, once
  // for the whole fit. Everything a shard reads after this is either constant for the iteration or
  // written by the main thread between two barriers.
  if (pool !== null) pool.bind(rollout, scaled, returns, norm, { clip, entropy });
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
      let batchKl = 0;
      // The three the Adam steps below read: this thread's own arrays, or the pool's summed ones.
      let stepGrad = grad;
      let stepSigmaGrad = sigmaGrad;
      let stepValueGrad = valueGrad;
      if (pool !== null) {
        // One barrier instead of four thousand backward passes. The four sums come back as the
        // shard-order totals of exactly the four the loop below accumulates; `clipped` is a count
        // of ones and is therefore the same integer either way.
        const sums = pool.step({ at, end, epoch, order, weights, valueWeights, logSigma });
        stepGrad = sums.grad;
        stepSigmaGrad = sums.sigmaGrad;
        stepValueGrad = sums.valueGrad;
        batchKl = sums.kl;
        seen.kl += sums.kl;
        seen.clipped += sums.clipped;
        seen.entropy += sums.entropy;
        seen.valueLoss += sums.valueLoss;
        seen.count += sums.count;
      } else {
        const scale = 1 / (end - at);
        grad.fill(0);
        sigmaGrad.fill(0);
        valueGrad.fill(0);
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
      adamStep(weights, stepGrad, actor, rate);
      adamStep(logSigma, stepSigmaGrad, spread, spreadRate);
      for (let j = 0; j < ACTION_AXES; j += 1) {
        logSigma[j] = Math.min(Math.max(logSigma[j], sigmaFloor), sigmaRoof);
      }
      adamStep(valueWeights, stepValueGrad, critic, valueRate);
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
 * The pool an iteration collects on, optionally narrowed to the weapons that can finish a bout.
 *
 * **A body that cannot kill inside the cap contributes no signal, and worse than none.** Session
 * 14's calibration put every build against a mirrored idle opponent: seven maul builds finish all
 * twenty-eight of their bouts under `golem-driver`, fourteen blade builds finish 2 % of theirs,
 * and everything else finishes none. On a body in that second group every action in the episode
 * has the same return, so the advantage over it is the critic's residual -- and `ppoFit`
 * normalises advantages across the whole batch, which scales that residual up to stand beside
 * the real signal from the bodies that *can* decide. Thirty-eight of fifty-two draws are in the
 * second group, so an unfiltered rollout is mostly amplified noise.
 *
 * `terminals` is a list of armed terminals to keep, matched by `armedTerminal` on the build's
 * setup, so it names a weapon class and not a draw index and survives a change of seed.
 *
 * **The default moved in Session 01 of the learn set, and the old default has a word.** It was the
 * empty list and the whole pool; it is now `VIABLE_TERMINALS` from `src/golem/viability.ts`, and
 * `all` is how a caller asks for the fifty-two builds back. That is the set's first frozen choice
 * -- no pool spends a bout on a layout that cannot kill -- and the reason it is a *default* rather
 * than a flag is that every script here had the flag already and none of them was passing it. The
 * whole pool stays reachable because the close-out owes a final table on it, and for nothing else.
 *
 * A class no build carries is still an error naming the class, which is what makes a typo cost a
 * refusal instead of an hour: `--terminals maul,malu` is refused by name, exactly as before.
 *
 * **Measured, the class half of this cuts nothing.** Session 01's table admitted every class on the
 * shelf -- a maul decides against all seven, so the admission rule that was meant to let a plate
 * fight a maul let everything fight a maul -- so `VIABLE_TERMINALS` is the whole shelf and the
 * class filter alone leaves the same fifty-two builds `--terminals all` gives. That is written down
 * rather than tidied away because the alternative is somebody later reading a default that does
 * nothing and assuming it is broken.
 *
 * **`mirror` is the half that does cut, and it is the arrangement almost every pool here uses.**
 * `collectRollouts` schedules with `mirror: true` and so do `ratePolicy`, `leagueMatrix` and both
 * idle probes: one build on both sides, so the pair a bout is actually fought on is
 * `(class, class)`. Of the seven self-pairs only `maul|maul` and `mace|mace` are in `VIABLE_PAIRS`,
 * so `viableMirror` keeps fifteen of the fifty-two builds at seed 20260906 and refuses thirty-seven
 * -- the mirrored blades that decide 41 % of their bouts, the plates and fists at 2 %, the whips
 * and the unarmed at 0 %. That is a real narrowing of what a mind will ever see and it is the learn
 * set's first frozen choice applied where the bouts actually are; `--terminals all` puts them back
 * for the close-out's table, for the mirror exactly as for the class.
 */
export function keepViable(pool, terminals = VIABLE_TERMINALS, mirror = false) {
  // The empty list still means the whole pool, unchanged, and the *default* is what moved. That
  // distinction is load-bearing rather than pedantic: `POLICY_WEIGHTS` carries `terminals: []`
  // from the run that fitted it, and a build that reinterpreted that field would rewrite the
  // header of a shipped table to say it was trained on a pool it never saw. `all` is the same
  // escape said out loud, and both of them skip the mirror filter as well -- one word back to the
  // whole pool, whatever arrangement is asking for it.
  if (terminals.length === 0) return pool;
  if (terminals.length === 1 && terminals[0] === "all") return pool;
  const kept = pool.filter((build) => terminals.includes(armedTerminal(build.setup)));
  if (kept.length === 0) throw new Error(`no build in the pool is armed with ${terminals.join(" or ")}`);
  if (!mirror) return kept;
  const mirrors = kept.filter((build) => viableMirror(build.setup));
  // A pool of blades asked for mirrored bouts is a caller who narrowed twice and will otherwise
  // spend the night watching two identical blades not finish each other, so it is refused by name.
  if (mirrors.length === 0) {
    throw new Error(`no build armed with ${terminals.join(" or ")} can finish a copy of itself`);
  }
  return mirrors;
}

/**
 * The pool for one arrangement of bouts: `mirror` says both corners hold the same build.
 *
 * A caller that schedules with `mirror: true` -- the trainer's rollouts, the mirrored rating, the
 * league's matrix, both idle probes -- passes it here, so the pool it draws from is one every
 * member of which can finish itself. A caller that draws two different bodies leaves it off and
 * rejects on the *pairing* instead, through `viablePair`, which is what `--pairs viable` in
 * `scripts/tournament.mjs` does: a pair predicate cannot be a filter on a list of single builds.
 */
export function poolFor({ seed, random, terminals = VIABLE_TERMINALS, mirror = false }) {
  return keepViable(buildPool({ seed, random }), terminals, mirror);
}

/**
 * `--terminals maul,mace`: the weapon classes to keep. No flag is the viable set; `all` is the
 * whole pool.
 *
 * Here rather than in `scripts/rate-snapshots.mjs`, where it was written, because four scripts now
 * take the same word and that one already imports this file -- a shared parser living downstream
 * of its users is a cycle waiting for the fifth caller. It is re-exported there so no caller
 * changed.
 *
 * An empty string is refused rather than read as either pool, and that refusal is the point:
 * `--terminals ""` is somebody who meant to filter and whose shell ate the argument, and both
 * possible defaults would be an hour spent measuring a pool nobody asked for. A repeat is refused
 * for the same reason -- it is a typo with a plausible reading.
 */
export function parseTerminals(text) {
  if (text === null || text === undefined) return [...VIABLE_TERMINALS];
  const kept = String(text).split(",").map((s) => s.trim().toLowerCase()).filter((s) => s !== "");
  if (kept.length === 0) throw new Error("--terminals wants weapon classes, as in maul,mace");
  if (new Set(kept).size !== kept.length) throw new Error(`--terminals repeats a class: ${text}`);
  if (kept.includes("all") && kept.length > 1) {
    throw new Error(`--terminals all is the whole pool and cannot be narrowed: ${text}`);
  }
  return kept;
}

/**
 * The ordered policy pairs an iteration's schedule cycles through.
 *
 * Self-play is the one pair of the fit against itself. Against a named opponent it is *two*
 * pairs, the fit on the left and the fit on the right, so that the corner it is collected from
 * alternates down the schedule. `scheduleJobs` runs every pairing twice with the sides swapped
 * anyway, which balances the corners within a pairing; this balances them across the *bodies*,
 * because a pairing draws its build before it is swapped and an odd cycle would put the fit in
 * one corner for every draw of the pool.
 */
export function rolloutPairs(name, opponent) {
  return opponent === null ? [[name, name]] : [[name, opponent], [opponent, name]];
}

/**
 * One iteration's rollouts: mirrored bouts, drawn rather than greedy, the fit's sides recorded.
 *
 * `mirror` puts one build on both sides of a pairing, so what differs across a bout is the two
 * streams and nothing else; and in self-play, because the two sides are the same weights, both
 * packs are data about the same policy and a bout is worth twice what it would be against a
 * fixed opponent.
 *
 * ## Why an opponent is a parameter, and what self-play alone cannot pay for
 *
 * `opponent` names the mind on the other side; null is self-play and is what Session 13 ran.
 * It is a parameter because of an identity that session recorded and this one measured the cost
 * of: **in a mirrored self-play bout the two sides' bar margins are exactly negated**, so every
 * antisymmetric term of the reward -- the margin itself, and the win bonus -- sums to zero over
 * the rollout whatever the policy does. Session 13's fit found the equilibrium that identity
 * allows. On the default blade body against a motionless opponent it stands off at 2.27 of 3,
 * aims 0.78 to the side, leans and steps *back*, and swings 56 times a bout at 40 m/s into
 * empty air: 0 contacts, 0 damage, both bars still full at the cap. Nothing in a symmetric
 * reward is against that, because the only terms whose mean over both sides is not zero were
 * two penalties that both charge for engaging.
 *
 * Naming an opponent breaks the identity: the mean return becomes the thing the fit is actually
 * asked for, which is beating somebody. Only the fit's own sides are recorded, so a bout is
 * worth half what a self-play bout is worth in samples and considerably more in signal.
 */
export async function collectRollouts({
  pool, weights, logSigma, norm, seed, bouts, workers, cap, name = FIT_NAME, onProgress = null,
  reward = GOLEM_REWARD, opponent = null,
}) {
  const contenders = {
    [name]: {
      pi: Array.from(weights), logSigma: Array.from(logSigma),
      normalisation: { count: norm.count, mean: Array.from(norm.mean), variance: Array.from(norm.variance) },
      sample: true,
    },
  };
  const jobs = scheduleJobs({
    pool, policies: opponent === null ? [name] : [name, opponent],
    pairings: Math.max(1, Math.ceil(bouts / 2)), seed, cap, mirror: true, contenders,
    pairs: rolloutPairs(name, opponent),
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
  const rollout = mergeRollouts(parts, reward);
  rollout.bouts = rows.length;
  rollout.decided = rows.length === 0 ? 0 : decided / rows.length;
  rollout.margin = parts.length === 0 ? 0 : margin / parts.length;
  return rollout;
}

/**
 * The undiscounted return of every episode, the asks it took, and what the shaping cost it.
 *
 * The *share* is the number `reward.ts` asks a run to report: the shaping rows over the size of
 * everything paid, where size is taken as an absolute value because the bar term is signed and a
 * ratio of two signed sums is not a share of anything. A run where that share is large is a run
 * whose policy was paid mostly for standing somewhere rather than for fighting, and the module's
 * instruction for it is to throw the run away.
 *
 * **`rows` is that share split by row, and it is what a reward arm is actually read on.** Session
 * 06 of the learn set gave the table four more coefficients, and one number over all of them
 * cannot say whether an arm's share came from the row the arm was about. Every entry is taken over
 * the same denominator as `share`, so the rows sum to it exactly -- including `closing`, whose
 * entry is negative because it pays. A rollout collected before those columns existed reports them
 * as zero rather than as absent, which is what they were.
 */
export function episodeReturns(rollout) {
  const returns = [];
  const lengths = [];
  const charges = [];
  const bares = [];
  const perRow = Object.fromEntries(SHAPING_ROWS.map((row) => [row, 0]));
  let sum = 0;
  let charge = 0;
  let count = 0;
  for (let i = 0; i < rollout.count; i += 1) {
    sum += rollout.reward[i];
    charge += rollout.penalty?.[i] ?? 0;
    for (const row of SHAPING_ROWS) perRow[row] += rollout.charges?.[row]?.[i] ?? 0;
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
  const episodes = Math.max(1, charges.length);
  const penalty = charges.length === 0 ? 0 : charges.reduce((a, b) => a + b, 0) / charges.length;
  const bare = bares.length === 0 ? 0 : bares.reduce((a, b) => a + Math.abs(b), 0) / bares.length;
  const scale = penalty + bare === 0 ? 0 : 1 / (penalty + bare);
  const rows = Object.fromEntries(SHAPING_ROWS.map((row) => [row, (perRow[row] / episodes) * scale]));
  return { returns, lengths, penalty, bare, rows, share: penalty * scale };
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
 *
 * **The pool is filtered here as well as by `poolFor`, and that is not redundancy.** A rating and
 * a rollout have to be on the same builds or the curve is one instrument and the training is
 * another; `terminals` defaults to the same `VIABLE_TERMINALS` and runs the same `keepViable`, so
 * a caller that hands this function a whole pool by accident gets the viable one anyway and a
 * caller that hands it a filtered pool loses nothing, the filter being idempotent. Two ratings on
 * two pools are two instruments however alike they look, which is why `scripts/rate-snapshots.mjs`
 * writes the pool it used into every row.
 *
 * **The filter is run at this function's own `mirror`, which is what makes the two agree.** A
 * rating defaults to mirrored bouts, so its pool is the one `viableMirror` accepts -- the same
 * twenty builds the trainer's mirrored rollouts collect on -- and a caller that turns `mirror` off
 * gets the class-filtered pool and rejects on the pairing, as a run over two different bodies must.
 * Passing a pool drawn for the other arrangement is therefore not a way to end up rating on it.
 */
export async function ratePolicy({
  weights, logSigma, norm, league = PPO_LEAGUE, pool, seed, bouts, workers, cap,
  mirror = true, onProgress = null, terminals = VIABLE_TERMINALS,
}) {
  pool = keepViable(pool, terminals, mirror);
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
  return { per, names, results, points, bar, differences, behaviour: behaviourColumns(rows, names) };
}

/**
 * What each contender *did* over the same bouts the margin was read from, a bout.
 *
 * Session 06 of the learn set needs this beside the bar margin and cannot take it from a second
 * run: its bar has two halves -- an arm must beat the control on the margin *and* halve its stall
 * and its retreat -- and two halves read off two sets of bouts are two instruments. So these come
 * off the very rows `columnsOf` builds the paired columns from, indexed the same way, and a
 * contender that is absent from its own block fails there rather than reading as a zero here.
 *
 * `stall` and `outside` are the tournament row's own `nearRangeStallSeconds` and
 * `retreatOutsideReachSeconds`, which are `EngagementTracker`'s and are the same numbers the
 * reward's `stall` and `outside` rows are charged from. `decided` is the fraction of bouts that
 * ended in a verdict, which is the number that says whether a margin is a fight or chip damage.
 * `emptyStrokes` is absent on a row whose mind has no fourth executor to publish one, and reads
 * as zero here rather than as absent, because a mean over a mixed block would be a mean over two
 * populations.
 */
export function behaviourColumns(rows, names) {
  const per = rows.length / names.length;
  if (!Number.isInteger(per)) throw new Error(`${rows.length} rows do not divide among ${names.length} contenders`);
  const out = {};
  for (let k = 0; k < names.length; k += 1) {
    const name = names[k];
    const totals = { stall: 0, outside: 0, emptyStrokes: 0, seconds: 0, decided: 0 };
    for (let i = 0; i < per; i += 1) {
      const row = rows[k * per + i];
      const me = row.left.policy === name ? "left" : "right";
      if (row[me].policy !== name) throw new Error(`row ${i} of the ${name} block names neither side`);
      totals.stall += row[me].nearRangeStallSeconds ?? 0;
      totals.outside += row[me].retreatOutsideReachSeconds ?? 0;
      totals.emptyStrokes += row[me].emptyStrokes ?? 0;
      totals.seconds += row.seconds;
      if (row.winner !== null) totals.decided += 1;
    }
    out[name] = { bouts: per, ...Object.fromEntries(
      Object.entries(totals).map(([column, total]) => [column, per === 0 ? 0 : total / per])) };
  }
  return out;
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
 * `generator` is the script that wrote it, because `scripts/league.mjs` writes this module too and
 * a header naming the wrong script sends a reader to the wrong run to reproduce it.
 *
 * Sixteen numbers a line, as `renderLearnerModule` writes its own, so a refit diffs by row. The
 * weight import is type-only and the reward's is not: `policy.ts` imports this file for its
 * default table, so a value imported back the other way would be a cycle -- but `reward.ts`
 * imports nothing, so the table can name the coefficients it was fitted under rather than
 * copying them, and a build whose reward table has moved says so by not matching.
 */
/**
 * Which pool a header is talking about, in words.
 *
 * Absent and empty are both the whole pool, which is what a table fitted before Session 01 of the
 * learn set was fitted on, and `all` is the whole pool asked for by name. What moved in that
 * session is the *default* and not the meaning of the empty list -- `parseTerminals` never returns
 * one now, so a run under the new default writes the three class names out and reads back as the
 * list it is.
 */
export function poolSentence(terminals) {
  if (terminals === undefined || terminals === null) return "the whole pool";
  const kept = [...terminals];
  if (kept.length === 0) return "the whole pool";
  if (kept.length === 1 && kept[0] === "all") return "the whole pool";
  return `pool builds armed with ${kept.join(" or ")}`;
}

export function renderPolicyModule(table, generator = "scripts/train-ppo.mjs") {
  checkPolicyWeights(table);
  const rows = [];
  for (let i = 0; i < table.weights.length; i += 16) rows.push("  " + table.weights.slice(i, i + 16).join(","));
  const body = "\"weights\":[\n" + rows.join(",\n") + "\n]";
  const named = JSON.stringify({ ...table, weights: [], reward: null }).replace("\"weights\":[]", body);
  const beaten = Object.entries(table.baselines)
    .map(([name, score]) => `${name} ${score.toFixed(3)}`).join(", ");
  return [
    `// GENERATED by ${generator} -- do not edit; regenerate.`,
    "//",
    `// Policy weights, version ${table.version} over feature version ${table.features}, ` +
    `${table.weights.length} numbers laid out ${JSON.stringify(table.layout)}, ` +
    `and ${table.logSigma.length} spreads.`,
    table.date
      ? `// Fitted ${table.date} from seed ${table.seed}: ${table.iterations} PPO iterations on ` +
        `${table.steps} asks from ${table.bouts} mirrored bouts against ` +
        `${table.opponent ?? "itself"} on ${poolSentence(table.terminals)}; half-life ` +
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

// `isMainThread` is not decoration. A worker inherits `process.argv` from the process that started
// it, so a fit shard spawned by `node scripts/train-ppo.mjs` would otherwise read `argv[1]` as this
// very file and start a second training run inside the thread that was meant to sum a gradient.
const isMain = isMainThread && process.argv[1] !== undefined
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
  // How many threads the fit itself runs on. One is the single thread this script has always been,
  // and is the only setting under which no `SharedArrayBuffer` is allocated at all. Session 05 of
  // the learn set measured the curve and 8 is its knee on the 32-thread host; the default stays 1
  // here because a `train-ppo` arm is usually one of several and the sweep runner is where the
  // host's threads are divided.
  const shards = Math.max(1, Number(flag("shards", 8)));
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
  // **The reward table is a knob, and until this flag it was four numbers nobody had swept.**
  // `src/golem/reward.ts` argues each of them and the argument is a good one, but an argued
  // coefficient is still a guess; what ships is `GOLEM_REWARD` and what a run may try is this.
  // A run that moves them logs them in its header, and a run that fits weights to a table other
  // than the shipped one may not write a module -- the generated header would name `GOLEM_REWARD`
  // and be a lie about what paid for those weights.
  const reward = Object.freeze({
    win: Number(flag("reward-win", GOLEM_REWARD.win)),
    clinch: Number(flag("reward-clinch", GOLEM_REWARD.clinch)),
    idle: Number(flag("reward-idle", GOLEM_REWARD.idle)),
    tick: Number(flag("reward-tick", GOLEM_REWARD.tick)),
    // Session 06 of the learn set's four, spelled with the same prefix as the four above them
    // rather than bare, because one sweep manifest's `common` block has to read across this script
    // and `scripts/league.mjs` and a flag that meant one thing here and another there would be a
    // manifest nobody could check by eye.
    closing: Number(flag("reward-closing", GOLEM_REWARD.closing)),
    stall: Number(flag("reward-stall", GOLEM_REWARD.stall)),
    outside: Number(flag("reward-outside", GOLEM_REWARD.outside)),
    swing: Number(flag("reward-swing", GOLEM_REWARD.swing)),
  });
  const shippedReward = REWARD_KEYS.every((k) => reward[k] === GOLEM_REWARD[k]);
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
  // Null is Session 13's mirrored self-play; a policy name is a fixed sparring partner, which is
  // the one arrangement in which the mean return is not zero by construction.
  const opponent = flag("opponent", null);
  // A weapon class rather than a build list, for the reason `poolFor` gives. Absent is the viable
  // set since Session 01 of the learn set, and `--terminals all` is the whole fifty-two.
  const terminals = parseTerminals(flag("terminals", null));
  const resumeFrom = flag("resume", null);
  // Another run's weights with the iteration counter back at one and a log of its own, which is
  // what a sweep arm started from a shared checkpoint is. `--resume` continues a run; this begins
  // one. Passing both is a caller who means one of them and would otherwise silently get the other.
  const startFrom = flag("from", null);
  if (resumeFrom !== null && startFrom !== null) {
    throw new Error("--resume continues a run and --from begins one; pass one of them");
  }
  // Echoed into the header and nowhere else. A sweep gives every arm the same seed and the same
  // start, so the log's own header cannot say which arm it is, and the file name is a fact about
  // a directory rather than about the run.
  const label = flag("label", null);
  const write = flag("out", null);
  const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 13);
  // Concatenated rather than interpolated: a backticked span that looks like a path is a durable
  // reference to the documentation tests, and this one names a file that never exists.
  const out = resolve(flag("log", "tournaments/ppo-" + stamp + "-" + seed + ".jsonl"));
  const checkpoint = checkpointFor(out);
  if (existsSync(out) && !resumesOwnLog(out, resumeFrom)) {
    throw new Error(`${out} exists; a run does not append to another run's log. `
      + `--resume ${checkpoint} continues this one; --from starts a fresh log from other weights`);
  }
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
  const started = resumeFrom ?? startFrom;
  if (started !== null) {
    const saved = JSON.parse(readFileSync(resolve(started), "utf8"));
    weights = Float64Array.from(saved.weights);
    valueWeights = Float64Array.from(saved.valueWeights);
    logSigma = Float64Array.from(saved.logSigma);
    norm = saved.normalisation;
    // Adam's moments make a restarted arm the same run rather than a warm start, so they are
    // restored wherever they exist and their absence is said out loud rather than assumed away.
    const read = momentsFromJson(saved.adam ?? null, {
      actor: netSize(POLICY_LAYOUT), spread: ACTION_AXES, critic: netSize(valueLayout),
    });
    ({ actor, spread, critic } = read.moments);
    for (const warning of read.warnings) console.log(`  ${started}: ${warning}`);
    // A resume continues the run's own counters; a `--from` is a new run wearing another's mind,
    // so its iterations, bouts and asks start where a fresh run's do and its log begins at one.
    if (resumeFrom !== null) {
      startAt = saved.iteration + 1;
      totalBouts = saved.bouts ?? 0;
      totalSteps = saved.steps ?? 0;
      console.log(`  resuming at iteration ${startAt} from ${resumeFrom}`);
    } else {
      console.log(`  starting from the weights of ${startFrom} at iteration ${saved.iteration}, `
        + "with a fresh log and the counters at zero");
    }
  }

  log({
    type: "header", seed, date, version: POLICY_VERSION, features: PILOT_FEATURES_VERSION,
    layout: POLICY_LAYOUT, valueLayout, reward, league, label,
    iterations, bouts, cap, random, workers, shards, halfLife, lambda, clip, entropy, rate, valueRate,
    sigmaRate, epochs, batch, targetKl, sigmaFloor, sigmaRoof,
    evaluate: every, evalBouts, finalBouts, resumeFrom, from: startFrom, opponent, terminals,
  });
  console.log(`ppo: seed ${seed}, ${iterations} iterations of ${bouts} mirrored bouts, `
    + `${netSize(POLICY_LAYOUT)} actor weights, ${workers} workers, `
    + `${shards === 1 ? "one fit thread" : `${shards} fit shards`}`);
  // One pool for the run, because a minibatch step is milliseconds and a thread start is not.
  // `fitPool` rather than `pool`, which in the loop below is the iteration's *bodies*.
  const fitPool = shards > 1 ? await FitPool.open({ shards, valueLayout }) : null;

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
    // The rating pool is drawn through the same filter the rollout pool is, so the curve and the
    // training are on the same builds. Session 01 of the learn set; before it this was `buildPool`
    // and a run could train on the fifteen bodies that can finish and be rated on all fifty-two.
    // `mirror` because the rating below is mirrored: both corners hold one build, so the pool has
    // to be bodies that can finish themselves and not merely bodies something can finish.
    const epool = poolFor({ seed: eseed, random, terminals, mirror: true });
    const result = await ratePolicy({
      weights, logSigma, norm, league, pool: epool, seed: eseed, terminals,
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
    // `mirror` for the reason `collectRollouts` schedules with it: an iteration's bouts put one
    // build in both corners, so a body that cannot finish itself is a whole episode of critic
    // residual whatever the class table says something else could do to it.
    const pool = poolFor({ seed: (seed ^ iteration) >>> 0, random, terminals, mirror: true });
    const rollout = await collectRollouts({
      pool, weights, logSigma, norm, seed: (seed + iteration * 7919) >>> 0, bouts, workers, cap,
      reward, opponent, onProgress: progress(`iteration ${iteration}`),
    });
    const collected = (Date.now() - started) / 1000;
    if (rollout.count === 0) throw new Error("an iteration collected no asks at all");
    const { returns, lengths, share, rows: shareRows, penalty, bare } = episodeReturns(rollout);
    const fitStarted = Date.now();
    const fit = ppoFit(rollout, {
      weights, logSigma, valueWeights, valueLayout, norm, seed: (seed ^ iteration * 31) >>> 0,
      halfLife, lambda, clip, entropy, rate, valueRate, sigmaRate, epochs, batch, targetKl,
      sigmaFloor, sigmaRoof, actor, spread, critic, shards, pool: fitPool,
    });
    const fitted = (Date.now() - fitStarted) / 1000;
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
      // The same share split by row. It rides beside `penaltyShare` rather than replacing it,
      // which is a correction to Session 06's plan and not a shortcut: Session 02's curve page
      // reads `penaltyShare` off a row as a number and plots it, so turning that field into an
      // object would have made every new run's curve blank on a page nothing would have failed.
      penaltyRows: Object.fromEntries(Object.entries(shareRows).map(([row, x]) => [row, round4(x)])),
      penalty: round5(penalty), bare: round5(bare),
      kl: round5(fit.kl), clipFraction: round4(fit.clipFraction), entropy: round4(fit.entropy),
      valueLoss: round5(fit.valueLoss), explained: round4(fit.explainedAfter),
      advantageSd: round5(fit.advantageSd),
      epochsRun: fit.epochs, updates: fit.updates,
      stopped: fit.stopped === null ? null : round5(fit.stopped.kl),
      logSigma: Array.from(logSigma, round4),
      // The two halves of an iteration said separately, because Session 05 of the learn set is a
      // claim about one of them and a row that only carried the total could not be read against it.
      collectSeconds: round4(collected), fitSeconds: round4(fitted), shards,
      seconds: round4((Date.now() - started) / 1000),
    };
    log(line);
    console.log(`  it ${String(iteration).padStart(2)}: return ${line.ret >= 0 ? "+" : ""}${line.ret.toFixed(4)} `
      + `+- ${line.retSem.toFixed(4)}  decided ${(rollout.decided * 100).toFixed(0)}%  `
      + `asks ${line.length.toFixed(0)}  penalty ${(share * 100).toFixed(1)}%  `
      + `KL ${fit.kl.toFixed(5)}  clip ${(fit.clipFraction * 100).toFixed(1)}%  `
      + `H ${fit.entropy.toFixed(2)}  EV ${fit.explainedAfter.toFixed(3)}  `
      + `sigma ${Math.exp(logSigma[0]).toFixed(3)}  `
      + `${fit.updates} steps${fit.stopped === null ? "" : ` (stopped in epoch ${fit.stopped.epoch})`}  `
      + `${line.seconds.toFixed(0)} s (${collected.toFixed(0)} collect, ${fitted.toFixed(0)} fit)`);
    writeFileSync(checkpoint, JSON.stringify({
      iteration, seed, date, bouts: totalBouts, steps: totalSteps,
      weights: Array.from(weights, round5), valueWeights: Array.from(valueWeights, round5),
      logSigma: Array.from(logSigma, round5), normalisation: norm,
      // Full precision, unlike everything above it: a second moment is around 1e-8 and rounding it
      // to five places is the same as not writing it at all.
      adam: momentsToJson({ actor, spread, critic }),
    }));

    const last = iteration === iterations;
    if (every > 0 && (last || iteration % every === 0)) {
      rated = await ratePoint(iteration, last ? finalBouts : evalBouts);
    }
  }

  // The shards are done: everything after this is a rating and a module, and neither touches the
  // fit. They are unref'd, so a run that threw above exits anyway; this is the tidy path.
  await fitPool?.close();

  const baselines = {};
  if (rated !== null) for (const name of rated.names) if (name !== FIT_NAME) baselines[name] = rated.results[name].score;
  const table = policyTable(weights, logSigma, {
    seed, date, iterations, bouts: totalBouts, steps: totalSteps,
    halfLife, lambda, clip, entropy, reward, opponent, terminals,
    normalisation: {
      count: norm.count, mean: Array.from(norm.mean, round5), variance: Array.from(norm.variance, round5),
    },
    score: rated === null ? 0 : rated.results[FIT_NAME].score, baselines,
  });
  log({ type: "weights", table: { ...table, weights: [] } });
  const text = renderPolicyModule(table);
  if (write !== null && !shippedReward) {
    throw new Error(`--out refuses a fit paid under ${JSON.stringify(reward)}, which is not GOLEM_REWARD; `
      + "move the table in src/golem/reward.ts first, or read the checkpoint instead");
  }
  if (write !== null) {
    writeFileSync(resolve(write), text);
    console.log(`  wrote ${write} (${(text.length / 1024).toFixed(1)} KB)`);
  }
  console.log(`log: ${out}`);
  console.log(`checkpoint: ${checkpoint}`);
}
