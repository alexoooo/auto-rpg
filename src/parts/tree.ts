import type { BodySpec } from "../core/bodies/spec/body.ts";
// The walk of a tree of parts, and what is read and copied of one by it. Each is given the lookup of the parts the tree may name.
import type { PartLookup } from "./lookup.ts";
import type { Part, PartConfig, Requirement, Slot, Supplied } from "./parts.ts";

/** **Where a part is in a tree's config**: each step a key, or an index in a list. */
export type ConfigPath = readonly (string | number)[];

/**
 * **One place a part's config holds other parts**: a slot of it, or a part it declares outside
 * its slots (`Part.children`), which is given a slot of its own here, named by where it is, so
 * that every place reads alike.
 */
export interface Held {
  readonly slot: Slot;
  /** Where the place is in the part's config. */
  readonly path: ConfigPath;
  /** What it holds, as the config has it and unchecked: none, one, or a list's entries. */
  readonly parts: readonly unknown[];
}

/** What `config` has under `slot`'s key, as it is and unchecked. */
export const slotValue = (config: PartConfig, slot: Slot): unknown => (config as unknown as Record<string, unknown>)[slot.key];

/** **Every place `config` of `part` holds other parts** (`Held`): its slots, in order, then what it declares outside them. */
export function heldBy(part: Part, config: PartConfig): readonly Held[] {
  const slots = part.slots.map((slot): Held => {
    const value = slotValue(config, slot);
    return { slot, path: [slot.key], parts: slot.many ? (value == null && slot.optional ? [] : Array.isArray(value) ? value : [value]) : value == null ? [] : [value] };
  });
  const declared = (part.children?.(config) ?? []).map((child): Held => {
    const key = child.path.join(".");
    return { slot: { key, label: key, role: child.role, many: false, optional: false }, path: child.path, parts: [child.config] };
  });
  return [...slots, ...declared];
}

/** **What each empty slot of `config` runs**, as a part says it (`Part.supplies`): for each of `slots` that `config` holds nothing in, the part `defaults` has under the slot's key. */
export function whenEmpty(slots: readonly Slot[], config: PartConfig, defaults: Readonly<Record<string, PartConfig>>): readonly Supplied[] {
  return slots.flatMap((slot) => {
    const one = defaults[slot.key];
    return one !== undefined && slotValue(config, slot) == null ? [{ role: slot.role, config: one, slot: slot.key }] : [];
  });
}

/** **What `slot` of `part` runs where a config like `config` holds nothing in it** (`Supplied.slot`); undefined where it runs nothing. */
export function emptyRuns(parts: PartLookup, part: Part, config: PartConfig, slot: Slot): PartConfig | undefined {
  return part.supplies?.({ ...config, [slot.key]: null }, parts).find((one) => one.slot === slot.key)?.config;
}

/**
 * **Whether a part is left out on a body of `spec`**: a skill it holds (`Slot.skills`) is one the
 * body cannot use (`Part.fits`). It is left out with all it holds, and that is no refusal of the
 * tree it is in.
 */
export function leftOut(parts: PartLookup, part: Part, config: PartConfig, spec: BodySpec): boolean {
  return heldBy(part, config).some(({ slot, parts: held }) => slot.skills === true && !slot.optional && held.some((child) => {
    const skill: Part | null = parts.find(slot.role, child);
    return skill !== null && skill.fits(spec, child as PartConfig, parts) !== null;
  }));
}

/** The part `config` names, whatever its role; a thrown error for a kind no part has, read from a save or a link. */
export function partOf(parts: PartLookup, config: PartConfig): Part {
  const part = parts.any(config);
  if (!part) throw new Error(`no part of kind ${JSON.stringify(config.kind)}`);
  return part;
}

/** **A part a walk has come to** (`eachPart`). */
export interface PartAt {
  /** The slot holding this part, absent for the root and implicit supplies. */
  readonly slot?: Slot;
  readonly part: Part;
  readonly config: PartConfig;
  /** Where it is in the root's config; null where the config does not say it: a part supplies it (`Part.supplies`), or something above it. */
  readonly path: ConfigPath | null;
  /** Where it is, as a fault names it: its path with dots (`options.0.skill`), one a part supplies named by its slot or its role (`implicit gait`); empty at the root. */
  readonly at: string;
}

/** What a visit says of the walk from here: go on (nothing), `skip` what this part holds, or `stop` the walk. */
export type Walk = void | "skip" | "stop";

/**
 * **Visits every part of the tree `config` roots**, whatever its role, each before what it holds:
 * what its slots hold, in order, what it declares outside them (`heldBy`), then what it runs that
 * its config does not say (`Part.supplies`), each of those with a null path, and all below it. A
 * visit that reads only what the config says skips a null path. What a slot holds that is no part
 * of the slot's role is passed over: the tree's faults say so (`treeFaults`).
 */
export function eachPart(parts: PartLookup, config: PartConfig, visit: (at: PartAt) => Walk): void {
  const walk = (part: Part, config: PartConfig, path: ConfigPath | null, at: string, slot?: Slot): boolean => {
    const said = visit({ part, config, path, at, slot });
    if (said === "stop") return true;
    if (said === "skip") return false;
    for (const { slot, path: place, parts: held } of heldBy(part, config)) {
      const below = at ? `${at}.${slot.key}` : slot.key, under = path === null ? null : [...path, ...place];
      for (const [i, child] of held.entries()) {
        const found: Part | null = parts.find(slot.role, child);
        if (found && walk(found, child as PartConfig, under && slot.many ? [...under, i] : under, slot.many ? `${below}.${i}` : below, slot)) return true;
      }
    }
    for (const one of part.supplies?.(config, parts) ?? []) {
      const found: Part | null = parts.find(one.role, one.config), key = one.slot ?? `implicit ${one.role}`;
      if (found && walk(found, one.config, null, at ? `${at}.${key}` : key)) return true;
    }
    return false;
  };
  walk(partOf(parts, config), config, [], "");
}

/**
 * **What the tree `config` roots requires of its body's motor** (`Part.requires`), each once: of
 * every part in it, a part left out on a body of `spec` (`leftOut`) passed over with what it
 * holds. Of the parts a part supplies (`Part.supplies`), those the body fits: a part picks among
 * them by the body.
 */
export function partRequirements(parts: PartLookup, config: PartConfig, spec: BodySpec): readonly Requirement[] {
  const found = new Set<Requirement>();
  eachPart(parts, config, ({ part, config, path, slot }) => {
    if (leftOut(parts, part, config, spec) || (path === null || slot?.skills && slot.optional) && part.fits(spec, config, parts) !== null) return "skip";
    for (const requirement of part.requires ?? []) found.add(requirement);
    return undefined;
  });
  return [...found];
}

/**
 * The keys of `config` outside its part's stated keys (`Part.keys`), and those of its research
 * tuning outside the part's (`Part.tuning`); a part that states no keys has that fault.
 */
function unknownSettings(part: Part, config: PartConfig): readonly string[] {
  const tuning = part.tuning ?? [];
  const known: unknown = part.keys;
  if (typeof known !== "object" || known === null) return [`${part.label} states none of its keys (Part.keys)`];
  const given = (config as { tuning?: unknown }).tuning;
  return [
    ...Object.keys(config).filter((key) => !Object.hasOwn(known as object, key)).map((key) => `${part.label} has no setting ${key}`),
    ...(part.tuning && typeof given === "object" && given !== null ? Object.keys(given).filter((key) => !tuning.includes(key)).map((key) => `${part.label} has no tuning ${key}`) : []),
  ];
}

/**
 * **What is wrong with the tree `config` roots**, each a sentence prefixed with where it is under
 * `at` (`options.0: `): a part's own faults first, then each place it holds parts. What is no
 * part, a part of another role, or nothing where one is needed is a fault, and the tree is then
 * not `formed`: a part's own faults (`Part.faults`) are read only once every place below it holds
 * parts of its role, so its checks may read them.
 */
export function treeValidation(parts: PartLookup, config: PartConfig, at: string): { readonly formed: boolean; readonly faults: readonly string[] } {
  const where = (fault: string, path = at) => path ? `${path}: ${fault}` : fault;
  const kind = (value: unknown) => `no part of kind ${JSON.stringify((value as { kind?: unknown } | null)?.kind)}`;
  const part = parts.any(config);
  if (!part) return { formed: false, faults: [where(kind(config))] };
  const below: string[] = [];
  let formed = true;
  for (const { slot, parts: held } of heldBy(part, config)) {
    const value = slotValue(config, slot), path = at ? `${at}.${slot.key}` : slot.key;
    if (slot.many && !(value == null && slot.optional) && !Array.isArray(value)) { formed = false; below.push(where(`a list of ${slot.role} parts`, path)); continue; }
    if (!slot.many && held.length === 0 && !slot.optional) { formed = false; below.push(where(`a ${slot.role} part is needed`, path)); continue; }
    held.forEach((child, i) => {
      const here = slot.many ? `${path}.${i}` : path, found = parts.any(child);
      if (!found) { formed = false; below.push(where(kind(child), here)); }
      else if (found.role !== slot.role) { formed = false; below.push(where(`a ${found.role} part cannot go where a ${slot.role} part goes`, here)); }
      else {
        const checked = treeValidation(parts, child as PartConfig, here);
        formed = formed && checked.formed;
        below.push(...checked.faults);
      }
    });
  }
  return { formed, faults: [...unknownSettings(part, config).map((fault) => where(fault)),
    ...(formed ? part.faults(config, parts).map((fault) => where(fault)) : []), ...below] };
}

/**
 * **Why a body of `spec` cannot carry out what the tree `config` roots commands**, prefixed with
 * where under `at` (`options.0: `), or null where it can: the first part that refuses it
 * (`Part.fits`). A skill the body cannot use is no refusal: the part that holds it is left out
 * (`leftOut`), what else it holds unread. What a part supplies (`Part.supplies`) is its own to
 * answer for, in its `fits`.
 */
export function fitRefusal(parts: PartLookup, spec: BodySpec, config: PartConfig, at = ""): string | null {
  let refusal: string | null = null;
  eachPart(parts, config, ({ part, config: one, path, at: below, slot }) => {
    if (path === null) return "skip";
    const own = part.fits(spec, one, parts), where = at && below ? `${at}.${below}` : at || below;
    if (slot?.skills && slot.optional && own !== null) return "skip";
    if (own !== null) { refusal = where ? `${where}: ${own}` : own; return "stop"; }
    return leftOut(parts, part, one, spec) ? "skip" : undefined;
  });
  return refusal;
}

/** **The tree `config` roots with every part's `tuning` left out**, a copy: what a person's settings are, and what a link carries. */
export function withoutTuning<C extends PartConfig>(parts: PartLookup, config: C): C {
  const { tuning: _, ...rest } = config as C & { tuning?: unknown };
  const part = partOf(parts, config), stripped = (value: unknown): unknown => parts.any(value) ? withoutTuning(parts, value as PartConfig) : value;
  let out: Record<string, unknown> = rest;
  for (const slot of part.slots) {
    const value = out[slot.key];
    if (Array.isArray(value)) out[slot.key] = value.map((child) => stripped(child));
    else if (parts.any(value)) out[slot.key] = stripped(value);
  }
  const stripAt = (value: unknown, path: ConfigPath, index: number): unknown => {
    if (!value || typeof value !== "object" || !Object.hasOwn(value, path[index]!)) return value;
    const key = path[index]!, before = (value as Record<string | number, unknown>)[key];
    const next = index + 1 === path.length ? stripped(before) : stripAt(before, path, index + 1);
    if (next === before) return value;
    return Array.isArray(value) ? value.map((child, i) => i === key ? next : child) : { ...value, [key]: next };
  };
  for (const child of part.children?.(config) ?? []) if (child.path.length) out = stripAt(out, child.path, 0) as Record<string, unknown>;
  return out as C;
}

/**
 * **The tree `config` roots with what is at `path` replaced by `value`** (null removes a list's
 * entry), a copy: `path` is dot-separated, each step a slot of the part it is in (`Part.slots`) or a
 * key it states (`Part.keys`), in a list an index or an entry's name or kind, and in plain data a
 * key it has. A thrown error names the step that matches nothing, with what does.
 */
export function replacedAt<C extends PartConfig>(parts: PartLookup, config: C, path: string, value: unknown): C {
  const steps = path.split(".");
  /** What a step in a config of `part` may be: its slots and stated keys, beside its kind. */
  const keysOf = (part: Part): string[] => [...new Set([...part.slots.map((slot) => slot.key), ...Object.keys(part.keys ?? {})])].filter((key) => key !== "kind");
  const walk = (at: unknown, k: number, holder: string): unknown => {
    const step = steps[k]!, last = k === steps.length - 1;
    if (Array.isArray(at)) {
      const i = /^\d+$/.test(step) ? Number(step) : at.findIndex((one) => one?.name === step || one?.kind === step);
      if (i < 0 || i >= at.length) throw new Error(`${holder} has no entry ${step}: ${at.map((one, j) => one?.name ?? one?.kind ?? j).join(", ")}`);
      const copy = [...at];
      if (last && value === null) copy.splice(i, 1);
      else copy[i] = last ? value : walk(at[i], k + 1, `${holder}.${step}`);
      return copy;
    }
    if (typeof at !== "object" || at === null) throw new Error(`${holder} holds nothing to read ${step} in`);
    const part = parts.any(at), open = part ? keysOf(part) : Object.keys(at);
    if (!open.includes(step)) throw new Error(`${holder} has no slot or setting ${step}: ${open.join(", ")}`);
    return { ...at, [step]: last ? value : walk((at as Record<string, unknown>)[step], k + 1, `${holder}.${step}`) };
  };
  return walk(config, 0, config.kind) as C;
}
