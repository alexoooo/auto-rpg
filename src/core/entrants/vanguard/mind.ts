import { actionConfigFaults, armedActions, configuredActionEstimates, configuredAims } from "../../mind/action-config.ts";
import { FIGHTING, MOVE, STAND_UP, type ExecutorEntry, type FighterConfig } from "../../mind/config.ts";
import { controller } from "../../mind/controller.ts";
import { fighterBody, fighterFaults, fighterSkills } from "../../mind/fighter.ts";
import type { PartField } from "../../mind/fields.ts";
import type { BodyHost } from "../../mind/host.ts";
import type { MindWiring } from "../../mind/minds.ts";
import { fitsAll, fitsWhen, slotList, slotOne, takesCommands } from "../../mind/parts.ts";
import { tacticsOf, type TacticsMaking } from "../../mind/tactics-part.ts";
import type { PartConfig } from "../../mind/parts.ts";
import { driveBy } from "../../mind/tactics.ts";
import { STRAIGHT_PUNCH } from "../../skills/straight-punch.ts";
import type { Skills } from "../../skills/skills.ts";
import { deepFreeze } from "../../state.ts";
import { VANGUARD_PUNCH, type VanguardPunchConfig } from "./punch-part.ts";
import { VANGUARD_PLAN, type VanguardPlan, type VanguardPlanConfig } from "./plan.ts";
import bodyProfiles from "../../../../assets/entrants/vanguard/body-profiles.json" with { type: "json" };

interface BodyProfile { readonly steady: boolean; readonly flank: boolean; readonly lead?: number; readonly anchorAtDrive?: boolean }
type BodyProfiles = Readonly<Record<string, BodyProfile>>;

/** A fighter's slots, its planner any of the role's (`VANGUARD_PLAN` by default), and its body calibration. */
interface VanguardConfig extends Omit<FighterConfig, "kind" | "tactics"> {
  readonly kind: "vanguard";
  readonly tactics: FighterConfig["tactics"] | VanguardPlanConfig | PartConfig;
  readonly bodyProfiles?: BodyProfiles;
}

/**
 * Each own-body profile selects its walk (the steady stance walk, `STEADY_WALK`, or the config's),
 * whether its layered planner steps round repeated blocks (`VanguardPlanConfig.flank`), and its
 * punches' lead and preparation aim but a low-only punch's (`VanguardPunchConfig`).
 */
function validProfiles(value: unknown): value is BodyProfiles {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.entries(value).every(([model, profile]) => model.length > 0 && profile !== null && typeof profile === "object"
      && !Array.isArray(profile) && Object.keys(profile).every(key => key === "steady" || key === "flank" || key === "lead" || key === "anchorAtDrive")
      && typeof profile.steady === "boolean" && typeof profile.flank === "boolean"
      && (profile.lead === undefined || typeof profile.lead === "number" && Number.isFinite(profile.lead) && profile.lead >= 0)
      && (profile.anchorAtDrive === undefined || typeof profile.anchorAtDrive === "boolean"));
}

/** The complete own-body calibration travels with an edited mind. */
const BODY_PROFILES: PartField<VanguardConfig> = {
  kind: "text", key: "bodyProfiles", label: "Body motor profiles (JSON)",
  read: config => JSON.stringify(config.bodyProfiles ?? {}),
  write(config, text) {
    try { const profiles: unknown = JSON.parse(text); return validProfiles(profiles) ? { ...config, bodyProfiles: profiles } : null; }
    catch { return null; }
  },
};

/** A body punch behind an anticipatory guard, with a planted low punch and closed low cover. */
const VANGUARD: VanguardConfig = deepFreeze({
  kind: "vanguard", bodyProfiles,
  locomotion: { ...MOVE, otherwise: "braced" }, guard: { kind: "shield-guard" }, support: { kind: "support-fold" }, subs: [STAND_UP],
  tactics: { kind: "vanguard-plan", lowGuard: true, slowEvade: true, adaptiveEvade: true, revisitEvade: true, routeAround: true, plan: { ...FIGHTING, list: [
    { kind: "follow-orders" }, { kind: "clear-of-walls" }, { kind: "evade" },
    { kind: "break-clinch", metres: .7 }, { kind: "attack" }, { kind: "approach" }, { kind: "cover", guard: "ward" },
  ] } },
  executors: (["punch", "low-punch"] as const).map((name): VanguardPunchConfig => ({ ...VANGUARD_PUNCH.defaults, name, ...STRAIGHT_PUNCH,
    reach: .95, band: .18, through: .12, settle: .2, recover: .3, longest: .35, follow: .05,
    // The low stroke predicts the lumbar bend held by the planted support fold.
    lean: name === "low-punch" ? .89 : .1, hips: .3, turn: .55, lead: .1, chamber: .22,
    low: true, lowOnly: name === "low-punch", predict: true })),
  actions: (["punch", "low-punch"] as const).map(executor => ({ name: executor === "punch" ? "strike" : executor, executor,
    effectors: ["hand.right", "hand.left"], regions: [{ kind: "mark", mark: "middle" }], aim: { kind: "surface", tuning: {} } })),
});

/** The shared fighter runs the entrant's own immutable kit and tactics: its planner, of any kind, is checked as its part (`TacticsPart`). */
const fighter = (config: VanguardConfig): FighterConfig => ({ ...config, kind: "fighter" }) as FighterConfig;

/** The steady walk a profile selects: the stance walk, turning at 0.3 rad/s, its first two moving seconds limited to 0.2 rad/s. */
const STEADY_WALK = deepFreeze({ kind: "stance-walk" as const, tuning: { turnLimit: .3, turnStartup: { seconds: 2, limit: .2 } } });

/** `config` with `flank` set, where it is Vanguard's own planner. */
const flanking = (config: VanguardConfig["tactics"], flank: boolean | undefined): VanguardConfig["tactics"] =>
  config.kind === VANGUARD_PLAN.defaults.kind && flank !== undefined ? { ...config as VanguardPlanConfig, flank } : config;

/** Whether `executor` is a Vanguard punch (`VANGUARD_PUNCH`). */
const isPunch = (executor: ExecutorEntry): executor is VanguardPunchConfig => executor.kind === VANGUARD_PUNCH.defaults.kind;

/**
 * Its kit, with the walk, the blocked step and its punches' lead and preparation aim as its body's
 * profile names them (`bodyProfiles`), under its planner; Vanguard's own (`VANGUARD_PLAN`) also
 * closes the hands its low cover covers with (`VanguardPlan.kit`).
 */
function createVanguard(host: BodyHost, given: VanguardConfig, wiring: MindWiring) {
  const profile = given.bodyProfiles?.[host.spec.model];
  const config = { ...given, actions: armedActions(host.parts, host.spec, given.executors, given.actions),
    executors: given.executors.map(executor => isPunch(executor) && !executor.lowOnly ? { ...executor,
      ...profile?.lead !== undefined ? { lead: profile.lead } : {}, ...profile?.anchorAtDrive !== undefined ? { anchorAtDrive: profile.anchorAtDrive } : {} } : executor),
    locomotion: profile?.steady ? STEADY_WALK : given.locomotion, tactics: flanking(given.tactics, profile?.flank) };
  const body = host.command(fighterBody(config, wiring, host.parts));
  const making = (): TacticsMaking => ({ spec: host.spec, actions: config.actions, estimates: configuredActionEstimates(host.parts, host.spec, config.executors, config.actions),
    aims: configuredAims(host.parts, host.spec, config.executors, config.actions),
    orders: sight => wiring.orders(sight.view.senses), ...wiring.script ? { script: wiring.script } : {}, parts: host.parts });
  const tactics: VanguardPlan = tacticsOf(making(), config.tactics);
  let skills: Skills;
  skills = driveBy(body, tactics, (made, driving) => {
    const kit = fighterSkills(made, host.clock, host.parts, config, driving, () => skills?.report.ledger ?? []);
    return tactics.kit ? tactics.kit(kit) : kit;
  });
  return { skills, state: skills.state };
}

/** Vanguard is an independent entrant, with every skill exposed through the shared mind editor. */
export const VANGUARD_MIND = controller<VanguardConfig>({
  role: "mind", label: "Vanguard", stage: "experimental", defaults: VANGUARD,
  fields: [BODY_PROFILES],
  slots: [slotOne("navigation", "Navigation", "navigation", true), slotOne("tactics", "Tactics", "tactics"),
    slotOne("locomotion", "Walk", "locomotion"), slotOne("guard", "Guard", "guard"), slotList("executors", "Executors", "executor"),
    slotOne("support", "Low support", "support", true), slotList("subs", "When down", "sub-mind"),
    slotOne("motor", "Motor control", "motor", true)],
  keys: { kind: true, tactics: true, locomotion: true, navigation: true, guard: true, executors: true, actions: true,
    support: true, subs: true, motor: true, bodyProfiles: true },
  parts: [VANGUARD_PUNCH, VANGUARD_PLAN],
  fits: fitsAll<VanguardConfig>(takesCommands, (spec, config, parts) => actionConfigFaults(parts, spec, config.executors, config.actions)[0] ?? null,
    fitsWhen((spec, config, parts) => armedActions(parts, spec, config.executors, config.actions).length > 0, "it throws no usable blow")),
  strikes: (spec, config, parts) => armedActions(parts, spec, config.executors, config.actions).flatMap(action => action.effectors),
  faults: (config, parts) => [...fighterFaults(fighter(config), parts),
    ...config.bodyProfiles !== undefined && !validProfiles(config.bodyProfiles) ? ["bodyProfiles: model names mapped to steady/flank booleans, an optional nonnegative lead and optional preparation-aim flag"] : [],
    ...config.tactics.kind === VANGUARD_PLAN.defaults.kind && (config.tactics as VanguardPlanConfig).lowGuard && config.support?.kind !== "support-fold"
      ? ["tactics.lowGuard needs the support fold"] : []],
  presets: deepFreeze({ vanguard: { label: "Vanguard", config: VANGUARD } }),
  builtIn: (spec, config, parts) => parts.of("guard", config.guard).posture(spec, config.guard),
  create: createVanguard,
});
