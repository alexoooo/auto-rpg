import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import type { Material } from "@babylonjs/core/Materials/material.js";
import type { Scene } from "@babylonjs/core/scene.js";

import { CONFIG } from "./config";
import type { Hero } from "./hero";

export interface FigureMaterials {
  steel: Material;
  leather: Material;
  cloth: Material;
  flesh: Material;
}

const clamp = (value: number, min: number, max: number) =>
  value < min ? min : value > max ? max : value;

/**
 * What the hero looks like.
 *
 * Deliberately cosmetic and deliberately separate. The physics rig is a capsule
 * for the body and three constrained bones for the sword arm, and it should stay
 * that way -- simulating a torso that only ever gets steered, or legs that only
 * ever walk on flat ground, buys nothing and costs solver time and stability.
 * So the collision capsule is hidden and this hangs a segmented figure off it:
 * mail, plate, a head, a free arm, and legs that actually stride.
 *
 * The right arm is missing here on purpose. That one is real, and it is the
 * whole point of the prototype.
 *
 * Everything is parented to the torso's mesh, so nothing here needs to know
 * where the hero is or which way it is facing -- it inherits both. The one
 * offset that matters is the root's, which drops the figure's origin from the
 * capsule's centre down to the ground, so every measurement below is a height
 * above the floor and can be read against a tape measure.
 */
export class Figure {
  private readonly root: TransformNode;
  private readonly hipLeft: TransformNode;
  private readonly hipRight: TransformNode;
  private readonly kneeLeft: TransformNode;
  private readonly kneeRight: TransformNode;
  private readonly armLeft: TransformNode;
  private readonly elbowLeft: TransformNode;

  private readonly baseHeight: number;
  private phase = 0;

  constructor(scene: Scene, hero: Hero, materials: FigureMaterials) {
    // Drop the figure's origin from the capsule's centre to the ground, so every
    // measurement below is a height above the floor and can be read against a
    // tape measure rather than against an arbitrary datum.
    this.baseHeight = -hero.torsoCentre;

    this.root = new TransformNode("figure", scene);
    this.root.parent = hero.torso.mesh;
    this.root.position.y = this.baseHeight;

    const dress = (mesh: Mesh, material: Material, parent: TransformNode): Mesh => {
      mesh.material = material;
      mesh.parent = parent;
      mesh.receiveShadows = true;
      // Picking is for choosing a target, and the hero is never the target.
      mesh.isPickable = false;
      return mesh;
    };

    const box = (
      name: string,
      size: [number, number, number],
      at: [number, number, number],
      material: Material,
      parent: TransformNode = this.root,
    ): Mesh => {
      const mesh = MeshBuilder.CreateBox(
        `figure.${name}`,
        { width: size[0], height: size[1], depth: size[2] },
        scene,
      );
      mesh.position.set(at[0], at[1], at[2]);
      return dress(mesh, material, parent);
    };

    const capsule = (
      name: string,
      height: number,
      radius: number,
      at: [number, number, number],
      material: Material,
      parent: TransformNode = this.root,
    ): Mesh => {
      const mesh = MeshBuilder.CreateCapsule(
        `figure.${name}`,
        { height, radius, tessellation: 12, subdivisions: 1 },
        scene,
      );
      mesh.position.set(at[0], at[1], at[2]);
      return dress(mesh, material, parent);
    };

    const ball = (
      name: string,
      diameter: number,
      at: [number, number, number],
      scale: [number, number, number],
      material: Material,
      parent: TransformNode = this.root,
    ): Mesh => {
      const mesh = MeshBuilder.CreateSphere(`figure.${name}`, { diameter, segments: 12 }, scene);
      mesh.position.set(at[0], at[1], at[2]);
      mesh.scaling.set(scale[0], scale[1], scale[2]);
      return dress(mesh, material, parent);
    };

    const pivot = (name: string, at: [number, number, number], parent: TransformNode): TransformNode => {
      const node = new TransformNode(`figure.${name}`, scene);
      node.position.set(at[0], at[1], at[2]);
      node.parent = parent;
      return node;
    };

    // ---- body ----
    box("pelvis", [0.28, 0.16, 0.22], [0, 0.94, 0], materials.leather);
    box("skirt", [0.33, 0.21, 0.27], [0, 1.03, 0], materials.cloth);
    box("belly", [0.30, 0.18, 0.23], [0, 1.16, 0], materials.leather);
    box("chest", [0.37, 0.34, 0.25], [0, 1.34, 0], materials.steel);
    box("collar", [0.40, 0.07, 0.26], [0, 1.49, 0], materials.steel);

    const neck = MeshBuilder.CreateCylinder(
      "figure.neck",
      { height: 0.10, diameter: 0.11, tessellation: 12 },
      scene,
    );
    neck.position.set(0, 1.53, 0);
    dress(neck, materials.flesh, this.root);

    ball("head", 0.205, [0, 1.635, 0], [1, 1, 1], materials.flesh);
    // A skullcap rather than a full helm: a face reads as a person, and a
    // featureless steel egg does not.
    ball("helm", 0.235, [0, 1.655, -0.004], [1, 0.92, 1.04], materials.steel);
    box("nasal", [0.028, 0.13, 0.03], [0, 1.618, 0.108], materials.steel);

    ball("pauldronL", 0.20, [-0.215, 1.44, 0.01], [1, 0.72, 1], materials.steel);
    ball("pauldronR", 0.20, [0.215, 1.44, 0.01], [1, 0.72, 1], materials.steel);

    // ---- free arm ----
    this.armLeft = pivot("armL", [-0.215, 1.42, 0.02], this.root);
    capsule("upperArmL", 0.30, 0.055, [0, -0.15, 0], materials.cloth, this.armLeft);
    this.elbowLeft = pivot("elbowL", [0, -0.30, 0], this.armLeft);
    capsule("forearmL", 0.27, 0.048, [0, -0.135, 0], materials.leather, this.elbowLeft);
    capsule("handL", 0.12, 0.046, [0, -0.32, 0], materials.flesh, this.elbowLeft);

    // ---- legs ----
    const leg = (side: "L" | "R", x: number): [TransformNode, TransformNode] => {
      const hip = pivot(`hip${side}`, [x, 0.90, 0], this.root);
      capsule(`thigh${side}`, 0.44, 0.085, [0, -0.22, 0], materials.cloth, hip);
      const knee = pivot(`knee${side}`, [0, -0.44, 0], hip);
      capsule(`shin${side}`, 0.42, 0.068, [0, -0.21, 0], materials.leather, knee);
      // -0.4225 puts the sole exactly on the floor: 0.90 hip - 0.44 thigh - 0.4225 - half
      // the 0.075 boot. Twenty millimetres out and the figure reads as hovering.
      box(`foot${side}`, [0.11, 0.075, 0.26], [0, -0.4225, 0.055], materials.leather, knee);
      return [hip, knee];
    };

    [this.hipLeft, this.kneeLeft] = leg("L", -0.105);
    [this.hipRight, this.kneeRight] = leg("R", 0.105);
  }

  /**
   * Walk.
   *
   * Cadence is proportional to speed rather than fixed, so the feet keep pace
   * with the ground instead of scuffing along it, and the swing amplitude fades
   * with speed so that standing still straightens the legs on its own -- no
   * separate idle pose, and no blend between the two to get wrong.
   */
  update(dt: number, speed: number): void {
    const H = CONFIG.hero;
    const amount = clamp(speed / H.walkSpeed, 0, 1);
    this.phase += speed * H.strideCadence * dt;

    const swing = H.strideSwing * amount;
    const step = Math.sin(this.phase);
    const opposite = Math.sin(this.phase + Math.PI);

    this.hipLeft.rotation.x = step * swing;
    this.hipRight.rotation.x = opposite * swing;

    // A knee only bends one way, and only while the leg is swinging through.
    this.kneeLeft.rotation.x = Math.max(0, -Math.sin(this.phase + 0.7)) * swing * 1.5;
    this.kneeRight.rotation.x = Math.max(0, -Math.sin(this.phase + 0.7 + Math.PI)) * swing * 1.5;

    // The free arm counterswings; the sword arm is busy.
    this.armLeft.rotation.x = opposite * swing * 0.55;
    this.elbowLeft.rotation.x = Math.max(0, opposite) * swing * 0.5;

    this.root.position.y = this.baseHeight + Math.abs(step) * 0.016 * amount;
  }

  dispose(): void {
    this.root.dispose(false, true);
  }
}
