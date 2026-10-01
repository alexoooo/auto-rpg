/**
 * The Random Crypt's detail: its paving, what its furniture blocks, what the scenery remembers
 * (`revealScenery`, `src/dungeon/scenery-visibility.ts`), how the fog reads at the edge of the known
 * (`fogMask`, `fogSample`, `src/dungeon/fog.ts`) and the outline about an enemy under the pointer (`EnemyHover`).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { generateCryptDungeon } from "../src/dungeon/crypt-dungeon.ts";
import { CRYPT_PAVING } from "../src/dungeon/crypt-plan.ts";
import { FOG, fogMask, fogSample } from "../src/dungeon/fog.ts";
import { EnemyHover } from "../src/dungeon/hover.ts";
import { canSee, walkable } from "../src/dungeon/map.ts";
import { revealScenery } from "../src/dungeon/scenery-visibility.ts";
import { headlessScene } from "./harness/scene.mjs";

/** The crypt a player reported unpaved cells in, and thirty more. */
const REPORTED_SEED = 2124530852;
const PAVING_SEEDS = [REPORTED_SEED, ...Array.from({ length: 30 }, (_, seed) => seed)];
/** Where nobody sees the room below from: farther than the scenery's reach from every cell of it. */
const FAR_AWAY = { x: 100, z: 100 };

/** A map of one room: floor from 1 to 9 each way in an 11 by 11 grid, with no doors and no furniture. */
function room() {
  const size = 11, floor = new Uint8Array(size * size);
  for (let z = 1; z < 10; z++) for (let x = 1; x < 10; x++) floor[z * size + x] = 1;
  return { size, floor, rooms: [{ id: 0, min: { x: 1, z: 1 }, max: { x: 9, z: 9 }, centre: { x: 5, z: 5 } }], doors: [], obstacles: [], start: { x: 1, z: 1 } };
}
const cell = (map, x, z) => z * map.size + x;
/** Every floor cell of `map` but `unseen`: a room explored all round some cells. */
const exploredBut = (map, unseen) => new Set([...map.floor.keys()].filter((key) => map.floor[key] && !unseen.includes(key)));

test("the paving covers every floor cell once and no rock, in the reported crypt and thirty more", () => {
  const miscovered = PAVING_SEEDS.flatMap((seed) => {
    const plan = generateCryptDungeon(seed), { size, floor } = plan.map, coverage = new Uint8Array(floor.length);
    for (const slab of plan.placements) {
      if (!(slab.piece in CRYPT_PAVING)) continue;
      let [width, depth] = CRYPT_PAVING[slab.piece];
      if (Math.abs(Math.sin(slab.turn)) > 0.5) [width, depth] = [depth, width];
      for (let z = slab.z - (depth - 1) / 2; z <= slab.z + (depth - 1) / 2; z++) {
        for (let x = slab.x - (width - 1) / 2; x <= slab.x + (width - 1) / 2; x++) coverage[z * size + x]++;
      }
    }
    const wrong = [...coverage.keys()].filter((key) => coverage[key] !== floor[key]);
    return wrong.length ? [`seed ${seed}: ${wrong.length} cells, the first at ${wrong[0] % size}, ${Math.floor(wrong[0] / size)}`] : [];
  });
  assert.deepEqual(miscovered, [], "each floor cell lies under one slab, and each rock cell under none");
});

test("every crypt mixes long, large and broken slabs, and dresses its walls with panels and piers", () => {
  const wanted = ["slabs-broken", "slabs-large", "slabs-long", "wall-panel", "wall-pier"];
  const lacking = PAVING_SEEDS.flatMap((seed) => {
    const placed = new Set(generateCryptDungeon(seed).placements.map((placement) => placement.piece));
    const missing = wanted.filter((piece) => !placed.has(piece));
    return missing.length ? [`seed ${seed}: ${missing}`] : [];
  });
  assert.deepEqual(lacking, [], "no crypt lacks any of the five pieces");
});

test("a rack and a column both stop a body, and only the column stops sight", () => {
  const map = generateCryptDungeon(REPORTED_SEED).map;
  const read = (kind) => {
    const obstacle = map.obstacles.find((candidate) => candidate.id.includes(`.${kind}.`));
    const before = { x: obstacle.x, z: obstacle.z - obstacle.depth / 2 - 0.3 }, beyond = { x: obstacle.x, z: obstacle.z + obstacle.depth / 2 + 0.3 };
    return { standsOn: walkable(map, obstacle, 0), seesAcross: canSee(map, before, beyond) };
  };
  assert.deepEqual({ rack: read("rack"), column: read("column") },
    { rack: { standsOn: false, seesAcross: true }, column: { standsOn: false, seesAcross: false } },
    "nobody stands on either; sight passes an open rack and not a column");
});

test("the scenery fills a lone unseen cell inside a room, and not one at the room's edge", () => {
  const map = room(), inside = cell(map, 5, 5), edge = cell(map, 5, 1);
  const explored = exploredBut(map, [inside, edge]), before = new Set(explored);
  // Nobody is near, so no cell is sampled and only the pocket rule can fill one.
  const memory = revealScenery(map, FAR_AWAY, new Set(), explored, new Set());
  assert.deepEqual({ inside: memory.has(inside), edge: memory.has(edge) }, { inside: true, edge: false },
    "the cell in the middle is remembered, and the one against the wall is not");
  assert.deepEqual(explored, before, "what the party has explored is read, never written");
});

test("the scenery leaves an unseen cell on the edge of a room that opens onto more floor", () => {
  // The room's record ends at x = 5, and the floor runs on past it, as a corridor's does at a doorway.
  const map = room(), mouth = cell(map, 5, 5);
  map.rooms[0].max.x = 5;
  const memory = revealScenery(map, FAR_AWAY, new Set(), exploredBut(map, [mouth]), new Set());
  assert.equal(memory.has(mouth), false, "a pocket beside floor outside its room is not filled");
});

test("the scenery leaves an unseen cell beside rock that stands inside its room", () => {
  // A rootbound room's corners are rock within the room's own bounds.
  const map = room(), beside = cell(map, 5, 5);
  map.floor[cell(map, 5, 4)] = 0;
  const memory = revealScenery(map, FAR_AWAY, new Set(), exploredBut(map, [beside]), new Set());
  assert.equal(memory.has(beside), false, "a pocket beside rock is not filled");
});

test("the scenery leaves an unseen cell that a sight-blocking obstacle stands on", () => {
  const map = room(), inside = cell(map, 5, 5);
  map.obstacles = [{ x: 5, z: 5, width: 1, depth: 1, height: 3, blocksSight: true }];
  const memory = revealScenery(map, FAR_AWAY, new Set(), exploredBut(map, [inside]), new Set());
  assert.equal(memory.has(inside), false, "the cell under the obstacle is not filled");
});

test("the scenery fills an enclosed gap of four cells, and leaves one of five", () => {
  // A row of unseen cells in the middle of a room whose every other cell is explored.
  const filled = (columns) => {
    const map = room(), gap = columns.map((x) => cell(map, x, 5));
    const memory = revealScenery(map, FAR_AWAY, new Set(), exploredBut(map, gap), new Set());
    return gap.map((key) => memory.has(key));
  };
  assert.deepEqual(filled([3, 4, 5, 6]), [true, true, true, true], "a gap of four cells is filled");
  assert.deepEqual(filled([3, 4, 5, 6, 7]), [false, false, false, false, false], "a gap of five cells is left");
});

test("the scenery sees up to a closed door and not through it, and keeps what it saw", () => {
  // Two halves of the room, joined by a doorway three cells wide at x = 5, with the door shut.
  const map = room();
  for (let z = 1; z < 10; z++) map.floor[cell(map, 5, z)] = 0;
  for (let z = 4; z <= 6; z++) map.floor[cell(map, 5, z)] = 1;
  map.doors = [{ id: 0, point: { x: 5, z: 5 }, axis: "x", open: false }];
  const near = cell(map, 3, 5), door = cell(map, 5, 5), beyond = cell(map, 7, 5), hero = { x: 3, z: 5 };
  const explored = new Set(), visible = new Set(), memory = new Set();

  revealScenery(map, hero, visible, explored, memory);
  assert.deepEqual({ near: memory.has(near), door: memory.has(door), beyond: memory.has(beyond) },
    { near: true, door: false, beyond: false },
    "with the door shut, the hero's side is remembered, and neither the door's own cell nor the far side");
  assert.deepEqual({ explored: explored.size, visible: visible.size }, { explored: 0, visible: 0 },
    "the party's own sets are read, never written");

  map.doors[0].open = true;
  revealScenery(map, hero, visible, explored, memory);
  assert.equal(memory.has(beyond), true, "with the door open, the far side is remembered");

  revealScenery(map, FAR_AWAY, visible, explored, memory);
  assert.equal(memory.has(beyond), true, "once the hero has gone, the far side stays remembered");
});

test("the hover outlines an enemy's visible meshes only, changes no material and frees its layer", () => {
  const stage = headlessScene();
  try {
    const shown = MeshBuilder.CreateBox("body", {}, stage.scene), hidden = MeshBuilder.CreateBox("hidden", {}, stage.scene);
    hidden.isVisible = false;
    const material = shown.material = new StandardMaterial("skin", stage.scene), hover = new EnemyHover();
    const layer = () => stage.scene.getHighlightLayerByName("dungeon.enemy-hover");
    const state = () => ({ shown: layer().hasMesh(shown), hidden: layer().hasMesh(hidden), enabled: layer().isEnabled });

    hover.show({ meshes: [shown, hidden] });
    assert.deepEqual(state(), { shown: true, hidden: false, enabled: true }, "the visible mesh is outlined and the hidden one is not");
    // A material is compared by identity alone: a failure that printed one would print its scene.
    assert.ok(shown.material === material, "the outlined mesh keeps its material");

    shown.isVisible = false;
    hover.show({ meshes: [shown] });
    assert.deepEqual(state(), { shown: false, hidden: false, enabled: false }, "a mesh that has been hidden loses its outline, and the layer rests");

    shown.isVisible = true;
    hover.show({ meshes: [shown] });
    hover.clear();
    assert.deepEqual(state(), { shown: false, hidden: false, enabled: false }, "clearing the hover removes the outline");

    hover.dispose();
    assert.deepEqual(stage.scene.effectLayers.map((kept) => kept.name), [], "disposing the hover takes its layer out of the scene");
  } finally { stage.dispose(); }
});

test("the fog fades to black within the last half cell of the known, and draws nothing beyond it", () => {
  // The room is known up to x = 5; the samples run from that cell's middle to its far edge.
  const map = room(), known = new Set();
  for (let z = 1; z < 10; z++) for (let x = 1; x <= 5; x++) known.add(cell(map, x, z));
  const mask = fogMask(map, known, known);
  const edges = [5, 5.1, 5.2, 5.3, 5.4, 5.49].map((x) => fogSample(map, mask, x, 5).edge);
  assert.equal(edges[0], 1, "the middle of the last known cell is fully shown");
  assert.ok(edges.at(-1) < 0.01, `its far edge is black: ${edges.at(-1)}`);
  assert.deepEqual(edges, edges.toSorted((a, b) => b - a), "between them the light only falls");
  assert.equal(fogSample(map, mask, 5.51, 5).drawn, false, "just past the edge, nothing is drawn");
});

test("a column on seen floor is drawn with the floor beside it, though nobody sees its own cell", () => {
  const map = room(), under = cell(map, 5, 5);
  map.obstacles = [{ x: 5, z: 5, width: 0.8, depth: 0.8, height: 2.65, blocksSight: true }];
  const seen = new Set([cell(map, 4, 5)]);
  assert.equal(canSee(map, { x: 4, z: 5 }, { x: 6, z: 5 }), false, "the column blocks the sight across it");
  assert.equal(fogMask(map, seen, seen)[under], FOG.visible, "its cell is as lit as the seen floor beside it");
  assert.equal(seen.has(under), false, "the mask adds nothing to what was seen");
  assert.equal(fogMask(map, new Set(), new Set())[under], FOG.unexplored, "with nothing seen beside it, its cell stays dark");
});
