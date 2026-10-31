import records from "../../../assets/entrants/vanguard/punch.json" with { type: "json" };
import { aimedPoint, AIMED_ACTIONS, type ExecutorPart } from "../../core/skills/framework/executor-part.ts";
import { choice, text } from "../../core/parts/fields.ts";
import { fitsAll, fitsWhen, strikesWithOneOf } from "../../core/parts/parts.ts";
import { recordFault, type SkillRecords } from "../../core/skills/framework/records.ts";
import { straightPunchFits, validStraightPunch, validStraightPunchPart, type StraightPunch } from "../../core/skills/strikes/straight-punch.ts";
import { bodyKey, type BodySpec } from "../../core/spec/body.ts";
import { deepFreeze } from "../../core/state.ts";
import { holdsNothing } from "../../core/skills/strikes/held-strike.ts";
import { committedAim } from "./committed-aim.ts";

/** **One stroke of Vanguard's punch**: the straight punch's settings, and how it follows its point. */
export interface VanguardPunch extends StraightPunch {
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

/** Vanguard's strokes: its standing body punch and its planted low punch. */
type Stroke = "standing" | "low";

/**
 * **Vanguard's punch** (`committedAim`): the straight punch thrown at one point of the foe that it
 * follows through the drive, its stroke's settings its body's record (`SkillRecord`,
 * `assets/entrants/vanguard/punch.json`: each body's calibration, both strokes): a body with none
 * does not throw it. A research `tuning`, which a link does not carry, sets the stroke's settings
 * over the record's, all of them where the body has none.
 */
export interface VanguardPunchConfig {
  readonly kind: "vanguard:punch";
  readonly name: string;
  readonly stroke: Stroke;
  readonly tuning?: Partial<VanguardPunch>;
}

/** **Every body's Vanguard punch record**, by `bodyKey`: its calibration of each stroke. */
const RECORDS: SkillRecords<Readonly<Record<Stroke, VanguardPunch>>> = deepFreeze(records);

const STROKES: readonly (readonly [Stroke, string])[] = [["standing", "Standing"], ["low", "Low"]];
const FLAGS = ["low", "lowOnly", "predict", "anchorAtDrive", "overlapReturn"] as const;

/** What is wrong with a stroke's settings, each a sentence: all of them where `whole`, else those it names. */
function strokeFaults(settings: Partial<VanguardPunch>, whole: boolean): readonly string[] {
  const { low: _, lowOnly: __, predict: ___, anchorAtDrive: ____, overlapReturn: _____, returnHold, ...punch } = settings;
  return [
    ...(whole ? validStraightPunch(punch) : validStraightPunchPart(punch)) ? [] : ["invalid straight punch settings"],
    ...FLAGS.every((flag) => whole ? typeof settings[flag] === "boolean" : settings[flag] === undefined || typeof settings[flag] === "boolean") ? [] : ["low, lowOnly, predict, anchorAtDrive and overlapReturn: booleans"],
    ...returnHold === undefined && !whole || Number.isFinite(returnHold) && returnHold! >= 0 ? [] : ["returnHold: finite nonnegative seconds"],
    ...whole && returnHold! > 0 && !settings.overlapReturn ? ["returnHold needs overlapping recovery"] : [],
  ];
}

/** The settings `config`'s stroke throws on a body of `spec`: its record's, with its research tuning over them. */
const settingsOf = (spec: BodySpec, config: VanguardPunchConfig): VanguardPunch =>
  ({ ...RECORDS[bodyKey(spec)]?.settings[config.stroke], ...config.tuning }) as VanguardPunch;

/** Vanguard's own executor, offered only in its own entrant's trees (`Entrant.parts`). */
export const VANGUARD_PUNCH: ExecutorPart<VanguardPunchConfig> = {
  role: "executor", label: "Committed punch", stage: "experimental",
  defaults: { kind: "vanguard:punch", name: "punch", stroke: "standing" },
  keys: { kind: true, name: true, stroke: true, tuning: true },
  fields: [text("name", "Name"), choice("stroke", "Stroke", STROKES)], slots: [],
  tuning: ["pace", "reach", "band", "aside", "squared", "poised", "above", "settle", "through", "hips", "turn", "lean", "chamber", "lead", "elbow", "brake", "follow", "longest",
    "recover", "landed", "halts", "fire", "ease", "steered", "driven", "timed", ...FLAGS, "returnHold"],
  fits: fitsAll(strikesWithOneOf("hand.left", "hand.right"), fitsWhen(straightPunchFits, "needs both arms on the upper trunk and a thoracic joint"),
    recordFault("Vanguard punch", Object.keys(RECORDS), (tuning: Partial<VanguardPunch>) => strokeFaults(tuning, true).length === 0)),
  faults: (config) => [
    ...STROKES.some(([stroke]) => stroke === config.stroke) ? [] : ["stroke: standing or low"],
    ...config.tuning === undefined ? [] : strokeFaults(config.tuning, false),
  ],
  effectors: ["hand.left", "hand.right"], ...AIMED_ACTIONS,
  // A punch is thrown by a hand that holds nothing, as the straight punch's.
  strikesWith: (spec, _config, effector) => holdsNothing(spec, effector),
  make: ({ body, guard, aim }, config, actions) => committedAim(body, guard, actions.map(action => action.name), settingsOf(body.built.spec, config), aimedPoint(aim)),
};
