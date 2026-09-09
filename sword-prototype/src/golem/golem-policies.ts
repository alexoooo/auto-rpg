import type { Intent, Mind } from "../mind.ts";
import { golemTactics } from "./tactics.ts";
import { golemChampionMind as championMind, type GolemChampionMind } from "./champion.ts";
import { golemPlanner } from "./planner.ts";
import { golemSelectorMind as selectorMind } from "./selector.ts";
import { SELECTOR_TABLE } from "./selector-table.ts";
import { golemLearner } from "./learner.ts";
import { golemTactician } from "./tactician.ts";
import { GOLEM_CHAMPIONS } from "./tactics-champions.ts";
import { golemNeural } from "./neural.ts";
import { golemFencer, type GolemFencer } from "./tactics-v2.ts";
import { FORM, formDirector, golemForm } from "./styles/form.ts";
import { BRAWLER, brawlerDirector, golemBrawler } from "./styles/brawler.ts";
import { GUARDIAN, guardianDirector, golemGuardian } from "./styles/guardian.ts";
import { SKIRMISHER, golemSkirmisher, skirmisherDirector } from "./styles/skirmisher.ts";
import { golemDriver } from "./styles/driver.ts";
import { golemPolicy } from "./policy.ts";
import { installedSnapshot } from "./snapshot.ts";
import {
  exploringDirector, golemStyled, watchedDirector,
  type GolemStyled, type StyleAskHook, type StyleDirector,
} from "./tactics-v3.ts";
import { GOLEM_TACTICS_V4, type GolemDriven } from "./tactics-v4.ts";

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

/**
 * The tenth golem mind, and the second one that searches: `golem-tactician`. Session 09 of the
 * style set.
 *
 * The third executor under a plan solved from the style model, as `golem-planner` is the second
 * executor under a plan solved from the duel model. `styled` is published for the reason the four
 * styles publish it -- the tournament worker's exchange log reads the option in force per sample
 * -- and it is `styled` and not `fencer` because the option vocabulary is the styles' fifteen.
 * Same seed argument, same reasons.
 */
export function golemTacticianMind(seed = (Math.random() * 0x100000000) >>> 0): Mind & { styled: GolemStyled } {
  const tactician = golemTactician(seed);
  return {
    name: "golem-tactician",
    styled: tactician.styled,
    decide: (view, dt): Intent => tactician.decide(view, dt),
  };
}

/**
 * Every golem mind the selector may become: the name a tournament row carries, and how to build
 * one from a seed.
 *
 * **The selector itself is not in it**, which is the point of the list existing here rather than
 * being read off `POLICIES` in `src/mind.ts`: a selector that could choose itself is a recursion
 * with a seed, and the fit would have to score a candidate against a table it is inside. Nothing
 * else is left out -- the duelist is in, and a cell where the mind that stands still wins is a
 * cell worth knowing about.
 *
 * **`golem-snapshot` is the second thing left out**, and for a different reason than the selector's
 * recursion: it is not a mind, it is a slot. What it plays depends on what the page happened to
 * fetch, so a fitted selector row naming it would name a different opponent on every machine and a
 * table fitted against it would be a table fitted against nothing in particular. A selector cell
 * has to mean one mind.
 *
 * A mind registers here, in `src/mind.ts` and in `src/units.ts`, and the three lists are checked
 * against each other by `tests/minds.test.mjs`.
 */
/**
 * The twelfth golem mind, the learned one: `golem-learner`. Session 10 of the style set.
 *
 * The checked-in `LEARNER_WEIGHTS` and the shipped v3 table, played greedy -- the epsilon the
 * trainer's collecting rounds run at is the trainer's, not the shipped mind's. It publishes
 * `styled` for the same reason the tactician does: its vocabulary is the styles' fifteen, so the
 * exchange logger and the decision recorder can both read it. Same seed argument, same reasons.
 */
export function golemLearnerMind(seed = (Math.random() * 0x100000000) >>> 0): Mind & { styled: GolemStyled } {
  const learner = golemLearner(seed);
  return {
    name: "golem-learner",
    styled: learner.styled,
    decide: (view, dt): Intent => learner.decide(view, dt),
  };
}

/**
 * The thirteenth golem mind, and the first one over the fourth executor: `golem-driver`.
 * Session 12 of the style set.
 *
 * `golem-form` re-expressed as numbers -- the same five rules in the same order, writing a
 * stand-off, a strafe, a lean, a target and an arc twelve times a second instead of naming one of
 * fifteen options. It publishes neither `fencer` nor `styled`, and that is the honest answer
 * rather than an omission: the exchange logger reads an *option in force*, and this mind has none
 * to read -- what it has is a command, which is `driven` and is logged by the pilot's own hook.
 * Same seed argument, same reasons.
 */
export function golemDriverMind(seed = (Math.random() * 0x100000000) >>> 0): Mind & { driven: GolemDriven } {
  const driven = golemDriver(seed);
  return {
    name: "golem-driver",
    driven,
    decide: (view, dt): Intent => driven.decide(view, dt),
  };
}

/**
 * The fourteenth golem mind, and the first fitted one over the fourth executor: `golem-policy`.
 * Session 13 of the style set.
 *
 * The same command surface `golem-driver` writes by hand, written by a network instead. It plays
 * the **mean** of its head and draws nothing, which is what makes a bout under a seed the bout;
 * the trainer's rollouts are the only thing that ever samples. Like the driver it publishes
 * `driven` and neither `fencer` nor `styled`, for the same reason: there is no option in force to
 * log, only a command. Same seed argument, same reasons.
 */
export function golemPolicyMind(seed = (Math.random() * 0x100000000) >>> 0): Mind & { driven: GolemDriven } {
  const policy = golemPolicy(seed);
  return {
    name: "golem-policy",
    driven: policy.driven,
    decide: (view, dt): Intent => policy.decide(view, dt),
  };
}

/**
 * The fifteenth golem mind, and the only one whose weights are not in the tree: `golem-snapshot`.
 * Session 03 of the learn set.
 *
 * `golem-policy`'s executor over whatever table the page has been handed -- a `train-ppo`
 * checkpoint, a league pool member, a league's main -- from the module-level slot in
 * `snapshot.ts`. Everything else about it is the policy mind: the same v4 executor, the same head,
 * `driven` published for the readout and neither `fencer` nor `styled`, because there is no option
 * in force to log. `lastHead` is published as well, which the shipped mind does not do, and it is
 * here rather than there because this is the mind somebody is *watching*: the twelve numbers the
 * network answered are what the command readout is a decoding of, and a person comparing iteration
 * 8 with iteration 93 wants to be able to reach them from the console.
 *
 * **It refuses by name when the slot is empty**, which is the whole reason the slot exists. The
 * alternative -- falling back to `POLICY_WEIGHTS` -- would give two names to the shipped mind and
 * would make "I loaded iteration 40 and it fights exactly like the shipped one" an observation
 * nobody could distinguish from a fetch that quietly failed. `src/units.ts` keeps the row out of
 * the golem's `driverOptions` until something is installed, so the picker marks it incompatible in
 * the same way it marks a policy the unit cannot take, and this refusal is what catches every other
 * way of asking: a link, a restart, a console assignment, a test.
 *
 * The seed is the mind's own and does not come from the snapshot. A table's `seed` is the seed the
 * *fit* ran under and reusing it here would make two golems on one snapshot fight in lockstep,
 * which is the thing every factory in this file has a fresh seed to prevent.
 */
export function golemSnapshotMind(
  seed = (Math.random() * 0x100000000) >>> 0,
): Mind & { driven: GolemDriven; readonly lastHead: Float64Array } {
  const held = installedSnapshot();
  if (held === null) {
    throw new Error('"golem-snapshot" has no snapshot installed: fetch a checkpoint, a pool member '
      + "or a league state and install it before building the mind");
  }
  const policy = golemPolicy(seed, held.table, GOLEM_TACTICS_V4, null, held.sample);
  return {
    name: "golem-snapshot",
    driven: policy.driven,
    get lastHead(): Float64Array { return policy.lastHead; },
    decide: (view, dt): Intent => policy.decide(view, dt),
  };
}

export const GOLEM_CANDIDATES: Readonly<Record<string, (seed: number) => Mind>> = Object.freeze({
  "golem-duelist": golemDuelistMind,
  "golem-fencer": golemFencerMind,
  "golem-planner": golemPlannerMind,
  "golem-champion": golemChampionMind,
  "golem-neural": golemNeuralMind,
  "golem-form": golemFormMind,
  "golem-skirmisher": golemSkirmisherMind,
  "golem-guardian": golemGuardianMind,
  "golem-brawler": golemBrawlerMind,
  "golem-tactician": golemTacticianMind,
  "golem-learner": golemLearnerMind,
  "golem-driver": golemDriverMind,
  "golem-policy": golemPolicyMind,
});

/**
 * The eleventh golem mind, the one that picks a mind: `golem-selector`. Session 09 of the style
 * set.
 *
 * The checked-in `SELECTOR_TABLE` and the eleven candidates above; everything else about it is in
 * `src/golem/selector.ts`. It publishes neither `fencer` nor `styled`, because until the first view it is
 * not yet any executor and after it the executor is the chosen mind's -- the exchange logger
 * takes that as "no log", which is honest: a log labelled `golem-selector` would name a
 * vocabulary that changes with the body. Same seed argument, same reasons.
 */
export function golemSelectorMind(seed = (Math.random() * 0x100000000) >>> 0): Mind {
  const selector = selectorMind(seed, SELECTOR_TABLE, GOLEM_CANDIDATES);
  return {
    name: "golem-selector",
    decide: (view, dt): Intent => selector.decide(view, dt),
  };
}
