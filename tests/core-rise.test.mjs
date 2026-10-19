/**
 * **Rising by stages** (`stagedRise`, `src/core/mind/rise/staged.ts`): how a body lies, the wait until
 * it is still, the ground a rise reads, what a bearing stage is done by, and what its limbs bear on.
 * Node, core world on the arena's ground, or a floor over it (`research/core-rise-trials.mjs`), Rapier,
 * 120 Hz; no assist. The recipe's own rules are `core-rise-recipe.test.mjs`'s, and how far a rise gets
 * `core-rise-capability.test.mjs`'s.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { createBody, SERVO_SECONDS } from "../src/core/body.ts";
import { uprightness } from "../src/core/control/ground.ts";
import { SOLE_MARGIN } from "../src/core/control/stance-tuning.ts";
import { centreOfToRef, footStatesOf, pointOfToRef, readSupport } from "../src/core/control/support.ts";
import { HUMANOID_MODELS, modelSpec } from "../src/core/models.ts";
import { lying } from "../src/core/mind/lie.ts";
import { embody } from "../src/core/mind/mind.ts";
import { riseLimbs } from "../src/core/mind/rise/limbs.ts";
import { lieOf, stagedRise } from "../src/core/mind/rise/staged.ts";
import { RISE } from "../src/core/mind/rise/stages.ts";
import { felled, riserOf, toppled } from "../research/core-rise-trials.mjs";
import { coreStand } from "./harness/core-stand.mjs";
import { FOURS as ON_ALL_FOURS } from "./fixtures/fours-support.mjs";
import { DOWN, FOURS, HANDS, NONE, ownOf, POSES, seenOf, SHINS, speedOf, TO_FOURS, fallen, heightOf } from "./fixtures/core-rise.mjs";

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
    assert.deepEqual({ ...seenOf(riser), time: riser.time, still: riser.still, transfer: riser.transfer }, { phase: "idle", lie: "front", stage: 0, time: 0, still: 0, tries: 0, furthest: -1, lifted: false, raised: false, transfer: new Vector3(), bear: NONE });
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

/** How much higher than `ON_ALL_FOURS` places it the Warrior is built, m: as placed, its lowest point is 0.109 m under the ground, and built this much higher it drops onto its limbs. */
const PLACED_LIFT = 0.11;
/**
 * The Warrior built on its knees and hands (`ON_ALL_FOURS`) on a floor `level` m up, its ankles at
 * `ankle` rad and its wrists bent back as `fours` bends them, so that its hands lie on their palms,
 * its muscles holding the pose it was built in until it is handed to `recipe`'s riser
 * (`mind.on`), which reads its centre of mass as `centre` and `velocity` hold it; each step the
 * riser plays, the ground it reads is kept in `grounds`.
 */
async function placed({ level = 0, ankle = ON_ALL_FOURS.joints["ankle.left"][0], recipe = RISE } = {}) {
  const spec = modelSpec("workshop-fighter"), joints = { ...ON_ALL_FOURS.joints, "ankle.left": [ankle, 0], "ankle.right": [ankle, 0], "wrist.left": [-0.8, 0, 0], "wrist.right": [-0.8, 0, 0] };
  const [x, y, z] = ON_ALL_FOURS.position;
  const stand = await coreStand(spec, { ...ON_ALL_FOURS, joints, position: [x, y + level + PLACED_LIFT, z] });
  if (level > 0) stand.world.physics.addFixedBox([0, level / 2, 0], [8, level, 8]);
  const parts = [...stand.built.segments.values()], mass = parts.reduce((sum, part) => sum + part.rigid.mass, 0);
  const upright = uprightness(stand.built), centre = new Vector3(), velocity = new Vector3(), work = new Vector3(), grounds = [];
  const read = () => {
    centre.setAll(0); velocity.setAll(0);
    for (const part of parts) {
      centre.addInPlace(centreOfToRef(part, work).scaleInPlace(part.rigid.mass / mass));
      velocity.addInPlace(part.body.linearVelocityToRef(work).scaleInPlace(part.rigid.mass / mass));
    }
  };
  let goal = null;
  const body = embody(stand.built, stand.world, (own) => {
    const riser = stagedRise(own, { get down() { return upright.down(); }, stance: { centre, velocity } }, recipe), muscles = own.muscles;
    return {
      name: "placed", state: riser.state, riser, on: false,
      step(senses, dt) {
        read();
        if (this.on) { grounds.push(upright.lowest()); riser.step(senses, dt); return; }
        goal ??= Float64Array.from(muscles.channels, (_, i) => muscles.angle(i));
        muscles.activation.fill(1);
        for (let i = 0; i < muscles.velocity.length; i++) muscles.velocity[i] = Math.max(-3, Math.min(3, (goal[i] - muscles.angle(i)) / 0.2));
      },
    };
  });
  return { stand, body, upright, centre, velocity, grounds, dispose() { body.dispose(); stand.dispose(); } };
}

test("the ground a rise reads is the one its body is on: a stage's height is over the floor it is on", async () => {
  // On its knees and hands on a floor 0.7 m over the arena's ground, handed to a stage that holds its centre of mass a third of its standing height up.
  const level = 0.7, hold = { ...FOURS, name: "hold", height: 0.33 }, f = await placed({ level, recipe: { ...RISE, rise: [hold] } });
  try {
    const mind = f.body.mind;
    for (let i = 0; i < f.stand.seconds(2) && !mind.on; i++) {
      f.stand.step();
      try { mind.riser.beginSupported(); mind.on = true; } catch { /* Its knees and hands do not all bear yet. */ }
    }
    assert.ok(mind.on, "the fixture did not reach its case: its knees and hands never bore on the floor together");
    const limbs = riseLimbs(f.body.own, RISE), ground = f.upright.lowest();
    limbs.read(ground, false);
    const over = [...SHINS, ...HANDS].map((l) => limbs.limbs[l].work.at.y - ground);
    assert.ok(Math.abs(ground - level) < 5e-3 && over.every((y) => y < DOWN), `its lowest point is at ${ground} m, and its limbs ${over} m over it`);
    // The stage's first step: the height it aims the centre of mass at, from the aim it critically damps toward it.
    f.stand.step();
    const n = 1 / hold.seconds, c = f.centre, v = f.velocity, aim = mind.riser.state.bear.aim.centre;
    const target = c.y + (aim.y + 2 * n * v.y) / (n * n), asked = level + hold.height * f.upright.standing;
    assert.deepEqual([mind.riser.state.phase, mind.riser.state.stage], ["rise", 0]);
    assert.ok(Math.abs(target - asked) < 5e-3, `it aims its centre of mass ${target} m up, asked ${asked} over the floor`);
    // Whatever the stage does, the ground it reads is the floor, which a body bearing on it sinks into by millimetres.
    f.stand.step(f.stand.seconds(0.5));
    assert.ok(f.grounds.every((g) => Math.abs(g - level) < 0.01), `it read the ground at ${Math.min(...f.grounds)} to ${Math.max(...f.grounds)} m`);
  } finally { f.dispose(); }
});

test("a limb that is off the ground does not bear, and a stage is done only with every limb it bears on bearing", async () => {
  // Prone with its feet pointed (`fold`), a body's knees are off the ground: asked to bear on its shins there, each step a shin
  // is read more than `DOWN` over the ground it is moved and does not bear.
  const fold = RISE.rise[0];
  const kneel = { ...FOURS, name: "kneel", on: ["left", "right"].map((side) => ({ limb: `shin.${side}`, share: 0.5 })), pitch: 1.35, posture: fold.posture, limit: 2 };
  const recipe = { ...RISE, rise: [fold, kneel] };
  let off = 0;
  for (const model of HUMANOID_MODELS) {
    const { world, built, body, dispose } = await fallen(model, recipe);
    try {
      const riser = riserOf(body), upright = uprightness(built), limbs = riseLimbs(ownOf(built, body), recipe);
      for (let i = 0; i < 16 * world.hz && !(riser.furthest === 1 && riser.phase !== "rise"); i++) {
        // What the riser reads at the step's start is what the body is as the step before left it.
        const playing = riser.phase === "rise" && riser.stage === 1, ground = upright.lowest();
        limbs.read(ground, false);
        const over = SHINS.map((l) => limbs.limbs[l].work.at.y - ground);
        world.step();
        if (!playing) continue;
        const bear = seenOf(riser).bear;
        SHINS.forEach((l, k) => {
          if (over[k] < DOWN) return;
          off += 1;
          assert.equal(bear[l], "moves", `${model}: its ${RISE.limbs[l].name} ${over[k]} m over the ground`);
        });
        if (riser.phase === "idle") assert.deepEqual(SHINS.map((l) => bear[l]), ["bears", "bears"], `${model}: the stage was done`);
      }
    } finally { dispose(); }
  }
  assert.ok(off > 0, "the fixture did not reach its case: no shin was off the ground as the stage was played");
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
  // Toppled stiff, its arms at its sides: each hand lies on the ground to its fingers.
  {
    const model = "workshop-fighter", { built, body, dispose } = await fallen(model, TO_FOURS);
    try {
      const limbs = riseLimbs(ownOf(built, body), RISE), ground = uprightness(built).lowest();
      limbs.read(ground, false);
      for (const [l, side] of [[HANDS[0], "left"], [HANDS[1], "right"]]) {
        const point = handPoint(built, side, ground);
        assert.ok(point.far, `${model}: lying, its ${side} hand is down beyond its middle`);
        assert.ok(Vector3.Distance(limbs.limbs[l].work.at, point.at) < 1e-12 && Vector3.Distance(limbs.over[l], point.at) < 1e-12, `${model}, lying, ${side}`);
        assert.equal(limbs.limbs[l].work.patch.kind, "point", `${model}, lying, ${side}`);
      }
    } finally { dispose(); }
  }
  // Built on its knees and hands and held there, its toes tucked under, a body kneels on its feet; pointed, its feet are off
  // the ground. Each shin is read by whether its own sole is down.
  for (const [ankle, propped] of [[ON_ALL_FOURS.joints["ankle.left"][0], true], [-0.6, false]]) {
    const f = await placed({ ankle }), built = f.stand.built, model = `the Warrior, its ankles at ${ankle} rad`;
    try {
      f.stand.step(f.stand.seconds(1));
      const limbs = riseLimbs(f.body.own, RISE), level = uprightness(built).lowest(), feet = footStatesOf(built);
      readSupport(feet, feet, new Vector3());
      limbs.read(level, false);
      const down = [...SHINS, ...HANDS].map((l) => limbs.limbs[l].work.at.y - level);
      assert.ok(down.every((y) => y < DOWN), `${model}: the fixture did not reach its case: its shins and hands are ${down} m over the ground`);
      const kneels = [];
      for (const [l, side] of [[SHINS[0], "left"], [SHINS[1], "right"]]) {
        const limb = limbs.limbs[l], knee = endsOf(built, `shank.${side}`, `knee.${side}`).first;
        const down = feet.find((foot) => foot.side === side).corners.filter((corner) => corner.y - level < DOWN);
        kneels.push(down.length);
        // The task: the point's three rows and the shank's tilt's, about the level line across it.
        assert.equal(limb.work.rows.length, 4, `${model}, ${side}`);
        if (down.length === 0) {
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
      assert.equal(kneels.some((corners) => corners > 0), propped, `${model}: ${kneels} corners of its left and right soles are on the ground`);
      // On its knees and hands, each hand lies on its palm, either side of its middle.
      for (const [l, side] of [[HANDS[0], "left"], [HANDS[1], "right"]]) {
        const point = handPoint(built, side, level);
        assert.deepEqual([point.near, point.far], [true, true], `${model}: on its hands, its ${side} hand lies flat`);
        assert.ok(Vector3.Distance(limbs.limbs[l].work.at, point.at) < 1e-12 && Vector3.Distance(limbs.over[l], point.at) < 1e-12, `${model}, ${side}`);
        assert.deepEqual([limbs.limbs[l].work.patch.kind, limbs.limbs[l].work.rows.length], ["point", 3], `${model}, ${side}`);
      }
      // Down, each bears as it is asked: its task on, its share kept.
      const goal = new Float64Array(f.body.own.muscles.channels.length);
      for (const l of [...SHINS, ...HANDS]) {
        const limb = limbs.limbs[l];
        assert.deepEqual([limbs.bear(l, goal, 2.5, level, 0.25 + l), limb.task.on, limb.task.bearing, limb.work.share], [true, true, true, 0.25 + l], `${model}, ${RISE.limbs[l].name}`);
        limbs.rest(l);
        assert.deepEqual([limb.task.on, limb.task.bearing], [false, false]);
      }
    } finally { f.dispose(); }
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
