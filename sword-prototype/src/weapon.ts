import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { Vector3, Quaternion, Matrix } from "@babylonjs/core/Maths/math.vector.js";
import { PhysicsBody } from "@babylonjs/core/Physics/v2/physicsBody.js";
import {
  PhysicsShape,
  PhysicsShapeBox,
  PhysicsShapeContainer,
  PhysicsShapeCylinder,
} from "@babylonjs/core/Physics/v2/physicsShape.js";
import { PhysicsMotionType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";
import type { Material } from "@babylonjs/core/Materials/material.js";
import type { Scene } from "@babylonjs/core/scene.js";

import { CONFIG } from "./config.ts";
import { COLLIDES, LAYER } from "./physics.ts";
import { applyObjectSurface, disposeCarriedRoot, type ObjectMaterials, type ObjectPart } from "./object-surfaces.ts";
import {
  isStrapped,
  type HandName,
  type WeaponKind,
} from "./hands.ts";

/**
 * The kinds, and the questions about a kind, forwarded from `kinds.ts`.
 *
 * They are declared over there because they have to be answerable without
 * Babylon: a policy plans a hand by what is in it, and `policies.ts` keeps an
 * import graph of exactly `config.ts` so that `tests/minds.test.mjs` costs
 * milliseconds rather than seconds. Re-exported from here because this is where
 * every existing caller already looks for them, and a move that renames nothing
 * is a move nothing can break.
 */
export type { WeaponKind };
export { WEAPON_KINDS, handsFor, hasHeldWeapon, isShield, isShooting, isStrapped, isStriking } from "./hands.ts";

export interface WeaponMaterials {
  steel: Material;
  /** Optional only for the compact headless palettes; the arena always supplies it. */
  edge?: Material;
  leather: Material;
  brass: Material;
  wood: Material;
  paintedWood?: Material;
  bowString?: Material;
  /** One shared unlit accent for every pooled arrow head, fletch and trace. */
  arrowAccent: Material;
}

export function objectMaterialsFor(materials: WeaponMaterials): ObjectMaterials {
  return {
    ...materials,
    edge: materials.edge ?? materials.steel,
    paintedWood: materials.paintedWood ?? materials.wood,
    bowString: materials.bowString ?? materials.leather,
  };
}

function weaponSurface(mesh: Mesh, part: ObjectPart, materials: WeaponMaterials): void {
  applyObjectSurface(mesh, part, objectMaterialsFor(materials));
}

/** What a kind's builder settles, once its meshes and shapes are in place. */
interface Built {
  mass: number;
  /**
   * Where it balances, in its own local frame.
   *
   * A point rather than a distance along +Y. It was a distance while every kind
   * was a thing on a stick and the only question was how far up the stick; a
   * shield hangs to one side of the fist that holds it and off along the arm
   * from it, and a shield whose mass sat on the fist would be a shield you could
   * hold out all day.
   */
  centreOfMass: Vector3;
  baseOffset: number;
  tipOffset: number;
  /**
   * Where a second hand takes hold, along local +Y -- or **null** for a kind no
   * second hand grips.
   *
   * It was `CONFIG.club.secondGrip`, written into `Arm.takeSecondGrip`: one
   * kind's number, in a method whose entire subject is two-handedness in
   * general. Exactly the defect `combat.ts` had when it held its own copy of
   * `minCutSpeed`, and it stayed invisible for the same reason -- the club was
   * the only two-handed kind, so a caller's copy and the table agreed.
   *
   * A bow is what made them disagree, and its answer is `null`. It takes both
   * hands and the trailing one is on the string, which travels 620 mm through a
   * draw: there is nothing fixed to weld it to. Its second hand is committed by
   * the loadout and modelled by the draw, and inventing a joint so that the
   * field could hold a number would be the opposite of what this field is for.
   *
   * `Built` is where it goes rather than `hands.ts` because it is a *distance*,
   * which is geometry -- and geometry is what a builder already knows and what
   * `hands.ts`, which imports nothing, deliberately does not.
   */
  secondGrip: number | null;
}

/**
 * A kind with no builder, refused at compile time.
 *
 * `kind: never` is the whole of it: every branch above has to have narrowed the
 * union to nothing before this can be called, so adding a kind and forgetting to
 * build it is a type error rather than a weapon that quietly turns out to be a
 * club.
 */
const unbuildable = (kind: never): never => {
  throw new Error(`no builder for weapon kind ${String(kind)}`);
};

/**
 * How a kind sits in the fist: two of the weapon's own axes, written in the
 * hand's frame.
 *
 * The hand's frame is built by `Arm.driveAnchor` and its **-Y runs out along the
 * arm**, away from the shoulder, which is why a sword's +Y welds to `(0, -1, 0)`
 * and comes out of the fist pointing away from the wrist.
 *
 * A shield does not. It is the one thing a hand carries that is not aimed, and
 * welding it like a blade is what made it a lollipop: its face normal pointed
 * wherever the arm pointed, so a resting arm laid the plate flat like a table
 * top through its owner's hip and a guarding one faced it at the floor. Strapped
 * across the forearm instead -- face normal square to the arm rather than along
 * it -- the plate can face the front from any pose the arm is in, which is the
 * whole of what a shield has to be able to do.
 *
 * The pair is `(+X, +Y)`; +Z follows from the cross product and is not a free
 * choice. For the shield that works out as: the face normal on the hand's +X,
 * which is the axis `roll` turns, so **`roll` is where the shield faces**; and
 * the plate's long axis on the hand's -Y, so the plate lies along the forearm.
 *
 * A **buckler** takes the default pair, the same one a blade does, and that is
 * the whole difference between the two shields rather than an oversight. A
 * buckler is not strapped to anything: it is a small round plate held on a bar
 * behind its boss, punched out on the end of a straight arm. Its face normal
 * therefore runs *along* the arm -- the mount a strapped shield was wrong to
 * have, and the right one here -- so it faces wherever the arm points, which is
 * always radially outward from its owner. The pose the heater shield had to be
 * taken out of is the pose a buckler is for.
 *
 * The question asked is `isStrapped` rather than `kind === "shield"`, and the
 * difference is not style. This file and `arm.ts` both had to know which kind
 * was the strapped one, separately, in a `===` that neither could see the other
 * make -- so a second strapped kind was two edits in two files with nothing
 * connecting them. There is one answer now and `hands.ts` has it.
 */
export interface Mount {
  /** Where the weapon's own +X points, in the hand's frame. */
  axis: Vector3;
  /** Where the weapon's own +Y points, in the hand's frame. */
  perp: Vector3;
}

export const mountFor = (kind: WeaponKind): Mount =>
  isStrapped(kind)
    ? { axis: new Vector3(0, 0, -1), perp: new Vector3(1, 0, 0) }
    : { axis: new Vector3(1, 0, 0), perp: new Vector3(0, -1, 0) };

/**
 * The world rotation a weapon must be *built* with to satisfy its own weld.
 *
 * A weld between two frames that disagree at construction is a violation the
 * solver answers on the first step, and this is the arithmetic that makes them
 * agree. It mattered less when the disagreement was a half turn about the blade
 * -- the sword flipped, in a frame nobody watched -- and it matters now, because
 * a shield that starts a quarter turn out starts inside the trunk it is not
 * allowed to be inside, and the first thing the solver does is throw it out.
 */
export function mountRotation(
  kind: WeaponKind,
  hand: Quaternion,
  into = new Quaternion(),
): Quaternion {
  const mount = mountFor(kind);
  const local = Matrix.Identity();
  Matrix.FromXYZAxesToRef(mount.axis, mount.perp, Vector3.Cross(mount.axis, mount.perp), local);
  const handMatrix = Matrix.Identity();
  Matrix.FromQuaternionToRef(hand, handMatrix);
  // Row-vector convention, so `local.multiply(handMatrix)` is "weapon into the
  // hand, then hand into the world" and not the other way round.
  Quaternion.FromRotationMatrixToRef(local.multiply(handMatrix), into);
  return into;
}

export interface WeaponOptions {
  hand: HandName;
  /**
   * Name of the root node, and the prefix every piece is named with. Two
   * fighters with two hands each is four of these in one scene and they must be
   * told apart in the inspector, in a picking predicate and in a mesh list, so
   * the name is given rather than assumed.
   */
  name: string;
  kind: WeaponKind;
  position: Vector3;
  /**
   * Which way the blade starts out pointing. It is welded into a hand whose
   * frame is already turned to face the other fighter, and a weld between two
   * frames that disagree at construction is a violation the solver answers on
   * the first step by swinging the sword through the arena to meet it.
   */
  rotation?: Quaternion;
  layer: number;
  collidesWith: number;
}

/**
 * The weapon's local frame, which the whole damage model is written against:
 *
 *   +Y  along the weapon, from grip toward the far end
 *   +X  the edge axis -- the arming sword is double-edged, so both -X and +X
 *       cut, and a swing only bites when the blade travels along this axis
 *   +Z  the flat; travel along Z is a slap, not a cut
 *
 * The origin sits at the middle of the grip so that welding it into a hand is a
 * pivot at the origin rather than an offset nobody can picture.
 *
 * All three kinds keep that frame, which is what lets `Combat` ask the same four
 * questions of any of them without a branch. It reads differently per kind and
 * that is the point rather than a compromise:
 *
 * - a **sword** is as described, and is unchanged from when this file only knew
 *   about swords;
 * - an **axe** is the frame taken literally: its head sticks out along +X and
 *   its edge is the +X face, so the axis a sword cuts on *both* sides of is the
 *   axis an axe cuts on one side of. `-X` is the poll, and `scoring.ts` scores
 *   it as the lump of steel it is;
 * - a **club** has no edge, so `scoring.ts` never asks about its +X. Its mass is
 *   out at the head, which is what makes it slow to start and hard to stop;
 * - a **shield** is a plate whose *face normal* is +Y. Nothing about it is
 *   aimed: it works by being in the way. It is the one kind whose weld is not
 *   "out of the fist along the arm" -- see `mountFor` -- because a shield has to
 *   be able to face the front whatever the arm is doing, and it is the one kind
 *   its owner's own trunk can stop.
 */
export class Weapon {
  readonly kind: WeaponKind;
  readonly hand: HandName;
  readonly root: TransformNode;
  readonly body: PhysicsBody;
  readonly shape: PhysicsShapeContainer;

  /**
   * Every leaf shape this weapon is made of, because **Havok filters on the
   * leaves and ignores the container's own mask entirely**.
   *
   * This list exists because of a defect that had been in the file since there
   * was a file. `finish` set `this.shape.filterMembershipMask`, on the
   * container, which is what the API invites -- and it did nothing whatsoever.
   * Not "nothing subtle": a real fighter holding a real sword, swept through its
   * envelope for twelve seconds, logged **1687 contacts against its own upper
   * arm, 1572 against its own forearm, 853 against its own torso and 795 against
   * its own shield**. Every one of those is a pair `physics.ts` spends fifty
   * lines explaining must never touch, and the shield was worse: 985 against its
   * owner's head, 725 and 669 against its owner's two arms, 391 against its own
   * hand. The plate hangs 110 mm off the fist and its own forearm sits inside
   * that gap by construction, so that is *permanent* contact between a 4 kg
   * lever and the chain driving it -- the exact failure the layer table was
   * designed to prevent, running the whole time.
   *
   * It stayed invisible because the symptom is not a crash or a hole, it is
   * *friction*: an arm that tracks its anchor a little worse than it should, in
   * a prototype whose entire subject is how well an arm tracks its anchor. And
   * reading the mask back does not catch it either -- a container hands back
   * garbage (383476 for a shape set to 8).
   *
   * `.review/mask-probe.mjs` is the six-case drop that settles it: a leaf's mask
   * takes, before or after its body exists; a container's never takes at all;
   * and a child's mask set through the container's back takes.
   */
  private readonly parts: PhysicsShape[] = [];
  private readonly partOffsets: Vector3[] = [];

  /** Distance from origin to the point of the blade, along local +Y. */
  readonly tipOffset: number;
  /** Where the blade proper begins -- the guard. */
  readonly baseOffset: number;
  /** Where a second hand takes hold along local +Y, or null if none does. */
  readonly secondGrip: number | null;

  private discarded = false;

  /**
   * Whether this has stopped being a weapon, which for a `Weapon` means it has
   * been cut out of somebody's hand.
   *
   * Read by `Combat`, which will not score a contact from it. That is not a new
   * rule for arrows being applied to blades by analogy -- a sword lying on the
   * floor scoring cuts against whoever walks over it is the same defect, and it
   * has been here as long as limbs have come off.
   */
  get spent(): boolean {
    return this.discarded;
  }

  /**
   * The three pieces a bow's draw moves, and null for every other kind.
   *
   * Data rather than a branch: `drawTo` is a no-op for anything that has no
   * string, so nothing above here asks what it is holding. All three are
   * **cosmetic** -- they are not in the physics shape, and house rule 2 is why:
   * the string does not stop a blade and the nocked arrow does not hit anybody.
   * What they do is answer the one question a hold-to-charge control cannot be
   * played without, which is *how far have I drawn it*.
   */
  private draw: { upper: Mesh; lower: Mesh; nocked: Mesh; brace: number; pull: number } | null =
    null;

  private readonly scratch = {
    edge: new Vector3(),
    blade: new Vector3(),
    flat: new Vector3(),
    tip: new Vector3(),
    rel: new Vector3(),
    vel: new Vector3(),
    // For the two cache-free accessors below, kept apart from the six above so
    // that a reading taken for a mind can never overwrite one taken for a hit.
    freeTip: new Vector3(),
    freeLin: new Vector3(),
    freeAng: new Vector3(),
    freeCentre: new Vector3(),
    freeRel: new Vector3(),
  };

  constructor(
    scene: Scene,
    opts: WeaponOptions,
    materials: WeaponMaterials,
  ) {
    this.kind = opts.kind;
    this.hand = opts.hand;

    this.root = new TransformNode(opts.name, scene);
    this.root.position.copyFrom(opts.position);
    this.root.rotationQuaternion = opts.rotation ? opts.rotation.clone() : Quaternion.Identity();

    this.shape = new PhysicsShapeContainer(scene);

    // A hand holding nothing has no body to weld, so `Arm` never builds one --
    // but `empty` is a member of the union and the exhaustiveness check below
    // cannot narrow it away on its own. Refused here rather than silently built.
    if (opts.kind === "empty") throw new Error("an empty hand has no weapon body");

    if (opts.kind !== "sword") {
      // Exhaustive, and it is worth the extra line. This was a ternary whose
      // else-branch was `buildClub`, so a kind added to the union and to the
      // picker compiled clean, passed `tsc`, and shipped as a club -- which for
      // a shield is a shield-shaped thing that scores crushing blows. `never` is
      // what turns "you forgot a builder" from a playtest into a compile error.
      const built =
        opts.kind === "axe"
          ? this.buildAxe(scene, opts.name, materials)
          : opts.kind === "bow"
            ? this.buildBow(scene, opts.name, materials)
            : opts.kind === "shield"
              ? this.buildShield(scene, opts.name, materials)
              : opts.kind === "buckler"
                ? this.buildBuckler(scene, opts.name, materials)
                : opts.kind === "club"
                  ? this.buildClub(scene, opts.name, materials)
                  : unbuildable(opts.kind);
      this.baseOffset = built.baseOffset;
      this.tipOffset = built.tipOffset;
      this.secondGrip = built.secondGrip;
      this.body = this.finish(scene, opts, built.mass, built.centreOfMass);
      return;
    }

    const { bladeLength, bladeWidth, bladeThickness, guardWidth, gripLength, mass, balancePoint } =
      CONFIG.sword;

    this.baseOffset = gripLength / 2;
    this.tipOffset = this.baseOffset + bladeLength;
    this.secondGrip = null;

    const bladeCentre = this.baseOffset + bladeLength / 2;

    const blade = MeshBuilder.CreateBox(
      `${opts.name}.blade`,
      { width: bladeWidth, height: bladeLength, depth: bladeThickness },
      scene,
    );
    blade.position.set(0, bladeCentre, 0);
    weaponSurface(blade, "sword.blade", materials);
    blade.parent = this.root;

    // A short secondary box at the point reads as a taper without needing a
    // custom mesh, and costs nothing.
    const point = MeshBuilder.CreateBox(
      `${opts.name}.point`,
      { width: bladeWidth * 0.45, height: bladeLength * 0.16, depth: bladeThickness * 0.9 },
      scene,
    );
    point.position.set(0, this.tipOffset - bladeLength * 0.08, 0);
    weaponSurface(point, "sword.point", materials);
    point.parent = this.root;

    const guard = MeshBuilder.CreateBox(
      `${opts.name}.guard`,
      { width: guardWidth, height: 0.026, depth: 0.038 },
      scene,
    );
    guard.position.set(0, this.baseOffset, 0);
    weaponSurface(guard, "sword.guard", materials);
    guard.parent = this.root;

    const grip = MeshBuilder.CreateCylinder(
      `${opts.name}.grip`,
      { height: gripLength, diameterTop: 0.028, diameterBottom: 0.034, tessellation: 10 },
      scene,
    );
    weaponSurface(grip, "sword.grip", materials);
    grip.parent = this.root;

    const pommel = MeshBuilder.CreateSphere(
      `${opts.name}.pommel`,
      { diameter: 0.052, segments: 8 },
      scene,
    );
    pommel.position.set(0, -gripLength / 2, 0);
    weaponSurface(pommel, "sword.pommel", materials);
    pommel.parent = this.root;

    // Physics: one compound shape, so the guard can turn a blow and the pommel
    // has presence, rather than the blade being the only thing in the world.
    this.addPart(
      new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), new Vector3(bladeWidth, bladeLength, bladeThickness), scene),
      new Vector3(0, bladeCentre, 0),
    );
    this.addPart(
      new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), new Vector3(guardWidth, 0.026, 0.038), scene),
      new Vector3(0, this.baseOffset, 0),
    );
    this.addPart(
      new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), new Vector3(0.034, gripLength, 0.034), scene),
      Vector3.Zero(),
    );
    // An arming sword balances a hand's width ahead of the guard. Put the centre
    // of mass there and the weapon rotates about the wrist the way a sword does
    // instead of the way a broom does.
    this.body = this.finish(scene, opts, mass, new Vector3(0, this.baseOffset + balancePoint, 0));
  }

  /**
   * The last three things every kind needs, in the order they need them.
   *
   * A method rather than three lines repeated per branch, and worth being one
   * for `setCollisionCallbackEnabled` above all: it is what makes a body report
   * contacts at all, `Combat` hears nothing without it, and a silent damage
   * model looks exactly like a weapon that never connects.
   */
  private finish(scene: Scene, opts: WeaponOptions, mass: number, balance: Vector3): PhysicsBody {
    this.relayer(opts.layer, opts.collidesWith);

    const body = new PhysicsBody(this.root, PhysicsMotionType.DYNAMIC, false, scene);
    body.shape = this.shape;
    body.setMassProperties({ mass, centerOfMass: balance });
    body.setCollisionCallbackEnabled(true);
    return body;
  }

  /**
   * A shield: a plate strapped along the arm, standing off the fist.
   *
   * Its face normal is local +Y and its long axis is local +Z, and `mountFor`
   * welds those to the hand's +X and -Y -- so the plate lies **along** the
   * forearm and faces square to it. Nothing about it is aimed and nothing about
   * it scores: it works by being in the way.
   *
   * The fist is not in the middle of it. `gripInset` is how far the plate
   * reaches back past the hand toward the shoulder, and the rest of the plate
   * hangs on out along the arm, which is where the enarmes of a real one put it
   * and is also the only place a 600 mm plate can go without the inboard half of
   * it arriving in the wearer's chest.
   *
   * `tipOffset` is the front face over the fist rather than a point, because
   * `Arm` uses it to decide how far past the hand the aim indicator reaches, and
   * because `scoring.ts` never asks a shield about its tip.
   */
  private buildShield(
    scene: Scene,
    name: string,
    materials: WeaponMaterials,
  ): Built {
    const S = CONFIG.shield;
    const out = S.standOff;
    /** The plate's centre along the arm, from the fist. */
    const along = S.height / 2 - S.gripInset;

    const plate = MeshBuilder.CreateBox(
      `${name}.plate`,
      { width: S.width, height: S.thickness, depth: S.height },
      scene,
    );
    plate.position.set(0, out, along);
    weaponSurface(plate, "shield.plate", materials);
    plate.parent = this.root;

    const rim = MeshBuilder.CreateBox(
      `${name}.rim`,
      { width: S.width * 1.05, height: S.thickness * 0.55, depth: S.height * 1.04 },
      scene,
    );
    rim.position.set(0, out - S.thickness * 0.55, along);
    weaponSurface(rim, "shield.rim", materials);
    rim.parent = this.root;

    // Over the fist rather than at the plate's centre, because that is what a
    // boss is: the cover over the hand.
    const boss = MeshBuilder.CreateSphere(
      `${name}.boss`,
      { diameter: S.bossDiameter, segments: 10 },
      scene,
    );
    boss.position.set(0, out + S.thickness * 0.5, 0);
    boss.scaling.set(1, 0.6, 1);
    weaponSurface(boss, "shield.boss", materials);
    boss.parent = this.root;

    // The bar the fist holds, bridging the gap the plate stands off by. It used
    // to sit on the origin, which put half of it behind the hand and inside the
    // wrist.
    const grip = MeshBuilder.CreateCylinder(
      `${name}.grip`,
      { height: S.gripLength, diameter: 0.032, tessellation: 8 },
      scene,
    );
    grip.position.set(0, S.gripLength / 2, 0);
    weaponSurface(grip, "shield.grip", materials);
    grip.parent = this.root;

    // One box for the whole face. A shield does not need a compound shape: it is
    // a flat thing whose job is to occupy a rectangle, and every extra child is
    // another pair the solver tests every step for the rest of the bout.
    this.addPart(
      new PhysicsShapeBox(
        Vector3.Zero(),
        Quaternion.Identity(),
        new Vector3(S.width, S.thickness * 2.4, S.height),
        scene,
      ),
      new Vector3(0, out, along),
    );

    return {
      mass: S.mass,
      // Out past the fist and off to the front of it, three quarters of the way
      // to the plate's own centre. That lever is what makes a shield tiring to
      // hold up and slow to bring back across the body.
      centreOfMass: new Vector3(0, out * 0.75, along * 0.75),
      baseOffset: 0,
      tipOffset: out + S.thickness,
      secondGrip: null,
    };
  }

  /**
   * A buckler: a small round plate on a bar behind its boss, punched out on the
   * end of the arm.
   *
   * It takes the **default** mount, the blade's, so its face normal (local +Y)
   * runs out along the arm rather than square to it. That is the entire
   * difference from the shield above and it is what makes a buckler a buckler:
   * you do not strap one on, you hold it out and put it between you and the
   * point, so the plate faces wherever the arm is pointing -- always directly
   * away from its owner, which is the one thing a shield has to do.
   *
   * The heater shield had that mount and was wrong to. The pose it produced --
   * a plate held out at the end of a straight arm -- is not how anybody carries
   * 600 mm of limewood, and is exactly how everybody carries 340 mm of steel.
   *
   * So it needs none of the strapped shield's machinery: no `handFrame`, no
   * square-to-the-front seed, no `minFace` conditioning. `roll` spins it about
   * its own axis, and it is round, so that is invisible -- which is the honest
   * reason a buckler is the easy one.
   *
   * Round in the solver too, not a squared-off box. A box would over-cover the
   * corners by about a quarter of the plate's own area, and small is the whole
   * point of the thing.
   */
  private buildBuckler(
    scene: Scene,
    name: string,
    materials: WeaponMaterials,
  ): Built {
    const B = CONFIG.buckler;
    const out = B.standOff;
    const radius = B.diameter / 2;

    const plate = MeshBuilder.CreateCylinder(
      `${name}.plate`,
      { height: B.thickness, diameter: B.diameter, tessellation: 20 },
      scene,
    );
    plate.position.set(0, out, 0);
    weaponSurface(plate, "buckler.plate", materials);
    plate.parent = this.root;

    const rim = MeshBuilder.CreateTorus(
      `${name}.rim`,
      { diameter: B.diameter, thickness: B.thickness * 1.8, tessellation: 20 },
      scene,
    );
    rim.position.set(0, out, 0);
    weaponSurface(rim, "buckler.rim", materials);
    rim.parent = this.root;

    // The dome over the fist. On a buckler this is structural rather than
    // decorative -- the hand is inside it, which is why the grip bar can sit
    // behind the plate instead of on top of it.
    const boss = MeshBuilder.CreateSphere(
      `${name}.boss`,
      { diameter: B.bossDiameter, segments: 12 },
      scene,
    );
    boss.position.set(0, out - B.bossDiameter * 0.22, 0);
    boss.scaling.set(1, 0.75, 1);
    weaponSurface(boss, "buckler.boss", materials);
    boss.parent = this.root;

    const grip = MeshBuilder.CreateCylinder(
      `${name}.grip`,
      { height: B.gripLength, diameter: 0.03, tessellation: 8 },
      scene,
    );
    // Across the hand, not along the arm: the bar a buckler is held by runs at
    // right angles to the way it is pointed.
    grip.rotation.z = Math.PI / 2;
    grip.position.set(0, out - B.bossDiameter * 0.5, 0);
    weaponSurface(grip, "buckler.grip", materials);
    grip.parent = this.root;

    this.addPart(
      new PhysicsShapeCylinder(
        new Vector3(0, -B.thickness / 2, 0),
        new Vector3(0, B.thickness / 2, 0),
        radius,
        scene,
      ),
      new Vector3(0, out, 0),
    );

    return {
      mass: B.mass,
      // Almost all of it in the plate, which is where a steel buckler's is. The
      // lever is short, and that is the point of comparison with the shield: a
      // buckler is quick because its mass is close to the fist, not because it
      // is light.
      centreOfMass: new Vector3(0, out * 0.9, 0),
      baseOffset: 0,
      tipOffset: out + B.thickness,
      secondGrip: null,
    };
  }

  /**
   * An axe: a short haft with a single bit at the top of it.
   *
   * The frame taken at its word. +Y is the haft, +X is the edge -- so the head
   * is built sticking out along **+X only**, its cutting face is the +X extreme,
   * and the lump on -X is the poll. That asymmetry is the weapon: a sword is
   * double-edged so `roll` matters to it only modulo half a turn, and an axe
   * cares about the whole turn, because half a turn out is the difference
   * between the edge and the back of the head.
   *
   * Nothing here is a rule. The two rules an axe gets -- no point, one edge --
   * are rows in `hands.ts` and are enforced in `scoring.ts`. What is here is
   * geometry and mass, and the reason the weapon *feels* different: 0.68 m of
   * reach against the sword's 0.935, and a centre of mass at 0.45 against the
   * sword's 0.195, which meets the arm's 850 N ceiling as three times the moment
   * of inertia and comes out the other side as a swing that cannot be recalled.
   *
   * The centre of mass is off the haft axis, out along +X with the head. An axe
   * is genuinely off-balance sideways -- it is why one wants to turn in the hand
   * and why holding one is a skill -- and `Built.centreOfMass` has been a point
   * rather than a distance since the shield needed it to be, so saying so costs
   * one number rather than a refactor.
   */
  private buildAxe(
    scene: Scene,
    name: string,
    materials: WeaponMaterials,
  ): Built {
    const A = CONFIG.axe;

    // The origin is the middle of the grip, as the sword's is. `baseOffset` is
    // where the business end starts, which for a sword is the guard and for an
    // axe is the underside of the head.
    const butt = -A.gripLength / 2;
    const base = A.gripLength / 2 + A.haftLength;
    const tip = base + A.headLength;
    const shaftLength = A.gripLength + A.haftLength;
    const shaftCentre = butt + shaftLength / 2;
    const headCentre = base + A.headLength / 2;

    const haft = MeshBuilder.CreateCylinder(
      `${name}.haft`,
      {
        height: shaftLength,
        diameterTop: A.haftDiameter,
        diameterBottom: A.haftDiameter * 0.88,
        tessellation: 10,
      },
      scene,
    );
    haft.position.set(0, shaftCentre, 0);
    weaponSurface(haft, "axe.haft", materials);
    haft.parent = this.root;

    const wrap = MeshBuilder.CreateCylinder(
      `${name}.wrap`,
      { height: A.gripLength, diameter: A.haftDiameter * 1.16, tessellation: 10 },
      scene,
    );
    weaponSurface(wrap, "axe.wrap", materials);
    wrap.parent = this.root;

    // The eye and the poll: the steel wrapped round the haft, and the counter-
    // weight behind it. Short in Y, because the bit flares away from it.
    const eye = MeshBuilder.CreateBox(
      `${name}.eye`,
      {
        width: A.pollReach + A.haftDiameter,
        height: A.headLength * 0.58,
        depth: A.headThickness,
      },
      scene,
    );
    eye.position.set((A.haftDiameter - A.pollReach) / 2, headCentre, 0);
    weaponSurface(eye, "axe.eye", materials);
    eye.parent = this.root;

    // The bit, reaching out along +X to the edge, and thinner than the eye
    // because it is a wedge rather than a block.
    const bit = MeshBuilder.CreateBox(
      `${name}.bit`,
      { width: A.headReach, height: A.headLength, depth: A.headThickness * 0.62 },
      scene,
    );
    bit.position.set(A.headReach / 2, headCentre, 0);
    weaponSurface(bit, "axe.bit", materials);
    bit.parent = this.root;

    // The edge itself: thin, and taller than the bit behind it, which is what a
    // bearded axe looks like and what says at a glance which way round it is.
    const edge = MeshBuilder.CreateBox(
      `${name}.edge`,
      {
        width: A.headReach * 0.16,
        height: A.headLength * 1.18,
        depth: A.headThickness * 0.24,
      },
      scene,
    );
    edge.position.set(A.headReach * 0.95, headCentre, 0);
    weaponSurface(edge, "axe.edge", materials);
    edge.parent = this.root;

    // Two shapes, as the club has two. The head's box spans poll to edge,
    // because that is what the head is; the visible taper is a look and the
    // solver has no use for it.
    this.addPart(
      new PhysicsShapeBox(
        Vector3.Zero(),
        Quaternion.Identity(),
        new Vector3(A.haftDiameter, shaftLength, A.haftDiameter),
        scene,
      ),
      new Vector3(0, shaftCentre, 0),
    );
    this.addPart(
      new PhysicsShapeBox(
        Vector3.Zero(),
        Quaternion.Identity(),
        new Vector3(A.headReach + A.pollReach, A.headLength, A.headThickness),
        scene,
      ),
      new Vector3((A.headReach - A.pollReach) / 2, headCentre, 0),
    );

    return {
      mass: A.mass,
      centreOfMass: new Vector3(A.balanceOffset, A.balancePoint, 0),
      baseOffset: base,
      tipOffset: tip,
      secondGrip: null,
    };
  }

  /**
   * A bow: a stave across the fist, a string behind it, and an arrow that goes
   * where the arm is pointing.
   *
   * It takes the blade's mount, which is the whole design and not a shortcut.
   * The weapon's **+Y runs out along the arm**, so an arrow loosed along +Y goes
   * exactly where a sword's point would have gone -- the aiming is the aiming
   * that already exists, and there is no second control surface, no crosshair
   * and no mode. The stave lies on **+X**, which is the axis `roll` turns the
   * weapon about, so a wrist at zero holds it upright and a rolled wrist cants
   * it. Both of those fall out of the shared local frame rather than being
   * arranged: +X is where an axe's edge goes and where a sword's edge goes, and
   * it is the one axis a wrist owns.
   *
   * The archer is at -Y. So the riser stands proud toward -Y, where the hand
   * is; the string is drawn back past it, further into -Y; and the limbs and the
   * arrow are ahead at +Y. That is a real bow's geometry and it is also the only
   * arrangement in which the hand is not inside the string.
   *
   * **Two shapes, and neither of them is the string.** The stave and the riser
   * are the physics; the string and the nocked arrow are meshes and nothing
   * else. A string that stopped a blade would be a 2 mm rectangle that parries,
   * and a nocked arrow with a body would be a second thing in the world every
   * time somebody held the button down.
   */
  private buildBow(
    scene: Scene,
    name: string,
    materials: WeaponMaterials,
  ): Built {
    const B = CONFIG.bow;
    const half = B.staveLength / 2;

    const stave = MeshBuilder.CreateBox(
      `${name}.stave`,
      { width: B.staveLength, height: B.staveDepth, depth: B.staveThickness },
      scene,
    );
    weaponSurface(stave, "bow.stave", materials);
    stave.parent = this.root;

    // The tips, which are what the string runs between and what makes the
    // silhouette read as a bow rather than as a stick.
    for (const side of [-1, 1]) {
      const tip = MeshBuilder.CreateBox(
        `${name}.tip${side > 0 ? "A" : "B"}`,
        { width: B.staveLength * 0.10, height: B.staveDepth * 0.7, depth: B.staveThickness * 1.4 },
        scene,
      );
      tip.position.set(side * (half - B.staveLength * 0.05), -B.staveDepth * 0.25, 0);
      weaponSurface(tip, side > 0 ? "bow.tipA" : "bow.tipB", materials);
      tip.parent = this.root;
    }

    // The riser: what the hand actually holds, standing proud on the archer's
    // side of the stave.
    const grip = MeshBuilder.CreateBox(
      `${name}.grip`,
      { width: B.gripLength, height: B.gripDepth, depth: B.staveThickness * 1.9 },
      scene,
    );
    grip.position.set(0, -B.gripDepth / 2, 0);
    weaponSurface(grip, "bow.grip", materials);
    grip.parent = this.root;

    // The two halves of the string, and the arrow on it. `drawTo` moves all
    // three; this is only where they begin.
    const stringOf = (label: string) => {
      const mesh = MeshBuilder.CreateBox(
        `${name}.string${label}`,
        { width: 0.004, height: 1, depth: 0.004 },
        scene,
      );
      weaponSurface(mesh, label === "A" ? "bow.stringA" : "bow.stringB", materials);
      mesh.parent = this.root;
      return mesh;
    };
    const upper = stringOf("A");
    const lower = stringOf("B");

    const nocked = MeshBuilder.CreateBox(
      `${name}.nocked`,
      { width: CONFIG.arrow.shaftDiameter, height: CONFIG.arrow.length, depth: CONFIG.arrow.shaftDiameter },
      scene,
    );
    nocked.rotationQuaternion = Quaternion.RotationAxis(new Vector3(1, 0, 0), Math.PI / 2);
    weaponSurface(nocked, "bow.nocked", materials);
    nocked.parent = this.root;

    this.draw = { upper, lower, nocked, brace: B.braceHeight, pull: B.drawLength };
    this.drawTo(0);

    this.addPart(
      new PhysicsShapeBox(
        Vector3.Zero(),
        Quaternion.Identity(),
        new Vector3(B.staveLength, B.staveDepth, B.staveThickness),
        scene,
      ),
      Vector3.Zero(),
    );
    this.addPart(
      new PhysicsShapeBox(
        Vector3.Zero(),
        Quaternion.Identity(),
        new Vector3(B.gripLength, B.gripDepth, B.staveThickness * 1.9),
        scene,
      ),
      new Vector3(0, -B.gripDepth / 2, 0),
    );

    return {
      mass: B.mass,
      // At the fist, which is where a bow balances and is also the one place a
      // centre of mass can be that asks the wrist for nothing.
      centreOfMass: Vector3.Zero(),
      baseOffset: 0,
      tipOffset: B.launchOffset,
      // Two hands, and no second *grip*. See `Built.secondGrip`.
      secondGrip: null,
    };
  }

  /**
   * Show how far the string is back, 0 to 1.
   *
   * A no-op for everything that has no string, so `Arm` calls it without asking
   * what it is holding. The nock travels from the brace height to a full draw
   * along -Y; each half of the string is a unit box stretched and turned to run
   * from a limb tip to wherever the nock now is, and the arrow sits on it.
   *
   * A hold-to-charge control is unplayable without this. It is the same argument
   * the aim indicator was built on: a quantity the player is being asked to
   * manage has to be visible somewhere, and a bow's is *on the bow*.
   */
  drawTo(fraction: number): void {
    const d = this.draw;
    if (!d) return;
    const t = fraction < 0 ? 0 : fraction > 1 ? 1 : fraction;
    const half = CONFIG.bow.staveLength / 2;
    const nockY = -(d.brace + d.pull * t);

    for (const [mesh, side] of [
      [d.upper, 1],
      [d.lower, -1],
    ] as const) {
      const tipX = side * half;
      const tipY = -CONFIG.bow.staveDepth * 0.25;
      const dx = -tipX;
      const dy = nockY - tipY;
      const span = Math.hypot(dx, dy);
      mesh.position.set(tipX + dx / 2, tipY + dy / 2, 0);
      mesh.scaling.set(1, span, 1);
      // The box's own long axis is +Y, so the turn is about +Z and is measured
      // from +Y rather than from +X.
      mesh.rotationQuaternion = Quaternion.RotationAxis(
        new Vector3(0, 0, 1),
        Math.atan2(-dx, dy),
      );
    }

    d.nocked.setEnabled(t > 0);
    // The arrow lies along +Y with its nock on the string, so its centre is half
    // a shaft ahead of the nock.
    d.nocked.position.set(0, nockY + CONFIG.arrow.length / 2, 0);
  }

  /**
   * A club: a long haft with the weight at the far end.
   *
   * The two-handed one, and the only kind whose `hands` is 2. It has no edge, so
   * `scoring.ts` never asks about its +X and a blow with it is worth exactly
   * what its speed is worth -- which is the whole character of the weapon.
   * Everything that makes it feel unlike a sword is here rather than in the
   * damage model: heavier, longer, and with almost all of its mass out at the
   * head, so it takes real time to start and cannot be stopped once it is going.
   */
  private buildClub(
    scene: Scene,
    name: string,
    materials: WeaponMaterials,
  ): Built {
    const C = CONFIG.club;
    // The origin is where the *leading* hand grips, with the butt behind it at
    // negative Y. Every other kind has its origin at the butt, and the club used
    // to as well -- which put the trailing hand off the end of the shaft and,
    // worse, out at a point the second arm could not reach. Two hands need shaft
    // on both sides of the grip, so the grip is the origin.
    const butt = -C.buttLength;
    const haftCentre = butt + C.haftLength / 2;
    const headCentre = butt + C.haftLength + C.headLength / 2;

    const haft = MeshBuilder.CreateCylinder(
      `${name}.haft`,
      {
        height: C.haftLength,
        diameterTop: C.haftDiameter,
        diameterBottom: C.haftDiameter * 0.86,
        tessellation: 10,
      },
      scene,
    );
    haft.position.set(0, haftCentre, 0);
    weaponSurface(haft, "club.haft", materials);
    haft.parent = this.root;

    const head = MeshBuilder.CreateCylinder(
      `${name}.head`,
      {
        height: C.headLength,
        diameterTop: C.headDiameter * 0.9,
        diameterBottom: C.headDiameter,
        tessellation: 12,
      },
      scene,
    );
    head.position.set(0, headCentre, 0);
    weaponSurface(head, "club.head", materials);
    head.parent = this.root;

    // Two bands, which are most of what says this is a weapon rather than a
    // fence post.
    const bands = [butt + C.haftLength, butt + C.haftLength + C.headLength];
    for (let i = 0; i < bands.length; i += 1) {
      const band = MeshBuilder.CreateCylinder(
        `${name}.band${i}`,
        { height: 0.026, diameter: C.headDiameter * 1.05, tessellation: 12 },
        scene,
      );
      band.position.set(0, bands[i], 0);
      weaponSurface(band, i === 0 ? "club.band0" : "club.band1", materials);
      band.parent = this.root;
    }

    const wrap = MeshBuilder.CreateCylinder(
      `${name}.wrap`,
      {
        height: Math.abs(C.secondGrip) + C.gripLength,
        diameter: C.haftDiameter * 1.14,
        tessellation: 10,
      },
      scene,
    );
    // The wrap covers both hands and the span between them, because that is what
    // a person actually holds.
    wrap.position.set(0, C.secondGrip / 2, 0);
    weaponSurface(wrap, "club.wrap", materials);
    wrap.parent = this.root;

    this.addPart(
      new PhysicsShapeBox(
        Vector3.Zero(),
        Quaternion.Identity(),
        new Vector3(C.haftDiameter, C.haftLength, C.haftDiameter),
        scene,
      ),
      new Vector3(0, haftCentre, 0),
    );
    this.addPart(
      new PhysicsShapeBox(
        Vector3.Zero(),
        Quaternion.Identity(),
        new Vector3(C.headDiameter, C.headLength, C.headDiameter),
        scene,
      ),
      new Vector3(0, headCentre, 0),
    );

    return {
      mass: C.mass,
      centreOfMass: new Vector3(0, C.balancePoint, 0),
      baseOffset: 0,
      tipOffset: butt + C.haftLength + C.headLength,
      secondGrip: CONFIG.club.secondGrip,
    };
  }

  /**
   * Add one piece to the compound, and remember it.
   *
   * The remembering is the point: `PhysicsShapeContainer` keeps no list of what
   * has been put in it, and the masks have to reach the leaves. See `parts`.
   */
  private addPart(part: PhysicsShape, offset: Vector3): void {
    this.parts.push(part);
    this.partOffsets.push(offset.clone());
    this.shape.addChild(part, offset);
  }

  /**
   * Put every piece of this weapon on a layer.
   *
   * A method rather than two assignments at the call site, because the two
   * assignments at the call site is what was wrong: `Arm.drop` re-layered a
   * dropped weapon onto `DEBRIS` by writing the container's masks, so a severed
   * arm's sword went on carrying whatever filter its leaves happened to have --
   * which was Havok's default, which is everything. The rule that a dropped
   * weapon "is debris like any other piece" was true in the comment and nowhere
   * in the solver.
   */
  /**
   * The leaf shapes, so a test can ask what the solver is going to ask.
   *
   * Exposed because a readback is the one cheap check that catches the container
   * fault: a container's mask is written, ignored, *and* read back as garbage,
   * so a test that asserts the mask it set is the mask that is there would have
   * failed on day one. `tests/weapons.test.mjs` does exactly that, over every
   * kind.
   */
  get pieces(): readonly PhysicsShape[] {
    return this.parts;
  }

  /** Exact compound layout used by authority-parity tests; returns detached numbers. */
  get physicsLayout(): readonly { offset: readonly number[]; minimum: readonly number[]; maximum: readonly number[] }[] {
    return this.parts.map((part, index) => {
      const bounds = part.getBoundingBox();
      return {
        offset: this.partOffsets[index].asArray(),
        minimum: bounds.minimum.asArray(),
        maximum: bounds.maximum.asArray(),
      };
    });
  }

  relayer(layer: number, collidesWith: number): void {
    for (const part of this.parts) {
      part.filterMembershipMask = layer;
      part.filterCollideMask = collidesWith;
    }
  }

  /**
   * Cut out of the hand that was holding it.
   *
   * The layer and the flag together, because they are two halves of one fact and
   * setting only the first is what `Arm.drop` used to do: the exemption that let
   * a blade pass through its owner belonged to the owner rather than to the
   * steel, so a dropped sword becomes debris -- and debris is not a thing that
   * scores, which is the half nothing was saying.
   */
  discard(): void {
    this.relayer(LAYER.DEBRIS, COLLIDES.DEBRIS);
    this.discarded = true;
  }

  /** World-space direction of the cutting edge (local +X). */
  edgeDirection(): Vector3 {
    const m = this.root.getWorldMatrix();
    return this.scratch.edge.set(m.m[0], m.m[1], m.m[2]).normalize();
  }

  /** World-space direction along the blade toward the tip (local +Y). */
  bladeDirection(): Vector3 {
    const m = this.root.getWorldMatrix();
    return this.scratch.blade.set(m.m[4], m.m[5], m.m[6]).normalize();
  }

  /** World-space normal of the flat of the blade (local +Z). */
  flatDirection(): Vector3 {
    const m = this.root.getWorldMatrix();
    return this.scratch.flat.set(m.m[8], m.m[9], m.m[10]).normalize();
  }

  tipPosition(): Vector3 {
    const dir = this.bladeDirection();
    return this.scratch.tip.copyFrom(this.root.absolutePosition).addInPlace(dir.scale(this.tipOffset));
  }

  /** Velocity of the material point of the sword currently at `world`. */
  velocityAt(world: Vector3): Vector3 {
    const linear = this.body.getLinearVelocity();
    const angular = this.body.getAngularVelocity();
    const centre = this.body.getObjectCenterWorld();
    this.scratch.rel.copyFrom(world).subtractInPlace(centre);
    Vector3.CrossToRef(angular, this.scratch.rel, this.scratch.vel);
    return this.scratch.vel.addInPlace(linear);
  }

  tipSpeed(): number {
    return this.velocityAt(this.tipPosition()).length();
  }

  /**
   * The point of the blade, taken from the node's own transform rather than from
   * its cached world matrix.
   *
   * A second way to ask the same question, which normally would be exactly the
   * sort of duplication this directory refuses -- and it is here because the two
   * ways are *not* interchangeable, and finding that out cost a session.
   *
   * `tipPosition` above goes through `getWorldMatrix()`, which short-circuits on
   * the scene's render id: the first caller in a rendered frame recomputes the
   * matrix and stamps the id, and every caller after it that frame gets that
   * first sample. That is harmless when only the renderer and the damage model
   * ask, because both ask once a frame. It is not harmless when something asks
   * 240 times a second, because the *stamp* is a side effect: it silently
   * converts every later reader in that frame -- including a person measuring
   * from the console -- from a fresh sample to a stale one. That is exactly what
   * happened when the `Mind` seam landed and it read as the arm having got 9 %
   * worse. The arm had not moved at all.
   *
   * So this reads `root.position` and `root.rotationQuaternion` instead. The
   * sword's root is a scene-root `TransformNode`, so those two fields *are* its
   * world transform, and they are what Havok's `syncTransform` writes at the end
   * of every solver step -- which makes this both cache-free and strictly
   * fresher than the matrix. `(0, 1, 0)` turned by the quaternion is the second
   * column of the rotation matrix, written out rather than composed, because a
   * three-line expression is easier to be sure of than a matrix product.
   */
  tipPositionToRef(ref: Vector3): Vector3 {
    if (!this.root.rotationQuaternion) return ref.copyFrom(this.root.position);
    return this.bladeDirectionToRef(ref)
      .scaleInPlace(this.tipOffset)
      .addInPlace(this.root.position);
  }

  /**
   * Which way the weapon is pointing -- local +Y -- taken the same cache-free
   * way, and for the same reason.
   *
   * `bladeDirection()` above goes through `getWorldMatrix()`, which is right for
   * the damage model, which asks once per contact inside a rendered frame. **An
   * arrow is loosed on the control step**, 240 times a second, and a reader
   * there is first by up to three substeps -- so asking that way would stamp the
   * render id and quietly convert every later reader that frame, the renderer
   * included, into a reader of the control loop's sample. That is the fault that
   * read as a 9 % regression in the arm and cost a session; `tipPositionToRef`
   * exists because of it, and this is the direction half of the same argument.
   */
  bladeDirectionToRef(ref: Vector3): Vector3 {
    const q = this.root.rotationQuaternion;
    if (!q) return ref.set(0, 1, 0);
    return ref.set(
      2 * (q.x * q.y - q.w * q.z),
      1 - 2 * (q.x * q.x + q.z * q.z),
      2 * (q.y * q.z + q.w * q.x),
    );
  }

  /**
   * Velocity of the material point of the sword currently at `world`, written
   * into a ref the caller owns, without touching a world matrix and without
   * allocating.
   *
   * The same arithmetic as `velocityAt`, which is left exactly as it is because
   * the damage model is built on it and no session is allowed to go near that.
   * `getObjectCenterWorld` reads `transformNode.position` for a non-instanced
   * body, so the centre is cache-free already; only the three `Vector3`s it and
   * the two velocity getters allocate are worth avoiding, and they are worth
   * avoiding here because this runs four times per solver step -- once per hand
   * per fighter, from `describeFighter`.
   *
   * `ref` is written rather than returned from scratch so that two hands
   * published in the same pass cannot end up holding one vector, which is
   * exactly the fault `Arrow`'s two original readers have.
   */
  velocityAtToRef(world: Vector3, ref: Vector3): Vector3 {
    const s = this.scratch;
    this.body.getLinearVelocityToRef(s.freeLin);
    this.body.getAngularVelocityToRef(s.freeAng);
    this.body.getObjectCenterWorldToRef(s.freeCentre);
    s.freeRel.copyFrom(world).subtractInPlace(s.freeCentre);
    Vector3.CrossToRef(s.freeAng, s.freeRel, ref);
    return ref.addInPlace(s.freeLin);
  }

  /**
   * Speed of that same point, which is the magnitude of the line above.
   *
   * Delegated rather than repeated: this was the whole of `velocityAt`'s
   * arithmetic written out a second time, and a copy of a formula is a copy
   * somebody edits.
   */
  speedAt(world: Vector3): number {
    return this.velocityAtToRef(world, this.scratch.freeTip).length();
  }

  /**
   * Take the blade out of the world.
   *
   * The body goes before the node it is attached to. Disposing the node first
   * leaves a live Havok body pointing at a freed transform, which does not throw
   * -- it simply keeps being stepped, invisibly, for the rest of the run.
   */
  dispose(): void {
    this.body.dispose();
    disposeCarriedRoot(this.root);
  }
}
