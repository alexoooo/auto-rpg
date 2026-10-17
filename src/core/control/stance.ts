import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Vec3 } from "../spec/quantity.ts";
import type { BuiltBody } from "../build/build-body.ts";
import { channelName, type MuscleDriver } from "../muscle/driver.ts";
import type { Assist } from "./assist.ts";
import type { ServoWork } from "./servo.ts";
import { bearLimbs, carryRoot, limbMotion, makeBearing, type Bearing, type Limb } from "./bearing.ts";
import { patchPlace } from "./contact-wrench.ts";
import type { WholeBodyAsk } from "./solve.ts";
import { rotationAtToRef } from "./kinematics.ts";
import type { StanceTuning } from "./stance-tuning.ts";
import { catchStep, ownStep, paceToward } from "./gait.ts";
import { gravityOf, makeStance, type Stance } from "./stance-state.ts";
import {
  bearingOf, bearingSole, groundContact, massCentreToRef, motionAtToRef, pointOfToRef, landingHeading, readSupport, rolledRows, soleMiddleToRef, turnOfToRef,
  withinSupport, type FootState,
} from "./support.ts";
import { sin, cos, atan2, exp, sinh, cosh, hypot } from "../math/real.ts";
import type { Side } from "../spec/body.ts";
import { spinBetweenToRef, turnAboutToRef, turnBetweenToRef } from "../math/turn.ts";
import { approachToRef, turnToRef } from "./approach.ts";

/**
 * **What a stance is asked for**: which feet bear the body, where its centre of mass goes, and which
 * way its pelvis faces.
 */
export interface StanceGoal {
  /** The feet bearing weight; the other leg is left to the posture. */
  readonly feet: readonly Side[];
  /** The centre of mass's place over the ground, world (x, z), m; null for the middle of the stance feet. */
  readonly centre: readonly [number, number] | null;
  /** The centre of mass's height over the stance feet's soles, m. */
  readonly height: number;
  /** The pelvis's heading, rad about the world's up: 0 faces it as in the reference pose. */
  readonly heading: number;
  /** A supported root pitch, rad, and response time, s; the bearing feet stay planted and no step is requested. */
  readonly pose?: { readonly pitch: number; readonly seconds: number;
    /** Captured bearing soles, world position and rotation since reference; errors are corrected through muscles. */
    readonly anchors?: Readonly<Partial<Record<Side, { readonly position: Vec3; readonly rotation: readonly [number, number, number, number] }>>> };
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
  readonly foot: Side;
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
  /**
   * Whether this swing goes on with the step under way, of the same foot: its landing, its time and
   * its capture point re-aimed, its path still from where the foot lifted and its clock running on.
   * None, and a swing unlike the last starts a step afresh. A walk that plans its own steps re-aims
   * them so as the body goes (`src/core/skills/stride.ts`).
   */
  readonly follows?: boolean;
  /**
   * The constant the swing's foot takes up its errors from its path at, s, critically damped; none,
   * the stance's (`StanceTuning.seconds.swing`). A shorter one lands a fast step nearer its place.
   */
  readonly settle?: number;
  /**
   * Whether the swing ends as its sole meets the ground (`LANDS_FROM`): one that meets it early ends
   * there, and one still off the ground at its time goes on down past its place's height
   * (`LATE_DESCENT`) until it meets it, or for `LATE_MOST`. None, it ends on its time.
   */
  readonly lands?: boolean;
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
   * `share` of what it can give that way (`MuscleDriver.strength`), from `lead` s before the step
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
  /**
   * A run's step: the bearing foot leaves the ground at this upward speed, m/s, a flight's time
   * (twice it over gravity) before `seconds` is up, and nothing bears until the swinging foot lands
   * (`lands`, which a run's step asks). Through the bearing, the plan's height bounces as a
   * spring-mass leg's does (Blickhan 1989, "The spring-mass model for running and hopping", J
   * Biomech): down at that speed as the foot lands, and up at it as it leaves.
   */
  readonly flight?: number;
}

/** The share of a swing's time from which the ground meeting its sole ends it (`SwingGoal.lands`): before it, the foot is still leaving the ground. */
const LANDS_FROM = 0.8;

/** How far down the ground's normal at a sole is, as the cosine from up, for its meeting to land the swing: the floor, not a wall. */
const LANDED_NORMAL = 0.5;

/** Whether the ground pushed on `foot` in the last step, from below (`LANDED_NORMAL`). */
const soleOnGround = (s: Stance, foot: FootState): boolean =>
  s.built.physics.contactsOf(foot.segment.body, (other) => other === null).some((c) => groundContact(c, LANDED_NORMAL));

/** How fast a late foot goes on down past its place's height, m/s, and for how long at most, s (`SwingGoal.lands`). */
const LATE_DESCENT = 0.3, LATE_MOST = 0.1;

/**
 * Where a stance is: standing (no step, or its foot landed), shifting its weight before a step,
 * swinging the step's foot, or in a run's flight, no foot bearing (`SwingGoal.flight`).
 */
export type StancePhase = "stand" | "shift" | "swing" | "flight";

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
 * (`BodyDynamics.root`): the bearing solve's work (`bearing.ts`), with the stance's legs its limbs
 * and their soles its patches (`aimLimb`). The root's six rows say what wrench the ground must give for the body's
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
 * A torque past a muscle's strength is not given, and a body asked for more than its feet can take
 * tips or falls. With an assist (`Assist`) the root may be given what the soles miss, up to the
 * fight's ceiling; with none, nothing holds the body up that the legs' muscles do not.
 */
export interface StanceControl {
  /**
   * Read the body: its centre of mass and velocity, and the soles of `feet` (the last command's
   * stance feet, or both). A body reads this before its driver decides, so the driver's view is
   * this step's; `command` uses it.
   */
  read(feet?: readonly Side[]): void;
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
  /**
   * The last command's asks as the whole-body solve takes them (`solveBody`, `solve.ts`), in place
   * of `carry` and `bear`: the root's aims, each driven leg's task at its point, and the records
   * the solve leaves what it finds in; null if the stance asks nothing.
   */
  ask(driver: MuscleDriver): WholeBodyAsk | null;
  /** The push-off as a torque (`SwingGoal.launch`), written over the solve's command once it has run. */
  launch(driver: MuscleDriver): void;
  /**
   * Forget the stance under way: nothing is driven or asked, no step is being taken, and the next
   * command begins from the body as it is. The steps counted stay.
   */
  reset(): void;
  /** Each channel the last command drove, 1, or 0. */
  readonly owned: Uint8Array;
  /** What the last reading and command found and asked. */
  readonly reading: StanceReading;
  /** Its memory, whole (`StanceState`, `src/core/state.ts`). */
  readonly state: object;
}

export interface StanceReading {
  /** The centre of mass and its velocity, world. */
  readonly centre: Vector3;
  readonly velocity: Vector3;
  /** The middle of the stance feet's soles, world; with no stance, of both feet. */
  readonly support: Vector3;
  /** The way the pelvis faces, rad about up, as a heading is counted: 0 as in the reference pose, growing to the right. */
  readonly facing: number;
  /** Each sole's middle, world. */
  readonly soles: Readonly<Record<Side, Vector3>>;
  /**
   * Whether the ground bore each foot in the last step: a contact with a fixed collider that pushed,
   * its normal within `LANDED_NORMAL` of up, as a swing that lands on contact reads it.
   */
  readonly touching: Readonly<Record<Side, boolean>>;
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
   * What the last command asked of the ground and the bearing soles could not give
   * (`shareGroundWrench`): a force, and a moment about the root's centre of mass, world, N and N m.
   * None with no stance, or no sole bearing. The root was asked for the motion that the wrench
   * the soles can give makes, with whatever of this the assist supplies (`Assist`).
   */
  readonly shortfall: { readonly force: Vector3; readonly moment: Vector3 };
  /**
   * The ground's wrench the last command's leg torques count on at each sole (`shareGroundWrench`):
   * a force at the place the sole bears (`at`: its middle, or its front edge's when rolled) and a
   * moment about it, world, m, N and N m; zero for a foot that does not bear.
   */
  readonly asked: Readonly<Record<Side, { readonly at: Vector3; readonly force: Vector3; readonly moment: Vector3 }>>;
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
    const w = Math.sqrt(pendulum), grow = exp(w * Math.max(swing!.seconds - step.time, dt));
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
    const w = Math.sqrt(pendulum), grow = exp(w * Math.max(swing!.transfer - step.held, dt));
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
    const w = Math.sqrt(pendulum), left = Math.max(swing!.seconds - step.time, 0), ch = cosh(w * left), sh = sinh(w * left);
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
    if (bend !== null && !s.state.pose) {
      const long = Math.sqrt(a * a + b * b + 2 * a * b * cos(bend)), spread = hypot(hx - ankleAt.x, hz - ankleAt.z);
      high = Math.min(high, ankleAt.y + Math.sqrt(Math.max(0, long * long - spread * spread)) + rise);
    }
    if (spare !== null) {
      // The shank's turn is the foot's with the ankle's own undone (rel = D_shank^-1 D_foot).
      const dorsiflexion = ankle!.dofs[0]!.spec;
      rotationAtToRef(ankle!, [dorsiflexion.max.value - spare, 0], shank);
      turnOfToRef(foot.segment, footTurn).multiplyToRef(Quaternion.InverseToRef(shank, shank), shank);
      const k = knee!.spec.centre.value, o = ankle!.spec.centre.value;
      kneeAt.set(k[0] - o[0], k[1] - o[1], k[2] - o[2]).applyRotationQuaternionToRef(shank, kneeAt).addInPlace(ankleAt);
      const spread = hypot(hx - kneeAt.x, hz - kneeAt.z);
      if (spread < a) floors.push([foot, kneeAt.y + Math.sqrt(a * a - spread * spread) + rise]);
    }
  }
  return { high, floors };
}

/**
 * Which feet bear on their front edges. A walk's bearing foot (the stance's own walk's, or a goal's
 * step's with a double support, `SwingGoal.transfer`) whose ankle's floor is over the knees'
 * ceiling (`high`) on one foot rolls onto its front edge instead (Perry 1992, "Gait
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
    if (heelOff && (s.state.striding || swing?.transfer !== undefined && swing !== reading.own) && past && !foot.memory.rolled && floor > high && reading.phase === "swing") foot.memory.rolled = true;
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
    // The height's floor, 1 mm, is a numeric setting.
    const w = Math.sqrt(g / Math.max(height, 1e-3)), cx = c.x + vel.x / w, cz = c.z + vel.z / w;
    const [hx, hz] = withinSupport([bearer!], cx, cz, inset);
    if (hx === cx && hz === cz) reading.phase = "swing";
  }
}

/**
 * The swing: `swing`'s foot's sole carried along its path, its turn carried from the one it left
 * the ground with to flat and facing `heading` as it lands; the step ends as it lands.
 */
function swingFoot(s: Stance, swing: SwingGoal, heading: number, dt: number): void {
  const { feet } = s, { step, tasks, reading } = s.state, { seconds } = s.tuning;
  const { sole, level, path, along, turn, wholeAxis, progress, v } = s.scratch;
  const foot = feet.find((f) => f.side === swing.foot)!;
  soleMiddleToRef(foot, sole);
  const met = swing.lands === true && step.lifted && step.time + dt >= LANDS_FROM * swing.seconds && soleOnGround(s, foot);
  if (!step.lifted) {
    step.lifted = true;
    step.time = 0;
    step.from.copyFrom(sole);
    step.lift.copyFrom(foot.segment.node.rotationQuaternion!);
    motionAtToRef(foot.segment, sole, step.launch, v);
  }
  // It lands flat, facing the heading: its reference-pose turn, turned about up by the heading.
  // (Held at the turn it left with, a foot's yaw drifts step by step.)
  turnAboutToRef(Vector3.UpReadOnly, heading, level);
  level.multiplyInPlace(foot.segment.rest);
  step.time += dt;
  if (swing.flight !== undefined && reading.phase === "swing" && step.time >= swing.seconds - 2 * swing.flight / gravityOf(s)) {
    reading.phase = "flight";
    s.state.flight.left.copyFrom(reading.centre);
  }
  const tau = Math.min(1, step.time / swing.seconds), from = step.from;
  // Past its time, a foot that lands goes on down until it meets the ground.
  const late = swing.lands === true ? Math.min(Math.max(step.time - swing.seconds, 0), LATE_MOST) : 0;
  // Across the ground by its progress, a lift as smooth as minimum jerk up and down.
  swingProgressToRef(tau, swing.ramp, progress);
  const eased = progress.x, ds = progress.y / swing.seconds;
  const bump = 16 * tau * tau * (1 - tau) * (1 - tau), dbump = 32 * tau * (1 - tau) * (1 - 2 * tau) / swing.seconds - (late > 0 ? LATE_DESCENT / swing.lift : 0);
  path.set(from.x + (swing.to[0] - from.x) * eased, from.y + swing.lift * bump - LATE_DESCENT * late, from.z + (swing.to[1] - from.z) * eased);
  // Going on from the launch: the quintic that starts at a unit rate and is at rest at both ends,
  // h = tau - 6 tau^3 + 8 tau^4 - 3 tau^5, times the launch's velocity over the swing's time.
  const T = swing.seconds, launch = swing.momentum === true && tau < 1 ? step.launch : null;
  const h = tau - 6 * tau * tau * tau + 8 * tau * tau * tau * tau - 3 * tau * tau * tau * tau * tau;
  const dh = 1 - 18 * tau * tau + 32 * tau * tau * tau - 15 * tau * tau * tau * tau, ddh = -36 * tau + 96 * tau * tau - 60 * tau * tau * tau;
  if (launch) path.addInPlaceFromFloats(launch.x * T * h, launch.y * T * h, launch.z * T * h);
  turnBetweenToRef(step.lift, level, eased, step.turn);
  along.set((swing.to[0] - from.x) * ds, swing.lift * dbump, (swing.to[1] - from.z) * ds);
  if (launch) along.addInPlaceFromFloats(launch.x * dh, launch.y * dh, launch.z * dh);
  const settle = swing.settle ?? seconds.swing;
  spinBetweenToRef(foot.segment.node.rotationQuaternion!, step.turn, settle, turn);
  // The whole turn from lift to landing, world, as its axis times its angle: the path's turn goes
  // about its axis at its angle times the path's rate.
  spinBetweenToRef(step.lift, level, 1, wholeAxis);
  // The path's acceleration, and its errors in place and speed taken up critically damped at the
  // swing's constant; its turn's likewise, with the turn's own rate and acceleration: damping
  // alone lags a turn by twice its rate times the swing's constant, and a foot turning over a
  // swing lands off the heading (`tests/core-stance.test.mjs`).
  const task = tasks[feet.indexOf(foot)]!, w = 1 / settle;
  const dds = progress.z / (T * T), ddbump = tau < 1 ? 32 * (1 - 6 * tau + 6 * tau * tau) / (T * T) : 0, kick = launch ? ddh / T : 0;
  motionAtToRef(foot.segment, sole, task.linear, task.angular);
  task.linear.set((swing.to[0] - from.x) * dds + (launch ? launch.x * kick : 0) + w * w * (path.x - sole.x) + 2 * w * (along.x - task.linear.x),
    swing.lift * ddbump + (launch ? launch.y * kick : 0) + w * w * (path.y - sole.y) + 2 * w * (along.y - task.linear.y),
    (swing.to[1] - from.z) * dds + (launch ? launch.z * kick : 0) + w * w * (path.z - sole.z) + 2 * w * (along.z - task.linear.z));
  task.angular.scaleInPlace(-2 * w).addInPlace(turn.scale(w)).addInPlace(wholeAxis.scale(dds + 2 * w * ds));
  task.on = true;
  task.bearing = false;
  for (const i of foot.memory.channels) s.state.owned[i] = 1;
  if (swing.lands === true ? met || late >= LATE_MOST : tau >= 1) {
    reading.phase = "stand";
    reading.own = null;
    step.catching = false;
  }
}

/**
 * The plan's upward acceleration through a run step's bearing (`SwingGoal.flight`): a bounce's,
 * its height `height` - (f T / pi) sin(pi t / T) and its upward speed -f cos(pi t / T) over the
 * bearing's time T, down at the flight's speed f as the foot lands and up at it from `height` as
 * it leaves, its errors taken up critically damped at 2 pi / T, a whole bounce's rate.
 */
function bounce(s: Stance, swing: SwingGoal, height: number): number {
  const { step, plan } = s.state, f = swing.flight!, T = Math.max(swing.seconds - 2 * f / gravityOf(s), 1e-3);
  const tau = Math.min(step.time / T, 1), turn = Math.PI * tau, k = 2 * Math.PI / T;
  return f * Math.PI / T * sin(turn) + k * k * (height - f * T / Math.PI * sin(turn) - plan.at.y) + 2 * k * (-f * cos(turn) - plan.velocity.y);
}

/**
 * **A run's flight**: no foot bears, and the root goes as gravity and the legs' own motion have it
 * (`carryRoot` with no bearing limb). The swinging foot goes on along its path to its landing
 * (`swingFoot`), which ends the flight; the foot that left the ground is carried with the centre
 * of mass from where it left, lifted by the swing's lift over the flight's time and drawn in under
 * the hip by as much, at the swing's constant.
 */
function fly(s: Stance, goal: StanceGoal, swing: SwingGoal, dt: number): void {
  const { feet, state } = s, { reading, aim, tasks, flight } = state, { seconds } = s.tuning, { sole, v, p } = s.scratch;
  aim.spin.setAll(0);
  aim.centre.set(0, -gravityOf(s), 0);
  aim.on = true;
  const trailing = feet.find((f) => f.side !== swing.foot)!, task = tasks[feet.indexOf(trailing)]!;
  const w = 1 / (swing.settle ?? seconds.swing), c = reading.centre, up = Math.max(state.step.time - (swing.seconds - 2 * swing.flight! / gravityOf(s)), 0) * swing.flight!;
  soleMiddleToRef(trailing, sole);
  if (!flight.on) { flight.on = true; flight.from.copyFrom(sole).subtractInPlace(flight.left); }
  // Where it goes: its place from the centre of mass as it left, raised by the flight's rise so far.
  p.copyFrom(c).addInPlace(flight.from);
  p.y += Math.min(up, swing.lift);
  motionAtToRef(trailing.segment, sole, task.linear, task.angular);
  v.copyFrom(reading.velocity);
  task.linear.set(w * w * (p.x - sole.x) + 2 * w * (v.x - task.linear.x), -gravityOf(s) + w * w * (p.y - sole.y) + 2 * w * (v.y - task.linear.y),
    w * w * (p.z - sole.z) + 2 * w * (v.z - task.linear.z));
  task.angular.scaleInPlace(-w);
  task.on = true;
  task.bearing = false;
  for (const i of trailing.memory.channels) state.owned[i] = 1;
  swingFoot(s, swing, goal.heading, dt);
  if (reading.phase !== "flight") flight.on = false;
}

/**
 * **A swing's progress** at `tau`, its share of the swing's time, into `out`: x the share of the
 * way, y its rate per share of the time, z that rate's. With no `ramp`, minimum jerk, 10 tau^3 -
 * 15 tau^4 + 6 tau^5 (Flash and Hogan 1985), whose acceleration peaks at 5.77 times the way over
 * the time squared. With one, the acceleration rises over `ramp` of the time, holds, and falls
 * over as much by the half, then the same mirrored: its peak 4 / (1 - 2 ramp), the least a
 * way at rest at both ends can have as `ramp` goes to 0, for a sharper start and stop.
 */
export function swingProgressToRef(tau: number, ramp: number | undefined, out: Vector3): Vector3 {
  if (tau >= 1) return out.set(1, 0, 0);
  if (ramp === undefined) return out.set(tau * tau * tau * (10 - 15 * tau + 6 * tau * tau), 30 * tau * tau * (1 - tau) * (1 - tau), 60 * tau * (1 - tau) * (1 - 2 * tau));
  const q = ramp, flip = tau > 0.5, u = flip ? 1 - tau : tau, top = 4 / (1 - 2 * q);
  let share: number, rate: number, accel: number;
  if (u < q) {
    accel = top * u / q; rate = top * u * u / (2 * q); share = top * u * u * u / (6 * q);
  } else if (u <= 0.5 - q) {
    const d = u - q;
    accel = top; rate = top * q / 2 + top * d; share = top * q * q / 6 + top * q / 2 * d + top * d * d / 2;
  } else {
    const d = 0.5 - 2 * q, r = top * q / 2 + top * d, at = top * q * q / 6 + top * q / 2 * d + top * d * d / 2, e = u - (0.5 - q);
    accel = top * (1 - e / q); rate = r + top * e - top * e * e / (2 * q); share = at + r * e + top * e * e / 2 - top * e * e * e / (6 * q);
  }
  return flip ? out.set(1 - share, rate, -accel) : out.set(share, rate, accel);
}

/** Each foot's leg's channels, found once the driver's are known. */
function bindChannels(s: Stance, muscles: MuscleDriver): void {
  const { state } = s;
  if (state.owned.length === muscles.channels.length) return;
  state.owned = new Uint8Array(muscles.channels.length);
  for (const foot of s.feet) foot.memory.channels = foot.chain.flatMap((joint) => joint.dofs.map((_, k) => muscles.channel(channelName(joint, k))));
}

/** Whether `goal` leaves the stance to step of itself: it stands on both feet and asks for no step. */
function stepsOfItself(goal: StanceGoal | null): goal is StanceGoal {
  return !!goal && goal.feet.includes("left") && goal.feet.includes("right") && !goal.swing;
}

/**
 * The step this command takes: a catch of a push under way (`catchStep`), or the goal's, or the
 * stance's own (`ownStep`), or none. A swing unlike the last starts a step, at its weight shift or,
 * asked to, at its swing; one that follows the step under way re-aims it (`SwingGoal.follows`).
 */
function chooseStep(s: Stance, goal: StanceGoal | null): SwingGoal | null {
  const { state } = s, { reading, step } = state;
  if (!goal) step.catching = false;
  else if (!step.catching) step.catching = catchStep(s);
  // A catch runs to its landing.
  if (step.catching) {
    // Nothing else is chosen.
  } else if (stepsOfItself(goal)) ownStep(s, goal.heading);
  else {
    reading.own = null;
    state.stride = null;
    state.striding = null;
  }
  const swing = step.catching ? reading.own : goal?.swing ?? reading.own;
  if (!swing) {
    step.swing = null;
    reading.phase = "stand";
  } else if (swing.follows && step.swing && step.swing.foot === swing.foot && reading.phase !== "stand") {
    // The step under way, re-aimed.
    step.swing = swing;
  } else if (!sameSwing(swing, step.swing)) {
    step.swing = swing;
    step.lifted = false;
    step.held = 0;
    step.off = Infinity;
    reading.phase = swing.shift === false ? "swing" : "shift";
  }
  return swing;
}

/** The feet that bear the body: the goal's, but for a foot that is swinging. */
function bearerOf(goal: StanceGoal | null, phase: StancePhase, swing: SwingGoal | null): readonly Side[] {
  return !goal || phase === "flight" ? [] : phase === "swing" ? goal.feet.filter((side) => side !== swing!.foot) : goal.feet;
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
  const ay = reading.phase === "swing" && swing?.flight !== undefined ? bounce(s, swing, goal.height) : k * k * (high - r.y) - 2 * k * u.y;
  u.addInPlaceFromFloats(ax * dt, ay * dt, az * dt);
  r.addInPlace(u.scale(dt));
  reading.plan.copyFrom(r);
  reading.planVelocity.copyFrom(u);
  return [ax, ay, az];
}

/**
 * The root's aims. Its angular acceleration: toward upright at `heading`, critically damped at the
 * turn's constant (`turnToRef`). The centre of mass's: the plan's (`planned`),
 * its errors from the plan taken up critically damped at the rate `e`, one over `STANCE_TRACK`.
 * `height` is the centre of mass's over the stance soles.
 */
function aimRoot(s: Stance, heading: number, planned: readonly [number, number, number], height: number, e: number): void {
  const { pelvis } = s, { aim, plan, reading } = s.state, { seconds } = s.tuning, { target, pelvisSpin } = s.scratch;
  const r = plan.at, u = plan.velocity, c = reading.centre, vel = reading.velocity, [ax, ay, az] = planned;
  turnAboutToRef(Vector3.UpReadOnly, heading, target).multiplyInPlace(pelvis.rest);
  turnToRef(pelvis.node.rotationQuaternion!, target, seconds.turn, pelvis.body.angularVelocityToRef(pelvisSpin), aim.spin);
  aim.centre.set(ax + e * e * (r.x - c.x) + 2 * e * (u.x - vel.x), ay + e * e * (r.y - height) + 2 * e * (u.y - vel.y),
    az + e * e * (r.z - c.z) + 2 * e * (u.z - vel.z));
  aim.on = true;
}

/** Each of `stance`'s feet held still where it bears, what motion it has damped out at the rate `e`. */
function holdStance(s: Stance, stance: readonly FootState[], e: number): void {
  const { feet } = s, { tasks } = s.state;
  for (const foot of stance) {
    const task = tasks[feet.indexOf(foot)]!;
    motionAtToRef(foot.segment, foot.memory.rolled ? foot.edge : foot.middle, task.linear, task.angular);
    task.linear.scaleInPlace(-e);
    task.angular.scaleInPlace(-e);
    task.on = true;
    task.bearing = true;
    for (const i of foot.memory.channels) s.state.owned[i] = 1;
  }
}

/**
 * The lever a missed moment of the ground's wrench is weighed against a missed force at
 * (`shareGroundWrench`): the height of the root's centre, where the wrench is taken, over the
 * soles, at least a sole's half-length. A moment the soles miss is a force they miss at the
 * root's height. No fixed lever serves both humans better: `docs/reference/stance-tuning.md#wrench-lever`.
 * A swing may ask its own (`SwingGoal.lever`).
 */
function leverOf(s: Stance, height: number): number {
  const { reading, step } = s.state;
  if (reading.phase === "swing" && step.swing?.lever !== undefined) return step.swing.lever;
  return Math.max(s.feet[0]!.reach, height - s.state.reading.support.y);
}

/**
 * A driven leg's part of the solve, for this step (`Limb.work`): the point its task is asked at;
 * where it bears, its patch; and the leg's own asks ahead of the task. A knee past straight is
 * asked back toward the bend; a rolled foot's turn about its front edge is left free and its ankle
 * held short of its stop, or, in a walk's pre-swing, its knee bent.
 */
function aimLimb(s: Stance, foot: FootState, limb: Limb, muscles: MuscleDriver): void {
  const { reading, step } = s.state, { bend, spare, gait, seconds, soleMargin } = s.tuning, { task, work } = limb, { ahead } = work;
  // The point: bearing, where the foot bears, as last read; swinging, its sole's middle, now.
  if (task.bearing) work.at.copyFrom(foot.memory.rolled ? foot.edge : foot.middle);
  else soleMiddleToRef(foot, work.at);
  // A knee past straight is on the Jacobian's other branch, where the leg shortens by extending
  // the knee further, into its stop. That knee is asked back toward `STANCE_KNEE_BEND`,
  // critically damped at the height's constant, ahead of the foot's task, and the leg's other
  // freedoms take the task.
  ahead.length = foot.memory.channels.length;
  ahead.fill(NaN);
  if (bend !== null && !s.state.pose) {
    const k = foot.chain[0]!.dofs.length, i = foot.memory.channels[k]!, flexed = muscles.angle(i) - foot.straight, m = 1 / seconds.height;
    if (flexed < 0) ahead[k] = m * m * (bend - flexed) - 2 * m * muscles.rate(i);
  }
  work.rows = null;
  if (task.bearing && foot.memory.rolled && spare !== null) {
    // Rolled, the foot's turn about its front edge is free and the ankle is held at its stop
    // less the spare, critically damped at the height's constant: the leg pivots on the edge.
    // Of the spin's rows the task keeps the one about the level normal to the edge, and the one about up.
    work.rows = rolledRows(foot);
    const pre = step.swing;
    if (gait.preswing !== undefined && reading.phase === "shift" && pre?.transfer && pre.foot === foot.side) {
      const k = foot.chain[0]!.dofs.length, i = foot.memory.channels[k]!, m = 1 / gait.preswing.seconds;
      ahead[k] = m * m * (gait.preswing.knee - (muscles.angle(i) - foot.straight)) - 2 * m * muscles.rate(i);
      if (pre.push !== undefined) {
        const a = k + foot.chain[1]!.dofs.length, j = foot.memory.channels[a]!;
        ahead[a] = m * m * (-pre.push - muscles.angle(j)) - 2 * m * muscles.rate(j);
      }
    } else {
      const k = foot.chain[0]!.dofs.length + foot.chain[1]!.dofs.length, i = foot.memory.channels[k]!, m = 1 / seconds.height;
      ahead[k] = m * m * (foot.chain[2]!.dofs[0]!.spec.max.value - spare - muscles.angle(i)) - 2 * m * muscles.rate(i);
    }
  }
  work.patch = task.bearing ? bearingSole(foot, 1 - soleMargin) : null;
}

/**
 * The push-off as a torque (`SwingGoal.launch`): the ankle of the foot that lifts next -- the
 * bearing one late in a swing, the trailing one through a walk's double support -- given at least
 * the asked share of its plantarflexion's strength, where the stance drives its leg.
 */
function pushOff(s: Stance, muscles: MuscleDriver): void {
  const { reading, step, tasks } = s.state, swing = step.swing, launch = swing?.launch;
  if (!swing || !launch) return;
  const side = reading.phase === "shift" && swing.transfer ? swing.foot
    : reading.phase === "swing" && swing.seconds - step.time <= launch.lead ? (swing.foot === "left" ? "right" : "left") : null;
  const f = s.feet.findIndex((foot) => foot.side === side);
  if (f < 0 || !tasks[f]!.on || !tasks[f]!.bearing) return;
  const foot = s.feet[f]!, i = foot.memory.channels[foot.chain[0]!.dofs.length + foot.chain[1]!.dofs.length]!;
  // The ankle's first freedom is its dorsiflexion: plantarflexion pulls it the negative way.
  if (muscles.velocity[i]! < 0 && muscles.activation[i]! >= launch.share) return;
  muscles.velocity[i] = -Infinity;
  muscles.activation[i] = launch.share;
}

/** Nothing is driven and nothing asked: where every command begins, and what a reset leaves. */
function askNothing(s: Stance): void {
  const { state } = s, { reading } = state;
  state.owned.fill(0);
  state.aim.on = false;
  reading.shortfall.force.setAll(0);
  reading.shortfall.moment.setAll(0);
  for (const side of ["left", "right"] as const) {
    reading.asked[side].force.setAll(0);
    reading.asked[side].moment.setAll(0);
  }
  state.helped.force.setAll(0);
  state.helped.moment.setAll(0);
  for (const task of state.tasks) task.on = false;
}

export function stanceControl(built: BuiltBody, tuning: StanceTuning = {}, assist: Assist | null = null): StanceControl {
  const s = makeStance(built, tuning, assist);
  let poseBearing: Bearing | null = null;
  return {
    reset() {
      const { state } = s, { reading, step } = state;
      askNothing(s);
      // Sole damping averages consecutive stance torques; release breaks that sequence.
      for (const task of state.tasks) task.given.fill(NaN);
      state.plan.on = false;
      state.pose = null;
      state.last = null;
      state.stride = null;
      state.striding = null;
      state.pace[0] = 0;
      state.pace[1] = 0;
      step.swing = null;
      step.lifted = false;
      step.time = 0;
      step.held = 0;
      step.off = Infinity;
      step.catching = false;
      reading.phase = "stand";
      reading.own = null;
      for (const foot of s.feet) foot.memory.rolled = false;
    },
    get owned() { return s.state.owned; },
    reading: s.state.reading,
    state: s.state,
    carry(muscles, work) {
      const { aim } = s.state;
      if (!aim.on) return null;
      s.feet.forEach((foot, f) => { if (s.limbs[f]!.task.on) aimLimb(s, foot, s.limbs[f]!, muscles); });
      const bearing = s.state.pose ? poseBearing! : s.bearing;
      const root = carryRoot(bearing, muscles, work, aim, leverOf(s, muscles.dynamics.root.centre[1]));
      if (s.state.pose) limbMotion(bearing, work, s.state.owned);
      return root;
    },
    ask(muscles) {
      const { aim } = s.state;
      if (!aim.on) return null;
      s.feet.forEach((foot, f) => { if (s.limbs[f]!.task.on) aimLimb(s, foot, s.limbs[f]!, muscles); });
      s.ask.lever = leverOf(s, muscles.dynamics.root.centre[1]);
      return s.ask;
    },
    launch(muscles) {
      if (s.state.aim.on && !s.state.pose) pushOff(s, muscles);
    },
    bear(muscles, work) {
      if (!s.state.aim.on) return;
      const bearing = s.state.pose ? poseBearing! : s.bearing;
      bearLimbs(bearing, muscles, work, leverOf(s, muscles.dynamics.root.centre[1]), s.tuning.boundedSwing);
      // The bearing limbs' shares are in the limbs' order, which is the feet's.
      let k = 0;
      s.feet.forEach((foot, f) => {
        const asked = s.state.reading.asked[foot.side], task = s.limbs[f]!.task;
        if (task.on && task.bearing) {
          const share = bearing.scratch.shares[k++]!;
          asked.at.copyFrom(patchPlace(s.limbs[f]!.work.patch!));
          asked.force.copyFrom(share.force);
          asked.moment.copyFrom(share.moment);
        } else {
          asked.force.setAll(0);
          asked.moment.setAll(0);
        }
      });
      if (!s.state.pose) pushOff(s, muscles);
    },
    read(which) {
      const { feet, segments, total, pelvis } = s, { reading } = s.state, { p, whole } = s.scratch;
      massCentreToRef(segments, total, reading.centre, p, reading.velocity);
      // The reference pose faces +z: its forward, turned as the pelvis has turned since.
      p.set(0, 0, 1).applyRotationQuaternionToRef(turnOfToRef(pelvis, whole), p);
      reading.facing = atan2(p.x, p.z);
      const on = which ?? s.state.last;
      readSupport(feet, on ? feet.filter((foot) => on.includes(foot.side)) : feet, reading.support);
      for (const foot of feet) reading.touching[foot.side] = soleOnGround(s, foot);
    },
    command(muscles, goal, dt) {
      const { feet, state } = s, { reading, plan } = state;
      bindChannels(s, muscles);
      askNothing(s);
      state.pose = goal?.pose ?? null;
      if (goal?.pose) {
        if (!Number.isFinite(goal.pose.pitch) || !(goal.pose.seconds > 0) || !Number.isFinite(goal.pose.seconds)
          || goal.feet.length < 1 || goal.feet.length > 2 || (goal.feet.length === 2 && goal.feet[0] === goal.feet[1])
          || goal.feet.some(side => side !== "left" && side !== "right") || goal.swing || goal.walk)
          throw new Error("a supported root pose requires a finite pitch, positive response and one or two planted feet");
        if (goal.pose.anchors) for (const [side, anchor] of Object.entries(goal.pose.anchors))
          if (!goal.feet.includes(side as Side) || !anchor || anchor.position.length !== 3 || anchor.rotation.length !== 4 || !anchor.position.every(Number.isFinite)
            || !anchor.rotation.every(Number.isFinite) || Math.abs(anchor.rotation.reduce((sum, v) => sum + v * v, 0) - 1) > 1e-8)
            throw new Error("a supported sole anchor requires a bearing foot, finite position and unit rotation");
        // Channel binding precedes allocation: effort rows are sized from the bound limb channels.
        poseBearing ??= makeBearing(assist, s.limbs, { root: state.aim.root, helped: state.helped, held: state.held, shortfall: reading.shortfall }, { effort: true });
        holdPose(s, goal, goal.pose);
        return;
      }
      paceToward(s, stepsOfItself(goal) ? goal.walk : null, dt);
      const swing = chooseStep(s, goal);
      const bearing = bearerOf(goal, reading.phase, swing);
      if (!goal || !state.last || bearing.length !== state.last.length || bearing.some((side) => !state.last!.includes(side))) {
        plan.on = false;
      }
      state.last = goal ? bearing : null;
      if (goal && swing && reading.phase === "flight") { fly(s, goal, swing, dt); return; }
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
      // The pendulum is the plan's as this step finds it, before the plan goes on. Its height's
      // floor, 1 mm, is a numeric setting.
      const pendulum = g / Math.max(plan.at.y, 1e-3);
      const bearer = swing ? stance.find((foot) => foot.side !== swing.foot) : undefined;
      const planned = advancePlan(s, goal, stance, swing, bearer, pendulum, dt);
      shiftWeight(s, swing, bearer, height, dt);
      const e = 1 / s.tuning.track;
      aimRoot(s, goal.heading, planned, height, e);
      holdStance(s, stance, e);
      // A step lands facing the heading as far as the bearing foot's hip lets the pelvis turn over it
      // (`landingHeading`): a turn past that is taken step by step.
      if (reading.phase === "swing" && swing) swingFoot(s, swing, bearer ? landingHeading(bearer, goal.heading) : goal.heading, dt);
    },
  };
}

/** A planted-foot root pose, followed at its own response rather than by the walking pendulum. */
function holdPose(s: Stance, goal: StanceGoal, pose: NonNullable<StanceGoal["pose"]>): void {
  const { state, feet, pelvis } = s, { reading, aim } = state, n = 1 / pose.seconds;
  const bearing = goal.feet.length === feet.length ? feet : feet.filter(foot => goal.feet.includes(foot.side));
  readSupport(feet, bearing, reading.support);
  reading.phase = "stand"; reading.own = null; state.plan.on = false; state.last = goal.feet;
  state.step.swing = null; state.step.catching = false; state.stride = null; state.striding = null; state.pace.fill(0);
  const c = reading.centre, v = reading.velocity, p = reading.support;
  const [x, z] = goal.centre ? withinSupport(bearing.map(bearingOf), goal.centre[0], goal.centre[1], s.tuning.inset) : [p.x, p.z];
  approachToRef(s.scratch.p.set(x, p.y + goal.height, z), c, v, n, aim.centre);
  turnAboutToRef(Vector3.UpReadOnly, goal.heading, s.scratch.target);
  turnAboutToRef(s.scratch.wholeAxis.set(1, 0, 0), pose.pitch, s.scratch.footTurn);
  s.scratch.target.multiplyInPlace(s.scratch.footTurn).multiplyInPlace(pelvis.rest);
  turnToRef(pelvis.node.rotationQuaternion!, s.scratch.target, pose.seconds, pelvis.body.angularVelocityToRef(s.scratch.pelvisSpin), aim.spin);
  aim.on = true;
  for (const foot of bearing) {
    foot.memory.rolled = false;
    const task = state.tasks[feet.indexOf(foot)]!;
    motionAtToRef(foot.segment, foot.middle, task.linear, task.angular);
    const vy = task.linear.y;
    task.linear.scaleInPlace(-n); task.linear.y = n * n * (p.y - foot.middle.y) - 2 * n * vy;
    task.angular.scaleInPlace(-n);
    const anchor = pose.anchors?.[foot.side];
    if (anchor) {
      motionAtToRef(foot.segment, foot.middle, s.scratch.v, s.scratch.pelvisSpin);
      approachToRef(s.scratch.p.set(...anchor.position), foot.middle, s.scratch.v, n, task.linear);
      s.scratch.target.set(...anchor.rotation).multiplyInPlace(foot.segment.rest);
      turnToRef(foot.segment.node.rotationQuaternion!, s.scratch.target, pose.seconds, s.scratch.pelvisSpin, task.angular);
    }
    task.on = true; task.bearing = true;
    for (const i of foot.memory.channels) state.owned[i] = 1;
  }
}

/** Whether two swings are the same step. */
function sameSwing(a: SwingGoal, b: SwingGoal | null): boolean {
  return b !== null && a.foot === b.foot && a.to[0] === b.to[0] && a.to[1] === b.to[1] && a.seconds === b.seconds
    && a.lift === b.lift && (a.shift ?? true) === (b.shift ?? true);
}
