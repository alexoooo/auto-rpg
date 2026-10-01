import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";

/**
 * The posed vertices of `mesh` in the world, skinned and morphed as they are drawn. With `sampleFaces`, each
 * triangle's middle and the middles of its three edges follow them.
 */
export function surface(mesh, sampleFaces = false) {
  const data = mesh.getPositionData(true, true), world = mesh.computeWorldMatrix(true);
  const points = [];
  for (let i = 0; i < data.length; i += 3) points.push(Vector3.TransformCoordinates(Vector3.FromArray(data, i), world));
  if (sampleFaces) {
    const indices = mesh.getIndices(), vertices = points.slice();
    for (let i = 0; i < indices.length; i += 3) {
      const [a, b, c] = Array.from(indices.slice(i, i + 3), (j) => vertices[j]);
      points.push(a.add(b).add(c).scale(1 / 3), a.add(b).scale(.5), b.add(c).scale(.5), c.add(a).scale(.5));
    }
  }
  return points;
}
