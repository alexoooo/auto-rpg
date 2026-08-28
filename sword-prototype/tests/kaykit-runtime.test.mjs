import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { Scene } from "@babylonjs/core/scene.js";
import HavokPhysics from "@babylonjs/havok";

import {
  kayKitUnavailableUnits,
  kayKitVisualMountError,
  prepareKayKitFigureFromBytes,
} from "../src/kaykit-figure.ts";
import { KAYKIT_KNIGHT_ASSET_PROFILE, KAYKIT_KNIGHT_PROFILE } from "../src/kaykit-profile.ts";
import { idleMind } from "../src/mind.ts";
import { attachPhysics } from "../src/physics.ts";
import { unitDefinition } from "../src/units.ts";
import { creatorGeometryQualification, Weapon } from "../src/weapon.ts";

const asset = new URL("../public/assets/kaykit-knight.glb", import.meta.url);
const wasm = new URL("../node_modules/@babylonjs/havok/lib/esm/HavokPhysics.wasm", import.meta.url);

const census = (scene) => ({
  meshes: scene.meshes.length,
  transformNodes: scene.transformNodes.length,
  skeletons: scene.skeletons.length,
  materials: scene.materials.length,
  textures: scene.textures.length,
  bodies: scene.getPhysicsEngine().getBodies().length,
  constraints: scene.getPhysicsEngine().getPhysicsPlugin()._kaykitLiveConstraints ?? 0,
  animationGroups: scene.animationGroups.length,
  animatables: scene.animatables.length,
  beforeRenderObservers: scene.onBeforeRenderObservable.observers
    .filter((observer) => !observer._willBeUnregistered).length,
});

const trackConstraints = (scene) => {
  const plugin = scene.getPhysicsEngine().getPhysicsPlugin();
  plugin._kaykitLiveConstraints = 0;
  const init = plugin.initConstraint.bind(plugin);
  plugin.initConstraint = (...args) => {
    const constraint = args[0];
    const before = constraint._pluginData?.length ?? 0;
    init(...args);
    plugin._kaykitLiveConstraints += (constraint._pluginData?.length ?? 0) - before;
  };
  const dispose = plugin.disposeConstraint.bind(plugin);
  plugin.disposeConstraint = (constraint) => {
    plugin._kaykitLiveConstraints -= constraint._pluginData?.length ?? 0;
    dispose(constraint);
  };
};

const materialsFor = (scene) => {
  const material = (name) => new StandardMaterial(name, scene);
  return {
    flesh: material("kaykit.test.flesh"),
    cloth: material("kaykit.test.cloth"),
    steel: material("kaykit.test.steel"),
    leather: material("kaykit.test.leather"),
    brass: material("kaykit.test.brass"),
    hide: material("kaykit.test.hide"),
    wood: material("kaykit.test.wood"),
    arrowAccent: material("kaykit.test.arrow"),
  };
};

const worldPoints = (root) => [root, ...root.getChildMeshes(false)].flatMap((mesh) => {
  if (typeof mesh.getVerticesData !== "function") return [];
  const positions = mesh.getVerticesData(VertexBuffer.PositionKind) ?? [];
  const world = mesh.computeWorldMatrix(true);
  const points = [];
  for (let index = 0; index < positions.length; index += 3) {
    points.push(Vector3.TransformCoordinates(
      new Vector3(positions[index], positions[index + 1], positions[index + 2]),
      world,
    ));
  }
  return points;
});

const projectedRange = (points, axis, origin) => points.reduce((range, point) => {
  const projection = Vector3.Dot(point.subtract(origin), axis);
  return [Math.min(range[0], projection), Math.max(range[1], projection)];
}, [Infinity, -Infinity]);

const pointBounds = (points) => points.reduce((bounds, point) => ({
  min: Vector3.Minimize(bounds.min, point),
  max: Vector3.Maximize(bounds.max, point),
}), {
  min: new Vector3(Infinity, Infinity, Infinity),
  max: new Vector3(-Infinity, -Infinity, -Infinity),
});

const drainDeferredDisposals = (scene) => {
  // Babylon queues active-container disposal onto the next before-render pass
  // so a mesh cannot invalidate a collection while that collection is walked.
  scene.onBeforeRenderObservable.notifyObservers(scene);
};

test("the_KayKit_profile_projects_creator_bounds_joints_and_slot_lengths_into_physics", () => {
  const values = KAYKIT_KNIGHT_PROFILE.values;
  const bounds = KAYKIT_NIGHT_REGION_BOUNDS();
  assert.equal(values.body.torsoCentre, bounds.torso.centreM[1]);
  assert.equal(values.body.headCentre, bounds.head.centreM[1]);
  assert.equal(values.body.shinCentre, bounds.shinLeft.centreM[1]);
  assert.equal(values.fighter.shoulderSide,
    KAYKIT_KNIGHT_ASSET_PROFILE.regions.find(({ region }) => region === "swordUpperArm")
      .bindWorldJointCentreM[0]);
  assert.equal(values.arm.upperLength, KAYKIT_KNIGHT_ASSET_PROFILE.lengthsM.swordUpperArm);
  assert.equal(values.arm.foreLength, KAYKIT_KNIGHT_ASSET_PROFILE.lengthsM.swordForearm);
  assert.equal(values.arm.handLength, KAYKIT_KNIGHT_ASSET_PROFILE.lengthsM.swordHandToSlot);
  assert.notEqual(values.body.headRadius, values.body.torsoRadius,
    "a native body must not collapse back to one uniform Warrior scale");
});

function KAYKIT_NIGHT_REGION_BOUNDS() {
  return KAYKIT_KNIGHT_ASSET_PROFILE.physics.regionBounds;
}

const worldPoint = (node, local) => {
  node.computeWorldMatrix(true);
  return Vector3.TransformCoordinates(local, node.getWorldMatrix());
};

test("the_KayKit_outstretched_chain_has_no_bind_violation_at_any_fighter_facing", async (t) => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  t.after(() => engine.dispose());
  attachPhysics(scene, await HavokPhysics({ wasmBinary: await readFile(wasm) }));
  trackConstraints(scene);
  const prepared = await prepareKayKitFigureFromBytes(scene, new Uint8Array(await readFile(asset)));
  assert.deepEqual(prepared, { available: true, reason: null });
  const materials = materialsFor(scene);
  const { body: body, fighter, arm } = KAYKIT_KNIGHT_PROFILE.values;

  for (const [index, facing] of [0, Math.PI / 2, Math.PI].entries()) {
    const knight = unitDefinition("kaykit-knight").build({
      scene,
      side: "left",
      origin: new Vector3(index * 4, 0, 0),
      facing,
      mind: idleMind(),
      loadout: { primary: "sword", secondary: "buckler" },
      materials,
    });
    const control = unitDefinition("warrior").build({
      scene,
      side: "right",
      origin: new Vector3(index * 4, 0, 8),
      facing,
      mind: idleMind(),
      loadout: { primary: "sword", secondary: "buckler" },
      materials,
    });
    for (const [name, shoulderSide] of [
      ["primary", fighter.shoulderSide],
      ["secondary", -fighter.shoulderSide],
    ]) {
      const driven = knight.arms[name];
      const gaps = [
        Vector3.Distance(
          worldPoint(knight.torso.mesh, new Vector3(
            shoulderSide,
            fighter.shoulderHeight - body.torsoCentre,
            fighter.shoulderFront,
          )),
          worldPoint(driven.upperArm.mesh, new Vector3(0, arm.upperLength / 2, 0)),
        ),
        Vector3.Distance(
          worldPoint(driven.upperArm.mesh, new Vector3(0, -arm.upperLength / 2, 0)),
          worldPoint(driven.forearm.mesh, new Vector3(0, arm.foreLength / 2, 0)),
        ),
        Vector3.Distance(
          worldPoint(driven.forearm.mesh, new Vector3(0, -arm.foreLength / 2, 0)),
          worldPoint(driven.hand.mesh, new Vector3(0, arm.handLength / 2, 0)),
        ),
        Vector3.Distance(
          worldPoint(driven.hand.mesh, new Vector3(0, -arm.handLength / 2, 0)),
          worldPoint(driven.weapon.root, Vector3.Zero()),
        ),
      ];
      assert.ok(Math.max(...gaps) < 1e-6,
        `${name} at facing ${facing} starts with joint gaps ${gaps.join(", ")}`);
    }
    scene._renderId += 1;
    scene._advancePhysicsEngineStep(1000 / 60);
    const speeds = [
      knight.arms.primary.hand.body.getLinearVelocity().length(),
      knight.arms.secondary.hand.body.getLinearVelocity().length(),
      knight.arms.primary.weapon.body.getLinearVelocity().length(),
      knight.arms.secondary.weapon.body.getLinearVelocity().length(),
    ];
    const launchSpeed = Math.max(...speeds);
    const controlSpeed = Math.max(
      control.arms.primary.hand.body.getLinearVelocity().length(),
      control.arms.secondary.hand.body.getLinearVelocity().length(),
      control.arms.primary.weapon.body.getLinearVelocity().length(),
      control.arms.secondary.weapon.body.getLinearVelocity().length(),
    );
    assert.ok(launchSpeed <= controlSpeed * 1.1,
      `facing ${facing} launches native bind at ${speeds.join(", ")} m/s against ${controlSpeed} m/s control`);
    knight.dispose();
    control.dispose();
  }
});

test("visual_weapon_mount_measurement_detects_a_tenth_millimetre_or_tenth_degree_drift", () => {
  const original = Matrix.Identity();
  const subThreshold = Matrix.Translation(0.00005, 0, 0);
  assert.ok(kayKitVisualMountError(original, subThreshold).position < 0.0001);
  const moved = Matrix.Translation(0.001, 0, 0);
  assert.ok(kayKitVisualMountError(original, moved).position > 0.0001);
  const turned = Matrix.Compose(
    Vector3.One(),
    Quaternion.RotationAxis(new Vector3(0, 1, 0), 0.2 * Math.PI / 180),
    Vector3.Zero(),
  );
  assert.ok(kayKitVisualMountError(original, turned).angle > 0.1 * Math.PI / 180);
});

test("a_failed_KayKit_preparation_disables_the_named_picker_option_with_its_reason", () => {
  const reason = "KayKit Knight asset could not be fetched";
  assert.deepEqual(kayKitUnavailableUnits({ available: false, reason }), {
    "kaykit-knight": reason,
  });
  assert.deepEqual(kayKitUnavailableUnits({ available: true, reason: null }), {});
});

test("creator_geometry_preflight_rejects_components_that_Havok_cannot_build", (t) => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  t.after(() => engine.dispose());
  const root = new TransformNode("preflight.root", scene);
  const mesh = new Mesh("preflight.flat", scene);
  mesh.parent = root;
  mesh.setVerticesData(VertexBuffer.PositionKind, [
    0, 0, 0,
    1, 0, 0,
    0, 1, 0,
    1, 1, 0,
  ]);
  mesh.setIndices([0, 1, 2, 1, 3, 2]);
  assert.match(
    creatorGeometryQualification(root, [mesh], "shield", 1),
    /no convex volume/,
    "a name-qualified but coplanar visual must be refused before construction",
  );
});

test("an_unexpected_KayKit_transfer_failure_rolls_back_the_whole_fighter", async (t) => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  t.after(() => engine.dispose());
  attachPhysics(scene, await HavokPhysics({ wasmBinary: await readFile(wasm) }));
  trackConstraints(scene);
  const prepared = await prepareKayKitFigureFromBytes(scene, new Uint8Array(await readFile(asset)));
  assert.deepEqual(prepared, { available: true, reason: null });
  const materials = materialsFor(scene);
  const build = () => unitDefinition("kaykit-knight").build({
    scene,
    side: "left",
    origin: Vector3.Zero(),
    facing: 0,
    mind: idleMind(),
    loadout: { primary: "sword", secondary: "buckler" },
    materials,
  });
  build().dispose();
  drainDeferredDisposals(scene);
  const baseline = census(scene);
  const adopt = Weapon.prototype.adoptCreatorGeometry;
  let calls = 0;
  Weapon.prototype.adoptCreatorGeometry = function (meshes) {
    calls += 1;
    if (calls === 2) throw new Error("forced second creator transfer failure");
    return adopt.call(this, meshes);
  };
  try {
    assert.throws(() => build(), /forced second creator transfer failure/);
  } finally {
    Weapon.prototype.adoptCreatorGeometry = adopt;
  }
  drainDeferredDisposals(scene);
  assert.equal(calls, 2, "the probe must cross one successful transfer before it fails");
  assert.deepEqual(census(scene), baseline,
    "a throwing constructor leaves no imported graph, physics body, constraint or observer");
});

test("the_runtime_Knight_stops_native_animation_owns_visual_weapons_and_disposes_cleanly", async (t) => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  t.after(() => engine.dispose());
  attachPhysics(scene, await HavokPhysics({ wasmBinary: await readFile(wasm) }));
  trackConstraints(scene);
  const prepared = await prepareKayKitFigureFromBytes(scene, new Uint8Array(await readFile(asset)));
  assert.deepEqual(prepared, { available: true, reason: null });
  assert.equal(scene.animatables.length, 0,
    "the loader-started creator clip must be stopped before publication");
  const materials = materialsFor(scene);
  const build = () => unitDefinition("kaykit-knight").build({
    scene,
    side: "left",
    origin: Vector3.Zero(),
    facing: 0,
    mind: idleMind(),
    loadout: { primary: "sword", secondary: "buckler" },
    materials,
  });
  // Weapon surface maps install two scene-owned observers lazily on the first
  // build. Warm that invariant before calling the count a rebuild baseline.
  build().dispose();
  drainDeferredDisposals(scene);
  const baseline = census(scene);

  const knight = build();
  assert.equal(knight.kind, "kaykit-knight");
  assert.equal(scene.animatables.length, 0,
    "instantiating the figure must not restart a retained clip");

  const primary = knight.arms.primary.weapon;
  const secondary = knight.arms.secondary.weapon;
  const sword = scene.getNodeByName("kaykit:left:1H_Sword");
  const shield = scene.getNodeByName("kaykit:left:Round_Shield");
  assert.equal(sword?.parent, primary.root,
    "the creator sword visual follows the authoritative welded root");
  assert.equal(shield?.parent, secondary.root,
    "the creator shield visual follows the authoritative welded root");
  assert.equal(knight.owns(sword), false,
    "a carried weapon visual is not a body target");
  assert.equal(knight.owns(shield), false,
    "a carried shield visual is not a body target");
  assert.equal(scene.getMeshByName("left.primary.weapon.blade").isVisible, false);
  assert.equal(scene.getMeshByName("left.secondary.weapon.plate").isVisible, false);

  assert.equal(primary.shape.getNumChildren(),
    KAYKIT_KNIGHT_ASSET_PROFILE.weaponMounts.primary.geometryInSlotFrame
      .connectedComponents.count,
    "the sword collider is one exact convex hull per creator component");
  assert.equal(secondary.shape.getNumChildren(),
    KAYKIT_KNIGHT_ASSET_PROFILE.weaponMounts.secondary.geometryInSlotFrame
      .connectedComponents.count,
    "the shield collider is one exact convex hull per creator component");
  const swordPoints = worldPoints(sword);
  const swordBounds = pointBounds(swordPoints);
  const swordColliderBounds = primary.body.getBoundingBox();
  assert.ok(Vector3.Distance(swordBounds.min, swordColliderBounds.minimumWorld) < 0.005,
    `sword minimum visible=${swordBounds.min} collider=${swordColliderBounds.minimumWorld}`);
  assert.ok(Vector3.Distance(swordBounds.max, swordColliderBounds.maximumWorld) < 0.005,
    `the authoritative sword collider spans the exact visible creator geometry: visible=${swordBounds.max} collider=${swordColliderBounds.maximumWorld}`);
  const shieldPoints = worldPoints(shield);
  const shieldBounds = pointBounds(shieldPoints);
  const shieldColliderBounds = secondary.body.getBoundingBox();
  assert.ok(Vector3.Distance(shieldBounds.min, shieldColliderBounds.minimumWorld) < 0.005);
  assert.ok(Vector3.Distance(shieldBounds.max, shieldColliderBounds.maximumWorld) < 0.005,
    `the authoritative shield collider spans the exact visible creator geometry: visible=${shieldBounds.max} collider=${shieldColliderBounds.maximumWorld}`);
  const blade = primary.bladeDirection();
  const edge = primary.edgeDirection();
  const flat = primary.flatDirection();
  const bladeRange = projectedRange(swordPoints, blade, primary.root.absolutePosition);
  const edgeRange = projectedRange(swordPoints, edge, primary.root.absolutePosition);
  const flatRange = projectedRange(swordPoints, flat, primary.root.absolutePosition);
  assert.ok(Math.abs(bladeRange[1] - primary.tipOffset) < 1e-6,
    `the scored tip ${primary.tipOffset} is the creator sword's farthest point ${bladeRange[1]} on its native long axis`);
  assert.ok(bladeRange[1] - bladeRange[0] > (edgeRange[1] - edgeRange[0]) * 3);
  assert.ok(edgeRange[1] - edgeRange[0] > flatRange[1] - flatRange[0],
    "the scored edge and flat are the creator sword's second and third principal axes");

  const regionNames = new Set(knight.costume.map((mesh) => {
    const marker = mesh.name.lastIndexOf("__region_");
    return marker < 0 ? null : mesh.name.slice(marker + "__region_".length).replace(/_primitive\d+$/, "");
  }));
  for (const region of Object.keys(KAYKIT_NIGHT_REGION_BOUNDS())) {
    assert.ok(regionNames.has(region), `the published figure owns ${region}`);
  }

  knight.sever(knight.limbs.find(({ key }) => key === "hand"), new Vector3(1, 0, 0));
  assert.equal(knight.owns(sword), false,
    "a dropped creator weapon never becomes a body target");

  const skinObserver = knight.figure.observer;
  assert.ok(scene.onBeforeRenderObservable.observers.includes(skinObserver));
  knight.dispose();
  // Babylon defers removal while an observable may be iterating. Observe the
  // public collection after that queue has drained instead of coupling the
  // lifecycle proof to Observer's private `_willBeUnregistered` flag.
  await new Promise((resolve) => setTimeout(resolve, 0));
  drainDeferredDisposals(scene);
  assert.equal(scene.onBeforeRenderObservable.observers.includes(skinObserver), false,
    "disposing the Knight removes its solver-to-skin render observer");
  assert.deepEqual(census(scene), baseline,
    "the imported skeleton, meshes, observers and transferred visuals return to baseline");
});
