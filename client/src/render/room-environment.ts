import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight.js";
import { PointLight } from "@babylonjs/core/Lights/pointLight.js";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import "@babylonjs/core/Meshes/instancedMesh.js";
import type { InstancedMesh } from "@babylonjs/core/Meshes/instancedMesh.js";
import type { Material } from "@babylonjs/core/Materials/material.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Scene } from "@babylonjs/core/scene.js";
import {
  FURNITURE_DOOR, FURNITURE_DOOR_OPEN, FURNITURE_DOOR_SHUT, FURNITURE_TORCH,
  MAP_OPEN, MAP_SOLID, TORCH_FACE_POS_X, TORCH_FACE_POS_Y,
} from "../protocol/abi.generated.js";
import type { RendererDebugRegistry } from "./debug.js";
import type { PresentationFurniture, PresentationSnapshot } from "./presentation.js";
import type { RoomPieceName } from "./room-asset-contract.js";
import type { RoomAsset } from "./room-assets.js";

const MAX_TORCH_LIGHTS = 8;
const QUARTER_TURN = Math.PI / 2;

export type RoomEnvironmentCounts = Readonly<{
  geometry: number;
  furniture: number;
  instances: number;
  lights: number;
  shadowCasters: number;
  triangles: number;
}>;

type SpatialInstance = Readonly<{
  key: string;
  semanticKey: string;
  piece: RoomPieceName;
  mesh: InstancedMesh;
  current: boolean;
  furniture: boolean;
}>;

const tileIndex = (cols: number, tx: number, ty: number): number => ty * cols + tx;

export function chooseRoomFloor(seed: number, tx: number, ty: number): "floor_a" | "floor_b" {
  const value = (seed + Math.imul(tx, 0x9e3779b1) + Math.imul(ty, 0x85ebca6b)) >>> 0;
  return (Math.imul(value, 0xc2b2ae35) >>> 0) & 1 ? "floor_b" : "floor_a";
}

export type RoomBoundaryWallSelection = Readonly<{
  piece: "wall_straight";
  quarterTurns: 0 | 1;
  offsetX: -0.5 | 0 | 0.5;
  offsetZ: -0.5 | 0 | 0.5;
}>;

const inMap = (snapshot: PresentationSnapshot, tx: number, ty: number): boolean =>
  tx >= 0 && ty >= 0 && tx < snapshot.mapCols && ty < snapshot.mapRows;

function publishedDoorCells(snapshot: PresentationSnapshot): ReadonlySet<string> {
  return new Set(snapshot.furniture.filter((item) => item.kind === FURNITURE_DOOR &&
    item.key === `${item.kind}:${item.tx}:${item.ty}` && inMap(snapshot, item.tx, item.ty))
    .map((item) => `${item.tx}:${item.ty}`));
}

/**
 * The map's solid cells are masonry volume, not a graph whose centres are wall
 * axes. Render only disclosed solid/open interfaces. Adjacent one-tile faces
 * meet at integer grid vertices, so a corner is closed by construction rather
 * than by guessing an L/T silhouette from the solid cells behind it.
 */
export function chooseRoomBoundaryWalls(
  snapshot: PresentationSnapshot, tx: number, ty: number,
): readonly RoomBoundaryWallSelection[] {
  if (!inMap(snapshot, tx, ty)) return Object.freeze([]);
  const at = tileIndex(snapshot.mapCols, tx, ty);
  const doors = publishedDoorCells(snapshot);
  if ((snapshot.vis[at] !== 1 && snapshot.vis[at] !== 2) ||
      snapshot.map[at] !== MAP_SOLID || doors.has(`${tx}:${ty}`)) return Object.freeze([]);
  const open = (x: number, y: number): boolean => {
    if (!inMap(snapshot, x, y) || doors.has(`${x}:${y}`)) return false;
    const index = tileIndex(snapshot.mapCols, x, y);
    return (snapshot.vis[index] === 1 || snapshot.vis[index] === 2) && snapshot.map[index] === MAP_OPEN;
  };
  const walls: RoomBoundaryWallSelection[] = [];
  if (open(tx, ty - 1)) walls.push(Object.freeze({
    piece: "wall_straight", quarterTurns: 0, offsetX: 0, offsetZ: -0.5,
  }));
  if (open(tx + 1, ty)) walls.push(Object.freeze({
    piece: "wall_straight", quarterTurns: 1, offsetX: 0.5, offsetZ: 0,
  }));
  if (open(tx, ty + 1)) walls.push(Object.freeze({
    piece: "wall_straight", quarterTurns: 0, offsetX: 0, offsetZ: 0.5,
  }));
  if (open(tx - 1, ty)) walls.push(Object.freeze({
    piece: "wall_straight", quarterTurns: 1, offsetX: -0.5, offsetZ: 0,
  }));
  return Object.freeze(walls);
}

function doorQuarterTurns(snapshot: PresentationSnapshot, item: PresentationFurniture): 0 | 1 {
  const doors = publishedDoorCells(snapshot);
  const door = (x: number, y: number): boolean => doors.has(`${x}:${y}`);
  if (door(item.tx - 1, item.ty) || door(item.tx + 1, item.ty)) return 0;
  if (door(item.tx, item.ty - 1) || door(item.tx, item.ty + 1)) return 1;
  const solid = (x: number, y: number): boolean => inMap(snapshot, x, y) &&
    snapshot.map[tileIndex(snapshot.mapCols, x, y)] === MAP_SOLID && !door(x, y);
  const horizontal = Number(solid(item.tx - 1, item.ty)) + Number(solid(item.tx + 1, item.ty));
  const vertical = Number(solid(item.tx, item.ty - 1)) + Number(solid(item.tx, item.ty + 1));
  if (vertical > horizontal) return 1;
  return 0;
}

export class RoomEnvironmentPresentation {
  readonly #scene: Scene;
  readonly #debug: RendererDebugRegistry;
  readonly #asset: RoomAsset;
  readonly #seed: number;
  readonly #key: DirectionalLight;
  readonly #shadows: ShadowGenerator;
  readonly #remembered = new Set<Material>();
  readonly #rememberedSources = new Map<RoomPieceName, Mesh>();
  readonly #geometry: SpatialInstance[] = [];
  readonly #furniture: SpatialInstance[] = [];
  readonly #torchLights: PointLight[] = [];
  readonly #torchFlames: Mesh[] = [];
  readonly #flameMaterial: StandardMaterial;
  readonly #shadowCasters = new Set<AbstractMesh>();
  readonly #pickKeys = new Set<string>();
  readonly #furnitureKeys = new Set<string>();
  #geometryRevision = "";
  #furnitureRevision = "";
  #disposed = false;

  constructor(scene: Scene, debug: RendererDebugRegistry, asset: RoomAsset, fixtureSeed = 1592594996) {
    this.#scene = scene;
    this.#debug = debug;
    this.#asset = asset;
    this.#seed = fixtureSeed >>> 0;
    this.#flameMaterial = new StandardMaterial("room:torch-flame-material", scene);
    this.#flameMaterial.diffuseColor = Color3.Black();
    this.#flameMaterial.emissiveColor = new Color3(1, 0.12, 0.015);
    this.#flameMaterial.specularColor = Color3.Black();
    this.#flameMaterial.disableLighting = true;
    let key: DirectionalLight | null = null;
    let shadows: ShadowGenerator | null = null;
    try {
      for (const piece of ["floor_a", "floor_b", "wall_straight", "wall_inside", "wall_outside", "wall_end"] as const) {
        const source = asset.pieces.get(piece);
        const sourceMaterial = source?.material;
        const remembered = sourceMaterial?.clone(`room:${piece}:remembered`);
        if (remembered === undefined || remembered === null) throw new Error(`room material cannot clone remembered ${piece}`);
        remembered.alpha = 0.42;
        this.#remembered.add(remembered);
        const clone = source?.clone(`room:source:${piece}:remembered`, null, false);
        if (clone === undefined || clone === null) throw new Error(`room asset cannot clone remembered ${piece}`);
        clone.material = remembered;
        clone.isVisible = false;
        clone.isPickable = false;
        clone.receiveShadows = false;
        clone.setEnabled(true);
        this.#rememberedSources.set(piece, clone);
      }
      // The direction and mount remain the authored upper-right shadow axis.
      // Generator-v4's concept review changed only its response: a warm diffuse
      // key, restrained specular and a small intensity lift let the new umber
      // masonry separate without turning the room into a uniformly bright box.
      key = new DirectionalLight("room:directional-key", new Vector3(-0.45, -1, -0.35), scene);
      key.position = new Vector3(12, 24, 16);
      key.diffuse = new Color3(1, 0.68, 0.42);
      key.specular = new Color3(0.36, 0.23, 0.15);
      key.intensity = 1.28;
      shadows = new ShadowGenerator(1024, key);
      shadows.useBlurExponentialShadowMap = true;
    } catch (error) {
      shadows?.dispose();
      key?.dispose();
      for (const source of this.#rememberedSources.values()) source.dispose();
      this.#rememberedSources.clear();
      for (const material of this.#remembered) material.dispose();
      this.#remembered.clear();
      this.#flameMaterial.dispose();
      throw error;
    }
    this.#key = key;
    this.#shadows = shadows;
    this.#publishDebug();
  }

  get shadowGenerator(): ShadowGenerator { return this.#shadows; }

  async prepare(signal: AbortSignal): Promise<void> {
    this.#assertLive();
    const sources = [...this.#rememberedSources.values()];
    if (sources.length === 0) throw new Error("room remembered material lacks a source");
    if (signal.aborted) throw new Error("room material preparation aborted");
    await new Promise<void>((resolve, reject) => {
      const abort = (): void => reject(new Error("room material preparation aborted"));
      signal.addEventListener("abort", abort, { once: true });
      Promise.all(sources.map((source) => source.material?.forceCompilationAsync(source, { useInstances: true }))).then(() => resolve(), reject).finally(() => {
        signal.removeEventListener("abort", abort);
      });
    });
  }

  authoredFrameReady(): boolean {
    const entries = [...this.#geometry, ...this.#furniture];
    return entries.length > 0 && entries.every((entry) => entry.mesh.isReady(true));
  }

  acceptSnapshot(snapshot: PresentationSnapshot): void {
    this.#assertLive();
    const geometryRevision = `${snapshot.epoch}:${snapshot.mapCols}:${snapshot.mapRows}:${snapshot.tileSize}:${snapshot.mapRevision}:${snapshot.visRevision}`;
    const decorations = (snapshot as PresentationSnapshot & { roomDecorations?: readonly unknown[] }).roomDecorations;
    const decorationRevision = Array.isArray(decorations) ? decorations.map((value) => {
      if (value === null || typeof value !== "object") return "invalid";
      const item = value as Record<string, unknown>;
      return `${String(item.key)}:${String(item.piece)}:${String(item.tx)}:${String(item.ty)}:${String(item.quarterTurns)}`;
    }).join("|") : "";
    const furnitureRevision = `${geometryRevision}:${snapshot.furnitureRevision}:${decorationRevision}`;
    const geometryChanged = geometryRevision !== this.#geometryRevision;
    const furnitureChanged = furnitureRevision !== this.#furnitureRevision;
    if (!geometryChanged && !furnitureChanged) return;
    if (geometryChanged) {
      this.#clearGeometry();
      for (let ty = 0; ty < snapshot.mapRows; ty++) for (let tx = 0; tx < snapshot.mapCols; tx++) {
        const at = tileIndex(snapshot.mapCols, tx, ty);
        const visibility = snapshot.vis[at];
        const map = snapshot.map[at];
        if ((visibility !== 1 && visibility !== 2) || (map !== MAP_OPEN && map !== MAP_SOLID)) continue;
        const current = visibility === 2;
        const semanticKey = `tile:${tx}:${ty}`;
        this.#add(this.#geometry, `${semanticKey}:floor`, semanticKey,
          chooseRoomFloor(this.#seed, tx, ty), tx, ty, 0, current, false, current);
        if (map === MAP_SOLID) {
          for (const wall of chooseRoomBoundaryWalls(snapshot, tx, ty)) {
            const suffix = `${wall.offsetX}:${wall.offsetZ}`;
            this.#add(this.#geometry, `${semanticKey}:wall:${suffix}`, semanticKey,
              wall.piece, tx, ty, wall.quarterTurns, current, false, false,
              wall.offsetX, wall.offsetZ);
          }
        }
      }
      this.#geometryRevision = geometryRevision;
    }
    if (furnitureChanged) {
      this.#clearFurniture();
      const furniture = [...snapshot.furniture].sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
      for (const item of furniture) this.#addFurniture(snapshot, item);
      this.#addDecorations(snapshot);
      this.#furnitureRevision = furnitureRevision;
    }
    this.#publishDebug();
  }

  counts(): RoomEnvironmentCounts {
    const geometry = this.#geometry.length;
    const furniture = this.#furnitureKeys.size;
    let triangles = 0;
    for (const entry of [...this.#geometry, ...this.#furniture]) {
      triangles += this.#asset.sidecar.pieces.find((piece) => piece.name === entry.piece)?.triangleCount ?? 0;
    }
    return Object.freeze({
      geometry, furniture, instances: this.#geometry.length + this.#furniture.length,
      lights: 1 + this.#torchLights.length, shadowCasters: this.#shadowCasters.size, triangles,
    });
  }

  keys(): readonly string[] { return Object.freeze([...this.#geometry, ...this.#furniture].map((entry) => entry.key)); }

  reset(): void {
    this.#assertLive();
    this.#clearGeometry();
    this.#clearFurniture();
    this.#geometryRevision = "";
    this.#furnitureRevision = "";
    this.#publishDebug();
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#clearGeometry();
    this.#clearFurniture();
    this.#shadows.dispose();
    this.#key.dispose();
    for (const source of this.#rememberedSources.values()) source.dispose();
    this.#rememberedSources.clear();
    for (const material of this.#remembered) material.dispose();
    this.#remembered.clear();
    this.#flameMaterial.dispose();
    this.#debug.removeOwner("room-environment");
    this.#disposed = true;
  }

  #addFurniture(snapshot: PresentationSnapshot, item: PresentationFurniture): void {
    if (item.tx < 0 || item.ty < 0 || item.tx >= snapshot.mapCols || item.ty >= snapshot.mapRows) return;
    const at = tileIndex(snapshot.mapCols, item.tx, item.ty);
    if (snapshot.vis[at] !== 2 || (snapshot.map[at] !== MAP_OPEN && snapshot.map[at] !== MAP_SOLID) ||
        item.key !== `${item.kind}:${item.tx}:${item.ty}`) return;
    if (item.kind === FURNITURE_DOOR && (item.state === FURNITURE_DOOR_SHUT || item.state === FURNITURE_DOOR_OPEN)) {
      const semanticKey = `furniture:${item.key}`;
      this.#furnitureKeys.add(semanticKey);
      const turns = doorQuarterTurns(snapshot, item);
      const frameOffsets = turns === 0
        ? [[0, -0.5], [0, 0.5]] as const
        : [[-0.5, 0], [0.5, 0]] as const;
      for (const [index, [offsetX, offsetZ]] of frameOffsets.entries()) {
        this.#add(this.#furniture, `${semanticKey}:frame:${index}`, semanticKey,
          "door_frame", item.tx, item.ty, turns, true, true, true, offsetX, offsetZ);
      }
      this.#add(this.#furniture, `${semanticKey}:leaf`, semanticKey, "door_leaf", item.tx, item.ty,
        turns + (item.state === FURNITURE_DOOR_OPEN ? 1 : 0), true, true, false);
      return;
    }
    if (item.kind !== FURNITURE_TORCH || (item.state !== TORCH_FACE_POS_X && item.state !== TORCH_FACE_POS_Y)) return;
    const turns = item.state === TORCH_FACE_POS_Y ? 1 : 0;
    const semanticKey = `furniture:${item.key}`;
    this.#furnitureKeys.add(semanticKey);
    const bracket = this.#add(this.#furniture, `${semanticKey}:bracket`, semanticKey,
      "torch_bracket", item.tx, item.ty, turns, true, true, true);
    const local = this.#asset.socket.position;
    const c = Math.cos(turns * QUARTER_TURN), s = Math.sin(turns * QUARTER_TURN);
    const position = new Vector3(
      bracket.position.x + local.x * c + local.z * s,
      bracket.position.y + local.y,
      bracket.position.z - local.x * s + local.z * c,
    );
    const flame = MeshBuilder.CreateSphere(`room:torch:${item.key}:flame`, {
      diameter: 0.11, segments: 6,
    }, this.#scene);
    flame.position.copyFrom(position);
    flame.material = this.#flameMaterial;
    flame.isPickable = false;
    flame.receiveShadows = false;
    this.#torchFlames.push(flame);
    if (this.#torchLights.length >= MAX_TORCH_LIGHTS) return;
    const light = new PointLight(`room:torch:${item.key}`, position, this.#scene);
    // The pool is broader than the bulb: the concept uses local orange light
    // to reveal nearby masonry, while the warm key carries the room beyond it.
    light.diffuse = new Color3(1, 0.25, 0.045);
    light.specular = new Color3(0.42, 0.18, 0.055);
    light.intensity = 1.15;
    light.range = 8.5;
    this.#torchLights.push(light);
  }

  #addDecorations(snapshot: PresentationSnapshot): void {
    const candidate = snapshot as PresentationSnapshot & { roomDecorations?: readonly unknown[] };
    if (!Array.isArray(candidate.roomDecorations)) return;
    for (const unknown of candidate.roomDecorations) {
      if (unknown === null || typeof unknown !== "object") continue;
      const item = unknown as Record<string, unknown>;
      const piece = item.piece;
      if (piece !== "decal_rubble" && piece !== "decal_root" && piece !== "prop_barrel") continue;
      if (typeof item.key !== "string" || !new RegExp(`^${piece}:[0-9]+$`).test(item.key)) continue;
      const tx = item.tx, ty = item.ty, turns = item.quarterTurns;
      if (!Number.isSafeInteger(tx) || !Number.isSafeInteger(ty) ||
          (turns !== 0 && turns !== 1 && turns !== 2 && turns !== 3)) continue;
      const x = tx as number, y = ty as number;
      if (x < 0 || y < 0 || x >= snapshot.mapCols || y >= snapshot.mapRows) continue;
      const at = tileIndex(snapshot.mapCols, x, y);
      if (snapshot.vis[at] !== 2 || snapshot.map[at] !== MAP_OPEN) continue;
      const semanticKey = `furniture:${item.key}`;
      this.#furnitureKeys.add(semanticKey);
      this.#add(this.#furniture, semanticKey, semanticKey, piece, x, y, turns, true, true, true);
    }
  }

  #add(target: SpatialInstance[], key: string, semanticKey: string, piece: RoomPieceName,
    tx: number, ty: number, turns: number, current: boolean, furniture: boolean, pickable: boolean,
    offsetX = 0, offsetZ = 0): InstancedMesh {
    const source = current ? this.#asset.pieces.get(piece) : this.#rememberedSources.get(piece);
    if (source === undefined) throw new Error(`room asset lacks ${piece}`);
    const allowed = this.#asset.sidecar.pieces.find((entry) => entry.name === piece)?.allowedQuarterTurns;
    const quarterTurns = ((turns % 4) + 4) % 4 as 0 | 1 | 2 | 3;
    if (allowed === undefined || !allowed.includes(quarterTurns)) throw new Error(`${piece} rejects quarter turn ${quarterTurns}`);
    const mesh = source.createInstance(`room:${key}`);
    mesh.position.set((tx + 0.5 + offsetX) * this.#asset.sidecar.coordinates.tileSize, 0,
      (ty + 0.5 + offsetZ) * this.#asset.sidecar.coordinates.tileSize);
    mesh.rotation.y = quarterTurns * QUARTER_TURN;
    mesh.isVisible = true;
    mesh.isPickable = pickable;
    if (pickable) {
      mesh.metadata = furniture
        ? Object.freeze({ presentationKind: "furniture", furnitureKey: semanticKey.slice("furniture:".length) })
        : Object.freeze({ presentationKind: "tile", tx, ty });
      this.#pickKeys.add(semanticKey);
    }
    target.push(Object.freeze({ key, semanticKey, piece, mesh, current, furniture }));
    if (current) {
      this.#shadowCasters.add(mesh);
      this.#shadows.addShadowCaster(mesh, false);
    }
    return mesh;
  }

  #disposeEntries(entries: SpatialInstance[]): void {
    for (const entry of entries.splice(0)) {
      this.#shadows.removeShadowCaster(entry.mesh, false);
      entry.mesh.dispose();
      this.#pickKeys.delete(entry.semanticKey);
    }
  }

  #clearGeometry(): void {
    this.#disposeEntries(this.#geometry);
  }

  #clearFurniture(): void {
    for (const flame of this.#torchFlames.splice(0)) flame.dispose();
    for (const light of this.#torchLights.splice(0)) light.dispose();
    this.#disposeEntries(this.#furniture);
    this.#furnitureKeys.clear();
    this.#shadowCasters.clear();
    for (const entry of this.#geometry) if (entry.current) this.#shadowCasters.add(entry.mesh);
  }

  #publishDebug(): void {
    const counts = this.counts();
    const sourceGroups = new Set([...this.#geometry, ...this.#furniture].map((entry) => entry.mesh.sourceMesh.name));
    const flameTriangles = this.#torchFlames.reduce((sum, flame) => sum + flame.getTotalIndices() / 3, 0);
    this.#debug.replaceOwnerCounts("room-environment", {
      scene: { meshes: this.#torchFlames.length, instances: counts.instances,
        draws: sourceGroups.size + this.#torchFlames.length,
        triangles: counts.triangles + flameTriangles, lights: counts.lights, shadowCasters: counts.shadowCasters },
      visibility: { geometry: counts.geometry, furniture: counts.furniture,
        effects: this.#torchFlames.length, picking: this.#pickKeys.size, debug: this.#pickKeys.size },
    });
  }

  #assertLive(): void { if (this.#disposed) throw new Error("room environment is disposed"); }
}

export function createRoomEnvironmentPresentation(
  scene: Scene, debug: RendererDebugRegistry, asset: RoomAsset, fixtureSeed?: number,
): RoomEnvironmentPresentation {
  return new RoomEnvironmentPresentation(scene, debug, asset, fixtureSeed);
}
