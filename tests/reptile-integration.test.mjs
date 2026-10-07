import test from "node:test";
import assert from "node:assert/strict";
import { BODY_MODELS, modelHolds, modelInfo, modelSpec, modelSupportsMind } from "../src/core/models.ts";
import { MODEL_DISPLAY } from "../src/render/models.ts";
import { KICKER, RECIPE_FIGHTER, QUADRUPED } from "../src/core/mind/config.ts";
import { generateCryptDungeon } from "../src/dungeon/crypt-dungeon.ts";
import { generateEncounterLevel, outsidePartyStart } from "../src/dungeon/encounters.ts";
import { distance, findPath, walkable } from "../src/dungeon/map.ts";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { createWorld } from "../src/core/world.ts";
import { freshEngine } from "./harness/core-stand.mjs";
import { Duel } from "../src/arena/duel.ts";
import { controlsFor, readControls, readHeld, readMinds } from "../src/arena/matchup.ts";
import { companionSpawn } from "../src/dungeon/party-placement.ts";
import { cryptModel } from "../src/dungeon/actors.ts";
import { DungeonRun, runMap, runModels } from "../src/dungeon/run.ts";

test("registered models declare compatible default minds and equipment", () => {
  assert.deepEqual(BODY_MODELS, ["workshop-fighter", "workshop-rogue", "crypt-skeleton", "reptile"]);
  for (const model of BODY_MODELS) {
    const info = modelInfo(model);
    assert.ok(Object.isFrozen(info));
    assert.equal(modelSpec(model).model, model);
    assert.equal(modelSupportsMind(model, info.mind), true);
    assert.equal(modelSupportsMind(model, QUADRUPED), model === "reptile");
    assert.equal(modelSupportsMind(model, RECIPE_FIGHTER), model !== "reptile");
    assert.equal(modelSupportsMind(model, KICKER), model !== "reptile");
    assert.equal(modelSupportsMind(model, { kind: "direct", targets: {}, seconds: .1, speed: 1, activation: 1 }), true);
    assert.equal(info.held, model === "reptile" ? "empty" : "club");
    assert.equal(modelHolds(model), model !== "reptile");
    assert.equal(cryptModel(model).fallEndsFight, model !== "reptile");
    assert.equal(MODEL_DISPLAY[model].clothing, model === "workshop-fighter" || model === "workshop-rogue");
  }
});

test("arena links retain compatible choices and reject invalid recipes before building bodies", async () => {
  const query = "?matchup=reptile,workshop-fighter&control=kicker&held=club&guard=pose";
  assert.deepEqual(controlsFor("reptile"), ["crawl"]);
  assert.deepEqual(readControls(query), { left: "crawl", right: "kicker" });
  assert.deepEqual(readHeld(query), { left: "empty", right: "club" });
  assert.deepEqual(readMinds(query), { left: QUADRUPED, right: KICKER });
  const scene = new Scene(new NullEngine()), world = createWorld(scene, await freshEngine("rapier-coordinate"));
  try {
    const before = world.physics.save(), nodes = scene.transformNodes.length;
    const recipe = { left: "workshop-fighter", right: "reptile" };
    assert.throws(() => new Duel(world, { ...recipe, held: { left: "club", right: "club" } }), /cannot hold a club/);
    assert.throws(() => new Duel(world, { ...recipe, minds: { left: RECIPE_FIGHTER, right: KICKER } }), /incompatible controller for reptile/);
    assert.deepEqual(world.physics.save(), before);
    assert.equal(scene.transformNodes.length, nodes);
    world.physics.addFixedBox([0, -.5, 0], [40, 1, 40]);
    const duel = new Duel(world, recipe);
    try {
      assert.equal(duel.duelists.right.minded.kind, "quadruped");
      assert.equal(duel.duelists.right.built.spec.held, undefined);
      world.step(120);
      assert.equal(duel.duelists.right.body.down, false);
    } finally { duel.dispose(); }
  } finally { world.dispose(); scene.dispose(); }
});

test("a crypt run fields exactly the models its page loads skins for, each once", async () => {
  const fielded = [];
  for (const seed of [0, 1, 2]) {
    const options = { seed, hero: "workshop-rogue", companions: ["crypt-skeleton"] };
    const map = runMap(options), models = runModels(map, options);
    assert.deepEqual(map, generateEncounterLevel(seed).map);
    const scene = new Scene(new NullEngine());
    const run = new DungeonRun(scene, { ...options, engine: await freshEngine(), visuals: false, layout: map });
    try {
      assert.deepEqual([...models].sort(), [...new Set(run.actors.map(actor => actor.model))].sort(), `seed ${seed}`);
      assert.equal(models.length, new Set(models).size);
      fielded.push(...models);
    } finally { run.dispose(); scene.dispose(); }
  }
  assert.deepEqual([...new Set(fielded)].sort(), ["crypt-skeleton", "reptile", "workshop-rogue"]);
});

test("generated layouts place reachable, separated three-reptile packs across seeds", () => {
  for (let seed = 0; seed < 24; seed++) for (const make of [s => generateCryptDungeon(s).map, s => generateEncounterLevel(s).map]) {
    const map = make(seed), again = make(seed);
    assert.deepEqual(map, again, `seed ${seed} is reproducible`);
    assert.deepEqual(map.spawns, map.encounters.map(encounter => encounter.point));
    const radius = cryptModel("reptile").radius, placed = [{ ...map.start, radius }];
    for (let index = 0; index < 2; index++) {
      const at = companionSpawn(map, placed, radius);
      if (!at) break;
      assert.ok(walkable(map, at, radius, true));
      assert.ok(placed.every(other => distance(other, at) >= radius + other.radius));
      placed.push({ ...at, radius });
    }
    assert.ok(map.encounters.some(encounter => encounter.model === "crypt-skeleton"));
    const rooms = new Map();
    for (const encounter of map.encounters) {
      const radius = cryptModel(encounter.model).radius;
      assert.ok(walkable(map, encounter.point, radius), `seed ${seed}: collider clearance`);
      assert.ok(findPath(map, map.start, encounter.point, radius).length, `seed ${seed}: route reaches encounter`);
      if (encounter.model !== "reptile") continue;
      assert.ok(outsidePartyStart(map, encounter.point), `seed ${seed}: pack outside initial party sight`);
      assert.ok(walkable(map, encounter.point, radius, true), `seed ${seed}: pack clears closed doors`);
      assert.ok(map.doors.every(door => distance(encounter.point, door.point) >= radius + 1));
      const room = map.rooms.find(room => room.id === encounter.room);
      assert.ok(room && encounter.point.x >= room.min.x && encounter.point.x <= room.max.x
        && encounter.point.z >= room.min.z && encounter.point.z <= room.max.z);
      if (!rooms.has(encounter.room)) rooms.set(encounter.room, []);
      rooms.get(encounter.room).push(encounter);
    }
    assert.ok(rooms.size > 0, `seed ${seed}: reptile rooms exist`);
    for (const pack of rooms.values()) {
      assert.equal(pack.length, 3);
      for (let a = 0; a < pack.length; a++) for (let b = a + 1; b < pack.length; b++)
        assert.ok(distance(pack[a].point, pack[b].point) >= Math.max(2, 2 * cryptModel("reptile").radius));
    }
  }
});
