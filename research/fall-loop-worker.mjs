/**
 * One bout, read for the fall loop: every knockdown, what fed the ledger on the boundary it fell,
 * how long the body had been up, and what the first seconds after each rise looked like
 * (2026-09-25, `docs/analysis/2026-09-25-falls-and-rise.md`).
 *
 * The worker `research/fall-loop.mjs` hands to `runJobs`. It plays the bout `research/worker.mjs`
 * plays -- `createBout` under the research `PROTOCOL`, a fresh Havok -- and reads once a substep, on
 * the bout runner's `onSample`, which runs after both boundaries have stepped:
 *
 * - each side's support state, ledger and tipping geometry, off its port;
 * - every stability event the port's staging buffer was handed since the last substep, which is
 *   exactly the set its boundary consumed (a blow from `Combat` arrives in the solver step before;
 *   a held push, an outrun and a press are filed by `readContact` inside the boundary);
 * - the pair push each port was handed (`notePairPush`).
 *
 * Nothing it reads is written back. The wrappers call through and record; the port's private fields
 * are read, never set.
 */
import { parentPort } from "node:worker_threads";
import { Logger } from "@babylonjs/core/Misc/logger.js";
import { createBout, freshHavok } from "../tests/harness/bout-runner.mjs";
import { CONFIG } from "../src/config.ts";
import { policyMind } from "../src/mind.ts";
import { shoveSpecificImpulse } from "../src/supported-locomotion-state.ts";
import { SKELETON_BIPED } from "../src/golem/skeleton/body.ts";

// A sweep knob, read once per worker: the skeleton's hip lead (`hipAhead`), m.
if (process.env.SKELETON_HIP_AHEAD) SKELETON_BIPED.hipAhead = Number(process.env.SKELETON_HIP_AHEAD);
// And the skeleton's rise turn rate (`BipedRise.turnPeakRadS`), rad/s.
if (process.env.SKELETON_TURN_PEAK) {
  SKELETON_BIPED.rise = Object.freeze({ ...SKELETON_BIPED.rise, turnPeakRadS: Number(process.env.SKELETON_TURN_PEAK) });
}
Logger.LogLevels = Logger.ErrorLogLevel;

const SIDES = ["left", "right"];
const other = (side) => (side === "left" ? "right" : "left");
const DT = 1 / CONFIG.world.physicsHz;
/** How long after a rise a body is watched, s. */
const AFTER = 3;

/** Signed distance from the centre of mass's ground point to the hull's boundary, m; negative outside. */
export function hullMargin(hull) {
  if (!hull || hull.length < 3) return null;
  let margin = Infinity;
  for (let i = 0; i < hull.length; i += 1) {
    const [ax, az] = hull[i];
    const [bx, bz] = hull[(i + 1) % hull.length];
    const length = Math.hypot(bx - ax, bz - az);
    if (!(length > 0)) continue;
    margin = Math.min(margin, ((bz - az) * ax - (bx - ax) * az) / length);
  }
  return Number.isFinite(margin) ? margin : null;
}

const magnitude = ([x, z]) => Math.hypot(x, z);

export async function execute(job, manifest) {
  const builds = new Map(manifest.builds.map((build) => [build.name, build.setup]));
  const pending = { left: [], right: [] };
  const pairs = { left: null, right: null };
  let t = 0;
  const track = Object.fromEntries(SIDES.map((side) => [side, {
    was: "supported", lastStood: null, riseStart: null, fallStart: null, downSeconds: 0, standingSeconds: 0,
    falls: [], rises: [], windows: [], open: null, recentBlows: [], lastPairAt: -Infinity, lastPairDriving: null,
    lastMargin: null, lastLean: 0,
  }]));
  let bout;
  const instrument = (side) => {
    const port = bout[side].locomotion;
    const staged = port.staged;
    const queue = staged.queueStabilityEvent.bind(staged);
    staged.queueStabilityEvent = (event) => { pending[side].push(event); queue(event); };
    const note = port.notePairPush.bind(port);
    port.notePairPush = (push) => { pairs[side] = push; note(push); };
  };
  const soles = (port) => {
    const points = [];
    for (const binding of port.options.supportBindings) {
      const point = port.options.supportPoint?.(binding);
      if (point) points.push(point);
    }
    return points;
  };
  const sample = () => {
    t += DT;
    for (const side of SIDES) {
      const body = bout[side];
      const port = body.locomotion;
      const tr = track[side];
      const state = port.state;
      const ss = port.supportState;
      const tipping = port.tipping;
      const events = pending[side];
      pending[side] = [];
      const mass = port.supportedMassKg;
      const blows = events.filter((e) => !e.sustained);
      const held = events.filter((e) => e.sustained);
      const blowMps = blows.length ? magnitude(shoveSpecificImpulse(blows, mass, tipping)) : 0;
      const heldMps = held.length ? magnitude(shoveSpecificImpulse(held, mass, tipping)) : 0;
      if (blowMps > 0) tr.recentBlows.push({ t, mps: blowMps });
      while (tr.recentBlows.length && tr.recentBlows[0].t < t - 1) tr.recentBlows.shift();
      const pair = pairs[side];
      if (pair) { tr.lastPairAt = t; tr.lastPairDriving = pair.driving; }
      const margin = tipping ? hullMargin(tipping.hull) : null;
      const theirs = bout[other(side)].locomotion;
      const mine = port.carrier.state;
      const their = theirs.carrier.state;
      const gap = Math.hypot(their.x - mine.x, their.z - mine.z) - port.footprint.radiusM - theirs.footprint.radiusM;
      const standing = state === "supported" || state === "staggered";
      if (standing) tr.standingSeconds += DT; else tr.downSeconds += DT;

      // The window after a rise.
      if (tr.open) {
        const w = tr.open;
        const since = t - w.at;
        if (since > AFTER || !standing) {
          w.closedBy = standing ? "time" : "fell";
          w.lastedS = since;
          tr.windows.push(w);
          tr.open = null;
        } else {
          if (margin !== null) {
            w.minMargin = Math.min(w.minMargin, margin);
            if (margin < 0) w.outsideS += DT;
          }
          const line = port.stabilityLinesAlong(ss.leanX, ss.leanZ).fallAtMps;
          if (ss.specificImpulseMps > 0 && Number.isFinite(line) && line > 0) {
            w.maxLeanShare = Math.max(w.maxLeanShare, ss.specificImpulseMps / line);
          }
          w.blowMps += blowMps; if (blowMps > 0) w.blows += 1;
          w.heldMps += heldMps;
          if (pair) w.pairS += DT;
          if (gap < 0.3) w.closeS += DT;
          if (since <= 0.5) w.speed05 = Math.max(w.speed05, Math.hypot(mine.velocityX, mine.velocityZ));
        }
      }

      const prev = tr.was;
      if (state === "fallen" && prev !== "fallen") {
        const recent = tr.recentBlows.filter((b) => b.t >= t - 0.5);
        const line = port.stabilityLinesAlong(ss.leanX, ss.leanZ).fallAtMps;
        // Where the centre of mass is from the soles' midpoint, toward the other body.
        const md = port.options.massDistribution?.();
        const ps = soles(port);
        let comToward = null, comFromSoles = null;
        if (md && ps.length) {
          const sx = ps.reduce((a, p) => a + p.x, 0) / ps.length, sz = ps.reduce((a, p) => a + p.z, 0) / ps.length;
          const ux = their.x - mine.x, uz = their.z - mine.z, ul = Math.hypot(ux, uz) || 1;
          comToward = ((md.x - sx) * ux + (md.z - sz) * uz) / ul;
          comFromSoles = Math.hypot(md.x - sx, md.z - sz);
        }
        tr.falls.push({
          t, from: prev, reason: port.releaseReason, riseAbort: prev === "rising" ? port.riseAbort : null,
          gateReason: prev === "rising" ? port.riseGate()?.reason ?? null : null,
          sinceStood: tr.lastStood === null ? null : t - tr.lastStood,
          blowMps, heldMps, blowCount: blows.length, heldCount: held.length,
          priorLean: tr.lastLean, lean: ss.specificImpulseMps, line,
          margin: tr.lastMargin, marginNow: margin,
          recentBlows: recent.length, recentBlowMax: recent.reduce((a, b) => Math.max(a, b.mps), 0),
          pairRecent: t - tr.lastPairAt <= 0.25, pairDriving: t - tr.lastPairAt <= 0.25 ? tr.lastPairDriving : null,
          lifted: port.contactTally.lifts, otherState: theirs.state, gap,
          speed: Math.hypot(mine.velocityX, mine.velocityZ), comToward, comFromSoles,
          risingElapsed: prev === "rising" ? port.lastRiseGate?.prior?.risingElapsedS ?? null : null,
        });
        if (prev === "rising") {
          const rise = tr.rises.at(-1);
          if (rise && rise.end === null) { rise.end = t; rise.outcome = `fell:${port.riseAbort}`; }
        }
        tr.fallStart = t;
      }
      if (state === "rising" && prev !== "rising") {
        tr.rises.push({ start: t, end: null, outcome: null, lay: tr.fallStart === null ? null : t - tr.fallStart,
          durationS: port.rising?.durationS ?? null, relocated: port.riseRelocated });
      }
      if (standing && prev === "rising") {
        const rise = tr.rises.at(-1);
        if (rise) { rise.end = t; rise.outcome = "stood"; }
        tr.lastStood = t;
        tr.open = { at: t, minMargin: margin ?? Infinity, marginAtStand: margin, outsideS: 0, maxLeanShare: 0,
          blowMps: 0, blows: 0, heldMps: 0, pairS: 0, closeS: 0, speed05: 0,
          otherState: theirs.state, gapAtStand: gap, closedBy: null, lastedS: null };
      }
      tr.was = state;
      tr.lastMargin = margin;
      tr.lastLean = ss.specificImpulseMps;
    }
  };
  bout = createBout({ left: job.left, right: job.right,
    leftMind: policyMind(job.left, job.seeds[0]), rightMind: policyMind(job.right, job.seeds[1]),
    seeds: job.seeds, leftGolem: builds.get(job.leftBuild), rightGolem: builds.get(job.rightBuild),
    ...manifest.protocol, physics: await freshHavok(), onSample: () => sample() });
  for (const side of SIDES) instrument(side);
  let result;
  try {
    while (bout.step()) { /* sampled per substep */ }
    result = bout.finish();
  } finally { bout.dispose(); }
  const sides = {};
  for (const side of SIDES) {
    const tr = track[side];
    if (tr.open) { tr.open.closedBy = "bout"; tr.open.lastedS = t - tr.open.at; tr.windows.push(tr.open); }
    sides[side] = { mind: job[side], falls: tr.falls, rises: tr.rises, windows: tr.windows,
      downSeconds: tr.downSeconds, standingSeconds: tr.standingSeconds, damage: result[side].damage };
  }
  return { ...job, status: "ok", winner: result.winner, ending: result.ending, seconds: result.seconds, sides };
}

if (parentPort) parentPort.on("message", async ({ job, manifest }) => {
  try { parentPort.postMessage(await execute(job, manifest)); }
  catch (error) { parentPort.postMessage({ ...job, status: "failed", error: String(error?.stack ?? error) }); }
});
