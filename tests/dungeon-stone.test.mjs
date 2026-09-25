import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer.js";
import { createHeadlessArena } from "./harness/golem-headless-arena.mjs";
import registry from "../src/textures.json" with { type: "json" };
import { surfaceMetresPerRepeat, TEXTURED_SURFACES } from "../src/materials.ts";
import { dungeonStone, stoneQuery } from "../src/dungeon/stone.ts";
import { buildDungeonWorld } from "../src/dungeon/world.ts";
import { generateLevel } from "../src/dungeon/level.ts";

const DUNGEON = ["dungeon.floor.a", "dungeon.floor.b", "dungeon.wall.a", "dungeon.wall.b"];
/** A texture factory that loads nothing, as Node cannot. */
const noImages = () => null;

test("dungeon_textures_are_registered_with_provenance", () => {
  // Every row, not only the dungeon's: a file that no longer matches its row is the same defect wherever it is.
  for (const row of registry.textures) {
    const bytes = readFileSync(new URL(`../public${row.localUrl}`, import.meta.url));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), row.sha256, `${row.file} is not the registered file`);
    const source = registry.sources.find(s => s.sourceUrl === row.sourceUrl);
    assert.equal(source?.license, "CC0-1.0", `${row.name} has no CC0 source`);
  }
  for (const consumer of DUNGEON) {
    const rows = registry.textures.filter(r => r.consumers.includes(consumer));
    assert.deepEqual(rows.map(r => r.channel).sort(), ["albedo", "normal", "orm"], `${consumer} has one map per channel`);
  }
  for (const name of ["dungeonFloorA", "dungeonFloorB", "dungeonWallA", "dungeonWallB"])
    assert.ok(surfaceMetresPerRepeat(TEXTURED_SURFACES[name]) >= 1.5, `${name} repeats at a stone's scale`);
});

test("stone_is_chosen_from_the_query_and_defaults_to_the_first_candidate", () => {
  assert.deepEqual(stoneQuery(""), { floor: "a", wall: "a" });
  assert.deepEqual(stoneQuery("?play=dungeon&floor=b&wall=flat"), { floor: "b", wall: "flat" });
  assert.deepEqual(stoneQuery("?floor=c&wall=B"), { floor: "a", wall: "a" });
});

test("a_textured_world_spans_its_maps_meets_edge_to_edge_and_varies_only_stone", async () => {
  const arena = await createHeadlessArena({ populateDefaultGeometry: false });
  try {
    const map = generateLevel(1).map;
    for (const [floor, wall] of [["a", "b"], ["b", "flat"], ["flat", "a"]]) {
      const look = dungeonStone(arena.scene, floor, wall, noImages), world = buildDungeonWorld(arena.scene, map, look);
      const drawn = kind => world.surfaces.filter(m => m.name.startsWith(`${kind}.visual`));
      for (const [kind, choice] of [["floor", floor], ["wall", wall]]) {
        const { material, metresPerRepeat, textured } = look[kind];
        assert.equal(textured, choice !== "flat");
        if (textured) assert.equal(metresPerRepeat, surfaceMetresPerRepeat(TEXTURED_SURFACES[`dungeon${kind === "floor" ? "Floor" : "Wall"}${choice.toUpperCase()}`]));
        assert.ok(drawn(kind).length > 0 && drawn(kind).every(m => m.material === material), `${kind} is drawn in the chosen stone`);
        // UVs are world metres over the span: x and z looking up, along the face and up it on a side.
        const faces = new Set();
        for (const mesh of drawn(kind)) {
          const p = mesh.getVerticesData(VertexBuffer.PositionKind), n = mesh.getVerticesData(VertexBuffer.NormalKind);
          const uv = mesh.getVerticesData(VertexBuffer.UVKind);
          for (let v = 0; v < p.length / 3; v++) {
            const [x, y, z] = p.slice(v * 3, v * 3 + 3), axis = n[v * 3 + 1] !== 0 ? "up" : n[v * 3] !== 0 ? "x" : "z";
            const metres = axis === "up" ? [x, z] : axis === "x" ? [z, y] : [x, y];
            faces.add(axis);
            for (let i = 0; i < 2; i++)
              assert.ok(Math.abs(uv[v * 2 + i] * metresPerRepeat - metres[i]) < 1e-9, `${mesh.name}: vertex ${v} (${axis}) is not at its metres`);
          }
        }
        assert.deepEqual([...faces].sort(), kind === "floor" ? ["up"] : ["up", "x", "z"]);
        const plugin = material.pluginManager.getPlugin("DungeonFog");
        assert.equal(plugin.stone, textured ? kind : null, `${kind}: stone rules only on a textured ${kind}`);
        const defines = {};
        plugin.prepareDefines(defines);
        assert.deepEqual(defines, { DUNGEON_FOG: true, DUNGEON_STONE: textured, DUNGEON_WALL: textured && kind === "wall" });
      }
      // Tiles meet edge to edge on a textured floor, and keep the flat floor's 2 cm grid on a flat one.
      const p = drawn("floor")[0].getVerticesData(VertexBuffer.PositionKind);
      const width = Math.max(p[0], p[3], p[6], p[9]) - Math.min(p[0], p[3], p[6], p[9]);
      assert.ok(Math.abs(width - (floor === "flat" ? 0.98 : 1)) < 1e-9, `floor ${floor}: a tile is ${width} m`);
      const doors = arena.scene.meshes.filter(m => m.name.startsWith("door."));
      assert.ok(doors.every(d => d.material.pluginManager.getPlugin("DungeonFog").stone === null), "a door follows no stone rule");
      world.dispose();
    }
  } finally { arena.dispose(); }
});
