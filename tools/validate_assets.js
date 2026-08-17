// Fail-closed validation for the representative room GLB and its semantic sidecar.
// The Blender recipe describes intent; this file independently reads exported bytes.
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const validator = require("gltf-validator");

const ROOT = path.resolve(__dirname, "..");
const GLB_MAGIC = 0x46546c67;
const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;
const COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };
const FORMATS = {
  5120: [1, "getInt8"], 5121: [1, "getUint8"], 5122: [2, "getInt16"],
  5123: [2, "getUint16"], 5125: [4, "getUint32"], 5126: [4, "getFloat32"],
};
const TOLERANCE = 0.00001;
const INSTANCE_CAPACITIES = Object.freeze({
  floor_a: 384, floor_b: 384, floor_c: 384, floor_d: 384,
  wall_straight: 73, wall_run_2: 73, wall_run_3: 73, wall_run_5: 72, wall_run_8: 72,
  wall_inside: 0,
  wall_outside: 0, wall_end: 0, door_frame: 2, door_leaf: 6,
  torch_bracket: 10, decal_rubble: 4, decal_root: 4, prop_barrel: 4,
});

function canonicalJson(value) {
  return `${JSON.stringify(value, Object.keys(value).sort())}\n`;
}

function compareUnicode(left, right) {
  const a = Array.from(left, (value) => value.codePointAt(0));
  const b = Array.from(right, (value) => value.codePointAt(0));
  for (let index = 0; index < Math.min(a.length, b.length); index++) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return a.length - b.length;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort(compareUnicode).map((key) => [key, stable(value[key])]));
  }
  return value;
}

function canonicalBytes(value) {
  const visit = (item) => {
    if (typeof item === "number" && !Number.isSafeInteger(item)) {
      throw new Error("canonical build-input JSON permits only safe-integer numbers");
    }
    if (Array.isArray(item)) item.forEach(visit);
    else if (item !== null && typeof item === "object") Object.values(item).forEach(visit);
  };
  visit(value);
  return Buffer.from(`${JSON.stringify(stable(value))}\n`, "utf8");
}

function parseRoomSidecar(bytes) {
  if ((Buffer.isBuffer(bytes) ? bytes.length : Buffer.byteLength(String(bytes))) > 1024 * 1024) {
    throw new Error("room sidecar exceeds its one MiB parser bound");
  }
  const value = JSON.parse(Buffer.isBuffer(bytes) ? bytes.toString("utf8") : String(bytes));
  if (value === null || typeof value !== "object" || Array.isArray(value) || value.schemaVersion !== 1 ||
      value.fixtureId !== "v2-room-slice-1" || !Array.isArray(value.pieces) || !Array.isArray(value.sockets)) {
    throw new Error("room sidecar does not match schema version 1");
  }
  assertFiniteDeep(value, "room sidecar");
  const exactKeys = (object, expected, label) => {
    if (JSON.stringify(Object.keys(object).sort()) !== JSON.stringify([...expected].sort())) throw new Error(`${label} has extra or missing keys`);
  };
  exactKeys(value, ["schemaVersion", "fixtureId", "buildInputsSha256", "coordinates", "runtimeFixture", "styling", "pieces", "sockets",
    "counts", "estimatedGpuResidency", "payloadBytes", "glbSha256"], "room sidecar");
  if (value.pieces.length !== 18 || value.sockets.length !== 1) throw new Error("room sidecar has unbounded or incomplete semantic arrays");
  const names = value.pieces.map((piece) => piece.node);
  if (names.some((name) => typeof name !== "string" || name.length > 64) || new Set(names).size !== names.length) {
    throw new Error("room sidecar has invalid or duplicate piece names");
  }
  for (const piece of value.pieces) exactKeys(piece, ["name", "node", "materialRole", "primitiveCount",
    "vertexCount", "triangleCount", "bounds", "collisionDebugBounds", "pivot", "allowedQuarterTurns"], `sidecar piece ${piece.node}`);
  exactKeys(value.sockets[0], ["name", "parent", "translation", "rotation"], "sidecar socket");
  exactKeys(value.coordinates, ["sceneHandedness", "upAxis", "groundAxes", "metresPerUnit", "tileSize"], "sidecar coordinates");
  exactKeys(value.runtimeFixture, ["mapSha256", "mapBytes", "solidTiles"], "sidecar runtime fixture");
  exactKeys(value.styling, ["id", "mode", "attribute", "textures"], "sidecar styling");
  exactKeys(value.counts, ["nodes", "meshes", "materials", "vertices", "triangles"], "sidecar counts");
  exactKeys(value.estimatedGpuResidency, ["sourceBufferBytes", "decodedTextureBytes", "instanceBufferBytes",
    "shadowMapBytes", "totalBytes"], "sidecar residency");
  return value;
}

function validateBuildManifest(manifest) {
  const decimal = /^-?(?:0|[1-9][0-9]*)\.[0-9]+$/;
  if (manifest.schemaVersion !== 1 || manifest.generatorVersion !== 6 || manifest.license !== "MIT" ||
      manifest.fixtureId !== "v2-room-slice-1" || manifest.generatorSeed !== 1592594996 ||
      !decimal.test(manifest.tolerance)) throw new Error("room manifest identity is invalid");
  if (manifest.toolchain?.blender !== "4.5.12" || !/^[0-9a-f]{64}$/.test(manifest.toolchain.blenderBinarySha256)) {
    throw new Error("room manifest toolchain is invalid");
  }
  if (manifest.coordinates?.sceneHandedness !== "right" || manifest.coordinates?.upAxis !== "+Y" ||
      JSON.stringify(manifest.coordinates?.groundAxes) !== JSON.stringify(["+X", "+Z"]) ||
      manifest.coordinates?.metresPerUnit !== 1 || manifest.coordinates?.tileSize !== 1) throw new Error("room manifest coordinates are invalid");
  if (manifest.runtimeFixture?.mapSha256 !== "a20ba5f64ef55bd7716c2a7cf17f3065619876d1ded2e81b05199b5282222907" ||
      manifest.runtimeFixture?.mapBytes !== 1536 || manifest.runtimeFixture?.solidTiles !== 175) {
    throw new Error("room manifest runtime fixture is invalid");
  }
  if (manifest.export?.format !== "GLB" || manifest.export?.applyModifiers !== true ||
      manifest.export?.exportMaterials !== "EXPORT" || manifest.export?.exportYup !== true ||
      manifest.export?.useSelection !== true || manifest.export?.animations !== false ||
      manifest.export?.vertexColor !== "NAME" || manifest.export?.vertexColorName !== "room_style" ||
      manifest.export?.allVertexColors !== false || manifest.export?.exportTangents !== true) {
    throw new Error("room manifest export contract is invalid");
  }
  const style = manifest.styling;
  const paletteNames = ["floorA", "floorB", "floorEdge", "neutral", "stoneDetail", "wallSide", "wallTop", "woodEnd", "woodSide", "woodTop"];
  if (style?.id !== "painted-cathedral-v4" || style?.mode !== "deterministic-vertex-color" ||
      style?.attribute !== "room_style" || style?.textures !== true || !decimal.test(style?.variation ?? "") ||
      JSON.stringify(Object.keys(style?.palette ?? {}).sort()) !== JSON.stringify(paletteNames)) {
    throw new Error("room manifest styling contract is invalid");
  }
  for (const [name, colour] of Object.entries(style.palette)) {
    if (!Array.isArray(colour) || colour.length !== 4 || colour.some((value) =>
      !decimal.test(value) || Number(value) < 0 || Number(value) > 1)) {
      throw new Error(`room manifest styling palette ${name} is invalid`);
    }
  }
  const textureNames = ["floor", "overburden", "wall", "wood"];
  if (JSON.stringify(Object.keys(manifest.textures ?? {}).sort()) !== JSON.stringify(textureNames)) {
    throw new Error("room manifest texture set is invalid");
  }
  for (const name of textureNames) {
    const texture = manifest.textures[name];
    const quadrants = { floor: [0, 1], overburden: [1, 0], wall: [1, 1], wood: [0, 0] };
    const expectedQuadrant = quadrants[name];
    if (texture?.path !== "tools/art/textures/concept-material-atlas-v3.png" ||
        !/^[0-9a-f]{64}$/.test(texture?.sha256 ?? "") || texture?.mimeType !== "image/png" ||
        texture?.width !== 1254 || texture?.height !== 1254 ||
        JSON.stringify(texture?.sourceQuadrant) !== JSON.stringify(expectedQuadrant)) {
      throw new Error(`room manifest texture ${name} is invalid`);
    }
  }
  const vfx = manifest.runtimeTextures.vfxDecals;
  const flame = manifest.runtimeTextures.vfxFlame;
  if (JSON.stringify(Object.keys(manifest.runtimeTextures ?? {}).sort()) !==
      JSON.stringify(['vfxDecals', 'vfxFlame']) ||
      vfx.sourcePath !== 'tools/art/textures/concept-vfx-decal-atlas-v1.png' ||
      vfx.runtimePath !== 'web/assets3d/room_vfx_decal_atlas.png' ||
      !/^[0-9a-f]{64}$/.test(vfx.sha256) || vfx.mimeType !== 'image/png' ||
      vfx.width !== 1254 || vfx.height !== 1254 || JSON.stringify(vfx.grid) !== '[4,4]' ||
      vfx.alpha !== true ||
      flame.sourcePath !== 'tools/art/textures/concept-vfx-flame-v1.png' ||
      flame.runtimePath !== 'web/assets3d/room_vfx_flame.png' ||
      !/^[0-9a-f]{64}$/.test(flame.sha256) || flame.mimeType !== 'image/png' ||
      flame.width !== 314 || flame.height !== 314 || JSON.stringify(flame.grid) !== '[1,1]' ||
      flame.alpha !== true) throw new Error('room manifest runtime VFX texture is invalid');
  const processing = manifest.textureProcessing;
  if (processing?.width !== 896 || processing?.height !== 896 || processing?.periodicEdgePixels !== 48 ||
      processing?.colourSpace !== "sRGB" || processing?.wrap !== "repeat" || processing?.magFilter !== 9729 ||
      processing?.minFilter !== 9987) throw new Error("room manifest texture processing is invalid");
  for (const name of textureNames) if (!/^[0-9a-f]{64}$/.test(manifest.outputs?.embeddedTextures?.[`${name}Sha256`] ?? "")) {
    throw new Error(`room manifest embedded texture ${name} output is invalid`);
  }
  if (manifest.budgets?.payloadBytes !== 67108864 || manifest.budgets?.estimatedGpuBytes !== 268435456) {
    throw new Error("room manifest budgets are invalid");
  }
  const pieceNames = ["floor_a", "floor_b", "floor_c", "floor_d", "wall_straight",
    "wall_run_2", "wall_run_3", "wall_run_5", "wall_run_8", "wall_inside", "wall_outside", "wall_end",
    "door_frame", "door_leaf", "torch_bracket", "decal_rubble", "decal_root", "prop_barrel"];
  if (!Array.isArray(manifest.pieces) || manifest.pieces.length !== pieceNames.length ||
      JSON.stringify(manifest.pieces.map((piece) => piece.name)) !== JSON.stringify(pieceNames)) throw new Error("room manifest piece set or order is invalid");
  for (const piece of manifest.pieces) {
    if (piece.node !== `ROOM_${piece.name}` || !["floor_current", "stone_current", "wood_current", "metal_current", "overburden_current"].includes(piece.materialRole) ||
        !["ground-centre", "lower-hinge"].includes(piece.pivot) || JSON.stringify(piece.allowedQuarterTurns) !== "[0,1,2,3]") {
      throw new Error(`room manifest piece ${piece.name} is invalid`);
    }
    for (const value of [...piece.bounds.min, ...piece.bounds.max]) if (!decimal.test(value)) throw new Error(`${piece.name} bound is not a canonical decimal string`);
    if (piece.name === "torch_bracket") {
      if (piece.socket?.name !== "SOCKET_torch_flame" ||
          [...piece.socket.translation, ...piece.socket.rotation].some((value) => !decimal.test(value))) throw new Error("torch socket manifest is invalid");
    } else if (piece.socket !== null) throw new Error(`${piece.name} has an unexpected socket`);
  }
  const materialNames = ["floor_current", "stone_current", "wood_current", "metal_current", "overburden_current", "emissive_flame"];
  if (JSON.stringify(Object.keys(manifest.materials ?? {}).sort()) !== JSON.stringify(materialNames.sort())) throw new Error("room manifest material set is invalid");
  for (const values of Object.values(manifest.materials)) for (const [key, value] of Object.entries(values)) {
    if (key === "baseColorTexture" && textureNames.includes(value)) continue;
    if (typeof value === "string" ? !decimal.test(value) : typeof value === "number" ? !Number.isSafeInteger(value) : typeof value !== "boolean") {
      throw new Error("room manifest material value is not deterministic");
    }
  }
  for (const [name, expectedPath] of [["glb", "web/assets3d/room_slice.glb"],
    ["sidecar", "web/assets3d/room_slice.json"], ["validator", "web/assets3d/room_slice.validator.json"]]) {
    if (manifest.outputs?.[name]?.path !== expectedPath || !/^[0-9a-f]{64}$/.test(manifest.outputs[name].sha256)) throw new Error(`room manifest ${name} output is invalid`);
  }
}

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function parseGlb(bytes) {
  if (!Buffer.isBuffer(bytes)) bytes = Buffer.from(bytes);
  if (bytes.length < 20) throw new Error("GLB is shorter than its header and JSON chunk");
  if (bytes.readUInt32LE(0) !== GLB_MAGIC) throw new Error("GLB magic is invalid");
  if (bytes.readUInt32LE(4) !== 2) throw new Error("GLB version is not 2");
  if (bytes.readUInt32LE(8) !== bytes.length) throw new Error("GLB declared length does not match its bytes");
  let offset = 12;
  const chunks = [];
  while (offset < bytes.length) {
    if (offset + 8 > bytes.length) throw new Error("GLB chunk header is truncated");
    const length = bytes.readUInt32LE(offset);
    const type = bytes.readUInt32LE(offset + 4);
    offset += 8;
    if (length % 4 !== 0 || offset + length > bytes.length) throw new Error("GLB chunk length is invalid");
    chunks.push({ type, bytes: bytes.subarray(offset, offset + length) });
    offset += length;
  }
  if (chunks.length < 1 || chunks[0].type !== JSON_CHUNK) throw new Error("GLB first chunk is not JSON");
  if (chunks.length > 2 || (chunks[1] && chunks[1].type !== BIN_CHUNK)) throw new Error("GLB has an unsupported chunk layout");
  let gltf;
  try {
    gltf = JSON.parse(chunks[0].bytes.toString("utf8").replace(/[\u0000 ]+$/u, ""));
  } catch (error) {
    throw new Error(`GLB JSON is invalid: ${error.message}`);
  }
  return { gltf, bin: chunks[1]?.bytes ?? Buffer.alloc(0) };
}

function assertSafeUri(uri, label) {
  if (typeof uri !== "string" || !uri) throw new Error(`${label} URI must be nonempty text`);
  if (/^(?:data:|[a-z][a-z0-9+.-]*:|[/\\])/i.test(uri)) throw new Error(`${label} URI is embedded, absolute, or remote: ${uri}`);
  const decoded = decodeURIComponent(uri).replaceAll("\\", "/");
  if (decoded.split("/").includes("..")) throw new Error(`${label} URI escapes its asset directory: ${uri}`);
}

function validateUriPolicy(gltf) {
  for (const [kind, values] of [["buffer", gltf.buffers ?? []], ["image", gltf.images ?? []]]) {
    for (const [index, value] of values.entries()) {
      if (value.uri !== undefined) assertSafeUri(value.uri, `${kind} ${index}`);
    }
  }
  if ((gltf.buffers ?? []).some((value) => value.uri !== undefined) ||
      (gltf.images ?? []).some((value) => value.uri !== undefined)) {
    throw new Error("room GLB must be self-contained and contain no URI fields");
  }
}

function accessorValues(parsed, index) {
  const accessor = parsed.gltf.accessors?.[index];
  if (!accessor) throw new Error(`accessor ${index} is missing`);
  if (accessor.sparse !== undefined) throw new Error(`accessor ${index} uses unsupported sparse storage`);
  const view = parsed.gltf.bufferViews?.[accessor.bufferView];
  if (!view) throw new Error(`accessor ${index} has no valid bufferView`);
  const format = FORMATS[accessor.componentType];
  const width = COMPONENTS[accessor.type];
  if (!format || !width || !Number.isSafeInteger(accessor.count) || accessor.count < 0) {
    throw new Error(`accessor ${index} has an unsupported layout`);
  }
  const [componentBytes, getter] = format;
  const packed = componentBytes * width;
  const stride = view.byteStride ?? packed;
  if (!Number.isSafeInteger(stride) || stride < packed) throw new Error(`accessor ${index} stride is invalid`);
  const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const end = accessor.count === 0 ? start : start + (accessor.count - 1) * stride + packed;
  if (start < 0 || end > parsed.bin.length || end > (view.byteOffset ?? 0) + view.byteLength) {
    throw new Error(`accessor ${index} escapes its bufferView`);
  }
  const data = new DataView(parsed.bin.buffer, parsed.bin.byteOffset, parsed.bin.byteLength);
  const values = [];
  for (let row = 0; row < accessor.count; row++) {
    const item = [];
    for (let column = 0; column < width; column++) {
      item.push(data[getter](start + row * stride + column * componentBytes, true));
    }
    values.push(item);
  }
  return values;
}

function assertFiniteDeep(value, label) {
  if (Array.isArray(value)) {
    for (const item of value) assertFiniteDeep(item, label);
  } else if (typeof value === "number" && !Number.isFinite(value)) {
    throw new Error(`${label} contains a non-finite number`);
  }
}

function close(a, b, tolerance) {
  return Math.abs(a - b) <= tolerance;
}

function validateSemanticSets(parsed, sidecar, manifest) {
  if (parsed.textureRoles === undefined) validateEmbeddedTextures(parsed, manifest);
  const expectedNames = [...manifest.pieces.map((piece) => piece.node), "SOCKET_torch_flame"].sort();
  const actualNodes = parsed.gltf.nodes ?? [];
  const actualNames = actualNodes.map((node) => node.name);
  if (actualNames.some((name) => typeof name !== "string")) throw new Error("every exported node needs a semantic name");
  if (new Set(actualNames).size !== actualNames.length) throw new Error("GLB contains duplicate semantic node names");
  if (JSON.stringify([...actualNames].sort()) !== JSON.stringify(expectedNames)) {
    throw new Error("GLB semantic node set differs from the manifest");
  }
  const expectedMaterials = [...new Set(manifest.pieces.map((piece) => piece.materialRole))].sort();
  const materialNames = (parsed.gltf.materials ?? []).map((material) => material.name);
  if (new Set(materialNames).size !== materialNames.length ||
      JSON.stringify([...materialNames].sort()) !== JSON.stringify(expectedMaterials)) {
    throw new Error("GLB material set differs from the manifest");
  }
  for (const material of parsed.gltf.materials ?? []) {
    const spec = manifest.materials[material.name];
    const pbr = material.pbrMetallicRoughness;
    const textured = spec.baseColorTexture !== undefined;
    const expectedColor = textured ? [1, 1, 1, 1] :
      [Number(spec.baseColorR), Number(spec.baseColorG), Number(spec.baseColorB), 1];
    const expectedMetallic = textured ? 1 : Number(spec.metallic);
    const expectedRoughness = textured ? 1 : Number(spec.roughness);
    const actualColor = pbr?.baseColorFactor ?? [1, 1, 1, 1];
    if (!pbr || actualColor.some((value, index) => !close(value, expectedColor[index], TOLERANCE)) ||
        !close(pbr.metallicFactor ?? 1, expectedMetallic, TOLERANCE) ||
        !close(pbr.roughnessFactor ?? 1, expectedRoughness, TOLERANCE)) {
      throw new Error(`GLB material ${material.name} differs from its PBR manifest inputs: ${JSON.stringify(pbr)}`);
    }
    const textureRole = spec.baseColorTexture;
    if (textureRole === undefined ? pbr.baseColorTexture !== undefined :
        parsed.textureRoles?.get(pbr.baseColorTexture?.index) !== `${textureRole}:albedo`) {
      throw new Error(`GLB material ${material.name} texture differs from its manifest input`);
    }
    if (textureRole === undefined) {
      if (material.normalTexture !== undefined || pbr.metallicRoughnessTexture !== undefined) {
        throw new Error(`GLB material ${material.name} has unexpected surface maps`);
      }
    } else if (parsed.textureRoles?.get(material.normalTexture?.index) !== `${textureRole}:normal` ||
        parsed.textureRoles?.get(pbr.metallicRoughnessTexture?.index) !== `${textureRole}:orm`) {
      throw new Error(`GLB material ${material.name} PBR maps differ from its manifest input`);
    }
  }
  const sidecarNames = sidecar.pieces.map((piece) => piece.node).sort();
  const meshNames = manifest.pieces.map((piece) => piece.node).sort();
  if (JSON.stringify(sidecarNames) !== JSON.stringify(meshNames)) throw new Error("sidecar semantic node set differs from the manifest");
  if (sidecar.sockets.length !== 1 || sidecar.sockets[0].name !== "SOCKET_torch_flame") {
    throw new Error("sidecar socket set differs from the manifest");
  }
  const socketIndex = actualNodes.findIndex((node) => node.name === "SOCKET_torch_flame");
  const bracketIndex = actualNodes.findIndex((node) => node.name === "ROOM_torch_bracket");
  const parents = actualNodes.flatMap((node, index) => (node.children ?? []).map((child) => [index, child]));
  const socketParents = parents.filter((entry) => entry[1] === socketIndex);
  if (socketParents.length !== 1 || socketParents[0][0] !== bracketIndex) throw new Error("torch socket does not have exactly its bracket parent");
  const socketSpec = manifest.pieces.find((piece) => piece.name === "torch_bracket").socket;
  const socket = actualNodes[socketIndex];
  const expectedTranslation = socketSpec.translation.map(Number);
  const expectedRotation = socketSpec.rotation.map(Number);
  const actualTranslation = socket.translation ?? [0, 0, 0];
  const actualRotation = socket.rotation ?? [0, 0, 0, 1];
  if (actualTranslation.some((value, index) => !close(value, expectedTranslation[index], TOLERANCE)) ||
      actualRotation.some((value, index) => !close(value, expectedRotation[index], TOLERANCE)) ||
      !close(Math.hypot(...actualRotation), 1, TOLERANCE)) {
    throw new Error("torch socket transform differs from the manifest or is not normalized");
  }
  const visited = new Set();
  const active = new Set();
  const visit = (index) => {
    if (active.has(index)) throw new Error("GLB node graph is cyclic");
    if (visited.has(index)) return;
    if (!actualNodes[index]) throw new Error("GLB node child index is invalid");
    active.add(index);
    for (const child of actualNodes[index].children ?? []) visit(child);
    active.delete(index);
    visited.add(index);
  };
  for (let index = 0; index < actualNodes.length; index++) visit(index);
}

function align4(value) {
  return (value + 3) & ~3;
}

function estimateGpuResidency(gltf, decodedTextureBytes = 0) {
  const views = new Set();
  for (const mesh of gltf.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      for (const accessorIndex of [...Object.values(primitive.attributes ?? {}), primitive.indices].filter((v) => v !== undefined)) {
        const accessor = gltf.accessors?.[accessorIndex];
        if (accessor?.bufferView !== undefined) views.add(accessor.bufferView);
      }
    }
  }
  let bufferBytes = 0;
  for (const index of views) {
    const view = gltf.bufferViews?.[index];
    if (!view || !Number.isSafeInteger(view.byteLength) || view.byteLength < 0) throw new Error("referenced bufferView length is invalid");
    bufferBytes += view.byteLength;
  }
  const instanceBufferBytes = Object.values(INSTANCE_CAPACITIES).reduce((sum, capacity) => sum + capacity * 16 * 4 * 2, 0);
  const shadowMapBytes = 1024 * 1024 * 4;
  return {
    sourceBufferBytes: bufferBytes, decodedTextureBytes, instanceBufferBytes, shadowMapBytes,
    totalBytes: bufferBytes + decodedTextureBytes + instanceBufferBytes + shadowMapBytes,
  };
}

function validateEmbeddedTextures(parsed, manifest, skipExpectedHashes = false) {
  const images = parsed.gltf.images ?? [];
  const textures = parsed.gltf.textures ?? [];
  const samplers = parsed.gltf.samplers ?? [];
  const processing = manifest.textureProcessing;
  if (images.length !== 12 || textures.length !== 12 || samplers.length !== 1 ||
      JSON.stringify(samplers[0]) !== JSON.stringify({ magFilter: processing.magFilter, minFilter: processing.minFilter })) {
    throw new Error("room GLB must contain exactly twelve embedded albedo/normal/ORM textures and its pinned linear mipmapped sampler");
  }
  const imageRoles = new Map();
  for (let index = 0; index < images.length; index++) {
    const image = images[index];
    if (image.uri !== undefined || image.mimeType !== "image/png" || !Number.isSafeInteger(image.bufferView)) {
      throw new Error("room texture image must be an embedded PNG bufferView");
    }
    const view = parsed.gltf.bufferViews?.[image.bufferView];
    if (!view || view.buffer !== 0 || view.byteStride !== undefined) throw new Error("room texture image bufferView is invalid");
    const start = view.byteOffset ?? 0;
    const bytes = parsed.bin.subarray(start, start + view.byteLength);
    if (bytes.length !== view.byteLength || bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" ||
        bytes.subarray(12, 16).toString("ascii") !== "IHDR") throw new Error("room embedded texture is not a complete PNG");
    const match = /^room_(floor|overburden|wall|wood)_(albedo|normal|orm)$/.exec(image.name ?? "");
    const role = match?.[1];
    const kind = match?.[2];
    const expectedHash = role === undefined || kind !== "albedo" ? "" :
      manifest.outputs.embeddedTextures[`${role}Sha256`];
    if (role === undefined || kind === undefined || (!skipExpectedHashes && kind === "albedo" &&
        expectedHash !== "0".repeat(64) && sha256(bytes) !== expectedHash)) {
      throw new Error("room embedded texture bytes differ from the pinned processed output");
    }
    if (bytes.readUInt32BE(16) !== processing.width || bytes.readUInt32BE(20) !== processing.height) {
      throw new Error(`room embedded texture ${role} dimensions differ from the manifest`);
    }
    imageRoles.set(index, `${role}:${kind}`);
  }
  if (new Set(imageRoles.values()).size !== 12) throw new Error("room embedded texture roles are incomplete or duplicated");
  const textureRoles = new Map();
  for (let index = 0; index < textures.length; index++) {
    const source = textures[index].source;
    if (!Number.isSafeInteger(source) || !imageRoles.has(source) || textures[index].sampler !== 0) {
      throw new Error("room texture source or sampler is invalid");
    }
    textureRoles.set(index, imageRoles.get(source));
  }
  parsed.textureRoles = textureRoles;
  return processing.width * processing.height * 4 * Object.keys(manifest.textures).length * 3;
}

function validateGeometry(parsed, sidecar, manifest) {
  const tolerance = TOLERANCE;
  let vertices = 0;
  let triangles = 0;
  const sideByName = new Map(sidecar.pieces.map((piece) => [piece.node, piece]));
  const specs = new Map(manifest.pieces.map((piece) => [piece.node, piece]));
  for (const node of parsed.gltf.nodes) {
    const spec = specs.get(node.name);
    assertFiniteDeep(node, `node ${node.name}`);
    if (node.name === "SOCKET_torch_flame") {
      if (node.mesh !== undefined) throw new Error("flame socket must not own a mesh");
      continue;
    }
    for (const [label, actual, identity] of [["translation", node.translation, [0, 0, 0]],
      ["rotation", node.rotation, [0, 0, 0, 1]], ["scale", node.scale, [1, 1, 1]]]) {
      const value = actual ?? identity;
      if (value.length !== identity.length || value.some((item, index) => !close(item, identity[index], tolerance))) {
        throw new Error(`mesh node ${node.name} has a non-identity ${label}`);
      }
    }
    const mesh = parsed.gltf.meshes?.[node.mesh];
    if (!mesh || mesh.primitives?.length !== 1) throw new Error(`mesh node ${node.name} must have one primitive`);
    const primitive = mesh.primitives[0];
    if ((primitive.targets ?? []).length) throw new Error(`mesh node ${node.name} has morph targets`);
    if ((primitive.mode ?? 4) !== 4 || primitive.indices === undefined) throw new Error(`mesh node ${node.name} is not indexed triangles`);
    for (const semantic of ["POSITION", "NORMAL", "TEXCOORD_0", "COLOR_0"]) {
      if (primitive.attributes?.[semantic] === undefined) throw new Error(`mesh node ${node.name} lacks ${semantic}`);
    }
    const positions = accessorValues(parsed, primitive.attributes.POSITION);
    const normals = accessorValues(parsed, primitive.attributes.NORMAL);
    const uvs = accessorValues(parsed, primitive.attributes.TEXCOORD_0);
    const colours = accessorValues(parsed, primitive.attributes.COLOR_0);
    const indices = accessorValues(parsed, primitive.indices).map((value) => value[0]);
    for (const accessorIndex of [primitive.attributes.POSITION, primitive.attributes.NORMAL, primitive.attributes.TEXCOORD_0]) {
      if (parsed.gltf.accessors[accessorIndex].componentType !== 5126) throw new Error(`${node.name} has a non-float vertex accessor`);
    }
    const colourAccessor = parsed.gltf.accessors[primitive.attributes.COLOR_0];
    if (colourAccessor.componentType !== 5123 || colourAccessor.type !== "VEC4" ||
        colourAccessor.normalized !== true || colourAccessor.count !== positions.length) {
      throw new Error(`${node.name} has an invalid deterministic vertex-colour accessor`);
    }
    if (![5123, 5125].includes(parsed.gltf.accessors[primitive.indices].componentType)) throw new Error(`${node.name} has an unsupported index accessor`);
    for (const [label, values] of [["position", positions], ["normal", normals], ["UV", uvs]]) assertFiniteDeep(values, `${node.name} ${label}`);
    for (const normal of normals) {
      const length = Math.hypot(...normal);
      if (!close(length, 1, tolerance * 10)) throw new Error(`${node.name} has a non-unit normal`);
    }
    const uvRepeat = node.name.startsWith("ROOM_wall_run_") ? Number(node.name.slice("ROOM_wall_run_".length)) : 1;
    for (const uv of uvs) if (uv[0] < -tolerance || uv[0] > uvRepeat + tolerance ||
        uv[1] < -tolerance || uv[1] > 1 + tolerance) {
      throw new Error(`${node.name} has UV outside its tile-frequency envelope`);
    }
    if (colours.some((colour) => colour.length !== 4 || colour.some((value) => value < 0 || value > 65535))) {
      throw new Error(`${node.name} has vertex colour outside normalized unsigned-short range`);
    }
    if (indices.length % 3 !== 0 || indices.some((index) => !Number.isSafeInteger(index) || index < 0 || index >= positions.length)) {
      throw new Error(`${node.name} has invalid triangle indices`);
    }
    for (let index = 0; index < indices.length; index += 3) {
      const a = positions[indices[index]], b = positions[indices[index + 1]], c = positions[indices[index + 2]];
      const ab = b.map((value, axis) => value - a[axis]);
      const ac = c.map((value, axis) => value - a[axis]);
      const area2 = Math.hypot(ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]);
      if (!(area2 > tolerance * tolerance)) throw new Error(`${node.name} has a degenerate triangle`);
    }
    const bounds = [0, 1].map((which) => [0, 1, 2].map((axis) =>
      which === 0 ? Math.min(...positions.map((value) => value[axis])) : Math.max(...positions.map((value) => value[axis]))));
    const side = sideByName.get(node.name);
    if (!side || ["min", "max"].some((bound) =>
      !Array.isArray(side.collisionDebugBounds?.[bound]) ||
      side.collisionDebugBounds[bound].some((value, axis) => !close(value, Number(spec.bounds[bound][axis]), tolerance)))) {
      throw new Error(`${node.name} collision/debug bounds drifted: ${JSON.stringify(side?.collisionDebugBounds)} != ${JSON.stringify(spec.bounds)}`);
    }
    for (let which = 0; which < 2; which++) for (let axis = 0; axis < 3; axis++) {
      const sideBound = which === 0 ? side.bounds.min : side.bounds.max;
      if (!close(bounds[which][axis], sideBound[axis], tolerance)) throw new Error(`${node.name} sidecar bounds drifted`);
      if (bounds[0][axis] < Number(spec.bounds.min[axis]) - tolerance ||
          bounds[1][axis] > Number(spec.bounds.max[axis]) + tolerance) {
        throw new Error(`${node.name} exceeds its manifest bounds`);
      }
    }
    const materialName = parsed.gltf.materials?.[primitive.material]?.name;
    if (materialName !== spec.materialRole || side.materialRole !== spec.materialRole) throw new Error(`${node.name} material drifted`);
    if (side.primitiveCount !== 1 || side.vertexCount !== positions.length || side.triangleCount !== indices.length / 3) {
      throw new Error(`${node.name} sidecar counts drifted`);
    }
    vertices += positions.length;
    triangles += indices.length / 3;
  }
  if (vertices > manifest.budgets.maxVertices || triangles > manifest.budgets.maxTriangles ||
      (parsed.gltf.nodes?.length ?? 0) > manifest.budgets.maxNodes ||
      (parsed.gltf.meshes?.length ?? 0) > manifest.budgets.maxMeshes ||
      (parsed.gltf.materials?.length ?? 0) > manifest.budgets.maxMaterials) {
    throw new Error("room geometry exceeds its manifest budget");
  }
  return { nodes: parsed.gltf.nodes.length, meshes: parsed.gltf.meshes.length, materials: parsed.gltf.materials.length, vertices, triangles };
}

async function validateAsset(options) {
  const manifestBytes = fs.readFileSync(options.manifest);
  const manifest = JSON.parse(manifestBytes);
  validateBuildManifest(manifest);
  for (const vfx of Object.values(manifest.runtimeTextures)) {
    const sourceVfxBytes = fs.readFileSync(path.join(ROOT, vfx.sourcePath));
    const runtimeVfxBytes = fs.readFileSync(path.join(ROOT, vfx.runtimePath));
    if (!sourceVfxBytes.equals(runtimeVfxBytes) || sha256(sourceVfxBytes) !== vfx.sha256) {
      throw new Error("room runtime VFX texture differs from its pinned authored source");
    }
    if (runtimeVfxBytes.length < 33 || runtimeVfxBytes.toString("ascii", 1, 4) !== "PNG" ||
        runtimeVfxBytes.readUInt32BE(16) !== vfx.width || runtimeVfxBytes.readUInt32BE(20) !== vfx.height ||
        runtimeVfxBytes[25] !== 6) throw new Error("room runtime VFX texture dimensions or alpha format drifted");
  }
  const glbSize = fs.statSync(options.glb).size;
  const sidecarSize = fs.statSync(options.sidecar).size;
  if (glbSize + sidecarSize > manifest.budgets.payloadBytes) throw new Error("room GLB and sidecar exceed their payload budget");
  const glbBytes = fs.readFileSync(options.glb);
  const sidecarBytes = fs.readFileSync(options.sidecar);
  const sidecar = parseRoomSidecar(sidecarBytes);
  if (manifest.schemaVersion !== 1 || sidecar.schemaVersion !== 1 || manifest.fixtureId !== "v2-room-slice-1") throw new Error("asset manifest and sidecar must use schema version 1");
  if (glbBytes.length + sidecarBytes.length > manifest.budgets.payloadBytes) throw new Error("room GLB and sidecar exceed their payload budget");
  const parsed = parseGlb(glbBytes);
  validateUriPolicy(parsed.gltf);
  if ((parsed.gltf.extensionsRequired ?? []).length || (parsed.gltf.extensionsUsed ?? []).length) throw new Error("room GLB uses an unsupported extension");
  for (const field of ["animations", "skins", "cameras"]) if ((parsed.gltf[field] ?? []).length) throw new Error(`room GLB contains forbidden ${field}`);
  if (parsed.gltf.extensions?.KHR_lights_punctual) throw new Error("room GLB contains exported lights");
  const decodedTextureBytes = validateEmbeddedTextures(parsed, manifest, options.skipExpectedHashes);
  validateSemanticSets(parsed, sidecar, manifest);
  const referencedAccessors = new Set();
  for (const mesh of parsed.gltf.meshes ?? []) for (const primitive of mesh.primitives ?? []) {
    for (const index of Object.values(primitive.attributes ?? {})) referencedAccessors.add(index);
    if (primitive.indices !== undefined) referencedAccessors.add(primitive.indices);
  }
  if (referencedAccessors.size !== (parsed.gltf.accessors ?? []).length) throw new Error("GLB contains an unreferenced accessor");
  for (const index of referencedAccessors) assertFiniteDeep(accessorValues(parsed, index), `accessor ${index}`);
  const counts = validateGeometry(parsed, sidecar, manifest);
  const residency = estimateGpuResidency(parsed.gltf, decodedTextureBytes);
  if (residency.totalBytes > manifest.budgets.estimatedGpuBytes) throw new Error("room GLB exceeds its residency budget");
  const raw = await (options.validator ?? validator).validateBytes(new Uint8Array(glbBytes), { uri: "room_slice.glb", maxIssues: 10000 });
  const messages = [...(raw.issues?.messages ?? [])].map((issue) => ({
    code: issue.code, message: issue.message, pointer: issue.pointer ?? "", severity: issue.severity,
  })).sort((a, b) => a.severity - b.severity || a.code.localeCompare(b.code) || a.pointer.localeCompare(b.pointer));
  const errors = messages.filter((issue) => issue.severity === 0);
  const warnings = messages.filter((issue) => issue.severity === 1);
  if (errors.length) throw new Error(`gltf-validator reported ${errors.length} error(s): ${errors.map((issue) => issue.code).join(", ")}`);
  if (warnings.length) throw new Error(`gltf-validator reported warning(s): ${warnings.map((issue) => issue.code).join(", ")}`);
  const buildManifest = { ...manifest };
  delete buildManifest.outputs;
  const generatorSources = {};
  for (const name of ["build_slice.py", "export.py", "materials.py", "room.py"]) {
    generatorSources[name] = sha256(fs.readFileSync(path.join(ROOT, "tools", "art", name)));
  }
  const buildInputsSha256 = sha256(canonicalBytes({
    manifest: buildManifest, generatorSources,
  }));
  const report = stable({
    schemaVersion: 1,
    fixtureId: manifest.fixtureId,
    validatorVersion: raw.validatorVersion,
    artifactSha256: sha256(glbBytes),
    sidecarSha256: sha256(sidecarBytes),
    buildInputsSha256,
    payloadBytes: glbBytes.length + sidecarBytes.length,
    residency: { ...residency, method: "unique-accessor-bufferViews-plus-fixed-double-buffered-instance-capacities-plus-1024-rgba8-shadow-map" },
    counts,
    issues: {
      numErrors: errors.length, numWarnings: warnings.length,
      numInfos: messages.filter((issue) => issue.severity === 2).length,
      numHints: messages.filter((issue) => issue.severity === 3).length,
      messages,
    },
  });
  const reportBytes = canonicalBytes(report);
  if (sidecar.buildInputsSha256 !== buildInputsSha256) throw new Error("sidecar build-input hash drifted");
  for (const key of ["mapSha256", "mapBytes", "solidTiles"]) {
    if (sidecar.runtimeFixture?.[key] !== manifest.runtimeFixture[key]) throw new Error(`sidecar runtime fixture ${key} drifted`);
  }
  const expectedStyle = { id: manifest.styling.id, mode: manifest.styling.mode,
    attribute: manifest.styling.attribute, textures: manifest.styling.textures };
  if (Object.keys(expectedStyle).some((key) => sidecar.styling?.[key] !== expectedStyle[key])) {
    throw new Error("sidecar styling contract drifted");
  }
  if (sidecar.glbSha256 !== sha256(glbBytes)) throw new Error("sidecar GLB hash drifted");
  if (sidecar.payloadBytes !== glbBytes.length + sidecarBytes.length) throw new Error(`sidecar payload drifted: ${sidecar.payloadBytes} != ${glbBytes.length + sidecarBytes.length}`);
  for (const [label, actual, expected] of [["counts", sidecar.counts, counts],
    ["residency", sidecar.estimatedGpuResidency, residency]]) {
    for (const [key, value] of Object.entries(expected)) {
      if (actual?.[key] !== value) throw new Error(`sidecar ${label}.${key} drifted: ${actual?.[key]} != ${value}`);
    }
  }
  if (!options.skipExpectedHashes) {
    if (manifest.outputs.glb.sha256 !== sha256(glbBytes)) throw new Error("GLB hash differs from the manifest");
    if (manifest.outputs.sidecar.sha256 !== sha256(sidecarBytes)) throw new Error("sidecar hash differs from the manifest");
    if (manifest.outputs.validator.sha256 !== sha256(reportBytes)) throw new Error("validator report hash differs from the manifest");
  }
  if (options.report) fs.writeFileSync(options.report, reportBytes);
  return report;
}

function parseArguments(argv) {
  if (!argv.length || argv[0].startsWith("--")) throw new Error("usage: node tools/validate_assets.js path/to/room_slice.glb [--sidecar file] [--manifest file] [--report file] [--skip-expected-hashes]");
  const result = { glb: path.resolve(argv[0]), skipExpectedHashes: false };
  for (let index = 1; index < argv.length; index++) {
    const argument = argv[index];
    if (argument === "--skip-expected-hashes") result.skipExpectedHashes = true;
    else if (["--sidecar", "--manifest", "--report"].includes(argument)) {
      const value = argv[++index];
      if (!value || value.startsWith("--")) throw new Error(`${argument} needs a path`);
      result[argument.slice(2)] = path.resolve(value);
    } else throw new Error(`unknown argument: ${argument}`);
  }
  result.sidecar ??= result.glb.replace(/\.glb$/i, ".json");
  result.manifest ??= path.join(ROOT, "tools", "art", "manifest.json");
  return result;
}

async function main() {
  try {
    const report = await validateAsset(parseArguments(process.argv.slice(2)));
    console.log(`room asset valid: ${report.artifactSha256}; ${report.payloadBytes} bytes; estimated residency ${report.residency.totalBytes} bytes`);
  } catch (error) {
    console.error(`room asset validation failed:\n- ${error.message}`);
    process.exitCode = 1;
  }
}

if (require.main === module) void main();

module.exports = {
  accessorValues, assertFiniteDeep, canonicalBytes, estimateGpuResidency, parseArguments,
  parseGlb, parseRoomSidecar, sha256, validateAsset, validateRoomAsset: validateAsset,
  validateBuildManifest, validateSemanticSets, validateUriPolicy,
};
