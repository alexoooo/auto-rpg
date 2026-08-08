// Measures every PNG under web/assets/ and prints the manifest entry it proposes.
//
//     node tools/measure_assets.js                 # web/assets
//     node tools/measure_assets.js path/to/a/dir   # anywhere else
//
// The second form is how the checks below get tested: a rejection is only worth
// having if somebody has watched it fire, and the four files that make it fire
// -- a palettised PNG, an interlaced one, a body layer at the wrong cell size
// and a walk frame that has drifted sideways -- are exactly the files that must
// not be committed into web/assets/.
//
// **It prints fragments and never writes web/assets/manifest.json.** Only the
// integrating agent edits that file. A tool that could write it is a tool that
// could point an entry at a file that does not exist, and the whole value of
// the manifest is that every key in it resolves.
//
// **The PNG decoder is hand-rolled on zlib.inflateSync.** Node has no image API
// and this repository takes no npm dependencies -- it hand-rolled a wasm ABI, a
// fixed-point sine table and an HTTP server rather than take one. That turns
// out to be the useful accident rather than the cost: the decoder is restricted
// to colour type 6, bit depth 8, non-interlaced and *asserts* it, so the tool
// that measures the images is also the tool that enforces the format clause of
// the contract. A palettised or interlaced file fails here, loudly, at
// integration, instead of quietly in whichever browser handles it differently.
// All five filter types are implemented because real encoders use all five;
// tools/gen_test_assets.js deliberately cycles through them so the fixtures
// exercise every branch.
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const ROOT = path.resolve(__dirname, "..");

// ------------------------------------------------------------- the constants
//
// The spec states pixel dimensions; this file states the world numbers they
// came from and multiplies. A number typed twice is a number that drifts, and
// the one that would drift silently is the scale.

const PX_PER_WORLD_UNIT = 86; // the default framing's scale, stated as law in ASSET_SPEC.md
const UPRIGHT_EX = Math.SQRT2; // web/main.js PROJ.ex: a world circle of radius r is r*scale*ex wide

const FLOOR_WORLD = 4; // a floor or wall top face is 4 world units square
const WALL_WORLD = [1, 1.6]; // a wall side face, in world units
const DECAL_WORLD = [1, 2]; // grime / moss / cracks, square, somewhere in this range

/**
 * Radius out of `crates/sim/src/entity.rs` (`Body::radius`), height in radii out
 * of `web/main.js` (`BODY_H`), cell out of ASSET_SPEC.md.
 *
 * The drawn size is derived from the first two rather than tabulated, because
 * it is not a free choice: the width is the body's own collision circle
 * projected -- `2 * r * scale * ex` -- and that circle is drawn on the floor
 * underneath the figure. Art narrower than it stands inside its own footprint.
 * The height is `r * radii * scale`, the same number `bodyTopWorld` hands the
 * health bar, so a body whose art and whose anchor disagree is a body whose bar
 * floats off its head.
 *
 * These reproduce ASSET_SPEC.md's table exactly: 109 x 116, 85 x 96, 170 x 163,
 * 73 x 28. If they ever stop reproducing it, the sim moved and the spec is the
 * thing that is now wrong.
 */
const ARCHETYPES = {
  fighter: { radius: 0.45, radii: 3.0, head: [0.4, 0.32], cell: [128, 160] },
  rogue: { radius: 0.35, radii: 3.2, head: [0.44, 0.28], cell: [112, 144] },
  brute: { radius: 0.7, radii: 2.7, head: [0.22, 0.3], cell: [192, 192] },
  skitterer: { radius: 0.3, radii: 1.1, head: [0.46, 0.22], cell: [96, 64] },
};

for (const a of Object.values(ARCHETYPES)) {
  a.drawn = [
    Math.round(2 * a.radius * UPRIGHT_EX * PX_PER_WORLD_UNIT),
    Math.round(a.radius * a.radii * PX_PER_WORLD_UNIT),
  ];
  // The shoulder, where the arm and the shield pivot: the crown, less the head
  // radius, less the head's offset below it -- `HEADS` in web/main.js, the same
  // two numbers the upright silhouette draws the head circle from. Reproduces
  // ASSET_SPEC.md section 8.5 exactly: 88, 75 and 131 px above the feet, so
  // pivots at [64, 72], [56, 69] and [96, 61].
  //
  // The spec tabulates it only for the three archetypes that have arms. A
  // Skitterer ships `head` instead and the same construction places it -- the
  // top of the body less its head is where the head end joins -- but that one is
  // this tool's reading rather than the spec's word, so if the integration
  // disagrees the number to argue with is in ASSET_SPEC.md, not here.
  a.shoulder = Math.round((a.radii - a.head[1] - a.head[0]) * a.radius * PX_PER_WORLD_UNIT);
}

const FACINGS = ["s", "sw", "w", "nw", "n", "ne", "e", "se"];
const FRAMES = ["idle", "walk1", "walk2", "walk3"];

// The tolerances, in one place so they can be argued with.
const FOOTING_SLOP = 2; // px: "on the cell's bottom edge, centred, within a pixel or two"
const DRIFT_SLOP = 1; // px: how far one frame's centre may sit from its facing's other frames
const SIZE_SLOP = 0.1; // drawn size against the archetype's, as a fraction
const HALO_SHARE = 0.005; // partly-transparent pixels away from the edge, as a share of covered

// ----------------------------------------------------------------- the codec
//
// Enough of PNG to read what the contract allows and refuse everything else.

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

let CRC_TABLE = null;
function crc32(buf) {
  if (CRC_TABLE === null) {
    CRC_TABLE = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c;
    }
  }
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

const COLOUR_TYPES = { 0: "greyscale", 2: "RGB", 3: "palette", 4: "greyscale+alpha", 6: "RGBA" };

/** `{ width, height, data }` with `data` as tightly packed RGBA8, or a throw. */
function decodePng(buf) {
  if (buf.length < 8 || !buf.subarray(0, 8).equals(SIGNATURE)) throw new Error("not a PNG: the signature is wrong");

  let head = null;
  const idat = [];
  let off = 8;
  while (off + 12 <= buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString("latin1", off + 4, off + 8);
    const end = off + 12 + len;
    if (end > buf.length) throw new Error(`chunk ${type} runs past the end of the file: truncated`);
    const body = buf.subarray(off + 8, off + 8 + len);
    if (crc32(buf.subarray(off + 4, off + 8 + len)) !== buf.readUInt32BE(off + 8 + len)) {
      throw new Error(`chunk ${type} fails its CRC: the file is corrupt`);
    }
    if (type === "IHDR") {
      if (head !== null || len !== 13) throw new Error("malformed IHDR");
      head = {
        width: body.readUInt32BE(0),
        height: body.readUInt32BE(4),
        depth: body[8],
        colour: body[9],
        compression: body[10],
        filter: body[11],
        interlace: body[12],
      };
    } else if (type === "IDAT") {
      if (head === null) throw new Error("IDAT before IHDR");
      idat.push(body);
    } else if (type === "IEND") {
      break;
    }
    off = end;
  }
  if (head === null) throw new Error("no IHDR: this is not a PNG this tool can read");

  // The format clause of the contract, enforced. Each of these is something a
  // browser would accept and the pipeline would then be wrong about: a palette
  // has no alpha to measure, an interlaced file decodes to seven passes rather
  // than a raster, and 16-bit doubles the texture upload for nothing.
  if (head.colour !== 6) {
    throw new Error(
      `colour type ${head.colour} (${COLOUR_TYPES[head.colour] || "unknown"}), and the contract is` +
        " colour type 6 (RGBA) -- re-export without a palette and with a real alpha channel"
    );
  }
  if (head.depth !== 8) throw new Error(`bit depth ${head.depth}, and the contract is 8`);
  if (head.interlace !== 0) {
    throw new Error("interlaced (Adam7), and the contract is non-interlaced -- re-export with interlacing off");
  }
  if (head.compression !== 0 || head.filter !== 0) throw new Error("unknown compression or filter method");
  if (idat.length === 0) throw new Error("no IDAT");

  const { width: w, height: h } = head;
  const stride = w * 4;
  let raw;
  try {
    raw = zlib.inflateSync(Buffer.concat(idat));
  } catch (err) {
    throw new Error(`the pixel data will not inflate: ${err.message}`);
  }
  if (raw.length < (stride + 1) * h) throw new Error("the pixel data is short: truncated");

  // Reconstruction, all five filter types. `a` is the pixel to the left, `b`
  // the one above, `c` the one above-left, all of them already reconstructed,
  // and all of them zero outside the image.
  const data = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) {
    const ft = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const dst = y * stride;
    const up = dst - stride;
    for (let i = 0; i < stride; i++) {
      const x = raw[src + i];
      const a = i >= 4 ? data[dst + i - 4] : 0;
      const b = y > 0 ? data[up + i] : 0;
      const c = i >= 4 && y > 0 ? data[up + i - 4] : 0;
      let v;
      if (ft === 0) v = x;
      else if (ft === 1) v = x + a;
      else if (ft === 2) v = x + b;
      else if (ft === 3) v = x + ((a + b) >> 1);
      else if (ft === 4) v = x + paeth(a, b, c);
      else throw new Error(`filter type ${ft} on row ${y}: PNG defines 0 through 4`);
      data[dst + i] = v & 0xff;
    }
  }
  return { width: w, height: h, data };
}

// ------------------------------------------------------------ the measurement

/**
 * The tight alpha bounding box and the alpha census.
 *
 * `x1`/`y1` are exclusive, so the box is `w = x1 - x0` and its centre is
 * `(x0 + x1) / 2` -- a coordinate on the pixel grid rather than a pixel index.
 * That is deliberate: an anchor is a point a transform lands on, not a pixel it
 * paints, and half-pixel centres are the honest answer whenever the content is
 * an odd number of pixels wide inside an even cell (a Fighter is 109 in 128).
 */
function measure(img) {
  const { width: w, height: h, data } = img;
  let x0 = w;
  let y0 = h;
  let x1 = 0;
  let y1 = 0;
  let covered = 0; // a > 0
  let opaque = 0; // a == 255
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const a = data[(y * w + x) * 4 + 3];
      if (a === 0) continue;
      covered++;
      if (a === 255) opaque++;
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x + 1 > x1) x1 = x + 1;
      if (y + 1 > y1) y1 = y + 1;
    }
  }
  if (covered === 0) return { empty: true, covered: 0, opaque: 0 };
  return {
    empty: false,
    x0,
    y0,
    x1,
    y1,
    w: x1 - x0,
    h: y1 - y0,
    cx: (x0 + x1) / 2,
    cy: (y0 + y1) / 2,
    covered,
    opaque,
  };
}

/**
 * How many partly-transparent pixels are *not* on the edge -- the halo count.
 *
 * "No anti-aliased halo" has to become something a script can decide, and this
 * is the form. A pixel is soft if `0 < a < 255`. A soft pixel is legitimate
 * feather when it is 8-adjacent to a fully transparent pixel, or to the outside
 * of the image, which is background too; that is a feather exactly one pixel
 * deep, which is what the spec allows. Any other soft pixel is a halo pixel: it
 * is a grey value sitting behind the first ring, and a four-pixel halo has
 * three rings of them.
 *
 * The threshold is a share rather than zero. A one-pixel feather produces
 * *exactly* zero halo pixels by construction, so the tolerance is not there to
 * pass good art -- it is there so a handful of stray interior texels (a
 * highlight painted at alpha 250, a decal that is genuinely translucent in its
 * middle) does not fail a whole batch. 0.5 % of the covered pixels is a wide
 * margin below the thing being caught: a four-pixel halo around a Fighter's
 * 109 x 116 figure is roughly three rings of a ~450 px perimeter, about 1350
 * pixels against a covered area of ~12600, which is 11 % -- twenty times the
 * threshold. There is no calibration between those two numbers to get wrong.
 */
function haloPixels(img) {
  const { width: w, height: h, data } = img;
  let halo = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const a = data[(y * w + x) * 4 + 3];
      if (a === 0 || a === 255) continue;
      let feather = false;
      for (let dy = -1; dy <= 1 && !feather; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h || data[(ny * w + nx) * 4 + 3] === 0) {
            feather = true;
            break;
          }
        }
      }
      if (!feather) halo++;
    }
  }
  return halo;
}

// -------------------------------------------------------- the classification
//
// Which of the five kinds a file is, and what the spec says about it, from its
// path alone. ASSET_SPEC.md's naming section is what makes this possible --
// `category-or-archetype/lower_snake.png`, no spaces -- so a file this cannot
// place is a naming violation and is reported as one rather than skipped.

function classify(rel) {
  const parts = rel.split("/");
  if (parts.length !== 2) {
    return { error: `sits ${parts.length - 1} directories deep; assets are <category>/<name>.png, one level` };
  }
  const [dir, base] = parts;
  const stem = base.slice(0, -4);
  if (stem !== stem.toLowerCase() || /[^a-z0-9_]/.test(stem)) {
    return { error: `"${base}" is not lower case, digits and underscores` };
  }

  const arch = ARCHETYPES[dir];
  if (arch) return classifyActor(dir, arch, stem);

  if (dir === "weapons") return { kind: "weapon", key: `weapons/${stem}`, transparent: true };
  if (dir === "props") return { kind: "billboard", key: `props/${stem}`, transparent: true };
  if (dir === "env") {
    if (stem.startsWith("floor_") || stem.endsWith("_top")) {
      return { kind: "surface", key: `env/${stem}`, world: FLOOR_WORLD, size: [FLOOR_WORLD, FLOOR_WORLD], opaque: true };
    }
    if (stem.startsWith("wall_")) {
      return { kind: "face", key: `env/${stem}`, world: WALL_WORLD, size: WALL_WORLD, opaque: true };
    }
    if (stem.startsWith("torch") || stem.startsWith("lantern")) {
      return { kind: "billboard", key: `env/${stem}`, transparent: true };
    }
    return { kind: "decal", key: `env/${stem}`, square: DECAL_WORLD, transparent: true };
  }
  return {
    error:
      `unknown category directory "${dir}" -- the spec names env, props, weapons and the archetype` +
      ` directories (${Object.keys(ARCHETYPES).join(", ")})`,
  };
}

// The layers an archetype can ship, keyed by the filename prefix. The manifest
// calls the weapon arm `armMain` because a rig slot is what it fills, while the
// file is `arm_{facing}.png` because that is what the spec asks an artist for;
// the two names meet here and nowhere else.
const LAYERS = { body: "body", arm: "armMain", shield: "shield", head: "head" };

function classifyActor(dir, arch, stem) {
  const bits = stem.split("_");
  const common = { kind: "actor", archetype: dir, arch, cell: arch.cell, transparent: true };
  if (bits[0] === "body" && bits.length === 3 && FACINGS.includes(bits[1]) && FRAMES.includes(bits[2])) {
    return { ...common, layer: "body", facing: bits[1], frame: bits[2] };
  }
  if (LAYERS[bits[0]] && bits[0] !== "body" && bits.length === 2 && FACINGS.includes(bits[1])) {
    return { ...common, layer: bits[0], facing: bits[1] };
  }
  return {
    error:
      `"${stem}.png" is in an archetype directory but is not body_{facing}_{frame} or` +
      ` ${Object.keys(LAYERS).filter((l) => l !== "body").join("/")}_{facing},` +
      ` with {facing} in ${FACINGS.join("/")}`,
  };
}

// ------------------------------------------------------------------- the run

const problems = [];
function problem(rel, msg) {
  problems.push(`${rel}: ${msg}`);
}

function px(world) {
  return Math.round(world * PX_PER_WORLD_UNIT);
}

const root = process.argv[2] ? path.resolve(process.argv[2]) : path.join(ROOT, "web", "assets");
if (!fs.existsSync(root)) {
  console.error(`no such directory: ${root}`);
  process.exit(1);
}

/**
 * Every PNG under `dir`, except the shouting ones at the top.
 *
 * `web/assets/` holds three documents *about* the contract -- `ASSET_SPEC.md`,
 * `FEEDBACK.md` and the reference image `CONCEPT.png` -- alongside the
 * categories that hold assets. A top-level file in SHOUTING CASE is one of
 * those and the renderer will never load it. Anything else at the top level is
 * an asset that has been dropped in the wrong place, and is reported as the
 * naming violation it is rather than skipped.
 */
function pngsUnder(dir, top) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...pngsUnder(full, false));
    else if (!entry.name.toLowerCase().endsWith(".png")) continue;
    else if (top && /^[A-Z0-9_]+\.png$/.test(entry.name)) continue;
    else out.push(full);
  }
  return out.sort();
}

const files = pngsUnder(root, true);
console.log(`${files.length} PNG${files.length === 1 ? "" : "s"} under ${root}`);
console.log("");

const measured = [];
for (const file of files) {
  const rel = path.relative(root, file).split(path.sep).join("/");
  const spec = classify(rel);
  if (spec.error) {
    problem(rel, spec.error);
    continue;
  }

  let img;
  try {
    img = decodePng(fs.readFileSync(file));
  } catch (err) {
    problem(rel, err.message);
    continue;
  }

  const box = measure(img);
  if (box.empty) {
    problem(rel, "every pixel is fully transparent: there is nothing in this file");
    continue;
  }

  // ---- the format checks, in the order a defect is likely
  const halo = haloPixels(img);
  if (halo > box.covered * HALO_SHARE) {
    problem(
      rel,
      `${halo} partly-transparent pixels sit behind the edge, ${((100 * halo) / box.covered).toFixed(1)}% of the` +
        ` covered area -- that is an anti-aliased halo, and the spec allows one pixel of feather`
    );
  }
  if (spec.opaque && box.opaque !== img.width * img.height) {
    problem(rel, `a ${spec.kind} must be fully opaque, and ${img.width * img.height - box.opaque} pixels are not`);
  }
  if (spec.transparent && box.covered === img.width * img.height) {
    problem(rel, `a ${spec.kind} is drawn on a transparent background, and every pixel here is painted`);
  }

  // ---- the dimension checks
  if (spec.size) {
    const want = [px(spec.size[0]), px(spec.size[1])];
    if (img.width !== want[0] || img.height !== want[1]) {
      problem(
        rel,
        `${img.width} x ${img.height}, and a ${spec.kind} is ${spec.size[0]} x ${spec.size[1]} world units,` +
          ` which is ${want[0]} x ${want[1]} at ${PX_PER_WORLD_UNIT} px/unit`
      );
    }
  }
  if (spec.square) {
    const lo = px(spec.square[0]);
    const hi = px(spec.square[1]);
    if (img.width !== img.height || img.width < lo || img.width > hi) {
      problem(rel, `${img.width} x ${img.height}, and a decal is a square between ${lo} and ${hi} px`);
    }
  }
  if (spec.kind === "weapon" && box.h > box.w) {
    problem(rel, `${box.w} x ${box.h} of content: a weapon is drawn along +x, hilt left and tip right, so it is wider than it is tall`);
  }
  if (spec.kind === "weapon" && (box.x0 !== 0 || box.y0 !== 0 || box.x1 !== img.width || box.y1 !== img.height)) {
    problem(rel, `content sits at ${box.x0},${box.y0} ${box.w} x ${box.h} inside a ${img.width} x ${img.height} image: weapons are tight-cropped`);
  }

  // ---- the actor checks
  if (spec.kind === "actor") {
    const [cw, ch] = spec.cell;
    if (img.width !== cw || img.height !== ch) {
      problem(rel, `${img.width} x ${img.height}, but a ${spec.archetype} actor layer must be exactly its cell, ${cw} x ${ch}`);
    } else {
      // The corners, which is the operational form of "no fully-opaque
      // background pixel": the drawn size is strictly smaller than the cell for
      // every archetype in the table, so a painted corner is background.
      const corner = (x, y) => img.data[(y * img.width + x) * 4 + 3];
      if (corner(0, 0) || corner(cw - 1, 0) || corner(0, ch - 1) || corner(cw - 1, ch - 1)) {
        problem(rel, "a corner of the cell is painted: the background must be transparent");
      }
      if (spec.layer === "body") {
        if (Math.abs(ch - box.y1) > FOOTING_SLOP) {
          problem(rel, `the content's bottom is ${ch - box.y1} px above the cell's bottom edge; feet sit on it`);
        }
        if (Math.abs(box.cx - cw / 2) > FOOTING_SLOP) {
          problem(rel, `the content's centre is at x ${box.cx}, and the cell's is ${cw / 2}: bodies are horizontally centred`);
        }
        const [dw, dh] = spec.arch.drawn;
        if (Math.abs(box.w - dw) > dw * SIZE_SLOP || Math.abs(box.h - dh) > dh * SIZE_SLOP) {
          problem(rel, `drawn ${box.w} x ${box.h}, and a ${spec.archetype} is ${dw} x ${dh} at ${PX_PER_WORLD_UNIT} px/unit`);
        }
      } else {
        // An arm, a shield or a head is drawn *on* its pivot, so the pivot has
        // to be inside its own content. A layer that misses it was drawn on a
        // bare cell with the joint somewhere the renderer will never rotate
        // about, and the symptom in the game is a limb orbiting its body.
        const [pxx, pyy] = [cw / 2, ch - spec.arch.shoulder];
        if (pxx < box.x0 || pxx > box.x1 || pyy < box.y0 || pyy > box.y1) {
          problem(
            rel,
            `the ${spec.layer} pivot is ${pxx},${pyy} and the content is at ${box.x0},${box.y0} ${box.w} x ${box.h}:` +
              ` the joint must be drawn on the pivot, and the pivot column is the cell's centre for every facing`
          );
        }
      }
    }
  }

  // The pixels are not kept: everything downstream works off the box, and an
  // asset set that grows to a few hundred files should not hold all of them
  // decoded at once to print a dozen lines of JSON.
  measured.push({ rel, spec, box });

  // The measurement beside what the spec asks for, so the two can be read
  // against each other even on the files that passed. A tool that only speaks
  // up when something is wrong is a tool nobody can use to decide what to draw.
  const anchor =
    spec.kind === "actor" && spec.layer !== "body"
      ? `pivot ${spec.cell[0] / 2},${spec.cell[1] - spec.arch.shoulder}`
      : `anchor ${Math.round(box.cx)},${box.y1}`;
  let wants = spec.kind;
  if (spec.size) wants += `, spec ${px(spec.size[0])} x ${px(spec.size[1])}`;
  else if (spec.square) wants += `, spec ${px(spec.square[0])}..${px(spec.square[1])} square`;
  else if (spec.kind === "actor") {
    wants += ` ${spec.archetype} ${spec.layer}, spec cell ${spec.cell[0]} x ${spec.cell[1]}`;
    if (spec.layer === "body") wants += `, drawn ${spec.arch.drawn[0]} x ${spec.arch.drawn[1]}`;
  } else wants += ", spec sets no size";
  console.log(
    `  ${rel.padEnd(30)} ${String(img.width).padStart(4)} x ${String(img.height).padEnd(4)}` +
      ` bbox ${box.x0},${box.y0} ${box.w} x ${box.h}   ${anchor}   ${wants}`
  );
}

// ---- every frame of one facing has the same bounding box centre
//
// This is the check that catches the failure mode the convention actually has.
// A body layer is anchored on its own content, so a walk frame drawn three
// pixels to the left is a figure that slides sideways once per stride: it is
// invisible in the file, invisible frame by frame, and unmistakable the moment
// the thing walks. Sideways is gated hard, because a figure's mass does not
// move sideways over a stride and there is no legitimate reason for it to.
// Vertically it is the same tolerance as the footing, because a passing pose
// may honestly drop the crown a pixel while the feet stay put.
const byFacing = new Map();
for (const m of measured) {
  if (m.spec.kind !== "actor" || m.spec.layer !== "body") continue;
  const key = `${m.spec.archetype}/${m.spec.facing}`;
  if (!byFacing.has(key)) byFacing.set(key, []);
  byFacing.get(key).push(m);
}

/** The value most of `group` agrees on -- the majority, not the first frame,
 *  so that one drifted frame names itself rather than renaming the other
 *  three. Ties go to the first, which only happens at two frames against two
 *  and is already a mess somebody has to look at. */
function consensus(group, of) {
  const tally = new Map();
  for (const m of group) tally.set(of(m), (tally.get(of(m)) || 0) + 1);
  let ref = of(group[0]);
  for (const [v, n] of tally) if (n > tally.get(ref)) ref = v;
  return ref;
}

for (const group of byFacing.values()) {
  if (group.length < 2) continue;
  const refX = consensus(group, (m) => m.box.cx);
  const refY = consensus(group, (m) => m.box.cy);
  const agree = group.filter((m) => m.box.cx === refX).map((m) => m.spec.frame).join(", ");
  for (const m of group) {
    if (Math.abs(m.box.cx - refX) > DRIFT_SLOP) {
      problem(
        m.rel,
        `bbox centre x is ${m.box.cx}, but the other frames of facing ${m.spec.facing} agree on ${refX} (${agree})` +
          ` -- a frame off-centre makes the figure bob sideways as it walks`
      );
    }
    if (Math.abs(m.box.cy - refY) > FOOTING_SLOP) {
      problem(m.rel, `bbox centre y is ${m.box.cy}, and the other frames of facing ${m.spec.facing} agree on ${refY}`);
    }
  }
}

// ------------------------------------------------------------- the fragments
//
// Pasteable into the "assets" object of web/assets/manifest.json, whole. An
// actor collapses to one entry however many files it has, because {facing} and
// {frame} are substituted from the manifest's own lists -- that is why a
// Fighter is four lines of JSON and not thirty-two.

function pair(a, b) {
  return `[${a}, ${b}]`;
}

const fragments = [];
const actors = new Map();
for (const m of measured) {
  const { spec, box, rel } = m;
  if (spec.kind === "actor") {
    if (!actors.has(spec.archetype)) actors.set(spec.archetype, { cell: spec.cell, arch: spec.arch, layers: new Map() });
    const entry = actors.get(spec.archetype);
    if (!entry.layers.has(spec.layer)) entry.layers.set(spec.layer, { facings: new Set(), frames: new Set(), boxes: [] });
    const layer = entry.layers.get(spec.layer);
    layer.facings.add(spec.facing);
    if (spec.frame) layer.frames.add(spec.frame);
    layer.boxes.push(box);
    continue;
  }
  if (spec.kind === "surface") {
    fragments.push(`"${spec.key}": { "file": "${rel}", "kind": "surface", "world": ${spec.world} },`);
  } else if (spec.kind === "face") {
    fragments.push(`"${spec.key}": { "file": "${rel}", "kind": "face", "world": ${pair(spec.world[0], spec.world[1])} },`);
  } else if (spec.kind === "weapon") {
    // Hilt at the left edge of the content and tip at the right, both at its
    // vertical centre, which is the convention stated in ASSET_SPEC.md and the
    // reason a weapon is authored along +x. The renderer stretches the image
    // between the two projected points, so these are the only two numbers in
    // the entry that mean anything.
    const y = Math.round(box.cy);
    fragments.push(
      `"${spec.key}": { "file": "${rel}", "kind": "weapon", "hilt": ${pair(box.x0, y)}, "tip": ${pair(box.x1 - 1, y)} },`
    );
  } else {
    // A billboard's anchor is the pixel that lands on the ground point: the
    // bottom centre of its own content, because a barrel stands on its base.
    // `world_h` cannot be measured -- it is how tall the thing is meant to be,
    // not how tall it was drawn -- so it is left for the integrating agent.
    fragments.push(
      `"${spec.key}": { "file": "${rel}", "kind": "billboard", "anchor": ${pair(Math.round(box.cx), box.y1)}, "world_h": ? },`
    );
  }
}

for (const [archetype, entry] of actors) {
  const lines = [];
  lines.push(`"actors/${archetype}": {`);
  lines.push(`  "kind": "actor",`);
  const facings = FACINGS.filter((f) => [...entry.layers.values()].some((l) => l.facings.has(f)));
  lines.push(`  "facings": [${facings.map((f) => `"${f}"`).join(", ")}],`);
  lines.push(`  "cell": ${pair(entry.cell[0], entry.cell[1])},`);
  lines.push(`  "layers": {`);
  const names = Object.keys(LAYERS).filter((n) => entry.layers.has(n));
  names.forEach((name, i) => {
    const layer = entry.layers.get(name);
    const file = `${archetype}/${name}_{facing}${layer.frames.size ? "_{frame}" : ""}.png`;
    const bits = [`"file": "${file}"`];
    if (layer.frames.size) bits.push(`"frames": [${FRAMES.filter((f) => layer.frames.has(f)).map((f) => `"${f}"`).join(", ")}]`);
    if (name === "body") {
      // One anchor for the whole layer, averaged over its files, which is only
      // honest because the checks above have already refused a layer whose
      // files disagree about where their content sits.
      const cx = Math.round(layer.boxes.reduce((s, b) => s + b.cx, 0) / layer.boxes.length);
      const y = Math.round(layer.boxes.reduce((s, b) => s + b.y1, 0) / layer.boxes.length);
      bits.push(`"anchor": ${pair(cx, y)}`);
    } else {
      // The pivot is the shoulder, and the shoulder is arithmetic on the sim's
      // body -- not something to read off the drawing. The check above is what
      // makes that safe: it has already refused an arm drawn away from it.
      bits.push(`"pivot": ${pair(entry.cell[0] / 2, entry.cell[1] - entry.arch.shoulder)}`);
    }
    lines.push(`    "${LAYERS[name]}": { ${bits.join(", ")} }${i === names.length - 1 ? "" : ","}`);
  });
  lines.push(`  }`);
  lines.push(`},`);
  fragments.push(lines.join("\n"));
}

if (fragments.length) {
  console.log("");
  console.log(`-- fragments, for the "assets" object of web/assets/manifest.json --`);
  console.log("");
  for (const f of fragments) console.log(f);
}

console.log("");
if (problems.length === 0) {
  console.log(`${measured.length} measured, 0 problems`);
} else {
  console.log(`-- ${problems.length} problem${problems.length === 1 ? "" : "s"} --`);
  console.log("");
  for (const p of problems) console.log(`  ${p}`);
  process.exitCode = 1;
}
