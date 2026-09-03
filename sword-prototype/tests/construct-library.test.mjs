import assert from "node:assert/strict";
import test from "node:test";

import { parseSavedConstruct, saveConstruct } from "../src/construct/codec.ts";
import { controlDigest } from "../src/construct/actions.ts";
import { legacyBlueprintDigest, v2BlueprintDigest, v3BlueprintDigest, v4BlueprintDigest } from "../src/construct/canonical.ts";
import { programDigest } from "../src/construct/program.ts";
import { ARBALEST_SENSORS, arbalestSavedConstruct } from "../src/construct/arbalest.ts";
import { WARDEN_SENSORS, wardenBlueprint, wardenControl, wardenProgram } from "../src/construct/warden.ts";
import { CONSTRUCT_LIBRARY_MAX_BYTES, CONSTRUCT_LIBRARY_MAX_DEPTH, CONSTRUCT_LIBRARY_MAX_ENTRIES,
  CONSTRUCT_LIBRARY_STORAGE_KEY, LEGACY_CONSTRUCT_LIBRARY_STORAGE_KEY, encodeConstructLibrary, loadConstructLibrary,
  parseConstructLibrary, replaceConstructLibraryEntry, storeConstructLibrary } from "../src/forge/library.ts";

const saved = (name) => saveConstruct(
  name,
  wardenBlueprint("crossbow"),
  wardenControl("crossbow"),
  wardenProgram("crossbow"),
  WARDEN_SENSORS,
);

const legacySaved = (source) => {
  const value = structuredClone(source);
  value.version = 1;
  value.blueprint.version = 1;
  for (const module of value.blueprint.modules) {
    if (module.projectile) {
      module.projectile.damageScale = module.projectile.penetrationEfficiency;
      delete module.projectile.penetrationEfficiency;
    }
    delete module.mountedContactStriker;
  }
  for (const collection of [value.blueprint.parts, value.blueprint.joints, value.blueprint.modules]) {
    for (const row of collection) { row.health *= 20; row.armour *= 20; }
  }
  const restoreAbsolute = (expression) => {
    if (!expression || typeof expression !== "object") return;
    if (["lt", "lte", "gt", "gte"].includes(expression.op)) {
      const sensor = expression.left?.op === "sensor" ? expression.left : expression.right?.op === "sensor" ? expression.right : null;
      const constant = expression.left?.op === "constant" ? expression.left : expression.right?.op === "constant" ? expression.right : null;
      if (sensor?.id === "module-max-health-effigy-arbalest" && typeof constant?.value === "number") constant.value *= 20;
    }
    for (const child of Object.values(expression)) if (Array.isArray(child)) child.forEach(restoreAbsolute);
    else restoreAbsolute(child);
  };
  for (const rule of value.program.rules) {
    restoreAbsolute(rule.condition); restoreAbsolute(rule.utility);
    for (const parameter of Object.values(rule.parameters)) if (parameter.kind === "expression") restoreAbsolute(parameter.value);
  }
  value.digests = { blueprint: legacyBlueprintDigest(value.blueprint), control: controlDigest(value.control),
    program: programDigest(value.program) };
  return value;
};

const refreshProgramDigest = (value) => { value.digests.program = programDigest(value.program); return value; };

const priorSaved = (source, version) => {
  const value = structuredClone(source);
  value.version = version;
  value.blueprint.version = version;
  for (const module of value.blueprint.modules) {
    delete module.mountedContactStriker;
    if (version === 2 && module.projectile) {
      module.projectile.damageScale = module.projectile.penetrationEfficiency;
      delete module.projectile.penetrationEfficiency;
    }
  }
  value.digests.blueprint = version === 2 ? v2BlueprintDigest(value.blueprint) : v3BlueprintDigest(value.blueprint);
  return value;
};

test("the_local_library_refuses_raw_bytes_depth_unknown_keys_and_excess_entries_before_publication", () => {
  assert.throws(() => parseConstructLibrary("x".repeat(CONSTRUCT_LIBRARY_MAX_BYTES + 1), WARDEN_SENSORS),
    /source exceeds maximum 4000000 bytes/);
  const nested = "[".repeat(CONSTRUCT_LIBRARY_MAX_DEPTH + 1);
  assert.throws(() => parseConstructLibrary(nested, WARDEN_SENSORS), /maximum nesting depth 66/);
  assert.throws(() => parseConstructLibrary('{"version":1,"entries":[],"surplus":true}', WARDEN_SENSORS),
    /unknown field "surplus"/);
  const entry = saved("Repeated");
  assert.throws(() => encodeConstructLibrary(Array(CONSTRUCT_LIBRARY_MAX_ENTRIES + 1).fill(entry), WARDEN_SENSORS),
    /maximum 32 entries/);
});

test("the_local_library_revalidates_nested_saved_keys_and_digest_claims", () => {
  const entry = structuredClone(saved("Strict Warden"));
  entry.blueprint.parts[0].surplus = true;
  assert.throws(() => parseConstructLibrary(JSON.stringify({ version: 1, entries: [entry] }), WARDEN_SENSORS),
    /entry\[0\].*unknown field "surplus"/);

  delete entry.blueprint.parts[0].surplus;
  entry.digests.program = "00000000";
  assert.throws(() => parseConstructLibrary(JSON.stringify({ version: 1, entries: [entry] }), WARDEN_SENSORS),
    /entry\[0\].*program digest/);
});

test("a_library_replacement_validates_completely_then_uses_one_storage_write", () => {
  let source = encodeConstructLibrary([saved("Existing")], WARDEN_SENSORS);
  let writes = 0;
  const storage = {
    getItem: (key) => key === CONSTRUCT_LIBRARY_STORAGE_KEY ? source : null,
    setItem: (key, value) => {
      assert.equal(key, CONSTRUCT_LIBRARY_STORAGE_KEY);
      writes += 1;
      source = value;
    },
  };
  const prior = loadConstructLibrary(storage, WARDEN_SENSORS);
  const next = replaceConstructLibraryEntry(prior, saved("Second"), WARDEN_SENSORS);
  storeConstructLibrary(storage, next, WARDEN_SENSORS);
  assert.equal(writes, 1);
  assert.deepEqual(loadConstructLibrary(storage, WARDEN_SENSORS).map(({ name }) => name), ["Existing", "Second"]);

  const invalid = structuredClone(saved("Broken"));
  invalid.program.rules[0].condition.surplus = true;
  assert.throws(() => storeConstructLibrary(storage, [...next, invalid], WARDEN_SENSORS), /program digest|unknown field "surplus"/);
  assert.equal(writes, 1, "an invalid replacement must not reach setItem");
  assert.deepEqual(loadConstructLibrary(storage, WARDEN_SENSORS).map(({ name }) => name), ["Existing", "Second"]);
});

test("replacing_a_name_is_atomic_and_preserves_the_other_canonical_entries", () => {
  const first = saved("Slot");
  const other = saved("Other");
  const replacement = saveConstruct("Slot", wardenBlueprint("sword"), wardenControl("sword"),
    wardenProgram("sword"), WARDEN_SENSORS);
  const next = replaceConstructLibraryEntry([first, other], replacement, WARDEN_SENSORS);
  assert.deepEqual(next.map(({ name }) => name), ["Other", "Slot"]);
  assert.equal(next[1].digests.blueprint, replacement.digests.blueprint);
  assert.equal(parseConstructLibrary(encodeConstructLibrary(next, WARDEN_SENSORS), WARDEN_SENSORS).length, 2);
});

test("a_v1_saved_Construct_is_digest_verified_before_values_are_migrated", () => {
  const legacy = legacySaved(arbalestSavedConstruct());
  const rule = legacy.program.rules.find(({ id }) => id === "fire-in-range");
  rule.condition = { op: "gt", left: { op: "add", values: [
    { op: "sensor", id: "module-max-health-effigy-arbalest" }, { op: "constant", value: 1 },
  ] }, right: { op: "constant", value: 2 } };
  legacy.digests.program = "00000000";
  assert.throws(() => parseSavedConstruct(JSON.stringify(legacy), ARBALEST_SENSORS), /program digest/);
});

test("direct_v1_absolute_health_comparisons_migrate_in_both_operand_orders", () => {
  const legacy = legacySaved(arbalestSavedConstruct());
  const rule = legacy.program.rules.find(({ id }) => id === "fire-in-range");
  const extra = structuredClone(rule);
  extra.id = "reverse-health-threshold";
  extra.condition = { op: "lt", left: { op: "constant", value: 9 },
    right: { op: "sensor", id: "module-max-health-effigy-arbalest" } };
  legacy.program.rules.push(extra);
  refreshProgramDigest(legacy);
  const migrated = parseSavedConstruct(JSON.stringify(legacy), ARBALEST_SENSORS);
  const migratedRule = migrated.program.rules.find(({ id }) => id === "reverse-health-threshold");
  assert.equal(migratedRule.condition.left.value, 0.45);
  const forward = migrated.program.rules.find(({ id }) => id === "fire-in-range");
  assert.match(JSON.stringify(forward.condition), /"value":0\.45/);
});

test("complex_v1_absolute_health_arithmetic_is_refused_by_rule_and_sensor_name", () => {
  const legacy = legacySaved(arbalestSavedConstruct());
  const rule = legacy.program.rules.find(({ id }) => id === "fire-in-range");
  rule.condition = { op: "gt", left: { op: "add", values: [
    { op: "sensor", id: "module-max-health-effigy-arbalest" }, { op: "constant", value: 1 },
  ] }, right: { op: "constant", value: 2 } };
  refreshProgramDigest(legacy);
  assert.throws(() => parseSavedConstruct(JSON.stringify(legacy), ARBALEST_SENSORS),
    /saved construct v1 program rule "fire-in-range" cannot migrate absolute health expression "module-max-health-effigy-arbalest"/);
});

test("normalized_health_program_expressions_in_both_operand_orders_and_nested_forms_do_not_move", () => {
  const legacy = legacySaved(arbalestSavedConstruct());
  const rule = legacy.program.rules.find(({ id }) => id === "fire-in-range");
  rule.condition = { op: "and", values: [
    { op: "gt", left: { op: "sensor", id: "part-health-torso" }, right: { op: "constant", value: 0.4 } },
    { op: "lt", left: { op: "constant", value: 0.8 }, right: { op: "sensor", id: "module-health-effigy-arbalest" } },
    { op: "gt", left: { op: "mul", values: [{ op: "sensor", id: "part-health-torso" },
      { op: "constant", value: 0.5 }] }, right: { op: "constant", value: 0.1 } },
  ] };
  refreshProgramDigest(legacy);
  const migrated = parseSavedConstruct(JSON.stringify(legacy), ARBALEST_SENSORS);
  assert.deepEqual(migrated.program.rules.find(({ id }) => id === "fire-in-range").condition, rule.condition);
});

test("a_failed_library_entry_prevents_the_atomic_v2_storage_write", () => {
  const valid = legacySaved(arbalestSavedConstruct());
  const invalid = structuredClone(valid); invalid.name = "Broken migration";
  invalid.program.rules.find(({ id }) => id === "fire-in-range").condition = { op: "gt",
    left: { op: "add", values: [{ op: "sensor", id: "module-max-health-effigy-arbalest" },
      { op: "constant", value: 1 }] }, right: { op: "constant", value: 2 } };
  refreshProgramDigest(invalid);
  const legacyEnvelope = JSON.stringify({ version: 1, entries: [valid, invalid] });
  let writes = 0;
  const storage = { getItem: (key) => key === LEGACY_CONSTRUCT_LIBRARY_STORAGE_KEY ? legacyEnvelope : null,
    setItem: () => { writes += 1; } };
  assert.throws(() => loadConstructLibrary(storage, ARBALEST_SENSORS), /entry\[1\].*cannot migrate/);
  assert.equal(writes, 0);
});

test("v2_projectile_efficiency_is_digest_verified_then_migrated_through_v3_v4_to_v5", () => {
  const source = priorSaved(arbalestSavedConstruct("Arbalest v2"), 2);
  const projectile = source.blueprint.modules.find(({ id }) => id === "effigy-arbalest").projectile;
  projectile.damageScale = 0.75;
  source.digests.blueprint = v2BlueprintDigest(source.blueprint);
  const migrated = parseSavedConstruct(JSON.stringify(source), ARBALEST_SENSORS);
  assert.equal(migrated.version, 5);
  assert.equal(migrated.blueprint.version, 5);
  assert.equal(migrated.blueprint.modules.find(({ id }) => id === "effigy-arbalest")
    .projectile.penetrationEfficiency, 0.75);
  projectile.damageScale = 0.5;
  assert.throws(() => parseSavedConstruct(JSON.stringify(source), ARBALEST_SENSORS), /blueprint digest/);
});

test("v3_saved_content_migrates_to_v5_without_inventing_a_mounted_striker", () => {
  const source = priorSaved(arbalestSavedConstruct("Arbalest v3"), 3);
  const migrated = parseSavedConstruct(JSON.stringify(source), ARBALEST_SENSORS);
  assert.equal(migrated.version, 5);
  assert.equal(migrated.blueprint.modules.some(({ mountedContactStriker }) => mountedContactStriker), false);
});

test("v4_contact_hardware_is_digest_verified_then_migrated_to_one_named_mass_surface", () => {
  const source = structuredClone(saved("Warden v4"));
  source.version = 4;
  source.blueprint.version = 4;
  const shield = source.blueprint.modules.find(({ id }) => id === "warden-shield");
  shield.mountedContactStriker = { kind: "authored-shove", localContactPoint: [-0.35, 0, 0.84],
    shoveSpecificImpulseMps: 0.008 };
  source.digests.blueprint = v4BlueprintDigest(source.blueprint);
  const migrated = parseSavedConstruct(JSON.stringify(source), WARDEN_SENSORS);
  assert.equal(migrated.version, 5);
  const contact = migrated.blueprint.modules.find(({ id }) => id === "warden-shield").mountedContactStriker;
  assert.deepEqual(contact, { kind: "authored-surface", action: "bash", surfaces: [{
    id: "legacy-contact", primitiveId: "boss", kind: "mass", damageScale: 0,
    localContactPoint: [-0.35, 0, 0.84], shoveSpecificImpulseMps: 0.008,
  }] });
});
