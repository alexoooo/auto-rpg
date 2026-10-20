/** Minds receive the same detached boxes that the Crypt physically builds and removes. */
import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { createWorld } from "../src/core/world.ts";
import { enlist } from "../src/core/combatant.ts";
import { createSenses } from "../src/core/mind/senses.ts";
import { modelSpec } from "../src/core/models.ts";
import { RECIPE_FIGHTER } from "../src/core/mind/config.ts";
import { rulebook } from "../src/core/rules/rulebook.ts";
import { buildDungeonWorld } from "../src/dungeon/world.ts";
import { freshEngine } from "./harness/core-stand.mjs";

const mapOf = open => ({ seed: 1, size: 9, floor: new Uint8Array(81).map((_, i) => i % 9 > 0 && i % 9 < 8 && Math.floor(i / 9) > 0 && Math.floor(i / 9) < 8 ? 1 : 0),
  rooms: [], doors: [{ id: 0, point: { x: 4, z: 4 }, axis: "x", open }], start: { x: 2, z: 2 }, exit: { x: 6, z: 6 }, spawns: [],
  obstacles: [{ id: "column", x: 6, z: 2, width: .8, depth: .8, height: 2.65, blocksSight: true }] });

test("a solid provider refreshes the shared collider snapshot when a physical door opens", async () => {
  const engine = new NullEngine(), scene = new Scene(engine), world = createWorld(scene, await freshEngine());
  const built = [], removed = [];
  const physics = Object.create(world.physics, { addFixedBox: { value(centre, size, turn) {
    built.push({ centre: [...centre], size: [...size], turn });
    const collider = world.physics.addFixedBox(centre, size, turn);
    return { id: collider.id, dispose() { removed.push(collider.id); collider.dispose(); } };
  } } });
  const level = buildDungeonWorld(scene, mapOf(false), false, physics), hub = createSenses(world);
  const fighter = enlist(world, { id: "hero", side: "party", spec: modelSpec("workshop-fighter"), at: [2, 0, 2],
    rules: rulebook("dungeon"), senses: hub, out: () => false, mind: RECIPE_FIGHTER, solids: () => level.sensedSolids, name: "solid grant", orders: () => null });
  try {
    assert.deepEqual(level.sensedSolids.map(solid => ({ centre: [...solid.centre], size: [...solid.size], turn: undefined })), built);
    const before = fighter.senses().solids;
    assert.deepEqual(before, level.solids.map(solid => ({ ...solid, kind: "box" })));
    assert.ok(before.some(solid => solid.name === "door.0"));
    assert.ok(Object.isFrozen(before) && before.every(solid => Object.isFrozen(solid) && Object.isFrozen(solid.centre) && Object.isFrozen(solid.size)));
    level.openNearby([{ x: 4, z: 4 }]);
    assert.equal(removed.length, 1, "the physical door is removed");
    assert.notEqual(fighter.senses().solids, before);
    assert.deepEqual(fighter.senses().solids, before.filter(solid => solid.name !== "door.0"));
    assert.ok(before.some(solid => solid.name === "door.0"), "an observation already handed out remains immutable");
  } finally { fighter.body.dispose(); fighter.built.dispose(); hub.dispose(); level.dispose(); world.dispose(); scene.dispose(); engine.dispose(); }
});

test("a door that begins open has neither a collider nor a sensed obstruction", async () => {
  const engine = new NullEngine(), scene = new Scene(engine), world = createWorld(scene, await freshEngine());
  const level = buildDungeonWorld(scene, mapOf(true), false, world.physics);
  try { assert.ok(level.solids.every(solid => solid.name !== "door.0")); assert.deepEqual(level.sensedSolids, level.solids.map(solid => ({ ...solid, kind: "box" }))); }
  finally { level.dispose(); world.dispose(); scene.dispose(); engine.dispose(); }
});
