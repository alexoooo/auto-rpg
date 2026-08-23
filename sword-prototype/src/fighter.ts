import { Vector3, Quaternion, Matrix } from "@babylonjs/core/Maths/math.vector.js";
import {
  PhysicsMotionType,
  PhysicsConstraintAxis,
  PhysicsConstraintAxisLimitMode,
  PhysicsConstraintMotorType,
} from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";
import { Physics6DoFConstraint } from "@babylonjs/core/Physics/v2/physicsConstraint.js";
import type { PhysicsBody } from "@babylonjs/core/Physics/v2/physicsBody.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import type { Material } from "@babylonjs/core/Materials/material.js";
import type { Scene } from "@babylonjs/core/scene.js";

// Explicit `.ts` extensions, and they are load-bearing rather than a style. Node
// runs a TypeScript file by stripping its types, which is what lets `tests/`
// import `scoring.ts` and `config.ts` directly today and what will let session
// 06 run bouts of real `Fighter`s without a browser -- but Node's ESM resolver
// insists on the extension where Vite does not care. Everything a fighter pulls
// in at run time therefore carries one. The presentation half of the directory
// -- `main`, `hud`, `rigview`, `targeting`, `aim`, `setup` -- deliberately does
// not, and the line between the two is exactly the line a headless harness can
// reach. `input.ts` is on the far side of it, and a fighter reaches it only
// through `mind.ts`'s `Intent`, which is a type alias and erases.
import { CONFIG } from "./config.ts";
import { COLLIDES, LAYER, layersFor, type Side } from "./physics.ts";
import { capsulePart, joint, spherePart, type Part } from "./rig.ts";
import { Figure } from "./figure.ts";
import { Sword } from "./sword.ts";
import { idleMind, type BodyView, type FighterView, type Intent, type Mind } from "./mind.ts";

export type { Side };

export interface FighterMaterials {
  flesh: Material;
  cloth: Material;
  steel: Material;
  leather: Material;
  brass: Material;
  hide: Material;
}

/** One severable piece of a fighter, and how close it is to coming off. */
export interface Limb {
  readonly key: string;
  readonly label: string;
  readonly part: Part;
  /**
   * The joint holding it to its parent, or null for a piece that cannot come
   * off. Cutting one of these is a dismemberment.
   */
  readonly attachment: Physics6DoFConstraint | null;
  health: number;
  readonly maxHealth: number;
  severed: boolean;
  /** Simulation time of the last billed hit, for the per-part cooldown. */
  lastHitAt: number;
}

export interface FighterOptions {
  side: Side;
  /** Where the feet stand, on the floor. */
  origin: Vector3;
  /**
   * Heading in radians, in the convention used everywhere here: zero looks down
   * +Z and turns toward +X, so it can be compared against
   * `Math.atan2(forward.x, forward.z)` with nothing in between.
   */
  facing: number;
  /**
   * Who drives it. Defaults to idle, so a fighter built by a harness that has
   * not thought about it stands still rather than reading undefined.
   */
  mind?: Mind;
}

/** Hip, knee and off-arm angles for one instant of the walk. */
export interface GaitPose {
  hipLeft: number;
  hipRight: number;
  kneeLeft: number;
  kneeRight: number;
  offShoulder: number;
  offElbow: number;
}

const clamp = (value: number, min: number, max: number) =>
  value < min ? min : value > max ? max : value;

/** Map a signed -1..1 stick position onto an asymmetric range. */
const spread = (t: number, min: number, max: number) => (t < 0 ? -t * min : t * max);

/** Shortest signed way round from `from` to `to`. */
const angleTo = (from: number, to: number): number => {
  let delta = (to - from) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
};

const LINEAR = [
  PhysicsConstraintAxis.LINEAR_X,
  PhysicsConstraintAxis.LINEAR_Y,
  PhysicsConstraintAxis.LINEAR_Z,
];
const ANGULAR = [
  PhysicsConstraintAxis.ANGULAR_X,
  PhysicsConstraintAxis.ANGULAR_Y,
  PhysicsConstraintAxis.ANGULAR_Z,
];

/**
 * The walk, as a pure function of where in the stride you are and how fast you
 * are going.
 *
 * It used to live in `figure.ts` and drive `TransformNode.rotation` on the
 * costume. It drives joint motors now, which is why it has moved: the legs are
 * bodies that can be cut off, and a leg lying on the ground must not still be
 * receiving a hip angle. `figure.ts` owns no motion at all any more, which is
 * the boundary the overview asks for -- cosmetics carry no authority.
 *
 * Cadence is proportional to speed rather than fixed, so the feet keep pace with
 * the ground instead of scuffing along it, and the swing amplitude fades with
 * speed so that standing still straightens the legs on its own -- no separate
 * idle pose, and no blend between the two to get wrong. That last property is
 * also what makes the resting-sag acceptance a static measurement: at zero speed
 * every target here is exactly zero.
 */
export function gait(phase: number, speed: number): GaitPose {
  const F = CONFIG.fighter;
  const amount = clamp(speed / F.walkSpeed, 0, 1);
  const swing = F.strideSwing * amount;
  const step = Math.sin(phase);
  const opposite = Math.sin(phase + Math.PI);

  return {
    hipLeft: step * swing,
    hipRight: opposite * swing,
    // A knee only bends one way, and only while the leg is swinging through.
    // Positive is backward here, which is the way a knee goes.
    kneeLeft: Math.max(0, -Math.sin(phase + 0.7)) * swing * 1.5,
    kneeRight: Math.max(0, -Math.sin(phase + 0.7 + Math.PI)) * swing * 1.5,
    // The free arm counterswings; the sword arm is busy.
    offShoulder: opposite * swing * 0.55,
    // Negative, where the cosmetic version of this was positive. An elbow bends
    // forward and a knee bends backward, and driving a real hinge whose limits
    // say so with a target of the wrong sign parks the motor against a stop and
    // buzzes there -- the same over-constraint that once made the sword buzz at
    // the wrist. The costume had the sign wrong and nothing noticed, because a
    // `TransformNode` has no opinion about which way a joint goes.
    offElbow: -Math.max(0, opposite) * swing * 0.5,
  };
}

/** Standing still. Every joint the stride drives goes to its rest angle. */
const REST_POSE: GaitPose = {
  hipLeft: 0,
  hipRight: 0,
  kneeLeft: 0,
  kneeRight: 0,
  offShoulder: 0,
  offElbow: 0,
};

/**
 * A fighter: the one kind of body in the ring.
 *
 * This is the merge of what used to be `Hero` -- a driven torso with a
 * simulated sword arm -- and what used to be `Dummy`, a jointed figure that
 * could be cut apart. A fight needs both properties in one object, twice, and
 * nothing here knows or cares which of the two is being driven by a person.
 *
 * The torso is keyframed: it goes exactly where you steer it, because a body
 * that wobbles under the weight of its own arm is not fun to walk around, and
 * because every measured number in `config.ts`'s `arm` block was taken against
 * a shoulder that does not itself move. Everything from the shoulder outward is
 * genuinely simulated -- three constrained bones and a weighted sword -- and so
 * now is everything else that hangs off the torso: a head, a pelvis carrying two
 * legs, and a free arm, each a dynamic capsule on a motorised joint, each
 * hittable and all but the torso severable.
 *
 * The arm is driven by a single invisible keyframed *anchor* joined to the hand
 * by a six-degree-of-freedom constraint whose motors have a finite force budget.
 * Move the anchor and the solver drags the hand after it, the forearm and upper
 * arm follow because they are constrained, and the sword follows because it is
 * welded to the hand. Nothing is animated and no force is applied from outside
 * the solver.
 *
 * That last point is not stylistic. The first version ran a spring-damper on the
 * hand with `applyForce` each frame and shook itself to pieces, because Babylon
 * converts a force to an impulse using `getTimeStep()` while the world steps by
 * the real frame delta -- so the gain flickered every frame. It also torqued the
 * sword toward an aim direction while the weld held the sword rigid to the hand,
 * which is a contradiction the solver can only answer by vibrating.
 *
 * A second anchor holds the elbow. Pinning the hand in six degrees of freedom
 * leaves this seven-degree-of-freedom arm one spare, and an unheld spare axis
 * hangs: the elbow swings about the shoulder-to-hand line like a rope. See
 * `driveElbow`.
 *
 * **On pivots.** `rig.ts`'s `joint()` locks all three linear axes, so the two
 * anchors of every joint below are not a hint about where a part should sit --
 * they are an instruction, and the solver will drag the part to obey it. The
 * dummy this class replaces was authored to stand on the floor and then pinned
 * to the top of a 0.4 m stump by a pivot that assumed otherwise, and the two
 * anchors it named were 450 mm apart; the solver duly dragged the whole figure
 * down until they met, and the resulting slump was read for a long time as a
 * stiffness problem. It was not: every angular motor in it set to 40 000 N.m,
 * over a thousand times the shipped value, moved the head by exactly zero. Every
 * pivot here is therefore written as a world height in `config.ts`'s `body`
 * block and subtracted from the two parts' own centres, so that the arithmetic
 * is visible and both anchors provably land on the same point.
 *
 * **On input.** A fighter reads a `Mind` and has no idea what is behind it. The
 * human is a `Mind` too -- one that hands back `controls.state` -- so there is
 * deliberately no branch anywhere in here for "is this one the player", and
 * taking over a body is `fighter.mind = somethingElse` with nothing else to do.
 * `mind` is a plain mutable field for exactly that reason: session 07 swaps it
 * mid-fight, and the measurement session 04 could not take -- the standard
 * cursor sweep run on the *right* fighter's arm -- is a swap of it from the
 * console.
 */
export class Fighter {
  readonly side: Side;
  readonly torso: Part;
  readonly head: Part;
  readonly pelvis: Part;
  readonly upperArm: Part;
  readonly forearm: Part;
  readonly hand: Part;
  readonly handAnchor: Part;
  readonly elbowAnchor: Part;
  readonly sword: Sword;
  /** Height of the collision capsule's centre above the feet. */
  readonly torsoCentre: number;
  /** Every hittable piece, in the order the readout lists them. */
  readonly limbs: Limb[] = [];

  /**
   * The sword arm's four constraints, published rather than private.
   *
   * They were private, and session 02's rig overlay stopped at the boundary
   * rather than reaching in -- correctly, and at the cost of a joint layer that
   * drew the old dummy's eleven joints and none of the four that actually matter.
   * A `Physics6DoFConstraint` registers itself nowhere, a `PhysicsBody` cannot be
   * asked what constrains it, and the V2 engine keeps no constraint list, so the
   * only handle on a constraint is whatever object holds the reference. This is
   * that object, so this is where they have to be published from.
   */
  readonly grip: Physics6DoFConstraint;
  readonly shoulder: Physics6DoFConstraint;
  readonly elbow: Physics6DoFConstraint;
  readonly elbowDrive: Physics6DoFConstraint;

  /** Where to face while locked on, or null to steer by hand. */
  lockTarget: Vector3 | null = null;

  /**
   * Who is driving, swappable at any moment.
   *
   * Public and mutable rather than set once in the constructor, because every
   * interesting thing anybody wants to do with it is a swap: session 07 takes a
   * body mid-fight and hands the one it left back to its policy, and the
   * measurement session 04 was blocked on wants a bespoke mind on the right
   * fighter for the length of one sweep. A constructor argument would make both
   * of those a rebuild, and rebuilding is precisely what neither can afford --
   * the first would drop the blade and the second would move the bodies it is
   * trying to hold still.
   */
  mind: Mind;

  /**
   * What this fighter can see, republished in place by `observe`.
   *
   * Owned by the fighter rather than built per step, because `decide` runs 240
   * times a second per side. Handing a mind a fresh object each time would make
   * the view the largest allocator in the prototype, and it would also be a lie
   * about lifetime: everything in here is a live reading of a world that is
   * about to move.
   */
  readonly view: FighterView;

  /**
   * What the fighter is wearing. Held only so that the rig overlay can take it
   * off -- nothing here moves it, because every piece of it is parented to the
   * physics part it covers.
   *
   * Not the same set as `owns` answers for: the sword arm's capsules are drawn
   * as themselves and are pickable, but they are not a costume and the overlay
   * has no reason to hide them.
   */
  readonly costume: readonly AbstractMesh[];

  /** Every body joint and how many times `body.jointStiffness` it is worth. */
  private readonly springs: { constraint: Physics6DoFConstraint; strength: number }[] = [];
  /**
   * The joints the stride drives, each beside the limb whose loss silences it.
   * Held as a list rather than looked up by key every step: this runs 240 times
   * a second per fighter, and a limb search in there would be six array scans
   * per step to answer a question that cannot change without a sever.
   */
  private readonly driven: {
    constraint: Physics6DoFConstraint;
    limb: Limb;
    angle: keyof GaitPose;
  }[] = [];

  /** The weld that makes the blade rigid to the hand. Held only to dispose it. */
  private readonly swordWeld: Physics6DoFConstraint;

  private readonly byBody = new Map<PhysicsBody, Limb>();
  private readonly owned = new Set<AbstractMesh>();

  /** Hand target in torso space: azimuth, elevation, and distance out. */
  private azimuth = 0.3;
  private elevation = -0.15;
  private roll = 0;
  private reach = CONFIG.arm.reachNeutral;

  /** Where in the stride the legs are. */
  private stride = 0;

  /**
   * True once any part of the sword arm has been cut off.
   *
   * The arm is driven by two keyframed anchors pulling on the hand and the upper
   * arm, and those anchors do not care whether the arm is still attached to
   * anybody. Severing a piece of it without dropping the drives leaves the grip
   * dragging a loose hand and sword round the arena at 850 N, which is not a
   * dismemberment so much as a haunting. So the whole arm is released at once
   * whatever piece of it comes off.
   */
  private armLost = false;

  private readonly shoulderLocal: Vector3;
  private readonly middle = new Vector3();
  private readonly velocity = new Vector3();
  /** Principal moments of the sword, cached: the grip damper needs them to bleed
   *  off spin evenly about a body whose inertia varies a thousandfold by axis. */
  private readonly swordInertia = new Vector3(1, 1, 1);
  private hasPreviousFrame = false;

  private readonly scratch = {
    dirLocal: new Vector3(),
    shoulder: new Vector3(),
    target: new Vector3(),
    aim: new Vector3(),
    aimFar: new Vector3(),
    feet: new Vector3(),
    edge: new Vector3(),
    axisX: new Vector3(),
    axisY: new Vector3(),
    axisZ: new Vector3(),
    prevX: new Vector3(1, 0, 0),
    prevY: new Vector3(0, 1, 0),
    prevZ: new Vector3(0, 0, 1),
    cross: new Vector3(),
    commandedSpin: new Vector3(),
    swordSpin: new Vector3(),
    localSpin: new Vector3(),
    impulse: new Vector3(),
    spin: new Vector3(),
    move: new Vector3(),
    right: new Vector3(),
    forward: new Vector3(),
    pole: new Vector3(),
    along: new Vector3(),
    sideways: new Vector3(),
    elbowPoint: new Vector3(),
    boneX: new Vector3(),
    boneY: new Vector3(),
    boneZ: new Vector3(),
    basis: Matrix.Identity(),
    elbowBasis: Matrix.Identity(),
    /** `observe`'s own, so a view can never overwrite a frame of the arm's. */
    viewBasis: Matrix.Identity(),
    swordFrame: Matrix.Identity(),
    swordFrameInverse: Matrix.Identity(),
    rotation: Quaternion.Identity(),
    elbowRotation: Quaternion.Identity(),
  };

  constructor(scene: Scene, opts: FighterOptions, materials: FighterMaterials) {
    const F = CONFIG.fighter;
    const B = CONFIG.body;
    const A = CONFIG.arm;
    const layers = layersFor(opts.side);
    this.side = opts.side;
    this.mind = opts.mind ?? idleMind();

    // Built empty and filled in place by `observe` from then on. Nothing here
    // creates a body, a shape or a constraint, so it costs the arm's build order
    // nothing to sit above it.
    this.view = {
      self: {
        ground: new Vector3(),
        facing: opts.facing,
        shoulder: new Vector3(),
        tip: new Vector3(),
        tipSpeed: 0,
        reach: this.reach,
        health: {},
      },
      opponent: {
        ground: new Vector3(),
        facing: 0,
        shoulder: new Vector3(),
        tip: new Vector3(),
        tipSpeed: 0,
        health: {},
      },
      measure: Number.POSITIVE_INFINITY,
      clock: 0,
    };

    // Every part is built in the fighter's own upright frame and then turned to
    // face where it is standing. Doing it this way rather than by writing turned
    // world positions is what keeps every pivot below readable as a height above
    // the floor, which is the whole of how the dummy's root-pivot bug is avoided.
    const yaw = Quaternion.RotationAxis(new Vector3(0, 1, 0), opts.facing);
    const turn = Matrix.Identity();
    Matrix.FromQuaternionToRef(yaw, turn);
    const scratchLocal = new Vector3();
    const place = (x: number, y: number, z = 0): Vector3 => {
      scratchLocal.set(x, y, z);
      const world = Vector3.Zero();
      Vector3.TransformCoordinatesToRef(scratchLocal, turn, world);
      return world.addInPlace(opts.origin);
    };

    this.torsoCentre = B.torsoCentre;

    this.torso = capsulePart(scene, {
      name: `${opts.side}.torso`,
      position: place(0, B.torsoCentre, 0),
      rotation: yaw,
      height: B.torsoLength,
      radius: B.torsoRadius,
      mass: B.torsoMass,
      layer: layers.body,
      collidesWith: layers.bodyCollides,
      material: materials.cloth,
      motionType: PhysicsMotionType.ANIMATED,
    });
    this.torso.mesh.isVisible = false;
    this.torso.mesh.isPickable = false;

    // ---- the sword arm, exactly as it was, and built exactly when it was ----
    //
    // The arm comes before the rest of the body, and the order is load-bearing
    // rather than editorial. Havok's solver is iterative, and an iterative
    // solver's answer depends on the order it visits bodies and constraints in
    // -- not at convergence, where everything agrees, but during a transient
    // where a force-limited motor is saturated and the solve is nowhere near
    // converged. Dragging a 6 kg arm and a 1.35 kg sword across the aiming
    // envelope in a quarter of a second is exactly such a transient: the grip's
    // 850 N ceiling is hit for most of it.
    //
    // Building the torso and then immediately the arm puts this fighter's arm
    // bodies and its six arm constraints at the same indices, in the same order,
    // that `Hero` handed them to Havok before the merge -- the arena's ground and
    // posts come first in both, and nothing else is created in between. Building
    // the hittable bones first instead pushes the arm eight bodies down the list,
    // and that alone moved the measured peak anchor-to-hand error over a sweep
    // from 221.74 mm to 242.88 mm. Nothing about the arm had changed: every
    // number, pivot, limit and mass in it is identical, the peak tip speed was
    // unmoved, and both steady-state errors stayed at exactly zero. Only the
    // order had changed.
    //
    // It is worth knowing what that reading does *not* mean, because the obvious
    // explanation was tested and is wrong. It is not the extra bodies sharing a
    // solver island with the arm: severing all eight non-arm limbs, which
    // disposes every constraint linking them to the torso, leaves the reading at
    // 242.88 mm exactly. Severing removes constraints and leaves the bodies where
    // they are in the list, which is precisely why it separates the two
    // explanations.
    //
    // So: do not move this block below the bones for tidiness. If it ever has to
    // move, the peak anchor-to-hand error over the standard sweep is the reading
    // that will notice, and it is one keystroke away on `G`.

    this.shoulderLocal = new Vector3(
      F.shoulderSide,
      F.shoulderHeight - B.torsoCentre,
      F.shoulderFront,
    );
    const shoulderWorld = place(F.shoulderSide, F.shoulderHeight, F.shoulderFront);
    const armDrop = (drop: number): Vector3 => shoulderWorld.add(new Vector3(0, -drop, 0));

    // The sword arm's capsules are the only bones drawn as themselves, and they
    // always have been: the costume leaves this arm out on purpose, because it
    // is the subject of the whole prototype and putting a sleeve over it would
    // be hiding the thing being looked at. They are pickable for the same reason
    // the costume is -- an arm is a limb like any other and hovering it should
    // say so.
    const limb = (name: string, drop: number, length: number, radius: number, mass: number, material: Material): Part => {
      const part = capsulePart(scene, {
        name: `${opts.side}.${name}`,
        position: armDrop(drop),
        rotation: yaw,
        height: length,
        radius,
        mass,
        layer: layers.body,
        collidesWith: layers.bodyCollides,
        material,
      });
      this.owned.add(part.mesh);
      return part;
    };

    // Rest pose: the arm hangs straight down, and the anchor lifts it on frame one.
    this.upperArm = limb("upperArm", A.upperLength / 2, A.upperLength, A.upperRadius, A.upperMass, materials.cloth);
    this.forearm = limb("forearm", A.upperLength + A.foreLength / 2, A.foreLength, A.foreRadius, A.foreMass, materials.leather);
    this.hand = limb("hand", A.upperLength + A.foreLength + A.handLength / 2, A.handLength, A.handRadius, A.handMass, materials.flesh);

    // Shoulder: a ball joint with a generous cone. The limits exist to rule out
    // inhuman poses, not to shape the motion.
    this.shoulder = joint(scene, this.torso, this.upperArm, {
      pivotParent: this.shoulderLocal,
      pivotChild: new Vector3(0, A.upperLength / 2, 0),
      swing: {
        x: { min: -2.7, max: 1.5 },
        y: { min: -1.9, max: 1.9 },
        z: { min: -1.7, max: 0.6 },
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
    const wrist = joint(scene, this.forearm, this.hand, {
      pivotParent: new Vector3(0, -A.foreLength / 2, 0),
      pivotChild: new Vector3(0, A.handLength / 2, 0),
      swing: {
        x: { min: -Math.PI, max: Math.PI },
        y: { min: -Math.PI, max: Math.PI },
        z: { min: -Math.PI, max: Math.PI },
      },
    });

    const fistWorld = armDrop(A.upperLength + A.foreLength + A.handLength);
    this.sword = new Sword(
      scene,
      {
        name: `${opts.side}.sword`,
        position: fistWorld,
        rotation: yaw,
        layer: layers.sword,
        collidesWith: layers.swordCollides,
      },
      materials,
    );

    // The blade must leave the fist pointing *away* from the wrist, so the
    // sword's +Y is welded to the hand's -Y. Getting this backwards put the
    // blade back up through the forearm, which is invisible when the fighter does
    // not collide with itself and baffling when you try to swing.
    //
    // Kept, where it used to be built and forgotten, because it is the one
    // constraint here that no limb owns and so the one nothing else would take
    // down. `PhysicsBody.dispose` releases the Havok body and walks straight past
    // whatever is constraining it, so a bout rebuilt on `Space` would leak this
    // one every time.
    this.swordWeld = joint(scene, this.hand, {
      name: `${opts.side}.sword`,
      mesh: this.hand.mesh,
      body: this.sword.body,
      shape: this.sword.shape,
    }, {
      pivotParent: new Vector3(0, -A.handLength / 2, 0),
      pivotChild: Vector3.Zero(),
      axisParent: new Vector3(1, 0, 0),
      axisChild: new Vector3(1, 0, 0),
      perpParent: new Vector3(0, -1, 0),
      perpChild: new Vector3(0, 1, 0),
      swing: {},
    });

    // The anchor: massless, collides with nothing, and exists only to be a frame
    // the solver can pull the hand toward.
    this.handAnchor = spherePart(scene, {
      name: `${opts.side}.handAnchor`,
      position: fistWorld,
      rotation: yaw,
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
      name: `${opts.side}.elbowAnchor`,
      position: shoulderWorld,
      rotation: yaw,
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

    // ---- the body that can be hit ----
    //
    // Everything below is built after the arm, for the reason given above it.
    // These are bones rather than the picture: `Figure` hangs a costume off each
    // one and that is what the eye and a pick both see.

    const bone = (
      name: string,
      position: Vector3,
      height: number,
      radius: number,
      mass: number,
    ): Part => {
      const part = capsulePart(scene, {
        name: `${opts.side}.${name}`,
        position,
        rotation: yaw,
        height,
        radius,
        mass,
        layer: layers.body,
        collidesWith: layers.bodyCollides,
        material: materials.hide,
        friction: 0.8,
      });
      // Invisible, but present: the solver drives these meshes and the costume
      // rides on them as children, so they are the transform the costume needs.
      // The rig overlay draws its own copies from `body.getGeometry()` and does
      // not care what is visible.
      part.mesh.isVisible = false;
      part.mesh.isPickable = false;
      return part;
    };

    this.head = bone("head", place(0, B.headCentre, 0), B.headLength, B.headRadius, B.headMass);
    this.pelvis = bone("pelvis", place(0, B.pelvisCentre, 0), B.pelvisLength, B.pelvisRadius, B.pelvisMass);

    // The off arm mirrors the sword arm across the centreline, so that a hit
    // landing on one side of a fighter finds the same geometry as on the other.
    const offSide = -F.shoulderSide;
    const offUpper = bone(
      "offUpperArm",
      place(offSide, B.offUpperCentre, F.shoulderFront),
      B.offUpperLength,
      B.offUpperRadius,
      B.offUpperMass,
    );
    const offFore = bone(
      "offForearm",
      place(offSide, B.offForeCentre, F.shoulderFront),
      B.offForeLength,
      B.offForeRadius,
      B.offForeMass,
    );

    const legs = (["L", "R"] as const).map((suffix, index) => {
      const x = index === 0 ? -B.hipSide : B.hipSide;
      return {
        x,
        thigh: bone(`thigh${suffix}`, place(x, B.thighCentre, 0), B.thighLength, B.thighRadius, B.thighMass),
        shin: bone(`shin${suffix}`, place(x, B.shinCentre, 0), B.shinLength, B.shinRadius, B.shinMass),
      };
    });

    // ---- and the joints that hold it on ----
    //
    // Every pivot below is written as `anchor - centre` for both parts, from the
    // heights in the `body` block, so the two anchors demonstrably meet. See the
    // class header for what happens when they do not.

    const hang = (spec: {
      key: string;
      label: string;
      parent: Part;
      parentCentre: Vector3;
      child: Part;
      childCentre: Vector3;
      /** Where the joint is, as a point in the fighter's own upright frame. */
      anchor: Vector3;
      swing: Parameters<typeof joint>[3]["swing"];
      strength: number;
      health: number;
      /** Which of the stride's angles this joint takes, if any. */
      angle?: keyof GaitPose;
    }): Limb => {
      const attachment = joint(scene, spec.parent, spec.child, {
        pivotParent: spec.anchor.subtract(spec.parentCentre),
        pivotChild: spec.anchor.subtract(spec.childCentre),
        swing: spec.swing,
      });
      this.springs.push({ constraint: attachment, strength: spec.strength });
      const limb: Limb = {
        key: spec.key,
        label: spec.label,
        part: spec.child,
        attachment,
        health: spec.health,
        maxHealth: spec.health,
        severed: false,
        lastHitAt: -999,
      };
      this.register(limb);
      if (spec.angle) this.driven.push({ constraint: attachment, limb, angle: spec.angle });
      return limb;
    };

    const health = B.partHealth;
    const spine = { x: { min: -0.6, max: 0.6 }, y: { min: -0.7, max: 0.7 }, z: { min: -0.6, max: 0.6 } };
    const socket = { x: { min: -1.9, max: 1.9 }, y: { min: -1.2, max: 1.2 }, z: { min: -1.6, max: 1.6 } };
    // A hip has to reach the whole stride and no further. The dummy's sockets
    // were wider because a rag has no pose to protect; a fighter's leg that can
    // reach the splits looks broken the first time it is hit hard.
    const hipRange = { x: { min: -1.3, max: 1.3 }, y: { min: -0.7, max: 0.7 }, z: { min: -0.6, max: 0.6 } };
    // Knees backward, elbows forward, and a hand's width of slack past straight
    // at each so that a motor target of zero is not sitting exactly on a stop.
    const knee = { x: { min: -0.15, max: 2.2 } };
    const armHinge = { x: { min: -2.2, max: 0.15 } };

    const torsoCentreVec = new Vector3(0, B.torsoCentre, 0);

    // The torso is the root and is keyframed, so nothing can take it off. It
    // still carries health, because a bout has to be able to end on a body blow
    // and because a torso that cannot be scored against would teach the player
    // to aim at limbs for the wrong reason.
    this.register({
      key: "torso",
      label: "Torso",
      part: this.torso,
      attachment: null,
      health: health * B.torsoHealth,
      maxHealth: health * B.torsoHealth,
      severed: false,
      lastHitAt: -999,
    });

    hang({
      key: "head",
      label: "Head",
      parent: this.torso,
      parentCentre: torsoCentreVec,
      child: this.head,
      childCentre: new Vector3(0, B.headCentre, 0),
      anchor: new Vector3(0, B.neck, 0),
      swing: spine,
      strength: B.neckStrength,
      health,
    });
    hang({
      key: "pelvis",
      label: "Pelvis",
      parent: this.torso,
      parentCentre: torsoCentreVec,
      child: this.pelvis,
      childCentre: new Vector3(0, B.pelvisCentre, 0),
      anchor: new Vector3(0, B.waist, 0),
      swing: spine,
      strength: B.waistStrength,
      health: health * B.pelvisHealth,
    });

    // The sword arm is hittable too, and it is the only limb whose loss changes
    // what the fighter can do rather than only how well it stands. Its two
    // joints are not in `springs`, because they are tuned out of the `arm` block
    // by `applyTuning` and must go on being tuned there.
    this.register({
      key: "upperArm",
      label: "Sword arm",
      part: this.upperArm,
      attachment: this.shoulder,
      health,
      maxHealth: health,
      severed: false,
      lastHitAt: -999,
    });
    this.register({
      key: "forearm",
      label: "Sword forearm",
      part: this.forearm,
      attachment: this.elbow,
      health,
      maxHealth: health,
      severed: false,
      lastHitAt: -999,
    });
    this.register({
      key: "hand",
      label: "Sword hand",
      part: this.hand,
      attachment: wrist,
      health,
      maxHealth: health,
      severed: false,
      lastHitAt: -999,
    });

    const offUpperCentre = new Vector3(offSide, B.offUpperCentre, F.shoulderFront);
    hang({
      key: "offUpperArm",
      label: "Off arm",
      parent: this.torso,
      parentCentre: torsoCentreVec,
      child: offUpper,
      childCentre: offUpperCentre,
      anchor: new Vector3(offSide, F.shoulderHeight, F.shoulderFront),
      swing: socket,
      strength: B.offShoulderStrength,
      health,
      angle: "offShoulder",
    });
    hang({
      key: "offForearm",
      label: "Off forearm",
      parent: offUpper,
      parentCentre: offUpperCentre,
      child: offFore,
      childCentre: new Vector3(offSide, B.offForeCentre, F.shoulderFront),
      anchor: new Vector3(offSide, B.offElbow, F.shoulderFront),
      swing: armHinge,
      strength: B.offElbowStrength,
      health,
      angle: "offElbow",
    });

    const pelvisCentreVec = new Vector3(0, B.pelvisCentre, 0);
    for (const [index, leg] of legs.entries()) {
      const suffix = index === 0 ? "L" : "R";
      const label = index === 0 ? "Left" : "Right";
      const thighCentre = new Vector3(leg.x, B.thighCentre, 0);
      hang({
        key: `thigh${suffix}`,
        label: `${label} thigh`,
        parent: this.pelvis,
        parentCentre: pelvisCentreVec,
        child: leg.thigh,
        childCentre: thighCentre,
        anchor: new Vector3(leg.x, B.hip, 0),
        swing: hipRange,
        strength: B.hipStrength,
        health,
        angle: index === 0 ? "hipLeft" : "hipRight",
      });
      hang({
        key: `shin${suffix}`,
        label: `${label} shin`,
        parent: leg.thigh,
        parentCentre: thighCentre,
        child: leg.shin,
        childCentre: new Vector3(leg.x, B.shinCentre, 0),
        anchor: new Vector3(leg.x, B.knee, 0),
        swing: knee,
        strength: B.kneeStrength,
        health,
        angle: index === 0 ? "kneeLeft" : "kneeRight",
      });
    }

    // The costume goes on last, because every piece of it hangs off a body that
    // has to exist first. It carries no authority of any kind: it is what the
    // eye and `scene.pick` see, and what the rig overlay takes off.
    this.costume = new Figure(scene, {
      prefix: opts.side,
      torso: this.torso,
      head: this.head,
      pelvis: this.pelvis,
      offUpperArm: offUpper,
      offForearm: offFore,
      thighLeft: legs[0].thigh,
      shinLeft: legs[0].shin,
      thighRight: legs[1].thigh,
      shinRight: legs[1].shin,
    }, materials).pieces;
    for (const mesh of this.costume) this.owned.add(mesh);

    this.applyTuning();
  }

  /**
   * Push the current CONFIG into the solver.
   *
   * Motor ceilings and damping are set on native objects at construction, so
   * editing CONFIG alone does nothing to them. Calling this re-reads the whole
   * lot, which is what makes `__sword.left.applyTuning()` a live tuning loop
   * rather than a page reload.
   *
   * The body's joints are in here for exactly that reason. The dummy set its
   * stiffnesses once, in a `stiffen()` helper called from its constructor, with
   * no way to re-read them -- so every live experiment that edited
   * `CONFIG.dummy.jointStiffness` and watched the result was measuring nothing
   * at all, and appeared to confirm whatever theory it was testing. A tunable
   * number with no way to push it into the solver is worse than a constant.
   */
  applyTuning(): void {
    const A = CONFIG.arm;
    const S = CONFIG.sword;
    const B = CONFIG.body;

    for (const axis of LINEAR) this.grip.setAxisMotorMaxForce(axis, A.linearMotorForce);
    for (const axis of ANGULAR) this.grip.setAxisMotorMaxForce(axis, A.angularMotorForce);

    for (const axis of ANGULAR) {
      this.shoulder.setAxisMotorType(axis, PhysicsConstraintMotorType.POSITION);
      this.shoulder.setAxisMotorTarget(axis, 0);
      this.shoulder.setAxisMotorMaxForce(axis, A.shoulderTone);
    }
    this.elbow.setAxisMotorType(PhysicsConstraintAxis.ANGULAR_X, PhysicsConstraintMotorType.POSITION);
    this.elbow.setAxisMotorTarget(PhysicsConstraintAxis.ANGULAR_X, A.elbowRest);
    this.elbow.setAxisMotorMaxForce(PhysicsConstraintAxis.ANGULAR_X, A.elbowTone);

    for (const axis of [PhysicsConstraintAxis.ANGULAR_X, PhysicsConstraintAxis.ANGULAR_Z]) {
      this.elbowDrive.setAxisMotorMaxForce(axis, A.elbowPoleForce);
    }

    for (const part of [this.upperArm, this.forearm, this.hand]) {
      part.body.setLinearDamping(A.linearDamping);
      part.body.setAngularDamping(A.angularDamping);
    }
    this.sword.body.setLinearDamping(S.swordLinearDamping);
    this.sword.body.setAngularDamping(S.swordAngularDamping);

    const inertia = this.sword.body.getMassProperties().inertia;
    if (inertia) this.swordInertia.copyFrom(inertia);

    // And the body's own joints, which is what the dummy could never do -- see
    // the note above. Every one of them is a position motor toward its rest
    // angle; the stride overwrites the targets of the six it drives on the very
    // next step, so setting them to zero here is a reset rather than a fight.
    for (const spring of this.springs) {
      for (const axis of ANGULAR) {
        spring.constraint.setAxisMotorType(axis, PhysicsConstraintMotorType.POSITION);
        spring.constraint.setAxisMotorTarget(axis, 0);
        spring.constraint.setAxisMotorMaxForce(axis, B.jointStiffness * spring.strength);
      }
    }
  }

  targetPosition(): Vector3 {
    return this.scratch.target;
  }

  /** The point the blade is aimed at, in world space. */
  aimPoint(): Vector3 {
    return this.scratch.aimFar;
  }

  /** The fighter's position on the ground. */
  feetPosition(): Vector3 {
    const p = this.torso.mesh.absolutePosition;
    return this.scratch.feet.set(p.x, 0, p.z);
  }

  /** Horizontal speed, for the gait. */
  groundSpeed(): number {
    return Math.hypot(this.velocity.x, this.velocity.z);
  }

  armAngles(): { azimuth: number; elevation: number; roll: number; reach: number } {
    return {
      azimuth: this.azimuth,
      elevation: this.elevation,
      roll: this.roll,
      reach: this.reach,
    };
  }

  /** False once the sword arm has been cut off it. */
  get armed(): boolean {
    return !this.armLost;
  }

  /**
   * Roughly where the fighter is, for a lock-on to point at and a ring to sit
   * under. The torso, which is the one part that cannot come off -- a lock that
   * followed a severed arm across the arena would be a comedy.
   */
  centre(): Vector3 {
    return this.middle.copyFrom(this.torso.mesh.absolutePosition);
  }

  /**
   * True for a mesh that stands for part of this fighter's body -- its costume
   * and its bare sword arm -- which is what a pick is allowed to choose.
   *
   * Asked as a question rather than answered by a name prefix, because the
   * swords are named after their side too and a sword is not a target, and
   * because a prefix test goes quietly wrong the first time anything else in the
   * scene is named after a side.
   */
  owns(mesh: AbstractMesh): boolean {
    return this.owned.has(mesh);
  }

  limbFor(body: PhysicsBody): Limb | undefined {
    return this.byBody.get(body);
  }

  /**
   * Republish what this fighter can see.
   *
   * Called before `update`, and before the *other* fighter's `update` too -- see
   * `stepPair`. Everything is written into `this.view` in place.
   *
   * **Nothing in here may touch a world matrix**, and that rule is the whole of
   * what this comment is for. It is not a preference and it cost a session to
   * learn.
   *
   * The first version read the torso through `getWorldMatrix()`, the limbs
   * through `absolutePosition` and the tip through `Sword.tipPosition`, on the
   * argument that reading the world the same way the arm reads it could not
   * disturb the arm. That argument was *correct about the physics* and wrong
   * about everything else, because both of those accessors have a side effect:
   * they run `computeWorldMatrix()`, which short-circuits on the scene's render
   * id and **stamps that id on the node**. Whoever calls first in a rendered
   * frame gets a fresh matrix and silently converts every later caller that
   * frame into a reader of that first sample.
   *
   * With the control loop at 240 Hz against a 60 Hz display, `observe` was
   * always first, four substeps ahead of everything else. The arm was unaffected
   * -- it reads through the same cache and got the same matrix it always had --
   * but a *measurement* taken from the console afterwards was reading a sample
   * up to three substeps old, and the standard sweep came back at 273.84 mm of
   * peak anchor-to-hand error against a true 242.88, with the tip speed and the
   * elbow drift shifted to match. It read exactly like a 9 % regression in the
   * arm. There was no regression: the instrument had been moved, not the thing
   * being measured. Measured both ways in `.review/parity.mjs`, forced against
   * unforced, with the two orderings run in freshly built scenes.
   *
   * So this reads `mesh.position` and `mesh.rotationQuaternion` instead. Every
   * bone, every anchor and the sword's root is a scene-root node, so those two
   * fields *are* the world transform; Havok's `syncTransform` writes them at the
   * end of every solver step, so they are cache-free and strictly fresher than
   * the matrix; and reading them stamps nothing, so a console reading taken
   * after a step is the same reading it was before this seam existed.
   *
   * It also drops the caveat the first version had to carry. A headless harness
   * that never renders never advances the render id, so a matrix-backed view
   * would freeze on its first sample; this one does not, and session 06's
   * measurements do not have to work around it.
   */
  observe(opponent: Fighter, clock: number): void {
    const view = this.view;
    view.clock = clock;
    this.describe(view.self, this);
    view.self.reach = this.reach;
    this.describe(view.opponent, opponent);
    view.measure = opponent.nearestPartTo(view.self.shoulder);
  }

  update(dt: number): void {
    const intent = this.mind.decide(this.view, dt);
    this.steer(dt, intent);
    this.walk(dt);
    if (this.armLost) return;
    this.aimArm(dt, intent);
    this.driveAnchor(dt);
    this.driveElbow();
    this.dampGrip(dt);
  }

  /** Cut a limb free and give it a parting shove along the cut. */
  sever(limb: Limb, direction: Vector3): void {
    if (limb.severed || !limb.attachment) return;
    limb.severed = true;
    limb.health = 0;
    limb.attachment.dispose();

    // Losing any piece of the sword arm drops the whole arm, anchors and all.
    // See `armLost`.
    if (limb.key === "upperArm" || limb.key === "forearm" || limb.key === "hand") {
      this.dropArm();
    }

    // Freed pieces stop being part of the fighter and become debris, so they no
    // longer benefit from the self-collision exemptions of a jointed body.
    limb.part.shape.filterMembershipMask = LAYER.DEBRIS;
    limb.part.shape.filterCollideMask = COLLIDES.DEBRIS;

    const kick = direction.normalizeToNew().scaleInPlace(CONFIG.combat.severKick);
    limb.part.body.applyImpulse(kick, limb.part.body.getObjectCenterWorld());
  }

  /**
   * Take the fighter out of the world.
   *
   * Constraints first, then bodies, and a severed limb's constraint is already
   * gone -- `dropArm` may also have taken the two anchor drives, which is why
   * they are guarded rather than disposed unconditionally. Disposing a mesh
   * disposes the aggregate that owns its body, and each part's mesh carries its
   * share of the costume as children, so the costume goes with the body it was
   * hanging on rather than being collected separately.
   */
  dispose(): void {
    for (const limb of this.limbs) {
      if (!limb.severed) limb.attachment?.dispose();
    }
    if (!this.armLost) {
      this.grip.dispose();
      this.elbowDrive.dispose();
    }
    this.swordWeld.dispose();
    this.sword.dispose();
    for (const limb of this.limbs) limb.part.mesh.dispose();
    this.handAnchor.mesh.dispose();
    this.elbowAnchor.mesh.dispose();
    this.limbs.length = 0;
    this.driven.length = 0;
    this.springs.length = 0;
    this.byBody.clear();
    this.owned.clear();
  }

  private register(limb: Limb): void {
    this.limbs.push(limb);
    this.byBody.set(limb.part.body, limb);
  }

  /**
   * Fill one half of a view from one fighter.
   *
   * A private method rather than a free function so that it can reach the other
   * fighter's `shoulderLocal`, which is private and should stay so: the shoulder
   * offset is a construction detail and the only thing anyone outside wants is
   * where the shoulder *is*.
   *
   * The health map's keys are created on the first call and overwritten on every
   * one after, so the object's shape settles immediately and the steady state
   * allocates nothing. A severed limb stays in `limbs` and reads as exactly 0,
   * which is what makes "is it still on" and "is it finished" one question.
   */
  private describe(into: BodyView, fighter: Fighter): void {
    const torso = fighter.torso.mesh;
    const here = torso.position;
    const spin = torso.rotationQuaternion;

    into.ground.set(here.x, 0, here.z);

    if (spin) {
      // `(0, 0, 1)` and `(1, 0, 0)` turned by the quaternion -- the third and
      // first columns of the rotation matrix, written out rather than composed
      // through a `Matrix`, because the whole point of this function is to touch
      // nothing that caches. The heading convention is the one used everywhere
      // here: zero down +Z, turning toward +X.
      const fx = 2 * (spin.x * spin.z + spin.w * spin.y);
      const fz = 1 - 2 * (spin.x * spin.x + spin.y * spin.y);
      into.facing = Math.atan2(fx, fz);
      Matrix.FromQuaternionToRef(spin, this.scratch.viewBasis);
      Vector3.TransformNormalToRef(fighter.shoulderLocal, this.scratch.viewBasis, into.shoulder);
      into.shoulder.addInPlace(here);
    } else {
      into.facing = 0;
      into.shoulder.copyFrom(fighter.shoulderLocal).addInPlace(here);
    }

    fighter.sword.tipPositionToRef(into.tip);
    into.tipSpeed = fighter.sword.speedAt(into.tip);

    for (const limb of fighter.limbs) {
      into.health[limb.key] = limb.severed ? 0 : Math.max(0, limb.health / limb.maxHealth);
    }
  }

  /**
   * How far the nearest piece of this fighter is from a point.
   *
   * Centres rather than surfaces, for the reason `FighterView.measure` gives.
   * Severed pieces are skipped: an arm lying on the floor five metres away is
   * not a thing to be in measure of, and a policy that closed on one would walk
   * away from the fight to stand over a limb.
   */
  private nearestPartTo(point: Vector3): number {
    let nearest = Number.POSITIVE_INFINITY;
    for (const limb of this.limbs) {
      if (limb.severed) continue;
      // `mesh.position`, never `mesh.absolutePosition`. Every bone is a
      // scene-root mesh, so the two hold the same value -- but the second one is
      // a `computeWorldMatrix()` in disguise, and calling it stamps the scene's
      // render id on the node. See `observe`.
      const distance = Vector3.Distance(point, limb.part.mesh.position);
      if (distance < nearest) nearest = distance;
    }
    return nearest;
  }

  private dropArm(): void {
    if (this.armLost) return;
    this.armLost = true;
    this.grip.dispose();
    this.elbowDrive.dispose();
    // A dropped sword is debris like any other piece, and the exemption that
    // let it pass through its owner belonged to the owner, not to the steel.
    this.sword.shape.filterMembershipMask = LAYER.DEBRIS;
    this.sword.shape.filterCollideMask = COLLIDES.DEBRIS;
  }

  private steer(dt: number, input: Intent): void {
    const F = CONFIG.fighter;
    const world = this.torso.mesh.getWorldMatrix();
    const right = this.scratch.right.set(world.m[0], world.m[1], world.m[2]).normalize();
    const forward = this.scratch.forward.set(world.m[8], world.m[9], world.m[10]).normalize();

    const desired = this.scratch.move.set(0, 0, 0);
    desired.addInPlace(forward.scale(input.forward * F.walkSpeed));
    desired.addInPlace(right.scale(input.strafe * F.strafeSpeed));

    const blend = 1 - Math.exp(-F.accelResponse * dt);
    this.velocity.x += (desired.x - this.velocity.x) * blend;
    this.velocity.z += (desired.z - this.velocity.z) * blend;
    this.velocity.y = 0;

    this.torso.body.setLinearVelocity(this.velocity);
    this.torso.body.setAngularVelocity(this.scratch.spin.set(0, this.turnRate(input, forward), 0));
  }

  /**
   * The stride, delivered to joint motors rather than to a costume.
   *
   * This is the one thing in the fighter that a `TransformNode` used to do and a
   * constraint does now, and the reason is severability: a leg that is a body
   * with a joint can be taken off, and a leg that is a rotation on a node cannot.
   * The cost is that a wrong sign is no longer invisible -- see `gait`.
   *
   * `body.gaitDrivesLegs` turns it off without turning the legs off, which is
   * the switch to reach for if the knees ever chatter: the legs stay hittable and
   * simply hold straight. That is the fallback the plan asked to be available,
   * kept as a live config flag rather than as a second code path, because a
   * second code path would rot the moment nobody was using it.
   */
  private walk(dt: number): void {
    const B = CONFIG.body;
    const speed = this.groundSpeed();
    this.stride += speed * CONFIG.fighter.strideCadence * dt;

    const pose = B.gaitDrivesLegs ? gait(this.stride, speed) : REST_POSE;
    for (const drive of this.driven) {
      // A severed limb's joint has been disposed, and writing a motor target
      // into a freed constraint is the one way this loop can take the page down.
      if (drive.limb.severed) continue;
      drive.constraint.setAxisMotorTarget(PhysicsConstraintAxis.ANGULAR_X, pose[drive.angle]);
    }
  }

  /**
   * Yaw rate: yours if you are steering, otherwise the lock's.
   *
   * A lock that fights the turn keys would be a trap, so touching them wins --
   * and, at the call site, drops the lock outright. Circling a locked enemy is
   * the point of the whole feature: strafe, and the fighter keeps its front and
   * its guard toward the thing trying to kill it.
   */
  private turnRate(input: Intent, forward: Vector3): number {
    const F = CONFIG.fighter;
    if (input.turn !== 0 || !this.lockTarget) return input.turn * F.turnSpeed;

    const T = CONFIG.targeting;
    const here = this.torso.mesh.absolutePosition;
    const wanted = Math.atan2(this.lockTarget.x - here.x, this.lockTarget.z - here.z);
    const facing = Math.atan2(forward.x, forward.z);
    return clamp(angleTo(facing, wanted) * T.lockTurnGain, -T.lockTurnMax, T.lockTurnMax);
  }

  /**
   * Where the cursor is on screen is where the hand is asked to be.
   *
   * Absolute rather than accumulated: the pointer is not captured, so the arm
   * has a home position you can always find again by moving the mouse back to
   * the middle of the window.
   */
  private aimArm(dt: number, input: Intent): void {
    const A = CONFIG.arm;

    this.azimuth = clamp(spread(input.pointerX, A.azMin, A.azMax), A.azMin, A.azMax);
    this.elevation = clamp(spread(input.pointerY, A.elMin, A.elMax), A.elMin, A.elMax);
    this.roll = clamp(input.roll, A.rollMin, A.rollMax);

    const wanted = Math.min(
      input.thrust ? A.reachThrust : input.guard ? A.reachGuard : A.reachNeutral,
      A.reachMax,
    );
    this.reach += (wanted - this.reach) * (1 - Math.exp(-A.reachResponse * dt));

    const { dirLocal, shoulder, target, aim } = this.scratch;
    const cosEl = Math.cos(this.elevation);
    dirLocal.set(
      Math.sin(this.azimuth) * cosEl,
      Math.sin(this.elevation),
      Math.cos(this.azimuth) * cosEl,
    );

    const world = this.torso.mesh.getWorldMatrix();
    Vector3.TransformCoordinatesToRef(this.shoulderLocal, world, shoulder);
    Vector3.TransformNormalToRef(dirLocal, world, aim);
    aim.normalize();

    target.copyFrom(shoulder).addInPlace(aim.scale(this.reach));

    // Where the point of the blade is being sent, which is what the player is
    // actually aiming and so what the indicator stakes out.
    this.scratch.aimFar
      .copyFrom(shoulder)
      .addInPlace(aim.scale(this.reach + this.sword.tipOffset));
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

    // The edge starts perpendicular to the blade, then rolls about it.
    edge.set(0, 1, 0);
    edge.subtractInPlace(aim.scale(Vector3.Dot(edge, aim)));
    if (edge.lengthSquared() < 1e-5) edge.set(1, 0, 0).subtractInPlace(aim.scale(aim.x));
    edge.normalize();

    Vector3.CrossToRef(aim, edge, axisZ);
    edge.scaleInPlace(Math.cos(this.roll)).addInPlace(axisZ.scaleInPlace(Math.sin(this.roll)));
    edge.normalize();

    axisX.copyFrom(edge);
    axisX.subtractInPlace(axisY.scale(Vector3.Dot(axisX, axisY))).normalize();
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

    const world = this.torso.mesh.getWorldMatrix();
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
    const frame = this.sword.root.rotationQuaternion;
    if (!frame) return;

    this.sword.body.getAngularVelocityToRef(s.swordSpin);
    s.swordSpin.subtractInPlace(s.commandedSpin);

    Matrix.FromQuaternionToRef(frame, s.swordFrame);
    s.swordFrame.transposeToRef(s.swordFrameInverse);
    Vector3.TransformNormalToRef(s.swordSpin, s.swordFrameInverse, s.localSpin);

    // 1 - exp(-rate*dt) rather than rate*dt, so the bleed-off cannot overshoot
    // into a sign flip however coarse the step gets.
    const bleed = 1 - Math.exp(-rate * dt);
    s.impulse.set(
      -bleed * this.swordInertia.x * s.localSpin.x,
      -bleed * this.swordInertia.y * s.localSpin.y,
      -bleed * this.swordInertia.z * s.localSpin.z,
    );
    Vector3.TransformNormalToRef(s.impulse, s.swordFrame, s.impulse);
    this.sword.body.applyAngularImpulse(s.impulse);
  }
}

/**
 * One control step for the pair in the ring: both look, then both act.
 *
 * The ordering is the whole reason this is a function rather than four lines at
 * the call site. Observing a fighter after the other one has already moved this
 * step hands the second mind a half-step of foresight the first never gets --
 * small, invisible, systematic, and exactly the sort of thing that makes a
 * measured win rate mean something other than what it says. Session 06 reports
 * `duelist` against `swinger` as a distribution and swaps which side each is on
 * to cancel the arena; it should not also have to cancel this.
 *
 * Called once per solver substep from `scene.onBeforePhysicsObservable`, never
 * from the render loop. Babylon's accumulator takes several fixed steps per
 * rendered frame and notifies that observable before each; driving from the
 * render loop refreshes the keyframed anchors on only the first of them, and the
 * arm coasts through the rest.
 */
export function stepPair(left: Fighter, right: Fighter, dt: number, clock: number): void {
  left.observe(right, clock);
  right.observe(left, clock);
  left.update(dt);
  right.update(dt);
}
