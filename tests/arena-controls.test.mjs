// Gameplay integration on the Node arena stand, vendored Rapier, 120 Hz. The links a side's
// controls ride in are `arena-link`'s.
import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Duel } from "../src/arena/duel.ts";
import { addArenaSolids } from "../src/arena/room.ts";
import { commandsBody } from "../src/core/body.ts";
import { centreOfToRef } from "../src/core/control/support.ts";
import { RECIPE_FIGHTER } from "../src/core/mind/config.ts";
import { STAND_ORDERS } from "../src/core/mind/orders.ts";
import { saveState } from "../src/core/state.ts";
import { createWorld } from "../src/core/world.ts";
import { traceOf } from "./harness/trace.mjs";
import { freshEngine } from "./harness/core-stand.mjs";
import { COMBAT } from "./fixtures/minds.mjs";

async function bout(overrides = {}) {
  const engine = new NullEngine(), scene = new Scene(engine), world = createWorld(scene, await freshEngine());
  addArenaSolids(world.physics);
  const duel = new Duel(world, { left: "workshop-fighter", right: "workshop-rogue", capSeconds: 20,
    held: { left: "empty", right: "empty" }, minds: { left: COMBAT, right: RECIPE_FIGHTER }, recoverySeconds: 15, ...overrides });
  return { world, duel, dispose() { duel.dispose(); world.dispose(); scene.dispose(); engine.dispose(); } };
}

test("a real fall hands control to recovery, keeps sensing the opponent, and replays its countdown", async () => {
  // Capped, so that the bout ends whether or not the fallen side rises.
  const stand = await bout({ gap: 8, capSeconds: 12, recoverySeconds: 4 });
  try {
    const { world, duel } = stand, fighter = duel.duelists.left;
    duel.order("left", STAND_ORDERS); duel.order("right", STAND_ORDERS);
    world.step(120);
    const trunk = fighter.built.segments.get("middleTrunk"), mass = [...fighter.built.segments.values()].reduce((n, p) => n + p.rigid.mass, 0);
    trunk.body.applyImpulse(new Vector3(0, 0, mass * 1.5), centreOfToRef(trunk, new Vector3()));
    while (!fighter.body.down && duel.steps < 600) world.step();
    assert.ok(fighter.body.down, "the fixture did not reach its case: the shove did not fell it");
    world.step(2);
    assert.ok(!commandsBody(fighter.body) && fighter.body.has !== "nobody", `a sub-mind has the fallen body: ${fighter.body.has}`);
    assert.equal(duel.verdict, null);
    assert.equal(duel.eliminated("left"), false);
    assert.equal(duel.duelists.right.body.view.senses.others.find(o => o.id === "left").out, false);
    const saved = duel.save();
    const run = () => {
      const trace = traceOf(Object.values(duel.duelists).map(d => d.built));
      while (!duel.verdict) { world.step(); trace.take(); }
      return trace.digest();
    };
    const digest = run();
    // Whatever the ending, a side is out for its fall only once its countdown has run.
    if (duel.verdict.ending === "fallen") {
      const out = duel.verdict.winner === "left" ? "right" : "left";
      assert.ok(duel.state.recovery[out] >= duel.recipe.recoverySeconds, JSON.stringify({ verdict: duel.verdict, recovery: duel.state.recovery }));
    }
    const expected = saveState(duel.state);
    duel.load(saved); assert.equal(run(), digest);
    assert.deepEqual(saveState(duel.state), expected);
  } finally { stand.dispose(); }
});
