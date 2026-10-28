/**
 * The stance's tuned constants, and the settings an experiment may pass in their place
 * (`StanceTuning`). The measured constants' tables are in `docs/reference/stance-tuning.md`.
 */

/**
 * The time constants, s, all critically damped: the centre of mass's pull across the ground and in
 * height, the pelvis's turn, and a swinging foot's pull onto its path. The solve gives a swinging
 * foot the acceleration it asks; at 0.1 s the foot lags its path, most where the path rises late
 * under a leg stepping back (its knee bending, its ankle on its stop, its toes dropping), and the
 * toes meet the ground short of the landing and drag.
 * Sweep: `docs/reference/stance-tuning.md#time-constants`.
 */
const STANCE_SECONDS = { across: 0.3, height: 0.15, turn: 0.15, swing: 0.04 } as const;

/** What an experiment may set in place of the stance's constants. */
export interface StanceTuning {
  readonly seconds?: { readonly across: number; readonly height: number; readonly turn: number; readonly swing: number };
  /** `STANCE_TRACK`. */
  readonly track?: number;
  /** `SOLE_MARGIN`. */
  readonly soleMargin?: number;
  /** The least knee bend the height is held for, rad; null holds the goal's height however far the legs reach. */
  readonly kneeBend?: number | null;
  /** The ankle's dorsiflexion left unused, rad; null holds the goal's height however far the ankles bend. */
  readonly ankleSpare?: number | null;
  /** `SUPPORT_INSET`. */
  readonly supportInset?: number;
  /** How a stance on both feet steps to catch a push (`STANCE_RECOVERY`); null never steps unasked. */
  readonly recovery?: RecoveryTuning | null;
  /** How a stance walks (`STANCE_GAIT`). */
  readonly gait?: GaitTuning;
  /** A bearing foot whose ankle would pass its stop rolls onto its front edge; false holds it flat (the control). */
  readonly heelOff?: boolean;
}

/** The settings of a walk's steps. */
export interface GaitTuning {
  /** Each step's swing time, s, and its lift, m. */
  readonly seconds: number;
  readonly lift: number;
  /** The soles' middles' distance apart across the heading in a steady walk, m. */
  readonly width: number;
  /** The longest step, from the bearing sole's middle, as a fraction of the leg (thigh and shank). */
  readonly longest: number;
  /**
   * The share of the leg's reach (`withinReach`) a walk's steady steps take (`stepsWithin`: the
   * pace the legs can walk at, `fastestPace`, and the height they walk at, `walkHeight`), the rest
   * left for the corrections a step makes when the body misses its plan: each step lands within
   * the whole reach (`walkStep`, `transferStep`). A steady walk at the whole reach lands short as
   * soon as the body lags its plan, the leg being no longer than it is, and the capture point runs
   * past the plan by exp(w T) a step; a step held to the reserve itself, past it, cuts the pace,
   * and the step that catches the body then has no double support. 1 walks at the whole reach.
   */
  readonly reserve: number;
  /**
   * The share of the swing hip's peak torque a step's swing is planned on (`swingSeconds`): a swing
   * the gait's `seconds` would ask more of takes longer. Under 1 for the leg's weight, the knee's
   * bend the plan's straight leg has not, and the strength the hip loses at speed.
   */
  readonly effort: number;
  /** How far the swinging sole keeps from the bearing sole beyond the two soles' half-extents, m: the swing's path bows round that box (`swingBowToRef`), and a recovery's landing is kept off it (`clearOfBearer`). */
  readonly clearance: number;
  /** How fast the walk's pace goes toward the one asked, m/s^2: a body does not reach a walk in one step. */
  readonly accel: number;
  /** The most the walk lowers the hips below the goal's height for its steps, m: a longer step lands further from a lower hip (`walkHeight`). */
  readonly crouch: number;
  /**
   * How long before a step lands, or a double support hands over, s, the pivot the plan falls
   * about is last chosen to bring the capture point to the step's target (`planAcross`); within
   * it the pivot is held where it was chosen. Chosen for the time the step has left, the pivot's
   * response to the capture point's error grows without bound as the step ends, 1 / (exp(w t) - 1)
   * of it, and flips between the sole's ends; chosen for a longer time than is left instead, it
   * aims past the landing and lands the capture point short, and a stance catching itself steps
   * on (`walkStep` under way reads the pivot as it is held).
   */
  readonly horizon: number;
  /**
   * A double support before each steady step's lift, s (`transferStep`): both soles bear while the
   * weight goes from the trailing foot to the leading one. None, and a step lifts the tick the last
   * one lands (the control).
   */
  readonly transfer?: number;
  /**
   * The pre-swing, in a walk with a double support: through it the foot about to lift, while the
   * body goes its toes' way, rolls onto its front edge and its knee flexes toward `knee`, rad from
   * straight, critically damped at `seconds`, the ankle going where the leg takes it. None, and a
   * rolled foot's ankle is held as the heel-off holds it.
   */
  readonly preswing?: { readonly knee: number; readonly seconds: number };
}

/** The settings of a step taken to catch a push. */
export interface RecoveryTuning {
  /** How far the capture point is outside the region the stance holds (`SUPPORT_INSET`) that sets a step off, m. */
  readonly margin: number;
  /** The swing's time, s, and its lift, m. */
  readonly seconds: number;
  readonly lift: number;
  /** The swing's time, s, of a catch whose landing the leg cannot reach in `seconds`; none, every catch swings over `seconds`. */
  readonly fast?: number;
  /** How far past the capture point the foot lands, as a fraction of its distance from the bearing sole's middle. */
  readonly reach: number;
  /** The longest catch, from the bearing sole's middle, as a fraction of the leg; none, a walk's longest step (`GaitTuning.longest`). */
  readonly longest?: number;
  /**
   * How much of what the body's assist holds is counted before it steps, 0 to 1: its capture point
   * may be that share of the assist's reach (`assistReach`) outside what the soles hold, and the
   * assist holds the body there with no step. 0 steps as a body with no assist does.
   */
  readonly assisted: number;
}

/**
 * The least knee bend, rad from straight, the stance holds its height for, and the bend a knee past
 * straight is brought back to (`fixedSolve`). A straight knee is a singular leg: past it the leg's
 * Jacobian shortens the leg by extending the knee further, into its stop.
 * Sweep: `docs/reference/stance-tuning.md#knee-bend`.
 */
const STANCE_KNEE_BEND = 0.2;

/**
 * The ankle dorsiflexion, rad, the stance's height leaves unused. With the feet flat and the pelvis
 * upright, a lower stance tips the shanks forward until the ankle's range (`humanSpec`) ends it;
 * asked lower, the stance sinks only as far as the ankles reach less this spare, where held to the
 * height asked it would press its ankles on their stops. A lower
 * stance needs the hip to hinge, which the stance does not do.
 * Sweep: `docs/reference/stance-tuning.md#ankle-spare`.
 */
export const STANCE_ANKLE_SPARE = 0.01;

/**
 * A stance on both feet steps to catch a push (`recoveryStep`) once its capture point is `margin` m
 * outside the region its soles hold (`SUPPORT_INSET`), and `assisted` of what its assist holds
 * past that (`assistReach`), swinging the foot over `seconds` lifted `lift` m, and landing it
 * where the capture point will be (`reach` past it, none); a landing the leg cannot reach by then, over `fast`
 * s; no catch longer than `longest` of the leg, a lunge past a walk's longest step. The margin
 * keeps a place held at the edge of that region from setting steps off as the capture point
 * wanders over it.
 * Sweep: `docs/reference/stance-tuning.md#recovery-step`, `#assisted` for `assisted`, `#fast-catch` for `fast` and `#which-foot-catches` for `longest` and `reach`.
 */
const STANCE_RECOVERY: RecoveryTuning = { margin: 0.01, seconds: 0.3, lift: 0.05, reach: 0, assisted: 1, fast: 0.2, longest: 1.2 };

/**
 * A walk's steps: each swings over `seconds`, or longer if its hip needs it within `effort` of its
 * strength, lifted `lift` m, the soles `width` m apart across the heading, none longer than `longest`
 * of the leg nor past the hip's range, the pace going toward the one asked at `accel` and no faster
 * than the legs can step.
 * A double support of `transfer` s precedes each steady step's lift, through which the trailing
 * foot rolls onto its toes and its knee flexes toward `preswing.knee`, the 35 degrees of a
 * person's knee at toe-off (Simoneau, "Kinesiology of Walking", in Neumann, "Kinesiology of the
 * Musculoskeletal System", 2nd ed., 2010, ch. 15): a leg that lifts still extending asks its hip
 * for more than its strength in a fast walk. The swing's path bows `clearance` clear of the bearing
 * sole: the swinging foot met the bearing foot at mid-swing in a 1.4 m/s walk and was thrown up and short.
 * Sweeps: `docs/reference/stance-tuning.md#gait`.
 */
export const STANCE_GAIT: GaitTuning = Object.freeze({ seconds: 0.3, lift: 0.05, width: 0.2, longest: 0.8, reserve: 0.9, effort: 0.5, clearance: 0.03, accel: 1, crouch: 0.1, horizon: 0.1, transfer: 0.08,
  preswing: Object.freeze({ knee: 0.61, seconds: 0.04 }) });

/**
 * The time constant, s, critically damped, at which the centre of mass's errors from its plan are
 * taken up, and a bearing foot's motion damped out. Sweep: `docs/reference/stance-tuning.md#track`.
 */
const STANCE_TRACK = 0.2;

/**
 * The fraction of a bearing sole's half-length and half-width its centre of pressure is kept from the
 * sole's edges by (`shareGroundWrench`). A centre of pressure on the edge leaves the sole nothing to
 * turn on but the edge, and the feet slide. Sweep: `docs/reference/stance-tuning.md#sole-margin`.
 */
export const SOLE_MARGIN = 0.1;

/**
 * The damping of the leg's least-squares Jacobian solve (`fixedSolve`): a numeric setting, not
 * anatomy. A straight knee is a singular leg -- no motion of its freedoms lengthens it -- and
 * without damping a root asked to rise over a straight knee asks the leg for unbounded accelerations.
 * Set rather than measured: no table records it.
 */
export const LEG_DAMPING = 0.02;

/**
 * The fraction a sole's edges are drawn in by to give the region a capture point is kept in: for
 * the stance, each edge toward the ankle, what the ankle holds that way bounding the region
 * further (`holdOf`, `FootState.hold`); for a reader of bare soles (`withinSupport`'s default: the
 * rising, a kick's bearing foot, the recovery's readiness), the outline of their corners (their
 * convex hull, across the ground) toward its middle. A centre of pressure at the sole's edge only
 * holds the capture point there, the sole about to roll; drawn in, the ankle has the rest to
 * bring it back. Sweep: `docs/reference/stance-tuning.md#support-inset`.
 */
export const SUPPORT_INSET = 0.5;

/** The stance's settings as it reads them: each one `StanceTuning`'s, or the constant it stands in for. */
export interface ResolvedStance {
  readonly seconds: NonNullable<StanceTuning["seconds"]>;
  /** Null where the tuning turns the limit, or the step, off. */
  readonly bend: number | null;
  readonly spare: number | null;
  readonly recovery: RecoveryTuning | null;
  readonly gait: GaitTuning;
  readonly track: number;
  readonly soleMargin: number;
  readonly heelOff: boolean;
}

export function resolveStance(tuning: StanceTuning): ResolvedStance {
  return {
    seconds: tuning.seconds ?? STANCE_SECONDS,
    bend: tuning.kneeBend === undefined ? STANCE_KNEE_BEND : tuning.kneeBend,
    spare: tuning.ankleSpare === undefined ? STANCE_ANKLE_SPARE : tuning.ankleSpare,
    recovery: tuning.recovery === undefined ? STANCE_RECOVERY : tuning.recovery,
    gait: tuning.gait ?? STANCE_GAIT,
    track: tuning.track ?? STANCE_TRACK,
    soleMargin: tuning.soleMargin ?? SOLE_MARGIN,
    heelOff: tuning.heelOff ?? true,
  };
}
