/**
 * **How the staged rise goes** (`stagedRise`, `src/core/mind/rise/staged.ts`), measured on the Node
 * core world on the arena's ground, or a floor over it (`research/core-rise-trials.mjs`), Rapier,
 * 120 Hz, no assist, and not a gate (`tests/experimental.json`): fallen forward, each body draws its
 * knees under and props itself, and a riser taken from begins again; it comes to its knees and hands
 * within the heights and times the readings stand under (`docs/reference/rising.md#stages`); fallen
 * backward, a human rolls over its right side onto its front and rises from there; left on a side by
 * the battery's shoves, it goes on over that side; a bearing stage not reached is given up at its
 * limit, and one on its knees and hands is done only once the body is slow and at its height; on a
 * floor it rises as on the ground; its knees kept off the ground, a stage on its shins is given up;
 * and a limb a stage leaves bears until the centre of mass is over the others. What any rise holds
 * is `core-rise.test.mjs`'s.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { uprightness } from "../src/core/control/ground.ts";
import { centreOfToRef } from "../src/core/control/support.ts";
import { HUMANOID_MODELS } from "../src/core/models.ts";
import { createMind } from "../src/core/mind/minds.ts";
import { STAND_ORDERS } from "../src/core/mind/orders.ts";
import { riseLimbs } from "../src/core/mind/rise/limbs.ts";
import { lieOf, stagedRise } from "../src/core/mind/rise/staged.ts";
import { RISE } from "../src/core/mind/rise/stages.ts";
import { CLASSIC } from "../src/core/mind/config.ts";
import { felled, riserOf, toppled } from "../research/core-rise-trials.mjs";
import { ALL, DOWN, FOURS, HANDS, LAST, NEAR, NONE, ownOf, placeOf, pitchOf, playedTo, POSES, runsOf, seenOf, SHINS, SLOW, speedOf, TO_FOURS, TURNED, weightOf, withStage, fallen, fastest, heightOf } from "./fixtures/core-rise.mjs";

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

test("fallen forward, a body draws its knees under and props itself", async () => {
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

test("fallen forward, a body comes to its knees and hands", async () => {
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

test("fallen backward, a body rolls over its right side onto its front, and rises from there", async () => {
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
  // Two of the battery's sixteen shoves (1.5 N s/kg) that leave a body on a side, under Classic rising by "Rise, then steady": it
  // reads the side, rolls, and reads its front. Shoved backward the empty-handed Warrior comes to rest on its left; the Warrior with
  // the club, shoved to its right and back, on its right.
  for (const [model, held, degrees, side, impulse] of [["workshop-fighter", "empty", 180, "left", 1.5], ["workshop-fighter", "club", 112.5, "right", 1.5]]) {
    const mind = { ...CLASSIC, subs: [{ kind: "support-recovery" }] };
    const { world, body, dispose } = await felled({ model, held, degrees, impulse }, (made, into) => createMind(made, into, mind, { name: "shoved", orders: () => STAND_ORDERS }).body);
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

test("a bearing stage that is not reached is given up at its limit, and the rise begins again", async () => {
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

test("on its knees and hands, a stage is done only once the body is slow, and only at its height", async () => {
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

test("a limb a stage leaves bears until the centre of mass is over the others", async () => {
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

test("a hand a stage leaves bears until the centre of mass is over the other three limbs", async () => {
  // A stage that leaves the left hand, its trunk pitched less: the body comes over its other three limbs slowly, and the
  // hand bears more than a second and a half before it is let go.
  const hand = { ...FOURS, name: "hand", pitch: 0.9, on: [{ limb: "shin.left", share: 0.4 }, { limb: "shin.right", share: 0.4 }, { limb: "hand.right", share: 0.2 }], leave: ["hand.left"], limit: 3 };
  const handed = await runsOf(hand), handFree = ALL.map((bears, l) => (RISE.limbs[l].name === "hand.left" ? "off" : bears));
  assert.deepEqual(handed.runs.map(([lifted, bear]) => [lifted, bear]), [[false, ALL], [true, handFree]]);
  assert.ok(handed.runs[0][2] > 1.5 * handed.hz && handed.runs[0][2] < handed.steps, `the left hand bore ${handed.runs[0][2]} steps`);
  assert.deepEqual([handed.phase, handed.runs[0][2] + handed.runs[1][2]], ["settle", handed.steps]);
});
