import type { StanceGoal, StanceReading, SwingGoal } from "./goal.ts";
import { Quaternion, Vector3 } from "../../core/math/vector.ts";
import { anglesOf, rotationOfToRef } from "../../core/bodies/build/joint-state.ts";
import { channelName, type MuscleReading } from "../../core/bodies/muscle/driver.ts";
import type { AssistReading } from "../../core/bodies/assist.ts";
import type { Limb } from "../bearing.ts";
import type { WholeBodyAsk } from "../solve.ts";
import { rotationAtToRef } from "../kinematics.ts";
import type { StanceTuning } from "./stance-tuning.ts";
import { aimRecovery, catchStep, LEAST_HEIGHT, named, otherFoot, ownStep, paceToward, pendulumRate } from "./gait.ts";
import { gravityOf, makeStance, type Stance } from "./state.ts";
import { type FootState, type SoleEnd, bearingEdge, bearingEnd, bearingOf, bearingSole, clearAcross, clearAlong, endPast, groundContact, heldBy, landingHeading, landingHeight, legLength, lowestCorner, pivotWithin, readSupport, rolledRows, soleFlatTurn, soleHeight, soleMiddleToRef, withinSupport } from "../support.ts";
import { angularMomentumToRef, massCentreToRef, motionAtToRef, pointOfToRef, turnOfToRef } from "../../core/bodies/read-motion.ts";
import { sin, cos, atan2, exp, sinh, cosh, hypot } from "../../core/math/real.ts";
import type { BearingEnd, DofSpec } from "../../core/bodies/spec/body.ts";
import { spinBetweenToRef, turnAboutToRef, turnBetweenToRef } from "../../core/math/turn.ts";
import { approachToRef, damping, turnToRef } from "../approach.ts";
import { swingBowToRef, swingPathToRef, swingProgressToRef } from "../swing-path.ts";
import { swingShiftToRef } from "../swing-leg.ts";
import type { BuiltDof, ReadBody } from "../../core/bodies/read-body.ts";


/** The share of a swing's time from which the ground meeting its sole lands it (`SwingGoal.early`): before it, the foot is still leaving the ground. */
const LANDS_FROM = 0.8;

/** How far down the ground's normal at a sole is, as the cosine from up, for its meeting to land the swing: the floor, not a wall. */
const LANDED_NORMAL = 0.5;

/**
 * How fast a late foot goes on down past its place's height, m/s, and for how long at most, as a
 * share of the swing's time (`swingFoot`): a landing not met in as long again is given up, and the
 * foot stands where it is. Ended sooner, a swing short of the ground by a hand's breadth leaves a
 * foot in the air that the next weight shift hands the body to, or that the stance steps again at
 * once, and the body runs away step by step.
 */
const LATE_DESCENT = 0.3, LATE_MOST = 1;


/**
 * **Standing: the body carried by the legs, the feet where they are.** The stance plans its
 * centre of mass's way to the goal -- critically damped at a time constant (`STANCE_SECONDS`),
 * toward a place the soles can hold (`withinSupport`), no higher than the legs reach with their
 * knees bent (`STANCE_KNEE_BEND`) and no lower than they reach within their ankles' range
 * (`STANCE_ANKLE_SPARE`) -- and each step asks for accelerations: the centre of mass's, the plan's
 * with its errors from the plan taken up at `STANCE_TRACK`; the pelvis's turn toward upright at the
 * goal's heading, or through a recovery the facing it began at (`step.facing`); and each bearing
 * foot's, none, what motion it has damped out.
 *
 * **The legs give those by torque, through the whole body's floating-base dynamics**
 * (`BodyDynamics.root`): the whole-body solve (`solve.ts`, given the asks by `ask`), with the
 * stance's legs its limbs and their soles its patches (`aimLimb`). The root's six rows say what
 * wrench the ground must give for the body's accelerations. The ground's wrench is shared among
 * the bearing soles as nearly as a sole can give it (`shareGroundWrench`: no pull, the centre of
 * pressure on the sole, friction, twist), and where the soles cannot give it all, the root is
 * asked for the acceleration the wrench they can give makes: a body pushed past its feet is not
 * asked to stand. Every torque is given to the muscles as a torque source. Every inertia is the
 * body's own (`humanoidSpec`), and nothing conditions it.
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
   * Read the body: its centre of mass and velocity, and the soles of the last command's stance
   * feet, or all of them. A body reads this before its mind decides, so the mind's view is
   * this step's; `command` uses it.
   */
  read(): void;
  /**
   * Set `goal`'s aims from the last reading: the centre of mass's, the pelvis's turn's and each
   * stance leg's foot's accelerations. The stance legs' channels are marked in `owned`, for the
   * servo to leave. With no goal nothing is asked.
   */
  command(driver: MuscleReading, goal: StanceGoal | null, dt: number): void;
  /**
   * The last command's asks as the whole-body solve takes them (`solveBody`, `solve.ts`): the
   * root's aims, each driven leg's task at its point, and the records the solve leaves what it
   * finds in; null if the stance asks nothing.
   */
  ask(driver: MuscleReading): WholeBodyAsk | null;
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


/**
 * The least time, s, a pivot is chosen for (`planAcross`): a phase whose time has run out is still
 * aimed, its pivot at the edge of what the ankles hold. A numeric setting.
 */
const PIVOT_FLOOR = 1e-3;

/**
 * The stance's phase as this command finds it (`StanceReading.phase`), with its step: standing, the
 * step asked if one is; shifting the weight or swinging, the step and the foot that bears it.
 */
type Stepping = { readonly phase: "shift" | "swing"; readonly swing: SwingGoal; readonly bearer: FootState };
type Phasing = { readonly phase: "stand"; readonly swing: SwingGoal | null } | Stepping;

/**
 * The plan's acceleration across the ground (x, z) by the stance's phase, and the place it is
 * held toward, into the reading. `pendulum` is g over the plan's height.
 */
function planAcross(s: Stance, goal: StanceGoal, stance: readonly FootState[], phasing: Phasing, pendulum: number): [number, number] {
  const { plan, reading, step, gait } = s.state, { seconds } = s.tuning, { hipAt, progress, shiftWork, bow, path, along, accel } = s.scratch;
  const r = plan.at, u = plan.velocity, gain = damping(1 / seconds.across, s.state.dt);
  if (phasing.phase === "swing") {
    const { swing, bearer } = phasing;
    // On one foot the plan falls as an inverted pendulum of its height about a point of the
    // bearing sole (Kajita et al. 2001, "The 3D linear inverted pendulum mode", IROS), whose
    // capture point runs away from that point exponentially. The point is chosen each step so
    // that the capture point reaches the middle of the stance the step lands in as the foot
    // lands (Englsberger et al. 2011, "Bipedal walking control based on Capture Point
    // dynamics", IROS), within what the bearing ankle holds (`bearingOf`, `pivotWithin`): the body
    // falls toward its new stance. It is chosen while no less than the horizon is left
    // (`GaitTuning.horizon`), and held after; a phase that begins within it is chosen once, for the
    // time it has (`PIVOT_FLOOR`).
    const w = Math.sqrt(pendulum), left = swing.seconds - (step.lifted ? step.time : 0);
    // The swing leg's reaction (`swingShiftToRef`): the pivot the plan falls about is the centre of
    // pressure shifted by it, now and, folded over the time left, as the foot lands; the centre of
    // pressure is kept within what the ankle holds. Before the foot has lifted, its path is from where it is.
    const foot = named(s.feet, swing.foot), hip = foot.chain[0]!, from = step.lifted ? step.from : foot.middle;
    pointOfToRef(hip.parent, hip.spec.centre.value, hipAt);
    swingBowToRef(from, swing.to, bearer.middle, bearer.ends.front.middle, bearer.ends.heel.middle, clearAlong(bearer, foot, gait.clearance), clearAcross(foot, gait.clearance), sideOf(foot, goal.heading), bow);
    swingShiftToRef(foot.leg, foot.ankle, foot.back, goal.heading, hipAt, reading.centre, swing, bow, from, step.lifted ? step.time : 0,
      reading.place, r, u, w, s.parts().mass * gravityOf(s), progress, path, along, accel, shiftWork, step.shift);
    const [tx, tz] = swing.capture ?? [(bearer.middle.x + swing.to[0]) / 2, (bearer.middle.z + swing.to[1]) / 2];
    const { capture: [cx, cz], now: [nx, nz] } = step.shift;
    if (left >= gait.horizon || !step.pivoted) {
      const grow = exp(w * Math.max(left, PIVOT_FLOOR));
      const [px, pz] = pivotWithin([bearingOf(bearer)], r.x + u.x / w, r.z + u.z / w, (tx + cx - (r.x + u.x / w) * grow) / (1 - grow), (tz + cz - (r.z + u.z / w) * grow) / (1 - grow), 0);
      reading.place.set(px, 0, pz);
      step.pivoted = true;
    }
    return [pendulum * (r.x - reading.place.x - nx), pendulum * (r.z - reading.place.z - nz)];
  }
  if (phasing.phase === "shift" && phasing.swing.transfer) {
    // A walk's double support: both soles bear, and the plan falls as the pendulum about a
    // point of them chosen, as a swing's is, to bring its capture point to the step's handover
    // as the foot lifts (Englsberger et al. 2015, "Three-dimensional bipedal walking control
    // based on Divergent Component of Motion", IEEE T-RO): the walk keeps its momentum. The
    // point is within what the two ankles hold together (`bearingOf`): the step's reference has
    // the pivot cross from the trailing sole's middle to the leading one's (`transferStep`). It is
    // chosen while no less than the horizon is left before the handover, and held after: a double
    // support shorter than the horizon is chosen once, for the time it has.
    const w = Math.sqrt(pendulum), left = phasing.swing.transfer - step.held;
    if (left >= gait.horizon || !step.pivoted) {
      const grow = exp(w * Math.max(left, PIVOT_FLOOR));
      const [tx, tz] = phasing.swing.handover!;
      const [px, pz] = pivotWithin(heldBy(stance), r.x + u.x / w, r.z + u.z / w, (tx - (r.x + u.x / w) * grow) / (1 - grow), (tz - (r.z + u.z / w) * grow) / (1 - grow), 0);
      reading.place.set(px, 0, pz);
      step.pivoted = true;
    }
    return [pendulum * (r.x - reading.place.x), pendulum * (r.z - reading.place.z)];
  }
  if (phasing.phase === "shift") {
    // Before a step the plan goes toward the bearing sole's middle, as fast as its constant
    // takes it, past what a stance on both feet holds: the foot lifts before it gets there.
    const { bearer } = phasing;
    reading.place.set(bearer.middle.x, 0, bearer.middle.z);
    return [gain.error * (bearer.middle.x - r.x) - gain.rate * u.x, gain.error * (bearer.middle.z - r.z) - gain.rate * u.z];
  }
  // A place outside what the ankles can hold is taken at the nearest point that they can.
  const [gx, gz] = withinSupport(heldBy(stance), goal.centre?.[0] ?? reading.support.x, goal.centre?.[1] ?? reading.support.z, 0);
  reading.place.set(gx, 0, gz);
  return [gain.error * (gx - r.x) - gain.rate * u.x, gain.error * (gz - r.z) - gain.rate * u.z];
}

/**
 * The plan's height limits. No higher than the goal's height less the walk's crouch for its steps
 * (`paceToward`), nor than each leg reaches with its knee bent by
 * `STANCE_KNEE_BEND`, its hip carried as the plan carries the centre of mass: a stance leg from its
 * ankle, a swinging leg from where its ankle will be when its sole lands, its hip where the plan
 * will have it then (the pendulum about the place, over the swing's time left). Taken from the hip
 * where it is, a long step's leg reaches from behind the bearing foot to a landing ahead of it, and
 * the plan drops the body as the foot lifts. A leg whose ankle is beyond its reach across the
 * ground caps no height: none brings the ankle within it, and read as the hip at the ankle's own
 * height, it sinks the plan to the soles, where the pendulum's rate has no bound. The steps a walk
 * plans are within the legs' reach at the goal's height (`reachableStep`). And no lower than each
 * leg reaches with its ankle at its stop less `STANCE_ANKLE_SPARE`, its foot where it stands or
 * will land: the knee's place is
 * then fixed, and the hip is a thigh from it; each leg's such floor is in `floors`, with the end of
 * the sole whose stop it is: the dorsiflexion stop's, the body over or past the front edge, or
 * the plantar flexion stop's, past the heel (`endPast`), the way the body is going.
 */
function heightLimits(s: Stance, goal: StanceGoal, stance: readonly FootState[], phasing: Phasing, pendulum: number):
  { high: number; floors: [FootState, number, SoleEnd][] } {
  const { feet } = s, { plan, reading, step } = s.state, { bend, spare } = s.tuning, { hipAt, ankleAt, kneeAt, shank, footTurn } = s.scratch;
  const r = plan.at, u = plan.velocity, c = reading.centre;
  let high = goal.height - s.state.crouch;
  const floors: [FootState, number, SoleEnd][] = [];
  let landX = r.x, landZ = r.z;
  const landing = phasing.phase === "swing" ? phasing : null;
  if (landing) {
    const w = Math.sqrt(pendulum), left = Math.max(landing.swing.seconds - (step.lifted ? step.time : 0), 0);
    const ch = cosh(w * left), sh = sinh(w * left);
    landX = reading.place.x + (r.x - reading.place.x) * ch + u.x / w * sh - step.shift.centre[0];
    landZ = reading.place.z + (r.z - reading.place.z) * ch + u.z / w * sh - step.shift.centre[1];
  }
  for (const foot of landing ? feet : stance) {
    const [hip, knee, ankle] = foot.chain;
    pointOfToRef(hip!.parent, hip!.spec.centre.value, hipAt);
    pointOfToRef(ankle!.parent, ankle!.spec.centre.value, ankleAt);
    const swinging = landing !== null && !stance.includes(foot);
    const [a] = foot.lengths, hx = hipAt.x + (swinging ? landX : r.x) - c.x, hz = hipAt.z + (swinging ? landZ : r.z) - c.z, rise = c.y - hipAt.y - reading.support.y;
    if (swinging) ankleAt.addInPlaceFromFloats(landing.swing.to[0] - foot.middle.x, landingHeight(landing.bearer, foot) - foot.middle.y, landing.swing.to[1] - foot.middle.z);
    if (!s.state.pose) {
      const long = legLength(foot, bend), spread = hypot(hx - ankleAt.x, hz - ankleAt.z);
      if (spread < long) high = Math.min(high, ankleAt.y + Math.sqrt(long * long - spread * spread) + rise);
    }
    if (spare !== null) {
      // The shank's turn is the foot's with the ankle's own undone (rel = D_shank^-1 D_foot).
      const end: SoleEnd = foot.memory.rolled ?? (endPast(foot, r.x, r.z) === "heel" ? "heel" : "front");
      rotationAtToRef(ankle!, [stopLessSpare(ankle!.dofs[0]!.spec, end, spare), 0], shank);
      turnOfToRef(foot.segment, footTurn).multiplyToRef(Quaternion.InverseToRef(shank, shank), shank);
      const k = knee!.spec.centre.value, o = ankle!.spec.centre.value;
      kneeAt.set(k[0] - o[0], k[1] - o[1], k[2] - o[2]).applyRotationQuaternionToRef(shank, kneeAt).addInPlace(ankleAt);
      const spread = hypot(hx - kneeAt.x, hz - kneeAt.z);
      if (spread < a) floors.push([foot, kneeAt.y + Math.sqrt(a * a - spread * spread) + rise, end]);
    }
  }
  return { high, floors };
}

/**
 * Which feet bear on an end of their soles. A walk's bearing foot (the stance's own walk's, or a
 * goal's step's with a double support, `SwingGoal.transfer`), whose ankle's floor is over the knees'
 * ceiling (`high`) on one foot rolls onto the end its stop is of instead (Perry 1992, "Gait
 * Analysis", terminal stance: the heel rises as the body passes over the forefoot; walking
 * backward, the toes as it passes over the heel), once the plan's centre of mass is past that edge
 * and going on from the sole: rolled, the foot's pressure is on the edge, and one rolled with the
 * centre back over the sole brakes the walk. The
 * height keeps the knees bent, and the ankle its range. A foot the body comes toward does not
 * roll: landed on an end, as a step back lands on its toes, with the centre past that end and
 * coming, its ankle brings the other end down; read as rolled, the plan falls about the edge it
 * landed on, further from the body than the ankle holds, and runs the body on past it. The foot
 * rolls back once its lifted end is down with the centre back over the sole, or with the centre
 * back over the sole as a weight shift with no double support goes onto it (`shiftWeight`): that
 * shift takes the body over the sole's middle and ends once the capture point is over what the
 * sole bears, which a foot kept rolled bears only on its edge. It is flat again whenever it
 * leaves the ground. Through a walk's double support the trailing foot rolls for its
 * pre-swing onto the end the body goes toward: off its toes going forward, off its heel going
 * backward.
 */
function rollFeet(s: Stance, stance: readonly FootState[], swing: SwingGoal | null, floors: readonly [FootState, number, SoleEnd][], high: number): void {
  const { feet } = s, { plan, reading } = s.state;
  const r = plan.at, u = plan.velocity;
  for (const foot of feet) if (!stance.includes(foot)) foot.memory.rolled = null;
  for (const [foot, floor, end] of floors) {
    if (!stance.includes(foot)) continue;
    const past = endPast(foot, r.x, r.z), going = u.x * (r.x - foot.middle.x) + u.z * (r.z - foot.middle.z) > 0;
    if (going && (s.state.striding || swing?.transfer !== undefined && swing !== reading.own) && past === end && !foot.memory.rolled && floor > high && reading.phase === "swing") foot.memory.rolled = end;
    else if (foot.memory.rolled && past !== foot.memory.rolled && (reading.phase === "shift" && !swing?.transfer || (foot.memory.rolled === "front" ? foot.heel <= foot.flat : -foot.heel <= -foot.flat))) foot.memory.rolled = null;
  }
  if (reading.phase === "shift" && swing?.transfer) {
    const trailing = named(feet, swing.foot), front = trailing.ends.front.middle;
    if (stance.includes(trailing)) trailing.memory.rolled = u.x * (front.x - trailing.middle.x) + u.z * (front.z - trailing.middle.z) > 0 ? "front" : "heel";
  }
}

/**
 * The weight shift before a step ends, and the foot lifts, once the body's capture point (Pratt et
 * al. 2006, "Capture point: a step toward humanoid push recovery", Humanoids) is over the bearing
 * sole: from there the body falls toward that foot, not away from it. A walk's double support ends
 * on its time once the bearing sole is on the ground: a step whose landing was given up in the air
 * (`LATE_MOST`) has the foot it lands on pressed down first, and a foot that lifted with none under
 * the body would drop the body's weight onto that sole at once.
 */
function shiftWeight(s: Stance, phasing: Phasing, height: number, dt: number): void {
  const { reading, step } = s.state;
  if (phasing.phase !== "shift") return;
  const { swing, bearer } = phasing;
  if (swing.transfer) {
    step.held += dt;
    if (step.held >= swing.transfer && reading.ends[bearer.name]!.touching) reading.phase = "swing";
  } else {
    const c = reading.centre, vel = reading.velocity, g = gravityOf(s);
    const w = pendulumRate(g, height), cx = c.x + vel.x / w, cz = c.z + vel.z / w;
    const [hx, hz] = withinSupport([bearingOf(bearer)], cx, cz, 0);
    if (hx === cx && hz === cz) reading.phase = "swing";
  }
}

/** The way to `foot`'s own side, unit, world x and z, facing `heading`. */
function sideOf(foot: FootState, heading: number): readonly [number, number] {
  const sign = foot.side === "right" ? 1 : -1;
  return [sign * cos(heading), -sign * sin(heading)];
}

/**
 * The turn `foot` lands with, world, into `out`: its reference-pose turn, turned about up by
 * `heading`, flat; and, with its leg leaning `lean` from the vertical as it lands (`SwingGoal.lean`,
 * ahead and out), turned from flat about its ankle's axes by what the ankle's range less `spare`
 * falls short of flat there (`rotationOfToRef`, `work` a scratch): a flat sole wants the ankle at
 * the lean's angles, plantar flexion with the ankle ahead of the hip and eversion with it out,
 * each from the reference pose by its bind. A foot stepping back lands on its toes, the heel as
 * high as the dorsiflexion stop leaves it; one stepping out, on its outer edge.
 */
function landingTurnToRef(foot: FootState, heading: number, lean: readonly [number, number] | undefined, spare: number, work: Quaternion, out: Quaternion): Quaternion {
  turnAboutToRef(Vector3.UpReadOnly, heading, out);
  if (lean) {
    const ankle = foot.chain[2]!, [pitch, roll] = ankle.dofs;
    // What the range refuses of the angle a flat sole wants, in the constraint's measure.
    const refused = (dof: BuiltDof, wants: number): number => dof.sign * (wants - withinRange(dof.spec, spare, wants));
    const a = refused(pitch!, -lean[0] - pitch!.spec.bind.value), b = roll ? refused(roll, -lean[1] - roll.spec.bind.value) : 0;
    if (a !== 0 || b !== 0) out.multiplyInPlace(rotationOfToRef(ankle.axes, -a, -b, 0, work));
  }
  return out.multiplyInPlace(foot.segment.rest);
}

/** A joint's three angles, work for `ankleTurnToRef`; carries nothing between calls. */
const abc: [number, number, number] = [0, 0, 0];

/**
 * `turn`, a swinging foot's turn target, world, held within what its ankle's range less `spare`
 * gives with the shank turned as it is now, in place: the foot's rotation relative to the shank,
 * body frame, as `relativeRotationToRef` composes it with the target in the foot's place, its
 * angles about the ankle's axes (`anglesOf`) each held within its freedom's range, and the turn
 * recomposed (`rotationOfToRef`) when any was held. A swing's turn blends from the one the foot
 * left with to the landing's (`landingTurnToRef`), which is within the range as the leg lands;
 * under way the shank leans further than it lands leaning, most stepping back, where the knee
 * bent carries it far past the dorsiflexion stop: the foot rides the stop with its toes down
 * whatever is asked, and a path that lifts the sole the blend asks for, not the one the foot has,
 * lets the toes meet the ground before the landing and hold the foot short of it. The path lifts
 * the lowest corner of the turn held within the range (`soleDrop`, `swingFoot`); the foot is asked
 * the blend, whose turn the ankle takes as far as its range lets it: asked the held turn instead,
 * a leg stepping back fast hangs its foot on its toe tip, its shank leaning further the more the
 * knee bends under it, and never bears. `relative` and `inverse` are scratch.
 */
function ankleTurnToRef(foot: FootState, turn: Quaternion, spare: number, relative: Quaternion, inverse: Quaternion): Quaternion {
  const ankle = foot.chain[2]!, shank = ankle.parent;
  // relative = shank.rest * shank^-1 * turn * foot.rest^-1 (`a.multiply(b)` applies b, then a).
  Quaternion.InverseToRef(shank.pose.rotation, inverse);
  shank.rest.multiplyToRef(inverse, relative);
  relative.multiplyInPlace(turn);
  Quaternion.InverseToRef(foot.segment.rest, inverse);
  relative.multiplyInPlace(inverse);
  anglesOf(relative, ankle.axes, abc);
  let held = false;
  for (let k = 0; k < ankle.dofs.length; k++) {
    const dof = ankle.dofs[k]!, own = dof.sign * abc[k]!, within = withinRange(dof.spec, spare, own);
    if (within !== own) { abc[k] = dof.sign * within; held = true; }
  }
  // A locked axis at a half turn has no rotation to recompose (`rotationOfToRef`): the target stands.
  if (!held || !(Math.abs(abc[0]) < Math.PI && Math.abs(abc[1]) < Math.PI && Math.abs(abc[2]) < Math.PI)) return turn;
  // turn = shank * shank.rest^-1 * relative * foot.rest, the composition undone.
  rotationOfToRef(ankle.axes, abc[0], abc[1], abc[2], relative);
  Quaternion.InverseToRef(shank.rest, inverse);
  shank.pose.rotation.multiplyToRef(inverse, turn);
  turn.multiplyInPlace(relative);
  return turn.multiplyInPlace(foot.segment.rest);
}

/** How far `foot`'s sole's lowest corner lies below the corners' middle, m, the foot turned by `turn` (world); `work` a scratch. */
function soleDrop(foot: FootState, turn: Quaternion, work: Vector3): number {
  let middle = 0, lowest = Infinity;
  for (const corner of foot.sole) {
    const y = corner.applyRotationQuaternionToRef(turn, work).y;
    middle += y / foot.sole.length;
    if (y < lowest) lowest = y;
  }
  return middle - lowest;
}

/**
 * The swing: `swing`'s foot's sole carried along its path (`swingPathToRef`), its turn carried from
 * the one it left the ground with to flat and facing `heading` as it lands; the step ends as it lands
 * (`SwingGoal.early`), once its sole has met the ground.
 */
function swingFoot(s: Stance, { swing, bearer }: Stepping, heading: number, dt: number): void {
  const { feet } = s, { step, tasks, reading, gait } = s.state, { seconds, spare } = s.tuning;
  const { sole, level, path, along, accel, turn, wholeAxis, progress, v, bow } = s.scratch;
  const foot = named(feet, swing.foot);
  soleMiddleToRef(foot, sole);
  const down = soleOnGround(s, foot), met = step.lifted && step.time + dt >= LANDS_FROM * swing.seconds && down;
  if (!step.lifted) {
    step.lifted = true;
    step.met = false;
    step.pivoted = false;
    step.time = 0;
    step.from.copyFrom(sole);
    step.lift.copyFrom(foot.segment.pose.rotation);
    step.drop = soleDrop(foot, step.lift, v);
  }
  if (met) step.met = true;
  // It lands facing the heading, as flat as its ankle lets it (`landingTurnToRef`). (Held at the
  // turn it left with, a foot's yaw drifts step by step.)
  landingTurnToRef(foot, heading, swing.lean, spare ?? 0, s.scratch.footTurn, level);
  step.time += dt;
  const tau = Math.min(1, step.time / swing.seconds), from = step.from, T = swing.seconds;
  // Past its time, a foot that has not met the ground goes on down until it meets it.
  const late = step.met ? 0 : Math.min(Math.max(step.time - swing.seconds, 0), LATE_MOST * swing.seconds);
  // Along its path (`swingPathToRef`) by its progress, bowed clear of the bearing sole (`swingBowToRef`).
  swingProgressToRef(tau, progress);
  const eased = progress.x, ds = progress.y / T, dds = progress.z / (T * T);
  swingBowToRef(from, swing.to, bearer.middle, bearer.ends.front.middle, bearer.ends.heel.middle, clearAlong(bearer, foot, gait.clearance), clearAcross(foot, gait.clearance), sideOf(foot, heading), bow);
  swingPathToRef(from, swing.to, swing.lift, bow, tau, T, eased, ds, dds, path, along, accel, progress);
  path.y -= LATE_DESCENT * late;
  if (late > 0) along.y -= LATE_DESCENT;
  turnBetweenToRef(step.lift, level, eased, step.turn);
  // The turn the foot can have now (`ankleTurnToRef`), whose drop the path lifts.
  const held = ankleTurnToRef(foot, s.scratch.ankleHeld.copyFrom(step.turn), spare ?? 0, s.scratch.ankleRelative, s.scratch.ankleInverse);
  // The path is the sole's lowest corner's, from where it was as the foot left to the ground the
  // foot last stood on (`FootMemory.ground`) where it lands: its middle goes higher by what its
  // turn drops a corner below it, so a foot leaving or landing pitched neither jumps nor digs in.
  // The corner's way starts where the corner was, not where a flat sole's would be under the
  // middle the foot left at: from there, a foot that left standing on its toes, as one stepping
  // back lands, lands its toes as high again, and higher each step.
  // The path's rate carries these terms' rates too, the turn's drop's over the last command: without
  // it, the leg follows a corner dropping under way a swing's constant late, and low.
  const drop = soleDrop(foot, held, v), dropLift = soleDrop(foot, step.lift, v), descent = foot.memory.ground - (from.y - dropLift);
  path.y += drop - dropLift + eased * descent;
  along.y += (drop - step.drop) / dt + ds * descent;
  accel.y += dds * descent;
  step.drop = drop;
  const settle = seconds.swing;
  spinBetweenToRef(foot.segment.pose.rotation, step.turn, settle, turn);
  // The whole turn from lift to landing, world, as its axis times its angle: the path's turn goes
  // about its axis at its angle times the path's rate.
  spinBetweenToRef(step.lift, level, 1, wholeAxis);
  // The path's acceleration, and its errors in place and speed taken up critically damped at the
  // swing's constant; its turn's likewise, with the turn's own rate and acceleration: damping
  // alone lags a turn by twice its rate times the swing's constant, and a foot turning over a
  // swing lands off the heading.
  const task = tasks[feet.indexOf(foot)]!, gain = damping(1 / settle, dt);
  motionAtToRef(foot.segment, sole, task.linear, task.angular);
  task.linear.set(accel.x + gain.error * (path.x - sole.x) + gain.rate * (along.x - task.linear.x),
    accel.y + gain.error * (path.y - sole.y) + gain.rate * (along.y - task.linear.y),
    accel.z + gain.error * (path.z - sole.z) + gain.rate * (along.z - task.linear.z));
  // `turn` is the steady spin closing the turn in `settle`: times `settle`, the turn's angle.
  task.angular.scaleInPlace(-gain.rate).addInPlace(turn.scale(gain.error * settle)).addInPlace(wholeAxis.scale(dds + gain.rate * ds));
  task.on = true;
  task.bearing = false;
  for (const i of foot.memory.channels) s.state.owned[i] = 1;
  if (met && swing.early === true || tau >= 1 && step.met || late >= LATE_MOST * swing.seconds) {
    reading.phase = "stand";
    reading.own = null;
    step.catching = false;
  }
}

/** Each foot's leg's channels, found once the driver's are known. */
function bindChannels(s: Stance, muscles: MuscleReading): void {
  const { state } = s;
  if (state.owned.length === muscles.channels.length) return;
  state.owned = new Uint8Array(muscles.channels.length);
  for (const foot of s.feet) foot.memory.channels = foot.chain.flatMap((joint) => joint.dofs.map((_, k) => muscles.channel(channelName(joint, k))));
}

/** Whether `goal` leaves the stance `s` to step of itself: it stands on all its feet and asks for no step. */
function stepsOfItself(s: Stance, goal: StanceGoal | null): goal is StanceGoal {
  return !!goal && s.feet.every((foot) => goal.feet.includes(foot.name)) && !goal.swing;
}

/**
 * The step this command takes: a catch of a push under way (`catchStep`), or the goal's, or the
 * stance's own (`ownStep`), or none. A swing unlike the last starts a step, at its weight shift or,
 * asked to, at its swing.
 */
function chooseStep(s: Stance, goal: StanceGoal | null): Phasing {
  const { state } = s, { reading, step } = state;
  if (!goal) step.catching = false;
  else if (!step.catching) step.catching = catchStep(s);
  // A catch runs to its landing, re-aimed on the way.
  if (step.catching) aimRecovery(s);
  else if (stepsOfItself(s, goal)) ownStep(s, { heading: goal.heading, hip: goal.height - s.rise, halted: goal.halt === true });
  else {
    reading.own = null;
    // A requested step uses its goal's heading, independent of the last catch's facing.
    step.recovering = false;
    state.stride = null;
    state.striding = null;
  }
  const swing = step.catching ? reading.own : goal?.swing ?? reading.own;
  if (!swing) {
    step.swing = null;
    reading.phase = "stand";
  } else if (!sameSwing(swing, step.swing)) {
    step.swing = swing;
    step.lifted = false;
    step.pivoted = false;
    step.held = 0;
    step.off = Infinity;
    reading.phase = swing.shift === false ? "swing" : "shift";
  }
  const { phase } = reading;
  return !swing || phase === "stand" ? { phase: "stand", swing } : { phase, swing, bearer: otherFoot(s.feet, swing.foot) };
}

/**
 * The feet of the stance `s` that bear the body: the goal's, but for a foot that is swinging; a foot
 * to swing that has not yet lifted bears with them all, since it shifts the weight off itself
 * (`SwingGoal.shift`).
 */
function bearerOf(s: Stance, goal: StanceGoal | null, { phase, swing }: Phasing): readonly BearingEnd[] {
  return !goal ? [] : phase === "swing" ? goal.feet.filter((end) => end !== swing.foot) : swing && !goal.feet.includes(swing.foot) ? s.names : goal.feet;
}

/**
 * The plan, one step on: where the centre of mass should be, moving critically damped toward the goal
 * across the ground and in height at each time constant, from where the stance began. The ground is
 * level, y up; the plan's y is the height over the soles. The plan asks its acceleration and goes on
 * by what the ground gave of it (`plan.missed`, over the body's mass): what the soles cannot give,
 * leaning as they are, the plan does not count as taken, or it runs away from the body it is for,
 * and the tracking (`aimRoot`) asks more and more of ground that gave less. Returns the plan's
 * acceleration, as asked.
 */
function advancePlan(s: Stance, goal: StanceGoal, stance: readonly FootState[], phasing: Phasing, pendulum: number, dt: number): [number, number, number] {
  const { plan, reading } = s.state, { seconds } = s.tuning;
  const r = plan.at, u = plan.velocity;
  const [ax, az] = planAcross(s, goal, stance, phasing, pendulum);
  // Where the ceiling and a floor disagree, the ankle's stop is the harder limit.
  const limits = heightLimits(s, goal, stance, phasing, pendulum);
  rollFeet(s, stance, phasing.swing, limits.floors, limits.high);
  let low = -Infinity;
  for (const [foot, floor] of limits.floors) if (!foot.memory.rolled) low = Math.max(low, floor);
  const high = Math.max(limits.high, low), gain = damping(1 / seconds.height, dt);
  const ay = gain.error * (high - r.y) - gain.rate * u.y;
  const m = plan.missed, over = 1 / s.parts().mass;
  u.addInPlaceFromFloats((ax - m.x * over) * dt, (ay - m.y * over) * dt, (az - m.z * over) * dt);
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
  const dt = s.state.dt, gain = damping(e, dt);
  turnToRef(pelvis.pose.rotation, target, seconds.turn, pelvis.body.angularVelocityToRef(pelvisSpin), dt, aim.spin);
  aim.centre.set(ax + gain.error * (r.x - c.x) + gain.rate * (u.x - vel.x), ay + gain.error * (r.y - height) + gain.rate * (u.y - vel.y),
    az + gain.error * (r.z - c.z) + gain.rate * (u.z - vel.z));
  aim.on = true;
}

/** Each of `stance`'s feet held still where it bears, what motion it has damped out at the rate `e`. */
function holdStance(s: Stance, stance: readonly FootState[], e: number): void {
  const { feet } = s, { tasks } = s.state, gain = damping(e, s.state.dt);
  for (const foot of stance) {
    const task = tasks[feet.indexOf(foot)]!;
    motionAtToRef(foot.segment, bearingEdge(foot)?.middle ?? foot.middle, task.linear, task.angular);
    // The sole's lowest corner is asked down to the ground it last stood on (`FootMemory.ground`),
    // critically damped at the stance's constant: a sole that has bounced, or that the body has
    // lifted off, is pressed down by its own leg, which its share of the ground's wrench alone
    // would drive down slowly against the leg's posture.
    const down = task.linear.y;
    task.linear.scaleInPlace(-gain.decay);
    task.linear.y = -gain.error * soleHeight(foot) - gain.rate * down;
    task.angular.scaleInPlace(-gain.decay);
    task.on = true;
    task.bearing = true;
    for (const i of foot.memory.channels) s.state.owned[i] = 1;
  }
}

/**
 * The lever a missed moment of the ground's wrench is weighed against a missed force at
 * (`shareGroundWrench`): the height of the root's centre, where the wrench is taken, over the
 * soles, at least a sole's half-length. A moment the soles miss is a force they miss at the
 * root's height, the lever the wrench's geometry gives; no fixed lever serves both humans better.
 */
function leverOf(s: Stance, height: number): number {
  return Math.max(s.feet[0]!.reach, height - s.state.reading.support.y);
}

/**
 * A driven leg's part of the solve, for this step (`Limb.work`): the point its task is asked at;
 * where it bears, its patch and its part of the load (`loadShare`); and the leg's own asks ahead of
 * the task (`aimFreedom`). A knee past straight is asked back toward the bend, and the knee of the
 * leg about to swing, its sole still on the ground, set to the pre-swing's bend instead, and once
 * lifted, bent at least to it (`preswinging`); a foot on one end of its sole (`bearingEnd`) turns
 * free about the edge it bears on, and one rolled there by the stance, not pre-swinging, has its
 * ankle held short of that end's stop. One landed on its toes or its heel is asked its centre of
 * pressure halfway to that end (`bearingSole`), and the other end comes down.
 */
function aimLimb(s: Stance, foot: FootState, limb: Limb, muscles: MuscleReading): void {
  const { gait } = s.state, { bend, spare, seconds, soleMargin } = s.tuning, { task, work } = limb, { ahead } = work;
  // The point: bearing, where the foot bears, as last read; swinging, its sole's middle, now.
  if (task.bearing) work.at.copyFrom(bearingEdge(foot)?.middle ?? foot.middle);
  else soleMiddleToRef(foot, work.at);
  ahead.length = foot.memory.channels.length;
  ahead.fill(NaN);
  const knee = foot.chain[0]!.dofs.length, ankle = knee + foot.chain[1]!.dofs.length, lifting = !s.state.pose && preswinging(s, foot);
  if (!s.state.pose) {
    const flexed = muscles.angle(foot.memory.channels[knee]!) - foot.straight;
    // The leg about to swing, its sole still on the ground, has its knee set to the pre-swing's bend;
    // lifted with the sole still down, a knee straighter than that is bent to it: near straight, the
    // foot's height hardly moves with the knee, so the task asks the knee almost nothing to lift the
    // foot, and the hip drags it along the ground instead. A lifted knee bent further, a crouch's,
    // is left to the task: straightened, it would press the foot down.
    if (lifting && (!s.state.step.lifted || flexed < gait.preswing.knee)) aimFreedom(s, foot, muscles, ahead, knee, gait.preswing.knee - flexed, gait.preswing.seconds);
    // A knee past straight is on the Jacobian's other branch, where the leg shortens by extending
    // the knee further, into its stop. That knee is asked back toward `STANCE_KNEE_BEND` at the
    // height's constant, and the leg's other freedoms take the task.
    else if (flexed < 0) aimFreedom(s, foot, muscles, ahead, knee, bend - flexed, seconds.height);
  }
  // On one end of its sole, the foot's turn about the edge it bears on is free: the leg pivots on
  // the edge. Of the spin's rows the task keeps the one about the level normal to the edge, and
  // the one about up.
  work.rows = task.bearing && bearingEnd(foot) !== null ? rolledRows(foot) : null;
  if (task.bearing && foot.memory.rolled && spare !== null) {
    // Rolled, the ankle is held at that end's stop less the spare (the front's the dorsiflexion
    // stop, the heel's the plantar flexion stop), at the height's constant; pre-swinging, it goes
    // where the leg takes it.
    if (!lifting) aimFreedom(s, foot, muscles, ahead, ankle, stopLessSpare(foot.chain[2]!.dofs[0]!.spec, foot.memory.rolled, spare) - muscles.angle(foot.memory.channels[ankle]!), seconds.height);
  } else if (task.bearing && !s.state.pose && foot.memory.rolled === null && bearingEnd(foot) !== null) {
    // Standing on an end it was not rolled onto, a leg placed on its toes or a foot landed on an
    // end, the foot is brought flat: its ankle asked the dorsiflexion that lays the sole down
    // (`soleFlatTurn`), at the height's constant. Left to the task, the turn about the edge is free
    // and the heel comes down only as the body's motion carries it.
    aimFreedom(s, foot, muscles, ahead, ankle, soleFlatTurn(foot), seconds.height);
  }
  work.patch = task.bearing ? bearingSole(foot, 1 - soleMargin) : null;
  work.share = 1;
}

/** What `contactsOf` is asked for when only the ground is wanted. */
const groundOnly = (other: unknown): boolean => other === null;

/**
 * `foot`'s leg's freedom `k` (of its channels) asked ahead of its task (`Limb.work.ahead`) to take up
 * `error` rad, critically damped at `seconds`, against its rate.
 */
function aimFreedom(s: Stance, foot: FootState, muscles: MuscleReading, ahead: number[], k: number, error: number, seconds: number): void {
  const i = foot.memory.channels[k]!, gain = damping(1 / seconds, s.state.dt);
  ahead[k] = gain.error * error - gain.rate * muscles.rate(i);
}

/**
 * Whether `foot`'s leg is about to swing or swinging with its sole still on the ground: the step's
 * swing is its own, and it is in the walk's double support before the lift (`SwingGoal.transfer`)
 * with the foot rolled onto its toes, or lifted with the ground still pressing the sole.
 */
function preswinging(s: Stance, foot: FootState): boolean {
  const { reading, step } = s.state, swing = step.swing;
  return swing?.foot === foot.name && (reading.phase === "shift"
    ? (swing.transfer ?? 0) > 0 && foot.memory.rolled !== null
    : reading.phase === "swing" && step.lifted && reading.ends[foot.name]!.touching);
}

/** Whether the ground pushed on `foot` in the last step, from below (`LANDED_NORMAL`). */
function soleOnGround(s: Stance, foot: FootState): boolean {
  for (const part of foot.contactParts) if (part.chain.every(joint => joint.attached())
    && s.built.physics.contactsOf(part.segment.body, groundOnly).some(c => groundContact(c, LANDED_NORMAL))) return true;
  return false;
}

/** An articulated foot's bearing contact height; a rigid sole retains its geometric reading. */
function soleGroundHeight(s: Stance, foot: FootState): number {
  if (foot.contactParts.length === 1) return lowestCorner(foot);
  let height = Infinity;
  for (const part of foot.contactParts) if (part.chain.every(joint => joint.attached()))
    for (const contact of s.built.physics.contactsOf(part.segment.body, groundOnly))
      if (groundContact(contact, LANDED_NORMAL)) height = Math.min(height, contact.point[1]);
  return height === Infinity ? lowestCorner(foot) : height;
}

/** Nothing is driven and nothing asked: where every command begins, and what a reset leaves. */
function askNothing(s: Stance): void {
  const { state } = s, { reading } = state;
  state.owned.fill(0);
  state.aim.on = false;
  state.plan.missed.copyFrom(reading.shortfall.force).subtractInPlace(state.helped.force);
  reading.shortfall.force.setAll(0);
  reading.shortfall.moment.setAll(0);
  for (const foot of s.feet) {
    const asked = reading.ends[foot.name]!.asked;
    asked.force.setAll(0);
    asked.moment.setAll(0);
  }
  state.helped.force.setAll(0);
  state.helped.moment.setAll(0);
  for (const task of state.tasks) task.on = false;
}

/** `value` within `spec`'s range less `spare` at each end; the range's middle where that leaves none. */
function withinRange(spec: DofSpec, spare: number, value: number): number {
  const low = spec.min.value + spare, high = spec.max.value - spare;
  return low > high ? (low + high) / 2 : value < low ? low : value > high ? high : value;
}

/** The stop of a foot's dorsiflexion (`spec`) toward the end `end` it rolls onto, less `spare`: the front's the dorsiflexion stop, the heel's the plantar flexion stop. */
function stopLessSpare(spec: DofSpec, end: SoleEnd, spare: number): number {
  return end === "front" ? spec.max.value - spare : spec.min.value + spare;
}

export function stanceControl(built: ReadBody, tuning: StanceTuning, assist: AssistReading | null): StanceControl {
  const s = makeStance(built, tuning, assist);
  return {
    reset() {
      const { state } = s, { reading, step } = state;
      askNothing(s);
      state.plan.on = false;
      state.pose = null;
      state.last = null;
      state.stride = null;
      state.striding = null;
      state.pace[0] = 0;
      state.pace[1] = 0;
      step.swing = null;
      step.lifted = false;
      step.pivoted = false;
      step.time = 0;
      step.held = 0;
      step.off = Infinity;
      step.catching = false;
      step.recovering = false;
      step.facing = null;
      reading.phase = "stand";
      reading.own = null;
      for (const foot of s.feet) foot.memory.rolled = null;
    },
    get owned() { return s.state.owned; },
    reading: s.state.reading,
    state: s.state,
    ask(muscles) {
      const { aim } = s.state;
      if (!aim.on) return null;
      s.feet.forEach((foot, f) => { if (s.limbs[f]!.task.on) aimLimb(s, foot, s.limbs[f]!, muscles); });
      s.ask.lever = leverOf(s, muscles.dynamics.root.centre[1]);
      return s.ask;
    },
    read() {
      const { feet, pelvis } = s, { segments, mass } = s.parts(), { reading } = s.state, { p, v, turn, target, whole } = s.scratch;
      massCentreToRef(segments, mass, reading.centre, p, reading.velocity);
      angularMomentumToRef(segments, reading.centre, reading.velocity, reading.momentum, p, v, turn, target);
      for (const foot of feet) {
        const hip = foot.chain[0]!;
        pointOfToRef(hip.parent, hip.spec.centre.value, foot.memory.hip).subtractInPlace(reading.centre);
      }
      // The reference pose faces +z: its forward, turned as the pelvis has turned since.
      p.set(0, 0, 1).applyRotationQuaternionToRef(turnOfToRef(pelvis, whole), p);
      reading.facing = atan2(p.x, p.z);
      const on = s.state.last;
      readSupport(feet, on ? feet.filter((foot) => on.includes(foot.name)) : feet, reading.support);
      for (const foot of feet) if ((reading.ends[foot.name]!.touching = soleOnGround(s, foot))) foot.memory.ground = soleGroundHeight(s, foot);
    },
    command(muscles, goal, dt) {
      const { feet, state } = s, { reading, plan } = state;
      state.dt = dt;
      bindChannels(s, muscles);
      askNothing(s);
      state.gait = goal?.gait ?? s.tuning.gait;
      state.pose = goal?.pose ?? null;
      if (goal?.pose) {
        if (!Number.isFinite(goal.pose.pitch) || !(goal.pose.seconds > 0) || !Number.isFinite(goal.pose.seconds)
          || goal.feet.length < 1 || goal.feet.length > 2 || (goal.feet.length === 2 && goal.feet[0] === goal.feet[1])
          || goal.feet.some((end) => !s.names.includes(end)) || goal.swing || goal.walk)
          throw new Error("a supported root pose requires a finite pitch, positive response and one or two planted feet");
        if (goal.pose.anchors) for (const [end, anchor] of Object.entries(goal.pose.anchors))
          if (!goal.feet.includes(end) || !anchor || anchor.position.length !== 3 || anchor.rotation.length !== 4 || !anchor.position.every(Number.isFinite)
            || !anchor.rotation.every(Number.isFinite) || Math.abs(anchor.rotation.reduce((sum, v) => sum + v * v, 0) - 1) > 1e-8)
            throw new Error("a supported sole anchor requires a bearing foot, finite position and unit rotation");
        holdPose(s, goal, goal.pose);
        return;
      }
      for (const foot of feet) foot.memory.lifted = reading.ends[foot.name]!.touching ? 0 : foot.memory.lifted + dt;
      // Halted, the pace is nought within the step, whatever walk is asked, as if the gait's acceleration had no bound.
      paceToward(s, stepsOfItself(s, goal) && !goal!.halt ? goal!.walk : null, goal?.heading ?? 0, (goal?.height ?? 0) - s.rise, goal?.halt ? Infinity : dt);
      const phasing = chooseStep(s, goal);
      const bearing = bearerOf(s, goal, phasing);
      if (!goal || !state.last || bearing.length !== state.last.length || bearing.some((end) => !state.last!.includes(end))) {
        plan.on = false;
      }
      state.last = goal ? bearing : null;
      const stance = feet.filter((foot) => bearing.includes(foot.name));
      if (!goal || stance.length === 0) return;
      readSupport(feet, stance, reading.support);
      const c = reading.centre, vel = reading.velocity, g = gravityOf(s);
      const height = c.y - reading.support.y;
      // The plan is the body's: one gone from it by more than a leg's whole length, which no stance
      // reaches, is begun again from the body.
      if (!plan.on || hypot(plan.at.x - c.x, plan.at.y - height, plan.at.z - c.z) > legLength(stance[0]!, null)) {
        plan.at.set(c.x, height, c.z);
        plan.velocity.copyFrom(vel);
        plan.on = true;
      }
      // The pendulum is the plan's as this step finds it, before the plan goes on.
      const pendulum = g / Math.max(plan.at.y, LEAST_HEIGHT);
      const planned = advancePlan(s, goal, stance, phasing, pendulum, dt);
      shiftWeight(s, phasing, height, dt);
      const e = 1 / s.tuning.track;
      // A recovery is aimed facing the way the pelvis faces as it begins (`recoveryStep`), and the
      // pelvis holds that facing until a walk's step follows: a pelvis that turns on toward the
      // heading under a catch turns the landing it chose out from under the body, and the feet cross.
      if (state.step.recovering) state.step.facing ??= reading.facing;
      else state.step.facing = null;
      const heading = state.step.facing ?? goal.heading;
      aimRoot(s, heading, planned, height, e);
      holdStance(s, stance, e);
      // A step lands facing the heading as far as the bearing foot's hip lets the pelvis turn over it
      // (`landingHeading`): a turn past that is taken step by step.
      if (reading.phase === "swing" && phasing.phase !== "stand") swingFoot(s, phasing, landingHeading(phasing.bearer, heading), dt);
    },
  };
}

/** A planted-foot root pose, followed at its own response rather than by the walking pendulum. */
function holdPose(s: Stance, goal: StanceGoal, pose: NonNullable<StanceGoal["pose"]>): void {
  const { state, feet, pelvis } = s, { reading, aim, dt } = state, n = 1 / pose.seconds, gain = damping(n, dt);
  const bearing = goal.feet.length === feet.length ? feet : feet.filter(foot => goal.feet.includes(foot.name));
  readSupport(feet, bearing, reading.support);
  reading.phase = "stand"; reading.own = null; state.plan.on = false; state.last = goal.feet;
  state.step.swing = null; state.step.catching = false; state.step.recovering = false; state.stride = null; state.striding = null; state.pace.fill(0);
  const c = reading.centre, v = reading.velocity, p = reading.support;
  const [x, z] = goal.centre ? withinSupport(heldBy(bearing), goal.centre[0], goal.centre[1], 0) : [p.x, p.z];
  approachToRef(s.scratch.p.set(x, p.y + goal.height, z), c, v, n, dt, aim.centre);
  turnAboutToRef(Vector3.UpReadOnly, goal.heading, s.scratch.target);
  turnAboutToRef(s.scratch.wholeAxis.set(1, 0, 0), pose.pitch, s.scratch.footTurn);
  s.scratch.target.multiplyInPlace(s.scratch.footTurn).multiplyInPlace(pelvis.rest);
  turnToRef(pelvis.pose.rotation, s.scratch.target, pose.seconds, pelvis.body.angularVelocityToRef(s.scratch.pelvisSpin), dt, aim.spin);
  aim.on = true;
  for (const foot of bearing) {
    foot.memory.rolled = null;
    const task = state.tasks[feet.indexOf(foot)]!;
    motionAtToRef(foot.segment, foot.middle, task.linear, task.angular);
    const vy = task.linear.y;
    task.linear.scaleInPlace(-gain.decay); task.linear.y = gain.error * (p.y - foot.middle.y) - gain.rate * vy;
    task.angular.scaleInPlace(-gain.decay);
    const anchor = pose.anchors?.[foot.name];
    if (anchor) {
      motionAtToRef(foot.segment, foot.middle, s.scratch.v, s.scratch.pelvisSpin);
      approachToRef(s.scratch.p.set(...anchor.position), foot.middle, s.scratch.v, n, dt, task.linear);
      s.scratch.target.set(...anchor.rotation).multiplyInPlace(foot.segment.rest);
      turnToRef(foot.segment.pose.rotation, s.scratch.target, pose.seconds, s.scratch.pelvisSpin, dt, task.angular);
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
