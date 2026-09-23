import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import type { Scene } from "@babylonjs/core/scene.js";
import { publicAssetUrl } from "../../asset-url.ts";
import type { AppearancePart, GolemAppearance } from "../appearance.ts";
import { moduleFamily } from "../family.ts";
import type { GolemMaterialPalette } from "../materials.ts";

/**
 * The skeleton's modelled bones: `public/assets/skeleton/skeleton.glb`, compiled by
 * `scripts/skeleton/build-assets.py` from Blender Studio's CC0 anatomical skeleton.
 *
 * **Rigid, and cosmetic.** One mesh per physics part, written in that part's host-local frame, so a
 * piece is parented to its hidden collider at the identity transform and follows it exactly -- into
 * a severed limb's debris as well, because nothing re-parents it. A piece has no body, no shape and
 * no constraint, and the primitive shells it replaces stay built underneath as the fallback for a
 * page whose asset failed and for every Node harness, none of which loads it.
 *
 * **Bytes at module level, meshes per scene.** The dungeon builds a new scene and its golems
 * synchronously in one go, so an asynchronous load per scene could never finish first. The bytes
 * are fetched once; each scene builds its templates from them on first use, and a scene's templates
 * die with it.
 *
 * **The file's frame is the game's.** Positions are left-handed host-local, so nothing is negated
 * and no winding is swapped, unlike `warrior.glb`, which is standard glTF. A viewer shows it
 * mirrored. `tests/skeleton-art.test.mjs` pins both facts.
 */

interface Accessor { bufferView: number; componentType: number; count: number; type: string }
interface Primitive { attributes: { POSITION: number; NORMAL: number; TEXCOORD_0: number; COLOR_0: number }; indices: number }
interface Asset {
  accessors: Accessor[];
  bufferViews: { byteOffset: number; byteLength: number }[];
  meshes: { name: string; primitives: Primitive[]; extras: { eyes?: number[][] } }[];
}

type SkeletonAsset = { doc: Asset; bin: ArrayBuffer };
let asset: SkeletonAsset | null = null;
let loading: Promise<void> | null = null;

function parse(buffer: ArrayBuffer): SkeletonAsset {
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== 0x46546c67) throw new Error("Invalid skeleton GLB");
  const jsonLength = view.getUint32(12, true), offset = 20 + jsonLength;
  return { doc: JSON.parse(new TextDecoder().decode(buffer.slice(20, offset))) as Asset, bin: buffer.slice(offset + 8) };
}

/** Fetch the bones once per page. A failure leaves the primitive shells in place. */
export function loadSkeletonAssets(): Promise<void> {
  return loading ??= (async () => {
    const response = await fetch(publicAssetUrl("/assets/skeleton/skeleton.glb"));
    if (!response.ok) throw new Error(`Skeleton model failed to load (${response.status})`);
    asset = parse(await response.arrayBuffer());
  })().catch(error => { loading = null; throw error; });
}

/**
 * Tests only: drop the bytes, so the next build in any scene draws the primitive shells. A scene
 * keeps the templates it has already built, so a test that loads different bytes needs a new scene.
 */
export function forgetSkeletonAssets(): void { asset = null; loading = null; }

/** Parts that are deliberately drawn by nothing: the radius and ulna already span the roll ring. */
const EMPTY = new Set(["rollRing"]);

/**
 * A module's name segment as the bench spells it, which is its slot, onto the name `Golem` gives
 * it: `golem.bench.locomotion.thighL` is `left.golem.legs.thighL`.
 */
const SLOT_NAME: Readonly<Record<string, string>> = Object.freeze({ locomotion: "legs", torso: "trunk" });

/**
 * `legs.thighL`, `trunk.core`, `head.head`, `primary.upperArm`, `secondary.wrist.bare`... The id's
 * prefix is its owner's (`left.golem.`, `hero.golem.`, `golem.bench.`), so only the last two
 * segments are read, the second-last spelt as `Golem` spells it. A two-handed module's trailing arm
 * is built on the other socket from its own, so it is drawn by that side's pieces: the left's for
 * a maul in primary, which is the only place a fight puts one, and the right's for a maul the bench
 * has swapped into secondary. A fist terminal splits the hand between the wrist link and the fist.
 */
export function skeletonArtKey(part: Pick<AppearancePart, "moduleId" | "id">): string | null {
  if (moduleFamily(part.moduleId) !== "skeleton") return null;
  const segments = part.id.split(".");
  const segment = segments[segments.length - 1], owner = segments[segments.length - 2];
  const side = owner === "trailing" ? (segments[segments.length - 3] === "secondary" ? "primary" : "secondary")
    : SLOT_NAME[owner] ?? owner;
  const key = `${side}.${segment}`;
  return segment === "wrist" && part.moduleId.endsWith(".fist") ? `${key}.bare` : key;
}

const templates = new WeakMap<Scene, Map<string, Mesh | null>>();
function template(scene: Scene, key: string): Mesh | null {
  let cache = templates.get(scene);
  if (!cache) {
    cache = new Map();
    templates.set(scene, cache);
    scene.onDisposeObservable.addOnce(() => templates.delete(scene));
  }
  if (cache.has(key)) return cache.get(key)!;
  const row = asset?.doc.meshes.find(m => m.name === key);
  const mesh = row ? build(scene, key, row.primitives[0]) : null;
  cache.set(key, mesh);
  return mesh;
}

function build(scene: Scene, key: string, primitive: Primitive): Mesh {
  const { doc, bin } = asset!;
  const bytes = (index: number) => {
    const a = doc.accessors[index], v = doc.bufferViews[a.bufferView];
    return { type: a.componentType, data: bin.slice(v.byteOffset, v.byteOffset + v.byteLength) };
  };
  const floats = (index: number) => {
    const { type, data } = bytes(index);
    if (type === 5126) return new Float32Array(data);
    if (type === 5121) return Float32Array.from(new Uint8Array(data), x => x / 255);
    throw new Error(`Skeleton GLB: unexpected attribute component type ${type}`);
  };
  const { type, data } = bytes(primitive.indices);
  if (type !== 5123 && type !== 5125) throw new Error(`Skeleton GLB: unexpected index component type ${type}`);
  const vertex = new VertexData();
  vertex.positions = floats(primitive.attributes.POSITION);
  vertex.normals = floats(primitive.attributes.NORMAL);
  vertex.uvs = floats(primitive.attributes.TEXCOORD_0);
  vertex.colors = floats(primitive.attributes.COLOR_0);
  vertex.indices = type === 5123 ? new Uint16Array(data) : new Uint32Array(data);
  const mesh = new Mesh(`skeleton.template.${key}`, scene);
  vertex.applyToMesh(mesh, false);
  mesh.isPickable = false;
  mesh.setEnabled(false);
  return mesh;
}

/**
 * Dress one skeleton part with its modelled bone, or answer `null` for anything this does not draw
 * -- a stone or human part, a weapon, a page with no asset -- so the next appearance is asked.
 * `next` is that appearance: the rune eyes are handed to it, so forge style still lights them.
 */
export function dressSkeletonPart(part: AppearancePart, palette: GolemMaterialPalette,
  next: GolemAppearance): readonly AbstractMesh[] | null {
  const key = skeletonArtKey(part);
  if (!key || !asset) return null;
  const eyes = part.shells.filter(s => /\.eye[LR]$/.test(s.name));
  if (EMPTY.has(key.split(".").pop()!)) {
    for (const shell of part.shells) shell.isVisible = false;
    return [];
  }
  const source = template(part.host.getScene(), key);
  if (!source) return null;
  const mesh = source.clone(`${part.id}.bone`, part.host, true);
  mesh.position.setAll(0);
  mesh.rotationQuaternion = Quaternion.Identity();
  mesh.scaling.setAll(1);
  mesh.setEnabled(true);
  mesh.isVisible = true;
  mesh.material = palette.boneModel;
  mesh.receiveShadows = true;
  mesh.metadata = { skeletonArt: key };
  for (const shell of part.shells) if (!eyes.includes(shell)) shell.isVisible = false;
  const sockets = asset.doc.meshes.find(m => m.name === key)?.extras.eyes;
  if (sockets) for (const eye of eyes) {
    eye.position = Vector3.FromArray(sockets[eye.name.endsWith("L") ? 0 : 1]);
    eye.scaling.setAll(.7);
  }
  return [mesh, ...(eyes.length ? next({ ...part, shells: eyes }, palette) : [])];
}
