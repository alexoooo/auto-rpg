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
const LAB_HASH = 0x7ba34660aecc7e8fn;

// `init(1); set_goto(20_000, 12_000); step(600)`: the path a player drives.
const ROOM_HASH = 0x3604699b7f77dc4fn;

// `init(1); spawn_monster(3); step(600)`: a whole fight, start to finish. Worth
// its own number because it reaches arithmetic the walk never does -- the spawn
// point comes out of `Rng::from_stream` and the committed sine table, and every
// approach measures a distance through `isqrt64`.
const BATTLE_HASH = 0x7bc035fea0538567n;

// `init(1); spawn_monster(2) x3; step(1800); swap_in_hero(1); step(400)`: a
// fight, a death, a replacement, and the fight the replacement walks into. The
// longest arc the page can drive, and the only one of these four that runs the
// sim across the death of an entity and the *reuse* of its slot -- the
// generational free list is exactly the kind of index bookkeeping that a 32-bit
// usize could quietly do differently.
const SWAP_HASH = 0x881059e03eaf2037n;

// The frame header, as the client reads it.
const HEADER_LEN = 7;
const UNIT_STRIDE = 27;
const ARENA = [24, 16];

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
  ];
  for (const name of exports) {
    assert.equal(typeof wasm[name], "function", `web.wasm does not export ${name}()`);
  }
  assert.ok(wasm.memory instanceof WebAssembly.Memory, "LLD did not export memory");

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
  assert.equal(units, 1, "the room holds exactly one hero");
  assert.equal(
    live.length,
    HEADER_LEN + UNIT_STRIDE * units,
    `frame_len() is ${live.length}, not ${HEADER_LEN} + ${UNIT_STRIDE} * ${units}`,
  );
  assert.deepEqual([live[0], live[1]], ARENA, "arena_x, arena_y");
  assert.equal(live[2], 4, "order_kind: Goto is discriminant 4");
  assert.deepEqual([live[3], live[4]], [20, 12], "order_x, order_y: 20_000 thousandths is 20.0");
  assert.ok(live[5] > 0 && live[5] <= wasm.tick(), `last_decision_tick ${live[5]}`);

  // The hero, drawn from the one row there is. Checking a couple of columns by
  // value is what distinguishes "the row is there" from "the row is shifted by
  // one", which is a facing wedge drawn out of a hit-point total.
  const unit = live.slice(HEADER_LEN);
  assert.ok(unit[0] > 12 && unit[1] > 8, `x, y ${unit[0]}, ${unit[1]}: the hero set off`);
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
});

test("a policy can be chosen and tuned across the boundary", () => {
  // The behaviour panel's whole surface, checked in wasm rather than only
  // natively: these are the twelve newest exports and the ones most likely to
  // be renamed on one side of the wall and not the other.
  wasm.init(1);
  assert.equal(wasm.policy_kind(0), 0, "heroes should open on the baseline");

  assert.equal(wasm.set_policy(0, 1), 1, "could not select the duelist");
  assert.equal(wasm.policy_kind(0), 1);
  assert.equal(wasm.policy_kind(1), 0, "selecting one side moved the other");
  assert.equal(wasm.set_policy(0, 999), 0, "an unknown policy code was accepted");

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
  wasm.set_input(-1000, 0, 0, 0, 0, 0);
  wasm.step(60);
  assert.ok(frame()[HEADER_LEN] < 11, "the hero did not walk west when told to");

  // Taking the limb implies taking action selection: a player who could swing
  // but not choose would watch the AI put a shield in their hand mid-cut.
  wasm.set_control(2);
  assert.equal(wasm.control(), 2 | 4, "taking the limb has to imply taking the choice");
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
  assert.equal(wasm.spawn_monster(3, 255, 255), 1, "nothing arrived");

  const live = frame();
  assert.equal(live[6], 2, "unit_count");
  assert.equal(
    live.length,
    HEADER_LEN + UNIT_STRIDE * 2,
    `frame_len() is ${live.length}, not ${HEADER_LEN} + ${UNIT_STRIDE} * 2`,
  );

  const monster = live.slice(HEADER_LEN + UNIT_STRIDE);
  assert.equal(monster[6], 1, "faction: Monsters");
  assert.equal(monster[7], 3, "kind: Skitterer");
  assert.equal(monster[4], monster[5], "arrived already wounded");
  // A fresh slot at generation zero, and not the hero's.
  assert.deepEqual([monster[9], monster[10]], [1, 0], "entity_index, entity_generation");
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
