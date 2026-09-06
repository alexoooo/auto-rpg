import type { Intent, Mind } from "../mind.ts";
import { golemTactics } from "./tactics.ts";
import { golemChampionMind as championMind, type GolemChampionMind } from "./champion.ts";
import { golemPlanner } from "./planner.ts";
import { GOLEM_CHAMPIONS } from "./tactics-champions.ts";
import { golemNeural } from "./neural.ts";
import { golemFencer, type GolemFencer } from "./tactics-v2.ts";

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

/**
 * The second golem mind, the one that reads the other fighter. Session 05 of the matchup set.
 *
 * Same factory shape and same seed argument, for the same reasons. The paragraph above about
 * one mind and not two still holds for `idle`: what this adds is not a second control condition
 * but a second *contender*, and `golem-duelist` goes on being run in every tournament so that a
 * rating this one earns is earned against a thing that did not move.
 */
export function golemFencerMind(seed = (Math.random() * 0x100000000) >>> 0): Mind & { fencer: GolemFencer } {
  const tactics = golemFencer(seed);
  return {
    name: "golem-fencer",
    fencer: tactics,
    decide: (view, dt): Intent => tactics.decide(view, dt),
  };
}

/**
 * The third golem mind, the one that searches. Session 06 of the matchup set.
 *
 * The fencer's executor under a director that solves the duel model from the state it reads;
 * `fencer` is published for the same reason it is on the fencer's own mind, so the tournament
 * worker's exchange log can read the option in force and a planner's rows can calibrate the
 * next tables. Same seed argument, same reasons.
 */
export function golemPlannerMind(seed = (Math.random() * 0x100000000) >>> 0): Mind & { fencer: GolemFencer } {
  const planner = golemPlanner(seed);
  return {
    name: "golem-planner",
    fencer: planner.fencer,
    decide: (view, dt): Intent => planner.decide(view, dt),
  };
}

/**
 * The fourth golem mind, the tuned one. Session 07 of the matchup set.
 *
 * The planner over the fencer with the numbers `scripts/tune.mjs` found for the arm class the
 * mind reads off its first view, from the checked-in `GOLEM_CHAMPIONS`. `fencer` is a getter
 * here and not a field, because the fencer is built at the first view, when the class is known;
 * the tournament worker's exchange log reads it per sample for that reason. Same seed argument,
 * same reasons.
 */
export function golemChampionMind(seed = (Math.random() * 0x100000000) >>> 0): GolemChampionMind {
  return championMind(seed, GOLEM_CHAMPIONS);
}

/**
 * The fifth golem mind, the learned one. Session 08 of the matchup set.
 *
 * The fencer's executor under a network that names the option, from the checked-in
 * `NEURAL_WEIGHTS`; `fencer` is published for the exchange log as the others publish it.
 * Same seed argument, same reasons.
 */
export function golemNeuralMind(seed = (Math.random() * 0x100000000) >>> 0): Mind & { fencer: GolemFencer } {
  const neural = golemNeural(seed);
  return {
    name: "golem-neural",
    fencer: neural.fencer,
    decide: (view, dt): Intent => neural.decide(view, dt),
  };
}
