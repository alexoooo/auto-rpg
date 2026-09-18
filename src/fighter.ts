// Explicit `.ts` extensions, and they are load-bearing rather than a style. Node runs a TypeScript
// file by stripping its types, which is what lets `tests/` import `scoring.ts` and `config.ts`
// directly and what lets `tests/harness/` run real bouts without a browser -- but Node's ESM
// resolver insists on the extension where Vite does not care. Everything a body pulls in at run
// time therefore carries one. The presentation half of the directory -- `main`, `hud`, `rigview`,
// `targeting`, `aim`, `setup` -- deliberately does not, and the line between the two is exactly
// the line a headless harness can reach.
import type { Material } from "@babylonjs/core/Materials/material.js";
import type { Physics6DoFConstraint } from "@babylonjs/core/Physics/v2/physicsConstraint.js";

import { stepControlledPair } from "./control-host.ts";
import type { Side } from "./physics.ts";
import type { Part } from "./rig.ts";
import type { Combatant } from "./units.ts";

export type { Side };

/**
 * The palette every body is built from.
 *
 * One flat record rather than a per-body family because the arena owns the materials and hands
 * the same set to whatever it builds: a golem's plate is the same `steel` a blade is, and a
 * headless harness fills the whole record with one fallback colour. Every field is a real material
 * rather than optional, so a body that reaches for one cannot find `undefined` at build time.
 */
export interface FighterMaterials {
  flesh: Material;
  cloth: Material;
  steel: Material;
  leather: Material;
  brass: Material;
  hide: Material;
  /** Shield boards and club hafts. The arena has had one all along. */
  wood: Material;
  arrowAccent: Material;
}

/** One severable piece of a body, and how close it is to coming off. */
export interface Limb {
  readonly key: string;
  readonly label: string;
  readonly part: Part;
  /**
   * The joint holding it to its parent, or null for a piece that cannot come
   * off. Cutting one of these is a dismemberment.
   */
  readonly attachment: Physics6DoFConstraint | null;
  health: number;
  readonly maxHealth: number;
  /** Per-body vitality metadata, for a body that does not use CONFIG's table. */
  readonly vitalityWeight?: number;
  /**
   * Whether this piece is one the body holds in a hand rather than one it is made of.
   *
   * A blade that meets a blade is a parry, and it is a parry that costs the blade, which is what
   * a weapon's health row is for. So a blow here is booked as a block *and* resolved as a wound;
   * `Combat` puts `guarded` on the report and `src/recorder.ts` credits the defender. Absent
   * means the piece is body, which is what every golem module is.
   */
  readonly guarding?: boolean;
  readonly fatal?: boolean;
  severed: boolean;
  /** Simulation time of the last billed hit, for the per-part cooldown. */
  lastHitAt: number;
}

/**
 * Step both bodies of a bout by one substep.
 *
 * A one-line wrapper over `stepControlledPair`, kept because it is the name every caller and every
 * test already uses and because the ordering it guarantees -- observe both, then drive both -- is
 * the thing a bout depends on and not an implementation detail of the control host.
 */
export function stepPair(left: Combatant, right: Combatant, dt: number, clock: number): void {
  stepControlledPair(left, right, dt, clock);
}
