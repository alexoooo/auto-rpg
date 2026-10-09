import type { BodySpec } from "../spec/body.ts";
import type { MindConfig, SkillConfig, SubMindConfig, TacticsConfig } from "./config.ts";
import { CONTROLLERS } from "./controllers.ts";
import { SKILL_PARTS } from "./fighter.ts";
import type { Part, PartConfig, Role } from "./parts.ts";
import { SUB_MIND_PARTS } from "./sub-minds.ts";
import { TACTICS_PARTS } from "./tactics-of.ts";

/** Every part's config, by kind. */
type AnyPart = MindConfig | SubMindConfig | TacticsConfig | SkillConfig;

/**
 * **Every part, by its kind**, across roles: the one list a screen offers a slot's choices from.
 * A kind without an entry does not compile.
 */
export const PARTS: { readonly [K in AnyPart["kind"]]: Part<Extract<AnyPart, { kind: K }>> } = Object.freeze({ ...CONTROLLERS, ...SUB_MIND_PARTS, ...TACTICS_PARTS, ...SKILL_PARTS });

/** The part of `config`'s kind; a thrown error for a kind no part has, read from a save or a link. */
export function partOf<C extends PartConfig>(config: C): Part<C> {
  const part = Object.hasOwn(PARTS, config.kind) ? (PARTS as Readonly<Record<string, unknown>>)[config.kind] : undefined;
  if (!part) throw new Error(`no part of kind ${JSON.stringify(config.kind)}`);
  return part as Part<C>;
}

/** What each slot of `config` holds, by the slot, as a list: a single slot's part or none, or a list slot's parts. */
function held(config: PartConfig): { readonly slot: Part["slots"][number]; readonly parts: readonly unknown[] }[] {
  return partOf(config).slots.map((slot) => {
    const value = (config as unknown as Record<string, unknown>)[slot.key];
    return { slot, parts: slot.many ? (Array.isArray(value) ? value : [value]) : value === null || value === undefined ? [] : [value] };
  });
}

/** Whether `value` is a part's config: an object with a kind that names a part. */
const isPart = (value: unknown): value is PartConfig =>
  typeof value === "object" && value !== null && typeof (value as { kind?: unknown }).kind === "string" && Object.hasOwn(PARTS, (value as PartConfig).kind);

/**
 * **What is wrong with the tree `config` roots**, each a sentence. A part's own faults come first,
 * then each slot's, each prefixed with where it is (`subs.0: `). A slot that holds what is no part,
 * a part of another role, or nothing where it must hold one is a fault; a part's own faults
 * (`Part.faults`) are read only once every slot holds parts of its role.
 */
export function treeFaults(config: PartConfig, at = ""): readonly string[] {
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
      else slots.push(...treeFaults(child, here));
    });
  }
  return [...(formed ? partOf(config).faults(config).map((fault) => where(fault)) : []), ...slots];
}

/** Whether a body of `spec` can carry out what every part of the tree `config` roots commands. */
export function treeFits(spec: BodySpec, config: PartConfig): boolean {
  return partOf(config).fits(spec, config) && held(config).every(({ parts }) => parts.every((child) => treeFits(spec, child as PartConfig)));
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

/** **Every part of `role`**, in the list's order, each with why it cannot go in a slot of a body of `spec`, or null. None is left out. */
export function kindsFor(role: Role, spec: BodySpec): readonly Offered[] {
  return Object.entries(PARTS as Readonly<Record<string, Part>>).filter(([, part]) => part.role === role)
    .map(([kind, part]) => ({ kind, part, reason: treeFits(spec, part.defaults) ? null : "does not fit this body" }));
}
