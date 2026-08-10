// Checks that web.wasm computes exactly what the native build computes.
//
// This is the project's central claim, under test for the first time: the same
// scenario, the same seed and the same decisions produce the same run on every
// target, forever. `cargo run --release -p lab -- hash` prints a 64-bit number
// on MSVC x86-64. The identical simulation compiled to wasm32 and driven from
// Node has to produce that number and not one bit else, or "deterministic" is
// a word this repository uses rather than a property it has. Run with:
//
//     node --test tools/wasm_check.js
//
// or plain `node tools/wasm_check.js` -- node:test runs the file's tests
// either way, the second with less ceremony around the output. No npm, no
// dependencies: `tools/gen_sin_table.js` is the precedent, and the reasoning
// is the same one DESIGN.md gives for the Rust side.
//
// The artifact is checked as it was built, and built only if it is missing --
// so after touching crates/, rebuild before believing a pass:
//
//     cargo build --release --target wasm32-unknown-unknown -p web
//
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { test } = require("node:test");

const ROOT = path.join(__dirname, "..");
const WASM = path.join(ROOT, "target", "wasm32-unknown-unknown", "release", "web.wasm");
const BUILD = ["cargo", "build", "--release", "--target", "wasm32-unknown-unknown", "-p", "web"];

// Both recorded from the native build and pinned again in crates/web/src/lib.rs,
// so a change in the sim's behaviour fails there as well as here. That pairing
// is what tells the two failure modes apart -- see `divergence` below.

// `lab hash`: skirmish(1234, 4, 6), seed 99, baseline policy, run to a finish.
const LAB_HASH = 0xfe31370e141ef531n;

// `init(1); set_goto(20_000, 12_000); step(600)`: the path a player drives.
// Re-recorded in `world-05` along with the three below: `init` is
// `Scenario::dungeon`, so the level going from 48x32 to 68x45 is a different
// floor plan and a different run from tick zero. `LAB_HASH` stayed put, which is
// how you tell a level change from a rules change.
const ROOM_HASH = 0x98441a18db7a95can;

// `init(1); spawn_monster(3); step(600)`: a whole fight, start to finish. Worth
// its own number because it reaches arithmetic the walk never does -- the spawn
// point comes out of `Rng::from_stream` and the committed sine table, and every
// approach measures a distance through `isqrt64`.
const BATTLE_HASH = 0x9aafe4bd54560586n;

// `init(1); spawn_monster(2) x3; step(1800); swap_in_hero(1); step(400)`: a
// fight, a death, a replacement, and the fight the replacement walks into. The
// longest arc the page can drive, and the only one of these four that runs the
// sim across the death of an entity and the *reuse* of its slot -- the
// generational free list is exactly the kind of index bookkeeping that a 32-bit
// usize could quietly do differently.
// Re-recorded in `world-04`, and the only one of the five that moved there: a
// replacement now arrives at the spot the last one fell rather than in the
// clearest room on the floor, and this is the one script with a death in it.
const SWAP_HASH = 0xf948f5486ee90191n;

// `init(1); set_hero_loadout(0, BOW); spawn_monster(BRUTE); step(1200)`: the
// only one of these five that ever puts an arrow in the air, and the only
// reason it exists. The other four never touch the projectile path, which is a
// good deal of arithmetic none of them exercise -- `Vec2::length` on every tick
// of every flight, `segment_circle`'s i64-staged dot products, and the
// saturating multiply in `tangential_speed` at the release. Portable
// fixed-point is a claim about code that runs.
const BOW_HASH = 0x4a1157735d305e9fn;
// Moved by v2-14C: ArticulatedV1 hashing gained a global `cap_hits:u32` after
// the actuator loop, and this probe is unstepped, so the move is four zero
// bytes and nothing else.
const ARTICULATED_COMMAND_HASH = 0x6e61a92ec96ac3a6n;
const COMBAT_GEOMETRY_HASH = 0x9d15344883cf6e9cn;

// The frame header, as the client reads it.
const HEADER_LEN = 15;
const UNIT_STRIDE = 33;
// Arrows, in a block after the units. `frame_len()` is therefore no longer a
// function of the unit count alone, which is half of what `FRAME_LAYOUT_VERSION`
// 3 announces -- the other half being the eighth header float that counts them.
const SHOT_STRIDE = 4;
// Events, in a third block after the arrows, counted by the ninth header float:
// what `FRAME_LAYOUT_VERSION` 4 announces, along with the unit row's new
// `sight_range` column. Three counts now, and `frame_len()` is the sum.
//
// Version 6 is the unit row's twenty-ninth column, `visible`: whether the player
// can see this body. The stride and the version move together, which is what
// makes moving the stride safe -- the page compares both at boot and refuses to
// draw a layout it does not understand.
//
// Version 7 is `art-03`, and it moves three of the five at once. The event row
// widens to carry a second entity and two kind-specific numbers; the unit row
// gains velocity, the walk cycle's phase and the current attack phase's length;
// and the header gains a fifteenth float counting the rows the module's own cap
// ate. **None of that is a hash moving** -- these constants are this file's own
// mirrors and the module is asserted to agree with them, so editing them is a
// deliberate one-line-each change, while the five hashes above must come out
// byte-identical either side of it.
const EVENT_STRIDE = 8;
// One past the last `EVENT_*` code, mirroring `web::EVENT_KINDS`. Codes are
// append-only, so this only ever grows and a row past it is a module writing
// something this file has never been told about.
const EVENT_KINDS = 11;
const EVENT_STEP = 7;
// `web::SLOT_EMPTY`, which an event row's `actor` and `other` columns use for
// "nobody": a portal opening and a descent are facts about the level and name
// no body at all.
const NOBODY = 255;
// `web::MAX_UNITS`. Written down rather than exported, because the page does not
// enforce it either -- see main.js's own mirror.
const MAX_UNITS = 64;

// How long the frame says it is, from its own three counts.
const frameSpan = (live) =>
  HEADER_LEN + UNIT_STRIDE * live[6] + SHOT_STRIDE * live[7] + EVENT_STRIDE * live[8];

// `ActionKind::code`, from crates/sim/src/action.rs. Append-only, so this is
// safe to write down.
const BOW_CODE = 6;
// `DUNGEON_COLS` x `DUNGEON_ROWS`, from crates/sim/src/scenario.rs. Written down
// rather than read off `wasm.map_cols()`, so that a level that quietly changed
// extent fails here instead of agreeing with itself.
const ARENA = [68, 45];

// ------------------------------------------------------------------ the module

function wasmBytes() {
  if (!fs.existsSync(WASM)) {
    build();
  }
  return fs.readFileSync(WASM);
}

function build() {
  process.stderr.write(`${path.relative(ROOT, WASM)} is missing; building it once.\n`);
  const [cargo, ...args] = BUILD;
  const built = spawnSync(cargo, args, { cwd: ROOT, stdio: "inherit" });
  if (built.status === 0) {
    return;
  }
  const why = built.error
    ? `\`${cargo}\` could not be run (${built.error.code}).`
    : `the build exited ${built.status}.`;
  throw new Error(
    [
      "",
      `There is no wasm build to check: ${why}`,
      "",
      "Build it with:",
      "",
      `    ${BUILD.join(" ")}`,
      "",
      "`-p web`, not a bare workspace build: lab uses std::thread::scope and has",
      "no business being compiled for wasm. If rustc has never seen the target,",
      "it needs one-time, online setup first:",
      "",
      "    rustup target add wasm32-unknown-unknown",
      "",
    ].join("\n"),
  );
}

// Stubs whatever the module asks for.
//
// It currently asks for nothing -- a cdylib with no wasm-bindgen links with an
// empty import list on this toolchain, which is the whole reason the boundary
// could be hand-rolled. This loop is insurance, not plumbing: the day some
// dependency drags in an import, the failure should be a line on stderr naming
// it, not a bare LinkError from the instantiate call.
function importsFor(mod) {
  const imports = {};
  for (const { module: from, name, kind } of WebAssembly.Module.imports(mod)) {
    process.stderr.write(`stubbing an unexpected ${kind} import: ${from}.${name}\n`);
    imports[from] ??= {};
    imports[from][name] = stub(kind);
  }
  return imports;
}

function stub(kind) {
  switch (kind) {
    case "function":
      return () => 0;
    case "memory":
      return new WebAssembly.Memory({ initial: 1 });
    case "table":
      return new WebAssembly.Table({ initial: 0, element: "anyfunc" });
    case "global":
      return new WebAssembly.Global({ value: "i32", mutable: true }, 0);
    default:
      throw new Error(`no stub for a ${kind} import`);
  }
}

const compiled = new WebAssembly.Module(wasmBytes());
const wasm = new WebAssembly.Instance(compiled, importsFor(compiled)).exports;

// ------------------------------------------------------------------ reading it

// wasm i32 arrives in JavaScript signed. Every number this boundary hands back
// is unsigned, so every one of them goes through here first -- a hash half past
// 0x7fffffff read as negative would turn a match into a spectacular mismatch.
const u32 = (n) => n >>> 0;

const hash64 = (lo, hi) => (BigInt(u32(hi)) << 32n) | BigInt(u32(lo));
const hex = (v) => `0x${v.toString(16).padStart(16, "0")}`;

const selftestHash = () => hash64(wasm.selftest_hash_lo(), wasm.selftest_hash_hi());
const stateHash = () => hash64(wasm.state_hash_lo(), wasm.state_hash_hi());

// The live frame, copied out.
//
// Never hold a typed array across a wasm call, not one call and not one line:
// any allocating call can grow linear memory, and growing it detaches the
// buffer every existing view points into. The frame is a fixed array whose
// address never moves, so this is belt and braces here -- but web/main.js runs
// the same rule at sixty frames a second, where it is the difference between a
// renderer and a silently empty canvas.
function frame() {
  const view = new Float32Array(wasm.memory.buffer, u32(wasm.frame_ptr()), u32(wasm.frame_len()));
  return Array.from(view);
}

// The hero's row, searched for by faction rather than taken from row zero.
// `write_frame` omits the dead, so once the character can fall, every row after
// a corpse shifts up by one -- and after a swap the newcomer is the last row,
// not the first. Answers null when there is nobody on that side.
function heroRow(live) {
  for (let i = 0; i < live[6]; i++) {
    const row = live.slice(HEADER_LEN + i * UNIT_STRIDE, HEADER_LEN + (i + 1) * UNIT_STRIDE);
    if (row[6] === 0) return row;
  }
  return null;
}

// The message that matters more than the assertion it is attached to.
function divergence(what, native, measured) {
  return [
    "",
    `${what} does not match the number the native build produces.`,
    "",
    `    native  ${hex(native)}`,
    `    wasm    ${hex(measured)}`,
    "",
    "The fixed-point simulation is NOT bit-identical between native (MSVC",
    "x86-64) and wasm32. That is this project's central claim -- the same inputs",
    "produce the same run, everywhere, forever -- and it is the reason the sim is",
    "16.16 fixed point with a committed sine table instead of floats. Do not",
    "edit the constant to make this pass; one of these two runs is wrong.",
    "",
    "First, which half moved? crates/web/src/lib.rs pins these same two numbers",
    "natively:",
    "",
    "    cargo test -p web",
    "",
    "  fails too -> the sim's behaviour changed and wasm is merely agreeing with",
    "               native about the new behaviour. Both constants get re-recorded,",
    "               deliberately, in the commit that changed it.",
    "  passes    -> the two targets genuinely disagree. Read on.",
    "",
    "Then, which system? The four hashes here exercise different code:",
    "selftest_hash runs a canned 4v6 fight (combat, perception noise, fitness),",
    "the room script runs click-to-move (the order channel, the decision loop,",
    "Order::Goto and the arrival rule), the battle script runs a spawn (the",
    "placement roll and the sine table), and the swap script runs a death and a",
    "reused entity slot. One failing alone names the system; all of them failing",
    "points at crates/fx, underneath everything.",
    "",
    "Where the targets can actually diverge, in the order worth checking:",
    "",
    "  - A float that reached simulation state. Fx::to_f32 is a one-way door",
    "    (DESIGN.md); a value that crossed back in makes the host's rounding a",
    "    gameplay input, and x86 and wasm need not agree.",
    "  - usize width: 64 bits natively, 32 in wasm. A length, capacity or index",
    "    that reaches a hash, or that saturates an Fx, produces exactly this",
    "    failure and no other symptom.",
    "  - crates/fx arithmetic: isqrt64, the i64 intermediates in Fx multiply and",
    "    divide, shifts of negative values, and every saturating boundary.",
    "  - Iteration order, which is required to be by ascending entity index with",
    "    index tie-breaks, and Rng::from_stream, which must not depend on it.",
    "",
    "Then bisect it. Drive step(1) in a loop here and against the same script",
    "natively, comparing state_hash tick by tick: the first tick that differs",
    "names the system far faster than reading the diff does.",
    "",
  ].join("\n");
}

// ------------------------------------------------------------------ the checks

test("the boundary exports everything the client calls", () => {
  // A rename is a LinkError in the browser and a silent `undefined is not a
  // function` here, so it is worth one cheap assertion up front.
  const exports = [
    "init",
    "init_articulated_test",
    "set_goto",
    // Beside `set_goto` because it is the other half of the click: a tap on
    // open ground is a destination, a tap on an enemy names a quarry. It earns
    // its line here for the reason the comment above gives twice over -- the
    // page keeps its own `EXPORTS` whitelist and binds only the names on it, so
    // a boundary function this list never checked can be present in the wasm,
    // absent from the page, and fail as `undefined is not a function` on the
    // first click rather than as anything either side calls an error.
    "set_focus",
    "focus_entity_index",
    "focus_entity_generation",
    "clear_order",
    "route_clear",
    "route_push",
    "route_len",
    "spawn_monster",
    "swap_in_hero",
    "step",
    "frame_ptr",
    "frame_len",
    "tick",
    "state_hash_lo",
    "state_hash_hi",
    "state_digest_lo",
    "state_digest_hi",
    "state_digest_domain",
    "state_digest_schema",
    "combat_geometry_digest_lo",
    "combat_geometry_digest_hi",
    // The contact solver's behavioral proof, read a byte at a time. Nothing on
    // the page calls these four; they exist for the check further down, which
    // is exactly why they need a line here -- an export no list mentions can be
    // renamed out from under the only caller it has.
    "contact_behavior_corpus_len",
    "contact_behavior_corpus_byte",
    "contact_behavior_digest_lo",
    "contact_behavior_digest_hi",
    // How many articulated rows `init_articulated_test` reserved the contact
    // vectors for. On this list for the same reason as the four above and one
    // more besides: its only caller is client/test/wasm-memory.test.mjs, whose
    // whole subject is that linear memory does not grow -- and an export that
    // has quietly become `undefined` reads as `NaN`, which never grows either.
    // A renamed no-growth witness would leave that test passing vacuously.
    "contact_high_water",
    // And the witness that the same test's clinch drive still reaches the cap
    // path, on the identical argument: `undefined() !== 0` throws, but
    // `undefined >>> 0` is `0`, and a renamed cap counter would turn "the drive
    // no longer caps" into a fixture that quietly stops covering the tick shape
    // it was written for.
    "contact_cap_hits",
    // The v2-16 pose and combat-event publications. Thirteen of the fifteen
    // names below have no caller on the legacy page at all -- the worker that
    // filters them lands in v2-17 -- so this list is the *only* thing standing
    // between a renamed export and a silent gap, and the gap would be silent in
    // the worst way: `pose_len()` and `combat_event_len()` read as `undefined`,
    // `undefined >>> 0` is `0`, and a stream that publishes nothing is exactly
    // what an idle world publishes too.
    "pose_ptr",
    "pose_len",
    "pose_stride",
    "pose_capacity",
    "poses_dropped",
    "pose_layout_version",
    "combat_event_ptr",
    "combat_event_len",
    "combat_event_stride",
    "combat_event_capacity",
    "combat_events_dropped",
    "combat_event_layout_version",
    // `init`'s room under the articulated model. Its only callers today are the
    // two tests below and client/test/wasm-memory.test.mjs, which warms it
    // because it is the call that reserves 64 rows of contact vectors a Legacy
    // heap has never held -- so a rename here would leave that test warming
    // nothing and failing on growth it caused itself.
    "init_articulated",
    // The portable stream claim, read a half at a time. Nothing on the page
    // calls either; they exist for `native_and_wasm_pose_event_stream_digests_match`
    // below, which is precisely why they need a line here.
    "articulated_stream_digest_lo",
    "articulated_stream_digest_hi",
    "submitted_command_ptr",
    "submitted_command_len",
    "submitted_command_layout_version",
    "submit_articulated",
    "selftest_hash_lo",
    "selftest_hash_hi",
    "set_policy",
    "policy_kind",
    "policy_weight_count",
    "policy_gene",
    "policy_weight",
    "set_policy_gene",
    "reset_policy_genes",
    "policy_label_ptr",
    "policy_label_len",
    "set_control",
    "control",
    "set_input",
    "frame_layout_version",
    "unit_stride",
    "shot_stride",
    "event_stride",
    "header_len",
    "action_count",
    "action_code",
    "action_name_ptr",
    "action_name_len",
    "action_role",
    "action_stat",
    "body_count",
    "body_name_ptr",
    "body_name_len",
    "body_stat",
    "hero_loadout",
    "hero_slot",
    "set_hero_loadout",
    "hero_stat",
    "set_hero_stat",
    "hero_body",
    "set_hero_body",
    "spawn_template_body",
    "set_spawn_template_body",
    "spawn_template_stat",
    "set_spawn_template_stat",
    "spawn_template_slot",
    "set_spawn_template_slot",
    "spawn_from_template",
    "map_ptr",
    "map_len",
    "map_cols",
    "map_rows",
    "map_revision",
    "map_tile_size_milli",
    "vis_ptr",
    "vis_len",
    "vis_revision",
    // The furniture: what stands on the floor plan and cannot be read out of it,
    // on a fourth buffer read when `furniture_revision()` moves. `furniture_len()`
    // counts *records* and not bytes; one record is `furniture_stride()` bytes of
    // `[kind, tx, ty, state]`.
    "furniture_ptr",
    "furniture_len",
    "furniture_stride",
    "furniture_revision",
    "descend",
  ];
  for (const name of exports) {
    assert.equal(typeof wasm[name], "function", `web.wasm does not export ${name}()`);
  }
  assert.ok(wasm.memory instanceof WebAssembly.Memory, "LLD did not export memory");

  // The five numbers the page's boot handshake compares. Wrong here and the
  // page stops with an overlay instead of painting a health bar out of a guard
  // arc, which is the handshake working -- but it is cheaper to find out here.
  assert.equal(wasm.frame_layout_version(), 7, "FRAME_LAYOUT_VERSION");
  assert.equal(wasm.header_len(), HEADER_LEN);
  assert.equal(wasm.unit_stride(), UNIT_STRIDE);
  assert.equal(wasm.shot_stride(), SHOT_STRIDE);
  assert.equal(wasm.event_stride(), EVENT_STRIDE);

  const imports = WebAssembly.Module.imports(compiled);
  console.log(`web.wasm: ${fs.statSync(WASM).size} bytes, ${imports.length} imports`);
});

test("the selftest hash is the number the lab prints natively", () => {
  // Independent of init() and of anything else in this file: selftest_hash
  // builds its own world, runs it to a conclusion and throws it away. It runs
  // exactly what `cargo run --release -p lab -- hash` runs, which is what makes
  // comparing against a number copied out of that command's output honest.
  const measured = selftestHash();
  // `ok`, not `equal`: assert.equal would append its own diff of the two values
  // in decimal, which is nineteen digits of noise under a message that already
  // prints both of them in hex.
  assert.ok(measured === LAB_HASH, divergence("The selftest hash", LAB_HASH, measured));
  console.log(`selftest hash  ${hex(measured)}  == native`);
});

test("the articulated command scratch matches Rust and stores atomically", () => {
  wasm.init_articulated_test(1);
  assert.equal(wasm.submitted_command_len(), 55);
  assert.equal(wasm.submitted_command_layout_version(), 1);
  const fixture = Uint8Array.from([
    0x01,0x00,0x01,0x00, 0x01,0x00,0x00,0x00, 0xfe,0xff,0xff,0xff,
    0x34,0x12,0x01, 0x44,0x33,0x22,0x11, 0x88,0x77,0x66,0x55,
    0x45,0x23, 0x00,0x40,0x00,0x00, 0x03,0x00,0x00,0x00,
    0x04,0x00,0x00,0x00, 0x56,0x34, 0x00,0xc0,0x00,0x00,
    0x05,0x00,0x00,0x00, 0x06,0x00,0x00,0x00, 0x02,0x01,0x01,0x00,
  ]);
  new Uint8Array(wasm.memory.buffer, u32(wasm.submitted_command_ptr()), 55).set(fixture);
  assert.equal(u32(wasm.submit_articulated(0, 0)), 1, "valid command was not stored verbatim");
  assert.equal(wasm.state_digest_domain(), 1);
  assert.equal(wasm.state_digest_schema(), 1);
  const measured = hash64(wasm.state_digest_lo(), wasm.state_digest_hi());
  assert.equal(measured, ARTICULATED_COMMAND_HASH, "articulated command digest differs from native");

  const malformed = fixture.slice();
  malformed[10 + 4] = 9; // intent tag at payload offset 10
  malformed.set([0x01, 0x00, 0x01, 0x00], 4); // also numerically out of range: syntax wins
  new Uint8Array(wasm.memory.buffer, u32(wasm.submitted_command_ptr()), 55).set(malformed);
  assert.equal(u32(wasm.submit_articulated(0, 0)), 1 << 8, "mixed malformed/range input stored a fallback");
  assert.equal(hash64(wasm.state_digest_lo(), wasm.state_digest_hi()), measured, "NotStored mutated state");
  console.log(`articulated     ${hex(measured)}  == native command fixture`);
});

test("combat geometry matches the frozen native digest", () => {
  assert.equal(
    hash64(wasm.combat_geometry_digest_lo(), wasm.combat_geometry_digest_hi()),
    COMBAT_GEOMETRY_HASH,
  );
});

// ---------------------------------------------- the behavioral contact corpus

// docs/reference/contact-solver.md, "Behavioral corpus V2": 3,548 bytes summing
// up every production resolution field v2-14 computes, for seven cases the
// reference states outcome by outcome.
//
// Every number below is transcribed from that document -- the case table, the
// invariants under it, and the byte grammar it shares with the 591-byte
// serialization corpus. Not one was read off a solver run, and that is the whole
// point of the fixture: a corpus derived from the thing it checks agrees with a
// drifting solver by construction and proves nothing. crates/sim keeps a second,
// independent literal of the same bytes, so this file compares the wasm target
// against the reference rather than against Rust.
const CONTACT_BEHAVIOR_BYTES = 3548;
const CONTACT_BEHAVIOR_DIGEST = 0x587b0259e877105an;

// FNV-1a-64 with offset 0xcbf29ce484222325 and prime 0x100000001b3: `fx::Hash64`
// over raw bytes, written out here rather than taken on trust.
function fnv1a64(bytes) {
  const mask = 0xffffffffffffffffn;
  let hash = 0xcbf29ce484222325n;
  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = (hash * 0x100000001b3n) & mask;
  }
  return hash;
}

// All 3,548 bytes, built from the reference.
function expectedContactCorpus() {
  const bytes = [];
  // A negative raw value crosses as its two's-complement bit pattern, which is
  // what `>>> 0` produces and what `Fx::raw() as u32` writes: -1 is 0xffffffff,
  // -21846 is 0xffffaaaa, -43691 is 0xffff5555.
  const putU32 = (value) => {
    const bits = value >>> 0;
    bytes.push(bits & 0xff, (bits >>> 8) & 0xff, (bits >>> 16) & 0xff, (bits >>> 24) & 0xff);
  };
  // A u64 is the low word and then the high word. Every one in this corpus fits
  // in 32 bits; splitting it properly anyway is what makes that an observation
  // about the data rather than an assumption baked into the reader.
  const putU64 = (value) => {
    putU32(value % 4294967296);
    putU32(Math.floor(value / 4294967296));
  };
  // A vector is XYZ, and every vector in this corpus has zero Y and Z.
  const putAxial = (x) => { putU32(x); putU32(0); putU32(0); };
  // The seven identity words a ContactFact and its ContactImpulse both carry.
  // Generation is zero throughout and A is always in the right slot.
  const putKey = (row) => {
    putU32(row.aIndex); putU32(0); putU32(1);
    putU32(row.bIndex); putU32(0); putU32(row.bSlot);
    putU32(row.kind);
  };
  // 8 ordinal/alpha + 84 fact + 52 impulse + 24 ledger + 32 channels = 200.
  // The normal is +X on every row; the impulse on B is the exact negation of
  // the one on A; `deflected` is zero throughout, because no fixture in this
  // corpus has armour behind its body.
  const putResolution = (row) => {
    putU32(row.ordinal); putU32(row.alpha);
    putKey(row); putU32(row.toi); putU32(row.region);
    putAxial(row.pointX); putAxial(65536);
    putAxial(row.velocityA); putAxial(row.velocityB);
    putKey(row); putAxial(row.onA); putAxial(-row.onA);
    putU64(row.before); putU64(row.after); putU64(row.dissipated);
    putU64(row.cut); putU64(row.thrust); putU64(row.pressure); putU64(0);
  };
  // 20 bytes of counts, the resolutions, then one final `(x_raw, vx_raw)` pair
  // per collider in label order -- so the collider count is the number of pairs.
  const putCase = (caseId, groups, capHits, rows, finals) => {
    putU32(caseId); putU32(finals.length); putU32(rows.length);
    putU32(groups); putU32(capHits);
    for (const row of rows) putResolution(row);
    for (const [x, vx] of finals) { putU32(x); putU32(vx); }
  };
  // A weapon/weapon row: B in the right slot, kind 0, the contact point riding
  // the global TOI, the moving label at 65536 and its target at rest. It names
  // no region -- there is no anatomy on the far side of a weapon.
  const ww = (ordinal, alpha, aIndex, toi, onA, [before, after, dissipated]) => ({
    ordinal, alpha, aIndex, bIndex: aIndex + 1, bSlot: 1, kind: 0,
    toi, region: 0xff, pointX: toi, velocityA: 65536, velocityB: 0, onA,
    before, after, dissipated, cut: 0, thrust: 0, pressure: 0,
  });

  for (const character of "ARPG-CONTACT-BEHAVIOR-V2") bytes.push(character.charCodeAt(0));

  putCase(0, 0, 0, [], []);

  // Two targets at one x: one mapped time carries both facts, so they share
  // group ordinal zero, one alpha and one ledger.
  putCase(1, 1, 0, [
    ww(0, 65536, 0, 16384, -32768, [32768, 16384, 16384]),
    { ...ww(0, 65536, 0, 16384, -32768, [32768, 16384, 16384]), bIndex: 2 },
  ], [[16384, 0], [40960, 32768], [40960, 32768]]);

  // The same rows at restitution 1. The group cannot take full alpha and the
  // greedy search settles on 43,691, which is also the impulse it applies.
  putCase(2, 1, 0, [
    ww(0, 43691, 0, 16384, -43691, [32768, 32768, 0]),
    { ...ww(0, 43691, 0, 16384, -43691, [32768, 32768, 0]), bIndex: 2 },
  ], [[-1, -21846], [49152, 43691], [49152, 43691]]);

  // Label 2 is label 0's ally, so momentum reaches it only through label 1:
  // two mapped times and therefore two ordinals.
  putCase(3, 2, 0, [
    ww(0, 65536, 0, 16384, -65536, [32768, 32768, 0]),
    ww(1, 65536, 1, 32768, -65536, [32768, 32768, 0]),
  ], [[16384, 0], [32768, 0], [65536, 65536]]);

  // Coincident at tick start: TOI zero, contact point at the origin, and the
  // post-exchange repeat suppressed rather than resolved a second time.
  putCase(4, 1, 0, [
    { ...ww(0, 65536, 0, 0, -32768, [4096, 4096, 0]), velocityA: 16384, velocityB: -16384 },
  ], [[-16384, -16384], [16384, 16384]]);

  // A Newton's cradle one group longer than the tick allows: eight resolve at
  // 4096..32768 and the ninth contact caps instead.
  putCase(5, 8, 1,
    [0, 1, 2, 3, 4, 5, 6, 7].map((k) => ww(k, 65536, k, 4096 * (k + 1), -65536, [32768, 32768, 0])),
    [[4096, 0], [8192, 0], [12288, 0], [16384, 0], [20480, 0],
     [24576, 0], [28672, 0], [32768, 0], [32768, 0], [36864, 0]]);

  // The one row with widened channels. B is a body, so the slot is BODY_SLOT
  // and the kind is 2; the contact point is where the tip lands rather than the
  // global time; a purely axial strike puts everything above the 144 energy
  // floor into thrust and the floor itself into pressure. Its region is Head,
  // and the zero is load-bearing: the body's five volumes are coincident, so
  // the choice falls all the way through the contract's tuple to BodyPart order.
  putCase(6, 1, 0, [
    {
      ...ww(0, 65536, 0, 32768, -32768, [32768, 16384, 16384]),
      bIndex: 1, bSlot: 0xff, kind: 2, region: 0, pointX: 65536,
      cut: 0, thrust: 16240, pressure: 144,
    },
  ], [[81920, 32768], [81920, 32768]]);

  return bytes;
}

test("the behavioral contact corpus is the bytes the reference specifies", () => {
  const expected = expectedContactCorpus();
  // Proved before anything is compared against it: a fixture that lost a field
  // would otherwise agree with a module that lost the same field.
  assert.equal(expected.length, CONTACT_BEHAVIOR_BYTES,
    "the corpus built in this file is not the documented length");
  assert.equal(hex(fnv1a64(expected)), hex(CONTACT_BEHAVIOR_DIGEST),
    "the corpus built in this file does not hash to the documented digest");

  assert.equal(u32(wasm.contact_behavior_corpus_len()), CONTACT_BEHAVIOR_BYTES,
    "web.wasm reports a different corpus length");
  const measured = [];
  for (let index = 0; index < expected.length; index++) {
    measured.push(u32(wasm.contact_behavior_corpus_byte(index)));
    if (measured[index] === expected[index]) continue;
    // Every field in this grammar is word-aligned, so the containing word is
    // what names the field; the byte offset on its own does not.
    const word = Math.floor(index / 4);
    const show = (source) => Array.from({ length: 4 }, (_, k) =>
      String(source[word * 4 + k]).padStart(3, " ")).join(" ");
    for (let k = word * 4; k < word * 4 + 4; k++) {
      measured[k] = u32(wasm.contact_behavior_corpus_byte(k));
    }
    assert.fail(`contact corpus differs at byte ${index}, in word ${word}: ` +
      `web.wasm [${show(measured)}], reference [${show(expected)}]`);
  }
  // 256 is the out-of-range answer, and it has to be: the corpus is full of
  // zero bytes, so no byte value could serve as the sentinel.
  assert.equal(u32(wasm.contact_behavior_corpus_byte(CONTACT_BEHAVIOR_BYTES)), 256,
    "an index one past the end did not answer 256");

  assert.equal(
    hex(hash64(wasm.contact_behavior_digest_lo(), wasm.contact_behavior_digest_hi())),
    hex(fnv1a64(measured)),
    "the exported digest halves are not FNV-1a-64 over the bytes just compared");
  console.log(`contact corpus ${hex(CONTACT_BEHAVIOR_DIGEST)}  == ${expected.length} bytes built here`);
});

// ------------------------------------------- the articulated pose/event ABI

// docs/reference/articulated-abi.md, "Pose rows" and "Combat-event rows". Every
// number below is transcribed from that document and none is read off the
// module, on the argument ARENA already carries two hundred lines up: a stride
// taken from the thing under test agrees with a module that moved a column by
// construction.
const POSE_LAYOUT_VERSION = 1;
const POSE_STRIDE = 66;
// `MAX_POSES` is the sim's own `MAX_ARTICULATED_ENTITIES`, so no world this
// module can build could overflow the pose buffer -- which is why the drop
// field is asserted rather than assumed below. It is the only witness that the
// defensive prefix rule is wired up at all, and a defensive rule nobody reads
// is a rule that has never run.
const MAX_POSES = 64;
const COMBAT_EVENT_LAYOUT_VERSION = 1;
// Thirty-two and not twenty-five: the group energy ledger and the four damage
// channels are `u64` in the solver, and each crosses as a low/high word pair. A
// host that narrowed one would publish a wrong number no reader could tell from
// a small one.
const COMBAT_EVENT_STRIDE = 32;
// **1024, and the 256 the plan proposed was measured and rejected.** The
// reference's mandatory `abi-high-water` corpus -- 64 bodies as 32 Fighter/Brute
// pairs three halves of a unit apart, one submitted command each at tick zero,
// exactly one `step(8)` -- accumulates 446 rows in that single batch, so at 256
// the host published the canonical 256 and counted 190 dropped. The rule for a
// rejected capacity is the next power of two at least twice the measurement:
// 446 doubles to 892 and rounds up.
const MAX_COMBAT_EVENTS = 1024;

// The pose columns this file reads, from the reference's row table.
const POSE_ENTITY_INDEX = 0;
const POSE_ENTITY_GENERATION = 1;
const POSE_LEFT_WEAPON_HILT_X = 29;
const POSE_RIGHT_WEAPON_HILT_X = 35;
const POSE_SHIELD_CENTER_X = 41;
const POSE_SEVERED_MASK = 61;
const POSE_EQUIPMENT_MASK = 62;
const POSE_INTENT = 63;
const POSE_LEFT_HINT = 64;
const POSE_RIGHT_HINT = 65;
// Idle 0, Chasing 1, Braced 2, Contact 3, Recoiling 4, Severed 5. Append-only,
// so this only ever grows and a code past it is a module animating something
// this file has never been told about.
const ANIMATION_HINTS = 6;
// Hold 0, Attack 1, Flee 2 -- the wire ordinals the 55-byte command payload
// froze, reused rather than renumbered.
const INTENTS = 3;
// Five `BodyPart` bits and nothing above them.
const SEVERED_MASK_BITS = 5;

// FNV-1a-64 over the published pose and combat-event words of a scripted
// articulated fight, prefixed ASCII `ARPG-STREAM-V1`. The script is
// `Scenario::articulated_duel()` at seed 1 with the fighter moved to (9,6) and
// the brute to (7,6), one articulated command submitted to each on tick zero and
// none after, twenty ticks and one publication each -- ticks 0, 1, 2 and 4
// resolve nothing, tick 3 resolves two rows and every tick from 5 resolves one,
// so both an empty tick and sixteen ticks of event rows are inside this number.
// Pinned again in crates/web/src/lib.rs exactly as the five state hashes are;
// `divergence` above explains what a one-sided failure means.
//
// **This one is not rebuilt from the reference, and the contact corpus above is
// the reason that is worth writing down.** That corpus is a byte table the
// document states outcome by outcome, so this file builds all 3,548 bytes and
// refuses to take the module's word for any of them. This stream is not a table.
// It is twenty ticks of fixed-point simulation output, and the only thing that
// can produce those bytes is the sim -- nor could this file read them out of a
// publication and re-digest them, because the script is not drivable from here:
// `init_articulated_test` builds the *unmoved* duel and no export places a body,
// so the two spawns the script depends on are unreachable across the wall.
// What the pin buys anyway is the whole cross-target claim, which is what this
// file is for: the number was recorded natively, the module recomputes it from
// its own run through the same two writers `publish` calls, and the two agreeing
// means wasm32 encodes what MSVC x86-64 encodes. What a single number cannot
// catch is an encoder wrong the same way on both targets, and the row grammar
// checked beside it is the part of the reference this file *can* rebuild.
const ARTICULATED_STREAM_DIGEST = 0x4372a94d89fc9155n;

// The live pose rows, copied out. Words and not floats: every published column
// is a `u32`, and the signed ones are two's-complement raw bits.
function poseRows() {
  const rows = u32(wasm.pose_len());
  const words = new Uint32Array(
    wasm.memory.buffer,
    u32(wasm.pose_ptr()),
    rows * POSE_STRIDE,
  );
  return Array.from({ length: rows }, (_, row) =>
    Array.from(words.slice(row * POSE_STRIDE, (row + 1) * POSE_STRIDE)));
}

test("wasm_exports_match_layout_stride_capacity_and_drop_fields", () => {
  // **`typeof` first, before a single value is read.** The trap this file
  // documents twice over up in the export list: `undefined >>> 0` is `0` and
  // `NaN` never grows, so an export renamed out from under this test turns every
  // assertion below into a vacuous pass. `poses_dropped()` answering zero
  // because it is not there reads exactly like "nothing was dropped".
  for (const name of [
    "pose_ptr", "pose_len", "pose_stride", "pose_capacity", "poses_dropped",
    "pose_layout_version", "combat_event_ptr", "combat_event_len",
    "combat_event_stride", "combat_event_capacity", "combat_events_dropped",
    "combat_event_layout_version", "init_articulated",
  ]) {
    assert.equal(typeof wasm[name], "function", `web.wasm does not export ${name}()`);
  }

  assert.equal(u32(wasm.pose_layout_version()), POSE_LAYOUT_VERSION, "POSE_LAYOUT_VERSION");
  assert.equal(u32(wasm.pose_stride()), POSE_STRIDE, "POSE_STRIDE");
  assert.equal(u32(wasm.pose_capacity()), MAX_POSES, "MAX_POSES");
  assert.equal(
    u32(wasm.combat_event_layout_version()),
    COMBAT_EVENT_LAYOUT_VERSION,
    "COMBAT_EVENT_LAYOUT_VERSION",
  );
  assert.equal(u32(wasm.combat_event_stride()), COMBAT_EVENT_STRIDE, "COMBAT_EVENT_STRIDE");
  assert.equal(u32(wasm.combat_event_capacity()), MAX_COMBAT_EVENTS, "MAX_COMBAT_EVENTS");

  // A Legacy world publishes neither stream, and that is the half of the
  // drop-field assertion that is not vacuous: zero rows *and* zero dropped is a
  // claim that both buffers were cleared rather than left holding the last
  // articulated run's rows. A pose row is ground truth about an identity, and
  // `publish` zeroes the buffers as well as the lengths for exactly that reason.
  wasm.init(1);
  wasm.step(60);
  assert.equal(u32(wasm.pose_len()), 0, "a Legacy world published a pose row");
  assert.equal(u32(wasm.poses_dropped()), 0, "a Legacy world dropped a pose row");
  assert.equal(u32(wasm.combat_event_len()), 0, "a Legacy world published a contact row");
  assert.equal(u32(wasm.combat_events_dropped()), 0, "a Legacy world dropped a contact row");

  // And a fresh articulated world, where the pose buffer is not empty and both
  // drop fields still read zero.
  wasm.init_articulated(1);
  const rows = u32(wasm.pose_len());
  assert.ok(
    rows > 0 && rows <= MAX_POSES,
    `pose_len ${rows} is not a live row count inside ${MAX_POSES}`,
  );
  assert.equal(u32(wasm.poses_dropped()), 0, "the room overflowed a buffer sized to the sim's own cap");
  assert.equal(u32(wasm.combat_event_len()), 0, "nobody has stepped and the feed is not empty");
  assert.equal(u32(wasm.combat_events_dropped()), 0, "nobody has stepped and the feed dropped a row");

  // Fixed arrays whose addresses never move, which is the one property the
  // worker's typed arrays depend on for the life of the module. Checked against
  // the *capacity* rather than the live length: the arrays are reserved whole at
  // construction, so a module that placed 147,968 bytes of statics past the end
  // of its own memory would be caught here rather than on the first busy tick.
  const [poseAt, eventAt] = [u32(wasm.pose_ptr()), u32(wasm.combat_event_ptr())];
  assert.ok(poseAt > 0 && eventAt > 0, "a published buffer is at address zero");
  assert.notEqual(poseAt, eventAt, "the two buffers share an address");
  assert.equal(poseAt % 4, 0, "the pose buffer is not u32-aligned");
  assert.equal(eventAt % 4, 0, "the combat-event buffer is not u32-aligned");
  const memoryBytes = wasm.memory.buffer.byteLength;
  for (const [name, at, bytes] of [
    ["POSES", poseAt, MAX_POSES * POSE_STRIDE * 4],
    ["COMBAT_EVENTS", eventAt, MAX_COMBAT_EVENTS * COMBAT_EVENT_STRIDE * 4],
  ]) {
    assert.ok(at + bytes <= memoryBytes, `${name} runs past the end of linear memory`);
  }
  wasm.step(8);
  assert.deepEqual(
    [u32(wasm.pose_ptr()), u32(wasm.combat_event_ptr())],
    [poseAt, eventAt],
    "a published buffer moved across a step",
  );
  console.log(
    `articulated abi ${rows} pose rows, ` +
      `${MAX_POSES}x${POSE_STRIDE} + ${MAX_COMBAT_EVENTS}x${COMBAT_EVENT_STRIDE} words reserved`,
  );
});

test("native_and_wasm_pose_event_stream_digests_match", () => {
  for (const name of ["articulated_stream_digest_lo", "articulated_stream_digest_hi"]) {
    assert.equal(typeof wasm[name], "function", `web.wasm does not export ${name}()`);
  }
  const measured = hash64(wasm.articulated_stream_digest_lo(), wasm.articulated_stream_digest_hi());
  assert.ok(
    measured === ARTICULATED_STREAM_DIGEST,
    divergence("The articulated pose/event stream digest", ARTICULATED_STREAM_DIGEST, measured),
  );

  // Cached on first touch, and that is a memory property rather than a
  // performance one: this is the only allocating call in the pose/event set, so
  // a second call that rebuilt its `Sim` would grow linear memory and detach
  // every typed array the page holds. Two calls answering one number is the
  // cheapest witness that the cache is doing its job.
  assert.equal(
    hash64(wasm.articulated_stream_digest_lo(), wasm.articulated_stream_digest_hi()),
    measured,
    "the stream digest was rebuilt on a second call",
  );

  // Self-contained, exactly as `selftest_hash` is: it builds its own world,
  // digests it and throws it away. A worker may ask for this mid-fight, and a
  // diagnostic that stepped the installed world would break the thing it was
  // diagnosing.
  wasm.init(4);
  wasm.step(12);
  const undisturbed = () => [
    wasm.tick(), hex(stateHash()), u32(wasm.frame_len()),
    u32(wasm.pose_len()), u32(wasm.combat_event_len()),
  ];
  const before = undisturbed();
  wasm.articulated_stream_digest_lo();
  assert.deepEqual(undisturbed(), before, "the stream digest disturbed the installed sim");
  console.log(`stream digest  ${hex(measured)}  == native`);

  // ---- the half a single number cannot make.
  //
  // A pinned digest says the two targets encode the same bytes; it says nothing
  // about whether those bytes are the rows the reference describes, because an
  // encoder wrong the same way on both targets agrees with itself. So the row
  // grammar is checked against the document rather than against the module: the
  // canonical order, the two masks and the two enumerations. Everything here is
  // a fact the reference states in prose, and none of it is derivable from the
  // digest.
  wasm.init_articulated(1);
  const rows = poseRows();
  assert.ok(rows.length > 1, "the articulated room published fewer than two bodies");
  let previous = null;
  for (const row of rows) {
    // Ascending *full* identity, index then generation. An index alone reads as
    // the same creature coming back after its slot was reused, which is why the
    // row carries both words and why the order is over the pair.
    const identity = [row[POSE_ENTITY_INDEX], row[POSE_ENTITY_GENERATION]];
    if (previous !== null) {
      const ascending = identity[0] > previous[0]
        || (identity[0] === previous[0] && identity[1] > previous[1]);
      assert.ok(ascending, `pose rows are not in ascending identity: ${previous} then ${identity}`);
    }
    previous = identity;

    assert.ok(row[POSE_INTENT] < INTENTS, `intent ${row[POSE_INTENT]} is not a wire ordinal`);
    for (const [hand, at] of [["left", POSE_LEFT_HINT], ["right", POSE_RIGHT_HINT]]) {
      assert.ok(row[at] < ANIMATION_HINTS, `the ${hand} animation hint is ${row[at]}`);
    }
    assert.ok(
      row[POSE_SEVERED_MASK] < 1 << SEVERED_MASK_BITS,
      `severed mask ${row[POSE_SEVERED_MASK]} has a bit above the five regions`,
    );

    // The equipment mask against the geometry it describes. An absent weapon or
    // shield writes zeroes rather than a sentinel -- there is already a presence
    // bit for it, and a second way to say "nothing here" is a second thing to
    // disagree about -- so the mask and the words are two statements of one fact
    // and this is the assertion that they are still the same fact.
    const present = (at, words) => row.slice(at, at + words).some((word) => word !== 0);
    const slots = [
      ["left weapon", 1 << 0, present(POSE_LEFT_WEAPON_HILT_X, 6)],
      ["right weapon", 1 << 1, present(POSE_RIGHT_WEAPON_HILT_X, 6)],
      ["shield", 1 << 2, present(POSE_SHIELD_CENTER_X, 8)],
    ];
    assert.ok(
      row[POSE_EQUIPMENT_MASK] < 1 << slots.length,
      `equipment mask ${row[POSE_EQUIPMENT_MASK]} has a bit above the three slots`,
    );
    for (const [name, bit, geometry] of slots) {
      assert.equal(
        (row[POSE_EQUIPMENT_MASK] & bit) !== 0,
        geometry,
        `body ${identity}: the ${name} bit and its published geometry disagree`,
      );
    }
  }
  // The hero is the first entity the room ever spawned, so it holds slot 0 at
  // generation 0 and it walks in holding a Fighter's sword and shield -- which
  // makes an all-zero mask on row zero the one reading that would say the
  // ownership rule never ran.
  assert.deepEqual(
    [rows[0][POSE_ENTITY_INDEX], rows[0][POSE_ENTITY_GENERATION]],
    [0, 0],
    "the first pose row is not the hero",
  );
  assert.notEqual(rows[0][POSE_EQUIPMENT_MASK], 0, "the room's Fighter walked in holding nothing");
  console.log(`pose grammar   ${rows.length} rows, hero mask ${rows[0][POSE_EQUIPMENT_MASK]}`);
});

test("a scripted walk leaves the world in the state native recorded", () => {
  // The more interesting half. The selftest is one canned fight; this is the
  // code path a player drives -- a click crossing as integer thousandths, the
  // per-faction order channel, the decision loop that has to answer as well as
  // step, and the arrival rule that has to stop the hero on the spot native
  // stopped it on.
  wasm.init(1);
  wasm.set_goto(20_000, 12_000);
  wasm.step(600);

  const measured = stateHash();
  assert.equal(wasm.tick(), 600, "step(600) did not simulate 600 ticks");
  assert.ok(measured === ROOM_HASH, divergence("The room-run state hash", ROOM_HASH, measured));
  console.log(`room-run hash  ${hex(measured)}  == native`);
});

test("the frame buffer still has the layout the client reads", () => {
  // Cheap, and it catches the failure mode that is invisible from the hashes: a
  // header field added or a unit column reordered leaves the simulation
  // bit-identical and repaints the game wrong.
  wasm.init(1);
  wasm.set_goto(20_000, 12_000);
  wasm.step(60);

  const live = frame();
  const units = live[6];
  assert.ok(units >= 2, "the level opens with a hero and some opposition");
  assert.equal(
    live.length,
    frameSpan(live),
    `frame_len() is ${live.length}, not ${HEADER_LEN} + ${UNIT_STRIDE} * ${units}` +
      ` + ${SHOT_STRIDE} * ${live[7]} + ${EVENT_STRIDE} * ${live[8]}`,
  );
  assert.deepEqual([live[0], live[1]], ARENA, "arena_x, arena_y");
  assert.equal(live[2], 4, "order_kind: Goto is discriminant 4");
  assert.deepEqual([live[3], live[4]], [20, 12], "order_x, order_y: 20_000 thousandths is 20.0");
  assert.ok(live[5] > 0 && live[5] <= wasm.tick(), `last_decision_tick ${live[5]}`);

  // The run block: how much is left, where the way out is, and which floor.
  assert.equal(live[9], units - 1, "monsters_left disagrees with the unit rows");
  // Nothing marks the way out while monsters live. `1` -- "visible but shut" --
  // is retired and never emitted; see `PORTAL_SHUT` in `crates/web/src/lib.rs`
  // for the decision that retired it.
  assert.equal(live[12], 0, "portal_state: the exit was marked before it was won");
  assert.deepEqual([live[10], live[11]], [0, 0], "portal_x, portal_y with no portal");
  assert.equal(live[13], 0, "depth: the first floor");

  // The floor plan, which crosses on its own buffer because it changes once a
  // level rather than sixty times a second.
  assert.deepEqual([wasm.map_cols(), wasm.map_rows()], ARENA, "map_cols, map_rows");
  assert.equal(wasm.map_len(), ARENA[0] * ARENA[1], "map_len");
  assert.equal(wasm.map_tile_size_milli(), 1000, "one tile is one world unit");
  const tiles = new Uint8Array(wasm.memory.buffer, wasm.map_ptr(), wasm.map_len());
  assert.ok(tiles.some((t) => t !== 0), "nothing was carved");
  assert.ok(tiles.some((t) => t === 0), "nothing was left open");

  // The hero, drawn from the first row. Checking a couple of columns by value
  // is what distinguishes "the row is there" from "the row is shifted by one",
  // which is a facing wedge drawn out of a hit-point total.
  const unit = live.slice(HEADER_LEN);
  // The body is standing on ground the map calls open, which is the one
  // assertion that ties the two buffers together.
  assert.equal(
    tiles[Math.floor(unit[1]) * wasm.map_cols() + Math.floor(unit[0])],
    0,
    `the hero at ${unit[0]}, ${unit[1]} is standing in masonry`,
  );
  assert.ok(unit[2] >= 0 && unit[2] <= 65535, `facing_raw ${unit[2]} is not a binary angle`);
  assert.ok(Math.abs(unit[3] - 0.45) < 0.001, `radius ${unit[3]}`);
  assert.equal(unit[5], 12, "max_hp: 4 + vitality 8");
  assert.equal(unit[6], 0, "faction: Heroes");
  // The identity columns the client keys its per-body animations on. The room's
  // hero is the first entity ever spawned, so it holds slot 0 at generation 0.
  assert.deepEqual([unit[9], unit[10]], [0, 0], "entity_index, entity_generation");

  // The appended swordplay columns. Bearings are binary angles like `facing`;
  // extensions and flash markers are fractions; the weapon columns are the
  // Warrior's. A column added in the middle would leave every hash identical
  // and draw a blade out of a hit-point total.
  for (const i of [11]) {
    assert.ok(unit[i] >= 0 && unit[i] <= 65535, `column ${i} (${unit[i]}) is not a binary angle`);
  }
  for (const i of [12, 16, 17, 18]) {
    assert.ok(unit[i] >= 0 && unit[i] <= 1, `column ${i} (${unit[i]}) is outside 0..=1`);
  }
  assert.ok(Math.abs(unit[14] - 0.95) < 0.001, `action_length ${unit[14]}`);
  // The guard arc of what is in hand. A Fighter walks in holding a sword, and
  // a sword guards nothing -- the arc belongs to the shield action now.
  assert.equal(unit[15], 0, "a sword is not a guard");
  // How far it sees: `6.0 + 0.6 * perception 6`, from the stat sheet rather
  // than from a formula the page kept its own copy of. The registry answers the
  // same number for a body nobody has spawned, in thousandths.
  assert.ok(Math.abs(unit[27] - 9.6) < 0.001, `sight_range ${unit[27]}`);
  assert.equal(wasm.body_stat(0, 7), 9_600, "body_stat(FIGHTER, sight)");

  // And the last column, which is whether the *player* can see this body. This
  // row is the hero's, so it is its own point of view and the only answer it can
  // have is 1. Every other row is a 0 or a 1 and nothing else -- a column that
  // arrived as a distance or a byte count would draw a ghost over a live body.
  assert.equal(unit[28], 1, "visible: the hero cannot see itself");
  for (let i = 0; i < units; i++) {
    const row = live.slice(HEADER_LEN + i * UNIT_STRIDE, HEADER_LEN + (i + 1) * UNIT_STRIDE);
    assert.ok(row[28] === 0 || row[28] === 1, `visible ${row[28]} is not a flag`);
  }

  // The four `art-03` columns, and the fifteenth header float. Checked here
  // because **the hashes cannot see the frame at all** -- the note at the top of
  // this test says a column added in the middle would leave every hash identical
  // and repaint the game wrong, and a column appended and left permanently zero
  // is the same failure with a quieter symptom.
  // Half-open and signed, exactly as the walk-cycle test below asserts it and
  // as `Trace::stride`, `UNIT_STRIDE`'s doc and `readUnit` all promise it:
  // `0 <= stride < 1`. An `Math.abs(...) <= 1` here would accept -1 and +1,
  // which is the one value a page indexing a sprite sheet by
  // `Math.floor(stride * frames)` reads as a frame past the end.
  assert.ok(unit[31] >= 0 && unit[31] < 1, `stride ${unit[31]} left 0..1`);
  assert.ok(unit[32] >= 0 && unit[32] < 1000, `swing_span ${unit[32]}`);
  // **`events_dropped` is not zero here, and that is the cap working.** The
  // module clears the feed per *call* and not per tick, so `step(60)` asks one
  // frame to carry sixty ticks of events -- seven and a half times the eight
  // `MAX_EVENTS` is sized for. A test harness batching ticks is not a page, and
  // the page's own behaviour is checked in the two tests below, which step one
  // tick at a time and assert this is zero.
  assert.ok(live[14] >= 0, `events_dropped ${live[14]} is not a count`);
});

test("the walk cycle's columns describe the walk", () => {
  // `stride`, `vx` and `vy` are the three columns nothing in the sim hashes and
  // nothing on this page enforces, so this is the only place they are claimed to
  // mean anything. The claim is deliberately about *properties* rather than
  // numbers: `STRIDE_PER_RADIUS` is a look and may be retuned, and a test that
  // pinned its value here would fail for a reason that is not a bug.
  wasm.init(1);
  wasm.set_goto(20_000, 12_000);
  wasm.step(60);

  let steps = 0;
  let strideMoved = false;
  let walked = false;
  let last = heroRow(frame())[31];
  for (let i = 0; i < 300; i++) {
    wasm.step(1);
    const live = frame();
    const hero = heroRow(live);
    if (hero === null) break;
    if (Math.abs(hero[29]) > 0.001 || Math.abs(hero[30]) > 0.001) walked = true;
    if (hero[31] !== last) strideMoved = true;
    last = hero[31];
    assert.ok(hero[31] >= 0 && hero[31] < 1, `stride ${hero[31]} left 0..1`);
    // `swing_left` is what is left of the phase and `swing_span` is what it
    // started with, so one can never exceed the other. This is the assertion
    // that would catch the span being captured a tick late.
    assert.ok(
      hero[32] >= hero[20],
      `swing_span ${hero[32]} is below swing_left ${hero[20]}`,
    );
    if (hero[19] === 0) assert.equal(hero[32], 0, "swing_span is set at guard");
    const base = HEADER_LEN + UNIT_STRIDE * live[6] + SHOT_STRIDE * live[7];
    for (let e = 0; e < live[8]; e++) {
      if (live[base + e * EVENT_STRIDE] === EVENT_STEP) steps += 1;
    }
    assert.equal(live[14], 0, "events_dropped: one hero walking overran the feed");
  }
  assert.ok(walked, "the hero reported no velocity over three hundred ticks of walking");
  assert.ok(strideMoved, "the stride column never moved while the hero walked");
  assert.ok(steps > 0, "three hundred ticks of walking produced no footfall");

  // And the half that says the accumulator is driven by speed and not by time.
  // The feet are taken and told to do nothing, which is the only way to park a
  // body deterministically -- a `Goto` at its own position still creeps, and a
  // hero left on its own policy walks off to find the monsters `init` spawned.
  wasm.set_control(1);
  wasm.set_input(0, 0, 0, 0, 0, 0);
  wasm.step(120);
  const parked = heroRow(frame());
  assert.ok(
    Math.abs(parked[29]) < 0.002 && Math.abs(parked[30]) < 0.002,
    `a parked hero reports velocity ${parked[29]}, ${parked[30]}`,
  );
  wasm.step(60);
  assert.equal(
    heroRow(frame())[31],
    parked[31],
    "a standing body's stride kept turning over, so it is on a clock and not on its feet",
  );
  console.log(`walk cycle    ${steps} footfalls over 300 ticks`);
});

test("a fight reports the kinds a fight is made of", () => {
  // The four derived kinds `art-03` added and nothing consumes yet. They are
  // the ones with no other guard at all: no hash walks the event list, and the
  // page skips a kind it has never heard of by design -- so a kind that stopped
  // being emitted would be silent everywhere.
  wasm.init(1);
  for (let i = 0; i < 3; i++) wasm.spawn_monster(2, 255, 255);

  const seen = new Map();
  for (let i = 0; i < 1_800; i++) {
    wasm.step(1);
    const live = frame();
    const base = HEADER_LEN + UNIT_STRIDE * live[6] + SHOT_STRIDE * live[7];
    for (let e = 0; e < live[8]; e++) {
      const row = live.slice(base + e * EVENT_STRIDE, base + (e + 1) * EVENT_STRIDE);
      seen.set(row[0], (seen.get(row[0]) ?? 0) + 1);
      assert.ok(row[0] >= 0 && row[0] < EVENT_KINDS, `event kind ${row[0]}`);
      for (const i of [4, 5]) {
        assert.ok(
          (row[i] >= 0 && row[i] < MAX_UNITS) || row[i] === NOBODY,
          `column ${i} is ${row[i]}, neither a slot nor nobody`,
        );
      }
    }
    assert.equal(live[14], 0, "events_dropped: a four-body brawl overran the feed");
  }
  // 4 death, 6 phase, 7 step, 8 shove. Named by number rather than by a mirror
  // of the constants, so that a code silently changing meaning fails here.
  for (const [kind, name] of [[4, "death"], [6, "phase"], [7, "step"], [8, "shove"]]) {
    assert.ok(seen.get(kind) > 0, `a whole brawl produced no ${name} row`);
  }
  const tally = [...seen.entries()].sort((a, b) => a[0] - b[0]).map(([k, n]) => `${k}:${n}`);
  console.log(`event kinds   ${tally.join(" ")}`);
});

test("a policy can be chosen and tuned across the boundary", () => {
  // The behaviour panel's whole surface, checked in wasm rather than only
  // natively: these are the twelve newest exports and the ones most likely to
  // be renamed on one side of the wall and not the other.
  wasm.init(1);
  // The two sides open on different minds: the hero on the duelist, which is
  // the one that dispatches to a mind per action, and the monsters on the naive
  // baseline it is measured against.
  assert.equal(wasm.policy_kind(0), 1, "heroes should open on the duelist");
  assert.equal(wasm.policy_kind(1), 0, "monsters should open on the baseline");

  assert.equal(wasm.set_policy(0, 0), 1, "could not select the baseline");
  assert.equal(wasm.policy_kind(0), 0);
  assert.equal(wasm.policy_kind(1), 0, "selecting one side moved the other");
  assert.equal(wasm.set_policy(0, 999), 0, "an unknown policy code was accepted");
  assert.equal(wasm.set_policy(0, 1), 1, "could not select the duelist");

  const knobs = wasm.policy_weight_count(0);
  assert.ok(knobs > 0, "the duelist reports no knobs at all");

  // Names come out of linear memory rather than being mirrored into the page,
  // so the page cannot end up labelling a gene that has been renamed.
  const bytes = new Uint8Array(wasm.memory.buffer, wasm.policy_label_ptr(0, 0), wasm.policy_label_len(0, 0));
  const first = new TextDecoder().decode(bytes);
  assert.ok(first.length > 0, "the first knob has no name");
  assert.equal(wasm.policy_label_len(0, knobs), 0, "an index past the end named something");

  const before = wasm.policy_weight(0, 0);
  assert.equal(wasm.set_policy_gene(0, 0, 1000), 1);
  assert.notEqual(wasm.policy_weight(0, 0), before, "the knob did not move");
  assert.equal(wasm.reset_policy_genes(0), 1);
  assert.equal(wasm.policy_weight(0, 0), before, "reset did not restore the baseline");

  // And a policy with nothing to tune stays total rather than trapping.
  wasm.set_policy(1, 2);
  assert.equal(wasm.policy_weight_count(1), 0);
  assert.equal(wasm.set_policy_gene(1, 0, 500), 0);
  console.log(`behaviour      ${knobs} knobs, first is "${first}"`);
});

test("the player can take the feet, the limb and the choice", () => {
  wasm.init(1);
  assert.equal(wasm.control(), 0);

  wasm.set_control(1); // feet
  assert.equal(wasm.control(), 1);
  const before = frame()[HEADER_LEN];
  wasm.set_input(-1000, 0, 0, 0, 0, 0);
  wasm.step(60);
  // Measured against where it started rather than against a coordinate: the
  // level is carved and generated, so where the hero opens is a fact about the
  // seed. How far west it gets is a fact about the room it is in; that it goes
  // west at all is the claim.
  assert.ok(
    frame()[HEADER_LEN] < before,
    `the hero did not walk west when told to: ${before} -> ${frame()[HEADER_LEN]}`,
  );

  // Three independent bits, and the page draws a switch over each. A mask that
  // gained a bit on the way in would be a switch that lights itself, which is
  // exactly what taking the limb used to do to the choice.
  for (const mask of [0, 1, 2, 3, 4, 5, 6, 7]) {
    wasm.set_control(mask);
    assert.equal(wasm.control(), mask, `mask ${mask} did not survive the round trip`);
  }

  wasm.set_control(2);
  assert.equal(wasm.control(), 2, "taking the limb dragged another bit in with it");
  // Guard due north, attacking nothing.
  wasm.set_input(0, 0, 16_384, 0, 0, 0);
  wasm.step(120);
  const unit = frame().slice(HEADER_LEN);
  assert.ok(Math.abs(unit[11] - 16_384) < 2_000, `sword ended at ${unit[11]}, not north`);
  assert.equal(unit[19], 0, "a chambered blade was not in guard");

  // The attack button, and the property the whole swing model exists for: the
  // cut announces itself before it goes live, and the frame says so.
  wasm.set_input(0, 0, 16_384, 0, 0, 1);
  let sawWindup = false;
  let sawStrike = false;
  for (let i = 0; i < 90; i += 1) {
    wasm.step(1);
    const swing = frame()[HEADER_LEN + 19];
    if (swing === 1) sawWindup = true;
    if (swing === 2) {
      assert.ok(sawWindup, "the cut went live without announcing itself");
      sawStrike = true;
    }
  }
  assert.ok(sawWindup && sawStrike, "the attack button threw nothing");

  wasm.set_control(0);
  assert.equal(wasm.control(), 0);
});

test("a monster walks in and takes the next row of the frame", () => {
  wasm.init(1);
  const rows = frame()[6];
  const standing = frame()[9];
  // The answer is how many monsters are standing afterwards, not "one
  // arrived" -- a level opens with opposition already in it now, so the two
  // stopped being the same number.
  assert.equal(wasm.spawn_monster(3, 255, 255), standing + 1, "nothing arrived");

  const live = frame();
  assert.equal(live[6], rows + 1, "unit_count");
  assert.equal(live[9], standing + 1, "monsters_left did not count the newcomer");
  assert.equal(
    live.length,
    frameSpan(live),
    `frame_len() is ${live.length}, not ${HEADER_LEN} + ${UNIT_STRIDE} * ${live[6]}` +
      ` + ${SHOT_STRIDE} * ${live[7]} + ${EVENT_STRIDE} * ${live[8]}`,
  );

  // The last row, which is the one that just arrived: `write_frame` walks the
  // roster in spawn order and the newcomer was pushed onto the end of it.
  const monster = live.slice(HEADER_LEN + UNIT_STRIDE * (live[6] - 1));
  assert.equal(monster[6], 1, "faction: Monsters");
  assert.equal(monster[7], 3, "kind: Skitterer");
  assert.equal(monster[4], monster[5], "arrived already wounded");
  assert.equal(monster[10], 0, "entity_generation: a fresh slot");
});

test("the floor plan crosses once a level and not once a frame", () => {
  // The revision is the whole mechanism by which the page knows when to
  // re-bake a level. `publish` runs on every export, so a revision that moved
  // with the frame would have the client rebuilding a few thousand `Path2D`
  // rectangles sixty times a second.
  wasm.init(1);
  const tiles = () => new Uint8Array(wasm.memory.buffer, wasm.map_ptr(), wasm.map_len()).slice();

  const revision = wasm.map_revision();
  const before = tiles();
  assert.equal(before.length, wasm.map_cols() * wasm.map_rows(), "map_len");

  wasm.step(120);
  wasm.set_goto(4_000, 4_000);
  wasm.spawn_monster(3, 255, 255);
  assert.equal(wasm.map_revision(), revision, "the floor plan moved under a frame");
  assert.deepEqual(tiles(), before, "the tiles moved under a frame");

  // And a descent is exactly when it does move.
  assert.equal(wasm.descend(), 1, "descend did not report the new depth");
  assert.equal(frame()[13], 1, "depth");
  assert.equal(wasm.tick(), 0, "the new floor did not start at tick zero");
  assert.notEqual(wasm.map_revision(), revision, "a new floor kept the old revision");
  assert.notDeepEqual(tiles(), before, "a new floor kept the old tiles");
  console.log(`floor plan    ${before.length} tiles, revision ${revision} -> ${wasm.map_revision()}`);
});

// The live visibility buffer, copied out. One byte a tile, indexed exactly as
// the tile buffer is: 0 never seen, 1 seen earlier on this floor, 2 in sight now.
function fog() {
  return new Uint8Array(wasm.memory.buffer, u32(wasm.vis_ptr()), u32(wasm.vis_len())).slice();
}

// The live furniture buffer, copied out and split into records. One record a
// tile, `furniture_stride()` bytes of `[kind, tx, ty, state]` -- kind 1 is a
// doorway, whose state byte is 1 open and 0 shut, and kind 2 is a torch, whose
// state byte is which face it hangs on: 0 the `+x` face, 1 the `+y` face.
function furniture(kind) {
  const count = u32(wasm.furniture_len());
  const stride = u32(wasm.furniture_stride());
  const bytes = new Uint8Array(wasm.memory.buffer, u32(wasm.furniture_ptr()), count * stride).slice();
  const out = [];
  for (let i = 0; i < count; i++) {
    const record = Array.from(bytes.slice(i * stride, (i + 1) * stride));
    if (kind === undefined || record[0] === kind) out.push(record);
  }
  return out;
}

test("the doorways and the torches cross on a buffer the tile bytes cannot carry", () => {
  // The furniture buffer's whole reason for existing, asserted from the page's
  // side. A *shut* door is solid, so `map_ptr` publishes it as a 1 the client
  // cannot tell from rock, and an *open* one is a 0 it cannot tell from the floor
  // it was cut into; a renderer working off the tiles alone watches the doorway
  // vanish the moment somebody walks through it. A torch is not in the tile bytes
  // at all -- the page cannot tell a room wall from a corridor wall without
  // redoing the generator's work, and only the generator has ever known.
  wasm.init(1);
  assert.equal(wasm.furniture_stride(), 4, "furniture_stride");
  const all = furniture();
  const doors = furniture(1);
  const torches = furniture(2);
  assert.ok(doors.length > 0, "a generated level published no doorways at all");
  assert.ok(torches.length > 0, "a generated level published no torches at all");
  assert.equal(
    doors.length + torches.length,
    all.length,
    "an unknown furniture kind reached the page",
  );

  const tiles = new Uint8Array(wasm.memory.buffer, wasm.map_ptr(), wasm.map_len()).slice();
  const cols = wasm.map_cols();
  for (const [, tx, ty, state] of doors) {
    assert.ok(tx < ARENA[0] && ty < ARENA[1], `a doorway at (${tx}, ${ty}) is off the level`);
    assert.equal(state, 0, "a level opened with a door already open");
    assert.equal(tiles[ty * cols + tx], 1, `the tiles call the shut doorway at (${tx}, ${ty}) floor`);
  }
  for (const [, tx, ty, face] of torches) {
    assert.ok(tx < ARENA[0] && ty < ARENA[1], `a torch at (${tx}, ${ty}) is off the level`);
    assert.ok(face === 0 || face === 1, `a torch at (${tx}, ${ty}) faces ${face}`);
    // Solid where it hangs, floor where it looks: the two conditions that make a
    // torch a light with a lamp rather than one floating in a room.
    assert.equal(tiles[ty * cols + tx], 1, `the torch at (${tx}, ${ty}) is on floor`);
    const [dx, dy] = face === 0 ? [1, 0] : [0, 1];
    assert.equal(tiles[(ty + dy) * cols + tx + dx], 0, `the torch at (${tx}, ${ty}) faces rock`);
  }

  // Read on the same terms as the tiles: when the revision moves and not
  // otherwise. `publish` runs on every export, so a revision that moved with the
  // frame would have the page re-baking the level sixty times a second.
  const revision = wasm.furniture_revision();
  wasm.step(120);
  wasm.spawn_monster(3, 255, 255);
  assert.equal(wasm.furniture_revision(), revision, "the furniture moved under a frame");
  assert.deepEqual(furniture(), all, "the records moved under a frame");

  assert.equal(wasm.descend(), 1, "descend did not report the new depth");
  assert.notEqual(wasm.furniture_revision(), revision, "a new floor kept the old furniture");
  console.log(
    `furniture      ${doors.length} door tiles and ${torches.length} torches, ` +
      `${furniture().length} records on floor 2`,
  );
});

// Which tile the hero is standing in, as one string to compare, or null once
// there is nobody standing. The fog's cache key is the hero's *tile*, so this is
// the only granularity worth asking about.
function heroTile() {
  const hero = heroRow(frame());
  return hero === null ? null : `${Math.floor(hero[0])},${Math.floor(hero[1])}`;
}

test("the fog is rebuilt when the hero changes tile and at no other time", () => {
  // Two exports for the same number, so this can be asserted rather than
  // assumed. It is the assertion that lets the page read the two buffers with
  // one loop index.
  wasm.init(1);
  assert.equal(wasm.vis_len(), wasm.map_len(), "vis_len and map_len disagree");
  assert.equal(wasm.vis_len(), wasm.map_cols() * wasm.map_rows(), "vis_len");

  const arrival = fog();
  assert.ok(arrival.some((v) => v === 2), "the hero arrived blind");
  assert.ok(arrival.some((v) => v === 0), "a whole floor was in sight at once");
  assert.ok(!arrival.some((v) => v === 1), "the level arrived already explored");

  // The property, checked tick by tick rather than over a window, which is what
  // makes it the property and not a sample of it: while the hero is in the tile
  // it was in, the revision must not move -- `publish` runs on every export, and
  // a revision that moved with the frame would have the page re-baking a few
  // thousand Path2D rectangles sixty times a second. And the tick it leaves that
  // tile is the tick the revision must move, because that is the complete set of
  // moments a tile-granular answer can differ.
  //
  // Driven under manual control rather than by a click, because what is needed
  // here is a hero that certainly moves: an ordered walk can be a hero standing
  // still if the destination was where it already was.
  wasm.set_control(1);
  wasm.set_input(-1000, 0, 0, 0, 0, 0);
  let tile = heroTile();
  let revision = wasm.vis_revision();
  let crossings = 0;
  for (let i = 0; i < 600; i++) {
    wasm.step(1);
    const now = heroTile();
    // Nobody left to have a point of view. The fog freezes where it was, which
    // is correct and is a different assertion from either of the two below.
    if (now === null) break;
    const moved = wasm.vis_revision() !== revision;
    if (now === tile) {
      assert.ok(!moved, `tick ${wasm.tick()}: the fog was rebuilt inside tile ${tile}`);
    } else {
      assert.ok(moved, `tick ${wasm.tick()}: crossed ${tile} -> ${now} and the fog did not notice`);
      crossings += 1;
    }
    tile = now;
    revision = wasm.vis_revision();
  }
  assert.ok(crossings > 0, "the hero never crossed a tile in 600 ticks");

  // And the remembered half: the room it walked out of is dim, not black.
  const walked = fog();
  assert.ok(walked.some((v) => v === 1), "the hero left nothing behind as remembered");
  arrival.forEach((v, cell) => {
    if (v !== 0) assert.ok(walked[cell] !== 0, `tile ${cell} was seen and then forgotten`);
  });

  // A new floor does not arrive pre-explored, which is the one place `seen` is
  // cleared and the only way to tell it from a buffer that is never cleared.
  wasm.set_control(0);
  const before = wasm.vis_revision();
  assert.equal(wasm.descend(), 1, "never descended");
  const fresh = fog();
  assert.ok(!fresh.some((v) => v === 1), "floor 2 inherited floor 1's memory");
  assert.ok(fresh.some((v) => v === 2), "floor 2 arrived blind");
  assert.notEqual(wasm.vis_revision(), before, "a new floor kept the old fog revision");
  console.log(`fog            ${crossings} tile crossings over 600 ticks`);
});

// Waypoints a body can stand on, taken off the tile buffer rather than written
// down: the level is generated, so a hardcoded triple is a coin flip on whether
// any of the three is standable. Nearest first, and no two within 1.5 units of
// each other or of the hero -- wider than ROUTE_ARRIVE plus a Fighter's radius,
// so the queue cannot satisfy two legs at once and read as having advanced when
// it merely arrived.
function legsNearHero(live, count) {
  const cols = wasm.map_cols();
  const tiles = new Uint8Array(wasm.memory.buffer, wasm.map_ptr(), wasm.map_len()).slice();
  const hero = heroRow(live);
  const open = [];
  for (let cell = 0; cell < tiles.length; cell++) {
    if (tiles[cell] !== 0) continue;
    // A tile centre, which is clear for anything up to a 0.5 radius whatever
    // its neighbours are -- so an open tile is a standable waypoint for a
    // Fighter without asking the module a second question.
    const x = (cell % cols) + 0.5;
    const y = Math.floor(cell / cols) + 0.5;
    open.push([x, y, Math.hypot(x - hero[0], y - hero[1])]);
  }
  open.sort((a, b) => a[2] - b[2]);

  const legs = [];
  for (const [x, y, fromHero] of open) {
    if (fromHero < 1.5) continue;
    if (legs.every(([lx, ly]) => Math.hypot(x - lx, y - ly) >= 1.5)) {
      legs.push([x, y]);
    }
    if (legs.length === count) break;
  }
  return legs;
}

test("a dragged path advances a leg at a time across the boundary", () => {
  // The route is the one export whose value moves *inside* `step`, so it is the
  // one the page reads once a frame beside `map_revision()`. What is checked
  // here is the shape of that reading: three pushes answer 1, 2, 3, the first
  // becomes the standing order without a commit call, and the count falls as the
  // legs are consumed rather than all at once at the end.
  wasm.init(1);
  assert.equal(wasm.route_len(), 0, "a fresh level opened already holding a path");

  const legs = legsNearHero(frame(), 3);
  assert.equal(legs.length, 3, "the tile buffer offered nowhere to walk");
  legs.forEach(([x, y], i) => {
    const held = wasm.route_push(Math.round(x * 1000), Math.round(y * 1000));
    assert.equal(held, i + 1, `push ${i} answered a count it was not holding`);
  });
  assert.equal(wasm.route_len(), 3, "three waypoints did not make three legs");

  const queued = frame();
  assert.equal(queued[2], 4, "order_kind: the first waypoint did not become the Goto");
  assert.ok(Math.abs(queued[3] - legs[0][0]) < 0.01, "order_x is not the first waypoint");
  assert.ok(Math.abs(queued[4] - legs[0][1]) < 0.01, "order_y is not the first waypoint");

  // The nearest waypoint is under two units off, so a leg falls well inside this.
  wasm.step(240);
  const left = wasm.route_len();
  assert.ok(left < 3, "the queue never advanced: still holding 3 legs after 240 ticks");
  assert.ok(left >= 1, "the last leg was popped rather than left standing");

  // And dropping the queue is not a stop: the leg already ordered stays ordered.
  wasm.route_clear();
  assert.equal(wasm.route_len(), 0, "route_clear left a path behind");
  assert.equal(frame()[2], 4, "route_clear withdrew the standing order too");
  console.log(`route          3 legs -> ${left} after 240 ticks`);
});

test("a battle replays the way native recorded it", () => {
  // The cross-target claim, extended from a walk to a fight. If this number
  // differs from the one `cargo test -p web` pins, then two builds of the same
  // fixed-point code disagree about a fight -- which is the whole thing this
  // project claims cannot happen.
  wasm.init(1);
  wasm.spawn_monster(3, 255, 255);
  wasm.step(600);

  const measured = stateHash();
  assert.equal(wasm.tick(), 600, "step(600) did not simulate 600 ticks");
  assert.ok(measured === BATTLE_HASH, divergence("The battle state hash", BATTLE_HASH, measured));
  console.log(`battle hash    ${hex(measured)}  == native`);
});

test("an arrow flies the way native recorded it", () => {
  // The projectile path, across targets. Nothing above ever loosed a shot, so
  // until this test every square root and staged multiply in `resolve_shots`
  // was unclaimed territory -- and a fixed-point sim that is portable for
  // swordplay and not for archery is not a portable sim.
  wasm.init(1);
  assert.equal(wasm.set_hero_loadout(0, BOW_CODE), 1, "the hero would not take a bow");
  wasm.spawn_monster(2, 255, 255);
  wasm.step(1_200);

  const measured = stateHash();
  assert.ok(measured === BOW_HASH, divergence("The bow state hash", BOW_HASH, measured));
  console.log(`bow hash       ${hex(measured)}  == native`);

  // And the frame can carry what the sim produced, which is the other half of a
  // bow being usable at all: an arrow nobody can draw is an arrow nobody sees.
  wasm.init(1);
  wasm.set_hero_loadout(0, BOW_CODE);
  wasm.spawn_monster(2, 255, 255);
  let seen = 0;
  let events = 0;
  for (let i = 0; i < 1_200; i++) {
    wasm.step(1);
    const live = frame();
    const units = live[6];
    assert.equal(
      live.length,
      frameSpan(live),
      `frame_len() disagrees with its own counts: ${units} units,` +
        ` ${live[7]} shots, ${live[8]} events`,
    );
    // And the third section, read from the base the two counts before it put it
    // at -- which is the one thing about this layout that a wasm-only indexing
    // bug could get wrong while every hash still matched.
    const base = HEADER_LEN + UNIT_STRIDE * units + SHOT_STRIDE * live[7];
    for (let e = 0; e < live[8]; e++) {
      const row = live.slice(base + e * EVENT_STRIDE, base + (e + 1) * EVENT_STRIDE);
      assert.ok(row[0] >= 0 && row[0] < EVENT_KINDS, `event kind ${row[0]}`);
      assert.ok(
        row[1] >= -2 && row[1] <= ARENA[0] + 2 && row[2] >= -2 && row[2] <= ARENA[1] + 2,
        `an event happened outside the arena at (${row[1]}, ${row[2]})`,
      );
      // A slot, or `nobody`. The second half is not slack: a portal opening and
      // a descent are facts about the level and name no body at all, so this
      // used to read `< 64` and would now fail on the first way out to open.
      for (const [i, name] of [[4, "actor"], [5, "other"]]) {
        assert.ok(
          (row[i] >= 0 && row[i] < MAX_UNITS) || row[i] === NOBODY,
          `${name}_index ${row[i]} is neither a slot nor nobody`,
        );
      }
      events += 1;
    }
    seen = Math.max(seen, live[7]);
  }
  assert.ok(seen > 0, "twenty seconds of archery reached the frame as nothing");
  assert.ok(events > 0, "a whole archery duel produced no events at all");
  console.log(`event feed    ${events} rows over 1200 ticks`);
});

test("a death and a replacement replay the way native recorded them", () => {
  // Everything the other three miss: an entity dying, its slot going back on
  // the free list, and a new one coming out of that same slot at the next
  // generation. Index bookkeeping is where a 64-bit native usize and a 32-bit
  // wasm one would part company without anything else looking wrong.
  wasm.init(1);
  for (let i = 0; i < 3; i++) wasm.spawn_monster(2, 255, 255);
  wasm.step(1_800);

  assert.equal(heroRow(frame()), null, "three brutes no longer finish the warrior in 1800 ticks");
  assert.equal(wasm.swap_in_hero(1, 255, 255), 1, "nobody arrived");

  const live = frame();
  const hero = heroRow(live);
  assert.ok(hero, "the frame has no hero in it");
  assert.equal(hero[7], 1, "kind: Scout");
  assert.equal(hero[5], 8, "max_hp: 4 + vitality 4");
  assert.equal(live[2], 0, "order_kind: the replacement inherited an order");

  wasm.step(400);
  const measured = stateHash();
  assert.equal(wasm.tick(), 2_200, "the swap moved the clock");
  assert.ok(measured === SWAP_HASH, divergence("The swap state hash", SWAP_HASH, measured));
  console.log(`swap hash      ${hex(measured)}  == native`);
});
