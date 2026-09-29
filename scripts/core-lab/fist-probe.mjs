// Measures a hand pose on the workshop skin, offline: CPU-skins `base__skin` from the GLB and
// reports, for every pair of hand parts that do not share a joint, how deep one's vertices sit
// inside the other (behind the nearest vertex of the other, along its normal), mm.
import { readFile } from "node:fs/promises";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";

export async function loadGlb(model) {
  const b = await readFile(new URL(`../../public/assets/humanoid/${model}.glb`, import.meta.url));
  const jsonLength = b.readUInt32LE(12);
  const json = JSON.parse(b.subarray(20, 20 + jsonLength).toString());
  const bin = b.subarray(20 + jsonLength + 8);
  const accessor = (i) => {
    const a = json.accessors[i], view = json.bufferViews[a.bufferView];
    const size = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[a.type];
    const bytes = { 5126: 4, 5125: 4, 5123: 2, 5121: 1 }[a.componentType];
    const start = (view.byteOffset ?? 0) + (a.byteOffset ?? 0), stride = view.byteStride ?? size * bytes;
    const dv = new DataView(bin.buffer, bin.byteOffset + start);
    const read = { 5126: (o) => dv.getFloat32(o, true), 5125: (o) => dv.getUint32(o, true), 5123: (o) => dv.getUint16(o, true), 5121: (o) => dv.getUint8(o) }[a.componentType];
    const out = new Float64Array(a.count * size);
    for (let n = 0; n < a.count; n++) for (let c = 0; c < size; c++) out[n * size + c] = read(n * stride + c * bytes);
    if (a.normalized) { const max = { 5121: 255, 5123: 65535 }[a.componentType]; for (let n = 0; n < out.length; n++) out[n] /= max; }
    return out;
  };
  const parent = {};
  json.nodes.forEach((n, i) => (n.children ?? []).forEach((c) => (parent[c] = i)));
  const nodes = json.nodes.map((n, i) => ({
    name: n.name, parent: parent[i],
    rotation: n.rotation ? new Quaternion(...n.rotation) : Quaternion.Identity(),
    position: n.translation ? Vector3.FromArray(n.translation) : Vector3.Zero(),
    scaling: n.scale ? Vector3.FromArray(n.scale) : Vector3.One(),
  }));
  const meshNode = json.nodes.findIndex((n) => n.mesh !== undefined && /^base__skin(\.\d+)?$/.test(json.meshes[n.mesh].name));
  const prim = json.meshes[json.nodes[meshNode].mesh].primitives[0], skin = json.skins[json.nodes[meshNode].skin];
  return {
    nodes, joints: skin.joints, ibm: accessor(skin.inverseBindMatrices),
    positions: accessor(prim.attributes.POSITION), jointsOf: accessor(prim.attributes.JOINTS_0),
    weights: accessor(prim.attributes.WEIGHTS_0), indices: accessor(prim.indices),
  };
}

/** The rest bones under (and including) `hand_{side}`, as `fist.ts` takes them. */
export function restBones(glb, side) {
  const hand = glb.nodes.findIndex((n) => n.name === `hand_${side}`);
  const out = new Map();
  const walk = (i) => {
    const n = glb.nodes[i];
    out.set(n.name, { parent: glb.nodes[n.parent].name, rotation: n.rotation.clone(), position: n.position.clone() });
    glb.nodes.forEach((m, j) => { if (m.parent === i) walk(j); });
  };
  walk(hand);
  return out;
}

/** Skinned hand vertices with `turns` (name -> quaternion on the rest local) applied. */
export function skinHand(glb, side, turns) {
  const world = new Map();
  const worldOf = (i) => {
    if (i === undefined) return Matrix.Identity();
    if (world.has(i)) return world.get(i);
    const n = glb.nodes[i], turn = turns.get(n.name);
    const rot = turn ? n.rotation.multiply(turn) : n.rotation;
    const m = Matrix.Compose(n.scaling, rot, n.position).multiply(worldOf(n.parent));
    world.set(i, m);
    return m;
  };
  const skinM = glb.joints.map((j, k) => Matrix.FromArray(Array.from(glb.ibm.subarray(k * 16, k * 16 + 16))).multiply(worldOf(j)));
  const names = glb.joints.map((j) => glb.nodes[j].name);
  const handPart = new RegExp(`^(hand|(thumb|index|middle|ring|pinky)_0[123])_${side}$`);
  const count = glb.positions.length / 3;
  const pos = new Float64Array(count * 3), part = new Int32Array(count).fill(-1);
  const v = new Vector3(), t = new Vector3();
  for (let i = 0; i < count; i++) {
    let best = -1, bestW = 0;
    for (let c = 0; c < 4; c++) { const w = glb.weights[i * 4 + c]; if (w > bestW) { bestW = w; best = glb.jointsOf[i * 4 + c]; } }
    if (!handPart.test(names[best])) continue;
    part[i] = best;
    v.set(glb.positions[i * 3], glb.positions[i * 3 + 1], glb.positions[i * 3 + 2]);
    let x = 0, y = 0, z = 0;
    for (let c = 0; c < 4; c++) {
      const w = glb.weights[i * 4 + c];
      if (!w) continue;
      Vector3.TransformCoordinatesToRef(v, skinM[glb.jointsOf[i * 4 + c]], t);
      x += w * t.x; y += w * t.y; z += w * t.z;
    }
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
  }
  // Area-weighted vertex normals over the triangles wholly in the hand.
  const normal = new Float64Array(count * 3);
  for (let f = 0; f < glb.indices.length; f += 3) {
    const a = glb.indices[f], b = glb.indices[f + 1], c = glb.indices[f + 2];
    if (part[a] < 0 || part[b] < 0 || part[c] < 0) continue;
    const ux = pos[b * 3] - pos[a * 3], uy = pos[b * 3 + 1] - pos[a * 3 + 1], uz = pos[b * 3 + 2] - pos[a * 3 + 2];
    const wx = pos[c * 3] - pos[a * 3], wy = pos[c * 3 + 1] - pos[a * 3 + 1], wz = pos[c * 3 + 2] - pos[a * 3 + 2];
    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    for (const k of [a, b, c]) { normal[k * 3] += nx; normal[k * 3 + 1] += ny; normal[k * 3 + 2] += nz; }
  }
  const verts = [];
  for (let i = 0; i < count; i++) {
    if (part[i] < 0) continue;
    const l = Math.hypot(normal[i * 3], normal[i * 3 + 1], normal[i * 3 + 2]) || 1;
    verts.push({ part: names[part[i]], p: [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]], n: [normal[i * 3] / l, normal[i * 3 + 1] / l, normal[i * 3 + 2] / l] });
  }
  return verts;
}

const parentOf = (name) => {
  const m = /^(thumb|index|middle|ring|pinky)_0([123])_([lr])$/.exec(name);
  if (!m) return null;
  return m[2] === "1" ? `hand_${m[3]}` : `${m[1]}_0${+m[2] - 1}_${m[3]}`;
};
const adjacent = (a, b) => a === b || parentOf(a) === b || parentOf(b) === a;
const digit = (name) => /^[a-z]+/.exec(name)[0];

/** Every pair's worst depth (mm) of a vertex inside the other part, deepest first. */
export function penetration(verts, cap = 0.012) {
  const byPart = new Map();
  for (const v of verts) { if (!byPart.has(v.part)) byPart.set(v.part, []); byPart.get(v.part).push(v); }
  const worst = new Map();
  for (const v of verts) {
    for (const [other, list] of byPart) {
      if (adjacent(v.part, other)) continue;
      // The thumb's base is part of the palm.
      if ((/^thumb_01/.test(v.part) && /^hand/.test(other)) || (/^thumb_01/.test(other) && /^hand/.test(v.part))) continue;
      let best = null, bestD = cap * cap;
      for (const a of list) {
        const dx = v.p[0] - a.p[0], dy = v.p[1] - a.p[1], dz = v.p[2] - a.p[2], d = dx * dx + dy * dy + dz * dz;
        if (d < bestD) { bestD = d; best = a; }
      }
      if (!best) continue;
      const depth = -((v.p[0] - best.p[0]) * best.n[0] + (v.p[1] - best.p[1]) * best.n[1] + (v.p[2] - best.p[2]) * best.n[2]);
      const key = [v.part, other].sort().join(" / ");
      if (depth > (worst.get(key) ?? 0)) worst.set(key, depth);
    }
  }
  return [...worst].map(([pair, depth]) => [pair, +(depth * 1000).toFixed(1)]).sort((a, b) => b[1] - a[1]);
}

/** The worst pair in each group: finger in palm, finger in another finger, the thumb and the rest. */
export function summary(pairs) {
  const group = (pair) => {
    const [a, b] = pair.split(" / ");
    const kinds = [a, b].map((n) => (/^hand/.test(n) ? "palm" : /^thumb/.test(n) ? "thumb" : "finger")).sort().join("-");
    return kinds === "finger-finger" && digit(a) === digit(b) ? "finger-self" : kinds;
  };
  const out = {};
  for (const [pair, depth] of pairs) { const g = group(pair); if (!(g in out) || depth > out[g][1]) out[g] = [pair, depth]; }
  return out;
}
