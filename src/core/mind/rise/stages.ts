/**
 * **A rise, as data** (`Recipe`): what a body that is down does to stand, stage by stage, and what
 * it bears on while it does. The player (`stagedRise`, `staged.ts`) knows the kinds of stage and of
 * limb, and no body; a recipe names the channels, segments and joints of the bodies it is for.
 */
import type { BearingEndSpec, BodySpec, JointSpec } from "../../spec/body.ts";
import { deepFreeze } from "../../state.ts";

/** How a body lies: on its front, its back, or a side (the side that is down). */
export type Lie = "front" | "back" | "left" | "right";

/**
 * **A posture**: goal angles by channel name, rad, each from its freedom's own zero (a human's,
 * the anatomical position: `DofSpec.bind`), so it is the same shape on bodies whose reference
 * poses differ. A channel it does not name goes to that zero.
 */
type Posture = Readonly<Record<string, number>>;

/** **A stage that is a pose**: every freedom driven toward `posture` for `seconds`. */
export interface PoseStage {
  readonly kind: "pose";
  readonly name: string;
  readonly posture: Posture;
  readonly seconds: number;
  /**
   * How hard it drives: each freedom asked the speed that would close its error in `within` s, no
   * faster than `speed`, rad/s, and with `turning`, that speed asked of its joint through the way
   * the joint turns its freedoms (`MuscleDriver.turning`, as `poseDrive`); absent, the player's
   * own pose drive.
   */
  readonly drive?: { readonly speed: number; readonly within: number; readonly turning?: boolean };
  /**
   * In a roll, the side it turns the body over: the side that goes under. A body rolled from its
   * back that comes onto its other side goes on over that one, by that side's roll.
   */
  readonly over?: Exclude<Lie, "front" | "back">;
  /**
   * Held past `seconds` until the body lies turned onto its `over` side by `turned` (how far the
   * pelvis's axis toward its other side points up, of 1), and at most `most` times `seconds`.
   */
  readonly hold?: { readonly turned: number; readonly most: number };
  /** What ends it, read each step; `seconds` is then the longest it may take, past which the attempt is over. Absent, its time ends it. */
  readonly until?: Until;
  /** Its posture approached at a pace the feet allow; absent, driven toward at once. */
  readonly pace?: Pace;
}

/**
 * **What ends a pose stage**: every reading it names, held `for` s: each foot's ball (its sole's
 * front edge) within `balls` m of the ground; each channel of `past` at least its angle, rad, from
 * its own zero; the centre of mass slower than `slow`, m/s; a paced stage at least `along` of its way.
 */
export interface Until {
  readonly balls?: number;
  readonly past?: Posture;
  readonly slow?: number;
  readonly along?: number;
  readonly for: number;
}

/**
 * **A paced pose**: the posture approached from the one the stage begins in along a way from 0 to
 * 1, at `rate` of it a second while each foot's ball is within `lift` m of the ground and the
 * centre of mass is slower than `slow`, m/s, and held where it is otherwise. Each channel of
 * `press`, written `name.@ motion` for a foot's own side, is asked past the way's posture by its
 * rad a metre that foot's ball stands over half `lift`: what turns a rising foot's ball back down
 * (`docs/reference/rising.md#the-sit-back`).
 */
export interface Pace {
  readonly rate: number;
  readonly lift: number;
  readonly slow: number;
  readonly press: Readonly<Record<string, number>>;
}

/**
 * **A stage that is a bearing**: the body borne on `on` by the bearing solve
 * (`src/core/control/bearing.ts`), its centre of mass carried to a place over them.
 */
export interface BearStage {
  readonly kind: "bear";
  readonly name: string;
  /**
   * The limbs that bear, by the recipe's names, each with its share of the place the centre of
   * mass is held over: the middle of their points, weighed so. The shares sum to 1.
   */
  readonly on: readonly { readonly limb: string; readonly share: number }[];
  /**
   * The limbs it leaves, by the recipe's names: each bears where it is until the centre of mass
   * is over the limbs of `on`, which can then bear the body alone, and from then is the servo's,
   * driven toward the posture. The stage is not done until it has let them go.
   */
  readonly leave: readonly string[];
  /**
   * Whether a limb propped on a foot holds the body over where the foot stands rather than over
   * the middle of the limb's patch: the centre of mass brought onto the toes, off the knee.
   */
  readonly overProp: boolean;
  /** The feet it bears on that bear on their toes, by the recipe's names: each on its sole's front edge, its heel let up. */
  readonly toes?: readonly string[];
  /**
   * The centre of mass's height over the ground, as a part of its standing height
   * (`Uprightness.standing`); null where the limbs it bears on leave the body none of its own (a
   * body on its shins is as high as its thighs' turn puts it), and its rise and fall are damped.
   */
  readonly height: number | null;
  /**
   * The pelvis's pitch forward from upright, about the level axis across the way it faces, rad;
   * null where the limbs it bears on leave the pelvis no pitch of its own: its turn is then only
   * damped, and goes as they take it.
   */
  readonly pitch: number | null;
  /**
   * What every freedom the bearing limbs' tasks do not take is driven toward: a posture, or the
   * body's reference pose, which no posture names since the bodies' differ.
   */
  readonly posture: Posture | "reference";
  /** The time constant of its aims, s. */
  readonly seconds: number;
  /** The joint servo's posture response, s; absent, the bearing response also drives its posture. */
  readonly postureSeconds?: number;
  /** The longest it may take, s: past it the attempt is over. */
  readonly limit: number;
  /** How near its aims, and how slow, the body is for this stage to be done; absent, the recipe's. */
  readonly progress?: { readonly speed?: number; readonly near?: number; readonly turn?: number };
}

/** A stage of a rise, by kind. */
export type Stage = PoseStage | BearStage;


/**
 * **A rise**: the limbs its bearing stages may name, the stages that turn the body onto its front
 * from each other way it lies, and the stages that stand it up from its front. It names channels,
 * segments and joints of the bodies it is for, and nothing in the player does.
 */
export interface Recipe {
  /** Intermediate transition tolerances; final standing is verified by the recovery host. */
  readonly progress?: {
    readonly speed?: number;
    readonly near?: number;
    readonly turn?: number;
    readonly settleSpeed?: number;
    readonly settleSeconds?: number;
    /**
     * A bearing stage whose body has come to rest short of its aims is done too: its limbs down
     * and let go, the body as slow as the stage asks, and the centre of mass and the pelvis within
     * `restWiden` times the stage's tolerances for `restSeconds`, s. Absent, a stage is done at
     * its aims alone.
     */
    readonly restSeconds?: number;
    readonly restWiden?: number;
  };
  /**
   * The segments of the trunk, by name: once the rise has had every one of them clear of the
   * ground, any one of them down again ends the attempt.
   */
  readonly trunk: readonly string[];
  readonly roll: Readonly<Record<Exclude<Lie, "front">, readonly PoseStage[]>>;
  readonly rise: readonly Stage[];
  /** Whether its last stage, a bearing one, holds the body there once reached, its time unlimited; absent, the rise ends there. */
  readonly holds?: boolean;
}

const SIDES = ["left", "right"] as const;
type Side = (typeof SIDES)[number];

/** `posture` with each channel written `name.@ motion` given to both sides. */
function bothSides(posture: Posture): Posture {
  return Object.fromEntries(Object.entries(posture).flatMap(([name, angle]) =>
    name.includes("@") ? SIDES.map((side) => [name.replace("@", side), angle]) : [[name, angle]]));
}

/**
 * `posture` for a roll over the body's `over` side: a channel written `name.near motion` is that
 * side's, the one that goes under, and `name.far motion` the other's, which comes over the top.
 */
function rollingOver(over: Side, posture: Posture): Posture {
  const far = over === "left" ? "right" : "left";
  return Object.fromEntries(Object.entries(posture).map(([name, angle]) => [name.replace(".near ", `.${over} `).replace(".far ", `.${far} `), angle]));
}

/**
 * The far leg raised and out to its own side, the near arm laid overhead, out of the roll's way
 * (`docs/reference/rising.md#the-roll`).
 */
const WIND = { "hip.far flexion": 1.2, "hip.far abduction": 0.54, "hip.near flexion": 0.2, "shoulder.near flexion": 2.8 };
/**
 * The far leg and the far arm swung across the body, the pelvis curled off the ground, the near
 * leg set out to its side and the near arm swept out from overhead: the body turns onto its near
 * side (`docs/reference/rising.md#the-roll`).
 */
const SWING = {
  "hip.far flexion": 0.8, "hip.far internal rotation": 0.6, "hip.near abduction": 0.2, "lumbar flexion": 0.8,
  "shoulder.far flexion": 1.4, "shoulder.near flexion": 1.2, "shoulder.near abduction": 2,
};
/**
 * The trunk and the near leg laid straight, the near arm overhead, and the far leg kept ahead:
 * the body goes on over its near side onto its front (`docs/reference/rising.md#the-roll`).
 */
const OVER = { "hip.far flexion": 1.2, "hip.far abduction": 0.54, "shoulder.near flexion": 2.8 };
/**
 * The legs laid straight, the near arm kept overhead and the far hand set down beside the chest:
 * the body lies on its front as the rise finds it (`docs/reference/rising.md#the-roll`).
 */
const FLAT = { "shoulder.near flexion": 2.8, "shoulder.far internal rotation": -0.8, "elbow.far flexion": 2.1 };

/** The stages that turn a body on its back onto its front, over its `over` side. */
export const rollOver = (over: Side): PoseStage[] => [
  { kind: "pose", name: "wind", posture: rollingOver(over, WIND), seconds: 0.5, over },
  // Held until the body is on its near side (`docs/reference/rising.md#the-roll`).
  { kind: "pose", name: "swing", posture: rollingOver(over, SWING), seconds: 1, over, hold: { turned: 0.6, most: 3 } },
  { kind: "pose", name: "over", posture: rollingOver(over, OVER), seconds: 0.5, over },
  { kind: "pose", name: "flat", posture: rollingOver(over, FLAT), seconds: 1, over },
];

/**
 * The arms folded, the hands beside the chest, and the feet pointed, so that the knees slide
 * under the body (`docs/reference/rising.md#stages`).
 */
const FOLD = { "shoulder.@ flexion": 0.9, "shoulder.@ abduction": 0.7, "elbow.@ flexion": 2.4, "ankle.@ dorsiflexion": -0.85 };
/**
 * The knees drawn under the body, the trunk curled over them, the arms out to the sides so that the
 * body does not tip onto a side as it comes up (`docs/reference/rising.md#the-pose-stages`).
 */
const TUCK = { ...FOLD, "hip.@ flexion": 2.1, "knee.@ flexion": 2.5, "lumbar flexion": 0.7, "thoracic flexion": 0.3, "shoulder.@ abduction": 1.6 };
/**
 * The arms brought in and reached ahead, the hands turned palm down, and the toes tucked under, so
 * that each shin is propped on its foot (`docs/reference/rising.md#stages`).
 */
const PROP = {
  ...TUCK, "lumbar flexion": 0.4, "shoulder.@ flexion": 1.3, "shoulder.@ internal rotation": -0.4, "elbow.@ flexion": 1,
  "wrist.@ flexion": -1.2, "ankle.@ dorsiflexion": 0.38, "shoulder.@ abduction": 0.7,
};
/**
 * On knees and hands: the trunk near level, the arms near straight under the shoulders, the hips
 * over the knees (`docs/reference/rising.md#stages`).
 */
const FOURS = {
  "lumbar flexion": 0.3, "thoracic flexion": 0.2, "shoulder.@ flexion": 1.9, "shoulder.@ abduction": 0.3, "shoulder.@ internal rotation": -0.4,
  "elbow.@ flexion": 0.3, "wrist.@ flexion": -0.8, "hip.@ flexion": 1.9, "knee.@ flexion": 2.4, "ankle.@ dorsiflexion": 0.38,
};

/**
 * Sat back on the heels from the knees, the hands off the ground, and the toes let a little out
 * from under the feet, which the tall stages tuck again (`docs/reference/rising.md#the-kneel-up`).
 */
const SIT = {
  "lumbar flexion": -0.2, "shoulder.@ flexion": 0.6, "shoulder.@ abduction": 0.2, "wrist.@ flexion": -1, "hip.@ flexion": 2, "knee.@ flexion": 2.55,
  "ankle.@ dorsiflexion": -0.4,
};
/** Upright on the knees, the trunk over them (`docs/reference/rising.md#the-kneel-up`). */
const KNEEL = { ...SIT, "neck flexion": -0.29, "thoracic flexion": 0.12, "lumbar flexion": 0.18, "hip.@ flexion": 0.4 };
/** Upright on the knees, the forearms brought in across the body (`docs/reference/rising.md#the-kneel-up`). */
const KNEEL_ARMS = { ...KNEEL, "shoulder.@ flexion": -0.09, "shoulder.@ abduction": 0.28, "shoulder.@ internal rotation": 0.54, "elbow.@ flexion": 1.17, "wrist.@ flexion": -0.04 };
/** Tall on the knees, the hips and the trunk straight (`docs/reference/rising.md#the-kneel-up`). */
const TALL = {
  "shoulder.@ abduction": 0.28, "shoulder.@ internal rotation": 0.54, "elbow.@ flexion": 0.3, "wrist.@ flexion": -0.04, "hip.@ flexion": 0.25,
  "knee.@ flexion": 2.2, "ankle.@ dorsiflexion": 0.389,
};
/** Tall on the knees, leant a little to the right, the left hip out and the right in (`docs/reference/rising.md#the-step`). */
const SHIFT = { ...TALL, "lumbar lateral flexion right": 0.05, "hip.left abduction": 0.15, "hip.right abduction": -0.15 };
/** The left knee lifted off the ground, its foot pointed (`docs/reference/rising.md#the-step`). */
const LIFT = { ...SHIFT, "lumbar flexion": -0.2, "hip.left flexion": 0.35, "hip.left abduction": 0.17, "knee.left flexion": 2.56, "ankle.left dorsiflexion": -0.85 };
/** The left thigh swung forward (`docs/reference/rising.md#the-step`). */
const SWING_THROUGH = { ...LIFT, "hip.left flexion": 1.8, "hip.left abduction": 0.1 };
/**
 * The left foot reached out and down ahead, still pointed, so that it comes down on its toes
 * (`docs/reference/rising.md#the-step`).
 */
const REACH = { ...SWING_THROUGH, "hip.left abduction": 0.56, "knee.left flexion": 2, "ankle.left inversion": 0.56 };
/**
 * Half kneeling, on the right knee and the left sole: the posture the statics find holds it at the
 * least share of its strength, but the left ankle, which is asked toward where the stand leaves it
 * (`docs/reference/rising.md#the-step`).
 */
const HALF_KNEEL = {
  "neck flexion": -0.26, "neck lateral flexion right": -0.19, "neck rotation right": -0.55, "thoracic flexion": 0.19, "thoracic lateral flexion right": 0.03,
  "thoracic rotation right": 0.26, "lumbar flexion": -0.08, "lumbar lateral flexion right": 0.01, "lumbar rotation right": -0.087,
  "shoulder.left flexion": 0.05, "shoulder.right flexion": -0.89, "shoulder.left abduction": 0.46, "shoulder.right abduction": 0.37,
  "shoulder.left internal rotation": 0.2, "shoulder.right internal rotation": -0.39, "elbow.left flexion": 2.22, "elbow.right flexion": 2.34,
  "wrist.left flexion": 0.78, "wrist.right flexion": -0.83, "hip.left flexion": 1.63, "hip.right flexion": 0.64, "hip.left abduction": 0.56,
  "hip.right abduction": -0.02, "hip.left internal rotation": 0.59, "hip.right internal rotation": -0.21, "knee.left flexion": 2.01,
  "knee.right flexion": 2.567, "ankle.left dorsiflexion": -0.55, "ankle.right dorsiflexion": 0.389, "ankle.left inversion": 0.56, "ankle.right inversion": 0.24,
};
/**
 * The lunge's rungs, from the half kneel to standing, the left foot ahead: at each height of the
 * centre of mass, as a part of the standing one, the posture on the left sole and the right ball
 * that the statics find holds it at the least share of its strength, and the left foot's share of
 * the load there: where that posture's centre of mass stands between the feet, but on the first
 * rung, which keeps the share of the stage before (`docs/reference/rising.md#the-lunge`).
 */
const LUNGE = [
  {
    height: 0.59, share: 0.6, posture: {
      "neck flexion": 0.52, "neck lateral flexion right": 0.11, "neck rotation right": 1.15, "thoracic flexion": 0.04, "thoracic lateral flexion right": 0.03,
      "thoracic rotation right": 0.38, "lumbar flexion": -0.08, "lumbar lateral flexion right": 0.17, "lumbar rotation right": -0.07,
      "shoulder.left flexion": -0.45, "shoulder.right flexion": -0.49, "shoulder.left abduction": 0.62, "shoulder.right abduction": 2,
      "shoulder.left internal rotation": 0.14, "shoulder.right internal rotation": -0.7, "elbow.left flexion": 2.13, "elbow.right flexion": 2.25,
      "wrist.left flexion": -0.81, "wrist.right flexion": -0.49, "hip.left flexion": 1.77, "hip.right flexion": 0.89, "hip.left abduction": 0.19,
      "hip.right abduction": -0.01, "hip.left internal rotation": -0.12, "hip.right internal rotation": -0.4, "knee.left flexion": 1.89,
      "knee.right flexion": 2.56, "ankle.left dorsiflexion": 0.06, "ankle.right dorsiflexion": -0.01, "ankle.left inversion": -0.24, "ankle.right inversion": -0.28,
    },
  },
  {
    height: 0.69, share: 0.67, posture: {
      "neck flexion": 0.13, "neck lateral flexion right": 0.12, "neck rotation right": 0.94, "thoracic flexion": 0.05, "thoracic rotation right": 0.38,
      "lumbar flexion": -0.11, "lumbar lateral flexion right": 0.16, "lumbar rotation right": -0.07,
      "shoulder.left flexion": -0.59, "shoulder.right flexion": -0.32, "shoulder.left abduction": 0.53, "shoulder.right abduction": 2.39,
      "shoulder.left internal rotation": 0.11, "shoulder.right internal rotation": -0.53, "elbow.left flexion": 2.2, "elbow.right flexion": 2.22,
      "wrist.left flexion": -0.57, "wrist.right flexion": -0.7, "hip.left flexion": 1.82, "hip.right flexion": 0.89, "hip.left abduction": 0.02,
      "hip.right abduction": -0.17, "hip.left internal rotation": -0.22, "hip.right internal rotation": -0.28, "knee.left flexion": 1.78,
      "knee.right flexion": 2.08, "ankle.left dorsiflexion": 0.37, "ankle.right dorsiflexion": -0.01, "ankle.@ inversion": -0.32,
    },
  },
  {
    height: 0.79, share: 0.79, posture: {
      "neck flexion": -0.14, "neck lateral flexion right": 0.09, "neck rotation right": 1.07, "thoracic flexion": -0.09, "thoracic lateral flexion right": -0.08,
      "thoracic rotation right": 0.31, "lumbar flexion": -0.07, "lumbar lateral flexion right": 0.16, "lumbar rotation right": -0.05,
      "shoulder.left flexion": -0.35, "shoulder.right flexion": -0.29, "shoulder.left abduction": 0.88, "shoulder.right abduction": 2.28,
      "shoulder.left internal rotation": -0.07, "shoulder.right internal rotation": -0.86, "elbow.left flexion": 2.26, "elbow.right flexion": 2.2,
      "wrist.left flexion": -0.71, "wrist.right flexion": -0.56, "hip.left flexion": 1.68, "hip.right flexion": 0.98, "hip.left abduction": -0.03,
      "hip.right abduction": -0.2, "hip.left internal rotation": -0.24, "hip.right internal rotation": -0.05, "knee.left flexion": 1.43,
      "knee.right flexion": 1.69, "ankle.left dorsiflexion": 0.37, "ankle.right dorsiflexion": -0.26, "ankle.left inversion": -0.33, "ankle.right inversion": -0.22,
    },
  },
  {
    height: 0.89, share: 0.75, posture: {
      "neck flexion": -0.23, "neck lateral flexion right": -0.02, "neck rotation right": 1.13, "thoracic flexion": -0.18, "thoracic lateral flexion right": -0.04,
      "thoracic rotation right": 0.3, "lumbar flexion": -0.19, "lumbar lateral flexion right": 0.22, "lumbar rotation right": -0.04,
      "shoulder.left flexion": -1.07, "shoulder.right flexion": 0.2, "shoulder.left abduction": 1.71, "shoulder.right abduction": 2.28,
      "shoulder.left internal rotation": 0.12, "shoulder.right internal rotation": -1.07, "elbow.left flexion": 2.24, "elbow.right flexion": 2.29,
      "wrist.left flexion": -0.89, "wrist.right flexion": -0.55, "hip.left flexion": 1.21, "hip.right flexion": 0.59, "hip.left abduction": 0.02,
      "hip.right abduction": -0.14, "hip.left internal rotation": -0.29, "hip.right internal rotation": 0.07, "knee.left flexion": 1.21,
      "knee.right flexion": 1.38, "ankle.left dorsiflexion": 0.389, "ankle.right dorsiflexion": -0.4, "ankle.left inversion": -0.26, "ankle.right inversion": -0.25,
    },
  },
] as const;

/** `count` postures evenly on the way from `from` to `to`, the last `to`. */
function between(from: Posture, to: Posture, count: number): Posture[] {
  const names = [...new Set([...Object.keys(from), ...Object.keys(to)])];
  return Array.from({ length: count }, (_, k) => Object.fromEntries(names.map((name) => {
    const a = from[name] ?? 0, b = to[name] ?? 0;
    return [name, a + (b - a) * (k + 1) / count];
  })));
}

/** The pelvis's pitch forward tall on the knees, rad: about the turn the tall posture's hips leave it. */
const KNEEL_PITCH = 0.15;
/** The pose drive of the step's quick stages (`docs/reference/rising.md#the-step`). */
const QUICK = { speed: 6, within: 0.1 };
/** A bearing stage's time constant, s, and the longest it may take, s, from the knees up (`docs/reference/rising.md#the-step`). */
const BEAR_SECONDS = 0.35, BEAR_LIMIT = 4;

/**
 * The game's recipe, for a human and the skeleton, whose channels, segments and joints have the
 * same names (`docs/reference/rising.md#stages`: each stage's numbers, and the stand's reading of
 * each).
 */
export const RISE: Recipe = deepFreeze({
  // From its back a body rolls over its right side; on a side, it goes on over that side.
  roll: { back: rollOver("right"), left: rollOver("left").slice(2), right: rollOver("right").slice(2) },
  rise: [
    { kind: "pose", name: "fold", posture: bothSides(FOLD), seconds: 1 },
    // The pelvis comes off the ground over the shins.
    { kind: "pose", name: "tuck", posture: bothSides(TUCK), seconds: 2 },
    // The arms prop the trunk.
    { kind: "pose", name: "prop", posture: bothSides(PROP), seconds: 1.5 },
    // The shins bear two thirds of the body and the hands a third: the centre of mass is held
    // that far between them. The shins leave the body no height of its own.
    {
      kind: "bear", name: "fours", on: SIDES.flatMap((side) => [{ limb: `shin.${side}`, share: 0.33 }, { limb: `hand.${side}`, share: 0.17 }]),
      leave: [], overProp: false, height: null, pitch: 1.3, posture: bothSides(FOURS), seconds: 0.4, limit: 5,
    },
    // The kneel-up: back onto the heels, the trunk raised over the knees, the arms in, then tall.
    { kind: "pose", name: "sit", posture: bothSides(SIT), seconds: 1 },
    ...between(bothSides(SIT), bothSides(KNEEL), 3).map((posture, k): PoseStage => ({ kind: "pose", name: `kneel ${k}`, posture, seconds: 0.25 })),
    { kind: "pose", name: "arms", posture: bothSides(KNEEL_ARMS), seconds: 0.3 },
    { kind: "pose", name: "hold", posture: bothSides(KNEEL_ARMS), seconds: 1 },
    ...between(bothSides(KNEEL_ARMS), bothSides(TALL), 3).map((posture, k): PoseStage => ({ kind: "pose", name: `tall ${k}`, posture, seconds: 0.5 })),
    { kind: "pose", name: "tall", posture: bothSides(TALL), seconds: 1 },
    // The step: the weight onto the right knee, and the left foot brought through and set down ahead.
    { kind: "pose", name: "shift", posture: bothSides(SHIFT), seconds: 0.6 },
    { kind: "pose", name: "lift", posture: bothSides(LIFT), seconds: 0.35, drive: QUICK },
    { kind: "pose", name: "swing", posture: bothSides(SWING_THROUGH), seconds: 0.42, drive: QUICK },
    { kind: "pose", name: "reach", posture: bothSides(REACH), seconds: 0.25, drive: QUICK },
    // Half kneeling, borne on the right shin and the left foot; then the weight onto the right
    // toes. Neither leaves the body a height or the pelvis a pitch of its own.
    {
      kind: "bear", name: "half kneel", on: [{ limb: "shin.right", share: 0.65 }, { limb: "foot.left", share: 0.35 }], leave: [], overProp: false,
      height: null, pitch: null, posture: bothSides(HALF_KNEEL), seconds: BEAR_SECONDS, limit: BEAR_LIMIT,
    },
    {
      kind: "bear", name: "onto the toes", on: [{ limb: "shin.right", share: 0.4 }, { limb: "foot.left", share: 0.6 }], leave: [], overProp: true,
      height: null, pitch: null, posture: bothSides(HALF_KNEEL), seconds: BEAR_SECONDS, limit: BEAR_LIMIT,
    },
    // The lunge, on both feet, up its rungs; then the weight even on the feet, which the stance's
    // own recovery reads as standing (`docs/reference/rising.md#the-handover`).
    ...LUNGE.map(({ height, share, posture }, k): BearStage => ({
      kind: "bear", name: `lunge ${k}`, on: [{ limb: "foot.left", share }, { limb: "foot.right", share: 1 - share }], leave: [], overProp: false,
      height, pitch: null, posture: bothSides(posture), seconds: BEAR_SECONDS, limit: BEAR_LIMIT,
    })),
    {
      kind: "bear", name: "even", on: SIDES.map((side) => ({ limb: `foot.${side}`, share: 0.5 })), leave: [], overProp: false,
      height: LUNGE[3].height, pitch: null, posture: bothSides(LUNGE[3].posture), seconds: BEAR_SECONDS, limit: BEAR_LIMIT,
    },
  ],
  trunk: ["lowerTrunk", "middleTrunk", "upperTrunk", "head"],
});

/**
 * **The contact sequence**: the game's recipe with its kneel-up borne. From hands and knees the
 * weight is pushed back by the hands, which still bear a part of it, and the body is carried up
 * tall on its knees by the bearing solve on both shins, the hands let go once the centre of mass
 * is over the shins and the pelvis brought upright, where the recipe sits back on its heels and
 * poses its way up at full activation; its torques are the solve's, bounded by the muscles.
 * An experiment's (`research/rising-step-search.mjs --recipe contact`): the shins bear on their
 * knees alone, their feet held up off the ground, so the hands are never let go.
 */
export const CONTACT_RISE: Recipe = deepFreeze({
  ...RISE,
  rise: [
    ...RISE.rise.slice(0, RISE.rise.findIndex((stage) => stage.name === "fours") + 1),
    // The weight pushed back toward the knees by the hands, which still bear a part of it.
    {
      kind: "bear", name: "back", on: SIDES.flatMap((side) => [{ limb: `shin.${side}`, share: 0.4 }, { limb: `hand.${side}`, share: 0.1 }]), leave: [],
      overProp: false, height: null, pitch: null, posture: bothSides(FOURS), seconds: BEAR_SECONDS, limit: BEAR_LIMIT,
    },
    // Then up, tall on the knees, the hands let go once the weight is over the shins.
    {
      kind: "bear", name: "kneel up", on: SIDES.map((side) => ({ limb: `shin.${side}`, share: 0.5 })), leave: SIDES.map((side) => `hand.${side}`),
      overProp: false, height: null, pitch: KNEEL_PITCH, posture: bothSides(TALL), seconds: BEAR_SECONDS, limit: BEAR_LIMIT,
    },
    ...RISE.rise.slice(RISE.rise.findIndex((stage) => stage.name === "shift")),
  ],
});

/**
 * Sat back on the heels, the toes tucked under, the hips flexed to bring the trunk up over the
 * feet and the arms forward (`docs/reference/rising.md#the-sit-back`).
 */
const TUCK_SIT = {
  "thoracic flexion": 0.1, "shoulder.@ flexion": 0.9, "shoulder.@ abduction": 0.15, "elbow.@ flexion": 0.3, "hip.@ flexion": 0.7,
  "hip.@ abduction": 0.15, "knee.@ flexion": 2.55, "ankle.@ dorsiflexion": 0.3,
};
/**
 * Kneeling up toward the feet, the toes tucked, the trunk over the hips and the arms a little
 * forward as a counterweight (`docs/reference/rising.md#the-sit-back`).
 */
const UPRIGHT = {
  "thoracic flexion": 0.1, "shoulder.@ flexion": 0.2, "shoulder.@ abduction": 0.15, "elbow.@ flexion": 0.4, "hip.@ flexion": 0.6,
  "hip.@ abduction": 0.15, "knee.@ flexion": 2.567, "ankle.@ dorsiflexion": 0.7,
};

/**
 * **The sit-back**: from hands and knees on toes, the toes planted under the feet, sat back onto the
 * heels and the hands off, then the weight brought up over the feet at the pace their balls stay
 * down, where the stance takes the body to standing (`docs/reference/rising.md#the-sit-back`). For
 * a body with toes, on the game's humans' names.
 */
export const SIT_BACK: Recipe = deepFreeze({
  ...RISE,
  roll: { back: [], left: [], right: [] },
  rise: [
    // The ankles bent until each foot's ball is on the ground.
    { kind: "pose", name: "plant", posture: bothSides({ ...FOURS, "ankle.@ dorsiflexion": 0.7 }), seconds: 1, drive: { speed: 2, within: 0.2, turning: true }, until: { balls: 0.01, for: 0.1 } },
    { kind: "pose", name: "sit", posture: bothSides(TUCK_SIT), seconds: 1.5, drive: { speed: 3, within: 0.2, turning: true }, until: { past: bothSides({ "knee.@ flexion": 2.5 }), for: 0.05 } },
    {
      kind: "pose", name: "up", posture: bothSides(UPRIGHT), seconds: 4, drive: { speed: 2, within: 0.2, turning: true },
      pace: { rate: 1.6, lift: 0.03, slow: 0.3, press: { "hip.@ flexion": 8 } }, until: { along: 0.85, slow: 0.3, for: 0.05 },
    },
  ],
});

/**
 * **A lowering**: how a body standing comes down to bear on `ends` (`BodySpec.ends`' names): its
 * feet set at `footing` first, each foot's end that far ahead of where it stands along the way the
 * body faces, m, then `recipe`'s rise played from its first stage and its last held. Borne so, its
 * centre of mass is `rests` of its standing height (`Uprightness.standing`) over the ground.
 */
export interface Lowering {
  readonly ends: readonly string[];
  readonly footing: Readonly<Record<string, number>>;
  readonly rests: number;
  readonly recipe: Recipe;
}

/** A stage of the rise by name. */
const riseStage = (name: string): Stage => RISE.rise.find((stage) => stage.name === name)!;

/**
 * **The kneel-down**: the rise's step played back (`docs/reference/rising.md#the-kneel-down`). The
 * feet set in a lunge, the left ahead; the lunge's rungs down, the right foot on its toes, and one
 * lower, until the right knee is at the ground; half kneeling; the step's poses back, which bring
 * the left knee down beside the right; and tall on both knees, borne on the shins and held.
 */
export const KNEEL_DOWN: Lowering = deepFreeze({
  ends: ["shin.left", "shin.right"],
  footing: { "foot.left": 0.35, "foot.right": -0.45 },
  rests: 0.47,
  recipe: {
    ...RISE,
    roll: { back: [], left: [], right: [] },
    progress: { restSeconds: 0.5, restWiden: 2.5 },
    holds: true,
    rise: [
      ...["lunge 3", "lunge 2", "lunge 1", "lunge 0"].map((name) => ({ ...riseStage(name) as BearStage, toes: ["foot.right"] })),
      { ...riseStage("lunge 0") as BearStage, name: "lunge low", toes: ["foot.right"], height: 0.5 },
      riseStage("half kneel"),
      ...["reach", "swing", "lift", "shift", "tall"].map(riseStage),
      {
        kind: "bear", name: "kneel", on: SIDES.map((side) => ({ limb: `shin.${side}`, share: 0.5 })), leave: [], overProp: false,
        height: null, pitch: KNEEL_PITCH, posture: bothSides(TALL), seconds: BEAR_SECONDS, limit: BEAR_LIMIT,
      },
    ],
  },
});

/** The lowerings a human's legs know, each by the ends it bears on. */
export const LOWERINGS: readonly Lowering[] = Object.freeze([KNEEL_DOWN]);

/** Every stage of `recipe`: each roll's, then the rise's. */
export const stagesOf = (recipe: Recipe): readonly Stage[] => [...recipe.roll.back, ...recipe.roll.left, ...recipe.roll.right, ...recipe.rise];

/** `joint`'s freedoms as channel names. */
const channelsOf = (joint: JointSpec): string[] => joint.dofs.map((dof) => `${joint.name} ${dof.positive}`);

/** The joints of `spec` from its root out to the segment named `segment`, root first. */
function chainOf(spec: BodySpec, segment: string): JointSpec[] {
  const chain: JointSpec[] = [];
  for (let at = segment, joint = spec.joints.find((j) => j.child === at); joint; at = joint.parent, joint = spec.joints.find((j) => j.child === at)) {
    chain.unshift(joint);
  }
  return chain;
}

/**
 * The channels `limb`'s own chain has on `spec`, root outward, and its stem's; null if the body
 * has no such limb (`limbFaults` says why).
 */
export function limbChannels(limb: BearingEndSpec, spec: BodySpec): { readonly chain: string[]; readonly stem: string[] } | null {
  const joints = chainOf(spec, limb.segment);
  if (joints.length === 0) return null;
  switch (limb.kind) {
    case "end":
    case "propped":
    case "foot": {
      const first = joints.findIndex((joint) => joint.name === limb.from);
      return first < 0 ? null : { chain: joints.slice(first).flatMap(channelsOf), stem: joints.slice(0, first).flatMap(channelsOf) };
    }
    default: return unknownLimb(limb);
  }
}

function unknownLimb(limb: never): never {
  throw new Error(`a limb of no known kind: ${JSON.stringify(limb)}`);
}

function unknownStage(stage: never): never {
  throw new Error(`a stage of no known kind: ${JSON.stringify(stage)}`);
}

/** The segments a stance's feet are (`footStatesOf`). */
const FEET: readonly string[] = SIDES.map((side) => `foot.${side}`);

/** What is wrong with `spec`'s bearing ends (`BodySpec.ends`) for a rise, in words. */
function limbFaults(spec: BodySpec): string[] {
  const faults: string[] = [], ends = spec.ends ?? [];
  ends.forEach((limb, at) => {
    if (ends.findIndex((other) => other.name === limb.name) !== at) faults.push(`limb ${limb.name} is named twice`);
    const segment = spec.segments.find((s) => s.name === limb.segment);
    if (!segment) {
      faults.push(`limb ${limb.name} is on ${limb.segment}, which ${spec.model} lacks`);
      return;
    }
    /** A limb on a capsule's end, or an end limb on a hand pose's hull: the shape, its chain, and the channels that take its task of `rows` rows, its chain's, each once. */
    const onEnd = (on: Extract<BearingEndSpec, { readonly takes: unknown }>, rows: number): void => {
      if (segment.shape.kind !== "capsule") faults.push(`limb ${on.name} bears on an end of ${on.segment}, a ${segment.shape.kind}`);
      // An end limb bears on a hand pose's capsule ends or its hull's corners; a propped one on a capsule's end.
      for (const [pose, shape] of Object.entries(segment.handPoses ?? {})) {
        if (shape.kind !== "capsule" && (on.kind === "propped" || shape.kind !== "hull")) faults.push(`limb ${on.name} bears on ${on.segment}, whose ${pose} pose is a ${shape.kind}`);
      }
      const channels = limbChannels(on, spec);
      if (!channels) {
        faults.push(`limb ${on.name} begins at ${on.from}, which is not on the way to ${on.segment}`);
        return;
      }
      on.takes.forEach((channel, k) => {
        if (!channels.chain.includes(channel)) faults.push(`limb ${on.name} takes ${channel}, which is not a freedom of its chain`);
        else if (on.takes.indexOf(channel) !== k) faults.push(`limb ${on.name} takes ${channel} twice`);
      });
      if (on.takes.length < rows) faults.push(`limb ${on.name} takes ${on.takes.length} channels, and its task has ${rows} rows`);
    };
    switch (limb.kind) {
      case "end":
        onEnd(limb, 3);
        return;
      case "propped":
        onEnd(limb, 4);
        if (!FEET.includes(limb.prop)) faults.push(`limb ${limb.name} is propped on ${limb.prop}, which is not a foot a stance stands on`);
        else if (!chainOf(spec, limb.prop).some((joint) => joint.child === limb.segment)) faults.push(`limb ${limb.name} is propped on ${limb.prop}, which does not hang from ${limb.segment}`);
        return;
      case "foot":
        if (!FEET.includes(limb.segment)) faults.push(`limb ${limb.name} is on ${limb.segment}, which is not a foot a stance stands on`);
        if (!limbChannels(limb, spec)) faults.push(`limb ${limb.name} begins at ${limb.from}, which is not on the way to ${limb.segment}`);
        return;
      default: unknownLimb(limb);
    }
  });
  return faults;
}

/** How far a bearing stage's shares may sum from 1: rounding, a numeric setting. */
const SHARES_SUM = 1e-9;

/** What is wrong with `recipe` for `spec`, in words; none if it can be played. */
export function stageFaults(recipe: Recipe, spec: BodySpec): string[] {
  const faults = limbFaults(spec);
  for (const [name, value] of Object.entries(recipe.progress ?? {})) {
    if (!(value > 0) || !Number.isFinite(value)) faults.push(`recovery progress ${name} must be finite and positive`);
  }
  for (const stage of stagesOf(recipe)) if (stage.kind === "pose" && stage.hold) {
    if (!stage.over) faults.push(`${stage.name} is held until a turn over no side`);
    if (!(stage.hold.turned > 0 && stage.hold.turned < 1)) faults.push(`${stage.name}'s held turn must be between 0 and 1`);
    if (!(stage.hold.most >= 1) || !Number.isFinite(stage.hold.most)) faults.push(`${stage.name}'s hold must be finite and at least its time`);
  }
  for (const stage of stagesOf(recipe)) if (stage.kind === "bear") for (const [name, value] of Object.entries(stage.progress ?? {})) {
    if (!(value > 0) || !Number.isFinite(value)) faults.push(`${stage.name}'s progress ${name} must be finite and positive`);
  }
  if (recipe.trunk.length === 0) faults.push("the trunk has no segment");
  if (recipe.holds && recipe.rise.at(-1)?.kind !== "bear") faults.push("a rise that holds its last stage ends on a bearing one");
  for (const segment of recipe.trunk) if (!spec.segments.some((other) => other.name === segment)) faults.push(`the trunk has ${segment}, which ${spec.model} lacks`);
  // Each channel's range from its own zero.
  const ranges = new Map<string, readonly [number, number]>();
  for (const joint of spec.joints) {
    for (const dof of joint.dofs) ranges.set(`${joint.name} ${dof.positive}`, [dof.min.value + dof.bind.value, dof.max.value + dof.bind.value]);
  }
  const postureFaults = (stage: Stage, posture: Posture): void => {
    for (const channel of Object.keys(posture)) {
      if (!ranges.has(channel)) faults.push(`stage ${stage.name} asks ${channel}, which ${spec.model} lacks`);
    }
    for (const [channel, [min, max]] of ranges) {
      const angle = posture[channel] ?? 0;
      if (angle < min || angle > max) faults.push(`stage ${stage.name} asks ${channel} for ${angle} rad, outside its range, ${min} to ${max}`);
    }
  };
  for (const stage of stagesOf(recipe)) {
    if (!(stage.seconds > 0)) faults.push(`stage ${stage.name} lasts ${stage.seconds} s`);
    switch (stage.kind) {
      case "pose": {
        postureFaults(stage, stage.posture);
        if (stage.drive && !(stage.drive.speed > 0 && stage.drive.within > 0)) faults.push(`stage ${stage.name} drives at ${stage.drive.speed} rad/s within ${stage.drive.within} s`);
        const { until, pace } = stage;
        if (until && stage.hold) faults.push(`stage ${stage.name} is both held and ended by a reading`);
        if (until) {
          if (!(until.for >= 0) || !Number.isFinite(until.for)) faults.push(`stage ${stage.name} holds its end ${until.for} s`);
          for (const [name, value] of Object.entries({ balls: until.balls, slow: until.slow })) {
            if (value !== undefined && !(value > 0 && Number.isFinite(value))) faults.push(`stage ${stage.name} ends at ${name} ${value}`);
          }
          if (until.along !== undefined && !(pace && until.along > 0 && until.along <= 1)) faults.push(`stage ${stage.name} ends ${until.along} along a way it has none of`);
          for (const channel of Object.keys(until.past ?? {})) if (!ranges.has(channel)) faults.push(`stage ${stage.name} ends past ${channel}, which ${spec.model} lacks`);
        }
        if (pace) {
          if (!(pace.rate > 0 && pace.lift > 0 && pace.slow > 0) || ![pace.rate, pace.lift, pace.slow].every(Number.isFinite)) faults.push(`stage ${stage.name} paces at ${pace.rate} within ${pace.lift} m under ${pace.slow} m/s`);
          for (const channel of Object.keys(pace.press)) {
            if (!channel.includes("@")) faults.push(`stage ${stage.name} presses ${channel}, which names no foot's side`);
            for (const side of SIDES) if (!ranges.has(channel.replace("@", side))) faults.push(`stage ${stage.name} presses ${channel.replace("@", side)}, which ${spec.model} lacks`);
          }
        }
        break;
      }
      case "bear": {
        if (stage.postureSeconds !== undefined && (!(stage.postureSeconds > 0) || !Number.isFinite(stage.postureSeconds)))
          faults.push(`stage ${stage.name} drives its posture within ${stage.postureSeconds} s`);
        if (stage.posture !== "reference") postureFaults(stage, stage.posture);
        if (!(stage.limit > 0)) faults.push(`stage ${stage.name} may take ${stage.limit} s`);
        // Each limb it drives, to bear on or to leave, with its channels where the body has it.
        const driven: { readonly name: string; readonly channels: readonly string[] }[] = [];
        const drive = (name: string, does: string): void => {
          const limb = spec.ends?.find((other) => other.name === name);
          if (!limb) {
            faults.push(`stage ${stage.name} ${does} ${name}, which ${spec.model} cannot bear on`);
            return;
          }
          const channels = limbChannels(limb, spec);
          for (const other of driven) {
            const shared = channels?.chain.find((channel) => other.channels.includes(channel));
            if (shared !== undefined) faults.push(`stage ${stage.name} drives ${other.name} and ${name}, which share ${shared}`);
          }
          driven.push({ name, channels: channels?.chain ?? [] });
        };
        for (const { limb } of stage.on) drive(limb, "bears on");
        for (const limb of stage.leave) drive(limb, "leaves");
        for (const limb of stage.toes ?? []) {
          if (spec.ends?.find((other) => other.name === limb)?.kind !== "foot" || !stage.on.some((on) => on.limb === limb)) {
            faults.push(`stage ${stage.name} stands ${limb} on its toes, which it does not bear on as a foot`);
          }
        }
        const sum = stage.on.reduce((total, { share }) => total + share, 0);
        if (!(Math.abs(sum - 1) <= SHARES_SUM)) faults.push(`stage ${stage.name}'s shares sum to ${sum}`);
        break;
      }
      default: unknownStage(stage);
    }
  }
  return faults;
}
