import { SUPPORT_REFERENCE } from "../../../control/support-reference.ts";
import { recoveryNetwork } from "../../../core/math/learning/recovery-network.ts";
import { dataOf } from "../../../core/data/store.ts";
import { deepFreeze } from "../../../core/state.ts";
import { strikesWithOneOf, fitsWhen } from "../../../parts/parts.ts";
import { aimedPoint, type ExecutorMaking, type ExecutorPart } from "../../framework/executor-part.ts";
import type { ActionConfig } from "../../config.ts";
import { STRAIGHT_DRIVE_KEYS, timedChannelFault, straightDriveExecutor, straightDriveFits, validStraightDrive, validStraightDrivePart,
  type StraightDrive, type StraightDriveOptions } from "../shared/straight-drive.ts";
import { checkedLayout, type SteerLayout } from "../shared/steer.ts";
import layoutFile from "../../../../assets/skills/strikes/straight-punch/drive.layout.json" with { type: "json" };
import movingLayoutFile from "../../../../assets/skills/strikes/straight-punch/moving.layout.json" with { type: "json" };
import { handConfigurationRefusal, holdsNothing } from "../../reach/hand.ts";
import { DRIVE_BODIES, MOVING_BODIES, type PunchRecordKey } from "./data/records.ts";
import { MOVING_STROKE } from "./moving/stroke.ts";
import { executorOf, makersOf, varied, variationReads, variationRecordFault, type ExecutorVariations, type RecordedVariation, type Varied, type Variations } from "../../framework/variations.ts";

/** How the straight punch's steer reads and pushes: its networks' inputs and outputs (`assets/skills/strikes/straight-punch/drive.layout.json`). */
export const PUNCH_LAYOUT: SteerLayout = deepFreeze(checkedLayout(layoutFile as SteerLayout));

/** How `moving`'s steer reads and steers its stroke: the speeds it drives the trunk and the arm toward (`assets/skills/strikes/straight-punch/moving.layout.json`). */
export const MOVING_LAYOUT: SteerLayout = deepFreeze(checkedLayout(movingLayoutFile as SteerLayout));

/**
 * **The straight punch** (`straightDriveExecutor`): the arm driven flat out at a lined-up contact
 * pose, the fist its striking point, as its body's record has it (`PunchRecord`): its settings,
 * steered by its network where it has one. A body with no record does not throw it. A research
 * `tuning`, which a link does not carry, sets settings over the record's (a search's or a
 * trainer's subject: all of them where the body has none), and then no network steers it: its
 * trainer does, where it is `steered`.
 */
interface Config extends Varied {
  readonly kind: "straight-punch";
  readonly tuning?: Partial<StraightDrive>;
}

/**
 * How a variation throws the punch its record has: whether it leaves the legs to a walk
 * (`leavesLegs`), a stroke of its own in place of the drive's (`stroke`), and the layout its
 * network steers by (`PUNCH_LAYOUT` where none is given).
 */
type How = Pick<StraightDriveOptions, "leavesLegs" | "stroke"> & { readonly layout?: SteerLayout };

/**
 * A straight punch on `making`'s body: the straight drive with its fist, as the body's record of
 * `key` has it (its variation's, `dataOf`), thrown as `how` says (`How`).
 */
function punch(key: PunchRecordKey, { body, guard, aim }: ExecutorMaking, config: Config, actions: readonly ActionConfig[], how: How = {}) {
  const record = dataOf(key)[body.built.spec.model], settings = { ...record?.settings, ...config.tuning } as StraightDrive;
  const network = config.tuning === undefined ? record?.network : null;
  return straightDriveExecutor(body, guard, actions.map(a => a.name), settings, aimedPoint(aim),
    { label: "straight punch", layout: how.layout ?? PUNCH_LAYOUT, ...(network ? { policy: recoveryNetwork(network) } : {}),
      ...(how.leavesLegs ? { leavesLegs: true as const } : {}), ...(how.stroke ? { stroke: how.stroke } : {}) });
}

/**
 * A variation of the straight punch: the punch as the record of `key` has it on each of `bodies`
 * (`Recorded`), thrown as `how` says where given (`How`).
 */
const variation = (key: PunchRecordKey, bodies: readonly string[], how?: How): RecordedVariation<ExecutorVariations<Config>[string]> =>
  ({ reads: [key], bodies, make: (making, config, actions) => punch(key, making, config, actions, how) });

/**
 * The straight punch's variations, each by its own record: the drive, begun once the stance is
 * quiet and settled; and on the move, thrown by the arm and the trunk on legs it leaves to a walk,
 * with a stroke of its own (`MOVING_STROKE`).
 */
const VARIATIONS: Variations<RecordedVariation<ExecutorVariations<Config>[string]>> = {
  drive: variation("straight-punch/drive", DRIVE_BODIES),
  moving: variation("straight-punch/moving", MOVING_BODIES, { leavesLegs: true, stroke: MOVING_STROKE, layout: MOVING_LAYOUT }),
};

/** A straight punch owns its body fit; its settings are its body's record of its variation, its variation its character's. */
export const PUNCH_PART: ExecutorPart<Config> = {
  role: "executor", requires: [SUPPORT_REFERENCE], label: "Straight punch", stage: "game", defaults: { kind: "straight-punch" },
  keys: { kind: true, variation: true, tuning: true }, tuning: STRAIGHT_DRIVE_KEYS,
  fields: [], slots: [],
  ...varied({ skill: "straight-punch", label: "straight punch", variations: makersOf(VARIATIONS), of: executorOf, fits: [strikesWithOneOf("hand.left", "hand.right"),
    fitsWhen(straightDriveFits, "needs both arms on the upper trunk, each with a fist, and a thoracic joint"), (spec) => handConfigurationRefusal(spec, ["hand.left", "hand.right"], "fist"),
    variationRecordFault("straight-punch", "straight punch", VARIATIONS, validStraightDrive), (spec, config) => config.tuning ? timedChannelFault(spec, config.tuning) : null] }),
  faults: (config) => config.tuning === undefined || validStraightDrivePart(config.tuning) ? [] : ["invalid straight punch tuning"],
  reads: variationReads(VARIATIONS), effectors: ["hand.left", "hand.right"], aims: true,
  // A punch is thrown by a hand that holds nothing: one holding an item would drive the item's end along the punch's line.
  strikesWith: (spec, _config, effector) => holdsNothing(spec, effector),
  skillGroup: "Strikes",
};

declare module "../../config.ts" {
  interface ExecutorConfigs {
    readonly "straight-punch": Config;
  }
}
