import type { Intent, Mind } from "../mind.ts";
import { golemTactics } from "./tactics.ts";
import { golemChampionMind as championMind, type GolemChampionMind } from "./champion.ts";
import { golemPlanner } from "./planner.ts";
import { GOLEM_CHAMPIONS } from "./tactics-champions.ts";
import { golemNeural } from "./neural.ts";
import { golemFencer, type GolemFencer } from "./tactics-v2.ts";
import { FORM, formDirector, golemForm } from "./styles/form.ts";
import { BRAWLER, brawlerDirector, golemBrawler } from "./styles/brawler.ts";
import { GUARDIAN, guardianDirector, golemGuardian } from "./styles/guardian.ts";
import { SKIRMISHER, golemSkirmisher, skirmisherDirector } from "./styles/skirmisher.ts";
import {
  exploringDirector, golemStyled, watchedDirector,
  type GolemStyled, type StyleAskHook, type StyleDirector,
} from "./tactics-v3.ts";

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

/**
 * The sixth golem mind, and the first one that is a *style*. Session 04 of the style set.
 *
 * The third executor under `formDirector`: a stand-off, a circle with a duty, a committed cut into
 * their recover, an intercept parry on their commit. `styled` is published for the reason `fencer`
 * is published on the five above -- the tournament worker's exchange log reads the option in force
 * per sample -- and it is a second field rather than the same one because the two executors have
 * different option vocabularies, and a log that called both `fencer` would be a log in which
 * `cut` and `strike` were the same column. Same seed argument, same reasons.
 */
export function golemFormMind(seed = (Math.random() * 0x100000000) >>> 0): Mind & { styled: GolemStyled } {
  const styled = golemForm(seed);
  return {
    name: "golem-form",
    styled,
    decide: (view, dt): Intent => styled.decide(view, dt),
  };
}

/**
 * The seventh golem mind, and the second style. Session 05 of the style set.
 *
 * The same executor under `skirmisherDirector`: a stand-off outside their reach that the style
 * defends rather than keeps, one committed cut on their recover, and a retreat that is owed the
 * moment the exchange ends and paid off only by the range. `styled` is published as the form's
 * is, and for the same reason. Same seed argument, same reasons.
 */
export function golemSkirmisherMind(seed = (Math.random() * 0x100000000) >>> 0): Mind & { styled: GolemStyled } {
  const styled = golemSkirmisher(seed);
  return {
    name: "golem-skirmisher",
    styled,
    decide: (view, dt): Intent => styled.decide(view, dt),
  };
}

/**
 * The eighth golem mind, and the third style. Session 06 of the style set.
 *
 * The same executor under `guardianDirector`: the cover sent out on their chamber rather than on
 * their commit, the committed cut into their recover, a shove for anything that gets inside, and
 * three seconds of patience before it starts anything itself. `styled` is published as the other
 * two are, and for the same reason. Same seed argument, same reasons.
 */
export function golemGuardianMind(seed = (Math.random() * 0x100000000) >>> 0): Mind & { styled: GolemStyled } {
  const styled = golemGuardian(seed);
  return {
    name: "golem-guardian",
    styled,
    decide: (view, dt): Intent => styled.decide(view, dt),
  };
}

/**
 * The ninth golem mind, and the fourth style. Session 07 of the style set.
 *
 * The same executor under `brawlerDirector`: no stand-off at all, a hold that floors at its own
 * inner radius, and a walk in whenever there is nothing better -- then the shove, the short
 * stroke with either hand and the point at the softest slot it can reach. `styled` is published
 * as the other three are, and for the same reason. Same seed argument, same reasons.
 */
export function golemBrawlerMind(seed = (Math.random() * 0x100000000) >>> 0): Mind & { styled: GolemStyled } {
  const styled = golemBrawler(seed);
  return {
    name: "golem-brawler",
    styled,
    decide: (view, dt): Intent => styled.decide(view, dt),
  };
}

/**
 * Every style by name: how to build its director over its own table. Session 08 of the style set.
 *
 * The four `golem*Mind` factories above each build one style and hand back a mind; this is the
 * same four taken apart, so that something else can put a hook and an exploration wrapper
 * *between* the director and the executor. The tournament worker is what wants that -- a recorded
 * side is a style playing its own game with a log taken off the wire -- and the alternative was a
 * fourth argument on each of the four factories and a name-to-factory table in the worker beside
 * this one, which is two lists of the same four names that could drift apart.
 *
 * A style registers here and in `src/mind.ts`; a mind that is not a style has no entry, which is
 * what `directedMind` refuses on.
 */
export const STYLE_DIRECTORS: Readonly<Record<string, (seed: number) => StyleDirector>> = Object.freeze({
  "golem-form": (seed) => formDirector(seed, FORM),
  "golem-skirmisher": (seed) => skirmisherDirector(seed, SKIRMISHER),
  "golem-guardian": (seed) => guardianDirector(seed, GUARDIAN),
  "golem-brawler": (seed) => brawlerDirector(seed, BRAWLER),
});

/**
 * The table each style plays, by policy name.
 *
 * These are the style modules' own objects and not copies, so a run that has written into one
 * through `--override form.cutLean=0.8` is a run whose `directedMind` reads the overridden row.
 * The worker keeps a second map of the same four tables under the *prefixes* that flag uses; the
 * two are different keys onto the same objects and neither can drift, because both name the
 * exported constant.
 */
export const STYLE_POLICY_TABLES = Object.freeze({
  "golem-form": FORM, "golem-skirmisher": SKIRMISHER, "golem-guardian": GUARDIAN, "golem-brawler": BRAWLER,
});

/**
 * A style built for a run that is taking a decision log: the director, an exploration wrapper
 * around it, and a hook around that.
 *
 * **The order of the two wrappers is the whole point.** Exploring inside and watching outside
 * means the log records the option that was *played*, which is the one the reward that follows
 * belongs to; the other order would log the style's preference and pay it the exploration's
 * reward, which is the one mistake that would make every number in Sessions 09 and 10 wrong and
 * would not show up as anything but a slightly worse fit.
 *
 * The exploration stream is seeded apart from the mind's own so that a style whose director
 * rolls -- the form's circle duty, the skirmisher's feint -- walks the same stream at explore 0.3
 * as at 0; at explore 0 there is no wrapper at all and the mind is the shipped one to the byte.
 */
export function directedMind(
  policy: string, seed = (Math.random() * 0x100000000) >>> 0,
  onAsk: StyleAskHook | null = null, explore = 0,
): Mind & { styled: GolemStyled } {
  const make = STYLE_DIRECTORS[policy];
  if (make === undefined) {
    throw new Error(`"${policy}" is not a style: it has no director to hook, and only a style has one`);
  }
  const explored = exploringDirector(make(seed), explore, (seed ^ 0x5ec0de5) >>> 0);
  const styled = golemStyled(seed, STYLE_POLICY_TABLES[policy as keyof typeof STYLE_POLICY_TABLES],
    onAsk === null ? explored : watchedDirector(explored, onAsk));
  return {
    name: policy,
    styled,
    decide: (view, dt): Intent => styled.decide(view, dt),
  };
}
