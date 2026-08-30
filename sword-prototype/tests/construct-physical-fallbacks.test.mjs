import assert from "node:assert/strict";
import test from "node:test";

import { CONFIG } from "../src/config.ts";
import { SUPPORTED_BIPED_LIMP_V1 } from "../src/construct/biped.ts";
import { saveConstruct } from "../src/construct/codec.ts";
import { humanoidSavedConstruct, HUMANOID_SENSORS } from "../src/construct/humanoid.ts";
import { ConstructLabBout } from "../src/construct/lab-bout.ts";
import { SUPPORTED_QUADRUPED_CRAWL_V1 } from "../src/construct/locomotion.ts";
import { WARDEN_SENSORS, wardenBlueprint, wardenControl, wardenProgram } from "../src/construct/warden.ts";
import { createConstructHeadlessArena } from "../scripts/construct-headless-arena.mjs";

const FIXED = 1 / CONFIG.world.physicsHz;
const SETTLE_STEPS = CONFIG.world.physicsHz;
const MOTION_STEPS = CONFIG.world.physicsHz * 2;
const EMPTY = Object.freeze({ version: 1, requests: Object.freeze([]) });
const command = (action, parameters = {}) => Object.freeze({ version: 1, requests: Object.freeze([Object.freeze({
  request: Object.freeze({ action, parameters: Object.freeze(parameters) }),
  priority: 100, sourceIndex: 0,
})]) });
const horizontalDistance = (left, right) => Math.hypot(right.x - left.x, right.z - left.z);
const horizontalSpeed = (construct) => {
  const velocity = construct.runtime.part(construct.runtime.blueprint.rootPart).body.getLinearVelocity();
  return Math.hypot(velocity.x, velocity.z);
};
const capability = (snapshot, action) => snapshot.capabilities.find((row) => row.action === action);

async function measureHumanoidHipFallback(lostSide) {
  const arena = await createConstructHeadlessArena();
  const saved = humanoidSavedConstruct();
  const bout = new ConstructLabBout(arena.scene, saved, saved, HUMANOID_SENSORS, 9);
  const construct = bout.construct("left");
  const survivingSide = lostSide === "left" ? "right" : "left";
  const selectedAction = `limp-${survivingSide}`;
  const selectedSpec = saved.control.actions.find(({ id }) => id === selectedAction);
  try {
    bout.construct("right").control.installCommandSource("physical-fallback-idle", () => EMPTY);
    construct.control.installCommandSource("physical-fallback-settle", () => command("brace"));
    let settled;
    for (let step = 0; step < SETTLE_STEPS; step += 1) settled = bout.step(FIXED).left;
    assert.equal(settled.snapshot.facts[`contact-${lostSide}-foot`], true,
      `${lostSide} foot never physically settled before severing`);
    assert.equal(settled.snapshot.facts[`contact-${survivingSide}-foot`], true,
      `${survivingSide} foot never physically settled before severing`);

    construct.state.severJoint(`${lostSide}-hip`);
    construct.control.installCommandSource(`physical-${selectedAction}`, () =>
      command(selectedAction, { forward: 1, right: 0, yaw: 0,
        speed: SUPPORTED_BIPED_LIMP_V1.MAX_SPEED_MPS }));
    const start = construct.centre().clone();
    let final = null;
    let admittedSamples = 0; let activeSamples = 0; let unsupportedMotionSamples = 0;
    let maximumRootSpeedMps = 0; let maximumAllowedSpeedMps = 0;
    for (let step = 0; step < MOTION_STEPS; step += 1) {
      final = bout.step(FIXED).left;
      const selected = capability(final.snapshot, selectedAction);
      if (selected?.available) admittedSamples += 1;
      if (final.snapshot.active.some(({ action }) => action === selectedAction)) activeSamples += 1;
      const locomotion = final.snapshot.locomotion;
      const allowedSpeed = locomotion?.allowed === null || locomotion?.allowed === undefined ? 0 :
        Math.hypot(locomotion.allowed.localForward, locomotion.allowed.localRight) * 1.6;
      maximumAllowedSpeedMps = Math.max(maximumAllowedSpeedMps, allowedSpeed);
      maximumRootSpeedMps = Math.max(maximumRootSpeedMps, horizontalSpeed(construct));
      if (allowedSpeed > 1e-6 && (final.snapshot.facts[`contact-${survivingSide}-foot`] !== true ||
          !locomotion.freshSupportBindings.includes(`${survivingSide}-foot`))) {
        unsupportedMotionSamples += 1;
      }
    }
    return Object.freeze({ lostSide, survivingSide, selectedAction,
      controller: selectedSpec.controller, parameterSpeedMaxMps: selectedSpec.parameters.speed.max, start,
      end: construct.centre().clone(), final, admittedSamples, activeSamples,
      unsupportedMotionSamples, maximumRootSpeedMps, maximumAllowedSpeedMps });
  } finally { bout.dispose(); arena.dispose(); }
}

test("each_physically_severed_humanoid_hip_admits_only_the_exact_surviving_limp", async () => {
  for (const lostSide of ["left", "right"]) {
    const row = await measureHumanoidHipFallback(lostSide);
    const lostAction = `limp-${row.lostSide}`;
    assert.equal(capability(row.final.snapshot, "move").available, false, row.lostSide);
    assert.equal(capability(row.final.snapshot, lostAction).available, false, row.lostSide);
    assert.equal(capability(row.final.snapshot, row.selectedAction).available, true, row.lostSide);
    assert.equal(row.controller, `supported-biped-limp-${row.survivingSide}`);
    assert.equal(row.parameterSpeedMaxMps, SUPPORTED_BIPED_LIMP_V1.MAX_SPEED_MPS);
    assert.equal(row.admittedSamples, MOTION_STEPS, JSON.stringify(row));
    assert.ok(row.activeSamples > MOTION_STEPS * 0.8, JSON.stringify(row));
  }
});

test("a_physical_one_support_limp_moves_at_lower_authority_without_air_walking", async () => {
  for (const lostSide of ["left", "right"]) {
    const row = await measureHumanoidHipFallback(lostSide);
    const displacementM = horizontalDistance(row.start, row.end);
    const forwardDisplacementM = row.end.z - row.start.z;
    assert.ok(row.maximumAllowedSpeedMps <= SUPPORTED_BIPED_LIMP_V1.MAX_SPEED_MPS + 1e-9,
      JSON.stringify(row));
    assert.ok(row.maximumRootSpeedMps <= SUPPORTED_BIPED_LIMP_V1.MAX_SPEED_MPS + 0.08,
      JSON.stringify(row));
    assert.equal(row.unsupportedMotionSamples, 0, JSON.stringify(row));
    assert.equal(row.final.snapshot.locomotion.state.state, "supported", JSON.stringify(row));
    assert.ok(displacementM > 0.25, `${lostSide} limp displacement ${displacementM}: ${JSON.stringify(row)}`);
    assert.ok(forwardDisplacementM > 0.25,
      `${lostSide} limp forward displacement ${forwardDisplacementM}: ${JSON.stringify(row)}`);
  }
});

test("a_physically_severed_Warden_limb_executes_only_its_exact_three_support_crawl", async () => {
  const arena = await createConstructHeadlessArena();
  const blueprint = wardenBlueprint("crossbow");
  const control = wardenControl("crossbow", "assisted");
  const saved = saveConstruct("Physical fallback Warden", blueprint, control,
    wardenProgram("crossbow", "assisted"), WARDEN_SENSORS);
  const bout = new ConstructLabBout(arena.scene, saved, saved, WARDEN_SENSORS, 9);
  const construct = bout.construct("left");
  const missing = "front-left";
  const selectedAction = `crawl-without-${missing}`;
  const selectedSpec = control.actions.find(({ id }) => id === selectedAction);
  try {
    bout.construct("right").control.installCommandSource("physical-fallback-idle", () => EMPTY);
    construct.control.installCommandSource("physical-fallback-settle", () => command("brace"));
    let settled;
    for (let step = 0; step < SETTLE_STEPS; step += 1) settled = bout.step(FIXED).left;
    for (const side of ["front-left", "front-right", "rear-left", "rear-right"]) {
      assert.equal(settled.snapshot.facts[`contact-foot-${side}`], true,
        `${side} foot never physically settled before severing`);
    }

    construct.state.severJoint(`bearing-${missing}-upper`);
    construct.control.installCommandSource("physical-three-support-crawl", () =>
      command(selectedAction, { forward: 1, right: 0, yaw: 0,
        speed: SUPPORTED_QUADRUPED_CRAWL_V1.MAX_SPEED_MPS }));
    const start = construct.centre().clone();
    let final = null; let admittedSamples = 0; let activeSamples = 0;
    let maximumAllowedSpeedMps = 0; let maximumRootSpeedMps = 0; let unsupportedMotionSamples = 0;
    const exactFreshSupports = ["front-right", "rear-left", "rear-right"];
    for (let step = 0; step < MOTION_STEPS; step += 1) {
      final = bout.step(FIXED).left;
      if (capability(final.snapshot, selectedAction)?.available) admittedSamples += 1;
      if (final.snapshot.active.some(({ action }) => action === selectedAction)) activeSamples += 1;
      const allowed = final.snapshot.locomotion?.allowed;
      const allowedSpeedMps = allowed ? Math.hypot(allowed.localForward, allowed.localRight) * 1.6 : 0;
      maximumAllowedSpeedMps = Math.max(maximumAllowedSpeedMps, allowedSpeedMps);
      maximumRootSpeedMps = Math.max(maximumRootSpeedMps, horizontalSpeed(construct));
      if (allowedSpeedMps > 1e-6 && exactFreshSupports.some((role) =>
        final.snapshot.facts[`contact-foot-${role}`] !== true ||
        !final.snapshot.locomotion.freshSupportBindings.includes(role))) unsupportedMotionSamples += 1;
    }
    const displacementM = horizontalDistance(start, construct.centre());
    const forwardDisplacementM = construct.centre().z - start.z;
    assert.equal(capability(final.snapshot, "move").available, false);
    assert.equal(capability(final.snapshot, selectedAction).available, true);
    assert.equal(selectedSpec.controller, "supported-quadruped-crawl");
    assert.equal(selectedSpec.parameters.speed.max, SUPPORTED_QUADRUPED_CRAWL_V1.MAX_SPEED_MPS);
    for (const other of ["front-right", "rear-left", "rear-right"]) {
      assert.equal(capability(final.snapshot, `crawl-without-${other}`).available, false, other);
    }
    assert.equal(admittedSamples, MOTION_STEPS);
    assert.ok(activeSamples > MOTION_STEPS * 0.8, JSON.stringify(final.snapshot.events));
    assert.ok(displacementM > 0.2, `three-support crawl displacement ${displacementM}`);
    assert.ok(forwardDisplacementM > 0.2,
      `three-support crawl forward displacement ${forwardDisplacementM}`);
    assert.ok(maximumAllowedSpeedMps <= SUPPORTED_QUADRUPED_CRAWL_V1.MAX_SPEED_MPS + 1e-9,
      `allowed ${maximumAllowedSpeedMps}`);
    assert.ok(maximumRootSpeedMps <= SUPPORTED_QUADRUPED_CRAWL_V1.MAX_SPEED_MPS + 0.08,
      `root ${maximumRootSpeedMps}`);
    assert.equal(unsupportedMotionSamples, 0,
      `crawl moved without all exact fresh supports on ${unsupportedMotionSamples} sample(s)`);
  } finally { bout.dispose(); arena.dispose(); }
});
