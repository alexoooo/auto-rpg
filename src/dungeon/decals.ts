import { mulberry32 } from "../rng.ts";

/**
 * The dungeon's dressing images, painted in code into one atlas: no download and no binary in the repository, as the
 * masonry has none. Node loads this file; it builds bytes, and `world.ts` hands them to the GPU.
 *
 * Every tile is a shape on a clear ground. The renderer alpha-tests it, so a decal's edge is where its alpha crosses a
 * half, and a tile's outer `ATLAS.rim` pixels are clear so that no filtered sample takes a neighbour's colour.
 */
export const DECAL_KINDS = Object.freeze(["blood", "crack", "moss", "puddle", "bones", "roots", "cobweb"] as const);
export type DecalKind = (typeof DECAL_KINDS)[number];

export const ATLAS = Object.freeze({ tile: 256, columns: 4, rows: 2, rim: 6 });

/** A tile's rectangle in the atlas, as `[u0, v0, u1, v1]`. Row 0 of the bytes is v = 0, and a hung tile's top. */
export function atlasRect(kind: DecalKind): [number, number, number, number] {
  const i = DECAL_KINDS.indexOf(kind), c = i % ATLAS.columns, r = Math.floor(i / ATLAS.columns);
  return [c / ATLAS.columns, r / ATLAS.rows, (c + 1) / ATLAS.columns, (r + 1) / ATLAS.rows];
}

type Rgb = readonly [number, number, number];

/** One tile being painted: `plot` blends a colour at an alpha over what is there, in tile pixels. */
class Tile {
  readonly size = ATLAS.tile;
  readonly rgba = new Float32Array(ATLAS.tile * ATLAS.tile * 4);

  plot(x: number, y: number, colour: Rgb, alpha: number): void {
    const px = Math.round(x), py = Math.round(y), lo = ATLAS.rim, hi = this.size - 1 - ATLAS.rim;
    if (px < lo || py < lo || px > hi || py > hi || alpha <= 0) return;
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
};

/** The atlas as RGBA bytes, row 0 first, sRGB colour and straight alpha. The same every time: its draws have one seed. */
export function decalAtlas(): Uint8Array {
  const width = ATLAS.tile * ATLAS.columns, height = ATLAS.tile * ATLAS.rows, bytes = new Uint8Array(width * height * 4);
  for (const [i, kind] of DECAL_KINDS.entries()) {
    const tile = new Tile(), random = mulberry32(0xdeca1 + i);
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
