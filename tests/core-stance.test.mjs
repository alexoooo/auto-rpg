/**
 * **What any stance passes** (`src/core/control/stance.ts`): a place the soles cannot hold is taken
 * at the nearest point of their drawn-in outline; a human on both feet, asked to stand 3 cm under its
 * reference height, stands there, still, its feet planted and their inertia their own; asked for a
 * step, it swings the foot, lands it near where it was asked and stands; shoved lightly any way, it
 * stands; asked to walk, it goes the way asked more than across without falling and asked to stop,
 * stands, and asked to walk nowhere from the start, takes no step (the control). What a stance
 * remembers between steps (`StanceState`, `src/core/control/stance-state.ts`) is one record of
 * plain data. How closely, how far and what shove it catches is measured in
 * `core-stance-capability.test.mjs`.
 * Node core stand, Rapier, both humans, on a ground, 120 Hz.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { makeStance } from "../src/core/control/stance-state.ts";
import { SUPPORT_INSET } from "../src/core/control/stance-tuning.ts";
import { withinSupport } from "../src/core/control/support.ts";
import { humanSpec } from "../src/core/human/spec.ts";
import { across, GUARD, shoved, standing, stepping, walking } from "./fixtures/core-stance.mjs";
import { coreStand } from "./harness/core-stand.mjs";

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
  // Corners that are all one point have no inside: whatever is asked, even the point itself, the point is what is held.
  const one = new Vector3(0.2, 0, -0.1);
  for (const points of [[{ corners: [one] }], [{ corners: [one] }, { corners: [one.clone(), one.clone()] }]]) {
    assert.deepEqual([[0.5, 0.3], [0.2, -0.1], [-1, -0.1]].map(([x, z]) => withinSupport(points, x, z)), [[0.2, -0.1], [0.2, -0.1], [0.2, -0.1]]);
  }
  // Two points are a line, drawn in toward its middle: beside it, the nearest point of it; past its end, the end.
  const line = [{ corners: [new Vector3(0, 0, 0)] }, { corners: [new Vector3(0.4, 0, 0)] }];
  const beside = withinSupport(line, 0.22, 0.1), past = withinSupport(line, 0.9, -0.05), end = 0.2 + 0.2 * (1 - SUPPORT_INSET);
  assert.ok(Math.hypot(beside[0] - 0.22, beside[1]) < 1e-12 && Math.hypot(past[0] - end, past[1]) < 1e-12, `beside the line (${beside}), past its end (${past})`);
});

/**
 * Far under what each stance catches, N s: a shove at the middle trunk any stance stands through
 * without falling, whichever way it comes.
 */
const LIGHT = 8;

test("each human stands where it is asked, still, its feet planted and their inertia their own", async () => {
  for (const model of ["workshop-fighter", "workshop-rogue"]) {
    const r = await standing(model, 5, (first) => ({ feet: ["left", "right"], centre: null, height: first.height - 0.03, heading: 0 }), { posture: GUARD });
    const off = across(r.after.centre, r.after.support), low = Math.abs(r.after.height - r.goal.height);
    assert.ok(off < 0.02 && low < 0.02 && r.after.speed < 0.01,
      `${model}: ${(1000 * off).toFixed(1)} mm from the middle of its soles, ${(1000 * low).toFixed(1)} mm off its height, at ${(100 * r.after.speed).toFixed(2)} cm/s`);
    assert.ok(r.slide < 0.01, `${model}: its feet slid ${(1000 * r.slide).toFixed(1)} mm`);
    assert.ok(r.inertia.every((x) => Math.abs(x - 1) < 1e-9), `${model}: the feet's inertia was not their own: x${r.inertia}`);
  }
});

test("each human asked for a step swings the foot, lands it near where it was asked and stands", async () => {
  for (const model of ["workshop-fighter", "workshop-rogue"]) {
    const r = await stepping(model, "left", 0, 0.15);
    assert.ok(r.phases.includes("swing") && r.phases.at(-1) === "stand", `${model}: phases ${r.phases.join(" ")}`);
    assert.ok(r.miss < 0.05, `${model}: landed ${(1000 * r.miss).toFixed(1)} mm from the asked place`);
    assert.ok(r.low < 0.1 && r.speed < 0.05, `${model}: ended ${(1000 * r.low).toFixed(1)} mm low at ${(100 * r.speed).toFixed(2)} cm/s`);
  }
});

test("each human shoved lightly any way stands", async () => {
  for (const model of ["workshop-fighter", "workshop-rogue"]) for (const degrees of [0, 90, 180, 270]) {
    const r = await shoved(model, LIGHT, degrees);
    assert.ok(!r.fell && r.speed < 0.05, `${model} ${LIGHT} N s at ${degrees}: ${r.fell ? "fell" : "stood"}, at ${(100 * r.speed).toFixed(2)} cm/s`);
  }
});

test("asked to walk, each human goes the way asked more than across and does not fall, and asked to stop, stands; asked to walk nowhere, it takes no step", async () => {
  for (const model of ["workshop-rogue", "workshop-fighter"]) {
    const r = await walking(model, 0, 0.3);
    assert.ok(!r.fell && r.strides > 0, `${model}: ${r.strides} strides, ${r.fell ? "fell" : "stood"}`);
    assert.ok(r.along > 0.1 && Math.abs(r.across) < r.along, `${model}: ${r.along.toFixed(3)} m/s along, ${r.across.toFixed(3)} across`);
    assert.ok(r.phase === "stand" && r.speed < 0.05, `${model}: stopped, ${r.phase} at ${(100 * r.speed).toFixed(2)} cm/s`);
  }
  // The control: walking nowhere, it takes no step and goes nowhere.
  const still = await walking("workshop-rogue", 0, 0);
  assert.ok(still.strides === 0 && !still.fell && Math.abs(still.along) < 0.01 && still.speed < 0.01,
    `the control: walking nowhere, ${still.strides} strides, ${still.along.toFixed(3)} m/s`);
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
    const s = makeStance(stand.built, {}, null);
    assert.deepEqual(faults(s.state, "state"), []);
    assert.deepEqual(Object.keys(s.state).sort(),
      ["aim", "crouch", "feet", "flight", "helped", "last", "owned", "pace", "plan", "pose", "reading", "step", "stride", "striding", "tasks"]);
    assert.equal(s.state.feet.length, 2);
    assert.ok(s.state.feet.every((memory, k) => memory === s.feet[k].memory), "the state lists each foot's own memory");
    assert.deepEqual(s.state.feet.map(({ ground, ...rest }) => rest), [{ channels: [], rolled: null, hip: new Vector3(), lifted: 0 }, { channels: [], rolled: null, hip: new Vector3(), lifted: 0 }]);
    assert.ok(s.state.feet.every((memory) => Math.abs(memory.ground) < 1e-9), "each foot's ground is the ground it stands on, at 0");
    assert.ok(s.state.reading.soles.left === s.feet[0].middle && s.state.reading.soles.right === s.feet[1].middle, "the reading's soles are the feet's middles");
    // The controls: a foot holds a segment's node, a turn of the engine's and a function are not data.
    assert.deepEqual(faults({ node: s.feet[0].segment.node }, "state"), ["state.node: a TransformNode"]);
    assert.notEqual(faults({ foot: s.feet[0] }, "state").length, 0, "a foot is not data");
    assert.deepEqual(faults({ read() {} }, "state"), ["state.read: a function"]);
    assert.deepEqual(faults({ at: [new Map()] }, "state"), ["state.at[0]: a Map"]);
  } finally { stand.dispose(); }
});
