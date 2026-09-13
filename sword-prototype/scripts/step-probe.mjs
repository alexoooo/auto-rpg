// The step probe: take the gradient, walk along it, and find out whether the return went up.
// Experiment O of the signal set's menu.
//
//   node scripts/step-probe.mjs --from tournaments/<arm>/pool-30.json
//        [--draws 8] [--bouts 128] [--evaluate 128] [--steps 0.02,0.08]
//        [--opponent golem-fencer] [--seed 20260917] [--workers N] [--shards 4]
//        [--terminals maul,mace|all] [--tactics latchAbort=true] [--cap 60] [--random 40]
//        [--half-life 4] [--lambda 0.95] [--clip 0.2] [--log tournaments/...] [--label arm]
//
// ## The one link in the chain nothing in this record has tested
//
// `scripts/gradient-probe.mjs` measures whether two halves of one collection ask for the same
// policy change, and every number the signal set has produced is a version of that question. It is
// a question about *agreement*, and agreement is not validity. Two halves of a rollout could agree
// perfectly about a direction that does not raise the return at all -- because the surrogate is
// clipped and the true objective is not, because the advantage is standardised and the return is
// not, because the estimator is biased, or because the return at this checkpoint is flat in every
// direction and the gradient is a consistent estimate of approximately nothing.
//
// So this file asks the other question. Take the gradient at a held checkpoint. Walk a fixed
// distance along it, and the same distance *against* it. Collect fresh bouts at both, on the same
// bodies under the same streams, and read what the two of them returned. Then do the same along a
// **random direction of the same length**, which is the control the whole design turns on: a random
// direction has an expected return difference of exactly zero, so the gradient arm has something to
// beat that is not an assumption about scale, about units, or about how big a step ought to be.
//
// **Nothing here is a training run and nothing here ships a weight.** The stepped policies are
// evaluated and thrown away; what is written down is the difference they made.
//
// ## Why the antithetic pair, and which pool the evaluation is on
//
// A return at one policy is a number with an enormous standard deviation -- the record's own most
// reproducible figure is that a bout's bar margin has a per-bout spread of about six tenths of a
// bar -- so `J(theta + eta d)` on its own is unreadable at any bout count this project can afford.
// The **difference** between the two ends of a step is not: the two policies fight the same bodies
// in the same order under the same opponent streams, and the bout-to-bout draw that dominates the
// level of either one cancels in the difference. That is the same pairing argument
// `scripts/sweep.mjs` makes for its paired column and the gradient probe makes for its arms, and it
// is the reason this experiment is affordable at all.
//
// Within a draw the pairing is extended as far as it will go: **one pool and one collection seed
// for every evaluation of that draw**. Both ends of both kinds fight the same bodies in the same
// order, so the only thing that differs between two rows of a draw is the direction that was walked
// along.
//
// Across draws the pool is **not** held, and that is the deliberate half. The pool a draw evaluates
// on is the pool the draw collected its gradient on, for the reason the whole design hangs off:
// what the gradient probe reports is the agreement between two halves of one collection **over one
// pool**, and the floor derived from that cosine is a statement about that quantity. A direction
// estimated on forty builds and evaluated on forty different ones is a different number and a lower
// one, and a run that mixed the two could not afterwards say which of them it had measured. What
// the cross-pool reading is worth is a real question and it is not this one.
//
// Holding one pool across the whole run would also have made the draws dependent in the pool
// dimension -- six draws sharing one accident of forty builds, with a t over draws that quietly
// treats that accident as free. Drawing the pool per draw costs nothing (the differences are what
// get averaged, and each is paired within its own draw) and buys a t that means what it says.
//
// The **evaluation seed is fresh** in either case. The gradient was computed out of the returns of
// the collection bouts, so evaluating on those same bouts would ask whether a direction fitted to a
// sample raises that sample -- which it does by construction, and which says nothing.
//
// ## Which way along the gradient, and the eight evaluations that found out
//
// Every gradient in this tree is a **loss** gradient and every step the fit takes is a subtraction,
// so the direction this file walks is **minus** the vector the pool hands back. `ASCENT` says that
// where a reader will look for it and
// `a_step_along_the_probes_direction_makes_the_good_action_more_likely_not_less` asserts it, by the
// only statement that is unambiguous: told every action was better than average, a step that
// improves the policy makes those actions more likely.
//
// That assertion was written after the fact and the record owes the reason. The first run of this
// file walked `+g`, and its first draw came back with all three step lengths below their own start,
// monotonically in the length -- a clean, consistent, *reversed* result. Nothing else in this tree
// could have caught it: every number the gradient probe publishes is a cosine, a dot of two halves,
// a norm or a ratio of those, and all four are invariant to negating both halves at once. A sign
// error is unobservable everywhere in this record except here, where it is the whole experiment.
//
// ## What a step length means here, and why it is a length
//
// The step is `theta +- eta * d` with `d` a **unit** vector in actor-weight space, so `eta` is a
// distance and not a learning rate. That is deliberate: a learning rate times a gradient is a
// length that depends on the gradient's norm, which varies by a factor of several across the
// checkpoints in this record, and a control arm along a random direction has no natural norm at
// all. Two arms can only be compared at matched step length, and a length is the only thing both
// of them have.
//
// For scale: the shipped actor's weights have a root-mean-square of about 0.078 over 87,308
// numbers, so the whole weight vector has a norm near 23. The step lengths a run should ask for are
// a small fraction of that, and the default pair -- 0.02 and 0.08 -- is a thousandth and four
// thousandths of the policy's own length. A run that finds nothing at either should ask for more
// before it concludes anything, and the row carries the number so that it can.
//
// ## What this cannot see
//
// **Whether a fit would have followed this direction.** A production step is Adam over four epochs
// of clipped minibatches under a KL stop, which is not a step along the mean gradient and is not
// claimed to be. This measures the direction the estimator points in, which is the thing every
// cosine in this record is a statement about, and it measures it against the only baseline that
// needs no calibration.
//
// **The size of the effect at a step a league actually takes.** A league moves the policy a long
// way over sixty iterations and this walks a fixed distance once. A positive result here says the
// direction is real at this checkpoint; it says nothing about how far it stays real.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { isMainThread } from "node:worker_threads";

import { netSize } from "../src/golem/neural-net.ts";
import { PILOT_FEATURES_DEFAULT } from "../src/golem/pilot.ts";
import { POLICY_VERSION } from "../src/golem/policy.ts";
import { GOLEM_REWARD } from "../src/golem/reward.ts";
import { mulberry32 } from "../src/rng.ts";
import { meanOf, semOf } from "./train-learner.mjs";
import { epochOrder, wholeGradient } from "./gradient-probe.mjs";
import {
  FitPool, advantages, collectRollouts, episodeReturns, opponentOf, parseTactics, parseTerminals,
  policyShapeOf, poolFor, standardisedAdvantages, valuesOf,
} from "./train-ppo.mjs";

/** The kinds of direction a draw walks along, and the second is the whole point of the first. */
export const STEP_KINDS = Object.freeze(["gradient", "random"]);

/**
 * A unit vector of `length` numbers drawn from the isotropic Gaussian, by Box-Muller.
 *
 * Isotropic rather than one-of-the-axes or a sign flip, because the claim the control has to
 * support is that *a direction chosen without reference to the data* raises the return no more than
 * it lowers it. A structured random direction would be a different claim and a weaker one.
 */
export function randomDirection(length, seed) {
  const random = mulberry32(seed);
  const out = new Float64Array(length);
  for (let k = 0; k < length; k += 2) {
    // Guarded off exactly zero, where the logarithm is not finite; `mulberry32` can return it.
    const u = Math.max(random(), Number.MIN_VALUE);
    const radius = Math.sqrt(-2 * Math.log(u));
    const angle = 2 * Math.PI * random();
    out[k] = radius * Math.cos(angle);
    if (k + 1 < length) out[k + 1] = radius * Math.sin(angle);
  }
  return unit(out);
}

/**
 * A vector scaled to length one, refusing a vector that has no direction rather than dividing by it.
 *
 * A zero gradient is a real outcome of a rollout in which every sample was clipped, and it is one
 * this file must not quietly turn into a step along `NaN` that then reads as a flat result.
 */
export function unit(vector) {
  let sum = 0;
  for (const value of vector) sum += value * value;
  const norm = Math.sqrt(sum);
  if (!(norm > 0)) throw new Error("a direction of length zero cannot be walked along");
  const out = new Float64Array(vector.length);
  for (let k = 0; k < vector.length; k += 1) out[k] = vector[k] / norm;
  return { direction: out, norm };
}

/** `theta + distance * direction`, allocated fresh because both ends of a step are wanted at once. */
export function stepped(weights, direction, distance) {
  const out = new Float64Array(weights.length);
  for (let k = 0; k < weights.length; k += 1) out[k] = weights[k] + distance * direction[k];
  return out;
}

/**
 * What one evaluation is: the mean episode return, the bar margin, and what the bouts decided.
 *
 * The **return** is the quantity the gradient is a gradient of -- the undiscounted sum of an
 * episode's rewards under the shipped table, which `advantages` documents as that side's bar margin
 * plus its win term. The **margin** is the tournament's own number and is carried beside it because
 * it is the one every bar in this record is stated on, and because a direction that raises the
 * return while lowering the margin is a finding about the reward table that this file should report
 * rather than average away.
 */
export function evaluationOf(rollout) {
  const { returns } = episodeReturns(rollout);
  return {
    episodes: returns.length,
    return: meanOf(returns),
    returnSem: semOf(returns),
    margin: rollout.margin,
    decided: rollout.decided,
    asks: rollout.count,
  };
}

/**
 * Which way along the gradient a step that is meant to *improve* the policy goes, and it is minus.
 *
 * Every gradient in this tree is a **loss** gradient. `surrogateGrad` accumulates
 * `-adv * ratio * scale` times the score into `delta`, the critic accumulates `value - return`, and
 * `adamStep` spends both the same way: `weights[k] -= rate * ...`. So the vector the fit is handed
 * points *down* the objective, and `theta - eta * unit(grad)` is the step the fit would have taken.
 *
 * **The record never had to know this and this file is the first thing that does.** Every number
 * the gradient probe publishes is a cosine, a dot of two halves, a norm or a ratio of those, and
 * every one of them is invariant to negating both halves at once. A sign error there is
 * unobservable; here it is the entire experiment, and walking the wrong way would produce a clean,
 * consistent, monotone result with the sign of the headline reversed -- which is the most dangerous
 * shape a bug can have in a record that writes its falsifiers down in advance.
 */
export const ASCENT = -1;

/**
 * One draw: a gradient off its own collection, and the two directions it puts in front of the arena.
 *
 * The random direction is derived from the draw's own seed rather than from a stream shared with
 * the collection, so that re-running one draw of a row reproduces both of its directions and the
 * arms of a draw cannot be silently correlated through an exhausted generator.
 *
 * The gradient direction is the **ascent** direction, for `ASCENT`'s reason. The norm reported
 * beside it is the gradient's own and is unsigned, because it is a length.
 */
export function directionsOf({ gradient, seed }) {
  const walked = unit(gradient);
  const uphill = new Float64Array(walked.direction.length);
  for (let k = 0; k < uphill.length; k += 1) uphill[k] = ASCENT * walked.direction[k];
  return [
    { kind: "gradient", direction: uphill, norm: walked.norm },
    { kind: "random", ...randomDirection(gradient.length, (seed ^ 0x5eed_1a3f) >>> 0), norm: 1 },
  ];
}

async function main() {
  const argv = process.argv.slice(2);
  const flag = (name, fallback) => {
    const at = argv.indexOf(`--${name}`);
    return at === -1 || at + 1 >= argv.length ? fallback : argv[at + 1];
  };
  // Coerced and defaulted exactly as `scripts/gradient-probe.mjs` coerces and defaults them, which
  // is not tidiness. The pool of a draw is `poolFor` under `(seed ^ draw) >>> 0` and the pool of a
  // probe iteration is `poolFor` under `(seed ^ iteration) >>> 0`, so at the shared seed and the
  // shared `--random` **draw k of this run walks on the identical forty builds that iteration k of
  // the gradient probe measured the cosine on**. The prediction this file exists to test is read
  // off those iterations, and it is worth something more if the bodies are the same bodies.
  const seed = Number(flag("seed", 20260917)) >>> 0;
  const draws = Math.max(1, Number(flag("draws", 8)));
  const bouts = Math.max(2, Number(flag("bouts", 128)));
  const evaluate = Math.max(2, Number(flag("evaluate", 128)));
  const steps = flag("steps", "0.02,0.08").split(",").map((s) => Number(s.trim()));
  if (steps.length === 0 || steps.some((s) => !(s > 0))) {
    throw new Error(`--steps ${flag("steps", "")} wants one or more distances above zero`);
  }
  const workers = Math.max(1, Number(flag("workers", Math.max(1, availableParallelism() - 2))));
  const shards = Math.max(1, Number(flag("shards", 4)));
  const cap = Number(flag("cap", 60));
  const random = Math.max(0, Number(flag("random", 40)));
  const halfLife = Number(flag("half-life", 4));
  const lambda = Number(flag("lambda", 0.95));
  const clip = Number(flag("clip", 0.2));
  const terminals = parseTerminals(flag("terminals", "maul,mace"));
  const opponentWord = flag("opponent", "golem-fencer");
  const tactics = parseTactics(flag("tactics", null));
  const label = flag("label", null);
  const shape = policyShapeOf({
    features: Number(flag("features", PILOT_FEATURES_DEFAULT)),
    head: flag("head", "gaussian"), sigma: flag("sigma", "constant"),
    critic: flag("critic", "self"),
    sigmaFloor: Number(flag("sigma-floor", -3)), sigmaRoof: Number(flag("sigma-roof", 0.5)),
    valueHidden: flag("value-hidden", "64,64").split(",").map((s) => s.trim()),
  });
  const { features, spec, layout, central, valueLayout } = shape;
  const from = flag("from", null);
  if (from === null) {
    throw new Error("--from names the checkpoint this walks away from; a step probe holds a policy");
  }
  const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 13);
  const out = resolve(flag("log", "tournaments/step-" + stamp + "-" + seed + ".jsonl"));
  if (existsSync(out)) throw new Error(`${out} exists; a probe does not append to another run's log`);
  mkdirSync(dirname(out), { recursive: true });
  const log = (line) => writeFileSync(out, JSON.stringify(line) + "\n", { flag: "a" });

  const start = JSON.parse(readFileSync(resolve(from), "utf8"));
  const weights = Float64Array.from(start.weights);
  const valueWeights = Float64Array.from(start.valueWeights);
  const logSigma = Float64Array.from(start.logSigma);
  if (weights.length !== netSize(layout)) {
    throw new Error(`${from} carries ${weights.length} actor weights and this shape wants ${netSize(layout)}`);
  }
  const norm = {
    count: start.norm.count,
    mean: Float64Array.from(start.norm.mean),
    variance: Float64Array.from(start.norm.variance),
  };
  const opponent = opponentOf(opponentWord);
  // The evaluation is on the draw's **own body pool** under a **fresh collection seed**, and both
  // halves of that are load-bearing.
  //
  // *Same pool*, because the prediction this run exists to test is the gradient probe's own, and
  // that probe cuts one collection in two -- so its cosine, and the floor derived from it, describe
  // how well two halves of a rollout **over one pool** agree. A direction estimated on forty builds
  // and evaluated on forty others is a different and lower number, and a run that mixed the two
  // could not say which of them it had measured. What the cross-pool reading is worth is the next
  // question and it is not this one.
  //
  // *Fresh seed*, because the gradient was computed out of the returns of the collection bouts and
  // evaluating on those same bouts would ask whether a direction fitted to a sample raises that
  // sample, which it does by construction and says nothing.
  const evaluationSeed = (draw) => (seed ^ draw * 0x9e37 ^ 0xe7a1) >>> 0;

  const date = new Date().toISOString().slice(0, 10);
  log({
    type: "header", kind: "step-probe", seed, date, version: POLICY_VERSION, features, layout,
    valueLayout, label, draws, bouts, evaluate, steps, cap, random, workers, shards, from,
    opponent: opponentWord, terminals, halfLife, lambda, clip,
    tactics: tactics === null ? null : { ...tactics },
    weightNorm: Math.sqrt(weights.reduce((a, b) => a + b * b, 0)),
  });

  const pool = await FitPool.open({ shards, layout, valueLayout });
  const rows = [];
  try {
    for (let draw = 1; draw <= draws; draw += 1) {
      const started = Date.now();
      const drawSeed = (seed + draw * 7919) >>> 0;
      const bodies = poolFor({ seed: (seed ^ draw) >>> 0, random, terminals, mirror: true });
      const rollout = await collectRollouts({
        pool: bodies, weights, logSigma, norm, seed: drawSeed, bouts, workers, cap,
        reward: GOLEM_REWARD, opponent, features, spec, central, tactics,
      });
      if (rollout.count === 0) throw new Error("a draw collected no asks at all");
      const values = valuesOf(rollout, valueWeights, norm, valueLayout);
      const { advantage, returns } = advantages(rollout, values, { halfLife, lambda });
      const { scaled, sd } = standardisedAdvantages(advantage, rollout.count);
      const order = epochOrder(rollout.count, (seed ^ draw * 31) >>> 0);
      const whole = wholeGradient({
        pool, rollout, scaled, returns, norm, weights, valueWeights, logSigma, order, clip,
      });
      const walked = directionsOf({ gradient: whole.actor, seed: drawSeed });
      const measured = [];
      for (const { kind, direction, norm: length } of walked) {
        for (const distance of steps) {
          const ends = {};
          for (const sign of [1, -1]) {
            const stepping = stepped(weights, direction, sign * distance);
            const fought = await collectRollouts({
              pool: bodies, weights: stepping, logSigma, norm, seed: evaluationSeed(draw),
              bouts: evaluate, workers, cap, reward: GOLEM_REWARD, opponent, features, spec,
              central, tactics,
            });
            ends[sign === 1 ? "plus" : "minus"] = evaluationOf(fought);
          }
          measured.push({
            kind, distance, gradientNorm: length,
            plus: ends.plus, minus: ends.minus,
            delta: ends.plus.return - ends.minus.return,
            marginDelta: ends.plus.margin - ends.minus.margin,
          });
        }
      }
      const row = {
        type: "draw", draw, bouts, evaluate, asks: rollout.count,
        advantageSd: sd, actorNorm: whole.actor.reduce((a, b) => a + b * b, 0) ** 0.5,
        kl: whole.kl, clipped: whole.clipped, walked: measured,
        seconds: (Date.now() - started) / 1000,
      };
      rows.push(row);
      log(row);
      const said = measured.map((m) => `${m.kind.slice(0, 4)}@${m.distance} ${m.delta >= 0 ? "+" : ""}${m.delta.toExponential(2)}`);
      console.log(`  draw ${String(draw).padStart(2)}: |g| ${row.actorNorm.toExponential(2)}  ${said.join("  ")}  ${row.seconds.toFixed(0)} s`);
    }
  } finally {
    await pool.close();
  }

  // The summary is one line a kind and distance, and the comparison the experiment is about is
  // between the two kinds at the same distance -- which is why the distance is the outer loop.
  const summary = [];
  for (const distance of steps) {
    for (const kind of STEP_KINDS) {
      const taken = rows.map((row) => row.walked.find((m) => m.kind === kind && m.distance === distance));
      const deltas = taken.map((m) => m.delta);
      const margins = taken.map((m) => m.marginDelta);
      const entry = {
        kind, distance, draws: deltas.length,
        deltaMean: meanOf(deltas), deltaSem: semOf(deltas),
        marginMean: meanOf(margins), marginSem: semOf(margins),
        wins: deltas.filter((d) => d > 0).length,
      };
      summary.push(entry);
      const t = entry.deltaSem === 0 ? 0 : entry.deltaMean / entry.deltaSem;
      console.log(`${kind.padEnd(8)} at ${distance}: return ${entry.deltaMean >= 0 ? "+" : ""}`
        + `${entry.deltaMean.toExponential(3)} +-${entry.deltaSem.toExponential(2)} (t ${t.toFixed(2)}), `
        + `margin ${entry.marginMean >= 0 ? "+" : ""}${entry.marginMean.toFixed(5)} `
        + `+-${entry.marginSem.toFixed(5)}, uphill on ${entry.wins} of ${entry.draws}`);
    }
  }
  log({ type: "summary", draws: rows.length, steps, summary });
  console.log(`log: ${out}`);
}

// For `scripts/gradient-probe.mjs`'s reason: a worker inherits `process.argv` from the process that
// started it, so a fit shard would otherwise read `argv[1]` as this file and start a second run
// inside the thread that was meant to sum a gradient.
const isMain = isMainThread && process.argv[1] !== undefined
  && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isMain) await main();
