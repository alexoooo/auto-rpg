import type { AssetContainer } from "@babylonjs/core/assetContainer.js";
import type { Material } from "@babylonjs/core/Materials/material.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import type { Scene } from "@babylonjs/core/scene.js";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer.js";
// AssetContainer instantiation reaches Mesh.createInstance through the loader,
// so this standalone lazy boundary must register the prototype extension itself.
import "@babylonjs/core/Meshes/instancedMesh.js";
// This leaf registers both the glTF 2 implementation and its version-aware file
// plugin. Registering only glTFFileLoader accepts .glb and then rejects version 2.
import "@babylonjs/loaders/glTF/2.0/glTFLoader.js";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader.js";
import {
  ROOM_BUILD_INPUTS_SHA256, ROOM_FIXTURE_ID, ROOM_GLB_SHA256, ROOM_SIDECAR_SHA256,
} from "./room-asset.generated.js";
import {
  parseRoomAssetSidecar, ROOM_MAX_PAYLOAD_BYTES, type RoomAssetSidecar,
  type RoomMaterialRole, type RoomPieceName, type RoomVector3,
} from "./room-asset-contract.js";

const SIDECAR_URL = "/assets3d/room_slice.json";
const GLB_URL = "/assets3d/room_slice.glb";
const MAX_SIDECAR_BYTES = 4 * 1024 * 1024;
const MAX_GLB_BYTES = 67_108_864;
const MATERIAL_COMPILE_TIMEOUT_MS = 30_000;
const SHA256 = /^[0-9a-f]{64}$/;
const TOLERANCE = 0.00001;

export type RoomAssetFetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
export type RoomContainerLoader = (
  bytes: Uint8Array, scene: Scene,
  options: Readonly<{ pluginExtension: ".glb"; name: "room_slice.glb" }>,
) => Promise<AssetContainer>;

export type RoomAsset = Readonly<{
  sidecar: RoomAssetSidecar;
  container: AssetContainer;
  pieces: ReadonlyMap<RoomPieceName, Mesh>;
  materials: ReadonlyMap<RoomMaterialRole, Material>;
  socket: TransformNode;
  dispose(): void;
  readonly disposed: boolean;
}>;

export class RoomAssetLoadError extends Error {
  constructor(stage: string, options?: ErrorOptions) {
    super(`representative room asset failed during ${stage}`, options);
    this.name = "RoomAssetLoadError";
  }
}

function mediaType(response: Response): string {
  return (response.headers.get("content-type") ?? "").split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

async function fetchBounded(
  fetcher: RoomAssetFetcher, url: string, expectedType: string, maximum: number, signal: AbortSignal,
): Promise<Uint8Array> {
  const response = await fetcher(url, { credentials: "same-origin", signal });
  if (!response.ok || response.status !== 200) throw new RoomAssetLoadError(`${url} HTTP ${response.status}`);
  const actualType = mediaType(response);
  if (actualType !== expectedType) throw new RoomAssetLoadError(`${url} MIME`);
  const declared = response.headers.get("content-length");
  if (declared !== null) {
    const length = Number(declared);
    if (!Number.isSafeInteger(length) || length < 0 || length > maximum) {
      throw new RoomAssetLoadError(`${url} declared length`);
    }
  }
  if (response.body === null) throw new RoomAssetLoadError(`${url} response body`);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      length += next.value.byteLength;
      if (length > maximum) {
        await reader.cancel("representative room asset exceeds its byte cap");
        throw new RoomAssetLoadError(`${url} byte length`);
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  if (length === 0) throw new RoomAssetLoadError(`${url} byte length`);
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

function requirePin(value: string, label: string): string {
  if (!SHA256.test(value)) throw new RoomAssetLoadError(`${label} generated pin`);
  return value;
}

function uniqueByName<T extends { name: string }>(items: readonly T[], name: string, label: string): T {
  const matches = items.filter((item) => item.name === name);
  if (matches.length !== 1) throw new RoomAssetLoadError(`${label} semantic lookup`);
  const match = matches[0];
  if (match === undefined) throw new RoomAssetLoadError(`${label} semantic lookup`);
  return match;
}

function close(actual: number, expected: number): boolean {
  return Number.isFinite(actual) && Math.abs(actual - expected) <= TOLERANCE;
}

function vectorMatches(actual: { x: number; y: number; z: number }, expected: RoomVector3): boolean {
  return close(actual.x, expected[0]) && close(actual.y, expected[1]) && close(actual.z, expected[2]);
}

function identityTransform(node: TransformNode, label: string): void {
  if (!vectorMatches(node.position, [0, 0, 0]) || !vectorMatches(node.scaling, [1, 1, 1])) {
    throw new RoomAssetLoadError(`${label} identity transform`);
  }
  const quaternion = node.rotationQuaternion;
  if (quaternion !== null ?
      !(close(quaternion.x, 0) && close(quaternion.y, 0) && close(quaternion.z, 0) && close(quaternion.w, 1)) :
      !vectorMatches(node.rotation, [0, 0, 0])) {
    throw new RoomAssetLoadError(`${label} identity transform`);
  }
}

function exactNameSet(items: readonly { name: string }[], expected: ReadonlySet<string>, label: string): void {
  if (items.length !== expected.size || items.some((item) => !expected.has(item.name)) ||
      new Set(items.map((item) => item.name)).size !== items.length) {
    throw new RoomAssetLoadError(`${label} closure: ${items.map((item) => item.name).join(",")}`);
  }
}

function validateContainer(container: AssetContainer, sidecar: RoomAssetSidecar): {
  pieces: ReadonlyMap<RoomPieceName, Mesh>;
  materials: ReadonlyMap<RoomMaterialRole, Material>;
  socket: TransformNode;
} {
  const expectedPieceNodes = new Set(sidecar.pieces.map((piece) => piece.node));
  const expectedMeshes = new Set<string>(["__root__", ...expectedPieceNodes]);
  exactNameSet(container.meshes, expectedMeshes, "mesh");
  exactNameSet(container.transformNodes, new Set(["SOCKET_torch_flame"]), "transform node");
  exactNameSet(container.materials, new Set([
    "floor_current", "stone_current", "wood_current", "metal_current", "overburden_current",
  ]), "material");
  if (container.geometries.length !== expectedPieceNodes.size ||
      container.geometries.some((geometry) => !expectedPieceNodes.has(geometry.id as never)) ||
      new Set(container.geometries.map((geometry) => geometry.id)).size !== container.geometries.length) {
    throw new RoomAssetLoadError("geometry closure");
  }
  const externalCollections: readonly [string, readonly unknown[] | null][] = [
    ["camera", container.cameras], ["light", container.lights],
    ["skeleton", container.skeletons], ["animation", container.animations],
    ["animation group", container.animationGroups], ["particle system", container.particleSystems],
    ["multi-material", container.multiMaterials], ["morph target", container.morphTargetManagers],
    ["action manager", container.actionManagers], ["post-process", container.postProcesses],
    ["sound", container.sounds], ["effect layer", container.effectLayers], ["layer", container.layers],
    ["reflection probe", container.reflectionProbes], ["lens flare", container.lensFlareSystems],
    ["procedural texture", container.proceduralTextures], ["sprite manager", container.spriteManagers],
  ];
  for (const [label, items] of externalCollections) {
    if ((items?.length ?? 0) !== 0) throw new RoomAssetLoadError(`unexpected ${label}`);
  }
  if (container.environmentTexture !== null) throw new RoomAssetLoadError("unexpected environment texture");
  exactNameSet(container.textures, new Set([
    ...["floor_current", "stone_current", "wood_current", "overburden_current"].flatMap((role) => [
      `${role} (Base Color)`, `${role} (Normal)`, `${role} (Metallic Roughness)`,
    ]),
  ]), "texture");

  const root = uniqueByName(container.meshes, "__root__", "loader root") as Mesh;
  if (container.rootNodes.length !== 1 || container.rootNodes[0] !== root || root.parent !== null ||
      root.material !== null || root.getTotalVertices() !== 0) {
    throw new RoomAssetLoadError("loader root closure");
  }
  const pieces = new Map<RoomPieceName, Mesh>();
  for (const contract of sidecar.pieces) {
    const mesh = uniqueByName(container.meshes, contract.node, `piece ${contract.node}`);
    if (typeof (mesh as Mesh).createInstance !== "function") {
      throw new RoomAssetLoadError(`piece ${contract.node} mesh type`);
    }
    const source = mesh as Mesh;
    if (source.parent !== root || source.material?.name !== contract.materialRole ||
        source.subMeshes?.length !== contract.primitiveCount ||
        source.getTotalVertices() !== contract.vertexCount ||
        source.getTotalIndices() !== contract.triangleCount * 3) {
      throw new RoomAssetLoadError(`piece ${contract.node} geometry/material`);
    }
    const colours = source.getVerticesData(VertexBuffer.ColorKind);
    if (colours === null || colours.length !== contract.vertexCount * 4 ||
        colours.some((value, index) => !Number.isFinite(value) || value < 0 || value > 1 ||
          (index % 4 === 3 && !close(value, 1)))) {
      throw new RoomAssetLoadError(`piece ${contract.node} vertex colour`);
    }
    identityTransform(source, `piece ${contract.node}`);
    const box = source.getBoundingInfo().boundingBox;
    if (!vectorMatches(box.minimum, contract.bounds.min) || !vectorMatches(box.maximum, contract.bounds.max)) {
      throw new RoomAssetLoadError(`piece ${contract.node} bounds`);
    }
    source.isVisible = false;
    mesh.isPickable = false;
    mesh.receiveShadows = false;
    pieces.set(contract.name, mesh as Mesh);
  }
  const materials = new Map<RoomMaterialRole, Material>();
  for (const role of [
    "floor_current", "stone_current", "wood_current", "metal_current", "overburden_current",
  ] as const) {
    materials.set(role, uniqueByName(container.materials, role, `material ${role}`));
  }
  type AuthoredPbrMaterial = Material & {
    albedoTexture?: unknown; bumpTexture?: unknown; metallicTexture?: unknown;
  };
  const authoredTextures = ["floor_current", "stone_current", "wood_current", "overburden_current"]
    .flatMap((role) => {
      const material = materials.get(role as RoomMaterialRole) as AuthoredPbrMaterial;
      return [material.albedoTexture, material.bumpTexture, material.metallicTexture];
    });
  if (authoredTextures.some((texture) => texture === null || texture === undefined ||
      !container.textures.includes(texture as never)) || new Set(authoredTextures).size !== authoredTextures.length) {
    throw new RoomAssetLoadError("material texture closure");
  }
  const metal = materials.get("metal_current") as AuthoredPbrMaterial;
  if (metal.albedoTexture != null || metal.bumpTexture != null || metal.metallicTexture != null) {
    throw new RoomAssetLoadError("material metal_current texture closure");
  }
  const socket = uniqueByName(container.transformNodes, "SOCKET_torch_flame", "torch socket");
  const socketContract = sidecar.sockets[0];
  if (socket.parent !== pieces.get("torch_bracket") || !vectorMatches(socket.position, socketContract.translation) ||
      !vectorMatches(socket.scaling, [1, 1, 1])) throw new RoomAssetLoadError("torch socket transform");
  const rotation = socket.rotationQuaternion;
  if (rotation === null || !close(rotation.x, socketContract.rotation[0]) ||
      !close(rotation.y, socketContract.rotation[1]) || !close(rotation.z, socketContract.rotation[2]) ||
      !close(rotation.w, socketContract.rotation[3])) throw new RoomAssetLoadError("torch socket rotation");
  return { pieces, materials, socket };
}

async function compileInstanceMaterials(
  pieces: ReadonlyMap<RoomPieceName, Mesh>, signal: AbortSignal,
): Promise<void> {
  const compile = new Map<Material, Mesh>();
  for (const source of pieces.values()) {
    if (source.material !== null && !compile.has(source.material)) compile.set(source.material, source);
  }
  let timeout: ReturnType<typeof globalThis.setTimeout> | undefined;
  let rejectAbort: ((error: Error) => void) | null = null;
  const stopped = new Promise<never>((_resolve, reject) => {
    rejectAbort = reject;
    timeout = globalThis.setTimeout(() => reject(new RoomAssetLoadError("material compile timeout")),
      MATERIAL_COMPILE_TIMEOUT_MS);
  });
  const abort = (): void => rejectAbort?.(new RoomAssetLoadError("abort"));
  signal.addEventListener("abort", abort, { once: true });
  try {
    if (signal.aborted) throw new RoomAssetLoadError("abort");
    await Promise.race([
      Promise.all([...compile].map(([material, source]) =>
        material.forceCompilationAsync(source, { useInstances: true }))),
      stopped,
    ]);
  } finally {
    if (timeout !== undefined) globalThis.clearTimeout(timeout);
    signal.removeEventListener("abort", abort);
  }
}

class LoadedRoomAsset implements RoomAsset {
  readonly sidecar: RoomAssetSidecar;
  readonly container: AssetContainer;
  readonly pieces: ReadonlyMap<RoomPieceName, Mesh>;
  readonly materials: ReadonlyMap<RoomMaterialRole, Material>;
  readonly socket: TransformNode;
  #disposed = false;

  constructor(container: AssetContainer, sidecar: RoomAssetSidecar,
    validated: ReturnType<typeof validateContainer>) {
    this.container = container;
    this.sidecar = sidecar;
    this.pieces = validated.pieces;
    this.materials = validated.materials;
    this.socket = validated.socket;
  }

  get disposed(): boolean { return this.#disposed; }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.container.dispose();
  }
}

export async function loadRoomAsset(
  scene: Scene,
  signal: AbortSignal,
  fetcher: RoomAssetFetcher = fetch,
  loadContainer: RoomContainerLoader = LoadAssetContainerAsync,
): Promise<RoomAsset> {
  let container: AssetContainer | null = null;
  try {
    if (signal.aborted) throw new RoomAssetLoadError("abort");
    const sidecarBytes = await fetchBounded(fetcher, SIDECAR_URL, "application/json", MAX_SIDECAR_BYTES, signal);
    if (await digest(sidecarBytes) !== requirePin(ROOM_SIDECAR_SHA256, "sidecar")) {
      throw new RoomAssetLoadError("sidecar hash");
    }
    const sidecar = parseRoomAssetSidecar(sidecarBytes);
    if (sidecar.fixtureId !== ROOM_FIXTURE_ID ||
        sidecar.buildInputsSha256 !== requirePin(ROOM_BUILD_INPUTS_SHA256, "build inputs") ||
        sidecar.glbSha256 !== requirePin(ROOM_GLB_SHA256, "GLB")) {
      throw new RoomAssetLoadError("sidecar identity");
    }
    const glbBytes = await fetchBounded(fetcher, GLB_URL, "model/gltf-binary", MAX_GLB_BYTES, signal);
    if (glbBytes.byteLength < 12 || glbBytes[0] !== 0x67 || glbBytes[1] !== 0x6c ||
        glbBytes[2] !== 0x54 || glbBytes[3] !== 0x46 ||
        new DataView(glbBytes.buffer, glbBytes.byteOffset, glbBytes.byteLength).getUint32(4, true) !== 2) {
      throw new RoomAssetLoadError("GLB magic/version");
    }
    if (sidecarBytes.byteLength + glbBytes.byteLength > ROOM_MAX_PAYLOAD_BYTES ||
        sidecar.payloadBytes !== sidecarBytes.byteLength + glbBytes.byteLength) {
      throw new RoomAssetLoadError("payload length");
    }
    if (await digest(glbBytes) !== ROOM_GLB_SHA256) throw new RoomAssetLoadError("GLB hash");
    if (signal.aborted) throw new RoomAssetLoadError("abort");
    container = await loadContainer(glbBytes, scene, { pluginExtension: ".glb", name: "room_slice.glb" });
    if (signal.aborted) throw new RoomAssetLoadError("abort");
    const validated = validateContainer(container, sidecar);
    // WebGPU records instance bundles against scene-owned source geometry and
    // materials.  The validated source meshes stay enabled but hidden and
    // non-pickable; attaching the closed container registers their resources
    // without adding any disclosed spatial presence.
    container.addAllToScene();
    await compileInstanceMaterials(validated.pieces, signal);
    if (signal.aborted) throw new RoomAssetLoadError("abort");
    const result = new LoadedRoomAsset(container, sidecar, validated);
    container = null;
    return result;
  } catch (error) {
    container?.dispose();
    if (error instanceof RoomAssetLoadError) throw error;
    throw new RoomAssetLoadError(signal.aborted ? "abort" : "load", {
      cause: error instanceof Error ? error : new Error(String(error)),
    });
  }
}
