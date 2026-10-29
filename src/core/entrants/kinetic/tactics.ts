import { blowsOf } from "../../mind/action-config.ts";
import type { ActionConfig, ExecutorEntry } from "../../mind/config.ts";
import { chooserOf } from "./options/chooser.ts";
import { covers } from "./options/cover.ts";
import { goings } from "./options/goals.ts";
import { OPTIONS, optionsOf, type KineticOptionPart } from "./options/kinds.ts";
import { MEASURED_PREDICTIONS, type ProfileTables } from "./options/predictions-part.ts";
import { stepSet, type Situation } from "./options/option.ts";
import type { GroundExecutor } from "../../mind/ground/held.ts";
import type { TechniqueConfig, TechniquePart } from "../../mind/ground/technique.ts";
import { groundOptions, type Ground } from "./options/ground.ts";
import { situationReader } from "./options/situation.ts";
import { measuredProfile, strike, strikeMeasure, type StrikeOption } from "./options/strike.ts";
import { walker } from "./options/walk.ts";
import type { PartConfig } from "../../mind/parts.ts";
import type { EngagementDetail, Sight, Tactics } from "../../mind/tactics.ts";
import type { MotorUnmet } from "../../control/motor.ts";
import { LEGS_FIELDS, type LegsUnmet } from "../../skills/skill.ts";
import type { TacticsMaking } from "../../mind/tactics-part.ts";

/** What Kinetic decides with: its chooser, its options (each a part of role `option`, in rank order; `OPTIONS` unless given), and the actions and executors its strikes are carried out by. */
export interface Deciding {
  readonly chooser: PartConfig;
  /** What it predicts from (a part of role `predictions`; the measured profiles, `MEASURED_PREDICTIONS`, unless given). */
  readonly predictions?: PartConfig | null;
  readonly options?: readonly PartConfig[] | null;
  readonly executors: readonly ExecutorEntry[];
  readonly actions: readonly ActionConfig[];
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
 * **Kinetic's tactics**: one policy (`chooserOf`) selecting a set of options by what they claim,
 * at the foe it is worth most to act on (`Chooser.decide`, each foe's situation read by
 * `situationReader`), the options its config names by kind, in rank order (`optionsOf`; `OPTIONS` unless given):
 * following orders (to move, stand or face), a strike of each of its blows (`strike`, from a limb
 * ready, a low one from its low support, priced by its measured profile where it has one, `strikeMeasure`), and an
 * option a gait (`moveBy`, `goings`: its pace, and the seconds it leaves the body unbraced) walking
 * where it is worth most, each destination worth where it leaves the body: into each strike's
 * window (`toWindowOf`), and out of the foe's pressure (`toGoalOf`, `OUT_OF_PRESSURE`); and, down,
 * the rise's options (`groundOptions`), which count the body down on its feet until their steady
 * braces it (`here`), and price a fall (`downCost`); and the rest options, worth nothing, which
 * take what nothing else is worth more on: hold the position, the hands at their guard, and, down,
 * brace (`hold`, `guard`, `brace`), which the cover outbids on the hand on a blow's side while it
 * closes on the head (`covers`). The set's step is its members'
 * (`stepSet`); each option that asks the legs keeps its walk out of a fallen body's reach and a
 * solid's clearance (`Walker.kept`). What it reports doing is the first chosen's name, the offers it chose among,
 * what its controllers did not carry out as it last decided (`unmetDetail`) and how its options
 * were priced (`profileDetail`); where the first chosen reports more than its name (a script,
 * `scripted`), what it reports and the context it publishes, in their place.
 */
export function kineticTactics(making: TacticsMaking, hz: number, deciding: Deciding, seed: number, rising: Rising): Tactics {
  const { spec, rules, parts } = making, given = deciding.predictions ?? MEASURED_PREDICTIONS.defaults, tables = parts.of("predictions", given).make(given) as ProfileTables;
  const ground = groundOptions(spec, hz, rising.executor, deciding.ground, rising.registry, tables.edges);
  const actions = deciding.actions;
  const measures = actions.map((action) => strikeMeasure(parts, spec, deciding.executors, action, hz, tables.strikes));
  const walk = walker(spec), reader = situationReader({ spec, hz, rules, strikes: measures.flatMap((measure) => measuredProfile(measure) ?? []), measured: tables.strikes,
    ordersOf: making.orders, riseFrom: ground.riseFrom, unbraced: ground.unbraced });
  const strikes = actions.map((action, i) => strike(action, walk, blowsOf(parts, deciding.executors, action), measures[i]!));
  // Each gait as the drill measured it stopping to throw its first strike.
  const hands = covers(spec), gaits = goings(spec, hz, measures[0]?.measured.skill ?? "", tables.gaits);
  const options = optionsOf((config) => parts.of("option", config) as KineticOptionPart, deciding.options ?? OPTIONS, { spec, walk, actions, strikes, gaits, ground, hands, making });
  const chosen = chooserOf(parts, deciding.chooser, options, seed);
  const state = { chooser: chosen.state, situation: reader.state, options: options.map((option) => option.state), cover: hands.state, ground: ground.state };
  let last: Sight | null = null, lastNow: Situation | null = null;
  const reported = () => chosen.running[0]?.engagement;
  const engagement = {
    get phase() { return reported()?.phase ?? chosen.running[0]?.name ?? "hold"; },
    get focus() { return reported()?.focus; },
    get offers() { return chosen.offers; },
    get details() {
      const own = reported();
      return own ? own.details ?? [] : last && lastNow ? [unmetDetail(last.report.legs, last.view.unmet), profileDetail(strikes, ground, lastNow)] : [];
    },
  };
  return {
    name: "kinetic", state, engagement,
    get decision() { return chosen.running[0]?.decision; },
    decide(seen: Sight, dt: number) {
      last = seen;
      const { set, at: now } = chosen.decide(reader.read(seen), reader.others);
      lastNow = now;
      reader.keep(now);
      return stepSet(set, now, dt, () => ({ move: null, face: walk.facing(now) }));
    },
  };
}
