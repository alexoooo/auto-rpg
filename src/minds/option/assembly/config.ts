import { recordingKey } from "../../../core/world/recording.ts";
import { GOING, type MoveConfig } from "../../../skills/locomotion/move/index.ts";
import { stockGaits } from "../../../skills/locomotion/move/gaits.ts";
import type { Carriage } from "../../../skills/locomotion/shared/locomotion.ts";
import type { MindConfig } from "../../catalog/config.ts";
import type { ConfigFor, PartLookup } from "../../../parts/lookup.ts";
import type { PartConfig } from "../../../parts/parts.ts";
import type { OptionBody } from "../contract/parts.ts";
import { FILLED, type Filled } from "../../../skills/assembly/filled.ts";
import { partOffered } from "../../../parts/fields.ts";

/**
 * **An Option Mind's config**: the selected chooser, decision provider, options, and its two clocks.
 * Omitted or null options are every registered Option on offer (`optionsOf`); omitted predictions,
 * the calling assembly's (`OptionAssembly`, `resolveConfig`). Research tuning replaces the
 * configured continuous services by their declared place.
 */
export interface OptionMindConfig {
  readonly kind: "option";
  readonly chooser: ConfigFor<"chooser">;
  readonly options?: readonly ConfigFor<"option">[] | null;
  readonly predictions?: ConfigFor<"predictions"> | null;
  /**
   * How often it looks for a change it watches, Hz (`everyOf`, `Pace`): every control step unless
   * given; its skills make the command every step from what it last decided.
   */
  readonly rate?: number;
  /** How often its chooser decides afresh with no change to wake it, s (`Deciding.rethink`): `RETHINK` unless given, whatever its rate. */
  readonly rethink?: number;
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
 * with its gaits (the stock ones among `parts`, `stockGaits`, where it names none) so held, the
 * others as they are (`onMove`).
 */
export function inCarriage(parts: PartLookup, mind: MindConfig, carriage: Carriage): MindConfig {
  const { config, move } = onMove(mind, "held in a carriage");
  return withLegs(config, { ...move, gaits: (move.gaits ?? stockGaits(parts)).map((gait) => gait.legs.kind === "stance-walk" ? { ...gait, legs: { ...gait.legs, carriage } } : gait) });
}

/**
 * **The Options `mind` is built of**: those it names, or, naming none, every registered kind on
 * offer among `parts` (`partOffered`) by its defaults, in the order registered; each as what it
 * stands for (`OptionPart.each`: a way up naming no technique, every registered one).
 */
export function optionsOf(mind: OptionMindConfig, parts: PartLookup): readonly ConfigFor<"option">[] {
  const named = mind.options ?? parts.candidates("option").filter((option) => partOffered(parts.of("option", option)));
  return named.flatMap((option) => parts.of("option", option).each?.(option, parts) ?? [option]);
}

/** **The Options of `mind` that keep the body where it stands**: those whose kind among `parts` says so (`OptionPart.stands`). */
export function standingOptions(mind: OptionMindConfig, parts: PartLookup): readonly ConfigFor<"option">[] {
  return optionsOf(mind, parts).filter((option) => parts.of("option", option).stands);
}

/**
 * Construction and editors use the same static Option admission, independent of a fight's state: a
 * config that stands for several (`OptionPart.each`) applies where one of them does.
 */
export function optionApplies(config: PartConfig, body: OptionBody): boolean {
  const { spec, parts, options } = body, part = parts.of("option", config);
  return (part.each?.(config, parts) ?? [config]).some((one) => part.fits(spec, one, parts) === null && part.skills?.(one, spec, parts, options) !== null
    && (part.applicable?.(one, body) ?? true));
}

/** The chooser and predictions supplied where a config names none. */
export interface OptionAssembly {
  readonly chooser: ConfigFor<"chooser">;
  readonly predictions: ConfigFor<"predictions">;
}

/** **A config with its Options and its assembly's defaults filled in** (`resolveConfig`): what the checks, the description and the build read. */
export type ResolvedConfig = OptionMindConfig & { readonly options: readonly ConfigFor<"option">[]; readonly predictions: ConfigFor<"predictions"> };

/** `config` with its Options resolved (`optionsOf`) and `assembly`'s predictions where it names none. */
export const resolveConfig = (config: OptionMindConfig, assembly: OptionAssembly, parts: PartLookup): ResolvedConfig => ({ ...config, options: optionsOf(config, parts),
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

/** **What is wrong with `config`**, each a sentence: duplicate choices, service settings, and a rate or a search period that is not positive. */
export function optionMindFaults(config: ResolvedConfig): readonly string[] {
  const options = config.options, faults = [...optionsFaults(options), ...tunedFaults(config)];
  if (config.rate !== undefined && !(Number.isFinite(config.rate) && config.rate > 0)) faults.push("rate: a positive number of times a second");
  if (config.rethink !== undefined && !(Number.isFinite(config.rethink) && config.rethink > 0)) faults.push("rethink: a positive number of seconds");
  return faults;
}
