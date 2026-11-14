import type { BodySpec } from "../../core/bodies/spec/body.ts";
import { recordingKey } from "../../core/world/recording.ts";
import type { ConfigFor, PartLookup } from "../../parts/lookup.ts";
import type { PartConfig, Role } from "../../parts/parts.ts";
import { eachPart, type ConfigPath } from "../../parts/tree.ts";
import { FILLED, filledOf } from "../../skills/assembly/filled.ts";
import type { ComponentDescription, MindDescription } from "../catalog/description.ts";
import type { OptionMindConfig, ResolvedConfig } from "./config.ts";
import { waysUpIn, withWaysUp } from "./rise.ts";
import { skillsOf } from "./skills.ts";
import { guardConfigs } from "../../skills/assembly/guards.ts";
import { skillName } from "../../skills/framework/variations.ts";

/**
 * Where `root`'s tree (a mind's config) configures a part, by its role and its value, found through
 * each part's slots and declared children in one walk: the first place of each; a part the tree
 * does not hold, none.
 */
function pathsOf(parts: PartLookup, root: PartConfig): (target: PartConfig, wanted: Role) => ConfigPath | null {
  const found = new Map<string, ConfigPath>();
  eachPart(parts, root, ({ part, config, path }) => {
    if (path === null) return "skip";
    const key = `${part.role} ${recordingKey(config)}`;
    if (!found.has(key)) found.set(key, path);
    return undefined;
  });
  return (target, wanted) => found.get(`${wanted} ${recordingKey(target)}`) ?? null;
}

/**
 * **What an Option Mind of `config` builds on a body of `spec`**, for editors, inspection and
 * evaluation adapters: its executors, its actions, its techniques, and each component with the
 * owner that commands it and the path its config has in `config` (null where a default or the
 * body's fit supplies it); and its ways up, with how to replace them, where it has any.
 * `resolved` is `config` with its defaults (`resolveConfig`).
 */
export function describeOptionMind(spec: BodySpec, config: OptionMindConfig, resolved: ResolvedConfig, parts: PartLookup): MindDescription {
  const named = skillsOf(parts, spec, resolved.options);
  const components: ComponentDescription[] = [], pathOf = pathsOf(parts, config);
  /** Adds the component `owner` commands, once: its path the one `selected` has in the config, else `fallback`. */
  const component = (owner: string, role: Role, selected: PartConfig, fallback: ConfigPath | null = null): void => {
    if (!components.some(component => component.owner === owner)) components.push({ owner, role, config: selected, path: pathOf(selected, role) ?? fallback });
  };

  // Each Option, and what it names of the body's skills.
  const actions = resolved.options.flatMap((option, i) => {
    const path = config.options == null || i >= config.options.length ? null : ["options", i] as const;
    const declaration = parts.of("option", option).skills?.(option, spec, parts, resolved.options);
    components.push({ config: option, role: "option", owner: `option:${i}`, path });
    for (const executor of declaration?.executors ?? []) {
      const { name, ...settings } = executor;
      component(name, "executor", settings, path);
    }
    if (declaration?.technique) component(declaration.technique.kind, "technique", declaration.technique, path);
    return (declaration?.actions ?? []).map((action) => ({ action, path }));
  });

  // What lies under its skills (`FILLED`), then the navigation its walks go by.
  for (const place of Object.keys(FILLED) as (keyof typeof FILLED)[]) {
    if (place === "guard") {
      for (const guard of guardConfigs(parts, spec, config.tuning?.parts?.guard)) component(skillName(guard), "guard", guard);
      continue;
    }
    const selected = filledOf(parts, spec, place, config.tuning?.parts);
    component(place === "legs" ? "locomotion" : place, FILLED[place], selected,
      config.tuning?.parts?.[place] ? ["tuning", "parts", place] : null);
  }
  for (const navigation of named.navigations) component(skillName(navigation), "navigation", navigation);
  for (const support of named.supports) component(skillName(support), "support", support);

  const waysUp = waysUpIn(parts, spec, resolved.options);
  const recovery = { techniques: waysUp, replace: (next: readonly ConfigFor<"technique">[]) => ({ ...config, options: withWaysUp(parts, resolved.options, next) }) };
  return { executors: named.executors, actions, techniques: named.techniques, components, ...(waysUp.length ? { recovery } : {}) };
}
