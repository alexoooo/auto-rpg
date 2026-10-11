/**
 * **The walk and run** (`stride`, `src/core/skills/stride.ts`), on the Node stand at 120 Hz: a
 * Warrior with it walks forward 5 m and stops, on its feet, its own steps and not the stance's; one
 * that swings its arms swings each with the other side's leg; a fighter with it builds and steps;
 * its swing's ramped progress is a way at rest at both ends; and its faults refuse settings it cannot
 * carry out.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { humanSpec } from "../src/core/human/spec.ts";
import { NO_COVER } from "../src/core/mind/intent.ts";
import { treeFaults } from "../src/core/mind/catalog.ts";
import { swingProgressToRef } from "../src/core/control/stance.ts";
import { STRIDE } from "../src/core/skills/stride.ts";
import { labActor } from "../src/lab/actor.ts";
import { LAB_PRESETS } from "../src/lab/scenarios.ts";
import { coreStand } from "./harness/core-stand.mjs";

const STRIDING = { ...LAB_PRESETS.script.config, locomotion: { kind: "stride", ...STRIDE } };

test("a_warrior_with_the_stride_walks_forward_five_metres_and_stops", async () => {
  const stand = await coreStand(humanSpec("workshop-fighter"), { ground: true });
  const actor = labActor(stand.built, stand.world, { mind: STRIDING });
  const start = actor.body.view.stance.centre.z;
  // Forward at 0.5 m/s, facing +z, until the centre of mass is 5 m on; then stand.
  const tactics = {
    name: "five-metres",
    decide: ({ view }) => ({ move: view.stance.centre.z - start < 5 ? [0.5, 0] : null, face: 0, guard: NO_COVER, attack: null }),
  };
  actor.drive(tactics);
  let stopped = null, strides = 0, own = 0;
  try {
    for (let t = 0; t < 20 && !actor.body.view.down; t += 0.1) {
      stand.step(stand.seconds(0.1));
      const s = actor.body.view.stance;
      if (stopped === null && s.centre.z - start >= 5) stopped = actor.body.view.time;
      if (s.phase === "swing") strides++;
      if (s.own) own++;
      if (stopped !== null && actor.body.view.time > stopped + 4) break;
    }
    const s = actor.body.view.stance;
    assert.equal(actor.body.view.down, false, `fell at ${actor.body.view.time.toFixed(2)} s`);
    assert.ok(stopped !== null && stopped < 15, `5 m on by ${stopped?.toFixed(2)} s`);
    assert.ok(s.centre.z - start < 5.6, `stopped within 0.6 m of the mark: ${(s.centre.z - start).toFixed(2)} m`);
    assert.ok(Math.hypot(s.velocity.x, s.velocity.z) < 0.05, `standing still: ${Math.hypot(s.velocity.x, s.velocity.z).toFixed(3)} m/s`);
    assert.equal(s.phase, "stand", "no step under way");
    assert.ok(strides > 20, `its steps: ${strides} readings in a swing`);
    assert.equal(s.strides, 0, "the stance took no walking step of its own");
    assert.ok(own < 5, `the stance stepped of itself in ${own} readings`);
  } finally { actor.dispose(); stand.dispose(); }
});

/** Pearson's correlation of two series. */
function correlation(a, b) {
  const mean = (x) => x.reduce((s, v) => s + v, 0) / x.length, ma = mean(a), mb = mean(b);
  let ab = 0, aa = 0, bb = 0;
  for (let i = 0; i < a.length; i++) { ab += (a[i] - ma) * (b[i] - mb); aa += (a[i] - ma) ** 2; bb += (b[i] - mb) ** 2; }
  return ab / Math.sqrt(aa * bb);
}

test("a_stride_that_swings_the_arms_swings_each_with_the_other_sides_leg_and_one_that_does_not_keeps_the_guard", async () => {
  for (const arms of [0, 2]) {
    const stand = await coreStand(humanSpec("workshop-fighter"), { ground: true });
    const actor = labActor(stand.built, stand.world, { mind: { ...STRIDING, locomotion: { ...STRIDING.locomotion, arms } } });
    actor.drive({ name: "forward", decide: () => ({ move: [0.6, 0], face: 0, guard: NO_COVER, attack: null }) });
    const m = actor.body.muscles, shoulder = (side) => m.channels.findIndex((c) => c.name.startsWith(`shoulder.${side} flexion`));
    const left = shoulder("left"), right = shoulder("right"), angles = { left: [], right: [] }, leads = { left: [], right: [] };
    try {
      stand.step(stand.seconds(2));
      for (let k = 0; k < 360 && !actor.body.view.down; k++) {
        stand.step(1);
        const s = actor.body.view.stance;
        angles.left.push(m.angle(left)); angles.right.push(m.angle(right));
        for (const side of ["left", "right"]) leads[side].push(s.soles[side].z - s.centre.z);
      }
      assert.equal(actor.body.view.down, false, `arms ${arms}: fell`);
      const range = (x) => Math.max(...x) - Math.min(...x);
      if (!arms) assert.ok(range(angles.left) < 0.05 && range(angles.right) < 0.05, `in the guard the shoulders hold: ${range(angles.left).toFixed(3)}, ${range(angles.right).toFixed(3)} rad`);
      else {
        const with_ = [correlation(angles.left, leads.right), correlation(angles.right, leads.left)];
        assert.ok(range(angles.left) > 0.2 && range(angles.right) > 0.2, `swinging: ${range(angles.left).toFixed(2)}, ${range(angles.right).toFixed(2)} rad`);
        assert.ok(with_.every((r) => r > 0.5), `each arm goes with the other side's foot: ${with_.map((r) => r.toFixed(2))}`);
      }
    } finally { actor.dispose(); stand.dispose(); }
  }
});

test("the_stride_is_a_fighters_locomotion_and_refuses_what_it_cannot_carry_out", () => {
  assert.deepEqual(treeFaults(STRIDING, ["script"]), []);
  for (const bad of [{ swing: 0 }, { accel: -1 }, { transfer: -0.1 }, { longest: Number.NaN }, { arms: -1 }, { ramp: 0.3 }]) {
    const faults = treeFaults({ ...STRIDING, locomotion: { ...STRIDING.locomotion, ...bad } }, ["script"]);
    assert.ok(faults.some((f) => f.includes("stride")), `${JSON.stringify(bad)}: ${JSON.stringify(faults)}`);
  }
});

test("a_ramped_swing_goes_the_whole_way_from_rest_to_rest_its_rate_and_acceleration_the_way_s_and_its_peak_four_over_one_less_twice_the_ramp", () => {
  const out = new Vector3(), n = 2000;
  for (const ramp of [0, 0.05, 0.15, 0.25]) {
    const at = (tau) => swingProgressToRef(tau, ramp, out).clone();
    assert.deepEqual([at(0).x, at(0).y, at(1).x, at(1).y], [0, 0, 1, 0], `ramp ${ramp}`);
    assert.ok(Math.abs(at(0.5).x - 0.5) < 1e-12, `ramp ${ramp} half way`);
    let peak = 0;
    for (let i = 1; i < n; i++) {
      const a = at((i - 1) / n), b = at(i / n), c = at((i + 1) / n);
      // The rate and acceleration are the way's and the rate's by central differences, within what a
      // difference straddling a corner of the acceleration (or its switch, with a ramp of 0) leaves.
      assert.ok(Math.abs((c.x - a.x) * n / 2 - b.y) < (ramp ? 1e-5 : 2e-3), `ramp ${ramp} rate at ${i / n}`);
      if (ramp > 0) assert.ok(Math.abs((c.y - a.y) * n / 2 - b.z) < 4 / (1 - 2 * ramp) / ramp / n, `ramp ${ramp} acceleration at ${i / n}`);
      peak = Math.max(peak, Math.abs(b.z));
    }
    assert.ok(Math.abs(peak - 4 / (1 - 2 * ramp)) < 1e-9, `ramp ${ramp} peak ${peak}`);
  }
  // None is minimum jerk.
  const jerk = swingProgressToRef(0.3, undefined, out).asArray(), t = 0.3;
  [t * t * t * (10 - 15 * t + 6 * t * t), 30 * t * t * (1 - t) * (1 - t), 60 * t * (1 - t) * (1 - 2 * t)]
    .forEach((x, i) => assert.ok(Math.abs(jerk[i] - x) < 1e-12, `minimum jerk ${i}: ${jerk[i]} against ${x}`));
});
