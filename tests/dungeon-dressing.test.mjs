import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createHeadlessArena } from "./harness/golem-headless-arena.mjs";
import { DRESSING, FACING_MIN, FLOOR_DECALS, FLOOR_TOP, WALL_ALLOWANCE, dressingPlacements, hungCentre, torchPlacements, validateDressing } from "../src/dungeon/dressing.ts";
import { ATLAS, DECAL_KINDS, atlasRect, decalAtlas } from "../src/dungeon/decals.ts";
import { WALL_HEIGHT } from "../src/dungeon/fog.ts";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer.js";
import { buildDungeonWorld } from "../src/dungeon/world.ts";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { CAMERA_AZIMUTH, CAMERA_PITCH, cameraToward, frameDungeon } from "../src/dungeon/camera.ts";
import { dungeonStone } from "../src/dungeon/stone.ts";
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

// Seeds 1 and 2, with and without visuals, pinned from a run of the level as the generator lays it now. Nothing a look
// session adds may add, move or re-layer a body; this is what says so. A change to the generator moves the level and
// is re-pinned only once the level tests are green.
const PINNED = {
  1: { count: 208, sha256: "0da39aab989cfbaf3674b072cf7183d614aa156e6c3416829415ff8ba04a63bd" },
  2: { count: 269, sha256: "2abcd71c319e7978f2f3992d5f753ba941ee4e31b89a06dac4689a9153e03668" },
};

test("the_dungeon_builds_the_same_colliders_with_or_without_visuals", async () => {
  // Flat colours, and textured stone with a texture factory that loads nothing.
  for (const seed of [1, 2]) for (const visuals of [false, true, "stone"]) {
    const arena = await createHeadlessArena({ populateDefaultGeometry: false });
    try {
      const world = buildDungeonWorld(arena.scene, generateLevel(seed).map,
        visuals === "stone" ? dungeonStone(arena.scene, "stone", "stone", () => null) : visuals);
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

const dressings = new Map(SEEDS.map(seed => [seed, dressingPlacements(levels.get(seed), seed)]));
const ofKind = (list, kind) => list.filter(d => d.kind === kind);
/** The page's azimuth, square to the walls, and the old diagonal: hung dressing is placed for the view it is seen from. */
const AZIMUTHS = [CAMERA_AZIMUTH, Math.PI / 4];
const dressedFor = new Map(AZIMUTHS.map(azimuth => [azimuth, azimuth === CAMERA_AZIMUTH ? dressings
  : new Map(SEEDS.map(seed => [seed, dressingPlacements(levels.get(seed), seed, DRESSING, cameraToward(azimuth))]))]));

test("dressing_is_flat_on_the_floor_or_hung_on_a_wall", () => {
  for (const azimuth of AZIMUTHS) {
    const toward = cameraToward(azimuth), seen = new Set();
    for (const [seed, map] of levels) {
      const dressing = dressedFor.get(azimuth).get(seed), where = `azimuth ${azimuth}, seed ${seed}`;
      assert.deepEqual(validateDressing(map, dressing, torchPlacements(map, seed), toward), [], where);
      for (const [i, { min, max }] of map.rooms.entries()) {
        const inside = ofKind(dressing, "decal").filter(({ at }) => at.x >= min.x - 0.5 && at.x <= max.x + 0.5 && at.z >= min.z - 0.5 && at.z <= max.z + 0.5);
        assert.ok(inside.length >= 3, `${where}: room ${i} has ${inside.length} markings`);
      }
      for (const d of dressing) seen.add(d.kind === "decal" ? d.decal : d.kind);
    }
    assert.deepEqual([...seen].sort(), [...FLOOR_DECALS, "roots", "cobweb"].sort(), `azimuth ${azimuth}: every kind is drawn somewhere`);
  }
  // The validator reads the view it is handed: what is placed for one camera faces away from the other.
  const map = levels.get(1), square = dressedFor.get(CAMERA_AZIMUTH).get(1);
  assert.match(validateDressing(map, square, torchPlacements(map, 1), cameraToward(Math.PI / 4)).join("\n"), /face away from the camera/);
  // Ten degrees off the axis a side face shows a sliver, 0.17 of the view: too near edge-on to hang anything on.
  const yawed = cameraToward(170 * Math.PI / 180), [first] = ofKind(square, "roots");
  for (const seed of SEEDS) for (const { facing } of ofKind(dressingPlacements(levels.get(seed), seed, DRESSING, yawed), "roots"))
    assert.deepEqual(facing, { x: 0, z: -1 }, `seed ${seed}: roots on a side face at 170 degrees`);
  const sideways = square.map(d => d === first ? { ...first, facing: { x: 1, z: 0 } } : d);
  assert.match(validateDressing(map, sideways, torchPlacements(map, 1), yawed).join("\n"), /face away from the camera/);
});

test("the_dressing_validator_refuses_each_thing_it_is_for", () => {
  // One stated edit to a real placement each, so that a validator which passed everything would fail here.
  for (const azimuth of AZIMUTHS) {
    const toward = cameraToward(azimuth), where = `azimuth ${azimuth}`;
    const map = levels.get(1), torches = torchPlacements(map, 1), dressing = dressedFor.get(azimuth).get(1);
    const [decal] = ofKind(dressing, "decal"), [roots] = ofKind(dressing, "roots"), [web] = ofKind(dressing, "cobweb");
    const rock = { x: 0, z: 0 }, overlapping = ofKind(dressing, "decal").find(o => o !== decal && Math.hypot(o.at.x - decal.at.x, o.at.z - decal.at.z) < 0.1);
    assert.equal(overlapping, undefined, `${where}: the fixture's first marking stands alone`);
    const problemsOf = (edit, on = map) => validateDressing(on, dressing.map(d => d === edit.from ? edit.to : d).concat(edit.extra ?? []), torches, toward);
    const refused = (edit, pattern, on = map) => assert.match(problemsOf(edit, on).join("\n"), pattern, where);
    refused({ from: decal, to: { ...decal, at: rock } }, /leaves the floor/);
    refused({ from: decal, to: { ...decal, layer: 7 } }, /on layer 7/);
    refused({ from: decal, to: decal, extra: [{ ...decal }] }, /shares a depth/);
    refused({ from: decal, to: { ...decal, at: { ...map.start } } }, /at the start or the exit/);
    refused({ from: roots, to: { ...roots, cell: { x: roots.cell.x + roots.facing.x, z: roots.cell.z + roots.facing.z } } }, /hang on no collider/);
    refused({ from: roots, to: { ...roots, along: 0.4 } }, /leave their cell's face/);
    refused({ from: roots, to: { ...roots, cell: torches[0].cell, facing: torches[0].facing, along: 0 } }, /hang at a torch/);
    refused({ from: web, to: { ...web, drop: 1.2 } }, /hangs down to 1.60 m/);
    refused({ from: web, to: { ...web, into: { x: -web.into.x, z: -web.into.z } } }, /not in an inner corner/);
    refused({ from: roots, to: { ...roots, facing: { x: -roots.facing.x, z: -roots.facing.z } } }, /face away from the camera/);
    // A quarter turn: behind the camera's shoulder on the diagonal, and edge-on to it when it is square to the walls.
    const dot = f => f.x * toward.x + f.z * toward.z;
    const turned = [{ x: roots.facing.z, z: -roots.facing.x }, { x: -roots.facing.z, z: roots.facing.x }].sort((a, b) => dot(a) - dot(b))[0];
    assert.ok(dot(turned) < FACING_MIN, where);
    refused({ from: roots, to: { ...roots, facing: turned } }, /face away from the camera/);
    // A wall the camera looks at across rock: on the diagonal, a wall facing +x whose floor has rock on its +z side is
    // in the level; square to the walls no generated -z face has rock within three cells of it (seeds 1-50), so the
    // level is given some, by one stated edit: the floor two cells in front of a real one turned to rock.
    let behind, facing, on = map;
    if (azimuth === Math.PI / 4) {
      facing = { x: 1, z: 0 };
      for (let z = 0; z < map.size && !behind; z++) for (let x = 0; x < map.size && !behind; x++)
        if (!isFloor(map, x, z) && isFloor(map, x + 1, z) && !isFloor(map, x + 1, z + 1)) behind = { x, z };
    } else {
      facing = { x: 0, z: -1 };
      for (let z = 0; z < map.size && !behind; z++) for (let x = 0; x < map.size && !behind; x++)
        if (!isFloor(map, x, z) && [1, 2, 3].every(k => isFloor(map, x, z - k) && isFloor(map, x - 1, z - k) && isFloor(map, x + 1, z - k))) behind = { x, z };
      on = { ...map, floor: map.floor.slice() }; on.floor[(behind.z - 2) * map.size + behind.x] = 0;
    }
    const hidden = { from: roots, to: { ...roots, cell: behind, facing, along: 0, width: 0.5, drop: 1.7 } };
    if (on !== map) assert.doesNotMatch(problemsOf(hidden).join("\n"), /nearer wall hides them/, `${where}: seen before the edit`);
    refused(hidden, /nearer wall hides them/, on);
    refused({ from: web, to: { ...web, into: { x: web.into.x, z: -web.into.z } } }, /faces away from the camera/);
  }
});

test("dressing_keeps_the_start_and_exit_clean", () => {
  // Measured to the square itself, not the circle the placement rule uses: the point of each square nearest the spot.
  for (const [seed, map] of levels) for (const d of ofKind(dressings.get(seed), "decal")) for (const spot of [map.start, map.exit]) {
    const dx = spot.x - d.at.x, dz = spot.z - d.at.z, c = Math.cos(d.turn), s = Math.sin(d.turn), h = d.size / 2;
    const a = dx * c + dz * s, b = -dx * s + dz * c;
    const gap = Math.hypot(Math.max(0, Math.abs(a) - h), Math.max(0, Math.abs(b) - h));
    assert.ok(gap >= DRESSING.keepClear - 1e-9, `seed ${seed}: a ${d.decal} comes ${gap.toFixed(2)} m from (${spot.x}, ${spot.z})`);
  }
});

test("every_marking_lies_wholly_on_floor", () => {
  // Sampled apart from the placement rule: 24 points a side, each the middle of its own patch of the square.
  for (const [seed, map] of levels) for (const d of ofKind(dressings.get(seed), "decal")) {
    const c = Math.cos(d.turn), s = Math.sin(d.turn);
    for (let i = 0; i < 24; i++) for (let j = 0; j < 24; j++) {
      const a = ((i + 0.5) / 24 - 0.5) * d.size, b = ((j + 0.5) / 24 - 0.5) * d.size, x = d.at.x + a * c - b * s, z = d.at.z + a * s + b * c;
      if (!isFloor(map, Math.round(x), Math.round(z))) assert.fail(`seed ${seed}: a ${d.decal} at (${d.at.x.toFixed(2)}, ${d.at.z.toFixed(2)}) overhangs rock at (${x.toFixed(2)}, ${z.toFixed(2)})`);
    }
  }
});

test("dressing_is_a_function_of_the_seed", () => {
  const map = levels.get(1);
  assert.ok(JSON.stringify(dressingPlacements(map, 1)) === JSON.stringify(dressings.get(1)), "the same seed dresses the same");
  assert.ok(JSON.stringify(dressingPlacements(map, 2)) !== JSON.stringify(dressings.get(1)), "the seed draws the dressing");
});

test("dressing_density_is_what_the_table_asks", () => {
  const doubled = { ...DRESSING, decalsPerRoom: DRESSING.decalsPerRoom.map(n => n * 2), corridorDecalsPerCell: DRESSING.corridorDecalsPerCell * 2,
    rootsPerLevel: DRESSING.rootsPerLevel * 2, cobwebsPerRoomCorner: DRESSING.cobwebsPerRoomCorner * 2 };
  const count = (table, kind) => SEEDS.slice(0, 10).reduce((n, seed) => n + ofKind(dressingPlacements(levels.get(seed), seed, table), kind).length, 0);
  for (const kind of ["decal", "roots", "cobweb"]) {
    const once = count(DRESSING, kind), twice = count(doubled, kind);
    assert.ok(twice >= 1.6 * once, `${kind}: ${once} at the table's density, ${twice} at twice it`);
  }
});

test("the_atlas_paints_a_shape_on_a_clear_rim_in_every_tile", () => {
  const bytes = decalAtlas(), width = ATLAS.tile * ATLAS.columns;
  assert.equal(bytes.length, width * ATLAS.tile * ATLAS.rows * 4);
  for (const kind of DECAL_KINDS) {
    const [u0, v0] = atlasRect(kind), ox = Math.round(u0 * width), oy = Math.round(v0 * ATLAS.tile * ATLAS.rows);
    const alpha = (x, y) => bytes[((oy + y) * width + ox + x) * 4 + 3];
    let solid = 0, rim = 0, top = 0;
    for (let y = 0; y < ATLAS.tile; y++) for (let x = 0; x < ATLAS.tile; x++) {
      const inRim = Math.min(x, y, ATLAS.tile - 1 - x, ATLAS.tile - 1 - y) < ATLAS.rim;
      if (inRim && alpha(x, y) > 0) rim++;
      if (alpha(x, y) >= 128) { solid++; if (y < ATLAS.rim + 4) top++; }
    }
    const share = solid / ATLAS.tile ** 2;
    assert.equal(rim, 0, `${kind}: ${rim} pixels of the rim are painted`);
    assert.ok(share > 0.02 && share < 0.45, `${kind}: ${(share * 100).toFixed(1)} % of the tile is solid`);
    // A hung piece meets the wall's top along its tile's top edge; a marking lies clear of every edge.
    if (kind === "roots" || kind === "cobweb") assert.ok(top > 10, `${kind} does not hang from the top of its tile`);
    else assert.equal(top, 0, `${kind} touches its tile's top`);
    // The renderer minifies: at play zoom a 0.5 m web is about 32 pixels, the third mipmap. Box-filtered as the GPU
    // builds them, at least half of what is solid has to stay solid there, or the alpha test takes the shape away.
    let level = Float64Array.from({ length: ATLAS.tile ** 2 }, (_, i) => alpha(i % ATLAS.tile, Math.floor(i / ATLAS.tile)) / 255);
    for (let n = ATLAS.tile; n > ATLAS.tile / 8; n /= 2) {
      const m = n / 2, next = new Float64Array(m * m);
      for (let y = 0; y < m; y++) for (let x = 0; x < m; x++)
        next[y * m + x] = (level[2 * y * n + 2 * x] + level[2 * y * n + 2 * x + 1] + level[(2 * y + 1) * n + 2 * x] + level[(2 * y + 1) * n + 2 * x + 1]) / 4;
      level = next;
    }
    const kept = level.filter(a => a >= 0.5).length / level.length;
    assert.ok(kept >= share / 2, `${kind}: ${(share * 100).toFixed(1)} % solid, ${(kept * 100).toFixed(1)} % at the third mipmap`);
  }
});

/** A mesh's vertices in world space, from its local positions and its frozen world matrix. */
function worldVertices(mesh) {
  mesh.computeWorldMatrix(true);
  const p = mesh.getVerticesData(VertexBuffer.PositionKind), m = mesh.getWorldMatrix().m, out = [];
  for (let i = 0; i < p.length; i += 3)
    out.push([0, 1, 2].map(k => p[i] * m[k] + p[i + 1] * m[4 + k] + p[i + 2] * m[8 + k] + m[12 + k]));
  return out;
}

test("dressing_is_drawn_where_it_was_placed_alpha_tested_fogged_and_owns_no_body", async () => {
  const arena = await createHeadlessArena({ populateDefaultGeometry: false });
  try {
    for (const azimuth of AZIMUTHS) for (const seed of [1, 4]) {
      const map = levels.get(seed), dressing = dressedFor.get(azimuth).get(seed), world = buildDungeonWorld(arena.scene, map, true);
      const bodies = arena.scene.meshes.filter(m => m.physicsBody).length, meshes = world.dress(dressing);
      assert.equal(arena.scene.meshes.filter(m => m.physicsBody).length, bodies, `seed ${seed}: dressing added a body`);
      const named = prefix => meshes.filter(m => m.name.startsWith(prefix));
      for (const mesh of meshes) {
        const { material } = mesh, plugin = material.pluginManager.getPlugin("DungeonFog");
        assert.ok(world.surfaces.includes(mesh) && plugin.view.texture === world.fog.texture, `${mesh.name} is not fogged`);
        assert.ok(material.needAlphaTesting() && !material.needAlphaBlending() && material.albedoTexture?.hasAlpha, `${mesh.name} is not alpha-tested`);
      }
      // Markings: four corners each, on the tiles and never more than 2 cm over them.
      const decals = ofKind(dressing, "decal"), puddles = decals.filter(d => d.decal === "puddle");
      const flat = [...named("dressing.floor"), ...named("dressing.puddles")].flatMap(worldVertices);
      assert.equal(flat.length, 4 * decals.length, `seed ${seed}: markings drawn`);
      assert.equal(named("dressing.puddles").flatMap(worldVertices).length, 4 * puddles.length, `seed ${seed}: puddles drawn apart`);
      const tiles = world.surfaces.filter(m => m.name.startsWith("floor.visual")).flatMap(worldVertices).map(v => v[1]);
      assert.ok(tiles.every(y => Math.abs(y - FLOOR_TOP) < 1e-6), "the floor's tiles are at FLOOR_TOP");
      assert.ok(flat.every(([, y]) => y > FLOOR_TOP + 0.003 && y <= FLOOR_TOP + 0.02), `seed ${seed}: a marking is off the floor`);
      assert.ok(named("dressing.puddles")[0].material.roughness < named("dressing.floor")[0].material.roughness / 2, "puddles are glossy");
      // Each marking samples one whole tile, its own kind's: as many quads on each tile as markings of the kind. A
      // quad's four vertices are consecutive, and it is known by the middle of its UVs, since neighbouring tiles
      // share an edge.
      const tileOf = (u, v) => DECAL_KINDS.find(k => { const [u0, v0, u1, v1] = atlasRect(k); return u > u0 && u < u1 && v > v0 && v < v1; });
      const quads = new Map();
      for (const mesh of [...named("dressing.floor"), ...named("dressing.puddles")]) {
        const uv = mesh.getVerticesData(VertexBuffer.UVKind);
        for (let i = 0; i < uv.length; i += 8) {
          const us = [0, 2, 4, 6].map(k => uv[i + k]), vs = [1, 3, 5, 7].map(k => uv[i + k]), kind = tileOf((us[0] + us[2]) / 2, (vs[0] + vs[2]) / 2);
          const [u0, v0, u1, v1] = atlasRect(kind);
          assert.ok(Math.min(...us) === u0 && Math.max(...us) === u1 && Math.min(...vs) === v0 && Math.max(...vs) === v1, `seed ${seed}: a ${kind} is not its whole tile`);
          quads.set(kind, (quads.get(kind) ?? 0) + 1);
        }
      }
      for (const kind of FLOOR_DECALS)
        assert.equal(quads.get(kind) ?? 0, decals.filter(d => d.decal === kind).length, `seed ${seed}: ${kind} quads on the ${kind} tile`);
      // Roots: on the face of their own wall, at most the allowance off it, and under the wall's top.
      const roots = ofKind(dressing, "roots"), hung = named("dressing.hung").flatMap(worldVertices);
      assert.equal(hung.length, 4 * roots.length, `seed ${seed}: roots drawn`);
      for (const v of hung) assert.ok(roots.some(r => {
        const c = hungCentre(r), off = (v[0] - c.x) * r.facing.x + (v[2] - c.z) * r.facing.z;
        const along = Math.abs((v[0] - c.x) * r.facing.z - (v[2] - c.z) * r.facing.x);
        return off > 0 && off <= WALL_ALLOWANCE && along <= r.width / 2 + 1e-9 && v[1] <= WALL_HEIGHT && v[1] >= WALL_HEIGHT - r.drop - 0.02;
      }), `seed ${seed}: a root vertex at (${v.map(n => n.toFixed(2))}) is on no root's wall`);
      // Hung pieces: each quad samples its own kind's whole tile with the tile's top (v0) at its top edge, and faces the
      // camera, which culls a back face and draws nothing of one seen edge-on.
      const camera = new FreeCamera("dressing view", Vector3.Zero(), arena.scene);
      frameDungeon(camera, { x: map.size / 2, z: map.size / 2 }, 10, 1.5, CAMERA_PITCH, azimuth);
      // From the framed point: a camera's target is computed with its view matrix, and none has been asked for yet.
      const toCamera = camera.position.subtract(new Vector3(map.size / 2, 1, map.size / 2)).normalize();
      for (const [prefix, kind] of [["dressing.hung", "roots"], ["dressing.web.", "cobweb"]]) for (const mesh of named(prefix)) {
        const [u0, v0, u1, v1] = atlasRect(kind), uv = mesh.getVerticesData(VertexBuffer.UVKind), normal = mesh.getVerticesData(VertexBuffer.NormalKind);
        const ys = worldVertices(mesh).map(v => v[1]);
        for (let q = 0; q < ys.length; q += 4) {
          const top = Math.max(...ys.slice(q, q + 4)), us = [0, 1, 2, 3].map(k => uv[2 * (q + k)]);
          assert.ok(Math.min(...us) === u0 && Math.max(...us) === u1, `seed ${seed}: ${mesh.name} leaves its tile`);
          for (let k = q; k < q + 4; k++) assert.equal(uv[2 * k + 1], ys[k] === top ? v0 : v1, `seed ${seed}: ${mesh.name} hangs upside down`);
          const facing = normal[3 * q] * toCamera.x + normal[3 * q + 1] * toCamera.y + normal[3 * q + 2] * toCamera.z;
          assert.ok(facing > 0.3, `azimuth ${azimuth}, seed ${seed}: ${mesh.name} faces the camera at ${facing.toFixed(2)}`);
        }
      }
      camera.dispose();
      // Webs: one mesh each, over their corner's floor cell and above a golem's head, hidden until that floor is explored.
      const webs = ofKind(dressing, "cobweb"), webMeshes = named("dressing.web.");
      assert.equal(webMeshes.length, webs.length, `seed ${seed}: webs drawn`);
      for (const [i, mesh] of webMeshes.entries()) for (const [x, y, z] of worldVertices(mesh)) {
        const { corner, into } = webs[i], a = (x - corner.x) * into.x, b = (z - corner.z) * into.z;
        assert.ok(a >= 0 && b >= 0 && a <= 0.6 && b <= 0.6 && y >= 2 && y <= WALL_HEIGHT, `seed ${seed}: web ${i} leaves its corner`);
      }
      const floorOf = w => (w.corner.z + w.into.z / 2) * map.size + w.corner.x + w.into.x / 2;
      assert.ok(webMeshes.every(m => !m.isVisible), `seed ${seed}: a web shows before its floor is explored`);
      world.present(new Set(), new Set([floorOf(webs[0])]), { x: 0, z: 0 }, Math.PI / 6, cameraToward(azimuth));
      assert.deepEqual(webMeshes.map(m => m.isVisible), webs.map(w => floorOf(w) === floorOf(webs[0])), `seed ${seed}: webs do not follow their floors`);
      world.dispose();
    }
  } finally { arena.dispose(); }
});
