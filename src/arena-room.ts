import { VertexBuffer } from "@babylonjs/core/Buffers/buffer.js";
import type { Material } from "@babylonjs/core/Materials/material.js";
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate.js";
import { PhysicsShapeType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";
import type { Scene } from "@babylonjs/core/scene.js";

// `Mesh.createInstance` is registered by this module rather than by Mesh itself.
import "@babylonjs/core/Meshes/instancedMesh.js";

import { COLLIDES, LAYER } from "./physics.ts";
import { applyObjectSurface, type ObjectMaterials } from "./object-surfaces.ts";
import { ROOM_METRES } from "./materials.ts";

export interface RoomMaterials extends ObjectMaterials {
  ground: Material;
  wall: Material;
  timber: Material;
  banner: Material;
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

export interface RoomGroup {
  role: RoomPlacement["role"];
  metresPerRepeat: number;
  placements: readonly RoomPlacement[];
}

export interface ShadowRegistry {
  add(mesh: AbstractMesh): void;
  remove(mesh: AbstractMesh): void;
}

export interface RoomOcclusionTarget {
  readonly point: { x: number; y: number; z: number };
  /** Pooled arrows remain present while parked; only their live trace protects a ray. */
  readonly active?: () => boolean;
}

/** Rebuild the live caster list without teaching a visual scrim to look solid. */
export function refreshShadowCasters(scene: Scene, shadows: ShadowGenerator): void {
  const list = shadows.getShadowMap()?.renderList;
  if (!list) return;
  list.length = 0;
  for (const mesh of scene.meshes) {
    if (mesh.name === "ground") continue;
    const roomPlacement = mesh.metadata?.roomPlacement as { role?: string; solid?: boolean } | undefined;
    if (roomPlacement?.role === "floor" || roomPlacement?.solid === false) continue;
    // A temporarily culled beam remains a caster. Otherwise refresh removes it
    // from the list and revealing the instance on the next frame cannot restore
    // its shadow without another full-scene refresh.
    if (!mesh.isVisible && !roomPlacement?.solid) continue;
    if (
      mesh.name.startsWith("aim.")
      || mesh.name.startsWith("target.")
      || mesh.name.startsWith("takeover.")
      || mesh.name.startsWith("rig.")
    ) continue;
    list.push(mesh);
  }
}

const NO_SHADOWS: ShadowRegistry = Object.freeze({ add: () => {}, remove: () => {} });
const MATERIAL_TEXTURE_FIELDS = Object.freeze([
  "albedoTexture", "diffuseTexture", "bumpTexture", "metallicTexture", "ambientTexture",
] as const);
const CARTESIAN_AXES = Object.freeze(["x", "y", "z"] as const);

export const ROOM = Object.freeze({
  groundHalfExtent: 30,
  /** Conservative crown + raised arm + longest carried object envelope. */
  maxReachHeight: 3.6,
  floorSize: 60,
  floorMetresPerRepeat: ROOM_METRES.floor,
  wallWidth: 26.24,
  wallHeight: 4.2,
  /** Depth of the authoritative boxes whose inner faces meet the wall scrims. */
  wallThickness: 0.24,
  wallHalfExtent: 13,
  wallMetresPerRepeat: ROOM_METRES.wall,
  timberMetresPerRepeat: ROOM_METRES.timber,
  bannerMetresPerRepeat: ROOM_METRES.banner,
});

const wall = (name: string, x: number, z: number, rotationY: number, halfExtent: readonly [number, number, number]): RoomPlacement => ({
  name, role: "wall", position: [x, ROOM.wallHeight / 2, z], rotationY, halfExtent,
  // These are translucent textile-like scrims, not masonry silhouettes. Their
  // non-solidity is visible and is asserted beside the PBR opacity contract.
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

/** One immutable authority table shared by browser and headless bouts. */
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
  role: RoomPlacement["role"],
  position: readonly [number, number, number],
  halfExtent: readonly [number, number, number],
  solid = true,
  rotationY = 0,
): RoomPlacement => ({ name, role, position, rotationY, halfExtent, solid, collider: null });

/**
 * The placement table is also the refusal boundary. Nothing solid is admitted
 * below the conservative reach ceiling unless it names a collider already in
 * the authoritative arena. A dynamic fighter can keep moving beyond the slab,
 * so distance is not an admission rule; only overhead solids are body-free.
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

export function validateRoomPlacements(groups: readonly RoomGroup[]): string[] {
  const failures: string[] = [];
  for (const group of groups) {
    for (const placement of group.placements) {
      if (placement.role !== group.role) failures.push(`${placement.name} is in the ${group.role} instance group`);
      if (placement.collider && !existingColliders.has(placement.collider)) {
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

/** Resolve pair names against live authority, not against the placement table. */
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
    if (!collider.physicsBody) {
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
  let mesh: Mesh;
  if (group.role === "wall") {
    mesh = MeshBuilder.CreatePlane(group.placements[0].name, {
      width: ROOM.wallWidth, height: ROOM.wallHeight, sideOrientation: 2,
    }, scene);
  } else if (group.role === "beam") {
    mesh = MeshBuilder.CreateBox(group.placements[0].name, { width: 4.2, height: 0.24, depth: 0.24 }, scene);
  } else if (group.role === "banner") {
    mesh = MeshBuilder.CreatePlane(group.placements[0].name, { width: 1.2, height: 1.8, sideOrientation: 2 }, scene);
  } else if (group.role === "rack") {
    mesh = MeshBuilder.CreateGround(group.placements[0].name, { width: 1.6, height: 0.4 }, scene);
  } else {
    mesh = MeshBuilder.CreateGround(group.placements[0].name, { width: 0.8, height: 0.26 }, scene);
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
  let first = 0;
  let last = 1;
  for (const axis of CARTESIAN_AXES) {
    const start = from[axis];
    const end = axis === "x" ? toX : axis === "y" ? toY : toZ;
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

export interface ArenaColliders {
  readonly meshes: readonly Mesh[];
  readonly pairs: readonly VisualColliderPair[];
  dispose(): void;
}

export function buildArenaColliders(
  scene: Scene,
  materials: RoomMaterials,
  shadows: ShadowRegistry = NO_SHADOWS,
): ArenaColliders {
  const meshes: Mesh[] = [];
  const aggregates: PhysicsAggregate[] = [];
  const pairs: VisualColliderPair[] = [];
  const ground = MeshBuilder.CreateBox("ground", { width: 60, height: 1, depth: 60 }, scene);
  ground.position.y = -0.5;
  ground.material = materials.ground;
  ground.isVisible = false;
  const groundBody = new PhysicsAggregate(
    ground, PhysicsShapeType.BOX, { mass: 0, friction: 0.9, restitution: 0.02 }, scene,
  );
  groundBody.shape.filterMembershipMask = LAYER.WORLD;
  groundBody.shape.filterCollideMask = COLLIDES.WORLD;
  meshes.push(ground); aggregates.push(groundBody);

  for (const wall of ROOM_WALL_COLLIDERS) {
    const collider = MeshBuilder.CreateBox(wall.name, {
      width: wall.width, height: wall.height, depth: wall.depth,
    }, scene);
    collider.position.set(...wall.position);
    collider.isVisible = false;
    const body = new PhysicsAggregate(
      collider, PhysicsShapeType.BOX, { mass: 0, friction: 0.3, restitution: 0.05 }, scene,
    );
    body.shape.filterMembershipMask = LAYER.WORLD;
    body.shape.filterCollideMask = COLLIDES.WORLD;
    meshes.push(collider); aggregates.push(body);
  }

  for (let index = 0; index < 14; index += 1) {
    const angle = (index / 14) * Math.PI * 2;
    const post = MeshBuilder.CreateCylinder(`post${index}`, { height: 1.5, diameter: 0.17, tessellation: 8 }, scene);
    post.position.set(Math.sin(angle) * 9.5, 0.75, Math.cos(angle) * 9.5);
    applyObjectSurface(post, "arena.post", materials);
    post.receiveShadows = true;
    shadows.add(post);
    const body = new PhysicsAggregate(post, PhysicsShapeType.CYLINDER, { mass: 0 }, scene);
    body.shape.filterMembershipMask = LAYER.WORLD;
    body.shape.filterCollideMask = COLLIDES.WORLD;
    meshes.push(post); aggregates.push(body);
    pairs.push({ visual: post.name, collider: post.name });
  }
  return {
    meshes,
    pairs,
    dispose: () => {
      for (const mesh of meshes) {
        if (mesh.name.startsWith("post")) shadows.remove(mesh);
      }
      for (const aggregate of aggregates) aggregate.dispose();
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

  for (const group of groups) {
    const source = roomSource(scene, group);
    source.material = group.role === "wall" ? materials.wall
      : group.role === "banner" ? materials.banner : materials.timber;
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
  materials: RoomMaterials,
  shadows: ShadowRegistry = NO_SHADOWS,
  groups: readonly RoomGroup[] = ROOM_GROUPS,
): ArenaWorld {
  const colliders = buildArenaColliders(scene, materials, shadows);
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
      if (mesh.physicsBody) census.bodies += 1;
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
      if (placement?.role !== "beam") continue;
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
