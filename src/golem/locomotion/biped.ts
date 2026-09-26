import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import {
  PhysicsConstraintAxis,
  PhysicsConstraintMotorType,
  PhysicsMotionType,
} from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";
import type { PhysicsBody } from "@babylonjs/core/Physics/v2/physicsBody.js";
import type { Physics6DoFConstraint } from "@babylonjs/core/Physics/v2/physicsConstraint.js";
import type { Observer } from "@babylonjs/core/Misc/observable.js";

import type { Striking } from "../../combat.ts";
import { boxPart, capsulePart, joint, type Part } from "../../rig.ts";
import { supportedRootTargetToRef } from "../../supported-root-drive.ts";
import type { LocomotionRequest } from "../../supported-locomotion.ts";
import {
  PhysicalSupportedLocomotionPort,
  flatSupportedWorldRegistry,
} from "../../supported-locomotion-production.ts";
import {
  deriveLocomotionFootprint,
  type LocomotionFootprint,
  type DynamicRootSample,
  type SupportedRootAdapter,
  type WorldPoint,
} from "../../supported-locomotion-runtime.ts";
import {
  constructPostureIsSupported,
  type ConstructPostureEvidence,
  type StabilityAuthority,
} from "../../supported-locomotion-state.ts";
import { slewTowards } from "../anchor-drive.ts";
import {
  BENCH_STAND_LOCOMOTION, BENCH_STAND_LOCOMOTION_SIZE, LOCOMOTION_BIPED, LOCOMOTION_BIPED_SIZE,
} from "../config.ts";
import { materialForGolemRole } from "../materials.ts";
import { boneFootShell, bonePelvisShell } from "../bone-shells.ts";
import { LIMB_SHELL, type ShellLook } from "../effectors/shell.ts";
import {
  NO_STROKES,
  type EffectorView,
  type GolemPart,
  type ModuleBuild,
  type ModuleEnvelope,
} from "../module.ts";
import { attributeOf, withMovement, withRecovery, withSize, withTurning, withWeight } from "../attributes.ts";
import {
  LocomotionReadout,
  blankLocomotionEvidence,
  defineLocomotion,
  stepSoloCarrier,
  type BuiltLocomotion,
  type LocomotionCommand,
  type LocomotionEvidence,
  type LocomotionHeightRange,
  type LocomotionLoad,
  type LocomotionReadoutState,
  type LocomotionSupportBinding,
  legRuin,
  bodyReaders,
  KnockdownSettle,
  PATCH_CORNERS,
} from "../locomotion.ts";

/**
 * The biped: a pelvis carrier on two legs of thigh, shin and foot.
 *
 * **What moves the golem is the carrier, and the legs are what makes that readable.** The plan
 * set records why in one line that cost two sessions to learn: continuous dynamic-root balance
 * was tried at 240 Hz and both humanoid bodies lost foot evidence and fell inside the then-current
 * grace at rest. So the pelvis here is `ANIMATED` and follows a bodyless `VirtualLocomotionCarrier`
 * that has already resolved where the golem is allowed to be; the legs are driven, hittable,
 * severable bodies that prove support and sell the motion; and an authored knockdown is the one
 * thing that releases the pelvis to `DYNAMIC` and makes the whole assembly a ragdoll.
 *
 * `AGENTS.md` says plainly: do not "restore physics" by deleting `driveAnimatedRoot`; that
 * recreates the pile-up this system exists to avoid. Nothing in this file is trying to balance,
 * and no motor ceiling in `LOCOMOTION_BIPED` is holding the golem up.
 *
 * **The gait rule, in one paragraph.** The stride phase advances with the *carrier's committed*
 * speed rather than the root's, so a golem stopped by a wall stops stepping instead of marching on
 * the spot; the cadence is per metre travelled, so the feet keep pace with the ground; the swing
 * amplitude fades to nothing at rest, so standing still straightens the legs with no idle pose and
 * no blend to get wrong; and the crouch is solved through the law of cosines for the height the
 * carrier wants, so the sole stays on the floor while the hip drops. That is `legPose` in
 * `src/fighter.ts`, which the session plan names as the precedent, rewritten against this body's
 * own numbers and with an ankle added so the sole stays level.
 *
 * **Three traps this file is shaped by.**
 *
 * - *Foot contact does not prove a body is standing.* `postureEvidence` publishes root-up,
 *   root-above-feet and stack-above-root together, and `constructPostureIsSupported` -- not the
 *   fighter predicate, whose thresholds are a person's -- is what reads them.
 * - *A leg that can reach the splits looks broken the first time it is hit.* `hipAbduct` is
 *   0.20 rad and every stop here is checked against the pose the legs are **built** in, which is
 *   all three angles at zero; Session 03 found a joint stop that did not admit its own build pose
 *   and Havok cleared the violation by throwing a blade tip at 9.95 m/s from a motionless stand.
 * - *Righting an `ANIMATED` root by angular velocity does nothing at all.* Havok ignores x/z
 *   angular-velocity correction on a keyframed body, so `driveAnimatedRoot` uses the bounded
 *   transform target from `src/supported-root-drive.ts` below root-up 0.995 and the
 *   velocity/yaw drive above it.
 */

const UP = Object.freeze(new Vector3(0, 1, 0));

/**
 * Which way a positive hip abduction target carries a foot, relative to the golem's own right.
 *
 * Measured on the bench rather than derived from the frames -- see `bipedPose`, which carries both
 * columns of the sweep that decided it. It is a fact about how Havok reads this constraint's Z
 * axis against the frames `joint` builds, and the only honest way to learn it was to drive it.
 */
const ABDUCT_SIGN = -1;

const clamp = (value: number, low: number, high: number): number =>
  value < low ? low : value > high ? high : value;

const wrapAngle = (value: number): number => Math.atan2(Math.sin(value), Math.cos(value));

/** The eight joint angles one stride phase asks for, plus how far the hip has dropped. */
export interface BipedPose {
  readonly hipLeft: number;
  readonly hipRight: number;
  readonly kneeLeft: number;
  readonly kneeRight: number;
  readonly ankleLeft: number;
  readonly ankleRight: number;
  /**
   * The hip's abduction, radians, about the joint's own Z -- the leg swung sideways.
   *
   * **This axis was motorised and never written until 2026-09-05**, which is what made a strafe
   * look like a slide: the legs ran a fore-aft walk cycle underneath a body that was travelling
   * sideways, so every planted sole skated. Measured, the stillest planted sole slid at
   * **1136 mm/s** during a full-speed strafe, against a carrier doing 1200 -- the feet were
   * holding nothing at all. See `LOCOMOTION_BIPED.strideAbduct`.
   */
  readonly abductLeft: number;
  readonly abductRight: number;
  /** How far below the standing hip the supporting leg puts it, metres. */
  readonly hipDrop: number;
}

/**
 * The walk, as a pure function of where in the stride you are, how fast you are going, and how
 * far down you have been asked to crouch.
 *
 * Pure and exported so that `tests/golem-locomotion.test.mjs` can assert the geometry -- that a
 * crouch really solves to a sole on the floor, that no angle leaves its commanded range, that
 * standing still returns the build pose -- without a Havok scene at all. The physics half of the
 * claim is a separate test with real bodies in it.
 *
 * The ankle holds the sole level: relative rotations about one lateral axis add along the chain,
 * so `hip + knee + ankle = 0` is a flat foot, and the ankle is clamped rather than allowed to
 * follow a deep crouch past its own stop -- at which point the sole tilts, which is what a person
 * squatting on a flat floor also does.
 */
/**
 * How fast the *feet* are travelling over the ground, metres per second, for a committed move.
 *
 * The stride's cadence is per metre of foot travel rather than per metre of body travel, and on a
 * turn in place those are not the same number: the body goes nowhere and each foot walks a circle
 * of radius `hipSide`. Written beside `bipedPose` because it is the same decomposition -- a yaw is
 * a fore-aft differential of `yaw * maxYawSpeedRadS * hipSide` and the two feet's speeds are
 * averaged, which for a pure walk is the walk's speed and for a pure pivot is the pivot's.
 */
export function bipedFootSpeed(
  move: { forward: number; right: number; yaw: number }, B = LOCOMOTION_BIPED,
): number {
  const spin = clamp(move.yaw, -1, 1) * B.carrier.maxYawSpeedRadS;
  const differential = (spin * B.hipSide) / B.carrier.maxSpeedMps;
  const sideways = move.right + (spin * B.hipAhead) / B.carrier.maxSpeedMps;
  const left = Math.min(1, Math.hypot(move.forward + differential, sideways));
  const right = Math.min(1, Math.hypot(move.forward - differential, sideways));
  return ((left + right) / 2) * B.carrier.maxSpeedMps;
}

export function bipedPose(
  phase: number, forward: number, right: number, turn: number, crouch: number, B = LOCOMOTION_BIPED,
): BipedPose {
  const step = Math.sin(phase);
  const opposite = Math.sin(phase + Math.PI);

  // **Each foot gets its own travel, and a yaw is a fore-aft differential and nothing else.**
  // Rotating about +Y at w carries a point at `(x, 0, 0)` to a velocity of `(0, 0, -w x)`, and
  // both hips sit on the lateral axis at `hipSide * sign` -- so a turn in place asks the outside
  // foot to go forward by exactly as much as it asks the inside foot to go back, and asks neither
  // of them to go sideways. That is the arithmetic and it needs no sign to be guessed: `legSign`
  // is -1 for the left leg and +1 for the right, the same field the hips are placed from.
  const spin = clamp(turn, -1, 1) * B.carrier.maxYawSpeedRadS;
  const legForward = (legSign: number): number =>
    forward - (spin * B.hipSide * legSign) / B.carrier.maxSpeedMps;
  const forwardLeft = legForward(-1);
  const forwardRight = legForward(1);
  // Hips `hipAhead` in front of the pivot travel sideways on a turn, both the same way: a point at
  // `(x, 0, z)` goes at `w (z, 0, -x)`.
  const sideways = right + (spin * B.hipAhead) / B.carrier.maxSpeedMps;

  const thigh = B.thighLength;
  const shin = B.shinLength;
  const standing = thigh + shin;
  const wanted = standing - clamp(crouch, 0, 1) * B.crouchDepth;
  const kneeCos = clamp((wanted * wanted - thigh * thigh - shin * shin) / (2 * thigh * shin), -1, 1);
  const crouchKnee = Math.acos(kneeCos);
  // The hip cancels the chain's forward displacement, so the ankle stays under the hip rather
  // than swinging out in front of it as the knee folds. Straight from `legPose`.
  const crouchHip = -Math.atan2(shin * Math.sin(crouchKnee), thigh + shin * kneeCos);

  // **The stride is a vector and not a scalar**, which is the whole of the strafe fix. The swing
  // *amplitude* is how fast this foot is travelling and the *direction* is which way, so a pure
  // side-step is the same walk cycle turned a quarter turn rather than a forward walk played
  // underneath a body that is sliding. Taken per leg, because the yaw differential above makes
  // the two legs' travel genuinely different.
  const travelLeft = Math.min(1, Math.hypot(forwardLeft, sideways));
  const travelRight = Math.min(1, Math.hypot(forwardRight, sideways));
  const alongOf = (f: number, r: number): { fore: number; side: number } => {
    const size = Math.hypot(f, r);
    return size > 1e-9 ? { fore: f / size, side: r / size } : { fore: 0, side: 0 };
  };
  const alongLeft = alongOf(forwardLeft, sideways);
  const alongRight = alongOf(forwardRight, sideways);
  const swingLeft = B.strideSwing * travelLeft;
  const swingRight = B.strideSwing * travelRight;

  const hipLeft = clamp(crouchHip + step * swingLeft * alongLeft.fore,
    B.hipSwingMin, B.hipSwingMax);
  const hipRight = clamp(crouchHip + opposite * swingRight * alongRight.fore,
    B.hipSwingMin, B.hipSwingMax);
  // **The lateral half of the same stride.** `strideAbduct` is a smaller amplitude than
  // `strideSwing` because the hip's abduction stop is narrower than its flexion stop -- the
  // splits limit this file is shaped by -- so a side-step is a shuffle rather than a stride, and
  // that is anatomy rather than a compromise.
  //
  // `ABDUCT_SIGN` is measured and not derived. The fore-aft convention could be read off the
  // walk that already worked -- a planted foot has to travel backwards under the body, and a
  // walk that reads 115 mm/s of slip is a walk whose sign is right -- but nothing in this file
  // had ever written the Z axis, so its direction was a fifty-fifty guess. Swept both ways over a
  // full-speed strafe: +0.16 read 841 mm/s of planted-sole slip and -0.16 read 536, against 702
  // with the axis left at zero. A guess would have shipped a gait that braced *against* the
  // travel and still called itself a fix.
  const abductLeft = clamp(ABDUCT_SIGN * step * B.strideAbduct * travelLeft * alongLeft.side,
    -B.hipAbduct, B.hipAbduct);
  const abductRight = clamp(ABDUCT_SIGN * opposite * B.strideAbduct * travelRight * alongRight.side,
    -B.hipAbduct, B.hipAbduct);
  // The knee folds only on the way through, which is what `max(0, -sin(phase + kneeLiftPhase))`
  // is: a half-cycle of lift, phase-shifted so it peaks at mid-swing -- where the hip is passing
  // through neutral and the sole most needs to be off the floor. It scales on the *magnitude* of
  // the travel and not on its fore-aft part, so a foot swinging sideways or around a pivot is
  // lifted off the floor exactly as a foot swinging forward is. It was the fore-aft part until
  // 2026-09-05, which meant a strafing golem dragged both soles through the whole cycle.
  const kneeLeft = clamp(
    crouchKnee + Math.max(0, -Math.sin(phase + B.kneeLiftPhase)) * swingLeft * B.kneeLiftScale,
    B.kneeTargetMin, B.kneeTargetMax);
  const kneeRight = clamp(
    crouchKnee + Math.max(0, -Math.sin(phase + B.kneeLiftPhase + Math.PI))
      * swingRight * B.kneeLiftScale,
    B.kneeTargetMin, B.kneeTargetMax);
  const extension = (hip: number, knee: number): number =>
    thigh * Math.cos(hip) + shin * Math.cos(hip + knee);

  return Object.freeze({
    hipLeft, hipRight, kneeLeft, kneeRight, abductLeft, abductRight,
    // **The ankle levels the sole against the whole chain, and levelling it against the crouch
    // alone was measured and refused.** The idea was that a swing foot pitched toe-up clears the
    // ground; the sign says otherwise. A positive rotation about the joint's own +X carries the
    // foot's +Z to -Y, so what `-(hip + crouchKnee)` leaves during a folded swing is the toe
    // pointing *down* by the whole lift -- 1.2 rad of it -- and measured, the toe dug in, the
    // knees jammed at 1.4 rad against a commanded 0 and both soles never came back inside the
    // plant band. `-(hip + knee)` keeps the sole parallel to the floor through the whole cycle,
    // and the clamp below is what a deep crouch spends rather than an approximation.
    ankleLeft: clamp(-(hipLeft + kneeLeft), B.ankleTargetMin, B.ankleTargetMax),
    ankleRight: clamp(-(hipRight + kneeRight), B.ankleTargetMin, B.ankleTargetMax),
    // The longer leg is the supporting one, and following it is what keeps its sole on the floor
    // while the shorter alternating leg swings free.
    hipDrop: standing - Math.max(extension(hipLeft, kneeLeft), extension(hipRight, kneeRight)),
  });
}

/** How far the module's socket sits above the sole it is built standing on, metres. */
export const bipedStandHeight = (B = LOCOMOTION_BIPED): number => {
  return B.pelvisHeight / 2 + B.hipInset + B.thighLength + B.shinLength + B.footHeight;
};

/**
 * The staged rise's pelvis heights, the pelvis's centre above the floor, m: standing, and in the squat
 * with the feet `hipsBack` of a thigh in front of the hips and the knee at `kneeFold`.
 */
export function bipedRiseHeights(B = LOCOMOTION_BIPED): { readonly standY: number; readonly squatY: number } {
  const { thighLength: t, shinLength: s } = B;
  const reach = Math.sqrt(t * t + s * s + 2 * t * s * Math.cos(B.rise.kneeFold));
  const hip = riseHip(B.rise.trunkPitch, B);
  const ahead = B.rise.hipsBack * t + hip.behind;
  const below = Math.sqrt(Math.max(0, reach * reach - ahead * ahead));
  return Object.freeze({
    standY: B.hipInset + t + s + B.footHeight,
    squatY: B.footHeight + below + hip.below,
  });
}

/**
 * Where the hips are on a pelvis pitched forward by `pitch`: how far below its centre, and how far
 * behind where they stand upright, which is `hipAhead` in front of it. Both m.
 */
function riseHip(pitch: number, B = LOCOMOTION_BIPED): { readonly below: number; readonly behind: number } {
  return {
    below: B.hipInset * Math.cos(pitch) + B.hipAhead * Math.sin(pitch),
    behind: B.hipInset * Math.sin(pitch) + B.hipAhead * (1 - Math.cos(pitch)),
  };
}

/** The three stages of one rise, seconds, and the heights it runs between (`BipedRise`). */
export interface BipedRisePlan {
  /** The pelvis's centre above the floor where the rise began, m. */
  readonly startY: number;
  readonly squatY: number;
  readonly standY: number;
  readonly gatherS: number;
  readonly holdS: number;
  readonly extendS: number;
}

/**
 * The stages of a rise from a pelvis `startY` above the floor that turns `turnRad` from how it lies
 * to upright, stretched to last `durationS` when that is given: each lift and the turn a smoothstep,
 * whose peak is 1.5 times its mean, held to `risePeakMps` and `turnPeakRadS`.
 */
export function bipedRisePlan(startY: number, B = LOCOMOTION_BIPED, durationS?: number,
  turnRad = 0): BipedRisePlan {
  const { standY, squatY } = bipedRiseHeights(B);
  const peak = B.knockdown.risePeakMps;
  const gatherS = Math.max(B.rise.gatherS, 1.5 * Math.abs(squatY - startY) / peak,
    1.5 * Math.abs(turnRad) / B.rise.turnPeakRadS);
  const holdS = B.rise.holdS;
  const extendS = 1.5 * Math.max(0, standY - squatY) / peak;
  const stretch = durationS !== undefined && durationS > 0 ? durationS / (gatherS + holdS + extendS) : 1;
  return Object.freeze({ startY, squatY, standY, gatherS: gatherS * stretch, holdS: holdS * stretch,
    extendS: extendS * stretch });
}

/**
 * How long a biped's rise lasts, s, over `distanceM` from where its pelvis lies to where it will
 * stand, turning `turnRad` on the way: the port asks this before the rise, with the distance, so the
 * pelvis is taken to lie that far below standing (a rise that also relocates is taken as a lower
 * start, which only lengthens the gather).
 */
export function bipedRiseDurationS(distanceM: number, B = LOCOMOTION_BIPED, turnRad = 0): number {
  const plan = bipedRisePlan(bipedRiseHeights(B).standY - distanceM, B, undefined, turnRad);
  return plan.gatherS + plan.holdS + plan.extendS;
}

/**
 * How far a pelvis at `rotation` must turn to stand facing `yaw` pitched for the squat, rad: the
 * angle of the rise's own slerp (`driveRisingRoot`).
 */
export function bipedRiseTurnRad(rotation: Quaternion, yaw: number, B = LOCOMOTION_BIPED,
  scratch = new Quaternion()): number {
  Quaternion.RotationYawPitchRollToRef(yaw, B.rise.trunkPitch, 0, scratch);
  return 2 * Math.acos(Math.min(1, Math.abs(Quaternion.Dot(rotation, scratch))));
}

const smoothstep = (x: number): number => {
  const u = clamp(x, 0, 1);
  return u * u * (3 - 2 * u);
};

/** Where one rise has the pelvis at `elapsedS`: its height, its trunk pitch and how far back. */
export interface BipedRiseFrame {
  /** The pelvis's centre above the floor, m. */
  readonly y: number;
  /** The trunk's forward pitch, rad. */
  readonly pitch: number;
  /** How far behind the feet the pelvis is, m, along the body's heading. */
  readonly back: number;
  /** How far the pelvis has turned from how it lay to upright, 0 to 1. */
  readonly turned: number;
}

export function bipedRiseFrame(elapsedS: number, plan: BipedRisePlan, B = LOCOMOTION_BIPED): BipedRiseFrame {
  const back = B.rise.hipsBack * B.thighLength;
  const gathered = smoothstep(plan.gatherS > 0 ? elapsedS / plan.gatherS : 1);
  if (elapsedS < plan.gatherS + plan.holdS) {
    return Object.freeze({ y: plan.startY + (plan.squatY - plan.startY) * gathered,
      pitch: B.rise.trunkPitch, back: back * gathered, turned: gathered });
  }
  const u = plan.extendS > 0 ? (elapsedS - plan.gatherS - plan.holdS) / plan.extendS : 1;
  const lift = smoothstep(u);
  const lag = B.rise.trunkLag;
  return Object.freeze({ y: plan.squatY + (plan.standY - plan.squatY) * lift,
    pitch: B.rise.trunkPitch * (1 - smoothstep(lag < 1 ? (u - lag) / (1 - lag) : 1)),
    back: back * (1 - lift), turned: 1 });
}

/**
 * The legs' joint targets for a pelvis `y` above the floor, pitched forward by `pitch` and `back` behind
 * the feet: the two-link solve that puts the ankle over the floor under where the body will stand,
 * with the sole level. A pelvis too low for the folded leg to reach the floor puts the feet out in
 * front instead, knees up, as a body sitting on the floor has them.
 */
export function bipedRiseLegs(y: number, pitch: number, back: number, B = LOCOMOTION_BIPED):
  { readonly hip: number; readonly knee: number; readonly ankle: number } {
  const { thighLength: t, shinLength: s } = B;
  const shortest = Math.sqrt(t * t + s * s + 2 * t * s * Math.cos(B.kneeTargetMax));
  const longest = t + s - 1e-4;
  const hipAt = riseHip(pitch, B);
  const below = Math.max(0, y - hipAt.below - B.footHeight);
  let ahead = back + hipAt.behind;
  let reach = Math.hypot(ahead, below);
  if (reach < shortest) {
    ahead = Math.sqrt(shortest * shortest - below * below);
    reach = shortest;
  }
  reach = Math.min(reach, longest);
  const knee = Math.acos(clamp((reach * reach - t * t - s * s) / (2 * t * s), -1, 1));
  const hip = clamp(-Math.atan2(ahead, below) - Math.atan2(s * Math.sin(knee), t + s * Math.cos(knee)) - pitch,
    B.hipJointMin + 0.05, B.hipJointMax - 0.05);
  const bend = clamp(knee, B.kneeTargetMin, B.kneeTargetMax);
  // The sole is levelled from the hip the joint can reach: a hip at its stop moves the foot a few
  // centimetres, and a tilted sole would stand it on an edge.
  return Object.freeze({ hip, knee: bend, ankle: clamp(-(pitch + hip + bend), B.ankleTargetMin, B.ankleTargetMax) });
}

const bipedHeightRange = (B = LOCOMOTION_BIPED): LocomotionHeightRange => Object.freeze({
  standM: bipedStandHeight(B),
  crouchM: bipedStandHeight(B) - B.crouchDepth,
});

const bipedFootprint = (B = LOCOMOTION_BIPED, id = "locomotion.biped"): LocomotionFootprint => deriveLocomotionFootprint({
  radiusM: B.footprintRadius,
  heightM: B.footprintHeight,
  provenance: {
    profileId: id,
    source: "golem-bind-geometry",
    measuredAt: "constructor-bind-pose",
  },
});

const SUPPORT_BINDINGS: readonly LocomotionSupportBinding[] = Object.freeze([
  Object.freeze({ role: "left-foot", label: "left sole" }),
  Object.freeze({ role: "right-foot", label: "right sole" }),
]);

/**
 * A biped's table at a movement stat: the carrier's travel scaled (`withMovement`), and the gait
 * re-timed so that the legs can still sell it.
 *
 * **The legs have a step frequency, and a stride run below it skates.** `strideCadence` is per
 * metre, so a carrier scaled alone slows the stepping by the same factor -- and below about 2
 * cycles a second (x1's own 3.95 x 3.2 / 2 pi = 2.01) the planted sole stops holding: at x0.75
 * the stance foot moved at 1958 mm/s against the pelvis's 2400, dragged along rather than walked
 * on. Raising the cadence per metre by 1/movement holds the cycle at x1's frequency and takes
 * shorter steps instead, and that is the whole cure. Shrinking the swing to match the shorter
 * step is exactly wrong: at x0.75 a swing of 0.437 rad, the one whose excursion equals the step,
 * read 849 mm/s against 198 at the full 0.60.
 *
 * **Above x1 the cadence per metre is kept and the joints are let go faster.** A longer step
 * would need more hip than the 0.50 rad stop gives, so a faster body steps faster; what binds
 * then is `targetRate`, the slew on every joint command, and joint lag jumped from 0.40 rad to
 * 1.0 at x1.1 with it left alone. It is scaled by the movement.
 *
 * Node harness, `runGolemLocomotion` on the stone biped, 1 s standing, 1.75 s at full forward
 * command, 1 s stopped; mean planted-sole slip in mm/s against `meanFootSlipBudgetMps` 300:
 *
 *     movement          0.50   0.60   0.75   0.90   1.00   1.10   1.25   1.50
 *     carrier only       612    730   1010    231    186    762    693    659
 *     re-timed           208    243    199    162    186    193    204    219
 *     skeleton, re-timed 453    440    275    181    180    200    203    286
 *
 * The skeleton builds from this definition with `HUMAN_BIPED`, and its slow end is why the stat's
 * range stops at x0.75. 2026-09-23.
 *
 * **Not the multileg's rule.** Its six legs read worse under both halves of it -- 400 mm/s at
 * x0.75 against 237 with the carrier alone, 786 at x1.5 against 627 -- so it takes the carrier
 * scale and nothing else.
 *
 * At x1 the very table it was handed comes back, as `withMovement` promises.
 */
export function bipedAtMovement<T extends typeof LOCOMOTION_BIPED>(table: T, movement: number): T {
  if (movement === 1) return table;
  return {
    ...withMovement(table, movement),
    strideCadence: table.strideCadence / Math.min(1, movement),
    targetRate: table.targetRate * Math.max(1, movement),
  };
}

/** One leg's three bodies and three joints, kept together so severing one is one edit. */
interface BipedLeg {
  readonly role: string;
  readonly sign: number;
  readonly thigh: Part;
  readonly shin: Part;
  readonly foot: Part;
  hip: Physics6DoFConstraint | null;
  knee: Physics6DoFConstraint | null;
  ankle: Physics6DoFConstraint | null;
  severed: boolean;
  /** Where the sole was last substep, for the slip reading. */
  readonly lastSole: Vector3;
  lastPlanted: boolean;
}

export function bipedDefinition(id: string, label: string, table = LOCOMOTION_BIPED) {
return defineLocomotion({
  id,
  slots: Object.freeze(["locomotion" as const]),
  label,
  massKg: table.pelvisMass +
    2 * (table.thighMass + table.shinMass + table.footMass),
  carrier: table.carrier,
  heightRange: bipedHeightRange(table),
  footprint: bipedFootprint(table, id),
  supportBindings: SUPPORT_BINDINGS,

  build(ctx: ModuleBuild): BuiltLocomotion {
    // This body's own table: the carrier's travel scaled by its movement stat and its yaw by its
    // turning stat, read by the port, the stride and the envelope alike (`withMovement` says why
    // all of them), the gait re-timed to carry the travel (`bipedAtMovement`), and the knockdown's
    // lie shortened by its recovery stat (`withRecovery`).
    const recovery = attributeOf(ctx, "recovery");
    // And its parts' masses times its weight stat (`withWeight`), which `ownMassKg` below reads too.
    // Then every field at its size stat by its law (`withSize`), the stats above included: a larger
    // body walks as a larger body does, with each of them on top.
    const size = attributeOf(ctx, "size");
    const B = withSize(withWeight(withRecovery(bipedAtMovement(withTurning(table, attributeOf(ctx, "turning")),
      attributeOf(ctx, "movement")), recovery),
    ["pelvisMass", "thighMass", "shinMass", "footMass"], attributeOf(ctx, "weight")),
    LOCOMOTION_BIPED_SIZE, size);
    // The stability stat, published on every authority this body hands its port as a plain factor
    // on its thresholds (`stabilityCapacity` in `src/supported-locomotion-state.ts`).
    const stability = attributeOf(ctx, "stability");
      const socket = ctx.socket;
    const facing = socket.rotation;
    const stone = materialForGolemRole(ctx.materials, "shell");
    const bronze = materialForGolemRole(ctx.materials, "joint");
    const standHeight = bipedStandHeight(B);
    const footprint = bipedFootprint(B, id);

    /** A point in the golem's own upright frame, carried into the world through the socket. */
    const local = new Vector3();
    const place = (x: number, downFromSocket: number, z: number): Vector3 => {
      local.set(x, -downFromSocket, z);
      const out = new Vector3();
      local.rotateByQuaternionToRef(facing, out);
      return out.addInPlace(socket.world);
    };

    // --- the build pose --------------------------------------------------------------------
    //
    // Every angle is zero: the legs are built straight and standing, the sole exactly on the
    // ground the socket implies. That is checked rather than claimed -- `tests/golem-locomotion`
    // measures the built sole against the floor -- because the alternative is a module that
    // agrees with the stand's socket height only by coincidence.
    const pelvisDown = B.pelvisHeight / 2;
    const hipDown = pelvisDown + B.hipInset;
    const kneeDown = hipDown + B.thighLength;
    const ankleDown = kneeDown + B.shinLength;
    // `ankleDown + footHeight` is `standHeight` exactly, which is the arithmetic the whole module
    // stands on: the sole lands on the ground the socket implies, or the socket is in the wrong
    // place and the test that measures it says so.

    const pelvis = boxPart(ctx.scene, {
      name: `${ctx.name}.pelvis`,
      position: place(0, pelvisDown, 0),
      rotation: facing,
      size: new Vector3(B.pelvisWidth, B.pelvisHeight, B.pelvisDepth),
      mass: B.pelvisMass,
      layer: ctx.layers.body,
      collidesWith: ctx.layers.bodyCollidesWith,
      material: stone,
      // The carrier's own root. `ANIMATED` while supported: it is keyframed onto what the virtual
      // carrier resolved, which is the whole design. A knockdown flips it to `DYNAMIC`.
      motionType: PhysicsMotionType.ANIMATED,
    });
    pelvis.body.setLinearDamping(B.linearDamping);
    pelvis.body.setAngularDamping(B.angularDamping);

    const legs: BipedLeg[] = (["left-foot", "right-foot"] as const).map((role, index) => {
      const sign = index === 0 ? -1 : 1;
      const x = B.hipSide * sign;
      const suffix = index === 0 ? "L" : "R";
      const thigh = capsulePart(ctx.scene, {
        name: `${ctx.name}.thigh${suffix}`,
        position: place(x, hipDown + B.thighLength / 2, B.hipAhead),
        rotation: facing,
        height: B.thighLength,
        radius: B.thighRadius,
        mass: B.thighMass,
        layer: ctx.layers.body,
        collidesWith: ctx.layers.bodyCollidesWith,
        material: stone,
        visible: false,
      });
      const shin = capsulePart(ctx.scene, {
        name: `${ctx.name}.shin${suffix}`,
        position: place(x, kneeDown + B.shinLength / 2, B.hipAhead),
        rotation: facing,
        height: B.shinLength,
        radius: B.shinRadius,
        mass: B.shinMass,
        layer: ctx.layers.body,
        collidesWith: ctx.layers.bodyCollidesWith,
        material: stone,
        visible: false,
      });
      // The foot is a slab and it is the only body here with a friction number of its own: it is
      // the one that touches the world, and how much grip a sole has is what decides whether a
      // planted leg drags or skates. Offset forward so the ankle sits at the heel third, which is
      // where an ankle is.
      const foot = boxPart(ctx.scene, {
        name: `${ctx.name}.foot${suffix}`,
        position: place(x, ankleDown + B.footHeight / 2, B.hipAhead + B.footLength * 0.18),
        rotation: facing,
        size: new Vector3(B.footWidth, B.footHeight, B.footLength),
        mass: B.footMass,
        layer: ctx.layers.body,
        collidesWith: ctx.layers.bodyCollidesWith,
        material: stone,
        friction: B.footFriction,
      });
      for (const part of [thigh, shin, foot]) {
        part.body.setLinearDamping(B.linearDamping);
        part.body.setAngularDamping(B.angularDamping);
      }
      return {
        role, sign, thigh, shin, foot,
        hip: null, knee: null, ankle: null, severed: false,
        lastSole: new Vector3(), lastPlanted: false,
      };
    });

    // --- the joints ---------------------------------------------------------------------------
    //
    // One constraint type throughout, as `rig.ts` insists: a hinge is a ball joint with two axes
    // pinned. The hip keeps a narrow abduction and twist -- the splits limit -- and the knee and
    // ankle are pure hinges about the same lateral the hip flexes on, so the three angles add and
    // the leg's extension is `thigh cos(hip) + shin cos(hip + knee)`.
    for (const leg of legs) {
      const x = B.hipSide * leg.sign;
      leg.hip = joint(ctx.scene, pelvis, leg.thigh, {
        pivotParent: new Vector3(x, -B.hipInset, B.hipAhead),
        pivotChild: new Vector3(0, B.thighLength / 2, 0),
        swing: {
          x: { min: B.hipJointMin, max: B.hipJointMax },
          y: { min: -B.hipTwist, max: B.hipTwist },
          z: { min: -B.hipAbduct, max: B.hipAbduct },
        },
        damping: B.motorDamping,
      });
      leg.knee = joint(ctx.scene, leg.thigh, leg.shin, {
        pivotParent: new Vector3(0, -B.thighLength / 2, 0),
        pivotChild: new Vector3(0, B.shinLength / 2, 0),
        swing: { x: { min: B.kneeJointMin, max: B.kneeJointMax } },
        damping: B.motorDamping,
      });
      leg.ankle = joint(ctx.scene, leg.shin, leg.foot, {
        pivotParent: new Vector3(0, -B.shinLength / 2, 0),
        pivotChild: new Vector3(0, B.footHeight / 2, -B.footLength * 0.18),
        swing: {
          x: { min: B.ankleJointMin, max: B.ankleJointMax },
          z: { min: -B.ankleRoll, max: B.ankleRoll },
        },
        damping: B.motorDamping,
      });
    }

    /**
     * The waist, and why a locomotion module builds one at all.
     *
     * `GolemSocket.mount` is "the body this module hangs from", and locomotion inverts that: the
     * mount rides on the module. So the relationship is decided by a *measured* property of the
     * mount rather than by a mode flag -- a `DYNAMIC` mount is a load and gets a soft motorised
     * waist, an `ANIMATED` one is a fixed anchor and is left alone. On the bench that is the
     * stand's ride block.
     *
     * **Session 08 settled the open question this comment used to leave: the torso owns the
     * waist, and this rule already yields it.** In an assembly there is nothing above the root at
     * build time -- the root is what decides where the ground is, so it is built first -- and the
     * assembly hands it an inert `ANIMATED` base frame, which lands on the branch that builds no
     * joint at all. The torso module is then bolted to the pelvis and builds the waist it drives
     * from `Intent.posture`, which is the joint a person actually turns. What the assembly owes in
     * exchange is `carry`, below, because a module that built no waist still has to know what it
     * is holding up.
     */
    const carriedAtBuild = ctx.socket.mount.body.getMotionType() === PhysicsMotionType.DYNAMIC;
    /** The load, from the mount at build or from `carry` afterwards. Never both. */
    let load: Part | null = carriedAtBuild ? ctx.socket.mount : null;
    let carriedMassKg = carriedAtBuild ? ctx.socket.mount.body.getMassProperties().mass ?? 0 : 0;
    const L = withSize(BENCH_STAND_LOCOMOTION, BENCH_STAND_LOCOMOTION_SIZE, size);
    let waist: Physics6DoFConstraint | null = carriedAtBuild
      ? joint(ctx.scene, pelvis, ctx.socket.mount, {
        pivotParent: new Vector3(0, B.pelvisHeight / 2, 0),
        pivotChild: socket.local.clone(),
        swing: {
          x: { min: -L.waistLean, max: L.waistLean },
          y: { min: -L.waistTwist, max: L.waistTwist },
          z: { min: -L.waistLean, max: L.waistLean },
        },
        damping: L.waistDamping,
      })
      : null;
    if (waist) {
      for (const axis of [PhysicsConstraintAxis.ANGULAR_X, PhysicsConstraintAxis.ANGULAR_Y,
        PhysicsConstraintAxis.ANGULAR_Z]) {
        waist.setAxisMotorType(axis, PhysicsConstraintMotorType.POSITION);
        waist.setAxisMotorTarget(axis, 0);
        waist.setAxisMotorMaxForce(axis, L.waistTorque);
      }
    }

    // --- the shell ----------------------------------------------------------------------------
    const shells: AbstractMesh[] = [];
    const footPlate = (leg: BipedLeg, suffix: string): readonly AbstractMesh[] => {
      // A plain foot, per the session plan: one bronze band across the toe of the slab, so the
      // sole reads as a sole rather than as the end of a box. No body, no collider, no authority.
      const band = MeshBuilder.CreateBox(`${ctx.name}.foot${suffix}.band`, {
        width: B.footWidth * 1.04, height: B.footHeight * 0.34, depth: B.footLength * 0.22,
      }, ctx.scene);
      band.material = bronze;
      band.isPickable = false;
      band.parent = leg.foot.mesh;
      band.position.set(0, -B.footHeight * 0.18, B.footLength * 0.30);
      band.rotationQuaternion = Quaternion.Identity();
      return Object.freeze([band]);
    };
    // The pelvis and the foot differ in shape between the looks, so each has its own record. A
    // carved pelvis is its own collider, drawn, as it always was.
    const pelvisShell: Readonly<Record<ShellLook, () => readonly AbstractMesh[]>> = {
      carved: () => Object.freeze([pelvis.mesh]),
      bone: () => bonePelvisShell(ctx.scene, { name: pelvis.name, host: pelvis.mesh,
        width: B.pelvisWidth, height: B.pelvisHeight, depth: B.pelvisDepth, materials: ctx.materials }),
    };
    const footShell: Readonly<Record<ShellLook, (leg: BipedLeg, suffix: string) => readonly AbstractMesh[]>> = {
      carved: footPlate,
      bone: (leg) => boneFootShell(ctx.scene, { name: leg.foot.name, host: leg.foot.mesh,
        length: B.footLength, width: B.footWidth, height: B.footHeight, materials: ctx.materials }),
    };

    const parts: GolemPart[] = [Object.freeze({
      id: pelvis.name,
      part: pelvis,
      shell: pelvisShell[B.look](),
      health: B.pelvisHealth,
      vitalityWeight: B.pelvisVitalityWeight,
      // **The one fatal part in the module.** Losing an effector costs a golem an arm; losing the
      // carrier is the end of it, and Session 08's vitality rule needs somebody to say so.
      fatal: true,
    })];
    for (const [index, leg] of legs.entries()) {
      const suffix = index === 0 ? "L" : "R";
      const thighShell = LIMB_SHELL[B.look](ctx.scene, {
        name: leg.thigh.name, host: leg.thigh.mesh, length: B.thighLength,
        radius: B.thighRadius, taper: 0.32, materials: ctx.materials,
      });
      const shinShell = LIMB_SHELL[B.look](ctx.scene, {
        name: leg.shin.name, host: leg.shin.mesh, length: B.shinLength,
        radius: B.shinRadius, taper: 0.28, materials: ctx.materials,
      });
      const plate = footShell[B.look](leg, suffix);
      shells.push(...thighShell, ...shinShell, ...plate);
      parts.push(
        Object.freeze({ id: leg.thigh.name, part: leg.thigh, shell: thighShell,
          health: B.thighHealth, vitalityWeight: B.thighVitalityWeight, fatal: false }),
        Object.freeze({ id: leg.shin.name, part: leg.shin, shell: shinShell,
          health: B.shinHealth, vitalityWeight: B.shinVitalityWeight, fatal: false }),
        Object.freeze({ id: leg.foot.name, part: leg.foot, shell: plate,
          health: B.footHealth, vitalityWeight: B.footVitalityWeight, fatal: false }),
      );
    }
    const frozenParts: readonly GolemPart[] = Object.freeze(parts);
    const ruin = legRuin(legs.map((leg) => [leg.thigh.name, leg.shin.name, leg.foot.name]));

    // --- state --------------------------------------------------------------------------------
    const groundY = socket.world.y - standHeight;
    const standingPelvisY = socket.world.y - pelvisDown;
    const ownMassKg = B.pelvisMass + 2 * (B.thighMass + B.shinMass + B.footMass);
    /**
     * The mass the carrier is holding up, read live rather than frozen at build.
     *
     * A function and not a constant because `carry` can arrive one module later. Everything that
     * reads it -- the port's stability arithmetic and the fallback bounded motor -- asks per
     * boundary, so a load declared after construction is accounted for from the next substep and
     * a bench module whose load was its mount reads exactly the number it always did.
     */
    const supportedMass = (): number => ownMassKg + carriedMassKg;
    /**
     * The whole body the port's tipping geometry is read from (physical contact session 08): every
     * part the assembly says is on it once a load declares them (`LocomotionLoad.parts`), and
     * otherwise this module's own live parts and its load's body.
     */
    let carriedParts: (() => Iterable<Part>) | null = null;
    const ownParts = function* (): Iterable<Part> {
      yield pelvis;
      for (const leg of legs) if (!leg.severed) { yield leg.thigh; yield leg.shin; yield leg.foot; }
      if (load) yield load;
    };
    const readers = bodyReaders(() => (carriedParts ?? ownParts)());
    const yaw = facing.toEulerAngles().y;

    let stride = 0;
    let crouchLevel = 0;
    let wantedCrouch = 0;
    let request: LocomotionRequest = Object.freeze({
      localForward: 0, localRight: 0, yaw: 0,
    });
    let severed = false;
    let risingStart: Quaternion | null = null;
    /** The rise under way (`bipedRisePlan`), fixed on its first frame, and where its last frame put the pelvis. */
    let risePlan: BipedRisePlan | null = null;
    let riseFrame: BipedRiseFrame | null = null;
    let port: PhysicalSupportedLocomotionPort | null = null;
    let elapsed = 0;
    let contacts = 0;
    let selfContacts = 0;
    /**
     * How far below standing the last solved stride puts the hip, metres.
     *
     * Held rather than re-solved inside `driveAnimatedRoot`, and that is not only an allocation:
     * the drive runs from `commitPhysical`, which is *earlier* in the same substep than `gait`, so
     * re-solving there would give the root a height from a stride phase the legs have not been
     * given yet. One substep of lag at 240 Hz, and the root and the legs agree about which pose
     * they are in.
     */
    let hipDrop = 0;
    /** Whether a fallen body's fall has come to rest (`KnockdownSettle`). */
    const settle = new KnockdownSettle(B.knockdown);

    const watchers: [PhysicsBody, Observer<unknown>][] = [];
    const commanded = {
      hipLeft: 0, hipRight: 0, kneeLeft: 0, kneeRight: 0, ankleLeft: 0, ankleRight: 0,
      abductLeft: 0, abductRight: 0,
    };
    const evidence = blankLocomotionEvidence();
    const readout = new LocomotionReadout();

    const scratch = {
      up: new Vector3(),
      other: new Vector3(),
      inverse: new Quaternion(),
      relative: new Quaternion(),
      euler: new Vector3(),
      sole: new Vector3(),
      corner: new Vector3(),
      velocity: new Vector3(),
      drive: new Vector3(),
      angular: new Vector3(),
      target: new Vector3(),
      desired: new Quaternion(),
      rotation: new Quaternion(),
      rising: new Quaternion(),
      upright: new Quaternion(),
    };
    const riseTurnRad = (yaw: number): number => {
      const live = pelvis.mesh.rotationQuaternion;
      return live ? bipedRiseTurnRad(live, yaw, B, scratch.upright) : 0;
    };
    const rootSample: {
      motionType: DynamicRootSample["motionType"];
      position: { x: number; y: number; z: number };
      velocity: { x: number; y: number; z: number };
      massKg: number;
      released: boolean;
    } = {
      motionType: "animated",
      position: { x: 0, y: 0, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      massKg: supportedMass(),
      released: false,
    };

    /**
     * Refresh the root reading once per substep.
     *
     * **The budget is the number of boundary reads, not the number of `Vector3`s.**
     * `getLinearVelocityToRef` is not allocation-free -- the emscripten glue builds a fresh array
     * per call, 216 B -- and the port samples the root three or four times per boundary. So the
     * velocity is read once here and every sample reads it back; `mesh.position` and
     * `mesh.rotationQuaternion` cost nothing at all and are re-read each time, which also means
     * nothing in this file touches `getWorldMatrix()` and stamps a render id.
     */
    const refreshRoot = (): void => {
      pelvis.body.getLinearVelocityToRef(scratch.velocity);
      rootSample.velocity.x = scratch.velocity.x;
      rootSample.velocity.y = scratch.velocity.y;
      rootSample.velocity.z = scratch.velocity.z;
    };

    const adapter: SupportedRootAdapter = {
      sample: (): DynamicRootSample => {
        const motion = pelvis.body.getMotionType();
        rootSample.motionType = motion === PhysicsMotionType.DYNAMIC ? "dynamic"
          : motion === PhysicsMotionType.ANIMATED ? "animated" : "static";
        rootSample.position.x = pelvis.mesh.position.x;
        rootSample.position.y = pelvis.mesh.position.y;
        rootSample.position.z = pelvis.mesh.position.z;
        rootSample.released = severed;
        return rootSample as DynamicRootSample;
      },
      // Only ever reached if something makes the root `DYNAMIC` without releasing it, which this
      // module never does; kept correct rather than kept as a throw, because the bounded motor is
      // the fallback the port takes when `driveAnimatedRoot` is absent and a later assembly may
      // supply a different root. Gravity is cancelled, as the Fighter's adapter cancels it.
      applyForce: (force: WorldPoint): void => {
        scratch.drive.set(force.x, force.y + supportedMass() * 9.81, force.z);
        pelvis.body.applyForce(scratch.drive, pelvis.mesh.position);
      },
      clearDrive: (): void => {
        if (pelvis.body.getMotionType() !== PhysicsMotionType.ANIMATED) return;
        scratch.drive.set(0, 0, 0);
        pelvis.body.setLinearVelocity(scratch.drive);
        pelvis.body.setAngularVelocity(scratch.drive);
      },
    };

    /**
     * One joint's achieved angle about its own hinge axis, radians.
     *
     * `mesh.rotationQuaternion` and nothing else, on both sides: `getWorldMatrix()` short-circuits
     * on the render id and *reading* it stamps that id, which silently turns every later reader in
     * the frame into a reader of this sample -- a defect that has cost three sessions here and
     * produced a clean nine per cent phantom regression. Every body in a golem module is a
     * scene-root node, so those two fields are the world transform.
     */
    const relativeX = (parent: Part, child: Part): number => {
      (parent.mesh.rotationQuaternion ?? Quaternion.Identity()).conjugateToRef(scratch.inverse);
      scratch.inverse.multiplyToRef(child.mesh.rotationQuaternion ?? Quaternion.Identity(),
        scratch.relative);
      scratch.relative.toEulerAnglesToRef(scratch.euler);
      return scratch.euler.x;
    };

    const rootUp = (): Vector3 => {
      UP.rotateByQuaternionToRef(pelvis.mesh.rotationQuaternion ?? Quaternion.Identity(), scratch.up);
      return scratch.up;
    };

    /** The world point of one sole: the foot's own bottom face, carried by the foot's rotation. */
    const solePoint = (leg: BipedLeg, into: Vector3): Vector3 => {
      into.set(0, -B.footHeight / 2, 0);
      into.rotateByQuaternionToRef(leg.foot.mesh.rotationQuaternion ?? Quaternion.Identity(), into);
      return into.addInPlace(leg.foot.mesh.position);
    };

    const meanSoleY = (): number => {
      let sum = 0;
      let count = 0;
      for (const leg of legs) {
        if (leg.severed) continue;
        sum += solePoint(leg, scratch.sole).y;
        count += 1;
      }
      return count > 0 ? sum / count : pelvis.mesh.position.y;
    };

    const postureEvidence = (): ConstructPostureEvidence => Object.freeze({
      // Both legs still attached. `chainContinuous` is the construct record's name for it, and a
      // golem with one leg is not a golem that can prove it is standing.
      chainContinuous: !severed && legs.every((leg) => !leg.severed),
      // The three signals the trap demands, together, in the frozen record's own field names:
      // `carrier` is the root's own up, `root above carrier` is the root above its soles, and
      // `terminal above root` is what the root is carrying, above the root.
      carrierUpDot: rootUp().y,
      rootHeightAboveCarrierM: pelvis.mesh.position.y - meanSoleY(),
      // `load` and not `carried`: an assembly declares its load through `carry` one module after
      // the root is built, and until something is declared the honest third signal is the only
      // one this module can see. A body with nothing on it has no stack to measure.
      terminalHeightAboveRootM: load
        ? load.mesh.position.y - pelvis.mesh.position.y
        : pelvis.mesh.position.y - meanSoleY(),
    });

    /**
     * What the carrier committed to this boundary, in its own normalised terms.
     *
     * All three are fractions of the carrier's own ceilings and that is the port's convention
     * rather than this module's: `PhysicalSupportedLocomotionPort` divides the achieved
     * displacement by `maxSpeedMps * dt` and the achieved turn by `maxYawSpeedRadS * dt` before
     * publishing them, so what comes back is -1..1 on every axis.
     */
    const carrierMove = (): { forward: number; right: number; yaw: number } => {
      const allowed = port?.priorAllowed() ?? null;
      if (!allowed) return { forward: 0, right: 0, yaw: 0 };
      return { forward: allowed.localForward, right: allowed.localRight, yaw: allowed.yaw };
    };

    const carrierSpeed = (): number => {
      const move = carrierMove();
      return Math.min(1, Math.hypot(move.forward, move.right)) * B.carrier.maxSpeedMps;
    };

    // What a body in mid-stride is worth against a blow is its geometry's (`supportPatch`), so the
    // authority carries no live field.
    const authority = (): StabilityAuthority => {
      return Object.freeze({
        carrierPartId: pelvis.name,
        supportBindings: Object.freeze(SUPPORT_BINDINGS.map(({ role }) => Object.freeze({ role }))),
        stabilityScale: stability,
        recoveryScale: recovery,
        sizeScale: size,
      });
    };

    const world = ctx.world ?? flatSupportedWorldRegistry();

    const activePort = new PhysicalSupportedLocomotionPort({
      id: `${ctx.name}.locomotion`,
      position: { x: pelvis.mesh.position.x, y: standingPelvisY, z: pelvis.mesh.position.z },
      yaw,
      footprint,
      ownerPartIds: new Set(frozenParts.map(({ id }) => id)),
      root: adapter,
      registry: world,
      config: B.carrier,
      // A getter, because a golem's load is bolted on one module after the root is built and
      // the port reads this every safe boundary. `PhysicalSupportedLocomotionOptions` declares
      // it `readonly`, which a getter satisfies; a plain number here would freeze the carrier's
      // idea of its own mass at the legs alone and hand every shove a body eight times too
      // light to resist it.
      get supportedMassKg(): number { return supportedMass(); },
      authority,
      supportBindings: Object.freeze(SUPPORT_BINDINGS.map(({ role }) => role)),
      supportPoint: (binding: string): WorldPoint | null => {
        const leg = legs.find((candidate) => candidate.role === binding);
        if (!leg || leg.severed) return null;
        const point = solePoint(leg, scratch.sole);
        return { x: point.x, y: point.y, z: point.z };
      },
      // The sole's four bottom corners, planted or not: a biped's base is its stance.
      supportPatch: (binding: string): WorldPoint[] | null => {
        const leg = legs.find((candidate) => candidate.role === binding);
        if (!leg || leg.severed) return null;
        const rotation = leg.foot.mesh.rotationQuaternion ?? Quaternion.Identity();
        return PATCH_CORNERS.map(([across, along]) => {
          scratch.corner.set(across * B.footWidth / 2, -B.footHeight / 2, along * B.footLength / 2);
          scratch.corner.rotateByQuaternionToRef(rotation, scratch.corner).addInPlace(leg.foot.mesh.position);
          return { x: scratch.corner.x, y: scratch.corner.y, z: scratch.corner.z };
        });
      },
      massDistribution: readers.mass,
      groundContacts: readers.ground,
      liveSupport: () => !severed && legs.every((leg) => !leg.severed),
      postureSupported: () => constructPostureIsSupported(postureEvidence()),
      fallSettled: (): boolean => settle.settled,
      risingDuration: (distanceM: number, yaw: number): number =>
        Math.max(settle.risingDurationS(distanceM, size), bipedRiseDurationS(distanceM, B, riseTurnRad(yaw))),

      /**
       * The supported drive, and the two halves of it are not interchangeable.
       *
       * Above root-up 0.995 the body is upright and what it needs is to *move*: a linear velocity
       * from the carrier, a vertical from the crouch solve, and a yaw rate. Below it the body has
       * been tilted by something -- a contact, a clinch, a glancing blow -- and an `ANIMATED`
       * Havok root ignores x/z angular-velocity correction outright, so asking it to right itself
       * that way does nothing at all and the golem stays leaning for ever. The bounded transform
       * target from `src/supported-root-drive.ts` is what rights it, and it is bounded rather than
       * exact because a one-step upright snap can launch every joint attached to the root.
       */
      driveAnimatedRoot: (targetPosition, targetVelocity, targetYaw, dt): void => {
        const rotation = pelvis.mesh.rotationQuaternion ?? Quaternion.Identity();
        const wantedY = standingPelvisY - hipDrop;
        // **The height is tracked exactly, under a ceiling, rather than through a lag.** The
        // stride's own bob is a solved geometric quantity -- how far the supporting leg's
        // extension puts the hip below standing -- and a first-order response behind it lifts the
        // stance foot off the floor twice a step: measured, the sole left the 0.02 m plant band
        // for whole substeps at a time and `plantedFeet` fell to zero mid-stride. The smoothing a
        // crouch wants is on the *crouch level*, which `gait` slews, and not here.
        // **The height is tracked exactly, under a ceiling, rather than through a lag.** The
        // stride's own bob is a solved geometric quantity -- how far the supporting leg's
        // extension puts the hip below standing, which for a 0.50 rad swing on a straight knee is
        // 88 mm -- and a first-order response behind it leaves the root up to 26 mm high at every
        // extreme of the stride, at which point *both* soles hang off the floor: measured,
        // `plantedFeet` fell to zero for whole stretches of the walk. The smoothing a crouch wants
        // is on the crouch *level*, which `gait` slews, and not here.
        const rise = clamp((wantedY - pelvis.mesh.position.y) / dt, -B.heightRate, B.heightRate);
        if (rootUp().y >= 0.995) {
          scratch.drive.set(targetVelocity.x, rise, targetVelocity.z);
          pelvis.body.setLinearVelocity(scratch.drive);
          const actualYaw = rotation.toEulerAngles().y;
          const yawError = wrapAngle(targetYaw - actualYaw);
          scratch.angular.set(0, clamp(yawError * 8,
            -B.carrier.maxYawSpeedRadS, B.carrier.maxYawSpeedRadS), 0);
          pelvis.body.setAngularVelocity(scratch.angular);
          return;
        }
        supportedRootTargetToRef(pelvis.mesh.position, rotation,
          { x: targetVelocity.x, z: targetVelocity.z }, targetYaw, dt,
          B.carrier.maxYawSpeedRadS, scratch.target, scratch.desired, scratch.rotation);
        // `supportedRootTargetToRef` deliberately keeps the live `y`: the carrier is horizontal
        // and the height is this module's to own. The crouch rate limit is applied here so both
        // branches move the body vertically at exactly the same ceiling.
        scratch.target.y = pelvis.mesh.position.y + rise * dt;
        pelvis.body.setTargetTransform(scratch.target, scratch.rotation);
        void targetPosition;
      },

      /**
       * The rise, staged (`BipedRise`): the pelvis keyframed through the gather, the squat and the
       * extension of `bipedRiseFrame`, and the legs, in `gait`, driven to the pose that puts the
       * feet under it. The actuator's frame still says where on the floor the body rises -- its
       * horizontal move, for a rise that relocates -- and its clock says how far in the rise is.
       *
       * Not ordinary supported movement and not an unbounded ragdoll force. Omitting this on the
       * Fighter left it on the fallback dynamic-root motor, where the state reached `rising` but a
       * prone pelvis never satisfied the upright predicate and could stay there for ever.
       *
       * **It used to hoist the pelvis where it lay.** The frame's own smoothstep took the pelvis
       * straight up off the floor while it slerped upright, and the legs, commanded to stand, hung
       * straight and were dragged under: the owner's marionette pulled up by the shoulders
       * (2026-09-25). A body that fell on its face stood with its feet 0.31 m behind its hips and its
       * centre of mass 163 mm outside its stance, and stayed that way (stone, Node headless arena,
       * `research/rise-bench.mjs`).
       */
      driveRisingRoot: (targetPosition, _targetVelocity, targetYaw, elapsedS, durationS): void => {
        if (pelvis.body.getMotionType() !== PhysicsMotionType.ANIMATED) {
          pelvis.body.setMotionType(PhysicsMotionType.ANIMATED);
        }
        const live = pelvis.mesh.rotationQuaternion ?? Quaternion.Identity();
        if (risingStart === null || risePlan === null) {
          risingStart = live.clone();
          risePlan = bipedRisePlan(pelvis.mesh.position.y - groundY, B, durationS, riseTurnRad(targetYaw));
        }
        const frame = bipedRiseFrame(elapsedS, risePlan, B);
        riseFrame = frame;
        Quaternion.RotationYawPitchRollToRef(targetYaw, frame.pitch, 0, scratch.desired);
        Quaternion.SlerpToRef(risingStart, scratch.desired, frame.turned, scratch.rising);
        scratch.target.set(targetPosition.x - Math.sin(targetYaw) * frame.back, groundY + frame.y,
          targetPosition.z - Math.cos(targetYaw) * frame.back);
        pelvis.body.setTargetTransform(scratch.target, scratch.rising);
      },

      releaseRoot: (): void => {
        risingStart = null;
        risePlan = null;
        riseFrame = null;
        if (pelvis.body.getMotionType() === PhysicsMotionType.ANIMATED) {
          pelvis.body.setMotionType(PhysicsMotionType.DYNAMIC);
        }
      },
      restoreRoot: (): void => {
        risingStart = null;
        risePlan = null;
        riseFrame = null;
        if (pelvis.body.getMotionType() === PhysicsMotionType.DYNAMIC) {
          pelvis.body.setMotionType(PhysicsMotionType.ANIMATED);
        }
        if (severed) return;
        // Reattachment is an admitted transition. Retaining ragdoll momentum here made a recovered
        // Warrior discharge its stored rotation through the first pose it was given; the same
        // applies to a golem whose legs have just been lying on the floor.
        scratch.drive.set(0, 0, 0);
        for (const leg of legs) {
          if (leg.severed) continue;
          for (const part of [leg.thigh, leg.shin, leg.foot]) {
            part.body.setLinearVelocity(scratch.drive);
            part.body.setAngularVelocity(scratch.drive);
          }
        }
      },
    });
    port = activePort;


    const writeLeg = (
      leg: BipedLeg, hip: number, knee: number, ankle: number, abduct: number,
    ): void => {
      if (leg.severed) return;
      leg.hip?.setAxisMotorTarget(PhysicsConstraintAxis.ANGULAR_X, hip);
      // **`armMotors` has armed this axis since Session 05 and nothing ever wrote a target to
      // it**, so it held zero at `hipTorque` all the way through every strafe -- a motor actively
      // keeping the legs from stepping sideways while the carrier slid the body sideways past
      // them. Writing it is the whole of the strafe fix; `BipedPose.abductLeft` carries what it
      // was worth.
      leg.hip?.setAxisMotorTarget(PhysicsConstraintAxis.ANGULAR_Z, abduct);
      leg.knee?.setAxisMotorTarget(PhysicsConstraintAxis.ANGULAR_X, knee);
      leg.ankle?.setAxisMotorTarget(PhysicsConstraintAxis.ANGULAR_X, ankle);
    };

    /**
     * Arm every leg motor, or take its ceiling down to the limp fraction.
     *
     * Called once at build and again on each edge into and out of `fallen`, never per substep: a
     * motor ceiling is written onto a native solver object and rewriting six of them 240 times a
     * second is a boundary cost for a value that changes twice a knockdown.
     */
    const armMotors = (scale: number): void => {
      for (const leg of legs) {
        for (const [constraint, torque, axes] of [
          [leg.hip, B.hipTorque, [PhysicsConstraintAxis.ANGULAR_X, PhysicsConstraintAxis.ANGULAR_Y,
            PhysicsConstraintAxis.ANGULAR_Z]],
          [leg.knee, B.kneeTorque, [PhysicsConstraintAxis.ANGULAR_X]],
          [leg.ankle, B.ankleTorque, [PhysicsConstraintAxis.ANGULAR_X,
            PhysicsConstraintAxis.ANGULAR_Z]],
        ] as const) {
          if (!constraint) continue;
          for (const axis of axes) {
            constraint.setAxisMotorType(axis, PhysicsConstraintMotorType.POSITION);
            constraint.setAxisMotorMaxForce(axis, torque * scale);
          }
        }
      }
    };
    armMotors(1);
    for (const leg of legs) writeLeg(leg, 0, 0, 0, 0);
    let limp = false;

    const gait = (dt: number): void => {
      if (severed) return;
      // A fallen golem is a ragdoll, and a ragdoll whose leg motors are still driving their gait
      // targets at full torque holds itself up: measured, a shove 51 times the fall threshold left
      // the root at an up-dot of 0.816 rather than going over. The targets keep being written --
      // the legs are not let go of, they are relaxed -- and the ceilings come back on the edge out.
      const wantedLimp = activePort.state === "fallen";
      if (wantedLimp !== limp) {
        limp = wantedLimp;
        armMotors(limp ? B.fallenTorqueScale : 1);
      }
      if (activePort.state === "rising") {
        // The staged rise's legs (`bipedRiseLegs`), for where `driveRisingRoot` put the pelvis
        // earlier in this substep; before its first frame the legs hold what they were given.
        if (riseFrame) {
          const pose = bipedRiseLegs(riseFrame.y, riseFrame.pitch, riseFrame.back, B);
          commanded.hipLeft = slewTowards(commanded.hipLeft, pose.hip, B.targetRate, dt);
          commanded.hipRight = slewTowards(commanded.hipRight, pose.hip, B.targetRate, dt);
          commanded.kneeLeft = slewTowards(commanded.kneeLeft, pose.knee, B.targetRate, dt);
          commanded.kneeRight = slewTowards(commanded.kneeRight, pose.knee, B.targetRate, dt);
          commanded.ankleLeft = slewTowards(commanded.ankleLeft, pose.ankle, B.targetRate, dt);
          commanded.ankleRight = slewTowards(commanded.ankleRight, pose.ankle, B.targetRate, dt);
          commanded.abductLeft = slewTowards(commanded.abductLeft, 0, B.targetRate, dt);
          commanded.abductRight = slewTowards(commanded.abductRight, 0, B.targetRate, dt);
        }
        writeLeg(legs[0], commanded.hipLeft, commanded.kneeLeft, commanded.ankleLeft, commanded.abductLeft);
        writeLeg(legs[1], commanded.hipRight, commanded.kneeRight, commanded.ankleRight,
          commanded.abductRight);
        return;
      }
      const move = carrierMove();
      // **The stride advances with the feet and not with the body**, which is what makes a turn in
      // place step at all. `carrierSpeed` is the *body's* speed and it is zero for a pivot, so the
      // phase used to stand still through the whole of one -- a golem rotating on the spot with
      // its legs frozen, which is the second half of what the owner saw. A foot on a pivot travels
      // at `yaw * hipSide` whatever the body does, and `bipedPose` has already worked out each
      // foot's own travel, so this asks it rather than re-deriving it.
      stride += bipedFootSpeed(move, B) * B.strideCadence * dt;
      // `heightRate` is metres a second and the crouch is a fraction of the crouch, so over the
      // size it is the fraction a second at every size (`LOCOMOTION_BIPED_SIZE`).
      crouchLevel += clamp((wantedCrouch - crouchLevel) * B.crouchResponse * dt,
        -B.heightRate / size * dt, B.heightRate / size * dt);
      const pose = bipedPose(stride, move.forward, move.right, move.yaw, crouchLevel, B);
      hipDrop = pose.hipDrop;
      // The *commanded* angle is rate-limited, which is the ceiling that makes a flicked key a
      // move rather than a snap -- the same argument `CHAIN_PITCH.targetRate` carries. Nothing
      // here reads the achieved pose in order to decide the command: a controller that takes the
      // error and steps the command toward it winds up, measured at 237 of 420 steps pinned
      // against a stop on the Warrior.
      commanded.hipLeft = slewTowards(commanded.hipLeft, pose.hipLeft, B.targetRate, dt);
      commanded.hipRight = slewTowards(commanded.hipRight, pose.hipRight, B.targetRate, dt);
      commanded.kneeLeft = slewTowards(commanded.kneeLeft, pose.kneeLeft, B.targetRate, dt);
      commanded.kneeRight = slewTowards(commanded.kneeRight, pose.kneeRight, B.targetRate, dt);
      commanded.ankleLeft = slewTowards(commanded.ankleLeft, pose.ankleLeft, B.targetRate, dt);
      commanded.ankleRight = slewTowards(commanded.ankleRight, pose.ankleRight, B.targetRate, dt);
      commanded.abductLeft = slewTowards(commanded.abductLeft, pose.abductLeft, B.targetRate, dt);
      commanded.abductRight = slewTowards(commanded.abductRight, pose.abductRight, B.targetRate, dt);
      writeLeg(legs[0], commanded.hipLeft, commanded.kneeLeft, commanded.ankleLeft,
        commanded.abductLeft);
      writeLeg(legs[1], commanded.hipRight, commanded.kneeRight, commanded.ankleRight,
        commanded.abductRight);
    };

    /**
     * Whether the fall is still going, measured from positions alone.
     *
     * The pelvis and the load (the trunk, when one is carried), because a body tipping over moves
     * its top furthest and last: a pelvis that has stopped under a trunk still coming down is not a
     * finished fall. Speeds are finite differences of `mesh.position` between two end-of-substep
     * readings, one solver step apart -- no boundary read, so no allocation, and no world matrix.
     */
    const trackFall = (dt: number): void =>
      settle.track(activePort.state === "fallen", dt, readers);

    const readEvidence = (dt: number): void => {
      const live = port?.diagnostic() ?? null;
      const posture = postureEvidence();
      evidence.t = elapsed;
      evidence.state = port?.state ?? "supported";
      const requested = live?.requested ?? null;
      evidence.commandedSpeedMps = requested
        ? Math.min(1, Math.hypot(requested.localForward, requested.localRight)) * B.carrier.maxSpeedMps
        : 0;
      evidence.carrierSpeedMps = carrierSpeed();
      evidence.rootSpeedMps = Math.hypot(rootSample.velocity.x, rootSample.velocity.z);
      evidence.heightM = pelvis.mesh.position.y - groundY + pelvisDown;
      evidence.crouch = crouchLevel;
      evidence.upDot = posture.carrierUpDot;
      evidence.rootAboveFeetM = posture.rootHeightAboveCarrierM;
      evidence.stackAboveRootM = posture.terminalHeightAboveRootM;
      evidence.postureSupported = constructPostureIsSupported(posture);
      evidence.freshBindings = live?.freshSupportBindings.length ?? 0;

      let planted = 0;
      // **The stillest sole in contact, not the fastest.** A walk puts the swing foot through
      // contact height twice a stride travelling at about twice the body's speed, so a maximum
      // over planted feet reports the walk itself as slip -- measured, 3.5 m/s of "slip" on a
      // carrier doing 1.2. The question this reading exists to answer is whether the golem has a
      // foot *holding* the ground, which is a minimum.
      let slip = Number.POSITIVE_INFINITY;
      for (const leg of legs) {
        if (leg.severed) continue;
        const sole = solePoint(leg, scratch.sole);
        // **The port's step envelope and the instrument's plant band are different questions and
        // must not share a number.** The support query admits a hit whose y lies within
        // `stepHeightM` of the sole, which is right for "is there standable world under this
        // foot"; it is wrong for "is this foot bearing weight", because a sole 0.18 m up is a
        // swing foot travelling forward at twice the body's speed and calling that slip reports
        // the walk itself as a defect. See `B.plantBandM`.
        const down = Math.abs(sole.y - groundY) <= B.plantBandM;
        if (down) {
          planted += 1;
          slip = Math.min(slip, leg.lastPlanted && dt > 0
            ? Math.hypot(sole.x - leg.lastSole.x, sole.z - leg.lastSole.z) / dt
            // A sole that has only just arrived inside the band has no previous sample to
            // difference against, and calling that zero would let a touchdown mask a skate.
            : Number.POSITIVE_INFINITY);
        }
        leg.lastSole.copyFrom(sole);
        leg.lastPlanted = down;
      }
      evidence.plantedFeet = planted;
      evidence.footSlipMps = Number.isFinite(slip) ? slip : 0;

      let jointError = 0;
      let soleLift = 0;
      for (const [index, leg] of legs.entries()) {
        if (leg.severed) continue;
        const wantedHip = index === 0 ? commanded.hipLeft : commanded.hipRight;
        const wantedKnee = index === 0 ? commanded.kneeLeft : commanded.kneeRight;
        const wantedAnkle = index === 0 ? commanded.ankleLeft : commanded.ankleRight;
        jointError = Math.max(jointError,
          Math.abs(relativeX(pelvis, leg.thigh) - wantedHip),
          Math.abs(relativeX(leg.thigh, leg.shin) - wantedKnee),
          Math.abs(relativeX(leg.shin, leg.foot) - wantedAnkle));
        soleLift = Math.max(soleLift, solePoint(leg, scratch.sole).y - groundY);
      }
      evidence.jointErrorRad = jointError;
      evidence.soleLiftM = soleLift;
      if (load) {
        UP.rotateByQuaternionToRef(
          load.mesh.rotationQuaternion ?? Quaternion.Identity(), scratch.other);
        evidence.carriedLeanRad = Math.acos(clamp(Vector3.Dot(scratch.other, rootUp()), -1, 1));
      }
      evidence.contacts = contacts;
      evidence.selfContacts = selfContacts;
      contacts = 0;
      selfContacts = 0;
    };

    const envelope: ModuleEnvelope = Object.freeze({
      axes: Object.freeze([
        Object.freeze({ id: "speed", unit: "m" as const, min: 0,
          max: B.carrier.maxSpeedMps, rate: B.carrier.maxAccelerationMps2 }),
        Object.freeze({ id: "yaw", unit: "rad" as const, min: -B.carrier.maxYawSpeedRadS,
          max: B.carrier.maxYawSpeedRadS, rate: B.carrier.maxYawAccelerationRadS2 }),
        Object.freeze({ id: "height", unit: "m" as const,
          min: bipedHeightRange(B).crouchM, max: bipedHeightRange(B).standM, rate: B.heightRate }),
      ]),
      // What the module puts between its socket and the ground, which is the locomotion slot's
      // answer to "how far does the business end travel from the socket".
      reach: standHeight,
      strokes: NO_STROKES,
      reachable: null,
      // Metres of height, so at the body's size.
      settledBand: 0.02 * size,
    });

    const disposeJoints = (): void => {
      for (const leg of legs) {
        leg.ankle?.dispose(); leg.ankle = null;
        leg.knee?.dispose(); leg.knee = null;
        leg.hip?.dispose(); leg.hip = null;
      }
      waist?.dispose();
      waist = null;
    };

    const built: BuiltLocomotion = Object.freeze({ // fork: derived -- a body family that copies this face forks through the same record
      parts: frozenParts,
      ruin: ruin.ruin,
      mobility: ruin.mobility,
      strikers: Object.freeze([]) as readonly Striking[],
      root: pelvis,
      adapter,
      port: activePort,
      world,
      footprint,
      heightRange: bipedHeightRange(B),
      authority,
      postureEvidence,
      gait,
      evidence: (): LocomotionEvidence => evidence,
      readout: (): LocomotionReadoutState => readout.state(),

      command(next: LocomotionCommand): void {
        if (severed) return;
        request = next.request;
        wantedCrouch = clamp(next.crouch, 0, 1);
      },

      /**
       * What this carrier is holding up, declared by an assembly once the load exists.
       *
       * **It builds no joint**, and that is the settled answer to the question this file used to
       * state and leave open: the torso owns the waist. What this does is the other half -- the
       * mass a shove is divided by, the body the posture predicate's third signal is measured
       * against, and the body a bench shove is applied to when there is one.
       *
       * Refused rather than accepted a second time. A module already carrying a `DYNAMIC` mount
       * has a load with a waist joint attached to it, and quietly replacing it would leave a
       * motorised joint pointing at a body nothing else believes is there.
       */
      carry(next: LocomotionLoad): void {
        if (carriedAtBuild) {
          throw new Error(`${ctx.name}: this locomotion module already carries its own mount`);
        }
        if (!(Number.isFinite(next.massKg) && next.massKg >= 0)) {
          throw new Error(`${ctx.name}: a carried load needs a finite non-negative mass`);
        }
        load = next.part;
        carriedMassKg = next.massKg;
        carriedParts = next.parts ?? null;
        rootSample.massKg = supportedMass();
      },

      beginSubstep(): void {
        if (severed) return;
        refreshRoot();
      },

      endSubstep(dt: number): void {
        if (severed) return;
        elapsed += dt;
        trackFall(dt);
        readEvidence(dt);
        readout.sample(evidence);
      },

      step(dt: number): void {
        if (severed) return;
        built.beginSubstep();
        stepSoloCarrier(activePort, world, request, dt);
        gait(dt);
        built.endSubstep(dt);
      },

      envelope: () => envelope,
      /** Not an effector: there is no tip, no anchor and no edge to publish. */
      view: (): EffectorView | null => null,

      shove(): void {
        const impulse = B.shoveImpulseNs;
        // Stated once and spent twice: a real impulse so the slab lurches, and the same transfer
        // queued into the port in its own mass-independent units so the state machine sees it.
        // Inferring either from the other would be inferring an event from a side effect that has
        // a second cause, which this directory has already paid for once.
        scratch.drive.set(impulse, 0, 0);
        scratch.drive.rotateByQuaternionToRef(
          pelvis.mesh.rotationQuaternion ?? Quaternion.Identity(), scratch.drive);
        const target = load && load.body.getMotionType() === PhysicsMotionType.DYNAMIC
          ? load : pelvis;
        target.body.applyImpulse(scratch.drive, target.mesh.position);
        port?.queueStabilityEvent({ horizontalShoveNs: [scratch.drive.x, scratch.drive.z] });
      },

      sever(): void {
        if (severed) return;
        severed = true;
        for (const leg of legs) leg.severed = true;
        // The carrier is gone: the root becomes an ordinary dynamic body and the drives go with
        // the limb, because a motor still driving a chain that has been cut off is the haunting a
        // Warrior's anchors produce when an arm comes away from them.
        if (pelvis.body.getMotionType() !== PhysicsMotionType.DYNAMIC) {
          pelvis.body.setMotionType(PhysicsMotionType.DYNAMIC);
        }
        activePort.clear("locomotion module severed");
        disposeJoints();
      },

      dispose(): void {
        severed = true;
        // Babylon removes an observer asynchronously -- it marks it and splices it on a
        // zero-delay timer -- so a lifecycle census taken straight after this counts active
        // observers rather than array length. Removing them at all is what stops a rebuilt bench
        // module leaving a live callback behind on a body that has gone.
        for (const [body, observer] of watchers) body.getCollisionObservable().remove(observer as never);
        watchers.length = 0;
        activePort.dispose();
        disposeJoints();
        for (const leg of legs) {
          for (const part of [leg.foot, leg.shin, leg.thigh]) {
            part.body.dispose();
            part.shape.dispose();
            // The shell is parented to the collider mesh, so this takes it too -- and
            // `false, false` leaves the palette's materials standing.
            part.mesh.dispose(false, false);
          }
        }
        pelvis.body.dispose();
        pelvis.shape.dispose();
        pelvis.mesh.dispose(false, false);
      },

      // A fork of the world (`src/forkable.ts`): every let and private object this closure steps on.
      captureState: (): Record<string, unknown> => ({
        load, carriedMassKg, waist, carriedParts, stride, crouchLevel, wantedCrouch, request, severed,
        risingStart, port, elapsed, contacts, selfContacts, hipDrop, limp, risePlan, riseFrame,
        B, L, ctx, socket, local, legs, readers, ruin, settle, watchers, commanded, evidence, readout,
        scratch, rootSample, activePort, world, own,
      }),
      restoreState(state: Record<string, unknown>): void {
        ({
          load, carriedMassKg, waist, carriedParts, stride, crouchLevel, wantedCrouch, request, severed,
          risingStart, port, elapsed, contacts, selfContacts, hipDrop, limp, risePlan, riseFrame,
        } = state as never);
      },
    });

    /** Contacts, counted the way both bench harnesses already count them. */
    const own = new Set(frozenParts.map(({ part }) => part.body));
    for (const { part } of frozenParts) {
      part.body.setCollisionCallbackEnabled(true);
      watchers.push([part.body, part.body.getCollisionObservable().add((event) => {
        contacts += 1;
        // **`selfCollisionCount === 0` proves nothing about pairs the filters never admitted**,
        // and here they never are: legs and pelvis all sit on the side's own body layer, whose
        // collide mask contains neither itself nor the trunk. So a non-zero count is a filter set
        // wrongly rather than a body plan that touches itself, which is the only thing it says.
        if (own.has(event.collidedAgainst)) selfContacts += 1;
      }) as unknown as Observer<unknown>]);
    }

    return built;
  },
});

}
export const bipedModule = bipedDefinition("locomotion.biped", "biped - two legs on a carrier");
