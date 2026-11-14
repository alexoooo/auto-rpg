import { loadData, type DataKey, type DataLoaders } from "../../core/data/store.ts";
import type { MindConfig } from "./config.ts";
import type { Controller, MindPreset } from "./controller.ts";
import { heldVariations, type BodySpec } from "../../core/bodies/spec/body.ts";
import { scopeOf, type Entrant } from "./entrant.ts";
import type { PartLookup, RoleParts, RoleConfigs } from "../../parts/lookup.ts";
import type { Part, PartConfig, Role } from "../../parts/parts.ts";
import { eachPart, fitRefusal, partOf, replacedAt, treeValidation, withoutTuning } from "../../parts/tree.ts";
import type { MindDescription } from "./description.ts";

/**
 * **What a catalog is made of** (`catalogOf`): the toolkit's kinds of mind and each role's list of
 * its parts by kind, then the entrants (`Entrant`), each with its own minds, parts and presets, in
 * the order a picker offers them.
 */
export interface CatalogLists {
  readonly data?: readonly DataLoaders[];
  readonly minds: readonly Controller[];
  readonly parts: readonly Readonly<Record<string, Part>>[];
  readonly entrants: readonly Entrant[];
}

/** A kind a slot may be set to, with the reason it cannot go there for this body and screen, or null. */
export interface Offered {
  readonly kind: string;
  readonly part: Part;
  readonly reason: string | null;
}

/**
 * **A scenario's entry rule**: what it asks of a mind beyond fitting the body (`fitRefusal`).
 * `attacks`: it strikes with something the body has (`strikesOf`); `uses-held`: every
 * item the body holds has a use in it (`equipmentSupported`). A scenario states its own: a stand or
 * a course asks neither, so a mind may carry what it never uses there.
 */
export type EntryRule = "attacks" | "uses-held";

/** **What a fight asks of a mind** (an Arena bout, a match, a Crypt run): that it can attack, and has a use for what its body holds. */
export const FIGHT_ENTRY: readonly EntryRule[] = Object.freeze(["attacks", "uses-held"]);

/** **The first part of kind `kind` in `config`'s tree**, as plain data (a part in a subject's mind, wherever its kind puts it); null where none is. */
export function partIn(config: unknown, kind: string): PartConfig | null {
  if (!config || typeof config !== "object") return null;
  if (!Array.isArray(config) && (config as { kind?: unknown }).kind === kind) return config as PartConfig;
  for (const value of Object.values(config)) { const found = partIn(value, kind); if (found) return found; }
  return null;
}

/**
 * **A catalog of minds and parts** (`catalogOf`): every kind of mind and every part by its kind,
 * and what is read of a tree of them. The core is given one, never reaches one: the game's is
 * composed above it (`src/app/catalog.ts`), the toolkit's for the core's own tasks
 * (`src/app/toolkit.ts`).
 */
export interface Catalog {
  /** Every registered data key, in registration order. */
  readonly dataKeys: readonly DataKey[];
  /** Load registered data before building a mind that reads it. */
  loadData(keys: Iterable<DataKey>): Promise<void>;
  /** Load the data every offered part's compatibility check reads before screen setup. */
  loadFitData(): Promise<void>;
  /**
   * **Every controller, by its mind's kind** (its defaults' `kind`): the toolkit's, then each
   * entrant's; the one place a kind is made, matched to a body.
   */
  readonly controllers: Readonly<Record<string, Controller>>;
  /** **Every mind a person may pick**, by id: each entrant's presets (`Entrant.presets`), in the entrants' order. */
  readonly minds: Readonly<Record<string, MindPreset>>;
  /**
   * **What is wrong with the lists**, each a sentence: a kind two parts or minds name, a list entry
   * under another kind, a toolkit kind that is scoped or an entrant's that is not its own
   * (`scopeOf`), two entrants of a name, a preset id twice, a preset whose tree names a part no
   * list holds or another entrant's kinds. The entry at fault is left out.
   */
  readonly faults: readonly string[];
  /** The controller of `config`'s kind; a thrown error for a kind no controller has, read from a save or a link. */
  controllerOf(config: MindConfig): Controller;
  /**
   * **Every part, by its kind**, across roles: the minds and the parts below them, the toolkit's
   * then each entrant's, the one list a screen offers a slot's choices from.
   */
  allParts(): Readonly<Record<string, Part>>;
  /** Whether `kind` names a part (`allParts`). */
  isKind(kind: unknown): kind is string;
  /** The part of `config`'s kind; a thrown error for a kind no part has, read from a save or a link. */
  partOf<C extends PartConfig>(config: C): Part<C>;
  /**
   * **Every part by kind, looked up by role** (`PartLookup`): each config's part (`partOf`),
   * refused where the kind is of another role.
   */
  readonly partLookup: PartLookup;
  /**
   * **The lookup a mind of `config` runs on**: the catalog's (`partLookup`), refusing a part its
   * tree does not name (`treeKinds`).
   */
  treeLookup(config: PartConfig): PartLookup;
  /**
   * **What is wrong with the tree `config` roots**, each a sentence. A part's own faults come first, then each slot's, each prefixed with where it is
   * (`options.0: `). A slot that holds what is no part, a
   * part of another role, or nothing where it must hold one is a fault; a part's own faults
   * (`Part.faults`) are read only once every descendant slot holds parts of its role. A tree that
   * names the kinds of two entrants is a fault (`scopesOf`).
   */
  treeFaults(config: PartConfig, at?: string): readonly string[];
  /** Whether the mind `config` roots carries out a person's orders (`Controller.obeys`). */
  treeObeys(config: PartConfig): boolean;
  /** What a person is shown for each phase the mind `config` roots reports (`Controller.phases`). */
  phaseLabels(config: PartConfig): Readonly<Record<string, string | null>>;
  /** **The mind data `config`'s parts read** (`Part.reads`), every key once: what a screen loads (`loadData`) before it builds the mind. */
  treeData(config: PartConfig): readonly DataKey[];
  /** **Whether a body of `spec` can stage what `config` roots** on its screen: its tree's faults (`treeValidation`), fit (`fitRefusal`), then the scenario's entry rules (`EntryRule`); the first reason, or null. */
  stageRefusal(spec: BodySpec, config: PartConfig, rules: readonly EntryRule[]): string | null;
  /** The tree `config` roots with every part's `tuning` left out: what a person's settings are, and what a link carries. */
  withoutTuning<C extends PartConfig>(config: C): C;
  /**
   * **Every part of `role`** a slot in the tree `tree` roots may hold, in the list's order, each with
   * why it cannot go there for a body of `spec`, or null:
   * the toolkit's parts and the tree's own entrant's (`scopesOf`). None of those is left out.
   */
  kindsFor(role: Role, spec: BodySpec, tree?: PartConfig | null): readonly Offered[];
  /**
   * **The tree `config` roots with what is at `path` replaced by `value`** (null removes a list's
   * entry), a copy: `path` is dot-separated, each step a slot of the part it is in (`Part.slots`) or a
   * key it states (`Part.keys`), in a list an index or an entry's name or kind, and in plain data a
   * key it has. A thrown error names the step that matches nothing, with what does.
   */
  replacedAt<C extends PartConfig>(config: C, path: string, value: unknown): C;
}

/** Every part, by its kind; every controller by its kind; every preset by id, with its entrant's name; what is wrong with the lists. */
interface Registry {
  readonly data: DataLoaders;
  readonly parts: Readonly<Record<string, Part>>;
  readonly controllers: Readonly<Record<string, Controller>>;
  readonly presets: Readonly<Record<string, MindPreset>>;
  readonly entrantOf: Readonly<Record<string, string>>;
  readonly faults: readonly string[];
}

/** **What `lists` register** (`Registry`): the toolkit's parts and minds, then each entrant's, an entry at fault left out and named in `faults`. */
function registryOf({ minds, parts: roles, entrants, data: dataLists = [] }: CatalogLists): Registry {
  const parts: Record<string, Part> = {}, controllers: Record<string, Controller> = {}, presets: Record<string, MindPreset> = {}, entrantOf: Record<string, string> = {};
  const faults: string[] = [], names = new Set<string>();
  const data: Partial<Record<DataKey, () => Promise<unknown>>> = {};
  for (const loaders of [...dataLists, ...entrants.map((entrant) => entrant.data ?? {})]) {
    for (const [key, loader] of Object.entries(loaders) as [DataKey, () => Promise<unknown>][]) {
      if (Object.hasOwn(data, key)) faults.push(`two registrations supply mind data ${JSON.stringify(key)}`);
      else data[key] = loader;
    }
  }
  const add = (kind: string, part: Part, what: string, scope: string | null) => {
    if (scopeOf(kind) !== scope) faults.push(scope === null ? `${what} ${JSON.stringify(kind)} is scoped, and the toolkit's kinds are not` : `${what} ${JSON.stringify(kind)} is not scoped ${scope}:`);
    else if (Object.hasOwn(parts, kind)) faults.push(`${what} ${JSON.stringify(kind)} is another part's kind`);
    else {
      parts[kind] = part;
      if (part.role === "mind") controllers[kind] = part as Controller;
    }
  };
  for (const list of roles) for (const [kind, part] of Object.entries(list)) {
    if (part.defaults.kind !== kind) faults.push(`a list names ${JSON.stringify(part.defaults.kind)} ${JSON.stringify(kind)}`);
    else add(kind, part, `the ${part.role} part`, null);
  }
  for (const entry of minds) add(entry.defaults.kind, entry, "the mind", null);
  for (const entrant of entrants) {
    if (names.has(entrant.name) || entrant.name.includes(":") || entrant.name.includes("/")) { faults.push(`an entrant called ${JSON.stringify(entrant.name)}: a name is one entrant's, with no : or /`); continue; }
    names.add(entrant.name);
    for (const entry of entrant.minds ?? []) add(entry.defaults.kind, entry, `${entrant.name}'s mind`, entrant.name);
    for (const part of entrant.parts ?? []) {
      if (part.role === "mind") faults.push(`${entrant.name}'s part ${JSON.stringify(part.defaults.kind)} is a mind: a mind goes in its minds`);
      else add(part.defaults.kind, part, `${entrant.name}'s ${part.role} part`, entrant.name);
    }
    for (const [id, preset] of Object.entries(entrant.presets)) {
      if (Object.hasOwn(presets, id)) faults.push(`${entrant.name}'s preset ${JSON.stringify(id)} is ${entrantOf[id]}'s`);
      else { presets[id] = preset; entrantOf[id] = entrant.name; }
    }
  }
  return { data: Object.freeze(data), parts: Object.freeze(parts), controllers: Object.freeze(controllers), presets: Object.freeze(presets), entrantOf: Object.freeze(entrantOf), faults: Object.freeze(faults) };
}

/** **The lookup over the parts `kinds` gives by kind** (`PartLookup`), read at each lookup, so the lists behind them are read on first use. */
function lookupOf(kinds: () => Readonly<Record<string, Part>>): PartLookup {
  const any = (value: unknown): Part | null => {
    const kind = typeof value === "object" && value !== null ? (value as { kind?: unknown }).kind : undefined;
    return typeof kind === "string" && Object.hasOwn(kinds(), kind) ? kinds()[kind]! : null;
  };
  const candidates = (role: Role): readonly PartConfig[] => Object.entries(kinds())
    .filter(([kind, part]) => part.role === role && scopeOf(kind) === null)
    .map(([, part]) => part.defaults);
  const game = (role: Role): readonly PartConfig[] => candidates(role).filter(config => partOf(lookup, config).stage === "game");
  const held = (role: Role, spec: BodySpec): readonly PartConfig[] => candidates(role).flatMap(config => {
    const part = partOf(lookup, config);
    return part.variations === undefined ? [] : heldVariations(spec, config.kind).map(variation => ({ ...config, variation }));
  });
  const selected = (role: Role, spec: BodySpec): readonly PartConfig[] => held(role, spec).filter(config => partOf(lookup, config).fits(spec, config, lookup) === null);
  const fitting = (role: Role, spec: BodySpec): PartConfig | string => {
    const enabled = [...game(role).filter(config => partOf(lookup, config).variations === undefined), ...held(role, spec)];
    const refusals = enabled.map((config) => ({ config, refused: partOf(lookup, config).fits(spec, config, lookup) }));
    const fit = refusals.filter(({ refused }) => refused === null);
    if (fit.length === 1) return fit[0]!.config;
    return fit.length === 0 ? `no ${role} part fits ${spec.model}: ${refusals.map(({ config, refused }) => `${partOf(lookup, config).label} ${refused}`).join("; ")}`
      : `${fit.map(({ config }) => config.kind).join(" and ")} both fit ${spec.model} as its ${role}: one of a role fits a body`;
  };
  const lookup: PartLookup = Object.freeze({
    any,
    of<R extends Role>(role: R, config: PartConfig): RoleParts[R] {
      const part = partOf(lookup, config);
      if (part.role !== role) throw new Error(`a ${part.role} part cannot go where a ${role} part goes`);
      return part as never;
    },
    find<R extends Role>(role: R, value: unknown): RoleParts[R] | null {
      const part = any(value);
      return part?.role === role ? part as never : null;
    },
    fitting: fitting as PartLookup["fitting"],
    candidates: candidates as PartLookup["candidates"],
    selected: selected as PartLookup["selected"],
    game: game as PartLookup["game"],
  });
  return lookup;
}

/** Every kind of part the tree `config` roots, each once, the root's first: the tree's parts and what each runs that its config does not say (`eachPart`). */
function treeKinds(parts: PartLookup, config: PartConfig): readonly string[] {
  const kinds = new Set<string>();
  eachPart(parts, config, ({ config: one }) => { kinds.add(one.kind); });
  return [...kinds];
}

/** The mind data the parts of the tree `config` roots read (`Part.reads`, `Part.fitReads`), every key once. */
function treeData(parts: PartLookup, config: PartConfig): readonly DataKey[] {
  const keys = new Set<DataKey>();
  eachPart(parts, config, ({ part, config: one }) => {
    for (const key of [...part.reads?.(one) ?? [], ...part.fitReads ?? []]) keys.add(key);
  });
  return [...keys];
}

/** The entrants whose kinds the tree `config` roots names (`scopeOf`), each once, in the tree's order. */
const scopesOf = (parts: PartLookup, config: PartConfig): readonly string[] =>
  [...new Set(treeKinds(parts, config).map(scopeOf).filter((scope): scope is string => scope !== null))];

/** What is wrong with the tree `config` roots (`treeValidation`), and, where nothing else is, that it names the kinds of two entrants. */
function treeFaults(parts: PartLookup, config: PartConfig, at: string): readonly string[] {
  const { formed, faults: found } = treeValidation(parts, config, at), scopes = formed && found.length === 0 ? scopesOf(parts, config) : [];
  return scopes.length < 2 ? found : [...found, `${at ? `${at}: ` : ""}it names the kinds of ${scopes.join(" and ")}: a tree is one entrant's`];
}

/** **`parts`, refusing a part the tree `config` roots does not name** (`treeKinds`): the lookup a mind of `config` runs on. */
function treeLookup(parts: PartLookup, config: PartConfig): PartLookup {
  const named = new Set(treeKinds(parts, config));
  const refuse = (kind: string): never => { throw new Error(`${partOf(parts, config).label} looks up ${kind}, a part its tree does not name`); };
  return Object.freeze({
    any(value: unknown): Part | null {
      const found = parts.any(value);
      return found && !named.has((value as PartConfig).kind) ? refuse((value as PartConfig).kind) : found;
    },
    of<R extends Role>(role: R, part: PartConfig): RoleParts[R] {
      return named.has(part.kind) ? parts.of(role, part) : refuse(part.kind);
    },
    find<R extends Role>(role: R, value: unknown): RoleParts[R] | null {
      const found = parts.find(role, value);
      return found && !named.has((value as PartConfig).kind) ? refuse((value as PartConfig).kind) : found;
    },
    fitting: parts.fitting,
    candidates: ((role: Role & keyof RoleConfigs) => parts.candidates(role).filter(config => named.has(config.kind))) as PartLookup["candidates"],
    selected: ((role: Role & keyof RoleConfigs, spec: BodySpec) => parts.selected(role, spec).filter(config => named.has(config.kind))) as PartLookup["selected"],
    game: ((role: Role & keyof RoleConfigs) => parts.game(role).filter(config => named.has(config.kind))) as PartLookup["game"],
  });
}

/** The effectors the mind `config` roots strikes with on a body of `spec` (`Controller.strikes`); none where it is no mind. */
const strikesOf = (parts: PartLookup, spec: BodySpec, config: PartConfig): readonly string[] => parts.find("mind", config)?.strikes?.(spec, config, parts) ?? [];

/** Every item a body of `spec` holds has a use in the mind `config` roots: it strikes with it, or has another use for it (`Controller.supportedEquipment`). */
function equipmentSupported(parts: PartLookup, spec: BodySpec, config: PartConfig): boolean {
  const supported = new Set([...strikesOf(parts, spec, config), ...parts.find("mind", config)?.supportedEquipment?.(spec, config, parts) ?? []]);
  return (spec.held ?? []).every(({ segment }) => supported.has(segment));
}

/** **Why the mind `config` roots may not enter a scenario of `rules`** with a body of `spec`, a sentence, or null where it may. */
function entryRefusal(parts: PartLookup, spec: BodySpec, config: PartConfig, rules: readonly EntryRule[]): string | null {
  for (const rule of rules) switch (rule) {
    case "attacks": if (strikesOf(parts, spec, config).length === 0) return "it strikes with nothing the body has"; break;
    case "uses-held": if (!equipmentSupported(parts, spec, config)) return "it has no use for something the body holds"; break;
    default: { const never: never = rule; throw new Error(`no entry rule ${String(never)}`); }
  }
  return null;
}

/**
 * **The catalog of `lists`** (`Catalog`), read once on first use, never as the module that makes
 * it loads, so a part's module may be read in any order. What is wrong with the lists is the
 * catalog's `faults`, the entry at fault left out. What it reads of a tree is a plain function
 * given its lookup: the walks every tree of parts takes (`src/parts/tree.ts`), and above, those
 * that ask a mind or an entrant.
 */
export function catalogOf(lists: () => CatalogLists): Catalog {
  let registry: Registry | null = null;
  const registered = (): Registry => registry ??= registryOf(lists());
  const parts = lookupOf(() => registered().parts);

  let faults: readonly string[] | null = null;
  /** The lists' faults, then each preset whose tree is not one of parts in their slots (`treeValidation`), or names another entrant's kinds. */
  const faultsOf = (): readonly string[] => {
    if (faults) return faults;
    const { presets, entrantOf } = registered(), found = [...registered().faults];
    for (const [id, preset] of Object.entries(presets)) {
      const { formed, faults: wrong } = treeValidation(parts, preset.config, "");
      if (!formed || wrong.length > 0) { found.push(`${entrantOf[id]}'s preset ${JSON.stringify(id)}: ${wrong.join("; ")}`); continue; }
      const other = scopesOf(parts, preset.config).find((scope) => scope !== entrantOf[id]);
      if (other !== undefined) found.push(`${entrantOf[id]}'s preset ${JSON.stringify(id)} names ${other}'s kinds`);
    }
    return faults = Object.freeze(found);
  };

  return Object.freeze({
    get dataKeys() { return Object.freeze(Object.keys(registered().data) as DataKey[]); },
    loadData: (keys: Iterable<DataKey>) => loadData(keys, registered().data),
    loadFitData: () => loadData(Object.values(registered().parts).flatMap(part => part.fitReads ?? []), registered().data),
    get controllers() { return registered().controllers; },
    get minds() { return registered().presets; },
    get faults() { return faultsOf(); },
    controllerOf(config: MindConfig): Controller {
      const controllers = registered().controllers;
      const found = Object.hasOwn(controllers, config.kind) ? controllers[config.kind] : undefined;
      if (!found) throw new Error(`no mind of kind ${JSON.stringify(config.kind)}`);
      return found;
    },
    allParts: () => registered().parts,
    isKind: (kind: unknown): kind is string => typeof kind === "string" && Object.hasOwn(registered().parts, kind),
    partOf: <C extends PartConfig>(config: C): Part<C> => partOf(parts, config) as Part<C>,
    partLookup: parts,
    treeLookup: (config: PartConfig): PartLookup => treeLookup(parts, config),
    treeFaults: (config: PartConfig, at = ""): readonly string[] => treeFaults(parts, config, at),
    treeObeys: (config: PartConfig): boolean => parts.find("mind", config)?.obeys?.(config, parts) ?? false,
    phaseLabels: (config: PartConfig): Readonly<Record<string, string | null>> => parts.find("mind", config)?.phases?.(config, parts) ?? {},
    treeData: (config: PartConfig): readonly DataKey[] => treeData(parts, config),
    stageRefusal: (spec: BodySpec, config: PartConfig, rules: readonly EntryRule[]): string | null =>
      treeValidation(parts, config, "").faults[0] ?? fitRefusal(parts, spec, config) ?? entryRefusal(parts, spec, config, rules),
    withoutTuning: <C extends PartConfig>(config: C): C => withoutTuning(parts, config),
    kindsFor(role: Role, spec: BodySpec, tree: PartConfig | null = null): readonly Offered[] {
      const scope = tree ? scopesOf(parts, tree)[0] ?? null : null;
      return Object.entries(registered().parts).filter(([kind, part]) => part.role === role && (scopeOf(kind) === null || scopeOf(kind) === scope))
        .map(([kind, part]) => ({ kind, part, reason: fitRefusal(parts, spec, part.defaults) }));
    },
    replacedAt: <C extends PartConfig>(config: C, path: string, value: unknown): C => replacedAt(parts, config, path, value),
  });
}

/** Unsupported introspection stays explicit; callers never reconstruct private controller fields. */
export function describeMind(catalog: Catalog, spec: BodySpec, config: MindConfig): MindDescription | null {
  return catalog.controllerOf(config).describe?.(spec, config, catalog.treeLookup(config)) ?? null;
}
