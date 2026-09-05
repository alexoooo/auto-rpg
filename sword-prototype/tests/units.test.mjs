import test from "node:test";
import assert from "node:assert/strict";

import {
  UNIT_REGISTRY,
  UNITS,
  loadoutForUnit,
  supportsLoadoutForUnit,
  unitDefinition,
} from "../src/units.ts";
import { stepControlledPair } from "../src/control-host.ts";
import { HumanoidControlEndpoint } from "../src/humanoid-control.ts";

test("the_unit_picker_is_derived_from_the_buildable_unit_registry", () => {
  assert.deepEqual(
    UNITS,
    Object.values(UNIT_REGISTRY).map(({ kind, label }) => ({ name: kind, label })),
  );
  for (const row of UNITS) assert.equal(typeof unitDefinition(row.name).build, "function");
});

test("an_unknown_unit_is_refused_by_name_instead_of_becoming_a_warrior", () => {
  assert.throws(() => unitDefinition("dragon"), /unknown unit "dragon"/);
});

test("an_incompatible_loadout_is_refused_with_the_unit_and_equipment_named", () => {
  assert.throws(
    () => loadoutForUnit("warrior", "laser", "empty"),
    /unit "warrior" does not support equipment "laser"/,
  );
});

// Deleted 2026-09-04 with their subjects: `the_kaykit_knight_exposes_one_authored_sword_and_buckler_pair`,
// `built_in_Construct_picker_bodies_read_the_installed_production_durability_seam`, and the four
// per-body identity tests for the Swordbearer, Twinblade and Arbalest Effigies and the Bronze
// Warden. The registry rules they exercised -- the picker being a projection of buildable bodies,
// an exact loadout set, vitality weights covering exactly a unit's parts, and the v2 durability
// range -- are all still asserted below over the three surviving units.

test("existing_units_keep_their_exact_reachable_loadout_sets", () => {
  for (const kind of ["warrior", "broot"]) {
    const unit = unitDefinition(kind);
    assert.equal(unit.loadouts.length, 27);
    assert.deepEqual(unit.defaultLoadout, { primary: "sword", secondary: "empty" });
    assert.equal(supportsLoadoutForUnit(kind, "sword", "shield"), true);
    assert.equal(supportsLoadoutForUnit(kind, "bow", "bow"), true);
    assert.equal(supportsLoadoutForUnit(kind, "bow", "sword"), false);
    assert.equal(supportsLoadoutForUnit(kind, "club", "club"), true);
  }

  const centipede = unitDefinition("centipede");
  assert.deepEqual(centipede.loadouts, [{ primary: "empty", secondary: "empty" }]);
  assert.deepEqual(centipede.defaultLoadout, { primary: "empty", secondary: "empty" });
  assert.equal(centipede.defaultPolicy, "crawler");
});

/**
 * A unit with a fixed body owes a fixed anatomy; a unit that is assembled owes none.
 *
 * The exemption is narrow on purpose and is not "golem". A golem's parts are whatever its five
 * modules declare, their keys carry the side they were built on, and their vitality weights are
 * scaled to the build they end up in -- so a registry-level anatomy could only describe one build
 * and would be false for every other. What the test therefore asks is that an empty anatomy
 * belongs *only* to a unit that declares a default build, so a fixed body whose anatomy quietly
 * went empty is still red. What an assembled body's own weights are worth is asserted where they
 * exist, on a real assembly, in `tests/golem-arena.test.mjs`.
 */
test("each_units_vitality_weights_cover_exactly_its_parts", () => {
  for (const unit of Object.values(UNIT_REGISTRY)) {
    assert.deepEqual(Object.keys(unit.anatomy.vitalityWeights).sort(), [...unit.anatomy.parts].sort());
    if (unit.anatomy.parts.length === 0) {
      assert.ok(unit.defaultGolem,
        `${unit.kind}: a unit with no anatomy has to be one that is assembled per build`);
      continue;
    }
    const sum = Object.values(unit.anatomy.vitalityWeights).reduce((total, value) => total + value, 0);
    assert.ok(sum >= 1, `${unit.kind}: a whole vital body can reach zero`);
  }
});

test("every_selectable_body_uses_the_v2_low_number_range", () => {
  for (const unit of Object.values(UNIT_REGISTRY)) {
    assert.deepEqual(Object.keys(unit.anatomy.durability).sort(), [...unit.anatomy.parts].sort());
    for (const [part, durability] of Object.entries(unit.anatomy.durability)) {
      assert.ok(durability > 0 && durability <= 15,
        `${unit.kind}/${part} has ${durability} durability outside the selectable v2 range`);
    }
  }
});

const endpoint = () => new HumanoidControlEndpoint({
  initialMind: { name: "idle", decide: () => ({}) },
  view: {}, canStep: () => true, apply: () => {}, stopBody: () => {},
  policies: [{ name: "idle", label: "Idle" }],
});

test("legacy_units_keep_the_humanoid_surface_and_policy_factory", () => {
  for (const unit of Object.values(UNIT_REGISTRY)) {
    // The golem is the first body here that is not on `humanoid-v1`, and its own surface is
    // asserted below. Everything else in this loop is true of both and is checked over both.
    if (unit.kind !== "golem") assert.equal(unit.controlSurface, "humanoid-v1", unit.kind);
    assert.deepEqual(unit.driverOptions.map(({ name }) => name),
      unit.compatiblePolicies ?? ["idle", "swinger", "duelist", "archer", "crawler"]);
    assert.equal(unit.createPolicy(unit.defaultPolicy).name, unit.defaultPolicy);
  }
});

/**
 * The golem's own row, asserted as the frozen choices rather than as a shape.
 *
 * Every line here is one of Session 08's frozen choices and each would be a real defect if it
 * moved. `hands` is 2 because the two effector sockets *are* the two hand names, which is what
 * lets `HandName` fit without a third vocabulary and `splitMind` find a hand to give the person.
 * The surface tag is its own because a driver built for one surface must not install on the other.
 * `equipment` is the setup sentinel and nothing else, because a golem carries nothing at all.
 */
test("the_golem_is_assembled_rather_than_equipped_and_answers_to_its_own_surface", () => {
  const golem = unitDefinition("golem");
  assert.equal(golem.controlSurface, "golem-v1");
  assert.equal(golem.hands, 2);
  assert.equal(golem.humanAdapter, true);
  assert.equal(golem.supportedLocomotionPort, "supported-locomotion-v1");
  assert.deepEqual([...golem.equipment], ["empty"]);
  assert.deepEqual(golem.loadouts, [{ primary: "empty", secondary: "empty" }]);
  assert.deepEqual([...(golem.compatiblePolicies ?? [])], ["idle"]);
  assert.ok(golem.defaultGolem, "a golem corner opens on a build");
  for (const slot of ["locomotion", "torso", "head"]) {
    assert.equal(typeof golem.defaultGolem[slot], "string", slot);
  }
  for (const socket of ["primary", "secondary"]) {
    assert.equal(typeof golem.defaultGolem[socket].chain, "string", socket);
    assert.equal(typeof golem.defaultGolem[socket].terminal, "string", socket);
  }
});

test("a_driver_for_one_surface_is_refused_by_the_other_surface_name", () => {
  const control = endpoint();
  assert.throws(() => control.install({
    surface: "construct-v1", name: "construct-hold", step: () => {}, stop: () => {},
  }), /control source for surface construct-v1 cannot drive surface humanoid-v1/);
});

test("a_body_without_a_human_adapter_disables_you_instead_of_installing_a_policy", () => {
  assert.throws(() => endpoint().installHuman(), /control surface humanoid-v1 has no human adapter/);
});

test("both_bodies_observe_before_either_installed_driver_steps", () => {
  const order = [];
  const body = (name) => ({
    observe: () => order.push(`observe-${name}`),
    control: { driver: { surface: "test", name, step: () => order.push(`step-${name}`), stop: () => {} } },
  });
  stepControlledPair(body("left"), body("right"), 1 / 240, 4);
  assert.deepEqual(order, ["observe-left", "observe-right", "step-left", "step-right"]);
});

test("the_host_never_switches_on_a_concrete_Fighter_or_Construct_class", () => {
  const order = [];
  const alien = (name) => ({
    observe: () => order.push(`${name}-saw`),
    control: { driver: { surface: `${name}-surface`, name, step: () => order.push(`${name}-acted`), stop: () => {} } },
  });
  assert.doesNotThrow(() => stepControlledPair(alien("first"), alien("second"), 0.01, 0));
  assert.deepEqual(order, ["first-saw", "second-saw", "first-acted", "second-acted"]);
});
