import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { Vector3, Quaternion } from "@babylonjs/core/Maths/math.vector.js";
import { PhysicsBody } from "@babylonjs/core/Physics/v2/physicsBody.js";
import {
  PhysicsShapeBox,
  PhysicsShapeContainer,
} from "@babylonjs/core/Physics/v2/physicsShape.js";
import { PhysicsMotionType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";
import type { Material } from "@babylonjs/core/Materials/material.js";
import type { Scene } from "@babylonjs/core/scene.js";

import { CONFIG } from "./config";
import { LAYER, COLLIDES } from "./physics";

/**
 * The sword's local frame, which the whole damage model is written against:
 *
 *   +Y  along the blade, from grip toward tip
 *   +X  the edge axis -- this is a double-edged arming sword, so both -X and +X
 *       cut, and a swing only bites when the blade travels along this axis
 *   +Z  the flat of the blade; travel along Z is a slap, not a cut
 *
 * The origin sits at the middle of the grip so that welding it into a hand is a
 * pivot at the origin rather than an offset nobody can picture.
 */
export class Sword {
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
  };

  constructor(scene: Scene, position: Vector3, materials: { steel: Material; leather: Material; brass: Material }) {
    const { bladeLength, bladeWidth, bladeThickness, guardWidth, gripLength, mass, balancePoint } =
      CONFIG.sword;

    this.baseOffset = gripLength / 2;
    this.tipOffset = this.baseOffset + bladeLength;

    this.root = new TransformNode("sword", scene);
    this.root.position.copyFrom(position);
    this.root.rotationQuaternion = Quaternion.Identity();

    const bladeCentre = this.baseOffset + bladeLength / 2;

    const blade = MeshBuilder.CreateBox(
      "sword.blade",
      { width: bladeWidth, height: bladeLength, depth: bladeThickness },
      scene,
    );
    blade.position.set(0, bladeCentre, 0);
    blade.material = materials.steel;
    blade.parent = this.root;

    // A short secondary box at the point reads as a taper without needing a
    // custom mesh, and costs nothing.
    const point = MeshBuilder.CreateBox(
      "sword.point",
      { width: bladeWidth * 0.45, height: bladeLength * 0.16, depth: bladeThickness * 0.9 },
      scene,
    );
    point.position.set(0, this.tipOffset - bladeLength * 0.08, 0);
    point.material = materials.steel;
    point.parent = this.root;

    const guard = MeshBuilder.CreateBox(
      "sword.guard",
      { width: guardWidth, height: 0.026, depth: 0.038 },
      scene,
    );
    guard.position.set(0, this.baseOffset, 0);
    guard.material = materials.brass;
    guard.parent = this.root;

    const grip = MeshBuilder.CreateCylinder(
      "sword.grip",
      { height: gripLength, diameterTop: 0.028, diameterBottom: 0.034, tessellation: 10 },
      scene,
    );
    grip.material = materials.leather;
    grip.parent = this.root;

    const pommel = MeshBuilder.CreateSphere(
      "sword.pommel",
      { diameter: 0.052, segments: 8 },
      scene,
    );
    pommel.position.set(0, -gripLength / 2, 0);
    pommel.material = materials.brass;
    pommel.parent = this.root;

    // Physics: one compound shape, so the guard can turn a blow and the pommel
    // has presence, rather than the blade being the only thing in the world.
    this.shape = new PhysicsShapeContainer(scene);
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
    this.shape.filterMembershipMask = LAYER.SWORD;
    this.shape.filterCollideMask = COLLIDES.SWORD;

    this.body = new PhysicsBody(this.root, PhysicsMotionType.DYNAMIC, false, scene);
    this.body.shape = this.shape;
    this.body.setMassProperties({
      mass,
      // An arming sword balances a hand's width ahead of the guard. Put the
      // centre of mass there and the weapon rotates about the wrist the way a
      // sword does instead of the way a broom does.
      centerOfMass: new Vector3(0, this.baseOffset + balancePoint, 0),
    });
    this.body.setCollisionCallbackEnabled(true);
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
}
