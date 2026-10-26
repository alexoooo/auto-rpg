import { recoveryNetwork } from "../control/recovery-network.ts";
import { dataOf } from "../data/store.ts";
import { strikesWithOneOf, fitsAll, fitsWhen } from "../mind/parts.ts";
import { text } from "../mind/fields.ts";
import { aimedPoint, AIMED_ACTIONS, type ExecutorPart } from "../mind/executor-part.ts";
import { STRAIGHT_PUNCH, timedChannelFault, straightPunchExecutor, straightPunchFits, validStraightPunch, type StraightPunch } from "./straight-punch.ts";
import { holdsNothing } from "./strikes.ts";
import { PUNCH_POLICY } from "./learned-punch.ts";

/**
 * **The straight punch** (`straightPunchExecutor`): the arm driven flat out at a lined-up contact
 * pose, its settings these. With `learned`, the learned punch's (`PunchPolicy`,
 * `dataOf("learned-punch")`): its body's schedule, drive and window (where it lands) over these,
 * steered by its network.
 */
interface Config extends StraightPunch {
  readonly kind: "straight-punch";
  readonly name: string;
  readonly learned?: boolean;
}

/** A straight punch owns its body fit and flat-out drive settings. */
export const PUNCH_PART: ExecutorPart<Config> = {
  role: "executor", label: "Straight punch", stage: "game", defaults: { kind: "straight-punch", name: "punch", ...STRAIGHT_PUNCH },
  keys: {
    kind: true, name: true, pace: true, reach: true, band: true, aside: true, squared: true, poised: true, above: true, settle: true, through: true, hips: true, turn: true,
    lean: true, chamber: true, lead: true, elbow: true, brake: true, follow: true, longest: true,
    recover: true, landed: true, fire: true, ease: true, steered: true, driven: true, timed: true, learned: true,
  },
  fields: [text("name", "Name")], slots: [], fits: fitsAll(strikesWithOneOf("hand.left", "hand.right"), fitsWhen(straightPunchFits, "needs both arms on the upper trunk and a thoracic joint"),
    timedChannelFault, (spec, config: Config) => !config.learned || PUNCH_POLICY.bodies.includes(spec.model) ? null : `the learned punch has no settings for ${spec.model}`),
  faults: config => [...validStraightPunch(config) ? [] : ["invalid straight punch settings"],
    ...config.learned === undefined || typeof config.learned === "boolean" ? [] : ["a straight punch is learned or not"]],
  reads: (config) => config.learned ? ["learned-punch"] : [], effectors: ["hand.left", "hand.right"], ...AIMED_ACTIONS,
  // A punch is thrown by a hand that holds nothing: one holding an item would drive the item's end along the punch's line.
  strikesWith: (spec, _config, effector) => holdsNothing(spec, effector),
  make({ body, guard, aim }, config, actions) {
    const { kind: _, name: __, learned, ...own } = config;
    if (!learned) return straightPunchExecutor(body, guard, actions.map(a => a.name), own, aimedPoint(aim));
    const policy = dataOf("learned-punch"), settings = { ...own, ...policy.bodies[body.built.spec.model], steered: true };
    return straightPunchExecutor(body, guard, actions.map(a => a.name), settings, aimedPoint(aim), { policy: recoveryNetwork(policy) });
  },
};
