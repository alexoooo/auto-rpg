/**
 * **The locomotion skill's limits** (`src/core/skills/locomotion.ts`), on views built by hand: a
 * walk is capped at the envelope's fastest, the heading turns only while walking, not for
 * `TURN_LEAD` after the body sets off, and then no faster than the envelope turns at the pace it
 * walked the step before; and placed, the feet step to a footing each once, the farther first. The
 * whole path, mind to body, is `tests/lab-run.test.mjs`'s and `tests/lab-routine.test.mjs`'s.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { humanSpec } from "../src/core/human/spec.ts";
import { stanceEnvelope, turnAt } from "../src/core/control/stance-envelope.ts";
import { STANCE_GAIT } from "../src/core/control/stance-tuning.ts";
import { locomotion, PLACING, TURN_LEAD, wrap } from "../src/core/skills/locomotion.ts";

const DT = 1 / 120;
const envelope = stanceEnvelope(humanSpec("workshop-rogue"));
/** A body standing as built: its centre 0.9 m over its soles. */
const viewAt = (time) => ({ time, stance: { centre: new Vector3(0, 0.9, 0), support: new Vector3(0, 0, 0) } });

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

test("the_heading_holds_standing_and_for_the_lead_then_turns_at_the_envelopes_rate", () => {
  // The clock as a body's: steps over the rate.
  const legs = locomotion(envelope), face = 2, time = (step) => step / 120;
  let step = 0;
  for (; step <= 120; step++) legs.goal(viewAt(time(step)), null, face, DT);
  assert.equal(legs.heading, 0, "standing, it turned");
  const pace = 0.3, setOff = time(step);
  for (; time(step) - setOff < TURN_LEAD; step++) legs.goal(viewAt(time(step)), [pace, 0], face, DT);
  assert.ok(step - 120 > 100, `the lead ended after ${step - 120} steps`);
  assert.equal(legs.heading, 0, "it turned inside the lead");
  legs.goal(viewAt(time(step++)), [pace, 0], face, DT);
  assert.ok(Math.abs(legs.heading - turnAt(envelope, pace) * DT) < 1e-12, `turned ${legs.heading}`);
  // It gets there, and stops there.
  for (let i = 0; i < 1200; i++) legs.goal(viewAt(time(step++)), [pace, 0], face, DT);
  assert.ok(Math.abs(wrap(legs.heading - face)) < 1e-12, `heading ${legs.heading}`);
});

test("stopping_starts_the_lead_again", () => {
  const legs = locomotion(envelope);
  let t = 0;
  legs.goal(viewAt(t), null, 0, DT);
  for (let i = 0; i < 240; i++) legs.goal(viewAt(t += DT), [0.3, 0], 0, DT);
  legs.goal(viewAt(t += DT), null, 1, DT);
  assert.equal(legs.pace, 0);
  legs.goal(viewAt(t += DT), [0.3, 0], 1, DT);
  assert.equal(legs.heading, 0, "it turned as it set off again");
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
