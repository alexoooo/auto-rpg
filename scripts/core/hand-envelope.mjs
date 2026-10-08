/**
 * **A workshop human's hands**, measured from its GLB's bare skin (`base__skin`, which the Warrior
 * and the Rogue share with their rig). Each side's:
 *
 * - `palm`: the open hand's convex hull, the bind pose's skinned hand (fingers straight), and its
 *   support patch: the hull's corners within `PATCH` of the plane of its largest face within 45
 *   degrees of the palmar direction (the face a flat ground meets; it bridges the hollow of the
 *   palm), laid on that plane, as an outline with its outward normal and its centre, the outline's
 *   centroid, where an open hand bears. The palmar direction is square to the wrist-to-knuckle
 *   line and the knuckle line, on the side the rig's relaxed middle finger curls toward.
 * - `fist`: the hull of the hand skinned in the renderer's fist (`FIST`, `fistTurns`), the middle
 *   knuckle (`knuckles`, the rig's MET3) and `strike`, where the wrist-to-knuckle line through that
 *   knuckle leaves the hull: the fist's surface ahead of the middle knuckle.
 *
 * Body frame (+x right, +y up, +z front), metres at the authored size, rounded to 0.1 mm; the spec
 * scales by the fit scale. `node scripts/core/hand-envelope.mjs` prints a summary; with `--write`
 * it writes `assets/humanoid/<model>-hands.json` for each model. `tests/hand-envelope.test.mjs`
 * measures them again and compares. The record: `docs/reference/man-anatomy.md`.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Quaternion } from "@babylonjs/core/Maths/math.vector.js";
import { loadGlb, restBones, skinHand } from "../lab/fist-probe.mjs";
import { FIST, fistTurns } from "../../src/render/fist.ts";
import { convexHull } from "../../src/core/spec/hull.ts";
import { add, cross, dot, length, normalize, orthogonalTo, scale, sub } from "../../src/core/spec/vec.ts";
import { transcribed } from "./workshop-envelope.mjs";
import fighterRig from "../../assets/humanoid/workshop-fighter.json" with { type: "json" };
import rogueRig from "../../assets/humanoid/workshop-rogue.json" with { type: "json" };

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const RIGS = { "workshop-fighter": fighterRig, "workshop-rogue": rogueRig };
/** The models whose hands are measured: the workshop humans. */
export const HAND_MODELS = Object.freeze(Object.keys(RIGS));
export const handsFile = (model) => path.join(ROOT, "assets", "humanoid", `${model}-hands.json`);

/**
 * How far a corner may stand from a piece's supporting plane and belong to its patch, m: the
 * thickness of skin taken to flatten under load. A chosen tolerance, not a measurement.
 */
export const PATCH = 0.005;

/** Blender (the rig's export) to the body frame, as `src/core/human/rig.ts` turns it. */
const fromBlender = ([x, y, z]) => [-x, z, -y];
/** glTF (the GLB) to the body frame, as `workshop-envelope.mjs` turns it. */
export const fromGltf = ([x, y, z]) => [-x, y, z];
/** A bone's head or tail in the body frame. */
export const rigBone = (model, name, end) => fromBlender(RIGS[model].bones[name][end]);
export const SUFFIX = { left: "l", right: "r" };

export const round = (p) => p.map(transcribed);
export const hullOf = (points) => convexHull(points).vertices.map((i) => points[i]);

/**
 * The outline of `points` laid on the plane `dot(p, normal) = offset`: the points moved onto it, their convex outline about `u` and `normal x u`, anticlockwise seen from the normal's side.
 */
function patchOutline(points, normal, offset, u) {
  const v = cross(normal, u);
  const flat = points.map((p) => sub(p, scale(normal, dot(p, normal) - offset)));
  const sorted = [...flat].sort((a, b) => dot(a, u) - dot(b, u) || dot(a, v) - dot(b, v));
  const turn = (o, a, b) => dot(sub(a, o), u) * dot(sub(b, o), v) - dot(sub(a, o), v) * dot(sub(b, o), u);
  const chain = (from) => {
    const out = [];
    for (const q of from) {
      while (out.length >= 2 && turn(out[out.length - 2], out[out.length - 1], q) <= 1e-12) out.pop();
      out.push(q);
    }
    return out.slice(0, -1);
  };
  return [...chain(sorted), ...chain([...sorted].reverse())];
}

/** The centroid of a planar outline, anticlockwise seen from `normal`'s side: its area's centre. */
function outlineCentre(outline, normal) {
  let area = 0, sum = [0, 0, 0];
  for (let i = 1; i + 1 < outline.length; i++) {
    const a = dot(cross(sub(outline[i], outline[0]), sub(outline[i + 1], outline[0])), normal) / 2;
    area += a;
    sum = add(sum, scale(add(add(outline[0], outline[i]), outline[i + 1]), a / 3));
  }
  return scale(sum, 1 / area);
}

/**
 * The normal of `hull`'s largest face within `PALMAR` of `toward`: the face a flat ground meets
 * when the piece is pressed onto it that way. Triangles in one plane (normals within 1e-6, planes
 * within 0.1 mm) are one face.
 */
function largestFaceToward(hull, toward) {
  const { faces, planes } = convexHull(hull);
  const groups = [];
  faces.forEach(([i, j, k], f) => {
    const { normal, offset } = planes[f];
    if (dot(normal, toward) < PALMAR) return;
    const area = length(cross(sub(hull[j], hull[i]), sub(hull[k], hull[i]))) / 2;
    const group = groups.find((g) => dot(g.normal, normal) > 1 - 1e-6 && Math.abs(g.offset - offset) < 1e-4);
    if (group) group.area += area; else groups.push({ normal, offset, area });
  });
  if (groups.length === 0) throw new Error("no face toward the palm");
  return groups.reduce((best, g) => (g.area > best.area ? g : best)).normal;
}
/** How near the palmar direction a face must turn to be a palm the hand rests on: within 45 degrees. */
const PALMAR = Math.SQRT1_2;

/** A patch: the corners of `hull` within `PATCH` of its farthest along `normal`, as an outline on that plane. */
export function patchOf(hull, normal, u) {
  const far = Math.max(...hull.map((p) => dot(p, normal)));
  const near = hull.filter((p) => dot(p, normal) >= far - PATCH);
  return { normal: round(normal), outline: patchOutline(near, normal, far, u).map(round) };
}

const skins = new Map();
const skinOf = async (model) => {
  if (!skins.has(model)) skins.set(model, await loadGlb(model));
  return skins.get(model);
};

/** One hand's open and closed geometry on `model`. */
export async function hand(model, side) {
  const skin = await skinOf(model), rig = RIGS[model], s = SUFFIX[side];
  const bone = (name, end) => rigBone(model, name, end);
  const bodyOf = (verts) => verts.map((v) => ({ part: v.part, p: fromGltf(v.p) }));
  const open = bodyOf(skinHand(skin, s, new Map()));
  const WJC = bone(`hand_${s}`, "head"), MET3 = bone(`middle_01_${s}`, "head");
  const forward = normalize(sub(MET3, WJC));
  const across = sub(bone(`index_01_${s}`, "head"), bone(`pinky_01_${s}`, "head"));
  let palmar = normalize(cross(forward, across));
  // The palmar side is where the relaxed middle finger's last phalanx goes.
  const relaxed = new Map(Object.entries(rig.grips.empty).filter(([name]) => name.endsWith(`_${s}`))
    .map(([name, q]) => [name, new Quaternion(q[1], q[2], q[3], q[0])]));
  const tip = (verts) => scale(verts.filter((v) => v.part === `middle_03_${s}`).reduce((sum, v) => add(sum, v.p), [0, 0, 0]),
    1 / verts.filter((v) => v.part === `middle_03_${s}`).length);
  if (dot(sub(tip(bodyOf(skinHand(skin, s, relaxed))), tip(open)), palmar) < 0) palmar = scale(palmar, -1);
  const openHull = hullOf(open.map((v) => v.p)), face = largestFaceToward(openHull, palmar);
  const patch = patchOf(openHull, face, orthogonalTo(forward, face));
  const closed = hullOf(bodyOf(skinHand(skin, s, fistTurns(restBones(skin, s), s, FIST[model]))).map((v) => v.p));
  // Where the wrist-to-knuckle line leaves the fist: the nearest face plane ahead along it.
  const reach = Math.min(...convexHull(closed).planes.filter(({ normal }) => dot(normal, forward) > 0)
    .map(({ normal, offset }) => (offset - dot(normal, MET3)) / dot(normal, forward)));
  return {
    palm: { hull: openHull.map(round), patch: { ...patch, centre: round(outlineCentre(patch.outline, face)) } },
    fist: { hull: closed.map(round), knuckles: round(MET3), strike: round(add(MET3, scale(forward, reach))) },
  };
}

/** One model's artifact. */
export async function handGeometry(model) {
  const out = {
    about: `${model}'s hands from its GLB's bare skin: each side's open hull with its palm patch, and its fist's hull, `
      + "knuckles and strike; body frame (+x right, +y up, +z front), metres at the authored size, rounded to 0.1 mm. "
      + "Written by scripts/core/hand-envelope.mjs --write; docs/reference/man-anatomy.md is the record.",
    model, patch: PATCH,
  };
  for (const side of ["left", "right"]) out[side] = await hand(model, side);
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  for (const model of HAND_MODELS) {
    const geometry = await handGeometry(model);
    for (const side of ["left", "right"]) {
      const { palm, fist } = geometry[side];
      console.log(`${model} ${side}: palm ${palm.hull.length} corners, patch ${palm.patch.outline.length} at ${JSON.stringify(palm.patch.centre)}; `
        + `fist ${fist.hull.length}, knuckles ${JSON.stringify(fist.knuckles)}, strike ${JSON.stringify(fist.strike)}`);
    }
    if (process.argv.includes("--write")) fs.writeFileSync(handsFile(model), `${JSON.stringify(geometry)}\n`);
  }
}
