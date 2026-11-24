/** **A bout as a contest's case**: what is read of it, and the figures every contest reports. */
import type { DuelEnding } from "../game/arena/duel.ts";
import { isClash, type LandedBlow } from "../combat/blows.ts";

import type { BuiltBout } from "./bout.ts";
import type { ContestReading, Figure, Reader } from "./evaluation.ts";
import type { ArenaSeat as Side } from "../game/arena/seat.ts";

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

/** One side's part in a landed blow (`LandedBlow.sides`). */
type BlowPart = LandedBlow["sides"][number];

/**
 * **What the blows of the step just played pay, a second**: of each blow landed within half a step
 * of now that touched both sides, `pay` of the left side's part and the right side's, over the
 * step's seconds, so that summed over a decision each blow is paid once as it lands.
 */
export function stepBlows(built: { readonly duel: { readonly blows: readonly LandedBlow[] }; readonly world: { readonly time: number; readonly hz: number } },
  pay: (left: BlowPart, right: BlowPart) => number): number {
  const blows = built.duel.blows, now = built.world.time, dt = 1 / built.world.hz;
  let paid = 0;
  for (let k = blows.length - 1; k >= 0 && blows[k]!.time > now - dt / 2; k--) {
    const sides = blows[k]!.sides, left = sides.find((side) => side.fighter === "left"), right = sides.find((side) => side.fighter === "right");
    if (left && right) paid += pay(left, right);
  }
  return paid / dt;
}

/** How often a bout's bars are read into its series, simulated s. */
export const SERIES_SECONDS = 10;

/** A bout's reader: its bars every `SERIES_SECONDS` and at the verdict. */
export function readBout(built: BuiltBout): Reader<BoutReading> {
  const { duel } = built, every = SERIES_SECONDS * built.world.hz, series: (readonly [number, number])[] = [];
  const bars = (): readonly [number, number] => [duel.life("left"), duel.life("right")];
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

/** How soon a bout should end by a body's life, s: the pace a fight is read against. */
export const KNOCKOUT_WITHIN = 60;

/** The other side's bar at a bout's end: the right's for the left, the left's for the right. */
const foeBar = (r: BoutReading, side: Side): number => r.bars[side === "left" ? 1 : 0];

/**
 * The other side's bar at `KNOCKOUT_WITHIN` s, or at the end where the bout ended sooner, from the
 * bout's series (`SERIES_SECONDS` apart); null for a bout with none. The game's drain begins only
 * then (`DRAIN_END`), so what it lost by then it lost to blows.
 */
function foeBarWithin(r: BoutReading, side: Side): number | null {
  if (!r.series?.length) return null;
  return r.series[Math.min(KNOCKOUT_WITHIN / SERIES_SECONDS, r.series.length) - 1]![side === "left" ? 1 : 0];
}

/**
 * A contest's figures for a side: its score, its margin, whether it won, how much of the other
 * side's life it took within `KNOCKOUT_WITHIN`, and whether it took all of it.
 */
export const CONTEST_FIGURES: readonly Figure<BoutReading>[] = [
  { name: "score", unit: "a win 1, a draw a half", kind: "mean", better: "higher", of: (r, side) => side === "left" ? r.score : 1 - r.score },
  { name: "margin", unit: "own bar less the other's", kind: "mean", better: "higher", of: (r, side) => side === "left" ? r.margin : -r.margin },
  { name: "won", unit: "share of bouts", kind: "rate", better: "higher", of: (r, side) => r.winner === side },
  { name: `taken within ${KNOCKOUT_WITHIN} s`, unit: `share of the other side's life taken by ${KNOCKOUT_WITHIN} s, or by the end where sooner`, kind: "mean", better: "higher",
    of: (r, side) => { const bar = foeBarWithin(r, side); return bar === null ? null : 1 - bar; } },
  { name: `knockout within ${KNOCKOUT_WITHIN} s`, unit: `share of bouts the other side's bar is empty within ${KNOCKOUT_WITHIN} s`, kind: "rate", better: "higher",
    of: (r, side) => foeBar(r, side) <= 0 && r.seconds <= KNOCKOUT_WITHIN },
];
