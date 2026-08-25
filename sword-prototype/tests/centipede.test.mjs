import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Scene } from "@babylonjs/core/scene.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import HavokPhysics from "@babylonjs/havok";

import { attachPhysics, COLLIDES, LAYER } from "../src/physics.ts";
import { crawlerMind } from "../src/bodies/centipede.ts";
import { blankIntent } from "../src/policies.ts";
import { loadoutForUnit, policyForUnit, unitDefinition } from "../src/units.ts";
import { scoreHit } from "../src/scoring.ts";
import { assertCompleteView, BODY_FIELDS, HAND_FIELDS, VIEW_FIELDS } from "./fixtures/view.mjs";

const wasm = new URL("../node_modules/@babylonjs/havok/lib/esm/HavokPhysics.wasm", import.meta.url);
const materialsFor = (scene) => {
  const material = (name) => new StandardMaterial(name, scene);
  return {
    flesh: material("flesh"), cloth: material("cloth"), steel: material("steel"),
    leather: material("leather"), brass: material("brass"), hide: material("hide"),
    wood: material("wood"), arrowAccent: material("arrow-accent"),
  };
};

test("centipede_refuses_every_hand_loadout_by_name", () => {
  assert.deepEqual(loadoutForUnit("centipede", "empty", "empty"), { primary: "empty", secondary: "empty" });
  assert.throws(() => loadoutForUnit("centipede", "sword", "empty"), /centipede.*sword/);
  assert.throws(() => loadoutForUnit("centipede", "empty", "shield"), /centipede.*shield/);
  assert.equal(unitDefinition("centipede").hands, 0);
  assert.equal(policyForUnit("centipede", "crawler"), "crawler");
  assert.throws(() => policyForUnit("centipede", "duelist"), /centipede.*duelist/);
});

test("a_bite_is_a_named_natural_striker_with_its_own_damage_row", () => {
  const weak = scoreHit({ speed: 2, edgeAlignment: 1, bladeAlignment: 1, nearTip: true }, "bite");
  const committed = scoreHit({ speed: 8, edgeAlignment: 0, bladeAlignment: 1, nearTip: true }, "bite");
  assert.equal(weak.damage, 0);
  assert.equal(committed.kind, "thrust");
  assert.ok(committed.damage > 0);
});

test("centipede_builds_one_head_eight_segments_and_detaches_only_the_tailward_chain", async () => {
  const engine = new NullEngine({ renderWidth: 64, renderHeight: 64 });
  const scene = new Scene(engine);
  const havok = await HavokPhysics({ wasmBinary: await readFile(wasm) });
  attachPhysics(scene, havok);
  const materials = materialsFor(scene);
  const baseline = { meshes: scene.meshes.length, bodies: scene.getPhysicsEngine().getBodies().length,
    beforePhysics: scene.onBeforePhysicsObservable.observers.filter((row) => !row._willBeUnregistered).length };
  const creature = unitDefinition("centipede").build({
    scene, side: "left", origin: Vector3.Zero(), facing: 0,
    mind: crawlerMind(), loadout: { primary: "empty", secondary: "empty" }, materials,
  });
  assert.deepEqual(creature.limbs.map((limb) => limb.key), [
    "head", "segment1", "segment2", "segment3", "segment4",
    "segment5", "segment6", "segment7", "segment8",
  ]);
  assert.equal(creature.strikers.length, 1);
  assert.equal(creature.strikers[0].kind, "bite");
  const occlusion = creature.occlusionPoints();
  assert.equal(occlusion.length, 9);
  assert.strictEqual(creature.occlusionPoints(), occlusion,
    "room occlusion reuses its stable body-point array");
  creature.describe(creature.view.self);
  assert.deepEqual(Object.keys(creature.view.self.hands), []);
  assert.deepEqual(Object.keys(creature.view.self.naturalAttacks), ["bite"]);

  // A centipede looses nothing, and the way that goes wrong quietly is by
  // answering zero instead of the cursor it was handed: the two bodies of a bout
  // publish into **one** list, so a body that writes nothing and reports a
  // length of nothing truncates whatever the other side had already written --
  // an archer fighting a centipede would see its own arrows vanish from its
  // view. Both halves are checked: nothing written, and the cursor returned.
  const shared = ["a shaft the other body already published"];
  assert.equal(creature.publishProjectiles(shared, 1, "opponent"), 1,
    "a body with nothing to loose hands the cursor straight back");
  assert.deepEqual(shared, ["a shaft the other body already published"]);
  assert.deepEqual(creature.view.projectiles, [],
    "and its own view starts with nothing in the air");

  const headStart = creature.limbs[0].part.mesh.position.clone();
  for (let frame = 0; frame < 12; frame += 1) {
    creature.update(1 / 60);
    scene._advancePhysicsEngineStep(1000 / 60);
  }
  assert.ok(Vector3.Distance(headStart, creature.limbs[0].part.mesh.position) > 0.01,
    "the animated head follows its commanded Havok velocity");

  creature.sever(creature.limbs[3], new Vector3(1, 0, 0));
  assert.deepEqual(creature.limbs.map((limb) => limb.severed), [false, false, false, true, true, true, true, true, true]);
  for (const limb of creature.limbs.slice(3)) {
    assert.equal(limb.part.shape.filterMembershipMask, LAYER.DEBRIS);
    assert.equal(limb.part.shape.filterCollideMask, COLLIDES.DEBRIS);
  }
  creature.limbs[0].health = 0;
  assert.equal(creature.vitality, 0, "zero head health is immediately fatal");
  assert.equal(creature.alive, false, "fatal damage ends the body on the scoring edge");
  assert.doesNotThrow(() => creature.dispose(),
    "severed constraints are removed before whole-body disposal");
  assert.deepEqual({ meshes: scene.meshes.length, bodies: scene.getPhysicsEngine().getBodies().length,
    beforePhysics: scene.onBeforePhysicsObservable.observers.filter((row) => !row._willBeUnregistered).length }, baseline,
  "centipede disposal returns every segment body, costume and observer to baseline");
  scene.dispose();
  engine.dispose();
});

/**
 * The centipede's hand-rolled view records, against the real contract.
 *
 * `blankBody`, `blankHand` and the `view` literal in `src/bodies/centipede.ts`
 * are a **second** hand-maintained copy of the view shape, and the cross-check
 * that keeps the test fixtures honest --
 * `a_hand_rolled_fixture_carries_every_field_a_real_view_does` -- reads
 * `Object.keys` off a real `Fighter` and so has never looked at this one. A
 * field added to `mind.ts` and to `Fighter` therefore lands here as `undefined`
 * on a body that publishes it, which is the quiet half of exactly the failure
 * session 16 spent a day on.
 *
 * Both halves are checked. The blanks as constructed, before anything has
 * described into them, because that is the copy; and then a real observe against
 * a real warrior, because a `Fighter` writing into a centipede's opponent record
 * is the other direction the two can drift in.
 */
test("a_centipede_publishes_the_same_record_shape_a_fighter_does", async () => {
  const engine = new NullEngine({ renderWidth: 64, renderHeight: 64 });
  const scene = new Scene(engine);
  attachPhysics(scene, await HavokPhysics({ wasmBinary: await readFile(wasm) }));
  const materials = materialsFor(scene);
  const creature = unitDefinition("centipede").build({
    scene, side: "left", origin: Vector3.Zero(), facing: 0,
    mind: crawlerMind(), loadout: { primary: "empty", secondary: "empty" }, materials,
  });
  const warrior = unitDefinition("warrior").build({
    scene, side: "right", origin: new Vector3(0, 0, 2.4), facing: Math.PI,
    mind: { name: "still", decide: () => blankIntent() },
    loadout: { primary: "sword", secondary: "empty" }, materials,
  });

  const shapes = (view, when) => {
    assert.deepEqual(Object.keys(view).sort(), [...VIEW_FIELDS], `FighterView (${when})`);
    for (const side of ["self", "opponent"]) {
      assert.deepEqual(Object.keys(view[side]).sort(), [...BODY_FIELDS], `BodyView (${when} ${side})`);
      for (const name of Object.keys(view[side].hands)) {
        assert.deepEqual(Object.keys(view[side].hands[name]).sort(), [...HAND_FIELDS],
          `HandView (${when} ${side}.${name})`);
      }
    }
  };
  // A creature has no hands of its own and publishes none; the opponent record
  // it hands a warrior is where `blankHand` lives, and it is a full pair.
  shapes(creature.view, "as built");
  assert.deepEqual(Object.keys(creature.view.self.hands), []);
  assert.deepEqual(Object.keys(creature.view.opponent.hands).sort(), ["primary", "secondary"]);

  creature.observe(warrior, 0.5);
  warrior.observe(creature, 0.5);
  shapes(creature.view, "after an observe");
  shapes(warrior.view, "the warrior's own");
  // And the values are a view rather than merely the right set of keys.
  assertCompleteView(creature.view, "centipede view");
  assertCompleteView(warrior.view, "warrior view");
  assert.equal(creature.view.opponent.hands.primary.weapon, "sword",
    "the warrior really described itself into the creature's record");

  creature.dispose();
  warrior.dispose();
  scene.dispose();
  engine.dispose();
});

test("zero_head_health_or_exhausted_segment_vitality_ends_the_centipede", () => {
  const definition = unitDefinition("centipede");
  assert.equal(definition.anatomy.vitalityWeights.head, 0);
  assert.equal(Object.values(definition.anatomy.vitalityWeights).reduce((a, b) => a + b, 0), 1);
});
