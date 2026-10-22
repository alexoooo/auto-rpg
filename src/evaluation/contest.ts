/** **A bout as a contest's case**: what is read of it, and the figures every contest reports. */
import type { DuelEnding } from "../arena/duel.ts";
import { isClash } from "../core/rules/blows.ts";
import type { Side } from "../core/spec/body.ts";
import type { BuiltBout } from "./bout.ts";
import type { ContestReading, Figure, Reader } from "./evaluation.ts";

/**
 * What a bout came to: the winner (null a draw) and how, when, how many blows landed (clashes not
 * counted), each side's bar at the end and, played here, every 10 s of the bout and at its end;
 * the left's score and margin (its bar less the right's). An imported bout has no series.
 */
export type BoutReading = ContestReading & {
  readonly winner: Side | null;
  readonly ending: DuelEnding;
  readonly seconds: number;
  readonly blows: number;
  readonly bars: readonly [number, number];
  readonly series?: readonly (readonly [number, number])[];
};

/** How often a bout's bars are read into its series, simulated s. */
export const SERIES_SECONDS = 10;

/** A bout's reader: its bars every `SERIES_SECONDS` and at the verdict. */
export function readBout(built: BuiltBout): Reader<BoutReading> {
  const { duel } = built, every = SERIES_SECONDS * built.world.hz, series: (readonly [number, number])[] = [];
  const bars = (): readonly [number, number] => [duel.duelists.left.pool.bar(), duel.duelists.right.pool.bar()];
  let steps = 0, last = -1;
  return {
    afterStep() { if (++steps % every === 0) { series.push(bars()); last = steps; } },
    get ended() { return duel.verdict !== null; },
    reading() {
      const verdict = duel.verdict!, end = bars();
      if (last !== steps) series.push(end);
      return {
        winner: verdict.winner, ending: verdict.ending, seconds: duel.clock,
        blows: duel.blows.filter((blow) => !isClash(blow)).length, bars: end, series,
        score: scoreOf(verdict.winner), margin: end[0] - end[1],
      };
    },
  };
}

/** The left's score for a bout won by `winner`: 1, a half for a draw, 0. */
export const scoreOf = (winner: Side | null): number => winner === null ? 0.5 : winner === "left" ? 1 : 0;

/** A contest's figures for a side: its score, its margin, and whether it won. */
export const CONTEST_FIGURES: readonly Figure<BoutReading>[] = [
  { name: "score", unit: "a win 1, a draw a half", kind: "mean", better: "higher", of: (r, side) => side === "left" ? r.score : 1 - r.score },
  { name: "margin", unit: "own bar less the other's", kind: "mean", better: "higher", of: (r, side) => side === "left" ? r.margin : -r.margin },
  { name: "won", unit: "share of bouts", kind: "rate", better: "higher", of: (r, side) => r.winner === side },
];
