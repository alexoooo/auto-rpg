import "../harness/preload-data.mjs";
/** A character's skills: each variation it holds, several of one skill among them, each a skill of its own to its mind. */
import test from "node:test";
import assert from "node:assert/strict";
import { resolveCharacter, resolveCharacterChecked } from "../../src/core/bodies/models.ts";
import { MINDS, treeLookup } from "../../src/app/catalog.ts";
import { skillsOf } from "../../src/minds/option/skills.ts";
import { limbAction } from "../../src/minds/option/kinds.ts";
import { skillDigest } from "../../src/skills/framework/profile.ts";
import { readSkills, writeSkills } from "../../src/game/skill-link.ts";
import { allParts, partLookup } from "../../src/app/catalog.ts";
import { BODY_MODELS, modelHolds } from "../../src/core/bodies/models.ts";
import { LOADOUTS, loadoutFaults, withLoadout } from "../../src/core/bodies/items/held.ts";

const config = MINDS.option.config, parts = treeLookup(config);
const punches = (skills) => {
  const spec = resolveCharacter({ model: "man", skills }).spec, made = skillsOf(parts, spec, config.options);
  return { spec, made, executors: made.executors.filter((one) => one.kind === "straight-punch"), actions: made.actions.filter((one) => one.name.startsWith("straight-punch")) };
};

test("a character holding two variations of a skill strikes by each, and each reads as it does alone", () => {
  const both = punches(["straight-punch/drive", "straight-punch/from-guard"]);
  assert.deepEqual(both.executors.map((one) => [one.name, one.variation]), [["straight-punch/drive", "drive"], ["straight-punch/from-guard", "from-guard"]]);
  assert.deepEqual(both.actions.map((one) => [one.name, one.executor]), [["straight-punch/drive", "straight-punch/drive"], ["straight-punch/from-guard", "straight-punch/from-guard"]]);
  const digest = ({ spec, made }, action, limb) => skillDigest(parts, spec, made.executors, limbAction(action, limb));
  for (const variation of ["drive", "from-guard"]) {
    const alone = punches([`straight-punch/${variation}`]);
    assert.deepEqual(alone.executors.map((one) => one.name), ["straight-punch"], "one variation of a skill is named by the skill");
    const held = both.actions.find((one) => one.executor.endsWith(variation));
    assert.equal(digest(both, held, "hand.right"), digest(alone, alone.actions[0], "hand.right"), `${variation} measures alike whether held alone or beside another`);
  }
  assert.notEqual(digest(both, both.actions[0], "hand.right"), digest(both, both.actions[1], "hand.right"), "two variations are two skills to a profile");
  assert.deepEqual(punches([]).executors, [], "a character holding no punch has none");
});

test("a character's skills are a list of skill/variation, none twice, carried whole by a link", () => {
  assert.match(resolveCharacterChecked({ model: "man", skills: ["straight-punch"] }).refused, /not skill\/variation/);
  assert.match(resolveCharacterChecked({ model: "man", skills: ["stomp/stomp", "stomp/stomp"] }).refused, /twice/);
  assert.match(resolveCharacterChecked({ model: "man", skills: { "straight-punch": "drive" } }).refused, /a list/);
  const query = new URLSearchParams();
  writeSkills(query, "left", ["straight-punch/drive", "straight-punch/from-guard"]);
  assert.equal(query.get("left.skills"), "straight-punch/drive,straight-punch/from-guard");
  assert.deepEqual(readSkills(query, "left"), ["straight-punch/drive", "straight-punch/from-guard"]);
  writeSkills(query, "left", []);
  assert.deepEqual(readSkills(query, "left"), [], "an empty value holds no skill");
  writeSkills(query, "left", undefined);
  assert.equal(readSkills(query, "left"), undefined, "no value is the character's own");
});

test("every skill part, whatever its role, runs only on a body whose character holds it", () => {
  const roles = new Set();
  for (const [kind, part] of Object.entries(allParts())) {
    if (!part.variations) continue;
    let fitted = null;
    for (const model of BODY_MODELS) for (const loadout of LOADOUTS) {
      if (fitted || loadoutFaults(loadout).length || !modelHolds(model) && (loadout.left !== "empty" || loadout.right !== "empty")) continue;
      const spec = withLoadout(resolveCharacter({ model }).spec, loadout);
      if (part.fits(spec, part.defaults, partLookup) === null) fitted = spec;
    }
    assert.ok(fitted, `${kind}: some character holds it and runs it`);
    const without = { ...fitted, skills: fitted.skills.filter((name) => !name.startsWith(`${kind}/`)) };
    assert.match(part.fits(without, part.defaults, partLookup) ?? "", /the character has no/, `${kind}: a character that does not hold it does not run it`);
    roles.add(part.role);
  }
  for (const role of ["executor", "guard", "locomotion", "gait", "paw-gait", "support", "technique", "navigation"]) assert.ok(roles.has(role), `a ${role} is a skill a character holds`);
});
