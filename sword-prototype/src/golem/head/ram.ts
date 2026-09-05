import { HEAD_RAM } from "../config.ts";
import { headModule, type HeadModuleDefinition } from "./head.ts";

/**
 * `head.ram`: the same head with a bronze plate on its brow, and the one attack a golem makes
 * with the part that can kill it.
 *
 * **The risk is the design and not a side effect.** The head is the fatal part. The lunge is a
 * velocity event through the neck that puts it forward and down into whatever is in front -- so a
 * ram golem gambles the thing that ends it in order to land a blow, every time it attacks. That is
 * the trade this option exists to offer, and it is why `head.plain` stays a real option rather
 * than a placeholder.
 *
 * The centipede is the precedent, copied rather than reinvented: a `Striking` with `hand` null and
 * a stable `effectorId`, driven from `Intent.natural`, on a body that publishes no hand for it.
 * `applyButtonPose` in `src/buttons.ts` is what makes the left mouse button fire it -- one press
 * onto the acting hand and the natural striker together -- which is the half that was left behind
 * the first time this channel was built and left a person unable to make a centipede bite.
 */
export const headRam: HeadModuleDefinition = headModule("head.ram", "ram head", {
  guardPitch: HEAD_RAM.guardPitch,
  ram: {
    plateWidth: HEAD_RAM.plateWidth,
    plateLength: HEAD_RAM.plateLength,
    plateThickness: HEAD_RAM.plateThickness,
    plateMass: HEAD_RAM.plateMass,
    plateHealth: HEAD_RAM.plateHealth,
    plateVitalityWeight: HEAD_RAM.plateVitalityWeight,
    plateTipOffset: HEAD_RAM.plateTipOffset,
    lunge: HEAD_RAM.lunge,
  },
});
