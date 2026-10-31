import type { BodyView } from "../body.ts";
import type { Clock } from "../clock.ts";
import type { MindKit } from "../mind/kit.ts";
import type { OwnBody } from "../mind/mind.ts";
import type { KeysOf, Part, PartConfig } from "../parts/parts.ts";
import type { SubMind } from "../mind/sub-mind.ts";

/**
 * **A kind of sub-mind**: a part of role `sub-mind` that owns its config's type, keys, defaults,
 * faults, fit and the data it reads, and makes the sub-mind for its own body (whose completed
 * physics it may observe, `OwnBody.afterPhysics`), its host's view of it, the mind's kit (its motor
 * and guard, `MindKit`) and the world's clock.
 */
export interface SubMindPart<C extends PartConfig = PartConfig> extends Part<C> {
  readonly role: "sub-mind";
  readonly keys: KeysOf<C>;
  make(own: OwnBody, view: BodyView, config: C, kit: MindKit, clock: Clock): SubMind;
}
