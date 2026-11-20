/**
 * **A Radiance image (`.hdr`) kept within what a half-float texel holds.**
 *
 *   node scripts/art/radiance.mjs cap <in.hdr> <out.hdr>
 *
 * A device that cannot filter float textures holds an environment map in half floats, whose
 * largest value is 65504. A brighter value becomes infinite there, and the light the map gives
 * turns to nothing in that channel on everything it reaches. A clear sky's sun is that bright.
 * `cap` dims each pixel over the limit until its brightest channel fits, keeping its colour, and
 * leaves every other scanline's bytes as they were. `overHalfFloat` counts the pixels over the
 * limit, for the asset check (`checkAssets`).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

/** The largest value a half float holds. */
const HALF_FLOAT_MAX = 65504;

/** A pixel's three values from its mantissas and shared exponent. An exponent of 0 is black. */
const valuesOf = (r, g, b, e) => (e === 0 ? [0, 0, 0] : [r, g, b].map((mantissa) => mantissa * 2 ** (e - 136)));

/** The mantissas and shared exponent that hold `values`, each rounded down. */
function pixelOf(values) {
  const top = Math.max(...values);
  if (!(top > 1e-32)) return [0, 0, 0, 0];
  let exponent = Math.ceil(Math.log2(top));
  if (top / 2 ** exponent >= 1) exponent++;
  return [...values.map((value) => Math.floor(value * 256 / 2 ** exponent)), exponent + 128];
}

/**
 * The image read: its size, and each scanline as its pixels (mantissas and exponent, four bytes
 * a pixel) with the bytes it was read from. Only the run-length form every current writer makes
 * is read.
 */
function readRadiance(bytes) {
  let at = 0;
  const line = () => {
    const end = bytes.indexOf(0x0a, at);
    if (end < 0) throw new Error("the header does not end");
    const text = bytes.subarray(at, end).toString("latin1");
    at = end + 1;
    return text;
  };
  if (!line().startsWith("#?")) throw new Error("not a Radiance image");
  while (line() !== "") { /* the header's lines, up to the empty one */ }
  const size = /^-Y (\d+) \+X (\d+)$/.exec(line());
  if (!size) throw new Error("only an image stored top to bottom, left to right, is read");
  const height = Number(size[1]), width = Number(size[2]), head = bytes.subarray(0, at), scanlines = [];
  for (let row = 0; row < height; row++) {
    const start = at;
    if (bytes[at] !== 2 || bytes[at + 1] !== 2 || ((bytes[at + 2] << 8) | bytes[at + 3]) !== width) throw new Error(`scanline ${row} is not run-length encoded`);
    at += 4;
    const pixels = new Uint8Array(width * 4);
    for (let channel = 0; channel < 4; channel++) {
      for (let x = 0; x < width;) {
        const count = bytes[at++];
        if (count > 128) { const value = bytes[at++]; for (let k = 0; k < count - 128; k++) pixels[(x++) * 4 + channel] = value; }
        else for (let k = 0; k < count; k++) pixels[(x++) * 4 + channel] = bytes[at++];
        if (x > width) throw new Error(`scanline ${row} overruns its width`);
      }
    }
    scanlines.push({ pixels, raw: bytes.subarray(start, at) });
  }
  return { head, width, height, scanlines };
}

/** A scanline's bytes: each channel in turn, a run of four or more as its length and value, the rest as they are. */
function encodeScanline(pixels, width) {
  const out = [2, 2, width >> 8, width & 255];
  for (let channel = 0; channel < 4; channel++) {
    const value = (x) => pixels[x * 4 + channel];
    const runAt = (x) => { let n = 1; while (x + n < width && n < 127 && value(x + n) === value(x)) n++; return n; };
    for (let x = 0; x < width;) {
      const run = runAt(x);
      if (run >= 4) { out.push(128 + run, value(x)); x += run; continue; }
      const from = x;
      while (x < width && x - from < 128 && runAt(x) < 4) x++;
      out.push(x - from);
      for (let k = from; k < x; k++) out.push(value(k));
    }
  }
  return Uint8Array.from(out);
}

/** How many of the image's pixels hold a value over the half-float limit. */
export function overHalfFloat(bytes) {
  let over = 0;
  for (const { pixels } of readRadiance(bytes).scanlines) {
    for (let i = 0; i < pixels.length; i += 4) if (Math.max(...valuesOf(pixels[i], pixels[i + 1], pixels[i + 2], pixels[i + 3])) > HALF_FLOAT_MAX) over++;
  }
  return over;
}

/** The image with each pixel over the limit dimmed to it, and what was dimmed: where, from what, to what. */
function capped(bytes) {
  const { head, width, scanlines } = readRadiance(bytes), parts = [head], dimmed = [];
  for (const [row, { pixels, raw }] of scanlines.entries()) {
    let changed = false;
    for (let x = 0; x < width; x++) {
      const i = x * 4, values = valuesOf(pixels[i], pixels[i + 1], pixels[i + 2], pixels[i + 3]), top = Math.max(...values);
      if (top <= HALF_FLOAT_MAX) continue;
      const pixel = pixelOf(values.map((value) => value * HALF_FLOAT_MAX / top));
      pixels.set(pixel, i);
      dimmed.push({ x, row, from: values, to: valuesOf(...pixel) });
      changed = true;
    }
    parts.push(changed ? encodeScanline(pixels, width) : raw);
  }
  return { bytes: Buffer.concat(parts), dimmed };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [command, from, to] = process.argv.slice(2);
  if (command !== "cap" || !from || !to) throw new Error("usage: node scripts/art/radiance.mjs cap <in.hdr> <out.hdr>");
  const result = capped(readFileSync(from));
  for (const { x, row, from: before, to: after } of result.dimmed) console.log(`pixel ${x},${row}: ${before.join(" ")} to ${after.join(" ")}`);
  if (overHalfFloat(result.bytes) !== 0) throw new Error("a pixel is still over the limit");
  writeFileSync(to, result.bytes);
  console.log(`${result.dimmed.length} pixels dimmed to ${HALF_FLOAT_MAX}`);
}
