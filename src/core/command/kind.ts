import type { Commander, TeamHost } from "./team.ts";

/** **A Commander's config**: plain data naming its kind and its settings, as a Mind's does. */
export interface CommanderConfig {
  readonly kind: string;
  readonly [setting: string]: unknown;
}

/** Which side of a Crypt run a Commander leads: the person's party, or the enemies. */
type CommandSide = "party" | "enemies";

/**
 * **A kind of Commander**: what a person calls it, the sides it may lead, its default config, what
 * is wrong with a config of it, and how one is made from its host. Each is its own module's, and a
 * line in `COMMANDERS`.
 */
export interface CommanderEntry {
  readonly label: string;
  readonly sides: readonly CommandSide[];
  readonly defaults: CommanderConfig;
  faults(config: CommanderConfig): string[];
  create(host: TeamHost, config: CommanderConfig): Commander;
}

/** A config's faults where it holds no key but its kind. A function declaration, which a Commander's module may call as it loads. */
export function kindOnly(config: CommanderConfig): string[] {
  return Object.keys(config).filter((key) => key !== "kind").map((key) => `${key}: not a setting of ${config.kind}`);
}
