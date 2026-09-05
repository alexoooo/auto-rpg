import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Physics6DoFConstraint } from "@babylonjs/core/Physics/v2/physicsConstraint.js";

import type { HandCursor } from "../../../mind.ts";
import { COLLIDES, LAYER } from "../../../physics.ts";
import { capsulePart, joint } from "../../../rig.ts";
import { CHAIN_NONE } from "../../config.ts";
import { materialForGolemRole } from "../../materials.ts";
import {
  NO_ENVELOPE_AXES,
  NO_STROKES,
  defineChain,
  effectorSlot,
  weldRotation,
  type BuiltChain,
  type EffectorAxisView,
  type GolemMount,
  type GolemPart,
  type ModuleBuild,
} from "../../module.ts";
import { RigidStrike } from "../striker.ts";

/** No axes, so nothing here is ever read as a command. Declared once so both callers agree. */
const NO_AXES: readonly EffectorAxisView[] = Object.freeze([]);

/** The centre of the window: the seed a chain with no cursor mapping owes a takeover. */
const NO_CURSOR: HandCursor = Object.freeze({ pointerX: 0, pointerY: 0, roll: 0, wristBend: 0 });

/**
 * How the cap is bolted to the socket.
 *
 * `perp` is where the cap's own +Y points, and the cap's +Y runs base to tip like every other
 * golem striker, so this hangs it straight down out of the socket. `axis` is where its +X
 * points and it decides nothing at all here: a mass bite has no edge to place and no way to
 * hold it wrong, so this is the arbitrary half of an orthonormal pair rather than a decision
 * anybody made.
 */
const CAP_MOUNT: GolemMount = Object.freeze({
  axis: new Vector3(0, 0, -1),
  perp: new Vector3(0, -1, 0),
});

/**
 * Rung 0, `none`: a socket with a cap on it and no driven axis whatsoever.
 *
 * It exists for two reasons and neither of them is that anybody wants to fight with it.
 *
 * **The body plan has to be complete without effectors.** A golem with an empty effector socket
 * is a golem with a hole in it, and every later session -- assembly, the mind, loot -- would
 * have had to carry a null branch for the slot. This is the option that fills it.
 *
 * **It is the bench's noise floor.** Tip wander at rest on something that *cannot move* is a
 * measurement of the harness rather than of a chain, and every settle, overshoot and wander
 * figure taken on a driven chain has to be read against it. Two things make that measurement
 * real rather than decorative:
 *
 * - **`pl.setActivationControl(body, 1)` before believing it.** Havok deactivates a body at
 *   rest, so a reading taken after the cap settles reads a perfect zero no matter how badly it
 *   would shake if it were awake -- which is a sleeping body hiding every steady-state defect,
 *   not a still one. The bench forces activation; see `scripts/golem-bench.mjs`.
 * - **A rigid weld, not a drive.** There is no motor here to fight a contact, no anchor to
 *   stray from, and no target to converge on, so anything the readout sees is the solver, the
 *   step size and the harness. That is the point.
 *
 * The cap belongs to this chain rather than being a terminal off the shelf, because there is no
 * link to weld a terminal onto: rung 0 is a socket, and a socket is what the cap is bolted to.
 * So `weld` is null and no chain-terminal pair can name this rung.
 */
export const noneChain = defineChain({
  id: "none",
  axes: 0,
  label: "none - a capped socket",
  massKg: CHAIN_NONE.capMass,

  build(ctx: ModuleBuild): BuiltChain {
    const C = CHAIN_NONE;
    const name = `${ctx.name}.cap`;
    const socket = ctx.socket;

    // Built in the frame the weld demands, like every other golem weld: two frames that
    // disagree at construction is a violation the solver clears by flinging the thing.
    const rotation = weldRotation(CAP_MOUNT, socket.rotation);
    const along = new Vector3();
    new Vector3(0, 1, 0).rotateByQuaternionToRef(rotation, along);
    const position = socket.world.add(along.scale(C.capLength / 2));

    const part = capsulePart(ctx.scene, {
      name,
      position,
      rotation,
      height: C.capLength,
      radius: C.capRadius,
      mass: C.capMass,
      layer: ctx.layers.strike,
      collidesWith: ctx.layers.strikeCollidesWith,
      material: materialForGolemRole(ctx.materials, "shell"),
    });

    let weld: Physics6DoFConstraint | null = joint(ctx.scene, socket.mount, part, {
      pivotParent: socket.local,
      pivotChild: new Vector3(0, -C.capLength / 2, 0),
      axisParent: CAP_MOUNT.axis,
      axisChild: new Vector3(1, 0, 0),
      perpParent: CAP_MOUNT.perp,
      perpChild: new Vector3(0, 1, 0),
      swing: {},
    });

    // `empty` is the bare fist's own row in the bite table: mass without an edge, a point or a
    // severing path. A shove registers and nothing is cut, which is exactly what a capped
    // socket is worth.
    const striker = new RigidStrike(part, {
      kind: "empty",
      effectorId: `${name}.shove`,
      hand: effectorSlot(socket.slot),
      tipAlong: C.capLength / 2,
    });

    const parts: readonly GolemPart[] = Object.freeze([
      Object.freeze({
        id: name,
        part,
        shell: Object.freeze([part.mesh]),
        health: C.capHealth,
        vitalityWeight: C.capVitalityWeight,
        fatal: false,
      }),
    ]);

    const severCap = (): void => {
      striker.sever();
      // On the leaf, which for a one-capsule cap is the shape itself. A container's masks are
      // a no-op Havok ignores and reads back as garbage.
      part.shape.filterMembershipMask = LAYER.DEBRIS;
      part.shape.filterCollideMask = COLLIDES.DEBRIS;
    };

    const terminal = Object.freeze({
      parts,
      strikers: Object.freeze([striker]),
      tipOffset: C.capLength,
      // No second socket and therefore no trailing grip. Null rather than zero: zero would be a
      // perfectly held grip that does not exist.
      gripStray: () => null,
      sever: severCap,
      dispose: () => { /* the chain owns the cap and disposes it below. */ },
    });

    // Reach **zero**, and the cap's own length is the terminal's `tipOffset`. A chain's reach
    // is how far its *weld point* is from the socket, and rung 0's weld point is the socket
    // itself; counting the cap here as well would have the module's envelope report a limb
    // twice as long as the thing on the stand.
    //
    // No axis and no stroke either, so a mind reading this learns that a capped socket can be
    // asked for nothing and needs no special case for the rung. `reachable` is null rather than a
    // degenerate shell, because a module whose command is not a point has no reachable set to
    // describe and inventing an empty one would be a record nobody could read.
    const envelope = Object.freeze({
      axes: NO_ENVELOPE_AXES,
      reach: 0,
      strokes: NO_STROKES,
      reachable: null,
      settledBand: C.settledBand,
    });
    const commanded = new Vector3();
    const capLocal = new Vector3();
    const capWorld = new Vector3();
    const capSocket = new Vector3();
    // The cap's own direction out of the socket, in the **mount's** frame rather than in the
    // world's. Nothing on this rung can turn relative to its socket -- the cap is welded -- but
    // the socket itself turns and walks the moment a golem is standing under it, and a direction
    // frozen at build would make the published commanded point drift away from a cap that had not
    // moved an inch relative to anything it is bolted to.
    {
      const world = new Vector3();
      new Vector3(0, 1, 0).rotateByQuaternionToRef(rotation, world);
      // Into the mount's frame once, at build, using the mount's build rotation -- which is what
      // `GolemSocket.rotation` is. Everything after this is a rotation *out* of that frame by
      // whatever the mount's live orientation happens to be.
      const inverse = socket.rotation.clone();
      inverse.conjugateInPlace();
      world.rotateByQuaternionToRef(inverse, capLocal);
    }
    /** Where the socket is now, world, into a ref this chain owns. */
    const socketWorld = (): Vector3 => {
      socket.local.rotateByQuaternionToRef(
        socket.mount.mesh.rotationQuaternion ?? Quaternion.Identity(), capSocket,
      );
      return capSocket.addInPlace(socket.mount.mesh.position);
    };
    /** And which way it points now. */
    const capDirectionNow = (): Vector3 => {
      capLocal.rotateByQuaternionToRef(
        socket.mount.mesh.rotationQuaternion ?? Quaternion.Identity(), capWorld,
      );
      return capWorld;
    };

    return Object.freeze({
      parts,
      weld: null,
      ownTerminal: terminal,
      reach: 0,
      // Rung 0 reads no field of `HandIntent` at all, which is the frozen rule "a chain that
      // has no use for a field ignores it" at its limit rather than an omission.
      command: () => { /* nothing to command */ },
      step: () => { /* nothing to drive */ },
      envelope: () => envelope,
      axes: () => NO_AXES,
      stroke: () => "idle" as const,
      anchor: () => null,
      anchorStray: () => null,
      // Every cursor position commands the same pose, because no cursor position commands
      // anything at all -- so a takeover of a body carrying rung 0 has nothing to rebase and the
      // honest seed is the centre of the window. Allocated once, like everything else published
      // from here.
      cursor: () => NO_CURSOR,
      // The commanded end is where a rigid cap on a stand that does not move *has* to be, so
      // the readout's target-versus-actual here is the solver's own error and nothing else --
      // which is exactly what a noise floor is.
      commandedEnd: (distanceFromSocket: number) =>
        commanded.copyFrom(capDirectionNow()).scaleInPlace(distanceFromSocket)
          .addInPlace(socketWorld()),
      // Nothing to let go of: the cap is welded to the socket and no motor was ever pointed at
      // it. A no-op that is stated rather than absent, because a chain that could not answer
      // this at all would be a chain a two-socket terminal silently failed to make passive.
      unmotorise: () => { /* rung 0 has no drive to release */ },
      sever: () => {
        severCap();
        weld?.dispose();
        weld = null;
      },
      dispose: () => {
        striker.sever();
        weld?.dispose();
        weld = null;
        part.body.dispose();
        part.shape.dispose();
        part.mesh.dispose(false, false);
      },
    });
  },
});
