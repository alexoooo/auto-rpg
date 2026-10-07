import type { BodySpec } from "../spec/body.ts";
import { sourced } from "../spec/quantity.ts";
import { humanAttributes } from "./attributes.ts";
import type { HumanFigure } from "./figure.ts";
import { humanJoints } from "./joints.ts";
import { peakTorque } from "./muscle.ts";
import { WORKSHOP_MODELS, type WorkshopModel } from "./rig.ts";
import { humanSegments } from "./segments.ts";
import { SKELETON_MODEL, skeletonFigure } from "./skeleton.ts";
import { jointSpeed } from "./speed.ts";
import { workshopFigure } from "./workshop.ts";
import { humanWounds } from "./wounds.ts";

/** **A workshop human, whole**: its segments, the joints and muscle between them, its wounds and its attributes, at x1. */
export const humanSpec = (model: WorkshopModel): BodySpec => figureSpec(workshopFigure(model));

/** The core's bodies by model: the workshop humans and the crypt skeleton. */
export type HumanoidModel = WorkshopModel | typeof SKELETON_MODEL;
export const HUMANOID_MODELS: readonly HumanoidModel[] = Object.freeze([...WORKSHOP_MODELS, SKELETON_MODEL]);

/** **A core body by model**, whole. */
export function humanoidSpec(model: HumanoidModel): BodySpec {
  return model === SKELETON_MODEL ? figureSpec(skeletonFigure()) : humanSpec(model);
}
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
    down: { kind: "asked", fallen: sourced(0.25, "m", "fall-bar", "Fallen") },
  };
}
