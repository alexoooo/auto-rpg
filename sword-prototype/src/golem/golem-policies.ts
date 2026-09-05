import type { Intent, Mind } from "../mind.ts";
import { golemTactics } from "./tactics.ts";

/**
 * The golem's entry in the policy picker.
 *
 * **A factory rather than a singleton**, exactly as every other policy is: the state machine
 * carries timers and a stream, and two golems running one instance would share a cadence and both
 * commit on the same frame forever. The seed is optional and the picker never passes one, so a
 * golem chosen from the screen draws its own; `scripts/measure.mjs` passes one, because "N bouts"
 * has to mean N different bouts and the only honest place for that variety is the policy's own
 * timing.
 *
 * ## Why there is one of these and not two
 *
 * The session plan asks for `golem-duelist` **and** `golem-idle`. Only the first is here, and the
 * omission is a decision rather than an oversight: `idle` in `src/mind.ts` already stands a golem
 * up with its cursor centred, `Policy.surface` is null for it precisely because standing still is a
 * command any body can execute, and every number in Session 08's baseline -- 0 wins, 0 losses, 8
 * draws, 55.13 damage a bout -- was taken with a golem on it. A second idle under a golem name
 * would be two names for one behaviour and would split that baseline in half, which is the thing
 * this plan set exists to stop: the control condition has to stay one thing so that a later
 * measurement can be read against it.
 *
 * ## What it does not do
 *
 * It does not widen `Intent`. What leaves `decide` is the same eight-field command a person's mouse
 * produces, and the golem narrows it onto five modules. Nothing in `tactics.ts` sets a joint angle,
 * places a business end, or reads the other mind -- a golem that wants to know whether it is about
 * to be hit has to look at a blade, the same way a person does.
 */
export function golemDuelistMind(seed = (Math.random() * 0x100000000) >>> 0): Mind {
  const tactics = golemTactics(seed);
  return {
    name: "golem-duelist",
    decide: (view, dt): Intent => tactics.decide(view, dt),
  };
}
