import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import {
  PhysicsConstraintAxis,
  PhysicsConstraintMotorType,
} from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";
import type { Physics6DoFConstraint } from "@babylonjs/core/Physics/v2/physicsConstraint.js";

import type { HandIntent } from "../../../mind.ts";
import { capsulePart, joint } from "../../../rig.ts";
import { slewTowards } from "../../anchor-drive.ts";
import { CHAIN_PITCH } from "../../config.ts";
import { materialForGolemRole } from "../../materials.ts";
import {
  defineChain,
  type BuiltChain,
  type EffectorAxisView,
  type EffectorStroke,
  type GolemMount,
  type GolemPart,
  type ModuleBuild,
  type ModuleEnvelope,
} from "../../module.ts";

const HINGE = PhysicsConstraintAxis.ANGULAR_X;

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
 * Rung 1, `pitch`: one hinge at the socket about the side axis, and a short link.
 *
 * **The whole chain is one number.** Pitch is measured as lift from hanging straight down, so 0
 * is a limb at rest, pi/2 is a limb held out horizontally in front, and the range stops short
 * of folding back over the stand. `pointerY` spans it; `guard` raises to a preset; `thrust`
 * runs a chop. Nothing here reads `pointerX`, `roll` or `wristBend`, which is the frozen rule
 * "a chain that has no use for a field ignores it".
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
 * 3. **The stroke shape.** `thrust` is a velocity event, not a pose sequence: the motor is
 *    switched to VELOCITY and driven down, then the torque is dropped so the limb coasts
 *    through on its own momentum, and only then does the position motor take it back to
 *    whatever the cursor has been asking for the whole time. A pose sequence stops where the
 *    pose says; this carries past and that is the follow-through.
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
    let phase: EffectorStroke = "idle";
    let phaseTime = 0;
    let appliedPhase: EffectorStroke | null = null;
    let thrustHeld = false;
    let severed = false;

    const axisView = { id: "pitch", commanded: commandedPitch, achieved: commandedPitch };
    const axes: readonly EffectorAxisView[] = Object.freeze([axisView]);
    const envelope: ModuleEnvelope = Object.freeze({
      axes: Object.freeze([Object.freeze({
        id: "pitch", unit: "rad" as const, min: P.pitchMin, max: P.pitchMax, rate: P.targetRate,
      })]),
      reach: P.linkLength,
    });

    const scratch = {
      limb: new Vector3(),
      local: new Vector3(),
      inverse: new Quaternion(),
      end: new Vector3(),
      direction: new Vector3(),
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
      if (!hinge || severed) return;
      if (phase === "idle") {
        if (appliedPhase !== "idle") {
          hinge.setAxisMotorType(HINGE, PhysicsConstraintMotorType.POSITION);
          hinge.setAxisMotorMaxForce(HINGE, P.motorTorque);
        }
        hinge.setAxisMotorTarget(HINGE, -commandedPitch);
      } else if (appliedPhase !== phase) {
        hinge.setAxisMotorType(HINGE, PhysicsConstraintMotorType.VELOCITY);
        // Positive joint velocity is the limb going *down*, because the joint angle is the
        // negative of the pitch. A chop is downward.
        hinge.setAxisMotorTarget(HINGE, P.chop.driveRate);
        hinge.setAxisMotorMaxForce(
          HINGE, phase === "drive" ? P.motorTorque : P.chop.followTorque,
        );
      }
      appliedPhase = phase;
    };
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

      command(next: HandIntent): void {
        if (severed) return;
        wantedPitch = next.guard ? P.guardPitch : pitchForPointer(next.pointerY);
        // A stroke is an edge, not a level -- the same rule `buttons.ts` states for a press.
        // Holding the button does not chain chops, and a chop that is already running is not
        // restarted by a second press: a velocity event has a length and re-triggering it
        // halfway through would make it a pose sequence with extra steps.
        if (next.thrust && !thrustHeld && phase === "idle") {
          phase = "drive";
          phaseTime = 0;
        }
        thrustHeld = next.thrust;
      },

      step(dt: number): void {
        if (severed || !hinge) return;
        // The command keeps moving through a stroke, so that when the stroke ends the limb
        // returns to where the cursor is *now* rather than to where it was when the button
        // went down.
        commandedPitch = slewTowards(commandedPitch, wantedPitch, P.targetRate, dt);

        if (phase !== "idle") {
          phaseTime += dt;
          const limit = phase === "drive" ? P.chop.driveSeconds : P.chop.followSeconds;
          if (phaseTime >= limit) {
            phase = phase === "drive" ? "follow" : "idle";
            phaseTime = 0;
          }
        }
        writeMotor();

        axisView.commanded = commandedPitch;
        axisView.achieved = achievedPitch();
      },

      envelope: () => envelope,
      axes: () => axes,
      stroke: () => phase,
      // No anchor on this rung: the hinge's own motor is the drive, so there is no second frame
      // to stray from. Session 03's chains have one and fill this in.
      anchorStray: () => null,

      commandedEnd(distanceFromSocket: number): Vector3 {
        // The commanded limb direction at the commanded pitch, in the mount's frame, carried
        // out to whatever distance the caller is asking about.
        scratch.direction.set(0, -Math.cos(commandedPitch), Math.sin(commandedPitch));
        scratch.direction.rotateByQuaternionToRef(
          socket.mount.mesh.rotationQuaternion ?? Quaternion.Identity(), scratch.end,
        );
        return scratch.end.scaleInPlace(distanceFromSocket).addInPlace(socket.world);
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
