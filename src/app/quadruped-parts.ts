import { PAW_MOTOR } from "../control/quadruped/paw-motor.ts";
import { TROT_PART } from "../skills/locomotion/quadruped/trot.ts";
import { CRAWL_PART } from "../skills/locomotion/quadruped/crawl.ts";
import { PAW_MOVE } from "../skills/locomotion/quadruped/paw-legs.ts";
import { JAW_BITE } from "../skills/strikes/bite/index.ts";
import { FIRST_EXPOSED_AIM } from "../skills/strikes/bite/jaw-aim.ts";
import { RIGHTING_RECIPE, RIGHTING_ROUTES } from "../skills/recovery/righting/righting.ts";

/**
 * **Every part a body on paws is made of, by its kind**, of each role in the order a picker offers
 * them: its motor (`MotorPart`), its gaits (`PawGaitPart`) and the legs that go by them
 * (`LocomotionPart`), its jaw's bite (`ExecutorPart`) and its aim (`AimPart`), and its ways up
 * (`TechniquePart`); a line here registers one. This module holds its imports and this list and
 * nothing else: a case's code reads it as where each kind's own code begins (`caseCoder`,
 * `scripts/build-identity.mjs`).
 */
export const REPTILE_PARTS = { "paw-motor": PAW_MOTOR, "paw-trot": TROT_PART, "paw-crawl": CRAWL_PART, "paw-move": PAW_MOVE,
  "jaw-bite": JAW_BITE, "first-exposed": FIRST_EXPOSED_AIM, "righting-recipe": RIGHTING_RECIPE, "righting-routes": RIGHTING_ROUTES };
