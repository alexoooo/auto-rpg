// One tournament worker: a JS realm holding one Havok arena at a time, running the jobs it is
// handed one after another and posting a row back for each.
//
// **A fresh Havok module per bout, not per worker.** The plan set's frozen choice is one arena
// per realm with the bouts sequential inside it, and that is kept; what this file adds is that
// each bout gets its own wasm instance through `freshHavok`. Session 11 of the sword work found
// that a disposed world leaves allocator and solver history behind in the module, enough to flip
// a winner between two bouts with identical commands. A tournament row that depended on which
// worker ran the job, and on what that worker had run before, would not reproduce under its
// seed, and the test in `tests/tournament.test.mjs` asks exactly that of it: the same seed on
// two workers, twice, gives the same JSON lines. The instance costs about 40 ms against a bout
// that runs in the low hundreds, and the measure it is compared against in
// `docs/measurements.md` shares one module across a run, which is the standing warning that the
// two are different cells.
import { parentPort, workerData } from "node:worker_threads";

import { armClass, golemChampion, golemChampionMind } from "../src/golem/champion.ts";
import { DUEL_OPTIONS, observe, stateKey } from "../src/golem/duel-model.ts";
import { FEATURE_COUNT, neuralFeatures } from "../src/golem/neural-features.ts";
import { golemNeural } from "../src/golem/neural.ts";
import { NEURAL_WEIGHTS } from "../src/golem/neural-weights.ts";
import { innerReach } from "../src/golem/tactics.ts";
import { GOLEM_CHAMPIONS } from "../src/golem/tactics-champions.ts";
import { GOLEM_PLANNER, golemPlanner } from "../src/golem/planner.ts";
import { GOLEM_TACTICS_V2 } from "../src/golem/tactics-v2.ts";
import { policyMind } from "../src/mind.ts";
import { policyForUnit } from "../src/units.ts";
import { freshHavok, runBout } from "./bout-runner.mjs";
import { EXCHANGE_FLICKER_SECONDS, EXCHANGE_WINDOW_SECONDS, armedHand } from "./tournament.mjs";

/** The dead band a lead has to clear before it counts, in bar fraction; the Session 11 number. */
const LEAD_DEAD_BAND = 0.02;

/**
 * A golem's own inner radius, from what its published view says about its acting hand.
 *
 * The mind gates its exchanges on `distance(socket, their shoulder)` against `innerReach`, so
 * that is the reading taken here, with the primary hand unless it is lost. A body whose sockets
 * are both capped publishes a hand with a fixed tip and no envelope; `innerReach` then returns
 * the whole reach, which for a capped hand is the cap's own length and is what "inside" means
 * for it. What is counted is a fraction of samples, at the control rate.
 */
function insideOwnInnerRadius(view) {
  const self = view.self;
  const hand = self.hands.primary.lost ? "secondary" : "primary";
  const cap = self.capabilities?.effectors?.[hand];
  if (!cap) return false;
  const mine = self.hands[hand];
  const near = innerReach(mine.reach, cap);
  const them = view.opponent.shoulder;
  const gap = Math.hypot(mine.shoulder.x - them.x, mine.shoulder.y - them.y, mine.shoulder.z - them.z);
  return gap < near;
}

/** The options that run between exchanges; a window of one is cut at the cap. */
const FREE_OPTIONS = new Set(["hold", "close", "withdraw", "circle"]);

/**
 * The exchange log of one side, when its mind is a fencer: one record per option window, in
 * the duel model's vocabulary. The state is read off the fencer's own reading and the view,
 * the damage off the bout's records, both as they stand at the sample.
 *
 * A window of a free option closes when the option changes or at the cap. A window of an
 * exchange option -- strike, feint, wait, ram -- runs until the fencer is free again, however
 * long the exchange takes, because the blow lands at the end of the commit and the riposte in
 * the recover, and a window cut at half a second put a strike's damage and its cost into the
 * record after it, where the search could only reach them through a transition. Whole, the
 * record says what one decision cost and earned and where it left the duel.
 */
function exchangeLogger(mind, side) {
  // Read per sample and not once: the champion builds its fencer at its first view, when it
  // knows its own arm's class, so before the first step there is none to read.
  if (!("fencer" in mind)) return null;
  const other = side === "left" ? "right" : "left";
  const records = [];
  let open = null;
  const stateNow = (fencer, sample) => stateKey(observe(fencer.reading, sample[side].view.opponent.reach));
  return {
    records,
    sample(sample) {
      const fencer = mind.fencer;
      if (!fencer) return;
      const state = stateNow(fencer, sample);
      const dealt = sample.records[side].damage;
      const taken = sample.records[other].damage;
      const option = fencer.option;
      if (open !== null && option !== open.option && sample.clock - open.at < EXCHANGE_FLICKER_SECONDS) {
        open.option = option;
      }
      const changed = open !== null && option !== open.option;
      const capped = open !== null && sample.clock - open.at >= EXCHANGE_WINDOW_SECONDS;
      const settled = open === null || FREE_OPTIONS.has(open.option) || fencer.reading.mine === "free";
      if (open !== null && settled && (changed || capped)) {
        records.push({
          state: open.state, option: open.option,
          dealt: dealt - open.dealt, taken: taken - open.taken,
          seconds: sample.clock - open.at, next: state,
        });
        open = null;
      }
      if (open === null) open = { state, option, dealt, taken, at: sample.clock };
    },
    close(sample) {
      const fencer = mind.fencer;
      if (open === null || !fencer) return;
      const state = stateNow(fencer, sample);
      records.push({
        state: open.state, option: open.option,
        dealt: sample.records[side].damage - open.dealt, taken: sample.records[other].damage - open.taken,
        seconds: sample.clock - open.at, next: state,
      });
      open = null;
    },
  };
}

/**
 * A hook on a director that keeps every ask as a sample for the neural trainer (Session 08):
 * the features as the network would read them, the option taken, and a bitmask of what was
 * open. Packed once at the end of the bout into typed arrays the row carries back.
 */
function askRecorder() {
  const scratch = new Float64Array(FEATURE_COUNT);
  const xs = [];
  const ys = [];
  const opens = [];
  return {
    hook(available, reading, view, option) {
      neuralFeatures(reading, available, view, scratch);
      xs.push(Float32Array.from(scratch));
      ys.push(DUEL_OPTIONS.indexOf(option));
      let bits = 0;
      DUEL_OPTIONS.forEach((name, j) => { if (available.includes(name)) bits |= 1 << j; });
      opens.push(bits);
    },
    pack() {
      const x = new Float32Array(xs.length * FEATURE_COUNT);
      xs.forEach((features, i) => x.set(features, i * FEATURE_COUNT));
      return { x, y: Uint8Array.from(ys), open: Uint8Array.from(opens) };
    },
  };
}

/**
 * The mind a side plays: the policy by name, or a contender. A contender is a name the tuner
 * gave a vector, built as a champion over that vector with the seed the policy would have had,
 * so a contender row is the row `golem-champion` would make with that vector in its table; or
 * (Session 08) a name over `weights`, built as the neural mind over them; or a name over
 * `policy`, which is that policy under another name, so a confirmation can meet the shipped
 * champion on the same schedule as the candidates. `fencer` is published for the exchange
 * log, as the planner's own mind publishes it. A recorder, when the run records a teacher,
 * hooks the director of the planner or the champion; no other policy has one.
 */
function mindFor(policy, seed, recorder = null) {
  const contender = workerData?.contenders?.[policy];
  if (contender === undefined) {
    if (recorder !== null) {
      if (policy === "golem-champion") return golemChampionMind(seed, GOLEM_CHAMPIONS, recorder.hook);
      if (policy === "golem-planner") {
        const planner = golemPlanner(seed, undefined, undefined, undefined, recorder.hook);
        return { name: policy, fencer: planner.fencer, decide: (view, dt) => planner.decide(view, dt) };
      }
      throw new Error(`"${policy}" cannot be recorded: only the planner and the champion have a director to hook`);
    }
    return policyMind(policyForUnit("golem", policy), seed);
  }
  if (contender.policy !== undefined) return policyMind(policyForUnit("golem", contender.policy), seed);
  if (contender.weights !== undefined) {
    const neural = golemNeural(seed, { ...NEURAL_WEIGHTS, weights: contender.weights });
    return { name: policy, fencer: neural.fencer, decide: (view, dt) => neural.decide(view, dt) };
  }
  const champion = golemChampion(seed, { class: policy, builds: 0, generations: 0, bouts: 0, score: 0, baseline: 0, margin: 0, baselineMargin: 0, ...contender });
  return { name: policy, fencer: champion.fencer, decide: (view, dt) => champion.decide(view, dt) };
}

async function runJob(job) {
  const physics = await freshHavok();
  // The minds are built here and handed in, rather than left to `runBout` to build from the
  // policy names, so that this file can hold the fencer's handle for the exchange log. Same
  // factory, same seed, so a row is the row `runBout` would have made on its own.
  const recorders = {
    left: workerData?.record && job.left.policy === workerData.record ? askRecorder() : null,
    right: workerData?.record && job.right.policy === workerData.record ? askRecorder() : null,
  };
  const minds = {
    left: mindFor(job.left.policy, job.seeds[0], recorders.left),
    right: mindFor(job.right.policy, job.seeds[1], recorders.right),
  };
  const loggers = workerData?.exchanges
    ? { left: exchangeLogger(minds.left, "left"), right: exchangeLogger(minds.right, "right") }
    : { left: null, right: null };
  let lastSample = null;
  const ends = { left: 1, right: 1 };
  const inside = { left: 0, right: 0 };
  const reach = { left: null, right: null };
  const bodyReach = { left: null, right: null };
  const arm = { left: null, right: null };
  const hands = { left: armedHand(job.left.setup), right: armedHand(job.right.setup) };
  let samples = 0;
  let leader = null;
  let firstLeader = null;
  let leadChanges = 0;
  const result = runBout({
    left: job.left.policy, right: job.right.policy,
    leftUnit: "golem", rightUnit: "golem",
    leftGolem: job.left.setup, rightGolem: job.right.setup,
    leftLoadout: undefined, rightLoadout: undefined,
    locomotionMode: "supported",
    seeds: job.seeds,
    maxSeconds: job.cap,
    physics,
    leftMind: minds.left,
    rightMind: minds.right,
    onSample(sample) {
      samples += 1;
      lastSample = sample;
      loggers.left?.sample(sample);
      loggers.right?.sample(sample);
      for (const side of ["left", "right"]) {
        const view = sample[side].view;
        ends[side] = view.self.vitality;
        if (reach[side] === null) {
          reach[side] = view.self.hands[hands[side]].reach;
          bodyReach[side] = view.self.reach;
          arm[side] = armClass(view.self);
        }
        if (insideOwnInnerRadius(view)) inside[side] += 1;
      }
      const margin = ends.left - ends.right;
      const ahead = margin > LEAD_DEAD_BAND ? "left" : margin < -LEAD_DEAD_BAND ? "right" : null;
      if (ahead !== null && ahead !== leader) {
        if (leader !== null) leadChanges += 1;
        if (firstLeader === null) firstLeader = ahead;
        leader = ahead;
      }
    },
  });
  const side = (name) => {
    const record = result[name];
    return {
      policy: job[name].policy,
      build: job[name].build,
      setup: job[name].setup,
      seed: job[name].seed,
      damage: record.damage,
      contacts: record.hits,
      severs: record.severs,
      blocks: record.blocks,
      vitality: ends[name],
      reach: reach[name],
      bodyReach: bodyReach[name],
      // The arm class the champion mind reads of itself (Session 07), beside the build class
      // the rating is keyed by; added without a version bump, since a reader of the older rows
      // finds every column it had.
      arm: arm[name],
      insideInner: samples === 0 ? 0 : inside[name] / samples,
      peakTipDriven: record.peakTipDriven,
    };
  };
  if (lastSample !== null) {
    loggers.left?.close(lastSample);
    loggers.right?.close(lastSample);
  }
  const row = {
    index: job.index,
    pairing: job.pairing,
    swapped: job.swapped,
    winner: result.winner,
    ending: result.ending,
    seconds: result.seconds,
    leadChanges,
    firstLeader,
    left: side("left"),
    right: side("right"),
  };
  if (workerData?.exchanges) {
    row.exchanges = { left: loggers.left?.records ?? null, right: loggers.right?.records ?? null };
  }
  if (workerData?.record) {
    row.samples = { left: recorders.left?.pack() ?? null, right: recorders.right?.pack() ?? null };
  }
  return row;
}

parentPort.on("message", (message) => {
  if (message.type === "stop") {
    parentPort.close();
    return;
  }
  runJob(message.job).then(
    (row) => parentPort.postMessage({ type: "result", row }),
    (error) => parentPort.postMessage({ type: "error", index: message.job.index, message: String(error?.stack ?? error) }),
  );
});
// The fencer's table and the planner's, moved before the first bout and for the life of this
// worker: a row from a run with `--override` is a row of the minds as overridden, and the run's
// header says how. A name is looked up on the planner first, so `explore=0.5` is a planner row.
if (workerData?.overrides) {
  for (const [name, value] of Object.entries(workerData.overrides)) {
    if (name in GOLEM_PLANNER) GOLEM_PLANNER[name] = value;
    else if (name in GOLEM_TACTICS_V2) GOLEM_TACTICS_V2[name] = value;
    else throw new Error(`--override ${name}: not a row of GOLEM_TACTICS_V2 or GOLEM_PLANNER`);
  }
}

parentPort.postMessage({ type: "ready" });
