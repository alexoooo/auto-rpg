/**
 * One bout, read for what happens around a body on the ground.
 *
 * The worker `research/downed-census.mjs` and `research/idle-dummy.mjs` hand to `runJobs`. It plays
 * the bout `research/worker.mjs` plays -- `createBout` under the research `PROTOCOL`, a fresh Havok
 * -- and reads, once a frame:
 *
 * - each side's support state, off its port (`PhysicalSupportedLocomotionPort.state`), and while it
 *   is fallen or rising the port's `riseGate()`, which says what the rise gate refused;
 * - each side's damage dealt so far, so damage landed on a downed body can be told from damage on a
 *   standing one;
 * - the distance from each side's own primary socket to the other body's core (`Golem.centre`).
 *
 * Nothing it reads is written back: the port's accessor is instrumentation, and the view and
 * `centre()` read `mesh.position` and nothing through a world matrix (`AGENTS.md`).
 */
import { parentPort } from "node:worker_threads";
import { Logger } from "@babylonjs/core/Misc/logger.js";
import { createBout, freshHavok, FRAME } from "../tests/harness/bout-runner.mjs";
import { policyMind } from "../src/mind.ts";
Logger.LogLevels = Logger.ErrorLogLevel;

const SIDES = ["left", "right"];
const other = (side) => (side === "left" ? "right" : "left");

/**
 * The census's name for one frame of a downed body: what kept it from rising, or what it is doing.
 * `rising` is a rise under way; `stuck-rising` is one past its duration that has not reached posture.
 */
export function gateCause(gate) {
  if (!gate) return null;
  if (gate.prior === "rising" && gate.reason === null) {
    return gate.risingElapsedS >= gate.risingDurationS && !gate.postureSupported ? "stuck-rising" : "rising";
  }
  switch (gate.reason) {
    case null: return "rose";
    case "fallen dwell has not elapsed": return "dwell";
    case "the fall has not come to rest": return "unsettled";
    case "recovery occupancy is obstructed":
      return !gate.pairOccupancyClear ? "occupancy" : !gate.withinAcceleration ? "acceleration" : "wall";
    case "recovery was interrupted by a hit": return "re-hit";
    case "locomotion authority is unavailable": return "no-authority";
    case "support chain is not live": return "support-dead";
    case "standable recovery ground is unavailable": return "no-ground";
    default: return `other:${gate.reason}`;
  }
}

export async function execute(job, manifest) {
  const builds = new Map(manifest.builds.map((build) => [build.name, build.setup]));
  const bout = createBout({ left: job.left, right: job.right,
    leftMind: policyMind(job.left, job.seeds[0]), rightMind: policyMind(job.right, job.seeds[1]),
    seeds: job.seeds, leftGolem: builds.get(job.leftBuild), rightGolem: builds.get(job.rightBuild),
    ...manifest.protocol, physics: await freshHavok() });
  const track = Object.fromEntries(SIDES.map((side) => [side, {
    was: "supported", episodes: [], open: null, knockdowns: 0,
    // Damage this side dealt, split by whether the other body was down.
    dealtDowned: 0, dealtStanding: 0, otherDownSeconds: 0, standingSeconds: 0,
    // One-second windows of the other body being down, and how many of them this side scored in.
    downWindows: 0, downWindowsScored: 0, windowFrames: 0, windowScored: false,
    reachSamples: [], lastDealt: 0,
  }]));
  let clock = 0;
  const closeWindow = (t) => {
    if (t.windowFrames > 0) { t.downWindows += 1; if (t.windowScored) t.downWindowsScored += 1; }
    t.windowFrames = 0; t.windowScored = false;
  };
  const frame = () => {
    clock += FRAME;
    const result = bout.result();
    for (const side of SIDES) {
      const body = bout[side];
      const t = track[side];
      const port = body.locomotion ?? body.locomotionModule?.port;
      const state = port?.state ?? "supported";
      const down = state === "fallen" || state === "rising";
      if (state === "fallen" && t.was !== "fallen" && t.was !== "rising") t.knockdowns += 1;
      if (down && !t.open) t.open = { start: clock, causes: {}, rehits: 0, rises: 0, relocatedRises: 0 };
      if (t.open) {
        if (state === "fallen" && t.was === "rising") t.open.rehits += 1;
        // Physical contact session 02: how many rises began, and how many went somewhere other
        // than where the body lay (`RECOVERY_RING_STEP_M` in src/supported-locomotion-production.ts).
        if (state === "rising" && t.was !== "rising") {
          t.open.rises += 1;
          if (port?.riseGate?.()?.relocated) t.open.relocatedRises += 1;
        }
        if (down) {
          const cause = gateCause(port?.riseGate?.() ?? null) ?? state;
          t.open.causes[cause] = (t.open.causes[cause] ?? 0) + FRAME;
        } else {
          // The frame the body is supported again closes the episode and is not a cause. The
          // session 01 census charged it to "supported", one frame an episode (1.2 % of stone's
          // downed time); this is the repair.
          t.episodes.push({ start: t.open.start, seconds: clock - t.open.start, end: "rose",
            causes: t.open.causes, rehits: t.open.rehits, rises: t.open.rises,
            relocatedRises: t.open.relocatedRises });
          t.open = null;
        }
      }
      t.was = state;
    }
    for (const side of SIDES) {
      const t = track[side];
      const theirs = track[other(side)];
      const dealt = result[side].damage;
      const fresh = dealt - t.lastDealt;
      t.lastDealt = dealt;
      if (theirs.open) {
        t.dealtDowned += fresh; t.otherDownSeconds += FRAME;
        t.windowFrames += 1; if (fresh > 0) t.windowScored = true;
        if (t.windowFrames >= 60) closeWindow(t);
        const socket = bout[side].view.self.shoulder;
        const core = bout[other(side)].centre();
        t.reachSamples.push(Math.hypot(core.x - socket.x, core.y - socket.y, core.z - socket.z));
      } else {
        closeWindow(t);
        if (!t.open) { t.dealtStanding += fresh; t.standingSeconds += FRAME; }
      }
    }
  };
  let result;
  try {
    while (bout.step()) frame();
    result = bout.finish();
  } finally { bout.dispose(); }
  const sides = {};
  for (const side of SIDES) {
    const t = track[side];
    closeWindow(t);
    if (t.open) {
      const lost = result.winner !== null && result.winner !== side;
      t.episodes.push({ start: t.open.start, seconds: clock - t.open.start, end: lost ? "died" : "bout-ended",
        causes: t.open.causes, rehits: t.open.rehits, rises: t.open.rises,
        relocatedRises: t.open.relocatedRises });
    }
    const reach = t.reachSamples.sort((a, b) => a - b);
    sides[side] = {
      damage: result[side].damage, knockdowns: t.knockdowns, episodes: t.episodes,
      dealtDowned: t.dealtDowned, dealtStanding: t.dealtStanding,
      otherDownSeconds: t.otherDownSeconds, standingSeconds: t.standingSeconds,
      downWindows: t.downWindows, downWindowsScored: t.downWindowsScored,
      reachToDownedCore: reach.length ? { p10: reach[Math.floor(reach.length * 0.1)],
        p50: reach[Math.floor(reach.length * 0.5)], p90: reach[Math.floor(reach.length * 0.9)] } : null,
    };
  }
  return { ...job, status: "ok", winner: result.winner, ending: result.ending, seconds: result.seconds, sides };
}

if (parentPort) parentPort.on("message", async ({ job, manifest }) => {
  try { parentPort.postMessage(await execute(job, manifest)); }
  catch (error) { parentPort.postMessage({ ...job, status: "failed", error: String(error?.stack ?? error) }); }
});
