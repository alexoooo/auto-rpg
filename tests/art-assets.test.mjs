import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { checkAssets } from "../scripts/art/assets.mjs";
import { digest } from "../scripts/art/tools.mjs";

test("art descriptors share immutable resources and isolate animation data", async t => {
  const parent = resolve(".tmp/art-contract");
  await mkdir(parent, { recursive: true });
  const folder = await mkdtemp(join(parent, "case-"));
  t.after(() => rm(folder, { recursive: true, force: true }));
  const put = async (value, extension) => {
    const bytes = Buffer.from(typeof value === "string" ? value : JSON.stringify(value));
    const uri = `${digest(bytes)}.${extension}`; await writeFile(join(folder, uri), bytes); return uri;
  };
  const geometry = await put("geometry", "bin"), animation = await put("animation", "bin"), texture = await put("texture", "ktx2");
  const model = { nodes: [], meshes: [], buffers: [{ uri: geometry }], images: [{ uri: texture }] };
  const workshop = { ...model, buffers: [...model.buffers, { uri: animation }], animations: [{ name: "walk" }] };
  const modelUri = await put(model, "gltf"), workshopUri = await put(workshop, "gltf");
  const manifest = { characters: { example: { model: { uri: modelUri, resources: [modelUri, geometry, texture] },
    workshop: { uri: workshopUri, resources: [workshopUri, geometry, animation, texture] }, structure: { nodes: [], meshes: [] } } }, decoders: {} };
  const save = () => writeFile(join(folder, "manifest.json"), JSON.stringify(manifest));
  await save();
  assert.deepEqual(await checkAssets(folder), { manifest, baseBytes: Buffer.byteLength(JSON.stringify(model)) + 8 + 7 });
  await rm(join(folder, geometry));
  await assert.rejects(checkAssets(folder), /Missing asset/);
  await writeFile(join(folder, geometry), "changed");
  await assert.rejects(checkAssets(folder), /Changed artifact/);
  await writeFile(join(folder, geometry), "geometry");
  const leaking = await put({ ...model, animations: workshop.animations }, "gltf");
  manifest.characters.example.model = { uri: leaking, resources: [leaking, geometry, texture] };
  await save();
  await assert.rejects(checkAssets(folder), /gameplay contains animation/);
});
