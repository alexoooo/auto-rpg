import { blowsOf } from "../../mind/action-config.ts";
import { keepOut } from "../../mind/clear-step.ts";
import type { ActionConfig, ExecutorEntry } from "../../mind/config.ts";
import { NO_COVER } from "../../mind/intent.ts";
import type { PartLookup } from "../../mind/lookup.ts";
import type { MindWiring } from "../../mind/minds.ts";
import { approach } from "../../mind/options/approach.ts";
import { chooserOf } from "../../mind/options/chooser.ts";
import { cover } from "../../mind/options/cover.ts";
import { GOALS, toGoal } from "../../mind/options/goals.ts";
import type { Asked, Situation, StandingOption } from "../../mind/options/option.ts";
import { followOrders } from "../../mind/options/orders.ts";
import { situationReader } from "../../mind/options/situation.ts";
import { strike } from "../../mind/options/strike.ts";
import { walker, type Walker } from "../../mind/options/walk.ts";
import { orderedFacing } from "../../mind/ordered.ts";
import type { PartConfig } from "../../mind/parts.ts";
import type { EngagementDetail, Sight, Tactics } from "../../mind/tactics.ts";
import type { MotorUnmet } from "../../control/motor.ts";
import { LEGS_FIELDS, type LegsUnmet } from "../../skills/skill.ts";
import type { BodySpec } from "../../spec/body.ts";

/** What Kinetic decides with: its chooser, and the actions and executors its strikes are carried out by. */
export interface Deciding {
  readonly chooser: PartConfig;
  readonly executors: readonly ExecutorEntry[];
  readonly actions: readonly ActionConfig[];
}

/**
 * **The default footwork**: `at the edge` of a standing, two-handed focus's reach (`GOALS`),
 * facing it; with no such focus, standing, facing the focus or the way it faces.
 */
function footwork(now: Situation, walk: Walker): Omit<Asked, "actions"> {
  const focus = now.focus;
  if (!focus || focus.down || now.reach.theirs === 0) return { move: null, face: walk.facing(now) };
  return toGoal(now, GOALS["at the edge"], walk);
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
 * **Kinetic's tactics**: the options fighter's chooser (`chooserOf`) over its commitments,
 * following orders and a strike of each blow thrown standing (`strike`, which closes into its
 * window, `approach`); with none running, the default footwork (`footwork`). A free hand covers
 * (`cover`); the walk keeps out of a fallen body's reach and a solid's clearance (`keepOut`); an
 * order to face is followed. What it reports doing is the running commitment's name, the offers it
 * chose among, and what its controllers did not carry out as it last decided (`unmetDetail`).
 */
export function kineticTactics(spec: BodySpec, deciding: Deciding, wiring: MindWiring, parts: PartLookup, seed: number): Tactics {
  const walk = walker(spec), reader = situationReader(spec, (sight) => wiring.orders(sight.view.senses));
  const standing = deciding.actions.filter((action) => action.lower === undefined);
  const strikes = standing.map((action) => strike(action, walk, true, blowsOf(parts, deciding.executors, action)));
  const options: readonly StandingOption[] = [followOrders(walk, standing), ...strikes];
  const chosen = chooserOf(parts, deciding.chooser, options, seed), hands = cover(spec);
  const state = { chooser: chosen.state, situation: reader.state, options: options.map((option) => option.state), cover: hands.state };
  let last: Sight | null = null;
  const engagement = {
    get phase() { return chosen.running?.name ?? "guard"; },
    get offers() { return chosen.offers; },
    get details() { return last ? [unmetDetail(last.report.legs, last.view.unmet)] : []; },
  };
  return {
    name: "kinetic", state, engagement,
    decide(seen: Sight, dt: number) {
      last = seen;
      const now = reader.read(seen), option = chosen.decide(now);
      const running = option?.posture === "standing" ? option : null;
      const asked: Asked = running ? running.step(now, dt) : { ...footwork(now, walk), actions: [] };
      const held = running ? running.holds(now, asked) : [], near = running?.near?.(now) ?? null;
      const facing = now.orders?.move === undefined && now.orders ? orderedFacing(now.orders.face) : null;
      const covered = hands.step(now, held);
      return { ...keepOut(seen.view, seen.clearance, approach(now, asked), near, now.orders?.pace), ...(facing === null ? {} : { face: facing }),
        guard: covered ? { ...NO_COVER, ...covered } : NO_COVER };
    },
  };
}
