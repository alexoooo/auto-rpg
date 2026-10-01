/**
 * The stance's tuned constants, and the settings an experiment may pass in their place
 * (`StanceTuning`). The measured constants' tables are in `docs/reference/stance-tuning.md`.
 */

/**
 * The time constants, s, all critically damped: the centre of mass's pull across the ground and in
 * height, the pelvis's turn, and a swinging foot's pull onto its path.
 * Sweep: `docs/reference/stance-tuning.md#time-constants`.
 */
const STANCE_SECONDS = { across: 0.3, height: 0.15, turn: 0.15, swing: 0.1 } as const;

/** What an experiment may set in place of the stance's constants. */
export interface StanceTuning {
  readonly seconds?: { readonly across: number; readonly height: number; readonly turn: number; readonly swing: number };
  /** `STANCE_TRACK`. */
  readonly track?: number;
  /** `SOLE_MARGIN`. */
  readonly soleMargin?: number;
  /** `SUPPORT_INSET`. */
  readonly supportInset?: number;
  /** The least knee bend the height is held for, rad; null holds the goal's height however far the legs reach. */
  readonly kneeBend?: number | null;
  /** The ankle's dorsiflexion left unused, rad; null holds the goal's height however far the ankles bend. */
  readonly ankleSpare?: number | null;
  /** How a stance on both feet steps to catch a push (`STANCE_RECOVERY`); null never steps unasked. */
  readonly recovery?: RecoveryTuning | null;
  /** How a stance walks (`STANCE_GAIT`). */
  readonly gait?: GaitTuning;
  /** A swinging leg's torques solved within its strength together; false clips each freedom alone (the control). */
  readonly boundedSwing?: boolean;
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
  /** How fast the walk's pace goes toward the one asked, m/s^2: a body does not reach a walk in one step. */
  readonly accel: number;
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
  /** How far past the capture point the foot lands, as a fraction of its distance from the bearing sole's middle. */
  readonly reach: number;
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
 * height asked it would press its ankles on their stops (`tests/core-stance.test.mjs`). A lower
 * stance needs the hip to hinge, which the stance does not do.
 * Sweep: `docs/reference/stance-tuning.md#ankle-spare`.
 */
export const STANCE_ANKLE_SPARE = 0.01;

/**
 * A stance on both feet steps to catch a push (`recoveryStep`) once its capture point is `margin` m
 * outside the region its soles hold (`SUPPORT_INSET`), swinging the foot over `seconds` lifted
 * `lift` m, and landing it `reach` past where the capture point will be. The margin keeps a place
 * held at the edge of that region from setting steps off as the capture point wanders over it.
 * Sweep: `docs/reference/stance-tuning.md#recovery-step`.
 */
const STANCE_RECOVERY: RecoveryTuning = { margin: 0.01, seconds: 0.3, lift: 0.05, reach: 0.2 };

/**
 * A walk's steps: each swings over `seconds` lifted `lift` m, the soles `width` m apart across the
 * heading, none longer than `longest` of the leg, the pace going toward the one asked at `accel`.
 * A double support of `transfer` s precedes each steady step's lift, through which the trailing
 * foot rolls onto its toes and its knee flexes toward `preswing.knee`, the 35 degrees of a
 * person's knee at toe-off (Simoneau, "Kinesiology of Walking", in Neumann, "Kinesiology of the
 * Musculoskeletal System", 2nd ed., 2010, ch. 15): a leg that lifts still extending asks its hip
 * for more than its strength in a fast walk.
 * Sweeps: `docs/reference/stance-tuning.md#gait`.
 */
export const STANCE_GAIT: GaitTuning = { seconds: 0.3, lift: 0.05, width: 0.2, longest: 0.8, accel: 1, transfer: 0.08,
  preswing: { knee: 0.61, seconds: 0.04 } };

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
 * The fraction by which the outline of the stance soles' corners (their convex hull, across the
 * ground) is drawn toward its middle to give the region the stance holds its centre of mass in. Not
 * every centre of mass over the soles can be held on both feet: sideways, both feet flat, the ankles
 * turn as far as the hips, and only the ankles' invertors and evertors (a few tens of N m,
 * `humanSpec`) stop the body; and a centre of mass over one foot leaves the other bearing little.
 * Sweep: `docs/reference/stance-tuning.md#support-inset`.
 */
export const SUPPORT_INSET = 0.5;

/** The stance's settings as it reads them: each one `StanceTuning`'s, or the constant it stands in for. */
export interface ResolvedStance {
  readonly seconds: NonNullable<StanceTuning["seconds"]>;
  readonly inset: number;
  /** Null where the tuning turns the limit, or the step, off. */
  readonly bend: number | null;
  readonly spare: number | null;
  readonly recovery: RecoveryTuning | null;
  readonly gait: GaitTuning;
  readonly track: number;
  readonly soleMargin: number;
  readonly boundedSwing: boolean;
  readonly heelOff: boolean;
}

export function resolveStance(tuning: StanceTuning): ResolvedStance {
  return {
    seconds: tuning.seconds ?? STANCE_SECONDS,
    inset: tuning.supportInset ?? SUPPORT_INSET,
    bend: tuning.kneeBend === undefined ? STANCE_KNEE_BEND : tuning.kneeBend,
    spare: tuning.ankleSpare === undefined ? STANCE_ANKLE_SPARE : tuning.ankleSpare,
    recovery: tuning.recovery === undefined ? STANCE_RECOVERY : tuning.recovery,
    gait: tuning.gait ?? STANCE_GAIT,
    track: tuning.track ?? STANCE_TRACK,
    soleMargin: tuning.soleMargin ?? SOLE_MARGIN,
    boundedSwing: tuning.boundedSwing ?? true,
    heelOff: tuning.heelOff ?? true,
  };
}
