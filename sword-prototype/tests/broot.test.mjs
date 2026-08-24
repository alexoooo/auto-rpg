import assert from "node:assert/strict";
import test from "node:test";

import { CONFIG } from "../src/config.ts";
import {
  BROOT_PROFILE,
  WARRIOR_PROFILE,
  humanoidProfileValues,
} from "../src/fighter.ts";
import { UNIT_REGISTRY, unitDefinition } from "../src/units.ts";

test("broot_uses_its_own_mass_reach_mobility_health_and_force_profile", () => {
  const values = humanoidProfileValues(BROOT_PROFILE);
  assert.equal(values.body.torsoMass, CONFIG.body.torsoMass * 1.64);
  assert.equal(values.body.partHealth, CONFIG.body.partHealth * 1.30);
  assert.equal(values.arm.reachNeutral, CONFIG.arm.reachNeutral * 1.18);
  assert.equal(values.arm.linearMotorForce, CONFIG.arm.linearMotorForce * 1.35);
  assert.equal(values.fighter.walkSpeed, CONFIG.fighter.walkSpeed * 0.88);
  assert.equal(values.fighter.turnSpeed, CONFIG.fighter.turnSpeed * 0.88);
});

test("warrior_through_the_shared_humanoid_builder_keeps_its_exact_record", () => {
  const values = humanoidProfileValues(WARRIOR_PROFILE);
  assert.strictEqual(values.body, CONFIG.body);
  assert.strictEqual(values.arm, CONFIG.arm);
  assert.strictEqual(values.fighter, CONFIG.fighter);
});

test("broot_has_its_declared_part_graph_and_no_undeclared_parts", () => {
  const warrior = unitDefinition("warrior");
  const broot = unitDefinition("broot");
  assert.deepEqual(broot.anatomy.parts, warrior.anatomy.parts);
  assert.deepEqual(Object.keys(broot.anatomy.vitalityWeights).sort(), [...broot.anatomy.parts].sort());
  assert.equal(UNIT_REGISTRY.broot, broot);
});

test("broot_supports_every_declared_humanoid_loadout_on_both_sides", () => {
  const broot = unitDefinition("broot");
  assert.deepEqual(broot.equipment, unitDefinition("warrior").equipment);
  assert.equal(broot.equipment.includes("empty"), true);
  assert.equal(broot.equipment.includes("bow"), true);
  assert.equal(broot.equipment.includes("shield"), true);
});

test("broot_has_a_distinct_primitive_costume_contract", () => {
  assert.equal(BROOT_PROFILE.authoredCostume, false);
  assert.equal(WARRIOR_PROFILE.authoredCostume, true);
  assert.ok(unitDefinition("broot").crownHeight > unitDefinition("warrior").crownHeight);
  assert.ok(unitDefinition("broot").collisionRadius > unitDefinition("warrior").collisionRadius);
});
