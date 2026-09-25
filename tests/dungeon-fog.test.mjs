import test from "node:test";
import assert from "node:assert/strict";
import { createHeadlessArena } from "./harness/golem-headless-arena.mjs";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import { CUT_AWAY, FOG, WALL_HEIGHT, boundary, cutAway, doorCells, fogMask, fogSample, validateDungeonVisuals, wallSurface, SIDE_FACES } from "../src/dungeon/fog.ts";
import { buildDungeonWorld, VISUAL_CHUNK } from "../src/dungeon/world.ts";
import { DungeonFogPlugin, dungeonFog } from "../src/dungeon/fog-plugin.ts";
import { CAMERA_AZIMUTH, CAMERA_PITCH, cameraToward } from "../src/dungeon/camera.ts";

/** Azimuths every cut-away test runs at: the page's, square to the walls, and the old diagonal. */
const AZIMUTHS = [CAMERA_AZIMUTH, Math.PI / 4];
/** A point `along` metres toward a camera standing `toward` of `hero`, and `across` metres to the side, on the screen's
 * horizontal: the axes `cutAway` measures in. */
const onView = (hero, toward, along, across, y) =>
  ({ x: hero.x + along * toward.x + across * toward.z, y, z: hero.z + along * toward.z - across * toward.x });
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial.js";
import { DungeonRun } from "../src/dungeon/run.ts";
import { frameDungeon } from "../src/dungeon/camera.ts";
import { screenMovement } from "../src/dungeon/commands.ts";
import { generateLevel } from "../src/dungeon/level.ts";
import { isFloor, reveal } from "../src/dungeon/map.ts";
import { Effect } from "@babylonjs/core/Materials/effect.js";
import { DUNGEON_FIRE, flameFade, flameMaterial } from "../src/dungeon/fire.ts";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { DRESSING, torchPlacements } from "../src/dungeon/dressing.ts";
import { DUNGEON_LOOK, lightDungeon } from "../src/dungeon/lighting.ts";

const levels = new Map(Array.from({ length: 50 }, (_, i) => [i + 1, generateLevel(i + 1).map]));

/** The wall runs the colliders are built from, and the floor cells each used to be shown by (before session 02). */
function oldWallRuns(map) {
  const runs = [];
  for (let z = 0; z < map.size; z++) for (let x = 0; x < map.size;) {
    if (!boundary(map, x, z)) { x++; continue; }
    const start = x; while (x < map.size && x - start < 4 && boundary(map, x, z)) x++;
    const cells = [];
    for (let at = start - 1; at <= x; at++) for (let dz = -1; dz <= 1; dz++) if (isFloor(map, at, z + dz)) cells.push((z + dz) * map.size + at);
    runs.push({ z, start, end: x, cells });
  }
  return runs;
}

test("the_fog_mask_shows_each_wall_cell_beside_explored_ground", () => {
  let shownRock = 0, litRock = 0, darkerThanTheRun = 0;
  for (const seed of Array.from({ length: 10 }, (_, i) => i + 1)) {
    const map = levels.get(seed), explored = new Set();
    // From the start, then from two rooms' centres: the last look is what is visible, the rest remembered.
    let visible = reveal(map, map.start, explored);
    for (const room of map.rooms.slice(1, 3)) visible = reveal(map, room.centre, explored);
    const mask = fogMask(map, visible, explored), floorValue = key =>
      visible.has(key) ? 255 : explored.has(key) ? 128 : 0;
    const inDoor = new Set(map.doors.filter(d => !d.open).flatMap(d => doorCells(d).map(c => c.z * map.size + c.x)));
    for (let z = 0; z < map.size; z++) for (let x = 0; x < map.size; x++) {
      const key = z * map.size + x;
      let brightest = 0;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++)
        if ((dx || dz) && isFloor(map, x + dx, z + dz)) brightest = Math.max(brightest, floorValue((z + dz) * map.size + x + dx));
      if (inDoor.has(key)) { assert.equal(mask[key], Math.max(brightest, isFloor(map, x, z) ? floorValue(key) : 0), `seed ${seed}: door (${x}, ${z})`); continue; }
      if (isFloor(map, x, z)) { assert.equal(mask[key], floorValue(key), `seed ${seed}: floor (${x}, ${z})`); continue; }
      assert.equal(mask[key], brightest, `seed ${seed}: rock (${x}, ${z}) is its brightest floor neighbour`);
      if (mask[key] > 0) shownRock++;
      if (mask[key] === FOG.visible) litRock++;
    }
    // Stricter than the boxes, never looser: a wall cell the mask shows was in a run the old rule showed.
    for (const run of oldWallRuns(map)) {
      const shown = run.cells.some(k => explored.has(k));
      for (let x = run.start; x < run.end; x++) {
        const key = run.z * map.size + x;
        if (!shown) assert.equal(mask[key], 0, `seed ${seed}: (${x}, ${run.z}) shows in a run the boxes hid`);
        else if (mask[key] === 0) darkerThanTheRun++;
      }
    }
  }
  // Floors against a fixture that shows nothing, or shows everything.
  assert.ok(shownRock > 200 && litRock > 50 && darkerThanTheRun > 10, `${shownRock} shown, ${litRock} lit, ${darkerThanTheRun} darker`);
});

test("the_shader_draws_no_pixel_of_unexplored_ground_and_lights_a_door_beside_the_hero", () => {
  // `fogSample` is the shader's rule on the CPU (`FOG_SAMPLE`). A closed door's own cells are the exception:
  // their floor is drawn with the door (`fogMask`). Bilinear sampling alone drew the edge of
  // unexplored tiles, past thin walls too, and left every closed door in the remembered tint.
  let tiles = 0, deciding = 0, doorFaces = 0;
  const across = [-0.49, -0.25, 0, 0.25, 0.49];
  for (const seed of Array.from({ length: 10 }, (_, i) => i + 1)) {
    const map = levels.get(seed), explored = new Set();
    let visible = reveal(map, map.start, explored);
    for (const room of map.rooms.slice(1, 3)) visible = reveal(map, room.centre, explored);
    const mask = fogMask(map, visible, explored);
    for (let z = 0; z < map.size; z++) for (let x = 0; x < map.size; x++) {
      if (!isFloor(map, x, z) || mask[z * map.size + x] > 0) continue;
      tiles++;
      for (const u of across) for (const v of across)
        assert.equal(fogSample(map, mask, x + u, z + v).drawn, false, `seed ${seed}: unexplored tile (${x}, ${z}) drawn at ${u}, ${v}`);
    }
    // Every point of a wall face reads its own cell, whatever its neighbour across the face holds.
    for (const { cell, face } of wallSurface(map)) {
      if (face === "top") continue;
      const side = SIDE_FACES.find(f => f.face === face), shown = mask[cell.z * map.size + cell.x] > 0;
      const across_ = cell.z + side.dz, acrossX = cell.x + side.dx;
      if (acrossX < 0 || across_ < 0 || acrossX >= map.size || across_ >= map.size || (mask[across_ * map.size + acrossX] > 0) === shown) continue;
      for (const t of across) {
        const x = cell.x + side.dx * 0.5 + (side.dx ? 0 : t), z = cell.z + side.dz * 0.5 + (side.dz ? 0 : t);
        assert.equal(fogSample(map, mask, x, z, side.dx, side.dz).drawn, shown, `seed ${seed}: ${face} of (${cell.x}, ${cell.z}) at ${t}`);
      }
      deciding++;
    }
    // A closed door's broad face, seen from the ground beside it, is drawn in full light.
    for (const door of map.doors) {
      const n = door.axis === "x" ? { x: 1, z: 0 } : { x: 0, z: 1 };
      for (const sign of [1, -1]) {
        const beside = { x: door.point.x + sign * n.x, z: door.point.z + sign * n.z };
        if (!isFloor(map, beside.x, beside.z)) continue;
        const seen = new Set(), doorMask = fogMask(map, reveal(map, beside, seen), seen);
        for (const t of across) {
          const x = door.point.x + sign * n.x * 0.175 + n.z * t, z = door.point.z + sign * n.z * 0.175 + n.x * t;
          const sample = fogSample(map, doorMask, x, z, sign * n.x, sign * n.z);
          assert.ok(sample.drawn && sample.lit > 0.9, `seed ${seed}: door ${door.id} face ${sign} reads ${JSON.stringify(sample)}`);
        }
        doorFaces++;
      }
    }
  }
  // Only a face whose two sides differ can tell a sample pulled into its cell from one that is not.
  assert.ok(tiles > 3000 && deciding > 600 && doorFaces > 100, `${tiles} tiles, ${deciding} deciding faces, ${doorFaces} door faces`);
});

test("the_fog_shader_samples_as_fogSample_does", () => {
  // No test runs the shader, so this is a tripwire for the hand-copied parts of `fogSample`, not a proof.
  const code = DungeonFogPlugin.prototype.getCustomCode.call(null, "fragment");
  const source = Object.values(code).join(" ");
  for (const piece of ["dungeonAt = vPositionW.xz - 0.200 * vNormalW.xz", "ivec2(floor(dungeonAt + 0.5))", "ivec2(int(fogBand.w) - 1)",
    "texelFetch(fogMaskSampler, dungeonCell, 0).r < 0.020", "texture2D(fogMaskSampler, (dungeonAt + 0.5) / fogBand.w).r",
    "smoothstep(0.5, 1.0, dungeonFog)"]) assert.ok(source.includes(piece), `the shader no longer reads ${piece}`);
});

test("a_wall_in_front_ghosts_around_the_hero_and_the_opening_has_no_edge", () => {
  // The cut-away was a world-space box, 13 of 16 pixels dropped inside it and none outside: a square hole on screen.
  const hero = { x: 20, z: 20 };
  const steps = (from, to) => Array.from({ length: Math.round((to - from) / 0.02) + 1 }, (_, i) => from + i * 0.02);
  for (const azimuth of AZIMUTHS) for (const pitch of [CAMERA_PITCH, Math.PI / 4]) {
    const toward = cameraToward(azimuth);
    const cut = (along, across, y) => cutAway(hero, onView(hero, toward, along, across, y), pitch, toward);
    // Every wall in front that can hide the hero is at the heart where it covers the middle of the body.
    let hiding = 0;
    for (const along of [0.4, 0.55, 0.8, 1.1, 1.5, 1.9, 3, 4.5]) {
      const y = CUT_AWAY.centre + along * Math.tan(pitch);
      if (y > WALL_HEIGHT) continue;
      hiding++;
      assert.ok(cut(along, 0, y) > 0.999 * CUT_AWAY.most, `pitch ${pitch}: a wall ${along} m in front over the body`);
    }
    assert.ok(hiding >= 5, `pitch ${pitch}: ${hiding} depths checked`);
    // A wall the hero is pressed against, its face 0.28 m off a human's centre, is dropped as fully as the heart: the
    // shader drops a pixel whose Bayer value, k / 16, is below the share, and `ahead` is short enough for all 13.
    const dropped = share => Array.from({ length: 16 }, (_, k) => k / 16 < share).filter(Boolean).length;
    const pressed = 0.28 / Math.max(Math.abs(toward.x), Math.abs(toward.z));
    assert.equal(dropped(cut(pressed, 0, CUT_AWAY.centre + pressed * Math.tan(pitch))), dropped(CUT_AWAY.most),
      `azimuth ${azimuth}, pitch ${pitch}: a wall pressed against, ${pressed.toFixed(2)} m toward the camera`);
    // No edge: along every line across it, up it and toward the camera, no 2 cm changes the share by a tenth of its most.
    const lines = [
      steps(-4, 4).map(across => cut(1.5, across, 1.8)),
      steps(0, WALL_HEIGHT).map(y => cut(1.5, 0, y)),
      steps(-2, 8).map(along => cut(along, 0, Math.min(WALL_HEIGHT, CUT_AWAY.centre + 1.5 * Math.tan(pitch)))),
      steps(-4, 4).map(across => cut(3, across, WALL_HEIGHT)),
    ];
    for (const [i, line] of lines.entries()) {
      const jump = Math.max(...line.slice(1).map((v, j) => Math.abs(v - line[j])));
      assert.ok(jump < 0.1 * CUT_AWAY.most, `pitch ${pitch}, line ${i}: a 2 cm step of ${jump.toFixed(3)}`);
      assert.ok(Math.max(...line) > 0.5 * CUT_AWAY.most, `pitch ${pitch}, line ${i} crosses the opening`);
    }
    // Partial, and only where it helps: never a whole wall, nothing beside or behind the hero, the foot whole, the oval closed.
    // Across in the oval's own half-widths, so that some samples are always past its rim, whatever its size.
    for (const along of steps(-3, 8)) for (const k of [-1.25, -1, -0.4, 0, 0.4, 1, 1.25]) for (const y of [0, 0.1, 0.8, 1.6, WALL_HEIGHT]) {
      const across = k * CUT_AWAY.across;
      const share = cut(along, across, y);
      assert.ok(share >= 0 && share <= CUT_AWAY.most + 1e-9, `share ${share}`);
      // Not exactly 0 square to the walls: sin(pi) is 1.2e-16, so a point beside the hero is a hair toward the camera.
      if (along <= 0 || y <= CUT_AWAY.foot[0] || Math.abs(across) >= CUT_AWAY.across) assert.ok(share < 1e-12, `${along}, ${across}, ${y}: ${share}`);
    }
    // It is cut on the screen: every point on one line of sight, off the body in the soft ring and above the wall's
    // foot, drops the same share.
    const sight = t => {
      const along = 0.5 * CUT_AWAY.up * Math.sin(pitch) + t * Math.cos(pitch);
      return cut(along, 0.5 * CUT_AWAY.across, CUT_AWAY.centre - 0.5 * CUT_AWAY.up * Math.cos(pitch) + t * Math.sin(pitch));
    };
    const top = (WALL_HEIGHT - CUT_AWAY.centre + 0.5 * CUT_AWAY.up * Math.cos(pitch)) / Math.sin(pitch);
    const above = (CUT_AWAY.foot[1] - CUT_AWAY.centre + 0.5 * CUT_AWAY.up * Math.cos(pitch)) / Math.sin(pitch);
    const shares = steps(Math.max(1.5, above), Math.min(5.5, top)).map(sight).filter((_, i, all) => i % 25 === 0 || i === all.length - 1);
    for (const share of shares) assert.ok(Math.abs(share - shares[0]) < 1e-9, `pitch ${pitch}: ${shares.map(v => v.toFixed(4))}`);
    assert.ok(shares[0] > 0.1 * CUT_AWAY.most && shares[0] < 0.9 * CUT_AWAY.most, `pitch ${pitch}: ${shares[0]} is in the soft ring`);
    // Far enough toward the camera, a wall sits below the hero on screen and hides nothing: it is whole.
    assert.equal(cut(8, 0, 0.6), 0, `pitch ${pitch}: a low wall far in front`);
  }
  // The camera's pitch moves the opening: a steeper camera sees the top of a wall half a metre in front nearer the
  // body. At pitch 30 that top is in the soft ring, 0.63 dropped; at 45 it is 0.76.
  for (const azimuth of AZIMUTHS) {
    const toward = cameraToward(azimuth), top = pitch => cutAway(hero, onView(hero, toward, 0.5, 0, WALL_HEIGHT), pitch, toward);
    assert.ok(top(Math.PI / 4) > top(CAMERA_PITCH) + 0.1, `azimuth ${azimuth}: ${top(Math.PI / 4)} against ${top(CAMERA_PITCH)}`);
  }
  // The view turns the opening with it: over the body toward one camera is beside or behind the hero for the other.
  const over = onView(hero, cameraToward(CAMERA_AZIMUTH), 1, 0, CUT_AWAY.centre + Math.tan(CAMERA_PITCH));
  assert.ok(cutAway(hero, over, CAMERA_PITCH, cameraToward(CAMERA_AZIMUTH)) > 0.999 * CUT_AWAY.most);
  assert.equal(cutAway(hero, over, CAMERA_PITCH, cameraToward(CAMERA_AZIMUTH + Math.PI)), 0, "behind a camera turned round");
});

test("a_dungeon_flame_is_the_forge_flame_times_its_fade", () => {
  const forge = Effect.ShadersStore.proofFireFragmentShader, own = Effect.ShadersStore.dungeonFireFragmentShader;
  const expected = forge.replace("varying vec2 vUV; uniform float time;", "varying vec2 vUV; uniform float time; uniform float fade;")
    .replace("gl_FragColor=vec4(c,a*.82);}", "gl_FragColor=vec4(c*fade,a*.82*fade);}");
  assert.notEqual(expected, forge);
  assert.equal(own, expected);
  assert.ok(own.includes("uniform float fade;") && own.includes("vec4(c*fade,a*.82*fade)"));
  assert.deepEqual({ ...DUNGEON_FIRE }, { vertex: "proofFire", fragment: "dungeonFire" });
  assert.ok(Effect.ShadersStore.proofFireVertexShader, "the flame draws with the forge's vertex shader");
});

test("each_flame_is_drawn_with_its_own_fade", async () => {
  // One material draws every flame, so a fade set on the material would be one fade for all of them.
  const arena = await createHeadlessArena({ populateDefaultGeometry: false }), scene = arena.scene;
  try {
    const camera = new FreeCamera("probe", new Vector3(0, 0, -10), scene); camera.setTarget(Vector3.Zero());
    const look = flameMaterial(scene), fades = { a: 0.2, b: 0.9, whole: undefined };
    for (const [i, [name, fade]] of Object.entries(fades).entries()) {
      const flame = MeshBuilder.CreatePlane(name, { size: 1 }, scene);
      flame.position.x = i * 1.5; flame.material = look.material;
      if (fade !== undefined) look.setFade(flame, fade);
    }
    const drawn = new Map();
    let last;
    // Added after the material's own observer, so it runs after it: it sees what that observer wrote for this mesh.
    look.material.onBindObservable.add(mesh => drawn.set(mesh.name, last));
    for (let frame = 0; frame < 3; frame++) {
      scene.render();
      const effect = look.material.getEffect();
      if (effect && !effect.probed) {
        const setFloat = effect.setFloat.bind(effect);
        effect.setFloat = (name, value) => { if (name === "fade") last = value; return setFloat(name, value); };
        effect.probed = true;
      }
      last = undefined;
    }
    assert.deepEqual(Object.fromEntries(drawn), { a: 0.2, b: 0.9, whole: 1 });
    // NullEngine accepts a write to any name, so the write above proves nothing about the GPU. A uniform the effect
    // was not built with has no location in WebGL, and the flame would draw at the shader's default of 0: invisible.
    assert.ok(look.material.getEffect().getUniformNames().includes("fade"), "the effect declares no fade uniform");
    look.dispose();
  } finally { arena.dispose(); }
});

test("a_flame_in_the_bubble_ghosts_as_the_wall_does", () => {
  const hero = { x: 10, z: 10 }, y = DRESSING.torchHeight;
  for (const azimuth of AZIMUTHS) for (const pitch of [CAMERA_PITCH, Math.PI / 4]) {
    const toward = cameraToward(azimuth), at = (along, across) => onView(hero, toward, along, across, y);
    const fade = p => flameFade(hero, p, pitch, toward), where = `azimuth ${azimuth}, pitch ${pitch}`;
    // Over the body toward the camera: where a wall's pixels are dropped most, a flame is drawn least.
    const over = (y - CUT_AWAY.centre) / Math.tan(pitch);
    assert.ok(Math.abs(fade(at(over, 0)) - (1 - CUT_AWAY.most)) < 1e-9, `${where}: over the body`);
    assert.equal(fade(at(-1, 0)), 1, `${where}: behind the hero`);
    assert.equal(fade(at(over, CUT_AWAY.across)), 1, `${where}: beside the oval`);
    // Just inside the rim it is part-drawn: the fade is a fade, not a hole with an edge.
    const rim = fade(at(over, 0.9 * CUT_AWAY.across));
    assert.ok(rim > 1 - CUT_AWAY.most + 0.05 && rim < 0.99, `${where}: ${rim} just inside the rim`);
    assert.equal(fade(at(12, 0)), 1, `${where}: far toward the camera`);
  }
});

test("the_lantern_the_sky_and_the_flames_turn_with_the_camera", async () => {
  // The lantern hangs between the hero and the camera, so the faces the camera sees are the lit ones; the sky, set by
  // eye on the diagonal, keeps the same bearing against the view at every azimuth; and each flame fades by the view.
  const map = levels.get(1), torches = torchPlacements(map, 1), { behind, height } = DUNGEON_LOOK.lantern;
  const viewed = new Map();
  for (const azimuth of [...AZIMUTHS, 1]) {
    const arena = await createHeadlessArena({ populateDefaultGeometry: false }), where = `azimuth ${azimuth}`;
    try {
      const toward = cameraToward(azimuth), camera = new FreeCamera("probe", Vector3.Zero(), arena.scene);
      // The hero stands where the first torch's flame is over the body toward the camera: the heart of the cut-away.
      const { flame } = torches[0], over = (flame.y - CUT_AWAY.centre) / Math.tan(CAMERA_PITCH);
      const hero = { x: flame.x - toward.x * over, z: flame.z - toward.z * over };
      const lighting = lightDungeon(arena.scene, camera, map, torches, azimuth);
      lighting.setLook({ ssao: false, post: false });
      frameDungeon(camera, hero, 10, 1.5, CAMERA_PITCH, azimuth);
      lighting.update(hero, 10, CAMERA_PITCH, toward);
      lighting.refreshFog(new Set([...map.floor.keys()].filter(i => map.floor[i])));
      // Each flame's fade as it binds, read as `each_flame_is_drawn_with_its_own_fade` reads it.
      const fire = arena.scene.getMeshByName("torch.flame.0").material, drawn = new Map();
      let last;
      fire.onBindObservable.add(mesh => drawn.set(mesh.name, last));
      for (let frame = 0; frame < 3; frame++) {
        arena.scene.render();
        const effect = fire.getEffect();
        if (effect && !effect.probed) {
          const setFloat = effect.setFloat.bind(effect);
          effect.setFloat = (name, value) => { if (name === "fade") last = value; return setFloat(name, value); };
          effect.probed = true;
        }
        last = undefined;
      }
      assert.ok(Math.abs(drawn.get("torch.flame.0") - (1 - CUT_AWAY.most)) < 1e-9, `${where}: the flame over the body drew at ${drawn.get("torch.flame.0")}`);
      for (const [name, fade] of drawn) {
        const { position } = arena.scene.getMeshByName(name);
        assert.ok(Math.abs(fade - flameFade(hero, position, CAMERA_PITCH, toward)) < 1e-9, `${where}: ${name}`);
      }
      const { x, y, z } = lighting.lantern.position;
      assert.ok(Math.hypot(x - hero.x - toward.x * behind, z - hero.z - toward.z * behind) < 1e-9 && y === height, `${where}: lantern at ${x}, ${z}`);
      const sky = arena.scene.lights.find(l => l.name === "dungeon ambient").direction;
      viewed.set(azimuth, [sky.x * toward.x + sky.z * toward.z, sky.y, sky.x * toward.z - sky.z * toward.x]);
      if (azimuth === Math.PI / 4) assert.ok(Math.hypot(sky.x - 0.3, sky.y - 1, sky.z + 0.4) < 1e-9, `${where}: the sky as it was tuned`);
      lighting.dispose();
    } finally { arena.dispose(); }
  }
  // A matrix is single precision: the turned sky agrees to about 1e-9, not to the last bit.
  for (const [azimuth, seen] of viewed) seen.forEach((v, i) =>
    assert.ok(Math.abs(v - viewed.get(Math.PI / 4)[i]) < 1e-6, `azimuth ${azimuth}: the sky reads ${seen} against the view`));
});

test("the_cut_away_shader_is_cutAway_and_is_handed_the_pitch", async () => {
  // No test runs the shader, so this is a tripwire for the hand-copied rule, not a proof.
  const f = v => v.toFixed(3);
  const source = Object.values(DungeonFogPlugin.prototype.getCustomCode.call(null, "fragment")).join(" ");
  for (const piece of ["dungeonAlong = dot(dungeonAhead, fogToward)", "dungeonAcross = dungeonAhead.x * fogToward.y - dungeonAhead.y * fogToward.x",
    `(vPositionW.y - ${f(CUT_AWAY.centre)}) * fogBand.x - dungeonAlong * fogBand.y`,
    `${f(CUT_AWAY.most)} * (1.0 - smoothstep(${f(CUT_AWAY.soft)}, 1.0, length(vec2(dungeonAcross / ${f(CUT_AWAY.across)}, dungeonUp / ${f(CUT_AWAY.up)}))))`,
    `${f(CUT_AWAY.up)}))))
  * smoothstep(0.0, ${f(CUT_AWAY.ahead)}, dungeonAlong) * smoothstep(${f(CUT_AWAY.foot[0])}, ${f(CUT_AWAY.foot[1])}, vPositionW.y);`,
    "dungeonBayer4(gl_FragCoord.xy) < dungeonCut) discard"]) assert.ok(source.includes(piece), `the shader no longer reads ${piece}`);
  const arena = await createHeadlessArena({ populateDefaultGeometry: false }), map = levels.get(1);
  try {
    const fog = dungeonFog(arena.scene, map), plugin = fog.attach(new PBRMaterial("probe", arena.scene), "wall");
    const uniforms = plugin.getUniforms();
    assert.ok(uniforms.ubo.some(u => u.name === "fogToward" && u.size === 2 && u.type === "vec2"), "fogToward is in the uniform buffer");
    assert.ok(uniforms.fragment.includes("uniform vec2 fogToward;"), "and declared where there is no uniform buffer");
    for (const azimuth of AZIMUTHS) for (const pitch of [CAMERA_PITCH, Math.PI / 4]) {
      const toward = cameraToward(azimuth);
      fog.update(new Set(), new Set(), pitch, toward);
      const bound = {};
      plugin.bindForSubMesh({ updateFloat2: (n, ...v) => { bound[n] = v; }, updateFloat4: (n, ...v) => { bound[n] = v; }, setTexture() {} });
      assert.deepEqual([bound.fogBand[0], bound.fogBand[1], bound.fogBand[3]], [Math.cos(pitch), Math.sin(pitch), map.size]);
      assert.deepEqual(bound.fogHero, [map.start.x, map.start.z]);
      assert.deepEqual(bound.fogToward, [toward.x, toward.z], `azimuth ${azimuth}`);
    }
    fog.dispose();
  } finally { arena.dispose(); }
});

test("the_wall_surface_is_the_outer_skin_of_the_colliders", () => {
  for (const [seed, map] of levels) {
    const quads = wallSurface(map);
    assert.deepEqual(validateDungeonVisuals(map, quads), [], `seed ${seed}`);
    const tops = new Map(), sides = new Set();
    for (const { cell, face } of quads) {
      if (face === "top") tops.set(`${cell.x},${cell.z}`, (tops.get(`${cell.x},${cell.z}`) ?? 0) + 1);
      else sides.add(`${cell.x},${cell.z},${face}`);
    }
    const expectedSides = new Set(), cells = oldWallRuns(map).flatMap(r =>
      Array.from({ length: r.end - r.start }, (_, i) => ({ x: r.start + i, z: r.z })));
    for (const { x, z } of cells) {
      assert.equal(tops.get(`${x},${z}`), 1, `seed ${seed}: one top on the collider cell (${x}, ${z})`);
      for (const { face, dx, dz } of SIDE_FACES) if (!boundary(map, x + dx, z + dz)) expectedSides.add(`${x},${z},${face}`);
    }
    assert.equal(tops.size, cells.length, `seed ${seed}: a top on every collider cell and nowhere else`);
    assert.deepEqual([...sides].sort(), [...expectedSides].sort(), `seed ${seed}: sides only where a collider meets no other`);
  }
});

test("validateDungeonVisuals_refuses_a_quad_off_the_colliders_and_a_quad_drawn_twice", () => {
  const map = levels.get(1), quads = wallSurface(map);
  assert.deepEqual(validateDungeonVisuals(map, [...quads, { cell: { ...map.start }, face: "top" }]),
    [`top at (${map.start.x}, ${map.start.z}) stands on a cell with no collider`]);
  assert.equal(validateDungeonVisuals(map, [...quads, quads[5]]).length, 1);
});

test("a_visual_world_draws_few_meshes_and_every_one_is_fogged", async () => {
  const arena = await createHeadlessArena({ populateDefaultGeometry: false });
  try {
    const map = generateLevel(1).map, world = buildDungeonWorld(arena.scene, map, true);
    const colliders = arena.scene.meshes.filter(m => m.physicsBody && !m.name.startsWith("door."));
    assert.ok(colliders.length > 170, `${colliders.length} colliders: the filter did not find the walls`); // 199 measured
    assert.ok(colliders.every(m => !m.isVisible), "a wall collider or the slab is drawn");
    const drawn = arena.scene.meshes.filter(m => m.isVisible && !m.name.startsWith("door.") && m.name !== "exit sigil");
    assert.deepEqual(drawn.map(m => m.name).sort(), world.surfaces.map(m => m.name).sort(), "only the merged surfaces are drawn");
    const chunks = Math.ceil(map.size / VISUAL_CHUNK) ** 2;
    assert.ok(drawn.length <= 2 * chunks && drawn.length <= 40, `${drawn.length} surface meshes`);
    for (const mesh of [...drawn, ...arena.scene.meshes.filter(m => m.name.startsWith("door."))]) {
      const plugin = mesh.material?.pluginManager?.getPlugin("DungeonFog");
      assert.ok(plugin && plugin.view.texture === world.fog.texture, `${mesh.name} is not fogged by the level's mask`);
    }
    // Each quad faces the way its normal says: Babylon's own normals, from the winding, agree with the authored ones.
    for (const mesh of world.surfaces) {
      const positions = mesh.getVerticesData(VertexBuffer.PositionKind), authored = mesh.getVerticesData(VertexBuffer.NormalKind);
      const computed = []; VertexData.ComputeNormals(positions, mesh.getIndices(), computed);
      for (let i = 0; i < authored.length; i++) assert.ok(Math.abs(computed[i] - authored[i]) < 1e-9, `${mesh.name} winds a quad backwards`);
    }
    world.dispose();
  } finally { arena.dispose(); }
});

test("presenting_a_run_writes_its_fog_mask_and_no_golem_is_fogged", async () => {
  const arena = await createHeadlessArena({ populateDefaultGeometry: false });
  const run = new DungeonRun(arena.scene, 3, "default", true);
  try {
    run.present();
    const { fog } = run.world;
    assert.deepEqual(fog.bytes, fogMask(run.map, run.visible, run.explored));
    assert.equal(fog.bytes[run.map.start.z * run.map.size + run.map.start.x], FOG.visible);
    assert.ok(fog.bytes.some(b => b === 0), "the level is not all explored at the start");
    for (const actor of run.actors) for (const { mesh } of actor.meshes)
      assert.equal(mesh.material?.pluginManager?.getPlugin("DungeonFog") ?? null, null, `${mesh.name} carries the dungeon's fog`);
    // The run hands on the view the page gives it, not the default one: to the fog, and to the keys.
    const diagonal = cameraToward(Math.PI / 4);
    run.toward = diagonal; run.present();
    assert.deepEqual(run.world.surfaces[0].material.pluginManager.getPlugin("DungeonFog").view.toward, diagonal);
    run.commands.setMode({ keyboard: true, facing: false }); run.commands.right = 1;
    // `heroMovement` is private to TypeScript alone.
    assert.deepEqual(run.heroMovement(), screenMovement(1, 0, diagonal));
  } finally { run.dispose(); arena.dispose(); }
});
