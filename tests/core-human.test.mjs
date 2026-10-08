/**
 * The core's human segment table (`src/core/human/`), for both workshop models. Pure spec: no
 * engine runs here.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { FIT_SCALE, bodyMass, stature, WORKSHOP_SEX } from "../src/core/human/model.ts";
import { rigPoint, WORKSHOP_MODELS } from "../src/core/human/rig.ts";
import { frameOf, segmentFrame } from "../src/core/spec/body.ts";
import { cross, dot, length, normalize, scale, sub } from "../src/core/spec/vec.ts";
import { HUMAN_PARENTS, humanSegments } from "../src/core/human/segments.ts";
import { TRUNK_SEGMENTS, workshopEnvelope } from "../src/core/human/envelope.ts";
import { SIDES } from "../src/core/human/landmarks.ts";
import { inventory, sourcesOf } from "../src/core/spec/provenance.ts";
import { footprint, transcribed, trunkHulls } from "../scripts/core/workshop-envelope.mjs";
import { humanSpec } from "../src/core/human/spec.ts";
import { peakTorque } from "../src/core/human/muscle.ts";
import { jointSpeed } from "../src/core/human/speed.ts";
import { workshopFigure } from "../src/core/human/workshop.ts";
import { SKELETON_MODEL, skeletonFigure } from "../src/core/human/skeleton.ts";
import { forceVelocityFactor } from "../src/core/muscle/force-velocity.ts";
import { EXERTIONS, measuredTorque, subjectMass } from "../src/core/human/tables/joint-torques.ts";
import { specProvenanceFaults } from "./fixtures/spec.mjs";
import { jointSenses } from "./fixtures/joint-senses.mjs";
import { clearance, hullOf, lowest, solid } from "./fixtures/shapes.mjs";

const table = (model) => ({ mass: bodyMass(model), stature: stature(model), segments: humanSegments(workshopFigure(model)) });

/** Every leaf a spec rests on. */
function leaves(spec) {
  const out = new Set();
  for (const quantity of inventory(spec).quantities.values()) for (const leaf of sourcesOf(quantity)) out.add(leaf);
  return out;
}

test("every number in each model's segment table says where it came from", () => {
  for (const model of WORKSHOP_MODELS) assert.deepEqual(specProvenanceFaults(table(model)), [], model);
});

/** Each row's stiffness under a blunt load, N/m, as its paper prints it, and the sources its provenance names. */
const FEMUR = 4349 / 17.6 * 1000, LENT = "contact-stiffness-gaps";
const SURFACES = {
  head: [201e3, ["cormier-2009"]], upperTrunk: [17e3, ["kent-2005"]], middleTrunk: [17e3, ["kent-2005", LENT]], lowerTrunk: [17e3, ["kent-2005", LENT]],
  upperArm: [FEMUR, ["funk-2004", LENT]], forearm: [FEMUR, ["funk-2004", LENT]], hand: [122.3e3, ["ochman-2011"]],
  thigh: [FEMUR, ["funk-2004"]], shank: [FEMUR, ["funk-2004", LENT]], foot: [122.3e3, ["ochman-2011", LENT]],
};

test("each segment's surface is its row's stiffness in N/m, and a part no study gives names the decision that lends it", () => {
  for (const model of WORKSHOP_MODELS) {
    const segments = humanSegments(workshopFigure(model));
    assert.deepEqual(
      segments.map(({ name, surface: { stiffness } }) => [name, stiffness.unit, stiffness.value, [...new Set([...sourcesOf(stiffness)].map((leaf) => leaf.provenance.source))].sort()]),
      segments.map(({ name }) => { const [k, sources] = SURFACES[name.split(".")[0]]; return [name, "N/m", k, [...sources].sort()]; }), model);
  }
  // A blow is shared by these: the trunk is the softest part and a long bone the stiffest.
  const k = (row) => SURFACES[row][0];
  assert.ok(k("upperTrunk") < k("hand") && k("hand") < k("head") && k("head") < k("thigh"));
});

test("each model's segments sum to its mass: the typical man's 79 kg, and the Rogue's by volume", () => {
  assert.equal(bodyMass("workshop-fighter").value, 79);
  assert.ok(Math.abs(bodyMass("workshop-rogue").value - 79 * 79.8 / 109.5) < 1e-12);
  for (const model of WORKSHOP_MODELS) {
    const segments = humanSegments(workshopFigure(model));
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
    const segments = humanSegments(workshopFigure(model));
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
    const trunk = trunkHulls(model);
    for (const segment of TRUNK_SEGMENTS) assert.deepEqual(envelope.trunk[segment].map((p) => p.value), trunk[segment], `${model} ${segment} trunk`);
    // Each trunk segment's shape is its stretch's hull, every corner at the fit scale.
    const segments = new Map(humanSegments(workshopFigure(model)).map((s) => [s.name, s]));
    for (const segment of TRUNK_SEGMENTS) {
      const shape = segments.get(`${segment}Trunk`).shape;
      assert.equal(shape.kind, "hull");
      assert.deepEqual(shape.points.map((p) => p.value), trunk[segment].map((p) => p.map((c) => c * FIT_SCALE.value)), `${model} ${segment} trunk shape`);
    }
    for (const side of SIDES) assert.deepEqual(stated(envelope.feet[side]), measured(footprint(model, side)), `${model} ${side} foot`);
  }
});

test("the segment tree joins every segment to the lower trunk", () => {
  for (const model of WORKSHOP_MODELS) {
    const names = new Set(humanSegments(workshopFigure(model)).map((segment) => segment.name));
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
 * an overlap it forbids.
 */
test("segments that share no joint have room between them in the reference pose, the humans' and the skeleton's", () => {
  for (const [model, figure] of [...WORKSHOP_MODELS.map((model) => [model, workshopFigure(model)]), [SKELETON_MODEL, skeletonFigure()]]) {
    const segments = humanSegments(figure);
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
    for (const segment of humanSegments(workshopFigure(model))) {
      const bottom = lowest(solid(segment));
      if (segment.name.startsWith("foot.")) assert.ok(Math.abs(bottom) < 1e-12, `${model} ${segment.name} at ${bottom}`);
      else assert.ok(bottom > 0.05, `${model} ${segment.name} reaches ${bottom} m`);
    }
  }
});

/** A rigid body's principal moments obey the triangle inequality; one that does not is no body. */
test("every segment's inertia is a rigid body's", () => {
  for (const model of WORKSHOP_MODELS) {
    for (const { name, inertia } of humanSegments(workshopFigure(model))) {
      const [a, b, c] = inertia.value;
      assert.ok(a > 0 && b > 0 && c > 0 && a + b >= c && b + c >= a && c + a >= b, `${model} ${name}: ${inertia.value}`);
    }
  }
});

test("a hand's frame lies across its knuckles, thumb side to the body's right as in the anatomical position", () => {
  for (const model of WORKSHOP_MODELS) {
    const segments = new Map(humanSegments(workshopFigure(model)).map((segment) => [segment.name, segment]));
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
  // The same unit cube as a hull, with points in its faces and edges and inside that are no corners.
  const cube = (x) => {
    const points = [];
    for (const a of [-0.5, 0, 0.5]) for (const b of [-0.5, 0.25, 0.5]) for (const c of [-0.5, 0.1, 0.5]) points.push([x + a, b, c]);
    return hullOf(points);
  };
  assert.equal(cube(0).points.length, 8);
  assert.ok(Math.abs(clearance(capsule(1, 0.1), cube(0)) - 0.4) < 1e-9);
  assert.ok(Math.abs(clearance(cube(0), capsule(0.3, 0.1)) + 0.3) < 1e-9);
  assert.ok(Math.abs(clearance(cube(0), cube(1.25)) - 0.25) < 1e-9);
  assert.ok(Math.abs(clearance(box(0), cube(1.25)) - 0.25) < 1e-9);
  assert.ok(clearance(cube(0), box(0.75)) < 0);
  assert.equal(lowest(cube(0)), -0.5);
  // A tetrahedron whose slanted face faces the cube's corner: only its own face separates them, at
  // the corner's distance from that face's plane.
  const tetra = hullOf([[2, 0, 0], [0, 2, 0], [0, 0, 2], [3, 3, 3]]);
  assert.ok(Math.abs(clearance(cube(0), tetra) - 0.5 / Math.sqrt(3)) < 1e-9);
  assert.ok(Math.abs(clearance(tetra, cube(0)) - 0.5 / Math.sqrt(3)) < 1e-9);
});

test("every number in each model's whole spec, joints and muscle included, says where it came from", () => {
  for (const model of WORKSHOP_MODELS) assert.deepEqual(specProvenanceFaults(humanSpec(model)), [], model);
});

test("the joints join exactly the segment tree, on square unit axes, each range about the reference pose", () => {
  for (const model of WORKSHOP_MODELS) {
    const { joints } = humanSpec(model);
    assert.equal(joints.length, HUMAN_PARENTS.size, model);
    assert.deepEqual(new Set(joints.map((j) => `${j.child} in ${j.parent}`)),
      new Set([...HUMAN_PARENTS].map(([child, parent]) => `${child} in ${parent}`)), model);
    for (const joint of joints) {
      joint.dofs.forEach((dof, i) => {
        const what = `${model} ${joint.name} ${dof.positive}`;
        assert.ok(Math.abs(length(dof.axis.value) - 1) < 1e-9, `${what}: axis length ${length(dof.axis.value)}`);
        for (const other of joint.dofs.slice(i + 1)) {
          assert.ok(Math.abs(dot(dof.axis.value, other.axis.value)) < 1e-9, `${what} and ${other.positive} are not square`);
        }
        assert.ok(dof.min.value <= 0 && dof.max.value >= 0 && dof.min.value < dof.max.value, `${what}: ${dof.min.value}..${dof.max.value}`);
        assert.ok(dof.muscle.peakPositive.value > 0 && dof.muscle.peakNegative.value > 0, what);
      });
    }
  }
});

/**
 * A positive turn about an axis moves a lever v toward cross(axis, v); each freedom must move its
 * lever the anatomical way (`tests/fixtures/joint-senses.mjs`). The weakest is the elbow, whose
 * flexion carries the hand of an arm held out from the side upward and in, at about 0.5.
 */
test("each freedom's positive turn is the motion it is named for", () => {
  for (const model of WORKSHOP_MODELS) {
    const spec = humanSpec(model);
    const rows = jointSenses(spec);
    assert.equal(rows.length, spec.joints.reduce((n, j) => n + j.dofs.length, 0), `${model}: a freedom with no row`);
    for (const [name, positive, lever, direction] of rows) {
      const dof = spec.joints.find((j) => j.name === name).dofs.find((d) => d.positive === positive);
      const along = dot(normalize(cross(dof.axis.value, lever)), direction);
      assert.ok(along > 0.4, `${model} ${name} ${positive} moves its lever ${along.toFixed(3)} along the way it should`);
    }
  }
});

/**
 * Each model reads its own sex's ranges and speeds where a source splits them, and only the men's
 * torques: the women's torque column is the check below, never an input. The control: the Rogue
 * does read a women's range, so the detector sees a column.
 */
test("each model reads its own sex's ranges and speeds, and only the men's torques", () => {
  const byColumn = new Set(["moromizato-2016", "zwerus-2019", "kitsoulis-2010", "hallaceli-2014", "jiang-2025"]);
  const torques = new Set(["ds-2009", "anderson-2007", "pan-2025", "vasavada-2001", "axelsson-2018", "peleg-2025", "da-fonseca-2025"]);
  const column = { male: "men", female: "women" };
  for (const model of WORKSHOP_MODELS) {
    const read = [...leaves(humanSpec(model))].map((leaf) => leaf.provenance);
    const ranges = read.filter((p) => byColumn.has(p.source));
    assert.ok(ranges.length > 20, model);
    for (const p of ranges) assert.match(p.where, new RegExp(`, ${column[WORKSHOP_SEX[model]]}(, (left|right))?$`), `${model} reads ${p.source} ${p.where}`);
    const muscles = humanSpec(model).joints.flatMap((j) => j.dofs.map((d) => d.muscle));
    const torque = muscles.flatMap((m) => [...sourcesOf(m.peakPositive), ...sourcesOf(m.peakNegative)]).map((leaf) => leaf.provenance)
      .filter((p) => torques.has(p.source));
    assert.ok(torque.length >= EXERTIONS.length, model);
    for (const p of torque) assert.ok(!/women/.test(p.where), `${model} reads ${p.source} ${p.where}`);
    // How torque falls with speed is read from the model's own sex's column.
    const speed = muscles.flatMap((m) => [m.speedPositive, m.speedNegative])
      .flatMap((curve) => Object.values(curve).flatMap((q) => [...sourcesOf(q)])).map((leaf) => leaf.provenance)
      .filter((p) => p.source === "anderson-2007" || p.source === "frey-law-2012");
    assert.ok(speed.length > 0, model);
    for (const p of speed) {
      assert.ok(/ (men|women)(,|$)/.test(p.where) ? new RegExp(` ${column[WORKSHOP_SEX[model]]}(,|$)`).test(p.where)
        : !/(^|\W)(men|women)(\W|$)/.test(p.where), `${model} reads ${p.source} ${p.where}`);
    }
    assert.ok(speed.some((p) => new RegExp(` ${column[WORKSHOP_SEX[model]]}(,|$)`).test(p.where)), model);
  }
});

/**
 * The muscle rule predicts the Rogue from the men; the women's measured column, at her mass, is
 * what it should land near (`docs/reference/human-strike-reference.md` section 9). The band holds
 * that table's spread (0.63 to 1.37, the trunk and the wrist's ulnar deviation lowest) and its
 * middle, near 0.97; scaling by mass alone would put the middle at 1.39.
 */
test("the Rogue's torques, scaled from the men's by her muscle, land near the women's measured column", () => {
  const mass = bodyMass("workshop-rogue").value;
  const ratios = EXERTIONS.map((exertion) => {
    const measured = measuredTorque(exertion, "female").value * mass / subjectMass(exertion, "female").value;
    return [exertion, peakTorque(workshopFigure("workshop-rogue"), exertion).value / measured];
  });
  for (const [exertion, ratio] of ratios) assert.ok(ratio > 0.55 && ratio < 1.5, `${exertion}: ${ratio.toFixed(2)}`);
  const sorted = ratios.map(([, ratio]) => ratio).sort((a, b) => a - b);
  const middle = (sorted[(sorted.length - 1) >> 1] + sorted[sorted.length >> 1]) / 2;
  assert.ok(middle > 0.85 && middle < 1.15, `middle ratio ${middle.toFixed(3)}`);
});

/**
 * Each measured curve says what its source says: Anderson's through the two speeds at which his
 * fits keep three quarters and half of isometric; Frey-Law's the least-squares unloaded speed at
 * Thelen's curvature. That curve is within 5 % of isometric from 120 deg/s up, and 7-14 % high at
 * 60 deg/s, where the paper says the elbow drops fast and no Hill curve through the rest follows.
 * A borrowed curve is the one it names, and says it is borrowed. The control: the elbow's curve at
 * 0.9 of its unloaded speed fits worse.
 */
test("each measured speed curve passes through its source, and a borrowed one names the curve it takes", () => {
  const curveOf = (spec) => Object.fromEntries(Object.entries(spec).map(([k, q]) => [k, q.value]));
  const anderson = {
    male: { hipExtension: [1.578, 3.190], hipFlexion: [2.095, 4.267], kneeExtension: [1.517, 3.952], kneeFlexion: [2.008, 5.233], ankleDorsiflexion: [0.699, 1.940] },
    female: { hipExtension: [1.567, 3.164], hipFlexion: [2.136, 4.349], kneeExtension: [1.393, 3.623], kneeFlexion: [1.698, 4.412], ankleDorsiflexion: [0.864, 2.399] },
  };
  const freyLaw = {
    male: { elbowFlexion: [63.0, 44.7, 38.7, 33.1, 27.9, 25.7], elbowExtension: [52.8, 39.6, 35.6, 31.8, 26.1, 24.6] },
    female: { elbowFlexion: [32.0, 21.4, 19.9, 17.9, 15.8, 14.1], elbowExtension: [29.2, 22.1, 20.0, 18.1, 15.9, 13.3] },
  };
  const speeds = [60, 120, 180, 240, 300].map((d) => d * Math.PI / 180);
  const worst = (curve, torques) => Math.max(...speeds.slice(1).map((w, i) => Math.abs(forceVelocityFactor(w, curve) - torques[i + 2] / torques[0])));
  const first = (curve, torques) => forceVelocityFactor(speeds[0], curve) - torques[1] / torques[0];
  for (const model of WORKSHOP_MODELS) {
    const sex = WORKSHOP_SEX[model];
    for (const [exertion, [c4, c5]] of Object.entries(anderson[sex])) {
      const curve = curveOf(jointSpeed(workshopFigure(model), exertion));
      assert.ok(Math.abs(forceVelocityFactor(c4, curve) - 0.75) < 1e-9, `${model} ${exertion} at C4`);
      assert.ok(Math.abs(forceVelocityFactor(c5, curve) - 0.5) < 1e-9, `${model} ${exertion} at C5`);
    }
    for (const [exertion, torques] of Object.entries(freyLaw[sex])) {
      const curve = curveOf(jointSpeed(workshopFigure(model), exertion));
      assert.equal(curve.curvature, 0.25);
      const residual = (w0) => speeds.reduce((sum, w, i) => {
        const f = torques[i + 1] / torques[0];
        return sum + ((1 - f) * w0 - w * (1 + f / curve.curvature)) ** 2;
      }, 0);
      for (const nudge of [0.99, 1.01]) assert.ok(residual(curve.unloadedSpeed * nudge) > residual(curve.unloadedSpeed), `${model} ${exertion} least squares`);
      assert.ok(worst(curve, torques) < 0.05, `${model} ${exertion} is within 5 % of isometric: ${worst(curve, torques)}`);
      assert.ok(first(curve, torques) > 0.07 && first(curve, torques) < 0.14, `${model} ${exertion} at 60 deg/s: ${first(curve, torques)}`);
      assert.ok(worst({ ...curve, unloadedSpeed: 0.9 * curve.unloadedSpeed }, torques) > worst(curve, torques));
    }
    const shoulder = jointSpeed(workshopFigure(model), "shoulderFlexion"), elbow = jointSpeed(workshopFigure(model), "elbowFlexion");
    assert.equal(shoulder.unloadedSpeed.value, elbow.unloadedSpeed.value);
    assert.match(shoulder.unloadedSpeed.provenance.rule, /elbowFlexion's, taken for shoulderFlexion/);
    assert.equal(elbow.unloadedSpeed.provenance.kind, "derived");
    assert.doesNotMatch(elbow.unloadedSpeed.provenance.rule, /taken for/);
  }
});

/** How far `point` stands outside the hull `shape`, m: its largest height over a face's plane. */
const heightOver = (shape, point) => Math.max(...hullOf(shape.points.map((p) => p.value)).planes.map(({ normal, offset }) => dot(normal, point) - offset));

test("the workshop humans' hands open on their palms' hulls and close on their fists', and grip on the capsule fist", () => {
  for (const model of WORKSHOP_MODELS) {
    const figure = workshopFigure(model), segments = humanSegments(figure);
    for (const side of SIDES) {
      const hand = segments.find((s) => s.name === `hand.${side}`), measured = figure.hands[side], { open, fist, grip } = hand.handPoses;
      const where = `${model} ${side}`;
      // What a held item seats against stays the capsule; the grip is that capsule ended at the knuckles.
      assert.equal(hand.shape.kind, "capsule", where);
      assert.deepEqual(grip, { kind: "capsule", from: hand.shape.from, to: hand.points.knuckles, radius: hand.shape.radius }, where);
      for (const [pose, hull] of [[open, measured.palm.hull], [fist, measured.fist.hull]]) {
        assert.deepEqual([pose.kind, pose.points.map((p) => p.value)], ["hull", hull.map((p) => scale(p.value, FIT_SCALE.value))], where);
      }
      assert.deepEqual([hand.points.strike.value, hand.points.palm.value], [scale(measured.fist.strike.value, FIT_SCALE.value), scale(measured.palm.centre.value, FIT_SCALE.value)], where);
      assert.ok(Math.abs(heightOver(fist, hand.points.strike.value)) < 1e-4, `${where}: the strike on the fist's surface`);
      assert.ok(heightOver(fist, hand.points.knuckles.value) < -1e-3, `${where}: the knuckles inside the fist`);
      assert.ok(Math.abs(heightOver(open, hand.points.palm.value)) < 2e-4, `${where}: the palm point on the open hand's surface`);
      // Either pose has room from every segment the hand shares no joint with, in the reference pose.
      for (const other of segments) {
        if (other === hand || HUMAN_PARENTS.get(hand.name) === other.name) continue;
        for (const [name, shape] of [["open", open], ["fist", fist]]) {
          const room = clearance(solid({ ...hand, shape }), solid(other));
          assert.ok(room > 0, `${where} ${name} and ${other.name}: ${room} m`);
        }
      }
    }
  }
});

test("the skeleton's hands are capsules in every pose, its fist ended at its knuckles", () => {
  for (const side of SIDES) {
    const hand = humanSegments(skeletonFigure()).find((s) => s.name === `hand.${side}`), { open, fist, grip } = hand.handPoses;
    assert.equal(open, hand.shape);
    assert.deepEqual(fist, { kind: "capsule", from: hand.shape.from, to: hand.points.knuckles, radius: hand.shape.radius });
    assert.equal(grip, fist);
    assert.deepEqual(Object.keys(hand.points).sort(), ["knuckles", "little", "strike"]);
    const along = normalize(sub(hand.distal.value, hand.proximal.value));
    assert.ok(length(sub(hand.points.strike.value, hand.points.knuckles.value.map((k, i) => k + along[i] * hand.shape.radius.value))) < 1e-12, side);
  }
});
