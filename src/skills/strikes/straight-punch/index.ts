import { SUPPORT_REFERENCE } from "../../../control/support-reference.ts";
import { recoveryNetwork } from "../../../core/math/learning/recovery-network.ts";
import { dataOf } from "../../../core/data/store.ts";
import { deepFreeze } from "../../../core/state.ts";
import { strikesWithOneOf, fitsAll, fitsWhen } from "../../../parts/parts.ts";
import { aimedPoint, type ExecutorMaking, type ExecutorPart } from "../../framework/executor-part.ts";
import type { ActionConfig } from "../../config.ts";
import { STRAIGHT_DRIVE_KEYS, timedChannelFault, straightDriveExecutor, straightDriveFits, validStraightDrive, validStraightDrivePart,
  type StraightDrive, type StraightDriveOptions } from "../shared/straight-drive.ts";
import { checkedLayout, type SteerLayout } from "../shared/steer.ts";
import layoutFile from "../../../../assets/skills/strikes/straight-punch/drive.layout.json" with { type: "json" };
import { handConfigurationRefusal, holdsNothing } from "../../reach/hand.ts";
import { PUNCH_BODIES } from "./data/records.ts";
import { recordFault } from "../../framework/records.ts";
import { variationFault, variationMaker, type ExecutorVariations, type Varied } from "../../framework/variations.ts";
import { fromGuard } from "./from-guard/from-guard.ts";

/** How the straight punch's steer reads and pushes: its networks' inputs and outputs (`assets/skills/strikes/straight-punch/drive.layout.json`). */
export const PUNCH_LAYOUT: SteerLayout = deepFreeze(checkedLayout(layoutFile as SteerLayout));

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
 * A straight punch on `making`'s body: the straight drive with its fist, as the body's record has it
 * (`dataOf("straight-punch/drive")`, each variation's), its drive begun when `ready` says where given.
 */
function punch({ body, guard, aim }: ExecutorMaking, config: Config, actions: readonly ActionConfig[], ready?: StraightDriveOptions["ready"]) {
  const record = dataOf("straight-punch/drive")[body.built.spec.model], settings = { ...record?.settings, ...config.tuning } as StraightDrive;
  const network = config.tuning === undefined ? record?.network : null;
  return straightDriveExecutor(body, guard, actions.map(a => a.name), settings, aimedPoint(aim),
    { label: "straight punch", layout: PUNCH_LAYOUT, ...(network ? { policy: recoveryNetwork(network) } : {}), ...(ready ? { ready } : {}) });
}

/**
 * The straight punch's variations: the drive, begun once the stance is quiet and settled; and
 * from its guard (`from-guard/`), begun only once the striking arm is also at its guard and still.
 */
const VARIATIONS: ExecutorVariations<Config> = {
  drive: (making, config, actions) => punch(making, config, actions),
  "from-guard": (making, config, actions) => punch(making, config, actions, fromGuard(making.body)),
};

/** A straight punch owns its body fit; its settings are its body's, its variation its character's. */
export const PUNCH_PART: ExecutorPart<Config> = {
  role: "executor", requires: [SUPPORT_REFERENCE], label: "Straight punch", stage: "game", defaults: { kind: "straight-punch" },
  keys: { kind: true, variation: true, tuning: true }, tuning: STRAIGHT_DRIVE_KEYS,
  fields: [], slots: [], fits: fitsAll(variationFault("straight-punch", "straight punch", VARIATIONS), strikesWithOneOf("hand.left", "hand.right"), fitsWhen(straightDriveFits, "needs both arms on the upper trunk, each with a fist, and a thoracic joint"),
    (spec) => handConfigurationRefusal(spec, ["hand.left", "hand.right"], "fist"),
    recordFault("straight punch", PUNCH_BODIES, validStraightDrive), (spec, config) => config.tuning ? timedChannelFault(spec, config.tuning) : null),
  faults: (config) => config.tuning === undefined || validStraightDrivePart(config.tuning) ? [] : ["invalid straight punch tuning"],
  reads: () => ["straight-punch/drive"], effectors: ["hand.left", "hand.right"], aims: true,
  // A punch is thrown by a hand that holds nothing: one holding an item would drive the item's end along the punch's line.
  strikesWith: (spec, _config, effector) => holdsNothing(spec, effector),
  make: variationMaker("straight-punch", VARIATIONS),
  skillGroup: "Strikes", variations: Object.keys(VARIATIONS),
};

declare module "../../config.ts" {
  interface ExecutorConfigs {
    readonly "straight-punch": Config;
  }
}
