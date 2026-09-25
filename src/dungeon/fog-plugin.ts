import { Constants } from "@babylonjs/core/Engines/constants.js";
import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine.js";
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture.js";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture.js";
import type { MaterialDefines } from "@babylonjs/core/Materials/materialDefines.js";
import { MaterialPluginBase } from "@babylonjs/core/Materials/materialPluginBase.js";
import type { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial.js";
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage.js";
import type { UniformBuffer } from "@babylonjs/core/Materials/uniformBuffer.js";
import type { SubMesh } from "@babylonjs/core/Meshes/subMesh.js";
import type { Scene } from "@babylonjs/core/scene.js";
import { FOG_SAMPLE, WALL_HEIGHT, fadeDepth, fogMask } from "./fog.ts";
import type { DungeonMap, Point } from "./map.ts";

/** Set by eye, and judged on the owner's machine. */
export const FOG_LOOK = Object.freeze({
  /** What remembered ground and walls darken toward, in linear light: a cold near-black, plus a share of the
   * surface's own lit brightness so that remembered stone stays readable. */
  memory: Object.freeze([0.035, 0.04, 0.05] as const),
  memoryLuminance: 0.18,
  /** How far to either side of the hero's column, in the `x - z` units the cut-away is measured in (sqrt 2 per
   * metre across the view), a wall in front of the hero opens. */
  sideMargin: 3.5,
  /** The share of an opened wall's pixels dropped, by a 4x4 ordered dither: 13 of 16. The boxes it replaces
   * were drawn at 0.16 opacity. */
  dither: 0.8,
});

/**
 * What a textured floor or wall does to its own albedo, set by eye and judged on the owner's machine. A 1k map
 * repeats every 2 or 3 m, and at the widest zoom that is a grid the eye finds at once: a two-octave value noise of
 * world position, at spans that share no multiple with the map's, varies the brightness under it. A per-cell UV
 * rotation would do it too, and would put a mip seam on every cell edge.
 */
export const STONE_LOOK = Object.freeze({
  /** Albedo is multiplied by between these, by noise at these two spans, weighted 0.65 and 0.35. */
  vary: Object.freeze([0.78, 1.08] as const), spans: Object.freeze([7, 2.3] as const),
  /** A wall's foot darkens to this share of its albedo, rising to full over this height. */
  foot: 0.55, footRise: 0.9,
  /** Damp grime, a near-black green, in patches up to this height at most. */
  grime: Object.freeze([0.018, 0.024, 0.012] as const), grimeHeight: 0.6, grimeStrength: 0.7,
  /** A wall's top is darker than its face, and the face's top edge is lit: the concepts' coping, without geometry. */
  top: 0.6, copingDepth: 0.06, coping: 1.6,
});

/** Which stone rules a material's fragments follow: a floor's, a wall's, or none (flat colour, and doors). */
export type StoneRole = "floor" | "wall" | null;

interface FogView { size: number; hero: Point; depth: number; texture: RawTexture }

const f = (v: number) => v.toFixed(3);

// The uniforms are **not** declared here: `getUniforms` puts them in the material's uniform buffer, and Babylon
// declares that itself; a second declaration is a GLSL redefinition (see `procedural-surface.ts`). Its `fragment`
// declarations are used only where there are no uniform buffers. A sampler is not in the buffer, so it is
// declared. The discards come first in `main`, before any lighting is paid for, and before the prepass writes, so
// an unexplored or cut-away pixel leaves no trace in the ambient occlusion either.
// The mask is read as `FOG_SAMPLE` says, and `fogSample` in `fog.ts` is the same rule on the CPU: change both.
// `texelFetch` and a one-channel texture need WebGL2, as SSAO2 does.
const FRAGMENT = Object.freeze({
  CUSTOM_FRAGMENT_DEFINITIONS: `
#ifdef DUNGEON_FOG
uniform sampler2D fogMaskSampler;
float dungeonBayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
float dungeonBayer4(vec2 a) { return dungeonBayer2(0.5 * a) * 0.25 + dungeonBayer2(a); }
#ifdef DUNGEON_STONE
float dungeonHash(vec2 c) { return fract(sin(dot(c, vec2(127.1, 311.7))) * 43758.5453); }
float dungeonNoise(vec2 p) {
  vec2 i = floor(p), u = fract(p); u = u * u * (3.0 - 2.0 * u);
  return mix(mix(dungeonHash(i), dungeonHash(i + vec2(1.0, 0.0)), u.x), mix(dungeonHash(i + vec2(0.0, 1.0)), dungeonHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
#endif
#endif
`,
  // After the albedo map is read and before any light: `surfaceAlbedo` is linear, and every light sees the change.
  CUSTOM_FRAGMENT_UPDATE_ALPHA: `
#if defined(DUNGEON_FOG) && defined(DUNGEON_STONE)
float dungeonVary = 0.65 * dungeonNoise(vPositionW.xz / ${f(STONE_LOOK.spans[0])}) + 0.35 * dungeonNoise(vPositionW.xz / ${f(STONE_LOOK.spans[1])} + 17.0);
surfaceAlbedo *= mix(${f(STONE_LOOK.vary[0])}, ${f(STONE_LOOK.vary[1])}, dungeonVary);
#ifdef DUNGEON_WALL
surfaceAlbedo *= mix(${f(STONE_LOOK.foot)}, 1.0, smoothstep(0.0, ${f(STONE_LOOK.footRise)}, vPositionW.y));
float dungeonGrime = (1.0 - smoothstep(0.0, ${f(STONE_LOOK.grimeHeight)} * (0.4 + 0.6 * dungeonVary), vPositionW.y))
  * smoothstep(0.35, 0.75, dungeonNoise(vPositionW.xz / 1.3 + 5.0));
surfaceAlbedo = mix(surfaceAlbedo, vec3(${STONE_LOOK.grime.map(f).join(", ")}), ${f(STONE_LOOK.grimeStrength)} * dungeonGrime);
#ifdef NORMAL
if (vNormalW.y > 0.5) surfaceAlbedo *= ${f(STONE_LOOK.top)};
else if (vPositionW.y > ${f(WALL_HEIGHT - STONE_LOOK.copingDepth)}) surfaceAlbedo = min(surfaceAlbedo * ${f(STONE_LOOK.coping)}, vec3(1.0));
#endif
#endif
#endif
`,
  CUSTOM_FRAGMENT_MAIN_BEGIN: `
#ifdef DUNGEON_FOG
#ifdef NORMAL
vec2 dungeonAt = vPositionW.xz - ${FOG_SAMPLE.pull.toFixed(3)} * vNormalW.xz;
#else
vec2 dungeonAt = vPositionW.xz;
#endif
ivec2 dungeonCell = clamp(ivec2(floor(dungeonAt + 0.5)), ivec2(0), ivec2(int(fogBand.w) - 1));
if (texelFetch(fogMaskSampler, dungeonCell, 0).r < ${FOG_SAMPLE.drawnFrom.toFixed(3)}) discard;
float dungeonFog = texture2D(fogMaskSampler, (dungeonAt + 0.5) / fogBand.w).r;
vec2 dungeonAhead = vPositionW.xz - fogHero;
float dungeonAlong = dungeonAhead.x + dungeonAhead.y;
if (vPositionW.y > 0.05 && dungeonAlong > 0.0 && dungeonAlong < fogBand.x &&
    abs(dungeonAhead.x - dungeonAhead.y) < fogBand.y && dungeonBayer4(gl_FragCoord.xy) < fogBand.z) discard;
#endif
`,
  // After the material's own image processing: in linear light while `forgePost` does that processing, as it does
  // unless the look probe switches post-processing off.
  CUSTOM_FRAGMENT_BEFORE_FRAGCOLOR: `
#ifdef DUNGEON_FOG
float dungeonLuma = dot(finalColor.rgb, vec3(0.2126, 0.7152, 0.0722));
finalColor.rgb = mix(vec3(${FOG_LOOK.memory.join(", ")}) + ${FOG_LOOK.memoryLuminance.toFixed(3)} * dungeonLuma, finalColor.rgb,
  smoothstep(0.5, 1.0, dungeonFog));
#endif
`,
});

/**
 * Fog-of-war on a dungeon surface, read from a mask texture of one byte per cell (`fogMask`), and the cut-away
 * of walls in front of the hero. Attached to each dungeon material by `dungeonFog`, never registered globally,
 * so no golem ever carries it. Node loads this file with `world.ts`: no parameter properties, nothing page-only.
 */
export class DungeonFogPlugin extends MaterialPluginBase {
  readonly view: FogView;

  readonly stone: StoneRole;

  constructor(material: PBRMaterial, view: FogView, stone: StoneRole = null) {
    super(material, "DungeonFog", 200, { DUNGEON_FOG: false, DUNGEON_STONE: false, DUNGEON_WALL: false });
    this.view = view; this.stone = stone;
    this.doNotSerialize = true;
    this._enable(true);
  }

  override getClassName(): string { return "DungeonFogPlugin"; }
  override isCompatible(shaderLanguage: ShaderLanguage): boolean { return shaderLanguage === ShaderLanguage.GLSL; }
  override prepareDefines(defines: MaterialDefines): void {
    const own = defines as MaterialDefines & { DUNGEON_FOG: boolean; DUNGEON_STONE: boolean; DUNGEON_WALL: boolean };
    own.DUNGEON_FOG = true; own.DUNGEON_STONE = this.stone !== null; own.DUNGEON_WALL = this.stone === "wall";
  }
  override getSamplers(samplers: string[]): void { samplers.push("fogMaskSampler"); }
  override getActiveTextures(activeTextures: BaseTexture[]): void { activeTextures.push(this.view.texture); }
  override hasTexture(texture: BaseTexture): boolean { return texture === this.view.texture; }
  override getUniforms(): { ubo: { name: string; size: number; type: string }[]; fragment: string } {
    return { ubo: [{ name: "fogHero", size: 2, type: "vec2" }, { name: "fogBand", size: 4, type: "vec4" }],
      // Read only where there are no uniform buffers.
      fragment: "#ifdef DUNGEON_FOG\nuniform vec2 fogHero;\nuniform vec4 fogBand;\n#endif\n" };
  }
  override getCustomCode(shaderType: string, shaderLanguage = ShaderLanguage.GLSL): null | Record<string, string> {
    return shaderType === "fragment" && shaderLanguage === ShaderLanguage.GLSL ? FRAGMENT : null;
  }
  override bindForSubMesh(uniformBuffer: UniformBuffer, _scene: Scene, _engine: AbstractEngine, _subMesh: SubMesh): void {
    const { hero, depth, size, texture } = this.view;
    uniformBuffer.updateFloat2("fogHero", hero.x, hero.z);
    uniformBuffer.updateFloat4("fogBand", depth, FOG_LOOK.sideMargin, FOG_LOOK.dither, size);
    uniformBuffer.setTexture("fogMaskSampler", texture);
  }
}

/** One mask texture for a level, and the plugin on each material that reads it. */
export function dungeonFog(scene: Scene, map: DungeonMap) {
  const bytes = new Uint8Array(map.size * map.size);
  // Bilinear, so fog edges are soft; no mipmaps, since a level is drawn at one scale; clamped at the rim.
  const texture = RawTexture.CreateRTexture(bytes, map.size, map.size, scene, false, false,
    Constants.TEXTURE_BILINEAR_SAMPLINGMODE, Constants.TEXTURETYPE_UNSIGNED_BYTE);
  texture.name = "dungeon fog mask";
  texture.wrapU = texture.wrapV = Constants.TEXTURE_CLAMP_ADDRESSMODE;
  const view: FogView = { size: map.size, hero: { x: map.start.x, z: map.start.z }, depth: fadeDepth(Math.PI / 6), texture };
  const plugins: DungeonFogPlugin[] = [];
  return {
    texture, bytes, plugins,
    attach(material: PBRMaterial, stone: StoneRole = null): DungeonFogPlugin {
      const plugin = new DungeonFogPlugin(material, view, stone); plugins.push(plugin); return plugin;
    },
    update(visible: ReadonlySet<number>, explored: ReadonlySet<number>, pitch: number): void {
      fogMask(map, visible, explored, bytes); texture.update(bytes); view.depth = fadeDepth(pitch);
    },
    setHero(hero: Point): void { view.hero.x = hero.x; view.hero.z = hero.z; },
    dispose(): void { texture.dispose(); },
  };
}
