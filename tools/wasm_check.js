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
// The shipped exact-law artifact is checked with the same complete suite by
// naming its build mode explicitly:
//
//     $env:ARPG_CARTESIAN_RECOIL='1'
//     node --test tools/wasm_check.js
//
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { test } = require("node:test");

const ROOT = path.join(__dirname, "..");
const WASM = path.join(ROOT, "target", "wasm32-unknown-unknown", "release", "web.wasm");
const recoilMode = process.env.ARPG_CARTESIAN_RECOIL;
if (recoilMode !== undefined && recoilMode !== "0" && recoilMode !== "1") {
  throw new Error("ARPG_CARTESIAN_RECOIL must be 0, 1 or unset");
}
const CARTESIAN_RECOIL = recoilMode === "1";
const BUILD = ["cargo", "build", "--release", "--target", "wasm32-unknown-unknown", "-p", "web"];
if (CARTESIAN_RECOIL) BUILD.push("--features", "cartesian-recoil");

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
const ROOM_HASH = 0xb8990e0dd2f543bfn;

// `init(1); spawn_monster(3); step(600)`: a whole fight, start to finish. Worth
// its own number because it reaches arithmetic the walk never does -- the spawn
// point comes out of `Rng::from_stream` and the committed sine table, and every
// approach measures a distance through `isqrt64`.
const BATTLE_HASH = 0xa68f4a40570b208an;

// `init(1); spawn_monster(2) x3; step(1800); swap_in_hero(1); step(400)`: a
// fight, a death, a replacement, and the fight the replacement walks into. The
// longest arc the page can drive, and the only one of these four that runs the
// sim across the death of an entity and the *reuse* of its slot -- the
// generational free list is exactly the kind of index bookkeeping that a 32-bit
// usize could quietly do differently.
// Re-recorded in `world-04`, and the only one of the five that moved there: a
// replacement now arrives at the spot the last one fell rather than in the
// clearest room on the floor, and this is the one script with a death in it.
const SWAP_HASH = 0xd2d38c5ad27c3f13n;

// `init(1); set_hero_loadout(0, BOW); spawn_monster(BRUTE); step(1200)`: the
// only one of these five that ever puts an arrow in the air, and the only
// reason it exists. The other four never touch the projectile path, which is a
// good deal of arithmetic none of them exercise -- `Vec2::length` on every tick
// of every flight, `segment_circle`'s i64-staged dot products, and the
// saturating multiply in `tangential_speed` at the release. Portable
// fixed-point is a claim about code that runs.
const BOW_HASH = 0xce5fa25b974e0701n;
// Moved by v2-14C: ArticulatedV1 hashing gained a global `cap_hits:u32` after
// the actuator loop, and this probe is unstepped, so the move is four zero
// bytes and nothing else. Moved again by v2-15, which appended one 61-byte
// anatomy row per allocated slot after it. Moved a third time by v2-20, from
// `0x6e61a92ec96ac3a6`, and *because* the probe is unstepped: the shield pose
// is derived at spawn and the digest carries its `half_width` and
// `half_height`, both of which that session shrank to a quarter.
// Exact recoil changes these published articulated values and no registered
// browser golden. Keeping the switch beside the two witnesses makes adding a
// third difference a source-visible contract change rather than a hidden skip.
// Both halves moved on 2026-08-16 when the submitted payload widened from 51 to
// 53 bytes for the release verb: `state_digest` writes every stored command's
// payload, so the fixture's one command contributes two more bytes even though
// both verbs are `Keep`. Default was `0xd1da6a40df0480b2`.
// The articulated-projectile session appended its authoritative store next:
// an allocated-slot count followed by every retained slot's lifecycle and
// physical fields. This unstepped fixture owns no projectile slots, but the
// zero count is still four new bytes. The previous pair was
// `0x28dca7e757a1ba3f` / `0x8d92c50f3a16ebce`.
const ARTICULATED_COMMAND_HASH = CARTESIAN_RECOIL
  ? 0x31282286fc157e8en
  : 0x7194bc636096a0ffn;
const COMBAT_GEOMETRY_HASH = 0x9d15344883cf6e9cn;
// Both moved on 2026-08-16 with the release verb. They are stored-command
// fixtures, and `exact_diagnostics.rs` writes the payload *width* as a `u16`
// alongside the payload bytes, so widening the payload reaches them twice over
// before their embedded state digests move for a third reason.
// Were `0x83051e8c6b4ef20f` and `0x83cd7bb2b73aeb9e`. The authoritative
// projectile store then appended its allocated-slot count and retained rows to
// every folded state digest, moving these from `0x88e6ea929b8d4305` and
// `0x8dc443385973a5c8` respectively.
const EXACT_TRAJECTORY_STATE_DIGEST = 0x4b07e93ccdc137ean;
const LIFTED_COULOMB_SOLVER_DIGEST = 0x4cbafe3e0f71e14fn;
// A four-byte envelope and a 53-byte payload. Written out rather than derived,
// because this file exists to disagree with Rust when Rust is wrong: the export
// is asserted against this number, so computing it the way the export computes
// it would assert nothing. It was 55 through payload layout 1.
const SUBMITTED_COMMAND_BYTES = 57;
// The same envelope over the embodied payload, and **no longer the same
// width**: the swing plane appended a `u16` per arm, taking the payload from 53
// to 57 and this buffer from 57 to 61 while `SUBMITTED_COMMAND_BYTES` above
// stayed exactly where it was. That is what the second constant was for -- three
// pinned digests are taken over the articulated width and have moved together
// twice, and none of them moved for this. Written out here for the reason above.
const EMBODIED_COMMAND_BYTES = 61;
// Layout 2 is the swing plane. It coincides with the articulated layout version
// over payloads four bytes apart, which is a coincidence and not a shared
// number: each moves when its own contract does.
const EMBODIED_COMMAND_LAYOUT_VERSION = 2;

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
// `web::MAX_UNITS`. Written down rather than exported. The reason given here was
// that the retired Canvas page mirrored it the same way and did not enforce it
// either; with that page gone the honest statement is narrower -- this is a
// hand-kept mirror of a Rust constant, caught only by the frame-layout test
// below noticing that a count no longer fits.
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
// address never moves, so this is belt and braces here -- but the client's
// worker runs the same rule at sixty frames a second, where it is the difference
// between a renderer and a silently empty canvas.
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
    // The v2-16 pose and combat-event publications, v2-ui-06's region capsules,
    // the arrow session's projectiles and `EMBODIED_STANCE_V1`'s stances:
    // **thirty-two** names, counting down to `articulated_stream_digest_hi` and
    // *not* counting `init_articulated`, the configured duel's seven or the
    // checkpoint's eight, each of which was inserted in the middle and given its
    // own note. **It read "twenty-one" until the stance section counted it**, and
    // it had been wrong since at least the projectile block landed -- which is
    // what a hand-maintained count in a comment does, and the reason the number
    // is worth keeping anyway is that it is the only thing here that notices a
    // publication whose six names somebody forgot to add.
    // Every one of them is called from a worker and from nowhere else --
    // v2-ui-07 gave them one, and the Canvas page that never called them has
    // since been retired -- so this list is the
    // *only* thing standing between a renamed export and a silent gap, and the
    // gap would be silent in the worst way: `pose_len()`, `region_len()` and
    // `combat_event_len()` read as `undefined`, `undefined >>> 0` is `0`, and a
    // stream that publishes nothing is exactly what an idle world publishes too.
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
    // The five swept capsules per body. `region_len()` is the one whose silence
    // would be loudest: the section carries no identity of its own and is read
    // against `pose_len()`, so a zero here is indistinguishable from "no bodies"
    // rather than from "this export is gone".
    "region_ptr",
    "region_len",
    "region_stride",
    "region_capacity",
    "regions_dropped",
    "region_layout_version",
    "articulated_projectile_ptr",
    "articulated_projectile_len",
    "articulated_projectile_stride",
    "articulated_projectile_capacity",
    "articulated_projectiles_dropped",
    "articulated_projectile_layout_version",
    // The stance section. Six names with no caller anywhere yet -- no export
    // installs an embodied world, so every world the browser can open publishes
    // a zero-length section here -- which makes this list the whole of what
    // stands between a rename and a session that finds the export missing when
    // it finally writes the reader. `embodied_stance_len()` is the one whose
    // silence would be loudest, and worse than `region_len()`'s: a zero is the
    // *correct* answer for every world this module can currently build, so
    // `undefined >>> 0` reads as the right number for the wrong reason and every
    // assertion below it passes vacuously forever.
    "embodied_stance_ptr",
    "embodied_stance_len",
    "embodied_stance_stride",
    "embodied_stance_capacity",
    "embodied_stances_dropped",
    "embodied_stance_layout_version",
    // `init`'s room under the articulated model. Its only callers today are the
    // two tests below and client/test/wasm-memory.test.mjs, which warms it
    // because it is the call that reserves 64 rows of contact vectors a Legacy
    // heap has never held -- so a rename here would leave that test warming
    // nothing and failing on growth it caused itself.
    "init_articulated",
    // The configured duel. Seven names the studio has written since v2-ui-07 and
    // nothing else ever has -- the Canvas page that never called them is
    // retired -- so this list is
    // again the only thing between a renamed export and a silent gap, and the
    // gap would be silent in the usual way: `arena_start()` reads as `undefined`,
    // `undefined >>> 0` is `0`, and a packed word of zero is "not started, no
    // reason", which is exactly what a refusal looks like.
    "arena_config_ptr",
    "arena_config_len",
    "arena_config_layout_version",
    "arena_start",
    "arena_fingerprint_lo",
    "arena_fingerprint_hi",
    "arena_policy",
    // The fetched network, v2-ui-08's eight. Same argument again and sharper
    // than most: `checkpoint_installed()` reading `undefined >>> 0` is `0`,
    // which is "nothing loaded" -- so a renamed export would turn every learned
    // assertion below into a test of the refusal path, passing green while
    // nothing in the module had ever run a network.
    "checkpoint_ptr",
    "checkpoint_capacity",
    "checkpoint_installed",
    "checkpoint_digest_ptr",
    "checkpoint_digest_len",
    "load_checkpoint",
    "learned_inference_digest_lo",
    "learned_inference_digest_hi",
    // The portable stream claim, read a half at a time. Nothing on the page
    // calls either; they exist for `native_and_wasm_pose_event_stream_digests_match`
    // below, which is precisely why they need a line here.
    "articulated_stream_digest_lo",
    "articulated_stream_digest_hi",
    "submitted_command_ptr",
    "submitted_command_len",
    "submitted_command_layout_version",
    "submit_articulated",
    // The embodied twin of the four names above. Nothing calls these anywhere
    // yet -- no export installs an embodied world, so the only answer the
    // browser can get out of `submit_embodied` today is the refusal -- which
    // makes this list the whole of what stands between a rename and a session
    // that finds the export missing when it finally writes the caller.
    "embodied_command_ptr",
    "embodied_command_len",
    "embodied_command_layout_version",
    "submit_embodied",
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
    "dungeon_object_ptr",
    "dungeon_object_len",
    "dungeon_object_stride",
    "dungeon_object_capacity",
    "dungeon_objects_dropped",
    "dungeon_object_layout_version",
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

test("the exact trajectory digest is feature-only, paired and cached", () => {
  const names = ["exact_trajectory_state_digest_lo", "exact_trajectory_state_digest_hi"];
  if (!CARTESIAN_RECOIL) {
    for (const name of names) {
      assert.equal(wasm[name], undefined, `default web.wasm unexpectedly exports ${name}()`);
    }
    return;
  }
  for (const name of names) {
    assert.equal(typeof wasm[name], "function", `exact web.wasm does not export ${name}()`);
  }

  wasm.init(4);
  wasm.step(12);
  const installed = [u32(wasm.tick()), stateHash(), u32(wasm.frame_len()), u32(wasm.pose_len()),
    u32(wasm.combat_event_len())];
  const pagesBefore = wasm.memory.buffer.byteLength / WASM_PAGE;
  const first = hash64(wasm.exact_trajectory_state_digest_lo(),
    wasm.exact_trajectory_state_digest_hi());
  const pagesAfterFirst = wasm.memory.buffer.byteLength / WASM_PAGE;
  const held = new Uint8Array(wasm.memory.buffer, u32(wasm.pose_ptr()), 4);
  const second = hash64(wasm.exact_trajectory_state_digest_lo(),
    wasm.exact_trajectory_state_digest_hi());
  const pagesAfterSecond = wasm.memory.buffer.byteLength / WASM_PAGE;
  assert.equal(first, EXACT_TRAJECTORY_STATE_DIGEST);
  assert.equal(second, first, "the cached exact trajectory digest changed on its second read");
  assert.equal(pagesAfterSecond, pagesAfterFirst,
    "the second exact trajectory digest read grew linear memory");
  assert.equal(held.byteLength, 4, "the second digest read detached an installed pose view");
  assert.deepEqual(
    [u32(wasm.tick()), stateHash(), u32(wasm.frame_len()), u32(wasm.pose_len()),
      u32(wasm.combat_event_len())],
    installed,
    "the exact trajectory diagnostic disturbed the installed sim",
  );
  console.log(`exact trajectory memory pages ${pagesBefore}/${pagesAfterFirst}/${pagesAfterSecond}`);
});

test("the lifted Coulomb solver digest is feature-only, paired and cached", () => {
  const names = ["lifted_coulomb_solver_digest_lo", "lifted_coulomb_solver_digest_hi"];
  if (!CARTESIAN_RECOIL) {
    for (const name of names) {
      assert.equal(wasm[name], undefined, `default web.wasm unexpectedly exports ${name}()`);
    }
    return;
  }
  for (const name of names) {
    assert.equal(typeof wasm[name], "function", `exact web.wasm does not export ${name}()`);
  }
  wasm.init(4); wasm.step(12);
  const installed = [u32(wasm.tick()), stateHash(), u32(wasm.frame_len()), u32(wasm.pose_len()),
    u32(wasm.combat_event_len())];
  const pagesBefore = wasm.memory.buffer.byteLength / WASM_PAGE;
  const first = hash64(wasm.lifted_coulomb_solver_digest_lo(),
    wasm.lifted_coulomb_solver_digest_hi());
  const pagesAfterFirst = wasm.memory.buffer.byteLength / WASM_PAGE;
  const held = new Uint8Array(wasm.memory.buffer, u32(wasm.pose_ptr()), 4);
  const second = hash64(wasm.lifted_coulomb_solver_digest_lo(),
    wasm.lifted_coulomb_solver_digest_hi());
  const pagesAfterSecond = wasm.memory.buffer.byteLength / WASM_PAGE;
  assert.equal(first, LIFTED_COULOMB_SOLVER_DIGEST);
  assert.equal(second, first, "the cached lifted solver digest changed on its second read");
  assert.equal(pagesAfterSecond, pagesAfterFirst,
    "the second lifted solver digest read grew linear memory");
  assert.equal(held.byteLength, 4, "the second lifted solver read detached an installed pose view");
  assert.deepEqual([u32(wasm.tick()), stateHash(), u32(wasm.frame_len()), u32(wasm.pose_len()),
    u32(wasm.combat_event_len())], installed,
    "the lifted solver diagnostic disturbed the installed sim");
  console.log(`lifted solver digest 0x${first.toString(16).padStart(16, "0")} memory pages ${pagesBefore}/${pagesAfterFirst}/${pagesAfterSecond}`);
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
  // 57 and layout 2 since the release verb landed: two bytes appended to a
  // payload that was already fully packed. Rewritten here rather than
  // re-recorded -- this file is the independent reconstruction of the same
  // fixture `crates/web/src/lib.rs` writes, and a mirror copied from the thing
  // it mirrors checks nothing.
  assert.equal(wasm.submitted_command_len(), SUBMITTED_COMMAND_BYTES);
  assert.equal(wasm.submitted_command_layout_version(), 2);
  const fixture = Uint8Array.from([
    0x02,0x00,0x01,0x00, 0x01,0x00,0x00,0x00, 0xfe,0xff,0xff,0xff,
    0x34,0x12,0x01, 0x44,0x33,0x22,0x11, 0x88,0x77,0x66,0x55,
    0x45,0x23, 0x00,0x40,0x00,0x00, 0x03,0x00,0x00,0x00,
    0x04,0x00,0x00,0x00, 0x56,0x34, 0x00,0xc0,0x00,0x00,
    0x05,0x00,0x00,0x00, 0x06,0x00,0x00,0x00, 0x02,0x01,0x01,0x00,
    0x00,0x01,
  ]);
  assert.equal(fixture.length, SUBMITTED_COMMAND_BYTES, "the fixture is not a whole command");
  new Uint8Array(wasm.memory.buffer, u32(wasm.submitted_command_ptr()),
                 SUBMITTED_COMMAND_BYTES).set(fixture);
  assert.equal(u32(wasm.submit_articulated(0, 0)), 1, "valid command was not stored verbatim");
  assert.equal(wasm.state_digest_domain(), 1);
  assert.equal(wasm.state_digest_schema(), 1);
  const measured = hash64(wasm.state_digest_lo(), wasm.state_digest_hi());
  assert.equal(measured, ARTICULATED_COMMAND_HASH, "articulated command digest differs from native");

  const malformed = fixture.slice();
  malformed[10 + 4] = 9; // intent tag at payload offset 10
  malformed.set([0x01, 0x00, 0x01, 0x00], 4); // also numerically out of range: syntax wins
  new Uint8Array(wasm.memory.buffer, u32(wasm.submitted_command_ptr()),
                 SUBMITTED_COMMAND_BYTES).set(malformed);
  assert.equal(u32(wasm.submit_articulated(0, 0)), 1 << 8, "mixed malformed/range input stored a fallback");
  assert.equal(hash64(wasm.state_digest_lo(), wasm.state_digest_hi()), measured, "NotStored mutated state");
  console.log(`articulated     ${hex(measured)}  == native command fixture`);
});

test("an articulated module refuses submit_embodied by name", () => {
  // There is no embodied world to reach from here -- no export installs one --
  // so the refusal is the whole of what this boundary can answer today, and it
  // is the half worth checking anyway: a control that accepted a request it
  // cannot act on would say nothing about it.
  wasm.init_articulated_test(1);
  assert.equal(wasm.embodied_command_len(), EMBODIED_COMMAND_BYTES);
  assert.equal(wasm.embodied_command_layout_version(), EMBODIED_COMMAND_LAYOUT_VERSION);
  assert.notEqual(u32(wasm.embodied_command_ptr()), u32(wasm.submitted_command_ptr()),
    "the embodied scratch is the articulated one under another name");
  // Layout 2 and kind 2 over the 53 payload bytes the fixture above uses **plus
  // four more**: the two grammars share a prefix and diverge after byte 52,
  // where the embodied one continues with a swing-plane `u16` per arm. The two
  // planes differ and neither is zero, so a boundary that truncated the buffer
  // back to the articulated width could not stage this by accident.
  const fixture = Uint8Array.from([
    0x02,0x00,0x02,0x00, 0x01,0x00,0x00,0x00, 0xfe,0xff,0xff,0xff,
    0x34,0x12,0x01, 0x44,0x33,0x22,0x11, 0x88,0x77,0x66,0x55,
    0x45,0x23, 0x00,0x40,0x00,0x00, 0x03,0x00,0x00,0x00,
    0x04,0x00,0x00,0x00, 0x56,0x34, 0x00,0xc0,0x00,0x00,
    0x05,0x00,0x00,0x00, 0x06,0x00,0x00,0x00, 0x02,0x01,0x01,0x00,
    0x00,0x01, 0x67,0x45, 0xab,0x89,
  ]);
  assert.equal(fixture.length, EMBODIED_COMMAND_BYTES, "the fixture is not a whole command");
  const scratch = () => new Uint8Array(wasm.memory.buffer, u32(wasm.embodied_command_ptr()),
                                       EMBODIED_COMMAND_BYTES);
  scratch().set(fixture);
  const before = hash64(wasm.state_digest_lo(), wasm.state_digest_hi());
  assert.equal(u32(wasm.submit_embodied(0, 0)), 2 << 8,
    "an articulated module accepted an embodied command");
  // And the model outranks the bytes: an intent tag no grammar has, at payload
  // offset 10. Without a model check ahead of the structural one this answers
  // `1` and names the payload for what is a model mismatch -- which is the only
  // input that can tell this boundary's guard from the world's own.
  const malformed = fixture.slice();
  malformed[4 + 10] = 9;
  scratch().set(malformed);
  assert.equal(u32(wasm.submit_embodied(0, 0)), 2 << 8, "wrong model lost precedence");
  assert.equal(hash64(wasm.state_digest_lo(), wasm.state_digest_hi()), before,
    "a refused embodied command mutated the world");
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

// --------------------------- the articulated pose/region/event/stance ABI

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
// **2048, and both the 256 the plan proposed and the 1024 that replaced it were
// measured and rejected.** The reference's mandatory `abi-high-water` corpus --
// 64 bodies as 32 Fighter/Brute pairs three halves of a unit apart, one
// submitted command each at tick zero, exactly one `step(8)` -- accumulated 446
// rows in that single batch, so at 256 the host published the canonical 256 and
// counted 190 dropped. The rule for a rejected capacity is the next power of two
// at least twice the measurement: 446 doubles to 892 and rounds up to 1024.
// v2-17 checkpoint B then took the same corpus to 556 rows -- the sim's contact
// projector stopped charging every trial for its own inverse-map drift, so more
// of each impulse survives the energy check -- and 556 doubles to 1,112. Nothing
// was dropped at 1024; the rule is headroom, not survival.
const MAX_COMBAT_EVENTS = 2048;
// docs/reference/articulated-abi.md, "Region rows". Eight words a volume --
// lower point, upper point, radius, present -- seven **swept volumes** a body,
// and the same 64 bodies the pose buffer holds. `present` is a published word
// and not something read off the geometry, because the head is a degenerate
// capsule whose endpoints coincide on every body on every tick.
//
// Seven and not five since the forearm collider: rows 0..5 are the five
// `BodyPart`s in their own order and rows 5 and 6 are the two forearms, absent
// on a body whose arms are one link. The version moved with the width, which is
// what a reader holding version 1 needs -- it would index row `n * 5`.
const REGION_LAYOUT_VERSION = 2;
const REGION_STRIDE = 8;
const REGIONS_PER_BODY = 7;
const MAX_REGIONS = MAX_POSES * REGIONS_PER_BODY;
const ARTICULATED_PROJECTILE_LAYOUT_VERSION = 1;
const ARTICULATED_PROJECTILE_STRIDE = 12;
const MAX_ARTICULATED_PROJECTILES = 32;
// The stance section: six words a body -- a full identity, the hip bearing, the
// pelvis fraction and the signed twist, plus the ticks left in a forced step --
// for every live body under `CombatModel::Embodied`, and none at all under the
// other two. The capacity is the pose capacity because a body with legs is a
// body that also publishes a pose.
const EMBODIED_STANCE_LAYOUT_VERSION = 1;
const EMBODIED_STANCE_STRIDE = 6;
const MAX_EMBODIED_STANCE = MAX_POSES;
const DUNGEON_OBJECT_LAYOUT_VERSION = 1;
const DUNGEON_OBJECT_STRIDE = 12;
const MAX_DUNGEON_OBJECTS = 512;

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
// The region columns, from the same document's region table.
const REGION_LOWER_X = 0;
const REGION_UPPER_X = 3;
const REGION_RADIUS = 6;
const REGION_PRESENT = 7;
// `AnatomyRegion::Head`, the degenerate one. Its two endpoints coincide and its
// extent is its radius alone, which is why the eighth word exists.
const REGION_HEAD = 0;
// How many of the seven swept volumes a body is are *anatomy*. The pose row's
// two fraction blocks and its severed mask are this wide; the region section is
// `REGIONS_PER_BODY` wide, and the two stopped being one number when an arm
// became two capsules. `POSE_BODY_PART_COUNT` is the generated ABI's name for it.
const BODY_PART_COUNT = 5;
// Idle 0, Chasing 1, Braced 2, Contact 3, Recoiling 4, Severed 5. Append-only,
// so this only ever grows and a code past it is a module animating something
// this file has never been told about.
const ANIMATION_HINTS = 6;
// Hold 0, Attack 1, Flee 2 -- the wire ordinals the 55-byte command payload
// froze, reused rather than renumbered.
const INTENTS = 3;
// Five `BodyPart` bits and nothing above them.
const SEVERED_MASK_BITS = 5;

// FNV-1a-64 over the published pose, combat-event, region, projectile and stance words of a scripted
// articulated fight, prefixed ASCII `ARPG-STREAM-V1`. The script is
// `Scenario::articulated_duel()` at seed 1 with the fighter moved to (9,6) and
// the brute to (7,6), one articulated command submitted to each on tick zero and
// none after, twenty ticks and one publication each -- ticks 0, 1, 2 and 4
// resolve nothing, ticks 3 and 5 resolve two rows and every tick from 6 resolves
// one, so both an empty tick and sixteen ticks of event rows are inside this
// number.
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
// its own run through the same five buffer writers `publish` calls, and the two agreeing
// means wasm32 encodes what MSVC x86-64 encodes. What a single number cannot
// catch is an encoder wrong the same way on both targets, and the row grammar
// checked beside it is the part of the reference this file *can* rebuild.
//
// Moved twice, both by v2-17 checkpoint B, and neither move changed a layout.
// First from `0x4372a94d89fc9155`: the sim's contact projector stopped
// re-deriving an unmoved hand through an inexact joint inverse, so more of every
// contact's proposed impulse now survives the energy check, and tick 5 gained a
// second row. Then from `0x27b2aa50bb4e7a67`: a held segment's point velocity is
// now sampled at the blade's centre of mass instead of in the hand. That second
// move leaves the row shape alone -- the same ticks carry the same counts -- so
// what moved is values, which is what a simulation-only move looks like from
// this side of the wall.
//
// Moved a third time by v2-20, from `0x6f879c13430adfc1`, when the shield's
// `half_width` and `half_height` both went to a quarter. Two routes into the
// same number and both were predicted before the run: the plate's extents are
// published words in the pose row, so tick zero's bytes move outright, and a
// smaller plate then changes what the twenty-tick clinch resolves. The row
// shape is again untouched.
//
// **Moved a fourth time by v2-ui-06, from `0x54c0762b3dfb7a05`, and this one is
// the layout change the three above were not.** A third section went on the
// wire -- the five swept region capsules per body -- and the digest is every
// published word of every publication, so it moved by construction and said so
// in writing first. It moved by *extension*: the region length, drop count and
// words are appended after the event words, so the pose-and-event prefix of
// every one of the twenty ticks is byte-identical to what v2-16 pinned, and the
// per-tick row counts above are unchanged with ten region rows added to each.
// Nothing in the sim moved and no fight golden moved with it, which is what a
// layout move looks like from this side of the wall and the opposite of the
// three before it.
//
// **Moved again by the articulated-arrow session.** The new fourth publication
// appends projectile length, drop count and row words after the region section.
// This sword-and-shield fixture publishes no projectile rows, so the appended
// words are two zeroes per tick and are still part of the contract. Mechanics
// landed beside it changed the event prefix as well: the default build now has
// one row on ticks 3 and 5, while exact has one on tick 3 only. Native MSVC
// measured the values below before either owner was edited.
//
// **Moved a sixth time by `EMBODIED_STANCE_V1`, from `0x3b0d5c93d5560dd9` and
// exact `0x2fa1256f412b2e32`, and this one is an extension and nothing else.**
// A fifth publication went on the wire -- one row per live embodied body -- and
// the digest is every published word of every publication, so it reaches this
// number whether or not the fixture has a row. It has none: the script is
// `Scenario::articulated_duel` and only `CombatModel::Embodied` has legs, so the
// appended tail is a zero length and a zero drop count on each of the twenty
// ticks, and their presence is the whole of the move. Every per-tick count above
// is unchanged.
//
// **Moved again by the forearm collider, from 0x686ecf8a2f5dd479, and this one
// is a layout move.** The region section went from five rows a body to seven, so
// its words and everything after them in each tick's stream moved;
// `REGION_LAYOUT_VERSION` moved 1 -> 2 alongside, which is what separates this
// from the two values-only moves in the pin's registry row. The fixture's fight
// did not change, and `the_region_section_is_the_whole_of_the_forearm_digest_move`
// in crates/web measures that rather than asserting it: suppress the region
// section and the digest is 0xc6482a30f399d2cb, the same suppression measured on
// b453ca1, so every pose, event, projectile and stance word of all twenty ticks
// is byte-identical. That test supersedes
// `the_stance_section_extends_the_digest_without_disturbing_its_prefix`, whose
// constant was a stream with a five-row region section and can no longer be
// computed. Native MSVC measured both values below before either owner was
// edited, and a fresh wasm artifact then answered both.
const ARTICULATED_STREAM_DIGEST = CARTESIAN_RECOIL
  ? 0x9e9442671b790fb2n
  : 0x2a34c9104bdf18b9n;

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

// The live region rows, likewise. Five to a body and in the pose rows' order,
// so `regionRows()[body * REGIONS_PER_BODY + part]` is the capsule the contact
// phase swept for that region of that body.
function regionRows() {
  const rows = u32(wasm.region_len());
  const words = new Uint32Array(
    wasm.memory.buffer,
    u32(wasm.region_ptr()),
    rows * REGION_STRIDE,
  );
  return Array.from({ length: rows }, (_, row) =>
    Array.from(words.slice(row * REGION_STRIDE, (row + 1) * REGION_STRIDE)));
}

function articulatedProjectileRows() {
  const rows = u32(wasm.articulated_projectile_len());
  const words = new Uint32Array(
    wasm.memory.buffer,
    u32(wasm.articulated_projectile_ptr()),
    rows * ARTICULATED_PROJECTILE_STRIDE,
  );
  return Array.from({ length: rows }, (_, row) =>
    Array.from(words.slice(
      row * ARTICULATED_PROJECTILE_STRIDE, (row + 1) * ARTICULATED_PROJECTILE_STRIDE,
    )));
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
    "combat_event_layout_version", "region_ptr", "region_len", "region_stride",
    "region_capacity", "regions_dropped", "region_layout_version",
    "articulated_projectile_ptr", "articulated_projectile_len",
    "articulated_projectile_stride", "articulated_projectile_capacity",
    "articulated_projectiles_dropped", "articulated_projectile_layout_version",
    "embodied_stance_ptr", "embodied_stance_len", "embodied_stance_stride",
    "embodied_stance_capacity", "embodied_stances_dropped",
    "embodied_stance_layout_version",
    "init_articulated",
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
  assert.equal(u32(wasm.region_layout_version()), REGION_LAYOUT_VERSION, "REGION_LAYOUT_VERSION");
  assert.equal(u32(wasm.region_stride()), REGION_STRIDE, "REGION_STRIDE");
  assert.equal(u32(wasm.region_capacity()), MAX_REGIONS, "MAX_REGIONS");
  assert.equal(
    u32(wasm.articulated_projectile_layout_version()),
    ARTICULATED_PROJECTILE_LAYOUT_VERSION,
    "ARTICULATED_PROJECTILE_LAYOUT_VERSION",
  );
  assert.equal(
    u32(wasm.articulated_projectile_stride()),
    ARTICULATED_PROJECTILE_STRIDE,
    "ARTICULATED_PROJECTILE_STRIDE",
  );
  assert.equal(
    u32(wasm.articulated_projectile_capacity()),
    MAX_ARTICULATED_PROJECTILES,
    "MAX_ARTICULATED_PROJECTILES",
  );
  assert.equal(
    u32(wasm.embodied_stance_layout_version()),
    EMBODIED_STANCE_LAYOUT_VERSION,
    "EMBODIED_STANCE_LAYOUT_VERSION",
  );
  assert.equal(u32(wasm.embodied_stance_stride()), EMBODIED_STANCE_STRIDE, "EMBODIED_STANCE_STRIDE");
  assert.equal(u32(wasm.embodied_stance_capacity()), MAX_EMBODIED_STANCE, "MAX_EMBODIED_STANCE");

  // A Legacy world publishes none of the four streams, and that is the half of the
  // drop-field assertion that is not vacuous: zero rows *and* zero dropped is a
  // claim that all four buffers were cleared rather than left holding the last
  // articulated run's rows. A pose row is ground truth about an identity, and
  // `publish` zeroes the buffers as well as the lengths for exactly that reason.
  wasm.init(1);
  wasm.step(60);
  assert.equal(u32(wasm.pose_len()), 0, "a Legacy world published a pose row");
  assert.equal(u32(wasm.poses_dropped()), 0, "a Legacy world dropped a pose row");
  assert.equal(u32(wasm.combat_event_len()), 0, "a Legacy world published a contact row");
  assert.equal(u32(wasm.combat_events_dropped()), 0, "a Legacy world dropped a contact row");
  assert.equal(u32(wasm.region_len()), 0, "a Legacy world published a region row");
  assert.equal(u32(wasm.regions_dropped()), 0, "a Legacy world dropped a region row");
  assert.equal(u32(wasm.articulated_projectile_len()), 0,
    "a Legacy world published an articulated projectile row");
  assert.equal(u32(wasm.articulated_projectiles_dropped()), 0,
    "a Legacy world dropped an articulated projectile row");
  assert.equal(u32(wasm.embodied_stance_len()), 0, "a Legacy world published a stance row");
  assert.equal(u32(wasm.embodied_stances_dropped()), 0, "a Legacy world dropped a stance row");

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
  // The region section carries no identity of its own, so it is read against
  // `pose_len` and this is the whole of that contract: `REGIONS_PER_BODY` rows a
  // body, in the same order, every time. A reader that checked nothing else could
  // still not land a capsule on the wrong body.
  assert.equal(
    u32(wasm.region_len()),
    rows * REGIONS_PER_BODY,
    "the region section does not cover every published pose",
  );
  assert.equal(u32(wasm.regions_dropped()), 0, "a published body carried no capsules");
  assert.equal(u32(wasm.articulated_projectiles_dropped()), 0,
    "a fresh articulated world dropped a projectile row");
  // A zero-length stance section rather than an absent one, which is the whole
  // of what this publication says on an articulated world. The length is zero
  // and the drop count is zero: nothing was published *and* nothing was turned
  // away, so a reader is being told that this world has no legs rather than that
  // it ran out of room for them.
  assert.equal(u32(wasm.embodied_stance_len()), 0,
    "an articulated world published a stance row");
  assert.equal(u32(wasm.embodied_stances_dropped()), 0,
    "an articulated world dropped a stance row");

  // Fixed arrays whose addresses never move, which is the one property the
  // worker's typed arrays depend on for the life of the module. Checked against
  // the *capacity* rather than the live length: the arrays are reserved whole at
  // construction, so a module that placed 292,352 bytes of statics past the end
  // of its own memory would be caught here rather than on the first busy tick.
  const [poseAt, eventAt, regionAt, projectileAt, stanceAt] = [
    u32(wasm.pose_ptr()), u32(wasm.combat_event_ptr()), u32(wasm.region_ptr()),
    u32(wasm.articulated_projectile_ptr()), u32(wasm.embodied_stance_ptr()),
  ];
  assert.ok(poseAt > 0 && eventAt > 0 && regionAt > 0 && projectileAt > 0 && stanceAt > 0,
    "a published buffer is at address zero");
  assert.equal(new Set([poseAt, eventAt, regionAt, projectileAt, stanceAt]).size, 5,
    "two buffers share an address");
  assert.equal(poseAt % 4, 0, "the pose buffer is not u32-aligned");
  assert.equal(eventAt % 4, 0, "the combat-event buffer is not u32-aligned");
  assert.equal(regionAt % 4, 0, "the region buffer is not u32-aligned");
  assert.equal(projectileAt % 4, 0, "the projectile buffer is not u32-aligned");
  assert.equal(stanceAt % 4, 0, "the stance buffer is not u32-aligned");
  const memoryBytes = wasm.memory.buffer.byteLength;
  for (const [name, at, bytes] of [
    ["POSES", poseAt, MAX_POSES * POSE_STRIDE * 4],
    ["COMBAT_EVENTS", eventAt, MAX_COMBAT_EVENTS * COMBAT_EVENT_STRIDE * 4],
    ["REGIONS", regionAt, MAX_REGIONS * REGION_STRIDE * 4],
    ["ARTICULATED_PROJECTILES", projectileAt,
      MAX_ARTICULATED_PROJECTILES * ARTICULATED_PROJECTILE_STRIDE * 4],
    ["EMBODIED_STANCES", stanceAt, MAX_EMBODIED_STANCE * EMBODIED_STANCE_STRIDE * 4],
  ]) {
    assert.ok(at + bytes <= memoryBytes, `${name} runs past the end of linear memory`);
  }
  wasm.step(8);
  assert.deepEqual(
    [u32(wasm.pose_ptr()), u32(wasm.combat_event_ptr()), u32(wasm.region_ptr()),
      u32(wasm.articulated_projectile_ptr()), u32(wasm.embodied_stance_ptr())],
    [poseAt, eventAt, regionAt, projectileAt, stanceAt],
    "a published buffer moved across a step",
  );
  assert.equal(
    u32(wasm.region_len()),
    u32(wasm.pose_len()) * REGIONS_PER_BODY,
    "a step left the region section short of its poses",
  );
  console.log(
    `articulated abi ${rows} pose rows, ` +
      `${MAX_POSES}x${POSE_STRIDE} + ${MAX_COMBAT_EVENTS}x${COMBAT_EVENT_STRIDE}` +
      ` + ${MAX_REGIONS}x${REGION_STRIDE}` +
      ` + ${MAX_ARTICULATED_PROJECTILES}x${ARTICULATED_PROJECTILE_STRIDE}` +
      ` + ${MAX_EMBODIED_STANCE}x${EMBODIED_STANCE_STRIDE} words reserved`,
  );
});

test("native_and_wasm_pose_event_stream_digests_match", () => {
  for (const name of ["articulated_stream_digest_lo", "articulated_stream_digest_hi"]) {
    assert.equal(typeof wasm[name], "function", `web.wasm does not export ${name}()`);
  }
  const measured = hash64(wasm.articulated_stream_digest_lo(), wasm.articulated_stream_digest_hi());
  assert.ok(
    measured === ARTICULATED_STREAM_DIGEST,
    divergence("The articulated publication stream digest", ARTICULATED_STREAM_DIGEST, measured),
  );

  // Cached on first touch, and that is a memory property rather than a
  // performance one: this is the only allocating call in the publication set, so
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

  // ---- and the region grammar, on the same terms.
  //
  // The digest carries the region words now, and a number agreeing on both
  // targets says nothing about whether those words are the rows the reference
  // describes. Two facts the document states in prose and the digest cannot:
  // the section is seven rows a body in pose order, and the head is a degenerate
  // capsule that is nonetheless **present** -- which is the case a reader
  // inferring absence from geometry would delete from every body in every
  // fight, and the reason the eighth word is published at all.
  //
  // **The severed mask covers the first five rows and no more.** It is one bit
  // per `BodyPart` and the section is one row per swept volume; rows 5 and 6 are
  // the two forearms, which this fixture -- an articulated duel, whose arms are
  // one link -- publishes absent on every body. Comparing them against bits 5
  // and 6 of a five-bit mask would demand that they be present.
  const regions = regionRows();
  assert.equal(regions.length, rows.length * REGIONS_PER_BODY, "the region section is not per pose");
  let degenerate = 0;
  for (let body = 0; body < rows.length; body++) {
    const severed = rows[body][POSE_SEVERED_MASK];
    for (let part = 0; part < BODY_PART_COUNT; part++) {
      const region = regions[body * REGIONS_PER_BODY + part];
      assert.equal(
        region[REGION_PRESENT],
        severed & (1 << part) ? 0 : 1,
        `body ${body} region ${part}: presence disagrees with the pose row's severed mask`,
      );
      assert.ok(region[REGION_PRESENT] <= 1, "presence is not zero or one");
    }
    for (let part = BODY_PART_COUNT; part < REGIONS_PER_BODY; part++) {
      assert.equal(
        regions[body * REGIONS_PER_BODY + part][REGION_PRESENT],
        0,
        `body ${body} volume ${part}: a single-link arm published a forearm`,
      );
    }
    const head = regions[body * REGIONS_PER_BODY + REGION_HEAD];
    assert.deepEqual(
      head.slice(REGION_LOWER_X, REGION_LOWER_X + 3),
      head.slice(REGION_UPPER_X, REGION_UPPER_X + 3),
      `body ${body}: the head is not the degenerate capsule the reference describes`,
    );
    assert.equal(head[REGION_PRESENT], 1, `body ${body}: a coincident head published as absent`);
    assert.notEqual(head[REGION_RADIUS], 0, `body ${body}: the head has no extent at all`);
    degenerate++;
  }
  assert.ok(degenerate > 1, "fewer than two bodies published a head");
  console.log(
    `pose grammar   ${rows.length} rows, hero mask ${rows[0][POSE_EQUIPMENT_MASK]}, ` +
      `${regions.length} region rows, ${degenerate} degenerate heads present`,
  );
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
  wasm.set_input(0, 0, 0, 0, 0, 0, 0);
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
  wasm.set_input(-1000, 0, 0, 0, 0, 0, 0);
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
  wasm.set_input(0, 0, 16_384, 0, 0, 0, 0);
  wasm.step(120);
  const unit = frame().slice(HEADER_LEN);
  assert.ok(Math.abs(unit[11] - 16_384) < 2_000, `sword ended at ${unit[11]}, not north`);
  assert.equal(unit[19], 0, "a chambered blade was not in guard");

  // The attack button, and the property the whole swing model exists for: the
  // cut announces itself before it goes live, and the frame says so.
  wasm.set_input(0, 0, 16_384, 0, 0, 1, 0);
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

function dungeonObjects() {
  const count = u32(wasm.dungeon_object_len());
  const stride = u32(wasm.dungeon_object_stride());
  const words = new Uint32Array(
    wasm.memory.buffer, u32(wasm.dungeon_object_ptr()), count * stride,
  ).slice();
  return Array.from({ length: count }, (_, row) =>
    Array.from(words.slice(row * stride, (row + 1) * stride)));
}

test("dungeon_object_v1_publishes_stable_ordered_physical_rows", () => {
  for (const name of [
    "dungeon_object_ptr", "dungeon_object_len", "dungeon_object_stride",
    "dungeon_object_capacity", "dungeon_objects_dropped", "dungeon_object_layout_version",
  ]) assert.equal(typeof wasm[name], "function", `web.wasm does not export ${name}()`);
  assert.equal(u32(wasm.dungeon_object_layout_version()), DUNGEON_OBJECT_LAYOUT_VERSION);
  assert.equal(u32(wasm.dungeon_object_stride()), DUNGEON_OBJECT_STRIDE);
  assert.equal(u32(wasm.dungeon_object_capacity()), MAX_DUNGEON_OBJECTS);
  wasm.init(1);
  const rows = dungeonObjects();
  assert.ok(rows.length > 0, "a generated floor published no physical object rows");
  assert.equal(u32(wasm.dungeon_objects_dropped()), 0);
  const kinds = rows.map((row) => row[0]);
  const firstTorch = kinds.indexOf(2);
  const firstProp = kinds.findIndex((kind) => kind >= 3);
  assert.ok(firstTorch > 0 && firstProp > firstTorch, "doors, torches and props are not ordered");
  assert.ok(rows.slice(0, firstTorch).every((row) => row[1] >>> 28 === 1));
  assert.ok(rows.slice(firstTorch, firstProp).every((row) => row[1] >>> 28 === 2));
  assert.ok(rows.slice(firstProp).every((row) => row[1] >>> 28 === 3));
  assert.ok(rows.every((row) => row.length === 12));
});

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
  wasm.set_input(-1000, 0, 0, 0, 0, 0, 0);
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

// ------------------------------------------------------------------ the arena
//
// v2-ui-05's configured duel: 120 bytes written from here, one policy per side,
// and a fight that runs inside the module instead of being replayed into it.
//
// **No pinned number, deliberately.** Every other cross-target claim in this
// file is a hash recorded natively and recomputed here, and this one is not,
// because the number it would pin is a scripted articulated fight's state hash
// -- which is `ARTICULATED_HASH`, planned by v2-17, deliberately absent, and
// which no session before it may create. What is checked instead is everything
// that does not require inventing it: the layout, the refusals by name, that the
// module runs the fight rather than standing still, and that the same bytes
// produce the same fight twice while a different pairing produces a different
// one. The native-versus-lab equality lives in `crates/web`'s
// `a_scripted_arena_fight_in_wasm_matches_the_same_fight_in_lab`.

// `crates/web`'s ARENA_* offsets, mirrored. The module asserts its own
// arithmetic with `const _`; these are what a page computes from the reference.
const ARENA_CONFIG_BYTES = 120;
// `2` since combat-arms-01 claimed the hand block's byte 1 for the two-handed
// grip; layout `1` promised that byte was zero.
const ARENA_CONFIG_LAYOUT_VERSION = 2;
const ARENA_HEADER_BYTES = 8;
const ARENA_FIGHTER_BYTES = 56;
const ARENA_HAND_BYTES = 22;
const ARENA_HAND_EMPTY = 255;
const ARENA_WHOLE_CONFIG = 255;
// Reason codes, from crates/web/src/lib.rs.
const ARENA_UNKNOWN_LAYOUT = 1;
const ARENA_WRONG_FIGHTER_COUNT = 2;
const ARENA_NONCANONICAL = 3;
const ARENA_UNKNOWN_ANATOMY = 4;
const ARENA_NO_EQUIPMENT = 24;
// v2-ui-08's, and it replaced `ARENA_POLICY_UNAVAILABLE` (7) as the answer a
// `learned` fighter gets. That code still exists and is now unreachable: every
// `ArticulatedPolicyKind` has a constructor on this side of the wall, so the
// only thing a learned fighter can be missing is its weights, and "fetch one"
// is a different instruction from "rebuild the module".
const ARENA_NO_CHECKPOINT = 26;
// `sim::ActionKind::code`.
const SWORD = 2;
const CLUB = 3;
const SHIELD = 4;
// `policy::ArticulatedPolicyKind::code`.
const NEUTRAL = 0;
const COMPOSED = 1;
const WINDMILL = 2;
const LEARNED = 4;
// `web::ARENA_NO_POLICY` and `web::POLICY_KIND_UNKNOWN`, which are the same
// sentinel for two different registries: `0` is a real answer in both.
const NO_POLICY = 0xffffffff;

// 16.16, exactly as every dimension in the buffer is.
const fx = (value) => Math.round(value * 65536);

// Round numbers well inside the validation envelope rather than the shipped
// fixture's, which would be a mirror of `crates/sim`'s spec table in JavaScript
// and would rot the first time somebody edited a row. Nothing below compares a
// number against native, so the only property these need is legality.
const SWORD_ITEM = { item: SWORD, mass: fx(1.25), balance: fx(0.5), dims: [fx(1), fx(0.04), 0] };
const CLUB_ITEM = { item: CLUB, mass: fx(2), balance: fx(0.5), dims: [fx(1.25), fx(0.05), 0] };
const SHIELD_ITEM = {
  item: SHIELD, mass: fx(0.5), balance: fx(0.5), dims: [fx(0.25), fx(0.5), fx(0.05)],
};
const EMPTY_HAND = { item: ARENA_HAND_EMPTY, mass: 0, balance: 0, dims: [0, 0, 0] };

const shippedArena = () => ({
  maxTicks: 300,
  fighters: [
    { anatomy: 0, policy: COMPOSED, spawn: [fx(7), fx(6)], hands: [SHIELD_ITEM, SWORD_ITEM] },
    { anatomy: 1, policy: WINDMILL, spawn: [fx(17), fx(10)], hands: [EMPTY_HAND, CLUB_ITEM] },
  ],
});

// The 120 bytes, assembled here and copied in through a fresh view that is
// dropped before `arena_start` is called -- the discipline every buffer in this
// file keeps, and the one the reference states for this one.
function arenaBytes(config) {
  const bytes = new Uint8Array(ARENA_CONFIG_BYTES);
  const words = new DataView(bytes.buffer);
  words.setUint16(0, ARENA_CONFIG_LAYOUT_VERSION, true);
  bytes[2] = config.fighters.length;
  words.setUint32(4, config.maxTicks, true);
  config.fighters.forEach((fighter, index) => {
    const base = ARENA_HEADER_BYTES + index * ARENA_FIGHTER_BYTES;
    bytes[base] = fighter.anatomy;
    bytes[base + 1] = fighter.policy;
    words.setInt32(base + 4, fighter.spawn[0], true);
    words.setInt32(base + 8, fighter.spawn[1], true);
    fighter.hands.forEach((hand, slot) => {
      const at = base + 12 + slot * ARENA_HAND_BYTES;
      bytes[at] = hand.item;
      words.setInt32(at + 2, hand.mass, true);
      words.setInt32(at + 6, hand.balance, true);
      hand.dims.forEach((value, word) => words.setInt32(at + 10 + word * 4, value, true));
    });
    // Byte 1 of the right hand block: the two-handed grip marker.
    if (fighter.twoHanded) bytes[base + 12 + ARENA_HAND_BYTES + 1] = 1;
  });
  return bytes;
}

const stageArena = (bytes) =>
  new Uint8Array(wasm.memory.buffer, u32(wasm.arena_config_ptr()), ARENA_CONFIG_BYTES).set(bytes);

const arenaResult = (packed) => ({
  outcome: u32(packed) & 0xff,
  reason: (u32(packed) >>> 8) & 0xff,
  fighter: (u32(packed) >>> 16) & 0xff,
  slot: (u32(packed) >>> 24) & 0xff,
});

const arenaFingerprint = () =>
  hash64(wasm.arena_fingerprint_lo(), wasm.arena_fingerprint_hi());

test("the configured arena words match their native exact twin", () => {
  // This is the configuration the tests below actually stage, not
  // `DuelConfigV1::shipped()`. The exact native twin in `crates/web` asserts
  // the same four rows before it pins either fight's stopping tick.
  const bytes = arenaBytes(shippedArena());
  const words = new DataView(bytes.buffer);
  const handWords = Array.from({ length: 4 }, (_, row) => {
    const at = ARENA_HEADER_BYTES + Math.floor(row / 2) * ARENA_FIGHTER_BYTES
      + 12 + (row % 2) * ARENA_HAND_BYTES;
    return [
      bytes[at], words.getInt32(at + 2, true), words.getInt32(at + 6, true),
      words.getInt32(at + 10, true), words.getInt32(at + 14, true),
      words.getInt32(at + 18, true),
    ];
  });
  assert.deepEqual(handWords, [
    [SHIELD, 32768, 32768, 16384, 32768, 3277],
    [SWORD, 81920, 32768, 65536, 2621, 0],
    [ARENA_HAND_EMPTY, 0, 0, 0, 0, 0],
    [CLUB, 131072, 32768, 81920, 3277, 0],
  ]);
});

test("a configured duel runs inside the module and refuses by name", () => {
  // `typeof` first, before a value is read: `undefined >>> 0` is `0`, and a
  // packed word of zero decodes as "not started, no reason, whole config",
  // which is indistinguishable from a refusal this test would then assert.
  for (const name of [
    "arena_config_ptr", "arena_config_len", "arena_config_layout_version",
    "arena_start", "arena_fingerprint_lo", "arena_fingerprint_hi", "arena_policy",
  ]) {
    assert.equal(typeof wasm[name], "function", `web.wasm does not export ${name}()`);
  }
  assert.equal(u32(wasm.arena_config_len()), ARENA_CONFIG_BYTES, "arena_config_len");
  assert.equal(u32(wasm.arena_config_layout_version()), ARENA_CONFIG_LAYOUT_VERSION,
    "arena_config_layout_version");
  assert.ok(u32(wasm.arena_config_ptr()) > 0, "the arena buffer is at address zero");

  // A legacy world knows nothing about any of this, which is the half of the
  // read-back that is not vacuous.
  wasm.init(1);
  assert.equal(u32(wasm.arena_policy(0)), NO_POLICY, "a legacy world named an articulated policy");
  assert.equal(arenaFingerprint(), 0n, "a legacy world named a configuration");

  const config = shippedArena();
  stageArena(arenaBytes(config));
  assert.deepEqual(
    arenaResult(wasm.arena_start(3)),
    { outcome: 1, reason: 0, fighter: ARENA_WHOLE_CONFIG, slot: ARENA_WHOLE_CONFIG },
    "the module refused a legal configuration",
  );
  assert.equal(u32(wasm.arena_policy(0)), COMPOSED);
  assert.equal(u32(wasm.arena_policy(1)), WINDMILL);
  // The legacy registry says it does not know rather than naming a `PolicyKind`
  // nothing in an arena consults.
  assert.equal(u32(wasm.policy_kind(0)), NO_POLICY, "an arena answered a legacy policy code");
  assert.equal(u32(wasm.pose_len()), 2, "an arena publishes one pose row per fighter");
  const fingerprint = arenaFingerprint();
  assert.notEqual(fingerprint, 0n, "the installed configuration has no fingerprint");

  // One call for the whole fight, which is what a recorder does. The arena stops
  // itself -- on the configuration's tick limit, or earlier on a decision -- so
  // the overshoot has to be inert either way.
  //
  // **The two builds stop for different reasons and that is the point.** The
  // default reaches the configured limit; exact decides at 278. The former
  // exact expectation of 164 came from running `DuelConfigV1::shipped()`
  // natively, whose weapon dimensions are not the round legal values above.
  // `exact_wasm_check_fights_match_the_same_native_configuration` now asserts
  // these raw words and 278 together. A `<= maxTicks` bound would defend none
  // of the configuration identity, the early decision, or the limit clamp.
  const STOPS_AT = CARTESIAN_RECOIL ? 278 : config.maxTicks;
  wasm.step(3_600);
  assert.equal(u32(wasm.tick()), STOPS_AT, "the arena did not stop where it should");
  assert.ok(u32(wasm.combat_event_len()) > 0, "the whole fight resolved no contact");
  const fought = stateHash();

  // The same bytes twice is the same fight, and a different pairing is not.
  // Together these say the policies are consulted at all and that each side has
  // its own -- the thing `policy::run_articulated` cannot express.
  stageArena(arenaBytes(config));
  assert.equal(arenaResult(wasm.arena_start(3)).outcome, 1);
  wasm.step(3_600);
  assert.equal(stateHash(), fought, "the same configuration and seed fought differently");
  assert.equal(arenaFingerprint(), fingerprint, "the fingerprint is not a function of the config");

  const swapped = shippedArena();
  swapped.fighters[0].policy = NEUTRAL;
  stageArena(arenaBytes(swapped));
  assert.equal(arenaResult(wasm.arena_start(3)).outcome, 1);
  wasm.step(3_600);
  assert.notEqual(stateHash(), fought, "the heroes' policy changed nothing");

  // Refusals, and the standing fight none of them may touch.
  const standing = { hash: stateHash(), tick: u32(wasm.tick()), print: arenaFingerprint() };
  const refusals = [
    // `1` is the retired layout whose hand byte was reserved-zero -- refused
    // rather than grandfathered, because this build reads that byte as a grip.
    ["an unknown layout", (bytes) => { bytes[0] = 1; },
      { reason: ARENA_UNKNOWN_LAYOUT, fighter: ARENA_WHOLE_CONFIG, slot: ARENA_WHOLE_CONFIG }],
    ["a wrong fighter count", (bytes) => { bytes[2] = 3; },
      { reason: ARENA_WRONG_FIGHTER_COUNT, fighter: ARENA_WHOLE_CONFIG, slot: ARENA_WHOLE_CONFIG }],
    ["an unmeasured anatomy", (bytes) => { bytes[ARENA_HEADER_BYTES] = 7; },
      { reason: ARENA_UNKNOWN_ANATOMY, fighter: 0, slot: ARENA_WHOLE_CONFIG }],
    ["both hands empty", (bytes) => {
      const at = ARENA_HEADER_BYTES + ARENA_FIGHTER_BYTES + 12 + ARENA_HAND_BYTES;
      bytes.fill(0, at, at + ARENA_HAND_BYTES);
      bytes[at] = ARENA_HAND_EMPTY;
    }, { reason: ARENA_NO_EQUIPMENT, fighter: ARENA_WHOLE_CONFIG, slot: ARENA_WHOLE_CONFIG }],
    // v2-ui-08 landed the policy and this refusal is now about the *network*:
    // the studio greys the entry out until it has fetched one, and the slot byte
    // carries the code, which is what "refused by name" means here. Guarded
    // rather than assumed, because the test below installs a checkpoint and this
    // assertion would go vacuous if the two ever swapped order.
    ["the learned policy with no checkpoint", (bytes) => {
      assert.equal(u32(wasm.checkpoint_installed()), 0, "a network is already installed");
      bytes[ARENA_HEADER_BYTES + 1] = LEARNED;
    }, { reason: ARENA_NO_CHECKPOINT, fighter: 0, slot: LEARNED }],
    // The two-handed marker anywhere but a full right hand: on the Fighter's
    // left hand block, byte 1. The legal placement is asserted below, where a
    // two-handed club installs and fights.
    ["a two-handed marker on the left hand", (bytes) => {
      bytes[ARENA_HEADER_BYTES + 12 + 1] = 1;
    }, { reason: ARENA_NONCANONICAL, fighter: 0, slot: 0 }],
  ];
  for (const [what, edit, expected] of refusals) {
    const bytes = arenaBytes(swapped);
    edit(bytes);
    stageArena(bytes);
    assert.deepEqual(
      arenaResult(wasm.arena_start(9)),
      { outcome: 0, ...expected },
      `${what} was not refused as documented`,
    );
    assert.equal(stateHash(), standing.hash, `${what} disturbed the installed world`);
    assert.equal(u32(wasm.tick()), standing.tick, `${what} moved the clock`);
    assert.equal(arenaFingerprint(), standing.print, `${what} replaced the configuration`);
  }

  // The settled fight does not step any further, which is the tick limit being
  // the arena's own rather than the caller's.
  wasm.step(1);
  assert.equal(u32(wasm.tick()), standing.tick, "a settled arena stepped past its limit");

  // Still usable after six refusals, which is what the fail-closed shape exists
  // for: a bad slider value is a message rather than a reload.
  const shorter = shippedArena();
  shorter.maxTicks = 30;
  stageArena(arenaBytes(shorter));
  assert.equal(arenaResult(wasm.arena_start(11)).outcome, 1, "the instance stopped taking fights");
  const shorterPrint = arenaFingerprint();
  assert.equal(u32(wasm.tick()), 0);
  wasm.step(10);
  assert.equal(u32(wasm.tick()), 10);

  // The marker's legal placement: the Brute's club gripped in both hands
  // installs, fingerprints differently from the same configuration one-handed
  // -- the grip reaches the row's binding byte -- and fights.
  const gripped = shippedArena();
  gripped.maxTicks = 30;
  gripped.fighters[1].twoHanded = true;
  stageArena(arenaBytes(gripped));
  assert.equal(arenaResult(wasm.arena_start(11)).outcome, 1, "a two-handed club was refused");
  assert.notEqual(arenaFingerprint(), shorterPrint, "the grip did not reach the fingerprint");
  wasm.step(30);
  assert.equal(u32(wasm.tick()), 30);
  console.log(`arena          ${config.maxTicks} ticks, fingerprint ${hex(fingerprint)}`);

  // And back to a legacy world, so nothing after this inherits an arena.
  wasm.init(1);
  assert.equal(u32(wasm.arena_policy(0)), NO_POLICY);
});

// The two holes v2-ui-05's review found, both of them first demonstrated
// against this artifact rather than natively, and both of them mirrored in
// `crates/web` by `descending_out_of_an_arena_returns_a_legacy_world` and
// `an_installed_arena_refuses_every_order_export`. They are here as well
// because a `pub extern "C"` export is the surface a page actually holds, and
// because neither failure said anything on its way past: the first was a level
// that had stopped with no error on the page, and the second was a fight that
// had quietly become a different fight under an unmoved fingerprint.

test("descending out of an arena returns a legacy world", () => {
  stageArena(arenaBytes(shippedArena()));
  assert.equal(arenaResult(wasm.arena_start(3)).outcome, 1);
  wasm.step(50);
  assert.equal(u32(wasm.descend()), 1, "the run did not move down a floor");

  // `Sim::descend` reassigns the world in place, and until the review it left
  // the duel standing on top of the new floor.
  assert.equal(u32(wasm.arena_policy(0)), NO_POLICY, "the floor below is still an arena");
  assert.equal(u32(wasm.arena_policy(1)), NO_POLICY);
  assert.equal(arenaFingerprint(), 0n, "a generated floor is named by a duel's configuration");
  assert.notEqual(u32(wasm.policy_kind(0)), NO_POLICY, "a legacy world cannot name its policy");
  assert.equal(u32(wasm.set_policy(0, 2)), 1, "a legacy world refused a legacy policy");

  // 300 is `shippedArena().maxTicks`, which is where the tick used to stick:
  // the arena loop's gate was still reading the previous configuration's limit.
  wasm.step(600);
  assert.equal(u32(wasm.tick()), 600, "the floor stopped at the previous fight's tick limit");
  wasm.init(1);
});

test("an installed arena refuses every order export", () => {
  // `arena_start` sets the runner's `Order::Advance` on each side *because*
  // orders reach `World::state_hash`, which is the same sentence that says a
  // later order is a different fight. The fingerprint names the configuration
  // and nothing else -- deliberately, since that is what makes a recording
  // reproducible -- so it cannot be the thing that notices.
  const config = shippedArena();
  const fight = (disturb) => {
    stageArena(arenaBytes(config));
    assert.equal(arenaResult(wasm.arena_start(3)).outcome, 1);
    wasm.step(10);
    if (disturb) disturb();
    wasm.step(config.maxTicks - 10);
    return { hash: stateHash(), print: arenaFingerprint() };
  };
  const clean = fight(null);
  for (const [what, disturb] of [
    ["set_goto", () => wasm.set_goto(20_000, 12_000)],
    // Index 1 generation 0 is the Monster, which the arena builds second. A
    // handle that named nobody would make this line vacuous, so the legacy
    // half below locks the same handle on a world where it is meant to take.
    ["set_focus", () => assert.equal(u32(wasm.set_focus(1, 0)), 0, "set_focus took on an arena")],
    ["clear_order", () => wasm.clear_order()],
    ["route_push", () => assert.equal(u32(wasm.route_push(20_000, 12_000)), 0, "route_push took")],
  ]) {
    assert.deepEqual(fight(disturb), clean, `${what} changed an installed arena's fight`);
  }

  // The guard is the arena and not a switch left off: all four still take on a
  // legacy world, which is the half that would otherwise rot silently.
  wasm.init(1);
  // 3 is `Body::Skitterer`, the same code `BATTLE_HASH`'s script spawns.
  wasm.spawn_monster(3, 255, 255);
  wasm.set_goto(20_000, 12_000);
  const ordered = stateHash();
  assert.notEqual(ordered, 0n);
  assert.equal(u32(wasm.route_push(18_000, 11_000)), 1, "a legacy world refused a waypoint");
  wasm.clear_order();
  assert.notEqual(stateHash(), ordered, "clear_order left the standing order alone");
  assert.equal(u32(wasm.set_focus(1, 0)), 1, "a legacy world refused a lock on its monster");
  wasm.init(1);
});

// ---------------------------------------------------------------------------
// v2-ui-08: the learned fighter, and the claim this file exists to check.
//
// `crates/learn-core/src/model.rs` chose a rectified linear over `tanh` on
// portability grounds -- no libm call in the forward pass, IEEE-754 `f32`
// multiply and add which both targets mandate, a summation order fixed by the
// loop, no FMA contraction in the profile, ties to the lowest index -- and then
// recorded that it was "only a *claim* about hosts other than this one, because
// this repository has no second host to check it on".
//
// This module is the second host. `LEARNED_INFERENCE_DIGEST` is what holds the
// two to the same **logits**, which is a stronger comparison than the same five
// argmaxes: a divergence that has not yet crossed a decision boundary is
// invisible to the argmaxes and is exactly the one worth catching, since it is
// the one that is about to become a different fight.

// Recorded natively by `cargo test -p web -- --ignored --nocapture
// print_the_learned_inference_digest` and pinned again in crates/web/src/lib.rs,
// so that a one-sided failure diagnoses target disagreement -- the rule the
// golden registry states for every browser pin.
//
// **The caveat travels with the number**: it holds for the repository's baseline
// targets, MSVC x86-64 with no `target-cpu`, `target-feature` or fast-math in
// the profile, and the wasm MVP. Neither has an FMA instruction, which is what
// closes contraction; `-C target-cpu=native` on a host that does have one
// re-opens it and is outside the guarantee.
const LEARNED_INFERENCE_DIGEST = 0xbdba8d64d340ce32n;

// The shipped artifact, read off disk rather than embedded in the module. That
// is the delivery decision under test as much as it is a convenience: a
// checkpoint is a fighter, the studio fetches it, and this is the same fetch
// with `fs` standing in for the network.
const CHECKPOINT = path.join(ROOT, "checkpoints", "v2-probe.ckpt");

const stageCheckpoint = (bytes) => {
  new Uint8Array(wasm.memory.buffer, u32(wasm.checkpoint_ptr()), bytes.length).set(bytes);
  return bytes.length;
};

const checkpointResult = (packed) => ({
  outcome: u32(packed) & 0xff,
  reason: (u32(packed) >>> 8) & 0xff,
  detail: u32(packed) >>> 16,
});

const learnedDigest = () =>
  hash64(wasm.learned_inference_digest_lo(), wasm.learned_inference_digest_hi());

const publishedName = () =>
  Buffer.from(new Uint8Array(wasm.memory.buffer, u32(wasm.checkpoint_digest_ptr()), 32));

test("native_and_wasm_learned_inference_digests_match", () => {
  // Nothing installed answers zero rather than a digest of an absent network,
  // and that has to be read before the load or the assertion after it could be
  // agreeing with a number that was already there.
  assert.equal(u32(wasm.checkpoint_installed()), 0, "a network was installed before any load");
  assert.equal(learnedDigest(), 0n, "an empty module published an inference digest");

  const bytes = fs.readFileSync(CHECKPOINT);
  assert.ok(
    bytes.length <= u32(wasm.checkpoint_capacity()),
    `the shipped checkpoint is ${bytes.length} bytes and the buffer holds ` +
      `${u32(wasm.checkpoint_capacity())}`,
  );
  assert.deepEqual(
    checkpointResult(wasm.load_checkpoint(stageCheckpoint(bytes))),
    { outcome: 1, reason: 0, detail: 0xffff },
    "the module refused the shipped checkpoint",
  );
  assert.equal(u32(wasm.checkpoint_installed()), 1);

  // The name the module publishes is the file's own last thirty-two bytes,
  // which is the SHA-256 `lab trace` writes into a recording's header -- so a
  // reader can say whether the arena in front of it is running the fighter the
  // trace was recorded from.
  assert.equal(u32(wasm.checkpoint_digest_len()), 32);
  assert.deepEqual(
    publishedName(),
    bytes.subarray(bytes.length - 32),
    "the module named a different file",
  );

  const measured = learnedDigest();
  assert.ok(
    measured === LEARNED_INFERENCE_DIGEST,
    divergence("The learned inference digest", LEARNED_INFERENCE_DIGEST, measured),
  );

  // Self-contained, exactly as the stream digest is: a worker may ask for this
  // mid-fight, and a diagnostic that stepped the installed world would break the
  // thing it was diagnosing.
  wasm.init(4);
  wasm.step(12);
  const undisturbed = () => [wasm.tick(), hex(stateHash()), u32(wasm.frame_len())];
  const before = undisturbed();
  assert.equal(learnedDigest(), measured, "the inference digest is not a function of the weights");
  assert.deepEqual(undisturbed(), before, "the inference digest disturbed the installed sim");
  console.log(`learned digest ${hex(measured)}  == native`);
});

test("a corrupt checkpoint is refused and the instance stays usable", () => {
  // A trap behind `pub extern "C"` poisons the wasm instance for the life of the
  // page, so a mistyped URL that returned an HTML error page has to be a message
  // rather than a reload. Four of the twelve refusals, chosen for being the ones
  // a *fetch* actually produces; the full set, one per `CheckpointError`
  // variant, is `a_corrupt_checkpoint_is_refused_and_installs_nothing` in
  // crates/web.
  // Installed here rather than inherited from the test above, so this one runs
  // alone under `--test-name-pattern`. Every other test in this file stands on
  // its own and these two would have been the exceptions -- and the exceptions
  // would have been the two most likely to be run in isolation while somebody
  // debugged them.
  const good = fs.readFileSync(CHECKPOINT);
  assert.equal(checkpointResult(wasm.load_checkpoint(stageCheckpoint(good))).outcome, 1);
  const named = publishedName();

  const CHECKPOINT_TOO_LONG = 1;
  const CHECKPOINT_TRUNCATED = 2;
  const CHECKPOINT_BAD_MAGIC = 3;
  const CHECKPOINT_DIGEST_MISMATCH = 9;
  const flipped = Buffer.from(good);
  flipped[flipped.length >>> 1] ^= 0x01;
  const refusals = [
    // Longer than the buffer. Passed as a length alone, with nothing staged,
    // because staging it is exactly what the module is refusing to let a caller
    // do.
    ["longer than the buffer", null, u32(wasm.checkpoint_capacity()) + 1, CHECKPOINT_TOO_LONG],
    ["a truncated fetch", good.subarray(0, good.length - 40), 0, CHECKPOINT_TRUNCATED],
    ["an error page", Buffer.from("<!doctype html><title>404</title>"), 0, CHECKPOINT_BAD_MAGIC],
    ["one flipped bit", flipped, 0, CHECKPOINT_DIGEST_MISMATCH],
  ];
  for (const [what, bytes, length, reason] of refusals) {
    const len = bytes === null ? length : stageCheckpoint(bytes);
    const answer = checkpointResult(wasm.load_checkpoint(len));
    assert.equal(answer.outcome, 0, `${what} loaded`);
    assert.equal(answer.reason, reason, `${what} answered the wrong reason`);
    assert.equal(u32(wasm.checkpoint_installed()), 1, `${what} uninstalled the network`);
    assert.deepEqual(publishedName(), named, `${what} renamed the installed network`);
  }

  // And the instance still works afterwards, which is the whole point: the good
  // file loads again and the digest is where it was.
  assert.equal(checkpointResult(wasm.load_checkpoint(stageCheckpoint(good))).outcome, 1);
  assert.equal(learnedDigest(), LEARNED_INFERENCE_DIGEST);
});

// A checkpoint's header is *claims*, and `Vec::with_capacity` believes them
// before the loop that fills the vector discovers the file cannot back them.
// This is the one allocating call in the set, and it is reachable from the one
// input a *person* chooses from a picker, so the amount it can be talked into
// reserving is a contract and not an implementation detail.
//
// Found by review: a 68-byte file declaring 0xffffffff weights reserved 4 MiB
// -- 62,645x the file -- and grew linear memory by 65 pages on its way to
// refusing the file, which detaches every typed array the page is holding. The
// caps are now `ModelShape::CURRENT.weight_count()` and `bytes.len() / 8`,
// which are the largest counts a file of that length could legitimately carry.
const WASM_PAGE = 65_536;

// Two lengths and one header, so the header's *claims* are what varies. Offsets
// follow `Checkpoint::to_bytes`: the first 64 bytes are magic, framing, both
// layout versions, the three shape words and the training record up to the seed
// count at 60, which puts the weight count at 64 when no seeds follow.
const SEED_COUNT_AT = 60;
const WEIGHT_COUNT_AT = 64;

function overclaiming(good, field, claim) {
  const bytes = Buffer.alloc(WEIGHT_COUNT_AT + 4);
  good.copy(bytes, 0, 0, WEIGHT_COUNT_AT);
  bytes.writeUInt32LE(0, SEED_COUNT_AT);
  bytes.writeUInt32LE(0, WEIGHT_COUNT_AT);
  bytes.writeUInt32LE(claim, field);
  return bytes;
}

test("a refused checkpoint does not grow linear memory", () => {
  const good = fs.readFileSync(CHECKPOINT);
  assert.equal(checkpointResult(wasm.load_checkpoint(stageCheckpoint(good))).outcome, 1);
  const named = publishedName();

  // The legitimate file is the control: 3,858 weights and 32 training seeds is
  // what the decoder is *for*, and it must not grow memory either. Measured
  // first so a page the good load happened to take is not charged to a refusal.
  const settled = wasm.memory.buffer.byteLength;
  assert.equal(checkpointResult(wasm.load_checkpoint(stageCheckpoint(good))).outcome, 1);
  assert.equal(
    wasm.memory.buffer.byteLength, settled,
    `the shipped ${good.length}-byte checkpoint grew linear memory by ` +
      `${(wasm.memory.buffer.byteLength - settled) / WASM_PAGE} pages`,
  );

  // A view held across the call, because "it grew" and "every typed array the
  // page holds is now detached" are the same sentence and only the second one
  // says why it matters. `init` first, so the row is real.
  wasm.init(1);
  const held = new Float32Array(wasm.memory.buffer, u32(wasm.pose_ptr()), 16);
  const CHECKPOINT_TRUNCATED = 2;

  for (const [what, bytes] of [
    ["four billion weights", overclaiming(good, WEIGHT_COUNT_AT, 0xffffffff)],
    ["four billion training seeds", overclaiming(good, SEED_COUNT_AT, 0xffffffff)],
    // Half a megaword each, which is under the old weight cap and over the real
    // one -- the shape a cap that is 271x the only legal count lets through.
    ["half a megaword of weights", overclaiming(good, WEIGHT_COUNT_AT, 1 << 19)],
    ["half a megaword of seeds", overclaiming(good, SEED_COUNT_AT, 1 << 19)],
  ]) {
    const before = wasm.memory.buffer.byteLength;
    const answer = checkpointResult(wasm.load_checkpoint(stageCheckpoint(bytes)));
    assert.equal(answer.outcome, 0, `${what} loaded`);
    assert.equal(answer.reason, CHECKPOINT_TRUNCATED, `${what} answered the wrong reason`);
    const after = wasm.memory.buffer.byteLength;
    assert.equal(
      after, before,
      `a ${bytes.length}-byte file claiming ${what} grew linear memory by ` +
        `${(after - before) / WASM_PAGE} pages -- ` +
        `${Math.round((after - before) / bytes.length)}x the file it refused`,
    );
    assert.equal(u32(wasm.checkpoint_installed()), 1, `${what} uninstalled the network`);
    assert.deepEqual(publishedName(), named, `${what} renamed the installed network`);
  }

  assert.equal(held.byteLength, 64, "a refusal detached a view the page was holding");
  assert.equal(learnedDigest(), LEARNED_INFERENCE_DIGEST);
  // Not the absolute page count: it depends on which tests ran before this one,
  // and the assertion above is a delta against a baseline this test measures for
  // itself. What is worth printing is that four refusals moved it by nothing.
  console.log("checkpoint     4 overclaiming headers refused, 0 pages of growth");
  wasm.init(1);
});

test("a learned fighter runs a configured duel inside the module", () => {
  // **No pinned number here either, and for the reason the scripted duel above
  // gives.** The number this would pin is an articulated fight's state hash,
  // which is `ARTICULATED_HASH` under another name -- planned by v2-17,
  // deliberately absent, and which no session before it may create. The
  // cross-target claim this session owes is `LEARNED_INFERENCE_DIGEST`, and that
  // is pinned; the fight equality is
  // `a_learned_fight_in_wasm_matches_the_same_fight_in_lab` in crates/web, over
  // 3,600 ticks of the same configuration against a second spelling of `lab`'s
  // loop.
  //
  // What is checked here is everything that does not require inventing a pin:
  // that the module takes the code once a network is installed, that it runs the
  // fight rather than standing still, that the same bytes fight the same fight
  // twice, and that a learned fighter is not a scripted one wearing its number.
  // Loaded here rather than inherited, for the reason the test above gives.
  assert.equal(
    checkpointResult(wasm.load_checkpoint(stageCheckpoint(fs.readFileSync(CHECKPOINT)))).outcome,
    1,
  );
  const config = shippedArena();
  config.fighters[0].policy = LEARNED;
  stageArena(arenaBytes(config));
  assert.deepEqual(
    arenaResult(wasm.arena_start(3)),
    { outcome: 1, reason: 0, fighter: ARENA_WHOLE_CONFIG, slot: ARENA_WHOLE_CONFIG },
    "the module refused a learned fighter with a network installed",
  );
  assert.equal(u32(wasm.arena_policy(0)), LEARNED);
  assert.equal(u32(wasm.arena_policy(1)), WINDMILL);

  wasm.step(3_600);
  // Default still decides at 259. Exact reaches the configured 300-tick limit.
  // The second fight in
  // `exact_wasm_check_fights_match_the_same_native_configuration` stages these
  // same equipment words and policies through the native ABI and asserts 300;
  // this is cross-target equality over one input, not a re-pin across two
  // differently specified fights.
  const stopped = u32(wasm.tick());
  const LEARNED_STOPS_AT = CARTESIAN_RECOIL ? config.maxTicks : 259;
  assert.equal(stopped, LEARNED_STOPS_AT, "the learned duel no longer ends where it did");
  assert.ok(
    stopped > 32 && stopped <= config.maxTicks,
    "the learned duel either stood still or ran past its own clock",
  );
  assert.ok(u32(wasm.combat_event_len()) > 0, "the learned fight resolved no contact");
  const fought = stateHash();

  stageArena(arenaBytes(config));
  assert.equal(arenaResult(wasm.arena_start(3)).outcome, 1);
  wasm.step(3_600);
  assert.equal(stateHash(), fought, "the same network and seed fought differently");

  const scripted = shippedArena();
  stageArena(arenaBytes(scripted));
  assert.equal(arenaResult(wasm.arena_start(3)).outcome, 1);
  wasm.step(3_600);
  assert.notEqual(stateHash(), fought, "the learned fighter fought like the script");
  console.log(
    `learned duel   ${config.maxTicks} ticks, ${u32(wasm.combat_event_len())} contact rows`,
  );

  wasm.init(1);
});
