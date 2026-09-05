import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Physics6DoFConstraint } from "@babylonjs/core/Physics/v2/physicsConstraint.js";

import { COLLIDES, LAYER } from "../../../physics.ts";
import { boxPart, joint } from "../../../rig.ts";
import { TERMINAL_PLATE } from "../../config.ts";
import { materialForGolemRole } from "../../materials.ts";
import {
  defineTerminal,
  effectorSlot,
  weldRotation,
  type BuiltTerminal,
  type ChainWeld,
  type GolemPart,
  type ModuleBuild,
} from "../../module.ts";
import { plateShell } from "../shell.ts";
import { RigidStrike } from "../striker.ts";

/**
 * The plate: one slab of stone on the end of whatever chain hands it a weld.
 *
 * Like every terminal it has **no control code at all**, and this file is the one where that is
 * worth checking twice, because a shield is the piece a controller most wants to interfere with:
 * the Warrior's strapped board needed a hand frame turned to the front, a radial seed and a
 * reach ceiling, all of them in `Arm`. There is none of that here. What a plate declares is a
 * body, a weld, a striker, a layer, a shell and one narrowing, and if this file ever reads
 * `HandIntent` the factoring has leaked.
 *
 * ## Which way it faces
 *
 * **The buckler's rule, not the heater shield's.** `docs/design.md` records both and they are
 * different mounts rather than different sizes. A buckler "faces wherever the arm points, which
 * is always directly away from its owner, and that is the whole of the rule the owner asked
 * for", and `mountFor("buckler")` is `mountFor("sword")` for exactly that reason. A golem has no
 * hand to strap anything across, and the session plan asks for the same rule in its own words --
 * the plate points away from its owner's centre along the sphere of the chain's reach, as
 * squarely as the chain allows. So the board's own **+Y is its face normal**, which is
 * `Weapon`'s shield frame unchanged, and it welds through the chain's ordinary mount, which puts
 * that normal out along the limb.
 *
 * What `roll` means on a wrist chain is therefore the roll and the bend **together**: rolling
 * about the limb's own axis spins a board about its own normal and shows nothing, and the bend
 * is what tips the normal off the limb -- so the roll picks the direction the face tips and the
 * bend picks how far. On rungs 1 and 2 the facing is a function of the pose and no command
 * changes it, which is the same honest limitation rung 2 already has about a blade's edge.
 *
 * ## Two readings this terminal makes meaningless, said here rather than discovered later
 *
 * The board is carried `outboardOffset` to one side of the limb's own axis so that it clears its
 * owner (see `TERMINAL_PLATE.outboardOffset` for the measured table). Two consequences:
 *
 * - **`tipOffset` is the along-limb distance**, so `commandedEnd` still answers about a point on
 *   the limb's axis, which is what makes it comparable with every other terminal's.
 * - **The readout's "tip to command" therefore carries a constant floor of `outboardOffset`**,
 *   because the striker's tip is the centre of the board's outer face and that is 0.21 m to the
 *   side of the axis by construction. It is not a tracking error and must not be quoted as one.
 *   The tracking reading for a plate is `anchorStray`, which is the one `AGENTS.md` says to take
 *   first anyway.
 *
 * ## What it is worth when it arrives
 *
 * `empty` -- the bare fist's row in the bite table: mass, at fist weight, with no edge, no point
 * and no severing path. The session plan's frozen choice is that a `thrust` bash is "a mass bite
 * at low weight, like the fist", and `shield`'s own row is `inert`, which scores exactly zero
 * however hard it arrives. That is deliberately *not* what a golem's plate is: a golem's plate
 * is a body part rather than a board a policy is holding, and `scoring.ts`'s argument for
 * refusing the buckler its punch -- "the moment a shield scores, every policy that holds one has
 * an offensive option nobody designed" -- is an argument about a *held* shield in a fighter with
 * two hands and a choice. It is recorded here because it is the closest thing to a dissent this
 * decision has, and because if Session 09's mind starts bashing with the plate rather than
 * covering with it, this row is the first place to look.
 */
export const plateTerminal = defineTerminal({
  id: "plate",
  sockets: 1,
  // Not "none". The overview's terminal table reads "none; mass on a `thrust` bash", and the
  // session plan resolves the semicolon: there is no *edge* striker, and the bash is a mass
  // bite. `bite` is what decides whether `EffectorView.edge` is published at all, and a plate
  // has no edge to report, so the readout says "n/a" -- which is the whole job this field does.
  bite: "mass",
  label: "plate",
  massKg: TERMINAL_PLATE.mass,
  limits: TERMINAL_PLATE.limits,

  build(ctx: ModuleBuild, onto: ChainWeld): BuiltTerminal {
    const P = TERMINAL_PLATE;
    const name = `${ctx.name}.plate`;

    // The rotation the weld is about to demand, rather than the golem's own. A weld whose two
    // frames disagree at construction is a violation the solver clears by flinging the thing:
    // 48.3 m/s of tip speed on a fighter standing perfectly still, before `mountRotation`.
    const rotation = weldRotation(onto.mount, onto.rotation);

    // The three local axes, carried into the world once. **Local +Y is the face normal** (out
    // along the limb), local +X is the chain's own swing-plane tangent, and local +Z is what is
    // left, which for both chains is the arm plane's lateral.
    const faceOut = new Vector3();
    new Vector3(0, 1, 0).rotateByQuaternionToRef(rotation, faceOut);
    const lateral = new Vector3();
    new Vector3(0, 0, 1).rotateByQuaternionToRef(rotation, lateral);

    // **Which way along that lateral is *outboard* depends on the socket, and it is a sign
    // rather than a mirror.** `LIMB_MOUNT` puts the terminal's +X on the link's -Z and its +Y on
    // the link's -Y, so its +Z falls on the link's -X -- and the link's +X is the golem's own +X
    // whichever socket the module is in. The primary socket's outboard is +X and the secondary's
    // is -X, so the offset runs along local -Z on the primary and +Z on the secondary. Getting
    // this backwards does not look like a board held wrong; it looks like a golem carrying both
    // its shields across its own chest.
    const lateralSign = -ctx.socket.outboard;
    const alongLimb = P.standOff + P.thickness / 2;
    const position = onto.world
      .add(faceOut.scale(alongLimb))
      .add(lateral.scale(lateralSign * P.outboardOffset));

    const part = boxPart(ctx.scene, {
      name,
      position,
      rotation,
      // Local X is the swing-plane tangent and carries the board's **height**; local Y is the
      // thickness, which is the face normal; local Z is the lateral and carries its **width**.
      // Stated in this order rather than as (width, thickness, height) because the axes are what
      // the weld and the offset above are written against, and a slab turned a quarter turn in
      // its own plane is a board that clears its owner on paper and not in the scene.
      size: new Vector3(P.height, P.thickness, P.width),
      mass: P.mass,
      layer: ctx.layers.strike,
      collidesWith: ctx.layers.strikeCollidesWith,
      material: materialForGolemRole(ctx.materials, "shell"),
    });
    part.body.setLinearDamping(P.linearDamping);
    part.body.setAngularDamping(P.angularDamping);

    let weld: Physics6DoFConstraint | null = joint(ctx.scene, onto.link, part, {
      pivotParent: onto.pivot,
      // The weld point in the board's own local frame: back along the normal and back along the
      // lateral, which is exactly the negative of where the board was built relative to it.
      pivotChild: new Vector3(0, -alongLimb, -lateralSign * P.outboardOffset),
      axisParent: onto.mount.axis,
      axisChild: new Vector3(1, 0, 0),
      perpParent: onto.mount.perp,
      perpChild: new Vector3(0, 1, 0),
      // Every axis locked. A weld is a joint with nothing free, through the one constraint type
      // the whole rig uses.
      swing: {},
    });

    const striker = new RigidStrike(part, {
      kind: "empty",
      effectorId: `${name}.bash`,
      hand: effectorSlot(ctx.socket.slot),
      // The centre of the board's **outer face**, which is where a bash lands. See the header
      // for why this point is not on the limb's own axis and what that costs the readout.
      tipAlong: P.thickness / 2,
    });

    const parts: readonly GolemPart[] = Object.freeze([
      Object.freeze({
        id: name,
        part,
        // One leaf, drawn, with the chamfer and the rim over it. The collider is the plain slab
        // underneath and stays the plain slab: a rim that stood proud in the *collider* would be
        // a plate that blocks 30 mm wider than it looks.
        shell: Object.freeze([
          part.mesh,
          ...plateShell(ctx.scene, {
            name, host: part.mesh, size: new Vector3(P.height, P.thickness, P.width),
            chamferInset: P.chamferInset, rimProud: P.rimProud, materials: ctx.materials,
          }),
        ]),
        health: P.health,
        vitalityWeight: P.vitalityWeight,
        fatal: false,
      }),
    ]);

    return Object.freeze({
      parts,
      strikers: Object.freeze([striker]),
      // The **along-limb** distance from the weld to the board's outer face. Not the straight
      // line to the board's centre, which is 0.21 m to one side: `effector.ts` adds this to the
      // chain's own reach to get a distance the chain then carries along its commanded limb
      // direction, and a hypotenuse handed to that arithmetic would report the board as further
      // out along the arm than it is.
      tipOffset: P.standOff + P.thickness,
      gripStray: () => null,
      sever: () => {
        striker.sever();
        // On the leaf, which for a one-box terminal is the shape itself. Writing a container's
        // masks is a no-op Havok ignores and reads back as garbage.
        part.shape.filterMembershipMask = LAYER.DEBRIS;
        part.shape.filterCollideMask = COLLIDES.DEBRIS;
      },
      dispose: () => {
        striker.sever();
        // The weld is the one constraint no part owns, so it is the one nothing else would take
        // down: `PhysicsBody.dispose` releases the Havok body and walks straight past whatever
        // is constraining it, so a bench rebuilt on `R` would leak this every time.
        weld?.dispose();
        weld = null;
        part.body.dispose();
        part.shape.dispose();
        // `false, false`, so the shell goes with its parent and the palette's materials stand.
        part.mesh.dispose(false, false);
      },
    });
  },
});
