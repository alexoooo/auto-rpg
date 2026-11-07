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
import { skinApart } from "./skin-apart.ts";
import type { DrawnBody } from "./drawn-body.ts";
import { readGlb } from "./glb.ts";
import type { DecodeMeshopt } from "../../../core/bodies/art/glb.ts";
import type { SkinView } from "./skin-view.ts";

/**
 * A creature drawn as one mesh skinned to its body's segments: its GLB and maps in the art
 * catalogue. `packed` holds occlusion, roughness and metalness in red, green and blue; without it
 * the surface is non-metallic at `roughness`.
 */
interface SkinnedLook {
  readonly model: string;
  readonly colour: string;
  /** An OpenGL normal map. */
  readonly normal: string;
  readonly packed?: string;
  readonly roughness?: number;
}

/** **Each skinned creature's art**; its source, licence and rebuild in `docs/art/rat.md` and `docs/art/reptile.md`. */
export const SKINNED_LOOKS = Object.freeze({
  rat: { model: "rat/rat.glb", colour: "rat/street_rat_diff_1k.jpg", normal: "rat/street_rat_nor_gl_1k.jpg", packed: "rat/street_rat_arm_1k.jpg" },
  reptile: { model: "reptile/reptile.glb", colour: "reptile/grass_lizard_diff_1k.jpg", normal: "reptile/grass_lizard_nor_gl_1k.jpg", roughness: .55 },
} satisfies Record<string, SkinnedLook>);

/** A skinned creature's mesh: its vertices in the body frame at the reference pose, and up to four segments' weights on each. */
interface SkinnedArt {
  readonly look: SkinnedLook;
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

/** A skinned creature's art from its GLB's bytes. */
async function parseSkinnedArt(buffer: ArrayBuffer, look: SkinnedLook, art: ArtAssets, decode?: DecodeMeshopt): Promise<SkinnedArt> {
  const glb = await readGlb<Asset>(buffer, look.model, decode), { json } = glb;
  if (json.meshes.length !== 1 || json.meshes[0]!.primitives.length !== 1 || json.skins.length !== 1) throw new Error(`${look.model} is not one skinned primitive`);
  const { attributes, indices } = json.meshes[0]!.primitives[0]!;
  return {
    look, positions: glb.floats(attributes.POSITION), normals: glb.floats(attributes.NORMAL), uvs: glb.floats(attributes.TEXCOORD_0),
    indices: glb.indices(indices), bones: json.skins[0]!.joints.map((node) => json.nodes[node]!.name),
    joints: glb.floats(attributes.JOINTS_0), weights: glb.floats(attributes.WEIGHTS_0), art,
  };
}

const loading = new Map<SkinnedLook, Promise<SkinnedArt>>();
/** A skinned creature's art, fetched once a page. */
export function loadSkinnedArt(look: SkinnedLook): Promise<SkinnedArt> {
  let pending = loading.get(look);
  if (!pending) {
    pending = (async () => {
      const art = await loadArtAssets();
      const bytes = await modelBytes(art.model(look.model));
      return parseSkinnedArt(bytes.slice().buffer, look, art);
    })();
    pending.catch(() => loading.delete(look));
    loading.set(look, pending);
  }
  return pending;
}

/**
 * **A skinned creature as the world sees it**: one mesh skinned to the body's segments. Each bone
 * follows its segment: at the reference pose the mesh is the art as authored, and every bone is its
 * segment's achieved transform after its reference frame, so the surface bends at the joints instead
 * of parting, and opens where a part is cut off (`skinApart`). It reads the segments' transforms and nothing else, owns no collision and decides nothing.
 *
 * The GLB is read without a glTF loader (`readGlb`): one primitive whose bones are named by the segments, each at the
 * body frame's origin with an identity inverse bind, so before each render a bone is set to its segment's reference
 * frame inverted (`skinReference`) times the segment's achieved transform.
 */
export function dressSkinnedArt(built: DrawnBody, art: SkinnedArt, scene: Scene): SkinView {
  const prefix = `${built.spec.model}.skin.`, { look } = art;
  const texture = (id: string, colour: boolean) => {
    const map = new Texture(art.art.texture(id), scene, false, false, Texture.TRILINEAR_SAMPLINGMODE);
    map.gammaSpace = colour;
    return map;
  };
  // Double-sided: whiskers, ears and claws are open sheets.
  const surface = new PBRMaterial(`${prefix}surface`, scene);
  surface.albedoTexture = texture(look.colour, true);
  surface.bumpTexture = texture(look.normal, false);
  surface.invertNormalMapX = true;
  if (look.packed) {
    surface.metallicTexture = texture(look.packed, false);
    surface.useAmbientOcclusionFromMetallicTextureRed = true;
    surface.useRoughnessFromMetallicTextureGreen = true;
    surface.useRoughnessFromMetallicTextureAlpha = false;
    surface.useMetallnessFromMetallicTextureBlue = true;
    surface.metallic = 1;
    surface.roughness = 1;
  } else {
    surface.metallic = 0;
    surface.roughness = look.roughness ?? 1;
  }
  surface.backFaceCulling = false;
  surface.twoSidedLighting = true;

  const mesh = new Mesh(`${prefix}body`, scene);
  const vertex = new VertexData();
  vertex.positions = art.positions;
  vertex.normals = art.normals;
  vertex.uvs = art.uvs;
  vertex.indices = art.indices;
  vertex.matricesIndices = art.joints;
  vertex.matricesWeights = art.weights;
  vertex.applyToMesh(mesh, false);
  mesh.material = surface;
  mesh.isPickable = false;
  mesh.receiveShadows = true;
  // The mesh's bounds are the reference pose's at the origin; the body walks away from them.
  mesh.alwaysSelectAsActiveMesh = true;

  const skeleton = new Skeleton(`${prefix}bones`, `${prefix}bones`, scene);
  const rows = art.bones.map((name, index) => {
    const segment = built.segments.get(name);
    if (!segment) throw new Error(`${built.spec.model} has no segment ${name} for ${look.model}'s bone`);
    return { bone: new Bone(name, skeleton, null, Matrix.Identity(), null, null, index), segment, held: skinReference(built, name) };
  });
  mesh.skeleton = skeleton;
  mesh.numBoneInfluencers = 4;
  const part = skinApart(mesh, built, art.bones);

  const carried = new Matrix();
  const update = () => {
    if (!mesh.isEnabled() || !mesh.isVisible) return;
    part();
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
    wear() { /* A creature wears nothing. */ },
    dispose() {
      scene.onBeforeRenderObservable.remove(observer);
      mesh.dispose(false, false);
      skeleton.dispose();
      for (const map of [surface.albedoTexture, surface.bumpTexture, surface.metallicTexture]) map?.dispose();
      surface.dispose();
    },
  };
}
