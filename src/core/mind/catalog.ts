import type { DataKey } from "../data/store.ts";
import type { BodySpec } from "../spec/body.ts";
import { BEHAVIOUR_PARTS } from "./behaviours.ts";
import type { BehaviourConfig, ExecutorConfig, ReflexConfig, SkillConfig, SubMindConfig, TacticsConfig } from "./config.ts";
import { CONTROLLERS } from "./controllers.ts";
import { EXECUTORS } from "./executors.ts";
import { CONFIG_KEYS } from "./config-keys.ts";
import { SKILL_PARTS } from "./fighter.ts";
import { LOCOMOTION_PARTS, type LocomotionConfig } from "./locomotions.ts";
import { MOVE_RULE_PARTS, type MoveRuleConfig } from "../skills/move-part.ts";
import { slotsOf, type Part, type PartConfig, type Provision, type Role } from "./parts.ts";
import { SUB_MIND_PARTS } from "./sub-minds.ts";
import { REFLEX_PARTS } from "./options/reflex.ts";
import { MOTOR_PARTS, type MotorConfig } from "../control/motors.ts";
import { TACTICS_PARTS } from "./tactics-of.ts";
import { NAVIGATIONS } from "./navigations.ts";
import type { PartLookup, RoleParts } from "./lookup.ts";
import type { NavigationConfig } from "./navigator.ts";

/** Every part's config below a mind, by kind. */
type AnyPart = MotorConfig | ReflexConfig | SubMindConfig | TacticsConfig | BehaviourConfig | MoveRuleConfig | LocomotionConfig | SkillConfig | ExecutorConfig | NavigationConfig;

/** A role's list by kind (`NAVIGATIONS`), each entry's kind its defaults': a thrown error for one that is not. */
function listed<L extends Readonly<Record<string, Part>>>(list: L): L {
  for (const [kind, part] of Object.entries(list)) if (part.defaults.kind !== kind) throw new Error(`the list names ${JSON.stringify(part.defaults.kind)} ${JSON.stringify(kind)}`);
  return list;
}

/** Every part, by its kind, and each mind's own part's mind (`Controller.parts`), by the part's kind. */
interface Registry {
  readonly parts: Readonly<Record<string, Part>>;
  readonly owners: Readonly<Record<string, string>>;
}

let registry: Registry | null = null;

/**
 * The registry, read once a realm on first use: the parts below a mind, each mind (`CONTROLLERS`)
 * and each mind's own parts. Read when first asked, never as the module loads, so a part's module
 * may use it whatever order the modules load in. A kind twice is refused.
 */
function registered(): Registry {
  if (registry) return registry;
  const below: { readonly [K in AnyPart["kind"]]: Part<Extract<AnyPart, { kind: K }>> } = { ...SUB_MIND_PARTS, ...TACTICS_PARTS, ...BEHAVIOUR_PARTS, ...MOVE_RULE_PARTS,
    ...LOCOMOTION_PARTS, ...SKILL_PARTS, ...listed(EXECUTORS), ...REFLEX_PARTS, ...MOTOR_PARTS, ...listed(NAVIGATIONS) };
  const parts: Record<string, Part> = { ...below }, owners: Record<string, string> = {};
  const add = (kind: string, part: Part, what: string) => {
    if (Object.hasOwn(parts, kind)) throw new Error(`${what} of kind ${JSON.stringify(kind)} is another part's`);
    parts[kind] = part;
  };
  for (const [kind, controller] of Object.entries(CONTROLLERS)) add(kind, controller, "a mind");
  for (const [kind, controller] of Object.entries(CONTROLLERS)) for (const own of controller.parts ?? []) {
    if (own.role === "mind") throw new Error(`${kind}'s own part ${JSON.stringify(own.defaults.kind)} is a mind`);
    add(own.defaults.kind, own, `${kind}'s own part`);
    owners[own.defaults.kind] = kind;
  }
  return registry = { parts: Object.freeze(parts), owners: Object.freeze(owners) };
}

/**
 * **Every part, by its kind**, across roles: the minds (`CONTROLLERS`), the parts below them and
 * each mind's own parts (`Controller.parts`), the one list a screen offers a slot's choices from.
 */
export const allParts = (): Readonly<Record<string, Part>> => registered().parts;

/** Whether `kind` names a part (`allParts`). */
export const isKind = (kind: unknown): kind is string => typeof kind === "string" && Object.hasOwn(registered().parts, kind);

/** The mind whose own part `kind` is (`Controller.parts`), or null for a part any mind may hold. */
export const ownerOf = (kind: string): string | null => registered().owners[kind] ?? null;

/** The part of `config`'s kind; a thrown error for a kind no part has, read from a save or a link. */
export function partOf<C extends PartConfig>(config: C): Part<C> {
  const part = isKind(config.kind) ? registered().parts[config.kind] : undefined;
  if (!part) throw new Error(`no part of kind ${JSON.stringify(config.kind)}`);
  return part as Part<C>;
}

/**
 * **Every part by kind, looked up by role** (`PartLookup`): each config's part (`partOf`), a
 * mind's own parts included, refused where the kind is of another role.
 */
export const partLookup: PartLookup = Object.freeze({
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

/** Whether `value` is a part's config: an object with a kind that names a part. */
const isPart = (value: unknown): value is PartConfig =>
  typeof value === "object" && value !== null && isKind((value as { kind?: unknown }).kind);

/** What a screen that gives nothing beyond the body and the world provides. */
const NOTHING: readonly Provision[] = Object.freeze([]);

/** Why a part that `needs` something cannot run on a screen that `provides` what it does, or null. */
const unprovided = (needs: Provision | undefined, provides: readonly Provision[]): string | null =>
  needs === undefined || provides.includes(needs) ? null : `this screen gives no ${needs}`;

/**
 * **What is wrong with the tree `config` roots** on a screen that `provides` what it does, each a
 * sentence. A part's own faults come first, then each slot's, each prefixed with where it is
 * (`subs.0: `). A part the screen cannot run (`Part.needs`), a slot that holds what is no part, a
 * part of another role, another mind's own part (`Controller.parts`), or nothing where it must
 * hold one is a fault; a part's own faults (`Part.faults`) are read only once every slot holds
 * parts of its role. `mind` is the kind of the mind the tree is of: the root's, where it is a mind.
 */
export function treeFaults(config: PartConfig, provides: readonly Provision[] = NOTHING, at = "", mind: string | null = null): readonly string[] {
  const where = (fault: string, path = at) => path ? `${path}: ${fault}` : fault;
  const kind = (value: unknown) => `no part of kind ${JSON.stringify((value as { kind?: unknown } | null)?.kind)}`;
  if (!isPart(config)) return [where(kind(config))];
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
      else slots.push(...treeFaults(child, provides, here, of));
    });
  }
  const screen = unprovided(partOf(config).needs, provides);
  return [...(screen ? [where(screen)] : []), ...unknownSettings(config).map((fault) => where(fault)), ...(formed ? partOf(config).faults(config, partLookup).map((fault) => where(fault)) : []), ...slots];
}

/** **Every kind of part in the tree `config` roots**, the root's included, each once: what a case's code holds the parts' own code of (`caseCoder`). */
export function treeKinds(config: PartConfig): readonly string[] {
  const kinds = new Set<string>();
  const visit = (one: PartConfig): void => {
    kinds.add(one.kind);
    for (const { parts } of held(one)) for (const child of parts) if (isPart(child)) visit(child);
  };
  visit(config);
  return [...kinds];
}

/** **The mind data `config`'s parts read** (`Part.reads`), every key once: what a screen loads (`loadData`) before it builds the mind. */
export function treeData(config: PartConfig): readonly DataKey[] {
  const keys = new Set<DataKey>();
  const visit = (one: PartConfig): void => {
    for (const key of partOf(one).reads?.(one) ?? []) keys.add(key);
    for (const { parts } of held(one)) for (const child of parts) if (isPart(child)) visit(child);
  };
  visit(config);
  return [...keys];
}

/**
 * The keys outside the config's complete type-checked shape, and outside its research tuning.
 */
function unknownSettings(config: PartConfig): readonly string[] {
  const part = partOf(config), tuning = part.tuning ?? [];
  const known = part.keys ?? CONFIG_KEYS[config.kind as keyof typeof CONFIG_KEYS];
  const given = (config as { tuning?: unknown }).tuning;
  return [
    ...Object.keys(config).filter((key) => !Object.hasOwn(known, key)).map((key) => `${part.label} has no setting ${key}`),
    ...(part.tuning && typeof given === "object" && given !== null ? Object.keys(given).filter((key) => !tuning.includes(key)).map((key) => `${part.label} has no tuning ${key}`) : []),
  ];
}

/**
 * **Why a body of `spec` cannot carry out what the tree `config` roots commands**, prefixed with
 * where (`subs.0: `), or null where it can: the first part that refuses it (`Part.fits`), or a mind
 * with no use for something the body holds (`equipmentSupported`) or no way to strike (`canAttack`).
 */
export function treeRefusal(spec: BodySpec, config: PartConfig, at = ""): string | null {
  const where = (reason: string) => at ? `${at}: ${reason}` : reason;
  const part = partOf(config), own = part.fits(spec, config, partLookup);
  if (own !== null) return where(own);
  if (part.role === "mind" && !equipmentSupported(spec, config)) return where("it has no use for something the body holds");
  if (part.role === "mind" && !canAttack(spec, config)) return where("it strikes with nothing the body has");
  for (const { slot, parts } of held(config)) {
    const path = at ? `${at}.${slot.key}` : slot.key;
    for (const [i, child] of parts.entries()) {
      const refused = treeRefusal(spec, child as PartConfig, slot.many ? `${path}.${i}` : path);
      if (refused !== null) return refused;
    }
  }
  return null;
}

/** Whether a body of `spec` can carry out what every part of the tree `config` roots commands (`treeRefusal`). */
export const treeFits = (spec: BodySpec, config: PartConfig): boolean => treeRefusal(spec, config) === null;

/** Every held item has a declared use somewhere in this mind's assembly. */
export function equipmentSupported(spec: BodySpec, config: PartConfig): boolean {
  const supported = new Set<string>();
  const collect = (one: PartConfig): void => {
    for (const segment of partOf(one).supportedEquipment?.(spec, one, partLookup) ?? []) supported.add(segment);
    for (const segment of partOf(one).strikes?.(spec, one, partLookup) ?? []) supported.add(segment);
    for (const slot of held(one)) for (const child of slot.parts) collect(child as PartConfig);
  };
  collect(config);
  return (spec.held ?? []).every(({ segment }) => supported.has(segment));
}

/**
 * **Whether a body of `spec` can attack under the tree `config` roots**: a part of it strikes with
 * some effector there (`Part.strikes`). A tree none of whose parts names a blow of its own is no
 * fighting mind's (direct control, a fighter given no actions), and is not held to it.
 */
export function canAttack(spec: BodySpec, config: PartConfig): boolean {
  let fighting = false;
  const strikes = (one: PartConfig): boolean => {
    const own = partOf(one).strikes?.(spec, one, partLookup);
    if (own !== undefined) { fighting = true; if (own.length > 0) return true; }
    return held(one).some((slot) => slot.parts.some((child) => strikes(child as PartConfig)));
  };
  return strikes(config) || !fighting;
}

/** The tree `config` roots with every part's `tuning` left out: what a person's settings are, and what a link carries. */
export function withoutTuning<C extends PartConfig>(config: C): C {
  const { tuning: _, ...rest } = config as C & { tuning?: unknown };
  const out: Record<string, unknown> = rest;
  for (const { slot } of held(config)) {
    const value = out[slot.key];
    if (Array.isArray(value)) out[slot.key] = value.map((child) => isPart(child) ? withoutTuning(child) : child);
    else if (isPart(value)) out[slot.key] = withoutTuning(value);
  }
  return out as C;
}

/** A kind a slot may be set to, with the reason it cannot go there for this body and screen, or null. */
interface Offered {
  readonly kind: string;
  readonly part: Part;
  readonly reason: string | null;
}

/**
 * **Every part of `role`** a slot of a mind of kind `mind` may hold, in the list's order, each with
 * why it cannot go there for a body of `spec` on a screen that `provides` what it does, or null:
 * the parts any mind may hold and the mind's own (`Controller.parts`). None of those is left out.
 */
export function kindsFor(role: Role, spec: BodySpec, provides: readonly Provision[] = NOTHING, mind: string | null = null): readonly Offered[] {
  return Object.entries(allParts()).filter(([kind, part]) => part.role === role && (ownerOf(kind) === null || ownerOf(kind) === mind))
    .map(([kind, part]) => ({ kind, part, reason: treeRefusal(spec, part.defaults) ?? unprovided(part.needs, provides) }));
}
