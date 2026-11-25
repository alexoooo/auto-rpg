/**
 * **Bodies drawn from the side**, for a look at a movement (`look.mjs`): each body's segments as
 * capsules seen across a heading, nearer ones over farther, a frame a panel, the panels in a row,
 * written as a PNG. No renderer and no browser: what is drawn is the simulation's own segments.
 *
 *   const shape = bodyShape(built.spec);                    // once a body
 *   const drawn = drawBodies([{ built, shape, colour }], { origin, heading });
 *   writeFileSync("strip.png", stripPng([drawn, ...]));
 */
import { deflateSync } from "node:zlib";

/** A panel's size, px, and its scale, px a metre; what it shows, m, from the origin along the heading and up from the ground. */
const PANEL = Object.freeze({ width: 280, height: 260, scale: 105, behind: 1.3, ground: 18 });
/** The trunk's segments have no capsule of their own (a hull); drawn as one from end to end at this radius, m. */
const TRUNK_RADIUS = 0.12;

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/**
 * **A body's drawing**: each segment's capsules, as rest points in the body frame and a radius: a
 * capsule's own, a hull's (the trunk) from its proximal to its distal end, a box's (a foot) along
 * its longest side.
 */
export function bodyShape(spec) {
  return spec.segments.map((segment) => {
    const shape = segment.shape, value = (q) => q.value;
    if (shape.kind === "capsule") return { name: segment.name, capsules: [{ a: value(shape.from), b: value(shape.to), r: value(shape.radius) }] };
    if (shape.kind === "box") {
      const c = value(shape.centre), size = [...value(shape.size)].sort((x, y) => x - y), half = size[2] / 2;
      return { name: segment.name, capsules: [{ a: [c[0], c[1], c[2] - half], b: [c[0], c[1], c[2] + half], r: size[0] / 3 }] };
    }
    return { name: segment.name, capsules: [{ a: value(segment.proximal), b: value(segment.distal), r: TRUNK_RADIUS }] };
  });
}

/** A rest point `p` of `segment` (body frame) where the segment now stands, in the world. */
function placed(segment, p) {
  const { origin, x, y, z } = segment.frame, d = sub(p, origin), l = [dot(d, x), dot(d, y), dot(d, z)];
  const q = segment.pose.rotation, t = segment.pose.position;
  // l turned by q: v + 2w(u x v) + 2u x (u x v), u the quaternion's vector part.
  const u = [q.x, q.y, q.z], c1 = [u[1] * l[2] - u[2] * l[1], u[2] * l[0] - u[0] * l[2], u[0] * l[1] - u[1] * l[0]];
  const c2 = [u[1] * c1[2] - u[2] * c1[1], u[2] * c1[0] - u[0] * c1[2], u[0] * c1[1] - u[1] * c1[0]];
  return [t.x + l[0] + 2 * (q.w * c1[0] + c2[0]), t.y + l[1] + 2 * (q.w * c1[1] + c2[1]), t.z + l[2] + 2 * (q.w * c1[2] + c2[2])];
}

/**
 * **One panel's bodies**: each of `bodies` (`{ built, shape, colour }`, colour an RGB triple) as
 * it stands now, its capsules in the panel's plane: along `heading` (a unit (x, z)) from `origin`
 * (world (x, z)) and up, the depth across it kept to draw the nearer over the farther.
 */
export function drawBodies(bodies, { origin, heading }) {
  const across = [heading[1], -heading[0]];
  return bodies.flatMap(({ built, shape, colour }) => shape.flatMap(({ name, capsules }) => capsules.map(({ a, b, r }) => {
    const segment = built.segments.get(name), pa = placed(segment, a), pb = placed(segment, b);
    const plane = (p) => [(p[0] - origin[0]) * heading[0] + (p[2] - origin[1]) * heading[1], p[1], (p[0] - origin[0]) * across[0] + (p[2] - origin[1]) * across[1]];
    return { a: plane(pa), b: plane(pb), r, colour };
  })));
}

/** A panel of `capsules` (`drawBodies`) into the strip's pixels `rgb` (`width` wide) at column `left`. */
function paint(rgb, width, left, capsules) {
  const { width: w, height: h, scale, behind, ground } = PANEL, depth = new Float32Array(w * h).fill(Infinity);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = 3 * (y * width + left + x), floor = y >= h - ground;
    rgb[i] = floor ? 70 : 236; rgb[i + 1] = floor ? 66 : 236; rgb[i + 2] = floor ? 60 : 240;
  }
  for (const { a, b, r, colour } of capsules) {
    const px = (p) => [(p[0] + behind) * scale, h - ground - p[1] * scale];
    const [ax, ay] = px(a), [bx, by] = px(b), rp = r * scale;
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - rp)), x1 = Math.min(w - 1, Math.ceil(Math.max(ax, bx) + rp));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by) - rp)), y1 = Math.min(h - 1, Math.ceil(Math.max(ay, by) + rp));
    const dx = bx - ax, dy = by - ay, length2 = dx * dx + dy * dy || 1;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const s = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / length2)), ex = x - (ax + s * dx), ey = y - (ay + s * dy), d2 = ex * ex + ey * ey;
      if (d2 > rp * rp) continue;
      // Depth across the heading, nearer smaller; the rim darker, so a limb over another shows its edge.
      const z = a[2] + s * (b[2] - a[2]), k = y * w + x;
      if (z >= depth[k]) continue;
      depth[k] = z;
      const shade = (0.55 + 0.45 * Math.max(0, Math.min(1, 0.5 - z))) * (d2 > 0.6 * rp * rp ? 0.7 : 1), i = 3 * (y * width + left + x);
      rgb[i] = colour[0] * shade; rgb[i + 1] = colour[1] * shade; rgb[i + 2] = colour[2] * shade;
    }
  }
  for (let y = 0; y < h; y++) { const i = 3 * (y * width + left + w - 1); rgb[i] = rgb[i + 1] = rgb[i + 2] = 120; }
}

/** The CRC-32 a PNG chunk carries. */
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (bytes) => { let c = 0xffffffff; for (const b of bytes) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length), body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  out.writeUInt32BE(data.length, 0); body.copy(out, 4); out.writeUInt32BE(crc32(body), 8 + data.length);
  return out;
}

/** **A strip**: `panels` (each `drawBodies`'s) side by side, left to right, as a PNG's bytes. */
export function stripPng(panels) {
  const width = PANEL.width * panels.length, height = PANEL.height, rgb = new Uint8Array(3 * width * height);
  panels.forEach((capsules, k) => paint(rgb, width, k * PANEL.width, capsules));
  const raw = Buffer.alloc((3 * width + 1) * height);
  for (let y = 0; y < height; y++) Buffer.from(rgb.buffer, 3 * width * y, 3 * width).copy(raw, y * (3 * width + 1) + 1);
  const head = Buffer.alloc(13);
  head.writeUInt32BE(width, 0); head.writeUInt32BE(height, 4); head[8] = 8; head[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", head), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
