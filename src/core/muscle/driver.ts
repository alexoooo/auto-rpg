import type { Observer } from "@babylonjs/core/Misc/observable.js";
import { PhysicsConstraintMotorType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";
import type { Scene } from "@babylonjs/core/scene.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { BuiltBody, BuiltDof, BuiltJoint, BuiltSegment } from "../build/build-body.ts";
import type { MuscleSpec } from "../spec/body.ts";
import { jointTracker, type JointTracker } from "../build/joint-state.ts";
import { inertiaBeyond } from "../build/inertia-beyond.ts";
import { PHYSICS_HZ } from "../engine/havok.ts";
import { appliedAngularImpulseToRef } from "../engine/constraint.ts";
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
 *     activation x peak isometric torque (the side that pulls) x force-velocity(speed)
 *
 * The muscle shortens when the joint turns the way it pulls: the force-velocity relation reads the
 * speed in that direction (`forceVelocityFactor`). A speed the joint cannot reach makes the motor a
 * torque source at its ceiling; a speed of zero is a hold; a speed toward a pose is a servo.
 *
 * **Which muscles pull is chosen before the step**, and a Havok motor's ceiling is one number for
 * both directions, so the choice bounds the motor whichever way it then pushes. Toward a target the
 * step cannot reach (below), the side pushed toward. Otherwise, the sign of the torque the step
 * needs, taking the torque the motor last applied (`pulled`) to have held the joint's speed: that
 * torque, plus the inertia beyond the joint (`inertiaBeyond`) times the change of speed asked over
 * the step. With no torque either way, the side pushed toward, and with no push the weaker.
 * The side was the sign of target minus speed, the change asked, and that gave the braking
 * muscles' work to the other side whenever a load outweighed the change: a servo asks for small
 * changes, the smaller the finer the step. On the Rogue's servoed return (Node stand, steps where a
 * joint was at a stop left out), the motors pulled past the pulling side's ceiling on 1127 steps at
 * 1920 Hz, 8.2 N m s in all, and were held short of it on 227 (1.3 N m s), against 1 and none at
 * 120 Hz; with the side so chosen, 73 (1.0 N m s, 72 of them at the shoulder) and none, and 4
 * and none. The Warrior's lab routine, 5 s at 1920 Hz: 136 steps (0.8 N m s) and 67 (2.3) against
 * 17 (0.2) and 3 (0.1).
 * Rejected:
 * - **The side that pulled last step.** The same counts, but it keeps a side for a step after a
 *   command turns, and on the Rogue's servoed return at 120 Hz its fist pulsed at about 70 ms.
 * - **Adding the last step's change of speed**, to read the rest of the world's torque as well.
 *   Havok's motor overshoots what it is asked (below), and the overshoot read as outside torque: at
 *   120 Hz it gave the Rogue's shoulder its flexors' braking ceiling, 43 N m, for 6 steps while
 *   its extensors pulled, turning it at 5-9 rad/s.
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
 * On the lab's three straights (Node stand) the peak fist at 120 Hz, 480 Hz and 1920 Hz, then with
 * self-contact off:
 *
 *     Warrior  6.53 6.25 6.26 | 6.46 6.55 6.56 | 6.45 6.09 6.47
 *     Rogue    5.00 5.23 5.09 | 5.05 5.10 5.07 | 4.89 4.80 4.87
 *     Warrior  6.40 6.40 6.39 | 6.57 6.60 6.61 | 6.55 6.59 6.59   self-contact off
 *     Rogue    5.43 5.50 5.42 | 5.29 5.33 5.32 | 5.58 6.16 5.84   self-contact off
 *
 * The Warrior's are within 3.3 % of the finest rate; the Rogue's at 120 Hz are up to 9 % over it
 * and, with self-contact off, up to 11 % under. Reading the muscles' side from the torque needed
 * (above) moved the fine rate and not the game's: before it, with self-contact off, the Rogue read
 * 5.44 5.50 5.42 at 120 Hz and 5.31 5.43 5.84 at 1920 Hz. One blow is a poor reading of a rate:
 * random strikes read 1.9 % apart when every activation was scaled by 0.9999 (the plan, stage 2).
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
 * 0.83 rad/s from rest turned at 1.08). The ring comes with Babylon's plugin telling Havok to
 * expect the step it hands it (`HP_World_SetIdealStepTime`): told to expect 1/240 s or less while
 * stepping 1/120 s, the rod asked for 6 rad/s turned at 5.87, 6.29, 6.01 rad/s against 8.06, 5.87,
 * 5.63, 6.28, and at 1920 Hz the ring is the same, 8.07. Holding the two apart changes more than
 * the ring and is not done here (the plan, stage 2). So a controller asks for speeds near the one it reads:
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
  /**
   * The torque the channel's motor and limit applied over the last step, N m, as Havok reports it
   * (`appliedAngularImpulseToRef`): positive when the positive muscles pulled.
   */
  readonly pulled: Float64Array;
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
  // Each joint's last applied impulse along its freedoms, N m s, and each channel's joint's.
  const impulses: number[][] = [];
  const impulseOf: number[][] = [];
  // Each channel's joint and freedom, by index into the joints.
  const jointOf: number[] = [];
  for (const joint of built.joints.values()) {
    const tracker = jointTracker(joint);
    trackers.push(tracker);
    const along = joint.dofs.map(() => 0);
    impulses.push(along);
    joint.dofs.forEach((dof, index) => {
      impulseOf.push(along);
      jointOf.push(trackers.length - 1);
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
    pulled: new Float64Array(n),
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
  const impulse = new Vector3();
  const inertia = inertiaBeyond(built);
  observer = scene.onBeforePhysicsObservable.add(() => {
    for (const [segment, w] of spin) segment.body.getAngularVelocityToRef(w);
    trackers.forEach((tracker, j) => {
      tracker.update(angularVelocity);
      tracker.project(appliedAngularImpulseToRef(tracker.joint.constraint, impulse), impulses[j]!);
    });
    for (let i = 0; i < n; i++) driver.pulled[i] = impulseOf[i]![channels[i]!.index]! / dt;
    inertia.update();
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
      // The muscles that pull: toward a speed the step cannot reach, certainly; otherwise the sign of
      // the torque the step needs, taking the torque last applied to have held the joint's speed.
      const needed = driver.pulled[i]! + inertia.about[jointOf[i]!]![c.index]! * push / dt;
      const sense = beyond || needed === 0 ? toward : Math.sign(needed);
      const side = sense > 0 ? c.positive : c.negative;
      const ceiling = activation * side.peak * forceVelocityFactor(sense * speed, side.curve);
      driver.ceiling[i] = ceiling;
      c.joint.constraint.setAxisMotorTarget(c.dof.axis, c.dof.sign * (beyond ? toward * reach : target));
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
