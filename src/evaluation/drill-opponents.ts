import type { MindPreset } from "../core/mind/controller.ts";
import type { MindConfig } from "../core/mind/config.ts";
import { FIGHTING } from "../core/tactics/config.ts";
import type { DrillOpponentConfig } from "../core/mind/drill-opponent.ts";
import { deepFreeze } from "../core/state.ts";
import { CLASSIC, PUNCHER } from "../entrants/classic/presets.ts";
import { MINDS } from "../entrants/game.ts";

/** Who is struck: a Warrior with empty hands that stands in guard and throws nothing. */
export const STANDS: MindConfig = deepFreeze({ ...CLASSIC, tactics: { kind: "stand" }, actions: [], executors: [] });

/** A body that goes where it is ordered, its hands held in the pose, and throws nothing. */
const MOVES: MindConfig = deepFreeze({ ...STANDS, tactics: { ...FIGHTING, list: [{ kind: "follow-orders" }, { kind: "cover", guard: "pose" }] } });

/** A body that goes where it is ordered and covers a threat with its hands. */
const GUARDS: MindConfig = deepFreeze({ ...MOVES, tactics: { ...FIGHTING, list: [{ kind: "follow-orders" }, { kind: "cover", guard: "cover" }] } });

/**
 * A body that goes where it is ordered and, ordered at its foe, closes and throws the Puncher's
 * straight punch with either hand (its rear one, mostly; with its lead hand alone the first comes
 * after 3.6 s from 1.4 m, too late for a rhythm).
 */
const PUNCHES: MindConfig = deepFreeze({ ...PUNCHER,
  tactics: { ...FIGHTING, list: [{ kind: "follow-orders" }, { kind: "attack" }, { kind: "approach" }, { kind: "cover", guard: "pose" }] } });

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
