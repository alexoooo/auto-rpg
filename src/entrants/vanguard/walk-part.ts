import { fitsSoles } from "../../core/control/stance-balance.ts";
import { stanceFeetOf } from "../../core/skills/framework/skill.ts";
import { number } from "../../core/parts/fields.ts";
import type { LocomotionPart } from "../../core/skills/framework/locomotion-part.ts";
import { locomotion, validTurnLimit, validTurnStartup } from "../../core/skills/locomotion/locomotion.ts";
import { deepFreeze } from "../../core/state.ts";

/** Heading-speed ceilings for the stance walk, including its first seconds of continuous travel. */
interface VanguardWalkConfig {
  readonly kind: "vanguard:walk";
  readonly turnLimit: number;
  readonly turnStartupSeconds: number;
  readonly turnStartupLimit: number;
}

/** Vanguard's conservative turn calibration, carried by its config and links as ordinary settings. */
export const VANGUARD_WALK: LocomotionPart<VanguardWalkConfig> = deepFreeze({
  role: "locomotion", label: "Vanguard stance walk", stage: "experimental",
  defaults: { kind: "vanguard:walk", turnLimit: .3, turnStartupSeconds: 2, turnStartupLimit: .2 },
  fields: [number("turnLimit", "Turn limit", .01, 10, .01, "rad/s"),
    number("turnStartupSeconds", "Startup interval", .01, 10, .01, "s"),
    number("turnStartupLimit", "Startup turn limit", .01, 10, .01, "rad/s")],
  slots: [], keys: { kind: true, turnLimit: true, turnStartupSeconds: true, turnStartupLimit: true }, fits: fitsSoles,
  faults: config => [
    ...typeof config.turnLimit === "number" && validTurnLimit(config.turnLimit) ? [] : ["turnLimit: finite positive rad/s"],
    ...validTurnStartup({ seconds: config.turnStartupSeconds, limit: config.turnStartupLimit }) ? [] : ["turnStartupSeconds and turnStartupLimit: finite positive values"],
  ],
  make: (body, config) => locomotion(stanceFeetOf(body.built.spec), body.envelope, config.turnLimit, { seconds: config.turnStartupSeconds, limit: config.turnStartupLimit }),
});
