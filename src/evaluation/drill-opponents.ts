import type { MindConfig } from "../core/mind/config.ts";
import type { BeatsConfig } from "../core/command/beats.ts";
import type { CommanderConfig } from "../core/command/kind.ts";
import type { OptionMindConfig } from "../core/option/mind.ts";
import { ORDERS_OPTION, STANDING_OPTIONS, STRIKE_OPTION, WINDOWS_WALK, COVER_OPTION } from "../core/option/kinds.ts";
import { deepFreeze } from "../core/state.ts";
import { MINDS } from "../entrants/game.ts";

/** Option Mind as its entrant configures it (`option`): its body layer, its rate and its rise. */
const OPTION = MINDS.option!.config as OptionMindConfig;

/** Who is struck: Option Mind standing where it is (`STANDING_OPTIONS`), its hands at guard, throwing nothing and taking no orders. */
export const STANDS: MindConfig = deepFreeze({ ...OPTION, options: STANDING_OPTIONS, executors: [], actions: [] });

/** A body that goes where it is ordered, its hands held at guard, and throws nothing. */
export const MOVES: MindConfig = deepFreeze({ ...STANDS, options: [ORDERS_OPTION.defaults, ...STANDING_OPTIONS] });

/** A body that goes where it is ordered and covers a blow at its head with a hand (`COVER_OPTION`), else holds its hands at guard. */
const GUARDS: MindConfig = deepFreeze({ ...STANDS, options: [ORDERS_OPTION.defaults, COVER_OPTION.defaults, ...STANDING_OPTIONS] });

/**
 * A body that goes where it is ordered and, ordered at its foe, walks into the window of one of
 * Option Mind's actions `names` as its entrant configures them (each body's record) and throws it,
 * its hands otherwise at guard.
 */
function striking(names: readonly string[]): MindConfig {
  const actions = OPTION.actions.filter((action) => names.includes(action.name));
  return deepFreeze({ ...STANDS, options: [ORDERS_OPTION.defaults, STRIKE_OPTION.defaults, WINDOWS_WALK.defaults, ...STANDING_OPTIONS],
    executors: OPTION.executors.filter((executor) => actions.some((action) => action.executor === executor.name)), actions });
}

/** Option Mind's straight punch with either hand, at the trunk's middle. */
const PUNCHES = striking(["straight-punch"]);

/** On a rhythm: a strike ordered for 2 s, then a stand for 1 s. */
const RHYTHM = [{ seconds: 2, move: { kind: "strike" } }, { seconds: 1, move: { kind: "stand" } }] as const;

/** **A drill's opponent**: what it is called, its mind, and the Commander that leads it on its rhythm (`BeatsConfig`), where it keeps one. */
export interface DrillOpponent {
  readonly label: string;
  readonly mind: MindConfig;
  readonly commander?: CommanderConfig;
}

/** Beats as a Commander's config (`BEATS`). */
const beats = (list: BeatsConfig["beats"]): BeatsConfig => ({ kind: "beats", beats: list });

/** **Each drill opponent**, by the id a drill names it by: a mind that plays its part, led on its rhythm where it has one. None is on a menu. */
export const DRILL_OPPONENTS: Readonly<Record<string, DrillOpponent>> = deepFreeze({
  "drill-stand": { label: "Drill: stand", mind: STANDS },
  "drill-step": { label: "Drill: step in and out", mind: MOVES,
    commander: beats([{ seconds: 1.2, move: { kind: "range", near: .8, far: 1 } }, { seconds: 1.2, move: { kind: "range", near: 1.6, far: 1.8 } }]) },
  "drill-guard": { label: "Drill: guard", mind: GUARDS },
  "drill-punch": { label: "Drill: punch on a rhythm", mind: PUNCHES, commander: beats(RHYTHM) },
  "drill-club": { label: "Drill: club on a rhythm", mind: striking(["club-blow"]), commander: beats(RHYTHM) },
  "drill-sword": { label: "Drill: sword on a rhythm", mind: striking(["cut", "sword-thrust"]), commander: beats(RHYTHM) },
  "drill-press": { label: "Drill: press forward", mind: MOVES, commander: beats([{ seconds: 1, move: { kind: "range", near: .5, far: .7 } }]) },
});

/** The opponent of id `id`: a drill opponent (`DRILL_OPPONENTS`), else a preset a person may pick (`MINDS`), its own judgement unled; undefined for neither. */
export const opponentOf = (id: string): DrillOpponent | undefined =>
  Object.hasOwn(DRILL_OPPONENTS, id) ? DRILL_OPPONENTS[id] : Object.hasOwn(MINDS, id) ? { label: MINDS[id]!.label, mind: MINDS[id]!.config } : undefined;

/** The bout recipe's right side as `opponent` plays it, beside the left's mind and Commander: its mind, and its Commander where it keeps one. */
export function opposed(left: { readonly mind: MindConfig; readonly commander?: CommanderConfig }, opponent: DrillOpponent) {
  return { minds: { left: left.mind, right: opponent.mind },
    commanders: { ...(left.commander ? { left: left.commander } : {}), ...(opponent.commander ? { right: opponent.commander } : {}) } };
}
