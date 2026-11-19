import { isRefused, type Refused } from "../../refusal.ts";
import type { BearingEndSpec, BodySpec } from "../spec/body.ts";
import { sourced } from "../../quantity.ts";
import { hastedFigure, humanAttributes } from "./attributes.ts";
import type { HumanFigure } from "./figure.ts";
import { humanJoints } from "./joints.ts";
import { physiqueFigure, type Physique } from "./physique.ts";
import { peakTorque } from "./muscle.ts";
import { HUMAN_MODELS, type HumanModel } from "./rig.ts";
import { humanSegments } from "./segments.ts";
import { SKELETON_MODEL, skeletonFigure } from "./skeleton.ts";
import { jointSpeed } from "./speed.ts";
import { toedFigure } from "./toes.ts";
import { humanFigure } from "./rigged.ts";
import { humanWounds } from "./wounds.ts";
import { SIDES, pairedSegment } from "../bilateral.ts";

/** The core's bodies by model: the two humans and the skeleton. */
export type HumanoidModel = HumanModel | typeof SKELETON_MODEL;
export const HUMANOID_MODELS: readonly HumanoidModel[] = Object.freeze([...HUMAN_MODELS, SKELETON_MODEL]);

/**
 * **A core body by model, whole**: its segments, the joints and muscle between them, its wounds and
 * its attributes, at x1, or with `physique` (`physique.ts`) and with `haste` per cent in place of
 * its character's; its feet with toes (`toes.ts`); its figure's last step taken (`HumanFigure.finish`).
 */
export function humanoidSpec(model: HumanoidModel, physique?: Physique, haste?: number): BodySpec {
  const spec = humanoidSpecChecked(model, physique, haste);
  if (isRefused(spec)) throw new Error(spec.refused);
  return spec;
}

/** A humanoid under supplied physique settings, returning unsupported geometry from its owner. */
export function humanoidSpecChecked(model: HumanoidModel, physique?: Physique, haste?: number): BodySpec | Refused {
  const figure = model === SKELETON_MODEL ? skeletonFigure() : humanFigure(model);
  // Its toes first (`toedFigure`), so that a physique's size scales them, then its physique and haste.
  const shaped = physiqueFigure(toedFigure(figure), physique);
  return isRefused(shaped) ? shaped : figureSpec(hastedFigure(shaped, haste));
}

/** **A human figure, whole** (`figure.ts`): the human body plan on the figure's own numbers, and its last step. */
function figureSpec(figure: HumanFigure): BodySpec | Refused {
  const segments = humanSegments(figure);
  if (isRefused(segments)) return segments;
  return figure.finish({
    model: figure.model, mass: figure.mass, stature: figure.stature, segments,
    effectors: SIDES.flatMap(side => [
      { segment: pairedSegment("hand", side), base: "upperTrunk", point: "knuckles" },
      { segment: pairedSegment("foot", side), base: "lowerTrunk", point: "strike" },
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
  });
}
