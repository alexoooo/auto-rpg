import { HighlightLayer } from "@babylonjs/core/Layers/highlightLayer.js";
import "@babylonjs/core/Layers/effectLayerSceneComponent.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { Side } from "../core/spec/body.ts";

/** Persistent side identities shared by character silhouettes, setup, the HUD and the verdict: a side's label, and its colour, by value and by name (a foe's in a side's choices). */
export const ARENA_SIDES = Object.freeze({
  left: Object.freeze({ label: "Left · Blue", colour: "#6bb4ff", name: "Blue" }),
  right: Object.freeze({ label: "Right · Red", colour: "#ff7975", name: "Red" }),
});

/** The stencil silhouette survives the post-processing pass and leaves character materials intact. */
export function sideHighlights(scene: Scene) {
  const layer = new HighlightLayer("arena.sides", scene,
    { mainTextureRatio: 1, blurTextureSizeRatio: 1, blurHorizontalSize: 3, blurVerticalSize: 3 });
  layer.innerGlow = false;
  return {
    add(side: Side, meshes: readonly Mesh[]): void {
      const colour = Color3.FromHexString(ARENA_SIDES[side].colour);
      for (const mesh of meshes) if (mesh.getTotalVertices() > 0) layer.addMesh(mesh, colour);
    },
    clear(): void { layer.removeAllMeshes(); },
    dispose(): void { layer.dispose(); },
  };
}
