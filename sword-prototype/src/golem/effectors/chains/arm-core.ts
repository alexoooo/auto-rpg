import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Physics6DoFConstraint } from "@babylonjs/core/Physics/v2/physicsConstraint.js";

import type { HandIntent } from "../../../mind.ts";
import { capsulePart, joint, type Part } from "../../../rig.ts";
import { AnchorDrive, DEFAULT_ANCHOR_AXES } from "../../anchor-drive.ts";
import { CHAIN_REACH } from "../../config.ts";
import { materialForGolemRole } from "../../materials.ts";
import {
  type EffectorAxisView,
  type EffectorStroke,
  type EffectorStrokeKind,
  type GolemMount,
  type GolemPart,
  type ModuleAxisEnvelope,
  type ModuleBuild,
  type ReachEnvelope,
} from "../../module.ts";
import { ballShell, boneShell } from "../shell.ts";

/**
 * The shoulder and elbow both rungs 2 and 3 are built on: three driven axes and one point.
 *
 * Rung 3 is "the reach chain plus a wrist", and this file is what that sentence means in code.
 * Everything about *where the hand is* -- the geometry, the joint stops, the mouse mapping, the
 * envelope, the clamp, the strokes and the anchor -- lives here and is shared verbatim, so the
 * two rungs cannot drift apart on the half they have in common. What `reach.ts` and `wrist.ts`
 * own is only what hangs off the end of it.
 *
 * **The kinematics, because the envelope arithmetic depends on them.** The collar yaws about the
 * socket's own vertical; the upper arm pitches about the collar's lateral; the elbow bends about
 * that same lateral. Both shoulder pivots sit exactly on the socket, so the whole arm lies in one
 * vertical plane through the socket and the yaw chooses the plane. Writing a limb direction at
 * "pitch angle a" as `(0, -cos a, sin a)` and yawing it by `t` gives
 * `(sin a sin t, -cos a, sin a cos t)`, which against the spherical form
 * `(sin(az) cos(el), sin(el), cos(az) cos(el))` gives **`t = az` and `a = el + pi/2` exactly**.
 * A yaw-then-pitch gimbal *is* spherical coordinates about the socket, with the pole straight
 * down, and that pole is 0.62 rad outside `liftMin` so nothing here goes near it.
 *
 * **The anchor pins the forearm's far end and nothing else.** Three driven axes against three
 * linear constraints leaves no spare axis, so for any reachable target the whole chain -- elbow
 * included -- has exactly one admissible configuration, and the elbow's position is therefore a
 * single-valued function of the hand target. That is frozen rule 2, it is the claim this session
 * exists to test, and `tests/golem-bench.test.mjs` tests it by visiting a grid of the envelope
 * twice from opposite directions rather than by believing this paragraph.
 *
 * **Nothing here reads the achieved pose in order to decide the command.** A controller that
 * takes the error and steps the command toward it winds up: measured on the Warrior at 237 of
 * 420 steps pinned against the wrist stop with the hand 137 mm off its own anchor. The command is
 * a function of the cursor and the clock, and of nothing the solver did.
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
const twoBone = (reach: number): { alpha: number; beta: number } => {
  const L1 = CHAIN_REACH.upperLength;
  const L2 = CHAIN_REACH.foreLength;
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

export interface ArmCore {
  readonly parts: readonly GolemPart[];
  readonly collar: Part;
  readonly upper: Part;
  readonly fore: Part;
  readonly anchor: AnchorDrive;
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
  stroke(): EffectorStroke;
  anchorPoint(): Vector3;
  anchorStray(): number;
  command(next: HandIntent): void;
  step(dt: number): void;
  sever(): void;
  dispose(): void;
}

/** Which stroke is running. `EffectorStroke` is the *phase*; this is the kind. */
type StrokeKind = "none" | "thrust" | "cut";

/**
 * What these chains can be asked for.
 *
 * `cover` is in the list and runs as a held level rather than as a phase, which is the
 * `src/buttons.ts` distinction: a press pays once and a hold is a state. A mind reading this
 * learns that the module can be asked to cover, not that covering has a follow-through.
 */
export const ARM_STROKES: readonly EffectorStrokeKind[] =
  Object.freeze<EffectorStrokeKind[]>(["thrust", "cut", "cover"]);

export function buildArmCore(ctx: ModuleBuild): ArmCore {
  const R = CHAIN_REACH;
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
  const buildLift = R.liftMin;
  const buildReach = R.reachNeutral;
  const buildBones = twoBone(buildReach);
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
  const yawJointMin = outboard > 0 ? R.swingMin - R.jointMargin : -R.swingMax - R.jointMargin;
  const yawJointMax = outboard > 0 ? R.swingMax + R.jointMargin : -R.swingMin + R.jointMargin;
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

  // --- the anchor -------------------------------------------------------------------------
  const handPivot = new Vector3(0, -R.foreLength / 2, 0);
  const handWorld = elbowWorld.add(foreDir.scale(R.foreLength));
  const anchorFrame = limbFrame(forePitch);
  const anchor = new AnchorDrive(ctx.scene, {
    name: ctx.name,
    target: fore,
    position: handWorld.clone(),
    rotation: anchorFrame,
    pivot: handPivot,
    parameters: {
      ...DEFAULT_ANCHOR_AXES,
      // **Position only.** The shoulder and the elbow own where the hand is; nothing here owns
      // which way it faces, and on rung 3 the wrist's two motors own that and only that. There is
      // no six-axis hand pin anywhere in a golem, which is why the Warrior's wrist fight cannot
      // happen here: the two drives share no axis to fight over.
      angular: [],
      linearForce: R.anchorForce,
      linearRate: R.anchorRate,
    },
  });

  // --- the shell --------------------------------------------------------------------------
  const parts: readonly GolemPart[] = Object.freeze([
    Object.freeze({
      id: collar.name,
      part: collar,
      shell: ballShell(ctx.scene, {
        name: collar.name, host: collar.mesh, radius: R.collarRadius,
        band: "across", materials: ctx.materials,
      }),
      health: R.collarHealth,
      vitalityWeight: R.collarVitalityWeight,
      fatal: false,
    }),
    Object.freeze({
      id: upper.name,
      part: upper,
      shell: boneShell(ctx.scene, {
        name: upper.name, host: upper.mesh, length: R.upperLength,
        radius: R.upperRadius, taper: 0.34, materials: ctx.materials,
      }),
      health: R.upperHealth,
      vitalityWeight: R.upperVitalityWeight,
      fatal: false,
    }),
    Object.freeze({
      id: fore.name,
      part: fore,
      shell: boneShell(ctx.scene, {
        name: fore.name, host: fore.mesh, length: R.foreLength,
        radius: R.foreRadius, taper: 0.30, materials: ctx.materials,
      }),
      health: R.foreHealth,
      vitalityWeight: R.foreVitalityWeight,
      fatal: false,
    }),
  ]);

  // --- the envelope -------------------------------------------------------------------------
  const reachable: ReachEnvelope = Object.freeze({
    reachMin: R.reachMin, reachMax: R.reachMax,
    swingMin: R.swingMin, swingMax: R.swingMax,
    liftMin: R.liftMin, liftMax: R.liftMax,
    carryMin: R.carryMin,
  });
  // Reach first, because the readout's settle, arrival and overshoot are taken on the first
  // published axis and `CHAIN_REACH.settledBand` is stated in metres against it.
  const envelopeAxes: readonly ModuleAxisEnvelope[] = Object.freeze([
    Object.freeze({
      id: "reach", unit: "m" as const, min: R.reachMin, max: R.reachMax, rate: R.anchorRate,
    }),
    Object.freeze({
      id: "swing", unit: "rad" as const, min: R.swingMin, max: R.swingMax,
      // The angular rate is not a limit this chain owns: what is rate-limited is the *point*, in
      // metres per second, so the fastest an angle can move is that ceiling divided by the
      // horizontal reach it is moving at. Published at `reachMax`, which is the slowest and
      // therefore the honest one for a mind planning against it.
      rate: R.anchorRate / R.reachMax,
    }),
    Object.freeze({
      id: "lift", unit: "rad" as const, min: R.liftMin, max: R.liftMax,
      rate: R.anchorRate / R.reachMax,
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
  /** The clamped demand: where the mapping wants the hand, before the anchor's rate limit. */
  const demanded: ArmCommand = { swing: 0, lift: buildLift, reach: buildReach };
  /** The same after the rate limit, read back out of the anchor. This is what is published. */
  const slewed: ArmCommand = { swing: 0, lift: buildLift, reach: buildReach };
  /** Where the hand actually got to, in the same three terms. Allocated once, read every step. */
  const achieved: ArmCommand = { swing: 0, lift: buildLift, reach: buildReach };
  let heldReach = buildReach;
  let phase: EffectorStroke = "idle";
  let kind: StrokeKind = "none";
  let phaseTime = 0;
  let appliedForce = R.anchorForce;
  let appliedRate = R.anchorRate;
  const strokeTarget: ArmCommand = { swing: 0, lift: 0, reach: 0 };
  let thrustHeld = false;
  let severed = false;

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
    inverse: new Quaternion(),
  };

  const mountRotation = (): Quaternion =>
    socket.mount.mesh.rotationQuaternion ?? Quaternion.Identity();

  /** A point at `distance` from the socket in the direction (swing, lift), world. */
  const pointAt = (swing: number, lift: number, distance: number, into: Vector3): Vector3 => {
    const az = outboard * swing;
    const cosLift = Math.cos(lift);
    scratch.local.set(Math.sin(az) * cosLift, Math.sin(lift), Math.cos(az) * cosLift);
    scratch.local.rotateByQuaternionToRef(mountRotation(), into);
    return into.scaleInPlace(distance).addInPlace(socket.world);
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
    scratch.read.copyFrom(world).subtractInPlace(socket.world);
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
  const clampInto = (into: ArmCommand, swing: number, lift: number, reach: number): void => {
    into.reach = clamp(reach, R.reachMin, R.reachMax);
    into.lift = clamp(lift, R.liftMin, R.liftMax);
    let s = clamp(swing, R.swingMin, R.swingMax);
    const horizontal = into.reach * Math.cos(into.lift);
    if (horizontal > 1e-6) {
      const floor = Math.asin(clamp(R.carryMin / horizontal, -1, 1));
      if (s < floor) s = Math.min(floor, R.swingMax);
    }
    into.swing = s;
  };

  const setForce = (newtons: number): void => {
    if (newtons === appliedForce) return;
    appliedForce = newtons;
    anchor.setLinearForce(newtons);
  };
  const setRate = (metresPerSecond: number): void => {
    if (metresPerSecond === appliedRate) return;
    appliedRate = metresPerSecond;
    anchor.setLinearRate(metresPerSecond);
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

  const beginStroke = (next: StrokeKind): void => {
    kind = next;
    phase = "drive";
    phaseTime = 0;
    strokeTarget.swing = demanded.swing;
    strokeTarget.lift = demanded.lift;
    strokeTarget.reach = demanded.reach;
  };

  const endStroke = (): void => {
    kind = "none";
    phase = "idle";
    phaseTime = 0;
    setForce(R.anchorForce);
    setRate(R.anchorRate);
  };

  return Object.freeze({
    parts,
    collar,
    upper,
    fore,
    anchor,
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
    anchorPoint: () => anchor.anchor.mesh.position,
    anchorStray: () => anchor.stray(),

    commandedHand: (): Vector3 =>
      scratch.commandedHand.copyFrom(anchor.commandedPoint()),

    commandedForearm: (): Vector3 => {
      const { alpha, beta } = twoBone(clamp(slewed.reach, R.reachMin, R.reachMax));
      const forearmPitch = slewed.lift + Math.PI / 2 - alpha + beta;
      const az = outboard * slewed.swing;
      const across = Math.sin(forearmPitch);
      scratch.local.set(across * Math.sin(az), -Math.cos(forearmPitch), across * Math.cos(az));
      scratch.local.rotateByQuaternionToRef(mountRotation(), scratch.forearm);
      return scratch.forearm;
    },

    commandedLateral: (): Vector3 => {
      const az = outboard * slewed.swing;
      // The collar's own +X after the yaw, which is the arm plane's lateral.
      scratch.local.set(Math.cos(az), 0, -Math.sin(az));
      scratch.local.rotateByQuaternionToRef(mountRotation(), scratch.lateral);
      return scratch.lateral;
    },

    stroke: (): EffectorStroke => phase,

    command(next: HandIntent): void {
      if (severed) return;
      wanted.swing = spanned(next.pointerX * outboard, R.swingMin, R.swingMax);
      // `guard` is a level and it wins over `thrust`, so holding it keeps the limb chambered and
      // a press of thrust on top of it is the cut rather than an extension.
      wanted.lift = next.guard ? R.guardLift : spanned(next.pointerY, R.liftMin, R.liftMax);
      wanted.reach = next.guard ? R.reachGuard : next.thrust ? R.reachThrust : R.reachNeutral;
      // A stroke is an edge, not a level -- `src/buttons.ts`'s rule. Holding the button does not
      // chain strokes, and a stroke already running is not restarted by a second press.
      if (next.thrust && !thrustHeld && phase === "idle") {
        beginStroke(next.guard ? "cut" : "thrust");
      }
      thrustHeld = next.thrust;
    },

    step(dt: number): void {
      if (severed) return;

      // The reach lag runs whatever the stroke is doing, so that when a stroke ends the limb
      // returns to where the cursor is *now* rather than to where it was when the button went
      // down. Rung 1 keeps its own command moving through a chop for exactly this reason.
      heldReach += (wanted.reach - heldReach) * (1 - Math.exp(-R.reachResponse * dt));

      if (phase !== "idle") {
        const S = kind === "cut" ? R.cut : R.thrust;
        phaseTime += dt;
        if (phase === "drive") {
          setRate(S.strokeRate);
          if (kind === "cut") {
            strokeTarget.swing -= R.cut.swingRate * dt;
            strokeTarget.lift -= R.cut.liftRate * dt;
            strokeTarget.reach = R.reachThrust;
          } else {
            // `reachThrust` and **not** `reachMax`: the envelope's outer edge has to be somewhere
            // the follow-through can carry the limb *into* rather than somewhere the drive
            // arrives at. Driven to `reachMax` instead, the hand measured 0.7812 m from its own
            // socket against a full extension of 0.780 -- the arm straight, jammed against the
            // elbow's own stop, which is a motor and a limit pushing at each other and is the
            // buzz `arm.ts`'s wrist was rewritten to get rid of. The table beside `thrust` in
            // `config.ts` is what found it.
            strokeTarget.reach = R.reachThrust;
          }
          if (phaseTime >= S.driveSeconds) {
            phase = "follow";
            phaseTime = 0;
            // The force ceiling drops and the command holds: the limb coasts on its own momentum
            // and decelerates against gravity rather than against the motor. That is the whole
            // difference between a velocity event and a pose sequence.
            setForce(S.followForce);
          }
        } else if (phaseTime >= S.followSeconds) {
          endStroke();
        }
      }

      if (phase === "idle") clampInto(demanded, wanted.swing, wanted.lift, heldReach);
      else clampInto(demanded, strokeTarget.swing, strokeTarget.lift, strokeTarget.reach);

      pointAt(demanded.swing, demanded.lift, demanded.reach, scratch.target);
      // The rotation handed over never changes, because no angular axis is motorised on this
      // anchor: the wrist owns orientation on rung 3 and nothing owns it on rung 2. Passing the
      // build frame rather than a live one keeps that visible -- a rotation that moved here would
      // be a second owner appearing.
      anchor.drive(dt, scratch.target, anchorFrame);
      sphericalOf(anchor.commandedPoint(), slewed);

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

    sever(): void {
      if (severed) return;
      severed = true;
      // The drives go with the limb. A motor still dragging a chain that has been cut off is the
      // haunting the Warrior's anchors produce when an arm comes away from them.
      anchor.release();
      yaw?.dispose();
      yaw = null;
      pitch?.dispose();
      pitch = null;
      elbowJoint?.dispose();
      elbowJoint = null;
    },

    dispose(): void {
      severed = true;
      anchor.dispose();
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
