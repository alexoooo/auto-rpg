import { motorRequirementRefusal } from "../../control/motor-part.ts";
import type { BodySpec } from "../../core/bodies/spec/body.ts";
import type { ComponentDescription } from "../description.ts";
import type { Body } from "../../control/body.ts";
import { aimsState, configuredAims } from "../../skills/action-config.ts";
import type { SkillKit } from "../../skills/config.ts";
import { controller } from "../controller.ts";
import { everyOf } from "../decider.ts";
import { kitBody, kitSkills } from "../../skills/assembly.ts";
import { groundSkills } from "../../skills/recovery/skills.ts";
import type { BodyHost } from "../host.ts";
import { FILLED, filledOf, filledRefusal, kitOf, motorOf, type Filled } from "../../skills/kit.ts";
import type { PartLookup } from "../../parts/lookup.ts";
import type { MindWiring } from "../minds.ts";
import { slotList, slotOne, slotsOf, partRequirements, type Part, type PartConfig, type Slot, type Role } from "../../parts/parts.ts";
import { driveBy } from "../decider.ts";
import { commandedMind } from "../sub-mind.ts";
import type { Skills } from "../../skills/framework/skills.ts";
import { deepFreeze } from "../../core/state.ts";
import { recordingKey } from "../../core/world/recording.ts";
import { skillsOf } from "./skills.ts";
import { optionDecider, type DeciderMaking } from "./decider.ts";

/**
 * The selected chooser, decision provider, options and decision rate. Omitted or null options and
 * predictions use the values supplied by the calling assembly; an explicit empty option list stays empty.
 * Research tuning replaces the configured continuous services by their declared place.
 */
export interface OptionMindConfig {
  readonly kind: "option";
  readonly chooser: PartConfig;
  readonly options?: readonly PartConfig[] | null;
  readonly predictions?: PartConfig | null;
  /** The rate it decides at, Hz (`everyOf`, `Pace`): every control step unless given; its skills make the command every step from what it last decided. */
  readonly rate?: number;
  /** An experiment's research tuning, which a link does not carry: `parts`, a part in place of what lies under its skills, by its place (`Filled`). */
  readonly tuning?: { readonly parts?: Filled };
}

/** `config` on the legs `legs` (role `locomotion`) in place of those its body fits: an experiment's (`OptionMindConfig.tuning`). */
export const withLegs = (config: OptionMindConfig, legs: PartConfig): OptionMindConfig => ({ ...config, tuning: { ...config.tuning, parts: { ...config.tuning?.parts, legs } } });

/** A controller resolves its optional assembly before building the shared framework. */
type Configured = OptionMindConfig & { readonly options: readonly PartConfig[]; readonly predictions: PartConfig; readonly navigation: PartConfig };

/** Repeated configured choices are one Option twice, independent of their implementation. */
function optionsFaults(options: readonly PartConfig[]): readonly string[] {
  const seen = new Set<string>(), faults: string[] = [];
  for (const option of options) {
    const key = recordingKey(option);
    if (seen.has(key)) faults.push(`options: duplicate ${option.kind}`);
    seen.add(key);
  }
  return faults;
}

/** What is wrong with the parts `config` passes in under its skills (`tuning.parts`), each a sentence: a place it has not, or a part's own faults. */
const settingsRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
function tunedFaults(config: OptionMindConfig): readonly string[] {
  if (config.tuning !== undefined && !settingsRecord(config.tuning)) return ["tuning: a record of research settings"];
  const given = config.tuning?.parts;
  if (given !== undefined && !settingsRecord(given)) return ["tuning.parts: a record of service parts"];
  return Object.keys(given ?? {}).filter(place => !Object.hasOwn(FILLED, place)).map(place => `tuning: no place ${place} under its skills`);
}

/** Configuration faults include duplicate choices, service settings, a positive rate and compatible provider, chooser and option protocols. */
function optionMindFaults(config: Configured, parts: PartLookup): readonly string[] {
  const options = config.options, faults = [...optionsFaults(options), ...tunedFaults(config)];
  const model = parts.of("predictions", config.predictions).model;
  if (parts.of("chooser", config.chooser).model !== model) faults.push(`chooser: incompatible with prediction model ${model}`);
  for (const option of options) if (parts.of("option", option).model !== model) faults.push(`options: ${option.kind} is incompatible with prediction model ${model}`);
  if (config.rate !== undefined && !(Number.isFinite(config.rate) && config.rate > 0)) faults.push("rate: a positive number of times a second");
  return faults;
}

/**
 * Build the declared discrete and continuous skills, then let the selected compatible provider
 * construct the decision session that drives them. Missing service configurations are resolved
 * from registered applicable parts; the assembly supplies navigation where no Option names one.
 */
function createOptionMind(host: BodyHost, config: Configured, wiring: MindWiring) {
  const parts = host.parts, spec = host.spec, given = config.tuning?.parts ?? {}, named = skillsOf(parts, spec, config.options);
  const legs = filledOf(parts, spec, "legs", given), kit: SkillKit = { legs, navigation: named.navigation ?? config.navigation, guard: filledOf(parts, spec, "guard", given),
    executors: named.executors, actions: named.actions, support: named.support };
  const { body } = host.take((own) => commandedMind(own, { ...kitBody(filledOf(parts, spec, "motor", given), parts), ...wiring.experiment }, host.clock));
  const ground = groundSkills(body, host.clock, kitOf(parts, spec, given), named.techniques);
  let skills: Skills | undefined;
  const aims = configuredAims(parts, spec, kit.actions);
  const make = (made: Body) => kitSkills(made, host.clock, parts, kit, () => skills?.report.ledger ?? [], ground, aims);
  const hz = Math.round(1 / host.clock.dt), every = everyOf(config.rate, hz);
  const making: DeciderMaking = { spec, rules: host.rules, orders: (sight) => wiring.orders(sight.view.senses), parts, techniques: named.techniques };
  const driven = driveBy(body, optionDecider(making, hz, { ...config, legs }, host.seed, host.phase, hz / every, body.delay), make,
    { every, phase: host.phase, orders: making.orders }, aimsState(aims));
  skills = driven.skills;
  return driven;
}

/** Defaults and optional admission/inspection policies supplied by the calling composition. */
export interface OptionAssembly {
  readonly options: readonly PartConfig[];
  readonly chooser: PartConfig;
  readonly predictions: PartConfig;
  readonly navigation: PartConfig;
  readonly recovery?: (parts: PartLookup, spec: BodySpec, options: readonly PartConfig[]) => readonly PartConfig[];
  readonly validate?: (spec: BodySpec, options: readonly PartConfig[], techniques: readonly PartConfig[], parts: PartLookup, model: string) => string | null;
  readonly replaceRecovery?: (parts: PartLookup, options: readonly PartConfig[], techniques: readonly PartConfig[]) => readonly PartConfig[];
}

export function optionMind(assembly: OptionAssembly) {
  const defaults: OptionMindConfig = deepFreeze({ kind: "option", chooser: assembly.chooser, options: assembly.options });
  const slots: readonly Slot[] = Object.freeze([
    slotOne("chooser", "Chooser", "chooser"), slotList("options", "Options", "option"), slotOne("predictions", "Predictions", "predictions", true, assembly.predictions),
  ]);
  const configured = (config: OptionMindConfig): Configured => ({ ...config, options: config.options ?? assembly.options,
    predictions: config.predictions ?? assembly.predictions, navigation: assembly.navigation });
  return controller<OptionMindConfig>({
    role: "mind", label: "Option Mind", stage: "game", fields: [], slots, defaults,
    children: config => settingsRecord(config.tuning?.parts) ? Object.entries(config.tuning.parts).flatMap(([place, value]) => Object.hasOwn(FILLED, place)
      ? [{ path: ["tuning", "parts", place], role: FILLED[place as keyof typeof FILLED], config: value }] : []) : [],
    keys: { kind: true, chooser: true, options: true, predictions: true, rate: true, tuning: true }, tuning: ["parts"],
    // The options it starts with where its config names none, the navigation its walks go by where none names one, and every part that may lie under its skills.
    uses: (config, parts) => [...config.options ? [] : assembly.options, ...config.predictions ? [] : [assembly.predictions], assembly.navigation, ...Object.values(FILLED).flatMap((role) => parts.game(role)), ...parts.game("leg-adapter"),
      ...Object.values(config.tuning?.parts ?? {})],
    fits: (spec, config, parts) => {
      const refused = filledRefusal(parts, spec, config.tuning?.parts);
      if (refused) return refused;
      const resolved = configured(config), named = skillsOf(parts, spec, resolved.options);
      if (named.faults.length) return named.faults[0]!;
      const admission = assembly.validate?.(spec, resolved.options, named.techniques, parts, parts.of("predictions", resolved.predictions).model);
      if (admission) return admission;
      const needs = (role: Role, configs: readonly PartConfig[]) => configs.flatMap(part => partRequirements(parts, role, part, spec));
      const required = [...needs("option", resolved.options), ...needs("executor", named.executors), ...needs("technique", named.techniques),
        ...needs("aim", named.actions.flatMap(action => action.aim ? [action.aim] : [])),
        ...needs("support", named.support ? [named.support] : []), ...needs("navigation", [named.navigation ?? resolved.navigation]),
        ...(Object.keys(FILLED) as (keyof typeof FILLED)[]).flatMap(place => needs(FILLED[place], [filledOf(parts, spec, place, config.tuning?.parts)]))];
      return motorRequirementRefusal(motorOf(parts, filledOf(parts, spec, "motor", config.tuning?.parts)), spec, required);
    },
    describe: (spec, config, parts) => {
      const resolved = configured(config), named = skillsOf(parts, spec, resolved.options);
      const components: ComponentDescription[] = [];
      const sourceOf = (target: PartConfig, wanted: Role): import("../description.ts").ConfigPath | null => {
        const visit = (value: PartConfig, role: Role, path: readonly (string | number)[]): import("../description.ts").ConfigPath | null => {
          if (role === wanted && recordingKey(value) === recordingKey(target)) return path;
          for (const slot of slotsOf(parts.of(role, value), value)) {
            const raw = (value as unknown as Record<string, unknown>)[slot.key];
            const children = slot.many ? Array.isArray(raw) ? raw : [] : raw ? [raw] : [];
            for (const [i, child] of children.entries()) {
              const found = visit(child as PartConfig, slot.role, [...path, slot.key, ...slot.many ? [i] : []]);
              if (found) return found;
            }
          }
          const owner: Part = parts.of(role, value);
          for (const child of owner.children?.(value) ?? []) {
            if (child.path === null) continue;
            const found = visit(child.config as PartConfig, child.role, [...path, ...child.path]);
            if (found) return found;
          }
          return null;
        };
        return visit(config, "mind", []);
      };
      const component = (owner: string, role: Role, selected: PartConfig, fallback: import("../description.ts").ConfigPath | null = null): void => {
        if (!components.some(component => component.owner === owner)) components.push({ owner, role, config: selected, path: sourceOf(selected, role) ?? fallback });
      };
      const actions = resolved.options.flatMap((option, i) => {
        const path = config.options == null ? null : ["options", i] as const;
        const declaration = parts.of("option", option).skills?.(option, spec, parts, resolved.options);
        components.push({ config: option, role: "option", owner: `option:${i}`, path });
        if (declaration?.executor) {
          const { name, ...settings } = declaration.executor;
          component(name, "executor", settings, path);
        }
        if (declaration?.technique) component(declaration.technique.kind, "technique", declaration.technique, path);
        if (declaration?.support) component("support", "support", declaration.support, path);
        if (declaration?.navigation) component("navigation", "navigation", declaration.navigation, path);
        return declaration?.action ? [{ action: declaration.action, path }] : [];
      });
      for (const place of Object.keys(FILLED) as (keyof typeof FILLED)[]) {
        const selected = filledOf(parts, spec, place, config.tuning?.parts);
        component(place === "legs" ? "locomotion" : place, FILLED[place], selected,
          config.tuning?.parts?.[place] ? ["tuning", "parts", place] : null);
      }
      component("navigation", "navigation", named.navigation ?? resolved.navigation);
      const techniques = assembly.recovery?.(parts, spec, resolved.options) ?? [];
      return { executors: named.executors, actions, techniques: named.techniques, components,
        ...(assembly.replaceRecovery && techniques.length ? { recovery: { techniques,
          replace: (next: readonly PartConfig[]) => ({ ...config, options: assembly.replaceRecovery!(parts, resolved.options, next) }) } } : {}) };
    },
    supportedEquipment: (spec, config, parts) => {
      const guard = filledOf(parts, spec, "guard", config.tuning?.parts);
      return parts.of("guard", guard).supportedEquipment?.(spec, guard, parts) ?? [];
    },
    faults: (config, parts) => optionMindFaults(configured(config), parts),
    builtIn: (spec, config, parts) => {
      const guard = filledOf(parts, spec, "guard", config.tuning?.parts);
      return parts.of("guard", guard).posture(spec, guard);
    },
    create: (host, config, wiring) => createOptionMind(host, configured(config), wiring),
  });
}
