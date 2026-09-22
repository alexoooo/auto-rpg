import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Bone } from "@babylonjs/core/Bones/bone.js";
import { Skeleton } from "@babylonjs/core/Bones/skeleton.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import { publicAssetUrl } from "../../asset-url.ts";

interface Binding { key: string; slot: string; id: string; position: number[]; rotation: number[] }
interface Accessor { bufferView: number; componentType: number; count: number; type: string }
interface Primitive { attributes: { POSITION: number; JOINTS_0: number; WEIGHTS_0: number }; indices: number; material: number }
interface Asset { accessors: Accessor[]; bufferViews: { byteOffset: number; byteLength: number }[];
  meshes: { name: string; extras: { slot: string }; primitives: Primitive[] }[];
  materials: { name: string; pbrMetallicRoughness: { baseColorFactor: number[]; metallicFactor: number; roughnessFactor: number } }[];
  extras: { physicsBindings: Binding[] } }
let asset: { doc: Asset; bin: ArrayBuffer } | null = null;
let loading: Promise<void> | null = null;

/** The compiler emits a deliberately small GLB subset. Loading never creates physics. */
export function loadHumanAssets(): Promise<void> {
  return loading ??= (async () => {
    const response = await fetch(publicAssetUrl("/assets/humanoid/warrior.glb"));
    if (!response.ok) throw new Error(`Warrior model failed to load (${response.status})`);
    const buffer = await response.arrayBuffer(), view = new DataView(buffer);
    if (view.getUint32(0, true) !== 0x46546c67) throw new Error("Invalid warrior GLB");
    const jsonLength = view.getUint32(12, true), offset = 20 + jsonLength;
    const doc = JSON.parse(new TextDecoder().decode(buffer.slice(20, offset))) as Asset;
    asset = { doc, bin: buffer.slice(offset + 8) };
  })().catch(error => { loading = null; throw error; });
}

export interface HumanVisualPart { slot: string; moduleId: string; id: string; host: AbstractMesh; shells: readonly AbstractMesh[] }
export function dressHumanoid(scene: Scene, parts: readonly HumanVisualPart[], side: string) {
  const human = parts.filter(p => p.moduleId.includes(".human") || p.moduleId.includes(".anatomical."));
  if (!human.length || !asset) return null; // Headless callers deliberately have no asset dependency.
  const { doc, bin } = asset;
  const hosts = new Map(human.map(p => [`${p.slot}.${p.id.split(".").pop()}`, p.host]));
  // A two-handed module owns both arms. Its trailing bones are in the primary slot's part list.
  for (const p of human) if (p.id.includes(".trailing.")) hosts.set(`secondary.${p.id.split(".").pop()}`, p.host);
  const skeleton = new Skeleton(`human.${side}`, `human.${side}`, scene);
  const bones = doc.extras.physicsBindings.map(binding => {
    const matrix = Matrix.Compose(Vector3.One(), Quaternion.FromArray(binding.rotation), Vector3.FromArray(binding.position));
    return { bone: new Bone(binding.key, skeleton, null, matrix), host: hosts.get(binding.key) };
  });
  const materials = doc.materials.map(row => {
    const material = new PBRMaterial(`human.${side}.${row.name}`, scene), p = row.pbrMetallicRoughness;
    material.albedoColor = Color3.FromArray(p.baseColorFactor);
    if (row.name.toLowerCase().includes("body")) material.albedoColor = Color3.FromHexString(side === "left" ? "#23445e" : "#682e2b");
    material.metallic = p.metallicFactor; material.roughness = p.roughnessFactor;
    material.backFaceCulling = false; material.maxSimultaneousLights = 8; return material;
  });
  const read = (index: number): number[] => {
    const a = doc.accessors[index], v = doc.bufferViews[a.bufferView];
    const data = bin.slice(v.byteOffset, v.byteOffset + v.byteLength);
    return Array.from(a.componentType === 5126 ? new Float32Array(data) : a.componentType === 5123 ? new Uint16Array(data) : new Uint32Array(data));
  };
  const meshes: Mesh[] = [];
  for (const row of doc.meshes) {
    if (!Array.from(hosts.keys()).some(k => k.startsWith(row.extras.slot + "."))) continue;
    for (const primitive of row.primitives) {
      const mesh = new Mesh(`human.${side}.${row.name}`, scene), vertex = new VertexData();
      vertex.positions = read(primitive.attributes.POSITION);
      for (let i = 2; i < vertex.positions.length; i += 3) vertex.positions[i] *= -1;
      vertex.indices = read(primitive.indices);
      for (let i = 0; i < vertex.indices.length; i += 3) [vertex.indices[i + 1], vertex.indices[i + 2]] = [vertex.indices[i + 2], vertex.indices[i + 1]];
      vertex.matricesIndices = read(primitive.attributes.JOINTS_0); vertex.matricesWeights = read(primitive.attributes.WEIGHTS_0);
      vertex.normals = []; VertexData.ComputeNormals(vertex.positions, vertex.indices, vertex.normals);
      // The GLB splits triangles at module/material seams; share normals inside each surface.
      const normals = new Map<string, Vector3>();
      const keyAt = (i: number) => Array.from(vertex.positions!.slice(i, i + 3)).map(n => n.toFixed(5)).join(",");
      for (let i = 0; i < vertex.positions.length; i += 3) {
        const key = keyAt(i), n = normals.get(key) ?? Vector3.Zero();
        n.addInPlace(Vector3.FromArray(vertex.normals, i)); normals.set(key, n);
      }
      for (let i = 0; i < vertex.positions.length; i += 3) {
        const n = normals.get(keyAt(i))!.normalize(); vertex.normals[i] = n.x; vertex.normals[i + 1] = n.y; vertex.normals[i + 2] = n.z;
      }
      vertex.applyToMesh(mesh, true); mesh.skeleton = skeleton; mesh.computeBonesUsingShaders = false; mesh.material = materials[primitive.material];
      mesh.receiveShadows = true; mesh.isPickable = true;
      mesh.metadata = { humanSlot: row.extras.slot }; meshes.push(mesh);
    }
  }
  for (const p of human) {
    // Equipment still uses its existing terminal visuals.
    const id = p.id.split(".").pop()!;
    if (!doc.extras.physicsBindings.some(b => b.id === id) && !["shoulderYaw", "shoulderPitch", "pronation", "wrist", "waist", "fist"].includes(id)) continue;
    p.host.isVisible = false;
    for (const shell of p.shells) shell.isVisible = false;
  }
  const update = () => {
    for (const { bone, host } of bones) if (host && !host.isDisposed()) {
      bone.setPosition(host.position);
      bone.setRotationQuaternion(host.rotationQuaternion ?? Quaternion.Identity());
    }
    skeleton.prepare();
    // Skin the achieved pose before culling and picking, including detached limbs.
    for (const mesh of meshes) { mesh.applySkeleton(skeleton); mesh.refreshBoundingInfo(); }
  };
  update(); const observer = scene.onBeforeRenderObservable.add(update);
  return { meshes, dispose() {
    scene.onBeforeRenderObservable.remove(observer); meshes.forEach(m => m.dispose(false, false));
    skeleton.dispose(); materials.forEach(m => m.dispose());
  } };
}
