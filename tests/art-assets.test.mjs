import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { checkAssets, compressModel } from "../scripts/art/assets.mjs";
import { digest } from "../scripts/art/tools.mjs";
import { MeshoptDecoder } from "meshoptimizer";
import { parseSkeletonArt } from "../src/render/skeleton-skin.ts";

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
  const standalone = await put("standalone model", "glb"), environment = await put("environment", "ktx2");
  const manifest = { models: { stand: { uri: standalone, resources: [standalone] } }, textures: { wall: { uri: environment, resources: [environment] } }, characters: { example: { model: { uri: modelUri, resources: [modelUri, geometry, texture] },
    workshop: { uri: workshopUri, resources: [workshopUri, geometry, animation, texture] }, structure: { nodes: [], meshes: [] } } }, decoders: {} };
  const save = () => writeFile(join(folder, "manifest.json"), JSON.stringify(manifest));
  await save();
  assert.deepEqual(await checkAssets(folder), { manifest, baseBytes: Buffer.byteLength(JSON.stringify(model)) + 8 + 7 });
  await writeFile(join(folder, environment), "broken environment");
  await assert.rejects(checkAssets(folder), /Changed artifact/);
  await writeFile(join(folder, environment), "environment");
  manifest.models.stand.resources = [];
  await save();
  await assert.rejects(checkAssets(folder), /resource graph is incomplete/);
  manifest.models.stand.resources = [standalone];
  await save();
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

test("compressed skeleton accessors retain every piece, vertex, colour, index and eye socket", async () => {
  await MeshoptDecoder.ready;
  const original = await readFile("assets/art/environment/skeleton/skeleton.glb");
  const compressed = await compressModel(original);
  const buffer = bytes => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const decode = async (source, count, stride, mode, filter) => {
    const target = new Uint8Array(count * stride);
    MeshoptDecoder.decodeGltfBuffer(target, count, stride, source, mode, filter);
    return target;
  };
  const expected = await parseSkeletonArt(buffer(original), decode);
  assert.ok(expected.size && [...expected.values()].some(piece => piece.eyes?.length), "fixture reaches named pieces and eye metadata");
  assert.deepEqual(await parseSkeletonArt(buffer(compressed), decode), expected);
});
