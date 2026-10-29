import { dataOf } from "../../data/store.ts";
import { blowsOf } from "../../mind/action-config.ts";
import type { ActionConfig, ExecutorEntry } from "../../mind/config.ts";
import { NO_COVER } from "../../mind/intent.ts";
import type { PartLookup } from "../../mind/lookup.ts";
import type { MindWiring } from "../../mind/minds.ts";
import { chooserOf } from "../../mind/options/chooser.ts";
import { covers } from "../../mind/options/cover.ts";
import { goings, moveTo, OUT_OF_PRESSURE, toWindow } from "../../mind/options/goals.ts";
import { stepSet, type Option, type Situation } from "../../mind/options/option.ts";
import { guard, hold } from "../../mind/options/rest.ts";
import type { GroundExecutor } from "../../mind/ground/held.ts";
import type { TechniqueConfig, TechniquePart } from "../../mind/ground/technique.ts";
import { groundOptions, type Ground } from "../../mind/options/ground.ts";
import { followOrders } from "../../mind/options/orders.ts";
import { situationReader } from "../../mind/options/situation.ts";
import { measuredProfile, strike, strikeMeasure, type StrikeOption } from "../../mind/options/strike.ts";
import { walker } from "../../mind/options/walk.ts";
import type { PartConfig } from "../../mind/parts.ts";
import type { EngagementDetail, Sight, Tactics } from "../../mind/tactics.ts";
import type { MotorUnmet } from "../../control/motor.ts";
import { LEGS_FIELDS, type LegsUnmet } from "../../skills/skill.ts";
import type { Rulebook } from "../../rules/rulebook.ts";
import type { BodySpec } from "../../spec/body.ts";

/** What Kinetic decides with: its chooser, and the actions and executors its strikes are carried out by. */
export interface Deciding {
  readonly chooser: PartConfig;
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
  return { label: "Profiles", value: [...own, `foe: ${now.pressure.priced}`, `rise: ${ground.priced}`].join("; ") };
}

/**
 * **Kinetic's tactics**: one policy (`chooserOf`) selecting a set of options by what they claim:
 * following orders (to move, stand or face), a strike of each blow thrown standing (`strike`, from
 * a limb ready, priced by its measured profile where it has one, `strikeMeasure`), and the goals
 * made from them, each worth where it leaves the body: a walk into each strike's window
 * (`toWindow`), and one out of the foe's pressure (`moveTo`, `OUT_OF_PRESSURE`), each by each gait
 * (`goings`: its pace, and the seconds it leaves the body unbraced); and, down, the
 * rise's options (`groundOptions`), the body down while its rise runs, which price a fall
 * (`downCost`); and the rest options, worth nothing, which take what nothing else is worth more on:
 * hold the position, each hand at its guard, and, down, brace (`hold`, `guard`, `brace`), which a
 * hand's cover outbids while a blow closes on the head (`covers`). The set's step is its members'
 * (`stepSet`); the walk keeps out of a fallen body's reach and a solid's clearance
 * (`Walker.kept`). What it reports doing is the first chosen's name, the offers it chose among,
 * what its controllers did not carry out as it last decided (`unmetDetail`) and how its options
 * were priced (`profileDetail`).
 */
export function kineticTactics(spec: BodySpec, hz: number, rules: Rulebook, deciding: Deciding, wiring: MindWiring, parts: PartLookup, seed: number, rising: Rising): Tactics {
  const ground = groundOptions(spec, hz, rising.executor, deciding.ground, rising.registry);
  const standing = deciding.actions.filter((action) => action.lower === undefined);
  const measures = standing.map((action) => strikeMeasure(parts, spec, deciding.executors, action, hz));
  const walk = walker(spec), reader = situationReader({ spec, hz, rules, strikes: measures.flatMap((measure) => measuredProfile(measure) ?? []), measured: dataOf("strike-profiles"),
    ordersOf: (sight) => wiring.orders(sight.view.senses), downs: [ground.down] });
  const strikes = standing.map((action, i) => strike(action, walk, false, blowsOf(parts, deciding.executors, action), measures[i]!));
  // Each gait as the drill measured it stopping to throw its first strike.
  const hands = covers(spec), gaits = goings(spec, hz, measures[0]?.measured.skill ?? "");
  const options: readonly Option[] = [followOrders(walk, standing), ...strikes,
    ...gaits.flatMap((going) => [...strikes.map((one) => toWindow(one, walk, going)), moveTo("out of pressure", OUT_OF_PRESSURE, walk, going)]),
    ...ground.options,
    ...hands.options, hold(walk), ...[...new Set((spec.effectors ?? []).map((effector) => effector.segment))].map(guard), ground.rest];
  const chosen = chooserOf(parts, deciding.chooser, options, seed);
  const state = { chooser: chosen.state, situation: reader.state, options: options.map((option) => option.state), cover: hands.state, ground: ground.state };
  let last: Sight | null = null, lastNow: Situation | null = null;
  const engagement = {
    get phase() { return chosen.running[0]?.name ?? "hold"; },
    get offers() { return chosen.offers; },
    get details() { return last && lastNow ? [unmetDetail(last.report.legs, last.view.unmet), profileDetail(strikes, ground, lastNow)] : []; },
  };
  return {
    name: "kinetic", state, engagement,
    decide(seen: Sight, dt: number) {
      last = seen;
      const now = lastNow = ground.read(reader.read(seen));
      const { asked, near } = stepSet(chosen.decide(now), now, dt, () => ({ move: null, face: walk.facing(now) }));
      return { ...walk.kept(now, asked, near), guard: { ...NO_COVER, ...asked.guard } };
    },
  };
}
