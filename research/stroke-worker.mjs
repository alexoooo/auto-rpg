/**
 * One bout, read stroke by stroke (release 2's question 5(b), `research/release2-strokes.mjs`):
 * why the bigger walker's strokes land worse.
 *
 * The worker `research/release2-strokes.mjs` hands to `runJobs` (one Havok arena per worker realm).
 * It plays the bout `research/headroom-worker.mjs` plays for two naive minds -- `createBout` under
 * the manifest's protocol, a fresh Havok -- and **instruments the call**: each side's walker is
 * wrapped, and a stroke is the edge on which the walker's own `swinging` goes from -1 to 0
 * (`captureState` in `src/golem/walker.ts`), not a reading of the command it happened to write.
 * At that edge it records the range the stroke was thrown from; while the stroke runs it reads the
 * striker's tip against the walker's own mark (their ground centre at their shoulder height,
 * `markOf`); and every contact `Combat` reports is filed to the striker side's stroke in progress,
 * or to the `STROKE_GRACE` after it, or else to "unswung".
 *
 * A mind that is not a walker is still played and its contacts still filed, with no strokes: the
 * edge it is read by is the walker's alone. It imports no worker module (AGENTS.md).
 */
import { parentPort } from "node:worker_threads";
import { Logger } from "@babylonjs/core/Misc/logger.js";
import { createBout, freshHavok } from "../tests/harness/bout-runner.mjs";
import { policyMind } from "../src/mind.ts";
import { STROKE_SHAPES } from "../src/golem/tactics.ts";
import { chooseStriker, markOf, strikerGap } from "../src/golem/walker.ts";
import { applyOverrides } from "./overrides.mjs";
Logger.LogLevels = Logger.ErrorLogLevel;

const SIDES = ["left", "right"];
/** Seconds after a stroke ends during which a contact is still that stroke's, s. */
export const STROKE_GRACE = 0.25;

const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
/**
 * A mind name ending in this is the walker that never strokes: the counterfactual that separates a
 * stroke's own quality from what the other body's strokes do to it.
 */
export const POINTER = ":pointer";
const baseMind = (name) => (name.endsWith(POINTER) ? name.slice(0, -POINTER.length) : name);

export async function execute(job, manifest) {
  const builds = new Map(manifest.builds.map((build) => [build.name, build.setup]));
  const strokes = { left: [], right: [] };
  const open = { left: null, right: null };
  const unswung = { left: [], right: [] };
  let clock = 0;
  const mark = { x: 0, y: 0, z: 0 };

  const watch = (side, name, seed) => {
    const mind = policyMind(baseMind(name), seed);
    const walker = mind.captureState?.()?.walker ?? null;
    if (!walker) return mind;
    if (name.endsWith(POINTER)) {
      // The walker with its clock held at zero: it walks in to its hold and points its striker at
      // the mark exactly as a walker does between strokes, and never strokes.
      const own = mind.decide;
      mind.decide = (view, dt) => { walker.restoreState({ sinceSwing: 0, swinging: -1, swingHand: "primary" }); return own(view, dt); };
      return mind;
    }
    const decide = mind.decide;
    let last = null;
    mind.decide = (view, dt) => {
      const before = walker.captureState().swinging;
      const intent = decide(view, dt);
      const after = walker.captureState();
      if (before < 0 && after.swinging >= 0) {
        const striker = chooseStriker(view);
        markOf(view, mark);
        const hand = after.swingHand;
        const h = hand ? view.self.hands[hand] : null;
        const gap = strikerGap(view, striker, mark);
        last = {
          t: clock, hand, weapon: h?.weapon ?? "natural", reach: striker?.reach ?? null, gap,
          fraction: striker ? gap / striker.reach : null, ground: flat(view.self.ground, view.opponent.ground),
          socketY: h?.shoulder.y ?? null, markY: mark.y, drop: h ? h.shoulder.y - mark.y : null,
          theirSupport: view.opponent.support ?? null, ownSupport: view.self.support ?? null, theirReach: view.opponent.reach,
          chamberSeconds: h ? STROKE_SHAPES[h.weapon].chamberSeconds : null,
          tipPeak: 0, closest: Infinity, closestAt: null, closestSpeed: null, closestTipY: null, end: null,
          contacts: [],
        };
        strokes[side].push(last);
        open[side] = last;
      }
      const s = open[side];
      if (s && s.end === null) {
        if (s.hand) {
          const h = view.self.hands[s.hand];
          markOf(view, mark);
          s.tipPeak = Math.max(s.tipPeak, h.tipSpeed);
          const d = Math.hypot(h.tip.x - mark.x, h.tip.y - mark.y, h.tip.z - mark.z);
          if (d < s.closest) { s.closest = d; s.closestAt = clock - s.t; s.closestSpeed = h.tipSpeed; s.closestTipY = h.tip.y - mark.y; }
        }
        if (after.swinging < 0) s.end = clock;
      }
      return intent;
    };
    return mind;
  };

  const onEvent = ({ side, report, blocked, guarded }) => {
    const entry = { at: report.at, kind: report.kind, key: report.key, damage: report.damage, blocked, guarded: Boolean(guarded),
      speed: report.speed, closing: report.closingSpeed, strikerKg: report.strikerMassKg, partKg: report.partMassKg,
      energy: report.energyJ, edge: report.edgeAlignment, blade: report.bladeAlignment, tipDist: report.tipDistanceM,
      transfer: report.transferNs };
    const s = open[side];
    if (s && (s.end === null || report.at <= s.end + STROKE_GRACE)) {
      entry.since = report.at - s.t;
      s.contacts.push(entry);
    } else unswung[side].push(entry);
  };

  const bout = createBout({ left: baseMind(job.left), right: baseMind(job.right),
    leftMind: watch("left", job.left, job.seeds[0]), rightMind: watch("right", job.right, job.seeds[1]),
    seeds: job.seeds, leftGolem: builds.get(job.leftBuild), rightGolem: builds.get(job.rightBuild),
    ...manifest.protocol, physics: await freshHavok(), onEvent,
    onSample: ({ clock: now }) => { clock = now; } });
  let result;
  try {
    while (bout.step()) { /* read on the minds' own calls */ }
    result = bout.finish();
  } finally { bout.dispose(); }
  const sides = {};
  for (const side of SIDES) {
    sides[side] = { mind: job[side], build: side === "left" ? job.leftBuild : job.rightBuild,
      damage: result[side].damage, strokes: strokes[side].map((s) => ({ ...s, closest: Number.isFinite(s.closest) ? s.closest : null })),
      unswung: unswung[side] };
  }
  return { ...job, status: "ok", winner: result.winner, ending: result.ending, seconds: result.seconds, sides };
}

if (parentPort) parentPort.on("message", async ({ job, manifest }) => {
  const restore = applyOverrides(manifest.overrides);
  try { parentPort.postMessage(await execute(job, manifest)); }
  catch (error) { parentPort.postMessage({ ...job, status: "failed", error: String(error?.stack ?? error) }); }
  finally { restore(); }
});
