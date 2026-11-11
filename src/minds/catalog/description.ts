import type { ActionConfig, ExecutorEntry } from "../../skills/config.ts";
import type { ConfigFor } from "../../parts/lookup.ts";
import type { PartConfig, Role } from "../../parts/parts.ts";
import type { ConfigPath } from "../../parts/tree.ts";
import type { MindConfig } from "./config.ts";

export interface ComponentDescription { readonly config: PartConfig; readonly role: Role; readonly owner: string; readonly path: ConfigPath | null }
/** The selected controller describes the configuration it actually builds, independent of its schema. */
export interface MindDescription {
  readonly executors: readonly ExecutorEntry[];
  readonly actions: readonly { readonly action: ActionConfig; readonly path: ConfigPath | null }[];
  readonly techniques: readonly ConfigFor<"technique">[];
  readonly components: readonly ComponentDescription[];
  readonly recovery?: { readonly techniques: readonly ConfigFor<"technique">[]; replace(techniques: readonly ConfigFor<"technique">[]): MindConfig };
}
