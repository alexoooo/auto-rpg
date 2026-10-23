import { fitsSoles } from "../../control/stance-balance.ts";
import { number } from "../../mind/fields.ts";
import type { LocomotionPart } from "../../mind/locomotion-part.ts";
import { locomotion, validTurnLimit, validTurnStartup } from "../../skills/locomotion.ts";
import { deepFreeze } from "../../state.ts";

/** Heading-speed ceilings for the stance walk, including its first seconds of continuous travel. */
interface VanguardWalkConfig {
  readonly kind: "vanguard-walk";
  readonly turnLimit: number;
  readonly turnStartupSeconds: number;
  readonly turnStartupLimit: number;
}

/** Vanguard's conservative turn calibration, carried by its config and links as ordinary settings. */
export const VANGUARD_WALK: LocomotionPart<VanguardWalkConfig> = deepFreeze({
  role: "locomotion", label: "Vanguard stance walk", stage: "experimental",
  defaults: { kind: "vanguard-walk", turnLimit: .3, turnStartupSeconds: 2, turnStartupLimit: .2 },
  fields: [number("turnLimit", "Turn limit", .01, 10, .01, "rad/s"),
    number("turnStartupSeconds", "Startup interval", .01, 10, .01, "s"),
    number("turnStartupLimit", "Startup turn limit", .01, 10, .01, "rad/s")],
  slots: [], keys: { kind: true, turnLimit: true, turnStartupSeconds: true, turnStartupLimit: true }, fits: fitsSoles,
  faults: config => [
    ...typeof config.turnLimit === "number" && validTurnLimit(config.turnLimit) ? [] : ["turnLimit: finite positive rad/s"],
    ...validTurnStartup({ seconds: config.turnStartupSeconds, limit: config.turnStartupLimit }) ? [] : ["turnStartupSeconds and turnStartupLimit: finite positive values"],
  ],
  make: (body, config) => locomotion(body.envelope, config.turnLimit, { seconds: config.turnStartupSeconds, limit: config.turnStartupLimit }),
});
