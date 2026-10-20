/** Shared Arena level construction and a short court replay (Node, core world, vendored Rapier, 120 Hz). */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader.js";
import "@babylonjs/loaders/glTF/2.0/glTFLoader.js";
import { LEVELS, levelDefinition, levelSpawn, spawnClearanceFaults } from "../src/arena/levels.ts";
import { arenaSolids, buildArenaWorld, ROOM_GROUPS, validateVisualColliderPairs } from "../src/arena/room.ts";
import { readLevel } from "../src/arena/matchup.ts";
import { Duel, SIDES } from "../src/arena/duel.ts";
import { createWorld } from "../src/core/world.ts";
import { sensedBounds } from "../src/core/mind/sensed-bounds.ts";
import { CRYPT_FURNITURE, CRYPT_SIGHT } from "../src/environment/furniture.ts";
import { buildBout } from "../research/bout.mjs";
import { freshEngine } from "./harness/core-stand.mjs";
import { traceOf } from "./harness/trace.mjs";

test("level identity and gap policy are explicit and immutable", () => {
  assert.deepEqual(Object.keys(LEVELS), ["open", "obstacle-court"]);
  assert.deepEqual([readLevel(""), readLevel("?level=obstacle-court"), readLevel("?level=missing")], ["open", "obstacle-court", "open"]);
  assert.throws(() => levelDefinition("missing"), /unknown Arena level/);
  assert.throws(() => { LEVELS["obstacle-court"].furniture[0].solid.centre[0] = 99; }, TypeError);
  assert.deepEqual(levelSpawn("open", "left"), { position: [-2, 0, 0], heading: 0 });
  assert.deepEqual(levelSpawn("obstacle-court", "right"), { position: [3, 0, 0], heading: 0 });
  for (const gap of [0, 3, 9, NaN, Infinity]) assert.throws(() => levelSpawn("obstacle-court", "left", gap), /invalid starting gap/);
  for (const gap of [4, 6, 8]) assert.equal(levelSpawn("obstacle-court", "left", gap).position[0], -gap / 2);
});

test("spawn admission checks actual loadout bounds instead of contact counts", () => {
  const solids = arenaSolids("obstacle-court"), column = solids.find(solid => solid.name === "court.column.0");
  assert.deepEqual(column.size, [CRYPT_FURNITURE.column[0], CRYPT_FURNITURE.column[2], CRYPT_FURNITURE.column[1]]);
  assert.equal(CRYPT_SIGHT.column, true);
  const item = { name: "left/hand.left/held", kind: "box", centre: [0, 1, 0], size: [.1, .1, 1] };
  assert.deepEqual(spawnClearanceFaults([item], solids), ["left/hand.left/held overlaps court.column.0 at spawn"]);
  assert.deepEqual(spawnClearanceFaults([{ ...item, centre: [-2, 1, 0] }], solids), []);
  const rotated = { name: "rotated", kind: "box", centre: [0, 1, 0], size: [4, 2, .5], turn: Math.PI / 2 };
  assert.deepEqual(spawnClearanceFaults([{ ...item, centre: [0, 1, 1] }], [rotated]), ["left/hand.left/held overlaps rotated at spawn"]);
  assert.deepEqual(spawnClearanceFaults([{ ...item, centre: [1, 1, 0] }], [rotated]), []);
});

test("the page builder and Node runner construct the same court and replay its equipped bout", async () => {
  const engine = new NullEngine(), scene = new Scene(engine), world = createWorld(scene, await freshEngine());
  const kit = await LoadAssetContainerAsync(new Uint8Array(readFileSync(new URL("../public/assets/crypt-kit/kit.glb", import.meta.url))), scene, { pluginExtension: ".glb" });
  kit.addAllToScene();
  const material = new StandardMaterial("fixture", scene);
  const stage = buildArenaWorld(scene, world.physics, { ground: material, wall: material, wood: material, banner: material }, undefined, ROOM_GROUPS, "obstacle-court", kit);
  const recipe = { left: "workshop-fighter", right: "workshop-rogue", level: "obstacle-court",
    loadouts: { left: { left: "empty", right: "club" }, right: { left: "empty", right: "club" } }, capSeconds: 2, recoverySeconds: null };
  const duel = new Duel(world, recipe), headless = await buildBout(recipe);
  try {
    const solids = arenaSolids(recipe.level);
    assert.equal(stage.audit().bodies, solids.length);
    assert.deepEqual(validateVisualColliderPairs(scene, stage.audit().visualColliderPairs), []);
    assert.deepEqual(stage.colliders.meshes.map(mesh => mesh.name), solids.map(solid => solid.name));
    assert.equal(stage.audit().visualColliderPairs.filter(pair => pair.collider.startsWith("court.")).length, LEVELS[recipe.level].furniture.length);
    for (const side of SIDES) {
      assert.deepEqual(duel.duelists[side].senses().solids, solids);
      const observer = duel.duelists[side === "left" ? "right" : "left"];
      assert.deepEqual(spawnClearanceFaults(sensedBounds(observer.senses().others.find(body => body.id === side)), solids), []);
    }
    const pageTrace = traceOf(SIDES.map(side => duel.duelists[side].built));
    const nodeTrace = traceOf(SIDES.map(side => headless.duel.duelists[side].built));
    for (let step = 0; step < 24; step++) { world.step(); headless.world.step(); pageTrace.take(); nodeTrace.take(); }
    assert.equal(pageTrace.digest(), nodeTrace.digest());
    const saved = duel.save();
    const continuation = () => {
      const trace = traceOf(SIDES.map(side => duel.duelists[side].built));
      for (let step = 0; step < 24; step++) { world.step(); trace.take(); }
      return { state: duel.save().state, trace: trace.digest(), blows: structuredClone(duel.blows),
        senses: SIDES.map(side => {
          const senses = duel.duelists[side].senses();
          return structuredClone({ ...senses, others: senses.others.map(({ spec: _, ...body }) => body) });
        }) };
    };
    const first = continuation();
    duel.load(saved);
    assert.deepEqual(continuation(), first, "the court's physical readings and mind state replay exactly");
    assert.throws(() => duel.load({ ...saved, recipe: { ...recipe, level: "open" } }), /another bout's recipe/);
  } finally {
    headless.dispose(); duel.dispose(); stage.dispose(); world.dispose(); scene.dispose(); engine.dispose();
  }
});
