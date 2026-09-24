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
import { unitDefinition } from "../src/units.ts";

const wasm = new URL("../node_modules/@babylonjs/havok/lib/esm/HavokPhysics.wasm", import.meta.url);
const FIXED = 1 / 240;
const EMPTY_LOADOUT = Object.freeze({ primary: "empty", secondary: "empty" });

const materialsFor = (scene) => {
  const owner = new StandardMaterial("stability-bracket.material", scene);
  return Object.freeze({ owner, fighter: Object.freeze({ flesh: owner, cloth: owner, steel: owner,
    leather: owner, brass: owner, hide: owner, wood: owner, arrowAccent: owner }) });
};

/**
 * One standing golem shoved along +x at `fraction` of one of its own lines (`line` is "stagger" or
 * "fall") along that direction, read off the standing body the step before the shove, then watched
 * for `seconds`. `landsAt`, given the tipping geometry read the step before, names the world height
 * the shove lands at; without it the shove names none, and lands at the centre of mass.
 */
const physicalCell = async (line, fraction, seconds, landsAt = null) => {
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
    // The lines along the push, from the body's own geometry (physical contact session 08).
    const lines = left.locomotion.stabilityLinesAlong(1, 0);
    const specificImpulseMps = fraction * (line === "fall" ? lines.fallAtMps : lines.staggerAtMps);
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
    const tipping = left.locomotion.diagnostic().stability.tipping;
    const atY = landsAt ? landsAt(tipping) : undefined;
    left.queueStabilityEvent({ horizontalShoveNs: [specificImpulseMps * supportedMassKg, 0],
      ...(atY === undefined ? {} : { atY }) });
    step(8 * FIXED);

    const diagnostic = left.locomotion.diagnostic();
    const after = left.locomotion.stabilityLinesAlong(1, 0);
    const state = left.locomotion.state;
    // Every cell runs the same window after the shove, so the cells that stay up are the control
    // for the one that is released: the drop is read as the deepest the trunk went, since a released
    // body gets up again on its own inside the window (physical contact session 02).
    let ragdollDropM = 0;
    for (let index = 9; index < 9 + Math.round(seconds / FIXED); index += 1) {
      step(index * FIXED);
      ragdollDropM = Math.max(ragdollDropM, standingTorsoY - trunk.mesh.position.y);
    }
    return Object.freeze({ state, ragdollDropM, endState: left.locomotion.state, tipping,
      shovedMps: specificImpulseMps, specificImpulseMps: diagnostic.stability.specificImpulseMps,
      lines, after,
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

test("real_Havok_brackets_the_body_s_own_stagger_and_fall_lines_on_a_supported_body", async () => {
  // The lines are the standing body's own geometry along the push (physical contact session 08),
  // read off the port the step before the shove; each cell sits a hundredth either side of one.
  // A hundredth rather than the millionth the frozen lines allowed, because an idle body sways, and
  // its lines with it, between the reading and the boundary that files the shove.
  const cells = [
    { id: "below-stagger", line: "stagger", fraction: 0.99, expectedState: "supported" },
    { id: "over-stagger", line: "stagger", fraction: 1.01, expectedState: "staggered" },
    { id: "below-fall", line: "fall", fraction: 0.99, expectedState: "staggered" },
    { id: "over-fall", line: "fall", fraction: 1.01, expectedState: "fallen" },
  ];

  for (const cell of cells) {
    const row = await physicalCell(cell.line, cell.fraction, 4.5);
    assert.equal(row.physicsHz, 240, `${cell.id} must run the production fixed-step rate`);
    assert.ok(row.lines.staggerAtMps > 0 && row.lines.fallAtMps > row.lines.staggerAtMps,
      `${cell.id}: lines ${row.lines.staggerAtMps} / ${row.lines.fallAtMps}`);
    assert.ok(Math.abs(row.after.fallAtMps / row.lines.fallAtMps - 1) < 0.005 || cell.expectedState !== "supported",
      `${cell.id}: a standing body's line moved from ${row.lines.fallAtMps} to ${row.after.fallAtMps}`);
    assert.ok(Math.abs(row.specificImpulseMps - row.shovedMps) < 1e-10,
      `${cell.id} did not cross the public N s / live-mass boundary exactly: ` +
      `${row.specificImpulseMps} versus ${row.shovedMps}`);
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
    //
    // The drop is paired with its control: a released body falls, and every cell that stays standing
    // or staggered does not move.
    if (cell.expectedState === "fallen") {
      assert.ok(row.ragdollDropM > 0.001,
        `${cell.id} released motion type but the fixed-step solver did not drop the torso: ${row.ragdollDropM} m`);
      assert.equal(row.endState, "supported", `${cell.id}: the released body never got up on its own`);
    } else {
      assert.ok(row.ragdollDropM < 0.0002,
        `${cell.id} was never released and its torso still dropped ${row.ragdollDropM} m`);
    }
    assert.equal(row.releaseReason,
      cell.expectedState === "fallen" ? "stability threshold was exceeded" : null, cell.id);
  }
});

test("a_blow_s_height_reaches_the_ledger_as_its_lever_about_the_base", async () => {
  // Physical contact session 08 reads a blow by the height it landed at (`leverAt`). `Combat` names
  // that height and the state machine reads it, and both halves were tested -- while the port's
  // staging between them dropped it, so every blow in every bout landed at the centre of mass. This
  // is the whole path on a real standing body: one shove, a third of its stagger line, landed at
  // the centre of mass, at the ground and half again above the centre of mass.
  const atCentre = await physicalCell("stagger", 0.3, 0.1);
  const atGround = await physicalCell("stagger", 0.3, 0.1, (t) => t.groundY);
  const high = await physicalCell("stagger", 0.3, 0.1, (t) => t.groundY + 1.5 * t.comHeightM);
  assert.ok(Math.abs(atCentre.specificImpulseMps / atCentre.shovedMps - 1) < 1e-9,
    `a shove naming no height is read at the centre of mass: ${atCentre.specificImpulseMps} for ${atCentre.shovedMps}`);
  // Not exactly zero: an idle body sways, and its lowest point with it, between the reading and the
  // boundary that files the shove.
  assert.ok(atGround.specificImpulseMps < 1e-3 * atGround.shovedMps,
    `a shove at the ground tips nothing: ${atGround.specificImpulseMps} for ${atGround.shovedMps}`);
  assert.ok(Math.abs(high.specificImpulseMps / high.shovedMps - 1.5) < 0.02,
    `a shove half again above the centre of mass counts half again: ${high.specificImpulseMps / high.shovedMps}`);
  assert.equal(high.state, "supported", "a third of the stagger line, even at 1.5 times, stays up");
});
