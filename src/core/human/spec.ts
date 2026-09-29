import type { BodySpec } from "../spec/body.ts";
import { humanJoints } from "./joints.ts";
import { bodyMass, stature } from "./model.ts";
import { peakTorque } from "./muscle.ts";
import type { WorkshopModel } from "./rig.ts";
import { humanSegments } from "./segments.ts";
import { jointSpeed } from "./speed.ts";
import { humanWounds } from "./wounds.ts";

/** **A workshop human, whole**: its segments, the joints and muscle between them, and its wounds, at x1. */
export function humanSpec(model: WorkshopModel): BodySpec {
  const segments = humanSegments(model);
  return {
    family: "human", model, mass: bodyMass(model), stature: stature(model), segments,
    joints: humanJoints(model, segments, (exertion) => peakTorque(model, exertion), (exertion) => jointSpeed(model, exertion)),
    wounds: humanWounds(model),
  };
}
