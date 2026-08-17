import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight.js";
import { PointLight } from "@babylonjs/core/Lights/pointLight.js";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import "@babylonjs/core/Meshes/instancedMesh.js";
import type { InstancedMesh } from "@babylonjs/core/Meshes/instancedMesh.js";
import type { Material } from "@babylonjs/core/Materials/material.js";
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
import type { PresentationMode } from "./presentation-mode.js";
import { createTorchFlame, type TorchFlamePresentation } from "./room-flame.js";
import { chooseRoomFloorVariant, chooseRoomWallSurfaceVariant } from "./room-material-variants.js";
import { chooseLocalWallCutaways, type RoomProjector } from "./room-occlusion.js";
import { RoomObjectPresentation } from "./room-objects.js";
import type { RoomPieceName } from "./room-asset-contract.js";
import type { RoomAsset } from "./room-assets.js";

const MAX_TORCH_LIGHTS = 8;
const MAX_AMBIENT_DRESSING = 12;
const QUARTER_TURN = Math.PI / 2;
export const ROOM_WALL_HEIGHT = 1.65;

function tuneSurface(material: Material | undefined, colour: Color3, lift = Color3.Black()): void {
  if (material === undefined) return;
  const surface = material as Material & {
    albedoColor?: Color3; diffuseColor?: Color3; emissiveColor?: Color3;
  };
  surface.albedoColor?.copyFrom(colour);
  surface.diffuseColor?.copyFrom(colour);
  surface.emissiveColor?.copyFrom(lift);
}

export type RoomEnvironmentCounts = Readonly<{
  geometry: number;
  furniture: number;
  instances: number;
  lights: number;
  shadowCasters: number;
  triangles: number;
}>;

type SpatialInstance = {
  key: string;
  semanticKey: string;
  piece: RoomPieceName;
  mesh: InstancedMesh;
  current: boolean;
  furniture: boolean;
};

const tileIndex = (cols: number, tx: number, ty: number): number => ty * cols + tx;

export function chooseRoomFloor(seed: number, tx: number, ty: number):
  "floor_a" | "floor_b" | "floor_c" | "floor_d" {
  return chooseRoomFloorVariant(seed, tx, ty).piece;
}

export type RoomAmbientDressing = Readonly<{
  piece: "decal_rubble" | "decal_root" | "prop_barrel";
  tx: number;
  ty: number;
  quarterTurns: 0 | 1 | 2 | 3;
}>;

function roomTileHash(seed: number, tx: number, ty: number, salt: number): number {
  let value = (seed ^ salt ^ Math.imul(tx, 0x9e3779b1) ^ Math.imul(ty, 0x85ebca6b)) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0xc2b2ae35) >>> 0;
  return Math.imul(value ^ (value >>> 13), 0x27d4eb2d) >>> 0;
}

/**
 * Supply sparse authored-kit dressing when a live simulation snapshot has no
 * review-fixture decoration channel. Selection is a pure presentation hash:
 * it never enters the snapshot, picking registry, or authoritative state.
 */
export function chooseRoomAmbientDressing(
  snapshot: PresentationSnapshot, seed: number,
): readonly RoomAmbientDressing[] {
  const occupied = new Set(snapshot.furniture.map((item) => item.tx + ":" + item.ty));
  const currentSolid = (tx: number, ty: number): boolean => inMap(snapshot, tx, ty) &&
    snapshot.vis[tileIndex(snapshot.mapCols, tx, ty)] === 2 &&
    snapshot.map[tileIndex(snapshot.mapCols, tx, ty)] === MAP_SOLID;
  const candidates: Array<RoomAmbientDressing & { score: number; wallAdjacent: boolean }> = [];
  for (let ty = 0; ty < snapshot.mapRows; ty++) for (let tx = 0; tx < snapshot.mapCols; tx++) {
    const at = tileIndex(snapshot.mapCols, tx, ty);
    if (snapshot.vis[at] !== 2 || snapshot.map[at] !== MAP_OPEN ||
        occupied.has(tx + ":" + ty) ||
        snapshot.units.some((unit) => unit.visible &&
          Math.hypot(unit.x - (tx + 0.5), unit.y - (ty + 0.5)) < 1.5)) continue;
    const score = roomTileHash(seed, tx, ty, 0x44524553);
    // The root card and barrel source have useful isolated-review silhouettes,
    // but in the live isometric cutaway they read as a pale floor quadrilateral
    // and an orange dome. Automatic runtime dressing therefore stays on the
    // low-profile rubble source until those two authored meshes are rebuilt.
    const piece = "decal_rubble";
    const wallAdjacent = [[-1, 0], [1, 0], [0, -1], [0, 1]].some(([dx, dy]) =>
      dx !== undefined && dy !== undefined && currentSolid(tx + dx, ty + dy));
    candidates.push({ piece, tx, ty, quarterTurns: ((score >>> 28) & 3) as 0 | 1 | 2 | 3,
      score, wallAdjacent });
  }
  candidates.sort((a, b) => a.score - b.score || a.ty - b.ty || a.tx - b.tx);
  // Tiny disclosed pockets stay uncluttered; each complete ten-tile
  // tranche earns one prop, up to the explicit presentation-only ceiling.
  const count = Math.min(MAX_AMBIENT_DRESSING, Math.floor(candidates.length / 10));
  if (count === 0) return Object.freeze([]);
  const selected: typeof candidates = [];
  for (const candidate of candidates) {
    if (selected.every((item) => Math.abs(item.tx - candidate.tx) +
        Math.abs(item.ty - candidate.ty) >= 3)) selected.push(candidate);
    if (selected.length === count) break;
  }
  return Object.freeze(selected.map(({ score: _score, wallAdjacent: _wall, ...item }) =>
    Object.freeze(item)));
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

export type RoomWallFace = Readonly<{
  key: string;
  tx: number;
  ty: number;
  side: 0 | 1 | 2 | 3;
  visibility: 1 | 2;
}>;

/**
 * Give every disclosed solid/open interface a camera-independent identity.
 * Presentation may soften a face that locally covers the hero, but camera
 * quadrant and visibility band never decide whether architecture exists.
 */
export function chooseRoomWallFaces(
  snapshot: PresentationSnapshot,
): readonly RoomWallFace[] {
  const faces: RoomWallFace[] = [];
  for (let ty = 0; ty < snapshot.mapRows; ty++) for (let tx = 0; tx < snapshot.mapCols; tx++) {
    const visibility = snapshot.vis[tileIndex(snapshot.mapCols, tx, ty)];
    if (visibility !== 1 && visibility !== 2) continue;
    for (const wall of chooseRoomBoundaryWalls(snapshot, tx, ty)) {
      const side: 0 | 1 | 2 | 3 = wall.offsetZ === -0.5 ? 0 :
        wall.offsetX === 0.5 ? 1 : wall.offsetZ === 0.5 ? 2 : 3;
      faces.push(Object.freeze({ key: `wall:${tx}:${ty}:${side}`, tx, ty, side, visibility }));
    }
  }
  return Object.freeze(faces);
}

export type RoomWallModule = RoomWallFace & Readonly<{
  length: 1 | 2 | 3 | 5 | 8;
  piece: "wall_straight" | "wall_run_2" | "wall_run_3" | "wall_run_5" | "wall_run_8";
  surfaceVariant: 0 | 1 | 2 | 3 | 4 | 5;
}>;

/** Greedily pack a contour into authored Fibonacci-length modules without crossing a gap. */
export function chooseRoomWallModules(snapshot: PresentationSnapshot): readonly RoomWallModule[] {
  const remaining = new Map(chooseRoomWallFaces(snapshot).map((face) => [face.key, face]));
  const modules: RoomWallModule[] = [];
  const lengths = [8, 5, 3, 2, 1] as const;
  for (const face of [...remaining.values()].sort((a, b) =>
    a.side - b.side || a.visibility - b.visibility || a.ty - b.ty || a.tx - b.tx)) {
    if (!remaining.has(face.key)) continue;
    const horizontal = face.side === 0 || face.side === 2;
    let selected: 1 | 2 | 3 | 5 | 8 = 1;
    for (const length of lengths) {
      let complete = true;
      for (let offset = 0; offset < length; offset++) {
        const tx = face.tx + (horizontal ? offset : 0);
        const ty = face.ty + (horizontal ? 0 : offset);
        const candidate = remaining.get(`wall:${tx}:${ty}:${face.side}`);
        if (candidate === undefined || candidate.visibility !== face.visibility) complete = false;
      }
      if (complete) { selected = length; break; }
    }
    for (let offset = 0; offset < selected; offset++) {
      const tx = face.tx + (horizontal ? offset : 0);
      const ty = face.ty + (horizontal ? 0 : offset);
      remaining.delete(`wall:${tx}:${ty}:${face.side}`);
    }
    const piece = selected === 1 ? "wall_straight" : `wall_run_${selected}` as const;
    modules.push(Object.freeze({ ...face,
      key: `wall-module:${face.tx}:${face.ty}:${face.side}:${selected}`,
      length: selected, piece,
      surfaceVariant: chooseRoomWallSurfaceVariant(
        (snapshot as PresentationSnapshot & { generatorSeed?: number }).generatorSeed ?? 1592594996,
        face.tx, face.ty, face.side) }));
  }
  return Object.freeze(modules);
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
  readonly #objects: RoomObjectPresentation;
  readonly #remembered = new Set<Material>();
  readonly #rememberedSources = new Map<RoomPieceName, Mesh>();
  readonly #wallCapSources = new Map<string, Mesh>();
  readonly #geometry: SpatialInstance[] = [];
  readonly #wallFaces = new Map<string, SpatialInstance>();
  readonly #furniture: SpatialInstance[] = [];
  readonly #torchLights: PointLight[] = [];
  readonly #torchFlames: TorchFlamePresentation[] = [];
  readonly #overburdenMaterial: Material;
  readonly #overburden: Mesh[] = [];
  readonly #unknownRoof = new Map<string, Mesh>();
  readonly #occlusionAlpha = new Map<string, number>();
  readonly #shadowCasters = new Set<AbstractMesh>();
  readonly #pickKeys = new Set<string>();
  readonly #furnitureKeys = new Set<string>();
  #geometryRevision = "";
  #furnitureRevision = "";
  #objectRevision = "";
  #overburdenRevision = "";
  #mode: PresentationMode = "world";
  #disposed = false;

  constructor(scene: Scene, debug: RendererDebugRegistry, asset: RoomAsset, fixtureSeed = 1592594996) {
    this.#scene = scene;
    this.#debug = debug;
    this.#asset = asset;
    this.#seed = fixtureSeed >>> 0;
    const authoredOverburden = asset.materials.get("overburden_current")?.clone(
      "room:overburden-material");
    if (authoredOverburden === undefined || authoredOverburden === null) {
      throw new Error("room overburden material cannot clone authored surface");
    }
    this.#overburdenMaterial = authoredOverburden;
    let key: DirectionalLight | null = null;
    let shadows: ShadowGenerator | null = null;
    try {
      // Separate value families before lighting: a neutral flagstone floor,
      // warmer masonry, aged brown wood, and cool iron. Textures and vertex
      // modulation remain intact; these multipliers keep them from collapsing
      // into one brown-black band under the concept-directed rig.
      tuneSurface(asset.materials.get("floor_current"), new Color3(0.74, 0.76, 0.80),
        new Color3(0.003, 0.004, 0.006));
      tuneSurface(asset.materials.get("stone_current"), new Color3(0.95, 0.82, 0.66),
        new Color3(0.006, 0.004, 0.003));
      tuneSurface(asset.materials.get("wood_current"), new Color3(0.42, 0.26, 0.14),
        new Color3(0.018, 0.010, 0.005));
      tuneSurface(asset.materials.get("metal_current"), new Color3(0.24, 0.26, 0.30));
      tuneSurface(this.#overburdenMaterial, new Color3(0.10, 0.09, 0.085));
      const wallSource = asset.pieces.get("wall_straight");
      const wallMaterial = wallSource?.material as Material & {
        useVertexColors?: boolean; useVertexAlpha?: boolean; transparencyMode?: number;
      } | null | undefined;
      if (wallMaterial !== null && wallMaterial !== undefined) {
        wallMaterial.useVertexColors = true;
        wallMaterial.useVertexAlpha = true;
        wallMaterial.transparencyMode = 2;
      }
      for (const piece of ["floor_a", "floor_b", "floor_c", "floor_d", "wall_straight",
        "wall_run_2", "wall_run_3", "wall_run_5", "wall_run_8",
        "wall_inside", "wall_outside", "wall_end"] as const) {
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
      const currentStone = asset.materials.get("stone_current");
      const rememberedStone = this.#rememberedSources.get("wall_straight")?.material;
      if (currentStone === undefined || rememberedStone === undefined || rememberedStone === null) {
        throw new Error("room wall cap lacks stone material");
      }
      for (const floor of ["floor_a", "floor_b", "floor_c", "floor_d"] as const) for (const state of ["current", "remembered"] as const) {
        const cap = asset.pieces.get(floor)?.clone(`room:source:wall-cap:${floor}:${state}`, null, false);
        if (cap === undefined || cap === null) throw new Error(`room asset cannot clone wall cap ${floor}:${state}`);
        cap.material = state === "current" ? currentStone : rememberedStone;
        cap.isVisible = false;
        cap.isPickable = false;
        cap.receiveShadows = false;
        cap.setEnabled(true);
        this.#wallCapSources.set(`${floor}:${state}`, cap);
      }
      // The direction and mount remain the authored upper-right shadow axis.
      // Generator-v4's concept review changed only its response: a warm diffuse
      // key, restrained specular and a small intensity lift let the new umber
      // masonry separate without turning the room into a uniformly bright box.
      key = new DirectionalLight("room:directional-key", new Vector3(-0.45, -1, -0.35), scene);
      key.position = new Vector3(12, 24, 16);
      key.diffuse = new Color3(1, 0.68, 0.42);
      key.specular = new Color3(0.36, 0.23, 0.15);
      key.intensity = 1.6;
      shadows = new ShadowGenerator(1024, key);
      shadows.useBlurExponentialShadowMap = true;
    } catch (error) {
      shadows?.dispose();
      key?.dispose();
      for (const source of this.#rememberedSources.values()) source.dispose();
      this.#rememberedSources.clear();
      for (const source of this.#wallCapSources.values()) source.dispose();
      this.#wallCapSources.clear();
      for (const material of this.#remembered) material.dispose();
      this.#remembered.clear();
      this.#overburdenMaterial.dispose();
      throw error;
    }
    this.#key = key;
    this.#shadows = shadows;
    this.#objects = new RoomObjectPresentation(scene, shadows,
      asset.materials.get("stone_current"));
    this.#publishDebug();
  }

  get shadowGenerator(): ShadowGenerator { return this.#shadows; }

  setPresentationMode(mode: PresentationMode): void {
    this.#assertLive();
    if (mode === this.#mode) return;
    this.#mode = mode;
    this.#objects.setPresentationMode(mode);
    this.#applyPresentationMode();
    this.#publishDebug();
  }

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
    const entries = [...this.#geometry, ...this.#wallFaces.values(), ...this.#furniture];
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
    const furnitureRevision = `${geometryRevision}:${snapshot.furnitureRevision}:` +
      `${snapshot.dungeonObjectRevision}:${snapshot.dungeonObjects.length > 0}:${decorationRevision}`;
    const objectRevision = `${snapshot.epoch}:${snapshot.visRevision}:${snapshot.dungeonObjectRevision}`;
    const geometryChanged = geometryRevision !== this.#geometryRevision;
    const furnitureChanged = furnitureRevision !== this.#furnitureRevision;
    const objectsChanged = objectRevision !== this.#objectRevision;
    if (!geometryChanged && !furnitureChanged && !objectsChanged) return;
    if (geometryChanged) {
      this.#clearGeometry();
      this.#reconcileOverburden(snapshot);
      const doorCells = publishedDoorCells(snapshot);
      for (let ty = 0; ty < snapshot.mapRows; ty++) for (let tx = 0; tx < snapshot.mapCols; tx++) {
        const at = tileIndex(snapshot.mapCols, tx, ty);
        const visibility = snapshot.vis[at];
        const map = snapshot.map[at];
        if ((visibility !== 1 && visibility !== 2) || (map !== MAP_OPEN && map !== MAP_SOLID)) continue;
        const current = visibility === 2;
        const semanticKey = `tile:${tx}:${ty}`;
        const floorVariant = chooseRoomFloorVariant(this.#seed, tx, ty);
        this.#add(this.#geometry, `${semanticKey}:floor`, semanticKey,
          floorVariant.piece, tx, ty, floorVariant.quarterTurns, current, false, current);
        if (map === MAP_SOLID && !doorCells.has(`${tx}:${ty}`)) {
          // A solid dungeon cell is masonry volume, not only its camera-facing
          // boundary. The flagstone geometry gives each top four readable
          // blocks instead of turning the fine wall coursing into a giant slab;
          // its derived source still wears the current/remembered stone role.
          const capVariant = chooseRoomFloorVariant(this.#seed ^ 0x57414c4c, tx, ty).piece;
          const capSource = this.#wallCapSources.get(
            `${capVariant}:${current ? "current" : "remembered"}`);
          if (capSource === undefined) throw new Error("room wall cap source is missing");
          const cap = this.#add(this.#geometry, `${semanticKey}:wall-cap`, semanticKey,
            "wall_straight", tx, ty, 0, current, false, false, 0, 0, capSource);
          cap.position.y = ROOM_WALL_HEIGHT - 0.10;
          cap.scaling.x = 0.96;
          cap.scaling.y = 1.45;
          cap.scaling.z = 0.96;
        }
      }
      this.#reconcileWallFaces(snapshot);
      this.#geometryRevision = geometryRevision;
    }
    if (furnitureChanged) {
      this.#clearFurniture();
      const ownsPhysicalObjects = snapshot.dungeonObjects.length > 0;
      const furniture = snapshot.furniture.filter((item) => !ownsPhysicalObjects ||
        (item.kind !== FURNITURE_DOOR && item.kind !== FURNITURE_TORCH))
        .sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
      const doorKeys = new Set<string>();
      for (const run of chooseRoomDoorRuns(snapshot)) {
        for (const key of run.keys) doorKeys.add(key);
        this.#addDoorRun(run);
      }
      for (const item of furniture) if (!doorKeys.has(item.key)) this.#addFurniture(snapshot, item);
      this.#addDecorations(snapshot);
      this.#furnitureRevision = furnitureRevision;
    }
    if (objectsChanged) {
      this.#objects.acceptSnapshot(snapshot);
      this.#objectRevision = objectRevision;
    }
    this.#applyPresentationMode();
    this.#publishDebug();
  }

  updateOcclusion(project: RoomProjector, hero: Readonly<{ x: number; z: number }> | null): void {
    this.#assertLive();
    this.#objects.advanceMotion();
    const entries = [...this.#wallFaces.values()];
    const cutaways = hero === null ? new Set<string>() : chooseLocalWallCutaways(entries.map((entry) => {
      entry.mesh.computeWorldMatrix(true);
      return Object.freeze({ key: entry.key, corners: entry.mesh.getBoundingInfo().boundingBox.vectorsWorld });
    }), hero, project);
    for (const entry of entries) {
      const cutaway = cutaways.has(entry.key);
      this.#occlusionAlpha.set(entry.key, cutaway ? 0 : 1);
      entry.mesh.isVisible = !cutaway;
      entry.mesh.scaling.y = ROOM_WALL_HEIGHT / 0.9;
      // A translucent wall top still reads as a peach floor quadrilateral,
      // while its opaque shadow points at the hero. A local cutaway is an
      // aperture in presentation, so its caster must follow the aperture and
      // return with the same mesh identity when the hero moves away.
      if (cutaway) {
        this.#shadows.removeShadowCaster(entry.mesh, false);
        this.#shadowCasters.delete(entry.mesh);
      } else if (entry.current && !this.#shadowCasters.has(entry.mesh)) {
        this.#shadows.addShadowCaster(entry.mesh, false);
        this.#shadowCasters.add(entry.mesh);
      }
    }
    const cutawayTiles = new Set<string>();
    for (const entry of entries.filter((candidate) => cutaways.has(candidate.key))) {
      const tile = /^tile:(\d+):(\d+)$/.exec(entry.semanticKey);
      const side = /:wall-face:([0-3])$/.exec(entry.key);
      if (tile === null || side === null) continue;
      const tx = Number(tile[1]), ty = Number(tile[2]), direction = Number(side[1]);
      const length = entry.piece === "wall_run_8" ? 8 : entry.piece === "wall_run_5" ? 5 :
        entry.piece === "wall_run_3" ? 3 : entry.piece === "wall_run_2" ? 2 : 1;
      for (let offset = 0; offset < length; offset++) {
        const x = tx + (direction === 0 || direction === 2 ? offset : 0);
        const y = ty + (direction === 1 || direction === 3 ? offset : 0);
        cutawayTiles.add(`tile:${x}:${y}`);
      }
    }
    for (const cap of this.#geometry.filter((entry) => entry.key.endsWith(":wall-cap"))) {
      const cutaway = cutawayTiles.has(cap.semanticKey);
      cap.mesh.isVisible = !cutaway;
      if (cutaway) {
        this.#shadows.removeShadowCaster(cap.mesh, false);
        this.#shadowCasters.delete(cap.mesh);
      } else if (cap.current && !this.#shadowCasters.has(cap.mesh)) {
        this.#shadows.addShadowCaster(cap.mesh, false);
        this.#shadowCasters.add(cap.mesh);
      }
    }
  }

  counts(): RoomEnvironmentCounts {
    const geometry = this.#geometry.length;
    const fullArt = this.#mode !== "geometry" && this.#mode !== "dev";
    const furniture = fullArt ? this.#furnitureKeys.size : 0;
    let triangles = 0;
    const topology = [...this.#geometry, ...this.#wallFaces.values()];
    const visibleEntries = fullArt ? [...topology, ...this.#furniture] : topology;
    for (const entry of visibleEntries) {
      triangles += this.#asset.sidecar.pieces.find((piece) => piece.name === entry.piece)?.triangleCount ?? 0;
    }
    const objects = this.#objects.counts();
    return Object.freeze({
      geometry: geometry + this.#wallFaces.size, furniture: furniture + objects.objects,
      instances: visibleEntries.length + objects.meshes,
      lights: 1 + (fullArt ? this.#torchLights.length : 0) + objects.lights,
      shadowCasters: this.#shadowCasters.size + objects.shadows, triangles: triangles + objects.triangles,
    });
  }

  keys(): readonly string[] { return Object.freeze(
    [...this.#geometry, ...this.#wallFaces.values(), ...this.#furniture].map((entry) => entry.key)
      .concat(this.#objects.keys())); }

  reset(): void {
    this.#assertLive();
    this.#clearGeometry();
    this.#clearWallFaces();
    this.#clearOverburden();
    this.#clearFurniture();
    this.#objects.reset();
    this.#geometryRevision = "";
    this.#furnitureRevision = "";
    this.#objectRevision = "";
    this.#publishDebug();
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#clearGeometry();
    this.#clearWallFaces();
    this.#clearOverburden();
    this.#clearFurniture();
    this.#objects.dispose();
    this.#shadows.dispose();
    this.#key.dispose();
    for (const source of this.#rememberedSources.values()) source.dispose();
    this.#rememberedSources.clear();
    for (const source of this.#wallCapSources.values()) source.dispose();
    this.#wallCapSources.clear();
    for (const material of this.#remembered) material.dispose();
    this.#remembered.clear();
    this.#overburdenMaterial.dispose();
    this.#debug.removeOwner("room-environment");
    this.#disposed = true;
  }

  #addDoorRun(run: RoomDoorRun): void {
    for (const key of run.keys) this.#furnitureKeys.add("furniture:" + key);
    const owner = "furniture:" + run.keys[0];
    const faceOffsetX = run.quarterTurns === 1 ? -0.5 : 0;
    const faceOffsetZ = run.quarterTurns === 0 ? -0.5 : 0;
    if (run.length === 1) {
      const frame = this.#add(this.#furniture, owner + ":frame", owner, "door_frame",
        run.tx, run.ty, run.quarterTurns, true, true, true, faceOffsetX, faceOffsetZ);
      frame.scaling.y = ROOM_WALL_HEIGHT / 0.92;
      if (run.state === FURNITURE_DOOR_SHUT) {
        this.#addDoorLeafModules(owner + ":leaf", owner, run.tx, run.ty,
          run.quarterTurns, faceOffsetX, faceOffsetZ, 0.18, 0.22);
        this.#addDoorIron(owner, run.tx, run.ty, run.quarterTurns,
          faceOffsetX, faceOffsetZ, "single");
      }
      return;
    }

    // A wide doorway is one aperture. Repeat only the seamless lintel at tile
    // frequency, place full-height masonry at its two endpoints, and never put
    // a complete arch around each ABI record.
    for (let segment = 0; segment < run.length; segment++) {
      const tx = run.tx + (run.quarterTurns === 0 ? segment : 0);
      const ty = run.ty + (run.quarterTurns === 1 ? segment : 0);
      const semanticKey = "furniture:" + run.keys[segment];
      if (run.state === FURNITURE_DOOR_SHUT) {
        const leafOffsetX = -0.5;
        const leafOffsetZ = run.quarterTurns === 0 ? -0.5 : 0.5;
        this.#addDoorLeafModules(semanticKey + ":span:leaf:" + segment,
          semanticKey, tx, ty, run.quarterTurns,
          leafOffsetX, leafOffsetZ, 0.25, 0.32);
      }
    }
    for (const end of [0, 1] as const) {
      const tx = run.tx + (run.quarterTurns === 0 && end === 1 ? run.length - 1 : 0);
      const ty = run.ty + (run.quarterTurns === 1 && end === 1 ? run.length - 1 : 0);
      const offsetX = run.quarterTurns === 0 ? (end === 0 ? -0.5 : 0.5) : -0.5;
      const offsetZ = run.quarterTurns === 1 ? (end === 0 ? -0.5 : 0.5) : -0.5;
      const semanticKey = "furniture:" + run.keys[end === 0 ? 0 : run.keys.length - 1];
      const jamb = this.#add(this.#furniture, semanticKey + ":span:jamb:" + end,
        semanticKey, "wall_straight", tx, ty, run.quarterTurns,
        true, true, true, offsetX, offsetZ);
      jamb.scaling.x = 0.14;
      jamb.scaling.y = ROOM_WALL_HEIGHT / 0.9;
    }
  }

  #addDoorLeafModules(key: string, semanticKey: string, tx: number, ty: number,
    turns: number, offsetX: number, offsetZ: number, width: number, spacing: number): void {
    for (const module of [-1, 0, 1] as const) {
      const along = module * spacing;
      const leaf = this.#add(this.#furniture,
        module === 0 ? key : key + ":plank:" + (module < 0 ? 0 : 2),
        semanticKey, "door_leaf", tx, ty, turns,
        true, true, false,
        offsetX + (turns % 2 === 0 ? along : 0),
        offsetZ + (turns % 2 === 1 ? along : 0));
      leaf.scaling.x = width / 0.72;
      leaf.scaling.y = (ROOM_WALL_HEIGHT - 0.14) / 0.78;
      // A run publishes several adjacent leaf modules. Their paper-thin top
      // edges coalesced into one oversized near-black shadow that looked like
      // a steel lintel. The masonry frame owns the architectural shadow; keep
      // the readable wood panels out of the caster list.
      this.#shadows.removeShadowCaster(leaf, false);
      this.#shadowCasters.delete(leaf);
    }
  }

  #addDoorIron(semanticKey: string, tx: number, ty: number, turns: number,
    offsetX: number, offsetZ: number, suffix: string): void {
    for (const [band, height] of [0.43, 1.08].entries()) {
      const iron = this.#add(this.#furniture,
        semanticKey + ":door-iron:" + suffix + ":" + band,
        semanticKey, "torch_bracket", tx, ty, turns,
        true, true, false, offsetX, offsetZ);
      iron.position.y = height;
      iron.rotation.z = Math.PI / 2;
      iron.scaling.x = 0.22;
      iron.scaling.y = 0.62;
      iron.scaling.z = 0.18;
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
    bracket.position.y = 0.45;
    const local = this.#asset.socket.position;
    const c = Math.cos(turns * QUARTER_TURN), s = Math.sin(turns * QUARTER_TURN);
    const position = new Vector3(
      bracket.position.x + local.x * c + local.z * s,
      bracket.position.y + local.y,
      bracket.position.z - local.x * s + local.z * c,
    );
    // The socket is on the bracket, close enough to the wall that a point
    // light loses most of its pool inside masonry. Move presentation light
    // slightly along the published face normal. Both the authored flame planes
    // and the light must clear the masonry depth test; leaving only the planes
    // on the buried socket made the bracket read as an unlit beige oval.
    const lightPosition = position.clone();
    if (item.state === TORCH_FACE_POS_X) lightPosition.x += 0.45;
    else lightPosition.z += 0.45;
    this.#torchFlames.push(createTorchFlame(this.#scene, item.key, lightPosition));
    if (this.#torchLights.length >= MAX_TORCH_LIGHTS) return;
    const light = new PointLight(`room:torch:${item.key}`, lightPosition, this.#scene);
    // The pool is broader than the bulb: the concept uses local orange light
    // to reveal nearby masonry, while the warm key carries the room beyond it.
    light.diffuse = new Color3(1, 0.25, 0.045);
    light.specular = new Color3(0.42, 0.18, 0.055);
    light.intensity = 8.5;
    light.range = 10.5;
    this.#torchLights.push(light);
  }

  #addDecorations(snapshot: PresentationSnapshot): void {
    const candidate = snapshot as PresentationSnapshot & { roomDecorations?: readonly unknown[] };
    if (!Array.isArray(candidate.roomDecorations) || candidate.roomDecorations.length === 0) {
      for (const item of chooseRoomAmbientDressing(snapshot, this.#seed)) {
        if (item.piece !== "decal_rubble") continue;
        const key = `ambient:${item.piece}:${item.tx}:${item.ty}`;
        const mesh = this.#add(this.#furniture, key, key, item.piece, item.tx, item.ty,
          item.quarterTurns, true, false, false);
        mesh.scaling.scaleInPlace(1.9);
        mesh.position.y += 0.025;
      }
      return;
    }
    for (const unknown of candidate.roomDecorations) {
      if (unknown === null || typeof unknown !== "object") continue;
      const item = unknown as Record<string, unknown>;
      const piece = item.piece;
      if (piece !== "decal_rubble") continue;
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
      const mesh = this.#add(this.#furniture, semanticKey, semanticKey,
        piece, x, y, turns, true, true, true);
      mesh.scaling.scaleInPlace(1.9);
      mesh.position.y += 0.025;
    }
  }

  #reconcileOverburden(snapshot: PresentationSnapshot): void {
    const revision = `${snapshot.mapCols}:${snapshot.mapRows}:${snapshot.tileSize}`;
    const tileSize = this.#asset.sidecar.coordinates.tileSize;
    if (revision !== this.#overburdenRevision) {
      this.#clearOverburden();
      const width = snapshot.mapCols * tileSize;
      const depth = snapshot.mapRows * tileSize;
      const centreX = width / 2;
      const centreZ = depth / 2;
      const margin = Math.max(12, Math.min(width, depth) * 0.42);
      const ground = MeshBuilder.CreateGround("room:overburden:ground", {
        width: width + margin * 2, height: depth + margin * 2, subdivisions: 1,
      }, this.#scene);
      ground.position.set(centreX, -0.16, centreZ);
      ground.material = this.#overburdenMaterial;
      const groundUvs = ground.getVerticesData("uv");
      if (groundUvs !== null) {
        for (let index = 0; index < groundUvs.length; index += 2) {
          groundUvs[index] = (groundUvs[index] ?? 0) * (width + margin * 2) / 4;
          groundUvs[index + 1] = (groundUvs[index + 1] ?? 0) * (depth + margin * 2) / 4;
        }
        ground.setVerticesData("uv", groundUvs);
      }
      ground.isPickable = false;
      ground.receiveShadows = true;
      this.#overburden.push(ground);

      const cliffThickness = Math.max(3.2, tileSize * 3.2);
      const cliffHeight = 2.4;
      const addCliff = (side: string, x: number, z: number, cliffWidth: number, cliffDepth: number): void => {
        const cliff = MeshBuilder.CreateBox(`room:overburden:cliff:${side}`, {
          width: cliffWidth, height: cliffHeight, depth: cliffDepth,
        }, this.#scene);
        cliff.position.set(x, -cliffHeight / 2 - 0.1, z);
        cliff.material = this.#overburdenMaterial;
        cliff.isPickable = false;
        cliff.receiveShadows = true;
        this.#overburden.push(cliff);
      };
      addCliff("north", centreX, -cliffThickness / 2, width + cliffThickness * 2, cliffThickness);
      addCliff("east", width + cliffThickness / 2, centreZ, cliffThickness, depth);
      addCliff("south", centreX, depth + cliffThickness / 2, width + cliffThickness * 2, cliffThickness);
      addCliff("west", -cliffThickness / 2, centreZ, cliffThickness, depth);
      this.#overburdenRevision = revision;
    }
    const wanted = new Set<string>();
    for (let ty = 0; ty < snapshot.mapRows; ty++) for (let tx = 0; tx < snapshot.mapCols; tx++) {
      if (snapshot.vis[tileIndex(snapshot.mapCols, tx, ty)] !== 0) continue;
      const key = `${tx}:${ty}`;
      wanted.add(key);
      if (this.#unknownRoof.has(key)) continue;
      const roof = MeshBuilder.CreateBox(`room:overburden:roof:${key}`, {
        width: tileSize * 1.06, height: 0.22, depth: tileSize * 1.06,
      }, this.#scene);
      roof.position.set((tx + 0.5) * tileSize, 0.01, (ty + 0.5) * tileSize);
      roof.material = this.#overburdenMaterial;
      roof.isPickable = false;
      roof.receiveShadows = false;
      this.#unknownRoof.set(key, roof);
    }
    for (const [key, roof] of this.#unknownRoof) if (!wanted.has(key)) {
      roof.dispose();
      this.#unknownRoof.delete(key);
    }
  }

  #reconcileWallFaces(snapshot: PresentationSnapshot): void {
    const wanted = new Map(chooseRoomWallModules(snapshot).map((face) => [face.key, face]));
    for (const [key, entry] of this.#wallFaces) if (!wanted.has(key)) {
      this.#disposeEntry(entry);
      this.#wallFaces.delete(key);
    }
    for (const face of wanted.values()) {
      let entry = this.#wallFaces.get(face.key);
      if (entry === undefined) {
        const quarterTurns = (face.side === 0 || face.side === 2 ? 0 : 1) +
          (face.surfaceVariant % 2) * 2;
        const horizontal = face.side === 0 || face.side === 2;
        const offsetX = (face.side === 1 ? 0.5 : face.side === 3 ? -0.5 : 0) +
          (horizontal ? (face.length - 1) / 2 : 0);
        const offsetZ = (face.side === 0 ? -0.5 : face.side === 2 ? 0.5 : 0) +
          (horizontal ? 0 : (face.length - 1) / 2);
        const created: SpatialInstance[] = [];
        const semanticKey = `tile:${face.tx}:${face.ty}`;
        const mesh = this.#add(created, `${semanticKey}:wall-face:${face.side}`, semanticKey,
          face.piece, face.tx, face.ty, quarterTurns, true, false, false,
          offsetX, offsetZ);
        mesh.scaling.y = ROOM_WALL_HEIGHT / 0.9;
        // The authored face already owns its coping depth. Scaling that axis
        // made a local cutaway expose a peach floor-like quadrilateral and
        // stretched every module into one continuous rail toward the hero.
        mesh.scaling.z = 1;
        mesh.isVisible = true;
        entry = created[0];
        if (entry === undefined) throw new Error("room wall face instance was not created");
        this.#wallFaces.set(face.key, entry);
        this.#occlusionAlpha.set(face.key, 1);
      }
      this.#setWallVisibility(entry, face.visibility);
    }
  }

  #setWallVisibility(entry: SpatialInstance, visibility: 1 | 2): void {
    const current = visibility === 2;
    entry.current = current;
    entry.mesh.metadata = Object.freeze({ roomWallVisibility: visibility });
    if (current) {
      if (!this.#shadowCasters.has(entry.mesh)) this.#shadows.addShadowCaster(entry.mesh, false);
      this.#shadowCasters.add(entry.mesh);
    } else {
      this.#shadows.removeShadowCaster(entry.mesh, false);
      this.#shadowCasters.delete(entry.mesh);
    }
  }

  #add(target: SpatialInstance[], key: string, semanticKey: string, piece: RoomPieceName,
    tx: number, ty: number, turns: number, current: boolean, furniture: boolean, pickable: boolean,
    offsetX = 0, offsetZ = 0, sourceOverride?: Mesh): InstancedMesh {
    const source = sourceOverride ??
      (current ? this.#asset.pieces.get(piece) : this.#rememberedSources.get(piece));
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
    target.push({ key, semanticKey, piece, mesh, current, furniture });
    if (current) {
      this.#shadowCasters.add(mesh);
      this.#shadows.addShadowCaster(mesh, false);
    }
    return mesh;
  }

  #disposeEntries(entries: SpatialInstance[]): void {
    for (const entry of entries.splice(0)) this.#disposeEntry(entry);
  }

  #disposeEntry(entry: SpatialInstance): void {
    this.#shadows.removeShadowCaster(entry.mesh, false);
    this.#shadowCasters.delete(entry.mesh);
    entry.mesh.dispose();
    this.#pickKeys.delete(entry.semanticKey);
  }

  #clearGeometry(): void {
    this.#disposeEntries(this.#geometry);
  }

  #clearWallFaces(): void {
    for (const entry of this.#wallFaces.values()) this.#disposeEntry(entry);
    this.#wallFaces.clear();
    this.#occlusionAlpha.clear();
  }

  #clearOverburden(): void {
    for (const roof of this.#unknownRoof.values()) roof.dispose();
    this.#unknownRoof.clear();
    for (const mesh of this.#overburden.splice(0)) mesh.dispose();
    this.#overburdenRevision = "";
  }

  #clearFurniture(): void {
    for (const flame of this.#torchFlames.splice(0)) flame.dispose();
    for (const light of this.#torchLights.splice(0)) light.dispose();
    this.#disposeEntries(this.#furniture);
    this.#furnitureKeys.clear();
  }

  #applyPresentationMode(): void {
    const fullArt = this.#mode !== "geometry" && this.#mode !== "dev";
    for (const entry of this.#furniture) entry.mesh.setEnabled(fullArt);
    for (const flame of this.#torchFlames) for (const mesh of flame.meshes) mesh.setEnabled(fullArt);
    for (const light of this.#torchLights) light.setEnabled(fullArt);
    this.#shadowCasters.clear();
    for (const entry of [...this.#geometry, ...this.#wallFaces.values()]) {
      if (entry.current) {
        this.#shadowCasters.add(entry.mesh);
        this.#shadows.addShadowCaster(entry.mesh, false);
      } else {
        this.#shadows.removeShadowCaster(entry.mesh, false);
      }
    }
    for (const entry of this.#furniture) {
      this.#shadows.removeShadowCaster(entry.mesh, false);
      if (fullArt && entry.current) {
        this.#shadowCasters.add(entry.mesh);
        this.#shadows.addShadowCaster(entry.mesh, false);
      }
    }
  }

  #publishDebug(): void {
    const counts = this.counts();
    const fullArt = this.#mode !== "geometry" && this.#mode !== "dev";
    const entries = fullArt
      ? [...this.#geometry, ...this.#wallFaces.values(), ...this.#furniture]
      : [...this.#geometry, ...this.#wallFaces.values()];
    const sourceGroups = new Set(entries
      .map((entry) => entry.mesh.sourceMesh.name));
    const flames = fullArt ? this.#torchFlames.flatMap((flame) => flame.meshes) : [];
    const flameTriangles = flames.reduce((sum, flame) => sum + flame.getTotalIndices() / 3, 0);
    const objects = this.#objects.counts();
    this.#debug.replaceOwnerCounts("room-environment", {
      scene: { meshes: flames.length, instances: counts.instances,
        draws: sourceGroups.size + flames.length + objects.meshes,
        triangles: counts.triangles + flameTriangles, lights: counts.lights, shadowCasters: counts.shadowCasters },
      visibility: { geometry: counts.geometry, furniture: counts.furniture,
        effects: flames.length, picking: this.#pickKeys.size + objects.picks,
        debug: this.#pickKeys.size + objects.picks },
    });
  }

  #assertLive(): void { if (this.#disposed) throw new Error("room environment is disposed"); }
}

export function createRoomEnvironmentPresentation(
  scene: Scene, debug: RendererDebugRegistry, asset: RoomAsset, fixtureSeed?: number,
): RoomEnvironmentPresentation {
  return new RoomEnvironmentPresentation(scene, debug, asset, fixtureSeed);
}
