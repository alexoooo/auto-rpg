import { hypot, tanh } from "../../core/math/real.ts";
import { anyBody, type KeysOf } from "../../parts/parts.ts";
import { deepFreeze } from "../../core/state.ts";
import type { Situation } from "./option.ts";
import type { ObjectivePart } from "./parts.ts";
import { FIRST, type Obedience } from "./value.ts";

/**
 * **One path of a line** (`Objective.worth`): what the Options along it bring, summed (each in
 * life, a share of a body's full life, and the metres walked as ordered), the seconds they run
 * before the body holds (`seconds`), and the state the path ends in (`end`).
 */
export interface Path {
  readonly dealt: number;
  readonly taken: number;
  readonly orders: number;
  readonly seconds: number;
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

/** The lead, life, past which a wider one is worth less and less at the clock's verdict (`verdict`). */
const MARGIN = .1;

/** **What a lead of `lead` is worth at the clock's verdict**, life: as much as the lead where it is narrow, never more than `MARGIN` won or lost however wide. */
const verdict = (lead: number): number => MARGIN * tanh(lead / MARGIN);

/**
 * **A path's worth by the few terms**, life: the metres it walks as ordered, at `obedience` (orders
 * first where the orders are firm, `Orders.firm`), and the life it trades (`net`: the focus's it
 * takes, more where the orders name the focus, less its own it loses), valued by how late in the
 * bout it is (`Situation.lateness`): as itself at the bout's start, and at its end by what the lead
 * it leaves is worth at the verdict against the lead now (`verdict`, of slope 1 at an even lead),
 * so a lead at stake late weighs what may lose it.
 */
function fewTermsWorth(path: Path, now: Situation, obedience: Obedience): number {
  const named = now.orders?.foe !== undefined && now.orders.foe === now.focus?.id, obeying = now.orders?.firm ? FIRST : obedience;
  const net = path.dealt * (named ? 1 + obeying.foe : 1) - path.taken, late = now.lateness, lead = now.lead;
  return obeying.metre * path.orders + (1 - late) * net + late * (verdict(lead + net) - verdict(lead));
}

/** **The few terms** (`FEW_TERMS`): combat's objective, the lives a path trades, its orders and the lead at the verdict. */
const FEW_TERMS: Objective = deepFreeze({ name: "few terms", worth: fewTermsWorth });

/** **The few terms** (`FEW_TERMS`) as a part of role `objective`: what a chooser that values options prices them by. */
export const FEW_TERMS_PART = deepFreeze<ObjectivePart<{ readonly kind: "few-terms" }, Objective>>({
  role: "objective", label: "Combat", stage: "game", fields: [], slots: [], defaults: { kind: "few-terms" }, keys: { kind: true },
  fits: anyBody, faults: () => [], make: () => FEW_TERMS,
});

/**
 * What reaching a place weighs, set for the play it gives: lying down costs as much as
 * standing `down` m further off, and a second spent before holding as `second` m, so of two ways
 * there the quicker is worth more.
 */
const REACH = deepFreeze({ down: 10, second: .1 });

/** **A place on the ground to reach**: where it is, m. */
interface ReachConfig { readonly kind: "reach-place"; readonly x: number; readonly z: number }

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
export const REACH_PLACE_PART = deepFreeze<ObjectivePart<ReachConfig, Objective>>({
  role: "objective", label: "Reach a place", stage: "game", offered: false, fields: [], slots: [], defaults: { kind: "reach-place", x: 0, z: 0 },
  keys: { kind: true, x: true, z: true } as KeysOf<ReachConfig>, fits: anyBody,
  faults: (config: ReachConfig) => Number.isFinite(config.x) && Number.isFinite(config.z) ? [] : ["x, z: a place, m"],
  make: reachPlace,
});

declare module "./parts.ts" {
  interface ObjectiveConfigs {
    readonly "few-terms": { readonly kind: "few-terms" };
    readonly "reach-place": ReachConfig;
  }
}
