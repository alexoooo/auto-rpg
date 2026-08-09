import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

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
  "client/src/render/renderer.ts", "client/src/render/performance.ts",
  "client/src/render/canvas-control.ts", "client/src/render/capture-controls.ts",
  "client/src/render/room-asset.generated.ts", "client/src/render/room-asset-contract.ts",
  "client/src/render/room-assets.ts", "client/src/render/room-environment.ts",
  "client/src/render/room-stress.ts", "client/src/render/room-review.ts", "client/src/render/room-review-camera.ts",
  "client/src/input/greybox-input.ts", "client/src/bootstrap.ts",
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
const rendererDebug = await load("client/src/render/debug.js");
const rendererEnvironment = await load("client/src/render/environment.js");
const rendererActors = await load("client/src/render/actors.js");
const rendererTransients = await load("client/src/render/transients.js");
const greyboxInput = await load("client/src/input/greybox-input.js");
const bootstrap = await load("client/src/bootstrap.js");
const rendererPerformance = await load("client/src/render/performance.js");
const canvasControl = await load("client/src/render/canvas-control.js");
const captureControl = await load("client/src/render/capture-controls.js");
const roomAssetContract = await load("client/src/render/room-asset-contract.js");
const roomAssets = await load("client/src/render/room-assets.js");
const roomEnvironment = await load("client/src/render/room-environment.js");
const roomStress = await load("client/src/render/room-stress.js");
const roomReview = await load("client/src/render/room-review.js");
const roomReviewCamera = await load("client/src/render/room-review-camera.js");
const roomGenerated = await load("client/src/render/room-asset.generated.js");

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
  return {
    message: { epoch, tick, mapCols: 2, mapRows: 1, mapTileSizeMilli: ABI.MAP_TILE_MILLI,
      mapRevision: 4, visRevision: 5, furnitureRevision: 6 },
    view: { frame, map, vis, furniture, entityKey: () => "unused" },
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
  mapRevision: 1, visRevision: 1, furnitureRevision: 1,
  map: Object.freeze([255, 0, 1]), vis: Object.freeze([2, 1, 2]),
  units: Object.freeze([]), shots: Object.freeze([]), events: Object.freeze([]),
  furniture: Object.freeze([]),
  ...values,
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
  assert.deepEqual(actors.counts(), {
    meshes: 1, shadows: 0, labels: 1, effects: 0, audio: 0, picking: 1, debug: 1,
  });
  const retiredMesh = scene.getMeshByName("actor:9:1");
  assert.ok(retiredMesh);

  const reused = unit({ key: "9:2", index: 9, generation: 2, x: 2.5, y: 0.5 });
  actors.acceptSnapshot(snapshot({ tick: 2, units: Object.freeze([reused]) }));
  assert.deepEqual(actors.keys(), ["9:2"]);
  assert.deepEqual(actors.counts(), {
    meshes: 1, shadows: 0, labels: 1, effects: 0, audio: 0, picking: 1, debug: 1,
  });
  assert.equal(retiredMesh.isDisposed(), true);
  assert.ok(scene.getMeshByName("actor:9:2"));
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
  actors.dispose();
  assert.deepEqual(debug.snapshot(), {
    meshes: 0, instances: 0, draws: 0, triangles: 0, lights: 0, shadowCasters: 0,
    visibility: { geometry: 0, units: 0, shots: 0, events: 0, furniture: 0,
      effects: 0, audio: 0, picking: 0, debug: 0 },
  });
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
  const names = ["floor_a", "floor_b", "wall_straight", "wall_inside", "wall_outside", "wall_end",
    "door_frame", "door_leaf", "torch_bracket", "decal_rubble", "decal_root", "prop_barrel"];
  const pieces = new Map();
  const floor = new StandardMaterial("floor_current", scene);
  const stone = new StandardMaterial("stone_current", scene);
  const wood = new StandardMaterial("wood_current", scene);
  const metal = new StandardMaterial("metal_current", scene);
  for (const name of names) {
    const source = MeshBuilder.CreateBox(`ROOM_${name}`, { size: 1 }, scene);
    source.isVisible = false;
    source.isPickable = false;
    source.setEnabled(true);
    source.material = name.startsWith("floor_") ? floor :
      ["wall_straight", "wall_inside", "wall_outside", "wall_end", "door_frame", "decal_rubble"].includes(name) ? stone :
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
    pieces, materials: new Map([["floor_current", floor], ["stone_current", stone], ["wood_current", wood], ["metal_current", metal]]),
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
    ["tile:1:0:floor", "tile:2:0:floor", "tile:2:0:wall"]);
  assert.deepEqual(room.keys().filter((key) => key.startsWith("furniture:")),
    [`furniture:${ABI.FURNITURE_DOOR}:2:0:frame`, `furniture:${ABI.FURNITURE_DOOR}:2:0:leaf`]);
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
  assert.deepEqual(room.counts(), { geometry: 2, furniture: 0, instances: 2, lights: 1,
    shadowCasters: 0, triangles: 24 });
  assert.equal(debug.snapshot().visibility.picking, 0);
  assert.equal(debug.snapshot().visibility.debug, 0);
  assert.ok(scene.meshes.filter((mesh) => mesh.name.startsWith("room:tile:"))
    .every((mesh) => mesh.sourceMesh?.material?.name.endsWith(":remembered") &&
      mesh.sourceMesh.material.alpha === 0.42));
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
  assert.equal(rememberedSources.length, 6);
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

test("room_door_torch_socket_and_wall_orientation_use_only_general_semantic_rules", async () => {
  const world = snapshot({ mapCols: 3, mapRows: 3,
    map: Object.freeze([255, 0, 255, 0, 1, 1, 255, 1, 255]),
    vis: Object.freeze([0, 2, 0, 2, 2, 2, 0, 2, 0]) });
  assert.deepEqual(roomEnvironment.chooseRoomWall(world, 1, 1), { piece: "wall_inside", quarterTurns: 1 });
  assert.deepEqual(roomEnvironment.chooseRoomWall(snapshot({ mapCols: 3, mapRows: 1,
    map: Object.freeze([1, 1, 1]), vis: Object.freeze([2, 2, 2]) }), 1, 0),
  { piece: "wall_straight", quarterTurns: 0 });
  assert.deepEqual(roomEnvironment.chooseRoomWall(snapshot({ mapCols: 1, mapRows: 3,
    map: Object.freeze([1, 1, 1]), vis: Object.freeze([2, 2, 2]) }), 0, 1),
  { piece: "wall_straight", quarterTurns: 1 });
  assert.equal(roomEnvironment.chooseRoomFloor(1592594996, 4, 5),
    roomEnvironment.chooseRoomFloor(1592594996, 4, 5));
  const { NullEngine } = await import("@babylonjs/core/Engines/nullEngine.js");
  const { Scene } = await import("@babylonjs/core/scene.js");
  const engine = new NullEngine(); const scene = new Scene(engine);
  const debug = new rendererDebug.RendererDebugRegistry();
  const room = new roomEnvironment.RoomEnvironmentPresentation(scene, debug, await fakeRoomAsset(scene));
  room.acceptSnapshot(snapshot({ mapCols: 2, mapRows: 1,
    map: Object.freeze([ABI.MAP_SOLID, ABI.MAP_OPEN]), vis: Object.freeze([2, 2]),
    furniture: Object.freeze([
      Object.freeze({ key: `${ABI.FURNITURE_DOOR}:0:0`, kind: ABI.FURNITURE_DOOR,
        tx: 0, ty: 0, state: ABI.FURNITURE_DOOR_OPEN }),
      Object.freeze({ key: `${ABI.FURNITURE_TORCH}:1:0`, kind: ABI.FURNITURE_TORCH,
        tx: 1, ty: 0, state: ABI.TORCH_FACE_POS_Y }),
    ]) }));
  const leaf = scene.getMeshByName(`room:furniture:${ABI.FURNITURE_DOOR}:0:0:leaf`);
  const bracket = scene.getMeshByName(`room:furniture:${ABI.FURNITURE_TORCH}:1:0:bracket`);
  const light = scene.getLightByName(`room:torch:${ABI.FURNITURE_TORCH}:1:0`);
  const flame = scene.getMeshByName(`room:torch:${ABI.FURNITURE_TORCH}:1:0:flame`);
  assert.equal(leaf.rotation.y, Math.PI / 2);
  assert.equal(bracket.rotation.y, Math.PI / 2);
  assert.deepEqual([light.position.x, light.position.y, light.position.z], [1.5 - 0.14, 0.48, 0.5]);
  assert.deepEqual([light.diffuse.r, light.diffuse.g, light.diffuse.b], [1, 0.42, 0.12]);
  assert.deepEqual([light.specular.r, light.specular.g, light.specular.b], [1, 0.56, 0.24]);
  assert.deepEqual([flame.position.x, flame.position.y, flame.position.z],
    [light.position.x, light.position.y, light.position.z]);
  assert.equal(flame.isPickable, false);
  assert.equal(flame.receiveShadows, false);
  assert.deepEqual([flame.material.emissiveColor.r, flame.material.emissiveColor.g,
    flame.material.emissiveColor.b], [1, 0.3, 0.055]);
  assert.equal(debug.snapshot().visibility.effects, 1);
  assert.equal(room.shadowGenerator.getShadowMap().renderList.length, room.counts().shadowCasters);
  room.dispose();
  assert.equal(flame.isDisposed(), true);
  assert.equal(scene.getMaterialByName("room:torch-flame-material"), null);
  scene.dispose(); engine.dispose();
});

test("the_fixed_room_stress_fixture_has_the_named_asset_hash_population_and_piece_counts", async () => {
  const { createHash } = await import("node:crypto");
  const fixture = roomStress.createRoomStressFixture();
  assert.deepEqual([fixture.mapCols, fixture.mapRows, fixture.map.length, fixture.units.length], [48, 32, 1536, 64]);
  assert.equal(fixture.map.filter((value) => value === ABI.MAP_SOLID).length, 176);
  const floors = { floor_a: 0, floor_b: 0 };
  for (let ty = 0; ty < fixture.mapRows; ty++) for (let tx = 0; tx < fixture.mapCols; tx++) {
    floors[roomEnvironment.chooseRoomFloor(fixture.generatorSeed, tx, ty)]++;
  }
  assert.deepEqual(floors, { floor_a: 768, floor_b: 768 });
  const walls = { wall_straight: 0, wall_inside: 0, wall_outside: 0, wall_end: 0 };
  for (let ty = 0; ty < fixture.mapRows; ty++) for (let tx = 0; tx < fixture.mapCols; tx++) {
    if (fixture.map[ty * fixture.mapCols + tx] === ABI.MAP_SOLID) {
      walls[roomEnvironment.chooseRoomWall(fixture, tx, ty).piece]++;
    }
  }
  assert.deepEqual(walls, { wall_straight: 160, wall_inside: 4, wall_outside: 8, wall_end: 4 });
  assert.deepEqual(Object.fromEntries(["decal_rubble", "decal_root", "prop_barrel"].map((piece) =>
    [piece, fixture.roomDecorations.filter((item) => item.piece === piece).length])),
    { decal_rubble: 4, decal_root: 4, prop_barrel: 4 });
  assert.deepEqual(fixture.pieceCounts, { floor_a: 768, floor_b: 768, wall_straight: 160,
    wall_inside: 4, wall_outside: 8, wall_end: 4, door_frame: 2, door_leaf: 2,
    torch_bracket: 8, decal_rubble: 4, decal_root: 4, prop_barrel: 4 });
  assert.equal(createHash("sha256").update(Buffer.from(fixture.map)).digest("hex"), roomStress.ROOM_STRESS_MAP_SHA256);

  const { NullEngine } = await import("@babylonjs/core/Engines/nullEngine.js");
  const { Scene } = await import("@babylonjs/core/scene.js");
  const engine = new NullEngine(); const scene = new Scene(engine);
  const debug = new rendererDebug.RendererDebugRegistry();
  const room = new roomEnvironment.RoomEnvironmentPresentation(scene, debug, await fakeRoomAsset(scene));
  room.acceptSnapshot(fixture);
  assert.deepEqual(room.counts(), { geometry: 1712, furniture: 22, instances: 1736,
    lights: 9, shadowCasters: 1736, triangles: room.counts().triangles });
  assert.equal(debug.snapshot().draws, 20);
  assert.equal(debug.snapshot().visibility.effects, 8);
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
  const lighting = roomReview.applyCompactRoomReviewLighting(scene);
  const debug = new rendererDebug.RendererDebugRegistry();
  const room = new roomEnvironment.RoomEnvironmentPresentation(scene, debug, await fakeRoomAsset(scene));
  room.acceptSnapshot(fixture);
  assert.deepEqual(room.counts(), { geometry: 208, furniture: 18, instances: 228,
    lights: 5, shadowCasters: 228, triangles: room.counts().triangles });
  assert.equal(scene.lights.length, 6, "review fill is separate from the room key and four torches");
  assert.deepEqual([scene.clearColor.r, scene.clearColor.g, scene.clearColor.b, scene.clearColor.a],
    [0.018, 0.026, 0.055, 1]);
  assert.equal(scene.lights.filter((light) => light.name === "room-review:hemispheric-fill").length, 1);
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
  owner.dispose(); owner.dispose();
  assert.equal(scene.cameras.length, 0);
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
  assert.deepEqual(commands, [{ kind: "goto", xMilli: 1250, yMilli: 500 }, { kind: "withdraw" }]);
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
  assert.equal(commands.length, 2);
  input.dispose();
  blocked = false;
  canvas.dispatchEvent(pointer);
  canvas.dispatchEvent(pointerUp);
  fakeWindow.dispatchEvent(escape);
  await Promise.resolve();
  assert.equal(commands.length, 2);
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
  const passive = { acceptSnapshot() {}, reset() {}, dispose() {} };
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

test("free_room_review_blocks_initial_and_toggled_canvas_and_toolbar_commands_until_fixed_restores", async () => {
  const entrySource = fs.readFileSync(path.join(ROOT, "client", "src", "v2.ts"), "utf8");
  assert.match(entrySource, /const submit = async[\s\S]*roomReviewInteractionBlocked\(renderer\)[\s\S]*application\.command\(command\)/);
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
  const passive = { acceptSnapshot() {}, reset() {}, dispose() {} };
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

test("vite_build_does_not_overwrite_legacy_page_or_assets", () => {
  const legacyPaths = ["web/index.html", "web/main.js", "web/style.css"].filter((name) => fs.existsSync(path.join(ROOT, name)));
  const before = new Map(legacyPaths.map((name) => [name, fs.readFileSync(path.join(ROOT, name))]));
  const build = spawnSync(process.execPath, [path.join(ROOT, "node_modules", "vite", "bin", "vite.js"), "build"],
    { cwd: ROOT, encoding: "utf8", shell: false });
  assert.equal(build.status, 0, `production build failed:\n${build.stdout}\n${build.stderr}\n${build.error ?? ""}`);
  for (const [name, contents] of before) assert.deepEqual(fs.readFileSync(path.join(ROOT, name)), contents);
  assert.ok(fs.existsSync(path.join(ROOT, "dist", "v2.html")));
  assert.ok(fs.existsSync(path.join(ROOT, "dist", "web.wasm")));
  assert.deepEqual(fs.readdirSync(path.join(ROOT, "dist", "assets3d")).sort(),
    ["room_slice.glb", "room_slice.json"]);
  assert.deepEqual(fs.readFileSync(path.join(ROOT, "dist", "assets3d", "room_slice.glb")),
    fs.readFileSync(path.join(ROOT, "web", "assets3d", "room_slice.glb")));
  assert.deepEqual(fs.readFileSync(path.join(ROOT, "dist", "assets3d", "room_slice.json")),
    fs.readFileSync(path.join(ROOT, "web", "assets3d", "room_slice.json")));
  assert.equal(fs.existsSync(path.join(ROOT, "dist", "assets3d", "room_slice.validator.json")), false);
  const scripts = fs.readdirSync(path.join(ROOT, "dist", "assets")).filter((name) => name.endsWith(".js"));
  assert.ok(scripts.length >= 2);
  const scriptSources = new Map(scripts.map((name) => [name,
    fs.readFileSync(path.join(ROOT, "dist", "assets", name), "utf8")]));
  const loaderChunks = [...scriptSources].filter(([, source]) =>
    source.includes("RegisterGLTF2Loader") || source.includes("Unsupported version:"));
  assert.ok(loaderChunks.length >= 1, "representative route must emit a lazy glTF 2 loader chunk");
  const roomAssetChunks = [...scriptSources].filter(([, source]) =>
    source.includes("representative room asset failed"));
  assert.equal(roomAssetChunks.length, 1, "the room asset boundary must remain an identifiable lazy chunk");
  const builtHtml = fs.readFileSync(path.join(ROOT, "dist", "v2.html"), "utf8");
  for (const [name] of [...loaderChunks, ...roomAssetChunks]) {
    assert.doesNotMatch(builtHtml, new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      "the glTF loader must stay outside the initial modulepreload closure");
  }
  const html = fs.readFileSync(path.join(ROOT, "web", "v2.html"), "utf8");
  assert.match(html, /legacy page/);
  assert.match(html, /button:disabled, button:disabled:hover/);
  assert.match(html, /id="performance-start" type="button" disabled/);
  assert.match(html, /id="interaction-hint"/);
  assert.match(html, /id="performance-progress" max="150" value="0"/);
  assert.match(html, /id="performance-status" aria-live="polite"/);
  assert.match(html, /id="room-camera-toggle" type="button" hidden/);
  assert.equal((html.match(/data-performance-metadata/g) ?? []).length, 6);
  for (const value of [
    "Windows 11 Home 25H2 build 26200.8973", "13th Gen Intel Core i7-13700H",
    "Intel Iris Xe Graphics", "32.0.101.7084", "Chrome 151.0.7922.72", "AC / Balanced",
  ]) assert.match(html, new RegExp(`value="${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
  const entry = fs.readFileSync(path.join(ROOT, "client", "src", "v2.ts"), "utf8");
  assert.match(entry, /rendererParameter === "canvas"/);
});

test("the_representative_room_and_gltf_loader_stay_outside_the_ordinary_route_closure", () => {
  const entry = fs.readFileSync(path.join(ROOT, "client", "src", "v2.ts"), "utf8");
  const staticImports = entry.slice(0, entry.indexOf("const element"));
  for (const module of ["room-assets", "room-environment", "room-review-camera", "room-stress", "room-review"]) {
    assert.doesNotMatch(staticImports, new RegExp(module));
    assert.match(entry, new RegExp(`import\\(\"\\./render/${module}\\.js\"\\)`));
  }
  assert.match(entry, /representativeRoom\s*\?\s*await Promise\.all/);
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
    const validator = await fetch(`${origin}/assets3d/room_slice.validator.json`);
    assert.equal(validator.status, 404, "validator provenance must not be a runtime asset");
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
  assert.equal(valid.pieces.length, 12);
  assert.deepEqual(valid.styling, { id: "readable-stone-v1", mode: "deterministic-vertex-color",
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
    { ...source, payloadBytes: 25_165_825 },
    { ...source, counts: { ...source.counts, materials: 5 } },
    { ...source, estimatedGpuResidency: { ...source.estimatedGpuResidency,
      sourceBufferBytes: 268_435_456, totalBytes: 272_851_968 } },
    { ...source, estimatedGpuResidency: { ...source.estimatedGpuResidency,
      shadowMapBytes: 4_194_303, totalBytes: source.estimatedGpuResidency.totalBytes - 1 } },
    { ...source, pieces: source.pieces.map((piece, index) => index === 0 ?
      { ...piece, vertexCount: 25_165_825 } : piece),
      counts: { ...source.counts, vertices: 25_166_305 } },
  ];
  for (const value of malformed) {
    assert.throws(() => roomAssetContract.parseRoomAssetSidecar(Buffer.from(JSON.stringify(value))),
      /room sidecar/);
  }
  assert.throws(() => roomAssetContract.parseRoomAssetSidecar(new Uint8Array(4 * 1024 * 1024 + 1)),
    /byte length/);
});

function fakeRoomContainer(sidecar) {
  let disposals = 0;
  const vector = ([x, y, z]) => ({ x, y, z });
  const quaternion = ([x, y, z, w]) => ({ x, y, z, w });
  const materialCompiles = [];
  const floorTexture = { name: "floor_current (Base Color)" };
  const wallTexture = { name: "stone_current (Base Color)" };
  const materials = new Map(["floor_current", "stone_current", "wood_current", "metal_current"].map((name) => [name, {
    name,
    albedoTexture: name === "floor_current" ? floorTexture : name === "stone_current" ? wallTexture : null,
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
    cameras: [], lights: [], textures: [floorTexture, wallTexture], skeletons: [], animations: [], animationGroups: [],
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
  assert.equal(asset.pieces.size, 12);
  assert.equal(asset.materials.size, 4);
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
