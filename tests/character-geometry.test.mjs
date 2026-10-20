import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { BODY_MODELS, modelSpec, resolveCharacter } from "../src/core/models.ts";
import { createWorld } from "../src/core/world.ts";
import { frameOf } from "../src/core/spec/body.ts";
import { bodyIntersections } from "../src/core/spec/clearance.ts";
import { freshEngine } from "./harness/core-stand.mjs";
import { Duel } from "../src/arena/duel.ts";
import { prepareDungeonCharacters } from "../src/dungeon/run.ts";
import { findPath, walkable } from "../src/dungeon/map.ts";
import { classicDungeon } from "./fixtures/classic-dungeon.mjs";
import { specProvenanceFaults } from "./fixtures/spec.mjs";
import { skinReference } from "../src/render/body-deformation.ts";

const near = (a, b) => assert.ok(Math.abs(a - b) <= Math.max(1, Math.abs(b)) * 1e-12, `${a} versus ${b}`);

test("clearance refuses an intersecting nonadjacent segment and an additional contact region", () => {
  const spec = modelSpec("workshop-fighter"), hand = spec.segments.find(s => s.name === "hand.left");
  for (const change of [head => ({ ...head, shape: hand.shape }),
    head => ({ ...head, contacts: [{ name: "intersecting-contact", shape: hand.shape, surface: hand.surface }] })]) {
    const invalid = { ...spec, segments: spec.segments.map(segment => segment.name === "head" ? change(segment) : segment) };
    assert.ok(bodyIntersections(invalid).includes("head intersects hand.left"));
  }
});

test("Size and Weight keep sourced mass, muscle and clearance contracts on every model", () => {
  for (const model of BODY_MODELS) {
    const base = modelSpec(model);
    assert.deepEqual(bodyIntersections(base), [], model);
    for (const attributes of [{ size: 1.05 }, { weight: 1.05 }, { size: 1.05, weight: 1.05 }]) {
      const spec = resolveCharacter({ model, attributes }).spec, size = attributes.size ?? 1, weight = attributes.weight ?? 1;
      assert.deepEqual(specProvenanceFaults(spec), [], `${model} ${JSON.stringify(attributes)}`);
      near(spec.mass.value, base.mass.value * size * size * size * weight);
      near(spec.stature.value, base.stature.value * size);
      assert.equal(spec.wounds.hp.value, base.wounds.hp.value);
      if (weight === 1) spec.segments.forEach((segment, i) => segment.inertia.value.forEach((value, axis) =>
        near(value, base.segments[i].inertia.value[axis] * size * size * size * size * size)));
      assert.deepEqual(bodyIntersections(spec), [], `${model} ${JSON.stringify(attributes)}`);
      spec.joints.forEach((joint, i) => joint.dofs.forEach((dof, j) => {
        near(dof.muscle.peakPositive.value, base.joints[i].dofs[j].muscle.peakPositive.value * size * size * size);
        assert.equal(dof.muscle.speedPositive.unloadedSpeed.value, base.joints[i].dofs[j].muscle.speedPositive.unloadedSpeed.value);
      }));
    }
  }
});

test("configured party footprints fit their starts and routes on several seeds, before a world exists", () => {
  for (const seed of [1, 7, 42]) {
    const map = classicDungeon(seed); map.spawns = [];
    const prepared = prepareDungeonCharacters(map, { hero: "workshop-fighter", companions: ["workshop-rogue"],
      attributes: p => p.id === "hero" ? { size: 1.1 } : { size: .95, weight: 1.05 } });
    const own = prepared.characters.get("hero");
    assert.equal(own.config.attributes.size, 1.1);
    assert.ok(walkable(map, map.start, .35 * 1.1, true));
    assert.ok(findPath(map, map.start, map.exit, .35 * 1.1).length);
    assert.ok(prepared.homes.has("ally-0"));
    assert.throws(() => prepareDungeonCharacters(map, { hero: "workshop-fighter", attributes: () => ({ size: 100 }) }), /does not fit/);
  }
});

test("skin attachment transforms carry size and breadth without moving a built body's physics", async () => {
  const rendering = new NullEngine(), scene = new Scene(rendering), engine = await freshEngine(), world = createWorld(scene, engine);
  const duel = new Duel(world, { left: "crypt-skeleton", right: "workshop-fighter", attributes: { left: { size: 1.1, weight: 1.05 }, right: {} } });
  try {
    const built = duel.duelists.left.built, before = world.physics.save(), segment = built.spec.segments.find(s => s.name === "upperTrunk");
    const source = resolveCharacter({ model: "crypt-skeleton" }).spec.segments.find(s => s.name === "upperTrunk");
    const point = Vector3.TransformCoordinates(Vector3.FromArray(source.proximal.value), skinReference(built, "upperTrunk"));
    const frame = frameOf(segment);
    // Render matrices store Float32 components; their attachment's bound is one relative Float32 ulp.
    const renderRounding = segment.proximal.value[1] * (1 / (1 << 23));
    assert.ok(Math.abs(point.y) <= renderRounding, `skin attachment error ${point.y} m exceeds Float32 rounding ${renderRounding} m`);
    assert.equal(frame.origin[1], segment.proximal.value[1]);
    assert.deepEqual(world.physics.save(), before);
  } finally { duel.dispose(); world.dispose(); scene.dispose(); rendering.dispose(); }
});
