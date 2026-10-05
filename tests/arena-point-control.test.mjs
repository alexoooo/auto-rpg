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
import { FIGHTER, POINT_FIGHTER } from "../src/core/mind/config.ts";
import { STAND_ORDERS } from "../src/core/mind/orders.ts";
import { saveState } from "../src/core/state.ts";
import { createWorld } from "../src/core/world.ts";
import { traceOf } from "./harness/trace.mjs";
import { freshEngine } from "./harness/core-stand.mjs";

async function bout(overrides = {}) {
  const engine = new NullEngine(), scene = new Scene(engine), world = createWorld(scene, await freshEngine());
  addArenaSolids(world.physics);
  const duel = new Duel(world, { left: "workshop-fighter", right: "workshop-rogue", capSeconds: 20,
    held: { left: "empty", right: "empty" }, minds: { left: POINT_FIGHTER, right: FIGHTER }, recoverySeconds: 15, ...overrides });
  return { world, duel, dispose() { duel.dispose(); world.dispose(); scene.dispose(); engine.dispose(); } };
}

test("controller and recovery links preserve independent choices and classic guard settings", () => {
  assert.deepEqual(readControls(""), { left: "classic", right: "classic" });
  assert.deepEqual(readControls("?control=unknown,point-left"), { left: "classic", right: "point-left" });
  assert.deepEqual(readMinds("?control=point-alternate,classic&guard=cover"), {
    left: { ...POINT_FIGHTER, hand: "alternate" }, right: { ...FIGHTER, guard: "cover" },
  });
  assert.deepEqual(readMinds("?control=point-right"), { left: POINT_FIGHTER, right: POINT_FIGHTER });
  assert.deepEqual(["", "?recovery=", "?recovery=-1", "?recovery=Infinity", "?recovery=61"].map(readRecovery), Array(5).fill(undefined));
  assert.deepEqual(["?recovery=0", "?recovery=15", "?recovery=60"].map(readRecovery), [0, 15, 60]);
});

test("a point fighter approaches, attacks with either hand, and wounds through arena contacts", async () => {
  const stand = await bout({ minds: { left: { ...POINT_FIGHTER, hand: "alternate" }, right: FIGHTER } });
  try {
    const { world, duel } = stand, fighter = duel.duelists.left, phases = new Set(), paths = new Set();
    while (!duel.verdict) {
      world.step();
      phases.add(fighter.minded.skills.report.strike.phase);
      for (const hand of ["left", "right"]) {
        const goal = fighter.minded.state.command.hands[hand];
        if (goal?.initialVelocity?.some(v => v !== 0)) paths.add(hand);
      }
    }
    assert.deepEqual(paths, new Set(["left", "right"]), "both hands execute measured-velocity point trajectories");
    for (const phase of ["approach", "place", "settle", "swing"]) assert.ok(phases.has(phase), phase);
    for (const hand of ["left", "right"]) assert.ok(fighter.minded.skills.report.strike.thrown[hand] > 0, hand);
    assert.ok(duel.blows.some(b => b.sides[0].segment.startsWith("hand.") && b.sides[1].damage > 0));
    assert.ok(duel.duelists.right.pool.bar() < 1);
  } finally { stand.dispose(); }
});

test("a club point trajectory survives a fork in mid-swing with the whole bout state", async () => {
  const recipe = { held: { left: "club", right: "club" } };
  const stand = await bout(recipe), twin = await bout(recipe);
  try {
    const { world, duel } = stand;
    while (duel.steps < 2000 && duel.duelists.left.minded.skills.report.strike.phase !== "swing") world.step();
    assert.equal(duel.duelists.left.minded.skills.report.strike.phase, "swing");
    const goal = duel.duelists.left.minded.state.command.hands.right;
    assert.ok(goal.initialVelocity && goal.places[0].point !== "knuckles", "the item point owns the trajectory");
    const saved = duel.save();
    twin.duel.load(saved);
    const trace = traceOf(Object.values(duel.duelists).map(d => d.built)), other = traceOf(Object.values(twin.duel.duelists).map(d => d.built));
    for (let i = 0; i < 900; i++) { world.step(); twin.world.step(); trace.take(); other.take(); }
    assert.deepEqual(saveState(duel.state), saveState(twin.duel.state));
    assert.equal(trace.digest(), other.digest(), "every segment pose agrees at every step");
    assert.ok(duel.duelists.left.minded.skills.report.strike.thrown.right > 0);
    assert.ok(duel.blows.some(b => b.sides[0].item === "wooden club" && b.sides[1].damage > 0));
  } finally { stand.dispose(); twin.dispose(); }
});

test("a real fall hands control to support acquisition, keeps sensing the opponent, and replays its countdown", async () => {
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
    assert.match(fighter.body.has, /support entry/);
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

test("point control obeys repeated orders to strike a static arena obstacle", async () => {
  const stand = await bout({ gap: 8 });
  try {
    const { world, duel } = stand, fighter = duel.duelists.left;
    duel.order("left", STAND_ORDERS); duel.order("right", STAND_ORDERS);
    world.step(180);
    const head = fighter.body.view.head, target = [head.x, head.y, head.z + .65];
    const obstacle = world.physics.addFixedBox([target[0], target[1], target[2] + .04], [.2, .2, .08]);
    duel.order("left", { move: null, face: null, attack: target });
    let contact = false;
    while (!duel.verdict) {
      world.step();
      contact ||= world.physics.contactsOf(fighter.built.segments.get("hand.right").body).some(c => c.fixed === obstacle.id && c.impulse > 0);
    }
    assert.ok(fighter.minded.skills.report.strike.thrown.right >= 2);
    assert.ok(contact, "the commanded point meets the actual fixed collider");
    assert.deepEqual(duel.tape.at(-1).orders.attack, target);
  } finally { stand.dispose(); }
});
