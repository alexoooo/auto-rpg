/**
 * **Down is a reading of the body** (`uprightness`, `src/core/control/ground.ts`): its centre of
 * mass's height over its lowest point, against the height its mind asks it to hold, and the view
 * that carries it (`BodyView.down`). Node stand, Rapier, 120 Hz.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { createBody, SERVO_SECONDS } from "../src/core/body.ts";
import { FALLEN, uprightness } from "../src/core/control/ground.ts";
import { centreOfToRef, footStatesOf } from "../src/core/control/support.ts";
import { armed } from "../src/core/human/grip.ts";
import { BODY_MODELS, modelSpec } from "../src/core/human/spec.ts";
import { woodenClub } from "../src/core/items/club.ts";
import { FIGHTER } from "../src/core/mind/config.ts";
import { standIntent } from "../src/core/mind/intent.ts";
import { embody } from "../src/core/mind/mind.ts";
import { DOWN } from "../src/core/mind/rise/limbs.ts";
import { subMindsOf } from "../src/core/mind/sub-minds.ts";
import { driveBy } from "../src/core/mind/tactics.ts";
import { GUARD } from "../src/core/skills/guard.ts";
import { coreStand } from "./harness/core-stand.mjs";

const warrior = modelSpec("workshop-fighter");
const BODIES = [...BODY_MODELS.map(modelSpec), armed(warrior, "right", woodenClub())];

/** A built body's centre of mass's height over the stand's ground, m: the ground's top is y = 0. */
function overGround(built) {
  const at = new Vector3();
  let mass = 0, moment = 0;
  for (const segment of built.segments.values()) {
    mass += segment.rigid.mass;
    moment += segment.rigid.mass * centreOfToRef(segment, at).y;
  }
  return moment / mass;
}

test("a body's standing height is its spec's", async () => {
  for (const spec of BODIES) {
    const stand = await coreStand(spec);
    try {
      const upright = uprightness(stand.built);
      // Built with its soles on the ground, its lowest point is the ground's.
      assert.ok(Math.abs(upright.standing - overGround(stand.built)) < 1e-3, `${spec.model}: ${upright.standing} by its spec, ${overGround(stand.built)} over the ground`);
      assert.ok(upright.standing > 0.5 && upright.standing < 1.5, `${spec.model} stands ${upright.standing} m`);
      assert.ok(Math.abs(upright.height() - upright.standing) < 1e-3, `${spec.model}: ${upright.height()} as built, ${upright.standing} by its spec`);
      // Its lowest point is the ground's top, which the stand has at 0.
      assert.ok(Math.abs(upright.lowest()) < 1e-3, `${spec.model}: as built its lowest point is at ${upright.lowest()} m`);
      assert.equal(upright.down(), false);
    } finally { stand.dispose(); }
  }
});

test("a limp body's height is its centre of mass's over the ground it lies on", async () => {
  for (const spec of BODIES) {
    // Nothing drives it: it folds where it stands, and lies on its capsules.
    const stand = await coreStand(spec);
    try {
      const upright = uprightness(stand.built);
      stand.step(stand.seconds(5));
      const height = upright.height(), over = overGround(stand.built);
      assert.ok(over < 0.2, `${spec.model} lies: its centre of mass is ${over} m over the ground`);
      // A lying body sinks a few millimetres into the ground it rests on.
      assert.ok(Math.abs(height - over) < 5e-3, `${spec.model}: ${height} over its lowest point, ${over} over the ground`);
      // The lowest point is what the height is read over: the ground it lies on, less what it sinks.
      const lowest = upright.lowest();
      assert.ok(lowest < 0 && lowest > -5e-3 && Math.abs(over - lowest - height) < 1e-12, `${spec.model}: its lowest point is at ${lowest} m, its centre of mass ${over} m up and ${height} over it`);
      assert.equal(upright.down(), true);
    } finally { stand.dispose(); }
  }
});

test("standing, only the feet are near the ground; lying, more than the feet are", async () => {
  for (const spec of BODIES) {
    const stand = await coreStand(spec);
    try {
      const upright = uprightness(stand.built), feet = new Set(footStatesOf(stand.built).map((foot) => foot.segment));
      assert.equal(feet.size, 2);
      // As built, the lowest point but the feet's is the ankles' capsules', clear of the soles.
      const standing = upright.clearance(feet);
      assert.ok(standing > DOWN && standing < 0.2, `${spec.model} standing: the rest ${standing} m over its lowest point`);
      assert.equal(upright.clearance(new Set()), 0);
      stand.step(stand.seconds(5));
      const lying = upright.clearance(feet);
      assert.ok(lying >= 0 && lying < 5e-3, `${spec.model} lying: the rest ${lying} m over its lowest point`);
      assert.equal(upright.clearance(new Set()), 0);
    } finally { stand.dispose(); }
  }
});

test("a segment alone lies on its own shape, whatever its kind", async () => {
  const kinds = new Set();
  for (const segment of warrior.segments) {
    const stand = await coreStand({ ...warrior, segments: [segment], joints: [] });
    try {
      const upright = uprightness(stand.built);
      stand.step(stand.seconds(3));
      const height = upright.height(), over = overGround(stand.built);
      assert.ok(Math.abs(height - over) < 5e-3, `${segment.name}, a ${segment.shape.kind}: ${height} over its lowest point, ${over} over the ground`);
      kinds.add(segment.shape.kind);
    } finally { stand.dispose(); }
  }
  // The fixture shows a round shape, whose lowest point is its radius under a point of it, and one with corners.
  assert.ok(kinds.has("capsule") && kinds.has("box"), [...kinds].join());
});

/** A mind that drives `folds`' freedoms toward `fold()` rad at no more than 1 rad/s, and holds every other where it is built. */
const folding = (folds, fold) => (own) => ({
  name: "fold",
  step() {
    const { muscles } = own;
    muscles.activation.fill(1);
    muscles.velocity.fill(0);
    for (const name of folds) {
      const i = muscles.channel(name);
      muscles.velocity[i] = Math.max(-1, Math.min(1, (fold() - muscles.angle(i)) / 0.2));
    }
  },
});
const LEGS = ["left", "right"].flatMap((side) => [`hip.${side} flexion`, `knee.${side} flexion`]);
/** How much lower than its standing height the pinned body is asked to hold itself, m: folded, it is 0.36 m under. */
const LOWER = 0.08;

test("a body is down from a quarter metre under the height it is asked, and up again above it", async () => {
  const stand = await coreStand(warrior, { ground: false, pinned: "lowerTrunk" });
  let fold = 1.6;
  const { dispose } = embody(stand.built, stand.world, folding(LEGS, () => fold));
  try {
    const upright = uprightness(stand.built), { standing } = upright;
    const seen = { down: [], lowered: [], other: null };
    const take = () => {
      const under = standing - upright.height();
      // Both sides of the bar, at every step: nothing is remembered from the step before.
      assert.equal(upright.down(), under > FALLEN, `${under} m under its standing height`);
      assert.equal(upright.down(standing - LOWER), under - LOWER > FALLEN, `${under} m under, asked ${LOWER} m lower`);
      assert.equal(upright.down(standing + 1), upright.down(), "asked to stand taller than it can, the bar is its standing height's");
      seen.down.push(upright.down());
      seen.lowered.push(upright.down(standing - LOWER));
    };
    for (let i = 0; i < stand.seconds(2.5); i++) { stand.step(); take(); }
    // A reader made while the legs are folded has the spec's standing height, not the pose's.
    seen.other = uprightness(stand.built).standing;
    fold = 0;
    for (let i = 0; i < stand.seconds(2.5); i++) { stand.step(); take(); }
    const turns = (list) => list.reduce((turned, now, i) => (i > 0 && now !== list[i - 1] ? [...turned, [i, now]] : turned), []);
    const down = turns(seen.down), lowered = turns(seen.lowered);
    assert.deepEqual(down.map(([, now]) => now), [true, false], `it went down and came up once: ${JSON.stringify(down)}`);
    assert.deepEqual(lowered.map(([, now]) => now), [true, false], JSON.stringify(lowered));
    assert.ok(lowered[0][0] > down[0][0] && lowered[1][0] < down[1][0], `asked lower, it is down later and up sooner: ${JSON.stringify({ down, lowered })}`);
    assert.equal(seen.other, standing);
  } finally { dispose(); stand.dispose(); }
});

/** The Warrior under the command layers, standing in guard, shoved `impulse` N s forward at its middle trunk's centre a second in. */
async function shoved(impulse, seconds, each) {
  const stand = await coreStand(warrior);
  const body = createBody(stand.built, stand.world, { servoSeconds: SERVO_SECONDS });
  try {
    driveBy(body, { name: "stand", decide: () => standIntent(0) });
    stand.step(stand.seconds(1));
    const trunk = stand.built.segments.get("middleTrunk");
    trunk.body.applyImpulse(new Vector3(0, 0, impulse), centreOfToRef(trunk, new Vector3()));
    for (let i = 0; i < stand.seconds(seconds); i++) { stand.step(); each(body, i / stand.world.hz); }
  } finally { body.dispose(); stand.dispose(); }
}

test("a shoved body reads down, lying", async () => {
  let at = null, up = 0;
  await shoved(120, 5, (body, time) => {
    if (body.view.down) at ??= time;
    else if (at !== null && time < at + 2) up += 1;
  });
  assert.ok(at !== null && at < 3, `it was down ${at} s after the shove`);
  assert.equal(up, 0, "and stayed down the 2 s that followed");
  // The control: a shove it holds leaves it up.
  let held = true;
  await shoved(20, 3, (body) => { held &&= !body.view.down; });
  assert.ok(held, "a sixth of the shove leaves it standing");
});

test("a body asked to hold itself low is not down at that height", async () => {
  /**
   * The Warrior, pinned, under the game's sub-minds, its legs folded by its posture under a stance
   * that bears on no foot and asks `asked(standing)` m, then straightened under the same: whether
   * its view said down folded, how far under its standing height it got, who had the body in turn,
   * whether at every step the mind that lies had it just when the view said down, and what its
   * view says straightened.
   */
  const folded = async (asked) => {
    const stand = await coreStand(warrior, { ground: false, pinned: "lowerTrunk" });
    const body = createBody(stand.built, stand.world, { servoSeconds: SERVO_SECONDS, subs: subMindsOf(FIGHTER.subs) });
    try {
      const upright = uprightness(stand.built), { standing } = upright;
      const stance = Object.freeze({ feet: Object.freeze([]), centre: null, height: asked(standing), heading: 0, walk: null });
      const command = (fold) => Object.freeze({
        posture: Object.freeze({ ...GUARD, ...Object.fromEntries(LEGS.map((name) => [name, fold])) }),
        hands: Object.freeze({ left: null, right: null }), pushes: Object.freeze([]), stance,
      });
      let now = command(1.6);
      body.drive(() => now);
      let down = false, under = 0, agree = true;
      const has = [];
      for (let i = 0; i < stand.seconds(2.5); i++) {
        stand.step();
        down ||= body.view.down;
        under = Math.max(under, standing - upright.height());
        if (has.at(-1) !== body.has) has.push(body.has);
        agree &&= body.has === (body.view.down ? "lie" : "command");
      }
      now = command(0);
      stand.step(stand.seconds(2.5));
      return { down, under, has, agree, after: { down: body.view.down, has: body.has, under: standing - upright.height() } };
    } finally { body.dispose(); stand.dispose(); }
  };
  const low = await folded((standing) => standing - 0.35);
  assert.ok(low.under > 0.3 && low.under < 0.35 + FALLEN, `the fixture folds it between the two bars: ${low.under} m under`);
  assert.equal(low.down, false, "held low as it was asked, it is not down");
  // The mind that lies reads its host's view, not a bar of its own: the body is its host's all the way.
  assert.deepEqual([low.has, low.agree], [["command"], true]);
  // The control: the same fold under a goal that asks its standing height is down at the bar, and
  // the mind that lies has the body from that step, so it folds no further.
  const high = await folded((standing) => standing);
  assert.ok(high.under > FALLEN && high.under < low.under, `folded to the bar: ${high.under} m under, and ${low.under} held low`);
  assert.equal(high.down, true);
  assert.deepEqual([high.has.slice(0, 2), high.agree], [["command", "lie"], true]);
  // And the view's reading is the body's now: straightened, it is up again, and its host's.
  assert.ok(high.after.under < 0.05, `straightened, it is ${high.after.under} m under`);
  assert.deepEqual([high.after.down, high.after.has], [false, "command"]);
});
