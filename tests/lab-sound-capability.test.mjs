/**
 * **What the lab's modes do that is heard** (`src/lab/sound-log.ts`), measured and not a gate
 * (`tests/experimental.json`): a fall that sounds of the ground, a Routine blow that lands, a run
 * that keeps its feet and a Blow that lands hard. Node core stand, Rapier, each body built in its
 * guard as the lab builds it, 120 Hz (the Blow 480 Hz), balance 0 %.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { LAB_BODY, LAB_OTHER } from "../src/lab/sound-log.ts";
import { blowThrown, routinePushed, routineStruck, runShuttle, stanceShoved } from "./fixtures/sound-log.mjs";

test("a_shoved_stance_falls_loud_on_the_ground", async () => {
  const stance = await stanceShoved();
  const falls = stance.cues.filter((c) => c.key === `${LAB_BODY}:ground`);
  assert.ok(stance.down && falls.length > 10 && Math.max(...falls.map((c) => c.strength)) > 0.5, `${falls.length} touches of the ground`);
});

test("a_pushed_routine_falls_heard", async () => {
  const routine = await routinePushed();
  assert.ok(routine.down && routine.cues.length > 5, `${routine.cues.length} cues`);
});

test("the_routine_lands_a_blow_on_its_target_and_stays_up", async () => {
  const { cues, reading, down } = await routineStruck();
  assert.ok(reading?.blow && !down, `the target read ${JSON.stringify(reading)}`);
  const met = cues.filter((c) => c.key === `${LAB_OTHER}:${LAB_BODY}`);
  const loud = Math.min(1, Math.sqrt(reading.blow.energy / 60));
  assert.deepEqual(met.filter((c) => Math.abs(c.strength - loud) < 1e-9).map((c) => c.point), [{ x: reading.blow.point[0], z: reading.blow.point[2] }], `${reading.blow.energy} J, and ${met.map((c) => c.strength)}`);
});

test("the_run_keeps_its_feet_round_the_shuttle", async () => {
  const run = await runShuttle();
  assert.ok(!run.down && run.cues.length >= 6, `${run.cues.length} footfalls`);
});

test("the_lab_blow_lands_hard_and_fast", async () => {
  const blow = await blowThrown(), { landed } = blow;
  assert.ok(landed && !blow.down, "the blow landed");
  assert.deepEqual(blow.cues.filter((c) => c.point.x === landed.point[0] && c.point.z === landed.point[2]), [{ key: `${LAB_OTHER}:${LAB_BODY}`, kind: "body", strength: 1, point: { x: landed.point[0], z: landed.point[2] } }]);
  assert.ok(landed.energy > 60 && blow.fastest > 19, `${landed.energy} J, ${blow.fastest} m/s`);
});
