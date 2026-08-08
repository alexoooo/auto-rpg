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
  "client/src/render/canvas-control.ts",
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

test("vite_build_does_not_overwrite_legacy_page_or_assets", () => {
  const legacyPaths = ["web/index.html", "web/main.js", "web/style.css"].filter((name) => fs.existsSync(path.join(ROOT, name)));
  const before = new Map(legacyPaths.map((name) => [name, fs.readFileSync(path.join(ROOT, name))]));
  const build = spawnSync(process.execPath, [path.join(ROOT, "node_modules", "vite", "bin", "vite.js"), "build"],
    { cwd: ROOT, encoding: "utf8", shell: false });
  assert.equal(build.status, 0, `production build failed:\n${build.stdout}\n${build.stderr}\n${build.error ?? ""}`);
  for (const [name, contents] of before) assert.deepEqual(fs.readFileSync(path.join(ROOT, name)), contents);
  assert.ok(fs.existsSync(path.join(ROOT, "dist", "v2.html")));
  assert.ok(fs.existsSync(path.join(ROOT, "dist", "web.wasm")));
  const scripts = fs.readdirSync(path.join(ROOT, "dist", "assets")).filter((name) => name.endsWith(".js"));
  assert.ok(scripts.length >= 2);
  const html = fs.readFileSync(path.join(ROOT, "web", "v2.html"), "utf8");
  assert.match(html, /legacy page/);
  const entry = fs.readFileSync(path.join(ROOT, "client", "src", "v2.ts"), "utf8");
  assert.match(entry, /rendererParameter === "canvas"/);
});
