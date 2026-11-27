/**
 * **The tournament's cases**: two entrants (a mind on a character with a loadout) in an arena bout,
 * each on each side, at each gap, by the Arena's rules.
 */
import { CAP_SECONDS } from "../../game/arena/duel.ts";
import type { ArenaLevel } from "../../game/arena/levels.ts";
import { type Loadout } from "../../core/bodies/items/held.ts";
import { REPRESENTATIVE } from "../loadouts.ts";
import type { BodyModel } from "../../core/bodies/models.ts";
import { readBout, type BoutReading } from "../contest.ts";
import { mindOf, sideCharacters, type Cases, type Json } from "../evaluation.ts";
import { drawnGap, WARRIOR_GAPS } from "../scorecard/cases.ts";

/**
 * How a pair meets: once on each side at each gap, m, to the Arena's time limit, with no limit on
 * lying down; the field's loadouts are the representative ones (`REPRESENTATIVE`).
 */
export const TOURNAMENT = Object.freeze({
  level: "open" as ArenaLevel, loadouts: REPRESENTATIVE, gaps: Object.freeze([4]), capSeconds: CAP_SECONDS,
});

/**
 * A pair at each of the scorecard's 24 gaps, 2.65 to 5.41 m (`WARRIOR_GAPS`), once on each side:
 * enough bouts to read how often one entrant wounds or knocks out another, where the standard's one
 * gap is enough only to rate the field.
 */
const GAPS = Object.freeze({ ...TOURNAMENT, gaps: WARRIOR_GAPS });

/**
 * The same 24 gaps on six further draws, 3 to 8, each shifted 0.5 cm more (`gaps-drawn`, as the
 * match's `warrior-drawn`): 144 gaps, 288 bouts a pair, where 48 cannot tell apart readings of a
 * rat that differ by a tenth of the score.
 */
const GAPS_DRAWN = Object.freeze({ ...TOURNAMENT, gaps: Object.freeze([3, 4, 5, 6, 7, 8].flatMap((draw) => WARRIOR_GAPS.map((gap) => drawnGap(gap, draw)))) });

/**
 * The same 24 gaps on six draws no reading is played on, 9 to 14 (`measuring`): the bouts the
 * measuring command plays (`research/minds/measure.mjs`), so what is fitted to them is read on
 * other bouts.
 */
const MEASURING = Object.freeze({ ...TOURNAMENT, gaps: Object.freeze([9, 10, 11, 12, 13, 14].flatMap((draw) => WARRIOR_GAPS.map((gap) => drawnGap(gap, draw)))) });

/** An entrant as a case's subject: its mind's config, its character and what each hand holds. */
export type Entrant = { readonly mind: Json; readonly model: BodyModel; readonly loadout: Loadout };

/** A bout's condition: the gap, m. */
export type TournamentCondition = { readonly gap: number };

/** The tournament on `protocol`. */
function tournamentCases(protocol: typeof TOURNAMENT): Cases<TournamentCondition, BoutReading> {
  return {
    arity: 2,
    play: protocol as unknown as Json,
    conditions: protocol.gaps.map((gap) => ({ gap })),
    seconds: protocol.capSeconds,
    world: (values, { gap }, engine, seats) => {
      const [left, right] = values as unknown as readonly Entrant[];
      return { kind: "bout", engine, tape: [], recipe: {
        level: protocol.level, left: left.model, right: right.model, gap, loadouts: { left: left.loadout, right: right.loadout },
        minds: { left: mindOf(left.mind), right: mindOf(right.mind) },
        capSeconds: protocol.capSeconds, ...sideCharacters({ left: left.model, right: right.model }, { left: seats[0], right: seats[1] }),
      } };
    },
    read: readBout,
  };
}

/** Every protocol the tournament is played on, by name. */
export const TOURNAMENT_CASES: Readonly<Record<string, Cases<TournamentCondition, BoutReading>>> = Object.freeze({
  standard: tournamentCases(TOURNAMENT), gaps: tournamentCases(GAPS), "gaps-drawn": tournamentCases(GAPS_DRAWN), measuring: tournamentCases(MEASURING),
});
