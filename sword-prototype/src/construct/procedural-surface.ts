import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine.js";
import type { EffectFallbacks } from "@babylonjs/core/Materials/effectFallbacks.js";
import type { MaterialDefines } from "@babylonjs/core/Materials/materialDefines.js";
import { MaterialPluginBase } from "@babylonjs/core/Materials/materialPluginBase.js";
import type { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial.js";
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage.js";
import type { UniformBuffer } from "@babylonjs/core/Materials/uniformBuffer.js";
import type { SubMesh } from "@babylonjs/core/Meshes/subMesh.js";
import type { Scene } from "@babylonjs/core/scene.js";

import type { ConstructSurfaceBinding } from "./render.ts";

export const CONSTRUCT_PROCEDURAL_SURFACE_VERSION = 1 as const;
export type ConstructSurfaceMode = "procedural-pbr" | "mapped-pbr";

export interface ConstructSurfaceAudit {
  readonly requested: ConstructSurfaceMode;
  readonly effective: ConstructSurfaceMode;
  readonly reason: string | null;
  readonly shaderVersion: 1;
}

export interface ConstructSurfaceCapabilities {
  readonly glsl: boolean;
  readonly highPrecision: boolean;
  readonly derivatives: boolean;
}

export const DEFAULT_CONSTRUCT_SURFACE_MODE: ConstructSurfaceMode = "mapped-pbr";

export const PROCEDURAL_STONE_V1 = Object.freeze({
  lowFrequencyPerM: 1.7,
  highFrequencyPerM: 11,
  crackFrequencyPerM: 4.5,
  crackWidth: 0.055,
  roughnessMin: 0.82,
  roughnessMax: 0.98,
  normalStrength: 0.62,
});

export const PROCEDURAL_DAMAGE_WEAR_V1 = Object.freeze({
  beginsBelowHealthRatio: 0.75,
  maximumAtHealthRatio: 0.10,
  crackDarkeningMax: 0.22,
  freshEdgeLighteningMax: 0.16,
  normalIncreaseMax: 0.28,
});

export function selectConstructSurfaceMode(
  requested: ConstructSurfaceMode,
  capabilities: ConstructSurfaceCapabilities,
): ConstructSurfaceAudit {
  if (requested === "mapped-pbr") return Object.freeze({ requested, effective: requested, reason: null,
    shaderVersion: CONSTRUCT_PROCEDURAL_SURFACE_VERSION });
  const reason = !capabilities.glsl
    ? "procedural-pbr requires the pinned GLSL shader path"
    : !capabilities.highPrecision
      ? "procedural-pbr requires high-precision vertex and fragment shaders"
      : !capabilities.derivatives
        ? "procedural-pbr requires standard derivatives"
        : null;
  return Object.freeze({ requested, effective: reason === null ? requested : "mapped-pbr", reason,
    shaderVersion: CONSTRUCT_PROCEDURAL_SURFACE_VERSION });
}

export function constructSurfaceCapabilities(engine: AbstractEngine): ConstructSurfaceCapabilities {
  const caps = engine.getCaps();
  return Object.freeze({
    glsl: !engine.isWebGPU,
    highPrecision: caps.highPrecisionShaderSupported === true,
    derivatives: caps.standardDerivatives === true,
  });
}

export type ConstructShaderSurfaceFamily = "stone" | "bronze" | "plain" | "rune";

const FAMILY = Object.freeze({ plain: 0, stone: 1, bronze: 2, rune: 3 } satisfies
  Record<ConstructShaderSurfaceFamily, number>);

// One audit object is the palette's fallback authority. Keep the sibling plugins reachable from
// that object so one effect reduction invalidates every already-compiled material, not merely the
// material whose bind happened to discover the reduction first.
const pluginsByAudit = new WeakMap<object, Set<ConstructProceduralSurfacePlugin>>();

const GLSL_DEFINITIONS = `
#ifdef CONSTRUCT_PROCEDURAL
varying vec3 vConstructObjectPosition;
varying vec3 vConstructObjectNormal;
uniform vec4 constructSurface0;
uniform vec3 constructSurfaceExtents;

float constructHash(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}

float constructValueNoise(vec3 p) {
  vec3 cell = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(constructHash(cell), constructHash(cell + vec3(1.0, 0.0, 0.0)), f.x),
                 mix(constructHash(cell + vec3(0.0, 1.0, 0.0)), constructHash(cell + vec3(1.0, 1.0, 0.0)), f.x), f.y),
             mix(mix(constructHash(cell + vec3(0.0, 0.0, 1.0)), constructHash(cell + vec3(1.0, 0.0, 1.0)), f.x),
                 mix(constructHash(cell + vec3(0.0, 1.0, 1.0)), constructHash(cell + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
}

vec3 constructHash3(vec3 p) {
  return vec3(constructHash(p), constructHash(p + vec3(17.0, 59.0, 113.0)),
    constructHash(p + vec3(43.0, 97.0, 29.0)));
}

float constructCrackRidge(vec3 p) {
  vec3 cell = floor(p);
  vec3 local = fract(p);
  float nearest = 8.0;
  float secondNearest = 8.0;
  for (int z = -1; z <= 1; z++) {
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec3 neighbour = vec3(float(x), float(y), float(z));
        float distanceToCell = length(neighbour + constructHash3(cell + neighbour) - local);
        if (distanceToCell < nearest) {
          secondNearest = nearest;
          nearest = distanceToCell;
        } else if (distanceToCell < secondNearest) {
          secondNearest = distanceToCell;
        }
      }
    }
  }
  float boundary = secondNearest - nearest;
  return 1.0 - smoothstep(${PROCEDURAL_STONE_V1.crackWidth.toFixed(6)},
    ${(PROCEDURAL_STONE_V1.crackWidth * 2).toFixed(6)}, boundary);
}

float constructRuneDistance(vec2 point) {
  vec2 p = abs(point);
  float outer = abs(max(p.x * 0.82 + p.y * 0.58, p.y) - 0.54);
  float middle = abs(max(p.x * 0.92 + p.y * 0.48, p.y) - 0.35);
  float inner = abs(max(p.x + p.y * 0.42, p.y) - 0.17);
  return min(outer, min(middle, inner));
}

vec4 constructSampleSurface() {
  vec3 seedOffset = vec3(constructSurface0.y * 19.19, constructSurface0.y * 7.73,
    constructSurface0.y * 31.07);
  vec3 p = vConstructObjectPosition + seedOffset;
  float low = constructValueNoise(p * ${PROCEDURAL_STONE_V1.lowFrequencyPerM.toFixed(6)});
  float high = constructValueNoise(p * ${PROCEDURAL_STONE_V1.highFrequencyPerM.toFixed(6)});
  float crack = constructCrackRidge(p * ${PROCEDURAL_STONE_V1.crackFrequencyPerM.toFixed(6)});
  float wear = clamp((${PROCEDURAL_DAMAGE_WEAR_V1.beginsBelowHealthRatio.toFixed(6)} - constructSurface0.z) /
    ${(PROCEDURAL_DAMAGE_WEAR_V1.beginsBelowHealthRatio - PROCEDURAL_DAMAGE_WEAR_V1.maximumAtHealthRatio).toFixed(6)}, 0.0, 1.0);
  float front = step(0.72, normalize(vConstructObjectNormal).z) * step(0.5, constructSurface0.w);
  vec2 face = vConstructObjectPosition.xy / max(constructSurfaceExtents.xy * 0.5, vec2(0.001));
  float relief = front * (1.0 - smoothstep(0.018, 0.055, constructRuneDistance(face)));
  return vec4(low * 0.68 + high * 0.32, clamp(crack + wear * high * 0.55, 0.0, 1.0), relief, wear);
}
#endif
`;

export const CONSTRUCT_PROCEDURAL_GLSL = Object.freeze({
  vertex: Object.freeze({
    CUSTOM_VERTEX_DEFINITIONS: `
#ifdef CONSTRUCT_PROCEDURAL
varying vec3 vConstructObjectPosition;
varying vec3 vConstructObjectNormal;
#endif`,
    CUSTOM_VERTEX_UPDATE_NORMAL: `
#ifdef CONSTRUCT_PROCEDURAL
vConstructObjectPosition = positionUpdated;
#ifdef NORMAL
vConstructObjectNormal = normalUpdated;
#else
vConstructObjectNormal = vec3(0.0, 0.0, 1.0);
#endif
#endif`,
  }),
  fragment: Object.freeze({
    CUSTOM_FRAGMENT_DEFINITIONS: GLSL_DEFINITIONS,
    CUSTOM_FRAGMENT_UPDATE_ALBEDO: `
#ifdef CONSTRUCT_PROCEDURAL
vec4 constructAlbedoSample = constructSampleSurface();
if (constructSurface0.x < 1.5) {
  float stoneShade = mix(0.78, 1.08, constructAlbedoSample.x);
  surfaceAlbedo *= stoneShade;
  surfaceAlbedo *= 1.0 - constructAlbedoSample.y *
    (0.12 + constructAlbedoSample.w * ${PROCEDURAL_DAMAGE_WEAR_V1.crackDarkeningMax.toFixed(6)});
  surfaceAlbedo += vec3(constructAlbedoSample.w * (1.0 - constructAlbedoSample.y) *
    ${PROCEDURAL_DAMAGE_WEAR_V1.freshEdgeLighteningMax.toFixed(6)});
  surfaceAlbedo *= 1.0 - constructAlbedoSample.z * 0.20;
} else if (constructSurface0.x < 2.5) {
  float bronzeNoise = constructAlbedoSample.x;
  float oxidation = smoothstep(0.72, 0.96, constructValueNoise(vConstructObjectPosition * 6.3 + constructSurface0.y));
  surfaceAlbedo *= mix(0.70, 1.05, bronzeNoise) * mix(1.0, 0.78, oxidation * 0.22);
} else if (constructSurface0.x > 2.5) {
  surfaceAlbedo *= mix(0.76, 1.02, constructAlbedoSample.x) * (1.0 - constructAlbedoSample.z * 0.24);
}
#endif`,
    CUSTOM_FRAGMENT_BEFORE_LIGHTS: `
#ifdef CONSTRUCT_PROCEDURAL
vec4 constructNormalSample = constructSampleSurface();
float constructHeight = constructNormalSample.x - constructNormalSample.y * 0.34 - constructNormalSample.z * 0.22;
float constructNormalStrength = ${PROCEDURAL_STONE_V1.normalStrength.toFixed(6)} +
  constructNormalSample.w * ${PROCEDURAL_DAMAGE_WEAR_V1.normalIncreaseMax.toFixed(6)};
vec3 constructSigmaX = dFdx(vPositionW);
vec3 constructSigmaY = dFdy(vPositionW);
vec3 constructR1 = cross(constructSigmaY, normalW);
vec3 constructR2 = cross(normalW, constructSigmaX);
float constructDet = dot(constructSigmaX, constructR1);
vec3 constructGradient = sign(constructDet) *
  (dFdx(constructHeight) * constructR1 + dFdy(constructHeight) * constructR2);
normalW = normalize(normalW - constructGradient * constructNormalStrength);
#endif`,
    CUSTOM_FRAGMENT_UPDATE_METALLICROUGHNESS: `
#ifdef CONSTRUCT_PROCEDURAL
vec4 constructRoughnessSample = constructSampleSurface();
if (constructSurface0.x < 1.5) {
  metallicRoughness.r = 0.0;
  metallicRoughness.g = clamp(mix(${PROCEDURAL_STONE_V1.roughnessMin.toFixed(6)},
    ${PROCEDURAL_STONE_V1.roughnessMax.toFixed(6)}, constructRoughnessSample.x) +
    constructRoughnessSample.z * 0.02, ${PROCEDURAL_STONE_V1.roughnessMin.toFixed(6)},
    ${PROCEDURAL_STONE_V1.roughnessMax.toFixed(6)});
} else if (constructSurface0.x < 2.5) {
  metallicRoughness.r = max(metallicRoughness.r, 0.80);
  metallicRoughness.g = clamp(mix(0.34, 0.58, constructRoughnessSample.x), 0.34, 0.58);
} else if (constructSurface0.x > 2.5) {
  metallicRoughness.r = max(metallicRoughness.r, 0.38);
  metallicRoughness.g = clamp(mix(0.48, 0.72, constructRoughnessSample.x), 0.48, 0.72);
}
#endif`,
  }),
});

export class ConstructProceduralSurfacePlugin extends MaterialPluginBase {
  readonly family: ConstructShaderSurfaceFamily;
  readonly audit: ConstructSurfaceAudit;

  constructor(material: PBRMaterial, family: ConstructShaderSurfaceFamily, audit: ConstructSurfaceAudit) {
    super(material, "ConstructProceduralSurface", 180, { CONSTRUCT_PROCEDURAL: false });
    this.family = family;
    this.audit = audit;
    const siblings = pluginsByAudit.get(audit) ?? new Set<ConstructProceduralSurfacePlugin>();
    siblings.add(this);
    pluginsByAudit.set(audit, siblings);
    this.doNotSerialize = true;
    this._enable(true);
  }

  override getClassName(): string { return "ConstructProceduralSurfacePlugin"; }

  override isCompatible(shaderLanguage: ShaderLanguage): boolean {
    return shaderLanguage === ShaderLanguage.GLSL || this.audit.effective === "mapped-pbr";
  }

  override prepareDefines(defines: MaterialDefines): void {
    (defines as MaterialDefines & { CONSTRUCT_PROCEDURAL: boolean }).CONSTRUCT_PROCEDURAL =
      this.audit.effective === "procedural-pbr";
  }

  override addFallbacks(defines: MaterialDefines, fallbacks: EffectFallbacks, currentRank: number): number {
    if ((defines as MaterialDefines & { CONSTRUCT_PROCEDURAL?: boolean }).CONSTRUCT_PROCEDURAL) {
      fallbacks.addFallback(currentRank, "CONSTRUCT_PROCEDURAL");
      return currentRank + 1;
    }
    return currentRank;
  }

  override getUniforms(): { ubo: { name: string; size: number; type: string }[] } {
    return { ubo: [
      { name: "constructSurface0", size: 4, type: "vec4" },
      { name: "constructSurfaceExtents", size: 3, type: "vec3" },
    ] };
  }

  override getCustomCode(shaderType: string, shaderLanguage = ShaderLanguage.GLSL): null | Record<string, string> {
    if (shaderLanguage !== ShaderLanguage.GLSL) return null;
    if (shaderType === "vertex") return CONSTRUCT_PROCEDURAL_GLSL.vertex;
    if (shaderType === "fragment") return CONSTRUCT_PROCEDURAL_GLSL.fragment;
    return null;
  }

  override bindForSubMesh(uniformBuffer: UniformBuffer, _scene: Scene, _engine: AbstractEngine,
    subMesh: SubMesh): void {
    const effectDefines = subMesh.effect?.defines;
    if (this.audit.requested === "procedural-pbr" && this.audit.effective === "procedural-pbr" &&
        typeof effectDefines === "string" && !effectDefines.includes("#define CONSTRUCT_PROCEDURAL")) {
      const state = this.audit as { effective: ConstructSurfaceMode; reason: string | null };
      state.effective = "mapped-pbr";
      state.reason = "procedural-pbr shader compilation fell back to mapped-pbr";
      for (const plugin of pluginsByAudit.get(this.audit) ?? [this]) plugin.markAllDefinesAsDirty();
    }
    const mesh = subMesh.getMesh();
    const binding = mesh.metadata?.constructSurfaceBinding as ConstructSurfaceBinding | undefined;
    const healthRatio = Number.isFinite(binding?.healthRatio) ? Math.max(0, Math.min(1, binding?.healthRatio ?? 1)) : 1;
    uniformBuffer.updateFloat4("constructSurface0", FAMILY[this.family], binding?.seed ?? 0,
      healthRatio, binding?.relief === "core-front" ? 1 : 0);
    const extents = binding?.extentsM ?? [1, 1, 1];
    uniformBuffer.updateFloat3("constructSurfaceExtents",
      Math.max(0.001, extents[0]), Math.max(0.001, extents[1]), Math.max(0.001, extents[2]));
  }

  override dispose(forceDisposeTextures?: boolean): void {
    const siblings = pluginsByAudit.get(this.audit);
    siblings?.delete(this);
    if (siblings?.size === 0) pluginsByAudit.delete(this.audit);
    super.dispose(forceDisposeTextures);
  }
}

export function attachConstructProceduralSurface(
  material: PBRMaterial,
  family: ConstructShaderSurfaceFamily,
  requested: ConstructSurfaceMode,
  sharedAudit?: ConstructSurfaceAudit,
): ConstructProceduralSurfacePlugin {
  // The public fields are read-only, while the plugin retains one private mutation: an actual
  // EffectFallbacks reduction discovered at bind time must become visible in diagnostics.
  const audit = sharedAudit ?? { ...selectConstructSurfaceMode(requested,
    constructSurfaceCapabilities(material.getScene().getEngine())) };
  return new ConstructProceduralSurfacePlugin(material, family, audit);
}
