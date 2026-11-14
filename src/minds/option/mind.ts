import { motorRequirementRefusal } from "../../control/motor-part.ts";
import { deepFreeze } from "../../core/state.ts";
import { slotList, slotOne, type PartConfig, type Slot } from "../../parts/parts.ts";
import { partRequirements, whenEmpty } from "../../parts/tree.ts";
import { FILLED, filledOf, filledRefusal, motorOf } from "../../skills/assembly/filled.ts";
import { controller } from "../catalog/controller.ts";
import { buildOptionMind, type OptionMind } from "./build.ts";
import { isSettings, optionMindFaults, resolveConfig, type OptionAssembly, type OptionMindConfig } from "./config.ts";
import { describeOptionMind } from "./description.ts";
import type { PartLookup } from "../../parts/lookup.ts";
import type { OptionPart } from "./parts.ts";
import { skillsOf } from "./skills.ts";
import { guardConfigs, initialGuardPosture } from "../../skills/assembly/guards.ts";
import { selectedOptions, strikeDefaults } from "./kinds.ts";
import { PROFILE_MODEL } from "./profile-contract.ts";
import type { BodySpec } from "../../core/bodies/spec/body.ts";

/**
 * **Option Mind's controller**, with `assembly`'s defaults: the part of role `mind` the catalog
 * registers. Each job it names lives in a file of its own: a config and what is wrong with it
 * (`config.ts`), what a config builds, for a screen (`description.ts`), and the running mind
 * (`build.ts`). What stays here is what the catalog asks of every mind: its slots, whether a
 * body fits it, and the posture its body is built in.
 */
export function optionMind(assembly: OptionAssembly) {
  const resolvedFor = (config: OptionMindConfig, spec: BodySpec, parts: PartLookup) => {
    const resolved = resolveConfig(config, assembly);
    return parts.of("predictions", resolved.predictions).model === PROFILE_MODEL
      ? { ...resolved, options: selectedOptions(parts, spec, resolved.options) } : resolved;
  };
  const defaults: OptionMindConfig = deepFreeze({ kind: "option", chooser: assembly.chooser, options: assembly.options });
  const slots: readonly Slot[] = Object.freeze([
    slotOne("chooser", "Chooser", "chooser"), slotList("options", "Options", "option"), slotOne("predictions", "Predictions", "predictions", true),
  ]);
  /** Each Option `config` runs, its own or the assembly's, with its part; one that is no Option's config is passed over, a fault of the tree. */
  const optionsOf = (config: OptionMindConfig, parts: PartLookup): readonly (readonly [OptionPart, PartConfig])[] =>
    resolveConfig(config, assembly).options.flatMap((option) => { const part = parts.find("option", option); return part ? [[part, option] as const] : []; });
  return controller<OptionMindConfig>({
    role: "mind", label: "Option Mind", stage: "game", fields: [], slots, defaults,
    keys: { kind: true, chooser: true, options: true, predictions: true, rate: true, tuning: true }, tuning: ["parts"],
    // The parts an experiment passes in under its skills, each at its place in the config.
    children: config => isSettings(config.tuning?.parts) ? Object.entries(config.tuning.parts).flatMap(([place, value]) => Object.hasOwn(FILLED, place)
      ? [{ path: ["tuning", "parts", place], role: FILLED[place as keyof typeof FILLED], config: value }] : []) : [],
    // What it runs that its config does not say: its predictions and the options it starts with where it names none, the navigation its walks go by
    // where no Option names one, and every part that may lie under its skills, of which a body gets the one it fits.
    supplies: (config, parts) => [
      ...whenEmpty(slots, config, { predictions: assembly.predictions }),
      ...(config.options ? [] : assembly.options).map((option) => ({ role: "option" as const, config: option })),
      ...parts.candidates("navigation").map(one => ({ role: "navigation" as const, config: one })),
      ...parts.candidates("support").map(one => ({ role: "support" as const, config: one })),
      ...strikeDefaults(parts).map(one => ({ role: "option" as const, config: one })),
      ...Object.values(FILLED).flatMap((role) => parts.candidates(role).map((one) => ({ role, config: one }))),
      ...parts.game("leg-adapter").map((one) => ({ role: "leg-adapter" as const, config: one })),
    ],
    faults: (config, parts) => optionMindFaults(resolveConfig(config, assembly), parts),
    fits: (spec, config, parts) => {
      const refused = filledRefusal(parts, spec, config.tuning?.parts);
      if (refused) return refused;
      const resolved = resolvedFor(config, spec, parts), named = skillsOf(parts, spec, resolved.options);
      if (named.faults.length) return named.faults[0]!;
      // Its motor gives what every part it builds requires.
      const built: readonly PartConfig[] = [...resolved.options, ...named.executors, ...named.techniques, ...named.actions.flatMap(action => action.aim ? [action.aim] : []),
        ...named.supports, ...named.navigations,
        ...(["motor", "legs"] as const).map(place => filledOf(parts, spec, place, config.tuning?.parts)),
        ...guardConfigs(parts, spec, config.tuning?.parts?.guard)];
      const required = built.flatMap(part => partRequirements(parts, part, spec));
      return motorRequirementRefusal(motorOf(parts, filledOf(parts, spec, "motor", config.tuning?.parts)), spec, required);
    },
    describe: (spec, config, parts) => describeOptionMind(spec, config, resolvedFor(config, spec, parts), parts),
    // What a fight asks of a mind, each answered by its Options, and by its guard for what it holds.
    strikes: (spec, config, parts) => resolvedFor(config, spec, parts).options.flatMap(option => parts.of("option", option).strikes?.(spec, option, parts) ?? []),
    obeys: (config, parts) => optionsOf(config, parts).some(([part]) => part.obeys === true),
    phases: (config, parts) => Object.assign({}, ...optionsOf(config, parts).map(([part]) => part.phases ?? {})),
    supportedEquipment: (spec, config, parts) => {
      return guardConfigs(parts, spec, config.tuning?.parts?.guard).flatMap(guard => parts.of("guard", guard).supportedEquipment?.(spec, guard) ?? []);
    },
    builtIn: (spec, config, parts) => {
      return initialGuardPosture(parts, spec, guardConfigs(parts, spec, config.tuning?.parts?.guard));
    },
    create: (host, config): OptionMind => buildOptionMind(host, resolvedFor(config, host.spec, host.parts)),
  });
}
