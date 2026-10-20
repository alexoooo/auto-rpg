import type { BodySpec } from "../spec/body.ts";
import { BEHAVIOUR_PARTS } from "./behaviours.ts";
import type { BehaviourConfig, ExecutorConfig, MotorConfig, MoveRuleConfig, ReflexConfig, SkillConfig, SubMindConfig, TacticsConfig } from "./config.ts";
import { CONTROLLERS } from "./controllers.ts";
import { EXECUTOR_PARTS } from "./executor-parts.ts";
import { CONFIG_KEYS } from "./config-keys.ts";
import { MOVE_RULE_PARTS, SKILL_PARTS } from "./fighter.ts";
import { slotsOf, type Part, type PartConfig, type Provision, type Role } from "./parts.ts";
import { SUB_MIND_PARTS } from "./sub-minds.ts";
import { REFLEX_PARTS } from "./options/reflex.ts";
import { MOTOR_PARTS } from "../control/motors.ts";
import { TACTICS_PARTS } from "./tactics-of.ts";
import { NAVIGATION_PARTS, type NavigationConfig } from "./navigation.ts";

/** Every part's config below a mind, by kind. */
type AnyPart = MotorConfig | ReflexConfig | SubMindConfig | TacticsConfig | BehaviourConfig | MoveRuleConfig | SkillConfig | ExecutorConfig | NavigationConfig;

/** Every part below a mind, by its kind. A kind without an entry does not compile. */
const BELOW: { readonly [K in AnyPart["kind"]]: Part<Extract<AnyPart, { kind: K }>> } = { ...SUB_MIND_PARTS, ...TACTICS_PARTS, ...BEHAVIOUR_PARTS, ...MOVE_RULE_PARTS, ...SKILL_PARTS, ...EXECUTOR_PARTS, ...REFLEX_PARTS, ...MOTOR_PARTS, ...NAVIGATION_PARTS };

/**
 * **Every part, by its kind**, across roles: the minds (`CONTROLLERS`) and the parts below them,
 * the one list a screen offers a slot's choices from. A mind of a kind a part below has is refused.
 */
export const PARTS: Readonly<Record<string, Part>> = Object.freeze(Object.assign({}, BELOW, ...Object.keys(CONTROLLERS).map((kind) => {
  if (Object.hasOwn(BELOW, kind)) throw new Error(`a mind of kind ${JSON.stringify(kind)} is a part's`);
  return { [kind]: CONTROLLERS[kind] };
})));

/** The part of `config`'s kind; a thrown error for a kind no part has, read from a save or a link. */
export function partOf<C extends PartConfig>(config: C): Part<C> {
  const part = Object.hasOwn(PARTS, config.kind) ? PARTS[config.kind] : undefined;
  if (!part) throw new Error(`no part of kind ${JSON.stringify(config.kind)}`);
  return part as Part<C>;
}

/** What each slot of `config` holds, by the slot, as a list: a single slot's part or none, or a list slot's parts. */
function held(config: PartConfig): { readonly slot: Part["slots"][number]; readonly parts: readonly unknown[] }[] {
  return slotsOf(partOf(config), config).map((slot) => {
    const value = (config as unknown as Record<string, unknown>)[slot.key];
    return { slot, parts: slot.many ? (Array.isArray(value) ? value : [value]) : value === null || value === undefined ? [] : [value] };
  });
}

/** Whether `value` is a part's config: an object with a kind that names a part. */
const isPart = (value: unknown): value is PartConfig =>
  typeof value === "object" && value !== null && typeof (value as { kind?: unknown }).kind === "string" && Object.hasOwn(PARTS, (value as PartConfig).kind);

/** What a screen that gives nothing beyond the body and the world provides. */
const NOTHING: readonly Provision[] = Object.freeze([]);

/** Why a part that `needs` something cannot run on a screen that `provides` what it does, or null. */
const unprovided = (needs: Provision | undefined, provides: readonly Provision[]): string | null =>
  needs === undefined || provides.includes(needs) ? null : `this screen gives no ${needs}`;

/**
 * **What is wrong with the tree `config` roots** on a screen that `provides` what it does, each a
 * sentence. A part's own faults come first, then each slot's, each prefixed with where it is
 * (`subs.0: `). A part the screen cannot run (`Part.needs`), a slot that holds what is no part, a
 * part of another role, or nothing where it must hold one is a fault; a part's own faults
 * (`Part.faults`) are read only once every slot holds parts of its role.
 */
export function treeFaults(config: PartConfig, provides: readonly Provision[] = NOTHING, at = ""): readonly string[] {
  const where = (fault: string, path = at) => path ? `${path}: ${fault}` : fault;
  const kind = (value: unknown) => `no part of kind ${JSON.stringify((value as { kind?: unknown } | null)?.kind)}`;
  if (!isPart(config)) return [where(kind(config))];
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
      else slots.push(...treeFaults(child, provides, here));
    });
  }
  const screen = unprovided(partOf(config).needs, provides);
  return [...(screen ? [where(screen)] : []), ...unknownSettings(config).map((fault) => where(fault)), ...(formed ? partOf(config).faults(config).map((fault) => where(fault)) : []), ...slots];
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

/** Whether a body of `spec` can carry out what every part of the tree `config` roots commands. */
export function treeFits(spec: BodySpec, config: PartConfig): boolean {
  const part = partOf(config);
  return part.fits(spec, config) && (part.role !== "mind" || equipmentSupported(spec, config) && canAttack(spec, config))
    && held(config).every(({ parts }) => parts.every((child) => treeFits(spec, child as PartConfig)));
}

/** Every held item has a declared use somewhere in this mind's assembly. */
export function equipmentSupported(spec: BodySpec, config: PartConfig): boolean {
  const supported = new Set<string>();
  const collect = (one: PartConfig): void => {
    for (const segment of partOf(one).supportedEquipment?.(spec, one) ?? []) supported.add(segment);
    for (const segment of partOf(one).strikes?.(spec, one) ?? []) supported.add(segment);
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
    const own = partOf(one).strikes?.(spec, one);
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
 * **Every part of `role`**, in the list's order, each with why it cannot go in a slot of a body of
 * `spec` on a screen that `provides` what it does, or null. None is left out.
 */
export function kindsFor(role: Role, spec: BodySpec, provides: readonly Provision[] = NOTHING): readonly Offered[] {
  return Object.entries(PARTS).filter(([, part]) => part.role === role)
    .map(([kind, part]) => ({ kind, part, reason: treeFits(spec, part.defaults) ? unprovided(part.needs, provides) : "does not fit this body" }));
}
