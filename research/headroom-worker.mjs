// One bout per job for the headroom audit (`research/headroom.mjs`), through `runJobs` in
// `research/runner.mjs`: a worker thread holds one job at a time and each bout gets a fresh Havok,
// because one realm runs one Havok arena at a time (AGENTS.md).
//
// It is the league worker's bout (`research/league-worker.mjs`: the lead counter, falls as edges
// into `fallen`, an `expert...` corner searched on exact forks before each frame) with a
// behaviour reader beside it, because the audit asks not only whether a mind wins on a body but
// what it does with it: how far it stands off, how much it presses, how much of the bout it spends
// committed to a stroke, how much it strafes. Every reading is taken once a frame from the
// published views and the command each driver last applied, and none reaches any mind.
//
// A job may carry its own `maxSeconds` (the idle gate stops at the overtime mark, where a win
// stops being the attacker's).
import { parentPort } from "node:worker_threads";
import { Logger } from "@babylonjs/core/Misc/logger.js";
import { createBout, freshHavok, FRAME } from "../tests/harness/bout-runner.mjs";
import { expertMind, runExpertBout } from "../tests/harness/expert.mjs";
import { rangeFraction } from "../tests/harness/drills.mjs";
import { policyMind } from "../src/mind.ts";
Logger.LogLevels = Logger.ErrorLogLevel;

const other = (side) => (side === "left" ? "right" : "left");

/**
 * The league's lead counter (`leadCounter` in `research/league-worker.mjs`, same band), copied
 * rather than imported: importing a worker module from a worker registers its message handler as
 * well, so every job ran twice and the second answer was taken as the next job's result.
 */
const LEAD_BAND = 0.02;
function leadCounter(band = LEAD_BAND) {
  let leader = null;
  let changes = 0;
  return {
    feed(left, right) {
      const now = left - right > band ? "left" : right - left > band ? "right" : leader;
      if (leader !== null && now !== leader) changes += 1;
      leader = now;
    },
    get changes() { return changes; },
  };
}

/**
 * What one side did, frame by frame. `fraction` is its striker gap over its striker's range
 * (`rangeFraction`, the hold-range drill's reading): under 1 is inside its own reach.
 */
export function behaviourReader() {
  const blank = () => ({ frames: 0, gap: 0, fraction: 0, fractionFrames: 0, inReach: 0, forward: 0, back: 0,
    press: 0, strafe: 0, turn: 0, committed: 0, strokes: 0, down: 0, striking: false });
  const acc = { left: blank(), right: blank() };
  return {
    feed(bout) {
      for (const side of ["left", "right"]) {
        const a = acc[side];
        const view = bout[side].view;
        if (!view?.self) continue;
        const intent = bout[side].control?.driver?.held ?? null;
        a.frames += 1;
        const g = view.self.ground, o = view.opponent.ground;
        a.gap += Math.hypot(g.x - o.x, g.z - o.z);
        const f = rangeFraction(view);
        if (Number.isFinite(f)) { a.fraction += f; a.fractionFrames += 1; if (f <= 1) a.inReach += 1; }
        const support = view.self.support;
        if (support === "fallen" || support === "rising") a.down += 1;
        if (!intent) continue;
        a.forward += intent.forward;
        if (intent.forward < -0.2) a.back += 1;
        if (intent.forward > 0.3 && Number.isFinite(f) && f <= 1.1) a.press += 1;
        a.strafe += Math.abs(intent.strafe);
        a.turn += Math.abs(intent.turn);
        const striking = Boolean(intent.primary?.thrust || intent.secondary?.thrust || intent.natural?.thrust);
        if (striking) a.committed += 1;
        if (striking && !a.striking) a.strokes += 1;
        a.striking = striking;
      }
    },
    result(seconds) {
      const out = {};
      for (const side of ["left", "right"]) {
        const a = acc[side];
        const n = Math.max(a.frames, 1);
        out[side] = {
          gapM: a.gap / n, fraction: a.fractionFrames ? a.fraction / a.fractionFrames : null,
          inReachShare: a.inReach / n, forward: a.forward / n, backShare: a.back / n, pressShare: a.press / n,
          strafe: a.strafe / n, turn: a.turn / n, committedShare: a.committed / n,
          strokesPerMinute: seconds > 0 ? (60 * a.strokes) / seconds : 0, downShare: a.down / n,
        };
      }
      return out;
    },
  };
}

export async function execute(job, manifest) {
  const builds = new Map(manifest.builds.map((build) => [build.name, build.setup]));
  const setupOf = (name) => {
    const setup = builds.get(name);
    if (!setup) throw new Error(`no build "${name}" in the manifest`);
    return setup;
  };
  const options = { left: job.left, right: job.right, seeds: job.seeds,
    leftGolem: setupOf(job.leftBuild), rightGolem: setupOf(job.rightBuild),
    ...manifest.protocol, ...(job.maxSeconds ? { maxSeconds: job.maxSeconds } : {}), physics: await freshHavok() };
  const lead = leadCounter();
  const falls = { left: 0, right: 0 };
  const was = { left: "supported", right: "supported" };
  const behaviour = behaviourReader();
  const started = performance.now();
  const frame = (bout) => {
    lead.feed(bout.left.vitality, bout.right.vitality);
    behaviour.feed(bout);
    for (const side of ["left", "right"]) {
      const support = bout[side].view?.self?.support ?? "supported";
      if (support === "fallen" && was[side] !== "fallen") falls[side] += 1;
      was[side] = support;
    }
  };
  let result;
  let vitality;
  let experts;
  const expertBy = { left: expertMind(job.left, job.seeds[0]), right: expertMind(job.right, job.seeds[1]) };
  if (expertBy.left || expertBy.right) {
    const chosen = Object.fromEntries(Object.entries(expertBy).filter(([, expert]) => expert));
    ({ result, vitality, experts } = await runExpertBout(options, { experts: chosen, onFrame: frame }));
  } else {
    const bout = createBout({ ...options,
      leftMind: policyMind(job.left, job.seeds[0]), rightMind: policyMind(job.right, job.seeds[1]) });
    try {
      while (bout.step()) frame(bout);
      result = bout.finish();
      vitality = [bout.left.vitality, bout.right.vitality];
    } finally { bout.dispose(); }
  }
  const moved = behaviour.result(result.seconds);
  const sides = Object.fromEntries(["left", "right"].map((side) => [side, {
    damage: result[side].damage,
    falls: falls[side],
    nearRangeStallSeconds: result.behaviour[side].engagement.nearRangeStallSeconds,
    retreatOutsideReachSeconds: result.behaviour[side].engagement.retreatOutsideReachSeconds,
    ...moved[side],
  }]));
  return { ...job, status: "ok", winner: result.winner, ending: result.ending, seconds: result.seconds,
    vitality, leadChanges: lead.changes, sides, instrumentVersion: result.engagementInstrumentVersion,
    wallSeconds: (performance.now() - started) / 1000, frame: FRAME,
    ...(experts ? { experts } : {}) };
}

if (parentPort) parentPort.on("message", async ({ job, manifest }) => {
  try { parentPort.postMessage(await execute(job, manifest)); }
  catch (error) { parentPort.postMessage({ ...job, status: "failed", error: String(error?.stack ?? error) }); }
});

export { other };
