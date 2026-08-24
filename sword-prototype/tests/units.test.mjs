import test from "node:test";
import assert from "node:assert/strict";

import { UNIT_REGISTRY, UNITS, loadoutForUnit, unitDefinition } from "../src/units.ts";

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

test("each_units_vitality_weights_cover_exactly_its_parts", () => {
  for (const unit of Object.values(UNIT_REGISTRY)) {
    assert.deepEqual(Object.keys(unit.anatomy.vitalityWeights).sort(), [...unit.anatomy.parts].sort());
    const sum = Object.values(unit.anatomy.vitalityWeights).reduce((total, value) => total + value, 0);
    assert.ok(sum >= 1, `${unit.kind}: a whole vital body can reach zero`);
  }
});
