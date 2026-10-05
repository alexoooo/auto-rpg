import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { BuiltBody } from "../core/build/build-body.ts";
import type { BodyModel } from "../core/human/spec.ts";
import { drawBody } from "./body-shapes.ts";
import { dressSkeleton, loadSkeletonArt, type SkeletonArt } from "./skeleton-skin.ts";
import { dressBody, loadSkin } from "./skin.ts";
import type { SkinOptions, SkinView } from "./skin-view.ts";

/** The body's colour when its skin did not load, and it is drawn as its shapes. */
const SHAPES_TINT = Color3.FromHexString("#b9a58a");

/** Draws a built body: its skin, or its shapes. */
export type Dresser = (built: BuiltBody, options: SkinOptions) => SkinView;

/**
 * `model`'s dresser in `scene`: the crypt skeleton's art or a human's skin, or its
 * shapes in `SHAPES_TINT` if the skin does not load. `skeletonArt` is asked for only by the skeleton.
 */
export function dresserFor(model: BodyModel, scene: Scene,
  options: { readonly skeletonArt?: () => Promise<SkeletonArt> } = {}): Promise<Dresser> {
  const skin: Promise<Dresser> = model === "crypt-skeleton"
    ? (options.skeletonArt ?? loadSkeletonArt)().then((art) => (built) => dressSkeleton(built, art, scene))
    : loadSkin(model, scene).then((container) => (built, instance) => dressBody(built, container, scene, instance.clothing, instance.closure));
  return skin.catch((error: unknown) => {
    console.warn(`${model} is drawn as its shapes: its skin did not load`, error);
    return (built: BuiltBody) => {
      const shapes = drawBody(built, scene, SHAPES_TINT);
      return {
        ...shapes,
        setEnabled(enabled) { for (const mesh of shapes.meshes) mesh.setEnabled(enabled); },
        wear() { /* Collision shapes have no clothing. */ },
      };
    };
  });
}
