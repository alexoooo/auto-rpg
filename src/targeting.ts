import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import type { Scene } from "@babylonjs/core/scene.js";

// Side effects, both load-bearing. `renderOutline` is a module augmentation
// rather than a built-in property, and the mesh silently draws no outline at all
// if it never registers. `Ray` is worse: `scene.pick` and `createPickingRay` throw
// "Ray needs to be imported before as it contains a side-effect required by your
// code" -- once per frame, from inside the render loop, where it is easy to miss.
import "@babylonjs/core/Rendering/outlineRenderer.js";
import "@babylonjs/core/Culling/ray.js";

import { CONFIG } from "./config";
import { isGroundPoint, type GroundPoint, type Orders } from "./orders";
import type { Combatant } from "./units";

/**
 * Pointing at things, and showing the orders a person has given.
 *
 * Three jobs that share one ray. **Feedback**: sweep the cursor over the enemy and the part under it
 * lights up, so a click is never a guess about what it will order. **Picking**: which body, or which
 * point of the ground, a click at a canvas point landed on -- the page turns that into an order
 * (`src/orders.ts`). **Showing**: a ring under the enemy you ordered attacked, a marker on the ground
 * you ordered held, and a hot marker on the point of an attack-move, so an order you cannot see
 * yourself giving is never a mystery about why the body went there.
 *
 * It decides nothing about what an order means. It answers "what did that click land on" and draws
 * what it is told; the rules are in `orders.ts`.
 *
 * What it picks against is the enemy's own costume, asked for by identity (`owns`) rather than
 * matched by a name prefix: a prefix would also match the enemy's blade, which is not a target, and
 * the physics capsules are invisible, so an outline on one draws nothing at all.
 */
export class OrderDisplay {
  private readonly scene: Scene;
  private readonly targetRing: Mesh;
  private readonly targetPip: Mesh;
  private readonly destinationRing: Mesh;
  private readonly attackMoveRing: Mesh;

  /** The body a person commands, or null when two policies are fighting. */
  private commanded: Combatant | null = null;
  private enemy: Combatant | null = null;
  private hovered: AbstractMesh | null = null;
  private outlined: AbstractMesh | null = null;
  private pulse = 0;

  constructor(scene: Scene) {
    this.scene = scene;

    const unlit = (name: string, colour: Color3): StandardMaterial => {
      const material = new StandardMaterial(name, scene);
      material.emissiveColor = colour;
      material.diffuseColor = Color3.Black();
      material.specularColor = Color3.Black();
      material.disableLighting = true;
      return material;
    };

    const T = CONFIG.targeting;
    const hot = unlit("orders.attack", new Color3(0.94, 0.32, 0.24));
    const cool = unlit("orders.move", new Color3(0.42, 0.78, 0.98));
    const ring = (name: string, scale: number, thickness: number): Mesh => MeshBuilder.CreateTorus(
      name, { diameter: T.ringRadius * 2 * scale, thickness, tessellation: 44 }, scene);

    this.targetRing = ring("orders.targetRing", 1.16, 0.026);
    this.targetRing.material = hot;
    // A cone pointing down at the ordered enemy, because a ring on the ground disappears the moment
    // anything stands between you and it.
    this.targetPip = MeshBuilder.CreateCylinder(
      "orders.targetPip",
      { height: 0.17, diameterTop: 0.15, diameterBottom: 0, tessellation: 4 },
      scene,
    );
    this.targetPip.material = hot;
    this.destinationRing = ring("orders.destinationRing", 0.5, 0.03);
    this.destinationRing.material = cool;
    this.attackMoveRing = ring("orders.attackMoveRing", 0.5, 0.03);
    this.attackMoveRing.material = hot;

    for (const mesh of [this.targetRing, this.targetPip, this.destinationRing, this.attackMoveRing]) {
      mesh.isPickable = false;
      mesh.isVisible = false;
      mesh.receiveShadows = false;
    }
  }

  /** Point the display at a pair. A reset rebuilds both bodies, so both are given every time. */
  attach(commanded: Combatant | null, enemy: Combatant | null): void {
    this.commanded = commanded;
    this.enemy = enemy;
    this.clearOutline();
    this.hovered = null;
  }

  /** True when a click at this canvas point (CSS pixels) lands on the enemy's body. */
  enemyAt(x: number, y: number): boolean {
    const enemy = this.enemy;
    if (!enemy) return false;
    const hit = this.scene.pick(x, y, (mesh) => mesh.isPickable && mesh.isVisible && enemy.owns(mesh));
    return Boolean(hit?.hit && hit.pickedMesh);
  }

  /**
   * The point of the floor under this canvas point (CSS pixels), or null for a ray that never
   * comes down -- a click on the sky. The floor is the plane y = 0, which is what every order's
   * ground point is measured on, so no floor mesh has to be pickable for this to answer.
   */
  groundAt(x: number, y: number): GroundPoint | null {
    const camera = this.scene.activeCamera;
    if (!camera) return null;
    const ray = this.scene.createPickingRay(x, y, null, camera);
    if (!(ray.direction.y < -1e-6)) return null;
    const t = -ray.origin.y / ray.direction.y;
    if (!(t > 0) || !Number.isFinite(t)) return null;
    return { x: ray.origin.x + ray.direction.x * t, z: ray.origin.z + ray.direction.z * t };
  }

  /** Once per rendered frame, with the orders the commanded body is under (or null). */
  update(dt: number, orders: Orders | null): void {
    this.pulse += dt;

    // The hover outline, only while somebody is commanding: with two policies fighting a click
    // orders nothing, and an outline would promise that it did.
    this.hovered = null;
    const enemy = this.commanded ? this.enemy : null;
    if (enemy) {
      const hit = this.scene.pick(
        this.scene.pointerX,
        this.scene.pointerY,
        (mesh) => mesh.isPickable && mesh.isVisible && enemy.owns(mesh),
      );
      if (hit?.hit && hit.pickedMesh) this.hovered = hit.pickedMesh;
    }
    if (this.outlined !== this.hovered) {
      this.clearOutline();
      if (this.hovered) {
        this.hovered.renderOutline = true;
        this.hovered.outlineColor = new Color3(0.96, 0.42, 0.28);
        this.hovered.outlineWidth = CONFIG.targeting.outlineWidth;
        this.outlined = this.hovered;
      }
    }

    const target = orders?.target ?? null;
    const centre = typeof target === "string" && this.enemy ? this.enemy.centre() : null;
    this.targetRing.isVisible = centre !== null;
    this.targetPip.isVisible = centre !== null;
    if (centre) {
      this.targetRing.position.set(centre.x, 0.025, centre.z);
      this.targetRing.rotation.y = this.pulse * 0.7;
      this.targetPip.position.set(centre.x, centre.y + 0.72 + Math.sin(this.pulse * 3) * 0.03, centre.z);
    }

    const breathe = 1 + Math.sin(this.pulse * 5) * 0.06;
    const destination = orders?.destination ?? null;
    this.destinationRing.isVisible = destination !== null;
    if (destination) {
      this.destinationRing.position.set(destination.x, 0.03, destination.z);
      this.destinationRing.scaling.set(breathe, 1, breathe);
    }
    const point = isGroundPoint(target) ? target : null;
    this.attackMoveRing.isVisible = point !== null;
    if (point) {
      this.attackMoveRing.position.set(point.x, 0.03, point.z);
      this.attackMoveRing.scaling.set(breathe, 1, breathe);
    }
  }

  private clearOutline(): void {
    if (this.outlined) this.outlined.renderOutline = false;
    this.outlined = null;
  }

  dispose(): void {
    this.clearOutline();
    this.targetRing.dispose();
    this.targetPip.dispose();
    this.destinationRing.dispose();
    this.attackMoveRing.dispose();
  }
}
