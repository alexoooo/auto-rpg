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

import { innerReach } from "../src/golem/tactics.ts";
import { GOLEM_TACTICS_V2 } from "../src/golem/tactics-v2.ts";
import { freshHavok, runBout } from "./bout-runner.mjs";
import { armedHand } from "./tournament.mjs";

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

async function runJob(job) {
  const physics = await freshHavok();
  const ends = { left: 1, right: 1 };
  const inside = { left: 0, right: 0 };
  const reach = { left: null, right: null };
  const bodyReach = { left: null, right: null };
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
    onSample(sample) {
      samples += 1;
      for (const side of ["left", "right"]) {
        const view = sample[side].view;
        ends[side] = view.self.vitality;
        if (reach[side] === null) {
          reach[side] = view.self.hands[hands[side]].reach;
          bodyReach[side] = view.self.reach;
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
      insideInner: samples === 0 ? 0 : inside[name] / samples,
      peakTipDriven: record.peakTipDriven,
    };
  };
  return {
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
// The fencer's table, moved before the first bout and for the life of this worker: a row from a
// run with `--override` is a row of the fencer as overridden, and the run's header says how.
if (workerData?.overrides) {
  for (const name of Object.keys(workerData.overrides)) {
    if (!(name in GOLEM_TACTICS_V2)) throw new Error(`--override ${name}: not a row of GOLEM_TACTICS_V2`);
  }
  Object.assign(GOLEM_TACTICS_V2, workerData.overrides);
}

parentPort.postMessage({ type: "ready" });
