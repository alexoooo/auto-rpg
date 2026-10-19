/**
 * **The stride** (`stride`, `src/core/skills/stride.ts`), on the Node stand at 120 Hz: what any
 * walk passes (`tests/fixtures/walk-floor.mjs`). A Warrior with it walks forward more than across
 * by its own steps, the stance taking none, and stops on its feet; one that swings its arms swings
 * them and one that does not keeps the guard; its swing's ramped progress is a way at rest at both
 * ends; and its faults refuse settings it cannot carry out. How far and how fast it goes, and how
 * its arms keep time with its legs, is measured in `stride-capability.test.mjs`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { humanSpec } from "../src/core/human/spec.ts";
import { NO_COVER } from "../src/core/mind/intent.ts";
import { treeFaults } from "../src/core/mind/catalog.ts";
import { swingProgressToRef } from "../src/core/control/swing-path.ts";
import { STRIDE } from "../src/core/skills/stride.ts";
import { labActor } from "../src/lab/actor.ts";
import { LAB_PRESETS } from "../src/lab/scenarios.ts";
import { walked } from "./fixtures/walk-floor.mjs";
import { coreStand } from "./harness/core-stand.mjs";

const STRIDING = { ...LAB_PRESETS.script.config, locomotion: { kind: "stride", ...STRIDE } };

test("a_warrior_with_the_stride_walks_forward_by_its_own_steps_and_stops", async () => {
  let swung = 0, stanceStrides = 0;
  const r = await walked(STRIDING, [0.5, 0], { during: (actor) => {
    const s = actor.body.view.stance;
    if (s.phase === "swing") swung++;
    stanceStrides = Math.max(stanceStrides, s.strides);
  } });
  assert.ok(!r.down && r.along > 0.5 && Math.abs(r.across) < r.along, JSON.stringify(r));
  assert.ok(swung > 0 && stanceStrides === 0, `its own steps: ${swung} readings in a swing, the stance's ${stanceStrides}`);
  assert.ok(r.speed < 0.1 && r.phase === "stand", `stopped: ${JSON.stringify(r)}`);
});

test("a_stride_that_swings_the_arms_swings_them_and_one_that_does_not_keeps_the_guard", async () => {
  for (const arms of [0, 2]) {
    const stand = await coreStand(humanSpec("workshop-fighter"), { ground: true });
    const actor = labActor(stand.built, stand.world, { mind: { ...STRIDING, locomotion: { ...STRIDING.locomotion, arms } } });
    actor.drive({ name: "forward", decide: () => ({ move: [0.6, 0], face: 0, guard: NO_COVER, actions: [] }) });
    const m = actor.body.muscles, shoulder = (side) => m.channels.findIndex((c) => c.name.startsWith(`shoulder.${side} flexion`));
    const left = shoulder("left"), right = shoulder("right"), angles = { left: [], right: [] };
    try {
      stand.step(stand.seconds(1));
      for (let k = 0; k < 240 && !actor.body.view.down; k++) {
        stand.step(1);
        angles.left.push(m.angle(left)); angles.right.push(m.angle(right));
      }
      assert.equal(actor.body.view.down, false, `arms ${arms}: fell`);
      const range = (x) => Math.max(...x) - Math.min(...x);
      if (!arms) assert.ok(range(angles.left) < 0.1 && range(angles.right) < 0.1, `in the guard the shoulders hold: ${range(angles.left).toFixed(3)}, ${range(angles.right).toFixed(3)} rad`);
      else assert.ok(range(angles.left) > 0.2 && range(angles.right) > 0.2, `swinging: ${range(angles.left).toFixed(2)}, ${range(angles.right).toFixed(2)} rad`);
    } finally { actor.dispose(); stand.dispose(); }
  }
});

test("the_stride_is_a_fighters_locomotion_and_refuses_what_it_cannot_carry_out", () => {
  assert.deepEqual(treeFaults(STRIDING, ["script"]), []);
  for (const bad of [{ swing: 0 }, { accel: -1 }, { transfer: -0.1 }, { longest: Number.NaN }, { arms: -1 }, { ramp: 0.3 }, { drive: -1 }, { lengthen: Number.NaN }]) {
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
