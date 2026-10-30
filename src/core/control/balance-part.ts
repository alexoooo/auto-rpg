import type { KeysOf, Part, PartConfig } from "../parts/parts.ts";
import type { ReadBody } from "../read-body.ts";
import type { Assist } from "./assist.ts";
import type { StanceControl } from "./stance.ts";
import type { StanceTuning } from "./stance-tuning.ts";

/**
 * **What makes a balance**: from the body, an experiment's stance tuning and its assist, the
 * control that reads the body's support and carries out a stance goal (`StanceControl`), as
 * `stanceControl` is.
 */
export type BalanceMaker = (built: ReadBody, tuning?: StanceTuning, assist?: Assist | null) => StanceControl;

/**
 * **A kind of balance**: a part of role `balance` that owns its config's type, keys, defaults,
 * faults and fit, and gives what makes the balance of a config (`BalanceMaker`): the one a motor
 * that carries a stance holds (`motorControl`).
 */
export interface BalancePart<C extends PartConfig = PartConfig> extends Part<C> {
  readonly role: "balance";
  readonly keys: KeysOf<C>;
  /** What makes a balance of `config`. */
  make(config: C): BalanceMaker;
}
