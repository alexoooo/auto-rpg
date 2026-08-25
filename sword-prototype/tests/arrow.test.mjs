import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate.js";
import { PhysicsShapeType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";
import HavokPhysics from "@babylonjs/havok";

import { CONFIG } from "../src/config.ts";
import { attachPhysics, COLLIDES, LAYER, layersFor } from "../src/physics.ts";
import { Quiver } from "../src/arrow.ts";
import { Fighter } from "../src/fighter.ts";
import { Combat } from "../src/combat.ts";
import { blankIntent } from "../src/policies.ts";

/**
 * The arrows, against a real solver.
 *
 * Every claim here is about what native Havok bodies do when they are parked,
 * teleported and re-layered, so none of it can be argued with in the pure half.
 * The wasm has to be handed over as bytes: its emscripten glue calls `fetch()`
 * and Node cannot fetch a `file://` URL.
 *
 * The first test is the master plan's acceptance check for this session, written
 * down: *"An arrow flies, sticks, and is collected; `scene.meshes` flat across a
 * hundred shots."*
 */

const wasm = new URL("../node_modules/@babylonjs/havok/lib/esm/HavokPhysics.wasm", import.meta.url);
const FIXED = 1 / CONFIG.world.physicsHz;
const FRAME = 1000 / 60;

async function world() {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  attachPhysics(scene, await HavokPhysics({ wasmBinary: await readFile(wasm) }));
  scene.getPhysicsEngine().setSubTimeStep(1000 / CONFIG.world.physicsHz);

  const mat = (name) => new StandardMaterial(name, scene);
  const materials = {
    flesh: mat("flesh"), cloth: mat("cloth"), steel: mat("steel"),
    leather: mat("leather"), brass: mat("brass"), hide: mat("hide"),
    wood: mat("wood"), arrowAccent: mat("arrow-accent"),
  };

  const ground = MeshBuilder.CreateBox("ground", { width: 60, height: 0.4, depth: 60 }, scene);
  ground.position.set(0, -0.2, 0);
  const ga = new PhysicsAggregate(ground, PhysicsShapeType.BOX, { mass: 0 }, scene);
  ga.shape.filterMembershipMask = LAYER.WORLD;
  ga.shape.filterCollideMask = COLLIDES.WORLD;

  const frames = (n) => {
    for (let i = 0; i < n; i += 1) {
      scene._renderId += 1;
      scene._advancePhysicsEngineStep(FRAME);
    }
  };

  /**
   * A quiver driven the way the arena drives one: `step` once per solver
   * substep, from `onBeforePhysicsObservable`, and a loose queued so that it
   * happens inside a control step rather than between two of them.
   *
   * Driving it from outside the observable instead is not a simplification, it
   * is a different program: the one-frame teleport request that `loose` puts up
   * would stay up for the whole run, so nothing here would be testing what the
   * arena does.
   */
  const driver = (quiver) => {
    let pending = null;
    let watching = null;
    let flown = 0;
    let after = 0;
    let landed = null;
    scene.onBeforePhysicsObservable.add(() => {
      quiver.step(FIXED);
      if (watching) {
        flown += 1;
        if (flown === after) {
          landed = watching.root.position.z;
          watching = null;
        }
      }
      if (pending) {
        quiver.loose(pending.from, pending.along, pending.speed);
        watching = quiver.arrows.find((a) => a.live && a.age === 0) ?? null;
        flown = 0;
        pending = null;
      }
    });
    return {
      fire(from, along, speed) {
        pending = { from, along, speed };
      },
      /**
       * Where the arrow was after exactly `steps` **solver substeps** of flight.
       *
       * Substeps, not frames, and that is the difference between a sharp
       * assertion and a flaky one. Babylon's accumulator divides a 16.667 ms
       * frame by a 4.167 ms substep, which is four in real arithmetic and four
       * or five in floating point -- so "twelve frames of flight" is 48 or 49
       * substeps depending on the accumulator's phase, and at 45 m/s one substep
       * is 187 mm. Counting the substeps takes the harness's own drift out of
       * the reading entirely.
       */
      trackFor(steps) {
        after = steps;
        landed = null;
      },
      get landed() {
        return landed;
      },
    };
  };

  return { engine, scene, materials, frames, driver };
}

/** Bodies the engine is actually stepping, which is what a leak shows up in. */
const bodyCount = (scene) => scene.getPhysicsEngine().getBodies().length;

test("a parked arrow has no visible trace", async () => {
  const { scene, materials } = await world();
  const layers = layersFor("left");
  const quiver = new Quiver(
    scene,
    { name: "q", layer: layers.arrow, collidesWith: layers.arrowCollides },
    materials,
  );
  const arrow = quiver.arrows[0];

  assert.equal(arrow.traceRoot.isEnabled(), false, "the parked visual root is disabled");
  assert.equal(arrow.trail.isEnabled(), false, "so its tube contributes no draw call");
  assert.equal(scene.getMeshByName("q.0.head").material.name, materials.arrowAccent.name);
  assert.equal(scene.getMeshByName("q.0.fletch").material.name, materials.arrowAccent.name);
  assert.equal(arrow.trail.material.name, materials.arrowAccent.name, "all three highlights share the accent");
  assert.ok(arrow.trail.getTotalVertices() > 0, "the pooled tube starts with a real vertex buffer");
  arrow.tracePoints[0].set(1, 2, 3);
  arrow.park();
  assert.ok(
    arrow.tracePoints.every((point) => Vector3.DistanceSquared(point, arrow.root.position) === 0),
    "and stale flight history is collapsed at the park",
  );
});

/**
 * The two ways of asking where the head is, asked of the same shaft.
 *
 * `tipPosition()` is what `Combat` reads at a contact and `tipPositionToRef` is
 * what a view publishes 240 times a second; they were two copies of one formula,
 * and they disagreed. A shaft with no `rotationQuaternion` -- which is how a
 * `TransformNode` starts out, before anything has posed it -- got the half-shaft
 * offset from the first and no offset at all from the second, 360 mm apart on a
 * 720 mm arrow. One formula now, in `bladeDirectionToRef`, and this is the check
 * that keeps it one.
 */
test("both_arrow_tip_readers_answer_the_same_point", async () => {
  const { scene, materials, frames, driver } = await world();
  const layers = layersFor("left");
  const quiver = new Quiver(scene, { name: "q", layer: layers.arrow, collidesWith: layers.arrowCollides }, materials);
  const arrow = quiver.arrows[0];
  const ref = new Vector3();

  // Unposed first, which is the case the two disagreed on.
  arrow.root.rotationQuaternion = null;
  arrow.root.position.set(1, 2, 3);
  assert.equal(Vector3.Distance(arrow.tipPositionToRef(ref), arrow.tipPosition()), 0,
    "a shaft with no rotation still has a head half a length ahead of its centre");

  // And in flight, where the quaternion is whatever the solver last wrote.
  driver(quiver).fire(new Vector3(0, 1.4, 0), new Vector3(0, 0.3, 1).normalize(), CONFIG.arrow.speedMax);
  frames(6);
  const flying = quiver.arrows.find((shaft) => shaft.live && !shaft.spent);
  assert.ok(flying, "a shaft is up");
  assert.ok(Vector3.Distance(flying.tipPositionToRef(ref), flying.tipPosition()) < 1e-12,
    "and the two readers agree about a shaft that is actually pointing somewhere");
  assert.ok(Vector3.Distance(flying.tipPositionToRef(ref), flying.root.position) > CONFIG.arrow.length / 2 - 1e-9,
    "the head is a half-length out, so this is not two readers agreeing on the centre");
});

test("loosing restarts one pooled trace from the nock", async () => {
  const { scene, materials, frames, driver } = await world();
  const layers = layersFor("left");
  const quiver = new Quiver(
    scene,
    { name: "q", layer: layers.arrow, collidesWith: layers.arrowCollides },
    materials,
  );
  const bow = driver(quiver);
  const arrow = quiver.arrows[0];
  const trail = arrow.trail;
  const nock = new Vector3(0, 4, -8);

  arrow.loose(nock, new Vector3(0, 0, 1), 45);
  assert.equal(arrow.trail, trail, "loose reuses the constructor-built tube");
  assert.equal(arrow.traceRoot.isEnabled(), true);
  assert.ok(
    arrow.tracePoints.every((point) => Vector3.DistanceSquared(point, nock) < 1e-12),
    "the whole history restarts at this shot's nock",
  );

  // Enter through the quiver's queued seam before measuring flight. Calling
  // `loose` between solver steps is useful for the reset assertion above but
  // deliberately violates the one-step teleport ordering the arena provides.
  arrow.park();
  frames(1);
  bow.fire(nock, new Vector3(0, 0, 1), 45);
  frames(8);
  const traceSpan = Vector3.Distance(arrow.tracePoints[0], arrow.tracePoints.at(-1));
  assert.ok(traceSpan > 1, `then the same tube records a readable span of flight: ${traceSpan}`);
  arrow.park();
  arrow.loose(new Vector3(3, 5, -2), new Vector3(0, 0, 1), 30);
  assert.equal(arrow.trail, trail, "recycling still creates no replacement mesh");
  assert.ok(
    arrow.tracePoints.every((point) => Vector3.DistanceSquared(point, new Vector3(3, 5, -2)) < 1e-12),
    "and no point from the previous flight survives",
  );
});

test("a struck arrow fades its trace and is collected", async () => {
  const { scene, materials, frames, driver } = await world();
  const layers = layersFor("left");
  const quiver = new Quiver(
    scene,
    { name: "q", layer: layers.arrow, collidesWith: layers.arrowCollides },
    materials,
  );
  const bow = driver(quiver);
  const arrow = quiver.arrows[0];

  bow.fire(new Vector3(0, 2, -4), new Vector3(0, -0.5, 1).normalize(), 30);
  for (let i = 0; i < 120 && !arrow.struck; i += 1) frames(1);
  assert.equal(arrow.struck, true, "the shot reached the floor");
  const atImpact = arrow.trail.visibility;
  frames(Math.ceil(CONFIG.arrow.visual.fadeSeconds * 30));
  assert.ok(arrow.trail.visibility < atImpact, "the trace fades after impact");
  frames(Math.ceil(CONFIG.arrow.visual.fadeSeconds * 60) + 2);
  assert.equal(arrow.traceRoot.isEnabled(), false, "the spent trace stops drawing after its fade");
  assert.equal(arrow.live, true, "while the planted arrow remains readable on the floor");

  frames(Math.round((CONFIG.arrow.stickSeconds + 1) * 60));
  assert.equal(arrow.live, false, "and normal collection still parks the arrow");
});

test("a hundred traced shots create no mesh body or observer growth", async () => {
  const { scene, materials, frames, driver } = await world();
  const layers = layersFor("left");
  const quiver = new Quiver(
    scene,
    { name: "q", layer: layers.arrow, collidesWith: layers.arrowCollides },
    materials,
  );
  const bow = driver(quiver);
  const meshes = scene.meshes.length;
  const bodies = bodyCount(scene);
  const observers = scene.onBeforeRenderObservable.observers.length;
  const materialCount = scene.materials.length;
  const textureCount = scene.textures.length;

  for (let shot = 0; shot < 100; shot += 1) {
    bow.fire(new Vector3(0, 4, -8), new Vector3(0, 0, 1), 45);
    frames(6);
  }

  assert.equal(scene.meshes.length, meshes);
  assert.equal(bodyCount(scene), bodies);
  assert.equal(scene.onBeforeRenderObservable.observers.length, observers);
  assert.equal(scene.materials.length, materialCount);
  assert.equal(scene.textures.length, textureCount);
});

test("arrow highlighting does not change flight or arrival speed", async () => {
  const origin = new Vector3(0, 4, -8);
  const along = new Vector3(0, 0, 1);
  const fly = async (visible) => {
    const { scene, materials, frames, driver } = await world();
    const layers = layersFor("left");
    const quiver = new Quiver(
      scene,
      { name: "q", layer: layers.arrow, collidesWith: layers.arrowCollides },
      materials,
    );
    const bow = driver(quiver);
    bow.trackFor(48);
    bow.fire(origin, along, 45);
    frames(1);
    const arrow = quiver.arrows.find((candidate) => candidate.live);
    assert.ok(arrow, "the queued shot was loosed");
    if (!visible) arrow.traceRoot.setEnabled(false);
    frames(13);
    return {
      position: arrow.root.position.clone(),
      arrival: arrow.velocityAt(arrow.root.position).clone(),
    };
  };

  const visible = await fly(true);
  const hidden = await fly(false);

  assert.deepEqual(hidden.position.asArray(), visible.position.asArray());
  assert.deepEqual(hidden.arrival.asArray(), visible.arrival.asArray());
});

test("a quiver builds every arrow up front and creates nothing across a hundred shots", async () => {
  const { scene, materials, frames, driver } = await world();
  const layers = layersFor("left");
  const quiver = new Quiver(
    scene,
    { name: "q", layer: layers.arrow, collidesWith: layers.arrowCollides },
    materials,
  );
  const bow = driver(quiver);

  const meshesAfterBuild = scene.meshes.length;
  const bodiesAfterBuild = bodyCount(scene);
  const materialsAfterBuild = scene.materials.length;
  const texturesAfterBuild = scene.textures.length;
  assert.equal(quiver.arrows.length, CONFIG.arrow.count);
  assert.equal(quiver.flying, 0, "and none of them starts in the world");

  for (let shot = 0; shot < 100; shot += 1) {
    bow.fire(new Vector3(0, 4, -8), new Vector3(0, 0, 1), 45);
    frames(6);
  }

  assert.equal(scene.meshes.length, meshesAfterBuild, "scene.meshes is flat across a hundred shots");
  assert.equal(bodyCount(scene), bodiesAfterBuild, "and so is the body count");
  assert.equal(scene.materials.length, materialsAfterBuild, "shared materials are flat across pooling");
  assert.equal(scene.textures.length, texturesAfterBuild, "shared texture wrappers are flat across pooling");

  // And they all come back. Four seconds of life plus six of lying about is ten,
  // so run past it and the quiver is empty again.
  frames(Math.round(12 * 60));
  assert.equal(quiver.flying, 0, "every arrow is collected in the end");
});

test("a hundred launches from one place land in exactly one place", async () => {
  const { scene, materials, frames, driver } = await world();
  const layers = layersFor("left");
  const quiver = new Quiver(
    scene,
    { name: "q", layer: layers.arrow, collidesWith: layers.arrowCollides },
    materials,
  );
  const bow = driver(quiver);

  // The assertion that catches the teleport going wrong, and it is worth knowing
  // exactly what it catches. `setTargetTransform` is the target of a *keyframed*
  // body and does nothing to a dynamic one, so an arrow "teleported" that way
  // carries on from wherever the last shot left it: six shots from one origin
  // landed 12 m apart, at -6.63, -12.19, -4.35, -9.94, -1.93 and -7.66. The same
  // signature appears if `Quiver.step` is ever moved after the loose in a control
  // step, because the step is what takes the one-frame teleport request back
  // down again.
  const ends = [];
  for (let shot = 0; shot < 100; shot += 1) {
    bow.trackFor(48);
    bow.fire(new Vector3(0, 4, -8), new Vector3(0, 0, 1), 45);
    frames(14);
    assert.notEqual(bow.landed, null, `shot ${shot}: the arrow was tracked`);
    ends.push(bow.landed);
    for (const arrow of quiver.arrows) arrow.park();
    frames(1);
  }

  const spread = Math.max(...ends) - Math.min(...ends);
  assert.equal(spread, 0, `every launch ends in the same place; spread was ${spread}`);
  // 48 substeps of 1/240 s at 45 m/s is 9 m, from -8.
  assert.ok(Math.abs(ends[0] - 1) < 0.05, `and that place is the ballistic one: ${ends[0]}`);
});

test("a parked arrow collides with nothing, and does not fall for ever either", async () => {
  const { scene, materials, frames } = await world();
  const layers = layersFor("left");
  const quiver = new Quiver(
    scene,
    { name: "q", layer: layers.arrow, collidesWith: layers.arrowCollides },
    materials,
  );
  const arrow = quiver.arrows[0];
  let contacts = 0;
  arrow.body.getCollisionObservable().add(() => { contacts += 1; });

  const parkedAt = arrow.root.position.y;
  frames(300);
  for (let i = 0; i < 300; i += 1) arrow.step(FIXED);

  assert.equal(contacts, 0, "nothing on membership mask 0 ever generates a contact");
  // The park is STATIC as well as masked, and this is why: masked alone, a body
  // still integrates. Twenty-four parked the naive way measured +0.0726 ms/frame
  // and were 3.5 km below the arena, accelerating.
  assert.equal(arrow.root.position.y, parkedAt, "a parked arrow does not move at all");

  // And the mask is a mask rather than a wish. This is the assertion that
  // distinguishes the two halves above -- a static body would sit still whatever
  // its filter said -- and it is the one that fails if an arrow is ever given a
  // `PhysicsShapeContainer` again: Havok filters on leaves, so a container's
  // mask is written, ignored, and read back as garbage. `weapon.ts` had that
  // fault for its whole life and it cost four thousand spurious self-contacts a
  // fighter.
  assert.equal(arrow.shape.filterMembershipMask, 0, "parked, it is on no layer");
  arrow.loose(new Vector3(0, 3, 0), new Vector3(0, 0, 1), 30);
  assert.equal(arrow.shape.filterMembershipMask, layers.arrow, "loosed, it is on its side's");
  assert.equal(arrow.shape.filterCollideMask, layers.arrowCollides);
});

test("an arrow that hits the ground plants where it landed and is collected later", async () => {
  const { scene, materials, frames, driver } = await world();
  const layers = layersFor("left");
  const quiver = new Quiver(
    scene,
    { name: "q", layer: layers.arrow, collidesWith: layers.arrowCollides },
    materials,
  );
  const bow = driver(quiver);

  // Down and forward, so it reaches the floor rather than the horizon.
  bow.fire(new Vector3(0, 2, -4), new Vector3(0, -0.5, 1).normalize(), 30);
  const arrow = quiver.arrows[0];

  frames(120);
  assert.ok(arrow.struck, "it found the ground");
  assert.equal(arrow.shape.filterMembershipMask, LAYER.SPENT_ARROW);
  assert.equal(arrow.shape.filterCollideMask, COLLIDES.SPENT_ARROW);
  const where = arrow.root.position.clone();

  frames(120);
  assert.ok(
    Vector3.Distance(arrow.root.position, where) < 1e-6,
    "and stayed exactly where it stopped rather than sliding or rolling",
  );

  // Six seconds of lying about, and then it is gone.
  frames(Math.round((CONFIG.arrow.stickSeconds + 1) * 60));
  assert.equal(arrow.live, false, "and it is collected");
});

test("parked_flying_and_spent_masks_are_three_distinct_states", async () => {
  const { scene, materials, frames, driver } = await world();
  const layers = layersFor("left");
  const quiver = new Quiver(scene,
    { name: "states", layer: layers.arrow, collidesWith: layers.arrowCollides }, materials);
  const arrow = quiver.arrows[0];
  assert.deepEqual([arrow.shape.filterMembershipMask, arrow.shape.filterCollideMask], [0, 0]);
  driver(quiver).fire(new Vector3(0, 1, 0), new Vector3(0, -1, 0), 20);
  frames(1);
  assert.equal(arrow.shape.filterMembershipMask, layers.arrow);
  for (let i = 0; i < 60 && !arrow.struck; i += 1) frames(1);
  assert.equal(arrow.struck, true);
  assert.deepEqual(
    [arrow.shape.filterMembershipMask, arrow.shape.filterCollideMask],
    [LAYER.SPENT_ARROW, COLLIDES.SPENT_ARROW],
  );
  assert.deepEqual([quiver.parked, quiver.flying, quiver.spent],
    [CONFIG.arrow.count - 1, 0, 1]);
});

test("spent_arrows_land_on_world_but_never_on_one_another", () => {
  assert.notEqual(COLLIDES.WORLD & LAYER.SPENT_ARROW, 0, "world reciprocity lets spent shafts land");
  assert.equal(COLLIDES.SPENT_ARROW, LAYER.WORLD);
  assert.equal(COLLIDES.SPENT_ARROW & LAYER.SPENT_ARROW, 0, "spent shafts cannot support each other");
  assert.equal(COLLIDES.SPENT_ARROW & (LAYER.LEFT_TRUNK | LAYER.RIGHT_TRUNK | LAYER.DEBRIS), 0,
    "spent shafts cannot push fighters or severed debris");
});

test("twenty_spent_arrows_cannot_build_a_floating_stack", async () => {
  const { scene, materials, frames } = await world();
  const layers = layersFor("left");
  const quiver = new Quiver(scene,
    { name: "pile", layer: layers.arrow, collidesWith: layers.arrowCollides }, materials);
  const rightLayers = layersFor("right");
  const second = new Quiver(scene,
    { name: "pile.right", layer: rightLayers.arrow, collidesWith: rightLayers.arrowCollides }, materials);
  const quivers = [quiver, second];
  let pending = null;
  scene.onBeforePhysicsObservable.add(() => {
    for (const owner of quivers) owner.step(FIXED);
    if (!pending) return;
    pending.owner.loose(pending.from, pending.along, pending.speed);
    pending = null;
  });
  const settled = [];
  for (let shot = 0; shot < 20; shot += 1) {
    const owner = quivers[Math.floor(shot / CONFIG.arrow.count)];
    const before = new Set(owner.arrows.filter((candidate) => candidate.live));
    pending = { owner, from: new Vector3(0, 1.2, 0), along: new Vector3(0, -1, 0), speed: 20 };
    frames(1);
    const arrow = owner.arrows.find((candidate) => candidate.live && !before.has(candidate));
    assert.ok(arrow, `shot ${shot} left the pool`);
    for (let i = 0; i < 45 && !arrow.struck; i += 1) frames(1);
    assert.equal(arrow.struck, true, `shot ${shot} reached the floor`);
    settled.push(arrow.root.position.y);
  }
  const span = Math.max(...settled) - Math.min(...settled);
  assert.ok(span <= CONFIG.arrow.shaftDiameter,
    `twenty shafts settled in one layer (${(span * 1000).toFixed(2)} mm), not a stack`);
});

test("a fighter with a bow builds a quiver, and one with a sword does not", async () => {
  const { scene, materials } = await world();
  const intent = blankIntent();
  const mind = { name: "held", decide: () => intent };

  const archer = new Fighter(
    scene,
    { side: "left", origin: Vector3.Zero(), facing: 0, mind, loadout: { primary: "bow", secondary: "bow" } },
    materials,
  );
  const swordsman = new Fighter(
    scene,
    {
      side: "right",
      origin: new Vector3(0, 0, CONFIG.fighter.separation),
      facing: Math.PI,
      mind: { name: "still", decide: () => blankIntent() },
      loadout: { primary: "sword", secondary: "empty" },
    },
    materials,
  );

  assert.ok(archer.arms.primary.quiver, "the hand with the bow has arrows");
  assert.equal(archer.arms.secondary.quiver, null, "the empty trailing hand does not");
  assert.equal(swordsman.arms.primary.quiver, null, "and neither does a swordsman");

  // A bow takes two hands and the trailing one is on the string, which moves --
  // so there is nothing to weld it to and it does not take a second grip. The
  // club does, and that difference is `Weapon.secondGrip` rather than a name.
  assert.equal(archer.arms.secondary.assisting, false, "a bow's off hand grips nothing");
  assert.equal(archer.arms.primary.weapon.secondGrip, null);

  // `strikers` is what `Combat` watches: the bow, plus every arrow in the quiver.
  assert.equal(archer.strikers.length, 1 + CONFIG.arrow.count);
  assert.equal(swordsman.strikers.length, 2, "a sword and its free fist");
  const combat = new Combat("left", archer.strikers);
  assert.ok(combat, "and Combat takes them without knowing which is which");
});

test("holding the button draws the bow and letting go looses an arrow", async () => {
  const { scene, materials, frames } = await world();
  const intent = blankIntent();
  const mind = { name: "held", decide: () => intent };
  const archer = new Fighter(
    scene,
    { side: "left", origin: Vector3.Zero(), facing: 0, mind, loadout: { primary: "bow", secondary: "bow" } },
    materials,
  );
  const dummy = new Fighter(
    scene,
    {
      side: "right",
      origin: new Vector3(0, 0, CONFIG.fighter.separation),
      facing: Math.PI,
      mind: { name: "still", decide: () => blankIntent() },
      loadout: { primary: "empty", secondary: "empty" },
    },
    materials,
  );

  const clock = { now: 0 };
  const observer = scene.onBeforePhysicsObservable.add(() => {
    archer.observe(dummy, clock.now);
    dummy.observe(archer, clock.now);
    archer.update(FIXED);
    dummy.update(FIXED);
    clock.now += FIXED;
  });
  const run = (seconds) => frames(Math.round(seconds * 60));

  const quiver = archer.arms.primary.quiver;

  // Aim level and forward, then hold.
  intent.primary.pointerX = 0;
  intent.primary.pointerY = 0;
  intent.primary.thrust = false;
  run(1.0);
  assert.equal(quiver.flying, 0, "nothing goes while the button is up");

  intent.primary.thrust = true;
  run(CONFIG.arrow.drawSeconds + 0.2);
  assert.equal(quiver.flying, 0, "and nothing goes while it is held, however long");

  intent.primary.thrust = false;
  run(1 / 60);
  assert.equal(quiver.flying, 1, "letting go of a full draw looses exactly one");

  // Read on the frame it goes, and that is not fussiness: the dummy is only
  // 2.4 m away, so by the next frame this arrow has already hit somebody and
  // been bled of its speed on purpose.
  const arrow = quiver.arrows.find((a) => a.live);
  const speed = arrow.body.getLinearVelocity().length();
  assert.ok(
    Math.abs(speed - CONFIG.arrow.speedMax) < 1.5,
    `a full draw looses at about speedMax; got ${speed.toFixed(1)}`,
  );

  // A tap is not a shot.
  const before = quiver.flying + quiver.spent;
  intent.primary.thrust = true;
  run(0.1);
  intent.primary.thrust = false;
  run(0.05);
  assert.equal(quiver.flying + quiver.spent, before, "a tap below minDraw abandons rather than looses");
});

test("a spent arrow does not go on scoring the limb it is lying against", async () => {
  /**
   * Debris does not score, and the rule earns its keep in the tail rather than
   * in the typical case. A struck arrow rests against whatever it hit and files
   * a contact every `hitCooldown`; a limb that is moving drags it back over
   * `minArrowSpeed` often enough to be billed. Measured before the rule existed:
   * 62 "hits" averaging **2.9** damage where a clean arrow is worth 55, because
   * most of them were the same handful of spent shafts scored eleven times a
   * second.
   *
   * The delay is the other half and it is not cosmetic. `Arrow` and `Combat`
   * both watch the same body, `Arrow`'s observer is added first, so marking the
   * arrow spent inside its own callback marks it spent *before* the watcher that
   * scores it runs -- and every arrow in the game scores nothing, silently.
   */
  const { scene, materials, frames, driver } = await world();
  const intent = blankIntent();
  const target = new Fighter(
    scene,
    {
      side: "right", origin: new Vector3(0, 0, 6), facing: Math.PI,
      mind: { name: "still", decide: () => intent },
      loadout: { primary: "empty", secondary: "empty" },
    },
    materials,
  );
  const layers = layersFor("left");
  const quiver = new Quiver(
    scene,
    { name: "q", layer: layers.arrow, collidesWith: layers.arrowCollides },
    materials,
  );
  const combat = new Combat("left", quiver.arrows);
  combat.attach(target);
  const bow = driver(quiver);

  const clock = { now: 0 };
  scene.onBeforePhysicsObservable.add(() => {
    target.observe(target, clock.now);
    target.update(FIXED);
    clock.now += FIXED;
    combat.advance(FIXED);
  });

  frames(120);
  const chest = target.torso.mesh.position.clone();
  bow.fire(new Vector3(chest.x, chest.y, chest.z - 3), new Vector3(0, 0, 1), CONFIG.arrow.speedMax);
  frames(4);

  const first = combat.lastHit;
  assert.ok(first, "the arrow was scored");
  assert.equal(first.weapon, "arrow");
  assert.ok(first.damage > 0, `and it was worth something: ${first.damage}`);
  // It arrives point-first at full draw, which is the best an arrow can do.
  assert.ok(
    Math.abs(first.speed - CONFIG.arrow.speedMax) < 1,
    `scored at the speed it arrived, not at what the impact left it: ${first.speed.toFixed(1)}`,
  );

  // Now let it lie there for three seconds against a body that is being driven.
  const scored = combat.log.filter((r) => r.weapon === "arrow" && r.damage > 0).length;
  frames(180);
  const after = combat.log.filter((r) => r.weapon === "arrow" && r.damage > 0).length;
  assert.equal(after, scored, "and it is billed exactly once, however long it rests there");
});

test("an arrow is scored at the speed it arrived, not at what the collision left it", async () => {
  /**
   * `Weapon.velocityAt` is `linear + w x r`, and for a blade that is the right
   * question -- the whole damage model is the speed of a tip on the end of a
   * rotating arm, and the rotation is there before the contact. An arrow has no
   * rotation in flight, so any it has at the contact was put there **by** the
   * contact, and `w x r` over a 0.36 m half-shaft is tens of metres a second.
   *
   * Copying the blade's answer cost a factor of nine: fired at 48 m/s, the
   * damage model was handed **5.6**.
   */
  const { scene, materials, frames, driver } = await world();
  const intent = blankIntent();
  const target = new Fighter(
    scene,
    {
      side: "right", origin: new Vector3(0, 0, 6), facing: Math.PI,
      mind: { name: "still", decide: () => intent },
      loadout: { primary: "empty", secondary: "empty" },
    },
    materials,
  );
  const layers = layersFor("left");
  const quiver = new Quiver(
    scene,
    { name: "q", layer: layers.arrow, collidesWith: layers.arrowCollides },
    materials,
  );
  const combat = new Combat("left", quiver.arrows);
  combat.attach(target);
  const bow = driver(quiver);
  const clock = { now: 0 };
  scene.onBeforePhysicsObservable.add(() => {
    target.observe(target, clock.now);
    target.update(FIXED);
    clock.now += FIXED;
    combat.advance(FIXED);
  });
  frames(120);
  const chest = target.torso.mesh.position.clone();

  for (const speed of [CONFIG.arrow.speedMax, CONFIG.arrow.speedMin]) {
    for (const arrow of quiver.arrows) arrow.park();
    frames(2);
    // Wait for a *new* report rather than a fixed number of frames: 3 m at
    // `speedMin` takes twice as long as at `speedMax`, and reading `lastHit`
    // too early reads the previous shot's.
    const before = combat.lastHit ? combat.lastHit.at : -1;
    bow.fire(new Vector3(chest.x, chest.y, chest.z - 3), new Vector3(0, 0, 1), speed);
    for (let i = 0; i < 30 && (combat.lastHit?.at ?? -1) === before; i += 1) frames(1);
    const hit = combat.lastHit;
    assert.ok(hit && hit.weapon === "arrow" && hit.at !== before, `loosed at ${speed}: it landed`);
    assert.ok(
      Math.abs(hit.speed - speed) < 1.5,
      `loosed at ${speed}, scored at ${hit.speed.toFixed(1)}`,
    );
  }

  // And the two are worth different amounts, which is the whole reason the bow
  // has a draw at all. Scored against the blade's `referenceSpeed` of 11 they
  // would be identical.
  const hard = combat.log.find((r) => r.weapon === "arrow" && r.speed > CONFIG.arrow.speedMax - 2);
  const soft = combat.log.find((r) => r.weapon === "arrow" && r.speed < CONFIG.arrow.speedMin + 2);
  assert.ok(hard && soft);
  assert.ok(soft.damage < hard.damage * 0.75, `a short draw hurts less: ${soft.damage.toFixed(1)} vs ${hard.damage.toFixed(1)}`);
});

test("a fighter walks backwards slower than it walks forwards", async () => {
  /**
   * It did not, until there was a policy whose whole plan is distance. `steer`
   * multiplied `input.forward` by `walkSpeed` whatever its sign, so **a fighter
   * that retreats cannot be caught by one that advances** -- and the first
   * archer bench came back 0 kills and 0 deaths in twelve bouts at the cap, a
   * stalemate no amount of tuning the bow could have touched.
   */
  const { scene, materials, frames } = await world();
  const go = (forward) => {
    const intent = blankIntent();
    intent.forward = forward;
    return { name: "go", decide: () => intent };
  };

  const measure = (forward, x) => {
    const fighter = new Fighter(
      scene,
      { side: "left", origin: new Vector3(x, 0, 0), facing: 0, mind: go(forward), loadout: { primary: "empty", secondary: "empty" } },
      materials,
    );
    return fighter;
  };
  const ahead = measure(1, -10);
  const back = measure(-1, 10);
  const clock = { now: 0 };
  scene.onBeforePhysicsObservable.add(() => {
    ahead.observe(back, clock.now);
    back.observe(ahead, clock.now);
    ahead.update(FIXED);
    back.update(FIXED);
    clock.now += FIXED;
  });

  frames(30);
  const fromA = ahead.centre().z;
  const fromB = back.centre().z;
  frames(120);
  const wentAhead = ahead.centre().z - fromA;
  const wentBack = fromB - back.centre().z;

  assert.ok(wentAhead > 0 && wentBack > 0, "both moved the way they were asked");
  assert.ok(
    wentBack < wentAhead * 0.8,
    `retreating is slower than advancing: ${wentBack.toFixed(2)} m against ${wentAhead.toFixed(2)}`,
  );
  const ratio = wentBack / wentAhead;
  const wanted = CONFIG.fighter.backSpeed / CONFIG.fighter.walkSpeed;
  assert.ok(
    Math.abs(ratio - wanted) < 0.08,
    `and by the ratio the config asks for: ${ratio.toFixed(2)} against ${wanted.toFixed(2)}`,
  );
});
