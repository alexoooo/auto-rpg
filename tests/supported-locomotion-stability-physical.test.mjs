import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate.js";
import { PhysicsShapeType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";
import { Scene } from "@babylonjs/core/scene.js";
import HavokPhysics from "@babylonjs/havok";

import { CONFIG } from "../src/config.ts";
import { stepPair } from "../src/fighter.ts";
import { idleMind } from "../src/mind.ts";
import { attachPhysics, COLLIDES, LAYER } from "../src/physics.ts";
import { flatSupportedWorldRegistry } from "../src/supported-locomotion-production.ts";
import { SUPPORTED_LOCOMOTION_V1 } from "../src/supported-locomotion-state.ts";
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
  // The golem is the only body in the tree, and the thresholds this brackets are specific
  // impulses -- mass-independent by construction (`src/supported-locomotion-state.ts`) -- so the
  // claim is the same one the Warrior used to carry it.
  const definition = unitDefinition("golem");
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

    // The divisor, from the port itself. This used to be `CONFIG.body`'s humanoid masses added
    // up, which was a real claim while the Warrior was the subject: one table fed both the rig
    // and the shove. A golem is assembled, and what its carrier holds up is not the sum of its
    // limbs -- the feet stand on the ground rather than being carried -- so the only honest
    // source for the number a shove is divided by is the port that divides by it.
    const supportedMassKg = left.locomotion.diagnostic().stability.supportedMassKg;
    assert.ok(supportedMassKg > 1,
      `a standing body with no mass cannot be shoved: read ${supportedMassKg} kg`);
    // The trunk and the piece the ragdoll hangs from, by limb key rather than by accessor. The
    // Warrior published `torso` and `pelvis` directly; a golem is assembled, so the same two
    // pieces are found in the limb list every body publishes.
    const limbNamed = (body, want) => {
      const found = body.limbs.find(({ key }) => key.includes(want));
      assert.ok(found, `no ${want} limb among ${body.limbs.map((l) => l.key).join(", ")}`);
      return found.part;
    };
    const trunk = limbNamed(left, "trunk.core");
    const standingTorsoY = trunk.mesh.position.y;
    left.queueStabilityEvent({ horizontalShoveNs: [specificImpulseMps * supportedMassKg, 0] });
    step(8 * FIXED);

    const diagnostic = left.locomotion.diagnostic();
    const state = left.locomotion.state;
    if (state === "fallen") {
      // Two seconds, not the half-second this ran for while the body was a Warrior. A golem
      // that has just been released is a stack of heavy modules on stiff joints: measured, its
      // trunk has dropped 3 mm after 0.5 s and clears the 20 mm bar somewhere after that.
      for (let index = 9; index < 489; index += 1) step(index * FIXED);
    }
    return Object.freeze({ state,
      ragdollDropM: standingTorsoY - trunk.mesh.position.y,
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
  // The braced pair, and the reason they are not the bare `SUPPORTED_LOCOMOTION_V1` numbers. This
  // cell used to run a Warrior and read 0.006 / 0.014 straight off the port. The body is a golem
  // now, and a golem stands braced -- `BRACE_CAPACITY_MULTIPLIER` is 1.50 -- so the thresholds it
  // publishes are the frozen ones times that multiplier. Derived here rather than typed as two
  // more literals, so that moving either the base value or the brace shows up as one failure
  // naming which of the two moved.
  const V1 = SUPPORTED_LOCOMOTION_V1;
  const stagger = V1.STAGGER_SPECIFIC_IMPULSE_MPS * V1.BRACE_CAPACITY_MULTIPLIER;
  const fall = V1.FALL_SPECIFIC_IMPULSE_MPS * V1.BRACE_CAPACITY_MULTIPLIER;
  const cells = [
    { id: "below-stagger", specificImpulseMps: stagger - epsilon,
      expectedState: "supported", },
    { id: "at-stagger", specificImpulseMps: stagger,
      expectedState: "staggered", },
    { id: "below-fall", specificImpulseMps: fall - epsilon,
      expectedState: "staggered", },
    { id: "at-fall", specificImpulseMps: fall,
      expectedState: "fallen", },
  ];

  for (const cell of cells) {
    const row = await physicalCell(cell.specificImpulseMps);
    assert.equal(row.physicsHz, 240, `${cell.id} must run the production fixed-step rate`);
    assert.equal(row.staggerAtMps, stagger, `${cell.id} moved the braced stagger threshold`);
    assert.equal(row.fallAtMps, fall, `${cell.id} moved the braced fall threshold`);
    assert.ok(Math.abs(row.specificImpulseMps - cell.specificImpulseMps) < 1e-10,
      `${cell.id} did not cross the public N s / live-mass boundary exactly: ` +
      `${row.specificImpulseMps} versus ${cell.specificImpulseMps}`);
    assert.deepEqual(row.freshSupportBindings, ["left-foot", "right-foot"],
      `${cell.id} did not retain both live physical support terminals`);
    assert.equal(row.liveSupport, true, `${cell.id} lost its live support chain`);
    assert.equal(row.postureSupported, true, `${cell.id} lost its physical standing posture`);
    assert.equal(row.state, cell.expectedState, cell.id);
    // The motion type is not asserted here and the reason is the body. A Warrior's pelvis *was*
    // the animated root, so "did the support state reach Havok" and "is the pelvis ANIMATED" were
    // the same question. A golem's trunk hangs off a bodyless carrier and is dynamic whether it is
    // standing or not, so the same question is answered by `state` and by the drop below -- an
    // assertion on the motion type would pin the golem's rig rather than the support state.
    if (cell.expectedState === "fallen") assert.ok(row.ragdollDropM > 0.02,
      `${cell.id} released motion type but the fixed-step solver did not drop the torso: ${row.ragdollDropM} m`);
    assert.equal(row.releaseReason,
      cell.expectedState === "fallen" ? "stability threshold was exceeded" : null, cell.id);
  }
});
