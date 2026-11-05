import type { BodyControl } from "../core/bodies/body-control.ts";
import type { Senses } from "../core/bodies/senses.ts";

/** Plain saved memory: all values a mind carries from one step to the next. */
export type MindState = object;

/** A computation whose fast action precedes its next decision. */
export interface Mind {
  readonly state: MindState;
  act(control: BodyControl): void;
  think(senses: Senses): void;
  interrupt(): void;
}

/** Construction metadata and resources, separate from the computation. */
export interface MindConstruction<M extends Mind = Mind> {
  readonly mind: M;
  readonly name: string;
  has(): string;
  dispose(): void;
}
