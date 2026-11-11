import { recordingKey } from "../../core/world/recording.ts";
import type { ConfigFor, PartLookup } from "../../parts/lookup.ts";
import { FILLED, type Filled } from "../../skills/assembly/filled.ts";

/**
 * **An Option Mind's config**: the selected chooser, decision provider, options and decision rate.
 * Omitted or null options and predictions use the values supplied by the calling assembly
 * (`OptionAssembly`, `resolveConfig`); an explicit empty option list stays empty. Research tuning
 * replaces the configured continuous services by their declared place.
 */
export interface OptionMindConfig {
  readonly kind: "option";
  readonly chooser: ConfigFor<"chooser">;
  readonly options?: readonly ConfigFor<"option">[] | null;
  readonly predictions?: ConfigFor<"predictions"> | null;
  /** The rate it decides at, Hz (`everyOf`, `Pace`): every control step unless given; its skills make the command every step from what it last decided. */
  readonly rate?: number;
  /** An experiment's research tuning, which a link does not carry: `parts`, a part in place of what lies under its skills, by its place (`Filled`). */
  readonly tuning?: { readonly parts?: Filled };
}

/** `config` on the legs `legs` (role `locomotion`) in place of those its body fits: an experiment's (`OptionMindConfig.tuning`). */
export const withLegs = (config: OptionMindConfig, legs: ConfigFor<"locomotion">): OptionMindConfig => ({ ...config, tuning: { ...config.tuning, parts: { ...config.tuning?.parts, legs } } });

/** The defaults the calling composition supplies: the Options, chooser and predictions a config that names none takes, and the navigation its walks go by where no Option names one. */
export interface OptionAssembly {
  readonly options: readonly ConfigFor<"option">[];
  readonly chooser: ConfigFor<"chooser">;
  readonly predictions: ConfigFor<"predictions">;
  readonly navigation: ConfigFor<"navigation">;
}

/** **A config with its assembly's defaults filled in** (`resolveConfig`): what the checks, the description and the build read. */
export type ResolvedConfig = OptionMindConfig & { readonly options: readonly ConfigFor<"option">[]; readonly predictions: ConfigFor<"predictions">; readonly navigation: ConfigFor<"navigation"> };

/** `config` with `assembly`'s options and predictions where it names none, and `assembly`'s navigation. */
export const resolveConfig = (config: OptionMindConfig, assembly: OptionAssembly): ResolvedConfig => ({ ...config, options: config.options ?? assembly.options,
  predictions: config.predictions ?? assembly.predictions, navigation: assembly.navigation });

/** Whether `value` is a record of settings: an object that is no array. */
export const isSettings = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** Repeated configured choices are one Option twice, independent of their implementation. */
function optionsFaults(options: readonly ConfigFor<"option">[]): readonly string[] {
  const seen = new Set<string>(), faults: string[] = [];
  for (const option of options) {
    const key = recordingKey(option);
    if (seen.has(key)) faults.push(`options: duplicate ${option.kind}`);
    seen.add(key);
  }
  return faults;
}

/** What is wrong with the parts `config` passes in under its skills (`tuning.parts`), each a sentence: a place it has not, or a part's own faults. */
function tunedFaults(config: OptionMindConfig): readonly string[] {
  if (config.tuning !== undefined && !isSettings(config.tuning)) return ["tuning: a record of research settings"];
  const given = config.tuning?.parts;
  if (given !== undefined && !isSettings(given)) return ["tuning.parts: a record of service parts"];
  return Object.keys(given ?? {}).filter(place => !Object.hasOwn(FILLED, place)).map(place => `tuning: no place ${place} under its skills`);
}

/** **What is wrong with `config`**, each a sentence: duplicate choices, service settings, a rate that is not positive, and a chooser or an option whose protocol is not its provider's. */
export function optionMindFaults(config: ResolvedConfig, parts: PartLookup): readonly string[] {
  const options = config.options, faults = [...optionsFaults(options), ...tunedFaults(config)];
  const model = parts.of("predictions", config.predictions).model;
  if (parts.of("chooser", config.chooser).model !== model) faults.push(`chooser: incompatible with prediction model ${model}`);
  for (const option of options) if (parts.of("option", option).model !== model) faults.push(`options: ${option.kind} is incompatible with prediction model ${model}`);
  if (config.rate !== undefined && !(Number.isFinite(config.rate) && config.rate > 0)) faults.push("rate: a positive number of times a second");
  return faults;
}
