/**
 * The stance (`src/core/control/stance.ts`): a human on both feet, asked to stand 3 cm under its
 * reference height, stands there without drifting, its centre of mass over the middle of its soles;
 * asked for a place, a height and a heading, it goes there; asked for a place its ankles cannot
 * reach, or one past its soles, it stops where it can and stands; and with its feet unconditioned
 * it does not stand still (the control). Node stand, both humans, on a ground, 120 Hz.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { createBody } from "../src/core/body.ts";
import { SUPPORT_INSET, STANCE_FOOT_CONDITIONING, STANCE_SPEED, withinSupport } from "../src/core/control/stance.ts";
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

test("a place beyond the ankles' range is not reached: the stance stops at the limit and stands", async () => {
  // 6 cm lower and 3 cm further forward asks the Rogue's ankles for more dorsiflexion than their
  // range (humanSpec) has, with the feet flat.
  const r = await standing("workshop-rogue", 5, (first) => ({ feet: ["left", "right"],
    centre: [first.support.x, first.support.z + 0.03], height: first.height - 0.06, heading: 0 }));
  const short = r.goal.centre[1] - r.after.centre.z, low = Math.abs(r.after.height - r.goal.height);
  const upper = humanSpec("workshop-rogue").joints.find((j) => j.name === "ankle.left").dofs.find((d) => d.positive === "dorsiflexion").max.value;
  const ankle = r.angles["ankle.left dorsiflexion"];
  console.log(`MUT stance beyond: ${(1000 * short).toFixed(1)} mm short, ${(1000 * low).toFixed(1)} mm off height, ankle ${ankle.toFixed(3)} of ${upper.toFixed(3)} rad, at ${(100 * r.after.speed).toFixed(2)} cm/s`);
  assert.ok(short > 0.01, `the centre of mass reached within ${(1000 * short).toFixed(1)} mm of a place past the ankles' range`);
  assert.ok(Math.abs(upper - ankle) < 0.01, `the ankle stopped at ${ankle.toFixed(3)} rad, not at its limit ${upper.toFixed(3)}`);
  assert.ok(low < 0.005 && r.after.speed < 0.01, `it did not stand: ${(1000 * low).toFixed(1)} mm off height at ${(100 * r.after.speed).toFixed(2)} cm/s`);
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

test("the plan's speed limit is the margin around the support's inset: at 0.4 the Rogue stands with it and falls without", async () => {
  const edge = (speed) => standing("workshop-rogue", 6, (first) => ({ feet: ["left", "right"],
    centre: [first.support.x + 0.3, first.support.z], height: first.height - 0.03, heading: 0 }), { stance: { supportInset: 0.4, speed } });
  const limited = await edge(STANCE_SPEED), free = await edge(Infinity);
  const off = (r) => Math.hypot(r.after.centre.x - r.place.x, r.after.centre.z - r.place.z);
  console.log(`MUT stance speed limit: at ${STANCE_SPEED} m/s ${(1000 * off(limited)).toFixed(1)} mm from the held place, height ${limited.after.height.toFixed(3)} m;`
    + ` with none ${(1000 * off(free)).toFixed(1)} mm, height ${free.after.height.toFixed(3)} m`);
  assert.ok(off(limited) < 0.01 && Math.abs(limited.after.height - limited.goal.height) < 0.005, `limited, it stood ${(1000 * off(limited)).toFixed(1)} mm off`);
  assert.ok(free.after.height < free.goal.height - 0.1, "the control: with no limit the Rogue stood at 0.4");
});

test("unconditioned feet stall the stance (the control)", async () => {
  const r = await standing("workshop-fighter", 5, (first) => ({ feet: ["left", "right"], centre: null, height: first.height - 0.03, heading: 0 }), { footConditioning: 1 });
  const off = across(r.after.centre, r.after.support);
  console.log(`MUT stance unconditioned: ${(1000 * off).toFixed(1)} mm off the soles' middle, height ${r.after.height.toFixed(3)} m`);
  assert.ok(off > 0.02 || r.after.height < r.goal.height - 0.1, `unconditioned, the Warrior stood ${(1000 * off).toFixed(1)} mm off`);
});
