// Checks that `public/assets/warrior.glb` is the right *shape*, in metres.
//
//     node scripts/check-warrior.mjs
//
// This is not a glTF validator and deliberately not one. Structural validity is
// not what can go wrong here: Blender writes the container, and a container it
// cannot write is a build that failed loudly. What can go wrong -- silently, and
// only visibly in a browser nobody is looking at -- is a warrior authored to the
// wrong dimensions. A crown 90 mm too high, a pauldron on the shoulder of the
// study rather than the shoulder of this rig, feet 20 mm off the floor: each of
// those loads perfectly, validates perfectly, and is wrong. So every assertion
// below is a distance, taken against `asset-src/dimensions.json`, which is
// itself written out of `src/config.ts` and `src/figure.ts`.
//
// It reads the `.glb` with nothing but `Buffer` and `JSON.parse`. That is not
// asceticism: the alternative on offer was `gltf-validator`, which is not a
// dependency of this directory and lives only in the repository root's
// `node_modules`, and reaching up into that is exactly what this directory's
// AGENTS.md forbids.

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

const GLB_MAGIC = 0x46546c67;
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;

/** Anything the sword or a shield would be called. Neither may be in here. */
const FORBIDDEN = /sword|shield|blade|hilt|pommel|scabbard|buckler|crossguard/i;

/** How far a joint-cut piece may reach from its own origin, in metres. */
const SEGMENT_SPAN = 0.62;

/** Tolerances, in metres, and each one is a claim about what would be visible. */
const TOLERANCE = {
  /** The joint a piece is cut at. Sub-millimetre: it is an authored constant on
   *  both sides, so anything at all here is an arithmetic mistake, not drift. */
  joint: 0.0005,
  /** Feet on the floor. A boot 2 mm under the ground plane z-fights with it. */
  floor: 0.002,
  /** The crown against `fighter.height`, straight from the plan's acceptance. */
  crown: 0.020,
  /** How far a piece's bounding box may miss the point its primitive stands at
   *  before the two have stopped describing the same piece of a person. */
  anchor: 0.005,
  /** Sideways placement of a pauldron against `fighter.shoulderSide`. A pauldron
   *  is wider than the joint it caps, so this is looser than the others. */
  shoulder: 0.060,
};

/**
 * The glTF chunks, without a dependency.
 *
 * Only the JSON chunk is read. Vertex positions are never touched, because
 * every accessor that carries one is required to carry `min` and `max` as well
 * -- so the bounding box of a mesh is a fact stated in the header rather than
 * something to be recomputed from a buffer, and reading it back from the floats
 * would only test that Blender can add up.
 */
function readGlb(buffer) {
  if (buffer.length < 12) throw new Error("not a glb: shorter than its own header");
  if (buffer.readUInt32LE(0) !== GLB_MAGIC) throw new Error("not a glb: bad magic");
  const version = buffer.readUInt32LE(4);
  if (version !== 2) throw new Error(`glb version ${version}, expected 2`);
  const declared = buffer.readUInt32LE(8);
  if (declared !== buffer.length) {
    throw new Error(`glb header declares ${declared} bytes, file is ${buffer.length}`);
  }

  let offset = 12;
  let json = null;
  let bin = null;
  while (offset + 8 <= buffer.length) {
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

const COMPONENT = {
  5121: { bytes: 1, read: "readUInt8" },
  5123: { bytes: 2, read: "readUInt16LE" },
  5125: { bytes: 4, read: "readUInt32LE" },
  5126: { bytes: 4, read: "readFloatLE" },
};
const WIDTH = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

function accessorValues(json, bin, index) {
  const accessor = json.accessors?.[index];
  const view = json.bufferViews?.[accessor?.bufferView];
  const component = COMPONENT[accessor?.componentType];
  const width = WIDTH[accessor?.type];
  if (!accessor || !view || !component || !width) return null;
  const packed = component.bytes * width;
  const stride = view.byteStride ?? packed;
  const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const rows = [];
  for (let row = 0; row < accessor.count; row += 1) {
    const values = [];
    for (let column = 0; column < width; column += 1) {
      values.push(bin[component.read](start + row * stride + column * component.bytes));
    }
    rows.push(values);
  }
  return rows;
}

function uvSeamCount(positions, uvs, indices) {
  const pointKey = (point) => point.map((value) => value.toFixed(6)).join(",");
  const uvKey = (uv) => uv.map((value) => value.toFixed(6)).join(",");
  const edges = new Map();
  const seams = new Set();
  for (let i = 0; i + 2 < indices.length; i += 3) {
    const triangle = [indices[i][0], indices[i + 1][0], indices[i + 2][0]];
    for (const [one, two] of [[triangle[0], triangle[1]], [triangle[1], triangle[2]], [triangle[2], triangle[0]]]) {
      const endpoints = [[pointKey(positions[one]), uvKey(uvs[one])], [pointKey(positions[two]), uvKey(uvs[two])]]
        .sort(([a], [b]) => a.localeCompare(b));
      const key = `${endpoints[0][0]}|${endpoints[1][0]}`;
      const textureEdge = `${endpoints[0][1]}|${endpoints[1][1]}`;
      const previous = edges.get(key);
      if (previous !== undefined && previous !== textureEdge) seams.add(key);
      else if (previous === undefined) edges.set(key, textureEdge);
    }
  }
  return seams.size;
}

function checkTextureGeometry(json, bin, found, fail) {
  const meshes = json.meshes ?? [];
  const materials = json.materials ?? [];
  for (const node of found) {
    const sourceNode = (json.nodes ?? []).find((candidate) => candidate.name === node.name);
    for (const primitive of meshes[sourceNode?.mesh]?.primitives ?? []) {
      const material = materials[primitive.material]?.name ?? `material${primitive.material}`;
      const positions = json.accessors?.[primitive.attributes?.POSITION];
      const positionValues = accessorValues(json, bin, primitive.attributes?.POSITION);
      const uvIndex = primitive.attributes?.TEXCOORD_0;
      if (uvIndex === undefined) {
        fail(`"${node.name}" textured primitive (${material}) has no TEXCOORD_0`);
        continue;
      }
      const uvs = accessorValues(json, bin, uvIndex);
      const uvAccessor = json.accessors?.[uvIndex];
      if (uvAccessor?.type !== "VEC2" || uvAccessor?.componentType !== 5126 || uvAccessor?.count !== positions?.count) {
        fail(`"${node.name}" textured primitive (${material}) TEXCOORD_0 is not float VEC2 with POSITION count`);
      }
      if (!uvs?.length) {
        fail(`"${node.name}" textured primitive (${material}) has an unreadable TEXCOORD_0`);
        continue;
      }
      if (uvs.some((uv) => uv.some((value) => !Number.isFinite(value) || value < -1e-6 || value > 1 + 1e-6))) {
        fail(`"${node.name}" textured primitive (${material}) has UVs outside finite [0,1] bounds`);
      }
      const indices = primitive.indices === undefined
        ? uvs.map((_, index) => [index])
        : accessorValues(json, bin, primitive.indices);
      const namedSeams = new Set(["head", "helm", "surcoat", "skirt"]);
      if (namedSeams.has(node.name) && uvSeamCount(positionValues ?? [], uvs, indices ?? []) === 0) {
        fail(`"${node.name}" lost its named UV seam boundaries`);
      }
      let degenerate = null;
      for (let i = 0; indices && i + 2 < indices.length; i += 3) {
        const a = uvs[indices[i][0]];
        const b = uvs[indices[i + 1][0]];
        const c = uvs[indices[i + 2][0]];
        if (!a || !b || !c) continue;
        const area = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2;
        if (area <= 1e-8 && !degenerate) degenerate = { triangle: i / 3, uv: [a, b, c] };
      }
      if (degenerate) fail(
        `"${node.name}" textured primitive (${material}) has a zero-area UV triangle ` +
        `${degenerate.triangle} (${degenerate.uv.map((uv) => uv.join(",")).join(" / ")}; positions ` +
        `${indices.slice(degenerate.triangle * 3, degenerate.triangle * 3 + 3).map(([index]) => positionValues[index].join(",")).join(" / ")})`,
      );

      let meshArea = 0;
      let uvArea = 0;
      for (let i = 0; indices && i + 2 < indices.length; i += 3) {
        const ids = [indices[i][0], indices[i + 1][0], indices[i + 2][0]];
        const p = ids.map((index) => positionValues?.[index]);
        const uv = ids.map((index) => uvs[index]);
        if (p.some((value) => !value) || uv.some((value) => !value)) continue;
        const ab = p[1].map((value, axis) => value - p[0][axis]);
        const ac = p[2].map((value, axis) => value - p[0][axis]);
        const cross = [
          ab[1] * ac[2] - ab[2] * ac[1],
          ab[2] * ac[0] - ab[0] * ac[2],
          ab[0] * ac[1] - ab[1] * ac[0],
        ];
        meshArea += Math.hypot(...cross) / 2;
        uvArea += Math.abs(
          (uv[1][0] - uv[0][0]) * (uv[2][1] - uv[0][1]) -
          (uv[1][1] - uv[0][1]) * (uv[2][0] - uv[0][0]),
        ) / 2;
      }
      const density = Math.sqrt(uvArea / meshArea);
      if (!Number.isFinite(density) || density < 0.285 || density > 0.315) {
        fail(`"${node.name}" textured primitive (${material}) has UV density ${density.toFixed(3)}, expected 0.300 +/- 0.015`);
      }

      const tangentIndex = primitive.attributes?.TANGENT;
      const normalMapped = /^(steel|leather|cloth|cloth_surcoat|flesh)$/i.test(material);
      if (normalMapped && tangentIndex === undefined) {
        fail(`"${node.name}" normal-mapped primitive (${material}) has no TANGENT`);
      } else if (!normalMapped && tangentIndex !== undefined) {
        fail(`"${node.name}" primitive (${material}) carries TANGENT without a normal map`);
      } else if (tangentIndex !== undefined) {
        const accessor = json.accessors?.[tangentIndex];
        const tangents = accessorValues(json, bin, tangentIndex);
        if (accessor?.type !== "VEC4" || accessor?.componentType !== 5126 || accessor?.count !== positions?.count) {
          fail(`"${node.name}" normal-mapped primitive (${material}) TANGENT is not float VEC4 with POSITION count`);
        }
        if (!tangents?.length || tangents.some((tangent) =>
          tangent.some((value) => !Number.isFinite(value)) ||
          Math.hypot(tangent[0], tangent[1], tangent[2]) <= 1e-6 ||
          Math.abs(Math.abs(tangent[3]) - 1) > 1e-4)) {
          fail(`"${node.name}" normal-mapped primitive (${material}) has invalid TANGENT values`);
        }
      }
    }
  }
}

function checkMaterialFamilies(json, dimensions, fail) {
  const materials = json.materials ?? [];
  const expected = new Map((dimensions.pieces ?? []).map((piece) => [
    piece.name,
    piece.material === "side" ? "cloth_surcoat" : piece.material,
  ]));
  for (const node of json.nodes ?? []) {
    if (node.mesh === undefined || !expected.has(node.name)) continue;
    const family = expected.get(node.name);
    for (const primitive of json.meshes?.[node.mesh]?.primitives ?? []) {
      const actual = materials[primitive.material]?.name ?? `material${primitive.material}`;
      if (actual !== family) fail(`"${node.name}" uses exported material ${actual}; expected runtime family ${family}`);
    }
  }
  for (const material of materials) {
    const pbr = material.pbrMetallicRoughness ?? {};
    if (pbr.baseColorTexture || pbr.metallicRoughnessTexture || material.normalTexture || material.occlusionTexture) {
      fail(`exported material "${material.name ?? "unnamed"}" carries a texture and would compete with the runtime palette`);
    }
  }
  if ((json.textures?.length ?? 0) || (json.images?.length ?? 0)) {
    fail(`the authored asset embeds ${json.textures?.length ?? 0} texture(s) and ${json.images?.length ?? 0} image(s); runtime owns both`);
  }
}

/**
 * The torso and pelvis are separate bodies now. Sample the real lower garment
 * vertices at all four anatomical posture corners. The old conservative AABB
 * invented combinations no vertex occupied and forced a visible hoop around
 * the waist; checking the actual seam keeps the proof without redesigning the
 * donor silhouette around empty space.
 */
function checkWaistEnvelope(json, bin, found, dimensions, fail) {
  const byName = new Map(found.map((node) => [node.name, node]));
  const torso = [byName.get("belly"), byName.get("surcoat")].filter(Boolean);
  const skirt = byName.get("skirt");
  if (torso.length !== 2 || !skirt) return;
  const waist = dimensions.body.waist;
  const nodes = json.nodes ?? [];
  const meshes = json.meshes ?? [];
  const seam = [];
  for (const node of torso) {
    const source = nodes[node.index];
    for (const primitive of meshes[source.mesh]?.primitives ?? []) {
      for (const point of accessorValues(json, bin, primitive.attributes?.POSITION) ?? []) {
        const world = [
          node.origin[0] - point[0],
          node.origin[1] + point[1],
          node.origin[2] + point[2],
        ];
        if (world[1] <= node.min[1] + 0.035) seam.push(world);
      }
    }
  }
  if (!seam.length) {
    fail("the torso has no readable waist-seam vertices");
    return;
  }
  const epsilon = 0.001;
  for (const lean of [-dimensions.body.trunkLeanMax, dimensions.body.trunkLeanMax]) {
    for (const twist of [-dimensions.body.trunkTwistMax, dimensions.body.trunkTwistMax]) {
      const cl = Math.cos(lean), sl = Math.sin(lean);
      const ct = Math.cos(twist), st = Math.sin(twist);
      for (const [x, sourceY, z] of seam) {
        const yawX = x * ct + z * st;
        const yawZ = -x * st + z * ct;
        const dy = sourceY - waist;
        const point = [yawX, waist + dy * cl - yawZ * sl, dy * sl + yawZ * cl];
        if (point.some((value, axis) => value < skirt.min[axis] - epsilon || value > skirt.max[axis] + epsilon)) {
          fail(
            `waist seam opens at lean ${lean.toFixed(2)}, twist ${twist.toFixed(2)}: ` +
            `torso corner ${point.map((value) => value.toFixed(3)).join(",")} leaves skirt envelope ` +
            `${skirt.min.map((value) => value.toFixed(3)).join(",")}..${skirt.max.map((value) => value.toFixed(3)).join(",")}`,
          );
          return;
        }
      }
    }
  }
}

function checkGeometryReachability(json, bin, fail) {
  const reachableNodes = new Set();
  const reachableMeshes = new Set();
  const visit = (index) => {
    if (reachableNodes.has(index)) return;
    reachableNodes.add(index);
    const node = json.nodes?.[index];
    if (!node) return;
    if (node.mesh !== undefined) reachableMeshes.add(node.mesh);
    for (const child of node.children ?? []) visit(child);
  };
  const scene = json.scenes?.[json.scene ?? 0];
  for (const root of scene?.nodes ?? []) visit(root);

  const usedAccessors = new Set();
  const tangentAccessors = new Set();
  for (const [meshIndex, mesh] of (json.meshes ?? []).entries()) {
    if (!reachableMeshes.has(meshIndex)) {
      fail(`mesh ${meshIndex} (${mesh.name ?? "unnamed"}) is dead payload`);
      continue;
    }
    for (const primitive of mesh.primitives ?? []) {
      for (const [semantic, index] of Object.entries(primitive.attributes ?? {})) {
        usedAccessors.add(index);
        if (semantic === "TANGENT") tangentAccessors.add(index);
      }
      if (primitive.indices !== undefined) usedAccessors.add(primitive.indices);
    }
  }
  for (let index = 0; index < (json.accessors ?? []).length; index += 1) {
    const accessor = json.accessors[index];
    if (!usedAccessors.has(index)) fail(`accessor ${index} (${accessor.type ?? "unknown"}) is dead payload`);
    if (accessor.type === "VEC4" && accessor.componentType === 5126 && !tangentAccessors.has(index)) {
      fail(`float VEC4 accessor ${index} carries dead tangent payload`);
    }
  }

  const usedViews = new Set();
  for (const index of usedAccessors) {
    const accessor = json.accessors?.[index];
    if (accessor?.bufferView !== undefined) usedViews.add(accessor.bufferView);
  }
  for (const image of json.images ?? []) {
    if (image.bufferView !== undefined) usedViews.add(image.bufferView);
  }
  for (let index = 0; index < (json.bufferViews ?? []).length; index += 1) {
    if (!usedViews.has(index)) fail(`bufferView ${index} is dead binary payload`);
  }
  const logicalBytes = json.buffers?.[0]?.byteLength;
  const end = Math.max(0, ...(json.bufferViews ?? []).map((view) => (view.byteOffset ?? 0) + view.byteLength));
  if (logicalBytes !== end || bin.length - logicalBytes < 0 || bin.length - logicalBytes > 3) {
    fail(`binary payload is ${logicalBytes} logical bytes with last live byte ${end} and chunk ${bin.length}`);
  }
}

// These are not a triangle budget. They prove that the selected modular donor
// is still present in the pieces whose primitive fallbacks have the same names.
// A lower number is allowed only when the adaptation itself is deliberately
// changed and visually re-reviewed.
const AUTHORED_TRIANGLE_FLOORS = {
  belly: 1700,
  footL: 1000,
  footR: 1000,
  forearmL: 2500,
  forearmR: 2500,
  helm: 1800,
  pauldronL: 1500,
  pauldronR: 1500,
  shinL: 4000,
  shinR: 4000,
  skirt: 550,
  surcoat: 2000,
  thighL: 250,
  thighR: 250,
  upperArmL: 500,
  upperArmR: 500,
};

function checkAuthoredGeometry(json, found, fail) {
  for (const node of found) {
    const floor = AUTHORED_TRIANGLE_FLOORS[node.name];
    if (floor === undefined) continue;
    const source = json.nodes?.[node.index];
    const triangles = (json.meshes?.[source?.mesh]?.primitives ?? []).reduce((sum, primitive) => {
      const accessor = primitive.indices === undefined
        ? json.accessors?.[primitive.attributes?.POSITION]
        : json.accessors?.[primitive.indices];
      return sum + (accessor?.count ?? 0) / 3;
    }, 0);
    if (triangles < floor) {
      fail(`"${node.name}" has ${triangles} triangles; the authored Ranger adaptation requires at least ${floor}`);
    }
  }
}

const identityRotation = (r) =>
  !r || (Math.abs(r[0]) < 1e-6 && Math.abs(r[1]) < 1e-6 && Math.abs(r[2]) < 1e-6 && Math.abs(Math.abs(r[3]) - 1) < 1e-6);

const unitScale = (s) => !s || s.every((v) => Math.abs(v - 1) < 1e-6);

/**
 * Every mesh-bearing node, with its bounds in the fighter's own upright frame.
 *
 * glTF is Y-up and right-handed, with a model conventionally facing +Z and its
 * own left on +X; this rig is Y-up and left-handed with +Z the way the fighter
 * faces and its right on +X. One axis therefore flips, and it is X -- which is
 * also the conversion Babylon's loader performs, so this walk and the browser
 * agree by construction rather than by coincidence. Getting it wrong would put a
 * nose on the back of a head, which is why the anchor assertion below is taken
 * in all three axes rather than in the height alone.
 */
function collectNodes(json) {
  const nodes = json.nodes ?? [];
  const meshes = json.meshes ?? [];
  const accessors = json.accessors ?? [];
  const found = [];
  let triangles = 0;

  const walk = (index, parentOffset, depth) => {
    const node = nodes[index];
    if (!node) throw new Error(`node ${index} is referenced and absent`);
    if (!identityRotation(node.rotation)) {
      throw new Error(`node "${node.name}" carries a rotation; its origin is then not its joint`);
    }
    if (!unitScale(node.scale)) {
      throw new Error(`node "${node.name}" carries a scale; the export did not apply it`);
    }
    const t = node.translation ?? [0, 0, 0];
    const origin = [parentOffset[0] - t[0], parentOffset[1] + t[1], parentOffset[2] + t[2]];

    if (node.mesh !== undefined) {
      const min = [Infinity, Infinity, Infinity];
      const max = [-Infinity, -Infinity, -Infinity];
      for (const primitive of meshes[node.mesh].primitives ?? []) {
        const accessor = accessors[primitive.attributes?.POSITION];
        if (!accessor?.min || !accessor?.max) {
          throw new Error(`node "${node.name}" has a POSITION accessor with no bounds`);
        }
        // Flip X, then re-sort: a negated interval arrives back to front.
        const lo = [-accessor.max[0], accessor.min[1], accessor.min[2]];
        const hi = [-accessor.min[0], accessor.max[1], accessor.max[2]];
        for (let axis = 0; axis < 3; axis += 1) {
          min[axis] = Math.min(min[axis], lo[axis]);
          max[axis] = Math.max(max[axis], hi[axis]);
        }
        if (primitive.indices !== undefined) triangles += accessors[primitive.indices].count / 3;
      }
      found.push({
        name: node.name ?? `node${index}`,
        index,
        origin,
        depth,
        min: min.map((v, axis) => v + origin[axis]),
        max: max.map((v, axis) => v + origin[axis]),
        local: { min, max },
      });
    }
    for (const child of node.children ?? []) walk(child, origin, depth + 1);
  };

  const scene = json.scenes?.[json.scene ?? 0];
  if (!scene) throw new Error("glb declares no scene");
  for (const root of scene.nodes ?? []) walk(root, [0, 0, 0], 0);
  return { found, triangles };
}

const near = (a, b, tolerance) => Math.abs(a - b) <= tolerance;

/**
 * The whole check, as a list of sentences that are true or are not.
 *
 * Returned rather than printed, and the failures are named rather than counted,
 * because a checker that prints and exits cannot be asked what it found.
 */
export function checkWarrior(buffer, dimensions) {
  const failures = [];
  const notes = [];
  const fail = (sentence) => failures.push(sentence);

  const { json, bin } = readGlb(buffer);
  const { found, triangles } = collectNodes(json);
  checkMaterialFamilies(json, dimensions, fail);
  checkTextureGeometry(json, bin, found, fail);
  checkGeometryReachability(json, bin, fail);
  checkAuthoredGeometry(json, found, fail);
  checkWaistEnvelope(json, bin, found, dimensions, fail);

  // ---- nothing that decides a hit ----
  if (json.skins?.length) fail(`the asset carries ${json.skins.length} skin(s); this rig is the skeleton`);
  if (json.animations?.length) fail(`the asset carries ${json.animations.length} animation(s); the solver poses this figure`);
  if (json.cameras?.length) fail(`the asset carries ${json.cameras.length} camera(s)`);
  const names = [
    ...(json.nodes ?? []).map((n) => n.name ?? ""),
    ...(json.meshes ?? []).map((m) => m.name ?? ""),
    ...(json.materials ?? []).map((m) => m.name ?? ""),
  ];
  for (const name of names) {
    if (FORBIDDEN.test(name)) fail(`"${name}" is a weapon or a shield; both are physics, not costume`);
  }

  // ---- exactly the pieces `figure.ts` dresses, and no others ----
  const expected = new Map(dimensions.pieces.map((piece) => [piece.name, piece]));
  const counts = new Map();
  for (const node of found) counts.set(node.name, (counts.get(node.name) ?? 0) + 1);
  for (const [name, count] of counts) {
    if (count > 1) fail(`piece name "${name}" occurs ${count} times; runtime wear would be ambiguous`);
  }
  const actual = new Map(found.map((node) => [node.name, node]));
  for (const name of expected.keys()) {
    if (!actual.has(name)) fail(`piece "${name}" is missing; figure.ts will fall back to its primitive`);
  }
  for (const name of actual.keys()) {
    if (!expected.has(name)) fail(`"${name}" is in the asset and is not a piece figure.ts dresses`);
  }

  // ---- every piece cut at its own joint, and reaching no further than a limb ----
  for (const piece of dimensions.pieces) {
    const node = actual.get(piece.name);
    if (!node) continue;
    const joint = dimensions.bones[piece.bone].joint;
    for (const [axis, label] of [[0, "x"], [1, "y"], [2, "z"]]) {
      if (!near(node.origin[axis], joint[axis], TOLERANCE.joint)) {
        fail(
          `"${piece.name}" is cut at ${label}=${node.origin[axis].toFixed(4)}, ` +
            `and the ${piece.bone} joint is at ${label}=${joint[axis].toFixed(4)}`,
        );
      }
    }
    const reach = Math.max(
      ...node.local.min.map(Math.abs),
      ...node.local.max.map(Math.abs),
    );
    if (reach > SEGMENT_SPAN) {
      fail(`"${piece.name}" reaches ${reach.toFixed(3)} m from its joint; a segment does not`);
    }
    // The primitive's anchor is where `figure.ts` draws the stand-in. The
    // authored piece is free to be a different shape and is not free to be
    // somewhere else, or `G` would move the figure as well as undress it.
    for (const [axis, label] of [[0, "x"], [1, "y"], [2, "z"]]) {
      const at = piece.at[axis];
      if (at < node.min[axis] - TOLERANCE.anchor || at > node.max[axis] + TOLERANCE.anchor) {
        fail(
          `"${piece.name}" spans ${label} ${node.min[axis].toFixed(3)}..${node.max[axis].toFixed(3)} ` +
            `and does not cover its primitive's anchor at ${label}=${at.toFixed(3)}`,
        );
      }
    }
  }

  // ---- the three measurements the plan accepts the figure on ----
  const floor = Math.min(...found.map((node) => node.min[1]));
  const crown = Math.max(...found.map((node) => node.max[1]));
  if (!near(floor, 0, TOLERANCE.floor)) {
    fail(`the lowest point of the figure is ${(floor * 1000).toFixed(1)} mm, not on the floor`);
  }
  if (!near(crown, dimensions.fighter.height, TOLERANCE.crown)) {
    fail(
      `the crown is at ${crown.toFixed(3)} m and fighter.height is ` +
        `${dimensions.fighter.height.toFixed(3)} m`,
    );
  }
  for (const boot of ["footL", "footR"]) {
    const node = actual.get(boot);
    if (node && !near(node.min[1], 0, TOLERANCE.floor)) {
      fail(`"${boot}" sits at ${(node.min[1] * 1000).toFixed(1)} mm rather than on the floor`);
    }
  }

  const shoulder = [
    ["pauldronL", -dimensions.fighter.shoulderSide],
    ["pauldronR", dimensions.fighter.shoulderSide],
  ];
  for (const [name, x] of shoulder) {
    const node = actual.get(name);
    if (!node) continue;
    const centre = (node.min[0] + node.max[0]) / 2;
    if (!near(centre, x, TOLERANCE.shoulder)) {
      fail(`"${name}" is centred at x=${centre.toFixed(3)} and the shoulder is at x=${x.toFixed(3)}`);
    }
    const point = [x, dimensions.fighter.shoulderHeight, dimensions.fighter.shoulderFront];
    const covers = point.every((v, axis) => v >= node.min[axis] && v <= node.max[axis]);
    if (!covers) fail(`"${name}" does not cover the shoulder joint it is supposed to cap`);
  }

  notes.push(`nodes with geometry: ${found.length}`);
  notes.push(`triangles: ${triangles}`);
  notes.push(`binary chunk: ${(bin.length / 1024).toFixed(1)} KB of ${(buffer.length / 1024).toFixed(1)} KB`);
  notes.push(`floor ${(floor * 1000).toFixed(1)} mm, crown ${crown.toFixed(3)} m (height ${dimensions.fighter.height})`);
  notes.push(`sha256 ${createHash("sha256").update(buffer).digest("hex")}`);

  return { ok: failures.length === 0, failures, notes, triangles, crown, floor };
}

/** A table of what every piece measures, for a person deciding whether it looks right. */
export function measurements(buffer, dimensions) {
  const { json } = readGlb(buffer);
  const { found } = collectNodes(json);
  const rows = [];
  for (const piece of dimensions.pieces) {
    const node = found.find((candidate) => candidate.name === piece.name);
    if (!node) {
      rows.push(`${piece.name.padEnd(10)} absent`);
      continue;
    }
    const span = (axis) => `${node.min[axis].toFixed(3)}..${node.max[axis].toFixed(3)}`;
    rows.push(
      `${piece.name.padEnd(10)} ${piece.bone.padEnd(12)} ` +
        `x ${span(0).padEnd(15)} y ${span(1).padEnd(15)} z ${span(2)}`,
    );
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
  if (process.argv.includes("--table")) for (const row of measurements(buffer, dimensions)) console.log(row);
  for (const note of result.notes) console.log(`  ${note}`);
  for (const failure of result.failures) console.error(`FAIL ${failure}`);
  console.log(result.ok ? "warrior.glb fits the rig." : `${result.failures.length} dimensional failures.`);
  process.exit(result.ok ? 0 : 1);
}

// `pathToFileURL` rather than string surgery: on Windows `process.argv[1]` is a
// drive path and the hand-built `file://` form is one slash short of the one
// `import.meta.url` reports, so the comparison silently never fires and the
// script exits successfully having checked nothing.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
