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
import { BENCH_STAND_LOCOMOTION, LOCOMOTION_MULTILEG } from "../config.ts";
import { materialForGolemRole } from "../materials.ts";
import { boneShell } from "../effectors/shell.ts";
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
 * The multileg: a low, wide chassis on six short legs in an alternating tripod.
 *
 * **Everything about the carrier is the biped's and is not repeated here.** The chassis is
 * `ANIMATED` and follows a bodyless `VirtualLocomotionCarrier`; the legs prove support, sell the
 * motion and take the hits; an authored knockdown is the one thing that releases the root. Read
 * `src/golem/locomotion/biped.ts`'s header for why, once.
 *
 * **What is different is the base, and the base is the whole option.** Six pads on a polygon
 * 0.80 m wide and 0.44 m long against a biped's two soles in one lateral line, and the difference
 * arrives entirely through `StabilityAuthority.braceCapacityMultiplier` -- 2.6 against 1.5 --
 * rather than through any special case in the state machine. The same frozen
 * `FALL_SPECIFIC_IMPULSE_MPS` lands nearly twice as high on this body, which is what makes the
 * cross-module comparison in `tests/golem-locomotion.test.mjs` mean something: the shove that
 * fells the biped leaves this standing.
 *
 * **The tripod is both the gait and the support proof, and that is why it is a tripod.** Legs
 * alternate in two groups of three -- left-front, left-rear and right-middle against the other
 * three -- so three pads are always down. A biped in mid-stride is standing on one foot and its
 * gait stability scale falls to 0.75 for it; this body's falls only to 0.90, because being
 * mid-stride costs a hexapod almost nothing. That is the same field saying two different true
 * things about two bodies.
 *
 * **Six legs is six times the opportunity to build a joint outside its own stop**, which Session
 * 03 paid for once: a stop that did not admit its build pose was cleared by Havok throwing a blade
 * tip at 9.95 m/s from a motionless stand. Every leg here is built with all three angles at zero
 * and `tests/golem-locomotion.test.mjs` checks all eighteen against their ranges.
 *
 * **Foot contact still does not prove a body is standing, and this body is where that bites
 * hardest**, because it always has something touching the floor. `postureEvidence` publishes
 * root-up, root-above-pads and stack-above-root together and `constructPostureIsSupported` reads
 * all three; the pad count is sensor evidence beside it and never a verdict.
 *
 * **What the option costs is published rather than hidden.** The socket stands at 0.640 m against
 * the biped's 1.020, so an effector or a head bolted above it is 380 mm lower, and the navigation
 * footprint is 0.50 m against 0.34 so it stops further from every wall. Those are in
 * `LOCOMOTION_MULTILEG` beside the numbers that cause them and in `docs/measurements.md` as a
 * table.
 */

const UP = Object.freeze(new Vector3(0, 1, 0));

const clamp = (value: number, low: number, high: number): number =>
  value < low ? low : value > high ? high : value;

const wrapAngle = (value: number): number => Math.atan2(Math.sin(value), Math.cos(value));

/**
 * The six legs: which side, which station along the body, and which half of the tripod.
 *
 * **A table rather than arithmetic on an index**, because the tripod is the one thing about this
 * gait a reader has to be able to check at a glance: the three legs at phase 0 must not be two on
 * one side and one adjacent to them, or the body walks with a limp that no number here would
 * catch. Left-front, left-rear and right-middle on one phase; the other three half a cycle behind.
 */
export const MULTILEG_LEGS = Object.freeze([
  Object.freeze({ role: "left-front-pad", suffix: "LF", side: -1, station: 1, phase: 0 }),
  Object.freeze({ role: "left-middle-pad", suffix: "LM", side: -1, station: 0, phase: Math.PI }),
  Object.freeze({ role: "left-rear-pad", suffix: "LR", side: -1, station: -1, phase: 0 }),
  Object.freeze({ role: "right-front-pad", suffix: "RF", side: 1, station: 1, phase: Math.PI }),
  Object.freeze({ role: "right-middle-pad", suffix: "RM", side: 1, station: 0, phase: 0 }),
  Object.freeze({ role: "right-rear-pad", suffix: "RR", side: 1, station: -1, phase: Math.PI }),
]);

/** One leg's three commanded angles. */
export interface MultilegLegPose {
  readonly hip: number;
  readonly knee: number;
  readonly ankle: number;
}

/** The six legs one stride phase asks for, plus how far the chassis has dropped. */
export interface MultilegPose {
  readonly legs: readonly MultilegLegPose[];
  /** How far below the standing chassis the tallest supporting leg puts it, metres. */
  readonly hipDrop: number;
}

/**
 * The tripod walk, as a pure function of where in the stride you are and how fast you are going.
 *
 * Pure and exported so `tests/golem-locomotion.test.mjs` can assert the geometry -- that no angle
 * leaves its commanded range on any of the six, that standing still returns the build pose, that
 * the two tripods really are half a cycle apart -- without a Havok scene at all.
 *
 * The shape is `bipedPose`'s with the crouch term removed, because this body has no height range:
 * the hip swings with the stride, the knee folds only on the way through (`max(0, -sin(...))` is
 * a half-cycle of lift, phase-shifted to peak at mid-swing where the hip is passing through
 * neutral), and the ankle holds the pad level at `-(hip + knee)` because relative rotations about
 * one lateral axis add along the chain.
 */
export function multilegPose(phase: number, speedMps: number): MultilegPose {
  const M = LOCOMOTION_MULTILEG;
  const amount = clamp(speedMps / M.carrier.maxSpeedMps, 0, 1);
  const swing = M.strideSwing * amount;
  const femur = M.femurLength;
  const shin = M.shinLength;
  const standing = femur + shin;
  const extension = (hip: number, knee: number): number =>
    femur * Math.cos(hip) + shin * Math.cos(hip + knee);

  let tallest = 0;
  const legs = MULTILEG_LEGS.map((leg) => {
    const own = phase + leg.phase;
    const hip = clamp(Math.sin(own) * swing, M.hipSwingMin, M.hipSwingMax);
    const knee = clamp(Math.max(0, -Math.sin(own + M.kneeLiftPhase)) * swing * M.kneeLiftScale,
      M.kneeTargetMin, M.kneeTargetMax);
    tallest = Math.max(tallest, extension(hip, knee));
    return Object.freeze({
      hip,
      knee,
      ankle: clamp(-(hip + knee), M.ankleTargetMin, M.ankleTargetMax),
    });
  });

  return Object.freeze({
    legs: Object.freeze(legs),
    // The longest leg is a supporting one, and following it is what keeps its pad on the floor
    // while the swinging tripod comes through. With two tripods half a cycle apart the drop is a
    // small bob at twice the stride frequency rather than the biped's one-per-step lurch.
    hipDrop: standing - tallest,
  });
}

/** How far the module's socket sits above the pads it is built standing on, metres. */
export const multilegStandHeight = (): number => {
  const M = LOCOMOTION_MULTILEG;
  return M.chassisHeight / 2 + M.hipInset + M.femurLength + M.shinLength + M.footHeight;
};

/**
 * No height range: `crouchM === standM`, because the body is already low.
 *
 * The frozen choice, and it is the same shape of statement the wheel makes for a different reason.
 * A crouch that moved this socket 0.16 m would put the chassis 0.48 m off the floor with the knees
 * folded past their own lift, which is a body sitting down rather than crouching.
 */
const multilegHeightRange = (): LocomotionHeightRange => Object.freeze({
  standM: multilegStandHeight(),
  crouchM: multilegStandHeight(),
});

const multilegFootprint = (): LocomotionFootprint => deriveLocomotionFootprint({
  radiusM: LOCOMOTION_MULTILEG.footprintRadius,
  heightM: LOCOMOTION_MULTILEG.footprintHeight,
  provenance: {
    profileId: "locomotion.multileg",
    source: "golem-bind-geometry",
    measuredAt: "constructor-bind-pose",
  },
});

const SUPPORT_BINDINGS: readonly LocomotionSupportBinding[] = Object.freeze(
  MULTILEG_LEGS.map((leg) => Object.freeze({
    role: leg.role,
    label: `${leg.role.replace(/-pad$/, "").replace("-", " ")} pad`,
  })),
);

/** One leg's three bodies and three joints, kept together so severing one is one edit. */
interface MultilegLeg {
  readonly role: string;
  readonly phase: number;
  readonly femur: Part;
  readonly shin: Part;
  readonly foot: Part;
  hip: Physics6DoFConstraint | null;
  knee: Physics6DoFConstraint | null;
  ankle: Physics6DoFConstraint | null;
  severed: boolean;
  /** What the gait last asked this leg for, rate-limited. */
  commandedHip: number;
  commandedKnee: number;
  commandedAnkle: number;
  /** Where the pad was last substep, for the slip reading. */
  readonly lastPad: Vector3;
  lastPlanted: boolean;
}

export const multilegModule = defineLocomotion({
  id: "locomotion.multileg",
  slots: Object.freeze(["locomotion" as const]),
  label: "multileg - six short legs on a wide base",
  massKg: LOCOMOTION_MULTILEG.chassisMass +
    6 * (LOCOMOTION_MULTILEG.femurMass + LOCOMOTION_MULTILEG.shinMass +
      LOCOMOTION_MULTILEG.footMass),
  carrier: LOCOMOTION_MULTILEG.carrier,
  heightRange: multilegHeightRange(),
  footprint: multilegFootprint(),
  supportBindings: SUPPORT_BINDINGS,

  build(ctx: ModuleBuild): BuiltLocomotion {
    const M = LOCOMOTION_MULTILEG;
    const socket = ctx.socket;
    const facing = socket.rotation;
    const stone = materialForGolemRole(ctx.materials, "shell");
    const bronze = materialForGolemRole(ctx.materials, "joint");
    const standHeight = multilegStandHeight();
    const footprint = multilegFootprint();

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
    // Every angle is zero: the legs are built straight and standing, the pads exactly on the ground
    // the socket implies. `ankleDown + footHeight` is `standHeight` exactly, which is the
    // arithmetic the whole module stands on, and the test measures the built pads against the floor
    // rather than trusting the two config blocks to agree.
    const chassisDown = M.chassisHeight / 2;
    const hipDown = chassisDown + M.hipInset;
    const kneeDown = hipDown + M.femurLength;
    const ankleDown = kneeDown + M.shinLength;

    const chassis = boxPart(ctx.scene, {
      name: `${ctx.name}.chassis`,
      position: place(0, chassisDown, 0),
      rotation: facing,
      size: new Vector3(M.chassisWidth, M.chassisHeight, M.chassisDepth),
      mass: M.chassisMass,
      layer: ctx.layers.body,
      collidesWith: ctx.layers.bodyCollidesWith,
      material: stone,
      motionType: PhysicsMotionType.ANIMATED,
    });
    chassis.body.setLinearDamping(M.linearDamping);
    chassis.body.setAngularDamping(M.angularDamping);

    const legs: MultilegLeg[] = MULTILEG_LEGS.map((spec) => {
      const x = M.hipSide * spec.side;
      const z = M.hipStation * spec.station;
      const femur = capsulePart(ctx.scene, {
        name: `${ctx.name}.femur${spec.suffix}`,
        position: place(x, hipDown + M.femurLength / 2, z),
        rotation: facing,
        height: M.femurLength,
        radius: M.femurRadius,
        mass: M.femurMass,
        layer: ctx.layers.body,
        collidesWith: ctx.layers.bodyCollidesWith,
        material: stone,
        visible: false,
      });
      const shin = capsulePart(ctx.scene, {
        name: `${ctx.name}.shin${spec.suffix}`,
        position: place(x, kneeDown + M.shinLength / 2, z),
        rotation: facing,
        height: M.shinLength,
        radius: M.shinRadius,
        mass: M.shinMass,
        layer: ctx.layers.body,
        collidesWith: ctx.layers.bodyCollidesWith,
        material: stone,
        visible: false,
      });
      // The pad is the only body here with a friction number of its own: it is what touches the
      // world, and how much grip it has decides whether a planted leg drags or skates. Offset
      // forward so the ankle sits at the pad's heel third, which is where an ankle is.
      const foot = boxPart(ctx.scene, {
        name: `${ctx.name}.pad${spec.suffix}`,
        position: place(x, ankleDown + M.footHeight / 2, z + M.footLength * 0.18),
        rotation: facing,
        size: new Vector3(M.footWidth, M.footHeight, M.footLength),
        mass: M.footMass,
        layer: ctx.layers.body,
        collidesWith: ctx.layers.bodyCollidesWith,
        material: stone,
        friction: M.footFriction,
      });
      for (const part of [femur, shin, foot]) {
        part.body.setLinearDamping(M.linearDamping);
        part.body.setAngularDamping(M.angularDamping);
      }
      return {
        role: spec.role, phase: spec.phase, femur, shin, foot,
        hip: null, knee: null, ankle: null, severed: false,
        commandedHip: 0, commandedKnee: 0, commandedAnkle: 0,
        lastPad: new Vector3(), lastPlanted: false,
      };
    });

    // --- the joints ----------------------------------------------------------------------------
    //
    // One constraint type throughout, as `rig.ts` insists: a hinge is a ball joint with two axes
    // pinned. The hip keeps a narrow abduction and twist -- the splits limit -- and the knee and
    // ankle are pure hinges about the same lateral the hip flexes on, so the three angles add and
    // the leg's extension is `femur cos(hip) + shin cos(hip + knee)`.
    for (const [index, leg] of legs.entries()) {
      const spec = MULTILEG_LEGS[index];
      const x = M.hipSide * spec.side;
      const z = M.hipStation * spec.station;
      leg.hip = joint(ctx.scene, chassis, leg.femur, {
        pivotParent: new Vector3(x, -M.hipInset, z),
        pivotChild: new Vector3(0, M.femurLength / 2, 0),
        swing: {
          x: { min: M.hipJointMin, max: M.hipJointMax },
          y: { min: -M.hipTwist, max: M.hipTwist },
          z: { min: -M.hipAbduct, max: M.hipAbduct },
        },
        damping: M.motorDamping,
      });
      leg.knee = joint(ctx.scene, leg.femur, leg.shin, {
        pivotParent: new Vector3(0, -M.femurLength / 2, 0),
        pivotChild: new Vector3(0, M.shinLength / 2, 0),
        swing: { x: { min: M.kneeJointMin, max: M.kneeJointMax } },
        damping: M.motorDamping,
      });
      leg.ankle = joint(ctx.scene, leg.shin, leg.foot, {
        pivotParent: new Vector3(0, -M.shinLength / 2, 0),
        pivotChild: new Vector3(0, M.footHeight / 2, -M.footLength * 0.18),
        swing: {
          x: { min: M.ankleJointMin, max: M.ankleJointMax },
          z: { min: -M.ankleRoll, max: M.ankleRoll },
        },
        damping: M.motorDamping,
      });
    }

    /**
     * The waist, on exactly the terms the biped states: a `DYNAMIC` mount is a load and gets a
     * soft motorised waist, an `ANIMATED` one is a fixed anchor and is left alone.
     */
    const carried = ctx.socket.mount.body.getMotionType() === PhysicsMotionType.DYNAMIC;
    const L = BENCH_STAND_LOCOMOTION;
    let waist: Physics6DoFConstraint | null = carried
      ? joint(ctx.scene, chassis, ctx.socket.mount, {
        pivotParent: new Vector3(0, M.chassisHeight / 2, 0),
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

    // --- the shell -----------------------------------------------------------------------------
    const shells: AbstractMesh[] = [];
    const padPlate = (leg: MultilegLeg, suffix: string): readonly AbstractMesh[] => {
      // One bronze band across the toe of the pad, so it reads as a foot rather than as the end of
      // a box. No body, no collider, no authority.
      const band = MeshBuilder.CreateBox(`${ctx.name}.pad${suffix}.band`, {
        width: M.footWidth * 1.05, height: M.footHeight * 0.36, depth: M.footLength * 0.24,
      }, ctx.scene);
      band.material = bronze;
      band.isPickable = false;
      band.parent = leg.foot.mesh;
      band.position.set(0, -M.footHeight * 0.18, M.footLength * 0.30);
      band.rotationQuaternion = Quaternion.Identity();
      return Object.freeze([band]);
    };

    const parts: GolemPart[] = [Object.freeze({
      id: chassis.name,
      part: chassis,
      shell: Object.freeze([chassis.mesh]),
      health: M.chassisHealth,
      vitalityWeight: M.chassisVitalityWeight,
      // **The one fatal part in the module.** Losing a leg costs a hexapod one of six; losing the
      // chassis is the end of it, and Session 08's vitality rule needs somebody to say so.
      fatal: true,
    })];
    for (const [index, leg] of legs.entries()) {
      const suffix = MULTILEG_LEGS[index].suffix;
      const femurShell = boneShell(ctx.scene, {
        name: leg.femur.name, host: leg.femur.mesh, length: M.femurLength,
        radius: M.femurRadius, taper: 0.30, materials: ctx.materials,
      });
      const shinShell = boneShell(ctx.scene, {
        name: leg.shin.name, host: leg.shin.mesh, length: M.shinLength,
        radius: M.shinRadius, taper: 0.26, materials: ctx.materials,
      });
      const plate = padPlate(leg, suffix);
      shells.push(...femurShell, ...shinShell, ...plate);
      parts.push(
        Object.freeze({ id: leg.femur.name, part: leg.femur, shell: femurShell,
          health: M.femurHealth, vitalityWeight: M.femurVitalityWeight, fatal: false }),
        Object.freeze({ id: leg.shin.name, part: leg.shin, shell: shinShell,
          health: M.shinHealth, vitalityWeight: M.shinVitalityWeight, fatal: false }),
        Object.freeze({ id: leg.foot.name, part: leg.foot, shell: plate,
          health: M.footHealth, vitalityWeight: M.footVitalityWeight, fatal: false }),
      );
    }
    const frozenParts: readonly GolemPart[] = Object.freeze(parts);

    // --- state ---------------------------------------------------------------------------------
    const groundY = socket.world.y - standHeight;
    const standingChassisY = socket.world.y - chassisDown;
    const supportedMassKg = M.chassisMass +
      6 * (M.femurMass + M.shinMass + M.footMass) + carriedMassKg;
    const yaw = facing.toEulerAngles().y;

    let stride = 0;
    let request: LocomotionRequest = Object.freeze({
      localForward: 0, localRight: 0, yaw: 0, recover: false,
    });
    let severed = false;
    let risingStart: Quaternion | null = null;
    let port: PhysicalSupportedLocomotionPort | null = null;
    let elapsed = 0;
    let contacts = 0;
    let selfContacts = 0;
    /**
     * How far below standing the last solved stride puts the chassis, metres.
     *
     * Held rather than re-solved inside `driveAnimatedRoot`, and that is not only an allocation:
     * the drive runs from `commitPhysical`, which is *earlier* in the same substep than `gait`, so
     * re-solving there would give the root a height from a stride phase the legs have not been
     * given yet.
     */
    let hipDrop = 0;

    const watchers: [PhysicsBody, Observer<unknown>][] = [];
    const evidence = blankLocomotionEvidence();
    const readout = new LocomotionReadout();

    const scratch = {
      up: new Vector3(),
      other: new Vector3(),
      inverse: new Quaternion(),
      relative: new Quaternion(),
      euler: new Vector3(),
      pad: new Vector3(),
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
     * `getLinearVelocityToRef` allocates 216 B a call and the port samples the root three or four
     * times a boundary, so the velocity is read once here and every sample reads it back. Nothing
     * else in this file crosses the plugin boundary at all: every pad, every joint angle and every
     * lean comes from `mesh.position` and `mesh.rotationQuaternion`, which cost nothing and stamp
     * no render id.
     */
    const refreshRoot = (): void => {
      chassis.body.getLinearVelocityToRef(scratch.velocity);
      rootSample.velocity.x = scratch.velocity.x;
      rootSample.velocity.y = scratch.velocity.y;
      rootSample.velocity.z = scratch.velocity.z;
    };

    const adapter: SupportedRootAdapter = {
      sample: (): DynamicRootSample => {
        const motion = chassis.body.getMotionType();
        rootSample.motionType = motion === PhysicsMotionType.DYNAMIC ? "dynamic"
          : motion === PhysicsMotionType.ANIMATED ? "animated" : "static";
        rootSample.position.x = chassis.mesh.position.x;
        rootSample.position.y = chassis.mesh.position.y;
        rootSample.position.z = chassis.mesh.position.z;
        rootSample.released = severed;
        return rootSample as DynamicRootSample;
      },
      applyForce: (force: WorldPoint): void => {
        scratch.drive.set(force.x, force.y + supportedMassKg * 9.81, force.z);
        chassis.body.applyForce(scratch.drive, chassis.mesh.position);
      },
      clearDrive: (): void => {
        if (chassis.body.getMotionType() !== PhysicsMotionType.ANIMATED) return;
        scratch.drive.set(0, 0, 0);
        chassis.body.setLinearVelocity(scratch.drive);
        chassis.body.setAngularVelocity(scratch.drive);
      },
    };

    /**
     * One joint's achieved angle about its own hinge axis, radians.
     *
     * `mesh.rotationQuaternion` and nothing else, on both sides: `getWorldMatrix()` short-circuits
     * on the render id and *reading* it stamps that id, which silently turns every later reader in
     * the frame into a reader of this sample -- a defect that has cost three sessions here.
     */
    const relativeX = (parent: Part, child: Part): number => {
      (parent.mesh.rotationQuaternion ?? Quaternion.Identity()).conjugateToRef(scratch.inverse);
      scratch.inverse.multiplyToRef(child.mesh.rotationQuaternion ?? Quaternion.Identity(),
        scratch.relative);
      scratch.relative.toEulerAnglesToRef(scratch.euler);
      return scratch.euler.x;
    };

    const rootUp = (): Vector3 => {
      UP.rotateByQuaternionToRef(chassis.mesh.rotationQuaternion ?? Quaternion.Identity(),
        scratch.up);
      return scratch.up;
    };

    /** The world point of one pad: the box's own bottom face, carried by the pad's rotation. */
    const padPoint = (leg: MultilegLeg, into: Vector3): Vector3 => {
      into.set(0, -M.footHeight / 2, 0);
      into.rotateByQuaternionToRef(leg.foot.mesh.rotationQuaternion ?? Quaternion.Identity(), into);
      return into.addInPlace(leg.foot.mesh.position);
    };

    const meanPadY = (): number => {
      let sum = 0;
      let count = 0;
      for (const leg of legs) {
        if (leg.severed) continue;
        sum += padPoint(leg, scratch.pad).y;
        count += 1;
      }
      return count > 0 ? sum / count : chassis.mesh.position.y;
    };

    const postureEvidence = (): ConstructPostureEvidence => Object.freeze({
      // **The trap this body walks into hardest.** Six legs always have something on the floor, so
      // a contact count would call a golem on its back supported. `chainContinuous` here is a
      // *tripod* rule rather than "every leg attached": a hexapod that has lost one leg is still a
      // hexapod, and demanding all six would make one severed pad the same as a broken back.
      chainContinuous: !severed && legs.filter((leg) => !leg.severed).length >= 3,
      carrierUpDot: rootUp().y,
      rootHeightAboveCarrierM: chassis.mesh.position.y - meanPadY(),
      terminalHeightAboveRootM: carried
        ? ctx.socket.mount.mesh.position.y - chassis.mesh.position.y
        : chassis.mesh.position.y - meanPadY(),
    });

    const carrierSpeed = (): number => {
      const allowed = port?.priorAllowed() ?? null;
      if (!allowed) return 0;
      return Math.min(1, Math.hypot(allowed.localForward, allowed.localRight)) *
        M.carrier.maxSpeedMps;
    };

    const authority = (): StabilityAuthority => {
      // The one live field, and on this body it barely moves: an alternating tripod always has
      // three pads down, so being mid-stride costs a hexapod almost nothing where it costs a biped
      // a foot. Clamped into (0, 1], which the state machine's own boundary check refuses to be
      // handed anything outside of.
      const fraction = clamp(carrierSpeed() / M.carrier.maxSpeedMps, 0, 1);
      const scale = clamp(1 - (1 - M.gaitStabilityScaleMin) * fraction, 1e-6, 1);
      return Object.freeze({
        carrierPartId: chassis.name,
        supportBindings: Object.freeze(SUPPORT_BINDINGS.map(({ role }) => Object.freeze({ role }))),
        braceCapacityMultiplier: M.braceCapacityMultiplier,
        gaitStabilityScale: scale,
      });
    };

    const world = ctx.world ?? flatSupportedWorldRegistry();

    const activePort = new PhysicalSupportedLocomotionPort({
      id: `${ctx.name}.locomotion`,
      position: { x: chassis.mesh.position.x, y: standingChassisY, z: chassis.mesh.position.z },
      yaw,
      footprint,
      ownerPartIds: new Set(frozenParts.map(({ id }) => id)),
      root: adapter,
      registry: world,
      config: M.carrier,
      supportedMassKg,
      authority,
      supportBindings: Object.freeze(SUPPORT_BINDINGS.map(({ role }) => role)),
      supportPoint: (binding: string): WorldPoint | null => {
        const leg = legs.find((candidate) => candidate.role === binding);
        if (!leg || leg.severed) return null;
        const point = padPoint(leg, scratch.pad);
        return { x: point.x, y: point.y, z: point.z };
      },
      liveSupport: () => !severed && legs.filter((leg) => !leg.severed).length >= 3,
      postureSupported: () => constructPostureIsSupported(postureEvidence()),

      /** The supported drive, and both halves are the biped's for the biped's reasons. */
      driveAnimatedRoot: (targetPosition, targetVelocity, targetYaw, dt): void => {
        const rotation = chassis.mesh.rotationQuaternion ?? Quaternion.Identity();
        const wantedY = standingChassisY - hipDrop;
        // Tracked exactly under a ceiling rather than through a lag: the stride's bob is a solved
        // geometric quantity, and a first-order response behind it lifts the stance pads off the
        // floor twice a step.
        const rise = clamp((wantedY - chassis.mesh.position.y) / dt, -M.heightRate, M.heightRate);
        if (rootUp().y >= 0.995) {
          scratch.drive.set(targetVelocity.x, rise, targetVelocity.z);
          chassis.body.setLinearVelocity(scratch.drive);
          const actualYaw = rotation.toEulerAngles().y;
          const yawError = wrapAngle(targetYaw - actualYaw);
          scratch.angular.set(0, clamp(yawError * 8,
            -M.carrier.maxYawSpeedRadS, M.carrier.maxYawSpeedRadS), 0);
          chassis.body.setAngularVelocity(scratch.angular);
          return;
        }
        supportedRootTargetToRef(chassis.mesh.position, rotation,
          { x: targetVelocity.x, z: targetVelocity.z }, targetYaw, dt,
          M.carrier.maxYawSpeedRadS, scratch.target, scratch.desired, scratch.rotation);
        scratch.target.y = chassis.mesh.position.y + rise * dt;
        chassis.body.setTargetTransform(scratch.target, scratch.rotation);
        void targetPosition;
      },

      /** The rise: the bounded actuator's frame, and the yaw slerped across the whole of it. */
      driveRisingRoot: (targetPosition, _targetVelocity, targetYaw): void => {
        if (chassis.body.getMotionType() !== PhysicsMotionType.ANIMATED) {
          chassis.body.setMotionType(PhysicsMotionType.ANIMATED);
        }
        const live = chassis.mesh.rotationQuaternion ?? Quaternion.Identity();
        if (risingStart === null) risingStart = live.clone();
        Quaternion.RotationAxisToRef(UP, targetYaw, scratch.desired);
        const progress = port?.diagnostic().recoveryProgress ?? 0;
        const smooth = progress * progress * (3 - 2 * progress);
        Quaternion.SlerpToRef(risingStart, scratch.desired, smooth, scratch.rising);
        scratch.target.set(targetPosition.x, targetPosition.y, targetPosition.z);
        chassis.body.setTargetTransform(scratch.target, scratch.rising);
      },

      releaseRoot: (): void => {
        risingStart = null;
        if (chassis.body.getMotionType() === PhysicsMotionType.ANIMATED) {
          chassis.body.setMotionType(PhysicsMotionType.DYNAMIC);
        }
      },
      restoreRoot: (): void => {
        risingStart = null;
        if (chassis.body.getMotionType() === PhysicsMotionType.DYNAMIC) {
          chassis.body.setMotionType(PhysicsMotionType.ANIMATED);
        }
        if (severed) return;
        // Reattachment is an admitted transition. Retaining ragdoll momentum here made a recovered
        // Warrior discharge its stored rotation through the first pose it was given; the same
        // applies to eighteen joints that have just been lying on the floor.
        scratch.drive.set(0, 0, 0);
        for (const leg of legs) {
          if (leg.severed) continue;
          for (const part of [leg.femur, leg.shin, leg.foot]) {
            part.body.setLinearVelocity(scratch.drive);
            part.body.setAngularVelocity(scratch.drive);
          }
        }
      },
    });
    port = activePort;

    const writeLeg = (leg: MultilegLeg): void => {
      if (leg.severed) return;
      leg.hip?.setAxisMotorTarget(PhysicsConstraintAxis.ANGULAR_X, leg.commandedHip);
      leg.knee?.setAxisMotorTarget(PhysicsConstraintAxis.ANGULAR_X, leg.commandedKnee);
      leg.ankle?.setAxisMotorTarget(PhysicsConstraintAxis.ANGULAR_X, leg.commandedAnkle);
    };

    /**
     * Arm every leg motor, or take its ceiling down to the limp fraction.
     *
     * Called once at build and again on each edge into and out of `fallen`, never per substep: a
     * motor ceiling is written onto a native solver object and rewriting **thirty** of them 240
     * times a second is a boundary cost for a value that changes twice a knockdown. That argument
     * is the biped's and it is three times as strong here.
     */
    const armMotors = (scale: number): void => {
      for (const leg of legs) {
        for (const [constraint, torque, axes] of [
          [leg.hip, M.hipTorque, [PhysicsConstraintAxis.ANGULAR_X, PhysicsConstraintAxis.ANGULAR_Y,
            PhysicsConstraintAxis.ANGULAR_Z]],
          [leg.knee, M.kneeTorque, [PhysicsConstraintAxis.ANGULAR_X]],
          [leg.ankle, M.ankleTorque, [PhysicsConstraintAxis.ANGULAR_X,
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
    for (const leg of legs) writeLeg(leg);
    let limp = false;

    const gait = (dt: number): void => {
      if (severed) return;
      // A fallen golem is a ragdoll, and a ragdoll whose leg motors are still driving their gait
      // targets at full torque holds itself up -- measured on the biped at a shove 51 times its
      // own fall threshold, which left the root at an up-dot of 0.816 rather than going over. Six
      // legs holding their pose under a released root is a table that will not tip.
      const wantedLimp = activePort.state === "fallen";
      if (wantedLimp !== limp) {
        limp = wantedLimp;
        armMotors(limp ? M.fallenTorqueScale : 1);
      }
      const speed = carrierSpeed();
      stride += speed * M.strideCadence * dt;
      const pose = multilegPose(stride, speed);
      hipDrop = pose.hipDrop;
      // The *commanded* angle is rate-limited, which is the ceiling that makes a flicked key a
      // move rather than a snap. Nothing here reads the achieved pose in order to decide the
      // command: a controller that takes the error and steps the command toward it winds up,
      // measured at 237 of 420 steps pinned against a stop on the Warrior.
      for (const [index, leg] of legs.entries()) {
        const wanted = pose.legs[index];
        leg.commandedHip = slewTowards(leg.commandedHip, wanted.hip, M.targetRate, dt);
        leg.commandedKnee = slewTowards(leg.commandedKnee, wanted.knee, M.targetRate, dt);
        leg.commandedAnkle = slewTowards(leg.commandedAnkle, wanted.ankle, M.targetRate, dt);
        writeLeg(leg);
      }
    };

    const readEvidence = (dt: number): void => {
      const live = port?.diagnostic() ?? null;
      const posture = postureEvidence();
      evidence.t = elapsed;
      evidence.state = port?.state ?? "supported";
      const requested = live?.requested ?? null;
      evidence.commandedSpeedMps = requested
        ? Math.min(1, Math.hypot(requested.localForward, requested.localRight)) * M.carrier.maxSpeedMps
        : 0;
      evidence.carrierSpeedMps = carrierSpeed();
      evidence.rootSpeedMps = Math.hypot(rootSample.velocity.x, rootSample.velocity.z);
      evidence.heightM = chassis.mesh.position.y - groundY + chassisDown;
      // No crouch: the height range has one end. Published as a constant zero rather than left to
      // drift, which is the honest way for a module to say a channel does nothing on it.
      evidence.crouch = 0;
      evidence.upDot = posture.carrierUpDot;
      evidence.rootAboveFeetM = posture.rootHeightAboveCarrierM;
      evidence.stackAboveRootM = posture.terminalHeightAboveRootM;
      evidence.postureSupported = constructPostureIsSupported(posture);
      evidence.freshBindings = live?.freshSupportBindings.length ?? 0;

      let planted = 0;
      // **The stillest pad in contact, not the fastest.** A walk puts a swing pad through contact
      // height at about twice the body's speed, so a maximum over planted pads reports the walk
      // itself as a defect. What this asks is whether the golem has a pad *holding* the ground --
      // which on six legs it always should, and the count beside it is what says how many.
      let slip = Number.POSITIVE_INFINITY;
      for (const leg of legs) {
        if (leg.severed) continue;
        const pad = padPoint(leg, scratch.pad);
        // The port's step envelope and the instrument's plant band are different questions and
        // must not share a number: 0.18 m is "is there standable world under this pad" and 0.02 is
        // "is this pad bearing weight". See `LOCOMOTION_MULTILEG.plantBandM`.
        const down = Math.abs(pad.y - groundY) <= M.plantBandM;
        if (down) {
          planted += 1;
          slip = Math.min(slip, leg.lastPlanted && dt > 0
            ? Math.hypot(pad.x - leg.lastPad.x, pad.z - leg.lastPad.z) / dt
            // A pad that has only just arrived inside the band has no previous sample to
            // difference against, and calling that zero would let a touchdown mask a skate.
            : Number.POSITIVE_INFINITY);
        }
        leg.lastPad.copyFrom(pad);
        leg.lastPlanted = down;
      }
      evidence.plantedFeet = planted;
      evidence.footSlipMps = Number.isFinite(slip) ? slip : 0;

      let jointError = 0;
      let padLift = 0;
      for (const leg of legs) {
        if (leg.severed) continue;
        jointError = Math.max(jointError,
          Math.abs(relativeX(chassis, leg.femur) - leg.commandedHip),
          Math.abs(relativeX(leg.femur, leg.shin) - leg.commandedKnee),
          Math.abs(relativeX(leg.shin, leg.foot) - leg.commandedAnkle));
        padLift = Math.max(padLift, padPoint(leg, scratch.pad).y - groundY);
      }
      evidence.jointErrorRad = jointError;
      evidence.soleLiftM = padLift;
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
        Object.freeze({ id: "speed", unit: "m" as const, min: 0,
          max: M.carrier.maxSpeedMps, rate: M.carrier.maxAccelerationMps2 }),
        Object.freeze({ id: "yaw", unit: "rad" as const, min: -M.carrier.maxYawSpeedRadS,
          max: M.carrier.maxYawSpeedRadS, rate: M.carrier.maxYawAccelerationRadS2 }),
        // Both ends the same number: this is what "no crouch, because it is already low" is,
        // published rather than asserted in a comment.
        Object.freeze({ id: "height", unit: "m" as const,
          min: multilegHeightRange().crouchM, max: multilegHeightRange().standM, rate: 0 }),
      ]),
      reach: standHeight,
      strokes: NO_STROKES,
      reachable: null,
      settledBand: 0.02,
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

    const built: BuiltLocomotion = Object.freeze({
      parts: frozenParts,
      strikers: Object.freeze([]) as readonly Striking[],
      root: chassis,
      adapter,
      port: activePort,
      world,
      footprint,
      heightRange: multilegHeightRange(),
      authority,
      postureEvidence,
      gait,
      evidence: (): LocomotionEvidence => evidence,
      readout: (): LocomotionReadoutState => readout.state(),

      command(next: LocomotionCommand): void {
        if (severed) return;
        request = next.request;
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
        // Stated once and spent twice, exactly as the biped's and the wheel's.
        scratch.drive.set(M.shoveImpulseNs, 0, 0);
        scratch.drive.rotateByQuaternionToRef(
          chassis.mesh.rotationQuaternion ?? Quaternion.Identity(), scratch.drive);
        const target = carried && ctx.socket.mount.body.getMotionType() === PhysicsMotionType.DYNAMIC
          ? ctx.socket.mount : chassis;
        target.body.applyImpulse(scratch.drive, target.mesh.position);
        port?.queueStabilityEvent({ horizontalShoveNs: [scratch.drive.x, scratch.drive.z] });
      },

      sever(): void {
        if (severed) return;
        severed = true;
        for (const leg of legs) leg.severed = true;
        if (chassis.body.getMotionType() !== PhysicsMotionType.DYNAMIC) {
          chassis.body.setMotionType(PhysicsMotionType.DYNAMIC);
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
        for (const leg of legs) {
          for (const part of [leg.foot, leg.shin, leg.femur]) {
            part.body.dispose();
            part.shape.dispose();
            // The shell is parented to the collider mesh, so this takes it too -- and
            // `false, false` leaves the palette's materials standing.
            part.mesh.dispose(false, false);
          }
        }
        chassis.body.dispose();
        chassis.shape.dispose();
        chassis.mesh.dispose(false, false);
      },
    });

    /** Contacts, counted the way both bench harnesses already count them. */
    const own = new Set(frozenParts.map(({ part }) => part.body));
    for (const { part } of frozenParts) {
      part.body.setCollisionCallbackEnabled(true);
      watchers.push([part.body, part.body.getCollisionObservable().add((event) => {
        contacts += 1;
        // **`selfCollisionCount === 0` proves nothing about pairs the filters never admitted**,
        // and here they never are: every leg and the chassis sit on the side's own body layer,
        // whose collide mask contains neither itself nor the trunk. So a non-zero count is a
        // filter set wrongly rather than a body plan that touches itself. Worth saying twice on
        // this module: six legs 0.44 m apart fore-and-aft never come near each other in the
        // envelope the hip stops admit, so there is nothing here a self-collision pair would fix.
        if (own.has(event.collidedAgainst)) selfContacts += 1;
      }) as unknown as Observer<unknown>]);
    }

    return built;
  },
});
