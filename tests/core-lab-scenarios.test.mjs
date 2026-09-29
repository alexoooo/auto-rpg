/**
 * **The lab's scenarios and its address** (`src/core-lab/scenarios.ts`): what `?play=lab&…` opens,
 * and the address each choice writes.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { routeFor } from "../src/app-route.ts";
import { PHYSICS_HZ } from "../src/core/engine/havok.ts";
import { labAddress, labHref, LAB_RATES, MODELS, SCENARIOS } from "../src/core-lab/scenarios.ts";

test("the_lab_address_names_a_scenario_a_character_and_a_rate_or_falls_back", () => {
  assert.deepEqual(labAddress("?play=lab"), { scenario: null, model: "workshop-fighter", hz: 120 });
  assert.deepEqual(labAddress("?play=lab&scenario=routine&model=workshop-rogue&hz=480"),
    { scenario: "routine", model: "workshop-rogue", hz: 480 });
  // Each field falls back alone; a known value beside an unknown one is kept.
  assert.deepEqual(labAddress("?scenario=elsewhere&model=workshop-rogue&hz=60"),
    { scenario: null, model: "workshop-rogue", hz: 120 });
  assert.deepEqual(labAddress("?scenario=stance&model=golem&hz=480"), { scenario: "stance", model: "workshop-fighter", hz: 480 });
});

test("every_choice_the_lab_offers_reads_back_from_the_address_it_writes", () => {
  for (const scenario of [null, ...SCENARIOS.map((s) => s.id)]) {
    for (const { id: model } of MODELS) {
      for (const hz of LAB_RATES) {
        const address = { scenario, model, hz }, href = labHref(address);
        assert.equal(routeFor(href), "lab", href);
        assert.deepEqual(labAddress(href), address, href);
      }
    }
  }
});

test("the_lab_address_keeps_the_rest_of_the_query_and_replaces_its_own", () => {
  const href = labHref({ scenario: null, model: "workshop-rogue", hz: 480 },
    "?play=lab&scenario=routine&model=workshop-fighter&hz=120&drawFraction=0.5");
  const query = new URLSearchParams(href);
  assert.equal(query.get("drawFraction"), "0.5");
  assert.equal(query.has("scenario"), false, "going back to the menu drops the scenario");
  assert.deepEqual(query.getAll("play"), ["lab"]);
  assert.deepEqual(query.getAll("model"), ["workshop-rogue"]);
});

test("the_lab_offers_the_game_rate_first_and_distinct_scenarios", () => {
  assert.equal(LAB_RATES[0], PHYSICS_HZ.value);
  assert.equal(new Set(SCENARIOS.map((s) => s.id)).size, SCENARIOS.length);
  assert.ok(SCENARIOS.every((s) => s.name && s.line));
});
