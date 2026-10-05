import { VertexBuffer } from "@babylonjs/core/Buffers/buffer.js";
import type { Material } from "@babylonjs/core/Materials/material.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import type { Scene } from "@babylonjs/core/scene.js";

// `Mesh.createInstance` is registered by this module rather than by Mesh itself.
import "@babylonjs/core/Meshes/instancedMesh.js";

import type { FixedCollider, PhysicsWorld } from "../core/engine/engine.ts";
import { cos, sin } from "../core/math/real.ts";
import type { Vec3 } from "../core/spec/quantity.ts";

export interface RoomMaterials {
  ground: Material;
  wall: Material;
  banner: Material;
  /** The posts. */
  wood: Material;
}

interface VisualColliderPair {
  visual: string;
  collider: string;
}

export interface ArenaAudit {
  readonly meshes: number;
  readonly materials: number;
  readonly textures: number;
  readonly instances: number;
  readonly bodies: number;
  visualColliderPairs: readonly VisualColliderPair[];
}

interface RoomPlacement {
  name: string;
  role: "wall" | "banner";
  position: readonly [number, number, number];
  rotationY: number;
  /** Axis-aligned half extent after rotation, used by the admission check. */
  halfExtent: readonly [number, number, number];
  solid: boolean;
  collider: string | null;
}

/** What a piece of the room is: its mesh and its material follow from it. */
type RoomRole = RoomPlacement["role"];

interface RoomGroup {
  role: RoomRole;
  metresPerRepeat: number;
  placements: readonly RoomPlacement[];
}

interface ShadowRegistry {
  add(mesh: AbstractMesh): void;
  remove(mesh: AbstractMesh): void;
}

export interface RoomOcclusionTarget {
  readonly point: { x: number; y: number; z: number };
  /** Whether the target counts now; an inactive target keeps no sight line clear. */
  readonly active?: () => boolean;
}

const NO_SHADOWS: ShadowRegistry = Object.freeze({ add: () => {}, remove: () => {} });
const MATERIAL_TEXTURE_FIELDS = Object.freeze([
  "albedoTexture", "diffuseTexture", "bumpTexture", "metallicTexture", "ambientTexture",
] as const);
const CARTESIAN_AXES = Object.freeze(["x", "y", "z"] as const);

/**
 * The arena's room, m (`docs/reference/look.md#arena-room`): the floor, the walls a body meets, and
 * what one repeat of each surface's image spans.
 */
export const ROOM = Object.freeze({
  groundHalfExtent: 30,
  /** The highest a fighter can reach, m: crown, raised arm and the longest carried object, with margin. */
  maxReachHeight: 3.6,
  floorSize: 60,
  /** Metres one image repeat spans on the floor, walls and banners. */
  floorMetresPerRepeat: 2.4,
  wallCount: 24,
  wallWidth: 2 * 13 * sin(Math.PI / 24) / cos(Math.PI / 24) + .08,
  wallHeight: 1.25,
  /** Depth of the parapet, shared by its visible masonry and collider, m. */
  wallThickness: 0.5,
  wallHalfExtent: 13,
  wallMetresPerRepeat: 2.1,
  bannerMetresPerRepeat: 0.4,
});

const roomWalls = (): readonly RoomPlacement[] => Array.from({ length: ROOM.wallCount }, (_, index) => {
  const angle = index * Math.PI * 2 / ROOM.wallCount;
  const radius = ROOM.wallHalfExtent + ROOM.wallThickness / 2;
  const c = cos(angle), s = sin(angle);
  return {
    name: `room.wall.${index}`, role: "wall", solid: true, collider: `room.wall.${index}.collider`,
    position: [s * radius, ROOM.wallHeight / 2, c * radius], rotationY: angle,
    halfExtent: [Math.abs(c) * ROOM.wallWidth / 2 + Math.abs(s) * ROOM.wallThickness / 2,
      ROOM.wallHeight / 2, Math.abs(s) * ROOM.wallWidth / 2 + Math.abs(c) * ROOM.wallThickness / 2],
  };
});

const placed = (
  name: string,
  role: RoomRole,
  position: readonly [number, number, number],
  halfExtent: readonly [number, number, number],
  solid = true,
  rotationY = 0,
): RoomPlacement => ({ name, role, position, rotationY, halfExtent, solid, collider: null });

/**
 * The room's cosmetic placements. Nothing solid is admitted below the reach
 * ceiling (`ROOM.maxReachHeight`) unless it names one of the arena's colliders
 * (`validateRoomPlacements`). A fighter can move beyond the slab, so distance
 * admits nothing; only overhead solids may go without a collider. Where each piece stands is set by
 * eye (`docs/reference/look.md#arena-room`).
 */
export const ROOM_GROUPS: readonly RoomGroup[] = Object.freeze([
  { role: "wall", metresPerRepeat: ROOM.wallMetresPerRepeat, placements: roomWalls() },
  { role: "banner", metresPerRepeat: ROOM.bannerMetresPerRepeat,
    placements: Array.from({ length: 8 }, (_, index) => {
      const angle = (index + .5) * Math.PI / 4;
      return placed(`room.banner.${index}`, "banner",
        [sin(angle) * 13.55, -.15, cos(angle) * 13.55], [.6, .9, .6], false, angle);
    }),
  },
]);

/**
 * The ring of posts round the fighting floor: how many, the ring's radius, and each post's size and
 * sides, m (`docs/reference/look.md#arena-room`).
 */
export const ARENA_POSTS = Object.freeze({ count: 8, ring: 12.3, height: 1.7, diameter: 1.1, sides: 8 });

/** The name of every collider the arena has (`arenaSolids`). */
const existingColliders = new Set([
  "ground",
  ...Array.from({ length: ARENA_POSTS.count }, (_, index) => `post${index}`),
  ...roomWalls().map((placement) => placement.collider as string),
]);

export function validateRoomPlacements(groups: readonly RoomGroup[], registeredColliders: ReadonlySet<string> = existingColliders): string[] {
  const failures: string[] = [];
  for (const group of groups) {
    for (const placement of group.placements) {
      if (placement.role !== group.role) failures.push(`${placement.name} is in the ${group.role} instance group`);
      if (placement.collider && !registeredColliders.has(placement.collider)) {
        failures.push(`${placement.name} names missing collider ${placement.collider}`);
      }
      if (!placement.solid || placement.collider) continue;
      const aboveReach = placement.position[1] - placement.halfExtent[1] >= ROOM.maxReachHeight;
      if (!aboveReach) {
        failures.push(`${placement.name} is an opaque solid below reach clearance`);
      }
    }
  }
  return failures;
}

/** Whether `mesh` stands for a collider: a fixed collider in the core's world stands behind it (`buildArenaColliders`). */
export const isCollider = (mesh: AbstractMesh): boolean => mesh.metadata?.isCollider === true;

/**
 * Check each pair against the scene's meshes, not the placement table: its collider exists, has a
 * physics body, and overlaps its visual.
 */
export function validateVisualColliderPairs(
  scene: Scene,
  pairs: readonly VisualColliderPair[],
): string[] {
  const failures: string[] = [];
  for (const pair of pairs) {
    const visual = scene.getMeshByName(pair.visual);
    const collider = scene.getMeshByName(pair.collider);
    if (!visual) {
      failures.push(`${pair.visual} does not resolve to a visual mesh`);
      continue;
    }
    if (!collider) {
      failures.push(`${pair.visual} names missing collider ${pair.collider}`);
      continue;
    }
    if (!isCollider(collider)) {
      failures.push(`${pair.visual} names ${pair.collider}, which has no physics body`);
      continue;
    }
    visual.computeWorldMatrix(true);
    collider.computeWorldMatrix(true);
    const a = visual.getBoundingInfo().boundingBox;
    const b = collider.getBoundingInfo().boundingBox;
    const tolerance = 0.01;
    const overlaps = a.minimumWorld.x <= b.maximumWorld.x + tolerance && a.maximumWorld.x + tolerance >= b.minimumWorld.x
      && a.minimumWorld.y <= b.maximumWorld.y + tolerance && a.maximumWorld.y + tolerance >= b.minimumWorld.y
      && a.minimumWorld.z <= b.maximumWorld.z + tolerance && a.maximumWorld.z + tolerance >= b.minimumWorld.z;
    if (!overlaps) failures.push(`${pair.visual} does not geometrically overlap collider ${pair.collider}`);
  }
  return failures;
}

/** Map generated primitive UVs from local metres, independent of mesh aspect. */
function mapUvsInMetres(mesh: Mesh, metresPerRepeat: number): void {
  const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
  const normals = mesh.getVerticesData(VertexBuffer.NormalKind);
  if (!positions || !normals) throw new Error(`${mesh.name} has no position/normal basis for metre UVs`);
  const uvs = new Array<number>((positions.length / 3) * 2);
  for (let vertex = 0; vertex < positions.length / 3; vertex += 1) {
    const p = vertex * 3;
    const uv = vertex * 2;
    const x = positions[p]; const y = positions[p + 1]; const z = positions[p + 2];
    const nx = Math.abs(normals[p]); const ny = Math.abs(normals[p + 1]); const nz = Math.abs(normals[p + 2]);
    if (ny >= nx && ny >= nz) [uvs[uv], uvs[uv + 1]] = [x / metresPerRepeat, z / metresPerRepeat];
    else if (nx >= nz) [uvs[uv], uvs[uv + 1]] = [z / metresPerRepeat, y / metresPerRepeat];
    else [uvs[uv], uvs[uv + 1]] = [x / metresPerRepeat, y / metresPerRepeat];
  }
  mesh.setVerticesData(VertexBuffer.UVKind, uvs, false, 2);
  mesh.metadata = { ...(mesh.metadata ?? {}), metresPerRepeat };
}

function roomSource(scene: Scene, group: RoomGroup): Mesh {
  const name = group.placements[0].name;
  let mesh: Mesh;
  switch (group.role) {
    case "wall":
      mesh = MeshBuilder.CreateBox(name, { width: ROOM.wallWidth, height: ROOM.wallHeight, depth: ROOM.wallThickness }, scene);
      break;
    case "banner": mesh = MeshBuilder.CreatePlane(name, { width: 1.2, height: 1.8, sideOrientation: 2 }, scene); break;
    default: {
      const never: never = group.role;
      throw new Error(`unknown room role ${JSON.stringify(never)}`);
    }
  }
  mapUvsInMetres(mesh, group.metresPerRepeat);
  return mesh;
}

function place(mesh: AbstractMesh, placement: RoomPlacement): void {
  mesh.name = placement.name;
  mesh.position.set(...placement.position);
  mesh.rotation.y = placement.rotationY;
  mesh.receiveShadows = true;
  mesh.metadata = {
    ...(mesh.metadata ?? {}),
    roomPlacement: {
      role: placement.role,
      solid: placement.solid,
      collider: placement.collider,
      halfExtent: [...placement.halfExtent],
    },
  };
}

function segmentIntersectsMesh(
  from: { x: number; y: number; z: number },
  toX: number,
  toY: number,
  toZ: number,
  mesh: AbstractMesh,
): boolean {
  mesh.computeWorldMatrix(true);
  const bounds = mesh.getBoundingInfo().boundingBox;
  const to = { x: toX, y: toY, z: toZ };
  let first = 0;
  let last = 1;
  for (const axis of CARTESIAN_AXES) {
    const start = from[axis];
    const end = to[axis];
    const low = bounds.minimumWorld[axis];
    const high = bounds.maximumWorld[axis];
    const delta = end - start;
    if (Math.abs(delta) < 1e-9) {
      if (start < low || start > high) return false;
      continue;
    }
    const a = (low - start) / delta;
    const b = (high - start) / delta;
    first = Math.max(first, Math.min(a, b));
    last = Math.min(last, Math.max(a, b));
    if (first > last) return false;
  }
  return true;
}

/** One of the arena's fixed colliders, world, m: a box by its centre and full size, or a post by its corners. */
type ArenaSolid =
  | { readonly name: string; readonly kind: "box"; readonly centre: Vec3; readonly size: Vec3; readonly turn?: number }
  | { readonly name: string; readonly kind: "hull"; readonly centre: Vec3; readonly points: readonly Vec3[] };

/**
 * What a body meets in the arena: the ground's slab, the circular parapet (`roomWalls`) and the ring of posts
 * (`ARENA_POSTS`). A post is the prism its mesh draws, `CreateCylinder` of `sides` sides, corner for corner.
 * Its corners are the world's, so their sines and cosines are the core's own: a bout is the same in every
 * JavaScript engine only if its arena is.
 */
export function arenaSolids(): readonly ArenaSolid[] {
  const solids: ArenaSolid[] = [{ name: "ground", kind: "box", centre: [0, -0.5, 0], size: [ROOM.floorSize, 1, ROOM.floorSize] }];
  for (const wall of roomWalls()) {
    solids.push({ name: wall.collider!, kind: "box", centre: [...wall.position],
      size: [ROOM.wallWidth, ROOM.wallHeight, ROOM.wallThickness], turn: wall.rotationY });
  }
  const { count, ring, height, diameter, sides } = ARENA_POSTS;
  for (let index = 0; index < count; index += 1) {
    const angle = (index / count) * Math.PI * 2;
    const centre: Vec3 = [sin(angle) * ring, height / 2, cos(angle) * ring];
    const points: Vec3[] = [];
    for (const y of [0, height]) for (let side = 0; side < sides; side += 1) {
      const a = (side / sides) * Math.PI * 2;
      points.push([centre[0] + cos(a) * diameter / 2, y, centre[2] + sin(a) * diameter / 2]);
    }
    solids.push({ name: `post${index}`, kind: "hull", centre, points });
  }
  return solids;
}

/** The arena's solids as fixed colliders in a world. */
export function addArenaSolids(physics: PhysicsWorld, solids: readonly ArenaSolid[] = arenaSolids()): FixedCollider[] {
  return solids.map((solid) => {
    switch (solid.kind) {
      case "box": return physics.addFixedBox(solid.centre, solid.size, solid.turn);
      case "hull": return physics.addFixedShape({ kind: "hull", points: solid.points });
      default: {
        const never: never = solid;
        throw new Error(`unknown solid ${JSON.stringify(never)}`);
      }
    }
  });
}

interface ArenaColliders {
  readonly meshes: readonly Mesh[];
  readonly pairs: readonly VisualColliderPair[];
  dispose(): void;
}

/**
 * The arena's solids (`arenaSolids`) as fixed colliders in `physics`, and as meshes: the ground and walls invisible,
 * the brazier pedestals drawn.
 */
export function buildArenaColliders(
  scene: Scene,
  physics: PhysicsWorld,
  materials: RoomMaterials,
  shadows: ShadowRegistry = NO_SHADOWS,
): ArenaColliders {
  const meshes: Mesh[] = [];
  const pairs: VisualColliderPair[] = [];
  const solids = arenaSolids();
  const fixed = addArenaSolids(physics, solids);
  // A mesh a collider stands behind says so, for the checks that ask what is solid (`isCollider`).
  const mark = (mesh: Mesh) => { mesh.metadata = { ...mesh.metadata, isCollider: true }; };
  for (const solid of solids) {
    if (solid.kind === "box") {
      const box = MeshBuilder.CreateBox(solid.name, { width: solid.size[0], height: solid.size[1], depth: solid.size[2] }, scene);
      box.position.set(...solid.centre);
      box.rotation.y = solid.turn ?? 0;
      box.isVisible = false;
      if (solid.name === "ground") box.material = materials.ground;
      mark(box);
      meshes.push(box);
      continue;
    }
    const { height, diameter, sides } = ARENA_POSTS;
    const post = MeshBuilder.CreateCylinder(solid.name, { height, diameter, tessellation: sides }, scene);
    post.position.set(...solid.centre);
    mark(post);
    post.material = materials.wood;
    post.receiveShadows = true;
    shadows.add(post);
    meshes.push(post);
    pairs.push({ visual: post.name, collider: post.name });
  }
  return {
    meshes,
    pairs,
    dispose: () => {
      for (const mesh of meshes) {
        if (mesh.name.startsWith("post")) shadows.remove(mesh);
      }
      for (const collider of fixed) collider.dispose();
      for (let index = meshes.length - 1; index >= 0; index -= 1) {
        if (!meshes[index].isDisposed()) meshes[index].dispose(false, false);
      }
    },
  };
}

interface CosmeticRoom {
  readonly meshes: readonly AbstractMesh[];
  readonly pairs: readonly VisualColliderPair[];
  dispose(): void;
}

export function buildCosmeticRoom(
  scene: Scene,
  materials: RoomMaterials,
  shadows: ShadowRegistry = NO_SHADOWS,
  groups: readonly RoomGroup[] = ROOM_GROUPS,
): CosmeticRoom {
  const refused = validateRoomPlacements(groups);
  if (refused.length) throw new Error(refused.join("\n"));
  const meshes: AbstractMesh[] = [];
  const floor = MeshBuilder.CreateDisc("room.floor", { radius: ROOM.wallHalfExtent + ROOM.wallThickness, tessellation: 96, sideOrientation: 2 }, scene);
  floor.rotation.x = Math.PI / 2;
  floor.position.y = 0.003;
  floor.material = materials.ground;
  floor.receiveShadows = true;
  mapUvsInMetres(floor, ROOM.floorMetresPerRepeat);
  floor.metadata = { ...floor.metadata, roomPlacement: { role: "floor", solid: true, collider: "ground" } };
  meshes.push(floor);
  const pairs: VisualColliderPair[] = [{ visual: floor.name, collider: "ground" }];

  const dressed: Readonly<Record<RoomRole, Material>> = {
    wall: materials.wall, banner: materials.banner,
  };
  for (const group of groups) {
    const source = roomSource(scene, group);
    source.material = dressed[group.role];
    place(source, group.placements[0]);
    meshes.push(source);
    if (group.placements[0].collider) {
      pairs.push({ visual: source.name, collider: group.placements[0].collider });
    }
    if (group.placements[0].solid) shadows.add(source);
    for (const placement of group.placements.slice(1)) {
      const instance = source.createInstance(placement.name);
      place(instance, placement);
      meshes.push(instance);
      if (placement.collider) pairs.push({ visual: instance.name, collider: placement.collider });
      if (placement.solid) shadows.add(instance);
    }
  }
  return {
    meshes,
    pairs,
    dispose: () => {
      for (const mesh of meshes) {
        const placement = mesh.metadata?.roomPlacement as { solid?: boolean } | undefined;
        if (placement?.solid && mesh.name !== "room.floor") shadows.remove(mesh);
      }
      for (let index = meshes.length - 1; index >= 0; index -= 1) {
        if (!meshes[index].isDisposed()) meshes[index].dispose(false, false);
      }
    },
  };
}

interface ArenaWorld {
  readonly colliders: ArenaColliders;
  readonly room: CosmeticRoom;
  audit(): ArenaAudit;
  updateOcclusion(camera: { x: number; y: number; z: number }, targets: readonly RoomOcclusionTarget[]): void;
  dispose(): void;
}

export function buildArenaWorld(
  scene: Scene,
  physics: PhysicsWorld,
  materials: RoomMaterials,
  shadows: ShadowRegistry = NO_SHADOWS,
  groups: readonly RoomGroup[] = ROOM_GROUPS,
): ArenaWorld {
  const colliders = buildArenaColliders(scene, physics, materials, shadows);
  const room = buildCosmeticRoom(scene, materials, shadows, groups);
  const visualColliderPairs = Object.freeze([...colliders.pairs, ...room.pairs].map((pair) => Object.freeze(pair)));
  const alignmentFailures = validateVisualColliderPairs(scene, visualColliderPairs);
  if (alignmentFailures.length) {
    room.dispose();
    colliders.dispose();
    throw new Error(alignmentFailures.join("\n"));
  }
  const ownedMeshes: readonly AbstractMesh[] = Object.freeze([...colliders.meshes, ...room.meshes]);
  const ownedMaterials: Material[] = [];
  const ownedTextures: object[] = [];
  const census = {
    meshes: 0, materials: 0, textures: 0, instances: 0, bodies: 0, visualColliderPairs,
  };
  const report: ArenaAudit = Object.freeze({
    get meshes() { return census.meshes; },
    get materials() { return census.materials; },
    get textures() { return census.textures; },
    get instances() { return census.instances; },
    get bodies() { return census.bodies; },
    visualColliderPairs,
  });
  const audit = (): ArenaAudit => {
    census.meshes = 0;
    census.instances = 0;
    census.bodies = 0;
    ownedMaterials.length = 0;
    ownedTextures.length = 0;
    for (const mesh of ownedMeshes) {
      if (mesh.isDisposed()) continue;
      census.meshes += 1;
      if (mesh.getClassName() === "InstancedMesh") census.instances += 1;
      if (isCollider(mesh)) census.bodies += 1;
      const material = mesh.material;
      if (material && !ownedMaterials.includes(material)) ownedMaterials.push(material);
    }
    for (const material of ownedMaterials) {
      const mapped = material as unknown as Record<string, object | null | undefined>;
      for (const field of MATERIAL_TEXTURE_FIELDS) {
        const texture = mapped[field];
        if (texture && !ownedTextures.includes(texture)) ownedTextures.push(texture);
      }
    }
    census.materials = ownedMaterials.length;
    census.textures = ownedTextures.length;
    return report;
  };
  const updateOcclusion = (
    camera: { x: number; y: number; z: number },
    targets: readonly RoomOcclusionTarget[],
  ): void => {
    for (const mesh of room.meshes) {
      const placement = mesh.metadata?.roomPlacement as { role?: string } | undefined;
      if (placement?.role !== "wall") continue;
      mesh.isVisible = true;
      for (const target of targets) {
        if (target.active && !target.active()) continue;
        const point = target.point;
        if (segmentIntersectsMesh(
          camera, point.x, point.y, point.z, mesh,
        )) {
          mesh.isVisible = false;
          break;
        }
      }
    }
  };
  return {
    colliders,
    room,
    audit,
    updateOcclusion,
    dispose: () => {
      room.dispose();
      colliders.dispose();
    },
  };
}
