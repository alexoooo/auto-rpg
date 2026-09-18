import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import {
  PhysicsConstraintAxis,
  PhysicsConstraintAxisLimitMode,
  PhysicsConstraintMotorType,
  PhysicsMotionType,
} from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";
import type { PhysicsBody } from "@babylonjs/core/Physics/v2/physicsBody.js";
import type { Physics6DoFConstraint } from "@babylonjs/core/Physics/v2/physicsConstraint.js";
import type { Observer } from "@babylonjs/core/Misc/observable.js";

import type { Striking } from "../../combat.ts";
import { boxPart, cylinderPart, joint } from "../../rig.ts";
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
import { BENCH_STAND_LOCOMOTION, LOCOMOTION_WHEEL } from "../config.ts";
import { materialForGolemRole } from "../materials.ts";
import {
  NO_STROKES,
  type EffectorView,
  type GolemPart,
  type ModuleBuild,
  type ModuleEnvelope,
} from "../module.ts";
import {
  LocomotionReadout,
  blankLocomotionEvidence,
  defineLocomotion,
  stepSoloCarrier,
  type BuiltLocomotion,
  type LocomotionCommand,
  type LocomotionEvidence,
  type LocomotionHeightRange,
  type LocomotionReadoutState,
  type LocomotionSupportBinding,
} from "../locomotion.ts";

/**
 * The wheel: one rolling body under a fork under the torso.
 *
 * **Everything about the carrier is the biped's and is not repeated here.** The yoke is `ANIMATED`
 * and follows a bodyless `VirtualLocomotionCarrier` that has already resolved where the golem is
 * allowed to be; an authored knockdown is the one thing that releases it to `DYNAMIC`; nothing in
 * this file balances and no motor ceiling in `LOCOMOTION_WHEEL` is holding the golem up. Read
 * `src/golem/locomotion/biped.ts`'s header for why, once.
 *
 * **What is different is the one thing this option exists for: it rolls.** The wheel is a real
 * `DYNAMIC` body on a free hinge under the yoke, it is the only part of the golem that touches the
 * world, and its spin is a `VELOCITY` motor whose target is `carrier speed / wheelRadius` -- so
 * the tread turns at exactly the rate the ground is passing under it and the contact patch stands
 * still. That is what `LocomotionEvidence.footSlipMps` reads on this module, and it is the number
 * that says whether the thing is a wheel or a skid: it is the **material** velocity of the piece
 * of tread against the floor, `v + omega x r`, which is zero for rolling and the whole carrier
 * speed for dragging.
 *
 * **The spin is derived from the carrier and never from the wheel's own rotation.** A controller
 * that read the achieved spin and stepped the command toward it would wind up against the tread's
 * own contact exactly as the Warrior's arm wound up against its wrist stop -- 237 of 420 steps
 * pinned on a limit. There is no feedback here at all: the carrier says how fast it is going and
 * the motor is asked for that.
 *
 * **Three things this body has that the biped does not, each with a reading behind it.**
 *
 * - *No height range.* `heightRange.crouchM === standM`, which `defineLocomotion` admits and the
 *   registry publishes. A wheel cannot crouch and pretending otherwise would be a command channel
 *   that does nothing.
 * - *No strafe.* A wheel cannot travel sideways, so `command` clamps `localRight` to zero and the
 *   envelope publishes a strafe axis whose range is `0..0`. That is frozen rule 3 -- the command
 *   is clamped into the envelope before the carrier is ever handed it -- and not a refusal branch.
 * - *A lower fall threshold, and it comes through the `StabilityAuthority` like everything else.*
 *   `braceCapacityMultiplier` is 1.0 (the floor the state machine admits) against the biped's 1.5,
 *   and the gait scale runs from 0.70 standing to 0.35 at speed where the biped's runs 1.00 to
 *   0.75. There is no special case anywhere: the same frozen `FALL_SPECIFIC_IMPULSE_MPS` lands
 *   less than half as high on this body, which is what makes the cross-module comparison in
 *   `tests/golem-locomotion.test.mjs` mean something.
 *
 * **A wheel that cannot fall over is not a wheel**, which is Session 05's finding restated for one
 * joint: the spin motor's ceiling drops to `fallenTorqueScale` while the body is fallen, because a
 * released root whose wheel is still being driven is a knocked-down golem motoring itself along the
 * floor -- a stumble rather than a knockdown.
 */

const UP = Object.freeze(new Vector3(0, 1, 0));
const FORWARD = Object.freeze(new Vector3(0, 0, 1));
const LATERAL = Object.freeze(new Vector3(1, 0, 0));

const clamp = (value: number, low: number, high: number): number =>
  value < low ? low : value > high ? high : value;

const wrapAngle = (value: number): number => Math.atan2(Math.sin(value), Math.cos(value));

/** How far the module's socket sits above the ground the tread stands on, metres. */
export const wheelStandHeight = (): number => {
  const W = LOCOMOTION_WHEEL;
  return W.wheelRadius * 2 + W.forkClearance + W.yokeHeight;
};

/**
 * The wheel's height range: a single number twice over.
 *
 * `crouchM === standM` is the frozen choice and the first place the contract carries a real
 * difference. Session 05 wrote it into `LocomotionHeightRange`'s own docstring before this module
 * existed -- "equal to `standM` for a carrier that does not crouch" -- so nothing here is a
 * special case, and `defineLocomotion` admits it because its guard is `crouchM <= standM`.
 */
const wheelHeightRange = (): LocomotionHeightRange => Object.freeze({
  standM: wheelStandHeight(),
  crouchM: wheelStandHeight(),
});

const wheelFootprint = (): LocomotionFootprint => deriveLocomotionFootprint({
  radiusM: LOCOMOTION_WHEEL.footprintRadius,
  heightM: LOCOMOTION_WHEEL.footprintHeight,
  provenance: {
    profileId: "locomotion.wheel",
    source: "golem-bind-geometry",
    measuredAt: "constructor-bind-pose",
  },
});

/**
 * One support binding, and it is the whole of the support proof.
 *
 * A biped declares two soles and can lose one; a wheel has one contact and losing it is losing the
 * lot. **A contact is still not a posture verdict**, which is why `postureEvidence` publishes
 * root-up, root-above-contact and stack-above-root together and `constructPostureIsSupported`
 * reads all three: a wheel golem lying on its side has its tread against the floor exactly as a
 * fallen Swordbearer had two feet on it.
 */
const SUPPORT_BINDINGS: readonly LocomotionSupportBinding[] = Object.freeze([
  Object.freeze({ role: "wheel", label: "tread contact" }),
]);

export const wheelModule = defineLocomotion({
  id: "locomotion.wheel",
  slots: Object.freeze(["locomotion" as const]),
  label: "wheel - one rolling body on a fork",
  massKg: LOCOMOTION_WHEEL.yokeMass + LOCOMOTION_WHEEL.wheelMass,
  carrier: LOCOMOTION_WHEEL.carrier,
  heightRange: wheelHeightRange(),
  footprint: wheelFootprint(),
  supportBindings: SUPPORT_BINDINGS,

  build(ctx: ModuleBuild): BuiltLocomotion {
    const W = LOCOMOTION_WHEEL;
    const socket = ctx.socket;
    const facing = socket.rotation;
    const stone = materialForGolemRole(ctx.materials, "shell");
    const bronze = materialForGolemRole(ctx.materials, "joint");
    const standHeight = wheelStandHeight();
    const footprint = wheelFootprint();

    /** A point in the golem's own upright frame, carried into the world through the socket. */
    const local = new Vector3();
    const place = (x: number, downFromSocket: number, z: number): Vector3 => {
      local.set(x, -downFromSocket, z);
      const out = new Vector3();
      local.rotateByQuaternionToRef(facing, out);
      return out.addInPlace(socket.world);
    };

    // --- the build pose ------------------------------------------------------------------------
    //
    // Down from the socket: half the yoke to its centre, then the yoke's own lower half, the fork
    // clearance and the wheel's radius to the axle. `axleDown + wheelRadius` is `standHeight`
    // exactly, which is the arithmetic this module stands on -- the tread lands on the ground the
    // socket implies, or the socket is in the wrong place and the test that measures it says so.
    const yokeDown = W.yokeHeight / 2;
    const axleDown = W.yokeHeight + W.forkClearance + W.wheelRadius;

    const yoke = boxPart(ctx.scene, {
      name: `${ctx.name}.yoke`,
      position: place(0, yokeDown, 0),
      rotation: facing,
      size: new Vector3(W.yokeWidth, W.yokeHeight, W.yokeDepth),
      mass: W.yokeMass,
      layer: ctx.layers.body,
      collidesWith: ctx.layers.bodyCollidesWith,
      material: stone,
      // The carrier's own root, keyframed onto what the virtual carrier resolved. A knockdown
      // flips it to `DYNAMIC` and the whole assembly becomes a ragdoll on a loose wheel.
      motionType: PhysicsMotionType.ANIMATED,
    });
    yoke.body.setLinearDamping(W.linearDamping);
    yoke.body.setAngularDamping(W.angularDamping);

    /**
     * The wheel, built with its axle across the body.
     *
     * `cylinderPart` derives the shape from the mesh's **local** bounding box and Babylon builds a
     * cylinder along local Y, so laying the axle across the golem is a rotation of the *mesh*: a
     * quarter turn about Z carries local +Y onto the golem's own +X. Babylon's quaternion
     * `a.multiply(b)` applies `b` first, which is the opposite of its matrices' row-vector order,
     * so `facing.multiply(quarterTurn)` is "turn the wheel onto its axle, then face the golem".
     * Getting that backwards is the weld-frame fling in a new costume -- a body built at odds with
     * its own constraint is a violation the solver clears by throwing something.
     */
    const axleTurn = Quaternion.RotationAxis(new Vector3(0, 0, 1), -Math.PI / 2);
    const wheel = cylinderPart(ctx.scene, {
      name: `${ctx.name}.wheel`,
      position: place(0, axleDown, 0),
      rotation: facing.multiply(axleTurn),
      height: W.wheelWidth,
      diameter: W.wheelRadius * 2,
      tessellation: 28,
      mass: W.wheelMass,
      layer: ctx.layers.body,
      collidesWith: ctx.layers.bodyCollidesWith,
      material: stone,
      // The one body here with a friction number of its own: it is the one that touches the world,
      // and how much grip the tread has is what decides whether the golem rolls or skids.
      friction: W.wheelFriction,
    });
    wheel.body.setLinearDamping(W.linearDamping);
    wheel.body.setAngularDamping(W.angularDamping);

    // --- the hinge -----------------------------------------------------------------------------
    //
    // One constraint type throughout, as `rig.ts` insists. The axle is the yoke's own local X and
    // the wheel's own local Y, which the build rotation above put on top of each other; `perpChild`
    // is the wheel's local -X because that is what the same quarter turn carries onto the golem's
    // +Y. Two frames that disagreed at construction would be a violation, and the solver clears
    // those by flinging.
    let hinge: Physics6DoFConstraint | null = joint(ctx.scene, yoke, wheel, {
      pivotParent: new Vector3(0, -(yokeDown + W.forkClearance + W.wheelRadius), 0),
      pivotChild: Vector3.Zero(),
      axisParent: new Vector3(1, 0, 0),
      axisChild: new Vector3(0, 1, 0),
      perpParent: new Vector3(0, 1, 0),
      perpChild: new Vector3(-1, 0, 0),
      // A range rather than nothing, because `joint` locks any axis it is given no range for. It
      // is immediately replaced by `FREE` below: a wheel turns without end, and a limited axis is
      // a wheel that stops after two thirds of a turn.
      swing: { x: { min: -1, max: 1 } },
      damping: W.motorDamping,
    });
    hinge.setAxisMode(PhysicsConstraintAxis.ANGULAR_X, PhysicsConstraintAxisLimitMode.FREE);

    // --- the shell -----------------------------------------------------------------------------
    //
    // Cosmetics carry no authority: the collider is the yoke box and the wheel cylinder, and every
    // mesh below has no body, no shape and no pick. The fork prongs are the clearest case of the
    // rule in this tree -- they pass either side of a turning wheel, and a *collider* shaped like
    // that would be permanent contact between the wheel and its own mounting.
    const shells: AbstractMesh[] = [];
    const dress = (mesh: AbstractMesh, host: AbstractMesh, at: Vector3,
      rotation?: Quaternion): AbstractMesh => {
      mesh.isPickable = false;
      mesh.parent = host;
      mesh.position.copyFrom(at);
      mesh.rotationQuaternion = rotation ?? Quaternion.Identity();
      shells.push(mesh);
      return mesh;
    };

    const prongDrop = W.forkClearance + W.wheelRadius;
    for (const side of [-1, 1]) {
      const prong = MeshBuilder.CreateBox(`${ctx.name}.fork${side < 0 ? "L" : "R"}`, {
        width: 0.07, height: prongDrop + W.yokeHeight * 0.4, depth: 0.16,
      }, ctx.scene);
      prong.material = stone;
      dress(prong, yoke.mesh,
        new Vector3(side * (W.wheelWidth / 2 + 0.06), -(prongDrop / 2 + W.yokeHeight * 0.3), 0));
      const cap = MeshBuilder.CreateCylinder(`${ctx.name}.axle${side < 0 ? "L" : "R"}`, {
        diameter: 0.14, height: 0.06, tessellation: 12,
      }, ctx.scene);
      cap.material = bronze;
      dress(cap, yoke.mesh,
        new Vector3(side * (W.wheelWidth / 2 + 0.06), -(yokeDown + prongDrop), 0),
        Quaternion.RotationAxis(new Vector3(0, 0, 1), Math.PI / 2));
    }

    /**
     * The hub, six spokes and eight rim cleats -- and this is the one shell in the tree that is
     * not decoration.
     *
     * **A featureless disc turning about its own axis looks exactly like a disc standing still.**
     * The gate's question for this option is "does the wheel roll", and nothing about a smooth
     * grey cylinder answers it from a camera at any frame rate: the silhouette is a circle and the
     * surface is untextured stone, so a person watching cannot tell a rolling wheel from a sliding
     * one, which is the *whole difference* this module exists to carry. The first draft's spokes
     * were built 3.5 mm proud of a 180 mm tread and were invisible on the page; these stand 30 mm
     * proud of the faces and the cleats 25 mm proud of the rim.
     *
     * In the wheel's own frame the disc lies in local X-Z and local Y is the axle, because the
     * mesh was turned onto its axle at build -- so a spoke is placed round X-Z, turned about Y,
     * and its *height* is the dimension that runs across the tread.
     */
    const hub = MeshBuilder.CreateCylinder(`${ctx.name}.wheel.hub`, {
      diameter: W.wheelRadius * 0.7, height: W.wheelWidth * 1.16, tessellation: 16,
    }, ctx.scene);
    hub.material = bronze;
    dress(hub, wheel.mesh, Vector3.Zero());
    for (let index = 0; index < 6; index += 1) {
      const angle = index * Math.PI / 3;
      const spoke = MeshBuilder.CreateBox(`${ctx.name}.wheel.spoke${index}`, {
        width: 0.06, height: W.wheelWidth + 0.06, depth: W.wheelRadius * 0.82,
      }, ctx.scene);
      spoke.material = bronze;
      dress(spoke, wheel.mesh,
        new Vector3(Math.sin(angle) * W.wheelRadius * 0.46, 0,
          Math.cos(angle) * W.wheelRadius * 0.46),
        Quaternion.RotationAxis(new Vector3(0, 1, 0), angle));
    }
    for (let index = 0; index < 8; index += 1) {
      // The cleats are what a person actually watches: a band of bronze crossing the tread at the
      // rim, standing proud of it, eight of them going past the eye once a turn.
      const angle = index * Math.PI / 4;
      const cleat = MeshBuilder.CreateBox(`${ctx.name}.wheel.cleat${index}`, {
        width: 0.11, height: W.wheelWidth * 1.04, depth: 0.06,
      }, ctx.scene);
      cleat.material = bronze;
      dress(cleat, wheel.mesh,
        new Vector3(Math.sin(angle) * W.wheelRadius * 0.99, 0,
          Math.cos(angle) * W.wheelRadius * 0.99),
        Quaternion.RotationAxis(new Vector3(0, 1, 0), angle));
    }

    /**
     * The waist, on exactly the terms the biped states.
     *
     * `GolemSocket.mount` is "the body this module hangs from" and locomotion inverts that: the
     * mount rides on the module. So the relationship is decided by a measured property of the
     * mount rather than by a mode flag -- a `DYNAMIC` mount is a load and gets a soft motorised
     * waist, an `ANIMATED` one is a fixed anchor and is left alone.
     */
    const carried = ctx.socket.mount.body.getMotionType() === PhysicsMotionType.DYNAMIC;
    const L = BENCH_STAND_LOCOMOTION;
    let waist: Physics6DoFConstraint | null = carried
      ? joint(ctx.scene, yoke, ctx.socket.mount, {
        pivotParent: new Vector3(0, W.yokeHeight / 2, 0),
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
    const carriedMassKg = carried ? ctx.socket.mount.body.getMassProperties().mass ?? 0 : 0;

    const frozenParts: readonly GolemPart[] = Object.freeze([
      Object.freeze({
        id: yoke.name,
        part: yoke,
        shell: Object.freeze([yoke.mesh, ...shells.filter((mesh) => mesh.parent === yoke.mesh)]),
        health: W.yokeHealth,
        vitalityWeight: W.yokeVitalityWeight,
        // **The one fatal part.** Losing the wheel costs a golem its movement; losing the yoke is
        // the end of it, and Session 08's vitality rule needs somebody to say so.
        fatal: true,
      }),
      Object.freeze({
        id: wheel.name,
        part: wheel,
        shell: Object.freeze([wheel.mesh, ...shells.filter((mesh) => mesh.parent === wheel.mesh)]),
        health: W.wheelHealth,
        vitalityWeight: W.wheelVitalityWeight,
        fatal: false,
      }),
    ]);

    // --- state ---------------------------------------------------------------------------------
    const groundY = socket.world.y - standHeight;
    const standingYokeY = socket.world.y - yokeDown;
    const supportedMassKg = W.yokeMass + W.wheelMass + carriedMassKg;
    const yaw = facing.toEulerAngles().y;

    let request: LocomotionRequest = Object.freeze({
      localForward: 0, localRight: 0, yaw: 0, recover: false,
    });
    let severed = false;
    let risingStart: Quaternion | null = null;
    let port: PhysicalSupportedLocomotionPort | null = null;
    let elapsed = 0;
    let contacts = 0;
    let selfContacts = 0;
    let commandedSpin = 0;
    let lastSpinAngle = 0;
    let achievedSpin = 0;
    let sampled = false;

    const watchers: [PhysicsBody, Observer<unknown>][] = [];
    const evidence = blankLocomotionEvidence();
    const readout = new LocomotionReadout();
    const lastWheel = new Vector3();

    const scratch = {
      up: new Vector3(),
      other: new Vector3(),
      axle: new Vector3(),
      forward: new Vector3(),
      marker: new Vector3(),
      contact: new Vector3(),
      slip: new Vector3(),
      velocity: new Vector3(),
      drive: new Vector3(),
      angular: new Vector3(),
      target: new Vector3(),
      desired: new Quaternion(),
      rotation: new Quaternion(),
      rising: new Quaternion(),
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
      massKg: supportedMassKg,
      released: false,
    };

    /**
     * Refresh the root reading once per substep.
     *
     * **The budget is the number of boundary reads, not the number of `Vector3`s.**
     * `getLinearVelocityToRef` is not allocation-free -- the emscripten glue builds a fresh array
     * per call, 216 B -- and the port samples the root three or four times a boundary. So this
     * module makes exactly one plugin velocity read per substep and nothing else: the wheel's own
     * velocity and its spin are both *differenced from transforms*, which cost nothing at all and
     * stamp no render id, because `mesh.position` and `mesh.rotationQuaternion` are what Havok's
     * `syncTransform` writes at the end of every solver step.
     */
    const refreshRoot = (): void => {
      yoke.body.getLinearVelocityToRef(scratch.velocity);
      rootSample.velocity.x = scratch.velocity.x;
      rootSample.velocity.y = scratch.velocity.y;
      rootSample.velocity.z = scratch.velocity.z;
    };

    const adapter: SupportedRootAdapter = {
      sample: (): DynamicRootSample => {
        const motion = yoke.body.getMotionType();
        rootSample.motionType = motion === PhysicsMotionType.DYNAMIC ? "dynamic"
          : motion === PhysicsMotionType.ANIMATED ? "animated" : "static";
        rootSample.position.x = yoke.mesh.position.x;
        rootSample.position.y = yoke.mesh.position.y;
        rootSample.position.z = yoke.mesh.position.z;
        rootSample.released = severed;
        return rootSample as DynamicRootSample;
      },
      // Only reached if something makes the root `DYNAMIC` without releasing it, which this module
      // never does; kept correct rather than kept as a throw, because the bounded motor is the
      // fallback the port takes when `driveAnimatedRoot` is absent.
      applyForce: (force: WorldPoint): void => {
        scratch.drive.set(force.x, force.y + supportedMassKg * 9.81, force.z);
        yoke.body.applyForce(scratch.drive, yoke.mesh.position);
      },
      clearDrive: (): void => {
        if (yoke.body.getMotionType() !== PhysicsMotionType.ANIMATED) return;
        scratch.drive.set(0, 0, 0);
        yoke.body.setLinearVelocity(scratch.drive);
        yoke.body.setAngularVelocity(scratch.drive);
      },
    };

    const rootUp = (): Vector3 => {
      UP.rotateByQuaternionToRef(yoke.mesh.rotationQuaternion ?? Quaternion.Identity(), scratch.up);
      return scratch.up;
    };
    const rootForward = (): Vector3 => {
      FORWARD.rotateByQuaternionToRef(
        yoke.mesh.rotationQuaternion ?? Quaternion.Identity(), scratch.forward);
      return scratch.forward;
    };
    /** The axle, as the yoke holds it: the root's own lateral. */
    const rootAxle = (): Vector3 => {
      LATERAL.rotateByQuaternionToRef(
        yoke.mesh.rotationQuaternion ?? Quaternion.Identity(), scratch.axle);
      return scratch.axle;
    };

    /**
     * Where the tread touches, in world space.
     *
     * The lowest point of a disc, which is *not* "the centre minus the radius" once the wheel is
     * tilted: the point is the one furthest down **in the wheel's own plane**, so world down is
     * projected onto that plane first. Upright the two agree exactly, and the general form is what
     * keeps the support point honest through a lean.
     */
    const contactPoint = (into: Vector3): Vector3 => {
      const axle = rootAxle();
      const alongAxle = -axle.y;
      into.set(-axle.x * alongAxle, -1 - axle.y * alongAxle, -axle.z * alongAxle);
      const length = into.length();
      if (length > 1e-6) into.scaleInPlace(W.wheelRadius / length);
      else into.set(0, -W.wheelRadius, 0);
      return into.addInPlace(wheel.mesh.position);
    };

    /**
     * How far the wheel has turned about its own axle, radians, from a marker on the tread.
     *
     * The wheel's local +Z is a material point of the disc, so its angle in the yoke's own
     * up/forward frame *is* the spin. Read from `rotationQuaternion` and nothing else: it costs no
     * boundary crossing and stamps no render id, where `getAngularVelocityToRef` is 184 B a call
     * and would be a second reading of a thing the transform already says.
     */
    const spinAngle = (): number => {
      FORWARD.rotateByQuaternionToRef(
        wheel.mesh.rotationQuaternion ?? Quaternion.Identity(), scratch.marker);
      return Math.atan2(-Vector3.Dot(scratch.marker, rootUp()),
        Vector3.Dot(scratch.marker, rootForward()));
    };

    const postureEvidence = (): ConstructPostureEvidence => Object.freeze({
      // One wheel, still attached. `chainContinuous` is the construct record's name for it, and a
      // wheel golem with no wheel is not a golem that can prove it is standing.
      chainContinuous: !severed,
      carrierUpDot: rootUp().y,
      rootHeightAboveCarrierM: yoke.mesh.position.y - contactPoint(scratch.contact).y,
      terminalHeightAboveRootM: carried
        ? ctx.socket.mount.mesh.position.y - yoke.mesh.position.y
        : yoke.mesh.position.y - contactPoint(scratch.contact).y,
    });

    /** What the carrier committed to, along the golem's own forward. Signed: a wheel reverses. */
    const carrierForward = (): number => {
      const allowed = port?.priorAllowed() ?? null;
      if (!allowed) return 0;
      return clamp(allowed.localForward, -1, 1) * W.carrier.maxSpeedMps;
    };
    const carrierSpeed = (): number => Math.abs(carrierForward());

    const authority = (): StabilityAuthority => {
      // The one live field, and on this body both ends of it are below the biped's. A wheel is
      // easier to put over at speed for the same reason a biped is -- more of its capacity is
      // spent going somewhere -- and it starts lower because a single contact line has no
      // fore-aft base at all. Clamped into (0, 1], which the state machine's own boundary check
      // refuses to be handed anything outside of.
      const fraction = clamp(carrierSpeed() / W.carrier.maxSpeedMps, 0, 1);
      const scale = clamp(W.gaitStabilityScaleStand -
        (W.gaitStabilityScaleStand - W.gaitStabilityScaleMin) * fraction, 1e-6, 1);
      return Object.freeze({
        carrierPartId: yoke.name,
        supportBindings: Object.freeze(SUPPORT_BINDINGS.map(({ role }) => Object.freeze({ role }))),
        braceCapacityMultiplier: W.braceCapacityMultiplier,
        gaitStabilityScale: scale,
      });
    };

    const world = ctx.world ?? flatSupportedWorldRegistry();

    const activePort = new PhysicalSupportedLocomotionPort({
      id: `${ctx.name}.locomotion`,
      position: { x: yoke.mesh.position.x, y: standingYokeY, z: yoke.mesh.position.z },
      yaw,
      footprint,
      ownerPartIds: new Set(frozenParts.map(({ id }) => id)),
      root: adapter,
      registry: world,
      config: W.carrier,
      supportedMassKg,
      authority,
      supportBindings: Object.freeze(SUPPORT_BINDINGS.map(({ role }) => role)),
      supportPoint: (binding: string): WorldPoint | null => {
        if (binding !== "wheel" || severed) return null;
        const point = contactPoint(scratch.contact);
        return { x: point.x, y: point.y, z: point.z };
      },
      liveSupport: () => !severed,
      postureSupported: () => constructPostureIsSupported(postureEvidence()),

      /**
       * The supported drive, and the two halves are the biped's exactly.
       *
       * Above root-up 0.995 the body is upright and what it needs is to move; below it something
       * has tilted it, and an `ANIMATED` Havok root ignores x/z angular-velocity correction
       * outright, so the bounded transform target from `src/supported-root-drive.ts` is what rights
       * it. The one simplification is the height: a wheel has no stride bob and no crouch, so the
       * wanted height is a constant and the rate ceiling is what carries it back after a lean.
       */
      driveAnimatedRoot: (targetPosition, targetVelocity, targetYaw, dt): void => {
        const rotation = yoke.mesh.rotationQuaternion ?? Quaternion.Identity();
        const rise = clamp((standingYokeY - yoke.mesh.position.y) / dt,
          -W.heightRate, W.heightRate);
        if (rootUp().y >= 0.995) {
          scratch.drive.set(targetVelocity.x, rise, targetVelocity.z);
          yoke.body.setLinearVelocity(scratch.drive);
          const actualYaw = rotation.toEulerAngles().y;
          const yawError = wrapAngle(targetYaw - actualYaw);
          scratch.angular.set(0, clamp(yawError * 8,
            -W.carrier.maxYawSpeedRadS, W.carrier.maxYawSpeedRadS), 0);
          yoke.body.setAngularVelocity(scratch.angular);
          return;
        }
        supportedRootTargetToRef(yoke.mesh.position, rotation,
          { x: targetVelocity.x, z: targetVelocity.z }, targetYaw, dt,
          W.carrier.maxYawSpeedRadS, scratch.target, scratch.desired, scratch.rotation);
        scratch.target.y = yoke.mesh.position.y + rise * dt;
        yoke.body.setTargetTransform(scratch.target, scratch.rotation);
        void targetPosition;
      },

      /** The rise: the bounded actuator's frame, and the yaw slerped across the whole of it. */
      driveRisingRoot: (targetPosition, _targetVelocity, targetYaw): void => {
        if (yoke.body.getMotionType() !== PhysicsMotionType.ANIMATED) {
          yoke.body.setMotionType(PhysicsMotionType.ANIMATED);
        }
        const live = yoke.mesh.rotationQuaternion ?? Quaternion.Identity();
        if (risingStart === null) risingStart = live.clone();
        Quaternion.RotationAxisToRef(UP, targetYaw, scratch.desired);
        const progress = port?.diagnostic().recoveryProgress ?? 0;
        const smooth = progress * progress * (3 - 2 * progress);
        Quaternion.SlerpToRef(risingStart, scratch.desired, smooth, scratch.rising);
        scratch.target.set(targetPosition.x, targetPosition.y, targetPosition.z);
        yoke.body.setTargetTransform(scratch.target, scratch.rising);
      },

      releaseRoot: (): void => {
        risingStart = null;
        if (yoke.body.getMotionType() === PhysicsMotionType.ANIMATED) {
          yoke.body.setMotionType(PhysicsMotionType.DYNAMIC);
        }
      },
      restoreRoot: (): void => {
        risingStart = null;
        if (yoke.body.getMotionType() === PhysicsMotionType.DYNAMIC) {
          yoke.body.setMotionType(PhysicsMotionType.ANIMATED);
        }
        if (severed) return;
        // Reattachment is an admitted transition. Retaining ragdoll momentum here made a recovered
        // Warrior discharge its stored rotation through the first pose it was given; a wheel that
        // has been rolling on its side while fallen is the same thing with more of it.
        scratch.drive.set(0, 0, 0);
        wheel.body.setLinearVelocity(scratch.drive);
        wheel.body.setAngularVelocity(scratch.drive);
      },
    });
    port = activePort;

    /**
     * Arm the spin motor, or take its ceiling down to the limp fraction.
     *
     * Called once at build and again on each edge into and out of `fallen`, never per substep: a
     * motor ceiling is written onto a native solver object and rewriting it 240 times a second is a
     * boundary cost for a value that changes twice a knockdown.
     */
    const armSpin = (scale: number): void => {
      if (!hinge) return;
      hinge.setAxisMotorType(PhysicsConstraintAxis.ANGULAR_X, PhysicsConstraintMotorType.VELOCITY);
      hinge.setAxisMotorMaxForce(PhysicsConstraintAxis.ANGULAR_X, W.wheelSpinTorque * scale);
    };
    armSpin(1);
    hinge?.setAxisMotorTarget(PhysicsConstraintAxis.ANGULAR_X, 0);
    let limp = false;

    const gait = (dt: number): void => {
      if (severed) return;
      // A fallen golem is a ragdoll, and a ragdoll whose wheel is still being driven motors itself
      // along the floor: measured on the biped's own legs at 51 times the fall threshold, the root
      // reached an up-dot of 0.816 instead of going over. The target keeps being written -- the
      // wheel is not let go of, it is relaxed -- and the ceiling comes back on the edge out.
      const wantedLimp = activePort.state === "fallen";
      if (wantedLimp !== limp) {
        limp = wantedLimp;
        armSpin(limp ? W.fallenTorqueScale : 1);
      }
      // **Derived from the carrier, with no feedback anywhere.** `omega = v / r` is the rolling
      // condition itself, so the contact patch stands still when the wheel achieves it; reading
      // the achieved spin and correcting toward it is the wind-up the Warrior's arm recorded.
      commandedSpin = carrierForward() / W.wheelRadius;
      hinge?.setAxisMotorTarget(PhysicsConstraintAxis.ANGULAR_X, commandedSpin);
      void dt;
    };

    const readEvidence = (dt: number): void => {
      const live = port?.diagnostic() ?? null;
      const posture = postureEvidence();
      evidence.t = elapsed;
      evidence.state = port?.state ?? "supported";
      const requested = live?.requested ?? null;
      evidence.commandedSpeedMps = requested
        ? Math.min(1, Math.hypot(requested.localForward, requested.localRight)) * W.carrier.maxSpeedMps
        : 0;
      evidence.carrierSpeedMps = carrierSpeed();
      evidence.rootSpeedMps = Math.hypot(rootSample.velocity.x, rootSample.velocity.z);
      evidence.heightM = yoke.mesh.position.y - groundY + yokeDown;
      // A wheel does not crouch, so this is a constant zero rather than a slewed level. The
      // readout prints it beside a height range whose two ends are the same number, which is the
      // honest way for a module to say a channel does nothing on it.
      evidence.crouch = 0;
      evidence.upDot = posture.carrierUpDot;
      evidence.rootAboveFeetM = posture.rootHeightAboveCarrierM;
      evidence.stackAboveRootM = posture.terminalHeightAboveRootM;
      evidence.postureSupported = constructPostureIsSupported(posture);
      evidence.freshBindings = live?.freshSupportBindings.length ?? 0;

      const contact = contactPoint(scratch.contact);
      const planted = Math.abs(contact.y - groundY) <= W.plantBandM;
      evidence.plantedFeet = planted ? 1 : 0;
      evidence.soleLiftM = Math.max(0, contact.y - groundY);

      // The spin the wheel actually achieved, differenced from the tread marker rather than read
      // across the plugin boundary.
      const angle = spinAngle();
      achievedSpin = sampled && dt > 0 ? wrapAngle(angle - lastSpinAngle) / dt : 0;
      lastSpinAngle = angle;

      /**
       * The contact patch's own material velocity: `v + omega x r`.
       *
       * **This is the reading that says whether the thing rolls**, and it is not the wheel's
       * velocity: a wheel dragged with its tread locked and a wheel rolling perfectly both move
       * their *centres* at the carrier's speed. What differs is the piece of tread against the
       * floor, which is standing still in one case and travelling at the whole carrier speed in
       * the other. `v` is differenced from the wheel's own transform and `omega` from its spin,
       * so the whole reading costs no plugin call.
       */
      if (sampled && dt > 0) {
        const axle = rootAxle();
        const rx = contact.x - wheel.mesh.position.x;
        const ry = contact.y - wheel.mesh.position.y;
        const rz = contact.z - wheel.mesh.position.z;
        scratch.slip.set(
          (wheel.mesh.position.x - lastWheel.x) / dt + achievedSpin * (axle.y * rz - axle.z * ry),
          0,
          (wheel.mesh.position.z - lastWheel.z) / dt + achievedSpin * (axle.x * ry - axle.y * rx),
        );
        evidence.footSlipMps = planted ? Math.hypot(scratch.slip.x, scratch.slip.z) : 0;
      } else {
        evidence.footSlipMps = 0;
      }
      lastWheel.copyFrom(wheel.mesh.position);
      sampled = true;

      // **On a wheel this column is not a motor lag.** There is no driven angle here at all -- the
      // spin is a velocity motor on a free axis -- so what is published is the hinge's own
      // out-of-frame error: the angle between the wheel's axle and the lateral the fork holds it
      // on. Near zero by construction, and a rising number is an axle being levered out of its
      // mounting. The wheel's own lag reading is the contact slip above.
      // The wheel's local +Y is its axle, because the mesh was turned onto it at build.
      UP.rotateByQuaternionToRef(
        wheel.mesh.rotationQuaternion ?? Quaternion.Identity(), scratch.other);
      evidence.jointErrorRad = Math.acos(
        clamp(Math.abs(Vector3.Dot(scratch.other, rootAxle())), -1, 1));

      if (carried) {
        UP.rotateByQuaternionToRef(
          ctx.socket.mount.mesh.rotationQuaternion ?? Quaternion.Identity(), scratch.other);
        evidence.carriedLeanRad = Math.acos(clamp(Vector3.Dot(scratch.other, rootUp()), -1, 1));
      }
      evidence.contacts = contacts;
      evidence.selfContacts = selfContacts;
      contacts = 0;
      selfContacts = 0;
    };

    const envelope: ModuleEnvelope = Object.freeze({
      axes: Object.freeze([
        Object.freeze({ id: "speed", unit: "m" as const, min: -W.carrier.maxSpeedMps,
          max: W.carrier.maxSpeedMps, rate: W.carrier.maxAccelerationMps2 }),
        // **Published as a range of zero rather than left out.** A wheel cannot travel sideways,
        // and frozen rule 3 says the module publishes what it can reach and the command is clamped
        // into that before the carrier is handed it. An axis that is simply absent would say
        // nothing at all, which is how a channel that does nothing gets driven for a session.
        Object.freeze({ id: "strafe", unit: "m" as const, min: 0, max: 0, rate: 0 }),
        Object.freeze({ id: "yaw", unit: "rad" as const, min: -W.carrier.maxYawSpeedRadS,
          max: W.carrier.maxYawSpeedRadS, rate: W.carrier.maxYawAccelerationRadS2 }),
        // Both ends the same number: this is what "no height range" is, published rather than
        // asserted in a comment.
        Object.freeze({ id: "height", unit: "m" as const,
          min: wheelHeightRange().crouchM, max: wheelHeightRange().standM, rate: 0 }),
      ]),
      reach: standHeight,
      strokes: NO_STROKES,
      reachable: null,
      settledBand: 0.02,
    });

    const disposeJoints = (): void => {
      hinge?.dispose();
      hinge = null;
      waist?.dispose();
      waist = null;
    };

    const built: BuiltLocomotion = Object.freeze({
      parts: frozenParts,
      strikers: Object.freeze([]) as readonly Striking[],
      root: yoke,
      adapter,
      port: activePort,
      world,
      footprint,
      heightRange: wheelHeightRange(),
      authority,
      postureEvidence,
      gait,
      evidence: (): LocomotionEvidence => evidence,
      readout: (): LocomotionReadoutState => readout.state(),

      command(next: LocomotionCommand): void {
        if (severed) return;
        // **The clamp, and it is the whole of the "a wheel cannot strafe" rule.** Frozen rule 3:
        // the command is clamped into the published envelope before the carrier ever sees it, so
        // there is no refusal branch anywhere and a mind picking inside the envelope never asks.
        // `recover` is left exactly as `locomotionCommand` derived it -- a person shoving the
        // strafe key on a fallen wheel is still asking to get up.
        request = next.request.localRight === 0 ? next.request : Object.freeze({
          localForward: next.request.localForward,
          localRight: 0,
          yaw: next.request.yaw,
          recover: next.request.recover,
        });
        // `next.crouch` is read and dropped on purpose: the height range has one end, so there is
        // nothing to slew between. See `heightRange` above.
      },

      beginSubstep(): void {
        if (severed) return;
        refreshRoot();
      },

      endSubstep(dt: number): void {
        if (severed) return;
        elapsed += dt;
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
        // Stated once and spent twice, exactly as the biped's: a real impulse so the slab lurches,
        // and the same transfer queued into the port in its own mass-independent units so the
        // state machine sees it. Inferring either from the other would be inferring an event from
        // a side effect that has a second cause.
        scratch.drive.set(W.shoveImpulseNs, 0, 0);
        scratch.drive.rotateByQuaternionToRef(
          yoke.mesh.rotationQuaternion ?? Quaternion.Identity(), scratch.drive);
        const target = carried && ctx.socket.mount.body.getMotionType() === PhysicsMotionType.DYNAMIC
          ? ctx.socket.mount : yoke;
        target.body.applyImpulse(scratch.drive, target.mesh.position);
        port?.queueStabilityEvent({ horizontalShoveNs: [scratch.drive.x, scratch.drive.z] });
      },

      sever(): void {
        if (severed) return;
        severed = true;
        // The carrier is gone: the root becomes an ordinary dynamic body and the drive goes with
        // the wheel, because a motor still driving a body that has been cut off is the haunting a
        // Warrior's anchors produce when an arm comes away from them.
        if (yoke.body.getMotionType() !== PhysicsMotionType.DYNAMIC) {
          yoke.body.setMotionType(PhysicsMotionType.DYNAMIC);
        }
        activePort.clear("locomotion module severed");
        disposeJoints();
      },

      dispose(): void {
        severed = true;
        // Babylon removes an observer asynchronously -- it marks it and splices it on a zero-delay
        // timer -- so a lifecycle census taken straight after this counts active observers rather
        // than array length.
        for (const [body, observer] of watchers) body.getCollisionObservable().remove(observer as never);
        watchers.length = 0;
        activePort.dispose();
        disposeJoints();
        for (const part of [wheel, yoke]) {
          part.body.dispose();
          part.shape.dispose();
          // The shell is parented to the collider mesh, so this takes it too -- and `false, false`
          // leaves the palette's materials standing.
          part.mesh.dispose(false, false);
        }
      },
    });

    /** Contacts, counted the way both bench harnesses already count them. */
    const own = new Set(frozenParts.map(({ part }) => part.body));
    for (const { part } of frozenParts) {
      part.body.setCollisionCallbackEnabled(true);
      watchers.push([part.body, part.body.getCollisionObservable().add((event) => {
        contacts += 1;
        // **`selfCollisionCount === 0` proves nothing about pairs the filters never admitted**,
        // and here they never are: the yoke and the wheel sit on the side's own body layer, whose
        // collide mask contains neither itself nor the trunk. So a non-zero count is a filter set
        // wrongly rather than a body plan that touches itself, which is the only thing it says.
        if (own.has(event.collidedAgainst)) selfContacts += 1;
      }) as unknown as Observer<unknown>]);
    }

    return built;
  },
});
