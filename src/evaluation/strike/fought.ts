/**
 * **A bout's strikes read as the Strike drill's trials are**: each action either side begins at a
 * mark on the other's body, read by its own strike reader (`readStrike`'s `free`) from the step
 * after it is seen, so a bout writes the row a sparring trial writes (`StrikeReading`).
 */
import type { Side } from "../../core/bodies/bilateral.ts";
import type { BuiltBout } from "../bout.ts";
import type { Reader } from "../evaluation.ts";
import { readStrike, type Limb, type Mark, type StrikeReading } from "./read.ts";

/**
 * How a fight's strike reading ends, as sparring's do: on 0.5 s past its action's end, the limb
 * back at its guard within 2 s of that; at most 5 s from its start.
 */
const ENDING = Object.freeze({ seconds: 5, settle: .5, recover: 2, settled: 0, patience: 2 });

/** One strike a bout's side threw: the side, its action and limb, the mark it aimed at, and its reading. */
export type FoughtStrike = { readonly striker: Side; readonly action: string; readonly effector: string; readonly mark: Mark; readonly reading: StrikeReading };

/** The limb an action's effector names (`Limb`), or null for one that is neither a hand nor a foot. */
function limbOf(effector: string): Limb | null {
  const [part, side] = effector.split(".");
  return side !== "left" && side !== "right" ? null : part === "hand" ? { hand: side } : part === "foot" ? { foot: side } : null;
}

/**
 * A bout's strikes as they are thrown (`FoughtStrike`): read after each of its steps, each strike's
 * reading kept once its reader ends, or at the bout's end where it has not (`done`).
 */
export function readFought(built: BuiltBout): { afterStep(): void; done(): readonly FoughtStrike[] } {
  const { duel } = built, seen = { left: new Set<number>(), right: new Set<number>() } as Record<Side, Set<number>>;
  const live: { readonly strike: Omit<FoughtStrike, "reading">; readonly reader: Reader<StrikeReading> }[] = [], read: FoughtStrike[] = [];
  return {
    afterStep() {
      for (let k = live.length - 1; k >= 0; k--) {
        const one = live[k]!;
        one.reader.afterStep();
        if (one.reader.ended) { read.push({ ...one.strike, reading: one.reader.reading() }); live.splice(k, 1); }
      }
      for (const striker of ["left", "right"] as const) {
        const me = duel.duelists[striker], foe = duel.duelists[striker === "left" ? "right" : "left"], skills = me.minded.skills;
        if (!skills) continue;
        for (const action of skills.report.actions) {
          if (seen[striker].has(action.id)) continue;
          seen[striker].add(action.id);
          const target = action.target, limb = limbOf(action.effector);
          if (target.kind !== "body" || target.body !== foe.id || target.region.kind !== "mark" || !limb) continue;
          live.push({ strike: { striker, action: action.action, effector: action.effector, mark: target.region.mark as Mark },
            reader: readStrike(built, { mark: target.region.mark as Mark, ...limb }, ENDING, undefined, { striker, action: action.id }) });
        }
      }
    },
    done() {
      for (const one of live) read.push({ ...one.strike, reading: one.reader.reading() });
      live.length = 0;
      return read;
    },
  };
}
