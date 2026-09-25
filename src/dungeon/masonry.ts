import { WALL_HEIGHT, wallSurface, type WallFace } from "./fog.ts";
import type { DungeonMap, Point } from "./map.ts";

/**
 * The walls' masonry: courses of bevelled blocks on every side of the wall colliders, a coping course on top, and
 * dressed quoins at every outer corner -- which is also every jamb of a door, a corridor mouth and a divider's gap.
 * Set by eye, and judged on the owner's machine.
 *
 * **No block stands proud of its collider.** A block's face is the collider's face or set back from it, and its
 * bevels and joints go into the rock, so what a golem touches is what it sees and nothing drawn over the floor has
 * no body (AGENTS.md, "The visible room is not the collision arena"). The session 02 skin stays behind the blocks as
 * a backing, set back further than any joint, so that no seam can show the void inside the rock.
 */
export const MASONRY = Object.freeze({
  /** Courses below the coping, of equal height. */
  courses: 5,
  /** The coping course's height, and the bevel on its every edge, whose top is the concepts' lit top edge. */
  coping: 0.36, copingBevel: 0.07,
  /** A block's length along the wall, drawn between these and then fitted to the run. */
  length: Object.freeze([0.5, 1.05] as const),
  /** An outer corner's quoins, long and short, alternating course by course between its two faces. */
  quoin: Object.freeze([0.74, 0.4] as const),
  /** The bevel on every other block edge: half the width of a joint. */
  bevel: 0.035,
  /** A block's face is set back from the collider's face by up to this, never forward. Quoins and coping are flush. */
  relief: 0.025,
  /** How far behind the collider's face the backing skin stands, deeper than any block's relief and bevel together
   * and than the coping's bevel; and how far below the wall top its cap, deeper than the coping's bevel. */
  backing: 0.08, cap: 0.12,
  /** The backing's albedo, as a share of the stone's: the joints read as the concepts' dark mortar. */
  mortar: 0.15,
});

export type SideFace = Exclude<WallFace, "top">;
/** How a block ends: bevelled as at any joint, or cut square where an outer corner's arris is the other face's. */
export type BlockEnd = "bevel" | "square";

/** One block, in its face's terms: `plane` is the collider face it sits on, `from` and `to` its span along that
 * face in world metres, `y0` and `y1` its course, `inset` how far its face stands back from the plane. */
export interface Block {
  face: SideFace; plane: number; from: number; to: number; y0: number; y1: number;
  inset: number; bevel: number; ends: readonly [BlockEnd, BlockEnd]; course: number; quoin: boolean;
  /** The cell under the block's middle, which chunks it. */
  cell: Point;
}

/** A face's plane, the axis it runs along, and the way it faces. */
const FACE = Object.freeze({
  "x+": { along: "z", normal: [1, 0, 0], plane: (c: Point) => c.x + 0.5, low: "z-", high: "z+" },
  "x-": { along: "z", normal: [-1, 0, 0], plane: (c: Point) => c.x - 0.5, low: "z-", high: "z+" },
  "z+": { along: "x", normal: [0, 0, 1], plane: (c: Point) => c.z + 0.5, low: "x-", high: "x+" },
  "z-": { along: "x", normal: [0, 0, -1], plane: (c: Point) => c.z - 0.5, low: "x-", high: "x+" },
} as const);
const SIDES: readonly SideFace[] = Object.freeze(["x+", "x-", "z+", "z-"]);

/** A point on a face: `along` it, `y` up it, and `depth` into the rock behind it. */
export function facePoint(face: SideFace, plane: number, along: number, y: number, depth: number): [number, number, number] {
  const { normal } = FACE[face], across = plane - depth * (normal[0] + normal[2]);
  return FACE[face].along === "z" ? [across, y, along] : [along, y, across];
}

/** A hash of integers to [0, 1): the same block gets the same draw however the level is walked. */
export function hash01(...values: number[]): number {
  let h = 0x9e3779b9;
  for (const v of values) { h = Math.imul(h ^ (v | 0), 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; }
  return (h >>> 0) / 4294967296;
}

/** Block lengths that fill `length` exactly: an optional quoin at either end, and drawn lengths between. A run too
 * short for its quoins and a block between them is one stone, as the end of a wall is. */
function lay(length: number, head: number, tail: number, draw: (i: number) => number): number[] {
  const [least, most] = MASONRY.length;
  if (length <= head + tail + least * 0.6) return [length];
  const middle = length - head - tail, count = Math.max(1, Math.round(middle / ((least + most) / 2)));
  const drawn = Array.from({ length: count }, (_, i) => least + (most - least) * draw(i));
  const scale = middle / drawn.reduce((a, b) => a + b, 0);
  return [...(head ? [head] : []), ...drawn.map(d => d * scale), ...(tail ? [tail] : [])];
}

/**
 * Every block on the level's walls, a function of the map. The sides of `wallSurface` are gathered into runs --
 * one face, one plane, consecutive cells -- and each course of a run is laid end to end, so that joints stagger
 * across cell edges rather than drawing the cell grid. A run's end is an outer corner when its end cell also has a
 * side facing on along the run; there, the faces running along z carry the arris and the others end square.
 */
export function masonry(map: DungeonMap): Block[] {
  const sides = wallSurface(map).filter((q): q is { cell: Point; face: SideFace } => q.face !== "top");
  const has = new Set(sides.map(q => `${q.cell.x},${q.cell.z},${q.face}`));
  const blocks: Block[] = [];
  const heights = [...Array.from({ length: MASONRY.courses + 1 }, (_, k) => k * (WALL_HEIGHT - MASONRY.coping) / MASONRY.courses), WALL_HEIGHT];
  for (const face of SIDES) {
    const { along, low, high } = FACE[face], key = (c: Point) => along === "z" ? c.x : c.z, at = (c: Point) => along === "z" ? c.z : c.x;
    const lines = new Map<number, Point[]>();
    for (const { cell } of sides.filter(q => q.face === face)) {
      const line = lines.get(key(cell)); if (line) line.push(cell); else lines.set(key(cell), [cell]);
    }
    for (const cells of lines.values()) {
      cells.sort((a, b) => at(a) - at(b));
      for (let i = 0; i < cells.length;) {
        let j = i; while (j + 1 < cells.length && at(cells[j + 1]) === at(cells[j]) + 1) j++;
        const first = cells[i], last = cells[j], plane = FACE[face].plane(first);
        const from = at(first) - 0.5, to = at(last) + 0.5;
        const corner = [has.has(`${first.x},${first.z},${low}`), has.has(`${last.x},${last.z},${high}`)] as const;
        const arris: BlockEnd = along === "z" ? "bevel" : "square";
        for (let k = 0; k < heights.length - 1; k++) {
          const coping = k === MASONRY.courses;
          const quoin = MASONRY.quoin[(k + (along === "z" ? 0 : 1)) % 2];
          const lengths = lay(to - from, corner[0] ? quoin : 0, corner[1] ? quoin : 0,
            n => hash01(map.seed, SIDES.indexOf(face), plane * 2, from * 2, k, n));
          let start = from;
          lengths.forEach((length, n) => {
            const end = n === lengths.length - 1 ? to : start + length;
            const isQuoin = (n === 0 && corner[0]) || (n === lengths.length - 1 && corner[1]);
            const middle = (start + end) / 2, cell = along === "z" ? { x: first.x, z: Math.round(middle) } : { x: Math.round(middle), z: first.z };
            blocks.push({
              face, plane, from: start, to: end, y0: heights[k], y1: heights[k + 1], course: k, quoin: isQuoin, cell,
              inset: isQuoin || coping ? 0 : MASONRY.relief * hash01(map.seed, 7, SIDES.indexOf(face), plane * 2, Math.round(start * 64), k),
              bevel: coping ? MASONRY.copingBevel : MASONRY.bevel,
              ends: [n === 0 && corner[0] ? arris : "bevel", n === lengths.length - 1 && corner[1] ? arris : "bevel"],
            });
            start = end;
          });
        }
        i = j + 1;
      }
    }
  }
  return blocks;
}

export type Corner = readonly [number, number, number];
/** A quad to draw: four corners in order around it, the way it faces, and optionally its own UVs and a share of
 * its material's albedo (a vertex colour). */
export interface Quad { cell: Point; corners: Corner[]; normal: Corner; uvs?: [number, number][]; shade?: number }

/** The way a quad of four corners faces, turned to agree with `outward`. */
function facing(corners: readonly Corner[], outward: Corner): Corner {
  const [a, b, c, d] = corners, p = [c[0] - a[0], c[1] - a[1], c[2] - a[2]], q = [d[0] - b[0], d[1] - b[1], d[2] - b[2]];
  let n = [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];
  const length = Math.hypot(n[0], n[1], n[2]); n = n.map(v => v / length);
  if (n[0] * outward[0] + n[1] * outward[1] + n[2] * outward[2] < 0) n = n.map(v => -v);
  return [n[0], n[1], n[2]];
}

/**
 * A block as quads: its face, set back by its inset, and a bevel on each edge running back into the rock, except
 * at a square end and along the foot of the bottom course, which sits square on the floor. UVs are metres along the
 * face and up it over `metresPerRepeat`, shifted by a draw of the block's own, so that no two neighbours show the
 * same patch of the map.
 */
export function blockQuads(block: Block, metresPerRepeat: number, seed: number): Quad[] {
  const { face, plane, from, to, y0, y1, inset, bevel: b, ends, cell } = block, foot = block.course === 0 ? 0 : b;
  const [fa, ba] = ends[0] === "bevel" ? [from + b, from] : [from + b, from + b];
  const [fe, be] = ends[1] === "bevel" ? [to - b, to] : [to - b, to - b];
  const u0 = hash01(seed, 11, Math.round(from * 64), Math.round(y0 * 64), Math.round(plane * 2)), v0 = hash01(seed, 13, Math.round(from * 64), Math.round(y0 * 64));
  const p = (a: number, y: number, depth: number): Corner => facePoint(face, plane, a, y, depth);
  const uv = (a: number, y: number): [number, number] => [a / metresPerRepeat + u0, y / metresPerRepeat + v0];
  const out: Corner = FACE[face].normal as unknown as Corner;
  const quad = (points: [number, number, number][], hint: Corner): Quad => {
    const corners = points.map(([a, y, d]) => p(a, y, d));
    return { cell, corners, normal: facing(corners, hint), uvs: points.map(([a, y]) => uv(a, y)) };
  };
  const up: Corner = [out[0], 1, out[2]], down: Corner = [out[0], -1, out[2]];
  const alongUnit = (s: number): Corner => FACE[face].along === "z" ? [out[0], 0, s] : [s, 0, out[2]];
  const quads = [
    quad([[fa, y0 + foot, inset], [fe, y0 + foot, inset], [fe, y1 - b, inset], [fa, y1 - b, inset]], out),
    quad([[fa, y1 - b, inset], [fe, y1 - b, inset], [be, y1, inset + b], [ba, y1, inset + b]], up),
  ];
  if (foot) quads.push(quad([[ba, y0, inset + b], [be, y0, inset + b], [fe, y0 + b, inset], [fa, y0 + b, inset]], down));
  if (ends[0] === "bevel") quads.push(quad([[ba, y0, inset + b], [fa, y0 + foot, inset], [fa, y1 - b, inset], [ba, y1, inset + b]], alongUnit(-1)));
  if (ends[1] === "bevel") quads.push(quad([[fe, y0 + foot, inset], [be, y0, inset + b], [be, y1, inset + b], [fe, y1 - b, inset]], alongUnit(1)));
  return quads;
}

/** The backing skin behind a side: the session 02 quad, set back into the rock by `MASONRY.backing`, in mortar. At
 * the end of a run that is not an outer corner it runs on by as much again, to meet the backing of the face that
 * turns there and close the rock behind the joint at the inner corner. */
function backingQuads(cell: Point, face: SideFace, metresPerRepeat: number, has: (c: Point, f: WallFace) => boolean): Quad[] {
  const { along, low, high } = FACE[face], step = (s: number): Point => along === "z" ? { x: cell.x, z: cell.z + s } : { x: cell.x + s, z: cell.z };
  const runsOn = (s: number, turn: WallFace) => !has(cell, turn) && !has(step(s), face) ? MASONRY.backing : 0;
  const plane = FACE[face].plane(cell), centre = along === "z" ? cell.z : cell.x, d = MASONRY.backing;
  const a0 = centre - 0.5 - runsOn(-1, low), a1 = centre + 0.5 + runsOn(1, high);
  // It stops at the cap, which closes it: any higher and it would rise through the coping's bevel where a face turns.
  const lid = WALL_HEIGHT - MASONRY.cap, points: [number, number][] = [[a0, 0], [a0, lid], [a1, lid], [a1, 0]];
  // The sill closes it at the floor, under the notch each joint's end bevels cut down to the bottom course's foot:
  // the floor's tiles stop at the face, and without it the camera looked down a joint to under the level. Where two
  // sills meet at a corner the face running along z takes the square they share, as it takes the arris.
  const short = (turn: WallFace) => has(cell, turn) ? -d : 0;
  const [s0, s1] = along === "z" ? [a0, a1] : [centre - 0.5 - short(low), centre + 0.5 + short(high)];
  const sill: [number, number][] = [[s0, 0], [s0, d], [s1, d], [s1, 0]];
  return [
    { cell, corners: points.map(([a, y]) => facePoint(face, plane, a, y, d)), normal: FACE[face].normal as unknown as Corner,
      uvs: points.map(([a, y]) => [a / metresPerRepeat, y / metresPerRepeat]), shade: MASONRY.mortar },
    { cell, corners: sill.map(([a, depth]) => facePoint(face, plane, a, 0, depth)), normal: [0, 1, 0], shade: MASONRY.mortar },
  ];
}

/** A wall cell's top, and its cap, the backing's lid below the coping, which closes the rock under any seam at a
 * corner. Both are drawn back from each side the cell has by the coping's bevel: the top so that the bevel shows, and
 * the cap so that it does not show through the arris at an outer corner. The cap still covers the backing, which
 * stands further back. */
function topQuads(cell: Point, sides: ReadonlySet<WallFace>): Quad[] {
  const c = MASONRY.copingBevel, { x, z } = cell;
  const x0 = x - 0.5 + (sides.has("x-") ? c : 0), x1 = x + 0.5 - (sides.has("x+") ? c : 0);
  const z0 = z - 0.5 + (sides.has("z-") ? c : 0), z1 = z + 0.5 - (sides.has("z+") ? c : 0);
  const lid = WALL_HEIGHT - MASONRY.cap;
  return [
    { cell, normal: [0, 1, 0], corners: [[x0, WALL_HEIGHT, z0], [x0, WALL_HEIGHT, z1], [x1, WALL_HEIGHT, z1], [x1, WALL_HEIGHT, z0]] },
    { cell, normal: [0, 1, 0], shade: MASONRY.mortar,
      corners: [[x0, lid, z0], [x0, lid, z1], [x1, lid, z1], [x1, lid, z0]] },
  ];
}

/** Everything the masonry draws on a level's walls: its blocks, the backing behind them, and each wall cell's top
 * and cap. Blocks come first, so that the backing behind them fails the depth test rather than being shaded. */
export function masonryQuads(map: DungeonMap, metresPerRepeat: number): Quad[] {
  const surface = wallSurface(map), faces = new Map<string, Set<WallFace>>();
  for (const { cell, face } of surface) {
    const key = `${cell.x},${cell.z}`, set = faces.get(key);
    if (set) set.add(face); else faces.set(key, new Set([face]));
  }
  const has = (c: Point, f: WallFace) => faces.get(`${c.x},${c.z}`)?.has(f) ?? false;
  const quads = masonry(map).flatMap(block => blockQuads(block, metresPerRepeat, map.seed));
  for (const { cell, face } of surface)
    if (face === "top") quads.push(...topQuads(cell, faces.get(`${cell.x},${cell.z}`)!));
    else quads.push(...backingQuads(cell, face, metresPerRepeat, has));
  return quads;
}
