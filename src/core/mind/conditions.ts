import type { ConditionConfig } from "./config.ts";
import { choice, number, type PartField } from "./fields.ts";

/** Conditions receive detached facts from their consumer, including absent distances as Infinity. */
export interface ConditionReading {
  readonly walking: boolean;
  readonly foe: number;
  readonly destination: number;
  /** The nearest standing body of its own side, m; Infinity where its consumer reads none. */
  readonly ally?: number;
  readonly targetDown?: boolean;
  readonly sinceTarget?: number;
}

type Of<K extends ConditionConfig["kind"]> = ConditionConfig & { kind: K };
type Registration<C extends ConditionConfig> = { readonly fields: readonly PartField<C>[]; matches(config: C, reading: ConditionReading, margin: number): boolean };

/** One predicate and field definition for each shared selector and movement condition. */
export const CONDITIONS: { readonly [K in ConditionConfig["kind"]]: Registration<Of<K>> } = {
  always: { fields: [], matches: () => true },
  "when-standing": { fields: [], matches: (_config, reading) => !reading.walking },
  "target-down": { fields: [], matches: (_config, reading) => reading.targetDown ?? false },
  "follow-up": { fields: [number<Of<"follow-up">, "seconds">("seconds", "Since contact", 0, 5, .05, "s")],
    matches: (config, reading) => reading.sinceTarget !== undefined && reading.sinceTarget >= 0 && reading.sinceTarget <= config.seconds },
  "when-distance": { fields: [
    choice<Of<"when-distance">, "of">("of", "Distance to", [["foe", "Nearest foe"], ["destination", "Destination"], ["ally", "Nearest of its side"]]),
    choice<Of<"when-distance">, "than">("than", "Compare", [["under", "Under"], ["over", "Over"]]),
    number<Of<"when-distance">, "metres">("metres", "Distance", 0, 100, .1, "m"),
  ], matches(config, reading, margin) {
    switch (config.than) {
      case "under": return (reading[config.of] ?? Infinity) <= config.metres + margin;
      case "over": return (reading[config.of] ?? Infinity) > config.metres - margin;
      default: { const never: never = config.than; throw new Error(`unknown distance comparison ${never}`); }
    }
  } },
};

/** The registered condition; a movement holder may supply its hysteresis margin. */
export function conditionMatches(config: ConditionConfig, reading: ConditionReading, margin = 0): boolean {
  const registered = CONDITIONS[config.kind] as Registration<ConditionConfig>;
  return registered.matches(config, reading, margin);
}
