import type { BodySpec } from "../core/bodies/spec/body.ts";
import type { PartLookup } from "./lookup.ts";
import { slotsOf, type Part, type PartConfig, type Requirement, type Role, type Slot } from "./parts.ts";

/** **Where a part is in a tree's config**: each step a key, or an index in a list. */
export type ConfigPath = readonly (string | number)[];

/**
 * **One place a part's config holds other parts**: a slot of it, or a part it declares outside
 * its slots (`Part.children`), which is given a slot of its own here, named by where it is, so
 * that every place reads alike.
 */
export interface Held {
  readonly slot: Slot;
  /** Where the place is in the part's config; null where the config says nothing and the part supplies a default. */
  readonly path: ConfigPath | null;
  /** What it holds, as the config has it and unchecked: none, one, or a list's entries. */
  readonly parts: readonly unknown[];
}

/** What `config` has under `slot`'s key, as it is and unchecked. */
export const slotValue = (config: PartConfig, slot: Slot): unknown => (config as unknown as Record<string, unknown>)[slot.key];

/** **Every place `config` of `part` holds other parts** (`Held`): its slots, in order, then what it declares outside them. */
export function heldBy(part: Part, config: PartConfig): readonly Held[] {
  const slots = slotsOf(part, config).map((slot): Held => {
    const value = slotValue(config, slot);
    return { slot, path: [slot.key], parts: slot.many ? (value == null && slot.optional ? [] : Array.isArray(value) ? value : [value]) : value == null ? [] : [value] };
  });
  const declared = (part.children?.(config) ?? []).map((child): Held => {
    const key = child.path?.join(".") ?? `implicit ${child.role}`;
    return { slot: { key, label: key, role: child.role, many: false, optional: false }, path: child.path, parts: [child.config] };
  });
  return [...slots, ...declared];
}

/**
 * **Whether a part is left out on a body of `spec`**: a skill it holds (`Slot.skills`) is one the
 * body cannot use (`Part.fits`). It is left out with all it holds, and that is no refusal of the
 * tree it is in.
 */
export function leftOut(parts: PartLookup, part: Part, config: PartConfig, spec: BodySpec): boolean {
  return heldBy(part, config).some(({ slot, parts: held }) => slot.skills === true && held.some((child) => {
    const skill: Part | null = parts.find(slot.role, child);
    return skill !== null && skill.fits(spec, child as PartConfig, parts) !== null;
  }));
}

/** **A part a walk has come to** (`eachPart`). */
export interface PartAt {
  readonly part: Part;
  readonly config: PartConfig;
  /** Where it is in the root's config; null where a default supplies it, or something above it. */
  readonly path: ConfigPath | null;
  /** Where it is, as a fault names it: its path with dots (`options.0.skill`), a default named by its role (`implicit gait`); empty at the root. */
  readonly at: string;
}

/** What a visit says of the walk from here: go on (nothing), `skip` what this part holds, or `stop` the walk. */
export type Walk = void | "skip" | "stop";

/** Whether a walk visits an empty slot's fallback (`Slot.fallback`) as what the slot holds, or only what the config says. */
export type Fallbacks = "with-fallbacks" | "as-configured";

/**
 * **Visits every part of the tree `config` roots**, a part of `role`, each before what it holds:
 * what its slots hold, in order, then what it declares outside them (`heldBy`). With `fallbacks`,
 * an empty slot's fallback is visited as what the slot holds (`Slot.fallback`). What a slot holds
 * that is no part of the slot's role is passed over: the tree's faults say so (`treeFaults`).
 */
export function eachPart(parts: PartLookup, role: Role, config: PartConfig, visit: (at: PartAt) => Walk, fallbacks: Fallbacks = "as-configured"): void {
  const walk = (part: Part, config: PartConfig, path: ConfigPath | null, at: string): boolean => {
    const said = visit({ part, config, path, at });
    if (said === "stop") return true;
    if (said === "skip") return false;
    for (const { slot, path: place, parts: held } of heldBy(part, config)) {
      const below = at ? `${at}.${slot.key}` : slot.key, under = path === null || place === null ? null : [...path, ...place];
      if (held.length === 0 && slot.fallback && fallbacks === "with-fallbacks") {
        if (walk(parts.of(slot.role, slot.fallback), slot.fallback, null, below)) return true;
      }
      for (const [i, child] of held.entries()) {
        const found: Part | null = parts.find(slot.role, child);
        if (found && walk(found, child as PartConfig, under && slot.many ? [...under, i] : under, slot.many ? `${below}.${i}` : below)) return true;
      }
    }
    return false;
  };
  walk(parts.of(role, config), config, [], "");
}

/**
 * **What the tree `config` roots requires of its body's motor** (`Part.requires`), each once: of
 * every part in it, an empty slot's fallback included, a part left out on a body of `spec`
 * (`leftOut`) passed over with what it holds.
 */
export function partRequirements(parts: PartLookup, role: Role, config: PartConfig, spec: BodySpec): readonly Requirement[] {
  const found = new Set<Requirement>();
  eachPart(parts, role, config, ({ part, config }) => {
    if (leftOut(parts, part, config, spec)) return "skip";
    for (const requirement of part.requires ?? []) found.add(requirement);
    return undefined;
  }, "with-fallbacks");
  return [...found];
}
