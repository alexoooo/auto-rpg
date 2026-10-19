/**
 * **What a thrown blow does to its thrower** (`research/core-blow.mjs`, Node core stand, Rapier,
 * 120 Hz, no assist, the arena's rulebook): the club recipe and the Warrior's straight at their
 * places land and leave the body standing, the fist's costing it; thrown at nothing or out of reach
 * the body stands, and a blow out of reach passes the nearer the nearer it is thrown; every trunk
 * freedom pushed flat out throws the body down; and a traced blow says how its body kept its feet.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { humanSpec } from "../src/core/human/spec.ts";
import { woundedIn } from "../src/core/rules/blows.ts";
import { FIST, REPERTOIRE } from "../src/core/skills/strikes.ts";
import { balanceTrace, candidateScore, evaluateBlow, FELL, scoreOf, STEPPED } from "../research/core-blow.mjs";
import { WARRIOR_STRAIGHT } from "./fixtures/strikes.mjs";

const WARRIOR = humanSpec("workshop-fighter");
const CLUB = REPERTOIRE.find((recipe) => recipe.model === "workshop-fighter" && recipe.held === "wooden club" && recipe.band === "high");
const club = (more) => evaluateBlow({ model: CLUB.model, held: CLUB.held, band: CLUB.band, strike: CLUB.strike, ahead: CLUB.place.ahead, ...more });
const straight = (more) => evaluateBlow({ model: WARRIOR_STRAIGHT.model, held: FIST, band: "high", strike: WARRIOR_STRAIGHT.strike, ahead: WARRIOR_STRAIGHT.place.ahead, ...more });

/** What every blow of a reading took from `fighter`, HP. */
const takenBy = (blows, fighter) => blows.reduce((sum, blow) => sum + (woundedIn(blow).find((side) => side.fighter === fighter)?.damage ?? 0), 0);
const near = (a, b) => Math.abs(a - b) < 1e-9;

/**
 * Every trunk freedom pushed flat out for two seconds, from the guard, on a ground a metre square
 * (`THROWN_GROUND`): the stance catches the push by stepping, and the steps go off the ground.
 */
const THROWN_DOWN = {
  name: "every trunk freedom, flat out, held twice over", hand: "right",
  pushes: ["thoracic rotation right", "lumbar rotation right", "thoracic flexion", "thoracic lateral flexion right", "lumbar flexion"]
    .map((channel) => ({ channel, sense: 1, from: 0, to: 2, level: 1 })),
};
const THROWN_GROUND = 1;

test("a_blow_is_scored_by_what_it_does_less_what_it_costs", async () => {
  // The Warrior's club recipe at its place: the club is rigid and takes none of it.
  const hit = await club();
  assert.deepEqual(Object.keys(hit), ["done", "cost", "nearest", "fell", "stood", "recoveries", "blows"]);
  assert.deepEqual({ cost: hit.cost, nearest: hit.nearest, fell: hit.fell, stood: hit.stood }, { cost: 0, nearest: 0, fell: false, stood: true });
  assert.ok(hit.done > 0 && hit.blows.length > 0, `${hit.done} HP in ${hit.blows.length} blows`);
  assert.ok(near(hit.done, takenBy(hit.blows, "dummy")) && takenBy(hit.blows, "attacker") === 0, `${hit.done} HP of ${takenBy(hit.blows, "dummy")}`);
  assert.equal(scoreOf(hit), hit.done);

  // A bare fist exercises damage on both sides, without prescribing which side loses more HP.
  const fist = await straight();
  assert.deepEqual({ nearest: fist.nearest, fell: fist.fell, stood: fist.stood }, { nearest: 0, fell: false, stood: true });
  assert.ok(fist.done > 0 && fist.cost > 0 && fist.blows.length > 0, `it did ${fist.done} HP and cost ${fist.cost}`);
  const damage = fist.blows.reduce((sum, blow) => sum + woundedIn(blow).reduce((all, side) => all + side.damage, 0), 0);
  assert.ok(near(fist.done, takenBy(fist.blows, "dummy")) && near(fist.cost, takenBy(fist.blows, "attacker")), 'each side accounts for its own wounds');
  assert.ok(near(fist.done + fist.cost, damage), `${fist.done} and ${fist.cost} HP of ${damage}`);
  assert.equal(scoreOf(fist), fist.done - fist.cost);
});

test("a_blow_thrown_at_nothing_does_nothing_and_is_read", async () => {
  const nothing = await straight({ dummy: false });
  assert.deepEqual(nothing, { done: 0, cost: 0, nearest: null, fell: false, stood: true, recoveries: 0, blows: [] });
  // Beyond reach it misses, and is scored under any hit, by how near it passed: a body has fewer hit points than a miss is under.
  const [short, shorter] = [await straight({ ahead: WARRIOR_STRAIGHT.place.ahead + 0.5 }), await straight({ ahead: WARRIOR_STRAIGHT.place.ahead + 0.8 })];
  for (const miss of [short, shorter]) assert.deepEqual({ done: miss.done, cost: miss.cost, fell: miss.fell, stood: miss.stood, blows: miss.blows }, { done: 0, cost: 0, fell: false, stood: true, blows: [] });
  assert.ok(short.nearest > 0.2 && shorter.nearest > short.nearest + 0.2, `${short.nearest} and ${shorter.nearest} m`);
  const worst = -WARRIOR.wounds.hp.value;
  assert.ok(scoreOf(shorter) < scoreOf(short) && scoreOf(short) < worst && scoreOf(nothing) < scoreOf(shorter), `${scoreOf(nothing)}, ${scoreOf(shorter)}, ${scoreOf(short)}`);
  assert.ok(FELL < scoreOf(nothing));
  // A hit that costs the body every hit point it has is over the nearest miss.
  assert.ok(scoreOf({ done: 1e-9, cost: -worst, nearest: 0, fell: false, stood: true }) > scoreOf({ done: 0, cost: 0, nearest: 0, fell: false, stood: true }));
});

test("a_blow_that_leaves_the_body_down_scores_a_fall", async () => {
  const thrown = { model: "workshop-fighter", held: FIST, band: "high", strike: THROWN_DOWN, ahead: WARRIOR_STRAIGHT.place.ahead, ground: THROWN_GROUND };
  const [at, atNothing] = [await evaluateBlow(thrown), await evaluateBlow({ ...thrown, dummy: false })];
  assert.deepEqual([scoreOf(at), scoreOf(atNothing)], [FELL, FELL]);
  assert.equal(atNothing.fell || !atNothing.stood, true);
  // Up, and not standing on both feet at the end, is a fall too.
  assert.equal(scoreOf({ done: 1, cost: 0, nearest: 0, fell: false, stood: false }), FELL);
  // A candidate that lands and stands, and goes down when it misses, scores a fall whatever its trials read.
  const lands = { done: 1, cost: 0, nearest: 0, fell: false, stood: true };
  assert.equal(candidateScore([lands, lands], atNothing), FELL);
  const still = { done: 0, cost: 0, nearest: null, fell: false, stood: true, recoveries: 0 };
  assert.equal(candidateScore([lands, { ...lands, done: 0.5 }], still), 0.75);
  // Searched still, each step at nothing costs `STEPPED` on the mean, and any throw at nothing that falls is a fall.
  const stepped = { ...still, recoveries: 3 };
  assert.equal(candidateScore([lands], [still, stepped], false), 1);
  assert.equal(candidateScore([lands], [still, stepped], true), 1 - STEPPED * 1.5);
  assert.equal(candidateScore([lands], [still, still], true), 1);
  assert.equal(candidateScore([lands], [still, atNothing], true), FELL);
  // Fewer steps rank first, whatever the blows do.
  assert.ok(candidateScore([{ ...lands, done: 0.1 }], [still], true) > candidateScore([{ ...lands, done: 5 }], [{ ...still, recoveries: 1 }], true));
});

test("a_blow_traced_reads_the_same_and_says_how_its_body_kept_its_feet", {
  todo: "a bare hand strikes with its fist's measured surface (`closesToStrike`), about 9 cm short of the open capsule's fingers that its blows' spacing, aim and recipes were tuned to",
}, async () => {
  const traced = (thrown) => {
    let trace = null;
    return evaluateBlow({ ...thrown, dummy: false, trace: (body, blow) => (trace ??= balanceTrace(body)).take(body, blow) }).then((result) => ({ result, balance: trace.reading }));
  };
  const straightly = { model: WARRIOR_STRAIGHT.model, held: FIST, band: "high", strike: WARRIOR_STRAIGHT.strike, ahead: WARRIOR_STRAIGHT.place.ahead };
  // Traced, a blow reads as it does untraced.
  const [plain, standing] = [await straight({ dummy: false }), await traced(straightly)];
  assert.deepEqual(standing.result, plain);
  // A blow that stands keeps its capture point over its soles, and its stance took no step.
  assert.deepEqual([standing.balance.out, standing.balance.inner, standing.balance.left, standing.balance.recoveries, standing.balance.stepped], [0, 0, null, 0, false]);
  // One that throws the body down runs its capture point past the soles once its pushes have begun, and the stance steps after it.
  const down = await traced({ ...straightly, strike: THROWN_DOWN });
  assert.equal(down.result.fell || !down.result.stood, true);
  assert.ok(down.balance.out > 0.1 && down.balance.inner > down.balance.out, `${down.balance.out}, ${down.balance.inner} m`);
  assert.ok(down.balance.left >= 0 && down.balance.left < 0.5, `${down.balance.left} s`);
  assert.ok(down.balance.recoveries > 0 && down.balance.stepped);
  assert.equal(down.result.recoveries, down.balance.recoveries);
  // Its trunk turned right and leaned right: the capture point runs right.
  assert.ok(down.balance.aside[1] > 0.1 && down.balance.aside[1] > -down.balance.aside[0], `${down.balance.aside} m`);
});
