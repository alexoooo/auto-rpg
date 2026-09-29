/**
 * The stance (`src/core/control/stance.ts`): a human on both feet, asked to stand 3 cm under its
 * reference height, stands there without drifting, its centre of mass over the middle of its soles;
 * asked for a place, a height and a heading, it goes there; asked for a place its ankles cannot
 * reach, or one past its soles, it stops where it can and stands; and with its feet unconditioned
 * it does not stand still (the control). Asked for a step, it shifts its weight, swings the foot to
 * where it was asked, lands and stands. Shoved at the trunk past what its soles hold, it steps to
 * catch itself and stands, where without the step it falls (the control); shoved lightly, it does
 * not step. Asked to walk, it steps of itself, goes the way and about the speed asked, and asked to
 * walk nowhere, stops and stands; asked to walk nowhere from the start, it takes no step (the
 * control). Node stand, both humans, on a ground, 120 Hz.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { createBody } from "../src/core/body.ts";
import { SUPPORT_INSET, STANCE_ANKLE_SPARE, STANCE_FOOT_CONDITIONING, STANCE_KNEE_BEND, STANCE_VELOCITY_GAIN, withinSupport } from "../src/core/control/stance.ts";
import { humanSpec } from "../src/core/human/spec.ts";
import { coreStand } from "./harness/core-stand.mjs";

const GUARD = {
  "shoulder.right flexion": 0.5, "shoulder.right abduction": -0.2, "elbow.right flexion": 1.3,
  "shoulder.left flexion": 0.5, "shoulder.left abduction": -0.2, "elbow.left flexion": 1.3,
};

/**
 * Stand `model` for `seconds`: the first view fixes the goal, `ask(first)` of the first reading
 * (the centre of mass, the soles' middle, its height over them). Returns the readings at the end and
 * 2 s before it, the feet's travel, and the pelvis's heading.
 */
async function standing(model, seconds, ask, { posture = {}, footConditioning, stance } = {}) {
  const stand = await coreStand(humanSpec(model), { ground: true, hz: 120 });
  const body = createBody(stand.built, stand.world, { servoSeconds: 0.1, stance: stance ?? (footConditioning ? { footConditioning } : undefined) });
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
    const before = read();
    stand.step(stand.seconds(2));
    const after = read();
    const travel = Math.max(...feet.map((foot, k) => Vector3.Distance(foot.node.position, from[k])));
    // The pelvis's turn about the vertical since its reference pose.
    const turn = pelvis.node.rotationQuaternion.multiply(Quaternion.Inverse(pelvis.rest));
    const forward = new Vector3(0, 0, 1).applyRotationQuaternion(turn);
    const heading = Math.atan2(forward.x, forward.z);
    const inertia = feet.map((foot) => foot.body.getMassProperties().inertia.x / humanSpec(model).segments.find((s) => s.name === foot.spec.name).inertia.value[0] * foot.spec.mass.value);
    return { goal, before, after, travel, heading, inertia, angles: { ...body.view.angles }, place: body.view.stance.place.clone() };
  } finally { body.dispose(); stand.dispose(); }
}

const across = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

/**
 * Stand `model` 1 s, 3 cm under its reference height, then step `foot`'s sole's middle by (dx, dz)
 * over 0.45 s lifted 5 cm, and stand to 6 s. Returns the phases seen, where the sole landed against
 * where it was asked to, how far the foot turned between leaving the ground and landing, the centre
 * of mass's distance from its place and its height and speed at the end, and how far the other foot
 * moved.
 */
async function stepping(model, foot, dx, dz, stance) {
  const stand = await coreStand(humanSpec(model), { ground: true, hz: 120 });
  const body = createBody(stand.built, stand.world, { servoSeconds: 0.1, stance });
  const other = foot === "left" ? "right" : "left";
  const turnOf = () => stand.built.segments.get(`foot.${foot}`).node.rotationQuaternion.clone();
  let goal = null, swing = null, to = null, bearing = null, lifted = null, turned = null;
  body.drive((view) => {
    const s = view.stance;
    if (!goal && view.time > 0) goal = { feet: ["left", "right"], centre: null, height: s.centre.y - s.support.y - 0.03, heading: 0 };
    if (goal && !swing && view.time >= 1) {
      to = [s.soles[foot].x + dx, s.soles[foot].z + dz];
      bearing = s.soles[other].clone();
      swing = { foot, to, seconds: 0.45, lift: 0.05 };
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
      }
      if (bearing) drift = Math.max(drift, across(s.soles[other], bearing));
    }
    const s = body.view.stance;
    return { phases, miss: landed ? Math.hypot(landed.x - to[0], landed.z - to[1]) : Infinity, turned, off: across(s.centre, s.place),
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
  console.log(`MUT within support ${held.map(([x, z]) => `(${x.toFixed(3)}, ${z.toFixed(3)})`).join(" ")}`);
  cases.forEach(([asked, want], k) => assert.ok(Math.hypot(held[k][0] - want[0], held[k][1] - want[1]) < 1e-9,
    `(${asked}) was held at (${held[k]}), not (${want})`));
});

for (const model of ["workshop-fighter", "workshop-rogue"]) {
  test(`${model} stands without drifting`, async () => {
    const r = await standing(model, 5, (first) => ({ feet: ["left", "right"], centre: null, height: first.height - 0.03, heading: 0 }), { posture: GUARD });
    const off = across(r.after.centre, r.after.support), drift = Vector3.Distance(r.after.centre, r.before.centre);
    const low = Math.abs(r.after.height - r.goal.height);
    console.log(`MUT stance ${model}: ${(1000 * off).toFixed(1)} mm off the soles' middle, ${(1000 * low).toFixed(1)} mm off height,`
      + ` drifted ${(1000 * drift).toFixed(2)} mm in the last 2 s, at ${(100 * r.after.speed).toFixed(2)} cm/s, feet moved ${(1000 * r.travel).toFixed(1)} mm,`
      + ` foot inertia x${r.inertia[0].toFixed(0)}`);
    assert.ok(off < 0.005, `the centre of mass stopped ${(1000 * off).toFixed(1)} mm from the middle of the soles`);
    assert.ok(low < 0.005, `the centre of mass stood ${(1000 * low).toFixed(1)} mm off its height`);
    assert.ok(drift < 0.002 && r.after.speed < 0.01, `it drifted ${(1000 * drift).toFixed(2)} mm in 2 s, at ${(100 * r.after.speed).toFixed(2)} cm/s`);
    assert.ok(r.travel < 0.005, `the feet moved ${(1000 * r.travel).toFixed(1)} mm`);
    assert.ok(Math.abs(r.inertia[0] / STANCE_FOOT_CONDITIONING - 1) < 1e-4, `a stance foot's inertia was x${r.inertia[0]}`);
  });
}

test("the stance goes where it is asked: a place, a height, a heading", async () => {
  const r = await standing("workshop-rogue", 5, (first) => ({ feet: ["left", "right"],
    centre: [first.support.x + 0.02, first.support.z + 0.03], height: first.height - 0.03, heading: 0.2 }));
  const off = Math.hypot(r.after.centre.x - r.goal.centre[0], r.after.centre.z - r.goal.centre[1]);
  const low = Math.abs(r.after.height - r.goal.height), turned = Math.abs(r.heading - r.goal.heading);
  console.log(`MUT stance goal: ${(1000 * off).toFixed(1)} mm from the place, ${(1000 * low).toFixed(1)} mm off height, heading ${turned.toFixed(3)} rad off, feet moved ${(1000 * r.travel).toFixed(1)} mm`);
  assert.ok(off < 0.005, `the centre of mass stopped ${(1000 * off).toFixed(1)} mm from its place`);
  assert.ok(low < 0.005, `the centre of mass stood ${(1000 * low).toFixed(1)} mm off its height`);
  assert.ok(turned < 0.02, `the pelvis faced ${turned.toFixed(3)} rad off its heading`);
  assert.ok(r.travel < 0.005, `the feet moved ${(1000 * r.travel).toFixed(1)} mm`);
});

test("a height beyond the ankles' range is not reached: each human sinks to their reach less the spare and stands, and asked for it falls", async () => {
  // 10 cm lower, and 3 cm further forward, asks the ankles for more dorsiflexion than their range
  // (humanSpec) has, with the feet flat.
  for (const model of ["workshop-rogue", "workshop-fighter"]) {
    const ask = (first) => ({ feet: ["left", "right"], centre: [first.support.x, first.support.z + 0.03], height: first.height - 0.1, heading: 0 });
    const r = await standing(model, 5, ask), control = await standing(model, 5, ask, { stance: { ankleSpare: null } });
    const upper = humanSpec(model).joints.find((j) => j.name === "ankle.left").dofs.find((d) => d.positive === "dorsiflexion").max.value;
    const ankle = Math.max(r.angles["ankle.left dorsiflexion"], r.angles["ankle.right dorsiflexion"]);
    const above = r.after.height - r.goal.height, off = across(r.after.centre, r.place);
    console.log(`MUT stance beyond ${model}: ${(1000 * above).toFixed(1)} mm above the asked height, ${(1000 * off).toFixed(1)} mm from the held place,`
      + ` ankle ${ankle.toFixed(3)} of ${upper.toFixed(3)} rad, at ${(100 * r.after.speed).toFixed(2)} cm/s; with no floor, height ${control.after.height.toFixed(3)} of ${control.goal.height.toFixed(3)} m`);
    assert.ok(above > 0.03, `${model} sank within ${(1000 * above).toFixed(1)} mm of a height past the ankles' range`);
    assert.ok(ankle < upper - STANCE_ANKLE_SPARE + 0.01, `${model}'s ankle bent to ${ankle.toFixed(3)} rad, past its range ${upper.toFixed(3)} less the spare`);
    assert.ok(off < 0.005 && r.after.speed < 0.01, `${model} did not stand: ${(1000 * off).toFixed(1)} mm off at ${(100 * r.after.speed).toFixed(2)} cm/s`);
    assert.ok(control.after.height < control.goal.height - 0.1, `the control: asked past the ankles' range, ${model} stood`);
  }
});

test("a place past the soles is held at the edge of what they hold, each way, and the body stands", async () => {
  for (const [dx, dz] of [[0.3, 0], [-0.3, 0], [0, 0.3], [0, -0.3]]) {
    const r = await standing("workshop-fighter", 6, (first) => ({ feet: ["left", "right"],
      centre: [first.support.x + dx, first.support.z + dz], height: first.height - 0.03, heading: 0 }));
    const off = Math.hypot(r.after.centre.x - r.place.x, r.after.centre.z - r.place.z);
    const moved = Math.hypot(r.place.x - r.goal.centre[0], r.place.z - r.goal.centre[1]);
    const low = Math.abs(r.after.height - r.goal.height);
    console.log(`MUT stance edge (${dx}, ${dz}): ${(1000 * off).toFixed(1)} mm from the held place, which is ${(1000 * moved).toFixed(0)} mm in from the goal; ${(1000 * low).toFixed(1)} mm off height, feet moved ${(1000 * r.travel).toFixed(1)} mm`);
    assert.ok(moved > 0.1, `(${dx}, ${dz}): a place 30 cm out was held only ${(1000 * moved).toFixed(0)} mm in`);
    assert.ok(off < 0.015 && low < 0.005, `(${dx}, ${dz}): stood ${(1000 * off).toFixed(1)} mm from the held place, ${(1000 * low).toFixed(1)} mm off height`);
    // A foot left bearing a sixth of the weight at a sideways edge slips once, some 6 mm.
    assert.ok(r.travel < 0.01, `(${dx}, ${dz}): the feet moved ${(1000 * r.travel).toFixed(1)} mm`);
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
    return { steps: s.recoveries, fell: low > 0.25, low: goal.height - (s.centre.y - s.support.y), speed: s.velocity.length() };
  } finally { body.dispose(); stand.dispose(); }
}

test("shoved past its soles, each human steps to catch itself and stands, and without the step falls; shoved lightly, it does not step", async () => {
  // The Rogue by 30 N s each of four ways and forward and right, the Warrior by 40 forward, right
  // and back: each at most what STANCE_RECOVERY's sweep holds that way, and more than each holds
  // unstepping. Forward and right, a step landed within a sole's width of the bearing foot falls.
  const cases = [["workshop-rogue", 30, 0], ["workshop-rogue", 30, 90], ["workshop-rogue", 30, 180], ["workshop-rogue", 30, 270],
    ["workshop-rogue", 30, 45], ["workshop-fighter", 40, 0], ["workshop-fighter", 40, 90], ["workshop-fighter", 40, 180]];
  for (const [model, impulse, degrees] of cases) {
    const caught = await shoved(model, impulse, degrees), free = await shoved(model, impulse, degrees, { recovery: null });
    const at = `${model} ${impulse} N s at ${degrees}`;
    console.log(`MUT stance recovery ${at}: ${caught.steps} steps, ${caught.fell ? "fell" : "stood"} ${(1000 * caught.low).toFixed(1)} mm low at ${(100 * caught.speed).toFixed(2)} cm/s;`
      + ` unstepping ${free.fell ? "fell" : "stood"}`);
    assert.ok(caught.steps >= 1 && !caught.fell, `${at}: ${caught.steps} steps, ${caught.fell ? "fell" : "stood"}`);
    assert.ok(caught.speed < 0.01 && Math.abs(caught.low) < 0.02, `${at}: ended ${(1000 * caught.low).toFixed(1)} mm low at ${(100 * caught.speed).toFixed(2)} cm/s`);
    assert.ok(free.fell, `the control: ${at} unstepping stood`);
  }
  for (const model of ["workshop-rogue", "workshop-fighter"]) for (const degrees of [0, 90, 180, 270]) {
    const light = await shoved(model, 10, degrees);
    assert.deepEqual([light.steps, light.fell], [0, false], `${model} 10 N s at ${degrees}: ${light.steps} steps, ${light.fell ? "fell" : "stood"}`);
  }
});

test("the velocity gain holds a sideways edge: drawn in by 0.3, the Rogue stands at +x with it and falls without", async () => {
  const edge = (velocityGain) => standing("workshop-rogue", 6, (first) => ({ feet: ["left", "right"],
    centre: [first.support.x + 0.3, first.support.z], height: first.height - 0.03, heading: 0 }), { stance: { supportInset: 0.3, velocityGain } });
  const held = await edge(STANCE_VELOCITY_GAIN), free = await edge(0);
  const off = (r) => Math.hypot(r.after.centre.x - r.place.x, r.after.centre.z - r.place.z);
  console.log(`MUT stance gain: at ${STANCE_VELOCITY_GAIN} ${(1000 * off(held)).toFixed(1)} mm from the held place, height ${held.after.height.toFixed(3)} m;`
    + ` at none ${(1000 * off(free)).toFixed(1)} mm, height ${free.after.height.toFixed(3)} m`);
  // Over one foot the other leg is spread, and the stance is held lower for its reach (STANCE_KNEE_BEND).
  const low = held.goal.height - held.after.height;
  assert.ok(off(held) < 0.01 && low > -0.005 && low < 0.02, `with the gain, it stood ${(1000 * off(held)).toFixed(1)} mm off, ${(1000 * low).toFixed(1)} mm low`);
  assert.ok(free.after.height < free.goal.height - 0.1, "the control: with no gain the Rogue stood at 0.3");
});

test("each human steps each foot 15 and 25 cm forward, 15 cm back and 10 cm out, lands where asked and stands", async () => {
  for (const model of ["workshop-rogue", "workshop-fighter"]) for (const foot of ["left", "right"]) {
    const out = foot === "left" ? -0.1 : 0.1;
    for (const [dx, dz] of [[0, 0.15], [0, 0.25], [0, -0.15], [out, 0]]) {
      const r = await stepping(model, foot, dx, dz);
      console.log(`MUT stance step ${model} ${foot} (${dx}, ${dz}): ${r.phases.join(" ")}; landed ${(1000 * r.miss).toFixed(1)} mm from the asked place, turned ${r.turned.toFixed(3)} rad;`
        + ` ${(1000 * r.off).toFixed(1)} mm from the held place, ${(1000 * r.low).toFixed(1)} mm low, at ${(100 * r.speed).toFixed(2)} cm/s; the other foot moved ${(1000 * r.drift).toFixed(1)} mm`);
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

test("the knee bend lets a stepping stance sink for its legs' reach: the Warrior's 10 cm step out stands with it and fails held at its height", async () => {
  const bent = await stepping("workshop-fighter", "right", 0.1, 0), straight = await stepping("workshop-fighter", "right", 0.1, 0, { kneeBend: null });
  console.log(`MUT stance bend: at ${STANCE_KNEE_BEND} rad ${(1000 * bent.off).toFixed(1)} mm from the held place, ${(1000 * bent.low).toFixed(1)} mm low;`
    + ` with none ${(1000 * straight.off).toFixed(1)} mm, ${(1000 * straight.low).toFixed(1)} mm low, at ${(100 * straight.speed).toFixed(2)} cm/s`);
  assert.ok(bent.off < 0.005 && bent.speed < 0.01, `with the bend, it stood ${(1000 * bent.off).toFixed(1)} mm off at ${(100 * bent.speed).toFixed(2)} cm/s`);
  assert.ok(straight.off > 0.03 || straight.low > 0.1 || straight.speed > 0.05, "the control: held at its height the Warrior stood");
});

test("unconditioned feet stall the stance (the control)", async () => {
  const r = await standing("workshop-fighter", 5, (first) => ({ feet: ["left", "right"], centre: null, height: first.height - 0.03, heading: 0 }), { footConditioning: 1 });
  const off = across(r.after.centre, r.after.support);
  console.log(`MUT stance unconditioned: ${(1000 * off).toFixed(1)} mm off the soles' middle, height ${r.after.height.toFixed(3)} m`);
  assert.ok(off > 0.02 || r.after.height < r.goal.height - 0.1, `unconditioned, the Warrior stood ${(1000 * off).toFixed(1)} mm off`);
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
    console.log(`MUT stance walk ${at}: ${r.strides} strides, ${r.fell ? "fell" : "stood"}; ${r.along.toFixed(3)} m/s along, ${r.across.toFixed(3)} across;`
      + ` stopped at ${(100 * r.speed).toFixed(2)} cm/s, ${r.phase}, ${r.stepped} steps over its last 2 s, ${(100 * r.off).toFixed(1)} cm off its place`);
    assert.ok(!r.fell && r.strides >= 8, `${at}: ${r.strides} strides, ${r.fell ? "fell" : "stood"}`);
    // A walk goes at about 0.8 of the speed asked (STANCE_GAIT).
    assert.ok(r.along > 0.7 * speed && r.along < 1.25 * speed && Math.abs(r.across) < 0.25 * speed,
      `${at}: ${r.along.toFixed(3)} m/s along, ${r.across.toFixed(3)} across`);
    // Stopped, it steps no more and stands over its place. It need not be still: some stopped walks
    // sway from foot to foot, 2-4 cm either way, and do not settle (STANCE_FOOT_CONDITIONING), this
    // Warrior walking back among them.
    assert.ok(r.phase === "stand" && r.stepped === 0 && r.off < 0.05,
      `${at}: stopped, ${r.phase}, ${r.stepped} steps over its last 2 s, ${(100 * r.off).toFixed(1)} cm off its place`);
  }
  // The control: walking nowhere, it takes no step and goes nowhere.
  const still = await walking("workshop-rogue", 0, 0);
  assert.ok(still.strides === 0 && !still.fell && Math.abs(still.along) < 0.01 && still.speed < 0.01,
    `the control: walking nowhere, ${still.strides} strides, ${still.along.toFixed(3)} m/s`);
});
