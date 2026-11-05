import { modelBytes } from "./asset-cache.ts";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import type { Scene } from "@babylonjs/core/scene.js";
import bind from "../../../../assets/skeleton/bind.json" with { type: "json" };
import { loadArtAssets } from "./art-assets.ts";
import { MeshoptCompression } from "@babylonjs/core/Meshes/Compression/meshoptCompression.js";
import { parseSkeletonArt, SKELETON_PIECES, type SkeletonArt } from "../../../core/bodies/human/skeleton-art.ts";
import type { DrawnBody, DrawnSegment } from "./drawn-body.ts";
import type { SkinView } from "./skin-view.ts";
import { skinReference } from "./body-deformation.ts";

let loading: Promise<SkeletonArt> | null = null;
/** The art, fetched once per page. */
export function loadSkeletonArt(): Promise<SkeletonArt> {
  return loading ??= (async () => {
    const art = await loadArtAssets();
    const bytes = await modelBytes(art.model("skeleton/skeleton.glb"));
    return parseSkeletonArt(bytes.slice().buffer, (...args) => MeshoptCompression.Default.decodeGltfBufferAsync(...args));
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
function piecesOnSegments(built: DrawnBody): Map<string, { readonly segment: string; readonly held: Matrix }> {
  const out = new Map<string, { segment: string; held: Matrix }>();
  for (const [key, { part, segment }] of Object.entries(SKELETON_PIECES)) {
    const carrier = built.segments.get(segment);
    if (!carrier) throw new Error(`${built.spec.model} has no segment ${segment} for the piece ${key}`);
    out.set(key, { segment, held: bindMatrix(part).multiply(skinReference(built, segment)) });
  }
  return out;
}

/** The bone and rune tints, set by eye: ivory, and amber eyes. */
const BONE = new Color3(0.80, 0.74, 0.62), RUNE = new Color3(0.72, 0.35, 0.12);
/** The eye's diameter, m: a fifth of a 0.16 m head's width, scaled by 0.7. */
const EYE = 0.16 * 0.2 * 0.7;

/** Dress `built`, the crypt skeleton, in `art`. The meshes and their materials are this view's own. */
export function dressSkeleton(built: DrawnBody, art: SkeletonArt, scene: Scene): SkinView {
  const prefix = `${built.spec.model}.skin.`;
  const bone = new PBRMaterial(`${prefix}bone`, scene);
  bone.albedoColor = BONE;
  bone.metallic = 0;
  bone.roughness = 0.62;
  const rune = new PBRMaterial(`${prefix}rune`, scene);
  rune.albedoColor = RUNE;
  rune.metallic = 0.42;
  rune.roughness = 0.66;

  const rows: { mesh: Mesh; segment: DrawnSegment; held: Matrix }[] = [];
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
