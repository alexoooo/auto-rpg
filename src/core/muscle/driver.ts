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
 * to turn at. Before every solver sub-step the driver reads each joint (`jointTracker`: angles
 * from the nodes, speeds from the bodies' angular velocities, each read once), and sets each
 * motor's target to the commanded speed and its ceiling to
 *
 *     activation x peak isometric torque (the side that pulls) x force-velocity(speed)
 *
 * The muscle shortens when the joint turns the way it pulls: the force-velocity relation reads the
 * speed in that direction (`forceVelocityFactor`). A speed the joint cannot reach makes the motor a
 * torque source at its ceiling; a speed of zero is a hold; a speed toward a pose is a servo.
 *
 * **Which muscles pull is chosen before the step**, and a motor's ceiling is one number for both
 * directions, so the choice bounds the motor whichever way it then pushes: the side pushed toward
 * (the sign of target minus speed), and with no push the weaker. **A known defect:** that gives the
 * braking muscles' work to the other side whenever a load outweighs the change asked, and a servo
 * asks for small changes, the smaller the finer the step. On Havok the driver chose instead by the
 * sign of the torque the step needs, taking the torque the motor last applied to have held the
 * joint's speed, plus the inertia beyond the joint times the change asked; on the Rogue's return
 * under the velocity servo of the time (Node stand, 1920 Hz, steps at a stop left out) that took
 * the steps pulling past the pulling side's ceiling from 1127 (8.2 N m s) to 73 (1.0 N m s). Rapier
 * keeps each motor's impulse (`ImpulseJoint.impulses`, and each motor's) but its JavaScript binding
 * does not read them, so the torque last applied is not known here (the plan's Rapier stage).
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
 *
 * On the lab's three straights (Node stand, the computed-torque servo with the motion under way,
 * the fist read at the knuckles, the joints read as Havok's limits measure them, H76) the peak fist
 * at 120 Hz, 480 Hz and 1920 Hz, each before the striking elbow came within 0.01 rad of its stop:
 *
 *     Warrior  5.56 5.66 5.64 | 5.55 5.64 5.64 | 5.60 5.69 5.68
 *     Rogue    4.64 4.71 4.71 | 4.57 4.65 4.65 | 4.58 4.67 4.67
 *
 * Every rate is within 1.5 % of the finest. In the Euler reading before H76, without the motion
 * under way, the servo let a fast
 * forearm throw the hand about the wrist: at the knuckles the Warrior's read 5.02-5.15, 4.92-5.05
 * and 5.21-5.27, the hand trailing, and read at the fingertips, as they were until 2026-09-29, the
 * Rogue's read 5.55-5.64, 6.00-6.63 and 6.36-6.78, the elbow's stop whipping her hand at up to 66
 * rad/s at 1920 Hz. One blow is a poor reading of a rate: random strikes read 1.9 % apart when
 * every activation was scaled by 0.9999 (the plan, stage 2).
 *
 * A heavy limb still gains a few per cent early at 120 Hz: a rod driven flat out from rest read
 * 5.8 % over the curve at 0.05 s, 2.1 % at 0.15 s (`tests/core-muscle.test.mjs`).
 *
 * **On Havok** (until 2026-09-29), with the numbers of that engine:
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
 * 0.83 rad/s from rest turned at 1.08). The ring comes with Babylon's plugin telling Havok to
 * expect the step it hands it (`HP_World_SetIdealStepTime`): told to expect 1/240 s or less while
 * stepping 1/120 s, the rod asked for 6 rad/s turned at 5.87, 6.29, 6.01 rad/s against 8.06, 5.87,
 * 5.63, 6.28, and at 1920 Hz the ring is the same, 8.07. Holding the two apart changes more than
 * the ring and is not done here (the plan, stage 2). The ring and the lag behind it are counted in
 * steps, so a controller that asks for speeds runs behind at 120 Hz; the servo asks for torques
 * (`src/core/control/servo.ts` has the servo and the numbers).
 * The driver reads its step from the world (`src/core/world.ts`), so a finer one is a setting, not a change.
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
   * relative angular velocity along the axis its motor drives, which is the rate only at a
   * joint's first freedom or a joint near its reference pose (`src/core/build/joint-state.ts`).
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

/** Called before each sub-step, before the driver applies the command; `dt` is the sub-step, s. */
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
  // Each segment's angular velocity, read once per sub-step: a velocity read allocates (H50).
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
