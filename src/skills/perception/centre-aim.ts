import { aimOn } from "../framework/aim-on.ts";
import type { Vec3 } from "../../core/quantity.ts";
import { deepFreeze } from "../../core/state.ts";
import type { AimPart } from "../framework/aim-part.ts";
import { number } from "../../parts/fields.ts";
import { anyBody } from "../../parts/parts.ts";
/** **The centre aim**'s config: the centre of the region's nearest segment, led by `lead` s of its motion. */
interface CentreConfig { readonly kind: "centre"; readonly lead: number }
const validLead = (lead: number) => Number.isFinite(lead) && lead >= 0;
export const CENTRE_AIM = deepFreeze<AimPart<CentreConfig>>({
  role: "aim", label: "Centre", stage: "game", unit: null, slots: [], defaults: { kind: "centre", lead: 0 }, keys: { kind: true, lead: true },
  fields: [number<CentreConfig, "lead">("lead", "Prediction", 0, 1, .005, "s")], fits: anyBody,
  faults: (config: CentreConfig) => validLead(config.lead) ? [] : ["invalid prediction"],
  make(_spec, config: CentreConfig) {
    if (!validLead(config.lead)) throw new Error("invalid aim prediction");
    return aimOn((view, foe, names) => {
      let chosen: Vec3 | null = null, best = Infinity;
      for (const name of names) {
        const segment = foe.segments.get(name);
        if (!segment) continue;
        const seconds = config.lead + Math.max(0, view.time - (foe.time ?? view.time));
        const at: Vec3 = [segment.centre.x + segment.velocity.x * seconds, segment.centre.y + segment.velocity.y * seconds, segment.centre.z + segment.velocity.z * seconds];
        const dx = at[0] - view.stance.centre.x, dy = at[1] - view.stance.centre.y, dz = at[2] - view.stance.centre.z, squared = dx * dx + dy * dy + dz * dz;
        if (squared < best) { chosen = at; best = squared; }
      }
      return chosen ? { at: chosen } : null;
    });
  },
});
declare module "../config.ts" {
  interface AimConfigs { readonly "centre": CentreConfig }
}
