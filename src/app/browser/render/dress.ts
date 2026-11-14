import type { SkeletonArt } from "../../../core/bodies/human/skeleton-art.ts";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { DrawnBody } from "./drawn-body.ts";
import type { BodyModel } from "../../../core/bodies/models.ts";
import { drawBody } from "./body-shapes.ts";
import { dressSkeleton, loadSkeletonArt } from "./skeleton-skin.ts";
import { dressBody, loadSkin } from "./skin.ts";
import type { HumanModel } from "../../../core/bodies/human/rig.ts";
import { appearanceFor, type Appearance } from "../../../game/appearance/appearance.ts";
import { dressRobot } from "./robot-skin.ts";
import type { SkinOptions, SkinView } from "./skin-view.ts";
import { dressSkinnedArt, loadSkinnedArt, SKINNED_LOOKS } from "./skinned-art.ts";

/** The body's colour when its skin did not load, and it is drawn as its shapes. */
const SHAPES_TINT = Color3.FromHexString("#b9a58a");

/** Draws a built body: its skin, or its shapes. */
export type Dresser = (built: DrawnBody, options: SkinOptions) => SkinView;

/** Loads a model's own art in `scene` as a dresser. */
type Art = (model: BodyModel, scene: Scene, options: { readonly skeletonArt?: () => Promise<SkeletonArt> }) => Promise<Dresser>;

/** A human's skin, its clothing as each instance says. */
const humanSkin: Art = (model, scene) => loadSkin(model as HumanModel, scene)
  .then(container => (built, instance) => dressBody(built, container, scene, instance.clothing, instance.closure));

/** A creature drawn as one skinned mesh (`SKINNED_LOOKS`). */
const skinned = (model: keyof typeof SKINNED_LOOKS): Art => (_model, scene) => loadSkinnedArt(SKINNED_LOOKS[model])
  .then(art => (built: DrawnBody) => dressSkinnedArt(built, art, scene));

/** **Every model's own art**: the one list a body family is added to here. */
const ART: Readonly<Record<BodyModel, Art>> = Object.freeze({
  man: humanSkin, woman: humanSkin,
  skeleton: (_model, scene, options) => (options.skeletonArt ?? loadSkeletonArt)().then(art => (built: DrawnBody) => dressSkeleton(built, art, scene)),
  reptile: skinned("reptile"), rat: skinned("rat"),
});

/**
 * `model`'s dresser in `scene`: its own art (`ART`), or its
 * shapes in `SHAPES_TINT` if the skin does not load. `skeletonArt` is asked for only by the skeleton.
 */
export function dresserFor(model: BodyModel, scene: Scene,
  options: { readonly appearance?: Appearance; readonly skeletonArt?: () => Promise<SkeletonArt> } = {}): Promise<Dresser> {
  const appearance = appearanceFor(model, options.appearance);
  let skin: Promise<Dresser>;
  switch (appearance) {
    case "default": {
      const art = Object.hasOwn(ART, model) ? ART[model] : undefined;
      if (!art) throw new Error(`unknown model ${String(model)}`);
      skin = art(model, scene, options);
      break;
    }
    case "industrial": case "steampunk": case "futuristic":
      skin = Promise.resolve((built, instance) => dressRobot(built, scene, appearance, instance));
      break;
    default: { const never: never = appearance; throw new Error(`unknown appearance ${never}`); }
  }
  return skin.catch((error: unknown) => {
    console.warn(`${model} is drawn as its shapes: its skin did not load`, error);
    return (built: DrawnBody): SkinView => {
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
