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

/** A human body's settings beyond its physique and haste: whether its feet have toes (`toes.ts`), flat where not given. */
export interface HumanSettings { readonly toes?: boolean }

/**
 * **A workshop human, whole**: its segments, the joints and muscle between them, its wounds and its
 * attributes, at x1, or with `physique` (`physique.ts`), with `haste` per cent in place of its
 * character's, and with toes where `settings` asks.
 */
export const humanSpec = (model: WorkshopModel, physique?: Physique, haste?: number, settings: HumanSettings = {}): BodySpec =>
  shapedSpec(workshopFigure(model), physique, haste, settings);

/** The core's bodies by model: the workshop humans and the crypt skeleton. */
export type HumanoidModel = WorkshopModel | typeof SKELETON_MODEL;
export const HUMANOID_MODELS: readonly HumanoidModel[] = Object.freeze([...WORKSHOP_MODELS, SKELETON_MODEL]);

/** **A core body by model**, whole, with `physique`, `haste` and `settings` where they are given; the skeleton's joints are motors (`skeletonMotors`). */
export function humanoidSpec(model: HumanoidModel, physique?: Physique, haste?: number, settings: HumanSettings = {}): BodySpec {
  return model === SKELETON_MODEL ? skeletonMotors(shapedSpec(skeletonFigure(), physique, haste, settings)) : humanSpec(model, physique, haste, settings);
}

/** `figure`'s body: its toes first, so that a physique's size scales them, then its physique and haste. */
const shapedSpec = (figure: HumanFigure, physique: Physique | undefined, haste: number | undefined, settings: HumanSettings): BodySpec =>
  figureSpec(hastedFigure(physiqueFigure(settings.toes ? toedFigure(figure) : figure, physique), haste));
/** **A human figure, whole** (`figure.ts`): the human body plan on the figure's own numbers. */
function figureSpec(figure: HumanFigure): BodySpec {
  const segments = humanSegments(figure);
  return {
    model: figure.model, mass: figure.mass, stature: figure.stature, segments,
    effectors: ["left", "right"].flatMap(side => [
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
    ends: (["left", "right"] as const).flatMap((side): BearingEndSpec[] => [
      // A body on its knees: the shank on its upper end, the toes tucked under and holding the ankle up.
      { kind: "propped", name: `shin.${side}`, segment: `shank.${side}`, end: "near", from: `hip.${side}`, prop: `foot.${side}`,
        takes: [`hip.${side} flexion`, `hip.${side} abduction`, `hip.${side} internal rotation`, `knee.${side} flexion`] },
      // A hand hangs from the trunk, which both arms share: its stem. Its wrist is the posture's.
      { kind: "end", name: `hand.${side}`, segment: `hand.${side}`, from: `shoulder.${side}`,
        takes: [`shoulder.${side} flexion`, `shoulder.${side} abduction`, `shoulder.${side} internal rotation`] },
      // A foot on its sole, as a stance stands on it.
      { kind: "foot", name: `foot.${side}`, segment: `foot.${side}`, from: `hip.${side}` },
    ]),
  };
}
