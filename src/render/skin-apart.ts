import { VertexBuffer } from "@babylonjs/core/Buffers/buffer.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import type { DrawnBody } from "./drawn-body.ts";

/** A mesh's vertex data as authored: each kind's numbers and how many a vertex has, and the triangles. */
interface Authored {
  readonly count: number;
  readonly indices: Uint32Array;
  readonly kinds: ReadonlyMap<string, { readonly values: Float32Array; readonly stride: number }>;
}

/** Each pair of vertex kinds that names a vertex's bones and their weights, four to a vertex. */
const INFLUENCES = [[VertexBuffer.MatricesIndicesKind, VertexBuffer.MatricesWeightsKind],
  [VertexBuffer.MatricesIndicesExtraKind, VertexBuffer.MatricesWeightsExtraKind]] as const;

/**
 * **A skinned mesh drawn apart where its body is cut** (`DrawnSegment.attached`). Each bone follows
 * one segment of `body` (`segmentOf`, by the bone's index; null, a bone no segment carries, which
 * stays with the body). While the body is whole the mesh is as authored. Once a part is off, the mesh
 * is in pieces: the body, and each part cut off, its segments from the cut outward. Each triangle
 * goes with the piece its vertices' weights carry most of, and a vertex two pieces share is drawn
 * twice, each copy weighted on its own piece's bones alone (on the piece's first bone where it had
 * none there), so the cut opens instead of stretching. A body made whole again by a load is drawn as
 * authored.
 *
 * Returns what reads the body's segments each frame, and redraws the mesh only when one of them has
 * come off or back. The mesh's geometry is made its own at the first cut: a container's clones share it.
 */
export function skinApart(mesh: Mesh, body: DrawnBody, segmentOf: readonly (string | null)[]): () => void {
  const segments = [...body.segments.values()], parentOf = new Map(body.spec.joints.map((joint) => [joint.child, joint.parent]));
  const shown = new Uint8Array(segments.length).fill(1);
  let authored: Authored | null = null;

  const author = (): Authored => {
    if (mesh.subMeshes.length !== 1 || mesh.morphTargetManager) throw new Error(`${mesh.name} cannot be drawn apart: it has ${mesh.subMeshes.length} submeshes${mesh.morphTargetManager ? " and morph targets" : ""}`);
    mesh.makeGeometryUnique();
    const count = mesh.getTotalVertices();
    const kinds = new Map(mesh.getVerticesDataKinds().map((kind) => {
      const values = Float32Array.from(mesh.getVerticesData(kind, true, true)!);
      return [kind, { values, stride: values.length / count }] as const;
    }));
    for (const [bones] of INFLUENCES) if (kinds.has(bones) && kinds.get(bones)!.stride !== 4) throw new Error(`${mesh.name}'s ${bones} are packed, not four to a vertex`);
    return { count, indices: Uint32Array.from(mesh.getIndices(true, true)!), kinds };
  };

  const draw = (count: number, indices: Uint32Array, kinds: ReadonlyMap<string, Float32Array>): void => {
    for (const [kind, values] of kinds) mesh.setVerticesData(kind, values, false);
    mesh.setIndices(indices, count);
  };

  /** `authored` in pieces, `off` the segments cut off. */
  const apart = ({ count, indices: triangles, kinds }: Authored, off: ReadonlySet<string>): void => {
    // The piece a segment is in: the body (0) while on, else the part cut off at the segment nearest the body.
    const pieces = new Map<string, number>([["", 0]]);
    const pieceOf = (name: string | null): number => {
      let at = name;
      if (at === null || !off.has(at)) return 0;
      for (let up = parentOf.get(at); up !== undefined && off.has(up); up = parentOf.get(at)) at = up;
      if (!pieces.has(at)) pieces.set(at, pieces.size);
      return pieces.get(at)!;
    };
    const bonePiece = segmentOf.map(pieceOf), P = pieces.size;
    const anchor = Array.from({ length: P }, (_, p) => bonePiece.indexOf(p));
    const influences = INFLUENCES.filter(([bones, weights]) => kinds.has(bones) && kinds.has(weights))
      .map(([bones, weights]) => [kinds.get(bones)!.values, kinds.get(weights)!.values] as const);
    // Each vertex's weight on each piece.
    const share = new Float64Array(count * P);
    for (const [bones, weights] of influences) for (let k = 0; k < bones.length; k++) share[(k >> 2) * P + bonePiece[bones[k]!]!]! += weights[k]!;
    // Each triangle to the piece carrying most of it, the body first among equals; a vertex is copied for each piece past its first.
    const claimed = new Int32Array(count).fill(-1), copies = new Map<number, number>(), source: number[] = [], copyPiece: number[] = [];
    const indices = new Uint32Array(triangles.length);
    for (let t = 0; t < triangles.length; t += 3) {
      let owner = 0, most = -1;
      for (let p = 0; p < P; p++) {
        const sum = share[triangles[t]! * P + p]! + share[triangles[t + 1]! * P + p]! + share[triangles[t + 2]! * P + p]!;
        if (sum > most) { most = sum; owner = p; }
      }
      for (let k = t; k < t + 3; k++) {
        const v = triangles[k]!;
        if (claimed[v] === -1) claimed[v] = owner;
        if (claimed[v] === owner) { indices[k] = v; continue; }
        let copy = copies.get(v * P + owner);
        if (copy === undefined) { copies.set(v * P + owner, copy = count + source.length); source.push(v); copyPiece.push(owner); }
        indices[k] = copy;
      }
    }
    const total = count + source.length, drawn = new Map<string, Float32Array>();
    for (const [kind, { values, stride }] of kinds) {
      const out = new Float32Array(stride * total);
      out.set(values);
      for (let c = 0; c < source.length; c++) out.copyWithin(stride * (count + c), stride * source[c]!, stride * (source[c]! + 1));
      drawn.set(kind, out);
    }
    // Each vertex weighted on its piece's bones alone.
    const kept = INFLUENCES.filter(([bones, weights]) => drawn.has(bones) && drawn.has(weights)).map(([bones, weights]) => [drawn.get(bones)!, drawn.get(weights)!] as const);
    for (let v = 0; v < total; v++) {
      const piece = v < count ? claimed[v]! : copyPiece[v - count]!;
      if (piece < 0) continue;
      let left = 0, dropped = 0;
      for (const [bones, weights] of kept) for (let k = 4 * v; k < 4 * v + 4; k++) {
        if (bonePiece[bones[k]!] === piece) left += weights[k]!;
        else { dropped += weights[k]!; weights[k] = 0; }
      }
      if (dropped === 0) continue;
      if (left > 0) { for (const [, weights] of kept) for (let k = 4 * v; k < 4 * v + 4; k++) weights[k]! /= left; continue; }
      if (anchor[piece]! < 0) continue;
      const [bones, weights] = kept[0]!;
      bones[4 * v] = anchor[piece]!; weights[4 * v] = 1;
    }
    draw(total, indices, drawn);
  };

  return () => {
    let moved = false;
    for (let i = 0; i < segments.length; i++) {
      const now = segments[i]!.attached ? 1 : 0;
      if (now !== shown[i]) { shown[i] = now; moved = true; }
    }
    if (!moved) return;
    const off = new Set(segments.filter((segment) => !segment.attached).map((segment) => segment.spec.name));
    if (off.size > 0) apart(authored ??= author(), off);
    else if (authored) draw(authored.count, authored.indices, new Map([...authored.kinds].map(([kind, { values }]) => [kind, values])));
  };
}
