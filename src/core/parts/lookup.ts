import type { PartConfig, Role } from "./parts.ts";
import type { BodySpec } from "../spec/body.ts";

/**
 * **Each role's kind of part**: what a lookup of the role gives (`PartLookup.of`), its maker
 * included where the role's parts make themselves. Each role augments this interface beside its
 * contract, so the lookup depends on no role's owner.
 */
export interface RoleParts {}

/**
 * **The parts a tree may name, by kind** (`partLookup`, `catalog.ts`): what a part whose checks
 * read the parts it names is handed (`Part.fits`, `Part.faults`), and what a mind's host hands
 * its maker (`BodyHost.parts`) for every assembly that builds a part. No part's module reads the
 * registry: it is handed this, so the part a config names, a mind's own included, is the part used.
 */
export interface PartLookup {
  /** The part `config` names; a thrown error where no part has its kind or the part is not of `role`. */
  of<R extends Role>(role: R, config: PartConfig): RoleParts[R];
  /**
   * **The part that fills `role` on a body of `spec`**, as its config (its defaults): the one game
   * part of the role (`Part.stage`, the toolkit's) that fits the body; why none does, or which two
   * do, a sentence, where not one does: two fitting one body is a fault of the build, never a pick.
   */
  fitting(role: Role, spec: BodySpec): PartConfig | string;
  /** **Every game part of `role`** (the toolkit's), as its config: what a role filled by fit (`fitting`) may be. */
  game(role: Role): readonly PartConfig[];
}
