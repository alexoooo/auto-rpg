import { blowsOf } from "../tactics/action-config.ts";
import type { ActionConfig, ExecutorEntry, LocomotionConfig } from "../mind/config.ts";
import { chooserOf } from "./chooser.ts";
import { OPTIONS, optionsOf, type OptionKindPart } from "./kinds.ts";
import { MEASURED_PREDICTIONS, type ProfileTables } from "./predictions-part.ts";
import { stepSet, type Situation } from "./option.ts";
import type { GroundExecutor } from "../recovery/ground/held.ts";
import type { TechniqueConfig, TechniquePart } from "../recovery/ground/technique.ts";
import { groundOptions, type Ground } from "./ground.ts";
import { situationReader } from "./situation.ts";
import { measuredProfile, strike, strikeMeasure, type StrikeOption } from "./strike.ts";
import { walker } from "./walk.ts";
import type { PartConfig } from "../parts/parts.ts";
import type { EngagementDetail, Sight, Tactics } from "../tactics/tactics.ts";
import type { MotorUnmet } from "../control/motor.ts";
import { LEGS_FIELDS, type LegsUnmet } from "../skills/framework/skill.ts";
import type { TacticsMaking } from "../tactics/tactics-part.ts";

/** What Option Mind decides with: its chooser, its options (each a part of role `option`, in rank order; `OPTIONS` unless given), and the actions and executors its strikes are carried out by. */
export interface Deciding {
  readonly chooser: PartConfig;
  /** What it predicts from (a part of role `predictions`; the measured profiles, `MEASURED_PREDICTIONS`, unless given). */
  readonly predictions?: PartConfig | null;
  readonly options?: readonly PartConfig[] | null;
  readonly executors: readonly ExecutorEntry[];
  readonly actions: readonly ActionConfig[];
  /** Its legs: the gaits its footwork goes by (`gaitsOf`). */
  readonly locomotion: LocomotionConfig;
  /** Its techniques for getting up, in rank order. */
  readonly ground: readonly TechniqueConfig[];
}

/** What it rises by: the ground executor (`groundExecutor`) of the techniques it was made with, `registry`. */
export interface Rising {
  readonly executor: GroundExecutor;
  readonly registry: Readonly<Record<string, TechniquePart>>;
}

/**
 * What the controllers did not carry out last step, as an engagement's detail: the legs goal's
 * fields the legs left undone (`SkillReport.legs`) and how many pushes and points the motor did
 * not (`BodyView.unmet`).
 */
function unmetDetail(legs: LegsUnmet, motor: MotorUnmet): EngagementDetail {
  let pushes = 0;
  for (const pushed of motor.pushes) pushes += pushed;
  const parts = [...legs.fields.length ? [`legs: ${LEGS_FIELDS.filter((field) => legs.fields.includes(field)).join(", ")}`] : [],
    ...pushes ? [`${pushes} ${pushes === 1 ? "push" : "pushes"}`] : [], ...motor.points ? [`${motor.points} ${motor.points === 1 ? "point" : "points"}`] : []];
  return { label: "Unmet", value: parts.length ? parts.join("; ") : "none" };
}

/**
 * How each strike, the focus's strikes and the rise are priced as it last decided, as an
 * engagement's detail: by their measured profiles, or by hand and why (`StrikeOption.priced`,
 * `Pressure.priced`, `Ground.priced`).
 */
function profileDetail(strikes: readonly StrikeOption[], ground: Ground, now: Situation): EngagementDetail {
  const own = strikes.map((option) => `${option.name}: ${option.priced(now)}`);
  return { label: "Profiles", value: [...own, `foe: ${now.predictions.pressure.priced}`, `rise: ${ground.priced}`].join("; ") };
}

/**
 * **Option Mind's tactics**: one policy (`chooserOf`) selecting a set of options by what they claim,
 * at the foe it is worth most to act on (`Chooser.decide`, each foe's situation read by
 * `situationReader`), the options its config names by kind, in rank order (`optionsOf`; `OPTIONS` unless given),
 * each kind making its options from what the mind gives it (`OptionsGiven`) and building what else it needs:
 * following orders (to move, stand or face), a strike of each of its blows (`strike`, from a limb
 * ready, a low one from its low support, priced by its measured profile where it has one, `strikeMeasure`), and an
 * option a gait of its legs (`walkBy`, `gaitsOf`, `goings`: its pace, and the seconds it leaves each
 * strike unready) walking where it is worth most, each place worth where it leaves the body and the
 * best option there (the chooser's look past it): each strike's window, ahead and behind the foe
 * (`windowPlaces`), and out of the foe's pressure (`outOfPressure`); and, down,
 * the rise's options (`groundOptions`), which count the body down on its feet until their steady
 * braces it (`here`), and price a fall (`downCost`); and the rest options, worth nothing, which
 * take what nothing else is worth more on: hold the position, the hands at their guard, and, down,
 * brace (`hold`, `guard`, `brace`), which the cover outbids on the hand on a blow's side while it
 * closes on the head (`covers`). The set's step is its members'
 * (`stepSet`); each option that asks the legs keeps its walk out of a fallen body's reach and a
 * solid's clearance (`Walker.kept`). What it reports doing is the first chosen's name, the offers it chose among,
 * what its controllers did not carry out as it last decided (`unmetDetail`) and how its options
 * were priced (`profileDetail`).
 */
export function optionTactics(making: TacticsMaking, hz: number, deciding: Deciding, seed: number, rising: Rising): Tactics {
  const { spec, rules, parts } = making, given = deciding.predictions ?? MEASURED_PREDICTIONS.defaults, tables = parts.of("predictions", given).make(given) as ProfileTables;
  const ground = groundOptions(spec, hz, rising.executor, deciding.ground, rising.registry, tables.edges);
  const actions = deciding.actions;
  const measures = actions.map((action) => strikeMeasure(parts, spec, deciding.executors, action, hz, tables.strikes));
  const walk = walker(spec), reader = situationReader({ spec, hz, rules, strikes: measures.flatMap((measure) => measuredProfile(measure) ?? []), measured: tables.strikes,
    ordersOf: making.orders, riseFrom: ground.riseFrom, unbraced: ground.unbraced, parts });
  const strikes = actions.map((action, i) => strike(action, walk, blowsOf(parts, deciding.executors, action), measures[i]!));
  const options = optionsOf((config) => parts.of("option", config) as OptionKindPart, deciding.options ?? OPTIONS,
    { spec, hz, parts, walk, locomotion: deciding.locomotion, executors: deciding.executors, actions, tables, measures, strikes, ground });
  const chosen = chooserOf(parts, deciding.chooser, options, seed);
  const state = { chooser: chosen.state, situation: reader.state, options: options.map((option) => option.state), ground: ground.state };
  let last: Sight | null = null, lastNow: Situation | null = null;
  const engagement = {
    get phase() { return chosen.running[0]?.name ?? "hold"; },
    get offers() { return chosen.offers; },
    get details() { return last && lastNow ? [unmetDetail(last.report.legs, last.view.unmet), profileDetail(strikes, ground, lastNow)] : []; },
  };
  return {
    name: "option", state, engagement,
    decide(seen: Sight, dt: number) {
      last = seen;
      const { set, at: now } = chosen.decide(reader.read(seen), reader.others);
      lastNow = now;
      reader.keep(now);
      return stepSet(set, now, dt, () => ({ move: null, face: walk.facing(now) }));
    },
  };
}
