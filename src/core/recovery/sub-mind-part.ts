import type { Body, BodyView } from "../body.ts";
import type { Clock } from "../clock.ts";
import type { MindKit } from "../mind/kit.ts";
import type { OwnBody } from "../mind/mind.ts";
import type { KeysOf, Part, PartConfig } from "../parts/parts.ts";
import type { SubMind } from "../mind/sub-mind.ts";

/**
 * **A kind of sub-mind**: a part of role `sub-mind` that owns its config's type, keys, defaults,
 * faults, fit and the data it reads, and makes the sub-mind for its own body, its host's view of
 * it, the mind's kit (its motor and guard, `MindKit`), the world's clock and, where the host gives
 * it, the body's completed observations.
 */
export interface SubMindPart<C extends PartConfig = PartConfig> extends Part<C> {
  readonly role: "sub-mind";
  readonly keys: KeysOf<C>;
  make(own: OwnBody, view: BodyView, config: C, kit: MindKit, clock: Clock, afterPhysics?: Body["afterPhysics"]): SubMind;
}
