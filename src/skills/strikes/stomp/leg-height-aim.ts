import { aimOn } from "../../framework/aim-on.ts";
import type { Vec3 } from "../../../core/quantity.ts";
import { deepFreeze } from "../../../core/state.ts";
import type { AimPart } from "../../framework/aim-part.ts";
import { number } from "../../../parts/fields.ts";
import { capsuleSurfaceAtHeight } from "../../perception/openings.ts";
import { anyBody } from "../../../parts/parts.ts";
/** **The leg-height aim**'s config: the nearest of the region's surfaces at `height` m above the ground. */
interface LegHeightConfig { readonly kind: "leg-height"; readonly height: number }
export const LEG_HEIGHT_AIM = deepFreeze<AimPart<LegHeightConfig>>({
  role: "aim", label: "At a height", stage: "game", unit: null, slots: [], defaults: { kind: "leg-height", height: .4 }, keys: { kind: true, height: true },
  fields: [number<LegHeightConfig, "height">("height", "Height", 0, 2.5, .01, "m")], fits: anyBody,
  faults: (config: LegHeightConfig) => Number.isFinite(config.height) ? [] : ["invalid aim height"],
  make(_spec, config: LegHeightConfig) {
    if (!Number.isFinite(config.height)) throw new Error("invalid leg aim height");
    return aimOn((view, foe, names) => {
      const from: Vec3 = [view.stance.centre.x, view.stance.centre.y, view.stance.centre.z];
      let chosen: Vec3 | null = null, best = Infinity;
      for (const name of names) {
        const at = capsuleSurfaceAtHeight(foe, name, from, config.height);
        if (!at) continue;
        const dx = at[0] - from[0], dz = at[2] - from[2], squared = dx * dx + dz * dz;
        if (squared < best) { chosen = at; best = squared; }
      }
      return chosen ? { at: chosen } : null;
    });
  },
});
declare module "../../config.ts" {
  interface AimConfigs { readonly "leg-height": LegHeightConfig }
}
