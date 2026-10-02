/**
 * **The lab's Blow scenario reads what the search reads** (`src/lab/blow-scenario.ts`): a stored
 * blow (`LAB_BLOWS`), thrown on the body the lab's loadout makes with what the blow was found
 * with in the hand (`throwBlow`, `watchBlow`), is read as the strike search's evaluator reads
 * that blow (`evaluateBlow`, `research/core-blow.mjs`), to the digit; the list is the unit blow
 * and every recipe of the repertoire; a blow's target hangs at its place from the head as the body
 * stands, a ball of its band's part; and the menu's Blow card puts the club in the right hand.
 * Node core stand, Rapier, 120 Hz. The control, run by hand: the lab's copy of the blow moved 1 cm
 * farther reads another blow, and fails.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { rulebook } from "../src/core/rules/rulebook.ts";
import { humanSpec } from "../src/core/human/spec.ts";
import { STAND } from "../src/core/skills/strike.ts";
import { BAND_NAMES, BANDS, FIST, REPERTOIRE } from "../src/core/skills/strikes.ts";
import { labActor } from "../src/lab/actor.ts";
import { bandRise, throwBlow, watchBlow } from "../src/lab/blow.ts";
import { LAB_BLOWS } from "../src/lab/blows.ts";
import { loadoutSpec } from "../src/lab/loadout.ts";
import { labAddress, labHref, SCENARIOS } from "../src/lab/scenarios.ts";
import { ballOf, dummySpec } from "../src/lab/targets.ts";
import { evaluateBlow, heldSpec } from "../research/core-blow.mjs";
import { WARRIOR_STRAIGHT } from "./fixtures/strikes.mjs";
import { coreStand } from "./harness/core-stand.mjs";

const plain = (value) => JSON.parse(JSON.stringify(value));
const RULES = rulebook("arena");

test("the_labs_blows_are_the_unit_blow_and_the_repertoire", async () => {
  const record = JSON.parse(await readFile(new URL("../research/core-club-unit.json", import.meta.url), "utf8"));
  const [unit, ...recipes] = LAB_BLOWS;
  assert.deepEqual(plain({ id: unit.id, model: unit.model, hand: unit.hand, held: unit.held, strike: unit.strike, place: unit.place, band: unit.band }),
    plain({ id: "unit", model: record.model, hand: record.hand, held: "wooden club", strike: record.strike, place: { ahead: record.distance, up: 0 }, band: "high" }));
  assert.deepEqual(plain(recipes.map(({ model, hand, held, strike, place, band }) => ({ model, hand, held, strike, place, band }))),
    plain(REPERTOIRE.map(({ model, held, strike, place, band }) => ({ model, hand: strike.hand, held, strike, place, band }))));
  assert.equal(new Set(LAB_BLOWS.map((blow) => blow.id)).size, LAB_BLOWS.length);
  for (const blow of LAB_BLOWS) assert.ok(blow.name.length > 0 && blow.line.length > 0, blow.id);
});

test("the_labs_blow_on_the_loadouts_body_reads_as_the_search_reads_it", async () => {
  const stored = LAB_BLOWS[0];
  const loadout = { model: stored.model, right: stored.held === FIST ? "empty" : "club", left: "empty", boots: true, armour: true };
  // The lab's body is the search's: the model's human with the club in the right hand.
  assert.deepEqual(plain(loadoutSpec(loadout)), plain(heldSpec(stored.model, stored.held, stored.hand)));
  const stand = await coreStand(loadoutSpec(loadout), { ground: true, hz: 120 });
  const actor = labActor(stand.built, stand.world);
  const blow = throwBlow(actor, { hand: stored.hand, strike: stored.strike, place: stored.place, band: stored.band });
  const watch = watchBlow(actor, blow, RULES);
  let lab;
  try {
    // To a second after the pushes end, as the search reads it.
    let ended = null;
    for (let i = 0; i < stand.seconds(8) && !(ended !== null && blow.time - ended >= 1); i++) {
      stand.step(1);
      if (ended === null && blow.report.strike.thrown[stored.hand] > 0) ended = blow.time;
    }
    lab = plain(watch.reading);
  } finally { watch.dispose(); blow.dispose(); stand.dispose(); }
  const search = await evaluateBlow({ model: stored.model, held: stored.held, hand: stored.hand, band: stored.band, strike: stored.strike, ahead: stored.place.ahead, hz: 120 });
  assert.ok(lab.hung && lab.done > 0.5 && lab.blows.length > 0, `the lab's blow did ${lab.done} HP`);
  assert.deepEqual({ done: lab.done, cost: lab.cost, nearest: lab.nearest, blows: lab.blows }, plain({ done: search.done, cost: search.cost, nearest: search.nearest, blows: search.blows }));
});

test("a_blows_target_hangs_at_its_place_from_the_head_a_ball_of_its_bands_part", async () => {
  const spec = humanSpec(WARRIOR_STRAIGHT.model);
  const rises = BAND_NAMES.map((band) => bandRise(spec, band));
  assert.ok(rises[0] === 0 && rises[1] < -0.15, `the bands' targets stand ${rises} m over the head`);
  for (const [band, off] of [["high", undefined], ["middle", undefined], ["middle", { along: -0.04, across: 0.05, up: 0.03 }]]) {
    const stand = await coreStand(spec, { ground: true, hz: 120 });
    const actor = labActor(stand.built, stand.world);
    const place = { ahead: 0.58, up: bandRise(spec, band) };
    const blow = throwBlow(actor, { hand: "right", strike: WARRIOR_STRAIGHT.strike, place, band });
    const watch = watchBlow(actor, blow, RULES, { off });
    try {
      // Nothing hangs, and nothing is a place, until the body has stood.
      stand.step(stand.seconds(STAND) - 2);
      assert.deepEqual({ centre: watch.centre, hung: watch.reading.hung }, { centre: null, hung: false });
      for (let i = 0; i < stand.seconds(1) && !watch.reading.hung; i++) stand.step(1);
      const head = blow.body.view.head, at = watch.centre;
      const want = [head.x + (off?.across ?? 0), head.y + place.up + (off?.up ?? 0), head.z + place.ahead + (off?.along ?? 0)];
      assert.ok(watch.reading.hung && at.every((c, k) => Math.abs(c - want[k]) < 0.02), `${band}: hung at ${at}, its place ${want}`);
      assert.equal(watch.radius, ballOf(dummySpec(spec, BANDS[band])).ball.radius.value);
    } finally { watch.dispose(); blow.dispose(); stand.dispose(); }
  }
});

test("the_blow_card_puts_the_club_in_the_right_hand", () => {
  const blow = SCENARIOS.find((s) => s.id === "blow");
  assert.deepEqual(blow.holds, { right: "club" });
  const from = labAddress("?play=lab&model=workshop-rogue");
  const opened = labAddress(labHref({ ...from, ...blow.holds, scenario: blow.id }, "?play=lab&model=workshop-rogue"));
  assert.deepEqual(opened, { ...from, right: "club", scenario: "blow" });
});
