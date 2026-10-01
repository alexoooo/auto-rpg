import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Effect } from "@babylonjs/core/Materials/effect.js";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import type { Scene } from "@babylonjs/core/scene.js";
import "../render/fire.ts";
import { cutAway } from "./fog.ts";
import { CAMERA_AZIMUTH, cameraToward } from "./camera.ts";
import type { Point } from "./map.ts";

/**
 * The flame (`flame` in `src/render/fire.ts`) times a `fade`, so a torch inside the cut-away ghosts with the wall
 * and sconce behind it rather than floating in front of a hole. Derived from that shader's text rather than copied,
 * and refused at load if the text has moved, so `flame` stays the one source of the flame.
 *
 * The fade scales the colour as well as the alpha. The flame's core is HDR, about (5, 2, 0.28), and blending adds
 * colour times alpha: a flame faded by its alpha alone still tone-maps to a bright core and only loses its bloom, so
 * it reads as dimmer rather than see-through. Scaling both fades it as the wall beside it fades.
 */
const HEAD = "varying vec2 vUV; uniform float time;", TAIL = "gl_FragColor=vec4(c,a*.82);}";
const flame = Effect.ShadersStore.flameFragmentShader;
if (!flame.includes(HEAD) || !flame.endsWith(TAIL)) throw new Error("dungeon fire: flame has changed; derive the fade again");
Effect.ShadersStore.dungeonFireFragmentShader = flame.replace(HEAD, `${HEAD} uniform float fade; uniform vec3 tint;`)
  .slice(0, -TAIL.length) + "gl_FragColor=vec4(c*fade*tint,a*.82*fade);}";

/** Which shaders a dungeon flame draws with: the flame's vertex, the fading fragment. */
export const DUNGEON_FIRE = Object.freeze({ vertex: "flame", fragment: "dungeonFire" });

/**
 * The one material every torch's flame draws with, and each flame's own fade. The fade is written as a flame binds:
 * `ShaderMaterial.bind` always ends by notifying `onBindObservable` with the mesh, even when it skipped re-uploading
 * the material's own uniforms. It is never written through `material.setFloat`, whose value would be re-bound over
 * the flame's whenever the material rebinds. A flame with no fade set is drawn whole.
 */
export function flameMaterial(scene: Scene) {
  const material = new ShaderMaterial("dungeon.fire", scene, DUNGEON_FIRE, {
    attributes: ["position", "uv"], uniforms: ["worldViewProjection", "time", "fade", "tint"], needAlphaBlending: true,
  });
  material.backFaceCulling = false; material.disableDepthWrite = true;
  const fades = new Map<AbstractMesh, number>();
  const tints = new Map<AbstractMesh, Color3>(), white=Color3.White();
  const binding = material.onBindObservable.add(mesh => {
    material.getEffect()?.setFloat("fade", fades.get(mesh) ?? 1);
    material.getEffect()?.setColor3("tint", tints.get(mesh) ?? white);
  });
  return {
    material,
    setTint(flame: AbstractMesh, color: Color3): void { tints.set(flame,color); },
    setFade(flame: AbstractMesh, fade: number): void { fades.set(flame, fade); },
    dispose(): void { material.onBindObservable.remove(binding); },
  };
}

/** How much of a flame at `at` is drawn: what the cut-away leaves of a wall there. */
export const flameFade = (hero: Point, at: { x: number; y: number; z: number }, pitch: number,
  toward: Point = cameraToward(CAMERA_AZIMUTH)): number => 1 - cutAway(hero, at, pitch, toward);
