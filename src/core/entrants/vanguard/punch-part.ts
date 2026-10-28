import { aimedPoint, AIMED_ACTIONS, type ExecutorPart } from "../../mind/executor-part.ts";
import { number, text, toggle } from "../../mind/fields.ts";
import { fitsAll, fitsWhen, strikesWithOneOf } from "../../mind/parts.ts";
import { STRAIGHT_PUNCH, straightPunchFits, validStraightPunch, type StraightPunch } from "../../skills/straight-punch.ts";
import { holdsNothing } from "../../skills/strikes.ts";
import { committedAim } from "./committed-aim.ts";

/**
 * **Vanguard's punch** (`committedAim`): the straight punch, its settings these, thrown at one
 * point of the foe that it follows through the drive.
 */
export interface VanguardPunchConfig extends StraightPunch {
  readonly kind: "vanguard-punch";
  readonly name: string;
  /** Against a low foe: aim at the highest surface of the target region (`lowAim`), and keep the planted fold while the trunk is bent for it. */
  readonly low: boolean;
  /** Throw only at a low foe; any other target is blocked. */
  readonly lowOnly: boolean;
  /** Lead the followed point by its motion. */
  readonly predict: boolean;
  /** Choose the point again each step until the drive commits. */
  readonly anchorAtDrive: boolean;
  /** Free the trunk and legs during the arm's recovery, so another punch may begin. */
  readonly overlapReturn: boolean;
  /** Seconds of recovery that keep the trunk and legs before an overlapping return frees them. */
  readonly returnHold: number;
}

/** What is wrong with a Vanguard punch's own settings. */
function faults(config: VanguardPunchConfig): readonly string[] {
  const { kind: _, name: __, low, lowOnly, predict, anchorAtDrive, overlapReturn, returnHold, ...settings } = config;
  return [
    ...validStraightPunch(settings) ? [] : ["invalid straight punch settings"],
    ...[low, lowOnly, predict, anchorAtDrive, overlapReturn].every(flag => typeof flag === "boolean") ? [] : ["low, lowOnly, predict, anchorAtDrive and overlapReturn: booleans"],
    ...Number.isFinite(returnHold) && returnHold >= 0 ? [] : ["returnHold: finite nonnegative seconds"],
    ...returnHold > 0 && !overlapReturn ? ["returnHold needs overlapping recovery"] : [],
  ];
}

/** Vanguard's own executor, offered only in its own minds' slots (`Controller.parts`). */
export const VANGUARD_PUNCH: ExecutorPart<VanguardPunchConfig> = {
  role: "executor", label: "Committed punch", stage: "experimental",
  defaults: { kind: "vanguard-punch", name: "punch", ...STRAIGHT_PUNCH, low: false, lowOnly: false, predict: false, anchorAtDrive: false, overlapReturn: false, returnHold: 0 },
  keys: {
    kind: true, name: true, pace: true, reach: true, band: true, aside: true, squared: true, poised: true, above: true, settle: true, through: true, hips: true, turn: true,
    lean: true, chamber: true, lead: true, elbow: true, brake: true, follow: true, longest: true,
    recover: true, landed: true, halts: true, fire: true, ease: true, steered: true, driven: true, timed: true, low: true, lowOnly: true, predict: true, anchorAtDrive: true, overlapReturn: true, returnHold: true,
  },
  fields: [text("name", "Name"), toggle("low", "Aim and fold for a low foe"), toggle("lowOnly", "Only at a low foe"),
    toggle("predict", "Lead the followed point"), toggle("anchorAtDrive", "Choose the point until the drive"),
    toggle("overlapReturn", "Allow another punch during recovery"), number("returnHold", "Body hold during recovery", 0, 2, .01, "s")],
  slots: [], fits: fitsAll(strikesWithOneOf("hand.left", "hand.right"), fitsWhen(straightPunchFits, "needs both arms on the upper trunk and a thoracic joint")),
  faults, effectors: ["hand.left", "hand.right"], ...AIMED_ACTIONS,
  // A punch is thrown by a hand that holds nothing, as the straight punch's.
  strikesWith: (spec, _config, effector) => holdsNothing(spec, effector),
  make: ({ body, guard, aim }, config, actions) => committedAim(body, guard, actions.map(action => action.name), config, aimedPoint(aim)),
};
