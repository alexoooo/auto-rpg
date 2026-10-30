import { LOADOUTS } from "../../core/items/held.ts";
import type { BoutReading } from "../contest.ts";
import type { Cases, Json } from "../evaluation.ts";
import { TOURNAMENT, TOURNAMENT_CASES, type TournamentCondition } from "../tournament/cases.ts";

/** The same Arena bouts as the tournament, admitting the whole legal loadout catalogue. */
export const SKELETON_COMBAT_CASES: Readonly<Record<string, Cases<TournamentCondition, BoutReading>>> = Object.freeze({
  standard: { ...TOURNAMENT_CASES.standard!, play: { ...TOURNAMENT, loadouts: LOADOUTS } as unknown as Json },
});
