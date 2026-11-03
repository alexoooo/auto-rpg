import type { FixedCollider, PhysicsWorld } from "../core/engine/engine.ts";
import { cos, sin } from "../core/math/real.ts";
import type { SolidSense } from "../core/mind/object-senses.ts";
import type { Vec3 } from "../core/spec/quantity.ts";
import { levelDefinition, type ArenaLevel } from "./levels.ts";

/**
 * The arena's room, m, set by eye: the floor, the walls a body meets, and
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

/**
 * The ring of posts round the fighting floor: how many, the ring's radius, and each post's size and
 * sides, m, set by eye.
 */
export const ARENA_POSTS = Object.freeze({ count: 8, ring: 12.3, height: 1.7, diameter: 1.1, sides: 8 });

/** One section of the circular parapet: its index round the ring, its centre, world, m, and its turn about up, rad. */
export interface ArenaWall {
  readonly index: number;
  readonly collider: string;
  readonly centre: Vec3;
  readonly turn: number;
}

/** The parapet's sections, `ROOM.wallCount` of them round the floor, each a box `wallWidth` by `wallHeight` by `wallThickness`. */
export function arenaWalls(): readonly ArenaWall[] {
  return Array.from({ length: ROOM.wallCount }, (_, index) => {
    const turn = index * Math.PI * 2 / ROOM.wallCount, radius = ROOM.wallHalfExtent + ROOM.wallThickness / 2;
    return { index, collider: `room.wall.${index}.collider`, centre: [sin(turn) * radius, ROOM.wallHeight / 2, cos(turn) * radius], turn };
  });
}

/**
 * What a body meets in the arena: the ground's slab, the circular parapet (`arenaWalls`) and the ring of posts
 * (`ARENA_POSTS`). A post is the prism its mesh draws, `CreateCylinder` of `sides` sides, corner for corner.
 * Its corners are the world's, so their sines and cosines are the core's own: a bout is the same in every
 * JavaScript engine only if its arena is.
 */
export function arenaSolids(level: ArenaLevel = "open"): readonly SolidSense[] {
  const solids: SolidSense[] = [{ name: "ground", kind: "box", centre: [0, -0.5, 0], size: [ROOM.floorSize, 1, ROOM.floorSize] }];
  for (const wall of arenaWalls()) {
    solids.push({ name: wall.collider, kind: "box", centre: [...wall.centre],
      size: [ROOM.wallWidth, ROOM.wallHeight, ROOM.wallThickness], turn: wall.turn });
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
  return [...solids, ...levelDefinition(level).furniture.map(furnishing => furnishing.solid)];
}

/** The arena's solids as fixed colliders in a world. */
export function addArenaSolids(physics: PhysicsWorld, solids: readonly SolidSense[] = arenaSolids()): FixedCollider[] {
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
