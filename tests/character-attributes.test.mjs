import test from "node:test";
import assert from "node:assert/strict";
import { BODY_MODELS, characterDefaults, modelSpec, resolveCharacter } from "../src/core/models.ts";
import { CHARACTER_ATTRIBUTES, attributeError, validateAttributes } from "../src/core/character-attributes.ts";
import { shapeBounds } from "../src/core/spec/shape-bounds.ts";
import { specProvenanceFaults } from "./fixtures/spec.mjs";
import { readAttributes, writeAttributes } from "../src/ui/attribute-link.ts";

const numbers = value => JSON.parse(JSON.stringify(value, (_, v) => v?.unit && v?.provenance ? v.value : v));
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) <= Math.max(1, Math.abs(expected)) * 1e-12, `${actual} versus ${expected}`);

test("every model inherits its defaults, explicit defaults are identical and recipes are immutable", () => {
  assert.deepEqual(Object.keys(CHARACTER_ATTRIBUTES), ["size", "weight", "strength", "speed", "hp", "balance", "haste"]);
  for (const model of BODY_MODELS) {
    const base = resolveCharacter({ model }), explicit = resolveCharacter({ model, attributes: characterDefaults(model) });
    assert.deepEqual(numbers(base.spec), numbers(modelSpec(model)));
    assert.deepEqual(numbers(explicit.spec), numbers(base.spec));
    assert.deepEqual(base.config.attributes, characterDefaults(model));
    assert.ok(Object.isFrozen(base.config.attributes) && Object.isFrozen(base.spec));
  }
});

test("all models implement independent mass, strength, speed, wounds and assistance capabilities", () => {
  for (const model of BODY_MODELS) {
    const base = modelSpec(model);
    for (const [attribute, value] of [["strength", 1.4], ["speed", 1.2], ["hp", 10], ["balance", 25], ["haste", 50]]) {
      const input = { [attribute]: value }, { spec } = resolveCharacter({ model, attributes: input });
      assert.deepEqual(input, { [attribute]: value });
      assert.deepEqual(specProvenanceFaults(spec), [], `${model} ${attribute}`);
      assert.equal(spec.wounds.hp.value, attribute === "hp" ? value : base.wounds.hp.value);
      assert.equal(spec.attributes.balance.value, attribute === "balance" ? value : 0);
      near(spec.mass.value, base.mass.value * (attribute === "size" ? value * value * value : attribute === "weight" ? value : 1));
      near(spec.stature.value, base.stature.value * (attribute === "size" ? value : 1));
      spec.joints.forEach((joint, i) => joint.dofs.forEach((dof, k) => {
        const original = base.joints[i].dofs[k].muscle, leg = model === "reptile" ? /^(girdle|bend|ankle)\./.test(joint.name) : /^(hip|knee|ankle)\./.test(joint.name);
        near(dof.muscle.peakPositive.value, original.peakPositive.value * (attribute === "strength" ? value : attribute === "size" ? value * value * value : 1));
        near(dof.muscle.speedPositive.unloadedSpeed.value, original.speedPositive.unloadedSpeed.value * (attribute === "speed" ? value : attribute === "haste" && leg ? 1.5 : 1));
      }));
    }
    const both = resolveCharacter({ model, attributes: { speed: 1.2, haste: 50 } }).spec;
    for (const joint of both.joints) for (const dof of joint.dofs) assert.ok(Number.isFinite(dof.muscle.speedPositive.unloadedSpeed.value));
    const head = base.segments[0], box = shapeBounds(head);
    assert.ok(box.max.every((v, i) => v > box.min[i]));
  }
});

test("invalid values and impossible geometry fail before construction", () => {
  for (const name of Object.keys(CHARACTER_ATTRIBUTES)) {
    for (const value of [NaN, Infinity, -Infinity]) assert.throws(() => resolveCharacter({ model: "workshop-fighter", attributes: { [name]: value } }), /finite/);
    assert.equal(attributeError(name, name === "balance" || name === "haste" ? 0 : 1), null);
  }
  for (const name of ["size", "weight", "strength", "speed", "hp"]) assert.throws(() => validateAttributes({ [name]: 0 }), /greater than zero/);
  assert.throws(() => validateAttributes({ balance: -1 }), /zero or greater/);
  assert.throws(() => validateAttributes({ haste: -100 }), /greater than/);
  assert.throws(() => validateAttributes({ grit: 1 }), /Unknown attribute/);
  assert.throws(() => resolveCharacter({ model: "crypt-skeleton", attributes: { weight: 100 } }), /clearance/);
});

test("scoped links preserve explicit overrides, inherit absent fields, reset and surface invalid values", () => {
  const query = new URLSearchParams("left.balance=0&left.hp=6&right.strength=2&unrelated=keep");
  assert.deepEqual(readAttributes(query, "left", { balance: 25, haste: 50 }), { balance: 0, haste: 50, hp: 6 });
  writeAttributes(query, "left", { strength: 1.5, balance: 0 });
  assert.deepEqual(readAttributes(query, "left"), { strength: 1.5, balance: 0 });
  assert.equal(query.get("right.strength"), "2"); assert.equal(query.get("unrelated"), "keep");
  writeAttributes(query, "left", {});
  assert.deepEqual(readAttributes(query, "left"), {});
  for (const value of ["", "nope", "Infinity"]) assert.throws(() => validateAttributes(readAttributes(new URLSearchParams(`body.size=${value}`), "body")), /finite/);
  const warrior = { hp: 6 };
  assert.equal(resolveCharacter({ model: "workshop-rogue", attributes: warrior }).spec.wounds.hp.value, 6);
  assert.equal(resolveCharacter({ model: "workshop-rogue" }).spec.wounds.hp.value, 4);
});
