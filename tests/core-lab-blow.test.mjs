/**
 * **The lab's Blow scenario reads what the search reads** (`src/core-lab/blow-scenario.ts`): the
 * stored blow (`LAB_BLOWS`), thrown on the body the lab's loadout makes with the club in the right
 * hand (`throwBlow`, `watchClubBlow`), lands with the energy the club search's evaluation gives
 * the unit's record itself (`research/core-club-strike.mjs`, `research/core-club-unit.json`), to
 * the digit; and the menu's Blow card puts the club in that hand. Node core stand, Rapier, 120 Hz.
 * The control, run by hand: the lab's copy of the blow moved 1 cm farther lands with 120.63 J
 * against the record's 119.45, and fails.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { armed } from "../src/core/human/grip.ts";
import { humanSpec } from "../src/core/human/spec.ts";
import { woodenClub } from "../src/core/items/club.ts";
import { STAND } from "../src/core/skills/strike.ts";
import { throwBlow } from "../src/core-lab/blow.ts";
import { LAB_BLOWS } from "../src/core-lab/blows.ts";
import { watchClubBlow } from "../src/core-lab/club-blow.ts";
import { loadoutSpec } from "../src/core-lab/loadout.ts";
import { labAddress, labHref, SCENARIOS } from "../src/core-lab/scenarios.ts";
import { evaluateClubStrike } from "../research/core-club-strike.mjs";
import { coreStand } from "./harness/core-stand.mjs";

const plain = (spec) => JSON.parse(JSON.stringify(spec));

test("the_labs_blow_on_the_loadouts_body_lands_as_the_search_reads_it", async () => {
  const stored = LAB_BLOWS[0];
  const loadout = { model: stored.model, right: "club", left: "empty", boots: true, armour: true };
  // The lab's body is the search's: the model's human with the club in the right hand.
  assert.deepEqual(plain(loadoutSpec(loadout)), plain(armed(humanSpec(stored.model), stored.hand, woodenClub())));
  const stand = await coreStand(loadoutSpec(loadout), { ground: true, hz: 120 });
  const blow = throwBlow(stand.built, stand.world, stored.strike, stored.distance);
  const watch = watchClubBlow(stand.built, stand.world, blow, stored.distance, stored.hand);
  try {
    for (let i = 0; i < stand.seconds(STAND + stored.strike.chamber.seconds + 0.5) && !watch.landed && !watch.fell; i++) stand.step(1);
  } finally { watch.dispose(); blow.dispose(); stand.dispose(); }
  const record = JSON.parse(await readFile(new URL("../research/core-club-unit.json", import.meta.url), "utf8"));
  const search = await evaluateClubStrike({ model: record.model, hand: record.hand, strike: record.strike, distance: record.distance, hz: 120 });
  console.log(`MUT lab blow: ${watch.landed?.energy.toFixed(2)} J at ${watch.landed?.at} s; the search's ${search.energy.toFixed(2)} J`);
  assert.ok(watch.landed, "the lab's blow lands");
  assert.equal(watch.landed.energy, search.energy);
  assert.equal(watch.landed.at, search.at);
});

test("the_blow_card_puts_the_club_in_the_right_hand", () => {
  const blow = SCENARIOS.find((s) => s.id === "blow");
  assert.deepEqual(blow.holds, { right: "club" });
  const from = labAddress("?play=lab&model=workshop-rogue");
  const opened = labAddress(labHref({ ...from, ...blow.holds, scenario: blow.id }, "?play=lab&model=workshop-rogue"));
  assert.deepEqual(opened, { ...from, right: "club", scenario: "blow" });
});
