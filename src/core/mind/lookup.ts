import type { MotorPart } from "../control/motor-part.ts";
import type { Controller } from "./controller.ts";
import type { ExecutorPart } from "./executor-part.ts";
import type { LocomotionPart } from "./locomotion-part.ts";
import type { NavigatorPart } from "./navigator.ts";
import type { Part, PartConfig, Role } from "./parts.ts";
import type { SubMindPart } from "./sub-mind-part.ts";

/** **Each role's kind of part**: what a lookup of the role gives (`PartLookup.of`), its maker included where the role's parts make themselves. */
export interface RoleParts {
  readonly mind: Controller;
  readonly "sub-mind": SubMindPart;
  readonly tactics: Part;
  readonly behaviour: Part;
  readonly "move-rule": Part;
  readonly navigation: NavigatorPart;
  readonly locomotion: LocomotionPart;
  readonly guard: Part;
  readonly executor: ExecutorPart;
  readonly support: Part;
  readonly reflex: Part;
  readonly motor: MotorPart;
}

/**
 * **The parts a tree may name, by kind** (`partLookup`, `catalog.ts`): what a part whose checks
 * read the parts it names is handed (`Part.fits`, `Part.faults`), and what a mind's host hands
 * its maker (`BodyHost.parts`) for every assembly that builds a part. No part's module reads the
 * registry: it is handed this, so the part a config names, a mind's own included, is the part used.
 */
export interface PartLookup {
  /** The part `config` names; a thrown error where no part has its kind or the part is not of `role`. */
  of<R extends Role>(role: R, config: PartConfig): RoleParts[R];
}
