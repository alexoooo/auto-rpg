/**
 * **Rising by stages** (`stagedRise`, `src/core/mind/rise/staged.ts`): a recipe that cannot be
 * played, how a body lies, the wait until it is still, the pose stages that draw the knees under a
 * body on its front and prop it, and a riser the body is taken from. Node, core world on the
 * arena's ground (`research/core-rise-trials.mjs`), Rapier, 120 Hz.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { createBody, SERVO_SECONDS } from "../src/core/body.ts";
import { centreOfToRef } from "../src/core/control/support.ts";
import { BODY_MODELS, modelSpec } from "../src/core/human/spec.ts";
import { lying } from "../src/core/mind/lie.ts";
import { lieOf, stagedRise } from "../src/core/mind/rise/staged.ts";
import { RISE, stageFaults } from "../src/core/mind/rise/stages.ts";
import { felled, riserOf, toppled } from "../research/core-rise-trials.mjs";
import { coreStand } from "./harness/core-stand.mjs";

/** The game's rise as far as its stages are poses. */
const POSES = { ...RISE, rise: RISE.rise.filter((stage) => stage.kind === "pose") };
/** `recipe` with `stage` in place of the rise's stage of its name. */
const withStage = (recipe, stage) => ({ ...recipe, rise: recipe.rise.map((old) => (old.name === stage.name ? stage : old)) });
/** The height of `built`'s segment `name`'s centre of mass, m. */
const heightOf = (built, name) => centreOfToRef(built.segments.get(name), new Vector3()).y;
const speedOf = (v) => Math.hypot(v.x, v.y, v.z);

test("a recipe that cannot be played says why", () => {
  for (const model of BODY_MODELS) assert.deepEqual(stageFaults(RISE, modelSpec(model)), [], model);
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
  assert.deepEqual(stageFaults({ ...RISE, rise: [{ kind: "pose", name: "rest", posture: {}, seconds: 1 }] }, bent),
    [`stage rest asks knee.left flexion for 0 rad, outside its range, 0.2 to ${knee.max.value + knee.bind.value}`]);
  for (const seconds of [0, -1, NaN]) {
    assert.deepEqual(stageFaults(withStage(RISE, { ...tuck, seconds }), warrior), [`stage tuck lasts ${seconds} s`]);
  }
  // A roll's stages are read as the rise's are.
  assert.deepEqual(stageFaults({ ...RISE, roll: { ...RISE.roll, left: [{ ...tuck, name: "turn", seconds: 0 }] } }, warrior), ["stage turn lasts 0 s"]);
  // And a riser is not made of a recipe its body cannot play.
  assert.throws(() => stagedRise({ spec: warrior }, {}, withStage(RISE, { ...tuck, seconds: 0 })), /workshop-fighter cannot play this rise: stage tuck lasts 0 s/);
});

test("how a body lies is read from its pelvis", async () => {
  // Toppled stiff forward and backward, then slack 3 s: on its front, and on its back.
  for (const model of BODY_MODELS) for (const [degrees, lie] of [[0, "front"], [180, "back"]]) {
    const { world, body, dispose } = await toppled({ model, held: "empty", degrees }, [lying]);
    try {
      world.step(3 * world.hz);
      assert.deepEqual([body.has, body.view.down, lieOf(body.muscles.dynamics.root.segment)], ["lie", true, lie], `${model}, shoved ${degrees} degrees about up`);
    } finally { dispose(); }
  }
  // Toppled stiff to a side, at the step it is first down it is still falling, on that side: that side's arm is the lower.
  for (const [degrees, lie, lower, upper] of [[90, "right", "upperArm.right", "upperArm.left"], [270, "left", "upperArm.left", "upperArm.right"]]) {
    const { built, body, dispose } = await felled({ model: "workshop-fighter", held: "empty", degrees }, (made, into) => {
      const stiff = (own) => ({
        name: "stiff", wants: () => true, begin() {}, end() {},
        step() { own.muscles.activation.fill(1); for (let i = 0; i < own.muscles.velocity.length; i++) own.muscles.velocity[i] = Math.max(-3, Math.min(3, -own.muscles.angle(i) / 0.2)); },
      });
      return createBody(made, into, { servoSeconds: SERVO_SECONDS, subs: [stiff] });
    });
    try {
      const between = heightOf(built, upper) - heightOf(built, lower);
      assert.ok(body.view.down && between > 0.15, `shoved ${degrees} degrees about up, its ${upper} is ${between} m above its ${lower}`);
      assert.equal(lieOf(body.muscles.dynamics.root.segment), lie, `shoved ${degrees} degrees about up`);
    } finally { dispose(); }
  }
});

test("a riser lies slack until its body is still, and after a roll reads how it lies again", async () => {
  // A body nothing drives falls on its back within a second, and the riser has it from the step it is down, still falling.
  const turn = { kind: "pose", name: "turn", posture: {}, seconds: 0.25 };
  const stand = await coreStand(modelSpec("workshop-fighter"));
  const body = createBody(stand.built, stand.world, { servoSeconds: SERVO_SECONDS, subs: [(own, view) => stagedRise(own, view, { ...POSES, roll: { ...POSES.roll, back: [turn] } })] });
  try {
    const riser = riserOf(body), dt = stand.world.dt, seen = [];
    assert.deepEqual(riser, { phase: "idle", lie: "front", stage: 0, time: 0, still: 0, tries: 0, furthest: -1 });
    for (let i = 0; i < stand.seconds(6) && riser.tries < 2; i++) {
      // The phase a step is played in is the one it begins with; taking the body, it begins slack.
      const phase = riser.phase === "idle" ? "settle" : riser.phase;
      stand.step();
      if (body.has !== "staged-rise") continue;
      seen.push({ phase, tries: riser.tries, speed: speedOf(body.view.stance.velocity), asking: body.muscles.activation.some((level) => level !== 0) || body.muscles.velocity.some((speed) => speed !== 0) });
    }
    assert.equal(riser.tries, 2, "it read how it lay, rolled, and read again");
    assert.deepEqual([riser.lie, riser.furthest], ["back", -1], "a roll's stage is not a stage of the rise");
    // Its phases, each with how many steps it lasted: slack, the roll's one stage, slack again.
    const runs = [];
    for (const { phase } of seen) {
      if (runs.at(-1)?.[0] === phase) runs.at(-1)[1] += 1;
      else runs.push([phase, 1]);
    }
    const still = Math.round(0.5 / dt), rolled = Math.round(turn.seconds / dt);
    assert.deepEqual(runs.map(([phase]) => phase), ["settle", "roll", "settle"]);
    assert.deepEqual(runs[1], ["roll", rolled], "the roll's stage lasts its time");
    // The first wait: it was moving when the riser took it, and the roll began half a second after the last step it was not slow.
    const first = seen.slice(0, runs[0][1]), moving = first.findLastIndex((step) => step.speed >= 0.1);
    assert.ok(first[0].speed > 0.5 && moving > 10, `taken at ${first[0].speed} m/s, it was last moving ${moving} steps on`);
    assert.equal(first.length - 1 - moving, still, `it waited ${first.length - 1 - moving} steps after it was last moving`);
    assert.ok(first.every((step) => !step.asking), "waiting, it asks its muscles nothing");
    // The second: the roll over, it waits again from nothing.
    assert.ok(runs[2][1] >= still, `after the roll it waited ${runs[2][1]} steps`);
    assert.ok(seen.slice(-runs[2][1]).every((step) => !step.asking), "and asks nothing again");
    assert.ok(seen.slice(runs[0][1], runs[0][1] + rolled).every((step) => step.asking), "rolling, it drives its muscles");
    // On its back with no roll to play it would wait for ever: the game's recipe has none yet, and its tries count the waits.
  } finally { body.dispose(); stand.dispose(); }
});

/**
 * What the pose stages leave of each body fallen on its front, m: the least height of its
 * pelvis's centre of mass and of its upper trunk's at the end of `prop`
 * (`docs/reference/rising.md#stages`: the readings these stand under).
 */
const PROPPED = {
  "workshop-fighter": { pelvis: 0.35, chest: 0.38 },
  "workshop-rogue": { pelvis: 0.3, chest: 0.19 },
  "crypt-skeleton": { pelvis: 0.33, chest: 0.34 },
};

test("fallen forward, a body draws its knees under and props itself", async () => {
  for (const model of BODY_MODELS) {
    const { world, built, body, dispose } = await toppled({ model, held: "empty", degrees: 0 }, [(own, view) => stagedRise(own, view, POSES)]);
    try {
      const riser = riserOf(body), has = new Set(), lay = { pelvis: heightOf(built, "lowerTrunk"), chest: heightOf(built, "upperTrunk") };
      assert.ok(lay.pelvis < 0.2 && lay.chest < 0.2, `${model} lies with its pelvis ${lay.pelvis} m up and its chest ${lay.chest}`);
      let steps = 0;
      do {
        world.step();
        has.add(body.has);
        steps += 1;
      } while (riser.phase !== "idle" && steps < 12 * world.hz);
      const seconds = POSES.rise.reduce((sum, stage) => sum + stage.seconds, 0);
      assert.deepEqual({ ...riser, time: null, still: null }, { phase: "idle", lie: "front", stage: POSES.rise.length - 1, time: null, still: null, tries: 1, furthest: POSES.rise.length - 1 }, model);
      assert.deepEqual([...has], ["staged-rise"], `${model}: from the fall to the last stage's end the riser has it`);
      // Half a second slack, then each stage for its time.
      assert.ok(steps / world.hz > 0.5 + seconds - 0.01 && steps / world.hz < 0.5 + seconds + 0.5, `${model}: the stages ended ${steps / world.hz} s after the riser took it`);
      const up = { pelvis: heightOf(built, "lowerTrunk"), chest: heightOf(built, "upperTrunk") }, bar = PROPPED[model];
      assert.ok(up.pelvis > bar.pelvis && up.chest > bar.chest, `${model}: at the end of prop its pelvis is ${up.pelvis} m up and its chest ${up.chest}, from ${lay.pelvis} and ${lay.chest}`);
      assert.equal(lieOf(body.muscles.dynamics.root.segment), "front", model);
      // Its stages over and still down, it keeps the body, lies slack, and begins another attempt.
      world.step();
      assert.deepEqual([body.has, body.view.down, riser.phase, riser.tries, body.muscles.activation.some((level) => level !== 0)], ["staged-rise", true, "settle", 1, false], model);
      for (let i = 0; i < 4 * world.hz && riser.tries < 2; i++) world.step();
      assert.deepEqual([riser.phase, riser.stage, riser.tries, riser.furthest], ["rise", 0, 2, POSES.rise.length - 1], model);
    } finally { dispose(); }
  }
});

test("a riser that is taken from begins again", async () => {
  /** A sub-mind of higher rank that wants the body, slack, for half a second from the middle of `prop`. */
  let from = null, riser = null;
  const taker = (own) => ({
    name: "taker",
    wants: (senses) => {
      if (from === null && riser?.phase === "rise" && riser.stage === POSES.rise.length - 1 && riser.time > 0.5) from = senses.time;
      return from !== null && senses.time < from + 0.5;
    },
    begin() {}, end() {},
    step() { own.muscles.activation.fill(0); own.muscles.velocity.fill(0); },
  });
  const { world, body, dispose } = await toppled({ model: "workshop-fighter", held: "empty", degrees: 0 }, [taker, (own, view) => stagedRise(own, view, POSES)]);
  try {
    riser = riserOf(body);
    const last = POSES.rise.length - 1;
    while (body.has !== "taker" && world.steps < 12 * world.hz) world.step();
    // Taken from, it is doing nothing; what it reached is kept until it begins again.
    assert.deepEqual([body.has, { ...riser, time: null, still: null }], ["taker", { phase: "idle", lie: "front", stage: last, time: null, still: null, tries: 1, furthest: last }]);
    while (body.has === "taker") {
      assert.equal(riser.phase, "idle");
      world.step();
    }
    assert.deepEqual([body.has, body.view.down, { ...riser, still: null }], ["staged-rise", true, { phase: "settle", lie: "front", stage: last, time: riser.time, still: null, tries: 0, furthest: -1 }],
      "back, it lies slack and counts its attempts from none");
    while (riser.phase !== "idle" && world.steps < 24 * world.hz) world.step();
    assert.deepEqual({ ...riser, time: null, still: null }, { phase: "idle", lie: "front", stage: last, time: null, still: null, tries: 1, furthest: last }, "and plays its stages again from the first");
  } finally { dispose(); }
});
