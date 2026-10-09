import type { BodyView } from "../body.ts";
import type { BlowAttack } from "../mind/intent.ts";
import type { Side } from "../spec/body.ts";
import type { BlowSkill } from "./skill.ts";
import type { StrikeReport } from "./strike.ts";

/**
 * **How a blow is given to one of several blow skills**, as each blow begins; none draws a random
 * number:
 * - `first-able`: the first that accepts it;
 * - `rotate`: the next that accepts it after the one that began the last blow;
 * - `scored`: the one that accepts it with the most (landed + 1) / (thrown + 2) of its own blows,
 *   ties to the earlier.
 */
export type ChoosePolicy = "first-able" | "rotate" | "scored";

/** Whether `hand`'s touch, as the body's view reads it (`BodyOptions.feedback`), is on a body its senses carry as a foe's. */
function onFoe(view: BodyView, hand: Side): boolean {
  const target = view.effectors[`hand.${hand}`]?.feedback?.contact?.target;
  if (!target || target.kind !== "body") return false;
  for (const other of view.senses.others) if (other.id === target.body) return other.side !== view.senses.side;
  return false;
}

/**
 * **A blow skill that chooses among `options`** by `policy` (`ChoosePolicy`). A choice is made as
 * a blow begins; the option chosen keeps the body until it is no longer busy (`BlowSkill.busy`),
 * and the others are given nothing, each resumed (`Skill.resume`) when the body is its own again.
 * It counts each option's blows, and those that landed: whose hand touched a foe (`onFoe`) while
 * it was busy. What it counts and which option has the body are in its `state`, with each
 * option's own. Its report is the option's that has the body, with the blows thrown summed over
 * every option and a hand's range the first option's, as the tactics plan by the first.
 */
export function chooseSkill(options: readonly BlowSkill[], policy: ChoosePolicy): BlowSkill {
  if (options.length === 0) throw new Error("a choice needs a blow to choose");
  const state = {
    /** The option that has the body. */
    current: 0,
    /** The option that began the last blow, or null before any. */
    last: null as number | null,
    /** Whether the option that has the body was busy after its last command, and whether its hand met a foe meanwhile. */
    busy: false, touched: false,
    counts: options.map(() => ({ thrown: 0, landed: 0 })),
    options: options.map((option) => option.state),
  };
  const score = (i: number) => (state.counts[i]!.landed + 1) / (state.counts[i]!.thrown + 2);
  const pick = (attack: BlowAttack): number | null => {
    const n = options.length;
    switch (policy) {
      case "first-able":
        for (let i = 0; i < n; i++) if (options[i]!.accepts(attack)) return i;
        return null;
      case "rotate":
        for (let k = 1; k <= n; k++) {
          const i = ((state.last ?? -1) + k) % n;
          if (options[i]!.accepts(attack)) return i;
        }
        return null;
      case "scored": {
        let best: number | null = null;
        for (let i = 0; i < n; i++) if (options[i]!.accepts(attack) && (best === null || score(i) > score(best))) best = i;
        return best;
      }
      default: { const never: never = policy; throw new Error(`no policy ${JSON.stringify(never)}`); }
    }
  };
  const held = () => options[state.current]!;
  const first = options[0]!.report;
  const report: StrikeReport = {
    get impact() { return held().report.impact; },
    get hand() { return held().report.hand; },
    get phase() { return held().report.phase; },
    get returning() { return held().report.returning; },
    get overlapHand() { return held().report.overlapHand; },
    get blow() { return held().report.blow; },
    get chosen() { return held().report.chosen; },
    get distance() { return held().report.distance; },
    get since() { return held().report.since; },
    thrown: {
      get left() { let sum = 0; for (const option of options) sum += option.report.thrown.left; return sum; },
      get right() { let sum = 0; for (const option of options) sum += option.report.thrown.right; return sum; },
    },
    get pointCycle() { return held().report.pointCycle; },
    get still() { return held().report.still; },
    rangeAt: (hand, up) => first.rangeAt(hand, up),
    get nets() { return first.nets; },
    choice: { get option() { return state.current; }, counts: state.counts },
  };
  return {
    report, state, releases: options.some((option) => option.releases),
    get holds() { return held().holds; },
    get busy() { return held().busy; },
    get lower() { return held().lower; },
    accepts: (attack) => options.some((option) => option.accepts(attack)),
    resume(view) { state.busy = false; state.touched = false; held().resume(view); },
    command(view, attack, intent, around, dt) {
      if (!state.busy && attack) {
        const chosen = pick(attack);
        if (chosen === null) attack = null;
        else if (chosen !== state.current) { state.current = chosen; held().resume(view); }
      }
      const option = held(), claim = option.command(view, attack, intent, around, dt);
      if (option.busy && !state.busy) { state.counts[state.current]!.thrown++; state.last = state.current; state.touched = false; }
      if (option.busy && option.holds && onFoe(view, option.holds)) state.touched = true;
      if (!option.busy && state.busy && state.touched) state.counts[state.current]!.landed++;
      state.busy = option.busy;
      return claim;
    },
  };
}
