import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
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
    // The four articulated publications. Required rather than optional because
    // the fixtures below size their retained views off them: a missing constant
    // would read as `undefined`, a view of `undefined` length is zero-length,
    // and a zero-length view cannot witness a detach.
    //
    // **`REGION_*` joined this list in v2-ui-07 and the reason is a consumer.**
    // v2-ui-06 published the capsules and left the constants out here on the
    // honest ground that nothing retained a region view, so requiring them would
    // promise a check nobody made. The recorder holds one on every tick of a
    // 3,600-tick drive, so `arena_start_allocates_within_the_warm_set` retains it
    // and the promise is now kept.
    "POSE_LAYOUT_VERSION", "POSE_STRIDE", "MAX_POSES",
    "COMBAT_EVENT_LAYOUT_VERSION", "COMBAT_EVENT_STRIDE", "MAX_COMBAT_EVENTS",
    "REGION_LAYOUT_VERSION", "REGION_STRIDE", "REGIONS_PER_BODY", "MAX_REGIONS",
    "ARTICULATED_PROJECTILE_LAYOUT_VERSION", "ARTICULATED_PROJECTILE_STRIDE",
    "MAX_ARTICULATED_PROJECTILES",
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

  // **The waypoint queue was driven to its own cap here and the queue is gone.**
  // Twenty-five `route_push` calls reached `ROUTE_MAX` and a twenty-sixth was
  // capped, which was the one path in this fixture that grew a `Vec` the page
  // owned; the three route exports were deleted with the order channel they fed,
  // so what is left is the roster fill below -- still the only unbounded-looking
  // path a caller can drive -- and the eight floor builds after it.
  checked(`init(${seed})`, () => wasm.init(seed));

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

  // A publish without a step, which `set_goto` used to be the carrier for: the
  // frame is rebuilt and every buffer republished on an export that advances no
  // tick, and that is a shape the guard has to see. `set_control` is the channel
  // that survived and it republishes the same way.
  checked("set_control", () => wasm.set_control(1));
  checked("set_control(0)", () => wasm.set_control(0));
  // **Sixty-four ticks, and it was 4,096 until this floor grew joints.** The
  // batch is here for the event feed's wrap and drop path, and the number that
  // reaches it is measured rather than budgeted: with the roster at 64, a
  // `step(64)` fills the 128-row frame and drops 98, while `step(32)` publishes
  // 100 rows and drops none. So 64 is the first power of two past the drop
  // threshold, and the 4,096 above it was buying nothing this fixture asserts.
  // It was also costing seven to thirteen seconds a call against 350 ms -- 64
  // embodied bodies are not 64 legacy ones -- and this fixture runs eighteen
  // times, which took the file from four seconds to ten minutes.
  //
  // The drop count is asserted **non-zero**, which is what makes the reduction a
  // measurement instead of a budget: `>= 0` was true of every tick count
  // including the ones that never reach the path.
  checked("step(64)", () => wasm.step(64));
  const eventFrame = new Float32Array(wasm.memory.buffer, wasm.frame_ptr() >>> 0, wasm.frame_len() >>> 0);
  assert.ok(eventFrame[abi.HEADER_EVENT_COUNT] <= abi.MAX_EVENTS, "event count exceeds its capacity");
  assert.ok(eventFrame[abi.HEADER_EVENTS_DROPPED] > 0,
    "a 64-tick batch over a full roster no longer reaches the event feed's drop path");

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
// Re-recorded 89 -> 85 on 2026-08-16: Smart134 doubled the arm bearing rates,
// and the Rust owner (`CLINCH_CAP_TICK` in crates/web/src/lib.rs) moved with
// them while this mirror was missed.
// Re-recorded 85 -> 88 on 2026-08-16: freeing the shield normal to follow its
// arm made the old two-arm sweep spin the plate's facing and stop capping
// entirely, so the sweep is now the weapon arm's alone and the ordinal is
// exhausted three ticks later. The Rust owner is `CLINCH_CAP_TICK` in
// crates/web/src/lib.rs.
const CLINCH_CAP_TICK = 88;
// Comfortably past 88 and still bounded: a drive that stopped clinching should
// fail this fixture, not hang the suite inside it.
const CLINCH_BUDGET = 128;

// 57 since payload layout 2 appended one release verb per arm; 55 before it.
// The two new bytes sit after both grips, so every offset this file writes is
// unmoved and only the length and the version changed.
const SUBMITTED_COMMAND_BYTES = 57;
const HALF_RAW = 0x8000;
const ONE_RAW = 0x1_0000;

function clinchPayload(row, tick) {
  const phase = Math.floor(tick / CLINCH_PHASE_TICKS) % 4;
  const offset = phase === 1 ? CLINCH_SWEEP : phase === 3 ? -CLINCH_SWEEP : 0;
  const bearing = (CLINCH_YAW[row] + offset) & 0xffff;
  const bytes = new Uint8Array(SUBMITTED_COMMAND_BYTES);
  const view = new DataView(bytes.buffer);
  view.setUint16(0, 2, true); // SUBMITTED_COMMAND_LAYOUT_VERSION
  bytes[2] = 1; // an articulated command; byte 3 stays the reserved zero
  view.setInt32(4, CLINCH_WALK[row][0], true);
  view.setInt32(8, CLINCH_WALK[row][1], true);
  view.setUint16(12, CLINCH_YAW[row], true);
  // Intent, target and both grips stay zero: `Hold`, nobody, `Keep`.
  // The sweep is the weapon arm's; the guard arm holds the body bearing. It
  // swept both until 2026-08-16, when the shield normal began following the arm
  // that carries it -- after which sweeping the guard spins the plate's facing
  // by an eighth turn every four ticks and the drive never caps at all. Mirrors
  // `clinch_payload` in crates/web/src/lib.rs, which argues it at length.
  for (const arm of [23, 37]) {
    view.setUint16(arm, arm === 23 ? CLINCH_YAW[row] : bearing, true);
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

  // **To the row ceiling, and this loop is a fill now rather than a refusal.**
  // It asserted `0` on every call for as long as the host built every spec with
  // no articulated row: an articulated world turned the whole legacy spawn path
  // away, not merely its sixty-fifth caller. `Sim::walk_in` dresses the spec for
  // the world it is entering now, so the bodies arrive -- which is the case the
  // old comment reserved the loop bound for, and only the expected return
  // changed. What is under test is unchanged and is the interesting half either
  // way: the ceiling is reached, the sixty-fifth row is refused rather than
  // trapping, and neither the reservation nor a published pointer moves across
  // any of it.
  let refused = false;
  for (let row = 0; row <= abi.MAX_UNITS && !refused; row++) {
    const standing = checked(`spawn_monster(${row})`, () => wasm.spawn_monster(3, 255, 255) >>> 0);
    refused = standing === 0;
    reserved(`spawn_monster(${row})`);
  }
  assert.ok(refused, "the spawn path did not reject within MAX_UNITS + 1 calls");

  // **Back to the duel before the clinch, and this reset is load-bearing.** The
  // loop above used to be refused on every call, so it left the two-body world
  // exactly as it found it; it fills the roster now, and `CLINCH_CAP_TICK` is a
  // measurement of *two* rows walking into each other. Driving the clinch on a
  // floor holding sixty-four bodies is a different fixture that happens to use
  // the same bytes, and it caps somewhere else.
  checked(`duel before the clinch(${seed})`, () => wasm.init_articulated_test(seed));
  reserved(`duel before the clinch(${seed})`);

  // ---- the cap.
  //
  // The tick shape this whole fixture exists for. Every group ordinal spent,
  // the entity closure walked to a fixed point, and every frozen row restored
  // to its last-safe pose: whatever the solver was going to allocate per tick,
  // it allocates here or nowhere. Reaching it needs no export the boundary
  // lacks -- v2-11's `submit_articulated` steers an articulated row, and two
  // duel rows walked into each other with their arms sweeping reach the cap on
  // tick 89. (The blocker recorded here through v2-15 said otherwise. It was
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
  // Three earlier readings, for the shape of the drift: before v2-15 it was 182
  // pages after round one and 206 from round two, and v2-15's regional volumes
  // took `ContactCollider` from 144 bytes to 352, which is about 40 KiB a world
  // and two worlds are live across every reset; it then read 207 while
  // `MAX_COMBAT_EVENTS` was 1024 and reads **221** at the 2048 v2-17 checkpoint
  // B's busier fight required, which is the 128 KiB static array and the two
  // live `combat_events` reservations that grew with it.
  //
  // The seeds are warmed in the order the guarded cycles drive them, because
  // `init_articulated_test` builds a whole legacy `Sim` -- a generated floor,
  // its nav fields and its fog -- before it replaces the world, and a floor's
  // footprint depends on its seed. None of that is what this test is about, and
  // warming it out of the way is what keeps the subject the reservation.
  // **Twenty rounds since 2026-08-16, re-measured because the crush channel
  // moved the settling point rather than the footprint.** Traced page counts
  // per round: 224 from round one, flat through round eleven, a single step to
  // 248 at round twelve, then 248 unchanged through round forty. Nine rounds
  // therefore left the fixture one step short of settled, and the growth
  // surfaced in a *guarded* cycle -- which reads as a leak and is not one:
  // twenty-nine consecutive rounds at 248 is the evidence it converges. Twenty
  // is the settling round plus two thirds again as margin.
  //
  // **Thirty-seven rounds since 2026-08-17, and it is the same failure the
  // paragraph above describes, found by the same trace.** The embodied sessions
  // gave every world a `ground_z` and a `stance` column and every dungeon a
  // heights vector; the plateau moved 248 -> 307 and the settling round moved
  // 12 -> 22, so twenty rounds again left the fixture one step short and the
  // step landed inside a guarded cycle, on `seed 0, cycle 2`. Traced per round:
  // 211 from round one, 237 from round four, 263 from round fifteen, 307 from
  // round twenty-two, then **307 unchanged through round sixty**. The gaps
  // between steps widen -- 3, 11, 7 -- and then stop, which is what separates a
  // settling allocator from a slow leak, and thirty-nine consecutive flat
  // rounds is a stronger reading than the twenty-nine above.
  //
  // **The plateau moving by 59 pages is not the new columns' own size.** They
  // are a `ground_z` and a `stance` row per body and one `i16` per tile --
  // kilobytes across the two worlds a reset holds live, against nearly four
  // megabytes of page count. It is dlmalloc's arena, which grows in 26- and
  // 44-page bites here, taking a different number of them once the size classes
  // shift. That scale is set by two worlds at 64 reserved rows over three
  // seeds, and none of it is what this fixture measures: the subject is still
  // that nothing grows *after* the guard closes.
  //
  // **The commanded swing plane moved the plateau again, and this time it moved
  // it *down*: 307 -> 266, with the settling round 22 -> 10.** Traced per round
  // on the same script: 210 from round one, 240 from round seven, 266 from
  // round ten, then 266 unchanged through round sixty. That direction is the
  // best evidence the paragraph above has ever had. The session added an eight
  // byte `elbow_plane` row a body and four bytes to a static command buffer; a
  // change that only adds bytes cannot take 2.7 MB off a footprint, so the
  // plateau is plainly a function of dlmalloc's size classes and allocation
  // order rather than of what the world weighs. A page figure here is a record
  // of one build's arena and never a budget.
  //
  // **The forearm collider moved it a fourth time, and barely: 266 -> 265, with
  // the settling round 10 -> 16.** Traced per round on the same script: 213 from
  // round one, 239 from round two, 265 from round sixteen, then 265 unchanged
  // through round sixty. The session grew `MAX_REGIONS` by 4,096 bytes -- two
  // more swept volumes a body across all 64 -- and the arena came back one page
  // *smaller*, which is the third reading in a row saying the same thing: the
  // plateau tracks dlmalloc's size classes and allocation order, not what the
  // world weighs.
  //
  // **Forty-eight rounds since 2026-08-18, and thirty-seven left the fixture two
  // steps short rather than one.** The embodied session's `Sim::walk_in` dresses
  // a spec for the world it is entering, so the sixty-five spawn calls in this
  // fixture stopped being sixty-five refusals and became a roster fill to the
  // ceiling, and the duel is now rebuilt a second time before the clinch so that
  // `CLINCH_CAP_TICK` is still measured on two bodies. Traced per round on the
  // shipped script: **279 from round one, flat through round thirty-seven, a
  // step to 305 at round thirty-eight, 349 at round thirty-nine, then 349
  // unchanged through round one hundred.** Thirty-seven therefore ended one
  // round before the first of two steps, and both landed inside a *guarded*
  // cycle -- `seed 0, cycle 1, reset init_articulated_test(0)` -- which reads as
  // a leak and is not one: sixty-one consecutive flat rounds is the strongest
  // tail this fixture has ever recorded.
  //
  // Forty-eight is the settling round plus a quarter again, and it was run
  // rather than reasoned: at forty-eight the guarded phase holds at 349. The
  // paragraph above about a longer warm-up being a *different* sequence is why
  // that last sentence is the one that matters -- a flat tail says the allocator
  // converges, and only running the count that ships says the guard holds at it.
  for (let round = 1; round <= 48; round++) {
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

  // **Every seed the guarded cycles drive, in the shape the guarded cycles
  // drive it, and that is what the warm-up owes.** It used to warm seed 1
  // alone, which was enough while `MAX_COMBAT_EVENTS` was 256: `init` builds
  // the replacement `Sim` before it drops the installed one, so a reset holds
  // two `combat_events` reservations at once, and 32 KiB of second reservation
  // fit in the slack a single warm round left behind. The high-water
  // measurement in `articulated-abi.md` took that capacity to 1024 and the
  // second reservation to 128 KiB, which does not -- so the first guarded
  // `init(0)` grew linear memory and detached every retained view.
  //
  // Warming seed 1 twice does not fix it, and that is the reading worth
  // keeping: the peak is per *floor*, because `Scenario::dungeon` generates a
  // different room for every seed and a room's nav fields and fog are most of a
  // `Sim`. It only moved where the growth landed -- 27 pages on one warm round,
  // 30 on two -- and `init(0)` failed both times. One round over all three
  // seeds settled it at 30 pages, unchanged through a measured round six.
  //
  // v2-17 checkpoint B took the capacity to 2048 and the second reservation to
  // 256 KiB, and one round over the three seeds stopped being enough: the
  // guarded phase then grew on `seed 1, cycle 2`. **Two rounds per seed, nested
  // the way the guarded phase nests them**, settles it at 39 pages -- 29 after
  // seed 0's first round, 34 after its second, 39 from seed 1's first and flat
  // from there. Two rounds over the seed *list* -- the same six `exercise`
  // calls in the other order -- does not, which says the peak follows the
  // floor-to-floor transition rather than the count of rounds, and is why this
  // loop is nested and not flat.
  //
  // **That sensitivity to the call *sequence* is not a figure of speech, and it
  // is why more warm-up is not automatically safer here.** Traced at six rounds
  // per seed on 2026-08-17 the warm-up settles at the same 39 and the guarded
  // phase then grows at `seed 0, cycle 4`. Six rounds is not two rounds with
  // margin; it is a different sequence of floor-to-floor transitions reaching a
  // different peak, exactly as the paragraph above says. The count that is
  // measured to hold is the count that ships.
  //
  // **Two rounds per seed still holds and the plateau moved a long way: 39 ->
  // 265.** The floor `init` opens is embodied now, so this fixture's roster fill
  // builds sixty-four jointed bodies where it used to build sixty-four legacy
  // ones, and eight descents rebuild that. Re-traced on the shipped nesting on
  // 2026-08-18: 239 after seed 0's first round, 265 after its second, and flat
  // from there through seed 1 and seed 0xffffffff; the guarded phase then holds
  // at 265 across all twelve cycles. Traced *unshipped* at eight rounds per seed
  // the same script steps again to 309 at `seed 0xffffffff, round 3`, which is
  // the paragraph above making its point a third time: two is not a smaller
  // eight, it is a different sequence, and it is the one that was run.
  let initialRevisions = null;
  for (const seed of [0, 1, 0xffff_ffff]) {
    for (let round = 1; round <= 2; round++) initialRevisions = exercise(wasm, abi, seed);
  }
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

// ------------------------------------- the articulated publication stress
//
// v2-16 put two more fixed arrays in linear memory -- 16,896 pose bytes and
// 262,144 event bytes -- and four more ways to fill them. The later region and
// projectile publications extend the same fixed warm set. The subject is the
// one the two fixtures above have and it has not changed: after warm-up,
// nothing the boundary can be asked to do grows `memory.buffer.byteLength`, so
// a typed array the worker holds over FRAME, POSES, COMBAT_EVENTS, REGIONS or
// ARTICULATED_PROJECTILES stays attached for the life of the module.
//
// What is new is where the growth could come from. The pose and event arrays
// are `thread_local!` statics and cannot themselves move; the risk is entirely
// in what fills them -- the per-tick event accumulator reserved at
// `MAX_COMBAT_EVENTS`, the contact vectors an articulated world reserves, and
// the second `Sim` every reset and every descent briefly holds.

// The published articulated buffers, validated the way `publicationShape`
// validates the legacy four. Everything here is read through an export and
// compared against the *generated* ABI rather than against a literal, so a
// capacity that moved in Rust without the emitter following it fails here.
function articulatedShape(wasm, abi) {
  const posePtr = wasm.pose_ptr() >>> 0;
  const poseRows = wasm.pose_len() >>> 0;
  const eventPtr = wasm.combat_event_ptr() >>> 0;
  const eventRows = wasm.combat_event_len() >>> 0;
  const projectilePtr = wasm.articulated_projectile_ptr() >>> 0;
  const projectileRows = wasm.articulated_projectile_len() >>> 0;
  assert.equal(wasm.pose_layout_version() >>> 0, abi.POSE_LAYOUT_VERSION, "pose layout version");
  assert.equal(wasm.pose_stride() >>> 0, abi.POSE_STRIDE, "pose stride disagrees with emitted ABI");
  assert.equal(wasm.pose_capacity() >>> 0, abi.MAX_POSES, "pose capacity disagrees with emitted ABI");
  assert.equal(
    wasm.combat_event_layout_version() >>> 0,
    abi.COMBAT_EVENT_LAYOUT_VERSION,
    "combat event layout version",
  );
  assert.equal(
    wasm.combat_event_stride() >>> 0,
    abi.COMBAT_EVENT_STRIDE,
    "combat event stride disagrees with emitted ABI",
  );
  assert.equal(
    wasm.combat_event_capacity() >>> 0,
    abi.MAX_COMBAT_EVENTS,
    "combat event capacity disagrees with emitted ABI",
  );
  assert.equal(
    wasm.articulated_projectile_layout_version() >>> 0,
    abi.ARTICULATED_PROJECTILE_LAYOUT_VERSION,
    "articulated projectile layout version",
  );
  assert.equal(
    wasm.articulated_projectile_stride() >>> 0,
    abi.ARTICULATED_PROJECTILE_STRIDE,
    "articulated projectile stride disagrees with emitted ABI",
  );
  assert.equal(
    wasm.articulated_projectile_capacity() >>> 0,
    abi.MAX_ARTICULATED_PROJECTILES,
    "articulated projectile capacity disagrees with emitted ABI",
  );
  assert.ok(poseRows <= abi.MAX_POSES, `pose count ${poseRows} exceeds its capacity`);
  assert.ok(eventRows <= abi.MAX_COMBAT_EVENTS, `event count ${eventRows} exceeds its capacity`);
  assert.ok(
    projectileRows <= abi.MAX_ARTICULATED_PROJECTILES,
    `projectile count ${projectileRows} exceeds its capacity`,
  );
  // The pose cap is the sim's own `MAX_ARTICULATED_ENTITIES`, so a drop here is
  // not a busy fight -- it is the cap or the identity ordering being wrong.
  assert.equal(wasm.poses_dropped() >>> 0, 0, "a pose row was dropped by a world sized to the sim's cap");
  assert.equal(
    wasm.articulated_projectiles_dropped() >>> 0,
    0,
    "a projectile row was dropped by a world sized to the sim's cap",
  );
  const memoryBytes = wasm.memory.buffer.byteLength;
  for (const [name, pointer, bytes] of [
    ["POSES", posePtr, abi.MAX_POSES * abi.POSE_STRIDE * 4],
    ["COMBAT_EVENTS", eventPtr, abi.MAX_COMBAT_EVENTS * abi.COMBAT_EVENT_STRIDE * 4],
    ["ARTICULATED_PROJECTILES", projectilePtr,
      abi.MAX_ARTICULATED_PROJECTILES * abi.ARTICULATED_PROJECTILE_STRIDE * 4],
  ]) {
    assert.ok(pointer > 0, `${name} is published at address zero`);
    assert.equal(pointer % 4, 0, `${name} is not u32-aligned`);
    assert.ok(pointer + bytes <= memoryBytes, `${name} runs past the end of linear memory`);
  }
  return { posePtr, poseBytes: abi.MAX_POSES * abi.POSE_STRIDE * 4,
    eventPtr, eventBytes: abi.MAX_COMBAT_EVENTS * abi.COMBAT_EVENT_STRIDE * 4,
    projectilePtr,
    projectileBytes: abi.MAX_ARTICULATED_PROJECTILES * abi.ARTICULATED_PROJECTILE_STRIDE * 4,
    poseRows, eventRows, projectileRows };
}

// How deep the stress drives a run, and the number is measured rather than
// budgeted: the room publishes 7 pose rows, and each descent adds a body until
// the roster plateaus at 11 from depth 4 -- the same 7/8/9/10/11 on all three
// seeds. Four is therefore the deepest floor that buys another pose row, which
// is what this fixture wants out of a descent.
//
// **This comment used to record 11 as the ceiling JavaScript could reach at all,
// and that is no longer true.** The claim rested on `spawn_monster` being
// refused on an articulated world: the host built every spec with no articulated
// row, so the reference's 64-row `abi-high-water` corpus was a hand-built Rust
// scenario and nothing else. `Sim::walk_in` dresses the spec for the world it is
// entering now, so the roster fill above this loop reaches all 64 rows from
// JavaScript and the descents are back to being about the *floor* rather than
// about the roster. What JavaScript proves is still the same thing -- the
// buffers do not move and linear memory does not grow -- and that was never a
// function of how full the arrays are, since both are reserved whole at
// construction.
//
// It is load-bearing that the warm-up drives exactly these depths. Every
// descent generates a *different* room, and a room's nav fields and fog are
// most of a `Sim`; raising this without re-warming fails on the warm-up's own
// growth. Each cycle starts from `init`, which resets the depth, so the four
// floors are the same four every time.
const ARTICULATED_DEPTHS = 4;

// Rounds of "submit the clinch payload, then `step(8)`" driven after the cap
// tick, and the shape is the measurement rather than a guess. Sixteen because
// the batches run 3, 5, 16, 16, 12, 10, 11, 7, 6, 6, 8, 8, 4, 3, 1 and then
// zero -- the two bodies drift apart and stop touching -- so sixteen rounds is
// the whole productive tail plus one, and the peak accumulation JavaScript can
// drive into one host call is 16 rows.
//
// Steering *between* batches rather than every tick is what produces that peak,
// and it is not the obvious choice: a per-tick clinch resolves more contacts in
// total (83 rows over 128 ticks) but clears the feed on every one of them, so
// the most any single publication ever holds is 8. The accumulator is what is
// under test here, not the solver, and the accumulator only fills across the
// ticks of one call.
const CLINCH_BATCH_ROUNDS = 16;

// Warm rounds before the guard closes, and guarded cycles after it. Both are
// per seed, and the warm-up drives exactly what the cycles then drive -- see
// the reading recorded at the warm loop for why one round is already enough and
// three is margin.
const ARTICULATED_WARM_ROUNDS = 12;
const ARTICULATED_GUARDED_CYCLES = 3;

// The articulated stress fixture: every path v2-16 added, at the maxima this
// boundary allows. It is one fixture and not three because the peak is not any
// single call -- it is `init` building the replacement world while the outgoing
// one is still owned, and that peak is only reached if the outgoing world is the
// heaviest one the run ever built.
function articulatedStress(wasm, abi, seed, guard = null) {
  const checked = (label, call) => {
    const result = call();
    publicationShape(wasm, abi);
    articulatedShape(wasm, abi);
    if (guard) guard(label);
    return result;
  };
  const reserved = (label) => assert.equal(
    wasm.contact_high_water() >>> 0,
    abi.MAX_UNITS,
    `${label}: the articulated world is not reserved to the frame's row ceiling`,
  );

  // ---- the room the page opens.
  //
  // Not the two-body duel `init_articulated_test` opens: this is the generated
  // floor plan, its furniture and its roster, so it reserves 64 rows of contact
  // vectors *and* republishes the map, the fog and the furniture.
  checked(`init(${seed})`, () => wasm.init(seed));
  reserved(`init(${seed})`);
  let poses = wasm.pose_len() >>> 0;
  assert.ok(poses > 0, "the room published no pose rows");

  // **The maximum spawn path, and it fills the pose buffer now rather than
  // refusing at the door.** It was 65 refusals for as long as the host built
  // every legacy spec with no articulated row; `Sim::walk_in` dresses the spec
  // for the world it is entering, so the roster runs to `MAX_UNITS` and only the
  // call past it is turned away. That is a strictly harder fixture -- the pose,
  // region and stance sections all fill to their live ceiling here, which is a
  // reach the note below `ARTICULATED_DEPTHS` used to say JavaScript could not
  // drive at all.
  let refused = false;
  for (let row = 0; row <= abi.MAX_UNITS && !refused; row++) {
    const standing = checked(`spawn_monster(${row})`, () => (
      wasm.spawn_monster(3, 255, 255) >>> 0
    ));
    refused = standing === 0;
  }
  assert.ok(refused, "the spawn path did not reject within MAX_UNITS + 1 calls");
  reserved("spawn cap");
  poses = Math.max(poses, wasm.pose_len() >>> 0);

  // A batched step, which is the shape the accumulator is sized for: one
  // animation frame is up to eight ticks of catch-up and all eight ticks'
  // contacts land in one publication.
  checked("step(8)", () => wasm.step(8));
  checked("step(64)", () => wasm.step(64));

  // ---- the descent, which is where a floor's worth of `Sim` is built while
  // the previous one is still owned, and where the event feed must be cleared:
  // a contact row names two full identities and the new floor hands those slots
  // to new bodies.
  for (let depth = 1; depth <= ARTICULATED_DEPTHS; depth++) {
    const reached = checked(`descend(${depth})`, () => wasm.descend() >>> 0);
    assert.equal(reached, depth, `a descent did not reach depth ${depth}`);
    reserved(`descend(${depth})`);
    assert.equal(
      wasm.combat_event_len() >>> 0,
      0,
      `depth ${depth}: the descent published the previous floor's contacts`,
    );
    checked(`descend(${depth}) step(8)`, () => wasm.step(8));
    poses = Math.max(poses, wasm.pose_len() >>> 0);
  }
  // More than the duel's two bodies, which is the claim the descent is here to
  // make. Not pinned at 11: the roster is the level generator's, and a
  // generator change moving it would be a failure for a reason that is not a
  // bug in this ABI.
  assert.ok(poses > 2, `the deepest floor published only ${poses} pose rows`);

  // ---- the contact and event maxima.
  //
  // The duel, because the clinch is measured against it: two rows walked into
  // each other with their arms sweeping spend every contact group ordinal on
  // tick 89, and that tick is the one shape whose scratch use is maximal.
  // The generated room cannot be driven there -- its second body is
  // wherever the generator put it -- so the fixture switches worlds rather than
  // steering blind.
  checked(`init_articulated_test(${seed})`, () => wasm.init_articulated_test(seed));
  reserved(`init_articulated_test(${seed})`);
  const capTick = driveToContactCap(wasm, checked);
  assert.equal(capTick, CLINCH_CAP_TICK, "the clinch no longer caps where Rust says it does");
  assert.equal(wasm.contact_cap_hits() >>> 0, 1, "the cap tick was counted more than once");

  // Batched ticks of a live clinch, which is the busiest publication this
  // boundary can be driven to. The bodies are already in contact, so every tick
  // of an eight-tick call accumulates into the same feed rather than clearing
  // between them -- and the accumulation, not the solve, is what the reserved
  // `Vec` behind this feed exists for. A push past its reservation reallocates,
  // and a reallocation inside a tick is exactly the growth this test is looking
  // for.
  let batched = 0;
  for (let round = 0; round < CLINCH_BATCH_ROUNDS; round++) {
    const tick = CLINCH_CAP_TICK + 1 + round * 8;
    for (let row = 0; row < 2; row++) {
      const scratch = new Uint8Array(
        wasm.memory.buffer,
        wasm.submitted_command_ptr() >>> 0,
        SUBMITTED_COMMAND_BYTES,
      );
      scratch.set(clinchPayload(row, tick));
      assert.equal(
        wasm.submit_articulated(row, 0) >>> 0,
        1,
        `batch ${round}: the boundary refused row ${row}'s clinch command`,
      );
    }
    checked(`clinch batch ${round}, step(8)`, () => wasm.step(8));
    const live = wasm.combat_event_len() >>> 0;
    batched = Math.max(batched, live);
    assert.equal(
      wasm.combat_events_dropped() >>> 0,
      0,
      `batch ${round}: a two-body clinch dropped rows from a ${abi.MAX_COMBAT_EVENTS}-row feed`,
    );
    if (live === 0) continue;

    // **Cleared per `step`, not per publication**, checked on a batch that has
    // rows in it rather than after the drive, where the last one is empty and
    // the assertion would read `0 === 0`. Any export between two steps rebuilds
    // the frame and republishes these same rows unchanged -- the legacy event
    // feed's rule exactly, and the one a consumer keeping a damage ledger has to
    // read carefully, because it double counts every contact the player presses
    // a control through. No digest and no capacity can speak for this.
    // `set_goto` carried this line until the order channel went; `set_control`
    // is a publish-without-step in exactly the same way.
    checked(`clinch batch ${round}, set_control`, () => wasm.set_control(0));
    assert.equal(
      wasm.combat_event_len() >>> 0,
      live,
      `batch ${round}: a publication without a step changed the feed`,
    );
    // And the same rule read from the other end. `step(0)` clears the feed
    // without advancing a tick, so the drive above resumes unaffected.
    checked(`clinch batch ${round}, step(0)`, () => wasm.step(0));
    assert.equal(wasm.combat_event_len() >>> 0, 0, `batch ${round}: step(0) did not clear the feed`);
  }
  assert.ok(batched > CLINCH_BATCH_ROUNDS / 2, `the batched clinch peaked at ${batched} contact rows`);

  // ---- the scripted stream digest.
  //
  // In the fixture rather than beside it, so warming the fixture warms it: this
  // is the only allocating call in the pose/event set -- it builds a whole `Sim`
  // to drive its twenty ticks -- and it is cached in a `thread_local!` on first
  // touch for exactly that reason. Called inside the guard afterwards, where it
  // is the cache itself under test: an uncached digest would grow linear memory
  // here and detach every view this test holds.
  const digest = checked("articulated_stream_digest", () => (
    (BigInt(wasm.articulated_stream_digest_hi() >>> 0) << 32n)
      | BigInt(wasm.articulated_stream_digest_lo() >>> 0)
  ));
  assert.equal(typeof digest, "bigint", "the stream digest halves did not read as numbers");
  assert.notEqual(digest, 0n, "the stream digest is zero, so its script fed nothing");

  // ---- the reset, on the call the page would use to start over. Inside the
  // fixture and not around it, for `contactWarmup`'s reason: `init`
  // builds the replacement world while the outgoing one is still owned, so the
  // peak footprint is two worlds and it is the reset that reaches it.
  checked(`reset init(${seed})`, () => wasm.init(seed));
  reserved(`reset init(${seed})`);
  return { batched, digest };
}

test("published_views_survive_articulated_stress_without_memory_growth", () => {
  const abi = generatedConstants();
  const wasm = instantiate();
  const seeds = [0, 1, 0xffff_ffff];

  // A level first, and it is load-bearing for the same reason it is in the
  // contact fixture above: the retained MAP, VIS and FURNITURE views must have a
  // non-zero length before the guard closes, because a detached view reads a
  // `byteLength` of zero and so does a view that was never over anything. `init`
  // does republish all three -- unlike `init_articulated_test` -- so the fixture
  // below would warm them anyway, and this line keeps the three fixtures reading
  // the same way.
  wasm.init(1);

  // **Every seed the guarded cycles drive, warmed in the order they drive
  // them.** Not a style choice: `init` and `descend` each build a
  // whole generated floor -- nav fields and fog -- before replacing the world,
  // and every seed and every depth generates a different room. The sibling test
  // above records what happens when this is skimped: warmed on one seed and then
  // driven across three, its first guarded `init` grew linear memory and
  // detached every retained view, and warming the same seed twice did not fix it
  // because the peak is per *floor*.
  //
  // **Measured, and it settles at 302 pages from the end of round six** --
  // 258 from round one, flat through round five, one step to 302 at round six,
  // then 302 unchanged through a measured round forty. Twelve rounds is the
  // settling round doubled, on the sibling fixture's argument that a warm-up
  // whose cost is invisible is the wrong place to be frugal.
  //
  // **Twelve was then run, and that is the claim rather than the flat trace.**
  // The legacy fixture below records a case where six rounds settle at the same
  // page count as two and the guarded phase grows anyway, because a longer
  // warm-up is a *different* sequence of floor-to-floor transitions and not the
  // same one with margin. A flat tail says the allocator converges; only
  // running the count that ships says the guard holds at it.
  //
  // **It was three rounds and 258 flat until session 07's commanded swing
  // plane, and three left it one step short in exactly the way the sibling
  // fixture has now been caught twice.** The growth surfaced on `seed 1, cycle
  // 3` -- inside the guard, which reads as a leak -- and thirty-four
  // consecutive rounds at 302 is what says it is not one. The column that did
  // it is eight bytes a body, so the 44 pages are the allocator's arena and not
  // the world's weight; the sibling fixture's trace makes the same point from
  // the other direction, having moved *down* 41 pages in the same commit.
  //
  // It read 242 until the embodied sessions of 2026-08-17 widened the world.
  // Two readings for the shape of the number: the legacy fixture beside this
  // one settles at 39 pages and the articulated contact fixture at 266, so most
  // of the 302 is the articulated *room* -- a generated floor with a roster on
  // it -- rather than the 292,352 bytes of pose, event, region, projectile and
  // stance array, which is 5 pages. It read 237 while `MAX_COMBAT_EVENTS` was
  // 1024; four of the pages between are that capacity doubling, static array
  // and live reservations together.
  //
  // **The 241 this comment carried until v2-ui-07 was stale, and v2-ui-08 said
  // so where it landed rather than fixing it here.** The 32,768-byte checkpoint
  // staging buffer is half a page of static data that happened to fall across a
  // page boundary. The assertion is against a baseline this test measures for
  // itself, so the figure is a record and not a claim -- which is exactly why a
  // wrong one survives, and why it is worth correcting rather than deleting.
  //
  // The publication budget was 279,040 across v2-16's two publications until
  // v2-ui-06 appended the five swept region capsules per body (`8 * 320 * 4`)
  // for 289,280. The projectile publication adds `32 * 12 * 4`, reaching
  // 290,816, and the stance publication `64 * 6 * 4`, reaching 292,352 --
  // and **the page count did not move with any of the three appends**: 4.26,
  // 4.41, 4.44 and 4.46 pages all round up to the same 5. The arrays are
  // static, so every one of those publications was free at this resolution. The
  // next page boundary is 327,680 bytes, 35,328 further on. The forearm
  // collider then widened the region section to `8 * 448 * 4` for 296,448,
  // which is 4.52 pages and still the same 5.
  //
  // **Re-traced after the forearm collider: 302 -> 305, settling round 12 -> 4.**
  // Per round on the same script: 261 from round one, flat through round three,
  // a single step to 305 at round four, then 305 unchanged through a measured
  // round forty. Twelve is now three times the settling round rather than twice
  // it, and it stays twelve -- the count that ships is the count that was run,
  // which is what the paragraph above insists on. The static publication grew by
  // one page's worth of *arithmetic* and none of a page, so the three pages here
  // are the allocator's arena again; the sibling fixture moved *down* one page
  // in the same commit, which is the same evidence from the other side.
  //
  // **Re-traced on 2026-08-18 after the roster fill replaced the spawn refusal:
  // 305 -> 291, settling round 4 -> 4.** Per round on the shipped script: 265
  // from round one, flat through round three, a single step to 291 at round
  // four, then 291 unchanged through a measured round forty, and the guarded
  // phase holds at 291. This fixture now drives sixty-four jointed bodies where
  // it drove seven, and the arena came back *fourteen pages smaller* -- the
  // fourth reading in a row saying that the plateau tracks dlmalloc's size
  // classes and allocation order rather than what the world weighs. Twelve is
  // three times the settling round and it stays twelve, which is the count that
  // was run.
  let last = null;
  for (let round = 1; round <= ARTICULATED_WARM_ROUNDS; round++) {
    for (const seed of seeds) last = articulatedStress(wasm, abi, seed);
  }

  const shape = publicationShape(wasm, abi);
  const articulated = articulatedShape(wasm, abi);
  const memory = wasm.memory;
  const baselineBuffer = memory.buffer;
  const baselinePages = baselineBuffer.byteLength / 65_536;
  assert.ok(Number.isInteger(baselinePages) && baselinePages > 0, "wasm memory is not page-sized");

  // The legacy frame, the pose buffer and the event buffer, held as the worker
  // would hold them: over the whole reserved extent rather than over the live
  // prefix, because that is the view a consumer keeps for the life of the module
  // and it is the one whose detach would be silent -- a shorter view would still
  // be inside the buffer after a reallocation this test cannot see.
  const retained = [
    new Float32Array(baselineBuffer, shape.framePtr, shape.frameLength),
    new Uint32Array(baselineBuffer, articulated.posePtr, articulated.poseBytes / 4),
    new Uint32Array(baselineBuffer, articulated.eventPtr, articulated.eventBytes / 4),
    new Uint32Array(baselineBuffer, articulated.projectilePtr, articulated.projectileBytes / 4),
    new Uint8Array(baselineBuffer, shape.mapPtr, shape.mapLength),
    new Uint8Array(baselineBuffer, shape.visPtr, shape.visLength),
    new Uint8Array(baselineBuffer, shape.furniturePtr, shape.furnitureBytes),
  ];
  const retainedLengths = retained.map((view) => view.byteLength);
  assert.ok(retainedLengths.every((length) => length > 0), "warm fixture left an empty retained view");
  assert.equal(retainedLengths[1], 16_896, "the pose buffer is not the reference's 16,896 bytes");
  assert.equal(retainedLengths[2], 262_144, "the event buffer is not the reference's 262,144 bytes");
  assert.equal(retainedLengths[3], 1_536,
    "the projectile buffer is not the reference's 1,536 bytes");

  function assertWarmInvariant(label) {
    const after = publicationShape(wasm, abi);
    const afterArticulated = articulatedShape(wasm, abi);
    assert.equal(memory.buffer, baselineBuffer, `${label}: wasm.memory.buffer changed`);
    assert.equal(memory.buffer.byteLength / 65_536, baselinePages, `${label}: wasm memory grew`);
    // The *original* views, not freshly built ones. A view rebuilt from the
    // current buffer proves nothing at all: it would be attached by
    // construction, on either side of a growth.
    assert.deepEqual(
      retained.map((view) => view.byteLength),
      retainedLengths,
      `${label}: a retained view detached`,
    );
    assert.equal(after.framePtr, shape.framePtr, `${label}: FRAME moved`);
    assert.equal(after.mapPtr, shape.mapPtr, `${label}: MAP moved`);
    assert.equal(after.visPtr, shape.visPtr, `${label}: VIS moved`);
    assert.equal(after.furniturePtr, shape.furniturePtr, `${label}: FURNITURE moved`);
    assert.equal(afterArticulated.posePtr, articulated.posePtr, `${label}: POSES moved`);
    assert.equal(afterArticulated.eventPtr, articulated.eventPtr, `${label}: COMBAT_EVENTS moved`);
    assert.equal(afterArticulated.projectilePtr, articulated.projectilePtr,
      `${label}: ARTICULATED_PROJECTILES moved`);
  }

  let peak = 0;
  for (let cycle = 1; cycle <= ARTICULATED_GUARDED_CYCLES; cycle++) {
    for (const seed of seeds) {
      const driven = articulatedStress(wasm, abi, seed, (call) => (
        assertWarmInvariant(`seed ${seed}, cycle ${cycle}, ${call}`)
      ));
      peak = Math.max(peak, driven.batched);
      assert.equal(driven.digest, last.digest, "the cached stream digest answered two values");
    }
  }
  console.log(
    `articulated stress: ${baselinePages} pages held across ` +
      `${seeds.length * ARTICULATED_GUARDED_CYCLES} guarded cycles, ` +
      `peak ${peak} event rows in one step(8)`,
  );
});


// ------------------------------------------------- the arena recording channel
//
// v2-ui-07 drives `arena_start` and the three publications from JavaScript for
// the first time, and it adds two claims this file is the right place for. The
// first is the memory one it already makes about everything else: `arena_start`
// builds a `Scenario`, two `Vec`s of spec rows and a whole `World`, and
// `load_checkpoint` builds a weight vector, so both belong in the warm set --
// linear-memory growth detaches every typed array view, and a recording in
// flight is the worst possible moment for that. The second is the index: a
// fight where a body dies is the case a reader computing `tick * 2 *
// POSE_STRIDE` gets silently wrong, and this is the only place a *real* one can
// be driven.
//
// The recorder itself is the shipped TypeScript, compiled here and handed the
// same `createArenaAdapter` the worker uses -- a free function over the exports
// precisely so this file can build it without a worker, a `fetch` or a `self`.

const OUT = path.join(root, ".tools", "wasm-memory-test");
fs.mkdirSync(OUT, { recursive: true });
const tsc = spawnSync(process.execPath, [
  path.join(root, "node_modules", "typescript", "bin", "tsc"),
  "--ignoreConfig",
  "--target", "ES2022", "--module", "commonjs", "--moduleResolution", "node",
  "--ignoreDeprecations", "6.0",
  "--strict", "--skipLibCheck", "--outDir", OUT, "--rootDir", root,
  "client/src/runtime/arena-config.ts", "client/src/runtime/arena-recorder.ts",
  "client/src/fight/live.ts",
], { cwd: root, encoding: "utf8" });
assert.equal(tsc.status, 0, `TypeScript test compilation failed:\n${tsc.stdout}\n${tsc.stderr}`);

const require = createRequire(import.meta.url);
const CONFIG = require(path.join(OUT, "client/src/runtime/arena-config.js"));
const RECORDER = require(path.join(OUT, "client/src/runtime/arena-recorder.js"));
const { LiveFightSource } = require(path.join(OUT, "client/src/fight/live.js"));

const CHECKPOINT = path.join(root, "checkpoints", "v2-probe.ckpt");

/** The picker's own vocabulary, as the arena route will assemble it. */
function liveConfig({ heroes = "composed", monsters = "composed", seed = 3,
  hands = [["shield", "sword"], ["empty", "club"]], twoHanded = [false, false],
  anatomies = [0, 1] } = {}) {
  const policy = (name) => {
    const code = CONFIG.policyCodeOf(name);
    assert.notEqual(code, null, `${name} is not an articulated policy code`);
    return code;
  };
  return {
    fighters: [heroes, monsters].map((name, side) => ({
      anatomy: anatomies[side],
      policy: policy(name),
      spawn: CONFIG.SHIPPED_SPAWNS[side],
      hands: [CONFIG.HAND_ITEMS[hands[side][0]], CONFIG.HAND_ITEMS[hands[side][1]]],
      twoHanded: twoHanded[side],
    })),
    maxTicks: CONFIG.ARENA_MAX_TICKS,
    seed,
  };
}

/** The recorder's own hooks, with no yielding: a Node test has nothing to yield to. */
const straightThrough = { onProgress: () => {}, yieldToMessages: async () => {} };

async function recordLive(wasm, config, { checkpoint = null } = {}) {
  const adapter = RECORDER.createArenaAdapter(wasm);
  const bytes = CONFIG.encodeArenaConfig(config);
  const result = await RECORDER.recordArenaFight(
    adapter, config, bytes, checkpoint, straightThrough, () => false,
  );
  assert.equal(result.ok, true, result.ok ? "" : `${result.reason}: ${result.detail}`);
  return result.recording;
}

test("arena_start_allocates_within_the_warm_set", async () => {
  const abi = generatedConstants();
  const wasm = instantiate();
  const adapter = RECORDER.createArenaAdapter(wasm);
  const checkpoint = new Uint8Array(fs.readFileSync(CHECKPOINT));

  // A legacy level first, for the reason the two fixtures above give: the
  // retained MAP, VIS and FURNITURE views must have a non-zero length before the
  // guard closes, because a detached view reads a `byteLength` of zero and so
  // does a view that was never over anything.
  wasm.init(1);

  // Three arrangements rather than one, because `arena_start` builds a
  // `Scenario` whose table is a function of the loadout: two anatomies, up to
  // four equipment rows, and a `World` sized from them. A warm-up that only ever
  // saw the shipped arrangement would leave the first differently-shaped one to
  // grow the heap under the guard.
  const arrangements = [
    liveConfig(),
    liveConfig({ heroes: "windmill", monsters: "attack-moves", anatomies: [1, 1],
      hands: [["club", "club"], ["sword", "shield"]], seed: 7 }),
    liveConfig({ heroes: "learned", monsters: "windmill", seed: 3 }),
  ];

  const round = (guard = null) => {
    const checked = (label, call) => {
      const result = call();
      publicationShape(wasm, abi);
      articulatedShape(wasm, abi);
      if (guard) guard(label);
      return result;
    };
    for (const config of arrangements) {
      // The two allocating calls, together and before anything else -- which is
      // the handshake `articulated-abi.md` states and the reason they are one
      // method on the adapter rather than two the caller may interleave.
      const loaded = checked(`warmUp(${config.seed})`, () => adapter.warmUp(config.seed, checkpoint));
      assert.equal(loaded & 0xff, 1, "the shipped checkpoint was refused");
      const bytes = CONFIG.encodeArenaConfig(config);
      checked("writeConfig", () => adapter.writeConfig(bytes));
      const started = checked(`arena_start(${config.seed})`, () => adapter.start(config.seed));
      assert.ok(CONFIG.arenaStarted(started), CONFIG.describeArenaRefusal(started));
      // Enough ticks to bring the two bodies into contact, so the guarded phase
      // covers the solver's own per-tick behaviour and not only the install.
      for (let tick = 0; tick < 128; tick += 1) {
        checked(`step(1) at ${tick}`, () => wasm.step(1));
        const published = adapter.read();
        assert.equal(published.regionRows, published.poseRows * abi.REGIONS_PER_BODY,
          "the region section must cover exactly the published poses");
      }
    }
  };

  // **Measured, and what matters is the arrangements rather than the count.**
  // One round over all three settles it and holds through three guarded cycles;
  // the second is margin that costs a tenth of a second. What is *not* margin is
  // that the warm-up drives every arrangement the guarded phase drives, which is
  // the sibling fixtures' rule and is the one this test was mutation-checked
  // against: warmed on the shipped arrangement alone and then guarded across all
  // three, `cycle 2, warmUp(7)` grows linear memory and detaches every retained
  // view. `init` builds a whole generated floor -- nav fields and fog
  // -- before it replaces the world, and a different seed is a different floor.
  // **Eight rounds since 2026-08-16, and the count now matters as much as the
  // arrangements do.** Traced page counts per round: 225 from round one, flat
  // through round three, a single step to 249 at round four, then 249 unchanged
  // through round twelve. Two rounds therefore stopped short of settled and the
  // growth surfaced at `cycle 2, warmUp(3)`. The sibling fixture above moved the
  // same way in the same commit -- 224 to 248 at its round twelve -- so this is
  // one allocator step of about 24 pages arriving later than it used to, not two
  // independent leaks: nine and twenty-nine flat rounds respectively are what
  // say so. Eight is the settling round doubled.
  //
  // **Re-traced on 2026-08-17 after the commanded swing plane, and the step is
  // gone: 236 pages from round one, flat through a measured round twenty.** The
  // count stays at eight. It is now eight times the settling round rather than
  // twice it, and the three fixtures in this file have between them moved a
  // settling round from 12 to 22 to 10, and from 4 to 1, on changes that added
  // a few bytes a body -- which is the argument for leaving margin alone rather
  // than trimming it to the latest reading.
  //
  // **Re-traced again after the forearm collider: 238 pages from round one, flat
  // through a measured round twenty.** Two pages up, no step, settling round
  // still one, count still eight. This is the fixture whose plateau has moved
  // the least across four sessions, and it is also the one that drives the
  // fewest generated floors -- which is the clearest single piece of evidence
  // that the page counts in this file are dominated by the *rooms* a warm-up
  // builds rather than by the static publication arrays a session widens.
  for (let r = 1; r <= 8; r += 1) round();

  const shape = publicationShape(wasm, abi);
  const articulated = articulatedShape(wasm, abi);
  const memory = wasm.memory;
  const baselineBuffer = memory.buffer;
  const baselinePages = baselineBuffer.byteLength / 65_536;
  const regionPointer = wasm.region_ptr() >>> 0;
  const regionBytes = abi.MAX_REGIONS * abi.REGION_STRIDE * 4;

  // **The region and projectile arrays join the retained set here.** The
  // recorder holds a view over every published row on every tick of a
  // 3,600-tick drive, including ticks on which the live prefix is empty.
  const retained = [
    new Float32Array(baselineBuffer, shape.framePtr, shape.frameLength),
    new Uint32Array(baselineBuffer, articulated.posePtr, articulated.poseBytes / 4),
    new Uint32Array(baselineBuffer, articulated.eventPtr, articulated.eventBytes / 4),
    new Uint32Array(baselineBuffer, regionPointer, regionBytes / 4),
    new Uint32Array(baselineBuffer, articulated.projectilePtr, articulated.projectileBytes / 4),
    new Uint8Array(baselineBuffer, shape.mapPtr, shape.mapLength),
    new Uint8Array(baselineBuffer, shape.visPtr, shape.visLength),
  ];
  const retainedLengths = retained.map((view) => view.byteLength);
  assert.ok(retainedLengths.every((length) => length > 0), "warm fixture left an empty retained view");
  // 14,336 and not the 10,240 the reference charged before the forearm collider:
  // the section is one row per **swept volume** and a jointed arm is two
  // capsules, so `REGIONS_PER_BODY` is 7. Written as the reference's number
  // rather than as `regionBytes` so a stride or a capacity moving fails here
  // instead of agreeing with itself.
  assert.equal(retainedLengths[3], 14_336, "the region buffer is not the reference's 14,336 bytes");
  assert.equal(retainedLengths[4], 1_536,
    "the projectile buffer is not the reference's 1,536 bytes");
  // **FURNITURE is deliberately not retained**, on the same argument the two
  // fixtures above make for calling `init` first: a configured duel has no
  // furniture at all, so a view over an arena publication's furniture block is
  // zero-length -- and a detached view reads a `byteLength` of zero too, so it
  // could witness nothing. Its pointer is still checked below, which is the half
  // an empty view can carry.
  assert.equal(shape.furnitureBytes, 0, "a configured duel published furniture");

  let cycles = 0;
  for (let cycle = 1; cycle <= 3; cycle += 1) {
    round((call) => {
      const after = publicationShape(wasm, abi);
      const afterArticulated = articulatedShape(wasm, abi);
      const label = `cycle ${cycle}, ${call}`;
      assert.equal(memory.buffer, baselineBuffer, `${label}: wasm.memory.buffer changed`);
      assert.equal(memory.buffer.byteLength / 65_536, baselinePages, `${label}: wasm memory grew`);
      // The *original* views, not freshly built ones: a view rebuilt from the
      // current buffer would be attached by construction, on either side of a
      // growth.
      assert.deepEqual(retained.map((view) => view.byteLength), retainedLengths,
        `${label}: a retained view detached`);
      assert.equal(after.framePtr, shape.framePtr, `${label}: FRAME moved`);
      assert.equal(afterArticulated.posePtr, articulated.posePtr, `${label}: POSES moved`);
      assert.equal(afterArticulated.eventPtr, articulated.eventPtr, `${label}: COMBAT_EVENTS moved`);
      assert.equal(wasm.region_ptr() >>> 0, regionPointer, `${label}: REGIONS moved`);
      assert.equal(afterArticulated.projectilePtr, articulated.projectilePtr,
        `${label}: ARTICULATED_PROJECTILES moved`);
      assert.equal(after.mapPtr, shape.mapPtr, `${label}: MAP moved`);
      assert.equal(after.visPtr, shape.visPtr, `${label}: VIS moved`);
      assert.equal(after.furniturePtr, shape.furniturePtr, `${label}: FURNITURE moved`);
      cycles += 1;
    });
  }
  assert.ok(cycles > 0, "the guarded phase asserted nothing");
  console.log(`arena warm set: ${baselinePages} pages held across 3 guarded cycles`);
});

test("the_index_survives_a_death", async () => {
  const wasm = instantiate();
  // A current default-mechanics kill rather than the learned checkpoint's old
  // v2-ui-08 outcome. The windmill control drives both sides here, matching
  // `lab trace --policy windmill --seed 3`: native and wasm both end on tick
  // 3,012 with the Fighter standing. Re-measured three times on 2026-08-16:
  // 1,260 -> 2,620 after Smart134 doubled the arm bearing rates; 2,620 -> 947
  // once the guard bearing was freed and the plate's normal began following the
  // arm that carries it; then 947 -> 3,012 when the crush channel gave blunt
  // energy somewhere to go. The last one lengthens the fight rather than
  // shortening it, which is the crush channel behaving as designed: it costs
  // integrity and opens no bleeding wound, so both sides take real damage
  // without starting a bleed clock. Keeping a real death is load-bearing -- a
  // timeout has two pose rows in every frame and cannot test this index seam.
  const deathTick = 3_012;
  const config = liveConfig({ heroes: "windmill", monsters: "windmill", seed: 3 });
  const recording = await recordLive(wasm, config);

  assert.equal(recording.ticks, deathTick, "the windmill control's kill tick moved");
  assert.equal(recording.outcome, "HeroesWin");
  assert.equal(recording.timedOut, false);
  assert.equal(recording.recordingTruncated, false);
  assert.equal(recording.frameCount, deathTick + 1);
  assert.equal(recording.checkpoint, null);

  const source = new LiveFightSource(recording);
  assert.equal(source.frameCount(), deathTick + 1);
  // Two bodies until the kill and one after it, which is what `pose_len` means:
  // one per **live** articulated body.
  assert.equal(source.frameAt(deathTick - 1).poses.length, 2);
  assert.equal(source.frameAt(deathTick).poses.length, 1);
  assert.equal(source.frameAt(deathTick).poses[0].id[0], 0, "the Fighter is the survivor");
  // The survivor is no longer untouched: `lab trace --policy windmill --seed 3`
  // reports "3012 ticks, a body decided it / HeroesWin, hero 0.8098 monster
  // 0.0000, 779 contacts, 3 severances" natively on 2026-08-16, and 0.8098 is
  // exactly 53_072/65_536. Re-recorded alongside the death tick above -- both
  // moved for the same reason, and native and wasm agree on both. The series so
  // far: 65_536, then 65_408, then 64_240, now 53_072. The survivor keeps losing
  // more of its health as the model gets better at spending energy on bodies,
  // which is the direction every change in this topic was aiming at.
  assert.deepEqual(source.frameAt(deathTick).health, [53_072, 0]);

  // **The index, as an assertion rather than as a comment.** This is the
  // arithmetic a reader without one would do; after the kill it lands on a row
  // that belongs to a different tick entirely, so deleting the index cannot
  // leave this test passing.
  const index = new Uint32Array(recording.index);
  const start = index[deathTick * RECORDER.RECORDING_INDEX_STRIDE + RECORDER.INDEX_POSE_START];
  assert.equal(start, deathTick * 2, "the death is the first frame to go short of two rows");
  const poses = new Uint32Array(recording.poses);
  assert.equal(poses.length / recording.poseStride, deathTick * 2 + 1,
    "a whole fight's pose rows are two a tick until the kill and one on it");
  assert.equal(index[deathTick * RECORDER.RECORDING_INDEX_STRIDE + RECORDER.INDEX_POSE_COUNT], 1);
  // One body's worth of region rows, which is `REGIONS_PER_BODY` and is seven
  // since the forearm collider -- the surviving fighter's five anatomy regions
  // plus its two forearm volumes, absent on an articulated body and published
  // all the same so the section is one shape for every combat model.
  assert.equal(index[deathTick * RECORDER.RECORDING_INDEX_STRIDE + RECORDER.INDEX_REGION_COUNT],
    recording.regionsPerBody);
  assert.equal(recording.regionsPerBody, 7);
  // Every frame carries the tick it was published at, and the region section
  // covers exactly its own poses.
  for (let frame = 0; frame < source.frameCount(); frame += 1) {
    const at = frame * RECORDER.RECORDING_INDEX_STRIDE;
    assert.equal(index[at + RECORDER.INDEX_TICK], frame);
    assert.equal(index[at + RECORDER.INDEX_REGION_COUNT],
      index[at + RECORDER.INDEX_POSE_COUNT] * recording.regionsPerBody);
  }
});

// -------------------------------------------- the differential oracle
//
// Same configuration, same seed, field for field. `lab trace` and this recording
// are the same fixed-point words out of the same simulation -- the configured
// duel reproduces `articulated_duel()` row for row and id for id, differing in
// the scenario *name* alone -- so every column both sources carry has to agree
// exactly, and the ones they do not carry are named rather than skipped
// silently.
//
// **An oracle and not a formality, and that was checked rather than assumed.**
// Perturbing one published word by 1 fails the comparison for 60 of the 66 pose
// words, 31 of the 32 event words, all region geometry and both health words,
// and `assert.deepEqual` under `node:assert/strict` catches a key present on one
// side and missing on the other -- so neither side is computed from the other.
//
// **Two columns it does not reach, named because a silent gap in a gate this
// strong is worse than a stated one.** The left-weapon block
// (`POSE_LEFT_WEAPON_*`) is decoded by `LiveFightSource` and never compared
// here: both fixtures put a shield or nothing in a left hand, so no row ever
// fills it. A blade in the left hand is picker-reachable and `GripBinding`
// makes it expressible, so the fixture that would close this is cheap. And
// `COMBAT_EVENT_TICK` is carried by neither side, which makes it the one column
// that could independently audit the per-tick index -- and does not.
//
// **Gated on the fixture and not skipped silently.** A trace is a development
// artifact: `.gitignore` excludes `web/fight*.json` and the production bundle
// carries none, so a clean clone has nothing to compare against. When one is
// present the comparison is mandatory; when none is, the test says which command
// writes one.
const TRACE_FIXTURES = [
  { file: "web/fight.json", command: "cargo run --release -p lab -- trace --seed 3 --out web/fight.json" },
  {
    file: "web/fight-learned.json",
    command: "cargo run --release -p lab -- trace --policy learned "
      + "--checkpoint checkpoints/v2-probe.ckpt --opponent windmill --seed 3 "
      + "--out web/fight-learned.json",
  },
];

function traceFixtures() {
  return TRACE_FIXTURES
    .map((entry) => ({ ...entry, full: path.join(root, entry.file) }))
    .filter((entry) => fs.existsSync(entry.full));
}

test("a_live_fight_matches_the_traced_fight", async (t) => {
  const fixtures = traceFixtures();
  if (fixtures.length === 0) {
    t.skip(`no recorded fight to compare against; write one with:\n  ${
      TRACE_FIXTURES.map((entry) => entry.command).join("\n  ")}`);
    return;
  }
  const checkpoint = new Uint8Array(fs.readFileSync(CHECKPOINT));
  for (const fixture of fixtures) {
    const trace = JSON.parse(fs.readFileSync(fixture.full, "utf8"));
    assert.equal(trace.schema, "arpg-fight-trace-6",
      `${fixture.file} is schema ${trace.schema}; re-record it with: ${fixture.command}`);
    // The live fight is built from the trace's own header, so the two are the
    // same configuration by construction rather than by a comment.
    const wasm = instantiate();
    const config = liveConfig({
      heroes: trace.heroes, monsters: trace.monsters, seed: trace.seed,
    });
    const recording = await recordLive(wasm, config,
      { checkpoint: trace.checkpoint === null ? null : checkpoint });
    const live = new LiveFightSource(recording);
    const where = `${fixture.file}: `;

    // ---- the header.
    assert.equal(recording.checkpoint, trace.checkpoint, `${where}checkpoint`);
    for (const field of ["one", "seed", "heroes", "monsters", "outcome", "timedOut",
      "ticks", "maxTicks", "impactThreshold", "contactEnergyFloor", "bodySlot"]) {
      assert.deepEqual(live.header[field], trace[field], `${where}header.${field}`);
    }
    assert.deepEqual([...live.header.arena], [...trace.arena], `${where}arena`);
    assert.deepEqual([...live.header.regionNames], trace.regionNames, `${where}regionNames`);
    assert.deepEqual([...live.header.hintNames], trace.hintNames, `${where}hintNames`);
    assert.deepEqual([...live.header.contactKinds], trace.contactKinds, `${where}contactKinds`);
    assert.deepEqual(live.header.bodies.map((body) => ({ ...body, carried: [...body.carried] })),
      trace.bodies.map((body) => ({ ...body, carried: [...body.carried] })), `${where}bodies`);
    // The two fields that must **not** agree, asserted so the difference is a
    // decision rather than an oversight. A runtime scenario is named
    // `configured-duel-v1` precisely so a recorded fight cannot be mistaken for
    // the `articulated-duel-v1` pin, and the fingerprint follows the name.
    assert.equal(live.header.scenario, "configured-duel-v1", `${where}scenario`);
    assert.equal(trace.scenario, "articulated-duel-v1", `${where}traced scenario`);
    assert.notEqual(live.header.fingerprint, trace.fingerprint, `${where}fingerprint`);
    // `NO_REGION` widens to a whole word on the wire so a reader that lost track
    // of the column width cannot mistake it for a region index.
    assert.equal(live.header.noRegion, 4_294_967_295, `${where}noRegion`);
    assert.equal(trace.noRegion, 255, `${where}traced noRegion`);

    // ---- every frame, field for field.
    assert.equal(live.frameCount(), trace.frames.length, `${where}frame count`);
    const region = (value) => (value === trace.noRegion ? live.header.noRegion : value);
    for (let frame = 0; frame < trace.frames.length; frame += 1) {
      const recorded = trace.frames[frame];
      const played = live.frameAt(frame);
      const at = `${where}frame ${frame}`;
      assert.equal(played.t, recorded.t, `${at}: tick`);
      assert.deepEqual(played.health, recorded.health, `${at}: health`);
      assert.equal(played.poses.length, recorded.poses.length, `${at}: pose count`);
      for (let body = 0; body < recorded.poses.length; body += 1) {
        const expected = recorded.poses[body];
        const actual = played.poses[body];
        // `target` is deliberately absent from the comparison and from the live
        // path: `POSE_INTENT` publishes the discriminant only.
        const { target: _tracedTarget, ...rest } = expected;
        assert.deepEqual({ ...actual, target: undefined },
          { ...rest, target: undefined }, `${at}: pose ${body}`);
      }
      assert.equal(played.contacts.length, recorded.contacts.length, `${at}: contact count`);
      for (let row = 0; row < recorded.contacts.length; row += 1) {
        const expected = recorded.contacts[row];
        const actual = played.contacts[row];
        // The five columns the event row does not carry are null on the live
        // side, which `LiveFightSource`'s header states and this asserts.
        assert.deepEqual([actual.velocityA, actual.velocityB, actual.impulseA,
          actual.impulseB, actual.alpha], [null, null, null, null, null], `${at}: contact ${row} absences`);
        const { velocityA, velocityB, impulseA, impulseB, alpha, region: tracedRegion, ...shared } = expected;
        assert.deepEqual(
          { ...actual, velocityA: null, velocityB: null, impulseA: null, impulseB: null,
            alpha: null, region: actual.region },
          { ...shared, velocityA: null, velocityB: null, impulseA: null, impulseB: null,
            alpha: null, region: region(tracedRegion) },
          `${at}: contact ${row}`,
        );
      }
    }
    console.log(`${fixture.file}: ${trace.frames.length} frames agree field for field`);
  }
});
