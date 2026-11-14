import { variationFault, variedMake, type Varied } from "../../framework/variations.ts";
import type { MotorAndGuard } from "../../framework/motor-and-guard.ts";
import { MOTOR_SUPPORT } from "../../../control/motor-part.ts";
import type { BodyView } from "../../../control/body.ts";
import type { Clock } from "../../../core/world/clock.ts";
import type { OwnBody } from "../../../core/bodies/own-body.ts";
import { fitsAll, fitsWhen } from "../../../parts/parts.ts";
import type { TechniquePart } from "../shared/technique.ts";
import { deepFreeze } from "../../../core/state.ts";
import { fitsPaws } from "../../../control/quadruped/fit.ts";
import { LYING, RIGHTING, toStanding } from "../shared/righting.ts";
import { holdsRoutes, rightingByRoutes } from "./righting-routes/routes.ts";

/** Righting by routes' config: no settings of its own. */
interface RoutesConfig extends Varied { readonly kind: "righting-routes" }

/**
 * **Righting by routes** (`rightingByRoutes`) as a way up from lying, crouched on its paws or
 * between: a body on paws (`fitsPaws`) whose legs take the routes' poses (`holdsRoutes`), carried
 * up by its mind's motor.
 */
const ROUTES_VARIATIONS = {
  "righting-routes": (own: OwnBody, view: BodyView, clock: Clock, fitted: MotorAndGuard, _config: RoutesConfig) => rightingByRoutes(own, view, clock, fitted),
};

export const RIGHTING_ROUTES = deepFreeze<TechniquePart<RoutesConfig>>({
  ...RIGHTING, requires: [MOTOR_SUPPORT], edges: toStanding([...LYING, "crouch", "between"]), label: "Right by routes", defaults: { kind: "righting-routes" }, keys: { kind: true, variation: true },
  fits: fitsAll(variationFault("righting-routes", "righting by routes", ROUTES_VARIATIONS), fitsPaws, fitsWhen(holdsRoutes, "needs legs whose ranges hold the righting routes' poses")), faults: () => [],
  make: variedMake("righting-routes", ROUTES_VARIATIONS, (own, _view, _clock, _fitted, config) => [own.spec, config]),
  skillGroup: "Stand-up", variations: Object.keys(ROUTES_VARIATIONS),
});

declare module "../shared/technique.ts" {
  interface TechniqueConfigs {
    readonly "righting-routes": RoutesConfig;
  }
}
