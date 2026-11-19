import meta from "../../../../assets/skills/strikes/bonk/swing.meta.json" with { type: "json" };
import layoutFile from "../../../../assets/skills/strikes/bonk/swing.layout.json" with { type: "json" };
import { checkedLayout, type SteerLayout } from "../shared/steer.ts";
import { deepFreeze } from "../../../core/state.ts";
import { heldStrikePart, type HeldStrikeConfig, type HeldStrikeRecord } from "../shared/held-strike.ts";
import { SWING_SETTINGS, swingStrike, type Swing } from "../shared/swing.ts";

declare module "../../../core/data/store.ts" {
  interface DataOf {
    /** Every body's bonk record, its swing variation's (`assets/skills/strikes/bonk/swing.json`), with the network that steers it where one was trained. */
    "bonk/swing": Readonly<Record<string, HeldStrikeRecord<Swing>>>;
  }
}

/**
 * **The bonk** (`heldStrikePart`, `swingExecutor`): the club swung overhead at the head, the arm
 * straight as it lands, on an arc that meets the target with its head, its settings its body's
 * record of the swing (`assets/skills/strikes/bonk/swing.json`): the windup and the schedule of
 * pushes searched for that body, steered by its network where it has one
 * (`assets/skills/strikes/bonk/swing.layout.json`).
 */
export const BONK_PART = heldStrikePart({
  kind: "bonk", label: "Bonk", item: "club", mechanism: "blunt", variation: "swing", data: "bonk/swing", bodies: meta.bodies,
  settings: SWING_SETTINGS, fits: [], layout: deepFreeze(checkedLayout(layoutFile as SteerLayout)), executor: swingStrike,
});

declare module "../../config.ts" {
  interface ExecutorConfigs {
    readonly "bonk": HeldStrikeConfig<"bonk", Swing>;
  }
}
