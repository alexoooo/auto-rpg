/**
 * The core's human segment table (`src/core/human/`), for both workshop models. Pure spec: no
 * engine runs here.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { FIT_SCALE, bodyMass, stature, WORKSHOP_SEX } from "../src/core/human/model.ts";
import { rigPoint, WORKSHOP_MODELS } from "../src/core/human/rig.ts";
import { frameOf, segmentFrame } from "../src/core/spec/body.ts";
import { dot, normalize, sub } from "../src/core/spec/vec.ts";
import { HUMAN_PARENTS, humanSegments } from "../src/core/human/segments.ts";
import { TRUNK_SEGMENTS, workshopEnvelope } from "../src/core/human/envelope.ts";
import { SIDES } from "../src/core/human/landmarks.ts";
import { inventory, sourcesOf } from "../src/core/spec/provenance.ts";
import { footprint, transcribed, trunkEnvelope } from "../scripts/core/workshop-envelope.mjs";
import { specProvenanceFaults } from "./fixtures/spec.mjs";
import { clearance, lowest, solid } from "./fixtures/shapes.mjs";

const table = (model) => ({ mass: bodyMass(model), stature: stature(model), segments: humanSegments(model) });

/** Every leaf a spec rests on. */
function leaves(spec) {
  const out = new Set();
  for (const quantity of inventory(spec).quantities.values()) for (const leaf of sourcesOf(quantity)) out.add(leaf);
  return out;
}

test("every number in each model's segment table says where it came from", () => {
  for (const model of WORKSHOP_MODELS) assert.deepEqual(specProvenanceFaults(table(model)), [], model);
});

test("each model's segments sum to its mass: the typical man's 79 kg, and the Rogue's by volume", () => {
  assert.equal(bodyMass("workshop-fighter").value, 79);
  assert.ok(Math.abs(bodyMass("workshop-rogue").value - 79 * 79.8 / 109.5) < 1e-12);
  for (const model of WORKSHOP_MODELS) {
    const segments = humanSegments(model);
    assert.equal(segments.length, 16, model);
    const sum = segments.reduce((total, segment) => total + segment.mass.value, 0);
    assert.ok(Math.abs(sum - bodyMass(model).value) < 1e-9, `${model}: segments ${sum} kg, body ${bodyMass(model).value} kg`);
    for (const segment of segments) assert.ok(segment.mass.value > 0, `${model} ${segment.name}`);
  }
});

test("the Warrior stands 1.77 m and the Rogue her own skin top at his scale", () => {
  assert.ok(Math.abs(stature("workshop-fighter").value - 1.77) < 1e-12);
  assert.ok(Math.abs(stature("workshop-rogue").value - 1.7304996252059937 * 1.77 / 1.8804991245269775) < 1e-12);
});

/**
 * The Rogue reads the Warrior's assets only through the fit scale and the volume ratio, and each
 * model reads its own sex's column of every sex-specific table. The control: the Warrior's own
 * table rests on many of his leaves, so the detector sees them.
 */
test("the two models differ where their sources differ, and only there", () => {
  const warriorLeaf = (leaf) => /fighter|Warrior/.test(`${leaf.provenance.source} ${leaf.provenance.where}`);
  const shared = new Set([...sourcesOf(FIT_SCALE), ...sourcesOf(bodyMass("workshop-rogue"))]);
  const rogue = [...leaves(table("workshop-rogue"))].filter(warriorLeaf);
  assert.deepEqual(rogue.filter((leaf) => !shared.has(leaf)).map((leaf) => leaf.provenance.where), []);
  assert.ok(rogue.length > 0 && rogue.length <= shared.size, "the Rogue does read the fit scale");
  assert.ok([...leaves(table("workshop-fighter"))].filter(warriorLeaf).length > 50, "the Warrior's table rests on his rig");

  const column = { male: "males", female: "females" };
  for (const model of WORKSHOP_MODELS) {
    const deLeva = [...leaves(table(model))].filter((leaf) => leaf.provenance.source === "de-leva-1996");
    assert.ok(deLeva.length > 0, model);
    for (const leaf of deLeva) {
      assert.ok(leaf.provenance.where.includes(`, ${column[WORKSHOP_SEX[model]]}, `), `${model} reads ${leaf.provenance.where}`);
    }
  }
  // Where the sexes' columns differ, the models' shares do: the lower trunk is 11.17 % of a man
  // and 12.47 % of a woman.
  const share = (model) => {
    const segments = humanSegments(model);
    return segments.find((s) => s.name === "lowerTrunk").mass.value / bodyMass(model).value;
  };
  assert.ok(Math.abs(share("workshop-fighter") - 11.17 / 100.00) < 1e-4);
  assert.ok(Math.abs(share("workshop-rogue") - 12.47 / 99.99) < 1e-4);
});

test("the envelope the spec states is what the models measure", () => {
  const measured = (e) => ["x", "y", "z"].flatMap((axis) => [transcribed(e[axis].min), transcribed(e[axis].max)]);
  const stated = (e) => ["x", "y", "z"].flatMap((axis) => [e[axis].min.value, e[axis].max.value]);
  for (const model of WORKSHOP_MODELS) {
    const envelope = workshopEnvelope(model);
    const trunk = trunkEnvelope(model);
    for (const segment of TRUNK_SEGMENTS) assert.deepEqual(stated(envelope.trunk[segment]), measured(trunk[segment]), `${model} ${segment} trunk`);
    for (const side of SIDES) assert.deepEqual(stated(envelope.feet[side]), measured(footprint(model, side)), `${model} ${side} foot`);
  }
});

test("the segment tree joins every segment to the lower trunk", () => {
  for (const model of WORKSHOP_MODELS) {
    const names = new Set(humanSegments(model).map((segment) => segment.name));
    assert.deepEqual(new Set([...HUMAN_PARENTS.keys(), "lowerTrunk"]), names, model);
    for (const name of names) {
      let at = name;
      for (let hops = 0; at !== "lowerTrunk"; hops++) {
        assert.ok(hops < names.size, `${name} never reaches the lower trunk`);
        at = HUMAN_PARENTS.get(at);
        assert.ok(names.has(at), `${name}'s chain names ${at}`);
      }
    }
  }
});

/**
 * Segments that share no joint collide with each other (`buildBody`), so in the reference pose
 * every such pair must have room: measured geometrically, since nothing in the engine would show
 * an overlap it forbids (H55, H57).
 */
test("segments that share no joint have room between them in the reference pose", () => {
  for (const model of WORKSHOP_MODELS) {
    const segments = humanSegments(model);
    const tight = [];
    for (let i = 0; i < segments.length; i++) {
      for (let j = i + 1; j < segments.length; j++) {
        const a = segments[i], b = segments[j];
        if (HUMAN_PARENTS.get(a.name) === b.name || HUMAN_PARENTS.get(b.name) === a.name) continue;
        const room = clearance(solid(a), solid(b));
        if (!(room > 0)) tight.push(`${a.name} and ${b.name}: ${room.toFixed(4)} m`);
      }
    }
    assert.deepEqual(tight, [], model);
  }
});

test("the soles are on y = 0 and nothing else reaches the ground", () => {
  for (const model of WORKSHOP_MODELS) {
    for (const segment of humanSegments(model)) {
      const bottom = lowest(solid(segment));
      if (segment.name.startsWith("foot.")) assert.ok(Math.abs(bottom) < 1e-12, `${model} ${segment.name} at ${bottom}`);
      else assert.ok(bottom > 0.05, `${model} ${segment.name} reaches ${bottom} m`);
    }
  }
});

/** A rigid body's principal moments obey the triangle inequality; one that does not is no body. */
test("every segment's inertia is a rigid body's", () => {
  for (const model of WORKSHOP_MODELS) {
    for (const { name, inertia } of humanSegments(model)) {
      const [a, b, c] = inertia.value;
      assert.ok(a > 0 && b > 0 && c > 0 && a + b >= c && b + c >= a && c + a >= b, `${model} ${name}: ${inertia.value}`);
    }
  }
});

test("a hand's frame lies across its knuckles, thumb side to the body's right as in the anatomical position", () => {
  for (const model of WORKSHOP_MODELS) {
    const segments = new Map(humanSegments(model).map((segment) => [segment.name, segment]));
    for (const side of SIDES) {
      const hand = segments.get(`hand.${side}`);
      const suffix = side === "left" ? "_l" : "_r";
      const index = rigPoint(model, `index_01${suffix}`, "head").value, little = rigPoint(model, `pinky_01${suffix}`, "head").value;
      const thumbward = normalize(sub(index, little));
      const { x } = frameOf(hand);
      const across = dot(x, thumbward);
      assert.ok(side === "right" ? across > 0.95 : across < -0.95, `${model} ${side}: x.thumbward ${across}`);
      // The control: the body's right lies far from a thumb-up hand's width, so the choice matters.
      const byBody = segmentFrame(hand.proximal.value, hand.distal.value).x;
      assert.ok(Math.abs(dot(byBody, thumbward)) < 0.6, `${model} ${side}: the body's right is not the hand's`);
    }
    for (const [name, segment] of segments) {
      if (!name.startsWith("hand.")) assert.equal(segment.right, undefined, `${model} ${name} keeps the body's right`);
    }
  }
});

test("the clearance measure finds an overlap and a gap it is shown", () => {
  const capsule = (x, radius) => ({ kind: "capsule", from: [x, 0, 0], to: [x, 1, 0], radius });
  const box = (x) => ({ kind: "box", centre: [x, 0, 0], axes: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], half: [0.5, 0.5, 0.5] });
  assert.ok(Math.abs(clearance(capsule(0, 0.1), capsule(1, 0.2)) - 0.7) < 1e-9);
  assert.ok(Math.abs(clearance(capsule(0, 0.3), capsule(0.5, 0.3)) + 0.1) < 1e-9);
  assert.ok(Math.abs(clearance(capsule(1, 0.1), box(0)) - 0.4) < 1e-9);
  assert.ok(Math.abs(clearance(box(0), box(1.25)) - 0.25) < 1e-9);
  assert.ok(clearance(box(0), box(0.75)) < 0);
});
