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
import { boxPart, capsulePart, joint } from "../../rig.ts";
import { slewTowards } from "../anchor-drive.ts";
import { TORSO_WAIST } from "../config.ts";
import { ballShell } from "../effectors/shell.ts";
import { materialForGolemRole, type GolemMaterialPalette } from "../materials.ts";
import {
  NO_STROKES,
  effectorSlot,
  type BuiltModule,
  type EffectorAxisView,
  type EffectorView,
  type GolemModuleDefinition,
  type GolemPart,
  type GolemSlot,
  type GolemSocket,
  type ModuleAxisEnvelope,
  type ModuleBuild,
  type ModuleEnvelope,
} from "../module.ts";

/**
 * The torso: the part that carries the three upper sockets and the vitality core.
 *
 * Both options are built from this one file, and what a `TorsoTuning` block may differ in is the
 * whole of what a torso option is allowed to be. **Mechanical, not cosmetic** is the session's
 * frozen choice, and it is enforced here by what the shape does not contain: there is no mesh, no
 * silhouette and no style in `TorsoTuning`. An option states a size, a mass, an armour fraction,
 * three socket frames and a waist range, and the shell is authored *from those numbers* -- the
 * armour plate's own thickness is a function of `coreArmour`, so a torso that looks better
 * armoured is one that is.
 *
 * **The waist is two hinges in series and the mount is whatever it is given.** On the bench that
 * is `buildGolemStand`'s kinematic block, standing in for a locomotion root; in Session 08 it is a
 * real one. Nothing here knows the difference, because a `GolemSocket` is the whole of what the
 * mount has to be: a body, a point in its local frame, that point in the world at construction,
 * and the rotation nothing may be built at odds with.
 *
 * **Every reading goes through `mesh.position` and `mesh.rotationQuaternion`.** Not
 * `getWorldMatrix()`: it short-circuits on the render id and *reading* it stamps that id, which
 * silently converts every later reader in the frame into a reader of this sample. See
 * `RigidStrike` for the full account and the nine per cent phantom regression it produced.
 */

const HINGE = PhysicsConstraintAxis.ANGULAR_X;
const AXIS_UP = Object.freeze(new Vector3(0, 1, 0));
const AXIS_FORWARD = Object.freeze(new Vector3(0, 0, 1));

/**
 * What a person or a mind asks a trunk for: two normalized numbers out of `Intent.posture`.
 *
 * Structurally exactly `PostureIntent` minus `crouch`, which is deliberate rather than lazy:
 * `crouch` belongs to the locomotion module (Session 05), and a torso that read it would be a
 * second owner of a number one module already owns. `Intent` is not widened by either of them --
 * the registry's adapter narrows the whole command to this, which is the direction the one-seam
 * rule allows.
 */
export interface TorsoCommand {
  /** -1 back through +1 forward. */
  readonly trunkLean: number;
  /** -1 left through +1 right. */
  readonly trunkTwist: number;
}

/** Everything one torso option may differ in. One block per option in `src/golem/config.ts`. */
export interface TorsoTuning {
  readonly coreWidth: number;
  readonly coreHeight: number;
  readonly coreDepth: number;
  readonly coreMass: number;
  readonly coreHealth: number;
  readonly coreVitalityWeight: number;
  /** The fraction of a scored blow the core's own stone absorbs. See `GolemPart.armour`. */
  readonly coreArmour: number;
  /** Effector socket offset from the core's centreline, its centre and its front face, metres. */
  readonly socketSide: number;
  readonly socketHeight: number;
  readonly socketFront: number;
  /** Where the neck socket sits above the core's centre, metres. */
  readonly neckHeight: number;
  /** Radians of lean and twist at a commanded magnitude of 1. */
  readonly leanMax: number;
  readonly twistMax: number;
}

/**
 * A built torso: a module that also hands out the three sockets it carries.
 *
 * `socket` is non-null here where `BuiltModule.socket` is optional, because a torso always has
 * all three: two effectors and a neck. Asking it for anything else throws rather than answering
 * null, for the reason `effectorModule` refuses an illegal pair at build -- a socket that does
 * not exist is a mounting mistake, and a null would let something be built into nowhere.
 */
export interface BuiltTorso extends BuiltModule<TorsoCommand> {
  socket(slot: GolemSlot): GolemSocket;
}

export interface TorsoModuleDefinition extends GolemModuleDefinition<TorsoCommand> {
  build(ctx: ModuleBuild): BuiltTorso;
}

/**
 * The authored shell: a carved chest, two bronze shoulder mounts and a collar, and armour slabs
 * whose thickness is the armour fraction.
 *
 * Cosmetics carry no authority (house rule) and here that is true by construction: nothing in
 * this function makes a body, a shape or a constraint, and everything it makes is parented to the
 * collider mesh and `isPickable = false`. `Mesh.dispose(false, false)` recurses into children and
 * leaves materials alone, so the core's disposal takes the whole shell and leaves the palette's
 * materials standing -- which is the rule a carried mesh has to obey, or disposing one module
 * removes another's texture.
 *
 * **The plates' thickness is `0.02 + coreArmour * 0.10` metres and that is the point.** A shell
 * choice that changes nothing physical is out of this plan, so the one visible difference between
 * the two options is drawn from the one number that decides what a blow costs. It cannot drift
 * away from the mechanic because it is the mechanic.
 */
function torsoShell(scene: Scene, options: {
  readonly name: string;
  readonly host: Mesh;
  readonly tuning: TorsoTuning;
  readonly materials: GolemMaterialPalette;
}): readonly AbstractMesh[] {
  const T = options.tuning;
  const made: AbstractMesh[] = [];
  const attach = (mesh: Mesh, at: Vector3, rotation?: Quaternion): Mesh => {
    mesh.isPickable = false;
    mesh.parent = options.host;
    mesh.position.copyFrom(at);
    mesh.rotationQuaternion = rotation ?? Quaternion.Identity();
    made.push(mesh);
    return mesh;
  };

  const chest = MeshBuilder.CreateBox(`${options.name}.chest`, {
    width: T.coreWidth, height: T.coreHeight, depth: T.coreDepth,
  }, scene);
  chest.material = materialForGolemRole(options.materials, "shell");
  attach(chest, Vector3.Zero());

  // Front and back slabs, proud of the chest by their own thickness. Carved stone rather than
  // bronze, because `GOLEM_SURFACE_RULES` files replaceable protective slabs under `armour` and
  // that recipe is the stone one -- a golem's armour is more stone, not a breastplate.
  const plate = 0.02 + T.coreArmour * 0.10;
  for (const side of [1, -1]) {
    const slab = MeshBuilder.CreateBox(`${options.name}.plate${side > 0 ? "Front" : "Back"}`, {
      width: T.coreWidth * 0.86, height: T.coreHeight * 0.72, depth: plate,
    }, scene);
    slab.material = materialForGolemRole(options.materials, "armour");
    attach(slab, new Vector3(0, -T.coreHeight * 0.04, side * (T.coreDepth / 2 + plate / 2)));
  }

  // A bronze mount at each effector socket and a collar at the neck: the hardware a module bolts
  // to, drawn where it actually bolts. `GOLEM_SURFACE_RULES.mount` is the bronze recipe.
  const bronze = materialForGolemRole(options.materials, "mount");
  for (const outboard of [1, -1]) {
    const pad = MeshBuilder.CreateCylinder(`${options.name}.shoulder${outboard > 0 ? "R" : "L"}`, {
      diameter: T.coreHeight * 0.42, height: 0.06, tessellation: 16,
    }, scene);
    pad.material = bronze;
    attach(pad, new Vector3(outboard * (T.coreWidth / 2), T.socketHeight, T.socketFront),
      Quaternion.RotationAxis(new Vector3(0, 0, 1), Math.PI / 2));
  }
  const collar = MeshBuilder.CreateCylinder(`${options.name}.collar`, {
    diameter: T.coreWidth * 0.34, height: 0.07, tessellation: 16,
  }, scene);
  collar.material = bronze;
  attach(collar, new Vector3(0, T.neckHeight - 0.035, 0));

  return Object.freeze(made);
}

/**
 * Declare a torso option.
 *
 * The same shape as `defineChain` and `defineTerminal` and for a related reason: what varies
 * between two torsos is a data block, so the *code* is written once and an option is a name, a
 * label and a `TorsoTuning`. There is nothing here for a pair of options to disagree about,
 * which is the same defence `effectorModule` gives -- a ternary chain with a default branch is
 * how a shield shipped as a club in this directory.
 */
export function torsoModule(
  id: string,
  label: string,
  tuning: TorsoTuning,
): TorsoModuleDefinition {
  const W = TORSO_WAIST;
  return Object.freeze({
    id,
    slots: Object.freeze<GolemSlot[]>(["torso"]),
    label,
    massKg: W.ballMass + tuning.coreMass,

    build(ctx: ModuleBuild): BuiltTorso {
      const T = tuning;
      const socket = ctx.socket;
      const facing = socket.rotation;
      const stone = materialForGolemRole(ctx.materials, "shell");

      // --- geometry -------------------------------------------------------------------------
      //
      // **Built at lean 0 and twist 0, which is joint angle exactly zero on both hinges.** A
      // joint whose two frames disagree at construction is a violation the solver clears by
      // flinging the thing, and a stop that does not admit its own build pose is the same failure
      // arriving through a limit -- Session 02 measured a blade tip thrown at 9.95 m/s from a
      // motionless stand because a chain was constructed 0.10 rad outside its own floor. Every
      // stop below stands `jointMargin` outside a range that contains zero.
      const up = new Vector3();
      AXIS_UP.rotateByQuaternionToRef(facing, up);

      const ball = capsulePart(ctx.scene, {
        name: `${ctx.name}.waist`,
        position: socket.world.clone(),
        rotation: facing,
        height: W.ballLength,
        radius: W.ballRadius,
        mass: W.ballMass,
        layer: ctx.layers.body,
        collidesWith: ctx.layers.bodyCollidesWith,
        material: stone,
        visible: false,
      });
      const core = boxPart(ctx.scene, {
        name: `${ctx.name}.core`,
        position: socket.world.add(up.scale(T.coreHeight / 2)),
        rotation: facing,
        size: new Vector3(T.coreWidth, T.coreHeight, T.coreDepth),
        mass: T.coreMass,
        layer: ctx.layers.body,
        collidesWith: ctx.layers.bodyCollidesWith,
        material: stone,
        visible: false,
      });
      for (const part of [ball, core]) {
        part.body.setLinearDamping(W.linearDamping);
        part.body.setAngularDamping(W.angularDamping);
      }

      // --- the waist ------------------------------------------------------------------------
      //
      // Twist at the root and lean above it, so a lean happens in whatever plane the twist chose
      // -- which is what a trunk does, and is the same ordering `arm-core.ts` uses for its yaw
      // collar and shoulder pitch. Both pivots are the socket itself, so the waist is one place.
      let twistJoint: Physics6DoFConstraint | null = joint(ctx.scene, socket.mount, ball, {
        pivotParent: socket.local,
        pivotChild: Vector3.Zero(),
        axisParent: AXIS_UP.clone(),
        axisChild: AXIS_UP.clone(),
        perpParent: AXIS_FORWARD.clone(),
        perpChild: AXIS_FORWARD.clone(),
        swing: { x: { min: -(T.twistMax + W.jointMargin), max: T.twistMax + W.jointMargin } },
        damping: W.motorDamping,
      });
      // The lean, about the ball's own lateral -- which the twist has already turned. A positive
      // rotation about +X carries the core's +Y toward +Z, so a positive joint angle is the trunk
      // tipping *forward*, which is what `trunkLean` of +1 means. That identity is why there is no
      // sign constant here: the joint's sense and the command's sense are already the same.
      let leanJoint: Physics6DoFConstraint | null = joint(ctx.scene, ball, core, {
        pivotParent: Vector3.Zero(),
        pivotChild: new Vector3(0, -T.coreHeight / 2, 0),
        swing: { x: { min: -(T.leanMax + W.jointMargin), max: T.leanMax + W.jointMargin } },
        damping: W.motorDamping,
      });
      twistJoint.setAxisMotorType(HINGE, PhysicsConstraintMotorType.POSITION);
      twistJoint.setAxisMotorTarget(HINGE, 0);
      twistJoint.setAxisMotorMaxForce(HINGE, W.twistTorque);
      leanJoint.setAxisMotorType(HINGE, PhysicsConstraintMotorType.POSITION);
      leanJoint.setAxisMotorTarget(HINGE, 0);
      leanJoint.setAxisMotorMaxForce(HINGE, W.leanTorque);

      // --- parts ----------------------------------------------------------------------------
      const parts: readonly GolemPart[] = Object.freeze([
        Object.freeze({
          id: ball.name,
          part: ball,
          shell: ballShell(ctx.scene, {
            name: ball.name, host: ball.mesh, radius: W.ballRadius,
            // Across, because this bearing's *visible* axis is the lean it carries; the twist
            // below it turns about the column and has no band of its own to draw.
            band: "across", materials: ctx.materials,
          }),
          health: W.ballHealth,
          vitalityWeight: W.ballVitalityWeight,
          fatal: false,
        }),
        Object.freeze({
          id: core.name,
          part: core,
          shell: torsoShell(ctx.scene, {
            name: core.name, host: core.mesh, tuning: T, materials: ctx.materials,
          }),
          health: T.coreHealth,
          vitalityWeight: T.coreVitalityWeight,
          // **Not fatal, and that is the body plan rather than an oversight.** The head is the
          // fatal part; a torso carries the vitality core, so losing it is losing most of what
          // keeps a golem going without being the single blow that ends it.
          fatal: false,
          armour: T.coreArmour,
        }),
      ]) as readonly GolemPart[];

      // --- the envelope -----------------------------------------------------------------------
      //
      // Lean first, because the readout takes its settle, arrival and overshoot from the first
      // published axis and `TORSO_WAIST.settledBand` is stated in radians against it.
      const envelopeAxes: readonly ModuleAxisEnvelope[] = Object.freeze([
        Object.freeze({
          id: "lean", unit: "rad" as const,
          min: -T.leanMax, max: T.leanMax, rate: W.leanRate,
        }),
        Object.freeze({
          id: "twist", unit: "rad" as const,
          min: -T.twistMax, max: T.twistMax, rate: W.twistRate,
        }),
      ]);
      const envelope: ModuleEnvelope = Object.freeze({
        axes: envelopeAxes,
        // How far the business end travels from the socket: the neck frame, which is the point a
        // head is carried at and the point the readout measures.
        reach: T.coreHeight / 2 + T.neckHeight,
        // A trunk cannot be asked for a stroke. It is a pose, held, at a finite torque -- and
        // `reachable` is null because its command is a pair of angles rather than a point.
        strokes: NO_STROKES,
        reachable: null,
        settledBand: W.settledBand,
      });

      // --- state ------------------------------------------------------------------------------
      let wantedLean = 0;
      let wantedTwist = 0;
      let commandedLean = 0;
      let commandedTwist = 0;
      let severed = false;

      const axisViews = [
        { id: "lean", commanded: 0, achieved: 0 },
        { id: "twist", commanded: 0, achieved: 0 },
      ];
      const axes: readonly EffectorAxisView[] = Object.freeze(axisViews);

      const scratch = {
        local: new Vector3(),
        read: new Vector3(),
        neck: new Vector3(),
        commandedNeck: new Vector3(),
        socket: new Vector3(),
        inverse: new Quaternion(),
      };
      const clamp = (value: number, low: number, high: number): number =>
        value < low ? low : value > high ? high : value;
      const rotate = (local: Vector3, by: Quaternion | null, into: Vector3): Vector3 => {
        local.rotateByQuaternionToRef(by ?? Quaternion.Identity(), into);
        return into;
      };
      const mountRotation = (): Quaternion =>
        socket.mount.mesh.rotationQuaternion ?? Quaternion.Identity();

      /**
       * Where the waist socket is **now**, world, into a ref this module owns.
       *
       * `GolemSocket.world` is by contract the socket's position *at construction*, which is what
       * a joint has to be built against. The bench's stand never moves, but Session 08's
       * locomotion root walks -- so a commanded point taken from the build-time world would be
       * the pose the trunk should hold on a golem that stayed where it was put. Recomputed from
       * `mesh.position` and `mesh.rotationQuaternion` and nothing else.
       */
      const socketWorld = (): Vector3 => {
        rotate(socket.local, socket.mount.mesh.rotationQuaternion, scratch.socket);
        return scratch.socket.addInPlace(socket.mount.mesh.position);
      };

      /**
       * The twist the ball actually achieved, radians.
       *
       * The ball's own +Z expressed in the mount's frame is `(sin t, 0, cos t)` for a rotation of
       * `t` about the shared +Y, so an `atan2` recovers it with no convention left to get
       * backwards. The mount's inverse is taken every step rather than cached because Session 08's
       * locomotion root turns, and this arithmetic has to still be right when it does.
       */
      const achievedTwist = (): number => {
        rotate(AXIS_FORWARD, ball.mesh.rotationQuaternion, scratch.read);
        mountRotation().conjugateToRef(scratch.inverse);
        rotate(scratch.read, scratch.inverse, scratch.local);
        return Math.atan2(scratch.local.x, scratch.local.z);
      };

      /** The lean the core achieved: its own +Y in the ball's frame is `(0, cos l, sin l)`. */
      const achievedLean = (): number => {
        rotate(AXIS_UP, core.mesh.rotationQuaternion, scratch.read);
        (ball.mesh.rotationQuaternion ?? Quaternion.Identity()).conjugateToRef(scratch.inverse);
        rotate(scratch.read, scratch.inverse, scratch.local);
        return Math.atan2(scratch.local.z, scratch.local.y);
      };

      /** Where the neck frame actually is, world, into a ref this module owns. */
      const neckPoint = (): Vector3 => {
        scratch.neck.set(0, T.neckHeight, 0);
        rotate(scratch.neck, core.mesh.rotationQuaternion, scratch.neck);
        return scratch.neck.addInPlace(core.mesh.position);
      };

      /**
       * Where the neck frame is being *asked* to be, world.
       *
       * The commanded pose composed in the order the chain is built -- lean inside twist inside
       * the mount -- so a point `H` up the trunk lands at
       * `(H sin l sin t, H cos l, H sin l cos t)` in the mount's frame. Composed rather than read
       * back, because this is the *command* and reading it off the bodies would make the readout's
       * tip-to-command error identically zero.
       */
      const commandedNeck = (): Vector3 => {
        const height = T.coreHeight / 2 + T.neckHeight;
        const across = Math.sin(commandedLean);
        scratch.local.set(
          height * across * Math.sin(commandedTwist),
          height * Math.cos(commandedLean),
          height * across * Math.cos(commandedTwist),
        );
        rotate(scratch.local, mountRotation(), scratch.commandedNeck);
        return scratch.commandedNeck.addInPlace(socketWorld());
      };

      const view: EffectorView = {
        slot: socket.slot,
        get tip(): Vector3 { return neckPoint(); },
        get commandedTip(): Vector3 { return commandedNeck(); },
        get axes(): readonly EffectorAxisView[] { return axes; },
        // A trunk runs no velocity event, so it is never in one. `EffectorStroke` is the phase of
        // a stroke and "idle" is the honest answer for a module that has none.
        get stroke(): "idle" { return "idle"; },
        get anchor(): Vector3 | null { return null; },
        get anchorStray(): number | null { return null; },
        get edge(): Vector3 | null { return null; },
        // Session 04's mace reading, appended to the record while Session 07 was being written.
        // A trunk grips nothing and nothing trails it, so null is what the field is for -- the
        // same answer, for the same reason, as `anchor` and `edge` above.
        get gripStray(): number | null { return null; },
      };

      // --- the sockets it carries --------------------------------------------------------------
      const sockets = new Map<GolemSlot, GolemSocket>();
      const socketFor = (slot: GolemSlot): GolemSocket => {
        const hand = effectorSlot(slot);
        const outboard = slot === "secondary" ? -1 : 1;
        const local = hand
          ? new Vector3(T.socketSide * outboard, T.socketHeight, T.socketFront)
          : new Vector3(0, T.neckHeight, 0);
        if (!hand && slot !== "head") {
          throw new Error(`${id}: a torso carries primary, secondary and head, not ${slot}`);
        }
        const world = new Vector3();
        rotate(local, core.mesh.rotationQuaternion, world);
        world.addInPlace(core.mesh.position);
        return Object.freeze({
          slot,
          mount: core,
          local,
          world,
          rotation: (core.mesh.rotationQuaternion ?? Quaternion.Identity()).clone(),
          outboard,
        });
      };

      const writeMotors = (): void => {
        twistJoint?.setAxisMotorTarget(HINGE, commandedTwist);
        leanJoint?.setAxisMotorTarget(HINGE, commandedLean);
      };

      return Object.freeze({
        parts,
        // A trunk hits nobody. It is anatomy, and anatomy is what gets hit.
        strikers: Object.freeze([]) as readonly Striking[],

        command(next: TorsoCommand): void {
          if (severed) return;
          // Clamped into the envelope here, before the rate limiter and long before a motor --
          // frozen rule 3, so there is no refusal branch anywhere downstream and a command outside
          // the range is simply not a pose this trunk has.
          wantedLean = clamp(next.trunkLean, -1, 1) * T.leanMax;
          wantedTwist = clamp(next.trunkTwist, -1, 1) * T.twistMax;
        },

        step(dt: number): void {
          if (severed) return;
          commandedLean = slewTowards(commandedLean, wantedLean, W.leanRate, dt);
          commandedTwist = slewTowards(commandedTwist, wantedTwist, W.twistRate, dt);
          writeMotors();
          axisViews[0].commanded = commandedLean;
          axisViews[0].achieved = achievedLean();
          axisViews[1].commanded = commandedTwist;
          axisViews[1].achieved = achievedTwist();
        },

        envelope: () => envelope,
        view: () => view,

        socket(slot: GolemSlot): GolemSocket {
          const known = sockets.get(slot);
          if (known) return known;
          const made = socketFor(slot);
          sockets.set(slot, made);
          return made;
        },

        sever(): void {
          if (severed) return;
          severed = true;
          // The waist goes with the trunk. A motor still driving a body that has been cut off is
          // the haunting the Warrior's anchors produce when an arm comes away from them.
          twistJoint?.dispose();
          twistJoint = null;
          leanJoint?.dispose();
          leanJoint = null;
        },

        dispose(): void {
          severed = true;
          twistJoint?.dispose();
          twistJoint = null;
          leanJoint?.dispose();
          leanJoint = null;
          for (const part of [core, ball]) {
            part.body.dispose();
            part.shape.dispose();
            // The shell is parented to the collider mesh, so this takes it too -- and
            // `false, false` leaves the palette's materials standing, which is the rule a carried
            // mesh has to obey or disposing one module removes another's texture.
            part.mesh.dispose(false, false);
          }
        },
      });
    },
  });
}
