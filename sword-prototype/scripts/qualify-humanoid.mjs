import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

export const LANDMARK_LIMIT_MM = 25;

const COMPONENT_BYTES = Object.freeze({
  5120: 1,
  5121: 1,
  5122: 2,
  5123: 2,
  5125: 4,
  5126: 4,
});

const TYPE_WIDTH = Object.freeze({
  SCALAR: 1,
  VEC2: 2,
  VEC3: 3,
  VEC4: 4,
  MAT2: 4,
  MAT3: 9,
  MAT4: 16,
});

const REQUIRED_MESHES = Object.freeze([
  "Male_Ranger_Acc_Pauldron",
  "Male_Ranger_Arms",
  "Male_Ranger_Arms_Bracer",
  "Male_Ranger_Body",
  "Male_Ranger_Body_Belt_1",
  "Male_Ranger_Feet_Boots",
  "Male_Ranger_Head_Hood",
  "Male_Ranger_Legs",
]);

const REQUIRED_BONES = Object.freeze([
  "root", "pelvis", "spine_01", "spine_02", "spine_03", "neck_01", "Head",
  "clavicle_l", "upperarm_l", "lowerarm_l", "hand_l",
  "clavicle_r", "upperarm_r", "lowerarm_r", "hand_r",
  "thigh_l", "calf_l", "foot_l", "thigh_r", "calf_r", "foot_r",
  "index_01_l", "middle_01_l", "ring_01_l", "pinky_01_l", "thumb_01_l",
  "index_01_r", "middle_01_r", "ring_01_r", "pinky_01_r", "thumb_01_r",
]);

const identity = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function multiply(a, b) {
  const out = Array(16).fill(0);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      for (let at = 0; at < 4; at += 1) out[column * 4 + row] += a[at * 4 + row] * b[column * 4 + at];
    }
  }
  return out;
}

function localMatrix(node) {
  if (node.matrix) return [...node.matrix];
  const [x, y, z, w] = node.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = node.scale ?? [1, 1, 1];
  const [tx, ty, tz] = node.translation ?? [0, 0, 0];
  const xx = x * x;
  const yy = y * y;
  const zz = z * z;
  const xy = x * y;
  const xz = x * z;
  const yz = y * z;
  const wx = w * x;
  const wy = w * y;
  const wz = w * z;
  return [
    (1 - 2 * (yy + zz)) * sx, 2 * (xy + wz) * sx, 2 * (xz - wy) * sx, 0,
    2 * (xy - wz) * sy, (1 - 2 * (xx + zz)) * sy, 2 * (yz + wx) * sy, 0,
    2 * (xz + wy) * sz, 2 * (yz - wx) * sz, (1 - 2 * (xx + yy)) * sz, 0,
    tx, ty, tz, 1,
  ];
}

function bonePositions(document) {
  const parents = Array(document.nodes.length).fill(-1);
  document.nodes.forEach((node, parent) => {
    for (const child of node.children ?? []) parents[child] = parent;
  });
  const cache = [];
  const world = (index) => {
    if (cache[index]) return cache[index];
    const local = localMatrix(document.nodes[index]);
    cache[index] = parents[index] < 0 ? local : multiply(world(parents[index]), local);
    return cache[index];
  };
  return new Map(document.nodes.map((node, index) => {
    const matrix = world(index);
    return [node.name, [matrix[12], matrix[13], matrix[14]]];
  }).filter(([name]) => typeof name === "string"));
}

const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const mm = (metres) => Math.round(metres * 1_000_000) / 1_000;

function sourceHeight(document) {
  let low = Infinity;
  let high = -Infinity;
  for (const mesh of document.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      const accessor = document.accessors?.[primitive.attributes?.POSITION];
      if (!accessor?.min || !accessor?.max) continue;
      low = Math.min(low, accessor.min[1]);
      high = Math.max(high, accessor.max[1]);
    }
  }
  return high - low;
}

function copiedAccessorBytes(document, binary, accessorIndex) {
  const accessor = document.accessors[accessorIndex];
  const view = document.bufferViews[accessor.bufferView];
  if (accessor.sparse) throw new Error(`accessor ${accessorIndex} is sparse`);
  const component = COMPONENT_BYTES[accessor.componentType];
  const width = TYPE_WIDTH[accessor.type];
  if (!component || !width) throw new Error(`accessor ${accessorIndex} has unsupported layout`);
  const elementBytes = component * width;
  const stride = view.byteStride ?? elementBytes;
  const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const out = Buffer.alloc(accessor.count * elementBytes);
  for (let index = 0; index < accessor.count; index += 1) {
    binary.copy(out, index * elementBytes, start + index * stride, start + index * stride + elementBytes);
  }
  return out;
}

export function attributeDigests(document, binary) {
  const semantics = ["POSITION", "NORMAL", "TEXCOORD_0", "JOINTS_0", "WEIGHTS_0"];
  return Object.fromEntries(semantics.map((semantic) => {
    const hash = createHash("sha256");
    let count = 0;
    document.meshes.forEach((mesh, meshIndex) => mesh.primitives.forEach((primitive, primitiveIndex) => {
      const accessorIndex = primitive.attributes[semantic];
      if (accessorIndex === undefined) return;
      const accessor = document.accessors[accessorIndex];
      hash.update(`${meshIndex}:${primitiveIndex}:${accessor.componentType}:${accessor.type}:${accessor.count}\n`);
      hash.update(copiedAccessorBytes(document, binary, accessorIndex));
      count += accessor.count;
    }));
    return [semantic, { count, sha256: hash.digest("hex") }];
  }));
}

function limbResult(name, positions, sourceBones, targetLengths, scale) {
  const points = sourceBones.map((bone) => positions.get(bone));
  if (points.some((point) => !point)) return { name, available: false };
  const sourceLengths = [distance(points[0], points[1]) * scale, distance(points[1], points[2]) * scale];
  const elbowErrorMm = mm(Math.abs(sourceLengths[0] - targetLengths[0]));
  const wristErrorMm = mm(Math.abs(sourceLengths[0] + sourceLengths[1] - targetLengths[0] - targetLengths[1]));
  return {
    name,
    available: true,
    sourceLengthsM: sourceLengths.map((value) => Math.round(value * 1_000_000) / 1_000_000),
    targetLengthsM: targetLengths,
    elbowErrorMm,
    wristErrorMm,
    qualified: elbowErrorMm <= LANDMARK_LIMIT_MM && wristErrorMm <= LANDMARK_LIMIT_MM,
  };
}

export function qualifyHumanoidDocument(document, binary, dimensions, integrity = null) {
  const failures = [];
  const names = new Set((document.nodes ?? []).map((node) => node.name));
  const meshes = new Set((document.meshes ?? []).map((mesh) => mesh.name));
  for (const bone of REQUIRED_BONES) if (!names.has(bone)) failures.push(`missing creator bone ${bone}`);
  for (const mesh of REQUIRED_MESHES) if (![...meshes].some((name) => name === mesh || name.startsWith(`${mesh}.`))) {
    failures.push(`missing creator mesh ${mesh}`);
  }
  const height = sourceHeight(document);
  const scale = dimensions.fighter.height / height;
  const positions = bonePositions(document);
  const limbs = [
    limbResult("primary arm", positions, ["upperarm_r", "lowerarm_r", "hand_r"],
      [dimensions.arm.upperLength, dimensions.arm.foreLength], scale),
    limbResult("secondary arm", positions, ["upperarm_l", "lowerarm_l", "hand_l"],
      [dimensions.body.offUpperLength, dimensions.body.offForeLength], scale),
    limbResult("left leg", positions, ["thigh_l", "calf_l", "foot_l"],
      [dimensions.body.thighLength, dimensions.body.shinLength], scale),
    limbResult("right leg", positions, ["thigh_r", "calf_r", "foot_r"],
      [dimensions.body.thighLength, dimensions.body.shinLength], scale),
  ];
  for (const limb of limbs) {
    if (!limb.available) failures.push(`${limb.name} landmarks are unavailable`);
    else if (!limb.qualified) failures.push(`${limb.name} misses the ${LANDMARK_LIMIT_MM} mm landmark limit: elbow/knee ${limb.elbowErrorMm} mm, wrist/ankle ${limb.wristErrorMm} mm`);
  }
  if ((document.animations ?? []).length === 0) {
    failures.push("source contains no creator-authored sword or shield hand pose");
  }
  if (integrity && !integrity.ok) failures.push(...integrity.failures);
  return {
    schema: 1,
    asset: "Quaternius Modular Character Outfits - Fantasy [Standard] / Male_Ranger",
    status: failures.length === 0 ? "qualified" : "rejected",
    rule: "uniform scale and rigid placement only; no vertex, weight, or proportion edits",
    landmarkLimitMm: LANDMARK_LIMIT_MM,
    sourceHeightM: Math.round(height * 1_000_000) / 1_000_000,
    uniformScale: Math.round(scale * 1_000_000) / 1_000_000,
    limbs,
    animationCount: (document.animations ?? []).length,
    attributeDigests: attributeDigests(document, binary),
    integrity,
    failures,
  };
}

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

export async function qualifySelectedHumanoid(root = ROOT) {
  const sourceRoot = resolve(root, "asset-src/armour/quaternius-ranger");
  const gltfBytes = await readFile(resolve(sourceRoot, "ranger-source.gltf"));
  const binary = await readFile(resolve(sourceRoot, "ranger-source.bin"));
  const document = JSON.parse(gltfBytes);
  const dimensions = JSON.parse(await readFile(resolve(root, "asset-src/dimensions.json"), "utf8"));
  const provenance = JSON.parse(await readFile(resolve(root, "asset-src/armour-sources.json"), "utf8"));
  const row = provenance.sources.find((source) => source.id === "quaternius-modular-character-outfits-fantasy-standard-2026");
  const failures = [];
  if (!row) failures.push("selected Quaternius provenance row is missing");
  if (row && sha256(gltfBytes) !== row.extracts["ranger-source.gltf"]) failures.push("ranger-source.gltf moved from its provenance pin");
  if (row && sha256(binary) !== row.extracts["ranger-source.bin"]) failures.push("ranger-source.bin moved from its provenance pin");
  const integrity = { ok: failures.length === 0, failures };
  return qualifyHumanoidDocument(document, binary, dimensions, integrity);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = await qualifySelectedHumanoid();
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.status === "qualified" ? 0 : 1;
}
