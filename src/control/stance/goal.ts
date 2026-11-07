import type { BearingEnd } from "../../core/bodies/spec/body.ts";
import type { Vec3 } from "../../core/quantity.ts";
import type { GaitTuning } from "./stance-tuning.ts";
import { Vector3 } from "../../core/math/vector.ts";

/**
 * **What a stance is asked for**: which feet bear the body, where its centre of mass goes, and which
 * way its pelvis faces. A foot is named by its end (`BearingEnd`, `FootState.name`): a human's `foot.left`.
 */
export interface StanceGoal {
  /** The ends bearing weight, of the stance's feet; the other leg is left to the posture. */
  readonly feet: readonly BearingEnd[];
  /** The centre of mass's place over the ground, world (x, z), m; null for the middle of the stance feet. */
  readonly centre: readonly [number, number] | null;
  /** The centre of mass's height over the stance feet's soles, m. */
  readonly height: number;
  /** The pelvis's heading, rad about the world's up: 0 faces it as in the reference pose. */
  readonly heading: number;
  /**
   * A supported root pitch, rad, and response time, s: the bearing feet stay planted, no step is
   * taken, and a walk or swing with it is refused. The body still reports a fall from it: a posed
   * body is asked no lower than its fall bar under its standing height (`uprightness`, `down`).
   */
  readonly pose?: { readonly pitch: number; readonly seconds: number;
    /** Captured bearing soles, world position and rotation since reference; errors are corrected through muscles. */
    readonly anchors?: Readonly<Partial<Record<BearingEnd, { readonly position: Vec3; readonly rotation: readonly [number, number, number, number] }>>> };
  /** A foot not in `feet` carried to a landing place; none, and the other leg is left to the posture. */
  readonly swing?: SwingGoal | null;
  /**
   * A walk: the centre of mass's velocity across the ground, world (x, z), m/s. With both feet in
   * `feet` and no `swing`, the stance steps of itself, each foot in turn (`STANCE_GAIT`); walking
   * nowhere, it steps only to catch a push (`STANCE_RECOVERY`).
   */
  readonly walk?: readonly [number, number] | null;
  /**
   * The step pattern of the stance's own steps, a walk's and those that catch the body: the gait's
   * that asks the goal; the stance's own (`StanceTuning.gait`, `STANCE_GAIT`) where it names none.
   */
  readonly gait?: GaitTuning;
  /**
   * Stop at once: the walk's pace is nought from this step, not slowed at the gait's acceleration,
   * and a step of the stance's own walk not yet lifted is not taken; it steps only to catch the
   * body (`ownStep`).
   */
  readonly halt?: boolean;
}

/**
 * **A step's swing**: the foot lifted and carried to where its sole's middle lands, over the ground,
 * on a minimum-jerk path lifted by `lift` at its middle, its turn carried from the one it left the
 * ground with to flat and facing the heading as it lands. A goal equal to the last keeps its path;
 * a new one starts from where the foot is.
 */
export interface SwingGoal {
  readonly foot: BearingEnd;
  /** The sole's middle's landing place, world (x, z), m. */
  readonly to: readonly [number, number];
  /** The swing's time, s. */
  readonly seconds: number;
  /** How high the sole's middle is lifted at the swing's middle, m. */
  readonly lift: number;
  /**
   * Whether the weight is first shifted onto the other foot (the default): the foot leaves the
   * ground once the body's capture point is over the other sole. A step to catch a fall lifts at
   * once.
   */
  readonly shift?: boolean;
  /** Horizontal plan speed limit during the weight shift, m/s. */
  readonly shiftSpeed?: number;
  /**
   * Where the capture point is brought by the time the foot lands, world (x, z), m: the pivot the
   * body falls about in the bearing sole is chosen for it. None, and the middle of the stance the
   * step lands in. `hold` retains the capture point at lift-off for a stationary placement.
   */
  readonly capture?: readonly [number, number] | "hold";
  /**
   * A walk's double support before the lift, s (`transferStep`): both soles bear, and the foot lifts
   * when it is over, not on the capture point; the plan brings its capture point to `handover` by then.
   */
  readonly transfer?: number;
  readonly handover?: readonly [number, number];
  /**
   * The constant the swing's foot takes up its errors from its path at, s, critically damped; none,
   * the stance's (`StanceTuning.seconds.swing`). A shorter one lands a fast step nearer its place.
   */
  readonly settle?: number;
  /**
   * How the leg leans from the vertical as the foot lands, rad, ahead and out along the landing's
   * facing (`landingLean`): the foot lands as flat as its ankle's range lets it from there
   * (`landingTurnToRef`). None, flat.
   */
  readonly lean?: readonly [number, number];
  /**
   * Whether the swing ends as soon as its sole meets the ground from `LANDS_FROM` of its time, as a
   * catch's does; none, it ends on its time once its sole has met the ground from then, so a walk's
   * steps keep their time: a sole that met it rests there at its time, most often with no weight on
   * it yet, which the ground does not push. Either way a foot that has not met the ground by its
   * time goes on down past its place's height (`LATE_DESCENT`) until it meets it, or for
   * `LATE_MOST` of its time again.
   */
  readonly early?: boolean;
  /**
   * The swing's way across the ground as a ramped acceleration, the share of each half of the
   * swing's time its acceleration takes to rise or fall (0 to 1/4, `swingProgressToRef`); its peak
   * is below minimum jerk's where it is under 0.15. None, minimum jerk.
   */
  readonly ramp?: number;
  /**
   * The push-off: the plantarflexion, rad, the trailing foot's ankle, rolled onto its toes, is
   * driven toward through a walk's double support, with its knee's pre-swing
   * (`GaitTuning.preswing`) and at its time, so the leg launches the body and itself into the
   * step. None, the ankle is left to the task.
   */
  readonly push?: number;
  /**
   * The push-off as a torque: the ankle of the foot that lifts next plantarflexes at least at
   * `share` of what it can give that way (`MuscleReading.strength`), from `lead` s before the step
   * before it lands, through the double support (`transfer`), to its lift; the rest of the body is
   * solved as if it did not. None, the ankle is the solve's.
   */
  readonly launch?: { readonly share: number; readonly lead: number };
  /**
   * Whether the swing's path starts at the sole's velocity as the foot lifts, coming to rest at
   * its landing as the path does (a quintic's term for a start's velocity), rather than at rest:
   * the swing goes on with what the push-off gave the leg. None, from rest.
   */
  readonly momentum?: boolean;
  /**
   * The lever, m, a missed moment of the ground's wrench is weighed against a missed force at
   * through the swing (`shareGroundWrench`): a shorter one has the bearing sole give the centre of
   * mass its plan before the pelvis its turn. None, the stance's (`leverOf`).
   */
  readonly lever?: number;
}

export interface StanceReading {
  /** The centre of mass and its velocity, world. */
  readonly centre: Vector3;
  readonly velocity: Vector3;
  /** The body's angular momentum about its centre of mass, world, kg m^2/s (`angularMomentumToRef`): what a recovery reads its capture point with (`carriedVelocity`). */
  readonly momentum: Vector3;
  /** The middle of the stance feet's soles, world; with no stance, of both feet. */
  readonly support: Vector3;
  /** The way the pelvis faces, rad about up, as a heading is counted: 0 as in the reference pose, growing to the right. */
  readonly facing: number;
  /** Each of the stance's feet, by its end's name (`BearingEnd`). */
  readonly ends: Readonly<Record<BearingEnd, StanceEnd>>;
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
  /**
   * The pace the stance walks at, world (x, z), m/s: toward the goal's walk at the gait's
   * acceleration, and no faster than its legs can step that way (`paceToward`). Short of the
   * walk asked, the legs cap it.
   */
  readonly pace: readonly [number, number];
  /**
   * What the last command asked of the ground and the bearing soles could not give
   * (`shareGroundWrench`): a force, and a moment about the root's centre of mass, world, N and N m.
   * None with no stance, or no sole bearing. The root was asked for the motion that the wrench
   * the soles can give makes, with whatever of this the assist supplies (`Assist`).
   */
  readonly shortfall: { readonly force: Vector3; readonly moment: Vector3 };
}

/** **A stance's foot as its reading finds it** (`StanceReading.ends`). */
export interface StanceEnd {
  /** Its sole's middle, world. */
  readonly middle: Vector3;
  /**
   * Whether the ground bore it in the last step: a contact with a fixed collider that pushed, its
   * normal within `LANDED_NORMAL` of up, as a swing that lands on contact reads it.
   */
  readonly touching: boolean;
  /**
   * The ground's wrench the last command's leg torques count on at its sole (`shareGroundWrench`):
   * a force at the place the sole bears (`at`: its middle, or its front edge's when rolled) and a
   * moment about it, world, m, N and N m; zero where the foot does not bear.
   */
  readonly asked: { readonly at: Vector3; readonly force: Vector3; readonly moment: Vector3 };
}

/**
 * Where a stance is: standing (no step, or its foot landed), shifting its weight before a step, or
 * swinging the step's foot.
 */
export type StancePhase = "stand" | "shift" | "swing";
