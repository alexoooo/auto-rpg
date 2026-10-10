/**
 * **A mind in a link** (`src/ui/mind-link.ts`): a screen's address carries a preset's id or a
 * whole tree as JSON, without research tuning, and finds the faults of what it carries for the
 * screen it is on.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { CLASSIC, QUADRUPED, RECIPE_FIGHTER } from "../src/core/mind/config.ts";
import { modelSpec } from "../src/core/models.ts";
import { mindFaults, mindText, parseMind, readMind, writeMind } from "../src/ui/mind-link.ts";
import { COMBAT, withParts } from "./fixtures/minds.mjs";

const PRESETS = { classic: { config: CLASSIC }, combat: { config: COMBAT } };
const HUMAN = modelSpec("workshop-fighter"), REPTILE = modelSpec("reptile");

test("a_link_names_a_preset_by_its_id_and_any_other_mind_by_its_whole_tree", () => {
  assert.deepEqual([mindText(CLASSIC, PRESETS), mindText(COMBAT, PRESETS)], ["classic", "combat"]);
  assert.deepEqual([readMind("classic", PRESETS), readMind("combat", PRESETS)], [CLASSIC, COMBAT]);
  const changed = withParts(CLASSIC, { blow: { kind: "path-strike" }, tactics: { kind: "openings" } });
  assert.equal(mindText(changed, PRESETS), JSON.stringify(changed));
  assert.deepEqual(readMind(mindText(changed, PRESETS), PRESETS), changed);
  // A preset's tree written whole is read as that preset's, and written back as its id.
  assert.deepEqual(readMind(JSON.stringify(CLASSIC), PRESETS), CLASSIC);
  assert.equal(mindText(JSON.parse(JSON.stringify(CLASSIC)), PRESETS), "classic");
});

test("a_link_carries_no_research_tuning_either_way", () => {
  const tuned = withParts(CLASSIC, { locomotion: { tuning: { turnLimit: 1 } }, tactics: { tuning: { edge: { band: 1, patience: 1, clinch: 0 } } } });
  assert.equal(writeMind(tuned), JSON.stringify(CLASSIC));
  assert.equal(mindText(tuned, PRESETS), "classic");
  assert.deepEqual(readMind(JSON.stringify(tuned), PRESETS), CLASSIC);
});

test("a_link_with_no_mind_in_it_reads_as_none", () => {
  for (const text of [null, "", "nothing", "{", "[]", "null", "7", '{"kind":"fly"}', '{"kind":"lie"}', '{"kind":"seek"}', '{"kind":"toString"}', '"classic"']) {
    assert.equal(readMind(text, PRESETS), null, String(text));
    assert.equal(parseMind(text, HUMAN), null, String(text));
  }
});

test("a_minds_faults_are_its_screens_and_its_bodys", () => {
  const scripted = withParts(RECIPE_FIGHTER, { tactics: { kind: "script" } });
  assert.deepEqual(mindFaults(scripted, HUMAN), ["tactics: this screen gives no script"]);
  assert.deepEqual(mindFaults(scripted, HUMAN, ["script"]), []);
  assert.deepEqual(mindFaults(CLASSIC, REPTILE), ["the mind does not fit this body"]);
  assert.deepEqual(mindFaults(QUADRUPED, REPTILE), []);
  // A tree's own faults are named before whether it fits.
  assert.deepEqual(mindFaults(scripted, REPTILE), ["tactics: this screen gives no script"]);
  assert.deepEqual(parseMind(JSON.stringify(scripted), HUMAN), { config: scripted, faults: ["tactics: this screen gives no script"] });
});
