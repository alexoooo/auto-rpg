// A bout forked (Node, core world, Rapier, 120 Hz): by a load, a bout of the recipe put where a
// save left the bout (`Duel.load`), or by replay, the bout played again to that step, since the same
// recipe and tape reach the same step to the bit. Either way it goes on under a branch.
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { SIDES } from "../src/arena/duel.ts";
import { centreOfToRef } from "../src/core/control/support.ts";
import { traceOf } from "../tests/harness/trace.mjs";
import { buildBout } from "./bout.mjs";

const other = (side) => side === "left" ? "right" : "left";

/** The digest of every segment's pose in `builts` as they stand: one instant, not a trace. */
export function poseDigest(builts) {
  const trace = traceOf(builts);
  trace.take();
  return trace.digest();
}

/** A bout for each recipe this thread has been asked to fork by a load, built once and loaded into for every such fork of it. */
const bouts = new Map();
function boutOf(recipe) {
  const key = JSON.stringify(recipe);
  if (!bouts.has(key)) bouts.set(key, buildBout(recipe));
  return bouts.get(key);
}

/**
 * `recipe`'s bout under `tape` up to its step `from`, then `steps` more under `branch` (orders
 * entries at `from` or later; the tape's from there on are dropped), or to its verdict. `nudges`
 * are given at the fork: each an impulse, N s, world, at the centre of a side's root.
 *
 * With `save` (the bout's `Duel.save` at its step `from`) the fork is a load: a bout of the recipe
 * that this thread keeps is put there, at the cost of the steps played out and no more, and `tape`
 * is not read. Without, it is the bout played again from its start, in a world of its own.
 *
 * The row: the step reached; the poses' digest at the fork (`at`: two forks of one bout at one
 * step agree in it, or one of them is not that bout), the digest of the trace from the fork on,
 * and the poses' digest at the end; the verdict, each side's bar, who is out, and where each
 * side's centre of mass is. Nothing in it says how the fork was reached.
 */
export async function rollout({ recipe, tape = [], from, branch = [], steps, nudges = [], save = null }) {
  if (branch.some((entry) => entry.step < from)) throw new Error("a branch cannot order the past");
  const { world, duel, dispose } = await (save ? boutOf(recipe) : buildBout(recipe));
  try {
    const builts = SIDES.map((side) => duel.duelists[side].built);
    if (save) {
      duel.load(save);
      if (duel.steps !== from && !duel.verdict) throw new Error(`a save at step ${duel.steps} is no fork at step ${from}`);
      // In place of whatever the save had queued, as a replay drops the tape from the fork on.
      duel.play(branch);
    } else {
      duel.play([...tape.filter((entry) => entry.step < from), ...branch]);
      while (!duel.verdict && duel.steps < from) world.step();
    }
    const at = poseDigest(builts);
    for (const { side, impulse } of nudges) {
      const root = duel.duelists[side].body.muscles.dynamics.root.segment;
      root.body.applyImpulse(new Vector3(...impulse), centreOfToRef(root, new Vector3()));
    }
    const trace = traceOf(builts);
    while (!duel.verdict && duel.steps < from + steps) { world.step(); trace.take(); }
    return {
      from, steps: duel.steps, at, digest: trace.digest(), end: poseDigest(builts), verdict: duel.verdict,
      bars: SIDES.map((side) => duel.duelists[side].pool.bar()),
      out: SIDES.filter((side) => !duel.duelists[side].standing),
      centres: SIDES.map((side) => duel.duelists[side].body.view.stance.centre.asArray()),
    };
  } finally { if (!save) dispose(); }
}

/** What `side` has of a bout as `row` left it: its bar less its foe's, a point more with its foe out, a point less out itself. */
export function valueOf(row, side) {
  const own = SIDES.indexOf(side), foe = SIDES.indexOf(other(side));
  return row.bars[own] - row.bars[foe] + (row.out.includes(other(side)) ? 1 : 0) - (row.out.includes(side) ? 1 : 0);
}

/**
 * The responses `side` may try at this instant of `duel`, in the order ties are broken in: its
 * own tactics first (null), then orders made from where the two stand now. Left and right are the
 * body's own, facing its foe.
 */
export function responsesAt(duel, side) {
  const o = duel.duelists[side].body.view.stance.centre, foe = duel.duelists[other(side)];
  const f = foe.body.view.stance.centre, d = Math.max(0.001, Math.hypot(f.x - o.x, f.z - o.z));
  const toward = { x: (f.x - o.x) / d, z: (f.z - o.z) / d }, right = { x: toward.z, z: -toward.x };
  const head = centreOfToRef(foe.built.segments.get("head"), new Vector3());
  return [
    { name: "own", orders: null },
    { name: "attack", orders: { move: null, face: toward, attack: [head.x, head.y, head.z] } },
    { name: "hold", orders: { move: null, face: toward, attack: null } },
    { name: "close", orders: { move: toward, face: null, attack: null } },
    { name: "back", orders: { move: { x: -toward.x, z: -toward.z }, face: toward, attack: null } },
    { name: "left", orders: { move: { x: -right.x, z: -right.z }, face: toward, attack: null } },
    { name: "right", orders: { move: right, face: toward, attack: null } },
  ];
}

/** The index of the greatest of `values`; the first of equals, so a response must beat the ones before it. */
export function chooseResponse(values) {
  let best = 0;
  for (let i = 1; i < values.length; i++) if (values[i] > values[best]) best = i;
  return best;
}
