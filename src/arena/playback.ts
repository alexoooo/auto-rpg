import { levelsOf } from "../core/rules/levels.ts";
import { SIDES, type Duel, type Verdict } from "./duel.ts";

/** Seconds of physical aftermath shown before the Arena holds its final view. */
const AFTERMATH_SECONDS = 3;
/** Defeated bodies stay loose throughout the aftermath; survivors retain their own control. */
const AFTERMATH_LEVELS = Object.freeze({ wake: 0, rest: 0, company: 0, clear: 0, settle: AFTERMATH_SECONDS });

/** Page playback preserves the verdict and lets defeated bodies fall under gravity before stopping. */
export function arenaPlayback(duel: Duel, catchUpSeconds: number) {
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
  return {
    advance(seconds: number): void {
      const remaining = duel.verdict ? Math.max(0, duel.verdict.time + AFTERMATH_SECONDS - duel.clock) : Infinity;
      const most = Math.min(Math.ceil(catchUpSeconds * world.hz), Math.round(remaining * world.hz));
      if (most > 0) world.advance(Math.min(seconds, remaining), most);
    },
    dispose(): void { hook.dispose(); },
  };
}
