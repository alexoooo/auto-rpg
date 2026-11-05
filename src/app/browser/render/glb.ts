import { MeshoptCompression } from "@babylonjs/core/Meshes/Compression/meshoptCompression.js";

/** Decodes one `EXT_meshopt_compression` buffer view. */
export type DecodeMeshopt = (source: Uint8Array, count: number, stride: number, mode: "ATTRIBUTES" | "TRIANGLES" | "INDICES", filter?: string) => Promise<Uint8Array>;

interface Accessor { bufferView: number; byteOffset?: number; componentType: number; count: number; type: string; normalized?: boolean }
interface BufferView {
  buffer: number; byteOffset?: number; byteLength: number; byteStride?: number;
  extensions?: { EXT_meshopt_compression?: { buffer: number; byteOffset?: number; byteLength: number; byteStride: number; count: number; mode: "ATTRIBUTES" | "TRIANGLES" | "INDICES"; filter?: string } };
}

/** A GLB's JSON, and its accessors read out of its one binary chunk. */
export interface Glb<Json> {
  readonly json: Json;
  /** An attribute's values as floats; normalized integers are divided out. */
  floats(accessor: number): Float32Array;
  /** A triangle list's indices. */
  indices(accessor: number): Uint16Array | Uint32Array;
}

/**
 * Reads a GLB v2 whose data is all in its own binary chunk, meshopt-compressed or not, without a
 * glTF loader: the meshes' own vertex data, as authored. `what` names the file in errors.
 */
export async function readGlb<Json>(buffer: ArrayBuffer, what: string, decode: DecodeMeshopt = (...args) => MeshoptCompression.Default.decodeGltfBufferAsync(...args)): Promise<Glb<Json>> {
  const view = new DataView(buffer);
  if (buffer.byteLength < 28 || view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== buffer.byteLength) throw new Error(`${what} is not a complete GLB v2`);
  const jsonLength = view.getUint32(12, true), offset = 20 + jsonLength;
  const json = JSON.parse(new TextDecoder().decode(buffer.slice(20, offset))) as Json & { accessors: Accessor[]; bufferViews: BufferView[] };
  const bin = new Uint8Array(buffer, offset + 8);
  const views = await Promise.all(json.bufferViews.map(async value => {
    const compressed = value.extensions?.EXT_meshopt_compression;
    if (compressed) {
      if (compressed.buffer !== 0) throw new Error(`${what}: compressed data outside its GLB`);
      return decode(bin.subarray(compressed.byteOffset ?? 0, (compressed.byteOffset ?? 0) + compressed.byteLength), compressed.count, compressed.byteStride, compressed.mode, compressed.filter);
    }
    if (value.buffer !== 0) throw new Error(`${what}: data outside its GLB`);
    return bin.subarray(value.byteOffset ?? 0, (value.byteOffset ?? 0) + value.byteLength);
  }));
  const bytes = (index: number) => {
    const a = json.accessors[index]!, v = json.bufferViews[a.bufferView]!, data = views[a.bufferView]!;
    const components = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type];
    const width = { 5121: 1, 5123: 2, 5125: 4, 5126: 4 }[a.componentType];
    if (!components || !width) throw new Error(`${what}: unsupported accessor ${a.type}/${a.componentType}`);
    const stride = v.byteStride ?? components * width, start = a.byteOffset ?? 0;
    if (a.count && start + (a.count - 1) * stride + components * width > data.byteLength) throw new Error(`${what}: an accessor exceeds its buffer view`);
    const packed = new Uint8Array(a.count * components * width);
    for (let row = 0; row < a.count; row++) packed.set(data.subarray(start + row * stride, start + row * stride + components * width), row * components * width);
    return { type: a.componentType, data: packed.buffer, normalized: a.normalized };
  };
  return {
    json,
    floats(index) {
      const { type, data, normalized } = bytes(index);
      if (type === 5126) return new Float32Array(data);
      if (type === 5121) return Float32Array.from(new Uint8Array(data), (x) => normalized ? x / 255 : x);
      throw new Error(`${what}: attribute component type ${type}`);
    },
    indices(index) {
      const { type, data } = bytes(index);
      if (type !== 5123 && type !== 5125) throw new Error(`${what}: index component type ${type}`);
      return type === 5123 ? new Uint16Array(data) : new Uint32Array(data);
    },
  };
}
