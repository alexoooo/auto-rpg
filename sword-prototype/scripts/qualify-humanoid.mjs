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
const roundedMetres = (value) => {
  const rounded = Math.round(value * 1_000_000) / 1_000_000;
  return Object.is(rounded, -0) ? 0 : rounded;
};

function sourceBounds(document) {
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
  return { low, high, height: high - low };
}

function copiedAccessorBytes(document, binary, accessorIndex) {
  const accessor = document.accessors[accessorIndex];
  const view = document.bufferViews[accessor.bufferView];
  if (!accessor || !view) throw new Error(`accessor ${accessorIndex} has no buffer view`);
  if (accessor.sparse) throw new Error(`accessor ${accessorIndex} is sparse`);
  if ((view.buffer ?? 0) !== 0) throw new Error(`accessor ${accessorIndex} is not in the pinned binary`);
  const component = COMPONENT_BYTES[accessor.componentType];
  const width = TYPE_WIDTH[accessor.type];
  if (!component || !width) throw new Error(`accessor ${accessorIndex} has unsupported layout`);
  const elementBytes = component * width;
  const stride = view.byteStride ?? elementBytes;
  const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const relativeEnd = (accessor.byteOffset ?? 0) + Math.max(0, accessor.count - 1) * stride + elementBytes;
  if (stride < elementBytes || start < 0 || relativeEnd > view.byteLength || start + Math.max(0, accessor.count - 1) * stride + elementBytes > binary.length) {
    throw new Error(`accessor ${accessorIndex} exceeds its pinned buffer view`);
  }
  const out = Buffer.alloc(accessor.count * elementBytes);
  for (let index = 0; index < accessor.count; index += 1) {
    binary.copy(out, index * elementBytes, start + index * stride, start + index * stride + elementBytes);
  }
  return out;
}

export function attributeDigests(document, binary) {
  const semantics = [...new Set(document.meshes.flatMap((mesh) => mesh.primitives.flatMap((primitive) =>
    [...Object.keys(primitive.attributes), ...(primitive.indices === undefined ? [] : ["INDICES"])])))].sort();
  return Object.fromEntries(semantics.map((semantic) => {
    const hash = createHash("sha256");
    let count = 0;
    document.meshes.forEach((mesh, meshIndex) => mesh.primitives.forEach((primitive, primitiveIndex) => {
      const accessorIndex = semantic === "INDICES" ? primitive.indices : primitive.attributes[semantic];
      if (accessorIndex === undefined) return;
      const accessor = document.accessors[accessorIndex];
      hash.update(`${meshIndex}:${primitiveIndex}:${accessor.componentType}:${accessor.type}:${accessor.count}\n`);
      hash.update(copiedAccessorBytes(document, binary, accessorIndex));
      count += accessor.count;
    }));
    return [semantic, { count, sha256: hash.digest("hex") }];
  }));
}

export function structureDigests(document) {
  const canonical = (value) => {
    if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
    if (value && typeof value === "object") return `{${Object.keys(value).filter((key) => value[key] !== undefined)
      .sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
    return JSON.stringify(value);
  };
  const skeleton = {
    nodes: document.nodes.map(({ name, matrix, rotation, scale, translation, children, mesh, skin }) =>
      ({ name, matrix, rotation, scale, translation, children, mesh, skin })),
    skins: document.skins,
    animations: document.animations,
  };
  const materials = {
    materials: document.materials,
    textures: document.textures,
    images: document.images,
    samplers: document.samplers,
    meshes: document.meshes.map((mesh) => ({ name: mesh.name,
      primitives: mesh.primitives.map(({ attributes, indices, material, mode }) =>
        ({ attributes, indices, material, mode })) })),
  };
  return {
    SKELETON: createHash("sha256").update(canonical(skeleton)).digest("hex"),
    MATERIALS: createHash("sha256").update(canonical(materials)).digest("hex"),
  };
}

function placed(point, scale, translation) {
  return point.map((value, axis) => value * scale + translation[axis]);
}

function landmarkResult(name, positions, sourceBone, target, scale, translation) {
  const source = positions.get(sourceBone);
  if (!source) return { name, sourceBone, available: false, targetM: target };
  const at = placed(source, scale, translation);
  const errorMm = mm(distance(at, target));
  return {
    name,
    sourceBone,
    available: true,
    placedM: at.map(roundedMetres),
    targetM: target.map(roundedMetres),
    errorMm,
    qualified: errorMm <= LANDMARK_LIMIT_MM,
  };
}

function rotationAccessorMoves(document, binary, inputIndex, outputIndex) {
  const input = document.accessors?.[inputIndex];
  const output = document.accessors?.[outputIndex];
  if (!input || !output || input.type !== "SCALAR" || output.type !== "VEC4"
      || input.componentType !== 5126 || output.componentType !== 5126
      || input.count < 1 || output.count !== input.count) return false;
  try {
    const times = copiedAccessorBytes(document, binary, inputIndex);
    let previous = -Infinity;
    for (let at = 0; at < input.count; at += 1) {
      const time = times.readFloatLE(at * 4);
      if (!Number.isFinite(time) || time <= previous) return false;
      previous = time;
    }
    const values = copiedAccessorBytes(document, binary, outputIndex);
    let moves = false;
    for (let at = 0; at < output.count; at += 1) {
      const x = values.readFloatLE(at * 16);
      const y = values.readFloatLE(at * 16 + 4);
      const z = values.readFloatLE(at * 16 + 8);
      const w = values.readFloatLE(at * 16 + 12);
      if (![x, y, z, w].every(Number.isFinite)) return false;
      const norm = Math.hypot(x, y, z, w);
      if (Math.abs(norm - 1) > 0.001) return false;
      moves ||= Math.abs(w) < Math.cos(0.05);
    }
    return moves;
  } catch {
    return false;
  }
}

function poseResult(document, binary, skinJoints, label, namePattern, side) {
  const fingerPattern = new RegExp(`^(index|middle|ring|pinky|thumb)_0[1-3]_${side}$`);
  for (const animation of document.animations ?? []) {
    if (!namePattern.test(animation.name ?? "")) continue;
    const animated = new Set();
    for (const channel of animation.channels ?? []) {
      const nodeIndex = channel.target?.node;
      const match = fingerPattern.exec(document.nodes?.[nodeIndex]?.name ?? "");
      const sampler = animation.samplers?.[channel.sampler];
      if (!match || channel.target?.path !== "rotation" || !skinJoints.has(nodeIndex) || !sampler) continue;
      if (rotationAccessorMoves(document, binary, sampler.input, sampler.output)) animated.add(match[1]);
    }
    if (["index", "middle", "ring", "pinky", "thumb"].every((digit) => animated.has(digit))) {
      return { label, qualified: true, animation: animation.name, fingerChannels: animated.size };
    }
  }
  return { label, qualified: false, animation: null, fingerChannels: 0 };
}

function primitiveFailure(document, binary, primitive) {
  const required = {
    POSITION: [5126, "VEC3"],
    NORMAL: [5126, "VEC3"],
    TEXCOORD_0: [5126, "VEC2"],
    JOINTS_0: [[5121, 5123], "VEC4"],
    WEIGHTS_0: [5126, "VEC4"],
  };
  let count = null;
  for (const [semantic, [components, type]] of Object.entries(required)) {
    const accessorIndex = primitive.attributes?.[semantic];
    const accessor = document.accessors?.[accessorIndex];
    const permitted = Array.isArray(components) ? components : [components];
    if (!Number.isInteger(accessorIndex) || !accessor || !permitted.includes(accessor.componentType) || accessor.type !== type || accessor.count < 1) {
      return `missing or invalid ${semantic}`;
    }
    if (count === null) count = accessor.count;
    else if (accessor.count !== count) return `${semantic} vertex count disagrees with POSITION`;
    try { copiedAccessorBytes(document, binary, accessorIndex); } catch { return `${semantic} exceeds its buffer view`; }
  }
  const indexAccessor = document.accessors?.[primitive.indices];
  if (!Number.isInteger(primitive.indices) || !indexAccessor || indexAccessor.type !== "SCALAR"
      || ![5121, 5123, 5125].includes(indexAccessor.componentType) || indexAccessor.count < 3) return "missing or invalid triangle indices";
  try { copiedAccessorBytes(document, binary, primitive.indices); } catch { return "triangle indices exceed their buffer view"; }
  if (!Number.isInteger(primitive.material) || !document.materials?.[primitive.material]) return "missing or invalid creator material";
  return null;
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
  const nodes = document.nodes ?? [];
  const parents = Array(nodes.length).fill(-1);
  nodes.forEach((node, parent) => (node.children ?? []).forEach((child) => { parents[child] = parent; }));
  const nodeByName = new Map(nodes.map((node, index) => [node.name, { node, index }]));
  const skin = document.skins?.length === 1 ? document.skins[0] : null;
  const skinJoints = new Set(skin?.joints ?? []);
  const scene = document.scenes?.[document.scene ?? 0];
  const reachable = new Set();
  const visit = (index) => {
    if (!Number.isInteger(index) || index < 0 || index >= nodes.length || reachable.has(index)) return;
    reachable.add(index);
    for (const child of nodes[index].children ?? []) visit(child);
  };
  for (const root of scene?.nodes ?? []) visit(root);
  if (!scene) failures.push("source has no active creator scene");
  if (!skin) failures.push(`source requires exactly one creator skin; found ${document.skins?.length ?? 0}`);
  else if (skin.inverseBindMatrices === undefined) failures.push("creator skin has no inverse-bind matrices");
  const rootIndex = nodeByName.get("root")?.index;
  for (const bone of REQUIRED_BONES) {
    const occurrences = nodes.filter((node) => node.name === bone).length;
    if (occurrences > 1) failures.push(`creator bone ${bone} occurs ${occurrences} times`);
    const found = nodeByName.get(bone);
    if (!found) failures.push(`missing creator bone ${bone}`);
    else {
      if (!reachable.has(found.index)) failures.push(`creator bone ${bone} is unreachable from the active scene`);
      if (!skinJoints.has(found.index)) failures.push(`creator bone ${bone} is not a joint in the character skin`);
      let at = found.index;
      while (at >= 0 && at !== rootIndex) at = parents[at];
      if (rootIndex !== undefined && at !== rootIndex) failures.push(`creator bone ${bone} is disconnected from the humanoid root`);
    }
  }
  for (const mesh of REQUIRED_MESHES) {
    const occurrences = nodes.filter((node) => node.name === mesh).length;
    if (occurrences > 1) failures.push(`creator mesh ${mesh} occurs ${occurrences} times`);
    const found = nodeByName.get(mesh);
    if (!found || found.node.mesh === undefined) failures.push(`missing instantiated creator mesh ${mesh}`);
    else {
      if (!reachable.has(found.index)) failures.push(`creator mesh ${mesh} is unreachable from the active scene`);
      if (found.node.skin !== 0) failures.push(`creator mesh ${mesh} is not attached to the character skin`);
      const meshRecord = document.meshes?.[found.node.mesh];
      if (!meshRecord || !Array.isArray(meshRecord.primitives) || meshRecord.primitives.length === 0) {
        failures.push(`creator mesh ${mesh} has no valid mesh record`);
      } else {
        for (const primitive of meshRecord.primitives) {
          const invalid = primitiveFailure(document, binary, primitive);
          if (invalid) failures.push(`creator mesh ${mesh} has a non-renderable primitive: ${invalid}`);
        }
      }
    }
  }
  const bounds = sourceBounds(document);
  const scale = dimensions.fighter.height / bounds.height;
  const positions = bonePositions(document);
  const pelvis = positions.get("pelvis") ?? [0, 0, 0];
  const translation = [-pelvis[0] * scale, -bounds.low * scale, -pelvis[2] * scale];
  const ankle = dimensions.body.shinCentre - dimensions.body.shinLength / 2;
  const landmarks = [
    landmarkResult("pelvis", positions, "pelvis", [0, dimensions.body.hip, 0], scale, translation),
    landmarkResult("waist", positions, "spine_01", dimensions.bones.pelvis.joint, scale, translation),
    landmarkResult("head base", positions, "Head", dimensions.bones.head.joint, scale, translation),
    landmarkResult("primary shoulder", positions, "upperarm_l", dimensions.bones.swordUpperArm.joint, scale, translation),
    landmarkResult("secondary shoulder", positions, "upperarm_r", dimensions.bones.offUpperArm.joint, scale, translation),
    landmarkResult("positive-side hip", positions, "thigh_l", dimensions.bones.thighRight.joint, scale, translation),
    landmarkResult("negative-side hip", positions, "thigh_r", dimensions.bones.thighLeft.joint, scale, translation),
    landmarkResult("positive-side ankle", positions, "foot_l", [dimensions.body.hipSide, ankle, 0], scale, translation),
    landmarkResult("negative-side ankle", positions, "foot_r", [-dimensions.body.hipSide, ankle, 0], scale, translation),
  ];
  for (const landmark of landmarks) {
    if (!landmark.available) failures.push(`${landmark.name} landmark is unavailable`);
    else if (!landmark.qualified) failures.push(`${landmark.name} misses the ${LANDMARK_LIMIT_MM} mm 3D landmark limit: ${landmark.errorMm} mm`);
  }
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
  const poses = [
    poseResult(document, binary, skinJoints, "sword grip", /(?=.*(?:sword|weapon))(?=.*(?:idle|grip|hold))/i, "l"),
    poseResult(document, binary, skinJoints, "shield grip", /(?:shield|block|guard)/i, "r"),
  ];
  for (const pose of poses) if (!pose.qualified) failures.push(`source contains no creator-authored ${pose.label} with finger channels`);
  if (integrity && !integrity.ok) failures.push(...integrity.failures);
  let protectedAttributes = {};
  let protectedStructure = {};
  try { protectedAttributes = attributeDigests(document, binary); } catch (error) {
    failures.push(`source attribute streams cannot be read: ${error instanceof Error ? error.message : String(error)}`);
  }
  try { protectedStructure = structureDigests(document); } catch (error) {
    failures.push(`source structure cannot be hashed: ${error instanceof Error ? error.message : String(error)}`);
  }
  return {
    schema: 1,
    asset: "Quaternius Modular Character Outfits - Fantasy [Standard] / Male_Ranger",
    status: failures.length === 0 ? "qualified" : "rejected",
    rule: "uniform scale and rigid placement only; no vertex, weight, or proportion edits",
    landmarkLimitMm: LANDMARK_LIMIT_MM,
    sourceHeightM: Math.round(bounds.height * 1_000_000) / 1_000_000,
    uniformScale: Math.round(scale * 1_000_000) / 1_000_000,
    rigidTranslationM: translation.map(roundedMetres),
    landmarks,
    limbs,
    animationCount: (document.animations ?? []).length,
    poses,
    attributeDigests: protectedAttributes,
    structureDigests: protectedStructure,
    integrity,
    failures,
    decision: failures.length === 0
      ? "The asset may proceed to runtime integration without authoring changes."
      : "Do not install, stretch, retarget, or silently substitute this asset. Keep the current shipping Warrior until the user authorizes a physics-rig change or chooses another qualified asset family.",
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
