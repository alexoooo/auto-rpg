import { ShaderStore } from "@babylonjs/core/Engines/shaderStore.js";
import "@babylonjs/core/Shaders/lightProxy.vertex.js";

const NAME = "lightProxyVertexShader";
/** The last line of the proxy's rectangle fit in Babylon 9.18.1's GLSL `lightProxy.vertex`. */
export const PROXY_ANCHOR = "projPosition=mix(position.xy,projPosition,greaterThan(cosSq,vec2(0.01)));";
/** An orthographic projection's last row is (0, 0, 0, 1), a perspective one's (0, 0, +-1, 0). */
export const PROXY_ORTHOGRAPHIC =
  "if(projection[3][3]>0.5){projPosition=(projection*vec4(viewPosition.xy+position.xy*range,viewPosition.z,1.0)).xy;}";

/**
 * A `ClusteredLightContainer` finds the screen tiles a light reaches by drawing a rectangle per light, and fits
 * that rectangle for a perspective camera: it takes the sphere's angular size, sin = range / distance, and turns
 * the light's view position by it, which is right only after a divide by w. Under the dungeon's orthographic
 * camera w is 1, so the rectangle comes out short by an amount that depends on the light's depth. Reviewed with
 * `frameDungeon`'s own matrices at pitch 30 and zoom 10, it cut 260 of 1428 on-screen lights short, one at 2.1 m
 * from the light, where it still gave four times the ambient. No single margin on `range` repairs a
 * depth-dependent error.
 *
 * Under an orthographic projection the exact rectangle is the view position plus and minus the range, projected,
 * and this adds that branch. The depth slices need nothing: the container assigns them from view depth plus and
 * minus the range, and a fragment finds its slice from its linear view depth.
 *
 * Only the GLSL shader is patched; the dungeon runs on WebGL. It must run before the container's proxy material
 * compiles, which `lightDungeon` does by calling it first. If a Babylon upgrade changes the anchor, this throws
 * rather than leaving the proxy unpatched, and `tests/dungeon-dressing.test.mjs` says so before the page does.
 */
export function orthographicLightProxy(): void {
  const source = ShaderStore.ShadersStore[NAME];
  if (source === undefined) throw new Error(`${NAME} is not registered.`);
  if (source.includes(PROXY_ORTHOGRAPHIC)) return;
  if (!source.includes(PROXY_ANCHOR)) {
    throw new Error(`${NAME} no longer contains the line the orthographic fit follows; re-derive it for this Babylon.`);
  }
  ShaderStore.ShadersStore[NAME] = source.replace(PROXY_ANCHOR, PROXY_ANCHOR + PROXY_ORTHOGRAPHIC);
}
