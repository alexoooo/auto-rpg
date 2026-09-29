import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { PhysicsMassProperties } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";
import type { BuiltBody, BuiltJoint, BuiltSegment } from "../build/build-body.ts";
import { jointAngles, motionAxesToRef } from "../build/joint-state.ts";
import type { MuscleDriver } from "../muscle/driver.ts";
import type { Vec3 } from "../spec/quantity.ts";
import { chainTo } from "./kinematics.ts";

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
}

/**
 * **Standing: the pelvis carried by the legs, the feet where they are.** The stance plans its
 * centre of mass's way to the goal -- critically damped at a time constant (`STANCE_SECONDS`), no
 * faster than `STANCE_SPEED` across the ground, and toward a place the soles can hold
 * (`withinSupport`) -- and each step asks the pelvis for a motion: the plan's velocity, with the
 * centre of mass's error from the plan over the time constant, and a turn toward upright at the
 * goal's heading, its error over its own. It gives each stance leg's freedoms the speeds that make
 * that motion with the foot still: the leg's Jacobian, from the pelvis to the foot, undone
 * (`legSpeeds`) -- by a leg in proportion to the weight it bears, the rest of its speeds following
 * the pelvis as it moves. The muscles are asked for those speeds at full activation, so each
 * joint's motor pulls toward its speed with what strength it has at the speed (`driveMuscles`), and
 * Havok's solver finds the torques together with the ground's push and the other leg's, in the same
 * solve.
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
  /**
   * The place over the ground the stance holds the centre of mass toward, world (x, z; y unused):
   * the goal's, or the nearest the stance soles can hold (`withinSupport`).
   */
  readonly place: Vector3;
  /** The velocity asked of the centre of mass, carried by the pelvis, world, m/s. */
  readonly asked: Vector3;
}

/**
 * The time constants, s, of the centre of mass's pull across the ground and in height, critically
 * damped, and of the pelvis's turn, whose speed asked is its error over its constant.
 */
export const STANCE_SECONDS = { across: 0.3, height: 0.15, turn: 0.15 } as const;

/** What an experiment may set in place of the stance's constants. */
export interface StanceTuning {
  readonly seconds?: { readonly across: number; readonly height: number; readonly turn: number };
  readonly footConditioning?: number;
  readonly speed?: number;
  readonly supportInset?: number;
}

/**
 * **A control setting, from a sweep**: the plan's fastest speed across the ground, m/s. The stance
 * is a shift of weight between feet that stay put; farther and faster is a step's work.
 *
 * Two things give out toward the edge of the soles. Sideways, both feet flat, the ankles turn as
 * far as the hips, and the ankle's everters and invertors -- some 20 to 27 N m (`humanSpec`) -- are
 * what stop the body: a Rogue carried 30 cm sideways with no speed limit, the outline drawn in by
 * 0.2, was pulling 26.3 of its 26.9 N m, dragged at twice its asked speed, and fell. And a centre of
 * mass over one foot leaves the other bearing little, and a leg asked to carry the pelvis slides a
 * foot that bears nothing (hence the legs' shares in `command`). The centre of mass's stop from the
 * held place, cm, and the feet's furthest travel, mm, 6 s after it was asked for a place 30 cm away
 * across the ground each way (+x, -x, +z, -z; held at the edge of the outline drawn in by
 * `SUPPORT_INSET`), 3 cm under the reference height, by the inset and this speed (Node stand,
 * 120 Hz):
 *
 *     inset  speed   Rogue                            Warrior
 *     0.35   0.05    0.9/3   1.4/4   0.8/2   0.4/1    1.7/3   2.4/7   0.8/3   0.7/2
 *     0.35   0.1     0.8/8   1.2/6   0.9/2   0.4/1    1.7/4   2.2/9   0.9/3   0.7/2
 *     0.35   0.2     5.5/44  1.2/17  0.9/2   0.4/1    2.0/11  1.5/13  0.9/3   0.7/2
 *     0.35   none    5.5/44  1.2/17  0.9/2   0.4/1    2.0/10  fell    0.9/3   0.7/2
 *     0.4    0.05    0.4/2   0.3/2   0.8/2   0.3/1    0.7/2   1.4/2   0.7/3   0.6/2
 *     0.4    0.1     0.4/3   0.4/7   0.8/2   0.3/1    0.7/2   1.2/5   0.8/3   0.6/2
 *     0.4    0.2     fell    0.5/7   0.8/2   0.3/1    1.0/8   1.2/8   0.8/3   0.6/2
 *     0.4    none    fell    0.5/7   0.8/2   0.3/1    1.0/8   6.0/49  0.8/3   0.6/2
 *     0.45   0.05    0.3/2   0.2/2   0.7/2   0.2/1    0.1/2   0.3/3   0.7/3   0.6/2
 *     0.45   0.1     0.4/2   0.3/6   0.8/2   0.2/1    0.2/2   0.2/5   0.7/3   0.6/2
 *     0.45   0.2     0.5/3   0.4/6   0.7/2   0.2/1    0.3/5   0.4/7   0.6/3   0.6/2
 *     0.45   none    0.5/3   0.4/6   0.7/2   0.2/1    0.3/5   0.5/7   0.6/3   0.6/2
 *     0.5    0.05    0.3/2   0.3/3   0.7/2   0.2/1    0.0/2   0.3/3   0.6/2   0.5/2
 *     0.5    0.1     0.3/2   0.3/5   0.7/2   0.2/1    0.1/2   0.0/6   0.6/2   0.5/2
 *     0.5    0.2     0.2/2   0.5/6   0.7/2   0.2/1    0.3/2   0.1/7   0.5/2   0.5/2
 *     0.5    none    0.2/2   0.5/6   0.7/2   0.2/1    0.3/2   0.1/7   0.5/2   0.5/2
 *
 * A place 6 cm away is held within 6 mm each way, the feet within 2 mm, at 0.1 and with no limit.
 * The 5 to 7 mm at -x is the far foot, left a sixth of the weight, slipping once. At 0.5 the limit
 * changes little; it is the margin around it: with no limit the stance falls at 0.4 and 0.35, and at
 * 0.1 it holds every place at every inset of the table within 2.4 cm and the feet within 9 mm.
 */
export const STANCE_SPEED = 0.1;

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
 *     Rogue    -4.72   -3.58   -0.42   +0.03   +0.01   +0.01
 *     Warrior  falls   falls   -5.03   -0.63   -0.12   -0.04
 *
 * At 480 Hz and no factor the Warrior falls too, and the Rogue stops 3.25 cm behind: a finer step
 * does not cure it. 100 is the least factor of the table that holds both within 3 mm.
 */
export const STANCE_FOOT_CONDITIONING = 100;

/**
 * The damping of the leg's Jacobian undone, as a least-squares solve (`legSpeeds`): a numeric
 * setting, not anatomy. A straight knee is a singular leg -- no speed of its freedoms lengthens it
 * -- and without damping a pelvis asked to rise over a straight knee is asked for unbounded speeds.
 */
export const LEG_DAMPING = 0.02;

/**
 * **A control setting, from a sweep (`STANCE_SPEED`'s table)**: the fraction by which the outline
 * of the stance soles' corners (their convex hull, across the ground) is drawn toward its middle to
 * give the region the stance holds its centre of mass in. Not every centre of mass over the soles
 * is one the body can hold on both feet: short of their edges the ankles' muscles give out, and one
 * foot is left bearing nothing.
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
  /** The sole's corners and middle, world, as last read. */
  readonly corners: Vector3[];
  readonly middle: Vector3;
  /** The foot's own mass properties, and whether they are conditioned now. */
  readonly natural: PhysicsMassProperties;
  conditioned: boolean;
}

export function stanceControl(built: BuiltBody, tuning: StanceTuning = {}): StanceControl {
  const seconds = tuning.seconds ?? STANCE_SECONDS;
  const conditioning = tuning.footConditioning ?? STANCE_FOOT_CONDITIONING;
  const speed = tuning.speed ?? STANCE_SPEED;
  const inset = tuning.supportInset ?? SUPPORT_INSET;
  const pelvis = chainTo(built, built.segments.get("foot.left")!)[0]!.parent;
  const segments = [...built.segments.values()];
  const total = segments.reduce((sum, s) => sum + s.spec.mass.value, 0);
  const feet = (["left", "right"] as const).map((side): FootState => {
    const segment = built.segments.get(`foot.${side}`);
    if (!segment) throw new Error(`${built.spec.model} has no ${side} foot`);
    const sole = soleOf(segment);
    return { side, segment, chain: chainTo(built, segment), sole, channels: [], corners: sole.map(() => new Vector3()),
      middle: new Vector3(), natural: segment.body.getMassProperties(), conditioned: false };
  });
  const reading = { centre: new Vector3(), velocity: new Vector3(), support: new Vector3(), place: new Vector3(), asked: new Vector3() };
  const scene = pelvis.node.getScene();
  let owned = new Uint8Array(0);
  let last: readonly Foot[] | null = null;
  /** The centre of mass's planned place (x, height over the soles, z) and velocity, since the stance began. */
  const plan = { on: false, at: new Vector3(), velocity: new Vector3() };
  const v = new Vector3(), spin = new Vector3(), target = new Quaternion(), error = new Quaternion(), inverse = new Quaternion();
  const pelvisVelocity = new Vector3(), pelvisSpin = new Vector3(), turn = new Vector3();
  const p = new Vector3();
  const gravity = (): number => -(scene.getPhysicsEngine()?.gravity.y ?? 0);

  /** Each of `stance`'s soles read, and the middle of them into the reading. */
  const supportOf = (stance: readonly FootState[]): void => {
    reading.support.setAll(0);
    for (const foot of stance) {
      const turn = foot.segment.node.rotationQuaternion!, at = foot.segment.node.position;
      foot.middle.setAll(0);
      foot.sole.forEach((corner, k) => { foot.middle.addInPlace(corner.applyRotationQuaternionToRef(turn, foot.corners[k]!).addInPlace(at)); });
      foot.middle.scaleInPlace(1 / foot.sole.length);
      reading.support.addInPlace(foot.middle);
    }
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
    command(driver, goal, dt) {
      if (owned.length !== driver.channels.length) {
        owned = new Uint8Array(driver.channels.length);
        for (const foot of feet) foot.channels = foot.chain.flatMap((joint) => joint.dofs.map((dof) => driver.channel(`${joint.spec.name} ${dof.spec.positive}`)));
      }
      owned.fill(0);
      for (const foot of feet) {
        const standing = goal?.feet.includes(foot.side) ?? false;
        if (standing === foot.conditioned) continue;
        const { inertia } = foot.natural;
        foot.segment.body.setMassProperties({ ...foot.natural, inertia: standing ? inertia!.scale(conditioning) : inertia!.clone() });
        foot.conditioned = standing;
      }
      if (!goal || !last || goal.feet.length !== last.length || goal.feet.some((side) => !last!.includes(side))) plan.on = false;
      last = goal?.feet ?? null;
      reading.asked.setAll(0);
      const stance = goal ? feet.filter((foot) => goal.feet.includes(foot.side)) : [];
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
      // A place outside what the soles can hold is taken at the nearest point that they can.
      const [gx, gz] = withinSupport(stance, goal.centre?.[0] ?? reading.support.x, goal.centre?.[1] ?? reading.support.z, inset);
      reading.place.set(gx, 0, gz);
      const n = 1 / seconds.across, k = 1 / seconds.height;
      // No faster fall than gravity's: past it the feet would have to pull the body down.
      u.addInPlaceFromFloats((n * n * (gx - r.x) - 2 * n * u.x) * dt,
        Math.max(k * k * (goal.height - r.y) - 2 * k * u.y, -g) * dt, (n * n * (gz - r.z) - 2 * n * u.z) * dt);
      const fast = Math.hypot(u.x, u.z) / speed;
      if (fast > 1) { u.x /= fast; u.z /= fast; }
      r.addInPlace(u.scale(dt));
      // Asked of the pelvis: the plan's velocity, and the centre of mass's error from the plan over
      // the across constant.
      const asked = reading.asked.set(u.x + (r.x - c.x) / seconds.across, u.y + (r.y - height) / seconds.across,
        u.z + (r.z - c.z) / seconds.across);

      // The pelvis's asked turn: toward upright at the heading, the error over the time constant.
      Quaternion.RotationAxisToRef(Vector3.UpReadOnly, goal.heading, target);
      target.multiplyInPlace(pelvis.rest);
      Quaternion.InverseToRef(pelvis.node.rotationQuaternion!, inverse);
      target.multiplyToRef(inverse, error);
      if (error.w < 0) error.scaleInPlace(-1);
      const half = Math.hypot(error.x, error.y, error.z), angle = 2 * Math.atan2(half, error.w);
      spin.set(error.x, error.y, error.z).scaleInPlace(half > 1e-12 ? angle / half / seconds.turn : 0);

      // Each stance leg's speeds for a motion of the pelvis, its foot still: the motion asked, by a
      // leg bearing half the weight or more, and the pelvis's own motion by a leg bearing none, which
      // otherwise its speeds would slide over the ground by the pelvis's error; between, a blend by
      // the leg's share. The shares are the lever rule's, from the centre of mass along the line
      // between the soles' middles.
      centreOfToRef(pelvis, p);
      pelvis.body.getLinearVelocityToRef(pelvisVelocity);
      pelvis.body.getAngularVelocityToRef(pelvisSpin);
      for (const foot of stance) {
        const other = stance.find((o) => o !== foot);
        let share = 1;
        if (other) {
          const ex = other.middle.x - foot.middle.x, ez = other.middle.z - foot.middle.z;
          share = 1 - Math.min(1, Math.max(0, ((c.x - foot.middle.x) * ex + (c.z - foot.middle.z) * ez) / (ex * ex + ez * ez)));
        }
        const drive = Math.min(1, 2 * share);
        Vector3.LerpToRef(pelvisVelocity, asked, drive, v);
        Vector3.LerpToRef(pelvisSpin, spin, drive, turn);
        const speeds = legSpeeds(foot.chain, p, v, turn);
        foot.channels.forEach((i, k) => {
          driver.velocity[i] = speeds[k]!;
          driver.activation[i] = 1;
          owned[i] = 1;
        });
      }
    },
  };
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
