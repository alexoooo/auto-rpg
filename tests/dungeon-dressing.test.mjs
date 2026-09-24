import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createHeadlessArena } from "./harness/golem-headless-arena.mjs";
import { DRESSING, torchPlacements } from "../src/dungeon/dressing.ts";
import { buildDungeonWorld, fadeDepth } from "../src/dungeon/world.ts";
import { CAMERA_PITCH } from "../src/dungeon/camera.ts";
import { generateLevel } from "../src/dungeon/level.ts";
import { isFloor } from "../src/dungeon/map.ts";
import { ShaderStore } from "@babylonjs/core/Engines/shaderStore.js";
import { orthographicLightProxy, PROXY_ORTHOGRAPHIC } from "../src/dungeon/light-proxy.ts";

const SEEDS = Array.from({ length: 50 }, (_, i) => i + 1);
const levels = new Map(SEEDS.map(seed => [seed, generateLevel(seed).map]));
const roomAt = (map, x, z) => map.rooms.findIndex(r => x >= r.min.x && x <= r.max.x && z >= r.min.z && z <= r.max.z);

test("torches_hang_in_room_walls_facing_room_floor", () => {
  for (const [seed, map] of levels) for (const torch of torchPlacements(map, seed)) {
    const { cell, facing, flame, light, room } = torch, where = `seed ${seed} torch at ${cell.x},${cell.z}`;
    assert.ok(!isFloor(map, cell.x, cell.z), `${where}: set into rock`);
    assert.equal(roomAt(map, cell.x, cell.z), -1, `${where}: not on a divider inside a room`);
    assert.equal(Math.abs(facing.x) + Math.abs(facing.z), 1, `${where}: faces along one axis`);
    assert.ok(isFloor(map, cell.x + facing.x, cell.z + facing.z), `${where}: faces floor`);
    assert.equal(roomAt(map, cell.x + facing.x, cell.z + facing.z), room, `${where}: faces the floor of its own room`);
    // The face of the rock cell is half a metre from its centre; the flame, and further out the light, stand proud of it.
    const at = proud => ({ x: cell.x + facing.x * (0.5 + proud), y: DRESSING.torchHeight, z: cell.z + facing.z * (0.5 + proud) });
    assert.deepEqual(flame, at(DRESSING.torchProud), `${where}: flame`);
    assert.deepEqual(light, at(DRESSING.torchLightProud), `${where}: light`);
  }
});

// Spacing is measured between flames.
test("torches_keep_their_spacing_and_stay_off_corridor_mouths", () => {
  for (const [seed, map] of levels) {
    const torches = torchPlacements(map, seed);
    assert.ok(torches.length > 0, `seed ${seed} has torches`);
    for (const [i, a] of torches.entries()) {
      for (const b of torches.slice(i + 1))
        assert.ok(Math.hypot(a.flame.x - b.flame.x, a.flame.z - b.flame.z) >= DRESSING.torchSpacing, `seed ${seed}: torches too close`);
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const x = a.cell.x + dx, z = a.cell.z + dz;
        assert.ok(!isFloor(map, x, z) || roomAt(map, x, z) >= 0, `seed ${seed} torch at ${a.cell.x},${a.cell.z} is beside a corridor`);
      }
    }
  }
});

test("torch_placements_are_a_function_of_the_seed", () => {
  const map = levels.get(1);
  assert.deepEqual(torchPlacements(map, 1), torchPlacements(map, 1));
  assert.notDeepEqual(torchPlacements(map, 1), torchPlacements(map, 2), "the seed draws the torches, on the same walls");
});

test("the_fade_band_is_todays_at_the_default_pitch", () => {
  // The band was a hand-set 9 before it was derived; derived, it is 8.980 at the default pitch.
  assert.ok(Math.abs(fadeDepth(CAMERA_PITCH) - 8.980) < 0.001, `was 9 by hand, is ${fadeDepth(CAMERA_PITCH)}`);
  assert.ok(fadeDepth(Math.PI / 4) < fadeDepth(CAMERA_PITCH), "a steeper camera sees over more of a wall");
});

/** Every body the world builds, as a row a hash can hold: name, where and how big (to 0.1 mm), what it hits, its
 * shape, and its friction and restitution. */
function colliderRows(scene) {
  const round = v => Math.round(v * 1e4) / 1e4;
  return scene.meshes.filter(m => m.physicsBody).map(m => {
    const e = m.getBoundingInfo().boundingBox.extendSize, shape = m.physicsBody.shape;
    return [m.name, round(m.position.x), round(m.position.y), round(m.position.z), round(e.x), round(e.y), round(e.z),
      shape.filterMembershipMask, shape.filterCollideMask, m.physicsBody.getMotionType(),
      shape.type, round(shape.material.friction), round(shape.material.restitution)].join(" ");
  }).sort();
}

// Pinned at the commit before the dungeon's look changed (f1ccfed): seeds 1 and 2, with and without visuals.
// Nothing a look session adds may add, move or re-layer a body; this is what says so.
const PINNED = {
  1: { count: 242, sha256: "bd1838d940ccf75f89d9d6e47e70e02eb07decc2235b120233465dfe2f6d6ea4" },
  2: { count: 279, sha256: "1070cb3997c61e4c509532cf51cfe8b506a825f52cc066489858ec94aa90da90" },
};

test("the_dungeon_builds_the_same_colliders_with_or_without_visuals", async () => {
  for (const seed of [1, 2]) for (const visuals of [false, true]) {
    const arena = await createHeadlessArena({ populateDefaultGeometry: false });
    try {
      const world = buildDungeonWorld(arena.scene, generateLevel(seed).map, visuals);
      const rows = colliderRows(arena.scene);
      const sha256 = createHash("sha256").update(rows.join("\n")).digest("hex");
      assert.deepEqual({ count: rows.length, sha256 }, PINNED[seed], `seed ${seed}, visuals ${visuals}`);
      world.dispose();
    } finally {
      arena.dispose();
    }
  }
});

// A Babylon upgrade that moves the proxy's last line must fail here, not as torchlight cut off at tile edges.
test("the_orthographic_light_proxy_patch_finds_its_anchor", () => {
  orthographicLightProxy(); orthographicLightProxy();
  const source = ShaderStore.ShadersStore.lightProxyVertexShader, at = source.indexOf(PROXY_ORTHOGRAPHIC);
  assert.equal(source.split(PROXY_ORTHOGRAPHIC).length - 1, 1, "patched exactly once");
  assert.ok(at > source.indexOf("projPosition=mix("), "after the perspective fit, so it replaces it");
  assert.ok(at < source.indexOf("vec2 tilePosition="), "before the tiles are read from it");
});
