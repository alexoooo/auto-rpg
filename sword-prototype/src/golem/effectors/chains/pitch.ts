import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import {
  PhysicsConstraintAxis,
  PhysicsConstraintMotorType,
} from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";
import type { Physics6DoFConstraint } from "@babylonjs/core/Physics/v2/physicsConstraint.js";

import type { HandCursor, HandIntent } from "../../../mind.ts";
import { capsulePart, joint } from "../../../rig.ts";
import { slewTowards } from "../../anchor-drive.ts";
import { CHAIN_PITCH } from "../../config.ts";
import { materialForGolemRole } from "../../materials.ts";
import {
  defineChain,
  type BuiltChain,
  type EffectorAxisView,
  type EffectorStroke,
  type EffectorStrokeKind,
  type GolemMount,
  type GolemPart,
  type ModuleBuild,
  type ModuleEnvelope,
} from "../../module.ts";

const HINGE = PhysicsConstraintAxis.ANGULAR_X;

/** What rung 1 can be asked for: a chop, and a guard held. */
const PITCH_STROKES: readonly EffectorStrokeKind[] =
  Object.freeze<EffectorStrokeKind[]>(["thrust", "cover"]);

/**
 * How a terminal is bolted to the end of the link, and why the edge lies where it does.
 *
 * `perp` is where the terminal's own +Y points: the link's -Y, so a blade continues straight
 * out along the limb instead of doubling back up through it. Getting that backwards on the
 * Warrior put the blade back up through the forearm, which is invisible in a body that does
 * not collide with itself and baffling the moment you try to swing.
 *
 * `axis` is where the terminal's own +X -- its **edge** -- points, and on a one-axis chain that
 * is a decision the chain has to make because the golem cannot: `roll` is what says which way
 * an edge faces and only a chain with a roll axis can express it, so rung 1 has to choose once,
 * at build, and live with it. The link's -Z is the tangent of the chain's own arc: rotating the
 * link about the hinge by an angle carries `(0,0,-1)` to exactly the unit vector the tip is
 * travelling along at that instant, so **the edge leads the chop for the whole of the stroke**
 * rather than at one point in it. That identity is the reason the number is -1 and not +1, and
 * it is a fact about this chain's swing plane, which is why the chain owns it and the blade
 * does not.
 */
const LINK_MOUNT: GolemMount = Object.freeze({
  axis: new Vector3(0, 0, -1),
  perp: new Vector3(0, -1, 0),
});

/** `pointerY` runs -1 at the bottom of the window to +1 at the top. */
const pitchForPointer = (pointerY: number): number => {
  const P = CHAIN_PITCH;
  const t = pointerY < -1 ? -1 : pointerY > 1 ? 1 : pointerY;
  return P.pitchMin + ((t + 1) / 2) * (P.pitchMax - P.pitchMin);
};

/**
 * And back again: where the cursor has to sit for this pitch to be the one commanded.
 *
 * Written here rather than at the caller, immediately beside the forward mapping, because a
 * cursor inverse spelled somewhere else is the defect `tests/handover.test.mjs` records paying
 * for -- the plausible inverse and the correct one agreed on one side of centre and nobody
 * noticed until both sides were sampled.
 */
const pointerForPitch = (pitch: number): number => {
  const P = CHAIN_PITCH;
  const span = P.pitchMax - P.pitchMin;
  const t = span === 0 ? 0 : ((pitch - P.pitchMin) / span) * 2 - 1;
  return t < -1 ? -1 : t > 1 ? 1 : t;
};

/**
 * Rung 1, `pitch`: one hinge at the socket about the side axis, and a short link.
 *
 * **The whole chain is one number.** Pitch is measured as lift from hanging straight down, so 0
 * is a limb at rest, pi/2 is a limb held out horizontally in front, and the range stops short
 * of folding back over the stand. `pointerY` spans it, continuously, and that is the entire
 * command surface: `guard` and `thrust` used to raise this limb to a preset and run a chop at
 * it, and since Session 12 they do nothing here at all. Nothing here reads `pointerX`, `roll` or
 * `wristBend` either, which is the frozen rule "a chain that has no use for a field ignores
 * it".
 *
 * **There is no redundancy at all, by construction, and that is the point.** The overview names
 * a spare axis as one of four *candidate* causes of the elbow-behind-the-back that three body
 * experiments never fixed: a six-axis hand pin on a seven-axis arm has one axis over, so a
 * command near the edge of the envelope resolves to the least-violation pose rather than to the
 * pose anybody meant. Rung 0 and rung 1 exist partly to tell that candidate apart from the
 * other three, and they can only do that by having no spare axis to blame. Every reachable
 * pitch here has exactly one pose.
 *
 * **What makes it not a robot arm is three things and they are the three the bench measures.**
 * For a one-axis chain, task space and joint space are the same number -- so the joint-space
 * position motor that the overview names as the second candidate cause is unavoidable here, and
 * arguing about it would be arguing about arithmetic. What is left is:
 *
 * 1. **The torque cap.** `CHAIN_PITCH.motorTorque` is a ceiling, not a stiffness. A position
 *    motor at the torque needed to move stone arrives instantly and stops dead; a finite one
 *    lags, carries past and comes back.
 * 2. **The target rate limit.** `CHAIN_PITCH.targetRate` bounds how fast the *commanded* angle
 *    may move, so a flicked cursor is a sweep and not a snap. A Warrior's anchor has no such
 *    limit, which is exactly why it keyframes onto its commanded pose on the first control step
 *    and reads 77 m/s of tip speed while standing still.
 * 3. **Nothing is scripted, and the follow-through is what proves it.** This used to read "the
 *    stroke shape", and what it described was a chop: `thrust` swapped the hinge to VELOCITY,
 *    drove it down at a fixed 12 rad/s, dropped the torque so the limb coasted, and handed the
 *    limb back. It carried past its target, so it *looked* like physics, and it was a script --
 *    a button that took the limb away from its commander for 0.09 s and moved it at its own
 *    speed. Session 12 deleted it on the owner's instruction that the mind must have "free
 *    control of both arms, limited only by the physics and the intelligence of the policy". The
 *    follow-through did not go with it: driven from pitchMax to pitchMin at the rate limit, the
 *    limb still swings 0.06 rad past its own floor and comes back, because a finite torque
 *    against real mass is what was producing that overshoot the whole time.
 *
 * Each of those three carries its sweep in `src/golem/config.ts`, as the house rule requires,
 * and none of them is a claim that the result looks right. That is the owner's to say.
 */
export const pitchChain = defineChain({
  id: "pitch",
  axes: 1,
  label: "pitch - one hinge",
  massKg: CHAIN_PITCH.linkMass,

  build(ctx: ModuleBuild): BuiltChain {
    const P = CHAIN_PITCH;
    const name = `${ctx.name}.link`;
    const socket = ctx.socket;
    const facing = socket.rotation;

    // The link hangs straight down from the socket, its own +Y pointing back up at the socket
    // exactly as every Warrior bone does. Building it anywhere else would put the hinge's two
    // frames at odds at construction, which is a violation the solver clears by throwing the
    // limb.
    const down = new Vector3();
    new Vector3(0, -1, 0).rotateByQuaternionToRef(facing, down);
    const position = socket.world.add(down.scale(P.linkLength / 2));

    const part = capsulePart(ctx.scene, {
      name,
      position,
      rotation: facing,
      height: P.linkLength,
      radius: P.linkRadius,
      mass: P.linkMass,
      layer: ctx.layers.body,
      collidesWith: ctx.layers.bodyCollidesWith,
      material: materialForGolemRole(ctx.materials, "shell"),
    });
    part.body.setLinearDamping(P.linearDamping);
    part.body.setAngularDamping(P.angularDamping);

    // A hinge is a ball joint with two axes pinned, through the one constraint type the whole
    // rig uses. The joint angle is the negative of the pitch: negative ANGULAR_X carries the
    // limb forward, which is the same sign the Warrior's elbow is written in.
    let hinge: Physics6DoFConstraint | null = joint(ctx.scene, socket.mount, part, {
      pivotParent: socket.local,
      pivotChild: new Vector3(0, P.linkLength / 2, 0),
      // The stops stand outside the commanded range on both sides. A command that sits against
      // a joint stop is a motor and a limit pushing at each other every step, which is the buzz
      // the Warrior's wrist was rewritten to get rid of.
      swing: { x: { min: -P.jointMax, max: -P.jointMin } },
    });

    // **The command starts at the build pose, not at the cursor.** The link is built hanging
    // straight down, so a command initialised anywhere else would be a step the rate limiter
    // has to run on the very first control step -- which is precisely how a Warrior arm
    // keyframes onto its commanded pose and reads 77 m/s of tip speed in a fighter that never
    // swings. Starting here and slewing up makes the first move a move.
    let commandedPitch = 0;
    let wantedPitch = P.restPitch;
    let severed = false;
    /** Set once by `unmotorise`: this limb is carried by something rather than driven. */
    let passive = false;

    const axisView = { id: "pitch", commanded: commandedPitch, achieved: commandedPitch };
    const axes: readonly EffectorAxisView[] = Object.freeze([axisView]);
    const envelope: ModuleEnvelope = Object.freeze({
      axes: Object.freeze([Object.freeze({
        id: "pitch", unit: "rad" as const, min: P.pitchMin, max: P.pitchMax, rate: P.targetRate,
      })]),
      reach: P.linkLength,
      // A chop and a raised guard, and no cut: a cut is the target swept along an arc, and a
      // one-axis chain has no arc to sweep it along. As on rung 3 this list says what the module
      // is *good for* and not what it will run for you -- see `ARM_STROKES` in `arm-core.ts` for
      // the distinction and for why Session 12 left both lists standing after taking the scripts
      // out from under them. `reachable` is null because this chain's command is an angle rather
      // than a point.
      strokes: PITCH_STROKES,
      reachable: null,
      settledBand: P.settledBand,
    });

    const scratch = {
      limb: new Vector3(),
      local: new Vector3(),
      inverse: new Quaternion(),
      end: new Vector3(),
      direction: new Vector3(),
      socket: new Vector3(),
    };

    /**
     * Where the hinge's socket is **now**, world, into a ref this chain owns.
     *
     * The hinge itself needs nothing of this -- it is a constraint between two bodies and follows
     * the mount wherever the mount goes. What needs it is the *published* commanded point: taken
     * from `GolemSocket.world`, which is by contract the build-time position, the readout's
     * tip-to-command line would grow by however far a walking golem had travelled and would read
     * as a tracking failure in a chain that was tracking perfectly.
     */
    const socketWorld = (): Vector3 => {
      socket.local.rotateByQuaternionToRef(
        socket.mount.mesh.rotationQuaternion ?? Quaternion.Identity(), scratch.socket,
      );
      return scratch.socket.addInPlace(socket.mount.mesh.position);
    };

    /**
     * The pitch the solver actually achieved, read from the link's own transform.
     *
     * `mesh.rotationQuaternion` and nothing else -- see `RigidStrike` for the full account of
     * why a world matrix must not be touched here. The link's local -Y is the limb's own
     * direction; carried into the mount's frame it gives a pitch straight out of an `atan2`,
     * with no convention left to get backwards. The inverse of the mount's rotation is taken
     * every step rather than cached because Session 05's torso leans and this arithmetic has to
     * still be right when it does.
     */
    const achievedPitch = (): number => {
      new Vector3(0, -1, 0).rotateByQuaternionToRef(
        part.mesh.rotationQuaternion ?? Quaternion.Identity(), scratch.limb,
      );
      (socket.mount.mesh.rotationQuaternion ?? Quaternion.Identity())
        .conjugateToRef(scratch.inverse);
      scratch.limb.rotateByQuaternionToRef(scratch.inverse, scratch.local);
      return Math.atan2(scratch.local.z, -scratch.local.y);
    };

    const writeMotor = (): void => {
      if (!hinge || severed || passive) return;
      // **One motor mode, written once at build, and a target every step.** The chop used to
      // swap this hinge from POSITION to VELOCITY for 0.09 s, drive it at a fixed 12 rad/s and
      // swap it back -- during which the commanded pitch went on slewing and went on being
      // ignored, because the motor it was written to was no longer in position mode. That is the
      // one-axis version of the lock-out `arm-core.ts` records: a chain deciding, on a button,
      // that it would rather move at its own speed than at its commander's. Rung 1's speed now
      // comes from how fast the commander moves `wantedPitch` against `P.targetRate` and the
      // torque cap, which is the same sentence rung 3 answers to.
      hinge.setAxisMotorTarget(HINGE, -commandedPitch);
    };
    // **Armed once, here, and never re-armed.** The mode and the ceiling used to be written
    // inside `writeMotor` behind an `appliedPhase !== phase` guard, which armed the motor on the
    // first call as a side effect of the chop machine's bookkeeping. With the chop gone that
    // guard went too, and a motor whose type is never set is a hinge with no drive at all -- a
    // limb that hangs. Writing a native solver object once at build rather than 240 times a
    // second is also the rule `LOCOMOTION_BIPED.armMotors` states for the same reason.
    hinge?.setAxisMotorType(HINGE, PhysicsConstraintMotorType.POSITION);
    hinge?.setAxisMotorMaxForce(HINGE, P.motorTorque);
    writeMotor();

    return Object.freeze({
      parts: Object.freeze([
        Object.freeze({
          id: name,
          part,
          shell: Object.freeze([part.mesh]),
          health: P.linkHealth,
          vitalityWeight: P.linkVitalityWeight,
          fatal: false,
        }),
      ]) as readonly GolemPart[],

      weld: Object.freeze({
        link: part,
        pivot: new Vector3(0, -P.linkLength / 2, 0),
        world: socket.world.add(down.scale(P.linkLength)),
        rotation: facing.clone(),
        mount: LINK_MOUNT,
      }),
      ownTerminal: null,
      reach: P.linkLength,

      /**
       * One axis, one channel, no branch on either button.
       *
       * `reach` is not read here and neither is `pointerX`: this rung has one degree of freedom
       * and `pointerY` is it, which is the frozen rule "a chain that has no use for a field
       * ignores it" answered honestly rather than by inventing a use.
       */
      command(next: HandIntent): void {
        if (severed) return;
        wantedPitch = pitchForPointer(next.pointerY);
      },

      step(dt: number): void {
        if (severed || passive || !hinge) return;
        commandedPitch = slewTowards(commandedPitch, wantedPitch, P.targetRate, dt);
        writeMotor();

        axisView.commanded = commandedPitch;
        axisView.achieved = achievedPitch();
      },

      envelope: () => envelope,
      axes: () => axes,
      // Always idle: this chain runs no scripted velocity event, so it is never inside one.
      // See `ArmCore.stroke` for the whole of the argument and for what it costs the readout.
      stroke: (): EffectorStroke => "idle",
      // No anchor on this rung: the hinge's own motor is the drive, so there is no second frame
      // to stray from. Session 03's chains have one and fill both of these in.
      anchor: () => null,
      anchorStray: () => null,

      /**
       * The seed a takeover needs: one axis, so one number.
       *
       * `pointerX`, `roll` and `wristBend` are zero because nothing on this rung reads them --
       * the frozen rule "a chain that has no use for a field ignores it", answered from the
       * other side. `reach` joins that list here, and on this rung it really is a zero rather
       * than an omission: there is one link on one hinge and no distance to command. Taken from
       * `commandedPitch`, which is where the rate limiter has got to rather than where the cursor
       * was, so the first command after a handover is the command the outgoing driver had left
       * standing.
       */
      cursor: (): HandCursor => ({
        pointerX: 0, pointerY: pointerForPitch(commandedPitch), reach: 0, roll: 0, wristBend: 0,
      }),

      commandedEnd(distanceFromSocket: number): Vector3 {
        // The commanded limb direction at the commanded pitch, in the mount's frame, carried
        // out to whatever distance the caller is asking about.
        scratch.direction.set(0, -Math.cos(commandedPitch), Math.sin(commandedPitch));
        scratch.direction.rotateByQuaternionToRef(
          socket.mount.mesh.rotationQuaternion ?? Quaternion.Identity(), scratch.end,
        );
        return scratch.end.scaleInPlace(distanceFromSocket).addInPlace(socketWorld());
      },

      /**
       * Drop the torque to nothing and keep the hinge and its stops.
       *
       * On this rung the drive *is* the joint motor, so there is no anchor to release and
       * letting go means a ceiling of zero rather than a constraint disposed. The stops stay,
       * which is the point: a trailing limb is still an arm with a range, not a rope.
       */
      unmotorise(): void {
        if (!hinge || severed || passive) return;
        passive = true;
        hinge.setAxisMotorType(HINGE, PhysicsConstraintMotorType.NONE);
        hinge.setAxisMotorMaxForce(HINGE, 0);
      },

      sever(): void {
        if (severed) return;
        severed = true;
        // The hinge goes with the limb. A motor still driving a link that has been cut off is
        // the same haunting the Warrior's anchors produce when an arm comes away from them.
        hinge?.dispose();
        hinge = null;
      },

      dispose(): void {
        severed = true;
        hinge?.dispose();
        hinge = null;
        part.body.dispose();
        part.shape.dispose();
        part.mesh.dispose(false, false);
      },
    });
  },
});
