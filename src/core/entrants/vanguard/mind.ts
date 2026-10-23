import { actionConfigFaults, armedActions } from "../../mind/action-config.ts";
import { FIGHTING, MOVE, STAND_UP, type FighterConfig } from "../../mind/config.ts";
import { controller } from "../../mind/controller.ts";
import { createFighter, driveFighter, fighterBody, fighterFaults } from "../../mind/fighter.ts";
import { fitsAll, fitsWhen, slotList, slotOne, takesCommands } from "../../mind/parts.ts";
import type { PartConfig } from "../../mind/parts.ts";
import { STRAIGHT_PUNCH } from "../../skills/straight-punch.ts";
import { deepFreeze } from "../../state.ts";
import { VANGUARD_PUNCH, type VanguardPunchConfig } from "./punch-part.ts";
import { VANGUARD_PLAN, type VanguardPlanConfig } from "./plan.ts";
import { VANGUARD_WALK } from "./walk-part.ts";

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

/** A body punch behind an anticipatory guard, with a planted low punch and closed low cover. */
const WARRIOR: VanguardConfig = deepFreeze({
  kind: "vanguard",
  locomotion: { ...MOVE, otherwise: "braced" }, guard: { kind: "shield-guard" }, support: { kind: "support-fold" }, subs: [STAND_UP],
  tactics: { kind: "vanguard-plan", lowGuard: true, slowEvade: true, adaptiveEvade: true, revisitEvade: true, routeAround: true, flank: false, plan: { ...FIGHTING, list: [
    { kind: "follow-orders" }, { kind: "clear-of-walls" }, { kind: "evade" },
    { kind: "break-clinch", metres: .7 }, { kind: "attack" }, { kind: "approach" }, { kind: "cover", guard: "ward" },
  ] } },
  executors: PUNCHES,
  actions: (["punch", "low-punch"] as const).map(executor => ({ name: executor === "punch" ? "strike" : executor, executor,
    effectors: ["hand.right", "hand.left"], regions: [{ kind: "mark", mark: "middle" }], aim: { kind: "surface", tuning: {} } })),
});

/** The shared fighter runs the entrant's own immutable kit and tactics: its planner, of any kind, is checked as its part (`TacticsPart`). */
const fighter = (config: VanguardConfig): FighterConfig => ({ ...config, kind: "fighter" }) as FighterConfig;

/** The Rogue calibration uses a conservative stance walk. */
const ROGUE: VanguardConfig = deepFreeze({ ...WARRIOR, locomotion: VANGUARD_WALK.defaults });

/** The Skeleton calibration adds a blocked step and pins its standing punch's aim at commitment. */
const SKELETON: VanguardConfig = deepFreeze({ ...ROGUE,
  tactics: { ...WARRIOR.tactics, flank: true },
  executors: PUNCHES.map(executor => executor.lowOnly ? executor : { ...executor, lead: .025, anchorAtDrive: true }),
});

/** Vanguard is an independent entrant, with every skill exposed through the shared mind editor. */
export const VANGUARD_MIND = controller<VanguardConfig>({
  role: "mind", label: "Vanguard", stage: "experimental", defaults: WARRIOR, fields: [],
  slots: [slotOne("navigation", "Navigation", "navigation", true), slotOne("tactics", "Tactics", "tactics"),
    slotOne("locomotion", "Walk", "locomotion"), slotOne("guard", "Guard", "guard"), slotList("executors", "Executors", "executor"),
    slotOne("support", "Low support", "support", true), slotList("subs", "When down", "sub-mind"),
    slotOne("motor", "Motor control", "motor", true)],
  keys: { kind: true, tactics: true, locomotion: true, navigation: true, guard: true, executors: true, actions: true,
    support: true, subs: true, motor: true },
  parts: [VANGUARD_PUNCH, VANGUARD_PLAN, VANGUARD_WALK],
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
