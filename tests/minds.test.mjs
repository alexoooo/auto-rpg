import test from "node:test";
import assert from "node:assert/strict";
import researchedVariants from "../src/golem/researched-variants.json" with { type: "json" };
import researchedLab from "../src/golem/researched-lab.json" with { type: "json" };

import { NEUTRAL, POLICIES, mirroredWristBend, otherHand, policyMind, splitMind } from "../src/mind.ts";
import { blankIntent, cursorForElevation, postureFor, rollForStroke } from
  "../src/policies.ts";
import { CONFIG } from "../src/config.ts";
import { COMBAT_FIELDS } from "./fixtures/intent.mjs";
import { assertCompleteView } from "./fixtures/view.mjs";

/**
 * The policies, argued with rather than watched.
 *
 * No Babylon, no scene, no bout and no solver anywhere in this file's import
 * graph: `policies.ts` imports `config.ts`, `hands.ts` and `rng.ts` at run time,
 * and each of those imports nothing at all. That is what lets a whole cycle of a
 * policy's cadence be stepped in a fraction of a millisecond, and it is why
 * these live in `npm test` while the bouts live behind `npm run measure`.
 *
 * The views below are written out by hand. Nothing here needs a `Vector3` --
 * `policies.ts` reads `.x`, `.y` and `.z` and calls no method on a position --
 * so a plain object satisfies a `FighterView` exactly, and what is being tested
 * is the policy rather than a translation of it.
 *
 * The geometry is deliberately simpler than the arena's: both shoulders on the
 * centre line at 1.40 m, the opponent straight down +Z, so a sign in an answer
 * means what it looks like it means.
 */

const FIXED = 1 / CONFIG.world.physicsHz;

const PARTS = [
  "torso", "head", "pelvis", "upperArm", "forearm", "hand",
  "offUpperArm", "offForearm", "thighL", "shinL", "thighR", "shinR",
];

const whole = () => Object.fromEntries(PARTS.map((key) => [key, 1]));

/**
 * One hand of one body, as `Fighter.describe` would have published it.
 *
 * **Both hands hang off the one shoulder the body carries**, which is the same
 * simplification the views below already declare and not a new one: the arena
 * puts the two sockets 420 mm apart, and every sign in every answer here is
 * readable precisely because this geometry does not. `outboard` is still +1 and
 * -1, so every rule that turns on which side of the body a hand is on -- which
 * is what a shield's placement is -- is exercised exactly as it is in the arena.
 *
 * What this cannot check is the socket offset itself: that a hand aims from its
 * *own* shoulder rather than from the body's. `tests/view.test.mjs` pins that
 * the two sockets are 420 mm apart in a real scene, and `.review/two-hands.mjs`
 * measures what aiming from the wrong one costs -- a fighter fighting
 * left-handed killed nobody in 24 bouts and landed 20 points of damage on heads
 * against 216 on torsos.
 */
/**
 * How far a hand holding each kind puts its business end from its own shoulder.
 *
 * The real one is `Arm.strikeReach`, which needs a scene. This is the same
 * arithmetic against `config.ts`, because a range gate written against it is
 * what these tests are here to argue with -- and because a fixture that made the
 * number up would let a policy shift its ranges onto a weapon length nobody
 * actually builds.
 */
const reachOf = (weapon) => {
  const extension = weapon === "shield"
    ? Math.min(CONFIG.arm.reachNeutral, CONFIG.shield.reachCap)
    : CONFIG.arm.reachNeutral;
  if (weapon === "sword") {
    return extension + (CONFIG.sword.gripLength / 2 + CONFIG.sword.bladeLength);
  }
  if (weapon === "axe") {
    return extension + (CONFIG.axe.gripLength / 2 + CONFIG.axe.haftLength + CONFIG.axe.headLength);
  }
  // Everything else is either not swung at anybody or is not in these fixtures;
  // the arm alone is the honest answer and an over-precise one would be a
  // second copy of `weapon.ts`'s geometry living in a test.
  return extension;
};

function hand({ weapon = "empty", name = "primary", shoulder, sign = 1, tip, tipSpeed = 0,
  closing = true, lost = false }) {
  const fist = { x: shoulder.x, y: shoulder.y, z: shoulder.z + sign * CONFIG.arm.reachNeutral };
  return {
    weapon,
    shoulder,
    tip: tip ?? fist,
    tipSpeed,
    // A speed and the direction it is a speed *of*, because `describeFighter`
    // derives the first from the second and a fixture where the two disagree is
    // a body that cannot exist. It matters more than it looks: `selectThreat`
    // ranks a hand by its speed **only while the point is approaching**, so a
    // fixture that named a speed and left the direction at zero would describe
    // every committed blade in this file as standing still, and would go on
    // passing while asserting nothing.
    //
    // `sign` is the way this body's arms point, so `sign * +Z` is its point
    // travelling at the fighter opposite. `closing: false` is a blade that has
    // been spent somewhere else and is on its way back out.
    tipVelocity: { x: 0, y: 0, z: (closing ? sign : -sign) * tipSpeed },
    reach: reachOf(weapon),
    lost,
    outboard: name === "primary" ? 1 : -1,
  };
}

/**
 * The body facts that are not about a hand, from `config.ts` rather than made up.
 *
 * `Fighter.describeFighter` fills these five from the body profile, and a policy
 * reads them: `selectThreat` measures every threat's closest approach to
 * `(ground.x, vitalHeight, ground.z)` and gates an arrow on `collisionRadius`,
 * and feature v4 publishes all five. A fixture that omitted them handed
 * `undefined` into that arithmetic, which is `NaN`, which loses every comparison
 * silently rather than throwing.
 */
const SHAPE = {
  unit: "warrior",
  reach: CONFIG.arm.reachNeutral,
  crownHeight: CONFIG.body.headCentre + CONFIG.body.headRadius,
  vitalHeight: CONFIG.body.torsoCentre,
  collisionRadius: CONFIG.body.pelvisRadius,
};

/**
 * A fighter's view of an opponent standing `gap` metres away, shoulder to
 * shoulder, straight ahead.
 *
 * `blade` says what the opponent's point is doing: "line" is a guard pointed at
 * my chest, which is the thing a duelist must not commit into; "away" is a blade
 * that has been spent somewhere else.
 *
 * `mine` and `theirs` are the two loadouts. They default to what every fighter
 * carried before there was a choice -- a sword and an empty hand -- so every
 * assertion written before hands existed goes on measuring the same fighter.
 */
function facing({
  gap = 1.4,
  blade = "line",
  tipSpeed = 0,
  measure = null,
  clock = 0,
  mine = { primary: "sword", secondary: "empty" },
  theirs = { primary: "sword", secondary: "empty" },
} = {}) {
  const tip =
    blade === "line"
      ? { x: 0, y: 1.4, z: gap - 1.3 }
      : { x: 0.9, y: 2.1, z: gap + 0.6 };
  const myTip = { x: 0, y: 1.4, z: 1.3 };
  const mySocket = { x: 0, y: 1.4, z: 0 };
  const theirSocket = { x: 0, y: 1.4, z: gap };
  const mineHands = {
    primary: hand({ weapon: mine.primary, name: "primary", shoulder: mySocket, tip: myTip }),
    secondary: hand({ weapon: mine.secondary, name: "secondary", shoulder: mySocket }),
  };
  const theirHands = {
    primary: hand({
      weapon: theirs.primary, name: "primary", shoulder: theirSocket, sign: -1, tip, tipSpeed,
      // "away" is a point that has been spent somewhere else, so a speed on it
      // is a speed *outward*. Naming it here rather than in `hand` keeps the one
      // place that decides what "away" means the same place that positions it.
      closing: blade !== "away",
    }),
    secondary: hand({ weapon: theirs.secondary, name: "secondary", shoulder: theirSocket, sign: -1 }),
  };
  return assertCompleteView({
    self: {
      ...SHAPE,
      naturalAttacks: {},
      ground: { x: 0, y: 0, z: 0 },
      facing: 0,
      // The primary's, and *the same object* the primary hand carries, because
      // `Fighter.describe` fills the two from one socket and a fixture where
      // they disagree is a fixture describing a body that cannot exist.
      shoulder: mineHands.primary.shoulder,
      tip: myTip,
      tipSpeed: 0,
      hands: mineHands,
      crouch: 0,
      trunkLean: 0,
      trunkTwist: 0,
      vitality: 1,
      health: whole(),
    },
    opponent: {
      ...SHAPE,
      naturalAttacks: {},
      ground: { x: 0, y: 0, z: gap },
      facing: Math.PI,
      shoulder: theirHands.primary.shoulder,
      tip,
      tipSpeed,
      hands: theirHands,
      crouch: 0,
      trunkLean: 0,
      trunkTwist: 0,
      vitality: 1,
      health: whole(),
    },
    // Nothing is in the air in this file. It is still published, because a
    // `FighterView` always carries the array and a fixture that left it off
    // would be answered with a `TypeError` from `selectThreat` rather than with
    // "no arrows" -- which is the right way round, and is why there is no
    // tolerant `?? []` on the reader.
    projectiles: [],
    measure: measure === null ? gap - 0.4 : measure,
    clock,
  });
}

/**
 * Move the opponent's point.
 *
 * Both places, because `Fighter.describe` fills `BodyView.tip` by copying the
 * primary hand's -- so a fixture in which the two disagree is a fixture
 * describing a body that cannot exist, and a policy reading one of them would be
 * argued with over geometry the arena would never hand it.
 */
function putTip(view, point) {
  view.opponent.tip = point;
  view.opponent.hands.primary.tip = point;
  return view;
}

/**
 * Set a hand's point moving, in both of the fields that say so.
 *
 * `tipSpeed = 14` on its own used to be the whole of "this blade is committed",
 * and it is not any more: `selectThreat` ranks a tip by its speed *weighted by
 * how near its path takes it to the reader's vitals*, so a fixture that named a
 * speed and left `tipVelocity` at zero would describe a blade going nowhere and
 * would be ranked as one -- a fixture whose setup already satisfies whatever it
 * was about to assert. The weight is a demotion rather than a gate, which is the
 * one thing that changed after the first version of this note: a blade that is
 * plainly moving no longer scores exactly zero for half of every stroke.
 *
 * Straight at me by default, because the fixtures here put the opponent down
 * +Z; `closing: false` is a spent point on its way back out.
 */
function commit(hand, speed, { closing = true } = {}) {
  hand.tipSpeed = speed;
  hand.tipVelocity = { x: 0, y: 0, z: (closing ? -1 : 1) * speed };
  return hand;
}

/**
 * One intent, copied, because a mind hands back the same object every call.
 *
 * Two things beyond a spread, and both are load-bearing.
 *
 * The two hands are copied in their own right. A spread copies the *references*
 * to them, so every entry in a track would be looking at the same pair of live
 * objects and would read as whatever the last step asked for -- which would have
 * made the seed test above compare a fight against itself and pass.
 *
 * And the driven hand's five fields are flattened onto the copy. Every policy in
 * this file fights one-handed and every assertion below is about the hand it is
 * fighting with, so `intent.pointerX` goes on meaning what it has always meant
 * here. The nested copies are still there for anything that wants to be explicit.
 */
const snapshot = (intent) => ({
  ...intent,
  primary: { ...intent.primary },
  secondary: { ...intent.secondary },
  ...intent[intent.actingHand],
});

/**
 * One step of a mind, snapshotted.
 *
 * The tests that take a single reading used to call `decide` and read the result
 * directly, which is fine as long as the fields being read are on the object it
 * hands back. They are on one of its hands now, so everything goes through the
 * same flattening `drive` uses rather than half the file knowing about hands and
 * the other half not.
 */
const ask = (mind, view) => snapshot(mind.decide(view, FIXED));

/** Step a mind for `seconds` at the control rate, keeping every intent. */
function drive(mind, seconds, viewFor) {
  const track = [];
  const steps = Math.round(seconds / FIXED);
  for (let i = 0; i < steps; i += 1) {
    const clock = i * FIXED;
    track.push(snapshot(mind.decide(viewFor(clock), FIXED)));
  }
  return track;
}

// ---- the registry ---------------------------------------------------------

test("the picker offers exactly the policies that exist", () => {
  assert.deepEqual(
    POLICIES.map((policy) => policy.name),
    [...researchedVariants.map((candidate) => candidate.name), ...researchedLab.map((candidate) => candidate.name), "idle", "golem-duelist", "golem-fencer", "golem-planner", "golem-champion", "golem-form",
      "golem-skirmisher", "golem-guardian", "golem-brawler", "golem-tactician", "golem-driver",
      "golem-reaper", "golem-miser"],
  );
  for (const policy of POLICIES) {
    // Every row builds. The one row that could refuse was `golem-snapshot`, a slot with nothing
    // behind it until a checkpoint had been fetched; it went with the learned minds, so the
    // registry is now what it looks like -- a list of minds, each of which makes one.
    assert.equal(policyMind(policy.name, 1).name, policy.name);
    assert.ok(policy.label.length > 0, `${policy.name} needs a label for the screen`);
  }
});

/**
 * The exact field set a fighter consumes, asserted against every producer of a
 * command.
 *
 * A key list rather than a `zoom !== undefined` check on purpose. The failure
 * this guards is a *host* field surviving in a combat command, and camera zoom
 * was only the one that happened to be there -- an assertion naming zoom alone
 * would pass the day somebody adds a field for the readout or the pointer lock.
 * Naming the whole set makes any new field a decision somebody has to take.
 *
 * The list itself lived here, and three durable documents pointed at "the copy
 * that cannot drift" while there were **six** hand-written copies of it across
 * five test files. It is `tests/fixtures/intent.mjs` now, on the model
 * `tests/fixtures/view.mjs` set; this is still the test that ties it to reality,
 * because it drives every shipped mind through it.
 */
test("a_combat_intent_contains_no_camera_state", () => {
  const fieldsOf = (intent) => Object.keys(intent).sort();
  assert.deepEqual(fieldsOf(NEUTRAL), COMBAT_FIELDS, "the frozen neutral command");
  assert.deepEqual(fieldsOf(blankIntent()), COMBAT_FIELDS, "the intent every policy owns");
  assert.deepEqual(Object.keys(NEUTRAL.posture).sort(), ["crouch", "trunkLean", "trunkTwist"]);
  // Every shipped mind, driven rather than merely constructed: a policy that
  // writes a field its blank did not declare is exactly as wrong as a blank that
  // carries one, and only stepping it says so.
  for (const policy of POLICIES) {
    const mind = policyMind(policy.name, 20260824);
    for (const gap of [0.8, 1.4, 3.2]) {
      const out = mind.decide(facing({ gap }), FIXED);
      assert.deepEqual(fieldsOf(out), COMBAT_FIELDS, `${policy.name} at ${gap} m`);
    }
  }
});

test("an unknown policy is refused by name rather than quietly replaced", () => {
  assert.throws(() => policyMind("berserker"), /berserker/);
  // The refusal has to name what it does have, or it is a dead end.
  assert.throws(() => policyMind("berserker"), /duelist/);
});

// ---- idle -----------------------------------------------------------------

test("idle asks for nothing at all", () => {
  const track = drive(policyMind("idle"), 2, () => facing({ gap: 0.9 }));
  for (const intent of track) {
    assert.equal(intent.forward, 0);
    assert.equal(intent.strafe, 0);
    assert.equal(intent.turn, 0);
    assert.equal(intent.pointerX, 0);
    assert.equal(intent.pointerY, 0);
    assert.equal(intent.thrust, false);
    assert.equal(intent.guard, false);
  }
});

// ---- swinger --------------------------------------------------------------

// ---- duelist --------------------------------------------------------------

// ---- the roll -------------------------------------------------------------

test("the roll for a level stroke reaches the anatomical stop and a vertical one needs none", () => {
  // A blade swept sideways cuts with its edge only if the edge has been laid
  // over into the horizontal; swept downward it already is.
  assert.equal(Math.abs(rollForStroke(0.8, 0, -0.8, 0)), CONFIG.arm.rollMax);
  assert.ok(Math.abs(rollForStroke(0, 0.9, 0, -0.9)) < 1e-6);
});

test("the roll for a stroke is the same read either way along it", () => {
  // The sword is double-edged and `Combat` takes the absolute value of the edge
  // dot product, so a stroke and its reverse are one cut. A formula that
  // disagreed with itself here would be picking a direction that does not exist.
  for (const stroke of [
    [0.85, 0.8, -0.7, -0.35],
    [-0.4, 0.2, 0.6, -0.9],
    [0.1, -0.6, -0.3, 0.55],
  ]) {
    const [ax, ay, bx, by] = stroke;
    assert.ok(
      Math.abs(rollForStroke(ax, ay, bx, by) - rollForStroke(bx, by, ax, ay)) < 1e-9,
      `stroke ${stroke} reads differently backwards`,
    );
  }
});

test("the roll stays inside what the wrist is allowed", () => {
  assert.equal(CONFIG.arm.rollMin, -1.4);
  assert.equal(CONFIG.arm.rollMax, 1.4);
  for (let x = -1; x <= 1; x += 0.25) {
    for (let y = -1; y <= 1; y += 0.25) {
      const roll = rollForStroke(x, y, -x, -y);
      assert.ok(roll >= CONFIG.arm.rollMin && roll <= CONFIG.arm.rollMax, `roll ${roll}`);
    }
  }
});

// ---- one mouse, two hands -------------------------------------------------

/**
 * A mind that asks for one fixed thing, per hand.
 *
 * `actingHand` is which hand it is *attacking* with, which is now a different
 * question from which hands it has an opinion about: every policy plans both.
 */
const twoHanded = (name, actingHand, over) => {
  const intent = blankIntent();
  intent.actingHand = actingHand;
  Object.assign(intent, over.body ?? {});
  Object.assign(intent.posture, over.posture ?? {});
  Object.assign(intent.primary, over.primary ?? {});
  Object.assign(intent.secondary, over.secondary ?? {});
  return { name, decide: () => intent };
};

test("the person keeps the feet and the hand the mouse is on", () => {
  const person = twoHanded("you", "primary", {
    body: { forward: 1, strafe: -1, turn: 0.5 },
    primary: { pointerX: 0.4, pointerY: -0.3, roll: 0.9, thrust: true, guard: false },
  });
  const policy = twoHanded("swinger", "primary", {
    body: { forward: -1, strafe: 1, turn: -1 },
    primary: { pointerX: -0.8, pointerY: 0.7, roll: -1.1, thrust: false, guard: true },
    secondary: { pointerX: 0.15, pointerY: -0.05, roll: 1.4, thrust: false, guard: true },
  });

  const split = splitMind(person, policy);
  const out = split.decide(facing({ gap: 1.2 }), FIXED);

  // The body is the person's, whole.
  assert.equal(out.forward, 1);
  assert.equal(out.strafe, -1);
  assert.equal(out.turn, 0.5);
  assert.equal(out.actingHand, "primary");

  // Position and buttons are theirs; wrist orientation is policy-owned.
  assert.deepEqual(out.primary, {
    pointerX: 0.4, pointerY: -0.3, reach: NEUTRAL.primary.reach,
    roll: -1.1, wristBend: 0, thrust: true, guard: false,
  });
  // And the spare one takes the policy's plan **for that same hand** -- not the
  // plan it made for the hand it is attacking with. That distinction is the
  // whole of this rule: a policy plans a hand by what is in it, so its secondary
  // plan is a plan for the secondary's weapon.
  assert.deepEqual(out.secondary, {
    pointerX: 0.15, pointerY: -0.05, reach: NEUTRAL.secondary.reach,
    roll: 1.4, wristBend: 0, thrust: false, guard: true,
  });
});

test("split_mind_composes_only_fighter_commands", () => {
  // The person's half of this is `Controls.state` in the page, and the host owns
  // more state than a command -- the camera gesture, the ownership switches, and
  // whatever the next session adds. `splitMind` starts from `NEUTRAL` and assigns
  // named fields, so nothing a source happens to be carrying can reach a fighter
  // by spread. Both sources here carry a host field, which is exactly what a
  // caller left over from before the seam moved looks like.
  const person = twoHanded("you", "primary", {
    body: { forward: 1, strafe: -1, turn: 0.5, zoom: 1.6 },
    primary: { pointerX: 0.4, thrust: true },
  });
  const policy = twoHanded("duelist", "secondary", {
    body: { zoom: 9, panX: 3, mode: "orbit" },
    secondary: { pointerX: -0.2, roll: 0.7, guard: true },
  });

  const out = splitMind(person, policy).decide(facing({ gap: 1.2 }), FIXED);

  assert.deepEqual(Object.keys(out).sort(), COMBAT_FIELDS, "a host field reached the fighter");
  // ...and it is still the composition it was: the feet and the driven hand from
  // the person, the spare hand from the policy's plan for that same hand.
  assert.equal(out.forward, 1);
  assert.equal(out.actingHand, "primary");
  assert.equal(out.primary.pointerX, 0.4);
  assert.equal(out.primary.thrust, true);
  assert.equal(out.secondary.pointerX, -0.2);
  assert.equal(out.secondary.guard, true);
  assert.deepEqual(Object.keys(NEUTRAL).sort(), COMBAT_FIELDS, "the shared neutral was written through");
});

test("human_play_gives_wrist_orientation_to_the_policy_and_position_to_the_pointer", () => {
  const person = twoHanded("you", "primary", {
    primary: { pointerX: 0.63, pointerY: -0.42, roll: 1.25, wristBend: 0.91, thrust: true },
  });
  const policy = twoHanded("duelist", "primary", {
    primary: { pointerX: -0.8, pointerY: 0.7, roll: -0.74, wristBend: 0.36, guard: true },
  });
  const out = splitMind(person, policy).decide(facing({ gap: 1.2 }), FIXED);

  assert.equal(out.primary.pointerX, 0.63);
  assert.equal(out.primary.pointerY, -0.42);
  assert.equal(out.primary.thrust, true);
  assert.equal(out.primary.roll, -0.74);
  assert.equal(out.primary.wristBend, 0.36);
});

test("a_high_threat_makes_the_posture_layer_crouch_and_cover", () => {
  const view = facing({ gap: 0.9, tipSpeed: 12 });
  putTip(view, { x: 0, y: 1.72, z: 0.22 });
  const intent = blankIntent();

  postureFor(view, "cover", intent);

  assert.ok(intent.posture.crouch >= 0.45, `crouch ${intent.posture.crouch}`);
  assert.ok(intent.posture.trunkLean < 0, `lean ${intent.posture.trunkLean}`);
  assert.ok(intent.primary.wristBend > 0, "the covering wrist should not stay neutral");
  assert.ok(intent.secondary.wristBend > 0, "posture owns both wrists");
});

test("a_commit_twists_into_the_strike_and_recovers_to_neutral", () => {
  const view = facing();
  const intent = blankIntent();
  intent.actingHand = "secondary";

  postureFor(view, "commit", intent);
  assert.ok(intent.posture.trunkTwist < -0.4, `secondary commit twist ${intent.posture.trunkTwist}`);
  assert.ok(intent.posture.trunkLean > 0, "reach should carry the chest into the stroke");

  postureFor(view, "recover", intent);
  assert.deepEqual(intent.posture, { trunkLean: 0, trunkTwist: 0, crouch: 0 });
});

test("human_play_keeps_locomotion_and_buttons_but_uses_policy_posture", () => {
  const person = twoHanded("you", "secondary", {
    body: { forward: 1, strafe: -1, turn: 0.5 },
    posture: { trunkLean: 0.9, trunkTwist: -0.8, crouch: 0.1 },
    secondary: { pointerX: 0.4, pointerY: -0.3, roll: 1.1, wristBend: 0.2, thrust: true },
  });
  const policy = twoHanded("duelist", "primary", {
    body: { forward: -1, strafe: 1, turn: -1 },
    posture: { trunkLean: -0.35, trunkTwist: 0.7, crouch: 0.65 },
    primary: { roll: -0.8, wristBend: 0.75, guard: true },
    secondary: { roll: -0.6, wristBend: 0.55, guard: true },
  });

  const out = splitMind(person, policy).decide(facing(), FIXED);
  assert.deepEqual(
    { forward: out.forward, strafe: out.strafe, turn: out.turn, actingHand: out.actingHand },
    { forward: 1, strafe: -1, turn: 0.5, actingHand: "secondary" },
  );
  assert.deepEqual(out.posture, { trunkLean: -0.35, trunkTwist: 0.7, crouch: 0.65 });
  assert.equal(out.secondary.pointerX, 0.4);
  assert.equal(out.secondary.pointerY, -0.3);
  assert.equal(out.secondary.thrust, true);
  assert.equal(out.secondary.roll, -0.6);
  assert.equal(out.secondary.wristBend, 0.55);
});

test("every_shipped_policy_keeps_roll_and_bend_inside_anatomical_limits", () => {
  for (const policy of POLICIES) {
    const track = drive(policyMind(policy.name, 20260823), 8, (clock) =>
      facing({ gap: 0.9 + 0.6 * Math.sin(clock), mine: { primary: "axe", secondary: "shield" } }),
    );
    for (const intent of track) {
      for (const name of ["primary", "secondary"]) {
        const hand = intent[name];
        assert.ok(hand.roll >= CONFIG.arm.rollMin && hand.roll <= CONFIG.arm.rollMax,
          `${policy.name}.${name} roll ${hand.roll}`);
        assert.ok(hand.wristBend >= 0 && hand.wristBend <= 1,
          `${policy.name}.${name} bend ${hand.wristBend}`);
      }
    }
  }
});

test("the_same_bend_intent_mirrors_between_left_and_right_hands", () => {
  const right = mirroredWristBend(0.65, 1);
  const left = mirroredWristBend(0.65, -1);
  assert.ok(right > 0);
  assert.equal(left, -right);
  assert.equal(Math.abs(right), 0.65 * CONFIG.arm.wristBendMax);
});

test("the policy's attack does not follow the person round to the other arm", () => {
  // The defect this pins, in the terms it was found in: pick a sword and a
  // shield, take the sword, and the old rule copied `theirs[theirs.actingHand]` --
  // the swing -- onto whichever arm was spare. That arm was the shield's. The
  // board was being swung on the commit stroke of a cut, for the whole bout.
  const cut = { pointerX: -0.9, pointerY: 0.8, reach: NEUTRAL.primary.reach,
    roll: -0.93, wristBend: 0, thrust: false, guard: false };
  const cover = { pointerX: 0.55, pointerY: 0.1, reach: NEUTRAL.secondary.reach,
    roll: 1.2, wristBend: 0, thrust: false, guard: false };
  const policy = twoHanded("swinger", "primary", { primary: cut, secondary: cover });

  for (const acting of ["primary", "secondary"]) {
    const person = twoHanded("you", acting, { [acting]: { pointerX: 0.4 } });
    const out = splitMind(person, policy).decide(facing({ gap: 1.2 }), FIXED);
    const spare = otherHand(acting);
    assert.deepEqual(
      out[spare],
      spare === "primary" ? cut : cover,
      `acting with the ${acting}, the ${spare} should get the policy's plan for the ${spare}`,
    );
  }
});

test("swapping hands swaps which one the policy has", () => {
  const person = twoHanded("you", "secondary", {
    secondary: { pointerX: 0.25, roll: 0.5 },
  });
  const policy = twoHanded("duelist", "primary", { primary: { pointerX: -0.6, guard: true } });

  const out = splitMind(person, policy).decide(facing({ gap: 1.2 }), FIXED);

  assert.equal(out.actingHand, "secondary");
  assert.equal(out.secondary.pointerX, 0.25, "the mouse is on the secondary now");
  assert.equal(out.primary.pointerX, -0.6, "so the policy has the primary");
  assert.equal(out.primary.guard, true);
  assert.equal(otherHand(out.actingHand), "primary");
});

test("a policy reading a hand does not read the person's", () => {
  // The failure this guards is a spread instead of a field-by-field copy: the
  // two hands would then be references to the two minds' own live objects, and
  // a policy that writes its hand next step would silently rewrite what the
  // fighter was already given.
  const person = twoHanded("you", "primary", { primary: { pointerX: 0.5 } });
  const policyIntent = blankIntent();
  const policy = {
    name: "shifty",
    decide: () => {
      policyIntent.primary.pointerX += 0.1;
      return policyIntent;
    },
  };

  const split = splitMind(person, policy);
  const first = { ...split.decide(facing({ gap: 1.2 }), FIXED).secondary };
  split.decide(facing({ gap: 1.2 }), FIXED);

  assert.ok(first.pointerX !== policyIntent.primary.pointerX, "the copy was taken, not aliased");
});

test("the policy is driven every step, at its own dt", () => {
  // A policy whose cadence stopped while somebody else was using its arm would
  // be a different policy -- the same argument `handover` makes for driving its
  // inner mind through the rebase window.
  const seen = [];
  const policy = {
    name: "counter",
    decide: (view, dt) => {
      seen.push(dt);
      return blankIntent();
    },
  };
  const split = splitMind(twoHanded("you", "primary", {}), policy);
  for (let i = 0; i < 12; i += 1) split.decide(facing({ gap: 1.2 }), FIXED);

  assert.equal(seen.length, 12);
  assert.ok(seen.every((dt) => dt === FIXED));
});

test("a split mind answers to the person's name", () => {
  // A readout should say who is driving, and "you" is the answer even though
  // half the body is on a policy.
  const split = splitMind(twoHanded("you", "primary", {}), twoHanded("a-policy", "primary", {}));
  assert.equal(split.name, "you");
});

// ---- two hands ------------------------------------------------------------

test("a single-bit stroke is allowed to ask for more roll but both answers obey the wrist", () => {
  // `rollForStroke` folded its answer into +-pi/2 because a sword is
  // double-edged: `roll` and `roll +- pi` are the same cut, and the short one is
  // the one the wrist can get to. That is exactly false for a single-bitted
  // weapon, where one of the two is the poll -- and measured on the bench, both
  // policies and both hands were picking the poll **every single time**, because
  // the fold's tie-break is which is closer to zero and that is no tie-break at
  // all. An axe swung with the fold left in arrived poll-first on 64 % of the
  // contacts that landed on a body; unfolded, 36 %, and the rest is the arc
  // curving and the wrist taking time to get there.
  const strokes = [
    ["swinger, right hand", 0.85, 0.80, -0.70, -0.35],
    ["swinger, left hand", -0.85, 0.80, 0.70, -0.35],
    ["duelist, right hand", 0.62, 0.50, -0.62, -0.50],
    ["duelist, left hand", -0.62, 0.50, 0.62, -0.50],
  ];
  for (const [what, fx, fy, tx, ty] of strokes) {
    const folded = rollForStroke(fx, fy, tx, ty);
    const full = rollForStroke(fx, fy, tx, ty, false);
    assert.ok(Math.abs(folded) <= Math.PI / 2 + 1e-9, `${what}: a blade's roll is folded`);
    assert.ok(Math.abs(full) >= Math.abs(folded), `${what}: a bit may need the longer turn`);
    assert.ok(Math.abs(full) <= CONFIG.arm.rollMax, `${what}: the anatomical stop still wins`);
  }

  // The default is the blade's, so every caller written before there was a
  // single-bitted weapon means what it meant.
  assert.equal(rollForStroke(0.85, 0.80, -0.70, -0.35), rollForStroke(0.85, 0.80, -0.70, -0.35, true));
});

/**
 * The archer, which is the first policy here that does not fence.
 *
 * Everything below is the pure half: what `decide` returns when it is shown a
 * view. What a bow is *worth* is `.review/bow.mjs` and `docs/measurements.md`,
 * and the two are deliberately not mixed -- these run in microseconds and that
 * runs the solver for minutes.
 */
