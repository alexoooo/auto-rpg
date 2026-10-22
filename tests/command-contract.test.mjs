/**
 * **What every registered Commander keeps to** (Node, core world, vendored Rapier, 120 Hz): each
 * Commander (`COMMANDERS`) leads the left side of an Arena bout as a team of one on open ground,
 * looking once a second, until it has sent its member at the foe and the member stands within its
 * reach of it; the bout forks there and goes on to
 * the bit with the Commander's memory copied (`state`), and plays again to the bit from the orders it
 * gave alone (`Duel.play`), with no Commander. How well a Commander leads is measured apart.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { buildBout } from "../src/evaluation/bout.ts";
import { BOUT_ENGINE } from "../research/bout.mjs";
import { COMMANDERS, createCommander } from "../src/core/command/commanders.ts";
import { loadState, saveState } from "../src/core/state.ts";
import { traceOf } from "../src/evaluation/trace.ts";
import { cryptModel } from "../src/dungeon/actors.ts";
import { SIDES } from "../src/arena/duel.ts";

/** The bout: two bodies a little beyond the member's reach, so that its Commander must send it in. */
const RECIPE = Object.freeze({ left: "workshop-fighter", right: "workshop-rogue", gap: 2.5 });
/** The longest it may take a Commander to send its member at the foe, s: the bout's own cap. */
const REACH_SECONDS = 10;

/** Open ground: everything in range is seen, every place fits and is reached, and no door or unexplored edge is in the way. */
const OPEN = Object.freeze({
  sees: (from, to, metres) => Math.sqrt((to.x - from.x) ** 2 + (to.z - from.z) ** 2) <= metres,
  look: () => {}, fits: () => true, passes: () => true, reaches: () => true, frontier: () => null, doorway: () => null, open: () => true,
});

/** A bout of `RECIPE` whose left side `kind` leads, given its orders each step in the sensing phase, before every Mind. */
async function led(kind, home) {
  const bout = await buildBout(RECIPE, { engine: BOUT_ENGINE }), { world, duel } = bout;
  const commander = createCommander({ level: OPEN }, COMMANDERS[kind].defaults), { radius, attackMetres } = cryptModel(RECIPE.left);
  const at = (side) => { const c = duel.duelists[side].body.physical.centre; return { x: c.x, z: c.z }; };
  const start = home ?? at("left");
  const leading = world.sense(() => {
    const view = {
      time: duel.clock, look: duel.steps % world.hz === 0, lead: null,
      members: [{ id: "left", at: at("left"), fighting: !duel.eliminated("left"), held: false, radius, reach: attackMetres, home: start,
        navigation: duel.duelists.left.minded.skills?.report.navigation ?? null }],
      others: [{ id: "right", at: at("right"), fighting: !duel.eliminated("right") }],
    };
    const orders = commander.decide(view).orders.get("left");
    if (orders) duel.order("left", orders);
  });
  const trace = traceOf(SIDES.map((side) => duel.duelists[side].built));
  const gap = () => { const l = at("left"), r = at("right"); return Math.sqrt((r.x - l.x) ** 2 + (r.z - l.z) ** 2); };
  return { ...bout, commander, trace, start, gap, reach: attackMetres, dispose() { leading.dispose(); bout.dispose(); } };
}

for (const kind of Object.keys(COMMANDERS)) {
  test(`the ${kind} Commander leads a bout that forks and replays from its orders alone`, async () => {
    const a = await led(kind);
    let fork;
    try {
      const closed = () => a.duel.tape.some((entry) => entry.orders?.foe === "right") && a.gap() <= a.reach;
      while (!closed() && a.duel.clock < REACH_SECONDS) { a.world.step(); a.trace.take(); }
      assert.ok(closed(), `the ${kind} Commander did not bring its member within reach of the foe in ${REACH_SECONDS} s: the fixture did not reach its case`);
      // On past the next look, so that the fork decides on the memory it was given until then.
      const steps = a.world.hz;
      fork = { duel: a.duel.save(), commander: saveState(a.commander.state) };
      const after = traceOf(SIDES.map((side) => a.duel.duelists[side].built));
      for (let i = 0; i < steps; i++) { a.world.step(); a.trace.take(); after.take(); }

      const b = await led(kind, a.start);
      try {
        b.duel.load(fork.duel);
        loadState(b.commander.state, fork.commander);
        for (let i = 0; i < steps; i++) { b.world.step(); b.trace.take(); }
        assert.deepEqual({ pose: b.trace.digest(), tape: b.duel.tape }, { pose: after.digest(), tape: a.duel.tape }, "the fork goes on as the bout did");
      } finally { b.dispose(); }

      const c = await buildBout(RECIPE, { engine: BOUT_ENGINE });
      try {
        c.duel.play(a.duel.tape);
        const replay = traceOf(SIDES.map((side) => c.duel.duelists[side].built));
        while (c.duel.steps < a.duel.steps) { c.world.step(); replay.take(); }
        assert.deepEqual({ pose: replay.digest(), tape: c.duel.tape }, { pose: a.trace.digest(), tape: a.duel.tape }, "the orders alone play the bout again");
      } finally { c.dispose(); }
    } finally { a.dispose(); }
  });
}
