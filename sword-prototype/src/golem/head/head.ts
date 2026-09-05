import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import {
  PhysicsConstraintAxis,
  PhysicsConstraintMotorType,
} from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";
import type { Physics6DoFConstraint } from "@babylonjs/core/Physics/v2/physicsConstraint.js";
import type { Scene } from "@babylonjs/core/scene.js";

import type { Striking } from "../../combat.ts";
import type { NaturalIntent } from "../../mind.ts";
import { COLLIDES, LAYER } from "../../physics.ts";
import { boxPart, capsulePart, joint, type Part } from "../../rig.ts";
import { slewTowards } from "../anchor-drive.ts";
import { HEAD_NECK } from "../config.ts";
import { boneShell } from "../effectors/shell.ts";
import { RigidStrike } from "../effectors/striker.ts";
import { materialForGolemRole, type GolemMaterialPalette } from "../materials.ts";
import {
  weldRotation,
  type BuiltModule,
  type EffectorAxisView,
  type EffectorStroke,
  type EffectorStrokeKind,
  type EffectorView,
  type GolemModuleDefinition,
  type GolemMount,
  type GolemPart,
  type GolemSlot,
  type ModuleAxisEnvelope,
  type ModuleBuild,
  type ModuleEnvelope,
} from "../module.ts";

/**
 * The head: the fatal part, on a soft neck, and in the ram the one attack a golem makes with it.
 *
 * **The risk is the design.** A ram golem's whole attack is a velocity event that puts its own
 * fatal part into the contact. That is deliberate: it is the trade the option exists to offer,
 * and it is why `plain` -- the same neck and the same block with no plate and no lunge -- is kept
 * as a real option rather than as a placeholder.
 *
 * **The command is `NaturalIntent` and nothing else.** A creature whose weapon is its head has no
 * hand slot to write into, and Session 17 of the Warrior line records at length what happens when
 * one is used anyway: a centipede was driven through `primary.thrust` on a body that publishes no
 * hands, every reader downstream carried the exception, and when the channel was finally split
 * out the *host* side was left behind so a person could take a centipede, walk it around and find
 * the attack button dead. `applyButtonPose` in `src/buttons.ts` owns that mapping now -- one press
 * onto the acting hand and the natural striker together -- so the same left button that thrusts a
 * blade fires this lunge, and `tests/golem-torso-head.test.mjs` drives it through exactly that
 * function rather than by setting the flag by hand.
 *
 * **Two hinges in series, and only one of them is commanded.** The pitch is the nod: rest,
 * `guard`, and the lunge. The yaw is held at zero on a soft ceiling and nothing ever asks it for
 * anything, which is not an oversight -- a head on a single hinge can only move in the sagittal
 * plane, and a blow from the side has to be able to turn it and let the motor bring it back. That
 * is the recoil the gate asks about, and its achieved value is published on the view so it is
 * measured rather than assumed.
 *
 * Every reading goes through `mesh.position` and `mesh.rotationQuaternion` and nothing else; see
 * `RigidStrike` for why a world matrix must not be touched here.
 */

const HINGE = PhysicsConstraintAxis.ANGULAR_X;
const AXIS_UP = Object.freeze(new Vector3(0, 1, 0));
const AXIS_FORWARD = Object.freeze(new Vector3(0, 0, 1));

/** What a head can be asked for: a guard held. The ram appends its lunge. */
const HEAD_STROKES: readonly EffectorStrokeKind[] =
  Object.freeze<EffectorStrokeKind[]>(["cover"]);
const RAM_STROKES: readonly EffectorStrokeKind[] =
  Object.freeze<EffectorStrokeKind[]>(["thrust", "cover"]);

/**
 * How the ram plate is bolted to the brow.
 *
 * `perp` is where the plate's own +Y points: the head's +Z, which is forward -- so the plate
 * stands out from the brow and its far face is the leading edge. `axis` is where its own +X
 * points, the head's own lateral, and for a striker with no edge that is a frame rather than a
 * decision: `src/scoring.ts` never asks a `mass` bite for an edge alignment. It is stated all the
 * same, because `weldRotation` needs both and a weld whose two frames disagree at construction is
 * a violation the solver clears by flinging the thing.
 */
const RAM_MOUNT: GolemMount = Object.freeze({
  axis: new Vector3(1, 0, 0),
  perp: new Vector3(0, 0, 1),
});

/** The ram's plate and the stroke that swings it. `null` for a head that cannot attack. */
export interface RamTuning {
  readonly plateWidth: number;
  readonly plateLength: number;
  readonly plateThickness: number;
  readonly plateMass: number;
  readonly plateHealth: number;
  readonly plateVitalityWeight: number;
  readonly plateTipOffset: number;
  readonly lunge: {
    readonly driveRate: number;
    readonly driveSeconds: number;
    readonly followSeconds: number;
    readonly driveTorque: number;
    readonly followTorque: number;
  };
}

/** Everything one head option may differ in. `HEAD_NECK` holds everything they share. */
export interface HeadTuning {
  /** Radians of nod that `guard` holds. A level, not a stroke. */
  readonly guardPitch: number;
  /** The plate and its lunge, or null for a head that cannot attack. */
  readonly ram: RamTuning | null;
}

export type HeadModuleDefinition = GolemModuleDefinition<NaturalIntent>;

/**
 * The authored shell: a carved block with a rune inlay, and the neck's own collar.
 *
 * Cosmetics carry no authority: nothing here makes a body, a shape or a constraint, everything is
 * parented to the collider mesh, and `Mesh.dispose(false, false)` therefore takes the whole shell
 * with the collider while leaving the palette's materials standing.
 */
function headShell(scene: Scene, options: {
  readonly name: string;
  readonly host: Mesh;
  readonly materials: GolemMaterialPalette;
}): readonly AbstractMesh[] {
  const N = HEAD_NECK;
  const made: AbstractMesh[] = [];
  const attach = (mesh: Mesh, at: Vector3, rotation?: Quaternion): Mesh => {
    mesh.isPickable = false;
    mesh.parent = options.host;
    mesh.position.copyFrom(at);
    mesh.rotationQuaternion = rotation ?? Quaternion.Identity();
    made.push(mesh);
    return mesh;
  };

  const block = MeshBuilder.CreateBox(`${options.name}.block`, {
    width: N.headWidth, height: N.headHeight, depth: N.headDepth,
  }, scene);
  block.material = materialForGolemRole(options.materials, "shell");
  attach(block, Vector3.Zero());

  // A brow ridge, so the block reads as carved rather than extruded -- the same argument
  // `boneShell` makes about a limb being a slab with a proud ridge on it.
  const ridge = MeshBuilder.CreateBox(`${options.name}.ridge`, {
    width: N.headWidth * 0.92, height: N.headHeight * 0.22, depth: N.headDepth * 0.10,
  }, scene);
  ridge.material = materialForGolemRole(options.materials, "armour");
  attach(ridge, new Vector3(0, N.headHeight * 0.22, N.browOffset));

  // The rune inlay: `GOLEM_SURFACE_RULES.rune` is the non-structural mineral-and-bronze recipe,
  // and this is the one place on a golem where that recipe has an obvious home.
  const rune = MeshBuilder.CreateBox(`${options.name}.rune`, {
    width: N.headWidth * 0.30, height: N.headHeight * 0.34, depth: N.headDepth * 0.06,
  }, scene);
  rune.material = materialForGolemRole(options.materials, "rune");
  attach(rune, new Vector3(0, -N.headHeight * 0.10, N.browOffset));

  return Object.freeze(made);
}

/**
 * Declare a head option.
 *
 * Same shape as `torsoModule`, `defineChain` and `defineTerminal`: the code is written once and an
 * option is a name, a label and a tuning block. The one branch in here is `tuning.ram`, and it is
 * a presence rather than a kind -- a head either carries a plate and a lunge or it does not, and
 * there is no third answer for a default branch to pick wrongly.
 */
export function headModule(id: string, label: string, tuning: HeadTuning): HeadModuleDefinition {
  const N = HEAD_NECK;
  return Object.freeze({
    id,
    slots: Object.freeze<GolemSlot[]>(["head"]),
    label,
    massKg: N.neckMass + N.headMass + (tuning.ram?.plateMass ?? 0),

    build(ctx: ModuleBuild): BuiltModule<NaturalIntent> {
      const socket = ctx.socket;
      const facing = socket.rotation;
      const stone = materialForGolemRole(ctx.materials, "shell");

      // --- geometry ---------------------------------------------------------------------------
      //
      // **Built at yaw 0 and pitch 0, which is joint angle exactly zero on both hinges**, and both
      // stops stand well outside that. A stop that does not admit its own build pose is a
      // violation the solver clears on step one: Session 02 measured a blade tip thrown at
      // 9.95 m/s from a motionless stand because a chain was constructed 0.10 rad outside its own
      // floor, and it was the weld-frame assertion that found it rather than looking.
      const up = new Vector3();
      AXIS_UP.rotateByQuaternionToRef(facing, up);

      const neck = capsulePart(ctx.scene, {
        name: `${ctx.name}.neck`,
        position: socket.world.add(up.scale(N.neckLength / 2)),
        rotation: facing,
        height: N.neckLength,
        radius: N.neckRadius,
        mass: N.neckMass,
        layer: ctx.layers.body,
        collidesWith: ctx.layers.bodyCollidesWith,
        material: stone,
        visible: false,
      });
      const head = boxPart(ctx.scene, {
        name: `${ctx.name}.head`,
        position: socket.world.add(up.scale(N.neckLength + N.headHeight / 2)),
        rotation: facing,
        size: new Vector3(N.headWidth, N.headHeight, N.headDepth),
        mass: N.headMass,
        layer: ctx.layers.body,
        collidesWith: ctx.layers.bodyCollidesWith,
        material: stone,
        visible: false,
      });
      for (const part of [neck, head]) {
        part.body.setLinearDamping(N.linearDamping);
        part.body.setAngularDamping(N.angularDamping);
      }

      // --- the neck -----------------------------------------------------------------------------
      //
      // Yaw at the root, pitch above it, so a nod happens in whatever plane a knock left the head
      // in. A positive rotation about the pitch hinge's +X carries the head's +Y toward +Z, which
      // is the chin going down and the crown coming forward -- so a positive commanded pitch is a
      // nod, with no sign constant anywhere.
      let yawJoint: Physics6DoFConstraint | null = joint(ctx.scene, socket.mount, neck, {
        pivotParent: socket.local,
        pivotChild: new Vector3(0, -N.neckLength / 2, 0),
        axisParent: AXIS_UP.clone(),
        axisChild: AXIS_UP.clone(),
        perpParent: AXIS_FORWARD.clone(),
        perpChild: AXIS_FORWARD.clone(),
        swing: { x: { min: N.yawJointMin, max: N.yawJointMax } },
        damping: N.motorDamping,
      });
      let pitchJoint: Physics6DoFConstraint | null = joint(ctx.scene, neck, head, {
        pivotParent: new Vector3(0, N.neckLength / 2, 0),
        pivotChild: new Vector3(0, -N.headHeight / 2, 0),
        swing: { x: { min: N.pitchJointMin, max: N.pitchJointMax } },
        damping: N.motorDamping,
      });
      yawJoint.setAxisMotorType(HINGE, PhysicsConstraintMotorType.POSITION);
      // Held at zero forever. The ceiling is what makes this compliance rather than a lock: a blow
      // turns the head against a finite motor and the motor walks it back.
      yawJoint.setAxisMotorTarget(HINGE, 0);
      yawJoint.setAxisMotorMaxForce(HINGE, N.yawTorque);

      // --- the ram plate ------------------------------------------------------------------------
      const ram = tuning.ram;
      let plate: Part | null = null;
      let plateWeld: Physics6DoFConstraint | null = null;
      let striker: RigidStrike | null = null;
      if (ram) {
        // The frame the weld is about to demand, rather than the golem's own -- `weldRotation` is
        // the same arithmetic `weapon.ts`'s `mountRotation` performs, and the reason both exist is
        // 48.3 m/s of tip speed on a fighter standing perfectly still.
        const rotation = weldRotation(RAM_MOUNT, facing);
        const along = new Vector3();
        AXIS_UP.rotateByQuaternionToRef(rotation, along);
        const browLocal = new Vector3(0, 0, N.browOffset);
        const browWorld = new Vector3();
        browLocal.rotateByQuaternionToRef(facing, browWorld);
        browWorld.addInPlace(head.mesh.position);

        plate = boxPart(ctx.scene, {
          name: `${ctx.name}.ram`,
          position: browWorld.add(along.scale(ram.plateLength / 2)),
          rotation,
          size: new Vector3(ram.plateWidth, ram.plateLength, ram.plateThickness),
          mass: ram.plateMass,
          // **The plate declares itself against the enemy**, exactly as a terminal does: it is on
          // the strike layer, whose mask is world, the far side and debris, so it passes through
          // its own golem and stops an enemy. The head and neck behind it are anatomy and stay on
          // the body layer. Both filters go on the leaf shape -- `boxPart` builds a single
          // `PhysicsShapeBox` and not a container, which is the whole reason this is one box.
          layer: ctx.layers.strike,
          collidesWith: ctx.layers.strikeCollidesWith,
          material: materialForGolemRole(ctx.materials, "mount"),
        });
        plateWeld = joint(ctx.scene, head, plate, {
          pivotParent: browLocal.clone(),
          pivotChild: new Vector3(0, -ram.plateLength / 2, 0),
          axisParent: RAM_MOUNT.axis,
          axisChild: new Vector3(1, 0, 0),
          perpParent: RAM_MOUNT.perp,
          perpChild: new Vector3(0, 1, 0),
          // Every axis locked. A weld is a joint with nothing free, through the one constraint
          // type the whole rig uses.
          swing: {},
        });
        striker = new RigidStrike(plate, {
          // A ram plate hurts somebody with **mass**: no edge to place and no point to arrive
          // straight, which is `BITE.club`'s row in `src/scoring.ts` and the row the overview's
          // own `mace` terminal is destined for. It is the closest honest row rather than a new
          // one; a ram-specific bite would be a balance change with its own test, and this
          // session has no evidence that one is wanted.
          kind: "ram",
          effectorId: `${ctx.name}.ram`,
          // **Null, because a head is not a hand.** `Combat` routes a null hand to the
          // body-neutral channel already; this is the centipede's rule with the alias it still
          // carries taken out, because a golem head has no `HandView` to pretend to be.
          hand: null,
          tipAlong: ram.plateTipOffset - ram.plateLength / 2,
        });
      }

      // --- parts ---------------------------------------------------------------------------------
      const parts: readonly GolemPart[] = Object.freeze([
        Object.freeze({
          id: neck.name,
          part: neck,
          shell: boneShell(ctx.scene, {
            name: neck.name, host: neck.mesh, length: N.neckLength,
            radius: N.neckRadius, taper: 0.30, materials: ctx.materials,
          }),
          health: N.neckHealth,
          vitalityWeight: N.neckVitalityWeight,
          fatal: false,
        }),
        Object.freeze({
          id: head.name,
          part: head,
          shell: headShell(ctx.scene, {
            name: head.name, host: head.mesh, materials: ctx.materials,
          }),
          health: N.headHealth,
          vitalityWeight: N.headVitalityWeight,
          /** The fatal part. Losing it ends the golem, whichever option is on the neck. */
          fatal: true,
          armour: N.headArmour,
        }),
        ...(ram && plate ? [Object.freeze({
          id: plate.name,
          part: plate,
          // The collider *is* the drawn mesh, which is honest for a flat plate: a shell over it
          // would be the same slab twice. The field stays separate because a shell carries no
          // authority, so a later plate that grows horns adds meshes without the collider moving.
          shell: Object.freeze([plate.mesh]),
          health: ram.plateHealth,
          vitalityWeight: ram.plateVitalityWeight,
          fatal: false,
        })] : []),
      ]) as readonly GolemPart[];

      // --- the envelope ----------------------------------------------------------------------------
      //
      // Pitch first, because the readout takes settle, arrival and overshoot from the first
      // published axis and `HEAD_NECK.settledBand` is stated in radians against it.
      const envelopeAxes: readonly ModuleAxisEnvelope[] = Object.freeze([
        Object.freeze({
          id: "pitch", unit: "rad" as const,
          min: N.pitchMin, max: N.pitchMax, rate: N.pitchRate,
        }),
        Object.freeze({
          id: "yaw", unit: "rad" as const,
          min: N.yawJointMin, max: N.yawJointMax,
          // Nothing commands the yaw, so its command moves at exactly zero. Published as a real
          // number rather than omitted, because a mind reading the envelope has to be able to see
          // that this axis is not one it can ask for -- an absent axis and an axis with no
          // authority look identical from the outside, and only one of them is true here.
          rate: 0,
        }),
      ]);
      const envelope: ModuleEnvelope = Object.freeze({
        axes: envelopeAxes,
        // How far the business end travels from the socket: the neck, half the head, and whatever
        // is welded to the brow.
        reach: N.neckLength + N.headHeight / 2
          + (ram ? N.browOffset + ram.plateTipOffset : N.browOffset),
        strokes: ram ? RAM_STROKES : HEAD_STROKES,
        reachable: null,
        settledBand: N.settledBand,
      });

      // --- state -------------------------------------------------------------------------------
      //
      // **The command starts at the build pose.** A command initialised anywhere else would be a
      // step the rate limiter has to run on the very first control step, which is how a Warrior arm
      // keyframes onto its commanded pose and reads 77 m/s of tip speed in a fighter that never
      // swings. The head is built at pitch 0 and `restPitch` is 0, so the first move is a move.
      let wantedPitch = N.restPitch;
      let commandedPitch = 0;
      let phase: EffectorStroke = "idle";
      let phaseTime = 0;
      let appliedPhase: EffectorStroke | null = null;
      let thrustHeld = false;
      let severed = false;

      const axisViews = [
        { id: "pitch", commanded: 0, achieved: 0 },
        { id: "yaw", commanded: 0, achieved: 0 },
      ];
      const axes: readonly EffectorAxisView[] = Object.freeze(axisViews);

      const scratch = {
        local: new Vector3(),
        read: new Vector3(),
        tip: new Vector3(),
        commandedTip: new Vector3(),
        socket: new Vector3(),
        inverse: new Quaternion(),
      };
      const rotate = (local: Vector3, by: Quaternion | null, into: Vector3): Vector3 => {
        local.rotateByQuaternionToRef(by ?? Quaternion.Identity(), into);
        return into;
      };
      const mountRotation = (): Quaternion =>
        socket.mount.mesh.rotationQuaternion ?? Quaternion.Identity();

      /**
       * Where the neck socket is **now**, world, into a ref this module owns.
       *
       * `GolemSocket.world` is by contract the socket's position *at construction*, which is what
       * a weld has to be built against and is all a module bolted to the bench's kinematic stand
       * ever needs. A head is the first module bolted to something that moves: a torso's neck
       * frame translates as the trunk leans, so a commanded point taken from the build-time world
       * would be the pose the head should hold on a trunk that never moved. Recomputed from the
       * mount's own `mesh.position` and `mesh.rotationQuaternion` -- the two fields Havok's
       * `syncTransform` writes at the end of every solver step, and the only two a reader here
       * may touch.
       */
      const socketWorld = (): Vector3 => {
        rotate(socket.local, socket.mount.mesh.rotationQuaternion, scratch.socket);
        return scratch.socket.addInPlace(socket.mount.mesh.position);
      };

      /** The yaw the neck achieved: its own +Z in the mount's frame is `(sin y, 0, cos y)`. */
      const achievedYaw = (): number => {
        rotate(AXIS_FORWARD, neck.mesh.rotationQuaternion, scratch.read);
        mountRotation().conjugateToRef(scratch.inverse);
        rotate(scratch.read, scratch.inverse, scratch.local);
        return Math.atan2(scratch.local.x, scratch.local.z);
      };

      /** The pitch the head achieved: its own +Y in the neck's frame is `(0, cos p, sin p)`. */
      const achievedPitch = (): number => {
        rotate(AXIS_UP, head.mesh.rotationQuaternion, scratch.read);
        (neck.mesh.rotationQuaternion ?? Quaternion.Identity()).conjugateToRef(scratch.inverse);
        rotate(scratch.read, scratch.inverse, scratch.local);
        return Math.atan2(scratch.local.z, scratch.local.y);
      };

      /**
       * The head's business end: the ram plate's leading edge, or the brow when there is no plate.
       *
       * The striker answers it where there is one, because `Striking.tipPosition` is already the
       * "where is the business end" question and a second point beside it would be a second answer
       * to drift. The plain head has no striker, so its brow is computed here from the same two
       * fields.
       */
      const tipPoint = (): Vector3 => {
        if (striker) return striker.tipPosition();
        scratch.tip.set(0, 0, N.browOffset);
        rotate(scratch.tip, head.mesh.rotationQuaternion, scratch.tip);
        return scratch.tip.addInPlace(head.mesh.position);
      };

      /**
       * Where that point is being *asked* to be, world.
       *
       * Composed from the commanded pitch in the order the chain is built -- pitch inside yaw
       * inside the mount -- rather than read back off the bodies, which would make the readout's
       * tip-to-command error identically zero. The yaw's command is always zero, so it drops out
       * of the composition and what is left is a nod in the mount's own sagittal plane: a point
       * `up` above the pitch pivot and `out` in front of it lands at
       * `(0, up cos p - out sin p, up sin p + out cos p)` relative to that pivot.
       */
      const commandedTip = (): Vector3 => {
        const up1 = N.headHeight / 2;
        const out = ram ? N.browOffset + ram.plateTipOffset : N.browOffset;
        const cos = Math.cos(commandedPitch);
        const sin = Math.sin(commandedPitch);
        scratch.local.set(0, N.neckLength + up1 * cos - out * sin, up1 * sin + out * cos);
        rotate(scratch.local, mountRotation(), scratch.commandedTip);
        return scratch.commandedTip.addInPlace(socketWorld());
      };

      const view: EffectorView = {
        slot: socket.slot,
        get tip(): Vector3 { return tipPoint(); },
        get commandedTip(): Vector3 { return commandedTip(); },
        get axes(): readonly EffectorAxisView[] { return axes; },
        get stroke(): EffectorStroke { return phase; },
        get anchor(): Vector3 | null { return null; },
        get anchorStray(): number | null { return null; },
        // A ram plate bites with mass. An edge alignment taken off it would be a number that means
        // nothing and a readout would print it anyway, which is exactly what this plan set exists
        // to stop being quoted -- so the answer is null and the readout says "n/a".
        get edge(): Vector3 | null { return null; },
      };

      const writeMotor = (): void => {
        if (!pitchJoint || severed) return;
        if (phase === "idle") {
          if (appliedPhase !== "idle") {
            pitchJoint.setAxisMotorType(HINGE, PhysicsConstraintMotorType.POSITION);
            pitchJoint.setAxisMotorMaxForce(HINGE, N.pitchTorque);
          }
          pitchJoint.setAxisMotorTarget(HINGE, commandedPitch);
        } else if (appliedPhase !== phase) {
          pitchJoint.setAxisMotorType(HINGE, PhysicsConstraintMotorType.VELOCITY);
          // Positive joint velocity is the head going forward and down, because a positive pitch
          // is a nod. A lunge is a nod driven hard.
          pitchJoint.setAxisMotorTarget(HINGE, ram ? ram.lunge.driveRate : 0);
          pitchJoint.setAxisMotorMaxForce(
            HINGE,
            phase === "drive"
              ? (ram?.lunge.driveTorque ?? N.pitchTorque)
              : (ram?.lunge.followTorque ?? N.pitchTorque),
          );
        }
        appliedPhase = phase;
      };
      writeMotor();

      return Object.freeze({
        parts,
        strikers: Object.freeze(striker ? [striker] : []) as readonly Striking[],

        command(next: NaturalIntent): void {
          if (severed) return;
          // `guard` is a level and `thrust` is an edge -- the rule `src/buttons.ts` states and the
          // rule the mouse already obeys. Holding the button does not chain lunges, and a lunge
          // already running is not restarted by a second press: a velocity event has a length, and
          // re-triggering it halfway through would make it a pose sequence with extra steps.
          wantedPitch = next.guard ? tuning.guardPitch : N.restPitch;
          if (ram && next.thrust && !thrustHeld && phase === "idle") {
            phase = "drive";
            phaseTime = 0;
          }
          thrustHeld = next.thrust;
        },

        step(dt: number): void {
          if (severed) return;
          // The command keeps moving through a lunge, so that when the lunge ends the head returns
          // to whatever the buttons are asking for *now* rather than to what they said when the
          // press landed.
          commandedPitch = slewTowards(commandedPitch, wantedPitch, N.pitchRate, dt);

          if (phase !== "idle" && ram) {
            phaseTime += dt;
            const limit = phase === "drive" ? ram.lunge.driveSeconds : ram.lunge.followSeconds;
            if (phaseTime >= limit) {
              phase = phase === "drive" ? "follow" : "idle";
              phaseTime = 0;
            }
          }
          writeMotor();

          axisViews[0].commanded = commandedPitch;
          axisViews[0].achieved = achievedPitch();
          // The yaw's command is zero forever; what is worth reading is what a knock did to it.
          axisViews[1].commanded = 0;
          axisViews[1].achieved = achievedYaw();
        },

        envelope: () => envelope,
        view: () => view,

        sever(): void {
          if (severed) return;
          severed = true;
          striker?.sever();
          if (plate) {
            // On the leaf, which for a one-box plate is the shape itself. Writing a container's
            // mask is a no-op Havok ignores and reads back as garbage -- a shape set to 8 came
            // back as 383476, and every weapon in this directory collided with everything for its
            // whole life because of it.
            plate.shape.filterMembershipMask = LAYER.DEBRIS;
            plate.shape.filterCollideMask = COLLIDES.DEBRIS;
          }
          yawJoint?.dispose();
          yawJoint = null;
          pitchJoint?.dispose();
          pitchJoint = null;
        },

        dispose(): void {
          severed = true;
          striker?.sever();
          // The weld before the bodies: `PhysicsBody.dispose` releases the Havok body and walks
          // straight past whatever is constraining it, so a bench rebuilt on `R` would leak this
          // every time.
          plateWeld?.dispose();
          plateWeld = null;
          yawJoint?.dispose();
          yawJoint = null;
          pitchJoint?.dispose();
          pitchJoint = null;
          for (const part of [plate, head, neck]) {
            if (!part) continue;
            part.body.dispose();
            part.shape.dispose();
            part.mesh.dispose(false, false);
          }
          plate = null;
        },
      });
    },
  });
}
