import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { BuiltBody } from "../core/build/build-body.ts";
import type { BodyModel } from "../core/human/spec.ts";
import { drawBody } from "./body-shapes.ts";
import { dressSkeleton, loadSkeletonArt, type SkeletonArt } from "./skeleton-skin.ts";
import { dressBody, loadSkin } from "./skin.ts";
import { appearanceFor, type Appearance } from "./appearance.ts";
import { dressRobot } from "./robot-skin.ts";
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
  options: { readonly appearance?: Appearance; readonly skeletonArt?: () => Promise<SkeletonArt> } = {}): Promise<Dresser> {
  const appearance = appearanceFor(model, options.appearance);
  let skin: Promise<Dresser>;
  switch (appearance) {
    case "default":
      skin = model === "crypt-skeleton"
        ? (options.skeletonArt ?? loadSkeletonArt)().then((art) => (built) => dressSkeleton(built, art, scene))
        : loadSkin(model, scene).then((container) => (built, instance) => dressBody(built, container, scene, instance.clothing, instance.closure));
      break;
    case "industrial": case "relic": case "duelist":
      skin = Promise.resolve((built, instance) => dressRobot(built, scene, appearance, instance));
      break;
    default: { const never: never = appearance; throw new Error(`unknown appearance ${never}`); }
  }
  return skin.catch((error: unknown) => {
    console.warn(`${model} is drawn as its shapes: its skin did not load`, error);
    return (built: BuiltBody): SkinView => {
      const shapes = drawBody(built, scene, SHAPES_TINT);
      return {
        ...shapes,
        setEnabled(enabled) { for (const mesh of shapes.meshes) mesh.setEnabled(enabled); },
        wear() { /* Collision shapes have no clothing. */ },
      };
    };
  }).then(dress => (built, instance) => {
    if (built.spec.model !== model) throw new Error(`a ${model} dresser cannot dress ${built.spec.model}`);
    return dress(built, instance);
  });
}
