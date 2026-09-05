import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Physics6DoFConstraint } from "@babylonjs/core/Physics/v2/physicsConstraint.js";

import type { HandCursor, HandIntent } from "../../../mind.ts";
import { capsulePart, joint, type Part } from "../../../rig.ts";
import { AnchorDrive, DEFAULT_ANCHOR_AXES } from "../../anchor-drive.ts";
import { CHAIN_REACH } from "../../config.ts";
import { materialForGolemRole } from "../../materials.ts";
import {
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
import { ballShell, boneShell } from "../shell.ts";

/**
 * The shoulder and elbow both rungs 2 and 3 are built on: three driven axes and one point.
 *
 * Rung 3 is "the reach chain plus a wrist", and this file is what that sentence means in code.
 * Everything about *where the hand is* -- the geometry, the joint stops, the command mapping, the
 * envelope, the clamp and the anchor -- lives here and is shared verbatim, so the two rungs cannot
 * drift apart on the half they have in common. What `reach.ts` and `wrist.ts` own is only what
 * hangs off the end of it.
 *
 * **This chain is a pure follower, and Session 12 is what made it one.** It used to do three
 * things to its commander on top of following them, and all three were removed together because
 * they were the same mistake three times:
 *
 * - `guard` overwrote the commanded elevation with a constant. Instrumented over eight bouts,
 *   `golem-duelist` asked its shield arm for **2001 distinct elevations and got 0.80 rad every
 *   time**, which is what held the plate above the golem's own head in the page.
 * - the reach was taken from the two buttons, three preset distances deep, so the arm's third
 *   positional degree of freedom had no continuous channel at all: **one distinct reach per hand
 *   over the same eight bouts**, against a shell 0.42 m deep.
 * - `thrust` started a scripted stroke -- a fixed sweep at a fixed rate for a fixed duration --
 *   during which `clampInto` was handed the *script's* target instead of the commander's, so the
 *   policy lost its own arm for the duration. **11 % of frames against the Warrior duelist,
 *   15.8 % against another golem.**
 *
 * What replaced them is one sentence: the chain spans three normalized channels onto its own
 * published envelope, clamps, and hands the anchor the result. Speed is what a commander gets by
 * moving its target quickly against a finite force budget and real mass, which is frozen rule 4
 * and is the only place speed should ever have come from. The scripting did not disappear -- a
 * mouse still needs it, and `src/buttons.ts` is where a person's held button becomes a reach --
 * it moved to the side of the seam that knows who is asking.
 *
 * **The published `EffectorStroke` is therefore always `idle` here.** That phase was the phase of
 * a scripted velocity event, and there is no script; a chain being driven fast by a commander is
 * not in a phase, it is being driven fast. What the module still publishes on its envelope is
 * `ARM_STROKES`, which is a different claim and survives unchanged -- see the note there.
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
  /**
   * The two aiming axes of the cursor that command the pose this core is commanding.
   *
   * `roll` and `wristBend` are the wrist's and are zero here: rung 2 has no orientation to
   * express, so rung 3 overwrites those two and rung 2 answers the honest zero. See
   * `BuiltChain.cursor`.
   */
  cursor(): HandCursor;
  command(next: HandIntent): void;
  step(dt: number): void;
  /** Let go of the anchor and keep the linkage. See `BuiltChain.unmotorise`. */
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

export function buildArmCore(ctx: ModuleBuild, narrowed: ChainLimits | null): ArmCore {
  const R = CHAIN_REACH;
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
    swingMin: atLeast(R.swingMin, narrowed?.swingMin ?? null),
    swingMax: atMost(R.swingMax, narrowed?.swingMax ?? null),
    liftMin: atLeast(R.liftMin, narrowed?.liftMin ?? null),
    liftMax: atMost(R.liftMax, narrowed?.liftMax ?? null),
    carryMin: atLeast(R.carryMin, narrowed?.carryMin ?? null),
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
  /** The same after the rate limit, read back out of the anchor. This is what is published. */
  const slewed: ArmCommand = { swing: 0, lift: buildLift, reach: buildReach };
  /** Where the hand actually got to, in the same three terms. Allocated once, read every step. */
  const achieved: ArmCommand = { swing: 0, lift: buildLift, reach: buildReach };
  let severed = false;
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
    inverse: new Quaternion(),
  };

  const mountRotation = (): Quaternion =>
    socket.mount.mesh.rotationQuaternion ?? Quaternion.Identity();

  /**
   * Where this chain's socket is **now**, world, into a ref this core owns.
   *
   * `GolemSocket.world` is by contract the socket's position *at construction*, which is what the
   * bodies and the joints above were built against and is all a chain bolted to the bench's
   * kinematic block ever needs. Session 08 bolts one to a torso on a walking carrier, and a
   * commanded point taken from the build-time world is the pose the arm should hold on a golem
   * that stayed where it was put: the anchor would be sent to a fixed point in the arena and the
   * limb would trail its own shoulder by however far the golem had walked.
   *
   * **Measured, and it is not a lag, it is the whole walk.** One default golem walking forward for
   * ten seconds in the Node arena harness (2026-09-04, `.review/golem-measure.mjs`) covers 11.82 m,
   * and the peak stray between the driven hand and its own anchor over that walk is:
   *
   * | commanded point built on | peak primary anchor stray | peak tip speed |
   * | --- | --- | --- |
   * | `socket.world`, the build-time frame | **10449.1 mm** | 10.16 m/s |
   * | the live socket, below | **0.6 mm** | 3.62 m/s |
   *
   * The stray is the distance walked, to within the reach of the arm, because that is exactly what
   * it was: the anchor stayed at the arena origin and the golem walked away from it, dragging the
   * limb against its own stops the whole way. The tip speed is the same defect read from the other
   * end -- a limb hauled along behind a body is moving fast without swinging at anything.
   * `AGENTS.md` says a driven limb not within a few millimetres of its own anchor is stuck on
   * something rather than posed wrongly; here it was stuck on the past.
   *
   * `mesh.position` and `mesh.rotationQuaternion` and nothing else: the world matrix
   * short-circuits on the render id and reading it stamps that id. Session 07's torso and head
   * recompute the same way and say so; this is the third statement of one rule, and the reason it
   * is stated three times is that all three modules are driven from a mount that can move.
   */
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
   * The anchor keeps its own limiter, which is now a backstop rather than the mechanism: it
   * still catches the first control step, where its command starts at the built hand's actual
   * world position rather than at a mapped pose.
   */
  const stepToward = (from: ArmCommand, to: ArmCommand, metres: number): void => {
    const radius = from.reach;
    const forward = to.reach - from.reach;
    const elevation = (to.lift - from.lift) * radius;
    const lateral = (to.swing - from.swing) * radius * Math.cos(from.lift);
    const travel = Math.hypot(forward, elevation, lateral);
    const fraction = travel <= metres || travel < 1e-12 ? 1 : metres / travel;
    from.reach += (to.reach - from.reach) * fraction;
    from.lift += (to.lift - from.lift) * fraction;
    from.swing += (to.swing - from.swing) * fraction;
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
      const { alpha, beta } = twoBone(clamp(slewed.reach, L.reachMin, L.reachMax));
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

    // `slewed`, which is the anchor's own rate-limited point read back through `sphericalOf` --
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
      // anchor's own rate ceiling is the single limiter now, and it is the same one all three
      // axes go through.
      clampInto(demanded, wanted.swing, wanted.lift, wanted.reach);
      // And the rate limit, in the same coordinates the clamp is written in, so that every point
      // the anchor is ever handed is inside the envelope rather than merely every point the
      // mapping asks for. The second clamp is cheap insurance and not decoration: the carry floor
      // is a curve in these coordinates and a straight interpolation between two poses that both
      // clear it is not obliged to.
      stepToward(sent, demanded, R.anchorRate * dt);
      clampInto(sent, sent.swing, sent.lift, sent.reach);

      pointAt(sent.swing, sent.lift, sent.reach, scratch.target);
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

    unmotorise(): void {
      if (passive) return;
      passive = true;
      // The anchor's constraint goes and the anchor's body stays, which is exactly
      // `AnchorDrive.release`. Nothing else moves: the yaw, pitch and elbow joints and every
      // one of their stops are what makes the trailing limb an *arm* rather than a rope, and
      // they are the half of the linkage that is still doing a job.
      anchor.release();
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
