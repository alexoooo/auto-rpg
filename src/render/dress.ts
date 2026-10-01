import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { BuiltBody } from "../core/build/build-body.ts";
import type { BodyModel } from "../core/human/spec.ts";
import { drawBody, type BodyShapes } from "./body-shapes.ts";
import { dressSkeleton, type SkeletonArt } from "./skeleton-skin.ts";
import { dressBody, loadSkin, type Clothing, type SkinView } from "./skin.ts";

/** The body's colour when its skin did not load, and it is drawn as its shapes. */
const SHAPES_TINT = Color3.FromHexString("#b9a58a");

/** Draws a built body: its skin, or its shapes. */
export type Dresser = (built: BuiltBody) => SkinView | BodyShapes;

/**
 * `model`'s dresser in `scene`: the crypt skeleton's art or a human's skin in `clothing`, or its
 * shapes in `SHAPES_TINT` if the skin does not load. `skeletonArt` is asked for only by the skeleton.
 */
export function dresserFor(model: BodyModel, scene: Scene, clothing: Clothing, skeletonArt: () => Promise<SkeletonArt>): Promise<Dresser> {
  const skin: Promise<Dresser> = model === "crypt-skeleton"
    ? skeletonArt().then((art) => (built: BuiltBody) => dressSkeleton(built, art, scene))
    : loadSkin(model, scene).then((container) => (built: BuiltBody) => dressBody(built, container, scene, clothing));
  return skin.catch((error: unknown) => {
    console.warn(`${model} is drawn as its shapes: its skin did not load`, error);
    return (built: BuiltBody) => drawBody(built, scene, SHAPES_TINT);
  });
}
