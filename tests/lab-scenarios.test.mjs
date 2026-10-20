/**
 * **The lab's scenarios and its address** (`src/lab/scenarios.ts`): what `?play=lab&…` opens,
 * the loadout it holds, and the address each choice writes.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { VIEW_MODES, CAMERA_MODES, PROJECTIONS } from "../src/render/view.ts";
import { routeFor } from "../src/app-route.ts";
import { PHYSICS_HZ } from "../src/core/world.ts";
import { CHARACTERS } from "../src/character-lab/catalog.ts";
import { HELD } from "../src/core/items/held.ts";
import { SEARCH_FALL } from "../src/lab/stance-mode.ts";
import { labAddress, labHref, labMind, recoveryAddress, LAB_PRESETS, LAB_RATES, MODELS, SCENARIOS } from "../src/lab/scenarios.ts";
import { humanSpec } from "../src/core/human/spec.ts";
import { CLASSIC, PUNCHER } from "../src/core/mind/config.ts";
import { standIntent } from "../src/core/mind/intent.ts";
import { tacticsOf } from "../src/core/mind/tactics-of.ts";

const SCRIPT = LAB_PRESETS.script.config, GUARD = LAB_PRESETS.guard.config;
/** A mind no preset is: the Guard preset getting up once down. */
const RISING = { ...GUARD, subs: [{ kind: "support-recovery" }] };
const DEFAULTS = { ground: {level:"open",drive:"mind",rise:"step-up",waypoint:"none",start:"shoved",posture:"back",degrees:null,impulse:null,foe:0,gusts:false}, recoveryMode: "selected", recoveryPush: SEARCH_FALL, appearance: "default", scenario: null, model: "workshop-fighter", right: "empty", left: "empty", boots: true, armour: true, sole: false, balance: null, haste: null, mind: SCRIPT, barred: [], hz: 120,
  view: "world", camera: "free", projection: "orthographic", targets: 10, seed: 1 };
/** The Rogue as the workshop dresses it: boots, no armour. */
const ROGUE = { model: "workshop-rogue", boots: true, armour: false };

test("the_lab_address_names_a_scenario_a_character_a_rate_a_view_and_a_camera_or_falls_back", () => {
  assert.deepEqual(labAddress("?play=lab"), DEFAULTS);
  assert.deepEqual(labAddress("?play=lab&scenario=attack&model=workshop-rogue&right=club&left=club&boots=0&armour=1&sole=1&balance=2.5&mind=guard&barred=club,empty&hz=480&view=tactical&camera=chase&projection=perspective&targets=4&seed=7"),
    { ...DEFAULTS, appearance: "default", scenario: "attack", model: "workshop-rogue", right: "club", left: "club", boots: false, armour: true, sole: true, balance: 2.5, mind: GUARD,
      barred: ["empty", "club"], hz: 480, view: "tactical",
      camera: "chase", projection: "perspective", targets: 4, seed: 7 });
  // Each field falls back alone; a known value beside an unknown one is kept.
  assert.deepEqual(labAddress("?scenario=elsewhere&model=workshop-rogue&right=unknown-item&left=club&boots=yes&mind=fighter&down=stand&barred=unknown-item,club,club&hz=60&view=x-ray&camera=isometric&projection=fisheye&targets=31&seed=-1"),
    { ...DEFAULTS, ...ROGUE, left: "club", barred: ["club"], camera: "isometric" });
  // A mind is a preset's id or a whole tree as JSON, whose research tuning is dropped.
  assert.deepEqual(labAddress(`?mind=${encodeURIComponent(JSON.stringify(RISING))}`), { ...DEFAULTS, mind: RISING });
  const tuned = { ...GUARD, locomotion: { ...GUARD.locomotion, tuning: { turnLimit: 2 } } };
  assert.deepEqual(labAddress(`?mind=${encodeURIComponent(JSON.stringify(tuned))}`), { ...DEFAULTS, mind: GUARD });
  // A tree rooted in a mind of another kind is carried, for the page to refuse; anything else is the default.
  assert.deepEqual(labAddress(`?mind=${encodeURIComponent('{"kind":"direct"}')}`).mind, { kind: "direct" });
  for (const text of ["", "fighter", "{", '{"kind":"lie"}', '{"kind":"fly"}', "[]", "null"]) assert.deepEqual(labAddress(`?mind=${encodeURIComponent(text)}`).mind, SCRIPT, text);
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
  assert.deepEqual(HELD, ["empty", "club", "buckler", "sword"]);
});

/** Each choice the lab offers, as the values an address may hold for it. */
const CHOICES = {
  scenario: [null, ...SCENARIOS.map((s) => s.id)], model: MODELS.map(({ id }) => id), hz: LAB_RATES, view: VIEW_MODES, balance: [null, 0, 5],
  camera: CAMERA_MODES, projection: PROJECTIONS, right: HELD, left: HELD, boots: [false, true],
  dress: [[false, false], [false, true], [true, false], [true, true]],
  minded: [SCRIPT, GUARD, RISING].flatMap((m) => [[], ["empty"], ["club"], ["empty", "club"]].map((b) => [m, b])),
};

/** A uniform draw in [0, 1) from a 32-bit seed, the same on every engine (mulberry32). */
function draws(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test("every_choice_the_lab_offers_reads_back_from_the_address_it_writes", () => {
  // A diagonal through the choices meets every value of each; seeded draws then mix them.
  const axes = Object.entries(CHOICES), widest = Math.max(...axes.map(([, values]) => values.length)), draw = draws(1);
  const picks = [
    ...Array.from({ length: widest }, (_, i) => axes.map(([, values]) => values[i % values.length])),
    ...Array.from({ length: 400 }, () => axes.map(([, values]) => values[Math.floor(draw() * values.length)])),
  ];
  for (const pick of picks) {
    const { scenario, model, hz, view, balance, camera, projection, right, left, boots, dress: [armour, sole], minded: [mind, barred] } =
      Object.fromEntries(axes.map(([name], i) => [name, pick[i]]));
    // The Attack's targets and their seed ride with the scenario, so that each is met with other choices.
    const [targets, seed] = scenario === null ? [10, 1] : [SCENARIOS.findIndex((s) => s.id === scenario), 4294967295];
    const address = { ...DEFAULTS, appearance: "default", scenario, model, right, left, boots, armour, sole, balance, mind, barred, hz, view, camera, projection, targets, seed }, href = labHref(address);
    assert.equal(routeFor(href), "lab", href);
    assert.deepEqual(labAddress(href), address, href);
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

test("a_haste_in_the_address_is_a_signed_decimal_per_cent_over_a_persons_or_the_characters_own", () => {
  assert.deepEqual(["50", "+50", "0", "-37.5"].map((text) => labAddress(`?haste=${text}`).haste), [50, 50, 0, -37.5]);
  for (const text of ["", "-100", "-110", "fast", "Infinity"]) assert.equal(labAddress(`?haste=${text}`).haste, null, text);
  assert.equal(new URLSearchParams(labHref(DEFAULTS, "?play=lab&haste=50")).has("haste"), false);
  assert.deepEqual(new URLSearchParams(labHref({ ...DEFAULTS, haste: 50 }, "?play=lab")).getAll("haste"), ["50"]);
});

test("the_attacks_targets_and_their_seed_are_whole_numbers_in_the_address_or_the_attacks_own", () => {
  assert.deepEqual(["0", "4", "30"].map((text) => labAddress(`?targets=${text}`).targets), [0, 4, 30]);
  for (const text of ["", "31", "-1", "1.5", "1e1", "0x4", "%204", "many", "9".repeat(400)]) assert.equal(labAddress(`?targets=${text}`).targets, 10, text);
  assert.deepEqual(["0", "2", "4294967295"].map((text) => labAddress(`?seed=${text}`).seed), [0, 2, 4294967295]);
  for (const text of ["", "4294967296", "-1", "1.0", "one", "9".repeat(400)]) assert.equal(labAddress(`?seed=${text}`).seed, 1, text);
  // The attack's own are no parameters at all, and replace ones that were there.
  const own = new URLSearchParams(labHref(DEFAULTS, "?play=lab&targets=4&seed=9"));
  assert.deepEqual([own.has("targets"), own.has("seed")], [false, false]);
  const said = new URLSearchParams(labHref({ ...DEFAULTS, targets: 4, seed: 9 }, "?play=lab&targets=7&seed=3"));
  assert.deepEqual([said.getAll("targets"), said.getAll("seed")], [["4"], ["9"]]);
});

test("the_lab_address_keeps_the_rest_of_the_query_and_replaces_its_own", () => {
  const href = labHref({ ...DEFAULTS, ...ROGUE, right: "club", hz: 480 },
    "?play=lab&scenario=attack&model=workshop-fighter&right=empty&armour=1&hz=120&quality=reduced");
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
  assert.deepEqual(new URLSearchParams(labHref({ ...DEFAULTS, mind: GUARD }, "?play=lab&mind=script&mind=script")).getAll("mind"), ["guard"]);
  assert.deepEqual(new URLSearchParams(labHref({ ...DEFAULTS, mind: RISING }, "?play=lab&mind=script")).getAll("mind"), [JSON.stringify(RISING)]);
  // One address is one link, wherever in the query its keys stood before.
  assert.equal(labHref({ ...DEFAULTS, mind: GUARD }, "?mind=script&play=lab&kept=1&mind=script"), labHref({ ...DEFAULTS, mind: GUARD }, "?play=lab&kept=1"));
});

test("the_lab_presets_offer_game_fighters_scripted_tactics_and_a_standing_guard", () => {
  assert.deepEqual(Object.keys(LAB_PRESETS), ["classic", "puncher", "script", "guard"]);
  assert.deepEqual(Object.values(LAB_PRESETS).map(({ config }) => config.tactics), [CLASSIC.tactics, PUNCHER.tactics, { kind: "script" }, { kind: "stand" }]);
  const script = { name: "a script", decide: () => { throw new Error("the script decided"); } };
  const tactics = (config, given) => tacticsOf(config.tactics, null, "lab", null, () => null, given);
  assert.equal(tactics(LAB_PRESETS.script.config, script), script);
  assert.throws(() => tactics(LAB_PRESETS.script.config, undefined), /require a supplied script/);
  assert.deepEqual(tactics(LAB_PRESETS.guard.config, script).decide({ report: { heading: 1.25 } }, 1 / 120), standIntent(1.25));
});

test("a_lab_body_plays_the_mind_it_is_given_or_the_script_preset_where_that_has_a_fault", () => {
  const spec = humanSpec("workshop-fighter"), guard = LAB_PRESETS.guard.config;
  assert.deepEqual(labMind(guard, spec), { plays: guard, faults: [] });
  // A mind of another kind, and a fighter whose parts disagree, play the Script preset whole.
  assert.deepEqual(labMind({ kind: "lie" }, spec), { plays: LAB_PRESETS.script.config, faults: ["the Lab drives a fighter"] });
  const invalid = labMind({ ...guard, actions: [{ name: "unknown", executor: "missing", effectors: ["foot.right"], regions: [], aim: { kind: "centre" } }] }, spec);
  assert.deepEqual(invalid.plays, LAB_PRESETS.script.config);
  assert.ok(invalid.faults.some(fault => fault.includes("missing")));
});

test("the_lab_offers_the_game_rate_first_and_distinct_scenarios", () => {
  assert.equal(LAB_RATES[0], PHYSICS_HZ.value);
  assert.equal(new Set(SCENARIOS.map((s) => s.id)).size, SCENARIOS.length);
  assert.ok(SCENARIOS.every((s) => s.name));
  assert.deepEqual(SCENARIOS.map((s) => s.id), ["stance", "recovery", "ground", "attack", "locomotion"]);
  assert.equal(labAddress("?play=lab&scenario=locomotion").scenario, "locomotion");
});


test("recovery variant and timed shove recipes remain explicit in shareable addresses",()=>{
 for(const recoveryMode of ["witness","selected"]){
  const address={...DEFAULTS,scenario:"recovery",recoveryMode,recoveryPush:{degrees:247.5,impulse:90,separation:.35}};
  assert.deepEqual(labAddress(labHref(address)),address);
 }
 assert.deepEqual(labAddress("?pushDegrees=NaN&pushImpulse=-10&pushSeparation=0").recoveryPush,DEFAULTS.recoveryPush);
});

test("the selected-mind recovery demonstration preserves the live controller and body", () => {
  const address = { ...DEFAULTS, scenario: "stance", model: "workshop-rogue", right: "club", balance: 0,
    mind: { ...SCRIPT, subs: [{ kind: "research-rise" }] } };
  const selected = recoveryAddress(address, "selected");
  assert.deepEqual(selected, { ...address, scenario: "recovery", recoveryMode: "selected" });
  assert.deepEqual(labAddress(labHref(selected)), selected);
});
