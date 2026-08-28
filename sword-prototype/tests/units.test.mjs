import test from "node:test";
import assert from "node:assert/strict";

import {
  UNIT_REGISTRY,
  UNITS,
  loadoutForUnit,
  supportsLoadoutForUnit,
  unitDefinition,
} from "../src/units.ts";

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
