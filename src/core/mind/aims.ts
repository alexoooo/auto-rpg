import type { BodyView } from "../body.ts";
import type { Ended } from "../skills/action.ts";
import type { Side } from "../spec/body.ts";
import type { Vec3 } from "../spec/quantity.ts";
import { deepFreeze } from "../state.ts";
import { regionSegments, sensedActionTarget, type Aimed } from "./action-aim.ts";
import type { Aim, AimPart } from "./aim-part.ts";
import type { PartField } from "./fields.ts";
import { number } from "./fields.ts";
import { capsuleSurfaceAtHeight, openingSelector, validOpeningTuning, type OpeningTuning } from "./openings.ts";
import { anyBody } from "./parts.ts";
import type { BodySense } from "./senses.ts";

/**
 * An aim at a body target: `find` is asked of the foe the target names and the segments of its
 * region, where the foe is sensed and has them; a point target is aimed at as it says.
 */
function aimOn(find: (view: BodyView, foe: BodySense, names: readonly string[], effector: string, ledger: readonly Ended[]) => Aimed | null): Aim {
  return (view, target, effector, ledger = []) => {
    if (target.kind === "point") return { at: target.at, ...(target.direction ? { direction: target.direction } : {}) };
    const foe = sensedActionTarget(view, target);
    if (!foe) return null;
    const names = regionSegments(foe.spec, target.region);
    return names.length ? find(view, foe, names, effector, ledger) : null;
  };
}

/** **The centre aim**'s config: the centre of the region's nearest segment, led by `lead` s of its motion. */
interface CentreConfig { readonly kind: "centre"; readonly lead: number }

const validLead = (lead: number) => Number.isFinite(lead) && lead >= 0;

export const CENTRE_AIM: AimPart<CentreConfig> = deepFreeze({
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

/** **The surface aim**'s config: the opening reader's (`openingSelector`) choice of a surface point, by its preferences. */
interface SurfaceConfig { readonly kind: "surface"; readonly tuning: OpeningTuning }

/** The opening reader's preference for `key`'s part, a score; written empty, the reader's own. */
const preference = (key: "head" | "upperTrunk" | "middleTrunk", label: string): PartField<SurfaceConfig> => ({
  kind: "number", key, label, least: -2, most: 2, step: .05, unit: "score",
  read: (config) => config.tuning[key] === undefined ? "" : String(config.tuning[key]),
  write: (config, text) => {
    const { [key]: _, ...rest } = config.tuning;
    if (text.trim() === "") return { ...config, tuning: rest };
    const value = Number(text);
    return Number.isFinite(value) && value >= -2 && value <= 2 ? { ...config, tuning: { ...rest, [key]: value } } : null;
  },
});

export const SURFACE_AIM: AimPart<SurfaceConfig> = deepFreeze({
  role: "aim", label: "Surface opening", stage: "game", unit: "opening", slots: [], defaults: { kind: "surface", tuning: {} }, keys: { kind: true, tuning: true },
  tuning: ["head", "upperTrunk", "middleTrunk", "blocked", "reachPenalty", "repeated", "overhand", "headLateral", "hookCost", "uppercut", "uppercutReserve", "square"],
  fields: [preference("head", "Head"), preference("upperTrunk", "Upper trunk"), preference("middleTrunk", "Middle trunk")], fits: anyBody,
  faults: (config: SurfaceConfig) => validOpeningTuning(config.tuning) ? [] : ["unsupported surface aim"],
  aimsWith: (effector: string) => effector === "hand.left" || effector === "hand.right",
  make(spec, config: SurfaceConfig, blow) {
    const surface = openingSelector(spec, config.tuning, blow?.paths), family = blow?.family ?? "straight";
    return aimOn((view, foe, names, effector, ledger) => {
      if (effector !== "hand.left" && effector !== "hand.right") return null;
      const side = effector.slice(5) as Side;
      const blocked = ledger.filter(record => record.target.body === foe.id).flatMap(record => record.contacts.blockedSegments);
      const found = surface(view, foe, side, null, "mixed", { family, segments: names, blocked });
      return found ? { at: found.target, ...(found.direction ? { direction: found.direction } : {}), estimate: { unit: "opening", value: -found.score } } : null;
    });
  },
});

/** **The leg-height aim**'s config: the nearest of the region's surfaces at `height` m above the ground. */
interface LegHeightConfig { readonly kind: "leg-height"; readonly height: number }

const LEG_HEIGHT_AIM: AimPart<LegHeightConfig> = deepFreeze({
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

/** **Every stock aim**, by kind: an action's rule for where on its target it strikes (`ActionConfig.aim`). */
export const AIMS = Object.freeze({ centre: CENTRE_AIM, surface: SURFACE_AIM, "leg-height": LEG_HEIGHT_AIM });
