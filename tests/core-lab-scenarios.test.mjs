/**
 * **The lab's scenarios and its address** (`src/core-lab/scenarios.ts`): what `?play=lab&…` opens,
 * the loadout it holds, and the address each choice writes.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { routeFor } from "../src/app-route.ts";
import { PHYSICS_HZ } from "../src/core/engine/havok.ts";
import { CHARACTERS } from "../src/character-lab/catalog.ts";
import { labAddress, labHref, LAB_CAMERAS, LAB_HELD, LAB_PROJECTIONS, LAB_RATES, MODELS, SCENARIOS } from "../src/core-lab/scenarios.ts";

const DEFAULTS = { scenario: null, model: "workshop-fighter", right: "empty", left: "empty", boots: true, armour: true, hz: 120,
  camera: "free", projection: "orthographic" };
/** The Rogue as the workshop dresses it: boots, no armour. */
const ROGUE = { model: "workshop-rogue", boots: true, armour: false };

test("the_lab_address_names_a_scenario_a_character_a_rate_and_a_camera_or_falls_back", () => {
  assert.deepEqual(labAddress("?play=lab"), DEFAULTS);
  assert.deepEqual(labAddress("?play=lab&scenario=routine&model=workshop-rogue&right=club&left=club&boots=0&armour=1&hz=480&camera=chase&projection=perspective"),
    { scenario: "routine", model: "workshop-rogue", right: "club", left: "club", boots: false, armour: true, hz: 480, camera: "chase",
      projection: "perspective" });
  // Each field falls back alone; a known value beside an unknown one is kept.
  assert.deepEqual(labAddress("?scenario=elsewhere&model=workshop-rogue&right=sword&left=club&boots=yes&hz=60&camera=isometric&projection=fisheye"),
    { ...DEFAULTS, ...ROGUE, left: "club", camera: "isometric" });
  assert.deepEqual(labAddress("?scenario=stance&model=golem&right=club&left=bow&armour=0&hz=480&camera=drone&projection=perspective"),
    { ...DEFAULTS, scenario: "stance", right: "club", armour: false, hz: 480, projection: "perspective" });
});

test("a_body_wears_what_the_workshop_dresses_it_in_until_the_address_says_otherwise", () => {
  // The Warrior armoured, the Rogue not: the character workshop's own defaults.
  assert.deepEqual(CHARACTERS.fighter.defaults, { boots: true, armour: true, weapon: "sword-shield" });
  assert.deepEqual(CHARACTERS.rogue.defaults, { boots: true, armour: false, weapon: "bow" });
  assert.deepEqual(labAddress("?model=workshop-rogue"), { ...DEFAULTS, ...ROGUE });
  // An explicit switch wins either way, for either body.
  assert.deepEqual(labAddress("?model=workshop-rogue&armour=1&boots=0"), { ...DEFAULTS, ...ROGUE, armour: true, boots: false });
  assert.deepEqual(labAddress("?armour=0&boots=1"), { ...DEFAULTS, armour: false });
  // The hands hold nothing unless the address says so; the workshop's weapon is not the lab's.
  assert.deepEqual(LAB_HELD, ["empty", "club"]);
});

test("every_choice_the_lab_offers_reads_back_from_the_address_it_writes", () => {
  for (const scenario of [null, ...SCENARIOS.map((s) => s.id)]) {
    for (const { id: model } of MODELS) {
      for (const hz of LAB_RATES) {
        for (const camera of LAB_CAMERAS) {
          for (const projection of LAB_PROJECTIONS) {
            for (const right of LAB_HELD) {
              for (const left of LAB_HELD) {
                for (const boots of [false, true]) {
                  for (const armour of [false, true]) {
                    const address = { scenario, model, right, left, boots, armour, hz, camera, projection }, href = labHref(address);
                    assert.equal(routeFor(href), "lab", href);
                    assert.deepEqual(labAddress(href), address, href);
                  }
                }
              }
            }
          }
        }
      }
    }
  }
});

test("the_lab_address_keeps_the_rest_of_the_query_and_replaces_its_own", () => {
  const href = labHref({ ...DEFAULTS, ...ROGUE, right: "club", hz: 480 },
    "?play=lab&scenario=routine&model=workshop-fighter&right=empty&armour=1&hz=120&drawFraction=0.5");
  const query = new URLSearchParams(href);
  assert.equal(query.get("drawFraction"), "0.5");
  assert.equal(query.has("scenario"), false, "going back to the menu drops the scenario");
  assert.deepEqual(query.getAll("play"), ["lab"]);
  assert.deepEqual(query.getAll("model"), ["workshop-rogue"]);
  assert.deepEqual(query.getAll("right"), ["club"]);
  assert.deepEqual(query.getAll("armour"), ["0"]);
});

test("the_lab_offers_the_game_rate_first_and_distinct_scenarios", () => {
  assert.equal(LAB_RATES[0], PHYSICS_HZ.value);
  assert.equal(new Set(SCENARIOS.map((s) => s.id)).size, SCENARIOS.length);
  assert.ok(SCENARIOS.every((s) => s.name && s.line));
});
