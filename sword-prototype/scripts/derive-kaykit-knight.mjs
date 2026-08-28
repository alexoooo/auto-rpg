import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(HERE, "..");
export const MANIFEST_PATH = resolve(ROOT,
  "asset-src/armour/kaykit-adventurers-1.0/manifest.json");

const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;
const COMPONENT_BYTES = Object.freeze({ 5121: 1, 5123: 2, 5125: 4, 5126: 4 });
const COMPONENT_COUNT = Object.freeze({ SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4,
  MAT2: 4, MAT3: 9, MAT4: 16 });

export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function parseGlb(bytes) {
  if (bytes.length < 20 || bytes.toString("ascii", 0, 4) !== "glTF") {
    throw new Error("not a binary glTF file");
  }
  if (bytes.readUInt32LE(4) !== 2) throw new Error("GLB version is not 2");
  if (bytes.readUInt32LE(8) !== bytes.length) throw new Error("GLB length header is wrong");
  const chunks = [];
  for (let offset = 12; offset < bytes.length;) {
    const length = bytes.readUInt32LE(offset);
    const type = bytes.readUInt32LE(offset + 4);
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (data.length !== length) throw new Error("truncated GLB chunk");
    chunks.push({ type, data });
    offset += 8 + length;
  }
  if (chunks.length !== 2 || chunks[0].type !== JSON_CHUNK || chunks[1].type !== BIN_CHUNK) {
    throw new Error("KayKit source must contain exactly JSON and BIN chunks");
  }
  return {
    json: JSON.parse(chunks[0].data.toString("utf8").trimEnd()),
    bin: Buffer.from(chunks[1].data),
  };
}

function packGlb(json, bin) {
  const rawJson = Buffer.from(JSON.stringify(json), "utf8");
  const jsonLength = (rawJson.length + 3) & ~3;
  const jsonChunk = Buffer.alloc(jsonLength, 0x20);
  rawJson.copy(jsonChunk);
  const binLength = (bin.length + 3) & ~3;
  const binChunk = Buffer.alloc(binLength);
  bin.copy(binChunk);
  const bytes = Buffer.alloc(12 + 8 + jsonLength + 8 + binLength);
  bytes.write("glTF", 0, 4, "ascii");
  bytes.writeUInt32LE(2, 4);
  bytes.writeUInt32LE(bytes.length, 8);
  bytes.writeUInt32LE(jsonLength, 12);
  bytes.writeUInt32LE(JSON_CHUNK, 16);
  jsonChunk.copy(bytes, 20);
  const binHeader = 20 + jsonLength;
  bytes.writeUInt32LE(binLength, binHeader);
  bytes.writeUInt32LE(BIN_CHUNK, binHeader + 4);
  binChunk.copy(bytes, binHeader + 8);
  return bytes;
}

function failUnless(condition, message) {
  if (!condition) throw new Error(message);
}

function uniqueByName(items, kind) {
  const result = new Map();
  for (let index = 0; index < items.length; index += 1) {
    const name = items[index].name;
    failUnless(typeof name === "string", `${kind} ${index} has no name`);
    failUnless(!result.has(name), `duplicate ${kind} name ${JSON.stringify(name)}`);
    result.set(name, index);
  }
  return result;
}

function accessorLayout(document, index) {
  const accessor = document.accessors[index];
  failUnless(accessor && accessor.bufferView !== undefined && accessor.sparse === undefined,
    `accessor ${index} must be a non-sparse buffer view`);
  const view = document.bufferViews[accessor.bufferView];
  failUnless(view?.buffer === 0, `accessor ${index} is not in the embedded buffer`);
  const components = COMPONENT_COUNT[accessor.type];
  const componentBytes = COMPONENT_BYTES[accessor.componentType];
  failUnless(components && componentBytes, `accessor ${index} has unsupported layout`);
  const itemBytes = components * componentBytes;
  const stride = view.byteStride ?? itemBytes;
  failUnless(stride >= itemBytes, `accessor ${index} has an undersized byte stride`);
  return {
    accessor,
    components,
    componentBytes,
    itemBytes,
    stride,
    offset: (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0),
  };
}

function readComponent(bin, componentType, offset, normalized = false) {
  let value;
  if (componentType === 5121) value = bin.readUInt8(offset);
  else if (componentType === 5123) value = bin.readUInt16LE(offset);
  else if (componentType === 5125) value = bin.readUInt32LE(offset);
  else if (componentType === 5126) value = bin.readFloatLE(offset);
  else throw new Error(`unsupported component type ${componentType}`);
  if (!normalized) return value;
  if (componentType === 5121) return value / 255;
  if (componentType === 5123) return value / 65535;
  throw new Error(`unsupported normalized component type ${componentType}`);
}

function readItem(document, bin, accessorIndex, itemIndex) {
  const layout = accessorLayout(document, accessorIndex);
  failUnless(itemIndex >= 0 && itemIndex < layout.accessor.count,
    `accessor ${accessorIndex} item ${itemIndex} is out of range`);
  const start = layout.offset + itemIndex * layout.stride;
  return Array.from({ length: layout.components }, (_, component) => readComponent(bin,
    layout.accessor.componentType, start + component * layout.componentBytes,
    layout.accessor.normalized === true));
}

function readIndices(document, bin, accessorIndex) {
  const layout = accessorLayout(document, accessorIndex);
  failUnless(layout.accessor.type === "SCALAR", `index accessor ${accessorIndex} is not SCALAR`);
  failUnless([5121, 5123, 5125].includes(layout.accessor.componentType),
    `index accessor ${accessorIndex} has unsupported component type`);
  return Array.from({ length: layout.accessor.count }, (_, index) =>
    readComponent(bin, layout.accessor.componentType, layout.offset + index * layout.stride));
}

function writeIndices(indices, componentType) {
  const width = COMPONENT_BYTES[componentType];
  const bytes = Buffer.alloc(indices.length * width);
  for (let index = 0; index < indices.length; index += 1) {
    const offset = index * width;
    if (componentType === 5121) bytes.writeUInt8(indices[index], offset);
    else if (componentType === 5123) bytes.writeUInt16LE(indices[index], offset);
    else bytes.writeUInt32LE(indices[index], offset);
  }
  return bytes;
}

function localMatrix(node) {
  if (node.matrix) return [...node.matrix];
  const [x, y, z, w] = node.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = node.scale ?? [1, 1, 1];
  const [tx, ty, tz] = node.translation ?? [0, 0, 0];
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  return [
    (1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0,
    (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0,
    (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0,
    tx, ty, tz, 1,
  ];
}

function multiplyMatrix(a, b) {
  const result = Array(16).fill(0);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      for (let inner = 0; inner < 4; inner += 1) {
        result[column * 4 + row] += a[inner * 4 + row] * b[column * 4 + inner];
      }
    }
  }
  return result;
}

function rounded(value) {
  const result = Math.round(value * 1e9) / 1e9;
  return Object.is(result, -0) ? 0 : result;
}

function roundedArray(values) {
  return values.map(rounded);
}

function parentIndices(nodes) {
  const parents = Array(nodes.length).fill(null);
  nodes.forEach((node, parent) => {
    for (const child of node.children ?? []) {
      failUnless(parents[child] === null, `node ${child} has more than one parent`);
      parents[child] = parent;
    }
  });
  return parents;
}

function worldMatrices(nodes) {
  const parents = parentIndices(nodes);
  const cache = new Map();
  const visit = (index, visiting = new Set()) => {
    if (cache.has(index)) return cache.get(index);
    failUnless(!visiting.has(index), `node hierarchy contains a cycle at ${index}`);
    visiting.add(index);
    const local = localMatrix(nodes[index]);
    const world = parents[index] === null ? local : multiplyMatrix(visit(parents[index], visiting), local);
    visiting.delete(index);
    cache.set(index, world);
    return world;
  };
  return nodes.map((_, index) => visit(index));
}

function positionOf(matrix) {
  return roundedArray(matrix.slice(12, 15));
}

function distance(a, b) {
  return rounded(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]));
}

function nativeBounds(document, bin, bodyNodeNames) {
  const nodes = uniqueByName(document.nodes, "node");
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const name of bodyNodeNames) {
    const node = document.nodes[nodes.get(name)];
    for (const primitive of document.meshes[node.mesh].primitives) {
      const position = accessorLayout(document, primitive.attributes.POSITION);
      for (let vertex = 0; vertex < position.accessor.count; vertex += 1) {
        const value = readItem(document, bin, primitive.attributes.POSITION, vertex);
        for (let axis = 0; axis < 3; axis += 1) {
          min[axis] = Math.min(min[axis], value[axis]);
          max[axis] = Math.max(max[axis], value[axis]);
        }
      }
    }
  }
  const size = max.map((value, axis) => value - min[axis]);
  return { minM: roundedArray(min), maxM: roundedArray(max),
    sizeM: roundedArray(size), heightM: rounded(size[1]) };
}

export function buildProfile(document, bin, manifest) {
  const nodes = uniqueByName(document.nodes, "node");
  const worlds = worldMatrices(document.nodes);
  const point = (name) => positionOf(worlds[nodes.get(name)]);
  const rule = manifest.regionInfluenceRule;
  const regions = rule.regionOrder.map((region) => ({
    region,
    sourceBone: rule.profileBoneByRegion[region],
    parent: rule.regionParents[region],
    bindWorldJointCentreM: point(rule.profileBoneByRegion[region]),
  }));
  const lengthPairs = {
    pelvisToChest: ["hips", "chest"],
    chestToHead: ["chest", "head"],
    shoulderWidth: ["upperarm.l", "upperarm.r"],
    hipWidth: ["upperleg.l", "upperleg.r"],
    swordUpperArm: ["upperarm.r", "lowerarm.r"],
    swordForearm: ["lowerarm.r", "hand.r"],
    swordHandToSlot: ["hand.r", "handslot.r"],
    offUpperArm: ["upperarm.l", "lowerarm.l"],
    offForearm: ["lowerarm.l", "hand.l"],
    offHandToSlot: ["hand.l", "handslot.l"],
    thighLeft: ["upperleg.l", "lowerleg.l"],
    shinLeft: ["lowerleg.l", "foot.l"],
    footLeft: ["foot.l", "toes.l"],
    thighRight: ["upperleg.r", "lowerleg.r"],
    shinRight: ["lowerleg.r", "foot.r"],
    footRight: ["foot.r", "toes.r"],
  };
  const mounts = {};
  for (const [side, mount] of Object.entries(manifest.weaponMounts)) {
    const handToSlot = localMatrix(document.nodes[nodes.get(mount.slotNode)]);
    const slotToVisual = localMatrix(document.nodes[nodes.get(mount.visualNode)]);
    mounts[side] = {
      ...mount,
      matrixConvention: "glTF column-major; column vectors; parentToChild local transforms",
      handToSlotMatrix: roundedArray(handToSlot),
      slotToVisualMatrix: roundedArray(slotToVisual),
      handToVisualMatrix: roundedArray(multiplyMatrix(handToSlot, slotToVisual)),
    };
  }
  return {
    schemaVersion: 1,
    assetId: manifest.id,
    sourceSha256: manifest.source.sha256,
    coordinateSystem: { handedness: "right", up: "+Y", forward: "+Z", unit: "metre" },
    bodyOnlyBounds: nativeBounds(document, bin, manifest.selection.skinnedBodyNodes),
    regions,
    lengthsM: Object.fromEntries(Object.entries(lengthPairs)
      .map(([name, [from, to]]) => [name, distance(point(from), point(to))])),
    weaponMounts: mounts,
  };
}

function bindPoseBoundsForEntries(document, bin, entries) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const entry of entries) {
    const positionAccessor = entry.sourcePrimitive.attributes.POSITION;
    for (const vertex of entry.indices) {
      const position = readItem(document, bin, positionAccessor, vertex);
      for (let axis = 0; axis < 3; axis += 1) {
        min[axis] = Math.min(min[axis], position[axis]);
        max[axis] = Math.max(max[axis], position[axis]);
      }
    }
  }
  const centre = min.map((value, axis) => (value + max[axis]) / 2);
  const size = max.map((value, axis) => value - min[axis]);
  return { minM: roundedArray(min), maxM: roundedArray(max),
    centreM: roundedArray(centre), sizeM: roundedArray(size),
    halfExtentsM: roundedArray(size.map((value) => value / 2)) };
}

function partitionBody(document, sourceBin, manifest) {
  const nodeNames = uniqueByName(document.nodes, "node");
  const skin = document.skins[0];
  const jointNames = skin.joints.map((node) => document.nodes[node].name);
  const rule = manifest.regionInfluenceRule;
  failUnless(new Set(rule.regionOrder).size === 13, "region order must contain exactly 13 unique regions");
  for (const joint of jointNames) failUnless(Object.hasOwn(rule.sourceBoneToRegion, joint),
    `source joint ${JSON.stringify(joint)} is absent from the frozen joint table`);
  const buckets = new Map(rule.regionOrder.map((region) => [region, []]));
  const positiveWeightJoints = new Set();
  let sourceTriangleCount = 0;
  for (const nodeName of manifest.selection.skinnedBodyNodes) {
    const node = document.nodes[nodeNames.get(nodeName)];
    failUnless(node.skin === 0, `${nodeName} is not attached to the one source skin`);
    failUnless(Object.keys(node).every((key) => ["mesh", "name", "skin"].includes(key)),
      `${nodeName} has a non-identity transform that the partitioner would lose`);
    for (const primitive of document.meshes[node.mesh].primitives) {
      failUnless((primitive.mode ?? 4) === 4, `${nodeName} is not a triangle primitive`);
      failUnless(primitive.indices !== undefined, `${nodeName} is not indexed`);
      const jointsAccessor = primitive.attributes.JOINTS_0;
      const weightsAccessor = primitive.attributes.WEIGHTS_0;
      failUnless(jointsAccessor !== undefined && weightsAccessor !== undefined,
        `${nodeName} has no JOINTS_0/WEIGHTS_0 pair`);
      const indices = readIndices(document, sourceBin, primitive.indices);
      failUnless(indices.length % 3 === 0, `${nodeName} index count is not divisible by three`);
      const grouped = new Map(rule.regionOrder.map((region) => [region, []]));
      for (let triangle = 0; triangle < indices.length; triangle += 3) {
        const score = new Map(rule.regionOrder.map((region) => [region, 0]));
        for (let corner = 0; corner < 3; corner += 1) {
          const vertex = indices[triangle + corner];
          const joints = readItem(document, sourceBin, jointsAccessor, vertex);
          const weights = readItem(document, sourceBin, weightsAccessor, vertex);
          for (let influence = 0; influence < joints.length; influence += 1) {
            const jointName = jointNames[joints[influence]];
            failUnless(jointName !== undefined, `${nodeName} vertex ${vertex} references missing joint`);
            if (weights[influence] <= 0) continue;
            const region = rule.sourceBoneToRegion[jointName];
            failUnless(region !== null,
              `${nodeName} vertex ${vertex} is positively weighted to control joint ${jointName}`);
            positiveWeightJoints.add(jointName);
            score.set(region, score.get(region) + weights[influence]);
          }
        }
        let winner = rule.regionOrder[0];
        for (const region of rule.regionOrder.slice(1)) {
          if (score.get(region) > score.get(winner)) winner = region;
        }
        grouped.get(winner).push(indices[triangle], indices[triangle + 1], indices[triangle + 2]);
        sourceTriangleCount += 1;
      }
      for (const region of rule.regionOrder) {
        if (grouped.get(region).length > 0) {
          buckets.get(region).push({ sourceNode: nodeName, sourcePrimitive: primitive,
            sourceIndexAccessor: document.accessors[primitive.indices], indices: grouped.get(region) });
        }
      }
    }
  }
  return { buckets, sourceTriangleCount,
    positiveWeightJoints: jointNames.filter((joint) => positiveWeightJoints.has(joint)),
    unweightedJoints: jointNames.filter((joint) => !positiveWeightJoints.has(joint)) };
}

function appendIndexAccessor(document, chunks, entry) {
  const source = entry.sourceIndexAccessor;
  const bytes = writeIndices(entry.indices, source.componentType);
  const offset = chunks.reduce((total, chunk) => total + chunk.length, 0);
  failUnless(offset % 4 === 0, "derived binary view is not four-byte aligned");
  const padded = Buffer.alloc((bytes.length + 3) & ~3);
  bytes.copy(padded);
  const bufferView = document.bufferViews.length;
  document.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length,
    target: 34963 });
  const accessor = document.accessors.length;
  document.accessors.push({ bufferView, componentType: source.componentType,
    count: entry.indices.length, type: "SCALAR",
    min: [Math.min(...entry.indices)], max: [Math.max(...entry.indices)] });
  chunks.push(padded);
  return accessor;
}

function remapNodes(document, removedNames) {
  const kept = [];
  const remap = new Map();
  document.nodes.forEach((node, oldIndex) => {
    if (!removedNames.has(node.name)) {
      remap.set(oldIndex, kept.length);
      kept.push(structuredClone(node));
    }
  });
  const mapIndex = (index, context) => {
    failUnless(remap.has(index), `${context} points at removed node ${index}`);
    return remap.get(index);
  };
  kept.forEach((node) => {
    if (node.children) node.children = node.children.filter((child) => remap.has(child)).map((child) => remap.get(child));
  });
  for (const scene of document.scenes) scene.nodes = scene.nodes.map((node) => mapIndex(node, "scene"));
  for (const skin of document.skins) {
    skin.joints = skin.joints.map((node) => mapIndex(node, "skin joint"));
    if (skin.skeleton !== undefined) skin.skeleton = mapIndex(skin.skeleton, "skin skeleton");
  }
  for (const animation of document.animations) {
    for (const channel of animation.channels) {
      channel.target.node = mapIndex(channel.target.node, `animation ${animation.name}`);
    }
  }
  document.nodes = kept;
  return remap;
}

export function deriveKayKit(sourceBytes, manifest) {
  failUnless(sha256(sourceBytes) === manifest.source.sha256, "source Knight.glb hash does not match manifest");
  const source = parseGlb(sourceBytes);
  const document = structuredClone(source.json);
  failUnless(document.buffers?.length === 1, "source must have one embedded buffer");
  failUnless(document.skins?.length === 1 && document.skins[0].name === "Rig",
    "source must have the one creator Rig skin");
  const sourceNodeNames = uniqueByName(document.nodes, "node");
  for (const name of [...manifest.selection.skinnedBodyNodes, ...manifest.selection.rigidNodes,
    ...manifest.selection.removedAccessoryNodes]) {
    failUnless(sourceNodeNames.has(name), `source is missing node ${JSON.stringify(name)}`);
  }
  const animationNames = uniqueByName(document.animations, "animation");
  for (const name of manifest.selection.animations) {
    failUnless(animationNames.has(name), `source is missing animation ${JSON.stringify(name)}`);
  }
  const profile = buildProfile(document, source.bin, manifest);
  const { buckets, sourceTriangleCount, positiveWeightJoints, unweightedJoints } =
    partitionBody(document, source.bin, manifest);
  profile.deformation = {
    influenceRuleVersion: manifest.regionInfluenceRule.version,
    positiveWeightJoints: positiveWeightJoints.map((sourceBone) => ({ sourceBone,
      region: manifest.regionInfluenceRule.sourceBoneToRegion[sourceBone] })),
    unweightedControlJoints: unweightedJoints,
  };
  profile.physics = {
    authority: "body-only bind-pose source vertices referenced by each mechanically partitioned region",
    paddingM: 0,
    regionBounds: Object.fromEntries(manifest.regionInfluenceRule.regionOrder.map((region) =>
      [region, bindPoseBoundsForEntries(document, source.bin, buckets.get(region))])),
  };
  profile.nativeAnimations = {
    retained: [...manifest.selection.animations],
    ...manifest.selection.animationRuntime,
  };

  document.animations = document.animations.filter((animation) =>
    manifest.selection.animations.includes(animation.name));
  const removedNames = new Set([...manifest.selection.removedAccessoryNodes,
    ...manifest.selection.skinnedBodyNodes]);
  remapNodes(document, removedNames);

  const retainedRigid = new Set(manifest.selection.rigidNodes);
  const retainedMeshIndices = new Set(document.nodes
    .filter((node) => retainedRigid.has(node.name)).map((node) => node.mesh));
  const meshRemap = new Map();
  const meshes = [];
  document.meshes.forEach((mesh, oldIndex) => {
    if (retainedMeshIndices.has(oldIndex)) {
      meshRemap.set(oldIndex, meshes.length);
      meshes.push(mesh);
    }
  });
  document.nodes.forEach((node) => {
    if (node.mesh !== undefined) {
      failUnless(meshRemap.has(node.mesh), `unexpected retained mesh node ${JSON.stringify(node.name)}`);
      node.mesh = meshRemap.get(node.mesh);
    }
  });
  document.meshes = meshes;

  const sourceBufferLength = document.buffers[0].byteLength;
  failUnless(sourceBufferLength <= source.bin.length, "source BIN chunk is shorter than buffer.byteLength");
  const chunks = [Buffer.from(source.bin.subarray(0, sourceBufferLength))];
  const rig = document.nodes.find((node) => node.name === "Rig");
  failUnless(rig, "remapped document lost the Rig node");
  let derivedTriangleCount = 0;
  for (const region of manifest.regionInfluenceRule.regionOrder) {
    const entries = buckets.get(region);
    failUnless(entries.length > 0, `frozen partition produced no geometry for ${region}`);
    const primitives = entries.map((entry) => {
      const primitive = structuredClone(entry.sourcePrimitive);
      primitive.indices = appendIndexAccessor(document, chunks, entry);
      primitive.extras = { ...(primitive.extras ?? {}), autoRpgRegion: region,
        sourceNode: entry.sourceNode };
      derivedTriangleCount += entry.indices.length / 3;
      return primitive;
    });
    const mesh = document.meshes.length;
    document.meshes.push({ name: `Knight__region_${region}`, primitives,
      extras: { autoRpgRegion: region } });
    const node = document.nodes.length;
    document.nodes.push({ name: `Knight__region_${region}`, mesh, skin: 0,
      extras: { autoRpgRegion: region } });
    rig.children = [...(rig.children ?? []), node];
  }
  failUnless(derivedTriangleCount === sourceTriangleCount,
    `partition changed triangle count ${sourceTriangleCount} -> ${derivedTriangleCount}`);
  const derivedBin = Buffer.concat(chunks);
  document.buffers[0].byteLength = derivedBin.length;
  document.asset = { ...document.asset, extras: { ...(document.asset.extras ?? {}), autoRpg: {
    pipeline: "kaykit-knight-v1",
    sourceSha256: manifest.source.sha256,
    sourceCommit: manifest.source.commit,
    partitionRuleVersion: manifest.regionInfluenceRule.version,
  } } };
  return { bytes: packGlb(document, derivedBin), profile,
    report: { sourceTriangleCount, derivedTriangleCount,
      positiveWeightJoints, unweightedJoints,
      regions: Object.fromEntries([...buckets].map(([region, entries]) =>
        [region, entries.reduce((count, entry) => count + entry.indices.length / 3, 0)])) } };
}

export function verifyDerivative(sourceBytes, licenseBytes, derivedBytes, profileBytes, manifest) {
  const failures = [];
  const check = (condition, message) => { if (!condition) failures.push(message); };
  check(sourceBytes.length === manifest.source.byteLength, "source byte length moved");
  check(sha256(sourceBytes) === manifest.source.sha256, "source hash moved");
  check(sha256(licenseBytes) === manifest.license.sha256, "bundled license hash moved");
  check(licenseBytes.toString("utf8").includes("Creative Commons Zero, CC0"),
    "bundled license no longer identifies CC0");
  let expected;
  try { expected = deriveKayKit(sourceBytes, manifest); }
  catch (error) { return { ok: false, failures: [...failures, error.message] }; }
  check(derivedBytes.equals(expected.bytes), "runtime GLB is not the deterministic derivative");
  const canonicalProfile = Buffer.from(`${JSON.stringify(expected.profile, null, 2)}\n`, "utf8");
  check(profileBytes.equals(canonicalProfile), "runtime profile is not the deterministic source profile");
  check(manifest.derivative.glbSha256 === sha256(derivedBytes), "runtime GLB hash pin moved");
  check(manifest.derivative.profileSha256 === sha256(profileBytes), "runtime profile hash pin moved");
  try {
    const derived = parseGlb(derivedBytes);
    const nodeNames = derived.json.nodes.map((node) => node.name);
    for (const removed of [...manifest.selection.removedAccessoryNodes,
      ...manifest.selection.skinnedBodyNodes]) {
      check(!nodeNames.includes(removed), `runtime retained removed node ${removed}`);
    }
    for (const retained of manifest.selection.rigidNodes) {
      check(nodeNames.includes(retained), `runtime lost selected rigid node ${retained}`);
    }
    for (const region of manifest.regionInfluenceRule.regionOrder) {
      check(nodeNames.includes(`Knight__region_${region}`), `runtime lost region ${region}`);
    }
    check(derived.json.animations.map((animation) => animation.name).join("\0") ===
      manifest.selection.animations.join("\0"), "runtime animation selection or order moved");
    const source = parseGlb(sourceBytes);
    check(derived.bin.subarray(0, source.json.buffers[0].byteLength)
      .equals(source.bin.subarray(0, source.json.buffers[0].byteLength)),
    "source binary prefix changed instead of being preserved");
    check(JSON.stringify(derived.json.bufferViews.slice(0, source.json.bufferViews.length)) ===
      JSON.stringify(source.json.bufferViews), "source buffer views changed");
    check(JSON.stringify(derived.json.accessors.slice(0, source.json.accessors.length)) ===
      JSON.stringify(source.json.accessors), "source accessors changed");
    check(JSON.stringify(derived.json.materials) === JSON.stringify(source.json.materials),
      "source materials changed");
    check(JSON.stringify(derived.json.textures) === JSON.stringify(source.json.textures),
      "source textures changed");
    check(JSON.stringify(derived.json.images) === JSON.stringify(source.json.images),
      "source images changed");
    check(JSON.stringify(derived.json.samplers) === JSON.stringify(source.json.samplers),
      "source samplers changed");
    const sourceNodes = uniqueByName(source.json.nodes, "node");
    const derivedNodes = uniqueByName(derived.json.nodes, "node");
    const transform = (node) => Object.fromEntries(Object.entries(node)
      .filter(([key]) => ["matrix", "rotation", "scale", "translation"].includes(key)));
    for (const name of manifest.selection.rigidNodes) {
      const sourceNode = source.json.nodes[sourceNodes.get(name)];
      const derivedNode = derived.json.nodes[derivedNodes.get(name)];
      check(JSON.stringify(transform(derivedNode)) === JSON.stringify(transform(sourceNode)),
        `${name} creator transform changed`);
      check(JSON.stringify(derived.json.meshes[derivedNode.mesh]) ===
        JSON.stringify(source.json.meshes[sourceNode.mesh]), `${name} creator mesh changed`);
    }
    for (const region of manifest.regionInfluenceRule.regionOrder) {
      const regionNode = derived.json.nodes[derivedNodes.get(`Knight__region_${region}`)];
      for (const primitive of derived.json.meshes[regionNode.mesh].primitives) {
        const sourceNode = source.json.nodes[sourceNodes.get(primitive.extras.sourceNode)];
        const sourcePrimitive = source.json.meshes[sourceNode.mesh].primitives.find((candidate) =>
          JSON.stringify(candidate.attributes) === JSON.stringify(primitive.attributes) &&
          candidate.material === primitive.material);
        check(sourcePrimitive !== undefined,
          `${region} primitive does not preserve a source vertex/material stream`);
      }
    }
  } catch (error) { failures.push(error.message); }
  return { ok: failures.length === 0, failures, report: expected.report };
}

async function main() {
  const manifest = JSON.parse(await readFile(MANIFEST_PATH, "utf8"));
  const sourcePath = resolve(dirname(MANIFEST_PATH), manifest.source.file);
  const licensePath = resolve(dirname(MANIFEST_PATH), manifest.license.file);
  const glbPath = resolve(ROOT, manifest.derivative.glb);
  const profilePath = resolve(ROOT, manifest.derivative.profile);
  const sourceProfilePath = resolve(ROOT, manifest.derivative.sourceProfile);
  const [sourceBytes, licenseBytes] = await Promise.all([readFile(sourcePath), readFile(licensePath)]);
  if (process.argv.includes("--verify")) {
    const [derivedBytes, profileBytes, sourceProfileBytes] = await Promise.all([
      readFile(glbPath), readFile(profilePath), readFile(sourceProfilePath),
    ]);
    const result = verifyDerivative(sourceBytes, licenseBytes, derivedBytes, profileBytes, manifest);
    if (!profileBytes.equals(sourceProfileBytes)) result.failures.push("source and runtime profiles differ");
    result.ok = result.failures.length === 0;
    if (!result.ok) throw new Error(result.failures.join("\n"));
    console.log(`KayKit Knight verified: ${result.report.sourceTriangleCount} triangles, ` +
      `${Object.keys(result.report.regions).length} regions`);
    return;
  }
  const derived = deriveKayKit(sourceBytes, manifest);
  const profileBytes = Buffer.from(`${JSON.stringify(derived.profile, null, 2)}\n`, "utf8");
  await Promise.all([
    writeFile(glbPath, derived.bytes),
    writeFile(profilePath, profileBytes),
    writeFile(sourceProfilePath, profileBytes),
  ]);
  console.log(JSON.stringify({ glbSha256: sha256(derived.bytes),
    profileSha256: sha256(profileBytes), ...derived.report }, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
