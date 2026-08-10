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

// ------------------------------------------------------- the boundary clinch
//
// Two duel rows walked into each other, arms sweeping, until a tick spends every
// contact group ordinal. Everything below is a byte table and a phase counter:
// no positions are read back and no angle is computed here, which is deliberate
// twice over. The trajectory is chaotic -- a raw unit of difference in the walk
// vector moves the cap tick or loses it entirely -- so a JavaScript `atan2`
// steering off published positions would be pinning the last ulp of whatever
// engine ran the test. And the same fifty-five bytes are built from the same
// documented offsets in `crates/web/src/lib.rs`, by hand on both sides, so the
// two targets agreeing means the ABI agrees rather than that `sim` agrees with
// itself. Every constant is stated where it comes from in that file's
// `CLINCH_*` block; the reasoning is not repeated here.
const CLINCH_YAW = [0x0f74, 0x8f74];
const CLINCH_WALK = [[58_976, 23_506], [-58_976, -23_506]];
const CLINCH_SWEEP = 8_192;
const CLINCH_PHASE_TICKS = 4;
const CLINCH_CAP_TICK = 85;
// Comfortably past 85 and still bounded: a drive that stopped clinching should
// fail this fixture, not hang the suite inside it.
const CLINCH_BUDGET = 128;

const SUBMITTED_COMMAND_BYTES = 55;
const HALF_RAW = 0x8000;
const ONE_RAW = 0x1_0000;

function clinchPayload(row, tick) {
  const phase = Math.floor(tick / CLINCH_PHASE_TICKS) % 4;
  const offset = phase === 1 ? CLINCH_SWEEP : phase === 3 ? -CLINCH_SWEEP : 0;
  const bearing = (CLINCH_YAW[row] + offset) & 0xffff;
  const bytes = new Uint8Array(SUBMITTED_COMMAND_BYTES);
  const view = new DataView(bytes.buffer);
  view.setUint16(0, 1, true); // SUBMITTED_COMMAND_LAYOUT_VERSION
  bytes[2] = 1; // an articulated command; byte 3 stays the reserved zero
  view.setInt32(4, CLINCH_WALK[row][0], true);
  view.setInt32(8, CLINCH_WALK[row][1], true);
  view.setUint16(12, CLINCH_YAW[row], true);
  // Intent, target and both grips stay zero: `Hold`, nobody, `Keep`.
  for (const arm of [23, 37]) {
    view.setUint16(arm, bearing, true);
    view.setInt32(arm + 2, HALF_RAW, true); // CombatHeight::MID
    view.setInt32(arm + 6, ONE_RAW, true); // full reach
    view.setInt32(arm + 10, ONE_RAW, true); // full effort
  }
  return bytes;
}

// Returns the tick the cap fired on. The scratch is re-read from
// `submitted_command_ptr()` on every write rather than kept as one view,
// because a fixture whose subject is "nothing detaches" is the last place to
// assume a view is still attached.
function driveToContactCap(wasm, checked) {
  for (let tick = 0; tick < CLINCH_BUDGET; tick++) {
    for (let row = 0; row < 2; row++) {
      const scratch = new Uint8Array(
        wasm.memory.buffer,
        wasm.submitted_command_ptr() >>> 0,
        SUBMITTED_COMMAND_BYTES,
      );
      scratch.set(clinchPayload(row, tick));
      const stored = wasm.submit_articulated(row, 0) >>> 0;
      assert.equal(stored, 1, `tick ${tick}: the boundary refused row ${row}'s clinch command`);
    }
    // Guarded on the capping tick and not on each of the eighty-six, which
    // costs this fixture nothing it was measuring: linear memory never
    // shrinks, a detached view never reattaches, and `FRAME` is a fixed array
    // whose pointer cannot come back -- so growth on tick 40 is still growth
    // when the guard runs. What the guard would add per tick is the *label*,
    // and eighty-six near-identical ones are not worth the shape check.
    if (tick === CLINCH_CAP_TICK) {
      checked(`contact cap, tick ${tick}`, () => wasm.step(1));
    } else {
      wasm.step(1);
    }
    if (wasm.contact_cap_hits() >>> 0 !== 0) return tick;
  }
  throw new Error(`the clinch drive spent ${CLINCH_BUDGET} ticks without exhausting a group ordinal`);
}

// The articulated contact warmup, as a browser drives it: construct, walk the
// roster at the row ceiling, tick, reset. A second fixture beside `exercise`
// rather than a branch inside it, because the two share no export but `step`
// -- an articulated world is a different world, not a different level.
//
// **The reset is inside the fixture, not around it.** `init_articulated_test`
// builds the replacement world while the outgoing one is still owned, so the
// peak footprint is two articulated worlds and it is the reset that reaches it.
// A fixture that stopped short of its own reset would be warming a smaller
// peak than the guarded cycles then drive, and the guard would fail on growth
// that is the warmup's rather than a regression.
function contactWarmup(wasm, abi, seed, guard = null) {
  const checked = (label, call) => {
    const result = call();
    publicationShape(wasm, abi);
    if (guard) guard(label);
    return result;
  };
  const reserved = (label) => assert.equal(
    wasm.contact_high_water() >>> 0,
    abi.MAX_UNITS,
    `${label}: the world is not reserved to the frame's row ceiling`,
  );

  checked(`init_articulated_test(${seed})`, () => wasm.init_articulated_test(seed));
  // The reservation is the whole subject, and it is the one thing flat memory
  // cannot evidence on its own: a `Vec`'s capacity is invisible from here, and
  // "nothing grew" reads identically for "reserved once, up front" and for
  // "nothing has grown it yet". This export is the difference between them.
  reserved(`init_articulated_test(${seed})`);

  // Toward the row ceiling. Every one of these is refused today and the
  // assertion says so, which is the honest state of the boundary rather than a
  // weak test: the host builds every spec with no articulated row, so an
  // articulated world turns the whole legacy spawn path away and not merely its
  // sixty-fifth caller. What is under test here is that the refusal is a `0`
  // and not a trap -- this loop failed as `RuntimeError: unreachable` before
  // v2-14C -- and that a refused spawn moves neither the reservation nor a
  // published pointer. It becomes a fill the day an articulated spawn lands on
  // the boundary: the loop bound is already the ceiling, and only the expected
  // return changes.
  for (let row = 0; row <= abi.MAX_UNITS; row++) {
    const standing = checked(`spawn_monster(${row})`, () => wasm.spawn_monster(3, 255, 255) >>> 0);
    assert.equal(standing, 0, `row ${row} walked into an articulated world through the legacy path`);
    reserved(`spawn_monster(${row})`);
  }

  // ---- the cap.
  //
  // The tick shape this whole fixture exists for. Every group ordinal spent,
  // the entity closure walked to a fixed point, and every frozen row restored
  // to its last-safe pose: whatever the solver was going to allocate per tick,
  // it allocates here or nowhere. Reaching it needs no export the boundary
  // lacks -- v2-11's `submit_articulated` steers an articulated row, and two
  // duel rows walked into each other with their arms sweeping reach the cap on
  // tick 85. (The blocker recorded here through v2-15 said otherwise. It was
  // reading the plan's next steering export as the only one, and missed the one
  // already on the wall.)
  const capTick = driveToContactCap(wasm, checked);
  assert.equal(capTick, CLINCH_CAP_TICK, "the clinch no longer caps where Rust says it does");
  // Once, not once per group, and the same number `crates/web`'s
  // `the_boundary_clinch_reaches_the_contact_group_cap` measures against the
  // same fifty-five bytes built from the same offsets on the other side.
  assert.equal(wasm.contact_cap_hits() >>> 0, 1, "the cap tick was counted more than once");
  reserved("contact cap");

  // At least one further tick, which is where a solver that reserved too little
  // would grow linear memory: the reservation above is per allocated slot, and
  // a per-tick allocation is exactly what it exists to remove. These ticks now
  // carry the whole solve, so what they prove has grown with it -- the group
  // driver, the eighteen-call alpha search, and the commit all run inside them,
  // and every one of those was a candidate for a per-tick allocation.
  checked("step(1)", () => wasm.step(1));
  checked("step(64)", () => wasm.step(64));
  reserved("step(64)");

  // The reset, on the same call the page would use to start over.
  checked(`reset init_articulated_test(${seed})`, () => wasm.init_articulated_test(seed));
  reserved(`reset init_articulated_test(${seed})`);
}

test("the_browser_contact_warmup_does_not_grow_wasm_memory", () => {
  const abi = generatedConstants();
  const wasm = instantiate();
  const seeds = [0, 1, 0xffff_ffff];

  // A legacy level first, and it is load-bearing rather than scene-setting:
  // `init_articulated_test` republishes neither the tiles, the fog nor the
  // furniture, so on an instance that has never seen an `init` all three are
  // zero-length -- and a zero-length retained view cannot witness a detach,
  // because a detached view reads a `byteLength` of zero too. This is the same
  // reason the legacy test above asserts its retained lengths are non-zero.
  wasm.init(1);
  // **Nine warm rounds, measured rather than chosen.** One is enough above
  // because that fixture never holds two worlds at once; this one does, on
  // every reset, and dlmalloc takes more than a single round of that pattern to
  // stop asking the host for pages.
  //
  // Re-measured with the clinch below in place, and the peak moved *down*: 207
  // pages from the end of round one and unchanged through round fourteen, where
  // the same fixture without the clinch sat at 207 through round six and then
  // stepped to 231 from round seven onward. Why doing more work settles the
  // allocator sooner is dlmalloc's business and not something this test can
  // evidence, so it is recorded rather than explained; what the numbers do say
  // is that one round would now do and nine is margin that costs half a second.
  // Two earlier readings, for the shape of the drift: before v2-15 it was 182
  // pages after round one and 206 from round two, and v2-15's regional volumes
  // took `ContactCollider` from 144 bytes to 352, which is about 40 KiB a world
  // and two worlds are live across every reset.
  //
  // The seeds are warmed in the order the guarded cycles drive them, because
  // `init_articulated_test` builds a whole legacy `Sim` -- a generated floor,
  // its nav fields and its fog -- before it replaces the world, and a floor's
  // footprint depends on its seed. None of that is what this test is about, and
  // warming it out of the way is what keeps the subject the reservation.
  for (let round = 1; round <= 9; round++) {
    for (const seed of seeds) contactWarmup(wasm, abi, seed);
  }

  const shape = publicationShape(wasm, abi);
  const memory = wasm.memory;
  const baselineBuffer = memory.buffer;
  const baselinePages = baselineBuffer.byteLength / 65_536;
  const baselineHighWater = wasm.contact_high_water() >>> 0;
  assert.ok(Number.isInteger(baselinePages) && baselinePages > 0, "wasm memory is not page-sized");
  assert.equal(baselineHighWater, abi.MAX_UNITS, "the warm articulated world is not reserved");

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
    assert.equal(
      wasm.contact_high_water() >>> 0,
      baselineHighWater,
      `${label}: the contact reservation moved`,
    );
  }

  for (let cycle = 1; cycle <= 4; cycle++) {
    for (const seed of seeds) {
      contactWarmup(wasm, abi, seed, (call) => (
        assertWarmInvariant(`seed ${seed}, cycle ${cycle}, ${call}`)
      ));
    }
  }
});

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
