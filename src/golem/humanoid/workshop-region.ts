import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";

/** Keep every vertex attribute aligned when extracting a severable surface region. */
export function compactWorkshopRegion(mesh: Mesh, faces: readonly number[]): void {
  const vertices = [...new Set(faces)];
  const remap = new Map(vertices.map((vertex, index) => [vertex, index]));
  // Setting positions changes Geometry._totalVertices. Babylon uses that count to
  // read *all* buffers (notably glTF's interleaved/normalized skin weights), so
  // finish reading and packing every attribute before replacing even one buffer.
  const buffers = mesh.getVerticesDataKinds().map(kind => {
    const data = mesh.getVerticesData(kind)!;
    const stride = mesh.getVertexBuffer(kind)!.getSize();
    const packed = new Float32Array(vertices.length * stride);
    vertices.forEach((vertex, index) => {
      for (let i = 0; i < stride; i++) packed[index * stride + i] = data[vertex * stride + i];
    });
    return { kind, stride, packed };
  });
  for (const { kind, stride, packed } of buffers) mesh.setVerticesData(kind, packed, true, stride);
  mesh.setIndices(faces.map(index => remap.get(index)!));
}
