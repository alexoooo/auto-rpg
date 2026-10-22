/**
 * **Vanguard's planner**: a planner of its config's choosing (`plan`, any part of role `tactics`)
 * under the layers it turns on, each its own setting: contact-driven choice between the plan with
 * and without its evasion (`adaptiveEvade`, `revisitEvade`), a capped evasive step
 * (`slowEvade`), another entry where the exact one is unreachable (`routeAround`), a step round
 * repeated blocks (`flank`) and low cover (`lowGuard`), which also closes the covering hands
 * (`VanguardPlan.kit`).
 */
import { FIGHTING } from "../../mind/config.ts";
import type { PartConfig } from "../../mind/parts.ts";
import { slotOne, anyBody } from "../../mind/parts.ts";
import { toggle } from "../../mind/fields.ts";
import { tacticsOf, type TacticsPart } from "../../mind/tactics-part.ts";
import type { Sight, Tactics } from "../../mind/tactics.ts";
import type { Skills } from "../../skills/skills.ts";
import { deepFreeze } from "../../state.ts";
import { adaptiveGuard } from "./adaptive-guard.ts";
import { flank } from "./flank.ts";
import { lowGuard } from "./low-guard.ts";
import { routeAround } from "./route-around.ts";

/** Its config: the plan it layers, and each layer on or off. */
export interface VanguardPlanConfig extends PartConfig {
  readonly kind: "vanguard-plan";
  readonly plan: PartConfig;
  readonly slowEvade?: boolean;
  readonly adaptiveEvade?: boolean;
  readonly revisitEvade?: boolean;
  readonly routeAround?: boolean;
  readonly flank?: boolean;
  readonly lowGuard?: boolean;
}

/** The planner it makes: its tactics, and with low cover, how the skills it drives close the covering hands. */
export interface VanguardPlan extends Tactics {
  readonly kit?: (skills: Skills) => Skills;
}

/** A short defensive retreat is capped at 0.2 m/s instead of the navigator's ordinary travel pace. */
const EVADE_PACE = .2;

const LAYERS = ["slowEvade", "adaptiveEvade", "revisitEvade", "routeAround", "flank", "lowGuard"] as const;

/** The plan as a behaviour list, or null for a planner of another kind. */
const behaviourList = (plan: PartConfig): readonly PartConfig[] | null =>
  plan.kind === "behaviours" && Array.isArray((plan as { list?: unknown }).list) ? (plan as unknown as { list: readonly PartConfig[] }).list : null;

export const VANGUARD_PLAN: TacticsPart<VanguardPlanConfig> = deepFreeze({
  role: "tactics", label: "Vanguard layers", stage: "experimental",
  fields: [toggle("lowGuard", "Prepare a low guard"), toggle("slowEvade", "Limit evasive steps"),
    toggle("adaptiveEvade", "Learn attack or evasion from target contacts"), toggle("revisitEvade", "Revisit an earlier quiet policy"),
    toggle("routeAround", "Find another reachable entry point"), toggle("flank", "Step around repeated blocks")],
  slots: [slotOne("plan", "Plan", "tactics")],
  defaults: { kind: "vanguard-plan", plan: FIGHTING },
  keys: { kind: true, plan: true, slowEvade: true, adaptiveEvade: true, revisitEvade: true, routeAround: true, flank: true, lowGuard: true },
  fits: anyBody,
  faults: (config) => [
    ...LAYERS.flatMap((key) => config[key] !== undefined && typeof config[key] !== "boolean" ? [`${key}: a boolean`] : []),
    ...config.adaptiveEvade && (!config.slowEvade || behaviourList(config.plan) === null) ? ["adaptiveEvade needs a behaviour plan and limited evasive steps"] : [],
    ...config.revisitEvade && !config.adaptiveEvade ? ["revisitEvade needs adaptive evasion"] : [],
  ],
  actionFaults: (config, actions, parts) => parts.of("tactics", config.plan).actionFaults?.(config.plan, actions, parts) ?? [],
  make(making, config): VanguardPlan {
    const orders = (sight: Sight) => making.orders(sight);
    const ordinary = tacticsOf(making, config.plan), list = behaviourList(config.plan);
    const attacking = config.adaptiveEvade && list ? tacticsOf(making, { ...config.plan, list: list.filter((behaviour) => behaviour.kind !== "evade") }) : null;
    const policy = attacking ? adaptiveGuard(attacking, ordinary, config.revisitEvade) : ordinary;
    const tactics: Tactics = config.slowEvade ? { ...policy, get engagement() { return policy.engagement; },
      decide(sight, dt) {
        const intent = policy.decide(sight, dt);
        return policy.engagement?.phase === "evade" ? { ...intent, pace: EVADE_PACE } : intent;
      },
    } : policy;
    const routed = config.routeAround ? routeAround(tactics, orders) : tactics;
    const angled = config.flank ? flank(routed, making.spec, orders) : routed;
    const low = config.lowGuard ? lowGuard(angled, making.spec, orders) : null;
    return low ? { ...low.tactics, get engagement() { return low.tactics.engagement; }, kit: low.skills } : angled;
  },
});
