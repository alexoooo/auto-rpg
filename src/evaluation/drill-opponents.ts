import type { MindPreset } from "../core/mind/controller.ts";
import type { MindConfig } from "../core/mind/config.ts";
import type { DrillOpponentConfig } from "../core/mind/drill-opponent.ts";
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

/** Option Mind's straight punch (`straight-punch`), as its entrant configures it: the body's record (`PunchRecord`) at the trunk's middle, the band it is trained in. */
const PUNCH = OPTION.actions.find((action) => action.name === "straight-punch")!;

/**
 * A body that goes where it is ordered and, ordered at its foe, walks into its punch's window and
 * throws Option Mind's straight punch (`PUNCH`) with either hand, its hands otherwise at guard.
 */
const PUNCHES: MindConfig = deepFreeze({ ...STANDS,
  options: [ORDERS_OPTION.defaults, STRIKE_OPTION.defaults, WINDOWS_WALK.defaults, ...STANDING_OPTIONS],
  executors: OPTION.executors.filter((executor) => executor.name === PUNCH.executor), actions: [PUNCH] });

/** **Each drill opponent**, by the id a drill names it by: its script over a body that plays its part (`DrillOpponentConfig`). None is on a menu. */
export const DRILL_OPPONENTS: Readonly<Record<string, MindPreset<DrillOpponentConfig>>> = deepFreeze({
  "drill-stand": { label: "Drill: stand", offered: false, config: { kind: "drill-opponent", body: STANDS, beats: [] } },
  "drill-step": { label: "Drill: step in and out", offered: false, config: { kind: "drill-opponent", body: MOVES,
    beats: [{ seconds: 1.2, move: { kind: "range", near: .8, far: 1 } }, { seconds: 1.2, move: { kind: "range", near: 1.6, far: 1.8 } }] } },
  "drill-guard": { label: "Drill: guard", offered: false, config: { kind: "drill-opponent", body: GUARDS, beats: [] } },
  "drill-punch": { label: "Drill: punch on a rhythm", offered: false, config: { kind: "drill-opponent", body: PUNCHES,
    beats: [{ seconds: 2, move: { kind: "strike" } }, { seconds: 1, move: { kind: "stand" } }] } },
  "drill-press": { label: "Drill: press forward", offered: false, config: { kind: "drill-opponent", body: MOVES,
    beats: [{ seconds: 1, move: { kind: "range", near: .5, far: .7 } }] } },
});

/** The mind of id `id`: a drill opponent (`DRILL_OPPONENTS`), else a preset a person may pick (`MINDS`); undefined for neither. */
export const opponentOf = (id: string): MindPreset | undefined =>
  Object.hasOwn(DRILL_OPPONENTS, id) ? DRILL_OPPONENTS[id] : Object.hasOwn(MINDS, id) ? MINDS[id] : undefined;
