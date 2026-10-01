import { VertexBuffer } from "@babylonjs/core/Buffers/buffer.js";
import type { Material } from "@babylonjs/core/Materials/material.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import type { Scene } from "@babylonjs/core/scene.js";

// `Mesh.createInstance` is registered by this module rather than by Mesh itself.
import "@babylonjs/core/Meshes/instancedMesh.js";

import type { FixedCollider, PhysicsWorld } from "../core/engine/engine.ts";
import type { Vec3 } from "../core/spec/quantity.ts";
import { surfaceMetresPerRepeat, TEXTURED_SURFACES } from "../render/materials.ts";

export interface RoomMaterials {
  ground: Material;
  wall: Material;
  timber: Material;
  banner: Material;
  /** The posts. */
  wood: Material;
}

export interface VisualColliderPair {
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

export interface RoomPlacement {
  name: string;
  role: "wall" | "beam" | "banner" | "rack" | "debris";
  position: readonly [number, number, number];
  rotationY: number;
  /** Axis-aligned half extent after rotation, used by the admission check. */
  halfExtent: readonly [number, number, number];
  solid: boolean;
  collider: string | null;
}

/** What a piece of the room is: its mesh and its material follow from it. */
type RoomRole = RoomPlacement["role"];

export interface RoomGroup {
  role: RoomRole;
  metresPerRepeat: number;
  placements: readonly RoomPlacement[];
}

export interface ShadowRegistry {
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

export const ROOM = Object.freeze({
  groundHalfExtent: 30,
  /** The highest a fighter can reach, m: crown, raised arm and the longest carried object, with margin. */
  maxReachHeight: 3.6,
  floorSize: 60,
  /** Metres one image repeat spans on the floor, walls, timber and banners; the timber's is its texture's. */
  floorMetresPerRepeat: 2.4,
  wallWidth: 26.24,
  wallHeight: 4.2,
  /** Depth of the wall colliders, whose inner faces meet the scrims, m. */
  wallThickness: 0.24,
  wallHalfExtent: 13,
  wallMetresPerRepeat: 2.1,
  timberMetresPerRepeat: surfaceMetresPerRepeat(TEXTURED_SURFACES.roomTimber),
  bannerMetresPerRepeat: 0.4,
});

const wall = (name: string, x: number, z: number, rotationY: number, halfExtent: readonly [number, number, number]): RoomPlacement => ({
  name, role: "wall", position: [x, ROOM.wallHeight / 2, z], rotationY, halfExtent,
  // A drawn wall is a translucent scrim, not solid; its collider is a box behind it
  // (`ROOM_WALL_COLLIDERS`).
  solid: false, collider: `${name}.collider`,
});

const roomWalls = (): readonly RoomPlacement[] => {
  const H = ROOM.wallHalfExtent;
  const W = ROOM.wallWidth / 2;
  const Y = ROOM.wallHeight / 2;
  return [
    wall("room.wall.north", 0, H, 0, [W, Y, 0]),
    wall("room.wall.south", 0, -H, Math.PI, [W, Y, 0]),
    wall("room.wall.east", H, 0, -Math.PI / 2, [0, Y, W]),
    wall("room.wall.west", -H, 0, Math.PI / 2, [0, Y, W]),
  ];
};

/** The walls' colliders, boxes whose inner faces meet the scrims; the page and headless bouts share them. */
export const ROOM_WALL_COLLIDERS = Object.freeze(roomWalls().map((placement) => {
  const northSouth = placement.name.endsWith("north") || placement.name.endsWith("south");
  const depth = ROOM.wallThickness; const centre = ROOM.wallHalfExtent + depth / 2;
  return Object.freeze({ name: placement.collider as string,
    width: northSouth ? ROOM.wallWidth : depth, height: ROOM.wallHeight,
    depth: northSouth ? depth : ROOM.wallWidth,
    position: Object.freeze([
      placement.position[0] === 0 ? 0 : Math.sign(placement.position[0]) * centre,
      ROOM.wallHeight / 2,
      placement.position[2] === 0 ? 0 : Math.sign(placement.position[2]) * centre,
    ] as const) });
}));
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
 * admits nothing; only overhead solids may go without a collider.
 */
export const ROOM_GROUPS: readonly RoomGroup[] = Object.freeze([
  {
    role: "wall", metresPerRepeat: ROOM.wallMetresPerRepeat, placements: roomWalls(),
  },
  {
    role: "beam", metresPerRepeat: ROOM.timberMetresPerRepeat, placements: [
      placed("room.beam.n1", "beam", [-5.0, 4.1, 12.82], [2.1, 0.12, 0.12]),
      placed("room.beam.n2", "beam", [5.0, 4.1, 12.82], [2.1, 0.12, 0.12]),
      placed("room.beam.s1", "beam", [-5.0, 4.1, -12.82], [2.1, 0.12, 0.12]),
      placed("room.beam.s2", "beam", [5.0, 4.1, -12.82], [2.1, 0.12, 0.12]),
      placed("room.beam.e1", "beam", [12.82, 4.1, -5.0], [0.12, 0.12, 2.1], true, Math.PI / 2),
      placed("room.beam.e2", "beam", [12.82, 4.1, 5.0], [0.12, 0.12, 2.1], true, Math.PI / 2),
      placed("room.beam.w1", "beam", [-12.82, 4.1, -5.0], [0.12, 0.12, 2.1], true, Math.PI / 2),
      placed("room.beam.w2", "beam", [-12.82, 4.1, 5.0], [0.12, 0.12, 2.1], true, Math.PI / 2),
    ],
  },
  {
    role: "banner", metresPerRepeat: ROOM.bannerMetresPerRepeat, placements: [
      placed("room.banner.n1", "banner", [-7.2, 2.55, 12.96], [0.6, 0.9, 0], false),
      placed("room.banner.n2", "banner", [7.2, 2.55, 12.96], [0.6, 0.9, 0], false),
      placed("room.banner.s1", "banner", [-7.2, 2.55, -12.96], [0.6, 0.9, 0], false, Math.PI),
      placed("room.banner.s2", "banner", [7.2, 2.55, -12.96], [0.6, 0.9, 0], false, Math.PI),
      placed("room.banner.e1", "banner", [12.96, 2.55, -7.2], [0, 0.9, 0.6], false, -Math.PI / 2),
      placed("room.banner.e2", "banner", [12.96, 2.55, 7.2], [0, 0.9, 0.6], false, -Math.PI / 2),
      placed("room.banner.w1", "banner", [-12.96, 2.55, -7.2], [0, 0.9, 0.6], false, Math.PI / 2),
      placed("room.banner.w2", "banner", [-12.96, 2.55, 7.2], [0, 0.9, 0.6], false, Math.PI / 2),
    ],
  },
  {
    role: "rack", metresPerRepeat: ROOM.timberMetresPerRepeat, placements: [
      placed("room.rack.ne", "rack", [11.0, 0.006, 7], [0.8, 0, 0.2], false, 0),
      placed("room.rack.nw", "rack", [-11.0, 0.006, 7], [0.8, 0, 0.2], false, 0),
      placed("room.rack.se", "rack", [11.0, 0.006, -7], [0.8, 0, 0.2], false, 0),
      placed("room.rack.sw", "rack", [-11.0, 0.006, -7], [0.8, 0, 0.2], false, 0),
    ],
  },
  {
    role: "debris", metresPerRepeat: ROOM.timberMetresPerRepeat, placements: [
      placed("room.debris.n1", "debris", [-7.5, 0.006, 10.8], [0.4, 0, 0.13], false, 0.3),
      placed("room.debris.n2", "debris", [7.5, 0.006, 10.8], [0.4, 0, 0.13], false, -0.4),
      placed("room.debris.s1", "debris", [-7.5, 0.006, -10.8], [0.4, 0, 0.13], false, -0.2),
      placed("room.debris.s2", "debris", [7.5, 0.006, -10.8], [0.4, 0, 0.13], false, 0.5),
      placed("room.debris.e1", "debris", [10.8, 0.006, -7.5], [0.13, 0, 0.4], false, 1.2),
      placed("room.debris.e2", "debris", [10.8, 0.006, 7.5], [0.13, 0, 0.4], false, 1.7),
      placed("room.debris.w1", "debris", [-10.8, 0.006, -7.5], [0.13, 0, 0.4], false, 1.4),
      placed("room.debris.w2", "debris", [-10.8, 0.006, 7.5], [0.13, 0, 0.4], false, 1.9),
    ],
  },
]);

const existingColliders = new Set([
  "ground",
  ...Array.from({ length: 14 }, (_, index) => `post${index}`),
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
      mesh = MeshBuilder.CreatePlane(name, { width: ROOM.wallWidth, height: ROOM.wallHeight, sideOrientation: 2 }, scene);
      break;
    case "beam": mesh = MeshBuilder.CreateBox(name, { width: 4.2, height: 0.24, depth: 0.24 }, scene); break;
    case "banner": mesh = MeshBuilder.CreatePlane(name, { width: 1.2, height: 1.8, sideOrientation: 2 }, scene); break;
    case "rack": mesh = MeshBuilder.CreateGround(name, { width: 1.6, height: 0.4 }, scene); break;
    case "debris": mesh = MeshBuilder.CreateGround(name, { width: 0.8, height: 0.26 }, scene); break;
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

/** The ring of posts round the fighting floor: how many, the ring's radius, and each post's size and sides, m. */
export const ARENA_POSTS = Object.freeze({ count: 14, ring: 9.5, height: 1.5, diameter: 0.17, sides: 8 });

/** One of the arena's fixed colliders, world, m: a box by its centre and full size, or a post by its corners. */
export type ArenaSolid =
  | { readonly name: string; readonly kind: "box"; readonly centre: Vec3; readonly size: Vec3 }
  | { readonly name: string; readonly kind: "hull"; readonly centre: Vec3; readonly points: readonly Vec3[] };

/**
 * What a body meets in the arena: the ground's slab, the four walls (`ROOM_WALL_COLLIDERS`) and the ring of posts
 * (`ARENA_POSTS`). A post is the prism its mesh draws, `CreateCylinder` of `sides` sides, corner for corner.
 */
export function arenaSolids(): readonly ArenaSolid[] {
  const solids: ArenaSolid[] = [{ name: "ground", kind: "box", centre: [0, -0.5, 0], size: [60, 1, 60] }];
  for (const wall of ROOM_WALL_COLLIDERS) {
    solids.push({ name: wall.name, kind: "box", centre: [...wall.position], size: [wall.width, wall.height, wall.depth] });
  }
  const { count, ring, height, diameter, sides } = ARENA_POSTS;
  for (let index = 0; index < count; index += 1) {
    const angle = (index / count) * Math.PI * 2;
    const centre: Vec3 = [Math.sin(angle) * ring, height / 2, Math.cos(angle) * ring];
    const points: Vec3[] = [];
    for (const y of [0, height]) for (let side = 0; side < sides; side += 1) {
      const a = (side / sides) * Math.PI * 2;
      points.push([centre[0] + Math.cos(a) * diameter / 2, y, centre[2] + Math.sin(a) * diameter / 2]);
    }
    solids.push({ name: `post${index}`, kind: "hull", centre, points });
  }
  return solids;
}

/** The arena's solids as fixed colliders in a world. */
export function addArenaSolids(physics: PhysicsWorld, solids: readonly ArenaSolid[] = arenaSolids()): FixedCollider[] {
  return solids.map((solid) => {
    switch (solid.kind) {
      case "box": return physics.addFixedBox(solid.centre, solid.size);
      case "hull": return physics.addFixedShape({ kind: "hull", points: solid.points });
      default: {
        const never: never = solid;
        throw new Error(`unknown solid ${JSON.stringify(never)}`);
      }
    }
  });
}

export interface ArenaColliders {
  readonly meshes: readonly Mesh[];
  readonly pairs: readonly VisualColliderPair[];
  dispose(): void;
}

/**
 * The arena's solids (`arenaSolids`) as fixed colliders in `physics`, and as meshes: the ground and walls invisible,
 * the posts drawn.
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

export interface CosmeticRoom {
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
  const floor = MeshBuilder.CreateGround("room.floor", { width: ROOM.floorSize, height: ROOM.floorSize }, scene);
  floor.position.y = 0.003;
  floor.material = materials.ground;
  floor.receiveShadows = true;
  mapUvsInMetres(floor, ROOM.floorMetresPerRepeat);
  floor.metadata = { ...floor.metadata, roomPlacement: { role: "floor", solid: true, collider: "ground" } };
  meshes.push(floor);
  const pairs: VisualColliderPair[] = [{ visual: floor.name, collider: "ground" }];

  const dressed: Readonly<Record<RoomRole, Material>> = {
    wall: materials.wall, banner: materials.banner, beam: materials.timber, rack: materials.timber, debris: materials.timber,
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

export interface ArenaWorld {
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
      if (placement?.role !== "beam" && !mesh.metadata?.forgeOpaqueWall) continue;
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
