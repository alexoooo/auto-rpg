// The grass lizard scan as published: ffish.asia / floraZia.com's "CC0 Japanese grass lizard" on
// Sketchfab (docs/art/reptile.md). Sketchfab serves it only to a signed-in account, so the zip is
// downloaded by hand ("gltf", Original) to `.cache/art/downloads/grass_lizard/` and checked here
// against its SHA-256.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { inflateRawSync } from "node:zlib";

const ROOT = resolve(import.meta.dirname, "../..");
export const ZIP = join(ROOT, ".cache/art/downloads/grass_lizard/cc0-japanese-grass-lizard.zip");
const SHA256 = "9a046009ff558483642e6234538486f6dd081a2ca8699d0dda0a7fc03b5ac7c2";
/** The scan inside the published zip: its own zip, holding the glTF, its buffer and three photographs. */
const INNER = "source/Q10978-1all_afterInt.zip", GLTF = "Q10978-1all_afterInt.gltf";

/** A zip's files by name, stored or deflated. */
function unzip(bytes) {
  let end = bytes.length - 22;
  while (end >= 0 && bytes.readUInt32LE(end) !== 0x06054b50) end--;
  if (end < 0) throw new Error("not a zip");
  const files = new Map();
  let at = bytes.readUInt32LE(end + 16);
  for (let n = bytes.readUInt16LE(end + 10); n > 0; n--) {
    const method = bytes.readUInt16LE(at + 10), size = bytes.readUInt32LE(at + 20), nameLength = bytes.readUInt16LE(at + 28);
    const extra = bytes.readUInt16LE(at + 30), comment = bytes.readUInt16LE(at + 32), local = bytes.readUInt32LE(at + 42);
    const name = bytes.toString("utf8", at + 46, at + 46 + nameLength);
    const start = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28), data = bytes.subarray(start, start + size);
    if (method !== 0 && method !== 8) throw new Error(`${name}: compression ${method}`);
    files.set(name, method === 0 ? data : inflateRawSync(data));
    at += 46 + nameLength + extra + comment;
  }
  return files;
}

/** The scan's two parts, body and tail: positions (its node's rotation applied, in its own units), texture coordinates, triangles and photograph. */
export function load() {
  if (!existsSync(ZIP)) throw new Error(`${ZIP} is missing: download it by hand (docs/art/reptile.md#source-and-licence)`);
  const zip = readFileSync(ZIP), hash = createHash("sha256").update(zip).digest("hex");
  if (hash !== SHA256) throw new Error(`${ZIP}: SHA-256 ${hash}, pinned ${SHA256}`);
  const scan = unzip(unzip(zip).get(INNER)), g = JSON.parse(scan.get(GLTF).toString("utf8")), bin = scan.get(g.buffers[0].uri);
  const read = (i) => {
    const a = g.accessors[i], v = g.bufferViews[a.bufferView], w = { SCALAR: 1, VEC2: 2, VEC3: 3 }[a.type];
    const T = { 5126: Float32Array, 5123: Uint16Array, 5125: Uint32Array }[a.componentType];
    const s = bin.byteOffset + (v.byteOffset ?? 0) + (a.byteOffset ?? 0);
    return new T(bin.buffer.slice(s, s + a.count * w * T.BYTES_PER_ELEMENT));
  };
  const node = g.nodes.find((n) => n.mesh === 1), [qx, qy, qz, qw] = node.rotation;
  const rot = ([x, y, z]) => {
    const ix = qw * x + qy * z - qz * y, iy = qw * y + qz * x - qx * z, iz = qw * z + qx * y - qy * x, iw = -qx * x - qy * y - qz * z;
    return [ix * qw + iw * -qx + iy * -qz - iz * -qy, iy * qw + iw * -qy + iz * -qx - ix * -qz, iz * qw + iw * -qz + ix * -qy - iy * -qx];
  };
  return g.meshes[1].primitives.map((p, k) => {
    const positions = read(p.attributes.POSITION);
    for (let v = 0; v < positions.length / 3; v++) positions.set(rot([positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]]), v * 3);
    const image = g.images[g.textures[g.materials[p.material].pbrMetallicRoughness.baseColorTexture.index].source].uri;
    return { name: ["body", "tail"][k], positions, uvs: read(p.attributes.TEXCOORD_0), indices: read(p.indices), photograph: scan.get(image) };
  });
}
