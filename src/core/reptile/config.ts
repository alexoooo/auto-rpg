import type { ConfigOf, PartConfig } from "../parts/parts.ts";
import { deepFreeze } from "../state.ts";
import type { BITES } from "./bites.ts";
import type { GAITS } from "./gaits.ts";
import type { QUADRUPED_PLANNERS } from "./planners.ts";
import type { SUPPORT_MOTORS } from "./support-motors.ts";
import type { REPTILE_BITE } from "./tuning.ts";

/** **A stock config of the quadruped's motor**, by kind (`SUPPORT_MOTORS`). */
export type SupportMotorConfig = ConfigOf<typeof SUPPORT_MOTORS>;

/** **A stock config of a quadruped's gait**, by kind (`GAITS`). */
export type GaitConfig = ConfigOf<typeof GAITS>;

/** **A stock config of a quadruped's bite**, by kind (`BITES`). */
export type BiteConfig = ConfigOf<typeof BITES>;

/** **A stock config of the quadruped's tactics**, by kind (`QUADRUPED_PLANNERS`). */
export type QuadrupedTacticsConfig = ConfigOf<typeof QUADRUPED_PLANNERS>;

/**
 * Four-paw crawling, physical jaw snaps and self-righting through the body's own muscles. Each part
 * it is built of is the stock one where it names none (`QUADRUPED_PARTS`, `src/core/reptile/kind.ts`).
 */
export interface QuadrupedConfig {
  readonly kind: "quadruped";
  /** Its motor over the paws: what holds the body up as the gaits ask. */
  readonly motor?: SupportMotorConfig | PartConfig;
  /** Its gait to travel: the gait it carries the body with at speed. */
  readonly travel?: GaitConfig | PartConfig;
  /** Its gait to crawl: the gait close in, and while it places its paws again. */
  readonly crawl?: GaitConfig | PartConfig;
  /** Its bite. */
  readonly bite?: BiteConfig | PartConfig;
  /** Its tactics: where it goes and when it bites. */
  readonly tactics?: QuadrupedTacticsConfig | PartConfig;
  /** Its navigation, any part of the role (`navigatorOf`): the game's where it names none. */
  readonly navigation?: PartConfig;
  /** Immutable bite cells for physical qualification; retained by recipes and replay. */
  readonly tuning?: { readonly bite?: Partial<typeof REPTILE_BITE> };
}

/** The quadruped with every part the stock one. */
export const QUADRUPED: QuadrupedConfig = deepFreeze({ kind: "quadruped" });
