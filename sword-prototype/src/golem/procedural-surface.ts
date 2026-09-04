import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine.js";
import type { EffectFallbacks } from "@babylonjs/core/Materials/effectFallbacks.js";
import type { MaterialDefines } from "@babylonjs/core/Materials/materialDefines.js";
import { MaterialPluginBase } from "@babylonjs/core/Materials/materialPluginBase.js";
import type { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial.js";
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage.js";
import type { UniformBuffer } from "@babylonjs/core/Materials/uniformBuffer.js";
import type { SubMesh } from "@babylonjs/core/Meshes/subMesh.js";
import type { Scene } from "@babylonjs/core/scene.js";

/**
 * Salvaged from the deleted `src/construct/procedural-surface.ts` on 2026-09-04. The shader,
 * its two frozen constant blocks and the mapped-PBR fallback survive unchanged; the blueprint
 * coupling does not. The binding a mesh carries used to be declared in the construct renderer
 * and keyed by a blueprint part id -- it is declared here now and keyed by plain strings, so a
 * golem module can seed its own shell without a body-description format existing at all.
 */
export interface GolemSurfaceBinding {
  /** Free-form: a module names its own kinds. Nothing switches on this. */
  readonly targetKind: string;
  readonly targetId: string;
  readonly primitiveId: string;
  readonly seed: number;
  readonly extentsM: readonly [number, number, number];
  readonly relief: "none" | "core-front";
  healthRatio: number;
}

/** FNV-1a over authored semantic names. Build order, side and mutable health never enter. */
export function golemSurfaceSeed(...semanticIds: readonly string[]): number {
  let value = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(semanticIds.join("\0"))) {
    value ^= byte;
    value = Math.imul(value, 0x01000193);
  }
  return (value >>> 0) / 0xffffffff;
}

export const GOLEM_PROCEDURAL_SURFACE_VERSION = 1 as const;
export type GolemSurfaceMode = "procedural-pbr" | "mapped-pbr";

export interface GolemSurfaceAudit {
  readonly requested: GolemSurfaceMode;
  readonly effective: GolemSurfaceMode;
  readonly reason: string | null;
  readonly shaderVersion: 1;
}

export interface GolemSurfaceCapabilities {
  readonly glsl: boolean;
  readonly highPrecision: boolean;
  readonly derivatives: boolean;
}

export const DEFAULT_GOLEM_SURFACE_MODE: GolemSurfaceMode = "mapped-pbr";

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

export function selectGolemSurfaceMode(
  requested: GolemSurfaceMode,
  capabilities: GolemSurfaceCapabilities,
): GolemSurfaceAudit {
  if (requested === "mapped-pbr") return Object.freeze({ requested, effective: requested, reason: null,
    shaderVersion: GOLEM_PROCEDURAL_SURFACE_VERSION });
  const reason = !capabilities.glsl
    ? "procedural-pbr requires the pinned GLSL shader path"
    : !capabilities.highPrecision
      ? "procedural-pbr requires high-precision vertex and fragment shaders"
      : !capabilities.derivatives
        ? "procedural-pbr requires standard derivatives"
        : null;
  return Object.freeze({ requested, effective: reason === null ? requested : "mapped-pbr", reason,
    shaderVersion: GOLEM_PROCEDURAL_SURFACE_VERSION });
}

export function golemSurfaceCapabilities(engine: AbstractEngine): GolemSurfaceCapabilities {
  const caps = engine.getCaps();
  return Object.freeze({
    glsl: !engine.isWebGPU,
    highPrecision: caps.highPrecisionShaderSupported === true,
    derivatives: caps.standardDerivatives === true,
  });
}

export type GolemShaderSurfaceFamily = "stone" | "bronze" | "plain" | "rune";

const FAMILY = Object.freeze({ plain: 0, stone: 1, bronze: 2, rune: 3 } satisfies
  Record<GolemShaderSurfaceFamily, number>);

// One audit object is the palette's fallback authority. Keep the sibling plugins reachable from
// that object so one effect reduction invalidates every already-compiled material, not merely the
// material whose bind happened to discover the reduction first.
const pluginsByAudit = new WeakMap<object, Set<GolemProceduralSurfacePlugin>>();

const GLSL_DEFINITIONS = `
#ifdef GOLEM_PROCEDURAL
varying vec3 vGolemObjectPosition;
varying vec3 vGolemObjectNormal;
uniform vec4 golemSurface0;
uniform vec3 golemSurfaceExtents;

float golemHash(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}

float golemValueNoise(vec3 p) {
  vec3 cell = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(golemHash(cell), golemHash(cell + vec3(1.0, 0.0, 0.0)), f.x),
                 mix(golemHash(cell + vec3(0.0, 1.0, 0.0)), golemHash(cell + vec3(1.0, 1.0, 0.0)), f.x), f.y),
             mix(mix(golemHash(cell + vec3(0.0, 0.0, 1.0)), golemHash(cell + vec3(1.0, 0.0, 1.0)), f.x),
                 mix(golemHash(cell + vec3(0.0, 1.0, 1.0)), golemHash(cell + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
}

vec3 golemHash3(vec3 p) {
  return vec3(golemHash(p), golemHash(p + vec3(17.0, 59.0, 113.0)),
    golemHash(p + vec3(43.0, 97.0, 29.0)));
}

float golemCrackRidge(vec3 p) {
  vec3 cell = floor(p);
  vec3 local = fract(p);
  float nearest = 8.0;
  float secondNearest = 8.0;
  for (int z = -1; z <= 1; z++) {
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec3 neighbour = vec3(float(x), float(y), float(z));
        float distanceToCell = length(neighbour + golemHash3(cell + neighbour) - local);
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

float golemRuneDistance(vec2 point) {
  vec2 p = abs(point);
  float outer = abs(max(p.x * 0.82 + p.y * 0.58, p.y) - 0.54);
  float middle = abs(max(p.x * 0.92 + p.y * 0.48, p.y) - 0.35);
  float inner = abs(max(p.x + p.y * 0.42, p.y) - 0.17);
  return min(outer, min(middle, inner));
}

vec4 golemSampleSurface() {
  vec3 seedOffset = vec3(golemSurface0.y * 19.19, golemSurface0.y * 7.73,
    golemSurface0.y * 31.07);
  vec3 p = vGolemObjectPosition + seedOffset;
  float low = golemValueNoise(p * ${PROCEDURAL_STONE_V1.lowFrequencyPerM.toFixed(6)});
  float high = golemValueNoise(p * ${PROCEDURAL_STONE_V1.highFrequencyPerM.toFixed(6)});
  float crack = golemCrackRidge(p * ${PROCEDURAL_STONE_V1.crackFrequencyPerM.toFixed(6)});
  float wear = clamp((${PROCEDURAL_DAMAGE_WEAR_V1.beginsBelowHealthRatio.toFixed(6)} - golemSurface0.z) /
    ${(PROCEDURAL_DAMAGE_WEAR_V1.beginsBelowHealthRatio - PROCEDURAL_DAMAGE_WEAR_V1.maximumAtHealthRatio).toFixed(6)}, 0.0, 1.0);
  float front = step(0.72, normalize(vGolemObjectNormal).z) * step(0.5, golemSurface0.w);
  vec2 face = vGolemObjectPosition.xy / max(golemSurfaceExtents.xy * 0.5, vec2(0.001));
  float relief = front * (1.0 - smoothstep(0.018, 0.055, golemRuneDistance(face)));
  return vec4(low * 0.68 + high * 0.32, clamp(crack + wear * high * 0.55, 0.0, 1.0), relief, wear);
}
#endif
`;

export const GOLEM_PROCEDURAL_GLSL = Object.freeze({
  vertex: Object.freeze({
    CUSTOM_VERTEX_DEFINITIONS: `
#ifdef GOLEM_PROCEDURAL
varying vec3 vGolemObjectPosition;
varying vec3 vGolemObjectNormal;
#endif`,
    CUSTOM_VERTEX_UPDATE_NORMAL: `
#ifdef GOLEM_PROCEDURAL
vGolemObjectPosition = positionUpdated;
#ifdef NORMAL
vGolemObjectNormal = normalUpdated;
#else
vGolemObjectNormal = vec3(0.0, 0.0, 1.0);
#endif
#endif`,
  }),
  fragment: Object.freeze({
    CUSTOM_FRAGMENT_DEFINITIONS: GLSL_DEFINITIONS,
    CUSTOM_FRAGMENT_UPDATE_ALBEDO: `
#ifdef GOLEM_PROCEDURAL
vec4 golemAlbedoSample = golemSampleSurface();
if (golemSurface0.x < 1.5) {
  float stoneShade = mix(0.78, 1.08, golemAlbedoSample.x);
  surfaceAlbedo *= stoneShade;
  surfaceAlbedo *= 1.0 - golemAlbedoSample.y *
    (0.12 + golemAlbedoSample.w * ${PROCEDURAL_DAMAGE_WEAR_V1.crackDarkeningMax.toFixed(6)});
  surfaceAlbedo += vec3(golemAlbedoSample.w * (1.0 - golemAlbedoSample.y) *
    ${PROCEDURAL_DAMAGE_WEAR_V1.freshEdgeLighteningMax.toFixed(6)});
  surfaceAlbedo *= 1.0 - golemAlbedoSample.z * 0.20;
} else if (golemSurface0.x < 2.5) {
  float bronzeNoise = golemAlbedoSample.x;
  float oxidation = smoothstep(0.72, 0.96, golemValueNoise(vGolemObjectPosition * 6.3 + golemSurface0.y));
  surfaceAlbedo *= mix(0.70, 1.05, bronzeNoise) * mix(1.0, 0.78, oxidation * 0.22);
} else if (golemSurface0.x > 2.5) {
  surfaceAlbedo *= mix(0.76, 1.02, golemAlbedoSample.x) * (1.0 - golemAlbedoSample.z * 0.24);
}
#endif`,
    CUSTOM_FRAGMENT_BEFORE_LIGHTS: `
#ifdef GOLEM_PROCEDURAL
vec4 golemNormalSample = golemSampleSurface();
float golemHeight = golemNormalSample.x - golemNormalSample.y * 0.34 - golemNormalSample.z * 0.22;
float golemNormalStrength = ${PROCEDURAL_STONE_V1.normalStrength.toFixed(6)} +
  golemNormalSample.w * ${PROCEDURAL_DAMAGE_WEAR_V1.normalIncreaseMax.toFixed(6)};
vec3 golemSigmaX = dFdx(vPositionW);
vec3 golemSigmaY = dFdy(vPositionW);
vec3 golemR1 = cross(golemSigmaY, normalW);
vec3 golemR2 = cross(normalW, golemSigmaX);
float golemDet = dot(golemSigmaX, golemR1);
vec3 golemGradient = sign(golemDet) *
  (dFdx(golemHeight) * golemR1 + dFdy(golemHeight) * golemR2);
normalW = normalize(normalW - golemGradient * golemNormalStrength);
#endif`,
    CUSTOM_FRAGMENT_UPDATE_METALLICROUGHNESS: `
#ifdef GOLEM_PROCEDURAL
vec4 golemRoughnessSample = golemSampleSurface();
if (golemSurface0.x < 1.5) {
  metallicRoughness.r = 0.0;
  metallicRoughness.g = clamp(mix(${PROCEDURAL_STONE_V1.roughnessMin.toFixed(6)},
    ${PROCEDURAL_STONE_V1.roughnessMax.toFixed(6)}, golemRoughnessSample.x) +
    golemRoughnessSample.z * 0.02, ${PROCEDURAL_STONE_V1.roughnessMin.toFixed(6)},
    ${PROCEDURAL_STONE_V1.roughnessMax.toFixed(6)});
} else if (golemSurface0.x < 2.5) {
  metallicRoughness.r = max(metallicRoughness.r, 0.80);
  metallicRoughness.g = clamp(mix(0.34, 0.58, golemRoughnessSample.x), 0.34, 0.58);
} else if (golemSurface0.x > 2.5) {
  metallicRoughness.r = max(metallicRoughness.r, 0.38);
  metallicRoughness.g = clamp(mix(0.48, 0.72, golemRoughnessSample.x), 0.48, 0.72);
}
#endif`,
  }),
});

export class GolemProceduralSurfacePlugin extends MaterialPluginBase {
  readonly family: GolemShaderSurfaceFamily;
  readonly audit: GolemSurfaceAudit;

  constructor(material: PBRMaterial, family: GolemShaderSurfaceFamily, audit: GolemSurfaceAudit) {
    super(material, "GolemProceduralSurface", 180, { GOLEM_PROCEDURAL: false });
    this.family = family;
    this.audit = audit;
    const siblings = pluginsByAudit.get(audit) ?? new Set<GolemProceduralSurfacePlugin>();
    siblings.add(this);
    pluginsByAudit.set(audit, siblings);
    this.doNotSerialize = true;
    this._enable(true);
  }

  override getClassName(): string { return "GolemProceduralSurfacePlugin"; }

  override isCompatible(shaderLanguage: ShaderLanguage): boolean {
    return shaderLanguage === ShaderLanguage.GLSL || this.audit.effective === "mapped-pbr";
  }

  override prepareDefines(defines: MaterialDefines): void {
    (defines as MaterialDefines & { GOLEM_PROCEDURAL: boolean }).GOLEM_PROCEDURAL =
      this.audit.effective === "procedural-pbr";
  }

  override addFallbacks(defines: MaterialDefines, fallbacks: EffectFallbacks, currentRank: number): number {
    if ((defines as MaterialDefines & { GOLEM_PROCEDURAL?: boolean }).GOLEM_PROCEDURAL) {
      fallbacks.addFallback(currentRank, "GOLEM_PROCEDURAL");
      return currentRank + 1;
    }
    return currentRank;
  }

  override getUniforms(): { ubo: { name: string; size: number; type: string }[] } {
    return { ubo: [
      { name: "golemSurface0", size: 4, type: "vec4" },
      { name: "golemSurfaceExtents", size: 3, type: "vec3" },
    ] };
  }

  override getCustomCode(shaderType: string, shaderLanguage = ShaderLanguage.GLSL): null | Record<string, string> {
    if (shaderLanguage !== ShaderLanguage.GLSL) return null;
    if (shaderType === "vertex") return GOLEM_PROCEDURAL_GLSL.vertex;
    if (shaderType === "fragment") return GOLEM_PROCEDURAL_GLSL.fragment;
    return null;
  }

  override bindForSubMesh(uniformBuffer: UniformBuffer, _scene: Scene, _engine: AbstractEngine,
    subMesh: SubMesh): void {
    const effectDefines = subMesh.effect?.defines;
    if (this.audit.requested === "procedural-pbr" && this.audit.effective === "procedural-pbr" &&
        typeof effectDefines === "string" && !effectDefines.includes("#define GOLEM_PROCEDURAL")) {
      const state = this.audit as { effective: GolemSurfaceMode; reason: string | null };
      state.effective = "mapped-pbr";
      state.reason = "procedural-pbr shader compilation fell back to mapped-pbr";
      for (const plugin of pluginsByAudit.get(this.audit) ?? [this]) plugin.markAllDefinesAsDirty();
    }
    const mesh = subMesh.getMesh();
    const binding = mesh.metadata?.golemSurfaceBinding as GolemSurfaceBinding | undefined;
    const healthRatio = Number.isFinite(binding?.healthRatio) ? Math.max(0, Math.min(1, binding?.healthRatio ?? 1)) : 1;
    uniformBuffer.updateFloat4("golemSurface0", FAMILY[this.family], binding?.seed ?? 0,
      healthRatio, binding?.relief === "core-front" ? 1 : 0);
    const extents = binding?.extentsM ?? [1, 1, 1];
    uniformBuffer.updateFloat3("golemSurfaceExtents",
      Math.max(0.001, extents[0]), Math.max(0.001, extents[1]), Math.max(0.001, extents[2]));
  }

  override dispose(forceDisposeTextures?: boolean): void {
    const siblings = pluginsByAudit.get(this.audit);
    siblings?.delete(this);
    if (siblings?.size === 0) pluginsByAudit.delete(this.audit);
    super.dispose(forceDisposeTextures);
  }
}

export function attachGolemProceduralSurface(
  material: PBRMaterial,
  family: GolemShaderSurfaceFamily,
  requested: GolemSurfaceMode,
  sharedAudit?: GolemSurfaceAudit,
): GolemProceduralSurfacePlugin {
  // The public fields are read-only, while the plugin retains one private mutation: an actual
  // EffectFallbacks reduction discovered at bind time must become visible in diagnostics.
  const audit = sharedAudit ?? { ...selectGolemSurfaceMode(requested,
    golemSurfaceCapabilities(material.getScene().getEngine())) };
  return new GolemProceduralSurfacePlugin(material, family, audit);
}
