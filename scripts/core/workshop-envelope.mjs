/**
 * **The workshop models' clothed envelope**, measured from their GLBs: what the core's human spec
 * takes where the rig gives a joint but no surface.
 *
 * - The trunk: the extents of the vertices the trunk's bones weigh most on, in each trunk
 *   segment's own frame, over the stretch of the trunk line that segment holds.
 * - The feet: the boot's footprint, from the vertices the foot's bones weigh most on.
 *
 * The envelope is the skin where it shows and the clothes where they cover it; the skin mesh has
 * its covered faces removed, so the clothes are the surface there. Armour, weapons and hair are
 * not the body. Everything is in the body frame (`src/core/spec/body.ts`) at the authored size.
 *
 * `node scripts/core/workshop-envelope.mjs` prints what `src/core/human/envelope.ts` states,
 * rounded to 0.1 mm; `tests/core-human.test.mjs` measures it again and compares.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readGlb, weightedVertices } from "./glb.mjs";
import { segmentFrame } from "../../src/core/spec/body.ts";
import { dot, sub } from "../../src/core/spec/vec.ts";
import { trunkLandmarks } from "../../src/core/human/landmarks.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export const ENVELOPE_MESHES = Object.freeze([
  "base__skin", "bare__feet", "base__jacket", "base__jacket_seam0", "base__jacket_seam1",
  "base__jacket_seam2", "base__jacket_seam3", "base__trousers", "base__belt", "base__collar",
  "boots__l", "boots__r", "boots__cuff_l", "boots__cuff_r",
]);

/** The bones whose vertices are the trunk's surface: the pelvis, the spine and the clavicles. */
export const TRUNK_BONES = Object.freeze(["pelvis", "spine_01", "spine_02", "spine_03", "clavicle_l", "clavicle_r"]);
/** The bones whose vertices are a foot's surface, by side. The rig's `_l` is the model's left. */
export const FOOT_BONES = Object.freeze({ left: ["foot_l", "ball_l"], right: ["foot_r", "ball_r"] });

/** glTF (+x the model's left, +y up, +z its front) to the body frame (+x its right). */
const fromGltf = ([x, y, z]) => [-x, y, z];

const cache = new Map();
function envelope(model) {
  if (!cache.has(model)) {
    const glb = readGlb(path.join(ROOT, "public", "assets", "humanoid", `${model}.glb`));
    cache.set(model, weightedVertices(glb, ENVELOPE_MESHES).map(({ position, bone }) => ({ position: fromGltf(position), bone })));
  }
  return cache.get(model);
}

function extent(points, axis) {
  let min = Infinity, max = -Infinity;
  for (const p of points) { min = Math.min(min, p[axis]); max = Math.max(max, p[axis]); }
  if (!(max >= min)) throw new Error("no vertices to measure");
  return { min, max };
}

const extents = (points) => ({ x: extent(points, 0), y: extent(points, 1), z: extent(points, 2) });

/**
 * The trunk's envelope in `frame` (a segment frame, body frame at the authored size): the extents,
 * along the frame's axes, of the trunk's vertices whose coordinate along y lies in [from, to].
 */
export function trunkBand(model, frame, from, to) {
  const points = envelope(model).filter(({ bone }) => TRUNK_BONES.includes(bone))
    .map(({ position }) => { const d = sub(position, frame.origin); return [dot(d, frame.x), dot(d, frame.y), dot(d, frame.z)]; })
    .filter((p) => p[1] >= from && p[1] <= to);
  return { vertices: points.length, ...extents(points) };
}

/**
 * The three trunk segments' envelopes. Each holds its stretch of the CERV-MIDH line: the upper
 * trunk everything cranial of XYPH, the middle XYPH to OMPH, the lower everything caudal of OMPH.
 */
export function trunkEnvelope(model) {
  const at = (q) => q.value;
  const { CERV, XYPH, OMPH, MIDH } = trunkLandmarks(model);
  const frame = (origin) => ({ ...segmentFrame(at(CERV), at(MIDH)), origin: at(origin) });
  const along = (from, point) => dot(sub(at(point), at(from)), segmentFrame(at(CERV), at(MIDH)).y);
  return {
    upper: trunkBand(model, frame(CERV), -Infinity, along(CERV, XYPH)),
    middle: trunkBand(model, frame(XYPH), 0, along(XYPH, OMPH)),
    lower: trunkBand(model, frame(OMPH), 0, Infinity),
  };
}

/** One foot's footprint: its vertices' extents in the body frame. `side` is the model's own. */
export function footprint(model, side) {
  const points = envelope(model).filter(({ bone }) => FOOT_BONES[side].includes(bone)).map(({ position }) => position);
  return { vertices: points.length, ...extents(points) };
}

/** Metres to the 0.1 mm the spec states. */
export const transcribed = (metres) => Math.round(metres * 1e4) / 1e4 + 0; // + 0: no -0

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const show = (what, e) => console.log(what, e.vertices, ["x", "y", "z"].map((a) => `${a} ${transcribed(e[a].min)} ${transcribed(e[a].max)}`).join("  "));
  for (const model of ["workshop-fighter", "workshop-rogue"]) {
    for (const [segment, e] of Object.entries(trunkEnvelope(model))) show(`${model} ${segment} trunk`, e);
    for (const side of ["left", "right"]) show(`${model} ${side} foot`, footprint(model, side));
  }
}
