"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const {
  accessorValues, canonicalBytes, estimateGpuResidency, parseGlb, parseRoomSidecar, validateAsset,
  validateSemanticSets, validateUriPolicy,
} = require("./validate_assets.js");

const ROOT = path.resolve(__dirname, "..");
const GLB = path.join(ROOT, "web", "assets3d", "room_slice.glb");
const SIDECAR = path.join(ROOT, "web", "assets3d", "room_slice.json");
const MANIFEST = path.join(ROOT, "tools", "art", "manifest.json");
const REPORT = path.join(ROOT, "web", "assets3d", "room_slice.validator.json");
const VFX = path.join(ROOT, "web", "assets3d", "room_vfx_decal_atlas.png");
const VFX_FLAME = path.join(ROOT, "web", "assets3d", "room_vfx_flame.png");
const options = () => ({ glb: GLB, sidecar: SIDECAR, manifest: MANIFEST });

test("the_room_glb_and_sidecar_match_the_pinned_manifest", async () => {
  const result = await validateAsset(options());
  assert.equal(result.issues.numErrors, 0);
  assert.equal(result.issues.numWarnings, 0);
  assert.equal(result.payloadBytes, fs.statSync(GLB).size + fs.statSync(SIDECAR).size);
  assert.equal(result.residency.decodedTextureBytes, 38_535_168);
  assert.deepEqual(fs.readFileSync(REPORT), canonicalBytes(result));
});

test("the_runtime_vfx_atlas_is_pinned_rgba_and_the_shipped_asset_set_stays_under_sixty_four_mib", () => {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
  const vfx = manifest.runtimeTextures.vfxDecals;
  const source = fs.readFileSync(path.join(ROOT, vfx.sourcePath));
  const runtime = fs.readFileSync(VFX);
  assert.deepEqual(runtime, source);
  assert.equal(require("node:crypto").createHash("sha256").update(runtime).digest("hex"), vfx.sha256);
  assert.deepEqual([runtime.readUInt32BE(16), runtime.readUInt32BE(20), runtime[25]], [1254, 1254, 6]);
  const flame = fs.readFileSync(VFX_FLAME);
  assert.equal(require("node:crypto").createHash("sha256").update(flame).digest("hex"),
    manifest.runtimeTextures.vfxFlame.sha256);
  assert.deepEqual([flame.readUInt32BE(16), flame.readUInt32BE(20), flame[25]], [314, 314, 6]);
  const shipped = ["combatants.glb", "combatants.json", "room_slice.glb", "room_slice.json",
    "room_vfx_decal_atlas.png", "room_vfx_flame.png"]
    .map((name) => fs.statSync(path.join(ROOT, "web", "assets3d", name)).size);
  assert.ok(shipped.reduce((sum, bytes) => sum + bytes, 0) <= 67_108_864,
    `shipped authored assets exceed 64 MiB: ${shipped.join("+")}`);
});

test("two_clean_pinned_blender_exports_are_byte_identical", () => {
  const toolchain = JSON.parse(fs.readFileSync(path.join(ROOT, "tools", "toolchain.json"), "utf8"));
  const blender = path.join(ROOT, toolchain.downloads.blenderWindowsX64Zip.localExecutablePath);
  const run = spawnSync(blender, ["--background", "--factory-startup", "--python",
    "tools/art/build_slice.py", "--", "--verify"], {
    cwd: ROOT, encoding: "utf8", windowsHide: true, timeout: 120000,
  });
  assert.ifError(run.error);
  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
  assert.match(run.stdout, /room slice verified: [0-9a-f]{64}/);
});

test("the_room_asset_rejects_external_payloads_extensions_and_unbounded_counts", async () => {
  assert.throws(() => validateUriPolicy({ buffers: [{ uri: "../outside.bin" }] }), /escapes/);
  assert.throws(() => validateUriPolicy({ images: [{ uri: "data:image\/png;base64,AA==" }] }), /embedded/);
  const sidecar = JSON.parse(fs.readFileSync(SIDECAR, "utf8"));
  sidecar.pieces.push({ ...sidecar.pieces[0], node: "ROOM_extra" });
  assert.throws(() => parseRoomSidecar(JSON.stringify(sidecar)), /unbounded or incomplete/);
  const parsed = parseGlb(fs.readFileSync(GLB));
  const extended = structuredClone(parsed.gltf);
  extended.extensionsRequired = ["KHR_draco_mesh_compression"];
  const json = Buffer.from(JSON.stringify(extended), "utf8");
  const jsonPadding = Buffer.alloc((4 - json.length % 4) % 4, 0x20);
  const binPadding = Buffer.alloc((4 - parsed.bin.length % 4) % 4);
  const rebuiltLength = 12 + 8 + json.length + jsonPadding.length + 8 + parsed.bin.length + binPadding.length;
  const rebuilt = Buffer.alloc(rebuiltLength);
  rebuilt.writeUInt32LE(0x46546c67, 0); rebuilt.writeUInt32LE(2, 4); rebuilt.writeUInt32LE(rebuiltLength, 8);
  rebuilt.writeUInt32LE(json.length + jsonPadding.length, 12); rebuilt.writeUInt32LE(0x4e4f534a, 16);
  json.copy(rebuilt, 20); jsonPadding.copy(rebuilt, 20 + json.length);
  const binHeader = 20 + json.length + jsonPadding.length;
  rebuilt.writeUInt32LE(parsed.bin.length + binPadding.length, binHeader); rebuilt.writeUInt32LE(0x004e4942, binHeader + 4);
  parsed.bin.copy(rebuilt, binHeader + 8); binPadding.copy(rebuilt, binHeader + 8 + parsed.bin.length);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "room-extension-"));
  try {
    const glb = path.join(directory, "room_slice.glb");
    fs.writeFileSync(glb, rebuilt);
    await assert.rejects(validateAsset({ ...options(), glb, skipExpectedHashes: true }), /unsupported extension/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
  const warningValidator = { validateBytes: async () => ({ validatorVersion: "test", issues: {
    messages: [{ code: "TEST_WARNING", message: "warning", severity: 1 }],
  } }) };
  await assert.rejects(validateAsset({ ...options(), skipExpectedHashes: true, validator: warningValidator }), /warning/);
  const errorValidator = { validateBytes: async () => ({ validatorVersion: "test", issues: {
    messages: [{ code: "TEST_ERROR", message: "error", severity: 0 }],
  } }) };
  await assert.rejects(validateAsset({ ...options(), skipExpectedHashes: true, validator: errorValidator }), /error/);
});

test("every_room_piece_has_identity_source_transform_finite_bounds_and_allowed_material", () => {
  const parsed = parseGlb(fs.readFileSync(GLB));
  const sidecar = parseRoomSidecar(fs.readFileSync(SIDECAR));
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
  validateSemanticSets(parsed, sidecar, manifest);
  const pieces = new Map(manifest.pieces.map((piece) => [piece.node, piece]));
  for (const node of parsed.gltf.nodes.filter((value) => value.name.startsWith("ROOM_"))) {
    assert.deepEqual(node.translation ?? [0, 0, 0], [0, 0, 0]);
    assert.deepEqual(node.rotation ?? [0, 0, 0, 1], [0, 0, 0, 1]);
    assert.deepEqual(node.scale ?? [1, 1, 1], [1, 1, 1]);
    assert.ok(pieces.has(node.name));
  }
  for (const piece of sidecar.pieces) {
    assert.ok(piece.bounds.min.every(Number.isFinite));
    assert.ok(piece.bounds.max.every(Number.isFinite));
    assert.ok(["floor_current", "stone_current", "wood_current", "metal_current", "overburden_current"].includes(piece.materialRole));
  }
});

test("the_torch_socket_has_one_parent_and_a_finite_normalized_transform", () => {
  const parsed = parseGlb(fs.readFileSync(GLB));
  const nodes = parsed.gltf.nodes;
  const socket = nodes.findIndex((node) => node.name === "SOCKET_torch_flame");
  const parents = nodes.filter((node) => (node.children ?? []).includes(socket));
  assert.equal(parents.length, 1);
  assert.equal(parents[0].name, "ROOM_torch_bracket");
  const transform = nodes[socket].rotation ?? [0, 0, 0, 1];
  assert.ok((nodes[socket].translation ?? []).every(Number.isFinite));
  assert.ok(Math.abs(Math.hypot(...transform) - 1) <= 0.00001);
});

test("the_authored_torch_has_wall_mount_arm_bowl_and_flame_socket_closure", () => {
  const parsed = parseGlb(fs.readFileSync(GLB));
  const nodes = new Map(parsed.gltf.nodes.map((node) => [node.name, node]));
  const bracket = nodes.get("ROOM_torch_bracket");
  const primitive = parsed.gltf.meshes[bracket.mesh].primitives[0];
  const positions = accessorValues(parsed, primitive.attributes.POSITION);
  const distinctX = new Set(positions.map(([x]) => x.toFixed(4)));
  const distinctY = new Set(positions.map(([, y]) => y.toFixed(4)));
  const distinctZ = new Set(positions.map(([, , z]) => z.toFixed(4)));
  assert.ok(positions.length >= 32, "the sconce needs four readable joined masses, not one box");
  assert.ok(distinctX.size >= 4 && distinctY.size >= 6 && distinctZ.size >= 6,
    "backplate, projecting arm, bowl and wrapped haft need separate silhouettes");
  assert.ok(nodes.has("SOCKET_torch_flame"));
});

test("payload_and_conservative_gpu_estimates_use_the_documented_formula", () => {
  const gltf = {
    bufferViews: [{ byteLength: 5 }, { byteLength: 7 }],
    accessors: [{ bufferView: 0 }, { bufferView: 1 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
  };
  const estimate = estimateGpuResidency(gltf);
  assert.deepEqual(estimate, {
    sourceBufferBytes: 12,
    decodedTextureBytes: 0,
    instanceBufferBytes: 246912,
    shadowMapBytes: 4194304,
    totalBytes: 4441228,
  });
});

test("four_painterly_surfaces_ship_pinned_albedo_normal_and_orm_maps", () => {
  const parsed = parseGlb(fs.readFileSync(GLB));
  const nodes = new Map(parsed.gltf.nodes.map((node) => [node.name, node]));
  const colours = (name) => {
    const primitive = parsed.gltf.meshes[nodes.get(name).mesh].primitives[0];
    const accessor = parsed.gltf.accessors[primitive.attributes.COLOR_0];
    assert.deepEqual([accessor.componentType, accessor.type, accessor.normalized], [5123, "VEC4", true]);
    return accessorValues(parsed, primitive.attributes.COLOR_0);
  };
  const luminance = (values) => values.reduce((sum, value) => sum + value[0] + value[1] + value[2], 0) /
    (values.length * 3 * 65535);
  const floorA = colours("ROOM_floor_a");
  const floorB = colours("ROOM_floor_b");
  const wall = colours("ROOM_wall_straight");
  assert.notEqual(luminance(floorA), luminance(wall));
  assert.notEqual(luminance(floorB), luminance(wall));
  assert.notDeepEqual(floorA, floorB, "the two deterministic floor sources need distinct variation");
  assert.equal((parsed.gltf.images ?? []).length, 12);
  assert.equal((parsed.gltf.textures ?? []).length, 12);
  assert.ok(parsed.gltf.images.every((image) => image.uri === undefined && image.mimeType === "image/png"));
  assert.ok(parsed.gltf.images.every((image) => {
    const view = parsed.gltf.bufferViews[image.bufferView];
    const bytes = parsed.bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
    return bytes.readUInt32BE(16) === 896 && bytes.readUInt32BE(20) === 896;
  }));
  const materialByName = new Map(parsed.gltf.materials.map((material) => [material.name, material]));
  for (const name of ["floor_current", "stone_current", "wood_current", "overburden_current"]) {
    const material = materialByName.get(name);
    assert.ok(material.normalTexture, `${name} must carry authored normal relief`);
    assert.ok(material.pbrMetallicRoughness.metallicRoughnessTexture,
      `${name} must carry packed occlusion/roughness/metal response`);
  }
  assert.equal(estimateGpuResidency(parsed.gltf, 38_535_168).decodedTextureBytes, 38_535_168);
});

test("all_eight_floor_treatments_are_edge_seamless_under_declared_rotations", () => {
  const parsed = parseGlb(fs.readFileSync(GLB));
  const sidecar = parseRoomSidecar(fs.readFileSync(SIDECAR));
  for (const name of ["floor_a", "floor_b", "floor_c", "floor_d"]) {
    const piece = sidecar.pieces.find((candidate) => candidate.name === name);
    assert.deepEqual(piece.bounds.min, [-0.5, 0, -0.5]);
    assert.deepEqual(piece.bounds.max.slice(0, 3).filter((_, axis) => axis !== 1), [0.5, 0.5]);
    const node = parsed.gltf.nodes.find((candidate) => candidate.name === `ROOM_${name}`);
    const positions = accessorValues(parsed, parsed.gltf.meshes[node.mesh].primitives[0].attributes.POSITION);
    const xs = positions.map(([x]) => x); const zs = positions.map(([, , z]) => z);
    assert.deepEqual([Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)],
      [-0.5, 0.5, -0.5, 0.5], `${name} must close the full tile under every quarter turn`);
  }
});

test("authored_wall_modules_cover_1_2_3_5_8_cells_with_tile_scale_masonry", () => {
  const sidecar = parseRoomSidecar(fs.readFileSync(SIDECAR));
  const byName = new Map(sidecar.pieces.map((piece) => [piece.name, piece]));
  for (const length of [1, 2, 3, 5, 8]) {
    const piece = byName.get(length === 1 ? "wall_straight" : `wall_run_${length}`);
    assert.ok(piece, `missing ${length}-cell wall module`);
    assert.equal(piece.bounds.max[0] - piece.bounds.min[0], length);
    assert.ok(Math.abs(piece.bounds.max[1] - 0.9) <= 0.00001);
    assert.ok(Math.abs((piece.bounds.max[2] - piece.bounds.min[2]) - 0.18) <= 0.00001,
      "module relief must close the exact semantic depth within exported-float tolerance");
    assert.equal(piece.triangleCount, 144 * length + 36,
      "one solid core plus three chunky relief courses must close every module");
    const parsed = parseGlb(fs.readFileSync(GLB));
    const node = parsed.gltf.nodes.find((candidate) => candidate.name === piece.node);
    const primitive = parsed.gltf.meshes[node.mesh].primitives[0];
    const uvs = accessorValues(parsed, primitive.attributes.TEXCOORD_0);
    assert.ok(Math.abs(Math.max(...uvs.map(([u]) => u)) - length) <= 0.00001,
      "long modules repeat masonry at tile frequency rather than stretching one sample");
  }
});

test("authored_wall_sources_are_coursed_masonry_with_bounded_detail", () => {
  const sidecar = parseRoomSidecar(fs.readFileSync(SIDECAR));
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
  const wall = new Map(sidecar.pieces.filter((piece) =>
    ["wall_straight", "wall_inside", "wall_outside", "wall_end", "door_frame"].includes(piece.name))
    .map((piece) => [piece.name, piece]));
  assert.deepEqual([...wall.keys()].sort(),
    ["door_frame", "wall_end", "wall_inside", "wall_outside", "wall_straight"]);
  for (const [name, minimum] of Object.entries({
    wall_straight: 144, wall_inside: 240, wall_outside: 240, wall_end: 96, door_frame: 144,
  })) {
    assert.ok(wall.get(name).triangleCount >= minimum,
      name + " must expose coursing and individual stone silhouettes");
  }
  assert.equal(wall.get("wall_straight").triangleCount, 180,
    "the repeatable facade is a solid core with three bounded relief courses");
  assert.ok(sidecar.counts.triangles >= 1_200, "the kit needs enough geometry to read as masonry");
  assert.ok(sidecar.counts.triangles <= manifest.budgets.maxTriangles);
  assert.ok(sidecar.counts.vertices <= manifest.budgets.maxVertices);
});

test("wall_piece_bounds_encode_centreline_arms_for_ends_corners_and_tees", () => {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
  const walls = new Map(manifest.pieces.filter(({ name }) => name.startsWith("wall_"))
    .map(({ name, bounds }) => [name, bounds]));
  assert.deepEqual(walls.get("wall_straight"),
    { min: ["-0.5", "0.0", "-0.09"], max: ["0.5", "0.9", "0.09"] });
  assert.deepEqual(walls.get("wall_inside"),
    { min: ["-0.09", "0.0", "-0.09"], max: ["0.5", "0.9", "0.5"] });
  assert.deepEqual(walls.get("wall_outside"),
    { min: ["-0.5", "0.0", "-0.09"], max: ["0.5", "0.9", "0.5"] });
  assert.deepEqual(walls.get("wall_end"),
    { min: ["-0.09", "0.0", "-0.09"], max: ["0.5", "0.9", "0.09"] });
  const source = fs.readFileSync(path.join(ROOT, "tools", "art", "room.py"), "utf8");
  assert.match(source, /_junction_wall/);
  assert.match(source, /_seamless_straight_wall/);
  assert.doesNotMatch(source, /\[-0\.5, 0, 0\.32\]|\[0\.32, 0, -0\.5\]/,
    "corner arms may not hug tile edges away from neighbouring centreline runs");
});

test("the_concept_palette_keeps_wood_aged_and_masonry_blocks_value_separated", () => {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
  const variation = Number(manifest.styling.variation);
  assert.ok(variation >= 0.16 && variation <= 0.20);
  assert.deepEqual(["woodEnd", "woodSide", "woodTop"].every((name) => name in manifest.styling.palette), true);
  const wood = manifest.materials.wood_current;
  const [red, green, blue, roughness] =
    ["baseColorR", "baseColorG", "baseColorB", "roughness"].map((name) => Number(wood[name]));
  assert.ok(red <= 0.18 && red - green <= 0.08 && green - blue <= 0.05,
    "door and props must remain aged brown rather than saturated orange");
  assert.ok(roughness >= 0.86);
  const end = manifest.styling.palette.woodEnd.slice(0, 3).map(Number);
  const warmKey = [1, 0.68, 0.42];
  const endResponse = [red * end[0] * warmKey[0],
    green * end[1] * warmKey[1], blue * end[2] * warmKey[2]];
  assert.ok(endResponse[0] >= endResponse[1] && endResponse[1] >= endResponse[2] &&
    Math.max(...endResponse) <= 0.06,
  "the barrel end grain must remain dark aged umber under the runtime warm key");

});

test("malformed_glb_chunks_sidecars_hashes_and_duplicate_names_fail_closed", async () => {
  const bytes = fs.readFileSync(GLB);
  const badMagic = Buffer.from(bytes);
  badMagic.write("BAD!", 0, "ascii");
  assert.throws(() => parseGlb(badMagic), /magic/);
  const badLength = Buffer.from(bytes);
  badLength.writeUInt32LE(bytes.length + 4, 8);
  assert.throws(() => parseGlb(badLength), /declared length/);
  const parsed = parseGlb(bytes);
  const duplicate = { ...parsed, gltf: structuredClone(parsed.gltf) };
  duplicate.gltf.nodes[1].name = duplicate.gltf.nodes[0].name;
  assert.throws(() => validateSemanticSets(duplicate, parseRoomSidecar(fs.readFileSync(SIDECAR)),
    JSON.parse(fs.readFileSync(MANIFEST, "utf8"))), /duplicate/);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "room-sidecar-drift-"));
  try {
    const changed = path.join(directory, "room_slice.json");
    fs.writeFileSync(changed, `${fs.readFileSync(SIDECAR, "utf8").trim()} \n`);
    await assert.rejects(validateAsset({ ...options(), sidecar: changed }), /payload|sidecar hash/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("room_generation_never_leaves_python_cache_in_the_repository", () => {
  assert.equal(fs.existsSync(path.join(ROOT, "tools", "art", "__pycache__")), false);
  for (const name of fs.readdirSync(path.join(ROOT, "tools", "art"))) {
    assert.doesNotMatch(name, /\.py[cod]$/);
  }
});
