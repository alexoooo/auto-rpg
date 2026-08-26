import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { warriorAsset, WARRIOR_ASSETS } from "../app/warrior-assets.ts";

// Every asset the viewer can be pointed at must actually load. A missing file or
// a model without the root the scene looks for shows up as a blank canvas with
// no error, which is indistinguishable from the viewer being broken.
test("every selectable asset exists and carries the scene root", async () => {
  for (const [name, file] of Object.entries(WARRIOR_ASSETS)) {
    const url = new URL(`../public/assets/${file}`, import.meta.url);
    assert.ok(existsSync(url), `${name} -> ${file} is missing from public/assets`);
    const bytes = await readFile(url);
    assert.equal(bytes.subarray(0, 4).toString("ascii"), "glTF", `${file} is not binary glTF`);
    const jsonLength = bytes.readUInt32LE(12);
    assert.equal(bytes.readUInt32LE(16), 0x4e4f534a, `${file} has no JSON chunk`);
    const gltf = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString("utf8").trim());
    assert.ok((gltf.nodes ?? []).some((node) => node.name === "Warrior"),
      `${file} has no Warrior scene root, so the viewer would throw`);
    assert.ok((gltf.meshes ?? []).length > 0, `${file} exports no meshes`);
  }
});

test("an unknown asset parameter falls back instead of failing", () => {
  assert.equal(warriorAsset(null), "v1");
  assert.equal(warriorAsset("nonsense"), "v1");
  assert.equal(warriorAsset("constructor"), "v1");
  for (const name of Object.keys(WARRIOR_ASSETS)) assert.equal(warriorAsset(name), name);
});
