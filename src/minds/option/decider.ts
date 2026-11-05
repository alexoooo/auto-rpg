import { chooserOf } from "./chooser.ts";
import { optionsOf, type OptionKindPart } from "./kinds.ts";
import { MEASURED_PREDICTIONS, type ProfileTables } from "./predictions-part.ts";
import { stepSet, type Option, type Situation } from "./option.ts";
import { optionRecord } from "./record.ts";
import { situationReader } from "./situation.ts";
import { walker } from "./walk.ts";
import type { PartConfig } from "../../parts/parts.ts";
import type { EngagementDetail } from "../engagement.ts";
import type { Prospect } from "../report.ts";
import type { Sight, Decider } from "../decider.ts";
import type { MotorUnmet } from "../../control/motor.ts";
import { LEGS_FIELDS, type LegsUnmet } from "../../skills/framework/skill.ts";
import type { BodySpec } from "../../core/bodies/spec/body.ts";
import type { PartLookup } from "../../parts/lookup.ts";
import type { Orders } from "../../skills/intent/orders.ts";
import type { Rulebook } from "../../combat/rulebook.ts";

/** What Option Mind's decider is made for: the body, the fight's rules, a person's orders and the parts the tree names. */
export interface DeciderMaking {
  readonly spec: BodySpec;
  /** The rules the fight is played by (`BodyHost.rules`), which price a blow. */
  readonly rules: Rulebook;
  readonly orders: (sight: Sight) => Orders | null;
  readonly parts: PartLookup;
  readonly techniques: readonly PartConfig[];
}

/** What Option Mind decides with: its chooser, its options (each a part of role `option`, in rank order), and the legs its body goes by. */
export interface Deciding {
  readonly chooser: PartConfig;
  /** What it predicts from (a part of role `predictions`; the measured profiles, `MEASURED_PREDICTIONS`, unless given). */
  readonly predictions?: PartConfig | null;
  readonly options: readonly PartConfig[];
  /** Its body's legs: the gaits its walks go by (`gaitsOf`). */
  readonly legs: PartConfig;
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
 * How each option that reads a profile and the focus's strikes are priced as it last decided, as
 * an engagement's detail: by their measured profiles, or by hand and why (`Option.priced`,
 * `Pressure.priced`).
 */
function profileDetail(options: readonly Option[], now: Situation): EngagementDetail {
  const own = options.flatMap((option) => option.priced ? [`${option.name}: ${option.priced(now)}`] : []);
  return { label: "Profiles", value: [...own, `foe: ${now.predictions.pressure.priced}`].join("; ") };
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
 * `situationReader`), the options its config names by kind, in rank order (`optionsOf`),
 * each kind making its options from what the mind gives it (`OptionsGiven`) and building what else it needs:
 * following orders (to move, stand or face), each strike of its own kind (`strike`, from a limb
 * ready, a low one from its low support, priced by its measured profile where it has one, `strikeMeasure`), and a
 * walk by each gait of its legs its config names (`walkBy`, `gaitsOf`) to the site it is worth most to walk to,
 * each a spot an option names (`Option.sites`: a strike's window, holding's spot out of the foe's
 * reach), worth what the chooser's search finds there; and, down,
 * the recovery options its config names; and the rest options, priced as keeping the body as it is
 * over the seconds asked (`holding`), which take what nothing else is worth more on: hold the
 * position, the hands at their guard, and, down, brace (`hold`, `guard`, `brace`), which the cover outbids on the hand on a blow's side while it
 * closes on the head (`covers`). Its options keep one record of their tries (`optionRecord`). The set's step is its members'
 * (`stepSet`); each option that asks the legs keeps its walk out of a fallen body's reach and a
 * solid's clearance (`Walker.kept`). What it reports doing is the first chosen's name, the offers it chose among,
 * what its controllers did not carry out as it last decided (`unmetDetail`) and how its options
 * were priced (`profileDetail`). Its body is modelled by the strikes its options are
 * (`Option.modelled`). Each time its chooser decides afresh it keeps what it expects of each foe it
 * priced (`prospects`, `prospect`): the focus, and each other foe the chooser read.
 */
export function optionDecider(making: DeciderMaking, hz: number, deciding: Deciding, seed: number, phase: number, rate: number, delay: number): Decider {
  const { spec, rules, parts } = making, given = deciding.predictions ?? MEASURED_PREDICTIONS.defaults, tables = parts.of("predictions", given).make(given) as ProfileTables;
  const walk = walker(spec), record = optionRecord();
  const options = optionsOf((config) => parts.of("option", config) as OptionKindPart, deciding.options,
    { spec, hz, rate, delay, parts, walk, legs: deciding.legs, tables, record });
  const reader = situationReader({ spec, hz, rate, delay, rules, strikes: options.flatMap((option) => option.modelled ? [option.modelled] : []), measured: tables.strikes,
    ordersOf: making.orders, record, parts, techniques: making.techniques });
  const chosen = chooserOf(parts, deciding.chooser, options, seed, phase);
  const state = { chooser: chosen.state, situation: reader.state, options: options.map((option) => option.state), record: record.state, prospects: [] as Kept[] };
  let last: Sight | null = null, lastNow: Situation | null = null;
  const engagement = {
    get phase() { return chosen.running[0]?.name ?? "hold"; },
    get offers() { return chosen.offers; },
    get details() { return last && lastNow ? [unmetDetail(last.report.legs, last.view.unmet), profileDetail(options, lastNow)] : []; },
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
