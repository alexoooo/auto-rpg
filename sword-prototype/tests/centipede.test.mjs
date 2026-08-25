import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Scene } from "@babylonjs/core/scene.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import HavokPhysics from "@babylonjs/havok";

import { attachPhysics, COLLIDES, LAYER } from "../src/physics.ts";
import { applyButtonPose, poseFromButtons, releaseButtons, PRIMARY, SECONDARY } from "../src/buttons.ts";
import { crawlerMind } from "../src/bodies/centipede.ts";
import { humanMind, splitMind } from "../src/mind.ts";
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

/**
 * The body half of `natural_bite_never_aliases_a_human_hand`.
 *
 * `tests/options.test.mjs` holds the command half -- an option that names the
 * natural effector writes `natural.thrust` and leaves both hand slots alone.
 * This is the other end of the same wire: for three sessions the creature was
 * driven entirely through `input.primary.thrust` and `input.primary.guard` on a
 * body whose published `hands` is `Object.freeze({})`, so a hand slot it does
 * not have was its whole control surface and every reader downstream carried
 * the exception.
 *
 * Both directions of both wires, because only one direction of each can fail on
 * its own: a hand button must no longer bite and the natural button must, and
 * the same for the guard, which on this body is a brake rather than a pose. The
 * guard half was claimed by this docstring and not asserted -- putting
 * `input.primary.guard` back in `Centipede.update` left the whole suite green.
 */
test("a_centipede_bites_from_the_natural_channel_and_not_from_a_hand_slot", async () => {
  const engine = new NullEngine({ renderWidth: 64, renderHeight: 64 });
  const scene = new Scene(engine);
  attachPhysics(scene, await HavokPhysics({ wasmBinary: await readFile(wasm) }));
  const materials = materialsFor(scene);
  const held = blankIntent();
  const creature = unitDefinition("centipede").build({
    scene, side: "left", origin: Vector3.Zero(), facing: 0,
    mind: { name: "held", decide: () => held }, loadout: { primary: "empty", secondary: "empty" }, materials,
  });
  const lunged = () => {
    let sawLunge = false;
    for (let frame = 0; frame < 40; frame += 1) {
      creature.update(1 / 60);
      creature.describe(creature.view.self);
      sawLunge ||= creature.view.self.naturalAttacks.bite.active;
    }
    return sawLunge;
  };

  held.primary.thrust = true; held.secondary.thrust = true;
  assert.equal(lunged(), false, "a hand button on a body with no hands commands nothing");
  held.primary.thrust = false; held.secondary.thrust = false;
  held.natural.thrust = true;
  assert.equal(lunged(), true, "the natural channel is what closes the jaws");

  // The guard, on the same terms. `Centipede.update` spends it on speed, so the
  // reading is the velocity it commands its own head at -- taken outside a
  // lunge, which overrides the walk with its own 4.8.
  held.natural.thrust = false;
  const cruise = () => {
    let speed = 0;
    for (let frame = 0; frame < 8; frame += 1) {
      creature.update(1 / 60);
      speed = creature.limbs[0].part.body.getLinearVelocity().length();
    }
    return speed;
  };
  held.forward = 1;
  held.primary.guard = true; held.secondary.guard = true;
  assert.ok(Math.abs(cruise() - 2.2) < 1e-6, `a hand guard is not this body's brake: ${cruise()}`);
  held.primary.guard = false; held.secondary.guard = false;
  held.natural.guard = true;
  assert.ok(Math.abs(cruise() - 0.7) < 1e-6, `the natural guard is: ${cruise()}`);

  creature.dispose();
  scene.dispose();
  engine.dispose();
});

/**
 * A person driving a centipede, from the buttons a person actually has.
 *
 * The test above drives `natural` by hand, which proves the *body* reads the
 * right channel and nothing about whether anything ever writes it. For a
 * session that puts somebody at the keyboard that is the half that matters:
 * `setup.ts` offers the "you" radio for either side whatever the unit, and
 * `main.ts` answers it with `splitMind(you, policyMind("crawler"))` -- so a
 * command channel a person cannot press is a body a person cannot fight with.
 *
 * Two wires, and both were broken. `Controls.state.natural` was initialised and
 * never written again, so the attack button reached no jaws; and `splitMind`
 * took `natural` from the *policy*, so even a written one would have been
 * discarded on the only path a person reaches a centipede by.
 *
 * The policy is deliberately out of its own range here -- `view.measure` is
 * infinite until `observe` runs -- so `crawlerMind` asks for nothing, and every
 * bite below is the person's.
 */
test("a_person_driving_a_centipede_bites_and_slows_from_the_same_two_buttons", async () => {
  const engine = new NullEngine({ renderWidth: 64, renderHeight: 64 });
  const scene = new Scene(engine);
  attachPhysics(scene, await HavokPhysics({ wasmBinary: await readFile(wasm) }));
  const materials = materialsFor(scene);

  // Stands in for `Controls.state`: the same `Intent`, written through the same
  // `buttons.ts` mapping the pointer listeners use, so what is exercised is the
  // rule and not a second copy of it.
  const held = blankIntent();
  held.forward = 1;
  const press = (buttons) => applyButtonPose(held, held.actingHand, poseFromButtons(buttons, 0));
  const creature = unitDefinition("centipede").build({
    scene, side: "left", origin: Vector3.Zero(), facing: 0,
    mind: splitMind(humanMind({ state: held }), crawlerMind()),
    loadout: { primary: "empty", secondary: "empty" }, materials,
  });
  const step = () => {
    creature.update(1 / 60);
    creature.describe(creature.view.self);
    return { active: creature.view.self.naturalAttacks.bite.active,
      speed: creature.limbs[0].part.body.getLinearVelocity().length() };
  };
  const over = (frames) => {
    let lunged = false; let cruise = 0;
    for (let frame = 0; frame < frames; frame += 1) {
      const reading = step();
      lunged ||= reading.active;
      if (!reading.active) cruise = reading.speed;
    }
    return { lunged, cruise };
  };

  releaseButtons(held);
  assert.equal(over(40).lunged, false,
    "nothing pressed and a policy out of its own reach is a creature that does not bite");

  press(PRIMARY);
  assert.equal(over(40).lunged, true, "the attack button reaches the jaws");

  // And the guard, which is this body's brake rather than a pose. Both
  // directions: the natural button slows it, and a *hand* button -- which this
  // body does not have -- must not, which is what `Centipede.update` reading
  // `input.primary.guard` would look like.
  releaseButtons(held);
  const open = over(40);
  assert.equal(open.lunged, false);
  assert.ok(Math.abs(open.cruise - 2.2) < 1e-6, `walking at ${open.cruise}`);

  press(SECONDARY);
  const braced = over(40);
  assert.equal(braced.lunged, false, "the guard is not an attack");
  assert.ok(Math.abs(braced.cruise - 0.7) < 1e-6, `braced at ${braced.cruise}`);

  releaseButtons(held);
  held.primary.guard = true; held.secondary.guard = true;
  assert.ok(Math.abs(over(40).cruise - 2.2) < 1e-6,
    "a hand button on a body with no hands changes nothing");

  creature.dispose();
  scene.dispose();
  engine.dispose();
});

test("zero_head_health_or_exhausted_segment_vitality_ends_the_centipede", () => {
  const definition = unitDefinition("centipede");
  assert.equal(definition.anatomy.vitalityWeights.head, 0);
  assert.equal(Object.values(definition.anatomy.vitalityWeights).reduce((a, b) => a + b, 0), 1);
});
