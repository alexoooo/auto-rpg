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

test("the_kaykit_knight_exposes_one_authored_sword_and_buckler_pair", () => {
  const knight = unitDefinition("kaykit-knight");
  assert.equal(knight.label, "KayKit Knight (Experimental)");
  assert.deepEqual(knight.loadouts, [{ primary: "sword", secondary: "buckler" }]);
  assert.deepEqual(knight.defaultLoadout, { primary: "sword", secondary: "buckler" });
  assert.deepEqual(knight.compatiblePolicies, ["idle", "swinger", "duelist"]);
  assert.equal(knight.defaultPolicy, "idle");

  assert.deepEqual(loadoutForUnit("kaykit-knight", "sword", "buckler"), {
    primary: "sword",
    secondary: "buckler",
  });
  assert.equal(supportsLoadoutForUnit("kaykit-knight", "sword", "buckler"), true);
  assert.equal(supportsLoadoutForUnit("kaykit-knight", "buckler", "sword"), false);
  assert.throws(
    () => loadoutForUnit("kaykit-knight", "buckler", "sword"),
    /unit "kaykit-knight" does not support loadout "buckler\+sword"/,
  );
});

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

test("each_units_vitality_weights_cover_exactly_its_parts", () => {
  for (const unit of Object.values(UNIT_REGISTRY)) {
    assert.deepEqual(Object.keys(unit.anatomy.vitalityWeights).sort(), [...unit.anatomy.parts].sort());
    const sum = Object.values(unit.anatomy.vitalityWeights).reduce((total, value) => total + value, 0);
    assert.ok(sum >= 1, `${unit.kind}: a whole vital body can reach zero`);
  }
});

const endpoint = () => new HumanoidControlEndpoint({
  initialMind: { name: "idle", decide: () => ({}) },
  view: {}, canStep: () => true, apply: () => {}, stopBody: () => {},
  policies: [{ name: "idle", label: "Idle" }],
});

test("legacy_units_keep_the_humanoid_surface_and_policy_factory", () => {
  for (const unit of Object.values(UNIT_REGISTRY).filter(({ kind }) =>
    kind !== "bronze-warden" && kind !== "swordbearer-effigy")) {
    assert.equal(unit.controlSurface, "humanoid-v1", unit.kind);
    assert.deepEqual(unit.driverOptions.map(({ name }) => name),
      unit.compatiblePolicies ?? ["idle", "swinger", "duelist", "archer", "crawler"]);
    assert.equal(unit.createPolicy(unit.defaultPolicy).name, unit.defaultPolicy);
  }
});

test("the_Swordbearer_Effigy_has_its_own_construct_identity_and_biped_driver", () => {
  const effigy = unitDefinition("swordbearer-effigy");
  assert.equal(effigy.controlSurface, "construct-humanoid-v1");
  assert.equal(effigy.humanAdapter, false);
  assert.equal(effigy.createPolicy, null);
  assert.deepEqual(effigy.driverOptions.map(({ name }) => name), ["construct-hold", "humanoid-authored"]);
});

test("the_Bronze_Warden_exposes_only_its_construct_drivers_and_no_fake_human_adapter", () => {
  const warden = unitDefinition("bronze-warden");
  assert.equal(warden.controlSurface, "construct-v1");
  assert.equal(warden.humanAdapter, false);
  assert.equal(warden.createPolicy, null);
  assert.deepEqual(warden.driverOptions.map(({ name }) => name), ["construct-hold", "warden-authored"]);
  assert.deepEqual(warden.loadouts, [{ primary: "empty", secondary: "empty" }]);
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
