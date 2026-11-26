import { motorRequirementRefusal } from "../../../control/motor-part.ts";
import { deepFreeze } from "../../../core/state.ts";
import { number, period } from "../../../parts/fields.ts";
import { RETHINK } from "../choosers/select-set.ts";
import { slotList, slotOne, type PartConfig, type Slot } from "../../../parts/parts.ts";
import { partRequirements, whenEmpty } from "../../../parts/tree.ts";
import { FILLED, filledOf, filledRefusal, motorOf } from "../../../skills/assembly/filled.ts";
import { controller } from "../../catalog/controller.ts";
import { buildOptionMind } from "./build.ts";
import { isSettings, optionMindFaults, optionsOf, resolveConfig, type OptionAssembly, type OptionMindConfig } from "./config.ts";
import { describeOptionMind } from "./description.ts";
import type { PartLookup } from "../../../parts/lookup.ts";
import type { OptionPart } from "../contract/parts.ts";
import { skillsOf } from "./skills.ts";
import { guardConfigs, initialGuardPosture } from "../../../skills/assembly/guards.ts";

/**
 * **Option Mind's controller**, with `assembly`'s defaults: the part of role `mind` the catalog
 * registers. Each job it names lives in a file of its own: a config and what is wrong with it
 * (`config.ts`), what a config builds, for a screen (`description.ts`), and the running mind
 * (`build.ts`). What stays here is what the catalog asks of every mind: its slots, whether a
 * body fits it, and the posture its body is built in.
 */
export function optionController(assembly: OptionAssembly) {
  const resolvedFor = (config: OptionMindConfig, parts: PartLookup) => resolveConfig(config, assembly, parts);
  const defaults: OptionMindConfig = deepFreeze({ kind: "option", chooser: assembly.chooser });
  const slots: readonly Slot[] = Object.freeze([
    slotOne("chooser", "Chooser", "chooser"), slotList("options", "Options", "option"), slotOne("predictions", "Predictions", "predictions", true),
  ]);
  /** Each Option `config` is built of (`optionsOf`), with its part; one that is no Option's config is passed over, a fault of the tree. */
  const optionParts = (config: OptionMindConfig, parts: PartLookup): readonly (readonly [OptionPart, PartConfig])[] =>
    resolvedFor(config, parts).options.flatMap((option) => { const part = parts.find("option", option); return part ? [[part, option] as const] : []; });
  return controller<OptionMindConfig>({
    role: "mind", label: "Option Mind", slots, defaults,
    // Its two clocks, each a time: how soon it notices a change it watches (the least, every control step), and how often it searches with none.
    fields: [period<OptionMindConfig, "rate">("rate", "Notices changes every", .001, 1, .001), number<OptionMindConfig, "rethink">("rethink", "Searches every", .01, 1, .01, "s", RETHINK)],
    keys: { kind: true, chooser: true, options: true, predictions: true, rate: true, rethink: true, tuning: true }, tuning: ["parts"],
    // The parts an experiment passes in under its skills, each at its place in the config.
    children: config => isSettings(config.tuning?.parts) ? Object.entries(config.tuning.parts).flatMap(([place, value]) => Object.hasOwn(FILLED, place)
      ? [{ path: ["tuning", "parts", place], role: FILLED[place as keyof typeof FILLED], config: value }] : []) : [],
    // What it runs that its config does not say: its predictions and its Options where it names none, the navigation its walks go by
    // where no Option names one, and every part that may lie under its skills, of which a body gets the one it fits.
    supplies: (config, parts) => [
      ...whenEmpty(slots, config, { predictions: assembly.predictions }),
      ...(config.options ? [] : optionsOf(config, parts)).map((option) => ({ role: "option" as const, config: option, slot: "options" })),
      ...parts.candidates("navigation").map(one => ({ role: "navigation" as const, config: one })),
      ...parts.candidates("support").map(one => ({ role: "support" as const, config: one })),
      ...Object.values(FILLED).flatMap((role) => parts.candidates(role).map((one) => ({ role, config: one }))),
      ...parts.candidates("leg-adapter").map((one) => ({ role: "leg-adapter" as const, config: one })),
    ],
    faults: (config, parts) => optionMindFaults(resolvedFor(config, parts)),
    fits: (spec, config, parts) => {
      const refused = filledRefusal(parts, spec, config.tuning?.parts);
      if (refused) return refused;
      const resolved = resolvedFor(config, parts), named = skillsOf(parts, spec, resolved.options);
      if (named.faults.length) return named.faults[0]!;
      // Its motor gives what every part it builds requires.
      const built: readonly PartConfig[] = [...resolved.options, ...named.executors, ...named.techniques, ...named.actions.flatMap(action => action.aim ? [action.aim] : []),
        ...named.supports, ...named.navigations,
        ...(["motor", "legs"] as const).map(place => filledOf(parts, spec, place, config.tuning?.parts)),
        ...guardConfigs(parts, spec, config.tuning?.parts?.guard)];
      const required = built.flatMap(part => partRequirements(parts, part, spec));
      return motorRequirementRefusal(motorOf(parts, filledOf(parts, spec, "motor", config.tuning?.parts)), spec, required);
    },
    describe: (spec, config, parts) => describeOptionMind(spec, config, resolvedFor(config, parts), parts),
    // What a fight asks of a mind, each answered by its Options, and by its guard for what it holds.
    strikes: (spec, config, parts) => resolvedFor(config, parts).options.flatMap(option => parts.of("option", option).strikes?.(spec, option, parts) ?? []),
    obeys: (config, parts) => optionParts(config, parts).some(([part]) => part.obeys === true),
    supportedEquipment: (spec, config, parts) => {
      return guardConfigs(parts, spec, config.tuning?.parts?.guard).flatMap(guard => parts.of("guard", guard).supportedEquipment?.(spec, guard) ?? []);
    },
    builtIn: (spec, config, parts) => {
      return initialGuardPosture(parts, spec, guardConfigs(parts, spec, config.tuning?.parts?.guard));
    },
    create: (host, config) => buildOptionMind(host, resolvedFor(config, host.parts)),
  });
}
