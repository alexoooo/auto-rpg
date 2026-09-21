import test from "node:test";
import assert from "node:assert/strict";

import { splitMind } from "../src/mind.ts";

const intent = (base, actingHand = "primary") => ({
  forward: base + 1,
  strafe: base + 2,
  turn: base + 3,
  actingHand,
  natural: { thrust: base === 0, guard: base !== 0 },
  posture: { trunkLean: base + 4, trunkTwist: base + 5, crouch: base + 6 },
  primary: {
    pointerX: base + 7, pointerY: base + 8, reach: base + 15,
    roll: base + 9, wristBend: base + 10,
    thrust: base === 0, guard: base !== 0,
  },
  secondary: {
    pointerX: base + 11, pointerY: base + 12, reach: base + 16,
    roll: base + 13, wristBend: base + 14,
    thrust: base !== 0, guard: base === 0,
  },
});

const handsView = { self: { hands: { primary: { lost: false }, secondary: { lost: false } } } };

const mind = (name, answer) => ({ name, decide: () => answer });

/**
 * A person who has taken the whole body, with `posture` and `drivenWrist` as the case wants.
 *
 * The two `taken` fields are not decoration. `HumanOwnership` grew `locomotion` and `attack` when
 * the screen learned to hand over the feet and the hand separately, and every test in this file
 * is about what a person driving a hand gets -- so leaving them out would not be a shorter way of
 * saying the same thing, it would be the case where nobody took anything, and the assertions
 * below would all read the policy. The four fields are required on the TypeScript side; only an
 * untyped literal like this one can be partial, which is why it is spelled once here.
 */
const taken = (posture, drivenWrist) =>
  ({ posture, drivenWrist, locomotion: true, attack: true });

test("natural input becomes human-owned only after both usable hands are lost", () => {
  const human = intent(0), policy = intent(100);
  const split = splitMind(mind("human", human), mind("policy", policy), taken(false, false));
  for (const [primary, secondary] of [[false, false], [true, false], [false, true], [true, true]]) {
    const out = split.decide({self:{hands:{primary:{lost:primary},secondary:{lost:secondary}}}}, 1/240);
    assert.deepEqual(out.natural, primary && secondary ? human.natural : policy.natural);
  }
  assert.deepEqual(split.decide({self:{hands:{}}}, 1/240).natural, human.natural);
});

test("human_play_owns_posture_and_every_channel_of_the_driven_hand_when_enabled", () => {
  const human = intent(0);
  const policy = intent(100);
  const out = splitMind(
    mind("human", human), mind("policy", policy), taken(true, true),
  ).decide(handsView, 1 / 240);
  assert.deepEqual(out.posture, human.posture);
  assert.deepEqual(out.primary, human.primary);
  assert.deepEqual(out.secondary, policy.secondary);
  assert.deepEqual(out.natural, policy.natural, "head actions remain with the policy");
});

test("ai_assist_remains_the_owner_when_direct_body_control_is_disabled", () => {
  const human = intent(0);
  const policy = intent(100);
  const out = splitMind(
    mind("human", human), mind("policy", policy), taken(false, false),
  ).decide(handsView, 1 / 240);
  assert.deepEqual(out.posture, policy.posture);
  // The buttons follow the buttons rather than `ownership`. Thrust and guard on
  // the driven hand are the person's whether or not they own posture and wrist,
  // and the natural striker is on the same press -- so it does not change hands
  // with a switch that is about pose. It read the *policy's* natural until this
  // was measured, which left a person on a jawed body unable to bite at all.
  assert.deepEqual(out.natural, policy.natural);
  assert.notDeepEqual(policy.natural, human.natural, "the two sides really disagree here");
  assert.equal(out.primary.pointerX, human.primary.pointerX);
  assert.equal(out.primary.pointerY, human.primary.pointerY);
  // Reach is on the position side of the split, so it follows the two pointer
  // axes and not the wrist -- see `composeHand`. A person holding the buttons is
  // holding the extension whether or not they own the wrist.
  assert.equal(out.primary.reach, human.primary.reach);
  assert.equal(out.primary.roll, policy.primary.roll);
  assert.equal(out.primary.wristBend, policy.primary.wristBend);
  assert.deepEqual(out.secondary, policy.secondary);
});

test("swapping_hands_changes_only_which_wrist_the_controls_address", () => {
  const human = intent(0, "secondary");
  const policy = intent(100);
  const out = splitMind(
    mind("human", human), mind("policy", policy), taken(true, true),
  ).decide(handsView, 1 / 240);
  assert.deepEqual(out.primary, policy.primary);
  assert.deepEqual(out.secondary, human.secondary);
});

/**
 * The two channels the setup screen's **move** and **attack** boxes are.
 *
 * `posture` is held *off* through both halves so that the only thing moving between them is the
 * box under test. It is a third switch and it is deliberately orthogonal to these two -- see
 * `posture_is_its_own_switch_in_both_halves` below, which is where that costs something.
 */
test("each_channel_changes_hands_on_its_own_box", () => {
  const human = intent(0);
  const policy = intent(100);
  const split = (locomotion, attack) => splitMind(
    mind("human", human), mind("policy", policy),
    { posture: false, drivenWrist: true, locomotion, attack },
  ).decide(handsView, 1 / 240);

  const feetOnly = split(true, false);
  assert.equal(feetOnly.forward, human.forward, "the feet are the person's");
  assert.equal(feetOnly.strafe, human.strafe);
  assert.equal(feetOnly.turn, human.turn);
  assert.deepEqual(feetOnly.primary, policy.primary, "both hands stay with the mind");
  assert.deepEqual(feetOnly.secondary, policy.secondary);
  assert.deepEqual(feetOnly.natural, policy.natural, "and so do the buttons on them");

  const handOnly = split(false, true);
  assert.equal(handOnly.forward, policy.forward, "the body walks itself");
  assert.equal(handOnly.strafe, policy.strafe);
  assert.equal(handOnly.turn, policy.turn);
  assert.deepEqual(handOnly.primary, human.primary, "and fights with the person's hand");
  assert.deepEqual(handOnly.natural, policy.natural);
});

/**
 * Owning the trunk is not owning the attack, and this is the one place that costs something.
 *
 * `posture` gives the person lean, twist and crouch in **both** halves of the split, including
 * the half where the mind is doing the fighting. That is a real interaction and not an oversight:
 * `trunkTwist` is where a cut gets most of its speed -- the 2026-09-18 trunk fix found
 * `trunkSweep: 0.75` had never once fired, and every golem blow before it was arm-only -- so a
 * person who drives the feet and *also* takes the trunk hands the mind's sword back to its arm
 * alone.
 *
 * It is left that way because the alternative is worse in a shape this file cannot measure:
 * splitting the trunk again, twist to whoever attacks and lean-and-crouch to whoever moves, is a
 * third rule nobody has fought behind. The switch defaults to off (`splitMind`'s own default, and
 * the unticked box on the page), so the cost is only paid by somebody who asked for it by name.
 */
test("posture_is_its_own_switch_in_both_halves", () => {
  const human = intent(0);
  const policy = intent(100);
  const split = (posture, locomotion, attack) => splitMind(
    mind("human", human), mind("policy", policy),
    { posture, drivenWrist: true, locomotion, attack },
  ).decide(handsView, 1 / 240);

  assert.deepEqual(split(false, true, false).posture, policy.posture, "off, driving the feet");
  assert.deepEqual(split(true, true, false).posture, human.posture, "on, driving the feet");
  assert.deepEqual(split(false, false, true).posture, policy.posture, "off, driving the hand");
  assert.deepEqual(split(true, false, true).posture, human.posture, "on, driving the hand");
});

/**
 * A body a cursor could never be put on is drivable by the feet alone.
 *
 * `splitMind` refuses an intent that names no acting hand, because choosing a hand for somebody
 * would put them on an arm that may not exist. With **attack** off there is no person's hand in
 * the blend at all, so the refusal has nothing to refuse -- and this is what makes the box
 * useful rather than merely available: a golem built with no arms, or a centipede, now takes
 * WASD instead of being turned away at the door.
 */
test("a_body_with_no_hand_to_take_still_takes_the_feet", () => {
  const human = { ...intent(0), actingHand: null };
  const policy = intent(100);
  const own = (attack) =>
    ({ posture: false, drivenWrist: false, locomotion: true, attack });
  assert.throws(
    () => splitMind(mind("human", human), mind("policy", policy), own(true)).decide(handsView, 1 / 240),
    /acting hand/i,
  );
  const out = splitMind(mind("human", human), mind("policy", policy), own(false))
    .decide(handsView, 1 / 240);
  assert.equal(out.forward, human.forward);
  assert.deepEqual(out.primary, policy.primary);
});
