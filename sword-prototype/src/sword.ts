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

import { CONFIG } from "./config.ts";

export interface SwordOptions {
  /**
   * Name of the root node, and the prefix every piece of the blade is named
   * with. There are two swords in the ring now and they must be told apart in
   * the inspector, in a picking predicate and in a mesh list, so the name is
   * given rather than assumed.
   */
  name: string;
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
    // For the two cache-free accessors below, kept apart from the six above so
    // that a reading taken for a mind can never overwrite one taken for a hit.
    freeTip: new Vector3(),
    freeLin: new Vector3(),
    freeAng: new Vector3(),
    freeCentre: new Vector3(),
    freeRel: new Vector3(),
  };

  constructor(scene: Scene, opts: SwordOptions, materials: { steel: Material; leather: Material; brass: Material }) {
    const { bladeLength, bladeWidth, bladeThickness, guardWidth, gripLength, mass, balancePoint } =
      CONFIG.sword;

    this.baseOffset = gripLength / 2;
    this.tipOffset = this.baseOffset + bladeLength;

    this.root = new TransformNode(opts.name, scene);
    this.root.position.copyFrom(opts.position);
    this.root.rotationQuaternion = opts.rotation ? opts.rotation.clone() : Quaternion.Identity();

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
    this.shape.filterMembershipMask = opts.layer;
    this.shape.filterCollideMask = opts.collidesWith;

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
