import { mulberry32 } from "../rng.ts";
import { isFloor, type DungeonMap, type Point } from "./map.ts";
import { boundary, doorCells, WALL_HEIGHT } from "./fog.ts";
import { CAMERA_AZIMUTH, CAMERA_PITCH, cameraToward } from "./camera.ts";

/** Where the dungeon's body-free decoration goes. Every number here is a starting value set by eye; the owner
 * judges density in play (docs/plans/2026-09-24-dungeon-look-01-light-and-air.md, and -05-dressing.md). */
export const DRESSING = Object.freeze({
  /** No two torches closer than this, in metres. */
  torchSpacing: 7,
  /** The flame's centre height, and how far proud of the wall face it stands. A flame is translucent light and owns
   * no body -- the body-free case AGENTS.md names for scrims -- so it may hang over the floor. */
  torchHeight: 2.05, torchProud: 0.12,
  /** How far off the wall face the torch's light stands. A light at the flame would sit 0.12 m from the stone, and an
   * inverse-square light that close burns a hot spot into the wall; this one lights the floor the flame looks at. */
  torchLightProud: 0.4,
  /** Flat markings: a whole number of them in each room, drawn between these, and a chance for each corridor cell. */
  decalsPerRoom: Object.freeze([3, 6] as const), corridorDecalsPerCell: 0.02,
  /** How often each kind is drawn, and the side of its square in metres. A size is the whole tile's, rim included. */
  decals: Object.freeze({
    blood: Object.freeze({ weight: 0.25, size: Object.freeze([0.8, 1.5] as const) }),
    crack: Object.freeze({ weight: 0.25, size: Object.freeze([1, 1.8] as const) }),
    moss: Object.freeze({ weight: 0.2, size: Object.freeze([0.9, 1.8] as const) }),
    puddle: Object.freeze({ weight: 0.15, size: Object.freeze([0.9, 1.6] as const) }),
    bones: Object.freeze({ weight: 0.15, size: Object.freeze([0.6, 1] as const) }),
  }),
  /** No marking comes within this of the start or the exit, where the eye goes first. */
  keepClear: 1.2,
  /** Roots hang from a wall's top: at most this many a level, no two closer, this wide, and reaching this far down. */
  rootsPerLevel: 6, rootSpacing: 4, rootWidth: Object.freeze([0.5, 0.9] as const), rootDrop: Object.freeze([0.9, 1.7] as const),
  /** How far off the wall's face a hung piece stands. */
  hungProud: 0.01,
  /** The chance of a web in each inner corner of a room that faces the camera, how far along each wall it reaches, and
   * how far down it hangs. With the camera square to the walls two corners of a room face it, where one did on the
   * diagonal, so the chance is about half what it was: 0.5 on the diagonal and 0.28 square to the walls give 2.84 and
   * 2.86 webs a level (seeds 1-50). */
  cobwebsPerRoomCorner: 0.28, cobwebSpan: Object.freeze([0.35, 0.55] as const), cobwebDrop: Object.freeze([0.45, 0.7] as const),
});

/**
 * How squarely a hung piece's face must look toward the camera, as the ground dot product of its normal with the unit
 * step toward the camera (`cameraToward`). A hung piece is one face, culled from behind as the walls are, so it hangs
 * only where the camera sees that face. The facing tests ask 0.3 of the face's normal against the camera's view,
 * which is `cos(pitch)` of the ground dot: 0.3 / cos 30 = 0.346. A bare `> 0` would hang roots on a face nearly
 * edge-on at `?azimuth=170`, where the side walls score 0.17. On the diagonal every face toward the camera scores
 * 0.707; square to the walls, the face looking at the camera scores 1 and the side faces 0.
 */
export const FACING_MIN = 0.35;
const facesCamera = (p: Point, toward: Point) => p.x * toward.x + p.z * toward.z >= FACING_MIN;
/** A web hangs across its corner's diagonal, so its face looks along `into`, a diagonal of unit steps. */
const webFacesCamera = (into: Point, toward: Point) => (into.x * toward.x + into.z * toward.z) * Math.SQRT1_2 >= FACING_MIN;

/**
 * Whether the camera sees a point in front of a wall. Its sight line back toward the camera rises tan(pitch) a metre
 * across the ground, and has to clear the walls' top before it passes over rock. Taken at `CAMERA_PITCH`, the
 * page's default, so a steeper `?pitch=` sees at least as much; the comparison goes down to 25 degrees, where a piece
 * judged seen here may be partly hidden.
 */
function seen(map: DungeonMap, p: { x: number; y: number; z: number }, toward: Point): boolean {
  const rise = Math.tan(CAMERA_PITCH);
  for (let s = 0.05; p.y + s * rise < WALL_HEIGHT; s += 0.05)
    if (!isFloor(map, Math.round(p.x + toward.x * s), Math.round(p.z + toward.z * s))) return false;
  return true;
}

/** Whether roots can be seen at all: each end of their width and their middle, halfway down them, in front of the wall. */
const rootsSeen = (map: DungeonMap, r: { cell: Point; facing: Point; along: number; width: number; drop: number }, toward: Point) => {
  const c = hungCentre(r), y = WALL_HEIGHT - r.drop / 2;
  return [-0.5, 0, 0.5].every(k => seen(map, {
    x: c.x + r.facing.x * 0.01 + Math.abs(r.facing.z) * k * r.width, y, z: c.z + r.facing.z * 0.01 + Math.abs(r.facing.x) * k * r.width }, toward));
};

/** The table `dressingPlacements` reads: `DRESSING`, or a caller's variation of it. */
export type DressingTable = typeof DRESSING;

/** The top of the floor's tiles, which every marking lies on. `world.ts` builds its tiles to this. */
export const FLOOR_TOP = 0.015;
/** How far a piece may stand off a wall's face: the allowance the masonry session gave the sconces. */
export const WALL_ALLOWANCE = 0.08;
/** Markings that overlap are lifted apart by a layer each, so that no two share a depth; there are this many. */
export const DECAL_LAYERS = 3;
/** The height a marking lies at: 4 mm over the tiles, and 2 mm more a layer. */
export const decalHeight = (layer: number): number => FLOOR_TOP + 0.004 + 0.002 * layer;

export type FloorDecal = keyof DressingTable["decals"];
export const FLOOR_DECALS = Object.freeze(Object.keys(DRESSING.decals) as FloorDecal[]);

/**
 * The dungeon's body-free clutter.
 * - A **decal** is a flat marking on the floor: a square `size` a side about `at`, turned by `turn`, at
 *   `decalHeight(layer)`.
 * - **Roots** hang on the face of the rock cell `cell` that looks along `facing` at floor, `hungProud` off it, from the
 *   wall's top down by `drop`, `width` wide and centred `along` the face from the cell's middle.
 * - A **cobweb** hangs across an inner corner of a room, at the half-integer point `corner`, where the floor lies
 *   toward `into` (a diagonal of unit steps): from `span` along each wall at the top, down by `drop`.
 */
export type Dressing =
  | { kind: "decal"; decal: FloorDecal; at: Point; size: number; turn: number; layer: number }
  | { kind: "roots"; cell: Point; facing: Point; along: number; width: number; drop: number }
  | { kind: "cobweb"; corner: Point; into: Point; span: number; drop: number };

/** A decal's four corners on the floor, in order around it, starting from its tile's (u0, v0) corner. */
export function decalCorners(d: { at: Point; size: number; turn: number }): Point[] {
  const c = Math.cos(d.turn), s = Math.sin(d.turn), h = d.size / 2;
  return [[-h, -h], [-h, h], [h, h], [h, -h]].map(([a, b]) => ({ x: d.at.x + a * c - b * s, z: d.at.z + a * s + b * c }));
}

/** Where hung roots meet their wall: the middle of their top edge, on the face. */
export const hungCentre = (r: { cell: Point; facing: Point; along: number }): Point =>
  ({ x: r.cell.x + r.facing.x * 0.5 + Math.abs(r.facing.z) * r.along, z: r.cell.z + r.facing.z * 0.5 + Math.abs(r.facing.x) * r.along });

export interface TorchPlacement {
  /** The rock cell the sconce is set into. */
  cell: Point;
  /** Unit step from the rock cell to the floor cell it lights: one of the four axis directions. */
  facing: Point;
  flame: { x: number; y: number; z: number };
  light: { x: number; y: number; z: number };
  room: number;
}

const AXES: readonly Point[] = [{ x: 1, z: 0 }, { x: -1, z: 0 }, { x: 0, z: 1 }, { x: 0, z: -1 }];

/** Which room's inclusive bounds hold a cell, or -1. Bounds never touch, so there is at most one. */
function roomAt(map: DungeonMap, x: number, z: number): number {
  return map.rooms.findIndex(r => x >= r.min.x && x <= r.max.x && z >= r.min.z && z <= r.max.z);
}

/**
 * Torches on the outer walls of rooms, a function of the seed.
 *
 * A torch hangs in a rock cell that lies inside no room's bounds -- so never on a divider or its arch, which
 * are rock inside a room -- facing an axis neighbour that is floor inside a room. A rock cell with any floor
 * outside every room among its eight neighbours is the jamb of a corridor mouth, where a door hangs, and
 * carries none. Candidates are shuffled by a stream of their own and taken greedily while no two flames are
 * closer than `torchSpacing`, the one density rule: it puts at most five in a room on seeds 1-300, and a cap of
 * four per room changed no level on seeds 1-50, so it went. The result is sorted only so that its order does not
 * depend on the draw.
 */
export function torchPlacements(map: DungeonMap, seed: number): TorchPlacement[] {
  const candidates: { cell: Point; facing: Point; room: number }[] = [];
  for (let z = 0; z < map.size; z++) for (let x = 0; x < map.size; x++) {
    if (isFloor(map, x, z) || roomAt(map, x, z) >= 0) continue;
    let mouth = false;
    for (let dz = -1; dz <= 1 && !mouth; dz++) for (let dx = -1; dx <= 1; dx++)
      if (isFloor(map, x + dx, z + dz) && roomAt(map, x + dx, z + dz) < 0) { mouth = true; break; }
    if (mouth) continue;
    for (const facing of AXES) {
      if (!isFloor(map, x + facing.x, z + facing.z)) continue;
      const room = roomAt(map, x + facing.x, z + facing.z);
      if (room >= 0) candidates.push({ cell: { x, z }, facing, room });
    }
  }
  const random = mulberry32((seed ^ 0x70c4ec) >>> 0);
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  const taken: TorchPlacement[] = [];
  const at = (cell: Point, facing: Point, proud: number) =>
    ({ x: cell.x + facing.x * (0.5 + proud), y: DRESSING.torchHeight, z: cell.z + facing.z * (0.5 + proud) });
  for (const { cell, facing, room } of candidates) {
    const flame = at(cell, facing, DRESSING.torchProud);
    if (taken.some(t => Math.hypot(t.flame.x - flame.x, t.flame.z - flame.z) < DRESSING.torchSpacing)) continue;
    taken.push({ cell, facing, flame, light: at(cell, facing, DRESSING.torchLightProud), room });
  }
  return taken.sort((a, b) => a.room - b.room || a.cell.z - b.cell.z || a.cell.x - b.cell.x ||
    a.facing.z - b.facing.z || a.facing.x - b.facing.x);
}

/** Whether a marking's whole square lies on floor: no rock cell's square overlaps it. A square that only touches
 * rock along an edge or at a point does not overlap it. */
function onFloor(map: DungeonMap, d: { at: Point; size: number; turn: number }): boolean {
  const square = decalCorners(d), xs = square.map(p => p.x), zs = square.map(p => p.z);
  const axes = [{ x: 1, z: 0 }, { x: 0, z: 1 }, { x: Math.cos(d.turn), z: Math.sin(d.turn) }, { x: -Math.sin(d.turn), z: Math.cos(d.turn) }];
  const span = (points: Point[], axis: Point) => {
    const along = points.map(p => p.x * axis.x + p.z * axis.z);
    return [Math.min(...along), Math.max(...along)];
  };
  for (let z = Math.round(Math.min(...zs)); z <= Math.round(Math.max(...zs)); z++)
    for (let x = Math.round(Math.min(...xs)); x <= Math.round(Math.max(...xs)); x++) {
      if (isFloor(map, x, z)) continue;
      const cell = [{ x: x - 0.5, z: z - 0.5 }, { x: x + 0.5, z: z - 0.5 }, { x: x + 0.5, z: z + 0.5 }, { x: x - 0.5, z: z + 0.5 }];
      // Two convex shapes overlap unless some edge direction of either separates them.
      if (axes.every(axis => {
        const [a0, a1] = span(square, axis), [b0, b1] = span(cell, axis);
        return a1 > b0 + 1e-9 && b1 > a0 + 1e-9;
      })) return false;
    }
  return true;
}

/** Whether two markings' squares can overlap: their circumcircles do. */
const decalsMeet = (a: { at: Point; size: number }, b: { at: Point; size: number }) =>
  Math.hypot(a.at.x - b.at.x, a.at.z - b.at.z) < (a.size + b.size) * Math.SQRT1_2;

/** How close a marking's square comes to a point, at worst: its circumcircle's distance. */
const decalReach = (d: { at: Point; size: number }, p: Point) => Math.hypot(d.at.x - p.x, d.at.z - p.z) - d.size * Math.SQRT1_2;

/** A root hung this near a flame would be burning; a web this near one would hang through it. */
const ROOT_TORCH_CLEARANCE = 1.5, WEB_TORCH_CLEARANCE = 1.2;

/** A room's inner corners: a floor cell inside a room, and a corner of it where the two cells beside it and the one
 * across it are all rock. */
function innerCorners(map: DungeonMap): { corner: Point; into: Point }[] {
  const corners: { corner: Point; into: Point }[] = [];
  for (let z = 0; z < map.size; z++) for (let x = 0; x < map.size; x++) {
    if (!isFloor(map, x, z) || roomAt(map, x, z) < 0) continue;
    for (const [dx, dz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]])
      if (!isFloor(map, x + dx, z) && !isFloor(map, x, z + dz) && !isFloor(map, x + dx, z + dz))
        corners.push({ corner: { x: x + dx / 2, z: z + dz / 2 }, into: { x: -dx, z: -dz } });
  }
  return corners;
}

/**
 * The level's clutter, a function of the seed, drawn from a stream of its own so that no change here moves a torch:
 * `torchPlacements` reads nothing of this. Markings are drawn in each room and along the corridors, and each is kept
 * only where its whole square lies on floor, clear of the start and the exit, with a layer free of every marking it
 * overlaps. Roots hang on walls that face floor, clear of torches and doorways; webs hang in rooms' inner corners.
 * Both hang only where the camera, standing `toward` of the hero, sees their face (`FACING_MIN`), and roots only where
 * no nearer wall hides the top half of them. The dressing is baked once a level, so the page hands its own view.
 * Every placement passes `validateDressing`.
 */
export function dressingPlacements(map: DungeonMap, seed: number, densities: DressingTable = DRESSING,
  toward: Point = cameraToward(CAMERA_AZIMUTH)): Dressing[] {
  const random = mulberry32((seed ^ 0xd2e55) >>> 0), torches = torchPlacements(map, seed);
  const between = ([lo, hi]: readonly [number, number]) => lo + (hi - lo) * random();
  const total = FLOOR_DECALS.reduce((s, k) => s + densities.decals[k].weight, 0);
  const drawKind = (): FloorDecal => {
    let pick = random() * total;
    for (const k of FLOOR_DECALS) { pick -= densities.decals[k].weight; if (pick < 0) return k; }
    return FLOOR_DECALS[FLOOR_DECALS.length - 1];
  };
  const decals: Extract<Dressing, { kind: "decal" }>[] = [];
  const place = (at: () => Point) => {
    for (let attempt = 0; attempt < 20; attempt++) {
      const decal = drawKind(), d = { at: at(), size: between(densities.decals[decal].size), turn: random() * Math.PI * 2 };
      if (!onFloor(map, d) || decalReach(d, map.start) < densities.keepClear || decalReach(d, map.exit) < densities.keepClear) continue;
      const taken = new Set(decals.filter(o => decalsMeet(o, d)).map(o => o.layer));
      const layer = Array.from({ length: DECAL_LAYERS }, (_, i) => i).find(i => !taken.has(i));
      if (layer === undefined) continue;
      decals.push({ kind: "decal", decal, ...d, layer }); return;
    }
  };
  for (const room of map.rooms) {
    const [lo, hi] = densities.decalsPerRoom, count = lo + Math.floor(random() * (hi - lo + 1));
    for (let i = 0; i < count; i++)
      place(() => ({ x: room.min.x - 0.5 + random() * (room.max.x - room.min.x + 1), z: room.min.z - 0.5 + random() * (room.max.z - room.min.z + 1) }));
  }
  for (let z = 0; z < map.size; z++) for (let x = 0; x < map.size; x++)
    if (isFloor(map, x, z) && roomAt(map, x, z) < 0 && random() < densities.corridorDecalsPerCell)
      place(() => ({ x: x + random() - 0.5, z: z + random() - 0.5 }));

  const doorways = new Set(map.doors.flatMap(doorCells).map(c => `${c.x},${c.z}`));
  const faces: { cell: Point; facing: Point }[] = [];
  for (let z = 0; z < map.size; z++) for (let x = 0; x < map.size; x++) if (boundary(map, x, z))
    for (const facing of AXES) if (facesCamera(facing, toward) && isFloor(map, x + facing.x, z + facing.z) && !doorways.has(`${x + facing.x},${z + facing.z}`))
      faces.push({ cell: { x, z }, facing });
  for (let i = faces.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [faces[i], faces[j]] = [faces[j], faces[i]]; }
  const roots: Extract<Dressing, { kind: "roots" }>[] = [];
  for (const { cell, facing } of faces) {
    if (roots.length >= densities.rootsPerLevel) break;
    const width = between(densities.rootWidth), along = (random() - 0.5) * (1 - width);
    const r = { kind: "roots" as const, cell, facing, along, width, drop: between(densities.rootDrop) }, centre = hungCentre(r);
    if (torches.some(t => Math.hypot(t.flame.x - centre.x, t.flame.z - centre.z) < ROOT_TORCH_CLEARANCE)) continue;
    if (roots.some(o => { const c = hungCentre(o); return Math.hypot(c.x - centre.x, c.z - centre.z) < densities.rootSpacing; })) continue;
    if (!rootsSeen(map, r, toward)) continue;
    roots.push(r);
  }

  const webs: Extract<Dressing, { kind: "cobweb" }>[] = [];
  for (const { corner, into } of innerCorners(map)) {
    if (!webFacesCamera(into, toward) || random() >= densities.cobwebsPerRoomCorner) continue;
    const span = between(densities.cobwebSpan), drop = between(densities.cobwebDrop);
    if (!torches.some(t => Math.hypot(t.flame.x - corner.x, t.flame.z - corner.z) < WEB_TORCH_CLEARANCE))
      webs.push({ kind: "cobweb", corner, into, span, drop });
  }
  return [...decals, ...roots, ...webs];
}

/** Every reason a dressing is not body-free clutter that the colliders allow, or that a camera standing `toward` of
 * the hero would not see; empty when it is. */
export function validateDressing(map: DungeonMap, dressing: readonly Dressing[], torches: readonly TorchPlacement[],
  toward: Point = cameraToward(CAMERA_AZIMUTH)): string[] {
  const problems: string[] = [], doorways = map.doors.flatMap(doorCells);
  const decals = dressing.filter(d => d.kind === "decal");
  for (const d of dressing) {
    if (d.kind === "decal") {
      const name = `${d.decal} at (${d.at.x.toFixed(2)}, ${d.at.z.toFixed(2)})`, y = decalHeight(d.layer);
      if (!FLOOR_DECALS.includes(d.decal)) problems.push(`${name} is no kind of marking`);
      if (!Number.isInteger(d.layer) || d.layer < 0 || d.layer >= DECAL_LAYERS) problems.push(`${name} is on layer ${d.layer}`);
      if (!(y > FLOOR_TOP && y <= FLOOR_TOP + 0.02)) problems.push(`${name} lies at ${y} m, not on the floor`);
      if (!onFloor(map, d)) problems.push(`${name} leaves the floor`);
      if (decalReach(d, map.start) < DRESSING.keepClear || decalReach(d, map.exit) < DRESSING.keepClear) problems.push(`${name} is at the start or the exit`);
      if (decals.some(o => o !== d && o.layer === d.layer && decalsMeet(o, d))) problems.push(`${name} shares a depth with a marking it overlaps`);
    } else if (d.kind === "roots") {
      const { cell, facing } = d, name = `roots at (${cell.x}, ${cell.z})`, centre = hungCentre(d);
      if (!boundary(map, cell.x, cell.z)) problems.push(`${name} hang on no collider`);
      if (Math.abs(facing.x) + Math.abs(facing.z) !== 1 || !isFloor(map, cell.x + facing.x, cell.z + facing.z)) problems.push(`${name} face no floor`);
      if (Math.abs(d.along) + d.width / 2 > 0.5 + 1e-9) problems.push(`${name} leave their cell's face`);
      if (!(d.drop > 0 && d.drop <= WALL_HEIGHT - 0.4)) problems.push(`${name} drop ${d.drop} m`);
      if (!(DRESSING.hungProud > 0 && DRESSING.hungProud <= WALL_ALLOWANCE)) problems.push(`${name} stand ${DRESSING.hungProud} m off the wall`);
      if (torches.some(t => Math.hypot(t.flame.x - centre.x, t.flame.z - centre.z) < ROOT_TORCH_CLEARANCE)) problems.push(`${name} hang at a torch`);
      if (doorways.some(c => c.x === cell.x + facing.x && c.z === cell.z + facing.z)) problems.push(`${name} hang in a doorway`);
      if (!facesCamera(facing, toward)) problems.push(`${name} face away from the camera`);
      else if (!rootsSeen(map, d, toward)) problems.push(`${name} hang where a nearer wall hides them`);
    } else {
      const { corner, into } = d, name = `a web at (${corner.x}, ${corner.z})`, floor = { x: corner.x + into.x / 2, z: corner.z + into.z / 2 };
      if (Math.abs(into.x) !== 1 || Math.abs(into.z) !== 1 || !Number.isInteger(floor.x) || !Number.isInteger(floor.z)) problems.push(`${name} is not in a corner`);
      else if (!isFloor(map, floor.x, floor.z) || isFloor(map, floor.x - into.x, floor.z) || isFloor(map, floor.x, floor.z - into.z)
        || isFloor(map, floor.x - into.x, floor.z - into.z)) problems.push(`${name} is not in an inner corner`);
      if (!webFacesCamera(into, toward)) problems.push(`${name} faces away from the camera`);
      // Silk: alpha-tested, so each strand is opaque, but too thin to look solid, and a blade that passes through a web
      // is what a web allows. Kept within its corner's cell and at least 2 m up, clear of a golem's head. A raised
      // weapon still reaches it (the arena's reach ceiling is 3.6 m), which a web allows too.
      if (!(d.span > 0 && d.span <= 0.6)) problems.push(`${name} spans ${d.span} m`);
      if (!(d.drop > 0 && WALL_HEIGHT - d.drop >= 2)) problems.push(`${name} hangs down to ${(WALL_HEIGHT - d.drop).toFixed(2)} m`);
      if (torches.some(t => Math.hypot(t.flame.x - corner.x, t.flame.z - corner.z) < WEB_TORCH_CLEARANCE)) problems.push(`${name} hangs at a torch`);
    }
  }
  return problems;
}
