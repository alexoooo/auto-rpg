import { motorRequirementRefusal } from "../../control/motor-part.ts";
import { deepFreeze } from "../../core/state.ts";
import { partRequirements, slotList, slotOne, type PartConfig, type Role, type Slot } from "../../parts/parts.ts";
import { FILLED, filledOf, filledRefusal, motorOf } from "../../skills/assembly/kit.ts";
import { standUpFaults } from "../../skills/recovery/stand-up.ts";
import { controller } from "../catalog/controller.ts";
import { buildOptionMind, type OptionMind } from "./build.ts";
import { isSettings, optionMindFaults, resolveConfig, type OptionAssembly, type OptionMindConfig } from "./config.ts";
import { describeOptionMind } from "./description.ts";
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
      const needs = (role: Role, configs: readonly PartConfig[]) => configs.flatMap(part => partRequirements(parts, role, part, spec));
      const required = [...needs("option", resolved.options), ...needs("executor", named.executors), ...needs("technique", named.techniques),
        ...needs("aim", named.actions.flatMap(action => action.aim ? [action.aim] : [])),
        ...needs("support", named.support ? [named.support] : []), ...needs("navigation", [named.navigation ?? resolved.navigation]),
        ...(Object.keys(FILLED) as (keyof typeof FILLED)[]).flatMap(place => needs(FILLED[place], [filledOf(parts, spec, place, config.tuning?.parts)]))];
      return motorRequirementRefusal(motorOf(parts, filledOf(parts, spec, "motor", config.tuning?.parts)), spec, required);
    },
    describe: (spec, config, parts) => describeOptionMind(spec, config, resolveConfig(config, assembly), parts),
    supportedEquipment: (spec, config, parts) => {
      const guard = filledOf(parts, spec, "guard", config.tuning?.parts);
      return parts.of("guard", guard).supportedEquipment?.(spec, guard, parts) ?? [];
    },
    builtIn: (spec, config, parts) => {
      const guard = filledOf(parts, spec, "guard", config.tuning?.parts);
      return parts.of("guard", guard).posture(spec, guard);
    },
    create: (host, config): OptionMind => buildOptionMind(host, resolveConfig(config, assembly)),
  });
}
