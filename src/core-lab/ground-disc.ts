import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import type { Scene } from "@babylonjs/core/scene.js";

/** A flat disc on the ground at height `y`, for a mark drawn over the floor; it collides with nothing. */
export function groundDisc(scene: Scene, name: string, radius: number, colour: Color3, alpha: number, y: number): Mesh {
  const disc = MeshBuilder.CreateDisc(name, { radius, tessellation: 32 }, scene);
  disc.rotation.x = Math.PI / 2;
  disc.position.y = y;
  const material = new StandardMaterial(name, scene);
  material.diffuseColor = colour;
  material.emissiveColor = colour.scale(0.5);
  material.specularColor = Color3.Black();
  material.alpha = alpha;
  disc.material = material;
  return disc;
}
