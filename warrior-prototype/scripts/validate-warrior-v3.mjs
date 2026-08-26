import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { validateBytes } from "gltf-validator";

const argv = process.argv.slice(2);
const explicit = argv.find(value => !value.startsWith("--"));
const contract = JSON.parse(await readFile(new URL("../asset-src/v3/warrior-v3.contract.json", import.meta.url), "utf8"));
const assetUrl = explicit
  ? new URL(`../${explicit}`, import.meta.url)
  : new URL("../public/assets/warrior-v3.glb", import.meta.url);

const bytes = await readFile(assetUrl);
assert.equal(bytes.subarray(0, 4).toString("ascii"), "glTF", "v3 asset is not binary glTF");
assert.ok(bytes.byteLength <= contract.maximumGlbBytes, "v3 GLB exceeds payload contract");
const report = await validateBytes(new Uint8Array(bytes), { uri: "warrior-v3.glb", maxIssues: 200 });
assert.equal(report.issues.numErrors, 0, JSON.stringify(report.issues.messages, null, 2));
assert.equal(report.issues.numWarnings, 0, JSON.stringify(report.issues.messages, null, 2));
assert.ok(report.info.totalTriangleCount <= contract.maximumTriangles, "v3 triangle budget exceeded");

const jsonLength = bytes.readUInt32LE(12);
assert.equal(bytes.readUInt32LE(16), 0x4e4f534a, "first GLB chunk is not JSON");
const gltf = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString("utf8").trim());
const nodes = gltf.nodes ?? [];

const rootNode = nodes.find(node => node.name === contract.requiredRoot);
assert.ok(rootNode, `missing required root node ${contract.requiredRoot}`);
assert.equal(rootNode.extras?.warrior_contract, "authored-v3-schema-1", "root does not publish the v3 contract");
const variant = rootNode.extras?.warrior_variant;
assert.ok(contract.variants.includes(variant), `root publishes unknown variant ${variant}`);

const regions = new Set();
const materialClasses = new Set();
const authored = new Set();
const sockets = new Set();
for (const node of nodes) {
  const extras = node.extras ?? {};
  if (extras.warrior_region) regions.add(extras.warrior_region);
  if (extras.warrior_material_class) materialClasses.add(extras.warrior_material_class);
  if (extras.warrior_socket) sockets.add(extras.warrior_socket);
  if (node.mesh !== undefined && extras.authored_subsystem === contract.authoredSubsystem) {
    authored.add(node.name);
  }
}
for (const region of contract.requiredRegions) assert.ok(regions.has(region), `missing region ${region}`);
for (const value of contract.requiredMaterialClasses) assert.ok(materialClasses.has(value), `missing material class ${value}`);
for (const socket of contract.requiredSockets) assert.ok(sockets.has(socket), `missing socket ${socket}`);
for (const name of contract.requiredAuthoredNodes) assert.ok(authored.has(name), `missing authored node ${name}`);

const meshNames = new Set(nodes.filter(node => node.mesh !== undefined).map(node => node.name));
for (const retired of contract.retiredControlNodes) {
  assert.ok(!meshNames.has(retired), `retired control node ${retired} is still exported`);
}
for (const node of nodes) {
  if (node.mesh === undefined) continue;
  assert.ok(node.extras?.warrior_region, `mesh node ${node.name} has no warrior_region`);
  assert.ok(node.extras?.warrior_material_class, `mesh node ${node.name} has no warrior_material_class`);
}

const materialNames = new Set((gltf.materials ?? []).map(material => material.name));
for (const slot of contract.requiredMaterialSlots) assert.ok(materialNames.has(slot), `missing material slot ${slot}`);

const primitives = (gltf.meshes ?? []).flatMap(mesh => mesh.primitives ?? []);
assert.ok(primitives.length > 0, "v3 GLB exports no primitives");
assert.ok(primitives.every(primitive => primitive.attributes.POSITION !== undefined), "mesh lacks POSITION");
assert.ok(primitives.every(primitive => primitive.attributes.NORMAL !== undefined), "mesh lacks NORMAL");
assert.ok(primitives.every(primitive => primitive.attributes.TEXCOORD_0 !== undefined), "mesh lacks UVs");
assert.ok(primitives.some(primitive => primitive.attributes.TANGENT !== undefined), "no exported tangents");

// Bounds are checked in export space by composing every node transform down the
// scene graph, so an authored plate cannot quietly grow past the review frame.
const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const multiply = (a, b) => {
  const out = new Array(16).fill(0);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      for (let index = 0; index < 4; index += 1) {
        out[column * 4 + row] += a[index * 4 + row] * b[column * 4 + index];
      }
    }
  }
  return out;
};
const localMatrix = (node) => {
  if (node.matrix) return node.matrix;
  const [tx, ty, tz] = node.translation ?? [0, 0, 0];
  const [qx, qy, qz, qw] = node.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = node.scale ?? [1, 1, 1];
  const rotation = [
    1 - 2 * (qy * qy + qz * qz), 2 * (qx * qy + qz * qw), 2 * (qx * qz - qy * qw),
    2 * (qx * qy - qz * qw), 1 - 2 * (qx * qx + qz * qz), 2 * (qy * qz + qx * qw),
    2 * (qx * qz + qy * qw), 2 * (qy * qz - qx * qw), 1 - 2 * (qx * qx + qy * qy),
  ];
  return [
    rotation[0] * sx, rotation[1] * sx, rotation[2] * sx, 0,
    rotation[3] * sy, rotation[4] * sy, rotation[5] * sy, 0,
    rotation[6] * sz, rotation[7] * sz, rotation[8] * sz, 0,
    tx, ty, tz, 1,
  ];
};
const apply = (matrix, point) => [0, 1, 2].map(row =>
  matrix[row] * point[0] + matrix[4 + row] * point[1] + matrix[8 + row] * point[2] + matrix[12 + row]);

const minimum = [Infinity, Infinity, Infinity];
const maximum = [-Infinity, -Infinity, -Infinity];
const visit = (index, parent) => {
  const node = nodes[index];
  const world = multiply(parent, localMatrix(node));
  if (node.mesh !== undefined) {
    for (const primitive of gltf.meshes[node.mesh].primitives ?? []) {
      const accessor = gltf.accessors[primitive.attributes.POSITION];
      assert.ok(accessor.min && accessor.max, "POSITION accessor has no bounds");
      for (let corner = 0; corner < 8; corner += 1) {
        const point = [0, 1, 2].map(axis => (corner >> axis) & 1 ? accessor.max[axis] : accessor.min[axis]);
        const world_point = apply(world, point);
        for (let axis = 0; axis < 3; axis += 1) {
          minimum[axis] = Math.min(minimum[axis], world_point[axis]);
          maximum[axis] = Math.max(maximum[axis], world_point[axis]);
        }
      }
    }
  }
  for (const child of node.children ?? []) visit(child, world);
};
for (const index of gltf.scenes[gltf.scene ?? 0].nodes) visit(index, identity);
for (let axis = 0; axis < 3; axis += 1) {
  assert.ok(minimum[axis] >= contract.bounds.minimum[axis] - 1e-6,
    `axis ${axis} reaches ${minimum[axis].toFixed(4)}, below the contract floor ${contract.bounds.minimum[axis]}`);
  assert.ok(maximum[axis] <= contract.bounds.maximum[axis] + 1e-6,
    `axis ${axis} reaches ${maximum[axis].toFixed(4)}, above the contract ceiling ${contract.bounds.maximum[axis]}`);
}

// The Blender side records what only the authoring session can see: whether the
// authored plates closed into manifolds and kept their UV islands.
const topologyUrl = new URL(`../.review/v3/${variant}/topology.json`, import.meta.url);
let topology = null;
if (existsSync(topologyUrl)) {
  topology = JSON.parse(await readFile(topologyUrl, "utf8"));
  assert.equal(topology.nonManifoldEdges, 0, "an authored plate did not close into a manifold");
  assert.equal(topology.looseVertices, 0, "an authored plate left loose vertices");
  assert.equal(topology.meshesWithoutUv, 0, "a mesh reached export without UVs");
}

const authoredParts = topology ? topology.parts.filter(part => part.authored).length : authored.size;
const envelope = `${minimum.map(value => value.toFixed(3)).join(",")} to ${maximum.map(value => value.toFixed(3)).join(",")}`;
console.log(`warrior-v3.glb [${variant}]: ${bytes.byteLength.toLocaleString()} bytes, `
  + `${report.info.totalTriangleCount.toLocaleString()} triangles, ${regions.size} regions, `
  + `${authoredParts} authored parts, ${sockets.size} sockets, bounds ${envelope}, `
  + `zero validator issues`);
