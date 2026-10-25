import { strikesWithOneOf, fitsAll, fitsWhen } from "../mind/parts.ts";
import { text } from "../mind/fields.ts";
import { aimedPoint, AIMED_ACTIONS, type ExecutorPart } from "../mind/executor-part.ts";
import { STRAIGHT_PUNCH, timedChannelFault, straightPunchExecutor, straightPunchFits, validStraightPunch, type StraightPunch } from "./straight-punch.ts";
import { holdsNothing } from "./strikes.ts";

/** **The straight punch** (`straightPunchExecutor`): the arm driven flat out at a lined-up contact pose, its settings these. */
interface Config extends StraightPunch {
  readonly kind: "straight-punch";
  readonly name: string;
}

/** A straight punch owns its body fit and flat-out drive settings. */
export const PUNCH_PART: ExecutorPart<Config> = {
  role: "executor", label: "Straight punch", stage: "game", defaults: { kind: "straight-punch", name: "punch", ...STRAIGHT_PUNCH },
  keys: {
    kind: true, name: true, pace: true, reach: true, band: true, settle: true, through: true, hips: true, turn: true,
    lean: true, chamber: true, lead: true, elbow: true, brake: true, follow: true, longest: true,
    recover: true, landed: true, fire: true, driven: true, timed: true,
  },
  fields: [text("name", "Name")], slots: [], fits: fitsAll(strikesWithOneOf("hand.left", "hand.right"), fitsWhen(straightPunchFits, "needs both arms on the upper trunk and a thoracic joint"),
    timedChannelFault),
  faults: config => validStraightPunch(config) ? [] : ["invalid straight punch settings"], effectors: ["hand.left", "hand.right"], ...AIMED_ACTIONS,
  // A punch is thrown by a hand that holds nothing: one holding an item would drive the item's end along the punch's line.
  strikesWith: (spec, _config, effector) => holdsNothing(spec, effector),
  make({ body, guard, aim }, config, actions) {
    const { kind: _, name: __, ...settings } = config;
    return straightPunchExecutor(body, guard, actions.map(a => a.name), settings, aimedPoint(aim));
  },
};
