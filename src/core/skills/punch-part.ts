import { recoveryNetwork } from "../control/recovery-network.ts";
import { dataOf } from "../data/store.ts";
import { strikesWithOneOf, fitsAll, fitsWhen } from "../mind/parts.ts";
import { text } from "../mind/fields.ts";
import { aimedPoint, AIMED_ACTIONS, type ExecutorPart } from "../mind/executor-part.ts";
import { STRAIGHT_PUNCH_KEYS, timedChannelFault, straightPunchExecutor, straightPunchFits, validStraightPunch, validStraightPunchPart, type StraightPunch } from "./straight-punch.ts";
import { holdsNothing } from "./strikes.ts";
import { punchRecorded } from "./punch-records.ts";
import { bodyKey, type BodySpec } from "../spec/body.ts";

/**
 * **The straight punch** (`straightPunchExecutor`): the arm driven flat out at a lined-up contact
 * pose, as its body's record has it (`PunchRecord`): its settings, steered by its network where it
 * has one. A body with no record does not throw it. A research `tuning`, which a link does not
 * carry, sets settings over the record's (a search's or a trainer's subject: all of them where the
 * body has none), and then no network steers it: its trainer does, where it is `steered`.
 */
interface Config {
  readonly kind: "straight-punch";
  readonly name: string;
  readonly tuning?: Partial<StraightPunch>;
}

/** Why a body of `spec` has no straight punch under `config`, or null: no record of its own and no whole research tuning in its place. */
function recordFault(spec: BodySpec, config: Config): string | null {
  return punchRecorded(spec) || config.tuning !== undefined && validStraightPunch(config.tuning) ? null : `the straight punch is not tuned for ${bodyKey(spec)}`;
}

/** A straight punch owns its body fit; its settings are its body's. */
export const PUNCH_PART: ExecutorPart<Config> = {
  role: "executor", label: "Straight punch", stage: "game", defaults: { kind: "straight-punch", name: "punch" },
  keys: { kind: true, name: true, tuning: true }, tuning: STRAIGHT_PUNCH_KEYS,
  fields: [text("name", "Name")], slots: [], fits: fitsAll(strikesWithOneOf("hand.left", "hand.right"), fitsWhen(straightPunchFits, "needs both arms on the upper trunk and a thoracic joint"),
    recordFault, (spec, config) => config.tuning ? timedChannelFault(spec, config.tuning) : null),
  faults: (config) => config.tuning === undefined || validStraightPunchPart(config.tuning) ? [] : ["invalid straight punch tuning"],
  reads: () => ["straight-punch"], effectors: ["hand.left", "hand.right"], ...AIMED_ACTIONS,
  // A punch is thrown by a hand that holds nothing: one holding an item would drive the item's end along the punch's line.
  strikesWith: (spec, _config, effector) => holdsNothing(spec, effector),
  make({ body, guard, aim }, config, actions) {
    const record = dataOf("straight-punch")[bodyKey(body.built.spec)], settings = { ...record?.settings, ...config.tuning } as StraightPunch;
    const network = config.tuning === undefined ? record?.network : null;
    return straightPunchExecutor(body, guard, actions.map(a => a.name), settings, aimedPoint(aim), network ? { policy: recoveryNetwork(network) } : {});
  },
};
