import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { VertexBuffer } from "@babylonjs/core/Buffers/buffer.js";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Scene } from "@babylonjs/core/scene.js";
import HavokPhysics from "@babylonjs/havok";

import {
  compileConstruct,
  defaultConstructPartFactory,
  groundedConstructOriginY,
  resolveConstructBindTransforms,
} from "../src/construct/compile.ts";
import { constructMaterials } from "../src/construct/materials.ts";
import { wardenBlueprint } from "../src/construct/warden.ts";
import { attachPhysics, COLLIDES, LAYER, layersFor } from "../src/physics.ts";
import { moduleAtContact } from "../src/construct/damage-target.ts";

const wasm = new URL("../node_modules/@babylonjs/havok/lib/esm/HavokPhysics.wasm", import.meta.url);
const frame = (positionM = [0, 0, 0], rotation = [0, 0, 0, 1]) => ({ positionM, rotation });

const part = (id, vital = false, clearance = 0.004) => ({
  id,
  shape: { kind: "box", sizeM: [0.24, 0.24, 0.24] },
  massKg: 2,
  centreOfMassM: [0, 0, 0],
  restitution: 0.05,
  shell: { style: id === "core" ? "core" : "plate", visualClearanceM: clearance },
  health: 100,
  armour: 8,
  vitalityWeight: vital ? 1 : 0,
  fatal: vital,
  friction: 0.7,
});

const sixPartBlueprint = () => ({
  version: 1,
  id: "six-part-runtime",
  rootPart: "core",
  parts: [part("tip"), part("middle-b"), part("core", true), part("middle-d"), part("middle-a"), part("middle-c")],
  joints: ["middle-a", "middle-b", "middle-c", "middle-d", "tip"].map((child, index, names) => ({
    id: `joint-${index}`,
    parentPart: index === 0 ? "core" : names[index - 1],
    childPart: child,
    parentFrame: frame([0, 0.12, 0]),
    childFrame: frame([0, -0.12, 0]),
    angularAxes: [{ id: index % 2 === 0 ? "x" : "z", minRad: -0.6, maxRad: 0.6,
      damping: 2, maxTorqueNm: 40, maxSpeedRadS: 3 }],
    health: 50,
    armour: 4,
  })),
  sockets: [],
  modules: [],
});

const onePartBlueprint = () => ({
  version: 1,
  id: "one-part-control",
  rootPart: "control",
  parts: [{ ...part("control", true), massKg: 12 }],
  joints: [], sockets: [], modules: [],
});

const sceneHarness = async (t) => {
  const engine = new NullEngine({ renderWidth: 64, renderHeight: 64 });
  const scene = new Scene(engine);
  t.after(() => engine.dispose());
  attachPhysics(scene, await HavokPhysics({ wasmBinary: await readFile(wasm) }));
  scene.getPhysicsEngine().setSubTimeStep(1000 / 240);
  return { engine, scene };
};

const trackNativeResources = (scene) => {
  const plugin = scene.getPhysicsEngine().getPhysicsPlugin();
  plugin._constructLiveShapes = 0;
  plugin._constructLiveConstraints = 0;
  const initShape = plugin.initShape.bind(plugin);
  plugin.initShape = (...args) => {
    initShape(...args);
    plugin._constructLiveShapes += 1;
  };
  const disposeShape = plugin.disposeShape.bind(plugin);
  plugin.disposeShape = (...args) => {
    plugin._constructLiveShapes -= 1;
    disposeShape(...args);
  };
  const initConstraint = plugin.initConstraint.bind(plugin);
  plugin.initConstraint = (...args) => {
    const constraint = args[0];
    const before = constraint._pluginData?.length ?? 0;
    initConstraint(...args);
    plugin._constructLiveConstraints += (constraint._pluginData?.length ?? 0) - before;
  };
  const disposeConstraint = plugin.disposeConstraint.bind(plugin);
  plugin.disposeConstraint = (constraint) => {
    plugin._constructLiveConstraints -= constraint._pluginData?.length ?? 0;
    disposeConstraint(constraint);
  };
};

const census = (scene) => {
  const plugin = scene.getPhysicsEngine().getPhysicsPlugin();
  const active = (observable) => observable.observers.filter((observer) => !observer._willBeUnregistered).length;
  return {
    meshes: scene.meshes.length,
    transformNodes: scene.transformNodes.length,
    materials: scene.materials.length,
    textures: scene.textures.length,
    bodies: scene.getPhysicsEngine().getBodies().length,
    leafShapes: plugin._constructLiveShapes ?? 0,
    constraints: plugin._constructLiveConstraints ?? 0,
    beforePhysicsObservers: active(scene.onBeforePhysicsObservable),
    beforeRenderObservers: active(scene.onBeforeRenderObservable),
  };
};

const quaternionAxis = (rotation, axis) => axis.rotateByQuaternionToRef(rotation, new Vector3()).normalize();

test("the_compiler_places_both_sides_of_every_joint_frame_at_the_same_world_point", async (t) => {
  const { scene } = await sceneHarness(t);
  const runtime = compileConstruct(scene, sixPartBlueprint(), {
    faction: "left", origin: new Vector3(1.5, 3, -2), facing: Math.PI / 3,
  });
  t.after(() => runtime.dispose());
  for (const joint of runtime.joints.values()) {
    const frames = joint.liveFrames();
    assert.ok(Vector3.Distance(frames.parent.position, frames.child.position) < 1e-6, `${joint.id}: live origins coincide`);
    for (const axis of [Vector3.Right(), Vector3.Up(), Vector3.Forward()]) {
      assert.ok(Vector3.Dot(
        quaternionAxis(frames.parent.rotation, axis), quaternionAxis(frames.child.rotation, axis),
      ) > 1 - 1e-7, `${joint.id}: complete live orientation basis coincides`);
    }
  }
});

test("joint_orientation_bases_and_one_step_velocity_stay_neutral_at_three_world_bearings", async (t) => {
  const { scene } = await sceneHarness(t);
  const plugin = scene.getPhysicsEngine().getPhysicsPlugin();
  const runtimes = [];
  for (const [index, facing] of [0, Math.PI / 2, Math.PI].entries()) {
    const runtime = compileConstruct(scene, sixPartBlueprint(), {
      faction: "left", origin: new Vector3(index * 3, 4, 0), facing,
    });
    const control = compileConstruct(scene, onePartBlueprint(), {
      faction: "left", origin: new Vector3(index * 3, 4, 2), facing,
    });
    runtimes.push(runtime, control);
    for (const bodyPart of runtime.parts.values()) plugin.setActivationControl(bodyPart.body, 1);
    plugin.setActivationControl(control.part("control").body, 1);
    for (const joint of runtime.joints.values()) {
      const frames = joint.liveFrames();
      assert.ok(Vector3.Dot(frames.parent.axis, frames.child.axis) > 1 - 1e-7, `${facing}: hinge axes agree`);
      assert.ok(Vector3.Dot(frames.parent.perpendicular, frames.child.perpendicular) > 1 - 1e-7,
        `${facing}: perpendicular bases agree`);
    }
  }
  t.after(() => { for (const runtime of runtimes.reverse()) runtime.dispose(); });

  scene._renderId += 1;
  scene._advancePhysicsEngineStep(1000 / 60);
  for (let index = 0; index < runtimes.length; index += 2) {
    const runtime = runtimes[index];
    const control = runtimes[index + 1];
    const controlLinear = new Vector3();
    control.part("control").body.getLinearVelocityToRef(controlLinear);
    for (const bodyPart of runtime.parts.values()) {
      const linear = new Vector3();
      const angular = new Vector3();
      bodyPart.body.getLinearVelocityToRef(linear);
      bodyPart.body.getAngularVelocityToRef(angular);
      assert.ok(linear.subtract(controlLinear).length() < 0.025, `${bodyPart.id}: no constraint launch beyond falling control`);
      assert.ok(angular.length() < 0.035, `${bodyPart.id}: no frame-one angular launch`);
    }
  }
});

test("the_holding_dynamic_Warden_has_no_first_step_constraint_launch_at_four_bearings", async (t) => {
  const { scene } = await sceneHarness(t);
  const plugin = scene.getPhysicsEngine().getPhysicsPlugin();
  const runtimes = [0, Math.PI / 2, Math.PI, Math.PI * 1.5].map((facing, index) =>
    compileConstruct(scene, wardenBlueprint(), {
      faction: index % 2 === 0 ? "left" : "right",
      origin: new Vector3(index * 4, 2.5, 0),
      facing,
    }));
  t.after(() => { for (const runtime of runtimes.reverse()) runtime.dispose(); });
  for (const runtime of runtimes) for (const part of runtime.parts.values()) {
    plugin.setActivationControl(part.body, 1);
  }
  scene._renderId += 1;
  scene._advancePhysicsEngineStep(1000 / 240);
  for (const runtime of runtimes) for (const part of runtime.parts.values()) {
    const linear = part.body.getLinearVelocity();
    const angular = part.body.getAngularVelocity();
    assert.ok(Number.isFinite(linear.length()) && linear.length() < 0.35, `${part.id}: bounded first-step linear velocity`);
    assert.ok(Number.isFinite(angular.length()) && angular.length() < 0.15, `${part.id}: bounded first-step angular velocity`);
  }
});

test("the_Warden_ground_origin_is_derived_from_its_lowest_blueprint_collider", async (t) => {
  const { scene } = await sceneHarness(t);
  const runtimes = [0, Math.PI].map((facing, index) => {
    const blueprint = wardenBlueprint();
    return compileConstruct(scene, blueprint, {
      faction: index === 0 ? "left" : "right",
      origin: new Vector3(index * 4, groundedConstructOriginY(blueprint, facing), 0),
      facing,
    });
  });
  t.after(() => { for (const runtime of runtimes.reverse()) runtime.dispose(); });

  for (const runtime of runtimes) {
    const lowest = Math.min(...[...runtime.parts.values()].map((part) => part.body.getBoundingBox().minimumWorld.y));
    assert.ok(lowest >= 0 && lowest < 0.006,
      `blueprint-derived ground clearance should be a few millimetres, got ${lowest}`);
  }
});

const renderedWorldPoints = (runtimePart) => runtimePart.visual.meshes.flatMap((mesh) => {
  const positions = mesh.getVerticesData(VertexBuffer.PositionKind) ?? [];
  const world = mesh.computeWorldMatrix(true);
  const points = [];
  for (let index = 0; index < positions.length; index += 3) {
    points.push(Vector3.TransformCoordinates(new Vector3(
      positions[index], positions[index + 1], positions[index + 2],
    ), world));
  }
  return points;
});

test("rendered_part_bounds_describe_the_same_authoritative_primitive_as_collision", async (t) => {
  const { scene } = await sceneHarness(t);
  const runtime = compileConstruct(scene, sixPartBlueprint(), {
    faction: "right", origin: new Vector3(-2, 3, 1), facing: Math.PI / 2,
  });
  t.after(() => runtime.dispose());
  for (const bodyPart of runtime.parts.values()) {
    const collider = bodyPart.body.getBoundingBox();
    const clearance = bodyPart.spec.shell.visualClearanceM + 1e-5;
    const points = renderedWorldPoints(bodyPart);
    assert.ok(points.length > 0, `${bodyPart.id}: visible geometry has real vertices`);
    for (const point of points) {
      assert.ok(point.x >= collider.minimumWorld.x - clearance && point.x <= collider.maximumWorld.x + clearance,
        `${bodyPart.id}: rendered x stays within the live collider plus declared clearance`);
      assert.ok(point.y >= collider.minimumWorld.y - clearance && point.y <= collider.maximumWorld.y + clearance,
        `${bodyPart.id}: rendered y stays within the live collider plus declared clearance`);
      assert.ok(point.z >= collider.minimumWorld.z - clearance && point.z <= collider.maximumWorld.z + clearance,
        `${bodyPart.id}: rendered z stays within the live collider plus declared clearance`);
    }
  }
});

test("a_construct_build_and_dispose_returns_the_full_scene_and_constraint_census", async (t) => {
  const { scene } = await sceneHarness(t);
  trackNativeResources(scene);
  constructMaterials(scene, "left");
  const baseline = census(scene);
  const runtime = compileConstruct(scene, sixPartBlueprint(), { faction: "left", facing: 0.4 });
  assert.equal(census(scene).bodies - baseline.bodies, 6);
  assert.equal(census(scene).leafShapes - baseline.leafShapes, 12,
    "each part owns one compound container and one authoritative leaf");
  assert.equal(census(scene).constraints - baseline.constraints, 5);
  runtime.dispose();
  assert.deepEqual(census(scene), baseline);
});

test("twenty_Warden_rebuilds_return_every_body_constraint_visual_and_observer_to_baseline", async (t) => {
  const { scene } = await sceneHarness(t);
  trackNativeResources(scene);
  constructMaterials(scene, "left"); constructMaterials(scene, "right");
  const baseline = census(scene);
  for (let index = 0; index < 20; index += 1) {
    const side = index % 2 === 0 ? "left" : "right";
    const blueprint = wardenBlueprint(index % 3 === 0 ? "sword" : "crossbow");
    const runtime = compileConstruct(scene, blueprint, {
      faction: side, origin: new Vector3(0, groundedConstructOriginY(blueprint, index * 0.31), 0), facing: index * 0.31,
    });
    runtime.dispose();
    assert.deepEqual(census(scene), baseline, `rebuild ${index + 1} returned to the exact native/scene census`);
  }
});

test("a_failure_after_the_third_body_rolls_back_the_first_two_and_every_visual", async (t) => {
  const { scene } = await sceneHarness(t);
  trackNativeResources(scene);
  const palette = constructMaterials(scene, "left");
  const baseline = census(scene);
  const throwingFactory = (context) => {
    if (context.partIndex === 2) throw new Error(`injected third body failure at ${context.part.id}`);
    return defaultConstructPartFactory(context);
  };
  assert.throws(() => compileConstruct(scene, sixPartBlueprint(), {
    faction: "left", palette, partFactory: throwingFactory,
  }), /third body failure/);
  assert.deepEqual(census(scene), baseline);
});

test("a_fresh_palette_created_by_a_failed_compile_is_rolled_back_with_the_bodies", async (t) => {
  const { scene } = await sceneHarness(t);
  trackNativeResources(scene);
  // PBR creates one scene-owned BRDF lookup lazily. It is not palette-owned, so establish
  // that scene singleton before judging whether a subsequently fresh faction palette leaks.
  constructMaterials(scene, "right").dispose();
  const baseline = census(scene);
  const throwingFactory = (context) => {
    if (context.partIndex === 2) throw new Error("fresh palette rollback probe");
    return defaultConstructPartFactory(context);
  };
  assert.throws(() => compileConstruct(scene, sixPartBlueprint(), {
    faction: "left", partFactory: throwingFactory,
  }), /fresh palette rollback probe/);
  assert.deepEqual(census(scene), baseline);
});

test("part_build_order_is_topological_and_independent_of_blueprint_array_order", async (t) => {
  const { scene } = await sceneHarness(t);
  const original = sixPartBlueprint();
  const shuffled = structuredClone(original);
  shuffled.parts.reverse();
  shuffled.joints.reverse();
  const first = compileConstruct(scene, original, { faction: "left", origin: new Vector3(-2, 3, 0) });
  const second = compileConstruct(scene, shuffled, { faction: "right", origin: new Vector3(2, 3, 0) });
  t.after(() => { second.dispose(); first.dispose(); });
  assert.deepEqual(first.partOrder, ["core", "middle-a", "middle-b", "middle-c", "middle-d", "tip"]);
  assert.deepEqual(second.partOrder, first.partOrder);
  const firstTransforms = resolveConstructBindTransforms(original);
  const secondTransforms = resolveConstructBindTransforms(shuffled);
  for (const id of first.partOrder) {
    assert.ok(firstTransforms.get(id).position.equalsWithEpsilon(secondTransforms.get(id).position, 1e-9));
  }
});

test("a_visual_clearance_that_crosses_a_joint_or_neighbour_is_refused", async (t) => {
  const { scene } = await sceneHarness(t);
  const crossing = sixPartBlueprint();
  crossing.parts.find(({ id }) => id === "core").shell.visualClearanceM = 0.012;
  crossing.parts.find(({ id }) => id === "middle-b").shell.visualClearanceM = 0.012;
  const second = crossing.joints.find(({ childPart }) => childPart === "middle-b");
  second.parentFrame = frame([0, 0.015, 0]);
  second.childFrame = frame();
  assert.throws(() => compileConstruct(scene, crossing, { faction: "left" }), (error) => {
    assert.match(error.message, /core/);
    assert.match(error.message, /middle-b/);
    assert.match(error.message, /plane/);
    return true;
  });
});

test("socket_module_roots_publish_all_Warden_hardware_as_code_native_geometry", async (t) => {
  const { scene } = await sceneHarness(t);
  const blueprint = sixPartBlueprint();
  const kinds = [
    "launcher", "sword", "shield", "contact-sensor", "attitude-sensor", "opponent-sensor", "power-core", "magazine",
  ];
  blueprint.sockets = kinds.map((kind, index) => ({
    id: `socket-${index}`,
    part: index % 2 === 0 ? "core" : "middle-d",
    frame: frame([0.4 + index * 0.18, 0, 0], Quaternion.FromEulerAngles(0, index * 0.2, 0).asArray()),
    accepts: [kind],
  }));
  blueprint.modules = kinds.map((kind, index) => ({
    id: `module-${index}`,
    kind,
    socket: `socket-${index}`,
    compatibilityTag: kind,
    geometry: [
      { id: "shell", frame: frame(), shape: { kind: "box", sizeM: [0.2, 0.16, 0.3] },
        shell: { style: "plate", visualClearanceM: 0.003 } },
      { id: "mount", frame: frame([0, -0.1, 0]), shape: { kind: "cylinder", lengthM: 0.12, radiusM: 0.06 },
        shell: { style: "bearing", visualClearanceM: 0.002 } },
    ],
    massKg: 2,
    health: 80,
    armour: 6,
    ...(kind.endsWith("sensor") ? { sensorChannels: [`channel-${index}`] } : {}),
    ...(kind === "power-core" ? { capacityJ: 900, maxOutputW: 240 } : {}),
    ...(kind === "magazine" ? { ammunition: 12 } : {}),
    ...(kind === "sword" ? { striker: { localTipM: [0, 0, 0.15], localEdgeDirection: [1, 0, 0],
      localFlatDirection: [0, 1, 0], damageScale: 1 } } : {}),
    ...(kind === "launcher" ? { maxHeatJ: 500, coolingW: 20, reloadSeconds: 0.5,
      heatPerShotJ: 35, energyPerShotJ: 80, projectile: { poolSize: 8, massKg: 0.05,
        radiusM: 0.015, lengthM: 0.4, muzzleSpeedMps: 35, damageScale: 1 } } : {}),
  }));
  const runtime = compileConstruct(scene, blueprint, { faction: "left", origin: new Vector3(0, 3, 0) });
  t.after(() => runtime.dispose());
  assert.deepEqual([...runtime.modules.values()].map(({ spec }) => spec.kind), kinds);
  for (const module of runtime.modules.values()) {
    assert.equal(module.root.parent, module.socket.part.node, `${module.spec.kind}: root is mounted in its socket's part frame`);
    assert.ok(module.root.position.equalsWithEpsilon(Vector3.FromArray(module.socket.spec.frame.positionM), 1e-9));
    assert.equal(module.leafShapes.length, module.spec.geometry.length,
      `${module.spec.kind}: every visible blueprint primitive is also a physical compound child`);
    assert.ok(module.visual.meshes.length >= 2, `${module.spec.kind}: recognisable hardware is more than one placeholder box`);
    for (const mesh of module.visual.meshes) {
      const role = mesh.metadata.constructSurfaceRole;
      const family = mesh.material.metadata.constructSurfaceFamily;
      if (role === "joint" || role === "mount") assert.equal(family, "functionalMetal");
      if (role === "shell") assert.equal(family, "carvedStone", `${module.spec.kind}: load-bearing shell stays stone`);
    }
  }
  for (const bodyPart of runtime.parts.values()) {
    const installed = [...runtime.modules.values()].filter((module) => module.socket.part.id === bodyPart.id);
    const expectedMass = bodyPart.spec.massKg + installed.reduce((sum, module) => sum + module.spec.massKg, 0);
    assert.ok(Math.abs(bodyPart.body.getMassProperties().mass - expectedMass) < 1e-9,
      `${bodyPart.id}: blueprint module mass belongs to the physical owner body`);
    assert.equal(bodyPart.shape.getNumChildren(), 1 + installed.reduce((sum, module) => sum + module.spec.geometry.length, 0));
  }
  const contacted = runtime.modules.get("module-0");
  const contactPoint = Vector3.TransformCoordinates(new Vector3(0.1, 0, 0), contacted.root.computeWorldMatrix(true));
  assert.equal(moduleAtContact(runtime, contacted.socket.part.body, contactPoint), contacted,
    "a real compound-body contact resolves to its blueprint leaf although Havok publishes only the owner body");
  const detachedModule = runtime.modules.get("module-1");
  runtime.detachSubtree("middle-d");
  assert.equal(detachedModule.socket.part.id, "middle-d");
  for (const leaf of detachedModule.leafShapes) {
    assert.equal(leaf.filterMembershipMask, LAYER.DEBRIS);
    assert.equal(leaf.filterCollideMask, COLLIDES.DEBRIS);
  }
  const coreShell = runtime.part("core").visual.meshes.find((mesh) => mesh.name.endsWith(".shell"));
  assert.equal(coreShell.material.metadata.rockyGrain, true, "the default body shell visibly uses generated stone grain");
});

test("intact_owner_parts_share_the_side_exemption_and_a_detached_subtree_becomes_debris", async (t) => {
  const { scene } = await sceneHarness(t);
  trackNativeResources(scene);
  const runtime = compileConstruct(scene, sixPartBlueprint(), { faction: "right", origin: new Vector3(0, 3, 0) });
  t.after(() => runtime.dispose());
  const intact = layersFor("right");
  for (const bodyPart of runtime.parts.values()) {
    for (const leaf of bodyPart.leafShapes) {
      assert.equal(leaf.filterMembershipMask, intact.arm);
      assert.equal(leaf.filterCollideMask, intact.armCollides);
    }
  }
  const before = census(scene).constraints;
  assert.deepEqual(runtime.detachSubtree("middle-c"), ["middle-c", "middle-d", "tip"]);
  assert.equal(census(scene).constraints, before - 1, "only the severed boundary constraint is released");
  for (const id of ["middle-c", "middle-d", "tip"]) {
    for (const leaf of runtime.part(id).leafShapes) {
      assert.equal(leaf.filterMembershipMask, LAYER.DEBRIS);
      assert.equal(leaf.filterCollideMask, COLLIDES.DEBRIS);
    }
  }
  for (const id of ["core", "middle-a", "middle-b"]) {
    for (const leaf of runtime.part(id).leafShapes) {
      assert.equal(leaf.filterMembershipMask, intact.arm);
      assert.equal(leaf.filterCollideMask, intact.armCollides);
    }
  }
});
