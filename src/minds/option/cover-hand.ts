import type { BodySpec } from "../../core/bodies/spec/body.ts";
import type { Side } from "../../core/bodies/bilateral.ts";

/** The hands of `spec` that hold an item with a covering face (`ItemSpec.coverNormal`), as segments (`hand.left`). */
export const shieldHands = (spec: BodySpec): readonly string[] => (spec.held ?? []).filter(({ item }) => item.coverNormal !== undefined).map(({ segment }) => segment);

/**
 * The hand of `spec` that covers a blow closing from its `side`: that side's, unless it holds a
 * covering face (`shieldHands`), whose ward is the guard's (`guard`, `src/minds/option/rest.ts`);
 * none then.
 */
export const coveringHand = (spec: BodySpec, side: Side): Side | null => shieldHands(spec).includes(`hand.${side}`) ? null : side;
