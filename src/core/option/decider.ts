import type { ActionConfig, ExecutorEntry, LocomotionConfig } from "../skills/config.ts";
import { chooserOf } from "./chooser.ts";
import { OPTIONS, optionsOf, type OptionKindPart } from "./kinds.ts";
import { MEASURED_PREDICTIONS, type ProfileTables } from "./predictions-part.ts";
import { stepSet, type Option, type Situation } from "./option.ts";
import type { GroundExecutor } from "../recovery/ground/held.ts";
import type { TechniqueConfig, TechniquePart } from "../recovery/ground/technique.ts";
import { groundOptions, type Ground } from "./ground.ts";
import { situationReader } from "./situation.ts";
import { walker } from "./walk.ts";
import type { PartConfig } from "../parts/parts.ts";
import type { EngagementDetail } from "../mind/engagement.ts";
import type { Prospect } from "../mind/report.ts";
import type { Sight, Decider } from "../mind/decider.ts";
import type { MotorUnmet } from "../control/motor.ts";
import { LEGS_FIELDS, type LegsUnmet } from "../skills/framework/skill.ts";
import type { BodySpec } from "../spec/body.ts";
import type { PartLookup } from "../parts/lookup.ts";
import type { Orders } from "../intent/orders.ts";
import type { Rulebook } from "../rules/rulebook.ts";

/** What Option Mind's decider is made for: the body, the fight's rules, a person's orders and the parts the tree names. */
export interface DeciderMaking {
  readonly spec: BodySpec;
  /** The rules the fight is played by (`BodyHost.rules`), which price a blow. */
  readonly rules: Rulebook;
  readonly orders: (sight: Sight) => Orders | null;
  readonly parts: PartLookup;
}

/** What Option Mind decides with: its chooser, its options (each a part of role `option`, in rank order; `OPTIONS` unless given), and the actions and executors its options carry out. */
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
 * How each option that reads a profile, the focus's strikes and the rise are priced as it last
 * decided, as an engagement's detail: by their measured profiles, or by hand and why
 * (`Option.priced`, `Pressure.priced`, `Ground.priced`).
 */
function profileDetail(options: readonly Option[], ground: Ground, now: Situation): EngagementDetail {
  const own = options.flatMap((option) => option.priced ? [`${option.name}: ${option.priced(now)}`] : []);
  return { label: "Profiles", value: [...own, `foe: ${now.predictions.pressure.priced}`, `rise: ${ground.priced}`].join("; ") };
}

/** No other foe's situation read. */
const NONE: readonly Situation[] = Object.freeze([]);

/** A prospect as a state keeps it (`Prospect`): plain data, written in place. */
type Kept = { foe: string; dealt: number; taken: number };

/**
 * **Write into `prospects` what `now` expects of its focus** (`Prospect`), at reach: the most its
 * `options` are expected to deal the focus a second within their reach (`Option.rate`), and
 * the most the focus's are expected to take of it (`Pressure.peak` of `pressure`), in place of what
 * was kept of that foe; nothing with no focus.
 */
function prospect(prospects: Kept[], options: readonly Option[], now: Situation): void {
  if (!now.focus) return;
  let dealt = 0;
  for (const option of options) if (option.rate) dealt = Math.max(dealt, option.rate(now));
  const foe = now.focus.id, taken = now.predictions.pressure.peak;
  const kept = prospects.find((one) => one.foe === foe);
  if (kept) { kept.dealt = dealt; kept.taken = taken; } else prospects.push({ foe, dealt, taken });
}

/**
 * **Option Mind's decider**: one policy (`chooserOf`, deciding on the body's `phase`) selecting a set of options by what they claim,
 * at the foe it is worth most to act on (`Selection.decide`, each foe's situation read by
 * `situationReader`), the options its config names by kind, in rank order (`optionsOf`; `OPTIONS` unless given),
 * each kind making its options from what the mind gives it (`OptionsGiven`) and building what else it needs:
 * following orders (to move, stand or face), each strike of its own kind (`strike`, from a limb
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
 * were priced (`profileDetail`). Its body is modelled by the strikes its options are
 * (`Option.modelled`). Each time its chooser decides afresh it keeps what it expects of each foe it
 * priced (`prospects`, `prospect`): the focus, and each other foe the chooser read.
 */
export function optionDecider(making: DeciderMaking, hz: number, deciding: Deciding, seed: number, rising: Rising, phase: number, rate: number, delay: number): Decider {
  const { spec, rules, parts } = making, given = deciding.predictions ?? MEASURED_PREDICTIONS.defaults, tables = parts.of("predictions", given).make(given) as ProfileTables;
  const ground = groundOptions(spec, hz, delay, rising.executor, deciding.ground, rising.registry, tables.edges);
  const walk = walker(spec);
  const options = optionsOf((config) => parts.of("option", config) as OptionKindPart, deciding.options ?? OPTIONS,
    { spec, hz, rate, delay, parts, walk, locomotion: deciding.locomotion, executors: deciding.executors, actions: deciding.actions, tables, ground });
  const reader = situationReader({ spec, hz, rate, delay, rules, strikes: options.flatMap((option) => option.modelled ? [option.modelled] : []), measured: tables.strikes,
    ordersOf: making.orders, riseFrom: ground.riseFrom, unbraced: ground.unbraced, parts });
  const chosen = chooserOf(parts, deciding.chooser, options, seed, phase);
  const state = { chooser: chosen.state, situation: reader.state, options: options.map((option) => option.state), ground: ground.state, prospects: [] as Kept[] };
  let last: Sight | null = null, lastNow: Situation | null = null;
  const engagement = {
    get phase() { return chosen.running[0]?.name ?? "hold"; },
    get offers() { return chosen.offers; },
    get details() { return last && lastNow ? [unmetDetail(last.report.legs, last.view.unmet), profileDetail(options, ground, lastNow)] : []; },
  };
  return {
    name: "option", state, engagement,
    get prospects(): readonly Prospect[] { return state.prospects; },
    decide(seen: Sight, dt: number) {
      last = seen;
      const read = reader.read(seen);
      let priced: readonly Situation[] = NONE;
      const { set, at: now, fresh } = chosen.decide(read, () => priced = reader.others());
      if (fresh) { prospect(state.prospects, options, read); for (const other of priced) prospect(state.prospects, options, other); }
      lastNow = now;
      reader.keep(now);
      return stepSet(set, now, dt, () => ({ move: null, face: walk.facing(now) }));
    },
  };
}
