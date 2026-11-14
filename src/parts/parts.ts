/** Requirement owners extend this map beside the capability that satisfies them. */
export interface Requirements {}
export type Requirement = keyof Requirements;

import type { DataKey } from "../core/data/store.ts";
import type { BodySpec } from "../core/bodies/spec/body.ts";
import type { Edited } from "./fields.ts";
import type { PartLookup, RoleParts } from "./lookup.ts";

/**
 * **What a part does in the mind it is part of**: the interface it carries out, one of those the
 * part lookup knows (`RoleParts`, which a package with roles of its own augments). A slot names
 * the role of what it holds, and holds only a part of that role.
 */
export type Role = keyof RoleParts & string;

/** Whether a part belongs to the game or experimental research. */
type Stage = "game" | "experimental";

/** **A part's config**: plain data, its kind naming the part. */
export interface PartConfig { readonly kind: string }

/**
 * **A slot**: a key of a part's config that holds another part of `role` (`many`: a ranked list of
 * them), plain data under the key. A slot that is `optional` may hold null, and then runs what
 * its part supplies in its place (`Part.supplies`), or nothing.
 */
export interface Slot {
  readonly key: string;
  readonly label: string;
  readonly role: Role;
  readonly many: boolean;
  readonly optional: boolean;
  /**
   * A skill (`slotSkill`): a part in it that a body cannot use (`Part.fits`) is left out on that
   * body, and what holds it with it, not a refusal of the part holding it.
   */
  readonly skills?: boolean;
}

/**
 * **A part a part runs that its config does not say** (`Part.supplies`): one of `role`, as
 * `config`. With `slot`, it is what that slot runs where it holds nothing, which a person is
 * shown as the slot's default.
 */
export interface Supplied {
  readonly role: Role;
  readonly config: PartConfig;
  readonly slot?: string;
}

/**
 * **A kind of part**: what every part has, whatever its role. What it is; the config it takes;
 * the parts that config holds; whether a body fits it and what is wrong with a config of it; and
 * the data it reads. What the mind editor shows of it is beside (`Edited`). What a part of one
 * role does more is in that role's own type (`ExecutorPart`, `GuardPart`, `OptionPart`,
 * `Controller` and the rest of `RoleParts`), its maker included.
 */
export interface Part<C extends PartConfig = PartConfig> extends Edited<C> {
  // What it is.
  readonly role: Role;
  /** What a person calls it. */
  readonly label: string;
  readonly stage: Stage;

  // Its config.
  /** The config a slot set to this kind takes. */
  readonly defaults: C;
  /** The keys a config of it may hold (`KeysOf`): a key outside them is a fault (`treeFaults`). */
  readonly keys: Readonly<Record<string, true>>;
  /** The keys of the research tuning a config of it may carry (`tuning`); none, it carries none. */
  readonly tuning?: readonly string[];
  /**
   * **A skill's variations** by name (`Variations`): a part with them is a skill a character
   * chooses (`BodySpec.skills`), and a body runs only those its character holds (`variationFault`).
   */
  readonly variations?: readonly string[];
  /** The heading under which a skill is offered in the character editor. */
  readonly skillGroup?: string;

  // The parts its config holds (`heldBy`).
  readonly slots: readonly Slot[];
  /** Configured parts outside its slots, each with its role and where it is in the config. */
  children?(config: C): readonly { readonly path: readonly (string | number)[]; readonly role: Role; readonly config: unknown }[];
  /**
   * The parts it runs that `config` does not say (`Supplied`): what an empty slot runs, a default
   * where the config names none, and each part it picks among by the body. This is the one place
   * a part says so. It answers for them itself (`fits`, `faults`); a walk of the tree reads their
   * code, their data and what they require (`eachPart`).
   */
  supplies?(config: C, parts: PartLookup): readonly Supplied[];

  // Its checks.
  /** Physical facts the configured motor must publish before this part can execute. */
  readonly requires?: readonly Requirement[];
  /**
   * Whether a body of `spec` can carry out what a part of `config` commands: null where it can,
   * otherwise why not, a sentence. The one source of a part's compatibility: construction, the
   * pickers and evaluation read it (`fitRefusal`). `parts` looks up the parts `config` names.
   */
  fits(spec: BodySpec, config: C, parts: PartLookup): string | null;
  /**
   * What is wrong with `config` itself, each a sentence, a fault found at a slot prefixed with its
   * key (`blow: `). Its slots' parts answer for their own; it is asked only once every descendant slot holds parts of its role and owner.
   */
  faults(config: C, parts: PartLookup): readonly string[];

  // The data it reads.
  /** The mind data a part of `config` reads when built (`dataOf`); none where absent. Its slots' parts answer for their own (`treeData`). */
  reads?(config: C): readonly DataKey[];
  /** Data compatibility checks read before construction: loaded before a screen offers this part. */
  readonly fitReads?: readonly DataKey[];
}

/** Every key of `C`, each `true`: the keys a config of it may hold, a key missing or extra refused by the compiler. */
export type KeysOf<C> = { readonly [P in keyof C]-?: true };

/** A slot of a ranked list of parts of `role`. */
export const slotList = (key: string, label: string, role: Role): Slot => Object.freeze({ key, label, role, many: true, optional: true });

/** A slot of one skill of `role`, used on a body that can use it (`Slot.skills`). */
export const slotSkill = (key: string, label: string, role: Role): Slot => Object.freeze({ key, label, role, many: false, optional: false, skills: true });

/** A slot of one part of `role`, or of none where it is `optional`. */
export const slotOne = (key: string, label: string, role: Role, optional = false): Slot => Object.freeze({ key, label, role, many: false, optional });

/** A part's `fits` for every body. Each of these is a function declaration, which a module that imports it in a cycle can call as it loads. */
export function anyBody(): string | null {
  return null;
}

/** A part's `fits` for a body `test` passes, refusing any other for `reason`. */
export function fitsWhen<C = PartConfig>(test: (spec: BodySpec, config: C, parts: PartLookup) => boolean, reason: string): (spec: BodySpec, config: C, parts: PartLookup) => string | null {
  return (spec, config, parts) => test(spec, config, parts) ? null : reason;
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
