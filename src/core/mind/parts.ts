import { commandRefusal } from "../body.ts";
import type { DataKey } from "../data/store.ts";
import type { BodySpec } from "../spec/body.ts";
import type { PartField } from "./fields.ts";
import type { PartLookup } from "./lookup.ts";

/**
 * **What a part does in the mind it is part of**: the interface it carries out. A slot names the
 * role of what it holds, and holds only a part of that role.
 */
export type Role = "mind" | "sub-mind" | "technique" | "tactics" | "behaviour" | "move-rule" | "navigation" | "locomotion" | "guard" | "executor" | "support" | "reflex" | "motor" | "balance" | "aim" | "support-motor" | "gait" | "bite" | "quadruped-tactics";

/** What a screen gives a mind beyond the body and the world: the Lab gives its scenario's script (`MindWiring.script`). */
export type Provision = "script";

/** Whether a part is the game's, or research offered beside it: either is shown and may be chosen. */
type Stage = "game" | "experimental";

/** **A part's config**: plain data, its kind naming the part. */
export interface PartConfig { readonly kind: string }

/**
 * **A slot**: a key of a part's config that holds another part of `role` (`many`: a ranked list of
 * them), plain data under the key. A slot that is `optional` may hold null.
 */
export interface Slot {
  readonly key: string;
  readonly label: string;
  readonly role: Role;
  readonly many: boolean;
  readonly optional: boolean;
  /** What a person is shown where an optional slot holds none: "None" unless it says. */
  readonly absent?: string;
}

/**
 * **A kind of part**: its role, what a person calls it, its stage, the settings a person may change
 * and the slots it has, the config it starts from when chosen, which bodies it fits and what is
 * wrong with a config of it. A part is made by its role's module; this is what every screen
 * shows of it.
 */
export interface Part<C extends PartConfig = PartConfig> {
  readonly role: Role;
  readonly label: string;
  readonly stage: Stage;
  readonly fields: readonly PartField<C>[];
  readonly slots: readonly Slot[];
  /** The slots a config of it has where they depend on what it holds: a subset of `slots`, or all of them where absent (`slotsOf`). */
  slotsFor?(config: C): readonly Slot[];
  /** The config a slot set to this kind takes. */
  readonly defaults: C;
  /** The keys a config of it may hold (`KeysOf`): a key outside them is a fault (`treeFaults`). */
  readonly keys: Readonly<Record<string, true>>;
  /** The keys of the research tuning a config of it may carry (`tuning`); none, it carries none. */
  readonly tuning?: readonly string[];
  /** What a screen must give a mind for this part to run, if anything. */
  readonly needs?: Provision;
  /**
   * Whether a body of `spec` can carry out what a part of `config` commands: null where it can,
   * otherwise why not, a sentence. The one source of a part's compatibility: construction, the
   * pickers and evaluation read it (`treeRefusal`). `parts` looks up the parts `config` names.
   */
  fits(spec: BodySpec, config: C, parts: PartLookup): string | null;
  /** Held segments this part uses safely: striking, covering or another declared equipment use. */
  supportedEquipment?(spec: BodySpec, config: C, parts: PartLookup): readonly string[];
  /**
   * The effectors its blows strike with on a body of `spec`, as it holds what it holds, or
   * undefined where `config` names no blow of its own: what a scenario that asks an attack reads
   * (`EntryRule` `attacks`), and each segment it names a declared use of what that segment holds.
   */
  strikes?(spec: BodySpec, config: C, parts: PartLookup): readonly string[] | undefined;
  /**
   * What is wrong with `config` itself, each a sentence, a fault found at a slot prefixed with its
   * key (`blow: `). Its slots' parts answer for their own; it is asked only once each slot holds parts of its role.
   */
  faults(config: C, parts: PartLookup): readonly string[];
  /** The mind data a part of `config` reads when built (`dataOf`); none where absent. Its slots' parts answer for their own (`treeData`). */
  reads?(config: C): readonly DataKey[];
  /**
   * What a person is shown for each phase it reports (`Tactics.engagement`'s `phase`, or the
   * name of a sub-mind that has the body), by the phase's name: a label, or null for a phase a feed
   * leaves unsaid because what it does shows itself (an attack, as its action). A phase no part
   * names is shown as its own name (`phaseLabels`).
   */
  readonly phases?: Readonly<Record<string, string | null>>;
  /** Whether it carries out a person's `Orders`: a mind whose tree holds no part that does plays as its own while a person leads its side (`treeObeys`). */
  readonly obeys?: boolean;
}

/** Every key of `C`, each `true`: the keys a config of it may hold, a key missing or extra refused by the compiler. */
export type KeysOf<C> = { readonly [P in keyof C]-?: true };

/** Parts by the kind of their defaults: what a role's list of its kinds is (`partsByKind`). */
export type ByKind<P extends { readonly defaults: PartConfig }> = { readonly [E in P as E["defaults"]["kind"]]: E };

/** The config of every part a list by kind holds (`ByKind`): the union a role's slot takes. */
export type ConfigOf<R> = { [K in keyof R]: R[K] extends { readonly defaults: infer C } ? C : never }[keyof R];

/**
 * **A role's kinds**: `parts` by the kind of their defaults, in their order, frozen; a thrown error
 * for a kind twice. An implementation is its own module and a line in its role's list.
 */
export function partsByKind<P extends { readonly defaults: PartConfig }>(parts: readonly P[]): ByKind<P> {
  const byKind: Record<string, P> = {};
  for (const part of parts) {
    if (Object.hasOwn(byKind, part.defaults.kind)) throw new Error(`two parts of kind ${JSON.stringify(part.defaults.kind)}`);
    byKind[part.defaults.kind] = part;
  }
  return Object.freeze(byKind) as unknown as ByKind<P>;
}

/** A slot of a ranked list of parts of `role`. */
export const slotList = (key: string, label: string, role: Role): Slot => Object.freeze({ key, label, role, many: true, optional: true });

/** A slot of one part of `role`, or of none where it is `optional`. */
export const slotOne = (key: string, label: string, role: Role, optional = false, absent?: string): Slot =>
  Object.freeze({ key, label, role, many: false, optional, ...(absent === undefined ? {} : { absent }) });

/** The slots `config` of `part` has: those it says it has by what it holds (`Part.slotsFor`), or all of its slots. */
export const slotsOf = <C extends PartConfig>(part: Part<C>, config: C): readonly Slot[] => part.slotsFor?.(config) ?? part.slots;

/** A part's `fits` for every body. Each of these is a function declaration, which a module that imports it in a cycle can call as it loads. */
export function anyBody(): string | null {
  return null;
}

/** A part's `fits` for a body `test` passes, refusing any other for `reason`. */
export function fitsWhen<C = PartConfig>(test: (spec: BodySpec, config: C, parts: PartLookup) => boolean, reason: string): (spec: BodySpec, config: C, parts: PartLookup) => string | null {
  return (spec, config, parts) => test(spec, config, parts) ? null : reason;
}

/**
 * A mind's `fits` for a body that takes the game's commands: what the command layer lacks of it
 * (`commandRefusal`), or null. A part below such a mind fits by what it uses itself.
 */
export function takesCommands(spec: BodySpec): string | null {
  return commandRefusal(spec);
}

/** A part's `fits` for a body with one of `effectors` at least: what an executor strikes with. */
export function strikesWithOneOf(...effectors: readonly string[]): (spec: BodySpec) => string | null {
  return (spec) => effectors.some((name) => spec.effectors?.some((effector) => effector.segment === name)) ? null : `needs ${effectors.join(" or ")} to strike with`;
}

/** A part's `fits` that refuses where the first of `fits` refuses, for its reason. */
export function fitsAll<C = PartConfig>(...fits: readonly ((spec: BodySpec, config: C, parts: PartLookup) => string | null)[]): (spec: BodySpec, config: C, parts: PartLookup) => string | null {
  return (spec, config, parts) => {
    for (const one of fits) {
      const refused = one(spec, config, parts);
      if (refused !== null) return refused;
    }
    return null;
  };
}
