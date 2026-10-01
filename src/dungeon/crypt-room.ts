import { CRYPT_ROOM_LOOK, type CryptArchetype } from "./crypt-archetypes.ts";
import type { DungeonMap, Point } from "./map.ts";
import type { TorchPlacement } from "./dressing.ts";

/** Footprints used by deterministic packing and its coverage checks. */
export const CRYPT_PAVING: Readonly<Record<string, readonly [number,number]>> = {
  paving0:[1,1],paving1:[1,1],paving2:[1,1],paving3:[1,1],
  'slabs-long':[2,1],'slabs-large':[2,2],'slabs-broken':[2,2],'slabs-fractured':[1,1],
};
export interface CryptPlacement { piece: string; x: number; z: number; turn: number; obstacleId?: string }
export interface CryptRoomPlan {
  map: DungeonMap;
  archetypes: CryptArchetype[];
  placements: CryptPlacement[];
  torches: TorchPlacement[];
  bounds: { min: Point; max: Point };
  damp: Point[];
}

/** The odds the dressing draws against, where a room's kind does not give its own
 * (`docs/reference/look.md#crypt-rooms`). */
const CRYPT_ODDS = Object.freeze({
  /** Outside every room, a cell's paving is first tried as a large slab below this draw. */
  largeSlab: .30,
  /** Not a large slab, it is tried as a broken slab below this draw, and as a long one above it. */
  brokenSlab: .63,
  /** A slab that does not fit gives way to one cell: a fractured slab, or else plain paving. */
  fractured: .4,
  /** Scatter on a floor cell of a damp room. */
  dampScatter: .18,
  /** A niche in a stretch of wall outside every room. */
  corridorNiche: .12,
  /** A wall cell with no pier takes a panel, or else a repair. */
  panel: .55,
  /** A straight wall cell is dressed with its pier, panel or repair, or else left plain. */
  detail: .78,
  /** Roots on a wall cell outside every room. */
  corridorRoots: .15,
  /** Roots on the floor before a wall cell of a damp room. */
  floorRoots: .75,
  /** Roots again on each wall cell of a rootbound room. */
  rootboundRoots: .55,
});

/** Where the dressing stands its pieces (`docs/reference/look.md#crypt-rooms`). */
const CRYPT_DRESS = Object.freeze({
  /** The kit's plain pavings, `paving0` up. */
  pavings: 4,
  /** A pier stands on every cell along a wall whose place divides by this. */
  pierEvery: 3,
  /** Scatter lies this far before its niche, m. */
  scatterOut: .85,
  /** A guard room's two banners hang this far either side of its middle, m. */
  bannerAside: 2.7,
});

/** A room's torches (`docs/reference/look.md#crypt-rooms`). */
const CRYPT_TORCH = Object.freeze({
  /** Torches a room. */
  count: 2,
  /** Two of them stand no nearer than this share of the room's shorter side. */
  spacing: .65,
  /** Of two wall cells as far from the room's middle, the one on the wall along z is taken first: the other counts
   * as this much farther, cells. */
  alongX: .1,
  /** The flame stands this far out from its rock cell's centre, and this high, m. */
  flameOut: .65,
  height: 2.05,
  /** The damp under a torch lies this far beyond its light, m. */
  dampOut: 1.4,
});

/** A rock cell that floor touches, and the way its face looks: toward the floor cell that found it last. */
interface WallFace { x: number; z: number; nx: number; nz: number }
/** The rock cells that floor touches, in the order the floor first found each. */
type WallFaces = Map<string, WallFace>;
const faceKey = (x: number, z: number): string => `${x},${z}`;

/** What the steps of the dressing share: the map, the decoration's one stream of draws, and the pieces placed so
 * far. Each step draws and places in its own fixed order, and the steps run in theirs. */
interface Dressing {
  readonly map: DungeonMap;
  readonly art: () => number;
  readonly archetypes: readonly CryptArchetype[];
  readonly placements: CryptPlacement[];
}

function put(d: Dressing, piece: string, x: number, z: number, turn = 0): void {
  d.placements.push({ piece, x, z, turn });
}

/** The look of the room a cell is in, or is against the wall of; none in a corridor. */
function lookAt(d: Dressing, x: number, z: number) {
  const room = d.map.rooms.find(r => x >= r.min.x - 1 && x <= r.max.x + 1 && z >= r.min.z - 1 && z <= r.max.z + 1);
  const type = d.archetypes.find(a => a.room === room?.id);
  return type ? CRYPT_ROOM_LOOK[type.kind] : undefined;
}

/** Paves every floor cell once, with the largest slab drawn that fits, and scatters the damp rooms' floors. */
function pavement(d: Dressing): void {
  const { map: { size, floor, rooms }, art } = d;
  const paved = new Set<number>();
  for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) {
    if (!floor[z * size + x]) continue;
    if (!paved.has(z * size + x)) {
      const room = rooms.find(r => x >= r.min.x && x <= r.max.x && z >= r.min.z && z <= r.max.z);
      const type = d.archetypes.find(a => a.room === room?.id);
      const roll = art(), turn = art() < .5 ? 0 : Math.PI / 2;
      const largeSlab = type ? CRYPT_ROOM_LOOK[type.kind].largeSlab : CRYPT_ODDS.largeSlab;
      let piece = roll < largeSlab ? "slabs-large" : roll < CRYPT_ODDS.brokenSlab ? "slabs-broken" : "slabs-long";
      let [width, depth] = CRYPT_PAVING[piece];
      if (turn) [width, depth] = [depth, width];
      // A slab fits on unpaved floor that does not run out of the room it starts in.
      const cells = Array.from({ length: depth }, (_, dz) => Array.from({ length: width }, (_, dx) => ({ x: x + dx, z: z + dz }))).flat();
      const fits = cells.every(p => p.x < size && p.z < size && floor[p.z * size + p.x] && !paved.has(p.z * size + p.x)
        && (!room || (p.x <= room.max.x && p.z <= room.max.z)));
      if (!fits) {
        width = depth = 1;
        piece = art() < CRYPT_ODDS.fractured ? "slabs-fractured" : "paving" + Math.floor(art() * CRYPT_DRESS.pavings);
      }
      put(d, piece, x + (width - 1) / 2, z + (depth - 1) / 2, turn);
      for (let dz = 0; dz < depth; dz++) for (let dx = 0; dx < width; dx++) paved.add((z + dz) * size + x + dx);
    }
    if (lookAt(d, x, z)?.damp && art() < CRYPT_ODDS.dampScatter) put(d, "scatter", x, z);
  }
}

/** Every rock cell that floor touches. A cell found again keeps its place in the order and takes the later face. */
function wallFaces(map: DungeonMap): WallFaces {
  const { size, floor } = map, faces: WallFaces = new Map();
  for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) {
    if (!floor[z * size + x]) continue;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (!floor[(z + dz) * size + x + dx]) faces.set(faceKey(x + dx, z + dz), { x: x + dx, z: z + dz, nx: -dx, nz: -dz });
    }
  }
  return faces;
}

/** -1 or 1 where the wall turns toward the floor on that side of `face`, an inside corner; 0 where it runs on. */
function cornerSide(map: DungeonMap, faces: WallFaces, face: WallFace): number {
  for (const sign of [-1, 1]) {
    const x = face.x + face.nx + face.nz * sign, z = face.z + face.nz - face.nx * sign;
    if (!map.floor[z * map.size + x] && faces.has(faceKey(x, z))) return sign;
  }
  return 0;
}

/** A niche in each run of three straight wall cells facing one way that the draw allows. Returns the niches, and
 * the cells they took. */
function niches(d: Dressing, faces: WallFaces): { niches: CryptPlacement[]; taken: Set<string> } {
  const taken = new Set<string>(), placed: CryptPlacement[] = [];
  for (const { x, z, nx, nz } of faces.values()) {
    const alongX = nz, alongZ = -nx;
    const span = [-1, 0, 1].map(i => faces.get(faceKey(x + alongX * i, z + alongZ * i)));
    const straight = !span.some(p => !p || p.nx !== nx || p.nz !== nz || cornerSide(d.map, faces, p) !== 0 || taken.has(faceKey(p.x, p.z)));
    if (!straight || d.art() > (lookAt(d, x, z)?.niches ?? CRYPT_ODDS.corridorNiche)) continue;
    put(d, "niche", x, z, Math.atan2(nx, nz));
    placed.push(d.placements.at(-1)!);
    for (const p of span) taken.add(faceKey(p!.x, p!.z));
  }
  return { niches: placed, taken };
}

/** Dresses every wall cell no niche took: a corner, a pier, a panel, a repair or plain wall, and its roots. */
function walls(d: Dressing, faces: WallFaces, taken: ReadonlySet<string>): void {
  const { art } = d;
  for (const face of faces.values()) {
    const { x, z, nx, nz } = face;
    if (taken.has(faceKey(x, z))) continue;
    const corner = cornerSide(d.map, faces, face), look = lookAt(d, x, z), turn = Math.atan2(nx, nz);
    const detail = Math.abs(nx ? z : x) % CRYPT_DRESS.pierEvery === 0 ? "wall-pier" : art() < CRYPT_ODDS.panel ? "wall-panel" : "wall-repair";
    put(d, corner < 0 ? "corner-left" : corner > 0 ? "corner-right" : art() < CRYPT_ODDS.detail ? detail : "wall", x, z, turn);
    if (art() < (look?.roots ?? CRYPT_ODDS.corridorRoots)) put(d, "roots", x, z, turn);
    if (look?.damp && art() < CRYPT_ODDS.floorRoots) put(d, "floor-roots", x + nx, z + nz, turn);
  }
}

/** Roots on each niche and scatter before it, at the odds of its room; a corridor's niche has scatter and no
 * roots. */
function nicheLitter(d: Dressing, placed: readonly CryptPlacement[]): void {
  const { art } = d;
  for (const niche of placed) {
    if (art() < (lookAt(d, niche.x, niche.z)?.roots ?? 0)) put(d, "roots", niche.x, niche.z, niche.turn);
    const nx = Math.sin(niche.turn), nz = Math.cos(niche.turn);
    if (art() < (lookAt(d, niche.x, niche.z)?.scatter ?? 1)) {
      put(d, "scatter", niche.x + nx * CRYPT_DRESS.scatterOut, niche.z + nz * CRYPT_DRESS.scatterOut, niche.turn);
    }
  }
}

/** What a kind of room has besides its furniture: a guard room's banners, a rootbound room's second growth of
 * roots. */
function roomExtras(d: Dressing, faces: WallFaces): void {
  for (const room of d.map.rooms) {
    const type = d.archetypes.find(a => a.room === room.id);
    if (!type) continue;
    switch (type.kind) {
      case "guard":
        for (const x of [room.centre.x - CRYPT_DRESS.bannerAside, room.centre.x + CRYPT_DRESS.bannerAside]) put(d, "banner", x, room.max.z + 1, Math.PI);
        break;
      case "rootbound": {
        const look = CRYPT_ROOM_LOOK[type.kind];
        for (const face of faces.values()) {
          if (lookAt(d, face.x, face.z) === look && d.art() < CRYPT_ODDS.rootboundRoots) put(d, "roots", face.x, face.z, Math.atan2(face.nx, face.nz));
        }
        break;
      }
      case "burial":
      case "chapel": break;
      default: { const never: never = type.kind; throw new Error(`Unknown kind of crypt room: ${String(never)}`); }
    }
  }
}

/** Each room's torches, on its -x and +z walls: the wall cells nearest the room's middle that stand far enough
 * apart. They draw nothing. */
function torches(d: Dressing, faces: WallFaces): TorchPlacement[] {
  const all: TorchPlacement[] = [];
  for (const room of d.map.rooms) {
    const { min, max, centre } = room;
    const type = d.archetypes.find(a => a.room === room.id), look = type ? CRYPT_ROOM_LOOK[type.kind] : undefined;
    const candidates = [...faces.values()].filter(c => (c.x === min.x - 1 && c.z >= min.z && c.z <= max.z) || (c.z === max.z + 1 && c.x >= min.x && c.x <= max.x));
    const fromMiddle = (c: WallFace) => c.x === min.x - 1 ? Math.abs(c.z - centre.z) : Math.abs(c.x - centre.x) + CRYPT_TORCH.alongX;
    const apart = Math.min(max.x - min.x + 1, max.z - min.z + 1) * CRYPT_TORCH.spacing;
    const chosen: TorchPlacement[] = [];
    for (const c of candidates.sort((a, b) => fromMiddle(a) - fromMiddle(b))) {
      if (chosen.some(t => Math.hypot(c.x - t.cell.x, c.z - t.cell.z) < apart)) continue;
      chosen.push({
        ...(look ? { color: look.color, intensity: look.intensity, shadowIntensity: look.shadow } : {}),
        room: room.id, cell: { x: c.x, z: c.z }, facing: { x: c.nx, z: c.nz },
        flame: { x: c.x + c.nx * CRYPT_TORCH.flameOut, y: CRYPT_TORCH.height, z: c.z + c.nz * CRYPT_TORCH.flameOut },
        light: { x: c.x + c.nx, y: CRYPT_TORCH.height, z: c.z + c.nz },
      });
      if (chosen.length === CRYPT_TORCH.count) break;
    }
    all.push(...chosen);
  }
  return all;
}

/** Dresses a crypt's map from the masonry kit: its paving, its walls and niches, each room's extras and torches,
 * and the furniture it is handed. `art` is the decoration's own stream of draws. */
export function dressCryptMap(map: DungeonMap, art: () => number, archetypes: CryptArchetype[], furniture: CryptPlacement[]): CryptRoomPlan {
  const min = { x: Math.min(...map.rooms.map(r => r.min.x)), z: Math.min(...map.rooms.map(r => r.min.z)) };
  const max = { x: Math.max(...map.rooms.map(r => r.max.x)), z: Math.max(...map.rooms.map(r => r.max.z)) };
  const placements: CryptPlacement[] = [];
  const d: Dressing = { map, art, archetypes, placements };
  pavement(d);
  const faces = wallFaces(map);
  const { niches: placed, taken } = niches(d, faces);
  walls(d, faces, taken);
  nicheLitter(d, placed);
  for (const door of map.doors) put(d, "portal", door.point.x, door.point.z, door.axis === "x" ? Math.PI / 2 : 0);
  placements.push(...furniture);
  roomExtras(d, faces);
  const lit = torches(d, faces);
  const damp = lit.filter(t => CRYPT_ROOM_LOOK[archetypes.find(a => a.room === t.room)!.kind].damp)
    .map(t => ({ x: t.light.x + t.facing.x * CRYPT_TORCH.dampOut, z: t.light.z + t.facing.z * CRYPT_TORCH.dampOut }));
  return { map, archetypes, placements, torches: lit, bounds: { min, max }, damp };
}
