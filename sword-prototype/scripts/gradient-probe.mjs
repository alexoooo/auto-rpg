// The gradient-signal probe: one epoch's shuffled order cut in two, and the angle between what
// the two halves ask for. Experiment B of the signal set's menu.
//
//   node scripts/gradient-probe.mjs [--bouts 32] [--iterations 30] [--opponent self]
//        [--seed 20260917] [--workers N] [--shards 8] [--cap 60] [--random 40]
//        [--terminals maul,mace|all] [--mirror-share 1]
//        [--entropy 0.0003] [--rate 1e-4] [--value-rate 1e-3] [--sigma-rate 10x rate]
//        [--epochs 4] [--batch 4096] [--target-kl 0.03] [--half-life 4] [--lambda 0.95]
//        [--clip 0.2] [--sigma-floor -3] [--sigma-roof 0.5]
//        [--features 2] [--head gaussian] [--sigma constant] [--critic self]
//        [--value-hidden 64,64] [--log tournaments/...] [--label arm]
//
// ## The question, which is not the one the record has been asking
//
// Every negative in `docs/measurements.md` about the learning mind is a statement about an
// *outcome*: a rating that did not move, a kill rate that fell, twenty-five columns of which three
// crossed two sigma and all three were the policy's own spread. None of them is a statement about
// the thing the optimiser was handed. A policy gradient estimated from 32 bouts is a sample mean,
// and a sample mean of a nine-dimensional score function weighted by an advantage can be almost
// entirely noise without a single line of the trainer being wrong. **A flat curve and a correct
// optimiser handed no signal look exactly alike from the outside**, and the closing table of the
// signal set says so in as many words.
//
// This is the instrument that tells them apart. Take one iteration's rollout, shuffle it exactly
// as the fit shuffles it, cut the shuffled order in half, sum each half's gradient, and report the
// cosine between the two. Two halves of one epoch are two independent estimates of the same
// quantity, so the cosine between them is a direct read of how much of a minibatch gradient is the
// gradient and how much of it is the draw. A cosine of 0.9 is an estimator that knows where it is
// going; a cosine of 0.02 is an estimator whose direction is decided by which bouts happened to be
// collected, and no number of iterations of *that* is a fit. **It also says which number to
// change**, which is the whole reason the table priced this experiment: if the cosine climbs with
// the bout count the way a sample mean's does, the bout count is the flag that was wrong.
//
// ## The entropy term is off, and that is the single correctness property of this file
//
// The entropy bonus is not an expectation over samples. Its Gaussian half is exactly `coefficient`
// on every spread, at every sample, whatever the state -- `entropyGrad` in `src/golem/policy.ts`
// adds `scale` to `sigmaGrad[j]` and nothing else for a constant spread -- so both halves receive
// the *identical* vector there and it is perfectly correlated by construction. Left on, it would
// pull every cosine this file prints toward 1 in exact proportion to how much of the gradient it
// accounted for, and a run whose data carried nothing at all would report a healthy number. That
// is not a bias to be corrected afterwards; it is the instrument measuring its own coefficient.
//
// So `PROBE_ENTROPY` is zero, it is the only coefficient this module ever binds, and the binding
// the shards actually read is reported back in every row as `entropyPaid` so that a row testifies
// rather than a comment claiming it.
//
// **Two refinements, because the plan's one-line version of this is not quite the whole of it, and
// the code wins.** First, the entropy term does reach the *actor's* eighty-seven thousand weights,
// not only the nine spreads: the three gates are Bernoulli and their entropy depends on the head's
// own logits, so `entropyGrad` writes into the head gradient for every gate at every sample. That
// part is a deterministic function of the observation rather than a constant, which makes it a
// quantity whose half-means agree far better than the advantage-weighted score function's do --
// there is no reward noise in it -- so it inflates the actor cosine as well, just less bluntly.
// Second, under `--sigma state` the spread is an output of the network and the whole entropy
// gradient flows back through the weights. Off is therefore right for all three cosines below and
// under every head this build reads, and the test file pins the inflation rather than arguing it.
//
// ## Where the halves come from, and why they are index ranges
//
// `FitPool.step` already takes a half-open `[at, end)` over the shuffled order and returns the sum
// of that range's per-sample gradients, scaled by `1 / (end - at)`. So the two halves are
// `[0, floor(n/2))` and `[floor(n/2), n)` of the order the fit's first epoch walks, and they
// partition the epoch *by construction of the arithmetic* rather than by a filter somebody has to
// get right: they are contiguous, they share no index, and their union is every ask exactly once.
// `the_two_half_gradients_average_to_the_gradient_over_the_whole_epoch` asserts that identity
// through the same pool, which is the version of the claim a test can see.
//
// Both halves therefore come back as *means* over their own samples, which is what makes the two
// norms comparable and is why they are reported beside the cosine. A cosine on its own cannot tell
// no signal from a tiny one; the norms can, and the arithmetic is worth writing down. For two
// independent means over `m` samples each, the expected dot product is the squared true gradient
// and the expected squared norm is that plus the per-sample variance over `m`, so `dot` estimates
// the signal, `norm^2 - dot` estimates what the draw contributed, and the cosine is the ratio of
// the first to their sum. Every row carries all three.
//
// ## What is deliberately not built here
//
// **No second gradient path.** The partials are the fit's own, summed by the pool the fit sums
// them with, computed by `shardStep` out of `surrogateGrad`. A probe that computed its own backward
// pass would be measuring the agreement of its own code with itself, which is the cheapest way
// imaginable to publish a number about nothing. The one thing this file computes that the fit also
// computes is the advantage standardisation, and it computes it by calling the fit's own
// `standardisedAdvantages`; the run then checks its spread against the `advantageSd` the fit
// reports and refuses outright if the two ever part, because a probe measuring a different
// estimator from the one that took the Adam step is worse than no probe.
//
// **No change to the fit.** The probe binds the pool, takes its two steps, and then hands the
// rollout to `ppoFit`, which rebinds with the run's own coefficient. Nothing it writes survives
// into a minibatch: a step overwrites the order range, the weights and the three gradient blocks
// before it reads them. The fit this script runs is bit for bit the fit `scripts/league.mjs` runs
// at the same flags, which matters because the whole point of the measurement is to price the runs
// already in the record.
//
// **This is one role and no pool.** The four arms of the opponent bracket are 60 iterations from
// scratch with no exploiters, no pool opponents and ratings off, which is exactly a lone trainer
// with `--opponent` set. So `--opponent self` here is that bracket's mirrored arm with a cosine
// measured on top of it, and the two numbers can be read side by side. The default coefficient is
// the league's 0.0003 rather than the trainer's historical 0.003 for the same reason: what is being
// priced is the runs that were taken, not the default that was left alone so older logs stay
// readable.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { isMainThread } from "node:worker_threads";

import { initWeights, netSize } from "../src/golem/neural-net.ts";
import { PILOT_FEATURES_DEFAULT } from "../src/golem/pilot.ts";
import { ACTION_AXES, POLICY_VERSION, freshNormalisation } from "../src/golem/policy.ts";
import { GOLEM_REWARD } from "../src/golem/reward.ts";
import { PARAM } from "./fit-worker.mjs";
import { meanOf, semOf } from "./train-learner.mjs";
import {
  FitPool, advantages, collectRollouts, episodeReturns, extendNormalisation, fitShuffle,
  fitShuffleRandom, opponentOf, parseOpponentStage, parseTerminals, policyShapeOf, poolFor, ppoFit,
  standardisedAdvantages, valuesOf,
} from "./train-ppo.mjs";

/**
 * The entropy coefficient this file measures under, and the only one it will ever bind.
 *
 * Zero, for the reason the header argues at length: the bonus is not an expectation over the
 * samples, so it is the same vector in both halves and would report a signal that came from the
 * coefficient rather than from the bouts. It is a named constant rather than a literal at a call
 * site so that there is one thing to point a test at.
 */
export const PROBE_ENTROPY = 0;

/**
 * The epoch number handed to a probe step, which nothing downstream of the barrier reads.
 *
 * `FitPool.step` stores it in the control block for a shard that wants to know which pass it is
 * on, and `shardStep` does not look. It is one rather than zero because the order being cut in
 * half is the order the fit's *first* epoch walks, and a row that said epoch zero would be naming
 * a pass that does not exist.
 */
export const PROBE_EPOCH = 1;

/**
 * The two half-open index ranges the epoch is cut into.
 *
 * Contiguous and by index, exactly as `shardSlice` cuts a minibatch, so the two are disjoint and
 * their union is `[0, count)` without a predicate anybody has to get right. An odd epoch gives the
 * extra ask to the second half; the counts are reported per half rather than assumed equal,
 * because a cosine between a mean over 28,705 samples and a mean over 28,706 is fine and a reader
 * who was told neither number cannot check it.
 */
export function halfSplit(count) {
  if (!Number.isInteger(count) || count < 2) {
    throw new Error(`an epoch of ${count} asks has no two halves to take a cosine between`);
  }
  const cut = Math.floor(count / 2);
  return { first: { at: 0, end: cut }, second: { at: cut, end: count } };
}

/** The Euclidean norm of a gradient block. */
export function normOf(a) {
  let sum = 0;
  for (let k = 0; k < a.length; k += 1) sum += a[k] * a[k];
  return Math.sqrt(sum);
}

/** Their inner product, which is what estimates the squared true gradient. */
export function dotOf(a, b) {
  if (a.length !== b.length) throw new Error(`a dot product of ${a.length} against ${b.length}`);
  let sum = 0;
  for (let k = 0; k < a.length; k += 1) sum += a[k] * b[k];
  return sum;
}

/**
 * The cosine of the angle between two gradient blocks, clamped into the interval it lives in.
 *
 * **A zero block reads zero**, which is a convention and not an arithmetic fact: the zero vector
 * has no direction and the honest answer is that there is no angle. Zero is the reading that does
 * not flatter the instrument, and it is unambiguous in a row because the norm beside it is zero as
 * well -- which is the other half of why every cosine here is printed with its two norms. A fit
 * whose actor gradient is exactly zero over a whole half is a fit where every sample of that half
 * fell outside the clip, and that is a fact about the run rather than about this function.
 *
 * The clamp is for the last bits only: a block against itself divides a sum of squares by the
 * square root of its own square, and the two roundings do not have to agree to the last place.
 */
export function cosineOf(a, b) {
  const left = normOf(a);
  const right = normOf(b);
  if (left === 0 || right === 0) return 0;
  return Math.min(1, Math.max(-1, dotOf(a, b) / left / right));
}

/**
 * The shuffled order the fit's first epoch walks over a rollout of `count` asks.
 *
 * Drawn from `fitShuffleRandom` and `fitShuffle`, which are `ppoFit`'s own stream and its own
 * Fisher-Yates rather than a second copy of either, and handed the same fit seed the iteration's
 * `ppoFit` call is handed. That is what makes the two halves below halves of *the* epoch and not
 * of an epoch: a probe that shuffled with a stream of its own would be measuring the same rollout
 * under a different partition, which is a fair estimate of a quantity nobody is optimising.
 */
export function epochOrder(count, seed) {
  return fitShuffle(Array.from({ length: count }, (_, i) => i), fitShuffleRandom(seed));
}

/**
 * One half's gradient triple, taken through the pool the fit takes its minibatches through.
 *
 * The arrays `FitPool.step` returns are the pool's own and are rewritten by the next step, so each
 * half is copied out before the other one is taken. That copy is the only allocation this
 * measurement makes beyond the binding, and it is three arrays against an iteration that runs for
 * a minute.
 */
export function halfGradients({
  pool, rollout, scaled, returns, norm, weights, valueWeights, logSigma, order, clip = 0.2,
}) {
  pool.bind(rollout, scaled, returns, norm, { clip, entropy: PROBE_ENTROPY });
  const halves = halfSplit(rollout.count);
  const taken = [];
  for (const half of [halves.first, halves.second]) {
    const sums = pool.step({
      at: half.at, end: half.end, epoch: PROBE_EPOCH, order, weights, valueWeights, logSigma,
    });
    taken.push({
      at: half.at, end: half.end, asks: half.end - half.at,
      actor: Float64Array.from(sums.grad),
      spread: Float64Array.from(sums.sigmaGrad),
      critic: Float64Array.from(sums.valueGrad),
      kl: sums.kl, clipped: sums.clipped, entropy: sums.entropy,
    });
  }
  return taken;
}

/** One block's three numbers: the angle, the two norms it is a ratio inside, and the dot. */
function blockOf(first, second, which) {
  return {
    cosine: cosineOf(first[which], second[which]),
    firstNorm: normOf(first[which]), secondNorm: normOf(second[which]),
    dot: dotOf(first[which], second[which]),
  };
}

/**
 * The measurement: the cosine between the two halves of one epoch, with what makes it readable.
 *
 * Three blocks are reported and they are three different questions. The **actor** is the
 * experiment's number -- it is the policy gradient, the thing an iteration of this trainer is an
 * estimate of. The **spread** is nine numbers and is reported because it is where the entropy term
 * would have been loudest and because a spread that is being driven by noise is a run that cannot
 * sharpen. The **critic** is a supervised regression gradient rather than a policy gradient, so
 * its cosine is a different quantity entirely -- it is here as a control, because a rollout whose
 * actor cosine is a few hundredths while its critic cosine is high is a rollout with plenty of
 * data in it and an objective that is not using it.
 *
 * `clipFraction` rides along because a gradient can also be small for a reason that has nothing to
 * do with the sample budget: a sample outside the clip carries no gradient at all, and a half in
 * which most of them were clipped is a half whose norm is small because the trust region said so.
 */
export function measureSignal({
  pool, rollout, scaled, returns, norm, weights, valueWeights, logSigma, order, clip = 0.2,
}) {
  const [first, second] = halfGradients({
    pool, rollout, scaled, returns, norm, weights, valueWeights, logSigma, order, clip,
  });
  const actor = blockOf(first, second, "actor");
  return {
    asks: rollout.count, firstAsks: first.asks, secondAsks: second.asks,
    // The unqualified cosine is the actor's, because that is the experiment's question.
    cosine: actor.cosine, firstNorm: actor.firstNorm, secondNorm: actor.secondNorm, dot: actor.dot,
    spread: blockOf(first, second, "spread"),
    critic: blockOf(first, second, "critic"),
    clipFraction: (first.clipped + second.clipped) / rollout.count,
    // Read back off the binding the shards were stepped under rather than off the constant this
    // module holds, so the row is evidence about what was measured and not a restatement of an
    // intention. `the_probe_binds_the_fit_shards_an_entropy_coefficient_of_exactly_zero` is the
    // test that reads it.
    entropyPaid: pool.bound.params[PARAM.ENTROPY],
  };
}

/**
 * The whole measurement for one iteration, from the rollout the collectors just handed over.
 *
 * The advantages, the returns and the standardisation are the fit's own three functions called in
 * the fit's own order, at the weights the fit is about to start from, so `sd` here is the
 * `advantageSd` the fit will report and the CLI below refuses the run if it ever is not.
 */
export function probeRollout({
  pool, rollout, weights, valueWeights, logSigma, norm, valueLayout, seed,
  halfLife = 4, lambda = 0.95, clip = 0.2,
}) {
  const values = valuesOf(rollout, valueWeights, norm, valueLayout);
  const { advantage, returns } = advantages(rollout, values, { halfLife, lambda });
  const { scaled, sd } = standardisedAdvantages(advantage, rollout.count);
  const order = epochOrder(rollout.count, seed);
  const signal = measureSignal({
    pool, rollout, scaled, returns, norm, weights, valueWeights, logSigma, order, clip,
  });
  return { ...signal, advantageSd: sd };
}

// ------------------------------------------------------------------------------------- main

// For `scripts/train-ppo.mjs`'s reason: a worker inherits `process.argv` from the process that
// started it, so a fit shard would otherwise read `argv[1]` as this file and start a second run
// inside the thread that was meant to sum a gradient.
const isMain = isMainThread && process.argv[1] !== undefined
  && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  const argv = process.argv.slice(2);
  const flag = (name, fallback) => {
    const at = argv.indexOf(`--${name}`);
    return at >= 0 && argv[at + 1] !== undefined ? argv[at + 1] : fallback;
  };
  // The two the coordinator varies, and they are the whole experiment: thirty iterations at each
  // of four bout counts, under each arrangement worth asking about.
  const bouts = Math.max(2, Number(flag("bouts", 32)));
  const iterations = Math.max(1, Number(flag("iterations", 30)));
  // Self-play is the arrangement whose flatness is the thing being explained, so it is the
  // default; a named mind is the other half of the question, because the bracket made the
  // arrangement the interesting second axis.
  const opponentWord = parseOpponentStage(flag("opponent", "self"), "--opponent");
  const seed = Number(flag("seed", 20260917)) >>> 0;
  const cap = Number(flag("cap", 60));
  const random = Math.max(0, Number(flag("random", 40)));
  const workers = Math.max(1, Number(flag("workers", Math.max(1, availableParallelism() - 2))));
  // At least one, and one is legal: a pool of a single shard allocates the shared memory, walks
  // the whole range on one thread and adds its single partial to zero, which is exact.
  const shards = Math.max(1, Number(flag("shards", 8)));
  const terminals = parseTerminals(flag("terminals", null));
  const mirrorShare = Number(flag("mirror-share", 1));
  if (!Number.isFinite(mirrorShare) || mirrorShare < 0 || mirrorShare > 1) {
    throw new Error(`--mirror-share ${flag("mirror-share", 1)} is not a share; it runs from 0 to 1`);
  }
  const halfLife = Number(flag("half-life", 4));
  const lambda = Number(flag("lambda", 0.95));
  const clip = Number(flag("clip", 0.2));
  // The coefficient the *fit* pays, which the probe never sees. The league's default rather than
  // the trainer's, because the runs this prices are league runs.
  const fitEntropy = Number(flag("entropy", 0.0003));
  const rate = Number(flag("rate", 1e-4));
  const valueRate = Number(flag("value-rate", 1e-3));
  const sigmaRate = Number(flag("sigma-rate", rate * 10));
  const epochs = Math.max(1, Number(flag("epochs", 4)));
  const batch = Math.max(1, Number(flag("batch", 4096)));
  const targetKl = Math.max(0, Number(flag("target-kl", 0.03)));
  const sigmaFloor = Number(flag("sigma-floor", -3));
  const sigmaRoof = Number(flag("sigma-roof", 0.5));
  const headName = flag("head", "gaussian");
  const sigmaName = flag("sigma", "constant");
  const criticName = flag("critic", "self");
  // One checked reader for the five shape flags, the same one both trainers use, so a probe can be
  // pointed at an arm that is not the shipped shape without a second copy of the refusals.
  const shape = policyShapeOf({
    features: Number(flag("features", PILOT_FEATURES_DEFAULT)),
    head: headName, sigma: sigmaName, critic: criticName, sigmaFloor, sigmaRoof,
    valueHidden: flag("value-hidden", "64,64").split(",").map((s) => s.trim()),
  });
  const { features, spec, columns, layout, central, valueLayout } = shape;
  const label = flag("label", null);
  const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 13);
  // Concatenated rather than interpolated, for the trainer's reason: a backticked span that looks
  // like a path is a durable reference to the documentation tests, and this one names a file that
  // does not exist yet.
  const out = resolve(flag("log", "tournaments/gradient-" + stamp + "-" + seed + ".jsonl"));
  if (existsSync(out)) {
    throw new Error(`${out} exists; a probe does not append to another run's log`);
  }
  mkdirSync(dirname(out), { recursive: true });
  const log = (line) => writeFileSync(out, JSON.stringify(line) + "\n", { flag: "a" });
  const progress = (what) => ({ done, total, seconds }) => {
    if (done % 128 === 0 || done === total) console.log(`  ${what}: ${done}/${total} bouts, ${seconds.toFixed(0)} s`);
  };

  const date = new Date().toISOString().slice(0, 10);
  const weights = initWeights(layout, seed);
  const valueWeights = initWeights(valueLayout, (seed ^ 0x1c) >>> 0);
  const logSigma = new Float64Array(ACTION_AXES).fill(-0.7);
  let norm = freshNormalisation(columns);
  let actor = null;
  let spread = null;
  let critic = null;

  log({
    type: "header", kind: "gradient-probe", seed, date, version: POLICY_VERSION, features,
    layout, valueLayout, label, iterations, bouts, cap, random, workers, shards,
    opponent: opponentWord, terminals, mirrorShare,
    head: headName, sigma: sigmaName, critic: criticName,
    halfLife, lambda, clip, entropy: fitEntropy, rate, valueRate, sigmaRate, epochs, batch,
    targetKl, sigmaFloor, sigmaRoof, reward: GOLEM_REWARD,
    // The coefficient the measurement itself was taken under, in the header as well as in every
    // row, because it is the one field of this file a later reader has to be able to check.
    probeEntropy: PROBE_ENTROPY,
  });
  console.log(`gradient probe: seed ${seed}, ${iterations} iterations of ${bouts} bouts against `
    + `${opponentOf(opponentWord) === null ? `${opponentWord} (self-play; both corners are the fit)` : opponentWord}`);
  console.log(`  ${netSize(layout)} actor weights, ${workers} collectors, `
    + `${shards === 1 ? "one fit thread" : `${shards} fit shards`}, pool ${terminals.join("+")}`);
  console.log(`  the cosine is taken with the entropy coefficient at ${PROBE_ENTROPY}; the fit pays ${fitEntropy}`);

  const pool = await FitPool.open({ shards, layout, valueLayout, spec });
  const cosines = [];
  try {
    for (let iteration = 1; iteration <= iterations; iteration += 1) {
      const started = Date.now();
      const bodies = poolFor({ seed: (seed ^ iteration) >>> 0, random, terminals, mirror: true });
      const randomBodies = mirrorShare < 1
        ? poolFor({ seed: (seed ^ iteration) >>> 0, random, terminals, mirror: false })
        : null;
      const rollout = await collectRollouts({
        pool: bodies, randomPool: randomBodies, mirrorShare,
        weights, logSigma, norm, seed: (seed + iteration * 7919) >>> 0, bouts, workers, cap,
        reward: GOLEM_REWARD, opponent: opponentOf(opponentWord),
        features, spec, central,
        onProgress: progress(`iteration ${iteration}`),
      });
      const collected = (Date.now() - started) / 1000;
      if (rollout.count === 0) throw new Error("an iteration collected no asks at all");
      // The same expression `scripts/train-ppo.mjs` hands its own `ppoFit`, so the order the halves
      // are cut out of is the order the fit below shuffles.
      const fitSeed = (seed ^ iteration * 31) >>> 0;
      const probeStarted = Date.now();
      const signal = probeRollout({
        pool, rollout, weights, valueWeights, logSigma, norm, valueLayout, seed: fitSeed,
        halfLife, lambda, clip,
      });
      const probed = (Date.now() - probeStarted) / 1000;
      const fitStarted = Date.now();
      const fit = ppoFit(rollout, {
        weights, logSigma, valueWeights, layout, valueLayout, norm, seed: fitSeed,
        halfLife, lambda, clip, entropy: fitEntropy, rate, valueRate, sigmaRate, epochs, batch,
        targetKl, sigmaFloor, sigmaRoof, actor, spread, critic, shards, pool, spec,
      });
      const fitted = (Date.now() - fitStarted) / 1000;
      // The refusal this instrument is worth having: the probe and the fit have to be estimating
      // the same thing, and the standardised advantage's spread is the one number both of them
      // compute independently out of the same rollout. They are the same arithmetic on the same
      // inputs, so anything but equality means the probe measured some other estimator, and a
      // cosine about some other estimator is worse than no cosine at all.
      if (signal.advantageSd !== fit.advantageSd) {
        throw new Error(`the probe standardised this iteration's advantages at ${signal.advantageSd} `
          + `and the fit at ${fit.advantageSd}; the two are not measuring one estimator`);
      }
      ({ actor, spread, critic } = fit);
      norm = extendNormalisation(norm, rollout);
      cosines.push(signal.cosine);
      const { share } = episodeReturns(rollout);
      log({
        type: "iteration", iteration, bouts: rollout.bouts, steps: rollout.count,
        opponent: opponentWord, terminals, mirrorShare: rollout.mirrorShare,
        mirrorBouts: rollout.mirrorBouts, randomBouts: rollout.randomBouts,
        decided: rollout.decided, margin: rollout.margin, penaltyShare: share,
        // Full precision throughout and rounded nowhere: a gradient norm's order of magnitude is
        // not known in advance, and a rounding chosen for a cosine would silently write a norm of
        // 3e-7 out as zero.
        ...signal,
        kl: fit.kl, clipFraction: fit.clipFraction, entropy: fit.entropy,
        explained: fit.explainedAfter, epochsRun: fit.epochs, updates: fit.updates,
        stopped: fit.stopped === null ? null : fit.stopped.kl,
        logSigma: Array.from(logSigma),
        collectSeconds: collected, probeSeconds: probed, fitSeconds: fitted,
        seconds: (Date.now() - started) / 1000,
      });
      const signed = (x) => `${x >= 0 ? "+" : ""}${x.toFixed(4)}`;
      console.log(`  it ${String(iteration).padStart(2)}: asks ${rollout.count} `
        + `(${signal.firstAsks}/${signal.secondAsks})  cos ${signed(signal.cosine)}  `
        + `|g| ${signal.firstNorm.toExponential(2)}/${signal.secondNorm.toExponential(2)}  `
        + `dot ${signal.dot.toExponential(2)}  spread ${signed(signal.spread.cosine)}  `
        + `critic ${signed(signal.critic.cosine)}  KL ${fit.kl.toFixed(5)}  `
        + `clip ${(fit.clipFraction * 100).toFixed(1)}%  `
        + `${((Date.now() - started) / 1000).toFixed(0)} s `
        + `(${collected.toFixed(0)} collect, ${probed.toFixed(1)} probe, ${fitted.toFixed(0)} fit)`);
    }
  } finally {
    await pool.close();
  }

  // The run's answer, which is a mean over iterations and not a single reading: one iteration's
  // cosine is itself an estimate made from one pair of halves, and thirty of them is what the
  // experiment was priced for.
  const mean = meanOf(cosines);
  const sem = semOf(cosines);
  const sorted = [...cosines].sort((a, b) => a - b);
  const median = sorted.length % 2 === 1
    ? sorted[(sorted.length - 1) / 2]
    : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
  log({
    type: "summary", iterations: cosines.length, bouts, opponent: opponentWord,
    cosineMean: mean, cosineSem: sem, cosineMedian: median,
    cosineLeast: sorted[0], cosineMost: sorted[sorted.length - 1], probeEntropy: PROBE_ENTROPY,
  });
  console.log(`cosine over ${cosines.length} iterations at ${bouts} bouts against ${opponentWord}: `
    + `${mean >= 0 ? "+" : ""}${mean.toFixed(4)} +- ${sem.toFixed(4)}, `
    + `median ${median.toFixed(4)}, range ${sorted[0].toFixed(4)} to ${sorted[sorted.length - 1].toFixed(4)}`);
  console.log(`log: ${out}`);
}
