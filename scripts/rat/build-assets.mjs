// The rat's art from Poly Haven's Street Rat (Sean Buckley, CC0): `node scripts/rat/build-assets.mjs`.
//
// Fetches the pinned published files (each URL's SHA-256 below), and writes
// `assets/art/environment/rat/rat.glb`, the mesh skinned to the rat's segments, and the three 1k
// texture maps beside it. What the file holds and how it rides the body: docs/art/rat.md.
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Document, NodeIO } from "@gltf-transform/core";
import { MeshoptSimplifier } from "meshoptimizer";
import { ART, HEAD_RAISE, SCALE, standing, turnUp } from "./landmarks.mjs";

const ROOT = resolve(import.meta.dirname, "../.."), CACHE = join(ROOT, ".cache/art/downloads/street_rat");
const OUT = join(ROOT, "assets/art/environment/rat");
const POLY_HAVEN = "https://dl.polyhaven.org/file/ph-assets/Models";
/** The published files: the 2k glTF (its geometry is every resolution's), its buffer, and the 1k maps. */
const FILES = {
  "street_rat_2k.gltf": [`${POLY_HAVEN}/gltf/2k/street_rat/street_rat_2k.gltf`, "cd7ffb879ccda224e28e954164a8832eee0c0e0231dc0b7634b8e830c759da1e"],
  "street_rat.bin": [`${POLY_HAVEN}/gltf/8k/street_rat/street_rat.bin`, "8b7a6b9bba805537b2009a5e3f7678558edc8a365fb8e5ee2af8dc7ed0bf9f56"],
  "street_rat_diff_1k.jpg": [`${POLY_HAVEN}/jpg/1k/street_rat/street_rat_diff_1k.jpg`, "afdbbe2bb1dd7176561c2dce1bf401930e109c5669ad6496384d0fbae24d62a7"],
  "street_rat_nor_gl_1k.jpg": [`${POLY_HAVEN}/jpg/1k/street_rat/street_rat_nor_gl_1k.jpg`, "22b82eb903e46be050c454903879d0ff867b8cbc58f2c3e8c87b52085154f8b9"],
  "street_rat_arm_1k.jpg": [`${POLY_HAVEN}/jpg/1k/street_rat/street_rat_arm_1k.jpg`, "c511beb5d626f9fc9ec02be9d96322d309904f50746146b7ec1188200e7582c2"],
};

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
async function fetched(name) {
  const [url, hash] = FILES[name], path = join(CACHE, name);
  if (!existsSync(path)) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url}: ${response.status}`);
    await mkdir(CACHE, { recursive: true });
    await writeFile(path, Buffer.from(await response.arrayBuffer()));
  }
  const bytes = await readFile(path);
  if (sha256(bytes) !== hash) throw new Error(`${name}: SHA-256 ${sha256(bytes)}, pinned ${hash}`);
  return { path, bytes };
}

/** The published mesh: its one primitive's positions, normals, texture coordinates and triangles. */
async function source() {
  const gltf = JSON.parse((await fetched("street_rat_2k.gltf")).bytes.toString("utf8")), { bytes: bin } = await fetched("street_rat.bin");
  const read = (index) => {
    const a = gltf.accessors[index], view = gltf.bufferViews[a.bufferView], width = { SCALAR: 1, VEC2: 2, VEC3: 3 }[a.type];
    const Type = { 5126: Float32Array, 5123: Uint16Array, 5125: Uint32Array }[a.componentType];
    if (view.byteStride && view.byteStride !== width * Type.BYTES_PER_ELEMENT) throw new Error("interleaved accessor");
    const start = bin.byteOffset + (view.byteOffset ?? 0) + (a.byteOffset ?? 0);
    return new Type(bin.buffer.slice(start, start + a.count * width * Type.BYTES_PER_ELEMENT));
  };
  if (gltf.meshes.length !== 1 || gltf.meshes[0].primitives.length !== 1) throw new Error("the Street Rat is one primitive");
  const { attributes, indices } = gltf.meshes[0].primitives[0];
  return { positions: read(attributes.POSITION), normals: read(attributes.NORMAL), uvs: read(attributes.TEXCOORD_0), indices: read(indices) };
}

/**
 * Each segment's influence on the skin: line pieces through the art's limbs, mm, each with its
 * half thickness. A vertex's cost for a segment is its distance from the nearest piece less that
 * piece's thickness, about zero on the segment's own surface.
 */
function influences() {
  const mirror = ([x, y, z]) => [-x, y, z];
  const out = {
    trunk: [[ART.trunk.from, ART.trunk.to, ART.trunk.radius]],
    head: [[ART.neck, ART.skull.from, ART.trunk.radius * 0.8], [ART.skull.from, ART.skull.to, ART.skull.radius], [ART.skull.to, ART.nose, 3]],
    jaw: [[ART.chin, ART.incisors, 1.5]],
    "tail.base": [[ART.tail.root, ART.tail.bend, ART.tail.rootRadius]],
    "tail.tip": [[ART.tail.bend, ART.tail.tip, ART.tail.tipRadius]],
  };
  for (const end of ["front", "hind"]) for (const side of ["left", "right"]) {
    const leg = ART[end], p = (point) => side === "left" ? point : mirror(point);
    out[`upper.${end}.${side}`] = [[p(leg.girdle), p(leg.bend), leg.upper]];
    out[`lower.${end}.${side}`] = [[p(leg.bend), p(leg.ankle), leg.lower]];
    out[`paw.${end}.${side}`] = [[p(leg.ankle), p(leg.toe), 1.2]];
  }
  return out;
}

/** The distance from `p` to the piece `a`–`b`. */
function toPiece(p, a, b) {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
  const span = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2];
  const t = Math.max(0, Math.min(1, (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / span));
  const d = [ap[0] - ab[0] * t, ap[1] - ab[1] * t, ap[2] - ab[2] * t];
  return Math.sqrt(d[0] * d[0] + d[1] * d[1] + d[2] * d[2]);
}

/** How fast a segment's weight falls behind the nearest one's, mm of cost: the blend's width at a joint. */
const BLEND = 1.2;

/** Up to four segments and their weights for each vertex, the weights in 255ths summing to 255. */
function weights(positions, segments) {
  const pieces = influences(), names = Object.keys(pieces);
  for (const name of segments) if (!pieces[name]) throw new Error(`no influence for ${name}`);
  const count = positions.length / 3, joints = new Uint8Array(count * 4), shares = new Uint8Array(count * 4);
  for (let v = 0; v < count; v++) {
    const p = [positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]];
    const costs = names.map((name) => [segments.indexOf(name), Math.min(...pieces[name].map(([a, b, r]) => toPiece(p, a, b) - r))]);
    costs.sort((x, y) => x[1] - y[1]);
    const near = costs.slice(0, 4).map(([joint, cost]) => [joint, Math.exp(-(cost - costs[0][1]) / BLEND)]);
    const total = near.reduce((s, [, w]) => s + w, 0);
    let given = 0;
    near.forEach(([joint, w], i) => {
      const share = i === 0 ? 0 : Math.round(255 * w / total);
      joints[v * 4 + i] = joint; shares[v * 4 + i] = share; given += share;
    });
    shares[v * 4] = 255 - given;
  }
  return { joints, shares };
}

/** The triangles the drawn rat keeps of the published 57,216: a creature a body's length across the screen at most. */
const TRIANGLES = 12000;

/** The published mesh simplified to `TRIANGLES`, its UV seams and normals kept, its unused vertices dropped. */
async function simplified(mesh) {
  await MeshoptSimplifier.ready;
  const count = mesh.positions.length / 3, attributes = new Float32Array(count * 5);
  for (let v = 0; v < count; v++) attributes.set([mesh.normals[v * 3], mesh.normals[v * 3 + 1], mesh.normals[v * 3 + 2], mesh.uvs[v * 2], mesh.uvs[v * 2 + 1]], v * 5);
  const [kept, error] = MeshoptSimplifier.simplifyWithAttributes(Uint32Array.from(mesh.indices), mesh.positions, 3, attributes, 5,
    [0.5, 0.5, 0.5, 1, 1], null, TRIANGLES * 3, 0.01, []);
  const remap = new Int32Array(count).fill(-1);
  let used = 0;
  for (const i of kept) if (remap[i] < 0) remap[i] = used++;
  const positions = new Float32Array(used * 3), normals = new Float32Array(used * 3), uvs = new Float32Array(used * 2);
  for (let v = 0; v < count; v++) if (remap[v] >= 0) {
    positions.set(mesh.positions.subarray(v * 3, v * 3 + 3), remap[v] * 3); normals.set(mesh.normals.subarray(v * 3, v * 3 + 3), remap[v] * 3);
    uvs.set(mesh.uvs.subarray(v * 2, v * 2 + 2), remap[v] * 2);
  }
  return { positions, normals, uvs, indices: kept.map((i) => remap[i]), error };
}

const body = JSON.parse(await readFile(join(ROOT, "assets/rat/body.json"), "utf8"));
const segments = body.segments.map((s) => s.name);
const mesh = await simplified(await source()), count = mesh.positions.length / 3;
// Weights are measured in the art's millimetres, before the mesh is scaled.
const millimetres = mesh.positions.map((v) => v * 1000);
const { joints, shares } = weights(millimetres, segments);

// Posed as the body carries its head (`HEAD_RAISE`): each vertex turned up about the neck by its
// head and jaw weight, as the skin would turn it, so the reference pose is the body's.
const normals0 = Float32Array.from(mesh.normals);
for (let v = 0; v < count; v++) {
  let w = 0;
  for (let k = 0; k < 4; k++) if (["head", "jaw"].includes(segments[joints[v * 4 + k]])) w += shares[v * 4 + k] / 255;
  if (!w) continue;
  const p = [millimetres[v * 3], millimetres[v * 3 + 1], millimetres[v * 3 + 2]], q = turnUp(p, ART.neck, HEAD_RAISE);
  for (let i = 0; i < 3; i++) millimetres[v * 3 + i] = p[i] + w * (q[i] - p[i]);
  const n = [normals0[v * 3], normals0[v * 3 + 1], normals0[v * 3 + 2]], m = turnUp(n, [0, 0, 0], HEAD_RAISE);
  const blended = n.map((x, i) => x + w * (m[i] - x)), size = Math.sqrt(blended.reduce((s, x) => s + x * x, 0));
  for (let i = 0; i < 3; i++) mesh.normals[v * 3 + i] = blended[i] / size;
}

// Standing as the body does (`standing`): each vertex carried by each of its segments' poses, by its
// weight, its normal by the same stretch; the fur of a leg lengthens along its bone and keeps its thickness.
{
  const { body: raised, legs } = standing(), poses = segments.map((name) => {
    const [piece, end, side] = name.split("."), leg = legs[`${end}.${side}`];
    return leg && leg[piece] ? leg[piece] : raised;
  });
  const before = Float64Array.from(millimetres), probe = 1;
  for (let v = 0; v < count; v++) {
    const p = [before[v * 3], before[v * 3 + 1], before[v * 3 + 2]], n = [mesh.normals[v * 3], mesh.normals[v * 3 + 1], mesh.normals[v * 3 + 2]];
    const q = [0, 0, 0], m = [0, 0, 0];
    for (let k = 0; k < 4; k++) {
      const w = shares[v * 4 + k] / 255;
      if (!w) continue;
      const pose = poses[joints[v * 4 + k]], at = pose(p);
      // A normal turns with the pose's inverse transpose: two tangents carried, crossed.
      const t = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
      const a = [n[1] * t[2] - n[2] * t[1], n[2] * t[0] - n[0] * t[2], n[0] * t[1] - n[1] * t[0]];
      const b = [n[1] * a[2] - n[2] * a[1], n[2] * a[0] - n[0] * a[2], n[0] * a[1] - n[1] * a[0]];
      const ta = pose(p.map((x, i) => x + probe * a[i])), tb = pose(p.map((x, i) => x + probe * b[i]));
      const da = ta.map((x, i) => x - at[i]), db = tb.map((x, i) => x - at[i]);
      const c = [da[1] * db[2] - da[2] * db[1], da[2] * db[0] - da[0] * db[2], da[0] * db[1] - da[1] * db[0]];
      const size = Math.sqrt(c[0] * c[0] + c[1] * c[1] + c[2] * c[2]), sense = c[0] * n[0] + c[1] * n[1] + c[2] * n[2] < 0 ? -1 : 1;
      for (let i = 0; i < 3; i++) { q[i] += w * at[i]; m[i] += w * sense * c[i] / size; }
    }
    const size = Math.sqrt(m[0] * m[0] + m[1] * m[1] + m[2] * m[2]);
    for (let i = 0; i < 3; i++) { millimetres[v * 3 + i] = q[i]; mesh.normals[v * 3 + i] = m[i] / size; }
  }
}

// Into the body frame: scaled, x mirrored to the body's right, and so each triangle's winding reversed.
const positions = new Float32Array(count * 3), normals = new Float32Array(count * 3);
for (let v = 0; v < count; v++) {
  positions[v * 3] = -millimetres[v * 3] * SCALE; positions[v * 3 + 1] = millimetres[v * 3 + 1] * SCALE; positions[v * 3 + 2] = millimetres[v * 3 + 2] * SCALE;
  normals[v * 3] = -mesh.normals[v * 3]; normals[v * 3 + 1] = mesh.normals[v * 3 + 1]; normals[v * 3 + 2] = mesh.normals[v * 3 + 2];
}
const indices = new Uint16Array(mesh.indices.length);
for (let t = 0; t < mesh.indices.length; t += 3) { indices[t] = mesh.indices[t]; indices[t + 1] = mesh.indices[t + 2]; indices[t + 2] = mesh.indices[t + 1]; }

const document = new Document(), buffer = document.createBuffer();
const accessor = (type, array, normalized = false) => document.createAccessor().setType(type).setArray(array).setNormalized(normalized).setBuffer(buffer);
const primitive = document.createPrimitive()
  .setAttribute("POSITION", accessor("VEC3", positions)).setAttribute("NORMAL", accessor("VEC3", normals))
  .setAttribute("TEXCOORD_0", accessor("VEC2", mesh.uvs))
  .setAttribute("JOINTS_0", accessor("VEC4", joints)).setAttribute("WEIGHTS_0", accessor("VEC4", shares, true))
  .setIndices(accessor("SCALAR", indices));
const bones = segments.map((name) => document.createNode(name));
const identity = new Float32Array(16 * bones.length);
for (let i = 0; i < bones.length; i++) for (const k of [0, 5, 10, 15]) identity[i * 16 + k] = 1;
const skin = document.createSkin("rat").setInverseBindMatrices(accessor("MAT4", identity));
for (const bone of bones) skin.addJoint(bone);
const node = document.createNode("rat").setMesh(document.createMesh("rat").addPrimitive(primitive)).setSkin(skin);
const scene = document.createScene("rat").addChild(node);
for (const bone of bones) scene.addChild(bone);
document.getRoot().setExtras({
  frame: "The rat's body frame at its reference pose, the game's left-handed coordinates: +Y up, +Z forward, +X the body's right. A glTF viewer shows it mirrored.",
  joints: "One bone a segment of assets/rat/body.json, by name, each at the body frame's origin.",
  source: "Poly Haven, Street Rat, Sean Buckley, CC0 1.0: https://polyhaven.com/a/street_rat",
});

await mkdir(OUT, { recursive: true });
await writeFile(join(OUT, "rat.glb"), await new NodeIO().writeBinary(document));
for (const name of Object.keys(FILES).filter((name) => name.endsWith(".jpg"))) await copyFile((await fetched(name)).path, join(OUT, name));
const dominant = new Map();
for (let v = 0; v < count; v++) dominant.set(segments[joints[v * 4]], (dominant.get(segments[joints[v * 4]]) ?? 0) + 1);
console.log(`rat.glb: ${count} vertices, ${indices.length / 3} triangles (simplified within ${(mesh.error * 100).toFixed(2)}% of the mesh's extent); vertices led by each segment:`, Object.fromEntries(dominant));
