// One shard of a PPO minibatch: the inner loop of `ppoFit`, run on a worker thread over shared
// memory. Session 05 of the learn set.
//
// **Why this file exists, and what it is not allowed to be.** The record measured a 30-worker
// `scripts/train-ppo.mjs` iteration at 109 s and found 86 s of it inside `ppoFit`, on one thread,
// and Session 04 measured the same shape from the other end: tripling an arm's collectors bought
// 1.29x, because about 106 s of a 350 s league iteration is the fit and the bookkeeping and no
// collector touches either. The compute the set has left to buy is therefore all in this loop.
// What it is *not* allowed to be is a second trainer. The set's ninth frozen choice is that
// neither the sweep runner nor the sharded fit may change a number, and the bar this session is
// held to is equality with the single thread to 1e-9 on a real rollout -- not a bandit that
// happens to converge to the same place. So the body of `shardStep` below is the body of
// `ppoFit`'s minibatch loop, moved and not rewritten, and `surrogateGrad` is imported from
// `scripts/train-ppo.mjs` rather than copied: a second copy of the clipped surrogate is exactly the
// thing that would let the two paths drift apart without a test being able to see it.
//
// **Data parallel, in a fixed shard order.** The minibatch `[at, end)` is cut into K contiguous
// slices by index and each shard sums its own slice's gradients into its own private arrays;
// `FitPool.step` in `scripts/train-ppo.mjs` then sums the K partials in shard order 0..K-1 and the main
// thread takes one Adam step. Floating-point addition is not associative, so the *order* of that
// last sum is the whole reason the equality test is possible at all: a barrier that let whichever
// shard finished first contribute first would give a different answer on every run, on the same
// seed, and no tolerance would make that a test. The order here is an index range and not a
// completion order, and nothing about it depends on how the threads were scheduled.
//
// **The observation normalisation is frozen for the whole fit and the shards are handed a copy.**
// `extendNormalisation` runs *after* the fit in both callers, never during it, so the mean and
// variance a shard reads are the ones the rollout was collected under -- which is what makes the
// log-probability the trainer recomputes comparable to the one the body acted on. The copy crosses
// once per iteration, in `bind`, and nothing in a step can move it. That is the place the owner
// named as the one to be careful about, and it is why the equality test loads a rollout whose
// normalisation is *not* the identity: an identity normalisation is precisely the case that would
// hide getting this wrong.
//
// **Atomics rather than messages, and a persistent pool.** A minibatch step is a few milliseconds
// and a `postMessage` round trip is a scheduler decision, so the step protocol is a control word
// the shards block on with `Atomics.wait` and the main thread advances with `Atomics.notify`; the
// weights, the spreads and the critic are copied into shared arrays rather than posted. The shards
// live for the run, unlike `runJobs`'s per-call collectors, because a thread start is milliseconds
// and there are fifty-six steps in an iteration. The collectors are left exactly as they are.
//
// The one thing that does travel as a message is the binding itself, because a `SharedArrayBuffer`
// can only reach another thread through the port. A shard picks it up with `receiveMessageOnPort`
// while it is still inside the Atomics protocol rather than by returning to its event loop, which
// keeps `bind` synchronous and therefore callable from inside `ppoFit`, which is not async and
// must not become async: `scripts/league.mjs` calls it from `trainRole` and every caller of that
// would have to change for no reason anybody could see in a number.
import { isMainThread, parentPort, receiveMessageOnPort, workerData } from "node:worker_threads";

import { backwardFrom, forward, netScratch } from "../src/golem/neural-net.ts";
import { ACTION_AXES, ACTION_WIDTH, normalise } from "../src/golem/policy.ts";
import { surrogateGrad } from "./train-ppo.mjs";

/** What `workerData.role` says, so importing this module from the main thread runs nothing. */
export const FIT_ROLE = "fit-shard";

/**
 * The control block, one `Int32Array` every thread of a pool shares.
 *
 * `GENERATION` is what the shards block on: the main thread writes a command, bumps this, and
 * notifies, and a shard that was mid-wait and one that had not reached the wait yet both see the
 * same edge, because `Atomics.wait` compares against the value the shard last acted on rather
 * than sleeping unconditionally. `DONE` is the barrier the main thread waits on, counted up rather
 * than a flag an index, so the main thread's own wait has something to compare against.
 */
export const CTL = Object.freeze({
  COMMAND: 0, GENERATION: 1, DONE: 2, ERROR: 3, AT: 4, END: 5, COUNT: 6, EPOCH: 7, LENGTH: 8,
});

/** The three things a generation can be asking for. */
export const COMMAND = Object.freeze({ BIND: 1, STEP: 2, QUIT: 3 });

/** The fit constants that do not change inside an iteration, in the shared `params` array. */
export const PARAM = Object.freeze({ CLIP: 0, ENTROPY: 1, LENGTH: 2 });

/** What a shard reports beside its gradients: the four sums `ppoFit`'s read-out is made of. */
export const SCALARS = Object.freeze({ KL: 0, CLIPPED: 1, ENTROPY: 2, VALUE_LOSS: 3, LENGTH: 4 });

/** How much room a shard's failure gets to explain itself, in bytes, in the shared note buffer. */
export const NOTE_BYTES = 512;

/**
 * The half-open slice of a minibatch that shard `s` of `shards` owns.
 *
 * Contiguous and by index, so the union of the K slices is the minibatch exactly once and in the
 * order it would have been walked on one thread. Exported because the equality test wants to say
 * that out loud rather than trust it, and because the arithmetic of an uneven split -- 4,096 over
 * 12 is 341 three times and 342 nine times -- is the kind of thing that is right until somebody
 * writes `Math.round`.
 */
export function shardSlice(at, end, shard, shards) {
  const length = end - at;
  return {
    from: at + Math.floor((shard * length) / shards),
    to: at + Math.floor(((shard + 1) * length) / shards),
  };
}

/** A private word to sleep on for a millisecond without returning to the event loop. */
const PAUSE = new Int32Array(new SharedArrayBuffer(4));

/**
 * The next message on the port, waited for without an event-loop turn.
 *
 * `receiveMessageOnPort` drains the port's queue synchronously and answers `undefined` when the
 * message has been posted but has not crossed yet, so the loop is a real wait and not a
 * formality. It is only ever entered once an iteration, on a `bind`, and the alternative -- making
 * `ppoFit` async so a shard could be bound from an `await` -- would push `async` up through
 * `trainRole` and every caller of it.
 */
function takeMessage(port) {
  for (;;) {
    const got = receiveMessageOnPort(port);
    if (got !== undefined) return got.message;
    Atomics.wait(PAUSE, 0, 0, 1);
  }
}

/** A shard's failure, written where a blocked main thread can read it without a message. */
function writeNote(notes, shard, text) {
  const bytes = new TextEncoder().encode(String(text));
  const room = Math.min(bytes.length, NOTE_BYTES - 1);
  const at = shard * NOTE_BYTES;
  notes[at] = room;
  for (let k = 0; k < room; k += 1) notes[at + 1 + k] = bytes[k];
}

/** And back: what shard `s` said, or the empty string if it said nothing. */
export function readNote(notes, shard) {
  const at = shard * NOTE_BYTES;
  const room = notes[at];
  if (room === 0) return "";
  return new TextDecoder().decode(notes.subarray(at + 1, at + 1 + room));
}

/**
 * Everything a shard reads and writes, laid over the buffers the pool allocated.
 *
 * The rollout's five columns, the frozen normalisation and the shuffled order are read-only from
 * here; the three parameter blocks are rewritten by the main thread before every step; and the
 * gradient triple and the four scalars are this shard's own, which is what makes the barrier the
 * only synchronisation there is. Nothing is copied on the way in.
 */
function bindShard(message, shard, shards) {
  const { layout, valueLayout, size, valueSize, count, width } = message;
  return {
    layout, valueLayout, count, width,
    x: new Float64Array(message.x),
    a: new Float64Array(message.a),
    logp: new Float64Array(message.logp),
    scaled: new Float64Array(message.scaled),
    returns: new Float64Array(message.returns),
    // The frozen normalisation, in the shape `normalise` reads: a count nothing here uses and the
    // two columns it does. It crosses once at the binding and no step can move it.
    norm: {
      count: message.normCount,
      mean: new Float64Array(message.mean),
      variance: new Float64Array(message.variance),
    },
    order: new Int32Array(message.order),
    weights: new Float64Array(message.weights),
    valueWeights: new Float64Array(message.valueWeights),
    logSigma: new Float64Array(message.logSigma),
    params: new Float64Array(message.params),
    grad: new Float64Array(message.grads, shard * size * 8, size),
    sigmaGrad: new Float64Array(message.sigmaGrads, shard * ACTION_AXES * 8, ACTION_AXES),
    valueGrad: new Float64Array(message.valueGrads, shard * valueSize * 8, valueSize),
    scalars: new Float64Array(message.scalars, shard * SCALARS.LENGTH * 8, SCALARS.LENGTH),
    shard, shards,
    // The scratch a forward pass leaves its activations in, and the four small arrays `ppoFit`
    // reuses a sample: allocated once at the binding, exactly as the single thread allocates them
    // once a fit, so the loop below allocates nothing an ask that the single thread does not.
    scratch: netScratch(layout),
    valueScratch: netScratch(valueLayout),
    raw: new Float64Array(width),
    observation: new Float64Array(width),
    action: new Float64Array(ACTION_WIDTH),
    delta: new Float64Array(ACTION_WIDTH),
    valueDelta: new Float64Array(1),
  };
}

/**
 * One shard of one minibatch: the body of `ppoFit`'s inner loop, moved verbatim.
 *
 * Read this against `ppoFit` and the only differences should be where the numbers come from --
 * shared arrays rather than closure variables -- and where the four running sums go. `scale` is
 * `1 / (end - at)` over the *whole* minibatch and not over this shard's slice, because it is the
 * factor the single thread applies to every sample of the batch and a per-shard scale would make
 * the K partials sum to something else entirely. That is the one line in this file where a
 * plausible-looking mistake would still converge and still be wrong.
 */
export function shardStep(bound, at, end) {
  const { layout, valueLayout, scratch, valueScratch, raw, observation, action, delta, valueDelta } = bound;
  const { grad, sigmaGrad, valueGrad, width } = bound;
  const clip = bound.params[PARAM.CLIP];
  const entropy = bound.params[PARAM.ENTROPY];
  const { from, to } = shardSlice(at, end, bound.shard, bound.shards);
  const scale = 1 / (end - at);
  grad.fill(0);
  sigmaGrad.fill(0);
  valueGrad.fill(0);
  let kl = 0;
  let clipped = 0;
  let entropySum = 0;
  let valueLoss = 0;
  for (let m = from; m < to; m += 1) {
    const i = bound.order[m];
    const row = i * width;
    for (let k = 0; k < width; k += 1) raw[k] = bound.x[row + k];
    normalise(raw, bound.norm, observation);
    const actionAt = i * ACTION_WIDTH;
    for (let k = 0; k < ACTION_WIDTH; k += 1) action[k] = bound.a[actionAt + k];
    const head = forward(layout, bound.weights, observation, scratch);
    delta.fill(0);
    const term = surrogateGrad(head, bound.logSigma, action, bound.logp[i], bound.scaled[i],
      { clip, entropy }, scale, delta, sigmaGrad);
    backwardFrom(layout, bound.weights, observation, scratch, delta, grad);
    const value = forward(valueLayout, bound.valueWeights, observation, valueScratch)[0];
    const error = value - bound.returns[i];
    valueDelta[0] = error * scale;
    backwardFrom(valueLayout, bound.valueWeights, observation, valueScratch, valueDelta, valueGrad);
    const moved = term.logp - bound.logp[i];
    const k2 = 0.5 * moved * moved;
    kl += k2;
    if (!term.active) clipped += 1;
    entropySum += term.entropy;
    valueLoss += error * error;
  }
  bound.scalars[SCALARS.KL] = kl;
  bound.scalars[SCALARS.CLIPPED] = clipped;
  bound.scalars[SCALARS.ENTROPY] = entropySum;
  bound.scalars[SCALARS.VALUE_LOSS] = valueLoss;
}

/**
 * The shard's whole life: block on the generation word, do what it says, count up the barrier.
 *
 * A failure is written into the shared note rather than thrown, because the main thread is inside
 * `Atomics.wait` when it happens and a rejected promise would be delivered to an event loop that
 * is not running. The barrier is counted up either way, so a shard that dies takes the pool down
 * with a sentence rather than hanging it.
 */
function runShard({ shard, shards, control, notes }) {
  const ctl = new Int32Array(control);
  const note = new Uint8Array(notes);
  let bound = null;
  let seen = Atomics.load(ctl, CTL.GENERATION);
  for (;;) {
    Atomics.wait(ctl, CTL.GENERATION, seen);
    seen = Atomics.load(ctl, CTL.GENERATION);
    const command = Atomics.load(ctl, CTL.COMMAND);
    if (command === COMMAND.QUIT) break;
    try {
      if (command === COMMAND.BIND) {
        bound = bindShard(takeMessage(parentPort), shard, shards);
      } else {
        if (bound === null) throw new Error(`shard ${shard} was asked to step before it was bound`);
        shardStep(bound, Atomics.load(ctl, CTL.AT), Atomics.load(ctl, CTL.END));
      }
    } catch (error) {
      writeNote(note, shard, error?.stack ?? error?.message ?? error);
      Atomics.store(ctl, CTL.ERROR, 1);
    }
    Atomics.add(ctl, CTL.DONE, 1);
    Atomics.notify(ctl, CTL.DONE);
  }
}

if (!isMainThread && workerData?.role === FIT_ROLE) {
  parentPort.postMessage({ type: "ready", shard: workerData.shard });
  runShard(workerData);
}
