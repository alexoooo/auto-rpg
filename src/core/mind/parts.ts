import type { BodySpec } from "../spec/body.ts";
import type { PartField } from "./fields.ts";

/**
 * **What a part does in the mind it is part of**: the interface it carries out. A slot names the
 * role of what it holds, and holds only a part of that role.
 */
export type Role = "mind" | "sub-mind" | "tactics" | "behaviour" | "locomotion" | "guard" | "blow" | "kick" | "support";

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
  /** What a screen must give a mind for this part to run, if anything. */
  readonly needs?: Provision;
  /** Whether a body of `spec` can carry out what a part of `config` commands. */
  fits(spec: BodySpec, config: C): boolean;
  /**
   * What is wrong with `config` itself, each a sentence, a fault found at a slot prefixed with its
   * key (`blow: `). Its slots' parts answer for their own; it is asked only once each slot holds parts of its role.
   */
  faults(config: C): readonly string[];
}

/** A slot of a ranked list of parts of `role`. */
export const slotList = (key: string, label: string, role: Role): Slot => Object.freeze({ key, label, role, many: true, optional: true });

/** A slot of one part of `role`, or of none where it is `optional`. */
export const slotOne = (key: string, label: string, role: Role, optional = false): Slot => Object.freeze({ key, label, role, many: false, optional });

/** The slots `config` of `part` has: those it says it has by what it holds (`Part.slotsFor`), or all of its slots. */
export const slotsOf = <C extends PartConfig>(part: Part<C>, config: C): readonly Slot[] => part.slotsFor?.(config) ?? part.slots;
