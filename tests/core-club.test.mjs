/**
 * **The wooden club and the hand that holds it** (`src/core/items/club.ts`,
 * `src/core/human/grip.ts`): the club's mass and inertia from its two cylinders of ash, and where a
 * human's hand puts it.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { heldPoint, rigidOf } from "../src/core/build/rigid.ts";
import { armed } from "../src/core/human/grip.ts";
import { humanSpec } from "../src/core/human/spec.ts";
import { woodenClub } from "../src/core/items/club.ts";
import { frameOf } from "../src/core/spec/body.ts";
import { dot, length, sub } from "../src/core/spec/vec.ts";
import { specProvenanceFaults } from "./fixtures/spec.mjs";
import { coreStand } from "./harness/core-stand.mjs";

const close = (a, b, tolerance, what) => assert.ok(Math.abs(a - b) <= tolerance, `${what}: ${a} against ${b}`);
const MODELS = ["workshop-fighter", "workshop-rogue"];

test("the club says where each number came from, and is two cylinders of ash, summed slice by slice", () => {
  const club = woodenClub();
  assert.deepEqual(specProvenanceFaults(club), []);
  // Written another way: thin discs up the club, each m r^2 / 4 across its own centre and m r^2 / 2 along.
  // 14000 slices put the swell's start on a slice's edge.
  const slices = 14000, total = 0.7, rho = 678;
  let m = 0, first = 0, across = 0, along = 0;
  for (let i = 0; i < slices; i++) {
    const y = (i + 0.5) * total / slices, r = y < 0.45 ? 0.018 : 0.04, dm = rho * Math.PI * r * r * total / slices;
    m += dm; first += dm * y; along += dm * r * r / 2;
  }
  const centre = first / m;
  for (let i = 0; i < slices; i++) {
    const y = (i + 0.5) * total / slices, r = y < 0.45 ? 0.018 : 0.04, dm = rho * Math.PI * r * r * total / slices;
    across += dm * (r * r / 4 + (y - centre) ** 2);
  }
  close(club.mass.value, m, 1e-9, "mass");
  close(club.centreOfMass.value[1], centre, 1e-6, "balance");
  assert.deepEqual([club.centreOfMass.value[0], club.centreOfMass.value[2]], [0, 0]);
  close(club.inertia.value[0], across, 1e-6, "across");
  close(club.inertia.value[2], across, 1e-6, "across, z");
  close(club.inertia.value[1], along, 1e-9, "along");
  // The game's club, which the old path carries: 1.15 kg at 670 kg m-3, balanced at 0.48 m.
  close(club.mass.value, 1.15 * 678 / 670, 0.01, "the game's club at ash's density");
  close(club.centreOfMass.value[1], 0.48, 0.005, "the game's balance");
  // Its swell, where a blow lands: the capsule spanning the swell's length.
  const [haft, swell] = club.shapes;
  close(haft.radius.value, 0.018, 1e-15, "the haft's radius");
  close(swell.radius.value, 0.04, 1e-15, "the swell's radius");
  close(swell.from.value[1] - swell.radius.value, 0.45, 1e-12, "the swell's start");
  close(swell.to.value[1] + swell.radius.value, 0.7, 1e-12, "the club's end");
  assert.equal(club.points.swellTo, swell.to);
});

test("a human's hand holds the club across its knuckles, the haft at its palm, the swell out past its thumb", () => {
  const club = woodenClub();
  for (const model of MODELS) for (const side of ["left", "right"]) {
    const spec = armed(humanSpec(model), side, club);
    assert.deepEqual(specProvenanceFaults(spec), [], `${model} ${side}`);
    const [held] = spec.held, hand = spec.segments.find((s) => s.name === `hand.${side}`), frame = frameOf(hand);
    const what = `${model} ${side}`;
    // The palm's side, -z, faces the body's middle: the rig's hands are thumb up, palms in.
    const inward = side === "right" ? [-1, 0, 0] : [1, 0, 0];
    assert.ok(dot(frame.z, inward) < -0.5, `${what}: z is not dorsal`);
    // Along the knuckles from the little finger's to the index finger's: up, out of a thumb-up fist.
    const knuckles = hand.points.knuckles.value, little = hand.points.little.value, a = held.along.value;
    assert.ok(dot(sub(knuckles, little), a) > 0 && a[1] > 0.3, `${what}: the club points ${a}`);
    // The grip ends at the little finger's knuckle, along the axis.
    close(dot(sub(little, held.origin.value), a), 0, 1e-12, `${what}: the butt`);
    // The axis passes the middle knuckle palmward, the hand's radius and the haft's from it.
    const off = sub(knuckles, held.origin.value), fromAxis = sub(off, a.map((x) => x * dot(off, a)));
    close(length(fromAxis), hand.shape.radius.value + club.grip.value, 1e-9, `${what}: the axis from the knuckle`);
    assert.ok(dot(fromAxis, frame.z) > 0, `${what}: the knuckle is not on the back of the haft`);
    // The swell out past the hand: its far end further from the wrist than the knuckles.
    const tip = heldPoint(held, club.points.swellTo).value;
    assert.ok(length(sub(tip, hand.proximal.value)) > length(sub(knuckles, hand.proximal.value)) + 0.4, `${what}: the swell`);
    // Both sides mirror each other.
    const other = armed(humanSpec(model), side === "left" ? "right" : "left", club).held[0];
    const mirror = (v) => [-v[0], v[1], v[2]];
    held.origin.value.forEach((x, k) => close(x, mirror(other.origin.value)[k], 1e-9, `${what}: mirrored origin`));
  }
});

test("held, the Warrior's hand is hand and club, and the engine holds both", async () => {
  const club = woodenClub(), spec = armed(humanSpec("workshop-fighter"), "right", club);
  const bare = humanSpec("workshop-fighter").segments.find((s) => s.name === "hand.right");
  const rigid = rigidOf(spec, spec.segments.find((s) => s.name === "hand.right"));
  close(rigid.mass, bare.mass.value + club.mass.value, 1e-12, "mass");
  // The club's inertia about the hand's centre dwarfs the hand's own.
  assert.ok(rigid.tensor[0] + rigid.tensor[1] + rigid.tensor[2] > 50 * bare.inertia.value.reduce((s, x) => s + x, 0));
  // The pool reads the anatomy: holding a club moves no hit points.
  assert.deepEqual(spec.segments.map((s) => s.mass.value), humanSpec("workshop-fighter").segments.map((s) => s.mass.value));
  const stand = await coreStand(spec, { gravity: false, ground: false });
  try {
    const hand = stand.built.segments.get("hand.right");
    close(hand.body.rigid.mass(), rigid.mass, 1e-6, "the engine's mass");
    assert.equal(hand.rigid, stand.built.segments.get("hand.right").rigid);
    assert.equal(stand.built.segments.get("hand.left").rigid.mass, humanSpec("workshop-fighter").segments.find((s) => s.name === "hand.left").mass.value);
  } finally { stand.dispose(); }
});
