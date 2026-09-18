import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import type { LinesMesh } from "@babylonjs/core/Meshes/linesMesh.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Scene } from "@babylonjs/core/scene.js";

/**
 * Where you are pointing.
 *
 * Absolute cursor control only works if the mapping is legible, and a sword
 * moving in three dimensions under a cursor moving in two is not legible on its
 * own -- depth is exactly the part a player cannot read. So the aim point is
 * staked out on the ground and then lifted: a dotted line runs along the floor
 * from the fighter's feet, turns a right angle, and rises to a bright dot at the
 * point itself. The floor segment carries the distance and bearing, the riser
 * carries the height, and neither has to be inferred from perspective.
 */
export class AimIndicator {
  private floor: LinesMesh;
  private riser: LinesMesh;
  private readonly dot: Mesh;
  private readonly pad: Mesh;

  private readonly scene: Scene;
  // Babylon refuses a dashed-line vertex buffer when both constructor points
  // coincide. Seed two sub-visible segments; the first `update` overwrites
  // every coordinate before the indicator is meaningful, but construction no
  // longer emits two empty-position warnings in an otherwise clean console.
  private readonly floorPoints = [new Vector3(), new Vector3(0, 0, 0.001)];
  private readonly riserPoints = [new Vector3(), new Vector3(0, 0.001, 0)];

  constructor(scene: Scene) {
    this.scene = scene;

    const glow = new StandardMaterial("aim.glow", scene);
    glow.emissiveColor = new Color3(0.98, 0.72, 0.32);
    glow.diffuseColor = Color3.Black();
    glow.specularColor = Color3.Black();
    glow.disableLighting = true;

    this.dot = MeshBuilder.CreateSphere("aim.dot", { diameter: 0.075, segments: 10 }, scene);
    this.dot.material = glow;
    this.dot.isPickable = false;

    // A flat ring on the ground under the point, so the stake reads as touching
    // the floor rather than floating somewhere near it.
    this.pad = MeshBuilder.CreateTorus(
      "aim.pad",
      { diameter: 0.30, thickness: 0.014, tessellation: 24 },
      scene,
    );
    this.pad.material = glow;
    this.pad.isPickable = false;

    this.floor = this.makeLine("aim.floor", this.floorPoints, 26);
    this.riser = this.makeLine("aim.riser", this.riserPoints, 14);
  }

  private makeLine(name: string, points: Vector3[], dashes: number): LinesMesh {
    const line = MeshBuilder.CreateDashedLines(
      name,
      { points, dashNb: dashes, dashSize: 3, gapSize: 3, updatable: true },
      this.scene,
    );
    line.color = new Color3(0.86, 0.66, 0.34);
    line.alpha = 0.5;
    line.isPickable = false;
    return line;
  }

  /**
   * @param feet   the fighter's position on the ground
   * @param target the point being aimed at
   */
  update(feet: Vector3, target: Vector3): void {
    const groundY = 0.02;

    this.floorPoints[0].set(feet.x, groundY, feet.z);
    this.floorPoints[1].set(target.x, groundY, target.z);
    this.riserPoints[0].set(target.x, groundY, target.z);
    this.riserPoints[1].copyFrom(target);

    this.floor = MeshBuilder.CreateDashedLines(
      "aim.floor",
      { points: this.floorPoints, instance: this.floor },
      this.scene,
    );
    this.riser = MeshBuilder.CreateDashedLines(
      "aim.riser",
      { points: this.riserPoints, instance: this.riser },
      this.scene,
    );

    this.dot.position.copyFrom(target);
    this.pad.position.set(target.x, groundY, target.z);
  }

  dispose(): void {
    this.floor.dispose();
    this.riser.dispose();
    this.dot.dispose();
    this.pad.dispose();
  }
}
