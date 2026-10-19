/**
 * **A rise's recipe** (`stageFaults`, `src/core/mind/rise/stages.ts`): a recipe that cannot be played
 * says why; a propped limb bears only on capsules and an end limb on a hand's hulls; and a side's roll
 * is the back's from its side, the left's the right's mirrored.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { HUMANOID_MODELS, modelSpec } from "../src/core/models.ts";
import { stagedRise } from "../src/core/mind/rise/staged.ts";
import { RISE, stageFaults } from "../src/core/mind/rise/stages.ts";
import { FOURS, withStage } from "./fixtures/core-rise.mjs";

/** No roll: a body not on its front lies as it is. */
const NO_ROLL = { back: [], left: [], right: [] };

test("a recipe that cannot be played says why", () => {
  for (const model of HUMANOID_MODELS) assert.deepEqual(stageFaults(RISE, modelSpec(model)), [], model);
  const warrior = modelSpec("workshop-fighter"), tuck = RISE.rise.find((stage) => stage.name === "tuck");
  assert.deepEqual(stageFaults(withStage(RISE, { ...tuck, posture: { ...tuck.posture, "tail flexion": 0.2 } }), warrior),
    ["stage tuck asks tail flexion, which workshop-fighter lacks"]);
  // A knee asked past its stop, and one asked short of its other: both ends of the range, from the freedom's own zero.
  const knee = warrior.joints.find((joint) => joint.name === "knee.left").dofs[0];
  const range = `${knee.min.value + knee.bind.value} to ${knee.max.value + knee.bind.value}`;
  assert.ok(knee.bind.value > 0.05 && knee.max.value + knee.bind.value < 3, `the Warrior's knee is bent ${knee.bind.value} rad as built, and bends to ${knee.max.value + knee.bind.value}`);
  for (const angle of [3, -0.5]) {
    assert.deepEqual(stageFaults(withStage(RISE, { ...tuck, posture: { ...tuck.posture, "knee.left flexion": angle } }), warrior),
      [`stage tuck asks knee.left flexion for ${angle} rad, outside its range, ${range}`]);
  }
  // The range is from the freedom's zero, not the reference pose: the knee's whole range from its zero is within it, and that much from the reference pose is not.
  const most = knee.max.value + knee.bind.value - 1e-9;
  assert.ok(most > knee.max.value, "the fixture: the stop is further from the zero than from the reference pose");
  assert.deepEqual(stageFaults(withStage(RISE, { ...tuck, posture: { ...tuck.posture, "knee.left flexion": most } }), warrior), []);
  // A freedom the posture does not name goes to its zero, which the range must hold too.
  const bent = { ...warrior, joints: warrior.joints.map((joint) => (joint.name !== "knee.left" ? joint : { ...joint, dofs: [{ ...knee, min: { ...knee.min, value: 0.2 - knee.bind.value } }] })) };
  assert.deepEqual(stageFaults({ ...RISE, roll: NO_ROLL, rise: [{ kind: "pose", name: "rest", posture: {}, seconds: 1 }] }, bent),
    [`stage rest asks knee.left flexion for 0 rad, outside its range, 0.2 to ${knee.max.value + knee.bind.value}`]);
  for (const seconds of [0, -1, NaN]) {
    assert.deepEqual(stageFaults(withStage(RISE, { ...tuck, seconds }), warrior), [`stage tuck lasts ${seconds} s`]);
  }
  // A pose's drive, each of its numbers on both sides of zero.
  for (const drive of [{ speed: 0, within: 0.1 }, { speed: 6, within: 0 }, { speed: -1, within: 0.1 }, { speed: 6, within: NaN }]) {
    assert.deepEqual(stageFaults(withStage(RISE, { ...tuck, drive }), warrior), [`stage tuck drives at ${drive.speed} rad/s within ${drive.within} s`]);
  }
  assert.deepEqual(stageFaults(withStage(RISE, { ...tuck, drive: { speed: 6, within: 0.1 } }), warrior), []);
  // A roll's stages are read as the rise's are.
  assert.deepEqual(stageFaults({ ...RISE, roll: { ...RISE.roll, left: [{ ...tuck, name: "turn", seconds: 0 }] } }, warrior), ["stage turn lasts 0 s"]);
  // The trunk the abort reads.
  assert.deepEqual(stageFaults({ ...RISE, trunk: [] }, warrior), ["the trunk has no segment"]);
  assert.deepEqual(stageFaults({ ...RISE, trunk: [...RISE.trunk, "tail"] }, warrior), ["the trunk has tail, which workshop-fighter lacks"]);
  // The limbs: a recipe for each fault.
  const [shin, hand] = RISE.limbs, hips = shin.takes.slice(0, 3);
  const withLimbs = (...limbs) => ({ ...RISE, limbs: [...RISE.limbs, ...limbs] });
  const withLimb = (limb) => ({ ...RISE, limbs: RISE.limbs.map((old) => (old.name === limb.name ? limb : old)) });
  for (const [recipe, faults] of [
    [withLimbs(shin), ["limb shin.left is named twice"]],
    [withLimbs({ ...hand, name: "tail", segment: "tail" }), ["limb tail is on tail, which workshop-fighter lacks"]],
    [withLimbs({ kind: "end", name: "toe", segment: "foot.left", from: "hip.left", takes: hips }), ["limb toe bears on an end of foot.left, a box"]],
    [withLimb({ ...hand, from: "hip.left" }), ["limb hand.left begins at hip.left, which is not on the way to hand.left"]],
    [withLimb({ ...hand, takes: [...hand.takes.slice(0, 3), hand.takes[0]] }), ["limb hand.left takes shoulder.left flexion twice"]],
    [withLimb({ ...hand, takes: [...hand.takes.slice(0, 3), "knee.left flexion"] }), ["limb hand.left takes knee.left flexion, which is not a freedom of its chain"]],
    [withLimb({ ...hand, takes: hand.takes.slice(0, 2) }), ["limb hand.left takes 2 channels, and its task has 3 rows"]],
    [withLimb({ ...shin, takes: hips }), ["limb shin.left takes 3 channels, and its task has 4 rows"]],
    [withLimb({ ...shin, prop: "hand.left" }), ["limb shin.left is propped on hand.left, which is not a foot a stance stands on"]],
    [withLimb({ ...shin, prop: "foot.right" }), ["limb shin.left is propped on foot.right, which does not hang from shank.left"]],
  ]) assert.deepEqual(stageFaults(recipe, warrior), faults);
  // And a bearing stage's.
  const thigh = { kind: "end", name: "thigh.left", segment: "thigh.left", from: "hip.left", takes: hips };
  for (const [recipe, faults] of [
    [withStage(RISE, { ...FOURS, on: [...FOURS.on.slice(1), { limb: "tail", share: FOURS.on[0].share }] }), ["stage fours bears on tail, which the recipe lacks"]],
    [withStage(RISE, { ...FOURS, leave: ["tail"] }), ["stage fours leaves tail, which the recipe lacks"]],
    [withStage(withLimbs(thigh), { ...FOURS, leave: ["thigh.left"] }), ["stage fours drives shin.left and thigh.left, which share hip.left flexion"]],
    [withStage(RISE, { ...FOURS, on: FOURS.on.slice(1) }), [`stage fours's shares sum to ${FOURS.on.slice(1).reduce((sum, { share }) => sum + share, 0)}`]],
    [withStage(RISE, { ...FOURS, limit: 0 }), ["stage fours may take 0 s"]],
    [withStage(RISE, { ...FOURS, posture: { ...FOURS.posture, "knee.left flexion": 3 } }), [`stage fours asks knee.left flexion for 3 rad, outside its range, ${range}`]],
  ]) assert.deepEqual(stageFaults(recipe, warrior), faults);
  assert.deepEqual(stageFaults(withStage(RISE, { ...FOURS, posture: "reference" }), warrior), [], "the reference pose is a posture every body has");
  // And a riser is not made of a recipe its body cannot play.
  assert.throws(() => stagedRise({ spec: warrior }, {}, withStage(RISE, { ...tuck, seconds: 0 })), /workshop-fighter cannot play this rise: stage tuck lasts 0 s/);
});

test("a side's roll is the back's from where the back's has the body on its side, and the left's is the right's mirrored", () => {
  // A side's roll is the back's from where the back's has the body on its side, over the side that is down: the left's is the right's, mirrored.
  assert.deepEqual(RISE.roll.right, RISE.roll.back.slice(2));
  const mirrored = (posture) => Object.fromEntries(Object.entries(posture).map(([name, angle]) => [name.replace(/.(left|right) /, (_, side) => `.${side === "left" ? "right" : "left"} `), angle]));
  assert.deepEqual(RISE.roll.left, RISE.roll.right.map((stage) => ({ ...stage, posture: mirrored(stage.posture) })));
  assert.deepEqual(Object.keys(RISE.roll.right[0].posture).sort(), ["hip.left abduction", "hip.left flexion", "shoulder.right flexion"], "the fixture: the roll's postures are of one side and the other");
});

test("a propped limb bears only on capsules, and an end limb on a hand's hulls", () => {
  const spec = modelSpec("workshop-fighter"), hand = RISE.limbs.find((limb) => limb.name === "hand.left");
  assert.deepEqual(stageFaults(RISE, spec), []);
  const propped = { ...RISE.limbs.find((limb) => limb.kind === "propped"), name: "palm", segment: "hand.left", end: "far" };
  const faults = stageFaults({ ...RISE, limbs: [...RISE.limbs, propped] }, spec);
  assert.ok(faults.includes("limb palm bears on hand.left, whose open pose is a hull"), faults.join("; "));
  const boxed = { ...spec, segments: spec.segments.map((s) => s.name === hand.segment ? { ...s, handPoses: { ...s.handPoses, fist: { kind: "box", centre: s.centreOfMass, size: { ...s.centreOfMass, value: [0.1, 0.1, 0.1] } } } } : s) };
  assert.ok(stageFaults(RISE, boxed).includes(`limb ${hand.name} bears on ${hand.segment}, whose fist pose is a box`), stageFaults(RISE, boxed).join("; "));
});
