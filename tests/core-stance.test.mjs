/**
 * The stance (`src/core/control/stance.ts`): a human on both feet, asked to stand 3 cm under its
 * reference height, stands there without drifting, its centre of mass over the middle of its soles,
 * its feet still and their inertia their own; asked for a place, a height and a heading, it goes
 * there; asked for a place its ankles cannot reach, one its knees cannot, or one past its soles, it
 * stops where it can and stands, and without the limit that stops it does not (the controls); a
 * place at a sideways edge holds with the sole margin and slides a foot without it (the control).
 * Asked for a step, it shifts its weight, swings the foot to where it was asked, lands and stands;
 * asked to turn as it steps, the foot lands facing the new heading, and without the turn's own rate
 * it does not (the control, run by hand).
 * Shoved at the trunk past what its soles hold, it steps to catch itself and stands, where without
 * the step it falls (the control); shoved lightly, it does not step. Asked to walk, it steps of
 * itself, goes the way and about the speed asked, and asked to walk nowhere, stops and stands;
 * asked to walk nowhere from the start, it takes no step (the control). A walk stopped ends with its
 * feet back at the width the body was built standing at, and holds a sideways shove there that the
 * gait's width did not (`shove` in `research/core-stance-trials.mjs`). Shoved hard straight to the
 * side, the Warrior catches itself with the near foot stepping out once the far one has come in.
 * What a stance remembers between steps (`StanceState`, `src/core/control/stance-state.ts`) is one
 * record of plain data.
 * Node core stand, Rapier, both humans, on a ground, 120 Hz.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { createBody } from "../src/core/body.ts";
import { makeStance } from "../src/core/control/stance-state.ts";
import { SOLE_MARGIN, SUPPORT_INSET, STANCE_ANKLE_SPARE } from "../src/core/control/stance-tuning.ts";
import { withinSupport } from "../src/core/control/support.ts";
import { humanSpec } from "../src/core/human/spec.ts";
import { shove } from "../research/core-stance-trials.mjs";
import { coreStand } from "./harness/core-stand.mjs";

const GUARD = {
  "shoulder.right flexion": 0.5, "shoulder.right abduction": -0.2, "elbow.right flexion": 1.3,
  "shoulder.left flexion": 0.5, "shoulder.left abduction": -0.2, "elbow.left flexion": 1.3,
};

/**
 * Stand `model` for `seconds`: the first view fixes the goal, `ask(first)` of the first reading
 * (the centre of mass, the soles' middle, its height over them). Returns the readings at the end and
 * 2 s before it; the feet's slide across the ground and sink into it since the goal was set, and
 * their travel over the last 2 s; and the pelvis's heading.
 */
async function standing(model, seconds, ask, { posture = {}, stance } = {}) {
  const stand = await coreStand(humanSpec(model), { ground: true, hz: 120 });
  const body = createBody(stand.built, stand.world, { servoSeconds: 0.1, stance });
  const feet = ["left", "right"].map((side) => stand.built.segments.get(`foot.${side}`));
  const pelvis = stand.built.joints.get("hip.left").parent;
  let goal = null, from = null;
  body.drive((view) => {
    const s = view.stance;
    if (!goal && view.time > 0) {
      goal = ask({ centre: s.centre.clone(), support: s.support.clone(), height: s.centre.y - s.support.y });
      from = feet.map((foot) => foot.node.position.clone());
    }
    return { posture, hands: { left: null, right: null }, pushes: [], stance: goal };
  });
  const read = () => {
    const s = body.view.stance;
    return { centre: s.centre.clone(), support: s.support.clone(), height: s.centre.y - s.support.y, speed: s.velocity.length() };
  };
  try {
    stand.step(stand.seconds(seconds - 2));
    const before = read(), late = feet.map((foot) => foot.node.position.clone());
    stand.step(stand.seconds(2));
    const after = read();
    const slide = Math.max(...feet.map((foot, k) => across(foot.node.position, from[k])));
    const sink = Math.max(...feet.map((foot, k) => from[k].y - foot.node.position.y));
    const still = Math.max(...feet.map((foot, k) => Vector3.Distance(foot.node.position, late[k])));
    // The pelvis's turn about the vertical since its reference pose.
    const turn = pelvis.node.rotationQuaternion.multiply(Quaternion.Inverse(pelvis.rest));
    const forward = new Vector3(0, 0, 1).applyRotationQuaternion(turn);
    const heading = Math.atan2(forward.x, forward.z);
    const inertia = feet.map((foot) => foot.body.massProperties.moments[0] / humanSpec(model).segments.find((s) => s.name === foot.spec.name).inertia.value[0]);
    return { goal, before, after, slide, sink, still, heading, inertia, angles: { ...body.view.angles }, place: body.view.stance.place.clone() };
  } finally { body.dispose(); stand.dispose(); }
}

const across = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

/**
 * Stand `model` 1 s, 3 cm under its reference height, then step `foot`'s sole's middle by (dx, dz)
 * over 0.45 s lifted 5 cm, the heading turned to `heading` as it steps, and stand to 6 s. Returns the
 * phases seen, where the sole landed against where it was asked to, how far the foot turned between
 * leaving the ground and landing and how far off the heading it landed, the centre of mass's distance
 * from its place and its height and speed at the end, and how far the other foot moved.
 */
async function stepping(model, foot, dx, dz, stance, heading = 0) {
  const stand = await coreStand(humanSpec(model), { ground: true, hz: 120 });
  const body = createBody(stand.built, stand.world, { servoSeconds: 0.1, stance });
  const other = foot === "left" ? "right" : "left";
  const turnOf = () => stand.built.segments.get(`foot.${foot}`).node.rotationQuaternion.clone();
  let goal = null, swing = null, to = null, bearing = null, lifted = null, turned = null, faced = null;
  body.drive((view) => {
    const s = view.stance;
    if (!goal && view.time > 0) goal = { feet: ["left", "right"], centre: null, height: s.centre.y - s.support.y - 0.03, heading: 0 };
    if (goal && !swing && view.time >= 1) {
      to = [s.soles[foot].x + dx, s.soles[foot].z + dz];
      bearing = s.soles[other].clone();
      swing = { foot, to, seconds: 0.45, lift: 0.05 };
      goal = { ...goal, heading };
    }
    return { posture: {}, hands: { left: null, right: null }, pushes: [], stance: goal && { ...goal, swing } };
  });
  try {
    const phases = [];
    let landed = null, drift = 0;
    for (let i = 0; i < stand.seconds(6); i++) {
      stand.step(1);
      const s = body.view.stance;
      if (phases.at(-1) !== s.phase) phases.push(s.phase);
      if (s.phase === "swing" && !lifted) lifted = turnOf();
      if (phases.at(-1) === "stand" && phases.at(-2) === "swing" && !landed) {
        landed = s.soles[foot].clone();
        turned = 2 * Math.acos(Math.min(1, Math.abs(Quaternion.Dot(turnOf(), lifted))));
        const level = Quaternion.RotationAxis(Vector3.Up(), heading).multiply(stand.built.segments.get(`foot.${foot}`).rest);
        faced = 2 * Math.acos(Math.min(1, Math.abs(Quaternion.Dot(turnOf(), level))));
      }
      if (bearing) drift = Math.max(drift, across(s.soles[other], bearing));
    }
    const s = body.view.stance;
    return { phases, miss: landed ? Math.hypot(landed.x - to[0], landed.z - to[1]) : Infinity, turned, faced, off: across(s.centre, s.place),
      low: goal.height - (s.centre.y - s.support.y), speed: s.velocity.length(), drift };
  } finally { body.dispose(); stand.dispose(); }
}

test("a place the soles cannot hold is taken at the nearest point of their drawn-in outline", () => {
  // Two soles 0.1 m by 0.2 m, 0.1 m apart in x: an outline 0.3 m by 0.2 m about the origin, drawn in
  // to 0.3 (1 - inset) by 0.2 (1 - inset).
  const sole = (x) => ({ corners: [[x - 0.05, -0.1], [x + 0.05, -0.1], [x + 0.05, 0.1], [x - 0.05, 0.1]].map(([a, b]) => new Vector3(a, 0, b)) });
  const soles = [sole(-0.1), sole(0.1)], X = 0.15 * (1 - SUPPORT_INSET), Z = 0.1 * (1 - SUPPORT_INSET);
  const cases = [
    // [x, z] asked, [x, z] held
    [[0.01, -0.02], [0.01, -0.02]],
    [[X - 0.001, Z - 0.001], [X - 0.001, Z - 0.001]],
    [[0.3, 0.01], [X, 0.01]],
    [[-0.3, -0.02], [-X, -0.02]],
    [[0.02, 0.5], [0.02, Z]],
    [[-0.01, -0.5], [-0.01, -Z]],
    [[0.5, 0.5], [X, Z]],
    [[-0.5, -0.4], [-X, -Z]],
  ];
  // Staggered soles, the right 0.1 m ahead: a six-sided outline, drawn in to (-0.075, -0.025),
  // (-0.025, -0.025), (0.075, 0.025), (0.075, 0.125), (0.025, 0.125), (-0.075, 0.1). The point
  // below is outside both the bottom edge and the slanted one, and nearest the slanted one's middle.
  const staggered = [sole(-0.1), { corners: sole(0.1).corners.map((q) => q.add(new Vector3(0, 0, 0.1))) }];
  const inset = 1 - 2 * X / 0.3;
  assert.ok(Math.abs(inset - 0.5) < 1e-12, "the staggered case is drawn for an inset of 0.5");
  const slanted = withinSupport(staggered, 0.04, -0.03);
  assert.ok(Math.hypot(slanted[0] - 0.025, slanted[1] - 0) < 1e-9, `(0.04, -0.03) was held at (${slanted}), not at the slanted edge's (0.025, 0)`);
  const held = cases.map(([[x, z]]) => withinSupport(soles, x, z));
  cases.forEach(([asked, want], k) => assert.ok(Math.hypot(held[k][0] - want[0], held[k][1] - want[1]) < 1e-9,
    `(${asked}) was held at (${held[k]}), not (${want})`));
});

for (const model of ["workshop-fighter", "workshop-rogue"]) {
  test(`${model} stands without drifting`, async () => {
    const r = await standing(model, 5, (first) => ({ feet: ["left", "right"], centre: null, height: first.height - 0.03, heading: 0 }), { posture: GUARD });
    const off = across(r.after.centre, r.after.support), drift = Vector3.Distance(r.after.centre, r.before.centre);
    const low = Math.abs(r.after.height - r.goal.height);
    assert.ok(off < 0.001, `the centre of mass stopped ${(1000 * off).toFixed(2)} mm from the middle of the soles`);
    assert.ok(low < 0.001, `the centre of mass stood ${(1000 * low).toFixed(2)} mm off its height`);
    assert.ok(drift < 0.0005 && r.after.speed < 0.001, `it drifted ${(1000 * drift).toFixed(3)} mm in 2 s, at ${(100 * r.after.speed).toFixed(3)} cm/s`);
    // The feet settle 4-5 mm into the ground in the first second, as the engine's contact takes the
    // weight, and are still after.
    assert.ok(r.slide < 0.002 && r.sink < 0.008 && r.still < 0.0001,
      `the feet slid ${(1000 * r.slide).toFixed(2)} mm, sank ${(1000 * r.sink).toFixed(2)} mm, moved ${(1000 * r.still).toFixed(4)} mm in the last 2 s`);
    assert.ok(r.inertia.every((x) => Math.abs(x - 1) < 1e-9), `the feet's inertia was not their own: x${r.inertia}`);
  });
}

test("the stance goes where it is asked: a place, a height, a heading", async () => {
  const r = await standing("workshop-rogue", 5, (first) => ({ feet: ["left", "right"],
    centre: [first.support.x + 0.02, first.support.z + 0.03], height: first.height - 0.03, heading: 0.2 }));
  const off = Math.hypot(r.after.centre.x - r.goal.centre[0], r.after.centre.z - r.goal.centre[1]);
  const low = Math.abs(r.after.height - r.goal.height), turned = Math.abs(r.heading - r.goal.heading);
  assert.ok(off < 0.005, `the centre of mass stopped ${(1000 * off).toFixed(1)} mm from its place`);
  assert.ok(low < 0.005, `the centre of mass stood ${(1000 * low).toFixed(1)} mm off its height`);
  assert.ok(turned < 0.02, `the pelvis faced ${turned.toFixed(3)} rad off its heading`);
  assert.ok(r.slide < 0.005, `the feet slid ${(1000 * r.slide).toFixed(1)} mm`);
});

test("a height beyond the ankles' range is not reached: each human sinks to their reach less the spare and stands, and asked for it does not", async () => {
  // 10 cm lower, and 3 cm further forward, asks the ankles for more dorsiflexion than their range
  // (humanSpec) has, with the feet flat.
  for (const model of ["workshop-rogue", "workshop-fighter"]) {
    const ask = (first) => ({ feet: ["left", "right"], centre: [first.support.x, first.support.z + 0.03], height: first.height - 0.1, heading: 0 });
    const r = await standing(model, 5, ask), control = await standing(model, 5, ask, { stance: { ankleSpare: null } });
    const upper = humanSpec(model).joints.find((j) => j.name === "ankle.left").dofs.find((d) => d.positive === "dorsiflexion").max.value;
    const ankleOf = (s) => Math.max(s.angles["ankle.left dorsiflexion"], s.angles["ankle.right dorsiflexion"]);
    const ankle = ankleOf(r), above = r.after.height - r.goal.height, off = across(r.after.centre, r.place);
    const fell = control.after.height < control.goal.height - 0.1, pressed = ankleOf(control) > upper - 0.005, missed = across(control.after.centre, control.place);
    assert.ok(above > 0.03, `${model} sank within ${(1000 * above).toFixed(1)} mm of a height past the ankles' range`);
    assert.ok(ankle < upper - STANCE_ANKLE_SPARE + 0.01, `${model}'s ankle bent to ${ankle.toFixed(3)} rad, past its range ${upper.toFixed(3)} less the spare`);
    assert.ok(off < 0.005 && r.after.speed < 0.01, `${model} did not stand: ${(1000 * off).toFixed(1)} mm off at ${(100 * r.after.speed).toFixed(2)} cm/s`);
    // Asked past the ankles' range, a body falls, or stands with its ankles on their stops, where
    // they can no longer carry it to its place.
    assert.ok(fell || (pressed && missed > 0.005), `the control: asked past the ankles' range, ${model} stood ${(1000 * missed).toFixed(1)} mm from its place, ankle ${ankleOf(control).toFixed(3)} rad`);
  }
});

test("a place past the soles is held at the edge of what they hold, each way, and the body stands", async () => {
  for (const [dx, dz] of [[0.3, 0], [-0.3, 0], [0, 0.3], [0, -0.3]]) {
    const r = await standing("workshop-fighter", 6, (first) => ({ feet: ["left", "right"],
      centre: [first.support.x + dx, first.support.z + dz], height: first.height - 0.03, heading: 0 }));
    const off = Math.hypot(r.after.centre.x - r.place.x, r.after.centre.z - r.place.z);
    const moved = Math.hypot(r.place.x - r.goal.centre[0], r.place.z - r.goal.centre[1]);
    const low = Math.abs(r.after.height - r.goal.height);
    assert.ok(moved > 0.1, `(${dx}, ${dz}): a place 30 cm out was held only ${(1000 * moved).toFixed(0)} mm in`);
    assert.ok(off < 0.015 && low < 0.005, `(${dx}, ${dz}): stood ${(1000 * off).toFixed(1)} mm from the held place, ${(1000 * low).toFixed(1)} mm off height`);
    assert.ok(r.slide < 0.002, `(${dx}, ${dz}): the feet slid ${(1000 * r.slide).toFixed(1)} mm`);
  }
});

/**
 * Stand `model` 1.5 s, 3 cm under its reference height, then shove the middle trunk at its centre
 * of mass by `impulse` N s level, `degrees` about the vertical from forward (+z; 90 is +x), and
 * watch 4.5 s. Returns the steps the stance took to catch it, whether it fell (its centre sank
 * 25 cm under the goal's height), and its speed and height under the goal at the end.
 */
async function shoved(model, impulse, degrees, stance) {
  const stand = await coreStand(humanSpec(model), { ground: true, hz: 120 });
  const body = createBody(stand.built, stand.world, { servoSeconds: 0.1, stance });
  let goal = null;
  body.drive((view) => {
    const s = view.stance;
    if (!goal && view.time > 0) goal = { feet: ["left", "right"], centre: null, height: s.centre.y - s.support.y - 0.03, heading: 0 };
    return { posture: {}, hands: { left: null, right: null }, pushes: [], stance: goal };
  });
  try {
    stand.step(stand.seconds(1.5));
    const trunk = stand.built.segments.get("middleTrunk"), turn = trunk.node.rotationQuaternion.multiply(Quaternion.Inverse(trunk.rest));
    const com = trunk.spec.centreOfMass.value, o = trunk.frame.origin, way = degrees * Math.PI / 180;
    const at = new Vector3(com[0] - o[0], com[1] - o[1], com[2] - o[2]).applyRotationQuaternion(turn).add(trunk.node.position);
    trunk.body.applyImpulse(new Vector3(impulse * Math.sin(way), 0, impulse * Math.cos(way)), at);
    let low = -Infinity;
    for (let i = 0; i < stand.seconds(4.5); i++) {
      stand.step(1);
      const s = body.view.stance;
      low = Math.max(low, goal.height - (s.centre.y - s.support.y));
    }
    const s = body.view.stance;
    return { steps: s.recoveries, fell: low > 0.25, low: goal.height - (s.centre.y - s.support.y), held: s.centre.y - s.support.y - s.plan.y, speed: s.velocity.length() };
  } finally { body.dispose(); stand.dispose(); }
}

test("shoved past its soles, each human steps to catch itself and stands, and without the step falls; shoved lightly, it does not step", async () => {
  // Each at most what STANCE_RECOVERY's sweep holds that way stepping, and more than it holds
  // unstepped: the Rogue 35 N s forward (20 unstepped), back (20) and to its left (30), and 40
  // forward right (30); the Warrior 55 forward (30), forward right (40) and back (30). Straight to
  // the side a step holds no more than standing, so no case is there.
  const cases = [["workshop-rogue", 35, 0], ["workshop-rogue", 35, 180], ["workshop-rogue", 35, 270], ["workshop-rogue", 40, 45],
    ["workshop-fighter", 55, 0], ["workshop-fighter", 55, 45], ["workshop-fighter", 55, 180]];
  for (const [model, impulse, degrees] of cases) {
    const caught = await shoved(model, impulse, degrees), free = await shoved(model, impulse, degrees, { recovery: null });
    const at = `${model} ${impulse} N s at ${degrees}`;
    assert.ok(caught.steps >= 1 && !caught.fell, `${at}: ${caught.steps} steps, ${caught.fell ? "fell" : "stood"}`);
    // A wide stance a step leaves reaches only so high (STANCE_KNEE_BEND, STANCE_ANKLE_SPARE): the
    // height it holds is its plan's, which may be under the goal's. The Rogue shoved forward ends
    // 2 mm over it, its thighs pressed together at 16 N, which the stance does not model.
    assert.ok(caught.speed < 0.01 && Math.abs(caught.held) < 0.005 && Math.abs(caught.low) < 0.05,
      `${at}: ended ${(1000 * caught.low).toFixed(1)} mm low, ${(1000 * caught.held).toFixed(1)} mm off the height held, at ${(100 * caught.speed).toFixed(2)} cm/s`);
    assert.ok(free.fell, `the control: ${at} unstepping stood`);
  }
  for (const model of ["workshop-rogue", "workshop-fighter"]) for (const degrees of [0, 90, 180, 270]) {
    const light = await shoved(model, 10, degrees);
    assert.deepEqual([light.steps, light.fell], [0, false], `${model} 10 N s at ${degrees}: ${light.steps} steps, ${light.fell ? "fell" : "stood"}`);
  }
});

test("the sole margin holds a sideways edge: the Rogue stands at +x with it, and without it a foot slides", async () => {
  const edge = (soleMargin) => standing("workshop-rogue", 6, (first) => ({ feet: ["left", "right"],
    centre: [first.support.x + 0.3, first.support.z], height: first.height - 0.03, heading: 0 }), { stance: { soleMargin } });
  const held = await edge(SOLE_MARGIN), free = await edge(0);
  const off = (r) => Math.hypot(r.after.centre.x - r.place.x, r.after.centre.z - r.place.z);
  assert.ok(off(held) < 0.005 && held.slide < 0.002, `with the margin, it stood ${(1000 * off(held)).toFixed(1)} mm off, the feet slid ${(1000 * held.slide).toFixed(1)} mm`);
  assert.ok(free.slide > 0.05, `the control: with no margin the Rogue's feet slid only ${(1000 * free.slide).toFixed(1)} mm`);
});

test("each human steps each foot 15 and 25 cm forward, 15 cm back and 10 cm out, lands where asked and stands", async () => {
  for (const model of ["workshop-rogue", "workshop-fighter"]) for (const foot of ["left", "right"]) {
    const out = foot === "left" ? -0.1 : 0.1;
    for (const [dx, dz] of [[0, 0.15], [0, 0.25], [0, -0.15], [out, 0]]) {
      const r = await stepping(model, foot, dx, dz);
      const at = `${model} ${foot} (${dx}, ${dz})`;
      assert.deepEqual(r.phases, ["stand", "shift", "swing", "stand"], `${at}: phases ${r.phases.join(" ")}`);
      // Carried on the path's speeds alone, with no pull onto it, a step back lands 18 to 23 mm off.
      assert.ok(r.miss < 0.017, `${at}: landed ${(1000 * r.miss).toFixed(1)} mm from the asked place`);
      assert.ok(r.turned < 0.05, `${at}: the foot turned ${r.turned.toFixed(3)} rad in the air`);
      // A spread stance is held lower than asked, for the legs' reach (STANCE_KNEE_BEND).
      assert.ok(r.off < 0.005 && r.low > -0.005 && r.low < 0.05 && r.speed < 0.01,
        `${at}: stood ${(1000 * r.off).toFixed(1)} mm from the held place, ${(1000 * r.low).toFixed(1)} mm low, at ${(100 * r.speed).toFixed(2)} cm/s`);
      assert.ok(r.drift < 0.01, `${at}: the other foot moved ${(1000 * r.drift).toFixed(1)} mm`);
    }
  }
});

test("each human steps each foot 15 cm forward turned half a radian its own way, and lands facing the heading", async () => {
  // Turned without its own rate, only pulled onto its path at the swing's constant, a foot lags the
  // whole of its turn and lands off the heading.
  for (const model of ["workshop-rogue", "workshop-fighter"]) for (const foot of ["left", "right"]) {
    const heading = foot === "right" ? 0.5 : -0.5, r = await stepping(model, foot, 0, 0.15, undefined, heading);
    const at = `${model} ${foot}`;
    assert.deepEqual(r.phases, ["stand", "shift", "swing", "stand"], `${at}: phases ${r.phases.join(" ")}`);
    assert.ok(r.faced < 0.05, `${at}: landed ${r.faced.toFixed(3)} rad off the heading`);
    assert.ok(r.miss < 0.017, `${at}: landed ${(1000 * r.miss).toFixed(1)} mm from the asked place`);
    assert.ok(r.drift < 0.01, `${at}: the other foot moved ${(1000 * r.drift).toFixed(1)} mm`);
  }
});

test("asked higher than the legs reach with their knees bent, each human stands at that reach, and held to the height asked wanders", async () => {
  // The Rogue 10 cm higher, the Warrior 5: past the reach of legs bent by STANCE_KNEE_BEND, where a
  // leg is near straight and its Jacobian near singular. Held to the height asked, a human wanders on
  // its feet (the control).
  for (const [model, rise] of [["workshop-rogue", 0.1], ["workshop-fighter", 0.05]]) {
    const ask = (first) => ({ feet: ["left", "right"], centre: null, height: first.height + rise, heading: 0 });
    const bent = await standing(model, 5, ask), straight = await standing(model, 5, ask, { stance: { kneeBend: null } });
    const drift = (r) => Vector3.Distance(r.after.centre, r.before.centre);
    assert.ok(drift(bent) < 0.0005 && bent.after.speed < 0.001 && bent.slide < 0.002,
      `${model}: with the bend, it drifted ${(1000 * drift(bent)).toFixed(2)} mm in 2 s, its feet ${(1000 * bent.slide).toFixed(1)} mm`);
    assert.ok(bent.after.height < bent.goal.height - 0.02, `${model}: with the bend, it rose to within ${(1000 * (bent.goal.height - bent.after.height)).toFixed(1)} mm of a height past the legs' reach`);
    assert.ok(straight.slide > 0.02, `the control: ${model}, held to the height asked, its feet travelled only ${(1000 * straight.slide).toFixed(1)} mm`);
  }
});

/**
 * Stand `model` 1 s, 3 cm under its reference height, walk at `speed` m/s `degrees` about the
 * vertical from forward (+z; 90 is +x) for 8 s, then walk nowhere for 4 s. Returns the strides,
 * whether it fell (its centre sank 25 cm under the goal's height), the mean velocity along the walk
 * and across it over the walk's last 3 s, the steps taken over the stop's last 2 s, and the speed,
 * phase and the centre's distance from the place the stance holds at the end.
 */
async function walking(model, degrees, speed) {
  const stand = await coreStand(humanSpec(model), { ground: true, hz: 120 });
  const body = createBody(stand.built, stand.world, { servoSeconds: 0.1 });
  const way = degrees * Math.PI / 180, ux = Math.sin(way), uz = Math.cos(way);
  let goal = null, walk = null;
  body.drive((view) => {
    const s = view.stance;
    if (!goal && view.time > 0) goal = { feet: ["left", "right"], centre: null, height: s.centre.y - s.support.y - 0.03, heading: 0 };
    return { posture: {}, hands: { left: null, right: null }, pushes: [], stance: goal && { ...goal, walk } };
  });
  try {
    stand.step(stand.seconds(1));
    let low = -Infinity;
    const run = (seconds) => {
      for (let i = 0; i < stand.seconds(seconds); i++) {
        stand.step(1);
        const s = body.view.stance;
        low = Math.max(low, goal.height - (s.centre.y - s.support.y));
      }
    };
    walk = [speed * ux, speed * uz];
    run(5);
    const from = body.view.stance.centre.clone();
    run(3);
    const to = body.view.stance.centre;
    const along = ((to.x - from.x) * ux + (to.z - from.z) * uz) / 3, across = ((to.x - from.x) * uz - (to.z - from.z) * ux) / 3;
    const strides = body.view.stance.strides;
    walk = null;
    run(2);
    const settled = body.view.stance.strides;
    run(2);
    const s = body.view.stance;
    return { strides, fell: low > 0.25, along, across, speed: s.velocity.length(), phase: s.phase,
      stepped: s.strides - settled, off: Math.hypot(s.centre.x - s.place.x, s.centre.z - s.place.z) };
  } finally { body.dispose(); stand.dispose(); }
}

test("asked to walk, each human steps of itself the way and about the speed asked, and asked to stop, stops and stands", async () => {
  const speed = 0.3;
  for (const model of ["workshop-rogue", "workshop-fighter"]) for (const degrees of [0, 90, 180]) {
    const r = await walking(model, degrees, speed);
    const at = `${model} at ${speed} m/s, ${degrees}`;
    assert.ok(!r.fell && r.strides >= 8, `${at}: ${r.strides} strides, ${r.fell ? "fell" : "stood"}`);
    // A walk goes at about 0.94 of the speed asked (STANCE_GAIT).
    assert.ok(r.along > 0.7 * speed && r.along < 1.25 * speed && Math.abs(r.across) < 0.25 * speed,
      `${at}: ${r.along.toFixed(3)} m/s along, ${r.across.toFixed(3)} across`);
    // Stopped, it steps no more and stands still over its place.
    assert.ok(r.phase === "stand" && r.stepped === 0 && r.off < 0.01 && r.speed < 0.01,
      `${at}: stopped, ${r.phase}, ${r.stepped} steps over its last 2 s, ${(100 * r.off).toFixed(1)} cm off its place at ${(100 * r.speed).toFixed(2)} cm/s`);
  }
  // The control: walking nowhere, it takes no step and goes nowhere.
  const still = await walking("workshop-rogue", 0, 0);
  assert.ok(still.strides === 0 && !still.fell && Math.abs(still.along) < 0.01 && still.speed < 0.01,
    `the control: walking nowhere, ${still.strides} strides, ${still.along.toFixed(3)} m/s`);
});

test("a walk stopped settles its feet to the body's own width, and holds a sideways shove as the built stance does", async () => {
  // An impulse each human holds sideways at its built width and not on the gait's narrower one (the
  // sweep's shove battery at rest, and with `--walked 0.3` without the settle step: Rogue 25, Warrior
  // 35 N s at 90).
  for (const [model, impulse] of [["workshop-rogue", 30], ["workshop-fighter", 45]]) {
    const rest = await shove({ model, impulse, degrees: 90 }), walked = await shove({ model, impulse, degrees: 90, walked: 0.3 });
    assert.ok(Math.abs(walked.apart - rest.apart) < 0.01, `${model}: apart ${walked.apart.toFixed(3)} m after a walk, ${rest.apart.toFixed(3)} built`);
    assert.ok(!rest.fell && !walked.fell, `${model}: ${impulse} N s at 90 ${rest.fell ? "fell" : "held"} built, ${walked.fell ? "fell" : "held"} after a walk`);
  }
});

test("shoved hard to the side, the Warrior brings its far foot in and steps out with the near one, and stands", async () => {
  // 60 N s straight to each side: past the 55 the shove battery holds there when only the far foot
  // steps (`docs/reference/stance-tuning.md#recovery-step`).
  for (const degrees of [90, 270]) {
    const r = await shove({ model: "workshop-fighter", impulse: 60, degrees });
    assert.ok(!r.fell && r.steps >= 2 && r.speed < 0.05, `at ${degrees}: ${r.fell ? "fell" : "held"} in ${r.steps} steps at ${r.speed.toFixed(3)} m/s`);
  }
});

test("what a stance remembers is one record of plain data, which lists each foot's memory", async () => {
  /** The paths under `value` that are not plain data: numbers, strings, plain objects, arrays, typed arrays, vectors and turns. */
  const faults = (value, path, seen = new Set()) => {
    if (value === null || ["number", "string", "boolean"].includes(typeof value)) return [];
    if (typeof value !== "object") return [`${path}: a ${typeof value}`];
    if (seen.has(value)) return [];
    seen.add(value);
    if (ArrayBuffer.isView(value) || value instanceof Vector3 || value instanceof Quaternion) return [];
    if (Array.isArray(value)) return value.flatMap((item, k) => faults(item, `${path}[${k}]`, seen));
    const made = Object.getPrototypeOf(value);
    if (made !== Object.prototype) return [`${path}: a ${made?.constructor?.name}`];
    return Object.entries(value).flatMap(([key, item]) => faults(item, `${path}.${key}`, seen));
  };
  const stand = await coreStand(humanSpec("workshop-fighter"), { ground: true, hz: 120 });
  try {
    const s = makeStance(stand.built, {});
    assert.deepEqual(faults(s.state, "state"), []);
    assert.deepEqual(Object.keys(s.state).sort(),
      ["aim", "feet", "held", "last", "owned", "pace", "plan", "reading", "step", "stride", "striding", "tasks"]);
    assert.equal(s.state.feet.length, 2);
    assert.ok(s.state.feet.every((memory, k) => memory === s.feet[k].memory), "the state lists each foot's own memory");
    assert.deepEqual(s.state.feet, [{ channels: [], rolled: false }, { channels: [], rolled: false }]);
    assert.ok(s.state.reading.soles.left === s.feet[0].middle && s.state.reading.soles.right === s.feet[1].middle, "the reading's soles are the feet's middles");
    // The controls: a foot holds a segment's node, a turn of the engine's and a function are not data.
    assert.deepEqual(faults({ node: s.feet[0].segment.node }, "state"), ["state.node: a TransformNode"]);
    assert.notEqual(faults({ foot: s.feet[0] }, "state").length, 0, "a foot is not data");
    assert.deepEqual(faults({ read() {} }, "state"), ["state.read: a function"]);
    assert.deepEqual(faults({ at: [new Map()] }, "state"), ["state.at[0]: a Map"]);
  } finally { stand.dispose(); }
});
