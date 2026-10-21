import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join, resolve, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS, EXTMeshoptCompression, KHRTextureBasisu } from "@gltf-transform/extensions";
import { MeshoptEncoder, MeshoptDecoder } from "meshoptimizer";
import sharp from "sharp";
import { build as bundle } from "vite";
import validator from "gltf-validator";
import { ROOT, CACHE, TOOL_RELEASES, digest, run, tool } from "./tools.mjs";

const CATALOG = join(ROOT, "assets/art/catalog.json");
const OUTPUT = join(ROOT, "public/assets/generated");
const CURRENT = join(CACHE, "current.json");
const json = file => JSON.parse(readFileSync(file, "utf8"));
const catalog = () => json(CATALOG);

async function filesUnder(directory) {
  if (!existsSync(directory)) return [];
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map(entry => entry.isDirectory() ? filesUnder(join(directory, entry.name)) : [join(directory, entry.name)]))).flat().sort();
}

async function inputKey() {
  const files = [CATALOG, join(ROOT, "package-lock.json"),
    ...Object.values(catalog().characters).map(asset => join(ROOT, asset.source)),
    ...await filesUnder(join(ROOT, "assets/art/textures")), ...(await filesUnder(join(ROOT, "scripts/art"))).filter(file => /\.(mjs|py)$/.test(file)),
    ...["morph_export.py", "phases.py"].map(name => join(ROOT, "scripts/character-lab/realistic", name))];
  return digest(Buffer.from(JSON.stringify(await Promise.all(files.map(async file => {
    let bytes = await readFile(file);
    if (/\.(json|mjs|py)$/.test(file)) bytes = Buffer.from(bytes.toString("utf8").replace(/\r\n/g, "\n"));
    return [relative(ROOT, file).replaceAll("\\", "/"), digest(bytes)];
  })))));
}

function io() {
  // Triangle encoding rotates index triples; sequence encoding retains the authored index order.
  const encoder = { ...MeshoptEncoder, encodeGltfBuffer: (source, count, stride, mode) => MeshoptEncoder.encodeGltfBuffer(source, count, stride, mode === "TRIANGLES" ? "INDICES" : mode) };
  return new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": encoder, "meshopt.decoder": MeshoptDecoder });
}

async function put(folder, bytes, extension, prefix = "") {
  const uri = `${prefix}${digest(bytes)}.${extension}`;
  await mkdir(join(folder, prefix), { recursive: true });
  if (!existsSync(join(folder, uri))) await writeFile(join(folder, uri), bytes);
  return uri;
}

function textureKinds(document) {
  const kinds = new Map();
  for (const material of document.getRoot().listMaterials()) {
    for (const [texture, kind] of [[material.getBaseColorTexture(), "colour"], [material.getEmissiveTexture(), "colour"],
      [material.getNormalTexture(), "normal"], [material.getMetallicRoughnessTexture(), "data"], [material.getOcclusionTexture(), "data"]]) {
      if (!texture) continue;
      if (kinds.has(texture) && kinds.get(texture) !== kind) throw new Error(`Texture has incompatible uses: ${texture.getName()}`);
      kinds.set(texture, kind);
    }
  }
  return kinds;
}

async function compressTextures(document, folder, ktx, profile) {
  assert.equal(profile.colour, "etc1s"); assert.equal(profile.data, "uastc");
  document.createExtension(KHRTextureBasisu).setRequired(true);
  for (const [texture, kind] of textureKinds(document)) {
    const source = texture.getImage();
    const key = digest(Buffer.concat([Buffer.from(JSON.stringify([profile, kind, TOOL_RELEASES.ktx.version])), source]));
    const cached = join(CACHE, "textures", `${key}.ktx2`);
    if (!existsSync(cached)) {
      await mkdir(join(CACHE, "textures"), { recursive: true });
      const staging = join(ROOT, ".tmp/art-encode");
      await mkdir(staging, { recursive: true });
      const input = join(staging, `${key}.png`), output = join(staging, `${key}.ktx2`);
      await sharp(source).resize({ width: profile.maxTextureDimension, height: profile.maxTextureDimension, fit: "inside", withoutEnlargement: true }).ensureAlpha().png().toFile(input);
      const srgb = kind === "colour";
      await run(ktx, ["create", "--format", srgb ? "R8G8B8A8_SRGB" : "R8G8B8A8_UNORM", "--assign-tf", srgb ? "srgb" : "linear", "--generate-mipmap",
        "--encode", srgb ? "basis-lz" : "uastc", "--threads", "1",
        ...(srgb ? ["--qlevel", String(profile.colourQuality), "--clevel", "1"] : ["--uastc-quality", String(profile.dataQuality), "--zstd", String(profile.zstdLevel)]), input, output]);
      await cp(output, cached);
      await rm(input); await rm(output);
    }
    const bytes = await readFile(cached), uri = await put(folder, bytes, "ktx2", "textures/");
    texture.setImage(bytes).setMimeType("image/ktx2").setURI(uri);
  }
}

function dataSignature(document) {
  const hash = createHash("sha256");
  const accessor = value => {
    if (!value) { hash.update("null\n"); return; }
    hash.update(JSON.stringify([value.getType(), value.getComponentType(), value.getNormalized()]));
    const array = value.getArray();
    hash.update(new Uint8Array(array.buffer, array.byteOffset, array.byteLength));
  };
  for (const mesh of document.getRoot().listMeshes()) {
    hash.update(mesh.getName());
    for (const primitive of mesh.listPrimitives()) {
      accessor(primitive.getIndices());
      for (const semantic of primitive.listSemantics().sort()) { hash.update(semantic); accessor(primitive.getAttribute(semantic)); }
      for (const target of primitive.listTargets()) for (const semantic of target.listSemantics().sort()) { hash.update(semantic); accessor(target.getAttribute(semantic)); }
    }
  }
  for (const skin of document.getRoot().listSkins()) {
    hash.update(JSON.stringify(skin.listJoints().map(node => node.getName()))); accessor(skin.getInverseBindMatrices());
  }
  for (const animation of document.getRoot().listAnimations()) {
    hash.update(animation.getName());
    for (const channel of animation.listChannels()) {
      const sampler = channel.getSampler();
      hash.update(JSON.stringify([channel.getTargetNode().getName(), channel.getTargetPath(), sampler.getInterpolation()]));
      accessor(sampler.getInput()); accessor(sampler.getOutput());
    }
  }
  return hash.digest("hex");
}

async function writeModel(document, folder, name, structure) {
  const expectedData = dataSignature(document);
  const output = await io().writeJSON(document);
  for (const view of output.json.bufferViews ?? []) {
    const compression = view.extensions?.EXT_meshopt_compression;
    if (compression?.mode === "TRIANGLES") compression.mode = "INDICES";
  }
  // glTF writers omit transforms close to identity; the rig retains its exact authored frames.
  const frames = new Map(structure.nodes.map(([node, translation, rotation, scale]) => [node, { translation, rotation, scale }]));
  for (const node of output.json.nodes) Object.assign(node, frames.get(node.name));
  const resources = {};
  for (const [uri, bytes] of Object.entries(output.resources)) {
    const replacement = uri.endsWith(".ktx2") ? uri : await put(folder, bytes, "bin", "buffers/");
    for (const buffer of output.json.buffers ?? []) if (buffer.uri === uri) buffer.uri = replacement;
    for (const image of output.json.images ?? []) if (image.uri === uri) image.uri = replacement;
    resources[replacement] = bytes;
  }
  assert.equal(dataSignature(await io().readJSON({ json: output.json, resources })), expectedData, `${name}: geometry, skin or animation data changed`);
  const validation = await validator.validateString(JSON.stringify(output.json), {
    externalResourceFunction: uri => readFile(join(folder, uri)), maxIssues: 20,
  });
  if (validation.issues.numErrors) throw new Error(`${name}: invalid glTF\n${JSON.stringify(validation.issues.messages)}`);
  const uri = await put(folder, Buffer.from(JSON.stringify(output.json)), "gltf");
  return { uri, resources: [...new Set([uri, ...(output.json.buffers ?? []).flatMap(b => b.uri ? [b.uri] : []), ...output.json.images.map(i => i.uri)])] };
}

async function character(id, source, work, folder, tools, profile) {
  const raw = join(work, "lossless", `${id}.glb`);
  await run(tools.blender, ["--background", "--disable-autoexec", "--python-exit-code", "1", "--python", "scripts/art/blender.py", "--", "export", source, raw]);
  const document = await io().read(raw), root = document.getRoot();
  const structure = { nodes: root.listNodes().map(node => [node.getName(), node.getTranslation(), node.getRotation(), node.getScale()]), meshes: root.listMeshes().map(mesh => mesh.getName()) };
  await compressTextures(document, folder, tools.ktx, profile);
  const geometry = document.createBuffer().setURI("geometry.bin"), animations = document.createBuffer().setURI("animations.bin");
  const animationAccessors = new Set(root.listAnimations().flatMap(animation => animation.listSamplers().flatMap(sampler => [sampler.getInput(), sampler.getOutput()])));
  for (const accessor of root.listAccessors()) accessor.setBuffer(animationAccessors.has(accessor) ? animations : geometry);
  for (const buffer of root.listBuffers()) if (buffer !== geometry && buffer !== animations) buffer.dispose();
  document.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
  const workshop = await writeModel(document, folder, `${id}.workshop`, structure);
  for (const animation of [...root.listAnimations()]) {
    for (const channel of animation.listChannels()) channel.dispose();
    for (const sampler of animation.listSamplers()) sampler.dispose();
    animation.dispose();
  }
  for (const accessor of animationAccessors) {
    if (accessor.listParents().some(parent => parent !== root)) throw new Error("Animation data is shared with geometry");
    accessor.dispose();
  }
  animations.dispose();
  const model = await writeModel(document, folder, `${id}.model`, structure);
  return { model, workshop, structure };
}

async function decoders(folder) {
  const outputs = {}, base = join(ROOT, "node_modules/@babylonjs/ktx2decoder");
  const built = await bundle({ configFile: false, logLevel: "error", build: { write: false, minify: true,
    lib: { entry: join(base, "legacy/legacy.js"), name: "KTX2DECODER", formats: ["iife"] } } });
  outputs.jsDecoderModule = await put(folder, Buffer.from((Array.isArray(built) ? built[0] : built).output[0].code), "js", "decoders/");
  const names = { wasmUASTCToASTC: "uastc_astc.wasm", wasmUASTCToBC7: "uastc_bc7.wasm", wasmUASTCToRGBA_UNORM: "uastc_rgba8_unorm_v2.wasm",
    wasmUASTCToRGBA_SRGB: "uastc_rgba8_srgb_v2.wasm", wasmUASTCToR8_UNORM: "uastc_r8_unorm.wasm", wasmUASTCToRG8_UNORM: "uastc_rg8_unorm.wasm",
    jsMSCTranscoder: "msc_basis_transcoder.js", wasmMSCTranscoder: "msc_basis_transcoder.wasm", wasmZSTDDecoder: "zstddec.wasm" };
  for (const [key, name] of Object.entries(names)) outputs[key] = await put(folder, await readFile(join(base, "wasm", name)), name.split(".").at(-1), "decoders/");
  outputs.meshopt = await put(folder, await readFile(join(ROOT, "node_modules/meshoptimizer/meshopt_decoder.cjs")), "js", "decoders/");
  await writeFile(join(folder, "NOTICE.txt"), await Promise.all(["license.md", "NOTICE.md"].map(name => readFile(join(base, name), "utf8"))).then(text => text.join("\n"))
    + "\n" + await readFile(join(ROOT, "node_modules/meshoptimizer/LICENSE.md"), "utf8") + "\nCharacter sources: MakeHuman/MPFB CC0; clothing, equipment and motion authored by Auto-RPG.\n");
  return outputs;
}

/** Structural validation also protects consumers from silent reintroduction of duplicated payloads. */
export async function checkAssets(folder = OUTPUT) {
  const manifest = json(join(folder, "manifest.json")), base = new Set();
  for (const [id, asset] of Object.entries(manifest.characters)) {
    const model = json(join(folder, asset.model.uri)), workshop = json(join(folder, asset.workshop.uri));
    assert.equal(model.animations, undefined, `${id}: gameplay contains animation`);
    assert.ok(workshop.animations?.length, `${id}: workshop lacks animation`);
    const structure = doc => ({ nodes: doc.nodes.map(node => [node.name, node.translation ?? [0, 0, 0], node.rotation ?? [0, 0, 0, 1], node.scale ?? [1, 1, 1]]), meshes: doc.meshes.map(mesh => mesh.name) });
    assert.deepEqual(structure(model), asset.structure, `${id}: rig or mesh structure changed`);
    assert.deepEqual(structure(workshop), asset.structure, `${id}: workshop rig changed`);
    for (const uri of asset.model.resources) base.add(uri);
    for (const variant of [asset.model, asset.workshop]) {
      const doc = json(join(folder, variant.uri));
      const referenced = [variant.uri, ...(doc.buffers ?? []).flatMap(buffer => buffer.uri ? [buffer.uri] : []), ...(doc.images ?? []).map(image => image.uri)];
      assert.deepEqual([...new Set(referenced)].sort(), [...variant.resources].sort(), `${id}: resource graph is incomplete`);
      for (const uri of variant.resources) {
        assert.ok(!uri.includes("..") && !uri.includes(":"), `Non-local asset: ${uri}`);
        assert.ok(existsSync(join(folder, uri)), `Missing asset: ${uri}`);
        assert.equal(digest(await readFile(join(folder, uri))), uri.split("/").at(-1).split(".")[0], `Changed artifact: ${uri}`);
      }
    }
    const geometry = model.buffers.filter(b => b.uri).map(b => b.uri);
    assert.ok(geometry.every(uri => workshop.buffers.some(b => b.uri === uri)), `${id}: duplicated geometry`);
    assert.deepEqual(model.images.map(i => i.uri), workshop.images.map(i => i.uri), `${id}: duplicated textures`);
  }
  const bytes = (await Promise.all([...base].map(uri => readFile(join(folder, uri))))).reduce((sum, b) => sum + b.length, 0);
  assert.ok(bytes <= catalog().profile.baseBudgetBytes, `Character base resources: ${bytes} > ${catalog().profile.baseBudgetBytes} bytes`);
  const hashes = new Set();
  for (const file of await filesUnder(join(folder, "textures"))) {
    const hash = digest(await readFile(file));
    assert.ok(!hashes.has(hash), `Duplicate encoded texture: ${file}`); hashes.add(hash);
  }
  for (const uri of Object.values(manifest.decoders)) assert.ok(existsSync(join(folder, uri)), `Missing decoder: ${uri}`);
  return { manifest, baseBytes: bytes };
}

async function buildAssets({ force = false } = {}) {
  const key = await inputKey(), work = join(CACHE, "builds", key), folder = join(work, "public");
  if (!force && existsSync(join(folder, "manifest.json"))) {
    await checkAssets(folder);
  } else {
    console.log("Building character assets (lossless source export, shared web resources)");
    await mkdir(work, { recursive: true });
    const tools = { blender: await tool("blender"), ktx: await tool("ktx") };
    const assets = {}, spec = catalog();
    await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
    await mkdir(folder, { recursive: true });
    for (const [id, asset] of Object.entries(spec.characters)) {
      console.log(`Exporting ${id}`);
      assets[id] = await character(id, asset.source, work, folder, tools, spec.profile);
    }
    await writeFile(join(folder, "manifest.json"), JSON.stringify({ version: 1, key, characters: assets, decoders: await decoders(folder) }));
    await checkAssets(folder);
  }
  await mkdir(OUTPUT, { recursive: true });
  await cp(folder, OUTPUT, { recursive: true });
  const keep = new Set((await filesUnder(folder)).map(file => relative(folder, file)));
  for (const file of await filesUnder(OUTPUT)) if (!keep.has(relative(OUTPUT, file))) await rm(file);
  await writeFile(CURRENT, JSON.stringify({ key }));
  return checkAssets();
}

async function report() {
  const { manifest, baseBytes } = await checkAssets();
  const size = async uris => (await Promise.all([...new Set(uris)].map(uri => readFile(join(OUTPUT, uri))))).reduce((sum, b) => sum + b.length, 0);
  const base = Object.values(manifest.characters).flatMap(asset => asset.model.resources);
  const all = Object.values(manifest.characters).flatMap(asset => asset.workshop.resources);
  console.log(JSON.stringify({ harness: "Static web artifacts; bytes before HTTP compression, shared resources counted once", baseBytes,
    workshopAdditionalBytes: await size(all.filter(uri => !base.includes(uri))), decodersBytes: await size(Object.values(manifest.decoders)),
    characters: Object.fromEntries(await Promise.all(Object.entries(manifest.characters).map(async ([id, asset]) => [id, { baseBytes: await size(asset.model.resources), workshopBytes: await size(asset.workshop.resources) }]))), key: manifest.key }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    switch (process.argv[2] ?? "build") {
      case "build": await buildAssets({ force: process.argv.includes("--force") }); console.log("Art assets ready"); break;
      case "check": await checkAssets(); assert.equal(json(join(OUTPUT, "manifest.json")).key, await inputKey(), "Assets are stale; run npm run assets"); console.log("Art assets valid"); break;
      case "report": await report(); break;
      default: throw new Error("Use build, check or report");
    }
  } catch (error) { console.error(error); process.exitCode = 1; }
}
