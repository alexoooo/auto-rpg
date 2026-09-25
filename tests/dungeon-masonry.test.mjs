import test from "node:test";
import assert from "node:assert/strict";
import { createHeadlessArena } from "./harness/golem-headless-arena.mjs";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer.js";
import { MASONRY, blockQuads, masonry, masonryQuads } from "../src/dungeon/masonry.ts";
import { WALL_HEIGHT, boundary, wallSurface } from "../src/dungeon/fog.ts";
import { STONE_LOOK } from "../src/dungeon/fog-plugin.ts";
import { buildDungeonWorld, SCONCE } from "../src/dungeon/world.ts";
import { torchPlacements } from "../src/dungeon/dressing.ts";
import { dungeonStone } from "../src/dungeon/stone.ts";
import { generateLevel } from "../src/dungeon/level.ts";
import { isFloor } from "../src/dungeon/map.ts";

const SEEDS = Array.from({ length: 10 }, (_, i) => i + 1);
const levels = new Map(SEEDS.map(seed => [seed, generateLevel(seed).map]));
const OUT = { "x+": [1, 0], "x-": [-1, 0], "z+": [0, 1], "z-": [0, -1] };
const alongOf = (face, [x, , z]) => face[0] === "x" ? z : x;
const acrossOf = (face, [x, , z]) => face[0] === "x" ? x : z;
const sides = map => wallSurface(map).filter(q => q.face !== "top");

test("every_block_quad_stands_on_or_behind_its_collider_face_and_inside_rock", () => {
  for (const [seed, map] of levels) {
    for (const block of masonry(map)) {
      const sign = OUT[block.face][0] + OUT[block.face][1];
      assert.ok(block.inset >= 0 && block.inset <= MASONRY.relief, `seed ${seed}: a block is set ${block.inset} m back`);
      for (const quad of blockQuads(block, 2, map.seed)) for (const corner of quad.corners) {
        // Never proud of the collider: what a golem touches is what it sees.
        assert.ok(sign * (acrossOf(block.face, corner) - block.plane) <= 1e-12, `seed ${seed}: a block stands proud of its face`);
        assert.ok(corner[1] >= 0 && corner[1] <= WALL_HEIGHT, `seed ${seed}: a block leaves [0, ${WALL_HEIGHT}]`);
      }
    }
    // Every drawn point, nudged into the rock and toward its quad's middle, is inside a collider cell.
    for (const { corners, normal } of masonryQuads(map, 2)) {
      const middle = [0, 1, 2].map(i => corners.reduce((s, c) => s + c[i], 0) / 4);
      for (const c of corners) {
        const p = c.map((v, i) => v + (middle[i] - v) * 1e-4 - normal[i] * 1e-4);
        assert.ok(boundary(map, Math.round(p[0]), Math.round(p[2])), `seed ${seed}: (${c}) is drawn off the colliders`);
      }
    }
  }
});

test("courses_tile_every_side_face_with_no_gap_and_no_overlap", () => {
  const heights = [...Array.from({ length: MASONRY.courses + 1 }, (_, k) => k * (WALL_HEIGHT - MASONRY.coping) / MASONRY.courses), WALL_HEIGHT];
  for (const [seed, map] of levels) {
    const byLine = new Map();
    for (const b of masonry(map)) {
      assert.ok(Math.abs(b.y0 - heights[b.course]) < 1e-12 && Math.abs(b.y1 - heights[b.course + 1]) < 1e-12, `seed ${seed}: course ${b.course} is off its heights`);
      assert.ok(b.to > b.from, `seed ${seed}: an empty block`);
      const key = `${b.face}|${b.plane}|${b.course}`;
      (byLine.get(key) ?? byLine.set(key, []).get(key)).push(b);
    }
    for (const line of byLine.values()) {
      line.sort((a, b) => a.from - b.from);
      for (let i = 1; i < line.length; i++) assert.ok(line[i].from >= line[i - 1].to - 1e-9, `seed ${seed}: two blocks overlap`);
    }
    for (const { cell, face } of sides(map)) for (let k = 0; k <= MASONRY.courses; k++) {
      const plane = (face[0] === "x" ? cell.x : cell.z) + 0.5 * (OUT[face][0] + OUT[face][1]), centre = face[0] === "x" ? cell.z : cell.x;
      const covered = (byLine.get(`${face}|${plane}|${k}`) ?? [])
        .reduce((sum, b) => sum + Math.max(0, Math.min(b.to, centre + 0.5) - Math.max(b.from, centre - 0.5)), 0);
      assert.ok(Math.abs(covered - 1) < 1e-9, `seed ${seed}: ${face} of (${cell.x}, ${cell.z}), course ${k}, is ${covered} covered`);
    }
  }
});

test("outer_corners_carry_flush_quoins_that_interlock_and_one_arris", () => {
  let corners = 0;
  for (const [seed, map] of levels) {
    const blocks = masonry(map), has = new Set(sides(map).map(q => `${q.cell.x},${q.cell.z},${q.face}`));
    for (const { cell, face } of sides(map).filter(q => q.face[0] === "x")) for (const turn of ["z+", "z-"]) {
      if (!has.has(`${cell.x},${cell.z},${turn}`)) continue;
      corners++;
      const cx = cell.x + 0.5 * OUT[face][0], cz = cell.z + 0.5 * OUT[turn][1];
      for (let k = 0; k <= MASONRY.courses; k++) {
        const atCorner = (f, along) => blocks.filter(b => b.face === f && b.course === k && (b.from === along || b.to === along)
          && b.plane === (f[0] === "x" ? cx : cz));
        const [onX] = atCorner(face, cz), [onZ] = atCorner(turn, cx);
        assert.ok(onX && onZ, `seed ${seed}: corner (${cx}, ${cz}) course ${k} has no block on a face`);
        const endX = onX.to === cz ? onX.ends[1] : onX.ends[0], endZ = onZ.to === cx ? onZ.ends[1] : onZ.ends[0];
        assert.ok(onX.quoin && onZ.quoin && onX.inset === 0 && onZ.inset === 0, `seed ${seed}: a corner block is not a flush quoin`);
        assert.deepEqual([endX, endZ], ["bevel", "square"], `seed ${seed}: the arris is drawn by ${endX}/${endZ}`);
        // Long over short, and the other way round a course up -- unless a face is too short for a quoin, and is one
        // stone from end to end.
        const lx = onX.to - onX.from, lz = onZ.to - onZ.from;
        if (Math.abs(lx - MASONRY.quoin[k % 2]) < 1e-9)
          assert.ok(Math.abs(lz - MASONRY.quoin[(k + 1) % 2]) < 1e-9 || lz >= 1 - 1e-9, `seed ${seed}: quoins ${lx} and ${lz} do not interlock`);
        else assert.ok(lx >= 1 - 1e-9, `seed ${seed}: a corner stone of ${lx} m on a face long enough for a quoin`);
      }
    }
  }
  assert.ok(corners > 200, `${corners} outer corners`);
});

test("joints_stagger_from_course_to_course", () => {
  for (const [seed, map] of levels) {
    const blocks = masonry(map), joints = new Map();
    for (const b of blocks) {
      const key = `${b.face}|${b.plane}|${b.course}`;
      (joints.get(key) ?? joints.set(key, new Set()).get(key)).add(Math.round(b.to * 1e6));
    }
    let aligned = 0, inner = 0;
    for (const b of blocks) {
      const below = joints.get(`${b.face}|${b.plane}|${b.course - 1}`), at = Math.round(b.to * 1e6);
      if (!below || !joints.get(`${b.face}|${b.plane}|${b.course}`)) continue;
      // A joint at the end of a run is where the run ends, in every course.
      const last = blocks.some(n => n.face === b.face && n.plane === b.plane && n.course === b.course && Math.round(n.from * 1e6) === at);
      if (!last) continue;
      inner++; if (below.has(at)) aligned++;
    }
    assert.ok(inner > 1000 && aligned / inner < 0.05, `seed ${seed}: ${aligned} of ${inner} joints sit on the joint below`);
  }
});

test("the_masonry_is_a_function_of_the_level_and_varies_with_its_seed", () => {
  const map = levels.get(1);
  // Compared as text: a failing deepEqual over six thousand blocks builds a diff that can take gigabytes.
  assert.ok(JSON.stringify(masonry(map)) === JSON.stringify(masonry(generateLevel(1).map)), "the same level lays the same blocks");
  const reseeded = masonry({ ...map, seed: map.seed + 1 }), blocks = masonry(map);
  assert.equal(reseeded.length > 0 && blocks.length > 0, true);
  const lengths = bs => bs.map(b => (b.to - b.from).toFixed(6)).join();
  assert.notEqual(lengths(reseeded), lengths(blocks), "the draw ignores the seed");
  const middle = blocks.filter(b => !b.quoin).map(b => b.to - b.from);
  assert.ok(new Set(middle.map(l => l.toFixed(3))).size > 100, "blocks are all one length");
  assert.ok(Math.min(...middle) > 0.3 && Math.max(...middle) < 1.4, `block lengths ${Math.min(...middle)} to ${Math.max(...middle)}`);
  const insets = new Set(blocks.filter(b => !b.quoin && b.course < MASONRY.courses).map(b => b.inset.toFixed(4)));
  assert.ok(insets.size > 100, "no relief");
});

test("a_block_is_closed_seen_from_in_front", () => {
  // Face and bevels, flattened onto the wall, tile the block's rectangle -- less a bevel at a square end, where the
  // arris of the face turning there closes it -- and so leave no hole into the rock.
  for (const seed of [1, 2]) for (const block of masonry(levels.get(seed))) {
    let area = 0;
    for (const { corners } of blockQuads(block, 2, seed)) {
      const p = corners.map(c => [alongOf(block.face, c), c[1]]);
      area += Math.abs(p.reduce((s, [x, y], i) => { const [u, v] = p[(i + 1) % 4]; return s + x * v - u * y; }, 0)) / 2;
    }
    const square = block.ends.filter(e => e === "square").length;
    const expected = (block.to - block.from - square * block.bevel) * (block.y1 - block.y0);
    assert.ok(Math.abs(area - expected) < 1e-9, `seed ${seed}: a block covers ${area} of ${expected} m2`);
  }
});

test("a_block_reads_its_own_patch_of_the_map_at_the_maps_scale", () => {
  const map = levels.get(1), span = 2, offsets = new Set();
  for (const block of masonry(map)) {
    const seen = [];
    for (const { corners, uvs } of blockQuads(block, span, map.seed)) corners.forEach((c, i) =>
      seen.push([uvs[i][0] * span - alongOf(block.face, c), uvs[i][1] * span - c[1]]));
    for (const [u, v] of seen) assert.ok(Math.abs(u - seen[0][0]) < 1e-9 && Math.abs(v - seen[0][1]) < 1e-9, "a block's map is stretched or split");
    offsets.add(seen[0].map(o => o.toFixed(4)).join());
  }
  assert.ok(offsets.size > 0.95 * masonry(map).length, `${offsets.size} patches over ${masonry(map).length} blocks`);
});

/** Whether two convex coplanar polygons, given in 2D, share more than a sliver of area. */
function overlap(a, b) {
  for (const poly of [a, b]) for (let i = 0; i < poly.length; i++) {
    const [p, q] = [poly[i], poly[(i + 1) % poly.length]], axis = [q[1] - p[1], p[0] - q[0]];
    const project = pts => pts.map(([x, y]) => x * axis[0] + y * axis[1]);
    const pa = project(a), pb = project(b), length = Math.hypot(...axis);
    if (Math.min(Math.max(...pa), Math.max(...pb)) - Math.max(Math.min(...pa), Math.min(...pb)) < 1e-7 * length) return false;
  }
  return true;
}

test("no_two_drawn_quads_share_a_plane_and_overlap", () => {
  for (const seed of [1, 2, 3]) {
    const planes = new Map();
    for (const quad of masonryQuads(levels.get(seed), 2)) {
      const n = quad.normal, d = n[0] * quad.corners[0][0] + n[1] * quad.corners[0][1] + n[2] * quad.corners[0][2];
      const key = [...n, d].map(v => (Math.abs(v) < 5e-7 ? 0 : v).toFixed(6)).join();
      (planes.get(key) ?? planes.set(key, []).get(key)).push(quad);
    }
    let pairs = 0;
    for (const quads of planes.values()) {
      // Two axes in the plane: drop the normal's largest component.
      const n = quads[0].normal, drop = [0, 1, 2].reduce((m, i) => Math.abs(n[i]) > Math.abs(n[m]) ? i : m, 0);
      const flat = quads.map(q => q.corners.map(c => c.filter((_, i) => i !== drop)));
      const boxes = flat.map(p => [0, 1].map(i => [Math.min(...p.map(v => v[i])), Math.max(...p.map(v => v[i]))]));
      for (let i = 0; i < flat.length; i++) for (let j = i + 1; j < flat.length; j++) {
        if (boxes[i].some(([lo, hi], k) => hi < boxes[j][k][0] - 1e-9 || boxes[j][k][1] < lo - 1e-9)) continue;
        pairs++;
        assert.ok(!overlap(flat[i], flat[j]), `seed ${seed}: two quads z-fight at (${quads[i].corners[0]}) and (${quads[j].corners[0]})`);
      }
    }
    assert.ok(pairs > 100, `${pairs} touching pairs checked`);
  }
});

test("the_masonry_keeps_to_its_triangle_budget_and_the_stone_rule_can_tell_its_faces_apart", () => {
  for (const [seed, map] of levels) {
    const quads = masonryQuads(map, 2), perSide = quads.length / sides(map).length;
    assert.ok(perSide < 44 && quads.length * 2 < 80_000, `seed ${seed}: ${quads.length * 2} triangles, ${perSide} quads a side`);
    // The shader darkens a top by its normal and lights the coping's bevel: the two must be told apart by `topFacing`.
    const rising = new Set(quads.map(q => q.normal[1]).filter(y => y > 0).map(y => y.toFixed(6)));
    assert.deepEqual([...rising].sort(), [Math.SQRT1_2.toFixed(6), (1).toFixed(6)], `seed ${seed}: up-facing normals ${[...rising]}`);
  }
  assert.ok(STONE_LOOK.topFacing > Math.SQRT1_2 && STONE_LOOK.topFacing < 1, "the top rule would take the bevels too, or no top");
});

test("walls_draw_in_blocks_over_dark_mortar_and_masonry_zero_is_the_flat_skin", async () => {
  const arena = await createHeadlessArena({ populateDefaultGeometry: false });
  try {
    const map = levels.get(2);
    const count = (world, kind) => world.surfaces.filter(m => m.name.startsWith("wall.visual"))
      .reduce((sum, m) => sum + (m.getVerticesData(kind)?.length ?? 0), 0);
    const blocks = buildDungeonWorld(arena.scene, map, true);
    // The mesh is the quads: every vertex, with its UV, as `masonryQuads` gave it (flat stone spans 1 m).
    const vertex = (p, uv) => [...p, ...uv].map(v => v.toFixed(5)).join();
    const expected = masonryQuads(map, 1).flatMap(q => q.corners.map((c, i) => vertex(c, q.uvs ? q.uvs[i] : [c[0], c[2]]))).sort();
    const built = blocks.surfaces.filter(m => m.name.startsWith("wall.visual")).flatMap(m => {
      const p = m.getVerticesData(VertexBuffer.PositionKind), uv = m.getVerticesData(VertexBuffer.UVKind);
      return Array.from({ length: p.length / 3 }, (_, v) => vertex(p.slice(v * 3, v * 3 + 3), uv.slice(v * 2, v * 2 + 2)));
    }).sort();
    // Counted rather than `deepEqual`: a failing deepEqual diffs 130,000 strings, which took 33 GB and a quarter hour.
    const differ = built.length === expected.length ? built.filter((v, i) => v !== expected[i]).length : Infinity;
    assert.equal(differ, 0, `${differ} of ${expected.length} wall vertices are not the masonry's quads and UVs`);
    const colours = blocks.surfaces.filter(m => m.name.startsWith("wall.visual")).flatMap(m => [...m.getVerticesData(VertexBuffer.ColorKind)]);
    const mortar = colours.filter((c, i) => i % 4 === 0 && Math.abs(c - MASONRY.mortar) < 1e-6).length;
    const surface = wallSurface(map);
    assert.equal(mortar, 4 * (surface.length + sides(map).length), "a backing and a sill a side and a cap a top, each in mortar");
    assert.equal(colours.filter((c, i) => i % 4 === 0 && c === 1).length, colours.length / 4 - mortar, "a block is not the stone's own colour");
    blocks.dispose();
    const skin = buildDungeonWorld(arena.scene, map, { ...dungeonStone(arena.scene), masonry: false });
    assert.equal(count(skin, VertexBuffer.PositionKind), surface.length * 4 * 3);
    assert.equal(skin.surfaces.find(m => m.name.startsWith("wall.visual")).getVerticesData(VertexBuffer.ColorKind), null, "the flat skin is shaded");
    skin.dispose();
  } finally { arena.dispose(); }
});

/** A mesh's world-space vertices, as [x, y, z] triples. */
function vertices(mesh) {
  mesh.computeWorldMatrix(true);
  const local = mesh.getVerticesData(VertexBuffer.PositionKind), out = [], m = mesh.getWorldMatrix().m;
  for (let i = 0; i < local.length; i += 3) {
    const [x, y, z] = local.slice(i, i + 3);
    out.push([0, 1, 2].map(r => x * m[r] + y * m[4 + r] + z * m[8 + r] + m[12 + r]));
  }
  return out;
}

test("a_door_leaf_is_drawn_inside_its_collider_and_goes_when_the_door_opens", async () => {
  const arena = await createHeadlessArena({ populateDefaultGeometry: false });
  try {
    const map = generateLevel(3).map, world = buildDungeonWorld(arena.scene, map, true);
    assert.ok(map.doors.length > 1, "a level with doors");
    for (const door of map.doors) {
      const box = arena.scene.getMeshByName(`door.${door.id}`), leaf = arena.scene.meshes.filter(m => m.name.startsWith(`door.${door.id}.`));
      assert.equal(box.isVisible, false, "a door's collider is drawn");
      assert.deepEqual(leaf.map(m => m.name).sort(), [`door.${door.id}.iron`, `door.${door.id}.leaf`]);
      const half = door.axis === "x" ? [0.175, 1.5] : [1.5, 0.175];
      let across = 0;
      for (const mesh of leaf) {
        assert.ok(mesh.isVisible && !mesh.physicsBody, `${mesh.name} is hidden or has a body`);
        for (const [x, y, z] of vertices(mesh)) {
          assert.ok(Math.abs(x - door.point.x) <= half[0] + 1e-6 && Math.abs(z - door.point.z) <= half[1] + 1e-6 && y >= -1e-6 && y <= 2.5 + 1e-6,
            `${mesh.name} leaves its collider at (${x}, ${y}, ${z})`);
          across = Math.max(across, Math.abs(door.axis === "x" ? z - door.point.z : x - door.point.x));
        }
      }
      assert.ok(across > 1.4, `door ${door.id}'s leaf spans ${2 * across} m of its 3 m`);
    }
    const [first] = map.doors;
    world.openNearby([first.point]);
    assert.ok(arena.scene.meshes.filter(m => m.name.startsWith(`door.${first.id}.`)).every(m => !m.isVisible), "an open door's leaf is drawn");
    assert.ok(arena.scene.meshes.filter(m => m.name.startsWith(`door.${map.doors[1].id}.`)).every(m => m.isVisible), "a closed door's leaf went");
    world.dispose();
    // `dispose` takes down bodies, not meshes, so the first world's leaves are still in the scene: count the new ones.
    const leaves = () => arena.scene.meshes.filter(m => /^door\.\d+\./.test(m.name)).length, before = leaves();
    const none = buildDungeonWorld(arena.scene, map, false);
    assert.equal(leaves(), before, "a world with no visuals draws leaves");
    none.dispose();
  } finally { arena.dispose(); }
});

test("a_sconce_is_set_into_the_wall_under_its_flame_and_is_fogged", async () => {
  const arena = await createHeadlessArena({ populateDefaultGeometry: false });
  try {
    for (const seed of [1, 4]) {
      const map = levels.get(seed), world = buildDungeonWorld(arena.scene, map, true), torches = torchPlacements(map, seed);
      const bodies = arena.scene.meshes.filter(m => m.physicsBody).length, meshes = world.sconces(torches);
      assert.equal(arena.scene.meshes.filter(m => m.physicsBody).length, bodies, "a sconce has a body");
      assert.equal(meshes.length, torches.length, "a torch has no sconce");
      for (const mesh of meshes)
        assert.ok(world.surfaces.includes(mesh) && mesh.material.pluginManager.getPlugin("DungeonFog").view.texture === world.fog.texture);
      // Hidden until the floor it faces is explored, and shown then: the fog alone drew half of one at the frontier.
      const floorOf = t => t.cell.z * map.size + t.cell.x + t.facing.z * map.size + t.facing.x;
      assert.ok(meshes.every(m => !m.isVisible), `seed ${seed}: a sconce shows before anything is explored`);
      world.present(new Set(), new Set([floorOf(torches[0])]), { x: 0, z: 0 }, Math.PI / 6);
      assert.deepEqual(meshes.map(m => m.isVisible), torches.map(t => floorOf(t) === floorOf(torches[0])),
        `seed ${seed}: sconces do not follow their floors into the explored set`);
      world.present(new Set(), new Set(torches.map(floorOf)), { x: 0, z: 0 }, Math.PI / 6);
      assert.ok(meshes.every(m => m.isVisible), `seed ${seed}: an explored sconce stays hidden`);
      const held = new Set();
      for (const [i, mesh] of meshes.entries()) for (const v of vertices(mesh)) {
        const near = torches.reduce((a, b) => Math.hypot(b.flame.x - v[0], b.flame.z - v[2]) < Math.hypot(a.flame.x - v[0], a.flame.z - v[2]) ? b : a);
        assert.equal(near, torches[i], `seed ${seed}: sconce ${i} is not under its own flame`);
        held.add(near);
        const face = { x: near.cell.x + near.facing.x * 0.5, z: near.cell.z + near.facing.z * 0.5 };
        const proud = (v[0] - face.x) * near.facing.x + (v[2] - face.z) * near.facing.z;
        const side = Math.abs((v[0] - face.x) * near.facing.z - (v[2] - face.z) * near.facing.x);
        assert.ok(proud >= -1e-6 && proud <= SCONCE.proud + 1e-6, `seed ${seed}: a sconce stands ${proud} m off the wall`);
        assert.ok(side < 0.1 && v[1] > 1.5 && v[1] < near.flame.y, `seed ${seed}: a sconce piece is not under its flame`);
      }
      assert.equal(held.size, torches.length, "a torch has no sconce");
      world.dispose();
    }
  } finally { arena.dispose(); }
});

test("nothing_is_drawn_over_or_under_the_copings_bevel", () => {
  // A top over the bevel hides the lit edge; a cap under it shows through the arris at an outer corner. The sills, on
  // the floor, are no part of it.
  for (const seed of [1, 2, 3]) {
    const quads = masonryQuads(levels.get(seed), 2);
    const tops = quads.filter(q => q.normal[1] === 1 && q.corners[0][1] > 0);
    const bevels = quads.filter(q => Math.abs(q.normal[1] - Math.SQRT1_2) < 1e-9 && Math.max(...q.corners.map(c => c[1])) === WALL_HEIGHT);
    const flat = q => q.corners.map(([x, , z]) => [x, z]);
    const box = q => [0, 2].map(i => [Math.min(...q.corners.map(c => c[i])), Math.max(...q.corners.map(c => c[i]))]);
    const tb = tops.map(box);
    let near = 0;
    for (const bevel of bevels) {
      const b = box(bevel);
      tops.forEach((top, i) => {
        if (tb[i].some(([lo, hi], k) => hi < b[k][0] - 1e-9 || b[k][1] < lo - 1e-9)) return;
        near++;
        assert.ok(!overlap(flat(top), flat(bevel)), `seed ${seed}: a wall top covers the coping's bevel at (${bevel.corners[0]})`);
      });
    }
    assert.ok(bevels.length > 500 && near > 1000, `${bevels.length} bevels, ${near} beside a top or a cap`);
  }
});

test("the_backing_and_cap_stand_behind_every_joint", () => {
  assert.ok(MASONRY.backing > MASONRY.relief + MASONRY.bevel && MASONRY.backing > MASONRY.copingBevel, "the backing stands in a joint");
  assert.ok(MASONRY.cap > MASONRY.copingBevel && WALL_HEIGHT - MASONRY.cap > WALL_HEIGHT - MASONRY.coping, "the cap is not inside the coping");
  // The cap closes the backing: none of it rises past the cap, where at an outer corner it would come up through the
  // coping's bevel on the face that turns there.
  for (const seed of [1, 2]) {
    const backing = masonryQuads(levels.get(seed), 2).filter(q => q.shade === MASONRY.mortar && q.normal[1] === 0);
    assert.ok(backing.length > 500 && backing.every(q => q.corners.every(c => c[1] <= WALL_HEIGHT - MASONRY.cap + 1e-9)),
      `seed ${seed}: a backing rises past the cap`);
  }
});

/** Which cells carry a wall collider, as a lookup. */
function rockOf(map) {
  const cells = new Uint8Array(map.size * map.size);
  for (let z = 0; z < map.size; z++) for (let x = 0; x < map.size; x++) cells[z * map.size + x] = boundary(map, x, z) ? 1 : 0;
  return (x, z) => x >= 0 && z >= 0 && x < map.size && z < map.size && cells[z * map.size + x] === 1;
}

/** How far a point is inside the rock the colliders make: to the nearest face, edge or top that meets open air. */
function rockDepth(rock, [x, y, z]) {
  const cx = Math.round(x), cz = Math.round(z);
  if (y < 0 || y > WALL_HEIGHT || !rock(cx, cz)) return 0;
  let depth = WALL_HEIGHT - y;
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    if ((!dx && !dz) || rock(cx + dx, cz + dz)) continue;
    const ox = dx ? Math.max(0, dx * (cx + dx * 0.5 - x)) : 0, oz = dz ? Math.max(0, dz * (cz + dz * 0.5 - z)) : 0;
    depth = Math.min(depth, Math.hypot(ox, oz));
  }
  return depth;
}

/** Where a ray from `origin` along `dir` meets a quad, as a distance, or Infinity. */
function hit(origin, dir, [a, b, c, d]) {
  let best = Infinity;
  for (const [p, q, r] of [[a, b, c], [a, c, d]]) {
    const e1 = q.map((v, i) => v - p[i]), e2 = r.map((v, i) => v - p[i]);
    const h = [dir[1] * e2[2] - dir[2] * e2[1], dir[2] * e2[0] - dir[0] * e2[2], dir[0] * e2[1] - dir[1] * e2[0]];
    const det = e1[0] * h[0] + e1[1] * h[1] + e1[2] * h[2];
    if (Math.abs(det) < 1e-12) continue;
    const s = origin.map((v, i) => v - p[i]), u = (s[0] * h[0] + s[1] * h[1] + s[2] * h[2]) / det;
    if (u < -1e-9 || u > 1 + 1e-9) continue;
    const qv = [s[1] * e1[2] - s[2] * e1[1], s[2] * e1[0] - s[0] * e1[2], s[0] * e1[1] - s[1] * e1[0]];
    const v = (dir[0] * qv[0] + dir[1] * qv[1] + dir[2] * qv[2]) / det;
    if (v < -1e-9 || u + v > 1 + 1e-9) continue;
    best = Math.min(best, (e2[0] * qv[0] + e2[1] * qv[1] + e2[2] * qv[2]) / det);
  }
  return best;
}

test("the_camera_never_sees_into_the_rock", () => {
  // Rays along the camera's view, at session 01's default pitch and the concepts' steeper one, aimed at the colliders'
  // skin wherever the camera can see it -- densely at cell edges, where corners and joints meet. The first quad a ray
  // meets faces it, and before it meets one the ray is never deeper into the rock than the cap: a slit in the masonry
  // would show the void inside. Back faces are culled, as the renderer culls them. The cap is the deepest thing meant to be seen: at pitch 30 the view runs edge-on down
  // an inner corner's notch at the coping and meets it about 0.09 m in.
  const offsets = [0.01, 0.04, 0.5, 0.96, 0.99];
  let rays = 0;
  for (const seed of [1, 3]) {
    const map = levels.get(seed), rock = rockOf(map), quads = masonryQuads(map, 2), near = new Map();
    for (const pitch of [Math.PI / 6, Math.PI / 4]) {
      const dir = [-Math.cos(pitch) * Math.SQRT1_2, -Math.sin(pitch), -Math.cos(pitch) * Math.SQRT1_2];
      const at = (p, s) => p.map((v, i) => v + dir[i] * s);
      // Each quad the camera sees the front of, filed under every cell its footprint touches.
      near.clear();
      for (const q of quads) {
        if (q.normal[0] * dir[0] + q.normal[1] * dir[1] + q.normal[2] * dir[2] >= 0) continue;
        const xs = q.corners.map(c => c[0]), zs = q.corners.map(c => c[2]);
        for (let z = Math.round(Math.min(...zs)); z <= Math.round(Math.max(...zs)); z++)
          for (let x = Math.round(Math.min(...xs)); x <= Math.round(Math.max(...xs)); x++) {
            const key = `${x},${z}`;
            (near.get(key) ?? near.set(key, []).get(key)).push(q);
          }
      }
      for (const { cell, face } of wallSurface(map)) {
        if (face === "x-" || face === "z-") continue;
        const aims = [];
        for (const i of offsets) for (const j of offsets) aims.push(face === "top" ? [cell.x - 0.5 + i, WALL_HEIGHT, cell.z - 0.5 + j]
          : face === "x+" ? [cell.x + 0.5, j * WALL_HEIGHT, cell.z - 0.5 + i] : [cell.x - 0.5 + i, j * WALL_HEIGHT, cell.z + 0.5]);
        for (const aim of aims) {
          // Only a point the camera sees past the colliders.
          let seen = true;
          for (let s = -0.005; at(aim, s)[1] <= WALL_HEIGHT; s -= 0.02) if (rockDepth(rock, at(aim, s)) > 0) { seen = false; break; }
          if (!seen) continue;
          rays++;
          const origin = at(aim, -0.05);
          let first = Infinity;
          const candidates = new Set();
          for (const s of [0, 0.15, 0.3, 0.45, 0.6]) {
            const [x, , z] = at(origin, s);
            for (const q of near.get(`${Math.round(x)},${Math.round(z)}`) ?? []) candidates.add(q);
          }
          for (const q of candidates) {
            const t = hit(origin, dir, q.corners);
            if (t > 0 && t < first) first = t;
          }
          // A ray that has met nothing 0.6 m on has either left the rock or gone deep into it long before.
          for (let s = 0; s < Math.min(first, 0.6); s += 0.01) {
            // Below the floor's tiles a ray over a floor cell has met the floor, and one over the rock outside the walls
            // is in the dark the camera already sees there. Under a wall it has found a way under the level.
            const [x, y, z] = at(origin, s), cx = Math.round(x), cz = Math.round(z);
            if (y < 0.015 && isFloor(map, cx, cz) || y < 0 && !rock(cx, cz)) break;
            if (y < 0) assert.fail(`seed ${seed}, pitch ${pitch}: a ray at (${aim.map(v => v.toFixed(2))}) sees under the floor`);
            const depth = rockDepth(rock, at(origin, s));
            if (depth > MASONRY.cap + 0.01) assert.fail(`seed ${seed}, pitch ${pitch}: a ray at (${aim.map(v => v.toFixed(2))}) sees ${depth.toFixed(3)} m into the rock`);
          }
        }
      }
    }
  }
  assert.ok(rays > 65_000, `${rays} rays`); // 69,558 measured
});
