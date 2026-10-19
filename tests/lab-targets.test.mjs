/**
 * **A lab target's reading** (`src/lab/targets.ts`): the blow the rule read on its dummy, hung as
 * its strike began, or how near the hand's body passed, of a recipe thrown where it lands and of a
 * blow placed where none does (Node core stand, Rapier, 120 Hz, no assist, the arena's rules). The
 * recipes are the fixture's (`tests/fixtures/strikes.mjs`): what is under test is the reading,
 * whatever a search finds. Where the strikes land is `lab-targets-capability`'s; the targets'
 * draws and their dummy are `lab-target-dummy`'s.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { humanSpec } from "../src/core/human/spec.ts";
import { impactEnergy } from "../src/core/rules/impact.ts";
import { blowDamage } from "../src/core/rules/rulebook.ts";
import { labActor } from "../src/lab/actor.ts";
import { loadoutSpec } from "../src/lab/loadout.ts";
import { readTarget, TARGET_WATCH } from "../src/lab/targets.ts";
import { pointScript } from "./fixtures/point-script.mjs";
import { FIXTURE_REPERTOIRE } from "./fixtures/strikes.mjs";
import { BARE, CLUB, CLUB_UNDER, CLUBBED, FISTED, RULES, UNSTRUCK, record, strikeAt } from "./fixtures/target-strikes.mjs";
import { coreStand } from "./harness/core-stand.mjs";

const WARRIOR = humanSpec("workshop-fighter");

test("a_target_where_the_recipe_lands_is_struck_with_it", {
  todo: "at `CLUB_UNDER` the club's swing ends a step with its third collider 3.5 cm from the dummy's centre, 5.7 cm inside its ball, at 10 m/s, and the next step reads no contact: no blow, and the dummy does not move; 2 cm higher or lower the blow is read",
}, async () => {
  // The club's recipe lands `CLUB_UNDER` under the head's height, 1.05 m off: the skill closes the last of 1.3 m itself.
  const struck = await strikeAt(CLUB, [(head) => [0, head - CLUB_UNDER, 1.3]]);
  assert.equal(struck.down, false);
  const [hit] = struck.readings;
  assert.deepEqual(record(hit), {
    target: { at: [0, struck.head - CLUB_UNDER, 1.3], stratum: "control" }, hand: "right", strike: "searched right club blow", hung: true, fell: false,
    ...CLUBBED,
  });
  assert.equal(hit.nearest, 0);
  assert.ok(hit.took.damage > 0 && hit.took.damage === blowDamage(RULES, "blunt", hit.blow.energy), `${hit.took.damage} HP of ${hit.blow.energy} J`);
  assert.equal(hit.blow.energy, impactEnergy(hit.gave.kg, hit.took.kg, hit.blow.closing));
  // The blow is the strike's own, and the watch outlasts the pushes by its seconds.
  assert.ok(hit.began <= hit.blow.time && hit.blow.time <= hit.ended, `struck at ${hit.blow.time} s of ${hit.began} to ${hit.ended}`);
  assert.ok(Math.abs(hit.seconds - hit.ended) < 1e-9 && hit.ended - hit.blow.time >= TARGET_WATCH - 0.25, `${hit.seconds} s`);
});

test("a_placed_blow_lands_whichever_way_the_body_faces", async () => {
  // A target a quarter turn to the body's right: it turns to it, and the hand's goal is the
  // target in the body's own frame, turned with it. It turns as it walks to its place, so it
  // faces the target from there: nearer the quarter turn than square to it either way, and the
  // target where a placed blow stands it.
  const stature = WARRIOR.stature.value;
  for (const [loadout, up, struck] of [[BARE, 0.6, FISTED], [CLUB, 0.5, CLUBBED]]) {
    const at = [1.3, up * stature, 0], { readings: [reading], down } = await strikeAt(loadout, [() => at]);
    assert.equal(down, false);
    const { off } = reading.strike;
    assert.ok(Math.abs(reading.heading - Math.PI / 2) < Math.PI / 4 && Math.abs(off.along) < 0.05 && Math.abs(off.across) < 0.05, `it faces ${reading.heading} rad, the target ${JSON.stringify(off)} off`);
    assert.deepEqual(record(reading), { target: { at, stratum: "control" }, hand: "right", strike: "placed", hung: true, fell: false, ...struck });
    assert.ok(reading.nearest === 0 && reading.took.damage > 0, `${reading.took.damage} HP`);
  }
});

test("a_reading_is_one_targets_own", {
  todo: "at `CLUB_UNDER` the club's swing ends a step with its third collider 3.5 cm from the dummy's centre, 5.7 cm inside its ball, at 10 m/s, and the next step reads no contact: no blow, and the dummy does not move; 2 cm higher or lower the blow is read",
}, async () => {
  // Two targets in turn: one where the club's recipe lands and an unreachable low point, explicitly refused.
  const { head, readings, down } = await strikeAt(CLUB, [(h) => [0, h - CLUB_UNDER, 1.3], (h) => [0, h - 1.5, 1.3]]);
  assert.equal(down, false);
  assert.deepEqual(readings.map(record), [
    { target: { at: [0, head - CLUB_UNDER, 1.3], stratum: "control" }, hand: "right", strike: "searched right club blow", hung: true, fell: false,
      ...CLUBBED },
    { target: { at: [0, head - 1.5, 1.3], stratum: "control" }, hand: "right", strike: null, hung: false, fell: false, ...UNSTRUCK },
  ]);
  const [first, second] = readings;
  assert.ok(first.blow.time < first.ended && first.ended < second.ended, `${first.blow.time}, ${first.ended}, ${second.began}`);
  assert.equal(second.nearest, null);
  assert.equal(second.ending?.ending.kind, "refused");
  assert.equal(second.ending?.committed, false);
});

test("a_target_is_a_place_and_no_body_until_its_strike_begins", async () => {
  // A target where the left hand comes up into its guard, struck at with the right: a body there
  // from the first is bumped by the guard, and stands in the way of the feet being set.
  const { readings, down } = await strikeAt(BARE, [(head) => [-0.12, head - 0.2, 0.45]]);
  assert.equal(down, false);
  const [reading] = readings;
  // Until the strike began its ball was the place it was drawn at, whatever passed through it.
  assert.ok(reading.before.length > 0, "the strike began at once: the fixture did not reach its case");
  assert.deepEqual(reading.before, reading.before.map(() => ({ centre: reading.target.at, radius: reading.before[0].radius })));
  // Hung as the strike began; nothing before the strike is a blow of its, whether or not the strike lands.
  assert.ok(reading.hung && reading.strike?.kind === "placed", JSON.stringify(record(reading)));
  if (reading.blow) assert.ok(reading.began <= reading.blow.time && reading.blow.time <= reading.ended, `touched at ${reading.blow.time} s of ${reading.began} to ${reading.ended}`);
});

test("a_target_in_the_bodys_place_is_hung_once_the_body_has_stepped_off_it", async () => {
  // A target in the middle of the chest: the skill steps back to its distance, and the place is
  // clear as the blow begins.
  const { readings, down } = await strikeAt(BARE, [(head) => [0, head - 0.35, 0]]);
  assert.equal(down, false);
  assert.deepEqual(readings.map(record), [{ target: { at: [0, readings[0].target.at[1], 0], stratum: "control" }, hand: "right", strike: "placed", hung: true, fell: false, ...FISTED }]);
});

/**
 * A strike at a place ahead, read as one at a target where the body's head is as the strike
 * begins: the head fills the place through the strike. `shoved`, the body is thrown off the place
 * by 150 N s through its chest as the pushes end, so the place is clear for the rest of the watch.
 */
async function strikeFromInside(shoved) {
  const stand = await coreStand(loadoutSpec(BARE), { ground: true });
  const actor = labActor(stand.built, stand.world);
  const ahead = [0, actor.body.view.head.y, 0.8], chest = stand.built.segments.get("upperTrunk"), head = stand.built.segments.get("head");
  let open = null, reading = null, ball = null, thrown = 0, clear = 0;
  actor.drive(pointScript(() => ({ key: 0, action: "strike", effector: "hand.right", target: { kind: "point", at: ahead, body: "dummy" } })), { skills: { repertoire: FIXTURE_REPERTOIRE }, watch(sight) {
    if (shoved && !thrown && (sight.report.actions.some(action => action.phase === "release") || sight.report.ledger.length > 0)) chest.body.applyImpulse(new Vector3(0, 0, -150), chest.node.position);
    thrown = sight.report.actions.some(action => action.phase === "release") || sight.report.ledger.length > 0;
    if (reading) return;
    if (!open) {
      if (!sight.report.actions.length) return;
      const { x, y, z } = sight.view.head;
      open = readTarget(actor, { at: [x, y, z], stratum: "control" }, "right", RULES, undefined, { repertoire: FIXTURE_REPERTOIRE });
    }
    ball = open.ball;
    // The steps of the watch at which the head is off the place by more than the ball and a hand's breadth.
    if (thrown && head.body.gapTo(ball.centre) - ball.radius > 0.1) clear += 1;
    reading = open.step(sight);
  } });
  try {
    for (let i = 0; i < stand.seconds(15) && !reading && !actor.body.view.down; i++) stand.step(1);
    // Down, the body is not its mind's to step: the reading is closed as it stands.
    return { reading: reading ?? open.fall(), ball, clear, down: actor.body.view.down };
  } finally { open?.dispose(); actor.dispose(); stand.dispose(); }
}

test("a_dummy_is_not_hung_in_a_place_the_body_fills", async () => {
  // Made inside the head, the solver would throw the head and the dummy apart, which is no blow.
  const { reading, ball, clear, down } = await strikeFromInside(false);
  assert.equal(down, false);
  assert.deepEqual(record(reading), { target: reading.target, hand: "right", strike: "searched right straight", hung: false, fell: false, ...UNSTRUCK });
  assert.equal(clear, 0);
  // Its ball stayed the place it was drawn at, and the hand's body was never off it by half a metre.
  assert.deepEqual(ball, { centre: reading.target.at, radius: ball.radius });
  assert.ok(reading.nearest !== null && reading.nearest < 0.5, `${reading.nearest}`);
});

test("a_dummy_is_not_hung_once_its_strikes_pushes_have_ended", async () => {
  // The same, the body thrown off the place as the pushes end, and down within the watch: the
  // place is clear from then on, and a dummy hung then would be there for no strike.
  const { reading, ball, clear, down } = await strikeFromInside(true);
  assert.ok(clear > 10, `the place was clear for ${clear} steps of the watch`);
  assert.deepEqual(record(reading), { target: reading.target, hand: "right", strike: "searched right straight", hung: false, fell: down, ...UNSTRUCK });
  assert.deepEqual(ball, { centre: reading.target.at, radius: ball.radius });
});
