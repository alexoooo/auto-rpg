import { motorRequirementRefusal } from "../../control/motor-part.ts";
import { deepFreeze } from "../../core/state.ts";
import { slotList, slotOne, type PartConfig, type Slot } from "../../parts/parts.ts";
import { partRequirements } from "../../parts/tree.ts";
import { FILLED, filledOf, filledRefusal, motorOf } from "../../skills/assembly/kit.ts";
import { standUpFaults } from "../../skills/recovery/stand-up.ts";
import { controller } from "../catalog/controller.ts";
import { buildOptionMind, type OptionMind } from "./build.ts";
import { isSettings, optionMindFaults, resolveConfig, type OptionAssembly, type OptionMindConfig } from "./config.ts";
import { describeOptionMind } from "./description.ts";
import type { PartLookup } from "../../parts/lookup.ts";
import type { OptionPart } from "./parts.ts";
import { PROFILE_MODEL } from "./profile-contract.ts";
import { waysUpIn } from "./rise.ts";
import { skillsOf } from "./skills.ts";

/**
 * **Option Mind's controller**, with `assembly`'s defaults: the part of role `mind` the catalog
 * registers. Each job it names lives in a file of its own: a config and what is wrong with it
 * (`config.ts`), what a config builds, for a screen (`description.ts`), and the running mind
 * (`build.ts`). What stays here is what the catalog asks of every mind: its slots, whether a
 * body fits it, and the posture its body is built in.
 */
export function optionMind(assembly: OptionAssembly) {
  const defaults: OptionMindConfig = deepFreeze({ kind: "option", chooser: assembly.chooser, options: assembly.options });
  const slots: readonly Slot[] = Object.freeze([
    slotOne("chooser", "Chooser", "chooser"), slotList("options", "Options", "option"), slotOne("predictions", "Predictions", "predictions", true, assembly.predictions),
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
    // The options it starts with where its config names none, the navigation its walks go by where none names one, and every part that may lie under its skills.
    uses: (config, parts) => [...config.options ? [] : assembly.options, ...config.predictions ? [] : [assembly.predictions], assembly.navigation, ...Object.values(FILLED).flatMap((role) => parts.game(role)), ...parts.game("leg-adapter"),
      ...Object.values(config.tuning?.parts ?? {})],
    faults: (config, parts) => optionMindFaults(resolveConfig(config, assembly), parts),
    fits: (spec, config, parts) => {
      const refused = filledRefusal(parts, spec, config.tuning?.parts);
      if (refused) return refused;
      const resolved = resolveConfig(config, assembly), named = skillsOf(parts, spec, resolved.options);
      if (named.faults.length) return named.faults[0]!;
      // Under the profile model, its ways up are a route to standing (`standUpFaults`).
      const route = parts.of("predictions", resolved.predictions).model === PROFILE_MODEL ? standUpFaults(waysUpIn(parts, spec, resolved.options), parts)[0] : undefined;
      if (route) return `options: ${route}`;
      // Its motor gives what every part it builds requires.
      const built: readonly PartConfig[] = [...resolved.options, ...named.executors, ...named.techniques, ...named.actions.flatMap(action => action.aim ? [action.aim] : []),
        ...named.support ? [named.support] : [], named.navigation ?? resolved.navigation,
        ...(Object.keys(FILLED) as (keyof typeof FILLED)[]).map(place => filledOf(parts, spec, place, config.tuning?.parts))];
      const required = built.flatMap(part => partRequirements(parts, part, spec));
      return motorRequirementRefusal(motorOf(parts, filledOf(parts, spec, "motor", config.tuning?.parts)), spec, required);
    },
    describe: (spec, config, parts) => describeOptionMind(spec, config, resolveConfig(config, assembly), parts),
    // What a fight asks of a mind, each answered by its Options, and by its guard for what it holds.
    strikes: (spec, config, parts) => optionsOf(config, parts).flatMap(([part, option]) => part.strikes?.(spec, option, parts) ?? []),
    obeys: (config, parts) => optionsOf(config, parts).some(([part]) => part.obeys === true),
    phases: (config, parts) => Object.assign({}, ...optionsOf(config, parts).map(([part]) => part.phases ?? {})),
    supportedEquipment: (spec, config, parts) => {
      const guard = filledOf(parts, spec, "guard", config.tuning?.parts);
      return parts.of("guard", guard).supportedEquipment?.(spec, guard) ?? [];
    },
    builtIn: (spec, config, parts) => {
      const guard = filledOf(parts, spec, "guard", config.tuning?.parts);
      return parts.of("guard", guard).posture(spec, guard);
    },
    create: (host, config): OptionMind => buildOptionMind(host, resolveConfig(config, assembly)),
  });
}
