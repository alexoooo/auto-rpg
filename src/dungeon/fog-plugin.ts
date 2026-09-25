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
import { FOG_SAMPLE, fadeDepth, fogMask } from "./fog.ts";
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

interface FogView { size: number; hero: Point; depth: number; texture: RawTexture }

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

  constructor(material: PBRMaterial, view: FogView) {
    super(material, "DungeonFog", 200, { DUNGEON_FOG: false });
    this.view = view;
    this.doNotSerialize = true;
    this._enable(true);
  }

  override getClassName(): string { return "DungeonFogPlugin"; }
  override isCompatible(shaderLanguage: ShaderLanguage): boolean { return shaderLanguage === ShaderLanguage.GLSL; }
  override prepareDefines(defines: MaterialDefines): void { (defines as MaterialDefines & { DUNGEON_FOG: boolean }).DUNGEON_FOG = true; }
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
    attach(material: PBRMaterial): DungeonFogPlugin { const plugin = new DungeonFogPlugin(material, view); plugins.push(plugin); return plugin; },
    update(visible: ReadonlySet<number>, explored: ReadonlySet<number>, pitch: number): void {
      fogMask(map, visible, explored, bytes); texture.update(bytes); view.depth = fadeDepth(pitch);
    },
    setHero(hero: Point): void { view.hero.x = hero.x; view.hero.z = hero.z; },
    dispose(): void { texture.dispose(); },
  };
}
