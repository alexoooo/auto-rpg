/**
 * The crypt skeleton on the core (`src/core/human/skeleton.ts`): every number says where it came
 * from; its joints sit where the art's bind (`assets/skeleton/bind.json`) joins its parts, read here
 * from the bind itself and not through the figure; its placeholders are named as such; each fist
 * holds the club; and it stands on the core stand and walks at its measured envelope's pace. Node
 * stand, Rapier, on a ground, 120 Hz.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createBody } from "../src/core/body.ts";
import { armed } from "../src/core/human/grip.ts";
import { woodenClub } from "../src/core/items/club.ts";
import { stanceEnvelope } from "../src/core/control/stance-envelope.ts";
import { HUMANOID_MODELS as BODY_MODELS, modelSpec } from "../src/core/models.ts";
import { SKELETON_MODEL } from "../src/core/human/skeleton.ts";
import { sourcesOf } from "../src/core/spec/provenance.ts";
import { walk } from "../research/core-stance-trials.mjs";
import { specProvenanceFaults } from "./fixtures/spec.mjs";
import { coreStand } from "./harness/core-stand.mjs";

const bind = JSON.parse(await readFile(new URL("../assets/skeleton/bind.json", import.meta.url), "utf8"));
const part = (key) => bind.find((p) => p.build === "fist/fist" && p.id === `left.golem.${key}`);
/** A bind part's end along its own y, body frame: +1 its max, -1 its min. */
function end(key, sign) {
  const { position, rotation: [x, y, z, w], min, max } = part(key);
  const v = [0, sign > 0 ? max[1] : min[1], 0];
  const c = [y * v[2] - z * v[1], z * v[0] - x * v[2], x * v[1] - y * v[0]];
  const cc = [y * c[2] - z * c[1], z * c[0] - x * c[2], x * c[1] - y * c[0]];
  return v.map((vk, k) => position[k] + vk + 2 * (w * c[k] + cc[k]));
}
const sources = (q) => [...new Set([...sourcesOf(q)].map((leaf) => leaf.provenance.source))];
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

test("every number in the skeleton's spec says where it came from", () => {
  assert.deepEqual(specProvenanceFaults(modelSpec(SKELETON_MODEL)), []);
});

test("each joint sits where the bind joins the parts on either side of it", () => {
  const { joints } = modelSpec(SKELETON_MODEL);
  const centre = (name) => joints.find((j) => j.name === name).centre.value;
  for (const [side, legs, arm] of [["left", "L", "secondary"], ["right", "R", "primary"]]) {
    const meets = {
      [`hip.${side}`]: [end(`legs.thigh${legs}`, 1)],
      [`knee.${side}`]: [end(`legs.thigh${legs}`, -1), end(`legs.shin${legs}`, 1)],
      [`ankle.${side}`]: [end(`legs.shin${legs}`, -1)],
      [`shoulder.${side}`]: [end(`${arm}.upperArm`, 1)],
      [`elbow.${side}`]: [end(`${arm}.upperArm`, -1), end(`${arm}.forearm`, 1)],
      [`wrist.${side}`]: [end(`${arm}.rollRing`, -1), end(`${arm}.wrist`, 1)],
    };
    for (const [joint, ends] of Object.entries(meets)) {
      for (const at of ends) assert.ok(distance(centre(joint), at) < 1e-9, `${joint} at ${centre(joint)}, the bind at ${at}`);
    }
    // The right arm is the primary: on the body's right, +x.
    assert.ok(centre(`shoulder.${side}`)[0] * (side === "right" ? 1 : -1) > 0.1, side);
  }
  assert.ok(distance(centre("neck"), end("head.neck", -1)) < 1e-9);
});

test("what the art does not give is a named placeholder, and the rest is the bind's", () => {
  const spec = modelSpec(SKELETON_MODEL);
  assert.deepEqual(sources(spec.mass), ["skeleton-placeholders"]);
  assert.deepEqual(sources(spec.wounds.hp), ["skeleton-placeholders"]);
  assert.deepEqual(sources(spec.stature), ["skeleton-bind"]);
  assert.ok(Math.abs(spec.stature.value - (part("head.head").position[1] + part("head.head").max[1])) < 1e-9);
});

test("the skeleton's surfaces are a man's, part for part", () => {
  const surfaces = (model) => modelSpec(model).segments.map(({ name, surface: { stiffness } }) => [name, stiffness.unit, stiffness.value, sources(stiffness).sort()]);
  assert.deepEqual(surfaces(SKELETON_MODEL), surfaces("workshop-fighter"));
  assert.equal(surfaces(SKELETON_MODEL).length, 16);
  assert.deepEqual(surfaces(SKELETON_MODEL).find(([name]) => name === "head"), ["head", "N/m", 201e3, ["cormier-2009"]]);
});

test("each fist holds the club, its grip ending at the little finger's knuckle half the fist below the middle one", () => {
  for (const side of ["right", "left"]) {
    const spec = armed(modelSpec(SKELETON_MODEL), side, woodenClub());
    assert.deepEqual(specProvenanceFaults(spec), [], side);
    const { knuckles, little } = spec.segments.find((s) => s.name === `hand.${side}`).points;
    const drop = knuckles.value.map((k, i) => k - little.value[i]);
    assert.ok(Math.abs(drop[0]) < 1e-12 && Math.abs(drop[1] - part(`${side === "right" ? "primary" : "secondary"}.fist`).max[0]) < 1e-12 && Math.abs(drop[2]) < 1e-12,
      `${side}: ${drop}`);
  }
});

test("every core model has a measured stance envelope, the skeleton among them", () => {
  assert.ok(BODY_MODELS.includes(SKELETON_MODEL));
  for (const model of BODY_MODELS) assert.ok(stanceEnvelope(modelSpec(model)).walk.value > 0, model);
});

test("the skeleton stands 3 cm low for 4 s, its centre over its soles, and walks at its envelope's pace", async () => {
  const stand = await coreStand(modelSpec(SKELETON_MODEL), { ground: true, hz: 120 });
  const body = createBody(stand.built, stand.world, { servoSeconds: 0.1 });
  let goal = null;
  body.drive((view) => {
    const s = view.stance;
    if (!goal && view.time > 0) goal = { feet: ["left", "right"], centre: null, height: s.centre.y - s.support.y - 0.03, heading: 0 };
    return { posture: {}, hands: { left: null, right: null }, pushes: [], stance: goal };
  });
  try {
    stand.step(stand.seconds(4));
    const s = body.view.stance;
    assert.ok(Math.hypot(s.centre.x - s.support.x, s.centre.z - s.support.z) < 0.01, `off by ${Math.hypot(s.centre.x - s.support.x, s.centre.z - s.support.z)}`);
    assert.ok(Math.abs(s.centre.y - s.support.y - goal.height) < 0.02, `height ${s.centre.y - s.support.y}, asked ${goal.height}`);
    assert.ok(s.velocity.length() < 0.01, `still moving at ${s.velocity.length()}`);
  } finally {
    body.dispose();
    stand.dispose();
  }
  const pace = body.envelope.walk.value;
  const walked = await walk({ model: SKELETON_MODEL, stance: {}, hz: 120, speed: pace, degrees: 0 });
  // `along` is the pace over the walk's last 3 s.
  assert.ok(!walked.fell && walked.along > pace / 2, JSON.stringify(walked));
});
