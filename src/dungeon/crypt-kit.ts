import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { Quaternion } from "@babylonjs/core/Maths/math.vector.js";
import type { AssetContainer } from "@babylonjs/core/assetContainer.js";
import type { CryptRoomPlan } from "./crypt-plan.ts";

/**
 * Bake placements once and batch by material; no kit node becomes a physics body. A kit mesh is named
 * `<piece>__<material>`: each placement clones its piece's meshes where it stands, and the clones of one material
 * are merged into `reference.<material>`, in the order the plan first uses each material.
 */
export function assembleCryptKit(container: AssetContainer, plan: CryptRoomPlan): void {
  const root = container.meshes.find(mesh => mesh.name === "__root__");
  if (root) {
    root.rotationQuaternion = Quaternion.Identity();
    root.scaling.setAll(1);
    root.computeWorldMatrix(true);
  }
  const sources = container.meshes.filter((mesh): mesh is Mesh => mesh instanceof Mesh && mesh.getTotalVertices() > 0);
  const byMaterial = new Map<string, Mesh[]>();
  for (const placement of plan.placements) {
    const pieces = sources.filter(mesh => mesh.name.startsWith(placement.piece + "__"));
    if (!pieces.length) throw new Error(`Missing crypt kit piece: ${placement.piece}`);
    for (const source of pieces) {
      const placed = source.clone("placed." + source.name, null, true)!;
      placed.parent = null;
      placed.position.set(placement.x, 0, placement.z);
      placed.rotationQuaternion = Quaternion.RotationYawPitchRoll(placement.turn, 0, 0);
      placed.scaling.setAll(1);
      placed.computeWorldMatrix(true);
      const material = source.name.split("__")[1];
      let group = byMaterial.get(material);
      if (!group) {
        group = [];
        byMaterial.set(material, group);
      }
      group.push(placed);
    }
  }
  for (const source of sources) source.setEnabled(false);
  for (const [material, meshes] of byMaterial) {
    const merged = Mesh.MergeMeshes(meshes, true, true, undefined, false, false);
    if (!merged) throw new Error(`Cannot assemble crypt ${material}`);
    merged.name = "reference." + material;
    container.meshes.push(merged);
  }
}
