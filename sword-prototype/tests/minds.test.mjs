import test from "node:test";
import assert from "node:assert/strict";

import { POLICIES, otherHand, policyMind, splitMind } from "../src/mind.ts";
import { blankIntent, cursorForElevation, rollForStroke } from "../src/policies.ts";
import { CONFIG } from "../src/config.ts";

/**
 * The policies, argued with rather than watched.
 *
 * No Babylon, no scene, no bout and no solver anywhere in this file's import
 * graph: `policies.ts` imports `config.ts` and nothing else at run time, and
 * `config.ts` imports nothing at all. That is what lets a whole cycle of a
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

function hand({ weapon = "empty", name = "primary", shoulder, sign = 1, tip, tipSpeed = 0, lost = false }) {
  const fist = { x: shoulder.x, y: shoulder.y, z: shoulder.z + sign * CONFIG.arm.reachNeutral };
  return {
    weapon,
    shoulder,
    tip: tip ?? fist,
    tipSpeed,
    reach: reachOf(weapon),
    lost,
    outboard: name === "primary" ? 1 : -1,
  };
}

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
    }),
    secondary: hand({ weapon: theirs.secondary, name: "secondary", shoulder: theirSocket, sign: -1 }),
  };
  return {
    self: {
      ground: { x: 0, y: 0, z: 0 },
      facing: 0,
      // The primary's, and *the same object* the primary hand carries, because
      // `Fighter.describe` fills the two from one socket and a fixture where
      // they disagree is a fixture describing a body that cannot exist.
      shoulder: mineHands.primary.shoulder,
      tip: myTip,
      tipSpeed: 0,
      hands: mineHands,
      health: whole(),
    },
    opponent: {
      ground: { x: 0, y: 0, z: gap },
      facing: Math.PI,
      shoulder: theirHands.primary.shoulder,
      tip,
      tipSpeed,
      hands: theirHands,
      health: whole(),
    },
    measure: measure === null ? gap - 0.4 : measure,
    clock,
  };
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
  ...intent[intent.driving],
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
    ["idle", "swinger", "duelist", "archer"],
  );
  for (const policy of POLICIES) {
    assert.equal(policyMind(policy.name, 1).name, policy.name);
    assert.ok(policy.label.length > 0, `${policy.name} needs a label for the screen`);
  }
});

test("an unknown policy is refused by name rather than quietly replaced", () => {
  assert.throws(() => policyMind("berserker"), /berserker/);
  // The refusal has to name what it does have, or it is a dead end.
  assert.throws(() => policyMind("berserker"), /duelist/);
});

test("a seed is what makes two of the same policy different", () => {
  const one = drive(policyMind("swinger", 11), 3, () => facing({ gap: 1.2 }));
  const two = drive(policyMind("swinger", 12), 3, () => facing({ gap: 1.2 }));
  const same = policyMind("swinger", 11);
  const again = drive(same, 3, () => facing({ gap: 1.2 }));

  assert.deepEqual(again, one, "the same seed has to give the same fight back");
  assert.notDeepEqual(two, one, "two seeds that agree are two bouts that are one bout");
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

test("swinger walks in, and holds its cursor still until it is in measure", () => {
  const track = drive(policyMind("swinger", 7), 3, () => facing({ gap: 2.4 }));
  for (const intent of track) {
    assert.equal(intent.forward, 1, "out of measure it should be closing");
    assert.equal(intent.pointerX, 0, "and not swinging at the air on the way");
  }
});

test("a policy carries a short weapon further in, and a sword no further than it did", () => {
  // Every range in `policies.ts` was tuned with an arming sword on the end of
  // the arm, and until there was a weapon of another length that was invisible:
  // `duelist.hold = 1.40` with a comment reading "just inside the 1.45 m the
  // point of the blade reaches". Handed an axe, which reaches 1.13, it went on
  // holding 1.40 and committing at 1.48 -- a quarter of a metre outside its own
  // range -- and swung at the air for the whole bout.
  const axe = { primary: "axe", secondary: "empty" };
  const sword = { primary: "sword", secondary: "empty" };

  // A gap a sword-armed swinger is happy at, and an axe-armed one is not.
  const gap = 1.25;
  assert.ok(reachOf("sword") > gap && reachOf("axe") < gap, "the fixture has to straddle it");

  assert.equal(ask(policyMind("swinger", 7), facing({ gap, mine: sword })).forward, 0,
    "with a sword it is already in range and stops");
  assert.equal(ask(policyMind("swinger", 7), facing({ gap, mine: axe })).forward, 1,
    "with an axe it has a quarter of a metre still to walk");

  // And the duelist, whose hold is a proportional term rather than a switch, so
  // the sign of it is the assertion. 1.30 m is inside a sword's 1.40 hold and
  // outside an axe's 1.145, which is the whole of the difference.
  const held = ask(policyMind("duelist", 3), facing({ gap: 1.30, mine: sword }));
  const short = ask(policyMind("duelist", 3), facing({ gap: 1.30, mine: axe }));
  assert.ok(held.forward < 0, "a sword at 1.30 m is too close and it gives ground");
  assert.ok(short.forward > 0, "an axe at 1.30 m is still too far and it closes");
});

test("a hand that has lost its weapon closes on the fist it has left", () => {
  // The one behaviour this shift changed for a fighter carrying a sword, and it
  // is worth pinning because it is the whole of the drift in `npm run measure`:
  // once the weapon arm is off, `attackHand` hands the policy the other one, and
  // the other one reaches as far as a fist does. Standing at sword range holding
  // nothing was never a decision, only what a constant said.
  const armed = facing({ gap: 1.6 });
  const disarmed = facing({ gap: 1.6 });
  disarmed.self.hands.primary.lost = true;

  assert.equal(ask(policyMind("swinger", 7), armed).forward, 1);
  assert.equal(ask(policyMind("swinger", 7), disarmed).forward, 1);

  // At a gap inside a sword's range but well outside a fist's, the two differ.
  const near = facing({ gap: 1.20 });
  const nearDisarmed = facing({ gap: 1.20 });
  nearDisarmed.self.hands.primary.lost = true;
  assert.equal(ask(policyMind("swinger", 7), near).forward, 0, "in range with a sword");
  assert.equal(
    ask(policyMind("swinger", 7), nearDisarmed).forward,
    1,
    "and nowhere near it with a fist",
  );
});

test("swinger turns toward whatever is in front of it", () => {
  const mind = policyMind("swinger", 7);
  const toTheRight = { ...facing({ gap: 2.0 }) };
  toTheRight.opponent = { ...toTheRight.opponent, ground: { x: 2.0, y: 0, z: 0 } };
  assert.ok(ask(mind, toTheRight).turn > 0.5, "a target at +X is a right turn");

  const toTheLeft = { ...facing({ gap: 2.0 }) };
  toTheLeft.opponent = { ...toTheLeft.opponent, ground: { x: -2.0, y: 0, z: 0 } };
  assert.ok(ask(mind, toTheLeft).turn < -0.5, "a target at -X is a left turn");

  // Straight ahead is no turn at all, which is the case a sign error still
  // passes and a gain error does not.
  assert.equal(Math.abs(ask(mind, facing({ gap: 2.0 })).turn) < 1e-9, true);

  // And with the body already pointed somewhere, because a heading error taken
  // against the wrong zero is the classic way a policy ends up spinning.
  const turned = facing({ gap: 2.0 });
  turned.self.facing = Math.PI / 2;
  turned.opponent.ground = { x: 2.0, y: 0, z: 0 };
  assert.ok(Math.abs(ask(mind, turned).turn) < 1e-9, "already facing it is no turn");
  turned.opponent.ground = { x: 2.0, y: 0, z: 2.0 };
  assert.ok(ask(mind, turned).turn < -0.5, "a target off its left shoulder is a left turn");
});

test("swinger commits across and down, faster than a hand could be asked to", () => {
  // Long enough for the initial pause plus a whole cycle, whatever the jitter.
  const track = drive(policyMind("swinger", 3), 2.4, () => facing({ gap: 1.1 }));

  let fastest = 0;
  let at = 0;
  for (let i = 1; i < track.length; i += 1) {
    const rate = Math.abs(track[i].pointerX - track[i - 1].pointerX) / FIXED;
    if (rate > fastest) {
      fastest = rate;
      at = i;
    }
  }

  assert.ok(fastest > 8, `the commit should sweep faster than 8 cursor units a second, got ${fastest}`);
  assert.ok(
    track[at].pointerX < track[at - 1].pointerX,
    "the fast part of the cycle is the one going across, from the sword side to the far side",
  );
  assert.ok(
    track[at].pointerY < track[at - 1].pointerY,
    "and down, because a cut that arrives level with where it started is a poke",
  );
  // It gets high and outside first, or it is not a chamber.
  assert.ok(Math.max(...track.map((i) => i.pointerY)) > 0.7, "it should chamber high");
  assert.ok(Math.max(...track.map((i) => i.pointerX)) > 0.7, "and outside");
});

test("swinger sets one roll per swing and does not touch it again", () => {
  const track = drive(policyMind("swinger", 3), 2.4, () => facing({ gap: 1.1 }));
  const rolls = [...new Set(track.map((intent) => intent.roll))];
  assert.ok(rolls.length >= 2, "the roll has to be set at all, and it starts at zero");
  assert.ok(rolls.length <= 4, `one roll per swing, got ${rolls.length} distinct in 2.4 s`);
  // Non-zero, and the sign the derivation gives -- see `rollForStroke`.
  const swinging = rolls.filter((roll) => roll !== 0);
  for (const roll of swinging) {
    assert.ok(roll < -0.5 && roll > -1.4, `the edge should lead the cut, roll was ${roll}`);
  }
});

test("swinger never reads the opponent's blade", () => {
  // Two fights that differ in *everything a guard is made of* -- where the point
  // is, how fast it is moving, and what is left of the body carrying it -- and in
  // nothing else. A policy that swings on its clock cannot tell them apart, and
  // this is the whole of what "it never reads a guard" means.
  //
  // The opponent walks in from out of measure over the four seconds, which is
  // not decoration: at a fixed range inside the engage distance the walk axis is
  // pinned at zero and the cadence is running, so a policy that gated *either*
  // of those on the blade would come back identical anyway and this would be a
  // test whose setup already satisfies it. Closing exercises both branches.
  const approach = (clock) => Math.max(1.05, 2.4 - clock * 0.9);
  const quiet = drive(policyMind("swinger", 5), 4, (clock) =>
    facing({ gap: approach(clock), blade: "line", tipSpeed: 0, clock }));
  const storm = drive(policyMind("swinger", 5), 4, (clock) => {
    const view = facing({ gap: approach(clock), blade: "away", tipSpeed: 24, clock });
    view.opponent.health.head = 0.1;
    view.opponent.health.hand = 0;
    return view;
  });
  assert.deepEqual(storm, quiet);

  // And the scenario really does move through both branches, or the paragraph
  // above is a story rather than a fact about this test.
  assert.ok(quiet.some((intent) => intent.forward === 1), "it should be closing at some point");
  assert.ok(quiet.some((intent) => intent.forward === 0), "and be in measure at some other point");
  assert.ok(quiet.some((intent) => intent.pointerX < -0.5), "and get a whole commit away");
});

test("swinger never asks for a guard or a thrust", () => {
  const track = drive(policyMind("swinger", 9), 4, () => facing({ gap: 1.1 }));
  assert.ok(track.every((intent) => intent.guard === false));
  assert.ok(track.every((intent) => intent.thrust === false));
});

// ---- duelist --------------------------------------------------------------

test("duelist guards between exchanges, on the line of the opponent's point", () => {
  const mind = policyMind("duelist", 4);
  const intent = ask(mind, facing({ gap: 1.4, blade: "line" }));
  assert.equal(intent.guard, true);

  // The point is straight ahead and level, so the covering line is centre guard.
  assert.ok(Math.abs(intent.pointerX) < 0.05, `pointerX ${intent.pointerX}`);
  assert.ok(Math.abs(intent.pointerY) < 0.05, `pointerY ${intent.pointerY}`);

  // Lift the point and the guard follows it up rather than staying level.
  const high = facing({ gap: 1.4 });
  putTip(high, { x: 0, y: 2.1, z: 0.4 });
  const covering = ask(mind, high);
  assert.ok(covering.pointerY > 0.3, `the guard should rise to a high point, got ${covering.pointerY}`);

  // A point that is not extended toward it -- chambered, dropped, or hanging off
  // a fighter that has turned away -- is not the thing to cover, and chasing one
  // drags the guard off the body it is supposed to be standing between. So the
  // covering line falls back to the chest, which here is dead ahead and level.
  const spent = ask(mind, facing({ gap: 1.4, blade: "away" }));
  assert.ok(Math.abs(spent.pointerX) < 0.05, `should cover the chest, pointerX ${spent.pointerX}`);
  assert.ok(Math.abs(spent.pointerY) < 0.05, `should cover the chest, pointerY ${spent.pointerY}`);
});

test("duelist covers the line whichever way its body happens to be pointed", () => {
  // Every other view in this file has the fighter looking down +Z, where the
  // yaw that turns a world offset into the torso's own frame is the identity and
  // a sign error in it is invisible. Here it is looking down +X.
  const mind = policyMind("duelist", 4);
  const view = facing({ gap: 1.4 });
  view.self.facing = Math.PI / 2;
  view.opponent.ground = { x: 1.4, y: 0, z: 0 };
  view.opponent.shoulder = { x: 1.4, y: 1.4, z: 0 };
  putTip(view, { x: 0.1, y: 1.4, z: 0 });

  const ahead = ask(mind, view);
  assert.ok(Math.abs(ahead.pointerX) < 0.05, `straight ahead is centre, got ${ahead.pointerX}`);

  // Looking down +X, the fighter's right hand side is world -Z.
  putTip(view, { x: 0.6, y: 1.4, z: -0.6 });
  const outboard = ask(mind, view);
  assert.ok(outboard.pointerX > 0.3, `a point at the fighter's right is +X on the cursor, got ${outboard.pointerX}`);

  putTip(view, { x: 0.6, y: 1.4, z: 0.6 });
  const across = ask(mind, view);
  assert.ok(across.pointerX < -0.3, `and one at its left is -X, got ${across.pointerX}`);
});

test("the cursor a covering line asks for is the exact inverse of the arm's own mapping", () => {
  // `Fighter.aimArm` maps the cursor onto a torso-space azimuth and elevation
  // through `spread`, which is deliberately **asymmetric** -- the arm reaches
  // 1.30 rad across its own side and only 1.15 across the far one, and 1.25 up
  // against 1.05 down. So the inverse has to be asymmetric in the same way, and
  // the halfway points are where a symmetric one is visibly wrong: an
  // even-handed inverse puts -0.575 rad at -0.442 rather than at -0.5, which
  // reads as a guard that quietly sits inboard of where it was asked for.
  const A = CONFIG.arm;
  const mind = policyMind("duelist", 4);
  const at = (azimuth, elevation) => {
    const view = facing({ gap: 1.4 });
    const cos = Math.cos(elevation);
    putTip(view, {
      x: view.self.shoulder.x + Math.sin(azimuth) * cos,
      y: view.self.shoulder.y + Math.sin(elevation),
      z: view.self.shoulder.z + Math.cos(azimuth) * cos,
    });
    return ask(mind, view);
  };

  const close = (got, want, what) =>
    assert.ok(Math.abs(got - want) < 1e-6, `${what}: expected ${want}, got ${got}`);

  close(at(A.azMax / 2, 0).pointerX, 0.5, "half of the outboard reach");
  close(at(A.azMin / 2, 0).pointerX, -0.5, "half of the inboard reach");
  close(at(A.azMax, 0).pointerX, 1, "the outboard limit");
  close(at(A.azMin, 0).pointerX, -1, "the inboard limit");
  close(at(0, A.elMax / 2).pointerY, 0.5, "half of the reach overhead");
  close(at(0, A.elMin / 2).pointerY, -0.5, "half of the reach underfoot");
});

test("duelist gives ground when it is crowded and closes when it is given room", () => {
  const mind = policyMind("duelist", 4);
  assert.ok(
    ask(mind, facing({ gap: 0.7, measure: 0.4 })).forward < -0.5,
    "a point in its face is a reason to back off",
  );
  assert.ok(
    ask(mind, facing({ gap: 2.2, measure: 1.8 })).forward > 0.5,
    "two metres of daylight is a reason to close",
  );
  assert.ok(
    Math.abs(ask(mind, facing({ gap: 1.4, measure: 1.0 })).forward) < 1e-9,
    "and at its own measure it holds",
  );
});

test("duelist steps off line rather than down the middle, and changes hands", () => {
  const track = drive(policyMind("duelist", 6), 5, () => facing({ gap: 2.2, measure: 1.8 }));
  assert.ok(track.every((intent) => intent.strafe !== 0), "it should always be circling");
  const signs = new Set(track.map((intent) => Math.sign(intent.strafe)));
  assert.equal(signs.size, 2, "and should reverse the circle within five seconds");
});

test("duelist commits sooner on an opening than it does on patience", () => {
  // The same policy, the same seed, the same range: the only difference is
  // whether the blade in front of it is pointed at its chest. Comparative
  // because the alternative -- a threshold in seconds -- would pass or fail on
  // which side of its own jitter the seed happened to land.
  const firstCut = (blade) => {
    const mind = policyMind("duelist", 21);
    const track = drive(mind, 8, () => facing({ gap: 1.4, blade, tipSpeed: blade === "away" ? 12 : 0 }));
    const at = track.findIndex((intent) => intent.guard === false);
    assert.ok(at >= 0, `it never committed at all against a blade ${blade}`);
    return at * FIXED;
  };

  const onOpening = firstCut("away");
  const onPatience = firstCut("line");
  assert.ok(
    onOpening < onPatience,
    `an opening should be taken sooner than one is made: ${onOpening} s against ${onPatience} s`,
  );
});

test("duelist makes an exchange happen against a blade that never leaves the line", () => {
  // Two duelists that both wait for an opening never find one, because a
  // guarding blade is by definition in line -- and a pairing that never
  // terminates is a hung measurement rather than a fight. This is that property
  // in the small.
  for (const seed of [1, 2, 3, 4, 5]) {
    const track = drive(policyMind("duelist", seed), 6, () => facing({ gap: 1.4, blade: "line" }));
    const at = track.findIndex((intent) => intent.guard === false);
    assert.ok(at >= 0 && at * FIXED < 5, `seed ${seed} never committed inside five seconds`);
  }
});

test("duelist closes in proportion to how far out of position it is", () => {
  // Holding measure is not "walk until you arrive". `swinger` does that, and the
  // difference between the two is most of what makes one a fight: a policy that
  // asks for a full walk whenever it is not exactly at its range overshoots,
  // ends up crowded, and reverses -- which is the shuffle rather than the hover.
  const mind = policyMind("duelist", 8);
  const near = ask(mind, facing({ gap: 1.55, measure: 1.15 })).forward;
  const far = ask(mind, facing({ gap: 1.9, measure: 1.5 })).forward;

  assert.ok(near > 0 && near < 0.4, `a little out of position is a little walk, got ${near}`);
  assert.ok(far > near, `further out should ask for more, got ${far} against ${near}`);
  assert.ok(far < 1, `and it should still not be a full walk, got ${far}`);
});

// ---- the roll -------------------------------------------------------------

test("the roll for a level stroke is a quarter turn and for a vertical one is none", () => {
  // A blade swept sideways cuts with its edge only if the edge has been laid
  // over into the horizontal; swept downward it already is.
  assert.ok(Math.abs(Math.abs(rollForStroke(0.8, 0, -0.8, 0)) - Math.PI / 2) < 1e-6);
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

test("the roll for the swinger's own stroke is the one that was measured to cut", () => {
  // Pinned against the bench, not against the algebra. `.review/swing-probe.mjs`
  // drove exactly this stroke through the real solver at three rolls and read
  // the edge alignment at the peak of the swing: 0.955 at -0.925 rad, 0.740 at
  // zero, and 0.126 at +0.925. Squared by `combat.edgeExponent`, that is 91 %,
  // 55 % and 2 % of a full cut -- so the sign is not a detail, and a test that
  // only bounded the magnitude would pass with the swing turned into a slap.
  const roll = rollForStroke(0.85, 0.8, -0.7, -0.35);
  assert.ok(roll < 0, `the edge has to lead, and it does not at roll ${roll}`);
  assert.ok(Math.abs(roll + 0.925) < 0.01, `expected about -0.925 rad, got ${roll}`);
});

test("the roll stays inside what the wrist is allowed", () => {
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
 * `driving` is which hand it is *attacking* with, which is now a different
 * question from which hands it has an opinion about: every policy plans both.
 */
const twoHanded = (name, driving, over) => {
  const intent = blankIntent();
  intent.driving = driving;
  Object.assign(intent, over.body ?? {});
  Object.assign(intent.primary, over.primary ?? {});
  Object.assign(intent.secondary, over.secondary ?? {});
  return { name, decide: () => intent };
};

test("the person keeps the feet and the hand the mouse is on", () => {
  const person = twoHanded("you", "primary", {
    body: { forward: 1, strafe: -1, turn: 0.5, zoom: 1.6 },
    primary: { pointerX: 0.4, pointerY: -0.3, roll: 0.9, thrust: true, guard: false },
  });
  const policy = twoHanded("swinger", "primary", {
    body: { forward: -1, strafe: 1, turn: -1, zoom: 9 },
    primary: { pointerX: -0.8, pointerY: 0.7, roll: -1.1, thrust: false, guard: true },
    secondary: { pointerX: 0.15, pointerY: -0.05, roll: 1.4, thrust: false, guard: true },
  });

  const split = splitMind(person, policy);
  const out = split.decide(facing({ gap: 1.2 }), FIXED);

  // The body is the person's, whole.
  assert.equal(out.forward, 1);
  assert.equal(out.strafe, -1);
  assert.equal(out.turn, 0.5);
  assert.equal(out.zoom, 1.6);
  assert.equal(out.driving, "primary");

  // Their hand is theirs.
  assert.deepEqual(out.primary, {
    pointerX: 0.4, pointerY: -0.3, roll: 0.9, thrust: true, guard: false,
  });
  // And the spare one takes the policy's plan **for that same hand** -- not the
  // plan it made for the hand it is attacking with. That distinction is the
  // whole of this rule: a policy plans a hand by what is in it, so its secondary
  // plan is a plan for the secondary's weapon.
  assert.deepEqual(out.secondary, {
    pointerX: 0.15, pointerY: -0.05, roll: 1.4, thrust: false, guard: true,
  });
});

test("the policy's attack does not follow the person round to the other arm", () => {
  // The defect this pins, in the terms it was found in: pick a sword and a
  // shield, take the sword, and the old rule copied `theirs[theirs.driving]` --
  // the swing -- onto whichever arm was spare. That arm was the shield's. The
  // board was being swung on the commit stroke of a cut, for the whole bout.
  const cut = { pointerX: -0.9, pointerY: 0.8, roll: -0.93, thrust: false, guard: false };
  const cover = { pointerX: 0.55, pointerY: 0.1, roll: 1.2, thrust: false, guard: false };
  const policy = twoHanded("swinger", "primary", { primary: cut, secondary: cover });

  for (const driving of ["primary", "secondary"]) {
    const person = twoHanded("you", driving, { [driving]: { pointerX: 0.4 } });
    const out = splitMind(person, policy).decide(facing({ gap: 1.2 }), FIXED);
    const spare = otherHand(driving);
    assert.deepEqual(
      out[spare],
      spare === "primary" ? cut : cover,
      `driving the ${driving}, the ${spare} should get the policy's plan for the ${spare}`,
    );
  }
});

test("swapping hands swaps which one the policy has", () => {
  const person = twoHanded("you", "secondary", {
    secondary: { pointerX: 0.25, roll: 0.5 },
  });
  const policy = twoHanded("duelist", "primary", { primary: { pointerX: -0.6, guard: true } });

  const out = splitMind(person, policy).decide(facing({ gap: 1.2 }), FIXED);

  assert.equal(out.driving, "secondary");
  assert.equal(out.secondary.pointerX, 0.25, "the mouse is on the secondary now");
  assert.equal(out.primary.pointerX, -0.6, "so the policy has the primary");
  assert.equal(out.primary.guard, true);
  assert.equal(otherHand(out.driving), "primary");
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
  const split = splitMind(twoHanded("you", "primary", {}), policyMind("swinger", 3));
  assert.equal(split.name, "you");
});

// ---- two hands ------------------------------------------------------------

test("a policy holds a shield across the line rather than letting it hang", () => {
  // The shipped behaviour this replaces: `blankIntent` parks the off hand at
  // `restPointerX/restPointerY` and no policy ever wrote it again, so a shield
  // hung at its owner's side for the whole bout.
  for (const name of ["swinger", "duelist"]) {
    const track = drive(policyMind(name, 5), 1.5, () =>
      facing({ gap: 1.3, mine: { primary: "sword", secondary: "shield" } }),
    );
    const last = track[track.length - 1];

    assert.ok(
      last.secondary.pointerY > CONFIG.arm.restPointerY + 0.5,
      `${name}: the shield should be up, not at rest, got ${last.secondary.pointerY}`,
    );
    // The threat is straight ahead, so the bearing to it is azimuth zero, and a
    // shield on the *secondary* -- the fighter's left -- swings across to its
    // right, which is +X on the cursor.
    assert.ok(
      last.secondary.pointerX > 0.35,
      `${name}: the shield arm should be across the body, got ${last.secondary.pointerX}`,
    );
    assert.equal(last.secondary.guard, false, `${name}: reachCap already bends the elbow`);
  }
});

test("a shield's wrist turns the same way its arm was swung, and not to the stop", () => {
  // Two things, and the second is a regression guard rather than a rule.
  //
  // The sign, because the wrist has authority turning the way the arm went and
  // almost none turning against it: swept in the bench, a roll of +1.0 on a
  // *primary* arm swung across to azimuth -0.7 puts the hand 504 mm off its own
  // anchor, and the mirror of that breaks the secondary. Getting this backwards
  // does not look like a shield held wrong, it looks like an arm that has come
  // apart.
  //
  // And not at the stop, because the first version of this was a servo that
  // wound up: 237 of 420 steps sat pinned at the +-2.6 wrist limit, and every
  // one of those was an arm being asked for a twist it could not give.
  for (const name of ["primary", "secondary"]) {
    const other = name === "primary" ? "secondary" : "primary";
    const outboard = name === "primary" ? 1 : -1;
    const track = drive(policyMind("duelist", 5), 1.5, () =>
      facing({ gap: 1.3, mine: { [name]: "shield", [other]: "sword" } }),
    );
    const { roll, pointerX } = track[track.length - 1][name];
    assert.ok(
      pointerX * -outboard > 0.35,
      `${name}: the arm swings across, got ${pointerX.toFixed(2)}`,
    );
    assert.ok(
      roll * -outboard > 0.5,
      `${name}: the wrist should follow it round, got ${roll.toFixed(2)}`,
    );
    assert.ok(
      Math.abs(roll) < CONFIG.arm.rollMax - 0.5,
      `${name}: and stay well inside the wrist, got ${roll.toFixed(2)}`,
    );
  }
});

test("a shield is carried below the line it covers, not above it", () => {
  // The number this pins is the largest single one in the guard, and the first
  // version of it had the wrong sign on a perfectly good argument: the plate
  // hangs down the forearm, so a hand held level with the threat covers the
  // belly rather than the head, so lift it. Measured over 24 bouts that argument
  // costs 80 points of damage taken -- 241.0 at +0.16 against 160.8 at -0.20 --
  // because a board held high leaves everything under it open. The head is worth
  // less than the rest of the body put together.
  const track = drive(policyMind("duelist", 5), 1.5, () =>
    facing({ gap: 1.3, mine: { primary: "sword", secondary: "shield" } }),
  );
  // The threat is level with the shoulder, so the bearing to it is elevation
  // zero and anything below that is a cursor below centre.
  const { pointerY } = track[track.length - 1].secondary;
  assert.ok(pointerY < -0.05, `the guard should sit low, got ${pointerY.toFixed(2)}`);
});

test("a hand aims from its own shoulder, not from the body's", () => {
  // The two sockets are 420 mm apart and `BodyView.shoulder` is the primary's,
  // so a policy that aims everything from it is aiming the *other* hand from the
  // wrong side of the chest. Measured, that is not a rounding error: a fighter
  // fighting left-handed put 216 of 483 points of damage on torsos and 20 on
  // heads, against the primary's 45 and 90, and killed nobody in 24 bouts while
  // dealing twice as much damage as the hand that killed 17 times.
  //
  // The shared fixture cannot see this -- it hangs both hands off one shoulder,
  // and says so -- so this view moves the socket the way the arena does.
  const view = facing({
    gap: 1.4,
    blade: "away",
    mine: { primary: "shield", secondary: "sword" },
  });
  view.self.hands.secondary.shoulder = { x: -2 * CONFIG.fighter.shoulderSide, y: 1.4, z: 0 };

  const out = policyMind("duelist", 4).decide(view, FIXED);
  assert.equal(out.driving, "secondary", "the sword hand is the one aiming");
  // Their chest is straight ahead of the *body*, so a guard aimed from the body
  // would sit at centre. Aimed from a socket 420 mm to the left of it, the same
  // chest is off to the right.
  assert.ok(
    out.secondary.pointerX > 0.15,
    `the guard should lead right of centre, got ${out.secondary.pointerX.toFixed(3)}`,
  );
});

test("a shield in the leading hand is held across the other way", () => {
  // Mirrored, and it is the one thing `outboard` exists to say. A rule written
  // without it is right for one hand and inside-out for the other.
  const track = drive(policyMind("duelist", 5), 1.5, () =>
    facing({ gap: 1.3, mine: { primary: "shield", secondary: "sword" } }),
  );
  const last = track[track.length - 1];
  assert.ok(last.primary.pointerX < -0.35, `got ${last.primary.pointerX}`);
});

test("a policy attacks with the hand that can, not with the first one", () => {
  // A shield in the primary used to be swung, because `driving` was a constant
  // and every policy read `intent[intent.driving]` once at construction.
  const track = drive(policyMind("swinger", 7), 3, () =>
    facing({ gap: 1.1, mine: { primary: "shield", secondary: "sword" } }),
  );
  assert.ok(
    track.every((intent) => intent.driving === "secondary"),
    "the sword hand is the one that swings",
  );
  // And the sword hand actually swings: the commit sweeps the cursor across.
  const xs = track.map((intent) => intent.secondary.pointerX);
  assert.ok(Math.max(...xs) - Math.min(...xs) > 1.0, `the off sword should cut, span ${Math.max(...xs) - Math.min(...xs)}`);
});

test("two swords take turns, and the one not cutting covers", () => {
  const track = drive(policyMind("swinger", 3), 8, () =>
    facing({ gap: 1.1, mine: { primary: "sword", secondary: "sword" } }),
  );
  const hands = new Set(track.map((intent) => intent.driving));
  assert.deepEqual([...hands].sort(), ["primary", "secondary"], "both hands get a turn");

  // Both of them actually swing -- a turn that produced no stroke would satisfy
  // the line above and none of the complaint -- and each swings its **own** way
  // round. `swinger`'s stroke is written for a right arm: it chambers high and
  // *outside*, on the sword shoulder's side, and sweeps across and down. The
  // left arm has to swing the mirror of that, or it chambers across its own
  // chest and cuts outward, which is both wrong to watch and slower. The bug is
  // not hypothetical: `splitMind` handed a policy the secondary every time a
  // person took the primary, so this was every bout with a human in it.
  for (const name of ["primary", "secondary"]) {
    const outboard = name === "primary" ? 1 : -1;
    const mine = track.filter((i) => i.driving === name).map((i) => i[name]);
    const xs = mine.map((h) => h.pointerX);
    assert.ok(
      Math.max(...xs) - Math.min(...xs) > 1.0,
      `the ${name} should cut on its turn, span ${(Math.max(...xs) - Math.min(...xs)).toFixed(2)}`,
    );
    const chamber = outboard > 0 ? Math.max(...xs) : Math.min(...xs);
    assert.ok(
      chamber * outboard > 0.8,
      `the ${name} should chamber outside, on its own side: got ${chamber.toFixed(2)}`,
    );
    // And the wrist with it. `rollForStroke` derives the roll from the stroke,
    // so a mirrored stroke carries a mirrored roll by construction -- and the
    // sign of that roll is worth 91 % of a cut against 2 %, measured.
    const rolls = mine.map((h) => h.roll).filter((r) => r !== 0);
    assert.ok(
      rolls.length > 0 && rolls.every((r) => r * outboard < 0),
      `the ${name}'s edge should lead its own way round, rolls ${rolls.slice(0, 3)}`,
    );
  }

  // And whichever is not cutting is guarding rather than resting.
  const off = track.filter((i) => i[otherHand(i.driving)].guard);
  assert.ok(off.length > track.length * 0.8, `the spare blade should cover, ${off.length}/${track.length}`);
});

test("a swinger with a shield still never reads the opponent's blade", () => {
  // Its whole documented character. A shield that tracked an incoming point
  // would be a different policy wearing this one's name and this one's numbers.
  const seen = () => facing({ gap: 1.1, mine: { primary: "sword", secondary: "shield" } });
  const spent = () => {
    const view = seen();
    putTip(view, { x: 0.9, y: 2.1, z: 2.0 });
    view.opponent.hands.primary.tipSpeed = 14;
    return view;
  };
  const a = drive(policyMind("swinger", 11), 2, seen);
  const b = drive(policyMind("swinger", 11), 2, spent);
  assert.deepEqual(
    a.map((i) => [i.primary.pointerX, i.secondary.pointerX, i.secondary.roll]),
    b.map((i) => [i.primary.pointerX, i.secondary.pointerX, i.secondary.roll]),
  );
});

test("a duelist guards the hand that can hurt it, not the first hand", () => {
  // Their primary holds a shield out at the far side; their secondary holds the
  // sword, extended down the line. The guard has to be on the sword.
  const view = facing({
    gap: 1.4,
    theirs: { primary: "shield", secondary: "sword" },
  });
  view.opponent.hands.primary.tip = { x: 1.2, y: 1.4, z: 1.4 };
  view.opponent.hands.secondary.tip = { x: 0, y: 1.4, z: 0.2 };
  const out = ask(policyMind("duelist", 4), view);
  assert.ok(Math.abs(out.pointerX) < 0.1, `should cover the sword straight ahead, got ${out.pointerX}`);
});

test("a guard covers the arm they still have, not the sword on the floor", () => {
  // A severed arm keeps its weapon: the reference is still there and the blade
  // is still in the world as debris, so `HandView.tip` goes on reporting where
  // it fell. Covering that is covering a patch of ground.
  //
  // This was worth 3 severs and 4 points of mean damage across 40 bouts of
  // `duelist vs swinger`, which is the whole of why that table moved this
  // session: the default loadout has one armed hand and nothing else about it
  // changed.
  const view = facing({ gap: 1.4, theirs: { primary: "sword", secondary: "sword" } });
  // Their sword arm is off, and the blade has landed to one side of me -- near
  // enough that `coveringLine` would take it for an extended point rather than
  // falling back to the chest, which is what makes this a real test.
  view.opponent.hands.primary.lost = true;
  view.opponent.hands.primary.tip = { x: 0.7, y: 0.9, z: 0.4 };
  // The one they still have is extended down the line.
  view.opponent.hands.secondary.tip = { x: 0, y: 1.4, z: 0.2 };

  const out = ask(policyMind("duelist", 4), view);
  assert.ok(
    Math.abs(out.pointerX) < 0.1,
    `should cover the live hand straight ahead, got ${out.pointerX.toFixed(2)}`,
  );
});

test("an arm that has been cut off is not planned for", () => {
  const view = facing({ gap: 1.2, mine: { primary: "sword", secondary: "shield" } });
  view.self.hands.secondary.lost = true;
  const before = { ...blankIntent().secondary };
  const out = policyMind("duelist", 4).decide(view, FIXED);
  assert.deepEqual({ ...out.secondary }, before, "a lost arm keeps whatever it had");
});

test("the roll a stroke needs is folded for a blade and not for a bit", () => {
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
    assert.ok(
      Math.abs(Math.abs(folded - full) - Math.PI) < 1e-6,
      `${what}: and the two differ by exactly half a turn, which is bit against poll`,
    );
    // And the wrist can get there, which is not automatic: `arm.rollMin/rollMax`
    // is +-2.6 and the unfolded answer lives in (-pi, pi]. These four strokes
    // want 2.22, so nothing is clamped -- but a stroke that wanted 2.8 would be,
    // and would arrive poll-first however this function answered.
    assert.ok(Math.abs(full) < CONFIG.arm.rollMax, `${what}: and the wrist reaches it`);
  }

  // The default is the blade's, so every caller written before there was a
  // single-bitted weapon means what it meant.
  assert.equal(rollForStroke(0.85, 0.80, -0.70, -0.35), rollForStroke(0.85, 0.80, -0.70, -0.35, true));
});

test("a policy swings whatever it is holding, not only the kinds it was written with", () => {
  // The hole this session is named for, at its sharpest. `isStriking` was
  // `kind === "sword" || kind === "club"` and session 03 made it the question a
  // policy asks to decide **which hand it attacks with** -- so a kind added to
  // the union, given a builder, a mesh, a config block and a picker entry would
  // be a weapon that compiles, ships, and that every policy in the program
  // silently declines to swing. The fighter stands there holding it, and nothing
  // anywhere says why.
  for (const name of ["swinger", "duelist"]) {
    // 1.0 m, not the 1.1 the sword tests use: an axe reaches 1.13 against a
    // sword's 1.385, so a policy that has learnt its own range stands out of
    // measure at 1.1 and walks rather than swings. That is the session's other
    // finding meeting this one, and it took a failing test to notice.
    const lead = drive(policyMind(name, 7), 4, () =>
      facing({ gap: 1.0, mine: { primary: "axe", secondary: "shield" } }),
    );
    assert.ok(
      lead.every((intent) => intent.driving === "primary"),
      `${name} should attack with an axe`,
    );
    const swept = lead.map((intent) => intent.primary.pointerX);
    assert.ok(
      Math.max(...swept) - Math.min(...swept) > 1.0,
      `${name}'s axe should actually cut, span ${Math.max(...swept) - Math.min(...swept)}`,
    );

    // And in the other hand, against a shield that must never be swung.
    const off = drive(policyMind(name, 7), 4, () =>
      facing({ gap: 1.0, mine: { primary: "shield", secondary: "axe" } }),
    );
    assert.ok(
      off.every((intent) => intent.driving === "secondary"),
      `${name} should not attack with a shield when it has an axe`,
    );
  }
});

/**
 * The archer, which is the first policy here that does not fence.
 *
 * Everything below is the pure half: what `decide` returns when it is shown a
 * view. What a bow is *worth* is `.review/bow.mjs` and `docs/measurements.md`,
 * and the two are deliberately not mixed -- these run in microseconds and that
 * runs the solver for minutes.
 */

test("an archer holds the button down and then lets go of it", () => {
  const mind = policyMind("archer", 4242);
  const view = facing({ gap: 6, mine: { primary: "bow", secondary: "empty" } });
  const asked = drive(mind, 4, () => view);

  const held = asked.filter((intent) => intent.thrust).length;
  assert.ok(held > 0, "it draws");
  assert.ok(held < asked.length, "and it lets go");

  // A loose is a *falling edge*, which is what `nextDraw` fires on, so what this
  // is really checking is that the policy spends whole steps with the button up
  // rather than flickering it. A policy that dropped the button for one step in
  // every two would draw nothing and shoot nothing, and would look identical in
  // a screenshot.
  let runs = 0;
  for (let i = 1; i < asked.length; i += 1) {
    const was = asked[i - 1].thrust;
    const now = asked[i].thrust;
    if (was && !now) runs += 1;
  }
  assert.ok(runs >= 1, "at least one release in four seconds");
  assert.ok(runs <= 6, `and not a flicker: ${runs} releases in four seconds`);
});

test("an archer shoots with the hand that holds the bow, not the one that swings", () => {
  // `isStriking` is false for a bow -- you do not swing one -- so `attackHand`
  // walks straight past the only hand that matters. `shootHand` is the sibling
  // question, and this is the difference between the two written down.
  const mind = policyMind("archer", 11);
  const view = facing({ gap: 6, mine: { primary: "sword", secondary: "bow" } });
  const asked = drive(mind, 2, () => view);
  assert.ok(
    asked.every((intent) => intent.driving === "secondary"),
    "the bow hand drives, even with a sword in the other",
  );
});

test("an archer keeps its distance, and closes when it has too much", () => {
  const mind = policyMind("archer", 7);
  const near = drive(mind, 0.5, () => facing({ gap: 2, mine: { primary: "bow", secondary: "empty" } }));
  assert.ok(near.every((i) => i.forward < 0), "too close: it backs away");

  const far = policyMind("archer", 7);
  const away = drive(far, 0.5, () => facing({ gap: 12, mine: { primary: "bow", secondary: "empty" } }));
  assert.ok(away.every((i) => i.forward > 0), "too far: it closes");
});

test("an archer with no bow keeps its distance and never pretends to fence", () => {
  // Deliberate rather than unfinished. The moment this policy grows a melee
  // branch it stops being a measurement of what a bow is worth.
  const mind = policyMind("archer", 3);
  const asked = drive(mind, 2, () => facing({ gap: 2, mine: { primary: "sword", secondary: "empty" } }));
  assert.ok(asked.every((i) => !i.thrust), "it does not draw a sword like a bow");
  assert.ok(asked.every((i) => i.forward < 0), "and it backs off rather than closing");
});

test("an archer aims above the mark, and further above it the further away it is", () => {
  /**
   * The drop over a flight is `g t^2 / 2` with `t = range / speed`, so the lift
   * in *metres* is quadratic in the range -- and the aiming **angle** is
   * therefore very nearly linear in it, because the angle is the lift over the
   * range. The first draft of this test asserted the quadratic on the cursor and
   * failed, correctly: the cursor is an angle.
   *
   * So the assertion is one no restatement of the formula can accidentally
   * satisfy. The fixture puts both shoulders at 1.40 m and the archer aims 120 mm
   * *below* the opponent's shoulder line, so with no lift at all it would aim
   * downward at **every** range. It aims downward close in and upward far out,
   * and the crossover is the ballistics being real.
   */
  const aimAt = (gap) => {
    const mind = policyMind("archer", 5);
    const view = facing({ gap, mine: { primary: "bow", secondary: "empty" } });
    const asked = drive(mind, 0.05, () => view);
    return asked[asked.length - 1].pointerY;
  };
  const level = cursorForElevation(0);
  const near = aimAt(3);
  const mid = aimAt(8);
  const far = aimAt(18);

  assert.ok(near < level, `close in it aims below level, at the chest: ${near.toFixed(4)}`);
  assert.ok(far > level, `far out it aims above level, over the chest: ${far.toFixed(4)}`);
  assert.ok(mid > near && far > mid, "and it rises all the way, without a step");
});
