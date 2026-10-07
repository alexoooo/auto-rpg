// Gameplay integration on the Node arena stand, vendored Rapier, 120 Hz.
import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Duel } from "../src/arena/duel.ts";
import { readControls, readMinds, readRecovery } from "../src/arena/matchup.ts";
import { addArenaSolids } from "../src/arena/room.ts";
import { centreOfToRef } from "../src/core/control/support.ts";
import { ARENA_BRAWLER, ARENA_FIGHTER, FIGHTER } from "../src/core/mind/config.ts";
import { STAND_ORDERS } from "../src/core/mind/orders.ts";
import { saveState } from "../src/core/state.ts";
import { createWorld } from "../src/core/world.ts";
import { traceOf } from "./harness/trace.mjs";
import { freshEngine } from "./harness/core-stand.mjs";

async function bout(overrides = {}) {
  const engine = new NullEngine(), scene = new Scene(engine), world = createWorld(scene, await freshEngine());
  addArenaSolids(world.physics);
  const duel = new Duel(world, { left: "workshop-fighter", right: "workshop-rogue", capSeconds: 20,
    held: { left: "empty", right: "empty" }, minds: { left: ARENA_FIGHTER, right: FIGHTER }, recoverySeconds: 15, ...overrides });
  return { world, duel, dispose() { duel.dispose(); world.dispose(); scene.dispose(); engine.dispose(); } };
}

test("controller and recovery links preserve independent choices and classic guard settings", () => {
  assert.deepEqual(readControls(""), { left: "classic", right: "classic" });
  assert.deepEqual(readControls("?control=unknown,combat"), { left: "classic", right: "combat" });
  assert.deepEqual(readControls("?control=point-left,point-alternate"), { left: "classic", right: "classic" });
  assert.deepEqual(readMinds("?control=combat,classic&guard=cover"), {
    left: ARENA_FIGHTER, right: { ...FIGHTER, guard: "cover", subs: [{ kind: "staged-rise" }] },
  });
  assert.deepEqual(readMinds("?control=brawler,combat"), { left: ARENA_BRAWLER, right: ARENA_FIGHTER });
  assert.deepEqual(["", "?recovery=", "?recovery=-1", "?recovery=Infinity", "?recovery=61"].map(readRecovery), Array(5).fill(undefined));
  assert.equal(readRecovery("?recovery=continue"), null);
  assert.deepEqual(["?recovery=0", "?recovery=15", "?recovery=60"].map(readRecovery), [0, 15, 60]);
});

test("a real fall hands control to recovery, keeps sensing the opponent, and replays its countdown", async () => {
  const stand = await bout({ gap: 8, capSeconds: 60, recoverySeconds: 4 });
  try {
    const { world, duel } = stand, fighter = duel.duelists.left;
    duel.order("left", STAND_ORDERS); duel.order("right", STAND_ORDERS);
    world.step(120);
    const trunk = fighter.built.segments.get("middleTrunk"), mass = [...fighter.built.segments.values()].reduce((n, p) => n + p.rigid.mass, 0);
    trunk.body.applyImpulse(new Vector3(0, 0, mass * 1.5), centreOfToRef(trunk, new Vector3()));
    while (!fighter.body.down && duel.steps < 600) world.step();
    assert.ok(fighter.body.down, "the physical shove caused a fall");
    world.step(2);
    assert.equal(fighter.body.has, "recovery: rise");
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
    assert.equal(duel.verdict?.ending, "fallen");
    assert.ok(duel.state.recovery.left >= 4);
    const expected = saveState(duel.state);
    duel.load(saved); assert.equal(run(), digest);
    assert.deepEqual(saveState(duel.state), expected);
  } finally { stand.dispose(); }
});
