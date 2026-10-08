/**
 * **Man's contact geometry**, measured from the Warrior's GLB: the bare skin of the hands and feet,
 * where the workshop envelope (`workshop-envelope.mjs`) reads the boot. Each side's:
 *
 * - `palm`: the open hand's convex hull, the bind pose's skinned hand (fingers straight), and its
 *   support patch: the hull's corners within `PATCH` of the plane of its largest face within 45
 *   degrees of the palmar direction (the face a flat ground meets; it bridges the hollow of the
 *   palm), laid on that plane, as an outline with its outward normal. The palmar direction is
 *   square to the wrist-to-knuckle line and the knuckle line, on the side the rig's relaxed middle
 *   finger curls toward.
 * - `fist`: the hull of the hand skinned in the renderer's fist (`FIST`, `fistTurns`), the middle
 *   knuckle (`knuckles`, the rig's MET3) and `strike`, where the wrist-to-knuckle line through that
 *   knuckle leaves the hull: the fist's surface ahead of the middle knuckle.
 * - `foot` and `toes`: the bare foot (`bare__feet`'s vertices the foot's bones weigh most on) cut by
 *   the vertical plane through the rig's ball head square to the ball bone's horizontal direction;
 *   each piece's hull holds its side's vertices and the points where the mesh's edges cross the
 *   plane. `sole` and `pad` are their patches: the corners within `PATCH` of the piece's lowest,
 *   normal down.
 * - `mtp`: the toes' hinge: across the ball head, at the middle of the cut's height, its axis the
 *   horizontal square to the ball bone (the body's right, more or less, on either side).
 * - `rigidFoot`: the whole bare foot's hull and its sole patch.
 * - `foot.solid`, `toes.solid`: each piece's hull as a uniform solid: volume, centre, and inertia
 *   per unit mass about the centre (a row-major 3x3, m^2).
 *
 * Body frame (+x right, +y up, +z front), metres at the authored size, rounded to 0.1 mm; the spec
 * scales by the fit scale. `node scripts/core/man-envelope.mjs` prints a summary; with `--write` it
 * writes `assets/humanoid/man-contact-geometry.json`. `tests/man-envelope.test.mjs` measures it again
 * and compares. The record: `docs/reference/man-anatomy.md`.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Quaternion } from "@babylonjs/core/Maths/math.vector.js";
import { accessorRows, readGlb } from "./glb.mjs";
import { loadGlb, restBones, skinHand } from "../lab/fist-probe.mjs";
import { FIST, fistTurns } from "../../src/render/fist.ts";
import { convexHull } from "../../src/core/spec/hull.ts";
import { add, cross, dot, length, normalize, orthogonalTo, scale, sub } from "../../src/core/spec/vec.ts";
import { transcribed } from "./workshop-envelope.mjs";
import fighterRig from "../../assets/humanoid/workshop-fighter.json" with { type: "json" };

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const MAN_GEOMETRY_FILE = path.join(ROOT, "assets", "humanoid", "man-contact-geometry.json");
const MODEL = "workshop-fighter";

/**
 * How far a corner may stand from a piece's supporting plane and belong to its patch, m: the
 * thickness of skin taken to flatten under load. A chosen tolerance, not a measurement.
 */
export const PATCH = 0.005;

/** Blender (the rig's export) to the body frame, as `src/core/human/rig.ts` turns it. */
const fromBlender = ([x, y, z]) => [-x, z, -y];
/** glTF (the GLB) to the body frame, as `workshop-envelope.mjs` turns it. */
const fromGltf = ([x, y, z]) => [-x, y, z];
const bone = (name, end) => fromBlender(fighterRig.bones[name][end]);
const SUFFIX = { left: "l", right: "r" };

const round = (p) => p.map(transcribed);
const hullOf = (points) => convexHull(points).vertices.map((i) => points[i]);

/**
 * The outline of `points` laid on the plane through `onPlane` with normal `normal`: the points
 * moved onto it, their convex outline about `u` and `normal x u`, anticlockwise seen from the normal's side.
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
function patchOf(hull, normal, u) {
  const far = Math.max(...hull.map((p) => dot(p, normal)));
  const near = hull.filter((p) => dot(p, normal) >= far - PATCH);
  return { normal: round(normal), outline: patchOutline(near, normal, far, u).map(round) };
}

/**
 * **A convex hull as a uniform solid**: volume (m^3), centre, and inertia per unit mass about the
 * centre (row-major 3x3, m^2), summed over the tetrahedra from the corners' mean to each face.
 */
export function hullSolid(points) {
  const { faces, vertices } = convexHull(points);
  const o = scale(vertices.reduce((s, i) => add(s, points[i]), [0, 0, 0]), 1 / vertices.length);
  let volume = 0, first = [0, 0, 0];
  const second = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const [i, j, k] of faces) {
    const a = sub(points[i], o), b = sub(points[j], o), c = sub(points[k], o), det = dot(a, cross(b, c));
    volume += det / 6;
    const s = add(add(a, b), c);
    first = add(first, scale(s, det / 24));
    for (let r = 0; r < 3; r++) for (let q = 0; q < 3; q++) {
      second[r][q] += (det / 120) * (a[r] * a[q] + b[r] * b[q] + c[r] * c[q] + s[r] * s[q]);
    }
  }
  const sign = Math.sign(volume);
  volume *= sign;
  const c = scale(first, sign / volume);
  const M = second.map((row, r) => row.map((m, q) => sign * m - volume * c[r] * c[q]));
  const trace = M[0][0] + M[1][1] + M[2][2];
  const inertia = M.map((row, r) => row.map((m, q) => ((r === q ? trace : 0) - m) / volume));
  return { volume, centre: add(o, c), inertia };
}

const roundSolid = ({ volume, centre, inertia }) => ({
  volume: Number(volume.toPrecision(6)), centre: round(centre), inertia: inertia.map((row) => row.map((m) => Number(m.toPrecision(6)) + 0)),
});

let glbCache = null;
async function glbs() {
  glbCache ??= { skin: await loadGlb(MODEL), raw: readGlb(path.join(ROOT, "public", "assets", "humanoid", `${MODEL}.glb`)) };
  return glbCache;
}

/** One hand's open and closed geometry. */
async function hand(side) {
  const { skin } = await glbs(), s = SUFFIX[side];
  const bodyOf = (verts) => verts.map((v) => ({ part: v.part, p: fromGltf(v.p) }));
  const open = bodyOf(skinHand(skin, s, new Map()));
  const WJC = bone(`hand_${s}`, "head"), MET3 = bone(`middle_01_${s}`, "head");
  const forward = normalize(sub(MET3, WJC));
  const across = sub(bone(`index_01_${s}`, "head"), bone(`pinky_01_${s}`, "head"));
  let palmar = normalize(cross(forward, across));
  // The palmar side is where the relaxed middle finger's last phalanx goes.
  const relaxed = new Map(Object.entries(fighterRig.grips.empty).filter(([name]) => name.endsWith(`_${s}`))
    .map(([name, q]) => [name, new Quaternion(q[1], q[2], q[3], q[0])]));
  const tip = (verts) => scale(verts.filter((v) => v.part === `middle_03_${s}`).reduce((sum, v) => add(sum, v.p), [0, 0, 0]),
    1 / verts.filter((v) => v.part === `middle_03_${s}`).length);
  if (dot(sub(tip(bodyOf(skinHand(skin, s, relaxed))), tip(open)), palmar) < 0) palmar = scale(palmar, -1);
  const openHull = hullOf(open.map((v) => v.p)), face = largestFaceToward(openHull, palmar);
  const closed = hullOf(bodyOf(skinHand(skin, s, fistTurns(restBones(skin, s), s, FIST[MODEL]))).map((v) => v.p));
  // Where the wrist-to-knuckle line leaves the fist: the nearest face plane ahead along it.
  const reach = Math.min(...convexHull(closed).planes.filter(({ normal }) => dot(normal, forward) > 0)
    .map(({ normal, offset }) => (offset - dot(normal, MET3)) / dot(normal, forward)));
  return {
    palm: { hull: openHull.map(round), patch: patchOf(openHull, face, orthogonalTo(forward, face)) },
    fist: { hull: closed.map(round), knuckles: round(MET3), strike: round(add(MET3, scale(forward, reach))) },
  };
}

/** One foot's pieces, cut at the ball. */
async function foot(side) {
  const { raw } = await glbs(), s = SUFFIX[side], bones = new Set([`foot_${s}`, `ball_${s}`]);
  const names = raw.json.skins[0].joints.map((node) => raw.json.nodes[node].name);
  const points = [], kept = [], edges = new Set();
  for (const mesh of raw.json.meshes.filter((m) => m.name.replace(/\.001$/, "") === "bare__feet")) {
    for (const primitive of mesh.primitives) {
      const positions = accessorRows(raw, primitive.attributes.POSITION);
      const joints = accessorRows(raw, primitive.attributes.JOINTS_0), weights = accessorRows(raw, primitive.attributes.WEIGHTS_0);
      const base = points.length;
      positions.forEach((position, i) => {
        let heaviest = 0;
        for (let c = 1; c < weights[i].length; c++) if (weights[i][c] > weights[i][heaviest]) heaviest = c;
        points.push(fromGltf(position));
        kept.push(bones.has(names[joints[i][heaviest]]));
      });
      const indices = accessorRows(raw, primitive.indices).map(([i]) => base + i);
      for (let f = 0; f < indices.length; f += 3) {
        const [a, b, c] = indices.slice(f, f + 3);
        for (const [u, v] of [[a, b], [b, c], [c, a]]) edges.add(u < v ? `${u} ${v}` : `${v} ${u}`);
      }
    }
  }
  const head = bone(`ball_${s}`, "head"), tail = bone(`ball_${s}`, "tail");
  const along = normalize([tail[0] - head[0], 0, tail[2] - head[2]]);
  const at = (p) => dot(sub(p, head), along);
  const section = [];
  for (const edge of edges) {
    const [u, v] = edge.split(" ").map(Number);
    if (!kept[u] || !kept[v]) continue;
    const du = at(points[u]), dv = at(points[v]);
    if ((du < 0 && dv > 0) || (du > 0 && dv < 0)) section.push(add(points[u], scale(sub(points[v], points[u]), du / (du - dv))));
  }
  const bare = points.filter((_, i) => kept[i]);
  const main = [...bare.filter((p) => at(p) < 0), ...section], toes = [...bare.filter((p) => at(p) > 0), ...section];
  const heights = section.map((p) => p[1]);
  const centre = [head[0], (Math.min(...heights) + Math.max(...heights)) / 2, head[2]];
  const axis = normalize(cross([0, 1, 0], along));
  const down = [0, -1, 0];
  const piece = (cloud, patch) => {
    const hull = hullOf(cloud);
    return { hull: hull.map(round), [patch]: patchOf(hull, down, along), solid: roundSolid(hullSolid(hull)) };
  };
  const rigid = hullOf(bare);
  return {
    foot: piece(main, "sole"), toes: piece(toes, "pad"),
    mtp: { centre: round(centre), axis: round(axis) },
    rigidFoot: { hull: rigid.map(round), sole: patchOf(rigid, down, along) },
  };
}

/** The whole artifact. */
export async function manContactGeometry() {
  const out = {
    about: "Man's contact geometry from the Warrior's GLB: bare hands and feet, body frame (+x right, +y up, +z front), "
      + "metres at the authored size, rounded to 0.1 mm. Written by scripts/core/man-envelope.mjs --write; "
      + "docs/reference/man-anatomy.md is the record.",
    model: MODEL, patch: PATCH,
  };
  for (const side of ["left", "right"]) out[side] = { ...await hand(side), ...await foot(side) };
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const geometry = await manContactGeometry();
  for (const side of ["left", "right"]) {
    const g = geometry[side];
    console.log(`${side}: palm ${g.palm.hull.length} corners, patch ${g.palm.patch.outline.length}; fist ${g.fist.hull.length}; `
      + `foot ${g.foot.hull.length} (${(g.foot.solid.volume * 1e6).toFixed(0)} cm3); toes ${g.toes.hull.length} (${(g.toes.solid.volume * 1e6).toFixed(0)} cm3); `
      + `mtp ${JSON.stringify(g.mtp)}`);
  }
  if (process.argv.includes("--write")) fs.writeFileSync(MAN_GEOMETRY_FILE, `${JSON.stringify(geometry)}\n`);
}
