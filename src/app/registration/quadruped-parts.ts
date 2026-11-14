import { PAW_MOTOR } from "../../control/quadruped/paw-motor.ts";
import { TROT_PART } from "../../skills/locomotion/paw-trot/index.ts";
import { CRAWL_PART } from "../../skills/locomotion/paw-crawl/index.ts";
import { PAW_MOVE } from "../../skills/locomotion/paw-move/index.ts";
import { BITE_PART } from "../../skills/strikes/bite/index.ts";
import { FIRST_EXPOSED_AIM } from "../../skills/strikes/bite/jaw-aim.ts";
import { RIGHTING_RECIPE } from "../../skills/recovery/righting-recipe/index.ts";
import { RIGHTING_ROUTES } from "../../skills/recovery/righting-routes/index.ts";

/**
 * **Every part a body on paws is made of, by its kind**, of each role in the order a picker offers
 * them: its motor (`MotorPart`), its gaits (`PawGaitPart`) and the legs that go by them
 * (`LocomotionPart`), its jaw's bite (`ExecutorPart`) and its aim (`AimPart`), and its ways up
 * (`TechniquePart`); a line here registers one.
 */
export const REPTILE_PARTS = { "paw-motor": PAW_MOTOR, "paw-trot": TROT_PART, "paw-crawl": CRAWL_PART, "paw-move": PAW_MOVE,
  bite: BITE_PART, "first-exposed": FIRST_EXPOSED_AIM, "righting-recipe": RIGHTING_RECIPE, "righting-routes": RIGHTING_ROUTES };
