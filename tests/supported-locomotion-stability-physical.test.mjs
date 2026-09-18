import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate.js";
import { PhysicsMotionType, PhysicsShapeType } from
  "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";
import { Scene } from "@babylonjs/core/scene.js";
import HavokPhysics from "@babylonjs/havok";

import { CONFIG } from "../src/config.ts";
import { stepPair } from "../src/fighter.ts";
import { idleMind } from "../src/mind.ts";
import { attachPhysics, COLLIDES, LAYER } from "../src/physics.ts";
import { flatSupportedWorldRegistry } from "../src/supported-locomotion-production.ts";
import { unitDefinition } from "../src/units.ts";

const wasm = new URL("../node_modules/@babylonjs/havok/lib/esm/HavokPhysics.wasm", import.meta.url);
const FIXED = 1 / 240;
const EMPTY_LOADOUT = Object.freeze({ primary: "empty", secondary: "empty" });

const materialsFor = (scene) => {
  const owner = new StandardMaterial("stability-bracket.material", scene);
  return Object.freeze({ owner, fighter: Object.freeze({ flesh: owner, cloth: owner, steel: owner,
    leather: owner, brass: owner, hide: owner, wood: owner, arrowAccent: owner }) });
};

const physicalCell = async (specificImpulseMps) => {
  const engine = new NullEngine({ renderWidth: 64, renderHeight: 64 });
  const scene = new Scene(engine);
  attachPhysics(scene, await HavokPhysics({ wasmBinary: await readFile(wasm) }));
  scene.getPhysicsEngine().setSubTimeStep(1000 / 240);

  const ground = MeshBuilder.CreateBox("stability-bracket.ground",
    { width: 12, height: 1, depth: 12 }, scene);
  ground.position.y = -0.5;
  const groundBody = new PhysicsAggregate(ground, PhysicsShapeType.BOX,
    { mass: 0, friction: 0.9, restitution: 0 }, scene);
  groundBody.shape.filterMembershipMask = LAYER.WORLD;
  groundBody.shape.filterCollideMask = COLLIDES.WORLD;

  const materials = materialsFor(scene);
  const world = flatSupportedWorldRegistry();
  const definition = unitDefinition("warrior");
  const build = (side, z, facing) => definition.build({ scene, side,
    origin: new Vector3(0, 0, z), facing, mind: idleMind(), loadout: EMPTY_LOADOUT,
    materials: materials.fighter, locomotionMode: "supported", locomotionWorld: world });
  const left = build("left", -2, 0);
  const right = build("right", 2, Math.PI);
  const step = (clock) => {
    stepPair(left, right, FIXED, clock);
    scene._renderId += 1;
    scene._advancePhysicsEngineStep(1000 * FIXED);
  };

  try {
    const plugin = scene.getPhysicsEngine().getPhysicsPlugin();
    for (const fighter of [left, right]) for (const { part } of fighter.limbs) {
      plugin.setActivationControl(part.body, 1);
    }
    for (let index = 0; index < 8; index += 1) step(index * FIXED);

    const physicalMassKg = left.limbs.reduce((sum, { part }) =>
      sum + part.body.getMassProperties().mass, 0);
    const B = CONFIG.body; const A = CONFIG.arm;
    const supportedMassKg = B.torsoMass + B.headMass + B.pelvisMass +
      2 * (B.thighMass + B.shinMass) + 2 * (A.upperMass + A.foreMass + A.handMass);
    assert.ok(Math.abs(physicalMassKg - supportedMassKg) < 1e-5,
      `the public Havok bodies weigh ${physicalMassKg} kg, not the port's ${supportedMassKg} kg`);
    const standingTorsoY = left.torso.mesh.position.y;
    left.queueStabilityEvent({ horizontalShoveNs: [specificImpulseMps * supportedMassKg, 0] });
    step(8 * FIXED);

    const diagnostic = left.locomotion.diagnostic();
    const state = left.locomotion.state;
    const motionType = left.pelvis.body.getMotionType();
    if (state === "fallen") {
      for (let index = 9; index < 129; index += 1) step(index * FIXED);
    }
    return Object.freeze({ state, motionType,
      ragdollDropM: standingTorsoY - left.torso.mesh.position.y,
      specificImpulseMps: diagnostic.stability.specificImpulseMps,
      staggerAtMps: diagnostic.stability.staggerAtMps,
      fallAtMps: diagnostic.stability.fallAtMps,
      freshSupportBindings: diagnostic.freshSupportBindings,
      liveSupport: diagnostic.liveSupport,
      postureSupported: diagnostic.postureSupported,
      releaseReason: diagnostic.releaseReason,
      physicsHz: CONFIG.world.physicsHz });
  } finally {
    left.dispose(); right.dispose(); materials.owner.dispose(false, false);
    scene.dispose(); engine.dispose();
  }
};

test("real_Havok_brackets_the_frozen_stagger_and_fall_thresholds_on_a_supported_body", async () => {
  const epsilon = 1e-6;
  const cells = [
    { id: "below-stagger", specificImpulseMps: 0.006 - epsilon,
      expectedState: "supported", expectedMotion: PhysicsMotionType.ANIMATED },
    { id: "at-stagger", specificImpulseMps: 0.006,
      expectedState: "staggered", expectedMotion: PhysicsMotionType.ANIMATED },
    { id: "below-fall", specificImpulseMps: 0.014 - epsilon,
      expectedState: "staggered", expectedMotion: PhysicsMotionType.ANIMATED },
    { id: "at-fall", specificImpulseMps: 0.014,
      expectedState: "fallen", expectedMotion: PhysicsMotionType.DYNAMIC },
  ];

  for (const cell of cells) {
    const row = await physicalCell(cell.specificImpulseMps);
    assert.equal(row.physicsHz, 240, `${cell.id} must run the production fixed-step rate`);
    assert.equal(row.staggerAtMps, 0.006, `${cell.id} moved the frozen stagger threshold`);
    assert.equal(row.fallAtMps, 0.014, `${cell.id} moved the frozen fall threshold`);
    assert.ok(Math.abs(row.specificImpulseMps - cell.specificImpulseMps) < 1e-10,
      `${cell.id} did not cross the public N s / live-mass boundary exactly: ` +
      `${row.specificImpulseMps} versus ${cell.specificImpulseMps}`);
    assert.deepEqual(row.freshSupportBindings, ["left-leg", "right-leg"],
      `${cell.id} did not retain both live physical support terminals`);
    assert.equal(row.liveSupport, true, `${cell.id} lost its live support chain`);
    assert.equal(row.postureSupported, true, `${cell.id} lost its physical standing posture`);
    assert.equal(row.state, cell.expectedState, cell.id);
    assert.equal(row.motionType, cell.expectedMotion,
      `${cell.id} did not apply the support state to the real Havok pelvis`);
    if (cell.expectedState === "fallen") assert.ok(row.ragdollDropM > 0.02,
      `${cell.id} released motion type but the fixed-step solver did not drop the torso: ${row.ragdollDropM} m`);
    assert.equal(row.releaseReason,
      cell.expectedState === "fallen" ? "stability threshold was exceeded" : null, cell.id);
  }
});
