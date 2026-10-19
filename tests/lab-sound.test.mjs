/**
 * **What the lab's body sounded of** (`src/lab/sound-log.ts`): under each of the lab's modes, what
 * a step sounded of is held at the time the frame that step recorded shows, on its feet and down, a
 * target the Routine or the Blow hangs beside the body heard with it. Node core stand, Rapier, each
 * body built in its guard as the lab builds it, 120 Hz (the Blow 480 Hz), balance 0 %. The log
 * itself is `lab-sound-log`'s; whether a blow lands and a run keeps its feet is `lab-sound-capability`'s.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { LAB_BODY, LAB_OTHER } from "../src/lab/sound-log.ts";
import { blowThrown, routinePushed, routineStruck, runShuttle, stanceShoved } from "./fixtures/sound-log.mjs";

/** The one cue of `cues` a blow of `energy` J at `point` gives, as loud as its energy, where it landed. */
const blowCue = (cues, energy, point) => cues.filter((c) => c.key === `${LAB_OTHER}:${LAB_BODY}` && Math.abs(c.strength - Math.min(1, Math.sqrt(energy / 60))) < 1e-9 && c.point.x === point[0] && c.point.z === point[2]);

test("under_the_stance_a_shove_and_the_fall_it_gives_are_held_at_the_time_their_frames_show", async () => {
  const stance = await stanceShoved();
  assert.ok(stance.down, "the fixture did not reach its case: the shove did not put it down");
  assert.deepEqual(stance.faults.slice(0, 5), []);
  // The shove's cue, logged before the solver steps: once, and all a cue can be.
  const hands = stance.cues.filter((c) => c.key === `${LAB_BODY}:hand`), falls = stance.cues.filter((c) => c.key === `${LAB_BODY}:ground`);
  assert.deepEqual(hands.map((c) => c.strength), [1]);
  assert.ok(falls.length > 0, "the fall touches the ground");
});

test("under_the_routine_its_frame's_time_goes_on_while_another_mind_has_the_body", async () => {
  const routine = await routinePushed();
  assert.ok(routine.down, "the fixture did not reach its case: the push did not put it down");
  assert.deepEqual(routine.faults.slice(0, 5), []);
  assert.ok(routine.cues.length > 0);
});

test("under_the_routine_the_body_hung_for_a_target_is_heard_with_the_body", async () => {
  const { faults, cues, reading } = await routineStruck();
  assert.ok(reading !== null, "the fixture did not reach its case: the target was never read");
  assert.deepEqual(faults.slice(0, 5), []);
  // A body on the target is a body on a head of flesh, and the target touches nothing else.
  assert.deepEqual(cues.filter((c) => c.key.startsWith(`${LAB_OTHER}:`) && (c.key !== `${LAB_OTHER}:${LAB_BODY}` || c.kind !== "body")), []);
  if (reading.blow) assert.equal(blowCue(cues, reading.blow.energy, reading.blow.point).length, 1, `${reading.blow.energy} J`);
});

test("under_the_run_each_step_sounds_of_the_ground_alone", async () => {
  const run = await runShuttle();
  assert.ok(run.cues.length > 0, "the fixture did not reach its case: no footfall");
  assert.deepEqual(run.faults.slice(0, 5), []);
  assert.deepEqual(run.cues.filter((c) => c.key !== `${LAB_BODY}:ground`), []);
});

test("under_the_blow_the_body_hung_for_it_is_heard_with_the_body", async () => {
  const blow = await blowThrown();
  assert.deepEqual(blow.faults.slice(0, 5), []);
  // Wood on a head of flesh: the softer one's voice, at the point the club touched.
  assert.deepEqual(blow.cues.filter((c) => c.key.startsWith(`${LAB_OTHER}:`) && (c.key !== `${LAB_OTHER}:${LAB_BODY}` || c.kind !== "body")), []);
  if (blow.landed) assert.equal(blowCue(blow.cues, blow.landed.energy, blow.landed.point).length, 1, `${blow.landed.energy} J`);
});
