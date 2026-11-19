import meta from "../../../../assets/skills/strikes/sword-thrust/drive.meta.json" with { type: "json" };
import layoutFile from "../../../../assets/skills/strikes/sword-thrust/drive.layout.json" with { type: "json" };
import { fitsWhen } from "../../../parts/parts.ts";
import { deepFreeze } from "../../../core/state.ts";
import { heldStrikePart, type HeldStrikeConfig, type HeldStrikeRecord, type StrikeSettings } from "../shared/held-strike.ts";
import { DRIVE_THROW, STRAIGHT_DRIVE_KEYS, straightDriveExecutor, straightDriveFits, timedChannelFault, validStraightDrive, validStraightDrivePart,
  type StraightDrive } from "../shared/straight-drive.ts";
import { checkedLayout, type SteerLayout } from "../shared/steer.ts";

/** **A sword thrust's settings**: a straight drive's (`StraightDrive`) but `fire`, which reads the fist a held face does not strike with. */
export type SwordThrust = Omit<StraightDrive, "fire">;

/** Whether `settings`, some of a sword thrust's, are each valid, and name no `fire`. */
const validSwordThrustPart = (settings: Partial<SwordThrust>): boolean => validStraightDrivePart(settings) && !("fire" in settings);

/** Whether `settings` are a sword thrust's, whole (`validStraightDrive`), with no `fire`. */
export const validSwordThrust = (settings: Partial<SwordThrust>): settings is SwordThrust => validSwordThrustPart(settings) && validStraightDrive(settings);

/** **The sword thrust's settings** (`StrikeSettings`): a straight drive's but `fire`. */
const SWORD_THRUST_SETTINGS: StrikeSettings<SwordThrust> = deepFreeze({
  keys: STRAIGHT_DRIVE_KEYS.filter((key): key is keyof SwordThrust => key !== "fire"), validPart: validSwordThrustPart, valid: validSwordThrust, channelFault: timedChannelFault,
});

/** How the sword thrust's steer reads and pushes: its networks' inputs and outputs (`assets/skills/strikes/sword-thrust/drive.layout.json`). */
export const SWORD_THRUST_LAYOUT: SteerLayout = deepFreeze(checkedLayout(layoutFile as SteerLayout));

declare module "../../../core/data/store.ts" {
  interface DataOf {
    /** Every body's sword thrust record, its drive variation's (`assets/skills/strikes/sword-thrust/drive.json`), with the network that steers it where one was trained. */
    "sword-thrust/drive": Readonly<Record<string, HeldStrikeRecord<SwordThrust>>>;
  }
}

/**
 * **The sword thrust** (`heldStrikePart`, `straightDriveExecutor`): a whole-body drive thrown with
 * the sword's point, its settings its body's record of the thrust
 * (`assets/skills/strikes/sword-thrust/drive.json`): a schedule of the trunk's, legs' and arm's
 * pushes, the arm held at its contact pose, the point along the line from the shoulder to the
 * target, steered by its network where it has one.
 */
export const SWORD_THRUST_PART = heldStrikePart({
  kind: "sword-thrust", label: "Sword thrust", item: "sword", mechanism: "point", variation: "drive", data: "sword-thrust/drive", bodies: meta.bodies,
  settings: SWORD_THRUST_SETTINGS, fits: [fitsWhen(straightDriveFits, "needs both arms on the upper trunk and a thoracic joint")], layout: SWORD_THRUST_LAYOUT,
  executor: ({ body, guard, actions, settings, resolve, faces, policy }) =>
    straightDriveExecutor(body, guard, actions, settings, resolve, { label: "sword thrust", layout: SWORD_THRUST_LAYOUT, throws: DRIVE_THROW, faces, ...(policy ? { policy } : {}) }),
});

declare module "../../config.ts" {
  interface ExecutorConfigs {
    readonly "sword-thrust": HeldStrikeConfig<"sword-thrust", SwordThrust>;
  }
}
