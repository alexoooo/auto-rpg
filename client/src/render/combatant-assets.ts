import type { AnimationGroup } from "@babylonjs/core/Animations/animationGroup.js";
import type { AssetContainer } from "@babylonjs/core/assetContainer.js";
import type { Material } from "@babylonjs/core/Materials/material.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { Skeleton } from "@babylonjs/core/Bones/skeleton.js";
import "@babylonjs/loaders/glTF/2.0/glTFLoader.js";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader.js";
import {
  COMBATANT_BUILD_INPUTS_SHA256, COMBATANT_FIXTURE_ID, COMBATANT_GLB_SHA256,
  COMBATANT_SIDECAR_SHA256,
} from "./combatant-asset.generated.js";
import {
  COMBATANT_MAX_PAYLOAD_BYTES, parseCombatantAssetSidecar,
  type CombatantArchetypeContract, type CombatantAssetSidecar, type CombatantKind,
  type CombatantLod, type CombatantVector3,
} from "./combatant-asset-contract.js";

const SIDECAR_URL = "/assets3d/combatants.json";
const GLB_URL = "/assets3d/combatants.glb";
const MAX_SIDECAR_BYTES = 2 * 1024 * 1024;
const MAX_GLB_BYTES = 64 * 1024 * 1024;
const SHA256 = /^[0-9a-f]{64}$/;
const TOLERANCE = 0.00001;

export type CombatantAssetFetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
export type CombatantContainerLoader = (
  bytes: Uint8Array, scene: Scene,
  options: Readonly<{ pluginExtension: ".glb"; name: "combatants.glb" }>,
) => Promise<AssetContainer>;

export type CombatantArchetypeAsset = Readonly<{
  contract: CombatantArchetypeContract;
  root: TransformNode;
  skeleton: Skeleton;
  nodes: ReadonlyMap<string, TransformNode>;
  lods: ReadonlyMap<CombatantLod, ReadonlyMap<string, Mesh>>;
  clips: ReadonlyMap<string, AnimationGroup>;
}>;

export type CombatantAsset = Readonly<{
  sidecar: CombatantAssetSidecar;
  container: AssetContainer;
  archetypes: ReadonlyMap<CombatantKind, CombatantArchetypeAsset>;
  materials: ReadonlyMap<string, Material>;
  dispose(): void;
  readonly disposed: boolean;
}>;

export class CombatantAssetLoadError extends Error {
  readonly stage: string;

  constructor(stage: string, options?: ErrorOptions) {
    super(`representative combatant asset failed during ${stage}`, options);
    this.name = "CombatantAssetLoadError";
    this.stage = stage;
  }
}

function mediaType(response: Response): string {
  return (response.headers.get("content-type") ?? "").split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

async function fetchBounded(
  fetcher: CombatantAssetFetcher, url: string, expectedType: string, maximum: number, signal: AbortSignal,
): Promise<Uint8Array> {
  const response = await fetcher(url, { credentials: "same-origin", signal });
  if (!response.ok || response.status !== 200) throw new CombatantAssetLoadError(`${url} HTTP ${response.status}`);
  if (mediaType(response) !== expectedType) throw new CombatantAssetLoadError(`${url} MIME`);
  const declared = response.headers.get("content-length");
  if (declared !== null) {
    const length = Number(declared);
    if (!Number.isSafeInteger(length) || length < 0 || length > maximum) {
      throw new CombatantAssetLoadError(`${url} declared length`);
    }
  }
  if (response.body === null) throw new CombatantAssetLoadError(`${url} response body`);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      length += next.value.byteLength;
      if (length > maximum) {
        await reader.cancel("representative combatant asset exceeds its byte cap");
        throw new CombatantAssetLoadError(`${url} byte length`);
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  if (length === 0) throw new CombatantAssetLoadError(`${url} byte length`);
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function digest(bytes: Uint8Array): Promise<string> {
  const result = await crypto.subtle.digest("SHA-256", bytes.slice().buffer);
  return [...new Uint8Array(result)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function pin(value: string, label: string): string {
  if (!SHA256.test(value) || /^0{64}$/.test(value)) {
    throw new CombatantAssetLoadError(`${label} generated pin`);
  }
  return value;
}

function exactNames(items: readonly { name: string }[], expected: ReadonlySet<string>, label: string): void {
  if (items.length !== expected.size || items.some(({ name }) => !expected.has(name)) ||
      new Set(items.map(({ name }) => name)).size !== items.length) {
    throw new CombatantAssetLoadError(`${label} closure: ${items.map(({ name }) => name).join(",")}`);
  }
}

function unique<T extends { name: string }>(items: readonly T[], name: string, label: string): T {
  const matches = items.filter((item) => item.name === name);
  const found = matches[0];
  if (matches.length !== 1 || found === undefined) throw new CombatantAssetLoadError(`${label} semantic lookup`);
  return found;
}

function close(actual: number, expected: number): boolean {
  return Number.isFinite(actual) && Math.abs(actual - expected) <= TOLERANCE;
}

function vector(actual: { x: number; y: number; z: number }, expected: CombatantVector3): boolean {
  return close(actual.x, expected[0]) && close(actual.y, expected[1]) && close(actual.z, expected[2]);
}

function validateContainer(container: AssetContainer, sidecar: CombatantAssetSidecar): {
  archetypes: ReadonlyMap<CombatantKind, CombatantArchetypeAsset>;
  materials: ReadonlyMap<string, Material>;
} {
  const meshContracts = sidecar.archetypes.flatMap(({ lods }) =>
    lods.flatMap(({ meshes }) => meshes));
  const nodeContracts = sidecar.archetypes.flatMap(({ nodes }) => nodes);
  exactNames(container.meshes, new Set(["__root__", ...meshContracts.map(({ node }) => node)]), "mesh");
  exactNames(container.transformNodes,
    new Set([...nodeContracts.map(({ node }) => node), ...meshContracts.map(({ node }) => node),
      ...sidecar.archetypes.map(({ skeleton }) => skeleton.node)]),
    "transform node");
  exactNames(container.materials, new Set([
    "fighter_burgundy", "fighter_dark_steel", "fighter_leather", "fighter_skin",
    "fighter_steel", "brute_bone", "brute_hide", "brute_leather", "brute_skin",
    "equipment_dark_steel", "equipment_hide", "equipment_steel",
  ]), "material");
  exactNames(container.animationGroups,
    new Set(sidecar.archetypes.flatMap(({ clips }) => clips.map(({ animation }) => animation))),
    "animation group");
  exactNames(container.skeletons, new Set(sidecar.archetypes.map(({ skeleton }) => skeleton.skin)), "skeleton");
  if (container.geometries.length !== meshContracts.length ||
      (container.cameras?.length ?? 0) !== 0 || (container.lights?.length ?? 0) !== 0 ||
      (container.particleSystems?.length ?? 0) !== 0 || (container.morphTargetManagers?.length ?? 0) !== 0 ||
      (container.multiMaterials?.length ?? 0) !== 0 || (container.effectLayers?.length ?? 0) !== 0 ||
      (container.reflectionProbes?.length ?? 0) !== 0 || (container.lensFlareSystems?.length ?? 0) !== 0 ||
      (container.proceduralTextures?.length ?? 0) !== 0 || (container.spriteManagers?.length ?? 0) !== 0 ||
      container.environmentTexture !== null) throw new CombatantAssetLoadError("external collection closure");
  const loaderRoot = unique(container.meshes, "__root__", "loader root");
  if (container.rootNodes.length !== 1 || container.rootNodes[0] !== loaderRoot ||
      loaderRoot.parent !== null || loaderRoot.material !== null || loaderRoot.getTotalVertices() !== 0) {
    throw new CombatantAssetLoadError("loader root closure");
  }
  const materials = new Map<string, Material>();
  for (const material of container.materials) materials.set(material.name, material);
  const archetypes = new Map<CombatantKind, CombatantArchetypeAsset>();
  for (const contract of sidecar.archetypes) {
    const skeleton = unique(container.skeletons, contract.skeleton.skin, `${contract.kind} skeleton`);
    if (skeleton.bones.length !== contract.skeleton.bones.length ||
        skeleton.bones.some((bone, index) => bone.name !== contract.skeleton.bones[index])) {
      throw new CombatantAssetLoadError(`${contract.kind} skeleton bone closure`);
    }
    const armature = unique(container.transformNodes, contract.skeleton.node, `${contract.kind} armature`);
    if (armature.parent !== loaderRoot) throw new CombatantAssetLoadError(`${contract.kind} armature hierarchy`);
    const nodes = new Map<string, TransformNode>();
    for (const nodeContract of contract.nodes) {
      const node = unique(container.transformNodes, nodeContract.node, `${contract.kind} node ${nodeContract.semantic}`);
      const parentName = node.parent?.name ?? null;
      if (parentName !== (nodeContract.parent ?? "__root__") ||
          !vector(node.position, nodeContract.translation) || !vector(node.scaling, nodeContract.scale)) {
        throw new CombatantAssetLoadError(`${contract.kind} node ${nodeContract.semantic} transform`);
      }
      const rotation = node.rotationQuaternion;
      if (rotation === null || !close(rotation.x, nodeContract.rotation[0]) ||
          !close(rotation.y, nodeContract.rotation[1]) || !close(rotation.z, nodeContract.rotation[2]) ||
          !close(rotation.w, nodeContract.rotation[3])) {
        throw new CombatantAssetLoadError(`${contract.kind} node ${nodeContract.semantic} rotation`);
      }
      nodes.set(nodeContract.semantic, node);
    }
    const lods = new Map<CombatantLod, ReadonlyMap<string, Mesh>>();
    for (const lod of contract.lods) {
      const meshes = new Map<string, Mesh>();
      for (const meshContract of lod.meshes) {
        const mesh = unique(container.meshes, meshContract.node,
          `${contract.kind} ${lod.level} mesh ${meshContract.semantic}`) as Mesh;
      // Babylon reparents a root glTF skinned mesh beneath its armature transform.
      // The sidecar pins the serialized parent separately; this check pins the
      // runtime hierarchy that the renderer actually consumes.
      if (mesh.parent?.name !== contract.skeleton.node || mesh.material?.name !== meshContract.material ||
          mesh.skeleton !== skeleton ||
          mesh.subMeshes?.length !== meshContract.primitiveCount ||
          mesh.getTotalVertices() !== meshContract.vertexCount ||
          mesh.getTotalIndices() !== meshContract.triangleCount * 3) {
        throw new CombatantAssetLoadError(
          `${contract.kind} ${lod.level} mesh ${meshContract.semantic} geometry/material`);
      }
      const box = mesh.getBoundingInfo().boundingBox;
      if (!vector(box.minimum, meshContract.bounds.min) || !vector(box.maximum, meshContract.bounds.max)) {
        throw new CombatantAssetLoadError(
          `${contract.kind} ${lod.level} mesh ${meshContract.semantic} bounds`);
      }
      mesh.isVisible = false;
      mesh.isPickable = false;
      mesh.receiveShadows = false;
      meshes.set(meshContract.semantic, mesh);
      }
      lods.set(lod.level, meshes);
    }
    const clips = new Map<string, AnimationGroup>();
    for (const clipContract of contract.clips) {
      const group = unique(container.animationGroups, clipContract.animation,
        `${contract.kind} clip ${clipContract.semantic}`);
      group.stop();
      clips.set(clipContract.semantic, group);
    }
    const root = nodes.get("root");
    if (root === undefined || root.parent !== armature) {
      throw new CombatantAssetLoadError(`${contract.kind} root hierarchy`);
    }
    root.setEnabled(false);
    archetypes.set(contract.kind, Object.freeze({ contract, root, skeleton, nodes, lods, clips }));
  }
  return { archetypes, materials };
}

class LoadedCombatantAsset implements CombatantAsset {
  #disposed = false;

  constructor(
    readonly sidecar: CombatantAssetSidecar,
    readonly container: AssetContainer,
    readonly archetypes: ReadonlyMap<CombatantKind, CombatantArchetypeAsset>,
    readonly materials: ReadonlyMap<string, Material>,
    private readonly onDispose: () => void,
  ) {}

  get disposed(): boolean { return this.#disposed; }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.onDispose();
    this.container.dispose();
  }
}

const PENDING = new WeakMap<Scene, Promise<CombatantAsset>>();

async function loadOnce(
  scene: Scene, signal: AbortSignal, fetcher: CombatantAssetFetcher,
  loadContainer: CombatantContainerLoader,
): Promise<CombatantAsset> {
  let container: AssetContainer | null = null;
  try {
    if (signal.aborted) throw new CombatantAssetLoadError("abort");
    const sidecarBytes = await fetchBounded(fetcher, SIDECAR_URL, "application/json", MAX_SIDECAR_BYTES, signal);
    if (await digest(sidecarBytes) !== pin(COMBATANT_SIDECAR_SHA256, "sidecar")) {
      throw new CombatantAssetLoadError("sidecar hash");
    }
    const sidecar = parseCombatantAssetSidecar(sidecarBytes);
    if (sidecar.fixtureId !== COMBATANT_FIXTURE_ID ||
        sidecar.buildInputsSha256 !== pin(COMBATANT_BUILD_INPUTS_SHA256, "build inputs") ||
        sidecar.glbSha256 !== pin(COMBATANT_GLB_SHA256, "GLB")) {
      throw new CombatantAssetLoadError("sidecar identity");
    }
    const glbBytes = await fetchBounded(fetcher, GLB_URL, "model/gltf-binary", MAX_GLB_BYTES, signal);
    if (glbBytes.byteLength < 12 || glbBytes[0] !== 0x67 || glbBytes[1] !== 0x6c ||
        glbBytes[2] !== 0x54 || glbBytes[3] !== 0x46 ||
        new DataView(glbBytes.buffer, glbBytes.byteOffset, glbBytes.byteLength).getUint32(4, true) !== 2 ||
        new DataView(glbBytes.buffer, glbBytes.byteOffset, glbBytes.byteLength).getUint32(8, true) !== glbBytes.byteLength) {
      throw new CombatantAssetLoadError("GLB magic/version/length");
    }
    if (sidecarBytes.byteLength + glbBytes.byteLength > COMBATANT_MAX_PAYLOAD_BYTES ||
        sidecar.payloadBytes !== sidecarBytes.byteLength + glbBytes.byteLength) {
      throw new CombatantAssetLoadError("payload length");
    }
    if (await digest(glbBytes) !== COMBATANT_GLB_SHA256) throw new CombatantAssetLoadError("GLB hash");
    if (signal.aborted) throw new CombatantAssetLoadError("abort");
    container = await loadContainer(glbBytes, scene, { pluginExtension: ".glb", name: "combatants.glb" });
    if (signal.aborted) throw new CombatantAssetLoadError("abort");
    const validated = validateContainer(container, sidecar);
    container.addAllToScene();
    const result = new LoadedCombatantAsset(sidecar, container, validated.archetypes, validated.materials,
      () => PENDING.delete(scene));
    container = null;
    return result;
  } catch (error) {
    container?.dispose();
    if (error instanceof CombatantAssetLoadError) throw error;
    throw new CombatantAssetLoadError(signal.aborted ? "abort" : "load", {
      cause: error instanceof Error ? error : new Error(String(error)),
    });
  }
}

export function loadCombatantAsset(
  scene: Scene,
  signal: AbortSignal,
  fetcher: CombatantAssetFetcher = fetch,
  loadContainer: CombatantContainerLoader = LoadAssetContainerAsync,
): Promise<CombatantAsset> {
  const existing = PENDING.get(scene);
  if (existing !== undefined) return existing;
  const pending = loadOnce(scene, signal, fetcher, loadContainer).catch((error: unknown) => {
    PENDING.delete(scene);
    throw error;
  });
  PENDING.set(scene, pending);
  return pending;
}

export async function loadCombatantAssetOrFallback<T>(
  scene: Scene,
  signal: AbortSignal,
  fallback: (reason: CombatantAssetLoadError) => T | Promise<T>,
  fetcher: CombatantAssetFetcher = fetch,
  loadContainer: CombatantContainerLoader = LoadAssetContainerAsync,
): Promise<CombatantAsset | T> {
  try {
    return await loadCombatantAsset(scene, signal, fetcher, loadContainer);
  } catch (error) {
    const reason = error instanceof CombatantAssetLoadError ? error
      : new CombatantAssetLoadError("load", { cause: error instanceof Error ? error : new Error(String(error)) });
    if (reason.stage === "abort") throw reason;
    return fallback(reason);
  }
}
