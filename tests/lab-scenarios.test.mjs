/**
 * **The lab's scenarios and its address** (`src/lab/scenarios.ts`): what `?play=lab&…` opens,
 * the loadout it holds, and the address each choice writes.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { routeFor } from "../src/app-route.ts";
import { PHYSICS_HZ } from "../src/core/world.ts";
import { CHARACTERS } from "../src/character-lab/catalog.ts";
import { labAddress, labHref, LAB_CAMERAS, LAB_DOWN_IDS, LAB_HELD, LAB_MIND_IDS, LAB_PROJECTIONS, LAB_RATES, LAB_VIEWS, MODELS, SCENARIOS } from "../src/lab/scenarios.ts";

const DEFAULTS = { appearance: "default", scenario: null, model: "workshop-fighter", right: "empty", left: "empty", boots: true, armour: true, balance: null, mind: "script", down: "lie", barred: [], hz: 120,
  view: "world", camera: "free", projection: "orthographic", targets: 10, seed: 1 };
/** The Rogue as the workshop dresses it: boots, no armour. */
const ROGUE = { model: "workshop-rogue", boots: true, armour: false };

test("the_lab_address_names_a_scenario_a_character_a_rate_a_view_and_a_camera_or_falls_back", () => {
  assert.deepEqual(labAddress("?play=lab"), DEFAULTS);
  assert.deepEqual(labAddress("?play=lab&scenario=routine&model=workshop-rogue&right=club&left=club&boots=0&armour=1&balance=2.5&mind=guard&down=rise&barred=club,empty&hz=480&view=tactical&camera=chase&projection=perspective&targets=4&seed=7"),
    { appearance: "default", scenario: "routine", model: "workshop-rogue", right: "club", left: "club", boots: false, armour: true, balance: 2.5, mind: "guard", down: "rise",
      barred: ["empty", "club"], hz: 480, view: "tactical",
      camera: "chase", projection: "perspective", targets: 4, seed: 7 });
  // Each field falls back alone; a known value beside an unknown one is kept.
  assert.deepEqual(labAddress("?scenario=elsewhere&model=workshop-rogue&right=sword&left=club&boots=yes&mind=fighter&down=stand&barred=sword,club,club&hz=60&view=x-ray&camera=isometric&projection=fisheye&targets=31&seed=-1"),
    { ...DEFAULTS, ...ROGUE, left: "club", barred: ["club"], camera: "isometric" });
  assert.deepEqual(labAddress("?scenario=stance&model=golem&right=club&left=bow&armour=0&hz=480&view=tactical&camera=drone&projection=perspective"),
    { ...DEFAULTS, scenario: "stance", right: "club", armour: false, hz: 480, view: "tactical", projection: "perspective" });
});

test("a_body_wears_what_the_workshop_dresses_it_in_until_the_address_says_otherwise", () => {
  // The Warrior armoured, the Rogue not: the character workshop's own defaults.
  assert.deepEqual(CHARACTERS.fighter.defaults, { boots: true, armour: true, weapon: "sword-shield" });
  assert.deepEqual(CHARACTERS.rogue.defaults, { boots: true, armour: false, weapon: "bow" });
  assert.deepEqual(labAddress("?model=workshop-rogue"), { ...DEFAULTS, ...ROGUE });
  // The skeleton wears nothing.
  assert.deepEqual(labAddress("?model=crypt-skeleton"), { ...DEFAULTS, model: "crypt-skeleton", boots: false, armour: false });
  // An explicit switch wins either way, for either body.
  assert.deepEqual(labAddress("?model=workshop-rogue&armour=1&boots=0"), { ...DEFAULTS, ...ROGUE, armour: true, boots: false });
  assert.deepEqual(labAddress("?armour=0&boots=1"), { ...DEFAULTS, armour: false });
  // The hands hold nothing unless the address says so; the workshop's weapon is not the lab's.
  assert.deepEqual(LAB_HELD, ["empty", "club"]);
});

test("every_choice_the_lab_offers_reads_back_from_the_address_it_writes", () => {
  for (const scenario of [null, ...SCENARIOS.map((s) => s.id)]) {
    for (const { id: model } of MODELS) {
      for (const [hz, view, balance] of LAB_RATES.flatMap((r) => LAB_VIEWS.flatMap((v) => [null, 0, 5].map((b) => [r, v, b])))) {
        for (const camera of LAB_CAMERAS) {
          for (const projection of LAB_PROJECTIONS) {
            for (const right of LAB_HELD) {
              for (const left of LAB_HELD) {
                for (const boots of [false, true]) {
                  for (const armour of [false, true]) {
                    for (const [mind, barred] of LAB_MIND_IDS.flatMap((m) => [[], ["empty"], ["club"], ["empty", "club"]].map((b) => [m, b]))) {
                      // The Routine's targets and their seed ride with the scenario, so that each is met with every choice; what a body does once down rides with its armour.
                      const [targets, seed] = scenario === null ? [10, 1] : [SCENARIOS.findIndex((s) => s.id === scenario), 4294967295];
                      const down = LAB_DOWN_IDS[Number(armour)];
                      const address = { appearance: "default", scenario, model, right, left, boots, armour, balance, mind, down, barred, hz, view, camera, projection, targets, seed }, href = labHref(address);
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
  }
});

test("a_balance_in_the_address_is_a_plain_decimal_per_cent_none_or_more_or_the_characters_own", () => {
  assert.deepEqual(["0", "5", "0.5", "%205%20", "20.5"].map((text) => labAddress(`?balance=${text}`).balance), [0, 5, 0.5, 5, 20.5]);
  for (const text of ["", "%20", "-1", "-0", "%2B5", "1e3", "0x10", ".5", "5.", "5,5", "many", "Infinity", "NaN", "9".repeat(400)]) {
    assert.equal(labAddress(`?balance=${text}`).balance, null, text);
  }
  assert.equal(labAddress("?play=lab").balance, null);
  // The character's own is no parameter at all, and replaces one that was there.
  assert.equal(new URLSearchParams(labHref(DEFAULTS, "?play=lab&balance=3")).has("balance"), false);
  assert.deepEqual(new URLSearchParams(labHref({ ...DEFAULTS, balance: 0 }, "?play=lab&balance=3")).getAll("balance"), ["0"]);
});

test("the_routines_targets_and_their_seed_are_whole_numbers_in_the_address_or_the_routines_own", () => {
  assert.deepEqual(["0", "4", "30"].map((text) => labAddress(`?targets=${text}`).targets), [0, 4, 30]);
  for (const text of ["", "31", "-1", "1.5", "1e1", "0x4", "%204", "many", "9".repeat(400)]) assert.equal(labAddress(`?targets=${text}`).targets, 10, text);
  assert.deepEqual(["0", "2", "4294967295"].map((text) => labAddress(`?seed=${text}`).seed), [0, 2, 4294967295]);
  for (const text of ["", "4294967296", "-1", "1.0", "one", "9".repeat(400)]) assert.equal(labAddress(`?seed=${text}`).seed, 1, text);
  // The routine's own are no parameters at all, and replace ones that were there.
  const own = new URLSearchParams(labHref(DEFAULTS, "?play=lab&targets=4&seed=9"));
  assert.deepEqual([own.has("targets"), own.has("seed")], [false, false]);
  const said = new URLSearchParams(labHref({ ...DEFAULTS, targets: 4, seed: 9 }, "?play=lab&targets=7&seed=3"));
  assert.deepEqual([said.getAll("targets"), said.getAll("seed")], [["4"], ["9"]]);
});

test("the_lab_address_keeps_the_rest_of_the_query_and_replaces_its_own", () => {
  const href = labHref({ ...DEFAULTS, ...ROGUE, right: "club", hz: 480 },
    "?play=lab&scenario=routine&model=workshop-fighter&right=empty&armour=1&hz=120&quality=reduced");
  const query = new URLSearchParams(href);
  assert.equal(query.get("quality"), "reduced");
  assert.equal(query.has("scenario"), false, "going back to the menu drops the scenario");
  assert.deepEqual(query.getAll("play"), ["lab"]);
  assert.deepEqual(query.getAll("model"), ["workshop-rogue"]);
  assert.deepEqual(query.getAll("right"), ["club"]);
  assert.deepEqual(query.getAll("armour"), ["0"]);
  // What the address writes only when it has it is dropped when it has not.
  assert.equal(new URLSearchParams(labHref(DEFAULTS, "?play=lab&barred=club&mind=guard")).has("barred"), false);
  assert.deepEqual(new URLSearchParams(labHref({ ...DEFAULTS, barred: ["empty"] }, "?play=lab&barred=club&mind=guard")).getAll("barred"), ["empty"]);
  assert.deepEqual(new URLSearchParams(labHref(DEFAULTS, "?play=lab&barred=club&mind=guard")).getAll("mind"), ["script"]);
  assert.deepEqual(new URLSearchParams(labHref({ ...DEFAULTS, down: "rise" }, "?play=lab&down=lie&down=lie")).getAll("down"), ["rise"]);
  // One address is one link, wherever in the query its keys stood before.
  assert.equal(labHref({ ...DEFAULTS, down: "rise" }, "?down=lie&play=lab&kept=1&down=lie"), labHref({ ...DEFAULTS, down: "rise" }, "?play=lab&kept=1"));
});

test("the_lab_offers_the_game_rate_first_and_distinct_scenarios", () => {
  assert.equal(LAB_RATES[0], PHYSICS_HZ.value);
  assert.equal(new Set(SCENARIOS.map((s) => s.id)).size, SCENARIOS.length);
  assert.ok(SCENARIOS.every((s) => s.name && s.line));
  assert.deepEqual(SCENARIOS.map((s) => s.id), ["stance", "routine", "run", "blow"]);
  assert.equal(labAddress("?play=lab&scenario=run").scenario, "run");
});
