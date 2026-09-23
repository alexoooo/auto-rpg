import { FULL_TONE, JointActuator, JointServo } from "../../joint-servo.ts";
import { PhysicsConstraintAxis } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Physics6DoFConstraint } from "@babylonjs/core/Physics/v2/physicsConstraint.js";

import type { HandCursor, HandIntent } from "../../../mind.ts";
import { capsulePart, joint, type Part } from "../../../rig.ts";
import type { Armour } from "../../../scoring.ts";
import { attributeOf, withArmSpeed } from "../../attributes.ts";
import { CHAIN_REACH } from "../../config.ts";
import { materialForGolemRole } from "../../materials.ts";
import {
  type ChainCrossing,
  type ChainLimits,
  type EffectorAxisView,
  type EffectorStroke,
  type EffectorStrokeKind,
  type GolemMount,
  type GolemPart,
  type ModuleAxisEnvelope,
  type ModuleBuild,
  type ReachEnvelope,
} from "../../module.ts";
import { JOINT_SHELL, LIMB_SHELL } from "../shell.ts";

/**
 * Continuous task-space commands mapped to a coordinated physical arm. The shoulder yaw,
 * shoulder pitch and elbow each have one finite-effort actuator. The two-bone solution
 * selects their targets throughout movement; no endpoint force constraint pulls the hand.
 *
 * Mapping, wrist-tip correction, envelope limits and target-rate limiting remain independent
 * of the achieved pose. Feedback belongs only to the replaceable joint servos. There is no
 * gesture/attack gate: a player and a continuous policy use the same command path.
 *
 * The legacy anchor readout is the commanded hand point, not a body. Its distance from the
 * actual hand reports tracking error. Wrist roll/bend remain owned by the wrist chain.
 */

/** Where a terminal's own +X and +Y point in the frame of whatever link it welds onto. */
export const LIMB_MOUNT: GolemMount = Object.freeze({
  // The link's -Z, which is the in-plane tangent of the arm's own pitch arc -- rung 1's argument
  // for its own edge, unchanged, so every chain below rung 3 agrees about where an edge lies. On
  // a chain with no roll axis this is a decision the *chain* has to make because the golem
  // cannot: `roll` is what says which way an edge faces and only a chain with a roll axis can
  // express it. Rung 3 keeps the same number, so a wrist at roll 0 presents rung 2's edge.
  axis: new Vector3(0, 0, -1),
  // The link's -Y: a blade continues straight out along the limb instead of doubling back up
  // through it. Getting this backwards on the Warrior put the blade back up through the forearm,
  // which is invisible in a body that does not collide with itself and baffling the moment you
  // try to swing.
  perp: new Vector3(0, -1, 0),
});

const clamp = (value: number, low: number, high: number): number =>
  value < low ? low : value > high ? high : value;

/** `pointerX` and `pointerY` run -1 to +1 across and up the window. */
const spanned = (t: number, min: number, max: number): number =>
  min + ((clamp(t, -1, 1) + 1) / 2) * (max - min);

/**
 * And back: where the cursor has to sit for `value` to be the number this span produced.
 *
 * Immediately beside its forward direction on purpose. The one inverse this directory has got
 * wrong was written in another file from the mapping it inverts, and the plausible-but-wrong
 * version agreed with the right one for every positive input -- so a handover test passed against
 * a deliberately broken inverse until both sides of centre were sampled.
 */
const unspanned = (value: number, min: number, max: number): number =>
  max === min ? 0 : clamp(((value - min) / (max - min)) * 2 - 1, -1, 1);

/**
 * The two-bone solution at a given reach: the shoulder's offset and the elbow's bend, radians.
 *
 * `beta` is the elbow bend, straight from the cosine rule and single-valued because the elbow
 * stop admits only one sign. `alpha` is the angle between the shoulder-to-hand line and the upper
 * arm, and it is what makes the commanded *forearm* direction different from the commanded *aim*:
 * a terminal welded to the forearm points along the forearm and not along the aim, so a commanded
 * tip taken off the aim would be out by most of a blade's length.
 *
 * At module scope because the build pose needs it before anything is built.
 */
const twoBone = (R: typeof CHAIN_REACH, reach: number): { alpha: number; beta: number } => {
  const L1 = R.upperLength;
  const L2 = R.foreLength;
  const cosBeta = clamp((reach * reach - L1 * L1 - L2 * L2) / (2 * L1 * L2), -1, 1);
  const beta = Math.acos(cosBeta);
  return { alpha: Math.atan2(L2 * Math.sin(beta), L1 + L2 * cosBeta), beta };
};

const AXIS_X = Object.freeze(new Vector3(1, 0, 0));

/** The command, in the module's own three task-space terms. */
export interface ArmCommand {
  /** Outboard-signed azimuth, radians: positive is away from the golem. */
  swing: number;
  /** Elevation, radians. */
  lift: number;
  /** Distance from the socket to the hand point, metres. */
  reach: number;
}

export type PointCorrection = (wantedWorld: Vector3, out: Vector3) => void;

interface ArmCore {
  readonly parts: readonly GolemPart[];
  readonly collar: Part;
  readonly upper: Part;
  readonly fore: Part;
  /** The hand point in the forearm's own local frame: its far end. */
  readonly handPivot: Vector3;
  /** That same point in world space at construction, for a weld or a further link. */
  readonly handWorld: Vector3;
  /** The **forearm's** world frame at construction. Nothing may be built at odds with it. */
  readonly buildRotation: Quaternion;
  /** Which way the forearm points at construction: where a further link continues. */
  readonly buildDirection: Vector3;
  /** The reachable set, published on the envelope and clamped to before every drive. */
  readonly reachable: ReachEnvelope;
  readonly envelopeAxes: readonly ModuleAxisEnvelope[];
  /** The three task-space axis views, allocated once and mutated in place. */
  readonly axes: readonly EffectorAxisView[];
  /** Where the hand actually is, into a ref this core owns. */
  hand(): Vector3;
  /** Where the elbow actually is, into a ref this core owns. */
  elbow(): Vector3;
  /** Where the hand is being sent after the rate limit, world, into a ref this core owns. */
  commandedHand(): Vector3;
  /** The unit forearm direction at that commanded pose, world, into a ref this core owns. */
  commandedForearm(): Vector3;
  /** The arm plane's lateral unit at that commanded pose, world, into a ref this core owns. */
  commandedLateral(): Vector3;
  /**
   * Install a stage between the command and the clamp: given the point the cursor asked for,
   * write the point to actually send. Pass `null` to remove it.
   *
   * **A stage, not a second command, and the difference is the whole reason this exists.** The
   * obvious way to correct an aim from above is to read the wanted pose back and call
   * `commandPoint` with a fixed-up one -- and it does not work, because `commandPoint` writes
   * `wanted`, so the next step's read returns the previous correction and the correction is
   * applied to itself. Measured, that walked the stroke probe's miss from 0.294 m to over a
   * metre and collapsed the tip speed at the mark from 20 m/s to under 2: an unbounded
   * accumulator, not a mis-tuned one. A stage cannot do that, because its input is `wanted` and
   * its output is not.
   *
   * It runs inside `step`, before the clamp and the rate limit, so a correction is inside the
   * envelope by exactly the argument a cursor is -- and it sees the command rather than the
   * rate-limited point, so it does not chase its own lag.
   */
  adjustPoint(correct: PointCorrection | null): void;
  /**
   * Where this chain's socket is now, world, into a ref this core owns.
   *
   * Published because the radial direction -- socket to hand -- is the line the mind's own reach
   * model puts a terminal's overhang along, so a chain correcting for its own geometry needs the
   * origin of that line. See `reachForDistance` in `tactics.ts`.
   */
  socketPoint(): Vector3;
  /**
   * The forearm and arm-plane lateral units for the pose that would put the hand at `world`.
   *
   * The same basis `commandedForearm` and `commandedLateral` publish, at a pose this core is not
   * currently holding -- which is what a chain above needs to ask "if I sent the hand *there*,
   * which way would my own links point?" without driving anything to find out. Clamped to the
   * reachable set, because an unreachable query would otherwise answer with a two-bone solution
   * that does not exist.
   */
  basisAt(world: Vector3, forearm: Vector3, lateral: Vector3): void;
  stroke(): EffectorStroke;
  anchorPoint(): Vector3;
  anchorStray(): number;
  /**
   * The two aiming axes of the cursor that command the pose this core is commanding.
   *
   * `roll` and `wristBend` are the wrist's and are zero here: rung 2 has no orientation to
   * express, so rung 3 overwrites those two and rung 2 answers the honest zero. See
   * `BuiltChain.cursor`.
   */
  cursor(): HandCursor;
  command(next: HandIntent): void;
  /**
   * Send the hand point toward a world point. See `BuiltChain.commandWeldTo`.
   *
   * `sphericalOf` and nothing else: the point is read back into the same three coordinates
   * `command` writes, and everything downstream of `wanted` -- the clamp, the rate limit, the
   * anchor -- is the same code for both, so a point commanded this way is inside the envelope by
   * exactly the argument a cursor is.
   */
  commandPoint(world: Vector3): void;
  step(dt: number): void;
  /** Release the joint motors and keep the linkage. See `BuiltChain.unmotorise`. */
  unmotorise(): void;
  sever(): void;
  dispose(): void;
}

/**
 * The limits this core actually spans, commands and publishes.
 *
 * `CHAIN_REACH` is where they come from and a terminal's `ChainLimits` is what may narrow
 * three of them, so this is the one place either is read. Stated as its own record rather than
 * spread through the mapping, because the defect it prevents is specific: `spanned`, `clampInto`
 * and the published `ReachEnvelope` are three statements of the same shell, and a narrowing
 * applied to two of them is an envelope that says one thing and clamps to another.
 */
interface CoreLimits {
  readonly reachMin: number;
  readonly reachMax: number;
  readonly swingMin: number;
  readonly swingMax: number;
  readonly liftMin: number;
  readonly liftMax: number;
  readonly carryMin: number;
}

/**
 * What these chains are **good for**, which is not the same claim as what they will run.
 *
 * Session 12 removed the scripted strokes from this file and left this list exactly as it was,
 * because the list was never read as a command menu. Its three readers are
 * `tactics.ts`'s `canAttack`, `canCut` and `canCover`, and every one of them asks a capability
 * question: is there a striker on the end of this thing, does it have an edge, can it be
 * interposed. A three-axis arm with a blade on it can be driven point-first, edge-first and
 * across, and that is what these three names say. Nothing here promises that pressing a button
 * makes the chain do any of it -- the chain follows a commanded point and nothing else.
 *
 * The distinction is worth the paragraph because the old comment made the opposite claim ("a
 * mind reading this learns that the module can be asked to cover"), and a mind that believed it
 * would be waiting for a body to cover on its behalf. It will not. It has to hold the plate
 * where it wants the plate, every frame, which is the whole of the change.
 */
export const ARM_STROKES: readonly EffectorStrokeKind[] =
  Object.freeze<EffectorStrokeKind[]>(["thrust", "cut", "cover"]);

export function buildArmCore(
  ctx: ModuleBuild, narrowed: ChainLimits | null, crossing: ChainCrossing | null,
  reachTable: typeof CHAIN_REACH = CHAIN_REACH, armour?: Armour,
): ArmCore {
  // The body's arm-speed stat, on the anchor's rate: read every step below, and published as the
  // reach axis's rate, so this per-build copy is the only table the core may see.
  const R = withArmSpeed(reachTable, ["anchorRate"], attributeOf(ctx, "armSpeed"));
  // **The terminal narrows and the chain clamps**, and a narrowing can only ever *tighten*: a
  // floor takes the larger of the two and a ceiling the smaller, so a terminal that stated a
  // wider number than the chain's own would grant nothing, which is the direction a terminal is
  // not allowed to move. `null` is "this terminal takes nothing from this axis" and is what
  // keeps the plate from transcribing six of `CHAIN_REACH`'s constants in order to move one.
  const atLeast = (own: number, wanted: number | null): number =>
    wanted === null ? own : Math.max(own, wanted);
  const atMost = (own: number, wanted: number | null): number =>
    wanted === null ? own : Math.min(own, wanted);
  const L: CoreLimits = Object.freeze({
    reachMin: atLeast(R.reachMin, narrowed?.reachMin ?? null),
    reachMax: atMost(R.reachMax, narrowed?.reachMax ?? null),
    // **The one widening**, and the type it arrives in is the whole argument for why it is
    // allowed: see `ChainCrossing`. A crossing replaces the two inboard floors outright rather
    // than composing with them, because "at least this far inboard" composed with "at most that
    // far" by `atLeast` is the chain's own floor again.
    swingMin: crossing ? crossing.swingMin : atLeast(R.swingMin, narrowed?.swingMin ?? null),
    swingMax: atMost(R.swingMax, narrowed?.swingMax ?? null),
    liftMin: atLeast(R.liftMin, narrowed?.liftMin ?? null),
    liftMax: atMost(R.liftMax, narrowed?.liftMax ?? null),
    carryMin: crossing ? crossing.carryMin : atLeast(R.carryMin, narrowed?.carryMin ?? null),
  });
  const socket = ctx.socket;
  const outboard = socket.outboard;
  const facing = socket.rotation;
  const stone = materialForGolemRole(ctx.materials, "shell");

  // --- the build pose -----------------------------------------------------------------------
  //
  // **The chain is built with its elbow already bent, and that is a measurement rather than a
  // preference.** Every other chain in this directory is built hanging straight down, which for a
  // one-bone limb is the rest pose and is right. For a two-bone limb it is the *singular*
  // configuration: with the elbow perfectly straight, a force applied at the hand has no moment
  // arm about the elbow at all, so the anchor cannot bend it and can only pull the whole chain
  // about the shoulder. Built straight, the peak anchor stray over the scripted sequence measured
  // **531.20 mm** in the Node bench, all of it in the first tenth of a second while the elbow
  // levered itself off its own stop; built here, it is the figure recorded in
  // `docs/measurements.md`. A driven limb that is not within a few millimetres of its own anchor
  // is not posed wrongly, it is stuck on something -- and at a singularity it is stuck on its own
  // geometry.
  //
  // The pose is `swing 0, lift liftMin, reach reachNeutral`: arm down and a little forward, elbow
  // bent 1.39 rad, comfortably inside every stop and 0.96 rad off the straight singularity. It is
  // also inside the envelope, so the first command the cursor gives is a *move* rather than a
  // step out of an unreachable pose.
  // Clamped into the limits rather than taken raw, because a narrowing that put the build pose
  // outside the envelope would make the first command the cursor gives a *step out of an
  // unreachable pose* -- which is the shape of the failure rung 1's `jointMin` records, a
  // violation the solver clears on step one by throwing the limb at 9.95 m/s.
  const buildLift = clamp(R.liftMin, L.liftMin, L.liftMax);
  const buildReach = clamp(R.reachNeutral, L.reachMin, L.reachMax);
  const buildBones = twoBone(R, buildReach);
  const upperPitch = buildLift + Math.PI / 2 - buildBones.alpha;
  const forePitch = upperPitch + buildBones.beta;

  /** A limb direction at pitch angle `a`, carried into the world by the socket's own frame. */
  const limbDirection = (a: number, into: Vector3): Vector3 => {
    into.set(0, -Math.cos(a), Math.sin(a));
    return into.rotateByQuaternionToRef(facing, into);
  };
  /**
   * The world frame a link at pitch angle `a` is built in.
   *
   * `facing.multiply(local)` is "turn in the link's own frame, then carry into the world", which
   * is the order Babylon's quaternion product takes -- checked rather than assumed, because the
   * other order is a link built a quarter turn out and a joint whose two frames disagree at
   * construction is a violation the solver clears by throwing the limb.
   */
  const limbFrame = (a: number): Quaternion =>
    facing.multiply(Quaternion.RotationAxis(AXIS_X, -a));

  const upperDir = limbDirection(upperPitch, new Vector3());
  const foreDir = limbDirection(forePitch, new Vector3());
  const elbowWorld = socket.world.add(upperDir.scale(R.upperLength));

  // --- geometry ---------------------------------------------------------------------------
  const collar = capsulePart(ctx.scene, {
    name: `${ctx.name}.collar`,
    position: socket.world.clone(),
    rotation: facing,
    height: R.collarLength,
    radius: R.collarRadius,
    mass: R.collarMass,
    layer: ctx.layers.body,
    collidesWith: ctx.layers.bodyCollidesWith,
    material: stone,
    visible: false,
  });
  const upper = capsulePart(ctx.scene, {
    name: `${ctx.name}.upperArm`,
    position: socket.world.add(upperDir.scale(R.upperLength / 2)),
    rotation: limbFrame(upperPitch),
    height: R.upperLength,
    radius: R.upperRadius,
    mass: R.upperMass,
    layer: ctx.layers.body,
    collidesWith: ctx.layers.bodyCollidesWith,
    material: stone,
    visible: false,
  });
  const fore = capsulePart(ctx.scene, {
    name: `${ctx.name}.forearm`,
    position: elbowWorld.add(foreDir.scale(R.foreLength / 2)),
    rotation: limbFrame(forePitch),
    height: R.foreLength,
    radius: R.foreRadius,
    mass: R.foreMass,
    layer: ctx.layers.body,
    collidesWith: ctx.layers.bodyCollidesWith,
    material: stone,
    visible: false,
  });
  for (const part of [collar, upper, fore]) {
    part.body.setLinearDamping(R.linearDamping);
    part.body.setAngularDamping(R.angularDamping);
  }

  // --- joints -----------------------------------------------------------------------------
  // The yaw hinge's own axis is the socket's vertical, handed to `joint` as `axisParent`, so this
  // constraint's ANGULAR_X *is* the yaw and every other axis is locked. That is what makes it a
  // hinge, and what makes the chain's degree count exactly three.
  // The stop follows the envelope's inboard edge *outward* only: a crossing that widened the
  // envelope past the chain's own floor would otherwise be a command the mapping admits and the
  // hinge refuses, which is a motor and a limit pushing at each other. A narrowing never moves it.
  const swingFloor = Math.min(R.swingMin, L.swingMin);
  const yawJointMin = outboard > 0 ? swingFloor - R.jointMargin : -R.swingMax - R.jointMargin;
  const yawJointMax = outboard > 0 ? R.swingMax + R.jointMargin : -swingFloor + R.jointMargin;
  let yaw: Physics6DoFConstraint | null = joint(ctx.scene, socket.mount, collar, {
    pivotParent: socket.local,
    pivotChild: Vector3.Zero(),
    axisParent: new Vector3(0, 1, 0),
    axisChild: new Vector3(0, 1, 0),
    perpParent: new Vector3(0, 0, 1),
    perpChild: new Vector3(0, 0, 1),
    swing: { x: { min: yawJointMin, max: yawJointMax } },
  });

  // The shoulder's pitch, about the collar's lateral -- which yaws with the collar, which is the
  // whole reason the collar exists. The joint angle is the negative of the pitch, the same sign
  // rung 1 and the Warrior's elbow are written in.
  let pitch: Physics6DoFConstraint | null = joint(ctx.scene, collar, upper, {
    pivotParent: Vector3.Zero(),
    pivotChild: new Vector3(0, R.upperLength / 2, 0),
    swing: { x: { min: -R.pitchJointMax, max: -R.pitchJointMin } },
  });

  // The elbow, about that same lateral, bending one way only. The one-sidedness is not a detail:
  // it is what removes the elbow-up/elbow-down ambiguity, and without it a target at a given
  // distance would have two poses and the solver would pick whichever it was nearer.
  let elbowJoint: Physics6DoFConstraint | null = joint(ctx.scene, upper, fore, {
    pivotParent: new Vector3(0, -R.upperLength / 2, 0),
    pivotChild: new Vector3(0, R.foreLength / 2, 0),
    swing: { x: { min: -R.elbowJointMax, max: -R.elbowJointMin } },
  });

  // Condition the serial linkage: tiny bearing inertia otherwise makes the solver ring
  // under the carried terminal. Preserve mass and centre of mass; never lower an inertia.
  for (const part of [collar, upper, fore]) {
    const props = part.body.getMassProperties();
    const own = props.inertia;
    if (!own) throw new Error("Arm body has no rotational inertia");
    part.body.setMassProperties({...props, inertia: new Vector3(Math.max(own.x, R.jointInertiaFloor), Math.max(own.y, R.jointInertiaFloor), Math.max(own.z, R.jointInertiaFloor))});
  }

  // Every positional degree of freedom has one finite-effort motor. No hand pin competes
  // with these joints. Controllers can be replaced independently of their actuators.
  const relative = new Quaternion(), inverse = new Quaternion();
  const angle = (parent: Part, child: Part, axis: "x" | "y"): number => {
    (parent.mesh.rotationQuaternion ?? Quaternion.Identity()).conjugateToRef(inverse);
    inverse.multiplyToRef(child.mesh.rotationQuaternion ?? Quaternion.Identity(), relative);
    // Twist about the actual hinge axis, not Euler pitch (which folds beyond pi/2).
    const value = 2 * Math.atan2(relative[axis], relative.w);
    return Math.atan2(Math.sin(value), Math.cos(value));
  };
  const tone = ctx.tone ?? FULL_TONE;
  const yawServo = new JointServo(new JointActuator(yaw, PhysicsConstraintAxis.ANGULAR_X, tone),
    () => angle(socket.mount, collar, "y"), 0, R.jointResponse);
  const pitchServo = new JointServo(new JointActuator(pitch, PhysicsConstraintAxis.ANGULAR_X, tone),
    () => angle(collar, upper, "x"), -upperPitch, R.jointResponse);
  const elbowServo = new JointServo(new JointActuator(elbowJoint, PhysicsConstraintAxis.ANGULAR_X, tone),
    () => angle(upper, fore, "x"), -buildBones.beta, R.jointResponse);
  const releaseMotors = (): void => {
    for (const servo of [yawServo, pitchServo, elbowServo]) servo.actuator.release();
  };
  const driveJoints = (dt: number): void => {
    const { alpha, beta } = twoBone(R, slewed.reach);
    yawServo.track(outboard * slewed.swing, dt, R.yawTorque);
    pitchServo.track(-(slewed.lift + Math.PI / 2 - alpha), dt, R.shoulderTorque);
    elbowServo.track(-beta, dt, R.elbowTorque);
  };

  const handPivot = new Vector3(0, -R.foreLength / 2, 0);
  const handWorld = elbowWorld.add(foreDir.scale(R.foreLength));
  // Compatibility readouts call this an anchor; it is a target point, with no physics body.
  const commandedPoint = handWorld.clone();

  // --- the shell --------------------------------------------------------------------------
  const parts: readonly GolemPart[] = Object.freeze([
    Object.freeze({
      id: collar.name,
      part: collar,
      shell: JOINT_SHELL[R.look](ctx.scene, {
        name: collar.name, host: collar.mesh, radius: R.collarRadius,
        band: "across", materials: ctx.materials,
      }),
      health: R.collarHealth,
      vitalityWeight: R.collarVitalityWeight,
      fatal: false,
      ...(armour === undefined ? {} : { armour }),
    }),
    Object.freeze({
      id: upper.name,
      part: upper,
      shell: LIMB_SHELL[R.look](ctx.scene, {
        name: upper.name, host: upper.mesh, length: R.upperLength,
        radius: R.upperRadius, taper: 0.34, materials: ctx.materials,
      }),
      health: R.upperHealth,
      vitalityWeight: R.upperVitalityWeight,
      fatal: false,
      ...(armour === undefined ? {} : { armour }),
    }),
    Object.freeze({
      id: fore.name,
      part: fore,
      shell: LIMB_SHELL[R.look](ctx.scene, {
        name: fore.name, host: fore.mesh, length: R.foreLength,
        radius: R.foreRadius, taper: 0.30, materials: ctx.materials,
      }),
      health: R.foreHealth,
      vitalityWeight: R.foreVitalityWeight,
      fatal: false,
      ...(armour === undefined ? {} : { armour }),
    }),
  ]);

  // --- the envelope -------------------------------------------------------------------------
  const reachable: ReachEnvelope = Object.freeze({
    reachMin: L.reachMin, reachMax: L.reachMax,
    swingMin: L.swingMin, swingMax: L.swingMax,
    liftMin: L.liftMin, liftMax: L.liftMax,
    carryMin: L.carryMin,
  });
  // Reach first, because the readout's settle, arrival and overshoot are taken on the first
  // published axis and `CHAIN_REACH.settledBand` is stated in metres against it.
  const envelopeAxes: readonly ModuleAxisEnvelope[] = Object.freeze([
    Object.freeze({
      id: "reach", unit: "m" as const, min: L.reachMin, max: L.reachMax, rate: R.anchorRate,
    }),
    Object.freeze({
      id: "swing", unit: "rad" as const, min: L.swingMin, max: L.swingMax,
      // The angular rate is not a limit this chain owns: what is rate-limited is the *point*, in
      // metres per second, so the fastest an angle can move is that ceiling divided by the
      // horizontal reach it is moving at. Published at `reachMax`, which is the slowest and
      // therefore the honest one for a mind planning against it.
      rate: R.anchorRate / L.reachMax,
    }),
    Object.freeze({
      id: "lift", unit: "rad" as const, min: R.liftMin, max: R.liftMax,
      rate: R.anchorRate / L.reachMax,
    }),
  ]);

  // --- state -------------------------------------------------------------------------------
  //
  // **The command starts at the build pose, not at the cursor.** A command initialised at the
  // cursor would be a step the rate limiter has to run on the very first control step -- which is
  // precisely how a Warrior arm keyframes onto its commanded pose and reads 77 m/s of tip speed
  // in a fighter that never swings. `AnchorDrive` starts its own commanded point at `handWorld`
  // for the same reason, and `slewed` below is read back out of it, so the published command
  // starts there too rather than at a mapped cursor.
  const wanted: ArmCommand = { swing: 0, lift: buildLift, reach: buildReach };
  /** The clamped demand: where the mapping wants the hand, before the rate limit. */
  const demanded: ArmCommand = { swing: 0, lift: buildLift, reach: buildReach };
  /**
   * The rate-limited command, **in the chain's own coordinates**, which is what the anchor is
   * handed. See `stepToward` for why the limiting happens here rather than at the anchor.
   */
  const sent: ArmCommand = { swing: 0, lift: buildLift, reach: buildReach };
  /** The commanded pose published to policies and diagnostics. */
  const slewed: ArmCommand = { swing: 0, lift: buildLift, reach: buildReach };
  /** Where the hand actually got to, in the same three terms. Allocated once, read every step. */
  const achieved: ArmCommand = { swing: 0, lift: buildLift, reach: buildReach };
  /** The aim stage, if a chain above installed one. See `adjustPoint`. */
  let correct: PointCorrection | null = null;
  let severed = false;
  let acquiring = true;
  let driveAge = 0;
  /** Set once by `unmotorise`: this limb is being carried rather than driven. */
  let passive = false;

  const axisViews = [
    { id: "reach", commanded: buildReach, achieved: buildReach },
    { id: "swing", commanded: 0, achieved: 0 },
    { id: "lift", commanded: buildLift, achieved: buildLift },
  ];
  const axes: readonly EffectorAxisView[] = Object.freeze(axisViews);

  const scratch = {
    hand: new Vector3(),
    elbow: new Vector3(),
    local: new Vector3(),
    read: new Vector3(),
    commandedHand: new Vector3(),
    forearm: new Vector3(),
    lateral: new Vector3(),
    target: new Vector3(),
    socket: new Vector3(),
    point: new Vector3(),
    adjusted: new Vector3(),
    pose: { swing: 0, lift: 0, reach: 0 } as ArmCommand,
    inverse: new Quaternion(),
  };

  const mountRotation = (): Quaternion =>
    socket.mount.mesh.rotationQuaternion ?? Quaternion.Identity();

  /** Live socket in world space; read raw transforms without stamping render matrices. */
  const socketWorld = (): Vector3 => {
    socket.local.rotateByQuaternionToRef(mountRotation(), scratch.socket);
    return scratch.socket.addInPlace(socket.mount.mesh.position);
  };

  /** A point at `distance` from the socket in the direction (swing, lift), world. */
  const pointAt = (swing: number, lift: number, distance: number, into: Vector3): Vector3 => {
    const az = outboard * swing;
    const cosLift = Math.cos(lift);
    scratch.local.set(Math.sin(az) * cosLift, Math.sin(lift), Math.cos(az) * cosLift);
    scratch.local.rotateByQuaternionToRef(mountRotation(), into);
    return into.scaleInPlace(distance).addInPlace(socketWorld());
  };

  /**
   * A world point back into (swing, lift, reach), in the mount's own frame.
   *
   * The exact inverse of `pointAt`, which matters twice: the achieved axis views are this applied
   * to the hand, and the published command is this applied to the anchor's rate-limited point.
   * One function, so the two cannot disagree the way `fighter.ts`'s `spread` and `policies.ts`'s
   * two inverses could.
   */
  const sphericalOf = (world: Vector3, into: ArmCommand): void => {
    scratch.read.copyFrom(world).subtractInPlace(socketWorld());
    mountRotation().conjugateToRef(scratch.inverse);
    scratch.read.rotateByQuaternionToRef(scratch.inverse, scratch.read);
    const distance = scratch.read.length();
    into.reach = distance;
    into.swing = outboard * Math.atan2(scratch.read.x, scratch.read.z);
    into.lift = distance > 1e-9 ? Math.asin(clamp(scratch.read.y / distance, -1, 1)) : 0;
  };

  /**
   * Clamp a demanded target into the envelope, in place.
   *
   * **This is the mapping, and it runs before the anchor is ever handed a target** -- frozen rule
   * 3. The reach and the lift are box limits; the swing is a box limit *and* the minimum outboard
   * carry, which is a floor that depends on the other two. `carryMin` is stated from the socket,
   * so the condition on the horizontal reach `h = r cos(lift)` is `h sin(swing) >= carryMin`,
   * which is a floor of `asin(carryMin / h)` on the swing. That coupling is what makes this an
   * envelope rather than an azimuth limit: a long cross-body command is refused a pose that a
   * short one is given, and neither is refused by a branch anywhere downstream.
   */
  /**
   * The forearm and the arm plane's lateral, as units in world space, at any pose.
   *
   * **One law, read by four callers.** `commandedForearm` and `commandedLateral` each carried
   * their own copy of this arithmetic until rung 3 needed the same basis at a pose the core is
   * not holding, and a third copy is how the `outboard` mirror gets applied twice in one place
   * and not at all in another. The forearm's pitch is the lift plus the two-bone solution's own
   * offset, which is why this cannot be read off the hand point alone: two poses that put the
   * hand in the same place with different elbow bends point the forearm differently.
   */
  const basisOf = (pose: ArmCommand, forearm: Vector3, lateral: Vector3): void => {
    const { alpha, beta } = twoBone(R, clamp(pose.reach, L.reachMin, L.reachMax));
    const forearmPitch = pose.lift + Math.PI / 2 - alpha + beta;
    const az = outboard * pose.swing;
    const across = Math.sin(forearmPitch);
    scratch.local.set(across * Math.sin(az), -Math.cos(forearmPitch), across * Math.cos(az));
    scratch.local.rotateByQuaternionToRef(mountRotation(), forearm);
    // The collar's own +X after the yaw, which is the arm plane's lateral.
    scratch.local.set(Math.cos(az), 0, -Math.sin(az));
    scratch.local.rotateByQuaternionToRef(mountRotation(), lateral);
  };

  const clampInto = (into: ArmCommand, swing: number, lift: number, reach: number): void => {
    into.reach = clamp(reach, L.reachMin, L.reachMax);
    into.lift = clamp(lift, L.liftMin, L.liftMax);
    let s = clamp(swing, L.swingMin, L.swingMax);
    const horizontal = into.reach * Math.cos(into.lift);
    if (horizontal > 1e-6) {
      const floor = Math.asin(clamp(L.carryMin / horizontal, -1, 1));
      if (s < floor) s = Math.min(floor, L.swingMax);
    }
    into.swing = s;
  };

  /**
   * Walk the sent command toward the demanded one, by at most `metres` of hand travel.
   *
   * **The rate limit belongs here and not at the anchor, and 2026-09-05 is when that was
   * measured rather than argued.** `AnchorDrive` slews its commanded *point* along the straight
   * line to the target, and a straight line between two poses on this chain's shell passes
   * *inside* the shell: swinging the hand from one side of the envelope to the other -- 1.8 rad
   * apart at 0.54 m -- cuts a chord whose closest approach to the socket is 0.335 m, so the
   * commanded hand was dragged 0.205 m inside `reachMin` on the way. That is frozen rule 3 undone
   * by the thing it clamps for: the mapping clamps every *pose* into the envelope, and then the
   * limiter interpolated between two clamped poses through a place the envelope forbids. The
   * plate found it, as the plate found the last one -- a board on a hand drawn that far in
   * reaches 22.3 mm inside the stand, which `tests/golem-bench.test.mjs` fails on the sign of.
   *
   * So the interpolation runs in `(swing, lift, reach)`, where the envelope is a box and a floor
   * and a convex combination of two admissible commands stays admissible, and the *step* is
   * measured in metres of hand travel so that the ceiling is still `anchorRate` and still means
   * what it says. `ds` is the arc length that pose change moves the hand through: `dr` radially,
   * `r dlift` in elevation and `r cos(lift) dswing` laterally, which is the metric on this
   * coordinate system and not an approximation of one.
   *
   * The joint targets are derived from this limited pose, with no second endpoint limiter.
   */
  const commandVelocity: ArmCommand = { reach: 0, lift: 0, swing: 0 };
  const stepToward = (from: ArmCommand, to: ArmCommand, metres: number, dt: number): void => {
    if (dt <= 0) return;
    // Critically damped command trajectory: a button edge starts with zero
    // target velocity rather than kicking all three motors at once.
    const response = R.targetResponse;
    for (const axis of ["reach", "lift", "swing"] as const) {
      commandVelocity[axis] += ((to[axis] - from[axis]) * response * response
        - 2 * response * commandVelocity[axis]) * dt;
    }
    const speed = Math.hypot(commandVelocity.reach,
      commandVelocity.lift * from.reach,
      commandVelocity.swing * from.reach * Math.cos(from.lift));
    const fraction = speed * dt > metres ? metres / (speed * dt) : 1;
    for (const axis of ["reach", "lift", "swing"] as const) {
      commandVelocity[axis] *= fraction;
      from[axis] += commandVelocity[axis] * dt;
      if (Math.abs(to[axis] - from[axis]) < 5e-4 && Math.abs(commandVelocity[axis]) < .02) {
        from[axis] = to[axis]; commandVelocity[axis] = 0;
      }
    }
  };

  const handPoint = (): Vector3 => {
    handPivot.rotateByQuaternionToRef(
      fore.mesh.rotationQuaternion ?? Quaternion.Identity(), scratch.hand,
    );
    return scratch.hand.addInPlace(fore.mesh.position);
  };

  const elbowPoint = (): Vector3 => {
    scratch.elbow.set(0, -R.upperLength / 2, 0);
    scratch.elbow.rotateByQuaternionToRef(
      upper.mesh.rotationQuaternion ?? Quaternion.Identity(), scratch.elbow,
    );
    return scratch.elbow.addInPlace(upper.mesh.position);
  };

  return Object.freeze({
    parts,
    collar,
    upper,
    fore,
    handPivot,
    handWorld,
    // **The forearm's frame, not the golem's.** A weld is built against the frame of the link it
    // welds onto, and this chain's forearm is built bent -- so handing out the socket's own
    // rotation would put a terminal's two frames a radian and a half apart at construction, which
    // is the violation the solver clears by throwing the thing (48.3 m/s on a fighter standing
    // perfectly still, before `weapon.ts`'s `mountRotation` existed).
    buildRotation: limbFrame(forePitch),
    buildDirection: foreDir.clone(),
    reachable,
    envelopeAxes,
    axes,

    hand: handPoint,
    elbow: elbowPoint,
    anchorPoint: () => commandedPoint,
    anchorStray: () => Vector3.Distance(handPoint(), commandedPoint),

    commandedHand: (): Vector3 =>
      scratch.commandedHand.copyFrom(commandedPoint),

    commandedForearm: (): Vector3 => {
      basisOf(slewed, scratch.forearm, scratch.lateral);
      return scratch.forearm;
    },

    commandedLateral: (): Vector3 => {
      basisOf(slewed, scratch.forearm, scratch.lateral);
      return scratch.lateral;
    },

    socketPoint: (): Vector3 => scratch.socket.copyFrom(socketWorld()),

    adjustPoint: (next: PointCorrection | null): void => {
      correct = next;
    },

    basisAt: (world: Vector3, forearm: Vector3, lateral: Vector3): void => {
      sphericalOf(world, scratch.pose);
      clampInto(scratch.pose, scratch.pose.swing, scratch.pose.lift, scratch.pose.reach);
      basisOf(scratch.pose, forearm, lateral);
    },

    /**
     * Always `idle`, and that is the honest answer rather than a stub.
     *
     * `EffectorStroke` is the phase of a *scripted* velocity event: a drive at a lifted rate
     * followed by a coast at a dropped force. This chain runs no script, so it is never in one.
     * A limb being driven hard by a commander is not in a phase; it is being driven hard, and
     * what says so is the tip speed and the anchor stray the readout already carries.
     *
     * The bench's own statistics change shape because of this and the change is a gain. Both
     * harnesses exclude "strokes" from their peak tip-to-command window, on the correct argument
     * that a scripted stroke deliberately runs its command ahead of the limb -- so with nothing
     * excluded any more, those numbers report what a free-form arm actually does instead of what
     * it does between the interesting moments. They will read worse and they will be true.
     */
    stroke: (): EffectorStroke => "idle",

    // `slewed` is the rate-limited command --
    // so this is the pose the chain is *commanding*, not the pose the limb has reached. That is
    // the same choice `Arm.angles()` makes for the Warrior, and it is what makes the first
    // command after a handover identical to the last command before it rather than to whatever
    // lag the drive happened to be carrying. Allocates one record per takeover, which is where
    // it is called.
    cursor: (): HandCursor => ({
      pointerX: unspanned(slewed.swing, L.swingMin, L.swingMax) * outboard,
      pointerY: unspanned(slewed.lift, L.liftMin, L.liftMax),
      // The third one, and it had to join the other two the moment reach became a commanded
      // axis: an incoming driver whose reach channel said something else would be asking this
      // hand to cross up to 0.42 m on its first step, at the anchor's ceiling, with a blade on
      // the end. That is the teleport `cursorForPose` exists to prevent, arriving through the
      // axis nobody had to invert while the buttons owned it.
      reach: unspanned(slewed.reach, L.reachMin, L.reachMax),
      roll: 0,
      wristBend: 0,
    }),

    /**
     * Three normalized channels onto three published axes, and nothing else.
     *
     * **No branch on `thrust` or `guard` anywhere in this function**, which is the whole of
     * Session 12 stated as a property a reader can check by looking. Both buttons are still on
     * the command and both still mean something -- to `src/buttons.ts`, which turns a person's
     * held button into the `reach` below, and to a policy, which may read its own. Neither is
     * something this chain does to whoever is driving it.
     */
    command(next: HandIntent): void {
      if (severed) return;
      wanted.swing = spanned(next.pointerX * outboard, L.swingMin, L.swingMax);
      wanted.lift = spanned(next.pointerY, L.liftMin, L.liftMax);
      wanted.reach = spanned(next.reach, L.reachMin, L.reachMax);
    },

    commandPoint(world: Vector3): void {
      if (severed) return;
      // Unclamped here, deliberately: `step` clamps every demand through `clampInto` on its
      // way to the anchor, and a second clamp here would be the same shell stated twice.
      sphericalOf(world, wanted);
    },

    step(dt: number): void {
      if (severed) return;
      if (passive) {
        // A trailing limb is carried, so there is no command to slew and no anchor to send it
        // to -- but the achieved half is still published, because it is what the mace's grip
        // reading is compared against and because a limb whose axis views froze at their build
        // values would report a trailing arm that never moved.
        sphericalOf(handPoint(), achieved);
        axisViews[0].achieved = achieved.reach;
        axisViews[1].achieved = achieved.swing;
        axisViews[2].achieved = achieved.lift;
        return;
      }

      // **One clamp, one target, no phase.** The commanded reach used to run through a
      // first-order lag at `reachResponse` on its way here, on the argument that what a button
      // press wants is a move that starts fast and eases in. A button press does want that; a
      // continuous command does not, and two limiters in series on one axis meant the reach
      // answered a policy's step more slowly than the swing and the lift beside it did. The
      // task-space rate ceiling is the single limiter, and it is the same one all three
      // axes go through.
      if (correct === null) {
        clampInto(demanded, wanted.swing, wanted.lift, wanted.reach);
      } else {
        // The stage's input is the wanted point, clamped first so an unreachable request is not
        // handed to a correction that would answer it with a two-bone pose that does not exist.
        clampInto(scratch.pose, wanted.swing, wanted.lift, wanted.reach);
        pointAt(scratch.pose.swing, scratch.pose.lift, scratch.pose.reach, scratch.point);
        correct(scratch.point, scratch.adjusted);
        sphericalOf(scratch.adjusted, scratch.pose);
        clampInto(demanded, scratch.pose.swing, scratch.pose.lift, scratch.pose.reach);
      }
      // And the rate limit, in the same coordinates the clamp is written in, so that every point
      // the anchor is ever handed is inside the envelope rather than merely every point the
      // mapping asks for. The second clamp is cheap insurance and not decoration: the carry floor
      // is a curve in these coordinates and a straight interpolation between two poses that both
      // clear it is not obliged to.
      // The construction pose can be below the aiming envelope. Acquire it with a smooth
      // speed ramp rather than clamping the hanging arm onto the envelope on the first step.
      // Once acquired, normal continuous control keeps its existing speed and range limits.
      driveAge += dt;
      const ramp = Math.min(1, driveAge / R.acquireSeconds);
      stepToward(sent, demanded, R.anchorRate * ramp * ramp * (3 - 2 * ramp) * dt, dt);
      clampInto(scratch.pose, sent.swing, sent.lift, sent.reach);
      if (acquiring && Math.abs(scratch.pose.swing - sent.swing)
        + Math.abs(scratch.pose.lift - sent.lift) + Math.abs(scratch.pose.reach - sent.reach) < 1e-8) {
        acquiring = false;
      }
      if (!acquiring) Object.assign(sent, scratch.pose);

      pointAt(sent.swing, sent.lift, sent.reach, scratch.target);
      commandedPoint.copyFrom(scratch.target);
      Object.assign(slewed, sent);
      driveJoints(dt);

      // The achieved half, read back out of the hand's actual position in the mount's frame --
      // `mesh.position` and `mesh.rotationQuaternion` and nothing else, so nothing here stamps a
      // render id and converts every later reader in the frame into a reader of this sample.
      axisViews[0].commanded = slewed.reach;
      axisViews[1].commanded = slewed.swing;
      axisViews[2].commanded = slewed.lift;
      sphericalOf(handPoint(), achieved);
      axisViews[0].achieved = achieved.reach;
      axisViews[1].achieved = achieved.swing;
      axisViews[2].achieved = achieved.lift;
    },

    unmotorise(): void {
      if (passive) return;
      passive = true;
      // The trailing limb keeps its physical joints and limits, but no active arm motors.
      releaseMotors();
    },

    sever(): void {
      if (severed) return;
      severed = true;
      // The drives go with the limb. A motor still dragging a chain that has been cut off is the
      // haunting the Warrior's anchors produce when an arm comes away from them.
      releaseMotors();
      yaw?.dispose();
      yaw = null;
      pitch?.dispose();
      pitch = null;
      elbowJoint?.dispose();
      elbowJoint = null;
    },

    dispose(): void {
      severed = true;
      releaseMotors();
      yaw?.dispose();
      yaw = null;
      pitch?.dispose();
      pitch = null;
      elbowJoint?.dispose();
      elbowJoint = null;
      for (const part of [fore, upper, collar]) {
        part.body.dispose();
        part.shape.dispose();
        // The shell is parented to the collider mesh, so this takes it too -- and `false, false`
        // leaves the palette's materials standing, which is the rule a carried mesh has to obey
        // or disposing one module removes another's texture.
        part.mesh.dispose(false, false);
      }
    },
  });
}
