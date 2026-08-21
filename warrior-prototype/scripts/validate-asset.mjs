import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { validateBytes } from "gltf-validator";

const file = new URL("../public/assets/warrior.glb", import.meta.url);
const bytes = await readFile(file);
assert.equal(bytes.subarray(0, 4).toString("ascii"), "glTF", "asset is not a binary glTF");

const report = await validateBytes(new Uint8Array(bytes), {
  uri: "warrior.glb",
  maxIssues: 200,
});
assert.equal(report.issues.numErrors, 0, JSON.stringify(report.issues.messages, null, 2));
assert.equal(report.issues.numWarnings, 0, JSON.stringify(report.issues.messages, null, 2));
assert.ok(report.info?.totalVertexCount > 1000, "warrior has too little modeled geometry");
assert.ok(report.info?.totalTriangleCount > 1000, "warrior has too few triangles");
console.log(`warrior.glb: ${bytes.byteLength.toLocaleString()} bytes, `
  + `${report.info.totalTriangleCount.toLocaleString()} triangles, zero validator issues`);
