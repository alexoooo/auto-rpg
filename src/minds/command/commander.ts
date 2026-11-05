import type { CommanderConfig, CommanderEntry } from "./kind.ts";
import type { Commander, TeamHost } from "./team.ts";

/** The Commander entry of `kind`, or undefined: a list's entry whose defaults name another kind is refused. */
export type CommanderRegistry = Readonly<Record<string, CommanderEntry>>;

export function commanderOf(entries: CommanderRegistry, kind: string): CommanderEntry | undefined {
  const entry: CommanderEntry | undefined = Object.hasOwn(entries, kind) ? entries[kind] : undefined;
  if (entry && entry.defaults.kind !== kind) throw new Error(`the Commanders list names ${JSON.stringify(entry.defaults.kind)} ${JSON.stringify(kind)}`);
  return entry;
}

/** What is wrong with `value` as a Commander's config: no kind a Commander has, or its entry's faults. */
export function commanderFaults(entries: CommanderRegistry, value: unknown): readonly string[] {
  const kind = typeof value === "object" && value !== null && !Array.isArray(value) ? (value as { kind?: unknown }).kind : undefined;
  const entry = typeof kind === "string" ? commanderOf(entries, kind) : undefined;
  return entry ? entry.faults(value as CommanderConfig) : [`no Commander: a config names its kind (${Object.keys(entries).join(", ")})`];
}

/** A Commander of `config` made from `host`; a thrown error for a kind none has or a config with faults. */
export function createCommander(entries: CommanderRegistry, host: TeamHost, config: CommanderConfig): Commander {
  const faults = commanderFaults(entries, config);
  if (faults.length) throw new Error(`the ${config.kind} Commander's config: ${faults.join("; ")}`);
  return commanderOf(entries, config.kind)!.create(host, config);
}
