import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { BODY_MODELS, modelHolding, resolveCharacter } from "../src/core/models.ts";
import { createWorld } from "../src/core/world.ts";
import { freshEngine } from "./harness/core-stand.mjs";
import { Duel } from "../src/arena/duel.ts";
import { arenaAttributes } from "../src/arena/matchup.ts";
import { loadoutAttributes, loadoutSpec } from "../src/lab/loadout.ts";
import { labAddress, labHref } from "../src/lab/scenarios.ts";
import { DungeonRun } from "../src/dungeon/run.ts";
import { attributeScope } from "../src/dungeon/run-attributes.ts";
import { classicDungeon } from "./fixtures/classic-dungeon.mjs";
import { traceOf } from "./harness/trace.mjs";

const values = value => JSON.parse(JSON.stringify(value, (_, v) => v?.unit && v?.provenance ? v.value : v));

test("configured bodies agree across Arena, Lab and Crypt and stay isolated from their opponents", async () => {
  const rendering = new NullEngine(), scene = new Scene(rendering), engine = await freshEngine();
  try {
    for (const model of BODY_MODELS) {
      const attributes = { strength: 1.2, speed: 1.1, hp: 9, balance: 5, haste: 25 };
      const world = createWorld(scene, engine), duel = new Duel(world, { left: model, right: model,
        attributes: { left: attributes, right: {} }, recoverySeconds: null });
      const map = classicDungeon(1); map.spawns = [];
      const crypt = new DungeonRun(scene, { seed: 1, engine, visuals: false, layout: map, hero: model,
        attributes: () => attributes });
      try {
        const lab = loadoutSpec({ model, attributes, balance: null, haste: null, sole: false, left: "empty", right: "empty", boots: false, armour: false });
        assert.deepEqual(values(duel.duelists.left.built.spec), values(lab));
        assert.deepEqual(values(crypt.hero.character.spec), values(lab));
        assert.equal(duel.duelists.left.pool.total, 9);
        assert.equal(crypt.hero.fighter.pool.total, 9);
        assert.equal(duel.duelists.right.pool.total, resolveCharacter({ model }).spec.wounds.hp.value);
        assert.ok(duel.duelists.left.body.assist.on);
        assert.equal(duel.duelists.right.body.assist.on, false);
        world.step(4);
        const saved = duel.save();
        assert.deepEqual(saved.recipe.attributes.left, resolveCharacter({ model, attributes }).config.attributes);
        const poses = () => { const trace = traceOf(Object.values(duel.duelists).map(d => d.built)); trace.take(); return trace.digest(); };
        world.step(4); const after = duel.save().state, pose = poses();
        duel.load(saved); world.step(4);
        assert.deepEqual(duel.save().state, after);
        assert.equal(poses(), pose);
        const otherWorld = createWorld(scene, engine), other = new Duel(otherWorld, { left: model, right: model, recoverySeconds: null });
        try { assert.throws(() => other.load(saved), /another bout/); } finally { other.dispose(); otherWorld.dispose(); }
        attributes.hp = 12;
        assert.equal(duel.recipe.attributes.left.hp, 9);
      } finally { crypt.dispose(); duel.dispose(); world.dispose(); }
    }
  } finally { scene.dispose(); rendering.dispose(); }
});

test("canonical and existing links build the same capabilities and resetting removes inherited aliases", () => {
  const legacy = arenaAttributes("?balance=0,25&haste=50,-10&left.strength=1.5&right.haste=0");
  assert.deepEqual(legacy, { left: { balance: 0, haste: 50, strength: 1.5 }, right: { balance: 25, haste: 0 } });
  const address = labAddress("?play=lab&scenario=stance&balance=25&haste=50&body.balance=0&body.strength=1.5");
  const rebuilt = labAddress(labHref(address));
  assert.deepEqual(loadoutAttributes(rebuilt), { balance: 0, haste: 50, strength: 1.5 });
  assert.deepEqual(values(loadoutSpec(address)), values(loadoutSpec(rebuilt)));
  const reset = labAddress(labHref({ ...address, balance: null, haste: null, attributes: {} }, labHref(address)));
  assert.deepEqual(loadoutAttributes(reset), {});
  assert.equal(attributeScope({ id: "hero", side: "party", model: "workshop-fighter" }), "hero");
  assert.equal(attributeScope({ id: "ally-0", side: "party", model: "workshop-fighter" }), "ally-0");
  assert.equal(attributeScope({ id: "enemy-5", side: "enemy", model: "reptile" }), "enemy.reptile");
});

test("equipped court recipes retain attributes in construction, compatibility and recording identity", async () => {
  const rendering = new NullEngine(), scene = new Scene(rendering), engine = await freshEngine();
  const worlds = [], bouts = [];
  const recipe = { left: "workshop-fighter", right: "workshop-rogue", level: "obstacle-court",
    loadouts: { left: { left: "buckler", right: "sword" }, right: { left: "club", right: "empty" } },
    attributes: { left: { strength: 1.3, speed: 1.1, hp: 9, balance: 5, haste: 25 }, right: {} } };
  const make = recipe => {
    const world = createWorld(scene, engine); worlds.push(world);
    const bout = new Duel(world, recipe); bouts.push(bout); return bout;
  };
  try {
    const bout = make(recipe), spec = bout.duelists.left.built.spec;
    const lab = loadoutSpec({ model: recipe.left, ...recipe.loadouts.left, attributes: recipe.attributes.left, sole: false });
    assert.deepEqual(values(spec), values(lab));
    assert.deepEqual(values(spec), values(modelHolding(recipe.left, recipe.loadouts.left, recipe.attributes.left)));
    assert.equal(bout.duelists.left.pool.total, 9);
    const explicit = make({ ...recipe, attributes: bout.recipe.attributes });
    assert.deepEqual(explicit.recording.identity, bout.recording.identity);
    assert.doesNotThrow(() => explicit.playRecording(bout.recording));
    const changed = make({ ...recipe, attributes: { ...recipe.attributes, left: { ...recipe.attributes.left, strength: 1.4 } } });
    const initial = changed.save();
    assert.throws(() => changed.playRecording(bout.recording), /physical conditions/);
    assert.deepEqual(changed.save(), initial);
  } finally {
    bouts.forEach(bout => bout.dispose()); worlds.forEach(world => world.dispose()); scene.dispose(); rendering.dispose();
  }
});
