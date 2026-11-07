import type { BodyControl } from "../core/bodies/body-control.ts";
import type { Senses } from "../core/bodies/senses.ts";
import type { AssistCeiling } from "../core/bodies/assist.ts";
import type { ContactIdentity } from "../core/bodies/contact-identity.ts";
import type { Rulebook } from "../combat/rulebook.ts";
import type { BodySpec } from "../core/bodies/spec/body.ts";
import type { Clock } from "../core/world/clock.ts";
import type { PartLookup } from "../parts/lookup.ts";
import type { OwnBody } from "../core/bodies/own-body.ts";

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
 * **What a fight grants a body**, read from its wiring and never from the mind it makes: its
 * senses, its assist's ceiling, how it labels a contact, the seed of its chances, the rules it is
 * played by.
 */
export interface HostGrants {
  /** What it senses (`SensesHub.add`); the clock alone unless given. */
  readonly senses?: () => Senses;
  /** The most its assist gives it; none unless given. */
  readonly assist?: AssistCeiling;
  /** Trusted body adapter for permitted contact labels (`OwnBody.contactIdentity`). */
  readonly contactIdentity?: ContactIdentity;
  /** The seed its mind's chances are drawn from (`BodyHost.seed`): the fight's for this body (`seedOf`); 0 unless given. */
  readonly seed?: number;
  /** Where in each period its periodic work falls (`BodyHost.phase`): the fight's for this body (`phaseOf`); 0 unless given. */
  readonly phase?: number;
  /** The rules its fight is played by (`BodyHost.rules`); supplied by the scenario. */
  readonly rules: Rulebook;
}

/**
 * **What a mind's maker is given in place of the world and the built body**: the body's
 * description, the world's clock, the parts its config may name (`parts`), the seed of its
 * chances (`seed`: the only source a mind draws from), the rules the fight is played by (`rules`,
 * whose arithmetic prices a blow), and the one way to take the body (`take`), which it uses once.
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
  /** The fight's rulebook (`Rulebook`); the arena's unless the fight gives one. */
  readonly rules: Rulebook;
  /**
   * Take the body under the mind `make` makes of it (`OwnBody`: the body as the fight grants it,
   * its senses, assist and contact labels among it), once; returns that mind. Whatever the mind
   * builds on its body (the command layers, sub-minds, a policy) is its own.
   */
  take<M extends MindConstruction>(make: (own: OwnBody) => M): M;
}
