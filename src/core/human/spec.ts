import type { BodySpec } from "../spec/body.ts";
import type { HumanFigure } from "./figure.ts";
import { humanJoints } from "./joints.ts";
import { peakTorque } from "./muscle.ts";
import { WORKSHOP_MODELS, type WorkshopModel } from "./rig.ts";
import { humanSegments } from "./segments.ts";
import { SKELETON_MODEL, skeletonFigure } from "./skeleton.ts";
import { jointSpeed } from "./speed.ts";
import { workshopFigure } from "./workshop.ts";
import { humanWounds } from "./wounds.ts";

/** **A workshop human, whole**: its segments, the joints and muscle between them, and its wounds, at x1. */
export const humanSpec = (model: WorkshopModel): BodySpec => figureSpec(workshopFigure(model));

/** The core's bodies by model: the workshop humans and the crypt skeleton. */
export type CoreModel = WorkshopModel | typeof SKELETON_MODEL;
export const CORE_MODELS: readonly CoreModel[] = Object.freeze([...WORKSHOP_MODELS, SKELETON_MODEL]);

/** **A core body by model**, whole. */
export function modelSpec(model: CoreModel): BodySpec {
  return model === SKELETON_MODEL ? figureSpec(skeletonFigure()) : humanSpec(model);
}

/** **A human figure, whole** (`figure.ts`): the human body plan on the figure's own numbers. */
export function figureSpec(figure: HumanFigure): BodySpec {
  const segments = humanSegments(figure);
  return {
    family: figure.family, model: figure.model, mass: figure.mass, stature: figure.stature, segments,
    joints: humanJoints(figure, segments, (exertion) => peakTorque(figure, exertion), (exertion) => jointSpeed(figure, exertion)),
    wounds: humanWounds(figure),
  };
}
