/**
 * **The locomotion skill's limits** (`src/core/skills/locomotion.ts`), on views built by hand: a
 * walk is capped at the envelope's fastest, the heading turns only while walking, from the step
 * the body sets off, no faster than the envelope turns at the pace it walked the step before;
 * placed, the feet step to a footing each once, the farther first; and resumed, it asks the
 * height the body is at, rising to the stance's over `RISING_SECONDS`, and steps a foot out of
 * its stance's width to the other's side. The
 * whole path, tactics to body, is `tests/lab-run.test.mjs`'s and `tests/lab-routine.test.mjs`'s.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { humanSpec } from "../src/core/human/spec.ts";
import { stanceEnvelope, turnAt } from "../src/core/control/stance-envelope.ts";
import { STANCE_GAIT } from "../src/core/control/stance-tuning.ts";
import { locomotion, PLACING, RISING_SECONDS, STANCE_LOWER, wrap } from "../src/core/skills/locomotion.ts";

const DT = 1 / 120;
const envelope = stanceEnvelope(humanSpec("workshop-rogue"));
/** A body standing as built: its centre 0.9 m over its soles, which stand 0.2 m apart across +x. */
const SOLES = { left: new Vector3(-0.1, 0, 0), right: new Vector3(0.1, 0, 0) };
const viewAt = (time) => ({ time, stance: { centre: new Vector3(0, 0.9, 0), support: new Vector3(0, 0, 0), soles: SOLES } });

test("a_walk_is_capped_at_the_envelopes_fastest_and_keeps_its_direction", () => {
  const legs = locomotion(envelope), most = envelope.walk.value;
  legs.goal(viewAt(0), null, 0, DT);
  const goal = legs.goal(viewAt(DT), [3, 4], 0, DT);
  assert.equal(legs.pace, most);
  // Heading 0: forward is +z, the right +x.
  assert.ok(Math.abs(goal.walk[0] - 4 / 5 * most) < 1e-12 && Math.abs(goal.walk[1] - 3 / 5 * most) < 1e-12, JSON.stringify(goal.walk));
  const slow = legs.goal(viewAt(2 * DT), [0.1, 0], 0, DT);
  assert.equal(legs.pace, 0.1);
  assert.deepEqual([...slow.walk], [0, 0.1]);
});

test("the_heading_holds_standing_then_turns_at_the_envelopes_rate_from_the_step_it_sets_off", () => {
  // The clock as a body's: steps over the rate.
  const legs = locomotion(envelope), face = 2, time = (step) => step / 120;
  let step = 0;
  for (; step <= 120; step++) legs.goal(viewAt(time(step)), null, face, DT);
  assert.equal(legs.heading, 0, "standing, it turned");
  const pace = 0.3;
  // Setting off it turns at the envelope's rate standing, the pace it was asked the step before; then at its walk's.
  legs.goal(viewAt(time(step++)), [pace, 0], face, DT);
  const first = turnAt(envelope, 0) * DT;
  assert.ok(Math.abs(legs.heading - first) < 1e-12, `turned ${legs.heading} setting off`);
  legs.goal(viewAt(time(step++)), [pace, 0], face, DT);
  assert.ok(Math.abs(legs.heading - first - turnAt(envelope, pace) * DT) < 1e-12, `turned ${legs.heading}`);
  // It gets there, and stops there.
  for (let i = 0; i < 1200; i++) legs.goal(viewAt(time(step++)), [pace, 0], face, DT);
  assert.ok(Math.abs(wrap(legs.heading - face)) < 1e-12, `heading ${legs.heading}`);
});

test("placed_the_farther_foot_steps_then_the_other_each_once_and_a_near_foot_stays", () => {
  const legs = locomotion(envelope);
  legs.goal(viewAt(0), null, 0, DT);
  const view = { ...viewAt(DT), stance: { ...viewAt(DT).stance, phase: "stand", soles: { left: new Vector3(-0.2, 0, 0), right: new Vector3(0.2, 0, 0) } } };
  const footing = { left: [-0.2, 0.3], right: [0.2, 0.25] };
  const step = (foot) => ({ foot, to: footing[foot], seconds: STANCE_GAIT.seconds, lift: STANCE_GAIT.lift, shift: true });
  assert.deepEqual(legs.place(view, footing).swing, step("left"));
  assert.equal(legs.placed, false);
  // Under way, the step is asked again until the stance stands after it.
  view.stance.phase = "shift";
  assert.deepEqual(legs.place(view, footing).swing, step("left"));
  view.stance.phase = "swing";
  legs.place(view, footing);
  // Landed 3 cm short, further than `near`: stepped once, it stays; the other steps.
  view.stance.phase = "stand";
  view.stance.soles.left.z = 0.27;
  assert.deepEqual(legs.place(view, footing).swing, step("right"));
  view.stance.phase = "swing";
  legs.place(view, footing);
  view.stance.phase = "stand";
  view.stance.soles.right.z = 0.25;
  assert.equal(legs.place(view, footing).swing, undefined);
  assert.equal(legs.placed, true);
  // A footing moved further than `near` is a new one: the farther foot steps to it.
  const moved = { left: [-0.2, 0.3 + 2 * PLACING.near], right: [0.2, 0.25] };
  assert.equal(legs.place(view, moved).swing.foot, "left");
  assert.equal(legs.placed, false);
  // Feet within `near` of a footing stay; a walk asked after ends placing.
  const fresh = locomotion(envelope);
  fresh.goal(viewAt(0), null, 0, DT);
  const near = { left: [-0.2, 0.27 + PLACING.near / 2], right: [0.2 - PLACING.near / 2, 0.25] };
  assert.equal(fresh.place(view, near).swing, undefined);
  assert.equal(fresh.placed, true);
  fresh.goal(view, null, 0, DT);
  assert.equal(fresh.placed, false);
});

test("resumed from a crouch, the asked height rises from the body's to the stance's, facing the way the pitched pelvis faces", () => {
  const legs = locomotion(envelope);
  const standing = legs.goal(viewAt(DT), null, 0, DT).height;
  assert.equal(standing, 0.9 - STANCE_LOWER);
  // Turned 1 rad about up and pitched 1.8 rad forward: past upright, its forward points back across the ground.
  const pelvis = Quaternion.RotationAxis(Vector3.Up(), 1).multiply(Quaternion.RotationAxis(new Vector3(1, 0, 0), 1.8));
  const forward = new Vector3(0, 0, 1).applyRotationQuaternion(pelvis), facing = Math.atan2(forward.x, forward.z);
  assert.ok(Math.abs(wrap(facing - 1 - Math.PI)) < 1e-9, `its forward reads ${facing}`);
  // Its feet square to that heading, at the stance's width: neither steps.
  const right = new Vector3(Math.cos(1), 0, -Math.sin(1)), soles = { left: right.scale(-0.1), right: right.scale(0.1) };
  const at = 5, crouch = { time: at, stance: { centre: new Vector3(0, 0.6, 0), support: new Vector3(0, 0.02, 0), soles, facing }, root: { rotation: pelvis } };
  legs.resume(crouch);
  assert.ok(Math.abs(legs.heading - 1) < 1e-12, `heading ${legs.heading}`);
  assert.equal(legs.state.squaring, null);
  const asked = (time) => legs.goal({ ...crouch, time }, null, 0, DT).height;
  assert.ok(Math.abs(asked(at) - 0.58) < 1e-12, `asked ${asked(at)} as it is resumed`);
  // A smoothstep: halfway in its time, halfway; a quarter in, 0.15625 of the way.
  assert.ok(Math.abs(asked(at + RISING_SECONDS / 4) - (0.58 + 0.15625 * (standing - 0.58))) < 1e-12);
  assert.ok(Math.abs(asked(at + RISING_SECONDS / 2) - (0.58 + standing) / 2) < 1e-12);
  assert.equal(asked(at + RISING_SECONDS), standing);
  assert.equal(asked(at + 2 * RISING_SECONDS), standing);
  // Resumed standing, it asks its height at once.
  legs.resume({ ...crouch, stance: { ...crouch.stance, centre: new Vector3(0, 0.95, 0) } });
  assert.equal(asked(at + 3 * RISING_SECONDS), standing);
});

test("resumed with its feet out of its stance's width, the farther foot steps to the other's side, as far ahead as it was", () => {
  const legs = locomotion(envelope);
  legs.goal(viewAt(DT), null, 0, DT);
  // Facing 1 rad about up, the pelvis level: its right across the ground is (cos 1, -sin 1), its forward (sin 1, cos 1).
  const pelvis = Quaternion.RotationAxis(Vector3.Up(), 1), right = new Vector3(Math.cos(1), 0, -Math.sin(1)), forward = new Vector3(Math.sin(1), 0, Math.cos(1));
  const left = right.scale(-0.1), xz = (v) => [v.x, v.z];
  const resumed = (across) => {
    const soles = { left, right: left.add(right.scale(across)).add(forward.scale(-0.3)) };
    const view = { time: 5, stance: { centre: new Vector3(0, 0.6, 0), support: new Vector3(0, 0.02, 0), soles, phase: "stand" }, root: { rotation: pelvis } };
    legs.resume(view);
    return view;
  };
  // 0.05 m across from the left foot, 0.15 from its place: the left foot, nearer the centre of mass, stays, and the right steps.
  const view = resumed(0.05), to = left.add(right.scale(0.2)).add(forward.scale(-0.3));
  const near = (a, b) => Math.abs(a[0] - b[0]) < 1e-12 && Math.abs(a[1] - b[1]) < 1e-12;
  assert.ok(near(legs.state.squaring.left, xz(left)) && near(legs.state.squaring.right, xz(to)), JSON.stringify(legs.state.squaring));
  const goal = legs.goal(view, null, 0, DT);
  assert.deepEqual([goal.swing.foot, near(goal.swing.to, xz(to))], ["right", true]);
  // On either side of SQUARE_NEAR (0.1 m), too narrow and too wide: 0.11 from its place it steps, 0.09 it stays.
  for (const [across, steps] of [[0.09, true], [0.11, false], [0.29, false], [0.31, true]]) {
    resumed(across);
    assert.equal(legs.state.squaring !== null, steps, `${across} m across`);
  }
});
