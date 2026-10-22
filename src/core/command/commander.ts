import { COMMANDERS } from "./commanders.ts";
import type { Commander, TeamHost } from "./team.ts";

/** **A Commander's config**: plain data naming its kind and its settings, as a Mind's does. */
export interface CommanderConfig {
  readonly kind: string;
  readonly [setting: string]: unknown;
}

/** Which side of a Crypt run a Commander leads: the person's party, or the enemies. */
export type CommandSide = "party" | "enemies";

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

/** The Commander entry of `kind`, or undefined: a list's entry whose defaults name another kind is refused. */
export function commanderOf(kind: string): CommanderEntry | undefined {
  const entry: CommanderEntry | undefined = Object.hasOwn(COMMANDERS, kind) ? (COMMANDERS as Readonly<Record<string, CommanderEntry>>)[kind] : undefined;
  if (entry && entry.defaults.kind !== kind) throw new Error(`the Commanders list names ${JSON.stringify(entry.defaults.kind)} ${JSON.stringify(kind)}`);
  return entry;
}

/** What is wrong with `value` as a Commander's config: no kind a Commander has, or its entry's faults. */
export function commanderFaults(value: unknown): readonly string[] {
  const kind = typeof value === "object" && value !== null && !Array.isArray(value) ? (value as { kind?: unknown }).kind : undefined;
  const entry = typeof kind === "string" ? commanderOf(kind) : undefined;
  return entry ? entry.faults(value as CommanderConfig) : [`no Commander: a config names its kind (${Object.keys(COMMANDERS).join(", ")})`];
}

/** A Commander of `config` made from `host`; a thrown error for a kind none has or a config with faults. */
export function createCommander(host: TeamHost, config: CommanderConfig): Commander {
  const faults = commanderFaults(config);
  if (faults.length) throw new Error(`the ${config.kind} Commander's config: ${faults.join("; ")}`);
  return commanderOf(config.kind)!.create(host, config);
}
