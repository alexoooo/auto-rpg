import type { BodySpec } from "../../core/bodies/spec/body.ts";
import { recordingKey } from "../../core/world/recording.ts";
import type { PartLookup } from "../../parts/lookup.ts";
import { slotsOf, type Part, type PartConfig, type Role } from "../../parts/parts.ts";
import { FILLED, filledOf } from "../../skills/assembly/kit.ts";
import type { ComponentDescription, ConfigPath, MindDescription } from "../catalog/description.ts";
import type { OptionMindConfig, ResolvedConfig } from "./config.ts";
import { waysUpIn, withWaysUp } from "./rise.ts";
import { skillsOf } from "./skills.ts";

/**
 * Where `root`'s tree (a mind's config) configures the part `target` of role `wanted`, found by
 * value through each part's slots and declared children; null where the tree does not hold it.
 */
function pathOf(parts: PartLookup, root: PartConfig, target: PartConfig, wanted: Role): ConfigPath | null {
  const visit = (value: PartConfig, role: Role, path: ConfigPath): ConfigPath | null => {
    if (role === wanted && recordingKey(value) === recordingKey(target)) return path;
    const owner: Part = parts.of(role, value);
    for (const slot of slotsOf(owner, value)) {
      const raw = (value as unknown as Record<string, unknown>)[slot.key];
      const children = slot.many ? Array.isArray(raw) ? raw : [] : raw ? [raw] : [];
      for (const [i, child] of children.entries()) {
        const found = visit(child as PartConfig, slot.role, [...path, slot.key, ...slot.many ? [i] : []]);
        if (found) return found;
      }
    }
    for (const child of owner.children?.(value) ?? []) {
      if (child.path === null) continue;
      const found = visit(child.config as PartConfig, child.role, [...path, ...child.path]);
      if (found) return found;
    }
    return null;
  };
  return visit(root, "mind", []);
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
  const components: ComponentDescription[] = [];
  /** Adds the component `owner` commands, once: its path the one `selected` has in the config, else `fallback`. */
  const component = (owner: string, role: Role, selected: PartConfig, fallback: ConfigPath | null = null): void => {
    if (!components.some(component => component.owner === owner)) components.push({ owner, role, config: selected, path: pathOf(parts, config, selected, role) ?? fallback });
  };

  // Each Option, and what it names of the body's skills.
  const actions = resolved.options.flatMap((option, i) => {
    const path = config.options == null ? null : ["options", i] as const;
    const declaration = parts.of("option", option).skills?.(option, spec, parts, resolved.options);
    components.push({ config: option, role: "option", owner: `option:${i}`, path });
    if (declaration?.executor) {
      const { name, ...settings } = declaration.executor;
      component(name, "executor", settings, path);
    }
    if (declaration?.technique) component(declaration.technique.kind, "technique", declaration.technique, path);
    if (declaration?.support) component("support", "support", declaration.support, path);
    if (declaration?.navigation) component("navigation", "navigation", declaration.navigation, path);
    return declaration?.action ? [{ action: declaration.action, path }] : [];
  });

  // What lies under its skills (`FILLED`), then the navigation its walks go by.
  for (const place of Object.keys(FILLED) as (keyof typeof FILLED)[]) {
    const selected = filledOf(parts, spec, place, config.tuning?.parts);
    component(place === "legs" ? "locomotion" : place, FILLED[place], selected,
      config.tuning?.parts?.[place] ? ["tuning", "parts", place] : null);
  }
  component("navigation", "navigation", named.navigation ?? resolved.navigation);

  const waysUp = waysUpIn(parts, spec, resolved.options);
  const recovery = { techniques: waysUp, replace: (next: readonly PartConfig[]) => ({ ...config, options: withWaysUp(parts, resolved.options, next) }) };
  return { executors: named.executors, actions, techniques: named.techniques, components, ...(waysUp.length ? { recovery } : {}) };
}
