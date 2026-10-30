import type { DataKey } from "../data/store.ts";
import type { FighterConfig, MindConfig } from "../mind/config.ts";
import type { Controller, MindPreset, Scripted } from "../mind/controller.ts";
import type { BodySpec } from "../spec/body.ts";
import type { PartLookup, RoleParts } from "./lookup.ts";
import { slotsOf, type Part, type PartConfig, type Provision, type Role } from "./parts.ts";

/** **What a catalog is made of** (`catalogOf`): every kind of mind, in the order a picker offers them, and each role's list of parts by kind. */
export interface CatalogLists {
  readonly minds: readonly Controller[];
  readonly parts: readonly Readonly<Record<string, Part>>[];
}

/** A kind a slot may be set to, with the reason it cannot go there for this body and screen, or null. */
export interface Offered {
  readonly kind: string;
  readonly part: Part;
  readonly reason: string | null;
}

/**
 * **A scenario's entry rule**: what it asks of a mind beyond fitting the body (`treeRefusal`).
 * `attacks`: a part of it strikes with something the body has (`attacks`); `uses-held`: every
 * item the body holds has a use in it (`equipmentSupported`). A scenario states its own: a stand or
 * a course asks neither, so a mind may carry what it never uses there.
 */
export type EntryRule = "attacks" | "uses-held";

/** **What a fight asks of a mind** (an Arena bout, a match, a Crypt run): that it can attack, and has a use for what its body holds. */
export const FIGHT_ENTRY: readonly EntryRule[] = Object.freeze(["attacks", "uses-held"]);

/** **The first part of kind `kind` in `config`'s tree**, as plain data (a part in a record's mind, wherever its kind puts it); null where none is. */
export function partIn(config: unknown, kind: string): PartConfig | null {
  if (!config || typeof config !== "object") return null;
  if (!Array.isArray(config) && (config as { kind?: unknown }).kind === kind) return config as PartConfig;
  for (const value of Object.values(config)) { const found = partIn(value, kind); if (found) return found; }
  return null;
}

/**
 * **A catalog of minds and parts** (`catalogOf`): every kind of mind and every part by its kind,
 * and what is read of a tree of them. The core is given one, never reaches one: the game's is
 * composed above it (`src/entrants/game.ts`), the toolkit's for the core's own tasks
 * (`src/core/toolkit.ts`).
 */
export interface Catalog {
  /**
   * **Every controller, by its mind's kind** (its defaults' `kind`), in the order a picker offers
   * them: the one place a kind is made, matched to a body and offered by name.
   */
  readonly controllers: Readonly<Record<string, Controller>>;
  /** Every controller's presets by id (`Controller.presets`), in the controllers' order. */
  readonly presets: Readonly<Record<string, MindPreset>>;
  /**
   * **Every mind a person may pick**, by id: each preset (`presets`), then each controller that has
   * none, under its kind with its defaults, so that a Mind registered without a preset is still
   * played.
   */
  readonly minds: Readonly<Record<string, MindPreset>>;
  /** The controller of `config`'s kind; a thrown error for a kind no controller has, read from a save or a link. */
  controllerOf(config: MindConfig): Controller;
  /**
   * **Every part, by its kind**, across roles: the minds, the parts below them and each mind's own
   * parts (`Controller.parts`), the one list a screen offers a slot's choices from.
   */
  allParts(): Readonly<Record<string, Part>>;
  /** Whether `kind` names a part (`allParts`). */
  isKind(kind: unknown): kind is string;
  /** The mind whose own part `kind` is (`Controller.parts`), or null for a part any mind may hold. */
  ownerOf(kind: string): string | null;
  /** The part of `config`'s kind; a thrown error for a kind no part has, read from a save or a link. */
  partOf<C extends PartConfig>(config: C): Part<C>;
  /** How a scene drives `config` by a script (`Controller.scripted`); null where its mind takes none, or no mind is of its kind. */
  scriptedBy(config: MindConfig): Scripted | null;
  /** Whether a scene may drive `config` by a script of its own (`scriptedBy`): a mind with a fighter's slots. */
  takesScript(config: MindConfig): config is FighterConfig;
  /**
   * **Every part by kind, looked up by role** (`PartLookup`): each config's part (`partOf`), a
   * mind's own parts included, refused where the kind is of another role.
   */
  readonly partLookup: PartLookup;
  /**
   * **The lookup a mind of `config` runs on**: the catalog's (`partLookup`), refusing a part its
   * tree does not name (`treeKinds`), whose code a case of that mind would not hold.
   */
  treeLookup(config: PartConfig): PartLookup;
  /**
   * **What is wrong with the tree `config` roots** on a screen that `provides` what it does, each a
   * sentence. A part's own faults come first, then each slot's, each prefixed with where it is
   * (`subs.0: `). A part the screen cannot run (`Part.needs`), a slot that holds what is no part, a
   * part of another role, another mind's own part (`Controller.parts`), or nothing where it must
   * hold one is a fault; a part's own faults (`Part.faults`) are read only once every descendant slot
   * holds parts of its role and owner. `mind` is the kind of the mind the tree is of: the root's, where it is a mind.
   */
  treeFaults(config: PartConfig, provides?: readonly Provision[], at?: string, mind?: string | null): readonly string[];
  /** **Every kind of part in the tree `config` roots**, the root's included, an empty slot's fallback (`Slot.fallback`) and what a part runs besides its slots (`Part.uses`), each once: what a case's code holds the parts' own code of (`caseCoder`). */
  treeKinds(config: PartConfig): readonly string[];
  /** Whether a part of `config`'s tree carries out a person's orders (`Part.obeys`). */
  treeObeys(config: PartConfig): boolean;
  /** What a person is shown for each phase the parts of `config`'s tree report (`Part.phases`). */
  phaseLabels(config: PartConfig): Readonly<Record<string, string | null>>;
  /** **The mind data `config`'s parts read** (`Part.reads`), every key once: what a screen loads (`loadData`) before it builds the mind. */
  treeData(config: PartConfig): readonly DataKey[];
  /**
   * **Why a body of `spec` cannot carry out what the tree `config` roots commands**, prefixed with
   * where (`subs.0: `), or null where it can: the first part that refuses it (`Part.fits`). Fit is
   * only that: what a scenario asks beyond it is its entry rules (`EntryRule`).
   */
  treeRefusal(spec: BodySpec, config: PartConfig, at?: string): string | null;
  /** **Whether a body of `spec` can stage what `config` roots** on its screen: fit (`treeRefusal`), then the scenario's entry rules (`EntryRule`); the first reason, or null. */
  stageRefusal(spec: BodySpec, config: PartConfig, rules: readonly EntryRule[]): string | null;
  /** The tree `config` roots with every part's `tuning` left out: what a person's settings are, and what a link carries. */
  withoutTuning<C extends PartConfig>(config: C): C;
  /**
   * **Every part of `role`** a slot of a mind of kind `mind` may hold, in the list's order, each with
   * why it cannot go there for a body of `spec` on a screen that `provides` what it does, or null:
   * the parts any mind may hold and the mind's own (`Controller.parts`). None of those is left out.
   */
  kindsFor(role: Role, spec: BodySpec, provides?: readonly Provision[], mind?: string | null): readonly Offered[];
  /**
   * **The tree `config` roots with what is at `path` replaced by `value`** (null removes a list's
   * entry), a copy: `path` is dot-separated, each step a slot of the part it is in (`slotsOf`) or a
   * key it states (`Part.keys`), in a list an index or an entry's name or kind, and in plain data a
   * key it has. A thrown error names the step that matches nothing, with what does.
   */
  replacedAt<C extends PartConfig>(config: C, path: string, value: unknown): C;
}

/** What a screen that gives nothing beyond the body and the world provides. */
const NOTHING: readonly Provision[] = Object.freeze([]);

/** Why a part that `needs` something cannot run on a screen that `provides` what it does, or null. */
const unprovided = (needs: Provision | undefined, provides: readonly Provision[]): string | null =>
  needs === undefined || provides.includes(needs) ? null : `this screen gives no ${needs}`;

/** Every part, by its kind; each mind's own part's mind (`Controller.parts`), by the part's kind; every controller by its kind. */
interface Registry {
  readonly parts: Readonly<Record<string, Part>>;
  readonly owners: Readonly<Record<string, string>>;
  readonly controllers: Readonly<Record<string, Controller>>;
}

/**
 * **The catalog of `lists`** (`Catalog`), read once on first use, never as the module that makes
 * it loads, so a part's module may be read in any order. A role's list must name each part by its
 * defaults' kind, and a kind twice (two minds, two lists, a mind's own part and another) is
 * refused: each is a thrown error, a defect in the lists.
 */
export function catalogOf(lists: () => CatalogLists): Catalog {
  let registry: Registry | null = null;
  const registered = (): Registry => {
    if (registry) return registry;
    const { minds, parts: roles } = lists();
    const parts: Record<string, Part> = {}, owners: Record<string, string> = {}, controllers: Record<string, Controller> = {};
    const add = (kind: string, part: Part, what: string) => {
      if (Object.hasOwn(parts, kind)) throw new Error(`${what} of kind ${JSON.stringify(kind)} is another part's`);
      parts[kind] = part;
    };
    for (const list of roles) for (const [kind, part] of Object.entries(list)) {
      if (part.defaults.kind !== kind) throw new Error(`the list names ${JSON.stringify(part.defaults.kind)} ${JSON.stringify(kind)}`);
      add(kind, part, `a ${part.role} part`);
    }
    for (const entry of minds) {
      if (Object.hasOwn(controllers, entry.defaults.kind)) throw new Error(`two minds of kind ${JSON.stringify(entry.defaults.kind)}`);
      controllers[entry.defaults.kind] = entry;
      add(entry.defaults.kind, entry, "a mind");
    }
    for (const [kind, controller] of Object.entries(controllers)) for (const own of controller.parts ?? []) {
      if (own.role === "mind") throw new Error(`${kind}'s own part ${JSON.stringify(own.defaults.kind)} is a mind`);
      add(own.defaults.kind, own, `${kind}'s own part`);
      owners[own.defaults.kind] = kind;
    }
    return registry = { parts: Object.freeze(parts), owners: Object.freeze(owners), controllers: Object.freeze(controllers) };
  };
  let presets: Readonly<Record<string, MindPreset>> | null = null, minds: Readonly<Record<string, MindPreset>> | null = null;
  const presetsOf = (): Readonly<Record<string, MindPreset>> =>
    presets ??= Object.freeze(Object.assign({}, ...Object.values(registered().controllers).map((entry) => entry.presets)));
  const mindsOf = (): Readonly<Record<string, MindPreset>> => {
    if (minds) return minds;
    const all: Record<string, MindPreset> = { ...presetsOf() };
    for (const [kind, entry] of Object.entries(registered().controllers)) {
      if (Object.keys(entry.presets).length > 0) continue;
      if (Object.hasOwn(all, kind)) throw new Error(`a preset is called ${JSON.stringify(kind)}, a kind with no preset`);
      all[kind] = { label: entry.label, config: entry.defaults };
    }
    return minds = Object.freeze(all);
  };

  const isKind = (kind: unknown): kind is string => typeof kind === "string" && Object.hasOwn(registered().parts, kind);
  const ownerOf = (kind: string): string | null => registered().owners[kind] ?? null;
  function partOf<C extends PartConfig>(config: C): Part<C> {
    const part = isKind(config.kind) ? registered().parts[config.kind] : undefined;
    if (!part) throw new Error(`no part of kind ${JSON.stringify(config.kind)}`);
    return part as Part<C>;
  }
  function controllerOf(config: MindConfig): Controller {
    const controllers = registered().controllers;
    const found = Object.hasOwn(controllers, config.kind) ? controllers[config.kind] : undefined;
    if (!found) throw new Error(`no mind of kind ${JSON.stringify(config.kind)}`);
    return found;
  }
  function scriptedBy(config: MindConfig): Scripted | null {
    const controllers = registered().controllers;
    const controller = isKind(config.kind) ? controllers[config.kind] : undefined;
    return controller?.scripted ?? null;
  }
  const partLookup: PartLookup = Object.freeze({
    of<R extends Role>(role: R, config: PartConfig): RoleParts[R] {
      const part = partOf(config);
      if (part.role !== role) throw new Error(`a ${part.role} part cannot go where a ${role} part goes`);
      return part as never;
    },
  });

  /** What each slot of `config` holds, by the slot, as a list: a single slot's part or none, or a list slot's parts. */
  function held(config: PartConfig): { readonly slot: Part["slots"][number]; readonly parts: readonly unknown[] }[] {
    return slotsOf(partOf(config), config).map((slot) => {
      const value = (config as unknown as Record<string, unknown>)[slot.key];
      return { slot, parts: slot.many ? (Array.isArray(value) ? value : [value]) : value === null || value === undefined ? [] : [value] };
    });
  }

  /**
   * The aims `config`'s actions name (`ActionConfig.aim`), each with its path: parts its tree
   * holds outside its slots, whose settings its actions' checks read (`actionFaults`).
   */
  function aimsOf(config: PartConfig, at: string): { readonly path: string; readonly aim: unknown }[] {
    const actions = (config as { readonly actions?: unknown }).actions;
    if (!Array.isArray(actions)) return [];
    return actions.flatMap((action: unknown, i) => {
      const aim = (action as { readonly aim?: unknown } | null)?.aim;
      return aim === undefined || aim === null ? [] : [{ path: `${at ? `${at}.` : ""}actions.${i}.aim`, aim }];
    });
  }

  /** Whether `value` is a part's config: an object with a kind that names a part. */
  const isPart = (value: unknown): value is PartConfig =>
    typeof value === "object" && value !== null && isKind((value as { kind?: unknown }).kind);

  /** Structural validity travels with a subtree's faults, so ancestor hooks may safely traverse its slots. */
  function treeValidation(config: PartConfig, provides: readonly Provision[], at: string, mind: string | null): { readonly formed: boolean; readonly faults: readonly string[] } {
    const where = (fault: string, path = at) => path ? `${path}: ${fault}` : fault;
    const kind = (value: unknown) => `no part of kind ${JSON.stringify((value as { kind?: unknown } | null)?.kind)}`;
    if (!isPart(config)) return { formed: false, faults: [where(kind(config))] };
    const of = mind ?? (partOf(config).role === "mind" ? config.kind : null);
    const slots: string[] = [];
    let formed = true;
    for (const { slot, parts } of held(config)) {
      const value = (config as unknown as Record<string, unknown>)[slot.key], path = at ? `${at}.${slot.key}` : slot.key;
      if (slot.many && !Array.isArray(value)) { formed = false; slots.push(where(`a list of ${slot.role} parts`, path)); continue; }
      if (!slot.many && parts.length === 0 && !slot.optional) { formed = false; slots.push(where(`a ${slot.role} part is needed`, path)); continue; }
      parts.forEach((child, i) => {
        const here = slot.many ? `${path}.${i}` : path;
        if (!isPart(child)) { formed = false; slots.push(where(kind(child), here)); }
        else if (partOf(child).role !== slot.role) { formed = false; slots.push(where(`a ${partOf(child).role} part cannot go where a ${slot.role} part goes`, here)); }
        else if (ownerOf(child.kind) !== null && ownerOf(child.kind) !== of) { formed = false; slots.push(where(`${partOf(child).label} is ${ownerOf(child.kind)}'s own part`, here)); }
        else {
          const checked = treeValidation(child, provides, here, of);
          formed = formed && checked.formed;
          slots.push(...checked.faults);
        }
      });
    }
    for (const { path, aim } of aimsOf(config, at))
      if (isPart(aim) && ownerOf(aim.kind) !== null && ownerOf(aim.kind) !== of) { formed = false; slots.push(where(`${partOf(aim).label} is ${ownerOf(aim.kind)}'s own part`, path)); }
    const screen = unprovided(partOf(config).needs, provides);
    return { formed, faults: [...(screen ? [where(screen)] : []), ...unknownSettings(config).map((fault) => where(fault)),
      ...(formed ? partOf(config).faults(config, partLookup).map((fault) => where(fault)) : []), ...slots] };
  }

  function treeKinds(config: PartConfig): readonly string[] {
    const kinds = new Set<string>();
    const visit = (one: PartConfig): void => {
      kinds.add(one.kind);
      for (const used of partOf(one).uses?.(one) ?? []) visit(used);
      for (const { slot, parts } of held(one)) {
        if (parts.length === 0 && slot.fallback) visit(slot.fallback);
        for (const child of parts) if (isPart(child)) visit(child);
      }
      for (const { aim } of aimsOf(one, "")) if (isPart(aim)) kinds.add(aim.kind);
    };
    visit(config);
    return [...kinds];
  }

  /**
   * The keys outside the config's complete type-checked shape, and outside its research tuning; a
   * part that states no keys (`Part.keys`) has that fault.
   */
  function unknownSettings(config: PartConfig): readonly string[] {
    const part = partOf(config), tuning = part.tuning ?? [];
    const known: unknown = part.keys;
    if (typeof known !== "object" || known === null) return [`${part.label} states none of its keys (Part.keys)`];
    const given = (config as { tuning?: unknown }).tuning;
    return [
      ...Object.keys(config).filter((key) => !Object.hasOwn(known as object, key)).map((key) => `${part.label} has no setting ${key}`),
      ...(part.tuning && typeof given === "object" && given !== null ? Object.keys(given).filter((key) => !tuning.includes(key)).map((key) => `${part.label} has no tuning ${key}`) : []),
    ];
  }

  function treeRefusal(spec: BodySpec, config: PartConfig, at = ""): string | null {
    const where = (reason: string) => at ? `${at}: ${reason}` : reason;
    const part = partOf(config), own = part.fits(spec, config, partLookup);
    if (own !== null) return where(own);
    for (const { slot, parts } of held(config)) {
      const path = at ? `${at}.${slot.key}` : slot.key;
      for (const [i, child] of parts.entries()) {
        const refused = treeRefusal(spec, child as PartConfig, slot.many ? `${path}.${i}` : path);
        if (refused !== null) return refused;
      }
    }
    return null;
  }

  /** **Why the tree `config` roots may not enter a scenario of `rules`** with a body of `spec`, a sentence, or null where it may. */
  function entryRefusal(spec: BodySpec, config: PartConfig, rules: readonly EntryRule[]): string | null {
    for (const rule of rules) switch (rule) {
      case "attacks": if (!attacks(spec, config)) return "it strikes with nothing the body has"; break;
      case "uses-held": if (!equipmentSupported(spec, config)) return "it has no use for something the body holds"; break;
      default: { const never: never = rule; throw new Error(`no entry rule ${String(never)}`); }
    }
    return null;
  }

  /** Every held item has a declared use somewhere in this mind's assembly. */
  function equipmentSupported(spec: BodySpec, config: PartConfig): boolean {
    const supported = new Set<string>();
    const collect = (one: PartConfig): void => {
      for (const segment of partOf(one).supportedEquipment?.(spec, one, partLookup) ?? []) supported.add(segment);
      for (const segment of partOf(one).strikes?.(spec, one, partLookup) ?? []) supported.add(segment);
      for (const slot of held(one)) for (const child of slot.parts) collect(child as PartConfig);
    };
    collect(config);
    return (spec.held ?? []).every(({ segment }) => supported.has(segment));
  }

  /** **Whether a body of `spec` can attack under the tree `config` roots**: a part of it strikes with some effector there (`Part.strikes`). */
  function attacks(spec: BodySpec, config: PartConfig): boolean {
    const strikes = (one: PartConfig): boolean => (partOf(one).strikes?.(spec, one, partLookup)?.length ?? 0) > 0
      || held(one).some((slot) => slot.parts.some((child) => isPart(child) && strikes(child)));
    return strikes(config);
  }

  function withoutTuning<C extends PartConfig>(config: C): C {
    const { tuning: _, ...rest } = config as C & { tuning?: unknown };
    const out: Record<string, unknown> = rest;
    for (const { slot } of held(config)) {
      const value = out[slot.key];
      if (Array.isArray(value)) out[slot.key] = value.map((child) => isPart(child) ? withoutTuning(child) : child);
      else if (isPart(value)) out[slot.key] = withoutTuning(value);
    }
    return out as C;
  }

  function replacedAt<C extends PartConfig>(config: C, path: string, value: unknown): C {
    const steps = path.split(".");
    /** What a step in the part config `at` may be: its part's slots and stated keys, beside its kind. */
    const keysOf = (at: PartConfig): string[] => {
      const part = partOf(at);
      return [...new Set([...slotsOf(part, at).map((slot) => slot.key), ...Object.keys(part.keys ?? {})])].filter((key) => key !== "kind");
    };
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
      const open = isPart(at) ? keysOf(at) : Object.keys(at);
      if (!open.includes(step)) throw new Error(`${holder} has no slot or setting ${step}: ${open.join(", ")}`);
      return { ...at, [step]: last ? value : walk((at as Record<string, unknown>)[step], k + 1, `${holder}.${step}`) };
    };
    return walk(config, 0, config.kind) as C;
  }

  return Object.freeze({
    get controllers() { return registered().controllers; },
    get presets() { return presetsOf(); },
    get minds() { return mindsOf(); },
    controllerOf,
    allParts: () => registered().parts,
    isKind,
    ownerOf,
    partOf,
    scriptedBy,
    takesScript: (config: MindConfig): config is FighterConfig => scriptedBy(config) !== null,
    partLookup,
    treeLookup(config: PartConfig): PartLookup {
      const named = new Set(treeKinds(config));
      return Object.freeze({
        of<R extends Role>(role: R, part: PartConfig): RoleParts[R] {
          if (!named.has(part.kind)) throw new Error(`${partOf(config).label} looks up ${part.kind}, a part its tree does not name`);
          return partLookup.of(role, part);
        },
      });
    },
    treeFaults: (config: PartConfig, provides: readonly Provision[] = NOTHING, at = "", mind: string | null = null): readonly string[] =>
      treeValidation(config, provides, at, mind).faults,
    treeKinds,
    treeObeys: (config: PartConfig): boolean => treeKinds(config).some((kind) => partOf({ kind }).obeys === true),
    phaseLabels: (config: PartConfig): Readonly<Record<string, string | null>> => Object.assign({}, ...treeKinds(config).map((kind) => partOf({ kind }).phases ?? {})),
    treeData(config: PartConfig): readonly DataKey[] {
      const keys = new Set<DataKey>();
      const visit = (one: PartConfig): void => {
        for (const key of partOf(one).reads?.(one) ?? []) keys.add(key);
        for (const { parts } of held(one)) for (const child of parts) if (isPart(child)) visit(child);
      };
      visit(config);
      return [...keys];
    },
    treeRefusal,
    stageRefusal: (spec: BodySpec, config: PartConfig, rules: readonly EntryRule[]): string | null =>
      treeRefusal(spec, config) ?? entryRefusal(spec, config, rules),
    withoutTuning,
    kindsFor: (role: Role, spec: BodySpec, provides: readonly Provision[] = NOTHING, mind: string | null = null): readonly Offered[] =>
      Object.entries(registered().parts).filter(([kind, part]) => part.role === role && (ownerOf(kind) === null || ownerOf(kind) === mind))
        .map(([kind, part]) => ({ kind, part, reason: treeRefusal(spec, part.defaults) ?? unprovided(part.needs, provides) })),
    replacedAt,
  });
}
