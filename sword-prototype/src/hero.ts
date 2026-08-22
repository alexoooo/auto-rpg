import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { PhysicsMotionType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";
import type { Material } from "@babylonjs/core/Materials/material.js";
import type { Scene } from "@babylonjs/core/scene.js";

import { CONFIG } from "./config";
import { LAYER, COLLIDES } from "./physics";
import { capsulePart, joint, weld, type Part } from "./rig";
import { Sword } from "./sword";
import type { InputState } from "./input";

export interface HeroMaterials {
  flesh: Material;
  cloth: Material;
  steel: Material;
  leather: Material;
  brass: Material;
}

const clampLength = (v: Vector3, max: number): Vector3 => {
  const length = v.length();
  return length > max ? v.scaleInPlace(max / length) : v;
};

const clamp = (value: number, min: number, max: number) =>
  value < min ? min : value > max ? max : value;

/**
 * The hero.
 *
 * The torso is keyframed: it goes exactly where you steer it, because a body
 * that wobbles under the weight of its own arm is not fun to walk around.
 * Everything from the shoulder outward is genuinely simulated -- three
 * constrained bones and a weighted sword, driven by a spring at the hand rather
 * than by any animation.
 *
 * That split is the design. Your movement is yours; your arm is only mostly
 * yours, and the sword is a heavy object you are negotiating with.
 */
export class Hero {
  readonly torso: Part;
  readonly upperArm: Part;
  readonly forearm: Part;
  readonly hand: Part;
  readonly sword: Sword;

  /** Hand target in torso space: azimuth, elevation, and distance out. */
  private azimuth = 0.3;
  private elevation = -0.15;
  private roll = 0;
  private reach = CONFIG.arm.reachNeutral;

  private readonly shoulderLocal: Vector3;
  private readonly velocity = new Vector3();

  private readonly scratch = {
    dirLocal: new Vector3(),
    dirWorld: new Vector3(),
    shoulder: new Vector3(),
    target: new Vector3(),
    force: new Vector3(),
    torque: new Vector3(),
    errA: new Vector3(),
    errB: new Vector3(),
    aim: new Vector3(),
    desiredEdge: new Vector3(),
    axis: new Vector3(),
    move: new Vector3(),
    right: new Vector3(),
    forward: new Vector3(),
  };

  constructor(scene: Scene, origin: Vector3, materials: HeroMaterials) {
    const H = CONFIG.hero;
    const A = CONFIG.arm;

    const torsoHeight = 1.62;
    const torsoRadius = 0.24;
    const torsoCentre = torsoHeight / 2 + 0.09;

    this.torso = capsulePart(scene, {
      name: "hero.torso",
      position: origin.add(new Vector3(0, torsoCentre, 0)),
      height: torsoHeight,
      radius: torsoRadius,
      mass: 68,
      layer: LAYER.HERO,
      collidesWith: COLLIDES.HERO,
      material: materials.cloth,
      motionType: PhysicsMotionType.ANIMATED,
    });

    this.shoulderLocal = new Vector3(
      H.shoulderSide,
      H.shoulderHeight - torsoCentre,
      H.shoulderFront,
    );
    const shoulderWorld = origin.add(new Vector3(0, torsoCentre, 0)).add(this.shoulderLocal);

    // Rest pose: the arm hangs straight down. The controller lifts it on the
    // first frame, which is also a decent smoke test that the spring is alive.
    this.upperArm = capsulePart(scene, {
      name: "hero.upperArm",
      position: shoulderWorld.add(new Vector3(0, -A.upperLength / 2, 0)),
      height: A.upperLength,
      radius: A.upperRadius,
      mass: A.upperMass,
      layer: LAYER.HERO,
      collidesWith: COLLIDES.HERO,
      material: materials.cloth,
    });

    this.forearm = capsulePart(scene, {
      name: "hero.forearm",
      position: shoulderWorld.add(new Vector3(0, -A.upperLength - A.foreLength / 2, 0)),
      height: A.foreLength,
      radius: A.foreRadius,
      mass: A.foreMass,
      layer: LAYER.HERO,
      collidesWith: COLLIDES.HERO,
      material: materials.leather,
    });

    this.hand = capsulePart(scene, {
      name: "hero.hand",
      position: shoulderWorld.add(
        new Vector3(0, -A.upperLength - A.foreLength - A.handLength / 2, 0),
      ),
      height: A.handLength,
      radius: A.handRadius,
      mass: A.handMass,
      layer: LAYER.HERO,
      collidesWith: COLLIDES.HERO,
      material: materials.flesh,
    });

    // Shoulder: a ball joint with a generous cone. The limits exist to stop
    // inhuman poses, not to shape the motion -- the spring at the hand does that.
    joint(scene, this.torso, this.upperArm, {
      pivotParent: this.shoulderLocal,
      pivotChild: new Vector3(0, A.upperLength / 2, 0),
      swing: {
        x: { min: -2.7, max: 1.5 },
        y: { min: -1.9, max: 1.9 },
        z: { min: -1.7, max: 0.6 },
      },
    });

    // Elbow: a hinge. It bends one way, like an elbow.
    joint(scene, this.upperArm, this.forearm, {
      pivotParent: new Vector3(0, -A.upperLength / 2, 0),
      pivotChild: new Vector3(0, A.foreLength / 2, 0),
      swing: { x: { min: -2.45, max: 0 } },
    });

    // Wrist: a little bend, and a lot of roll. Roll is what turns the edge, so
    // it is the one axis given a nearly full range.
    joint(scene, this.forearm, this.hand, {
      pivotParent: new Vector3(0, -A.foreLength / 2, 0),
      pivotChild: new Vector3(0, A.handLength / 2, 0),
      swing: {
        x: { min: -1.05, max: 1.05 },
        y: { min: -2.6, max: 2.6 },
        z: { min: -0.55, max: 0.55 },
      },
    });

    const gripWorld = shoulderWorld.add(
      new Vector3(0, -A.upperLength - A.foreLength - A.handLength, 0),
    );
    this.sword = new Sword(scene, gripWorld, materials);

    // Welded rather than fused: cutting this one constraint is a disarm, which
    // is the entire implementation of being disarmed.
    weld(
      scene,
      this.hand,
      { name: "sword", mesh: this.hand.mesh, body: this.sword.body, shape: this.sword.shape },
      new Vector3(0, -A.handLength / 2, 0),
      Vector3.Zero(),
    );
  }

  /** Where the hand is being asked to go, in world space. The HUD draws it. */
  targetPosition(): Vector3 {
    return this.scratch.target;
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
    this.driveHand();
    this.aimBlade();
  }

  private steer(dt: number, input: InputState): void {
    const H = CONFIG.hero;
    const world = this.torso.mesh.getWorldMatrix();
    const right = this.scratch.right.set(world.m[0], world.m[1], world.m[2]).normalize();
    const forward = this.scratch.forward.set(world.m[8], world.m[9], world.m[10]).normalize();

    const desired = this.scratch.move.set(0, 0, 0);
    desired.addInPlace(forward.scale(input.forward * H.walkSpeed));
    desired.addInPlace(right.scale(input.strafe * H.strafeSpeed));

    // Ease toward the requested velocity so starting and stopping have weight.
    const blend = 1 - Math.exp(-H.accelResponse * dt);
    this.velocity.x += (desired.x - this.velocity.x) * blend;
    this.velocity.z += (desired.z - this.velocity.z) * blend;
    this.velocity.y = 0;

    // A keyframed body is moved by its velocity rather than by teleporting its
    // transform. That way the shoulder constraint sees the motion, and the sword
    // swings out behind you when you turn -- which is most of the feel.
    this.torso.body.setLinearVelocity(this.velocity);
    this.torso.body.setAngularVelocity(this.scratch.axis.set(0, input.turn * H.turnSpeed, 0));
  }

  private aimArm(dt: number, input: InputState): void {
    const A = CONFIG.arm;

    this.azimuth = clamp(this.azimuth + input.mouseDx * A.mouseSensitivity, A.azMin, A.azMax);
    this.elevation = clamp(this.elevation - input.mouseDy * A.mouseSensitivity, A.elMin, A.elMax);
    this.roll = clamp(this.roll + input.wheel * A.rollSensitivity, A.rollMin, A.rollMax);

    const wanted = input.thrust ? A.reachThrust : input.guard ? A.reachGuard : A.reachNeutral;
    this.reach += (wanted - this.reach) * (1 - Math.exp(-A.reachResponse * dt));

    const { dirLocal, dirWorld, shoulder, target } = this.scratch;
    const cosEl = Math.cos(this.elevation);
    dirLocal.set(
      Math.sin(this.azimuth) * cosEl,
      Math.sin(this.elevation),
      Math.cos(this.azimuth) * cosEl,
    );

    const world = this.torso.mesh.getWorldMatrix();
    Vector3.TransformCoordinatesToRef(this.shoulderLocal, world, shoulder);
    Vector3.TransformNormalToRef(dirLocal, world, dirWorld);
    dirWorld.normalize();

    target.copyFrom(shoulder).addInPlace(dirWorld.scale(this.reach));
  }

  /** One spring-damper at the hand drags the whole arm behind it. */
  private driveHand(): void {
    const A = CONFIG.arm;
    const handPos = this.hand.body.getObjectCenterWorld();
    const handVel = this.hand.body.getLinearVelocity();

    const force = this.scratch.force.copyFrom(this.scratch.target).subtractInPlace(handPos);
    force.scaleInPlace(A.stiffness);
    force.subtractInPlace(handVel.scale(A.damping));

    // Cancel most of the weight of arm and sword, or the guard sags and every
    // swing has to start by climbing out of a droop.
    const carried = A.upperMass + A.foreMass + A.handMass + CONFIG.sword.mass;
    force.y += A.gravityCompensation * carried * -CONFIG.world.gravity;

    clampLength(force, A.maxForce);
    this.hand.body.applyForce(force, handPos);
  }

  /**
   * Aim the blade with torque.
   *
   * Two cross products and no quaternion algebra: cross(current, desired) is an
   * axis whose length is the sine of the angle between them, which is exactly the
   * proportional error term wanted here, and is immune to getting a
   * multiplication order or a handedness convention backwards.
   */
  private aimBlade(): void {
    const S = CONFIG.sword;
    const { aim, desiredEdge, errA, errB, torque } = this.scratch;

    // The blade continues the line running from the shoulder out through the hand.
    aim.copyFrom(this.scratch.target).subtractInPlace(this.scratch.shoulder).normalize();

    // The edge sits perpendicular to that line, rolled by the wrist: start from
    // world up, remove whatever lies along the blade, then roll about the blade.
    desiredEdge.set(0, 1, 0);
    desiredEdge.subtractInPlace(aim.scale(Vector3.Dot(desiredEdge, aim)));
    if (desiredEdge.lengthSquared() < 1e-5) {
      desiredEdge.set(1, 0, 0).subtractInPlace(aim.scale(aim.x));
    }
    desiredEdge.normalize();

    Vector3.CrossToRef(aim, desiredEdge, errA);
    const cr = Math.cos(this.roll);
    const sr = Math.sin(this.roll);
    desiredEdge.scaleInPlace(cr).addInPlace(errA.scaleInPlace(sr)).normalize();

    Vector3.CrossToRef(this.sword.bladeDirection(), aim, errA);
    Vector3.CrossToRef(this.sword.edgeDirection(), desiredEdge, errB);

    torque.copyFrom(errA).addInPlace(errB.scaleInPlace(0.55));
    torque.scaleInPlace(S.torqueStiffness);
    torque.subtractInPlace(this.sword.body.getAngularVelocity().scale(S.torqueDamping));

    clampLength(torque, S.maxTorque);
    this.sword.body.applyTorque(torque);
  }
}
