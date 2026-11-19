import { MeshoptCompression } from "@babylonjs/core/Meshes/Compression/meshoptCompression.js";
import { readGlb as authoredGlb, type Glb } from "../../../core/bodies/art/glb.ts";

/** Browser decompression supplied to the neutral authored-geometry reader. */
export function readGlb<Json>(buffer: ArrayBuffer, what: string): Promise<Glb<Json>> {
  return authoredGlb<Json>(buffer, what, (...args) => MeshoptCompression.Default.decodeGltfBufferAsync(...args));
}
