/**
 * A point driven (`PointTask`, `src/core/control/motor.ts`): a standing body's whole-body solve asks
 * an effector's point an acceleration beside the stance, and the fist goes where it is asked; a
 * straight drive driven so (`StraightPunch.driven`) lands its blow.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createBody, SERVO_SECONDS } from "../src/core/body.ts";
import { humanSpec } from "../src/core/human/spec.ts";
import { guardPosture } from "../src/core/skills/guard.ts";
import { CLASSIC } from "../src/core/mind/config.ts";
import { buildBout } from "../research/bout.mjs";
import { coreStand } from "./harness/core-stand.mjs";

/**
 * The Warrior standing in guard, its right knuckles asked `accel` (world, m/s^2) from 1 s for
 * `seconds`: the fist's velocity at 1 s and at the end of the ask, and whether it is down at 2 s.
 */
async function driven(accel, seconds, extra = {}) {
  const spec = humanSpec("workshop-fighter"), stand = await coreStand(spec);
  const body = createBody(stand.built, stand.world, { servoSeconds: SERVO_SECONDS }), guard = guardPosture(spec);
  let time = 0;
  body.drive((view) => ({ posture: guard, pushes: [], stance: { feet: ["left", "right"], centre: null, height: view.standing - .03, heading: 0 },
    points: accel && time >= 1 && time < 1 + seconds ? [{ segment: "hand.right", point: "knuckles", accel }] : [], ...extra }));
  try {
    const at = (s) => { while (time < s - 1e-9) { stand.step(); time += 1 / 120; } return body.view.fists.right.velocity.clone(); };
    const before = at(1), after = at(1 + seconds + 1 / 120);
    at(2);
    return { before, after, down: body.view.down };
  } finally { body.dispose(); stand.dispose(); }
}

test("a standing body's fist driven forward gains the speed asked, the body standing", async () => {
  const [still, punched] = [await driven(null, 0.08), await driven([0, 0, 60], 0.08)];
  assert.ok(Math.abs(still.after.z - still.before.z) < 0.1, `undriven, the fist keeps its ${still.before.z} m/s: ${still.after.z}`);
  // 60 m/s^2 for 0.08 s is 4.8 m/s; the arm's reaction and gravity's sag take some of it.
  const gained = punched.after.z - punched.before.z;
  assert.ok(gained > 3 && gained < 5, `driven, it gains ${gained} m/s forward`);
  assert.ok(Math.abs(punched.after.y) < 0.5 * gained && Math.abs(punched.after.x) < 0.5 * gained, `mostly forward: ${punched.after}`);
  assert.deepEqual([still.down, punched.down], [false, false]);
});

test("a point driven refuses a push on its chain, an unknown point and a second task on its segment", async () => {
  await assert.rejects(driven([0, 0, 60], 0.05, { pushes: [{ channel: "elbow.right flexion", sense: -1, level: 1 }] }), /push on hand\.right's chain/);
  const knuckles = { segment: "hand.right", point: "knuckles", accel: [0, 0, 1] };
  await assert.rejects(driven([0, 0, 60], 0.05, { points: [{ ...knuckles, point: "nowhere" }] }), /no effector point hand\.right\/nowhere/);
  await assert.rejects(driven([0, 0, 60], 0.05, { points: [knuckles, knuckles] }), /two points driven on hand\.right/);
});

test("an options fighter whose drives drive the fist lands a blow on a foe that stands, and stays up", async () => {
  const stands = { ...CLASSIC, tactics: { kind: "stand" }, executors: [], actions: [] };
  const { world, duel, dispose } = await buildBout({ left: "workshop-fighter", right: "workshop-fighter",
    minds: { left: { kind: "options", tuning: { driven: true } }, right: stands }, held: { left: "empty", right: "empty" }, gap: 1.4 });
  try {
    const left = duel.duelists.left;
    let driven = 0;
    while (world.time < 3.4) { world.step(); if (left.minded.skills.state.command.points?.length) driven++; }
    const blows = duel.blows.filter((blow) => blow.sides.some((side) => side.fighter === "left" && /^hand\./.test(side.segment)));
    assert.ok(driven > 0, "its drive drives a point");
    assert.ok(blows.some((blow) => blow.closing >= 2), `a hand blow at 2 m/s or more: ${blows.map((blow) => blow.closing.toFixed(1))}`);
    assert.deepEqual([left.body.view.down, duel.verdict ?? null], [false, null]);
  } finally { dispose(); }
});
