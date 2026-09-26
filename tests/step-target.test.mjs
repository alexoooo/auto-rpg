// The step target's executor (`src/step-target.ts`): arithmetic, then the real carrier's
// kinematics (`VirtualLocomotionCarrier`, committed with everything it proposed) driven by it.
//
// Harness: pure arithmetic and the carrier record; no solver.
import assert from "node:assert/strict";
import test from "node:test";

import { STEP_TARGET, stepTravel } from "../src/step-target.ts";
import { LOCOMOTION_BIPED, LOCOMOTION_WHEEL } from "../src/golem/config.ts";
import { VirtualLocomotionCarrier, deriveLocomotionFootprint } from "../src/supported-locomotion-runtime.ts";
import { setChannelFlags } from "../src/body-command.ts";
import { auditBuild } from "../research/headroom-builds.mjs";
import { stepCell } from "../research/step-bench.mjs";

const STONE = LOCOMOTION_BIPED.carrier;
const DT = 1 / 120;

test("the_velocity_a_step_asks_for_points_at_the_target_through_the_carriers_elliptical_ceilings", () => {
  // The carrier scales ahead, back and sideways by different ceilings. Rebuild the velocity it
  // makes of the fractions exactly as `propose` does, and it must point at the target, from
  // facings and bearings on both sides of centre.
  for (const yaw of [0, 0.7, -0.7, 2.5, -2.5, Math.PI]) {
    for (const bearing of [0, 0.4, -0.4, 1.3, -1.3, 2.2, -2.2, Math.PI]) {
      const step = { x: 3 * Math.sin(bearing), z: 3 * Math.cos(bearing), within: 0.5 };
      const out = { forward: 0, strafe: 0 };
      stepTravel(step, 0.5, { x: 0, z: 0, yaw }, STONE, out);
      assert.ok(Math.hypot(out.forward, out.strafe) <= 1 + 1e-12);
      const localZ = out.forward * (out.forward >= 0 ? STONE.maxSpeedMps : STONE.backSpeedMps);
      const localX = out.strafe * STONE.strafeSpeedMps;
      const vx = localX * Math.cos(yaw) + localZ * Math.sin(yaw);
      const vz = localZ * Math.cos(yaw) - localX * Math.sin(yaw);
      const off = Math.atan2(vx * step.z - vz * step.x, vx * step.x + vz * step.z);
      assert.ok(Math.abs(off) < 1e-9, `yaw ${yaw}, bearing ${bearing}: ${off} rad off the target`);
    }
  }
  // The control: the plausible unit-vector planner is off the target on the diagonals.
  const bearing = 0.8;
  const f = Math.cos(bearing), r = Math.sin(bearing);
  const off = Math.atan2(r * STONE.strafeSpeedMps, f * STONE.maxSpeedMps) - bearing;
  assert.ok(Math.abs(off) > 0.1, "the ceilings are isotropic, so the test above is not about the ellipse");
});

test("a_step_is_as_fast_as_its_time_needs_and_no_faster_than_it_can_stop", () => {
  const out = { forward: 0, strafe: 0 };
  // Four metres ahead in two seconds wants 2 m/s, a fraction of the 3.2 m/s walk.
  stepTravel({ x: 0, z: 4, within: 2 }, 2, { x: 0, z: 0, yaw: 0 }, STONE, out);
  assert.ok(Math.abs(out.forward - 2 / STONE.maxSpeedMps) < 1e-12 && Math.abs(out.strafe) < 1e-12, JSON.stringify(out));
  // Arrived is nothing, and a point already passed is not a reason to run.
  const left = stepTravel({ x: 0.005, z: 0, within: 1 }, 1, { x: 0, z: 0, yaw: 0 }, STONE, out);
  assert.deepEqual(out, { forward: 0, strafe: 0 });
  assert.ok(left < STEP_TARGET.arrivedM);
  // Late, or with no time left, the last stretch is closed at the speed it can still stop from
  // rather than at full tilt; and a near point on time is not braked below its own pace.
  const brake = (d) => Math.sqrt(2 * STEP_TARGET.brakeShare * STONE.maxAccelerationMps2 * d);
  stepTravel({ x: 0, z: 0.1, within: 0 }, -1, { x: 0, z: 0, yaw: 0 }, STONE, out);
  assert.ok(Math.abs(out.forward * STONE.maxSpeedMps - brake(0.1)) < 1e-12, JSON.stringify(out));
  stepTravel({ x: 0, z: 0.1, within: 0 }, 0, { x: 0, z: 0, yaw: 0 }, STONE, out);
  assert.ok(Math.abs(out.forward * STONE.maxSpeedMps - brake(0.1)) < 1e-12, JSON.stringify(out));
  stepTravel({ x: 0, z: 0.1, within: 1 }, 1, { x: 0, z: 0, yaw: 0 }, STONE, out);
  assert.ok(Math.abs(out.forward * STONE.maxSpeedMps - 0.1) < 1e-12, JSON.stringify(out));
});

/** Drive the real carrier record at a step target, committing everything it proposes. */
function walkTo(config, target, within, yaw = 0, seconds = 4) {
  const footprint = deriveLocomotionFootprint({ radiusM: 0.5, heightM: 1.8,
    provenance: { profileId: "step", source: "fighter-bind-geometry", measuredAt: "fixture" } });
  const carrier = new VirtualLocomotionCarrier({ position: { x: 0, y: 0.9, z: 0 }, yaw }, footprint, config,
    new Set(["step.root"]));
  const out = { forward: 0, strafe: 0 };
  let arrivedAt = null, overshoot = 0, peak = 0;
  for (let t = 0; t < seconds; t += DT) {
    const s = carrier.state;
    const left = stepTravel(target, within - t, s, config, out);
    if (arrivedAt === null && left < 0.03) arrivedAt = t;
    // Past the target along the line from the start is overshoot.
    const along = (s.x * target.x + s.z * target.z) / Math.hypot(target.x, target.z);
    overshoot = Math.max(overshoot, along - Math.hypot(target.x, target.z));
    peak = Math.max(peak, Math.hypot(s.velocityX, s.velocityZ));
    const proposal = carrier.propose({ localForward: out.forward, localRight: out.strafe, yaw: 0 }, DT);
    carrier.commit(proposal, proposal.displacement);
  }
  const s = carrier.state;
  return { arrivedAt, overshoot, peak, miss: Math.hypot(s.x - target.x, s.z - target.z) };
}

test("the_carrier_arrives_on_time_where_it_can_and_late_where_it_cannot_and_stops_on_the_point", () => {
  for (const [name, config] of [["stone", STONE], ["wheel", LOCOMOTION_WHEEL.carrier]]) {
    for (const yaw of [0, 1.1, -2.0]) {
      // Reachable: 1.5 m to the front-left in 1.2 s.
      const easy = walkTo(config, { x: -0.9, z: 1.2, within: 1.2 }, 1.2, yaw);
      assert.ok(easy.arrivedAt !== null && easy.arrivedAt < 1.2 + 0.08, `${name} ${yaw}: arrived at ${easy.arrivedAt}`);
      assert.ok(easy.arrivedAt > 0.8, `${name} ${yaw}: arrived at ${easy.arrivedAt}, early`);
      assert.ok(easy.miss < STEP_TARGET.arrivedM + 1e-3 && easy.overshoot < 0.02, `${name} ${yaw}: ${JSON.stringify(easy)}`);
      // Unreachable: 3 m behind in 0.3 s arrives late, at the carrier's own ceiling, and stops.
      const hard = walkTo(config, { x: 0.4, z: -3, within: 0.3 }, 0.3, yaw);
      assert.ok(hard.arrivedAt > 1, `${name} ${yaw}: 3 m in ${hard.arrivedAt} s`);
      assert.ok(hard.peak <= config.maxSpeedMps + 1e-9, `${name} ${yaw}: ${hard.peak} m/s`);
      assert.ok(hard.miss < STEP_TARGET.arrivedM + 1e-3 && hard.overshoot < 0.02, `${name} ${yaw}: ${JSON.stringify(hard)}`);
    }
  }
});

test("a_body_with_the_step_declared_arrives_on_time_and_one_without_it_stands_still", async () => {
  // The whole path in the solver (Node locomotion bench): the command's step, the golem's clock,
  // the port's carrier, the gait. An odd body (the multileg) and the stone biped, and the control
  // is the same command with the flag off, which the body must not read at all.
  const cell = { distance: 0.6, bearing: -Math.PI / 4, within: 1, mode: "step", seconds: 1.6 };
  const previous = setChannelFlags({ step: true });
  try {
    for (const build of ["default", "multileg"]) {
      const run = await stepCell(auditBuild(build).setup, cell);
      assert.ok(run.arrivedS !== null && Math.abs(run.arrivedS - 1) < 0.1, `${build}: arrived at ${run.arrivedS} s for 1 s`);
      assert.ok(run.missM < 0.015 && run.overshootM < 0.01 && run.downSteps === 0, `${build}: ${JSON.stringify(run)}`);
    }
  } finally { setChannelFlags(previous); }
  const off = await stepCell(auditBuild("default").setup, cell);
  assert.equal(off.arrivedS, null);
  assert.ok(off.missM > 0.55, `with the flag off the body moved to ${off.missM} m from the point`);
});
