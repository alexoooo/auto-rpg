import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { PhysicsMassProperties } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";
import type { BuiltBody, BuiltJoint, BuiltSegment } from "../build/build-body.ts";
import { jointAngles, motionAxesToRef } from "../build/joint-state.ts";
import type { MuscleDriver } from "../muscle/driver.ts";
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
 * **Standing: the pelvis carried by the legs, the feet where they are.** The stance plans its
 * centre of mass's way to the goal -- critically damped at a time constant (`STANCE_SECONDS`),
 * toward a place the soles can hold (`withinSupport`), no higher than the legs reach with their
 * knees bent (`STANCE_KNEE_BEND`) and no lower than they reach within their ankles' range
 * (`STANCE_ANKLE_SPARE`) -- and each step asks the pelvis for a motion: the plan's
 * velocity, with the centre of mass's error from the plan over the time constant and its velocity's
 * error by a gain (`STANCE_VELOCITY_GAIN`), and a turn toward upright at the goal's heading, its
 * error over its own. It gives each stance leg's freedoms the speeds that make that motion with the
 * foot still: the leg's Jacobian, from the pelvis to the foot, undone (`legSpeeds`). The muscles
 * are asked for those speeds at full activation, so each joint's motor pulls toward its speed with
 * what strength it has at the speed (`driveMuscles`), and Havok's solver finds the torques together
 * with the ground's push and the other leg's, in the same solve.
 *
 * **A step** (`SwingGoal`) shifts the weight onto the other foot until the body's capture point is
 * over that sole, lifts the foot, and carries it on its path while the plan falls as an inverted
 * pendulum about a point of the bearing sole chosen to bring the capture point to the middle of the
 * stance the step lands in; the foot lands at the swing's end, and the stance holds the new feet.
 *
 * The plan is what makes a move settle. Asked straight for its error over the time constant, the
 * body read its own velocity a step late, overshot a place 2 and 3 cm away and fell by 3 s; asked
 * for a critically damped acceleration from its measured velocity, it coasted through the place,
 * each step's error riding on the next. Tracking a plan that is itself settled, it stops within
 * 3.4 mm (the Rogue, Node stand, 120 Hz).
 *
 * The torque the servo would compute here (`servo.ts`) is not asked for: it treats its root as
 * held, and a stance foot is not held but stands. A torque source on an ankle rocks a foot on
 * Havok's contact -- 10 N m on the Rogue's settled foot lifts it 1.1 mm and spins it at 0.25 rad/s
 * (Node stand, 120 Hz) -- and a computed torque rooted at the foot read that rocking as the whole
 * body's turn about the ankle and asked hundreds of newton metres to stop it, which rocked the foot
 * harder; rooted at the pelvis instead, the hips' torques spun the light pelvis between the legs
 * and the trunk. A speed asked of a motor is met inside the solver, with the contact.
 *
 * A stance foot's rotational inertia is raised while it stands (`STANCE_FOOT_CONDITIONING`), as
 * solver conditioning: a foot flat on the ground does not turn, so its inertia takes no part in the
 * body's motion, but at its own it stalls the solver.
 *
 * Nothing here holds the body up that the legs' muscles do not: a speed the muscles cannot reach is
 * not reached, and a body asked for more than its feet can take tips or falls.
 */
export interface StanceControl {
  /**
   * Read the body: its centre of mass and velocity, and the soles of `feet` (the last command's
   * stance feet, or both). A body reads this before its driver decides, so the driver's view is
   * this step's; `command` uses it.
   */
  read(feet?: readonly Foot[]): void;
  /**
   * Ask the stance legs' muscles for `goal`'s speeds from the last reading; the channels asked are
   * marked in `owned`, for the servo to leave. With no goal nothing is asked, and every foot has
   * its own inertia back.
   */
  command(driver: MuscleDriver, goal: StanceGoal | null, dt: number): void;
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
  /** The velocity asked of the centre of mass, carried by the pelvis, world, m/s. */
  readonly asked: Vector3;
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
 * damped, of the pelvis's turn, and of a swinging foot's pull onto its path, each of whose speed
 * asked is its error over its constant. The swing's is from a sweep: of `STANCE_VELOCITY_GAIN`'s 48
 * steps, at 0.05 s 2 failed and the worst landing missed by 3.5 cm, the foot wandering 3 cm either
 * side of its path; at 0.1, 2 and 1.7 cm; at 0.2, 3 and 1.6 cm (Node stand, 120 Hz).
 *
 * The pull across the ground was swept against walks stopped and steps (Node stand, 120 Hz). Some
 * walks stopped sway from foot to foot, 2-4 cm either way at about 0.12 m/s, and do not settle: the
 * feet rock on their edges with their inertia conditioned (`STANCE_FOOT_CONDITIONING` has the
 * numbers). Softer pulls settle more of those walks and fail more of `STANCE_VELOCITY_GAIN`'s 48
 * steps, the 30 cm forward ones first; a step to close the stance, tried, settled none more. Each human walked 6 s at 0.2,
 * 0.3 and 0.4 m/s five ways (forward, right, back, left, forward right), reversed for 6 s and
 * stopped for 4 s, 1 and 3 cm under its reference height, with no closing step; "stopped" is under
 * 5 cm/s and staying so by the end:
 *
 *     across           0.2    0.3    0.4    0.5    0.6    0.8
 *     walks stopped    32     51     56     60     59     58     of 60
 *     steps failed            1      2      3      7      48     of 48 (0.8: too slow to settle by 6 s)
 */
export const STANCE_SECONDS = { across: 0.3, height: 0.15, turn: 0.15, swing: 0.1 } as const;

/** What an experiment may set in place of the stance's constants. */
export interface StanceTuning {
  readonly seconds?: { readonly across: number; readonly height: number; readonly turn: number; readonly swing: number };
  readonly footConditioning?: number;
  readonly supportInset?: number;
  readonly velocityGain?: number;
  /** The least knee bend the height is held for, rad; null holds the goal's height however far the legs reach. */
  readonly kneeBend?: number | null;
  /** The ankle's dorsiflexion left unused, rad; null holds the goal's height however far the ankles bend. */
  readonly ankleSpare?: number | null;
  /** How a stance on both feet steps to catch a push (`STANCE_RECOVERY`); null never steps unasked. */
  readonly recovery?: RecoveryTuning | null;
  /** How a stance walks (`STANCE_GAIT`). */
  readonly gait?: GaitTuning;
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
 * **A control setting, from a sweep**: the gain on the centre of mass's velocity error across the
 * ground, the plan's less the body's, added to the velocity asked of the pelvis.
 *
 * The legs' motors do not hold the pelvis at the speed asked of it: joined through the ground, the
 * two legs are a closed chain, and Havok's solver leaves it soft -- after a step, the Rogue's
 * pelvis was moving at 21.6 cm/s when asked for 1.1, its legs' motors pulling a tenth of their
 * ceilings. Without the gain, a stance staggered by a step swayed along the line between its feet,
 * each swing larger (0.8 s apart, 3 then 22 then 41 cm/s), and fell by 6 s. The steps that failed
 * of 48 -- both humans, each foot, 10, 15, 25 and 30 cm forward, 15 and 25 back, 5 and 10 out, 5 in,
 * and 8 out and 10 forward, 5 out and 10 back, 5 in and 20 forward; standing 1 s, a 0.45 s swing
 * lifted 5 cm, standing to 6 s; a failure falls, or ends more than 3 cm from its place or moving
 * faster than 5 cm/s over its last 2 s -- and the worst miss of a landed sole's middle, cm, by the
 * gain (Node stand, 120 Hz):
 *
 *     gain      0     0.5    1     1.5    2      3      4
 *     failed    12    8      5     2      0      1      0
 *     miss      2.0   4.2    3.5   2.1    1.7    1.6    1.9
 *
 * 2 is the least gain that fails none; with the walk in the code (the walking commit) 1 fails at 2,
 * the Warrior's right foot 25 cm back. The 30 cm forward steps and the 25 cm back steps are the
 * marginal ones: from standing, in 0.45 s, the capture point can barely be carried 30 cm over one
 * sole. The gain also holds the places the stance's region was
 * drawn for with no limit on the plan's speed (`SUPPORT_INSET`), where before it needed one.
 */
export const STANCE_VELOCITY_GAIN = 2;

/**
 * **A control setting, from a sweep**: the least bend of a knee, rad from straight, that the
 * stance's height is held for.
 *
 * A straight knee is a singular leg, and past straight, at its hyperextension stop, the leg's
 * Jacobian shortens the leg by extending the knee further, which the stop refuses: the Warrior,
 * stepping 10 cm out from its stance, landed on a knee at its stop and asked it for 2 to 4 rad/s
 * more, while its pelvis spun. Held low enough for the legs' reach, the stance sinks as its feet
 * spread. The steps that failed of `STANCE_VELOCITY_GAIN`'s 48, by the bend (Node stand, 120 Hz):
 *
 *     bend      none   0.1    0.2    0.3    0.4    0.5
 *     failed    7      1      0      0      1      1
 *
 * Near straight a bend shortens the leg little (0.2 rad, 5 mm on the Warrior). 0.2 is the lesser
 * of the two that fail none.
 */
export const STANCE_KNEE_BEND = 0.2;

/**
 * **A control setting, from a sweep**: the ankle's dorsiflexion, rad, that the stance's height
 * leaves unused.
 *
 * With the feet flat and the pelvis upright, a lower stance tips the shanks further forward, and
 * the ankle's range (`humanSpec`: 0.35 rad from the reference pose) ends it: standing 3 cm under
 * the reference height, the Rogue's ankles are already at 0.26. Asked 5 cm lower still, its ankles
 * met their stop 0.3 s later, the legs' Jacobian went on asking them for 0.4 to 0.6 rad/s, and the
 * body toppled backward within a second; asked 40 cm lower, the same. Held above the ankles' reach,
 * each human sank to it and stood, asked 10 or 40 cm lower at once, at every spare from 0 to 0.05
 * (Node stand, 120 Hz), each some 5 cm under its reference height.
 * The steps that failed of `STANCE_VELOCITY_GAIN`'s 48, by the spare (Node stand, 120 Hz):
 *
 *     spare     none   0      0.01   0.02   0.03   0.05   0.1
 *     failed    2      1      0      1      1      2      6
 *
 * Those that fail from none to 0.05 are the marginal steps, 30 cm forward and 25 back, one side or
 * another from run to run; a larger spare holds a stepping stance too high for its knees. A stance
 * lower than this needs the hip to hinge -- the pelvis back, the trunk forward -- which the stance
 * does not yet do; or an ankle range larger than the one measured.
 */
export const STANCE_ANKLE_SPARE = 0.01;

/**
 * **Control settings, from a sweep**: a stance on both feet steps to catch a push once its capture
 * point is `margin` outside the region its soles hold (`SUPPORT_INSET`), swinging the foot over
 * `seconds` lifted by `lift`, and landing it `reach` past where the capture point will be.
 *
 * Each human standing 3 cm under its reference height was shoved at the middle trunk's centre of
 * mass by 10 to 60 N s in steps of 5, sixteen ways 22.5 degrees apart, and watched 4.5 s; it fell
 * if its centre sank 25 cm. The table gives the shoves held of the 176, and the impulse held each
 * way -- the largest below the first that fell -- as its mean over the ways and its least (Node
 * stand, 120 Hz):
 *
 *     margin  reach   seconds  lift    Rogue held  mean  least    Warrior held  mean  least
 *     no step                          47          19.4  10       73            27.5  15
 *     0       0.15    0.25     0.03    116         40.0  30       163           53.8  25
 *     0.02    0.15    0.25     0.03    113         37.2  20       161           49.7  20
 *     0.01    0.15    0.25     0.03    112         37.5  15       160           50.0  20
 *     0.01    0       0.25     0.03    90          23.1  10       154           47.8  25
 *     0.01    0.075   0.25     0.03    109         36.6  15       163           48.8  15
 *     0.01    0.3     0.25     0.03    107         36.3  20       158           49.7  25
 *     0.01    0.45    0.25     0.03    104         35.6  20       153           50.3  20
 *     0.01    0.15    0.25     0.05    112         37.8  15       165           50.6  20
 *     0.01    0.15    0.3      0.03    105         34.1  15       165           55.0  30
 *     0.01    0.15    0.15     0.03    115         40.6  35       169           54.7  30
 *     0.01    0.15    0.2      0.03    114         40.0  30       168           56.3  35    chosen
 *     0.01    0.075   0.2      0.03    106         36.6  25       165           52.8  15
 *     0.01    0.3     0.2      0.03    110         39.4  30       165           55.3  15
 *     0.01    0.15    0.2      0.05    113         38.8  30       170           55.3  15
 *
 * The margin is not for the shoves: at none, a place asked past the soles, held at the edge of what
 * they hold, sets steps off as the capture point wanders a millimetre over it (at -x the Rogue's
 * feet walked 25 cm); at 0.01 it stands. An outline of its own for the trigger, drawn in by 0.1 to
 * 0.7, held best at 0.5, the held region's own; drawn in by 0.7 the stance stepped from where it
 * stood unpushed and fell over its own feet. A 0.15 s swing holds as many as 0.2; 0.2 is the
 * slower. Sideways each human holds least: the far foot steps out with no weight shifted first.
 * Many held shoves take several steps: a long step leaves a wide stance whose soles hold a thin
 * band, and a foot slips at the engine's default friction.
 *
 * The table was taken on the code of the recovery steps' commit. Read again with the walk (the
 * walking commit), no step holds as before; the chosen settings 112, 39.4 and 30 for the Rogue, and
 * 168, 55.6 and 15 for the Warrior, who now falls to 20 N s from behind and holds 25-50.
 */
export const STANCE_RECOVERY: RecoveryTuning = { margin: 0.01, seconds: 0.2, lift: 0.03, reach: 0.15 };

/**
 * **Control settings, from a sweep**: a walk's steps swing over `seconds`, lifted by `lift`, the
 * soles `width` apart across the heading, none longer than `longest` of the leg, the pace going
 * toward the one asked at `accel`.
 *
 * Each human walked 12 s at 0.2, 0.3, 0.4, 0.5 and 0.7 m/s five ways (forward, right, back, left,
 * forward right), at 1 and 3 cm under its reference height: 100 walks. Held is those that did not
 * fall (the centre 25 cm under the goal's height); on pace is those whose centre went, over the
 * last 2 s, 0.8 to 1.25 of the speed asked along the walk and under a quarter of it across; the
 * ratio is the mean along over the speed asked, of those held (Node stand, 120 Hz, taken with
 * `STANCE_SECONDS.across` at 0.5; at the final 0.3 the chosen row reads 93, 64 and 0.84, and 13 of
 * 20 at 0.7 m/s):
 *
 *     seconds  lift   width  longest  accel   held  on pace  ratio   held at 0.7 m/s (of 20)
 *     0.25     0.05   0.2    0.8      1       91    26       0.78    11
 *     0.3      0.05   0.2    0.8      1       95    54       0.82    15     chosen
 *     0.35     0.05   0.2    0.8      1       89    50       0.83     9
 *     0.4      0.05   0.2    0.8      1       84    65       0.88     7
 *     0.3      0.04   0.2    0.8      1       93    57       0.82
 *     0.3      0.07   0.2    0.8      1       92    38       0.81
 *     0.3      0.05   0.15   0.8      1       94    50       0.82
 *     0.3      0.05   0.25   0.8      1       96    58       0.82
 *     0.3      0.05   0.2    0.7      1       90    52
 *     0.3      0.05   0.2    0.9      1       96    55
 *     0.3      0.05   0.2    0.8      0.5     96    55
 *     0.3      0.05   0.2    0.8      2       94    56
 *
 * At the chosen settings every walk up to 0.5 m/s holds. The rest lie within two walks of it and
 * none is better on both counts; a walk goes at about 0.8 of the speed asked. A reversal of the
 * walk takes 1.07 s on average to reach 0.9 of the new pace, and 51 of 60 walks stopped settle
 * (`STANCE_FOOT_CONDITIONING` has why the rest sway). Above 0.5 m/s the stance falls; the limits found are the ankle's (below) and a trailing foot's toe that scuffs
 * the ground with its ankle at its stop. A human's preferred walk is near 1.4 m/s.
 *
 * Two findings shaped the walk (`walkStep`). A step fixed to fall about its bearing sole's middle
 * multiplies a landing's miss by exp(w T), about 3.7, at each step: the steps widened until the
 * feet could not reach; each step now chooses its pivot within the sole. And a foot carried at the
 * turn it left the ground with drifted in yaw, step by step, to 50 degrees off; it lands facing the
 * heading. A foot that rolls onto its toe's edge before it lifts, and joints held back from their
 * stops, were built and measured: they held fewer walks at 3 cm low (33 of 50 against 46) and 30
 * fewer shoves, and were taken out.
 */
export const STANCE_GAIT: GaitTuning = { seconds: 0.3, lift: 0.05, width: 0.2, longest: 0.8, accel: 1 };

/**
 * **Solver conditioning, not anatomy**: the factor a stance foot's rotational inertia is multiplied
 * by while it stands, restored when the foot leaves the stance.
 *
 * The ankle's motor joins a foot of some 0.005 kg m2 (`humanSpec`) to a body that turns about the
 * ankle with some fifty; Havok's iterations hand the motor's impulse to the foot and the ground
 * back and forth and pass little of it to the body, and settle each step on the same answer, so the
 * stance stops short of its goal and does not creep on. A foot flat on the ground does not turn,
 * so its inertia takes no part in the motion; raised, the solver carries the impulse through.
 * The centre of mass's stop in front of (+) or behind the middle of the soles, cm, after 5 s
 * standing 3 cm under the reference height, by the factor (Node stand, 120 Hz):
 *
 *     factor      1       3       10      30      100     300
 *     Rogue    -4.23   -3.06   -0.52   -0.00   +0.01   +0.01
 *     Warrior  falls   falls   -3.76   -0.66   -0.15   -0.04
 *
 * At 480 Hz and no factor the Warrior falls too, and the Rogue stops 2.70 cm behind: a finer step
 * does not cure it. 100 is the least factor of the table that holds both within 3 mm.
 *
 * **It has a cost: a foot rocked onto its edge does turn**, and conditioned it turns as a flywheel.
 * Walks stopped (`STANCE_SECONDS`' 60) that were still moving faster than 1 cm/s at the end, their
 * bodies swaying from foot to foot, and `STANCE_VELOCITY_GAIN`'s 48 steps failed, by the factor
 * (Node stand, 120 Hz):
 *
 *     factor          20     30     40     50     70     100
 *     still moving    2      4      7      7      19     19     of 60
 *     steps failed    6      4      2      1      1      1      of 48
 *
 * (The walks below 100 were taken with a step that closed a stopped stance, since removed; at 50 it
 * moved the count by 2.) At 50 a place asked at the edge of what the soles hold (`SUPPORT_INSET`'s
 * table) sets recovery steps off: one of the eight falls and two step 34-35 cm; at 100 none falls. Raising only the foot's pitch and yaw
 * by 100 and its roll by 30 left 6 moving but failed 4 steps; its roll unraised, walks fell. Havok
 * exposes no solver iterations to raise instead. The factor stays at 100 and the sway is a known
 * defect: the owner's choice (the plan, stage 4).
 */
export const STANCE_FOOT_CONDITIONING = 100;

/**
 * The damping of the leg's Jacobian undone, as a least-squares solve (`legSpeeds`): a numeric
 * setting, not anatomy. A straight knee is a singular leg -- no speed of its freedoms lengthens it
 * -- and without damping a pelvis asked to rise over a straight knee is asked for unbounded speeds.
 */
export const LEG_DAMPING = 0.02;

/**
 * **A control setting, from a sweep**: the fraction by which the outline of the stance soles'
 * corners (their convex hull, across the ground) is drawn toward its middle to give the region the
 * stance holds its centre of mass in. Not every centre of mass over the soles is one the body can
 * hold on both feet: sideways, both feet flat, the ankles turn as far as the hips, and the ankle's
 * everters and invertors -- some 20 to 27 N m (`humanSpec`) -- are what stop the body; and a centre
 * of mass over one foot leaves the other bearing little, and a leg asked to carry the pelvis slides
 * a foot that bears nothing. The centre of mass's stop from the held place, cm, and the feet's
 * furthest travel, mm, 6 s after it was asked for a place 30 cm away across the ground each way
 * (+x, -x, +z, -z; held at the edge of the drawn outline), 3 cm under the reference height, by the
 * inset (Node stand, 120 Hz):
 *
 *     inset   Rogue                            Warrior
 *     0.2     2.5/101 falls   1.0/3   0.5/1    5.3/218 falls   1.1/3   0.9/2
 *     0.3     0.3/12  0.4/17  0.9/2   0.4/1    0.2/15  0.2/8   0.9/3   0.7/2
 *     0.4     0.2/2   0.1/8   0.8/2   0.3/1    0.1/2   0.1/4   0.7/3   0.6/2
 *     0.5     0.2/2   0.1/7   0.6/2   0.1/1    0.0/2   0.1/2   0.5/3   0.5/2
 *
 * The 7 mm at -x is the far foot, left a sixth of the weight, slipping once.
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
  /** The sole's width across the foot, m. */
  readonly width: number;
  /** The foot's own mass properties, and whether they are conditioned now. */
  readonly natural: PhysicsMassProperties;
  conditioned: boolean;
}

export function stanceControl(built: BuiltBody, tuning: StanceTuning = {}): StanceControl {
  const seconds = tuning.seconds ?? STANCE_SECONDS;
  const conditioning = tuning.footConditioning ?? STANCE_FOOT_CONDITIONING;
  const inset = tuning.supportInset ?? SUPPORT_INSET;
  const gain = tuning.velocityGain ?? STANCE_VELOCITY_GAIN;
  const bend = tuning.kneeBend === undefined ? STANCE_KNEE_BEND : tuning.kneeBend;
  const spare = tuning.ankleSpare === undefined ? STANCE_ANKLE_SPARE : tuning.ankleSpare;
  const recovery = tuning.recovery === undefined ? STANCE_RECOVERY : tuning.recovery;
  const gait = tuning.gait ?? STANCE_GAIT;
  const pelvis = chainTo(built, built.segments.get("foot.left")!)[0]!.parent;
  const segments = [...built.segments.values()];
  const total = segments.reduce((sum, s) => sum + s.spec.mass.value, 0);
  const feet = (["left", "right"] as const).map((side): FootState => {
    const segment = built.segments.get(`foot.${side}`);
    if (!segment) throw new Error(`${built.spec.model} has no ${side} foot`);
    const sole = soleOf(segment), chain = chainTo(built, segment);
    return { side, segment, chain, sole, channels: [], corners: sole.map(() => new Vector3()), lengths: lengthsOf(chain),
      width: Math.max(...sole.map((q) => q.x)) - Math.min(...sole.map((q) => q.x)),
      middle: new Vector3(), natural: segment.body.getMassProperties(), conditioned: false };
  });
  const reading = { centre: new Vector3(), velocity: new Vector3(), support: new Vector3(), place: new Vector3(), asked: new Vector3(),
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
  const path = new Vector3(), along = new Vector3(), sole = new Vector3(), carried = new Vector3();
  const scene = pelvis.node.getScene();
  let owned = new Uint8Array(0);
  let last: readonly Foot[] | null = null;
  /** The centre of mass's planned place (x, height over the soles, z) and velocity, since the stance began. */
  const plan = { on: false, at: new Vector3(), velocity: new Vector3() };
  const v = new Vector3(), spin = new Vector3(), target = new Quaternion(), error = new Quaternion(), inverse = new Quaternion();
  const pelvisVelocity = new Vector3(), pelvisSpin = new Vector3(), turn = new Vector3();
  const p = new Vector3();
  const hipAt = new Vector3(), ankleAt = new Vector3(), kneeAt = new Vector3(), shank = new Quaternion(), footTurn = new Quaternion();
  const level = new Quaternion();
  const gravity = (): number => -(scene.getPhysicsEngine()?.gravity.y ?? 0);

  /** Ask `foot`'s leg's muscles for `speeds`, in its chain's order, at full activation. */
  const drive = (foot: FootState, speeds: readonly number[]): void => {
    foot.channels.forEach((i, k) => {
      driver!.velocity[i] = speeds[k]!;
      driver!.activation[i] = 1;
      owned[i] = 1;
    });
  };
  let driver: MuscleDriver | null = null;

  /** Each sole read, and the middle of `stance`'s into the reading. */
  const supportOf = (stance: readonly FootState[]): void => {
    for (const foot of feet) soleMiddleToRef(foot, foot.middle);
    reading.support.setAll(0);
    for (const foot of stance) reading.support.addInPlace(foot.middle);
    if (stance.length) reading.support.scaleInPlace(1 / stance.length);
  };

  return {
    get owned() { return owned; },
    reading,
    read(which) {
      // The centre of mass and its velocity (Havok's linear velocity is the centre of mass's, H49).
      const c = reading.centre.setAll(0), vel = reading.velocity.setAll(0);
      for (const segment of segments) {
        const m = segment.spec.mass.value;
        c.addInPlace(centreOfToRef(segment, p).scaleInPlace(m));
        segment.body.getLinearVelocityToRef(v);
        vel.addInPlace(v.scaleInPlace(m));
      }
      c.scaleInPlace(1 / total);
      vel.scaleInPlace(1 / total);
      const on = which ?? last;
      supportOf(on ? feet.filter((foot) => on.includes(foot.side)) : feet);
    },
    command(muscles, goal, dt) {
      driver = muscles;
      if (owned.length !== muscles.channels.length) {
        owned = new Uint8Array(muscles.channels.length);
        for (const foot of feet) foot.channels = foot.chain.flatMap((joint) => joint.dofs.map((dof) => muscles.channel(`${joint.spec.name} ${dof.spec.positive}`)));
      }
      owned.fill(0);
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
      for (const foot of feet) {
        const standing = bearing.includes(foot.side);
        if (standing === foot.conditioned) continue;
        const { inertia } = foot.natural;
        foot.segment.body.setMassProperties({ ...foot.natural, inertia: standing ? inertia!.scale(conditioning) : inertia!.clone() });
        foot.conditioned = standing;
      }
      if (!goal || !last || bearing.length !== last.length || bearing.some((side) => !last!.includes(side))) {
        plan.on = false;
      }
      last = goal ? bearing : null;
      reading.asked.setAll(0);
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
      u.addInPlaceFromFloats(ax * dt, (k * k * (high - r.y) - 2 * k * u.y) * dt, az * dt);
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
      // Asked of the pelvis: the plan's velocity, the centre of mass's error from the plan over the
      // across constant, and across the ground its velocity's error from the plan's by the gain.
      const asked = reading.asked.set(u.x + (r.x - c.x) / seconds.across + gain * (u.x - vel.x), u.y + (r.y - height) / seconds.across,
        u.z + (r.z - c.z) / seconds.across + gain * (u.z - vel.z));

      // The pelvis's asked turn: toward upright at the heading, the error over the time constant.
      Quaternion.RotationAxisToRef(Vector3.UpReadOnly, goal.heading, target);
      target.multiplyInPlace(pelvis.rest);
      Quaternion.InverseToRef(pelvis.node.rotationQuaternion!, inverse);
      target.multiplyToRef(inverse, error);
      if (error.w < 0) error.scaleInPlace(-1);
      const half = Math.hypot(error.x, error.y, error.z), angle = 2 * Math.atan2(half, error.w);
      spin.set(error.x, error.y, error.z).scaleInPlace(half > 1e-12 ? angle / half / seconds.turn : 0);

      // Each stance leg's speeds for the motion asked of the pelvis, its foot still.
      centreOfToRef(pelvis, p);
      for (const foot of stance) drive(foot, legSpeeds(foot.chain, p, asked, spin));

      // The swing: the foot's sole carried along its path, its turn carried from the one it left the
      // ground with to the one it lands with, and its leg's speeds for that motion taken relative to
      // the pelvis's own.
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
        along.addInPlace(path.subtractToRef(sole, v).scaleInPlace(1 / seconds.swing));
        step.turn.multiplyToRef(Quaternion.InverseToRef(foot.segment.node.rotationQuaternion!, inverse), error);
        if (error.w < 0) error.scaleInPlace(-1);
        const half = Math.hypot(error.x, error.y, error.z), angle = 2 * Math.atan2(half, error.w);
        turn.set(error.x, error.y, error.z).scaleInPlace(half > 1e-12 ? angle / half / seconds.swing : 0);
        // Relative to the pelvis, and as the pelvis's motion from the foot: the negative.
        pelvis.body.getLinearVelocityToRef(pelvisVelocity);
        pelvis.body.getAngularVelocityToRef(pelvisSpin);
        Vector3.CrossToRef(pelvisSpin, sole.subtractToRef(p, v), carried).addInPlace(pelvisVelocity);
        along.subtractInPlace(carried).scaleInPlace(-1);
        turn.subtractInPlace(pelvisSpin).scaleInPlace(-1);
        drive(foot, legSpeeds(foot.chain, sole, along, turn));
        if (tau >= 1) {
          reading.phase = "stand";
          reading.own = null;
        }
      }
    },
  };
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

const centreOfToRef = (segment: BuiltSegment, out: Vector3): Vector3 => pointOfToRef(segment, segment.spec.centreOfMass.value, out);

/**
 * The speeds of `chain`'s freedoms (pelvis to foot, each in its own sense, as a motor drives them)
 * that move the pelvis at `velocity` (at its point `at`, world) turning at `spin`, with the foot
 * still. Each freedom's speed turns everything beyond it about its motion axis (`motionAxesToRef`)
 * through its joint's centre, so the foot moves against the pelvis by the sum of those turns; the
 * foot is still when that sum is the pelvis's motion reversed. The six equations are solved by
 * damped least squares (`LEG_DAMPING`).
 */
export function legSpeeds(chain: readonly BuiltJoint[], at: Vector3, velocity: Vector3, spin: Vector3): number[] {
  const columns: number[][] = [];
  const turn = new Quaternion(), axis = new Vector3(), pivot = new Vector3(), lever = new Vector3(), sweep = new Vector3();
  for (const joint of chain) {
    turnOfToRef(joint.parent, turn);
    pointOfToRef(joint.parent, joint.spec.centre.value, pivot);
    for (const m of motionAxesToRef(joint, jointAngles(joint, []), [])) {
      axis.set(m[0], m[1], m[2]).applyRotationQuaternionToRef(turn, axis);
      Vector3.CrossToRef(axis, at.subtractToRef(pivot, lever), sweep);
      columns.push([axis.x, axis.y, axis.z, sweep.x, sweep.y, sweep.z]);
    }
  }
  const b = [-spin.x, -spin.y, -spin.z, -velocity.x, -velocity.y, -velocity.z];
  // (J' J + d^2 I) s = J' b.
  const d2 = LEG_DAMPING * LEG_DAMPING;
  const A = columns.map((ci, i) => columns.map((cj, j) => ci.reduce((sum, v, r) => sum + v * cj[r]!, i === j ? d2 : 0)));
  const y = columns.map((ci) => ci.reduce((sum, v, r) => sum + v * b[r]!, 0));
  return solveSymmetric(A, y);
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
