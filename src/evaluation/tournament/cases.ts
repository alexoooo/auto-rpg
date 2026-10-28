/**
 * **The tournament's cases**: two entrants (a mind on a character with a loadout) in an arena bout,
 * each on each side, at each gap, by the Arena's rules.
 */
import { CAP_SECONDS } from "../../arena/duel.ts";
import type { ArenaLevel } from "../../arena/levels.ts";
import { REPRESENTATIVE, type Loadout } from "../../core/items/held.ts";
import type { MindConfig } from "../../core/mind/config.ts";
import type { BodyModel } from "../../core/models.ts";
import { readBout, type BoutReading } from "../contest.ts";
import { sideAttributes, type Cases, type Json } from "../evaluation.ts";

/**
 * How a pair meets: once on each side at each gap, m, to the Arena's time limit, with no limit on
 * lying down; the field's loadouts are the representative ones (`REPRESENTATIVE`).
 */
export const TOURNAMENT = Object.freeze({
  level: "open" as ArenaLevel, loadouts: REPRESENTATIVE, gaps: Object.freeze([4]), capSeconds: CAP_SECONDS, recoverySeconds: null,
});

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
    world: (values, { gap }, engine, characters) => {
      const [left, right] = values as unknown as readonly Entrant[];
      return { kind: "bout", engine, tape: [], recipe: {
        level: protocol.level, left: left.model, right: right.model, gap, loadouts: { left: left.loadout, right: right.loadout },
        minds: { left: left.mind as unknown as MindConfig, right: right.mind as unknown as MindConfig },
        capSeconds: protocol.capSeconds, recoverySeconds: protocol.recoverySeconds, ...sideAttributes({ left: characters[0], right: characters[1] }),
      } };
    },
    read: readBout,
  };
}

/** Every protocol the tournament is played on, by name. */
export const TOURNAMENT_CASES: Readonly<Record<string, Cases<TournamentCondition, BoutReading>>> = Object.freeze({
  standard: tournamentCases(TOURNAMENT),
});
