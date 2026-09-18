import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial.js";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture.js";
import { Texture } from "@babylonjs/core/Materials/Textures/texture.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import type { Scene } from "@babylonjs/core/scene.js";
import {
  DEFAULT_GOLEM_SURFACE_MODE,
  attachGolemProceduralSurface,
  golemSurfaceCapabilities,
  selectGolemSurfaceMode,
  type GolemProceduralSurfacePlugin,
  type GolemSurfaceAudit,
  type GolemSurfaceMode,
} from "./procedural-surface.ts";

/**
 * Salvaged from the deleted `src/construct/materials.ts` on 2026-09-04: the four shared recipes,
 * the per-side albedo and the one-palette-owns-its-textures rule are unchanged. What did not
 * survive is the coupling to a saved body description -- the six shell-style names were a
 * blueprint union and are declared here now, so a golem module names its own appearance without
 * a save format existing.
 */
export type GolemShellStyle = "plate" | "collar" | "bearing" | "piston" | "core" | "support";

export type GolemFaction = "left" | "right";
export type GolemSurfaceFamily = "carvedStone" | "functionalMetal" | "golemWood" | "rune";
export type GolemSurfaceRole = "shell" | "armour" | "joint" | "mount" | "trim" | "rune";
export type GolemMaterialRecipeKey =
  | "carved-stone"
  | "functional-bronze"
  | "golem-wood"
  | "rune-inlay";

export interface GolemMaterialPalette {
  readonly faction: GolemFaction;
  readonly surface: GolemSurfaceAudit;
  readonly carvedStone: PBRMaterial;
  readonly functionalMetal: PBRMaterial;
  readonly golemWood: PBRMaterial;
  readonly rune: PBRMaterial;
  readonly plugins: readonly GolemProceduralSurfacePlugin[];
  readonly disposed: boolean;
  dispose(): void;
}

export interface GolemSurfaceRule {
  readonly recipe: GolemMaterialRecipeKey;
  readonly reason: string;
}

export interface GolemMaterialProfile {
  readonly family: GolemSurfaceFamily;
  readonly albedoByFaction: Readonly<Record<GolemFaction, readonly [number, number, number]>>;
  readonly metallic: number;
  readonly roughness: number;
  readonly emissive: boolean;
  readonly grain: null | Readonly<{
    kind: "generated-rock";
    size: number;
    repeats: number;
    normalStrength: number;
  }>;
}

/**
 * Visual roles stay narrower than the part kinds a module builds. The renderer asks what a
 * piece is doing, and this table prevents a new plate or piston from quietly turning the
 * whole golem back into a metal character.
 */
export const GOLEM_SURFACE_RULES = Object.freeze({
  shell: { recipe: "carved-stone", reason: "the default carved load-bearing body" },
  armour: { recipe: "carved-stone", reason: "replaceable carved protective slabs" },
  joint: { recipe: "functional-bronze", reason: "bearing, axle or joint collar" },
  mount: { recipe: "functional-bronze", reason: "module and weapon mounting hardware" },
  trim: { recipe: "golem-wood", reason: "declared non-structural wood trim" },
  rune: { recipe: "rune-inlay", reason: "non-structural mineral and bronze inlay" },
} satisfies Record<GolemSurfaceRole, GolemSurfaceRule>);

export const DEFAULT_GOLEM_SURFACE_ROLE: GolemSurfaceRole = "shell";
export const DEFAULT_GOLEM_MATERIAL_RECIPE: GolemMaterialRecipeKey = "carved-stone";

/** Shell style is appearance authority; core/plate/piston retain the requested rocky grain. */
export function roleForGolemShell(style: GolemShellStyle): GolemSurfaceRole {
  switch (style) {
    case "core": case "plate": case "piston": case "support": return "shell";
    case "collar": return "mount";
    case "bearing": return "joint";
  }
}

export const recipeForGolemShell = (style: GolemShellStyle): GolemMaterialRecipeKey =>
  GOLEM_SURFACE_RULES[roleForGolemShell(style)].recipe;

export const STONE_GRAIN = Object.freeze({
  size: 32,
  repeats: 7,
  normalStrength: 0.72,
  roughness: 0.94,
});

/**
 * A module names only a recipe key. These profiles are the runtime authority for its scalar
 * and generated-map values, so nothing outside this file can smuggle arbitrary shader state
 * into the scene.
 */
export const GOLEM_MATERIAL_PROFILES = Object.freeze({
  "carved-stone": {
    family: "carvedStone",
    albedoByFaction: { left: [0.50, 0.43, 0.35], right: [0.36, 0.43, 0.50] },
    metallic: 0,
    roughness: STONE_GRAIN.roughness,
    emissive: false,
    grain: {
      kind: "generated-rock",
      size: STONE_GRAIN.size,
      repeats: STONE_GRAIN.repeats,
      normalStrength: STONE_GRAIN.normalStrength,
    },
  },
  "functional-bronze": {
    family: "functionalMetal",
    albedoByFaction: { left: [0.52, 0.29, 0.10], right: [0.52, 0.29, 0.10] },
    metallic: 1,
    roughness: 0.42,
    emissive: false,
    grain: null,
  },
  "golem-wood": {
    family: "golemWood",
    albedoByFaction: { left: [0.31, 0.17, 0.075], right: [0.31, 0.17, 0.075] },
    metallic: 0,
    roughness: 0.78,
    emissive: false,
    grain: null,
  },
  "rune-inlay": {
    family: "rune",
    albedoByFaction: { left: [0.72, 0.35, 0.12], right: [0.33, 0.47, 0.58] },
    metallic: 0.42,
    roughness: 0.66,
    emissive: false,
    grain: null,
  },
} satisfies Record<GolemMaterialRecipeKey, GolemMaterialProfile>);

function noiseAt(x: number, y: number): number {
  let value = Math.imul(x + 101, 0x45d9f3b) ^ Math.imul(y + 197, 0x27d4eb2d);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  return ((value ^ (value >>> 16)) >>> 0) / 0xffffffff;
}

function heightAt(x: number, y: number): number {
  const fine = noiseAt(x, y);
  const coarse = noiseAt(Math.floor(x / 4), Math.floor(y / 4));
  const chip = noiseAt(x * 7 + 11, y * 5 + 17) > 0.91 ? -0.38 : 0;
  return fine * 0.52 + coarse * 0.48 + chip;
}

/** Deterministic bitmap data used by both browser rendering and headless tests. */
export function buildStoneGrainPixels(size = STONE_GRAIN.size): {
  readonly albedo: Uint8Array;
  readonly normal: Uint8Array;
} {
  if (!Number.isInteger(size) || size < 4) throw new Error(`stone grain size must be an integer >= 4, got ${size}`);
  const albedo = new Uint8Array(size * size * 4);
  const normal = new Uint8Array(size * size * 4);
  const sample = (x: number, y: number) => heightAt((x + size) % size, (y + size) % size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const offset = (y * size + x) * 4;
      const height = sample(x, y);
      const shade = Math.round(188 + Math.max(-0.38, height) * 58);
      albedo[offset] = Math.max(0, Math.min(255, shade + 7));
      albedo[offset + 1] = Math.max(0, Math.min(255, shade + 2));
      albedo[offset + 2] = Math.max(0, Math.min(255, shade - 5));
      albedo[offset + 3] = 255;

      const dx = (sample(x + 1, y) - sample(x - 1, y)) * STONE_GRAIN.normalStrength;
      const dy = (sample(x, y + 1) - sample(x, y - 1)) * STONE_GRAIN.normalStrength;
      const inverseLength = 1 / Math.hypot(dx, dy, 1);
      normal[offset] = Math.round((-dx * inverseLength * 0.5 + 0.5) * 255);
      normal[offset + 1] = Math.round((-dy * inverseLength * 0.5 + 0.5) * 255);
      normal[offset + 2] = Math.round(inverseLength * 255);
      normal[offset + 3] = 255;
    }
  }
  return { albedo, normal };
}

function stoneTextures(scene: Scene, faction: GolemFaction): readonly [RawTexture, RawTexture] {
  const pixels = buildStoneGrainPixels();
  const albedo = RawTexture.CreateRGBATexture(
    pixels.albedo, STONE_GRAIN.size, STONE_GRAIN.size, scene, false, false, Texture.TRILINEAR_SAMPLINGMODE,
  );
  albedo.name = `golem.${faction}.stone-grain-albedo`;
  albedo.gammaSpace = true;
  albedo.wrapU = Texture.WRAP_ADDRESSMODE;
  albedo.wrapV = Texture.WRAP_ADDRESSMODE;
  albedo.uScale = STONE_GRAIN.repeats;
  albedo.vScale = STONE_GRAIN.repeats;

  const normal = RawTexture.CreateRGBATexture(
    pixels.normal, STONE_GRAIN.size, STONE_GRAIN.size, scene, false, false, Texture.TRILINEAR_SAMPLINGMODE,
  );
  normal.name = `golem.${faction}.stone-grain-normal`;
  normal.gammaSpace = false;
  normal.wrapU = Texture.WRAP_ADDRESSMODE;
  normal.wrapV = Texture.WRAP_ADDRESSMODE;
  normal.uScale = STONE_GRAIN.repeats;
  normal.vScale = STONE_GRAIN.repeats;
  normal.level = STONE_GRAIN.normalStrength;
  return [albedo, normal];
}

function material(scene: Scene, name: string, albedo: readonly [number, number, number]): PBRMaterial {
  const made = new PBRMaterial(name, scene);
  made.albedoColor = Color3.FromArray(albedo);
  return made;
}

const scenePalettes = new WeakMap<Scene, Map<GolemFaction, GolemMaterialPalette>>();

export const hasGolemMaterials = (scene: Scene, faction: GolemFaction): boolean =>
  scenePalettes.get(scene)?.has(faction) === true;

/** One faction palette owns every material and generated texture it creates. */
export function golemMaterials(
  scene: Scene,
  faction: GolemFaction,
  requestedSurface: GolemSurfaceMode = DEFAULT_GOLEM_SURFACE_MODE,
): GolemMaterialPalette {
  let factions = scenePalettes.get(scene);
  if (!factions) {
    factions = new Map();
    scenePalettes.set(scene, factions);
  }
  const known = factions.get(faction);
  if (known) return known;

  const textures = stoneTextures(scene, faction);
  const stoneProfile = GOLEM_MATERIAL_PROFILES["carved-stone"];
  const carvedStone = material(scene, `golem.${faction}.carved-stone`, stoneProfile.albedoByFaction[faction]);
  carvedStone.metallic = stoneProfile.metallic;
  carvedStone.roughness = stoneProfile.roughness;
  carvedStone.albedoTexture = textures[0];
  carvedStone.bumpTexture = textures[1];
  carvedStone.invertNormalMapX = false;
  carvedStone.invertNormalMapY = true;
  carvedStone.metadata = { golemSurfaceFamily: "carvedStone", rockyGrain: true };

  const metalProfile = GOLEM_MATERIAL_PROFILES["functional-bronze"];
  const functionalMetal = material(
    scene, `golem.${faction}.functional-bronze`, metalProfile.albedoByFaction[faction],
  );
  functionalMetal.metallic = metalProfile.metallic;
  functionalMetal.roughness = metalProfile.roughness;
  functionalMetal.metadata = { golemSurfaceFamily: "functionalMetal" };

  const woodProfile = GOLEM_MATERIAL_PROFILES["golem-wood"];
  const golemWood = material(scene, `golem.${faction}.wood`, woodProfile.albedoByFaction[faction]);
  golemWood.metallic = woodProfile.metallic;
  golemWood.roughness = woodProfile.roughness;
  golemWood.metadata = { golemSurfaceFamily: "golemWood" };

  const runeProfile = GOLEM_MATERIAL_PROFILES["rune-inlay"];
  const rune = material(scene, `golem.${faction}.rune`, runeProfile.albedoByFaction[faction]);
  rune.metallic = runeProfile.metallic;
  rune.roughness = runeProfile.roughness;
  rune.unlit = runeProfile.emissive;
  rune.emissiveColor.set(0, 0, 0);
  rune.metadata = { golemSurfaceFamily: "rune" };

  const surface: GolemSurfaceAudit = { ...selectGolemSurfaceMode(requestedSurface,
    golemSurfaceCapabilities(scene.getEngine())) };
  const plugins = Object.freeze([
    attachGolemProceduralSurface(carvedStone, "stone", requestedSurface, surface),
    attachGolemProceduralSurface(functionalMetal, "bronze", requestedSurface, surface),
    attachGolemProceduralSurface(golemWood, "plain", requestedSurface, surface),
    attachGolemProceduralSurface(rune, "rune", requestedSurface, surface),
  ]);

  let disposed = false;
  const palette: GolemMaterialPalette = {
    faction,
    surface,
    carvedStone,
    functionalMetal,
    golemWood,
    rune,
    plugins,
    get disposed() { return disposed; },
    dispose() {
      if (disposed) return;
      disposed = true;
      carvedStone.dispose(false, false);
      functionalMetal.dispose(false, false);
      golemWood.dispose(false, false);
      rune.dispose(false, false);
      textures[1].dispose();
      textures[0].dispose();
      factions?.delete(faction);
      if (factions?.size === 0) scenePalettes.delete(scene);
    },
  };
  factions.set(faction, palette);
  return palette;
}

export function materialForGolemRole(
  palette: GolemMaterialPalette,
  role: GolemSurfaceRole = DEFAULT_GOLEM_SURFACE_ROLE,
): PBRMaterial {
  return materialForGolemRecipe(palette, GOLEM_SURFACE_RULES[role].recipe);
}

/** Resolve an explicit saved recipe without inspecting a part ID or shape. */
export function materialForGolemRecipe(
  palette: GolemMaterialPalette,
  recipe: GolemMaterialRecipeKey,
): PBRMaterial {
  const profile = GOLEM_MATERIAL_PROFILES[recipe];
  if (!profile) throw new Error(`unknown golem material recipe "${recipe}"`);
  return palette[profile.family];
}

/** Parts borrow their faction palette; disposing a part must pass false for materials and textures. */
export function applyGolemSurface(
  mesh: AbstractMesh,
  palette: GolemMaterialPalette,
  recipe: GolemMaterialRecipeKey = DEFAULT_GOLEM_MATERIAL_RECIPE,
): void {
  mesh.material = materialForGolemRecipe(palette, recipe);
  mesh.metadata = { ...(mesh.metadata ?? {}), golemMaterialRecipe: recipe,
    golemSurfaceFaction: palette.faction };
}
