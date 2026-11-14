import type { Part, PartConfig, Role } from "./parts.ts";
import type { BodySpec } from "../core/bodies/spec/body.ts";

/**
 * **Each role's kind of part**: what a lookup of the role gives (`PartLookup.of`), its maker
 * included where the role's parts make themselves. Each role augments this interface beside its
 * contract, so the lookup depends on no role's owner.
 */
export interface RoleParts {}

/**
 * **Each role's configs, by kind** (`GuardConfigs`, `AimConfigs`): the map every part of the role
 * adds its config to, beside the part. A role adds its map here where the map is declared.
 */
export interface RoleConfigs {}

/** **The config of a part an entrant registers**: its kind carries the entrant's name (`scopeOf`), which no toolkit kind does. */
interface EntrantConfig { readonly kind: `${string}:${string}` }

/**
 * **The config a slot of `role` holds**: one of the kinds the role's parts register
 * (`RoleConfigs`), or an entrant's part (`EntrantConfig`). A kind that is neither fails to compile.
 */
export type ConfigFor<R extends keyof RoleConfigs> = RoleConfigs[R][keyof RoleConfigs[R]] | EntrantConfig;

/**
 * **The parts a tree may name, by kind** (`partLookup`, `catalog.ts`): what a part whose checks
 * read the parts it names is handed (`Part.fits`, `Part.faults`), and what a mind's host hands
 * its maker (`BodyHost.parts`) for every assembly that builds a part. No part's module reads the
 * registry: it is handed this, so the part a config names, a mind's own included, is the part used.
 */
export interface PartLookup {
  /** The part `config` names; a thrown error where no part has its kind or the part is not of `role`. */
  of<R extends Role>(role: R, config: PartConfig): RoleParts[R];
  /** The part `value` names, whatever its role; null where it is no part's config. */
  any(value: unknown): Part | null;
  /** The part `value` names where it is the config of a part of `role`; null where it is not, as a tree with a fault may hold (`eachPart`). */
  find<R extends Role>(role: R, value: unknown): RoleParts[R] | null;
  /**
   * **A single service fitted to a body**: enabled skill variations and game infrastructure that
   * fit `spec`, without preference between skill stages. None or several returns a refusal;
   * repertoires with several choices use `selected` instead.
   */
  fitting<R extends Role & keyof RoleConfigs>(role: R, spec: BodySpec): ConfigFor<R> | string;
  /** Every toolkit part of `role`, so a mind can declare its possible dependencies. */
  candidates<R extends Role & keyof RoleConfigs>(role: R): readonly ConfigFor<R>[];
  /** Every held variation of `role` that fits the body, without stage or registration-order preferences. */
  selected<R extends Role & keyof RoleConfigs>(role: R, spec: BodySpec): readonly ConfigFor<R>[];
  /** **Every game part of `role`** (the toolkit's), as its config. */
  game<R extends Role & keyof RoleConfigs>(role: R): readonly ConfigFor<R>[];
}
