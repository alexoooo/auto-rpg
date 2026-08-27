import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import { Texture } from "@babylonjs/core/Materials/Textures/texture.js";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer.js";
import { Scene } from "@babylonjs/core/scene.js";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader.js";
import HavokPhysics from "@babylonjs/havok";

import { buildTexturedSurfaces, OBJECT_SURFACE_VARIANTS, TEXTURED_SURFACES } from "../src/materials.ts";
import { boneFrames, costumePieces, Figure, normalizeImportedTangents } from "../src/figure.ts";
import { configureTexture, sharedSurface, surface, surfaceVariant } from "../src/surface.ts";
import {
  OBJECT_PART_SURFACES,
  applyObjectSurface,
  validateObjectSurfaceTable,
} from "../src/object-surfaces.ts";
import { validateRegistry, verifyTextures } from "../scripts/fetch-textures.mjs";
import { attachPhysics, COLLIDES, LAYER } from "../src/physics.ts";
import { WEAPON_KINDS, Weapon } from "../src/weapon.ts";
import { Arrow } from "../src/arrow.ts";
import { CONFIG } from "../src/config.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const registry = JSON.parse(await readFile(resolve(ROOT, "asset-src/textures.json"), "utf8"));
const havokWasm = new URL("../node_modules/@babylonjs/havok/lib/esm/HavokPhysics.wasm", import.meta.url);

test("every_texture_has_a_digest_license_colour_space_and_consumer", async () => {
  assert.deepEqual(validateRegistry(registry), []);
  assert.deepEqual(await verifyTextures(registry), []);

  const poisoned = structuredClone(registry);
  poisoned.textures[0].sha256 = "0".repeat(64);
  const failures = await verifyTextures(poisoned);
  assert.ok(failures.some((failure) => failure.includes(poisoned.textures[0].name)), failures.join("\n"));

  const unlicensed = structuredClone(registry);
  unlicensed.sources[0].licenseUrl = "https://example.invalid/not-cc0";
  assert.ok(validateRegistry(unlicensed).some((failure) => failure.includes(unlicensed.sources[0].sourceUrl)));
});

test("a_missing_texture_falls_back_to_a_drawable_colour_material", async () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const failures = [];
  const failedFactory = (inScene, map, _ready, failed) => {
    failures.push(map.url);
    const texture = new Texture(null, inScene);
    failed();
    texture.dispose();
    return texture;
  };
  const fallback = surface(scene, TEXTURED_SURFACES.ground, failedFactory);
  const camera = new FreeCamera("fallback-camera", new Vector3(0, 1, -2), scene);
  camera.setTarget(Vector3.Zero());
  scene.activeCamera = camera;
  const mesh = MeshBuilder.CreateGround("fallback-proof", { width: 1, height: 1 }, scene);
  mesh.material = fallback;
  scene.render();
  assert.equal(failures.length, 3, "every injected load error ran");
  assert.strictEqual(mesh.material, fallback, "the fallback stays attached");
  assert.equal(fallback.albedoTexture, null);
  assert.equal(fallback.bumpTexture, null);
  assert.equal(fallback.metallicTexture, null);
  assert.deepEqual(fallback.albedoColor.asArray(), [0.15, 0.14, 0.12], "the drawable old colour survives");
  assert.strictEqual(fallback.getScene(), scene, "the texture error does not dispose the material");
  scene.dispose();
  engine.dispose();
});

test("normal_and_orm_maps_are_not_sampled_as_srgb", () => {
  for (const descriptor of Object.values(TEXTURED_SURFACES)) {
    for (const channel of ["normal", "orm"]) {
      const map = descriptor.textures?.[channel];
      if (map) assert.equal(map.colourSpace, "linear", `${descriptor.name}.${channel}`);
    }
  }
  assert.equal(TEXTURED_SURFACES.ground.textures.albedo.colourSpace, "srgb");
});

test("actual_textures_carry_every_declared_sampling_setting", () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  for (const descriptor of Object.values(TEXTURED_SURFACES)) {
    for (const [channel, map] of Object.entries(descriptor.textures)) {
      const texture = RawTexture.CreateRGBATexture(
        new Uint8Array([255, 255, 255, 255]), 1, 1, scene, false, false, Texture.NEAREST_SAMPLINGMODE,
      );
      // Mutate every configured field first: this proves configureTexture, not
      // Babylon's constructor defaults, supplies the passing values.
      texture.gammaSpace = map.colourSpace !== "srgb";
      texture.wrapU = Texture.CLAMP_ADDRESSMODE;
      texture.wrapV = Texture.MIRROR_ADDRESSMODE;
      texture.uScale = -1;
      texture.vScale = -1;
      configureTexture(texture, map);
      assert.equal(texture.gammaSpace, map.colourSpace === "srgb", `${descriptor.name}.${channel}.gamma`);
      assert.equal(texture.samplingMode, Texture.TRILINEAR_SAMPLINGMODE, `${descriptor.name}.${channel}.sampling`);
      assert.equal(texture.wrapU, Texture.WRAP_ADDRESSMODE, `${descriptor.name}.${channel}.wrapU`);
      assert.equal(texture.wrapV, Texture.WRAP_ADDRESSMODE, `${descriptor.name}.${channel}.wrapV`);
      assert.equal(texture.uScale, map.scale, `${descriptor.name}.${channel}.uScale`);
      assert.equal(texture.vScale, map.scale, `${descriptor.name}.${channel}.vScale`);
      assert.equal(texture.invertY, map.invertY, `${descriptor.name}.${channel}.invertY`);
    }
  }
  scene.dispose();
  engine.dispose();
});

test("successful_textures_bind_to_their_channels_and_extract_all_orm_components", () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const made = new Map();
  const immediate = (inScene, map, ready) => {
    const texture = configureTexture(
      RawTexture.CreateRGBATexture(
        new Uint8Array([255, 255, 255, 255]), 1, 1, inScene, false, false, Texture.NEAREST_SAMPLINGMODE,
      ),
      map,
    );
    made.set(map.channel, texture);
    ready(texture);
    return texture;
  };
  const material = surface(scene, TEXTURED_SURFACES.ground, immediate);
  assert.strictEqual(material.albedoTexture, made.get("albedo"));
  assert.strictEqual(material.bumpTexture, made.get("normal"));
  assert.strictEqual(material.metallicTexture, made.get("orm"));
  assert.equal(material.useMetallnessFromMetallicTextureBlue, true);
  assert.equal(material.useRoughnessFromMetallicTextureAlpha, false);
  assert.equal(material.useRoughnessFromMetallicTextureGreen, true);
  assert.equal(material.useAmbientOcclusionFromMetallicTextureRed, true);
  assert.deepEqual(material.albedoColor.asArray(), [1, 1, 1], "decoded albedo is not multiplied dark");
  scene.dispose();
  engine.dispose();
});

test("the_registry_and_runtime_descriptors_are_bidirectional", () => {
  const runtime = buildTexturedSurfaces(registry);
  let references = 0;
  for (const row of registry.textures) {
    const candidates = Object.values(runtime).filter((descriptor) =>
      descriptor.textures[row.channel]?.url === row.localUrl);
    assert.equal(candidates.length, row.consumers.length, `${row.name} resolves once per consumer`);
    for (const descriptor of candidates) {
      const map = descriptor.textures[row.channel];
      assert.equal(map.url, row.localUrl, row.name);
      assert.equal(map.channel, row.channel, row.name);
      assert.equal(map.colourSpace, row.colourSpace, row.name);
      references += 1;
    }
  }
  assert.equal(Object.values(runtime).flatMap((entry) => Object.values(entry.textures)).length, references);

  for (const [field, value] of [
    ["localUrl", "/assets/textures/not-the-file.jpg"],
    ["channel", "height"],
    ["colourSpace", "display-p3"],
    ["consumers", ["palette.unknown"]],
  ]) {
    const broken = structuredClone(registry);
    broken.textures[0][field] = value;
    assert.throws(() => buildTexturedSurfaces(broken), new RegExp(broken.textures[0].name));
  }

  const inconsistentSpan = structuredClone(registry);
  const wallNormal = inconsistentSpan.textures.find((row) =>
    row.channel === "normal" && row.consumers.includes("room.wall"));
  wallNormal.metresPerRepeat = 2.0;
  assert.throws(
    () => buildTexturedSurfaces(inconsistentSpan),
    /room\.wall disagrees about its physical metre-repeat contract/,
  );
});

test("normal_convention_follows_the_geometry_tangent_basis", () => {
  const engine = new NullEngine();
  for (const [descriptor, expected] of [
    [TEXTURED_SURFACES.ground, [false, true]],
    [TEXTURED_SURFACES.figureSteel, [false, true]],
  ]) {
    const scene = new Scene(engine);
    const immediate = (inScene, _map, ready) => {
      const texture = new Texture(null, inScene);
      ready(texture);
      return texture;
    };
    const material = surface(scene, descriptor, immediate);
    assert.deepEqual([material.invertNormalMapX, material.invertNormalMapY], expected, descriptor.name);
    assert.equal(descriptor.textures.normal.normalConvention, "opengl");
    assert.equal(descriptor.textures.normal.invertY, false, "image orientation is separate from normal convention");
    scene.dispose();
  }
  engine.dispose();
});

test("a_textured_palette_is_shared_instead_of_minted_per_mesh", () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const descriptor = { ...TEXTURED_SURFACES.figureSteel, textures: {} };
  assert.strictEqual(sharedSurface(scene, descriptor), sharedSurface(scene, descriptor));
  assert.notStrictEqual(sharedSurface(new Scene(engine), descriptor), sharedSurface(scene, descriptor));
  scene.dispose();
  engine.dispose();
});

const material = (scene, name) => new StandardMaterial(name, scene);

function figureFixture(scene, prefix, sharedMaterials = null) {
  const bones = {};
  for (const name of Object.keys(boneFrames())) {
    bones[name] = { mesh: MeshBuilder.CreateBox(`${prefix}.bone.${name}`, { size: 0.01 }, scene) };
  }
  const materials = sharedMaterials ?? (() => {
    const cloth = material(scene, "cloth");
    cloth.diffuseTexture = RawTexture.CreateRGBATexture(
      new Uint8Array([230, 222, 202, 255]), 1, 1, scene, false, false,
    );
    cloth.bumpTexture = RawTexture.CreateRGBATexture(
      new Uint8Array([128, 128, 255, 255]), 1, 1, scene, false, false,
    );
    return {
      steel: material(scene, "steel"), leather: material(scene, "leather"),
      cloth, flesh: material(scene, "flesh"),
    };
  })();
  return { figure: new Figure(scene, { prefix, ...bones }, materials), materials, bones };
}

test("every_costume_piece_names_one_known_surface_family", () => {
  const known = new Set(["steel", "leather", "cloth", "flesh", "side"]);
  const pieces = costumePieces();
  assert.equal(new Set(pieces.map((piece) => piece.name)).size, pieces.length, "piece names are total keys");
  for (const piece of pieces) assert.ok(known.has(piece.material), `${piece.name}: ${piece.material}`);
  for (const expected of known) {
    assert.ok(pieces.some((piece) => piece.material === expected), `${expected} has a costume consumer`);
  }
  assert.equal(pieces.find((piece) => piece.name === "surcoat")?.material, "side");
  assert.equal(pieces.find((piece) => piece.name === "skirt")?.material, "side");
});

test("left_and_right_share_maps_but_keep_distinct_cloth_tints", (t) => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  t.after(() => engine.dispose());
  const left = figureFixture(scene, "left");
  const right = figureFixture(scene, "right", left.materials);
  const side = (fixture) => fixture.figure.pieces.find((piece) => piece.name.endsWith(".surcoat")).material;
  const leftSide = side(left);
  const rightSide = side(right);
  assert.notStrictEqual(leftSide, rightSide);
  assert.strictEqual(leftSide.diffuseTexture, left.materials.cloth.diffuseTexture, "left tint shares its base map");
  assert.strictEqual(rightSide.diffuseTexture, left.materials.cloth.diffuseTexture, "right tint shares the same map");
  assert.notDeepEqual(leftSide.diffuseColor.asArray(), rightSide.diffuseColor.asArray());
  assert.deepEqual(leftSide.diffuseColor.asArray(), [0.42, 0.06, 0.08]);
  assert.deepEqual(rightSide.diffuseColor.asArray(), [0.07, 0.15, 0.42]);
  left.figure.dispose();
  right.figure.dispose();
});

test("rebuilding_a_bout_disposes_side_material_clones", (t) => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  t.after(() => engine.dispose());
  const seed = figureFixture(scene, "seed");
  const shared = seed.materials;
  seed.figure.dispose();
  const textureCount = scene.textures.length;
  for (let rebuild = 0; rebuild < 10; rebuild += 1) {
    const fixture = figureFixture(scene, "left", shared);
    const side = fixture.figure.pieces.find((piece) => piece.name.endsWith(".surcoat")).material;
    let disposed = false;
    side.onDisposeObservable.add(() => { disposed = true; });
    fixture.figure.dispose();
    assert.equal(disposed, true, `rebuild ${rebuild} releases its side material`);
    assert.equal(scene.materials.includes(side), false, `rebuild ${rebuild} leaves no side material`);
    assert.equal(scene.textures.length, textureCount, `rebuild ${rebuild} creates no texture wrapper`);
  }
});

test("the_costume_fallback_uses_the_same_surface_assignments_as_the_glb", async () => {
  const dimensions = JSON.parse(await readFile(resolve(ROOT, "asset-src/dimensions.json"), "utf8"));
  const runtime = new Map(costumePieces().map((piece) => [piece.name, piece.material]));
  assert.deepEqual(
    dimensions.pieces.map((piece) => [piece.name, piece.material]),
    [...runtime],
  );
});

test("the_actual_glb_loads_and_wears_each_authored_piece_on_its_declared_bone", async (t) => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  t.after(() => engine.dispose());
  const raw = await readFile(resolve(ROOT, "public/assets/warrior.glb"));
  const container = await LoadAssetContainerAsync(new Uint8Array(raw), scene, { pluginExtension: ".glb" });
  const fixture = figureFixture(scene, "wear-proof");
  fixture.figure.wear(container, boneFrames());

  const pieces = new Map(fixture.figure.pieces.map((mesh) => [mesh.name.split(".").at(-1), mesh]));
  const parentFailures = () => costumePieces().flatMap((piece) => {
    const worn = pieces.get(piece.name);
    return worn.parent === fixture.bones[piece.bone].mesh
      ? []
      : [`${piece.name} is not parented to ${piece.bone}`];
  });
  for (const piece of costumePieces()) {
    const worn = pieces.get(piece.name);
    const source = container.meshes.find((mesh) => mesh.name === piece.name);
    assert.ok(source && source.getTotalVertices() > 0, `${piece.name} loads from the real GLB`);
    assert.equal(worn.getTotalVertices(), source.getTotalVertices(), `${piece.name} replaces its fallback geometry`);
    assert.strictEqual(worn.parent, fixture.bones[piece.bone].mesh, `${piece.name} stays on ${piece.bone}`);
    assert.deepEqual(worn.position.asArray(), [0, 0, 0], `${piece.name} carries no fallback offset after wear`);
    assert.deepEqual(worn.scaling.asArray(), [1, 1, 1], `${piece.name} carries no fallback scale after wear`);
  }
  assert.deepEqual(parentFailures(), []);

  const surcoat = pieces.get("surcoat");
  surcoat.parent = fixture.bones.pelvis.mesh;
  assert.ok(parentFailures().includes("surcoat is not parented to torso"),
    "the parent contract catches a deliberately mis-parented piece");
  fixture.figure.dispose();
  container.dispose();
});

test("late_palette_maps_reach_a_live_side_tint_without_new_wrappers", (t) => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  t.after(() => engine.dispose());
  const ready = new Map();
  const delayed = (inScene, map, onReady) => {
    const texture = new Texture(null, inScene);
    ready.set(map.channel, () => onReady(texture));
    return texture;
  };
  const cloth = surface(scene, TEXTURED_SURFACES.figureCloth, delayed);
  const materials = {
    steel: material(scene, "steel"), leather: material(scene, "leather"),
    cloth, flesh: material(scene, "flesh"),
  };
  const fixture = figureFixture(scene, "left", materials);
  const side = fixture.figure.pieces.find((piece) => piece.name.endsWith(".surcoat")).material;
  const before = scene.textures.length;
  for (const channel of ["albedo", "normal", "orm"]) ready.get(channel)();
  assert.strictEqual(side.albedoTexture, cloth.albedoTexture);
  assert.strictEqual(side.bumpTexture, cloth.bumpTexture);
  assert.strictEqual(side.metallicTexture, cloth.metallicTexture);
  assert.equal(side.invertNormalMapX, cloth.invertNormalMapX);
  assert.equal(side.invertNormalMapY, cloth.invertNormalMapY);
  assert.equal(side.useMetallnessFromMetallicTextureBlue, true);
  assert.equal(side.useRoughnessFromMetallicTextureAlpha, false);
  assert.equal(side.useRoughnessFromMetallicTextureGreen, true);
  assert.equal(side.useAmbientOcclusionFromMetallicTextureRed, true);
  assert.deepEqual(side.albedoColor.asArray(), [0.42, 0.06, 0.08], "late albedo does not erase tint");
  assert.equal(scene.textures.length, before, "propagation shares wrappers instead of cloning them");
  fixture.figure.dispose();
});

test("character_maps_share_only_with_babylon_basis_weapon_surfaces", () => {
  for (const row of registry.textures.filter((entry) => entry.consumers.some((consumer) => consumer.startsWith("figure.")))) {
    assert.ok(row.consumers.every((consumer) => /^(figure|weapon)\./.test(consumer)), row.name);
    if (row.channel === "normal") assert.equal(row.tangentBasis, "babylon-lh", row.name);
  }
  assert.equal(registry.textures.some((row) => row.consumers.includes("weapon.steel")), true);
  assert.equal(registry.textures.some((row) => row.consumers.includes("palette.steel")), false);
  const data = new VertexData();
  data.tangents = [1, -2, 3, -1, -4, 5, -6, 1];
  normalizeImportedTangents(data);
  assert.deepEqual(data.tangents, [-1, 2, -3, -1, 4, -5, 6, 1]);
});

test("every_weapon_part_uses_a_known_surface_family", () => {
  assert.deepEqual(validateObjectSurfaceTable(OBJECT_PART_SURFACES), []);
  const known = new Set(["steel", "edge", "brass", "leather", "wood", "paintedWood", "bowString", "arrowAccent"]);
  for (const [part, entry] of Object.entries(OBJECT_PART_SURFACES)) {
    assert.ok(known.has(entry.family), `${part}: ${entry.family}`);
  }
});

test("wood_grain_runs_along_every_haft_stave_and_arrow_shaft", async (t) => {
  for (const part of ["axe.haft", "bow.stave", "club.haft", "club.head", "arrow.shaft", "arena.post"]) {
    assert.equal(OBJECT_PART_SURFACES[part].grain, "long", part);
  }
  const rotated = structuredClone(OBJECT_PART_SURFACES);
  rotated["axe.haft"].quarterTurns = 1;
  assert.ok(validateObjectSurfaceTable(rotated).some((failure) => failure.includes("axe.haft")));
  const turnedStave = structuredClone(OBJECT_PART_SURFACES);
  turnedStave["bow.stave"].quarterTurns = 0;
  assert.ok(validateObjectSurfaceTable(turnedStave).some((failure) => failure.includes("bow.stave")));
  const turnedBoard = structuredClone(OBJECT_PART_SURFACES);
  turnedBoard["shield.plate"].quarterTurns = 0;
  assert.ok(validateObjectSurfaceTable(turnedBoard).some((failure) => failure.includes("shield.plate")));

  const engine = new NullEngine();
  const scene = new Scene(engine);
  t.after(() => engine.dispose());
  attachPhysics(scene, await HavokPhysics({ wasmBinary: await readFile(havokWasm) }));
  const shared = material(scene, "grain-proof");
  const materials = Object.fromEntries(
    ["steel", "edge", "brass", "leather", "wood", "paintedWood", "bowString", "arrowAccent"]
      .map((family) => [family, shared]),
  );
  const make = (kind) => new Weapon(scene, {
    name: `grain-${kind}`,
    kind,
    position: Vector3.Zero(),
    rotation: Quaternion.Identity(),
    layer: LAYER.LEFT_SWORD,
    collidesWith: COLLIDES.LEFT_SWORD,
  }, materials);
  const axe = make("axe");
  const club = make("club");
  const bow = make("bow");
  const shield = make("shield");
  const arrow = new Arrow(scene, "grain-arrow", {
    name: "grain-arrow", layer: LAYER.LEFT_ARROW, collidesWith: COLLIDES.LEFT_ARROW,
  }, materials);
  const post = MeshBuilder.CreateCylinder("grain-post", { height: 1.5, diameter: 0.17, tessellation: 8 }, scene);
  applyObjectSurface(post, "arena.post", materials);

  const correlation = (mesh, positionAxis, normalAxis, majorNormal) => {
    const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
    const normals = mesh.getVerticesData(VertexBuffer.NormalKind);
    const uvs = mesh.getVerticesData(VertexBuffer.UVKind);
    const side = [];
    for (let vertex = 0; vertex < positions.length / 3; vertex += 1) {
      if ((Math.abs(normals[vertex * 3 + normalAxis]) > 0.5) === majorNormal) {
        side.push([positions[vertex * 3 + positionAxis], uvs[vertex * 2 + 1]]);
      }
    }
    const meanY = side.reduce((sum, row) => sum + row[0], 0) / side.length;
    const meanV = side.reduce((sum, row) => sum + row[1], 0) / side.length;
    const covariance = side.reduce((sum, row) => sum + (row[0] - meanY) * (row[1] - meanV), 0);
    const spreadY = Math.sqrt(side.reduce((sum, row) => sum + (row[0] - meanY) ** 2, 0));
    const spreadV = Math.sqrt(side.reduce((sum, row) => sum + (row[1] - meanV) ** 2, 0));
    return Math.abs(covariance / (spreadY * spreadV));
  };
  for (const [meshName, part] of [
    ["grain-axe.haft", "axe.haft"], ["grain-club.haft", "club.haft"],
    ["grain-club.head", "club.head"], ["grain-arrow.shaft", "arrow.shaft"],
  ]) {
    const mesh = scene.getMeshByName(meshName);
    // Cylinder side normals are radial, so keep every generated side vertex and
    // ask whether texture V follows the actual local-Y position.
    const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
    const normals = mesh.getVerticesData(VertexBuffer.NormalKind);
    const uvs = mesh.getVerticesData(VertexBuffer.UVKind);
    const side = [];
    for (let vertex = 0; vertex < positions.length / 3; vertex += 1) {
      if (Math.abs(normals[vertex * 3 + 1]) < 0.5) side.push([positions[vertex * 3 + 1], uvs[vertex * 2 + 1]]);
    }
    const meanY = side.reduce((sum, row) => sum + row[0], 0) / side.length;
    const meanV = side.reduce((sum, row) => sum + row[1], 0) / side.length;
    const covariance = side.reduce((sum, row) => sum + (row[0] - meanY) * (row[1] - meanV), 0);
    const spreadY = Math.sqrt(side.reduce((sum, row) => sum + (row[0] - meanY) ** 2, 0));
    const spreadV = Math.sqrt(side.reduce((sum, row) => sum + (row[1] - meanV) ** 2, 0));
    assert.ok(Math.abs(covariance / (spreadY * spreadV)) > 0.99, `${part}: real mesh V follows local Y`);
  }
  assert.ok(correlation(post, 1, 1, false) > 0.99, "arena.post: real post V follows local Y");
  assert.ok(correlation(scene.getMeshByName("grain-bow.stave"), 0, 2, true) > 0.99, "bow.stave: V follows local X");
  assert.ok(correlation(scene.getMeshByName("grain-shield.plate"), 2, 1, true) > 0.99, "shield.plate: V follows local Z");
  axe.dispose();
  club.dispose();
  bow.dispose();
  shield.dispose();
  arrow.dispose();
  post.dispose(false, false);
});

test("arrow_accent_survives_the_weapon_texture_pass", () => {
  for (const part of ["bow.nocked", "arrow.head", "arrow.fletch", "arrow.trace"]) {
    assert.equal(OBJECT_PART_SURFACES[part].family, "arrowAccent", part);
  }
});

test("two_hop_object_variants_share_late_maps_and_channel_semantics", (t) => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  t.after(() => engine.dispose());
  const delayed = (ready) => (inScene, map, onReady) => {
    const texture = new Texture(null, inScene);
    ready.set(map.channel, () => onReady(texture));
    return texture;
  };
  const readySteel = new Map();
  const figureSteel = surface(scene, TEXTURED_SURFACES.figureSteel, delayed(readySteel));
  const weaponSteel = surfaceVariant(scene, { ...TEXTURED_SURFACES.weaponSteel, textures: {} }, figureSteel);
  const edge = surfaceVariant(scene, OBJECT_SURFACE_VARIANTS.edge, weaponSteel);
  const readyLeather = new Map();
  const figureLeather = surface(scene, TEXTURED_SURFACES.figureLeather, delayed(readyLeather));
  const weaponLeather = surfaceVariant(scene, { ...TEXTURED_SURFACES.weaponLeather, textures: {} }, figureLeather);
  const string = surfaceVariant(scene, OBJECT_SURFACE_VARIANTS.bowString, weaponLeather);
  const before = scene.textures.length;
  for (const channel of ["albedo", "normal", "orm"]) {
    readySteel.get(channel)();
    readyLeather.get(channel)();
  }
  assert.strictEqual(edge.albedoTexture, figureSteel.albedoTexture);
  assert.strictEqual(edge.bumpTexture, figureSteel.bumpTexture);
  assert.strictEqual(edge.metallicTexture, figureSteel.metallicTexture);
  assert.strictEqual(string.albedoTexture, figureLeather.albedoTexture);
  assert.strictEqual(string.bumpTexture, figureLeather.bumpTexture);
  assert.strictEqual(string.metallicTexture, figureLeather.metallicTexture);
  assert.equal(edge.invertNormalMapY, true);
  assert.equal(edge.useMetallnessFromMetallicTextureBlue, true);
  assert.equal(edge.useRoughnessFromMetallicTextureAlpha, false);
  assert.equal(edge.useRoughnessFromMetallicTextureGreen, true);
  assert.equal(edge.useAmbientOcclusionFromMetallicTextureRed, true);
  assert.equal(string.invertNormalMapY, true);
  assert.equal(string.useMetallnessFromMetallicTextureBlue, true);
  assert.equal(string.useRoughnessFromMetallicTextureAlpha, false);
  assert.equal(string.useRoughnessFromMetallicTextureGreen, true);
  assert.equal(string.useAmbientOcclusionFromMetallicTextureRed, true);
  assert.equal(scene.textures.length, before, "the variant creates no wrapper");
  edge.dispose(false, false);
  string.dispose(false, false);
  assert.ok(scene.textures.includes(figureSteel.albedoTexture), "variant disposal cannot own the shared maps");
});

test("shared_weapon_textures_survive_one_weapon_being_disposed", async (t) => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  t.after(() => engine.dispose());
  attachPhysics(scene, await HavokPhysics({ wasmBinary: await readFile(havokWasm) }));
  const shared = material(scene, "shared-steel");
  const map = RawTexture.CreateRGBATexture(new Uint8Array([128, 128, 128, 255]), 1, 1, scene);
  shared.diffuseTexture = map;
  const materials = Object.fromEntries(
    ["steel", "edge", "brass", "leather", "wood", "paintedWood", "bowString", "arrowAccent"]
      .map((family) => [family, shared]),
  );
  const weapons = ["first", "second"].map((name) => new Weapon(scene, {
    name,
    kind: "sword",
    position: Vector3.Zero(),
    rotation: Quaternion.Identity(),
    layer: LAYER.LEFT_SWORD,
    collidesWith: COLLIDES.LEFT_SWORD,
  }, materials));
  const secondBlade = scene.getMeshByName("second.blade");
  weapons[0].dispose();
  assert.ok(scene.textures.includes(map), "shared map remains registered in the live scene");
  assert.strictEqual(secondBlade.material.diffuseTexture, map);
  weapons[1].dispose();
});

test("weapon_textures_do_not_add_bodies_shapes_or_strikers", async (t) => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  t.after(() => engine.dispose());
  attachPhysics(scene, await HavokPhysics({ wasmBinary: await readFile(havokWasm) }));
  const materialSet = Object.fromEntries(
    ["steel", "edge", "brass", "leather", "wood", "paintedWood", "bowString", "arrowAccent"]
      .map((family) => [family, material(scene, family)]),
  );
  const expected = {
    sword: [5, 3], axe: [5, 2], bow: [7, 2], shield: [4, 1], buckler: [4, 1], club: [5, 2],
  };
  const authority = {
    sword: { mass: 1.35, com: [0, 0.195, 0], layout: [
      [[0, 0.515, 0], [-0.025, -0.42, -0.005], [0.025, 0.42, 0.005]],
      [[0, 0.095, 0], [-0.11, -0.013, -0.019], [0.11, 0.013, 0.019]],
      [[0, 0, 0], [-0.017, -0.095, -0.017], [0.017, 0.095, 0.017]],
    ] },
    axe: { mass: 1.4, com: [0.04, 0.45, 0], layout: [
      [[0, 0.2, 0], [-0.018, -0.31, -0.018], [0.018, 0.31, 0.018]],
      [[0.0425, 0.595, 0], [-0.0875, -0.085, -0.021], [0.0875, 0.085, 0.021]],
    ] },
    bow: { mass: 0.85, com: [0, 0, 0], layout: [
      [[0, 0, 0], [-0.625, -0.015, -0.01], [0.625, 0.015, 0.01]],
      [[0, -0.017, 0], [-0.085, -0.017, -0.019], [0.085, 0.017, 0.019]],
    ] },
    shield: { mass: 4, com: [0, 0.04125, 0.015], layout: [
      [[0, 0.055, 0.02], [-0.22, -0.0168, -0.3], [0.22, 0.0168, 0.3]],
    ] },
    buckler: { mass: 1.2, com: [0, 0.0675, 0], layout: [
      [[0, 0.075, 0], [-0.17, -0.00225, -0.17], [0.17, 0.00225, 0.17]],
    ] },
    club: { mass: 3.4, com: [0, 0.62, 0], layout: [
      [[0, 0.09, 0], [-0.022, -0.43, -0.022], [0.022, 0.43, 0.022]],
      [[0, 0.64, 0], [-0.0525, -0.12, -0.0525], [0.0525, 0.12, 0.0525]],
    ] },
  };
  const rounded = (numbers) => numbers.map((value) => Math.round(value * 1e6) / 1e6);
  for (const kind of WEAPON_KINDS.filter((entry) => entry !== "empty")) {
    const before = scene.meshes.length;
    const weapon = new Weapon(scene, {
      name: `proof-${kind}`,
      kind,
      position: Vector3.Zero(),
      rotation: Quaternion.Identity(),
      layer: LAYER.LEFT_SWORD,
      collidesWith: COLLIDES.LEFT_SWORD,
    }, materialSet);
    const meshes = weapon.root.getChildMeshes(false);
    assert.equal(meshes.length, expected[kind][0], `${kind}: visual mesh count stays pinned`);
    assert.equal(weapon.pieces.length, expected[kind][1], `${kind}: physics leaf count stays pinned`);
    assert.ok(weapon.body, `${kind}: exactly one carried-object body exists`);
    assert.equal(weapon.kind, kind, `${kind}: striker identity stays pinned`);
    const mass = weapon.body.getMassProperties();
    assert.equal(Math.round(mass.mass * 1e6) / 1e6, authority[kind].mass, `${kind}: mass stays pinned`);
    assert.deepEqual(rounded(mass.centerOfMass.asArray()), authority[kind].com, `${kind}: centre of mass stays pinned`);
    assert.deepEqual(
      weapon.physicsLayout.map((part) => [rounded(part.offset), rounded(part.minimum), rounded(part.maximum)]),
      authority[kind].layout,
      `${kind}: every compound offset and dimension stays pinned`,
    );
    for (const piece of weapon.pieces) {
      assert.equal(piece.filterMembershipMask, LAYER.LEFT_SWORD, `${kind}: authoritative membership mask`);
      assert.equal(piece.filterCollideMask, COLLIDES.LEFT_SWORD, `${kind}: authoritative collision mask`);
    }
    for (const mesh of meshes) {
      const part = mesh.metadata?.objectSurfacePart;
      assert.ok(part, `${mesh.name}: table-assigned`);
      assert.strictEqual(mesh.material, materialSet[OBJECT_PART_SURFACES[part].family], `${mesh.name}: shared family`);
    }
    weapon.dispose();
    assert.equal(scene.meshes.length, before, `${kind}: disposal returns the visual count`);
  }

  const beforeArrow = scene.meshes.length;
  const arrow = new Arrow(scene, "proof-arrow", {
    name: "proof-arrow",
    layer: LAYER.LEFT_ARROW,
    collidesWith: COLLIDES.LEFT_ARROW,
  }, materialSet);
  const arrowMeshes = [...arrow.root.getChildMeshes(false), arrow.trail];
  assert.equal(arrowMeshes.length, 4, "arrow keeps three projectile meshes and one trace");
  assert.ok(arrow.shape, "arrow keeps its one striker shape");
  assert.equal(arrow.kind, "arrow", "arrow striker identity stays pinned");
  assert.equal(Math.round(arrow.body.getMassProperties().mass * 1e6) / 1e6, CONFIG.arrow.mass);
  const arrowBounds = arrow.shape.getBoundingBox();
  assert.deepEqual(rounded(arrowBounds.minimum.asArray()), [
    -CONFIG.arrow.shaftDiameter / 2, -CONFIG.arrow.length / 2, -CONFIG.arrow.shaftDiameter / 2,
  ]);
  assert.deepEqual(rounded(arrowBounds.maximum.asArray()), [
    CONFIG.arrow.shaftDiameter / 2, CONFIG.arrow.length / 2, CONFIG.arrow.shaftDiameter / 2,
  ]);
  assert.equal(arrow.shape.filterMembershipMask, 0, "parked arrow stays off every collision layer");
  assert.equal(arrow.shape.filterCollideMask, 0, "parked arrow cannot strike");
  for (const mesh of arrowMeshes) {
    const part = mesh.metadata?.objectSurfacePart;
    assert.ok(part, `${mesh.name}: table-assigned`);
    assert.strictEqual(mesh.material, materialSet[OBJECT_PART_SURFACES[part].family], `${mesh.name}: shared family`);
  }
  arrow.dispose();
  assert.equal(scene.meshes.length, beforeArrow, "arrow disposal returns the visual count");
});
