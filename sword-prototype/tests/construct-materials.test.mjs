import assert from "node:assert/strict";
import test from "node:test";

import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial.js";
import { Texture } from "@babylonjs/core/Materials/Textures/texture.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { Scene } from "@babylonjs/core/scene.js";

import {
  CONSTRUCT_SURFACE_RULES,
  CONSTRUCT_MATERIAL_PROFILES,
  DEFAULT_CONSTRUCT_MATERIAL_RECIPE,
  STONE_GRAIN,
  applyConstructSurface,
  buildStoneGrainPixels,
  constructMaterials,
  materialForConstructRecipe,
  materialForConstructRole,
} from "../src/construct/materials.ts";

test("carved_stone_is_the_default_construct_surface", () => {
  assert.equal(DEFAULT_CONSTRUCT_MATERIAL_RECIPE, "carved-stone");
  assert.deepEqual(Object.keys(CONSTRUCT_MATERIAL_PROFILES), [
    "carved-stone", "functional-bronze", "construct-wood", "rune-inlay",
  ]);
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const palette = constructMaterials(scene, "left");
  const shell = MeshBuilder.CreateBox("stone-default", { size: 1 }, scene);
  try {
    applyConstructSurface(shell, palette);

    assert.strictEqual(shell.material, palette.carvedStone);
    assert.equal(shell.metadata.constructMaterialRecipe, "carved-stone");
    assert.strictEqual(materialForConstructRecipe(palette, "carved-stone"), palette.carvedStone);
    assert.strictEqual(materialForConstructRecipe(palette, "construct-wood"), palette.constructWood);
    assert.throws(() => materialForConstructRecipe(palette, "painted-steel"), /unknown construct material recipe/);
    assert.equal(palette.carvedStone.metadata.constructSurfaceFamily, "carvedStone");
    assert.equal(palette.carvedStone.metallic, 0);
  } finally {
    shell.dispose(false, false);
    palette.dispose();
    scene.dispose();
    engine.dispose();
  }
});

test("the_default_stone_has_visible_roughness_and_two_scale_grain", () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const stone = constructMaterials(scene, "right").carvedStone;
  const pixels = buildStoneGrainPixels();
  const albedoValues = new Set();
  const tiltedNormals = new Set();
  for (let offset = 0; offset < pixels.albedo.length; offset += 4) {
    albedoValues.add(pixels.albedo[offset]);
    if (pixels.normal[offset] !== 128 || pixels.normal[offset + 1] !== 128) {
      tiltedNormals.add(`${pixels.normal[offset]},${pixels.normal[offset + 1]}`);
    }
  }

  assert.equal(stone.roughness, STONE_GRAIN.roughness);
  assert.ok(stone.roughness >= 0.9, "stone is matte instead of metal-polished");
  assert.ok(stone.albedoTexture, "mottled colour grain is attached");
  assert.ok(stone.bumpTexture, "rock relief is attached as a normal map");
  assert.equal(stone.albedoTexture.uScale, STONE_GRAIN.repeats);
  assert.equal(stone.bumpTexture.vScale, STONE_GRAIN.repeats);
  assert.equal(stone.bumpTexture.wrapU, Texture.WRAP_ADDRESSMODE);
  assert.equal(stone.bumpTexture.gammaSpace, false);
  assert.ok(albedoValues.size > 24, `grain has only ${albedoValues.size} albedo levels`);
  assert.ok(tiltedNormals.size > 100, `grain has only ${tiltedNormals.size} relief directions`);

  scene.dispose();
  engine.dispose();
});

test("functional_metal_is_limited_to_joints_and_mounts", () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const palette = constructMaterials(scene, "left");
  const metalRoles = Object.entries(CONSTRUCT_SURFACE_RULES)
    .filter(([, rule]) => CONSTRUCT_MATERIAL_PROFILES[rule.recipe].family === "functionalMetal")
    .map(([role]) => role);

  assert.deepEqual(metalRoles, ["joint", "mount"]);
  for (const role of metalRoles) assert.ok(materialForConstructRole(palette, role).metallic > 0.5, role);
  assert.strictEqual(materialForConstructRole(palette, "joint"), palette.functionalMetal);
  assert.strictEqual(materialForConstructRole(palette, "mount"), palette.functionalMetal);
  for (const role of ["shell", "armour", "trim", "rune"]) {
    assert.notStrictEqual(materialForConstructRole(palette, role), palette.functionalMetal, role);
  }

  palette.dispose();
  scene.dispose();
  engine.dispose();
});

test("construct_palettes_are_shared_per_faction_and_dispose_every_resource", () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  // Babylon lazily creates one scene-level environment BRDF lookup for the
  // first PBR material. Warm that engine-owned singleton before counting the
  // palette's own resources.
  const warm = new PBRMaterial("pbr-census-warmup", scene);
  warm.dispose(false, false);
  const baseline = { materials: scene.materials.length, textures: scene.textures.length };
  const left = constructMaterials(scene, "left");
  const again = constructMaterials(scene, "left");
  const right = constructMaterials(scene, "right");
  assert.strictEqual(again, left, "one scene-owned palette is reused per faction");
  assert.notStrictEqual(right, left, "factions do not accidentally share their tint palette");
  assert.equal(scene.materials.length, baseline.materials + 8);
  assert.equal(scene.textures.length, baseline.textures + 4);

  const borrowed = MeshBuilder.CreateBox("borrowed-construct-surface", { size: 1 }, scene);
  applyConstructSurface(borrowed, left, "carved-stone");
  borrowed.dispose(false, false);
  assert.ok(scene.materials.includes(left.carvedStone), "part disposal cannot own the palette");
  assert.ok(scene.textures.includes(left.carvedStone.bumpTexture), "part disposal cannot own grain maps");

  left.dispose();
  left.dispose();
  right.dispose();
  assert.equal(left.disposed, true);
  assert.deepEqual(
    { materials: scene.materials.length, textures: scene.textures.length },
    baseline,
    "palette teardown returns both material and generated-texture censuses",
  );

  const rebuilt = constructMaterials(scene, "left");
  assert.notStrictEqual(rebuilt, left, "a disposed palette cannot remain cached");
  rebuilt.dispose();
  scene.dispose();
  engine.dispose();
});
