/**
 * Just enough glTF-binary reading for the core's asset measurements: the JSON chunk, and a skinned
 * mesh's positions with the bone that weighs most on each vertex. Node only.
 */
import fs from "node:fs";

/** A GLB's JSON chunk and its binary chunk. */
export function readGlb(file) {
  const buffer = fs.readFileSync(file);
  if (buffer.readUInt32LE(0) !== 0x46546c67) throw new Error(`${file} is not a GLB`);
  const jsonLength = buffer.readUInt32LE(12);
  const json = JSON.parse(buffer.subarray(20, 20 + jsonLength).toString("utf8"));
  const binary = buffer.subarray(20 + jsonLength + 8);
  return { json, binary };
}

const COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
const READERS = {
  5121: [1, (b, o) => b.readUInt8(o)],
  5123: [2, (b, o) => b.readUInt16LE(o)],
  5125: [4, (b, o) => b.readUInt32LE(o)],
  5126: [4, (b, o) => b.readFloatLE(o)],
};

/** An accessor's rows, each an array of its components. */
export function accessorRows({ json, binary }, index) {
  const accessor = json.accessors[index];
  const view = json.bufferViews[accessor.bufferView];
  const width = COMPONENTS[accessor.type];
  const [size, read] = READERS[accessor.componentType];
  const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const stride = view.byteStride ?? width * size;
  const rows = [];
  for (let i = 0; i < accessor.count; i++) {
    const row = [];
    for (let c = 0; c < width; c++) row.push(read(binary, start + i * stride + c * size));
    rows.push(row);
  }
  return rows;
}

/**
 * Every vertex of the named meshes, glTF frame (+x the model's left, +y up, +z its front), with
 * the name of the bone that weighs most on it. A mesh exported twice carries Blender's `.001`.
 */
export function weightedVertices(glb, meshNames) {
  const bones = glb.json.skins[0].joints.map((node) => glb.json.nodes[node].name);
  const out = [];
  for (const mesh of glb.json.meshes) {
    if (!meshNames.includes(mesh.name.replace(/\.001$/, ""))) continue;
    for (const primitive of mesh.primitives) {
      const positions = accessorRows(glb, primitive.attributes.POSITION);
      const joints = accessorRows(glb, primitive.attributes.JOINTS_0);
      const weights = accessorRows(glb, primitive.attributes.WEIGHTS_0);
      positions.forEach((position, i) => {
        let heaviest = 0;
        for (let c = 1; c < weights[i].length; c++) if (weights[i][c] > weights[i][heaviest]) heaviest = c;
        out.push({ position, bone: bones[joints[i][heaviest]] });
      });
    }
  }
  return out;
}
