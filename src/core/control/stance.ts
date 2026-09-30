import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { BuiltBody, BuiltJoint, BuiltSegment } from "../build/build-body.ts";
import type { MuscleDriver } from "../muscle/driver.ts";
import type { ServoWork } from "./servo.ts";
import { shareGroundWrench, type BearingSole } from "./contact-wrench.ts";
import type { Vec3 } from "../spec/quantity.ts";
import { chainTo, rotationAtToRef } from "./kinematics.ts";

export type Foot = "left" | "right";

/**
 * **What a stance is asked for**: which feet bear the body, where its centre of mass goes, and which
 * way its pelvis faces.
 */
export interface StanceGoal {
  /** The feet bearing weight; the other leg is left to the posture. */
  readonly feet: readonly Foot[];
  /** The centre of mass's place over the ground, world (x, z), m; null for the middle of the stance feet. */
  readonly centre: readonly [number, number] | null;
  /** The centre of mass's height over the stance feet's soles, m. */
  readonly height: number;
  /** The pelvis's heading, rad about the world's up: 0 faces it as in the reference pose. */
  readonly heading: number;
  /** A foot not in `feet` carried to a landing place; none, and the other leg is left to the posture. */
  readonly swing?: SwingGoal | null;
  /**
   * A walk: the centre of mass's velocity across the ground, world (x, z), m/s. With both feet in
   * `feet` and no `swing`, the stance steps of itself, each foot in turn (`STANCE_GAIT`); walking
   * nowhere, it steps only to catch a push (`STANCE_RECOVERY`).
   */
  readonly walk?: readonly [number, number] | null;
}

/**
 * **A step's swing**: the foot lifted and carried to where its sole's middle lands, over the ground,
 * on a minimum-jerk path lifted by `lift` at its middle, kept at the turn it had when it left the
 * ground. A goal equal to the last keeps its path; a new one starts from where the foot is.
 */
export interface SwingGoal {
  readonly foot: Foot;
  /** The sole's middle's landing place, world (x, z), m. */
  readonly to: readonly [number, number];
  /** The swing's time, s. */
  readonly seconds: number;
  /** How high the sole's middle is lifted at the swing's middle, m. */
  readonly lift: number;
  /**
   * Whether the weight is first shifted onto the other foot (the default): the foot leaves the
   * ground once the planned capture point is over the other sole. A step to catch a fall lifts at
   * once.
   */
  readonly shift?: boolean;
  /**
   * Where the capture point is brought by the time the foot lands, world (x, z), m: the pivot the
   * body falls about in the bearing sole is chosen for it. None, and the middle of the stance the
   * step lands in.
   */
  readonly capture?: readonly [number, number];
}

/**
 * Where a stance is: standing (no step, or its foot landed), shifting its weight before a step, or
 * swinging the step's foot.
 */
export type StancePhase = "stand" | "shift" | "swing";

/**
 * **Standing: the body carried by the legs, the feet where they are.** The stance plans its
 * centre of mass's way to the goal -- critically damped at a time constant (`STANCE_SECONDS`),
 * toward a place the soles can hold (`withinSupport`), no higher than the legs reach with their
 * knees bent (`STANCE_KNEE_BEND`) and no lower than they reach within their ankles' range
 * (`STANCE_ANKLE_SPARE`) -- and each step asks for accelerations: the centre of mass's, the plan's
 * with its errors from the plan taken up at `STANCE_TRACK`; the pelvis's turn toward upright at the
 * goal's heading; and each bearing foot's, none, what motion it has damped out.
 *
 * **The legs give those by torque, through the whole body's floating-base dynamics**
 * (`BodyDynamics.root`). The root's six rows say what wrench the ground must give for the body's
 * accelerations; each stance leg's freedoms' accelerations follow from the root's and its foot's
 * (`carry`). The ground's wrench is shared among the bearing soles as nearly as a sole can give it
 * (`shareGroundWrench`: no pull, the centre of pressure on the sole, friction, twist), and where
 * the soles cannot give it all, the root is asked for the acceleration the wrench they can give
 * makes: a body pushed past its feet is not asked to stand. The rest of the body is servoed around
 * that root acceleration (`servoSolve`), and each stance leg's torques are its freedoms' inverse
 * dynamics less the ground's wrench on its foot (`bear`), given to the muscles as torque sources.
 * Every inertia is the body's own: a foot is 0.005 kg m2 (`humanSpec`), and nothing conditions it.
 *
 * **A step** (`SwingGoal`) shifts the weight onto the other foot until the body's capture point is
 * over that sole, lifts the foot, and carries it on its path while the plan falls as an inverted
 * pendulum about a point of the bearing sole chosen to bring the capture point to the middle of the
 * stance the step lands in; the foot lands at the swing's end, and the stance holds the new feet.
 * The swinging foot is asked for its path's acceleration with its errors taken up at the swing's
 * constant, through the same inverse dynamics, no ground under it.
 *
 * The plan is what makes a move settle. Asked straight for its error over the time constant, the
 * body read its own velocity a step late, overshot a place 2 and 3 cm away and fell by 3 s; asked
 * for a critically damped acceleration from its measured velocity, it coasted through the place,
 * each step's error riding on the next (Havok, the speed stance this replaced). Tracking a plan that
 * is itself settled, it stops within 0.1 mm (the Rogue and the Warrior, Node stand, Rapier, 120 Hz).
 *
 * Nothing here holds the body up that the legs' muscles do not: a torque past a muscle's strength is
 * not given, and a body asked for more than its feet can take tips or falls.
 */
export interface StanceControl {
  /**
   * Read the body: its centre of mass and velocity, and the soles of `feet` (the last command's
   * stance feet, or both). A body reads this before its driver decides, so the driver's view is
   * this step's; `command` uses it.
   */
  read(feet?: readonly Foot[]): void;
  /**
   * Set `goal`'s aims from the last reading: the centre of mass's, the pelvis's turn's and each
   * stance leg's foot's accelerations. The stance legs' channels are marked in `owned`, for the
   * servo to leave. With no goal nothing is asked.
   */
  command(driver: MuscleDriver, goal: StanceGoal | null, dt: number): void;
  /**
   * The root's acceleration the last command asks for (angular, then its centre's, world), given
   * the servo's asked accelerations of the freedoms the stance does not own (`servoAsk`); null if
   * the stance carries nothing. The servo solves the rest of the body with it.
   */
  carry(driver: MuscleDriver, work: ServoWork): Float64Array | null;
  /** The owned legs' torques, once the servo has solved the rest (`servoSolve`). */
  bear(driver: MuscleDriver, work: ServoWork): void;
  /** Each channel the last command drove, 1, or 0. */
  readonly owned: Uint8Array;
  /** What the last reading and command found and asked. */
  readonly reading: StanceReading;
}

export interface StanceReading {
  /** The centre of mass and its velocity, world. */
  readonly centre: Vector3;
  readonly velocity: Vector3;
  /** The middle of the stance feet's soles, world; with no stance, of both feet. */
  readonly support: Vector3;
  /** Each sole's middle, world. */
  readonly soles: Readonly<Record<Foot, Vector3>>;
  /**
   * The place over the ground the stance holds the centre of mass toward, world (x, z; y unused):
   * the goal's, or the nearest the stance soles can hold (`withinSupport`).
   */
  readonly place: Vector3;
  /** The plan the centre of mass is held to: its place (x, height over the stance soles, z) and velocity, world. */
  readonly plan: Vector3;
  readonly planVelocity: Vector3;
  /** Where the stance is in a step. */
  readonly phase: StancePhase;
  /** The step the stance is taking of itself -- to walk, or to catch a push -- while it is under way; else null. */
  readonly own: SwingGoal | null;
  /** How many steps the stance has taken to catch a push, and to walk. */
  readonly recoveries: number;
  readonly strides: number;
}

/**
 * The time constants, s, of the centre of mass's pull across the ground and in height, critically
 * damped, of the pelvis's turn, and of a swinging foot's pull onto its path.
 *
 * Each was moved alone, the rest at their values, against the stance's batteries
 * (`research/core-stance-sweep.mjs`): 4 places 30 cm out, 8 steps, 25 walks from 0.2 to 0.7 m/s, and
 * shoves of 10 to 90 N s sixteen ways (272), each human 3 cm under its reference height (Node core
 * stand, Rapier, 120 Hz). The table gives the places and steps that failed their bars, the walks
 * held, and the shoves held with the impulse held each way (the largest below the first that
 * fell), its mean and least, N s:
 *
 *                  Rogue                                  Warrior
 *                  places  steps  walks  shoves           places  steps  walks  shoves
 *     across 0.2   0       0      21     126  42.8  15    1       4      22     215  69.1  55
 *     across 0.3   0       0      19     128  44.7  35    0       0      21     217  66.9  45   chosen
 *     across 0.4   0       0      18     130  45.3  35    0       0      22     214  68.8  55
 *     height 0.1   0       0      19     128  44.4  35    0       0      20     223  74.1  55
 *     height 0.2   0       0      19     126  44.4  35    0       0      21     212  67.5  55
 *     swing 0.05   0       0      22     133  42.2  15    0       0      21     206  67.5  50
 *     swing 0.2    0       0      19     112  38.4  15    0       0      21     193  62.2  50
 *
 * Pulled across at 0.2 s, the Warrior slid a foot 30 cm holding a place and failed four steps, and
 * the Rogue fell to a shove of 20 N s from one way; at 0.4 each centre still drifts 0.2-0.3 mm in
 * the last 2 s of a stand, where at 0.3 it is still. A height's 0.1 or 0.2 reads as 0.15. A swing
 * of 0.2 lands 3 mm off and holds fewer shoves; one of 0.2 or 0.05 lets the Rogue fall to 20 N s
 * from one way. The chosen row's Warrior falls to 50 N s from behind, and holds 55 and more
 * (`STANCE_RECOVERY`). The pelvis's turn was not swept on this stance.
 */
export const STANCE_SECONDS = { across: 0.3, height: 0.15, turn: 0.15, swing: 0.1 } as const;

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
 * **A control setting, from a sweep**: the least bend of a knee, rad from straight, that the
 * stance's height is held for, and that a knee past straight is brought back to (`fixedSolve`).
 *
 * A straight knee is a singular leg, and past straight -- the knee hyperextends 2 to 5 degrees
 * before its stop -- the leg's Jacobian shortens the leg by extending the knee further, which the
 * stop refuses. Asked to stand higher than its legs reach, a stance held to the height asked
 * presses its knees on their stops and wanders: over the last 2 s of a 5 s stand, the Rogue asked
 * 10 cm over its reference height drifted 9.5 mm and the Warrior asked 5 cm over 52 mm (10 cm over,
 * it fell); held for the bend, each drifted 0.03 mm (Node core stand, Rapier, 120 Hz). At 3 cm low
 * the bend decides little; at 0.4 a step and two places fail (the batteries of `STANCE_SECONDS`):
 *
 *                  Rogue                                  Warrior
 *                  places  steps  walks  shoves           places  steps  walks  shoves
 *     none         0       0      20     119  42.2  35    0       0      23     213  68.4  55
 *     0.1          0       0      19     128  45.0  35    0       0      21     217  70.9  55
 *     0.2          0       0      19     128  44.7  35    0       0      21     217  66.9  45   chosen
 *     0.3          0       0      21     130  45.3  35    0       0      21     217  70.9  55
 *     0.4          0       1      21     127  44.4  35    2       0      22     215  70.6  55
 *
 * 0.2 was chosen on the speed stance this replaced, as the least bend under which no step failed
 * (commit eaa182e5); on this one 0.1 to 0.3 read alike, and it is kept.
 */
export const STANCE_KNEE_BEND = 0.2;

/**
 * **A control setting, from a sweep**: the ankle's dorsiflexion, rad, that the stance's height
 * leaves unused.
 *
 * With the feet flat and the pelvis upright, a lower stance tips the shanks further forward, and
 * the ankle's range (`humanSpec`: 0.35 rad from the reference pose) ends it: standing 3 cm under
 * the reference height, the Rogue's ankles are already at 0.26. Asked lower than that, a stance held
 * to the height asked presses its ankles on their stops and stands off its place, or falls
 * (`tests/core-stance.test.mjs`); held above the ankles' reach, each human sinks to it and stands.
 * Moved alone against the batteries of `STANCE_SECONDS` (Node core stand, Rapier, 120 Hz):
 *
 *                  Rogue                                  Warrior
 *                  places  steps  walks  shoves           places  steps  walks  shoves
 *     none         0       0      20     111  39.7  30    0       0      21     183  60.6  50
 *     0            0       0      18     127  44.4  35    0       0      21     213  70.6  55
 *     0.01         0       0      19     128  44.7  35    0       0      21     217  66.9  45   chosen
 *     0.03         0       2      19     126  44.4  35    0       2      20     214  70.3  55
 *     0.05         0       6      19     126  44.1  35    0       6      21     214  67.8  55
 *
 * A larger spare holds a stepping stance too high for its knees, and the long steps fail first. A
 * stance lower than this needs the hip to hinge -- the pelvis back, the trunk forward -- which the
 * stance does not yet do; or an ankle range larger than the one measured.
 */
export const STANCE_ANKLE_SPARE = 0.01;

/**
 * **Control settings, from a sweep**: a stance on both feet steps to catch a push once its capture
 * point is `margin` outside the region its soles hold (`SUPPORT_INSET`), swinging the foot over
 * `seconds` lifted by `lift`, and landing it `reach` past where the capture point will be.
 *
 * Each human standing 3 cm under its reference height was shoved at the middle trunk's centre of
 * mass by 10 to 90 N s in steps of 5, sixteen ways 22.5 degrees apart, and watched 4.5 s; it fell
 * if its centre sank 25 cm. The table gives the shoves held of the 272, and the impulse held each
 * way -- the largest below the first that fell -- as its mean over the ways and its least (Node
 * core stand, Rapier, 120 Hz):
 *
 *     margin  reach   seconds  lift    Rogue held  mean  least    Warrior held  mean  least
 *     no step                          76          28.8  20       129           45.3  30
 *     0.01    0.2     0.3      0.05    128         44.7  35       217           66.9  45    chosen
 *     0       0.2     0.3      0.05    128         44.7  35       170           56.3  40
 *     0.02    0.2     0.3      0.05    127         44.4  35       217           66.9  45
 *     0.01    0.1     0.3      0.05    128         44.4  35       213           69.7  55
 *     0.01    0.3     0.3      0.05    126         43.8  35       216           71.3  55
 *     0.01    0.2     0.2      0.05    100         35.6  30       182           59.1  35
 *     0.01    0.2     0.25     0.05    122         42.8  35       207           65.0  40
 *     0.01    0.2     0.35     0.05    121         42.2  30       203           62.2  35
 *     0.01    0.2     0.3      0.03    129         45.3  35       219           70.6  55
 *
 * The margin is not for the shoves: at none, a place asked past the soles, held at the edge of what
 * they hold, sets steps off as the capture point wanders a millimetre over it; each human's feet
 * walked 30 cm or more, and the Warrior, standing unpushed, slid a foot 25 cm and failed every
 * step. At 0.01 and 0.02 it stands; 0.01 is the lesser. The swing of 0.2 s the speed stance chose
 * (commit eaa182e5) holds a fifth fewer here; 0.3 holds most. The rows within a few shoves of the
 * chosen one differ by where single shoves first fall: the chosen Warrior falls to 50 N s from
 * behind -- ten steps, its feet drawn within 5 cm of each other across -- and holds 55 and more.
 * Straight to the side a step holds little more than standing does: the Rogue holds 35 N s to one
 * side either way and 35 stepping against 30 to the other, and the Warrior 55 stepping against 60
 * standing -- the far foot steps out with no weight shifted first. Many held shoves take several steps: a long step leaves a wide stance
 * whose soles hold a thin band.
 */
export const STANCE_RECOVERY: RecoveryTuning = { margin: 0.01, seconds: 0.3, lift: 0.05, reach: 0.2 };

/**
 * **Control settings, from a sweep**: a walk's steps swing over `seconds`, lifted by `lift`, the
 * soles `width` apart across the heading, none longer than `longest` of the leg, the pace going
 * toward the one asked at `accel`.
 *
 * Each human walked at 0.2, 0.3, 0.4, 0.5 and 0.7 m/s five ways (forward, right, back, left,
 * forward right) for 8 s from standing 3 cm under its reference height, then was asked to walk
 * nowhere for 4 s: 25 walks each. Held is those that did not fall (the centre 25 cm under the goal's
 * height); every walk held here went, over its last 3 s, 0.8 to 1.25 of the speed asked along and
 * under a quarter of it across, and stopped. The ratio is the mean along over the speed asked, of
 * those held (Node core stand, Rapier, 120 Hz):
 *
 *     seconds  lift   width  longest  accel   Rogue held  ratio  at 0.7    Warrior held  ratio  at 0.7
 *     0.3      0.05   0.2    0.8      1       19          0.94   0         21            0.93   1    chosen
 *     0.25     0.05   0.2    0.8      1       18          0.91   0         20            0.92   1
 *     0.35     0.05   0.2    0.8      1       18          0.96   0         20            0.95   0
 *     0.4      0.05   0.2    0.8      1       19          0.92   0         20            0.92   0
 *     0.3      0.04   0.2    0.8      1       20          0.93   1         22            0.93   2
 *     0.3      0.07   0.2    0.8      1       19          0.95   0         21            0.93   2
 *     0.3      0.05   0.15   0.8      1       19          0.94   0         21            0.93   2
 *     0.3      0.05   0.25   0.8      1       19          0.94   0         21            0.93   1
 *     0.3      0.05   0.2    0.7      1       19          0.94   0         21            0.93   1
 *     0.3      0.05   0.2    0.9      1       19          0.94   0         23            0.93   3
 *     0.3      0.05   0.2    0.8      0.5     22          0.94   2         23            0.93   3
 *     0.3      0.05   0.2    0.8      2       18          0.94   0         22            0.93   2
 *
 * At the chosen settings every walk up to 0.4 m/s holds, and all but one of the Rogue's at 0.5; at
 * 0.7 almost none. The rows differ at 0.5 and 0.7 m/s alone. A slower start (`accel` 0.5) held five
 * more of the fifty, the most of any row; at 25 walks a human, the best of twelve rows is expected
 * to read that high by chance, and it waits for a replication on other speeds and heights. The limits found on the
 * speed stance were the ankle's range and a trailing foot's toe that scuffs the ground with its
 * ankle at its stop. A human's preferred walk is near 1.4 m/s.
 *
 * Two findings shaped the walk (`walkStep`), on the speed stance (commit eaa182e5). A step fixed to
 * fall about its bearing sole's middle multiplies a landing's miss by exp(w T), about 3.7, at each
 * step: the steps widened until the feet could not reach; each step now chooses its pivot within
 * the sole. And a foot carried at the turn it left the ground with drifted in yaw, step by step, to
 * 50 degrees off; it lands facing the heading. A foot that rolls onto its toe's edge before it
 * lifts, and joints held back from their stops, were built and measured there: they held fewer walks
 * at 3 cm low (33 of 50 against 46) and 30 fewer shoves, and were taken out.
 */
export const STANCE_GAIT: GaitTuning = { seconds: 0.3, lift: 0.05, width: 0.2, longest: 0.8, accel: 1 };

/**
 * **A control setting, from a sweep**: the time constant, s, the centre of mass's errors from its
 * plan are taken up in, critically damped, and a bearing foot's motion damped out in. Against the
 * batteries of `STANCE_SECONDS` (Node core stand, Rapier, 120 Hz):
 *
 *                  Rogue                                  Warrior
 *                  places  steps  walks  shoves           places  steps  walks  shoves
 *     0.1          0       0      22     120  42.2  35    0       0      23     201  65.9  55
 *     0.15         0       0      21     123  43.1  35    0       0      23     219  72.5  55
 *     0.2          0       0      19     128  44.7  35    0       0      21     217  66.9  45   chosen
 *     0.3          0       0      19     131  45.9  35    0       0      21     220  72.8  55
 *
 * Every setting stands still (off, drift and speed read 0.0 mm and mm/s) and lands its steps within
 * 2.4 mm. A stiffer track holds two more walks at 0.7 m/s, and at 0.1 fewer shoves; 0.15 to 0.3
 * read alike.
 */
export const STANCE_TRACK = 0.2;

/**
 * **A control setting, from a sweep**: the fraction of a bearing sole's half-length and half-width
 * its centre of pressure is kept from the sole's edges by (`shareGroundWrench`). A wrench whose
 * centre of pressure is on the edge leaves the sole nothing to turn on but the edge; asked for a
 * place 30 cm to the side, held at the edge of what the soles hold, each human with no margin slid
 * its feet 19 cm (Rogue) and 23 cm (Warrior), where with 0.05 or more they held within 0.6 mm.
 * Against the batteries of `STANCE_SECONDS` (Node core stand, Rapier, 120 Hz):
 *
 *                  Rogue                                  Warrior
 *                  places  steps  walks  shoves           places  steps  walks  shoves
 *     0            2       0      18     132  45.9  35    2       0      20     215  70.6  55
 *     0.05         0       0      18     130  45.6  35    0       0      21     215  70.0  55
 *     0.1          0       0      19     128  44.7  35    0       0      21     217  66.9  45   chosen
 *     0.2          0       0      20     127  44.4  35    0       0      22     212  68.8  55
 *
 * From 0.05 to 0.2 the settings read alike.
 */
export const SOLE_MARGIN = 0.1;

/**
 * The damping of the leg's Jacobian undone, as a least-squares solve (`dampedSolve`): a numeric
 * setting, not anatomy. A straight knee is a singular leg -- no motion of its freedoms lengthens it
 * -- and without damping a root asked to rise over a straight knee asks the leg for unbounded
 * accelerations: a shoved Rogue's, on one straight leg, ran to 1e22 rad/s2.
 */
export const LEG_DAMPING = 0.02;

/**
 * **A control setting, from a sweep**: the fraction by which the outline of the stance soles'
 * corners (their convex hull, across the ground) is drawn toward its middle to give the region the
 * stance holds its centre of mass in. Not every centre of mass over the soles is one the body can
 * hold on both feet: sideways, both feet flat, the ankles turn as far as the hips, and the ankle's
 * everters and invertors -- some 20 to 27 N m (`humanSpec`) -- are what stop the body; and a centre
 * of mass over one foot leaves the other bearing little. Moved alone against the batteries of
 * `STANCE_SECONDS` (Node core stand, Rapier, 120 Hz):
 *
 *                  Rogue                                  Warrior
 *                  places  steps  walks  shoves           places  steps  walks  shoves
 *     0.3          2       0      20     127  44.7  35    2       0      21     221  73.4  55
 *     0.4          0       0      20     130  45.3  35    0       0      22     220  72.5  55
 *     0.5          0       0      19     128  44.7  35    0       0      21     217  66.9  45   chosen
 *     0.6          1       0      19     133  46.3  35    2       8      21     177  58.8  40
 *
 * At 0.3 a place to the side is held off its height; at 0.6 the held region is narrower than the
 * stance the steps land in: the Rogue slid a foot 22 cm holding a place, and the Warrior, standing
 * unpushed, 33 cm. 0.4 reads as 0.5, which was chosen on the speed stance (commit eaa182e5) and is
 * kept.
 */
export const SUPPORT_INSET = 0.5;

interface FootState {
  readonly side: Foot;
  readonly segment: BuiltSegment;
  readonly chain: BuiltJoint[];
  /** The sole's corners, in the segment's own frame. */
  readonly sole: readonly Vector3[];
  /** The stance leg's channels, the chain's freedoms in order. */
  channels: number[];
  /** The sole's corners and middle, world, as last read (the reading's `soles`). */
  readonly corners: Vector3[];
  readonly middle: Vector3;
  /** The thigh's and the shank's lengths, hip to knee and knee to ankle, in the reference pose. */
  readonly lengths: readonly [number, number];
  /** The knee's flexion, rad, at which the leg is straight: less its bend in the reference pose. */
  readonly straight: number;
  /** The sole's width across the foot, m. */
  readonly width: number;
  /** Half the sole's length, m. */
  readonly reach: number;
}

export function stanceControl(built: BuiltBody, tuning: StanceTuning = {}): StanceControl {
  const seconds = tuning.seconds ?? STANCE_SECONDS;
  const inset = tuning.supportInset ?? SUPPORT_INSET;
  const bend = tuning.kneeBend === undefined ? STANCE_KNEE_BEND : tuning.kneeBend;
  const spare = tuning.ankleSpare === undefined ? STANCE_ANKLE_SPARE : tuning.ankleSpare;
  const recovery = tuning.recovery === undefined ? STANCE_RECOVERY : tuning.recovery;
  const gait = tuning.gait ?? STANCE_GAIT;
  const track = tuning.track ?? STANCE_TRACK;
  const soleMargin = tuning.soleMargin ?? SOLE_MARGIN;
  const boundedSwing = tuning.boundedSwing ?? true;
  const pelvis = chainTo(built, built.segments.get("foot.left")!)[0]!.parent;
  const segments = [...built.segments.values()];
  const total = segments.reduce((sum, s) => sum + s.rigid.mass, 0);
  const feet = (["left", "right"] as const).map((side): FootState => {
    const segment = built.segments.get(`foot.${side}`);
    if (!segment) throw new Error(`${built.spec.model} has no ${side} foot`);
    const sole = soleOf(segment), chain = chainTo(built, segment);
    return { side, segment, chain, sole, channels: [], corners: sole.map(() => new Vector3()), lengths: lengthsOf(chain),
      straight: -referenceBendOf(chain),
      width: Math.max(...sole.map((q) => q.x)) - Math.min(...sole.map((q) => q.x)),
      // The rectangle's sides from one corner: the nearer two of the other three.
      reach: [1, 2, 3].map((k) => Vector3.Distance(sole[0]!, sole[k]!)).sort((a, b) => a - b)[1]! / 2,
      middle: new Vector3() };
  });
  /**
   * The torque stance's aims for this step (`command`): the root's angular acceleration and the
   * centre of mass's, and each leg's foot's, its sole's middle's and its spin's; then (`carry`) the
   * root's acceleration and each leg's freedoms' accelerations.
   */
  const aim = { on: false, spin: new Vector3(), centre: new Vector3(), root: new Float64Array(6) };
  // The freedoms held at a torque as `carry` found them, and their accelerations, z0 + Z a_root.
  const held = { channels: [] as number[], z0: [] as number[], Z: [] as number[][] };
  const tasks = feet.map(() => ({ on: false, bearing: false, linear: new Vector3(), angular: new Vector3(), accel: new Float64Array(6) }));
  const shares = [0, 1].map(() => ({ force: new Vector3(), moment: new Vector3() }));
  const missed = { force: new Vector3(), moment: new Vector3() };
  const idScratch = { lin: new Vector3(), ang: new Vector3(), at: new Vector3(), force: new Vector3(), moment: new Vector3(), soles: [] as Vector3[], reach: [] as number[] };
  const reading = { centre: new Vector3(), velocity: new Vector3(), support: new Vector3(), place: new Vector3(),
    plan: new Vector3(), planVelocity: new Vector3(),
    phase: "stand" as StancePhase, soles: { left: feet[0]!.middle, right: feet[1]!.middle }, own: null as SwingGoal | null, recoveries: 0, strides: 0 };
  /** The foot of the last step of a walk, while it steps on without standing between. */
  let stride: Foot | null = null;
  /** The walk the stance's step under way is for, if it is a walk's. */
  let striding: readonly [number, number] | null = null;
  /** The walk's pace, world (x, z), m/s: toward the goal's at the gait's acceleration, toward none standing. */
  const pace: [number, number] = [0, 0];
  /** The step under way: its swing, the time since its foot left the ground, and where and how the foot left it. */
  const step = { swing: null as SwingGoal | null, lifted: false, time: 0, from: new Vector3(), turn: new Quaternion(), lift: new Quaternion() };
  const path = new Vector3(), along = new Vector3(), sole = new Vector3();
  let owned = new Uint8Array(0);
  let last: readonly Foot[] | null = null;
  /** The centre of mass's planned place (x, height over the soles, z) and velocity, since the stance began. */
  const plan = { on: false, at: new Vector3(), velocity: new Vector3() };
  const v = new Vector3(), spin = new Vector3(), target = new Quaternion(), error = new Quaternion(), inverse = new Quaternion();
  const pelvisSpin = new Vector3(), turn = new Vector3();
  const p = new Vector3();
  const hipAt = new Vector3(), ankleAt = new Vector3(), kneeAt = new Vector3(), shank = new Quaternion(), footTurn = new Quaternion();
  const level = new Quaternion(), whole = new Quaternion(), wholeAxis = new Vector3();
  const gravity = (): number => -built.physics.gravity[1];
  /**
   * How far apart the soles' middles stand as the body was built, m: its own stance, which a walk's
   * end returns to (`settleStep`).
   */
  const rest = ((a: Vector3, b: Vector3): number => Math.hypot(b.x - a.x, b.z - a.z))(soleMiddleToRef(feet[0]!, new Vector3()), soleMiddleToRef(feet[1]!, new Vector3()));

  /** Each sole read, and the middle of `stance`'s into the reading. */
  const supportOf = (stance: readonly FootState[]): void => {
    for (const foot of feet) soleMiddleToRef(foot, foot.middle);
    reading.support.setAll(0);
    for (const foot of stance) reading.support.addInPlace(foot.middle);
    if (stance.length) reading.support.scaleInPlace(1 / stance.length);
  };

  /** Each active leg's Jacobian at its task's point, its drift, and the root's share, from `dynamics`. */
  const legJacobian = (foot: FootState, point: Vector3, driver: MuscleDriver): number[][] => {
    const dynamics = driver.dynamics;
    return [0, 1, 2, 3, 4, 5].map((row) => foot.channels.map((i) => {
      const m = dynamics.axis(i), p = dynamics.pivot(i);
      if (row < 3) return m[row]!;
      const d = [point.x - p[0], point.y - p[1], point.z - p[2]];
      return row === 3 ? m[1] * d[2]! - m[2] * d[1]! : row === 4 ? m[2] * d[0]! - m[0] * d[2]! : m[0] * d[1]! - m[1] * d[0]!;
    }));
  };
  /**
   * The lever a missed moment of the ground's wrench is weighed against a missed force at
   * (`shareGroundWrench`): the height of the root's centre, where the wrench is taken, over the
   * soles, at least a sole's half-length. A moment the soles miss is a force they miss at the
   * root's height. Other levers, fixed, were tried against the shoves (10 to 60 N s, sixteen ways:
   * 176; Node core stand, Rapier, 120 Hz), the shoves held with the impulse held each way, mean and
   * least, N s; taken before a knee past straight was brought back (`fixedSolve`), the first three
   * rows with `STANCE_TRACK` 0.1 and the speed stance's recovery steps (margin 0.01, 0.2 s, lift
   * 0.03, reach 0.15), the last two with this track and recovery:
   *
   *     lever              Rogue              Warrior
   *     0.3 m              109  39.1  30      156  53.8  45
   *     the root's height  91   33.1  30      165  56.6  50
   *     3 m                78   29.4  25      148  49.7  40
   *     0.5 m, track 0.2   101  36.3  30      157  54.1  40
   *     the root's, 0.2    102  36.6  30      165  56.3  50
   *
   * No fixed lever is better for both; the root's height is the one the wrench's geometry gives.
   */
  const leverOf = (height: number): number => Math.max(feet[0]!.reach, height - reading.support.y);
  const pointOf = (foot: FootState, task: (typeof tasks)[number], out: Vector3): Vector3 => task.bearing ? out.copyFrom(foot.middle) : soleMiddleToRef(foot, out);

  return {
    get owned() { return owned; },
    reading,
    carry(muscles, work) {
      if (!aim.on) return null;
      const dynamics = muscles.dynamics, R = dynamics.root, p0 = R.centre, n = muscles.channels.length;
      const { lin, ang, at } = idScratch, a = aim.spin;
      // Each leg's freedoms' accelerations are y0 - Y a_root: its foot's asked motion, less its
      // drift and what the root's motion gives it, through the leg.
      const legs: { foot: FootState; task: (typeof tasks)[number]; y0: number[]; Y: number[][] }[] = [];
      const inLeg = new Uint8Array(n);
      feet.forEach((foot, s) => {
        const task = tasks[s]!;
        if (!task.on) return;
        pointOf(foot, task, at);
        const J = legJacobian(foot, at, muscles);
        dynamics.driftToRef(foot.segment, at, lin, ang);
        const r = [at.x - p0[0], at.y - p0[1], at.z - p0[2]];
        const k0 = [task.angular.x - ang.x, task.angular.y - ang.y, task.angular.z - ang.z, task.linear.x - lin.x, task.linear.y - lin.y, task.linear.z - lin.z];
        // B a_root: the foot's motion from the root's, its spin and a + alpha x r.
        const B = [0, 1, 2, 3, 4, 5].map((row) => [0, 1, 2, 3, 4, 5].map((col) => {
          if (row < 3) return col === row ? 1 : 0;
          if (col >= 3) return col === row ? 1 : 0;
          // (alpha x r)_i = -[r]x alpha
          const i = row - 3, j = col;
          return i === j ? 0 : [[0, r[2]!, -r[1]!], [-r[2]!, 0, r[0]!], [r[1]!, -r[0]!, 0]][i]![j]!;
        }));
        // A knee past straight is on the Jacobian's other branch, where the leg shortens by extending
        // the knee further, into its stop: a Rogue that caught a push with a step stood on such a
        // knee 13 mm over its plan, the knee asked for -15 rad/s2 and held by its stop. That knee is
        // asked back toward `STANCE_KNEE_BEND`, critically damped at the height's constant, ahead
        // of the foot's task, and the leg's other freedoms take the task (`fixedSolve`).
        const fixed = new Array<number>(foot.channels.length).fill(NaN);
        if (bend !== null) {
          const k = foot.chain[0]!.dofs.length, i = foot.channels[k]!, flexed = muscles.angle(i) - foot.straight, m = 1 / seconds.height;
          if (flexed < 0) fixed[k] = m * m * (bend - flexed) - 2 * m * muscles.rate(i);
        }
        const y0 = fixedSolve(J, k0, fixed), still = fixed.map((v) => Number.isNaN(v) ? NaN : 0);
        const columns = [0, 1, 2, 3, 4, 5].map((c) => fixedSolve(J, B.map((row) => row[c]!), still));
        legs.push({ foot, task, y0, Y: [0, 1, 2, 3, 4, 5].map((row) => columns.map((col) => col[row]!)) });
        for (const i of foot.channels) inLeg[i] = 1;
      });
      // The root's rows as the root accelerates: W = P a_root + w0, the wrench the ground gives about
      // the root's centre, the other freedoms at the servo's asks.
      const P = [0, 1, 2, 3, 4, 5].map((r) => [0, 1, 2, 3, 4, 5].map((c) => R.mass[r]![c]!));
      const w0 = [0, 1, 2, 3, 4, 5].map((r) => R.bias[r]! - R.gravity[r]!);
      for (const { foot, y0, Y } of legs) foot.channels.forEach((i, k) => {
        for (let r = 0; r < 6; r++) {
          const C = R.coupling[r]![i]!;
          w0[r] = w0[r]! + C * y0[k]!;
          for (let c = 0; c < 6; c++) P[r]![c] = P[r]![c]! - C * Y[k]![c]!;
        }
      });
      // The freedoms held at a torque (`ServoWork.fixed` outside the legs: a strike's pushes) move as
      // that torque moves them, and the root's acceleration changes how: from M_FF q''_F = torque_F -
      // bias_F + gravity_F - C_F' a_root - M_F,rest q''_rest, q''_F = z0 + Z a_root. Taken at rest, a
      // straight's arm and trunk were carried by a ground that gave the whole body their momentum.
      // The lab routine as `bear`'s swing has it, the swing bounded: at 120 Hz over 24 runs the Rogue
      // 84 of 120 loops (12 runs through all five), the Warrior 109 (20), against 69 (8) and 100 (18);
      // at 480 Hz over 12, 56 of 60 (11) and 60 (12), against 23 (2) and 54 (9). No run fell in a
      // strike or the settle after one.
      const { mass, gravity: weight, bias } = dynamics;
      const F: number[] = [];
      for (let i = 0; i < n; i++) if (work.fixed[i] && !inLeg[i]) F.push(i);
      held.channels = F;
      if (F.length) {
        const legOf = new Map<number, { y0: number; Y: readonly number[] }>();
        for (const { foot, y0, Y } of legs) foot.channels.forEach((i, k) => legOf.set(i, { y0: y0[k]!, Y: Y[k]! }));
        const MFF = F.map((i) => F.map((j) => mass[i]![j]!));
        held.z0 = solveLinear(MFF, F.map((i) => {
          let t = work.torque[i]! - bias[i]! + weight[i]!;
          for (let j = 0; j < n; j++) {
            if (work.fixed[j] && !inLeg[j]) continue;
            const leg = legOf.get(j);
            t -= mass[i]![j]! * (leg ? leg.y0 : work.accel[j]!);
          }
          return t;
        }));
        const columns = [0, 1, 2, 3, 4, 5].map((c) => solveLinear(MFF, F.map((i) => {
          let t = -R.coupling[c]![i]!;
          for (const [j, leg] of legOf) t += mass[i]![j]! * leg.Y[c]!;
          return t;
        })));
        held.Z = F.map((_, k) => columns.map((column) => column[k]!));
        F.forEach((i, k) => {
          for (let r = 0; r < 6; r++) {
            const C = R.coupling[r]![i]!;
            w0[r] = w0[r]! + C * held.z0[k]!;
            for (let c = 0; c < 6; c++) P[r]![c] = P[r]![c]! + C * held.Z[k]![c]!;
          }
        });
      }
      for (let i = 0; i < n; i++) if (!inLeg[i] && !(work.fixed[i])) for (let r = 0; r < 6; r++) w0[r] = w0[r]! + R.coupling[r]![i]! * work.accel[i]!;
      // The aims: the root's angular acceleration, and the root centre's that gives the centre of
      // mass its aim (the ground's force is M c'' less gravity's).
      const root = aim.root;
      root[0] = a.x; root[1] = a.y; root[2] = a.z;
      const target = [aim.centre.x, aim.centre.y, aim.centre.z];
      const lift = solveLinear([3, 4, 5].map((r) => [3, 4, 5].map((c) => P[r]![c]!)),
        [3, 4, 5].map((r, k) => R.mass[3]![3]! * target[k]! - R.gravity[r]! - w0[r]! - P[r]![0]! * a.x - P[r]![1]! * a.y - P[r]![2]! * a.z));
      root[3] = lift[0]!; root[4] = lift[1]!; root[5] = lift[2]!;
      // What the bearing soles can give of the wrench that asks; where they cannot give it all, the
      // root's acceleration is the one the wrench they can give makes.
      const bearing = legs.filter((leg) => leg.task.bearing).map((leg) => leg.foot);
      const W = [0, 1, 2, 3, 4, 5].map((r) => w0[r]! + P[r]!.reduce((sum, v, c) => sum + v * root[c]!, 0));
      if (bearing.length) {
        idScratch.force.set(W[3]!, W[4]!, W[5]!);
        idScratch.moment.set(W[0]!, W[1]!, W[2]!);
        shareGroundWrench(bearing.map((foot) => bearingSole(foot, 1 - soleMargin)), at.set(p0[0], p0[1], p0[2]), idScratch.force, idScratch.moment,
          GROUND_FRICTION, leverOf(p0[1]), shares, missed);
        if (missed.force.lengthSquared() + missed.moment.lengthSquared() > 1e-12) {
          const given = [W[0]! + missed.moment.x, W[1]! + missed.moment.y, W[2]! + missed.moment.z, W[3]! + missed.force.x, W[4]! + missed.force.y, W[5]! + missed.force.z];
          root.set(solveLinear(P, given.map((v, r) => v - w0[r]!)));
        }
      }
      for (const { task, y0, Y } of legs) for (let k = 0; k < 6; k++) task.accel[k] = y0[k]! - Y[k]!.reduce((sum, v, c) => sum + v * root[c]!, 0);
      return root;
    },
    bear(muscles, work) {
      if (!aim.on) return;
      const dynamics = muscles.dynamics, R = dynamics.root, n = muscles.channels.length, root = aim.root;
      // Every freedom's acceleration: the legs' from their tasks, the rest as the servo solved them.
      const accel = work.accel;
      feet.forEach((foot, s) => { if (tasks[s]!.on) foot.channels.forEach((i, k) => { accel[i] = tasks[s]!.accel[k]!; }); });
      // The freedoms held at a torque, as the plan has them move at this root.
      held.channels.forEach((i, k) => { accel[i] = held.z0[k]! + held.Z[k]!.reduce((sum, v, c) => sum + v * root[c]!, 0); });
      const { mass, gravity: weight, bias } = dynamics;
      // A swinging leg's accelerations are the nearest to its task that its muscles can give, all its
      // freedoms at once (`boundedLeastSquares`): clipped one at a time, a hip at its strength left
      // the knee's torque asking for the thigh's motion it did not get, and the knee drove the foot
      // into the ground (the Warrior, walking in the lab's routine: its foot dragged a whole step
      // 1 cm up, landed 18 cm short, and the walk ran away). A hip turning faster than its muscles
      // shorten has no strength that way at all. The lab routine from seeded starts
      // (`research/core-routine-battery.mjs`: 3 N s at 0.5 s, up to 5 loops; Node core stand,
      // Rapier), loops completed of those possible, runs through all five, and falls while walking:
      //
      //                        Rogue              Warrior
      //     120 Hz, 24 runs    69/120  8   3      100/120  18  0    bounded
      //                        43/120  2  11      33/120    2  18   clipped alone
      //     480 Hz, 12 runs    23/60   2   0      54/60     9   0    bounded
      //                        23/60   2   4      36/60     5   0    clipped alone
      //
      // (Both before the freedoms held at a torque were planned, in `carry`: the falls left were in
      // the strikes.) Only some 1 % of swinging steps ask past strength, but those are the steps that
      // decide a walk. On the stance's batteries (`STANCE_SECONDS`; Node core stand, Rapier, 120 Hz)
      // the bound costs shoves: 117 held, 41.6 N s (35 the least) against 128, 44.7 (35) for the
      // Rogue, and 202, 67.8 (55) against 217, 66.9 (45) for the Warrior; walks 19 and 22 of 25
      // against 19 and 21; places, steps and stands read alike. The constants' tables were read
      // clipped alone.
      feet.forEach((foot, s) => {
        const task = tasks[s]!;
        if (!boundedSwing || !task.on || task.bearing) return;
        const channels = foot.channels;
        // Each freedom's torque with the leg's own accelerations at zero, and the leg's mass matrix.
        const still = channels.map((i) => {
          let torque = bias[i]! - weight[i]!;
          for (let r = 0; r < 6; r++) torque += R.coupling[r]![i]! * root[r]!;
          for (let j = 0; j < n; j++) if (!channels.includes(j)) torque += mass[i]![j]! * accel[j]!;
          return torque;
        });
        const M = channels.map((i) => channels.map((j) => mass[i]![j]!));
        const asked = channels.map((_, a) => still[a]! + channels.reduce((sum, _j, b) => sum + M[a]![b]! * task.accel[b]!, 0));
        const lo = channels.map((i) => -muscles.strength(i, -1)), hi = channels.map((i) => muscles.strength(i, 1));
        if (asked.every((t, a) => t >= lo[a]! && t <= hi[a]!)) return;
        // The foot's task missed, weighed: its sole's middle's acceleration, and its turn's at the
        // sole's end (half its length), for a torque's miss through M^-1.
        const J = legJacobian(foot, soleMiddleToRef(foot, idScratch.at), muscles);
        const inverse = channels.map((_, c) => solveLinear(M, channels.map((_i, r) => (r === c ? 1 : 0))));
        const G = J.map((row, r) => inverse.map((column) => row.reduce((sum, v, b) => sum + v * column[b]!, 0) * (r < 3 ? foot.reach : 1)));
        const A = channels.map((_, a) => channels.map((_b, b) => G.reduce((sum, row) => sum + row[a]! * row[b]!, 0)));
        const torque = boundedLeastSquares(A, asked, lo, hi);
        channels.forEach((i, a) => {
          accel[i] = inverse.reduce((sum, column, b) => sum + column[a]! * (torque[b]! - still[b]!), 0);
          task.accel[a] = accel[i]!;
        });
      });
      // The wrench the ground must give, about the root's centre: what the whole body's motion
      // asks of the root's rows, less gravity's.
      const W = [0, 1, 2, 3, 4, 5].map((r) => {
        let sum = R.bias[r]! - R.gravity[r]!;
        for (let c = 0; c < 6; c++) sum += R.mass[r]![c]! * root[c]!;
        for (let i = 0; i < n; i++) sum += R.coupling[r]![i]! * accel[i]!;
        return sum;
      });
      const bearing = feet.filter((_, s) => tasks[s]!.on && tasks[s]!.bearing);
      const { force, moment } = idScratch;
      if (bearing.length) {
        force.set(W[3]!, W[4]!, W[5]!);
        moment.set(W[0]!, W[1]!, W[2]!);
        const soles = bearing.map((foot) => bearingSole(foot, 1 - soleMargin));
        const at = idScratch.at.set(R.centre[0], R.centre[1], R.centre[2]);
        shareGroundWrench(soles, at, force, moment, GROUND_FRICTION, leverOf(at.y), shares, missed);
      }
      feet.forEach((foot, s) => {
        const task = tasks[s]!;
        if (!task.on) return;
        const share = task.bearing ? shares[bearing.indexOf(foot)]! : null;
        foot.channels.forEach((i) => {
          let torque = bias[i]! - weight[i]!;
          for (let r = 0; r < 6; r++) torque += R.coupling[r]![i]! * root[r]!;
          for (let j = 0; j < n; j++) torque += mass[i]![j]! * accel[j]!;
          if (share) {
            // Less the ground's wrench on the foot, carried along the freedom's motion.
            const m = dynamics.axis(i), p = dynamics.pivot(i), x = foot.middle;
            const d = [x.x - p[0], x.y - p[1], x.z - p[2]];
            const swept = [m[1] * d[2]! - m[2] * d[1]!, m[2] * d[0]! - m[0] * d[2]!, m[0] * d[1]! - m[1] * d[0]!];
            torque -= m[0] * share.moment.x + m[1] * share.moment.y + m[2] * share.moment.z
              + swept[0]! * share.force.x + swept[1]! * share.force.y + swept[2]! * share.force.z;
          }
          const sense = torque >= 0 ? 1 : -1, strength = muscles.strength(i, sense);
          muscles.velocity[i] = sense * Infinity;
          muscles.activation[i] = strength > 0 ? Math.min(1, Math.abs(torque) / strength) : 0;
        });
      });
    },
    read(which) {
      // The centre of mass and its velocity (a body's linear velocity is its centre of mass's).
      const c = reading.centre.setAll(0), vel = reading.velocity.setAll(0);
      for (const segment of segments) {
        const m = segment.rigid.mass;
        c.addInPlace(centreOfToRef(segment, p).scaleInPlace(m));
        segment.body.linearVelocityToRef(v);
        vel.addInPlace(v.scaleInPlace(m));
      }
      c.scaleInPlace(1 / total);
      vel.scaleInPlace(1 / total);
      const on = which ?? last;
      supportOf(on ? feet.filter((foot) => on.includes(foot.side)) : feet);
    },
    command(muscles, goal, dt) {
      if (owned.length !== muscles.channels.length) {
        owned = new Uint8Array(muscles.channels.length);
        for (const foot of feet) foot.channels = foot.chain.flatMap((joint) => joint.dofs.map((dof) => muscles.channel(`${joint.spec.name} ${dof.spec.positive}`)));
      }
      owned.fill(0);
      aim.on = false;
      for (const task of tasks) task.on = false;
      // The step: a swing unlike the last starts one, and the feet that bear the body are the goal's
      // but for a swinging foot.
      // A stance on both feet steps of itself: walking, each foot in turn; walking nowhere, once its
      // capture point has left what its soles hold, to catch it. Each step runs to its landing unless
      // the goal asks for one of its own.
      const both = !!goal && goal.feet.includes("left") && goal.feet.includes("right") && !goal.swing;
      {
        const wx = (both && goal!.walk?.[0]) || 0, wz = (both && goal!.walk?.[1]) || 0, dx = wx - pace[0], dz = wz - pace[1];
        const most = gait.accel * dt, d = Math.hypot(dx, dz), k = d > most ? most / d : 1;
        pace[0] += dx * k;
        pace[1] += dz * k;
      }
      if (!both) {
        reading.own = null;
        stride = null;
        striding = null;
      } else if (!reading.own && reading.phase === "stand") {
        const walk = pace[0] !== 0 || pace[1] !== 0 ? pace : null;
        if (walk || (stride && recovery && outside(feet, reading.centre, reading.velocity, gravity(), inset) > recovery.margin)) {
          // Walking, or stopping a walk still under way: its steps keep their alternation.
          striding = pace;
          reading.own = walkStep(feet, reading.centre, reading.velocity, gravity(), striding, goal.heading, gait, stride, undefined, inset);
          reading.strides += 1;
        } else if (stride && across(feet, goal.heading) < rest) {
          // A walk has ended on the gait's width, narrower than the body's own stance: one step
          // puts the feet back at the width it was built standing at.
          striding = null;
          reading.own = settleStep(feet, stride, goal.heading, rest, gait);
        } else if (recovery) {
          striding = null;
          reading.own = recoveryStep(feet, reading.centre, reading.velocity, gravity(), recovery, inset);
          if (reading.own) reading.recoveries += 1;
        }
        stride = striding && reading.own ? reading.own.foot : null;
      } else if (reading.own && striding && reading.phase === "swing" && step.lifted && step.swing === reading.own) {
        // A walk's step under way lands where the body's capture point, measured, says it must: the
        // body lags its plan, and a landing fixed at lift carries the lag into the next step.
        const aimed = walkStep(feet, reading.centre, reading.velocity, gravity(), striding, goal.heading, gait, null,
          { foot: reading.own.foot, pivot: reading.place, remaining: reading.own.seconds - step.time }, inset);
        // (`striding` is the pace, read as it is now.)
        reading.own = step.swing = { ...reading.own, to: aimed.to };
      }
      const swing = goal?.swing ?? reading.own;
      if (!swing) {
        step.swing = null;
        reading.phase = "stand";
      } else if (!sameSwing(swing, step.swing)) {
        step.swing = swing;
        step.lifted = false;
        reading.phase = swing.shift === false ? "swing" : "shift";
      }
      const bearing = !goal ? [] : reading.phase === "swing" ? goal.feet.filter((side) => side !== swing!.foot) : goal.feet;
      if (!goal || !last || bearing.length !== last.length || bearing.some((side) => !last!.includes(side))) {
        plan.on = false;
      }
      last = goal ? bearing : null;
      const stance = feet.filter((foot) => bearing.includes(foot.side));
      if (!goal || stance.length === 0) return;
      supportOf(stance);
      const c = reading.centre, vel = reading.velocity, g = gravity();

      // The plan: where the centre of mass should be, moving critically damped toward the goal
      // across the ground and in height at each time constant, from where the stance began. The
      // ground is level, y up; the plan's y is the height over the soles.
      const height = c.y - reading.support.y;
      if (!plan.on) {
        plan.at.set(c.x, height, c.z);
        plan.velocity.copyFrom(vel);
        plan.on = true;
      }
      const r = plan.at, u = plan.velocity;
      const n = 1 / seconds.across, k = 1 / seconds.height, pendulum = g / Math.max(r.y, 1e-3);
      const bearer = swing ? stance.find((foot) => foot.side !== swing.foot) : undefined;
      let ax: number, az: number;
      if (reading.phase === "swing") {
        // On one foot the plan falls as an inverted pendulum of its height about a point of the
        // bearing sole (Kajita et al. 2001, "The 3D linear inverted pendulum mode", IROS), whose
        // capture point runs away from that point exponentially. The point is chosen each step so
        // that the capture point reaches the middle of the stance the step lands in as the foot
        // lands (Englsberger et al. 2011, "Bipedal walking control based on Capture Point
        // dynamics", IROS), within what the sole holds: the body falls toward its new stance.
        const w = Math.sqrt(pendulum), grow = Math.exp(w * Math.max(swing!.seconds - step.time, dt));
        const [tx, tz] = swing!.capture ?? [(bearer!.middle.x + swing!.to[0]) / 2, (bearer!.middle.z + swing!.to[1]) / 2];
        const [px, pz] = withinSupport([bearer!], (tx - (r.x + u.x / w) * grow) / (1 - grow), (tz - (r.z + u.z / w) * grow) / (1 - grow),
          inset);
        reading.place.set(px, 0, pz);
        ax = pendulum * (r.x - px);
        az = pendulum * (r.z - pz);
      } else if (reading.phase === "shift") {
        // Before a step the plan goes toward the bearing sole's middle, as fast as its constant
        // takes it, past what a stance on both feet holds: the foot lifts before it gets there.
        reading.place.set(bearer!.middle.x, 0, bearer!.middle.z);
        ax = n * n * (bearer!.middle.x - r.x) - 2 * n * u.x;
        az = n * n * (bearer!.middle.z - r.z) - 2 * n * u.z;
      } else {
        // A place outside what the soles can hold is taken at the nearest point that they can.
        const [gx, gz] = withinSupport(stance, goal.centre?.[0] ?? reading.support.x, goal.centre?.[1] ?? reading.support.z, inset);
        reading.place.set(gx, 0, gz);
        ax = n * n * (gx - r.x) - 2 * n * u.x;
        az = n * n * (gz - r.z) - 2 * n * u.z;
      }
      // No higher than each leg reaches with its knee bent by `STANCE_KNEE_BEND`, its hip carried as
      // the plan carries the centre of mass: a stance leg from its ankle, a swinging leg from where
      // its ankle will be when its sole lands.
      // And no lower than each leg reaches with its ankle dorsiflexed to its range less
      // `STANCE_ANKLE_SPARE`, its foot where it stands or will land: the knee's place is then fixed,
      // and the hip is a thigh from it. Where the two disagree, the ankle's stop is the harder limit.
      let high = goal.height, low = -Infinity;
      for (const foot of reading.phase === "swing" ? feet : stance) {
        const [hip, knee, ankle] = foot.chain;
        pointOfToRef(hip!.parent, hip!.spec.centre.value, hipAt);
        pointOfToRef(ankle!.parent, ankle!.spec.centre.value, ankleAt);
        const [a, b] = foot.lengths, hx = hipAt.x + r.x - c.x, hz = hipAt.z + r.z - c.z, rise = c.y - hipAt.y - reading.support.y;
        if (!stance.includes(foot)) ankleAt.addInPlaceFromFloats(swing!.to[0] - foot.middle.x, reading.support.y - foot.middle.y, swing!.to[1] - foot.middle.z);
        if (bend !== null) {
          const long = Math.sqrt(a * a + b * b + 2 * a * b * Math.cos(bend)), across = Math.hypot(hx - ankleAt.x, hz - ankleAt.z);
          high = Math.min(high, ankleAt.y + Math.sqrt(Math.max(0, long * long - across * across)) + rise);
        }
        if (spare !== null) {
          // The shank's turn is the foot's with the ankle's own undone (rel = D_shank^-1 D_foot).
          const dorsiflexion = ankle!.dofs[0]!.spec;
          rotationAtToRef(ankle!, [dorsiflexion.max.value - spare, 0], shank);
          turnOfToRef(foot.segment, footTurn).multiplyToRef(Quaternion.InverseToRef(shank, shank), shank);
          const k = knee!.spec.centre.value, o = ankle!.spec.centre.value;
          kneeAt.set(k[0] - o[0], k[1] - o[1], k[2] - o[2]).applyRotationQuaternionToRef(shank, kneeAt).addInPlace(ankleAt);
          const across = Math.hypot(hx - kneeAt.x, hz - kneeAt.z);
          if (across < a) low = Math.max(low, kneeAt.y + Math.sqrt(a * a - across * across) + rise);
        }
      }
      high = Math.max(high, low);
      const ay = k * k * (high - r.y) - 2 * k * u.y;
      u.addInPlaceFromFloats(ax * dt, ay * dt, az * dt);
      r.addInPlace(u.scale(dt));
      reading.plan.copyFrom(r);
      reading.planVelocity.copyFrom(u);
      // The weight is shifted once the body's capture point (Pratt et al. 2006, "Capture point: a step
      // toward humanoid push recovery", Humanoids) is over the bearing sole: from there the body
      // falls toward that foot, not away from it.
      if (reading.phase === "shift") {
        const w = Math.sqrt(g / Math.max(height, 1e-3)), cx = c.x + vel.x / w, cz = c.z + vel.z / w;
        const [hx, hz] = withinSupport([bearer!], cx, cz, inset);
        if (hx === cx && hz === cz) reading.phase = "swing";
      }
      // The pelvis's asked turn: toward upright at the heading, the error over the time constant.
      Quaternion.RotationAxisToRef(Vector3.UpReadOnly, goal.heading, target);
      target.multiplyInPlace(pelvis.rest);
      Quaternion.InverseToRef(pelvis.node.rotationQuaternion!, inverse);
      target.multiplyToRef(inverse, error);
      if (error.w < 0) error.scaleInPlace(-1);
      const half = Math.hypot(error.x, error.y, error.z), angle = 2 * Math.atan2(half, error.w);
      spin.set(error.x, error.y, error.z).scaleInPlace(half > 1e-12 ? angle / half / seconds.turn : 0);

      // The root's angular acceleration: toward upright at the heading, critically damped at the
      // turn's constant (`spin` is the error's angle over it). The centre of mass's: the plan's,
      // its errors taken up critically damped at `track`. Each bearing foot is held still, what
      // motion it has damped out at `track`.
      pelvis.body.angularVelocityToRef(pelvisSpin);
      const q = 1 / seconds.turn, e = 1 / track;
      aim.spin.copyFrom(spin).scaleInPlace(q).subtractInPlace(pelvisSpin.scaleInPlace(2 * q));
      aim.centre.set(ax + e * e * (r.x - c.x) + 2 * e * (u.x - vel.x), ay + e * e * (r.y - height) + 2 * e * (u.y - vel.y),
        az + e * e * (r.z - c.z) + 2 * e * (u.z - vel.z));
      aim.on = true;
      for (const foot of stance) {
        const task = tasks[feet.indexOf(foot)]!;
        footMotionToRef(foot, foot.middle, task.linear, task.angular);
        task.linear.scaleInPlace(-e);
        task.angular.scaleInPlace(-e);
        task.on = true;
        task.bearing = true;
        for (const i of foot.channels) owned[i] = 1;
      }

      // The swing: the foot's sole carried along its path, its turn carried from the one it left the
      // ground with to the one it lands with.
      if (reading.phase === "swing" && swing) {
        const foot = feet.find((f) => f.side === swing.foot)!;
        soleMiddleToRef(foot, sole);
        if (!step.lifted) {
          step.lifted = true;
          step.time = 0;
          step.from.copyFrom(sole);
          step.lift.copyFrom(foot.segment.node.rotationQuaternion!);
        }
        // It lands flat, facing the heading: its reference-pose turn, turned about up by the heading.
        // (Held at the turn it left with, a foot's yaw drifted step by step, to 50 degrees off.)
        Quaternion.RotationAxisToRef(Vector3.UpReadOnly, goal.heading, level);
        level.multiplyInPlace(foot.segment.rest);
        step.time += dt;
        const tau = Math.min(1, step.time / swing.seconds), from = step.from;
        // Minimum jerk across the ground, a lift of the same smoothness up and down.
        const s = tau * tau * tau * (10 - 15 * tau + 6 * tau * tau), ds = 30 * tau * tau * (1 - tau) * (1 - tau) / swing.seconds;
        const bump = 16 * tau * tau * (1 - tau) * (1 - tau), dbump = 32 * tau * (1 - tau) * (1 - 2 * tau) / swing.seconds;
        path.set(from.x + (swing.to[0] - from.x) * s, from.y + swing.lift * bump, from.z + (swing.to[1] - from.z) * s);
        Quaternion.SlerpToRef(step.lift, level, s, step.turn);
        along.set((swing.to[0] - from.x) * ds, swing.lift * dbump, (swing.to[1] - from.z) * ds);
        step.turn.multiplyToRef(Quaternion.InverseToRef(foot.segment.node.rotationQuaternion!, inverse), error);
        if (error.w < 0) error.scaleInPlace(-1);
        const half = Math.hypot(error.x, error.y, error.z), angle = 2 * Math.atan2(half, error.w);
        turn.set(error.x, error.y, error.z).scaleInPlace(half > 1e-12 ? angle / half / seconds.swing : 0);
        // The whole turn from lift to landing, world: the path's turn goes about its axis at its angle
        // times the path's rate.
        level.multiplyToRef(Quaternion.InverseToRef(step.lift, whole), whole);
        if (whole.w < 0) whole.scaleInPlace(-1);
        const wholeHalf = Math.hypot(whole.x, whole.y, whole.z), wholeAngle = 2 * Math.atan2(wholeHalf, whole.w);
        wholeAxis.set(whole.x, whole.y, whole.z).scaleInPlace(wholeHalf > 1e-12 ? wholeAngle / wholeHalf : 0);
        // The path's acceleration, and its errors in place and speed taken up critically damped at the
        // swing's constant; its turn's likewise. Without the turn's own rate and acceleration, its
        // damping held the foot back from the turn: at the swing's constant it lags a turn by twice its
        // rate over 1/0.1 s, and a foot turning 60 degrees over a swing lagged the whole of it. In the
        // lab routine's turns the feet landed 30 to 75 degrees off the heading, the pelvis turned the
        // bearing inside hip onto its stop, and the inside foot's swing dragged. With its rate, the lab
        // routine from seeded starts (`research/core-routine-battery.mjs`; Node core stand, Rapier):
        // at 120 Hz over 24 runs of 5 loops the Rogue 120 of 120 and the Warrior 120 (all runs
        // through), against 84 and 109; at 480 Hz over 12 runs, 60 of 60 each, against 56 and 60; over
        // 24 runs of 20 loops at 120 Hz, 466 of 480 (22 through) and 480. On the stance's batteries
        // (`STANCE_SECONDS`) the Rogue reads alike and the Warrior walks 23 of 25 and holds 209 shoves,
        // 70.0 N s (55 the least), against 22 and 202, 67.8 (55).
        const task = tasks[feet.indexOf(foot)]!, w = 1 / seconds.swing, T = swing.seconds;
        const dds = tau < 1 ? 60 * tau * (1 - tau) * (1 - 2 * tau) / (T * T) : 0, ddbump = tau < 1 ? 32 * (1 - 6 * tau + 6 * tau * tau) / (T * T) : 0;
        footMotionToRef(foot, sole, task.linear, task.angular);
        task.linear.set((swing.to[0] - from.x) * dds + w * w * (path.x - sole.x) + 2 * w * (along.x - task.linear.x),
          swing.lift * ddbump + w * w * (path.y - sole.y) + 2 * w * (along.y - task.linear.y),
          (swing.to[1] - from.z) * dds + w * w * (path.z - sole.z) + 2 * w * (along.z - task.linear.z));
        task.angular.scaleInPlace(-2 * w).addInPlace(turn.scale(w)).addInPlace(wholeAxis.scale(dds + 2 * w * ds));
        task.on = true;
        task.bearing = false;
        for (const i of foot.channels) owned[i] = 1;
        if (tau >= 1) {
          reading.phase = "stand";
          reading.own = null;
        }
      }
    },
  };
}

/** The soles' middles' distance apart across `heading` (rad about up, 0 facing +z), m. */
function across(feet: readonly FootState[], heading: number): number {
  const [a, b] = feet;
  return Math.abs((b!.middle.x - a!.middle.x) * Math.cos(heading) - (b!.middle.z - a!.middle.z) * Math.sin(heading));
}

/**
 * The step that ends a walk at the body's own stance: the foot that did not take the walk's last
 * step (`last`) lands `width` from the other's sole's middle across the heading, beside it, after
 * the weight has shifted off it, as a walk's first step does.
 */
function settleStep(feet: readonly FootState[], last: Foot, heading: number, width: number, tuning: GaitTuning): SwingGoal {
  const side: Foot = last === "left" ? "right" : "left", b = feet.find((f) => f.side === last)!.middle, sign = side === "right" ? 1 : -1;
  const rx = Math.cos(heading), rz = -Math.sin(heading);
  return { foot: side, to: [b.x + sign * width * rx, b.z + sign * width * rz], seconds: tuning.seconds, lift: tuning.lift, shift: true };
}

/**
 * The step that catches a body whose capture point (Pratt et al. 2006) is further than
 * `tuning.margin` outside the region both soles hold (their outline drawn in by `inset`), or null
 * if it is not. The capture point xi = c + v / w
 * (w = sqrt(g / height)), while the other foot bears the body about its sole's nearest point p to
 * it, runs to p + (xi - p) exp(w T) by the swing's end T (Kajita et al. 2001); the foot lands past
 * that, by `tuning.reach` of its distance from the bearing sole's middle, and never across the
 * bearing foot, a sole's width out from it at least. The foot whose sole is nearer the capture
 * point bears the body, and the other steps: chosen by the shorter way to the landing instead, the
 * far foot bore the body and it was flung across.
 */
function recoveryStep(feet: readonly FootState[], centre: Vector3, velocity: Vector3, g: number, tuning: RecoveryTuning, inset: number): SwingGoal | null {
  const height = centre.y - (feet[0]!.middle.y + feet[1]!.middle.y) / 2;
  const w = Math.sqrt(g / Math.max(height, 1e-3)), xi = centre.x + velocity.x / w, zi = centre.z + velocity.z / w;
  const [hx, hz] = withinSupport(feet, xi, zi, inset);
  if (Math.hypot(xi - hx, zi - hz) <= tuning.margin) return null;
  // The foot nearer the capture point bears the body; the other steps.
  const off = (foot: FootState) => { const [qx, qz] = withinSupport([foot], xi, zi, inset); return Math.hypot(xi - qx, zi - qz); };
  const bearer = off(feet[0]!) <= off(feet[1]!) ? feet[0]! : feet[1]!, foot = feet.find((other) => other !== bearer)!, b = bearer.middle;
  const [px, pz] = withinSupport([bearer], xi, zi, inset), grow = Math.exp(w * tuning.seconds);
  let tx = px + (xi - px) * grow, tz = pz + (zi - pz) * grow;
  tx += (tx - b.x) * tuning.reach;
  tz += (tz - b.z) * tuning.reach;
  // Not onto or across the bearing foot: a sole's width out from it, along the line between the soles.
  const ox = foot.middle.x - b.x, oz = foot.middle.z - b.z, wide = Math.hypot(ox, oz), out = ((tx - b.x) * ox + (tz - b.z) * oz) / wide;
  if (out < foot.width) {
    tx += (foot.width - out) * ox / wide;
    tz += (foot.width - out) * oz / wide;
  }
  return { foot: foot.side, to: [tx, tz], seconds: tuning.seconds, lift: tuning.lift, shift: false };
}

/** How far the capture point of a body at `centre` moving at `velocity` is outside the region `feet`'s soles hold, m. */
function outside(feet: readonly FootState[], centre: Vector3, velocity: Vector3, g: number, inset: number): number {
  const height = centre.y - (feet[0]!.middle.y + feet[1]!.middle.y) / 2;
  const w = Math.sqrt(g / Math.max(height, 1e-3)), xi = centre.x + velocity.x / w, zi = centre.z + velocity.z / w;
  const [hx, hz] = withinSupport(feet, xi, zi, inset);
  return Math.hypot(xi - hx, zi - hz);
}

/**
 * A walk's next step at the velocity `walk`, world (x, z), m/s: the foot other than `last`'s steps,
 * or, starting, the one on the side the walk goes (the right, going straight).
 *
 * The capture point xi = c + v / w, while the other foot bears the body about a point p of its
 * sole, runs to e = p + (xi - p) exp(w T) by the swing's end T (Kajita et al. 2001). In a steady
 * walk, each step about its sole's middle b, it lands ahead of the new foot by the walk's distance
 * over a swing over exp(w T) - 1, and in from it by the width over exp(w T) + 1 (the capture
 * point's steady cycle, as in Englsberger et al. 2011): the steady landing is b, the walk's distance
 * over a swing on, the width out. The pivot p is the one that brings e to where the steady landing
 * wants it, within what the bearing sole holds (drawn in by `inset`), and the foot lands at e less
 * the steady offset: the step leaves the steady one only by what the sole cannot take. (With p
 * fixed at b, the step takes it all: a landing a few centimetres off is exp(w T) times that off
 * at the next step, and the steps widened until the feet could not reach.) The width is at least
 * a sole's width and the walk's distance across the heading over a swing; the step is no further
 * from the bearing sole than `longest` of the leg, and that width out to its own side at least.
 * Walking nowhere, the steps stop a walk under way. `under` re-aims a step under way: its foot,
 * the pivot the body falls about, and the swing's time left.
 */
function walkStep(feet: readonly FootState[], centre: Vector3, velocity: Vector3, g: number, walk: readonly [number, number], heading: number,
  tuning: GaitTuning, last: Foot | null, under?: { readonly foot: Foot; readonly pivot: Vector3; readonly remaining: number }, inset = SUPPORT_INSET): SwingGoal {
  // The pelvis's right across the ground at the heading: +x at heading 0.
  const rx = Math.cos(heading), rz = -Math.sin(heading);
  const side: Foot = under?.foot ?? (last ? (last === "left" ? "right" : "left") : walk[0] * rx + walk[1] * rz < 0 ? "left" : "right");
  const foot = feet.find((f) => f.side === side)!, bearer = feet.find((f) => f !== foot)!, b = bearer.middle, sign = side === "right" ? 1 : -1;
  const T = tuning.seconds, w = Math.sqrt(g / Math.max(centre.y - b.y, 1e-3)), grow = Math.exp(w * T);
  const clear = foot.width, W = Math.max(tuning.width, clear + Math.abs(walk[0] * rx + walk[1] * rz) * T);
  // Under way, the capture point runs from the pivot the body falls about for what is left of the swing.
  const run = under ? Math.exp(w * Math.max(under.remaining, 0)) : grow, xi = centre.x + velocity.x / w, zi = centre.z + velocity.z / w;
  // Ahead of the new foot by the walk's distance over a swing over exp(w T) - 1, and in from it by
  // the width over exp(w T) + 1: along the walk each step goes the same way, across it they alternate.
  const nx = walk[0] * T / (grow - 1) - sign * W * rx / (grow + 1), nz = walk[1] * T / (grow - 1) - sign * W * rz / (grow + 1);
  // The steady landing.
  const sx = b.x + walk[0] * T + sign * W * rx, sz = b.z + walk[1] * T + sign * W * rz;
  let px = under ? under.pivot.x : b.x, pz = under ? under.pivot.z : b.z;
  // (At the swing's end the capture point is where it is, wherever the pivot.)
  if (run > 1 + 1e-6) [px, pz] = withinSupport([bearer], (sx + nx - xi * run) / (1 - run), (sz + nz - zi * run) / (1 - run), inset);
  const ex = px + (xi - px) * run, ez = pz + (zi - pz) * run;
  // Starting from a stand, the weight is shifted first and the foot lands where a steady walk puts it.
  const steady = last || under;
  let tx = steady ? ex - nx : sx, tz = steady ? ez - nz : sz;
  const longest = tuning.longest * (foot.lengths[0] + foot.lengths[1]), far = Math.hypot(tx - b.x, tz - b.z);
  if (far > longest) {
    tx = b.x + (tx - b.x) * longest / far;
    tz = b.z + (tz - b.z) * longest / far;
  }
  const out = sign * ((tx - b.x) * rx + (tz - b.z) * rz);
  if (out < clear) {
    tx += sign * (clear - out) * rx;
    tz += sign * (clear - out) * rz;
  }
  return { foot: side, to: [tx, tz], seconds: T, lift: tuning.lift, shift: !steady, capture: steady ? [ex, ez] : [tx + nx, tz + nz] };
}

/**
 * The point (x, z) if it lies inside the outline of `soles`' corners (world, the ground level, y
 * up) drawn in by `inset`, else the outline's nearest point to it.
 */
export function withinSupport(soles: readonly Sole[], x: number, z: number, inset = SUPPORT_INSET): [number, number] {
  const drawn = drawnOutline(soles, inset);
  let best: [number, number] = [x, z], far = 0;
  for (let k = 0; k < drawn.length; k++) {
    const [ax, az] = drawn[k]!, [bx, bz] = drawn[(k + 1) % drawn.length]!;
    if ((bz - az) * (x - ax) + (ax - bx) * (z - az) <= 0) continue;
    // Outside this edge: the nearest point of the outline is on an edge the point is outside of.
    const ex = bx - ax, ez = bz - az, t = Math.min(1, Math.max(0, ((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez)));
    const px = ax + t * ex, pz = az + t * ez, d = Math.hypot(x - px, z - pz);
    if (far === 0 || d < far) { best = [px, pz]; far = d; }
  }
  return best;
}

/** A stance sole: its corners, world, the ground level, y up. */
type Sole = { readonly corners: readonly Vector3[] };

/** Whether two swings are the same step. */
function sameSwing(a: SwingGoal, b: SwingGoal | null): boolean {
  return b !== null && a.foot === b.foot && a.to[0] === b.to[0] && a.to[1] === b.to[1] && a.seconds === b.seconds
    && a.lift === b.lift && (a.shift ?? true) === (b.shift ?? true);
}

/** The middle of `foot`'s sole's corners, world, now. */
function soleMiddleToRef(foot: FootState, out: Vector3): Vector3 {
  const turn = foot.segment.node.rotationQuaternion!, at = foot.segment.node.position;
  out.setAll(0);
  foot.sole.forEach((corner, k) => { out.addInPlace(corner.applyRotationQuaternionToRef(turn, foot.corners[k]!).addInPlace(at)); });
  return out.scaleInPlace(1 / foot.sole.length);
}

/** The convex hull of `soles`' corners (x, z), drawn toward its vertices' middle by `inset`, anticlockwise. */
function drawnOutline(soles: readonly Sole[], inset: number): [number, number][] {
  const hull = outline(soles.flatMap((sole) => sole.corners.map((q): [number, number] => [q.x, q.z])));
  const mx = hull.reduce((sum, q) => sum + q[0], 0) / hull.length, mz = hull.reduce((sum, q) => sum + q[1], 0) / hull.length;
  return hull.map(([px, pz]): [number, number] => [mx + (1 - inset) * (px - mx), mz + (1 - inset) * (pz - mz)]);
}

/** The convex hull of `points` (x, z), anticlockwise, by the monotone chain. */
function outline(points: [number, number][]): [number, number][] {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const turn = (o: [number, number], a: [number, number], b: [number, number]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const chain = (from: [number, number][]) => {
    const out: [number, number][] = [];
    for (const q of from) {
      while (out.length >= 2 && turn(out[out.length - 2]!, out[out.length - 1]!, q) <= 0) out.pop();
      out.push(q);
    }
    return out.slice(0, -1);
  };
  return [...chain(sorted), ...chain([...sorted].reverse())];
}

const scratch = { a: new Quaternion(), b: new Quaternion() };

/** `segment`'s turn since its reference pose, node times rest^-1 (H24). */
function turnOfToRef(segment: BuiltSegment, out: Quaternion): Quaternion {
  Quaternion.InverseToRef(segment.rest, scratch.a);
  return segment.node.rotationQuaternion!.multiplyToRef(scratch.a, out);
}

/** `point` (body frame, reference pose, on `segment`) where it is now, world. */
function pointOfToRef(segment: BuiltSegment, point: Vec3, out: Vector3): Vector3 {
  const origin = segment.frame.origin;
  return out.set(point[0] - origin[0], point[1] - origin[1], point[2] - origin[2])
    .applyRotationQuaternionToRef(turnOfToRef(segment, scratch.b), out).addInPlace(segment.node.position);
}

const centreOfToRef = (segment: BuiltSegment, out: Vector3): Vector3 => pointOfToRef(segment, segment.rigid.centre, out);

/** `foot`'s point `at` (world): its velocity into `linear`, and the foot's spin into `angular`. */
function footMotionToRef(foot: FootState, at: Vector3, linear: Vector3, angular: Vector3): void {
  const body = foot.segment.body, c = centreOfToRef(foot.segment, new Vector3());
  body.linearVelocityToRef(linear);
  body.angularVelocityToRef(angular);
  linear.addInPlace(Vector3.Cross(angular, at.subtract(c)));
}

/** `foot`'s sole as it bears (`BearingSole`), its centre of pressure kept to `keep` of its half-length and half-width. */
function bearingSole(foot: FootState, keep: number): BearingSole {
  const [a, ...rest] = foot.corners, near = rest.map((q) => Vector3.Distance(a!, q)).map((d, k) => [d, k] as const).sort((p, q) => p[0] - q[0]);
  // The corner a long side away from the first: the middle of the three distances.
  const other = rest[near[1]![1]]!, along = other.subtract(a!);
  along.y = 0;
  return { middle: foot.middle, along: along.normalize(), length: keep * foot.reach, width: keep * foot.width / 2 };
}

/**
 * The friction the stance takes the ground to give, the coefficient: Rapier's default collider
 * friction, 0.5, which the ground and the feet keep and which Rapier combines by their average
 * (`src/core/engine/rapier.ts` sets neither).
 */
const GROUND_FRICTION = 0.5;

/**
 * The least-squares `x` of `J x = y`, damped by `LEG_DAMPING`: J' (J J' + d^2 E)^-1 y. A straight
 * knee is a singular leg, and an undamped solve asks it for unbounded accelerations.
 */
function dampedSolve(J: readonly (readonly number[])[], y: readonly number[]): number[] {
  const rows = J.length, cols = J[0]!.length, d2 = LEG_DAMPING * LEG_DAMPING;
  const G = J.map((a, r) => J.map((b, s) => a.reduce((sum, v, k) => sum + v * b[k]!, 0) + (r === s ? d2 : 0)));
  const z = solveSymmetric(G, [...y]);
  return Array.from({ length: cols }, (_, k) => { let sum = 0; for (let r = 0; r < rows; r++) sum += J[r]![k]! * z[r]!; return sum; });
}

/**
 * `dampedSolve` of `J x = y` with the freedoms `fixed` names (a number, not NaN) held to it: the
 * others solve J_free x = y - J_fixed fixed. A freedom at a limit is a task above the rest, as in a
 * prioritized solve (Siciliano and Slotine 1991, "A general framework for managing multiple tasks
 * in highly redundant robotic systems", ICAR).
 */
function fixedSolve(J: readonly (readonly number[])[], y: readonly number[], fixed: readonly number[]): number[] {
  if (fixed.every(Number.isNaN)) return dampedSolve(J, y);
  const free = fixed.flatMap((v, k) => Number.isNaN(v) ? [k] : []);
  const rest = dampedSolve(J.map((row) => free.map((k) => row[k]!)),
    y.map((v, r) => v - fixed.reduce((sum, f, k) => Number.isNaN(f) ? sum : sum + J[r]![k]! * f, 0)));
  const x = [...fixed];
  free.forEach((k, c) => { x[k] = rest[c]!; });
  return x;
}

/**
 * The least of (x - y)' A (x - y) over lo <= x <= hi, A symmetric and positive semidefinite: a
 * primal active-set method on the bounds (Nocedal and Wright 2006, "Numerical Optimization", 16.5),
 * from y clipped. A direction A does not weigh stays at y's, clipped.
 */
export function boundedLeastSquares(A: readonly (readonly number[])[], y: readonly number[], lo: readonly number[], hi: readonly number[]): number[] {
  const n = y.length, x = y.map((v, i) => Math.min(hi[i]!, Math.max(lo[i]!, v)));
  const held = x.map((v, i) => v !== y[i]);
  const scale = Math.max(...A.map((row, i) => row[i]!)), e = REGULARIZER * scale;
  const gradient = () => x.map((_, i) => A[i]!.reduce((sum, v, j) => sum + v * (x[j]! - y[j]!), 0) + e * (x[i]! - y[i]!));
  for (let iteration = 0; iteration < 4 * n + 4; iteration++) {
    const g = gradient(), free = x.flatMap((_, i) => (held[i] ? [] : [i]));
    // The free ones' step to the least with the held ones where they are.
    const p = free.length ? solveLinear(free.map((i) => free.map((j) => A[i]![j]! + (i === j ? e : 0))), free.map((i) => -g[i]!)) : [];
    let step = 1, blocking = -1;
    free.forEach((i, c) => {
      const d = p[c]!, t = d > 0 ? (hi[i]! - x[i]!) / d : d < 0 ? (lo[i]! - x[i]!) / d : Infinity;
      if (t < step) { step = Math.max(0, t); blocking = i; }
    });
    free.forEach((i, c) => { x[i] = x[i]! + step * p[c]!; });
    if (blocking >= 0) {
      x[blocking] = p[free.indexOf(blocking)]! > 0 ? hi[blocking]! : lo[blocking]!;
      held[blocking] = true;
      continue;
    }
    // At the least with these held: release the one held against the way it would go.
    const after = gradient();
    let worst = -1, most = 1e-12 * (1 + scale);
    x.forEach((v, i) => {
      if (!held[i]) return;
      const against = v <= lo[i]! ? -after[i]! : after[i]!;
      if (against > most) { most = against; worst = i; }
    });
    if (worst < 0) return x;
    held[worst] = false;
  }
  return x;
}

/** The regularizer's weight against the problem's largest, a numeric setting, as `shareGroundWrench`'s. */
const REGULARIZER = 1e-6;

/** Solve `A x = y` by elimination with partial pivoting; `A` is left as it was. */
function solveLinear(A: readonly (readonly number[])[], y: readonly number[]): number[] {
  const n = y.length, M = A.map((row, i) => [...row, y[i]!]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r]![c]!) > Math.abs(M[p]![c]!)) p = r;
    [M[c], M[p]] = [M[p]!, M[c]!];
    for (let r = c + 1; r < n; r++) {
      const f = M[r]![c]! / M[c]![c]!;
      if (f !== 0) for (let k = c; k <= n; k++) M[r]![k] = M[r]![k]! - f * M[c]![k]!;
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let sum = M[r]![n]!;
    for (let k = r + 1; k < n; k++) sum -= M[r]![k]! * x[k]!;
    x[r] = sum / M[r]![r]!;
  }
  return x;
}

/** The knee's bend in the reference pose, rad: the shank's line (knee to ankle) from the thigh's (hip to knee). */
function referenceBendOf(chain: readonly BuiltJoint[]): number {
  const [hip, knee, ankle] = chain.map((joint) => joint.spec.centre.value);
  const t = [knee![0] - hip![0], knee![1] - hip![1], knee![2] - hip![2]], h = [ankle![0] - knee![0], ankle![1] - knee![1], ankle![2] - knee![2]];
  const dot = t[0]! * h[0]! + t[1]! * h[1]! + t[2]! * h[2]!;
  return Math.acos(Math.max(-1, Math.min(1, dot / (Math.hypot(t[0]!, t[1]!, t[2]!) * Math.hypot(h[0]!, h[1]!, h[2]!)))));
}

/** The thigh's and the shank's lengths in the reference pose: hip to knee, and knee to ankle. */
function lengthsOf(chain: readonly BuiltJoint[]): [number, number] {
  const [hip, knee, ankle] = chain.map((joint) => joint.spec.centre.value);
  const distance = (p: Vec3, q: Vec3) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
  return [distance(hip!, knee!), distance(knee!, ankle!)];
}

/** Solve `A x = y`, `A` symmetric positive definite, by Cholesky. */
function solveSymmetric(A: number[][], y: number[]): number[] {
  const n = y.length, L = A.map(() => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) {
    let sum = A[i]![j]!;
    for (let k = 0; k < j; k++) sum -= L[i]![k]! * L[j]![k]!;
    L[i]![j] = i === j ? Math.sqrt(sum) : sum / L[j]![j]!;
  }
  const z = new Array<number>(n).fill(0), x = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) { let sum = y[i]!; for (let k = 0; k < i; k++) sum -= L[i]![k]! * z[k]!; z[i] = sum / L[i]![i]!; }
  for (let i = n - 1; i >= 0; i--) { let sum = z[i]!; for (let k = i + 1; k < n; k++) sum -= L[k]![i]! * x[k]!; x[i] = sum / L[i]![i]!; }
  return x;
}

/**
 * The corners of `foot`'s sole, in the segment's own frame: the four corners of its box lowest in
 * the reference pose.
 */
function soleOf(foot: BuiltSegment): Vector3[] {
  const shape = foot.spec.shape;
  if (shape.kind !== "box") throw new Error(`${foot.spec.name} is a ${shape.kind}; a stance reads a box's sole`);
  const { origin, x, y, z } = foot.frame, centre = shape.centre.value, size = shape.size.value;
  const corners: Vec3[] = [];
  for (const sx of [-0.5, 0.5]) for (const sy of [-0.5, 0.5]) for (const sz of [-0.5, 0.5]) {
    const at = (k: number) => centre[k]! + sx * size[0] * x[k]! + sy * size[1] * y[k]! + sz * size[2] * z[k]!;
    corners.push([at(0), at(1), at(2)]);
  }
  corners.sort((a, b) => a[1] - b[1]);
  const dot = (a: readonly number[], b: readonly number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
  return corners.slice(0, 4).map((q) => {
    const o = [q[0] - origin[0], q[1] - origin[1], q[2] - origin[2]];
    return new Vector3(dot(o, x), dot(o, y), dot(o, z));
  });
}
