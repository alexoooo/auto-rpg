import { actionConfigFaults, armedActions } from "../../mind/action-config.ts";
import { actionAim } from "../../mind/action-aim.ts";
import { configuredActionEstimates, configuredExecutors } from "../../mind/action-config.ts";
import { FIGHTING, MOVE, STAND_UP, type FighterConfig } from "../../mind/config.ts";
import { controller } from "../../mind/controller.ts";
import { createFighter, fighterBody, fighterFaults, fighterSkills } from "../../mind/fighter.ts";
import { toggle, type PartField } from "../../mind/fields.ts";
import type { BodyHost } from "../../mind/host.ts";
import type { MindWiring } from "../../mind/minds.ts";
import { fitsAll, fitsWhen, slotList, slotOne, takesCommands } from "../../mind/parts.ts";
import { tacticsOf } from "../../mind/tactics-of.ts";
import { driveBy } from "../../mind/tactics.ts";
import { guardPosture } from "../../skills/guard.ts";
import { STRAIGHT_PUNCH } from "../../skills/straight-punch.ts";
import type { Skills } from "../../skills/skills.ts";
import type { ExecutorBinding } from "../../skills/action-instances.ts";
import { deepFreeze } from "../../state.ts";
import { committedAim } from "./committed-aim.ts";
import { lowGuard } from "./low-guard.ts";
import { adaptiveGuard } from "./adaptive-guard.ts";
import { routeAround } from "./route-around.ts";
import { flank } from "./flank.ts";
import bodyProfiles from "../../../../assets/entrants/vanguard/body-profiles.json" with { type: "json" };

interface BodyProfile { readonly steady: boolean; readonly flank: boolean; readonly lead?: number; readonly anchorAtDrive?: boolean }
type BodyProfiles = Readonly<Record<string, BodyProfile>>;

interface VanguardConfig extends Omit<FighterConfig, "kind"> {
  readonly kind: "vanguard";
  readonly commitAim?: boolean;
  readonly lowGuard?: boolean;
  readonly predictAim?: boolean;
  readonly anchorAtDrive?: boolean;
  readonly slowEvade?: boolean;
  readonly adaptiveEvade?: boolean;
  readonly revisitEvade?: boolean;
  readonly steadyWalk?: boolean;
  readonly routeAround?: boolean;
  readonly flankAfterBlocks?: boolean;
  readonly bodyProfiles?: BodyProfiles;
  readonly lowActions?: readonly string[];
}

/** Each own-body profile selects its walk, blocked step, standing-punch lead and preparation aim. */
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

/** Low-only actions remain ordinary editable actions, with their admission restriction named explicitly. */
const LOW_ACTIONS: PartField<VanguardConfig> = {
  kind: "text", key: "lowActions", label: "Low-only action names (JSON)",
  read: config => JSON.stringify(config.lowActions ?? []),
  write(config, text) {
    try {
      const names: unknown = JSON.parse(text);
      return Array.isArray(names) && names.every(name => typeof name === "string") ? { ...config, lowActions: names } : null;
    } catch { return null; }
  },
};

/** A restriction names distinct actions, and the committed-aim runtime enforces it. */
function lowActionFaults(config: VanguardConfig): readonly string[] {
  if (config.lowActions === undefined) return [];
  const names = config.lowActions;
  if (!Array.isArray(names) || names.some(name => typeof name !== "string") || new Set(names).size !== names.length
    || names.some(name => !config.actions.some(action => action.name === name))) return ["lowActions: distinct known action names"];
  return names.length && !config.commitAim ? ["lowActions needs committed aim"] : [];
}

/** A body punch behind an anticipatory guard, with a planted low punch and closed low cover. */
const VANGUARD: VanguardConfig = deepFreeze({
  kind: "vanguard", commitAim: true, lowGuard: true, lowActions: ["low-punch"], predictAim: true,
  slowEvade: true, adaptiveEvade: true, revisitEvade: true, routeAround: true, bodyProfiles,
  locomotion: { ...MOVE, otherwise: "braced" }, guard: { kind: "shield-guard" }, support: { kind: "support-fold" }, subs: [STAND_UP],
  tactics: { ...FIGHTING, list: [
    { kind: "follow-orders" }, { kind: "clear-of-walls" }, { kind: "evade" },
    { kind: "break-clinch", metres: .7 }, { kind: "attack" }, { kind: "approach" }, { kind: "cover", guard: "ward" },
  ] },
  executors: (["punch", "low-punch"] as const).map(name => ({ name, kind: "straight-punch", ...STRAIGHT_PUNCH,
    reach: .95, band: .18, through: .12, settle: .2, recover: .3, longest: .35, follow: .05,
    // The low stroke predicts the lumbar bend held by the planted support fold.
    lean: name === "low-punch" ? .89 : .1, hips: .3, turn: .55, lead: .1, chamber: .22 })),
  actions: (["punch", "low-punch"] as const).map(executor => ({ name: executor === "punch" ? "strike" : executor, executor,
    effectors: ["hand.right", "hand.left"], regions: [{ kind: "mark", mark: "middle" }], aim: { kind: "surface", tuning: {} } })),
});

/** The shared fighter runs the entrant's own immutable kit and tactics. */
const fighter = (config: VanguardConfig): FighterConfig => ({ ...config, kind: "fighter" });

/** A short defensive retreat is capped at 0.2 m/s instead of the navigator's ordinary travel pace. */
const EVADE_PACE = .2;
/** The stance walk turns at 0.3 rad/s, with its first two moving seconds limited to 0.2 rad/s. */
const STEADY_TURN = deepFreeze({ turnLimit: .3, turnStartup: { seconds: 2, limit: .2 } });

/** The committed-aim variant supplies its own straight-punch bindings and shares the rest of the kit. */
function createVanguard(host: BodyHost, given: VanguardConfig, wiring: MindWiring) {
  if (!given.commitAim) return createFighter(host, fighter(given), wiring);
  const profile = given.bodyProfiles?.[host.spec.model];
  const lowActions = new Set(given.lowActions ?? []);
  const config = { ...given, actions: armedActions(host.spec, given.executors, given.actions),
    executors: given.executors.map(executor => executor.kind === "straight-punch" && profile?.lead !== undefined
      && !given.actions.some(action => action.executor === executor.name && lowActions.has(action.name))
      ? { ...executor, lead: profile.lead } : executor),
    locomotion: (profile?.steady ?? given.steadyWalk) ? { kind: "stance-walk" as const, tuning: STEADY_TURN } : given.locomotion };
  const body = host.command(fighterBody(config, wiring));
  const ordinaryTactics = tacticsOf(config.tactics, host.spec, wiring.name, config.actions,
    sight => wiring.orders(sight.view.senses), wiring.script, configuredActionEstimates(host.spec, config.executors, config.actions));
  const attacking = given.adaptiveEvade && config.tactics.kind === "behaviours" ? tacticsOf({ ...config.tactics,
    list: config.tactics.list.filter(behaviour => behaviour.kind !== "evade") }, host.spec, wiring.name, config.actions,
    sight => wiring.orders(sight.view.senses), wiring.script, configuredActionEstimates(host.spec, config.executors, config.actions)) : null;
  const policy = attacking ? adaptiveGuard(attacking, ordinaryTactics, given.revisitEvade) : ordinaryTactics;
  const tactics = given.slowEvade ? { ...policy, get engagement() { return policy.engagement; },
    decide(sight: Parameters<typeof policy.decide>[0], dt: number) {
      const intent = policy.decide(sight, dt);
      return policy.engagement?.phase === "evade" ? { ...intent, pace: EVADE_PACE } : intent;
    },
  } : policy;
  const routed = given.routeAround ? routeAround(tactics, sight => wiring.orders(sight.view.senses)) : tactics;
  const angled = (profile?.flank ?? given.flankAfterBlocks) ? flank(routed, host.spec, sight => wiring.orders(sight.view.senses)) : routed;
  const low = given.lowGuard ? lowGuard(angled, host.spec, sight => wiring.orders(sight.view.senses)) : null;
  let skills: Skills;
  const ledger = () => skills?.report.ledger ?? [];
  skills = driveBy(body, low?.tactics ?? angled, (made, driving) => {
    const ordinary = configuredExecutors(made, host.clock, config.executors.filter(executor => executor.kind !== "straight-punch"),
      config.actions.filter(action => !config.executors.some(executor => executor.name === action.executor && executor.kind === "straight-punch")), ledger);
    const aims = new Map(config.actions.map(action => [action.name, actionAim(host.spec, action.aim, action.family)]));
    const executors = config.executors.map((settings): ExecutorBinding => {
      if (settings.kind !== "straight-punch") return ordinary.find(binding => binding.name === settings.name)!;
      const executor = committedAim(made, config.actions.filter(action => action.executor === settings.name).map(action => action.name), settings,
        (view, target, action, effector) => low?.aim(view, target) ?? aims.get(action)?.(view, target, effector, ledger())?.at ?? null, given.lowGuard, given.predictAim,
        !config.actions.some(action => action.executor === settings.name && lowActions.has(action.name)) && (profile?.anchorAtDrive ?? given.anchorAtDrive));
      return { name: settings.name, executor: { ...executor,
        readiness(view, action, effector, target, around) {
          if (lowActions.has(action) && !low?.aim(view, target)) return { kind: "blocked" as const, reason: "action needs a low opponent" };
          return executor.readiness(view, action, effector, target, around);
        },
      } };
    });
    const skills = fighterSkills(made, host.clock, config, driving, ledger, executors);
    return low ? low.skills(skills) : skills;
  });
  return { skills, state: skills.state };
}

/** Vanguard is an independent entrant, with every skill exposed through the shared mind editor. */
export const VANGUARD_MIND = controller<VanguardConfig>({
  role: "mind", label: "Vanguard", stage: "experimental", defaults: VANGUARD,
  fields: [toggle("commitAim", "Commit to one aim point"), toggle("lowGuard", "Prepare a low guard"), toggle("predictAim", "Refresh the committed point's motion prediction"),
    toggle("anchorAtDrive", "Refresh the opening until commitment"),
    toggle("slowEvade", "Limit evasive steps"), toggle("adaptiveEvade", "Learn attack or evasion from target contacts"),
    toggle("revisitEvade", "Revisit an earlier quiet policy"), toggle("steadyWalk", "Limit stance-walk turns"),
    toggle("routeAround", "Find another reachable entry point"), toggle("flankAfterBlocks", "Step around repeated blocks"), BODY_PROFILES, LOW_ACTIONS],
  slots: [slotOne("navigation", "Navigation", "navigation", true), slotOne("tactics", "Tactics", "tactics"),
    slotOne("locomotion", "Walk", "locomotion"), slotOne("guard", "Guard", "guard"), slotList("executors", "Executors", "executor"),
    slotOne("support", "Low support", "support", true), slotList("subs", "When down", "sub-mind"),
    slotOne("motor", "Motor control", "motor", true)],
  keys: { kind: true, tactics: true, locomotion: true, navigation: true, guard: true, executors: true, actions: true,
    support: true, subs: true, motor: true, commitAim: true, lowGuard: true, predictAim: true, anchorAtDrive: true, slowEvade: true, adaptiveEvade: true, revisitEvade: true, steadyWalk: true, routeAround: true, flankAfterBlocks: true, bodyProfiles: true, lowActions: true },
  fits: fitsAll<VanguardConfig>(takesCommands, (spec, config) => actionConfigFaults(spec, config.executors, config.actions)[0] ?? null,
    fitsWhen((spec, config) => armedActions(spec, config.executors, config.actions).length > 0, "it throws no usable blow")),
  strikes: (spec, config) => armedActions(spec, config.executors, config.actions).flatMap(action => action.effectors),
  faults: config => [...fighterFaults(fighter(config)), ...lowActionFaults(config),
    ...config.commitAim !== undefined && typeof config.commitAim !== "boolean" ? ["commitAim: a boolean"] : [],
    ...config.lowGuard !== undefined && typeof config.lowGuard !== "boolean" ? ["lowGuard: a boolean"] : [],
    ...config.predictAim !== undefined && typeof config.predictAim !== "boolean" ? ["predictAim: a boolean"] : [],
    ...config.predictAim && !config.commitAim ? ["predictAim needs committed aim"] : [],
    ...config.anchorAtDrive !== undefined && typeof config.anchorAtDrive !== "boolean" ? ["anchorAtDrive: a boolean"] : [],
    ...config.anchorAtDrive && !config.commitAim ? ["anchorAtDrive needs committed aim"] : [],
    ...config.slowEvade !== undefined && typeof config.slowEvade !== "boolean" ? ["slowEvade: a boolean"] : [],
    ...config.slowEvade && !config.commitAim ? ["slowEvade needs committed aim"] : [],
    ...config.adaptiveEvade !== undefined && typeof config.adaptiveEvade !== "boolean" ? ["adaptiveEvade: a boolean"] : [],
    ...config.adaptiveEvade && (!config.slowEvade || config.tactics.kind !== "behaviours") ? ["adaptiveEvade needs behaviour tactics and limited evasive steps"] : [],
    ...config.revisitEvade !== undefined && typeof config.revisitEvade !== "boolean" ? ["revisitEvade: a boolean"] : [],
    ...config.revisitEvade && !config.adaptiveEvade ? ["revisitEvade needs adaptive evasion"] : [],
    ...config.steadyWalk !== undefined && typeof config.steadyWalk !== "boolean" ? ["steadyWalk: a boolean"] : [],
    ...config.steadyWalk && (!config.commitAim || config.locomotion.kind !== "stance-walk") ? ["steadyWalk needs committed aim and stance walking"] : [],
    ...config.routeAround !== undefined && typeof config.routeAround !== "boolean" ? ["routeAround: a boolean"] : [],
    ...config.routeAround && !config.commitAim ? ["routeAround needs committed aim"] : [],
    ...config.flankAfterBlocks !== undefined && typeof config.flankAfterBlocks !== "boolean" ? ["flankAfterBlocks: a boolean"] : [],
    ...config.flankAfterBlocks && !config.commitAim ? ["flankAfterBlocks needs committed aim"] : [],
    ...config.bodyProfiles !== undefined && !validProfiles(config.bodyProfiles) ? ["bodyProfiles: model names mapped to steady/flank booleans, an optional nonnegative lead and optional preparation-aim flag"] : [],
    ...config.bodyProfiles && !config.commitAim ? ["bodyProfiles needs committed aim"] : [],
    ...config.lowGuard && (!config.commitAim || config.support?.kind !== "support-fold") ? ["lowGuard needs committed aim and low support"] : []],
  presets: deepFreeze({ vanguard: { label: "Vanguard", config: VANGUARD } }),
  builtIn: guardPosture,
  create: createVanguard,
});
