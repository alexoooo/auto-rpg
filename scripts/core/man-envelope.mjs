/**
 * **Man's contact geometry**, measured from the Warrior's GLB: the bare skin of the hands and feet,
 * where the workshop envelope (`workshop-envelope.mjs`) reads the boot. Each side's:
 *
 * - `palm` and `fist`: the hands, as `hand-envelope.mjs` measures them, without the palm patch's
 *   centre.
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
import { accessorRows, readGlb } from "./glb.mjs";
import { fromGltf, hand, hullOf, PATCH, patchOf, rigBone, round, SUFFIX } from "./hand-envelope.mjs";
import { convexHull } from "../../src/core/spec/hull.ts";
import { add, cross, dot, normalize, scale, sub } from "../../src/core/spec/vec.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const MAN_GEOMETRY_FILE = path.join(ROOT, "assets", "humanoid", "man-contact-geometry.json");
const MODEL = "workshop-fighter";

export { PATCH };

const bone = (name, end) => rigBone(MODEL, name, end);

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

let raw = null;
const glb = () => (raw ??= readGlb(path.join(ROOT, "public", "assets", "humanoid", `${MODEL}.glb`)));

/** One hand, as the hand artifact has it less the palm patch's centre. */
async function manHand(side) {
  const { palm: { hull, patch: { normal, outline } }, fist } = await hand(MODEL, side);
  return { palm: { hull, patch: { normal, outline } }, fist };
}

/** One foot's pieces, cut at the ball. */
async function foot(side) {
  const raw = glb(), s = SUFFIX[side], bones = new Set([`foot_${s}`, `ball_${s}`]);
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
  for (const side of ["left", "right"]) out[side] = { ...await manHand(side), ...await foot(side) };
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
