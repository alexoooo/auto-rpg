/**
 * **The locomotion skill's limits** (`src/core/skills/locomotion.ts`), on views built by hand: a
 * walk is capped at the envelope's fastest, the heading turns only while walking, not for
 * `TURN_LEAD` after the body sets off, and then no faster than the envelope turns at the pace it
 * walked the step before. The whole path, mind to body, is `tests/core-lab-run.test.mjs`'s.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { humanSpec } from "../src/core/human/spec.ts";
import { stanceEnvelope, turnAt } from "../src/core/control/stance-envelope.ts";
import { locomotion, TURN_LEAD, wrap } from "../src/core/skills/locomotion.ts";

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
