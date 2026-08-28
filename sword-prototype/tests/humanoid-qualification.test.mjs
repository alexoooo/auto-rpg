import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { LANDMARK_LIMIT_MM, attributeDigests, qualifySelectedHumanoid } from "../scripts/qualify-humanoid.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

test("the_untouched_universal_ranger_is_rejected_instead_of_stretched_onto_the_physics_rig", async () => {
  const report = await qualifySelectedHumanoid(ROOT);
  const recorded = JSON.parse(await readFile(resolve(ROOT,
    "asset-src/armour/quaternius-ranger/qualification.json"), "utf8"));
  assert.equal(report.status, "rejected");
  assert.equal(report.integrity.ok, true, report.integrity.failures.join("\n"));
  assert.equal(report.landmarkLimitMm, 25);
  assert.equal(report.uniformScale, 0.963078);
  const primary = report.limbs.find((limb) => limb.name === "primary arm");
  const secondary = report.limbs.find((limb) => limb.name === "secondary arm");
  assert.ok(primary.wristErrorMm > LANDMARK_LIMIT_MM, JSON.stringify(primary));
  assert.ok(secondary.wristErrorMm > LANDMARK_LIMIT_MM, JSON.stringify(secondary));
  assert.ok(report.failures.some((failure) => failure.includes("primary arm misses")));
  assert.ok(report.failures.some((failure) => failure.includes("no creator-authored sword or shield hand pose")));
  assert.deepEqual(recorded.limbs.slice(0, 2).map(({ name, elbowErrorMm, wristErrorMm }) =>
    ({ name, elbowErrorMm, wristErrorMm })), report.limbs.slice(0, 2).map(({ name, elbowErrorMm, wristErrorMm }) =>
    ({ name, elbowErrorMm, wristErrorMm })), "the durable rejection report matches the executable gate");
  assert.deepEqual(recorded.attributeDigests, Object.fromEntries(Object.entries(report.attributeDigests)
    .map(([semantic, value]) => [semantic, value.sha256])));
});

test("the_source_attribute_digest_changes_when_even_one_weight_byte_moves", async () => {
  const gltf = JSON.parse(await readFile(resolve(ROOT, "asset-src/armour/quaternius-ranger/ranger-source.gltf"), "utf8"));
  const binary = await readFile(resolve(ROOT, "asset-src/armour/quaternius-ranger/ranger-source.bin"));
  const before = attributeDigests(gltf, binary);
  const accessor = gltf.accessors[gltf.meshes[0].primitives[0].attributes.WEIGHTS_0];
  const view = gltf.bufferViews[accessor.bufferView];
  const mutated = Buffer.from(binary);
  const offset = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  mutated[offset] ^= 1;
  const after = attributeDigests(gltf, mutated);
  assert.notEqual(after.WEIGHTS_0.sha256, before.WEIGHTS_0.sha256);
  assert.equal(after.POSITION.sha256, before.POSITION.sha256,
    "the mutation proves the protected stream rather than perturbing unrelated geometry");
});
