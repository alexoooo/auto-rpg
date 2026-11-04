import { hypot, tanh } from "../math/real.ts";
import { anyBody, type KeysOf } from "../parts/parts.ts";
import { deepFreeze } from "../state.ts";
import type { Situation } from "./option.ts";
import type { ObjectivePart } from "./parts.ts";
import { FIRST, type Obedience } from "./value.ts";

/**
 * **One path of a line** (`Objective.worth`): what the Options along it bring, summed (each in
 * life, a share of a body's full life, and the metres walked as ordered), the seconds they run
 * before the body holds (`seconds`), the span every line compared at a decision is priced over,
 * the holding at its end included (`span`), and the state the path ends in (`end`).
 */
export interface Path {
  readonly dealt: number;
  readonly taken: number;
  readonly orders: number;
  readonly seconds: number;
  readonly span: number;
  readonly end: Situation;
}

/**
 * **An objective**: what a path (`Path`) is worth to the body deciding at `now`, in life (the
 * verdict's unit), its orders carried out at `obedience`; a path is read at the call and not kept.
 * One interface, so the few terms (`FEW_TERMS`) and a learned or non-combat value are each an
 * implementation of it; its memory, where it keeps one, is in `state`, plain data, which its
 * chooser keeps with its own.
 */
export interface Objective {
  readonly name: string;
  readonly state?: object;
  worth(path: Path, now: Situation, obedience: Obedience): number;
}

/**
 * The few terms' weights, set for the play they give: how long before the clock's verdict the
 * lead comes to count, s, from none to whole (`late`); what the verdict is worth, life, a win
 * against a loss less as much (`verdict`); and the lead, life, at which three quarters of it is
 * as good as won (`margin`).
 */
const TERMS = deepFreeze({ late: 60, verdict: 1, margin: .1 });

/** The share of the lead at stake `seconds` s from now: none `TERMS.late` s or more before the clock's verdict, the whole at it. */
const lateness = (now: Situation, seconds: number): number => Math.min(1, Math.max(0, 1 - (now.left - seconds) / TERMS.late));

/** **What a lead of `lead` is worth at the clock's verdict**, life: the verdict's worth won ahead, lost behind, the more surely the wider the lead (`TERMS`). */
const verdict = (lead: number): number => TERMS.verdict * tanh(lead / TERMS.margin);

/**
 * **A path's worth by the few terms**, life: the focus's life it takes, more where the orders name
 * the focus, less its own it loses, and the metres it walks as ordered, each at `obedience` (orders
 * first where the orders are firm, `Orders.firm`); and, late in the bout (`lateness` at the span's
 * end), what the lead it leaves is worth at the verdict against the lead now (`verdict`), so a lead
 * at stake weighs what may lose it.
 */
function fewTermsWorth(path: Path, now: Situation, obedience: Obedience): number {
  const named = now.orders?.foe !== undefined && now.orders.foe === now.focus?.id, obeying = now.orders?.firm ? FIRST : obedience, lead = now.lead;
  return path.dealt * (named ? 1 + obeying.foe : 1) - path.taken + obeying.metre * path.orders
    + lateness(now, path.span) * (verdict(lead + path.dealt - path.taken) - verdict(lead));
}

/** **The few terms** (`FEW_TERMS`): combat's objective, the lives a path trades, its orders and the lead at the verdict. */
export const FEW_TERMS: Objective = deepFreeze({ name: "few terms", worth: fewTermsWorth });

/** **The few terms** (`FEW_TERMS`) as a part of role `objective`: what a chooser that values options prices them by. */
export const FEW_TERMS_PART: ObjectivePart<{ readonly kind: "few-terms" }, Objective> = deepFreeze({
  role: "objective", label: "Few terms", stage: "game", fields: [], slots: [], defaults: { kind: "few-terms" }, keys: { kind: true },
  fits: anyBody, faults: () => [], make: () => FEW_TERMS,
});

/**
 * What reaching a place weighs, set for the play it gives: lying down costs as much as
 * standing `down` m further off, and a second spent before holding as `second` m, so of two ways
 * there the quicker is worth more.
 */
const REACH = deepFreeze({ down: 10, second: .1 });

/** **A place on the ground to reach**: where it is, m. */
export interface ReachConfig { readonly kind: "reach-place"; readonly x: number; readonly z: number }

/**
 * **Reaching a place** (`ReachConfig`), with no foe to fight: a path worth how near the place it
 * leaves the body (`Situation.where`), less as much again as `REACH.down` m where it is down there,
 * and its time before it holds (`REACH.second`).
 */
function reachPlace(config: ReachConfig): Objective {
  return deepFreeze({
    name: "reach a place",
    worth: (path: Path): number => {
      const end = path.end, at = end.where;
      return -hypot(config.x - at.x, config.z - at.z) - (end.down ? REACH.down : 0) - REACH.second * path.seconds;
    },
  });
}

/** **Reaching a place** (`reachPlace`) as a part of role `objective`. */
export const REACH_PLACE_PART: ObjectivePart<ReachConfig, Objective> = deepFreeze({
  role: "objective", label: "Reach a place", stage: "game", fields: [], slots: [], defaults: { kind: "reach-place", x: 0, z: 0 },
  keys: { kind: true, x: true, z: true } as KeysOf<ReachConfig>, fits: anyBody,
  faults: (config: ReachConfig) => Number.isFinite(config.x) && Number.isFinite(config.z) ? [] : ["x, z: a place, m"],
  make: reachPlace,
});
