import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { BuiltBody } from "../build/build-body.ts";
import { readView } from "../build/read-view.ts";
import type { EngineJoint } from "../engine/engine.ts";
import type { MuscleSpec } from "../spec/body.ts";
import { jointTracker, type JointTracker } from "../build/joint-state.ts";
import { bodyDynamics, type BodyDynamics } from "../build/dynamics.ts";
import type { Hook, World } from "../world.ts";
import { forceVelocityFactor, forceVelocityReach, type ForceVelocityCurve } from "./force-velocity.ts";
import type { BuiltDof, JointKinematics, ReadJoint, ReadSegment } from "../read-body.ts";

/**
 * **The muscle actuator**: each freedom's muscles as a velocity motor on its joint's axis
 * (`EngineJoint.setMotorBounds`) whose directional ceilings are what each side can do at the joint's speed.
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
 * **Under directional actuation each side has its own ceiling.** A finite-speed command permits the solver to pull or brake
 * within those bounds as the load requires. Both sides share the commanded activation, but keep
 * their own strength and force-velocity curve. `pulled` is the measured mean torque over the step;
 * `ceiling` reports the bound in that torque's sense (the requested sense when no torque was given).
 * An infinite-speed command is a torque source in that sense: it gives the opposite side no
 * activation. Its finite speed limit still prevents a light limb outrunning the muscle's curve.
 * `World.actuation` also names the symmetric reference law: it uses the requested side's ceiling
 * in both directions, including when the opposite side supplies the braking. That law is a
 * comparison control, not a guarantee of each side's anatomical bound.
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
 * **A tendon** (`MuscleSpec.tendonPositive`, `tendonNegative`) is a spring in series with its side's
 * muscles that only pulls. While the motor pushes the way a side with a tendon pulls, under either
 * law, the motor is that spring (`EngineJoint.setSpring`), solved within the
 * step: of the tendon's stiffness, toward the fibres' angle -- the joint's angle at which the
 * tendon would be slack -- and bounded by what the fibres can give at their own speed. The fibres'
 * speed is the one at which what they can give, activation x peak x force-velocity, equals the
 * tendon's pull at the step's end, its stretch growing by the fibres' speed less the joint's
 * (`fibreSpeed`); a command of finite speed asks them no faster. Otherwise the motor is the
 * velocity motor above, the tendon taken as rigid. Either way the tendon's stretch after a step is
 * what the side delivered over its stiffness.
 *
 * A freedom's ceiling bounds its own axis only: a ball joint turning about two axes at once can
 * exceed either peak in the diagonal, by up to the root of the sum of their squares. Each peak was
 * measured about one axis at a time.
 */

/**
 * **How much of itself a body runs.** `full`: its joints are read, its mind steps and its motors
 * are driven. `limp`: none of the three, and its motors are released: the solver alone moves it.
 * `held`: limp, and every segment fixed where it is.
 */
export type BodyLevel = "full" | "limp" | "held";

/** What the engine is asked for a body at `level`: whether its segments are fixed. */
function fixedAt(level: BodyLevel): boolean {
  switch (level) {
    case "full": case "limp": return false;
    case "held": return true;
    default: return level satisfies never;
  }
}

/** One freedom's muscles: which joint and freedom, and the curve each way. */
/** The channel of `joint`'s freedom `index`: the joint's name and the freedom's positive motion, e.g. "elbow.right flexion". */
export const channelName = (joint: JointKinematics, index: number): string => `${joint.spec.name} ${joint.dofs[index]!.spec.positive}`;

interface MuscleChannel {
  /** `joint.name` and the freedom's positive motion, e.g. "elbow.right flexion". */
  readonly name: string;
  readonly joint: ReadJoint;
  /** The freedom's index in its joint. */
  readonly index: number;
  readonly dof: BuiltDof;
  /** The muscles that turn the joint toward positive angles, and toward negative. */
  readonly positive: MuscleSide;
  readonly negative: MuscleSide;
}

interface MuscleSide {
  /** Peak isometric torque, N m. */
  readonly peak: number;
  readonly curve: ForceVelocityCurve;
  /** Its tendon's stiffness about the joint, N m/rad; null, none. */
  readonly tendon: number | null;
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
  /** The nonnegative directional torque ceilings given to the solver, N m, in the channel's senses. */
  readonly bounds: { readonly negative: Float64Array; readonly positive: Float64Array };
  /** Mean torque delivered over the last world step, N m, positive in the channel's positive sense. */
  readonly pulled: Float64Array;
  /** Its memory (`src/core/state.ts`): its level, command, ceilings, delivered torque, and each joint as last read. */
  readonly state: object;
  /** Its level (`BodyLevel`), `full` as made. */
  readonly level: BodyLevel;
  /**
   * Put the body at `level`. Leaving `full`, whatever has the body is told it is nobody's
   * (`idle`), and the command and every motor are zeroed. The joints as last read stay as they
   * were read until it is at `full` again, where its first step reads them before its mind steps.
   */
  setLevel(level: BodyLevel): void;
  /** The channel named `name`; throws if there is none. */
  channel(name: string): number;
  /** Stop driving: the motors are released and its step hook removed. */
  dispose(): void;
}

/** Called every world step, before the driver applies the command; `dt` is the step, s. */
export type MuscleController = (driver: MuscleDriver, dt: number) => void;

/**
 * Drive every freedom of `built` from its spec's muscles, before each step of `world` while the
 * body is at `full`. `idle` is called as it leaves `full`, before its motors are zeroed.
 */
export function driveMuscles(built: BuiltBody, world: World, control?: MuscleController, idle?: () => void): MuscleDriver {
  // Its mind reads the body through its view (`readView`): the channels' joints and the dynamics' segments are the view's.
  const read = readView(built);
  const trackers: JointTracker[] = [];
  const channels: MuscleChannel[] = [];
  const motors: EngineJoint[] = [];
  const trackerOf: JointTracker[] = [];
  for (const [name, joint] of built.joints) {
    const tracker = jointTracker(joint);
    trackers.push(tracker);
    joint.dofs.forEach((dof, index) => {
      const muscle = dof.spec.muscle;
      channels.push({
        name: channelName(joint, index), joint: read.joints.get(name)!, index, dof,
        positive: { peak: muscle.peakPositive.value, curve: curveOf(muscle, "positive"), tendon: muscle.tendonPositive?.stiffness.value ?? null },
        negative: { peak: muscle.peakNegative.value, curve: curveOf(muscle, "negative"), tendon: muscle.tendonNegative?.stiffness.value ?? null },
      });
      motors.push(joint.joint);
      trackerOf.push(tracker);
      joint.joint.setMotor(index, 0, 0);
    });
  }
  // Each segment's angular velocity, read once per step: a velocity read allocates. Found by the built segment or its view.
  const spins = [...built.segments].map(([name, segment]) => ({ body: segment.body, w: new Vector3(), segment, view: read.segments.get(name)! }));
  const spin = new Map<ReadSegment, Vector3>(spins.flatMap(({ w, segment, view }) => [[segment, w], [view, w]]));
  const angularVelocity = (segment: ReadSegment): Vector3 => spin.get(segment)!;
  const byName = new Map(channels.map((c, i) => [c.name, i]));
  const n = channels.length;
  const dt = world.dt;
  const directional = (() => {
    const law = world.actuation;
    switch (law) {
      case "symmetric": return false;
      case "directional": return true;
      default: throw new Error(`unknown actuation ${law satisfies never}`);
    }
  })();
  const dynamics = bodyDynamics(read, world.physics.gravity);
  const angles = trackers.map((tracker) => tracker.angles);
  const motion = { spin: angularVelocity };
  let hook: Hook | null = null;
  let after: Hook | null = null;
  const state = {
    level: "full" as BodyLevel,
    activation: new Float64Array(n), velocity: new Float64Array(n), ceiling: new Float64Array(n), pulled: new Float64Array(n),
    bounds: { negative: new Float64Array(n), positive: new Float64Array(n) },
    /** Each side's tendon's stretch after the last step, rad; 0 where it has none. */
    stretch: { negative: new Float64Array(n), positive: new Float64Array(n) },
    trackers: trackers.map(({ angles, speeds, rates, turning }) => ({ angles, speeds, rates, turning })),
  };
  const driver: MuscleDriver = {
    channels, state,
    activation: state.activation,
    velocity: state.velocity,
    ceiling: state.ceiling,
    pulled: state.pulled,
    bounds: state.bounds,
    angle: (i) => trackerOf[i]!.angles[channels[i]!.index]!,
    rate: (i) => trackerOf[i]!.rates[channels[i]!.index]!,
    speed: (i) => trackerOf[i]!.speeds[channels[i]!.index]!,
    turning: (i, k) => trackerOf[i]!.turning[channels[i]!.index]![k]!,
    dynamics,
    get level() { return state.level; },
    setLevel(next) {
      if (next === state.level) return;
      if (state.level === "full") {
        idle?.();
        state.activation.fill(0); state.velocity.fill(0); state.ceiling.fill(0);
        state.bounds.negative.fill(0); state.bounds.positive.fill(0);
        state.stretch.negative.fill(0); state.stretch.positive.fill(0);
        channels.forEach((c, i) => motors[i]!.setMotor(c.index, 0, 0));
      }
      if (fixedAt(next) !== fixedAt(state.level)) for (const segment of built.segments.values()) segment.body.setFixed(fixedAt(next));
      state.level = next;
    },
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
      after?.dispose();
      after = null;
      channels.forEach((c, i) => motors[i]!.setMotor(c.index, 0, 0));
    },
  };
  hook = world.beforeStep(() => {
    if (state.level !== "full") return;
    for (const { body, w } of spins) body.angularVelocityToRef(w);
    for (const tracker of trackers) tracker.update(angularVelocity);
    dynamics.update(angles, motion);
    control?.(driver, dt);
    for (let i = 0; i < n; i++) {
      const c = channels[i]!;
      const speed = driver.speed(i), target = driver.velocity[i]!;
      const activation = Math.max(0, Math.min(1, driver.activation[i]!));
      const push = target - speed;
      const toward = push > 0 ? 1 : push < 0 ? -1 : c.positive.peak <= c.negative.peak ? 1 : -1;
      const side = toward > 0 ? c.positive : c.negative;
      if (side.tendon !== null) {
        const stretch = (toward > 0 ? state.stretch.positive : state.stretch.negative)[i]!, force = activation * side.peak;
        const v = fibreSpeed(force, side.curve, side.tendon, stretch, toward * speed, dt, Number.isFinite(target) ? toward * target : Infinity);
        const capacity = force > 0 ? force * forceVelocityFactor(v, side.curve) : 0;
        const positive = toward > 0 ? capacity : 0, negative = toward > 0 ? 0 : capacity;
        state.bounds.positive[i] = positive; state.bounds.negative[i] = negative;
        driver.ceiling[i] = capacity;
        const along = c.dof.sign > 0, fibre = driver.angle(i) + toward * (stretch + v * dt);
        motors[i]!.setSpring(c.index, c.dof.sign * fibre, side.tendon, along ? negative : positive, along ? positive : negative);
        continue;
      }
      // Within a step the muscles turn the joint no further than their curve's tangent reaches.
      const reach = forceVelocityReach(toward * speed, (toward > 0 ? c.positive : c.negative).curve);
      const beyond = toward * target > reach;
      const reference = directional ? 0 : activation * driver.strength(i, toward);
      const positive = directional ? target === -Infinity ? 0 : activation * driver.strength(i, 1) : reference;
      const negative = directional ? target === Infinity ? 0 : activation * driver.strength(i, -1) : reference;
      state.bounds.positive[i] = positive; state.bounds.negative[i] = negative;
      driver.ceiling[i] = toward > 0 ? positive : negative;
      // The motor's axis may run against the freedom's positive sense.
      const along = c.dof.sign > 0;
      const commanded = c.dof.sign * (beyond ? toward * reach : target);
      if (directional) motors[i]!.setMotorBounds(c.index, commanded, along ? negative : positive, along ? positive : negative);
      else motors[i]!.setMotor(c.index, commanded, reference);
    }
  });
  after = world.afterStep(() => {
    for (let i = 0; i < n; i++) {
      const c = channels[i]!;
      state.pulled[i] = c.dof.sign * motors[i]!.motorStepImpulse(c.index) / dt;
      if (state.pulled[i] !== 0) state.ceiling[i] = state.pulled[i]! > 0 ? state.bounds.positive[i]! : state.bounds.negative[i]!;
      if (c.positive.tendon !== null) state.stretch.positive[i] = Math.max(0, state.pulled[i]!) / c.positive.tendon;
      if (c.negative.tendon !== null) state.stretch.negative[i] = Math.max(0, -state.pulled[i]!) / c.negative.tendon;
    }
  });
  return driver;
}

/**
 * The fibres' shortening speed, rad/s in the joint's terms, behind a tendon of `stiffness` N m/rad
 * stretched `stretch` rad, the joint turning `joint` rad/s the way they pull, over a step `dt`:
 * where what they can give, `force` x force-velocity, equals the tendon's pull at the step's end,
 * stiffness x (stretch + (speed - joint) dt), and no faster than `most`. What they can give falls
 * with speed and the pull rises, so the speed is one, found by halving between a speed at which the
 * tendon goes slack and the unloaded speed: 40 halvings, a numeric setting. With no force the
 * tendon goes slack.
 */
function fibreSpeed(force: number, curve: ForceVelocityCurve, stiffness: number, stretch: number, joint: number, dt: number, most: number): number {
  const slack = joint - stretch / dt;
  if (!(force > 0)) return slack;
  let lo = Math.min(slack, -curve.unloadedSpeed), hi = curve.unloadedSpeed;
  for (let k = 0; k < 40; k++) {
    const mid = (lo + hi) / 2;
    if (force * forceVelocityFactor(mid, curve) > stiffness * Math.max(0, stretch + (mid - joint) * dt)) lo = mid; else hi = mid;
  }
  return Math.min(lo, most);
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
