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
import { styleObserve, styleStateKey } from "../src/golem/style-model.ts";
import { STYLE_DIRECTORS, directedMind } from "../src/golem/golem-policies.ts";
import { FEATURE_COUNT, neuralFeatures } from "../src/golem/neural-features.ts";
import { STYLE_FEATURE_COUNT, styleFeatures, styleOpenMask } from "../src/golem/style-features.ts";
import { STYLE_OPTIONS } from "../src/golem/tactics-v3.ts";
import { golemNeural } from "../src/golem/neural.ts";
import { NEURAL_WEIGHTS } from "../src/golem/neural-weights.ts";
import { GOLEM_TACTICS, innerReach } from "../src/golem/tactics.ts";
import { GOLEM_CHAMPIONS } from "../src/golem/tactics-champions.ts";
import { GOLEM_PLANNER, golemPlanner } from "../src/golem/planner.ts";
import { GOLEM_TACTICS_V2 } from "../src/golem/tactics-v2.ts";
import { GOLEM_TACTICS_V3 } from "../src/golem/tactics-v3.ts";
import { FORM } from "../src/golem/styles/form.ts";
import { BRAWLER } from "../src/golem/styles/brawler.ts";
import { GUARDIAN } from "../src/golem/styles/guardian.ts";
import { SKIRMISHER } from "../src/golem/styles/skirmisher.ts";
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

/**
 * The options that run between exchanges; a window of one is cut at the cap.
 *
 * Session 08 widens the set by the third executor's four non-exchange acts. A `void`, a `retreat`
 * and a `parry` are things a body does *instead* of an exchange and are over in well under the
 * cap, so a window of one that is still open at the cap is a style holding that act, not an
 * exchange whose damage would land after the cut. Leaving them out would have filed a two-second
 * retreat as one exchange window and put the next stroke's damage inside it.
 */
const FREE_OPTIONS = new Set(["hold", "close", "withdraw", "circle", "void", "retreat", "parry"]);

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
  //
  // A styled mind publishes `styled` where the five older ones publish `fencer`, and what is read
  // off it here -- the option in force, the phase of the reading -- is on both, so this logger
  // takes either. What the two do not share is the option *vocabulary*, which is why the
  // executors publish under two names in the first place: a reader of these records has the run's
  // policy names beside them and knows which fifteen or which eight it is reading.
  const brain = "fencer" in mind ? "fencer" : "styled" in mind ? "styled" : null;
  if (brain === null) return null;
  const other = side === "left" ? "right" : "left";
  const records = [];
  let open = null;
  // The *state* vocabulary follows the executor as the option vocabulary does. Session 09 of the
  // style set gave the third executor's model a reach pair beside the weapon pair, so a styled
  // side's window is keyed `heavy/reach/gap/theirs/mine` where the second executor's is
  // `heavy/gap/theirs/mine`. A reader picks the vocabulary off the run's policy names, which is
  // the same thing it already had to do to know whether `strike` meant one of eight or one of
  // fifteen. Logs written before this change key a styled side with four segments and cannot be
  // fitted as a style model; the calibration run of Session 09 is where the five-segment ones start.
  const stateNow = brain === "styled"
    ? (styled, sample) => styleStateKey(styleObserve(styled.reading, sample[side].view.opponent.reach))
    : (fencer, sample) => stateKey(observe(fencer.reading, sample[side].view.opponent.reach));
  return {
    records,
    sample(sample) {
      const fencer = mind[brain];
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
      const fencer = mind[brain];
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
 * The two feature sets a recorded side can be logged in, by the executor it plays.
 *
 * `neural` is the second executor's fifty-six columns over the eight duel options, which the
 * matchup set's trainer reads; `style` is the third executor's sixty-nine over the fifteen style
 * options. A side is logged in the one its own mind reads, and the samples file says which.
 */
const RECORDER_KINDS = {
  neural: { width: FEATURE_COUNT, features: neuralFeatures, options: DUEL_OPTIONS,
    mask: (available) => { let bits = 0; DUEL_OPTIONS.forEach((n, j) => { if (available.includes(n)) bits |= 1 << j; }); return bits; } },
  style: { width: STYLE_FEATURE_COUNT, features: styleFeatures, options: STYLE_OPTIONS, mask: styleOpenMask },
};

/**
 * A hook on a director that keeps every ask as a *decision*: what the mind saw, what it played,
 * and what the two bars did until the next ask. Session 08 of the style set.
 *
 * ## Why a hook is the whole recorder
 *
 * A director is asked when nothing is directed, when the cadence elapses, on an event, and when
 * an exchange ends, and nothing happens in between that is not attributable to the last answer.
 * So the window from one ask to the next *is* the decision, and this needs no join with the
 * exchange log and no second reading of the bout: it closes the open decision with the damage
 * the two bars took since it opened, opens the next one, and marks the last `done` at the end.
 *
 * ## Why the sum is the margin
 *
 * Each close reads the two vitalities and each open records the same two numbers on the same
 * step, so the windows telescope exactly: Σ(dealt − taken) over a side is its vitality less its
 * opponent's at the last sample, minus the same at the first ask, and the first ask is on the
 * first step of the bout, before anything can have landed. That identity is the one mechanical
 * claim of this session and `tests/tournament.test.mjs` asks it of a real bout.
 *
 * ## The clock, and why a window can be zero seconds long
 *
 * The seconds are the view's own clock, which advances one rendered frame at a time while the
 * executor is stepped four times a frame, so two asks inside one frame -- the cadence, and then
 * an event ask on their phase turning -- are the same clock and the window between them is zero.
 * That is the honest number rather than a rounding of it: nothing is booked between them either,
 * since a blow's timestamp is stamped off the same clock. Session 08's entry reports how often it
 * happens, and a discount over these durations must be able to take a zero.
 *
 * ## What is read
 *
 * Only the view the mind was handed. The two vitalities are on it, the clock is on it, and
 * nothing here reaches into the bout's records -- so a recorded side is told nothing an
 * unrecorded one is not, and a run with `--record` differs from one without only in what is
 * written down.
 */
function decisionRecorder(side, kind) {
  const spec = RECORDER_KINDS[kind];
  if (spec === undefined) throw new Error(`"${kind}" is not a feature set the recorder knows`);
  const scratch = new Float64Array(spec.width);
  // Seven growable columns rather than an array of little vectors. A sixty-second bout asks the
  // director about five hundred times, so a run of four thousand keeps a couple of million
  // decisions, and two million `Float32Array(69)` objects cost more in headers than in numbers.
  // These double when they fill and are trimmed at the end, which the trainer reads as it is.
  let capacity = 256;
  let count = 0;
  let xs = new Float32Array(capacity * spec.width);
  let ys = new Uint8Array(capacity);
  let opens = new Uint16Array(capacity);
  let dealt = new Float64Array(capacity);
  let taken = new Float64Array(capacity);
  let seconds = new Float64Array(capacity);
  let done = new Uint8Array(capacity);
  const grow = () => {
    const wider = capacity * 2;
    const move = (array, Type, width = 1) => { const next = new Type(wider * width); next.set(array); return next; };
    xs = move(xs, Float32Array, spec.width);
    ys = move(ys, Uint8Array);
    opens = move(opens, Uint16Array);
    dealt = move(dealt, Float64Array);
    taken = move(taken, Float64Array);
    seconds = move(seconds, Float64Array);
    done = move(done, Uint8Array);
    capacity = wider;
  };
  /** The decision in flight: the two bars and the clock as they stood when it was taken. */
  let live = null;
  let last = null;
  const shut = (mine, theirs, clock, ended) => {
    if (live === null) return;
    dealt[live.at] = live.theirs - theirs;
    taken[live.at] = live.mine - mine;
    seconds[live.at] = clock - live.clock;
    done[live.at] = ended ? 1 : 0;
    live = null;
  };
  return {
    hook(available, reading, view, option) {
      const mine = view.self.vitality;
      const theirs = view.opponent.vitality;
      shut(mine, theirs, view.clock, false);
      if (count === capacity) grow();
      spec.features(reading, available, view, scratch);
      xs.set(scratch, count * spec.width);
      ys[count] = spec.options.indexOf(option);
      opens[count] = spec.mask(available);
      live = { mine, theirs, clock: view.clock, at: count };
      count += 1;
    },
    /** The bout's last sample closes the open decision and marks it the side's last. */
    close(sample, winner) {
      const view = sample[side].view;
      shut(view.self.vitality, view.opponent.vitality, sample.clock, true);
      last = { margin: view.self.vitality - view.opponent.vitality, winner };
    },
    pack() {
      return {
        kind,
        x: xs.slice(0, count * spec.width),
        y: ys.slice(0, count),
        open: opens.slice(0, count),
        dealt: dealt.slice(0, count),
        taken: taken.slice(0, count),
        seconds: seconds.slice(0, count),
        done: done.slice(0, count),
        margin: last?.margin ?? 0, winner: last?.winner ?? null,
      };
    },
  };
}

/**
 * Whether this run records this policy, and in which feature set.
 *
 * `record` in the worker data is a list of policy names, or `"*"`. The star means **every style**
 * and not every mind with a director: the planner and the champion have one too, but they are on
 * the second executor and their asks are logged in its fifty-six columns over its eight options,
 * and one samples file holds one feature set. A run that wants those two logged names them, and
 * then it is a run about them. Naming a style and a champion together is refused where the file
 * is written, with the two kinds in the message.
 */
function recorderKind(policy) {
  const record = workerData?.record;
  if (!record) return null;
  const styled = policy in STYLE_DIRECTORS;
  if (record === "*") return styled ? "style" : null;
  const wanted = Array.isArray(record) ? record.includes(policy) : record === policy;
  if (!wanted) return null;
  if (styled) return "style";
  if (policy === "golem-champion" || policy === "golem-planner") return "neural";
  throw new Error(`"${policy}" cannot be recorded: only a style, the planner and the champion have a director to hook`);
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
  const explore = workerData?.explore ?? 0;
  if (contender === undefined) {
    // A style goes through `directedMind`, which is the same four factories `src/mind.ts` names
    // taken apart far enough to put the exploration wrapper and the hook between the director and
    // the executor. At explore 0 with no hook it builds the shipped mind to the byte.
    //
    // Exploring and recording are separate questions, and Session 09 is what separated them: a
    // model calibration wants every option tried from every state and wants an *exchange* log,
    // not a decision log, because a run that recorded every side of six thousand bouts would
    // write most of a gigabyte of features nothing was going to read.
    if (policy in STYLE_DIRECTORS && (recorder !== null || explore > 0)) {
      return directedMind(policy, seed, recorder === null ? null : recorder.hook, explore);
    }
    if (recorder !== null) {
      if (policy === "golem-champion") return golemChampionMind(seed, GOLEM_CHAMPIONS, recorder.hook);
      if (policy === "golem-planner") {
        const planner = golemPlanner(seed, undefined, undefined, undefined, recorder.hook);
        return { name: policy, fencer: planner.fencer, decide: (view, dt) => planner.decide(view, dt) };
      }
      throw new Error(`"${policy}" cannot be recorded: only a style, the planner and the champion have a director to hook`);
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
  const kinds = { left: recorderKind(job.left.policy), right: recorderKind(job.right.policy) };
  const recorders = {
    left: kinds.left === null ? null : decisionRecorder("left", kinds.left),
    right: kinds.right === null ? null : decisionRecorder("right", kinds.right),
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
    recorders.left?.close(lastSample, result.winner);
    recorders.right?.close(lastSample, result.winner);
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
const STYLE_TABLES = { form: FORM, skirmisher: SKIRMISHER, guardian: GUARDIAN, brawler: BRAWLER };
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
