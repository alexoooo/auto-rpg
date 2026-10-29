import { blowsOf } from "../../mind/action-config.ts";
import { keepOut } from "../../mind/clear-step.ts";
import type { ActionConfig, ExecutorEntry } from "../../mind/config.ts";
import { NO_COVER } from "../../mind/intent.ts";
import type { PartLookup } from "../../mind/lookup.ts";
import type { MindWiring } from "../../mind/minds.ts";
import { approach } from "../../mind/options/approach.ts";
import { chooserOf } from "../../mind/options/chooser.ts";
import { cover } from "../../mind/options/cover.ts";
import { moveTo } from "../../mind/options/goals.ts";
import type { Asked, Option, Situation } from "../../mind/options/option.ts";
import type { GroundExecutor } from "../../mind/ground/held.ts";
import type { TechniqueConfig, TechniquePart } from "../../mind/ground/technique.ts";
import { groundOptions } from "../../mind/options/ground.ts";
import { followOrders } from "../../mind/options/orders.ts";
import { situationReader } from "../../mind/options/situation.ts";
import { measuredProfile, strike, strikeMeasure, type StrikeOption } from "../../mind/options/strike.ts";
import { walker, type Walker } from "../../mind/options/walk.ts";
import { orderedFacing } from "../../mind/ordered.ts";
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

/** **The default footwork**: the position held, standing, facing the focus or the way it faces. */
const footwork = (now: Situation, walk: Walker): Omit<Asked, "actions"> => ({ move: null, face: walk.facing(now) });

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
 * How each strike is priced as it last decided, as an engagement's detail: by its measured profile,
 * or by hand and why (`StrikeOption.unmeasured`).
 */
function profileDetail(strikes: readonly StrikeOption[], now: Situation): EngagementDetail {
  return { label: "Profiles", value: strikes.map((option) => { const why = option.unmeasured(now); return `${option.name}: ${why === null ? "measured" : `by hand, ${why}`}`; }).join("; ") || "none" };
}

/**
 * **Kinetic's tactics**: the options fighter's chooser (`chooserOf`) over its commitments,
 * following orders and a strike of each blow thrown standing (`strike`, which closes into its
 * window, `approach`, and is priced by its measured profile where it has one, `strikeMeasure`), and
 * its footwork, a move to each of three named goals (`moveTo`: close, at the edge, out of reach),
 * each worth where it leaves the body; with none worth more than the position held, the default
 * footwork (`footwork`). Down, the rise's options (`groundOptions`), the body down while its rise
 * runs, which price a fall (`downCost`). A free hand covers (`cover`); the walk keeps
 * out of a fallen body's reach and a solid's clearance (`keepOut`); an order to face is followed.
 * What it reports doing is the running commitment's name, the offers it chose among, what its
 * controllers did not carry out as it last decided (`unmetDetail`) and how its strikes were priced
 * (`profileDetail`).
 */
export function kineticTactics(spec: BodySpec, hz: number, rules: Rulebook, deciding: Deciding, wiring: MindWiring, parts: PartLookup, seed: number, rising: Rising): Tactics {
  const ground = groundOptions(spec, hz, rising.executor, deciding.ground, rising.registry);
  const standing = deciding.actions.filter((action) => action.lower === undefined);
  const measures = standing.map((action) => strikeMeasure(parts, spec, deciding.executors, action, hz));
  const walk = walker(spec), reader = situationReader({ spec, hz, rules, strikes: measures.flatMap((measure) => measuredProfile(measure) ?? []),
    ordersOf: (sight) => wiring.orders(sight.view.senses), downs: [ground.down] });
  const strikes = standing.map((action, i) => strike(action, walk, true, blowsOf(parts, deciding.executors, action), measures[i]!));
  const options: readonly Option[] = [followOrders(walk, standing), ...strikes, moveTo("close", walk), moveTo("at the edge", walk), moveTo("out of reach", walk), ...ground.options];
  const chosen = chooserOf(parts, deciding.chooser, options, seed), hands = cover(spec);
  const state = { chooser: chosen.state, situation: reader.state, options: options.map((option) => option.state), cover: hands.state, ground: ground.state };
  let last: Sight | null = null, lastNow: Situation | null = null;
  const engagement = {
    get phase() { return chosen.running?.name ?? "hold"; },
    get offers() { return chosen.offers; },
    get details() { return last && lastNow ? [unmetDetail(last.report.legs, last.view.unmet), profileDetail(strikes, lastNow)] : []; },
  };
  return {
    name: "kinetic", state, engagement,
    decide(seen: Sight, dt: number) {
      last = seen;
      const now = lastNow = ground.read(reader.read(seen)), option = chosen.decide(now);
      const running = option && option.posture !== "down" ? option : null;
      const asked: Asked = running ? running.step(now, dt) : { ...footwork(now, walk), actions: [] };
      const held = running ? running.holds(now, asked) : [], near = running?.near?.(now) ?? null;
      const facing = now.orders?.move === undefined && now.orders ? orderedFacing(now.orders.face) : null;
      const covered = hands.step(now, held);
      return { ...keepOut(seen.view, seen.clearance, approach(now, asked), near, now.orders?.pace), ...(facing === null ? {} : { face: facing }),
        guard: covered ? { ...NO_COVER, ...covered } : NO_COVER };
    },
  };
}
