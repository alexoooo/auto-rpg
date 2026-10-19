/**
 * A point driven (`PointTask`, `src/core/control/motor.ts`): a standing body's whole-body solve asks
 * an effector's point an acceleration beside the stance, and the fist goes where it is asked; a
 * straight drive driven so (`StraightPunch.driven`) lands its blow; a hand asked a spin holds what
 * it holds up (`holdUp`).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createBody, SERVO_SECONDS } from "../src/core/body.ts";
import { humanSpec } from "../src/core/human/spec.ts";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { guardPosture } from "../src/core/skills/guard.ts";
import { holdUp } from "../src/core/skills/hold.ts";
import { armedWith } from "../src/core/items/held.ts";
import { turnOfToRef } from "../src/core/control/support.ts";
import { CLASSIC, OPTIONS } from "../src/core/mind/config.ts";
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

/**
 * How a driven drive asks its fist (`StraightPunch.driven`): up to 600 m/s^2, at the speed that
 * gives over 0.3 m at the least so it lands moving, its velocity closed at 30 per second.
 */
const DRIVEN = Object.freeze({ accel: 600, steer: 30, arrive: 0.3 });

test("an options fighter whose drives drive the fist lands a blow on a foe that stands, and stays up", async () => {
  const stands = { ...CLASSIC, tactics: { kind: "stand" }, executors: [], actions: [] };
  const { world, duel, dispose } = await buildBout({ left: "workshop-fighter", right: "workshop-fighter",
    minds: { left: { ...OPTIONS, executors: OPTIONS.executors.map((executor) => executor.kind === "combination" ? { ...executor, driven: DRIVEN } : executor) }, right: stands }, held: { left: "empty", right: "empty" }, gap: 1.4 });
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

/**
 * The Warrior standing in guard with a club in its right hand and its trunk bent `lean` rad, the
 * hand held up (`holdUp`) or left to the posture: the club's line's angle from up after 2 s, rad.
 */
async function held(hold, lean) {
  const spec = armedWith(humanSpec("workshop-fighter"), "right", "club"), stand = await coreStand(spec);
  const body = createBody(stand.built, stand.world, { servoSeconds: SERVO_SECONDS }), posture = { ...guardPosture(spec), "lumbar flexion": lean };
  const up = holdUp(stand.built), hand = stand.built.segments.get("hand.right");
  body.drive((view) => ({ posture, pushes: [], stance: { feet: ["left", "right"], centre: null, height: view.standing - .03, heading: 0 }, points: hold ? [up("right")] : [] }));
  try {
    for (let k = 0; k < 240; k++) stand.step();
    const line = new Vector3(...spec.held.find((h) => h.segment === "hand.right").along.value).normalize().applyRotationQuaternionToRef(turnOfToRef(hand, new Quaternion()), new Vector3());
    return { angle: Math.acos(Math.min(1, line.y)), down: body.view.down };
  } finally { body.dispose(); stand.dispose(); }
}

test("a held club is held up through the solve however the trunk leans, where the posture leans it with the trunk", async () => {
  const [posture, hold] = [await held(false, 0.5), await held(true, 0.5)];
  assert.ok(posture.angle > 0.3, `the posture alone leans the club with the trunk: ${posture.angle} rad`);
  assert.ok(hold.angle < 0.05, `held, the club stays up: ${hold.angle} rad`);
  assert.deepEqual([posture.down, hold.down], [false, false]);
  assert.equal(holdUp((await coreStand(humanSpec("workshop-fighter"))).built)("right"), null, "an empty hand holds nothing up");
});

test("an options fighter that holds asks its free club hand's spin, and its punching hand none", async () => {
  const stands = { ...CLASSIC, tactics: { kind: "stand" }, executors: [], actions: [] };
  const { world, duel, dispose } = await buildBout({ left: "workshop-fighter", right: "workshop-fighter",
    minds: { left: { ...OPTIONS, guard: { ...OPTIONS.guard, tuning: { ...OPTIONS.guard.tuning, hold: true } } }, right: stands }, held: { left: "club", right: "empty" }, gap: 3 });
  try {
    const left = duel.duelists.left, seen = new Set();
    while (world.time < 1) { world.step(); for (const point of left.minded.skills.state.command.points ?? []) seen.add(`${point.segment}:${point.accel ? "accel" : ""}${point.spin ? "spin" : ""}`); }
    assert.deepEqual([...seen], ["hand.right:spin"]);
  } finally { dispose(); }
});
