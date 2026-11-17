import { hypot, tanh } from "../../core/math/real.ts";
import { anyBody, type KeysOf } from "../../parts/parts.ts";
import type { PartField } from "../../parts/fields.ts";
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
 * One interface, so the few terms (`fewTerms`) and a learned or non-combat value are each an
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

/** What a bout the clock ends even costs each side, life: as much as a lost one (`MARGIN`), so neither waits out an even bout. */
const DRAW = MARGIN;

/** The lead, life, within which a bout reads as even at the clock (`atBell`): a light touch, short of a landed blow. */
const EVEN = .02;

/**
 * **What a lead of `lead` is worth at the clock's verdict**, life: as much as the lead where it is
 * narrow, never more than `MARGIN` won or lost however wide, less `DRAW` where it is even (within
 * about `EVEN`).
 */
const atBell = (lead: number): number => MARGIN * tanh(lead / MARGIN) - DRAW * (1 - Math.abs(tanh(lead / EVEN)));

/**
 * **How much more a body values a share of the focus's life it takes than as much of its own it
 * loses** (`FewTermsConfig.aggression`), unless its config says. Between two bodies alike a trade is
 * even at best, so a body that values the two alike gains nothing by closing and waits out of reach
 * until the clock moves it (`atBell`). Set for the prices as they are: a body's profiles price
 * closing on a body like it at three to four times the life it expects to deal there, so at 2 or 3
 * two Warriors on `straight-punch/moving` stand a step out of reach for most of a bout, and at 4
 * they fight until one is down (`docs/approaches.md`, minds).
 */
export const AGGRESSION = 4;

/** **The few terms' config**: its aggression (`AGGRESSION` unless given). */
export interface FewTermsConfig { readonly kind: "few-terms"; readonly aggression?: number }

/** The aggressions a config may name: from valuing the focus's life as the body's own to five times it. */
const AGGRESSIONS = Object.freeze({ least: 1, most: 5, step: .1 });

/**
 * **A path's worth by the few terms**, life: the metres it walks as ordered, at `obedience` (orders
 * first where the orders are firm, `Orders.firm`), and the life it trades (`net`: the focus's it
 * takes, at `aggression` and more where the orders name the focus, less its own it loses), valued by how late in the
 * bout it is (`Situation.lateness`): as itself at the bout's start, and at its end by what each side
 * of the trade is worth at the verdict against the lead now (`atBell`), read apart, the life dealt
 * and the life taken each as though it came alone. So late, a body behind gains more by a blow it
 * deals than it loses by one it takes, and presses; one ahead the reverse, and keeps its lead; and
 * an even bout is worth breaking, since waiting keeps the draw's cost. Read as one net, each would
 * wait whenever a trade loses on average, and a bout once led would stand to the bell.
 */
function fewTermsWorth(path: Path, now: Situation, obedience: Obedience, aggression: number): number {
  const named = now.orders?.foe !== undefined && now.orders.foe === now.focus?.id, obeying = now.orders?.firm ? FIRST : obedience;
  const dealt = aggression * path.dealt * (named ? 1 + obeying.foe : 1), late = now.lateness, lead = now.lead, bell = atBell(lead);
  return obeying.metre * path.orders + (1 - late) * (dealt - path.taken) + late * (atBell(lead + dealt) - bell + atBell(lead - path.taken) - bell);
}

/** **The few terms** (`fewTermsWorth`) at `aggression`: combat's objective, the lives a path trades, its orders and the lead at the verdict; made once an aggression. */
const FEW_TERMS = new Map<number, Objective>();
function fewTerms(aggression: number): Objective {
  let made = FEW_TERMS.get(aggression);
  if (!made) FEW_TERMS.set(aggression, made = deepFreeze({ name: "few terms", worth: (path: Path, now: Situation, obedience: Obedience) => fewTermsWorth(path, now, obedience, aggression) }));
  return made;
}

/** A config's aggression as a person sets it (`AGGRESSIONS`): written as none at `AGGRESSION`, so a config at it equals the preset. */
const AGGRESSION_FIELD: PartField<FewTermsConfig> = {
  kind: "number", key: "aggression", label: "Aggression", ...AGGRESSIONS, unit: "×",
  read: (config) => String(config.aggression ?? AGGRESSION),
  write: (config, text) => {
    const value = text.trim() === "" ? NaN : Number(text);
    if (!Number.isFinite(value) || value < AGGRESSIONS.least || value > AGGRESSIONS.most) return null;
    const { aggression: _, ...rest } = config;
    return value === AGGRESSION ? rest : { ...rest, aggression: value };
  },
};

/** **The few terms** (`fewTerms`) as a part of role `objective`: what a chooser that values options prices them by. */
export const FEW_TERMS_PART = deepFreeze<ObjectivePart<FewTermsConfig, Objective>>({
  role: "objective", label: "Combat", stage: "game", fields: [AGGRESSION_FIELD], slots: [], defaults: { kind: "few-terms" }, keys: { kind: true, aggression: true },
  fits: anyBody,
  faults: (config: FewTermsConfig) => config.aggression === undefined || Number.isFinite(config.aggression) && config.aggression >= AGGRESSIONS.least && config.aggression <= AGGRESSIONS.most
    ? [] : [`aggression: a number from ${AGGRESSIONS.least} to ${AGGRESSIONS.most}`],
  make: (config: FewTermsConfig) => fewTerms(config.aggression ?? AGGRESSION),
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
    readonly "few-terms": FewTermsConfig;
    readonly "reach-place": ReachConfig;
  }
}
