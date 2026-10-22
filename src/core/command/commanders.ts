import { deepFreeze } from "../state.ts";
import { independentCommander } from "./independent.ts";
import type { Commander, TeamHost } from "./team.ts";

/** **A Commander's config**: plain data naming its kind, as a Mind's does. */
interface CommanderConfig {
  readonly kind: string;
}

/** **A kind of Commander**: its name, its default config, what is wrong with a config of it, and how one is made from its host. */
interface CommanderEntry {
  readonly label: string;
  readonly defaults: CommanderConfig;
  faults(config: CommanderConfig): string[];
  create(host: TeamHost, config: CommanderConfig): Commander;
}

/** A config's faults where it holds no key but its kind. */
const kindOnly = (config: CommanderConfig): string[] => Object.keys(config).filter((key) => key !== "kind").map((key) => `${key}: not a setting of ${config.kind}`);

/** **Independent members** (`independentCommander`): each at the nearest foe it sees. */
const INDEPENDENT: CommanderEntry = deepFreeze({
  label: "Independent", defaults: { kind: "independent" }, faults: kindOnly,
  create: (host: TeamHost) => independentCommander(host),
});

/**
 * **Every Commander, by its kind** (its defaults' `kind`), in the order a picker offers them: the
 * one place a kind is made. A kind twice is refused.
 */
export const COMMANDERS: Readonly<Record<string, CommanderEntry>> = (() => {
  const byKind: Record<string, CommanderEntry> = {};
  for (const entry of [INDEPENDENT]) {
    if (Object.hasOwn(byKind, entry.defaults.kind)) throw new Error(`two Commanders of kind ${JSON.stringify(entry.defaults.kind)}`);
    byKind[entry.defaults.kind] = entry;
  }
  return Object.freeze(byKind);
})();

/** A Commander of `config` made from `host`; a thrown error for a kind none has or a config with faults. */
export function createCommander(host: TeamHost, config: CommanderConfig): Commander {
  const entry = Object.hasOwn(COMMANDERS, config.kind) ? COMMANDERS[config.kind] : undefined;
  if (!entry) throw new Error(`no Commander of kind ${JSON.stringify(config.kind)}`);
  const faults = entry.faults(config);
  if (faults.length) throw new Error(`the ${config.kind} Commander's config: ${faults.join("; ")}`);
  return entry.create(host, config);
}
