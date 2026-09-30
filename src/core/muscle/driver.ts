import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { BuiltBody, BuiltDof, BuiltJoint, BuiltSegment } from "../build/build-body.ts";
import type { MuscleSpec } from "../spec/body.ts";
import { jointTracker, type JointTracker } from "../build/joint-state.ts";
import { bodyDynamics, type BodyDynamics } from "../build/dynamics.ts";
import type { Hook, World } from "../world.ts";
import { forceVelocityFactor, forceVelocityReach, type ForceVelocityCurve } from "./force-velocity.ts";

/**
 * **The muscle actuator**: each freedom's muscles as a velocity motor on its joint's axis
 * (`CoreJoint.setMotor`) whose ceiling is what the muscles can do at the speed the joint is turning.
 *
 * A controller commands, for each freedom, an activation (0-1) and a speed it would like the joint
 * to turn at. Every world step the driver reads each joint (`jointTracker`: angles from the
 * nodes, speeds from the bodies' angular velocities, each read once), and sets each motor's target
 * to the commanded speed, held to the curve's reach (below), and its ceiling to
 *
 *     activation x peak isometric torque (the side that pulls) x force-velocity(speed)
 *
 * The muscle shortens when the joint turns the way it pulls: the force-velocity relation reads the
 * speed in that direction (`forceVelocityFactor`). A speed past the reach makes the motor push at
 * its ceiling until the joint gets there; a speed of zero is a hold; a speed toward a pose is a
 * servo. The driver reads its step from the world (`src/core/world.ts`).
 *
 * **Which muscles pull is chosen before the step**, and a motor's ceiling is one number for both
 * directions, so the choice bounds the motor whichever way it then pushes: the side pushed toward
 * (the sign of target minus speed), and with no push the weaker. **A known defect:** that gives the
 * braking muscles' work to the other side whenever a load outweighs the change asked, and a servo
 * asks for small changes, the smaller the finer the step. The right choice is the sign of the
 * torque the step needs, which takes the torque the motor last applied; Rapier keeps each motor's
 * impulse, but its JavaScript binding does not read it. `tests/core-muscle.test.mjs` holds the
 * choice as a todo.
 *
 * **The curve is read at the speed the step begins with, and the motor's target is held to where
 * the curve's tangent there reaches zero** (`forceVelocityReach`). A light limb's own time
 * constant, the inertia beyond the joint times the unloaded speed over the peak times
 * (1 + 1/curvature), is far shorter than a step, so a motor asked for the unloaded speed with its
 * ceiling read at rest would carry it across its whole curve in one step at its isometric torque.
 * The shortening branch is convex, so its tangent lies under it: held to the tangent's zero, a push
 * gains no more speed in a step than the curve allows, and from rest reaches w0 k / (1 + k). A
 * joint the muscles are braking is held to the reach from rest, since the lengthening branch's
 * tangent reaches far past the unloaded speed. A heavy limb saturates its ceiling long before the
 * tangent's zero. `tests/core-muscle.test.mjs` holds the rates to each other.
 *
 * Rejected:
 * - **A ceiling read implicitly at the step's end**, solved with the inertia beyond the joint: it
 *   ignores every other torque on the joint, and a muscle stretched by a steady load yields too fast.
 * - **Reading the curve half a step on**, from the speed the last step's ceiling held a joint short
 *   of its target: it makes whole-body strikes depend on the physics rate.
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
  /**
   * The channel's joint as last read: angle (rad), its rate (rad/s), and speed (rad/s): the
   * relative angular velocity along the axis its motor drives. Speed and rate are equal at a joint
   * of one freedom and at the reference pose; elsewhere `turning` relates them
   * (`src/core/build/joint-state.ts`).
   */
  angle(channel: number): number;
  rate(channel: number): number;
  speed(channel: number): number;
  /**
   * The channel's speed per rad/s of the rate of freedom `k` of its joint, at its angles as last
   * read (`turningToRef`). A joint's channels are consecutive, in its freedoms' order: freedom k
   * of channel i's joint is channel `i - channels[i].index + k`.
   */
  turning(channel: number, k: number): number;
  /**
   * The body's mass matrix and gravity in the channels' speeds, as last read (`bodyDynamics`): a
   * channel's index is its freedom's.
   */
  readonly dynamics: BodyDynamics;
  /** The torque the channel's muscles toward `sense` (+1 or -1) can give at full activation at its speed, N m. */
  strength(channel: number, sense: 1 | -1): number;
  /** The ceiling last given to the channel's motor, N m. */
  readonly ceiling: Float64Array;
  /** The channel named `name`; throws if there is none. */
  channel(name: string): number;
  /** Stop driving: the motors are released and its step hook removed. */
  dispose(): void;
}

/** Called every world step, before the driver applies the command; `dt` is the step, s. */
export type MuscleController = (driver: MuscleDriver, dt: number) => void;

/** Drive every freedom of `built` from its spec's muscles, before each step of `world`. */
export function driveMuscles(built: BuiltBody, world: World, control?: MuscleController): MuscleDriver {
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
      joint.joint.setMotor(index, 0, 0);
    });
  }
  // Each segment's angular velocity, read once per step: a velocity read allocates.
  const spin = new Map([...built.segments.values()].map((segment) => [segment, new Vector3()]));
  const angularVelocity = (segment: BuiltSegment): Vector3 => spin.get(segment)!;
  const byName = new Map(channels.map((c, i) => [c.name, i]));
  const n = channels.length;
  const dt = world.dt;
  const dynamics = bodyDynamics(built, world.physics.gravity);
  const angles = trackers.map((tracker) => tracker.angles);
  const motion = { spin: angularVelocity };
  let hook: Hook | null = null;
  const driver: MuscleDriver = {
    channels,
    activation: new Float64Array(n),
    velocity: new Float64Array(n),
    ceiling: new Float64Array(n),
    angle: (i) => trackerOf[i]!.angles[channels[i]!.index]!,
    rate: (i) => trackerOf[i]!.rates[channels[i]!.index]!,
    speed: (i) => trackerOf[i]!.speeds[channels[i]!.index]!,
    turning: (i, k) => trackerOf[i]!.turning[channels[i]!.index]![k]!,
    dynamics,
    strength(i, sense) {
      const c = channels[i]!, side = sense > 0 ? c.positive : c.negative;
      return side.peak * forceVelocityFactor(sense * driver.speed(i), side.curve);
    },
    channel(name) {
      const i = byName.get(name);
      if (i === undefined) throw new Error(`${built.spec.model} has no muscle channel "${name}"`);
      return i;
    },
    dispose() {
      hook?.dispose();
      hook = null;
      for (const c of channels) c.joint.joint.setMotor(c.index, 0, 0);
    },
  };
  hook = world.beforeStep(() => {
    for (const [segment, w] of spin) segment.body.angularVelocityToRef(w);
    for (const tracker of trackers) tracker.update(angularVelocity);
    dynamics.update(angles, motion);
    control?.(driver, dt);
    for (let i = 0; i < n; i++) {
      const c = channels[i]!;
      const speed = driver.speed(i), target = driver.velocity[i]!;
      const activation = Math.max(0, Math.min(1, driver.activation[i]!));
      const push = target - speed;
      const toward = push > 0 ? 1 : push < 0 ? -1 : c.positive.peak <= c.negative.peak ? 1 : -1;
      // Within a step the muscles turn the joint no further than their curve's tangent reaches.
      const reach = forceVelocityReach(toward * speed, (toward > 0 ? c.positive : c.negative).curve);
      const beyond = toward * target > reach;
      // The muscles that pull: the side pushed toward (the module's note has the defect).
      const ceiling = activation * driver.strength(i, toward);
      driver.ceiling[i] = ceiling;
      c.joint.joint.setMotor(c.index, c.dof.sign * (beyond ? toward * reach : target), ceiling);
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
