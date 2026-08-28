import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
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

const RANGER_BONES = Object.freeze([
  "root", "pelvis", "spine_01", "spine_02", "spine_03", "neck_01", "Head",
  "clavicle_l", "upperarm_l", "lowerarm_l", "hand_l",
  "clavicle_r", "upperarm_r", "lowerarm_r", "hand_r",
  "thigh_l", "calf_l", "foot_l", "thigh_r", "calf_r", "foot_r",
  "index_01_l", "middle_01_l", "ring_01_l", "pinky_01_l", "thumb_01_l",
  "index_01_r", "middle_01_r", "ring_01_r", "pinky_01_r", "thumb_01_r",
]);

const RANGER_PROFILE = Object.freeze({
  id: "quaternius-male-ranger",
  asset: "Quaternius Modular Character Outfits - Fantasy [Standard] / Male_Ranger",
  evaluated: "2026-08-27",
  rootBone: "root",
  requiredBones: RANGER_BONES,
  requiredMeshes: [
    "Male_Ranger_Acc_Pauldron", "Male_Ranger_Arms", "Male_Ranger_Arms_Bracer",
    "Male_Ranger_Body", "Male_Ranger_Body_Belt_1", "Male_Ranger_Feet_Boots",
    "Male_Ranger_Head_Hood", "Male_Ranger_Legs",
  ],
  landmarks: {
    pelvis: "pelvis", waist: "spine_01", head: "Head",
    primaryShoulder: "upperarm_l", secondaryShoulder: "upperarm_r",
    positiveHip: "thigh_l", negativeHip: "thigh_r",
    positiveAnkle: "foot_l", negativeAnkle: "foot_r",
  },
  limbs: {
    primaryArm: ["upperarm_l", "lowerarm_l", "hand_l"],
    secondaryArm: ["upperarm_r", "lowerarm_r", "hand_r"],
    leftLeg: ["thigh_l", "calf_l", "foot_l"],
    rightLeg: ["thigh_r", "calf_r", "foot_r"],
  },
  poseKind: "five-digits",
  axisMapping: ["+X", "+Y", "+Z"],
});

const KNIGHT_PROFILE = Object.freeze({
  id: "quaternius-animated-knight",
  asset: "Quaternius Animated Knight Pack / KnightCharacter",
  evaluated: "2026-08-28",
  rootBone: "Bone",
  requiredBones: [
    "Bone", "Body", "Hips", "Abdomen", "Torso", "Neck", "Head",
    "Shoulder.L", "UpperArm.L", "LowerArm.L", "Palm.L", "MiddleHand.L", "Fingers.L", "Thumb.R", "Thumb2.R",
    "Shoulder.R", "UpperArm.R", "LowerArm.R", "Palm.R", "MiddleHand.R", "Fingers.R", "Thumb.L", "Thumb2.L",
    "UpperLeg.L", "LowerLeg.L", "Foot.L", "UpperLeg.R", "LowerLeg.R", "Foot.R",
  ],
  requiredMeshes: ["Knight"],
  landmarks: {
    pelvis: "Hips", waist: "Abdomen", head: "Head",
    primaryShoulder: "UpperArm.L", secondaryShoulder: "UpperArm.R",
    positiveHip: "UpperLeg.L", negativeHip: "UpperLeg.R",
    positiveAnkle: "Foot.L", negativeAnkle: "Foot.R",
  },
  limbs: {
    primaryArm: ["UpperArm.L", "LowerArm.L", "Palm.L"],
    secondaryArm: ["UpperArm.R", "LowerArm.R", "Palm.R"],
    leftLeg: ["UpperLeg.L", "LowerLeg.L", "Foot.L"],
    rightLeg: ["UpperLeg.R", "LowerLeg.R", "Foot.R"],
  },
  poseKind: "grouped-knight",
  axisMapping: ["+X", "+Z", "-Y"],
});

export const HUMANOID_PROFILES = Object.freeze({
  [RANGER_PROFILE.id]: RANGER_PROFILE,
  [KNIGHT_PROFILE.id]: KNIGHT_PROFILE,
});

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
      return { label, authored: true, qualified: true, animation: animation.name, fingerChannels: animated.size };
    }
  }
  return { label, authored: false, qualified: false, animation: null, fingerChannels: 0 };
}

function controlledPoseResult(document, binary, skinJoints, label, animationName, controls) {
  const animation = (document.animations ?? []).find((candidate) => candidate.name === animationName);
  if (!animation) return { label, authored: false, qualified: false, animation: null, fingerChannels: 0, controls };
  const animated = new Set();
  for (const channel of animation.channels ?? []) {
    const nodeIndex = channel.target?.node;
    const name = document.nodes?.[nodeIndex]?.name;
    const sampler = animation.samplers?.[channel.sampler];
    if (!controls.includes(name) || channel.target?.path !== "rotation" || !skinJoints.has(nodeIndex) || !sampler) continue;
    if (rotationAccessorMoves(document, binary, sampler.input, sampler.output)) animated.add(name);
  }
  return {
    label,
    authored: true,
    qualified: controls.every((name) => animated.has(name)),
    animation: animation.name,
    fingerChannels: animated.size,
    controls,
  };
}

function poseResults(document, binary, skinJoints, profile) {
  if (profile.poseKind === "grouped-knight") return [
    controlledPoseResult(document, binary, skinJoints, "sword grip", "Idle_swordLeft",
      ["Fingers.L", "Thumb.R", "Thumb2.R"]),
    controlledPoseResult(document, binary, skinJoints, "shield grip", "Shield_Guard",
      ["Fingers.R", "Thumb.L", "Thumb2.L"]),
  ];
  return [
    poseResult(document, binary, skinJoints, "sword grip", /(?=.*(?:sword|weapon))(?=.*(?:idle|grip|hold))/i, "l"),
    poseResult(document, binary, skinJoints, "shield grip", /(?:shield|block|guard)/i, "r"),
  ];
}

function summarizeFit(landmarks, limbs) {
  const errors = [
    ...landmarks.filter((row) => row.available).map((row) => row.errorMm),
    ...limbs.filter((row) => row.available).flatMap((row) => [row.elbowErrorMm, row.wristErrorMm]),
  ];
  return {
    complete: errors.length === 17,
    expectedChecks: 17,
    checks: errors.length,
    overLimit: errors.filter((value) => value > LANDMARK_LIMIT_MM).length,
    maxErrorMm: errors.length ? Math.max(...errors) : null,
    rmsErrorMm: errors.length
      ? Math.round(Math.sqrt(errors.reduce((sum, value) => sum + value * value, 0) / errors.length) * 1_000) / 1_000
      : null,
  };
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

export function qualifyHumanoidDocument(document, binary, dimensions, integrity = null,
    profile = RANGER_PROFILE, measurement = null) {
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
  const rootIndex = nodeByName.get(profile.rootBone)?.index;
  for (const bone of profile.requiredBones) {
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
  for (const mesh of profile.requiredMeshes) {
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
  const bounds = measurement?.bounds ?? sourceBounds(document);
  const scale = dimensions.fighter.height / bounds.height;
  const positions = measurement?.positions ?? bonePositions(document);
  const pelvis = positions.get(profile.landmarks.pelvis) ?? [0, 0, 0];
  const translation = [-pelvis[0] * scale, -bounds.low * scale, -pelvis[2] * scale];
  const ankle = dimensions.body.shinCentre - dimensions.body.shinLength / 2;
  const landmarks = [
    landmarkResult("pelvis", positions, profile.landmarks.pelvis, [0, dimensions.body.hip, 0], scale, translation),
    landmarkResult("waist", positions, profile.landmarks.waist, dimensions.bones.pelvis.joint, scale, translation),
    landmarkResult("head base", positions, profile.landmarks.head, dimensions.bones.head.joint, scale, translation),
    landmarkResult("primary shoulder", positions, profile.landmarks.primaryShoulder, dimensions.bones.swordUpperArm.joint, scale, translation),
    landmarkResult("secondary shoulder", positions, profile.landmarks.secondaryShoulder, dimensions.bones.offUpperArm.joint, scale, translation),
    landmarkResult("positive-side hip", positions, profile.landmarks.positiveHip, dimensions.bones.thighRight.joint, scale, translation),
    landmarkResult("negative-side hip", positions, profile.landmarks.negativeHip, dimensions.bones.thighLeft.joint, scale, translation),
    landmarkResult("positive-side ankle", positions, profile.landmarks.positiveAnkle, [dimensions.body.hipSide, ankle, 0], scale, translation),
    landmarkResult("negative-side ankle", positions, profile.landmarks.negativeAnkle, [-dimensions.body.hipSide, ankle, 0], scale, translation),
  ];
  for (const landmark of landmarks) {
    if (!landmark.available) failures.push(`${landmark.name} landmark is unavailable`);
    else if (!landmark.qualified) failures.push(`${landmark.name} misses the ${LANDMARK_LIMIT_MM} mm 3D landmark limit: ${landmark.errorMm} mm`);
  }
  const limbs = [
    limbResult("primary arm", positions, profile.limbs.primaryArm,
      [dimensions.arm.upperLength, dimensions.arm.foreLength], scale),
    limbResult("secondary arm", positions, profile.limbs.secondaryArm,
      [dimensions.body.offUpperLength, dimensions.body.offForeLength], scale),
    limbResult("left leg", positions, profile.limbs.leftLeg,
      [dimensions.body.thighLength, dimensions.body.shinLength], scale),
    limbResult("right leg", positions, profile.limbs.rightLeg,
      [dimensions.body.thighLength, dimensions.body.shinLength], scale),
  ];
  for (const limb of limbs) {
    if (!limb.available) failures.push(`${limb.name} landmarks are unavailable`);
    else if (!limb.qualified) failures.push(`${limb.name} misses the ${LANDMARK_LIMIT_MM} mm landmark limit: elbow/knee ${limb.elbowErrorMm} mm, wrist/ankle ${limb.wristErrorMm} mm`);
  }
  const poses = poseResults(document, binary, skinJoints, profile);
  for (const pose of poses) if (!pose.qualified) failures.push(`source contains no qualifying creator-authored ${pose.label} with finger channels`);
  const sourceTechnical = measurement?.sourceTechnical ?? {
    qualified: true,
    authority: "creator-published glTF attributes",
    weightNormalizationRequired: false,
  };
  if (!sourceTechnical.qualified) failures.push(...sourceTechnical.failures);
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
    schema: 2,
    candidateId: profile.id,
    asset: profile.asset,
    evaluated: profile.evaluated,
    contract: "untouched-humanoid-v1",
    status: failures.length === 0 ? "qualified" : "rejected",
    rule: "uniform scale and rigid placement only; no vertex, weight, or proportion edits",
    landmarkLimitMm: LANDMARK_LIMIT_MM,
    sourceHeightM: Math.round(bounds.height * 1_000_000) / 1_000_000,
    uniformScale: Math.round(scale * 1_000_000) / 1_000_000,
    rigidTranslationM: translation.map(roundedMetres),
    axisMapping: profile.axisMapping,
    sideMapping: {
      primary: profile.limbs.primaryArm,
      secondary: profile.limbs.secondaryArm,
    },
    landmarks,
    limbs,
    fit: summarizeFit(landmarks, limbs),
    animationCount: (document.animations ?? []).length,
    poses,
    sourceTechnical,
    severance: {
      status: "deferred-after-admission-failure",
      sourceSkinJoints: skinJoints.size,
      method: "mechanical triangle partition by dominant mapped source-bone region; no vertex-position authoring",
      reason: "A rejected candidate is not installed or cut. Full region coverage is checked only after anatomy and grip admission.",
    },
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

const CANDIDATE_FILES = Object.freeze({
  [RANGER_PROFILE.id]: {
    provenanceId: "quaternius-modular-character-outfits-fantasy-standard-2026",
    sourceRoot: "asset-src/armour/quaternius-ranger",
    creator: "ranger-creator.gltf",
    gltf: "ranger-source.gltf",
    binary: "ranger-source.bin",
  },
  [KNIGHT_PROFILE.id]: {
    provenanceId: "quaternius-animated-knight-2018",
    sourceRoot: "asset-src/armour/quaternius-knight",
    creator: "KnightCharacter.blend",
    gltf: "knight-source.gltf",
    binary: "knight-source.bin",
    metadata: "knight-source-metadata.json",
  },
});

function knightMeasurement(metadata) {
  const toGame = ([x, y, z]) => [x, z, -y];
  return {
    bounds: {
      low: metadata.mesh.boundsWorldMin[2],
      high: metadata.mesh.boundsWorldMax[2],
      height: metadata.mesh.boundsWorldMax[2] - metadata.mesh.boundsWorldMin[2],
    },
    positions: new Map(Object.entries(metadata.bones).map(([name, bone]) => [name, toGame(bone.headWorld)])),
    sourceTechnical: {
      qualified: false,
      authority: metadata.authority,
      blenderVersion: metadata.blenderVersion,
      creatorVertices: metadata.mesh.vertices,
      creatorPolygons: metadata.mesh.polygons,
      maxInfluences: metadata.mesh.maxInfluences,
      verticesOverFourInfluences: metadata.mesh.verticesOverFourInfluences,
      weightsOverOne: metadata.mesh.weightsOverOne,
      weightNormalizationRequired: metadata.mesh.weightsOverOne.length > 0,
      failures: [
        `creator mesh contains ${metadata.mesh.weightsOverOne.length} skin weights over 1; browser-format export normalizes them and cannot preserve literal creator weights`,
      ],
    },
  };
}

export async function qualifyHumanoidCandidate(candidateId, root = ROOT) {
  const profile = HUMANOID_PROFILES[candidateId];
  const files = CANDIDATE_FILES[candidateId];
  if (!profile || !files) throw new Error(`unknown humanoid candidate "${candidateId}"`);
  const sourceRoot = resolve(root, files.sourceRoot);
  const creatorBytes = await readFile(resolve(sourceRoot, files.creator)).catch(() => null);
  const gltfBytes = await readFile(resolve(sourceRoot, files.gltf));
  const binary = await readFile(resolve(sourceRoot, files.binary));
  const document = JSON.parse(gltfBytes);
  const dimensionsBytes = await readFile(resolve(root, "asset-src/dimensions.json"));
  const evaluatorBytes = await readFile(fileURLToPath(import.meta.url));
  const dimensions = JSON.parse(dimensionsBytes);
  const provenance = JSON.parse(await readFile(resolve(root, "asset-src/armour-sources.json"), "utf8"));
  const row = provenance.sources.find((source) => source.id === files.provenanceId);
  const candidate = row?.qualificationCandidates?.find((entry) => entry.id === candidateId);
  const failures = [];
  if (!row) failures.push(`Quaternius provenance row ${files.provenanceId} is missing`);
  if (!candidate) failures.push(`qualification provenance for ${candidateId} is missing`);
  if (!creatorBytes) failures.push(`committed creator member ${files.creator} is missing`);
  if (candidate && creatorBytes && sha256(creatorBytes) !== candidate.sourceMemberSha256) failures.push(`${files.creator} moved from its creator-member pin`);
  if (candidate && sha256(gltfBytes) !== candidate.extracts[files.gltf]) failures.push(`${files.gltf} moved from its qualification pin`);
  if (candidate && sha256(binary) !== candidate.extracts[files.binary]) failures.push(`${files.binary} moved from its qualification pin`);
  let metadata = null;
  let metadataActual = null;
  if (files.metadata) {
    const metadataBytes = await readFile(resolve(sourceRoot, files.metadata));
    metadataActual = sha256(metadataBytes);
    metadata = JSON.parse(metadataBytes);
    if (candidate && metadataActual !== candidate.extracts[files.metadata]) failures.push(`${files.metadata} moved from its qualification pin`);
    if (candidate && metadata.sourceMemberSha256 !== candidate.sourceMemberSha256) failures.push("Knight creator blend member moved from its qualification pin");
  }
  const representation = Object.fromEntries([
    [files.gltf, sha256(gltfBytes)],
    [files.binary, sha256(binary)],
    ...(files.metadata ? [[files.metadata, metadataActual]] : []),
  ]);
  const sourceInputSha256 = sha256(Buffer.from(JSON.stringify({
    creator: creatorBytes ? sha256(creatorBytes) : null,
    representation,
  })));
  const integrity = {
    ok: failures.length === 0,
    sourceId: files.provenanceId,
    sourceMember: candidate?.sourceMember ?? null,
    sourceMemberSha256: candidate?.sourceMemberSha256 ?? null,
    sourceMemberSha256Actual: creatorBytes ? sha256(creatorBytes) : null,
    archiveSha256: row?.archiveSha256 ?? null,
    representation,
    sourceInputSha256,
    rig: { path: "asset-src/dimensions.json", sha256: sha256(dimensionsBytes) },
    evaluator: { path: "scripts/qualify-humanoid.mjs", sha256: sha256(evaluatorBytes) },
    failures,
  };
  return qualifyHumanoidDocument(document, binary, dimensions, integrity, profile,
    metadata ? knightMeasurement(metadata) : null);
}

export async function qualifySelectedHumanoid(root = ROOT) {
  return qualifyHumanoidCandidate(RANGER_PROFILE.id, root);
}

export function reportPathFor(report) {
  const files = CANDIDATE_FILES[report.candidateId];
  if (!files) throw new Error(`unknown humanoid candidate "${report.candidateId}"`);
  const rig = report.integrity.rig.sha256.slice(0, 12);
  const source = report.integrity.sourceInputSha256.slice(0, 12);
  const evaluator = report.integrity.evaluator.sha256.slice(0, 12);
  return [
    `${files.sourceRoot}/qualification`, report.evaluated, report.contract,
    `rig-${rig}`, `source-${source}`, `evaluator-${evaluator}`,
  ].join("-") + ".json";
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const candidateAt = process.argv.indexOf("--candidate");
  const candidateId = candidateAt >= 0 ? process.argv[candidateAt + 1] : RANGER_PROFILE.id;
  const report = await qualifyHumanoidCandidate(candidateId);
  if (process.argv.includes("--write")) {
    const path = resolve(ROOT, reportPathFor(report));
    const bytes = Buffer.from(`${JSON.stringify(report, null, 2)}\n`);
    const existing = await readFile(path).catch((error) => {
      if (error?.code === "ENOENT") return null;
      throw error;
    });
    if (existing && !existing.equals(bytes)) {
      throw new Error(`refusing to overwrite immutable humanoid evaluation ${path}`);
    }
    if (!existing) await writeFile(path, bytes);
  }
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.status === "qualified" ? 0 : 1;
}
