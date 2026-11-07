import { surfaceAimRefusal } from "../arm-reach.ts";
import { aimOn } from "../../framework/aim-on.ts";
import type { BodyView } from "../../../control/body.ts";
import { deepFreeze } from "../../../core/state.ts";
import { type Aimed } from "../../framework/action-aim.ts";
import type { AimPart } from "../../framework/aim-part.ts";
import type { PartField } from "../../../parts/fields.ts";
import { openingNow, openingSelector, validOpeningTuning, type OpeningTuning } from "../../perception/openings.ts";
import { hold, stillHeld, unheld, type Held } from "../../../control/held.ts";
import type { BodySense } from "../../../core/bodies/senses.ts";
import type { Side } from "../../../core/bodies/bilateral.ts";
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
interface SurfaceConfig { readonly kind: "surface"; readonly tuning?: OpeningTuning }
/** The opening reader's preference for `key`'s part, a score; written empty, the reader's own. */
const preference = (key: "head" | "upperTrunk" | "middleTrunk", label: string): PartField<SurfaceConfig> => ({
  kind: "number", key, label, least: -2, most: 2, step: .05, unit: "score",
  read: (config) => config.tuning?.[key] === undefined ? "" : String(config.tuning[key]),
  write: (config, text) => {
    const { [key]: _, ...rest } = config.tuning ?? {};
    if (text.trim() === "") return { ...config, tuning: rest };
    const value = Number(text);
    return Number.isFinite(value) && value >= -2 && value <= 2 ? { ...config, tuning: { ...rest, [key]: value } } : null;
  },
});
export const SURFACE_AIM: AimPart<SurfaceConfig> = deepFreeze({
  role: "aim", label: "Surface opening", stage: "game", unit: "opening", slots: [], defaults: { kind: "surface", tuning: {} }, keys: { kind: true, tuning: true },
  tuning: ["head", "upperTrunk", "middleTrunk", "blocked", "reachPenalty", "repeated", "overhand", "headLateral", "hookCost", "uppercut", "uppercutReserve", "square"],
  fields: [preference("head", "Head"), preference("upperTrunk", "Upper trunk"), preference("middleTrunk", "Middle trunk")], fits: surfaceAimRefusal,
  faults: (config: SurfaceConfig) => validOpeningTuning(config.tuning === undefined ? {} : config.tuning) ? [] : ["unsupported surface aim"],
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
declare module "../../config.ts" {
  interface AimConfigs { readonly "surface": SurfaceConfig }
}
