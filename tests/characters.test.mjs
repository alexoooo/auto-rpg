import "./harness/preload-data.mjs";
/** Characters by name, as many on one model as the registry lists, and the Arena's matchup naming them. */
import test from "node:test";
import assert from "node:assert/strict";
import { characterNamed, readCharacter, registryError, resolveCharacterChecked } from "../src/core/bodies/models.ts";
import { readMatchup, matchupModels } from "../src/game/arena/matchup.ts";
import { recipeOf } from "../src/app/node/setup.ts";
import { duelSpec } from "../src/game/arena/duel.ts";

const MODELS = { man: "warrior", woman: "rogue", skeleton: "skeleton", rat: "rat", reptile: "reptile" };
const registry = (characters) => ({ characters: { rogue: { model: "woman", label: "Rogue", skills: [] }, skeleton: { model: "skeleton", label: "Skeleton", skills: [] },
  rat: { model: "rat", label: "Rat", skills: [] }, reptile: { model: "reptile", label: "Reptile", skills: [] }, ...characters }, models: MODELS });

test("a model carries as many characters as the registry lists, one of them its own", () => {
  const two = registry({ warrior: { model: "man", label: "Warrior", skills: ["straight-punch/drive"] }, brawler: { model: "man", label: "Brawler", skills: ["straight-punch/from-guard"] } });
  assert.equal(registryError(two), null, "two characters on the man");
  assert.match(registryError(registry({ warrior: { model: "woman", label: "Warrior", skills: [] } })), /man's character warrior is no character on it/);
  assert.match(registryError(registry({ warrior: { model: "man", label: "Warrior", skills: ["straight-punch"] } })), /character warrior: skills: straight-punch is not skill\/variation/);
  assert.match(registryError({ ...registry({}), models: { ...MODELS, man: undefined } }), /model man has no character/);
});

test("a character resolves on its own model and refuses another, and a model alone is its own character", () => {
  const warrior = resolveCharacterChecked({ model: "man" });
  assert.equal(warrior.config.character, "warrior");
  assert.deepEqual(warrior.spec.skills, characterNamed("warrior").skills);
  assert.deepEqual(resolveCharacterChecked({ model: "woman", character: "warrior" }), { refused: "character warrior is no woman" });
  assert.deepEqual(resolveCharacterChecked({ model: "man", character: "knight" }), { refused: "unknown character knight" });
  assert.equal(readCharacter("man"), "warrior");
  assert.equal(readCharacter("rogue"), "rogue");
  assert.equal(readCharacter("knight"), undefined);
});

test("the Arena's matchup names characters, a model standing for its own, and a bout builds each side's", () => {
  assert.deepEqual(readMatchup("?matchup=rogue,skeleton"), { left: "rogue", right: "skeleton" });
  assert.deepEqual(readMatchup("?matchup=man,woman"), { left: "warrior", right: "rogue" }, "a model's name is its own character");
  assert.deepEqual(readMatchup("?matchup=knight"), { left: "warrior", right: "rogue" }, "a name of nothing is the default's");
  assert.deepEqual(matchupModels({ left: "warrior", right: "rat" }), { left: "man", right: "rat" });
  const recipe = recipeOf("?matchup=warrior,rogue&control=option,option", { left: {}, right: {} }, "open");
  assert.equal(recipe.left, "man"); assert.equal(recipe.right, "woman");
  assert.equal(recipe.characters, undefined, "a model's own character needs no name in a bout's recipe");
  assert.throws(() => duelSpec({ ...recipe, characters: { left: "rogue" } }, "left"), /character rogue is no man/);
});
