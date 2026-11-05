import { MeshoptCompression } from "@babylonjs/core/Meshes/Compression/meshoptCompression.js";
import { readGlb as authoredGlb, type DecodeMeshopt, type Glb } from "../../../core/bodies/art/glb.ts";

/** Browser decompression supplied to the neutral authored-geometry reader. */
export function readGlb<Json>(buffer: ArrayBuffer, what: string, decode: DecodeMeshopt = (...args) => MeshoptCompression.Default.decodeGltfBufferAsync(...args)): Promise<Glb<Json>> {
  return authoredGlb<Json>(buffer, what, decode);
}
