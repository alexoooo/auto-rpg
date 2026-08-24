import { Vector3, Quaternion, Matrix } from "@babylonjs/core/Maths/math.vector.js";
import { Physics6DoFConstraint } from "@babylonjs/core/Physics/v2/physicsConstraint.js";
import {
  PhysicsConstraintAxis,
  PhysicsConstraintAxisLimitMode,
  PhysicsConstraintMotorType,
  PhysicsMotionType,
} from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";
import type { Material } from "@babylonjs/core/Materials/material.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import type { Scene } from "@babylonjs/core/scene.js";

import { CONFIG } from "./config.ts";
import { mirroredWristBend, type ArmPose, type HandIntent, type HandName } from "./mind.ts";
import { azimuthOf } from "./policies.ts";
import { capsulePart, spherePart, joint, type Part } from "./rig.ts";
import {
  Weapon,
  isStrapped,
  mountFor,
  mountRotation,
  type WeaponKind,
  type WeaponMaterials,
} from "./weapon.ts";
import { isShooting } from "./hands.ts";
import { Quiver } from "./arrow.ts";
import { nextDraw } from "./buttons.ts";
import type { Striking } from "./combat.ts";

const LINEAR = [
  PhysicsConstraintAxis.LINEAR_X,
  PhysicsConstraintAxis.LINEAR_Y,
  PhysicsConstraintAxis.LINEAR_Z,
] as const;

const ANGULAR = [
  PhysicsConstraintAxis.ANGULAR_X,
  PhysicsConstraintAxis.ANGULAR_Y,
  PhysicsConstraintAxis.ANGULAR_Z,
] as const;

const clamp = (value: number, low: number, high: number) =>
  value < low ? low : value > high ? high : value;

/** The torso's own forward, which is what a shield squares itself to. */
const FORWARD = new Vector3(0, 0, 1);
const UP = new Vector3(0, 1, 0);

/**
 * A striking seam over the hand that is already in the solver.
 *
 * It owns no mesh, body, shape or constraint. That absence is the design: a
 * punch is stopped by the visible fist, carries the fist's actual material-point
 * velocity, and becomes spent with the arm it belongs to.
 */
export class FistStrike implements Striking {
  readonly kind = "empty" as const;
  readonly hand: HandName;
  readonly body: Part["body"];
  private readonly part: Part;
  private readonly isSpent: () => boolean;
  private readonly scratch = {
    rel: new Vector3(),
    velocity: new Vector3(),
    tip: new Vector3(),
    edge: new Vector3(),
    blade: new Vector3(),
    basis: new Matrix(),
  };

  constructor(part: Part, hand: HandName, isSpent: () => boolean) {
    this.part = part;
    this.hand = hand;
    this.body = part.body;
    this.isSpent = isSpent;
    // Havok emits no per-body contacts until this is enabled. A weapon does it
    // in its constructor; the fist has no weapon constructor to do it for us.
    this.body.setCollisionCallbackEnabled(true);
  }

  get spent(): boolean {
    return this.isSpent();
  }

  velocityAt(world: Vector3): Vector3 {
    const linear = this.body.getLinearVelocity();
    const angular = this.body.getAngularVelocity();
    this.scratch.rel.copyFrom(world).subtractInPlace(this.body.getObjectCenterWorld());
    Vector3.CrossToRef(angular, this.scratch.rel, this.scratch.velocity);
    return this.scratch.velocity.addInPlace(linear);
  }

  edgeDirection(): Vector3 {
    const rotation = this.part.mesh.rotationQuaternion ?? Quaternion.Identity();
    Matrix.FromQuaternionToRef(rotation, this.scratch.basis);
    return this.scratch.edge.set(
      this.scratch.basis.m[0],
      this.scratch.basis.m[1],
      this.scratch.basis.m[2],
    );
  }

  bladeDirection(): Vector3 {
    const rotation = this.part.mesh.rotationQuaternion ?? Quaternion.Identity();
    Matrix.FromQuaternionToRef(rotation, this.scratch.basis);
    return this.scratch.blade.set(
      this.scratch.basis.m[4],
      this.scratch.basis.m[5],
      this.scratch.basis.m[6],
    );
  }

  tipPosition(): Vector3 {
    return this.scratch.tip.copyFrom(this.part.mesh.position);
  }
}

/**
 * The frame a hand is *built* in, which is not always the fighter's own.
 *
 * Every arm is built hanging straight down and lifted by its anchor on the first
 * step, so a hand's build orientation used to be a detail nobody could see. A
 * shield made it visible and then made it fatal: the plate stands 110 mm off the
 * fist along the hand's +X, and a hand built in the torso's frame has its +X
 * pointing at the torso -- so the off hand's shield was built **inside its
 * owner's pelvis**, on a layer that says the two may not overlap. The contact
 * pinned the arm at full extension before it had lifted once, the hand therefore
 * never re-orientated, and the overlap therefore never cleared: a deadlock on
 * frame one, and the whole of why a shield arm tracked its anchor 350 mm away
 * instead of the sword's nothing.
 *
 * So a shield hand is built already turned to face the front, which is where
 * `driveAnchor` puts it on the first step anyway. Only the hand and its anchor:
 * the two capsules above are round about their own axis, and their joints' cones
 * are written in the torso's frame and would move with them.
 */
function handFrame(kind: WeaponKind, rotation: Quaternion): Quaternion {
  if (!isStrapped(kind)) return rotation;
  const local = Matrix.Identity();
  // +X to the torso's front, +Y still up the arm, +Z following from those two.
  Matrix.FromXYZAxesToRef(FORWARD, new Vector3(0, 1, 0), new Vector3(-1, 0, 0), local);
  const base = Matrix.Identity();
  Matrix.FromQuaternionToRef(rotation, base);
  return Quaternion.FromRotationMatrix(local.multiply(base));
}

/** Map a signed -1..1 stick position onto an asymmetric range. */
const spread = (t: number, min: number, max: number) => (t < 0 ? -t * min : t * max);

export interface ArmOptions {
  hand: HandName;
  /**
   * Name prefix for every body in the chain, e.g. `left.sword`. Two fighters
   * each with two arms is four chains in one scene, and they have to be told
   * apart in the inspector, in a picking predicate and in a mesh list.
   */
  name: string;
  /** The physical bone the shoulder hangs from. */
  torso: Part;
  /** Physical chest frame used for the moving shoulder sockets. */
  trunkFrame: () => Matrix;
  /** Upright pelvis-heading frame used for cursor direction and elbow intent. */
  locomotionFrame: () => Matrix;
  /** Where the shoulder sits in the torso's own local frame. */
  shoulderLocal: Vector3;
  /** Where that shoulder is in world space at the moment of construction. */
  shoulderWorld: Vector3;
  /** The fighter's facing, so nothing is built at odds with the weld. */
  rotation: Quaternion;
  layer: number;
  collidesWith: number;
  weaponLayer: number;
  weaponCollidesWith: number;
  /**
   * The side's arrow layer, for the quiver a shooting hand builds.
   *
   * Passed rather than derived, like every other mask here: `layersFor` is the
   * one place that decides what a side owns, and an arm that worked its own out
   * would be a second copy of that table.
   */
  arrowLayer: number;
  arrowCollidesWith: number;
  /** What this hand holds. `empty` builds no body and welds nothing. */
  weapon: WeaponKind;
  /**
   * Whether the bare capsules are drawn and can be picked.
   *
   * The driven arm has always been the one part of a fighter shown as itself,
   * because it is the subject of the whole prototype and putting a sleeve over
   * it would be hiding the thing being looked at. That argument was written when
   * there was one driven arm and a costume covering everything else; with two,
   * it holds for both or for neither. The second arm is covered for now because
   * the authored asset already carries a sleeve for that side and nothing yet
   * carries one for the first -- an asymmetry of the asset, not of the design,
   * and `docs/measurements.md` records it as owed.
   */
  visible?: boolean;
}

export interface ArmMaterials extends WeaponMaterials {
  cloth: Material;
  flesh: Material;
}

/**
 * One arm: three bones, three joints, a weapon welded into the fist, and two
 * keyframed anchors that drag the whole thing about.
 *
 * This used to be two hundred lines in the middle of `Fighter`'s constructor and
 * eleven singular fields on the class, which was exactly the right shape while
 * there was one of them. It is a class now because there are two, and because
 * every piece of per-arm state it carries -- the pose scalars, the previous
 * frame's basis, the commanded spin the grip damper measures against -- is state
 * that two arms must not share. A single `prevX` serving two chains is not a
 * subtle bug; it is the second arm being handed the first one's history every
 * step.
 *
 * **Nothing about the arm's behaviour changed when it moved here.** The bodies
 * are built in the same order, with the same dimensions, pivots, limits and
 * masses, and the four per-step methods are the same arithmetic. That was the
 * whole discipline of the extraction: the peak anchor-to-hand error over the
 * standard sweep is a number this directory has already watched move by 21 mm
 * from nothing but a change of build order, so a refactor that also changed a
 * reading would have been impossible to tell from a refactor that broke
 * something.
 */
export class Arm {
  readonly upperArm: Part;
  readonly forearm: Part;
  readonly hand: Part;
  readonly handAnchor: Part;
  readonly elbowAnchor: Part;
  /**
   * What this hand holds, or null for an empty one.
   *
   * Null rather than a `Weapon` of kind `empty`, and the two are not the same
   * decision. `WeaponKind` keeps `empty` because every *question* about a hand
   * has an answer for an empty one; the physics does not, because there is no
   * body to weld and nothing for `Combat` to watch. So the kind is total and the
   * object is not.
   */
  readonly weapon: Weapon | null;
  /** The real hand exposed through the combat seam; no proxy physics exists. */
  readonly fist: FistStrike | null;

  /**
   * Arrows, for a hand that holds something that shoots, and null otherwise.
   *
   * On the arm rather than on the fighter because everything a shot needs is
   * here: the intent that draws it, the weapon whose +Y it flies along, and the
   * control step it happens on. `Fighter.strikers` is what gathers it back up
   * for `Combat`.
   */
  readonly quiver: Quiver | null;

  /**
   * How far the string is back, 0 to 1.
   *
   * The only piece of state in this file that a *button* owns rather than the
   * solver, and it is one number because `buttons.ts` keeps it that way. See
   * `nextDraw`: a draw is a level and a loose is the edge where it ends.
   */
  private draw = 0;

  /** The three joints of the chain. Each is a limb's `attachment`. */
  readonly shoulder: Physics6DoFConstraint;
  readonly elbow: Physics6DoFConstraint;
  readonly wrist: Physics6DoFConstraint;

  /** The two drives. Both are disposed by `drop`. */
  readonly grip: Physics6DoFConstraint;
  readonly elbowDrive: Physics6DoFConstraint;

  /**
   * The weld that makes the blade rigid to the hand.
   *
   * Held only to dispose it. It is the one constraint here that no limb owns and
   * so the one nothing else would take down: `PhysicsBody.dispose` releases the
   * Havok body and walks straight past whatever is constraining it, so a bout
   * rebuilt on `R` would leak this one every time.
   */
  private readonly weld: Physics6DoFConstraint | null;

  /**
   * Whether this hand's frame is measured from the fighter's front rather than
   * from world up.
   *
   * True for a shield and only for a shield. It is what makes `roll` mean "how
   * far the shield is angled off square" instead of "which way the edge lies",
   * and it is read on the hot path every step, so it is settled once at
   * construction rather than asked of the weapon.
   */
  private readonly squaresToFront: boolean;

  /**
   * Which way is away from the body for this arm: +1 or -1.
   *
   * Read off the shoulder, which is the only thing an arm knows about which side
   * of a fighter it is. It settles one tie and one only -- see `driveAnchor` --
   * and it is a constant, so it can never flip a shield over mid-swing.
   */
  private readonly outboard: number;

  /**
   * The second weld, when this arm is the trailing hand on a two-hander.
   *
   * Set from outside by `Fighter`, because it joins two arms and neither of them
   * can build it alone. See `takeSecondGrip`.
   */
  private shared: Physics6DoFConstraint | null = null;

  /**
   * What this arm's grip motors are worth, as a multiplier on the `arm` block.
   *
   * One for an ordinary hand. `Fighter` sets it on both arms of a two-hander:
   * nothing for the trailing hand and two arms' worth for the leading one. Read
   * by `applyTuning`, so it is live-tunable like everything else there.
   */
  gripScale = 1;

  /** The bare capsules, for the fighter's `owned` set and so its pick works. */
  readonly meshes: readonly Mesh[];

  /** Hand target in torso space: azimuth, elevation, and distance out. */
  private azimuth = 0.3;
  private elevation = -0.15;
  private roll = 0;
  private wristBend = 0;
  private armReach = CONFIG.arm.reachNeutral;

  private lost = false;
  private hasPreviousFrame = false;

  private readonly trunkFrame: () => Matrix;
  private readonly locomotionFrame: () => Matrix;
  private readonly shoulderLocal: Vector3;

  /** Principal moments of the sword, cached: the grip damper needs them to bleed
   *  off spin evenly about a body whose inertia varies a thousandfold by axis. */
  private readonly weaponInertia = new Vector3(1, 1, 1);

  /**
   * One arm's scratch, and one arm's only.
   *
   * `driveAnchor` reads the basis `driveAnchor` left last step, `driveElbow`
   * reads the target and shoulder `aim` computed this step, and `dampGrip`
   * measures against the `commandedSpin` `driveAnchor` just wrote. Every one of
   * those is a conversation an arm has with itself, and sharing the vectors
   * between two arms would have each of them answering the other's questions.
   */
  private readonly scratch = {
    dirLocal: new Vector3(),
    shoulder: new Vector3(),
    target: new Vector3(),
    aim: new Vector3(),
    /**
     * The torso's own centre, in world space, as of this step's `aim`.
     *
     * The centre of the sphere a shield's face points out of. It replaced the
     * torso's *forward*, which is what the seed used to be and is the reason a
     * plate faced the sky: see `driveAnchor`.
     */
    centre: new Vector3(),
    /** The horizontal square to the arm, for conditioning a shield's frame. */
    lateral: new Vector3(),
    aimFar: new Vector3(),
    grip: new Vector3(),
    edge: new Vector3(),
    axisX: new Vector3(1, 0, 0),
    axisY: new Vector3(0, 1, 0),
    axisZ: new Vector3(0, 0, 1),
    prevX: new Vector3(1, 0, 0),
    prevY: new Vector3(0, 1, 0),
    prevZ: new Vector3(0, 0, 1),
    cross: new Vector3(),
    commandedSpin: new Vector3(),
    basis: new Matrix(),
    rotation: new Quaternion(),
    along: new Vector3(),
    /** Where an arrow is pointed, and where it starts. Owned, because
     *  `bladeDirectionToRef` writes into whatever it is handed. */
    shot: new Vector3(),
    nock: new Vector3(),
    pole: new Vector3(),
    sideways: new Vector3(),
    elbowPoint: new Vector3(),
    boneX: new Vector3(),
    boneY: new Vector3(),
    boneZ: new Vector3(),
    elbowBasis: new Matrix(),
    elbowRotation: new Quaternion(),
    swordSpin: new Vector3(),
    localSpin: new Vector3(),
    impulse: new Vector3(),
    swordFrame: new Matrix(),
    swordFrameInverse: new Matrix(),
  };

  constructor(scene: Scene, opts: ArmOptions, materials: ArmMaterials) {
    const A = CONFIG.arm;
    this.trunkFrame = opts.trunkFrame;
    this.locomotionFrame = opts.locomotionFrame;
    this.shoulderLocal = opts.shoulderLocal.clone();

    const armDrop = (drop: number): Vector3 =>
      opts.shoulderWorld.add(new Vector3(0, -drop, 0));

    // A driven arm's capsules are the only bones drawn as themselves, and they
    // always have been: the costume leaves them out on purpose, because the arm
    // is the subject of the whole prototype and putting a sleeve over it would be
    // hiding the thing being looked at. They are pickable for the same reason the
    // costume is -- an arm is a limb like any other and hovering it should say so.
    const handRotation = handFrame(opts.weapon, opts.rotation);
    this.outboard = opts.shoulderLocal.x >= 0 ? 1 : -1;

    const built: Mesh[] = [];
    const limb = (
      name: string,
      drop: number,
      length: number,
      radius: number,
      mass: number,
      material: Material,
      rotation = opts.rotation,
    ): Part => {
      const part = capsulePart(scene, {
        name: `${opts.name}.${name}`,
        position: armDrop(drop),
        rotation,
        height: length,
        radius,
        mass,
        layer: opts.layer,
        collidesWith: opts.collidesWith,
        material,
      });
      if (opts.visible === false) {
        part.mesh.isVisible = false;
        part.mesh.isPickable = false;
      } else {
        built.push(part.mesh);
      }
      return part;
    };

    // Rest pose: the arm hangs straight down, and the anchor lifts it on frame one.
    this.upperArm = limb("upperArm", A.upperLength / 2, A.upperLength, A.upperRadius, A.upperMass, materials.cloth);
    this.forearm = limb("forearm", A.upperLength + A.foreLength / 2, A.foreLength, A.foreRadius, A.foreMass, materials.leather);
    this.hand = limb("hand", A.upperLength + A.foreLength + A.handLength / 2, A.handLength, A.handRadius, A.handMass, materials.flesh, handRotation);
    this.fist = opts.weapon === "empty" ? new FistStrike(this.hand, opts.hand, () => this.lost) : null;
    this.meshes = built;

    // Shoulder: a ball joint with a generous cone. The limits exist to rule out
    // inhuman poses, not to shape the motion.
    this.shoulder = joint(scene, opts.torso, this.upperArm, {
      pivotParent: this.shoulderLocal,
      pivotChild: new Vector3(0, A.upperLength / 2, 0),
      swing: {
        x: { min: -2.7, max: 1.5 },
        y: { min: -1.9, max: 1.9 },
        z: this.outboard > 0 ? { min: -1.7, max: 0.6 } : { min: -0.6, max: 1.7 },
      },
    });

    // Elbow: a hinge. It bends one way, like an elbow.
    this.elbow = joint(scene, this.upperArm, this.forearm, {
      pivotParent: new Vector3(0, -A.upperLength / 2, 0),
      pivotChild: new Vector3(0, A.foreLength / 2, 0),
      swing: { x: { min: -2.45, max: 0 } },
    });

    // The wrist holds the hand onto the forearm but does not constrain its
    // orientation at all.
    //
    // It used to carry limits on all three angular axes, and that quietly made
    // the system over-constrained: the grip below commands the hand's absolute
    // orientation, while the wrist was simultaneously constraining that same
    // orientation relative to the forearm. Whenever the commanded pose sat near
    // a wrist limit the motor and the limit pushed against each other every
    // step, and the sword buzzed in the hand even with the cursor held still.
    // Leaving the angular axes free hands orientation authority to exactly one
    // constraint, and the elbow hinge and shoulder cone still keep the arm human.
    this.wrist = joint(scene, this.forearm, this.hand, {
      pivotParent: new Vector3(0, -A.foreLength / 2, 0),
      pivotChild: new Vector3(0, A.handLength / 2, 0),
      swing: {
        x: { min: -Math.PI, max: Math.PI },
        y: { min: -Math.PI, max: Math.PI },
        z: { min: -Math.PI, max: Math.PI },
      },
    });

    const fistWorld = armDrop(A.upperLength + A.foreLength + A.handLength);
    // Which two of its own axes this kind pins to which two of the hand's. A
    // blade leaves the fist pointing *away* from the wrist, so its +Y welds to
    // the hand's -Y; getting that backwards put the blade back up through the
    // forearm, which is invisible when the fighter does not collide with itself
    // and baffling when you try to swing. A shield welds differently, and
    // `mountFor` is where the difference and the argument for it live.
    const mount = mountFor(opts.weapon);
    this.squaresToFront = isStrapped(opts.weapon);

    this.weapon =
      opts.weapon === "empty"
        ? null
        : new Weapon(
            scene,
            {
              name: `${opts.name}.weapon`,
              hand: opts.hand,
              kind: opts.weapon,
              position: fistWorld,
              // The rotation the weld is about to demand, rather than the
              // fighter's own: a weapon built in the wrong frame is a violation
              // the solver clears on the first step by throwing it there.
              rotation: mountRotation(opts.weapon, handRotation),
              layer: opts.weaponLayer,
              collidesWith: opts.weaponCollidesWith,
            },
            materials,
          );

    // Built with the arm and never during a bout -- see `arrow.ts`, which
    // explains why that is the whole design rather than an optimisation.
    this.quiver = !isShooting(opts.weapon)
      ? null
      : new Quiver(
          scene,
          {
            name: `${opts.name}.arrow`,
            hand: opts.hand,
            layer: opts.arrowLayer,
            collidesWith: opts.arrowCollidesWith,
          },
          materials,
        );

    this.weld = !this.weapon ? null : joint(scene, this.hand, {
      name: `${opts.name}.weapon`,
      mesh: this.hand.mesh,
      body: this.weapon.body,
      shape: this.weapon.shape,
    }, {
      pivotParent: new Vector3(0, -A.handLength / 2, 0),
      pivotChild: Vector3.Zero(),
      axisParent: mount.axis,
      axisChild: new Vector3(1, 0, 0),
      perpParent: mount.perp,
      perpChild: new Vector3(0, 1, 0),
      swing: {},
    });

    // The anchor: massless, collides with nothing, and exists only to be a frame
    // the solver can pull the hand toward.
    this.handAnchor = spherePart(scene, {
      name: `${opts.name}.handAnchor`,
      position: fistWorld,
      // The hand's frame, not the fighter's: the grip pins the two together and
      // a pair that starts a quarter turn apart starts with a violation.
      rotation: handRotation,
      diameter: 0.02,
      mass: 0,
      layer: 0,
      collidesWith: 0,
      motionType: PhysicsMotionType.ANIMATED,
      visible: false,
    });

    this.grip = new Physics6DoFConstraint(
      {
        pivotA: Vector3.Zero(),
        pivotB: Vector3.Zero(),
        axisA: new Vector3(1, 0, 0),
        axisB: new Vector3(1, 0, 0),
        perpAxisA: new Vector3(0, 1, 0),
        perpAxisB: new Vector3(0, 1, 0),
        collision: false,
      },
      [],
      scene,
    );
    this.handAnchor.body.addConstraint(this.hand.body, this.grip);

    // Every axis free, every axis motorised toward zero offset. The force
    // ceiling is what makes the sword feel heavy: the motor is simply unable to
    // drag it instantly, so the blade lags, overshoots, and carries momentum.
    for (const axis of [...LINEAR, ...ANGULAR]) {
      this.grip.setAxisMode(axis, PhysicsConstraintAxisLimitMode.FREE);
      this.grip.setAxisMotorType(axis, PhysicsConstraintMotorType.POSITION);
      this.grip.setAxisMotorTarget(axis, 0);
    }

    // The elbow's anchor. Every linear axis is free and *unmotorised*, so this
    // constraint says nothing about where the upper arm is -- only which way it
    // points. The shoulder joint already fixes the elbow's distance from the
    // shoulder, so a direction is all that is missing.
    this.elbowAnchor = spherePart(scene, {
      name: `${opts.name}.elbowAnchor`,
      position: opts.shoulderWorld,
      rotation: opts.rotation,
      diameter: 0.02,
      mass: 0,
      layer: 0,
      collidesWith: 0,
      motionType: PhysicsMotionType.ANIMATED,
      visible: false,
    });

    this.elbowDrive = new Physics6DoFConstraint(
      {
        pivotA: Vector3.Zero(),
        pivotB: Vector3.Zero(),
        axisA: new Vector3(1, 0, 0),
        axisB: new Vector3(1, 0, 0),
        perpAxisA: new Vector3(0, 1, 0),
        perpAxisB: new Vector3(0, 1, 0),
        collision: false,
      },
      [],
      scene,
    );
    this.elbowAnchor.body.addConstraint(this.upperArm.body, this.elbowDrive);
    for (const axis of [...LINEAR, ...ANGULAR]) {
      this.elbowDrive.setAxisMode(axis, PhysicsConstraintAxisLimitMode.FREE);
    }
    // X and Z only. The bone runs along its own local Y, so ANGULAR_Y is the
    // upper arm's *twist* -- a real degree of freedom that the elbow hinge and
    // the hand's orientation between them decide. Driving it too would put this
    // constraint back into an argument with the grip.
    for (const axis of [PhysicsConstraintAxis.ANGULAR_X, PhysicsConstraintAxis.ANGULAR_Z]) {
      this.elbowDrive.setAxisMotorType(axis, PhysicsConstraintMotorType.POSITION);
      this.elbowDrive.setAxisMotorTarget(axis, 0);
    }
  }

  /**
   * Take hold of the other arm's two-hander.
   *
   * Built by `Fighter`, because it joins two arms and neither can reach the
   * other. The haft is welded to this hand at the weapon's **own** second grip
   * along its local +Y, so the two fists sit apart along the shaft rather than in
   * the same place, and this arm's grip goes on being motorised.
   *
   * That offset used to be `CONFIG.club.secondGrip`, written here -- one kind's
   * number, in a method whose whole subject is two-handedness in general. It is
   * the same defect as a missing table row and the same one `combat.ts` had with
   * `minCutSpeed`: a caller holding a copy of something it has no business
   * knowing. A bow is what made it wrong; `Weapon.secondGrip` is where the answer
   * lives now, beside the builder that knows the geometry, and a kind that does
   * not answer does not compile.
   *
   * **A `null` is a real answer and the bow's.** A bow takes both hands and the
   * trailing one is on the *string*, which travels 620 mm through the draw -- so
   * there is nothing fixed to weld it to, and welding it anywhere would be
   * inventing a joint to have one. The bow's second hand is committed in the
   * loadout and modelled by the draw, not by the solver; refused here, quietly
   * and by construction.
   *
   * **The trailing grip is left unmotorised**, and that is a measurement rather
   * than a simplification. Two position motors pulling one rigid body fight each
   * other whenever their chains disagree about what pose is reachable, and two
   * hands on shoulders 0.42 m apart, on a torso that does not twist, disagree
   * constantly. The sweep is in `config.ts` beside `club.trailingGrip`: there is
   * no setting at which the second motor helps, and the *falling* reversal count
   * as it strengthens is what says it is a tug-of-war and not the chatter it
   * would be easy to mistake it for.
   *
   * So this hand adds its mass and its inertia and no force, and the strength of
   * both arms is carried by `club.leadGrip` on the hand that has the weapon --
   * set to exactly two arms' worth, which is also where it measures best.
   */
  takeSecondGrip(scene: Scene, weapon: Weapon, name: string): void {
    if (this.shared || this.weapon) return;
    if (weapon.secondGrip === null) return;
    this.shared = joint(scene, this.hand, {
      name: `${name}.shared`,
      mesh: this.hand.mesh,
      body: weapon.body,
      shape: weapon.shape,
    }, {
      pivotParent: new Vector3(0, -CONFIG.arm.handLength / 2, 0),
      pivotChild: new Vector3(0, weapon.secondGrip, 0),
      axisParent: new Vector3(1, 0, 0),
      axisChild: new Vector3(1, 0, 0),
      perpParent: new Vector3(0, -1, 0),
      perpChild: new Vector3(0, 1, 0),
      swing: {},
    });
  }

  /** What is in this hand, as a kind. `empty` for a hand holding nothing. */
  get holding(): WeaponKind {
    return this.weapon?.kind ?? "empty";
  }

  /** True when this arm is the trailing hand on somebody else's two-hander. */
  get assisting(): boolean {
    return this.shared !== null;
  }

  /** False once any piece of this arm has been cut off it. */
  get armed(): boolean {
    return !this.lost;
  }

  /** Where the shoulder is, in the torso's own frame. `Fighter` publishes it. */
  get socket(): Vector3 {
    return this.shoulderLocal;
  }

  /**
   * Which way is away from the body for this arm: +1 or -1.
   *
   * Published because a policy needs it and cannot work it out. "A shield guard
   * is an arm held *across*" is a direction, and a direction has to know which
   * side it started on -- a rule written without this is right for one hand and
   * mirrored for the other. `Fighter.describe` copies it into `HandView`.
   */
  get side(): number {
    return this.outboard;
  }

  /**
   * How far this hand puts the business end of what it holds from its own
   * shoulder, at the extension an attack is committed at.
   *
   * A constant for a hand and a loadout, not a reading: `reach` above is where
   * the hand *is* and this is how far out it *goes*. `policies.ts` is what wants
   * it, and wants it as the one number that answers "am I close enough to hit
   * them" for a weapon whose length it does not otherwise know.
   *
   * The minimum is `aim`'s own, written the same way and for the same reason a
   * shield is capped there: an arm carrying 600 mm of board is held with the
   * elbow bent, so its shield does not reach as far as its arm could. Duplicated
   * rather than shared because `aim` filters toward its target over
   * `reachResponse` and this is the target itself -- the same expression, asked
   * two different questions.
   */
  get strikeReach(): number {
    const A = CONFIG.arm;
    const extension = Math.min(
      A.reachNeutral,
      A.reachMax,
      this.squaresToFront ? CONFIG.shield.reachCap : Infinity,
    );
    return extension + (this.weapon?.tipOffset ?? 0);
  }

  /**
   * How far the hand is being held from the shoulder.
   *
   * A separate accessor from `angles()`, which allocates: `observe` publishes
   * this into the view 240 times a second per fighter, and that is the one loop
   * in the directory where an object per step is a real cost rather than a
   * tidiness argument.
   */
  get reach(): number {
    return this.armReach;
  }

  angles(): ArmPose {
    return {
      azimuth: this.azimuth,
      elevation: this.elevation,
      roll: this.roll,
      wristBend: this.wristBend,
      reach: this.armReach,
    };
  }

  /** The hand target at `reach`: where the fist is being sent. */
  targetPosition(): Vector3 {
    return this.scratch.target;
  }

  /** Where the point of the blade is being sent, which is what is being aimed. */
  aimPoint(): Vector3 {
    return this.scratch.aimFar;
  }

  /**
   * Drive this arm to a point and a frame somebody else computed.
   *
   * What the trailing hand on a two-hander does. It skips `aim` entirely --
   * there is no cursor for this hand and no second pose to derive, because both
   * fists are on one rigid haft and the haft has exactly one pose. What it keeps
   * is its own shoulder and therefore its own inverse kinematics, so the elbow
   * still goes where that arm's elbow can go.
   *
   * `dampGrip` is skipped too, and deliberately: the weapon belongs to the arm
   * that welded it, and two arms both bleeding spin off one body would apply the
   * correction twice.
   */
  follow(target: Vector3, rotation: Quaternion): void {
    if (this.lost) return;
    const s = this.scratch;
    s.target.copyFrom(target);
    const world = this.trunkFrame();
    Vector3.TransformCoordinatesToRef(this.shoulderLocal, world, s.shoulder);
    this.handAnchor.body.setTargetTransform(s.target, rotation);
    this.driveElbow();
  }

  /**
   * A point on the weapon this arm is commanding, `along` metres from the fist.
   *
   * Taken from the *commanded* aim rather than from the weapon's own transform,
   * so what the trailing hand is sent is where the leading hand is being told to
   * be -- not where it has got to. Reading the weapon instead would make each
   * hand chase the other's lag, which is a feedback loop with two motors in it.
   */
  gripPoint(along: number): Vector3 {
    const s = this.scratch;
    return s.grip.copyFrom(s.target).addInPlace(s.aim.scale(along));
  }

  /** The frame the leading hand is being commanded into. */
  get commandedRotation(): Quaternion {
    return this.scratch.rotation;
  }

  /** The four per-step methods, in the one order they work in. */
  update(dt: number, hand: HandIntent): void {
    // **First, and outside the `lost` guard**, for two separate reasons.
    //
    // Outside it, because an arrow already in the air belongs to nobody: it goes
    // on flying, ageing and being collected whether or not the arm that loosed
    // it is still attached. Skipping this for a severed arm would leave every
    // arrow it had shot live for the rest of the bout, which is the pool never
    // recycling and the acceptance check failing in the one case nobody tests.
    //
    // First, because `Quiver.step` is what takes down the one-step teleport that
    // `loose` puts up. Run after a loose in the same step it would cancel the
    // teleport before the solver ever saw it, and every shot would start from
    // wherever the last one ended -- the exact failure `arrow.ts`'s header
    // records, six shots from one origin landing 12 m apart.
    this.quiver?.step(dt);
    if (this.lost) return;
    this.shoot(dt, hand);
    this.aim(dt, hand);
    this.driveAnchor(dt);
    this.driveElbow();
    this.dampGrip(dt);
  }

  /**
   * Draw, and loose.
   *
   * The whole of the bow's control, and it is four lines of rule and three of
   * geometry because the two halves it needs already existed. `nextDraw` owns
   * "a hold is a level and a loose is its edge", which is `buttons.ts`'s subject
   * and has a test that costs microseconds. The direction is the weapon's own
   * +Y, which for a bow is where the arm is pointing -- so an arrow goes exactly
   * where a sword's point would have gone, through the aiming that already
   * exists, with no second control surface anywhere.
   *
   * `bladeDirectionToRef` rather than `bladeDirection()`, and the difference is
   * not style: this runs 240 times a second, and the cached world matrix stamps
   * the scene's render id as a *side effect* of being read. See the accessor.
   *
   * A hand with no quiver still runs `nextDraw`, and that is deliberate rather
   * than wasteful -- it is what keeps `this.draw` at zero for a hand holding a
   * sword, so that picking up a bow later cannot inherit a draw from a button
   * somebody was leaning on.
   */
  private shoot(dt: number, hand: HandIntent): void {
    const step = nextDraw(this.draw, hand.thrust, dt, CONFIG.arrow);
    this.draw = step.draw;
    const weapon = this.weapon;
    if (!weapon || !this.quiver) return;
    weapon.drawTo(step.draw);
    if (step.loose <= 0) return;

    const along = weapon.bladeDirectionToRef(this.scratch.shot);
    const from = this.scratch.nock
      .copyFrom(along)
      .scaleInPlace(CONFIG.arrow.spawnAhead)
      .addInPlace(weapon.root.position);
    this.quiver.loose(from, along, step.loose);
  }

  /**
   * Push the current CONFIG into this arm's solver objects.
   *
   * Guarded on `lost`, because `drop` disposes both drives and writing into a
   * freed constraint is the way this takes the page down. Nothing used to call
   * `applyTuning` after an arm came off; death does, on every death.
   */
  applyTuning(): void {
    const A = CONFIG.arm;
    const S = CONFIG.sword;

    if (!this.lost) {
      const scale = this.gripScale;
      for (const axis of LINEAR) this.grip.setAxisMotorMaxForce(axis, A.linearMotorForce * scale);
      for (const axis of ANGULAR) this.grip.setAxisMotorMaxForce(axis, A.wristMotorForce * scale);
      for (const axis of [PhysicsConstraintAxis.ANGULAR_X, PhysicsConstraintAxis.ANGULAR_Z]) {
        this.elbowDrive.setAxisMotorMaxForce(axis, A.elbowPoleForce);
      }
    }

    for (const axis of ANGULAR) {
      this.shoulder.setAxisMotorType(axis, PhysicsConstraintMotorType.POSITION);
      this.shoulder.setAxisMotorTarget(axis, 0);
      this.shoulder.setAxisMotorMaxForce(axis, A.shoulderTone);
    }
    this.elbow.setAxisMotorType(PhysicsConstraintAxis.ANGULAR_X, PhysicsConstraintMotorType.POSITION);
    this.elbow.setAxisMotorTarget(PhysicsConstraintAxis.ANGULAR_X, A.elbowRest);
    this.elbow.setAxisMotorMaxForce(PhysicsConstraintAxis.ANGULAR_X, A.elbowTone);

    for (const part of [this.upperArm, this.forearm, this.hand]) {
      part.body.setLinearDamping(A.linearDamping);
      part.body.setAngularDamping(A.angularDamping);
    }
    if (this.weapon) {
      this.weapon.body.setLinearDamping(S.swordLinearDamping);
      this.weapon.body.setAngularDamping(S.swordAngularDamping);
      const inertia = this.weapon.body.getMassProperties().inertia;
      if (inertia) this.weaponInertia.copyFrom(inertia);
    }
  }

  /**
   * Let go of the whole chain.
   *
   * The arm is driven by two keyframed anchors pulling on the hand and the upper
   * arm, and those anchors do not care whether the arm is still attached to
   * anybody. Severing a piece of it without dropping the drives leaves the grip
   * dragging a loose hand and sword round the arena at 850 N, which is not a
   * dismemberment so much as a haunting. So the whole arm is released at once
   * whatever piece of it comes off.
   */
  drop(): void {
    if (this.lost) return;
    this.lost = true;
    // Whatever it was holding, it is not drawing it any more. The arrows it has
    // already loosed are unaffected -- see `update`.
    this.draw = 0;
    this.weapon?.drawTo(0);
    this.grip.dispose();
    this.elbowDrive.dispose();
    // The second weld goes too, or a dropped arm goes on holding the other hand's
    // club and the two chains drag each other about the arena.
    this.shared?.dispose();
    this.shared = null;
    // A dropped weapon is debris like any other piece, and the exemption that
    // let it pass through its owner belonged to the owner, not to the steel.
    // A dropped weapon is debris like any other piece, and the exemption that
    // let it pass through its owner belonged to the owner and not to the steel.
    //
    // Through `discard`, which does two things this used to do neither of.
    // It writes the masks onto the **leaf** shapes -- writing the container's,
    // which is what this line was, is a no-op Havok ignores and reads back as
    // garbage -- and it marks the thing spent, so `Combat` stops scoring cuts
    // from a sword lying on the floor.
    this.weapon?.discard();
  }

  /**
   * Take the arm's own objects out of the world.
   *
   * Not the three bones: they are registered as limbs on the fighter, and it
   * disposes their attachments and their meshes with everything else it owns.
   * What is here is what nothing else knows about.
   */
  dispose(): void {
    if (!this.lost) {
      this.grip.dispose();
      this.elbowDrive.dispose();
    }
    this.shared?.dispose();
    this.weld?.dispose();
    this.weapon?.dispose();
    this.quiver?.dispose();
    this.handAnchor.mesh.dispose();
    this.elbowAnchor.mesh.dispose();
  }

  /**
   * Where the cursor is on screen is where the hand is asked to be.
   *
   * Absolute rather than accumulated: the pointer is not captured, so the arm
   * has a home position you can always find again by moving the mouse back to
   * the middle of the window.
   */
  private aim(dt: number, input: HandIntent): void {
    const A = CONFIG.arm;

    const hand = this.outboard > 0 ? "primary" : "secondary";
    this.azimuth = azimuthOf(input.pointerX, hand);
    this.elevation = clamp(spread(input.pointerY, A.elMin, A.elMax), A.elMin, A.elMax);
    this.roll = clamp(input.roll, A.rollMin, A.rollMax);
    const wristStep = 1 - Math.exp(-A.wristResponse * dt);
    const wantedBend = clamp(input.wristBend, 0, 1);
    this.wristBend += (wantedBend - this.wristBend) * wristStep;

    const wanted = Math.min(
      input.thrust ? A.reachThrust : input.guard ? A.reachGuard : A.reachNeutral,
      A.reachMax,
      // A **ceiling**, and only a strapped shield has one. `reachNeutral` is 71 %
      // of the chain and `reachThrust` is 95 %, which is an arm held out
      // straight -- right for a blade and for a buckler, and not how anybody
      // carries 600 mm of board. `shield.reachCap` is a bent elbow.
      //
      // Read live rather than cached at construction, so it is tunable from the
      // console like everything else in `CONFIG`. Note this is not the knob that
      // was refuted: that was a *floor* under `reachGuard`, and the measurement
      // that killed it -- lifting the reach moved the plate closer to the head --
      // argues for this one.
      this.squaresToFront ? CONFIG.shield.reachCap : Infinity,
    );
    this.armReach += (wanted - this.armReach) * (1 - Math.exp(-A.reachResponse * dt));

    const { dirLocal, shoulder, target, aim } = this.scratch;
    const cosEl = Math.cos(this.elevation);
    dirLocal.set(
      Math.sin(this.azimuth) * cosEl,
      Math.sin(this.elevation),
      Math.cos(this.azimuth) * cosEl,
    );

    const trunkFrame = this.trunkFrame();
    const locomotionFrame = this.locomotionFrame();
    Vector3.TransformCoordinatesToRef(this.shoulderLocal, trunkFrame, shoulder);
    Vector3.TransformNormalToRef(dirLocal, locomotionFrame, aim);
    aim.normalize();
    // Taken here rather than in `driveAnchor` because the torso's world matrix
    // is already in hand, and a second `getWorldMatrix()` on the same node in
    // the same step is the sort of thing that is free until somebody moves it.
    // The torso capsule's own origin is its centre, so this is the translation
    // and not a transformed point.
    trunkFrame.getTranslationToRef(this.scratch.centre);

    target.copyFrom(shoulder).addInPlace(aim.scale(this.armReach));

    // Where the point of the blade is being sent, which is what the player is
    // actually aiming and so what the indicator stakes out.
    this.scratch.aimFar
      .copyFrom(shoulder)
      .addInPlace(aim.scale(this.armReach + (this.weapon?.tipOffset ?? 0)));
  }

  /**
   * Pose the anchor, and let the solver do the rest.
   *
   * The hand's own -Y runs down the blade, so the anchor's orientation is built
   * from three axes directly rather than by composing rotations: it is easier to
   * be sure a basis is correct than to be sure a quaternion product is.
   */
  private driveAnchor(dt: number): void {
    const s = this.scratch;
    const { aim, edge, axisX, axisY, axisZ, basis, rotation, target } = s;

    s.prevX.copyFrom(axisX);
    s.prevY.copyFrom(axisY);
    s.prevZ.copyFrom(axisZ);

    // Hand +Y points back up the arm, because the blade runs along hand -Y.
    axisY.copyFrom(aim).scaleInPlace(-1).normalize();

    // Where the hand's +X starts, before `roll` turns it about the arm.
    //
    // World up for a blade: the edge sits in the vertical plane through the aim,
    // and a roll of zero is a level cut.
    //
    // A **strapped shield** starts from the **radial** -- the line from its
    // owner's own centre out through the hand -- because its +X is the plate's
    // face normal, and where a shield should face is *away from the person
    // holding it*, along the surface of a sphere centred on him. Whatever the
    // arm is doing, the closest a plate square to the forearm can come to that
    // is the radial with the arm projected out of it, which is exactly what the
    // two lines below compute.
    //
    // It used to be seeded from the torso's **forward**, and that was wrong in
    // the commonest pose in the game rather than in a corner. A plate whose
    // normal is square to the forearm cannot face forward while the forearm
    // points forward, so an arm held out at the enemy -- `duelist`'s covering
    // line, and dead centre cursor -- collapsed the seed to nothing, and near
    // there its *direction* was whatever tiny way the aim happened to be off.
    // Worse, at rest: an unused hand sits at `elMin`, sixty degrees below the
    // horizontal, and the component of *forward* square to an arm pointing down
    // is a vector pointing sixty degrees **up**. The plate faced the sky, and
    // "angled almost randomly, often just vertically pointed up" is exactly what
    // that looks like from outside.
    //
    // The radial has neither failure. It is degenerate only where the arm points
    // along the shoulder's own offset from the chest -- out sideways and up,
    // one corner of the envelope -- and it varies smoothly everywhere else.
    // Unit *before* the projection, so that what is left is the sine of the
    // angle between the seed and the arm -- which is what `minFace` is and what
    // the threshold below compares against. The radial is a displacement and the
    // blade's `UP` is already a unit, so only one of them needs the step.
    if (this.squaresToFront) {
      edge.copyFrom(target).subtractInPlace(s.centre);
      if (edge.lengthSquared() > 1e-8) edge.normalize();
    } else {
      edge.copyFrom(UP);
    }
    edge.subtractInPlace(aim.scale(Vector3.Dot(edge, aim)));
    if (this.squaresToFront) {
      // Conditioning for that one corner, kept from when the seed was the front
      // and the corner was the whole middle of the envelope. Short of
      // `shield.minFace` the seed is topped up with the horizontal square to the
      // arm, outboard, by exactly the shortfall -- continuous, since the top-up
      // reaches zero at the threshold, and outboard rather than inboard so the
      // plate leans away from its owner rather than across him. A shield in a
      // hopeless pose then stands on its edge like a shield instead of lying
      // flat like furniture.
      //
      const facing = edge.length();
      if (facing < CONFIG.shield.minFace) {
        Vector3.CrossToRef(UP, aim, s.lateral);
        if (s.lateral.lengthSquared() > 1e-6) {
          s.lateral.normalize().scaleInPlace(this.outboard * (CONFIG.shield.minFace - facing));
          edge.addInPlace(s.lateral);
        }
      }
    }
    // A blade held straight up has the same problem and no better answer.
    if (edge.lengthSquared() < 1e-5) edge.set(1, 0, 0).subtractInPlace(aim.scale(aim.x));
    edge.normalize();

    Vector3.CrossToRef(aim, edge, axisZ);
    edge.scaleInPlace(Math.cos(this.roll)).addInPlace(axisZ.scaleInPlace(Math.sin(this.roll)));
    edge.normalize();

    axisX.copyFrom(edge);
    axisX.subtractInPlace(axisY.scale(Vector3.Dot(axisX, axisY))).normalize();
    Vector3.CrossToRef(axisX, axisY, axisZ);
    axisZ.normalize();

    // Bend is a second orientation freedom, not a second aiming axis. Rotate
    // the hand frame around its rolled local lateral axis after the target point
    // has already been fixed, so a policy may lay a blade across the forearm
    // without paying for that orientation change as a position jump. The sign
    // mirrors anatomically: the same normalized intent bends both wrists toward
    // the same side of their respective hands.
    const bend = mirroredWristBend(this.wristBend, this.outboard);
    const bendCos = Math.cos(bend);
    const bendSin = Math.sin(bend);
    // The rolled lateral axis is the hinge. Preserve X and turn the Y/Z arc
    // around it; rotating X/Y instead is a bend about Z and makes the requested
    // anatomical freedom a second roll under another name.
    axisY.scaleInPlace(bendCos).addInPlace(axisZ.scale(bendSin));
    axisY.normalize();
    Vector3.CrossToRef(axisX, axisY, axisZ);
    axisZ.normalize();

    Matrix.FromXYZAxesToRef(axisX, axisY, axisZ, basis);
    Quaternion.FromRotationMatrixToRef(basis, rotation);

    // The angular velocity this frame's move is asking the hand for, taken
    // straight from the two bases rather than from a quaternion difference:
    // w = 1/2 sum(e_prev x e_now) / dt is exact to first order for an
    // orthonormal frame and carries no convention to get backwards. The grip
    // damper measures against this, so it must be right.
    const commanded = s.commandedSpin.set(0, 0, 0);
    if (this.hasPreviousFrame) {
      Vector3.CrossToRef(s.prevX, axisX, s.cross);
      commanded.addInPlace(s.cross);
      Vector3.CrossToRef(s.prevY, axisY, s.cross);
      commanded.addInPlace(s.cross);
      Vector3.CrossToRef(s.prevZ, axisZ, s.cross);
      commanded.addInPlace(s.cross);
      commanded.scaleInPlace(0.5 / dt);
    }
    this.hasPreviousFrame = true;

    // setTargetTransform rather than teleporting the transform node: it gives the
    // keyframed anchor a real velocity, so the constraint sees motion instead of
    // a jump, and the sword trails properly when you sweep the cursor.
    this.handAnchor.body.setTargetTransform(target, rotation);
  }

  /**
   * Put the elbow somewhere an elbow goes.
   *
   * Two-bone inverse kinematics. The shoulder and the hand target are both
   * known, and the two bone lengths fix how far apart they can be -- so the
   * elbow is somewhere on a circle around the shoulder-to-hand line, and the
   * pole vector picks the point on that circle. Feeding the resulting *direction*
   * to a weak orientation motor is enough: the shoulder joint already holds the
   * elbow at the right distance, so direction is the whole of what was missing.
   *
   * Muscle tone was the wrong tool here and the measurements said so -- elbow
   * travel barely moved. Tone pulls a joint toward a resting *angle*, and the
   * elbow's angle was never the free variable.
   */
  private driveElbow(): void {
    const A = CONFIG.arm;
    const s = this.scratch;

    const upper = A.upperLength;
    const lower = A.foreLength + A.handLength / 2;

    const along = s.along.copyFrom(s.target).subtractInPlace(s.shoulder);
    const span = clamp(along.length(), Math.abs(upper - lower) + 1e-3, upper + lower - 1e-3);
    if (along.lengthSquared() < 1e-8) return;
    along.normalize();

    // Distance from the shoulder to the foot of the elbow's perpendicular, and
    // how far off the line it then sits.
    const foot = (upper * upper - lower * lower + span * span) / (2 * span);
    const rise = Math.sqrt(Math.max(0, upper * upper - foot * foot));

    const world = this.locomotionFrame();
    const pole = s.pole.set(A.elbowPole.x, A.elbowPole.y, A.elbowPole.z);
    Vector3.TransformNormalToRef(pole, world, pole);
    const sideways = s.sideways.copyFrom(pole);
    sideways.subtractInPlace(along.scale(Vector3.Dot(pole, along)));
    if (sideways.lengthSquared() < 1e-6) return;
    sideways.normalize();

    s.elbowPoint
      .copyFrom(s.shoulder)
      .addInPlace(along.scale(foot))
      .addInPlace(sideways.scale(rise));

    // The upper arm's local +Y runs from its centre up to the shoulder.
    const boneY = s.boneY.copyFrom(s.shoulder).subtractInPlace(s.elbowPoint);
    if (boneY.lengthSquared() < 1e-8) return;
    boneY.normalize();

    // Keep the twist reference continuous with wherever the arm already is, so
    // the two motorised axes never have to unwind a full turn.
    const armWorld = this.upperArm.mesh.getWorldMatrix();
    const boneX = s.boneX.set(armWorld.m[0], armWorld.m[1], armWorld.m[2]);
    boneX.subtractInPlace(boneY.scale(Vector3.Dot(boneX, boneY)));
    if (boneX.lengthSquared() < 1e-6) {
      boneX.set(armWorld.m[8], armWorld.m[9], armWorld.m[10]);
      boneX.subtractInPlace(boneY.scale(Vector3.Dot(boneX, boneY)));
      if (boneX.lengthSquared() < 1e-6) return;
    }
    boneX.normalize();
    Vector3.CrossToRef(boneX, boneY, s.boneZ);
    s.boneZ.normalize();

    Matrix.FromXYZAxesToRef(boneX, boneY, s.boneZ, s.elbowBasis);
    Quaternion.FromRotationMatrixToRef(s.elbowBasis, s.elbowRotation);
    this.elbowAnchor.body.setTargetTransform(s.elbowPoint, s.elbowRotation);
  }

  /**
   * The grip's damping term.
   *
   * A position motor is a spring, and a spring with no damper rings. That ring
   * was the settling bob at the tip, and neither of the obvious knobs fixed it:
   * a stiffer motor overshoots harder, and the blade's own angular damping
   * fights every rotation including the one you asked for, so swings lose their
   * punch. What was missing is a term that resists the blade turning
   * *differently* from the way it was told to.
   *
   * The impulse is scaled by the sword's own principal moments before it is
   * applied. That is not a nicety: a blade's inertia about its long axis is
   * roughly a thousandth of its inertia across, so a flat impulse that gently
   * settles a swing would send the roll axis straight to infinity.
   */
  private dampGrip(dt: number): void {
    const rate = CONFIG.arm.gripAngularDamping;
    if (rate <= 0) return;

    const s = this.scratch;
    // An empty hand has nothing to damp, and neither has a trailing hand on a
    // two-hander: the weapon belongs to the arm that welded it, and two arms
    // both bleeding spin off one body would apply the correction twice.
    if (!this.weapon) return;
    const frame = this.weapon.root.rotationQuaternion;
    if (!frame) return;

    this.weapon.body.getAngularVelocityToRef(s.swordSpin);
    s.swordSpin.subtractInPlace(s.commandedSpin);

    Matrix.FromQuaternionToRef(frame, s.swordFrame);
    s.swordFrame.transposeToRef(s.swordFrameInverse);
    Vector3.TransformNormalToRef(s.swordSpin, s.swordFrameInverse, s.localSpin);

    // 1 - exp(-rate*dt) rather than rate*dt, so the bleed-off cannot overshoot
    // into a sign flip however coarse the step gets.
    const bleed = 1 - Math.exp(-rate * dt);
    s.impulse.set(
      -bleed * this.weaponInertia.x * s.localSpin.x,
      -bleed * this.weaponInertia.y * s.localSpin.y,
      -bleed * this.weaponInertia.z * s.localSpin.z,
    );
    Vector3.TransformNormalToRef(s.impulse, s.swordFrame, s.impulse);
    this.weapon.body.applyAngularImpulse(s.impulse);
  }
}
