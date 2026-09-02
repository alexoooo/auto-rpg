import test from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";

import {
  PROJECTILE_PENETRATION_V1,
  scoreProjectileImpact,
} from "../src/scoring.ts";
import { classifyProjectileContactZone } from "../src/combat.ts";

const impact = (overrides = {}) => ({
  massKg: 0.12,
  speedMps: 42,
  signedShaftAlignment: 1,
  contactedHead: true,
  penetrationEfficiency: 1,
  ...overrides,
});

test("a_clean_42_mps_Construct_bolt_scores_exactly_three", () => {
  const score = scoreProjectileImpact(impact());
  assert.equal(score.kind, "thrust");
  assert.equal(score.quality, 1);
  assert.equal(score.damage, 3);
});

test("a_full_48_mps_ordinary_arrow_scores_the_axial_energy_value", () => {
  const score = scoreProjectileImpact(impact({ massKg: 0.035, speedMps: 48 }));
  const expected = 0.5 * 0.035 * (48 ** 2 - 8 ** 2) / 34;
  assert.ok(Math.abs(score.damage - expected) < 1e-12);
  assert.ok(Math.abs(score.damage - 1.1529411764705881) < 1e-12);
});

test("projectile_mass_changes_uncapped_damage_linearly", () => {
  const light = scoreProjectileImpact(impact({ massKg: 0.02, speedMps: 30 })).damage;
  const heavy = scoreProjectileImpact(impact({ massKg: 0.04, speedMps: 30 })).damage;
  assert.ok(light > 0);
  assert.ok(heavy < PROJECTILE_PENETRATION_V1.maximumDamage);
  assert.ok(Math.abs(heavy - light * 2) < 1e-12);
});

test("usable_energy_obeys_the_frozen_floor_subtracted_squared_speed_ratio", () => {
  const at16 = scoreProjectileImpact(impact({ massKg: 0.02, speedMps: 16 })).damage;
  const at24 = scoreProjectileImpact(impact({ massKg: 0.02, speedMps: 24 })).damage;
  const expectedRatio = (24 ** 2 - 8 ** 2) / (16 ** 2 - 8 ** 2);
  assert.ok(Math.abs(at24 / at16 - expectedRatio) < 1e-12);
});

test("damage_is_zero_at_and_continuous_above_the_eight_mps_axial_floor", () => {
  const atFloor = scoreProjectileImpact(impact({ speedMps: 8 }));
  const justAbove = scoreProjectileImpact(impact({ speedMps: 8 + 1e-7 }));
  assert.equal(atFloor.damage, 0);
  assert.equal(atFloor.kind, "weak");
  assert.ok(justAbove.damage > 0);
  assert.ok(justAbove.damage < 1e-7);
});

test("tail_first_broadside_and_shaft_contacts_cannot_pierce", () => {
  assert.equal(scoreProjectileImpact(impact({ signedShaftAlignment: -1 })).damage, 0);
  assert.equal(scoreProjectileImpact(impact({ signedShaftAlignment: 0 })).damage, 0);
  assert.equal(scoreProjectileImpact(impact({ contactedHead: false })).damage, 0);
});

test("no_projectile_can_exceed_three_damage", () => {
  const score = scoreProjectileImpact(impact({ massKg: 50, speedMps: 1_000 }));
  assert.equal(score.damage, PROJECTILE_PENETRATION_V1.maximumDamage);
});

test("non_finite_projectile_inputs_are_refused_before_scoring", () => {
  for (const [field, value] of [
    ["massKg", Number.NaN],
    ["speedMps", Number.POSITIVE_INFINITY],
    ["signedShaftAlignment", Number.NEGATIVE_INFINITY],
    ["penetrationEfficiency", Number.NaN],
  ]) {
    assert.throws(() => scoreProjectileImpact(impact({ [field]: value })),
      /projectile impact contains a non-finite physical input/);
  }
  assert.throws(() => scoreProjectileImpact(impact({ massKg: 0 })),
    /projectile impact is outside the physical scoring bounds/);
  assert.throws(() => scoreProjectileImpact(impact({ speedMps: -1 })),
    /projectile impact is outside the physical scoring bounds/);
  assert.throws(() => scoreProjectileImpact(impact({ signedShaftAlignment: 1.01 })),
    /projectile impact is outside the physical scoring bounds/);
  assert.throws(() => scoreProjectileImpact(impact({ penetrationEfficiency: 0 })),
    /projectile impact is outside the physical scoring bounds/);
  assert.throws(() => scoreProjectileImpact({ ...impact(), contactedHead: "yes" }),
    /projectile impact contains a non-finite physical input/);
});

test("tail_shaft_head_and_outside_projectile_contacts_are_classified_in_both_mirrors", () => {
  for (const mirror of [-1, 1]) {
    const nock = new Vector3(0, 0, 0);
    const head = new Vector3(0, 0, mirror * 0.5);
    assert.equal(classifyProjectileContactZone(nock, head,
      new Vector3(0, 0, mirror * 0.49), 0.01), "head");
    assert.equal(classifyProjectileContactZone(nock, head,
      new Vector3(0, 0, mirror * 0.25), 0.01), "shaft");
    assert.equal(classifyProjectileContactZone(nock, head,
      new Vector3(0, 0, mirror * 0.01), 0.01), "tail");
    assert.equal(classifyProjectileContactZone(nock, head,
      new Vector3(0.05, 0, mirror * 0.25), 0.01), "other");
  }
});
