import assert from "node:assert/strict";
import test from "node:test";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";

import { compileConstruct, groundedConstructOriginY } from "../src/construct/compile.ts";
import { humanoidBlueprint } from "../src/construct/humanoid.ts";
import { createConstructHeadlessArena } from "../scripts/construct-headless-arena.mjs";
import { assertScaledSupportedLocomotionCorpus,
  runScaledSupportedLocomotionCorpus } from "../scripts/scaled-supported-locomotion.mjs";
import { CONSTRUCT_GROUND_CLEARANCE_M, scaledLocomotionFixture,
  SCALED_LOCOMOTION_BODY_SCALE, SCALED_LOCOMOTION_MASS_SCALE,
  SCALED_LOCOMOTION_TARGET_CROWN_M } from "./fixtures/scaled-locomotion-blueprint.mjs";

const near = (actual, expected, tolerance = 1e-12, message = "values differ") =>
  assert.ok(Math.abs(actual - expected) <= tolerance,
    `${message}: expected ${expected}, got ${actual}`);

const boxMomentX = (part) => part.massKg *
  (part.shape.sizeM[1] ** 2 + part.shape.sizeM[2] ** 2) / 12;

test("the_zero_pi_0_90_m_fixture_physically_compiles_with_one_pinned_scale", async () => {
  const original = humanoidBlueprint();
  const fixture = scaledLocomotionFixture();
  const scaled = fixture.blueprint;
  near(fixture.profile.crownHeight, SCALED_LOCOMOTION_TARGET_CROWN_M, 1e-12,
    "the measured collider crown must be exactly the named physical scale");
  assert.equal(fixture.blueprintDigest, "cb2e2715",
    "the validated fixture's canonical physics identity is pinned");
  assert.notEqual(SCALED_LOCOMOTION_BODY_SCALE,
    SCALED_LOCOMOTION_TARGET_CROWN_M / 1.8995,
    "the fixed world clearance is not silently similarity-scaled as body geometry");
  near(CONSTRUCT_GROUND_CLEARANCE_M +
    (1.8995 - CONSTRUCT_GROUND_CLEARANCE_M) * SCALED_LOCOMOTION_BODY_SCALE,
  SCALED_LOCOMOTION_TARGET_CROWN_M);

  const part = (blueprint, id) => blueprint.parts.find((candidate) => candidate.id === id);
  const module = (blueprint, id) => blueprint.modules.find((candidate) => candidate.id === id);
  const baseTorso = part(original, "torso"); const scaledTorso = part(scaled, "torso");
  near(scaledTorso.shape.sizeM[1] / baseTorso.shape.sizeM[1], SCALED_LOCOMOTION_BODY_SCALE);
  near(scaledTorso.massKg / baseTorso.massKg, SCALED_LOCOMOTION_MASS_SCALE);
  near(scaledTorso.shell.visualClearanceM / baseTorso.shell.visualClearanceM,
    SCALED_LOCOMOTION_BODY_SCALE, 1e-12, "the visual shell is part of the scaled body envelope");
  near(boxMomentX(scaledTorso) / boxMomentX(baseTorso), SCALED_LOCOMOTION_BODY_SCALE ** 5,
    1e-12, "shape-derived rigid-body inertia must follow m * length squared");
  const baseHip = original.joints.find(({ id }) => id === "left-hip");
  const scaledHip = scaled.joints.find(({ id }) => id === "left-hip");
  near(scaledHip.parentFrame.positionM[0] / baseHip.parentFrame.positionM[0],
    SCALED_LOCOMOTION_BODY_SCALE);
  const baseSwordSocket = original.sockets.find(({ id }) => id === "socket-sword-hand");
  const scaledSwordSocket = scaled.sockets.find(({ id }) => id === "socket-sword-hand");
  near(scaledSwordSocket.frame.positionM[1] / baseSwordSocket.frame.positionM[1],
    SCALED_LOCOMOTION_BODY_SCALE, 1e-12,
    "the body mount moves with the scaled arm even though the carried weapon does not scale");
  const basePad = module(original, "contact-left-foot");
  const scaledPad = module(scaled, "contact-left-foot");
  near(scaledPad.geometry[0].shape.sizeM[2] / basePad.geometry[0].shape.sizeM[2],
    SCALED_LOCOMOTION_BODY_SCALE, 1e-12, "contact geometry must be physically scaled too");
  near(scaledPad.massKg / basePad.massKg, SCALED_LOCOMOTION_MASS_SCALE);
  const baseSword = module(original, "effigy-sword");
  const scaledSword = module(scaled, "effigy-sword");
  assert.deepEqual({ massKg: scaledSword.massKg, geometry: scaledSword.geometry,
    striker: scaledSword.striker }, { massKg: baseSword.massKg, geometry: baseSword.geometry,
    striker: baseSword.striker }, "the ordinary held weapon is not similarity-scaled");

  for (const [faction, facing] of [["left", 0], ["right", Math.PI]]) {
    const arena = await createConstructHeadlessArena();
    const runtime = compileConstruct(arena.scene, scaled, { faction,
      origin: new Vector3(0, groundedConstructOriginY(scaled, facing), 0), facing });
    try {
      const head = runtime.part("head");
      const headRadius = scaled.parts.find(({ id }) => id === "head").shape.radiusM;
      near(head.node.position.y + headRadius, SCALED_LOCOMOTION_TARGET_CROWN_M, 1e-12,
        `facing ${facing} compiled a differently sized physical crown`);
      const actual = head.node.rotationQuaternion ?? Quaternion.Identity();
      near(Math.abs(Quaternion.Dot(actual, Quaternion.FromEulerAngles(0, facing, 0))), 1, 1e-12,
        `facing ${facing} was not retained by the physical root`);
      assert.equal(runtime.parts.size, scaled.parts.length);
      assert.equal(runtime.modules.get("effigy-sword").spec.massKg, 1.4);
    } finally {
      runtime.dispose();
      arena.dispose();
    }
  }
});

test("the_same_supported_body_moves_and_recovers_at_zero_pi_and_0_90_m_scale", async () => {
  const report = assertScaledSupportedLocomotionCorpus(await runScaledSupportedLocomotionCorpus());
  for (const [constructSide, facing] of [["left", 0], ["right", Math.PI]]) {
    const suffix = constructSide === "left" ? "left-yaw-0" : "right-yaw-pi";
    const moving = report.cells.find(({ id }) => id === `scaled-move-${suffix}`);
    assert.equal(moving.locomotionMode, "supported", `facing ${facing} did not select supported mode`);
    assert.equal(moving.finalDiagnostic.state.state, "supported",
      `facing ${facing} lost support during the scale-sensitive movement bracket`);
    assert.ok(moving.constructRootDisplacementM > 0.25,
      `facing ${facing} moved only ${moving.constructRootDisplacementM} m through Havok`);
    assert.ok(moving.locomotionSteps.some(({ construct }) =>
      construct.freshSupportBindings.length > 0), `facing ${facing} never measured real foot support`);

    const recovery = report.cells.find(({ id }) => id === `scaled-recovery-${suffix}`);
    assert.deepEqual(recovery.stabilityShoves,
      [{ atStep: 360, horizontalShoveNs: [0.5, 0] }]);
    const states = recovery.locomotionTimeline.map(({ construct }) => construct?.state.state);
    const fallen = states.indexOf("fallen");
    const rising = states.indexOf("rising", fallen + 1);
    const recovered = states.indexOf("supported", rising + 1);
    assert.ok(fallen >= 0 && rising > fallen && recovered > rising,
      `facing ${facing} did not complete supported -> fallen -> rising -> supported: ${states}`);
    assert.equal(recovery.finalDiagnostic.state.state, "supported",
      `facing ${facing} did not finish with restored supported authority`);
    assert.equal(recovery.finalDiagnostic.postureSupported, true,
      `facing ${facing} recovered the state label without recovering physical posture`);
  }
  const removed = structuredClone(report);
  removed.cells.length -= 1;
  assert.throws(() => assertScaledSupportedLocomotionCorpus(removed),
    /exact four-cell scaled matrix changed/);
});
