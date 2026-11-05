import type { BearingEndSpec, BodySpec } from "../spec/body.ts";
import { sourced } from "../spec/quantity.ts";
import { hastedFigure, humanAttributes } from "./attributes.ts";
import type { HumanFigure } from "./figure.ts";
import { humanJoints } from "./joints.ts";
import { physiqueFigure, type Physique } from "./physique.ts";
import { peakTorque } from "./muscle.ts";
import { WORKSHOP_MODELS, type WorkshopModel } from "./rig.ts";
import { humanSegments } from "./segments.ts";
import { SKELETON_MODEL, skeletonFigure, skeletonMotors } from "./skeleton.ts";
import { jointSpeed } from "./speed.ts";
import { toedFigure } from "./toes.ts";
import { workshopFigure } from "./workshop.ts";
import { humanWounds } from "./wounds.ts";
import { SIDES } from "../bilateral.ts";

/**
 * **A workshop human, whole**: its segments, the joints and muscle between them, its wounds and its
 * attributes, at x1, or with `physique` (`physique.ts`) and with `haste` per cent in place of its
 * character's; its feet with toes (`toes.ts`).
 */
export const humanSpec = (model: WorkshopModel, physique?: Physique, haste?: number): BodySpec =>
  shapedSpec(workshopFigure(model), physique, haste);

/** The core's bodies by model: the workshop humans and the crypt skeleton. */
export type HumanoidModel = WorkshopModel | typeof SKELETON_MODEL;
export const HUMANOID_MODELS: readonly HumanoidModel[] = Object.freeze([...WORKSHOP_MODELS, SKELETON_MODEL]);

/** **A core body by model**, whole, with `physique` and `haste` where they are given; the skeleton's joints are motors (`skeletonMotors`). */
export function humanoidSpec(model: HumanoidModel, physique?: Physique, haste?: number): BodySpec {
  return model === SKELETON_MODEL ? skeletonMotors(shapedSpec(skeletonFigure(), physique, haste)) : humanSpec(model, physique, haste);
}

/** `figure`'s body: its toes first (`toedFigure`), so that a physique's size scales them, then its physique and haste. */
const shapedSpec = (figure: HumanFigure, physique: Physique | undefined, haste: number | undefined): BodySpec =>
  figureSpec(hastedFigure(physiqueFigure(toedFigure(figure), physique), haste));
/** **A human figure, whole** (`figure.ts`): the human body plan on the figure's own numbers. */
function figureSpec(figure: HumanFigure): BodySpec {
  const segments = humanSegments(figure);
  return {
    model: figure.model, mass: figure.mass, stature: figure.stature, segments,
    effectors: SIDES.flatMap(side => [
      { segment: `hand.${side}`, base: "upperTrunk", point: "knuckles" },
      { segment: `foot.${side}`, base: "lowerTrunk", point: "strike" },
    ]),
    joints: humanJoints(figure, segments, (exertion) => peakTorque(figure, exertion), (exertion) => jointSpeed(figure, exertion)),
    wounds: humanWounds(figure),
    attributes: humanAttributes(figure),
    substance: figure.substance,
    down: { kind: "touch", fallen: sourced(0.25, "m", "fall-bar", "Fallen"), bearers: ["foot.left", "foot.right", "hand.left", "hand.right"],
      within: sourced(0.03, "m", "touch-bar", "Touching") },
    marks: { high: "head", middle: ["upperTrunk", "middleTrunk"], base: "lowerTrunk", legs: ["shank.left", "shank.right"],
      guards: ["hand.left", "hand.right", "forearm.left", "forearm.right"] },
    ends: SIDES.flatMap((side): BearingEndSpec[] => [
      // A body on its knees: the shank on its upper end, the toes tucked under and holding the ankle up.
      { kind: "propped", name: `shin.${side}`, segment: `shank.${side}`, end: "near", from: `hip.${side}`, prop: `foot.${side}` },
      // A hand's arm chain begins at the shoulder; both arms hang from the trunk.
      { kind: "end", name: `hand.${side}`, segment: `hand.${side}`, from: `shoulder.${side}` },
      // A foot on its sole, as a stance stands on it.
      { kind: "foot", name: `foot.${side}`, segment: `foot.${side}`, from: `hip.${side}` },
    ]),
  };
}
