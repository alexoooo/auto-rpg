/**
 * **The scorecard's cases**: a mind against itself, each side read, at fixed gaps on the open
 * stage. A set's gaps drawn again a little shifted reads its spread: the same code on gaps 0.5 and
 * 1 cm apart has read a mirror 10 to 18 % silent, so a difference inside a set's spread is not a
 * reading.
 */
import { SIDES } from "../../game/arena/duel.ts";
import type { BodyModel } from "../../core/bodies/models.ts";
import type { MindConfig } from "../../minds/catalog/config.ts";
import { FIGHT_ENTRY } from "../../minds/catalog/catalog.ts";
import { mindOf, seatBody, sideCharacters, type Cases, type Json } from "../evaluation.ts";
import { type GameContext, mindFaultsOf, perContext } from "../../game/arena/context.ts";
import type { ArenaSeat as Side } from "../../game/arena/seat.ts";
import { readScorecard, type ScorecardReading } from "./read.ts";

/** One bout's conditions: the set's draw (0 its first, each next its gaps shifted by `SHIFT` more) and the gap, m. */
export type ScorecardCondition = { readonly draw: number; readonly gap: number };

/** How far each draw's gaps are shifted from the last's, m. */
const SHIFT = .005;

/** `gap` on draw `draw`, m: shifted `SHIFT` a draw. */
export const drawnGap = (gap: number, draw: number): number => Number((gap + draw * SHIFT).toFixed(4));

/** The Warrior's first draw's gaps, 24 from 2.65 to 5.41 m: the scorecard's and the match's. */
export const WARRIOR_GAPS: readonly number[] = Object.freeze(Array.from({ length: 24 }, (_, k) => Number((2.65 + .12 * k).toFixed(4))));

/**
 * A protocol: the body on both sides, empty-handed; the first draw's gaps, m; how many draws; the
 * longest a bout plays, s. A change here is a new protocol.
 */
type Protocol = { readonly body: BodyModel; readonly gaps: readonly number[]; readonly draws: number; readonly seconds: number };

/** The Warrior on itself, 24 gaps from 2.65 to 5.41 m, three draws, two minutes a bout. */
const WARRIOR: Protocol = Object.freeze({ body: "man", gaps: WARRIOR_GAPS, draws: 3, seconds: 120 });

/** The Warrior on itself as `WARRIOR`, nine draws: a reading the three draws' spread cannot tell apart. */
const WARRIOR_DRAWN: Protocol = Object.freeze({ ...WARRIOR, draws: 9 });

export const createScorecardCases = perContext((context: GameContext) => {
  const mindFaults = mindFaultsOf(context), EMPTY = { left: "empty", right: "empty" } as const;

  function scorecardCases(protocol: Protocol): Cases<ScorecardCondition, ScorecardReading> {
    const conditions = Array.from({ length: protocol.draws }, (_, draw) => protocol.gaps.map((gap) => ({ draw, gap: drawnGap(gap, draw) }))).flat();
    return {
      arity: 1,
      play: protocol as unknown as Json,
      conditions,
      seconds: protocol.seconds,
      faults: (value, _condition, seat) => mindFaults(mindOf(value), seatBody(protocol.body, EMPTY, seat), { entry: FIGHT_ENTRY }).map((fault) => `${protocol.body}: ${fault}`),
      world: ([value], { gap }, engine, [seat]) => ({
        kind: "bout", engine, tape: [],
        recipe: { level: "open", left: protocol.body, right: protocol.body, gap, loadouts: { left: EMPTY, right: EMPTY },
          minds: Object.fromEntries(SIDES.map((side) => [side, mindOf(value)])) as Record<Side, MindConfig>,
          capSeconds: protocol.seconds, ...sideCharacters({ left: protocol.body, right: protocol.body }, { left: seat, right: seat }) },
      }),
      read: readScorecard,
    };
  }

  /** Every protocol the scorecard may be played on, by name. */
  const SCORECARD_CASES: Readonly<Record<string, Cases<ScorecardCondition, ScorecardReading>>> = Object.freeze({ warrior: scorecardCases(WARRIOR), "warrior-drawn": scorecardCases(WARRIOR_DRAWN) });

  return { SCORECARD_CASES };
});
