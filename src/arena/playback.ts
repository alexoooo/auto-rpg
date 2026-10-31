import { levelsOf } from "../core/rules/levels.ts";
import { SIDES, type Duel, type Verdict } from "./duel.ts";

/** Seconds of physical aftermath shown before the Arena holds its final view. */
const AFTERMATH_SECONDS = 3;
/** Defeated bodies stay loose throughout the aftermath; survivors retain their own control. */
const AFTERMATH_LEVELS = Object.freeze({ wake: 0, rest: 0, company: 0, clear: 0, settle: AFTERMATH_SECONDS });

/**
 * Page playback preserves the verdict and lets defeated bodies fall under gravity before stopping;
 * given `until`, s of the bout's clock, it stops there: a recorded case where its scoring stopped.
 */
export function arenaPlayback(duel: Duel, catchUpSeconds: number, until = Infinity) {
  const { world } = duel, state = { verdict: null as Verdict | null };
  const settle = () => {
    if (!duel.verdict) { state.verdict = null; return; }
    if (state.verdict === duel.verdict) return;
    state.verdict = duel.verdict;
    const { winner, ending } = state.verdict;
    const asks = SIDES.map(side => {
      const { body } = duel.duelists[side];
      return { side, level: body.level, at: body.physical.centre, waiting: false,
        out: ending !== "time" && side !== winner ? 0 : null };
    });
    levelsOf(asks, AFTERMATH_LEVELS).forEach((level, i) => duel.duelists[SIDES[i]!].body.setLevel(level));
  };
  const hook = world.sense(settle);
  /** The steps left to play: to `until`, or to the end of the verdict's aftermath. */
  const left = () => Math.round(Math.min(until - duel.clock, duel.verdict ? duel.verdict.time + AFTERMATH_SECONDS - duel.clock : Infinity) * world.hz);
  return {
    advance(seconds: number): number {
      const most = Math.min(Math.ceil(catchUpSeconds * world.hz), left());
      return most > 0 ? world.advance(Math.min(seconds, most / world.hz), most) : 0;
    },
    /** Whether nothing is left to play. */
    get done(): boolean { return left() <= 0; },
    dispose(): void { hook.dispose(); },
  };
}
