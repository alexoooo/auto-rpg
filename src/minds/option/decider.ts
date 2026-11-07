import type { PartConfig } from "../../parts/parts.ts";
import type { Sight, Decider } from "../decider.ts";
import type { BodySpec } from "../../core/bodies/spec/body.ts";
import type { PartLookup } from "../../parts/lookup.ts";
import type { Orders } from "../orders.ts";
import type { Rulebook } from "../../combat/rulebook.ts";

/** What Option Mind's decider is made for: the body, the fight's rules, a person's orders and the parts the tree names. */
export interface DeciderMaking {
  readonly spec: BodySpec;
  /** The rules the fight is played by (`BodyHost.rules`), which price a blow. */
  readonly rules: Rulebook;
  readonly orders: (sight: Sight) => Orders | null;
  readonly parts: PartLookup;
  readonly techniques: readonly PartConfig[];
}

/** What Option Mind decides with: its chooser, its options (each a part of role `option`, in rank order), and the legs its body goes by. */
interface Deciding {
  readonly chooser: PartConfig;
  /** The provider that owns the selected options' decision protocol. */
  readonly predictions: PartConfig;
  readonly options: readonly PartConfig[];
  /** Its body's legs: the gaits its walks go by (`gaitsOf`). */
  readonly legs: PartConfig;
}

/** Build the selected provider's decision session with its compatible chooser and option parts. */
export function optionDecider(making: DeciderMaking, hz: number, deciding: Deciding, seed: number, phase: number, rate: number, delay: number): Decider {
  const given = deciding.predictions;
  return making.parts.of("predictions", given).make(given).build({ ...making, hz, rate, delay, legs: deciding.legs, options: deciding.options,
    chooser: deciding.chooser, seed, phase });
}
