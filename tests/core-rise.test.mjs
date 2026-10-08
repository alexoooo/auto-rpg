/**
 * **Rising by stages** (`stagedRise`, `src/core/mind/rise/staged.ts`): a recipe that cannot be
 * played, how a body lies, the wait until it is still, the pose stages that draw the knees under a
 * body on its front and prop it, a riser the body is taken from, the bearing stage that brings it
 * to its knees and hands, the roll that turns it onto its front from its back and from a side,
 * what a bearing stage is done by, and what its limbs bear on. Node, core world on the arena's
 * ground, or a floor over it (`research/core-rise-trials.mjs`), Rapier, 120 Hz; no assist.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { createBody, SERVO_SECONDS } from "../src/core/body.ts";
import { uprightness } from "../src/core/control/ground.ts";
import { SOLE_MARGIN } from "../src/core/control/stance-tuning.ts";
import { centreOfToRef, footStatesOf, pointOfToRef, readSupport, turnOfToRef } from "../src/core/control/support.ts";
import { HUMANOID_MODELS, modelSpec } from "../src/core/models.ts";
import { lying } from "../src/core/mind/lie.ts";
import { createMind } from "../src/core/mind/minds.ts";
import { STAND_ORDERS } from "../src/core/mind/orders.ts";
import { riseLimbs } from "../src/core/mind/rise/limbs.ts";
import { lieOf, stagedRise } from "../src/core/mind/rise/staged.ts";
import { RISE, stageFaults } from "../src/core/mind/rise/stages.ts";
import { felled, riserOf, toppled } from "../research/core-rise-trials.mjs";
import { coreStand } from "./harness/core-stand.mjs";

/** No roll: a body not on its front lies as it is. */
const NO_ROLL = { back: [], left: [], right: [] };
/** The game's rise as far as its first bearing stage, `fours`, and its stages before that, which are poses. */
const AT_FOURS = RISE.rise.findIndex((stage) => stage.name === "fours");
const TO_FOURS = { ...RISE, rise: RISE.rise.slice(0, AT_FOURS + 1) }, POSES = { ...RISE, rise: RISE.rise.slice(0, AT_FOURS) };
/** `recipe` with `stage` in place of the rise's stage of its name. */
const withStage = (recipe, stage) => ({ ...recipe, rise: recipe.rise.map((old) => (old.name === stage.name ? stage : old)) });
/** The height of `built`'s segment `name`'s centre of mass, m. */
const heightOf = (built, name) => centreOfToRef(built.segments.get(name), new Vector3()).y;
const speedOf = (v) => Math.hypot(v.x, v.y, v.z);
/** A riser's memory as a record to compare: its clocks left out, and of its bearing records each limb's task, on or off. */
const seenOf = (riser) => { const { transfer, ...record } = riser; return { ...record, time: null, still: null, bear: riser.bear.tasks.map((task) => (task.on ? (task.bearing ? "bears" : "moves") : "off")) }; };
/** `fours`, and its place among the stages. */
const FOURS = RISE.rise[AT_FOURS], LAST = AT_FOURS;
/** No limb of the game's recipe on; and every limb `fours` bears on bearing, the feet off. */
const NONE = RISE.limbs.map(() => "off"), ALL = RISE.limbs.map((limb) => (FOURS.on.some((on) => on.limb === limb.name) ? "bears" : "off"));
/** Where the recipe keeps each shin and each hand, left then right. */
const SHINS = ["shin.left", "shin.right"].map((name) => RISE.limbs.findIndex((limb) => limb.name === name));
const HANDS = ["hand.left", "hand.right"].map((name) => RISE.limbs.findIndex((limb) => limb.name === name));
/** `body` as a mind owns it. */
const ownOf = (built, body) => ({ spec: built.spec, built, muscles: body.muscles, assist: body.assist });
/** The fastest any segment of `built` moves, m/s; of those named `among`, if given. */
const fastest = (built, among = null) => Math.max(...[...built.segments].filter(([name]) => among === null || among.includes(name)).map(([, segment]) => segment.body.linearVelocityToRef(new Vector3()).length()));
/** `model` toppled forward under a riser playing `recipe`. */
const fallen = (model, recipe) => toppled({ model, held: "empty", degrees: 0 }, [(own, view) => stagedRise(own, view, recipe)]);

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

test("how a body lies is read from its pelvis", async () => {
  // Toppled stiff forward and backward, then slack 3 s: on its front, and on its back.
  for (const model of HUMANOID_MODELS) for (const [degrees, lie] of [[0, "front"], [180, "back"]]) {
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
    assert.deepEqual({ ...riser, bear: seenOf(riser).bear }, { phase: "idle", lie: "front", stage: 0, time: 0, still: 0, tries: 0, furthest: -1, lifted: false, raised: false, transfer: new Vector3(), bear: NONE });
    assert.deepEqual(Object.keys(riser.bear), ["tasks", "aim", "helped", "held", "shortfall"]);
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
  } finally { body.dispose(); stand.dispose(); }
});

/**
 * What the pose stages leave of each body fallen on its front, m: the least height of its
 * pelvis's centre of mass and of its upper trunk's at the end of `prop`, and whether every
 * segment of its trunk has been `RAISED` clear of the ground by then
 * (`docs/reference/rising.md#stages`: the readings these stand under).
 */
const PROPPED = {
  "workshop-fighter": { pelvis: 0.35, chest: 0.38, raised: true },
  "workshop-rogue": { pelvis: 0.3, chest: 0.19, raised: false },
  "crypt-skeleton": { pelvis: 0.33, chest: 0.34, raised: true },
};

test("fallen forward, a body draws its knees under and props itself", {
  todo: "the open hand bears on its palm's measured hull, and this support was tuned on the open capsule",
}, async () => {
  for (const model of HUMANOID_MODELS) {
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
      assert.deepEqual(seenOf(riser), { phase: "idle", lie: "front", stage: POSES.rise.length - 1, time: null, still: null, tries: 1, furthest: POSES.rise.length - 1, lifted: false, raised: PROPPED[model].raised, bear: NONE }, model);
      assert.deepEqual([...has], ["staged-rise"], `${model}: from the fall to the last stage's end the riser has it`);
      // Half a second slack, then each stage for its time.
      assert.ok(steps / world.hz > 0.5 + seconds - 0.01 && steps / world.hz < 0.5 + seconds + 0.5, `${model}: the stages ended ${steps / world.hz} s after the riser took it`);
      const up = { pelvis: heightOf(built, "lowerTrunk"), chest: heightOf(built, "upperTrunk") }, bar = PROPPED[model];
      assert.ok(up.pelvis > bar.pelvis && up.chest > bar.chest, `${model}: at the end of prop its pelvis is ${up.pelvis} m up and its chest ${up.chest}, from ${lay.pelvis} and ${lay.chest}`);
      assert.equal(lieOf(body.muscles.dynamics.root.segment), "front", model);
      // Its stages over and still down, it keeps the body, lies slack, and begins another attempt from how it lies then:
      // a body come to rest on a side rolls first.
      world.step();
      assert.deepEqual([body.has, body.view.down, riser.phase, riser.tries, body.muscles.activation.some((level) => level !== 0)], ["staged-rise", true, "settle", 1, false], model);
      for (let i = 0; i < 6 * world.hz && riser.tries < 2; i++) world.step();
      const lies = lieOf(body.muscles.dynamics.root.segment);
      assert.deepEqual([riser.phase, riser.stage, riser.tries, riser.furthest], [lies === "front" ? "rise" : "roll", 0, 2, POSES.rise.length - 1], `${model}, lying ${lies}`);
    } finally { dispose(); }
  }
});

test("a riser that is taken from begins again", {
  todo: "the open hand bears on its palm's measured hull, and this support was tuned on the open capsule",
}, async () => {
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
    assert.deepEqual([body.has, seenOf(riser)], ["taker", { phase: "idle", lie: "front", stage: last, time: null, still: null, tries: 1, furthest: last, lifted: false, raised: true, bear: NONE }]);
    while (body.has === "taker") {
      assert.equal(riser.phase, "idle");
      world.step();
    }
    assert.deepEqual([body.has, body.view.down, { ...seenOf(riser), time: riser.time }], ["staged-rise", true, { phase: "settle", lie: "front", stage: last, time: riser.time, still: null, tries: 0, furthest: -1, lifted: false, raised: false, bear: NONE }],
      "back, it lies slack and counts its attempts from none");
    while (riser.phase !== "idle" && world.steps < 24 * world.hz) world.step();
    assert.deepEqual(seenOf(riser), { phase: "idle", lie: "front", stage: last, time: null, still: null, tries: 1, furthest: last, lifted: false, raised: true, bear: NONE }, "and plays its stages again from the first");
  } finally { dispose(); }
});

/**
 * What `fours` leaves of each body that reaches it: the least height of its pelvis's centre of
 * mass and of its upper trunk's at the step the stage is done, m, and the most the stage takes, s
 * (`docs/reference/rising.md#stages`: the readings these stand under).
 */
const ON_FOURS = {
  "workshop-fighter": { pelvis: 0.42, chest: 0.42, seconds: 2.5 },
  "crypt-skeleton": { pelvis: 0.4, chest: 0.4, seconds: 1.5 },
};
/** The tolerances the player and its limbs read by (`staged.ts`, `limbs.ts`): a limb down, m; the centre of mass at its place, m, and slow, m/s; the pelvis turned, rad. */
const DOWN = 0.03, NEAR = 0.05, SLOW = 0.1, TURNED = 0.15;
const weightOf = (built, world) => [...built.segments.values()].reduce((sum, segment) => sum + segment.rigid.mass, 0) * Math.hypot(...world.physics.gravity);
/** How far forward `root` is pitched from upright, rad: none standing, a quarter turn on its front. */
function pitchOf(root) {
  const forward = new Vector3(0, 0, 1).applyRotationQuaternionToRef(turnOfToRef(root, new Quaternion()), new Vector3());
  return Math.atan2(-forward.y, Math.hypot(forward.x, forward.z));
}
/** Where `stage` holds the centre of mass over `limbs` as last read: the middle of where they are borne on, by its shares. */
const placeOf = (stage, limbs) => stage.on.reduce((at, { limb, share }) => at.addInPlace(limbs.over[RISE.limbs.findIndex(({ name }) => name === limb)].scale(share)), new Vector3());
/** Step `world` until `riser` has left the stage `index` of its rise, 16 s at most; the steps it played of that stage, and the fastest any segment (of `among`, if given) moved, m/s. */
function playedTo(world, built, riser, index, among = null) {
  let played = 0, peak = 0;
  for (let i = 0; i < 16 * world.hz && !(riser.furthest === index && riser.phase !== "rise"); i++) {
    if (riser.phase === "rise" && riser.stage === index) played += 1;
    world.step();
    peak = Math.max(peak, fastest(built, among));
  }
  return { played, peak };
}

test("fallen forward, a body comes to its knees and hands", {
  todo: "the open hand bears on its palm's measured hull, and this support was tuned on the open capsule",
}, async () => {
  for (const [model, bar] of Object.entries(ON_FOURS)) {
    const { world, built, body, dispose } = await fallen(model, TO_FOURS);
    try {
      const riser = riserOf(body), upright = uprightness(built), limbs = riseLimbs(ownOf(built, body), RISE), root = body.muscles.dynamics.root.segment;
      const { played, peak } = playedTo(world, built, riser, LAST);
      // The stage done, the rise is over: its last step's records stand.
      assert.deepEqual(seenOf(riser), { phase: "idle", lie: "front", stage: LAST, time: null, still: null, tries: 1, furthest: LAST, lifted: true, raised: true, bear: ALL }, model);
      assert.ok(played > 0.25 * world.hz && played < bar.seconds * world.hz, `${model}: fours took ${played / world.hz} s`);
      const up = { pelvis: heightOf(built, "lowerTrunk"), chest: heightOf(built, "upperTrunk") };
      assert.ok(up.pelvis > bar.pelvis && up.chest > bar.chest, `${model}: on its knees and hands its pelvis is ${up.pelvis} m up and its chest ${up.chest}`);
      // Every limb is on the ground, and the centre of mass is where the shares put it: a third of the way from the shins to the hands.
      const ground = upright.lowest(), c = body.view.stance.centre;
      limbs.read(ground, false);
      const over = [...SHINS, ...HANDS].map((l) => limbs.limbs[l].work.at.y - ground), place = placeOf(FOURS, limbs), off = Math.hypot(c.x - place.x, c.z - place.z);
      assert.ok(over.every((y) => y < DOWN), `${model}: its limbs are ${over} m over the ground`);
      const shins = (limbs.over[SHINS[0]].z + limbs.over[SHINS[1]].z) / 2, hands = (limbs.over[HANDS[0]].z + limbs.over[HANDS[1]].z) / 2;
      assert.ok(hands - shins > 0.4 && Math.abs(place.z - shins - 0.34 * (hands - shins)) < 1e-9, `${model}: its shins bear at z ${shins}, its hands at ${hands}, and the place is ${place.z}`);
      // A step's motion on from the reading the stage was done by.
      assert.ok(off < NEAR + 0.005, `${model}: its centre of mass is ${off} m from its place`);
      assert.ok(speedOf(body.view.stance.velocity) < SLOW && Math.abs(pitchOf(root) - FOURS.pitch) < TURNED + 0.01,
        `${model}: its centre of mass moves at ${speedOf(body.view.stance.velocity)} m/s, and its pelvis is pitched ${pitchOf(root)} rad`);
      // Its patches give the whole of what is asked of the ground, and nothing else gives any.
      const short = riser.bear.shortfall.force.length() / weightOf(built, world);
      assert.ok(short < 0.05, `${model}: its patches miss ${short} of its weight`);
      assert.deepEqual([body.assist.on, riser.bear.helped.force.asArray(), riser.bear.helped.moment.asArray()], [false, [0, 0, 0], [0, 0, 0]], model);
      assert.ok(peak < 3, `${model}: a segment moved at ${peak} m/s`);
      // Still down, it lies slack and begins again.
      world.step();
      assert.deepEqual([body.has, body.view.down, riser.phase, riser.tries, body.muscles.activation.some((level) => level !== 0)], ["staged-rise", true, "settle", 1, false], model);
    } finally { dispose(); }
  }
  // The Rogue ends `prop` with its hands beside its knees, and does not: the stage is given up at
  // its limit, and the body is not flung. Its feet swing as its shins are drawn down; its trunk
  // stays slow.
  const { world, built, body, dispose } = await fallen("workshop-rogue", TO_FOURS);
  try {
    const riser = riserOf(body), { played, peak } = playedTo(world, built, riser, LAST, RISE.trunk);
    assert.deepEqual([riser.phase, riser.stage, riser.tries, riser.furthest, played], ["settle", LAST, 1, LAST, FOURS.limit * world.hz]);
    assert.ok(peak < 1.5, `the Rogue: its trunk moved at ${peak} m/s`);
  } finally { dispose(); }
});

/** What a human's roll from its back passes through, by the stage each lie is read at the start of; and the skeleton's, which does not turn over. */
const ROLLED = {
  "workshop-fighter": ["back", "back", "back", "back", "right", "front"],
  "workshop-rogue": ["back", "back", "back", "back", "right", "front"],
  "crypt-skeleton": ["back", "back", "back", "back", "back", "back"],
};

test("fallen backward, a body rolls over its right side onto its front, and rises from there", {
  todo: "the open hand bears on its palm's measured hull, and this support was tuned on the open capsule",
}, async () => {
  const names = RISE.roll.back.map((stage) => stage.name);
  assert.deepEqual(names, ["wind", "swing", "over", "flat"]);
  for (const model of HUMANOID_MODELS) {
    const { world, built, body, dispose } = await toppled({ model, held: "empty", degrees: 180 }, [(own, view) => stagedRise(own, view, TO_FOURS)]);
    try {
      const riser = riserOf(body), root = body.muscles.dynamics.root.segment, runs = [], lies = [];
      let peak = 0;
      for (let i = 0; i < 12 * world.hz && riser.tries < 2; i++) {
        // The phase a step is played in is the one it begins with; taking the body, it begins slack.
        const playing = riser.phase === "roll" ? names[riser.stage] : riser.phase === "idle" ? "settle" : riser.phase;
        if (runs.at(-1)?.[0] === playing) runs.at(-1)[1] += 1;
        else {
          runs.push([playing, 1]);
          lies.push(lieOf(root));
        }
        world.step();
        if (riser.phase === "roll") peak = Math.max(peak, fastest(built));
      }
      // Slack until still, each stage of the roll for its time, and slack again.
      assert.deepEqual(runs.map(([playing]) => playing), ["settle", ...names, "settle"], model);
      assert.deepEqual(runs.slice(1, -1).map(([, steps]) => steps), RISE.roll.back.map((stage) => Math.round(stage.seconds * world.hz)), model);
      // How it lay at the start of each: over its right side at the end of `over`, and on its front by the end of `flat`.
      assert.deepEqual(lies, ROLLED[model], model);
      assert.ok(peak < 4.5, `${model}: rolling, a segment moved at ${peak} m/s`);
      if (ROLLED[model].at(-1) !== "front") {
        // Still on its back, it plays the roll again.
        assert.deepEqual(seenOf(riser), { phase: "roll", lie: "back", stage: 0, time: null, still: null, tries: 2, furthest: -1, lifted: false, raised: false, bear: NONE }, model);
        continue;
      }
      assert.deepEqual(seenOf(riser), { phase: "rise", lie: "front", stage: 0, time: null, still: null, tries: 2, furthest: 0, lifted: false, raised: false, bear: NONE }, model);
      const bar = ON_FOURS[model];
      if (!bar) continue;
      // Laid flat, it rises as a body fallen forward does: its pelvis is within 0.3 rad of level, and `fours` is done.
      assert.ok(pitchOf(root) > Math.PI / 2 - 0.3, `${model}: rolled, its pelvis is pitched ${pitchOf(root)} rad`);
      const { played, peak: rising } = playedTo(world, built, riser, LAST);
      assert.deepEqual(seenOf(riser), { phase: "idle", lie: "front", stage: LAST, time: null, still: null, tries: 2, furthest: LAST, lifted: true, raised: true, bear: ALL }, model);
      const up = { pelvis: heightOf(built, "lowerTrunk"), chest: heightOf(built, "upperTrunk") };
      assert.ok(played < bar.seconds * world.hz && up.pelvis > bar.pelvis && up.chest > bar.chest, `${model}: fours took ${played / world.hz} s, and left its pelvis ${up.pelvis} m up and its chest ${up.chest}`);
      assert.ok(rising < 3, `${model}: rising, a segment moved at ${rising} m/s`);
    } finally { dispose(); }
  }
});

test("on a side, a body goes on over that side onto its front", async () => {
  // A side's roll is the back's from where the back's has the body on its side, over the side that is down: the left's is the right's, mirrored.
  assert.deepEqual(RISE.roll.right, RISE.roll.back.slice(2));
  const mirrored = (posture) => Object.fromEntries(Object.entries(posture).map(([name, angle]) => [name.replace(/.(left|right) /, (_, side) => `.${side === "left" ? "right" : "left"} `), angle]));
  assert.deepEqual(RISE.roll.left, RISE.roll.right.map((stage) => ({ ...stage, posture: mirrored(stage.posture) })));
  assert.deepEqual(Object.keys(RISE.roll.right[0].posture).sort(), ["hip.left abduction", "hip.left flexion", "shoulder.right flexion"], "the fixture: the roll's postures are of one side and the other");
  // Two of the battery's shoves that leave a body on a side, under the fighter's mind as the battery has it: it reads the side, rolls, and reads its front.
  for (const [model, held, degrees, side] of [["workshop-fighter", "empty", 45, "right"], ["workshop-rogue", "club", 315, "left"]]) {
    const mind = { kind: "recipe-fighter", subs: [{ kind: "staged-rise" }], guard: "pose", aim: "head", range: "close" };
    const { world, body, dispose } = await felled({ model, held, degrees }, (made, into) => createMind(made, into, mind, { name: "shoved", orders: () => STAND_ORDERS }).body);
    try {
      const riser = riserOf(body), reads = [];
      assert.ok(body.view.down, `${model}, shoved ${degrees} degrees about up, fell`);
      for (let i = 0; i < 10 * world.hz && reads.length < 2; i++) {
        const tries = riser.tries;
        world.step();
        if (riser.tries > tries) reads.push([riser.lie, riser.phase, RISE.roll[side].length]);
      }
      assert.deepEqual(reads, [[side, "roll", 2], ["front", "rise", 2]], `${model}, ${held}, shoved ${degrees} degrees about up`);
    } finally { dispose(); }
  }
});

test("a bearing stage that is not reached is given up at its limit, and the rise begins again", {
  todo: "the open hand bears on its palm's measured hull, and this support was tuned on the open capsule",
}, async () => {
  // Two things the Warrior on its knees and hands does not do: hold its centre of mass at half its standing height, and its pelvis 0.6 rad from upright.
  const lies = [];
  for (const [what, change] of [["height", { height: 0.5 }], ["pitch", { pitch: 0.6 }]]) {
    const stage = { ...FOURS, ...change, limit: 2 };
    const { world, built, body, dispose } = await fallen("workshop-fighter", withStage(TO_FOURS, stage));
    try {
      const riser = riserOf(body), upright = uprightness(built), limbs = riseLimbs(ownOf(built, body), RISE), root = body.muscles.dynamics.root.segment;
      const { played, peak } = playedTo(world, built, riser, LAST);
      assert.deepEqual(seenOf(riser), { phase: "settle", lie: "front", stage: LAST, time: null, still: null, tries: 1, furthest: LAST, lifted: true, raised: false, bear: ALL }, what);
      assert.equal(played, stage.limit * world.hz, `${what}: the stage was played ${played} steps`);
      // What was asked is what is missing: the rest of what the stage is done by holds.
      const ground = upright.lowest(), c = body.view.stance.centre;
      limbs.read(ground, false);
      const place = placeOf(stage, limbs), off = Math.hypot(c.x - place.x, c.z - place.z);
      const low = ground + 0.5 * upright.standing - c.y, turned = Math.abs(pitchOf(root) - stage.pitch);
      if (what === "height") assert.ok(low > 0.1, `its centre of mass is ${low} m under the height asked`);
      else assert.ok(turned > 0.5 && off < NEAR && speedOf(body.view.stance.velocity) < SLOW, `its pelvis is ${turned} rad from the pitch asked, its centre of mass ${off} m from its place at ${speedOf(body.view.stance.velocity)} m/s`);
      assert.ok(peak < 3, `${what}: a segment moved at ${peak} m/s`);
      // Given up, it lies slack until it is still, and reads how it lies again: on its front, it plays the rise from its first stage.
      world.step();
      assert.deepEqual([body.has, riser.phase, body.muscles.activation.some((level) => level !== 0)], ["staged-rise", "settle", false], what);
      for (let i = 0; i < 8 * world.hz && riser.tries < 2; i++) world.step();
      assert.deepEqual([riser.tries, riser.furthest], [2, LAST], what);
      assert.deepEqual([riser.phase, riser.stage], [riser.lie === "front" ? "rise" : "roll", 0], what);
      lies.push(riser.lie);
    } finally { dispose(); }
  }
  // Let go from its knees and hands it lies on its front; from a pitch it could not hold it goes over onto its side, and plays that side's roll.
  assert.deepEqual(lies, ["front", "right"]);
});

test("on its knees and hands, a stage is done only once the body is slow, and only at its height", {
  todo: "the open hand bears on its palm's measured hull, and this support was tuned on the open capsule",
}, async () => {
  const NEXT = TO_FOURS.rise.length;
  /**
   * The Warrior brought to its knees and hands, then under `stage`, with `first(built, world)`
   * called before the stage's first step: how the stage ended, the steps it played, the centre of
   * mass's speed as its first step and its last read it, and at its end how far the centre of
   * mass is from its place across the ground, how far the pelvis from its pitch, and how far the
   * centre of mass is over the height asked.
   */
  const then = async (stage, first) => {
    const recipe = { ...RISE, rise: [...TO_FOURS.rise, stage] };
    const { world, built, body, dispose } = await fallen("workshop-fighter", recipe);
    try {
      const riser = riserOf(body), upright = uprightness(built), limbs = riseLimbs(ownOf(built, body), recipe), root = body.muscles.dynamics.root.segment;
      for (let i = 0; i < 16 * world.hz && !(riser.phase === "rise" && riser.stage === NEXT); i++) world.step();
      assert.deepEqual([riser.phase, riser.stage, riser.time], ["rise", NEXT, 0], stage.name);
      first?.(built);
      let played = 0, entered = null;
      while (riser.phase === "rise" && riser.stage === NEXT && played < 16 * world.hz) {
        world.step();
        played += 1;
        entered ??= speedOf(body.view.stance.velocity);
      }
      const ground = upright.lowest(), c = body.view.stance.centre;
      limbs.read(ground, false);
      const place = placeOf(stage, limbs);
      return {
        phase: riser.phase, played, entered, speed: speedOf(body.view.stance.velocity), off: Math.hypot(c.x - place.x, c.z - place.z),
        turned: Math.abs(pitchOf(root) - stage.pitch), over: stage.height === null ? null : c.y - ground - stage.height * upright.standing,
      };
    } finally { dispose(); }
  };
  // The control: asked what it has just been brought to, it is done at its first step.
  const held = await then({ ...FOURS, name: "hold" });
  assert.deepEqual([held.phase, held.played], ["idle", 1]);
  assert.ok(held.entered < SLOW, `it began the stage at ${held.entered} m/s`);
  // Knocked across at 0.2 m/s as the stage begins, it is where it was and moving: not done until it is slow again.
  const knocked = await then({ ...FOURS, name: "hold" }, (built) => {
    const trunk = built.segments.get("middleTrunk"), mass = [...built.segments.values()].reduce((sum, segment) => sum + segment.rigid.mass, 0);
    trunk.body.applyImpulse(new Vector3(0.2 * mass, 0, 0), centreOfToRef(trunk, new Vector3()));
  });
  assert.ok(knocked.entered > 1.5 * SLOW, `knocked, it began the stage at ${knocked.entered} m/s`);
  assert.deepEqual([knocked.phase, knocked.played > 5], ["idle", true], `knocked, the stage was ${knocked.phase === "idle" ? "done" : "given up"} after ${knocked.played} steps`);
  assert.ok(knocked.speed < SLOW && knocked.off < NEAR + 0.005 && knocked.turned < TURNED + 0.01, `it was done at ${knocked.speed} m/s, ${knocked.off} m from its place, ${knocked.turned} rad from its pitch`);
  // Asked a height its shins do not let it down to, it is over its place, at its pitch and still, and not done.
  const lower = await then({ ...FOURS, name: "lower", height: 0.27, limit: 2 });
  assert.deepEqual([lower.phase, lower.played], ["settle", 2 * 120]);
  assert.ok(lower.over > NEAR && lower.off < NEAR && lower.turned < TURNED && lower.speed < SLOW,
    `it ended ${lower.over} m over the height asked, ${lower.off} m from its place, ${lower.turned} rad from its pitch, at ${lower.speed} m/s`);
});

test("the ground a rise reads is the one its body is on", async () => {
  // A floor 0.7 m over the arena's ground: the Warrior comes to its knees and hands on it as on the ground, and a stage's height is over it.
  const level = 0.7, hold = { ...FOURS, name: "hold", height: 0.33 }, recipe = { ...RISE, rise: [...TO_FOURS.rise, hold] }, bar = ON_FOURS["workshop-fighter"];
  const { world, built, body, dispose } = await toppled({ model: "workshop-fighter", held: "empty", degrees: 0, level }, [(own, view) => stagedRise(own, view, recipe)]);
  try {
    const riser = riserOf(body), upright = uprightness(built), limbs = riseLimbs(ownOf(built, body), recipe);
    assert.ok(body.view.down && Math.abs(upright.lowest() - level) < 5e-3, `fallen, its lowest point is at ${upright.lowest()} m`);
    const { played, peak } = playedTo(world, built, riser, LAST + 1);
    assert.deepEqual(seenOf(riser), { phase: "idle", lie: "front", stage: LAST + 1, time: null, still: null, tries: 1, furthest: LAST + 1, lifted: true, raised: true, bear: ALL });
    assert.ok(played >= 1 && peak < 3, `the stage after fours took ${played} steps, and a segment moved at ${peak} m/s`);
    const ground = upright.lowest(), c = body.view.stance.centre;
    limbs.read(ground, false);
    const over = [...SHINS, ...HANDS].map((l) => limbs.limbs[l].work.at.y - ground), up = { pelvis: heightOf(built, "lowerTrunk") - level, chest: heightOf(built, "upperTrunk") - level };
    assert.ok(Math.abs(ground - level) < 5e-3 && over.every((y) => y < DOWN), `its lowest point is at ${ground} m, and its limbs ${over} m over it`);
    assert.ok(up.pelvis > bar.pelvis && up.chest > bar.chest, `over the floor its pelvis is ${up.pelvis} m up and its chest ${up.chest}`);
    assert.ok(Math.abs(c.y - level - hold.height * upright.standing) < NEAR, `its centre of mass is ${c.y - level} m over the floor, asked ${hold.height * upright.standing}`);
  } finally { dispose(); }
});

test("a limb that is off the ground bears nothing, and a stage that bears on it is not done", async () => {
  // Prone with its feet pointed (`fold`), a body's knees are off the ground. Asked to bear on its
  // shins there, in the posture it has and at the pitch it lies at (1.30 to 1.42 rad), nothing else is missing.
  const fold = RISE.rise[0];
  const kneel = { ...FOURS, name: "kneel", on: ["left", "right"].map((side) => ({ limb: `shin.${side}`, share: 0.5 })), pitch: 1.35, posture: fold.posture, limit: 2 };
  const recipe = { ...RISE, rise: [fold, kneel] };
  for (const model of HUMANOID_MODELS) {
    const { world, built, body, dispose } = await fallen(model, recipe);
    try {
      const riser = riserOf(body), upright = uprightness(built), limbs = riseLimbs(ownOf(built, body), recipe), root = body.muscles.dynamics.root.segment;
      const bore = new Set();
      let played = 0, least = Infinity;
      for (let i = 0; i < 16 * world.hz && !(riser.furthest === 1 && riser.phase !== "rise"); i++) {
        world.step();
        if (riser.phase !== "rise" || riser.stage !== 1 || riser.time === 0) continue;
        played += 1;
        bore.add(JSON.stringify(seenOf(riser).bear));
        const ground = upright.lowest();
        limbs.read(ground, false);
        least = Math.min(least, ...SHINS.map((l) => limbs.limbs[l].work.at.y - ground));
      }
      // The step it is given up is the stage's last: one short of its limit is seen in it.
      assert.deepEqual([riser.phase, riser.furthest, played], ["settle", 1, kneel.limit * world.hz - 1], model);
      // The shins are brought down, and bear nothing; no other limb is on.
      assert.deepEqual([...bore], [JSON.stringify(RISE.limbs.map((limb) => (limb.kind === "propped" ? "moves" : "off")))], `${model}: no limb bore`);
      assert.ok(least > DOWN, `${model}: its knees came within ${least} m of the ground`);
      const turned = Math.abs(pitchOf(root) - kneel.pitch), speed = speedOf(body.view.stance.velocity);
      assert.ok(turned < TURNED && speed < SLOW, `${model}: its pelvis is ${turned} rad from the pitch asked, and its centre of mass moves at ${speed} m/s`);
    } finally { dispose(); }
  }
});

/**
 * The runs of steps `stage` is played in, each as whether the left limbs are let go, what each limb does, and how many
 * steps; and how the stage ended, with whether its left limbs were let go by then and what each limb did last.
 */
async function runsOf(stage, model = "workshop-fighter") {
  const { world, body, dispose } = await fallen(model, { ...RISE, rise: [...TO_FOURS.rise, stage] });
  try {
    const riser = riserOf(body), runs = [];
    for (let i = 0; i < 16 * world.hz && !(riser.furthest === LAST + 1 && riser.phase !== "rise"); i++) {
      world.step();
      if (riser.phase !== "rise" || riser.stage !== LAST + 1 || riser.time === 0) continue;
      const key = JSON.stringify([riser.lifted, seenOf(riser).bear]);
      if (runs.at(-1)?.[0] === key) runs.at(-1)[1] += 1;
      else runs.push([key, 1]);
    }
    return { runs: runs.map(([key, steps]) => [...JSON.parse(key), steps]), phase: riser.phase, lifted: riser.lifted, bear: seenOf(riser).bear, steps: stage.limit * world.hz - 1, hz: world.hz };
  } finally { dispose(); }
}

test("a limb a stage leaves bears until the centre of mass is over the others", {
  todo: "the open hand bears on its palm's measured hull, and this support was tuned on the open capsule",
}, async () => {
  // After `fours`: a stage that leaves the right shin, and one that leaves both hands.
  const step = { ...FOURS, name: "step", on: [{ limb: "shin.left", share: 0.8 }, { limb: "hand.left", share: 0.1 }, { limb: "hand.right", share: 0.1 }], leave: ["shin.right"], limit: 2 };
  const kneel = { ...FOURS, name: "kneel", on: ["left", "right"].map((side) => ({ limb: `shin.${side}`, share: 0.5 })), leave: ["hand.left", "hand.right"], pitch: 0.5, limit: 2 };
  // The body is nearly over its left shin and its hands already: the right shin bears a third of a second, and is let go for the rest of the stage.
  const stepped = await runsOf(step), free = ALL.map((bears, l) => (RISE.limbs[l].name === "shin.right" ? "off" : bears));
  assert.deepEqual(stepped.runs.map(([lifted, bear]) => [lifted, bear]), [[false, ALL], [true, free]]);
  assert.ok(stepped.runs[0][2] > 0.1 * stepped.hz && stepped.runs[0][2] < 0.5 * stepped.hz, `the right shin bore ${stepped.runs[0][2]} steps`);
  assert.deepEqual([stepped.phase, stepped.runs[0][2] + stepped.runs[1][2]], ["settle", stepped.steps]);
  // The control: its arms straight, the body cannot come over its shins, and its hands bear to the stage's last step.
  const knelt = await runsOf(kneel);
  assert.deepEqual([knelt.phase, knelt.runs], ["settle", [[false, ALL, knelt.steps]]]);
  // The control: a stage that leaves nothing has nothing to let go. The skeleton's knees and hands with its shins bearing
  // three quarters and its trunk pitched steeply hold it nearer its knees than the outline drawn in, and the stage is done there.
  const near = { ...FOURS, pitch: 1.4, on: FOURS.on.map(({ limb }) => ({ limb, share: limb.startsWith("shin") ? 0.38 : 0.12 })) };
  const { world, built, body, dispose } = await fallen("crypt-skeleton", { ...RISE, rise: [...TO_FOURS.rise.slice(0, -1), near] });
  try {
    const riser = riserOf(body), { played } = playedTo(world, built, riser, LAST);
    assert.deepEqual([riser.phase, riser.lifted, seenOf(riser).bear, played < near.limit * world.hz - 1], ["idle", false, ALL, true]);
  } finally { dispose(); }
});

test("a hand a stage leaves bears until the centre of mass is over the other three limbs", {
  todo: "the open hand bears on its palm's measured hull, and this support was tuned on the open capsule",
}, async () => {
  // A stage that leaves the left hand, its trunk pitched less: the body comes over its other three limbs slowly, and the
  // hand bears more than a second and a half before it is let go.
  const hand = { ...FOURS, name: "hand", pitch: 0.9, on: [{ limb: "shin.left", share: 0.4 }, { limb: "shin.right", share: 0.4 }, { limb: "hand.right", share: 0.2 }], leave: ["hand.left"], limit: 3 };
  const handed = await runsOf(hand), handFree = ALL.map((bears, l) => (RISE.limbs[l].name === "hand.left" ? "off" : bears));
  assert.deepEqual(handed.runs.map(([lifted, bear]) => [lifted, bear]), [[false, ALL], [true, handFree]]);
  assert.ok(handed.runs[0][2] > 1.5 * handed.hz && handed.runs[0][2] < handed.steps, `the left hand bore ${handed.runs[0][2]} steps`);
  assert.deepEqual([handed.phase, handed.runs[0][2] + handed.runs[1][2]], ["settle", handed.steps]);
});

test("a shin bears from its knee to where its foot stands, and a hand where it touches the ground", async () => {
  const xyz = (v) => v.asArray(), near = (a, b, within) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < within;
  /** A capsule segment's two ends' lowest points, world: `first` is the end nearer the joint `joint`'s centre as built. */
  const endsOf = (built, name, joint) => {
    const segment = built.segments.get(name), shape = segment.spec.shape, centre = built.spec.joints.find((j) => j.name === joint).centre.value;
    const away = (p) => Math.hypot(p[0] - centre[0], p[1] - centre[1], p[2] - centre[2]);
    const [first, second] = [shape.from.value, shape.to.value].sort((a, b) => away(a) - away(b)).map((p) => pointOfToRef(segment, p, new Vector3()).subtractFromFloats(0, shape.radius.value, 0));
    return { first, second };
  };
  /**
   * A hand's point by the rule: on its open hull, the middle of its corners within `DOWN` of the ground, else its lowest.
   * `near` and `far` say whether a corner down lies in the half of the hand towards its wrist, and in the half beyond.
   */
  const handPoint = (built, side, ground) => {
    const segment = built.segments.get(`hand.${side}`), shape = segment.rigid.shapes[0];
    assert.equal(shape.kind, "hull", `${side}: its hand is open`);
    const world = (p) => pointOfToRef(segment, p, new Vector3()), wrist = world(segment.spec.proximal.value), axis = world(segment.spec.distal.value).subtract(wrist);
    const corners = shape.points.map((p) => world(p.value)), down = corners.filter((c) => c.y - ground < DOWN);
    const along = (c) => Vector3.Dot(c.subtract(wrist), axis) / axis.lengthSquared();
    const at = down.length ? down.reduce((sum, c) => sum.add(c), new Vector3()).scale(1 / down.length) : corners.reduce((low, c) => (c.y < low.y ? c : low));
    return { at, near: down.some((c) => along(c) < 0.5), far: down.some((c) => along(c) >= 0.5) };
  };
  // Its toes tucked under, a body kneels on its feet; pointed, its feet are off the ground.
  const POINTED = { ...TO_FOURS, rise: TO_FOURS.rise.map((stage) => (stage.name === "prop" || stage.name === "fours"
    ? { ...stage, posture: Object.fromEntries(Object.entries(stage.posture).map(([channel, angle]) => [channel, channel.startsWith("ankle") ? -0.6 : angle])) } : stage)) };
  for (const [model, recipe, propped] of [["workshop-fighter", TO_FOURS, true], ["workshop-fighter", POINTED, false]]) {
    const { world, built, body, dispose } = await fallen(model, recipe);
    try {
      const riser = riserOf(body), limbs = riseLimbs(ownOf(built, body), RISE), ground = uprightness(built).lowest();
      // Toppled stiff, its arms at its sides: each hand lies on the ground to its fingers.
      limbs.read(ground, false);
      for (const [l, side] of [[HANDS[0], "left"], [HANDS[1], "right"]]) {
        const point = handPoint(built, side, ground);
        assert.ok(point.far, `${model}: lying, its ${side} hand is down beyond its middle`);
        assert.ok(Vector3.Distance(limbs.limbs[l].work.at, point.at) < 1e-12 && Vector3.Distance(limbs.over[l], point.at) < 1e-12, `${model}, lying, ${side}`);
        assert.equal(limbs.limbs[l].work.patch.kind, "point", `${model}, lying, ${side}`);
      }
      playedTo(world, built, riser, LAST);
      assert.equal(riser.phase, "idle", `${model} came to its knees and hands`);
      const level = uprightness(built).lowest(), feet = footStatesOf(built);
      readSupport(feet, feet, new Vector3());
      limbs.read(level, false);
      for (const [l, side] of [[SHINS[0], "left"], [SHINS[1], "right"]]) {
        const limb = limbs.limbs[l], knee = endsOf(built, `shank.${side}`, `knee.${side}`).first;
        const down = feet.find((foot) => foot.side === side).corners.filter((corner) => corner.y - level < DOWN);
        assert.equal(down.length > 0, propped, `${model}: ${down.length} corners of its ${side} sole are on the ground`);
        // The task: the point's three rows and the shank's tilt's, about the level line across it.
        assert.equal(limb.work.rows.length, 4, `${model}, ${side}`);
        if (!propped) {
          // No corner of its sole is down: the shin bears at its knee alone.
          assert.deepEqual([limb.work.patch.kind, xyz(limb.work.at), xyz(limbs.over[l])], ["point", xyz(knee), xyz(knee)], `${model}, ${side}`);
          continue;
        }
        const stands = down.reduce((sum, corner) => sum.addInPlace(corner), new Vector3()).scaleInPlace(1 / down.length);
        const span = Math.hypot(stands.x - knee.x, stands.z - knee.z), middle = knee.add(stands).scale(0.5), patch = limb.work.patch;
        assert.ok(span > 0.3, `${model}: its ${side} foot stands ${span} m from its knee`);
        assert.deepEqual([patch.kind, patch.width, xyz(limb.work.at), xyz(limbs.over[l])], ["sole", 0, xyz(patch.middle), xyz(patch.middle)], `${model}, ${side}`);
        assert.ok(near(patch.middle, middle, 1e-9) && Math.abs(patch.length - (1 - SOLE_MARGIN) * span / 2) < 1e-12
          && near(patch.along, new Vector3((stands.x - knee.x) / span, 0, (stands.z - knee.z) / span), 1e-9),
        `${model}: its ${side} shin's patch is ${patch.length} m either way of (${xyz(patch.middle)}) along (${xyz(patch.along)}); its knee is at (${xyz(knee)}) and its foot stands at (${xyz(stands)})`);
        assert.deepEqual(limb.work.rows[3], [[0, patch.along.z], [2, -patch.along.x]], `${model}, ${side}`);
      }
      // On its knees and hands, each hand lies on its palm, either side of its middle.
      for (const [l, side] of [[HANDS[0], "left"], [HANDS[1], "right"]]) {
        const point = handPoint(built, side, level);
        assert.deepEqual([point.near, point.far], [true, true], `${model}: on its hands, its ${side} hand lies flat`);
        assert.ok(Vector3.Distance(limbs.limbs[l].work.at, point.at) < 1e-12 && Vector3.Distance(limbs.over[l], point.at) < 1e-12, `${model}, ${side}`);
        assert.deepEqual([limbs.limbs[l].work.patch.kind, limbs.limbs[l].work.rows.length], ["point", 3], `${model}, ${side}`);
      }
      // Down, each bears as it is asked: its task on, its share kept.
      const goal = new Float64Array(body.muscles.channels.length);
      for (const l of [...SHINS, ...HANDS]) {
        const limb = limbs.limbs[l];
        assert.deepEqual([limbs.bear(l, goal, 2.5, level, 0.25 + l), limb.task.on, limb.task.bearing, limb.work.share], [true, true, true, 0.25 + l], `${model}, ${RISE.limbs[l].name}`);
        limbs.rest(l);
        assert.deepEqual([limb.task.on, limb.task.bearing], [false, false]);
      }
    } finally { dispose(); }
  }
  // Standing, no shin or hand is down, and none bears: each is brought down; each foot is down on its sole, and bears there.
  const stand = await coreStand(modelSpec("workshop-fighter"));
  const body = createBody(stand.built, stand.world, { servoSeconds: SERVO_SECONDS });
  try {
    const limbs = riseLimbs(ownOf(stand.built, body), RISE), goal = new Float64Array(body.muscles.channels.length), feet = footStatesOf(stand.built);
    readSupport(feet, feet, new Vector3());
    limbs.read(0, false);
    limbs.limbs.forEach((limb, l) => {
      const spec = RISE.limbs[l];
      if (spec.kind === "foot") {
        const foot = feet.find((other) => other.segment.spec.name === spec.segment);
        assert.deepEqual([xyz(limb.work.at), limbs.bear(l, goal, 2.5, 0, 0.25), limb.task.on, limb.task.bearing, limb.work.rows], [xyz(foot.middle), true, true, true, null], spec.name);
        return;
      }
      assert.ok(limb.work.at.y > 0.15, `standing, ${spec.name} is ${limb.work.at.y} m up`);
      assert.deepEqual([limbs.bear(l, goal, 2.5, 0, 0.25), limb.task.on, limb.task.bearing], [false, true, false], spec.name);
    });
  } finally { body.dispose(); stand.dispose(); }
});

test("what is a foot's own is its reference pose's, however the body lies when its feet are made", async () => {
  const own = (feet) => feet.map((foot) => ({ ahead: foot.ahead, flat: foot.flat, width: foot.width, reach: foot.reach, sole: foot.sole.map((corner) => corner.asArray()) }));
  for (const model of HUMANOID_MODELS) {
    const stand = await coreStand(modelSpec(model)), { built, dispose } = await fallen(model, POSES);
    try {
      const standing = footStatesOf(stand.built), lying = footStatesOf(built);
      assert.deepEqual(own(lying), own(standing), model);
      // The front edge's two corners are the two ahead of the ankle, and flat the heel is level with them.
      for (const foot of standing) {
        assert.ok(foot.heel < 1e-9 && Math.abs(foot.flat) < 1e-9, `${model}: standing, its ${foot.side} heel is ${foot.heel} m over its front edge, and flat ${foot.flat}`);
        const z = foot.ahead.map((k) => foot.corners[k].z);
        assert.ok(Math.min(z[0], z[1]) > Math.max(z[2], z[3]) + 0.1, `${model}: its ${foot.side} sole's corners in order ahead are at z ${z}`);
      }
      // On its front the foot is on its toes or its top, and reads so.
      assert.ok(lying.every((foot) => Math.abs(foot.heel) > 0.02), `${model}: lying, its heels are ${lying.map((foot) => foot.heel)} m over its front edges`);
    } finally { stand.dispose(); dispose(); }
  }
});

test("a hand on its palm hull bears at the middle of its corners that are down, else at its lowest, and in its grip on its capsule", async () => {
  const stand = await coreStand(modelSpec("workshop-fighter"), { gravity: false, ground: false });
  const body = createBody(stand.built, stand.world, { servoSeconds: SERVO_SECONDS });
  const xyz = (v) => v.asArray(), far = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  try {
    const limbs = riseLimbs(ownOf(stand.built, body), RISE);
    for (const [l, side] of [[HANDS[0], "left"], [HANDS[1], "right"]]) {
      const segment = stand.built.segments.get(`hand.${side}`), limb = limbs.limbs[l];
      assert.equal(limb.reach, segment.spec.shape.radius.value, `${side}: its reach is its own capsule's radius`);
      const corners = segment.spec.handPoses.open.points.map((p) => pointOfToRef(segment, p.value, new Vector3()));
      const lowest = corners.reduce((low, corner) => (corner.y < low.y ? corner : low));
      // The ground a metre under it: no corner is down, and the hand bears at its lowest.
      limbs.read(lowest.y - 1, false);
      assert.deepEqual(xyz(limb.work.at), xyz(lowest), `${side}, none down`);
      // A centimetre under it: the corners within DOWN of the ground, some and not all, at their middle.
      const ground = lowest.y - 0.01, down = corners.filter((corner) => corner.y - ground < DOWN);
      assert.ok(down.length > 1 && down.length < corners.length, `${side}: ${down.length} of ${corners.length} corners down`);
      const middle = down.reduce((sum, corner) => sum.add(corner), new Vector3()).scale(1 / down.length);
      limbs.read(ground, false);
      assert.ok(far(limb.work.at, middle) < 1e-12, `${side}: bears at (${xyz(limb.work.at)}), its down corners' middle (${xyz(middle)})`);
    }
    // In its grip, a capsule: under its lower end's centre, a radius down.
    stand.built.handPoses.request([{ hand: "left", pose: "grip" }, { hand: "right", pose: "grip" }]);
    stand.step();
    for (const [l, side] of [[HANDS[0], "left"], [HANDS[1], "right"]]) {
      const segment = stand.built.segments.get(`hand.${side}`), grip = segment.spec.handPoses.grip;
      assert.equal(segment.handPose.applied, "grip");
      const ends = [grip.from, grip.to].map((p) => pointOfToRef(segment, p.value, new Vector3()).subtractFromFloats(0, grip.radius.value, 0));
      const lower = ends[0].y <= ends[1].y ? ends[0] : ends[1];
      limbs.read(lower.y - 1, false);
      assert.ok(far(limbs.limbs[l].work.at, lower) < 1e-12, `${side}, in its grip: bears at (${xyz(limbs.limbs[l].work.at)}), its capsule's lower end (${xyz(lower)})`);
    }
  } finally { body.dispose(); stand.dispose(); }
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
