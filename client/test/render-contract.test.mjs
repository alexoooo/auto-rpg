import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
// The one copy, shared with `vite.config.ts`: the build assertion and this
// file's are the same claim about the same graph, and two copies would
// eventually be two claims that both pass about different graphs.
import * as chunkGraph from "../../tools/chunk-graph.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = path.join(ROOT, ".tools", "render-test");
fs.mkdirSync(OUT, { recursive: true });
const tsc = spawnSync(process.execPath, [
  path.join(ROOT, "node_modules", "typescript", "bin", "tsc"),
  "--ignoreConfig",
  "--target", "ES2022", "--module", "ES2022", "--moduleResolution", "bundler",
  "--ignoreDeprecations", "6.0", "--strict", "--skipLibCheck",
  "--outDir", OUT, "--rootDir", ROOT,
  "client/src/protocol/abi.generated.ts", "client/src/protocol/messages.ts",
  "client/src/state/snapshot.ts", "client/src/render/presentation.ts",
  "client/src/render/visibility.ts", "client/src/render/interpolation.ts",
  "client/src/render/stress.ts", "client/src/render/engine.ts",
  "client/src/render/scene.ts", "client/src/render/camera.ts", "client/src/render/debug.ts",
  "client/src/render/environment.ts", "client/src/render/actors.ts", "client/src/render/transients.ts",
  "client/src/render/rig-names.ts", "client/src/render/rig-nodes.ts", "client/src/render/figure.ts",
  "client/src/render/renderer.ts", "client/src/render/performance.ts",
  "client/src/render/frame-meter.ts", "client/src/render/presentation-mode.ts",
  "client/src/render/canvas-control.ts", "client/src/render/capture-controls.ts",
  "client/src/render/room-asset.generated.ts", "client/src/render/room-asset-contract.ts",
  "client/src/render/room-assets.ts", "client/src/render/room-environment.ts",
  "client/src/render/room-flame.ts",
  "client/src/render/room-objects.ts",
  "client/src/render/room-material-variants.ts",
  "client/src/render/room-occlusion.ts",
  "client/src/render/room-stress.ts", "client/src/render/room-review.ts", "client/src/render/room-review-camera.ts",
  "client/src/render/combatant-asset.generated.ts", "client/src/render/combatant-asset-contract.ts",
  "client/src/render/combatant-assets.ts", "client/src/render/combatant-dress.ts",
  "client/src/input/greybox-input.ts", "client/src/bootstrap.ts",
  // The arena's scene is a renderer even though it does not live under
  // `render/`: it owns three cameras, a mesh registry and a debug owner, and
  // every question this file exists to ask about those is asked of it too.
  // `environment.ts` joined it in v2-ui-03, which is where the arena grew a
  // light, a shadow generator and a room to stand in.
  "client/src/arena/geometry.ts", "client/src/arena/scene.ts", "client/src/arena/environment.ts",
], { cwd: ROOT, encoding: "utf8" });
assert.equal(tsc.status, 0, `TypeScript test compilation failed:\n${tsc.stdout}\n${tsc.stderr}`);

fs.writeFileSync(path.join(OUT, "package.json"), '{"type":"module"}\n');
const load = (relative) => import(pathToFileURL(path.join(OUT, relative)).href);
const ABI = await load("client/src/protocol/abi.generated.js");
const presentation = await load("client/src/render/presentation.js");
const visibility = await load("client/src/render/visibility.js");
const interpolation = await load("client/src/render/interpolation.js");
const stress = await load("client/src/render/stress.js");
const rendererEngine = await load("client/src/render/engine.js");
const rendererScene = await load("client/src/render/scene.js");
const rendererCamera = await load("client/src/render/camera.js");
const greyboxRenderer = await load("client/src/render/renderer.js");
const frameMeter = await load("client/src/render/frame-meter.js");
const presentationMode = await load("client/src/render/presentation-mode.js");
const rendererDebug = await load("client/src/render/debug.js");
const rendererEnvironment = await load("client/src/render/environment.js");
const rendererActors = await load("client/src/render/actors.js");
const rendererFigure = await load("client/src/render/figure.js");
const rigNames = await load("client/src/render/rig-names.js");
const rendererTransients = await load("client/src/render/transients.js");
const greyboxInput = await load("client/src/input/greybox-input.js");
const bootstrap = await load("client/src/bootstrap.js");
const rendererPerformance = await load("client/src/render/performance.js");
const canvasControl = await load("client/src/render/canvas-control.js");
const captureControl = await load("client/src/render/capture-controls.js");
const roomAssetContract = await load("client/src/render/room-asset-contract.js");
const roomAssets = await load("client/src/render/room-assets.js");
const roomEnvironment = await load("client/src/render/room-environment.js");
const roomFlame = await load("client/src/render/room-flame.js");
const roomObjects = await load("client/src/render/room-objects.js");
const roomMaterialVariants = await load("client/src/render/room-material-variants.js");
const roomOcclusion = await load("client/src/render/room-occlusion.js");
const roomStress = await load("client/src/render/room-stress.js");
const roomReview = await load("client/src/render/room-review.js");
const roomReviewCamera = await load("client/src/render/room-review-camera.js");
const roomGenerated = await load("client/src/render/room-asset.generated.js");
const combatantAssetContract = await load("client/src/render/combatant-asset-contract.js");
const combatantAssets = await load("client/src/render/combatant-assets.js");
const combatantDress = await load("client/src/render/combatant-dress.js");
const { NullEngine } = await import("@babylonjs/core/Engines/nullEngine.js");
const { Scene } = await import("@babylonjs/core/scene.js");
const { LoadAssetContainerAsync } = await import("@babylonjs/core/Loading/sceneLoader.js");
const arenaGeometry = await load("client/src/arena/geometry.js");
const arenaScene = await load("client/src/arena/scene.js");
const arenaEnvironment = await load("client/src/arena/environment.js");

test("the_room_variant_selector_is_repeatable_uses_every_variant_and_avoids_checkerboards", () => {
  const first = [];
  const counts = Array(8).fill(0);
  for (let ty = 0; ty < 32; ty++) for (let tx = 0; tx < 48; tx++) {
    const variant = roomMaterialVariants.chooseRoomFloorVariant(1592594996, tx, ty);
    assert.deepEqual(variant, roomMaterialVariants.chooseRoomFloorVariant(1592594996, tx, ty));
    counts[variant.id]++;
    first.push(variant.id);
  }
  assert.ok(counts.every((count) => count > 150), `all eight variants need useful coverage: ${counts}`);
  let alternating = 0;
  for (let ty = 0; ty < 31; ty++) for (let tx = 0; tx < 47; tx++) {
    const at = ty * 48 + tx;
    if (first[at] === first[at + 49] && first[at + 1] === first[at + 48] &&
        first[at] !== first[at + 1]) alternating++;
  }
  assert.ok(alternating < 80, `the variant field must not collapse into a checkerboard: ${alternating}`);
  const walls = new Set();
  for (let side = 0; side < 4; side++) for (let tx = 0; tx < 20; tx++) {
    walls.add(roomMaterialVariants.chooseRoomWallSurfaceVariant(1592594996, tx, 7, side));
  }
  assert.deepEqual([...walls].sort(), [0, 1, 2, 3, 4, 5]);
});

const packedPublication = ({ epoch = 2, tick = 7, generation = 3, unitCount = 1 } = {}) => {
  const frame = new Float32Array(ABI.HEADER_LEN + ABI.UNIT_STRIDE + ABI.SHOT_STRIDE + ABI.EVENT_STRIDE);
  frame[ABI.HEADER_UNIT_COUNT] = unitCount;
  frame[ABI.HEADER_SHOT_COUNT] = 1;
  frame[ABI.HEADER_EVENT_COUNT] = 1;
  const body = ABI.HEADER_LEN;
  frame[body + ABI.UNIT_X] = 1.25;
  frame[body + ABI.UNIT_Y] = 2.5;
  frame[body + ABI.UNIT_FACING_RAW] = 16384;
  frame[body + ABI.UNIT_RADIUS] = 0.375;
  frame[body + ABI.UNIT_HP] = 6;
  frame[body + ABI.UNIT_MAX_HP] = 9;
  frame[body + ABI.UNIT_ENTITY_INDEX] = 11;
  frame[body + ABI.UNIT_ENTITY_GENERATION] = generation;
  frame[body + ABI.UNIT_ACTION_KIND] = 4;
  frame[body + ABI.UNIT_VISIBLE] = 1;
  frame[body + ABI.UNIT_VX] = -0.25;
  frame[body + ABI.UNIT_SWING_SPAN] = 0.75;
  const shot = ABI.HEADER_LEN + unitCount * ABI.UNIT_STRIDE;
  frame[shot + ABI.SHOT_X] = 3.25;
  frame[shot + ABI.SHOT_Y] = 4.5;
  frame[shot + ABI.SHOT_HEADING_RAW] = 32768;
  frame[shot + ABI.SHOT_FACTION] = 1;
  const event = shot + ABI.SHOT_STRIDE;
  frame[event + ABI.EVENT_KIND] = ABI.EVENT_DAMAGE;
  frame[event + ABI.EVENT_X] = 5.25;
  frame[event + ABI.EVENT_Y] = 6.5;
  frame[event + ABI.EVENT_AMOUNT] = 7;
  frame[event + ABI.EVENT_ACTOR_INDEX] = 11;
  frame[event + ABI.EVENT_OTHER_INDEX] = 12;
  frame[event + ABI.EVENT_AUX0] = 13;
  frame[event + ABI.EVENT_AUX1] = 14;
  const map = Uint8Array.of(ABI.MAP_OPEN, ABI.MAP_SOLID);
  const vis = Uint8Array.of(2, 1);
  const furniture = Uint8Array.of(ABI.FURNITURE_DOOR, 1, 0, ABI.FURNITURE_DOOR_OPEN);
  const dungeonObjects = new Uint32Array(0);
  return {
    message: { epoch, tick, mapCols: 2, mapRows: 1, mapTileSizeMilli: ABI.MAP_TILE_MILLI,
      mapRevision: 4, visRevision: 5, furnitureRevision: 6, dungeonObjectRevision: 7 },
    view: { frame, map, vis, furniture, dungeonObjects, entityKey: () => "unused" },
  };
};

const unit = (values = {}) => Object.freeze({
  key: "1:1", index: 1, generation: 1,
  x: 2.5, y: 0.5, facing: 0, radius: 0.4, hp: 10, maxHp: 10,
  faction: 0, kind: 0, intent: 0, visible: true,
  limbAngle: 0, limbReach: 0.5, limbSpin: 0, actionLength: 0,
  actionArc: 0, hitFlash: 0, blockFlash: 0, parryFlash: 0,
  limbSwing: 0, limbSwingLeft: 0, limbLine: 0, actionKind: 0,
  actionRole: 0, slot: 0, slot0Action: 0, slot1Action: 0,
  sightRange: 4, vx: 0, vy: 0, stridePhase: 0, swingSpan: 0,
  ...values,
});

const snapshot = (values = {}) => Object.freeze({
  epoch: 1, tick: 1, mapCols: 3, mapRows: 1, tileSize: 1,
  mapRevision: 1, visRevision: 1, furnitureRevision: 1, dungeonObjectRevision: 1,
  map: Object.freeze([255, 0, 1]), vis: Object.freeze([2, 1, 2]),
  units: Object.freeze([]), shots: Object.freeze([]), events: Object.freeze([]),
  furniture: Object.freeze([]),
  dungeonObjects: Object.freeze([]),
  ...values,
});

const dungeonObject = (values = {}) => Object.freeze({
  key: "object:1", kind: ABI.DUNGEON_OBJECT_DOOR, identity: 1, stateFlags: 0,
  x: 0.5, y: 0.5, yawRaw: 0, halfX: 0.42, halfY: 0.10,
  hp: 10, maxHp: 10, progress: 0, materialCode: 1,
  ...values,
});

const roomObjectHarness = async () => {
  const { DirectionalLight } = await import("@babylonjs/core/Lights/directionalLight.js");
  const { ShadowGenerator } = await import("@babylonjs/core/Lights/Shadows/shadowGenerator.js");
  const { Vector3 } = await import("@babylonjs/core/Maths/math.vector.js");
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const light = new DirectionalLight("object-test-key", new Vector3(-1, -1, -1), scene);
  const shadows = new ShadowGenerator(128, light);
  const objects = new roomObjects.RoomObjectPresentation(scene, shadows);
  return { engine, scene, light, shadows, objects };
};

test("door_hinge_uses_collision_pivot_and_push_progress_then_opens_over_450ms", async () => {
  const harness = await roomObjectHarness();
  const world = snapshot({ mapCols: 1, mapRows: 1, map: Object.freeze([ABI.MAP_OPEN]),
    vis: Object.freeze([2]), dungeonObjects: Object.freeze([dungeonObject({ progress: 0.5 })]) });
  harness.objects.acceptSnapshot(world, 0);
  const root = harness.scene.getTransformNodeByName("room-object:object:1:root");
  const hinge = harness.scene.getTransformNodeByName("room-object:object:1:door:hinge");
  const leaf = harness.scene.getMeshByName("room-object:object:1:door:leaf");
  assert.ok(root && hinge && leaf);
  assert.equal(hinge.position.x, -0.42);
  assert.equal(leaf.parent, hinge);
  assert.equal(leaf.position.x, 0.42);
  assert.ok(Math.abs(hinge.rotation.y - 0.07) < 1e-12, "published push pressure moves the latch edge");
  harness.objects.acceptSnapshot(snapshot({ ...world, tick: 2, dungeonObjectRevision: 2,
    dungeonObjects: Object.freeze([dungeonObject({ stateFlags: 1, progress: 1 })]) }), 100);
  harness.objects.advanceMotion(325);
  assert.ok(hinge.rotation.y > 0.07 && hinge.rotation.y < Math.PI / 2);
  harness.objects.advanceMotion(550);
  assert.ok(Math.abs(hinge.rotation.y - roomObjects.DOOR_OPEN_ANGLE) < 1e-12);
  assert.equal(harness.scene.getTransformNodeByName("room-object:object:1:root"), root,
    "door state changes reuse object identity");
  harness.objects.reset();
  harness.objects.acceptSnapshot(snapshot({ ...world, dungeonObjects: Object.freeze([
    dungeonObject({ stateFlags: 1, progress: 1 }),
  ]) }), 900);
  assert.ok(Math.abs(harness.scene.getTransformNodeByName(
    "room-object:object:1:door:hinge").rotation.y - Math.PI / 2) < 1e-12,
  "an initially open door starts open");
  harness.objects.dispose(); harness.shadows.dispose(); harness.light.dispose();
  harness.scene.dispose(); harness.engine.dispose();
});

test("inside_facing_torches_close_socket_light_and_all_four_cardinal_faces", async () => {
  const { Vector3 } = await import("@babylonjs/core/Maths/math.vector.js");
  const harness = await roomObjectHarness();
  const torches = Object.freeze([0, 16384, 32768, 49152].map((yawRaw, index) => dungeonObject({
    key: `object:${index + 1}`, kind: ABI.DUNGEON_OBJECT_TORCH, identity: index + 1,
    x: index + 0.5, yawRaw, halfX: 0.1, halfY: 0.1,
  })));
  harness.objects.acceptSnapshot(snapshot({ mapCols: 4, mapRows: 1,
    map: Object.freeze(new Array(4).fill(ABI.MAP_OPEN)), vis: Object.freeze(new Array(4).fill(2)),
    dungeonObjects: torches }), 0);
  assert.equal(harness.objects.counts().objects, 4);
  for (const [index, raw] of [0, 16384, 32768, 49152].entries()) {
    const prefix = `room-object:object:${index + 1}`;
    const root = harness.scene.getTransformNodeByName(prefix + ":root");
    const bowl = harness.scene.getMeshByName(prefix + ":torch:bowl");
    const light = harness.scene.getLightByName(prefix + ":torch:light");
    assert.ok(root && bowl && light);
    assert.ok(Math.abs(root.rotation.y + raw / 65536 * Math.PI * 2) < 1e-12);
    assert.equal(harness.scene.meshes.filter((mesh) => mesh.name.startsWith(prefix + ":torch:flame:")).length, 4,
      "two crossed outer planes and two smaller core planes preserve the flame from every camera quarter-turn");
    const outerUvs = harness.scene.getMeshByName(prefix + ":torch:flame:0").getVerticesData("uv");
    const coreUvs = harness.scene.getMeshByName(prefix + ":torch:flame:core:0").getVerticesData("uv");
    assert.deepEqual([
      Math.min(...outerUvs.filter((_, at) => at % 2 === 0)), Math.max(...outerUvs.filter((_, at) => at % 2 === 0)),
      Math.min(...outerUvs.filter((_, at) => at % 2 === 1)), Math.max(...outerUvs.filter((_, at) => at % 2 === 1)),
      Math.min(...coreUvs.filter((_, at) => at % 2 === 0)), Math.max(...coreUvs.filter((_, at) => at % 2 === 0)),
      Math.min(...coreUvs.filter((_, at) => at % 2 === 1)), Math.max(...coreUvs.filter((_, at) => at % 2 === 1)),
    ], [0, 1, 0, 1, 0, 1, 0, 1],
    "physical flames use the pinned top-row crop at full UV range; atlas quadrants cannot drift into pottery");
    assert.ok(light.intensity >= 7 && light.intensity <= 8.6,
      "physical torch flicker must preserve the broad warm pool instead of replacing it with a dim icon");
    assert.equal(harness.scene.getMeshByName(prefix + ":torch:flame:0").material.alphaMode, 1,
      "the authored RGB plume must use additive blending instead of disappearing in WebGPU alpha cutoff");
    assert.ok(harness.scene.getMeshByName(prefix + ":torch:flame:0").position.z > bowl.position.z + 0.12,
      "the flame sprite must sit beyond the wall face instead of depth-testing behind it");
    assert.ok(Vector3.Distance(bowl.position, light.position) < 0.45,
      "the bowl, cross-plane flame, and bounded light share one socket closure");
  }
  harness.objects.dispose(); harness.shadows.dispose(); harness.light.dispose();
  harness.scene.dispose(); harness.engine.dispose();
});

test("physical_props_keep_identity_break_on_state_edge_and_obey_fog_and_fallback", async () => {
  const harness = await roomObjectHarness();
  const props = Object.freeze([
    dungeonObject({ key: "object:10", kind: ABI.DUNGEON_OBJECT_BARREL, identity: 10 }),
    dungeonObject({ key: "object:11", kind: ABI.DUNGEON_OBJECT_POTTERY, identity: 11, x: 1.5 }),
    dungeonObject({ key: "object:12", kind: ABI.DUNGEON_OBJECT_WEB, identity: 12, x: 2.5 }),
    dungeonObject({ key: "object:13", kind: ABI.DUNGEON_OBJECT_WATER, identity: 13, x: 3.5 }),
    dungeonObject({ key: "object:14", kind: 99, identity: 14, x: 4.5 }),
  ]);
  const world = snapshot({ mapCols: 5, mapRows: 1,
    map: Object.freeze(new Array(5).fill(ABI.MAP_OPEN)), vis: Object.freeze(new Array(5).fill(2)),
    dungeonObjects: props });
  harness.objects.acceptSnapshot(world, 0);
  assert.deepEqual(harness.objects.keys(), ["object:10", "object:11", "object:12", "object:13"]);
  const root = harness.scene.getTransformNodeByName("room-object:object:10:root");
  const body = harness.scene.getMeshByName("room-object:object:10:barrel:body");
  assert.ok(root && body && body.isPickable);
  harness.objects.acceptSnapshot(snapshot({ ...world, tick: 2, dungeonObjectRevision: 2,
    dungeonObjects: Object.freeze([dungeonObject({ key: "object:10", kind: ABI.DUNGEON_OBJECT_BARREL,
      identity: 10, stateFlags: 1, hp: 0 })]) }), 10);
  assert.equal(body.isDisposed(), true, "the break edge disposes intact physical art once");
  assert.equal(harness.scene.getTransformNodeByName("room-object:object:10:root"), root);
  assert.equal(harness.scene.meshes.filter((mesh) => mesh.name.startsWith(
    "room-object:object:10:debris:")).length, 5);
  harness.objects.acceptSnapshot(snapshot({ ...world, tick: 3, visRevision: 2,
    vis: Object.freeze(new Array(5).fill(0)) }), 20);
  assert.deepEqual(harness.objects.keys(), []);
  assert.equal(root.isDisposed(), true);
  harness.objects.dispose(); harness.shadows.dispose(); harness.light.dispose();
  harness.scene.dispose(); harness.engine.dispose();
});

test("room_environment_consumes_object_publication_without_duplicating_legacy_furniture", async () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const debug = new rendererDebug.RendererDebugRegistry();
  const room = new roomEnvironment.RoomEnvironmentPresentation(scene, debug, await fakeRoomAsset(scene));
  const torch = dungeonObject({ key: "object:21", kind: ABI.DUNGEON_OBJECT_TORCH,
    identity: 21, x: 0.5, y: 0.5, yawRaw: 32768 });
  room.acceptSnapshot(snapshot({ mapCols: 1, mapRows: 1, map: Object.freeze([ABI.MAP_OPEN]),
    vis: Object.freeze([2]), dungeonObjects: Object.freeze([torch]),
    furniture: Object.freeze([Object.freeze({ key: `${ABI.FURNITURE_TORCH}:0:0`,
      kind: ABI.FURNITURE_TORCH, tx: 0, ty: 0, state: ABI.TORCH_FACE_POS_X })]) }));
  assert.ok(scene.getTransformNodeByName("room-object:object:21:root"));
  assert.equal(scene.meshes.some((mesh) => mesh.name.startsWith("room:furniture:")), false);
  assert.deepEqual(room.keys().filter((key) => key.startsWith("object:")), ["object:21"]);
  assert.equal(room.counts().furniture, 1);
  assert.equal(room.counts().lights, 2, "one room key and one bounded physical torch light");
  room.dispose(); scene.dispose(); engine.dispose();
});

test("interpolation_does_not_mutate_or_reveal_future_snapshots", () => {
  const oldUnit = unit({ x: 2.1, facing: Math.PI * 1.9, stridePhase: 0.9 });
  const existing = unit({ x: 2.9, facing: Math.PI * 0.1, stridePhase: 0.1 });
  const arriving = unit({ key: "2:1", index: 2, x: 2.7 });
  const previous = snapshot({ tick: 10, units: Object.freeze([oldUnit]) });
  const current = snapshot({ tick: 13, units: Object.freeze([existing, arriving]) });
  const before = JSON.stringify([previous, current]);

  const halfway = interpolation.interpolatePresentation(previous, current, 0.5);
  assert.deepEqual(halfway.units.map((body) => body.key), ["1:1"]);
  assert.equal(halfway.units[0].x, 2.5);
  assert.ok(Math.abs(halfway.units[0].facing - Math.PI * 2) < 1e-12);
  assert.ok(halfway.units[0].stridePhase < 1e-12 || Math.abs(halfway.units[0].stridePhase - 1) < 1e-12);
  assert.deepEqual(interpolation.interpolatePresentation(previous, current, 1).units.map((body) => body.key), ["1:1", "2:1"]);
  assert.equal(JSON.stringify([previous, current]), before);

  const timeline = new interpolation.PresentationTimeline();
  assert.equal(timeline.acceptSnapshot(previous, 100).alpha, 1);
  assert.equal(timeline.acceptSnapshot(current, 110).alpha, 0);
  assert.equal(timeline.sample(135).alpha, 0.5);
  assert.equal(timeline.sample(500).alpha, 1);
  const replacement = snapshot({ tick: 13, units: Object.freeze([unit({ x: 2.4 })]) });
  assert.equal(timeline.acceptSnapshot(replacement, 500).alpha, 1);
  assert.equal(timeline.sample(501).alpha, 1);
  assert.throws(() => timeline.acceptSnapshot(snapshot({ tick: 12 }), 502), /tick moved backwards/);
  assert.throws(() => interpolation.interpolatePresentation(previous, snapshot({ epoch: 2 }), 0.5), /different epochs/);
});

test("unseen_units_have_no_render_audio_pick_or_debug_presence", () => {
  const world = snapshot({ units: Object.freeze([
    unit({ key: "1:1", x: 0.5 }),
    unit({ key: "2:1", index: 2, x: 1.5 }),
    unit({ key: "3:1", index: 3, x: 2.5, visible: false }),
  ]) });
  for (const body of world.units) {
    const decision = visibility.decideUnitPresence(world, body);
    assert.equal(decision.render, false);
    assert.equal(decision.audio, false);
    assert.equal(decision.pick, false);
    assert.equal(decision.debug, false);
  }
  assert.deepEqual(visibility.decidePointPresence(world, "unit", Number.NaN, 0), visibility.decidePointPresence(world, "unit", -1, 0));
});

test("unseen_shots_events_and_furniture_have_no_persistent_presence", () => {
  const world = snapshot();
  for (const kind of ["shot", "event"]) {
    const unseen = visibility.decidePointPresence(world, kind, 0.5, 0.5);
    const remembered = visibility.decidePointPresence(world, kind, 1.5, 0.5);
    for (const decision of [unseen, remembered]) {
      assert.equal(decision.render, false);
      assert.equal(decision.shadow, false);
      assert.equal(decision.effect, false);
      assert.equal(decision.audio, false);
      assert.equal(decision.pick, false);
      assert.equal(decision.debug, false);
    }
  }
  const furniture = Object.freeze({ key: "1:1:0", kind: 1, tx: 1, ty: 0, state: 0 });
  const decision = visibility.decideFurniturePresence(world, furniture);
  assert.equal(decision.visibility, "remembered");
  assert.equal(decision.render, false);
  assert.equal(decision.debug, false);
});

test("remembered_geometry_uses_seen_not_current_visibility", () => {
  const world = snapshot();
  const unknown = visibility.decideTilePresence(world, "geometry", 0, 0);
  const remembered = visibility.decideTilePresence(world, "geometry", 1, 0);
  const current = visibility.decideTilePresence(world, "geometry", 2, 0);
  assert.deepEqual([unknown.render, unknown.material], [false, "none"]);
  assert.deepEqual([remembered.render, remembered.material], [true, "remembered"]);
  assert.deepEqual([current.render, current.material], [true, "current"]);
  assert.equal(remembered.shadow, false);
});

test("fog_edge_generation_reuse_creates_no_one_frame_leak", () => {
  const oldBody = unit({ key: "9:1", index: 9, generation: 1, x: 2.2 });
  const reusedBody = unit({ key: "9:2", index: 9, generation: 2, x: 2.8 });
  const previous = snapshot({ tick: 20, units: Object.freeze([oldBody]) });
  const current = snapshot({ tick: 21, units: Object.freeze([reusedBody]) });
  assert.deepEqual(interpolation.interpolatePresentation(previous, current, 0).units, []);
  assert.deepEqual(interpolation.interpolatePresentation(previous, current, 0.999).units, []);
  assert.deepEqual(interpolation.interpolatePresentation(previous, current, 1).units.map((body) => body.key), ["9:2"]);

  const fogged = snapshot({ tick: 22, vis: Object.freeze([2, 1, 1]), units: Object.freeze([reusedBody]) });
  assert.equal(visibility.decideUnitPresence(fogged, reusedBody).render, false);
});

test("leased_snapshot_views_are_copied_before_the_renderer_retains_them", () => {
  const source = packedPublication();
  const copy = presentation.copyPresentationSnapshot(source.message, source.view);
  source.view.frame.fill(99);
  source.view.map.fill(99);
  source.view.vis.fill(0);
  source.view.furniture.fill(99);
  assert.deepEqual([copy.units[0].x, copy.map, copy.vis, copy.furniture[0].state],
    [1.25, [ABI.MAP_OPEN, ABI.MAP_SOLID], [2, 1], ABI.FURNITURE_DOOR_OPEN]);
  assert.equal(Object.isFrozen(copy), true);
  assert.equal(Object.isFrozen(copy.units[0]), true);
  assert.equal(ArrayBuffer.isView(copy.map), false);
});

test("dead_rows_do_not_resurrect_recycled_entities", () => {
  const oldSource = packedPublication({ generation: 3 });
  const oldCopy = presentation.copyPresentationSnapshot(oldSource.message, oldSource.view);
  const newSource = packedPublication({ tick: 8, generation: 4 });
  const newCopy = presentation.copyPresentationSnapshot(newSource.message, newSource.view);
  assert.deepEqual(oldCopy.units.map((body) => body.key), ["11:3"]);
  assert.deepEqual(newCopy.units.map((body) => body.key), ["11:4"]);
  assert.deepEqual(interpolation.interpolatePresentation(oldCopy, newCopy, 0.999).units, []);
  assert.deepEqual(interpolation.interpolatePresentation(oldCopy, newCopy, 1).units.map((body) => body.key), ["11:4"]);
});

test("transient_rows_are_snapshot_local_and_never_guessed_into_identity", () => {
  const firstSource = packedPublication({ tick: 7 });
  const nextSource = packedPublication({ tick: 8 });
  const first = presentation.copyPresentationSnapshot(firstSource.message, firstSource.view);
  const next = presentation.copyPresentationSnapshot(nextSource.message, nextSource.view);
  assert.deepEqual(first.shots.map((row) => row.key), ["2:7:shot:0"]);
  assert.deepEqual(next.shots.map((row) => row.key), ["2:8:shot:0"]);
  assert.deepEqual(first.events.map((row) => row.key), ["2:7:event:0"]);
  assert.deepEqual(next.events.map((row) => row.key), ["2:8:event:0"]);
  assert.notEqual(first.shots[0].key, next.shots[0].key);
});

test("renderer_modules_do_not_import_worker_or_wasm_implementation", () => {
  for (const name of fs.readdirSync(path.join(ROOT, "client", "src", "render")).filter((entry) => entry.endsWith(".ts"))) {
    const source = fs.readFileSync(path.join(ROOT, "client", "src", "render", name), "utf8");
    assert.doesNotMatch(source, /sim\.worker|web\.wasm|runtime\/sim-worker-host/);
  }
});

test("presentation_decoding_uses_only_generated_offsets_and_codes", () => {
  const source = packedPublication();
  const copy = presentation.copyPresentationSnapshot(source.message, source.view);
  assert.equal(copy.tileSize, 1);
  assert.deepEqual([copy.units[0].key, copy.units[0].x, copy.units[0].actionKind, copy.units[0].vx],
    ["11:3", 1.25, 4, -0.25]);
  assert.ok(Math.abs(copy.units[0].facing - Math.PI / 2) < 1e-12);
  assert.deepEqual([copy.shots[0].x, copy.shots[0].faction, copy.shots[0].heading], [3.25, 1, Math.PI]);
  assert.deepEqual([copy.events[0].kind, copy.events[0].aux0, copy.events[0].aux1], [ABI.EVENT_DAMAGE, 13, 14]);
  assert.deepEqual(copy.furniture[0], { key: `${ABI.FURNITURE_DOOR}:1:0`, kind: ABI.FURNITURE_DOOR,
    tx: 1, ty: 0, state: ABI.FURNITURE_DOOR_OPEN });
  source.view.frame[ABI.HEADER_LEN + ABI.UNIT_VISIBLE] = 2;
  assert.throws(() => presentation.copyPresentationSnapshot(source.message, source.view), /invalid UNIT_VISIBLE/);
});

test("the_fixed_stress_fixture_has_the_named_seed_room_population_and_lights", () => {
  const fixture = stress.createGreyboxStressFixture();
  const repeat = stress.createGreyboxStressFixture();
  assert.equal(stress.GREYBOX_STRESS_SEED, 0x5eed1234);
  assert.deepEqual([fixture.mapCols, fixture.mapRows, fixture.tileSize], [48, 32, 1]);
  assert.equal(fixture.units.length, 64);
  assert.equal(fixture.furniture.length, 8);
  assert.deepEqual([stress.GREYBOX_STRESS_DIRECTIONAL_LIGHTS, stress.GREYBOX_STRESS_TORCH_LIGHTS], [1, 8]);
  assert.equal(fixture.units[0].faction, 0);
  assert.equal(fixture.units.filter((body) => body.faction !== 0).length, 63);
  assert.deepEqual(fixture.units.map((body) => body.key),
    Array.from({ length: 64 }, (_, index) => `${index}:1`));
  assert.equal(fixture.vis.every((value) => value === 2), true);
  assert.deepEqual([ABI.MAP_OPEN, ABI.MAP_SOLID, ABI.MAP_UNKNOWN], [0, 1, 255]);
  for (let ty = 0; ty < fixture.mapRows; ty++) {
    for (let tx = 0; tx < fixture.mapCols; tx++) {
      const boundary = tx === 0 || ty === 0 || tx === fixture.mapCols - 1 || ty === fixture.mapRows - 1;
      assert.equal(fixture.map[ty * fixture.mapCols + tx], boundary ? ABI.MAP_SOLID : ABI.MAP_OPEN);
    }
  }
  for (const body of fixture.units) {
    assert.ok(body.x >= 1 && body.x < fixture.mapCols - 1);
    assert.ok(body.y >= 1 && body.y < fixture.mapRows - 1);
    const at = Math.floor(body.y) * fixture.mapCols + Math.floor(body.x);
    assert.deepEqual([fixture.map[at], fixture.vis[at]], [ABI.MAP_OPEN, 2]);
  }
  assert.equal(fixture.furniture.every((record) => record.kind === ABI.FURNITURE_TORCH), true);
  assert.deepEqual([ABI.FURNITURE_TORCH, ABI.TORCH_FACE_POS_X, ABI.TORCH_FACE_POS_Y], [2, 0, 1]);
  for (const record of fixture.furniture) {
    assert.ok(record.tx >= 0 && record.tx < fixture.mapCols);
    assert.ok(record.ty >= 0 && record.ty < fixture.mapRows);
    assert.ok(record.state === ABI.TORCH_FACE_POS_X || record.state === ABI.TORCH_FACE_POS_Y);
    const at = record.ty * fixture.mapCols + record.tx;
    assert.deepEqual([fixture.map[at], fixture.vis[at]], [ABI.MAP_OPEN, 2]);
  }
  assert.equal(JSON.stringify(fixture), JSON.stringify(repeat));
});

const backendHarness = (values = {}) => {
  const calls = [];
  const originalCanvas = { name: "original" };
  const replacementCanvas = { name: "replacement" };
  const context = { kind: "webgl2-context" };
  const webgpu = { kind: "webgpu", version: 0, disposed: 0 };
  const webgl2 = { kind: "webgl2", version: values.webglVersion ?? 2, disposed: 0 };
  const losses = new Map();
  const factories = {
    isWebGPUSupported: async () => {
      calls.push("support");
      if (values.supportError) throw values.supportError;
      return values.supported ?? false;
    },
    createWebGPU: (canvas) => { calls.push(`create-webgpu:${canvas.name}`); return webgpu; },
    initializeWebGPU: async () => {
      calls.push("init-webgpu");
      if (values.webgpuInitError) throw values.webgpuInitError;
    },
    replaceCanvas: (canvas) => { calls.push(`replace:${canvas.name}`); return values.sameCanvas ? canvas : replacementCanvas; },
    getWebGL2Context: (canvas) => {
      calls.push(`context-webgl2:${canvas.name}`);
      return values.webglContext === null ? null : context;
    },
    createWebGL2: (canvas, actual) => {
      calls.push(`create-webgl2:${canvas.name}`);
      assert.equal(actual, context);
      if (values.webglCreateError) throw values.webglCreateError;
      return webgl2;
    },
    webGLVersion: (created) => created.version,
    engineInfo: (created, backend) => Object.freeze({
      description: `${backend} description`, vendor: "vendor", renderer: created.kind, version: "9.18.1",
    }),
    subscribeLoss: (created, canvas, backend, listener) => {
      calls.push(`subscribe:${backend}:${canvas.name}`);
      losses.set(created, listener);
      return () => { calls.push(`unsubscribe:${backend}:${canvas.name}`); losses.delete(created); };
    },
    dispose: (created) => { calls.push(`dispose:${created.kind}`); created.disposed++; },
  };
  return { calls, originalCanvas, replacementCanvas, context, webgpu, webgl2, losses, factories };
};

test("forced_webgl2_skips_webgpu_and_requires_a_version_two_context", async () => {
  assert.equal(rendererEngine.rendererBackendFromSearch(""), "auto");
  assert.equal(rendererEngine.rendererBackendFromSearch("?backend=auto"), "auto");
  assert.equal(rendererEngine.rendererBackendFromSearch("?backend=webgl2"), "webgl2");
  assert.equal(rendererEngine.rendererBackendFromSearch("?renderer=auto"), "auto");
  assert.equal(rendererEngine.rendererBackendFromSearch("?renderer=webgl2"), "webgl2");
  assert.equal(rendererEngine.rendererBackendFromSearch("?renderer=canvas"), "auto");
  assert.throws(() => rendererEngine.rendererBackendFromSearch("?backend=auto&renderer=webgl2"),
    /conflicting renderer queries/);
  assert.throws(() => rendererEngine.rendererBackendFromSearch("?renderer=gpu"),
    /use backend=auto\|webgl2/);
  const success = backendHarness();
  const handle = await rendererEngine.selectRendererBackend(success.originalCanvas, "webgl2", success.factories);
  assert.equal(success.calls.includes("support"), false);
  assert.equal(success.calls.includes("create-webgpu:original"), false);
  assert.deepEqual([handle.canvas, handle.diagnostics.requested, handle.diagnostics.selected,
    handle.diagnostics.webgpuSupport, handle.diagnostics.webgpuInit,
    handle.diagnostics.webgl2Init, handle.diagnostics.webglVersion],
  [success.originalCanvas, "webgl2", "webgl2", null, "not-attempted", "ok", 2]);
  handle.dispose();

  const missing = backendHarness({ webglContext: null });
  await assert.rejects(
    rendererEngine.selectRendererBackend(missing.originalCanvas, "webgl2", missing.factories),
    (error) => error instanceof rendererEngine.RendererBackendError
      && error.message === "WebGL2 context is unavailable"
      && error.diagnostics.webgl2Init === "failed",
  );
  assert.equal(missing.calls.includes("create-webgl2:original"), false);

  const webgl1 = backendHarness({ webglVersion: 1 });
  await assert.rejects(
    rendererEngine.selectRendererBackend(webgl1.originalCanvas, "webgl2", webgl1.factories),
    (error) => error instanceof rendererEngine.RendererBackendError
      && /not WebGL2/.test(error.message)
      && error.diagnostics.webglVersion === 1,
  );
  assert.equal(webgl1.webgl2.disposed, 1);
});

test("webgpu_init_failure_records_diagnostics_and_replaces_the_canvas_before_fallback", async () => {
  const harness = backendHarness({ supported: true, webgpuInitError: new Error("device\ninit\tfailed") });
  const replacements = [];
  const handle = await rendererEngine.selectRendererBackend(harness.originalCanvas, "auto", harness.factories, {
    onCanvasReplaced: (oldCanvas, newCanvas) => replacements.push([oldCanvas, newCanvas]),
  });
  assert.equal(harness.webgpu.disposed, 1);
  assert.equal(handle.canvas, harness.replacementCanvas);
  assert.deepEqual(replacements, [[harness.originalCanvas, harness.replacementCanvas]]);
  assert.deepEqual(harness.calls.slice(0, 7), [
    "support", "create-webgpu:original", "init-webgpu", "dispose:webgpu",
    "replace:original", "context-webgl2:replacement", "create-webgl2:replacement",
  ]);
  assert.deepEqual(handle.diagnostics.webgpuFailure, { stage: "init", message: "device init failed" });
  assert.deepEqual([handle.diagnostics.webgpuSupport, handle.diagnostics.webgpuInit,
    handle.diagnostics.selected, handle.diagnostics.webgl2Init], [true, "failed", "webgl2", "ok"]);
  handle.dispose();

  const unchanged = backendHarness({ supported: true, webgpuInitError: new Error("failed"), sameCanvas: true });
  await assert.rejects(
    rendererEngine.selectRendererBackend(unchanged.originalCanvas, "auto", unchanged.factories),
    /requires a replacement canvas/,
  );
  assert.equal(unchanged.calls.includes("context-webgl2:original"), false);
});

test("successful_backends_report_stable_diagnostics_and_both_failed_is_terminal", async () => {
  const webgpu = backendHarness({ supported: true });
  const webgpuHandle = await rendererEngine.selectRendererBackend(webgpu.originalCanvas, "auto", webgpu.factories);
  assert.deepEqual([webgpuHandle.diagnostics.selected, webgpuHandle.diagnostics.webgpuSupport,
    webgpuHandle.diagnostics.webgpuInit, webgpuHandle.diagnostics.webgl2Init,
    webgpuHandle.diagnostics.engineInfo.renderer],
  ["webgpu", true, "ok", "not-attempted", "webgpu"]);
  assert.equal(Object.isFrozen(webgpuHandle.diagnostics), true);
  assert.equal(Object.isFrozen(webgpuHandle.diagnostics.engineInfo), true);
  webgpuHandle.dispose();

  const unsupported = backendHarness({ supported: false });
  const webglHandle = await rendererEngine.selectRendererBackend(unsupported.originalCanvas, "auto", unsupported.factories);
  assert.deepEqual(unsupported.calls.slice(0, 3), ["support", "context-webgl2:original", "create-webgl2:original"]);
  assert.deepEqual(webglHandle.diagnostics.webgpuFailure,
    { stage: "support", message: "WebGPU is not supported" });
  assert.equal(/driver/i.test(webglHandle.diagnostics.webgpuFailure.message), false);
  assert.equal(webglHandle.diagnostics.selected, "webgl2");
  webglHandle.dispose();

  const failed = backendHarness({ supported: true, webgpuInitError: new Error("adapter init failed"), webglContext: null });
  await assert.rejects(
    rendererEngine.selectRendererBackend(failed.originalCanvas, "auto", failed.factories),
    (error) => error instanceof rendererEngine.RendererBackendError
      && error.diagnostics.selected === null
      && error.diagnostics.webgpuInit === "failed"
      && error.diagnostics.webgl2Init === "failed",
  );
  assert.equal(failed.webgpu.disposed, 1);
});

test("context_or_device_loss_disposes_once_and_never_switches_backend", async () => {
  assert.equal(rendererEngine.WEBGPU_ENGINE_OPTIONS.doNotHandleContextLost, true);
  assert.equal(rendererEngine.WEBGL_ENGINE_OPTIONS.doNotHandleContextLost, true);
  const engineSource = fs.readFileSync(path.join(ROOT, "client/src/render/engine.ts"), "utf8");
  assert.match(engineSource, /new WebGPUEngine\(canvas, \{ \.\.\.WEBGPU_ENGINE_OPTIONS \}\)/);
  assert.match(engineSource, /new Engine\(context, true, \{ \.\.\.WEBGL_ENGINE_OPTIONS \}\)/);

  let resolveDeviceLoss;
  const device = { lost: new Promise((resolve) => { resolveDeviceLoss = resolve; }) };
  const deviceLosses = [];
  const disarmDevice = rendererEngine.observeWebGPUDeviceLoss(device, () => deviceLosses.push("lost"));
  resolveDeviceLoss({ reason: "destroyed" });
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(deviceLosses, ["lost"]);
  disarmDevice();

  let resolveDisarmedDevice;
  const disarmedDevice = { lost: new Promise((resolve) => { resolveDisarmedDevice = resolve; }) };
  const ignoredDeviceLosses = [];
  rendererEngine.observeWebGPUDeviceLoss(disarmedDevice, () => ignoredDeviceLosses.push("lost"))();
  resolveDisarmedDevice({ reason: "destroyed" });
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(ignoredDeviceLosses, []);

  const contextTarget = new EventTarget();
  const contextLosses = [];
  const disarmContext = rendererEngine.observeWebGLContextLoss(contextTarget,
    () => contextLosses.push("lost"));
  const contextEvent = new Event("webglcontextlost", { cancelable: true });
  contextTarget.dispatchEvent(contextEvent);
  assert.equal(contextEvent.defaultPrevented, true);
  assert.deepEqual(contextLosses, ["lost"]);
  disarmContext();
  contextTarget.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
  assert.deepEqual(contextLosses, ["lost"]);

  for (const values of [{ supported: true }, { supported: false }]) {
    const harness = backendHarness(values);
    const terminal = [];
    const stopped = [];
    const paused = [];
    const handle = await rendererEngine.selectRendererBackend(harness.originalCanvas, "auto", harness.factories, {
      stopRenderingAndInput: () => stopped.push("stopped"),
      pauseSimulation: () => paused.push("paused"),
      onTerminal: (error) => terminal.push(error),
    });
    const selected = handle.engine;
    assert.equal(harness.losses.has(selected), true);
    harness.losses.get(selected)();
    assert.equal(handle.terminal, true);
    assert.equal(handle.diagnostics.selected, null);
    assert.equal(handle.diagnostics.engineInfo, null);
    assert.deepEqual(terminal, [{ stage: "loss", message: "renderer context or device lost" }]);
    assert.deepEqual(stopped, ["stopped"]);
    assert.deepEqual(paused, ["paused"]);
    assert.equal(selected.disposed, 1);
    handle.dispose();
    assert.equal(selected.disposed, 1);
    assert.equal(harness.calls.filter((call) => call.startsWith("create-")).length, 1);
  }
});

test("terminal_loss_disposes_renderer_content_before_engine_and_client", async () => {
  const order = [];
  const harness = backendHarness({ supported: false });
  const factories = {
    ...harness.factories,
    dispose: (engine) => {
      order.push("engine-dispose");
      harness.factories.dispose(engine);
    },
  };
  let handle = null;
  const renderer = {
    acceptSnapshot() {},
    clear() {},
    dispose() {
      order.push("scene-material-mesh-dispose");
      handle.dispose();
    },
  };
  const client = {
    onSnapshot: null, onDiagnostics: null, onError: null,
    async init() {}, async reset() {}, async setPaused() {}, async command() {},
    diagnostics: () => ({ resetting: false, terminal: false }),
    dispose: () => order.push("client-dispose"),
  };
  const app = await bootstrap.bootstrapV2({
    client, seed: 1,
    createRenderer: async (terminal) => {
      handle = await rendererEngine.selectRendererBackend(
        harness.originalCanvas, "auto", factories,
        {
          stopRenderingAndInput: () => order.push("stop-input-render"),
          pauseSimulation: () => order.push("pause-simulation"),
          onTerminal: (error) => terminal(new Error(error.message)),
        },
      );
      return renderer;
    },
    attachInput: () => () => order.push("input-owner-dispose"),
  });
  const selected = handle.engine;
  harness.losses.get(selected)();
  assert.equal(app.disposed, true);
  const engineDispose = harness.calls.filter((entry) => entry === `dispose:${selected.kind}`);
  assert.deepEqual(engineDispose, [`dispose:${selected.kind}`]);
  assert.deepEqual(order, [
    "stop-input-render", "pause-simulation", "input-owner-dispose",
    "scene-material-mesh-dispose", "engine-dispose", "client-dispose",
  ]);
  assert.equal(selected.disposed, 1);
});

test("the_scene_is_right_handed_before_any_content_is_created", () => {
  const writes = [];
  const fakeScene = {
    get useRightHandedSystem() { return false; },
    set useRightHandedSystem(value) { writes.push(`handed:${value}`); },
  };
  const result = rendererScene.createRightHandedScene(
    { name: "engine" },
    () => { writes.push("scene"); return fakeScene; },
    (scene) => { writes.push(`content:${scene === fakeScene}`); return "built"; },
  );
  assert.deepEqual(writes, ["scene", "handed:true", "content:true"]);
  assert.deepEqual(result, { scene: fakeScene, content: "built" });

  const debug = new rendererDebug.RendererDebugRegistry();
  debug.replaceOwnerCounts("environment", {
    scene: { meshes: 2, instances: 10, lights: 1 },
    visibility: { geometry: 10, picking: 2 },
  });
  debug.replaceOwnerCounts("actors", {
    scene: { meshes: 3, shadowCasters: 3 },
    visibility: { units: 3, picking: 3 },
  });
  assert.deepEqual(debug.snapshot(), {
    meshes: 5, instances: 10, draws: 0, triangles: 0, lights: 1, shadowCasters: 3,
    visibility: { geometry: 10, units: 3, shots: 0, events: 0, furniture: 0,
      effects: 0, audio: 0, picking: 5, debug: 0 },
  });
  debug.removeOwner("actors");
  assert.equal(debug.snapshot().visibility.picking, 2);
});

test("persistent_units_retire_every_registry_before_a_generation_is_reused", async () => {
  const { NullEngine } = await import("@babylonjs/core/Engines/nullEngine.js");
  const { Scene } = await import("@babylonjs/core/scene.js");
  const engine = new NullEngine({ renderWidth: 64, renderHeight: 64 });
  const scene = new Scene(engine);
  const debug = new rendererDebug.RendererDebugRegistry();
  const actors = new rendererActors.ActorPresentation(scene, debug);
  const first = unit({ key: "9:1", index: 9, generation: 1, x: 2.5, y: 0.5 });
  actors.acceptSnapshot(snapshot({ units: Object.freeze([first]) }));
  assert.deepEqual(actors.keys(), ["9:1"]);
  // A kind-0 unit is a figure of exactly `FIGURE_UPRIGHT_PARTS` meshes, and
  // the registry's count is bounded from the scene side too: the live meshes
  // whose names carry this actor's key must be the same set the registry
  // claims. The hidden shape/tone sources are not the actor's meshes.
  const parts = rendererFigure.FIGURE_UPRIGHT_PARTS;
  const actorMeshes = (key) => scene.meshes.filter(
    (mesh) => mesh.name.startsWith(`actor:${key}:`) && !mesh.isDisposed());
  assert.deepEqual(actors.counts(), {
    meshes: parts + 1, shadows: 0, labels: 1, effects: 0, audio: 0, picking: 1, debug: 1,
  });
  assert.equal(actorMeshes("9:1").length, parts + 1);
  const retiredMeshes = actorMeshes("9:1");

  const reused = unit({ key: "9:2", index: 9, generation: 2, x: 2.5, y: 0.5 });
  actors.acceptSnapshot(snapshot({ tick: 2, units: Object.freeze([reused]) }));
  assert.deepEqual(actors.keys(), ["9:2"]);
  assert.deepEqual(actors.counts(), {
    meshes: parts + 1, shadows: 0, labels: 1, effects: 0, audio: 0, picking: 1, debug: 1,
  });
  assert.equal(retiredMeshes.every((mesh) => mesh.isDisposed()), true,
    "a reused generation must retire every one of the old figure's meshes");
  assert.equal(actorMeshes("9:2").length, parts + 1);
  assert.equal(debug.snapshot().shadowCasters, 0);

  for (const absent of [
    unit({ key: "9:2", index: 9, generation: 2, x: 1.5, y: 0.5 }),
    unit({ key: "9:2", index: 9, generation: 2, x: 0.5, y: 0.5 }),
    unit({ key: "9:2", index: 9, generation: 2, x: 2.5, y: 0.5, visible: false }),
  ]) {
    actors.acceptSnapshot(snapshot({ tick: 3, units: Object.freeze([absent]) }));
    assert.deepEqual(actors.keys(), []);
    assert.deepEqual(actors.counts(), {
      meshes: 0, shadows: 0, labels: 0, effects: 0, audio: 0, picking: 0, debug: 0,
    });
  }
  actors.acceptSnapshot(snapshot({ tick: 4, units: Object.freeze([reused]) }));
  actors.reset();
  assert.deepEqual(actors.keys(), []);
  assert.deepEqual(actors.counts(), {
    meshes: 0, shadows: 0, labels: 0, effects: 0, audio: 0, picking: 0, debug: 0,
  });
  assert.equal(actorMeshes("9:2").length, 0, "reset must leave no live figure mesh");
  actors.dispose();
  assert.deepEqual(debug.snapshot(), {
    meshes: 0, instances: 0, draws: 0, triangles: 0, lights: 0, shadowCasters: 0,
    visibility: { geometry: 0, units: 0, shots: 0, events: 0, furniture: 0,
      effects: 0, audio: 0, picking: 0, debug: 0 },
  });
  scene.dispose();
  engine.dispose();
});

test("faction_cues_and_a_bounded_hero_light_keep_combatants_readable_without_changing_interaction", async () => {
  const { NullEngine } = await import("@babylonjs/core/Engines/nullEngine.js");
  const { Scene } = await import("@babylonjs/core/scene.js");
  const engine = new NullEngine({ renderWidth: 64, renderHeight: 64 });
  const scene = new Scene(engine);
  const debug = new rendererDebug.RendererDebugRegistry();
  const actors = new rendererActors.ActorPresentation(scene, debug);
  const hero = unit({ key: "1:1", index: 1, faction: 0, x: 1.5, y: 0.5 });
  const enemy = unit({ key: "2:1", index: 2, faction: 1, x: 2.5, y: 0.5 });
  actors.acceptSnapshot(snapshot({
    map: Object.freeze([0, 0, 0]), vis: Object.freeze([2, 2, 2]),
    units: Object.freeze([hero, enemy]),
  }));

  const marker = (key, part) => scene.getMeshByName(`actor:${key}:marker:${part}`);
  const heroRing = marker(hero.key, "ring");
  const enemyRing = marker(enemy.key, "ring");
  assert.ok(heroRing && enemyRing, "each faction needs an explicit floor cue");
  assert.deepEqual(heroRing.material.emissiveColor.asArray(), [0.08, 0.78, 1]);
  assert.deepEqual(enemyRing.material.emissiveColor.asArray(), [1, 0.22, 0.14]);
  assert.equal(heroRing.position.y, rendererActors.factionCueCentreY(hero.radius),
    "the whole torus must clear the room floor rather than reading as two clipped arcs");
  assert.ok([heroRing, enemyRing].every((part) =>
    part.isPickable === false && part.receiveShadows === false),
  "presentation cues must not become pick targets or shadow casters");

  const light = scene.getLightByName(`actor:${hero.key}:readability-light`);
  assert.ok(light, "the local hero read needs one explicit light anchor");
  assert.deepEqual(light.diffuse.asArray(), [0.62, 0.72, 0.8]);
  assert.equal(light.range, 3.2);
  assert.equal(light.intensity, 1.35);
  assert.equal(scene.getLightByName(`actor:${enemy.key}:readability-light`), null,
    "one bounded hero light must not multiply with the enemy population");
  assert.equal(debug.snapshot().lights, 1);
  assert.deepEqual(actors.counts(), {
    meshes: 2 * (rendererFigure.FIGURE_UPRIGHT_PARTS + 1),
    shadows: 0, labels: 2, effects: 0, audio: 0, picking: 2, debug: 2,
  });

  actors.acceptSnapshot(snapshot({ tick: 2, units: Object.freeze([]) }));
  assert.equal(light.isDisposed(), true);
  assert.ok([heroRing, enemyRing].every((part) => part.isDisposed()),
    "fog retirement must dispose every non-authoritative cue with its actor");
  assert.equal(debug.snapshot().lights, 0);
  actors.dispose();
  scene.dispose();
  engine.dispose();
});

test("the_ground_marker_clears_every_authored_floor_without_depth_clipping", async () => {
  const { NullEngine } = await import("@babylonjs/core/Engines/nullEngine.js");
  const { Scene } = await import("@babylonjs/core/scene.js");
  const engine = new NullEngine({ renderWidth: 64, renderHeight: 64 });
  const scene = new Scene(engine);
  const actors = new rendererActors.ActorPresentation(scene, new rendererDebug.RendererDebugRegistry());
  const radii = [0.35, 0.4];
  const units = Object.freeze(radii.map((radius, index) => unit({
    key: `${index + 1}:1`, index: index + 1, faction: index, kind: index === 0 ? 0 : 2,
    x: index + 0.5, radius,
  })));
  actors.acceptSnapshot(snapshot({
    map: Object.freeze([ABI.MAP_OPEN, ABI.MAP_OPEN, ABI.MAP_OPEN]),
    vis: Object.freeze([2, 2, 2]), units,
  }));
  for (const body of units) {
    const ring = scene.getMeshByName(`actor:${body.key}:marker:ring`);
    assert.ok(ring);
    assert.equal(ring.position.y, rendererActors.factionCueCentreY(body.radius));
    assert.equal(ring.position.y,
      rendererActors.AUTHORED_FLOOR_MAX_Y + rendererActors.FACTION_CUE_CLEARANCE_EPSILON);
    assert.ok(ring.position.y >=
      rendererActors.AUTHORED_FLOOR_MAX_Y + rendererActors.FACTION_CUE_CLEARANCE_EPSILON,
    `radius ${body.radius} cue intersects the authored floor`);
    assert.equal(ring.getBoundingInfo().boundingBox.extendSizeWorld.y, 0,
      "the marker must be a flat annulus rather than a thick torus");
    assert.ok(ring.material.zOffset <= -1,
      "the coplanar marker needs an explicit depth bias instead of extra thickness");
  }
  actors.dispose(); scene.dispose(); engine.dispose();
});

test("the_procedural_figure_carries_the_v2_18_joint_names_and_published_fields_drive_it", async () => {
  const { NullEngine } = await import("@babylonjs/core/Engines/nullEngine.js");
  const { Scene } = await import("@babylonjs/core/scene.js");
  const { Vector3 } = await import("@babylonjs/core/Maths/math.vector.js");
  const engine = new NullEngine({ renderWidth: 64, renderHeight: 64 });
  const scene = new Scene(engine);
  const debug = new rendererDebug.RendererDebugRegistry();
  const actors = new rendererActors.ActorPresentation(scene, debug);
  const accept = (values) => actors.acceptSnapshot(snapshot({
    units: Object.freeze([unit(values)]),
  }));
  const nodeOf = (name) => scene.transformNodes.find((node) => node.name === `actor:1:1:${name}`);
  const meshOf = (suffix) => scene.meshes.find(
    (mesh) => mesh.name === `actor:1:1:${suffix}` && !mesh.isDisposed());
  const worldOf = (target, local = Vector3.Zero()) => {
    target.computeWorldMatrix(true);
    return Vector3.TransformCoordinates(local, target.getWorldMatrix());
  };

  // **The joint names and chain are the durable combatant contract's, from the
  // same list the arena proxy pins.** Bones and
  // sockets only: the region and clip slots are the arena's pose-row extras
  // and the legacy frame has nothing to drive them with.
  accept({});
  for (const name of [...rigNames.RIG_BONES, ...rigNames.RIG_SOCKETS]) {
    assert.ok(nodeOf(name), `the figure has no ${name}`);
  }
  const parentOf = (name) => nodeOf(name).parent?.name ?? null;
  assert.equal(parentOf("root"), null);
  assert.deepEqual(
    ["pelvis", "torso", "head", "arm_left", "hand_left", "socket_weapon_left",
      "arm_right", "hand_right", "socket_weapon_right", "socket_shield"].map(parentOf),
    ["actor:1:1:root", "actor:1:1:pelvis", "actor:1:1:torso", "actor:1:1:torso",
      "actor:1:1:arm_left", "actor:1:1:hand_left", "actor:1:1:torso",
      "actor:1:1:arm_right", "actor:1:1:hand_right", "actor:1:1:root"]);

  // **The blade is the exact `World::blade` segment**, lifted to hand height:
  // hilt at `radius` along `limbAngle`, tip at `radius + actionLength *
  // limbReach`, both bounded exactly rather than "roughly forward". The hand
  // height is the figure's own table: 0.80 of a shoulder at 0.72 of a kind-0
  // body's 3.0-radius height.
  const bearing = Math.PI / 3;
  const strike = { x: 2.5, y: 0.5, radius: 0.4, facing: Math.PI / 5, limbAngle: bearing,
    limbReach: 0.5, actionLength: 0.9, actionRole: 0, slot: 0, slot0Action: 3 };
  actors.acceptSnapshot(snapshot({ tick: 2, units: Object.freeze([unit(strike)]) }));
  const blade = meshOf("blade");
  assert.equal(blade.isEnabled(), true, "a striking figure must show its blade");
  const hilt = worldOf(blade, new Vector3(0, -0.5, 0));
  const tip = worldOf(blade, new Vector3(0, 0.5, 0));
  const handHeight = 0.8 * 0.72 * 3.0 * strike.radius;
  const near = (actual, expected, what) =>
    assert.ok(Math.abs(actual - expected) < 1e-4, `${what}: ${actual} != ${expected}`);
  near(hilt.x, strike.x + strike.radius * Math.cos(bearing), "hilt x");
  near(hilt.z, strike.y + strike.radius * Math.sin(bearing), "hilt z");
  near(hilt.y, handHeight, "hilt height");
  const tipRange = strike.radius + strike.actionLength * strike.limbReach;
  near(tip.x, strike.x + tipRange * Math.cos(bearing), "tip x");
  near(tip.z, strike.y + tipRange * Math.sin(bearing), "tip z");
  near(tip.y, handHeight, "tip height");
  // The main hand is at the hilt -- the arm reached for the same published
  // point the blade grows from.
  const hand = worldOf(nodeOf("hand_right"));
  near(hand.x, hilt.x, "hand x");
  near(hand.z, hilt.z, "hand z");

  actors.acceptSnapshot(snapshot({ tick: 3, units: Object.freeze([unit({
    ...strike, actionRole: 0, limbReach: 0, slot0Action: 2, slot1Action: 4,
  })]) }));
  const idleShoulder = worldOf(nodeOf("arm_right"));
  const idleHand = worldOf(nodeOf("hand_right"));
  assert.ok(idleShoulder.y - idleHand.y >
    Math.hypot(idleShoulder.x - idleHand.x, idleShoulder.z - idleHand.z) * 0.5,
  "zero published reach must lower the carried hand instead of making a rigid T-pose");

  // **A pose update moves the same meshes rather than making new ones.**
  actors.acceptSnapshot(snapshot({ tick: 4, units: Object.freeze([
    unit({ ...strike, limbAngle: bearing + Math.PI / 2 })]) }));
  assert.equal(meshOf("blade"), blade, "posing must mutate, not rebuild");
  const swung = worldOf(blade, new Vector3(0, -0.5, 0));
  near(swung.x, strike.x + strike.radius * Math.cos(bearing + Math.PI / 2), "swung hilt x");
  near(swung.z, strike.y + strike.radius * Math.sin(bearing + Math.PI / 2), "swung hilt z");

  // **The blade obeys the same gates the Canvas rig states**: a move role, a
  // swap in flight, or an empty active slot shows nothing in the hand.
  for (const [tick, values] of [
    [5, { ...strike, actionRole: 2 }],
    [6, { ...strike, limbSwing: 4, swingSpan: 10, limbSwingLeft: 5 }],
    [7, { ...strike, slot0Action: 255 }],
  ]) {
    actors.acceptSnapshot(snapshot({ tick, units: Object.freeze([unit(values)]) }));
    assert.equal(meshOf("blade").isEnabled(), false, `blade must hide (tick ${tick})`);
  }
  // The guard buckler exists exactly during a guard role.
  actors.acceptSnapshot(snapshot({ tick: 8, units: Object.freeze([unit({ ...strike, actionRole: 1 })]) }));
  assert.equal(meshOf("shield").isEnabled(), true);
  assert.equal(meshOf("blade").isEnabled(), false, "a guard is not a strike");
  actors.acceptSnapshot(snapshot({ tick: 9, units: Object.freeze([unit(strike)]) }));
  assert.equal(meshOf("shield").isEnabled(), false);

  // **Legs walk from the published stride clock gated by published speed.**
  // With velocity, opposite phases pose the legs differently; with the sim's
  // own numbers stopped, the stride phase alone must not move a foot.
  const walking = { ...strike, vx: 0.1, vy: 0 };
  const legAt = (stridePhase, vx, tick) => {
    actors.acceptSnapshot(snapshot({ tick, units: Object.freeze([
      unit({ ...walking, vx, stridePhase })]) }));
    // Local +0.5 along the aligned axis is the segment's far end -- the foot;
    // the hip end is pinned to the pelvis and must not move either way.
    return worldOf(meshOf("leg:right"), new Vector3(0, 0.5, 0));
  };
  const forward = legAt(0.25, 0.1, 9);
  const backward = legAt(0.75, 0.1, 10);
  assert.ok(Math.hypot(forward.x - backward.x, forward.z - backward.z) > 0.01,
    "opposite stride phases must pose a moving leg differently");
  const still = legAt(0.25, 0, 11);
  const stillLater = legAt(0.75, 0, 12);
  near(still.x, stillLater.x, "a stopped body's foot x");
  near(still.z, stillLater.z, "a stopped body's foot z");

  // **One proportion table serves every size**: doubling the published radius
  // doubles the crown height, because everything is a fraction of the radius.
  const crown = (radius, tick) => {
    actors.acceptSnapshot(snapshot({ tick, units: Object.freeze([unit({ ...strike, radius })]) }));
    return worldOf(nodeOf("head")).y;
  };
  const small = crown(0.35, 13);
  const large = crown(0.7, 14);
  near(large, small * 2, "crown height must scale with radius");

  actors.dispose();
  scene.dispose();
  engine.dispose();
});

test("known_geometry_and_valid_furniture_obey_visibility_and_light_caps", async () => {
  const { NullEngine } = await import("@babylonjs/core/Engines/nullEngine.js");
  const { Scene } = await import("@babylonjs/core/scene.js");
  const engine = new NullEngine({ renderWidth: 64, renderHeight: 64 });
  const scene = new Scene(engine);
  const debug = new rendererDebug.RendererDebugRegistry();
  const environment = rendererEnvironment.createEnvironmentPresentation(scene, debug);

  environment.acceptSnapshot(snapshot());
  assert.deepEqual(environment.counts(), {
    geometry: 2, furniture: 0, instances: 2, lights: 1, shadowCasters: 1,
    triangles: environment.counts().triangles,
  });
  assert.ok(environment.counts().triangles > 0);

  environment.acceptSnapshot(snapshot({
    mapRevision: 2,
    map: Object.freeze([7, 255, 255]),
    vis: Object.freeze([2, 0, 0]),
  }));
  assert.equal(environment.counts().geometry, 0);

  const door = Object.freeze({ key: `${ABI.FURNITURE_DOOR}:2:0`, kind: ABI.FURNITURE_DOOR,
    tx: 2, ty: 0, state: ABI.FURNITURE_DOOR_SHUT });
  const torch = Object.freeze({ key: `${ABI.FURNITURE_TORCH}:2:0`, kind: ABI.FURNITURE_TORCH,
    tx: 2, ty: 0, state: ABI.TORCH_FACE_POS_X });
  const badKey = Object.freeze({ ...door, key: "wrong" });
  const badDoorState = Object.freeze({ ...door, key: `${ABI.FURNITURE_DOOR}:1:0`, tx: 1, state: 99 });
  const badTorchState = Object.freeze({ ...torch, key: `${ABI.FURNITURE_TORCH}:1:0`, tx: 1, state: 99 });
  environment.acceptSnapshot(snapshot({
    furnitureRevision: 2,
    furniture: Object.freeze([door, torch, badKey, badDoorState, badTorchState]),
  }));
  assert.deepEqual(environment.furnitureKeys(), [door.key, torch.key]);
  assert.deepEqual([environment.counts().furniture, environment.counts().lights,
    environment.counts().shadowCasters], [2, 2, 2]);
  assert.equal(environment.shadowGenerator.getShadowMap()?.renderList?.length, 2);

  const torches = Object.freeze(Array.from({ length: 10 }, (_, tx) => Object.freeze({
    key: `${ABI.FURNITURE_TORCH}:${tx}:0`, kind: ABI.FURNITURE_TORCH,
    tx, ty: 0, state: tx % 2 === 0 ? ABI.TORCH_FACE_POS_X : ABI.TORCH_FACE_POS_Y,
  })));
  environment.acceptSnapshot(snapshot({
    mapCols: 12, mapRows: 1,
    mapRevision: 3, visRevision: 3, furnitureRevision: 3,
    map: Object.freeze(Array(12).fill(ABI.MAP_OPEN)),
    vis: Object.freeze(Array(12).fill(2)),
    furniture: torches,
  }));
  assert.equal(environment.furnitureKeys().length, 10);
  assert.equal(environment.counts().lights, 9);
  assert.equal(debug.snapshot().lights, 9);

  environment.reset();
  assert.deepEqual(environment.furnitureKeys(), []);
  assert.deepEqual([environment.counts().geometry, environment.counts().furniture,
    environment.counts().instances, environment.counts().shadowCasters], [0, 0, 0, 0]);
  assert.equal(environment.shadowGenerator.getShadowMap()?.renderList?.length, 0);
  environment.dispose();
  assert.deepEqual(debug.snapshot(), {
    meshes: 0, instances: 0, draws: 0, triangles: 0, lights: 0, shadowCasters: 0,
    visibility: { geometry: 0, units: 0, shots: 0, events: 0, furniture: 0,
      effects: 0, audio: 0, picking: 0, debug: 0 },
  });
  scene.dispose();
  engine.dispose();
});

async function fakeRoomAsset(scene) {
  const { MeshBuilder } = await import("@babylonjs/core/Meshes/meshBuilder.js");
  const { StandardMaterial } = await import("@babylonjs/core/Materials/standardMaterial.js");
  const { TransformNode } = await import("@babylonjs/core/Meshes/transformNode.js");
  const names = ["floor_a", "floor_b", "floor_c", "floor_d", "wall_straight", "wall_run_2",
    "wall_run_3", "wall_run_5", "wall_run_8", "wall_inside", "wall_outside", "wall_end",
    "door_frame", "door_leaf", "torch_bracket", "decal_rubble", "decal_root", "prop_barrel"];
  const pieces = new Map();
  const floor = new StandardMaterial("floor_current", scene);
  const stone = new StandardMaterial("stone_current", scene);
  const wood = new StandardMaterial("wood_current", scene);
  const metal = new StandardMaterial("metal_current", scene);
  const overburden = new StandardMaterial("overburden_current", scene);
  for (const name of names) {
    const source = MeshBuilder.CreateBox(`ROOM_${name}`, { size: 1 }, scene);
    source.isVisible = false;
    source.isPickable = false;
    source.setEnabled(true);
    source.material = name.startsWith("floor_") ? floor :
      ["wall_straight", "wall_run_2", "wall_run_3", "wall_run_5", "wall_run_8",
        "wall_inside", "wall_outside", "wall_end", "door_frame"].includes(name) ? stone :
      name === "decal_rubble" ? overburden :
      ["door_leaf", "decal_root", "prop_barrel"].includes(name) ? wood : metal;
    pieces.set(name, source);
  }
  const socket = new TransformNode("SOCKET_torch_flame", scene);
  socket.position.set(0, 0.48, -0.14);
  return {
    sidecar: {
      coordinates: { tileSize: 1 },
      pieces: names.map((name) => ({ name, triangleCount: 12, allowedQuarterTurns: [0, 1, 2, 3] })),
    },
    pieces, materials: new Map([["floor_current", floor], ["stone_current", stone],
      ["wood_current", wood], ["metal_current", metal], ["overburden_current", overburden]]),
    socket, disposed: false, dispose() {},
  };
}

test("room_instances_need_known_topology_and_current_furniture_disclosure", async () => {
  const { NullEngine } = await import("@babylonjs/core/Engines/nullEngine.js");
  const { Scene } = await import("@babylonjs/core/scene.js");
  const engine = new NullEngine({ renderWidth: 64, renderHeight: 64 });
  const scene = new Scene(engine);
  const debug = new rendererDebug.RendererDebugRegistry();
  const asset = await fakeRoomAsset(scene);
  const room = new roomEnvironment.RoomEnvironmentPresentation(scene, debug, asset, 7);
  room.acceptSnapshot(snapshot({
    map: Object.freeze([ABI.MAP_UNKNOWN, ABI.MAP_OPEN, ABI.MAP_SOLID]),
    vis: Object.freeze([2, 1, 2]),
    furniture: Object.freeze([
      Object.freeze({ key: `${ABI.FURNITURE_DOOR}:2:0`, kind: ABI.FURNITURE_DOOR,
        tx: 2, ty: 0, state: ABI.FURNITURE_DOOR_OPEN }),
      Object.freeze({ key: `${ABI.FURNITURE_TORCH}:1:0`, kind: ABI.FURNITURE_TORCH,
        tx: 1, ty: 0, state: ABI.TORCH_FACE_POS_X }),
    ]),
  }));
  assert.deepEqual(room.keys().filter((key) => key.startsWith("tile:")),
    ["tile:1:0:floor", "tile:2:0:floor"],
    "a published doorway owns the opening and suppresses the ordinary solid-cell coping");
  assert.deepEqual(room.keys().filter((key) => key.startsWith("furniture:")),
    [`furniture:${ABI.FURNITURE_DOOR}:2:0:frame`],
    "an open singleton keeps its architectural frame and publishes no closed leaf");
  assert.equal(room.counts().lights, 1);
  assert.equal(debug.snapshot().visibility.furniture, 1);
  const picks = scene.meshes.filter((mesh) => mesh.name.startsWith("room:") && mesh.isPickable);
  assert.deepEqual(picks.map((mesh) => mesh.metadata), [
    { presentationKind: "tile", tx: 2, ty: 0 },
    { presentationKind: "furniture", furnitureKey: `${ABI.FURNITURE_DOOR}:2:0` },
  ]);
  assert.equal(debug.snapshot().visibility.picking, 2);
  room.dispose();
  scene.dispose(); engine.dispose();
});

test("geometry_keeps_published_fog_but_replaces_authored_dress_with_readable_geometry", async () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const debug = new rendererDebug.RendererDebugRegistry();
  const room = new roomEnvironment.RoomEnvironmentPresentation(scene, debug, await fakeRoomAsset(scene));
  room.acceptSnapshot(snapshot({ mapCols: 2, mapRows: 1,
    map: Object.freeze([ABI.MAP_OPEN, ABI.MAP_OPEN]), vis: Object.freeze([1, 2]),
    furniture: Object.freeze([Object.freeze({ key: `${ABI.FURNITURE_TORCH}:1:0`,
      kind: ABI.FURNITURE_TORCH, tx: 1, ty: 0, state: ABI.TORCH_FACE_POS_X })]),
  }));
  const topology = scene.meshes.filter((mesh) => mesh.name.startsWith("room:tile:"));
  const dress = scene.meshes.filter((mesh) => mesh.name.startsWith("room:furniture:"));
  assert.equal(topology.length, 2, "VIS 1 and VIS 2 floor topology both exist");
  assert.ok(dress.length > 0);
  room.setPresentationMode("geometry");
  assert.ok(topology.every((mesh) => mesh.isEnabled()), "Geometry keeps published fog topology");
  assert.ok(dress.every((mesh) => !mesh.isEnabled()), "Geometry hides authored room dress");
  room.setPresentationMode("world");
  assert.ok(dress.every((mesh) => mesh.isEnabled()), "World restores the same authored instances");
  room.dispose(); scene.dispose(); engine.dispose();
});

test("remembered_room_tiles_have_no_furniture_light_shadow_pick_or_debug_presence", async () => {
  const { NullEngine } = await import("@babylonjs/core/Engines/nullEngine.js");
  const { Scene } = await import("@babylonjs/core/scene.js");
  const engine = new NullEngine(); const scene = new Scene(engine);
  const debug = new rendererDebug.RendererDebugRegistry();
  const room = new roomEnvironment.RoomEnvironmentPresentation(scene, debug, await fakeRoomAsset(scene));
  room.acceptSnapshot(snapshot({ mapCols: 1, mapRows: 1, map: Object.freeze([ABI.MAP_SOLID]),
    vis: Object.freeze([1]), furniture: Object.freeze([Object.freeze({
      key: `${ABI.FURNITURE_TORCH}:0:0`, kind: ABI.FURNITURE_TORCH, tx: 0, ty: 0,
      state: ABI.TORCH_FACE_POS_X,
    })]) }));
  // Remembered solid volume is one receding floor plus one opaque top cap;
  // neither publishes a caster, pick target, furniture row, or local light.
  assert.deepEqual(room.counts(), { geometry: 2, furniture: 0, instances: 2, lights: 1,
    shadowCasters: 0, triangles: 24 });
  assert.equal(debug.snapshot().visibility.picking, 0);
  assert.equal(debug.snapshot().visibility.debug, 0);
  const remembered = scene.meshes.filter((mesh) => mesh.name.startsWith("room:tile:"));
  assert.ok(remembered.every((mesh) => mesh.sourceMesh?.material?.name.endsWith(":remembered")));
  assert.equal(remembered.find((mesh) => mesh.name.endsWith(":floor")).sourceMesh.material.alpha, 0.42);
  assert.equal(remembered.find((mesh) => mesh.name.endsWith(":wall-cap")).sourceMesh.material.alpha, 1);
  room.dispose(); scene.dispose(); engine.dispose();
});

test('remembered_room_walls_preserve_an_opaque_masonry_silhouette', async () => {
  const { NullEngine } = await import('@babylonjs/core/Engines/nullEngine.js');
  const { Scene } = await import('@babylonjs/core/scene.js');
  const engine = new NullEngine(); const scene = new Scene(engine);
  const room = new roomEnvironment.RoomEnvironmentPresentation(
    scene, new rendererDebug.RendererDebugRegistry(), await fakeRoomAsset(scene));
  room.acceptSnapshot(snapshot({ mapCols: 2, mapRows: 2,
    map: Object.freeze([
      ABI.MAP_OPEN, ABI.MAP_OPEN,
      ABI.MAP_SOLID, ABI.MAP_SOLID,
    ]),
    vis: Object.freeze([1, 1, 1, 1]),
  }));
  const walls = scene.meshes.filter((mesh) => mesh.name.includes(':wall-face:'));
  const floors = scene.meshes.filter((mesh) => /^room:tile:\d+:\d+:floor$/.test(mesh.name));
  // The contiguous two-cell facade is one authored run. Remembered visibility
  // keeps that merged masonry silhouette opaque without splitting its identity.
  assert.equal(walls.length, 1);
  assert.ok(walls.every((mesh) => mesh.sourceMesh?.material?.alpha === 1 &&
    mesh.metadata?.roomWallVisibility === 1));
  assert.ok(floors.every((mesh) => mesh.sourceMesh?.material?.alpha === 0.42));
  room.dispose(); scene.dispose(); engine.dispose();
});

test("room_reset_epoch_change_and_absence_retire_every_instance_and_pick_registration", async () => {
  const { NullEngine } = await import("@babylonjs/core/Engines/nullEngine.js");
  const { Scene } = await import("@babylonjs/core/scene.js");
  const engine = new NullEngine(); const scene = new Scene(engine);
  const debug = new rendererDebug.RendererDebugRegistry();
  const room = new roomEnvironment.RoomEnvironmentPresentation(scene, debug, await fakeRoomAsset(scene));
  room.acceptSnapshot(snapshot({ mapCols: 1, mapRows: 1, map: Object.freeze([ABI.MAP_OPEN]), vis: Object.freeze([2]) }));
  assert.equal(room.keys().length, 1);
  const retained = scene.meshes.filter((mesh) => mesh.name.startsWith("room:tile:"));
  room.acceptSnapshot(snapshot({ tick: 2, mapCols: 1, mapRows: 1,
    map: Object.freeze([ABI.MAP_OPEN]), vis: Object.freeze([2]) }));
  assert.deepEqual(scene.meshes.filter((mesh) => mesh.name.startsWith("room:tile:")), retained);
  room.acceptSnapshot(snapshot({ epoch: 2, mapCols: 1, mapRows: 1,
    map: Object.freeze([ABI.MAP_UNKNOWN]), vis: Object.freeze([0]) }));
  assert.deepEqual(room.keys(), []);
  assert.equal(debug.snapshot().visibility.picking, 0);
  room.reset(); room.dispose(); room.dispose();
  assert.equal(debug.snapshot().instances, 0);
  scene.dispose(); engine.dispose();
});

test("room_source_meshes_stay_hidden_and_do_not_count_as_visible_presence", async () => {
  const { NullEngine } = await import("@babylonjs/core/Engines/nullEngine.js");
  const { Scene } = await import("@babylonjs/core/scene.js");
  const { FreeCamera } = await import("@babylonjs/core/Cameras/freeCamera.js");
  const { Vector3 } = await import("@babylonjs/core/Maths/math.vector.js");
  const engine = new NullEngine(); const scene = new Scene(engine);
  new FreeCamera("test-camera", new Vector3(0, 4, -5), scene).setTarget(Vector3.Zero());
  const debug = new rendererDebug.RendererDebugRegistry();
  const asset = await fakeRoomAsset(scene);
  const room = new roomEnvironment.RoomEnvironmentPresentation(scene, debug, asset);
  room.acceptSnapshot(snapshot({ mapCols: 1, mapRows: 1, map: Object.freeze([ABI.MAP_OPEN]), vis: Object.freeze([2]) }));
  scene.render();
  assert.ok([...asset.pieces.values()].every((source) => source.isEnabled() && !source.isVisible && !source.isPickable));
  const rememberedSources = scene.meshes.filter((mesh) => mesh.name.startsWith("room:source:"));
  assert.equal(rememberedSources.length, 20,
    "current and remembered sources both close the ten floor/wall module recipes");
  assert.ok(rememberedSources.every((source) => source.isEnabled() && !source.isVisible && !source.isPickable));
  assert.equal(debug.snapshot().meshes, 0);
  const active = scene.getActiveMeshes();
  assert.ok(active.data.slice(0, active.length).some((mesh) => mesh?.name.startsWith("room:tile:")));
  assert.equal(active.data.slice(0, active.length).some((mesh) =>
    mesh?.name.startsWith("ROOM_") || mesh?.name.startsWith("room:source:")), false);
  room.dispose(); scene.dispose(); engine.dispose();
});

test("unknown_room_tiles_leave_no_enabled_spatial_instance_or_registry_residue", async () => {
  const { NullEngine } = await import("@babylonjs/core/Engines/nullEngine.js");
  const { Scene } = await import("@babylonjs/core/scene.js");
  const engine = new NullEngine(); const scene = new Scene(engine);
  const debug = new rendererDebug.RendererDebugRegistry();
  const room = new roomEnvironment.RoomEnvironmentPresentation(scene, debug, await fakeRoomAsset(scene));
  room.acceptSnapshot(snapshot({ mapCols: 2, mapRows: 1,
    map: Object.freeze([ABI.MAP_UNKNOWN, ABI.MAP_UNKNOWN]), vis: Object.freeze([0, 1]),
    furniture: Object.freeze([Object.freeze({ key: `${ABI.FURNITURE_TORCH}:1:0`,
      kind: ABI.FURNITURE_TORCH, tx: 1, ty: 0, state: ABI.TORCH_FACE_POS_X })]) }));
  assert.deepEqual(room.keys(), []);
  assert.deepEqual(room.counts(), { geometry: 0, furniture: 0, instances: 0,
    lights: 1, shadowCasters: 0, triangles: 0 });
  assert.equal(debug.snapshot().visibility.picking, 0);
  assert.equal(debug.snapshot().visibility.debug, 0);
  room.dispose(); scene.dispose(); engine.dispose();
});

test("the_flame_has_a_tapered_core_and_outer_silhouette_at_gameplay_scale", async () => {
  const { Vector3 } = await import("@babylonjs/core/Maths/math.vector.js");
  const firstEngine = new NullEngine(); const firstScene = new Scene(firstEngine);
  const secondEngine = new NullEngine(); const secondScene = new Scene(secondEngine);
  const first = roomFlame.createTorchFlame(firstScene, "torch:7:2", new Vector3(2, 0.5, 3));
  const same = roomFlame.createTorchFlame(secondScene, "torch:7:2", new Vector3(0, 0, 0));
  const different = roomFlame.createTorchFlame(secondScene, "torch:8:2", new Vector3(0, 0, 0));
  assert.equal(first.phase, same.phase);
  assert.notEqual(first.phase, different.phase);
  assert.equal(first.meshes.length, 3);
  assert.ok(first.meshes.every((mesh) => !mesh.isPickable && !mesh.receiveShadows));
  const [outer, core, halo] = first.meshes;
  assert.match(outer.name, /flame-outer$/); assert.match(core.name, /flame-core$/);
  assert.match(halo.name, /flame-halo$/);
  assert.ok(outer.getBoundingInfo().boundingBox.extendSize.y >
    outer.getBoundingInfo().boundingBox.extendSize.x,
  "the outer flame must taper vertically instead of reading as an orange ball");
  assert.ok(core.getBoundingInfo().boundingBox.extendSize.y >
    core.getBoundingInfo().boundingBox.extendSize.x,
  "the opaque core must remain a separate upright flame silhouette");
  const names = first.meshes.map((mesh) => mesh.name);
  first.dispose();
  assert.ok(names.every((name) => firstScene.getMeshByName(name) === null));
  same.dispose(); different.dispose(); firstScene.dispose(); secondScene.dispose();
  firstEngine.dispose(); secondEngine.dispose();
});

test("concept_light_rigs_are_warm_from_upper_right_restrained_in_fill_and_broad_at_torches", async () => {
  const { NullEngine } = await import("@babylonjs/core/Engines/nullEngine.js");
  const { Scene } = await import("@babylonjs/core/scene.js");

  const roomEngine = new NullEngine(); const roomScene = new Scene(roomEngine);
  const debug = new rendererDebug.RendererDebugRegistry();
  const room = new roomEnvironment.RoomEnvironmentPresentation(
    roomScene, debug, await fakeRoomAsset(roomScene));
  const torch = Object.freeze({ key: `${ABI.FURNITURE_TORCH}:0:0`,
    kind: ABI.FURNITURE_TORCH, tx: 0, ty: 0, state: ABI.TORCH_FACE_POS_X });
  room.acceptSnapshot(snapshot({ mapCols: 1, mapRows: 1,
    map: Object.freeze([ABI.MAP_OPEN]), vis: Object.freeze([2]),
    mapRevision: 80, visRevision: 80, furnitureRevision: 80,
    furniture: Object.freeze([torch]) }));
  const roomKey = roomScene.getLightByName("room:directional-key");
  const torchLight = roomScene.getLightByName(`room:torch:${torch.key}`);
  const outerFlame = roomScene.getMeshByName(`room:torch:${torch.key}:flame-outer`);
  const coreFlame = roomScene.getMeshByName(`room:torch:${torch.key}:flame-core`);
  assert.deepEqual([roomKey.direction.x, roomKey.direction.y, roomKey.direction.z], [-0.45, -1, -0.35]);
  assert.deepEqual([roomKey.diffuse.r, roomKey.diffuse.g, roomKey.diffuse.b], [1, 0.68, 0.42]);
  assert.deepEqual([roomKey.specular.r, roomKey.specular.g, roomKey.specular.b], [0.36, 0.23, 0.15]);
  assert.equal(roomKey.intensity, 1.6,
    "the upper-right key must separate bright wall tops without adding ambient fill");
  assert.deepEqual([torchLight.diffuse.r, torchLight.diffuse.g, torchLight.diffuse.b,
    torchLight.specular.r, torchLight.specular.g, torchLight.specular.b],
  [1, 0.25, 0.045, 0.42, 0.18, 0.055]);
  assert.deepEqual([torchLight.intensity, torchLight.range], [8.5, 10.5]);
  assert.deepEqual(roomScene.getMaterialByName("floor_current").diffuseColor.asArray(),
    [0.74, 0.76, 0.80], "current flagstones keep a neutral charcoal value family");
  assert.deepEqual(roomScene.getMaterialByName("stone_current").diffuseColor.asArray(),
    [0.95, 0.82, 0.66], "masonry stays warmer than the disclosed floor");
  assert.deepEqual(roomScene.getMaterialByName("wood_current").diffuseColor.asArray(),
    [0.42, 0.26, 0.14], "door planks stay aged umber rather than flat beige");
  assert.deepEqual(roomScene.getMaterialByName("wood_current").emissiveColor.asArray(),
    [0.018, 0.010, 0.005]);
  assert.deepEqual([outerFlame.material.emissiveColor.r, outerFlame.material.emissiveColor.g,
    outerFlame.material.emissiveColor.b], [0, 0, 0]);
  assert.deepEqual([coreFlame.material.emissiveColor.r, coreFlame.material.emissiveColor.g,
    coreFlame.material.emissiveColor.b], [0, 0, 0],
  "the authored PNG alone owns the white-hot-to-orange colour ramp; StandardMaterial adds its colour");
  assert.match(outerFlame.material.emissiveTexture?.name ?? "", /room_vfx_flame[.]png$/);
  assert.equal(outerFlame.material.alphaMode, 1,
  "the authored RGB plume uses additive blending rather than losing smoke to alpha cutoff");
  assert.equal(outerFlame.material.depthFunction, 519,
  "the focal plume must not be depth-erased by its authored masonry socket");
  assert.ok(outerFlame.getBoundingInfo().boundingBox.extendSizeWorld.y >
    outerFlame.getBoundingInfo().boundingBox.extendSizeWorld.x,
  "the flame must remain a tapered silhouette at the gameplay camera scale");

  room.acceptSnapshot(snapshot({ mapCols: 1, mapRows: 1,
    map: Object.freeze([ABI.MAP_OPEN]), vis: Object.freeze([1]),
    mapRevision: 80, visRevision: 81, furnitureRevision: 80,
    furniture: Object.freeze([torch]) }));
  assert.equal(roomScene.getLightByName(`room:torch:${torch.key}`), null);
  assert.equal(roomScene.getMeshByName(`room:torch:${torch.key}:flame-outer`), null);
  assert.equal(roomScene.getMeshByName(`room:torch:${torch.key}:flame-core`), null);
  assert.deepEqual([room.counts().lights, debug.snapshot().visibility.effects], [1, 0]);
  room.dispose(); roomScene.dispose(); roomEngine.dispose();

  const arenaEngine = new NullEngine(); const arenaScene = new Scene(arenaEngine);
  const arena = new arenaEnvironment.ArenaEnvironment(arenaScene);
  const arenaKey = arenaScene.getLightByName("arena-key");
  const fill = arenaScene.getLightByName("arena-fill");
  assert.deepEqual([arenaKey.direction.x, arenaKey.direction.y, arenaKey.direction.z],
    [-0.45, -1, -0.35]);
  assert.ok(arenaKey.position.x > 0 && arenaKey.position.y > 0 && arenaKey.position.z > 0);
  assert.deepEqual([arenaKey.diffuse.r, arenaKey.diffuse.g, arenaKey.diffuse.b,
    arenaKey.specular.r, arenaKey.specular.g, arenaKey.specular.b],
  [1, 0.68, 0.42, 0.36, 0.23, 0.15]);
  assert.deepEqual([fill.diffuse.r, fill.diffuse.g, fill.diffuse.b,
    fill.groundColor.r, fill.groundColor.g, fill.groundColor.b, fill.intensity],
  [0.30, 0.25, 0.20, 0.025, 0.020, 0.018, 0.28]);
  assert.equal(arenaScene.lights.every((light) => !light.isEnabled()), true);
  arena.setEnabled(true);
  assert.equal(arenaScene.lights.every((light) => light.isEnabled()), true);
  arena.setEnabled(false);
  assert.equal(arenaScene.lights.every((light) => !light.isEnabled()), true);
  arena.dispose(); arenaScene.dispose(); arenaEngine.dispose();
});

test("the_representative_room_is_a_closed_boundary_graph_with_only_published_door_breaks", () => {
  const fixture = roomStress.createRoomStressFixture();
  const at = (tx, ty) => fixture.map[ty * fixture.mapCols + tx];
  assert.deepEqual(fixture.furniture.filter(({ kind }) => kind === ABI.FURNITURE_DOOR)
    .map(({ tx, ty, state }) => [tx, ty, state]), [
    [18, 11, ABI.FURNITURE_DOOR_SHUT], [18, 15, ABI.FURNITURE_DOOR_OPEN],
  ]);
  assert.equal(at(12, 11), ABI.MAP_OPEN, "the old unexplained left cap is floor");
  assert.equal(at(20, 13), ABI.MAP_OPEN, "the old orphan east cap is floor");
  assert.equal(at(15, 14), ABI.MAP_SOLID, "the replacement is a closed rectangular wall ring");
  assert.deepEqual(roomEnvironment.chooseRoomBoundaryWalls(fixture, 17, 11), [
    { piece: "wall_straight", quarterTurns: 0, offsetX: 0, offsetZ: -0.5 },
    { piece: "wall_straight", quarterTurns: 0, offsetX: 0, offsetZ: 0.5 },
  ], "a top run exposes its two continuous architectural faces");
  assert.deepEqual(roomEnvironment.chooseRoomBoundaryWalls(fixture, 15, 11), [
    { piece: "wall_straight", quarterTurns: 0, offsetX: 0, offsetZ: -0.5 },
    { piece: "wall_straight", quarterTurns: 1, offsetX: -0.5, offsetZ: 0 },
  ], "the north-west corner closes at one shared grid vertex");
  assert.deepEqual(roomEnvironment.chooseRoomBoundaryWalls(fixture, 18, 11), [],
    "a published shut door replaces rather than overlaps its wall faces");
  assert.deepEqual(roomEnvironment.chooseRoomBoundaryWalls(fixture, 18, 15), [],
    "a published open door remains an explicit opening rather than floor-edge walls");

  const endpointDegree = new Map();
  const addEndpoint = (x, z) => {
    const key = x + ":" + z;
    endpointDegree.set(key, (endpointDegree.get(key) ?? 0) + 1);
  };
  let wallFaces = 0;
  for (let ty = 0; ty < fixture.mapRows; ty++) for (let tx = 0; tx < fixture.mapCols; tx++) {
    for (const wall of roomEnvironment.chooseRoomBoundaryWalls(fixture, tx, ty)) {
      wallFaces++;
      if (wall.quarterTurns === 0) {
        const z = ty + 0.5 + wall.offsetZ;
        addEndpoint(tx, z); addEndpoint(tx + 1, z);
      } else {
        const x = tx + 0.5 + wall.offsetX;
        addEndpoint(x, ty); addEndpoint(x, ty + 1);
      }
    }
  }
  // Each one-tile doorway has a frame on both exposed faces. Those exact
  // segments close the boundary graph where ordinary wall faces are suppressed.
  for (const [tx, ty] of [[18, 11], [18, 15]]) {
    addEndpoint(tx, ty); addEndpoint(tx + 1, ty);
    addEndpoint(tx, ty + 1); addEndpoint(tx + 1, ty + 1);
  }
  assert.equal(wallFaces, 188);
  assert.deepEqual([...endpointDegree.entries()].filter(([, degree]) => degree !== 2), [],
    "every visible boundary vertex has degree two: no orphan cap or unexplained gap");
});

test("all_four_disclosed_solid_open_orientations_create_stable_wall_faces", () => {
  const world = snapshot({ mapCols: 3, mapRows: 3,
    map: Object.freeze([
      ABI.MAP_SOLID, ABI.MAP_SOLID, ABI.MAP_SOLID,
      ABI.MAP_SOLID, ABI.MAP_OPEN, ABI.MAP_SOLID,
      ABI.MAP_SOLID, ABI.MAP_SOLID, ABI.MAP_SOLID,
    ]),
    vis: Object.freeze(new Array(9).fill(2)),
  });
  assert.deepEqual(roomEnvironment.chooseRoomWallFaces(world).map(({ tx, ty, side }) =>
    [tx, ty, side]), [[1, 0, 2], [0, 1, 1], [2, 1, 3], [1, 2, 0]]);
  assert.deepEqual(roomEnvironment.chooseRoomWallFaces(world).map(({ key }) => key),
    ["wall:1:0:2", "wall:0:1:1", "wall:2:1:3", "wall:1:2:0"]);
});

test("wall_face_identity_survives_current_to_remembered_and_neighbour_disclosure", async () => {
  const map = Object.freeze([
    ABI.MAP_SOLID, ABI.MAP_SOLID, ABI.MAP_SOLID,
    ABI.MAP_SOLID, ABI.MAP_OPEN, ABI.MAP_SOLID,
    ABI.MAP_SOLID, ABI.MAP_SOLID, ABI.MAP_SOLID,
  ]);
  const first = snapshot({ mapCols: 3, mapRows: 3, map,
    vis: Object.freeze([0, 2, 0, 0, 2, 0, 0, 0, 0]) });
  const second = snapshot({ mapCols: 3, mapRows: 3, map, visRevision: 2,
    vis: Object.freeze([2, 1, 2, 2, 1, 2, 2, 2, 2]) });
  const { NullEngine } = await import("@babylonjs/core/Engines/nullEngine.js");
  const { Scene } = await import("@babylonjs/core/scene.js");
  const engine = new NullEngine(); const scene = new Scene(engine);
  const room = new roomEnvironment.RoomEnvironmentPresentation(
    scene, new rendererDebug.RendererDebugRegistry(), await fakeRoomAsset(scene));
  try {
    room.acceptSnapshot(first);
    const retained = scene.getMeshByName("room:tile:1:0:wall-face:2");
    assert.ok(retained);
    room.acceptSnapshot(second);
    assert.equal(scene.getMeshByName("room:tile:1:0:wall-face:2"), retained);
    assert.equal(retained.metadata.roomWallVisibility, 1);
    assert.equal(scene.meshes.filter((mesh) => mesh.name.includes(":wall-face:")).length, 4);
  } finally {
    room.dispose(); scene.dispose(); engine.dispose();
  }
});

test("unknown_cells_create_no_wall_face_or_subsystem_presence", async () => {
  const { NullEngine } = await import("@babylonjs/core/Engines/nullEngine.js");
  const { Scene } = await import("@babylonjs/core/scene.js");
  const engine = new NullEngine(); const scene = new Scene(engine);
  const debug = new rendererDebug.RendererDebugRegistry();
  const room = new roomEnvironment.RoomEnvironmentPresentation(scene, debug, await fakeRoomAsset(scene));
  room.acceptSnapshot(snapshot({ mapCols: 2, mapRows: 1,
    map: Object.freeze([ABI.MAP_SOLID, ABI.MAP_OPEN]), vis: Object.freeze([0, 0]) }));
  assert.deepEqual(room.counts(), { geometry: 0, furniture: 0, instances: 0,
    lights: 1, shadowCasters: 0, triangles: 0 });
  assert.equal(scene.meshes.some((mesh) => mesh.name.includes(":wall-face:")), false);
  assert.deepEqual([
    debug.snapshot().visibility.geometry, debug.snapshot().visibility.furniture,
    debug.snapshot().visibility.effects, debug.snapshot().visibility.picking,
    debug.snapshot().visibility.debug,
  ], [0, 0, 0, 0, 0]);
  room.dispose(); scene.dispose(); engine.dispose();
});

test("unknown_and_outside_space_are_filled_by_non_disclosing_stone_art", async () => {
  const engine = new NullEngine(); const scene = new Scene(engine);
  const room = new roomEnvironment.RoomEnvironmentPresentation(
    scene, new rendererDebug.RendererDebugRegistry(), await fakeRoomAsset(scene));
  room.acceptSnapshot(snapshot({ mapCols: 2, mapRows: 2,
    map: Object.freeze(new Array(4).fill(ABI.MAP_UNKNOWN)),
    vis: Object.freeze(new Array(4).fill(0)) }));
  assert.ok(scene.meshes.some((mesh) => mesh.name === "room:overburden:ground"));
  assert.equal(scene.meshes.filter((mesh) => mesh.name.startsWith("room:overburden:cliff:")).length, 4);
  const roofs = scene.meshes.filter((mesh) => mesh.name.startsWith("room:overburden:roof:"));
  assert.equal(roofs.length, 4);
  assert.ok(roofs.every((mesh) => !mesh.isPickable && mesh.metadata === null));
  assert.deepEqual(room.counts(), { geometry: 0, furniture: 0, instances: 0,
    lights: 1, shadowCasters: 0, triangles: 0 });
  room.dispose(); scene.dispose(); engine.dispose();
});

test("outer_boundaries_are_thick_masonry_joined_to_overburden", async () => {
  const engine = new NullEngine(); const scene = new Scene(engine);
  const room = new roomEnvironment.RoomEnvironmentPresentation(
    scene, new rendererDebug.RendererDebugRegistry(), await fakeRoomAsset(scene));
  room.acceptSnapshot(snapshot({ mapCols: 3, mapRows: 3,
    map: Object.freeze([
      ABI.MAP_SOLID, ABI.MAP_SOLID, ABI.MAP_SOLID,
      ABI.MAP_SOLID, ABI.MAP_OPEN, ABI.MAP_SOLID,
      ABI.MAP_SOLID, ABI.MAP_SOLID, ABI.MAP_SOLID,
    ]), vis: Object.freeze(new Array(9).fill(2)) }));
  const faces = scene.meshes.filter((mesh) => mesh.name.includes(":wall-face:"));
  assert.ok(faces.length === 4 && faces.every((mesh) => mesh.scaling.z === 1),
    "authored relief owns wall depth without stretching coping toward the hero");
  assert.ok(scene.getMeshByName("room:overburden:ground"));
  room.dispose(); scene.dispose(); engine.dispose();
});

test("only_objects_covering_the_hero_fade_and_restore_the_same_identity", async () => {
  const engine = new NullEngine(); const scene = new Scene(engine);
  const room = new roomEnvironment.RoomEnvironmentPresentation(
    scene, new rendererDebug.RendererDebugRegistry(), await fakeRoomAsset(scene));
  room.acceptSnapshot(snapshot({ mapCols: 2, mapRows: 1,
    map: Object.freeze([ABI.MAP_SOLID, ABI.MAP_OPEN]), vis: Object.freeze([2, 2]) }));
  const face = scene.getMeshByName("room:tile:0:0:wall-face:1");
  assert.ok(face);
  const project = ({ x, y, z }) => ({ x: x * 100, y: -y * 100, depth: z });
  for (let frame = 0; frame < 20; frame++) room.updateOcclusion(project, { x: 1, z: 1 });
  assert.equal(face.isVisible, false);
  assert.equal(room.shadowGenerator.getShadowMap()?.renderList?.includes(face), false,
    "a local aperture removes the matching caster instead of leaving a triangular shadow");
  for (let frame = 0; frame < 40; frame++) room.updateOcclusion(project, null);
  assert.equal(scene.getMeshByName("room:tile:0:0:wall-face:1"), face);
  assert.equal(face.isVisible, true);
  assert.ok(room.shadowGenerator.getShadowMap()?.renderList?.includes(face));
  room.dispose(); scene.dispose(); engine.dispose();
});

test("only_a_near_face_overlapping_the_hero_receives_local_cutaway", () => {
  const face = (key, x, depth) => ({ key, corners: [
    { x: x - 0.5, y: 0, z: depth }, { x: x + 0.5, y: 0, z: depth },
    { x: x - 0.5, y: 2, z: depth }, { x: x + 0.5, y: 2, z: depth },
  ] });
  const project = ({ x, y, z }) => ({ x: x * 40, y: -y * 40, depth: z });
  const faces = [face("near-overlap", 5, 4), face("near-elsewhere", 20, 4), face("back-overlap", 5, 6)];
  assert.deepEqual([...roomOcclusion.chooseLocalWallCutaways(faces, { x: 5, z: 5 }, project)],
    ["near-overlap"]);
  assert.deepEqual([...roomOcclusion.chooseLocalWallCutaways(faces, { x: 20, z: 5 }, project)],
    ["near-elsewhere"], "moving away restores the same first face and cuts only the new overlap");
});

test("walking_all_four_room_sides_never_removes_or_rebuilds_a_wall", async () => {
  const map = Object.freeze([
    ABI.MAP_SOLID, ABI.MAP_SOLID, ABI.MAP_SOLID,
    ABI.MAP_SOLID, ABI.MAP_OPEN, ABI.MAP_SOLID,
    ABI.MAP_SOLID, ABI.MAP_SOLID, ABI.MAP_SOLID,
  ]);
  const { NullEngine } = await import("@babylonjs/core/Engines/nullEngine.js");
  const { Scene } = await import("@babylonjs/core/scene.js");
  const engine = new NullEngine(); const scene = new Scene(engine);
  const room = new roomEnvironment.RoomEnvironmentPresentation(
    scene, new rendererDebug.RendererDebugRegistry(), await fakeRoomAsset(scene));
  room.acceptSnapshot(snapshot({ mapCols: 3, mapRows: 3, map,
    vis: Object.freeze([0, 2, 0, 0, 2, 0, 0, 0, 0]) }));
  const retained = scene.getMeshByName("room:tile:1:0:wall-face:2");
  assert.ok(retained);
  assert.ok(room.shadowGenerator.getShadowMap()?.renderList?.includes(retained));
  room.acceptSnapshot(snapshot({ mapCols: 3, mapRows: 3, map, visRevision: 2,
    vis: Object.freeze(new Array(9).fill(2)) }));
  assert.equal(scene.getMeshByName("room:tile:1:0:wall-face:2"), retained);
  assert.ok(room.shadowGenerator.getShadowMap()?.renderList?.includes(retained));
  assert.equal(room.counts().shadowCasters,
    new Set(room.shadowGenerator.getShadowMap()?.renderList ?? []).size);
  room.dispose(); scene.dispose(); engine.dispose();
});

test("singleton_boundary_faces_are_not_discarded", async () => {
  const { NullEngine } = await import("@babylonjs/core/Engines/nullEngine.js");
  const { Scene } = await import("@babylonjs/core/scene.js");
  const engine = new NullEngine(); const scene = new Scene(engine);
  const room = new roomEnvironment.RoomEnvironmentPresentation(
    scene, new rendererDebug.RendererDebugRegistry(), await fakeRoomAsset(scene));
  const singletonMap = Object.freeze([
    ABI.MAP_SOLID, ABI.MAP_SOLID, ABI.MAP_SOLID,
    ABI.MAP_SOLID, ABI.MAP_OPEN, ABI.MAP_SOLID,
    ABI.MAP_SOLID, ABI.MAP_SOLID, ABI.MAP_SOLID,
  ]);
  const singletonWorld = snapshot({ mapCols: 3, mapRows: 3, map: singletonMap,
    mapRevision: 2, visRevision: 2, vis: Object.freeze(new Array(9).fill(2)) });
  room.acceptSnapshot(singletonWorld);
  const faces = scene.meshes.filter((mesh) => mesh.name.includes(":wall-face:"));
  assert.equal(faces.length, 4);
  assert.ok(faces.every((mesh) => mesh.scaling.y === roomEnvironment.ROOM_WALL_HEIGHT / 0.9),
    "one-tile boundaries are full-height masonry, never suppressed as posts");
  room.dispose(); scene.dispose(); engine.dispose();
});

test("disclosed_solid_cells_keep_raised_masonry_caps_above_cutaway_faces", async () => {
  const { NullEngine } = await import("@babylonjs/core/Engines/nullEngine.js");
  const { Scene } = await import("@babylonjs/core/scene.js");
  const engine = new NullEngine(); const scene = new Scene(engine);
  const room = new roomEnvironment.RoomEnvironmentPresentation(
    scene, new rendererDebug.RendererDebugRegistry(), await fakeRoomAsset(scene));
  const world = snapshot({ mapCols: 3, mapRows: 2,
    map: Object.freeze([
      ABI.MAP_OPEN, ABI.MAP_OPEN, ABI.MAP_OPEN,
      ABI.MAP_SOLID, ABI.MAP_SOLID, ABI.MAP_SOLID,
    ]),
    vis: Object.freeze([2, 2, 2, 1, 2, 2]),
  });
  room.acceptSnapshot(world);
  const caps = scene.meshes.filter((mesh) => /^room:tile:\d+:\d+:wall-cap$/.test(mesh.name));
  assert.equal(caps.length, 3);
  assert.ok(caps.every((mesh) => Math.abs(mesh.position.y - 1.55) < 1e-12 &&
    mesh.rotationQuaternion === null && mesh.rotation.x === 0 &&
    mesh.scaling.x === 0.96 && mesh.scaling.z === 0.96));
  const faces = scene.meshes.filter((mesh) => mesh.name.includes(":wall-face:"));
  assert.ok(faces.length > 0);
  assert.ok(faces.every((mesh) => mesh.scaling.y === 1.65 / 0.9));
  assert.equal(caps.filter((mesh) =>
    mesh.sourceMesh?.material?.name.endsWith(":remembered")).length, 1);
  assert.equal(caps.find((mesh) =>
    mesh.sourceMesh?.material?.name.endsWith(":remembered")).sourceMesh.material.alpha, 1,
  "remembered wall tops keep the same solid silhouette as remembered wall faces");
  room.dispose(); scene.dispose(); engine.dispose();
});

test("ambient_room_dressing_is_bounded_deterministic_disclosed_and_non_pickable", async () => {
  const mapCols = 12, mapRows = 8;
  const map = Object.freeze(Array.from({ length: mapCols * mapRows }, (_, at) => {
    const tx = at % mapCols, ty = Math.floor(at / mapCols);
    return tx === 0 || ty === 0 || tx === mapCols - 1 || ty === mapRows - 1
      ? ABI.MAP_SOLID : ABI.MAP_OPEN;
  }));
  const vis = Object.freeze(new Array(map.length).fill(2));
  const world = snapshot({ mapCols, mapRows, map, vis, furniture: Object.freeze([]) });
  const first = roomEnvironment.chooseRoomAmbientDressing(world, 1592594996);
  const second = roomEnvironment.chooseRoomAmbientDressing(world, 1592594996);
  assert.deepEqual(first, second);
  assert.ok(first.length >= 3 && first.length <= 12);
  assert.deepEqual(new Set(first.map(({ piece }) => piece)),
    new Set(["decal_root", "decal_rubble"]),
    "automatic dressing stays low-profile; authored fixtures may place wall-adjacent barrels explicitly");
  assert.ok(first.every(({ piece, tx, ty, quarterTurns }) =>
    (piece === "decal_rubble" || piece === "decal_root" || piece === "prop_barrel") &&
    map[ty * mapCols + tx] === ABI.MAP_OPEN && vis[ty * mapCols + tx] === 2 &&
    Number.isInteger(quarterTurns) && quarterTurns >= 0 && quarterTurns <= 3));

  const { NullEngine } = await import("@babylonjs/core/Engines/nullEngine.js");
  const { Scene } = await import("@babylonjs/core/scene.js");
  const engine = new NullEngine(); const scene = new Scene(engine);
  const room = new roomEnvironment.RoomEnvironmentPresentation(
    scene, new rendererDebug.RendererDebugRegistry(), await fakeRoomAsset(scene));
  room.acceptSnapshot(world);
  const ambient = scene.meshes.filter((mesh) => mesh.name.startsWith("room:ambient:"));
  assert.equal(ambient.length, first.length);
  assert.ok(ambient.every((mesh) => !mesh.isPickable));
  assert.equal(room.counts().furniture, 0,
    "presentation-only dressing never creates semantic furniture or simulation feedback");
  room.dispose(); scene.dispose(); engine.dispose();
});

test("boundary_faces_require_a_disclosed_solid_open_interface_and_fog_never_draws", () => {
  const disclosed = snapshot({ mapCols: 3, mapRows: 1,
    map: Object.freeze([ABI.MAP_SOLID, ABI.MAP_OPEN, ABI.MAP_UNKNOWN]),
    vis: Object.freeze([2, 2, 0]) });
  assert.deepEqual(roomEnvironment.chooseRoomBoundaryWalls(disclosed, 0, 0), [
    { piece: "wall_straight", quarterTurns: 1, offsetX: 0.5, offsetZ: 0 },
  ]);
  assert.deepEqual(roomEnvironment.chooseRoomBoundaryWalls(disclosed, 1, 0), []);
  assert.deepEqual(roomEnvironment.chooseRoomBoundaryWalls(disclosed, 2, 0), []);
  const frontier = snapshot({ mapCols: 2, mapRows: 1,
    map: Object.freeze([ABI.MAP_SOLID, ABI.MAP_UNKNOWN]),
    vis: Object.freeze([2, 0]) });
  assert.deepEqual(roomEnvironment.chooseRoomBoundaryWalls(frontier, 0, 0), [],
    "fog neither becomes a wall face nor invents an opening behind it");
});

test("published_door_cells_form_one_architectural_span_without_repeated_frames", async () => {
  const door = (tx, ty, state) => Object.freeze({
    key: ABI.FURNITURE_DOOR + ":" + tx + ":" + ty,
    kind: ABI.FURNITURE_DOOR, tx, ty, state,
  });
  const furniture = Object.freeze([
    door(1, 1, ABI.FURNITURE_DOOR_SHUT),
    door(2, 1, ABI.FURNITURE_DOOR_SHUT),
    door(3, 1, ABI.FURNITURE_DOOR_SHUT),
    door(5, 2, ABI.FURNITURE_DOOR_OPEN),
    door(5, 3, ABI.FURNITURE_DOOR_OPEN),
    door(1, 5, ABI.FURNITURE_DOOR_SHUT),
  ]);
  const world = snapshot({ mapCols: 8, mapRows: 7,
    map: Object.freeze(new Array(56).fill(ABI.MAP_OPEN)),
    vis: Object.freeze(new Array(56).fill(2)), furniture,
  });
  assert.deepEqual(roomEnvironment.chooseRoomDoorRuns(world), [
    { quarterTurns: 0, tx: 1, ty: 1, length: 3, state: ABI.FURNITURE_DOOR_SHUT,
      keys: furniture.slice(0, 3).map(({ key }) => key) },
    { quarterTurns: 1, tx: 5, ty: 2, length: 2, state: ABI.FURNITURE_DOOR_OPEN,
      keys: furniture.slice(3, 5).map(({ key }) => key) },
    { quarterTurns: 0, tx: 1, ty: 5, length: 1, state: ABI.FURNITURE_DOOR_SHUT,
      keys: [furniture[5].key] },
  ]);

  const { NullEngine } = await import("@babylonjs/core/Engines/nullEngine.js");
  const { Scene } = await import("@babylonjs/core/scene.js");
  const engine = new NullEngine(); const scene = new Scene(engine);
  const room = new roomEnvironment.RoomEnvironmentPresentation(
    scene, new rendererDebug.RendererDebugRegistry(), await fakeRoomAsset(scene));
  room.acceptSnapshot(world);
  const keys = room.keys();
  assert.equal(keys.filter((key) => key.endsWith(":frame")).length, 1,
    "only the singleton doorway uses a complete frame");
  assert.equal(keys.filter((key) => key.includes(":span:lintel:")).length, 0,
    "the wall contour owns the continuous masonry above a multi-cell opening");
  assert.equal(keys.filter((key) => key.includes(":span:jamb:")).length, 4);
  assert.equal(keys.filter((key) => key.includes(":span:leaf:")).length, 9,
    "three narrow plank modules close each shut span tile while open spans remain gaps");
  assert.equal(keys.filter((key) => key.includes(":door-iron:")).length, 2,
    "only the shut singleton leaf owns the two readable strap instances");
  const jambs = scene.meshes.filter((mesh) => mesh.name.includes(":span:jamb:"));
  assert.ok(jambs.every((mesh) =>
    mesh.scaling.x === 0.14 && mesh.scaling.y === 1.65 / 0.9));
  room.dispose(); scene.dispose(); engine.dispose();
});

test("door_frames_follow_horizontal_and_vertical_runs_and_replace_boundary_faces", async () => {
  const { NullEngine } = await import("@babylonjs/core/Engines/nullEngine.js");
  const { Scene } = await import("@babylonjs/core/scene.js");
  const { Quaternion } = await import("@babylonjs/core/Maths/math.vector.js");
  const engine = new NullEngine(); const scene = new Scene(engine);
  const debug = new rendererDebug.RendererDebugRegistry();
  const map = new Array(25).fill(ABI.MAP_OPEN);
  for (const [tx, ty] of [[0, 1], [2, 1], [3, 1], [3, 3]]) map[ty * 5 + tx] = ABI.MAP_SOLID;
  const horizontal = Object.freeze({ key: `${ABI.FURNITURE_DOOR}:1:1`,
    kind: ABI.FURNITURE_DOOR, tx: 1, ty: 1, state: ABI.FURNITURE_DOOR_SHUT });
  const vertical = Object.freeze({ key: `${ABI.FURNITURE_DOOR}:3:2`,
    kind: ABI.FURNITURE_DOOR, tx: 3, ty: 2, state: ABI.FURNITURE_DOOR_OPEN });
  const world = snapshot({ mapCols: 5, mapRows: 5, map: Object.freeze(map),
    vis: Object.freeze(new Array(25).fill(2)), furniture: Object.freeze([horizontal, vertical]) });
  assert.deepEqual(roomEnvironment.chooseRoomBoundaryWalls(world, 0, 1)
    .filter(({ offsetX }) => offsetX === 0.5), [],
    "the horizontal published door suppresses the neighbouring solid face");
  assert.deepEqual(roomEnvironment.chooseRoomBoundaryWalls(world, 3, 1)
    .filter(({ offsetZ }) => offsetZ === 0.5), [],
    "the vertical published door suppresses the neighbouring solid face");
  const asset = await fakeRoomAsset(scene);
  for (const source of asset.pieces.values()) source.rotationQuaternion = Quaternion.Identity();
  const room = new roomEnvironment.RoomEnvironmentPresentation(scene, debug, asset);
  room.acceptSnapshot(world);
  const mesh = (door, suffix) => scene.getMeshByName(`room:furniture:${door.key}:${suffix}`);
  assert.deepEqual([
    mesh(horizontal, "frame").position.x, mesh(horizontal, "frame").position.z,
    mesh(horizontal, "frame").rotation.y,
  ], [1.5, 1, 0]);
  assert.deepEqual([
    mesh(horizontal, "leaf").position.x, mesh(horizontal, "leaf").position.z,
    mesh(horizontal, "leaf").rotation.y,
  ], [1.5, 1, 0]);
  assert.deepEqual([
    mesh(vertical, "frame").position.x, mesh(vertical, "frame").position.z,
    mesh(vertical, "frame").rotation.y,
  ], [3, 2.5, Math.PI / 2]);
  assert.equal(mesh(vertical, "frame").rotationQuaternion, null,
    "the imported identity quaternion must not override the vertical frame quarter turn");
  assert.deepEqual([
    mesh(vertical, "leaf"), mesh(vertical, "leaf:plank:0"), mesh(vertical, "leaf:plank:2"),
  ], [null, null, null], "an open vertical frame presents an unobstructed aperture");
  room.dispose(); scene.dispose(); engine.dispose();
});

test("the_fixed_room_stress_fixture_has_the_named_asset_hash_population_and_piece_counts", async () => {
  const { createHash } = await import("node:crypto");
  const fixture = roomStress.createRoomStressFixture();
  assert.deepEqual([fixture.mapCols, fixture.mapRows, fixture.map.length, fixture.units.length],
    [48, 32, 1536, 64]);
  assert.equal(fixture.map.filter((value) => value === ABI.MAP_SOLID).length, 175);
  const floors = { floor_a: 0, floor_b: 0, floor_c: 0, floor_d: 0 };
  const walls = { wall_straight: 0, wall_inside: 0, wall_outside: 0, wall_end: 0 };
  for (let ty = 0; ty < fixture.mapRows; ty++) for (let tx = 0; tx < fixture.mapCols; tx++) {
    floors[roomEnvironment.chooseRoomFloor(fixture.generatorSeed, tx, ty)]++;
    for (const wall of roomEnvironment.chooseRoomBoundaryWalls(fixture, tx, ty)) walls[wall.piece]++;
  }
  assert.deepEqual(floors, { floor_a: 388, floor_b: 368, floor_c: 416, floor_d: 364 });
  assert.deepEqual(walls, { wall_straight: 188, wall_inside: 0, wall_outside: 0, wall_end: 0 });
  assert.deepEqual(Object.fromEntries(["decal_rubble", "decal_root", "prop_barrel"].map((piece) =>
    [piece, fixture.roomDecorations.filter((item) => item.piece === piece).length])),
    { decal_rubble: 4, decal_root: 4, prop_barrel: 4 });
  const stableFaces = roomEnvironment.chooseRoomWallFaces(fixture);
  assert.equal(stableFaces.length, 188);
  assert.equal(new Set(stableFaces.map(({ key }) => key)).size, 188);
  assert.deepEqual(fixture.pieceCounts, { floor_a: 388, floor_b: 368, floor_c: 416, floor_d: 364, wall_straight: 363,
    wall_inside: 0, wall_outside: 0, wall_end: 0, door_frame: 2, door_leaf: 6,
    torch_bracket: 10, decal_rubble: 4, decal_root: 4, prop_barrel: 4 });
  assert.equal(createHash("sha256").update(Buffer.from(fixture.map)).digest("hex"),
    roomStress.ROOM_STRESS_MAP_SHA256);

  const { NullEngine } = await import("@babylonjs/core/Engines/nullEngine.js");
  const { Scene } = await import("@babylonjs/core/scene.js");
  const engine = new NullEngine(); const scene = new Scene(engine);
  const debug = new rendererDebug.RendererDebugRegistry();
  const room = new roomEnvironment.RoomEnvironmentPresentation(scene, debug, await fakeRoomAsset(scene));
  room.acceptSnapshot(fixture);
  // 1536 floors + 175 solid-cell caps + 35 packed modules spanning all 188
  // stable boundary faces. Furniture contributes 27 presentation instances.
  assert.deepEqual(room.counts(), { geometry: 1746, furniture: 22, instances: 1773,
    lights: 9, shadowCasters: 1773, triangles: room.counts().triangles });
  assert.equal(debug.snapshot().draws, 43,
    "four floor treatments, packed facade sources, fixtures, and layered flames remain exact draw owners");
  assert.equal(debug.snapshot().visibility.effects, 24,
    "eight torches each own an outer flame, bright core, and soft halo");
  assert.equal(debug.snapshot().visibility.picking, 1558);
  const before = scene.meshes.filter((mesh) => mesh.name.startsWith("room:") && mesh.sourceMesh);
  room.acceptSnapshot(Object.freeze({ ...fixture, tick: 1 }));
  assert.deepEqual(scene.meshes.filter((mesh) => mesh.name.startsWith("room:") && mesh.sourceMesh), before);
  room.dispose(); scene.dispose(); engine.dispose();
});

test("the_compact_room_review_fixture_is_not_the_performance_stress_fixture", async () => {
  const fixture = roomReview.createCompactRoomReviewFixture();
  const stressFixture = roomStress.createRoomStressFixture();
  assert.deepEqual([fixture.mapCols, fixture.mapRows, fixture.map.length], [16, 10, 160]);
  assert.equal(fixture.map.filter((value) => value === ABI.MAP_SOLID).length, 48);
  assert.equal(fixture.map.filter((value) => value === ABI.MAP_OPEN).length, 14 * 8);
  assert.equal(fixture.units.length, 8);
  assert.deepEqual(fixture.furniture.map(({ kind, state }) => [kind, state]), [
    [ABI.FURNITURE_DOOR, ABI.FURNITURE_DOOR_OPEN],
    [ABI.FURNITURE_DOOR, ABI.FURNITURE_DOOR_SHUT],
    [ABI.FURNITURE_TORCH, ABI.TORCH_FACE_POS_X], [ABI.FURNITURE_TORCH, ABI.TORCH_FACE_POS_Y],
    [ABI.FURNITURE_TORCH, ABI.TORCH_FACE_POS_X], [ABI.FURNITURE_TORCH, ABI.TORCH_FACE_POS_Y],
  ]);
  assert.deepEqual(Object.fromEntries(["decal_rubble", "decal_root", "prop_barrel"].map((piece) =>
    [piece, fixture.roomDecorations.filter((item) => item.piece === piece).length])),
  { decal_rubble: 4, decal_root: 4, prop_barrel: 4 });
  assert.notDeepEqual([fixture.mapCols, fixture.mapRows, fixture.units.length],
    [stressFixture.mapCols, stressFixture.mapRows, stressFixture.units.length]);
  assert.deepEqual([stressFixture.mapCols, stressFixture.mapRows, stressFixture.units.length,
    stressFixture.torchLights], [48, 32, 64, 8]);
  const { NullEngine } = await import("@babylonjs/core/Engines/nullEngine.js");
  const { Scene } = await import("@babylonjs/core/scene.js");
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const priorReviewClear = [scene.clearColor.r, scene.clearColor.g, scene.clearColor.b, scene.clearColor.a];
  const priorReviewProcessing = [scene.imageProcessingConfiguration.exposure,
    scene.imageProcessingConfiguration.contrast];
  const lighting = roomReview.applyAuthoredRoomLighting(scene);
  const debug = new rendererDebug.RendererDebugRegistry();
  const room = new roomEnvironment.RoomEnvironmentPresentation(scene, debug, await fakeRoomAsset(scene));
  room.acceptSnapshot(fixture);
  // 160 floors + 48 solid-cell caps + six packed modules spanning all 42 stable boundary faces.
  // The two framed doors use six plank modules and two shut-leaf straps, so 18
  // semantic furniture rows intentionally occupy 26 presentation instances.
  assert.deepEqual(room.counts(), { geometry: 214, furniture: 18, instances: 237,
    lights: 5, shadowCasters: 237, triangles: room.counts().triangles });
  assert.equal(scene.lights.length, 6, "review fill is separate from the room key and four torches");
  assert.deepEqual([scene.clearColor.r, scene.clearColor.g, scene.clearColor.b, scene.clearColor.a],
    [0.012, 0.016, 0.032, 1]);
  assert.deepEqual([scene.imageProcessingConfiguration.exposure,
    scene.imageProcessingConfiguration.contrast], [1.64, 1.06]);
  const reviewFill = scene.lights.filter((light) => light.name === "authored-room:hemispheric-fill");
  assert.equal(reviewFill.length, 1);
  assert.deepEqual([reviewFill[0].diffuse.r, reviewFill[0].diffuse.g, reviewFill[0].diffuse.b,
    reviewFill[0].groundColor.r, reviewFill[0].groundColor.g, reviewFill[0].groundColor.b,
    reviewFill[0].intensity], [0.50, 0.52, 0.56, 0.035, 0.04, 0.05, 0.48]);
  const canvas = new EventTarget();
  Object.assign(canvas, { clientWidth: 1600, clientHeight: 900, style: {}, setPointerCapture() {},
    releasePointerCapture() {}, hasPointerCapture: () => false });
  const cameraOwner = roomReviewCamera.createRoomReviewCamera(scene, canvas,
    { width: 16, height: 10 }, { initialFixedZoom: 1.6 });
  scene.activeCamera = cameraOwner.camera;
  scene.render();
  assert.ok(Math.abs(cameraOwner.camera.orthoLeft + 14.444444444444445) < 1e-12);
  assert.ok(Math.abs(cameraOwner.camera.orthoRight - 14.444444444444445) < 1e-12);
  assert.deepEqual([cameraOwner.camera.orthoTop, cameraOwner.camera.orthoBottom], [8.125, -8.125]);
  const { Matrix, Vector3 } = await import("@babylonjs/core/Maths/math.vector.js");
  const viewport = cameraOwner.camera.viewport.toGlobal(1600, 900);
  const projected = [[0, 0], [16, 0], [0, 10], [16, 10]].map(([x, z]) =>
    Vector3.Project(new Vector3(x, 0, z), Matrix.IdentityReadOnly, scene.getTransformMatrix(), viewport));
  const spanX = Math.max(...projected.map((point) => point.x)) - Math.min(...projected.map((point) => point.x));
  const spanY = Math.max(...projected.map((point) => point.y)) - Math.min(...projected.map((point) => point.y));
  assert.ok(spanX >= 1600 * 0.6 && spanY >= 900 * 0.6, "compact corners must fill most of the review canvas");
  assert.ok(projected.every((point) => point.x >= 20 && point.x <= 1580 && point.y >= 20 && point.y <= 880),
    "every compact-room corner needs a visible review margin");
  cameraOwner.zoom(500);
  cameraOwner.setFree(true);
  cameraOwner.setFree(false);
  assert.deepEqual([cameraOwner.camera.orthoTop, cameraOwner.camera.orthoBottom], [8.125, -8.125]);
  cameraOwner.dispose();
  lighting.dispose(); room.dispose();
  assert.equal(scene.lights.length, 0);
  assert.deepEqual([scene.clearColor.r, scene.clearColor.g, scene.clearColor.b, scene.clearColor.a], priorReviewClear);
  assert.deepEqual([scene.imageProcessingConfiguration.exposure,
    scene.imageProcessingConfiguration.contrast], priorReviewProcessing);
  scene.dispose(); engine.dispose();
});

test("the_room_review_camera_is_bounded_resettable_and_dispose_owned", async () => {
  const { NullEngine } = await import("@babylonjs/core/Engines/nullEngine.js");
  const { Scene } = await import("@babylonjs/core/scene.js");
  const events = new Map();
  const canvas = { clientWidth: 1920, clientHeight: 1080,
    addEventListener(type, listener) { events.set(type, listener); },
    removeEventListener(type) { events.delete(type); }, focus() {}, tabIndex: 0,
    ownerDocument: { addEventListener() {}, removeEventListener() {}, defaultView: globalThis } };
  const engine = new NullEngine();
  engine.getInputElement = () => canvas;
  const scene = new Scene(engine);
  const owner = roomReviewCamera.createRoomReviewCamera(scene, canvas, { width: 48, height: 32 });
  const { Camera } = await import("@babylonjs/core/Cameras/camera.js");
  assert.equal(owner.camera.mode, Camera.ORTHOGRAPHIC_CAMERA);
  const centred = owner.camera.position.clone();
  owner.pan(120, 40);
  assert.notDeepEqual(owner.camera.position.asArray(), centred.asArray());
  const oldWidth = owner.camera.orthoRight - owner.camera.orthoLeft;
  owner.zoom(-300);
  assert.ok(owner.camera.orthoRight - owner.camera.orthoLeft < oldWidth);
  owner.setFree(true);
  assert.equal(owner.free, true);
  owner.camera.target.set(-20, 9, 90); owner.camera.radius = 999;
  owner.camera.getViewMatrix(true);
  assert.deepEqual([owner.camera.target.x, owner.camera.target.y, owner.camera.target.z], [0, 0, 32]);
  assert.equal(owner.camera.radius, 96);
  assert.ok(events.size > 0);
  owner.resetFixed(); assert.equal(owner.free, false);
  owner.camera.getViewMatrix(true);
  assert.ok(Math.abs(owner.camera.getTarget().x - 24) < 1e-5);
  assert.ok(Math.abs(owner.camera.getTarget().z - 16) < 1e-5);
  assert.equal(owner.camera.mode, Camera.ORTHOGRAPHIC_CAMERA);
  assert.equal(events.size, 0);
  owner.zoom(-100_000);
  assert.equal(rendererCamera.MAX_CAMERA_ZOOM, 12);
  assert.ok(Math.abs(owner.camera.orthoTop - (48 + 32) / 24) < 1e-12,
    "maximum fixed zoom must retain a bounded close-action view");
  owner.dispose(); owner.dispose();
  assert.equal(scene.cameras.length, 0);
  scene.dispose(); engine.dispose();
});

test("world_camera_follows_inside_the_dead_zone_and_snaps_after_reset", async () => {
  const { NullEngine } = await import("@babylonjs/core/Engines/nullEngine.js");
  const { Scene } = await import("@babylonjs/core/scene.js");
  const canvas = { clientWidth: 1920, clientHeight: 1080,
    addEventListener() {}, removeEventListener() {}, focus() {}, tabIndex: 0,
    ownerDocument: { addEventListener() {}, removeEventListener() {}, defaultView: globalThis } };
  const engine = new NullEngine();
  engine.getInputElement = () => canvas;
  const scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  // Both new constants are pinned from both sides: the exact value, and the
  // behaviour at the zone edge below.
  assert.equal(roomReviewCamera.GAME_INITIAL_FIXED_ZOOM, 11.5);
  assert.ok(roomReviewCamera.GAME_INITIAL_FIXED_ZOOM > rendererCamera.MIN_CAMERA_ZOOM
    && roomReviewCamera.GAME_INITIAL_FIXED_ZOOM < rendererCamera.MAX_CAMERA_ZOOM,
  "the starting zoom must leave wheel room in both directions");
  assert.equal(roomReviewCamera.FOLLOW_DEAD_ZONE_FRACTION, 0.08);
  assert.equal(roomReviewCamera.FOLLOW_DAMPING, 0.22);
  assert.ok(roomReviewCamera.FOLLOW_DEAD_ZONE_FRACTION > 0
    && roomReviewCamera.FOLLOW_DEAD_ZONE_FRACTION < 1);
  const owner = roomReviewCamera.createRoomReviewCamera(scene, canvas, { width: 68, height: 45 },
    { initialFixedZoom: roomReviewCamera.GAME_INITIAL_FIXED_ZOOM, followHero: true });
  // The playable dungeon is 68 x 45 tiles: at the starting zoom the vertical
  // view is (68 + 45) / 11.5 = 9.8 tiles rather than the 113 of zoom one.
  assert.ok(Math.abs(owner.camera.orthoTop - (68 + 45) / (2 * 11.5)) < 1e-12);
  const target = () => { owner.camera.getViewMatrix(true); return owner.camera.getTarget().clone(); };
  const centred = target();
  assert.ok(Math.abs(centred.x - 34) < 1e-5 && Math.abs(centred.z - 22.5) < 1e-5);
  // The dead zone, from both sides. The vertical allowance is
  // orthoTop * fraction = 4.913 * 0.08 = 0.393 world units along the screen-up
  // ground diagonal (1, 1)/sqrt(2): a quarter-tile offset stays free, while
  // two tiles must start the damped pan.
  owner.follow(34, 22.5);
  assert.deepEqual(target().asArray(), centred.asArray(), "a centred hero moves nothing");
  owner.follow(34.25, 22.75);
  assert.deepEqual(target().asArray(), centred.asArray(), "inside the dead zone nothing moves");
  owner.follow(36, 24.5);
  const panned = target();
  assert.ok(panned.x > centred.x && panned.z > centred.z, "the camera pans toward the hero");
  assert.ok(Math.hypot(panned.x - centred.x, panned.z - centred.z) < Math.hypot(2, 2),
    "the camera stops at the zone edge rather than snapping onto the hero");
  owner.follow(36, 24.5);
  assert.notDeepEqual(target().asArray(), panned.asArray(), "damped tracking eases toward its dead-zone edge");
  // A drag suspends the follow until the hero itself leaves a zone-sized
  // region around where it stood when the drag happened.
  owner.pan(120, 40);
  const dragged = target();
  assert.notDeepEqual(dragged.asArray(), panned.asArray());
  owner.follow(50, 30);
  assert.deepEqual(target().asArray(), dragged.asArray(), "a drag wins over the follow");
  owner.follow(50.1, 30);
  assert.deepEqual(target().asArray(), dragged.asArray(), "a hero shuffling in place does not resume");
  owner.follow(56, 30);
  assert.notDeepEqual(target().asArray(), dragged.asArray(), "a hero that walks away resumes the follow");
  // Reset restores the committed pose and forgets the suspension anchor.
  owner.resetFixed();
  const reset = target();
  assert.ok(Math.abs(reset.x - 34) < 1e-5 && Math.abs(reset.z - 22.5) < 1e-5);
  owner.follow(40, 28);
  assert.notDeepEqual(target().asArray(), reset.asArray(), "reset must not leave a stale anchor");
  owner.dispose();
  assert.equal(scene.cameras.length, 0);
  scene.dispose(); engine.dispose();
});

test("the_first_game_follow_sample_centres_the_disclosed_room_on_its_hero", async () => {
  const { NullEngine } = await import("@babylonjs/core/Engines/nullEngine.js");
  const { Scene } = await import("@babylonjs/core/scene.js");
  const canvas = { clientWidth: 1920, clientHeight: 1080,
    addEventListener() {}, removeEventListener() {}, focus() {}, tabIndex: 0,
    ownerDocument: { addEventListener() {}, removeEventListener() {}, defaultView: globalThis } };
  const engine = new NullEngine(); engine.getInputElement = () => canvas;
  const scene = new Scene(engine); scene.useRightHandedSystem = true;
  const owner = roomReviewCamera.createRoomReviewCamera(scene, canvas, { width: 68, height: 45 },
    { initialFixedZoom: roomReviewCamera.GAME_INITIAL_FIXED_ZOOM, followHero: true });
  owner.follow(12, 9);
  owner.camera.getViewMatrix(true);
  assert.ok(Math.abs(owner.camera.getTarget().x - 12) < 1e-5);
  assert.ok(Math.abs(owner.camera.getTarget().z - 9) < 1e-5);
  owner.follow(12.25, 9.25);
  owner.camera.getViewMatrix(true);
  assert.ok(Math.abs(owner.camera.getTarget().x - 12) < 1e-5 &&
    Math.abs(owner.camera.getTarget().z - 9) < 1e-5,
  "subsequent movement inside the dead zone must not cause camera creep");
  owner.dispose(); scene.dispose(); engine.dispose();
});

test("a_review_camera_without_follow_exposes_none_and_free_mode_suspends_it", async () => {
  const { NullEngine } = await import("@babylonjs/core/Engines/nullEngine.js");
  const { Scene } = await import("@babylonjs/core/scene.js");
  const canvas = { clientWidth: 1920, clientHeight: 1080,
    addEventListener() {}, removeEventListener() {}, focus() {}, tabIndex: 0,
    ownerDocument: { addEventListener() {}, removeEventListener() {}, defaultView: globalThis } };
  const engine = new NullEngine();
  engine.getInputElement = () => canvas;
  const scene = new Scene(engine);
  // Stress and compact-review fixtures must not drift under a follow: their
  // captures are comparable only because the camera never moves on its own.
  const fixture = roomReviewCamera.createRoomReviewCamera(scene, canvas, { width: 48, height: 32 });
  assert.equal(fixture.follow, undefined);
  fixture.dispose();
  const owner = roomReviewCamera.createRoomReviewCamera(scene, canvas, { width: 48, height: 32 },
    { followHero: true });
  owner.setFree(true);
  const orbitTarget = [owner.camera.target.x, owner.camera.target.y, owner.camera.target.z];
  owner.follow(2, 2);
  assert.deepEqual([owner.camera.target.x, owner.camera.target.y, owner.camera.target.z],
    orbitTarget, "the free orbit owns the view; the follow is inert under it");
  owner.dispose();
  scene.dispose(); engine.dispose();
});

test("room_constructor_failure_releases_every_partial_remembered_source", async () => {
  const { NullEngine } = await import("@babylonjs/core/Engines/nullEngine.js");
  const { Scene } = await import("@babylonjs/core/scene.js");
  const engine = new NullEngine(); const scene = new Scene(engine);
  const asset = await fakeRoomAsset(scene);
  asset.pieces.get("wall_inside").clone = () => null;
  assert.throws(() => new roomEnvironment.RoomEnvironmentPresentation(
    scene, new rendererDebug.RendererDebugRegistry(), asset), /cannot clone remembered wall_inside/);
  assert.equal(scene.meshes.some((mesh) => mesh.name.startsWith("room:source:")), false);
  assert.equal(scene.materials.some((material) => material.name === "room:stone_remembered"), false);
  assert.equal(scene.lights.length, 0);
  scene.dispose(); engine.dispose();
});

test("snapshot_local_transients_never_persist_across_fog_or_ticks", async () => {
  const { NullEngine } = await import("@babylonjs/core/Engines/nullEngine.js");
  const { Scene } = await import("@babylonjs/core/scene.js");
  const engine = new NullEngine({ renderWidth: 64, renderHeight: 64 });
  const scene = new Scene(engine);
  const debug = new rendererDebug.RendererDebugRegistry();
  const transients = new rendererTransients.TransientPresentation(scene, debug);
  const rows = (tick, x, actorIndex = 9) => snapshot({
    tick,
    shots: Object.freeze([Object.freeze({ key: `1:${tick}:shot:0`, x, y: 0.5, heading: 0, faction: 1 })]),
    events: Object.freeze([Object.freeze({ key: `1:${tick}:event:0`, kind: ABI.EVENT_DAMAGE,
      x, y: 0.5, amount: 1, actorIndex, otherIndex: 10, aux0: 0, aux1: 0 })]),
  });
  transients.acceptSnapshot(rows(7, 2.5, 9));
  assert.deepEqual(transients.keys(), ["1:7:shot:0", "1:7:event:0"]);
  assert.deepEqual(transients.counts(), {
    shots: 1, events: 1, shadows: 0, labels: 0, effects: 1, audio: 0, picking: 0, debug: 2,
  });
  assert.ok(scene.getMeshByName("shot:1:7:shot:0"));
  assert.ok(scene.getMeshByName("event:1:7:event:0"));

  transients.acceptSnapshot(rows(8, 2.5, 9));
  assert.deepEqual(transients.keys(), ["1:8:shot:0", "1:8:event:0"]);
  assert.equal(transients.keys().some((key) => key.includes(":7:")), false);
  transients.acceptSnapshot(rows(9, 2.5, 1234));
  assert.deepEqual(transients.keys(), ["1:9:shot:0", "1:9:event:0"]);

  for (const absent of [rows(10, 1.5), rows(11, 0.5), snapshot({ tick: 12 })]) {
    transients.acceptSnapshot(absent);
    assert.deepEqual(transients.keys(), []);
    assert.deepEqual(transients.counts(), {
      shots: 0, events: 0, shadows: 0, labels: 0, effects: 0, audio: 0, picking: 0, debug: 0,
    });
  }
  transients.acceptSnapshot(rows(13, 2.5));
  transients.reset();
  assert.deepEqual(transients.keys(), []);
  transients.dispose();
  assert.deepEqual(debug.snapshot(), {
    meshes: 0, instances: 0, draws: 0, triangles: 0, lights: 0, shadowCasters: 0,
    visibility: { geometry: 0, units: 0, shots: 0, events: 0, furniture: 0,
      effects: 0, audio: 0, picking: 0, debug: 0 },
  });
  scene.dispose();
  engine.dispose();
});

test("bootstrap_copies_the_lease_before_return_and_clears_on_reset_epoch_and_terminal", async () => {
  const calls = [];
  let rendererTerminal = null;
  let latestValue = null;
  const renderer = {
    acceptSnapshot(value, receivedAt) { calls.push(["accept", value.value, receivedAt]); latestValue = value; },
    clear() { calls.push(["clear"]); latestValue = null; },
    dispose() { calls.push(["renderer-dispose"]); },
  };
  const client = {
    onSnapshot: null, onDiagnostics: null, onError: null, disposed: 0,
    async init(seed) {
      assert.equal(typeof this.onSnapshot, "function");
      calls.push(["init", seed]);
      const lease = { value: 7 };
      this.onSnapshot({ lease });
      lease.value = 99;
    },
    async reset(seed) { calls.push(["client-reset", seed]); },
    async setPaused(paused) { calls.push(["paused", paused]); },
    async command(command) { calls.push(["command", command.kind]); },
    diagnostics() { return { resetting: false, terminal: false }; },
    dispose() { this.disposed++; calls.push(["client-dispose"]); },
  };
  const app = await bootstrap.bootstrapV2({
    client, seed: 4, now: () => 123,
    createRenderer: async (terminal) => { rendererTerminal = terminal; return renderer; },
    copySnapshot: ({ lease }) => { calls.push(["copy", lease.value]); return Object.freeze({ value: lease.value }); },
  });
  assert.deepEqual(calls.slice(0, 3), [["init", 4], ["copy", 7], ["accept", 7, 123]]);
  assert.equal(latestValue.value, 7);
  await app.reset(9, true);
  assert.deepEqual(calls.slice(3, 5), [["clear"], ["client-reset", 9]]);
  client.onSnapshot({ lease: { value: 8 } });
  assert.deepEqual(calls.slice(5, 7), [["copy", 8], ["accept", 8, 123]]);
  assert.equal(app.latestSnapshot().value, 8);
  let inputDisposals = 0;
  app.ownInput(() => { inputDisposals++; calls.push(["input-dispose"]); });
  rendererTerminal(new Error("lost"));
  rendererTerminal(new Error("lost again"));
  assert.equal(inputDisposals, 1);
  assert.equal(client.disposed, 1);
  assert.equal(calls.filter(([kind]) => kind === "renderer-dispose").length, 1);

  let failedInit = 0;
  const failedClient = { ...client, onSnapshot: null, onDiagnostics: null, onError: null, disposed: 0,
    async init() { failedInit++; } };
  await assert.rejects(() => bootstrap.bootstrapV2({
    client: failedClient, seed: 1, createRenderer: async () => { throw new Error("backend failed"); },
  }), /backend failed/);
  assert.equal(failedInit, 0);
  assert.equal(failedClient.disposed, 1);
});

test("bootstrap_disposes_initialized_client_and_renderer_when_input_attachment_fails", async () => {
  let initialized = 0;
  let rendererDisposals = 0;
  let clientDisposals = 0;
  const renderer = {
    acceptSnapshot() {}, clear() {}, dispose() { rendererDisposals++; },
  };
  const client = {
    onSnapshot: null, onDiagnostics: null, onError: null,
    async init() { initialized++; }, async reset() {}, async setPaused() {}, async command() {},
    diagnostics: () => ({ resetting: false, terminal: false }),
    dispose: () => { clientDisposals++; },
  };
  await assert.rejects(() => bootstrap.bootstrapV2({
    client, seed: 1,
    createRenderer: async () => renderer,
    attachInput: () => { throw new Error("input failed"); },
  }), /input failed/);
  assert.deepEqual([initialized, rendererDisposals, clientDisposals], [1, 1, 1]);
});

test("greybox_input_targets_only_known_floor_and_rounds_world_milli_once", () => {
  const world = snapshot();
  assert.deepEqual(greyboxInput.pointToGotoCommand(world, { x: 1.2345, z: 0.5004 }),
    { kind: "goto", xMilli: 1235, yMilli: 500 });
  assert.equal(greyboxInput.pointToGotoCommand(world, { x: 0.5, z: 0.5 }), null);
  assert.equal(greyboxInput.pointToGotoCommand(world, { x: 2.5, z: 0.5 }), null);
  assert.equal(greyboxInput.pointToGotoCommand(world, { x: Number.NaN, z: 0.5 }), null);
  assert.equal(greyboxInput.pointToGotoCommand(world, { x: 3_000_000, z: 0.5 }), null);
});

test("greybox_input_ignores_reset_terminal_and_disposes_pointer_wheel_and_escape_handlers", async () => {
  const oldWindow = globalThis.window;
  const fakeWindow = new EventTarget();
  globalThis.window = fakeWindow;
  class FakeCanvas extends EventTarget {
    setPointerCapture() {}
    hasPointerCapture() { return false; }
    releasePointerCapture() {}
  }
  const canvas = new FakeCanvas();
  const commands = [];
  const errors = [];
  let blocked = false;
  let projectionFails = false;
  const input = new greyboxInput.GreyboxInput({
    canvas, snapshot: () => snapshot(), blocked: () => blocked,
    projectGround: () => {
      if (projectionFails) throw new Error("projection failed");
      return { x: 1.25, z: 0.5 };
    },
    submit: async (command) => { commands.push(command); },
    onError: (error) => errors.push(error.message),
  });
  const pointer = new Event("pointerdown", { cancelable: true });
  Object.assign(pointer, { button: 0, clientX: 10, clientY: 10, pointerId: 1 });
  canvas.dispatchEvent(pointer);
  const pointerUp = new Event("pointerup", { cancelable: true });
  Object.assign(pointerUp, { button: 0, clientX: 10, clientY: 10, pointerId: 1 });
  canvas.dispatchEvent(pointerUp);
  await Promise.resolve();
  const escape = new Event("keydown", { cancelable: true });
  Object.defineProperty(escape, "key", { value: "Escape" });
  fakeWindow.dispatchEvent(escape);
  await Promise.resolve();
  assert.deepEqual(commands, [
    { kind: "goto", xMilli: 1250, yMilli: 500 },
    { kind: "setInput", moveXMilli: 0, moveYMilli: 0, turnMilli: 0,
      aimRaw: 0, reachMilli: 0, slot: 0, strike: 0 },
    { kind: "withdraw" },
  ]);
  projectionFails = true;
  canvas.dispatchEvent(pointer);
  canvas.dispatchEvent(pointerUp);
  assert.deepEqual(errors, ["projection failed"]);
  projectionFails = false;
  blocked = true;
  canvas.dispatchEvent(pointer);
  canvas.dispatchEvent(pointerUp);
  fakeWindow.dispatchEvent(escape);
  await Promise.resolve();
  assert.equal(commands.length, 3);
  input.dispose();
  blocked = false;
  canvas.dispatchEvent(pointer);
  canvas.dispatchEvent(pointerUp);
  fakeWindow.dispatchEvent(escape);
  await Promise.resolve();
  assert.equal(commands.length, 3);
  globalThis.window = oldWindow;
});

test("held_qe_are_persistent_tank_turn_input_and_release_sends_zero", async () => {
  const oldWindow = globalThis.window;
  const fakeWindow = new EventTarget();
  globalThis.window = fakeWindow;
  class FakeCanvas extends EventTarget {
    setPointerCapture() {}
    hasPointerCapture() { return false; }
    releasePointerCapture() {}
  }
  const commands = [];
  const input = new greyboxInput.GreyboxInput({
    canvas: new FakeCanvas(), snapshot: () => snapshot(), blocked: () => false,
    movementEnabled: () => true, projectGround: () => null,
    submit: async (command) => { commands.push(command); },
  });
  const key = (type, value) => {
    const event = new Event(type, { cancelable: true });
    Object.defineProperty(event, "key", { value });
    fakeWindow.dispatchEvent(event);
  };
  key("keydown", "q");
  key("keydown", "w");
  key("keyup", "q");
  key("keyup", "w");
  await Promise.resolve();
  assert.deepEqual(commands.map((command) => command.turnMilli), [-1000, -1000, 0, 0]);
  assert.notEqual(commands[1].moveXMilli, 0, "forward remains available while turning");
  assert.deepEqual(greyboxInput.tankMovement(new Set(["w"])), { x: 1, y: 0 });
  assert.deepEqual(greyboxInput.tankMovement(new Set(["d"])), { x: 0, y: 1 });
  input.releaseMovement();
  await Promise.resolve();
  assert.deepEqual(commands.at(-1), { kind: "setInput", moveXMilli: 0, moveYMilli: 0,
    turnMilli: 0, aimRaw: 0, reachMilli: 0, slot: 0, strike: 0 });
  input.dispose();
  globalThis.window = oldWindow;
});

test("primary_pointer_click_issues_goto_while_primary_drag_moves_the_live_camera", async () => {
  const oldWindow = globalThis.window;
  globalThis.window = new EventTarget();
  const { NullEngine } = await import("@babylonjs/core/Engines/nullEngine.js");
  const { Scene } = await import("@babylonjs/core/scene.js");
  class FakeCanvas extends EventTarget {
    width = 1000;
    height = 500;
    clientWidth = 500;
    clientHeight = 250;
    #captured = new Set();
    setPointerCapture(pointerId) { this.#captured.add(pointerId); }
    hasPointerCapture(pointerId) { return this.#captured.has(pointerId); }
    releasePointerCapture(pointerId) { this.#captured.delete(pointerId); }
    getBoundingClientRect() {
      return { left: 10, top: 20, width: 500, height: 250, right: 510, bottom: 270 };
    }
  }
  const canvas = new FakeCanvas();
  const engine = new NullEngine({ renderWidth: 500, renderHeight: 250 });
  const scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  const debug = new rendererDebug.RendererDebugRegistry();
  const passive = { acceptSnapshot() {}, setPresentationMode() {}, reset() {}, dispose() {} };
  const camera = rendererCamera.createFixedIsometricCamera(scene, { width: 10, height: 10 }, 2);
  scene.activeCamera = camera;
  const handle = {
    engine, canvas, terminal: false,
    diagnostics: { requested: "webgl2", selected: "webgl2" },
    dispose: () => engine.dispose(),
  };
  const renderer = new greyboxRenderer.GreyboxRenderer(
    handle, scene, debug, passive, passive, passive, camera, () => 0,
  );
  renderer.stop();
  const world = snapshot({
    mapCols: 10, mapRows: 10,
    map: Object.freeze(new Array(100).fill(ABI.MAP_OPEN)),
    vis: Object.freeze(new Array(100).fill(2)),
  });
  renderer.acceptSnapshot(world, 0);
  const commands = [];
  const input = new greyboxInput.GreyboxInput({
    canvas, snapshot: () => world, blocked: () => false,
    projectGround: (event) => greyboxInput.createBabylonGroundProjector(
      scene, renderer.camera, canvas,
    )(event),
    submit: async (command) => { commands.push(command); },
    pan: (dx, dy) => renderer.pan(dx, dy),
  });
  const pointer = (type, x, y, pointerId = 1) => {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, { button: 0, clientX: x, clientY: y, pointerId });
    return event;
  };

  canvas.dispatchEvent(pointer("pointerdown", 260, 145));
  canvas.dispatchEvent(pointer("pointerup", 260, 145));
  await Promise.resolve();
  assert.deepEqual(commands, [{ kind: "goto", xMilli: 5000, yMilli: 5000 }]);

  const before = renderer.camera.getTarget().clone();
  const beforePosition = renderer.camera.position.clone();
  canvas.dispatchEvent(pointer("pointerdown", 260, 145, 2));
  const screenRight = renderer.camera.getDirection((await import(
    "@babylonjs/core/Maths/math.vector.js"
  )).Vector3.Right());
  canvas.dispatchEvent(pointer("pointermove", 280, 145, 2));
  canvas.dispatchEvent(pointer("pointerup", 280, 145, 2));
  renderer.camera.getViewMatrix(true);
  const after = renderer.camera.getTarget();
  const afterPosition = renderer.camera.position;
  assert.notDeepEqual([after.x, after.z], [before.x, before.z]);
  const screenRightMotion = (after.x - before.x) * screenRight.x
    + (after.z - before.z) * screenRight.z;
  assert.ok(screenRightMotion < 0,
    `dragging right must move the camera target screen-left; got ${JSON.stringify({ before, after, screenRight, screenRightMotion })}`);
  assert.ok((afterPosition.x - beforePosition.x) * screenRight.x
    + (afterPosition.z - beforePosition.z) * screenRight.z < 0);
  assert.equal(commands.length, 1, "a primary drag must not also issue a goto command");

  input.dispose();
  renderer.dispose();
  globalThis.window = oldWindow;
});

test("default_aim_tracking_does_not_steal_mouse_goto_but_direct_action_does", async () => {
  const oldWindow = globalThis.window;
  globalThis.window = new EventTarget();
  class FakeCanvas extends EventTarget {
    setPointerCapture() {}
    hasPointerCapture() { return false; }
    releasePointerCapture() {}
  }
  const world = snapshot();
  const pointer = (type, id) => {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, { button: 0, clientX: 10, clientY: 10, pointerId: id });
    return event;
  };
  for (const [action, expected] of [[false, "goto"], [true, "setInput"]]) {
    const canvas = new FakeCanvas();
    const commands = [];
    const input = new greyboxInput.GreyboxInput({
      canvas, snapshot: () => world, blocked: () => false,
      aimEnabled: () => true, actionEnabled: () => action,
      projectGround: () => ({ x: 1.25, z: 0.5 }),
      submit: async (command) => { commands.push(command); },
    });
    canvas.dispatchEvent(pointer("pointerdown", action ? 2 : 1));
    canvas.dispatchEvent(pointer("pointerup", action ? 2 : 1));
    await Promise.resolve();
    assert.equal(commands[0]?.kind, expected);
    if (action) assert.equal(commands.some((command) => command.strike === 1), true);
    input.dispose();
  }
  globalThis.window = oldWindow;
});

test("the_render_loop_feeds_the_review_camera_the_hero_and_only_the_hero", async () => {
  const { NullEngine } = await import("@babylonjs/core/Engines/nullEngine.js");
  const { Scene } = await import("@babylonjs/core/scene.js");
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const debug = new rendererDebug.RendererDebugRegistry();
  const passive = { acceptSnapshot() {}, reset() {}, dispose() {} };
  const initial = rendererCamera.createFixedIsometricCamera(scene, { width: 1, height: 1 }, 1);
  scene.activeCamera = initial;
  const review = rendererCamera.createFixedIsometricCamera(scene, { width: 3, height: 1 }, 1);
  const followCalls = [];
  const owner = {
    camera: review, free: false, setFree() {}, dispose() { review.dispose(); },
    follow(x, z) { followCalls.push([x, z]); },
  };
  const handle = {
    engine, canvas: { clientWidth: 500, clientHeight: 250 }, terminal: false,
    diagnostics: { requested: "webgl2", selected: "webgl2" },
    dispose: () => engine.dispose(),
  };
  const renderer = new greyboxRenderer.GreyboxRenderer(
    handle, scene, debug, passive, passive, passive, initial, () => 0, () => owner,
  );
  renderer.acceptSnapshot(snapshot({
    map: Object.freeze([ABI.MAP_OPEN, ABI.MAP_OPEN, ABI.MAP_OPEN]),
    vis: Object.freeze([2, 2, 2]),
    units: Object.freeze([unit({ key: "2:1", index: 2, faction: 1, x: 0.5, y: 0.75 }),
      unit({ key: "1:1", index: 1, faction: 0, x: 2.25, y: 0.5 })]),
  }), 0);
  // The render loop runs on the engine's own frame scheduling; wait for it to
  // have sampled at least one frame rather than reaching into a private method.
  const deadline = Date.now() + 2_000;
  while (followCalls.length === 0 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  renderer.stop();
  assert.ok(followCalls.length > 0, "the render loop never fed the review camera");
  // The faction-0 unit is the hero AGENTS.md guarantees exactly one of; the
  // monster's position must never reach the camera.
  assert.deepEqual(followCalls[0], [2.25, 0.5]);
  assert.ok(followCalls.every(([x, z]) => x === 2.25 && z === 0.5));
  renderer.dispose();
});

test("representative_room_readiness_waits_for_a_completed_authored_frame_and_times_out", async () => {
  const { NullEngine } = await import("@babylonjs/core/Engines/nullEngine.js");
  const { Scene } = await import("@babylonjs/core/scene.js");
  const engine = new NullEngine();
  const scene = new Scene(engine);
  scene.getActiveIndices = () => 3;
  const debug = new rendererDebug.RendererDebugRegistry();
  debug.replaceOwnerCounts("room-environment", { visibility: { geometry: 1 } });
  const passive = { acceptSnapshot() {}, reset() {}, dispose() {}, authoredFrameReady: () => true };
  const camera = rendererCamera.createFixedIsometricCamera(scene, { width: 1, height: 1 }, 1);
  const handle = { engine, canvas: { clientWidth: 1, clientHeight: 1 }, terminal: false,
    diagnostics: { requested: "webgl2", selected: "webgl2" }, dispose: () => engine.dispose() };
  const renderer = new greyboxRenderer.GreyboxRenderer(
    handle, scene, debug, passive, passive, passive, camera, () => 0,
  );
  renderer.stop();
  let ready = false;
  const waiting = renderer.awaitAuthoredFrame(1000).then(() => { ready = true; });
  await Promise.resolve();
  assert.equal(ready, false);
  scene.onAfterRenderObservable.notifyObservers(scene);
  await waiting;
  assert.equal(ready, true);
  await assert.rejects(renderer.awaitAuthoredFrame(1), /did not complete/);
  renderer.dispose();
});

test("free_mode_refuses_simulation_commands_and_restores_follow_on_exit", async () => {
  const entrySource = fs.readFileSync(path.join(ROOT, "client", "src", "v2.ts"), "utf8");
  assert.match(entrySource, /const requireSimulationInteraction = \(\)[\s\S]*roomReviewInteractionBlocked[\s\S]*const submit = async[\s\S]*requireSimulationInteraction\(\)\.command\(command\)/);
  assert.match(entrySource, /setControlMask[\s\S]*submit\(\{ kind: "setControl"/);
  assert.match(entrySource, /blocked: \(\) => syntheticMode \|\| roomReviewInteractionBlocked\(gpu\)/);
  const oldWindow = globalThis.window;
  globalThis.window = new EventTarget();
  const { NullEngine } = await import("@babylonjs/core/Engines/nullEngine.js");
  const { Scene } = await import("@babylonjs/core/scene.js");
  class ReviewCanvas extends EventTarget {
    width = 200; height = 100; clientWidth = 200; clientHeight = 100;
    captured = new Set();
    setPointerCapture(id) { this.captured.add(id); }
    hasPointerCapture(id) { return this.captured.has(id); }
    releasePointerCapture(id) { this.captured.delete(id); }
  }
  const canvas = new ReviewCanvas();
  const engine = new NullEngine({ renderWidth: 200, renderHeight: 100 });
  const scene = new Scene(engine);
  const debug = new rendererDebug.RendererDebugRegistry();
  const passive = { acceptSnapshot() {}, setPresentationMode() {}, reset() {}, dispose() {} };
  const initialCamera = rendererCamera.createFixedIsometricCamera(scene, { width: 2, height: 1 }, 2);
  const handle = { engine, canvas, terminal: false,
    diagnostics: { requested: "webgl2", selected: "webgl2" }, dispose: () => engine.dispose() };
  const renderer = new greyboxRenderer.GreyboxRenderer(
    handle, scene, debug, passive, passive, passive, initialCamera, () => 0,
    (ownerScene, _canvas, bounds) => {
      let free = false;
      const camera = rendererCamera.createFixedIsometricCamera(ownerScene, bounds, 2);
      return { camera, get free() { return free; }, setFree(value) { free = value; }, dispose() { camera.dispose(); } };
    }, true,
  );
  renderer.stop();
  assert.equal(renderer.reviewCameraFree, true, "the initial free query must block before the first snapshot");
  const world = snapshot({ mapCols: 2, mapRows: 1, map: Object.freeze([ABI.MAP_OPEN, ABI.MAP_OPEN]),
    vis: Object.freeze([2, 2]) });
  const commands = [];
  let pans = 0;
  const blocked = () => greyboxRenderer.roomReviewInteractionBlocked(true, renderer);
  const input = new greyboxInput.GreyboxInput({ canvas, snapshot: () => world, blocked,
    projectGround: () => ({ x: 0.5, z: 0.5 }),
    submit: async (command) => { commands.push(["canvas", command]); }, pan: () => { pans++; } });
  const pointer = (type, x, y, id = 1) => {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, { button: 0, clientX: x, clientY: y, pointerId: id });
    return event;
  };
  const canvasClick = (id) => {
    canvas.dispatchEvent(pointer("pointerdown", 10, 10, id));
    canvas.dispatchEvent(pointer("pointerup", 10, 10, id));
  };
  const canvasDrag = (id) => {
    canvas.dispatchEvent(pointer("pointerdown", 10, 10, id));
    canvas.dispatchEvent(pointer("pointermove", 30, 10, id));
    canvas.dispatchEvent(pointer("pointerup", 30, 10, id));
  };
  const toolbar = (kind) => greyboxRenderer.submitWithRoomReviewGuard(true, renderer, async () => {
    commands.push(["toolbar", { kind }]);
  });

  canvasClick(1); canvasDrag(2);
  await assert.rejects(toolbar("withdraw"), /free review camera/);
  assert.deepEqual(commands, []); assert.equal(pans, 0);

  renderer.acceptSnapshot(world, 0);
  assert.equal(renderer.reviewCameraFree, true);
  canvasClick(3);
  await assert.rejects(toolbar("withdraw"), /free review camera/);
  assert.deepEqual(commands, []);

  renderer.setReviewCameraFree(false);
  canvasClick(4);
  await toolbar("withdraw");
  await Promise.resolve();
  assert.deepEqual(commands.map(([source, command]) => [source, command.kind]),
    [["canvas", "goto"], ["toolbar", "withdraw"]]);

  renderer.setReviewCameraFree(true);
  canvasClick(5); canvasDrag(6);
  await assert.rejects(toolbar("withdraw"), /free review camera/);
  assert.equal(commands.length, 2); assert.equal(pans, 0);
  input.dispose(); renderer.dispose(); globalThis.window = oldWindow;
});

test("free_mode_blocks_simulation_on_the_procedural_route_too", async () => {
  const state = { reviewCameraFree: false, presentationMode: "free" };
  assert.equal(greyboxRenderer.roomReviewInteractionBlocked(false, state), true);
  await assert.rejects(
    greyboxRenderer.submitWithRoomReviewGuard(false, state, async () => "sent"),
    /free review camera/,
  );
  state.presentationMode = "world";
  assert.equal(await greyboxRenderer.submitWithRoomReviewGuard(
    false, state, async () => "sent",
  ), "sent");
});

test("greybox_input_keeps_one_pointer_owner_and_recovers_after_throwing_host_callbacks", async () => {
  const oldWindow = globalThis.window;
  globalThis.window = new EventTarget();
  class CapturingCanvas extends EventTarget {
    captured = new Set();
    captureCalls = [];
    releaseCalls = [];
    throwCapture = false;
    setPointerCapture(pointerId) {
      this.captureCalls.push(pointerId);
      if (this.throwCapture) throw new Error("capture failed");
      this.captured.add(pointerId);
    }
    hasPointerCapture(pointerId) { return this.captured.has(pointerId); }
    releasePointerCapture(pointerId) {
      this.releaseCalls.push(pointerId);
      this.captured.delete(pointerId);
    }
  }
  const canvas = new CapturingCanvas();
  const errors = [];
  const commands = [];
  const pans = [];
  const zooms = [];
  let panThrows = true;
  let blockedThrows = false;
  let zoomThrows = true;
  const input = new greyboxInput.GreyboxInput({
    canvas, snapshot: () => snapshot(),
    blocked: () => {
      if (blockedThrows) {
        blockedThrows = false;
        throw new Error("blocked failed");
      }
      return false;
    },
    projectGround: () => ({ x: 1.25, z: 0.5 }),
    submit: async (command) => { commands.push(command); },
    pan: (dx, dy) => {
      if (panThrows) {
        panThrows = false;
        throw new Error("pan failed");
      }
      pans.push([dx, dy]);
    },
    zoom: (delta) => {
      if (zoomThrows) {
        zoomThrows = false;
        throw new Error("zoom failed");
      }
      zooms.push(delta);
    },
    onError: (error) => errors.push(error.message),
  });
  const pointer = (type, pointerId, x, y) => {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, { button: 0, pointerId, clientX: x, clientY: y });
    return event;
  };

  const firstDown = pointer("pointerdown", 1, 10, 10);
  const secondDown = pointer("pointerdown", 2, 20, 20);
  canvas.dispatchEvent(firstDown);
  canvas.dispatchEvent(secondDown);
  assert.deepEqual(canvas.captureCalls, [1]);
  assert.equal(firstDown.defaultPrevented, true);
  assert.equal(secondDown.defaultPrevented, true);
  canvas.dispatchEvent(pointer("pointermove", 2, 40, 20));
  canvas.dispatchEvent(pointer("pointerup", 2, 40, 20));
  assert.deepEqual(pans, []);

  canvas.dispatchEvent(pointer("pointermove", 1, 30, 10));
  assert.deepEqual(errors, ["pan failed"]);
  assert.deepEqual(canvas.releaseCalls, [1]);
  canvas.dispatchEvent(pointer("pointerdown", 3, 10, 10));
  canvas.dispatchEvent(pointer("pointerup", 3, 10, 10));
  await Promise.resolve();
  assert.equal(commands.length, 1, "a gesture after a throwing pan must recover");

  canvas.dispatchEvent(pointer("pointerdown", 4, 10, 10));
  canvas.dispatchEvent(pointer("pointercancel", 4, 10, 10));
  assert.deepEqual(canvas.releaseCalls, [1, 3, 4]);
  assert.equal(commands.length, 1, "pointercancel must never become a click");

  canvas.throwCapture = true;
  canvas.dispatchEvent(pointer("pointerdown", 5, 10, 10));
  assert.deepEqual(errors, ["pan failed", "capture failed"]);
  canvas.throwCapture = false;
  blockedThrows = true;
  canvas.dispatchEvent(pointer("pointerdown", 6, 10, 10));
  assert.deepEqual(errors, ["pan failed", "capture failed", "blocked failed"]);
  canvas.dispatchEvent(pointer("pointerdown", 7, 10, 10));
  canvas.dispatchEvent(pointer("pointermove", 7, 30, 10));
  canvas.dispatchEvent(pointer("pointerup", 7, 30, 10));
  assert.deepEqual(pans, [[20, 0]], "a drag after a throwing pan must recover");

  const wheelOne = new Event("wheel", { cancelable: true });
  Object.defineProperty(wheelOne, "deltaY", { value: 12 });
  canvas.dispatchEvent(wheelOne);
  assert.equal(wheelOne.defaultPrevented, true);
  assert.deepEqual(errors, ["pan failed", "capture failed", "blocked failed", "zoom failed"]);
  const wheelTwo = new Event("wheel", { cancelable: true });
  Object.defineProperty(wheelTwo, "deltaY", { value: -8 });
  canvas.dispatchEvent(wheelTwo);
  assert.deepEqual(zooms, [-8]);

  const contextMenu = new Event("contextmenu", { cancelable: true });
  canvas.dispatchEvent(contextMenu);
  assert.equal(contextMenu.defaultPrevented, true);
  input.dispose();
  assert.deepEqual(canvas.captured.size, 0);
  globalThis.window = oldWindow;
});

test("performance_capture_rejects_hidden_or_software_runs_and_exports_schema_one", async () => {
  assert.equal(rendererPerformance.performanceProgressLabel(0), "Warming: 30s remaining");
  assert.equal(rendererPerformance.performanceProgressLabel(29_001), "Warming: 1s remaining");
  assert.equal(rendererPerformance.performanceProgressLabel(30_000), "Sampling: 120s remaining");
  assert.equal(rendererPerformance.performanceProgressLabel(149_001), "Sampling: 1s remaining");
  assert.equal(rendererPerformance.performanceProgressLabel(150_000), "Finishing capture...");
  assert.throws(() => rendererPerformance.performanceProgressLabel(-1), /finite and nonnegative/);
  const activeCanvas = { clientWidth: 1920, clientHeight: 1080, width: 1920, height: 1080 };
  const browserRuntime = rendererPerformance.createBrowserPerformanceRuntime(activeCanvas, () => ({
    draws: 0, triangles: 0, lights: 0, shadowCasters: 0,
  }));
  assert.deepEqual(browserRuntime.surfaceSize(), {
    cssWidth: 1920, cssHeight: 1080, backingWidth: 1920, backingHeight: 1080,
  });
  activeCanvas.clientWidth = 960;
  assert.equal(browserRuntime.surfaceSize().cssWidth, 960);

  let now = 0;
  let visible = "visible";
  let nextFrame = null;
  let longTask = null;
  const runtime = {
    now: () => now,
    startedAt: () => "2026-08-08T12:00:00.000Z",
    visibility: () => visible,
    subscribeVisibility: () => () => undefined,
    requestFrame: (listener) => { nextFrame = listener; return 1; },
    cancelFrame: () => { nextFrame = null; },
    observeLongTasks: (listener) => { longTask = listener; return { supported: true, disconnect() {} }; },
    surfaceSize: () => ({ cssWidth: 1920, cssHeight: 1080, backingWidth: 1920, backingHeight: 1080 }),
    sampleFrame: () => ({ draws: 4, triangles: 80, lights: 9, shadowCasters: 2 }),
  };
  const backend = Object.freeze({
    requested: "webgl2", selected: "webgl2", webgpuSupport: null,
    webgpuInit: "not-attempted", webgpuFailure: null, webgl2Init: "ok", webglVersion: 2,
    engineInfo: { description: "WebGL", vendor: "Example", renderer: "Hardware", version: "2" },
  });
  const metadata = Object.freeze({
    os: "Windows", cpu: "CPU", gpu: "GPU", driver: "driver", browser: "browser", powerMode: "AC",
    cssWidth: 1920, cssHeight: 1080, backingWidth: 1920, backingHeight: 1080,
    devicePixelRatio: 1, renderScale: 1, fixtureSeed: 1592594996, population: 64,
    roomWidth: 48, roomHeight: 32, trainingWorkers: 0, backend,
  });
  const capture = new rendererPerformance.GreyboxPerformanceCapture(runtime);
  const completion = capture.start(metadata);
  const frame = (at) => { now = at; const callback = nextFrame; nextFrame = null; callback(at); };
  frame(29_999);
  frame(30_000);
  longTask(7);
  frame(30_010);
  longTask(11);
  frame(30_030);
  frame(150_000);
  const result = await completion;
  assert.deepEqual(result.samples.map((sample) => sample.deltaMs), [10, 20, 119970]);
  assert.deepEqual(result.summary, {
    p50Ms: 20, p95Ms: 119970, p99Ms: 119970,
    framesOver16_67Ms: 2, framesOver33_33Ms: 1,
    gpuResidencyBytes: null, gpuResidencyMethod: "unavailable-browser-api",
  });
  assert.deepEqual(result.longTasks, { supported: true, count: 2, totalMs: 18 });
  assert.equal(JSON.parse(capture.exportJson()).schemaVersion, 1);

  visible = "hidden";
  const hidden = await new rendererPerformance.GreyboxPerformanceCapture(runtime).start(metadata);
  assert.equal(hidden.status, "rejected");
  assert.match(hidden.rejectionReasons[0], /visibility/);
  visible = "visible";
  const software = await new rendererPerformance.GreyboxPerformanceCapture(runtime).start({
    ...metadata, backend: { ...backend, engineInfo: { ...backend.engineInfo, renderer: "SwiftShader" } },
  });
  assert.equal(software.status, "rejected");
  assert.match(software.rejectionReasons[0], /software renderer/);

  const wrongSurface = await new rendererPerformance.GreyboxPerformanceCapture({
    ...runtime,
    surfaceSize: () => ({ cssWidth: 960, cssHeight: 540, backingWidth: 1920, backingHeight: 1080 }),
  }).start(metadata);
  assert.equal(wrongSurface.status, "rejected");
  assert.match(wrongSurface.rejectionReasons[0], /measured active canvas dimensions/);
});

test("canvas_control_uses_the_same_stress_fixture_clock_and_export_schema", () => {
  const source = fs.readFileSync(path.join(ROOT, "client", "src", "render", "canvas-control.ts"), "utf8");
  assert.doesNotMatch(source, /@babylonjs/);
  const oldRequest = globalThis.requestAnimationFrame;
  const oldCancel = globalThis.cancelAnimationFrame;
  let frame = null;
  let cancelled = 0;
  globalThis.requestAnimationFrame = (callback) => { frame = callback; return 7; };
  globalThis.cancelAnimationFrame = (request) => { cancelled = request; };
  const context = {
    fillStyle: "", strokeStyle: "",
    fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, fill() {}, arc() {}, stroke() {},
  };
  const canvas = { width: 1920, height: 1080, getContext: (kind) => kind === "2d" ? context : null };
  const renderer = canvasControl.createCanvasControlRenderer(canvas);
  const fixture = stress.createGreyboxStressFixture();
  renderer.acceptSnapshot(fixture, 123);
  const draw = frame;
  frame = null;
  draw(124);
  const diagnostics = renderer.diagnostics();
  assert.deepEqual([diagnostics.backend.requested, diagnostics.backend.selected], ["canvas", "canvas2d"]);
  assert.deepEqual([diagnostics.epoch, diagnostics.tick], [fixture.epoch, fixture.tick]);
  assert.equal(diagnostics.scene.instances, fixture.map.length + fixture.furniture.length + fixture.units.length);
  assert.equal(diagnostics.scene.draws, 1 + diagnostics.scene.instances);
  assert.deepEqual([diagnostics.scene.triangles, diagnostics.scene.lights, diagnostics.scene.shadowCasters], [0, 9, 0]);
  const metadataBackend = JSON.parse(JSON.stringify(diagnostics.backend));
  assert.equal(metadataBackend.engineInfo.description, "Canvas2D control");
  renderer.dispose();
  assert.equal(cancelled, 7);
  globalThis.requestAnimationFrame = oldRequest;
  globalThis.cancelAnimationFrame = oldCancel;
});

test("reference_capture_resizes_through_the_backing_owner_and_rolls_back_failed_setup", () => {
  const entry = fs.readFileSync(path.join(ROOT, "client", "src", "v2.ts"), "utf8");
  const gpuRenderer = fs.readFileSync(path.join(ROOT, "client", "src", "render", "renderer.ts"), "utf8");
  assert.match(entry, /renderer\.frameMetrics\(\)/);
  assert.match(entry, /completed nonempty rendered frame/);
  assert.doesNotMatch(entry, /captureCanvas\.width\s*=\s*1920/);
  const performanceHandler = entry.slice(entry.indexOf('performanceStart.addEventListener("click"'),
    entry.indexOf('performanceDownload.addEventListener("click"'));
  assert.doesNotMatch(performanceHandler, /showError|status\.value\s*=\s*"Stopped"/);
  assert.match(gpuRenderer, /drawCallsCounter\.current/);
  assert.match(gpuRenderer, /getActiveIndices\(\) \/ 3/);
  assert.match(gpuRenderer, /renderedFrame: Object\.freeze/);
  assert.match(gpuRenderer, /if \(!this\.#running\) throw new Error/);
  const surface = (width = 640, height = 360) => ({
    style: { width: `${width}px`, height: `${height}px` }, width, height,
    get clientWidth() { return Number.parseInt(this.style.width, 10); },
    get clientHeight() { return Number.parseInt(this.style.height, 10); },
  });
  const engineCanvas = surface();
  let engineResizes = 0;
  const transaction = rendererPerformance.prepareReferenceCaptureSurface(engineCanvas, "engine", () => {
    engineResizes++;
    engineCanvas.width = engineCanvas.clientWidth;
    engineCanvas.height = engineCanvas.clientHeight;
  });
  assert.deepEqual(transaction.size, {
    cssWidth: 1920, cssHeight: 1080, backingWidth: 1920, backingHeight: 1080,
  });
  transaction.restore();
  transaction.restore();
  assert.deepEqual([engineCanvas.style.width, engineCanvas.style.height, engineCanvas.width, engineCanvas.height],
    ["640px", "360px", 640, 360]);
  assert.equal(engineResizes, 2);

  const canvas2d = surface();
  const canvasTransaction = rendererPerformance.prepareReferenceCaptureSurface(canvas2d, "canvas2d", () => {});
  assert.deepEqual([canvas2d.width, canvas2d.height], [1920, 1080]);
  canvasTransaction.restore();
  assert.deepEqual([canvas2d.width, canvas2d.height], [640, 360]);

  const rejected = surface();
  assert.throws(() => rendererPerformance.prepareReferenceCaptureSurface(rejected, "engine", () => {}),
    /exact 1920x1080/);
  assert.deepEqual([rejected.style.width, rejected.style.height, rejected.width, rejected.height],
    ["640px", "360px", 640, 360]);
});

test("capture_controls_gate_readiness_retry_and_terminal_lifecycle_without_stale_downloads", () => {
  assert.equal(captureControl.browserCaptureLabel(
    "Mozilla/5.0 Chrome/152.0.8000.7 Safari/537.36",
  ), "Chrome 152.0.8000.7");
  assert.equal(captureControl.browserCaptureLabel(
    "Mozilla/5.0 Chrome/151.0.0.0 Safari/537.36",
  ), "Chrome 151.0.7922.72");
  assert.equal(captureControl.browserCaptureLabel("reduced-agent", [
    { brand: "Chromium", version: "151" },
  ]), "Chrome 151.0.7922.72");
  assert.equal(captureControl.browserCaptureLabel("reduced-agent", [
    { brand: "Not.A/Brand", version: "99" }, { brand: "Chromium", version: "151.2.3.4" },
  ]), "Chrome 151.2.3.4");
  assert.equal(captureControl.browserCaptureLabel("reduced-agent"), "Chrome 151.0.7922.72");
  let now = 0;
  let nextHandle = 1;
  const timers = new Map();
  const cancelled = [];
  const views = [];
  const controls = new captureControl.CaptureControls({
    now: () => now,
    schedule: (callback, intervalMs) => {
      assert.equal(intervalMs, 1000);
      const handle = nextHandle++;
      timers.set(handle, callback);
      return handle;
    },
    cancel: (handle) => { cancelled.push(handle); timers.delete(handle); },
    render: (view) => views.push(view),
  });
  assert.deepEqual(views.at(-1), {
    startDisabled: true, downloadDisabled: true, metadataLocked: false,
    progress: 0, progressLabel: null,
  });
  controls.updateReadiness(false); // Hidden/not-yet-rendered routes remain unavailable.
  assert.equal(views.at(-1).startDisabled, true);
  controls.updateReadiness(true);
  assert.equal(views.at(-1).startDisabled, false);

  let rejected = 0;
  assert.equal(controls.begin(() => { rejected++; }), true);
  assert.equal(controls.begin(() => { rejected += 100; }), false, "a double Start must be ignored");
  assert.deepEqual([views.at(-1).startDisabled, views.at(-1).downloadDisabled,
    views.at(-1).metadataLocked], [true, true, true]);
  now = 31_000;
  timers.get(1)();
  assert.deepEqual([views.at(-1).progress, views.at(-1).progressLabel],
    [31, "Sampling: 119s remaining"]);
  assert.equal(controls.settle("rejected"), true);
  assert.deepEqual([views.at(-1).startDisabled, views.at(-1).downloadDisabled,
    views.at(-1).metadataLocked, views.at(-1).progress], [false, true, false, 0]);
  assert.deepEqual(cancelled, [1]);

  now = 40_000;
  assert.equal(controls.begin(() => { rejected++; }), true, "a rejected run must be retryable");
  assert.equal(views.at(-1).downloadDisabled, true, "retry must invalidate every older export");
  assert.equal(controls.settle("complete"), true);
  assert.deepEqual([views.at(-1).startDisabled, views.at(-1).downloadDisabled,
    views.at(-1).metadataLocked, views.at(-1).progress], [true, false, false, 150]);
  assert.equal(controls.begin(() => { rejected++; }), false, "accepted evidence remains immutable");

  const terminalViews = [];
  const terminal = new captureControl.CaptureControls({
    now: () => 0, schedule: (callback) => { timers.set(9, callback); return 9; },
    cancel: (handle) => { cancelled.push(handle); timers.delete(handle); },
    render: (view) => terminalViews.push(view),
  });
  terminal.updateReadiness(true);
  assert.equal(terminal.begin(() => { rejected++; }), true);
  terminal.terminate("page hidden");
  terminal.terminate("renderer terminal");
  assert.equal(rejected, 1, "pagehide/terminal cleanup must reject one active run exactly once");
  assert.equal(terminal.settle("complete"), false, "late completion after terminal must be ignored");
  assert.deepEqual([terminalViews.at(-1).startDisabled, terminalViews.at(-1).downloadDisabled,
    terminalViews.at(-1).metadataLocked], [true, true, false]);
});

test("performance_capture_rejects_if_the_renderer_stops_during_the_sample_window", async () => {
  let frameCallback = null;
  let rendering = true;
  const runtime = {
    now: () => 0,
    startedAt: () => "2026-08-08T12:00:00.000Z",
    visibility: () => "visible",
    subscribeVisibility: () => () => undefined,
    requestFrame: (callback) => { frameCallback = callback; return 1; },
    cancelFrame: () => { frameCallback = null; },
    observeLongTasks: () => ({ supported: false, disconnect() {} }),
    surfaceSize: () => ({ cssWidth: 1920, cssHeight: 1080, backingWidth: 1920, backingHeight: 1080 }),
    sampleFrame: () => {
      if (!rendering) throw new Error("greybox renderer is not rendering");
      return { draws: 7, triangles: 90, lights: 9, shadowCasters: 4 };
    },
  };
  const metadata = Object.freeze({
    os: "Windows", cpu: "CPU", gpu: "GPU", driver: "driver", browser: "browser", powerMode: "AC",
    cssWidth: 1920, cssHeight: 1080, backingWidth: 1920, backingHeight: 1080,
    devicePixelRatio: 1, renderScale: 1, fixtureSeed: 1592594996, population: 64,
    roomWidth: 48, roomHeight: 32, trainingWorkers: 0,
    backend: Object.freeze({
      requested: "webgl2", selected: "webgl2", webgpuSupport: null,
      webgpuInit: "not-attempted", webgpuFailure: null, webgl2Init: "ok", webglVersion: 2,
      engineInfo: { description: "WebGL", vendor: "Example", renderer: "Hardware", version: "2" },
    }),
  });
  const capture = new rendererPerformance.GreyboxPerformanceCapture(runtime);
  const completion = capture.start(metadata);
  const frame = (at) => { const callback = frameCallback; frameCallback = null; callback(at); };
  frame(30_000);
  frame(30_016);
  rendering = false;
  frame(150_001);
  const result = await completion;
  assert.equal(result.status, "rejected");
  assert.equal(result.samples.length, 1);
  assert.deepEqual(result.rejectionReasons, ["greybox renderer is not rendering"]);
});

test("room_performance_schema_two_pins_every_artifact_and_schema_one_remains_compatible", async () => {
  const sidecar = JSON.parse(fs.readFileSync(
    path.join(ROOT, "web", "assets3d", "room_slice.json"), "utf8"));
  let frameCallback = null;
  const runtime = {
    now: () => 0, startedAt: () => "2026-08-08T12:00:00.000Z", visibility: () => "visible",
    subscribeVisibility: () => () => undefined,
    requestFrame: (callback) => { frameCallback = callback; return 1; },
    cancelFrame: () => { frameCallback = null; },
    observeLongTasks: () => ({ supported: false, disconnect() {} }),
    surfaceSize: () => ({ cssWidth: 1920, cssHeight: 1080, backingWidth: 1920, backingHeight: 1080 }),
    sampleFrame: () => ({ draws: 8, triangles: 240, lights: 9, shadowCasters: 12 }),
  };
  const base = Object.freeze({
    os: "Windows", cpu: "CPU", gpu: "GPU", driver: "driver", browser: "browser", powerMode: "AC",
    cssWidth: 1920, cssHeight: 1080, backingWidth: 1920, backingHeight: 1080,
    devicePixelRatio: 1, renderScale: 1, fixtureSeed: 1592594996, population: 64,
    roomWidth: 48, roomHeight: 32, trainingWorkers: 0,
    backend: Object.freeze({ requested: "webgl2", selected: "webgl2", webgpuSupport: null,
      webgpuInit: "not-attempted", webgpuFailure: null, webgl2Init: "ok", webglVersion: 2,
      engineInfo: { description: "WebGL", vendor: "Example", renderer: "Hardware", version: "2" } }),
  });
  const fixture = Object.freeze({
    kind: "representative-room", fixtureId: "v2-room-slice-1",
    buildInputsSha256: roomGenerated.ROOM_BUILD_INPUTS_SHA256,
    glbSha256: roomGenerated.ROOM_GLB_SHA256,
    sidecarSha256: roomGenerated.ROOM_SIDECAR_SHA256,
    validatorSha256: roomGenerated.ROOM_VALIDATOR_SHA256,
    roomStressMapSha256: roomStress.ROOM_STRESS_MAP_SHA256,
    generatorSeed: 1592594996, population: 64, roomWidth: 48, roomHeight: 32,
    payloadBytes: sidecar.payloadBytes,
    estimatedGpuBytes: sidecar.estimatedGpuResidency.totalBytes,
  });
  const capture = new rendererPerformance.GreyboxPerformanceCapture(runtime);
  const completion = capture.start(Object.freeze({ ...base, fixture }));
  capture.reject("test stop");
  const room = await completion;
  assert.equal(room.schemaVersion, 2);
  assert.deepEqual(room.metadata.fixture, fixture);
  assert.throws(() => new rendererPerformance.GreyboxPerformanceCapture(runtime).start(Object.freeze({
    ...base, fixture: { ...fixture, glbSha256: "bad" },
  })), /GLB SHA-256/);

  const greyboxCapture = new rendererPerformance.GreyboxPerformanceCapture(runtime);
  const greyboxCompletion = greyboxCapture.start(base);
  greyboxCapture.reject("test stop");
  const greybox = await greyboxCompletion;
  assert.equal(greybox.schemaVersion, 1);
  assert.equal("fixture" in greybox.metadata, false);
});

test("room_startup_finishes_the_async_environment_before_worker_init_and_input", async () => {
  const order = [];
  let releaseRenderer;
  const rendererReady = new Promise((resolve) => { releaseRenderer = resolve; });
  const renderer = { acceptSnapshot() {}, clear() {}, dispose() { order.push("renderer-dispose"); } };
  const client = {
    onSnapshot: null, onDiagnostics: null, onError: null,
    async init() { order.push("worker-init"); }, async reset() {}, async setPaused() {}, async command() {},
    diagnostics: () => ({ paused: false }), dispose() { order.push("client-dispose"); },
  };
  const starting = bootstrap.bootstrapV2({
    client, seed: 1,
    createRenderer: async () => { order.push("environment-start"); await rendererReady;
      order.push("environment-ready"); return renderer; },
    attachInput: () => { order.push("input"); return null; },
  });
  await Promise.resolve();
  assert.deepEqual(order, ["environment-start"]);
  releaseRenderer();
  const application = await starting;
  assert.deepEqual(order, ["environment-start", "environment-ready", "worker-init", "input"]);
  application.dispose();
});

test("vite_build_rewrites_no_hand_written_page_under_web_including_its_own_input", () => {
  // Asserted complete rather than filtered. The list used to be
  // `[...].filter(existsSync)`, so a rename dropped an entry and this guarantee
  // evaporated with a green test -- which is precisely the event that happened
  // when the studio shell moved the old page to `legacy.html`. `web/index.html`
  // is on the list now because it is the Rollup *input*: the one source file a
  // misbehaving plugin could rewrite in place, which is more exposure than it had
  // as a bystander, not less.
  const handWritten = ["web/index.html", "web/legacy.html", "web/main.js", "web/style.css"];
  for (const name of handWritten) {
    assert.ok(fs.existsSync(path.join(ROOT, name)),
      `${name} is named by this test as a file the build must not touch, and it does not exist`);
  }
  const before = new Map(handWritten.map((name) => [name, fs.readFileSync(path.join(ROOT, name))]));
  const build = spawnSync(process.execPath, [path.join(ROOT, "node_modules", "vite", "bin", "vite.js"), "build"],
    { cwd: ROOT, encoding: "utf8", shell: false });
  assert.equal(build.status, 0, `production build failed:\n${build.stdout}\n${build.stderr}\n${build.error ?? ""}`);
  for (const [name, contents] of before) assert.deepEqual(fs.readFileSync(path.join(ROOT, name)), contents);
  assert.ok(fs.existsSync(path.join(ROOT, "dist", "index.html")));
  assert.ok(fs.existsSync(path.join(ROOT, "dist", "web.wasm")));
  assert.deepEqual(fs.readdirSync(path.join(ROOT, "dist", "assets3d")).sort(),
    ["combatants.glb", "combatants.json", "room_slice.glb", "room_slice.json"]);
  assert.deepEqual(fs.readFileSync(path.join(ROOT, "dist", "assets3d", "combatants.glb")),
    fs.readFileSync(path.join(ROOT, "web", "assets3d", "combatants.glb")));
  assert.deepEqual(fs.readFileSync(path.join(ROOT, "dist", "assets3d", "combatants.json")),
    fs.readFileSync(path.join(ROOT, "web", "assets3d", "combatants.json")));
  assert.deepEqual(fs.readFileSync(path.join(ROOT, "dist", "assets3d", "room_slice.glb")),
    fs.readFileSync(path.join(ROOT, "web", "assets3d", "room_slice.glb")));
  assert.deepEqual(fs.readFileSync(path.join(ROOT, "dist", "assets3d", "room_slice.json")),
    fs.readFileSync(path.join(ROOT, "web", "assets3d", "room_slice.json")));
  assert.equal(fs.existsSync(path.join(ROOT, "dist", "assets3d", "combatants.validator.json")), false);
  assert.equal(fs.existsSync(path.join(ROOT, "dist", "assets3d", "room_slice.validator.json")), false);
  const chunks = chunkGraph.readChunks(path.join(ROOT, "dist", "assets"));
  assert.ok(chunks.size >= 2);
  const loaderChunks = [...chunks].filter(([, source]) =>
    source.includes("RegisterGLTF2Loader") || source.includes("Unsupported version:"));
  assert.ok(loaderChunks.length >= 1, "representative route must emit a lazy glTF 2 loader chunk");
  const roomAssetChunks = [...chunks].filter(([, source]) =>
    source.includes("representative room asset failed"));
  assert.equal(roomAssetChunks.length, 1, "the room asset boundary must remain an identifiable lazy chunk");
  const builtHtml = fs.readFileSync(path.join(ROOT, "dist", "index.html"), "utf8");
  // Against the entry's static import closure, not against the HTML text. This
  // used to assert the built HTML never names the loader chunk, which stopped
  // asking anything the moment the shell's entry had no static imports: with no
  // `<link rel="modulepreload">` in the document at all, "outside the initial
  // modulepreload closure" is trivially true of every chunk in the repository,
  // the glTF loader included. The claim `docs/reference/room-asset-contract.md`
  // makes is about the closure, so that is what is walked.
  const eager = chunkGraph.eagerChunks(builtHtml);
  assert.ok(eager.size >= 1, "dist/index.html names no client chunk");
  const eagerClosure = chunkGraph.staticImportClosure(chunks, eager);
  for (const [name] of [...loaderChunks, ...roomAssetChunks]) {
    assert.equal(eagerClosure.has(name), false,
      `${name} is inside the studio entry's static import closure, so the glTF loader `
        + "and the room assets are no longer lazy");
  }
  const html = fs.readFileSync(path.join(ROOT, "web", "index.html"), "utf8");
  assert.match(html, /legacy page/);
  assert.match(html, /button:disabled, button:disabled:hover/);
  assert.match(html, /id="performance-start" type="button" disabled/);
  assert.match(html, /id="interaction-hint"/);
  assert.match(html, /id="performance-progress" max="150" value="0"/);
  assert.match(html, /id="performance-status" aria-live="polite"/);
  assert.doesNotMatch(html, /id="room-camera-toggle"/,
    "Free is a first-class mode; the obsolete duplicate camera toggle must not return");
  const selector = /<select id="game-view-mode"[^>]*>([\s\S]*?)<\/select>/.exec(html)?.[1] ?? "";
  assert.deepEqual([...selector.matchAll(/<option value="([^"]+)"/g)].map((match) => match[1]),
    ["world", "geometry", "top_down", "first_person", "free", "dev"]);
  assert.equal((html.match(/data-performance-metadata/g) ?? []).length, 6);
  for (const value of [
    "Windows 11 Home 25H2 build 26200.8973", "13th Gen Intel Core i7-13700H",
    "Intel Iris Xe Graphics", "32.0.101.7084", "Chrome 151.0.7922.72", "AC / Balanced",
  ]) assert.match(html, new RegExp(`value="${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
  const entry = fs.readFileSync(path.join(ROOT, "client", "src", "v2.ts"), "utf8");
  assert.match(entry, /rendererParameter === "canvas"/);
});

test("the_representative_room_defaults_on_but_its_loader_stays_outside_the_static_entry_closure", () => {
  const entry = fs.readFileSync(path.join(ROOT, "client", "src", "v2.ts"), "utf8");
  const staticImports = entry.slice(0, entry.indexOf("const element"));
  for (const module of ["room-assets", "room-environment", "room-review-camera", "room-stress", "room-review"]) {
    assert.doesNotMatch(staticImports, new RegExp(module));
    assert.match(entry, new RegExp(`import\\(\"\\./render/${module}\\.js\"\\)`));
  }
  assert.match(entry, /representativeRoom\s*\?\s*await Promise\.all/);
  assert.match(entry, /roomParameter === "representative" \|\|\s*\(roomParameter === null && !syntheticMode\)/);
  assert.match(entry, /room=representative\|procedural/);
  assert.match(entry, /!stressMode \? roomModules\[4\]\.applyAuthoredRoomLighting\(scene\) : null/);
  assert.match(entry, /review=room requires room=representative/);
  assert.match(entry, /const needsWorker = !syntheticMode/);
  assert.match(entry, /roomReviewMode\s*\?\s*roomModules\?\.\[4\]\.createCompactRoomReviewFixture\(\)/);
  const loader = fs.readFileSync(path.join(ROOT, "client", "src", "render", "room-assets.ts"), "utf8");
  assert.match(loader, /@babylonjs\/loaders\/glTF\/2\.0\/glTFLoader\.js/);
  assert.match(loader, /@babylonjs\/core\/Meshes\/instancedMesh\.js/);
});

test("vite_dev_serves_only_the_pinned_runtime_room_assets_with_exact_mime_and_magic", async () => {
  const { createServer } = await import("vite");
  const server = await createServer({
    configFile: path.join(ROOT, "vite.config.ts"),
    server: { host: "127.0.0.1", port: 0, strictPort: false },
    logLevel: "silent",
  });
  try {
    await server.listen();
    const address = server.httpServer?.address();
    assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    const glb = await fetch(`${origin}/assets3d/room_slice.glb`);
    assert.equal(glb.status, 200);
    assert.equal(glb.headers.get("content-type"), "model/gltf-binary");
    const glbBytes = new Uint8Array(await glb.arrayBuffer());
    assert.equal(Buffer.from(glbBytes.subarray(0, 4)).toString("ascii"), "glTF");
    assert.equal(new DataView(glbBytes.buffer).getUint32(4, true), 2);
    const sidecar = await fetch(`${origin}/assets3d/room_slice.json`);
    assert.equal(sidecar.status, 200);
    assert.equal(sidecar.headers.get("content-type"), "application/json; charset=utf-8");
    assert.equal((await sidecar.json()).fixtureId, "v2-room-slice-1");
    const combatantGlb = await fetch(`${origin}/assets3d/combatants.glb`);
    assert.equal(combatantGlb.status, 200);
    assert.equal(combatantGlb.headers.get("content-type"), "model/gltf-binary");
    assert.equal(Buffer.from(await combatantGlb.arrayBuffer()).subarray(0, 4).toString("ascii"), "glTF");
    const combatantSidecar = await fetch(`${origin}/assets3d/combatants.json`);
    assert.equal(combatantSidecar.status, 200);
    assert.equal(combatantSidecar.headers.get("content-type"), "application/json; charset=utf-8");
    assert.equal((await combatantSidecar.json()).fixtureId, "v2-combatants-2");
    const validator = await fetch(`${origin}/assets3d/room_slice.validator.json`);
    assert.equal(validator.status, 404, "validator provenance must not be a runtime asset");
    const combatantValidator = await fetch(`${origin}/assets3d/combatants.validator.json`);
    assert.equal(combatantValidator.status, 404,
      "combatant validator provenance must not be a runtime asset");
    const validatorFsPath = path.join(ROOT, "web", "assets3d", "room_slice.validator.json")
      .replaceAll("\\", "/");
    const validatorThroughViteFs = await fetch(`${origin}/@fs/${validatorFsPath}`);
    assert.equal(validatorThroughViteFs.status, 404,
      "Vite filesystem serving must not bypass the validator runtime denial");
    const clientEntry = await fetch(`${origin}/client-src/v2.ts`);
    assert.equal(clientEntry.status, 200, "the validator denial must preserve client module serving");
  } finally {
    await server.close();
  }
});

test("room_sidecar_runtime_decoding_rejects_every_malformed_or_unbounded_field", () => {
  const sidecarPath = path.join(ROOT, "web", "assets3d", "room_slice.json");
  const bytes = fs.readFileSync(sidecarPath);
  const valid = roomAssetContract.parseRoomAssetSidecar(bytes);
  assert.equal(valid.fixtureId, "v2-room-slice-1");
  assert.equal(valid.pieces.length, 18);
  assert.deepEqual(valid.styling, { id: "painted-cathedral-v4", mode: "deterministic-vertex-color",
    attribute: "room_style", textures: true });
  assert.ok(Object.isFrozen(valid));
  assert.ok(Object.isFrozen(valid.pieces));

  const source = JSON.parse(bytes);
  const malformed = [
    { ...source, extra: true },
    { ...source, schemaVersion: 2 },
    { ...source, buildInputsSha256: "x".repeat(64) },
    { ...source, pieces: source.pieces.slice(1) },
    { ...source, pieces: source.pieces.map((piece, index) => index === 0 ? { ...piece, node: "ROOM_wrong" } : piece) },
    { ...source, sockets: [{ ...source.sockets[0], rotation: [0, 0, 0, 2] }] },
    { ...source, counts: { ...source.counts, triangles: source.counts.triangles + 1 } },
    { ...source, estimatedGpuResidency: { ...source.estimatedGpuResidency,
      totalBytes: source.estimatedGpuResidency.totalBytes + 1 } },
    { ...source, payloadBytes: 67_108_865 },
    { ...source, counts: { ...source.counts, materials: 6 } },
    { ...source, estimatedGpuResidency: { ...source.estimatedGpuResidency,
      sourceBufferBytes: 268_435_456, totalBytes: 272_851_968 } },
    { ...source, estimatedGpuResidency: { ...source.estimatedGpuResidency,
      shadowMapBytes: 4_194_303, totalBytes: source.estimatedGpuResidency.totalBytes - 1 } },
    { ...source, pieces: source.pieces.map((piece, index) => index === 0 ?
      { ...piece, vertexCount: 25_165_825 } : piece),
      counts: { ...source.counts, vertices: 25_166_305 } },
  ];
  for (const [index, value] of malformed.entries()) {
    assert.throws(() => roomAssetContract.parseRoomAssetSidecar(Buffer.from(JSON.stringify(value))),
      /room sidecar/, "malformed room sidecar case " + index + " must fail closed");
  }
  assert.throws(() => roomAssetContract.parseRoomAssetSidecar(new Uint8Array(4 * 1024 * 1024 + 1)),
    /byte length/);
});

const combatantSidecarBytes = fs.readFileSync(path.join(ROOT, "web", "assets3d", "combatants.json"));
const combatantGlbBytes = fs.readFileSync(path.join(ROOT, "web", "assets3d", "combatants.glb"));

function combatantResponse(url, sidecarBytes = combatantSidecarBytes, glbBytes = combatantGlbBytes) {
  const glb = String(url).endsWith(".glb");
  const bytes = glb ? glbBytes : sidecarBytes;
  return new Response(bytes, { status: 200, headers: {
    "content-type": glb ? "model/gltf-binary" : "application/json",
    "content-length": String(bytes.byteLength),
  } });
}

test("combatant_sidecar_decoding_refuses_undeclared_fields_and_every_semantic_closure_drift", () => {
  const valid = combatantAssetContract.parseCombatantAssetSidecar(combatantSidecarBytes);
  assert.deepEqual(valid.archetypes.map(({ kind }) => kind), ["fighter", "brute"]);
  assert.deepEqual(valid.archetypes.map(({ skeleton }) => skeleton.bones.length), [16, 16]);
  assert.deepEqual(valid.archetypes.map(({ clips }) => clips.map(({ semantic }) => semantic)),
    [["idle", "walk", "stagger", "fall"], ["idle", "walk", "stagger", "fall"]]);
  assert.ok(Object.isFrozen(valid));
  assert.ok(Object.isFrozen(valid.archetypes[0].skeleton.bones));

  const source = JSON.parse(combatantSidecarBytes);
  const changedNode = structuredClone(source);
  [changedNode.archetypes[0].nodes[0], changedNode.archetypes[0].nodes[1]] =
    [changedNode.archetypes[0].nodes[1], changedNode.archetypes[0].nodes[0]];
  const changedSkeleton = structuredClone(source);
  changedSkeleton.archetypes[1].skeleton.bones.pop();
  const changedClip = structuredClone(source);
  changedClip.archetypes[0].clips[2].animation = "FIGHTER_attack";
  const changedBounds = structuredClone(source);
  changedBounds.archetypes[0].lods[0].meshes[0].bounds.min[0] =
    changedBounds.archetypes[0].lods[0].meshes[0].bounds.max[0] + 1;
  const malformed = [
    { ...source, undeclared: true },
    { ...source, counts: { ...source.counts, skins: 0 } },
    { ...source, semanticNames: source.semanticNames.slice(1) },
    changedNode, changedSkeleton, changedClip, changedBounds,
  ];
  for (const value of malformed) {
    assert.throws(() => combatantAssetContract.parseCombatantAssetSidecar(
      Buffer.from(JSON.stringify(value))), /combatant/);
  }
  assert.throws(() => combatantAssetContract.parseCombatantAssetSidecar(
    new Uint8Array(2 * 1024 * 1024 + 1)), /byte length/);
});

test("combatant_loading_checks_hash_magic_and_declared_bounds_before_calling_babylon", async () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  try {
    const changedSidecar = Buffer.from(combatantSidecarBytes);
    changedSidecar[changedSidecar.length - 1] = 0x20;
    let loaderCalls = 0;
    await assert.rejects(combatantAssets.loadCombatantAsset(scene, new AbortController().signal,
      (url) => Promise.resolve(combatantResponse(url, changedSidecar)),
      async () => { loaderCalls++; throw new Error("must not load"); }), /sidecar hash/);
    assert.equal(loaderCalls, 0);

    const changedGlb = Buffer.from(combatantGlbBytes);
    changedGlb[0] = 0;
    await assert.rejects(combatantAssets.loadCombatantAsset(scene, new AbortController().signal,
      (url) => Promise.resolve(combatantResponse(url, combatantSidecarBytes, changedGlb)),
      async () => { loaderCalls++; throw new Error("must not load"); }), /GLB magic/);
    assert.equal(loaderCalls, 0);

    const tooLarge = async (url) => {
      if (!String(url).endsWith(".glb")) return combatantResponse(url);
      return new Response(combatantGlbBytes, { status: 200, headers: {
        "content-type": "model/gltf-binary", "content-length": String(64 * 1024 * 1024 + 1),
      } });
    };
    await assert.rejects(combatantAssets.loadCombatantAsset(scene, new AbortController().signal,
      tooLarge, async () => { loaderCalls++; throw new Error("must not load"); }), /declared length/);
    assert.equal(loaderCalls, 0);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("the_pinned_combatant_glb_loads_once_as_two_hidden_exact_skinned_archetypes", async () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  let fetches = 0;
  let loaderCalls = 0;
  const fetcher = async (url) => { fetches++; return combatantResponse(url); };
  const loader = async (bytes, target, options) => {
    loaderCalls++;
    return LoadAssetContainerAsync(bytes, target, options);
  };
  try {
    const controller = new AbortController();
    const first = combatantAssets.loadCombatantAsset(scene, controller.signal, fetcher, loader);
    const second = combatantAssets.loadCombatantAsset(scene, controller.signal, fetcher, loader);
    assert.equal(first, second, "concurrent callers must share the same in-flight load");
    const asset = await first;
    assert.equal(fetches, 2);
    assert.equal(loaderCalls, 1);
    assert.deepEqual([...asset.archetypes.keys()], ["fighter", "brute"]);
    for (const [kind, archetype] of asset.archetypes) {
      assert.equal(archetype.skeleton.bones.length, 16, `${kind} skeleton closure`);
      assert.deepEqual([...archetype.clips.keys()], ["idle", "walk", "stagger", "fall"]);
      assert.deepEqual([...archetype.nodes.keys()],
        ["root", "pelvis", "torso", "head", "arm_left", "hand_left", "arm_right", "hand_right",
          "socket_weapon_left", "socket_weapon_right", "socket_shield", "region_head", "region_torso",
          "region_left_arm", "region_right_arm", "region_legs", "idle", "walk", "stagger", "fall"]);
      assert.equal(archetype.root.isEnabled(), false);
      assert.deepEqual([...archetype.lods.keys()], ["high", "mid", "low"]);
      assert.ok([...archetype.lods.values()].flatMap((meshes) => [...meshes.values()]).every((mesh) =>
        mesh.isVisible === false && mesh.isPickable === false && mesh.skeleton === archetype.skeleton));
    }
    asset.dispose();
    asset.dispose();
    assert.equal(asset.disposed, true);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("enabled_combatant_dresses_are_visible_independent_joint_local_clones", async () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  try {
    const asset = await combatantAssets.loadCombatantAsset(scene, new AbortController().signal,
      (url) => Promise.resolve(combatantResponse(url)));
    const first = combatantDress.instantiateCombatantDress(asset, "fighter", "dress:first");
    const second = combatantDress.instantiateCombatantDress(asset, "fighter", "dress:second");
    first.setEnabled(true);
    second.setEnabled(true);
    first.sampleClip("walk", 0.375);
    const sampled = first.clips.get("walk");
    assert.equal(sampled.isStarted, true);
    assert.ok(sampled.animatables.length > 0,
      "clip selection must create paused deterministic Babylon animatables");
    assert.equal(first.root.name, "dress:first:FIGHTER_root",
      "the public root is the semantic root, not Babylon's loader closure root");
    assert.ok([...first.meshes.values()].every((mesh) => mesh.isVisible && mesh.isEnabled()));
    assert.ok([...first.meshes.values()].every((mesh) => mesh.alwaysSelectAsActiveMesh));
    for (const [semantic, mesh] of first.meshes) {
      const joint = combatantDress.combatantMeshJoint(semantic);
      assert.equal(mesh.skeleton, null,
        "runtime must not feed joint-local vertices through glTF skin conversion a second time");
      assert.equal(mesh.parent, first.nodes.get(joint), semantic + " did not follow " + joint);
    }
    for (const [semantic, mesh] of second.meshes) {
      assert.equal(mesh.parent, second.nodes.get(combatantDress.combatantMeshJoint(semantic)));
      assert.notEqual(mesh.parent, first.meshes.get(semantic).parent,
        "each body must own an independent semantic joint closure");
    }
    const materialOf = (dress, semantic) => dress.meshes.get(semantic).material;
    assert.equal(materialOf(first, "head_helmet"), materialOf(second, "head_helmet"),
      "clones share the immutable baked PBR material instead of recolouring it at runtime");
    assert.equal(materialOf(first, "head_face").name, "fighter_skin");
    assert.equal(materialOf(first, "head_helmet").name, "fighter_steel");
    assert.equal(materialOf(first, "head_visor").name, "fighter_dark_steel");
    assert.equal(materialOf(first, "torso_breastplate").name, "fighter_steel");
    assert.equal(materialOf(first, "arm_left").name, "fighter_burgundy");
    assert.equal(materialOf(first, "boot_left").name, "fighter_leather");
    assert.match(materialOf(first, "head_helmet").albedoTexture?.name ?? "", /fighter_steel \(Base Color\)/);
    assert.match(materialOf(first, "head_helmet").bumpTexture?.name ?? "", /fighter_steel \(Normal\)/);
    const pixels = (mesh, bodyPixels, axis) => {
      const box = mesh.getBoundingInfo().boundingBox;
      const span = box.maximum[axis] - box.minimum[axis];
      return span / first.contract.height * bodyPixels;
    };
    const sword = first.meshes.get("sword");
    const shield = first.meshes.get("shield");
    const face = first.meshes.get("head_face");
    assert.ok(sword && shield && face);
    assert.ok(pixels(sword, 40, "y") >= 12 && Math.max(pixels(sword, 40, "x"), pixels(sword, 40, "z")) >= 1,
      "the authored sword must keep a long readable edge and at least one pixel of width at a 40px body");
    assert.ok(Math.max(pixels(shield, 40, "x"), pixels(shield, 40, "z")) >= 8,
      "the authored shield must remain a distinct mass at a 40px body");
    assert.ok(Math.max(pixels(face, 100, "x"), pixels(face, 100, "z")) >= 10,
      "the authored face must remain distinct at a 100px body");
    const brute = combatantDress.instantiateCombatantDress(asset, "brute", "dress:brute");
    const club = brute.meshes.get("club");
    assert.ok(club);
    const clubBox = club.getBoundingInfo().boundingBox;
    const clubLength = (clubBox.maximum.y - clubBox.minimum.y) / brute.contract.height * 40;
    assert.ok(clubLength >= 12, "the authored club must remain a long distinct mass at a 40px body");
    brute.dispose();
    first.dispose();
    assert.ok([...second.meshes.values()].every((mesh) => !mesh.isDisposed()),
      "disposing one dress must not dispose another body's authored closure");
    second.dispose();
    asset.dispose();
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("projected_height_selects_low_mid_and_high_combatant_lods_at_bounded_thresholds", () => {
  assert.equal(combatantDress.combatantLodForProjectedHeight(0), "low");
  assert.equal(combatantDress.combatantLodForProjectedHeight(63.999), "low");
  assert.equal(combatantDress.combatantLodForProjectedHeight(64), "mid");
  assert.equal(combatantDress.combatantLodForProjectedHeight(159.999), "mid");
  assert.equal(combatantDress.combatantLodForProjectedHeight(160), "high");
  assert.equal(combatantDress.combatantLodForProjectedHeight(10_000), "high");
});

test("game_combatant_load_failure_is_a_procedural_fallback_but_abort_is_terminal", async () => {
  const signal = new AbortController();
  assert.equal(await greyboxRenderer.loadOptionalCombatants(undefined, {}, signal.signal), null);
  assert.equal(await greyboxRenderer.loadOptionalCombatants(
    async () => { throw new Error("missing optional art"); }, {}, signal.signal), null);
  const wanted = { dispose() {} };
  assert.equal(await greyboxRenderer.loadOptionalCombatants(async () => wanted, {}, signal.signal), wanted);
  const aborted = new AbortController();
  aborted.abort();
  await assert.rejects(greyboxRenderer.loadOptionalCombatants(
    async () => { throw new Error("aborted"); }, {}, aborted.signal), /aborted/);
});

test("authored_game_dress_falls_back_and_reacts_only_to_published_events_then_fog_retires_it", async () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const debug = new rendererDebug.RendererDebugRegistry();
  const casters = new Set();
  const shadows = {
    addShadowCaster(mesh) { casters.add(mesh); },
    removeShadowCaster(mesh) { casters.delete(mesh); },
  };
  try {
    const asset = await combatantAssets.loadCombatantAsset(scene, new AbortController().signal,
      (url) => Promise.resolve(combatantResponse(url)));
    const actors = new rendererActors.ActorPresentation(scene, debug, shadows, asset);
    const fighter = unit({
      kind: 0, x: 2.5, visible: true, actionRole: 2, slot0Action: 2, slot1Action: 4,
    });
    actors.acceptSnapshot(snapshot({ units: Object.freeze([fighter]) }));
    const authored = scene.meshes.filter((mesh) =>
      mesh.name.startsWith("actor:1:1:authored:FIGHTER_lod_"));
    assert.equal(authored.length, asset.archetypes.get("fighter").contract.lods
      .reduce((sum, lod) => sum + lod.meshes.length, 0));
    const active = authored.filter((mesh) => mesh.name.includes("_lod_low_mesh_"));
    const horizontalFromActor = (mesh) => {
      mesh.computeWorldMatrix(true);
      mesh.refreshBoundingInfo(true);
      const centre = mesh.getBoundingInfo().boundingBox.centerWorld;
      return Math.hypot(centre.x - fighter.x, centre.z - fighter.y);
    };
    for (const semantic of ["head_face", "head_plume"]) {
      const mesh = active.find((candidate) => candidate.name.endsWith("_mesh_" + semantic));
      assert.ok(mesh, `the low Fighter LOD lacks ${semantic}`);
      assert.ok(horizontalFromActor(mesh) <= fighter.radius * 1.25,
        `${mesh.name} detached from the authored head at the actor root`);
    }
    for (const mesh of active) {
      const horizontal = horizontalFromActor(mesh);
      assert.ok(horizontal <= fighter.radius * 3,
        `${mesh.name} escaped its actor envelope by ${horizontal.toFixed(3)}`);
    }
    assert.ok(active.every((mesh) => mesh.isPickable),
      "a currently visible body keeps the same picking contract as its procedural fallback");
    assert.ok(active.filter((mesh) => !mesh.name.endsWith("_sword") && !mesh.name.endsWith("_shield"))
      .every((mesh) => mesh.isEnabled()), "the enabled dress must show every body mesh");
    assert.equal(active.find((mesh) => mesh.name.endsWith("_sword")).isEnabled(), true,
      "an equipped blade remains a readable carried silhouette between strikes");
    assert.equal(active.find((mesh) => mesh.name.endsWith("_shield")).isEnabled(), true,
      "an equipped shield remains a readable carried silhouette between guards");
    const driverHand = scene.transformNodes.find((node) => node.name === "actor:1:1:hand_right");
    const authoredHand = scene.transformNodes.find(
      (node) => node.name === "actor:1:1:authored:FIGHTER_hand_right");
    assert.ok(driverHand && authoredHand);
    assert.ok(driverHand.getAbsolutePosition().subtract(authoredHand.getAbsolutePosition()).length() < 1e-4,
      "the authored hand must end at the legacy publication driver's endpoint");
    const marker = (name) => scene.transformNodes.find(
      (node) => node.name === "actor:1:1:authored:FIGHTER_" + name);
    assert.equal(marker("stagger").isEnabled(), false);
    assert.equal(marker("fall").isEnabled(), false);
    const damage = Object.freeze({ key: "damage", kind: ABI.EVENT_DAMAGE, x: 2.5, y: 0.5,
      amount: 1, actorIndex: 1, otherIndex: 2, aux0: 0, aux1: 0 });
    actors.acceptSnapshot(snapshot({ tick: 2, units: Object.freeze([fighter]), events: Object.freeze([damage]) }));
    assert.equal(marker("stagger").isEnabled(), true,
      "damage can open stagger only when its published actor index names the body");
    const staggerGroup = scene.animationGroups.find(
      (group) => group.name === "actor:1:1:authored:FIGHTER_stagger");
    assert.ok(staggerGroup?.isStarted && staggerGroup.animatables.length > 0,
      "the published damage event must activate the authored stagger clip");
    actors.acceptSnapshot(snapshot({ tick: 3, units: Object.freeze([fighter]), events: Object.freeze([]) }));
    assert.equal(marker("stagger").isEnabled(), false,
      "health and elapsed presentation time alone cannot keep a reaction open");
    assert.equal(staggerGroup.isStarted, false, "leaving the event must stop the reaction group");

    const rogue = unit({ key: "2:1", index: 2, kind: 1, x: 2.5 });
    actors.acceptSnapshot(snapshot({ tick: 4, units: Object.freeze([fighter, rogue]) }));
    assert.equal(scene.meshes.some((mesh) => mesh.name.startsWith("actor:2:1:authored:")), false);
    assert.equal(scene.meshes.filter((mesh) => mesh.name.startsWith("actor:2:1:") && !mesh.isDisposed()).length,
      rendererFigure.FIGURE_UPRIGHT_PARTS + 1, "an unsupported kind keeps the procedural dress and cue");

    const retired = [...authored];
    actors.acceptSnapshot(snapshot({ tick: 5, units: Object.freeze([
      unit({ ...fighter, visible: false }), unit({ ...rogue, visible: false }),
    ]) }));
    assert.deepEqual(actors.keys(), []);
    assert.ok(retired.every((mesh) => mesh.isDisposed()), "fog must dispose every authored mesh");
    assert.equal(casters.size, 0, "fog must remove every authored shadow caster");
    assert.deepEqual(actors.counts(), {
      meshes: 0, shadows: 0, labels: 0, effects: 0, audio: 0, picking: 0, debug: 0,
    });
    actors.dispose();
    asset.dispose();
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("first_person_hides_only_self_occluding_dress", async () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const debug = new rendererDebug.RendererDebugRegistry();
  const casters = new Set();
  const shadows = { addShadowCaster(mesh) { casters.add(mesh); }, removeShadowCaster(mesh) { casters.delete(mesh); } };
  try {
    const asset = await combatantAssets.loadCombatantAsset(scene, new AbortController().signal,
      (url) => Promise.resolve(combatantResponse(url)));
    const actors = new rendererActors.ActorPresentation(scene, debug, shadows, asset);
    const fighter = unit({ kind: 0, x: 2.5, visible: true, slot0Action: 2, slot1Action: 4 });
    actors.acceptSnapshot(snapshot({ units: Object.freeze([fighter]) }));
    const authored = scene.meshes.filter((mesh) =>
      mesh.name.startsWith("actor:1:1:authored:FIGHTER_lod_"));
    const procedural = scene.meshes.filter((mesh) => mesh.name.startsWith("actor:1:1:") &&
      !mesh.name.startsWith("actor:1:1:authored:") && mesh.name !== "actor:1:1:marker:ring");
    const ring = scene.meshes.find((mesh) => mesh.name === "actor:1:1:marker:ring");
    const identities = new Set(scene.meshes);
    const authoredEnabled = new Set(authored.filter((mesh) => mesh.isEnabled()));
    assert.ok(authoredEnabled.size > 0);
    actors.setPresentationMode("geometry");
    assert.ok(authored.every((mesh) => !mesh.isEnabled()));
    const geometryEnabled = procedural.filter((mesh) => mesh.isEnabled());
    assert.ok(geometryEnabled.length >= 8,
      `Geometry enables the readable body; got ${geometryEnabled.map((mesh) => mesh.name)}`);
    for (const suffix of ["hitbox", "facing", "reach"]) {
      assert.ok(geometryEnabled.some((mesh) => mesh.name.endsWith(":diagnostic:" + suffix)),
        `Geometry must expose the authoritative ${suffix} overlay`);
    }
    assert.ok(geometryEnabled.some((mesh) => mesh.name.endsWith(":head"))
      && geometryEnabled.some((mesh) => mesh.name.endsWith(":torso"))
      && geometryEnabled.some((mesh) => mesh.name.includes(":arm:")),
    "Geometry must expose named body regions instead of one undifferentiated proxy");
    assert.equal(ring.isEnabled(), true);
    assert.equal(casters.size, procedural.length);
    actors.setPresentationMode("first_person");
    actors.acceptSnapshot(snapshot({ tick: 2, units: Object.freeze([fighter]) }));
    const high = authored.filter((mesh) => mesh.name.includes("_lod_high_mesh_"));
    const highEnabled = new Set(high.filter((mesh) => mesh.isEnabled()));
    for (const mesh of highEnabled) {
      mesh.computeWorldMatrix(true);
      mesh.refreshBoundingInfo(true);
      const centre = mesh.getBoundingInfo().boundingBox.centerWorld;
      const horizontal = Math.hypot(centre.x - fighter.x, centre.z - fighter.y);
      assert.ok(horizontal <= fighter.radius * 3,
        `${mesh.name} escaped its actor envelope at high LOD by ${horizontal.toFixed(3)}`);
    }
    const hidden = high.filter((mesh) => !mesh.isEnabled()).filter((mesh) => {
      const semantic = mesh.name.match(/_mesh_(.+)$/)?.[1] ?? "";
      return combatantDress.combatantMeshRole(semantic) === "head" ||
        combatantDress.combatantMeshRole(semantic) === "torso";
    });
    assert.ok(hidden.length > 0 && hidden.every((mesh) => {
      const semantic = mesh.name.match(/_mesh_(.+)$/)?.[1] ?? "";
      const role = combatantDress.combatantMeshRole(semantic);
      return role === "head" || role === "torso";
    }));
    assert.ok(highEnabled.size > 0, "high-detail arms and equipment remain visible in first person");
    actors.setPresentationMode("world");
    assert.deepEqual(new Set(authored.filter((mesh) => mesh.isEnabled())), new Set(high));
    assert.ok(procedural.every((mesh) => !mesh.isEnabled()));
    assert.ok([...identities].every((mesh) => scene.meshes.includes(mesh)), "mode switching reuses mesh identity");
    assert.equal(casters.size, high.length);
    actors.dispose(); asset.dispose();
  } finally { scene.dispose(); engine.dispose(); }
});

test("combatant_closure_bounds_and_late_abort_failures_dispose_the_unpublished_container", async () => {
  const run = async (mutate, pattern) => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    let disposals = 0;
    try {
      await assert.rejects(combatantAssets.loadCombatantAsset(scene, new AbortController().signal,
        (url) => Promise.resolve(combatantResponse(url)), async (bytes, target, options) => {
          const container = await LoadAssetContainerAsync(bytes, target, options);
          const dispose = container.dispose.bind(container);
          container.dispose = () => { disposals++; dispose(); };
          mutate(container);
          return container;
        }), pattern);
      assert.equal(disposals, 1);
    } finally {
      scene.dispose();
      engine.dispose();
    }
  };
  await run((container) => container.skeletons.push({ name: "FOREIGN_skeleton", dispose() {} }),
    /skeleton closure/);
  await run((container) => {
    const mesh = container.meshes.find(({ name }) =>
      name === "FIGHTER_lod_high_mesh_pelvis_skirt");
    mesh.getBoundingInfo = () => ({ boundingBox: {
      minimum: { x: -99, y: 0, z: 0 }, maximum: { x: 0, y: 0, z: 0 },
    } });
  }, /fighter high mesh pelvis_skirt bounds/);

  const engine = new NullEngine();
  const scene = new Scene(engine);
  const controller = new AbortController();
  let disposals = 0;
  try {
    await assert.rejects(combatantAssets.loadCombatantAsset(scene, controller.signal,
      (url) => Promise.resolve(combatantResponse(url)), async (bytes, target, options) => {
        const container = await LoadAssetContainerAsync(bytes, target, options);
        const dispose = container.dispose.bind(container);
        container.dispose = () => { disposals++; dispose(); };
        controller.abort();
        return container;
      }), /abort/);
    assert.equal(disposals, 1);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

function fakeRoomContainer(sidecar) {
  let disposals = 0;
  const vector = ([x, y, z]) => ({ x, y, z });
  const quaternion = ([x, y, z, w]) => ({ x, y, z, w });
  const materialCompiles = [];
  const floorTexture = { name: "floor_current (Base Color)" };
  const wallTexture = { name: "stone_current (Base Color)" };
  const woodTexture = { name: "wood_current (Base Color)" };
  const overburdenTexture = { name: "overburden_current (Base Color)" };
  const normalTextures = new Map(["floor_current", "stone_current", "wood_current", "overburden_current"]
    .map((name) => [name, { name: `${name} (Normal)` }]));
  const metallicTextures = new Map(["floor_current", "stone_current", "wood_current", "overburden_current"]
    .map((name) => [name, { name: `${name} (Metallic Roughness)` }]));
  const materials = new Map([
    "floor_current", "stone_current", "wood_current", "metal_current", "overburden_current",
  ].map((name) => [name, {
    name,
    albedoTexture: name === "floor_current" ? floorTexture : name === "stone_current" ? wallTexture :
      name === "wood_current" ? woodTexture : name === "overburden_current" ? overburdenTexture : null,
    bumpTexture: normalTextures.get(name) ?? null,
    metallicTexture: metallicTextures.get(name) ?? null,
    forceCompilationAsync(mesh, options) {
      materialCompiles.push([name, mesh.name, options]);
      return Promise.resolve();
    },
  }]));
  const identity = () => ({ position: vector([0, 0, 0]), rotation: vector([0, 0, 0]),
    rotationQuaternion: quaternion([0, 0, 0, 1]), scaling: vector([1, 1, 1]) });
  const root = { name: "__root__", ...identity(), parent: null, material: null,
    getTotalVertices: () => 0 };
  const meshes = sidecar.pieces.map((piece) => ({
    name: piece.node, ...identity(), parent: root, material: materials.get(piece.materialRole),
    isVisible: true, isPickable: true, receiveShadows: true, subMeshes: [{}],
    createInstance() {}, getTotalVertices: () => piece.vertexCount,
    getVerticesData: () => Array.from({ length: piece.vertexCount * 4 }, (_value, index) => index % 4 === 3 ? 1 : 0.5),
    getTotalIndices: () => piece.triangleCount * 3,
    getBoundingInfo: () => ({ boundingBox: {
      minimum: vector(piece.bounds.min), maximum: vector(piece.bounds.max),
    } }),
  }));
  const torch = meshes.find((mesh) => mesh.name === "ROOM_torch_bracket");
  const socketContract = sidecar.sockets[0];
  const socket = { name: "SOCKET_torch_flame", parent: torch,
    position: vector(socketContract.translation), rotation: vector([0, 0, 0]),
    rotationQuaternion: quaternion(socketContract.rotation), scaling: vector([1, 1, 1]) };
  const container = {
    meshes: [root, ...meshes], transformNodes: [socket], rootNodes: [root],
    materials: [...materials.values()], geometries: sidecar.pieces.map(({ node: id }) => ({ id })),
    cameras: [], lights: [], textures: [floorTexture, wallTexture, woodTexture, overburdenTexture,
      ...normalTextures.values(), ...metallicTextures.values()],
    skeletons: [], animations: [], animationGroups: [],
    particleSystems: [], multiMaterials: [], morphTargetManagers: [], actionManagers: [], postProcesses: [],
    sounds: [], effectLayers: [], layers: [], reflectionProbes: [], lensFlareSystems: [],
    proceduralTextures: [], spriteManagers: [], environmentTexture: null,
    addAllToScene() { this.wasAddedToScene = true; },
    dispose() { disposals++; this.wasAddedToScene = false; },
  };
  return { container, materialCompiles, get disposals() { return disposals; } };
}

test("room_asset_loading_rejects_undeclared_resources_and_mismatched_geometry_before_publication", async () => {
  const sidecarBytes = fs.readFileSync(path.join(ROOT, "web", "assets3d", "room_slice.json"));
  const glbBytes = fs.readFileSync(path.join(ROOT, "web", "assets3d", "room_slice.glb"));
  const sidecar = roomAssetContract.parseRoomAssetSidecar(sidecarBytes);
  const fetcher = async (url) => {
    const bytes = String(url).endsWith(".glb") ? glbBytes : sidecarBytes;
    return new Response(bytes, { status: 200, headers: {
      "content-type": String(url).endsWith(".glb") ? "model/gltf-binary" : "application/json",
    } });
  };
  const corruptions = [
    (container) => container.meshes.push({ ...container.meshes[0], name: "foreign_mesh" }),
    (container) => container.transformNodes.push({ ...container.transformNodes[0], name: "foreign_node" }),
    (container) => container.textures.push({ name: "external.png" }),
    (container) => { container.meshes[1].material = container.materials[0]; },
    (container) => { container.meshes[1].getVerticesData = () => [0, 0, 0, 0.5]; },
    (container) => { container.meshes[1].getTotalVertices = () => 1; },
    (container) => { container.meshes[1].getBoundingInfo = () => ({ boundingBox: {
      minimum: { x: -99, y: 0, z: 0 }, maximum: { x: 0, y: 0, z: 0 },
    } }); },
    (container) => { container.meshes[1].position.x = 1; },
    (container) => { container.transformNodes[0].position.y += 1; },
  ];
  for (const corrupt of corruptions) {
    const fake = fakeRoomContainer(sidecar);
    corrupt(fake.container);
    await assert.rejects(roomAssets.loadRoomAsset({}, new AbortController().signal, fetcher,
      async () => fake.container), /representative room asset failed/);
    assert.equal(fake.disposals, 1);
  }
});

test("room_asset_loading_verifies_mime_magic_hash_and_semantics_before_attachment", async () => {
  const sidecarBytes = fs.readFileSync(path.join(ROOT, "web", "assets3d", "room_slice.json"));
  const glbBytes = fs.readFileSync(path.join(ROOT, "web", "assets3d", "room_slice.glb"));
  const sidecar = roomAssetContract.parseRoomAssetSidecar(sidecarBytes);
  const fake = fakeRoomContainer(sidecar);
  const requests = [];
  const fetcher = async (url, init) => {
    requests.push([url, init]);
    const glb = String(url).endsWith(".glb");
    const bytes = glb ? glbBytes : sidecarBytes;
    return new Response(bytes, { status: 200, headers: {
      "content-type": glb ? "model/gltf-binary" : "application/json; charset=utf-8",
      "content-length": String(bytes.byteLength),
    } });
  };
  let loaderCall = null;
  const asset = await roomAssets.loadRoomAsset({}, new AbortController().signal, fetcher,
    async (bytes, scene, options) => {
      loaderCall = { bytes, scene, options };
      return fake.container;
    });
  assert.deepEqual(requests.map(([url]) => url), ["/assets3d/room_slice.json", "/assets3d/room_slice.glb"]);
  assert.ok(requests.every(([, init]) => init.credentials === "same-origin" && init.signal instanceof AbortSignal));
  assert.equal(loaderCall.bytes.byteLength, glbBytes.byteLength);
  assert.deepEqual(loaderCall.options, { pluginExtension: ".glb", name: "room_slice.glb" });
  assert.equal(fake.container.wasAddedToScene, true);
  assert.deepEqual(fake.materialCompiles.map(([name, _mesh, options]) => [name, options]).sort(), [
    ["floor_current", { useInstances: true }],
    ["stone_current", { useInstances: true }],
    ["wood_current", { useInstances: true }],
    ["metal_current", { useInstances: true }],
    ["overburden_current", { useInstances: true }],
  ].sort());
  assert.ok([...asset.pieces.values()].every((mesh) => !mesh.isVisible && !mesh.isPickable && !mesh.receiveShadows));
  asset.dispose();
  asset.dispose();
  assert.equal(fake.disposals, 1);
});

test("the_pinned_room_glb_loads_into_one_hidden_semantic_babylon_container", async () => {
  const { NullEngine } = await import("@babylonjs/core/Engines/nullEngine.js");
  const { Scene } = await import("@babylonjs/core/scene.js");
  const { VertexBuffer } = await import("@babylonjs/core/Buffers/buffer.js");
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const sidecarBytes = fs.readFileSync(path.join(ROOT, "web", "assets3d", "room_slice.json"));
  const glbBytes = fs.readFileSync(path.join(ROOT, "web", "assets3d", "room_slice.glb"));
  const asset = await roomAssets.loadRoomAsset(scene, new AbortController().signal, async (url) => {
    const glb = String(url).endsWith(".glb");
    const bytes = glb ? glbBytes : sidecarBytes;
    return new Response(bytes, { status: 200, headers: {
      "content-type": glb ? "model/gltf-binary" : "application/json",
      "content-length": String(bytes.byteLength),
    } });
  });
  assert.equal(asset.pieces.size, 18);
  assert.equal(asset.materials.size, 5);
  assert.equal(asset.socket.name, "SOCKET_torch_flame");
  assert.ok([...asset.pieces.values()].every((mesh) => !mesh.isVisible && !mesh.isPickable));
  for (const mesh of asset.pieces.values()) {
    const colours = mesh.getVerticesData(VertexBuffer.ColorKind);
    assert.equal(colours?.length, mesh.getTotalVertices() * 4);
    assert.ok(colours.every((value, index) => index % 4 !== 3 || Math.abs(value - 1) < 0.00001),
      `${mesh.name} vertex colour alpha must stay opaque`);
  }
  const styledInstance = asset.pieces.get("floor_a").createInstance("styled-real-glb-instance");
  assert.equal(styledInstance.isVerticesDataPresent(VertexBuffer.ColorKind), true,
    "classic instances must retain the source COLOR_0 styling buffer");
  styledInstance.dispose();
  assert.ok([...asset.pieces.values()].every((mesh) => scene.meshes.includes(mesh)));
  assert.ok([...asset.materials.values()].every((material) => scene.materials.includes(material)));
  asset.dispose();
  assert.ok([...asset.pieces.values()].every((mesh) => !scene.meshes.includes(mesh)));
  assert.ok([...asset.materials.values()].every((material) => !scene.materials.includes(material)));
  scene.dispose();
  engine.dispose();
});

test("room_asset_loading_rejects_external_substitution_and_disposes_late_containers", async () => {
  const sidecarBytes = fs.readFileSync(path.join(ROOT, "web", "assets3d", "room_slice.json"));
  const glbBytes = fs.readFileSync(path.join(ROOT, "web", "assets3d", "room_slice.glb"));
  const changed = Buffer.from(sidecarBytes);
  changed[changed.length - 2] ^= 1;
  let loaderCalls = 0;
  await assert.rejects(roomAssets.loadRoomAsset({}, new AbortController().signal, async (url) => {
    const bytes = String(url).endsWith(".glb") ? glbBytes : changed;
    return new Response(bytes, { status: 200, headers: {
      "content-type": String(url).endsWith(".glb") ? "model/gltf-binary" : "application/json",
    } });
  }, async () => { loaderCalls++; throw new Error("must not load"); }), /sidecar hash/);
  assert.equal(loaderCalls, 0);

  const sidecar = roomAssetContract.parseRoomAssetSidecar(sidecarBytes);
  const fake = fakeRoomContainer(sidecar);
  const controller = new AbortController();
  let release;
  let entered;
  const loaderEntered = new Promise((resolve) => { entered = resolve; });
  const waiting = new Promise((resolve) => { release = resolve; });
  const loading = roomAssets.loadRoomAsset({}, controller.signal, async (url) => {
    const bytes = String(url).endsWith(".glb") ? glbBytes : sidecarBytes;
    return new Response(bytes, { status: 200, headers: {
      "content-type": String(url).endsWith(".glb") ? "model/gltf-binary" : "application/json",
    } });
  }, async () => { entered(); return waiting; });
  await loaderEntered;
  controller.abort();
  release(fake.container);
  await assert.rejects(loading, /abort/);
  assert.equal(fake.disposals, 1);
});

// ------------------------------------------------------------------- the arena stage

const RAW = 65536;
const raw = (...values) => values.map((value) => Math.round(value * RAW));

/**
 * One articulated body with the shape `crates/lab/src/trace.rs` publishes.
 *
 * The numbers are `web/fight.json`'s Fighter rounded to three places -- a head
 * capsule that is a point at 1.700 under a `standingHeight` of 1.800, a torso
 * reaching 1.500 at radius 0.350, a shield held out at hip height -- because the
 * two facts these tests turn on, that the eye is inside both of those capsules
 * and that the guard is far below a level gaze, are facts about that anatomy and
 * not about a convenient fixture.
 */
function arenaPose(values = {}) {
  const { index = 0, x = 7, y = 6, yaw = 0, severed = 0, shield = true } = values;
  const region = (lower, upper, radius) => ({ lower: raw(...lower), upper: raw(...upper), radius: Math.round(radius * RAW), present: true });
  const left = [x, y + 0.25, 0.9];
  const right = [x, y - 0.25, 0.9];
  return {
    id: [index, 0], body: raw(x, y, 0), yaw, vel: [0, 0, 0],
    arms: [
      { hand: raw(x + 0.2, y + 0.25, 0.9), vel: [0, 0, 0], target: raw(x + 0.2, y + 0.25, 0.9), fatigue: 0 },
      { hand: raw(x + 0.2, y - 0.25, 0.9), vel: [0, 0, 0], target: raw(x + 0.2, y - 0.25, 0.9), fatigue: 0 },
    ],
    weapons: [null, { hilt: raw(...right), tip: raw(x + 1.15, y - 0.25, 0.9), radius: Math.round(0.04 * RAW) }],
    shield: shield ? {
      centre: raw(x + 0.2, y + 0.25, 0.9), normal: raw(1, 0, 0),
      halfWidth: Math.round(0.25 * RAW), halfHeight: Math.round(0.25 * RAW),
      thickness: Math.round(0.05 * RAW),
    } : null,
    regions: [
      region([x, y, 1.7], [x, y, 1.7], 0.2),
      region([x, y, 0.7], [x, y, 1.5], 0.35),
      region([x, y + 0.25, 1.4], left, 0.15),
      region([x, y - 0.25, 1.4], right, 0.15),
      region([x, y, 0], [x, y, 0.8], 0.3),
    ],
    integrity: [RAW, RAW, RAW, RAW, RAW], wound: [0, 0, 0, 0, 0],
    blood: RAW, shock: 0, severed, equipmentMask: 6,
    intent: "attack", target: null, hints: [0, 0],
  };
}

const arenaHeader = () => ({
  one: RAW, scenario: "articulated-duel-v1", mirrored: false, fingerprint: "0x0", seed: 3,
  heroes: "composed", monsters: "composed", checkpoint: null, outcome: "Decision(Heroes)",
  timedOut: true, ticks: 2, maxTicks: 3600, arena: raw(24, 16), frameCount: 3, truncated: false,
  impactThreshold: 3932, contactEnergyFloor: 144,
  regionNames: ["head", "torso", "leftArm", "rightArm", "legs"],
  hintNames: ["idle"],
  contactKinds: ["weaponWeapon", "weaponShield", "weaponBody", "projectileBody"],
  bodySlot: 255, noRegion: 255,
  bodies: [0, 1].map((index) => ({
    index, kind: index === 0 ? "Fighter" : "Brute", faction: index === 0 ? "Heroes" : "Monsters",
    anatomy: {
      standingHeight: raw(1.8)[0], shoulderHeight: raw(1.4)[0], shoulderHalfWidth: raw(0.25)[0],
      armLength: raw(0.75)[0], handRadius: raw(0.1)[0],
    },
    carried: [],
  })),
});

const arenaView = (poses, values = {}) => {
  const frame = {
    t: values.t ?? 0, poses, projectiles: values.projectiles ?? [],
    contacts: values.rows ?? [], health: [RAW, RAW],
  };
  return {
    header: arenaHeader(), frame, next: values.next ?? frame, alpha: values.alpha ?? 0,
    focus: values.focus ?? [poses[0].body[0], poses[0].body[1], 0], span: values.span ?? 6 * RAW,
    azimuth: values.azimuth ?? 0, contacts: values.contacts ?? false,
  };
};

/** One published contact fact, with the fields the 3D panels read off it. */
const arenaContact = (kind, point, normal = [0, 1, 0]) => ({
  a: [0, 0], aSlot: 1, b: [1, 0], bSlot: 255, kind, region: 1,
  point: raw(...point), normal: raw(...normal),
  velocityA: [0, 0, 0], velocityB: [0, 0, 0], impulseA: [0, 0, 0], impulseB: [0, 0, 0],
  toi: 0, group: 0, alpha: RAW, groupBefore: 0, groupAfter: 0, groupDissipated: 0,
  cut: 0, thrust: 0, pressure: 0, deflected: 0, severed: false,
});

async function arenaStageHarness() {
  const { NullEngine } = await import("@babylonjs/core/Engines/nullEngine.js");
  const engine = new NullEngine({ renderWidth: 1280, renderHeight: 720 });
  const debug = new rendererDebug.RendererDebugRegistry();
  const built = arenaScene.createArenaContent(engine, debug);
  return { engine, debug, ...built };
}

test("the_arena_axis_mapping_is_a_rotation_rather_than_a_mirror_of_the_world", () => {
  const { scenePoint, sceneForward, sceneYaw } = arenaGeometry;
  // World `(x, y, height)` becomes scene `(x, height, -y)`.
  assert.deepEqual(scenePoint(raw(1, 2, 3)), [1, 3, -2]);

  // The determinant of the mapping is the whole handedness argument. Copying
  // `render/actors.ts`'s `(x, y) -> (x, z)` into a right-handed scene gives -1,
  // which is a mirror, which puts a Fighter's shield on the wrong side of its
  // body in the 3/4 view while the plan beside it has it right.
  const rows = [scenePoint(raw(1, 0, 0)), scenePoint(raw(0, 1, 0)), scenePoint(raw(0, 0, 1))];
  const det = rows[0][0] * (rows[1][1] * rows[2][2] - rows[1][2] * rows[2][1])
    - rows[0][1] * (rows[1][0] * rows[2][2] - rows[1][2] * rows[2][0])
    + rows[0][2] * (rows[1][0] * rows[2][1] - rows[1][1] * rows[2][0]);
  assert.equal(det, 1, "the world-to-scene map must be a rotation, not a reflection");

  // `actuator::shoulder` puts LeftArm on the +90 degree side, so world +y is a
  // body's anatomical left, and in a right-handed scene left is up cross forward.
  const up = scenePoint(raw(0, 0, 1));
  const forward = sceneForward(0);
  const cross = [
    up[1] * forward[2] - up[2] * forward[1],
    up[2] * forward[0] - up[0] * forward[2],
    up[0] * forward[1] - up[1] * forward[0],
  ];
  assert.deepEqual(cross.map((value) => Math.round(value * 1e6) / 1e6), scenePoint(raw(0, 1, 0)));

  // Yaw is not negated here, unlike the greybox, and it cannot be: Babylon's
  // `rotation.y` takes local +x to `(cos, 0, -sin)` and so does this mapping.
  assert.equal(sceneYaw(RAW / 4), Math.PI / 2);
  const quarter = sceneForward(RAW / 4).map((value) => Math.round(value * 1e6) / 1e6);
  assert.deepEqual(quarter, scenePoint(raw(0, 1, 0)), "a quarter turn must face world +y");
});

test("the_stage_viewports_match_the_css_that_labels_them", async () => {
  const css = fs.readFileSync(path.join(ROOT, "web", "index.html"), "utf8");
  const percent = (pattern) => {
    const found = pattern.exec(css);
    assert.ok(found, `web/index.html has no ${pattern}`);
    return Number(found[1]) / 100;
  };
  // The 3/4 label and the mode buttons hang off the same column split, and the
  // second first-person label off the row split. The CSS says the two must move
  // together with the cameras; this is what makes that true rather than hoped.
  // The fraction is read whole, decimal point and all: `(\d+)` captured 28 out
  // of `calc(28.5% + .5rem)` and passed, which is a label half a panel out of
  // place reported as agreement.
  const column = percent(/#label-three-quarter\s*\{[^}]*left:\s*calc\((\d+(?:\.\d+)?)%/);
  const buttons = percent(/\.stage-modes\s*\{[^}]*left:\s*calc\((\d+(?:\.\d+)?)%/);
  const row = percent(/#label-first-b\s*\{[^}]*top:\s*calc\((\d+(?:\.\d+)?)%/);
  assert.equal(column, arenaGeometry.STAGE_COLUMN_SPLIT);
  assert.equal(buttons, arenaGeometry.STAGE_COLUMN_SPLIT);
  assert.equal(row, arenaGeometry.STAGE_FIRST_PERSON_SPLIT);

  // Babylon counts from the bottom left and the labels from the top left, so
  // the panel labelled first is the one with the offset `y`.
  const { firstPersonA, firstPersonB, threeQuarter } = arenaGeometry.ARENA_VIEWPORTS;
  assert.deepEqual(firstPersonA, { x: 0, y: 0.5, width: 0.28, height: 0.5 });
  assert.deepEqual(firstPersonB, { x: 0, y: 0, width: 0.28, height: 0.5 });
  assert.deepEqual(threeQuarter, { x: 0.28, y: 0, width: 0.72, height: 1 });
  // Tiled with no gap and no overlap: a seam would show the clear colour and a
  // reader would read it as a panel that had stopped drawing.
  const area = (rect) => rect.width * rect.height;
  assert.equal(area(firstPersonA) + area(firstPersonB) + area(threeQuarter), 1);
  assert.equal(firstPersonA.y + firstPersonA.height, 1);
  assert.equal(threeQuarter.x, firstPersonA.x + firstPersonA.width);

  // **Which camera got which rectangle, and in what order they draw.** Every
  // assertion above is about the numbers; swapping the two first-person
  // rectangles between the two cameras satisfies all of them and puts each
  // fighter's eye under the other one's label. The draw order matters for its
  // own reason: Babylon clears the colour buffer for the first active camera
  // and only depth for the rest, so a list that did not start at a corner would
  // clear a rectangle over something already drawn.
  const harness = await arenaStageHarness();
  const { content, scene, engine } = harness;
  const rect = (camera) => ({
    x: camera.viewport.x, y: camera.viewport.y,
    width: camera.viewport.width, height: camera.viewport.height,
  });
  assert.deepEqual(rect(content.firstPerson[0]), firstPersonA);
  assert.deepEqual(rect(content.firstPerson[1]), firstPersonB);
  assert.deepEqual(rect(content.threeQuarter), threeQuarter);
  assert.deepEqual(scene.activeCameras.map((camera) => camera.name),
    ["arena-first-person-0", "arena-first-person-1", "arena-three-quarter"]);
  content.dispose();
  scene.dispose();
  engine.dispose();
});

test("the_first_person_eye_is_the_published_head_capsule_and_not_the_anatomy_row", () => {
  const pose = arenaPose();
  const header = arenaHeader();
  // `body_region_volumes` builds the head with coincident endpoints, so its
  // extent is entirely its radius and `AnatomyRegionSpec::half_height` is dead
  // for that region. Taking the eye off the anatomy row instead would sit it a
  // tenth of a body out, every tick, in the one panel where that is the whole
  // picture.
  assert.deepEqual(arenaGeometry.eyeOf(pose), raw(7, 6, 1.7));
  assert.notEqual(arenaGeometry.eyeOf(pose)[2], header.bodies[0].anatomy.standingHeight);
  assert.notEqual(arenaGeometry.eyeOf(pose)[2], header.bodies[0].anatomy.shoulderHeight);

  // The head is a point, so it draws as one sphere; a real capsule draws as two
  // spheres and a shaft, because a Babylon capsule scaled along its own axis
  // squashes exactly the caps the contact phase swept.
  const head = arenaGeometry.capsuleParts(pose.regions[0].lower, pose.regions[0].upper, pose.regions[0].radius);
  assert.deepEqual([head.upper, head.shaft], [null, null]);
  // A raw radius is an integer count of 65536ths, so 0.2 is 13107 and comes
  // back a shade under. Divided once and never rounded, which is the rule.
  assert.ok(Math.abs(head.radius - 0.2) < 1e-4);
  const torso = arenaGeometry.capsuleParts(pose.regions[1].lower, pose.regions[1].upper, pose.regions[1].radius);
  assert.ok(torso.shaft !== null);
  assert.deepEqual(torso.shaft.direction, [0, 1, 0]);
  assert.ok(Math.abs(torso.shaft.length - 0.8) < 1e-4);
});

test("a_severed_or_absent_region_leaves_no_mesh_and_no_count_behind", async () => {
  const harness = await arenaStageHarness();
  const { content, scene, engine, debug } = harness;
  content.show(arenaView([arenaPose()]));
  const held = () => content.keys().filter((key) => /^0:(region:2|hand:0|weapon:0|shield)/.test(key));
  assert.deepEqual(held(),
    ["0:hand:0", "0:region:2:lower", "0:region:2:shaft", "0:region:2:upper", "0:shield"]);
  const armMesh = scene.getMeshByName("arena:0:region:2:shaft");
  assert.ok(armMesh);

  // **Everything the arm was carrying goes with it**, which is the half this
  // test asserted nothing about while its name claimed both. `Pose` publishes a
  // `PosedArm` row for a severed limb, so gating only the five region capsules
  // leaves a hand sphere and a gold plate floating with nothing between them and
  // the shoulder -- shapes nothing swept, in the one mode whose whole contract
  // is that it draws only what the simulation published.
  content.show(arenaView([arenaPose({ severed: 1 << 2 })]));
  assert.deepEqual(held(), []);
  assert.equal(armMesh.isDisposed(), true);
  // The other arm, which lost nothing, keeps its capsule, its hand and its
  // weapon -- so this is severance rather than a body that stopped drawing.
  assert.deepEqual(content.keys().filter((key) => key.startsWith("0:region:3")).length, 3);
  assert.ok(content.keys().includes("0:hand:1"));
  assert.ok(content.keys().includes("0:weapon:1:shaft"));

  // The right arm is the one carrying a weapon on this fixture, so severing it
  // is the only way to check that a weapon goes with its arm at all: gate the
  // hand and the shield and leave the weapon, and every assertion above still
  // passes, because limb 0's weapon is null and short-circuits first.
  content.show(arenaView([arenaPose({ severed: 1 << 3 })]));
  assert.deepEqual(content.keys().filter((key) => key.startsWith("0:weapon")), []);
  assert.equal(content.keys().includes("0:hand:1"), false);
  assert.ok(content.keys().includes("0:hand:0"), "the intact arm keeps its hand");
  assert.ok(content.keys().includes("0:shield"), "the intact arm keeps its shield");

  // **And `present: false`, which the name has always promised and which no
  // fixture exercises**: all three recordings carry zero `severed` bits and no
  // absent region, so this is the only place the rule is checked at all. It is
  // the same rule -- a region the body does not have and a region it no longer
  // has are both regions that are not drawn.
  const absent = arenaPose();
  absent.regions[2] = { ...absent.regions[2], present: false };
  content.show(arenaView([absent]));
  assert.deepEqual(held(), []);
  assert.equal(arenaGeometry.regionDrawn(absent, 2), false);
  assert.equal(arenaGeometry.armDrawn(absent, 0), false);
  assert.equal(arenaGeometry.armDrawn(absent, 1), true);

  // The shield is found by its holder rather than by a slot number: its
  // published `centre` is that arm's published `hand`, exactly, because
  // `derive_shield_pose` writes one from the other.
  assert.equal(arenaGeometry.shieldLimb(absent, absent.shield), 0);
  assert.equal(arenaGeometry.shieldLimb(absent, { ...absent.shield, centre: raw(0, 0, 0) }), null);

  content.show(arenaView([arenaPose()]));
  const before = content.counts().instances;
  content.clear();
  assert.deepEqual(content.keys(), []);
  assert.ok(before > 0);
  assert.equal(debug.snapshot().instances, 0);
  content.dispose();
  assert.deepEqual(debug.snapshot(), {
    meshes: 0, instances: 0, draws: 0, triangles: 0, lights: 0, shadowCasters: 0,
    visibility: { geometry: 0, units: 0, shots: 0, events: 0, furniture: 0,
      effects: 0, audio: 0, picking: 0, debug: 0 },
  });
  scene.dispose();
  engine.dispose();
});

test("a_body_never_draws_the_head_and_torso_its_own_eye_is_inside_of", async () => {
  const harness = await arenaStageHarness();
  const { content, scene, engine } = harness;
  content.show(arenaView([arenaPose({ index: 0 }), arenaPose({ index: 1, x: 11 })]));
  const visible = (name, camera) => {
    const mesh = scene.getMeshByName(name);
    assert.ok(mesh, `${name} is missing`);
    return (mesh.layerMask & camera.layerMask) !== 0;
  };
  for (const slot of [0, 1]) {
    const own = content.firstPerson[slot];
    const other = content.firstPerson[1 - slot];
    // The eye is the head capsule's centre and the torso reaches within 0.200 of
    // it at radius 0.350, so this camera stands inside both. A capsule you are
    // inside of is a wall of colour or nothing at all, never a view.
    assert.equal(visible(`arena:${slot}:region:0:lower`, own), false);
    assert.equal(visible(`arena:${slot}:region:1:shaft`, own), false);
    // Everything else about itself stays: the arms, the legs, the hands, the
    // weapon and the shield are what the panel exists to show.
    assert.equal(visible(`arena:${slot}:region:2:shaft`, own), true);
    assert.equal(visible(`arena:${slot}:hand:0`, own), true);
    assert.equal(visible(`arena:${slot}:shield`, own), true);
    // And nothing is hidden from anybody else's eyes or from the 3/4 view.
    assert.equal(visible(`arena:${slot}:region:0:lower`, other), true);
    assert.equal(visible(`arena:${slot}:region:1:shaft`, content.threeQuarter), true);
  }
  content.dispose();
  scene.dispose();
  engine.dispose();
});

test("the_first_person_camera_sits_at_the_eye_and_keeps_one_fixed_mount_angle_at_every_yaw", async () => {
  const { Vector3 } = await import("@babylonjs/core/Maths/math.vector.js");
  const harness = await arenaStageHarness();
  const { content, scene, engine } = harness;
  const pitch = (arenaGeometry.FIRST_PERSON_PITCH_DEGREES * Math.PI) / 180;
  for (const yaw of [0, RAW / 8, RAW / 4, (RAW * 5) / 8, RAW - 1]) {
    content.show(arenaView([arenaPose({ yaw })]));
    const camera = content.firstPerson[0];
    const eye = arenaGeometry.scenePoint(arenaGeometry.eyeOf(arenaPose({ yaw })));
    // Exactly at the eye. `setTarget` would not be: it adds `Epsilon` to
    // `position.z` whenever the target shares it, which for a level gaze is
    // precisely the yaw-zero case every fixture opens on.
    assert.deepEqual([camera.position.x, camera.position.y, camera.position.z], eye);
    // **One constant mount angle and nothing that tracks.** This model has
    // exactly one rotation: no pitch, no roll, no head turn. v2-20's guard
    // height belongs to the arm, so a camera that tilted *to follow a swing*
    // would be showing a degree of freedom the fighter does not have and a
    // reader would believe it. The tilt below is the rig's and is the same
    // number at every yaw, which is what this loop is checking.
    assert.equal(camera.rotation.z, 0, `yaw ${yaw} rolled the camera`);
    camera.getViewMatrix(true);
    const gaze = camera.getTarget().subtract(camera.position).normalize();
    assert.ok(Math.abs(gaze.y + Math.sin(pitch)) < 1e-6,
      `yaw ${yaw} gazes ${gaze.y} rather than the mount's ${-Math.sin(pitch)}`);
    // Turned by the body's own heading, which `sceneForward` states independently
    // of Babylon's rotation convention: the gaze projects onto it exactly.
    const ahead = arenaGeometry.sceneForward(yaw);
    const flat = Math.cos(pitch);
    assert.ok(Math.abs(gaze.x - ahead[0] * flat) < 1e-6, `yaw ${yaw} looks ${gaze.x}`);
    assert.ok(Math.abs(gaze.z - ahead[2] * flat) < 1e-6, `yaw ${yaw} looks ${gaze.z}`);
  }

  // **The frustum, tested the way Babylon clips: rectangular, not conical.**
  // `fovMode` is `FOVMODE_VERTICAL_FIXED`, so a corner is further off the axis
  // than a top edge is, and the projection below is the camera's own -- built by
  // Babylon from the shipped constants and this viewport's aspect -- rather than
  // a second copy of it written here.
  assert.equal(arenaGeometry.FIRST_PERSON_FOV_DEGREES, 90);
  assert.equal(arenaGeometry.FIRST_PERSON_PITCH_DEGREES, 25);
  const camera = content.firstPerson[0];
  assert.ok(Math.abs(camera.fov - (90 * Math.PI) / 180) < 1e-12);
  assert.equal(camera.fovMode, 0, "FOVMODE_VERTICAL_FIXED is what the table was computed against");
  content.show(arenaView([arenaPose({ yaw: 0 })]));
  const eye = arenaGeometry.scenePoint(arenaGeometry.eyeOf(arenaPose({ yaw: 0 })));
  /** A point `below` degrees under a level gaze and `lateral` degrees off it. */
  const guard = (below, lateral, distance = 0.9) => {
    const b = (below * Math.PI) / 180;
    const l = (lateral * Math.PI) / 180;
    const ahead = arenaGeometry.sceneForward(0);
    const right = [-ahead[2], 0, ahead[0]];
    return new Vector3(
      eye[0] + distance * (Math.cos(b) * (Math.cos(l) * ahead[0] + Math.sin(l) * right[0])),
      eye[1] - distance * Math.sin(b),
      eye[2] + distance * (Math.cos(b) * (Math.cos(l) * ahead[2] + Math.sin(l) * right[2])),
    );
  };
  const sees = (point) => {
    camera.getViewMatrix(true);
    const view = camera.getViewMatrix();
    // Behind the camera first: a perspective divide by a negative `w` maps a
    // point behind the eye back inside the unit cube and would read as visible.
    if (Vector3.TransformCoordinates(point, view).z >= 0) return false;
    const ndc = Vector3.TransformCoordinates(point, view.multiply(camera.getProjectionMatrix(true)));
    return Math.abs(ndc.x) <= 1 && Math.abs(ndc.y) <= 1;
  };
  // **Measured directions and not invented ones.** Each row is one real
  // weapon-shield contact out of `web/fight.json`'s 430, as the pair of angles
  // its point makes with the holder's level gaze: the two that fit this frustum
  // most tightly, then the deepest and the shallowest of the population. Both
  // angles of a row come off the same contact -- combining the marginals, the
  // median depression against the widest lateral, would be a direction nothing
  // published and a test of arithmetic rather than of a fight.
  const measured = [
    [51.3, 62.4], // t893: the widest lateral of the fight; needs 89.3 deg here, 139.3 level
    [51.8, 60.8], // t892: the next tightest, 87.9
    [63.9, 22.8], // t1149: the deepest, 81.4 here and 131.4 level
    [31.5, 48.0], // t949: the shallowest, and still 96.3 from a level mount
  ];
  for (const [below, lateral] of measured) {
    assert.equal(sees(guard(below, lateral)), true,
      `a contact ${below} degrees below the gaze and ${lateral} to the side is out of frame`);
  }
  // **The mount angle is what puts them there.** Level, this same lens loses all
  // four -- even the shallowest, which still needs 96.3 degrees from a level
  // mount -- which is the shape of the whole measurement: a level 90 degree
  // camera holds 14% of this fight's contacts and a level 100 degree one 52%,
  // because the guard is held low and the eye is at 1.700. `fight-windmill.json`
  // and `fight-learned.json` each keep one cluster outside even with the mount --
  // 3% and 6% of their contacts -- so this is the configuration that answers
  // nearly always rather than always. The learned figure was 2% until that
  // fixture was re-recorded on 2026-08-11; it is now 3 of 54, at ticks 2490-2492,
  // and they are the *deepest* contacts in that file rather than the widest --
  // 65.9, 64.8 and 63.2 degrees below level, needing 93.6 degrees at this mount.
  // Its cluster is the one exception to "lateral rather than deep".
  const mounted = camera.rotation.x;
  camera.rotation.x = 0;
  for (const [below, lateral] of measured) {
    assert.equal(sees(guard(below, lateral)), false,
      `a level ${arenaGeometry.FIRST_PERSON_FOV_DEGREES} degree camera must lose ${below}/${lateral}`);
  }
  camera.fov = (100 * Math.PI) / 180;
  assert.equal(sees(guard(51.3, 62.4)), false,
    "the level 100 degree camera this replaced must lose the hardest contact of the fight");
  camera.fov = (arenaGeometry.FIRST_PERSON_FOV_DEGREES * Math.PI) / 180;
  camera.rotation.x = mounted;

  // **And the mount is bounded from above by the attacker**, which is the half
  // of the decision the guard numbers alone cannot make. Both bodies stand about
  // 1.17 apart and are about the same height, so the opponent's head never rises
  // more than 9.9 degrees above a level gaze on any of the three fixtures; this
  // is the highest one measured, `fight-learned.json` tick 2483, at 36.1 degrees
  // to the side. It is in frame here and out of frame at the 35 degree mount that
  // would hold a few more contacts -- which is exactly why the mount is not set
  // to 35.
  //
  // The 9.9 is geometry rather than luck and did not move when that fixture was
  // re-recorded: a Brute of `standingHeight` 2.000 against a Fighter's 1.800, at
  // the 1.148 to 1.150 standoff these contacts happen at, is `atan(0.2/1.15)`.
  // The lateral did move -- it read 26.0 degrees at tick 2163 of the superseded
  // recording -- and 36.1 is the harder row of the two, since the frustum is
  // rectangular and a corner is further off the axis than a top edge.
  const opponentHead = guard(-9.9, 36.1, 1.17);
  assert.equal(sees(opponentHead), true, "the highest opponent head must stay in frame");
  camera.rotation.x = -(35 * Math.PI) / 180;
  assert.equal(sees(opponentHead), false, "a 35 degree mount must lose the highest opponent head");
  camera.rotation.x = mounted;

  // Babylon's default `minZ` is 1 and the nearest thing a body draws of its own
  // is its upper arm at 0.218, so this is a value that has to be set at all.
  assert.ok(arenaGeometry.NEAR_PLANE < 0.218 / 10);
  assert.equal(camera.minZ, arenaGeometry.NEAR_PLANE);
  content.dispose();
  scene.dispose();
  engine.dispose();
});

test("the_three_quarter_camera_reads_the_world_the_same_way_round_as_the_plan", async () => {
  const { Vector3 } = await import("@babylonjs/core/Maths/math.vector.js");
  const harness = await arenaStageHarness();
  const { content, scene, engine } = harness;
  const pose = arenaPose({ yaw: 0 });
  content.show(arenaView([pose]));
  const camera = content.threeQuarter;
  const view = camera.getViewMatrix();
  // A right-handed view matrix puts screen right on +x and the eye on +z, so
  // "further from the camera" is a smaller z.
  const seen = (world) => {
    const point = arenaGeometry.scenePoint(world);
    return Vector3.TransformCoordinates(new Vector3(point[0], point[1], point[2]), view);
  };
  const body = seen(pose.body);
  const ahead = seen([pose.body[0] + RAW, pose.body[1], 0]);
  const anatomicalLeft = seen([pose.body[0], pose.body[1] + RAW, 0]);

  // The plan is a bird's eye with x right and **y up**, so a body at yaw zero
  // faces screen right and its left hand is on the far side of it. Both must
  // read the same way here or the two panels disagree about which way the world
  // turns -- which is the exact failure the right-handed scene exists to stop.
  assert.ok(ahead.x > body.x, "a body facing world +x must face screen right");
  assert.ok(anatomicalLeft.z < body.z, "a body's left must be the far side, as it is up the plan");
  // And the shield, which is what a reader actually looks at, against the empty
  // hand at the same height and the same reach on the other side of the body.
  // Compared to the body centre instead this would be a test of the camera's
  // downward tilt: the guard is held 0.9 units up and the camera is 30 degrees
  // above the floor, so height alone moves a point half a unit nearer.
  assert.ok(seen(pose.shield.centre).z < seen(pose.arms[1].hand).z,
    "the shield must be on the far side of the body from the empty hand");

  // The camera frames the same world width the Span slider gives the 2D panels,
  // so all five panels move together, and it is a pure function of the frame:
  // scrubbing to a tick backwards must give the same picture as reaching it
  // forwards.
  const first = content.threeQuarter.position.clone();
  content.show(arenaView([arenaPose({ yaw: RAW / 3 })]));
  content.show(arenaView([pose]));
  assert.deepEqual([content.threeQuarter.position.x, content.threeQuarter.position.y,
    content.threeQuarter.position.z], [first.x, first.y, first.z]);
  const wide = arenaGeometry.threeQuarterPlacement(pose.body, 12 * RAW, 1.28, 0);
  const near = arenaGeometry.threeQuarterPlacement(pose.body, 6 * RAW, 1.28, 0);
  assert.ok(wide.position[1] > near.position[1], "a wider span must stand further back");
  assert.deepEqual(wide.target, near.target);
  // The 3/4 camera stands where the elevation camera stands and then climbs 30
  // degrees, so one azimuth control turns both -- and a reader who cannot see a
  // contact because a body is in front of it can turn it and look from the
  // other side, which a camera pinned to one heading does not allow.
  const turned = arenaGeometry.threeQuarterPlacement(pose.body, 6 * RAW, 1.28, Math.PI / 2);
  assert.deepEqual(turned.target, near.target);
  assert.ok(turned.position[0] > near.position[0], "a quarter turn must move the eye onto world +x");
  assert.ok(Math.abs(turned.position[1] - near.position[1]) < 1e-9, "azimuth must not change the height");
  content.dispose();
  scene.dispose();
  engine.dispose();
});

test("the_shield_is_the_four_corners_the_two_dimensional_panels_draw", async () => {
  const { VertexBuffer } = await import("@babylonjs/core/Buffers/buffer.js");
  const trace = await load("client/src/fight/trace.js");
  const harness = await arenaStageHarness();
  const { content, scene, engine } = harness;
  const pose = arenaPose();
  content.show(arenaView([pose]));
  const mesh = scene.getMeshByName("arena:0:shield");
  assert.ok(mesh);
  // `shieldCorners` is called rather than re-derived, so the 3D face and the 2D
  // face cannot drift. Its mixed units are the reason: `thickness` and
  // `halfWidth` scale unit vectors and are divided by 65536 in there, while
  // `halfHeight` rides a raw-space basis vector and is used raw.
  const expected = trace.shieldCorners(pose.shield).flatMap((corner) => arenaGeometry.scenePoint(corner));
  const drawn = [...mesh.getVerticesData(VertexBuffer.PositionKind)];
  assert.equal(drawn.length, 12);
  drawn.forEach((value, index) => assert.ok(Math.abs(value - expected[index]) < 1e-5,
    `shield vertex ${index} is ${value}, not ${expected[index]}`));
  // Both faces are drawn: the body holding it is looking at the inside of it.
  assert.equal(mesh.material.backFaceCulling, false);
  content.dispose();
  scene.dispose();
  engine.dispose();
});

test("a_contact_marker_is_the_colour_of_the_kind_at_that_index_now_and_not_the_one_before", async () => {
  const { Color3 } = await import("@babylonjs/core/Maths/math.color.js");
  const view = await load("client/src/fight/view.js");
  const harness = await arenaStageHarness();
  const { content, scene, engine } = harness;
  const pose = arenaPose();
  const wanted = (kind) => Color3.FromHexString(view.contactColour(kind)).asArray();
  const drawn = (name) => scene.getMeshByName(name).material.emissiveColor.asArray();
  const shield = arenaContact(1, [7, 6.3, 0.9]);
  const bodyHit = arenaContact(2, [7, 5.7, 0.9]);
  const rows = (...list) => arenaView([pose], { contacts: true, rows: list });

  // **An instance's material is its source's**, and `contact:0` is a key whose
  // index says nothing about the kind that landed there. Stepping from a tick
  // whose index 0 was a `weaponShield` to one whose index 0 is a `weaponBody`
  // used to keep the first tick's blue: 136 of `web/fight.json`'s 1491 markers
  // were drawn in the wrong kind's colour, beside a `#contacts` readout calling
  // `contactColour` directly and getting it right.
  content.show(rows(shield, bodyHit));
  assert.deepEqual(drawn("arena:contact:0"), wanted(1));
  assert.deepEqual(drawn("arena:contact:1"), wanted(2));
  content.show(rows(bodyHit, shield));
  assert.deepEqual(drawn("arena:contact:0"), wanted(2), "index 0 kept the previous tick's colour");
  assert.deepEqual(drawn("arena:contact:1"), wanted(1));
  // The axis through the point is the part a reader actually sees, so it has to
  // move too rather than only the sphere at the centre.
  assert.deepEqual(drawn("arena:contact:0:normal:shaft"), wanted(2));

  // **And the picture does not depend on how the reader got there.** A key stays
  // live until a tick with fewer contacts retires it, so arriving through one
  // with none at all -- which is what `clear` stands in for here, and what
  // scrubbing across a quiet stretch of the fight does -- rebuilds every node,
  // while stepping through contact-bearing ticks reuses them. The two must agree,
  // for the same reason `threeQuarterPlacement` is a pure function of the frame:
  // a picture whose content depends on playback history cannot be used to check
  // a geometry claim.
  const stepped = ["arena:contact:0", "arena:contact:1"].map(drawn);
  content.clear();
  content.show(rows(bodyHit, shield));
  assert.deepEqual(["arena:contact:0", "arena:contact:1"].map(drawn), stepped);

  // A tick with fewer contacts retires the surplus rather than leaving a marker
  // standing where nothing happened.
  content.show(rows(shield));
  assert.equal(scene.getMeshByName("arena:contact:1"), null);
  assert.deepEqual(content.keys().filter((key) => key.startsWith("contact:")),
    ["contact:0", "contact:0:normal:lower", "contact:0:normal:shaft", "contact:0:normal:upper"]);
  content.dispose();
  scene.dispose();
  engine.dispose();
});

test("a_contact_axis_clears_the_widest_capsule_the_simulation_publishes", async () => {
  const harness = await arenaStageHarness();
  const { content, scene, engine } = harness;
  const pose = arenaPose();
  // **The Brute's torso, which this Fighter-shaped fixture does not otherwise
  // carry.** The widest capsule any of the three recordings publishes is
  // `radius` 0.400 -- 26214 raw, body 1 region 1, on every frame of all three --
  // and testing the axis against the Fighter's 0.350 would pass at 0.351 and
  // prove nothing about the case the constant is set for.
  const widest = Math.round(0.4 * RAW);
  pose.regions[1] = { ...pose.regions[1], radius: widest };
  // A contact at the dead centre of that capsule with the normal pointing
  // radially out of it: the worst case the axis exists for.
  const buried = arenaContact(2, [7, 6, 1.1], [1, 0, 0]);
  content.show(arenaView([pose], { contacts: true, rows: [buried] }));
  const shaft = scene.getMeshByName("arena:contact:0:normal:shaft");
  assert.ok(shaft);
  const half = shaft.scaling.y / 2;
  // Both ends reach the surface of the capsule the point is in the middle of,
  // and the end spheres put them outside it. Buried at both ends the marker is
  // invisible from every angle at once, which is worse than no marker: the
  // reader reads "no contact" off a tick that had one.
  const radius = widest / RAW;
  const capRadius = shaft.scaling.x / 2;
  const ends = ["lower", "upper"].map((end) => scene.getMeshByName(`arena:contact:0:normal:${end}`));
  for (const end of ends) {
    assert.ok(Math.abs(end.position.x - shaft.position.x) + capRadius > radius,
      `an axis end at ${end.position.x} is still inside a radius-${radius} capsule`);
  }
  // **The requirement is the widest published radius, not the widest diameter.**
  // This was 0.3 while its own comment called 0.400 and 0.350 the *widths* of the
  // Brute's torso and legs; they are the radii, and 18.8% of the fixtures'
  // then-5703 weapon-body markers were buried at both ends. That sweep is the one
  // `CONTACT_AXIS` records and it has not been re-run since the learned fixture
  // was re-recorded -- the corpus is now 5512 -- but the assertion below is the
  // lower bound rather than the sweep, and the bound is a published radius. The
  // upper bound is a judgement about legibility rather than a measurement, so
  // nothing here pins one.
  assert.ok(half >= radius, `a half-axis of ${half} cannot reach out of a radius-${radius} torso`);
  content.dispose();
  scene.dispose();
  engine.dispose();
});

test("the_arena_stage_owns_every_engine_it_builds_including_one_it_fails_on", async () => {
  const { NullEngine } = await import("@babylonjs/core/Engines/nullEngine.js");
  // `createRendererEngine` wants a real `webgl2` or WebGPU context and there is
  // none here, so without this seam every assertion about the stage's lifecycle
  // would be an assertion about a rejected promise. `createEngine` is the whole
  // of the injection: everything after it is the shipped path.
  const saved = globalThis.window;
  globalThis.window = {
    devicePixelRatio: 2,
    // Babylon's own teardown reaches for these; the arena reads only the ratio.
    addEventListener: () => undefined, removeEventListener: () => undefined,
  };
  try {
    const built = [];
    const createEngine = (canvas, requested) => {
      const engine = new NullEngine({ renderWidth: 1280, renderHeight: 720 });
      const record = { engine, requested, disposals: 0, scaling: [] };
      // Recorded rather than read back: `AbstractEngine.resize` re-derives the
      // level from a device pixel ratio Node does not have, so the level that
      // sticks is Babylon's business and the call is the arena's.
      const setLevel = engine.setHardwareScalingLevel.bind(engine);
      engine.setHardwareScalingLevel = (level) => { record.scaling.push(level); setLevel(level); };
      built.push(record);
      return Promise.resolve({
        engine, canvas, terminal: false,
        diagnostics: { selected: "webgl2" },
        dispose: () => { record.disposals += 1; engine.dispose(); },
      });
    };
    const canvas = { id: "arena-3d" };

    const stage = await arenaScene.createArenaStage(canvas, new URLSearchParams("backend=webgl2"), { createEngine });
    assert.equal(built.length, 1);
    assert.equal(built[0].requested, "webgl2", "the route's backend query must reach the engine");
    // The backing store follows the device pixel ratio, capped at two, because a
    // blurred 3D panel beside a crisp plan is a panel a reader stops trusting.
    assert.deepEqual(built[0].scaling, [0.5]);
    assert.match(stage.description(), /^webgl2, geometry, \d+ sources, \d+ instances, 0 shadow casters$/);
    stage.show(arenaView([arenaPose(), arenaPose({ index: 1, x: 11 })]));
    assert.match(stage.description(), /[1-9]\d* instances/);
    stage.resize();
    assert.deepEqual(built[0].scaling, [0.5, 0.5]);
    stage.clear();
    assert.match(stage.description(), /, 0 instances,/);

    stage.dispose();
    assert.equal(built[0].disposals, 1);
    assert.equal(built[0].engine.isDisposed, true);
    // Idempotent, and dead: the shell disposes on navigation and again on
    // `pagehide`, and everything on this handle answers without an engine.
    stage.dispose();
    assert.equal(built[0].disposals, 1);
    assert.equal(stage.description(), "renderer unavailable");
    stage.show(arenaView([arenaPose()]));
    stage.resize();

    // **A failure after the engine exists must still give the engine back.** The
    // window between `createRendererEngine` returning and this function
    // returning a handle is the one stretch where nobody else can: the caller
    // has nothing to call `dispose` on, and a rejected build left a WebGPU
    // device alive with no reference to it and no symptom short of context
    // exhaustion several routes later.
    const explode = (canvasArgument, requested) => createEngine(canvasArgument, requested).then((handle) => {
      handle.engine.setHardwareScalingLevel = () => { throw new Error("no such surface"); };
      return handle;
    });
    await assert.rejects(
      arenaScene.createArenaStage(canvas, new URLSearchParams(), { createEngine: explode }),
      /no such surface/);
    assert.equal(built.length, 2);
    assert.equal(built[1].disposals, 1, "a stage that failed to build kept its engine");
    assert.equal(built[1].engine.isDisposed, true);
  } finally {
    if (saved === undefined) delete globalThis.window;
    else globalThis.window = saved;
  }
});

test("sub_tick_blending_lerps_the_published_points_and_never_a_severance", () => {
  const current = arenaPose({ x: 7, yaw: 0 });
  const next = arenaPose({ x: 9, yaw: RAW - RAW / 8, severed: 1 << 2 });
  // At 1x the carry is consumed every frame, so the common path allocates
  // nothing and returns the decided tick unchanged.
  assert.equal(arenaGeometry.blendPose(current, next, 0), current);

  const half = arenaGeometry.blendPose(current, next, 0.5);
  assert.equal(half.body[0], raw(8)[0]);
  // The right hand, because `next` takes the left arm off and a lost limb is
  // the one thing here that does not move -- see the severance block below.
  assert.equal(half.arms[1].hand[0], raw(8.2)[0]);
  assert.equal(half.weapons[1].tip[0], raw(9.15)[0]);
  assert.equal(half.regions[1].lower[0], raw(8)[0]);
  // Yaw goes the short way round the 65535/0 seam rather than spinning the body
  // seven eighths of a turn the other way, which is what `interpolateAngle` is
  // borrowed for.
  assert.ok(half.yaw < 0 || half.yaw > (RAW * 7) / 8, `half yaw was ${half.yaw}`);
  assert.ok(Math.abs(arenaGeometry.sceneYaw(half.yaw) + Math.PI / 8) < 1e-6);
  // **A half-severed arm is not a thing**, and carrying `severed` from the
  // decided tick is only half of saying so. The endpoints were still being
  // lerped across the severance, so the arm this frame goes on drawing was drawn
  // half way to wherever the stump was published -- a pose no tick decided, and
  // the only one a reader could mistake for a limb coming off gradually. The
  // hand goes with its arm for the same reason.
  assert.equal(half.severed, current.severed);
  assert.equal(arenaGeometry.regionDrawn(half, 2), true);
  assert.deepEqual(half.regions[2], current.regions[2]);
  assert.deepEqual(half.arms[0], current.arms[0]);
  // The shield goes with the arm holding it, which keeps its published centre on
  // that hand exactly -- the invariant `shieldLimb` reads the holder out of.
  assert.equal(half.shield.centre[0], current.arms[0].hand[0]);
  assert.equal(arenaGeometry.shieldLimb(half, half.shield), 0);
  // Every other region of the same body is still blended, so this is a region
  // rule rather than a pose that stopped moving the tick something came off.
  assert.equal(half.regions[1].lower[0], raw(8)[0]);
  assert.notDeepEqual(half.arms[1], current.arms[1]);
  // The right arm survives in `next`, so it blends; flip which one is lost and
  // the two swap over, shield and all.
  const other = arenaGeometry.blendPose(current, arenaPose({ x: 9, severed: 1 << 3 }), 0.5);
  assert.deepEqual(other.regions[3], current.regions[3]);
  assert.deepEqual(other.weapons[1], current.weapons[1]);
  assert.equal(other.regions[2].lower[0], raw(8)[0]);
  assert.equal(other.shield.centre[0], raw(8.2)[0]);
  // **`present` is the same rule and carries the same limb**, which is where it
  // used to stop: `blendRegion` bailed on its own endpoints and the hand, the
  // weapon and the shield hanging off that region went on lerping toward the
  // tick the limb is gone in -- the exact failure the severance guard exists to
  // stop, reached through the other of the two bits `regionDrawn` reads.
  const leaving = arenaPose({ x: 9 });
  leaving.regions[3] = { ...leaving.regions[3], present: false };
  const partial = arenaGeometry.blendPose(current, leaving, 0.5);
  assert.deepEqual(partial.regions[3], current.regions[3]);
  assert.deepEqual(partial.arms[1], current.arms[1]);
  assert.deepEqual(partial.weapons[1], current.weapons[1]);
  assert.equal(partial.regions[2].lower[0], raw(8)[0], "the other arm still blends");

  const vanishing = arenaPose({ x: 9 });
  vanishing.regions[4] = { ...vanishing.regions[4], present: false };
  assert.deepEqual(arenaGeometry.blendPose(current, vanishing, 0.5).regions[4], current.regions[4]);
});

test("articulated_arrows_interpolate_by_slot_generation_and_retire_on_mode_and_load", async () => {
  const { content, scene, engine } = await arenaStageHarness();
  const projectile = (x, generation = 7) => ({
    id: [4, generation], owner: [0, 0], position: raw(x, 6, 1),
    velocity: raw(0.1, 0, 0), radius: raw(0.02)[0], remainingRange: raw(8)[0],
  });
  const current = arenaView([arenaPose()], { projectiles: [projectile(7)] });
  const next = { ...current.frame, t: 1, projectiles: [projectile(9)] };
  content.show({ ...current, next, alpha: 0.5 });
  const tipName = "arena:projectile:4:7:upper";
  const geometryTip = scene.getMeshByName(tipName);
  assert.ok(Math.abs(absolute(geometryTip)[0] - 8) < 1e-5,
    "the arrow tip did not interpolate between matching stable identities");

  content.setMode("texture");
  content.redraw();
  assert.ok(geometryTip.isDisposed(), "changing dress retained the geometry arrow instance");
  const texturedTip = scene.getMeshByName(tipName);
  assert.ok(texturedTip, "changing dress did not rebuild the still-live arrow");
  content.show(arenaView([arenaPose()], { projectiles: [] }));
  assert.equal(scene.getMeshByName(tipName), null,
    "an arrow from the previous loaded fight survived live-key cleanup");
  assert.ok(texturedTip.isDisposed(), "loading a fight without the arrow retained its texture instance");

  content.dispose();
  scene.dispose();
  engine.dispose();
});

// ------------------------------------------------- the textured proxy (v2-ui-03)

const { Vector3: BabylonVector3 } = await import("@babylonjs/core/Maths/math.vector.js");

/**
 * Five ticks of `web/fight.json`, seed 3, as the trace published them.
 *
 * **Raw integers out of the recording rather than a convenient shape**, because
 * the whole question this fixture is here to answer is whether the proxy lands on
 * what the simulation actually decided. Recordings are a development fixture and
 * `.gitignore` excludes them, so the numbers are checked in rather than read at
 * test time -- a test that skipped itself on a fresh clone would be a check that
 * is not there in exactly the tree where nobody would notice.
 *
 * The five are spread across a 3600-tick fight and every one is a tick an earlier
 * session already named: 858 and 3022 are v2-ui-02's capsule check on the
 * Brute's left arm, 1402 its check on the Fighter's torso, 966 the `weaponShield`
 * contact its first-person check reads, and 2113 the handedness check's tick. So
 * the guard positions here are the ones the camera and the panels were chosen
 * against.
 *
 * The three capsule-check ticks were not picked for being interesting to look
 * at. Each was checked by hand against the readout with two numbers: how far the
 * published contact point lies under the named capsule's surface, and how far it
 * is from the nearest *other* region of the same body -- because a check that
 * cannot separate an arm from the torso behind it is not a check. 858 and 3022
 * sit 0.066 under a radius-0.200 arm with 0.148 and 0.081 to the next capsule;
 * 1402 sits 0.139 under a radius-0.350 torso with 0.163 to the next. The second
 * number is the one that says so.
 *
 * The row is compact because the published pose is redundant, and the script that
 * generated it asserted every redundancy rather than assuming it, over exactly
 * these ten poses: the head capsule is a point and shares the body's `x` and `y`;
 * the torso and the legs are vertical on the body's axis; the legs' lower end is
 * at height zero; each arm capsule's upper end **is** that limb's published hand;
 * the sword's hilt is the right hand; the plate's centre is the left hand; and
 * nothing is severed or absent.
 *
 * ```text
 * tick body bx by yaw headZ torsoLo torsoHi hipZ
 *      shoulderL(3) handL(3) shoulderR(3) handR(3) tip(3) shieldNormal(2) vel(3)
 * ```
 */
const FIGHT_ROWS = [
  [858, 0, 847018, 508549, 33013, 111411, 45875, 98303, 52428, 847402, 492169, 91750, 810539, 491822, 29491, 846633, 524928, 91750, 817286, 555633, 29390, 774269, 600641, 29390, -65518, -1539, 761, 405, 0],
  [858, 1, 772085, 544029, 64906, 124518, 49152, 108134, 58982, 773271, 563653, 98304, 787171, 562812, 32768, 770898, 524404, 98304, 797086, 488585, 50278, 853171, 411874, 50278, 0, 0, -988, -652, 0],
  [966, 0, 865246, 532485, 31583, 111411, 45875, 98303, 52428, 863388, 516206, 91750, 827136, 523514, 58047, 867103, 548763, 91750, 843215, 553659, 58735, 782224, 566161, 58735, -65113, 7430, 755, 1294, 0],
  [966, 1, 768443, 540928, 7165, 124518, 49152, 108134, 58982, 755975, 556128, 98304, 769085, 560824, 78854, 780910, 525727, 98304, 812915, 514303, 77984, 902411, 482358, 77984, 0, 0, -297, -224, 0],
  [1402, 0, 1002933, 588804, 40508, 111411, 45875, 98303, 52428, 1014005, 576727, 91750, 986833, 551814, 29491, 991860, 600880, 91750, 955230, 596037, 86867, 893507, 587877, 86867, -48305, -44289, 635, 1315, 0],
  [1402, 1, 848983, 542902, 9332, 124518, 49152, 108134, 58982, 833647, 555204, 98304, 846037, 561560, 32768, 864318, 530599, 98304, 891911, 540543, 91960, 981309, 572761, 91960, 0, 0, 0, 0, 0],
  [2113, 0, 898729, 813985, 64935, 111411, 45875, 98303, 52428, 899672, 830341, 91750, 936474, 828218, 88473, 897785, 797628, 91750, 910489, 750146, 58982, 926580, 690002, 58982, 65427, -3774, 0, 0, 0],
  [2113, 1, 1009362, 680521, 17866, 124518, 49152, 108134, 58982, 989900, 677737, 98304, 983778, 690245, 98304, 1028823, 683304, 98304, 1023817, 711974, 68280, 1007472, 805584, 68280, 0, 0, 5, -35, 0],
  [3022, 0, 883339, 721069, 33267, 111411, 45875, 98303, 52428, 884122, 704703, 91750, 847300, 702940, 29491, 882555, 737434, 91750, 834072, 735611, 29487, 771856, 733272, 29487, -65461, -3134, 0, 0, 0],
  [3022, 1, 810961, 698805, 10731, 124518, 49152, 108134, 58982, 794118, 708946, 98304, 804896, 717764, 32768, 827803, 688663, 98304, 876143, 692000, 40544, 970943, 698545, 40544, 0, 0, -114, -1343, 0],
];

/**
 * The two loadouts, which do not change over the fight. The Brute carries no plate.
 *
 * `equipmentMask` is here rather than written once in `fightPose` because the two
 * bodies do not carry the same one: the recording publishes 6 on the Fighter and
 * **2** on the Brute, on every one of the 10542 Fighter poses and 10541 Brute
 * poses across the three fixtures, with no other value anywhere. Nothing on this
 * page reads it, so it is cosmetic -- and it was the one field in the table that
 * was not the recording's, which is exactly the sort of thing a reader would
 * later take for a fact about the fight.
 */
const FIGHT_BODIES = [
  {
    kind: "Fighter", faction: "Heroes", radii: [13107, 22937, 9830, 9830, 19660],
    weaponRadius: 2621, shield: { halfWidth: 16384, halfHeight: 16384, thickness: 3276 },
    equipmentMask: 6,
    anatomy: { standingHeight: 117964, shoulderHeight: 91750, shoulderHalfWidth: 16384,
      armLength: 49152, handRadius: 6553 },
  },
  {
    kind: "Brute", faction: "Monsters", radii: [16384, 26214, 13107, 13107, 22937],
    weaponRadius: 3932, shield: null,
    equipmentMask: 2,
    anatomy: { standingHeight: 131072, shoulderHeight: 98304, shoulderHalfWidth: 19660,
      armLength: 55705, handRadius: 7864 },
  },
];

function fightPose(row) {
  const [tick, index, bx, by, yaw, headZ, torsoLo, torsoHi, hipZ,
    slx, sly, slz, hlx, hly, hlz, srx, sry, srz, hrx, hry, hrz,
    tipx, tipy, tipz, nx, ny, vx, vy, vz] = row;
  const loadout = FIGHT_BODIES[index];
  const region = (lower, upper, part) => ({
    lower, upper, radius: loadout.radii[part], present: true,
  });
  const handLeft = [hlx, hly, hlz];
  const handRight = [hrx, hry, hrz];
  return {
    tick,
    pose: {
      id: [index, 0], body: [bx, by, 0], yaw, vel: [vx, vy, vz],
      arms: [
        { hand: handLeft, vel: [0, 0, 0], target: handLeft, fatigue: 0 },
        { hand: handRight, vel: [0, 0, 0], target: handRight, fatigue: 0 },
      ],
      weapons: [null, { hilt: handRight, tip: [tipx, tipy, tipz], radius: loadout.weaponRadius }],
      shield: loadout.shield === null ? null
        : { centre: handLeft, normal: [nx, ny, 0], ...loadout.shield },
      regions: [
        region([bx, by, headZ], [bx, by, headZ], 0),
        region([bx, by, torsoLo], [bx, by, torsoHi], 1),
        region([slx, sly, slz], handLeft, 2),
        region([srx, sry, srz], handRight, 3),
        region([bx, by, 0], [bx, by, hipZ], 4),
      ],
      integrity: [RAW, RAW, RAW, RAW, RAW], wound: [0, 0, 0, 0, 0],
      blood: RAW, shock: 0, severed: 0, equipmentMask: loadout.equipmentMask,
      intent: "attack", target: null, hints: [0, 0],
    },
  };
}

/** `web/fight.json`'s header, as far as the 3D panels read it. */
const fightHeader = () => ({
  ...arenaHeader(), seed: 3, ticks: 3600, arena: [1572864, 1048576], contactEnergyFloor: 144,
  bodies: FIGHT_BODIES.map((loadout, index) => ({
    index, kind: loadout.kind, faction: loadout.faction, anatomy: loadout.anatomy, carried: [],
  })),
});

/** The five ticks, as the stage is asked to draw them. */
function fightViews() {
  const header = fightHeader();
  const ticks = [...new Set(FIGHT_ROWS.map((row) => row[0]))];
  return ticks.map((tick) => {
    const poses = FIGHT_ROWS.filter((row) => row[0] === tick).map((row) => fightPose(row).pose);
    const frame = { t: tick, poses, projectiles: [], contacts: [], health: [RAW, RAW] };
    return {
      tick, poses,
      view: {
        header, frame, next: frame, alpha: 0,
        focus: [(poses[0].body[0] + poses[1].body[0]) / 2, (poses[0].body[1] + poses[1].body[1]) / 2, 0],
        span: 6 * RAW, azimuth: 0, contacts: false,
      },
    };
  });
}

const absolute = (node) => {
  node.computeWorldMatrix(true);
  return node.getAbsolutePosition().asArray();
};

/**
 * How far a proxy node may sit from the published point it is placed on.
 *
 * A tenth of a millimetre, against a body 1.8 units tall and a blade 0.08 across.
 * It is a **float32 budget and not a modelling allowance**: Babylon's `Matrix` is
 * a `Float32Array`, and the rig divides a parent's world transform back out of
 * every child, so a hand three levels down carries a few units of last place on
 * coordinates near 15. If it ever approaches this number the cause is
 * arithmetic; if it exceeds it the cause is the proxy, and the published value is
 * never the thing that moves.
 *
 * **That last sentence used to be false, and the number beside it was the
 * evidence.** The worst gap over the ten poses read 2.19e-6, and the whole of it
 * was the shield plate: `#shieldPlate` scaled its box by `2 * halfWidth` while
 * the swept face is `halfWidth` times the *published normal*, which is not a unit
 * vector -- so the dominant term was a modelling disagreement that a recording
 * with a less-normalised normal could have driven straight through this
 * tolerance for a reason that is neither arithmetic nor the proxy. See
 * `plateNormalLength` in `client/src/arena/scene.ts` for the measurement and the
 * fix, which removes the term rather than budgeting for it. What is left is
 * float32: every other swept quantity in a full sweep of all three recordings
 * tops out at 1.907e-6, which is an ulp at coordinates near 15.
 *
 * **The number to check this against is 9.54e-7**, which is what the ten poses
 * measure now that the modelling term is gone, and it reproduces to the printed
 * digit across runs. That is the figure the `console.log` below prints and the
 * one a reader should see; the 2.19e-6 above is **superseded** and is kept only
 * because it is the evidence for the paragraph it sits in. Two orders of
 * magnitude of headroom under this tolerance, and a run that printed anything
 * else would be reporting a change rather than noise.
 */
const AGREEMENT_TOLERANCE = 1e-4;

test("the_textured_proxy_agrees_with_the_published_pose_at_five_ticks_of_a_fight", async () => {
  const harness = await arenaStageHarness();
  const { content, scene, engine } = harness;
  const trace = await load("client/src/fight/trace.js");
  content.setMode("texture");
  let worst = 0;
  const near = (actual, expected, what) => {
    const gap = Math.max(...actual.map((value, index) => Math.abs(value - expected[index])));
    worst = Math.max(worst, gap);
    assert.ok(gap <= AGREEMENT_TOLERANCE, `${what} is ${gap} from the published point`);
  };

  for (const { tick, poses, view } of fightViews()) {
    content.show(view);
    for (const pose of poses) {
      const body = pose.id[0];
      const rig = content.rig(body);
      assert.ok(rig, `tick ${tick} body ${body} has no rig`);
      const node = (name) => {
        const found = rig.get(name);
        assert.ok(found, `tick ${tick} body ${body} has no ${name}`);
        return found;
      };
      // **The hands.** `hand_left` and `hand_right` are three levels down the rig
      // -- root, torso, arm, hand -- so this is the assertion that the parent
      // transforms are divided back out correctly as well as the one the plan
      // asks for.
      for (const limb of [0, 1]) {
        near(absolute(node(limb === 0 ? "hand_left" : "hand_right")),
          arenaGeometry.scenePoint(pose.arms[limb].hand), `tick ${tick} body ${body} hand ${limb}`);
      }
      // **The weapon tip.** Read off the drawn mesh rather than off a node, since
      // the tip is the end of a capsule the proxy builds and not a socket: a
      // socket that pointed the right way while the blade was drawn somewhere
      // else would pass a node-only check.
      const tipMesh = scene.getMeshByName(`arena:proxy:${body}:weapon:right:upper`);
      assert.ok(tipMesh, `tick ${tick} body ${body} draws no weapon tip`);
      near(absolute(tipMesh), arenaGeometry.scenePoint(pose.weapons[1].tip),
        `tick ${tick} body ${body} weapon tip`);
      near(absolute(scene.getMeshByName(`arena:proxy:${body}:weapon:right:lower`)),
        arenaGeometry.scenePoint(pose.weapons[1].hilt), `tick ${tick} body ${body} weapon hilt`);

      // **The shield plate**, as its four front-face corners against
      // `shieldCorners` -- the same four points the plan and the elevation draw,
      // so a plate that had drifted would have drifted from the 2D panels too.
      if (pose.shield === null) {
        assert.equal(scene.getMeshByName(`arena:proxy:${body}:shield`), null,
          "a body with no published plate must not be drawn one");
        continue;
      }
      const plate = scene.getMeshByName(`arena:proxy:${body}:shield`);
      assert.ok(plate, `tick ${tick} body ${body} draws no plate`);
      const corners = plateFront(plate);
      trace.shieldCorners(pose.shield).forEach((corner, index) => {
        near(corners[index], arenaGeometry.scenePoint(corner),
          `tick ${tick} body ${body} plate corner ${index}`);
      });
    }
  }
  // **A plate that is not square**, because every published plate in the fixture
  // is: `halfWidth === halfHeight === 16384` on the only body that carries one,
  // so swapping the box's first two scaling arguments passes all five ticks. The
  // pose is synthetic and says so -- it is here to separate two extents that the
  // recording never separates, not to claim anything about a fight.
  const oblong = fightViews()[0];
  const tall = {
    ...oblong.poses[0],
    shield: { ...oblong.poses[0].shield, halfWidth: Math.round(0.18 * RAW),
      halfHeight: Math.round(0.42 * RAW), thickness: Math.round(0.07 * RAW) },
  };
  const frame = { ...oblong.view.frame, poses: [tall] };
  content.show({ ...oblong.view, frame, next: frame });
  const oblongPlate = scene.getMeshByName("arena:proxy:0:shield");
  assert.ok(oblongPlate);
  trace.shieldCorners(tall.shield).forEach((corner, index) => {
    near(plateFront(oblongPlate)[index], arenaGeometry.scenePoint(corner),
      `oblong plate corner ${index}`);
  });
  // And the thickness is the published one rather than a constant: the box spans
  // `thickness` along the published normal, so its back face is that far behind
  // the quad `shieldCorners` builds.
  assert.ok(Math.abs(oblongPlate.scaling.z - 0.07) < 1e-4,
    `the plate is ${oblongPlate.scaling.z} thick against a published 0.07`);

  // The measured worst case, printed so the number in `AGREEMENT_TOLERANCE`'s
  // comment can be checked rather than believed.
  assert.ok(worst < AGREEMENT_TOLERANCE, `worst agreement gap ${worst}`);
  console.log(`    agreement: worst gap ${worst.toExponential(2)} world units over five ticks`);
  content.dispose();
  scene.dispose();
  engine.dispose();
});

/**
 * A box's four front-face corners (local `z = +0.5`), in world space.
 *
 * The unit source box is scaled to `2*halfWidth` by `2*halfHeight` by
 * `thickness` in the socket's own frame, whose `z` is the published normal, so
 * its front face is the quad `shieldCorners` builds -- and the corner order
 * falls out the same way: `-side -up`, `+side -up`, `+side +up`, `-side +up`.
 */
function plateFront(plate) {
  plate.computeWorldMatrix(true);
  const world = plate.getWorldMatrix();
  return [[-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5]]
    .map((corner) => BabylonVector3.TransformCoordinates(
      new BabylonVector3(corner[0], corner[1], corner[2]), world).asArray());
}

/** A node's world `x`, `y` and `z` axes, which is where a socket is pointing. */
function axes(node) {
  node.computeWorldMatrix(true);
  const world = node.getWorldMatrix();
  return ["x", "y", "z"].map((_, index) => {
    const local = [0, 0, 0];
    local[index] = 1;
    return BabylonVector3.TransformNormal(
      new BabylonVector3(local[0], local[1], local[2]), world).normalize().asArray();
  });
}

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const minus = (a, b) => a.map((value, index) => value - b[index]);
const normalise = (v) => { const size = Math.hypot(...v); return v.map((value) => value / size); };

/**
 * The shadow generator's own render list, read off the `Scene` and not off a count.
 *
 * **The counts are not admissible here.** `ArenaEnvironment.counts` is the thing
 * under test when the question is "did every caster leave the list", and an
 * earlier version of it short-circuited to zero whenever the mode was off -- so
 * the assertion that proved the retire path was reading the answer it wanted out
 * of the reporter. This walks the `Scene` instead: whatever the counts say, the
 * list either has entries in it or it does not.
 */
function shadowRenderList(scene) {
  const generator = scene.lights
    .map((light) => light.getShadowGenerator?.())
    .find((found) => found != null);
  return generator?.getShadowMap()?.renderList ?? [];
}

test("the_proxy_rig_carries_the_durable_combatant_node_closure_and_hangs_them_off_published_points", async () => {
  // **Read the raw generated sidecar, not the parser's normalized result.** The
  // parser imports `RIG_NODES`, so comparing the mirror with its return value
  // would let both sides agree with the same wrong list. The committed sidecar
  // is generated from the durable art contract and is independently hash-pinned.
  const sidecar = JSON.parse(combatantSidecarBytes);
  const wanted = sidecar.semanticNames;
  assert.ok(Array.isArray(wanted), "the combatant sidecar has no semanticNames closure");
  assert.deepEqual(rigNames.RIG_NODES, wanted,
    "the runtime rig names must exactly mirror the pinned combatant sidecar");
  assert.deepEqual(arenaGeometry.RIG_NODES, wanted,
    "the arena re-export must preserve the combatant sidecar order");
  for (const archetype of sidecar.archetypes) {
    assert.deepEqual(archetype.nodes.map((node) => node.semantic), wanted,
      `${archetype.kind} must carry the complete semantic node closure`);
  }

  const harness = await arenaStageHarness();
  const { content, scene, engine } = harness;
  content.setMode("texture");
  const { poses, view } = fightViews()[3];
  content.show(view);
  const rig = content.rig(0);
  assert.ok(rig);
  for (const name of wanted) assert.ok(rig.get(name), `the rig has no ${name}`);
  const parentOf = (name) => rig.get(name).parent?.name ?? null;
  assert.equal(parentOf("root"), null);
  assert.deepEqual(
    ["pelvis", "torso", "head", "arm_left", "hand_left", "socket_weapon_left",
      "arm_right", "hand_right", "socket_weapon_right"].map(parentOf),
    ["arena:0:root", "arena:0:pelvis", "arena:0:torso", "arena:0:torso", "arena:0:arm_left",
      "arena:0:hand_left", "arena:0:torso", "arena:0:arm_right", "arena:0:hand_right"]);
  // **The shield socket hangs off the hand the simulation put the plate in.**
  // `derive_shield_pose` writes the plate's centre from a hand, so which hand is
  // published rather than authored, and `shieldLimb` reads it back by exact
  // integer match. Body 0 holds it in limb 0 on all 10542 published poses of the
  // three fixtures; body 1 carries no plate at all, and its socket waits at the
  // root rather than being nailed to a hand that holds nothing.
  assert.equal(parentOf("socket_shield"), "arena:0:hand_left");
  assert.equal(content.rig(1).get("socket_shield").parent?.name, "arena:1:root");

  const pose = poses[0];
  const near = (actual, expected, what) => {
    const gap = Math.max(...actual.map((value, index) => Math.abs(value - expected[index])));
    assert.ok(gap <= AGREEMENT_TOLERANCE, `${what} is ${gap} out`);
  };
  // Every node that stands on a published row, checked against that row. `root`
  // is the body's ground point, `head` is the eye, `pelvis` is the published hip,
  // and the five `region_*` nodes are the published capsule centres.
  near(absolute(rig.get("root")), arenaGeometry.scenePoint([pose.body[0], pose.body[1], 0]), "root");
  near(absolute(rig.get("head")), arenaGeometry.scenePoint(arenaGeometry.eyeOf(pose)), "head");
  near(absolute(rig.get("pelvis")), arenaGeometry.scenePoint(pose.regions[4].upper), "pelvis");
  near(absolute(rig.get("arm_left")), arenaGeometry.scenePoint(pose.regions[2].lower), "arm_left");
  near(absolute(rig.get("arm_right")), arenaGeometry.scenePoint(pose.regions[3].lower), "arm_right");
  near(absolute(rig.get("socket_weapon_right")), arenaGeometry.scenePoint(pose.weapons[1].hilt),
    "socket_weapon_right");
  near(absolute(rig.get("socket_shield")), arenaGeometry.scenePoint(pose.shield.centre), "socket_shield");
  arenaGeometry.RIG_REGIONS.forEach((name, index) => {
    near(absolute(rig.get(name)),
      arenaGeometry.capsuleCentre(pose.regions[index].lower, pose.regions[index].upper), name);
  });

  // **`root` carries the body's one rotation and nothing else does by accident.**
  // Its `x` is the body's published facing; the head, which inherits through two
  // parents, faces the same way.
  const forward = arenaGeometry.sceneForward(pose.yaw);
  near(axes(rig.get("root"))[0], forward, "root facing");
  near(axes(rig.get("head"))[0], forward, "head facing");

  // **The two bone directions, which nothing else in this file reads.** Every
  // mesh is placed absolutely, so `arm_*` and `hand_*` could point anywhere at
  // all and no position assertion would notice -- and they are the one invented
  // orientation this session ships. `arm_left`'s `y` runs shoulder to elbow and
  // `hand_left`'s runs elbow to hand, which is what an upper-arm and a forearm
  // bone are. The elbow is read off the drawn mesh rather than recomputed, so
  // this is the elbow that is on the screen.
  const bends = [];
  for (const [limb, arm, hand, side] of [[0, "arm_left", "hand_left", "left"],
    [1, "arm_right", "hand_right", "right"]]) {
    const shoulder = arenaGeometry.scenePoint(pose.regions[limb + 2].lower);
    const grip = arenaGeometry.scenePoint(pose.arms[limb].hand);
    const elbow = absolute(scene.getMeshByName(`arena:proxy:0:upper_arm:${side}:upper`));
    near(axes(rig.get(arm))[1], normalise(minus(elbow, shoulder)), `${arm} points at its elbow`);
    near(axes(rig.get(hand))[1], normalise(minus(grip, elbow)), `${hand} points at its hand`);
    // **And the elbow is on the outward side**, which is the choice v2-ui-03
    // argues for and which `elbowOf` alone cannot demonstrate: this reads the
    // side `#poseRig` actually passed. Swap it and both elbows bend across the
    // chest -- the exact defect the frames caught once already. Never negative,
    // and the count of arms that bend at all is checked after the loop, because
    // this simulation over-extends the arm often enough that "always bends" is
    // simply false. See `elbowOf`.
    const along = normalise(minus(grip, shoulder));
    const offset = minus(elbow, shoulder);
    const bend = minus(offset, along.map((value) => value * dot(offset, along)));
    const outward = arenaGeometry.bodyAxes(pose.yaw).left.map((value) => (limb === 0 ? value : -value));
    assert.ok(dot(bend, outward) >= -1e-9,
      `${arm}'s elbow bends ${dot(bend, outward).toFixed(4)} outward, so it is across the chest`);
    bends.push(dot(bend, outward));
  }

  // **At least one arm is actually bent**, or every assertion above is satisfied
  // by a proxy whose elbows are all collapsed onto the straight line -- which is
  // a real state this simulation reaches on about half its arm rows and must not
  // be the state the test happens to sample.
  assert.ok(bends.some((value) => value > 0.02),
    `no arm on this pose bends: ${bends.map((value) => value.toFixed(4)).join(", ")}`);

  // **`idle` and `walk` are the only two slots this session can select**, and
  // exactly one is on. `stagger` and `fall` are reactions, and no event reaches
  // the proxy -- see `RIG_CLIPS`.
  const enabled = arenaGeometry.RIG_CLIPS.filter((clip) => rig.get(clip).isEnabled());
  assert.equal(enabled.length, 1, `clips enabled: ${enabled.join(",")}`);
  assert.ok(["idle", "walk"].includes(enabled[0]));
  assert.equal(rig.get("stagger").isEnabled(), false);
  assert.equal(rig.get("fall").isEnabled(), false);
  content.dispose();
  scene.dispose();
  engine.dispose();
});

test("the_weapon_socket_points_along_the_published_blade_and_rolls_with_the_forearm", async () => {
  const harness = await arenaStageHarness();
  const { content, scene, engine } = harness;
  content.setMode("texture");
  for (const { tick, poses, view } of fightViews()) {
    content.show(view);
    for (const pose of poses) {
      const rig = content.rig(pose.id[0]);
      const socket = rig.get("socket_weapon_right");
      const [, socketY, socketZ] = axes(socket);
      const blade = arenaGeometry.scenePoint(pose.weapons[1].tip)
        .map((value, index) => value - arenaGeometry.scenePoint(pose.weapons[1].hilt)[index]);
      const size = Math.hypot(...blade);
      const unit = blade.map((value) => value / size);
      // **The direction is published**: a segment fixes two of the socket's three
      // axes exactly, and this is those two.
      assert.ok(Math.abs(dot(socketY, unit) - 1) < 1e-5,
        `tick ${tick} body ${pose.id[0]}: the socket points ${socketY} and the blade ${unit}`);
      // **The roll is not**, and this is the one thing about it that is decided:
      // the blade's flat lies in the plane the blade and the forearm share, so
      // the socket's `z` -- the flat itself -- is the forearm with its component
      // along the blade taken out. The forearm is read off the *drawn* elbow
      // rather than off the shoulder, because the elbow is where a forearm
      // starts and it is the invented point the roll is derived through.
      //
      // **Stated on `z` rather than on `x`, and that matters.** `x` is built as
      // `normalize(hint x y)`, so `x . hint` is identically zero for *any* hint --
      // an assertion on it passes for a socket rolled to the world's up, to the
      // torso, to anything. `z` is the one axis the choice actually decides.
      //
      // Invisible this session, since the proxy's weapon is the published capsule
      // and a capsule is round; load-bearing for the authored blade.
      const elbow = absolute(scene.getMeshByName(`arena:proxy:${pose.id[0]}:upper_arm:right:upper`));
      const forearm = minus(arenaGeometry.scenePoint(pose.weapons[1].hilt), elbow);
      const flat = normalise(minus(forearm, socketY.map((value) => value * dot(forearm, socketY))));
      assert.ok(Math.abs(Math.abs(dot(socketZ, flat)) - 1) < 1e-5,
        `tick ${tick} body ${pose.id[0]}: the blade's flat is ${dot(socketZ, flat)} off the `
          + "plane the blade and the forearm share");
      // The forearm is not parallel to the blade at any of these ticks, so the
      // plane is a real one rather than a fallback: an assertion satisfied by a
      // degenerate case would say nothing.
      assert.ok(Math.abs(dot(normalise(forearm), socketY)) < 0.99,
        `tick ${tick} body ${pose.id[0]}: the forearm is along the blade, so there is no plane`);
    }
  }
  // A limb with no published weapon still has a socket, in the hand, because an
  // authored rig does: an empty socket is where a grip goes, not an absence.
  const bare = fightViews()[0];
  const pose = { ...bare.poses[0], weapons: [null, null] };
  content.show({ ...bare.view, frame: { ...bare.view.frame, poses: [pose] },
    next: { ...bare.view.frame, poses: [pose] } });
  const rig = content.rig(0);
  const gap = Math.max(...absolute(rig.get("socket_weapon_right"))
    .map((value, index) => Math.abs(value - arenaGeometry.scenePoint(pose.arms[1].hand)[index])));
  assert.ok(gap <= AGREEMENT_TOLERANCE, `an empty socket sits ${gap} from its hand`);
  assert.equal(scene.getMeshByName("arena:proxy:0:weapon:right:shaft"), null);
  content.dispose();
  scene.dispose();
  engine.dispose();
});

test("the_invented_elbow_bends_away_from_the_torso_and_never_into_it", async () => {
  const { elbowOf, scenePoint, bodyAxes } = arenaGeometry;
  // **The measurement, and it is the whole argument for the choice.** v2-ui-03
  // says a plane chosen toward the torso puts the elbow inside the chest at
  // guard, so the two planes are solved side by side on all ten published poses
  // and the elbows compared against the published torso capsule. Note that the
  // *shoulder itself* is inside that cylinder -- `shoulderHalfWidth` is 0.25
  // against a torso radius of 0.35 -- so the honest claim is not that the outward
  // elbow escapes the chest but that the inward one is buried further in it, and
  // by how much.
  // Per body, because the two published torsos are not the same width -- 0.350 on
  // the Fighter and 0.400 on the Brute -- and half the solves below are the
  // Brute's. One number for both would be the wrong number for half of them.
  const worstOutward = [Infinity, Infinity];
  const worstInward = [Infinity, Infinity];
  for (const { poses } of fightViews()) {
    for (const pose of poses) {
      const { left } = bodyAxes(pose.yaw);
      const torso = pose.regions[1];
      const axis = scenePoint(torso.lower);
      const bone = FIGHT_BODIES[pose.id[0]].anatomy.armLength / RAW / 2;
      for (const limb of [0, 1]) {
        const region = pose.regions[limb + 2];
        const shoulder = scenePoint(region.lower);
        const hand = scenePoint(pose.arms[limb].hand);
        const side = limb === 0 ? 1 : -1;
        const outward = [left[0] * side, left[1] * side, left[2] * side];
        const inward = outward.map((value) => -value);
        const away = (elbow) => Math.hypot(elbow[0] - axis[0], elbow[2] - axis[2]);
        // The same offset with a sign on it: how far the elbow is from the body
        // axis **along `outward`**, so an elbow buried through the chest scores
        // negative rather than scoring as distance.
        const outFromAxis = (elbow) =>
          (elbow[0] - axis[0]) * outward[0] + (elbow[2] - axis[2]) * outward[2];
        const out = elbowOf(shoulder, hand, outward, bone);
        const into = elbowOf(shoulder, hand, inward, bone);
        worstOutward[pose.id[0]] = Math.min(worstOutward[pose.id[0]], away(out));
        worstInward[pose.id[0]] = Math.min(worstInward[pose.id[0]], away(into));
        // **This used to be `away(out) >= away(into)` and that is not an
        // invariant.** Swept over all 42166 arm rows of the three recordings the
        // unsigned form has **5 violations**, all in `fight-learned.json`, all
        // Fighter/limb 1, on the consecutive ticks 195-199 -- worst at tick 198
        // with the outward elbow 0.024 from the axis against the inward one's
        // 0.066. The ten poses this test samples are all `fight.json`, which has
        // none, so the assertion asserted something false and could not find out.
        //
        // The mechanism is the metric rather than the solver. The two solves are
        // mirror images about the shoulder-to-hand midpoint, so the unsigned
        // comparison flips exactly when that midpoint crosses the body axis --
        // measured as an exact criterion, 0 mismatches over the 42166 rows. On
        // all five violating rows the outward elbow is on the **correct** side
        // (+0.001 to +0.069 along `outward`) and the inward one is 5 to 8 cm
        // *through* the chest (-0.052 to -0.082); an unsigned distance scores the
        // buried one as "further from the axis". The Fighter is reaching its
        // right arm across its own chest over those ticks and the arm is at 96 to
        // 99 percent of `armLength`, so at tick 200 the solve collapses and the
        // window closes.
        //
        // So the signed form is what is asserted, and it holds on **all 42166
        // rows** with a worst delta of exactly 0 -- the zeros being the 24900
        // collapsed solves (59% of the corpus) where the two planes give the same
        // point. It is algebraically `2 * dot(bend, outward)`, the same quantity
        // the next assertion states about the outward solve alone; stated here as
        // the comparison because that is the claim the bend plane was chosen on.
        assert.ok(outFromAxis(out) >= outFromAxis(into),
          `the outward elbow sits ${outFromAxis(out).toFixed(3)} from the body axis along `
            + `the outward normal and the inward one ${outFromAxis(into).toFixed(3)}, so the `
            + "plane chosen away from the torso is not the one further from it");
        // And on the outward side of the shoulder-to-hand line rather than the
        // inward one, which is the choice itself stated directly.
        const span = [hand[0] - shoulder[0], hand[1] - shoulder[1], hand[2] - shoulder[2]];
        const size = Math.hypot(...span);
        const along = span.map((value) => value / size);
        const offset = [out[0] - shoulder[0], out[1] - shoulder[1], out[2] - shoulder[2]];
        const bend = offset.map((value, index) => value - along[index] * dot(offset, along));
        assert.ok(dot(bend, outward) >= -1e-9,
          "the elbow bent toward the torso rather than away from it");
      }
    }
  }
  // The recorded numbers: the nearest the outward elbow ever comes to the body's
  // axis, against the nearest the inward one does, over the twenty solves above.
  //
  // **Scoped to those twenty and not a corpus-wide floor.** Over all 42166 arm
  // rows the outward elbow reaches 0.024 of the axis, at tick 198 of
  // `fight-learned.json`. What is corpus-wide is the assertion inside the loop
  // and the shape of the argument here: on the rows where the outward elbow is
  // near the axis, both elbows are, because they are near-straight arms reaching
  // across the body where an elbow has nowhere to go.
  [0, 1].forEach((body) => {
    const radius = FIGHT_BODIES[body].radii[1] / RAW;
    console.log(`    elbow: ${FIGHT_BODIES[body].kind} outward keeps ${worstOutward[body].toFixed(3)}`
      + ` from the body axis, inward ${worstInward[body].toFixed(3)};`
      + ` the published torso radius is ${radius.toFixed(3)}`);
    assert.ok(worstInward[body] < radius,
      `the inward plane must reach inside the ${FIGHT_BODIES[body].kind}'s published torso`);
    assert.ok(worstOutward[body] > worstInward[body],
      "the outward plane must keep the elbow further out than the inward one somewhere");
  });
  // **A hand further out than the two bones reach has no elbow to place**, which
  // is reachable: `reach` is horizontal only, so a low hand stretches the
  // published capsule past `armLength`. The arm is then drawn straight, which is
  // the published capsule exactly rather than a fudge.
  const straight = elbowOf([0, 1.4, 0], [1, 1.4, 0], [0, 0, -1], 0.3);
  assert.deepEqual(straight, [0.5, 1.4, 0]);
  // And an arm held straight out along the outward direction has no perpendicular
  // to bend along, so the elbow drops instead of vanishing.
  const sideways = elbowOf([0, 1.4, 0], [0, 1.4, -0.6], [0, 0, -1], 0.4);
  assert.ok(sideways[1] < 1.4, `a sideways arm's elbow sits at ${sideways[1]} rather than below 1.4`);
});

test("the_body_frames_the_proxy_is_built_on_are_rotations_rather_than_mirrors", () => {
  const { bodyAxes, sceneForward, scenePoint, yawFrame, directionFrame, shieldSocketFrame } = arenaGeometry;
  // **A reflection handed to `Quaternion.FromRotationMatrixToRef` is not a
  // quaternion of anything**, and the symptom is not a mirrored body: it is a
  // node that lands at an orientation no rotation produces, which on the yaw
  // frame read as a fighter permanently facing world `+x`. This is the assertion
  // that caught it, and it is the same determinant argument
  // `the_arena_axis_mapping_is_a_rotation_rather_than_a_mirror_of_the_world`
  // makes one level up.
  const determinant = (frame) =>
    frame.x[0] * (frame.y[1] * frame.z[2] - frame.y[2] * frame.z[1])
    - frame.x[1] * (frame.y[0] * frame.z[2] - frame.y[2] * frame.z[0])
    + frame.x[2] * (frame.y[0] * frame.z[1] - frame.y[1] * frame.z[0]);
  const orthonormal = (frame, what) => {
    for (const axis of ["x", "y", "z"]) {
      assert.ok(Math.abs(Math.hypot(...frame[axis]) - 1) < 1e-9, `${what}.${axis} is not a unit vector`);
    }
    assert.ok(Math.abs(dot(frame.x, frame.y)) < 1e-9, `${what} x and y are not perpendicular`);
    assert.ok(Math.abs(dot(frame.y, frame.z)) < 1e-9, `${what} y and z are not perpendicular`);
    assert.ok(Math.abs(determinant(frame) - 1) < 1e-9,
      `${what} has determinant ${determinant(frame)}, so it is a mirror`);
  };
  for (const yaw of [0, RAW / 8, RAW / 4, (RAW * 5) / 8, 64935, RAW - 1]) {
    orthonormal(yawFrame(yaw), `yawFrame(${yaw})`);
    // `left` is `up x forward`: world `+y`, which `fight/view.ts` argues is a
    // body's anatomical left, is scene `-z` at yaw zero.
    const { forward, left } = bodyAxes(yaw);
    const up = scenePoint(raw(0, 0, 1));
    const cross = [
      up[1] * forward[2] - up[2] * forward[1],
      up[2] * forward[0] - up[0] * forward[2],
      up[0] * forward[1] - up[1] * forward[0],
    ];
    cross.forEach((value, index) => assert.ok(Math.abs(value - left[index]) < 1e-12,
      `bodyAxes(${yaw}).left is the body's right`));
  }
  // Stated at yaw zero too, because that is where every fixture opens and it is
  // the case a reader can check by eye against the plan panel. `|| 0` folds the
  // negative zero `-forward[0]` produces, which `deepEqual` distinguishes and no
  // renderer does.
  assert.deepEqual(bodyAxes(0).left.map((value) => Math.round(value * 1e6) / 1e6 || 0),
    scenePoint(raw(0, 1, 0)));
  assert.deepEqual(bodyAxes(0).forward, sceneForward(0));
  for (const along of [[0, 1, 0], [1, 0, 0], [0, 0, 1], [0.3, -0.9, 0.2], [-1, 0, 0]]) {
    orthonormal(directionFrame(along, [0, 1, 0]), `directionFrame(${along})`);
  }
  for (const normal of [raw(1, 0, 0), raw(0, 1, 0), raw(-0.6, 0.8, 0), raw(0, 0, 1)]) {
    orthonormal(shieldSocketFrame({ centre: raw(0, 0, 1), normal, halfWidth: RAW / 4,
      halfHeight: RAW / 4, thickness: RAW / 20 }), `shieldSocketFrame(${normal})`);
  }
});

test("the_gait_is_a_pure_function_of_the_tick_and_never_an_integral", async () => {
  const { gaitOf, legsOf, GAIT_WALK_SPEED, GAIT_CADENCE, GAIT_MAX_STRIDE,
    GAIT_STRIDE_PER_SPEED, GAIT_LIFT } = arenaGeometry;
  // The constants, pinned. Every one of them is an invention, and an invention
  // nothing records is one that can drift without anybody noticing the picture
  // changed. `40` ticks a cycle is `1/40`; the rest are world units.
  assert.deepEqual([GAIT_CADENCE, GAIT_STRIDE_PER_SPEED, GAIT_MAX_STRIDE, GAIT_LIFT],
    [1 / 40, 4, 0.32, 0.06]);
  assert.equal(GAIT_WALK_SPEED, 0.003 * RAW);
  // The boundary is inclusive, so a body at exactly the threshold walks. Stated
  // because `>=` and `>` are one character apart and only the boundary tells them
  // apart.
  assert.equal(gaitOf(0, GAIT_WALK_SPEED).clip, "walk");
  assert.equal(gaitOf(0, GAIT_WALK_SPEED - 1e-9).clip, "idle");
  assert.equal(gaitOf(0, GAIT_WALK_SPEED - 1e-9).stride, 0);
  // The amplitude really is proportional to speed, and really is clamped.
  assert.ok(Math.abs(gaitOf(0, 0.02 * RAW).stride - 0.08) < 1e-9);
  assert.equal(gaitOf(0, 0.5 * RAW).stride, GAIT_MAX_STRIDE);
  // The phase really is the tick times the cadence, so a cadence change moves it.
  assert.ok(Math.abs(gaitOf(10, RAW).phase - 10 * GAIT_CADENCE * Math.PI * 2) < 1e-12);

  const region = [[0, 0, 0], [0, 0, 52428], 19660];
  const still = legsOf(region[0], region[1], region[2], 0, gaitOf(500, 0));
  // Standing: two legs under the hip, no stride, both feet on the floor. The
  // published capsule's lower end is at height zero on every recorded pose and
  // an idle proxy must not move it.
  assert.equal(still[0].foot[1], 0);
  assert.equal(still[1].foot[1], 0);
  assert.equal(still[0].foot[0], still[0].hip[0]);
  // Half the published radius each, half a published radius apart, so the pair's
  // outside edge is where the capsule's was.
  assert.ok(Math.abs(still[0].radius - (19660 / RAW) / 2) < 1e-9);
  const outer = Math.abs(still[0].hip[2] - still[1].hip[2]) / 2 + still[0].radius;
  assert.ok(Math.abs(outer - 19660 / RAW) < 1e-9, `the pair spans ${outer} against a published 0.3`);

  // **Walking: the two feet are half a cycle apart, checked at a tick where that
  // has content.** Tick 500 is `phase = 25*pi` exactly, where both offsets are
  // round-off at 1e-15 and their sign is decided by libm rather than by the gait
  // -- an assertion there passes on noise. Tick 510 is a quarter cycle off it.
  const moving = gaitOf(510, GAIT_WALK_SPEED * 4);
  const legs = legsOf(region[0], region[1], region[2], 0, moving);
  const ahead = legs.map((leg) => leg.foot[0] - leg.hip[0]);
  assert.ok(Math.min(...ahead.map(Math.abs)) > 0.5 * moving.stride,
    `tick 510 puts the feet at ${ahead}, which is too near together to mean anything`);
  assert.ok(ahead[0] * ahead[1] < 0, `both feet are on the same side: ${ahead}`);
  // And the same tick, recomputed, is the same legs.
  assert.deepEqual(legsOf(region[0], region[1], region[2], 0, gaitOf(510, GAIT_WALK_SPEED * 4)), legs);

  // **The scrub-invariance property lives at the call site, not here.** `gaitOf`
  // is a pure function and calling it twice cannot fail; what has to hold is that
  // `#poseRig` feeds it the tick rather than a counter, so reaching tick 1329
  // through 500 and through 2000 draws the same legs. Drawn, and compared on the
  // meshes.
  const harness = await arenaStageHarness();
  const { content, scene, engine } = harness;
  content.setMode("texture");
  const walkView = (tick) => {
    const poses = fightViews()[0].poses.map((pose) => ({ ...pose, vel: [GAIT_WALK_SPEED * 4, 0, 0] }));
    const frame = { ...fightViews()[0].view.frame, t: tick, poses };
    return { ...fightViews()[0].view, frame, next: frame };
  };
  const feet = () => ["0", "1"].map((index) =>
    absolute(scene.getMeshByName(`arena:proxy:0:leg:${index}:lower`)));
  content.show(walkView(500));
  content.show(walkView(1329));
  const forwards = feet();
  content.show(walkView(2000));
  content.show(walkView(1329));
  assert.deepEqual(feet(), forwards, "the gait remembered how the reader got to the tick");
  // And it really does move between ticks, so the assertion above is not two
  // copies of a body that never walks.
  content.show(walkView(1339));
  assert.notDeepEqual(feet(), forwards);
  content.dispose();
  scene.dispose();
  engine.dispose();
});

test("pressing_texture_and_geometry_swaps_the_dress_on_one_scene_and_one_set_of_cameras", async () => {
  const harness = await arenaStageHarness();
  const { content, scene, engine } = harness;
  const { view } = fightViews()[0];
  const cameras = [...content.firstPerson, content.threeQuarter];
  const snap = () => cameras.map((camera) => [camera.position.asArray(), camera.rotation.asArray(),
    camera.fov, camera.viewport.x, camera.viewport.y]);

  content.show(view);
  // Taken after the first draw, because the cameras are placed from the pose and
  // the question is whether the *mode* moves them, not whether the fight does.
  const before = snap();
  assert.equal(content.mode(), "geometry");
  const geometryKeys = content.keys();
  assert.ok(geometryKeys.some((key) => key.startsWith("0:region:")));
  assert.equal(geometryKeys.some((key) => key.startsWith("proxy:")), false);
  assert.equal(content.counts().shadowCasters, 0, "geometry has no light to cast from");
  assert.equal(scene.lights.length, 0);
  const flat = scene.getMeshByName("arena:0:region:1:shaft");
  assert.ok(flat);

  content.setMode("texture");
  content.redraw();
  assert.equal(content.mode(), "texture");
  const textureKeys = content.keys();
  assert.ok(textureKeys.some((key) => key.startsWith("proxy:0:")));
  assert.equal(textureKeys.some((key) => key.startsWith("0:region:")), false,
    "the published capsules must be retired rather than left under the proxy");
  assert.equal(flat.isDisposed(), true);
  // A key light and a hemispheric fill, and a caster list that is the proxy.
  assert.equal(scene.lights.length, 2);
  // **Every drawn proxy mesh casts, and the number is exact rather than a floor.**
  // A `>= 20` would pass with half the body silently not casting; this says the
  // list is precisely the proxy's own meshes, so a shape that stopped registering
  // fails whichever shape it was. No room here, so there are no walls in it.
  const proxyMeshes = scene.meshes.filter((mesh) => mesh.name.startsWith("arena:proxy:"));
  assert.ok(proxyMeshes.length >= 40, `two proxy bodies drew ${proxyMeshes.length} meshes`);
  assert.deepEqual(shadowRenderList(scene).map((mesh) => mesh.name).sort(),
    proxyMeshes.map((mesh) => mesh.name).sort());
  assert.equal(content.counts().shadowCasters, proxyMeshes.length);
  assert.match(content.describe(), /^texture, procedural floor/);

  // **The cameras did not move.** The mode is a property of the scene, so all
  // three panels change together and none of them is reframed.
  assert.deepEqual(snap(), before);
  assert.equal(scene.activeCameras.length, 3);

  // **The authored room is loaded before the press back, and that is what makes
  // the rest of this test able to fail.** Without it the shadow render list is
  // empty in `[Geometry]` for the trivial reason that the proxy's meshes were
  // disposed, and `counts().shadowCasters` reads zero whether it walks the list
  // or short-circuits on the mode. The room's 84 wall casters are retained across
  // the press, so from here on the two numbers are both non-zero and a reporter
  // that answered zero when the mode was off would be caught.
  await content.loadEnvironment(roomFetcher());
  content.redraw();
  assert.equal(content.describe(), "texture, authored room");
  // The ring's 84 tiles lay exactly 84 joined authored wall instances.
  const walls = 2 * (26 + 18) - 4;
  const litCasters = shadowRenderList(scene).length;
  assert.equal(litCasters, proxyMeshes.length + walls,
    "the caster list in [Texture] is the proxy plus the room's perimeter ring");
  assert.equal(content.counts().shadowCasters, litCasters);

  content.setMode("geometry");
  content.redraw();
  assert.deepEqual(content.keys(), geometryKeys);
  // **Read off the `Scene`, not off the counts** -- see `shadowRenderList`. What
  // this says is that the list is *exactly* the parked room and none of the
  // proxy's meshes survived into it; the earlier version asserted the list was
  // empty and could not fail, because with no room loaded there was nothing left
  // in it either way.
  //
  // **It is not what catches deleting the `removeShadowCaster` call in
  // `#retire`, and it never was.** Measured on this Babylon (9.18.1), for a
  // `Mesh` and for an `InstancedMesh` alike: `dispose()` already splices the mesh
  // out of every shadow generator's render list, so the call is belt and braces
  // and the list reaches the room's 84 with or without it. `StageNode.caster`
  // earns its keep on the other argument in its doc -- the linear scan -- and
  // that is now the only one it makes.
  const parked = shadowRenderList(scene).map((mesh) => mesh.name);
  assert.equal(parked.length, walls,
    `the parked room leaves ${parked.length} casters rather than its ${walls} walls`);
  assert.equal(parked.some((name) => name.startsWith("arena:proxy:")), false,
    "every proxy caster must leave the render list with its mesh");
  // **And the reporter is pinned to the list it reports on.** `counts()` used to
  // answer zero whenever the environment was disabled -- reintroducing that short
  // circuit is a one-line edit -- so the number the label carries is compared
  // against the `Scene`'s own list here rather than trusted. Non-zero on both
  // sides, which is the half the old round trip could not check.
  assert.equal(content.counts().shadowCasters, parked.length);
  assert.ok(content.counts().shadowCasters > 0,
    "a parked authored room retains its wall casters and the count must say so");
  assert.equal(scene.meshes.filter((mesh) => mesh.name.startsWith("arena:proxy:")).length, 0);
  console.log(`    casters: geometry 0 -> texture with the room ${litCasters}`
    + ` -> geometry ${parked.length} (the room parked, its walls still in the list)`);
  // The lights survive the round trip disabled rather than being rebuilt, so the
  // second press costs nothing.
  assert.equal(scene.lights.length, 2);
  assert.equal(scene.lights.every((light) => !light.isEnabled()), true);
  // And the label says the environment is still there, because the counts beside
  // it are what is retained rather than what is drawn.
  assert.equal(content.describe(), "geometry, room parked");
  content.setMode("texture");
  content.redraw();
  assert.deepEqual(content.keys(), textureKeys);
  content.dispose();
  assert.equal(scene.lights.length, 0);
  scene.dispose();
  engine.dispose();
});

/**
 * A fetcher over the checked-in room assets, with any one of them deleted.
 *
 * The real bytes, the real MIME types and the real hashes, so `loadRoomAsset`
 * runs its real validation; `absent` is the URL that answers 404, which is what
 * a tree with no room GLB in it looks like from inside the loader.
 */
function roomFetcher(absent = null) {
  return async (url) => {
    const name = String(url).endsWith(".glb") ? "room_slice.glb" : "room_slice.json";
    if (name === absent) return new Response(null, { status: 404, statusText: "Not Found" });
    const bytes = fs.readFileSync(path.join(ROOT, "web", "assets3d", name));
    return new Response(bytes, { status: 200, headers: {
      "content-type": name.endsWith(".glb") ? "model/gltf-binary" : "application/json",
    } });
  };
}

test("the_arena_room_lays_one_closed_joined_source_per_synthetic_ring_tile", () => {
  const tiles = arenaEnvironment.arenaTiles(fightHeader());
  assert.deepEqual(tiles, { cols: 26, rows: 18 });
  let ring = 0;
  let floors = 0;
  const pieces = new Map();
  for (let ty = 0; ty < tiles.rows; ty++) for (let tx = 0; tx < tiles.cols; tx++) {
    floors++;
    assert.equal(arenaEnvironment.arenaFloor(tx, ty),
      roomEnvironment.chooseRoomFloor(1592594996, tx, ty), `floor ${tx},${ty}`);
    const onRing = tx === 0 || ty === 0 || tx === tiles.cols - 1 || ty === tiles.rows - 1;
    if (!onRing) continue;
    ring++;
    const mine = arenaEnvironment.arenaWall(tx, ty, tiles);
    assert.equal(mine.length, 1, `ring tile ${tx},${ty} must be one joined source`);
    for (const wall of mine) pieces.set(wall.piece, (pieces.get(wall.piece) ?? 0) + 1);
  }
  assert.equal(floors, 26 * 18);
  assert.equal(ring, 2 * (26 + 18) - 4);
  const variants = new Set(Array.from({ length: tiles.cols * tiles.rows },
    (_, index) => arenaEnvironment.arenaFloor(index % tiles.cols, Math.floor(index / tiles.cols))));
  assert.deepEqual([...variants].sort(), ["floor_a", "floor_b", "floor_c", "floor_d"]);
  assert.deepEqual([...pieces.entries()].sort(),
    [["wall_inside", 4], ["wall_straight", ring - 4]]);
});

test("a_missing_room_asset_degrades_the_textured_mode_to_a_procedural_floor", async () => {
  const { NullEngine } = await import("@babylonjs/core/Engines/nullEngine.js");
  const { Scene } = await import("@babylonjs/core/scene.js");
  // **The asset is made unavailable rather than the code read.** v2-ui-03's
  // sentence is that a missing GLB degrades to the procedural floor and does not
  // throw, and the only way to check that is to take the file away and see what
  // the loader does with its own failure path.
  for (const absent of ["room_slice.glb", "room_slice.json"]) {
    const engine = new NullEngine({ renderWidth: 1280, renderHeight: 720 });
    const scene = new Scene(engine);
    scene.useRightHandedSystem = true;
    const environment = new arenaEnvironment.ArenaEnvironment(scene);
    environment.setEnabled(true);
    const floor = await environment.load(roomFetcher(absent));
    assert.equal(floor, "procedural", `a missing ${absent} must not take the mode down`);
    assert.match(environment.description(), /^procedural floor \(representative room asset failed/);
    environment.fit(fightHeader());
    const ground = scene.getMeshByName(arenaEnvironment.PROCEDURAL_FLOOR);
    assert.ok(ground, "the procedural floor is missing");
    assert.equal(ground.isEnabled(), true);
    assert.equal(ground.receiveShadows, true);
    assert.equal(environment.counts().instances, 0);
    assert.equal(environment.counts().lights, 2);
    environment.dispose();
    scene.dispose();
    engine.dispose();
  }

  // And the same environment with the real files present, so the fallback is a
  // fallback rather than the only path this has ever taken. The kit is the pinned
  // one -- same GLB, same sidecar, same hashes, same validator as `#/game`.
  const engine = new NullEngine({ renderWidth: 1280, renderHeight: 720 });
  const scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  const environment = new arenaEnvironment.ArenaEnvironment(scene);
  environment.setEnabled(true);
  // **Laid out before the load finishes and again after**, which is the order the
  // page really takes: pressing `[Texture]` draws immediately on the procedural
  // plane and the authored kit replaces it when its megabyte has been fetched and
  // hashed. A plane left enabled underneath would z-fight the floor it stood in
  // for, which is the visible failure this ordering has.
  environment.fit(fightHeader());
  assert.equal(scene.getMeshByName(arenaEnvironment.PROCEDURAL_FLOOR)?.isEnabled(), true);
  assert.equal(await environment.load(roomFetcher()), "authored");
  assert.equal(environment.description(), "authored room");
  environment.fit(fightHeader());
  // The arena is 24 by 16 and the room is laid one tile wider on every side, so
  // masonry can never stand where a body may: 26 by 18 floor tiles and a
  // perimeter ring of 2*(26+18)-4 one-piece joined wall tiles.
  assert.equal(environment.counts().instances, 26 * 18 + 2 * (26 + 18) - 4);
  assert.equal(environment.counts().shadowCasters, 2 * (26 + 18) - 4,
    "only the walls cast: a floor tile's shadow lands on the floor tile it is");
  assert.equal(scene.getMeshByName(arenaEnvironment.PROCEDURAL_FLOOR).isEnabled(), false,
    "the procedural plane must go when the authored floor arrives");
  // Every instance sits inside the arena's rectangle plus its one-tile margin,
  // in the arena's own axis mapping, where world `+y` is scene `-z`.
  const placed = scene.meshes.filter((mesh) => mesh.name.startsWith("arena-room:"));
  assert.equal(placed.length, environment.counts().instances);
  for (const mesh of placed) {
    assert.ok(mesh.position.x >= -1 && mesh.position.x <= 25, `x ${mesh.position.x}`);
    assert.ok(mesh.position.z <= 1 && mesh.position.z >= -17, `z ${mesh.position.z}`);
  }
  const rotatedWalls = placed.filter((mesh) =>
    mesh.name.startsWith("arena-room:wall_") && mesh.name.endsWith(":1"));
  assert.ok(rotatedWalls.length > 0);
  assert.ok(rotatedWalls.every((mesh) =>
    mesh.rotationQuaternion === null && mesh.rotation.y === Math.PI / 2),
  "the imported GLB quaternion must not override arena wall quarter turns");
  environment.setEnabled(false);
  assert.equal(placed.every((mesh) => !mesh.isEnabled()), true,
    "[Geometry] must leave no room instance enabled");
  // **A load after a load that already succeeded builds nothing**, which is the
  // weakest of the three things the memoisation is for and the only one this
  // sequential shape can check: `#load`'s own `this.#room !== null` early return
  // satisfies it whether or not `#loaded` is memoised at all. The two cases that
  // need `#loaded` -- a second press while the megabyte is still in flight, and a
  // press after a *failed* load -- are in
  // `the_authored_room_is_fetched_once_however_many_times_texture_is_pressed`,
  // which is where the mutation `#loaded ??=` -> `#loaded =` is caught.
  const meshesAfterOneLoad = scene.meshes.length;
  assert.equal(await environment.load(roomFetcher()), "authored");
  assert.equal(await environment.load(roomFetcher()), "authored");
  assert.equal(scene.meshes.length, meshesAfterOneLoad, "a second load built a second room");
  environment.dispose();
  assert.equal(scene.getMeshByName(arenaEnvironment.PROCEDURAL_FLOOR), null);
  scene.dispose();
  engine.dispose();
});

/**
 * The two things `ArenaEnvironment.load`'s `#loaded ??=` actually buys.
 *
 * The sequential repeat above cannot see either of them, and that was the whole
 * defect in it: awaiting load #1 before starting load #2 makes the equality hold
 * through `#load`'s `if (this.#room !== null) return this.floor`, so replacing
 * `#loaded ??=` with a plain `#loaded =` left it green. Both cases here fail on
 * that mutation, and they fail with the two costs the comment on `load` names:
 *
 * - **a press while the megabyte is in flight** starts a second `loadRoomAsset`,
 *   and the later `#room =` orphans the earlier `AssetContainer` -- its meshes and
 *   materials left in the `Scene` with nothing holding them and `dispose`
 *   releasing only the survivor. Measured on the mutation: 2 fetches become 4 and
 *   one container becomes two.
 * - **a press after a failed load** re-fetches, re-hashes and re-validates the
 *   whole kit, which `room-asset-contract.md` forbids in as many words. Measured
 *   on the mutation: three presses cost 6 fetches instead of 2.
 *
 * The container count is read as "no source mesh name is in the `Scene` twice"
 * rather than as `scene.meshes.length`, because a length is a number that can go
 * up for a dozen innocent reasons and a duplicated node name can only be a second
 * copy of the kit.
 */
test("the_authored_room_is_fetched_once_however_many_times_texture_is_pressed", async () => {
  const { NullEngine } = await import("@babylonjs/core/Engines/nullEngine.js");
  const { Scene } = await import("@babylonjs/core/scene.js");

  // ---- a second press while the first load is still in flight
  {
    const engine = new NullEngine({ renderWidth: 1280, renderHeight: 720 });
    const scene = new Scene(engine);
    scene.useRightHandedSystem = true;
    const before = new Set(scene.meshes);
    const environment = new arenaEnvironment.ArenaEnvironment(scene);
    environment.setEnabled(true);

    // The gate holds the *first* GLB request open, so a second attempt started
    // behind it is genuinely concurrent rather than merely repeated. The sidecar
    // is left alone: gating the first request either side of it would do, and
    // the GLB is the megabyte the comment on `load` is written about.
    let open;
    const gate = new Promise((resolve) => { open = resolve; });
    const bytes = roomFetcher();
    let fetches = 0;
    let held = false;
    const gated = async (url, init) => {
      fetches += 1;
      if (String(url).endsWith(".glb") && !held) { held = true; await gate; }
      return bytes(url, init);
    };

    const first = environment.load(gated);
    const second = environment.load(gated);
    // Both attempts reach the gate before it opens, which is what makes this the
    // in-flight case and not two presses in a row.
    await new Promise((resolve) => { setTimeout(resolve, 0); });
    open();
    assert.equal(await first, "authored");
    assert.equal(await second, "authored");

    assert.equal(fetches, 2,
      `a press while the room was in flight cost ${fetches} fetches rather than one sidecar and one GLB`);
    const added = scene.meshes.filter((mesh) => !before.has(mesh));
    assert.ok(added.length > 0, "the authored kit added no source mesh at all");
    assert.equal(new Set(added.map((mesh) => mesh.name)).size, added.length,
      `two presses left ${added.length} source meshes with duplicate names, so a container was orphaned`);
    assert.equal(environment.floor, "authored");
    environment.dispose();
    scene.dispose();
    engine.dispose();
  }

  // ---- three presses after a load that failed
  {
    const engine = new NullEngine({ renderWidth: 1280, renderHeight: 720 });
    const scene = new Scene(engine);
    scene.useRightHandedSystem = true;
    const environment = new arenaEnvironment.ArenaEnvironment(scene);
    environment.setEnabled(true);
    const bytes = roomFetcher("room_slice.glb");
    let fetches = 0;
    const counting = async (url, init) => { fetches += 1; return bytes(url, init); };

    for (const press of [1, 2, 3]) {
      assert.equal(await environment.load(counting), "procedural", `press ${press}`);
    }
    // One sidecar and one 404 for the GLB, once -- not once a press. The refusal
    // is remembered too, so the label does not flap between "not attempted" and
    // the stage the loader refused at.
    assert.equal(fetches, 2,
      `three presses after a failed load cost ${fetches} fetches; a failed authored room never retries`);
    assert.match(environment.description(), /^procedural floor \(representative room asset failed/);
    environment.dispose();
    scene.dispose();
    engine.dispose();
  }
});

test("the_textured_mode_reaches_its_floor_through_the_stage_a_reader_presses", async () => {
  // **The shipped path, end to end.** The check above builds a bare
  // `ArenaEnvironment`; this one goes the way a reader does -- `setMode` on the
  // content, the environment created on that press, the load driven from
  // `loadEnvironment`, and the sentence read off `describe()`, which is what
  // `arena.ts` hangs on the panel's label.
  const harness = await arenaStageHarness();
  const { content, scene, engine } = harness;
  const { view } = fightViews()[0];
  content.show(view);
  assert.equal(content.describe(), "geometry");

  content.setMode("texture");
  content.redraw();
  // Before the fetch: the procedural floor is already on the screen, which is
  // what makes the button feel like a button.
  assert.equal(content.describe(), "texture, procedural floor (not attempted)");
  assert.equal(scene.getMeshByName(arenaEnvironment.PROCEDURAL_FLOOR)?.isEnabled(), true);

  await content.loadEnvironment(roomFetcher("room_slice.glb"));
  content.redraw();
  assert.match(content.describe(), /^texture, procedural floor \(representative room asset failed/);
  assert.equal(scene.getMeshByName(arenaEnvironment.PROCEDURAL_FLOOR).isEnabled(), true,
    "a missing room GLB must leave the mode on its procedural floor");
  assert.ok(scene.meshes.some((mesh) => mesh.name.startsWith("arena:proxy:0:")),
    "a missing room must not take the fighter with it");
  // It renders. That is the whole of v2-ui-03's sentence -- a missing asset
  // degrades, it does not throw -- and it is checked by drawing rather than by
  // reading the source.
  scene.render();

  // **`[Geometry]` asks for nothing.** `setMode` calls `loadEnvironment` on every
  // press, so without the mode guard a reader flicking back would start a
  // megabyte of fetch for a mode that draws a line grid.
  content.setMode("geometry");
  let requests = 0;
  await content.loadEnvironment(async (...args) => { requests += 1; return roomFetcher()(...args); });
  assert.equal(requests, 0, "[Geometry] fetched the authored room");
  content.dispose();
  scene.dispose();
  engine.dispose();
});

/**
 * The silhouette check, as far as a `NullEngine` can take it.
 *
 * v2-18 asks that the fighter and its equipment read at 100--250 vertical pixels
 * without cyan outlines, which is roughly the first-person panel's size. **That
 * is a judgement about a picture and this is not one**: what can be checked here
 * is the arithmetic underneath it -- that at the bottom of that range nothing a
 * reader has to tell apart is sub-pixel, and that a body fills a usable fraction
 * of the panel at the span the page opens on. Whether the shapes actually
 * separate by eye is owed to a human and is recorded as owed in
 * `docs/performance/v2-arena-matrix.md`.
 *
 * **What the two halves measured**, so the numbers below can be checked rather
 * than believed. At the bottom of v2-18's range -- 100 vertical pixels of a
 * 1.8-unit body, 55.6 pixels a world unit -- the drawn sword is **4.4 pixels**
 * across, the drawn hand **11.1** and the drawn plate **27.8**. And the body
 * spans **120** of the 3/4 panel's **720** vertical pixels at **Span 15**, the
 * span the page actually opens on, which is inside v2-18's window at the bottom
 * end.
 *
 * **The body-extent assertion is bounded above by the panel and not by v2-18.**
 * Its upper bound is 720 -- the whole 3/4 panel -- rather than v2-18's 250, so a
 * body at 400 pixels passes a row named for a 100--250 window. That is a
 * deliberately different situation from the width floors below, where only the
 * bottom of the range is checked because 250 pixels is strictly easier and a row
 * that cannot fail is not a row. Here the *loose* direction is the one that can
 * fail, and the distance says so: the measured 120 sits 130 pixels under
 * v2-18's 250 and 600 under the 720 that is actually asserted. Whether to
 * tighten the bound to 250 is the owner's call and not this comment's.
 */
test("the_textured_proxy_is_not_sub_pixel_at_the_size_v2_18_asks_it_to_read_at", async () => {
  const harness = await arenaStageHarness();
  const { content, scene, engine } = harness;
  content.setMode("texture");
  const { view, poses } = fightViews()[3];
  content.show(view);

  // The panel, in pixels, out of the same rectangle the cameras are given.
  const { firstPersonA } = arenaGeometry.ARENA_VIEWPORTS;
  const panel = [1280 * firstPersonA.width, 720 * firstPersonA.height].map((v) => Math.round(v));
  assert.deepEqual(panel, [358, 360]);

  // **Measured off the meshes the proxy actually drew**, not off literals: a
  // version of this test computed the three widths from `2621`, `6553` and
  // `16384` written down here, so nothing about `client/src/arena/**` could move
  // it and it was arithmetic wearing a test's name. These are the drawn
  // diameters, in world units.
  const pose = poses[0];
  const width = (name) => {
    const mesh = scene.getMeshByName(name);
    assert.ok(mesh, `${name} is not drawn`);
    return Math.min(mesh.scaling.x, mesh.scaling.z);
  };
  const drawnSword = width("arena:proxy:0:weapon:right:shaft");
  const drawnHand = width("arena:proxy:0:hand:left");
  const plateMesh = scene.getMeshByName("arena:proxy:0:shield");
  assert.ok(plateMesh);
  const drawnPlate = Math.min(plateMesh.scaling.x, plateMesh.scaling.y);
  // ...and they are the published dimensions, so this is a silhouette claim about
  // the simulation rather than about the proxy's taste. The plate's width carries
  // the published normal's own length, because that is what the swept face is
  // built from and the drawn box follows it -- see `plateNormalLength`. The
  // factor is 1 - 3.7e-6 on this pose, so the difference is invisible in pixels
  // and this row would still pass without it; it is written out because a claim
  // about a published dimension has to be the dimension that was published.
  const sweptWidth = 2 * pose.shield.halfWidth / RAW
    * Math.hypot(...pose.shield.normal) / RAW;
  assert.ok(Math.abs(drawnSword - 2 * pose.weapons[1].radius / RAW) < 1e-6);
  assert.ok(Math.abs(drawnHand - 2 * FIGHT_BODIES[0].anatomy.handRadius / RAW) < 1e-6);
  assert.ok(Math.abs(drawnPlate - sweptWidth) < 1e-9,
    `the drawn plate is ${drawnPlate} against a swept ${sweptWidth}`);

  // A published Fighter is `standingHeight` 1.8 tall, so 100 vertical pixels of
  // body is 55.6 pixels a world unit. **Only the bottom of v2-18's range is
  // checked**: 250 pixels is strictly easier, so asserting it too would be a row
  // that cannot fail once the first passes.
  const perUnit = 100 / (FIGHT_BODIES[0].anatomy.standingHeight / RAW);
  const pixels = { sword: drawnSword * perUnit, hand: drawnHand * perUnit, plate: drawnPlate * perUnit };
  // The floors are a judgement and are stated as one: two pixels is the least a
  // line can be and still read as a line rather than as aliasing, and a hand and
  // a plate have to be bigger than the blade they are being told apart from.
  assert.ok(pixels.sword >= 2, `a sword ${pixels.sword.toFixed(1)} pixels across cannot read`);
  assert.ok(pixels.hand >= 2 * pixels.sword, `a hand ${pixels.hand.toFixed(1)} pixels across`);
  assert.ok(pixels.plate >= 4 * pixels.sword, `a plate ${pixels.plate.toFixed(1)} pixels across`);
  console.log(`    silhouette: at 100 vertical pixels of body the sword is ${pixels.sword.toFixed(1)}`
    + ` pixels across, the hand ${pixels.hand.toFixed(1)}, the plate ${pixels.plate.toFixed(1)}`);

  // **And how much of the 3/4 panel a body fills, at the span the page really
  // opens on.** `adopt` overrides the default the moment a fight loads --
  // `min(26, ceil(apart) + 4)` over two bodies about eleven units apart -- so
  // this is measured at Span 15 and not at the harness's 6.
  //
  // The extent is each mesh's own bounding box through the camera's transform,
  // not `centre.y +/- scaling.y/2`: that rule holds for a sphere and a vertical
  // shaft and over-reports a horizontal one by its whole length, which for a body
  // holding a sword out sideways is most of the answer. The weapon is left out
  // for the same reason -- v2-18's range is about the *body*.
  // The rule is read back out of the route rather than restated, so a change to
  // it fails here; the eleven is the recording's **first** frame, which these
  // five mid-fight ticks cannot supply -- at tick 2113 the two are 2.6 apart and
  // the page would be at Span 7 if it reframed itself, which it deliberately
  // does not.
  const route = fs.readFileSync(path.join(ROOT, "client/src/arena/arena.ts"), "utf8");
  assert.match(route, /Math\.min\(Number\(spanInput\.max\), Math\.ceil\(apart\) \+ 4\)/,
    "the arena no longer picks its opening span from the bodies' separation");
  assert.match(route, /spawns about eleven units/);
  const span = Math.min(26, Math.ceil(11) + 4);
  assert.equal(span, 15);
  content.show({ ...view, span: span * RAW });
  const camera = content.threeQuarter;
  camera.getViewMatrix(true);
  const transform = camera.getViewMatrix().multiply(camera.getProjectionMatrix(true));
  const drawn = scene.meshes.filter((mesh) =>
    mesh.name.startsWith("arena:proxy:0:") && !mesh.name.includes(":weapon:"));
  assert.ok(drawn.length >= 20, `a proxy body draws ${drawn.length} meshes`);
  let low = Infinity;
  let high = -Infinity;
  for (const mesh of drawn) {
    mesh.computeWorldMatrix(true);
    const box = mesh.getBoundingInfo().boundingBox;
    for (const corner of box.vectorsWorld) {
      const ndc = BabylonVector3.TransformCoordinates(corner, transform);
      low = Math.min(low, ndc.y);
      high = Math.max(high, ndc.y);
    }
  }
  const vertical = ((high - low) / 2) * 720;
  assert.ok(vertical >= 100 && vertical <= 720,
    `the body spans ${vertical.toFixed(0)} vertical pixels of the 3/4 panel`);
  console.log(`    silhouette: the Fighter's body spans ${vertical.toFixed(0)} vertical pixels of a `
    + `720-pixel 3/4 panel at Span ${span}, the span the page opens on`);
  content.dispose();
  scene.dispose();
  engine.dispose();
});

test("a_severed_arm_drops_the_same_limb_in_both_modes", async () => {
  // **No recorded fight severs anything**, and that is a finding rather than a
  // gap: all three fixtures carry zero `severed` bits and no absent region over
  // their 21083 published poses, so this is the only place either mode's
  // severance rule is exercised at all. It is exercised on the *same* pose in
  // both, which is the check v2-ui-03 asks for -- a proxy that kept drawing an
  // arm `[Geometry]` had dropped would be a body wearing a limb nothing swept.
  const harness = await arenaStageHarness();
  const { content, scene, engine } = harness;
  const { view, poses } = fightViews()[0];
  const severedView = (bits) => {
    const frame = { ...view.frame, poses: poses.map((pose) => ({ ...pose, severed: bits })) };
    return { ...view, frame, next: frame };
  };
  const held = (prefix) => content.keys().filter((key) => key.startsWith(prefix)).sort();

  for (const [mode, arm, hand, weapon, shield] of [
    ["geometry", "0:region:2", "0:hand:0", "0:weapon:1", "0:shield"],
    ["texture", "proxy:0:upper_arm:left", "proxy:0:hand:left", "proxy:0:weapon:right", "proxy:0:shield"],
  ]) {
    content.setMode(mode);
    content.show(severedView(0));
    assert.ok(held(arm).length > 0, `${mode} draws no left arm to sever`);
    assert.ok(held(hand).length > 0);
    assert.ok(held(shield).length > 0);
    // The left arm carries the plate on this fixture and the right the sword, so
    // the two bits have to be checked separately or a short circuit hides one.
    content.show(severedView(1 << 2));
    assert.deepEqual(held(arm), [], `${mode} kept a severed left arm`);
    assert.deepEqual(held(hand), [], `${mode} kept a severed arm's hand`);
    assert.deepEqual(held(shield), [], `${mode} kept a severed arm's shield`);
    assert.ok(held(weapon).length > 0, `${mode} dropped the intact arm's weapon`);
    content.show(severedView(1 << 3));
    assert.deepEqual(held(weapon), [], `${mode} kept a severed arm's weapon`);
    assert.ok(held(shield).length > 0, `${mode} dropped the intact arm's shield`);
    // A body whose whole arm is gone keeps everything else, so this is severance
    // and not a proxy that stopped drawing.
    assert.ok(content.keys().some((key) => key.includes("torso") || key.includes("region:1")));
  }
  content.dispose();
  scene.dispose();
  engine.dispose();
});

test("authored_arena_dress_matches_rig_endpoints_and_only_published_rows_open_reactions_or_detachments", async () => {
  const harness = await arenaStageHarness();
  const { content, scene, engine } = harness;
  content.setMode("texture");
  await content.loadEnvironment(
    async () => new Response(null, { status: 404 }),
    (url) => Promise.resolve(combatantResponse(url)),
  );
  const { view, poses } = fightViews()[0];
  content.show(view);
  assert.equal(content.keys().some((key) => key.startsWith("proxy:")), false,
    "a checked Fighter/Brute asset replaces the Texture proxy rather than covering it");
  assert.equal(content.keys().some((key) => /^\d+:region:|^\d+:hand:|^\d+:weapon:/.test(key)), false,
    "authored Texture must not overlay the Geometry control capsules");
  scene.render();
  const transform = (name) => scene.transformNodes.find((node) => node.name === name);
  for (const semantic of ["root", "hand_left", "hand_right", "socket_weapon_right", "socket_shield"]) {
    const driver = transform("arena:0:" + semantic);
    const authored = transform("arena:0:authored:FIGHTER_" + semantic);
    assert.ok(driver && authored, "missing endpoint " + semantic);
    const gap = BabylonVector3.Distance(driver.getAbsolutePosition(), authored.getAbsolutePosition());
    assert.ok(gap < 1e-4, semantic + " rendered endpoint drifted by " + gap);
  }
  const face = scene.getMeshByName("arena:0:authored:FIGHTER_lod_high_mesh_head_face");
  assert.ok(face && face.skeleton === null && face.parent === transform("arena:0:authored:FIGHTER_head"),
    "the rendered face must consume the authored head's joint-local space directly");
  const marker = (name) => transform("arena:0:authored:FIGHTER_" + name);
  assert.equal(marker("stagger").isEnabled(), false);
  assert.equal(marker("fall").isEnabled(), false);

  const contact = { a: [0, 0], b: [1, 0] };
  const struckFrame = { ...view.frame, contacts: [contact] };
  content.show({ ...view, frame: struckFrame, next: struckFrame });
  assert.equal(marker("stagger").isEnabled(), true,
    "a published contact naming the body is the stagger gate");
  const staggerGroup = scene.animationGroups.find(
    (group) => group.name === "arena:0:authored:FIGHTER_stagger");
  assert.ok(staggerGroup?.isStarted && staggerGroup.animatables.length > 0,
    "arena event selection must activate the authored AnimationGroup");
  const fallenFrame = { ...struckFrame, health: [0, RAW] };
  content.show({ ...view, frame: fallenFrame, next: fallenFrame });
  assert.equal(marker("fall").isEnabled(), true,
    "fall needs both a published event and the published dead health row");

  const severedPoses = poses.map((pose) => pose.id[0] === 0 ? { ...pose, severed: 1 << 2 } : pose);
  const severedFrame = { ...view.frame, poses: severedPoses, contacts: [] };
  content.show({ ...view, frame: severedFrame, next: severedFrame });
  for (const semantic of ["arm_left", "hand_left", "pauldron_left"]) {
    const mesh = scene.getMeshByName("arena:0:authored:FIGHTER_lod_high_mesh_" + semantic);
    assert.ok(mesh && !mesh.isEnabled(), "published left-arm severance kept " + semantic);
  }
  assert.equal(marker("stagger").isEnabled(), false,
    "severance state alone cannot synthesize a new stagger event");

  const authoredMeshes = scene.meshes.filter((mesh) =>
    mesh.name.startsWith("arena:0:authored:FIGHTER_lod_"));
  content.setMode("geometry");
  content.redraw();
  assert.ok(authoredMeshes.every((mesh) => !mesh.isEnabled()),
    "Geometry remains the control and parks every authored mesh");
  assert.equal(shadowRenderList(scene).some((mesh) => mesh.name.startsWith("arena:0:authored:")), false);
  content.clear();
  assert.ok(authoredMeshes.every((mesh) => mesh.isDisposed()),
    "clear must dispose every authored mesh and its cloned skeleton closure");
  content.dispose();
  scene.dispose();
  engine.dispose();
});

test("the_game_frame_meter_rolls_every_half_second_and_reports_the_worst_interval", () => {
  const meter = new frameMeter.GameFrameMeter();
  assert.equal(meter.advance(0), null);
  for (const now of [16, 32, 80, 160, 240, 320, 400, 500]) meter.advance(now);
  assert.deepEqual(meter.reading, Object.freeze({ fps: 16, worstMs: 100 }));
  assert.equal(meter.label, "16 FPS / 100 ms worst");
  assert.equal(meter.advance(516), null, "publishing starts a fresh half-second window");
});

test("the_frame_meter_discards_hidden_time_and_resets_between_route_mounts", () => {
  const meter = new frameMeter.GameFrameMeter();
  meter.advance(0);
  meter.advance(16);
  meter.reset(10_000);
  assert.equal(meter.advance(10_016), null);
  assert.equal(meter.reading, null);
  meter.advance(10_500);
  assert.deepEqual(meter.reading, Object.freeze({ fps: 4, worstMs: 484 }));
  const remounted = new frameMeter.GameFrameMeter();
  assert.equal(remounted.reading, null);
  assert.equal(remounted.label, "-- FPS / -- ms worst");
});

test("the_six_view_modes_share_one_worker_snapshot_and_identity_registry", async () => {
  assert.deepEqual(presentationMode.PRESENTATION_MODES,
    ["world", "geometry", "top_down", "first_person", "free", "dev"]);
  assert.equal(presentationMode.nextPresentationMode("world"), "geometry");
  assert.equal(presentationMode.nextPresentationMode("world", -1), "dev");
  assert.equal(presentationMode.presentationModeLabel("world"), "World");
  assert.equal(presentationMode.presentationModeLabel("first_person"), "First Person");
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const debug = new rendererDebug.RendererDebugRegistry();
  const calls = [];
  const owner = (name) => ({
    acceptSnapshot(value) { calls.push([name, "snapshot", value]); },
    setPresentationMode(value) { calls.push([name, "mode", value]); },
    reset() {}, dispose() {},
  });
  const environment = { ...owner("environment"), shadowGenerator: {} };
  const actors = owner("actors");
  const transients = owner("transients");
  const canvas = { clientWidth: 640, clientHeight: 360 };
  const camera = rendererCamera.createFixedIsometricCamera(scene, { width: 2, height: 1 }, 16 / 9);
  scene.activeCamera = camera;
  const renderer = new greyboxRenderer.GreyboxRenderer({
    engine, canvas, terminal: false, diagnostics: { requested: "webgl2", selected: "webgl2" },
    dispose() {},
  }, scene, debug, environment, actors, transients, camera, () => 0);
  renderer.stop();
  const world = snapshot();
  renderer.acceptSnapshot(world, 0);
  const sceneIdentity = renderer.scene;
  const cameraIdentity = renderer.camera;
  renderer.setPresentationMode("geometry");
  assert.equal(renderer.scene, sceneIdentity);
  assert.equal(renderer.camera, cameraIdentity);
  assert.equal(renderer.presentationMode, "geometry");
  renderer.setPresentationMode("world");
  assert.equal(calls.filter(([, kind]) => kind === "snapshot").length, 2,
    "the one accepted publication goes once to environment and transients only");
  assert.deepEqual(calls.filter(([, kind]) => kind === "mode").map(([name, , mode]) => [name, mode]), [
    ["actors", "geometry"], ["environment", "geometry"],
    ["actors", "world"], ["environment", "world"],
  ]);
  renderer.dispose();
  engine.dispose();
});
