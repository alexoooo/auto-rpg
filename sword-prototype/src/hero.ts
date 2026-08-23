import { Vector3, Quaternion, Matrix } from "@babylonjs/core/Maths/math.vector.js";
import {
  PhysicsMotionType,
  PhysicsConstraintAxis,
  PhysicsConstraintAxisLimitMode,
  PhysicsConstraintMotorType,
} from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";
import { Physics6DoFConstraint } from "@babylonjs/core/Physics/v2/physicsConstraint.js";
import type { Material } from "@babylonjs/core/Materials/material.js";
import type { Scene } from "@babylonjs/core/scene.js";

import { CONFIG } from "./config";
import { LAYER, COLLIDES } from "./physics";
import { capsulePart, joint, spherePart, type Part } from "./rig";
import { Sword } from "./sword";
import type { InputState } from "./input";

export interface HeroMaterials {
  flesh: Material;
  cloth: Material;
  steel: Material;
  leather: Material;
  brass: Material;
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
 * The hero.
 *
 * The torso is keyframed: it goes exactly where you steer it, because a body
 * that wobbles under the weight of its own arm is not fun to walk around.
 * Everything from the shoulder outward is genuinely simulated -- three
 * constrained bones and a weighted sword.
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
 */
export class Hero {
  readonly torso: Part;
  readonly upperArm: Part;
  readonly forearm: Part;
  readonly hand: Part;
  readonly handAnchor: Part;
  readonly elbowAnchor: Part;
  readonly sword: Sword;
  /** Height of the collision capsule's centre above the feet. The cosmetic
   *  figure hangs off this, so it lives here rather than as a local. */
  readonly torsoCentre: number;

  /** Where to face while locked on, or null to steer by hand. */
  lockTarget: Vector3 | null = null;

  private readonly grip: Physics6DoFConstraint;
  private readonly shoulder: Physics6DoFConstraint;
  private readonly elbow: Physics6DoFConstraint;
  private readonly elbowDrive: Physics6DoFConstraint;

  /** Hand target in torso space: azimuth, elevation, and distance out. */
  private azimuth = 0.3;
  private elevation = -0.15;
  private roll = 0;
  private reach = CONFIG.arm.reachNeutral;

  private readonly shoulderLocal: Vector3;
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
    swordFrame: Matrix.Identity(),
    swordFrameInverse: Matrix.Identity(),
    rotation: Quaternion.Identity(),
    elbowRotation: Quaternion.Identity(),
  };

  constructor(scene: Scene, origin: Vector3, materials: HeroMaterials) {
    const H = CONFIG.hero;
    const A = CONFIG.arm;

    const torsoHeight = 1.62;
    const torsoCentre = torsoHeight / 2 + 0.09;
    this.torsoCentre = torsoCentre;

    this.torso = capsulePart(scene, {
      name: "hero.torso",
      position: origin.add(new Vector3(0, torsoCentre, 0)),
      height: torsoHeight,
      radius: 0.24,
      mass: 68,
      layer: LAYER.HERO,
      collidesWith: COLLIDES.HERO,
      material: materials.cloth,
      motionType: PhysicsMotionType.ANIMATED,
    });
    // The collision capsule is not the hero any more; `Figure` draws the body.
    this.torso.mesh.isVisible = false;

    this.shoulderLocal = new Vector3(
      H.shoulderSide,
      H.shoulderHeight - torsoCentre,
      H.shoulderFront,
    );
    const shoulderWorld = origin.add(new Vector3(0, torsoCentre, 0)).add(this.shoulderLocal);

    const limb = (name: string, drop: number, length: number, radius: number, mass: number, material: Material): Part => {
      const part = capsulePart(scene, {
        name: `hero.${name}`,
        position: shoulderWorld.add(new Vector3(0, -drop, 0)),
        height: length,
        radius,
        mass,
        layer: LAYER.HERO,
        collidesWith: COLLIDES.HERO,
        material,
      });
      part.mesh.isPickable = false;
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
    joint(scene, this.forearm, this.hand, {
      pivotParent: new Vector3(0, -A.foreLength / 2, 0),
      pivotChild: new Vector3(0, A.handLength / 2, 0),
      swing: {
        x: { min: -Math.PI, max: Math.PI },
        y: { min: -Math.PI, max: Math.PI },
        z: { min: -Math.PI, max: Math.PI },
      },
    });

    const fistWorld = shoulderWorld.add(
      new Vector3(0, -A.upperLength - A.foreLength - A.handLength, 0),
    );
    this.sword = new Sword(scene, fistWorld, materials);

    // The blade must leave the fist pointing *away* from the wrist, so the
    // sword's +Y is welded to the hand's -Y. Getting this backwards put the
    // blade back up through the forearm, which is invisible when the hero does
    // not collide with itself and baffling when you try to swing.
    joint(scene, this.hand, {
      name: "sword",
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
      name: "hero.handAnchor",
      position: fistWorld,
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
      name: "hero.elbowAnchor",
      position: shoulderWorld,
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

    this.applyTuning();
  }

  /**
   * Push the current CONFIG into the solver.
   *
   * Motor ceilings and damping are set on native objects at construction, so
   * editing CONFIG alone does nothing to them. Calling this re-reads the whole
   * lot, which is what makes `__sword.hero.applyTuning()` a live tuning loop
   * rather than a page reload.
   */
  applyTuning(): void {
    const A = CONFIG.arm;
    const S = CONFIG.sword;

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
  }

  targetPosition(): Vector3 {
    return this.scratch.target;
  }

  /** The point the blade is aimed at, in world space. */
  aimPoint(): Vector3 {
    return this.scratch.aimFar;
  }

  /** The hero's position on the ground. */
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

  update(dt: number, input: InputState): void {
    this.steer(dt, input);
    this.aimArm(dt, input);
    this.driveAnchor(dt);
    this.driveElbow();
    this.dampGrip(dt);
  }

  private steer(dt: number, input: InputState): void {
    const H = CONFIG.hero;
    const world = this.torso.mesh.getWorldMatrix();
    const right = this.scratch.right.set(world.m[0], world.m[1], world.m[2]).normalize();
    const forward = this.scratch.forward.set(world.m[8], world.m[9], world.m[10]).normalize();

    const desired = this.scratch.move.set(0, 0, 0);
    desired.addInPlace(forward.scale(input.forward * H.walkSpeed));
    desired.addInPlace(right.scale(input.strafe * H.strafeSpeed));

    const blend = 1 - Math.exp(-H.accelResponse * dt);
    this.velocity.x += (desired.x - this.velocity.x) * blend;
    this.velocity.z += (desired.z - this.velocity.z) * blend;
    this.velocity.y = 0;

    this.torso.body.setLinearVelocity(this.velocity);
    this.torso.body.setAngularVelocity(this.scratch.spin.set(0, this.turnRate(input, forward), 0));
  }

  /**
   * Yaw rate: yours if you are steering, otherwise the lock's.
   *
   * A lock that fights the turn keys would be a trap, so touching them wins --
   * and, at the call site, drops the lock outright. Circling a locked enemy is
   * the point of the whole feature: strafe, and the hero keeps its front and its
   * guard toward the thing trying to kill it.
   */
  private turnRate(input: InputState, forward: Vector3): number {
    const H = CONFIG.hero;
    if (input.turn !== 0 || !this.lockTarget) return input.turn * H.turnSpeed;

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
  private aimArm(dt: number, input: InputState): void {
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
