// The reptile's art from the grass lizard scan (ffish.asia / floraZia.com, CC0): `node scripts/reptile/build-assets.mjs`.
//
// Poses the scan (`pose.mjs`), decimates it and bakes its look in Blender (`retopo.py`), and writes
// `assets/art/environment/reptile/reptile.glb`, the mesh skinned to the reptile's segments, and its
// two 1k maps beside it. What the file holds and how it rides the body: docs/art/reptile.md.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import sharp from "sharp";
import { Document, NodeIO } from "@gltf-transform/core";
import { run, tool } from "../art/tools.mjs";
import { bake, fit, HEAD_RAISE, parts, toPiece } from "./pose.mjs";

const ROOT = resolve(import.meta.dirname, "../.."), WORK = join(ROOT, ".cache/art/build/reptile"), OUT = join(ROOT, "assets/art/environment/reptile");
/** The triangles the drawn reptile keeps of the scan's 384,000. */
const TRIANGLES = 20000;
/** The maps baked at this size, then written at `MAP`. */
const BAKE = 2048, MAP = 1024;
mkdirSync(WORK, { recursive: true });
mkdirSync(OUT, { recursive: true });

// The posed scan at full resolution, right-handed for Blender (x the lizard's left), each part with its photograph.
{
  const document = new Document(), buffer = document.createBuffer();
  const accessor = (type, array) => document.createAccessor().setType(type).setArray(array).setBuffer(buffer);
  const scene = document.createScene("hires");
  for (const part of parts) {
    const positions = bake(part);
    for (let v = 0; v < positions.length / 3; v++) positions[v * 3] = -positions[v * 3];
    const image = document.createTexture(part.name).setImage(part.photograph).setMimeType("image/jpeg").setURI(`${part.name}.jpg`);
    const material = document.createMaterial(part.name).setBaseColorTexture(image).setMetallicFactor(0).setRoughnessFactor(1);
    const primitive = document.createPrimitive().setAttribute("POSITION", accessor("VEC3", positions)).setAttribute("TEXCOORD_0", accessor("VEC2", part.uvs))
      .setIndices(accessor("SCALAR", Uint32Array.from(part.indices))).setMaterial(material);
    scene.addChild(document.createNode(part.name).setMesh(document.createMesh(part.name).addPrimitive(primitive)));
  }
  writeFileSync(join(WORK, "hires.glb"), await new NodeIO().writeBinary(document));
}

await run(await tool("blender"), ["-b", "--disable-autoexec", "-P", join(ROOT, "scripts/reptile/retopo.py"), "--", join(WORK, "hires.glb"), WORK, String(TRIANGLES), String(BAKE)]);

const primitive = (await new NodeIO().read(join(WORK, "low.glb"))).getRoot().listMeshes()[0].listPrimitives()[0];
const low = { positions: primitive.getAttribute("POSITION").getArray(), normals: primitive.getAttribute("NORMAL").getArray(), uvs: primitive.getAttribute("TEXCOORD_0").getArray(), indices: primitive.getIndices().getArray() };
const count = low.positions.length / 3;
// Mirrored into the game's left-handed frame, x the body's right, each winding reversed with it.
const positions = new Float32Array(count * 3), normals = new Float32Array(count * 3);
for (let v = 0; v < count; v++) {
  positions.set([-low.positions[v * 3], low.positions[v * 3 + 1], low.positions[v * 3 + 2]], v * 3);
  normals.set([-low.normals[v * 3], low.normals[v * 3 + 1], low.normals[v * 3 + 2]], v * 3);
}
const indices = new Uint16Array(low.indices.length);
for (let t = 0; t < low.indices.length; t += 3) { indices[t] = low.indices[t]; indices[t + 1] = low.indices[t + 2]; indices[t + 2] = low.indices[t + 1]; }

// Up to four segments a vertex, in 255ths: its cost for a segment is its distance from the nearest
// of the segment's pieces less their thickness (the centreline's span for head, trunk and tail, the
// leg's pieces for a leg), its weights falling off by `fit.blend` behind its cheapest segment's. The
// jaw takes, out of the head's share, what lies below the mouth's line and ahead of the hinge.
const segments = JSON.parse(readFileSync(join(ROOT, "assets/reptile/body.json"), "utf8")).segments.map((s) => s.name);
const sigmoid = (x) => 1 / (1 + Math.exp(-x));
const joints = new Uint8Array(count * 4), shares = new Uint8Array(count * 4);
for (let v = 0; v < count; v++) {
  const p = [positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]], costs = new Map();
  for (let i = 0; i < fit.centre.length - 1; i++) {
    const a = fit.centre[i], b = fit.centre[i + 1], name = fit.spans.find(([, s0, s1]) => a.s >= s0 && a.s < s1)?.[0] ?? "tail.tip";
    const cost = toPiece(p, a.p, b.p) - (a.r + b.r) / 2;
    if (!(costs.get(name) <= cost)) costs.set(name, cost);
  }
  for (const [name, pieces] of Object.entries(fit.legPieces)) costs.set(name, Math.min(...pieces.map(([a, b, r]) => toPiece(p, a, b) - r)));
  const sorted = [...costs.entries()].sort((a, b) => a[1] - b[1]);
  let near = sorted.slice(0, 4).map(([name, cost]) => [name, Math.exp(-(cost - sorted[0][1]) / fit.blend)]);
  const jaw = sigmoid((fit.mouthY - p[1]) / 0.002) * sigmoid((p[2] - fit.hinge[2]) / 0.004), head = near.findIndex(([name]) => name === "head");
  if (head >= 0 && jaw > 0.01) {
    const w = near[head][1];
    near[head][1] = w * (1 - jaw); near.push(["jaw", w * jaw]);
    near = near.sort((a, b) => b[1] - a[1]).slice(0, 4);
  }
  const total = near.reduce((s, [, w]) => s + w, 0);
  let given = 0;
  near.forEach(([name, w], i) => {
    const share = i === 0 ? 0 : Math.round(255 * w / total);
    joints[v * 4 + i] = segments.indexOf(name); shares[v * 4 + i] = share; given += share;
  });
  shares[v * 4] = 255 - given;
}

// Posed as the body carries its head (`HEAD_RAISE`): each vertex turned up about the neck by its
// head and jaw weight, as the skin would turn it, so the reference pose is the body's.
const turnUp = ([x, y, z], [, py, pz], a) => { const dy = y - py, dz = z - pz, c = Math.cos(a), s = Math.sin(a); return [x, py + dy * c + dz * s, pz + dz * c - dy * s]; };
for (let v = 0; v < count; v++) {
  let w = 0;
  for (let k = 0; k < 4; k++) if (["head", "jaw"].includes(segments[joints[v * 4 + k]])) w += shares[v * 4 + k] / 255;
  if (!w) continue;
  const p = [positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]], q = turnUp(p, fit.neck, HEAD_RAISE);
  for (let i = 0; i < 3; i++) positions[v * 3 + i] = p[i] + w * (q[i] - p[i]);
  const n = [normals[v * 3], normals[v * 3 + 1], normals[v * 3 + 2]], m = turnUp(n, [0, 0, 0], HEAD_RAISE);
  const blended = n.map((x, i) => x + w * (m[i] - x)), size = Math.hypot(...blended);
  normals.set(blended.map((x) => x / size), v * 3);
}

const document = new Document(), buffer = document.createBuffer();
const accessor = (type, array, normalized = false) => document.createAccessor().setType(type).setArray(array).setNormalized(normalized).setBuffer(buffer);
const skinned = document.createPrimitive().setAttribute("POSITION", accessor("VEC3", positions)).setAttribute("NORMAL", accessor("VEC3", normals))
  .setAttribute("TEXCOORD_0", accessor("VEC2", Float32Array.from(low.uvs))).setAttribute("JOINTS_0", accessor("VEC4", joints)).setAttribute("WEIGHTS_0", accessor("VEC4", shares, true))
  .setIndices(accessor("SCALAR", indices));
const bones = segments.map((name) => document.createNode(name)), identity = new Float32Array(16 * segments.length);
for (let i = 0; i < segments.length; i++) for (const k of [0, 5, 10, 15]) identity[i * 16 + k] = 1;
const skin = document.createSkin("reptile").setInverseBindMatrices(accessor("MAT4", identity));
for (const bone of bones) skin.addJoint(bone);
const scene = document.createScene("reptile").addChild(document.createNode("reptile").setMesh(document.createMesh("reptile").addPrimitive(skinned)).setSkin(skin));
for (const bone of bones) scene.addChild(bone);
document.getRoot().setExtras({
  frame: "The reptile's body frame at its reference pose, the game's left-handed coordinates: +Y up, +Z forward, +X the body's right. A glTF viewer shows it mirrored.",
  joints: "One bone a segment of assets/reptile/body.json, by name, each at the body frame's origin.",
  source: "ffish.asia / floraZia.com, CC0 Japanese grass lizard, CC0 1.0: https://sketchfab.com/3d-models/cc0-japanese-grass-lizard-8ec4811184f34fc5b6699eca34008f68",
});
writeFileSync(join(OUT, "reptile.glb"), await new NodeIO().writeBinary(document));
await sharp(join(WORK, "colour.png")).resize(MAP, MAP, { kernel: "lanczos3" }).jpeg({ quality: 90 }).toFile(join(OUT, "grass_lizard_diff_1k.jpg"));
await sharp(join(WORK, "normal.png")).resize(MAP, MAP, { kernel: "lanczos3" }).jpeg({ quality: 95 }).toFile(join(OUT, "grass_lizard_nor_gl_1k.jpg"));
const dominant = new Map();
for (let v = 0; v < count; v++) dominant.set(segments[joints[v * 4]], (dominant.get(segments[joints[v * 4]]) ?? 0) + 1);
console.log(`reptile.glb: ${count} vertices, ${indices.length / 3} triangles; vertices led by each segment:`, Object.fromEntries(dominant));
