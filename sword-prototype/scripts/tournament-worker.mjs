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
import { GOLEM_TACTICS, innerReach } from "../src/golem/tactics.ts";
import { GOLEM_CHAMPIONS } from "../src/golem/tactics-champions.ts";
import { GOLEM_PLANNER, golemPlanner } from "../src/golem/planner.ts";
import { GOLEM_TACTICS_V2 } from "../src/golem/tactics-v2.ts";
import { GOLEM_TACTICS_V3 } from "../src/golem/tactics-v3.ts";
import { FORM } from "../src/golem/styles/form.ts";
import { policyMind } from "../src/mind.ts";
import { policyForUnit } from "../src/units.ts";
import { freshHavok, runBout } from "./bout-runner.mjs";
import { CLINCH_QUIET_SECONDS, CLOSING_LAG_SECONDS, EXCHANGE_FLICKER_SECONDS, EXCHANGE_WINDOW_SECONDS,
  armedHand, strokeColumns, strokeInstrument } from "./tournament.mjs";

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
  // The stroke instruments, and the ground state they are stamped from. `lastContact` is shared:
  // a bout is quiet when neither side has landed anything, which is what makes a clinch a clinch
  // rather than a close-quarters exchange.
  const strokes = { left: strokeInstrument(), right: strokeInstrument() };
  const clinch = { left: 0, right: 0 };
  const idle = { left: 0, right: 0 };
  const gapLog = { left: [], right: [] };
  const groundWas = { left: null, right: null };
  let lastContact = Number.NEGATIVE_INFINITY;
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
    onEvent(event) {
      lastContact = event.report.at;
      strokes[event.side].event(event);
    },
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
        // Closing is a ground fact -- whether this body walked in -- so it is read off the two
        // stances and not off the shoulders, which swing with every stroke. Read against the
        // gap a tenth of a second ago rather than against the last sample: see
        // `CLOSING_LAG_SECONDS`. The first tenth of a second of a bout has a shorter span and
        // uses it, which is honest and is over before anything can land.
        const them = view.opponent;
        const ground = view.self.ground;
        const gap = Math.hypot(ground.x - them.ground.x, ground.z - them.ground.z);
        const log = gapLog[side];
        log.push({ gap, clock: sample.clock });
        while (log.length > 1 && sample.clock - log[0].clock > CLOSING_LAG_SECONDS) log.shift();
        const span = sample.clock - log[0].clock;
        const closing = span > 1e-6 ? (log[0].gap - gap) / span : 0;
        strokes[side].posture(view.self.trunkLean, closing);
        // Quiet is measured from the last contact either way, so a clinch is two bodies inside
        // each other's reach doing nothing to each other, and idle travel is the sideways drift
        // that happens while nothing is landing -- the strafe the plan calls a drift. The gap
        // tested is `view.measure`, the mind's own shoulder-to-nearest-part reading, because
        // that is what `reach` is comparable with and what the engagement instrument calls
        // being outside reach on the other side of the same line.
        const quiet = sample.clock - lastContact >= CLINCH_QUIET_SECONDS;
        if (quiet && view.measure < them.reach * (1 + GOLEM_TACTICS.slackFraction)) {
          clinch[side] += sample.dt;
        }
        const was = groundWas[side];
        if (was !== null && quiet) {
          const toward = { x: them.ground.x - ground.x, z: them.ground.z - ground.z };
          const span = Math.hypot(toward.x, toward.z);
          if (span > 1e-6) {
            // The component of this step across the line between them, which is travel that did
            // not change the distance; the radial half is the engagement record's own column.
            idle[side] += Math.abs((ground.x - was.x) * (-toward.z / span) + (ground.z - was.z) * (toward.x / span));
          }
        }
        groundWas[side] = { x: ground.x, z: ground.z };
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
  const swung = { left: strokes.left.close(), right: strokes.right.close() };
  const caught = {
    left: swung.left.filter((stroke) => stroke.caught).length,
    right: swung.right.filter((stroke) => stroke.caught).length,
  };
  const side = (name) => {
    const record = result[name];
    const engagement = result.behaviour?.[name]?.engagement;
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
      // Session 00 of the style set: the columns that see a stroke rather than a contact. Added
      // without a `TOURNAMENT_VERSION` bump, on the `arm` precedent -- a reader of an older
      // file finds every column it had, and `structural` skips a column no row carries.
      ...strokeColumns(swung[name]),
      // Their strokes my hand slots stopped, which is the other half of `caughtFraction`: mine
      // says how often I was caught, this says how often I caught.
      catches: caught[name === "left" ? "right" : "left"],
      clinchSeconds: clinch[name],
      idleTravelMetres: idle[name],
      // Four columns lifted whole from the engagement instrument, which computes them every bout
      // and had no reader in the tournament until now.
      tangentialTravelMetres: engagement?.tangentialTravelMetres ?? 0,
      radialClosingMetres: engagement?.radialClosingMetres ?? 0,
      nearRangeStallSeconds: engagement?.nearRangeStallSeconds ?? 0,
      retreatOutsideReachSeconds: engagement?.retreatOutsideReachSeconds ?? 0,
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
  // `--behaviour` rides the whole behaviour record back, for a question the eight columns above
  // were not chosen to answer. Its private trackers are non-enumerable, so this is what
  // `JSON.stringify` would have written anyway.
  if (workerData?.behaviour) {
    row.behaviour = { left: result.behaviour.left, right: result.behaviour.right };
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
// Every mind's table, moved before the first bout and for the life of this worker: a row from a
// run with `--override` is a row of the minds as overridden, and the run's header says how.
//
// **A bare name is looked up in one order and a style's is not looked up at all.** The planner
// first, so `explore=0.5` is a planner row; then the fencer's, so `standOffFraction=1.06` is the
// row four shipped minds read; then the third executor's, which is where a name only it has --
// `cutLean`, `parryBite`, `duckSeconds` -- lands. A style's own table is reached through its
// prefix, `form.standOffFraction`, and never through the bare name, because a style *is* a copy of
// the executor's table with rows moved and there is no order in which one name could mean both.
const STYLE_TABLES = { form: FORM };
if (workerData?.overrides) {
  for (const [name, value] of Object.entries(workerData.overrides)) {
    const dot = name.indexOf(".");
    if (dot > 0) {
      const table = STYLE_TABLES[name.slice(0, dot)];
      const row = name.slice(dot + 1);
      if (table === undefined) throw new Error(`--override ${name}: no style is called "${name.slice(0, dot)}"`);
      if (!(row in table)) throw new Error(`--override ${name}: not a row of that style's table`);
      table[row] = value;
    }
    else if (name in GOLEM_PLANNER) GOLEM_PLANNER[name] = value;
    else if (name in GOLEM_TACTICS_V2) GOLEM_TACTICS_V2[name] = value;
    else if (name in GOLEM_TACTICS_V3) GOLEM_TACTICS_V3[name] = value;
    else throw new Error(`--override ${name}: not a row of GOLEM_TACTICS_V2, GOLEM_TACTICS_V3 or GOLEM_PLANNER`);
  }
}

parentPort.postMessage({ type: "ready" });
