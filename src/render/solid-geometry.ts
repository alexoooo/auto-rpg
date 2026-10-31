import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { convexHull } from "../core/spec/hull.ts";
import type { SolidSense } from "../core/mind/object-senses.ts";
import type { Scene } from "@babylonjs/core/scene.js";

/** Untextured physical geometry, batched into one draw; visibility changes rewrite only indices. */
export function solidGeometry(scene: Scene, solids: readonly SolidSense[]) {
  const positions: number[] = [], normals: number[] = [], indices: number[] = [], spans: number[][] = [];
  for (const solid of solids) {
    let mesh: Mesh;
    switch (solid.kind) {
      case "box":
        mesh = MeshBuilder.CreateBox("solid.source", { width: solid.size[0], height: solid.size[1], depth: solid.size[2] }, scene);
        mesh.position.set(...solid.centre); mesh.rotation.y = solid.turn ?? 0;
        break;
      case "hull": {
        const hull = convexHull(solid.points), p: number[] = [], n: number[] = [], ii: number[] = [];
        for (let f = 0; f < hull.faces.length; f++) for (const k of hull.faces[f]!) {
          ii.push(ii.length); p.push(...solid.points[k]!); n.push(...hull.planes[f]!.normal);
        }
        mesh = new Mesh("solid.source", scene); const data = new VertexData();
        data.positions = p; data.normals = n; data.indices = ii; data.applyToMesh(mesh);
        mesh.position.set(...solid.centre); break;
      }
      default: { const never: never = solid; throw new Error(`unknown solid ${never}`); }
    }
    mesh.bakeCurrentTransformIntoVertices();
    const offset = positions.length / 3, own = Array.from(mesh.getIndices()!, i => i + offset);
    positions.push(...mesh.getVerticesData("position")!); normals.push(...mesh.getVerticesData("normal")!);
    indices.push(...own); spans.push(own); mesh.dispose();
  }
  const mesh = new Mesh("tactical.solids", scene), material = new StandardMaterial("tactical.solids", scene), data = new VertexData();
  material.diffuseColor = new Color3(.35, .39, .41); material.specularColor = Color3.Black(); material.backFaceCulling = false;
  mesh.material = material; mesh.isPickable = false;
  data.positions = positions; data.normals = normals; data.indices = indices; data.applyToMesh(mesh, true);
  const shown = solids.map(() => true);
  return {
    mesh,
    setEnabled(on: boolean) { mesh.setEnabled(on); },
    show(predicate: (solid: SolidSense, index: number) => boolean) {
      let changed = false;
      for (let i = 0; i < solids.length; i++) { const on = predicate(solids[i]!, i); if (on !== shown[i]) { shown[i] = on; changed = true; } }
      if (changed) mesh.setIndices(spans.flatMap((span, i) => shown[i] ? span : []));
    },
    dispose() { mesh.dispose(false, false); material.dispose(); },
  };
}
