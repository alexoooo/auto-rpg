/**
 * **Where the lab's strikes land on their targets** (`src/lab/targets.ts`; Node core stand, Rapier,
 * 120 Hz, no assist, the arena's rules): the club's recipe where it was searched to land, a placed
 * blow carried through a middle target, the Rogue's straight, and a target in the guard's way.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { humanSpec } from "../src/core/human/spec.ts";
import { PLACED } from "../src/core/skills/strike.ts";
import { BARE, CLUB, CLUB_UNDER, CLUBBED, FISTED, UNSTRUCK, bared, record, strikeAt } from "./fixtures/target-strikes.mjs";

const WARRIOR = humanSpec("workshop-fighter");

test("the club's recipe strikes a target where it was searched to land, from where its window holds it", async () => {
  const struck = await strikeAt(CLUB, [(head) => [0, head - CLUB_UNDER, 1.3]]);
  assert.equal(struck.down, false);
  const [hit] = struck.readings;
  assert.deepEqual(record(hit), {
    target: { at: [0, struck.head - CLUB_UNDER, 1.3], stratum: "control" }, hand: "right", strike: "searched right club blow", hung: true, fell: false,
    ...CLUBBED,
  });
  // Where the head stood is inside the club's window, and its hand went as fast as it goes.
  assert.ok(hit.strike.kind === "recipe" && hit.strike.band === "high" && Math.abs(hit.strike.off.along) < 0.05 && Math.abs(hit.strike.off.across) < 0.05 && hit.strike.peak > 5, JSON.stringify(hit.strike));
});

test("a_middle_target_is_struck_by_a_placed_blow", async () => {
  const stature = WARRIOR.stature.value, middle = [0, 0.6 * stature, 1.3];
  // Bare-handed, 0.6 of the stature up is half a metre under the straight's window: the knuckles are carried through it.
  const bare = await strikeAt(BARE, [() => middle]);
  assert.equal(bare.down, false);
  const [fist] = bare.readings;
  assert.deepEqual(record(fist), { target: { at: middle, stratum: "control" }, hand: "right", strike: "placed", hung: true, fell: false, ...FISTED });
  assert.ok(fist.nearest === 0 && fist.took.damage > 0 && fist.began <= fist.blow.time && fist.blow.time <= fist.ended, `struck at ${fist.blow.time} s of ${fist.began} to ${fist.ended}`);
  // It stood where a placed blow stands: the target the arm's stretch from the shoulder, ahead of the head.
  assert.ok(fist.strike.kind === "placed" && fist.strike.band === null && Math.abs(fist.strike.off.along) < 0.05 && Math.abs(fist.strike.off.across) < 0.05, JSON.stringify(fist.strike));
  // Carried through its target, the fist arrives faster than on a path that ends there.
  const { readings: [ended] } = await strikeAt(BARE, [() => middle], { placed: { ...PLACED, through: 0 } });
  assert.ok(PLACED.through > 0 && ended.blow && fist.blow.closing > 1.2 * ended.blow.closing, `closing at ${fist.blow.closing} m/s, and ${ended.blow?.closing} on a path that ends at the target`);

  // With the club a middle target is in its blow's window, and the recipe is thrown: read at 0.62
  // of the stature up, where the window holds it once the feet are set where they stand, with no
  // walk to it, so the blow is the recipe's own from its place. Half the stature up is under the
  // window, and the swell is carried there: the club's is the surface.
  const clubbed = [0, 0.62 * stature, 1.3], club = await strikeAt(CLUB, [() => clubbed]);
  assert.deepEqual(record(club.readings[0]), { target: { at: clubbed, stratum: "control" }, hand: "right", strike: "searched right club blow", hung: true, fell: false, ...CLUBBED });
  const half = [0, 0.5 * stature, 1.3], under = await strikeAt(CLUB, [() => half]);
  assert.equal(under.down, false);
  const [swell] = under.readings;
  assert.deepEqual(record(swell), { target: { at: half, stratum: "control" }, hand: "right", strike: "placed", hung: true, fell: false, ...CLUBBED });
  assert.ok(swell.nearest === 0 && swell.took.damage > 0, `${swell.took.damage} HP`);

  // The control: a fifth of the stature up is under the arm's reach from any place the body
  // stands, and is missed still: the reading says by how much.
  const low = [0, 0.2 * stature, 1.3], { readings: [miss], down } = await strikeAt(BARE, [() => low]);
  assert.equal(down, false);
  assert.deepEqual(record(miss), { target: { at: low, stratum: "control" }, hand: "right", strike: "placed", hung: true, fell: false, ...UNSTRUCK });
  assert.ok(miss.nearest > 0.1 && miss.nearest < 0.5, `it passed ${miss.nearest} m off`);
});

test("a_reading_is_of_the_blow_that_cost_its_dummy_most", async () => {
  // The Rogue's straight at a target 6 cm under its head's height as built, in the straight's
  // window: the fist and the forearm behind it land in one step, two blows, and the forearm's,
  // the lighter, is the one the rule reads first.
  const rogue = { ...BARE, model: "workshop-rogue" };
  const { head, readings, down } = await strikeAt(rogue, [(h) => [0, h - 0.06, 1.3]]);
  assert.equal(down, false);
  const [reading] = readings;
  assert.deepEqual(record(reading), {
    target: { at: [0, head - 0.06, 1.3], stratum: "control" }, hand: "right", strike: "searched right straight", hung: true, fell: false, ...bared("hand.right", rogue),
  });
  assert.ok(reading.blow.energy > 8 && reading.nearest === 0, `${reading.blow.energy} J`);
});

test("a target where the left hand comes up into its guard is struck by the placed blow", async () => {
  const { readings, down } = await strikeAt(BARE, [(head) => [-0.12, head - 0.2, 0.45]]);
  assert.equal(down, false);
  const [reading] = readings;
  assert.deepEqual(record(reading), { target: reading.target, hand: "right", strike: "placed", hung: true, fell: false, ...FISTED });
  assert.equal(reading.nearest, 0);
});
