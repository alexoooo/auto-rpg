import type { Observer } from "@babylonjs/core/Misc/observable.js";
import { PhysicsConstraintMotorType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";
import type { Scene } from "@babylonjs/core/scene.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { BuiltBody, BuiltDof, BuiltJoint, BuiltSegment } from "../build/build-body.ts";
import type { MuscleSpec } from "../spec/body.ts";
import { jointTracker, type JointTracker } from "../build/joint-state.ts";
import { PHYSICS_HZ } from "../engine/havok.ts";
import { forceVelocityFactor, type ForceVelocityCurve } from "./force-velocity.ts";

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
 * **The curve is read at the speed the step begins with.** On a light limb the muscles' own time
 * constant, the inertia over the curve's slope, can be shorter than a step, so a ceiling read at
 * the start of a step is too high for part of it. The motor's target is therefore held to the
 * pushing muscles' unloaded speed: a rod whose muscle could carry it from 7 to 24 rad/s in one step
 * peaked at 12.32 against an unloaded speed of 12 (17.6 without the hold). What is left is a fast
 * transient that reads high: a pinned Warrior's scripted straight, on his sourced curves, peaked at
 * 6.85 m/s at 120 Hz, 6.47 at 240, 6.45 at 480 and 6.40 at 960 (Node stand). A reading at the
 * step's end, solved with the inertia beyond the joint, ignores every other torque on the joint:
 * a muscle stretched by a steady load yielded four times too fast, so it is not used.
 *
 * **The speed is the body's, not the nodes'.** After a motor's or a limit's impulse Havok moves
 * the nodes behind the body's velocity for several steps (`joint-state.ts`), and a driver reading
 * the nodes' rate pushed on joints already at speed: the rod above reached 17.6 rad/s even with the
 * hold. Havok's motor is exact when saturated (3 N m turned a 0.062 kg m2 rod 0.40 rad/s faster a
 * step), but with room to spare it rings about its target: asked for 6 rad/s from rest with
 * 2000 N m to spare, the rod's body turned at 5.97, 8.62, 6.26, 4.79, 5.76 rad/s on successive
 * steps. Its stiffness and damping settings do nothing to a velocity motor. So a servo on the
 * angle (target = error / time constant) that brakes a fast joint overshoots: at 120 Hz a
 * Warrior's elbow opening at 34 rad/s, braked by its flexors at 105 N m, reversed to 22 rad/s in
 * one step, against a target of 17, and threw the fist to 12.2 m/s; at 480 Hz it stopped in three
 * steps, and the routine's three straights peaked at 6.4, 6.4 and 7.5 (Node stand) and 6.4, 6.4 and
 * 6.4 (the lab page). A servo is steady at a time
 * constant of 0.1 s and chatters at 0.05 s, at up to 3.9 rad/s on a pinned Warrior at 120 Hz. The
 * servo is the controller's, not this file's (stage 3 of the plan).
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
      const ceiling = activation * side.peak * forceVelocityFactor(shortening, side.curve);
      driver.ceiling[i] = ceiling;
      // The muscles cannot drive the joint past their unloaded speed.
      const w0 = side.curve.unloadedSpeed;
      const sent = push > 0 ? Math.min(target, w0) : push < 0 ? Math.max(target, -w0) : target;
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
