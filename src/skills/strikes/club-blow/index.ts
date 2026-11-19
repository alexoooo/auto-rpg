import meta from "../../../../assets/skills/strikes/club-blow/swing.meta.json" with { type: "json" };
import { heldStrikePart, type HeldStrikeConfig, type HeldStrikeRecord } from "../shared/held-strike.ts";
import { SWING_SETTINGS, swingStrike, type Swing } from "../shared/swing.ts";

declare module "../../../core/data/store.ts" {
  interface DataOf {
    /** Every body's club blow record, its swing variation's (`assets/skills/strikes/club-blow/swing.json`). */
    "club-blow/swing": Readonly<Record<string, HeldStrikeRecord<Swing>>>;
  }
}

/**
 * **The club blow** (`heldStrikePart`, `swingExecutor`): the club swung at the trunk on an arc that
 * meets the target with its head, its settings its body's record of the swing
 * (`assets/skills/strikes/club-blow/swing.json`): the windup and the schedule of pushes searched for
 * that body. It has no steer.
 */
export const CLUB_BLOW_PART = heldStrikePart({
  kind: "club-blow", label: "Club blow", item: "club", mechanism: "blunt", variation: "swing", data: "club-blow/swing", bodies: meta.bodies,
  settings: SWING_SETTINGS, fits: [], layout: null, executor: swingStrike,
});

declare module "../../config.ts" {
  interface ExecutorConfigs {
    readonly "club-blow": HeldStrikeConfig<"club-blow", Swing>;
  }
}
