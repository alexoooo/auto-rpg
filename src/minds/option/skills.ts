import type { ActionConfig, ExecutorEntry } from "../../skills/config.ts";
import type { BodySpec } from "../../core/bodies/spec/body.ts";
import type { ConfigFor, PartLookup } from "../../parts/lookup.ts";
import type { PartConfig } from "../../parts/parts.ts";
import { recordingKey } from "../../core/world/recording.ts";
import { selectsVariation, skillName, type Varied } from "../../skills/framework/variations.ts";

/**
 * **What an Option's config names of its body's skills** (`OptionPart.skills`), where the body
 * fits what it names: the executors it strikes by and what it asks of each (`ActionConfig`), the
 * ground technique it runs, the low support it strikes from and the navigation its walk goes by.
 */
export interface NamedSkills {
  readonly executors?: readonly ExecutorEntry[];
  readonly actions?: readonly ActionConfig[];
  readonly technique?: ConfigFor<"technique">;
  readonly support?: ConfigFor<"support">;
  readonly navigation?: ConfigFor<"navigation">;
}

/** **The skills a body builds of its Options** (`skillsOf`): its executors and their actions, its ground techniques, its low support and its navigation, each once. */
export interface OptionSkills {
  readonly executors: readonly ExecutorEntry[];
  readonly actions: readonly ActionConfig[];
  readonly techniques: readonly ConfigFor<"technique">[];
  readonly supports: readonly ConfigFor<"support">[];
  readonly navigations: readonly ConfigFor<"navigation">[];
  readonly faults: readonly string[];
}

/**
 * **The skills a body of `spec` builds of `options`**: what each names of them on that body
 * (`OptionPart.skills`), each executor, action and technique once by its name or kind, in the
 * Options' order, and every enabled low support and navigation. Explicit settings configure the
 * matching selected variation; conflicting settings are faults. An Option whose skills the body
 * does not fit names none.
 */
export function skillsOf(parts: PartLookup, spec: BodySpec, options: readonly PartConfig[]): OptionSkills {
  const executors: ExecutorEntry[] = [], actions: ActionConfig[] = [], techniques: ConfigFor<"technique">[] = [];
  const supports = [...parts.selected("support", spec)];
  const navigations = [...parts.selected("navigation", spec)], overridden = new Map<string, string>();
  const faults: string[] = [];
  const configure = <T extends PartConfig>(configs: T[], selected: T & Varied): void => {
    for (const [i, config] of configs.entries()) {
      if (!selectsVariation(selected, config)) continue;
      const next = { ...config, ...selected }, name = skillName(next), key = recordingKey(next);
      if (overridden.has(name) && overridden.get(name) !== key) faults.push(`options: conflicting skill ${name}`);
      else { configs[i] = next; overridden.set(name, key); }
    }
  };
  const add = <T extends { readonly name?: string; readonly kind?: string }>(values: T[], next: T, key: string, label: string): void => {
    const had = values.find(value => (value.name ?? value.kind) === key);
    if (had && recordingKey(had) !== recordingKey(next)) faults.push(`options: conflicting ${label} ${key}`);
    else if (!had) values.push(next);
  };
  for (const option of options) {
    const named = parts.of("option", option).skills?.(option, spec, parts, options);
    if (!named) continue;
    for (const executor of named.executors ?? []) add(executors, executor, executor.name, "executor");
    for (const action of named.actions ?? []) add(actions, action, action.name, "action");
    if (named.technique) add(techniques, named.technique, named.technique.kind, "technique");
    if (named.support) configure(supports, named.support);
    if (named.navigation) configure(navigations, named.navigation);
  }
  return { executors, actions, techniques, supports, navigations, faults };
}
