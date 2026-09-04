import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Physics6DoFConstraint } from "@babylonjs/core/Physics/v2/physicsConstraint.js";

import { COLLIDES, LAYER } from "../../../physics.ts";
import { boxPart, joint } from "../../../rig.ts";
import { TERMINAL_BLADE } from "../../config.ts";
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
import { RigidStrike } from "../striker.ts";

/**
 * The blade: one slender steel body on the end of whatever chain hands it a weld.
 *
 * It has **no control code at all**, and that absence is the whole of the chain/terminal
 * factoring. The chain owns everything about motion -- driven axes, drive, envelope, mouse
 * mapping, strokes -- and the terminal owns a collider, a mass, a striker kind, a collision
 * layer and a shell. If a terminal file ever reads `HandIntent`, the factoring has leaked.
 * That is why every chain is benched with this same blade: what the owner is judging is the
 * chain.
 *
 * **Built in the frame its own weld demands, and welded once.** A weld whose two frames
 * disagree at construction is a violation the solver clears by flinging the thing: measured on
 * this directory's own weapons at 48.3 m/s of tip speed for a sword and 80.4 for a club, on a
 * fighter standing perfectly still, before `weapon.ts`'s `mountRotation` existed. `weldRotation`
 * is that arithmetic, and the *chain* supplies the mount, because the chain is what knows which
 * way its own swing plane lies -- the pitch chain points the edge along the tangent of its own
 * arc, which is a fact about the chain and not about the steel.
 *
 * **The filter goes on the body's own leaf shape.** `boxPart` builds a single
 * `PhysicsShapeBox`, not a container, which is the whole reason this terminal is one box rather
 * than a compound with a fuller and a ricasso: setting `filterMembershipMask` on a
 * `PhysicsShapeContainer` writes to a shape nothing consults and reads back garbage -- a shape
 * set to 8 returned 383476 -- and every weapon in this directory collided with everything for
 * its whole life because of it. A terminal that ever grows a second leaf sets the masks on
 * each leaf.
 */
export const bladeTerminal = defineTerminal({
  id: "blade",
  sockets: 1,
  bite: "edge",
  label: "blade",
  massKg: TERMINAL_BLADE.mass,

  build(ctx: ModuleBuild, onto: ChainWeld): BuiltTerminal {
    const B = TERMINAL_BLADE;
    const name = `${ctx.name}.blade`;

    // The rotation the weld is about to demand, rather than the golem's own.
    const rotation = weldRotation(onto.mount, onto.rotation);
    // The body's origin is its own centre, so it is built half a blade beyond the weld point
    // along its own +Y -- which, after the rotation above, is exactly `onto.mount.perp` carried
    // into the world.
    const along = new Vector3();
    new Vector3(0, 1, 0).rotateByQuaternionToRef(rotation, along);
    const position = onto.world.add(along.scale(B.length / 2));

    const part = boxPart(ctx.scene, {
      name,
      position,
      rotation,
      size: new Vector3(B.width, B.length, B.thickness),
      mass: B.mass,
      layer: ctx.layers.strike,
      collidesWith: ctx.layers.strikeCollidesWith,
      // An edge is the one part of a golem with a reason to be metal, and the salvaged
      // material rules already say which recipe that is.
      material: materialForGolemRole(ctx.materials, "joint"),
    });
    part.body.setLinearDamping(B.linearDamping);
    part.body.setAngularDamping(B.angularDamping);

    let weld: Physics6DoFConstraint | null = joint(ctx.scene, onto.link, part, {
      pivotParent: onto.pivot,
      pivotChild: new Vector3(0, -B.length / 2, 0),
      axisParent: onto.mount.axis,
      axisChild: new Vector3(1, 0, 0),
      perpParent: onto.mount.perp,
      perpChild: new Vector3(0, 1, 0),
      // Every axis locked. A weld is a joint with nothing free, through the one constraint type
      // the whole rig uses, so a weld that misbehaves is tuned rather than rebuilt as a class.
      swing: {},
    });

    const striker = new RigidStrike(part, {
      kind: "sword",
      effectorId: `${name}.edge`,
      hand: effectorSlot(ctx.socket.slot),
      tipAlong: B.tipOffset - B.length / 2,
    });

    const parts: readonly GolemPart[] = Object.freeze([
      Object.freeze({
        id: name,
        part,
        // The collider *is* the drawn mesh here, which is the one case where that is honest: a
        // blade is a flat slab and a shell over it would be the same slab twice. The field
        // stays separate because a shell carries no authority, so a later blade that grows a
        // fuller adds meshes here without the collider moving.
        shell: Object.freeze([part.mesh]),
        health: B.health,
        vitalityWeight: B.vitalityWeight,
        fatal: false,
      }),
    ]);

    return Object.freeze({
      parts,
      striker,
      tipOffset: B.tipOffset,
      sever: () => {
        striker.sever();
        // On the leaf, which for a one-box terminal is the shape itself. Writing a container's
        // masks is a no-op Havok ignores and reads back as garbage; see the header.
        part.shape.filterMembershipMask = LAYER.DEBRIS;
        part.shape.filterCollideMask = COLLIDES.DEBRIS;
      },
      dispose: () => {
        striker.sever();
        // The weld is the one constraint no part owns, so it is the one nothing else would
        // take down: `PhysicsBody.dispose` releases the Havok body and walks straight past
        // whatever is constraining it, so a bench rebuilt on `R` would leak this every time.
        weld?.dispose();
        weld = null;
        part.body.dispose();
        part.shape.dispose();
        part.mesh.dispose(false, false);
      },
    });
  },
});
