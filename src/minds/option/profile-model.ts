import { chooserOf } from "./chooser.ts";
import { stepSet } from "./option.ts";
import type { Sight } from "../decider.ts";
import type { Prospect } from "../report.ts";
import type { MotorUnmet } from "../../control/motor.ts";
import { LEGS_FIELDS, type LegsUnmet } from "../../skills/framework/skill.ts";
import type { EngagementDetail } from "../engagement.ts";
import type { Option, Situation } from "./option.ts";
type Kept = { foe: string; dealt: number; taken: number };
import { optionsOf, isProfileOption } from "./kinds.ts";
import type { OptionEvaluation } from "./model.ts";
import { PROFILE_MODEL, type ProfileTables } from "./profile-contract.ts";
import { optionRecord } from "./record.ts";
import { situationReader } from "./situation.ts";
import { walker } from "./walk.ts";

/** The measured-profile model assembles its own consumers around the same profile tables. */
export function profileModel(tables: ProfileTables): OptionEvaluation {
  return { build(input) {
    const { spec, hz, rate, delay, rules, parts, legs, techniques } = input;
    const walk = walker(spec), record = optionRecord();
    const options = optionsOf(config => {
      const part = parts.of("option", config);
      if (!isProfileOption(part)) throw new Error(`${config.kind} does not implement ${PROFILE_MODEL}`);
      return part;
    }, input.options,
      { spec, hz, rate, delay, parts, walk, legs, tables, record });
    const reader = situationReader({ spec, hz, rate, delay, rules, strikes: options.flatMap(option => option.modelled ? [option.modelled] : []), measured: tables.strikes,
      ordersOf: input.orders, record, parts, techniques });
    const chosen = chooserOf(parts, input.chooser, options, input.seed, input.phase);
    const state = { chooser: chosen.state, model: { situation: reader.state, record: record.state }, options: options.map((option) => option.state), prospects: [] as Kept[], details: [] as EngagementDetail[] };
    const engagement = {
      get phase() { return chosen.running[0]?.name ?? "hold"; },
      get offers() { return chosen.offers; },
      get details() { return state.details; },
    };
    return {
      name: "option", state, engagement,
      get prospects(): readonly Prospect[] { return state.prospects; },
      decide(seen: Sight, dt: number) {
        const read = reader.read(seen);
        let priced: readonly Situation[] = NONE;
        const { set, at: now, fresh } = chosen.decide(read, () => priced = reader.others());
        if (fresh) { prospect(state.prospects, options, read); for (const other of priced) prospect(state.prospects, options, other); }
        reader.keep(now);
        const intent = stepSet(set, now, dt, () => ({ move: null, face: walk.facing(now) }));
        state.details = [unmetDetail(seen.report.legs, seen.view.unmet), profileDetail(options, now)];
        return intent;
      },
    };
  } };
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


/** No other foe's situation read. */
const NONE: readonly Situation[] = Object.freeze([]);

/** What the selected profile controller left undone, as a published engagement detail. */
function unmetDetail(legs: LegsUnmet, motor: MotorUnmet): EngagementDetail {
  let pushes = 0;
  for (const pushed of motor.pushes) pushes += pushed;
  const parts = [...legs.fields.length ? [`legs: ${LEGS_FIELDS.filter((field) => legs.fields.includes(field)).join(", ")}`] : [],
    ...pushes ? [`${pushes} ${pushes === 1 ? "push" : "pushes"}`] : [], ...motor.points ? [`${motor.points} ${motor.points === 1 ? "point" : "points"}`] : []];
  return { label: "Unmet", value: parts.length ? parts.join("; ") : "none" };
}
