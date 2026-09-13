// The gradient-signal probe: one epoch's shuffled order cut in two, and the angle between what
// the two halves ask for. Experiment B of the signal set's menu.
//
//   node scripts/gradient-probe.mjs [--bouts 32] [--iterations 30] [--opponent self]
//        [--seed 20260917] [--workers N] [--shards 8] [--cap 60] [--random 40]
//        [--terminals maul,mace|all] [--mirror-share 1]
//        [--entropy 0.0003] [--rate 1e-4] [--value-rate 1e-3] [--sigma-rate 10x rate]
//        [--epochs 4] [--batch 4096] [--target-kl 0.03] [--half-life 4] [--lambda 0.95]
//        [--clip 0.2] [--sigma-floor -3] [--sigma-roof 0.5]
//        [--from tournaments/<arm>/pool-30.json] [--hold]
//        [--classes none|terminal|build] [--class-floor 400] [--bout-split]
//        [--rewards arms.json] [--tactics holdMetres=...]
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
// So `PROBE_ENTROPY` is zero, every cosine below is taken at it, and the binding the shards
// actually read is reported back in every row as `entropyPaid` so that a row testifies rather than
// a comment claiming it.
//
// **And then the question that leaves standing, which `measureBonus` answers and nothing else in
// the record does.** A production fit does not run at zero entropy. It runs at 3e-4, and the step
// it takes is the data's gradient plus the bonus's. Turning the bonus off to measure the data is
// right; concluding from that that the bonus does not matter is not, and the two are one sentence
// apart. So one whole-order step at zero is differenced against one at the production coefficient,
// outside every cosine and after every arm, and the row gets the bonus's norm against the data's
// and the **angle between them**. Large and orthogonal is a term wandering off. Large and negative
// against the data is a term undoing the fit, which no number of bouts repairs.
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
// ## `--classes`, which asks whether the bodies in one pool want the same thing
//
// The grid's closing paragraph names one cheap measurement it did not make. If different bodies
// demand contradictory policy changes, then averaging more of them drives the mean toward zero
// rather than toward a signal -- the pooled gradient would be blunt *because* it is pooled, and a
// per-class gradient would cohere where it does not. That is a different diagnosis from a gradient
// that is simply noisy, it implies a different fix, and nothing in the record separates them.
//
// `--classes` cuts one rollout's asks by the body that fought them and reports three cosines.
// **Within** is a class against itself, two halves of its own asks. **Between** is one class's half
// against another's. **Pooled** is the control and is the reason the other two mean anything: two
// blocks of exactly the within-class half sizes, drawn off the front of the same shuffled order
// with class ignored. A within-class cosine is taken over a quarter of the rollout where the
// pooled cosine of the experiment above is taken over a half, so the two would not otherwise be
// comparable, and the direction of that bias is the one that manufactures the finding.
//
// So the reading is `within` against `pooled` at matched size, and `between` on its own. Bodies
// that want the same thing give a `between` near the other two. Bodies that contradict give a
// `within` above `pooled` and a `between` at zero, and that is a pool problem rather than a sample
// problem. Both above `pooled` would say the grouping found structure the draw did not, which is a
// third outcome and is why all three are printed rather than a difference.
//
// The cut is taken out of the fit's own shuffled order rather than out of the collection order, so
// halving a class is a random split of it and not a split by bout or by corner. The class of an
// ask is traced through the rollout's `done` flags to `bodies`, which `collectRollouts` writes one
// entry an episode, and every step of that trace is refused rather than assumed -- an off-by-one
// there would read as bodies that disagree, which is the finding this exists to report.
//// ## Where the halves come from, and why they are index ranges
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
// ## `--bout-split`, because the arithmetic above says `m` and the record has been saying bouts
//
// Read that paragraph again with `m` in mind. `m` is the number of **independent** samples each
// half is a mean over, and `halfSplit` cuts the shuffled order of *asks*, so the two halves hold
// asks out of the same bouts. Everything a bout draw decides -- which pair of bodies fought, which
// two streams drove them, who won, and therefore every advantage in both episodes of it -- enters
// both halves with the same sign. The halves are positively correlated, `dot` is inflated, and the
// inflation goes the flattering way: the signal reads larger and the noise smaller than two truly
// independent collections would find.
//
// That does not make the ask split wrong. It is the right cut for the question this file was
// written to ask -- *how much of a minibatch gradient is the gradient* -- because a minibatch is a
// random subset of asks and its neighbours in the epoch are drawn from the same rollout too. It is
// the wrong cut for the question the held row of 2026-09-12 went on to ask of the same numbers,
// which is how many **bouts** an iteration would have to collect for two of them to agree. Those
// are different questions, they had one instrument between them, and this flag is the second one.
//
// So `--bout-split` re-lays the same shuffled order into two disjoint sets of whole bouts and
// reports a second set of three blocks under `byBout`, **beside** the first and never in place of
// it. One rollout cut two ways is a comparison; two runs cut one way each would be two rollouts
// and no comparison at all. `boutBlocks` does the laying and `askBouts` does the tracing, through
// `rollout.episodeBouts` and the same `done` walk and the same three refusals `askClasses` makes --
// and it is a separate function from the class axis rather than a fourth entry in `CLASS_AXES`,
// because `classBlocks` drops a class whose half is under `CLASS_FLOOR` and every single bout is
// under it, so a bout routed through that machinery would report nothing kept and read as a
// finding.
//
//
// ## `--rewards`, which is the only axis here that is free, and the reason it is
//
// The three splits above cut one gradient different ways. This one changes the gradient, and it is
// still one collection -- which is worth being precise about, because it is the difference between
// a diagnostic that costs twenty minutes and a set of training runs that costs a week.
//
// **A reward coefficient does not change how a held policy acts.** The body draws its action from
// the weights and reads its observation from the arena; the reward is a number written down
// afterwards, and under `--hold` the weights do not move. So the bouts a run under one table would
// have fought are the bouts a run under any other table already fought, and `mergeRollouts` has
// kept every quantity a coefficient multiplies since the learn set's Session 06. `priceRollout` is
// what turns that from a true sentence into an instrument: it prices a rollout that already exists
// under whatever table is asked for, and this file then re-runs the advantage estimate, the
// standardisation and the two half gradients off it.
//
// **The pairing is to the ask, and it is the whole value of the design.** Two separate collections
// under two tables differ by the per-bout noise the held row measured at about twenty-nine squared
// units a bout -- which is large enough that the record's `|S|^2` against a mind, 2.688e-3, sits
// under two standard errors of zero after eighty collections. Two pricings of one collection share
// the observations, the draws, the log-probabilities, the episode boundaries and the shuffled
// order as *the same objects*. The arms differ by their coefficients and by nothing else at all,
// so a difference between them needs no sample budget to see.
//
// **Which is exactly why it cannot answer the question a training run answers.** An arm here says
// what a table would do to the gradient *at this policy*, not what a policy trained under that
// table would become -- and those separate as soon as the weights move, because a table that
// rewards something the policy does not yet do pays nothing until it does it. The honest use is
// elimination and ranking: a table that puts no signal into the gradient at the policy the record
// is stuck at is not the table that unsticks it, and a table that does is worth a night.
//
// **An arm may also name a credit horizon**, and it belongs on the same file rather than on a flag
// of its own for the reason above said about coefficients: `halfLife` and `lambda` are read after a
// collection and change no body's action, so they are free along exactly the axis the table is. The
// gain is not the saved grid, it is the *combination* -- a table that pays for something immediate
// and a horizon short enough to keep it is one arm, where two flags would have been two sweeps and
// no cell where both moved at once.
//
// The arms are read from a file rather than from the command line, because eight coefficients by N
// arms is not a command line, and because a sweep's arms are a *design* -- written before the
// bouts, quotable afterwards, and logged resolved in the header so the row says the coefficients
// it was priced under rather than the name of a file that may since have changed.
//
// ## `--tactics`, which is the axis that is not free, and is here anyway
//
// A tactics row changes how the body acts, so every arm of it is its own collection and the
// pairing above is gone. It is on this instrument regardless, because the probe is the cheap
// instrument in the tree -- twenty-odd minutes against a training run's five hours -- and the
// candidate the record has been pointing at since Session 07 of the learn set is a tactics row:
// `latchAbort`, which reads the abort gate on the ask that starts a stroke instead of on all six
// or seven of them. The reading it supports is `|S|^2` between two arms, not a cosine difference,
// for the reason `docs/design.md` now states as a ruling.
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
//
// ## `--from` and `--hold`, which exist because the first grid could not separate two readings
//
// The grid of 2026-09-12 ran eight cells, two opponents by four bout counts, each cell its own
// thirty iterations from scratch *at that cell's bout count*. So the 256-bout cell measured a policy
// that had been trained with 256-bout updates, and the `golem-fencer` row -- flat across a factor of
// eight -- admitted two readings the design could not tell apart: more bouts do not sharpen the
// gradient, or bigger batches walk the policy somewhere with less signal in it. That confound is
// recorded in the entry rather than discovered by a reader, and these two flags are what removes it.
//
// `--from` starts at a checkpoint instead of a fresh initialisation, taking the weights, the value
// weights, the spread and the normalisation together, because a policy read against a normalisation
// it was not fitted under is a different policy. `--hold` then does not fit at all: no `ppoFit` and
// no `extendNormalisation`, so every iteration of the run measures the *same* policy and an
// iteration stops being a step of a trajectory and becomes one independent collection at one fixed
// point. A row of `--bouts` under `--hold` therefore varies the sample size and nothing else, which
// is the measurement the grid owed.
//
// `--hold` without `--from` is refused rather than defaulted to the fresh initialisation: holding a
// random policy measures the gradient of a mind nobody will ever train, and it is the kind of run
// that is easy to start by accident and hard to notice afterwards. A held row carries `held: true`
// and a null `kl`, which is a different fact from a `kl` of zero -- a fit that did not move against
// a run that never asked for one -- and the refusal that compares the probe's advantage spread
// against the fit's is skipped because there is no second computation to disagree with, not because
// it was waived.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { isMainThread } from "node:worker_threads";

import { initWeights, netSize } from "../src/golem/neural-net.ts";
import { PILOT_FEATURES_DEFAULT } from "../src/golem/pilot.ts";
import { ACTION_AXES, POLICY_VERSION, freshNormalisation } from "../src/golem/policy.ts";
import { GOLEM_REWARD } from "../src/golem/reward.ts";
import { COMMAND_AXES, COMMAND_GATES } from "../src/golem/tactics-v4.ts";
import { PARAM } from "./fit-worker.mjs";
import { meanOf, semOf } from "./train-learner.mjs";
import {
  FitPool, REWARD_KEYS, advantages, collectRollouts, episodeReturns, extendNormalisation,
  fitShuffle, fitShuffleRandom, opponentOf, parseOpponentStage, parseTactics, parseTerminals,
  policyShapeOf, poolFor, ppoFit, priceRollout, standardisedAdvantages, valuesOf,
} from "./train-ppo.mjs";

/**
 * The entropy coefficient every cosine in this file is taken under.
 *
 * Zero, for the reason the header argues at length: the bonus is not an expectation over the
 * samples, so it is the same vector in both halves and would report a signal that came from the
 * coefficient rather than from the bouts. It is a named constant rather than a literal at a call
 * site so that there is one thing to point a test at.
 *
 * **`measureBonus` binds a production coefficient and is the only thing here that ever does.** The
 * invariant is not "this file never binds a non-zero entropy" -- that was the old sentence and it
 * was the wrong one, because it made a measurement the record needs unwriteable. The invariant is
 * that **no half-split cosine is taken under a non-zero coefficient**: every number that compares
 * one half of an epoch with the other comes off a binding at `PROBE_ENTROPY`, and the bonus
 * measurement is not a half-split at all. It is one whole-order step differenced against another,
 * which is a quantity the inflation argument above does not apply to.
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
  return takeHalves({
    pool, order, halves: [halves.first, halves.second], weights, valueWeights, logSigma,
  });
}

/** Two ranges of one order, summed and copied out, which is all either split actually does. */
function takeHalves({ pool, order, halves, weights, valueWeights, logSigma }) {
  const taken = [];
  for (const half of halves) {
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

/**
 * The same two gradients over two disjoint sets of **whole bouts** rather than over shuffled asks.
 *
 * The pool is bound again rather than assumed still bound, for `measureClasses`' reason: a function
 * that steps a binding it did not take is one refactor away from summing somebody else's rollout.
 * The laid order is a permutation of the caller's own and is therefore exactly `rollout.count`
 * long, so `FitPool.bind`'s shared order is the size it was asked for -- which is the trap the
 * class split had to be rewritten around and is worth not walking into twice.
 */
export function boutGradients({
  pool, rollout, scaled, returns, norm, weights, valueWeights, logSigma, order, keys, clip = 0.2,
}) {
  const laid = boutBlocks(order, keys);
  pool.bind(rollout, scaled, returns, norm, { clip, entropy: PROBE_ENTROPY });
  const taken = takeHalves({
    pool, order: laid.order, halves: [laid.first, laid.second], weights, valueWeights, logSigma,
  });
  return { taken, firstBouts: laid.firstBouts, secondBouts: laid.secondBouts };
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
 * Where each of the head's outputs lives in the flat actor gradient.
 *
 * `netSize`'s layout, restated as index arithmetic rather than as a comment: `weights` holds each
 * layer's matrix row-major, `outputs x inputs`, then that layer's bias, layer after layer. So the
 * last layer begins after every earlier one, output `j` owns the `fanIn` numbers at
 * `base + j * fanIn`, and its bias is the one at `base + outputs * fanIn + j`. The total is
 * asserted against `netSize` rather than trusted, because an off-by-one here would read a
 * neighbouring output's row and report a finding about the wrong axis.
 */
export function headRows(layout) {
  const widths = [layout.inputs, ...layout.hidden, layout.outputs];
  let base = 0;
  for (let l = 0; l + 2 < widths.length; l += 1) base += widths[l + 1] * (widths[l] + 1);
  const fanIn = widths[widths.length - 2];
  const rows = { base, fanIn, outputs: layout.outputs, biasAt: base + layout.outputs * fanIn };
  const end = rows.biasAt + layout.outputs;
  if (end !== netSize(layout)) {
    throw new Error(`the head's last row ends at ${end} and the layout is ${netSize(layout)} long`);
  }
  return rows;
}

/**
 * The named groups of head outputs a row reports separately, and the indices each one owns.
 *
 * Nine axes, three gates, and under `--sigma state` nine more spreads, named by `COMMAND_AXES` and
 * `COMMAND_GATES` rather than by number -- because the whole reason to cut the gradient this way
 * is to be able to say **abort** in a sentence. An axis may own more than one output: a
 * categorical axis owns `HEAD_BINS` of them and a Beta axis owns two, which is what `spec.at` and
 * `spec.span` are for, and reading them rather than assuming one output an axis is what keeps this
 * correct under `--head mixed`.
 */
export function headGroups(layout, spec) {
  const rows = headRows(layout);
  const groups = [];
  const of = (name, from, span) => {
    const at = [];
    for (let k = 0; k < span; k += 1) at.push(from + k);
    if (at[at.length - 1] >= rows.outputs) {
      throw new Error(`"${name}" wants output ${at[at.length - 1]} of a head ${rows.outputs} wide`);
    }
    groups.push({ name, outputs: at });
  };
  for (const [j, name] of COMMAND_AXES.entries()) of(name, spec.at[j], spec.span[j]);
  for (const [g, name] of COMMAND_GATES.entries()) of(name, spec.gateAt + g, 1);
  if (spec.sigmaAt >= 0) {
    for (const [j, name] of COMMAND_AXES.entries()) of(`${name}:sigma`, spec.sigmaAt + j, 1);
  }
  return { rows, groups };
}

/** Every flat index one group of head outputs owns: its weight rows and its biases. */
function* indicesOf(rows, outputs) {
  for (const j of outputs) {
    for (let k = rows.base + j * rows.fanIn; k < rows.base + (j + 1) * rows.fanIn; k += 1) yield k;
    yield rows.biasAt + j;
  }
}

/**
 * The same half-split, cut by the head output it lands on, which is the cut the record needs.
 *
 * Every number the probe has printed so far is over all eighty-seven thousand actor weights at
 * once, and the two questions the signal set is left with are both about **one row of twelve**.
 * Does the abort gate's own gradient carry a signal the sample can see? And is the entropy bonus,
 * which is concentrated on the three gate logits, large against that row's signal even though it
 * is a thousandth of the whole step's length? A norm over the whole actor cannot answer either,
 * because the three gate rows are 771 numbers in eighty-seven thousand and anything that happens
 * there is invisible in the total.
 *
 * **The cut is the last layer only, and that is a real limitation rather than a simplification.**
 * A head output's own row and bias are the weights that are unambiguously that output's; the two
 * hidden layers are shared by all twelve and there is no honest way to attribute them. So this
 * says what the *head* is being told, not what the network is. A row whose head gradient is pure
 * bonus is still being moved by the data through its hidden layers -- what it is not being moved
 * by is anything that distinguishes it from its eleven neighbours.
 */
export function headSignal({ first, second, layout, spec }) {
  const { rows, groups } = headGroups(layout, spec);
  return groups.map(({ name, outputs }) => {
    let dot = 0;
    let left = 0;
    let right = 0;
    for (const k of indicesOf(rows, outputs)) {
      dot += first[k] * second[k];
      left += first[k] * first[k];
      right += second[k] * second[k];
    }
    const firstNorm = Math.sqrt(left);
    const secondNorm = Math.sqrt(right);
    return {
      name, dot, firstNorm, secondNorm,
      cosine: firstNorm === 0 || secondNorm === 0
        ? 0 : Math.min(1, Math.max(-1, dot / firstNorm / secondNorm)),
    };
  });
}

/** One vector's norm over each head group, which is how the bonus is reported beside the signal. */
export function headNorms({ vector, layout, spec }) {
  const { rows, groups } = headGroups(layout, spec);
  return groups.map(({ name, outputs }) => {
    let sum = 0;
    for (const k of indicesOf(rows, outputs)) sum += vector[k] * vector[k];
    return { name, norm: Math.sqrt(sum) };
  });
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
  heads = null,
}) {
  const [first, second] = halfGradients({
    pool, rollout, scaled, returns, norm, weights, valueWeights, logSigma, order, clip,
  });
  const actor = blockOf(first, second, "actor");
  return {
    asks: rollout.count, firstAsks: first.asks, secondAsks: second.asks,
    // Absent unless a caller named a layout, so an arm's row -- taken seventeen times an iteration
    // -- stays the object it was and the head cut is written once, for the row the question is
    // about. The arms differ from the row by a reward table and not by a head.
    ...(heads === null ? {} : {
      heads: headSignal({ first: first.actor, second: second.actor, ...heads }),
    }),
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
 * How much of a production step is the bonus rather than the data, and which way the bonus points.
 *
 * Every cosine above is taken with the entropy coefficient at zero, and the header spends four
 * paragraphs on why. That is the right choice, and it leaves a question standing that the record
 * has argued from the weights rather than measured: **a production fit does not run at zero
 * entropy.** It runs at 3e-4, and the step it takes is the data's gradient plus the bonus's. The
 * signal set's diagnosis says the bonus is what holds the three gate logits at a coin flip -- the
 * shipped table's are +0.062, -0.191 and +0.066, all within a fifth of a logit of the knife edge
 * after ninety-three iterations, and the two bracket checkpoints put the abort logit within a
 * third of a logit of zero after thirty. That is an argument from where the weights ended up. This
 * is the quantity itself.
 *
 * The arithmetic is a subtraction and there is no cleverness in it. One whole-order step at
 * `PROBE_ENTROPY` is the data's mean gradient; one whole-order step at the production coefficient
 * over the same order, the same rollout and the same weights is that plus the bonus; the difference
 * is the bonus exactly, because the pool adds the two per sample and nothing else about the binding
 * moved. So the row gets three numbers a block: the bonus's own norm, the data's, and **the cosine
 * between them**, which is the one that decides what the finding is. A bonus that is large and
 * orthogonal is a term wandering off in a direction the data does not care about. A bonus that is
 * large and *negative* against the data is a term actively undoing the fit, and no amount of
 * collecting more bouts fixes that one.
 *
 * Reported for the actor and for the spread separately because they are two different claims. The
 * spread's bonus is the analytic case -- for a constant spread the entropy gradient is exactly the
 * coefficient on every one of the nine rows, so its norm must come back as three times the
 * coefficient and the test asserts that number rather than a range. The actor's is the one nobody
 * can write down: it is the three Bernoulli gates' `-logit * p * (1-p)` summed through eighty-seven
 * thousand weights, and its size against the data's is the measurement this function exists for.
 *
 * Returns `null` at a coefficient of zero rather than a block of zeros, so a run that asked for no
 * bonus writes the row it wrote before this existed and two such runs stay comparable field for
 * field.
 */
export function measureBonus({
  pool, rollout, scaled, returns, norm, weights, valueWeights, logSigma, order, clip = 0.2,
  entropy = 0, heads = null,
}) {
  if (!(entropy > 0)) return null;
  const whole = [{ at: 0, end: rollout.count }];
  // Bound twice and stepped twice rather than bound once and scaled, because the entropy term's
  // dependence on the coefficient is `entropyGrad`'s business and not this file's to assume.
  pool.bind(rollout, scaled, returns, norm, { clip, entropy: PROBE_ENTROPY });
  const [data] = takeHalves({ pool, order, halves: whole, weights, valueWeights, logSigma });
  pool.bind(rollout, scaled, returns, norm, { clip, entropy });
  const [both] = takeHalves({ pool, order, halves: whole, weights, valueWeights, logSigma });
  const blockOfBonus = (which) => {
    const plain = data[which];
    const paid = both[which];
    const bonus = new Float64Array(plain.length);
    for (let k = 0; k < plain.length; k += 1) bonus[k] = paid[k] - plain[k];
    const dataNorm = normOf(plain);
    return {
      norm: normOf(bonus), dataNorm,
      share: dataNorm === 0 ? 0 : normOf(bonus) / dataNorm,
      cosine: cosineOf(bonus, plain),
      // The head cut, on the actor only and only when a caller named a layout. The spread block is
      // the nine `logSigma` parameters and not head outputs, so there is nothing there to cut.
      ...(heads === null || which !== "actor" ? {} : { heads: headNorms({ vector: bonus, ...heads }) }),
    };
  };
  const measured = {
    coefficient: entropy,
    actor: blockOfBonus("actor"),
    spread: blockOfBonus("spread"),
  };
  // Left as it was found. Every consumer in this file binds before it steps, so this is not needed
  // by anything here -- it is here because a pool left bound at a production coefficient is a trap
  // for the next function somebody adds, and the whole correctness property of the module is that
  // no cosine is taken under one.
  pool.bind(rollout, scaled, returns, norm, { clip, entropy: PROBE_ENTROPY });
  return measured;
}

/**
 * The whole measurement for one iteration, from the rollout the collectors just handed over.
 *
 * The advantages, the returns and the standardisation are the fit's own three functions called in
 * the fit's own order, at the weights the fit is about to start from, so `sd` here is the
 * `advantageSd` the fit will report and the CLI below refuses the run if it ever is not.
 */
/**
 * `--hold` measures one fixed policy, so it needs one named.
 *
 * Refused rather than defaulted to the fresh initialisation, because holding a randomly initialised
 * policy measures the gradient of a mind nobody will ever train -- a run that is easy to start by
 * accident, costs the same hours as a real one, and produces a number that looks exactly like a
 * finding. The pairing is a rule and not a convention, so it is a function a test can point at
 * rather than a condition inside a CLI block nothing can import.
 */
export function checkHeldStart({ from, hold }) {
  if (hold && (from === null || from === undefined || from === "")) {
    throw new Error("--hold measures one fixed policy, so it wants --from naming the checkpoint it holds");
  }
  return hold;
}

export function probeRollout({
  pool, rollout, weights, valueWeights, logSigma, norm, valueLayout, seed,
  halfLife = 4, lambda = 0.95, clip = 0.2, classes = "none", floor = CLASS_FLOOR,
  boutSplit = false, rewards = [], entropy = 0, layout = null, spec = null,
}) {
  const values = valuesOf(rollout, valueWeights, norm, valueLayout);
  const { advantage, returns } = advantages(rollout, values, { halfLife, lambda });
  const { scaled, sd } = standardisedAdvantages(advantage, rollout.count);
  const order = epochOrder(rollout.count, seed);
  // Both or neither: a head cut wants the layout to find the last layer and the spec to name what
  // each output is, and one without the other is a caller who thinks they asked for something and
  // would get a row with no `heads` on it and no complaint.
  if ((layout === null) !== (spec === null)) {
    throw new Error("a head cut wants both a layout and a head spec, and was given one of them");
  }
  const heads = layout === null ? null : { layout, spec };
  const signal = measureSignal({
    pool, rollout, scaled, returns, norm, weights, valueWeights, logSigma, order, clip, heads,
  });
  // The class split second and out of the same three arrays, so the two measurements are of one
  // rollout under one standardisation. Separate collections a class would have been easier and
  // would have standardised each class against itself, which removes exactly the disagreement the
  // split exists to look for: a class whose advantages are systematically high pushes harder in the
  // pooled batch and not at all in a batch of its own.
  const cut = classes === "none" ? null : measureClasses({
    pool, rollout, scaled, returns, norm, weights, valueWeights, logSigma, order,
    keys: askClasses(rollout, classes), clip, floor,
  });
  // Third and last, so the two measurements above are byte for byte what a run without this flag
  // reports: neither split consumes randomness, both read the same three arrays, and the order
  // they are taken in is therefore free. Reported *beside* the ask split rather than in place of
  // it, which is the whole point -- the two numbers are the same rollout cut two ways, and a pair
  // of separate runs would have been two rollouts and no comparison.
  const byBout = boutSplit === false ? null : measureBouts({
    pool, rollout, scaled, returns, norm, weights, valueWeights, logSigma, order,
    keys: askBouts(rollout), clip,
  });
  // Fourth, and it is the only one of the four that changes a number the fit reads rather than
  // the way one is cut. A reward table does not move a *held* policy, so the rollout above is the
  // rollout every arm here would have collected: the observations, the draws, the
  // log-probabilities, the episode boundaries and `order` are the same objects across all of them,
  // and the critic's forward pass is reused because it reads observations and not rewards. So an
  // arm differs from the row it sits in by its coefficients and by nothing whatever else, which is
  // a pairing to the ask -- against the held row's twenty-nine squared units a bout that two
  // separate collections would have differed by before the table was allowed to say anything.
  //
  // `advantages` is re-run rather than patched because a reward changes every advantage behind it
  // through the backwards discount, and `standardisedAdvantages` after it because a table that
  // scales the return scales the spread and the fit would have divided by the new one.
  const priced = rewards.length === 0 ? null : rewards.map((named) => {
    const { label, table } = named;
    const paid = priceRollout(rollout, table);
    const repriced = { ...rollout, ...paid };
    // An arm's own credit horizon where it named one, and the run's where it did not. The two are
    // free along the same axis the table is -- neither changes how a held policy acts, and
    // `advantages` is re-run for every arm regardless -- so a combination of a table and a horizon
    // is one arm rather than a second grid.
    const armHalfLife = named.halfLife ?? halfLife;
    const armLambda = named.lambda ?? lambda;
    const arm = advantages(repriced, values, { halfLife: armHalfLife, lambda: armLambda });
    const stood = standardisedAdvantages(arm.advantage, repriced.count);
    return {
      label,
      // Absent unless the arm named one, so a grid of tables alone writes the row it wrote before
      // this axis existed and two such grids stay comparable field for field.
      ...(named.halfLife === undefined ? {} : { halfLife: armHalfLife }),
      ...(named.lambda === undefined ? {} : { lambda: armLambda }),
      ...measureSignal({
        pool, rollout: repriced, scaled: stood.scaled, returns: arm.returns, norm,
        weights, valueWeights, logSigma, order, clip,
      }),
      advantageSd: stood.sd,
      // What the table actually took out of this collection, so an arm that moved no number says
      // so in the row rather than in a reader's arithmetic: a coefficient on a quantity no body
      // accumulated is a coefficient that was swept and never paid.
      shaping: shareOf(paid, repriced),
    };
  });
  // Fifth and last, and it is the only one of the five that binds a coefficient rather than a cut
  // or a table. Taken after the arms for the same reason the arms were taken after the splits --
  // every one of these rebinds the pool before it steps it, so the order is free and the one that
  // reads best is the one where the row's own number comes first and the questions about it come
  // after. What it measures is not this run's step: `--hold` takes no step at all. It is what a
  // production fit's step at this policy would have been made of.
  const bonus = measureBonus({
    pool, rollout, scaled, returns, norm, weights, valueWeights, logSigma, order, clip, entropy,
    heads,
  });
  return {
    ...signal,
    advantageSd: sd,
    ...(cut === null ? {} : { classAxis: classes, classes: cut }),
    ...(byBout === null ? {} : { byBout }),
    ...(priced === null ? {} : { priced }),
    ...(bonus === null ? {} : { bonus }),
  };
}

/**
 * What one pricing charged, per row, as a share of what the same asks returned in total.
 *
 * The denominator is the sum of the absolute rewards rather than of the rewards, because a
 * mirrored collection's rewards very nearly cancel -- both corners are collected, so `dealt` less
 * `taken` telescopes and the win terms sum to zero -- and a share over a denominator at zero is a
 * number that swings between plus and minus infinity while nothing is happening. The absolute sum
 * is the total of what was paid and charged however it netted out, which is the quantity a reader
 * of "what did this table do" actually wants.
 */
export function shareOf(paid, rollout) {
  let total = 0;
  for (let i = 0; i < rollout.count; i += 1) total += Math.abs(paid.reward[i]);
  const over = (values) => {
    let sum = 0;
    for (let i = 0; i < rollout.count; i += 1) sum += values[i];
    return total === 0 ? 0 : sum / total;
  };
  return {
    paid: total / Math.max(1, rollout.count),
    penalty: over(paid.penalty),
    rows: Object.fromEntries(Object.entries(paid.charges).map(([row, values]) => [row, over(values)])),
  };
}

/**
 * The three blocks again over two disjoint sets of whole bouts, shaped like the row they sit in.
 *
 * The same `blockOf` as the ask split's, so a reader comparing `byBout.cosine` with `cosine` is
 * comparing one arithmetic to itself with one thing changed. `firstBouts` and `secondBouts` ride
 * along because a partition balanced in asks is not balanced in bouts and the row should say which
 * it was, and because two halves of wildly different bout counts would be a rollout whose bouts
 * differ in length far more than this collection's do.
 */
export function measureBouts(args) {
  const { taken, firstBouts, secondBouts } = boutGradients(args);
  const [first, second] = taken;
  const actor = blockOf(first, second, "actor");
  return {
    firstAsks: first.asks, secondAsks: second.asks, firstBouts, secondBouts,
    cosine: actor.cosine, firstNorm: actor.firstNorm, secondNorm: actor.secondNorm, dot: actor.dot,
    spread: blockOf(first, second, "spread"),
    critic: blockOf(first, second, "critic"),
  };
}

/**
 * The groupings a rollout's asks can be cut by, and `none` is one of them on purpose.
 *
 * `build` is the pool's own name for a body and is the finest cut there is -- seventeen to
 * twenty-four of them in a forty-draw viable pool, which at any bout count this project can afford
 * leaves a handful of bouts a class. `terminal` is the weapon word `--terminals` already speaks in,
 * two classes over the maul-and-mace pool, and is the coarsest cut worth taking: a class is still
 * heterogeneous inside, which makes a *high* within-class cosine the conservative outcome rather
 * than an artefact of having grouped by the answer.
 *
 * `none` is the default and is the instrument the grid ran, byte for byte. A probe that acquired a
 * class split by default would make every row already under tournaments incomparable with the next
 * one, for a measurement nobody asked that run to make.
 */
export const CLASS_AXES = Object.freeze(["none", "terminal", "build"]);

/**
 * The two rows of an arm that are not coefficients, and the reason they belong on the same file.
 *
 * `halfLife` and `lambda` are the generalised advantage estimate's, and they are free along exactly
 * the axis the reward table is free along: neither changes how a held policy *acts*, both are read
 * after a collection, and `advantages` is re-run for every arm regardless. So an arm that names one
 * costs what an arm that names a coefficient costs, and a grid can ask "a different credit horizon"
 * and "a different table" in one file and, more to the point, in one *combination* -- a table that
 * pays for something immediate and a horizon short enough to keep it is one arm and not two runs.
 *
 * They are **absent from an arm's row unless the arm named one**, which is the same rule `byBout`
 * and `classes` follow: a grid that acquired two constant fields by default would make every row
 * already under tournaments a row of a different instrument.
 */
export const ESTIMATOR_KEYS = Object.freeze(["halfLife", "lambda"]);

/**
 * The reward tables one held collection is to be priced under, read out of a file and checked.
 *
 * The file is an array of objects, each a `label` and any subset of `REWARD_KEYS`; what is not
 * named is the shipped table's, so an arm says what it changes rather than restating seven
 * coefficients that did not move. A file rather than a flag because the axis is eight-dimensional
 * and a command line that carried it would be unreadable and unquotable -- and because the arms
 * of a sweep are a *design*, which belongs in a file that can be written before the bouts and
 * pointed at afterwards.
 *
 * An arm may also name `halfLife` or `lambda`, which are not coefficients and are free for the same
 * reason the coefficients are; see `ESTIMATOR_KEYS`.
 *
 * Every refusal here is one this project has already paid for once. A key that is not a reward row
 * is refused **by name** rather than ignored, because a table silently missing the row a sweep was
 * about is a run that costs its hours and answers a question nobody asked. A repeated label is
 * refused because the arms are read back by label and two rows under one name is a table that
 * cannot be read at all. An empty list is refused because `--rewards` naming nothing is a flag
 * that was meant to do something.
 *
 * The shipped table is **not** added as an arm. The row's own unqualified cosine is already the
 * collection under the table it was collected with, so a baseline arm would be a second copy of a
 * number that is right there -- and a run that wants the identity checked can name the shipped
 * coefficients as an arm on purpose, which is a cheap and rather good test of this whole path.
 */
export function rewardArms(spec, base = GOLEM_REWARD, what = "--rewards") {
  if (!Array.isArray(spec)) {
    throw new Error(`${what} names a file holding an array of reward arms, not ${typeof spec}`);
  }
  if (spec.length === 0) throw new Error(`${what} named a file with no arms in it`);
  const seen = new Set();
  return Object.freeze(spec.map((entry, at) => {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`${what} arm ${at} is not an object`);
    }
    const label = entry.label;
    if (typeof label !== "string" || label.trim() === "") {
      throw new Error(`${what} arm ${at} has no label, and an arm is read back by its label`);
    }
    if (seen.has(label)) throw new Error(`${what} names two arms "${label}"`);
    seen.add(label);
    const table = { ...base };
    const estimator = {};
    for (const [key, value] of Object.entries(entry)) {
      if (key === "label") continue;
      const estimated = ESTIMATOR_KEYS.includes(key);
      if (!estimated && !REWARD_KEYS.includes(key)) {
        throw new Error(`${what} arm "${label}" sets "${key}", which is not a reward row; `
          + `this build pays ${REWARD_KEYS.join(", ")} and estimates over `
          + `${ESTIMATOR_KEYS.join(", ")}`);
      }
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new Error(`${what} arm "${label}" sets ${key} to ${value}, which is not a coefficient`);
      }
      // Both are refused at their own edges rather than passed on to arithmetic that would answer
      // something. A half-life of zero discounts the next window to nothing and divides by it; a
      // lambda outside the unit interval is not a mixture of the n-step returns and the recursion
      // in `advantages` diverges rather than failing, which is the expensive kind of wrong.
      if (key === "halfLife" && value <= 0) {
        throw new Error(`${what} arm "${label}" sets halfLife to ${value}; a half-life is seconds `
          + "and must be above zero");
      }
      if (key === "lambda" && (value < 0 || value > 1)) {
        throw new Error(`${what} arm "${label}" sets lambda to ${value}; it mixes the n-step `
          + "returns and runs from 0 to 1");
      }
      if (estimated) estimator[key] = value;
      else table[key] = value;
    }
    return Object.freeze({ label, table: Object.freeze(table), ...estimator });
  }));
}

/** `--classes terminal`: which grouping, refused by name rather than defaulted. */
export function parseClasses(text, what = "--classes") {
  if (text === null || text === undefined) return "none";
  const word = String(text).trim().toLowerCase();
  if (!CLASS_AXES.includes(word)) {
    throw new Error(`${what} ${text}; this build cuts by ${CLASS_AXES.join(", ")}`);
  }
  return word;
}

/**
 * Each ask's bout, traced through the same `done` flags and refused by name on the same identity.
 *
 * `collectRollouts` writes `episodeBouts` one entry an episode, in the order `mergeRollouts`
 * concatenates its parts, so this is `askClasses` with a different array behind it and the same
 * three refusals. It is a separate function rather than a fourth `CLASS_AXES` entry because a bout
 * is not a class of body: `classBlocks` drops a class whose half is under `CLASS_FLOOR`, and every
 * bout is under it, so a bout axis routed through that machinery would report a rollout of nothing
 * kept and look like a finding.
 */
export function askBouts(rollout) {
  const bouts = rollout.episodeBouts;
  if (!Array.isArray(bouts)) {
    throw new Error("this rollout carries no episodeBouts, so its asks cannot be traced to a bout; "
      + "a bout split wants a rollout from collectRollouts");
  }
  if (bouts.length !== rollout.episodes) {
    throw new Error(`${bouts.length} episode bouts over ${rollout.episodes} episodes`);
  }
  const keys = new Array(rollout.count);
  let episode = 0;
  for (let i = 0; i < rollout.count; i += 1) {
    const bout = bouts[episode];
    if (!Number.isInteger(bout)) {
      throw new Error(`episode ${episode} carries no bout, so its asks cannot be kept together`);
    }
    keys[i] = bout;
    if (rollout.done[i] === 1) episode += 1;
  }
  if (episode !== rollout.episodes) {
    throw new Error(`the done flags close ${episode} episodes over ${rollout.episodes} the rollout claims`);
  }
  return keys;
}

/**
 * The shuffled order re-laid as two disjoint sets of whole bouts, balanced in asks.
 *
 * **This is the split the record's budget arithmetic has been quoting and not the one it has been
 * taking.** `halfSplit` cuts the shuffled order of asks, so both halves hold asks out of the same
 * bouts, and every quantity a bout draw decides -- who won it, what the two streams did, which
 * body drew it -- lands in both halves with the same sign. That correlates them, which inflates
 * the dot, which *over*states the squared gradient and *under*states the noise. The cosine is
 * still the right answer to "how much of a minibatch is the gradient", which is the question the
 * probe was written for; it is the wrong answer to "would two independent collections agree",
 * which is the question a bout budget is about, and the two were never distinguished.
 *
 * The bouts are taken in order of first appearance in the fit's own shuffled order and each is put
 * in whichever half is lighter, so the partition is a random one balanced in asks rather than in
 * bout count -- bouts differ in length by a factor of several and a partition balanced in bouts
 * would not be balanced in what the halves average over. A rollout of fewer than two bouts is
 * refused by name, because one bout cannot be cut into two sets of whole bouts and a half read
 * twice has a cosine of exactly one.
 */
export function boutBlocks(order, keys) {
  const byBout = new Map();
  for (const index of order) {
    const key = keys[index];
    let bucket = byBout.get(key);
    if (bucket === undefined) { bucket = []; byBout.set(key, bucket); }
    bucket.push(index);
  }
  if (byBout.size < 2) {
    throw new Error(`a rollout of ${byBout.size} bout(s) has no two halves of whole bouts to compare`);
  }
  const halves = [[], []];
  const asks = [0, 0];
  for (const bucket of byBout.values()) {
    const side = asks[0] <= asks[1] ? 0 : 1;
    halves[side].push(bucket);
    asks[side] += bucket.length;
  }
  const laid = [];
  for (const bucket of halves[0]) for (const index of bucket) laid.push(index);
  const cut = laid.length;
  for (const bucket of halves[1]) for (const index of bucket) laid.push(index);
  return {
    order: laid,
    first: { at: 0, end: cut },
    second: { at: cut, end: laid.length },
    firstBouts: halves[0].length,
    secondBouts: halves[1].length,
  };
}

/**
 * Each ask's class key, traced back through the `done` flags to the body that fought its episode.
 *
 * `collectRollouts` writes `bodies` one entry an episode in merge order, and `mergeRollouts`
 * concatenates its parts in that same order, so walking the asks and advancing at every `done`
 * recovers the mapping exactly. That is an identity between two functions in another file rather
 * than a fact about this one, so it is **refused rather than trusted**: a rollout whose bodies are
 * absent, whose count of them is not its episode count, or whose `done` flags close some other
 * number of episodes, is thrown out by name. A class split silently off by one would read as
 * bodies that disagree, which is precisely the finding this instrument exists to report.
 */
export function askClasses(rollout, axis) {
  if (axis === "none") throw new Error("askClasses wants a grouping; none is the absence of one");
  if (!CLASS_AXES.includes(axis)) {
    throw new Error(`askClasses ${axis}; this build cuts by ${CLASS_AXES.join(", ")}`);
  }
  const bodies = rollout.bodies;
  if (!Array.isArray(bodies)) {
    throw new Error("this rollout carries no bodies, so its asks cannot be traced to a build; "
      + "a class split wants a rollout from collectRollouts");
  }
  if (bodies.length !== rollout.episodes) {
    throw new Error(`${bodies.length} bodies over ${rollout.episodes} episodes`);
  }
  const keys = new Array(rollout.count);
  let episode = 0;
  for (let i = 0; i < rollout.count; i += 1) {
    const body = bodies[episode];
    const key = body === undefined ? null : axis === "build" ? body.build : body.terminal;
    if (key === null || key === undefined) {
      throw new Error(`episode ${episode} carries no ${axis}, so it cannot be put in a class`);
    }
    keys[i] = key;
    if (rollout.done[i] === 1) episode += 1;
  }
  if (episode !== rollout.episodes) {
    throw new Error(`the done flags close ${episode} episodes over ${rollout.episodes} the rollout claims`);
  }
  return keys;
}

/**
 * The fewest asks a half may hold and still be a gradient worth taking a cosine of.
 *
 * A class that drew one bout has a half of a couple of hundred asks and a half of a couple of
 * hundred more, and its cosine is an estimate of nothing with an enormous variance that would enter
 * a mean beside classes that drew thirty. The floor is asks rather than bouts because asks are what
 * the estimator averages over, and the classes it drops are reported per iteration rather than
 * quietly skipped.
 */
export const CLASS_FLOOR = 400;

/**
 * The shuffled order re-laid so that every class is two contiguous halves, with a matched control.
 *
 * The cut is taken **out of the fit's own shuffled order**, stably: a class's asks appear in the
 * order the epoch would have walked them, so halving that run is a random split of the class and
 * not a split by bout, by corner or by time within the bout. That is the same argument `halfSplit`
 * makes for the pooled cosine, and it is why this returns index ranges into a re-laid order rather
 * than a predicate the pool would have to learn.
 *
 * **The control is the reason this is worth running.** A within-class cosine is taken over a
 * quarter of the rollout and the pooled cosine over a half, so the two are not comparable as they
 * stand -- a class that looked sharper might only be a class that drew fewer asks, and the
 * direction of that bias is the one that would manufacture the finding. So every class also gets
 * a control: two disjoint blocks of exactly its own two half sizes, taken from the front of the
 * same shuffled order and therefore ignoring class entirely. `within` against `pooled` is a
 * comparison at matched sample size, and it is the only comparison in this instrument that is.
 *
 * **The controls are ranges into the caller's order and the class halves are ranges into a new
 * one**, which looks like an inconsistency and is a constraint. `FitPool.bind` allocates the
 * shared order at the rollout's own ask count, so a step past that count writes into a typed
 * array that is not there, silently, and the shards read whatever the last binding left -- which
 * is how this function first reported a cosine of NaN. A control is a prefix of the order the
 * caller already has, so it needs no copy; the class halves are a permutation of the kept
 * classes' asks and hold each of them once, so the re-laid order is never longer than the
 * rollout either.
 */
export function classBlocks(order, keys, { floor = CLASS_FLOOR } = {}) {
  if (order.length !== keys.length) {
    throw new Error(`an order of ${order.length} over ${keys.length} keys`);
  }
  const byClass = new Map();
  for (const index of order) {
    const key = keys[index];
    let held = byClass.get(key);
    if (held === undefined) { held = []; byClass.set(key, held); }
    held.push(index);
  }
  const laid = [];
  const blocks = [];
  const controls = [];
  const dropped = [];
  for (const [key, indices] of [...byClass.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const cut = Math.floor(indices.length / 2);
    if (cut < floor) { dropped.push({ key, asks: indices.length }); continue; }
    const firstAsks = cut;
    const secondAsks = indices.length - cut;
    blocks.push({ key, half: 0, at: laid.length, end: laid.length + firstAsks });
    for (let i = 0; i < cut; i += 1) laid.push(indices[i]);
    blocks.push({ key, half: 1, at: laid.length, end: laid.length + secondAsks });
    for (let i = cut; i < indices.length; i += 1) laid.push(indices[i]);
    // The matched control: the same two sizes, off the front of the shuffled order, class ignored.
    // Two disjoint prefixes, so it exists only where the order is long enough to hold both -- a
    // class holding the whole rollout would otherwise be controlled against one block read twice,
    // whose cosine is exactly one and would read as a grouping that bought nothing.
    if (firstAsks + secondAsks <= order.length) {
      controls.push({ key, half: 0, at: 0, end: firstAsks });
      controls.push({ key, half: 1, at: firstAsks, end: firstAsks + secondAsks });
    }
  }
  return { order: laid, blocks, controls, dropped, classes: byClass.size };
}

/**
 * The within-class, between-class and matched-pooled cosines of one rollout.
 *
 * Three numbers and they answer one question. **Within** is a class against itself, two halves of
 * its own asks. **Pooled** is the same two sizes drawn without regard to class, which is the
 * control: if within is no higher than pooled, grouping bought nothing. **Between** is one class's
 * half against another's, over vectors of the same shape and comparable counts, and it is the
 * number the grid's closing question is about -- if the bodies in a pool ask for contradictory
 * changes, two classes point in unrelated directions however sharp each of them is on its own.
 *
 * The mean over pairs is left to the caller and the detail is logged, one entry per unordered pair
 * of classes and per pair of halves. All four cross-half combinations are taken rather than one,
 * because a between-class cosine from a single pair of halves is one draw and the four are nearly
 * free once the gradients are in hand.
 */
export function measureClasses({
  pool, rollout, scaled, returns, norm, weights, valueWeights, logSigma, order, keys,
  clip = 0.2, floor = CLASS_FLOOR,
}) {
  const laid = classBlocks(order, keys, { floor });
  if (laid.blocks.length === 0) {
    return { classes: laid.classes, kept: 0, dropped: laid.dropped, within: [], between: [], pooled: [] };
  }
  pool.bind(rollout, scaled, returns, norm, { clip, entropy: PROBE_ENTROPY });
  const taken = new Map();
  const sum = (kind, block, walked) => {
    const sums = pool.step({
      at: block.at, end: block.end, epoch: PROBE_EPOCH, order: walked,
      weights, valueWeights, logSigma,
    });
    taken.set(`${kind}:${block.key}:${block.half}`, {
      actor: Float64Array.from(sums.grad), asks: block.end - block.at,
    });
  };
  for (const block of laid.blocks) sum("within", block, laid.order);
  for (const block of laid.controls) sum("pooled", block, order);
  const kept = [...new Set(laid.blocks.map((block) => block.key))];
  const within = [];
  const pooled = [];
  for (const key of kept) {
    const first = taken.get(`within:${key}:0`);
    const second = taken.get(`within:${key}:1`);
    within.push({ key, asks: first.asks + second.asks, cosine: cosineOf(first.actor, second.actor) });
    const control = taken.get(`pooled:${key}:0`);
    const against = taken.get(`pooled:${key}:1`);
    if (control !== undefined && against !== undefined) {
      pooled.push({ key, asks: control.asks + against.asks, cosine: cosineOf(control.actor, against.actor) });
    }
  }
  const between = [];
  for (let i = 0; i < kept.length; i += 1) {
    for (let j = i + 1; j < kept.length; j += 1) {
      for (const left of [0, 1]) {
        for (const right of [0, 1]) {
          between.push({
            left: kept[i], right: kept[j], leftHalf: left, rightHalf: right,
            cosine: cosineOf(taken.get(`within:${kept[i]}:${left}`).actor,
              taken.get(`within:${kept[j]}:${right}`).actor),
          });
        }
      }
    }
  }
  return { classes: laid.classes, kept: kept.length, dropped: laid.dropped, within, between, pooled };
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
  // The grid's own confound, and the two flags that remove it.
  //
  // Every cell of the 2026-09-12 grid is a separate thirty-iteration run at its own bout count, so
  // the 256-bout cell measures a policy that was *trained* with 256-bout updates. A row that does
  // not rise therefore carries two readings that design cannot separate: more bouts do not sharpen
  // the gradient, or bigger batches walk the policy somewhere with less signal in it.
  //
  // `--from` starts at a checkpoint instead of a fresh initialisation, and `--hold` does not fit at
  // all -- no `ppoFit`, no `extendNormalisation`, so the weights, the value weights, the spread and
  // the normalisation are the same objects for every iteration of the run. Under both, an
  // "iteration" is one independent collection at one fixed policy, and a row of them varying only
  // `--bouts` isolates the sample size exactly. Both default off, so the grid's instrument is the
  // file it always was and its rows stay comparable to the ones already in the record.
  const from = flag("from", null);
  const hold = checkHeldStart({ from, hold: argv.includes("--hold") });
  // The grid's closing question, which it named as owed and did not measure: whether the bodies in
  // one pool ask for the same policy change. Off by default, so a run that does not name it is the
  // run the grid took.
  const classes = parseClasses(flag("classes", null));
  const classFloor = Number(flag("class-floor", CLASS_FLOOR));
  // Off by default for `--classes`' reason exactly: a probe that acquired a second cosine by
  // default would make every row already under tournaments a row of a different instrument.
  const boutSplit = argv.includes("--bout-split");
  // The reward axis, which is free at a held policy and is not free anywhere else. Read from a
  // file so the arms of a sweep are a design written before the bouts rather than a command line;
  // empty unless named, so a run without it is byte for byte the run the grid took.
  const rewardsFile = flag("rewards", null);
  const rewards = rewardsFile === null
    ? [] : rewardArms(JSON.parse(readFileSync(resolve(rewardsFile), "utf8")));
  // And the behaviour axis, which is not free: a tactics row changes how the body acts, so every
  // arm of it is its own collection. It is here anyway because the probe is the cheap instrument
  // and `latchAbort` is the candidate the record has been pointing at since Session 07 of the
  // learn set. Parsed by the trainer's own reader, so a row this probe accepts is a row a training
  // run would accept and the two cannot drift.
  const tacticsWord = flag("tactics", null);
  const tactics = parseTactics(tacticsWord);
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
  // A checkpoint carries all four, and a run that starts from one must take all four together: a
  // policy read against a normalisation it was not fitted under is a different policy.
  const start = from === null ? null : JSON.parse(readFileSync(resolve(from), "utf8"));
  const weights = start === null ? initWeights(layout, seed) : Float64Array.from(start.weights);
  const valueWeights = start === null
    ? initWeights(valueLayout, (seed ^ 0x1c) >>> 0) : Float64Array.from(start.valueWeights);
  const logSigma = start === null
    ? new Float64Array(ACTION_AXES).fill(-0.7) : Float64Array.from(start.logSigma);
  if (start !== null && weights.length !== netSize(layout)) {
    throw new Error(`${from} carries ${weights.length} actor weights and this shape wants ${netSize(layout)}`);
  }
  let norm = start === null ? freshNormalisation(columns) : {
    count: start.norm.count,
    mean: Float64Array.from(start.norm.mean),
    variance: Float64Array.from(start.norm.variance),
  };
  let actor = null;
  let spread = null;
  let critic = null;

  log({
    type: "header", kind: "gradient-probe", seed, date, version: POLICY_VERSION, features,
    layout, valueLayout, label, iterations, bouts, cap, random, workers, shards, from, hold,
    classes, classFloor, boutSplit,
    // The arms are logged resolved rather than as the file named them, so a row says the eight
    // coefficients it was actually priced under and a reader never has to find the file again.
    rewards: rewards.map((arm) => ({
      label: arm.label, ...arm.table,
      ...(arm.halfLife === undefined ? {} : { halfLife: arm.halfLife }),
      ...(arm.lambda === undefined ? {} : { lambda: arm.lambda }),
    })),
    tactics,
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
  if (start !== null) console.log(`  starting from ${from}, ${start.norm.count} observations of normalisation`);
  if (rewards.length > 0) {
    console.log(`  --rewards: ${rewards.length} table(s) priced off each collection beside the one it `
      + `was collected under -- ${rewards.map((arm) => arm.label).join(", ")}`);
  }
  if (tactics !== null) {
    console.log(`  --tactics: ${Object.entries(tactics).map(([row, value]) => `${row}=${value}`).join(", ")}`);
  }
  if (hold) {
    console.log("  --hold: nothing is fitted, so every iteration measures the same policy and a row "
      + "of bout counts isolates the sample size");
  }

  const pool = await FitPool.open({ shards, layout, valueLayout, spec });
  const cosines = [];
  // One row an iteration when a split was asked for: the three means over that iteration's
  // classes and pairs, so the summary is a mean over iterations exactly as the pooled cosine is.
  // The per-class and per-pair detail stays in the iteration rows and is not summarised away.
  const splits = [];
  // And one an iteration when the bout split was asked for, summarised the same way, so the run's
  // answer carries both cuts of it or neither and a reader never has to recompute one of them.
  const boutCosines = [];
  // And one list an arm when `--rewards` named some, keyed by label, so the summary can quote each
  // table's own mean over the same iterations the row's own mean is taken over.
  const armCosines = new Map();
  // And one list a head group, keyed by name, because the question the head cut exists to answer is
  // about a row whose signal is a hundredth of the whole actor's and whose one-iteration cosine is
  // therefore mostly draw. Each entry carries the cosine and the two norms, so the summary can say
  // both whether the row's halves agree and how much gradient the row got at all -- a group that
  // agrees at +0.4 on a norm of 1e-9 is not being told anything.
  const headCosines = new Map();
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
        features, spec, central, tactics,
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
        halfLife, lambda, clip, classes, floor: classFloor, boutSplit, rewards,
        // The coefficient the fit below would have paid, whether or not there is a fit below, so
        // a held row says what a production step at this policy would have been made of.
        entropy: fitEntropy,
        // Always, and unconditionally: the head cut costs one pass over the last layer's rows and
        // it is the only reading in the file that can name the abort gate. Every shape this CLI
        // accepts has a `spec`, so there is no configuration in which it is unavailable.
        layout, spec,
      });
      const probed = (Date.now() - probeStarted) / 1000;
      const fitStarted = Date.now();
      // Under `--hold` there is no fit at all, which is the whole of what holding means: the
      // policy this iteration measured is the policy the next one measures, so a run is a row of
      // independent collections at one fixed point rather than a trajectory.
      const fit = hold ? null : ppoFit(rollout, {
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
      // Only when there is a fit to agree with. Holding removes the second computation rather than
      // the check, so the refusal is skipped by construction and not waived.
      if (fit !== null && signal.advantageSd !== fit.advantageSd) {
        throw new Error(`the probe standardised this iteration's advantages at ${signal.advantageSd} `
          + `and the fit at ${fit.advantageSd}; the two are not measuring one estimator`);
      }
      if (fit !== null) {
        ({ actor, spread, critic } = fit);
        norm = extendNormalisation(norm, rollout);
      }
      cosines.push(signal.cosine);
      if (signal.byBout !== undefined) boutCosines.push(signal.byBout.cosine);
      // One entry an arm an iteration, kept beside the row's own cosine rather than as a
      // difference, because a difference of two cosines is not the scale-free quantity and this
      // record has paid three times for writing one down. The summary below quotes each arm's own
      // mean; what a reader wants from them is the ratio of `c/(1-c)`, and that is an arithmetic
      // on two means and not a column to be accumulated.
      for (const arm of signal.priced ?? []) {
        let column = armCosines.get(arm.label);
        if (column === undefined) { column = []; armCosines.set(arm.label, column); }
        column.push(arm.cosine);
      }
      // The bonus's own norm on the same group, carried beside the signal's rather than as a share,
      // because the share a reader wants is against `sqrt(|S|^2)` -- the fitted signal -- and that
      // is an arithmetic on two means at the end of the run and not a column to accumulate.
      const bonusNorms = new Map((signal.bonus?.actor.heads ?? []).map((h) => [h.name, h.norm]));
      for (const group of signal.heads ?? []) {
        let column = headCosines.get(group.name);
        if (column === undefined) { column = []; headCosines.set(group.name, column); }
        column.push({ ...group, bonus: bonusNorms.get(group.name) ?? null });
      }
      const cut = signal.classes ?? null;
      if (cut !== null) {
        splits.push({
          within: meanOf(cut.within.map((row) => row.cosine)),
          between: meanOf(cut.between.map((row) => row.cosine)),
          pooled: meanOf(cut.pooled.map((row) => row.cosine)),
          kept: cut.kept,
        });
      }
      const { share } = episodeReturns(rollout);
      log({
        type: "iteration", iteration, bouts: rollout.bouts, steps: rollout.count,
        opponent: opponentWord, terminals, mirrorShare: rollout.mirrorShare,
        mirrorBouts: rollout.mirrorBouts, randomBouts: rollout.randomBouts,
        decided: rollout.decided, margin: rollout.margin, penaltyShare: share,
        // What the collected corners did with a stroke, on these bouts rather than on a rating of
        // the same weights. A row whose `completion` is a two-hundredth is a row whose gradient was
        // taken over a body that never finished what it started, and that is a fact about the
        // measurement which belongs beside it.
        strokes: rollout.strokes,
        // Full precision throughout and rounded nowhere: a gradient norm's order of magnitude is
        // not known in advance, and a rounding chosen for a cosine would silently write a norm of
        // 3e-7 out as zero.
        ...signal,
        // Absent rather than zero when nothing was fitted: a `kl` of 0 is a fit that did not move
        // and a `kl` of null is a run that never asked for one, and a later reader of these rows
        // has to be able to tell those apart.
        kl: fit === null ? null : fit.kl,
        clipFraction: fit === null ? signal.clipFraction : fit.clipFraction,
        entropy: fit === null ? null : fit.entropy,
        explained: fit === null ? null : fit.explainedAfter,
        epochsRun: fit === null ? 0 : fit.epochs,
        updates: fit === null ? 0 : fit.updates,
        stopped: fit === null || fit.stopped === null ? null : fit.stopped.kl,
        held: hold,
        logSigma: Array.from(logSigma),
        collectSeconds: collected, probeSeconds: probed, fitSeconds: fitted,
        seconds: (Date.now() - started) / 1000,
      });
      const signed = (x) => `${x >= 0 ? "+" : ""}${x.toFixed(4)}`;
      const abort = (signal.heads ?? []).find((group) => group.name === "abort");
      console.log(`  it ${String(iteration).padStart(2)}: asks ${rollout.count} `
        + `(${signal.firstAsks}/${signal.secondAsks})  cos ${signed(signal.cosine)}  `
        + `|g| ${signal.firstNorm.toExponential(2)}/${signal.secondNorm.toExponential(2)}  `
        + `dot ${signal.dot.toExponential(2)}  spread ${signed(signal.spread.cosine)}  `
        + `critic ${signed(signal.critic.cosine)}  `
        + (signal.bonus === undefined ? "" : `bonus ${signal.bonus.actor.share.toFixed(2)}x at `
          + `${signed(signal.bonus.actor.cosine)}  `)
        // One group of the head cut on the console and the rest in the row, and the one is `abort`
        // because it is the gate the signal set's diagnosis is about. The rest are a `jq` away.
        + (abort === undefined ? "" : `abort ${signed(abort.cosine)} `
          + `|g| ${abort.firstNorm.toExponential(2)}  `)
        + `done ${(rollout.strokes.completion * 100).toFixed(1)}% of `
        + `${rollout.strokes.strokesStarted}  `
        + (signal.byBout === undefined ? "" : `byBout ${signed(signal.byBout.cosine)} `
          + `(${signal.byBout.firstBouts}/${signal.byBout.secondBouts} bouts)  `)
        + (cut === null ? "" : `within ${signed(splits[splits.length - 1].within)} `
          + `between ${signed(splits[splits.length - 1].between)} `
          + `pooled ${signed(splits[splits.length - 1].pooled)} (${cut.kept}/${cut.classes})  `)
        + (fit === null ? "held  " : `KL ${fit.kl.toFixed(5)}  clip ${(fit.clipFraction * 100).toFixed(1)}%  `)
        + `${((Date.now() - started) / 1000).toFixed(0)} s `
        + `(${collected.toFixed(0)} collect, ${probed.toFixed(1)} probe`
        + (fit === null ? ")" : `, ${fitted.toFixed(0)} fit)`));
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
  // The three class means, and the comparison the run is read on is `within` against `pooled`:
  // they are taken over the same number of asks by construction, so a gap between them is the
  // grouping and not the sample size. `between` is the question itself.
  const splitSummary = splits.length === 0 ? {} : {
    classAxis: classes, classesKept: meanOf(splits.map((row) => row.kept)),
    withinMean: meanOf(splits.map((row) => row.within)), withinSem: semOf(splits.map((row) => row.within)),
    betweenMean: meanOf(splits.map((row) => row.between)), betweenSem: semOf(splits.map((row) => row.between)),
    pooledMean: meanOf(splits.map((row) => row.pooled)), pooledSem: semOf(splits.map((row) => row.pooled)),
  };
  // The bout split's own mean, named apart from `cosineMean` rather than replacing it, because the
  // two are answers to two questions and a summary that quietly carried whichever cut the flags
  // asked for would make two runs of this file incomparable on the field they share.
  const boutSummary = boutCosines.length === 0 ? {} : {
    boutCosineMean: meanOf(boutCosines), boutCosineSem: semOf(boutCosines),
  };
  // Each named table's own mean over the same iterations, as a list rather than as fields, because
  // the arms are named by a file and a summary whose field names came out of one would be a record
  // no two runs of this file share a schema on.
  const armSummary = armCosines.size === 0 ? {} : {
    rewardArms: [...armCosines].map(([arm, column]) => ({
      label: arm, iterations: column.length, cosineMean: meanOf(column), cosineSem: semOf(column),
    })),
  };
  // Each head group's own mean over the same iterations, as a list for the same reason the arms are
  // a list. `dotMean` is the one a floor is computed from -- it estimates the group's `|S|^2` the
  // way the row's own `dot` estimates the whole actor's -- and `bonusMean` is beside it so the
  // comparison the instrument was built for can be made without reopening the iteration rows.
  const headSummary = headCosines.size === 0 ? {} : {
    heads: [...headCosines].map(([name, column]) => ({
      name, iterations: column.length,
      cosineMean: meanOf(column.map((r) => r.cosine)), cosineSem: semOf(column.map((r) => r.cosine)),
      dotMean: meanOf(column.map((r) => r.dot)), dotSem: semOf(column.map((r) => r.dot)),
      firstNormMean: meanOf(column.map((r) => r.firstNorm)),
      secondNormMean: meanOf(column.map((r) => r.secondNorm)),
      bonusMean: column[0].bonus === null ? null : meanOf(column.map((r) => r.bonus)),
    })),
  };
  log({
    type: "summary", iterations: cosines.length, bouts, opponent: opponentWord,
    cosineMean: mean, cosineSem: sem, cosineMedian: median, ...boutSummary,
    cosineLeast: sorted[0], cosineMost: sorted[sorted.length - 1], probeEntropy: PROBE_ENTROPY,
    ...splitSummary, ...armSummary, ...headSummary,
  });
  console.log(`cosine over ${cosines.length} iterations at ${bouts} bouts against ${opponentWord}: `
    + `${mean >= 0 ? "+" : ""}${mean.toFixed(4)} +- ${sem.toFixed(4)}, `
    + `median ${median.toFixed(4)}, range ${sorted[0].toFixed(4)} to ${sorted[sorted.length - 1].toFixed(4)}`);
  if (splits.length > 0) {
    const say = (which) => {
      const column = splits.map((row) => row[which]);
      return `${meanOf(column) >= 0 ? "+" : ""}${meanOf(column).toFixed(4)} +- ${semOf(column).toFixed(4)}`;
    };
    console.log(`cut by ${classes}: within ${say("within")}, pooled at the same sizes ${say("pooled")}, `
      + `between ${say("between")}`);
  }
  for (const [arm, column] of armCosines) {
    console.log(`  reward arm ${arm}: ${meanOf(column) >= 0 ? "+" : ""}${meanOf(column).toFixed(4)} `
      + `+- ${semOf(column).toFixed(4)} over the same ${column.length} collections`);
  }
  for (const group of headSummary.heads ?? []) {
    // `|S|^2` and not a cosine is what decides whether the group is being told anything, and the
    // bonus is quoted against `sqrt(|S|^2)` -- the fitted signal -- rather than against the step,
    // because most of a step's length is the draw a fit averages away and the bonus is not.
    const signal = group.dotMean > 0 ? Math.sqrt(group.dotMean) : null;
    console.log(`  head ${group.name.padEnd(14)} cos `
      + `${group.cosineMean >= 0 ? "+" : ""}${group.cosineMean.toFixed(4)} `
      + `+- ${group.cosineSem.toFixed(4)}  |g| ${group.firstNormMean.toExponential(2)}  `
      + `dot ${group.dotMean.toExponential(2)} +-${group.dotSem.toExponential(1)}`
      + (group.bonusMean === null ? "" : `  bonus ${group.bonusMean.toExponential(2)}`
        + ` (${signal === null ? "signal unbounded" : `${(group.bonusMean / signal * 100).toFixed(1)} % of |S|`})`));
  }
  console.log(`log: ${out}`);
}
