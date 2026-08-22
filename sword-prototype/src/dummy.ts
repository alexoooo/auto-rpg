import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate.js";
import {
  PhysicsShapeType,
  PhysicsMotionType,
  PhysicsConstraintAxis,
  PhysicsConstraintMotorType,
} from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";
import type { Physics6DoFConstraint } from "@babylonjs/core/Physics/v2/physicsConstraint.js";
import type { PhysicsBody } from "@babylonjs/core/Physics/v2/physicsBody.js";
import type { Material } from "@babylonjs/core/Materials/material.js";
import type { Scene } from "@babylonjs/core/scene.js";

import { CONFIG } from "./config";
import { LAYER, COLLIDES } from "./physics";
import { capsulePart, joint, type Part } from "./rig";

export interface DummyMaterials {
  hide: Material;
  wood: Material;
  straw: Material;
}

/** One severable piece of the dummy, and how close it is to coming off. */
export interface Limb {
  readonly key: string;
  readonly label: string;
  readonly part: Part;
  /** The joint holding it to its parent. Cutting this is a dismemberment. */
  readonly attachment: Physics6DoFConstraint | null;
  health: number;
  readonly maxHealth: number;
  severed: boolean;
  /** Simulation time of the last billed hit, for the per-part cooldown. */
  lastHitAt: number;
}

const ANGULAR = [
  PhysicsConstraintAxis.ANGULAR_X,
  PhysicsConstraintAxis.ANGULAR_Y,
  PhysicsConstraintAxis.ANGULAR_Z,
];

/**
 * Give a joint a spring back to its rest pose.
 *
 * Without this the dummy is a rag: it collapses the moment it exists. With it,
 * the figure stands, absorbs a hit, and recovers -- and how hard it fights back
 * is one number, which is the point of exposing it in the config.
 */
function stiffen(constraint: Physics6DoFConstraint, maxForce: number): void {
  for (const axis of ANGULAR) {
    constraint.setAxisMotorType(axis, PhysicsConstraintMotorType.POSITION);
    constraint.setAxisMotorTarget(axis, 0);
    constraint.setAxisMotorMaxForce(axis, maxForce);
  }
}

/**
 * The thing you hit.
 *
 * It is a jointed figure rather than a block, because the interesting question
 * is not whether the sword registers a hit -- it is whether a hit that lands
 * badly reads differently from one that lands well. A figure that rocks, twists
 * and eventually comes apart answers that; a block cannot.
 */
export class Dummy {
  readonly limbs: Limb[] = [];
  private readonly byBody = new Map<PhysicsBody, Limb>();
  private readonly base: { mesh: ReturnType<typeof MeshBuilder.CreateBox>; body: PhysicsBody };

  constructor(
    private readonly scene: Scene,
    origin: Vector3,
    materials: DummyMaterials,
  ) {
    const D = CONFIG.dummy;
    const health = D.partHealth;

    // A stump in the ground. Static, so the dummy has something to stand on
    // that does not itself wander off when struck.
    const baseMesh = MeshBuilder.CreateBox("dummy.base", { width: 0.5, height: 0.4, depth: 0.5 }, scene);
    baseMesh.position.copyFrom(origin).addInPlace(new Vector3(0, 0.2, 0));
    baseMesh.material = materials.wood;
    const baseAggregate = new PhysicsAggregate(
      baseMesh,
      PhysicsShapeType.BOX,
      { mass: 0, friction: 0.9, restitution: 0.05 },
      scene,
    );
    baseAggregate.shape.filterMembershipMask = LAYER.WORLD;
    baseAggregate.shape.filterCollideMask = COLLIDES.WORLD;
    baseAggregate.body.setMotionType(PhysicsMotionType.STATIC);
    this.base = { mesh: baseMesh, body: baseAggregate.body };

    const at = (x: number, y: number, z = 0) =>
      origin.add(new Vector3(x, y, z));

    const bone = (
      name: string,
      position: Vector3,
      height: number,
      radius: number,
      mass: number,
      material: Material,
    ): Part =>
      capsulePart(scene, {
        name: `dummy.${name}`,
        position,
        height,
        radius,
        mass,
        layer: LAYER.DUMMY,
        collidesWith: COLLIDES.DUMMY,
        material,
        friction: 0.8,
      });

    const pelvis = bone("pelvis", at(0, 0.98), 0.26, 0.16, 12, materials.hide);
    const torso = bone("torso", at(0, 1.34), 0.52, 0.19, 22, materials.hide);
    const head = bone("head", at(0, 1.70), 0.24, 0.105, 5, materials.straw);

    const armY = 1.46;
    const upperArmL = bone("upperArmL", at(-0.245, armY), 0.28, 0.055, 2.5, materials.hide);
    const upperArmR = bone("upperArmR", at(0.245, armY), 0.28, 0.055, 2.5, materials.hide);
    const forearmL = bone("forearmL", at(-0.245, armY - 0.27), 0.26, 0.048, 1.6, materials.hide);
    const forearmR = bone("forearmR", at(0.245, armY - 0.27), 0.26, 0.048, 1.6, materials.hide);

    const thighL = bone("thighL", at(-0.105, 0.62), 0.40, 0.085, 8, materials.hide);
    const thighR = bone("thighR", at(0.105, 0.62), 0.40, 0.085, 8, materials.hide);
    const shinL = bone("shinL", at(-0.105, 0.21), 0.40, 0.070, 4, materials.hide);
    const shinR = bone("shinR", at(0.105, 0.21), 0.40, 0.070, 4, materials.hide);

    // Root: the pelvis is pinned to the stump by a motorised joint. It sways,
    // and if the joint is ever cut the whole figure simply falls over.
    const rootPart: Part = {
      name: "dummy.base",
      mesh: baseMesh,
      body: this.base.body,
      shape: baseAggregate.shape,
    };
    const rootJoint = joint(this.scene, rootPart, pelvis, {
      pivotParent: new Vector3(0, 0.2, 0),
      pivotChild: new Vector3(0, -0.13, 0),
      swing: {
        x: { min: -0.9, max: 0.9 },
        y: { min: -0.8, max: 0.8 },
        z: { min: -0.9, max: 0.9 },
      },
    });
    stiffen(rootJoint, D.jointStiffness * 22);

    const link = (
      key: string,
      label: string,
      parent: Part,
      child: Part,
      pivotParent: Vector3,
      pivotChild: Vector3,
      swing: Parameters<typeof joint>[3]["swing"],
      strength: number,
    ): void => {
      const attachment = joint(this.scene, parent, child, { pivotParent, pivotChild, swing });
      stiffen(attachment, strength);
      this.register({
        key,
        label,
        part: child,
        attachment,
        health,
        maxHealth: health,
        severed: false,
        lastHitAt: -999,
      });
    };

    this.register({
      key: "pelvis",
      label: "Pelvis",
      part: pelvis,
      attachment: rootJoint,
      health: health * 1.8,
      maxHealth: health * 1.8,
      severed: false,
      lastHitAt: -999,
    });

    const s = D.jointStiffness;
    const spine = { x: { min: -0.6, max: 0.6 }, y: { min: -0.7, max: 0.7 }, z: { min: -0.6, max: 0.6 } };
    const socket = { x: { min: -1.9, max: 1.9 }, y: { min: -1.2, max: 1.2 }, z: { min: -1.6, max: 1.6 } };
    const hinge = { x: { min: -2.2, max: 0.15 } };

    link("torso", "Torso", pelvis, torso, new Vector3(0, 0.13, 0), new Vector3(0, -0.26, 0), spine, s * 16);
    link("head", "Head", torso, head, new Vector3(0, 0.26, 0), new Vector3(0, -0.12, 0), spine, s * 6);

    link("upperArmL", "Left arm", torso, upperArmL, new Vector3(-0.245, 0.12, 0), new Vector3(0, 0.14, 0), socket, s * 5);
    link("upperArmR", "Right arm", torso, upperArmR, new Vector3(0.245, 0.12, 0), new Vector3(0, 0.14, 0), socket, s * 5);
    link("forearmL", "Left forearm", upperArmL, forearmL, new Vector3(0, -0.14, 0), new Vector3(0, 0.13, 0), hinge, s * 3);
    link("forearmR", "Right forearm", upperArmR, forearmR, new Vector3(0, -0.14, 0), new Vector3(0, 0.13, 0), hinge, s * 3);

    link("thighL", "Left thigh", pelvis, thighL, new Vector3(-0.105, -0.13, 0), new Vector3(0, 0.20, 0), socket, s * 10);
    link("thighR", "Right thigh", pelvis, thighR, new Vector3(0.105, -0.13, 0), new Vector3(0, 0.20, 0), socket, s * 10);
    link("shinL", "Left shin", thighL, shinL, new Vector3(0, -0.20, 0), new Vector3(0, 0.20, 0), hinge, s * 6);
    link("shinR", "Right shin", thighR, shinR, new Vector3(0, -0.20, 0), new Vector3(0, 0.20, 0), hinge, s * 6);
  }

  private register(limb: Limb): void {
    this.limbs.push(limb);
    this.byBody.set(limb.part.body, limb);
  }

  limbFor(body: PhysicsBody): Limb | undefined {
    return this.byBody.get(body);
  }

  /** Cut a limb free and give it a parting shove along the cut. */
  sever(limb: Limb, direction: Vector3): void {
    if (limb.severed || !limb.attachment) return;
    limb.severed = true;
    limb.health = 0;
    limb.attachment.dispose();

    // Freed pieces stop being part of the figure and become debris, so they no
    // longer benefit from the self-collision exemptions of a jointed body.
    limb.part.shape.filterMembershipMask = LAYER.DEBRIS;
    limb.part.shape.filterCollideMask = COLLIDES.DEBRIS;

    const kick = direction.normalizeToNew().scaleInPlace(CONFIG.combat.severKick);
    limb.part.body.applyImpulse(kick, limb.part.body.getObjectCenterWorld());
  }

  dispose(): void {
    for (const limb of this.limbs) {
      limb.attachment?.dispose();
      limb.part.mesh.dispose();
    }
    this.limbs.length = 0;
    this.byBody.clear();
    this.base.mesh.dispose();
  }
}
