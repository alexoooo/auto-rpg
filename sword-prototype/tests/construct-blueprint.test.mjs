import assert from "node:assert/strict";
import test from "node:test";
import { CONSTRUCT_BLUEPRINT_LIMITS, validateBlueprint } from "../src/construct/blueprint.ts";
import { blueprintDigest, canonicalBlueprintJson, parseBlueprint } from "../src/construct/canonical.ts";

const frame = (positionM = [0, 0, 0]) => ({ positionM, rotation: [0, 0, 0, 1] });
const shell = (style = "plate") => ({ style, visualClearanceM: 0.006 });
const part = (id, fatal = false) => ({ id, shape: { kind: "box", sizeM: [0.3, 0.4, 0.2] }, massKg: 4,
  centreOfMassM: [0, 0, 0], friction: 0.7, restitution: 0.05, health: 100, armour: 8,
  vitalityWeight: fatal ? 1 : 0, fatal, shell: shell(fatal ? "core" : "plate") });
const geometry = (id, style = "plate") => ({ id, frame: frame(), shape: { kind: "box", sizeM: [0.2, 0.2, 0.2] }, shell: shell(style) });
const blueprint = () => ({ version: 1, id: "contract-fixture", rootPart: "core",
  parts: [part("limb"), part("core", true)],
  joints: [{ id: "bearing", parentPart: "core", childPart: "limb", parentFrame: frame([0, 0.2, 0]),
    childFrame: frame([0, -0.2, 0]), angularAxes: [
      { id: "x", minRad: -1, maxRad: 1, damping: 3, maxTorqueNm: 80, maxSpeedRadS: 4 },
      { id: "z", minRad: -0.2, maxRad: 0.2, damping: 2, maxTorqueNm: 30, maxSpeedRadS: 2 },
    ], health: 70, armour: 5 }],
  sockets: [
    { id: "power-socket", part: "core", frame: frame(), accepts: ["power"] },
    { id: "sensor-socket", part: "limb", frame: frame(), accepts: ["sensor"] },
    { id: "launcher-socket", part: "core", frame: frame(), accepts: ["weapon"] },
  ], modules: [
    { id: "power", kind: "power-core", socket: "power-socket", compatibilityTag: "power",
      geometry: [geometry("rune", "core")], massKg: 5, health: 90, armour: 10, capacityJ: 1000, maxOutputW: 300 },
    { id: "sensor", kind: "opponent-sensor", socket: "sensor-socket", compatibilityTag: "sensor",
      geometry: [geometry("lens", "bearing")], massKg: 1, health: 40, armour: 2,
      sensorChannels: ["line-of-sight", "opponent-range"] },
    { id: "launcher", kind: "launcher", socket: "launcher-socket", compatibilityTag: "weapon",
      geometry: [geometry("stock"), geometry("rail", "bearing")], massKg: 8, health: 80, armour: 8,
      maxHeatJ: 500, coolingW: 30, reloadSeconds: 0.5, heatPerShotJ: 40, energyPerShotJ: 80,
      projectile: { poolSize: 12, massKg: 0.1, radiusM: 0.015, lengthM: 0.3, muzzleSpeedMps: 35, damageScale: 1.1 } },
  ] });

const refusal = (value, pattern) => assert.throws(() => validateBlueprint(value), pattern);

test("a_blueprint_round_trip_preserves_every_declared_part_joint_socket_and_module", () => {
  const source = blueprint(); const parsed = parseBlueprint(canonicalBlueprintJson(source));
  assert.equal(canonicalBlueprintJson(parsed), canonicalBlueprintJson(source));
  assert.equal(parsed.joints[0].angularAxes.length, 2);
  assert.equal(parsed.modules.find(({ id }) => id === "launcher").projectile.muzzleSpeedMps, 35);
});

test("part_roles_do_not_exist_in_the_physical_grammar", () => {
  const source = blueprint(); source.parts[0].role = "leg";
  refusal(source, /part "limb".*unknown field "role"/);
});

test("a_cycle_disconnected_part_duplicate_id_or_missing_reference_is_refused_by_name", () => {
  const duplicate = blueprint(); duplicate.parts.push(structuredClone(duplicate.parts[0])); refusal(duplicate, /parts.*duplicate id/);
  const missing = blueprint(); missing.joints[0].parentPart = "missing"; refusal(missing, /bearing.*parentPart.*missing/);
  const disconnected = blueprint(); disconnected.parts.push(part("orphan")); refusal(disconnected, /orphan.*disconnected/);
  const cycle = blueprint(); cycle.joints.push({ ...structuredClone(cycle.joints[0]), id: "return", parentPart: "limb", childPart: "core" });
  refusal(cycle, /return.*root part.*child/);
});

test("non_finite_non_positive_and_non_normalized_geometry_is_refused_at_its_field", () => {
  const nonFinite = blueprint(); nonFinite.parts[0].centreOfMassM[1] = Infinity; refusal(nonFinite, /limb.*centreOfMassM\[1\].*finite/);
  const nonPositive = blueprint(); nonPositive.modules[0].geometry[0].shape.sizeM[0] = 0; refusal(nonPositive, /power.*sizeM\[0\].*positive/);
  const rotation = blueprint(); rotation.joints[0].childFrame.rotation = [0, 0, 0, 2]; refusal(rotation, /bearing.*childFrame.rotation.*normalized/);
  const axis = blueprint(); axis.joints[0].angularAxes.push(structuredClone(axis.joints[0].angularAxes[0])); refusal(axis, /bearing.*duplicate axis/);
  const sword = blueprint(); sword.modules[2] = { id: "sword", kind: "sword", socket: "launcher-socket",
    compatibilityTag: "weapon", geometry: [geometry("blade")], massKg: 4, health: 70, armour: 5,
    striker: { localTipM: [0, 0, 1], localEdgeDirection: [1, 0, 0], localFlatDirection: [0, 1, 0], damageScale: 1 } };
  refusal(sword, /sword.*striker.localTipM.*declared geometry/);
});

test("a_module_cannot_mount_to_an_incompatible_or_already_occupied_socket", () => {
  const incompatible = blueprint(); incompatible.modules[0].compatibilityTag = "sensor"; refusal(incompatible, /power.*incompatible.*power-socket/);
  const occupied = blueprint(); occupied.modules[1].socket = "power-socket"; occupied.modules[1].compatibilityTag = "power";
  refusal(occupied, /sensor.*already occupied.*power/);
});

test("canonical_blueprint_bytes_ignore_object_insertion_order_and_change_with_every_contract_field", () => {
  const source = blueprint(); const reordered = structuredClone(source); reordered.parts.reverse(); reordered.modules.reverse();
  reordered.joints[0].angularAxes.reverse(); reordered.sockets[0].accepts.reverse();
  assert.equal(canonicalBlueprintJson(reordered), canonicalBlueprintJson(source));
  for (const change of [
    (value) => { value.parts[0].centreOfMassM[0] += 0.01; },
    (value) => { value.parts[0].restitution += 0.01; },
    (value) => { value.parts[0].shell.visualClearanceM += 0.001; },
    (value) => { value.joints[0].angularAxes[0].maxTorqueNm += 1; },
    (value) => { value.joints[0].health += 1; },
    (value) => { value.modules[0].geometry[0].shape.sizeM[0] += 0.01; },
    (value) => { value.modules[0].capacityJ += 1; },
    (value) => { value.modules[2].projectile.muzzleSpeedMps += 1; },
  ]) { const changed = structuredClone(source); change(changed); assert.notEqual(blueprintDigest(changed), blueprintDigest(source)); }
});

test("blueprint_set_arrays_canonicalize_by_ID_while_duplicate_members_refuse", () => {
  const source = blueprint(); const reordered = structuredClone(source); reordered.modules[1].sensorChannels.reverse();
  assert.equal(canonicalBlueprintJson(reordered), canonicalBlueprintJson(source));
  const duplicate = blueprint(); duplicate.modules[1].sensorChannels.push("line-of-sight"); refusal(duplicate, /sensorChannels.*duplicate/);
});

test("a_version_or_unknown_key_from_the_future_is_refused_instead_of_repaired", () => {
  const future = blueprint(); future.version = 2; refusal(future, /version" 2 is unsupported/);
  const unknown = blueprint(); unknown.modules[0].drawW = 2; refusal(unknown, /power.*unknown field "drawW"/);
  const wrongOwner = blueprint(); wrongOwner.modules[0].ammunition = 2; refusal(wrongOwner, /ammunition.*not owned by kind "power-core"/);
});

test("oversize_blueprints_refuse_before_allocating_runtime_state", () => {
  const source = blueprint(); source.parts = Array.from({ length: CONSTRUCT_BLUEPRINT_LIMITS.maxParts + 1 }, (_, index) => part(`p-${index}`, index === 0));
  refusal(source, /parts.*maximum 128/);
  assert.throws(() => parseBlueprint(" ".repeat(CONSTRUCT_BLUEPRINT_LIMITS.maxBytes + 1)), /maximum 1048576 bytes/);
  assert.throws(() => parseBlueprint("[".repeat(CONSTRUCT_BLUEPRINT_LIMITS.maxDepth + 1)), /maximum nesting depth 64/);
});
