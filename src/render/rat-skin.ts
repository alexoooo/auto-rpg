import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial.js";
import { Texture } from "@babylonjs/core/Materials/Textures/texture.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import { Bone } from "@babylonjs/core/Bones/bone.js";
import { Skeleton } from "@babylonjs/core/Bones/skeleton.js";
import type { Scene } from "@babylonjs/core/scene.js";
import { loadArtAssets, type ArtAssets } from "./art-assets.ts";
import { modelBytes } from "./asset-cache.ts";
import { skinReference } from "./body-deformation.ts";
import type { DrawnBody } from "./drawn-body.ts";
import { readGlb, type DecodeMeshopt } from "./glb.ts";
import type { SkinView } from "./skin-view.ts";

/** The rat's mesh: its vertices in the body frame at the reference pose, and up to four segments' weights on each. */
export interface RatArt {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly uvs: Float32Array;
  readonly indices: Uint16Array | Uint32Array;
  /** The segment each bone follows, by the bone's index. */
  readonly bones: readonly string[];
  readonly joints: Float32Array;
  readonly weights: Float32Array;
  readonly art: ArtAssets;
}

interface Asset {
  nodes: { name: string }[];
  skins: { joints: number[] }[];
  meshes: { primitives: { attributes: { POSITION: number; NORMAL: number; TEXCOORD_0: number; JOINTS_0: number; WEIGHTS_0: number }; indices: number }[] }[];
}

/** The rat's art from a `rat.glb`'s bytes (`scripts/rat/build-assets.mjs`, docs/art/rat.md). */
export async function parseRatArt(buffer: ArrayBuffer, art: ArtAssets, decode?: DecodeMeshopt): Promise<RatArt> {
  const glb = await readGlb<Asset>(buffer, "the rat's art", decode), { json } = glb;
  if (json.meshes.length !== 1 || json.meshes[0]!.primitives.length !== 1 || json.skins.length !== 1) throw new Error("the rat's art is one skinned primitive");
  const { attributes, indices } = json.meshes[0]!.primitives[0]!;
  return {
    positions: glb.floats(attributes.POSITION), normals: glb.floats(attributes.NORMAL), uvs: glb.floats(attributes.TEXCOORD_0),
    indices: glb.indices(indices), bones: json.skins[0]!.joints.map((node) => json.nodes[node]!.name),
    joints: glb.floats(attributes.JOINTS_0), weights: glb.floats(attributes.WEIGHTS_0), art,
  };
}

let loading: Promise<RatArt> | null = null;
/** The rat's art, fetched once a page. */
export function loadRatArt(): Promise<RatArt> {
  return loading ??= (async () => {
    const art = await loadArtAssets();
    const bytes = await modelBytes(art.model("rat/rat.glb"));
    return parseRatArt(bytes.slice().buffer, art);
  })().catch((error: unknown) => { loading = null; throw error; });
}

/**
 * **The rat as the world sees it**: Poly Haven's Street Rat (Sean Buckley, CC0; docs/art/rat.md),
 * one mesh skinned to the body's segments. Each bone follows its segment: at the reference pose
 * the mesh is the art as authored, and every bone is its segment's achieved transform after its
 * reference frame, so the fur bends at the joints instead of parting. It reads the segments'
 * transforms and nothing else, owns no collision and decides nothing.
 */
export function dressRat(built: DrawnBody, art: RatArt, scene: Scene): SkinView {
  const prefix = `${built.spec.model}.skin.`;
  const texture = (id: string, colour: boolean) => {
    const map = new Texture(art.art.texture(`rat/${id}`), scene, false, false, Texture.TRILINEAR_SAMPLINGMODE);
    map.gammaSpace = colour;
    return map;
  };
  // The published material: the colour map, an OpenGL normal map, and occlusion, roughness and
  // metalness packed red, green, blue; double-sided, as the whiskers and ears are open sheets.
  const fur = new PBRMaterial(`${prefix}fur`, scene);
  fur.albedoTexture = texture("street_rat_diff_1k.jpg", true);
  fur.bumpTexture = texture("street_rat_nor_gl_1k.jpg", false);
  fur.invertNormalMapX = true;
  fur.metallicTexture = texture("street_rat_arm_1k.jpg", false);
  fur.useAmbientOcclusionFromMetallicTextureRed = true;
  fur.useRoughnessFromMetallicTextureGreen = true;
  fur.useRoughnessFromMetallicTextureAlpha = false;
  fur.useMetallnessFromMetallicTextureBlue = true;
  fur.metallic = 1;
  fur.roughness = 1;
  fur.backFaceCulling = false;
  fur.twoSidedLighting = true;

  const mesh = new Mesh(`${prefix}body`, scene);
  const vertex = new VertexData();
  vertex.positions = art.positions;
  vertex.normals = art.normals;
  vertex.uvs = art.uvs;
  vertex.indices = art.indices;
  vertex.matricesIndices = art.joints;
  vertex.matricesWeights = art.weights;
  vertex.applyToMesh(mesh, false);
  mesh.material = fur;
  mesh.isPickable = false;
  mesh.receiveShadows = true;
  // The mesh's bounds are the reference pose's at the origin; the body walks away from them.
  mesh.alwaysSelectAsActiveMesh = true;

  const skeleton = new Skeleton(`${prefix}bones`, `${prefix}bones`, scene);
  const rows = art.bones.map((name, index) => {
    const segment = built.segments.get(name);
    if (!segment) throw new Error(`${built.spec.model} has no segment ${name} for the rat's bone`);
    return { bone: new Bone(name, skeleton, null, Matrix.Identity(), null, null, index), segment, held: skinReference(built, name) };
  });
  mesh.skeleton = skeleton;
  mesh.numBoneInfluencers = 4;

  const carried = new Matrix();
  const update = () => {
    if (!mesh.isEnabled() || !mesh.isVisible) return;
    for (const { bone, segment, held } of rows) {
      const node = segment.node;
      Matrix.ComposeToRef(Vector3.OneReadOnly, node.rotationQuaternion!, node.position, carried);
      held.multiplyToRef(carried, bone.getLocalMatrix());
      bone.markAsDirty();
    }
  };
  update();
  const observer = scene.onBeforeRenderObservable.add(update);
  return {
    meshes: [mesh],
    setEnabled(enabled) { mesh.setEnabled(enabled); },
    wear() { /* The rat wears nothing. */ },
    dispose() {
      scene.onBeforeRenderObservable.remove(observer);
      mesh.dispose(false, false);
      skeleton.dispose();
      for (const map of [fur.albedoTexture, fur.bumpTexture, fur.metallicTexture]) map?.dispose();
      fur.dispose();
    },
  };
}
