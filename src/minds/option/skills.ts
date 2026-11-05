import type { ActionConfig, ExecutorEntry } from "../../skills/config.ts";
import type { BodySpec } from "../../core/bodies/spec/body.ts";
import type { PartLookup } from "../../parts/lookup.ts";
import type { PartConfig } from "../../parts/parts.ts";
import { recordingKey } from "../../core/world/recording.ts";

/**
 * **What an Option's config names of its body's skills** (`OptionPart.skills`), where the body
 * fits what it names: the executor it strikes by and what it asks of it (`ActionConfig`), the
 * ground technique it runs, the low support it strikes from and the navigation its walk goes by.
 */
export interface NamedSkills {
  readonly executor?: ExecutorEntry;
  readonly action?: ActionConfig;
  readonly technique?: PartConfig;
  readonly support?: PartConfig;
  readonly navigation?: PartConfig;
}

/** **The skills a body builds of its Options** (`skillsOf`): its executors and their actions, its ground techniques, its low support and its navigation, each once. */
export interface OptionSkills {
  readonly executors: readonly ExecutorEntry[];
  readonly actions: readonly ActionConfig[];
  readonly techniques: readonly PartConfig[];
  readonly support: PartConfig | null;
  readonly navigation: PartConfig | null;
  readonly faults: readonly string[];
}

/**
 * **The skills a body of `spec` builds of `options`**: what each names of them on that body
 * (`OptionPart.skills`), each executor, action and technique once by its name or kind, in the
 * Options' order, and the low support and navigation the first that names one names (a mind's
 * Options name one of each, `optionMindFaults`). An Option whose skills the body does not fit names none.
 */
export function skillsOf(parts: PartLookup, spec: BodySpec, options: readonly PartConfig[]): OptionSkills {
  const executors: ExecutorEntry[] = [], actions: ActionConfig[] = [], techniques: PartConfig[] = [];
  let support: PartConfig | null = null, navigation: PartConfig | null = null;
  const faults: string[] = [];
  const add = <T extends { readonly name?: string; readonly kind?: string }>(values: T[], next: T, key: string, label: string): void => {
    const had = values.find(value => (value.name ?? value.kind) === key);
    if (had && recordingKey(had) !== recordingKey(next)) faults.push(`options: conflicting ${label} ${key}`);
    else if (!had) values.push(next);
  };
  for (const option of options) {
    const named = parts.of("option", option).skills?.(option, spec, parts, options);
    if (!named) continue;
    if (named.executor) add(executors, named.executor, named.executor.name, "executor");
    if (named.action) add(actions, named.action, named.action.name, "action");
    if (named.technique) add(techniques, named.technique, named.technique.kind, "technique");
    if (support && named.support && recordingKey(support) !== recordingKey(named.support)) faults.push("options: conflicting low supports");
    if (navigation && named.navigation && recordingKey(navigation) !== recordingKey(named.navigation)) faults.push("options: conflicting navigations");
    support ??= named.support ?? null;
    navigation ??= named.navigation ?? null;
  }
  return { executors, actions, techniques, support, navigation, faults };
}
