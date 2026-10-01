/**
 * The crypt's kit as it is exported (`public/assets/crypt-kit/kit.glb`), and what a generated crypt asks of it.
 *
 * A node of the kit is named `<piece>__<material>`. A plan places a piece whole, where its origin stands
 * (`assembleCryptKit`, `src/dungeon/crypt-kit.ts`), so a node carries no transform of its own, and its geometry
 * lies inside what the plan allots its piece: a furnishing's obstacle, a wall's cells, a slab's cells.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CRYPT_FURNITURE } from "../src/dungeon/crypt-archetypes.ts";
import { generateCryptDungeon } from "../src/dungeon/crypt-dungeon.ts";
import { CRYPT_PAVING } from "../src/dungeon/crypt-plan.ts";

/** glTF's component types for a float and for an unsigned byte. */
const FLOAT = 5126, UNSIGNED_BYTE = 5121;
const WIDTH = { VEC2: 2, VEC3: 3, VEC4: 4 };
/** How far an exported coordinate may stand outside its bound, m: the export's rounding. */
const SLACK = 0.001;
/** How far a normal's length may be from one. */
const UNIT_SLACK = 0.001;
/** How far a slab's relief may stand above the floor and reach below it, m. */
const RELIEF = { above: 0.01, below: 0.07 };
/** The most triangles a generated crypt may place, measured over these seeds (docs/art/crypt.md, Random Crypt). */
const TRIANGLE_BUDGET = 420000;

/**
 * The kit: its nodes, each with its piece and its primitives, and a reader of an accessor's rows. A float is read
 * as it is and a normalized byte as a share of one.
 */
function readKit() {
  const bytes = readFileSync(new URL("../public/assets/crypt-kit/kit.glb", import.meta.url));
  const jsonLength = bytes.readUInt32LE(12), json = JSON.parse(bytes.subarray(20, 20 + jsonLength));
  const binary = 20 + jsonLength + 8;
  const rows = (index) => {
    const accessor = json.accessors[index], view = json.bufferViews[accessor.bufferView], width = WIDTH[accessor.type];
    assert.ok([FLOAT, UNSIGNED_BYTE].includes(accessor.componentType), `accessor ${index} is a float or a byte`);
    const float = accessor.componentType === FLOAT, size = float ? 4 : 1;
    const start = binary + (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0), stride = view.byteStride ?? width * size;
    return Array.from({ length: accessor.count }, (_, row) => Array.from({ length: width }, (_, column) => {
      const at = start + row * stride + column * size;
      return float ? bytes.readFloatLE(at) : bytes.readUInt8(at) / 255;
    }));
  };
  const nodes = json.nodes.map((node) => ({
    name: node.name,
    piece: node.name.split("__")[0],
    transform: ["translation", "rotation", "scale", "matrix"].filter((field) => node[field] !== undefined),
    primitives: json.meshes[node.mesh].primitives.map((primitive) => {
      const position = json.accessors[primitive.attributes.POSITION];
      return { attributes: primitive.attributes, min: position.min, max: position.max };
    }),
  }));
  return { nodes, rows };
}

/** Where the box from `min` to `max` leaves the box from `least` to `most`, as a list of faults; none when it fits. */
function outside({ min, max }, least, most) {
  return ["x", "y", "z"].flatMap((axis, i) => [
    ...(min[i] < least[i] - SLACK ? [`${axis} reaches ${min[i]}, below ${least[i]}`] : []),
    ...(max[i] > most[i] + SLACK ? [`${axis} reaches ${max[i]}, above ${most[i]}`] : []),
  ]);
}

/** The faults of every primitive of the nodes `chosen` takes, against the box `boxOf` gives each, by node name. */
function faultsOf(kit, chosen, boxOf) {
  return kit.nodes.filter(chosen).flatMap((node) => {
    const [least, most] = boxOf(node);
    return node.primitives.flatMap((primitive) => outside(primitive, least, most).map((fault) => `${node.name}: ${fault}`));
  });
}

const piecesOf = (kit, chosen) => [...new Set(kit.nodes.filter(chosen).map((node) => node.piece))].sort();
const millimetres = (values) => values.map((value) => Math.round(value * 1000) / 1000 + 0);

test("the box check finds a box that leaves its bound, on the side it leaves by", () => {
  const unit = [[-1, 0, -1], [1, 2, 1]];
  assert.deepEqual(outside({ min: [-1, 0, -1], max: [1, 2, 1] }, ...unit), [], "a box that fills its bound fits");
  assert.deepEqual(outside({ min: [-1.0005, 0, -1], max: [1, 2, 1.0005] }, ...unit), [], "the export's rounding fits");
  assert.deepEqual(outside({ min: [-1.01, 0, -1], max: [1, 2.5, 1] }, ...unit),
    ["x reaches -1.01, below -1", "y reaches 2.5, above 2"], "a box that leaves by two sides has two faults");
});

test("a kit node carries no transform of its own", () => {
  const kit = readKit();
  assert.equal(kit.nodes.length, 49, "the kit has 49 nodes");
  assert.deepEqual(kit.nodes.filter((node) => node.transform.length).map((node) => `${node.name}: ${node.transform}`), [],
    "no node has a translation, rotation, scale or matrix");
});

test("the kit's normals are unit, its colours shares of one and its texture coordinates finite", () => {
  const kit = readKit();
  const unit = (normal) => Math.abs(Math.hypot(...normal) - 1) < UNIT_SLACK;
  const share = (colour) => colour.every((value) => value >= 0 && value <= 1);
  const finite = (uv) => uv.every(Number.isFinite);
  assert.deepEqual([unit([0, 0.6, 0.8]), unit([0, 0.6, 0.7]), share([0, 0.5, 1]), share([0, 1.2, 1]), finite([0, 3]), finite([0, NaN])],
    [true, false, true, false, true, false], "each check passes a good row and refuses a bad one");
  /** The nodes with a row of `attribute` that `good` refuses, each with how many. */
  const refused = (attribute, good) => kit.nodes.flatMap((node) => {
    const bad = node.primitives.flatMap((primitive) => kit.rows(primitive.attributes[attribute])).filter((row) => !good(row));
    return bad.length ? [`${node.name}: ${bad.length}`] : [];
  });
  assert.deepEqual(refused("NORMAL", unit), [], "every normal is of unit length");
  assert.deepEqual(refused("COLOR_0", share), [], "every colour's channels are between 0 and 1");
  assert.deepEqual(refused("TEXCOORD_0", finite), [], "every texture coordinate is finite");
});

test("a furnishing's mesh stays inside the obstacle the plan gives it, and the tomb fills its own", () => {
  const kit = readKit(), furnishing = (node) => node.piece in CRYPT_FURNITURE;
  const boxOf = (node) => {
    const [width, depth, height] = CRYPT_FURNITURE[node.piece];
    return [[-width / 2, 0, -depth / 2], [width / 2, height, depth / 2]];
  };
  assert.deepEqual(piecesOf(kit, furnishing), Object.keys(CRYPT_FURNITURE).sort(), "the kit has every furnishing");
  assert.deepEqual(faultsOf(kit, furnishing, boxOf), [], "no furnishing reaches outside its obstacle");
  const tomb = kit.nodes.find((node) => node.name === "tomb__tomb"), [least, most] = boxOf(tomb);
  assert.deepEqual(tomb.primitives.map((primitive) => [millimetres(primitive.min), millimetres(primitive.max)]),
    [[millimetres(least), millimetres(most)]], "the tomb's one mesh reaches each face of its obstacle");
});

test("a wall piece stays within its cells along the wall, and within its rock through it", () => {
  const kit = readKit();
  const walling = (node) => node.piece.startsWith("wall") || node.piece.startsWith("corner-") || node.piece === "niche";
  // A niche spans three cells of wall and every other piece one; the rock behind a wall face is one cell deep.
  const boxOf = (node) => {
    const half = node.piece === "niche" ? 1.5 : 0.5;
    return [[-half, -Infinity, -0.5], [half, Infinity, 0.5]];
  };
  assert.deepEqual(piecesOf(kit, walling), ["corner-left", "corner-right", "niche", "wall", "wall-panel", "wall-pier", "wall-repair"],
    "the kit has every wall piece");
  assert.deepEqual(faultsOf(kit, walling, boxOf), [], "no wall piece crosses out of its cells or its rock");
});

test("a paving piece lies within the cells of its slab, and its relief is shallow", () => {
  const kit = readKit(), paving = (node) => node.piece in CRYPT_PAVING;
  const boxOf = (node) => {
    const [width, depth] = CRYPT_PAVING[node.piece];
    return [[-width / 2, -RELIEF.below, -depth / 2], [width / 2, RELIEF.above, depth / 2]];
  };
  assert.deepEqual(piecesOf(kit, paving), Object.keys(CRYPT_PAVING).sort(), "the kit has every paving piece");
  assert.deepEqual(faultsOf(kit, paving, boxOf), [], "no paving piece leaves its slab or stands proud of the floor");
});

test("a generated crypt places only pieces the kit has, within the triangle budget", () => {
  const manifest = JSON.parse(readFileSync(new URL("../assets/crypt-kit/manifest.json", import.meta.url)));
  const trianglesOf = new Map();
  for (const [name, part] of Object.entries(manifest.pieces)) {
    const piece = name.split("__")[0];
    trianglesOf.set(piece, (trianglesOf.get(piece) ?? 0) + part.triangles);
  }
  const unknown = new Set(), over = [];
  for (let seed = 0; seed < 100; seed++) {
    let triangles = 0;
    for (const placement of generateCryptDungeon(seed).placements) {
      if (!trianglesOf.has(placement.piece)) unknown.add(placement.piece);
      triangles += trianglesOf.get(placement.piece) ?? 0;
    }
    if (triangles > TRIANGLE_BUDGET) over.push(`seed ${seed}: ${triangles}`);
  }
  assert.deepEqual([...unknown], [], "every placed piece is one the kit has");
  assert.deepEqual(over, [], `no crypt of seeds 0 to 99 places more than ${TRIANGLE_BUDGET} triangles`);
});
