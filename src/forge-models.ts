import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import type { ProofManifest } from "./art-proof/assets.ts";
import type { GolemAppearance } from "./golem/appearance.ts";
import type { GolemMaterialPalette } from "./golem/materials.ts";
import type { Material } from "@babylonjs/core/Materials/material.js";

/** Fit a cosmetic copy, never bake into a mesh owned by Havok. Shared templates stay immutable. */
export function fitForgeMesh(template: Mesh, source: AbstractMesh, host: AbstractMesh): Mesh {
  const mesh = template.clone(`${source.name}.forge`, null, true)!;
  const target = source.getBoundingInfo().boundingBox;
  const authored = template.getBoundingInfo().boundingBox;
  const scale = target.extendSize.divide(authored.extendSize);
  mesh.makeGeometryUnique();
  mesh.setIndices(Array.from(mesh.getIndices()!));
  const offset = target.center.subtract(authored.center.multiply(scale));
  mesh.bakeTransformIntoVertices(Matrix.Compose(scale, Quaternion.Identity(), offset));
  mesh.parent = source === host ? host : source.parent;
  mesh.position.copyFrom(source === host ? Vector3.Zero() : source.position);
  mesh.rotationQuaternion = source === host ? Quaternion.Identity() :
    (source.rotationQuaternion?.clone() ?? Quaternion.FromEulerVector(source.rotation));
  if (source !== host) mesh.scaling.copyFrom(source.scaling);
  mesh.metadata = { ...source.metadata, forgeOriginal: source.name };
  mesh.material = source.material;
  mesh.isPickable = source.isPickable;
  mesh.hasVertexAlpha = false;
  mesh.receiveShadows = true;
  mesh.isVisible = true;
  mesh.setEnabled(true);
  source.isVisible = false;
  return mesh;
}

export function forgeAppearance(templates: Map<string, Mesh>, manifest: ProofManifest,
  configure: (palette: GolemMaterialPalette) => void, steel?: Material): GolemAppearance {
  for (const row of manifest.parts) {
    if (!templates.has(row.asset)) throw new Error(`Missing forge model ${row.asset} (${row.key})`);
  }
  const rows = new Map(manifest.parts.map(row => [row.key, row]));
  const stone = templates.get(manifest.parts.find(row => row.family === "carvedStone")!.asset)!;
  const blade = templates.get(manifest.parts.find(row => row.family === "steel")!.asset)!;
  const rune = templates.get(manifest.parts.find(row => row.family === "rune")!.asset)!;
  const bearing = templates.get(manifest.parts.find(row => row.family === "functionalMetal" &&
    Math.abs(row.extents[0] - row.extents[2]) < .00001)!.asset)!;
  return (part, palette) => {
    configure(palette);
    return [...new Set([part.host, ...part.shells])].filter(source => source.isVisible).map((source, index) => {
      const id = part.id.replace(/^(left|right)\./, "");
      const row = rows.get(`${part.slot}:${part.moduleId}:${id}:${index}`);
      const family = source.material?.metadata?.golemSurfaceFamily;
      // New configurations keep their silhouette: boxes get carved edges, cylinders turned
      // bearings; spheres, wheels, lashes and other specialised shapes retain their geometry.
      const isBlade = source === part.host && part.moduleId.endsWith(".blade");
      const template = row ? templates.get(row.asset) : isBlade ? blade
        : source.getTotalVertices() === 24 && family === "carvedStone" ? stone
        : source.getTotalVertices() === 24 && family === "rune" ? rune
        : source.getTotalVertices() === 70 && family === "functionalMetal" ? bearing : undefined;
      const mesh = template ? fitForgeMesh(template, source, part.host) : source;
      mesh.receiveShadows = true;
      if (steel && isBlade) mesh.material = steel;
      return mesh;
    });
  };
}
