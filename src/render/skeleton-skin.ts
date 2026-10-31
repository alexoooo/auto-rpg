import { modelBytes } from "./asset-cache.ts";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import type { Scene } from "@babylonjs/core/scene.js";
import bind from "../../assets/skeleton/bind.json" with { type: "json" };
import { loadArtAssets } from "./art-assets.ts";
import { MeshoptCompression } from "@babylonjs/core/Meshes/Compression/meshoptCompression.js";
import type { BuiltBody, BuiltSegment } from "../core/build/build-body.ts";
import type { SkinView } from "./skin-view.ts";
import { skinReference } from "./body-deformation.ts";

/**
 * **The crypt skeleton as the world sees it**: the pieces of `assets/art/environment/skeleton/skeleton.glb`
 * (Blender Studio's realistic skeleton, CC0; its README), each carried rigidly by the core segment
 * its bone belongs to. Like the humans' skin (`skin.ts`) it reads the segments' achieved transforms
 * and nothing else, owns no collision and decides nothing.
 *
 * The file holds one piece per part of the skeleton, its vertices in that part's frame, in the
 * game's left-handed coordinates, which are the body frame's: nothing is converted. A part's place
 * in the body is its bind (`assets/skeleton/bind.json`, the fist build), which is the skeleton
 * spec's reference pose (`src/core/human/skeleton.ts`), so a piece holds its bind relative to its
 * segment's reference frame and at the reference pose shows exactly as authored.
 *
 * The neck rides the head, as de Leva's head runs to the cervicale; the ribcage and collars the
 * upper trunk; the lumbar spine the middle trunk; the pelvis the lower trunk; the palm and the
 * fingers the hand. The roll ring has no piece (the radius and ulna span it), and the whole closed
 * hand (`*.wrist`) is not shown: the palm and fist pieces split that same hand.
 */
export const SKELETON_PIECES: Readonly<Record<string, { readonly part: string; readonly segment: string }>> = Object.freeze({
  "head.head": { part: "head.head", segment: "head" },
  "head.neck": { part: "head.neck", segment: "head" },
  "trunk.core": { part: "trunk.core", segment: "upperTrunk" },
  "primary.collar": { part: "primary.collar", segment: "upperTrunk" },
  "secondary.collar": { part: "secondary.collar", segment: "upperTrunk" },
  "trunk.waist": { part: "trunk.waist", segment: "middleTrunk" },
  "legs.pelvis": { part: "legs.pelvis", segment: "lowerTrunk" },
  ...Object.fromEntries((["right", "left"] as const).flatMap((side) => {
    const arm = side === "right" ? "primary" : "secondary", leg = side === "right" ? "R" : "L";
    return [
      [`${arm}.upperArm`, { part: `${arm}.upperArm`, segment: `upperArm.${side}` }],
      [`${arm}.forearm`, { part: `${arm}.forearm`, segment: `forearm.${side}` }],
      [`${arm}.wrist.bare`, { part: `${arm}.wrist`, segment: `hand.${side}` }],
      [`${arm}.fist`, { part: `${arm}.fist`, segment: `hand.${side}` }],
      [`legs.thigh${leg}`, { part: `legs.thigh${leg}`, segment: `thigh.${side}` }],
      [`legs.shin${leg}`, { part: `legs.shin${leg}`, segment: `shank.${side}` }],
      [`legs.foot${leg}`, { part: `legs.foot${leg}`, segment: `foot.${side}` }],
    ];
  })),
});

/** One piece of the art: its vertices in its part's frame, and the eye sockets' centres on the head. */
interface SkeletonPiece {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly uvs: Float32Array;
  readonly colors: Float32Array;
  readonly indices: Uint16Array | Uint32Array;
  readonly eyes?: readonly (readonly number[])[];
}
export type SkeletonArt = ReadonlyMap<string, SkeletonPiece>;

interface Accessor { bufferView: number; byteOffset?: number; componentType: number; count: number; type: string; normalized?: boolean }
type DecodeMeshopt = (source: Uint8Array, count: number, stride: number, mode: "ATTRIBUTES" | "TRIANGLES" | "INDICES", filter?: string) => Promise<Uint8Array>;
interface Primitive { attributes: { POSITION: number; NORMAL: number; TEXCOORD_0: number; COLOR_0: number }; indices: number }
interface Asset {
  accessors: Accessor[];
  bufferViews: { buffer: number; byteOffset?: number; byteLength: number; byteStride?: number;
    extensions?: { EXT_meshopt_compression?: { buffer: number; byteOffset?: number; byteLength: number; byteStride: number; count: number; mode: "ATTRIBUTES" | "TRIANGLES" | "INDICES"; filter?: string } } }[];
  meshes: { name: string; primitives: Primitive[]; extras?: { eyes?: number[][] } }[];
}

/** The pieces of a `skeleton.glb`'s bytes. */
export async function parseSkeletonArt(buffer: ArrayBuffer, decode: DecodeMeshopt = (...args) => MeshoptCompression.Default.decodeGltfBufferAsync(...args)): Promise<SkeletonArt> {
  const view = new DataView(buffer);
  if (buffer.byteLength < 28 || view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== buffer.byteLength) throw new Error("the skeleton's art is not a complete GLB v2");
  const jsonLength = view.getUint32(12, true), offset = 20 + jsonLength;
  const doc = JSON.parse(new TextDecoder().decode(buffer.slice(20, offset))) as Asset, bin = new Uint8Array(buffer, offset + 8);
  const views = await Promise.all(doc.bufferViews.map(async value => {
    const compressed = value.extensions?.EXT_meshopt_compression;
    if (compressed) {
      if (compressed.buffer !== 0) throw new Error("the skeleton's compressed data is outside its GLB");
      return decode(bin.subarray(compressed.byteOffset ?? 0, (compressed.byteOffset ?? 0) + compressed.byteLength), compressed.count, compressed.byteStride, compressed.mode, compressed.filter);
    }
    if (value.buffer !== 0) throw new Error("the skeleton's data is outside its GLB");
    return bin.subarray(value.byteOffset ?? 0, (value.byteOffset ?? 0) + value.byteLength);
  }));
  const bytes = (index: number) => {
    const a = doc.accessors[index]!, v = doc.bufferViews[a.bufferView]!, data = views[a.bufferView]!;
    const components = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type];
    const width = { 5121: 1, 5123: 2, 5125: 4, 5126: 4 }[a.componentType];
    if (!components || !width) throw new Error(`the skeleton's art: unsupported accessor ${a.type}/${a.componentType}`);
    const stride = v.byteStride ?? components * width, start = a.byteOffset ?? 0;
    if (a.count && start + (a.count - 1) * stride + components * width > data.byteLength) throw new Error("the skeleton's accessor exceeds its buffer view");
    const packed = new Uint8Array(a.count * components * width);
    for (let row = 0; row < a.count; row++) packed.set(data.subarray(start + row * stride, start + row * stride + components * width), row * components * width);
    return { type: a.componentType, data: packed.buffer, normalized: a.normalized };
  };
  const floats = (index: number): Float32Array => {
    const { type, data, normalized } = bytes(index);
    if (type === 5126) return new Float32Array(data);
    if (type === 5121) return Float32Array.from(new Uint8Array(data), (x) => normalized ? x / 255 : x);
    throw new Error(`the skeleton's art: attribute component type ${type}`);
  };
  const art = new Map<string, SkeletonPiece>();
  for (const mesh of doc.meshes) {
    if (mesh.primitives.length !== 1) throw new Error(`the skeleton piece ${mesh.name} must have one primitive`);
    const primitive = mesh.primitives[0]!, { type, data } = bytes(primitive.indices);
    if (type !== 5123 && type !== 5125) throw new Error(`the skeleton's art: index component type ${type}`);
    const eyes = mesh.extras?.eyes;
    art.set(mesh.name, {
      positions: floats(primitive.attributes.POSITION), normals: floats(primitive.attributes.NORMAL),
      uvs: floats(primitive.attributes.TEXCOORD_0), colors: floats(primitive.attributes.COLOR_0),
      indices: type === 5123 ? new Uint16Array(data) : new Uint32Array(data),
      ...(eyes ? { eyes } : {}),
    });
  }
  return art;
}

let loading: Promise<SkeletonArt> | null = null;
/** The art, fetched once per page. */
export function loadSkeletonArt(): Promise<SkeletonArt> {
  return loading ??= (async () => {
    const art = await loadArtAssets();
    const bytes = await modelBytes(art.model("skeleton/skeleton.glb"));
    return parseSkeletonArt(bytes.slice().buffer);
  })().catch((error: unknown) => { loading = null; throw error; });
}

interface BindPart { readonly build: string; readonly id: string; readonly position: readonly number[]; readonly rotation: readonly number[] }
/** A part's place in the body at the reference pose: the bind's fist build. */
function bindMatrix(part: string): Matrix {
  const row = (bind as readonly BindPart[]).find((p) => p.build === "fist/fist" && p.id === `left.golem.${part}`);
  if (!row) throw new Error(`the skeleton's bind has no ${part}`);
  return Matrix.Compose(Vector3.One(), Quaternion.FromArray(row.rotation), Vector3.FromArray(row.position));
}

/** Each shown piece's transform in its segment's frame: its bind in the segment's reference frame. */
function piecesOnSegments(built: BuiltBody): Map<string, { readonly segment: string; readonly held: Matrix }> {
  const out = new Map<string, { segment: string; held: Matrix }>();
  for (const [key, { part, segment }] of Object.entries(SKELETON_PIECES)) {
    const carrier = built.segments.get(segment);
    if (!carrier) throw new Error(`${built.spec.model} has no segment ${segment} for the piece ${key}`);
    out.set(key, { segment, held: bindMatrix(part).multiply(skinReference(built, segment)) });
  }
  return out;
}

/** The bone and rune tints: ivory, and amber eyes (`docs/reference/look.md#bodies`). */
const BONE = new Color3(0.80, 0.74, 0.62), RUNE = new Color3(0.72, 0.35, 0.12);
/** The eye's diameter, m: a fifth of a 0.16 m head's width, scaled by 0.7 (`docs/reference/look.md#bodies`). */
const EYE = 0.16 * 0.2 * 0.7;

/** Dress `built`, the crypt skeleton, in `art`. The meshes and their materials are this view's own. */
export function dressSkeleton(built: BuiltBody, art: SkeletonArt, scene: Scene): SkinView {
  const prefix = `${built.spec.model}.skin.`;
  const bone = new PBRMaterial(`${prefix}bone`, scene);
  bone.albedoColor = BONE;
  bone.metallic = 0;
  bone.roughness = 0.62;
  const rune = new PBRMaterial(`${prefix}rune`, scene);
  rune.albedoColor = RUNE;
  rune.metallic = 0.42;
  rune.roughness = 0.66;

  const rows: { mesh: Mesh; segment: BuiltSegment; held: Matrix }[] = [];
  const meshes: Mesh[] = [];
  for (const [key, { segment, held }] of piecesOnSegments(built)) {
    const piece = art.get(key);
    if (!piece) throw new Error(`the skeleton's art has no piece ${key}`);
    const mesh = new Mesh(prefix + key, scene);
    const vertex = new VertexData();
    vertex.positions = piece.positions;
    vertex.normals = piece.normals;
    vertex.uvs = piece.uvs;
    vertex.colors = piece.colors;
    vertex.indices = piece.indices;
    vertex.applyToMesh(mesh, false);
    mesh.material = bone;
    mesh.isPickable = false;
    mesh.receiveShadows = true;
    // The mesh's bounds are its part's frame; the body walks away from them.
    mesh.alwaysSelectAsActiveMesh = true;
    mesh.rotationQuaternion = Quaternion.Identity();
    meshes.push(mesh);
    rows.push({ mesh, segment: built.segments.get(segment)!, held });
    for (const socket of piece.eyes ?? []) {
      const eye = MeshBuilder.CreateSphere(`${prefix}${key}.eye`, { diameter: EYE, segments: 8 }, scene);
      eye.material = rune;
      eye.isPickable = false;
      eye.parent = mesh;
      eye.position = Vector3.FromArray(socket);
      meshes.push(eye);
    }
  }

  const carried = new Matrix(), world = new Matrix(), turn = new Quaternion(), place = new Vector3(), unit = new Vector3();
  const update = () => {
    if (!meshes.some(mesh => mesh.isEnabled() && mesh.isVisible)) return;
    for (const { mesh, segment, held } of rows) {
      const node = segment.node;
      Matrix.ComposeToRef(Vector3.OneReadOnly, node.rotationQuaternion!, node.position, carried);
      held.multiplyToRef(carried, world);
      world.decompose(unit, turn, place);
      mesh.scaling.copyFrom(unit);
      mesh.rotationQuaternion!.copyFrom(turn);
      mesh.position.copyFrom(place);
    }
  };
  update();
  const observer = scene.onBeforeRenderObservable.add(update);
  return {
    meshes,
    setEnabled(enabled) { for (const mesh of meshes) mesh.setEnabled(enabled); },
    wear() { /* The skeleton wears nothing. */ },
    dispose() {
      scene.onBeforeRenderObservable.remove(observer);
      for (const mesh of meshes) mesh.dispose(false, false);
      bone.dispose();
      rune.dispose();
    },
  };
}
