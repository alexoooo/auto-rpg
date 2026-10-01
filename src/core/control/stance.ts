import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { BuiltBody } from "../build/build-body.ts";
import type { MuscleDriver } from "../muscle/driver.ts";
import type { ServoWork } from "./servo.ts";
import { shareGroundWrench } from "./contact-wrench.ts";
import { rotationAtToRef } from "./kinematics.ts";
import { boundedLeastSquares, fixedSolve, solveLinear } from "../math/linalg.ts";
import { LEG_DAMPING, type StanceTuning } from "./stance-tuning.ts";
import { ownStep, paceToward } from "./gait.ts";
import { gravityOf, makeStance, type FootTask, type Stance } from "./stance-state.ts";
import {
  GROUND_FRICTION, bearingOf, bearingSole, centreOfToRef, footMotionToRef, pointOfToRef, readSupport, soleMiddleToRef, turnOfToRef,
  withinSupport, type FootState,
} from "./support.ts";

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
 * on a minimum-jerk path lifted by `lift` at its middle, its turn carried from the one it left the
 * ground with to flat and facing the heading as it lands. A goal equal to the last keeps its path;
 * a new one starts from where the foot is.
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
   * ground once the body's capture point is over the other sole. A step to catch a fall lifts at
   * once.
   */
  readonly shift?: boolean;
  /**
   * Where the capture point is brought by the time the foot lands, world (x, z), m: the pivot the
   * body falls about in the bearing sole is chosen for it. None, and the middle of the stance the
   * step lands in.
   */
  readonly capture?: readonly [number, number];
  /**
   * A walk's double support before the lift, s (`transferStep`): both soles bear, and the foot lifts
   * when it is over, not on the capture point; the plan brings its capture point to `handover` by then.
   */
  readonly transfer?: number;
  readonly handover?: readonly [number, number];
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
 * Every inertia is the body's own (`humanSpec`), and nothing conditions it.
 *
 * **A step** (`SwingGoal`) shifts the weight onto the other foot until the body's capture point is
 * over that sole, lifts the foot, and carries it on its path while the plan falls as an inverted
 * pendulum about a point of the bearing sole chosen to bring the capture point to the middle of the
 * stance the step lands in; the foot lands at the swing's end, and the stance holds the new feet.
 * The swinging foot is asked for its path's acceleration with its errors taken up at the swing's
 * constant, through the same inverse dynamics, no ground under it.
 *
 * The plan is what makes a move settle: the body tracks a path that is itself settled, rather than
 * chasing its goal from a velocity it reads a step late, which overshoots or coasts through the place.
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

/** `foot`'s leg's Jacobian at `point`, world: its spin's rows, then the point's velocity's, a column a freedom. */
function legJacobian(foot: FootState, point: Vector3, driver: MuscleDriver): number[][] {
  const dynamics = driver.dynamics;
  return [0, 1, 2, 3, 4, 5].map((row) => foot.memory.channels.map((i) => {
    const axis = dynamics.axis(i), pivot = dynamics.pivot(i);
    if (row < 3) return axis[row]!;
    const d = [point.x - pivot[0], point.y - pivot[1], point.z - pivot[2]];
    return row === 3 ? axis[1] * d[2]! - axis[2] * d[1]! : row === 4 ? axis[2] * d[0]! - axis[0] * d[2]! : axis[0] * d[1]! - axis[1] * d[0]!;
  }));
}

/** The point of `foot` its task is asked at, into `out`: bearing, where it bears, as last read; swinging, its sole's middle, now. */
function pointOf(foot: FootState, task: FootTask, out: Vector3): Vector3 {
  return task.bearing ? out.copyFrom(foot.memory.rolled ? foot.edge : foot.middle) : soleMiddleToRef(foot, out);
}

/**
 * The lever a missed moment of the ground's wrench is weighed against a missed force at
 * (`shareGroundWrench`): the height of the root's centre, where the wrench is taken, over the
 * soles, at least a sole's half-length. A moment the soles miss is a force they miss at the
 * root's height. No fixed lever serves both humans better: `docs/reference/stance-tuning.md#wrench-lever`.
 */
function leverOf(s: Stance, height: number): number {
  return Math.max(s.feet[0]!.reach, height - s.state.reading.support.y);
}

/**
 * The plan's acceleration across the ground (x, z) by the stance's phase, and the place it is
 * held toward, into the reading. `pendulum` is g over the plan's height.
 */
function planAcross(s: Stance, goal: StanceGoal, stance: readonly FootState[], swing: SwingGoal | null, bearer: FootState | undefined,
  pendulum: number, dt: number): [number, number] {
  const { plan, reading, step } = s.state, { seconds, inset } = s.tuning;
  const r = plan.at, u = plan.velocity, n = 1 / seconds.across;
  if (reading.phase === "swing") {
    // On one foot the plan falls as an inverted pendulum of its height about a point of the
    // bearing sole (Kajita et al. 2001, "The 3D linear inverted pendulum mode", IROS), whose
    // capture point runs away from that point exponentially. The point is chosen each step so
    // that the capture point reaches the middle of the stance the step lands in as the foot
    // lands (Englsberger et al. 2011, "Bipedal walking control based on Capture Point
    // dynamics", IROS), within what the sole holds: the body falls toward its new stance.
    const w = Math.sqrt(pendulum), grow = Math.exp(w * Math.max(swing!.seconds - step.time, dt));
    const [tx, tz] = swing!.capture ?? [(bearer!.middle.x + swing!.to[0]) / 2, (bearer!.middle.z + swing!.to[1]) / 2];
    const [px, pz] = withinSupport([bearingOf(bearer!)], (tx - (r.x + u.x / w) * grow) / (1 - grow), (tz - (r.z + u.z / w) * grow) / (1 - grow),
      inset);
    reading.place.set(px, 0, pz);
    return [pendulum * (r.x - px), pendulum * (r.z - pz)];
  }
  if (reading.phase === "shift" && swing!.transfer) {
    // A walk's double support: both soles bear, and the plan falls as the pendulum about a
    // point of them chosen, as a swing's is, to bring its capture point to the step's handover
    // as the foot lifts (Englsberger et al. 2015, "Three-dimensional bipedal walking control
    // based on Divergent Component of Motion", IEEE T-RO): the walk keeps its momentum.
    const w = Math.sqrt(pendulum), grow = Math.exp(w * Math.max(swing!.transfer - step.held, dt));
    const [tx, tz] = swing!.handover!;
    const [px, pz] = withinSupport(stance.map(bearingOf), (tx - (r.x + u.x / w) * grow) / (1 - grow), (tz - (r.z + u.z / w) * grow) / (1 - grow),
      inset);
    reading.place.set(px, 0, pz);
    return [pendulum * (r.x - px), pendulum * (r.z - pz)];
  }
  if (reading.phase === "shift") {
    // Before a step the plan goes toward the bearing sole's middle, as fast as its constant
    // takes it, past what a stance on both feet holds: the foot lifts before it gets there.
    reading.place.set(bearer!.middle.x, 0, bearer!.middle.z);
    return [n * n * (bearer!.middle.x - r.x) - 2 * n * u.x, n * n * (bearer!.middle.z - r.z) - 2 * n * u.z];
  }
  // A place outside what the soles can hold is taken at the nearest point that they can.
  const [gx, gz] = withinSupport(stance, goal.centre?.[0] ?? reading.support.x, goal.centre?.[1] ?? reading.support.z, inset);
  reading.place.set(gx, 0, gz);
  return [n * n * (gx - r.x) - 2 * n * u.x, n * n * (gz - r.z) - 2 * n * u.z];
}

/**
 * The plan's height limits. No higher than each leg reaches with its knee bent by
 * `STANCE_KNEE_BEND`, its hip carried as the plan carries the centre of mass: a stance leg from its
 * ankle, a swinging leg from where its ankle will be when its sole lands, its hip where the plan
 * will have it then (the pendulum about the place, over the swing's time left). Taken from the hip
 * where it is, a long step's leg reaches from behind the bearing foot to a landing ahead of it, and
 * the plan drops the body as the foot lifts. And no lower than each leg reaches with its ankle
 * dorsiflexed to its range less `STANCE_ANKLE_SPARE`, its foot where it stands or will land: the
 * knee's place is then fixed, and the hip is a thigh from it; each leg's such floor is in `floors`.
 */
function heightLimits(s: Stance, goal: StanceGoal, stance: readonly FootState[], swing: SwingGoal | null, pendulum: number):
  { high: number; floors: [FootState, number][] } {
  const { feet } = s, { plan, reading, step } = s.state, { bend, spare } = s.tuning, { hipAt, ankleAt, kneeAt, shank, footTurn } = s.scratch;
  const r = plan.at, u = plan.velocity, c = reading.centre;
  let high = goal.height;
  const floors: [FootState, number][] = [];
  let landX = r.x, landZ = r.z;
  if (reading.phase === "swing") {
    const w = Math.sqrt(pendulum), left = Math.max(swing!.seconds - step.time, 0), ch = Math.cosh(w * left), sh = Math.sinh(w * left);
    landX = reading.place.x + (r.x - reading.place.x) * ch + u.x / w * sh;
    landZ = reading.place.z + (r.z - reading.place.z) * ch + u.z / w * sh;
  }
  for (const foot of reading.phase === "swing" ? feet : stance) {
    const [hip, knee, ankle] = foot.chain;
    pointOfToRef(hip!.parent, hip!.spec.centre.value, hipAt);
    pointOfToRef(ankle!.parent, ankle!.spec.centre.value, ankleAt);
    const swinging = !stance.includes(foot);
    const [a, b] = foot.lengths, hx = hipAt.x + (swinging ? landX : r.x) - c.x, hz = hipAt.z + (swinging ? landZ : r.z) - c.z, rise = c.y - hipAt.y - reading.support.y;
    if (swinging) ankleAt.addInPlaceFromFloats(swing!.to[0] - foot.middle.x, reading.support.y - foot.middle.y, swing!.to[1] - foot.middle.z);
    if (bend !== null) {
      const long = Math.sqrt(a * a + b * b + 2 * a * b * Math.cos(bend)), spread = Math.hypot(hx - ankleAt.x, hz - ankleAt.z);
      high = Math.min(high, ankleAt.y + Math.sqrt(Math.max(0, long * long - spread * spread)) + rise);
    }
    if (spare !== null) {
      // The shank's turn is the foot's with the ankle's own undone (rel = D_shank^-1 D_foot).
      const dorsiflexion = ankle!.dofs[0]!.spec;
      rotationAtToRef(ankle!, [dorsiflexion.max.value - spare, 0], shank);
      turnOfToRef(foot.segment, footTurn).multiplyToRef(Quaternion.InverseToRef(shank, shank), shank);
      const k = knee!.spec.centre.value, o = ankle!.spec.centre.value;
      kneeAt.set(k[0] - o[0], k[1] - o[1], k[2] - o[2]).applyRotationQuaternionToRef(shank, kneeAt).addInPlace(ankleAt);
      const spread = Math.hypot(hx - kneeAt.x, hz - kneeAt.z);
      if (spread < a) floors.push([foot, kneeAt.y + Math.sqrt(a * a - spread * spread) + rise]);
    }
  }
  return { high, floors };
}

/**
 * Which feet bear on their front edges. A walk's bearing foot whose ankle's floor is over the
 * knees' ceiling (`high`) on one foot rolls onto its front edge instead (Perry 1992, "Gait
 * Analysis", terminal stance: the heel rises as the body passes over the forefoot), once the plan's
 * centre of mass is past that edge: rolled, the foot's pressure is on the edge, and one rolled with
 * the centre behind it brakes the walk (`docs/reference/stance-tuning.md#heel-off`). The height
 * keeps the knees bent, and the ankle its range. The foot rolls back once its heel is down with the
 * centre behind the edge, and is flat again whenever it leaves the ground. Through a walk's double
 * support the trailing foot rolls for its pre-swing.
 */
function rollFeet(s: Stance, stance: readonly FootState[], swing: SwingGoal | null, floors: readonly [FootState, number][], high: number): void {
  const { feet } = s, { plan, reading } = s.state, { heelOff, gait } = s.tuning;
  const r = plan.at, u = plan.velocity;
  for (const foot of feet) if (!stance.includes(foot)) foot.memory.rolled = false;
  for (const [foot, floor] of floors) {
    if (!stance.includes(foot)) continue;
    const ex = r.x - foot.edge.x, ez = r.z - foot.edge.z;
    const past = ex * (foot.edge.x - foot.middle.x) + ez * (foot.edge.z - foot.middle.z) >= 0;
    if (heelOff && s.state.striding && past && !foot.memory.rolled && floor > high && reading.phase === "swing") foot.memory.rolled = true;
    else if (foot.memory.rolled && !past && foot.heel <= foot.flat) foot.memory.rolled = false;
  }
  if (gait.preswing !== undefined && reading.phase === "shift" && swing?.transfer) {
    // Only while the body goes the foot's way: it walks off its toes, not its heel.
    const trailing = feet.find((f) => f.side === swing.foot)!;
    if (stance.includes(trailing) && u.x * (trailing.edge.x - trailing.middle.x) + u.z * (trailing.edge.z - trailing.middle.z) > 0) trailing.memory.rolled = true;
  }
}

/**
 * The weight shift before a step ends, and the foot lifts, once the body's capture point (Pratt et
 * al. 2006, "Capture point: a step toward humanoid push recovery", Humanoids) is over the bearing
 * sole: from there the body falls toward that foot, not away from it. A walk's double support ends
 * on its time.
 */
function shiftWeight(s: Stance, swing: SwingGoal | null, bearer: FootState | undefined, height: number, dt: number): void {
  const { reading, step } = s.state, { inset } = s.tuning;
  if (reading.phase === "shift" && swing!.transfer) {
    step.held += dt;
    if (step.held >= swing!.transfer) reading.phase = "swing";
  } else if (reading.phase === "shift") {
    const c = reading.centre, vel = reading.velocity, g = gravityOf(s);
    const w = Math.sqrt(g / Math.max(height, 1e-3)), cx = c.x + vel.x / w, cz = c.z + vel.z / w;
    const [hx, hz] = withinSupport([bearer!], cx, cz, inset);
    if (hx === cx && hz === cz) reading.phase = "swing";
  }
}

/** The pelvis's asked turn, into `spin`: toward upright at `heading`, the error over the time constant. */
function pelvisTurn(s: Stance, heading: number): void {
  const { pelvis } = s, { seconds } = s.tuning, { target, inverse, error, spin } = s.scratch;
  Quaternion.RotationAxisToRef(Vector3.UpReadOnly, heading, target);
  target.multiplyInPlace(pelvis.rest);
  Quaternion.InverseToRef(pelvis.node.rotationQuaternion!, inverse);
  target.multiplyToRef(inverse, error);
  if (error.w < 0) error.scaleInPlace(-1);
  const half = Math.hypot(error.x, error.y, error.z), angle = 2 * Math.atan2(half, error.w);
  spin.set(error.x, error.y, error.z).scaleInPlace(half > 1e-12 ? angle / half / seconds.turn : 0);
}

/**
 * The swing: `swing`'s foot's sole carried along its path, its turn carried from the one it left
 * the ground with to flat and facing `heading` as it lands; the step ends as it lands.
 */
function swingFoot(s: Stance, swing: SwingGoal, heading: number, dt: number): void {
  const { feet } = s, { step, tasks, reading } = s.state, { seconds } = s.tuning;
  const { sole, level, path, along, inverse, error, turn, whole, wholeAxis } = s.scratch;
  const foot = feet.find((f) => f.side === swing.foot)!;
  soleMiddleToRef(foot, sole);
  if (!step.lifted) {
    step.lifted = true;
    step.time = 0;
    step.from.copyFrom(sole);
    step.lift.copyFrom(foot.segment.node.rotationQuaternion!);
  }
  // It lands flat, facing the heading: its reference-pose turn, turned about up by the heading.
  // (Held at the turn it left with, a foot's yaw drifts step by step.)
  Quaternion.RotationAxisToRef(Vector3.UpReadOnly, heading, level);
  level.multiplyInPlace(foot.segment.rest);
  step.time += dt;
  const tau = Math.min(1, step.time / swing.seconds), from = step.from;
  // Minimum jerk across the ground, a lift of the same smoothness up and down.
  const eased = tau * tau * tau * (10 - 15 * tau + 6 * tau * tau), ds = 30 * tau * tau * (1 - tau) * (1 - tau) / swing.seconds;
  const bump = 16 * tau * tau * (1 - tau) * (1 - tau), dbump = 32 * tau * (1 - tau) * (1 - 2 * tau) / swing.seconds;
  path.set(from.x + (swing.to[0] - from.x) * eased, from.y + swing.lift * bump, from.z + (swing.to[1] - from.z) * eased);
  Quaternion.SlerpToRef(step.lift, level, eased, step.turn);
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
  // swing's constant; its turn's likewise, with the turn's own rate and acceleration: damping
  // alone lags a turn by twice its rate times the swing's constant, and a foot turning over a
  // swing lands off the heading (`tests/core-stance.test.mjs`).
  const task = tasks[feet.indexOf(foot)]!, w = 1 / seconds.swing, T = swing.seconds;
  const dds = tau < 1 ? 60 * tau * (1 - tau) * (1 - 2 * tau) / (T * T) : 0, ddbump = tau < 1 ? 32 * (1 - 6 * tau + 6 * tau * tau) / (T * T) : 0;
  footMotionToRef(foot, sole, task.linear, task.angular);
  task.linear.set((swing.to[0] - from.x) * dds + w * w * (path.x - sole.x) + 2 * w * (along.x - task.linear.x),
    swing.lift * ddbump + w * w * (path.y - sole.y) + 2 * w * (along.y - task.linear.y),
    (swing.to[1] - from.z) * dds + w * w * (path.z - sole.z) + 2 * w * (along.z - task.linear.z));
  task.angular.scaleInPlace(-2 * w).addInPlace(turn.scale(w)).addInPlace(wholeAxis.scale(dds + 2 * w * ds));
  task.on = true;
  task.bearing = false;
  for (const i of foot.memory.channels) s.state.owned[i] = 1;
  if (tau >= 1) {
    reading.phase = "stand";
    reading.own = null;
  }
}

/** Each foot's leg's channels, found once the driver's are known. */
function bindChannels(s: Stance, muscles: MuscleDriver): void {
  const { state } = s;
  if (state.owned.length === muscles.channels.length) return;
  state.owned = new Uint8Array(muscles.channels.length);
  for (const foot of s.feet) foot.memory.channels = foot.chain.flatMap((joint) => joint.dofs.map((dof) => muscles.channel(`${joint.spec.name} ${dof.spec.positive}`)));
}

/** Whether `goal` leaves the stance to step of itself: it stands on both feet and asks for no step. */
function stepsOfItself(goal: StanceGoal | null): goal is StanceGoal {
  return !!goal && goal.feet.includes("left") && goal.feet.includes("right") && !goal.swing;
}

/**
 * The step this command takes: the goal's, or the stance's own (`ownStep`), or none. A swing unlike
 * the last starts a step, at its weight shift or, asked to, at its swing.
 */
function chooseStep(s: Stance, goal: StanceGoal | null): SwingGoal | null {
  const { state } = s, { reading, step } = state;
  if (stepsOfItself(goal)) ownStep(s, goal.heading);
  else {
    reading.own = null;
    state.stride = null;
    state.striding = null;
  }
  const swing = goal?.swing ?? reading.own;
  if (!swing) {
    step.swing = null;
    reading.phase = "stand";
  } else if (!sameSwing(swing, step.swing)) {
    step.swing = swing;
    step.lifted = false;
    step.held = 0;
    reading.phase = swing.shift === false ? "swing" : "shift";
  }
  return swing;
}

/** The feet that bear the body: the goal's, but for a foot that is swinging. */
function bearerOf(goal: StanceGoal | null, phase: StancePhase, swing: SwingGoal | null): readonly Foot[] {
  return !goal ? [] : phase === "swing" ? goal.feet.filter((side) => side !== swing!.foot) : goal.feet;
}

/**
 * The plan, one step on: where the centre of mass should be, moving critically damped toward the goal
 * across the ground and in height at each time constant, from where the stance began. The ground is
 * level, y up; the plan's y is the height over the soles. Returns the plan's acceleration.
 */
function advancePlan(s: Stance, goal: StanceGoal, stance: readonly FootState[], swing: SwingGoal | null, bearer: FootState | undefined,
  pendulum: number, dt: number): [number, number, number] {
  const { plan, reading } = s.state, { seconds } = s.tuning;
  const r = plan.at, u = plan.velocity;
  const [ax, az] = planAcross(s, goal, stance, swing, bearer, pendulum, dt);
  // Where the ceiling and a floor disagree, the ankle's stop is the harder limit.
  const limits = heightLimits(s, goal, stance, swing, pendulum);
  rollFeet(s, stance, swing, limits.floors, limits.high);
  let low = -Infinity;
  for (const [foot, floor] of limits.floors) if (!foot.memory.rolled) low = Math.max(low, floor);
  const high = Math.max(limits.high, low), k = 1 / seconds.height;
  const ay = k * k * (high - r.y) - 2 * k * u.y;
  u.addInPlaceFromFloats(ax * dt, ay * dt, az * dt);
  r.addInPlace(u.scale(dt));
  reading.plan.copyFrom(r);
  reading.planVelocity.copyFrom(u);
  return [ax, ay, az];
}

/**
 * The root's aims. Its angular acceleration: toward upright at `heading`, critically damped at the
 * turn's constant (`spin` is the error's angle over it). The centre of mass's: the plan's (`planned`),
 * its errors from the plan taken up critically damped at the rate `e`, one over `STANCE_TRACK`.
 * `height` is the centre of mass's over the stance soles.
 */
function aimRoot(s: Stance, heading: number, planned: readonly [number, number, number], height: number, e: number): void {
  const { pelvis } = s, { aim, plan, reading } = s.state, { seconds } = s.tuning, { spin, pelvisSpin } = s.scratch;
  const r = plan.at, u = plan.velocity, c = reading.centre, vel = reading.velocity, [ax, ay, az] = planned;
  pelvisTurn(s, heading);
  pelvis.body.angularVelocityToRef(pelvisSpin);
  const q = 1 / seconds.turn;
  aim.spin.copyFrom(spin).scaleInPlace(q).subtractInPlace(pelvisSpin.scaleInPlace(2 * q));
  aim.centre.set(ax + e * e * (r.x - c.x) + 2 * e * (u.x - vel.x), ay + e * e * (r.y - height) + 2 * e * (u.y - vel.y),
    az + e * e * (r.z - c.z) + 2 * e * (u.z - vel.z));
  aim.on = true;
}

/** Each of `stance`'s feet held still where it bears, what motion it has damped out at the rate `e`. */
function holdStance(s: Stance, stance: readonly FootState[], e: number): void {
  const { feet } = s, { tasks } = s.state;
  for (const foot of stance) {
    const task = tasks[feet.indexOf(foot)]!;
    footMotionToRef(foot, foot.memory.rolled ? foot.edge : foot.middle, task.linear, task.angular);
    task.linear.scaleInPlace(-e);
    task.angular.scaleInPlace(-e);
    task.on = true;
    task.bearing = true;
    for (const i of foot.memory.channels) s.state.owned[i] = 1;
  }
}

export function stanceControl(built: BuiltBody, tuning: StanceTuning = {}): StanceControl {
  const s = makeStance(built, tuning);
  return {
    get owned() { return s.state.owned; },
    reading: s.state.reading,
    carry(muscles, work) {
      const { feet } = s, { aim, held, tasks, reading, step } = s.state, { bend, spare, gait, seconds, soleMargin } = s.tuning;
      const { idScratch, shares, missed } = s.scratch;
      if (!aim.on) return null;
      const dynamics = muscles.dynamics, R = dynamics.root, p0 = R.centre, n = muscles.channels.length;
      const { lin, ang, at } = idScratch, a = aim.spin;
      // Each leg's freedoms' accelerations are y0 - Y a_root: its foot's asked motion, less its
      // drift and what the root's motion gives it, through the leg.
      const legs: { foot: FootState; task: FootTask; y0: number[]; Y: number[][] }[] = [];
      const inLeg = new Uint8Array(n);
      feet.forEach((foot, f) => {
        const task = tasks[f]!;
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
        // the knee further, into its stop. That knee is asked back toward `STANCE_KNEE_BEND`,
        // critically damped at the height's constant, ahead of the foot's task, and the leg's other
        // freedoms take the task (`fixedSolve`).
        const fixed = new Array<number>(foot.memory.channels.length).fill(NaN);
        if (bend !== null) {
          const k = foot.chain[0]!.dofs.length, i = foot.memory.channels[k]!, flexed = muscles.angle(i) - foot.straight, m = 1 / seconds.height;
          if (flexed < 0) fixed[k] = m * m * (bend - flexed) - 2 * m * muscles.rate(i);
        }
        let rows: readonly (readonly number[])[] = J, y: readonly number[] = k0, Bs: readonly (readonly number[])[] = B;
        if (task.bearing && foot.memory.rolled && spare !== null) {
          // Rolled, the foot's turn about its front edge is free and the ankle is held at its stop
          // less the spare, critically damped at the height's constant: the leg pivots on the edge.
          const e = foot.edgeAxis, w = Vector3.Cross(e, Vector3.UpReadOnly);
          const keep = (m: readonly (readonly number[])[]) => [
            m[0]!.map((_, c) => w.x * m[0]![c]! + w.y * m[1]![c]! + w.z * m[2]![c]!), m[1]!, m[3]!, m[4]!, m[5]!];
          rows = keep(J);
          Bs = keep(B);
          y = [w.x * k0[0]! + w.y * k0[1]! + w.z * k0[2]!, k0[1]!, k0[3]!, k0[4]!, k0[5]!];
          const pre = step.swing;
          if (gait.preswing !== undefined && reading.phase === "shift" && pre?.transfer && pre.foot === foot.side) {
            const k = foot.chain[0]!.dofs.length, i = foot.memory.channels[k]!, m = 1 / gait.preswing.seconds;
            fixed[k] = m * m * (gait.preswing.knee - (muscles.angle(i) - foot.straight)) - 2 * m * muscles.rate(i);
          } else {
            const k = foot.chain[0]!.dofs.length + foot.chain[1]!.dofs.length, i = foot.memory.channels[k]!, m = 1 / seconds.height;
            fixed[k] = m * m * (foot.chain[2]!.dofs[0]!.spec.max.value - spare - muscles.angle(i)) - 2 * m * muscles.rate(i);
          }
        }
        const y0 = fixedSolve(rows, y, fixed, LEG_DAMPING), still = fixed.map((v) => Number.isNaN(v) ? NaN : 0);
        const columns = [0, 1, 2, 3, 4, 5].map((c) => fixedSolve(rows, Bs.map((row) => row[c]!), still, LEG_DAMPING));
        legs.push({ foot, task, y0, Y: [0, 1, 2, 3, 4, 5].map((row) => columns.map((col) => col[row]!)) });
        for (const i of foot.memory.channels) inLeg[i] = 1;
      });
      // The root's rows as the root accelerates: W = P a_root + w0, the wrench the ground gives about
      // the root's centre, the other freedoms at the servo's asks.
      const P = [0, 1, 2, 3, 4, 5].map((r) => [0, 1, 2, 3, 4, 5].map((c) => R.mass[r]![c]!));
      const w0 = [0, 1, 2, 3, 4, 5].map((r) => R.bias[r]! - R.gravity[r]!);
      for (const { foot, y0, Y } of legs) foot.memory.channels.forEach((i, k) => {
        for (let r = 0; r < 6; r++) {
          const C = R.coupling[r]![i]!;
          w0[r] = w0[r]! + C * y0[k]!;
          for (let c = 0; c < 6; c++) P[r]![c] = P[r]![c]! - C * Y[k]![c]!;
        }
      });
      // The freedoms held at a torque (`ServoWork.fixed` outside the legs: a strike's pushes) move as
      // that torque moves them, and the root's acceleration changes how: from M_FF q''_F = torque_F -
      // bias_F + gravity_F - C_F' a_root - M_F,rest q''_rest, q''_F = z0 + Z a_root. Taken as at
      // rest, a strike's arm and trunk would be carried by a ground that gave the whole body their
      // momentum.
      const { mass, gravity: weight, bias } = dynamics;
      const F: number[] = [];
      for (let i = 0; i < n; i++) if (work.fixed[i] && !inLeg[i]) F.push(i);
      held.channels = F;
      if (F.length) {
        const legOf = new Map<number, { y0: number; Y: readonly number[] }>();
        for (const { foot, y0, Y } of legs) foot.memory.channels.forEach((i, k) => legOf.set(i, { y0: y0[k]!, Y: Y[k]! }));
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
          GROUND_FRICTION, leverOf(s, p0[1]), shares, missed);
        if (missed.force.lengthSquared() + missed.moment.lengthSquared() > 1e-12) {
          const given = [W[0]! + missed.moment.x, W[1]! + missed.moment.y, W[2]! + missed.moment.z, W[3]! + missed.force.x, W[4]! + missed.force.y, W[5]! + missed.force.z];
          root.set(solveLinear(P, given.map((v, r) => v - w0[r]!)));
        }
      }
      for (const { task, y0, Y } of legs) for (let k = 0; k < 6; k++) task.accel[k] = y0[k]! - Y[k]!.reduce((sum, v, c) => sum + v * root[c]!, 0);
      return root;
    },
    bear(muscles, work) {
      const { feet } = s, { aim, held, tasks } = s.state, { boundedSwing, soleMargin } = s.tuning, { idScratch, shares, missed } = s.scratch;
      if (!aim.on) return;
      const dynamics = muscles.dynamics, R = dynamics.root, n = muscles.channels.length, root = aim.root;
      // Every freedom's acceleration: the legs' from their tasks, the rest as the servo solved them.
      const accel = work.accel;
      feet.forEach((foot, f) => { if (tasks[f]!.on) foot.memory.channels.forEach((i, k) => { accel[i] = tasks[f]!.accel[k]!; }); });
      // The freedoms held at a torque, as the plan has them move at this root.
      held.channels.forEach((i, k) => { accel[i] = held.z0[k]! + held.Z[k]!.reduce((sum, v, c) => sum + v * root[c]!, 0); });
      const { mass, gravity: weight, bias } = dynamics;
      // A swinging leg's accelerations are the nearest to its task that its muscles can give, all its
      // freedoms at once (`boundedLeastSquares`): clipped one at a time, a hip at its strength leaves
      // the knee's torque asking for thigh motion it does not get, and the knee drives the foot into
      // the ground. A hip turning faster than its muscles shorten has no strength that way at all.
      // Few swings ask past strength, but those decide a walk.
      // Measured: `docs/reference/stance-tuning.md#bounded-swing`.
      feet.forEach((foot, f) => {
        const task = tasks[f]!;
        if (!boundedSwing || !task.on || task.bearing) return;
        const channels = foot.memory.channels;
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
      const bearing = feet.filter((_, f) => tasks[f]!.on && tasks[f]!.bearing);
      const { force, moment } = idScratch;
      if (bearing.length) {
        force.set(W[3]!, W[4]!, W[5]!);
        moment.set(W[0]!, W[1]!, W[2]!);
        const soles = bearing.map((foot) => bearingSole(foot, 1 - soleMargin));
        const at = idScratch.at.set(R.centre[0], R.centre[1], R.centre[2]);
        shareGroundWrench(soles, at, force, moment, GROUND_FRICTION, leverOf(s, at.y), shares, missed);
      }
      feet.forEach((foot, f) => {
        const task = tasks[f]!;
        if (!task.on) return;
        const share = task.bearing ? shares[bearing.indexOf(foot)]! : null;
        foot.memory.channels.forEach((i) => {
          let torque = bias[i]! - weight[i]!;
          for (let r = 0; r < 6; r++) torque += R.coupling[r]![i]! * root[r]!;
          for (let j = 0; j < n; j++) torque += mass[i]![j]! * accel[j]!;
          if (share) {
            // Less the ground's wrench on the foot, carried along the freedom's motion.
            const m = dynamics.axis(i), p = dynamics.pivot(i), x = foot.memory.rolled ? foot.edge : foot.middle;
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
      const { feet, segments, total } = s, { reading } = s.state, { p, v } = s.scratch;
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
      const on = which ?? s.state.last;
      readSupport(feet, on ? feet.filter((foot) => on.includes(foot.side)) : feet, reading.support);
    },
    command(muscles, goal, dt) {
      const { feet, state } = s, { reading, plan } = state;
      bindChannels(s, muscles);
      state.owned.fill(0);
      state.aim.on = false;
      for (const task of state.tasks) task.on = false;
      paceToward(s, stepsOfItself(goal) ? goal.walk : null, dt);
      const swing = chooseStep(s, goal);
      const bearing = bearerOf(goal, reading.phase, swing);
      if (!goal || !state.last || bearing.length !== state.last.length || bearing.some((side) => !state.last!.includes(side))) {
        plan.on = false;
      }
      state.last = goal ? bearing : null;
      const stance = feet.filter((foot) => bearing.includes(foot.side));
      if (!goal || stance.length === 0) return;
      readSupport(feet, stance, reading.support);
      const c = reading.centre, vel = reading.velocity, g = gravityOf(s);
      const height = c.y - reading.support.y;
      if (!plan.on) {
        plan.at.set(c.x, height, c.z);
        plan.velocity.copyFrom(vel);
        plan.on = true;
      }
      // The pendulum is the plan's as this step finds it, before the plan goes on.
      const pendulum = g / Math.max(plan.at.y, 1e-3);
      const bearer = swing ? stance.find((foot) => foot.side !== swing.foot) : undefined;
      const planned = advancePlan(s, goal, stance, swing, bearer, pendulum, dt);
      shiftWeight(s, swing, bearer, height, dt);
      const e = 1 / s.tuning.track;
      aimRoot(s, goal.heading, planned, height, e);
      holdStance(s, stance, e);
      if (reading.phase === "swing" && swing) swingFoot(s, swing, goal.heading, dt);
    },
  };
}

/** Whether two swings are the same step. */
function sameSwing(a: SwingGoal, b: SwingGoal | null): boolean {
  return b !== null && a.foot === b.foot && a.to[0] === b.to[0] && a.to[1] === b.to[1] && a.seconds === b.seconds
    && a.lift === b.lift && (a.shift ?? true) === (b.shift ?? true);
}
