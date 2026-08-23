import test from "node:test";
import assert from "node:assert/strict";

import { POLICIES, policyMind } from "../src/mind.ts";
import { rollForStroke } from "../src/policies.ts";
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
 * A fighter's view of an opponent standing `gap` metres away, shoulder to
 * shoulder, straight ahead.
 *
 * `blade` says what the opponent's point is doing: "line" is a guard pointed at
 * my chest, which is the thing a duelist must not commit into; "away" is a blade
 * that has been spent somewhere else.
 */
function facing({ gap = 1.4, blade = "line", tipSpeed = 0, measure = null, clock = 0 } = {}) {
  const tip =
    blade === "line"
      ? { x: 0, y: 1.4, z: gap - 1.3 }
      : { x: 0.9, y: 2.1, z: gap + 0.6 };
  return {
    self: {
      ground: { x: 0, y: 0, z: 0 },
      facing: 0,
      shoulder: { x: 0, y: 1.4, z: 0 },
      tip: { x: 0, y: 1.4, z: 1.3 },
      tipSpeed: 0,
      reach: CONFIG.arm.reachNeutral,
      health: whole(),
    },
    opponent: {
      ground: { x: 0, y: 0, z: gap },
      facing: Math.PI,
      shoulder: { x: 0, y: 1.4, z: gap },
      tip,
      tipSpeed,
      health: whole(),
    },
    measure: measure === null ? gap - 0.4 : measure,
    clock,
  };
}

/** One intent, copied, because a mind hands back the same object every call. */
const snapshot = (intent) => ({ ...intent });

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
    ["idle", "swinger", "duelist"],
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

test("swinger turns toward whatever is in front of it", () => {
  const mind = policyMind("swinger", 7);
  const toTheRight = { ...facing({ gap: 2.0 }) };
  toTheRight.opponent = { ...toTheRight.opponent, ground: { x: 2.0, y: 0, z: 0 } };
  assert.ok(mind.decide(toTheRight, FIXED).turn > 0.5, "a target at +X is a right turn");

  const toTheLeft = { ...facing({ gap: 2.0 }) };
  toTheLeft.opponent = { ...toTheLeft.opponent, ground: { x: -2.0, y: 0, z: 0 } };
  assert.ok(mind.decide(toTheLeft, FIXED).turn < -0.5, "a target at -X is a left turn");

  // Straight ahead is no turn at all, which is the case a sign error still
  // passes and a gain error does not.
  assert.equal(Math.abs(mind.decide(facing({ gap: 2.0 }), FIXED).turn) < 1e-9, true);

  // And with the body already pointed somewhere, because a heading error taken
  // against the wrong zero is the classic way a policy ends up spinning.
  const turned = facing({ gap: 2.0 });
  turned.self.facing = Math.PI / 2;
  turned.opponent.ground = { x: 2.0, y: 0, z: 0 };
  assert.ok(Math.abs(mind.decide(turned, FIXED).turn) < 1e-9, "already facing it is no turn");
  turned.opponent.ground = { x: 2.0, y: 0, z: 2.0 };
  assert.ok(mind.decide(turned, FIXED).turn < -0.5, "a target off its left shoulder is a left turn");
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
  const intent = mind.decide(facing({ gap: 1.4, blade: "line" }), FIXED);
  assert.equal(intent.guard, true);

  // The point is straight ahead and level, so the covering line is centre guard.
  assert.ok(Math.abs(intent.pointerX) < 0.05, `pointerX ${intent.pointerX}`);
  assert.ok(Math.abs(intent.pointerY) < 0.05, `pointerY ${intent.pointerY}`);

  // Lift the point and the guard follows it up rather than staying level.
  const high = facing({ gap: 1.4 });
  high.opponent.tip = { x: 0, y: 2.1, z: 0.4 };
  const covering = mind.decide(high, FIXED);
  assert.ok(covering.pointerY > 0.3, `the guard should rise to a high point, got ${covering.pointerY}`);

  // A point that is not extended toward it -- chambered, dropped, or hanging off
  // a fighter that has turned away -- is not the thing to cover, and chasing one
  // drags the guard off the body it is supposed to be standing between. So the
  // covering line falls back to the chest, which here is dead ahead and level.
  const spent = mind.decide(facing({ gap: 1.4, blade: "away" }), FIXED);
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
  view.opponent.tip = { x: 0.1, y: 1.4, z: 0 };

  const ahead = mind.decide(view, FIXED);
  assert.ok(Math.abs(ahead.pointerX) < 0.05, `straight ahead is centre, got ${ahead.pointerX}`);

  // Looking down +X, the fighter's right hand side is world -Z.
  view.opponent.tip = { x: 0.6, y: 1.4, z: -0.6 };
  const outboard = mind.decide(view, FIXED);
  assert.ok(outboard.pointerX > 0.3, `a point at the fighter's right is +X on the cursor, got ${outboard.pointerX}`);

  view.opponent.tip = { x: 0.6, y: 1.4, z: 0.6 };
  const across = mind.decide(view, FIXED);
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
    view.opponent.tip = {
      x: view.self.shoulder.x + Math.sin(azimuth) * cos,
      y: view.self.shoulder.y + Math.sin(elevation),
      z: view.self.shoulder.z + Math.cos(azimuth) * cos,
    };
    return mind.decide(view, FIXED);
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
    mind.decide(facing({ gap: 0.7, measure: 0.4 }), FIXED).forward < -0.5,
    "a point in its face is a reason to back off",
  );
  assert.ok(
    mind.decide(facing({ gap: 2.2, measure: 1.8 }), FIXED).forward > 0.5,
    "two metres of daylight is a reason to close",
  );
  assert.ok(
    Math.abs(mind.decide(facing({ gap: 1.4, measure: 1.0 }), FIXED).forward) < 1e-9,
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
  const near = mind.decide(facing({ gap: 1.55, measure: 1.15 }), FIXED).forward;
  const far = mind.decide(facing({ gap: 1.9, measure: 1.5 }), FIXED).forward;

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
