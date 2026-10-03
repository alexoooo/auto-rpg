/**
 * **A strike search's evaluator and its score** (`research/core-blow.mjs`,
 * `research/core-strike-repertoire.mjs`): a blow thrown through the strike skill at a target body
 * is read by the rule a fight wounds by, and is worth what it does less what it costs; a miss
 * scores under any hit, a nearer one higher; a blow that leaves the body down scores a fall,
 * whatever it does when it lands; a target body of a band is that band's part's mass and surface;
 * and a cell keeps its recipe only over the placed blow. Node core stand, Rapier, 120 Hz, no
 * assist, the arena's rulebook.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { humanSpec } from "../src/core/human/spec.ts";
import { SEGMENT_DENSITY } from "../src/core/human/tables/densities.ts";
import { woundedIn } from "../src/core/rules/blows.ts";
import { BANDS, FIST, REPERTOIRE } from "../src/core/skills/strikes.ts";
import { bandRise } from "../src/lab/blow.ts";
import { dummySpec } from "../src/lab/targets.ts";
import { balanceTrace, candidateScore, decodeHeld, dimensionsHeld, encodeHeld, evaluateBlow, FELL, heldSpec, scoreOf } from "../research/core-blow.mjs";
import { keeps } from "../research/core-strike-repertoire.mjs";
import { specProvenanceFaults } from "./fixtures/spec.mjs";
import { WARRIOR_STRAIGHT } from "./fixtures/strikes.mjs";

const WARRIOR = humanSpec("workshop-fighter");
const CLUB = REPERTOIRE.find((recipe) => recipe.model === "workshop-fighter" && recipe.held === "wooden club" && recipe.band === "high");
const club = (more) => evaluateBlow({ model: CLUB.model, held: CLUB.held, band: CLUB.band, strike: CLUB.strike, ahead: CLUB.place.ahead, ...more });
const straight = (more) => evaluateBlow({ model: WARRIOR_STRAIGHT.model, held: FIST, band: "high", strike: WARRIOR_STRAIGHT.strike, ahead: WARRIOR_STRAIGHT.place.ahead, ...more });

/** What every blow of a reading took from `fighter`, HP. */
const takenBy = (blows, fighter) => blows.reduce((sum, blow) => sum + (woundedIn(blow).find((side) => side.fighter === fighter)?.damage ?? 0), 0);
const near = (a, b) => Math.abs(a - b) < 1e-9;

/** Every trunk freedom pushed flat out for a second, from the guard: a blow no body stands after. */
const THROWN_DOWN = {
  name: "every trunk freedom, flat out", hand: "right",
  pushes: ["thoracic rotation right", "lumbar rotation right", "thoracic flexion", "thoracic lateral flexion right", "lumbar flexion"]
    .map((channel) => ({ channel, sense: 1, from: 0, to: 1, level: 1 })),
};

test("a_blow_is_scored_by_what_it_does_less_what_it_costs", async () => {
  // The Warrior's club recipe at its place: the club is rigid and takes none of it.
  const hit = await club();
  assert.deepEqual(Object.keys(hit), ["done", "cost", "nearest", "fell", "stood", "blows"]);
  assert.deepEqual({ cost: hit.cost, nearest: hit.nearest, fell: hit.fell, stood: hit.stood }, { cost: 0, nearest: 0, fell: false, stood: true });
  assert.ok(hit.done > 0.5 && hit.blows.length > 0, `${hit.done} HP in ${hit.blows.length} blows`);
  assert.ok(near(hit.done, takenBy(hit.blows, "dummy")) && takenBy(hit.blows, "attacker") === 0, `${hit.done} HP of ${takenBy(hit.blows, "dummy")}`);
  assert.equal(scoreOf(hit), hit.done);

  // A bare fist at a head: the hand is the softer of the two and takes the more of it.
  const fist = await straight();
  assert.deepEqual({ nearest: fist.nearest, fell: fist.fell, stood: fist.stood }, { nearest: 0, fell: false, stood: true });
  assert.ok(fist.done > 0.02 && fist.cost > fist.done, `it did ${fist.done} HP and cost ${fist.cost}`);
  const damage = fist.blows.reduce((sum, blow) => sum + woundedIn(blow).reduce((all, side) => all + side.damage, 0), 0);
  assert.ok(near(fist.done + fist.cost, damage) && near(fist.cost, takenBy(fist.blows, "attacker")), `${fist.done} and ${fist.cost} HP of ${damage}`);
  assert.equal(scoreOf(fist), fist.done - fist.cost);
  assert.ok(scoreOf(fist) < 0 && scoreOf(fist) < scoreOf(hit));
});

test("a_blow_thrown_at_nothing_does_nothing_and_is_read", async () => {
  const nothing = await straight({ dummy: false });
  assert.deepEqual(nothing, { done: 0, cost: 0, nearest: null, fell: false, stood: true, blows: [] });
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
  const thrown = { model: "workshop-fighter", held: FIST, band: "high", strike: THROWN_DOWN, ahead: WARRIOR_STRAIGHT.place.ahead };
  const [at, atNothing] = [await evaluateBlow(thrown), await evaluateBlow({ ...thrown, dummy: false })];
  assert.deepEqual([scoreOf(at), scoreOf(atNothing)], [FELL, FELL]);
  assert.equal(atNothing.fell || !atNothing.stood, true);
  // Up, and not standing on both feet at the end, is a fall too.
  assert.equal(scoreOf({ done: 1, cost: 0, nearest: 0, fell: false, stood: false }), FELL);
  // A candidate that lands and stands, and goes down when it misses, scores a fall whatever its trials read.
  const lands = { done: 1, cost: 0, nearest: 0, fell: false, stood: true };
  assert.equal(candidateScore([lands, lands], atNothing), FELL);
  assert.equal(candidateScore([lands, { ...lands, done: 0.5 }], { done: 0, cost: 0, nearest: null, fell: false, stood: true }), 0.75);
});

test("a_blow_traced_reads_the_same_and_says_how_its_body_kept_its_feet", async () => {
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
  // Its trunk turned right and leaned right: the capture point runs right.
  assert.ok(down.balance.aside[1] > 0.1 && down.balance.aside[1] > -down.balance.aside[0], `${down.balance.aside} m`);
});

test("a_middle_target_is_the_upper_trunks_mass_and_surface", () => {
  assert.deepEqual(BANDS, { high: "head", middle: "upperTrunk" });
  const spec = dummySpec(WARRIOR, BANDS.middle), trunk = WARRIOR.segments.find((segment) => segment.name === "upperTrunk");
  const head = WARRIOR.segments.find((segment) => segment.name === "head");
  assert.deepEqual(specProvenanceFaults(spec), []);
  assert.notEqual(trunk.shape.kind, "sphere");
  const [ball] = spec.segments, m = trunk.mass.value, r = Math.cbrt(3 * (m / (1000 * SEGMENT_DENSITY.upperTrunk.value)) / (4 * Math.PI));
  assert.deepEqual(
    { family: spec.family, model: spec.model, segments: spec.segments.map((segment) => segment.name), joints: spec.joints, mass: spec.mass.value,
      kind: ball.shape.kind, centre: ball.shape.centre.value, com: ball.centreOfMass.value, kg: ball.mass.value,
      surface: [ball.surface.stiffness.value, ball.surface.stiffness.unit], hp: spec.wounds.hp.value, vital: spec.wounds.vital, whole: spec.wounds.whole },
    { family: "dummy", model: "workshop-fighter.dummy", segments: ["upperTrunk"], joints: [], mass: m,
      kind: "sphere", centre: [0, 0, 0], com: [0, 0, 0], kg: m,
      surface: [trunk.surface.stiffness.value, "N/m"], hp: WARRIOR.wounds.hp.value, vital: [], whole: ["upperTrunk"] });
  // The trunk's surface is softer than a head's, and its ball the size its mass makes at its density.
  assert.ok(trunk.surface.stiffness.value < head.surface.stiffness.value / 2 && m > 2 * head.mass.value);
  assert.ok(Math.abs(ball.shape.radius.value - r) < 1e-9 && r > 0.12 && r < 0.18, `${ball.shape.radius.value} m of ${r}`);
  assert.equal(spec.stature.value, 2 * ball.shape.radius.value);
  const i = (2 / 5) * m * ball.shape.radius.value * ball.shape.radius.value;
  assert.deepEqual(ball.inertia.value, [i, i, i]);
  // It hangs at the height the thrower's own trunk is under its head.
  const rise = bandRise(WARRIOR, "middle");
  assert.equal(rise, trunk.centreOfMass.value[1] - head.centreOfMass.value[1]);
  assert.ok(rise < -0.15 && bandRise(WARRIOR, "high") === 0, `${rise} m`);
});

test("a_cell_keeps_its_recipe_only_over_the_placed_blow", () => {
  assert.equal(keeps(0.4, 0.3), true);
  assert.equal(keeps(0.3, 0.3), false);
  assert.equal(keeps(-0.2, -0.1), false);
  assert.equal(keeps(-0.1, -0.2), true);
});

test("a_recipe_is_the_numbers_a_search_goes_on_from", () => {
  for (const recipe of [...REPERTOIRE, WARRIOR_STRAIGHT]) {
    const spec = heldSpec(recipe.model, recipe.held), guard = !recipe.strike.chamber;
    const unit = encodeHeld(recipe.held, recipe.strike, recipe.place.ahead, spec);
    assert.equal(unit.length, dimensionsHeld(recipe.held, "right", guard));
    assert.ok(unit.every((u) => -1 <= u && u <= 1), `${recipe.model}, ${recipe.held}`);
    const { strike, distance } = decodeHeld(recipe.held, unit, spec, "right", guard);
    assert.ok(Math.abs(distance - recipe.place.ahead) < 1e-9, `${recipe.model}, ${recipe.held}: ${distance} m of ${recipe.place.ahead}`);
    assert.deepEqual(strike.pushes.map((p) => [p.channel, p.sense]), recipe.strike.pushes.map((p) => [p.channel, p.sense]), `${recipe.model}, ${recipe.held}`);
    strike.pushes.forEach((p, k) => {
      const given = recipe.strike.pushes[k];
      for (const [read, wrote] of [[p.from, given.from], [p.to, given.to], [p.level, given.level ?? 1]]) {
        assert.ok(Math.abs(read - wrote) < 1e-9, `${recipe.model}, ${recipe.held}, ${p.channel}: ${read} of ${wrote}`);
      }
    });
    if (guard) continue;
    assert.ok(Math.abs(strike.chamber.seconds - recipe.strike.chamber.seconds) < 1e-9);
    for (const [name, angle] of Object.entries(recipe.strike.chamber.pose)) assert.ok(Math.abs(strike.chamber.pose[name] - angle) < 1e-9, `${recipe.model}, ${recipe.held}, ${name}`);
  }
});
