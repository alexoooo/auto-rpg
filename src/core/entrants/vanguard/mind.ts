import { actionConfigFaults, armedActions } from "../../mind/action-config.ts";
import { FIGHTING, MOVE, STAND_UP, type FighterConfig } from "../../mind/config.ts";
import { controller } from "../../mind/controller.ts";
import { createFighter, driveFighter, fighterBody, fighterFaults } from "../../mind/fighter.ts";
import { GAME_MOTOR } from "../../mind/kit.ts";
import { GAME_NAVIGATION } from "../../mind/navigator.ts";
import { fitsAll, fitsWhen, slotList, slotOne, takesCommands } from "../../mind/parts.ts";
import type { PartConfig } from "../../mind/parts.ts";
import { STRAIGHT_PUNCH } from "../../skills/straight-punch.ts";
import { deepFreeze } from "../../state.ts";
import { VANGUARD_PUNCH, type VanguardPunchConfig } from "./punch-part.ts";
import { VANGUARD_PLAN, type VanguardPlanConfig } from "./plan.ts";
import { VANGUARD_WALK } from "./walk-part.ts";
import { VANGUARD_EXCHANGE } from "./exchange.ts";
import { VANGUARD_WEAPON } from "./weapon-part.ts";
import { VANGUARD_NAVIGATION } from "./navigation-part.ts";
import { BLADE_CUT_PART, BLADE_THRUST_PART } from "../../skills/blade-part.ts";

/** A fighter's slots, including its own planners, punches and calibrated walk. */
interface VanguardConfig extends Omit<FighterConfig, "kind" | "tactics" | "locomotion"> {
  readonly kind: "vanguard";
  readonly tactics: VanguardPlanConfig | PartConfig;
  readonly locomotion: PartConfig;
}

/** A standing body punch and a planted low punch, both following a predicted surface point. */
const PUNCHES = (["punch", "low-punch"] as const).map((name): VanguardPunchConfig => ({ ...VANGUARD_PUNCH.defaults, name, ...STRAIGHT_PUNCH,
  reach: .95, band: .18, through: .12, settle: .2, recover: .3, longest: .35, follow: .05,
  // The low stroke predicts the lumbar bend held by the planted support fold.
  lean: name === "low-punch" ? .89 : .1, hips: .3, turn: .55, lead: .1, chamber: .22,
  low: true, lowOnly: name === "low-punch", predict: true }));

/** Movement and cover keep their priority while each calibration chooses its attack selection. */
const PLAN = deepFreeze({ ...FIGHTING, list: [
  { kind: "follow-orders" }, { kind: "clear-of-walls" }, { kind: "evade" },
  { kind: "break-clinch", metres: .7 }, { kind: "attack" }, { kind: "approach" }, { kind: "cover", guard: "ward" },
] });

/** Held blunt items use recipe strikes; a blade offers its physical edge and tip actions. */
const WEAPONS = [VANGUARD_WEAPON.defaults, BLADE_CUT_PART.defaults, BLADE_THRUST_PART.defaults];
const WEAPON_ACTIONS = WEAPONS.map(executor => ({ name: executor.name, executor: executor.name,
  effectors: ["hand.right", "hand.left"], regions: [{ kind: "mark" as const, mark: "middle" as const }], aim: { kind: "surface", tuning: {} } }));

/** A body punch behind an anticipatory guard, with a planted low punch and closed low cover. */
const WARRIOR: VanguardConfig = deepFreeze({
  kind: "vanguard",
  navigation: VANGUARD_NAVIGATION.defaults,
  locomotion: { ...MOVE, otherwise: "braced" }, guard: { kind: "shield-guard" }, support: { kind: "support-fold" }, subs: [STAND_UP],
  tactics: { kind: "vanguard-plan", lowGuard: true, replantLow: true, slowEvade: true, adaptiveEvade: true, revisitEvade: true, routeAround: true, flank: false, plan: PLAN },
  executors: [...PUNCHES, ...WEAPONS],
  actions: [...WEAPON_ACTIONS, ...(["punch", "low-punch"] as const).map(executor => ({ name: executor === "punch" ? "strike" : executor, executor,
    effectors: ["hand.right", "hand.left"], regions: [{ kind: "mark" as const, mark: "middle" as const }], aim: { kind: "surface", tuning: {} } }))],
});

/** The shared fighter runs the entrant's own immutable kit and tactics: its planner, of any kind, is checked as its part (`TacticsPart`). */
const fighter = (config: VanguardConfig): FighterConfig => ({ ...config, kind: "fighter" }) as FighterConfig;

/** The Rogue calibration uses a conservative stance walk and room beside obstacles. */
const ROGUE: VanguardConfig = deepFreeze({ ...WARRIOR, navigation: VANGUARD_NAVIGATION.defaults, locomotion: VANGUARD_WALK.defaults,
  tactics: { ...WARRIOR.tactics, replantLow: false } });

/** The Skeleton learns contact rates for its hands, steps around blocks and pins its standing aim at commitment. */
const SKELETON: VanguardConfig = deepFreeze({ ...ROGUE, navigation: GAME_NAVIGATION,
  tactics: { ...WARRIOR.tactics, replantLow: false, flank: true, plan: { ...VANGUARD_EXCHANGE.defaults, list: PLAN.list } },
  executors: [...PUNCHES.map(executor => executor.lowOnly ? executor : { ...executor, lead: .025, anchorAtDrive: true }), ...WEAPONS],
});

/** Vanguard is an independent entrant, with every skill exposed through the shared mind editor. */
export const VANGUARD_MIND = controller<VanguardConfig>({
  role: "mind", label: "Vanguard", stage: "experimental", defaults: WARRIOR, fields: [],
  slots: [slotOne("navigation", "Navigation", "navigation", true, GAME_NAVIGATION), slotOne("tactics", "Tactics", "tactics"),
    slotOne("locomotion", "Walk", "locomotion"), slotOne("guard", "Guard", "guard"), slotList("executors", "Executors", "executor"),
    slotOne("support", "Low support", "support", true), slotList("subs", "When down", "sub-mind"),
    slotOne("motor", "Motor control", "motor", true, GAME_MOTOR)],
  keys: { kind: true, tactics: true, locomotion: true, navigation: true, guard: true, executors: true, actions: true,
    support: true, subs: true, motor: true },
  parts: [VANGUARD_PUNCH, VANGUARD_PLAN, VANGUARD_WALK, VANGUARD_EXCHANGE, VANGUARD_WEAPON, VANGUARD_NAVIGATION],
  fits: fitsAll<VanguardConfig>(takesCommands, (spec, config, parts) => actionConfigFaults(parts, spec, config.executors, config.actions)[0] ?? null,
    fitsWhen((spec, config, parts) => armedActions(parts, spec, config.executors, config.actions).length > 0, "it throws no usable blow")),
  strikes: (spec, config, parts) => armedActions(parts, spec, config.executors, config.actions).flatMap(action => action.effectors),
  faults: (config, parts) => fighterFaults(fighter(config), parts),
  presets: deepFreeze({
    "vanguard-warrior": { label: "Vanguard — Warrior", config: WARRIOR, models: ["workshop-fighter"] },
    "vanguard-rogue": { label: "Vanguard — Rogue", config: ROGUE, models: ["workshop-rogue"] },
    "vanguard-skeleton": { label: "Vanguard — Skeleton", config: SKELETON, models: ["crypt-skeleton"] },
  }),
  builtIn: (spec, config, parts) => parts.of("guard", config.guard).posture(spec, config.guard),
  scripted: { body: fighterBody, drive: driveFighter },
  create: (host, config, wiring) => createFighter(host, fighter(config), wiring),
});
