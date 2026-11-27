// A bout forked (Node, core world, Rapier, 120 Hz): by a load, a bout of the recipe put where a
// save left the bout (`Duel.load`), or by replay, the bout played again to that step, since the same
// recipe and tape reach the same step to the bit. Either way it goes on under a branch.
import { Vector3 } from "../src/core/math/vector.ts";
import { SIDES } from "../src/game/arena/duel.ts";
import { centreOfToRef } from "../src/core/bodies/read-motion.ts";
import { mulberry32 } from "../src/core/math/rng.ts";
import { traceOf } from "../src/evaluation/trace.ts";
import { buildBout } from "../src/app/node/evaluation.ts";
import { BOUT_ENGINE } from "./bout.mjs";
import { rootSegment } from "../src/core/bodies/read-body.ts";
import { sideOf } from "./minds/root-reading.mjs";

const other = (side) => side === "left" ? "right" : "left";

/** The digest of every segment's pose in `builts` as they stand: one instant, not a trace. */
export function poseDigest(builts) {
  const trace = traceOf(builts);
  trace.take();
  return trace.digest();
}

/**
 * A bout for each recipe and engine this thread has been asked to fork by a load, built once and
 * loaded into for every such fork of it; the last few kept (`KEPT`), the one least lately asked for
 * let go past them, since a thread may fork the states of many bouts.
 */
const bouts = new Map(), KEPT = 4;
function boutOf(recipe, engine) {
  const key = `${engine} ${JSON.stringify(recipe)}`, kept = bouts.get(key) ?? buildBout(recipe, { engine });
  bouts.delete(key);
  bouts.set(key, kept);
  if (bouts.size > KEPT) {
    const [oldest, built] = bouts.entries().next().value;
    bouts.delete(oldest);
    void built.then((bout) => bout.dispose());
  }
  return kept;
}

/** The hooks' globals a fork sets: an outer watcher's are set aside while it plays. */
const HOOKED = ["__optionDecision", "__optionSet", "__searchLines"];

/**
 * Where the situation `now` has the body, as a measured run keeps its ends: its place and
 * heading, its bearing around the foe, its posture, its velocity over the ground, how far off the
 * foe is, head to head and centre to centre, and what the foe is doing.
 */
const placeOf = (now) => ({ x: now.where.x, z: now.where.z, face: now.where.face, around: now.around, posture: now.posture,
  vx: now.velocity.x, vz: now.velocity.z, range: now.range, apart: now.apart, phase: now.phase });

/** An Option's model (`Terms`) as a row keeps it: its seconds, the life it deals and takes, and each way it ends with its chance, its leaves flat. Null for none. */
const termsOf = (terms) => terms && {
  duration: terms.duration, dealt: terms.dealt, taken: terms.taken,
  outcomes: terms.outcomes.map(({ chance, leaves: { where, around, posture, velocity, grace, phase } }) => ({
    chance, ...(where ? { x: where.x, z: where.z, face: where.face } : {}), ...(around === undefined ? {} : { around }),
    ...(posture === undefined ? {} : { posture }), ...(velocity ? { vx: velocity.x, vz: velocity.z } : {}),
    ...(grace === undefined ? {} : { grace }), ...(phase === undefined ? {} : { phase }),
  })),
};

/**
 * `recipe`'s bout under `tape` up to its step `from`, then `steps` more under `branch` (orders
 * entries at `from` or later; the tape's from there on are dropped), or to its verdict. `nudges`
 * are given at the fork: each an impulse, N s, world, at the centre of a side's root.
 *
 * With `save` (the bout's `Duel.save` at its step `from`) the fork is a load: a bout of the recipe
 * that this thread keeps is put there, at the cost of the steps played out and no more, and `tape`
 * is not read. Without, it is the bout played again from its start, in a world of its own.
 *
 * With `option` (`{ side, key }`) the branch is also an Option: at the first decision `side`'s
 * Mind makes afresh from the fork on, it takes the Option `key` names ("3:0": its place in the
 * Mind's Options and its target, as the warm start keys them), then decides as it always does;
 * with `hold` (`{ side, key, hold: true }`) the Mind takes it again at each decision it runs on to
 * while it yields, so it runs to its exit as a search's line runs it (over, out of its entry, no
 * longer on offer, or at its exit, where the Mind keeps it or lets it go as it always does). An
 * open Option is not held. That needs the option fork's hook (`option-fork-hook.mjs`) registered
 * before the Mind's code loads.
 *
 * With `measure` (`{ side, key, measure: { until } }`) the Option is held, an open one for `until`
 * s, and the fork is played until the Option's run ends and no further. That needs the move
 * prior's hook (`minds/move-prior-hook.mjs`) registered too. The row then also holds:
 * - `predicted`: what the Option's model said at the decision it was taken at, as that decision's
 *   search asked it (`modelAt`; an open one asked over `until` s): its kind, whether it is open,
 *   its seconds, the life it deals and takes, and each way it ends with its chance (`Terms`);
 *   null where that decision's search did not run;
 * - `run`: what it did, measured, with nothing estimated: the seconds from that decision to the
 *   one its run ended at; how it ended (`ended`: "exit" at its exit, "over" over or out of its
 *   entry or off offer, "held" an open one held its `until`, "dropped" its claims or its offer
 *   refused it while it yielded, "cap" still running at the fork's end, "verdict" the bout over);
 *   the life it dealt and took meanwhile; and where the body stood at its start and at its end
 *   (`from`, `to`, as the Mind's reading of the situation there has them, `placeOf`; `to` null
 *   where it was cut).
 * A run ends at a decision, so its seconds are the Mind's: it sees an Option over at its next
 * look (`OptionMindConfig.rate`), and an open one's `until` at its next decision.
 *
 * The row: the step reached; the poses' digest at the fork (`at`: two forks of one bout at one
 * step agree in it, or one of them is not that bout), the digest of the trace from the fork on,
 * and the poses' digest at the end; the verdict, each side's bar, who is out, and where each
 * side's centre of mass is. With `option`, also what became of it (`chose`): when that decision
 * was, s, the key of the Option the Mind would have taken there itself (null for none), and
 * whether the named one was taken (only where its claims are free and the Mind prices it there);
 * `chose` is null where the side made no decision afresh in the fork. Nothing in the row says how
 * the fork was reached.
 */
export async function rollout({ recipe, tape = [], from, branch = [], steps, nudges = [], save = null, option = null, engine = BOUT_ENGINE }) {
  if (branch.some((entry) => entry.step < from)) throw new Error("a branch cannot order the past");
  if (option && !globalThis.__optionForkHook) throw new Error("a fork that takes an Option needs research/option-fork-hook.mjs registered before the Mind's code loads");
  const { world, duel, dispose } = await (save ? boutOf(recipe, engine) : buildBout(recipe, { engine }));
  // A fork reports its decisions to no one outside it: an outer watcher is set aside until it is over.
  const before = HOOKED.map((name) => globalThis[name]);
  for (const name of HOOKED) globalThis[name] = undefined;
  let chose = null;
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
      const root = rootSegment(duel.duelists[side].body.built);
      root.body.applyImpulse(new Vector3(...impulse), centreOfToRef(root, new Vector3()));
    }
    // Armed only from the fork on: a replay's decisions before it are the trunk's.
    const [index, target] = option ? option.key.split(":").map(Number) : [];
    const measure = option?.measure ?? null, hold = option?.hold === true || measure !== null, foe = option && other(option.side);
    let choseAt = null, open = false, lives = null, start = null, predicted = null, run = null, status = null, first = true, ended = false;
    // The searches of the side's latest decision, in order: the first at the situation it decides at, any after at another (a foe's reply imagined, `repliedSearch`).
    const searches = [];
    /** The run ended at the situation `now` (null where it was cut), as `how` says. */
    const finish = (how, now) => {
      ended = true;
      run = { seconds: duel.clock - choseAt, ended: how, dealt: lives[1] - duel.life(foe), taken: lives[0] - duel.life(option.side), from: start, to: now && placeOf(now) };
    };
    if (measure) {
      if (!globalThis.__moveLinesHook) throw new Error("a fork that measures needs research/minds/move-prior-hook.mjs registered before the Mind's code loads");
      globalThis.__searchLines = (root, space) => {
        if (!root.focus || sideOf(root) !== option.side) return;
        if (searches[0]?.root.time !== root.time) searches.length = 0;
        searches.push({ root, space });
      };
    }
    if (option) {
      globalThis.__optionDecision = (decision) => {
        if (decision.side !== option.side) return;
        if (chose) {
          if (!chose.taken || ended) return;
          const mine = decision.running.find(([i, k]) => i === index && k === target);
          status = mine?.[2] ?? "over";
          if (measure && open && duel.clock - choseAt >= measure.until - 1e-9) return finish("held", decision.now);
          if (measure && status === "exit") return finish("exit", decision.now);
          // Held: at each later decision it ran on to at its target, yielding, it is taken again: a committed one runs on anyway, and one at its exit is the Mind's to keep or let go.
          if (hold && mine && status === "yields" && (!mine[3] || measure)) decision.force(index, target);
          return;
        }
        choseAt = duel.clock;
        chose = { time: decision.time, own: decision.pick && `${decision.pick[0]}:${decision.pick[1]}`, taken: decision.force(index, target) };
        if (!measure || !chose.taken) return;
        const choice = decision.choice(index);
        open = choice.open === true;
        lives = [duel.life(option.side), duel.life(foe)];
        start = placeOf(decision.now);
        // As this decision's search asked the model, of the same situation: an open one over the time it is held.
        const own = searches[0]?.root.time === decision.time ? searches[0] : null;
        if (own) predicted = { kind: choice.kind, open, ...termsOf(open ? choice.model(own.root, { target, until: measure.until }) : own.space.modelAt(own.space.pairAt(choice, target), own.root)) };
      };
      // The set of the forced decision itself is passed over: from the next decision on, the Option must run on, at its target.
      globalThis.__optionSet = ({ side, now, running }) => {
        if (side !== option.side || !chose?.taken || ended) return;
        if (first) { first = false; return; }
        if (running.some(([i, k, , on]) => i === index && k === target && on)) return;
        if (measure) finish(status === "yields" ? "dropped" : status, now);
        else ended = true;
      };
    }
    const trace = traceOf(builts);
    while (!duel.verdict && duel.steps < from + steps && !(measure && (ended || chose?.taken === false))) { world.step(); trace.take(); }
    if (measure && chose?.taken && !ended) finish(duel.verdict ? "verdict" : "cap", null);
    return {
      from, steps: duel.steps, at, digest: trace.digest(), end: poseDigest(builts), verdict: duel.verdict,
      bars: SIDES.map((side) => duel.duelists[side].pool.bar()),
      out: SIDES.filter((side) => !duel.duelists[side].standing),
      centres: SIDES.map((side) => duel.duelists[side].body.view.stance.centre.asArray()),
      ...(option ? { chose } : {}), ...(measure ? { predicted, run } : {}),
    };
  } finally {
    HOOKED.forEach((name, k) => { globalThis[name] = before[k]; });
    if (!save) dispose();
  }
}

/**
 * A blind fork's nudges: one for each side's root, `nudge` N s in a level direction drawn for the
 * decision at step `from` and its trial `trial`, so the same for every response of the decision.
 */
export function nudgesOf(from, trial, nudge) {
  const random = mulberry32(from * 65536 + trial);
  return SIDES.map((side) => {
    const angle = 2 * Math.PI * random();
    return { side, impulse: [nudge * Math.cos(angle), 0, nudge * Math.sin(angle)] };
  });
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
  return [
    { name: "own", orders: null },
    { name: "attack", orders: { move: null, face: toward, foe: foe.id } },
    { name: "hold", orders: { move: null, face: toward } },
    { name: "close", orders: { move: { kind: "direct", direction: toward }, face: null } },
    { name: "back", orders: { move: { kind: "direct", direction: { x: -toward.x, z: -toward.z } }, face: toward } },
    { name: "left", orders: { move: { kind: "direct", direction: { x: -right.x, z: -right.z } }, face: toward } },
    { name: "right", orders: { move: { kind: "direct", direction: right }, face: toward } },
  ];
}

/** The index of the greatest of `values`; the first of equals, so a response must beat the ones before it. */
export function chooseResponse(values) {
  let best = 0;
  for (let i = 1; i < values.length; i++) if (values[i] > values[best]) best = i;
  return best;
}
