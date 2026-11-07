import type { BodySpec } from "../../core/bodies/spec/body.ts";
import type { Rulebook } from "../../combat/rulebook.ts";
import type { PartLookup } from "../../parts/lookup.ts";
import type { PartConfig } from "../../parts/parts.ts";
import type { Orders } from "../orders.ts";
import type { Decider, Sight } from "../index.ts";

/** The configured inputs from which a provider builds one decision session. */
export interface OptionEvaluationInput {
  readonly spec: BodySpec;
  readonly hz: number;
  readonly rate: number;
  readonly delay: number;
  readonly rules: Rulebook;
  readonly parts: PartLookup;
  readonly legs: PartConfig;
  readonly options: readonly PartConfig[];
  readonly chooser: PartConfig;
  readonly seed: number;
  readonly phase: number;
  readonly techniques: readonly PartConfig[];
  readonly orders: (sight: Sight) => Orders | null;
}

/** A provider owns its situation, option constructors, chooser protocol and saved decision memory. */
export interface OptionEvaluation {
  build(input: OptionEvaluationInput): Decider;
}
