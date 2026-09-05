import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Physics6DoFConstraint } from "@babylonjs/core/Physics/v2/physicsConstraint.js";

import { COLLIDES, LAYER } from "../../../physics.ts";
import { capsulePart, joint } from "../../../rig.ts";
import { TERMINAL_MACE } from "../../config.ts";
import { materialForGolemRole } from "../../materials.ts";
import {
  defineTerminal,
  effectorSlot,
  weldRotation,
  type BuiltTerminal,
  type ChainWeld,
  type GolemMount,
  type GolemPart,
  type ModuleBuild,
} from "../../module.ts";
import { barShell } from "../shell.ts";
import { RigidStrike } from "../striker.ts";

/**
 * The mace: one rigid bar held by both effector sockets, one grip driven and one carried.
 *
 * It reads no `HandIntent`, like every terminal. What makes it the hardest one on the shelf is
 * not control, it is that **it is a closed kinematic loop**: two arms, one rigid body, and
 * therefore a pose for the second arm that the first arm's command decides. Everything below
 * follows from that sentence.
 *
 * ## The trailing grip carries no motor, and that is measured rather than chosen
 *
 * `CONFIG.club.trailingGrip` carries the sweep: two position motors on one rigid body do not add
 * up, they fight. Mean commanded-to-actual hand error went from 34.45 mm with the trailing motor
 * at nothing to 90.30 mm at half of one, and the *reversal* rate fell as it got worse, which is
 * what says it is a steady tug-of-war rather than chatter. So `effector.ts` builds the second
 * chain and calls `unmotorise` on it before a solver step runs, and this file holds it to the
 * bar with a plain ball joint. What the trailing arm contributes is mass, inertia, its own
 * stops, and a limb that is visibly attached.
 *
 * A ball joint and not a weld, and the difference is a degree count. The trailing chain has
 * three axes and a point constraint spends exactly three, so the loop is determined -- one
 * trailing pose per driven pose, with the one-sided elbow stop settling the branch. A weld would
 * spend six on a chain that has three and ask the solver to satisfy an impossible pose every
 * step.
 *
 * ## The grip separation is measured, never configured
 *
 * Both chains are built in the same pose mirrored by their sockets' own `outboard`, so their two
 * weld points are exactly the socket separation apart. A grip that did not coincide with its own
 * weld at construction would be a constraint born violated -- the violation the solver clears by
 * flinging the thing, 48.3 m/s from a fighter standing perfectly still. So the bar is built to
 * span whatever the two welds actually are, and `TERMINAL_MACE` states only what hangs off
 * either end of that span.
 *
 * ## The bar's own frame, and why it is not the chain's
 *
 * Every other terminal takes the chain's `LIMB_MOUNT` unchanged, which runs the terminal out
 * *along* the limb. A bar held by two hands runs **across**, from one grip to the other, and
 * that is the frame offset the session plan says a terminal declares and the chain does not know
 * why. It is composed here from the two welds rather than written down: the bar's own +Y is the
 * unit vector from the trailing grip to the driven grip -- butt to head -- expressed in the
 * driven link's frame, and its +X is the chain's own swing-plane tangent orthogonalised against
 * that. Composed rather than constant, because the direction between two welds is a fact about
 * the golem the bar is bolted to.
 *
 * Local **+Y therefore runs butt to head**, which is `RigidStrike`'s base-to-point convention
 * unchanged, so the striker's tip is the head and nothing needed a second frame.
 *
 * ## What it is worth when it arrives
 *
 * `club` -- mass, no edge, and it severs. "A club has no edge, so there is nothing to align with
 * and no way to hold it wrong. Everything it does is speed, which is the whole character of the
 * weapon: you cannot place a blow with it, you can only arrive with one." That is why the
 * overview's terminal table says `roll` means *nothing* on a mace, and why the narrowing below
 * pins the roll at zero without taking anything away from the weapon.
 */
export const maceTerminal = defineTerminal({
  id: "mace",
  sockets: 2,
  bite: "mass",
  label: "mace",
  massKg: TERMINAL_MACE.mass,
  limits: TERMINAL_MACE.limits,

  build(ctx: ModuleBuild, onto: ChainWeld, trailing: ChainWeld | null): BuiltTerminal {
    const M = TERMINAL_MACE;
    const name = `${ctx.name}.mace`;
    if (!trailing) {
      // `effector.ts` refuses this before it gets here; the second refusal is because a terminal
      // that silently built a one-handed bar when handed no second grip would be the "shield
      // that shipped as a club" failure with the sockets swapped.
      throw new Error(`${name}: a mace claims both effector sockets and was handed one weld`);
    }

    // --- the bar's own axes, composed from the two welds ---------------------------------
    // Butt to head: from the trailing grip toward the driven one, and on past it.
    const alongBar = onto.world.subtract(trailing.world);
    const span = alongBar.length();
    if (span < 1e-3) {
      throw new Error(`${name}: the two grips are ${span} m apart, which is not a bar`);
    }
    alongBar.scaleInPlace(1 / span);

    const intoDriven = Quaternion.Identity();
    onto.rotation.conjugateToRef(intoDriven);
    const perpLocal = new Vector3();
    alongBar.rotateByQuaternionToRef(intoDriven, perpLocal);
    // The chain's own swing-plane tangent, orthogonalised against the bar's axis. Gram-Schmidt
    // rather than a cross product with an arbitrary vector, so that a mace's flat lies where the
    // chain's own edge would -- there is nothing on the bar that cares, and a frame that agreed
    // with the chain's is one fewer convention to get backwards later.
    const axisLocal = onto.mount.axis.subtract(
      perpLocal.scale(Vector3.Dot(onto.mount.axis, perpLocal)),
    );
    if (axisLocal.lengthSquared() < 1e-6) {
      throw new Error(`${name}: the bar runs along the chain's own edge axis, so its frame is degenerate`);
    }
    axisLocal.normalize();
    const mount: GolemMount = Object.freeze({ axis: axisLocal, perp: perpLocal });
    const rotation = weldRotation(mount, onto.rotation);

    // --- the bar ---------------------------------------------------------------------------
    const barLength = M.buttReach + span + M.headReach;
    const half = barLength / 2;
    /** Local +Y offsets, measured from the bar's own centre. */
    const drivenAt = M.buttReach + span - half;
    const trailingAt = M.buttReach - half;
    const headAt = half - M.headDiameter / 2;

    const position = onto.world.add(alongBar.scale(-drivenAt));
    const part = capsulePart(ctx.scene, {
      name,
      position,
      rotation,
      height: barLength,
      radius: M.haftRadius,
      mass: M.mass,
      layer: ctx.layers.strike,
      collidesWith: ctx.layers.strikeCollidesWith,
      material: materialForGolemRole(ctx.materials, "shell"),
      // Out toward the head, which is the number that gives the weapon its character:
      // `CONFIG.club.balancePoint` makes the same argument in metres.
      centerOfMass: new Vector3(0, M.balanceFraction * barLength - half, 0),
    });
    part.body.setLinearDamping(M.linearDamping);
    part.body.setAngularDamping(M.angularDamping);

    // --- the driven grip: a weld -------------------------------------------------------------
    let weld: Physics6DoFConstraint | null = joint(ctx.scene, onto.link, part, {
      pivotParent: onto.pivot,
      pivotChild: new Vector3(0, drivenAt, 0),
      axisParent: mount.axis,
      axisChild: new Vector3(1, 0, 0),
      perpParent: mount.perp,
      perpChild: new Vector3(0, 1, 0),
      swing: {},
    });

    // --- the trailing grip: a ball joint, unmotorised -----------------------------------------
    //
    // Its two reference frames are built to agree **in world at construction**, which is the same
    // rule the weld obeys and matters more here, not less: the limits below are measured from
    // that reference, so a pair whose zero was a quarter turn out would start against its own
    // stop. The bar's axes are carried into the *trailing link's* frame for that reason rather
    // than being reused from the driven link's.
    const intoTrailing = Quaternion.Identity();
    trailing.rotation.conjugateToRef(intoTrailing);
    const barAxisWorld = new Vector3();
    new Vector3(1, 0, 0).rotateByQuaternionToRef(rotation, barAxisWorld);
    const gripAxis = new Vector3();
    barAxisWorld.rotateByQuaternionToRef(intoTrailing, gripAxis);
    const gripPerp = new Vector3();
    alongBar.rotateByQuaternionToRef(intoTrailing, gripPerp);
    const cone = { min: -M.gripCone, max: M.gripCone };
    let grip: Physics6DoFConstraint | null = joint(ctx.scene, trailing.link, part, {
      pivotParent: trailing.pivot,
      pivotChild: new Vector3(0, trailingAt, 0),
      axisParent: gripAxis,
      axisChild: new Vector3(1, 0, 0),
      perpParent: gripPerp,
      perpChild: new Vector3(0, 1, 0),
      swing: { x: cone, y: cone, z: cone },
    });

    const striker = new RigidStrike(part, {
      kind: "club",
      effectorId: `${name}.head`,
      hand: effectorSlot(ctx.socket.slot),
      tipAlong: half,
    });

    const parts: readonly GolemPart[] = Object.freeze([
      Object.freeze({
        id: name,
        part,
        shell: Object.freeze([
          part.mesh,
          ...barShell(ctx.scene, {
            name, host: part.mesh, headDiameter: M.headDiameter, headAt,
            grips: [drivenAt, trailingAt], haftRadius: M.haftRadius, materials: ctx.materials,
          }),
        ]),
        health: M.health,
        vitalityWeight: M.vitalityWeight,
        fatal: false,
      }),
    ]);

    // --- the trailing grip's own error --------------------------------------------------------
    //
    // Two points that a constraint is holding together, read the only way anything in a golem
    // reads a world transform: `mesh.position` and `mesh.rotationQuaternion` and nothing else,
    // because a world matrix stamps the render id as a side effect of being read and this is
    // read on the control step. Allocated once and mutated in place, like every other publication
    // at 240 Hz.
    const scratch = { onBar: new Vector3(), onArm: new Vector3() };
    const barGrip = new Vector3(0, trailingAt, 0);
    const gripStray = (): number => {
      barGrip.rotateByQuaternionToRef(
        part.mesh.rotationQuaternion ?? Quaternion.Identity(), scratch.onBar,
      );
      scratch.onBar.addInPlace(part.mesh.position);
      trailing.pivot.rotateByQuaternionToRef(
        trailing.link.mesh.rotationQuaternion ?? Quaternion.Identity(), scratch.onArm,
      );
      scratch.onArm.addInPlace(trailing.link.mesh.position);
      return Vector3.Distance(scratch.onBar, scratch.onArm);
    };

    return Object.freeze({
      parts,
      strikers: Object.freeze([striker]),
      // From the **driven** weld to the head's far end, which is what the contract's field says
      // and is the honest straight-line distance. The bar's other 0.78 m runs across the golem
      // rather than out along the arm and is no part of it.
      //
      // **Two derived readings become upper bounds because of that, and they are said here
      // rather than discovered later.** `effector.ts` adds this to the chain's own reach as
      // though the two were collinear, and `commandedEnd` carries the sum out along the limb:
      //
      // - `envelope.reach` reads 1.10 m on a reach chain where the head's true distance from the
      //   socket at full extension is `hypot(0.66, 0.44)` = 0.79 m. It is an upper bound, which
      //   is the safe direction for a mind planning against it and the wrong direction for one
      //   quoting it.
      // - the readout's "tip to command" therefore carries a constant floor of about 0.62 m and
      //   is not a tracking error. The tracking reading for a mace is `anchorStray`, which is the
      //   one `AGENTS.md` says to take first anyway -- and `gripStray` beside it.
      //
      // Neither is worth a pose-dependent `tipOffset` to fix: that would make a *constant* of the
      // module contract into a function of the command, which is a much worse trade than a
      // documented bound.
      tipOffset: M.headReach,
      gripStray,
      sever: () => {
        striker.sever();
        // Both grips stay: severing a mace takes the bar and both arms off together, which is
        // what a two-socket module coming away actually is. On the leaf, which for a one-capsule
        // bar is the shape itself.
        part.shape.filterMembershipMask = LAYER.DEBRIS;
        part.shape.filterCollideMask = COLLIDES.DEBRIS;
      },
      dispose: () => {
        striker.sever();
        // Both constraints, and before either link's body: `PhysicsBody.dispose` releases the
        // Havok body and walks straight past whatever is constraining it.
        grip?.dispose();
        grip = null;
        weld?.dispose();
        weld = null;
        part.body.dispose();
        part.shape.dispose();
        part.mesh.dispose(false, false);
      },
    });
  },
});
