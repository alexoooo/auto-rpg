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
const LAB_HASH = 0x00b48ceb21081d1dn;

// `init(1); set_goto(20_000, 12_000); step(600)`: the path a player drives.
const ROOM_HASH = 0xf67a83db5b6288e5n;

// `init(1); spawn_monster(3); step(600)`: a whole fight, start to finish. Worth
// its own number because it reaches arithmetic the walk never does -- the spawn
// point comes out of `Rng::from_stream` and the committed sine table, and every
// approach measures a distance through `isqrt64`.
const BATTLE_HASH = 0x8fac6bdd30efbcacn;

// `init(1); spawn_monster(2) x3; step(1800); swap_in_hero(1); step(400)`: a
// fight, a death, a replacement, and the fight the replacement walks into. The
// longest arc the page can drive, and the only one of these four that runs the
// sim across the death of an entity and the *reuse* of its slot -- the
// generational free list is exactly the kind of index bookkeeping that a 32-bit
// usize could quietly do differently.
const SWAP_HASH = 0xf963cdf8faf3331an;

// `init(1); set_hero_loadout(0, BOW); spawn_monster(BRUTE); step(1200)`: the
// only one of these five that ever puts an arrow in the air, and the only
// reason it exists. The other four never touch the projectile path, which is a
// good deal of arithmetic none of them exercise -- `Vec2::length` on every tick
// of every flight, `segment_circle`'s i64-staged dot products, and the
// saturating multiply in `tangential_speed` at the release. Portable
// fixed-point is a claim about code that runs.
const BOW_HASH = 0xd67ad1e4eb4ad18dn;

// The frame header, as the client reads it.
const HEADER_LEN = 14;
const UNIT_STRIDE = 29;
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
const EVENT_STRIDE = 5;

// How long the frame says it is, from its own three counts.
const frameSpan = (live) =>
  HEADER_LEN + UNIT_STRIDE * live[6] + SHOT_STRIDE * live[7] + EVENT_STRIDE * live[8];

// `ActionKind::code`, from crates/sim/src/action.rs. Append-only, so this is
// safe to write down.
const BOW_CODE = 6;
const ARENA = [48, 32];

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
    "set_goto",
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
    "descend",
  ];
  for (const name of exports) {
    assert.equal(typeof wasm[name], "function", `web.wasm does not export ${name}()`);
  }
  assert.ok(wasm.memory instanceof WebAssembly.Memory, "LLD did not export memory");

  // The five numbers the page's boot handshake compares. Wrong here and the
  // page stops with an overlay instead of painting a health bar out of a guard
  // arc, which is the handshake working -- but it is cheaper to find out here.
  assert.equal(wasm.frame_layout_version(), 6, "FRAME_LAYOUT_VERSION");
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
  assert.equal(live[12], 1, "portal_state: visible but shut while monsters stand");
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
  assert.equal(unit[5], 84, "max_hp: 20 + 8 * vitality 8");
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
  assert.ok(arrival.some((v) => v === 0), "a whole 48x32 floor was in sight at once");
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
      assert.ok(row[0] >= 0 && row[0] <= 3, `event kind ${row[0]}`);
      assert.ok(
        row[1] >= -2 && row[1] <= ARENA[0] + 2 && row[2] >= -2 && row[2] <= ARENA[1] + 2,
        `an event happened outside the arena at (${row[1]}, ${row[2]})`,
      );
      assert.ok(row[4] >= 0 && row[4] < 64, `actor_index ${row[4]}`);
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
  assert.equal(hero[5], 52, "max_hp: 20 + 8 * vitality 4");
  assert.equal(live[2], 0, "order_kind: the replacement inherited an order");

  wasm.step(400);
  const measured = stateHash();
  assert.equal(wasm.tick(), 2_200, "the swap moved the clock");
  assert.ok(measured === SWAP_HASH, divergence("The swap state hash", SWAP_HASH, measured));
  console.log(`swap hash      ${hex(measured)}  == native`);
});
