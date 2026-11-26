import type { BodySpec } from "../../../core/bodies/spec/body.ts";
import { pairedSegment, type Side } from "../../../core/bodies/bilateral.ts";
import { facedHands } from "../../../core/bodies/items/held.ts";

/**
 * The hand of `spec` that covers a blow closing from its `side`: that side's, unless it holds a
 * covering face (`facedHands`), whose ward is the guard's (`guard`, `src/minds/option/options/rest.ts`);
 * none then.
 */
export const coveringHand = (spec: BodySpec, side: Side): Side | null => facedHands(spec).includes(pairedSegment("hand", side)) ? null : side;
