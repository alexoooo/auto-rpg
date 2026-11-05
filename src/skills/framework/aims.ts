import type { BodyView } from "../../control/body.ts";
import type { Ended } from "./action.ts";

import type { Vec3 } from "../../core/bodies/spec/quantity.ts";
import { deepFreeze } from "../../core/world/state.ts";
import { regionSegments, sensedActionTarget, type Aimed } from "../intent/action-aim.ts";
import type { Aim, AimPart } from "./aim-part.ts";
import type { PartField } from "../../parts/fields.ts";
import { number } from "../../parts/fields.ts";
import { capsuleSurfaceAtHeight, openingNow, openingSelector, validOpeningTuning, type OpeningTuning } from "../perception/openings.ts";
import { hold, stillHeld, unheld, type Held } from "../../control/held.ts";
import { anyBody } from "../../parts/parts.ts";
import type { BodySense } from "../../core/bodies/senses.ts";
import type { Side } from "../../core/bodies/bilateral.ts";

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

/**
 * The striker's head about `foe`'s segment `name` into `moved.at`, with how far it may move as
 * far as the two are apart (`HELD_OPENING`), the segment's turn into `turn`, and the striking
 * hand about the head into `fist`, where the opening's blow starts: what a held opening drifts by;
 * false where the segment is not sensed.
 */
function sensedDrift(view: BodyView, foe: BodySense, name: string, effector: string, moved: { at: number[]; within: number }, turn: number[], fist: number[]): boolean {
  const sensed = foe.segments.get(name);
  if (!sensed) return false;
  const hand = view.pointMotion[effector]!.knuckles!.position;
  fist[0] = hand.x - view.head.x; fist[1] = hand.y - view.head.y; fist[2] = hand.z - view.head.z;
  const about = moved.at;
  about[0] = view.head.x - sensed.position.x; about[1] = view.head.y - sensed.position.y; about[2] = view.head.z - sensed.position.z;
  moved.within = HELD_OPENING.moved + HELD_OPENING.share * Math.sqrt(about[0] * about[0] + about[1] * about[1] + about[2] * about[2]);
  const r = sensed.rotation, sign = r.w < 0 ? -1 : 1;
  turn[0] = r.x * sign; turn[1] = r.y * sign; turn[2] = r.z * sign; turn[3] = r.w * sign;
  return true;
}

/** Whether `a` and `b` name the same segments in the same order. */
const sameNames = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((name, k) => name === b[k]);

/**
 * **How long the surface aim holds an opening**: made again once the striker's head has moved
 * `moved` m and `share` of the distance between them about the struck segment, the segment has
 * turned by `turned` (a quaternion's components, about 0.16 rad for each 0.08), the striking hand
 * has moved `fist` m about the head (as it does once its blow is under way), or `rethink` s have
 * passed.
 */
const HELD_OPENING = Object.freeze({ moved: .05, share: .1, turned: .08, fist: .05, rethink: .25 });

/** An opening the surface aim holds: for which foe, hand, segments and blocked segments, the hold, and the opening as a point on its segment with its direction and estimate. */
interface HeldOpening {
  foe: string;
  side: Side;
  names: string[];
  blocked: string[];
  held: Held;
  segment: string;
  local: [number, number, number];
  direction: [number, number, number] | null;
  value: number;
}

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
  make(spec, config: SurfaceConfig) {
    const surface = openingSelector(spec, config.tuning);
    // Each opening held (`HELD_OPENING`), for the foe, hand, region and blocked segments it was found for.
    const state = { held: [] as HeldOpening[] };
    // Each aim answered at `of`'s reading's `stamp`, for its foe as observed at its time, hand, region and blocked segments: every caller's while they stand.
    const found: { foe: BodySense; time: number; side: Side; names: readonly string[]; blocked: readonly string[]; aimed: Aimed | null }[] = [];
    let of: BodyView | null = null, stamp = -1;
    // The drift a hold is made from and checked against, filled each ask: the head about the segment, the segment's turn, and the hand about the head.
    const moved = { at: [0, 0, 0], within: HELD_OPENING.moved }, turn = [0, 0, 0, 0], fist = [0, 0, 0];
    const drift = [moved, { at: turn, within: HELD_OPENING.turned }, { at: fist, within: HELD_OPENING.fist }];
    const aim = aimOn((view, foe, names, effector, ledger) => {
      if (effector !== "hand.left" && effector !== "hand.right") return null;
      const side = effector.slice(5) as Side;
      const blocked = ledger.filter(record => record.target.body === foe.id).flatMap(record => record.contacts.blockedSegments);
      if (of !== view || stamp !== view.reading.stamp) { of = view; stamp = view.reading.stamp; found.length = 0; }
      if (view.resumed) state.held.length = 0;
      const time = foe.time;
      if (time !== undefined) for (const one of found)
        if (one.foe === foe && one.time === time && one.side === side && sameNames(one.names, names) && sameNames(one.blocked, blocked)) return one.aimed;
      let kept = state.held.find((one) => one.foe === foe.id && one.side === side && sameNames(one.names, names) && sameNames(one.blocked, blocked));
      const at = kept && sensedDrift(view, foe, kept.segment, effector, moved, turn, fist)
        && stillHeld(kept.held, view.time, HELD_OPENING.rethink, foe.id, drift, () => true) ? openingNow(view, foe, kept.segment, kept.local) : null;
      let aimed: Aimed | null;
      if (kept && at) aimed = { at, ...(kept.direction ? { direction: kept.direction } : {}), estimate: { unit: "opening", value: kept.value } };
      else {
        const opening = surface(view, foe, side, null, "mixed", { family: "straight", segments: names, blocked });
        aimed = opening ? deepFreeze<Aimed>({ at: opening.target, ...(opening.direction ? { direction: opening.direction } : {}), estimate: { unit: "opening", value: -opening.score } }) : null;
        if (!kept) {
          for (let k = state.held.length - 1; k >= 0; k--) if (view.time >= state.held[k]!.held.made + HELD_OPENING.rethink) state.held.splice(k, 1);
          state.held.push(kept = { foe: foe.id, side, names: [...names], blocked: [...blocked], held: unheld(), segment: "", local: [0, 0, 0], direction: null, value: 0 });
        }
        if (opening && sensedDrift(view, foe, opening.segment, effector, moved, turn, fist)) {
          kept.segment = opening.segment; kept.local = [...opening.local]; kept.direction = opening.direction ? [...opening.direction] : null; kept.value = -opening.score;
          hold(kept.held, view.time, foe.id, drift);
        } else kept.held.made = -Infinity;
      }
      if (time !== undefined) found.push({ foe, time, side, names, blocked, aimed });
      return aimed;
    });
    return Object.assign(aim, { state });
  },
});

/** **The leg-height aim**'s config: the nearest of the region's surfaces at `height` m above the ground. */
interface LegHeightConfig { readonly kind: "leg-height"; readonly height: number }

export const LEG_HEIGHT_AIM: AimPart<LegHeightConfig> = deepFreeze({
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

declare module "../config.ts" {
  interface AimConfigs {
    readonly "centre": CentreConfig;
    readonly "surface": SurfaceConfig;
    readonly "leg-height": LegHeightConfig;
  }
}
