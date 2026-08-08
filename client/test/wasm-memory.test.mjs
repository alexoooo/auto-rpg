import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const wasmPath = path.join(root, "target", "wasm32-unknown-unknown", "release", "web.wasm");
const abiPath = path.join(root, "client", "src", "protocol", "abi.generated.ts");

function generatedConstants() {
  const source = fs.readFileSync(abiPath, "utf8");
  const result = new Map();
  for (const match of source.matchAll(/^export const ([A-Z0-9_]+) = (\d+);$/gm)) {
    result.set(match[1], Number(match[2]));
  }
  const required = [
    "FRAME_MAX", "MAP_MAX", "FURNITURE_MAX", "FURNITURE_STRIDE", "HEADER_LEN",
    "UNIT_STRIDE", "SHOT_STRIDE", "EVENT_STRIDE", "MAX_UNITS", "MAX_SHOTS", "MAX_EVENTS",
    "HEADER_UNIT_COUNT", "HEADER_SHOT_COUNT", "HEADER_EVENT_COUNT", "HEADER_DEPTH",
    "HEADER_EVENTS_DROPPED",
  ];
  for (const name of required) assert.ok(result.has(name), `${name} is missing from generated ABI`);
  return Object.fromEntries(result);
}

function stubImport(kind) {
  if (kind === "function") return () => 0;
  if (kind === "memory") return new WebAssembly.Memory({ initial: 1 });
  if (kind === "table") return new WebAssembly.Table({ initial: 0, element: "anyfunc" });
  if (kind === "global") return new WebAssembly.Global({ value: "i32", mutable: true }, 0);
  throw new Error(`no wasm import stub for ${kind}`);
}

function importsFor(module) {
  const imports = {};
  for (const item of WebAssembly.Module.imports(module)) {
    imports[item.module] ??= {};
    imports[item.module][item.name] = stubImport(item.kind);
  }
  return imports;
}

function instantiate() {
  assert.ok(fs.existsSync(wasmPath), `missing ${wasmPath}; build release wasm before this test`);
  const module = new WebAssembly.Module(fs.readFileSync(wasmPath));
  return new WebAssembly.Instance(module, importsFor(module)).exports;
}

function publicationShape(wasm, abi) {
  const framePtr = wasm.frame_ptr() >>> 0;
  const frameLength = wasm.frame_len() >>> 0;
  const mapPtr = wasm.map_ptr() >>> 0;
  const mapLength = wasm.map_len() >>> 0;
  const visPtr = wasm.vis_ptr() >>> 0;
  const visLength = wasm.vis_len() >>> 0;
  const furniturePtr = wasm.furniture_ptr() >>> 0;
  const furnitureCount = wasm.furniture_len() >>> 0;
  const furnitureStride = wasm.furniture_stride() >>> 0;
  const mapCols = wasm.map_cols() >>> 0;
  const mapRows = wasm.map_rows() >>> 0;
  const rawRevisions = [wasm.map_revision(), wasm.vis_revision(), wasm.furniture_revision()];
  assert.ok(rawRevisions.every(Number.isInteger), "a publication revision is missing or not an integer");
  const [mapRevision, visRevision, furnitureRevision] = rawRevisions.map((value) => value >>> 0);
  const memoryBytes = wasm.memory.buffer.byteLength;

  assert.ok(
    frameLength >= abi.HEADER_LEN && frameLength <= abi.FRAME_MAX,
    `frame length ${frameLength} is outside ${abi.HEADER_LEN}..=${abi.FRAME_MAX}`,
  );
  assert.ok(mapLength <= abi.MAP_MAX, `map length ${mapLength} exceeds ${abi.MAP_MAX}`);
  assert.ok(visLength <= abi.MAP_MAX, `VIS length ${visLength} exceeds ${abi.MAP_MAX}`);
  assert.equal(mapCols * mapRows, mapLength, "map dimensions disagree with its published length");
  assert.equal(visLength, mapLength, "VIS length disagrees with the map");
  assert.ok(furnitureCount <= abi.FURNITURE_MAX, "furniture count exceeds emitted capacity");
  assert.equal(furnitureStride, abi.FURNITURE_STRIDE, "furniture stride disagrees with emitted ABI");
  assert.equal(framePtr % Float32Array.BYTES_PER_ELEMENT, 0, "FRAME pointer is not f32-aligned");
  const spans = [
    ["FRAME", framePtr, frameLength * Float32Array.BYTES_PER_ELEMENT],
    ["MAP", mapPtr, mapLength],
    ["VIS", visPtr, visLength],
    ["FURNITURE", furniturePtr, furnitureCount * furnitureStride],
  ];
  for (const [name, pointer, bytes] of spans) {
    assert.ok(pointer <= memoryBytes, `${name} pointer is outside wasm memory`);
    assert.ok(bytes <= memoryBytes - pointer, `${name} live extent is outside wasm memory`);
  }
  const frame = new Float32Array(wasm.memory.buffer, framePtr, frameLength);
  const counts = [
    ["unit", frame[abi.HEADER_UNIT_COUNT], abi.MAX_UNITS, abi.UNIT_STRIDE],
    ["shot", frame[abi.HEADER_SHOT_COUNT], abi.MAX_SHOTS, abi.SHOT_STRIDE],
    ["event", frame[abi.HEADER_EVENT_COUNT], abi.MAX_EVENTS, abi.EVENT_STRIDE],
  ];
  for (const [name, count, capacity] of counts) {
    assert.ok(Number.isInteger(count) && count >= 0 && count <= capacity, `${name} count is invalid`);
  }
  const packedLength = abi.HEADER_LEN + counts.reduce((sum, [, count, , stride]) => sum + count * stride, 0);
  assert.equal(frameLength, packedLength, "packed FRAME counts and strides disagree with frame_len");
  return {
    framePtr, frameLength, mapPtr, mapLength, visPtr, visLength,
    furniturePtr, furnitureBytes: furnitureCount * furnitureStride,
    mapRevision, visRevision, furnitureRevision,
  };
}

function callAndCheck(wasm, abi, guard, observeRevisions, label, call) {
  const result = call();
  const shape = publicationShape(wasm, abi);
  observeRevisions(label, shape);
  if (guard) guard(label);
  return result;
}

function exercise(wasm, abi, seed, guard = null, expectedInitialRevisions = null) {
  // This is the deterministic warm fixture specified by the worker-protocol plan.
  // It reaches the route and unit capacities, runs an event-heavy 4,096-tick path,
  // and replaces the map/furniture publications eight times. Furniture and event
  // live counts need not equal their backing capacities: those arrays are fixed;
  // this fixture exercises their write and wrap/drop paths without inventing state.
  let previousRevisions = null;
  let initialRevisions = null;
  const observeRevisions = (label, shape) => {
    const current = [shape.mapRevision, shape.visRevision, shape.furnitureRevision];
    if (previousRevisions === null) {
      initialRevisions = current;
      if (expectedInitialRevisions) {
        assert.deepEqual(current, expectedInitialRevisions, `${label}: init did not reset revisions consistently`);
      }
    } else {
      for (let i = 0; i < current.length; i++) {
        assert.ok(current[i] >= previousRevisions[i], `${label}: publication revision moved backwards`);
      }
    }
    previousRevisions = current;
  };
  const checked = (label, call) => callAndCheck(wasm, abi, guard, observeRevisions, label, call);

  checked(`init(${seed})`, () => wasm.init(seed));
  checked("route_clear", () => wasm.route_clear());
  for (let i = 0; i < 24; i++) {
    const length = checked(`route_push(${i + 1})`, () => (
      wasm.route_push(1_000 * i, 1_000) >>> 0
    ));
    assert.equal(length, i + 1, `route push ${i + 1}`);
  }
  const cappedLength = checked("route_push(cap)", () => (
    wasm.route_push(24_000, 1_000) >>> 0
  ));
  assert.equal(cappedLength, 24, "the twenty-fifth route point exceeded the route capacity");

  let rejected = false;
  for (let i = 0; i <= abi.MAX_UNITS; i++) {
    const standing = checked(`spawn_monster(${i})`, () => (
      wasm.spawn_monster(0, 0, 255) >>> 0
    ));
    if (standing === 0) {
      rejected = true;
      break;
    }
  }
  assert.ok(rejected, "spawn path did not reject within MAX_UNITS + 1 calls");
  const full = new Float32Array(
    wasm.memory.buffer,
    wasm.frame_ptr() >>> 0,
    wasm.frame_len() >>> 0,
  );
  assert.equal(
    full[abi.HEADER_UNIT_COUNT],
    abi.MAX_UNITS,
    "published frame did not reach the generated unit capacity",
  );

  checked("set_goto", () => wasm.set_goto(1_000, 1_000));
  checked("step(4096)", () => wasm.step(4_096));
  const eventFrame = new Float32Array(wasm.memory.buffer, wasm.frame_ptr() >>> 0, wasm.frame_len() >>> 0);
  assert.ok(eventFrame[abi.HEADER_EVENT_COUNT] <= abi.MAX_EVENTS, "event count exceeds its capacity");
  assert.ok(eventFrame[abi.HEADER_EVENTS_DROPPED] >= 0, "event drop count is invalid");

  for (let depth = 1; depth <= 8; depth++) {
    const reached = checked(`descend(${depth})`, () => wasm.descend() >>> 0);
    assert.equal(reached, depth, `forced descent did not reach depth ${depth}`);
    const descendedFrame = new Float32Array(
      wasm.memory.buffer,
      wasm.frame_ptr() >>> 0,
      wasm.frame_len() >>> 0,
    );
    assert.equal(descendedFrame[abi.HEADER_DEPTH], depth, `published frame omitted depth ${depth}`);
  }
  return initialRevisions;
}

test("published_legacy_views_survive_every_warm_path_without_memory_growth", () => {
  const abi = generatedConstants();
  const wasm = instantiate();

  const initialRevisions = exercise(wasm, abi, 1);
  const shape = publicationShape(wasm, abi);
  const memory = wasm.memory;
  const baselineBuffer = memory.buffer;
  const baselinePages = baselineBuffer.byteLength / 65_536;
  assert.ok(Number.isInteger(baselinePages) && baselinePages > 0, "wasm memory is not page-sized");

  const retained = [
    new Float32Array(baselineBuffer, shape.framePtr, shape.frameLength),
    new Uint8Array(baselineBuffer, shape.mapPtr, shape.mapLength),
    new Uint8Array(baselineBuffer, shape.visPtr, shape.visLength),
    new Uint8Array(baselineBuffer, shape.furniturePtr, shape.furnitureBytes),
  ];
  const retainedLengths = retained.map((view) => view.byteLength);
  assert.ok(retainedLengths.every((length) => length > 0), "warm fixture left an empty retained publication view");

  function assertWarmInvariant(label) {
    const after = publicationShape(wasm, abi);
    assert.equal(memory.buffer, baselineBuffer, `${label}: wasm.memory.buffer changed`);
    assert.equal(memory.buffer.byteLength / 65_536, baselinePages, `${label}: wasm memory grew`);
    assert.deepEqual(
      retained.map((view) => view.byteLength),
      retainedLengths,
      `${label}: a retained publication view detached`,
    );
    assert.equal(after.framePtr, shape.framePtr, `${label}: FRAME moved`);
    assert.equal(after.mapPtr, shape.mapPtr, `${label}: MAP moved`);
    assert.equal(after.visPtr, shape.visPtr, `${label}: VIS moved`);
    assert.equal(after.furniturePtr, shape.furniturePtr, `${label}: FURNITURE moved`);
  }

  for (const seed of [0, 1, 0xffff_ffff]) {
    for (let cycle = 1; cycle <= 4; cycle++) {
      exercise(
        wasm,
        abi,
        seed,
        (call) => assertWarmInvariant(`seed ${seed}, cycle ${cycle}, ${call}`),
        initialRevisions,
      );
    }
  }
});
