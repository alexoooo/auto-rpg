import { recordingKey } from "../../core/world/recording.ts";
import { GOING, type MoveConfig } from "../../skills/locomotion/move/index.ts";
import { STOCK_GAITS } from "../../skills/locomotion/move/gaits.ts";
import type { Carriage } from "../../skills/locomotion/shared/locomotion.ts";
import type { MindConfig } from "../catalog/config.ts";
import type { ConfigFor, PartLookup } from "../../parts/lookup.ts";
import { FILLED, type Filled } from "../../skills/assembly/filled.ts";

/**
 * **An Option Mind's config**: the selected chooser, decision provider, options and decision rate.
 * Omitted or null options and predictions use the values supplied by the calling assembly
 * (`OptionAssembly`, `resolveConfig`). The profile model also offers a default use of any selected
 * strike variation the configured list omits. Research tuning replaces the configured continuous
 * services by their declared place.
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

/** Whether `mind` is an Option Mind's config (`OptionMindConfig`), by its kind. */
export const isOptionMind = (mind: MindConfig): mind is OptionMindConfig => mind.kind === "option";

/** **`mind` as an Option Mind's config**: one that is none refused as `doing` it. */
export function optionMind(mind: MindConfig, doing: string): OptionMindConfig {
  if (!isOptionMind(mind)) throw new Error(`a ${mind.kind} mind is not ${doing}`);
  return mind;
}

/**
 * **`mind`'s Option Mind config, and its legs, Move's** (`GOING` where its config names none): a
 * mind that is no Option Mind, or walks by legs other than Move, refused as `doing` it.
 */
function onMove(mind: MindConfig, doing: string): { readonly config: OptionMindConfig; readonly move: MoveConfig } {
  const config = optionMind(mind, doing), legs = config.tuning?.parts?.legs ?? GOING;
  if (legs.kind !== "move") throw new Error(`legs of kind ${legs.kind} are not ${doing}`);
  return { config, move: legs };
}

/**
 * **`mind` with every stance walk of its legs held in `carriage`** (`Carriage`): its legs Move's
 * with its gaits (the stock ones, `STOCK_GAITS`, where it names none) so held, the others as they
 * are (`onMove`).
 */
export function inCarriage(mind: MindConfig, carriage: Carriage): MindConfig {
  const { config, move } = onMove(mind, "held in a carriage");
  return withLegs(config, { ...move, gaits: (move.gaits ?? STOCK_GAITS).map((gait) => gait.legs.kind === "stance-walk" ? { ...gait, legs: { ...gait.legs, carriage } } : gait) });
}

/** **The Options of `mind` that keep the body where it stands**: those whose kind among `parts` says so (`OptionPart.stands`). */
export function standingOptions(mind: OptionMindConfig, parts: PartLookup): readonly ConfigFor<"option">[] {
  return (mind.options ?? []).filter((option) => parts.of("option", option).stands);
}

/** The Options, chooser and predictions supplied where a config names none. */
export interface OptionAssembly {
  readonly options: readonly ConfigFor<"option">[];
  readonly chooser: ConfigFor<"chooser">;
  readonly predictions: ConfigFor<"predictions">;
}

/** **A config with its assembly's defaults filled in** (`resolveConfig`): what the checks, the description and the build read. */
export type ResolvedConfig = OptionMindConfig & { readonly options: readonly ConfigFor<"option">[]; readonly predictions: ConfigFor<"predictions"> };

/** `config` with `assembly`'s options and predictions where it names none. */
export const resolveConfig = (config: OptionMindConfig, assembly: OptionAssembly): ResolvedConfig => ({ ...config, options: config.options ?? assembly.options,
  predictions: config.predictions ?? assembly.predictions });

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
