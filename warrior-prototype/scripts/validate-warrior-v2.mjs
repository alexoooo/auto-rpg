import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { validateBytes } from "gltf-validator";

const assetUrl = new URL("../public/assets/warrior-v2.glb", import.meta.url);
const contract = JSON.parse(await readFile(new URL("../asset-src/v2/warrior-v2.contract.json", import.meta.url), "utf8"));
const manifest = JSON.parse(await readFile(new URL("../asset-src/v2/texture-manifest.json", import.meta.url), "utf8"));
const bytes = await readFile(assetUrl);
assert.equal(bytes.subarray(0, 4).toString("ascii"), "glTF", "v2 asset is not binary glTF");
assert.ok(bytes.byteLength <= contract.maximumGlbBytes, "v2 GLB exceeds payload contract");
const report = await validateBytes(new Uint8Array(bytes), { uri: "warrior-v2.glb", maxIssues: 200 });
assert.equal(report.issues.numErrors, 0, JSON.stringify(report.issues.messages, null, 2));
assert.equal(report.issues.numWarnings, 0, JSON.stringify(report.issues.messages, null, 2));
assert.ok(report.info.totalTriangleCount <= contract.maximumTriangles, "v2 triangle budget exceeded");

const jsonLength = bytes.readUInt32LE(12);
const jsonType = bytes.readUInt32LE(16);
assert.equal(jsonType, 0x4e4f534a, "first GLB chunk is not JSON");
const gltf = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString("utf8").trim());
const regions = new Set();
for (const node of gltf.nodes ?? []) {
  if (node.extras?.warrior_region) regions.add(node.extras.warrior_region);
}
for (const region of contract.requiredRegions) assert.ok(regions.has(region), `missing region ${region}`);
const primitives = (gltf.meshes ?? []).flatMap(mesh => mesh.primitives ?? []);
assert.ok(primitives.every(primitive => primitive.attributes.POSITION !== undefined), "mesh lacks POSITION");
assert.ok(primitives.every(primitive => primitive.attributes.NORMAL !== undefined), "mesh lacks NORMAL");
assert.ok(primitives.every(primitive => primitive.attributes.TEXCOORD_0 !== undefined), "mesh lacks UVs");
assert.ok(primitives.some(primitive => primitive.attributes.TANGENT !== undefined), "no exported tangents");
assert.ok((gltf.images ?? []).length > 0, "v2 GLB has no exported texture");
const exportedMaterials = gltf.materials ?? [];
assert.ok(exportedMaterials.length > 0, "v2 GLB has no materials");
const texturedMaterials = exportedMaterials.filter(material => !material.name?.endsWith("_eye_socket_material"));
assert.ok(texturedMaterials.every(material => material.pbrMetallicRoughness?.baseColorTexture),
  "a v2 material has no exported base-colour texture");
assert.ok(texturedMaterials.every(material => material.pbrMetallicRoughness?.metallicRoughnessTexture),
  "a v2 material has no exported ORM texture");
assert.ok(texturedMaterials.every(material => material.normalTexture),
  "a v2 material has no exported normal texture");

let textureBytes = 0;
for (const entry of manifest.files) {
  const value = await readFile(new URL(`../asset-src/v2/${entry.file}`, import.meta.url));
  textureBytes += value.byteLength;
  assert.equal(createHash("sha256").update(value).digest("hex"), entry.sha256, `${entry.file} hash moved`);
}
assert.ok(textureBytes <= manifest.payloadLimitBytes, "texture payload exceeds manifest limit");
console.log(`warrior-v2.glb: ${bytes.byteLength.toLocaleString()} bytes, ${report.info.totalTriangleCount.toLocaleString()} triangles, ${regions.size} regions, zero validator issues`);
