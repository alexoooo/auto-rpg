import type { Observer } from "@babylonjs/core/Misc/observable.js";
import { PhysicsConstraintMotorType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";
import type { Scene } from "@babylonjs/core/scene.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { BuiltBody, BuiltDof, BuiltJoint, BuiltSegment } from "../build/build-body.ts";
import type { MuscleSpec } from "../spec/body.ts";
import { jointTracker, type JointTracker } from "../build/joint-state.ts";
import { PHYSICS_HZ } from "../engine/havok.ts";
import { forceVelocityFactor, forceVelocityReach, type ForceVelocityCurve } from "./force-velocity.ts";

/**
 * **The muscle actuator**: each freedom's muscles as a Havok velocity motor whose ceiling is what
 * the muscles can do at the speed the joint is turning.
 *
 * A controller commands, for each freedom, an activation (0-1) and a speed it would like the joint
 * to turn at. Before every solver sub-step the driver reads each joint (`jointTracker`: angles
 * from the nodes, speeds from the bodies' angular velocities, each read once), and sets each
 * motor's target to the commanded speed and its ceiling to
 *
 *     activation x peak isometric torque (the direction the motor pushes) x force-velocity(speed)
 *
 * The motor pushes toward its target, so the direction it pushes is the sign of target minus
 * speed, and the muscle shortens when the joint turns that way: the force-velocity relation reads
 * the speed in the direction pushed (`forceVelocityFactor`). A speed the joint cannot reach makes
 * the motor a torque source at its ceiling; a speed of zero is a hold; a speed toward a pose is a
 * servo. When target and speed agree exactly the direction is unknown, and the weaker peak is
 * taken.
 *
 * **The curve is read at the speed the step begins with, and the motor's target is held to where
 * the curve's tangent there reaches zero** (`forceVelocityReach`). On a light limb the muscles' own
 * time constant, the inertia beyond the joint times the unloaded speed over the peak times
 * (1 + 1/curvature), is far shorter than a step: 0.4-0.7 ms for the Warrior's shoulder rotation,
 * ankle and wrist, against 8.3 ms at 120 Hz. A motor asked for the unloaded speed with the ceiling
 * read at rest carried such a limb across its whole curve in one step at its isometric torque:
 * on a forearm and hand driven flat out (Node stand), the hand read 4.71 m/s after 0.025 s at
 * 120 Hz against 3.64 at 1920 Hz, and 5.3 against 4.5 two steps after a hand started 0.06 s after
 * the forearm; a searched strike flicked the wrist from rest to 23 rad/s in one step. The shortening
 * branch is convex, so its tangent lies under it: held to the tangent's zero, a push gains in a
 * step no more speed than the curve allows (but for Havok's ring, below), and from rest reaches
 * w0 k / (1 + k). A joint the muscles are braking is held to the reach from rest: the lengthening
 * branch's own tangent reaches far past the unloaded speed, and with it the late hand's wrist,
 * stretched at 28 rad/s when its muscles came on, was sent to 34 rad/s the other way in one step at
 * 120 Hz. So held, the same hand read 3.69 against 3.64, and 4.7 against 4.5; peak speeds were
 * within 2 % either way (6.31 against 6.34, 6.88 against 7.01).
 * A heavy limb, which the ceiling saturates long before the tangent's zero, is unchanged.
 * Rejected:
 * - **A ceiling read implicitly at the step's end**, solved with the inertia beyond the joint: it
 *   ignores every other torque on the joint, and a muscle stretched by a steady load yielded four
 *   times too fast.
 * - **Havok's spring motor as a damper along the tangent** (SPRING_FORCE, no stiffness, which
 *   Babylon does not expose). Soft, its torque was damping x (2.5 x target - speed); stiff, it
 *   turned a rod alike at dampings of 50 and 500, closing on 9.2 rad/s when asked for 8. Its law
 *   is not one a muscle can be written in.
 * - **Reading the curve half a step on**, by the speed a joint gained in the last step that its
 *   ceiling held short of its target. It took a heavy rod from +5.8 % to +1.0 % of the fine
 *   curve at 0.05 s at 120 Hz, and moved the lab's straights at 120 Hz from within a few per cent of
 *   1920 Hz to 5 % under for the Warrior and 15 % over for the Rogue.
 * On the lab's straights (Node stand) the peak fist at 120 Hz, 480 Hz and 1920 Hz:
 *
 *     Warrior  6.58 6.26 6.26 | 6.46 6.56 6.56 | 6.45 6.12 6.44
 *     Rogue    5.02 5.06 5.06 | 5.07 5.11 5.02 | 4.94 4.93 4.93
 *
 * within 3 % of the finest rate throughout.
 *
 * A heavy limb still gains a few per cent early at 120 Hz: a rod driven flat out from rest read
 * 5.8 % over the curve at 0.05 s, 2.1 % at 0.15 s (`tests/core-muscle.test.mjs`).
 *
 * **The speed is the body's, not the nodes'.** After a motor's or a limit's impulse Havok moves
 * the nodes behind the body's velocity for several steps (`joint-state.ts`), and a driver reading
 * the nodes' rate pushed on joints already at speed: a rod whose muscle could carry it from 7 to
 * 24 rad/s in one step reached 17.6 rad/s against an unloaded speed of 12, even with its target held
 * to that speed. Havok's motor is exact when saturated (3 N m turned a 0.062 kg m2 rod 0.40 rad/s faster a
 * step), but with room to spare it rings about its target: asked for 6 rad/s from rest with
 * 2000 N m to spare, the rod's body turned at 5.97, 8.62, 6.26, 4.79, 5.76 rad/s on successive
 * steps. Its stiffness and damping settings do nothing to a velocity motor. Asked for small
 * changes, it adds about a third to each and returns it over the next steps (a rod asked for
 * 0.83 rad/s from rest turned at 1.08). So a controller asks for speeds near the one it reads:
 * a servo that asked for a joint's goal speed at once reversed a braked elbow in one step at
 * 120 Hz (`src/core/control/servo.ts` has the servo and the numbers).
 * The driver reads its step from the engine's sub-step, so a finer one is a setting, not a change.
 *
 * A freedom's ceiling bounds its own axis only: a ball joint turning about two axes at once can
 * exceed either peak in the diagonal, by up to the root of the sum of their squares. Each peak was
 * measured about one axis at a time.
 */

/** One freedom's muscles: which joint and freedom, and the curve each way. */
export interface MuscleChannel {
  /** `joint.name` and the freedom's positive motion, e.g. "elbow.right flexion". */
  readonly name: string;
  readonly joint: BuiltJoint;
  /** The freedom's index in its joint. */
  readonly index: number;
  readonly dof: BuiltDof;
  /** The muscles that turn the joint toward positive angles, and toward negative. */
  readonly positive: MuscleSide;
  readonly negative: MuscleSide;
}

export interface MuscleSide {
  /** Peak isometric torque, N m. */
  readonly peak: number;
  readonly curve: ForceVelocityCurve;
}

export interface MuscleDriver {
  readonly channels: readonly MuscleChannel[];
  /** The command, by channel: activation 0-1, and the speed asked for (rad/s, the freedom's sense). */
  readonly activation: Float64Array;
  readonly velocity: Float64Array;
  /** The channel's joint as last read: angle (rad) and speed (rad/s). */
  angle(channel: number): number;
  speed(channel: number): number;
  /** The ceiling last given to the channel's motor, N m. */
  readonly ceiling: Float64Array;
  /** The channel named `name`; throws if there is none. */
  channel(name: string): number;
  /** Stop driving: the motors are released and the observer removed. */
  dispose(): void;
}

/** Called before each sub-step, before the driver applies the command; `dt` is the sub-step, s. */
export type MuscleController = (driver: MuscleDriver, dt: number) => void;

/** Drive every freedom of `built` from its spec's muscles, each physics sub-step of `scene`. */
export function driveMuscles(built: BuiltBody, scene: Scene, control?: MuscleController): MuscleDriver {
  const trackers: JointTracker[] = [];
  const channels: MuscleChannel[] = [];
  const trackerOf: JointTracker[] = [];
  for (const joint of built.joints.values()) {
    const tracker = jointTracker(joint);
    trackers.push(tracker);
    joint.dofs.forEach((dof, index) => {
      const muscle = dof.spec.muscle;
      channels.push({
        name: `${joint.spec.name} ${dof.spec.positive}`, joint, index, dof,
        positive: { peak: muscle.peakPositive.value, curve: curveOf(muscle, "positive") },
        negative: { peak: muscle.peakNegative.value, curve: curveOf(muscle, "negative") },
      });
      trackerOf.push(tracker);
      joint.constraint.setAxisMotorType(dof.axis, PhysicsConstraintMotorType.VELOCITY);
      joint.constraint.setAxisMotorTarget(dof.axis, 0);
      joint.constraint.setAxisMotorMaxForce(dof.axis, 0);
    });
  }
  // Each segment's angular velocity, read once per sub-step: a velocity read allocates (H50).
  const spin = new Map([...built.segments.values()].map((segment) => [segment, new Vector3()]));
  const angularVelocity = (segment: BuiltSegment): Vector3 => spin.get(segment)!;
  const byName = new Map(channels.map((c, i) => [c.name, i]));
  const n = channels.length;
  const subStep = scene.getPhysicsEngine()?.getSubTimeStep() ?? 0;
  const dt = subStep > 0 ? subStep / 1000 : 1 / PHYSICS_HZ.value;
  let observer: Observer<Scene> | null = null;
  const driver: MuscleDriver = {
    channels,
    activation: new Float64Array(n),
    velocity: new Float64Array(n),
    ceiling: new Float64Array(n),
    angle: (i) => trackerOf[i]!.angles[channels[i]!.index]!,
    speed: (i) => trackerOf[i]!.speeds[channels[i]!.index]!,
    channel(name) {
      const i = byName.get(name);
      if (i === undefined) throw new Error(`${built.spec.model} has no muscle channel "${name}"`);
      return i;
    },
    dispose() {
      if (observer) scene.onBeforePhysicsObservable.remove(observer);
      observer = null;
      for (const c of channels) c.joint.constraint.setAxisMotorMaxForce(c.dof.axis, 0);
    },
  };
  observer = scene.onBeforePhysicsObservable.add(() => {
    for (const [segment, w] of spin) segment.body.getAngularVelocityToRef(w);
    for (const tracker of trackers) tracker.update(angularVelocity);
    control?.(driver, dt);
    for (let i = 0; i < n; i++) {
      const c = channels[i]!;
      const speed = driver.speed(i), target = driver.velocity[i]!;
      const activation = Math.max(0, Math.min(1, driver.activation[i]!));
      const push = target - speed;
      const side = push > 0 ? c.positive : push < 0 ? c.negative
        : c.positive.peak <= c.negative.peak ? c.positive : c.negative;
      const shortening = push >= 0 ? speed : -speed;
      // Within a step the muscles turn the joint no further than their curve's tangent reaches.
      const reach = forceVelocityReach(shortening, side.curve);
      const ceiling = activation * side.peak * forceVelocityFactor(shortening, side.curve);
      driver.ceiling[i] = ceiling;
      const sent = push > 0 ? Math.min(target, reach) : push < 0 ? Math.max(target, -reach) : target;
      c.joint.constraint.setAxisMotorTarget(c.dof.axis, c.dof.sign * sent);
      c.joint.constraint.setAxisMotorMaxForce(c.dof.axis, ceiling);
    }
  });
  return driver;
}

/** The curve for the muscles turning a freedom toward `side`, in SI, from its spec. */
function curveOf(muscle: MuscleSpec, side: "positive" | "negative"): ForceVelocityCurve {
  const spec = side === "positive" ? muscle.speedPositive : muscle.speedNegative;
  return {
    unloadedSpeed: spec.unloadedSpeed.value,
    curvature: spec.curvature.value,
    eccentricCeiling: spec.eccentricCeiling.value,
    eccentricSlopeRatio: spec.eccentricSlopeRatio.value,
  };
}
