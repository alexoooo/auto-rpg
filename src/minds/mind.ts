import type { BodyControl } from "../core/bodies/body-control.ts";
import type { Senses } from "../core/bodies/senses.ts";
import type { Experiment } from "../control/body.ts";
import type { Rulebook } from "../combat/rulebook.ts";
import type { BodySpec } from "../core/bodies/spec/body.ts";
import type { Clock } from "../core/world/clock.ts";
import type { PartLookup } from "../parts/lookup.ts";
import type { OwnBody } from "../core/bodies/own-body.ts";
import type { Orders } from "./orders.ts";

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

/**
 * **All a mind's maker is given** (`Controller.create`), in place of the world and the built
 * body: the body's description, the world's clock, the parts its config may name (`parts`), the
 * seed of its chances (`seed`: the only source a mind draws from), the rules the fight is played
 * by (`rules`, whose arithmetic prices a blow), its orders (`orders`), an experiment's settings
 * (`experiment`), and the one way to take the body (`take`), which it uses once.
 */
export interface BodyHost {
  readonly spec: BodySpec;
  readonly clock: Clock;
  readonly parts: PartLookup;
  /** A 32-bit word, the fight's for this body (`seedOf`); 0 unless the fight gives one. A mind draws from it alone (`randomStream`), its stream's word in its `state`. */
  readonly seed: number;
  /**
   * Where in each period its periodic work falls, a fraction in [0, 1): the fight's for this body
   * (`phaseOf`); 0 unless the fight gives one. A decision made every so often is made on its
   * phase's steps (`Deciding.phase`), so bodies built together do not all decide on one step.
   */
  readonly phase: number;
  /** The rules the fight is played by (`Rulebook`), as the fight gives them. */
  readonly rules: Rulebook;
  /** Its orders this step (a person's, or its Commander's), or null when it is left to itself. `senses` are its own, this step's. */
  orders(senses: Senses): Orders | null;
  /** Research settings for the command layers a mind builds on its body; none unless an experiment gives them. */
  readonly experiment?: Experiment;
  /**
   * Take the body under the mind `make` makes of it (`OwnBody`: the body as the fight grants it,
   * its senses, assist and contact labels among it), once; returns that mind. Whatever the mind
   * builds on its body (the command layers, sub-minds, a policy) is its own.
   */
  take<M extends MindConstruction>(make: (own: OwnBody) => M): M;
}
