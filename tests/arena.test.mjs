import test from "node:test";
import assert from "node:assert/strict";

import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight.js";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator.js";

import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent.js";

import {
  ROOM,
  ROOM_GROUPS,
  buildArenaColliders,
  buildArenaWorld,
  buildCosmeticRoom,
  isCollider,
  validateRoomPlacements,
  validateVisualColliderPairs,
} from "../src/arena/room.ts";
import { createWorld } from "../src/core/world.ts";
import { dressForgeRoom } from "../src/arena/forge-room.ts";
import { freshEngine } from "./harness/core-stand.mjs";

const makeMaterial = (scene, name, colour) => {
  const material = new StandardMaterial(name, scene);
  material.diffuseColor.set(...colour);
  material.diffuseTexture = RawTexture.CreateRGBATexture(
    new Uint8Array([colour[0] * 255, colour[1] * 255, colour[2] * 255, 255]), 1, 1, scene,
  );
  return material;
};

const makeMaterials = (scene) => {
  const ground = makeMaterial(scene, "fixture.ground", [0.15, 0.14, 0.12]);
  const wall = makeMaterial(scene, "fixture.wall", [0.20, 0.19, 0.17]);
  const timber = makeMaterial(scene, "fixture.timber", [0.20, 0.12, 0.065]);
  const banner = makeMaterial(scene, "fixture.banner", [0.25, 0.19, 0.16]);
  return {
    ground, wall, timber, banner, wood: timber,
  };
};

// A world whose physics counts the fixed colliders standing in it: the arena adds nothing else.
const setup = async () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const core = createWorld(scene, await freshEngine());
  let live = 0;
  const counted = (collider) => {
    live += 1;
    let gone = false;
    return { dispose: () => { if (!gone) { gone = true; live -= 1; } collider.dispose(); } };
  };
  const physics = Object.create(core.physics, {
    addFixedBox: { value: (...args) => counted(core.physics.addFixedBox(...args)) },
    addFixedShape: { value: (...args) => counted(core.physics.addFixedShape(...args)) },
  });
  scene.onDisposeObservable.add(() => core.dispose());
  return { engine, scene, physics, bodies: () => live, materials: makeMaterials(scene) };
};
const rounded = (values) => values.map((value) => Math.round(value * 1e6) / 1e6);

test("cosmetic_room_dressing_creates_no_physics_body", async (t) => {
  const { engine, scene, physics, bodies, materials } = await setup();
  t.after(() => engine.dispose());
  const colliders = buildArenaColliders(scene, physics, materials);
  assert.equal(bodies(), 33, "ground, eight braziers and twenty-four parapet segments");
  const ground = scene.getMeshByName("ground");
  assert.deepEqual(rounded(ground.position.asArray()), [0, -0.5, 0]);
  for (let index = 0; index < 8; index++) {
    const post = scene.getMeshByName(`post${index}`), angle = index * Math.PI / 4;
    assert.deepEqual(rounded(post.position.asArray()), rounded([Math.sin(angle) * 12.3, .85, Math.cos(angle) * 12.3]));
    assert.deepEqual(rounded(post.getBoundingInfo().boundingBox.extendSize.asArray()), [.55, .85, .55]);
    assert.ok(isCollider(post));
  }
  const before = bodies(), room = buildCosmeticRoom(scene, materials);
  assert.equal(bodies(), before);
  room.dispose();
  assert.equal(bodies(), before, "cosmetic disposal cannot disturb authority");
  colliders.dispose();
  assert.equal(bodies(), 0);
});

test("every_reachable_solid_visual_names_its_authority", async (t) => {
  const { engine, scene, physics, materials } = await setup();
  t.after(() => engine.dispose());
  assert.deepEqual(validateRoomPlacements(ROOM_GROUPS), []);
  const unpaired = structuredClone(ROOM_GROUPS);
  unpaired[0].placements[0].collider = null;
  assert.match(validateRoomPlacements(unpaired).join("\n"), /opaque solid below reach/);
  const unknown = structuredClone(ROOM_GROUPS);
  unknown[0].placements[0].collider = "missing";
  assert.match(validateRoomPlacements(unknown).join("\n"), /missing collider/);
  const world = buildArenaWorld(scene, physics, materials);
  assert.deepEqual(validateVisualColliderPairs(scene, world.audit().visualColliderPairs), []);
  assert.match(validateVisualColliderPairs(scene, [{ visual: "room.wall.0", collider: "post4" }]).join("\n"), /does not geometrically overlap/);
  assert.match(validateVisualColliderPairs(scene, [{ visual: "room.floor", collider: "room.wall.0" }]).join("\n"), /has no physics body/);
  for (const mesh of scene.meshes) if (isCollider(mesh)) mesh.metadata.isCollider = false;
  assert.match(validateVisualColliderPairs(scene, world.audit().visualColliderPairs).join("\n"), /has no physics body/);
  world.dispose();
});

test("the_circular_parapet_draws_the_same_rotated_boxes_as_its_colliders", async (t) => {
  const { engine, scene, physics, materials } = await setup();
  t.after(() => engine.dispose());
  const world = buildArenaWorld(scene, physics, materials);
  const walls = ROOM_GROUPS.find(group => group.role === "wall").placements;
  assert.equal(walls.length, 24);
  for (const placement of walls) {
    const visual = scene.getMeshByName(placement.name), collider = scene.getMeshByName(placement.collider);
    assert.ok(isCollider(collider));
    visual.computeWorldMatrix(true); collider.computeWorldMatrix(true);
    assert.deepEqual(rounded(visual.getBoundingInfo().boundingBox.minimumWorld.asArray()), rounded(collider.getBoundingInfo().boundingBox.minimumWorld.asArray()));
    assert.deepEqual(rounded(visual.getBoundingInfo().boundingBox.maximumWorld.asArray()), rounded(collider.getBoundingInfo().boundingBox.maximumWorld.asArray()));
    assert.equal(visual.rotation.y, collider.rotation.y);
    assert.ok(Math.abs(Math.hypot(visual.position.x, visual.position.z) - 13.25) < 1e-10);
  }
  const wall = scene.getMeshByName("room.wall.0");
  world.updateOcclusion(new Vector3(0, .7, 15), [{ point: new Vector3(0, .7, 12), active: () => false }]);
  assert.equal(wall.isVisible, true);
  world.updateOcclusion(new Vector3(0, .7, 15), [{ point: new Vector3(0, .7, 12) }]);
  assert.equal(wall.isVisible, false, "a low camera sees the fighter through a crossing parapet");
  world.updateOcclusion(new Vector3(0, 8, 15), [{ point: new Vector3(0, .7, 0) }]);
  assert.equal(wall.isVisible, true, "an overhead sight line reveals the wall again");
  world.dispose();
});

test("room_instances_share_materials_and_the_audit_owns_only_its_resources", async (t) => {
  const { engine, scene, physics, materials } = await setup();
  t.after(() => engine.dispose());
  const world = buildArenaWorld(scene, physics, materials), report = world.audit();
  assert.ok(Object.isFrozen(report));
  assert.throws(() => { report.meshes = 0; }, TypeError);
  assert.deepEqual([report.meshes, report.instances, report.materials, report.textures], [66, 30, 4, 4]);
  for (const group of ROOM_GROUPS) {
    const meshes = group.placements.map(p => scene.getMeshByName(p.name));
    assert.equal(meshes.filter(mesh => mesh.getClassName() === "InstancedMesh").length, meshes.length - 1);
    assert.equal(new Set(meshes.map(mesh => mesh.material)).size, 1);
  }
  const foreignMaterial = makeMaterial(scene, "foreign", [.1, .1, .1]);
  const foreign = MeshBuilder.CreateBox("foreign", {}, scene); foreign.material = foreignMaterial;
  assert.strictEqual(world.audit(), report);
  assert.deepEqual([report.meshes, report.instances, report.materials, report.textures], [66, 30, 4, 4]);
  foreign.dispose(false, false); foreignMaterial.dispose(true, true); world.dispose();
});

test("an_arena_rebuild_returns_every_audit_count_to_its_baseline", async (t) => {
  const { engine, scene, physics, bodies, materials } = await setup();
  t.after(() => engine.dispose());
  const light = new DirectionalLight("sun", new Vector3(-1, -2, 1), scene), shadows = new ShadowGenerator(256, light);
  let adds = 0, removes = 0;
  const registry = {
    add: mesh => { adds++; shadows.addShadowCaster(mesh); },
    remove: mesh => { removes++; shadows.removeShadowCaster(mesh); },
  };
  const baseline = [scene.meshes.length, bodies(), scene.materials.length, scene.textures.length];
  for (let cycle = 0; cycle < 10; cycle++) {
    const world = buildArenaWorld(scene, physics, materials, registry), audit = world.audit();
    assert.deepEqual([audit.meshes, audit.bodies, audit.instances, audit.materials, audit.textures], [66, 33, 30, 4, 4]);
    assert.equal(audit.visualColliderPairs.length, 33);
    assert.equal(shadows.getShadowMap().renderList.length, 32);
    assert.equal(adds, (cycle + 1) * 32);
    const wall = scene.getMeshByName("room.wall.0");
    world.updateOcclusion(new Vector3(0, .7, 15), [{ point: new Vector3(0, .7, 12) }]);
    assert.equal(wall.isVisible, false);
    assert.ok(shadows.getShadowMap().renderList.includes(wall));
    const before = [scene.meshes.length, scene.materials.length, scene.textures.length, bodies()];
    for (let i = 0; i < 20; i++) assert.strictEqual(world.audit(), audit);
    assert.deepEqual([scene.meshes.length, scene.materials.length, scene.textures.length, bodies()], before);
    world.dispose();
    assert.equal(removes, (cycle + 1) * 32);
    assert.equal(shadows.getShadowMap().renderList.length, 0);
    assert.deepEqual([scene.meshes.length, bodies(), scene.materials.length, scene.textures.length], baseline);
  }
  shadows.dispose(); light.dispose();
});

test("the_forges_fire_stands_through_drawn_frames_and_moves_when_it_is_burned", async (t) => {
  // A paused page draws frames and does not burn the fire: nothing but `burn` may move it, however much real
  // time the frames take.
  const { engine, scene, physics, materials } = await setup();
  t.after(() => engine.dispose());
  buildArenaWorld(scene, physics, materials);
  new FreeCamera("probe", new Vector3(0, 2, -4), scene);
  const kit = new Map([["masonry", MeshBuilder.CreateBox("fixture.masonry", { size: 1 }, scene)]]);
  const fire = dressForgeRoom(scene, { kit, materials: { brazierBronze: materials.timber } });
  const lights = scene.lights.filter((light) => light.name.startsWith("forge.torchlight."));
  const flame = scene.getMeshByName("forge.torch.0").material;
  let time;
  const setFloat = flame.setFloat.bind(flame);
  flame.setFloat = (name, value) => { if (name === "time") time = value; return setFloat(name, value); };
  const made = lights.map((light) => light.intensity);
  assert.equal(made.length, 2, "two posts carry a light");
  assert.equal(made[0], made[1], "each light is made at the flicker's mean");
  for (let frame = 0; frame < 3; frame += 1) {
    await new Promise((resolve) => setTimeout(resolve, 20));
    engine.beginFrame(); scene.render(); engine.endFrame();
  }
  assert.ok(engine.getDeltaTime() > 0, "the frames took no time, so they could not have moved a fire");
  assert.deepEqual({ lights: lights.map((light) => light.intensity), time }, { lights: made, time: undefined }, "a drawn frame moved the fire");
  fire.burn(0.02);
  const burned = lights.map((light) => light.intensity);
  assert.equal(time, 0.02, "the flames' time is what was burned");
  assert.ok(burned[0] !== made[0] && burned[1] !== made[1] && burned[0] !== burned[1], `burned 0.02 s, the lights read ${burned}`);
  fire.burn(10);
  assert.ok(Math.abs(time - 0.07) < 1e-12, `one frame burned ${time - 0.02} s of a 10 s stall`);
});
