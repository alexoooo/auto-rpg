import { SUPPORT_REFERENCE } from "../../../control/support-reference.ts";
import { recoveryNetwork } from "../../../core/math/learning/recovery-network.ts";
import { dataOf } from "../../../core/data/store.ts";
import { strikesWithOneOf, fitsAll, fitsWhen } from "../../../parts/parts.ts";
import { aimedPoint, type ExecutorMaking, type ExecutorPart } from "../../framework/executor-part.ts";
import type { ActionConfig } from "../../config.ts";
import { STRAIGHT_PUNCH_KEYS, timedChannelFault, straightPunchExecutor, straightPunchFits, validStraightPunch, validStraightPunchPart, type StraightPunch } from "./drive/drive.ts";
import { handConfigurationRefusal, holdsNothing } from "../../reach/hand.ts";
import { PUNCH_BODIES } from "./data/records.ts";
import { recordFault } from "../../framework/records.ts";
import { variationFault, variationMaker } from "../../framework/variations.ts";

/**
 * **The straight punch** (`straightPunchExecutor`): the arm driven flat out at a lined-up contact
 * pose, as its body's record has it (`PunchRecord`): its settings, steered by its network where it
 * has one. A body with no record does not throw it. A research `tuning`, which a link does not
 * carry, sets settings over the record's (a search's or a trainer's subject: all of them where the
 * body has none), and then no network steers it: its trainer does, where it is `steered`.
 */
interface Config {
  readonly kind: "straight-punch";
  readonly tuning?: Partial<StraightPunch>;
}

/** The straight punch's variations: the drive (`drive/`). */
const VARIATIONS = {
  drive({ body, guard, aim }: ExecutorMaking, config: Config, actions: readonly ActionConfig[]) {
    const record = dataOf("straight-punch/drive")[body.built.spec.model], settings = { ...record?.settings, ...config.tuning } as StraightPunch;
    const network = config.tuning === undefined ? record?.network : null;
    return straightPunchExecutor(body, guard, actions.map(a => a.name), settings, aimedPoint(aim), network ? { policy: recoveryNetwork(network) } : {});
  },
};

/** A straight punch owns its body fit; its settings are its body's, its variation its character's. */
export const PUNCH_PART: ExecutorPart<Config> = {
  role: "executor", requires: [SUPPORT_REFERENCE], label: "Straight punch", stage: "game", defaults: { kind: "straight-punch" },
  keys: { kind: true, tuning: true }, tuning: STRAIGHT_PUNCH_KEYS,
  fields: [], slots: [], fits: fitsAll(variationFault("straight-punch", "straight punch", VARIATIONS), strikesWithOneOf("hand.left", "hand.right"), fitsWhen(straightPunchFits, "needs both arms on the upper trunk, each with a fist, and a thoracic joint"),
    (spec) => handConfigurationRefusal(spec, ["hand.left", "hand.right"], "fist"),
    recordFault("straight punch", PUNCH_BODIES, validStraightPunch), (spec, config) => config.tuning ? timedChannelFault(spec, config.tuning) : null),
  faults: (config) => config.tuning === undefined || validStraightPunchPart(config.tuning) ? [] : ["invalid straight punch tuning"],
  reads: () => ["straight-punch/drive"], effectors: ["hand.left", "hand.right"], aims: true,
  // A punch is thrown by a hand that holds nothing: one holding an item would drive the item's end along the punch's line.
  strikesWith: (spec, _config, effector) => holdsNothing(spec, effector),
  make: variationMaker("straight-punch", VARIATIONS),
  variations: Object.keys(VARIATIONS),
};

declare module "../../config.ts" {
  interface ExecutorConfigs {
    readonly "straight-punch": Config;
  }
}
