import { mulberry32 } from "../rng.ts";

/**
 * The dungeon's dressing images, painted in code into one atlas: no download and no binary in the repository, as the
 * masonry has none. Node loads this file; it builds bytes, and `world.ts` hands them to the GPU.
 *
 * Every tile is a shape on a clear ground. The renderer alpha-tests it, so a decal's edge is where its alpha crosses a
 * half, and a tile's outer `ATLAS.rim` pixels are clear so that no filtered sample takes a neighbour's colour.
 */
export const DECAL_KINDS = Object.freeze(["blood", "crack", "moss", "puddle", "bones", "roots", "cobweb",
  "rubble", "scorch", "straw", "grime", "stain", "lichen", "fissure", "chains", "banner"] as const);
export type DecalKind = (typeof DECAL_KINDS)[number];

export const ATLAS = Object.freeze({ tile: 256, columns: 4, rows: 4, rim: 6 });

/**
 * The pieces that hang on a wall's face, each with its tile's aspect, width over height. A piece's quad is not square
 * (chains are 0.3 by 1 m and more), and a square tile stretched onto it would stretch its strokes and void the mip
 * rule, which assumes a tile shrinks the same both ways. So each is painted in the centred part of its tile that has
 * its aspect (`muralRect`), and drawn `width / aspect` high. The aspect lives here because the painting and the quad
 * have to agree on it.
 */
export const MURAL_ASPECT = Object.freeze({ stain: 0.45, lichen: 1, fissure: 0.45, chains: 0.3, banner: 0.55 } as const);
export type WallPiece = keyof typeof MURAL_ASPECT;
export const WALL_PIECES = Object.freeze(Object.keys(MURAL_ASPECT) as WallPiece[]);

/** A tile's rectangle in the atlas, as `[u0, v0, u1, v1]`. Row 0 of the bytes is v = 0, and a hung tile's top. */
export function atlasRect(kind: DecalKind): [number, number, number, number] {
  const i = DECAL_KINDS.indexOf(kind), c = i % ATLAS.columns, r = Math.floor(i / ATLAS.columns);
  return [c / ATLAS.columns, r / ATLAS.rows, (c + 1) / ATLAS.columns, (r + 1) / ATLAS.rows];
}

/** The part of a wall piece's tile its quad shows: the whole height, and the centred width of its aspect. */
export function muralRect(piece: WallPiece): [number, number, number, number] {
  const [u0, v0, u1, v1] = atlasRect(piece), inset = (1 - MURAL_ASPECT[piece]) / 2 / ATLAS.columns;
  return [u0 + inset, v0, u1 - inset, v1];
}

type Rgb = readonly [number, number, number];
type Pixel = readonly [number, number];

/**
 * One tile being painted: `plot` blends a colour at an alpha over what is there, in tile pixels. A wall piece's tile
 * paints only between `x0` and `x1`, two pixels inside the part its quad shows, so no stroke meets the quad's edge.
 */
class Tile {
  readonly size = ATLAS.tile;
  readonly rgba = new Float32Array(ATLAS.tile * ATLAS.tile * 4);
  readonly x0: number;
  readonly x1: number;

  constructor(aspect = 1) {
    this.x0 = Math.max(ATLAS.rim, Math.ceil(this.size * (1 - aspect) / 2) + 2);
    this.x1 = Math.min(this.size - 1 - ATLAS.rim, Math.floor(this.size * (1 + aspect) / 2) - 3);
  }

  plot(x: number, y: number, colour: Rgb, alpha: number): void {
    const px = Math.round(x), py = Math.round(y), lo = ATLAS.rim, hi = this.size - 1 - ATLAS.rim;
    if (px < this.x0 || py < lo || px > this.x1 || py > hi || alpha <= 0) return;
    // Colour is straight, not premultiplied: the first stroke on a clear pixel sets it, and later ones blend over it.
    const i = (py * this.size + px) * 4, a = Math.min(1, alpha), keep = this.rgba[i + 3] > 0 ? 1 - a : 0;
    for (let k = 0; k < 3; k++) this.rgba[i + k] = this.rgba[i + k] * keep + colour[k] * (1 - keep);
    this.rgba[i + 3] = Math.max(this.rgba[i + 3], a);
  }

  /** A filled disc with a soft edge a pixel wide. */
  disc(cx: number, cy: number, radius: number, colour: Rgb): void {
    for (let y = Math.floor(cy - radius - 1); y <= Math.ceil(cy + radius + 1); y++)
      for (let x = Math.floor(cx - radius - 1); x <= Math.ceil(cx + radius + 1); x++)
        this.plot(x, y, colour, radius + 0.5 - Math.hypot(x - cx, y - cy));
  }

  /** A stroke from one point to another, its width running from `w0` to `w1`. */
  line(x0: number, y0: number, x1: number, y1: number, w0: number, w1: number, colour: Rgb): void {
    const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      this.disc(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, (w0 + (w1 - w0) * t) / 2, colour);
    }
  }

  /** A convex polygon, its corners in order either way round, with a soft edge a pixel wide. */
  polygon(corners: readonly Pixel[], colour: Rgb): void {
    const xs = corners.map(p => p[0]), ys = corners.map(p => p[1]);
    let area = 0;
    for (const [i, [x, y]] of corners.entries()) { const [nx, ny] = corners[(i + 1) % corners.length]; area += x * ny - nx * y; }
    const turn = Math.sign(area) || 1;
    for (let y = Math.floor(Math.min(...ys) - 1); y <= Math.ceil(Math.max(...ys) + 1); y++)
      for (let x = Math.floor(Math.min(...xs) - 1); x <= Math.ceil(Math.max(...xs) + 1); x++) {
        // How far inside every edge the pixel is: the least of its signed distances to them.
        let inside = Infinity;
        for (const [i, [ax, ay]] of corners.entries()) {
          const [bx, by] = corners[(i + 1) % corners.length], ex = bx - ax, ey = by - ay;
          inside = Math.min(inside, turn * (ex * (y - ay) - ey * (x - ax)) / Math.hypot(ex, ey));
        }
        this.plot(x, y, colour, inside + 0.5);
      }
  }

  /** An ellipse's outline, `width` thick, about (cx, cy) with radii `rx` and `ry`. */
  ring(cx: number, cy: number, rx: number, ry: number, width: number, colour: Rgb): void {
    for (let y = Math.floor(cy - ry - width); y <= Math.ceil(cy + ry + width); y++)
      for (let x = Math.floor(cx - rx - width); x <= Math.ceil(cx + rx + width); x++) {
        const off = (Math.hypot((x - cx) / rx, (y - cy) / ry) - 1) * Math.min(rx, ry);
        this.plot(x, y, colour, width / 2 + 0.5 - Math.abs(off));
      }
  }

  /** Every pixel where `shape` says so: `shape(u, v)` over [0, 1] gives a colour and an alpha, or null. */
  fill(shape: (u: number, v: number) => { colour: Rgb; alpha: number } | null): void {
    for (let y = 0; y < this.size; y++) for (let x = 0; x < this.size; x++) {
      const hit = shape((x + 0.5) / this.size, (y + 0.5) / this.size);
      if (hit) this.plot(x, y, hit.colour, hit.alpha);
    }
  }
}

/** Value noise on a lattice of `cells` a side, wrapped, so that a blob's outline wobbles. */
function noise(random: () => number, cells: number): (u: number, v: number) => number {
  const lattice = Array.from({ length: cells * cells }, () => random());
  const at = (x: number, y: number) => lattice[((y % cells + cells) % cells) * cells + ((x % cells + cells) % cells)];
  return (u, v) => {
    const x = u * cells, y = v * cells, x0 = Math.floor(x), y0 = Math.floor(y);
    const fx = x - x0, fy = y - y0, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const top = at(x0, y0) * (1 - sx) + at(x0 + 1, y0) * sx, bottom = at(x0, y0 + 1) * (1 - sx) + at(x0 + 1, y0 + 1) * sx;
    return top * (1 - sy) + bottom * sy;
  };
}

const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** A blob about the tile's centre whose radius wobbles with the angle: the outline of a splash, a patch or a pool. */
function blob(random: () => number, radius: number, wobble: number, lobes: number) {
  const phases = Array.from({ length: 3 }, () => random() * Math.PI * 2), weights = [1, 0.5, 0.3];
  return (u: number, v: number) => {
    const a = Math.atan2(v - 0.5, u - 0.5);
    const r = radius * (1 + wobble * weights.reduce((s, w, k) => s + w * Math.sin(a * lobes * (k + 1) + phases[k]), 0) / 1.8);
    return r - Math.hypot(u - 0.5, v - 0.5);
  };
}

/** Each kind's painting, set by eye. Colours are sRGB, 0 to 1. */
const PAINT: Record<DecalKind, (tile: Tile, random: () => number) => void> = {
  blood(tile, random) {
    const edge = blob(random, 0.26, 0.24, 3), grain = noise(random, 9), dark: Rgb = [0.2, 0.015, 0.01], wet: Rgb = [0.36, 0.03, 0.02];
    tile.fill((u, v) => {
      const d = edge(u, v) + 0.05 * (grain(u, v) - 0.5);
      return d > 0 ? { colour: mix(wet, dark, Math.min(1, grain(u, v) * 1.3)), alpha: Math.min(1, d * 60) } : null;
    });
    const s = tile.size;
    for (let i = 0; i < 9; i++) {
      const a = random() * Math.PI * 2, r = (0.3 + random() * 0.14) * s;
      tile.disc(s / 2 + Math.cos(a) * r, s / 2 + Math.sin(a) * r, 2 + random() * 5, dark);
    }
  },
  crack(tile, random) {
    const s = tile.size, ink: Rgb = [0.05, 0.045, 0.04];
    const branch = (x: number, y: number, heading: number, length: number, width: number, depth: number): void => {
      for (let travelled = 0; travelled < length;) {
        const step = 8 + random() * 10, turn = heading + (random() - 0.5) * 0.9;
        const nx = x + Math.cos(turn) * step, ny = y + Math.sin(turn) * step, w = width * (1 - travelled / length) + 2.5;
        tile.line(x, y, nx, ny, w, w * 0.9, ink);
        if (depth < 2 && random() < 0.18) branch(nx, ny, turn + (random() < 0.5 ? 1 : -1) * (0.5 + random() * 0.6), length * 0.45, w * 0.7, depth + 1);
        x = nx; y = ny; heading = turn; travelled += step;
        if (Math.hypot(x - s / 2, y - s / 2) > s * 0.42) return;
      }
    };
    const start = random() * Math.PI * 2;
    for (let k = 0; k < 3; k++) branch(s / 2, s / 2, start + k * 2.1 + (random() - 0.5) * 0.6, s * (0.3 + random() * 0.12), 6, 0);
  },
  moss(tile, random) {
    const edge = blob(random, 0.3, 0.3, 4), fine = noise(random, 24), broad = noise(random, 6);
    const deep: Rgb = [0.1, 0.16, 0.05], bright: Rgb = [0.24, 0.3, 0.09];
    tile.fill((u, v) => {
      const d = edge(u, v) - 0.14 * (broad(u, v) - 0.5), speckle = fine(u, v);
      if (d <= 0 || speckle < 0.28 + Math.max(0, 0.1 - d) * 4) return null;
      return { colour: mix(deep, bright, speckle), alpha: 1 };
    });
  },
  puddle(tile, random) {
    const edge = blob(random, 0.33, 0.22, 2), grain = noise(random, 5);
    tile.fill((u, v) => {
      const d = edge(u, v);
      return d > 0 ? { colour: mix([0.03, 0.035, 0.04], [0.07, 0.075, 0.08], grain(u, v)), alpha: Math.min(1, d * 60) } : null;
    });
  },
  bones(tile, random) {
    const s = tile.size, bone: Rgb = [0.62, 0.58, 0.5], shade: Rgb = [0.42, 0.38, 0.32];
    for (let i = 0; i < 6; i++) {
      const a = random() * Math.PI * 2, r = random() * s * 0.22, cx = s / 2 + Math.cos(a) * r, cy = s / 2 + Math.sin(a) * r;
      const heading = random() * Math.PI, half = (0.08 + random() * 0.1) * s, dx = Math.cos(heading) * half, dy = Math.sin(heading) * half;
      const width = 5 + random() * 3;
      tile.line(cx - dx, cy - dy, cx + dx, cy + dy, width + 1.5, width + 1.5, shade);
      tile.line(cx - dx, cy - dy, cx + dx, cy + dy, width, width, bone);
      for (const end of [-1, 1]) for (const side of [-1, 1])
        tile.disc(cx + end * dx - side * dy / half * width * 0.55, cy + end * dy + side * dx / half * width * 0.55, width * 0.62, bone);
    }
  },
  roots(tile, random) {
    const s = tile.size, bark: Rgb = [0.2, 0.14, 0.08], dark: Rgb = [0.1, 0.07, 0.04];
    const strand = (x: number, y: number, width: number, reach: number, depth: number): void => {
      let heading = Math.PI / 2 + (random() - 0.5) * 0.5;
      for (let travelled = 0; travelled < reach && width > 5;) {
        const step = 6 + random() * 8; heading += (random() - 0.5) * 0.6;
        heading = Math.min(Math.PI * 0.85, Math.max(Math.PI * 0.15, heading));
        const nx = x + Math.cos(heading) * step, ny = y + Math.sin(heading) * step, w = width * 0.95;
        tile.line(x, y, nx, ny, width, w, random() < 0.5 ? bark : dark);
        if (depth < 2 && random() < 0.16) strand(nx, ny, w * 0.75, (reach - travelled) * 0.6, depth + 1);
        x = nx; y = ny; width = w; travelled += step;
      }
    };
    for (let i = 0; i < 6; i++) strand(s * (0.15 + 0.7 * random()), ATLAS.rim, 10 + random() * 6, s * (0.4 + random() * 0.5), 0);
  },
  cobweb(tile, random) {
    // Hung across an inner corner: its top edge is the tile's top, and it sags from the two top corners to a point.
    const s = tile.size, silk: Rgb = [0.78, 0.78, 0.74], hub = { x: s / 2, y: s * 0.22 }, spokes: { x: number; y: number }[] = [];
    for (let i = 0; i <= 6; i++) {
      const t = i / 6, x = ATLAS.rim + t * (s - 2 * ATLAS.rim), sag = Math.sin(t * Math.PI);
      spokes.push({ x, y: ATLAS.rim + sag * s * (0.55 + 0.25 * random()) });
    }
    for (const p of spokes) tile.line(hub.x, hub.y, p.x, p.y, 9, 8, silk);
    for (let ring = 1; ring <= 4; ring++) {
      const k = ring / 4.4;
      for (let i = 0; i < spokes.length - 1; i++) {
        const a = spokes[i], b = spokes[i + 1], droop = 4 + random() * 4;
        const ax = hub.x + (a.x - hub.x) * k, ay = hub.y + (a.y - hub.y) * k, bx = hub.x + (b.x - hub.x) * k, by = hub.y + (b.y - hub.y) * k;
        tile.line(ax, ay, (ax + bx) / 2, (ay + by) / 2 + droop, 7, 7, silk);
        tile.line((ax + bx) / 2, (ay + by) / 2 + droop, bx, by, 7, 7, silk);
      }
    }
  },
  rubble(tile, random) {
    // Angular chips over a shadow set down and to the right, so they read as lying on the stone.
    const s = tile.size, stone: Rgb = [0.33, 0.3, 0.26], pale: Rgb = [0.5, 0.47, 0.41], under: Rgb = [0.05, 0.045, 0.04];
    const count = 30 + Math.floor(random() * 21);
    for (let i = 0; i < count; i++) {
      const a = random() * Math.PI * 2, r = Math.sqrt(random()) * s * 0.3, cx = s / 2 + Math.cos(a) * r, cy = s / 2 + Math.sin(a) * r;
      const size = 7 + random() * 9 * (1.2 - r / (s * 0.3)), sides = 4 + Math.floor(random() * 3), start = random() * Math.PI * 2;
      const chip: Pixel[] = Array.from({ length: sides }, (_, k) => {
        const t = start + (k + 0.2 + random() * 0.6) * Math.PI * 2 / sides, reach = size * (0.6 + random() * 0.4);
        return [cx + Math.cos(t) * reach, cy + Math.sin(t) * reach];
      });
      tile.polygon(chip.map(([x, y]) => [x + 3, y + 3]), under);
      tile.polygon(chip, mix(stone, pale, random()));
    }
  },
  scorch(tile, random) {
    // A spent fire: soot with a ragged edge, black at the heart and ash-brown toward the rim.
    const edge = blob(random, 0.3, 0.3, 5), rag = noise(random, 14), soot: Rgb = [0.025, 0.022, 0.02], ash: Rgb = [0.14, 0.115, 0.09];
    tile.fill((u, v) => {
      const d = edge(u, v) + 0.07 * (rag(u, v) - 0.5), heart = Math.min(1, Math.hypot(u - 0.5, v - 0.5) / 0.34);
      return d > 0 ? { colour: mix(soot, ash, heart * heart), alpha: Math.min(1, d * 40) } : null;
    });
  },
  straw(tile, random) {
    // Short pale stalks in a loose drift, thick enough that the drift outlives the third mipmap.
    const s = tile.size, drift = blob(random, 0.3, 0.35, 3), pale: Rgb = [0.68, 0.56, 0.3], dry: Rgb = [0.46, 0.35, 0.16];
    const count = 60 + Math.floor(random() * 31);
    for (let i = 0; i < count;) {
      const u = random(), v = random();
      if (drift(u, v) < 0) continue;
      i++;
      const heading = random() * Math.PI, half = 10 + random() * 12, dx = Math.cos(heading) * half, dy = Math.sin(heading) * half;
      const width = 6 + random() * 3;
      tile.line(u * s - dx, v * s - dy, u * s + dx, v * s + dy, width, width * 0.8, mix(dry, pale, random()));
    }
  },
  grime(tile, random) {
    // A large damp blotch, close to the floor's own colour: it breaks up the floor's repetition more than it is seen.
    const edge = blob(random, 0.33, 0.2, 3), damp = noise(random, 7), fine = noise(random, 20);
    const dark: Rgb = [0.04, 0.055, 0.04], mid: Rgb = [0.085, 0.1, 0.075];
    tile.fill((u, v) => {
      const d = edge(u, v) - 0.1 * (damp(u, v) - 0.5);
      if (d <= 0 || fine(u, v) < 0.22) return null;
      return { colour: mix(dark, mid, damp(u, v)), alpha: Math.min(1, d * 30) };
    });
  },
  stain(tile, random) {
    // A water streak from the wall's top: a band across it, and two to four fingers running down that thin and stop.
    const s = tile.size, { x0, x1 } = tile, wet: Rgb = [0.075, 0.08, 0.072], thin: Rgb = [0.14, 0.14, 0.125], band = noise(random, 6);
    const mid = (x0 + x1) / 2, half = (x1 - x0) / 2;
    const fingers = Array.from({ length: 2 + Math.floor(random() * 3) }, () => ({
      x: x0 + 14 + random() * (x1 - x0 - 28), end: s * (0.45 + random() * 0.45), width: 16 + random() * 12, wander: noise(random, 4) }));
    tile.fill((u, v) => {
      const x = u * s, y = v * s;
      // The band is deepest in the middle and comes to nothing at its sides, so it has no square corners.
      let d = s * (0.07 + 0.08 * band(u * 2, 0.5)) * (1 - ((x - mid) / half) ** 4) - y;
      for (const f of fingers) {
        if (y > f.end) continue;
        const t = y / f.end, centre = f.x + 14 * (f.wander(0.5, t) - 0.5);
        d = Math.max(d, f.width / 2 * (1 - 0.8 * t) - Math.abs(x - centre));
      }
      return d > 0 ? { colour: mix(wet, thin, Math.min(1, v * 1.4)), alpha: Math.min(1, d + 0.5) } : null;
    });
  },
  lichen(tile, random) {
    // The moss's growth, paler and yellower, in rosettes.
    const fine = noise(random, 28), pale: Rgb = [0.48, 0.48, 0.22], bright: Rgb = [0.7, 0.66, 0.32];
    const rosettes = Array.from({ length: 4 + Math.floor(random() * 4) }, () => ({
      u: 0.22 + random() * 0.56, v: 0.25 + random() * 0.52, r: 0.07 + random() * 0.08, lobes: 5 + Math.floor(random() * 4), phase: random() * Math.PI * 2 }));
    tile.fill((u, v) => {
      let best = 0, near = 1;
      for (const r of rosettes) {
        const d = Math.hypot(u - r.u, v - r.v), edge = r.r * (1 + 0.25 * Math.sin(Math.atan2(v - r.v, u - r.u) * r.lobes + r.phase));
        if (edge - d > best) { best = edge - d; near = d / edge; }
      }
      if (best <= 0 || fine(u, v) < 0.22 + 0.3 * near * near) return null;
      return { colour: mix(pale, bright, fine(u, v)), alpha: 1 };
    });
  },
  fissure(tile, random) {
    // A crack in the face, run down it rather than across the floor, and thinner than the floor's.
    const s = tile.size, { x0, x1 } = tile, ink: Rgb = [0.035, 0.03, 0.028];
    const branch = (x: number, y: number, heading: number, length: number, width: number, depth: number): void => {
      for (let travelled = 0; travelled < length;) {
        const step = 8 + random() * 10, turn = heading + (random() - 0.5) * 0.7, w = width * (1 - travelled / length) + 4;
        const nx = Math.min(x1 - w, Math.max(x0 + w, x + Math.cos(turn) * step)), ny = y + Math.sin(turn) * step;
        tile.line(x, y, nx, ny, w, w * 0.9, ink);
        if (depth < 2 && random() < 0.2) branch(nx, ny, turn + (random() < 0.5 ? 1 : -1) * (0.4 + random() * 0.5), length * 0.4, w * 0.7, depth + 1);
        // Pulled back toward straight down, as water and weight run it.
        x = nx; y = ny; heading = Math.PI / 2 + (turn - Math.PI / 2) * 0.7; travelled += step;
        if (y > s - ATLAS.rim - 10) return;
      }
    };
    branch((x0 + x1) / 2 + (random() - 0.5) * 20, s * 0.1, Math.PI / 2, s * 0.75, 6, 0);
  },
  chains(tile, random) {
    // A ring in the stone, and two chains of links hanging from it: a link seen flat, then one seen edge-on.
    const s = tile.size, iron: Rgb = [0.19, 0.18, 0.17], lit: Rgb = [0.36, 0.34, 0.31], cx = s / 2, ringY = ATLAS.rim + 24;
    tile.ring(cx, ringY, 14, 14, 8, iron);
    tile.ring(cx, ringY, 14, 14, 3, lit);
    for (const side of [-1, 1]) {
      const end = s * (0.6 + random() * 0.32), bottomX = cx + side * (20 + random() * 6);
      let y = ringY + 12, k = 0;
      while (y < end) {
        const x = cx + side * 9 + (bottomX - cx - side * 9) * (y - ringY) / (end - ringY);
        if (k % 2 === 0) { tile.ring(x, y + 13, 8, 14, 7, iron); tile.ring(x, y + 13, 8, 14, 2.5, lit); }
        else tile.line(x, y + 1, x, y + 25, 8, 8, iron);
        y += 21; k++;
      }
    }
  },
  banner(tile, random) {
    // A tattered cloth on a rod: dark red, folded, a faded device, and a lower edge torn into a swallowtail.
    const s = tile.size, { x0, x1 } = tile, rod: Rgb = [0.15, 0.1, 0.06], red: Rgb = [0.36, 0.05, 0.04], faded: Rgb = [0.55, 0.45, 0.28];
    const tear = noise(random, 9), holes = noise(random, 13), phase = random() * Math.PI * 2;
    const left = x0 + 12, right = x1 - 12, mid = (left + right) / 2, half = (right - left) / 2, top = ATLAS.rim + 14;
    tile.fill((u, v) => {
      const x = u * s, y = v * s;
      if (x < left || x > right || y < top) return null;
      const bottom = s * 0.93 - s * 0.16 * (1 - Math.abs(x - mid) / half) - 18 * tear(u * 2, 0.5);
      if (y > bottom || (y > s * 0.62 && holes(u, v) < 0.25)) return null;
      const fold = 0.72 + 0.28 * Math.sin((x - left) * 0.11 + phase), device = Math.hypot((x - mid) * 1.2, y - s * 0.4) < 26;
      const cloth = mix([0, 0, 0], red, fold);
      return { colour: device ? mix(cloth, faded, 0.6 * fold) : cloth, alpha: Math.min(1, bottom - y + 0.5) };
    });
    tile.line(x0 + 2, top - 3, x1 - 2, top - 3, 9, 9, rod);
  },
};

/** The aspect a kind's tile is painted in: a wall piece's own, and square for everything else. */
const aspectOf = (kind: DecalKind): number => (MURAL_ASPECT as Record<string, number>)[kind] ?? 1;

/** The atlas as RGBA bytes, row 0 first, sRGB colour and straight alpha. The same every time: its draws have one seed. */
export function decalAtlas(): Uint8Array {
  const width = ATLAS.tile * ATLAS.columns, height = ATLAS.tile * ATLAS.rows, bytes = new Uint8Array(width * height * 4);
  for (const [i, kind] of DECAL_KINDS.entries()) {
    const tile = new Tile(aspectOf(kind)), random = mulberry32(0xdeca1 + i);
    PAINT[kind](tile, random);
    const ox = (i % ATLAS.columns) * ATLAS.tile, oy = Math.floor(i / ATLAS.columns) * ATLAS.tile, mean = [0, 0, 0];
    let solid = 0;
    for (let p = 0; p < tile.rgba.length; p += 4) if (tile.rgba[p + 3] >= 0.5) { solid++; for (let k = 0; k < 3; k++) mean[k] += tile.rgba[p + k]; }
    for (let y = 0; y < ATLAS.tile; y++) for (let x = 0; x < ATLAS.tile; x++) {
      const from = (y * ATLAS.tile + x) * 4, to = ((oy + y) * width + ox + x) * 4, a = tile.rgba[from + 3];
      // A clear pixel takes the mean colour of the tile's shape, so that a filtered edge fades toward it, not to black.
      for (let k = 0; k < 3; k++) bytes[to + k] = Math.round(Math.min(1, a > 0 ? tile.rgba[from + k] : mean[k] / Math.max(1, solid)) * 255);
      bytes[to + 3] = Math.round(a * 255);
    }
  }
  return bytes;
}
