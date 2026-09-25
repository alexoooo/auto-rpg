import { Effect } from "@babylonjs/core/Materials/effect.js";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import type { Scene } from "@babylonjs/core/scene.js";
import "../forge-fire.ts";
import { cutAway } from "./fog.ts";
import type { Point } from "./map.ts";

/**
 * The forge's flame (`proofFire` in `src/forge-fire.ts`) times a `fade`, so a torch inside the cut-away ghosts with
 * the wall and sconce behind it rather than floating in front of a hole. Derived from the forge's text rather than
 * copied, and refused at load if that text has moved, so the arena's fire stays the one source of the flame.
 *
 * The fade scales the colour as well as the alpha. The flame's core is HDR, about (5, 2, 0.28), and blending adds
 * colour times alpha: a fifth of the alpha alone still tone-maps to a red core at about 80 % of its whole brightness,
 * and only loses its bloom, so it reads as dimmer rather than see-through. Scaling both leaves a twenty-fifth of the
 * light at the bubble's heart, beside a wall that keeps 3 of its 16 pixels.
 */
const HEAD = "varying vec2 vUV; uniform float time;", TAIL = "gl_FragColor=vec4(c,a*.82);}";
const forge = Effect.ShadersStore.proofFireFragmentShader;
if (!forge.includes(HEAD) || !forge.endsWith(TAIL)) throw new Error("dungeon fire: proofFire has changed; derive the fade again");
Effect.ShadersStore.dungeonFireFragmentShader = forge.replace(HEAD, `${HEAD} uniform float fade;`)
  .slice(0, -TAIL.length) + "gl_FragColor=vec4(c*fade,a*.82*fade);}";

/** Which shaders a dungeon flame draws with: the forge's vertex, the fading fragment. */
export const DUNGEON_FIRE = Object.freeze({ vertex: "proofFire", fragment: "dungeonFire" });

/**
 * The one material every torch's flame draws with, and each flame's own fade. The fade is written as a flame binds:
 * `ShaderMaterial.bind` always ends by notifying `onBindObservable` with the mesh, even when it skipped re-uploading
 * the material's own uniforms. It is never written through `material.setFloat`, whose value would be re-bound over
 * the flame's whenever the material rebinds. A flame with no fade set is drawn whole.
 */
export function flameMaterial(scene: Scene) {
  const material = new ShaderMaterial("dungeon.fire", scene, DUNGEON_FIRE, {
    attributes: ["position", "uv"], uniforms: ["worldViewProjection", "time", "fade"], needAlphaBlending: true,
  });
  material.backFaceCulling = false; material.disableDepthWrite = true;
  const fades = new Map<AbstractMesh, number>();
  const binding = material.onBindObservable.add(mesh => material.getEffect()?.setFloat("fade", fades.get(mesh) ?? 1));
  return {
    material,
    setFade(flame: AbstractMesh, fade: number): void { fades.set(flame, fade); },
    dispose(): void { material.onBindObservable.remove(binding); },
  };
}

/** How much of a flame at `at` is drawn: what the cut-away leaves of a wall there. */
export const flameFade = (hero: Point, at: { x: number; y: number; z: number }, pitch: number): number =>
  1 - cutAway(hero, at, pitch);
