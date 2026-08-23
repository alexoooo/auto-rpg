import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { Vector3, Quaternion, Matrix } from "@babylonjs/core/Maths/math.vector.js";
import { PhysicsBody } from "@babylonjs/core/Physics/v2/physicsBody.js";
import {
  PhysicsShapeBox,
  PhysicsShapeContainer,
  PhysicsShapeCylinder,
} from "@babylonjs/core/Physics/v2/physicsShape.js";
import { PhysicsMotionType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";
import type { Material } from "@babylonjs/core/Materials/material.js";
import type { Scene } from "@babylonjs/core/scene.js";

import { CONFIG } from "./config.ts";
import {
  WEAPON_KINDS,
  handsFor,
  isShield,
  isStrapped,
  isStriking,
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
export { WEAPON_KINDS, handsFor, isShield, isStrapped, isStriking };

export interface WeaponMaterials {
  steel: Material;
  leather: Material;
  brass: Material;
  wood: Material;
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
 */
export interface Mount {
  /** Where the weapon's own +X points, in the hand's frame. */
  axis: Vector3;
  /** Where the weapon's own +Y points, in the hand's frame. */
  perp: Vector3;
}

export const mountFor = (kind: WeaponKind): Mount =>
  kind === "shield"
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
  /** Two for the club, one for everything else. */
  readonly hands: 1 | 2;
  readonly root: TransformNode;
  readonly body: PhysicsBody;
  readonly shape: PhysicsShapeContainer;

  /** Distance from origin to the point of the blade, along local +Y. */
  readonly tipOffset: number;
  /** Where the blade proper begins -- the guard. */
  readonly baseOffset: number;

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
    this.hands = handsFor(opts.kind);

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
        opts.kind === "shield"
          ? this.buildShield(scene, opts.name, materials)
          : opts.kind === "buckler"
            ? this.buildBuckler(scene, opts.name, materials)
            : opts.kind === "club"
              ? this.buildClub(scene, opts.name, materials)
              : unbuildable(opts.kind);
      this.baseOffset = built.baseOffset;
      this.tipOffset = built.tipOffset;
      this.body = this.finish(scene, opts, built.mass, built.centreOfMass);
      return;
    }

    const { bladeLength, bladeWidth, bladeThickness, guardWidth, gripLength, mass, balancePoint } =
      CONFIG.sword;

    this.baseOffset = gripLength / 2;
    this.tipOffset = this.baseOffset + bladeLength;

    const bladeCentre = this.baseOffset + bladeLength / 2;

    const blade = MeshBuilder.CreateBox(
      `${opts.name}.blade`,
      { width: bladeWidth, height: bladeLength, depth: bladeThickness },
      scene,
    );
    blade.position.set(0, bladeCentre, 0);
    blade.material = materials.steel;
    blade.parent = this.root;

    // A short secondary box at the point reads as a taper without needing a
    // custom mesh, and costs nothing.
    const point = MeshBuilder.CreateBox(
      `${opts.name}.point`,
      { width: bladeWidth * 0.45, height: bladeLength * 0.16, depth: bladeThickness * 0.9 },
      scene,
    );
    point.position.set(0, this.tipOffset - bladeLength * 0.08, 0);
    point.material = materials.steel;
    point.parent = this.root;

    const guard = MeshBuilder.CreateBox(
      `${opts.name}.guard`,
      { width: guardWidth, height: 0.026, depth: 0.038 },
      scene,
    );
    guard.position.set(0, this.baseOffset, 0);
    guard.material = materials.brass;
    guard.parent = this.root;

    const grip = MeshBuilder.CreateCylinder(
      `${opts.name}.grip`,
      { height: gripLength, diameterTop: 0.028, diameterBottom: 0.034, tessellation: 10 },
      scene,
    );
    grip.material = materials.leather;
    grip.parent = this.root;

    const pommel = MeshBuilder.CreateSphere(
      `${opts.name}.pommel`,
      { diameter: 0.052, segments: 8 },
      scene,
    );
    pommel.position.set(0, -gripLength / 2, 0);
    pommel.material = materials.brass;
    pommel.parent = this.root;

    // Physics: one compound shape, so the guard can turn a blow and the pommel
    // has presence, rather than the blade being the only thing in the world.
    this.shape.addChild(
      new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), new Vector3(bladeWidth, bladeLength, bladeThickness), scene),
      new Vector3(0, bladeCentre, 0),
    );
    this.shape.addChild(
      new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), new Vector3(guardWidth, 0.026, 0.038), scene),
      new Vector3(0, this.baseOffset, 0),
    );
    this.shape.addChild(
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
    this.shape.filterMembershipMask = opts.layer;
    this.shape.filterCollideMask = opts.collidesWith;

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
    plate.material = materials.wood;
    plate.parent = this.root;

    const rim = MeshBuilder.CreateBox(
      `${name}.rim`,
      { width: S.width * 1.05, height: S.thickness * 0.55, depth: S.height * 1.04 },
      scene,
    );
    rim.position.set(0, out - S.thickness * 0.55, along);
    rim.material = materials.steel;
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
    boss.material = materials.steel;
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
    grip.material = materials.leather;
    grip.parent = this.root;

    // One box for the whole face. A shield does not need a compound shape: it is
    // a flat thing whose job is to occupy a rectangle, and every extra child is
    // another pair the solver tests every step for the rest of the bout.
    this.shape.addChild(
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
    plate.material = materials.steel;
    plate.parent = this.root;

    const rim = MeshBuilder.CreateTorus(
      `${name}.rim`,
      { diameter: B.diameter, thickness: B.thickness * 1.8, tessellation: 20 },
      scene,
    );
    rim.position.set(0, out, 0);
    rim.material = materials.brass;
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
    boss.material = materials.steel;
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
    grip.material = materials.leather;
    grip.parent = this.root;

    this.shape.addChild(
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
    };
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
    haft.material = materials.wood;
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
    head.material = materials.wood;
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
      band.material = materials.steel;
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
    wrap.material = materials.leather;
    wrap.parent = this.root;

    this.shape.addChild(
      new PhysicsShapeBox(
        Vector3.Zero(),
        Quaternion.Identity(),
        new Vector3(C.haftDiameter, C.haftLength, C.haftDiameter),
        scene,
      ),
      new Vector3(0, haftCentre, 0),
    );
    this.shape.addChild(
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
    };
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
    const q = this.root.rotationQuaternion;
    if (!q) return ref.copyFrom(this.root.position);
    return ref
      .set(
        2 * (q.x * q.y - q.w * q.z),
        1 - 2 * (q.x * q.x + q.z * q.z),
        2 * (q.y * q.z + q.w * q.x),
      )
      .scaleInPlace(this.tipOffset)
      .addInPlace(this.root.position);
  }

  /**
   * Speed of the material point of the sword currently at `world`, without
   * touching a world matrix and without allocating.
   *
   * The same arithmetic as `velocityAt`, which is left exactly as it is because
   * the damage model is built on it and this session is not allowed to go near
   * that. `getObjectCenterWorld` reads `transformNode.position` for a
   * non-instanced body, so the centre is cache-free already; only the three
   * `Vector3`s it and the two velocity getters allocate are worth avoiding, and
   * they are worth avoiding here because this runs four times per solver step.
   */
  speedAt(world: Vector3): number {
    const s = this.scratch;
    this.body.getLinearVelocityToRef(s.freeLin);
    this.body.getAngularVelocityToRef(s.freeAng);
    this.body.getObjectCenterWorldToRef(s.freeCentre);
    s.freeRel.copyFrom(world).subtractInPlace(s.freeCentre);
    Vector3.CrossToRef(s.freeAng, s.freeRel, s.freeTip);
    return s.freeTip.addInPlace(s.freeLin).length();
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
    this.root.dispose(false, true);
  }
}
