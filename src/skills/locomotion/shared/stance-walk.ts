import type { Body } from "../../../control/body.ts";
import { standingFooting } from "../../../control/support.ts";
import type { GaitTuning } from "../../../control/stance/stance-tuning.ts";
import type { GaitStop } from "../../framework/locomotion-part.ts";
import { stanceFeetOf, stanceSegmentsOf } from "./stance-feet.ts";
import { locomotion, type Carriage, type TurnStartup } from "./locomotion.ts";

/**
 * What a walk in the stance is given: a heading-speed ceiling, rad/s, and one while setting off
 * (`TurnStartup`); the carriage it holds (`Carriage`, the square stance where none); and how it
 * stops (`Locomotion.stops`; the stance's unmeasured stop where none).
 */
export interface StanceWalkSettings { readonly turnLimit?: number; readonly turnStartup?: TurnStartup; readonly carriage?: Carriage; readonly stops?: readonly GaitStop[] }

/** **The walk in the stance** (`locomotion`) of `body`, by the stance's own steps or by `steps`: what the stance walk's variations and the gaits built on it walk by. */
export const stanceWalk = (body: Body, settings: StanceWalkSettings, steps?: GaitTuning) => locomotion(stanceFeetOf(body.built.spec), body.envelope, {
  turnLimit: settings.turnLimit, turnStartup: settings.turnStartup, carriage: settings.carriage, segments: stanceSegmentsOf(body.built.spec),
  builtFooting: standingFooting(body.built), ...(steps ? { gait: () => steps } : {}), ...(settings.stops ? { stops: settings.stops } : {}) });
