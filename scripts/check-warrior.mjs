// Validate the authored Warrior as the thing the player sees: one continuous,
// skinned person in the physics rig's bind pose.
//
//     node scripts/check-warrior.mjs
//
// Blender's exporter already owns container validity. This checker owns the
// project-specific failures which glTF validation cannot name: the wrong bone
// hierarchy, rigid costume fragments, weights which do not deform, missing
// garments, toy-sized hands, and hands which do not reach their weapon grips.

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

const GLB_MAGIC = 0x46546c67;
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;
const REJECTED_RIGID_ASSET = "c08f09fa564b6b84b24a2b25442f3c51fd167d20f0c8d4f777e5bd25943c1afd";
const FORBIDDEN = /\b(?:sword|shield|blade|hilt|pommel|scabbard|buckler|crossguard)\b/i;

export const SKIN_BONE_PARENT = Object.freeze({
  torso: null,
  head: "torso",
  pelvis: "torso",
  swordUpperArm: "torso",
  swordForearm: "swordUpperArm",
  swordHand: "swordForearm",
  offUpperArm: "torso",
  offForearm: "offUpperArm",
  offHand: "offForearm",
  thighLeft: "pelvis",
  shinLeft: "thighLeft",
  thighRight: "pelvis",
  shinRight: "thighRight",
});

const SKIN_BONES = Object.freeze(Object.keys(SKIN_BONE_PARENT));
const GARMENTS = Object.freeze([
  ["trousers", (name) => /trouser|pants/i.test(name) || (/legs/i.test(name) && /region_pelvis/i.test(name))],
  ["left and right boots", (name) => /boot|shoe/i.test(name)],
  ["hood", (name) => /hood/i.test(name)],
  ["closed Helmet3", (name) => /helmet3|closed[_ -]?helmet/i.test(name)],
]);

const COMPONENT = {
  5120: { bytes: 1, read: "readInt8", divisor: 127 },
  5121: { bytes: 1, read: "readUInt8", divisor: 255 },
  5122: { bytes: 2, read: "readInt16LE", divisor: 32767 },
  5123: { bytes: 2, read: "readUInt16LE", divisor: 65535 },
  5125: { bytes: 4, read: "readUInt32LE", divisor: 4294967295 },
  5126: { bytes: 4, read: "readFloatLE", divisor: 1 },
};
const WIDTH = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

export function readGlb(buffer) {
  if (buffer.length < 12) throw new Error("not a glb: shorter than its own header");
  if (buffer.readUInt32LE(0) !== GLB_MAGIC) throw new Error("not a glb: bad magic");
  const version = buffer.readUInt32LE(4);
  if (version !== 2) throw new Error(`glb version ${version}, expected 2`);
  if (buffer.readUInt32LE(8) !== buffer.length) throw new Error("glb header length does not match the file");
  let json = null;
  let bin = null;
  for (let offset = 12; offset + 8 <= buffer.length;) {
    const length = buffer.readUInt32LE(offset);
    const type = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (start + length > buffer.length) throw new Error("glb chunk runs past the end of the file");
    if (type === CHUNK_JSON) json = JSON.parse(buffer.toString("utf8", start, start + length));
    if (type === CHUNK_BIN) bin = buffer.subarray(start, start + length);
    offset = start + length;
  }
  if (!json) throw new Error("glb has no JSON chunk");
  if (!bin?.length) throw new Error("glb has no BIN chunk: the geometry is not in the file");
  return { json, bin };
}

function accessorValues(json, bin, index, normalized = true) {
  const accessor = json.accessors?.[index];
  const view = json.bufferViews?.[accessor?.bufferView];
  const component = COMPONENT[accessor?.componentType];
  const width = WIDTH[accessor?.type];
  if (!accessor || !view || !component || !width || accessor.sparse) return null;
  const packed = component.bytes * width;
  const stride = view.byteStride ?? packed;
  const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const rows = [];
  for (let row = 0; row < accessor.count; row += 1) {
    const values = [];
    for (let column = 0; column < width; column += 1) {
      const value = bin[component.read](start + row * stride + column * component.bytes);
      values.push(normalized && accessor.normalized ? Math.max(-1, value / component.divisor) : value);
    }
    rows.push(values);
  }
  return rows;
}

const identity = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function multiply(a, b) {
  const out = Array(16).fill(0);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      for (let k = 0; k < 4; k += 1) out[column * 4 + row] += a[k * 4 + row] * b[column * 4 + k];
    }
  }
  return out;
}

function localMatrix(node) {
  if (node.matrix) return node.matrix;
  const [x, y, z, w] = node.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = node.scale ?? [1, 1, 1];
  const [tx, ty, tz] = node.translation ?? [0, 0, 0];
  return [
    (1 - 2 * y * y - 2 * z * z) * sx, (2 * x * y + 2 * z * w) * sx, (2 * x * z - 2 * y * w) * sx, 0,
    (2 * x * y - 2 * z * w) * sy, (1 - 2 * x * x - 2 * z * z) * sy, (2 * y * z + 2 * x * w) * sy, 0,
    (2 * x * z + 2 * y * w) * sz, (2 * y * z - 2 * x * w) * sz, (1 - 2 * x * x - 2 * y * y) * sz, 0,
    tx, ty, tz, 1,
  ];
}

const transformPoint = (matrix, point) => [
  matrix[0] * point[0] + matrix[4] * point[1] + matrix[8] * point[2] + matrix[12],
  matrix[1] * point[0] + matrix[5] * point[1] + matrix[9] * point[2] + matrix[13],
  matrix[2] * point[0] + matrix[6] * point[1] + matrix[10] * point[2] + matrix[14],
];

function sceneGraph(json, fail) {
  const reachable = new Set();
  const parents = new Map();
  const world = new Map();
  const visit = (index, parent, parentWorld) => {
    if (reachable.has(index)) {
      fail(`node ${index} is reached more than once; the skin hierarchy is not a tree`);
      return;
    }
    const node = json.nodes?.[index];
    if (!node) {
      fail(`node ${index} is referenced and absent`);
      return;
    }
    reachable.add(index);
    parents.set(index, parent);
    const matrix = multiply(parentWorld, localMatrix(node));
    world.set(index, matrix);
    for (const child of node.children ?? []) visit(child, index, matrix);
  };
  const scene = json.scenes?.[json.scene ?? 0];
  if (!scene) fail("glb declares no scene");
  for (const root of scene?.nodes ?? []) visit(root, null, identity());
  return { reachable, parents, world };
}

function checkSkin(json, bin, graph, dimensions, fail) {
  const skins = json.skins ?? [];
  if (skins.length !== 1) {
    fail(`the Warrior must carry exactly one skin; found ${skins.length}`);
    return null;
  }
  const skin = skins[0];
  if (skin.joints?.length !== SKIN_BONES.length) {
    fail(`the Warrior skin must have exactly ${SKIN_BONES.length} joints; found ${skin.joints?.length ?? 0}`);
    return null;
  }
  const jointNames = skin.joints.map((index) => json.nodes?.[index]?.name);
  if (new Set(jointNames).size !== SKIN_BONES.length || SKIN_BONES.some((name) => !jointNames.includes(name))) {
    fail(`skin joints must be exactly the BoneName set; found [${jointNames.join(", ")}]`);
  }
  const jointForName = new Map(jointNames.map((name, index) => [name, { slot: index, node: skin.joints[index] }]));
  for (const name of SKIN_BONES) {
    const joint = jointForName.get(name);
    if (!joint) continue;
    const actualParent = graph.parents.get(joint.node);
    const expectedName = SKIN_BONE_PARENT[name];
    const expectedParent = expectedName === null ? null : jointForName.get(expectedName)?.node;
    if (expectedName === null) {
      if (actualParent !== null && skin.joints.includes(actualParent)) {
        fail(`bone "${name}" must be the skin root, not a child of "${json.nodes?.[actualParent]?.name}"`);
      }
    } else if (actualParent !== expectedParent) {
      fail(`bone "${name}" must be a direct child of "${expectedName}"`);
    }

    // The runtime links these nodes to scene-root physics parts whose origins
    // are the capsule centres. A bone authored at its anatomical joint can look
    // perfect in Blender and still translate by half a limb on frame one. The
    // exporter converts fighter (+X right, +Y up, +Z forward) to glTF by
    // reflecting X; Babylon reflects it back when loading into the LH scene.
    const centre = dimensions.bones?.[name]?.centre;
    const matrix = graph.world.get(joint.node);
    if (!centre || !matrix) {
      fail(`bone "${name}" has no bind origin to compare with its physics centre`);
    } else {
      const actual = [matrix[12], matrix[13], matrix[14]];
      const expected = [-centre[0], centre[1], centre[2]];
      const error = Math.hypot(...actual.map((value, axis) => value - expected[axis]));
      if (error > 0.002) {
        fail(
          `bone "${name}" bind origin ${actual.map((value) => value.toFixed(4)).join(",")} is ` +
          `${(error * 1000).toFixed(1)} mm from its physics centre ` +
          `${expected.map((value) => value.toFixed(4)).join(",")}`,
        );
      }
    }
  }
  if (skin.skeleton !== undefined && skin.skeleton !== jointForName.get("torso")?.node) {
    fail('skin.skeleton must name the "torso" root bone');
  }
  const inverse = json.accessors?.[skin.inverseBindMatrices];
  const values = accessorValues(json, bin, skin.inverseBindMatrices);
  if (!inverse || inverse.type !== "MAT4" || inverse.componentType !== 5126 || inverse.count !== SKIN_BONES.length ||
      !values?.length || values.some((row) => row.some((value) => !Number.isFinite(value)))) {
    fail(`the skin needs ${SKIN_BONES.length} finite float MAT4 inverse bind matrices`);
  }
  return { skin, jointForName };
}

function checkPrimitiveGeometry(json, bin, node, primitive, usedJoints, handPoints, skinInfo, graph, fail) {
  const label = `"${node.name ?? "unnamed mesh"}"`;
  const positionIndex = primitive.attributes?.POSITION;
  const positions = accessorValues(json, bin, positionIndex);
  const positionAccessor = json.accessors?.[positionIndex];
  if (!positions?.length || positionAccessor?.type !== "VEC3" || positionAccessor.componentType !== 5126 ||
      positions.some((row) => row.some((value) => !Number.isFinite(value)))) {
    fail(`${label} has no readable finite float VEC3 POSITION`);
    return;
  }
  const jointsIndex = primitive.attributes?.JOINTS_0;
  const weightsIndex = primitive.attributes?.WEIGHTS_0;
  const joints = accessorValues(json, bin, jointsIndex, false);
  const weights = accessorValues(json, bin, weightsIndex);
  const jointsAccessor = json.accessors?.[jointsIndex];
  const weightsAccessor = json.accessors?.[weightsIndex];
  if (primitive.attributes?.JOINTS_1 !== undefined || primitive.attributes?.WEIGHTS_1 !== undefined) {
    fail(`${label} exceeds the four-influence skinning contract`);
  }
  if (!joints?.length || ![5121, 5123].includes(jointsAccessor?.componentType) || jointsAccessor?.type !== "VEC4" ||
      jointsAccessor.count !== positionAccessor.count) {
    fail(`${label} JOINTS_0 must be unsigned VEC4 with POSITION count`);
    return;
  }
  if (!weights?.length || weightsAccessor?.type !== "VEC4" || weightsAccessor.count !== positionAccessor.count ||
      ![5121, 5123, 5126].includes(weightsAccessor?.componentType) ||
      (weightsAccessor.componentType !== 5126 && weightsAccessor.normalized !== true)) {
    fail(`${label} WEIGHTS_0 must be normalized VEC4 with POSITION count`);
    return;
  }
  let primitiveHasWeight = false;
  for (let vertex = 0; vertex < positions.length; vertex += 1) {
    const rowWeights = weights[vertex];
    const rowJoints = joints[vertex];
    const sum = rowWeights.reduce((total, value) => total + value, 0);
    if (rowWeights.some((value) => !Number.isFinite(value) || value < 0) || Math.abs(sum - 1) > 1e-3) {
      fail(`${label} vertex ${vertex} has non-finite, negative, or unnormalized weights (sum ${sum})`);
      break;
    }
    for (let influence = 0; influence < 4; influence += 1) {
      const slot = rowJoints[influence];
      const weight = rowWeights[influence];
      if (!Number.isInteger(slot) || slot < 0 || slot >= SKIN_BONES.length) {
        fail(`${label} vertex ${vertex} refers to joint slot ${slot} outside the 13-bone skin`);
        break;
      }
      if (weight <= 1e-6) continue;
      primitiveHasWeight = true;
      if (weight >= 0.05) usedJoints.add(slot);
      const jointName = json.nodes?.[skinInfo.skin.joints[slot]]?.name;
      if ((jointName === "swordHand" || jointName === "offHand") && weight >= 0.25 &&
          new RegExp(`__region_${jointName}(?:$|[._-])`).test(node.name ?? "")) {
        handPoints.get(jointName).push(transformPoint(graph.world.get(node.index) ?? identity(), positions[vertex]));
      }
    }
  }
  if (!primitiveHasWeight) fail(`${label} has no meaningful skin influence`);

  const uvIndex = primitive.attributes?.TEXCOORD_0;
  if (uvIndex !== undefined) {
    const uv = accessorValues(json, bin, uvIndex);
    const accessor = json.accessors?.[uvIndex];
    if (!uv?.length || accessor?.type !== "VEC2" || accessor.componentType !== 5126 || accessor.count !== positionAccessor.count ||
        uv.some((row) => row.some((value) => !Number.isFinite(value)))) {
      fail(`${label} TEXCOORD_0 must be finite float VEC2 with POSITION count`);
    }
  }
  const material = json.materials?.[primitive.material];
  if ((material?.pbrMetallicRoughness?.baseColorTexture || material?.normalTexture) && uvIndex === undefined) {
    fail(`${label} carries a textured material without TEXCOORD_0`);
  }
  const tangentIndex = primitive.attributes?.TANGENT;
  if (material?.normalTexture && tangentIndex === undefined) {
    fail(`${label} carries a normal map without TANGENT`);
  } else if (tangentIndex !== undefined) {
    const tangents = accessorValues(json, bin, tangentIndex);
    const accessor = json.accessors?.[tangentIndex];
    if (!tangents?.length || accessor?.type !== "VEC4" || accessor.componentType !== 5126 || accessor.count !== positionAccessor.count ||
        tangents.some((row) => row.some((value) => !Number.isFinite(value)) ||
          Math.hypot(row[0], row[1], row[2]) <= 1e-6 || Math.abs(Math.abs(row[3]) - 1) > 1e-4)) {
      fail(`${label} TANGENT must be finite float VEC4 with POSITION count`);
    }
  }
}

function checkGarments(meshNodes, fail) {
  for (const [label, matchesName] of GARMENTS) {
    const matches = meshNodes.filter((node) => matchesName(node.name ?? ""));
    if (!matches.length) fail(`the coherent outfit is missing ${label} geometry`);
    if (label === "left and right boots" && matches.length < 2 && !matches.some((node) => /boots/i.test(node.name ?? ""))) {
      fail("the coherent outfit does not contain both boots");
    }
  }
}

function distanceToBounds(point, min, max) {
  return Math.hypot(...point.map((value, axis) => Math.max(min[axis] - value, 0, value - max[axis])));
}

function checkHands(json, graph, handPoints, dimensions, fail) {
  const markers = new Map([["swordHand", "grip.primary"], ["offHand", "grip.secondary"]]);
  for (const [bone, markerName] of markers) {
    const points = handPoints.get(bone);
    if (!points?.length) {
      fail(`"${bone}" has no geometry meaningfully weighted to it`);
      continue;
    }
    const min = [0, 1, 2].map((axis) => Math.min(...points.map((point) => point[axis])));
    const max = [0, 1, 2].map((axis) => Math.max(...points.map((point) => point[axis])));
    const width = Math.max(max[0] - min[0], max[2] - min[2]);
    if (width < 0.075) fail(`"${bone}" is only ${(width * 1000).toFixed(1)} mm wide; an adult hand must be at least 75 mm`);

    const markerIndex = json.nodes?.findIndex((node) => node.name === markerName) ?? -1;
    let grip;
    if (markerIndex >= 0 && graph.world.has(markerIndex)) {
      grip = transformPoint(graph.world.get(markerIndex), [0, 0, 0]);
    } else {
      fail(`the bind pose is missing explicit weapon root "${markerName}"`);
      const centre = dimensions.bones?.[bone]?.centre;
      if (centre) grip = [centre[0], centre[1] - dimensions.arm.handLength / 2, centre[2]];
    }
    if (grip) {
      const centre = dimensions.bones?.[bone]?.centre;
      const expected = centre && [centre[0], centre[1] - dimensions.arm.handLength / 2, centre[2]];
      if (expected && (
        Math.abs(Math.abs(grip[0]) - Math.abs(expected[0])) > 0.010 ||
        Math.abs(grip[1] - expected[1]) > 0.010 ||
        Math.abs(Math.abs(grip[2]) - Math.abs(expected[2])) > 0.010
      )) {
        fail(`"${markerName}" is not at the physical bind weapon root (${expected.map((value) => value.toFixed(3)).join(",")})`);
      }
      const distance = distanceToBounds(grip, min, max);
      if (distance > 0.010) {
        fail(`"${bone}" geometry stops ${(distance * 1000).toFixed(1)} mm from ${markerName}; the hand is disconnected from its weapon`);
      }
    }
  }
}

function checkDeadPayload(json, bin, graph, skinInfo, fail) {
  const reachableMeshes = new Set([...graph.reachable].map((index) => json.nodes?.[index]?.mesh).filter((index) => index !== undefined));
  const usedAccessors = new Set();
  for (const [index, mesh] of (json.meshes ?? []).entries()) {
    if (!reachableMeshes.has(index)) fail(`mesh ${index} (${mesh.name ?? "unnamed"}) is dead payload`);
    for (const primitive of mesh.primitives ?? []) {
      Object.values(primitive.attributes ?? {}).forEach((value) => usedAccessors.add(value));
      if (primitive.indices !== undefined) usedAccessors.add(primitive.indices);
    }
  }
  if (skinInfo?.skin.inverseBindMatrices !== undefined) usedAccessors.add(skinInfo.skin.inverseBindMatrices);
  for (let index = 0; index < (json.accessors ?? []).length; index += 1) {
    if (!usedAccessors.has(index)) fail(`accessor ${index} is dead payload`);
  }
  const usedViews = new Set([...usedAccessors].map((index) => json.accessors?.[index]?.bufferView).filter((index) => index !== undefined));
  for (const image of json.images ?? []) if (image.bufferView !== undefined) usedViews.add(image.bufferView);
  for (let index = 0; index < (json.bufferViews ?? []).length; index += 1) {
    if (!usedViews.has(index)) fail(`bufferView ${index} is dead binary payload`);
  }
  const logicalBytes = json.buffers?.[0]?.byteLength;
  const end = Math.max(0, ...(json.bufferViews ?? []).map((view) => (view.byteOffset ?? 0) + view.byteLength));
  if (logicalBytes !== end || bin.length < logicalBytes || bin.length - logicalBytes > 3) {
    fail(`binary payload is ${logicalBytes} logical bytes with last live byte ${end} and chunk ${bin.length}`);
  }
}

export function checkWarriorDocument(json, bin, dimensions, digest = null) {
  const failures = [];
  const notes = [];
  const fail = (sentence) => failures.push(sentence);
  if (digest === REJECTED_RIGID_ASSET) {
    fail(`asset digest ${digest} is the explicitly rejected disconnected rigid Warrior`);
  }
  const graph = sceneGraph(json, fail);
  const skinInfo = checkSkin(json, bin, graph, dimensions, fail);
  const meshNodes = [...graph.reachable].map((index) => ({ index, ...json.nodes[index] })).filter((node) => node.mesh !== undefined);
  if (!meshNodes.length) fail("the Warrior has no reachable mesh geometry");
  const usedJoints = new Set();
  const handPoints = new Map([["swordHand", []], ["offHand", []]]);
  for (const node of meshNodes) {
    if (node.skin !== 0) fail(`"${node.name ?? "unnamed mesh"}" is not attached to the one Warrior skin`);
    const region = (node.name ?? "").match(/__region_(\w+)$/)?.[1];
    if (!SKIN_BONES.includes(region)) {
      fail(`"${node.name ?? "unnamed mesh"}" does not name one BoneName owner with __region_<BoneName>`);
    }
    for (const primitive of json.meshes?.[node.mesh]?.primitives ?? []) {
      if (skinInfo) checkPrimitiveGeometry(json, bin, node, primitive, usedJoints, handPoints, skinInfo, graph, fail);
    }
  }
  if (skinInfo) {
    for (let slot = 0; slot < SKIN_BONES.length; slot += 1) {
      if (!usedJoints.has(slot)) fail(`bone "${json.nodes?.[skinInfo.skin.joints[slot]]?.name}" has no meaningful vertex weights`);
    }
  }
  checkGarments(meshNodes, fail);
  checkHands(json, graph, handPoints, dimensions, fail);
  checkDeadPayload(json, bin, graph, skinInfo, fail);
  if (json.animations?.length) fail("the cosmetic asset carries animation; live physics owns the pose");
  if (json.cameras?.length) fail(`the asset carries ${json.cameras.length} camera(s)`);
  for (const name of [
    ...(json.nodes ?? []).map((node) => node.name ?? ""),
    ...(json.meshes ?? []).map((mesh) => mesh.name ?? ""),
  ]) {
    if (FORBIDDEN.test(name) && !/^grip\./.test(name)) fail(`"${name}" is weapon geometry; weapons remain physics-owned`);
  }
  notes.push(`skinned mesh nodes: ${meshNodes.length}`);
  notes.push(`skin joints with weights: ${usedJoints.size}/${SKIN_BONES.length}`);
  if (digest) notes.push(`sha256 ${digest}`);
  return { ok: failures.length === 0, failures, notes };
}

export function checkWarrior(buffer, dimensions) {
  const digest = createHash("sha256").update(buffer).digest("hex");
  const { json, bin } = readGlb(buffer);
  return checkWarriorDocument(json, bin, dimensions, digest);
}

/** The new builder must create a skinned armature, never welded rigid pieces. */
export function checkWarriorBuilder(source, provenance) {
  const failures = [];
  if (!/WarriorRig/.test(source)) failures.push('the builder does not name the one armature "WarriorRig"');
  for (const bone of SKIN_BONES) {
    if (!new RegExp(`['\"]${bone}['\"]`).test(source)) failures.push(`the builder does not author BoneName "${bone}"`);
  }
  if (!/vertex_group|vertex_groups/.test(source)) failures.push("the builder does not author vertex weights");
  if (/bpy\.ops\.mesh\.primitive_/.test(source)) failures.push("the Warrior builder contains a Blender primitive constructor");
  const selected = new Set(Array.isArray(provenance?.selected) ? provenance.selected : [provenance?.selected].filter(Boolean));
  const pins = (provenance?.sources ?? []).filter((row) => selected.has(row.id));
  if (!pins.length || pins.some((row) => row.license !== "CC0-1.0" || !/^[0-9a-f]{64}$/.test(row.archiveSha256 ?? ""))) {
    failures.push("the selected Warrior sources are not all digest-pinned CC0 records");
  }
  return failures;
}

export function measurements(buffer) {
  const { json, bin } = readGlb(buffer);
  const rows = [];
  for (const node of json.nodes ?? []) {
    if (node.mesh === undefined) continue;
    let vertices = 0;
    for (const primitive of json.meshes?.[node.mesh]?.primitives ?? []) {
      vertices += accessorValues(json, bin, primitive.attributes?.POSITION)?.length ?? 0;
    }
    rows.push(`${(node.name ?? "unnamed").padEnd(46)} ${String(vertices).padStart(7)} vertices skin ${node.skin ?? "none"}`);
  }
  return rows;
}

async function main() {
  const glb = resolve(ROOT, "public/assets/warrior.glb");
  const dimensions = JSON.parse(await readFile(resolve(ROOT, "asset-src/dimensions.json"), "utf8"));
  const buffer = await readFile(glb).catch(() => null);
  if (!buffer) {
    console.error("public/assets/warrior.glb is missing -- run: npm run asset:build");
    process.exit(1);
  }
  const result = checkWarrior(buffer, dimensions);
  if (process.argv.includes("--table")) for (const row of measurements(buffer)) console.log(row);
  for (const note of result.notes) console.log(`  ${note}`);
  for (const failure of result.failures) console.error(`FAIL ${failure}`);
  console.log(result.ok ? "warrior.glb is one coherent skinned person." : `${result.failures.length} Warrior asset failures.`);
  process.exit(result.ok ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
