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
  return new Set(snapshot.furniture.filter((item) => {
    if (item.kind !== FURNITURE_DOOR ||
        (item.state !== FURNITURE_DOOR_SHUT && item.state !== FURNITURE_DOOR_OPEN) ||
        item.key !== `${item.kind}:${item.tx}:${item.ty}` ||
        !inMap(snapshot, item.tx, item.ty)) return false;
    return snapshot.vis[tileIndex(snapshot.mapCols, item.tx, item.ty)] === 2;
  }).map((item) => `${item.tx}:${item.ty}`));
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

export type RoomCutawayWallRun = Readonly<{
  piece: "wall_straight";
  quarterTurns: 0 | 1;
  tx: number;
  ty: number;
  length: number;
  current: boolean;
}>;

/**
 * Collapse the only two faces this isometric camera can see into maximal runs.
 *
 * The camera looks down the map's +X/+Y diagonal, matching the Canvas
 * `wallBlock` authority and the dungeon torch publication: a solid cell may
 * expose its east (+X) and south (+Y) faces only. Emitting north/west faces made
 * the irregular live dungeon read as a picket fence. Merging collinear segments
 * also prevents authored end profiles from repeating once per map tile.
 */
export function chooseRoomCutawayWallRuns(
  snapshot: PresentationSnapshot,
): readonly RoomCutawayWallRun[] {
  const doors = publishedDoorCells(snapshot);
  const disclosed = (x: number, y: number): boolean => {
    if (!inMap(snapshot, x, y)) return false;
    const visibility = snapshot.vis[tileIndex(snapshot.mapCols, x, y)];
    return visibility === 1 || visibility === 2;
  };
  const solid = (x: number, y: number): boolean => disclosed(x, y) &&
    snapshot.map[tileIndex(snapshot.mapCols, x, y)] === MAP_SOLID &&
    !doors.has(`${x}:${y}`);
  const open = (x: number, y: number): boolean => disclosed(x, y) &&
    snapshot.map[tileIndex(snapshot.mapCols, x, y)] === MAP_OPEN &&
    !doors.has(`${x}:${y}`);
  const current = (x: number, y: number): boolean =>
    snapshot.vis[tileIndex(snapshot.mapCols, x, y)] === 2;
  const runs: RoomCutawayWallRun[] = [];

  for (let ty = 0; ty < snapshot.mapRows; ty++) {
    let tx = 0;
    while (tx < snapshot.mapCols) {
      if (!solid(tx, ty) || !open(tx, ty + 1)) { tx++; continue; }
      const start = tx;
      const isCurrent = current(tx, ty);
      while (tx < snapshot.mapCols && solid(tx, ty) && open(tx, ty + 1) &&
             current(tx, ty) === isCurrent) tx++;
      runs.push(Object.freeze({
        piece: "wall_straight", quarterTurns: 0, tx: start, ty,
        length: tx - start, current: isCurrent,
      }));
    }
  }
  for (let tx = 0; tx < snapshot.mapCols; tx++) {
    let ty = 0;
    while (ty < snapshot.mapRows) {
      if (!solid(tx, ty) || !open(tx + 1, ty)) { ty++; continue; }
      const start = ty;
      const isCurrent = current(tx, ty);
      while (ty < snapshot.mapRows && solid(tx, ty) && open(tx + 1, ty) &&
             current(tx, ty) === isCurrent) ty++;
      runs.push(Object.freeze({
        piece: "wall_straight", quarterTurns: 1, tx, ty: start,
        length: ty - start, current: isCurrent,
      }));
    }
  }
  return Object.freeze(runs);
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

export type RoomDoorRun = Readonly<{
  quarterTurns: 0 | 1;
  tx: number;
  ty: number;
  length: number;
  state: typeof FURNITURE_DOOR_SHUT | typeof FURNITURE_DOOR_OPEN;
  keys: readonly string[];
}>;

/**
 * The ABI publishes one door record per tile, while the dungeon owns one
 * doorway spanning up to a corridor width. Reconstruct that architectural span
 * before instancing: repeating a complete frame per record makes a continuous
 * doorway look like an arcade.
 */
export function chooseRoomDoorRuns(snapshot: PresentationSnapshot): readonly RoomDoorRun[] {
  const published = publishedDoorCells(snapshot);
  const doors = snapshot.furniture.filter((item): item is PresentationFurniture & {
    state: typeof FURNITURE_DOOR_SHUT | typeof FURNITURE_DOOR_OPEN;
  } => item.kind === FURNITURE_DOOR && published.has(item.tx + ":" + item.ty) &&
    (item.state === FURNITURE_DOOR_SHUT || item.state === FURNITURE_DOOR_OPEN))
    .sort((a, b) => a.ty - b.ty || a.tx - b.tx || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const byCell = new Map(doors.map((item) => [item.tx + ":" + item.ty, item]));
  const claimed = new Set<string>();
  const same = (x: number, y: number, state: number): boolean => {
    const item = byCell.get(x + ":" + y);
    return item !== undefined && item.state === state && !claimed.has(item.key);
  };
  const runs: RoomDoorRun[] = [];
  for (const item of doors) {
    if (claimed.has(item.key)) continue;
    let quarterTurns: 0 | 1;
    if (same(item.tx - 1, item.ty, item.state) || same(item.tx + 1, item.ty, item.state)) {
      quarterTurns = 0;
    } else if (same(item.tx, item.ty - 1, item.state) || same(item.tx, item.ty + 1, item.state)) {
      quarterTurns = 1;
    } else {
      quarterTurns = doorQuarterTurns(snapshot, item);
    }
    let tx = item.tx, ty = item.ty;
    const dx = quarterTurns === 0 ? 1 : 0;
    const dy = quarterTurns === 1 ? 1 : 0;
    while (same(tx - dx, ty - dy, item.state)) { tx -= dx; ty -= dy; }
    const keys: string[] = [];
    let x = tx, y = ty;
    while (same(x, y, item.state)) {
      const member = byCell.get(x + ":" + y);
      if (member === undefined) break;
      claimed.add(member.key);
      keys.push(member.key);
      x += dx; y += dy;
    }
    runs.push(Object.freeze({
      quarterTurns, tx, ty, length: keys.length, state: item.state,
      keys: Object.freeze(keys),
    }));
  }
  return Object.freeze(runs);
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
        // Remembered floors recede into fog, but masonry must keep an opaque
        // silhouette. Alpha-blended coursing turned every dark mortar gap into
        // a hole and made contiguous live contours read as lintels and posts.
        remembered.alpha = piece.startsWith("wall_") ? 1 : 0.42;
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
    const geometryRevision = `${snapshot.epoch}:${snapshot.mapCols}:${snapshot.mapRows}:${snapshot.tileSize}:${snapshot.mapRevision}:${snapshot.visRevision}:${snapshot.furnitureRevision}`;
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
      }
      const cutawayRuns = chooseRoomCutawayWallRuns(snapshot);
      for (const run of cutawayRuns) {
        // A one-edge contour is a stair-step artifact of the dungeon mask. At
        // this camera it reads as an isolated post, not enclosure; the floor
        // edge remains the cutaway boundary and explicit doors remain framed.
        if (run.length === 1) continue;
        for (let segment = 0; segment < run.length; segment++) {
          const tx = run.tx + (run.quarterTurns === 0 ? segment : 0);
          const ty = run.ty + (run.quarterTurns === 1 ? segment : 0);
          const semanticKey = `tile:${tx}:${ty}`;
          const offsetX = run.quarterTurns === 1 ? 0.5 : 0;
          const offsetZ = run.quarterTurns === 0 ? 0.5 : 0;
          this.#add(this.#geometry,
            `${semanticKey}:wall-run:${run.quarterTurns}:${run.tx}:${run.ty}:${segment}`,
            semanticKey, run.piece, tx, ty, run.quarterTurns, run.current, false, false,
            offsetX, offsetZ);
        }
      }
      this.#geometryRevision = geometryRevision;
    }
    if (furnitureChanged) {
      this.#clearFurniture();
      const furniture = [...snapshot.furniture].sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
      const doorKeys = new Set<string>();
      for (const run of chooseRoomDoorRuns(snapshot)) {
        for (const key of run.keys) doorKeys.add(key);
        this.#addDoorRun(run);
      }
      for (const item of furniture) if (!doorKeys.has(item.key)) this.#addFurniture(snapshot, item);
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

  #addDoorRun(run: RoomDoorRun): void {
    for (const key of run.keys) this.#furnitureKeys.add("furniture:" + key);
    const owner = "furniture:" + run.keys[0];
    const faceOffsetX = run.quarterTurns === 1 ? 0.5 : 0;
    const faceOffsetZ = run.quarterTurns === 0 ? 0.5 : 0;
    if (run.length === 1) {
      this.#add(this.#furniture, owner + ":frame", owner, "door_frame",
        run.tx, run.ty, run.quarterTurns, true, true, true, faceOffsetX, faceOffsetZ);
      this.#add(this.#furniture, owner + ":leaf", owner, "door_leaf",
        run.tx, run.ty, run.quarterTurns + (run.state === FURNITURE_DOOR_OPEN ? 1 : 0),
        true, true, false, faceOffsetX, faceOffsetZ);
      return;
    }

    // A wide doorway is one aperture. Repeat only the seamless lintel at tile
    // frequency, place full-height masonry at its two endpoints, and never put
    // a complete arch around each ABI record.
    for (let segment = 0; segment < run.length; segment++) {
      const tx = run.tx + (run.quarterTurns === 0 ? segment : 0);
      const ty = run.ty + (run.quarterTurns === 1 ? segment : 0);
      const semanticKey = "furniture:" + run.keys[segment];
      const lintel = this.#add(this.#furniture, semanticKey + ":span:lintel:" + segment,
        semanticKey, "wall_straight", tx, ty, run.quarterTurns,
        true, true, true, faceOffsetX, faceOffsetZ);
      lintel.scaling.y = 0.14 / 0.9;
      lintel.position.y = 0.78;
      if (run.state === FURNITURE_DOOR_SHUT) {
        const leafOffsetX = run.quarterTurns === 0 ? -0.5 : 0.5;
        const leafOffsetZ = 0.5;
        const leaf = this.#add(this.#furniture, semanticKey + ":span:leaf:" + segment,
          semanticKey, "door_leaf", tx, ty, run.quarterTurns,
          true, true, false, leafOffsetX, leafOffsetZ);
        leaf.scaling.x = 1 / 0.72;
      }
    }
    for (const end of [0, 1] as const) {
      const tx = run.tx + (run.quarterTurns === 0 && end === 1 ? run.length - 1 : 0);
      const ty = run.ty + (run.quarterTurns === 1 && end === 1 ? run.length - 1 : 0);
      const offsetX = run.quarterTurns === 0 ? (end === 0 ? -0.5 : 0.5) : 0.5;
      const offsetZ = run.quarterTurns === 1 ? (end === 0 ? -0.5 : 0.5) : 0.5;
      const semanticKey = "furniture:" + run.keys[end === 0 ? 0 : run.keys.length - 1];
      const jamb = this.#add(this.#furniture, semanticKey + ":span:jamb:" + end,
        semanticKey, "wall_straight", tx, ty, run.quarterTurns,
        true, true, true, offsetX, offsetZ);
      jamb.scaling.x = 0.14;
    }
  }

  #addFurniture(snapshot: PresentationSnapshot, item: PresentationFurniture): void {
    if (item.tx < 0 || item.ty < 0 || item.tx >= snapshot.mapCols || item.ty >= snapshot.mapRows) return;
    const at = tileIndex(snapshot.mapCols, item.tx, item.ty);
    if (snapshot.vis[at] !== 2 || (snapshot.map[at] !== MAP_OPEN && snapshot.map[at] !== MAP_SOLID) ||
        item.key !== `${item.kind}:${item.tx}:${item.ty}`) return;
    if (item.kind === FURNITURE_DOOR) return;
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
    // glTF sources carry an identity quaternion; Babylon gives it precedence
    // over Euler fields on instances. Clear it before applying semantic turns.
    mesh.rotationQuaternion = null;
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
