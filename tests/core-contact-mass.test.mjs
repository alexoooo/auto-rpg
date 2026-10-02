/**
 * **The mass a contact meets** (`src/core/build/contact-mass.ts`), joints free and the body
 * floating: against the closed form for one body, and against the engine's own answer to an
 * impulse (Node core stand, Rapier, 3840 Hz, no gravity, in the air).
 *
 * The engine's answer is read over three steps at 3840 Hz, before the pushed chain has moved far
 * from the pose the model was taken at; a coarser step reads the chain further along.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { contactMass } from "../src/core/build/contact-mass.ts";
import { rigidOf } from "../src/core/build/rigid.ts";
import { armed } from "../src/core/human/grip.ts";
import { humanSpec } from "../src/core/human/spec.ts";
import { woodenClub } from "../src/core/items/club.ts";
import { sourced } from "../src/core/spec/quantity.ts";
import { cross, dot, sub } from "../src/core/spec/vec.ts";
import { coreStand } from "./harness/core-stand.mjs";

const q = (value, unit = "m") => sourced(value, unit, "de-leva-1996", "a stand-in leaf for the contact mass tests");
const close = (a, b, tolerance, what) => assert.ok(Math.abs(a - b) <= tolerance, `${what}: ${a} against ${b}`);
const wounds = { hp: q(1, "1"), vital: [], whole: [] };

/** A chain of a three-, a two- and a one-freedom joint on tilted axes, as the dynamics tests have it. */
function chain() {
  const speed = { unloadedSpeed: q(20, "rad/s"), curvature: q(0.25, "1"), eccentricCeiling: q(1.4, "1"), eccentricSlopeRatio: q(2, "1") };
  const muscle = { peakPositive: q(2, "N m"), peakNegative: q(2, "N m"), speedPositive: speed, speedNegative: speed };
  const segment = (name, proximal, distal, mass, inertia) => ({
    name, proximal: q(proximal), distal: q(distal), mass: q(mass, "kg"),
    centreOfMass: q(proximal.map((p, i) => 0.55 * p + 0.45 * distal[i] + [0.01, -0.02, 0.015][i])),
    inertia: q(inertia, "kg m2"), shape: { kind: "capsule", from: q(proximal), to: q(distal), radius: q(0.02) }, surface: { stiffness: q(1e5, "N/m") },
  });
  const joint = (name, parent, child, centre, triad, count) => ({
    name, parent, child, centre: q(centre),
    dofs: triad.slice(0, count).map((axis, k) => ({ positive: `p${k}`, negative: `n${k}`, axis: q(axis, "1"), min: q(-1.3, "rad"), max: q(1.3, "rad"), muscle })),
  });
  return {
    family: "test", model: "chain", mass: q(5.2, "kg"), stature: q(1.5), wounds, attributes: { balance: q(0, "%") },
    segments: [
      segment("post", [0, 1.6, 0], [0, 1.3, 0], 2, [0.02, 0.004, 0.02]),
      segment("upper", [0, 1.3, 0], [0.12, 1.0, 0.05], 1.6, [0.012, 0.003, 0.014]),
      segment("lower", [0.12, 1.0, 0.05], [0.3, 0.8, 0.12], 1.1, [0.006, 0.0015, 0.007]),
      segment("end", [0.3, 0.8, 0.12], [0.38, 0.66, 0.2], 0.5, [0.0012, 0.0005, 0.0014]),
    ],
    joints: [
      joint("root", "post", "upper", [0, 1.3, 0], [[0.8, 0.6, 0], [-0.6, 0.8, 0], [0, 0, 1]], 3),
      joint("middle", "upper", "lower", [0.12, 1.0, 0.05], [[0, 0.6, 0.8], [1, 0, 0], [0, 0.8, -0.6]], 2),
      joint("tip", "lower", "end", [0.3, 0.8, 0.12], [[0.48, 0.36, 0.8], [-0.6, 0.8, 0], [-0.64, -0.48, 0.6]], 1),
    ],
  };
}

/** The velocity of `point` (world) on `segment`'s body: its centre's plus its spin across. */
function pointVelocity(segment, point) {
  const v = new Vector3(), w = new Vector3();
  segment.body.linearVelocityToRef(v);
  segment.body.angularVelocityToRef(w);
  const centre = new Vector3(...segment.rigid.centre.map((c, k) => c - segment.frame.origin[k]));
  const local = new Vector3(dot(centre.asArray(), segment.frame.x), dot(centre.asArray(), segment.frame.y), dot(centre.asArray(), segment.frame.z));
  const c = local.applyRotationQuaternion(segment.node.rotationQuaternion).addInPlace(segment.node.position);
  return [v.x, v.y, v.z].map((x, k) => x + cross([w.x, w.y, w.z], sub(point, [c.x, c.y, c.z]))[k]);
}

/**
 * Push `spec` at `point` on `name` by `impulse` (world), floating with no gravity, for three steps
 * at 3840 Hz; the point's velocity change beside the model's mobility times the impulse.
 */
async function pushed(spec, name, point, impulse) {
  const stand = await coreStand(spec, { gravity: false, ground: false, hz: 3840 });
  try {
    const segment = stand.built.segments.get(name);
    const mass = contactMass(stand.built);
    mass.update();
    const K = mass.mobility(segment, point);
    const along = mass.along(segment, point, impulse);
    segment.body.applyImpulse(new Vector3(...impulse), new Vector3(...point));
    stand.step(3);
    return { measured: pointVelocity(segment, point), model: K.map((row) => dot(row, impulse)), along };
  } finally { stand.dispose(); }
}

test("one body meets a contact with its mass and its inertia about the contact", () => {
  const spec = { ...chain(), segments: [chain().segments[2]], joints: [] };
  return coreStand(spec, { gravity: false, ground: false }).then((stand) => {
    try {
      const segment = stand.built.segments.get("lower"), mass = contactMass(stand.built);
      mass.update();
      const rigid = rigidOf(spec, spec.segments[0]), point = [0.2, 0.93, 0.03], normal = [0.3, -0.5, 0.8];
      // 1/m + (r x n)' I^-1 (r x n), with I (the segment frame's, diagonal) turned to the world.
      const n = normal.map((x) => x / Math.hypot(...normal)), r = sub(point, rigid.centre), rn = cross(r, n);
      const { x, y, z } = segment.frame, I = rigid.tensor;
      const inFrame = [dot(rn, x), dot(rn, y), dot(rn, z)];
      const want = 1 / (1 / rigid.mass + inFrame[0] ** 2 / I[0] + inFrame[1] ** 2 / I[1] + inFrame[2] ** 2 / I[2]);
      // The node's turn is the frame's to about 1e-9.
      close(mass.along(segment, point, normal), want, 1e-7 * want, "the mass met");
      close(mass.along(segment, rigid.centre, normal), rigid.mass, 1e-9, "at the centre, the mass");
    } finally { stand.dispose(); }
  });
});

test("a floating chain meets an impulse as the engine moves it: every joint free, the rigid bodies held", async () => {
  const club = woodenClub();
  const cases = [
    ["the chain's end", chain(), "end", [0.36, 0.7, 0.18], [0.5, 1.2, -0.8]],
    ["the chain's middle", chain(), "lower", [0.2, 0.9, 0.09], [-1.1, 0.3, 0.6]],
    ["the chain's root", chain(), "post", [0.02, 1.5, 0], [0.9, 0, 1.2]],
    ["a club in a chain", { ...chain(), held: [{ segment: "end", item: club, origin: q([0.38, 0.66, 0.2]), along: q([0.3, -0.2, 0.9], "1"), across: q([1, 0.4, 0], "1") }] },
      "end", [0.38 + 0.3 * 0.6, 0.66 - 0.2 * 0.6, 0.2 + 0.9 * 0.6], [0.9, 0.9, -0.2]],
  ];
  for (const [what, spec, name, point, impulse] of cases) {
    const { measured, model, along } = await pushed(spec, name, point, impulse);
    const size = Math.hypot(...model);
    assert.ok(size > 0.2, `${what}: the point moved ${size} m/s`);
    measured.forEach((x, k) => close(x, model[k], 0.015 * size, `${what}: velocity ${k}`));
    const n = impulse.map((x) => x / Math.hypot(...impulse));
    close(along, Math.hypot(...impulse) / dot(model, n), 1e-9 * along, `${what}: along is the mobility's`);
  }
});

test("the Warrior floating: a blow on the head, the hand and the club moves them as the engine does", async () => {
  const spec = armed(humanSpec("workshop-fighter"), "right", woodenClub());
  const stand = await coreStand(spec, { gravity: false, ground: false });
  let head, hand;
  // Where the head's and the club hand's centres are, reference pose.
  try {
    head = stand.built.segments.get("head").rigid.centre;
    hand = stand.built.segments.get("hand.right").rigid.centre;
  } finally { stand.dispose(); }
  for (const [what, name, point, impulse] of [
    ["the head from the front", "head", head, [0, 0, -8]],
    ["the head from the side", "head", [head[0] + 0.05, head[1] + 0.03, head[2]], [-6, 0, 2]],
    ["the club's hand", "hand.right", hand, [2, 1, -3]],
  ]) {
    const { measured, model, along } = await pushed(spec, name, point, impulse);
    const size = Math.hypot(...model);
    measured.forEach((x, k) => close(x, model[k], 0.015 * size, `${what}: velocity ${k}`));
    assert.ok(along > 0, what);
  }
});
