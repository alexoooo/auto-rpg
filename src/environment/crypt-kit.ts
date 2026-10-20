import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { Quaternion } from "@babylonjs/core/Maths/math.vector.js";
import type { AssetContainer } from "@babylonjs/core/assetContainer.js";
import { cos, sin } from "../core/math/real.ts";
import type { KitPlacement } from "./furniture.ts";

/**
 * Bake placements once, optionally batching by material. A kit mesh is named `<piece>__<material>`;
 * each placement clones the piece's geometry in game metres. Individual pieces retain their
 * collider identity; merged decorative geometry retains only its material identity.
 */
export function assembleCryptKit(container: AssetContainer, placements: readonly KitPlacement[], merge = true): Mesh[] {
  const root = container.meshes.find(mesh => mesh.name === "__root__");
  if (root) {
    root.rotationQuaternion = Quaternion.Identity();
    root.scaling.setAll(1);
    root.computeWorldMatrix(true);
  }
  const sources = container.meshes.filter((mesh): mesh is Mesh => mesh instanceof Mesh && mesh.getTotalVertices() > 0);
  const byMaterial = new Map<string, Mesh[]>(), placedMeshes: Mesh[] = [];
  for (const [index, placement] of placements.entries()) {
    const pieces = sources.filter(mesh => mesh.name.startsWith(placement.piece + "__"));
    if (!pieces.length) throw new Error(`Missing crypt kit piece: ${placement.piece}`);
    for (const source of pieces) {
      const placed = source.clone(`kit.${index}.${source.name}`, null, true)!;
      placed.parent = null;
      placed.setEnabled(true);
      placed.position.set(placement.x, 0, placement.z);
      placed.rotationQuaternion = new Quaternion(0, sin(placement.turn / 2), 0, cos(placement.turn / 2));
      placed.scaling.setAll(1);
      placed.computeWorldMatrix(true);
      placed.metadata = { ...placed.metadata, kitPlacement: placement };
      placedMeshes.push(placed);
      const material = source.name.split("__")[1]!;
      let group = byMaterial.get(material);
      if (!group) { group = []; byMaterial.set(material, group); }
      group.push(placed);
    }
  }
  for (const source of sources) source.setEnabled(false);
  if (!merge) return placedMeshes;
  const mergedMeshes: Mesh[] = [];
  for (const [material, meshes] of byMaterial) {
    const merged = Mesh.MergeMeshes(meshes, true, true, undefined, false, false);
    if (!merged) throw new Error(`Cannot assemble crypt ${material}`);
    merged.name = "reference." + material;
    container.meshes.push(merged);
    mergedMeshes.push(merged);
  }
  return mergedMeshes;
}
