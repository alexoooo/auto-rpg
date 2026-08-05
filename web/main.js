// The page you click on.
//
// Everything below the wasm boundary is fixed point and deterministic; this
// file is the only place floats and wall-clock time are allowed to touch the
// game, and it is careful about both:
//
//   * the sim is stepped at exactly 60 ticks a second regardless of what the
//     display is doing, because a sim whose history depends on the refresh
//     rate is not deterministic in any useful sense;
//   * a click is rounded to thousandths of a world unit and clamped *before*
//     it crosses, because JavaScript's ToInt32 wraps rather than clamps;
//   * a typed array over linear memory is never held across a call into wasm.
//
// No modules, no bundler, no dependencies. Open it and read it top to bottom.
"use strict";

const TAU = Math.PI * 2;

/** Matches `sim::rules::TICKS_PER_SECOND`. The sim has no clock; this is what
 *  ties its ticks to real seconds, and it is not negotiable. */
const TICKS_PER_SECOND = 60;
const TICK_MS = 1000 / TICKS_PER_SECOND;

/** Longest real interval a single frame may account for. A tab that was in the
 *  background for a minute must not try to simulate a minute. */
const MAX_FRAME_MS = 250;

/** And even inside that, at most this many ticks of catch-up per frame, so a
 *  slow frame cannot cascade into a slower one. */
const MAX_CATCHUP_TICKS = 8;

// The frame layout, from crates/web/src/lib.rs. Header first, then one row per
// unit: [x, y, facing_raw, radius, hp, max_hp, faction, kind, intent,
// entity_index, entity_generation, limb_angle_raw, limb_reach, limb_spin,
// action_length, action_arc_raw, hit_flash, block_flash, parry_flash,
// limb_swing, limb_swing_left, limb_line_raw, action_kind, action_role, slot,
// slot0_action, slot1_action, sight_range, visible].
//
// That list was stale for a layout: it still named the two shield columns a
// character carried before it had one limb, so it counted thirty names against a
// stride of twenty-eight. `readUnit` below is the authority either way -- it is
// what indexes the row -- but a comment that miscounts the row is worse than no
// comment, because it is the thing somebody reaches for first.
const HEADER_LEN = 14;
const UNIT_STRIDE = 29;

/** Floats per arrow, in a block that follows the units: [x, y, heading_raw,
 *  faction]. Arrows are not units -- no health, no loadout, no phase -- so they
 *  get their own short row rather than twenty-three dead floats each. */
const SHOT_STRIDE = 4;

/** Floats per event, in a third block that follows the arrows:
 *  [kind, x, y, amount, actor_index].
 *
 *  Things that *happened*, as opposed to things that are. Every other row in the
 *  frame describes state that will still be there next frame; an event is gone
 *  the moment it is read, and what the page does with it -- a floating number, a
 *  callout bubble -- it then ages on its own wall clock, like `trail` and
 *  `corpses`. */
const EVENT_STRIDE = 5;

/** Event `kind` codes, from crates/web/src/lib.rs. `amount` reads differently
 *  under each: health lost, health absorbed, nothing, and an action code. */
const EVENT_DAMAGE = 0;
const EVENT_BLOCK = 1;
const EVENT_PARRY = 2;
const EVENT_DECLARE = 3;

/** Frame layout this file is written against. Checked at boot against
 *  `frame_layout_version()`, and a mismatch stops the page rather than letting
 *  it paint a health bar out of a guard arc. */
const FRAME_LAYOUT_VERSION = 6;

// `Swing::discriminant`, from crates/sim/src/hand.rs. Append-only.
const SWING_GUARD = 0;
const SWING_WINDUP = 1;
const SWING_STRIKE = 2;
const SWING_RECOVER = 3;
const SWING_SWAP = 4;

// `Role::discriminant`, from crates/sim/src/action.rs. What the page draws from.
const ROLE_STRIKE = 0;
const ROLE_GUARD = 1;
const ROLE_MOVE = 2;
const ROLE_SHOOT = 3;

/** An empty loadout slot, matching `Loadout::EMPTY`. */
const SLOT_EMPTY = 255;

// `Strike`, from crates/sim/src/command.rs, as `set_input` takes it.
const STRIKE_NONE = 0;
const STRIKE_NEAREST = 1;

// Bits accepted by `set_control`, from crates/web/src/lib.rs.
const CONTROL_FEET = 1;
const CONTROL_LIMB = 2;
const CONTROL_SLOT = 4;

// `PolicyKind::code`, from crates/policy/src/lib.rs. Append-only.
const POLICIES = [
  { code: 0, name: "utility", label: "Baseline" },
  { code: 1, name: "duelist", label: "Duelist" },
  { code: 2, name: "idle", label: "Idle" },
  { code: 3, name: "random", label: "Random" },
];

// `Faction::index()`, and which side each dropdown drives.
const SIDE_HEROES = 0;
const SIDE_MONSTERS = 1;

// `Order` discriminants, from crates/sim/src/action.rs.
const ORDER_HOLD = 0;
const ORDER_GOTO = 4;

// `Faction::index()` and the `Intent` encoding, both from crates/sim.
const FACTION_HEROES = 0;
const INTENT_ATTACK = 1;
const INTENT_FLEE = 2;

// `UnitKind` codes, as `kind_code` in crates/web/src/lib.rs spells them out.
// All four are accepted everywhere a body code crosses now -- `hero_from_code`
// maps 2 and 3 as well, so the Hero rail can put the player inside a Brute and
// `set_hero_body` can do it without the room resetting. Only the *fallback*
// differs between the two decoders: garbage is a Fighter on the hero side and a
// Skitterer on the spawn side.
const BODY_FIGHTER = 0;
const BODY_ROGUE = 1;
const BODY_BRUTE = 2;
const BODY_SKITTERER = 3;

/** How long a corpse lingers. Milliseconds of wall clock, not ticks: this is an
 *  animation and the sim has no opinion about it.
 *
 *  Hit, block and parry markers used to be timed here too, inferred from health
 *  falling between frames. They now arrive as frame columns from the sim, which
 *  is both simpler and the only way to see a *blocked* blow -- most of the drama
 *  and almost none of the damage. */
const CORPSE_MS = 520;

/**
 * Below this fraction, health stops being an amount and starts being a warning.
 *
 * **One threshold, three places**, and this is the one: the bars over the bodies
 * (`drawHealth`), the bar in the vitals line (`#hp-fill`) and the life globe all
 * read it. It was written out as `0.35` in two of those and the third was about
 * to make it three, which is how a number ends up meaning 35% in one corner of a
 * screen and 30% in another.
 */
const LOW_HEALTH = 0.35;

/** The seed for the room. Nothing in an empty room is random, but the number
 *  is what makes this run the same run every time it is opened. */
const SEED = 1;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/**
 * The roster and the registry, read out of wasm at boot.
 *
 * **This replaced a hand-written mirror, and the mirror was wrong.** It claimed
 * a Warrior swung at 2000 raw units against a derived 1880, a Brute at 950
 * against 911, and it computed torque from a `REACH_DRAG` model that had been
 * deleted from the sim. Its own comment said the copy "can only be out of date
 * on screen", which was true and turned out to be the whole problem: a panel
 * that explains the AI is worth nothing if it explains numbers the AI is not
 * using.
 *
 * Filled by `loadRegistry`, which asks the boundary how many rows there are and
 * reads each name straight out of linear memory -- the same ptr/len pattern the
 * behaviour panel already used for gene labels.
 */
const BODIES = [];
const ACTIONS = [];

/** Reads a `ptr`/`len` pair of UTF-8 bytes out of wasm memory. */
function readString(ptr, len) {
  if (!ptr || !len) return "";
  return decoder.decode(new Uint8Array(memory.buffer, ptr, len));
}

/** Pulls the body and action tables across the boundary. Called once, at boot,
 *  after `init`. */
function loadRegistry() {
  BODIES.length = 0;
  for (let code = 0; code < wasm.body_count(); code += 1) {
    BODIES.push({
      code,
      name: readString(wasm.body_name_ptr(code), wasm.body_name_len(code)),
      power: wasm.body_stat(code, 0),
      agility: wasm.body_stat(code, 1),
      intellect: wasm.body_stat(code, 2),
      perception: wasm.body_stat(code, 3),
      vitality: wasm.body_stat(code, 4),
      radius: wasm.body_stat(code, 5) / 1000,
      mass: wasm.body_stat(code, 6) / 1000,
      // How far this body sees, asked for rather than derived. `derived()`
      // below used to compute it as `(60 + 6 * perception) / 10`, which was the
      // last hand-copied sim formula left in this file and exactly what the
      // block comment above is about. Anything standing on the floor gets its
      // sight from its own frame column instead; this is for the roster
      // preview, which describes a body nobody has spawned and so has no row.
      sight: wasm.body_stat(code, 7) / 1000,
    });
  }
  ACTIONS.length = 0;
  for (let i = 0; i < wasm.action_count(); i += 1) {
    const code = wasm.action_code(i);
    ACTIONS.push({
      code,
      name: readString(wasm.action_name_ptr(code), wasm.action_name_len(code)),
      role: wasm.action_role(code),
      ready: wasm.action_stat(code, 0),
      windup: wasm.action_stat(code, 1),
      recovery: wasm.action_stat(code, 2),
      length: wasm.action_stat(code, 3) / 1000,
      arc: wasm.action_stat(code, 4),
      moveBonus: wasm.action_stat(code, 5) / 1000,
    });
  }
}

/** An action row by its code, or `null` for an empty slot. */
function actionOf(code) {
  return ACTIONS.find((a) => a.code === code) || null;
}

/** A display name for an action code, including the empty slot. */
function actionName(code) {
  const action = actionOf(code);
  return action ? action.name : "empty";
}

/** What a body's stats work out to. Derived here for the panel only -- nothing
 *  computed in this file is ever fed back across the boundary. */
function derived(a) {
  return {
    // "20 - intellect, floored at 1" -- ticks between decisions.
    decisionPeriod: clamp(20 - a.intellect, 1, 120),
    // "(250 + 12 * agility) / 100" units per second, held per tick in the sim.
    moveSpeed: (250 + 12 * a.agility) / (100 * TICKS_PER_SECOND),
    // Sight is *not* here. It was, as "(60 + 6 * perception) / 10", and it was
    // the last mirrored sim formula in this file -- so it now crosses the
    // boundary instead: `body_stat(code, 7)` for a body in the registry, and
    // column 27 of a unit row for anything actually standing in the room. See
    // the post-mortem above `BODIES`.
    noise: clamp(15 - a.perception, 0, 15) / 10,
    maxHp: 20 + 8 * a.vitality,
    // Damage is impact speed now, not a constant, so what power buys is a
    // multiplier on however hard you happened to be swinging:
    // "clamp(0.55 + 0.075 * power, 0.55, 3.0)".
    powerMultiplier: clamp(0.55 + 0.075 * a.power, 0.55, 3.0),
    // Agility scales every phase clock alike: "clamp(0.70 + 0.04 * agility,
    // 0.55, 2.00)". What that costs an opponent is measured in ticks of
    // telegraph, so the panel quotes phases per action rather than a spin.
    cadence: clamp(0.7 + 0.04 * a.agility, 0.55, 2.0),
  };
}

/** Ticks a phase of `base` length takes on a body with this cadence. Mirrors
 *  `rules::phase_ticks`, for the panel only. */
function phaseTicks(base, cadence) {
  return base === 0 ? 0 : Math.max(1, Math.round(base / cadence));
}

// --------------------------------------------------------------- the module

/** Set once the instance is poisoned. A wasm trap leaves linear memory
 *  half-written and can leave a `RefCell` borrowed, so there is no recovering
 *  and no point trying: stop the loop and say what happened. */
let dead = false;

let memory = null;
let raw = null; // the instance's exports, unguarded
let wasm = null; // the same exports, each wrapped in a try/catch
let view = null; // Float32Array over the frame buffer; never held across a call

const EXPORTS = [
  "init",
  "set_goto",
  "clear_order",
  // The dragged path: a queue of destinations over the one standing order the
  // sim carries. `route_len()` is read once a frame like `map_revision()`,
  // because the module advances the queue per *tick* and a page that read it
  // before stepping would be a frame behind.
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
  // The Hero rail, editing a character that is standing in the room. Every one
  // of these has a getter beside its setter on purpose: the module clamps and
  // normalises, so the panel reads the value back rather than trusting its own
  // request -- the same discipline `control()` sits beside `set_control()` for.
  "hero_stat",
  "set_hero_stat",
  "hero_body",
  "set_hero_body",
  // The Enemy rail, describing something that does not exist yet. Editing the
  // template changes nothing in the world until `spawn_from_template`.
  "spawn_template_body",
  "set_spawn_template_body",
  "spawn_template_stat",
  "set_spawn_template_stat",
  "spawn_template_slot",
  "set_spawn_template_slot",
  "spawn_from_template",
  // The floor plan, on a buffer of its own because it changes once a level
  // rather than sixty times a second. Read it when `map_revision()` moves.
  "map_ptr",
  "map_len",
  "map_cols",
  "map_rows",
  "map_revision",
  "map_tile_size_milli",
  // The fog of war, on a third buffer beside the tiles and read on the same
  // terms: when `vis_revision()` moves. One byte a tile, indexed exactly as the
  // tile buffer is -- 0 never seen, 1 seen earlier on this floor, 2 in sight now.
  "vis_ptr",
  "vis_len",
  "vis_revision",
  "descend",
];

/**
 * Every call into wasm goes through one of these. On a trap the loop stops and
 * the overlay comes up; every later call answers 0 so nothing else has to know
 * the module died mid-frame.
 */
function guard(name) {
  const fn = raw[name];
  if (typeof fn !== "function") {
    throw new Error(`web.wasm does not export ${name}()`);
  }
  return (...args) => {
    if (dead) return 0;
    try {
      return fn(...args);
    } catch (err) {
      die("The simulation trapped", `${name}() trapped, so the module is poisoned and the loop has stopped.`, err);
      return 0;
    }
  };
}

/**
 * The import object, built by asking the module what it wants.
 *
 * The module is compiled with no `wasm-bindgen` and links with an empty import
 * list today -- verified, not assumed. This loop stays anyway: if some future
 * dependency drags in an intrinsic, it turns a hard `LinkError` at
 * instantiation into a console warning and a stub that returns zero, which is
 * a far better thing to debug.
 */
function buildImports(module) {
  const imports = WebAssembly.Module.imports(module);
  const env = {};
  for (const imp of imports) {
    const bag = (env[imp.module] = env[imp.module] || {});
    if (imp.kind === "function") {
      bag[imp.name] = (...args) => {
        console.warn(`stub: ${imp.module}.${imp.name}(${args.join(", ")})`);
        return 0;
      };
    } else if (imp.kind === "global") {
      bag[imp.name] = new WebAssembly.Global({ value: "i32", mutable: false }, 0);
    } else if (imp.kind === "memory") {
      bag[imp.name] = new WebAssembly.Memory({ initial: 17 });
    } else if (imp.kind === "table") {
      bag[imp.name] = new WebAssembly.Table({ initial: 0, element: "anyfunc" });
    }
  }
  if (imports.length > 0) {
    console.warn(`web.wasm asked for ${imports.length} imports; all stubbed`, imports);
  }
  return env;
}

/**
 * The live frame buffer.
 *
 * Re-derived every time, never cached across a call into wasm. The buffer is a
 * fixed array in the module so its address does not actually move, but a
 * future `Vec` there would grow linear memory, and growing linear memory
 * detaches every typed array the page is holding -- silently, into a
 * zero-length view. The identity check below is what makes that a rebuild
 * instead of a blank screen.
 */
function frameView() {
  const ptr = wasm.frame_ptr();
  const len = wasm.frame_len();
  if (view === null || view.buffer !== memory.buffer || view.byteOffset !== ptr || view.length !== len) {
    view = new Float32Array(memory.buffer, ptr, len);
  }
  return view;
}

/** A plain-array copy of the frame. Nothing may call into wasm between the
 *  view being derived and the copy being taken. */
function readFrame() {
  const live = frameView();
  return Array.prototype.slice.call(live);
}

/**
 * Whether a body of this radius could stand here, by the page's own copy of the
 * floor plan.
 *
 * A hint, never a rule: the sim owns collision and this is a cheap echo of it
 * for the benefit of the text under the cursor. Approximate on purpose -- it
 * tests the tiles the body's box touches, which is what the sim's own
 * `is_clear` does one level more carefully.
 */
function standable(x, y, radius) {
  const map = levelMap;
  if (!map) return true;
  const lo = (v) => Math.floor((v - radius) / map.tile);
  const hi = (v) => Math.floor((v + radius) / map.tile);
  for (let ty = lo(y); ty <= hi(y); ty++) {
    for (let tx = lo(x); tx <= hi(x); tx++) {
      if (tx < 0 || ty < 0 || tx >= map.cols || ty >= map.rows) return false;
      if (map.tiles[ty * map.cols + tx] !== 0) return false;
    }
  }
  return true;
}

/** The floor plan the page last read, kept for `standable`. */
let levelMap = null;

/**
 * The floor plan: one byte a tile, row-major, `0` open.
 *
 * A `Uint8Array` copy rather than a live view, and read only when
 * `map_revision()` moves. The copy is the point: this is held across frames and
 * a view would be detached the moment linear memory grew, whereas the frame's
 * view is re-derived every frame and can afford to be live.
 */
function readMap() {
  const cols = wasm.map_cols();
  const rows = wasm.map_rows();
  const len = wasm.map_len();
  const live = new Uint8Array(memory.buffer, wasm.map_ptr(), len);
  levelMap = { cols, rows, tiles: new Uint8Array(live), tile: wasm.map_tile_size_milli() / 1000 };
  return levelMap;
}

/** The visibility bytes the page last read, declared beside `levelMap` and held
 *  on exactly the same terms.
 *
 *  Nothing reads it yet -- `rebuildLevelPaths` uses the object `readVis` returns
 *  and then has no further use for it. It is kept because it is the page's copy
 *  of the fog and belongs next to the page's copy of the floor plan: the one
 *  thing that will want it is a `standable` for visibility, which is the smallest
 *  fix for "you cannot trace a route into rock you have never explored". */
let levelVis = null;

/**
 * The visibility bytes the module last published: `0` never seen, `1` seen
 * earlier on this floor, `2` in sight now. One byte a tile, indexed exactly as
 * the tile buffer is.
 *
 * Copied out, like the map, because a view into linear memory is a view that can
 * detach -- see `readMap` for the whole argument. The revision is asked for
 * *before* the view is derived rather than after, so no call into wasm happens
 * between the view and the copy.
 */
function readVis() {
  const revision = wasm.vis_revision();
  const len = wasm.vis_len();
  const live = new Uint8Array(memory.buffer, wasm.vis_ptr(), len);
  levelVis = { revision, tiles: new Uint8Array(live) };
  return levelVis;
}

function readUnit(f, u) {
  return {
    x: f[u],
    y: f[u + 1],
    // A binary angle: the whole turn is 65536, so no trigonometry crossed
    // the boundary. 0 is +x and the sense is counter-clockwise with +y up,
    // which is also how this canvas is drawn (world y grows downward on
    // screen), so the wedge points where the body moves.
    facing: (f[u + 2] / 65536) * TAU,
    radius: f[u + 3],
    hp: f[u + 4],
    maxHp: f[u + 5],
    faction: f[u + 6],
    kind: f[u + 7],
    intent: f[u + 8],
    // The entity handle, as one string to key a Map with. Both halves, because
    // a dead unit's slot is handed to the next spawn: the index alone would
    // read as the same creature getting up again. See the crate docs.
    id: `${f[u + 9]}:${f[u + 10]}`,
    // The index on its own, which is the *only* thing an event row carries as
    // `actor`. Kept beside `id` rather than parsed back out of it: a floater
    // and a callout need to find which body a row was about, and splitting a
    // string sixty times a second to answer that would be silly. It is a hint
    // for grouping and not an identity -- `id` remains the only one of those.
    index: f[u + 9],
    // The limb -- one, now. Bearings arrive as binary angles like `facing`, for
    // the same reason: no trigonometry crosses the boundary.
    limbAngle: (f[u + 11] / 65536) * TAU,
    limbReach: f[u + 12],
    limbSpin: f[u + 13],
    actionLength: f[u + 14],
    actionArc: (f[u + 15] / 65536) * TAU,
    // Already-decayed 0..1 markers, computed by the sim from its own events.
    hitFlash: f[u + 16],
    blockFlash: f[u + 17],
    parryFlash: f[u + 18],
    // The attack. `limbLine` is where the cut is aimed, which during a windup
    // is a long way from where the blade is pointing -- the gap between the two
    // is the tell, and drawing it is the only reason the player can learn to
    // read one.
    swing: f[u + 19],
    swingLeft: f[u + 20],
    limbLine: (f[u + 21] / 65536) * TAU,
    // What is in the hand and what else is in the bag. `role` is what decides
    // whether this gets drawn as a blade or as an arc -- the page does not
    // infer that from the numbers, because "a short thing with a wide arc" and
    // "a guard" are the same numbers and very different pictures.
    action: f[u + 22],
    role: f[u + 23],
    slot: f[u + 24],
    slot0: f[u + 25],
    slot1: f[u + 26],
    // How far this body can see, in world units, straight off its own stat
    // sheet. Not derived here from `perception`, and not derived here ever
    // again: the hero's attributes are a live dial now, so a formula copied
    // into this file would be describing a character that has changed
    // underneath it. See the post-mortem above `BODIES`.
    sight: f[u + 27],
    // Whether the *player* can see this body -- not what the body itself
    // perceives, which is a different question the module never answers here.
    // With no hero standing this is 1 for everything: a fog of war with nobody
    // to be fogged from is just a blank screen.
    visible: f[u + 28] !== 0,
  };
}

function parseFrame(f) {
  const state = {
    arenaX: f[0] || 48,
    arenaY: f[1] || 32,
    orderKind: f[2],
    orderX: f[3],
    orderY: f[4],
    decisionTick: f[5],
    unitCount: f[6],
    shotCount: f[7],
    eventCount: f[8],
    // The run. `monstersLeft` is the module's own count and not
    // `monsters.length`: the unit rows are capped, and the two must not be able
    // to disagree about whether the level is clear.
    monstersLeft: f[9],
    portalX: f[10],
    portalY: f[11],
    portalState: f[12],
    depth: f[13],
    units: [],
    monsters: [],
    shots: [],
    events: [],
    hero: null,
  };
  // Trust the buffer's length over the header's count. They agree, and the
  // belt-and-braces costs one `Math.min` a frame.
  const rows = Math.min(state.unitCount | 0, Math.floor((f.length - HEADER_LEN) / UNIT_STRIDE));
  for (let i = 0; i < rows; i++) {
    const unit = readUnit(f, HEADER_LEN + i * UNIT_STRIDE);
    state.units.push(unit);
    if (unit.faction === FACTION_HEROES) {
      // Searched for, never taken from row zero: `write_frame` skips the dead,
      // so once the character can fall, every row can shift up by one.
      if (!state.hero) state.hero = unit;
    } else {
      state.monsters.push(unit);
    }
  }
  // The arrows, in the block that starts wherever the units stopped. Based off
  // `rows` rather than off `unitCount` for the same belt-and-braces reason: the
  // two agree, and reading the section from the wrong offset would draw arrows
  // out of somebody's health bar.
  const base = HEADER_LEN + rows * UNIT_STRIDE;
  const shots = Math.min(
    state.shotCount | 0,
    Math.floor((f.length - base) / SHOT_STRIDE)
  );
  for (let i = 0; i < shots; i++) {
    const at = base + i * SHOT_STRIDE;
    state.shots.push({
      x: f[at],
      y: f[at + 1],
      heading: (f[at + 2] / 65536) * TAU,
      faction: f[at + 3],
    });
  }
  // Everything that happened during the ticks this frame just ran, in a third
  // block after the arrows -- and based off `shots` for the same
  // belt-and-braces reason the arrows are based off `rows`.
  //
  // One `step(n)` produces one feed, however many ticks `n` was: the module
  // clears it per call, not per tick, so a frame that caught up eight ticks
  // reports all eight. Note the corollary -- a frame that steps *no* ticks
  // leaves the previous call's feed in place, so anything consuming these must
  // do it once per `step`, not once per animation frame.
  const eventBase = base + shots * SHOT_STRIDE;
  const rowCount = Math.min(
    state.eventCount | 0,
    Math.floor((f.length - eventBase) / EVENT_STRIDE)
  );
  for (let i = 0; i < rowCount; i++) {
    const at = eventBase + i * EVENT_STRIDE;
    state.events.push({
      // One of EVENT_DAMAGE / EVENT_BLOCK / EVENT_PARRY / EVENT_DECLARE, and
      // `amount` means something different under each.
      kind: f[at],
      x: f[at + 1],
      y: f[at + 2],
      amount: f[at + 3],
      // `EntityId::index` alone, deliberately without the generation: a row is
      // consumed in the frame it arrives in, and a floater is keyed on the
      // position it happened at rather than on who it happened to. This is a
      // hint for grouping, not an identity -- `unit.id` is still the only one
      // of those.
      actor: f[at + 4],
    });
  }
  return state;
}

// ------------------------------------------------------------------ the page

const canvas = document.getElementById("arena");
const ctx = canvas.getContext("2d");
const stage = document.getElementById("canvas-wrap");
const hintEl = document.getElementById("hint");
const overlay = document.getElementById("overlay");

const el = {
  unitName: document.getElementById("unit-name"),
  unitHp: document.getElementById("unit-hp"),
  hpFill: document.getElementById("hp-fill"),
  orderState: document.getElementById("order-state"),
  orderDest: document.getElementById("order-dest"),
  orderDistance: document.getElementById("order-distance"),
  orderDecision: document.getElementById("order-decision"),
  battleState: document.getElementById("battle-state"),
  battleRoster: document.getElementById("battle-roster"),
  respawn: document.getElementById("btn-respawn"),
  // Pause, in the bottom-right cluster beside the switches. Three handles for
  // one button because `setPaused` writes all three off the same switch: the
  // glyph, the word, and the `aria-pressed` a screen reader reads instead of
  // either of them.
  pause: document.getElementById("btn-pause"),
  pauseGlyph: document.getElementById("pause-glyph"),
  pauseLabel: document.getElementById("pause-label"),
  runDepth: document.getElementById("run-depth"),
  runMonsters: document.getElementById("run-monsters"),
  buildStamp: document.getElementById("build-stamp"),
  simTick: document.getElementById("sim-tick"),
  simPosition: document.getElementById("sim-position"),
  simHash: document.getElementById("sim-hash"),
  // The Hero rail's body-and-kit rows. `loadout-0` and `loadout-1` kept their
  // ids through the move out of the drawer: they still drive the same
  // `set_hero_loadout` export and still read back off the frame.
  heroBody: document.getElementById("hero-body"),
  // Rewritten rather than static: this rail describes the character in the room
  // while there is one and the next spawn while there is not, and the rows look
  // identical in both. See `setHeroRailLive`.
  heroRailNote: document.getElementById("hero-rail-note"),
  heroAttrs: document.getElementById("hero-attrs"),
  loadout0: document.getElementById("loadout-0"),
  loadout1: document.getElementById("loadout-1"),
  loadoutReadout: document.getElementById("loadout-readout"),
  // The Enemy rail, which describes something that does not exist yet.
  enemyBody: document.getElementById("enemy-body"),
  enemySlot0: document.getElementById("enemy-slot-0"),
  enemySlot1: document.getElementById("enemy-slot-1"),
  enemyAttrs: document.getElementById("enemy-attrs"),
};

/** The two rails, by the ids **session 5 measures**. Both are real fixed boxes
 *  of `--rail-w`, so `getBoundingClientRect()` on either one is the rectangle
 *  the camera has to keep the character out of. */
const RAILS = {
  enemy: document.getElementById("panel-enemy"),
  hero: document.getElementById("panel-hero"),
};

const overlayKeys = document.getElementById("keys-overlay");

const DEFAULT_HINT = "Click the floor. The character walks there its own way.";

/**
 * Opens or shuts one rail.
 *
 * A class rather than the `hidden` attribute, because it has to slide in both
 * directions and `display: none` cannot be animated. The stylesheet takes
 * `visibility` with it, which is what keeps the sliders inside out of the tab
 * order while it is shut -- otherwise `Tab` would walk straight into controls
 * nobody can see. That is the drawer's arrangement, inherited whole.
 *
 * The matching class on `<body>` is what lets the stylesheet move the HUD's own
 * gutters aside, so the life globe is not left sitting under the Enemy rail.
 * Deliberately CSS rather than a JS style write: the rail's slide and the HUD's
 * gutter then share one transition and cannot fall out of step.
 */
function setRail(which, open) {
  const rail = RAILS[which];
  if (!rail) return;
  rail.classList.toggle("open", open);
  document.body.classList.toggle(`rail-${which}-open`, open);
  const tab = rail.querySelector(".rail-tab");
  if (tab) tab.setAttribute("aria-expanded", open ? "true" : "false");
  // No resize call, and no `transitionend` listener either. The canvas host did
  // not change size -- the rails are `position: fixed` over it -- and the camera
  // re-measures `railInsets()` every frame, so it picks the slide up while it is
  // still happening rather than at whichever end of it a listener fired on.
}

function railOpen(which) {
  const rail = RAILS[which];
  return !!rail && rail.classList.contains("open");
}

/**
 * How much of the window each rail is currently covering, in CSS pixels.
 *
 * **This is what session 5's camera wants**, and it is measured rather than
 * assumed: `getBoundingClientRect()` accounts for the slide transform, so a
 * rail caught halfway through its 180 ms transition reports the strip it is
 * actually covering at that instant, and the safe rect breathes with it instead
 * of snapping.
 *
 * The tab is measured with the panel because the tab is also over the floor: it
 * hangs off the rail's outer face and stays visible while the rail is shut, so a
 * character parked at `x = 0` would be behind it.
 */
function railInsets() {
  const width = window.innerWidth || viewport.w || 1;
  const span = (rail) => {
    const box = rail.getBoundingClientRect();
    const tab = rail.querySelector(".rail-tab");
    const tabBox = tab ? tab.getBoundingClientRect() : box;
    return { min: Math.min(box.left, tabBox.left), max: Math.max(box.right, tabBox.right) };
  };
  const left = span(RAILS.enemy);
  const right = span(RAILS.hero);
  return {
    left: clamp(left.max, 0, width),
    right: clamp(width - right.min, 0, width),
  };
}

/** The keyboard reference, behind the `?` in the top bar. A modal is read once
 *  and shut; the panel it replaced was at the bottom of a drawer nobody
 *  scrolled to. */
function setKeysOverlay(open) {
  overlayKeys.hidden = !open;
  const button = document.getElementById("btn-keys");
  if (button) button.setAttribute("aria-expanded", open ? "true" : "false");
}

function keysOverlayOpen() {
  return !overlayKeys.hidden;
}

/** What the player last asked for. The frame is the truth about the order; this
 *  only distinguishes two things the sim cannot tell apart -- a walk somewhere
 *  and a stand-down, both of which are `Goto`. */
let intent = "none"; // "goto" | "stand" | "free" | "none"

/** The handle of the pending animation frame, so a trap can cancel it. */
let rafId = 0;

let arena = { x: 24, y: 16 };

/**
 * The camera.
 *
 * The page used to have none: the canvas was letterboxed to the arena's aspect
 * and the whole room was always on screen, which is why the arena shrank to a
 * postage stamp the moment the HUD wanted room. Now the canvas is the page and
 * the view is a window onto the room, centred on the character.
 *
 * `VIEW_UNITS_Y` is the framing, and it is stated in *world units* rather than
 * in pixels because that is the thing that is actually being chosen: how much
 * of the room you can see, on any display. A Warrior sees 9.6 units, so eleven
 * is a shade more than its own sight -- close enough to read a blade, wide
 * enough that nothing arrives from somewhere the character could not have seen
 * it coming from.
 */
const VIEW_UNITS_Y = 11;
const ZOOM_MAX = 2.5; // multiples of the default framing
const CAMERA_TAU_MS = 90; // exponential follow constant

/**
 * World units of void the view is allowed to run past the wall.
 *
 * A tuning number, not a rule. It is stated in world units rather than pixels
 * because what it is buying is *room around the character*, and a pixel band
 * would be a different amount of room at every zoom level. 1.5 is a little
 * under two body diameters: enough that a character standing in a corner with
 * both rails open is still clear of the panel, small enough that the strip of
 * void reads as the edge of the room rather than as a bug.
 */
const CAMERA_OVERSCAN = 1.5;

let viewport = { w: 0, h: 0 }; // the canvas, in CSS pixels
let dpr = 1; // stored, because `render` re-establishes the base matrix each frame
let zoom = 1; // the player's wheel adjustment, re-clamped on every resize
let cam = { x: 12, y: 8 }; // the centre of the view, in world units
let scale = 1; // CSS pixels per world unit

/**
 * The obstructed edges of the canvas, in CSS pixels.
 *
 * The rails are `position: fixed` *over* the glass, so `#canvas-wrap` is still
 * `inset: 0` and neither the `ResizeObserver` nor `window.resize` has anything
 * to say about one opening. The canvas did not change size; what changed is how
 * much of it the player can see, and the camera is the only thing that has to
 * learn it.
 *
 * `top` and `bottom` are carried but stay zero, and that is a decision rather
 * than an omission: nothing spans those edges. The life globe, the action bar
 * and the control group are three small clusters sitting in the bottom corners,
 * and reserving a band as tall as the tallest of them would push the character
 * up the screen across the entire width of the window to buy back two corners.
 * The fields exist so a future full-width strip is a measurement rather than a
 * refactor.
 */
let insets = { left: 0, right: 0, top: 0, bottom: 0 };

/**
 * The unobstructed strip of canvas: where the character is allowed to be.
 *
 * Everything with an opinion about where the view is centred reads this and
 * nothing reads `viewport` directly -- `resize`, `cameraTarget` and
 * `viewOrigin` (and through it `render` and `pointerToWorld`) all frame on the
 * same rectangle, which is the only way they cannot disagree about it.
 *
 * The 120 px floor is not decoration. Under `max-width: 640px` the stylesheet
 * gives a rail `width: 100vw`, so a single open rail covers the window and the
 * two insets sum to more than there is: without the floor `w` goes negative,
 * `scale` goes negative behind it and every division downstream produces an
 * inverted view or a NaN. `x` and `y` are pulled back by the same amount the
 * floor added, because a 120 px rect whose origin is still the far side of a
 * full-window rail would centre the character off the edge of the screen.
 */
function safeRect() {
  const w = Math.max(120, viewport.w - insets.left - insets.right);
  const h = Math.max(120, viewport.h - insets.top - insets.bottom);
  return {
    x: clamp(insets.left, 0, Math.max(0, viewport.w - w)),
    y: clamp(insets.top, 0, Math.max(0, viewport.h - h)),
    w,
    h,
  };
}

/**
 * Re-measures the rails. Answers whether anything actually moved.
 *
 * Measured, never assumed: `railInsets()` reads the rails' own
 * `getBoundingClientRect()`, tabs included, so a stylesheet change to
 * `--rail-w` moves the camera with it and the two cannot desync. A hardcoded
 * width here would be a second copy of a number the layout owns.
 *
 * The half-pixel deadband is what stops this from re-running `resize` forever:
 * the rects are fractional (a tab measures 32.25 px), and `===` on two floats
 * that agree to a thousandth is a coin toss.
 */
function refreshInsets() {
  const measured = railInsets();
  const moved = Math.abs(measured.left - insets.left) > 0.5 || Math.abs(measured.right - insets.right) > 0.5;
  insets = { left: measured.left, right: measured.right, top: 0, bottom: 0 };
  return moved;
}

let trail = [];

/**
 * Numbers coming off bodies, and the pills naming what a body just committed
 * to. Both are seeded from `state.events` and both are aged in **milliseconds**,
 * like `trail` and `corpses` and for the same reason: the sim has no opinion
 * about how long a number hangs in the air, and a frame that runs no ticks must
 * still let one finish rising.
 *
 * There is no event row for an attack *ending*, which is the other half of why
 * these age on a clock rather than tracking a phase: the pill has to expire on
 * its own or it would sit over a body forever the first time a swing was
 * interrupted.
 */
let floaters = [];
let callouts = [];

/**
 * What each body looked like last frame, keyed by entity handle.
 *
 * The frame is a snapshot with no history in it, so "this one just took a hit"
 * and "this one just died" are questions only the page can answer, by comparing
 * two frames. Keying on the handle rather than the row is what makes the answer
 * land on the right body: `write_frame` omits the dead, so a monster falling
 * shifts every row below it up by one.
 */
let bodies = new Map();

/** Where a body was when it stopped being in the frame, and what it looked like
 *  standing there. Drawn fading, then dropped; purely a wall-clock animation,
 *  like the floaters. `kind` and `facing` are carried alongside the radius so a
 *  corpse can settle as the same silhouette it fought as -- a Brute that fell
 *  must not go down as a circle. */
let corpses = [];

let announcedFall = false;
let stillSince = 0; // the tick the character last moved on
let stillAt = { x: 0, y: 0 };
let orderKey = ""; // the order as the frame reports it, to spot a new one
let orderIssuedAtDecision = -1;
let orderAcknowledged = false;
let hintUntil = 0;

function setText(node, text) {
  if (node.textContent !== text) node.textContent = text;
}

function hint(text, live) {
  hintEl.textContent = text;
  hintEl.classList.toggle("live", !!live);
  hintUntil = performance.now() + 4500;
}

/** The end of the page's life. A poisoned module cannot be recovered, and
 *  spinning at 60 Hz on a dead one is the worst failure mode available: stop
 *  the loop, say what happened, and leave the last frame on screen. */
function die(title, body, err) {
  if (dead) return;
  dead = true;
  if (rafId) cancelAnimationFrame(rafId);
  rafId = 0;
  console.error(title, err || body);
  document.getElementById("overlay-title").textContent = title;
  document.getElementById("overlay-body").textContent = body;
  document.getElementById("overlay-detail").textContent = err ? String((err && err.stack) || err) : "";
  overlay.hidden = false;
}

// ------------------------------------------------------------------- sizing

function resize() {
  // Before the framing, not after: every number below is derived from the safe
  // rect now, and the safe rect is a measurement of the rails.
  refreshInsets();

  const box = stage.getBoundingClientRect();
  viewport = {
    w: Math.max(1, Math.floor(Math.max(120, box.width))),
    h: Math.max(1, Math.floor(Math.max(120, box.height))),
  };

  // Two bounds and a preference, all three taken off the *safe* rect rather
  // than the whole canvas: an open rail should zoom out to keep the same amount
  // of room visible in the strip that is left, not crop a third of it away.
  // `fit` is the scale at which the whole room is on screen, and it is the
  // zoomed-out limit: past it you would be looking at void for no reason.
  // `base` is the framing chosen above. `fit` is always below `base` --
  // min(w/24, h/16) <= h/16 < h/11 whatever the window is and whatever the
  // rails are doing -- so the bounds cannot cross however the page is dragged
  // about.
  const safe = safeRect();
  const fit = Math.min(safe.w / arena.x, safe.h / arena.y);
  const base = safe.h / VIEW_UNITS_Y;
  scale = clamp(base * zoom, fit, base * ZOOM_MAX);
  // Writing the clamped value back is load-bearing rather than tidy: without
  // it, twenty notches of wheel past the limit have to be paid back before the
  // next notch moves anything, and the zoom reads as stuck.
  zoom = scale / base;

  // Cap the device pixel ratio: a 4x display would otherwise quadruple the
  // fill cost of every frame for no visible gain.
  dpr = clamp(window.devicePixelRatio || 1, 1, 3);
  canvas.style.width = `${viewport.w}px`;
  canvas.style.height = `${viewport.h}px`;
  // Guarded, because a rail sliding open now runs this on every frame of its
  // 180 ms transition: *assigning* `canvas.width` reallocates and clears the
  // bitmap even when the value it is given is the one already there, which is a
  // dozen pointless backing-store allocations per rail toggle.
  const backing = { w: Math.round(viewport.w * dpr), h: Math.round(viewport.h * dpr) };
  if (canvas.width !== backing.w) canvas.width = backing.w;
  if (canvas.height !== backing.h) canvas.height = backing.h;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

// ------------------------------------------------------------------- camera

/**
 * Where the camera wants to be: the character, centred in the *safe* rect and
 * allowed to run a little past the walls.
 *
 * Both halves of that are reversals of what stood here before, and both come
 * from the same argument: the character is the thing the player is watching,
 * and every pixel spent proving where the room ends is spent hiding it.
 *
 * The half-extents are the safe rect's, so the character is centred in the
 * strip of glass that is actually visible rather than in the canvas. With the
 * Hero rail open that means walking east pans the view instead of sliding the
 * character in under the panel.
 *
 * The clamp used to be hard, and its comment argued that stopping the view at
 * the wall is the ordinary ARPG read of "you are against the wall". It is --
 * right up until a corner, where a hard clamp parks the character in the
 * outermost few hundred pixels of the screen, which is precisely where the rail
 * and the HUD live. A narrow band of void past the wall is a much cheaper cost
 * than losing sight of the thing you are controlling; `CAMERA_OVERSCAN` is how
 * wide that band is.
 *
 * The "if the view is wider than the room, centre the room" branch survives
 * unchanged in spirit -- it just measures the room as the walls plus both
 * overscan bands now, so it hands over to the clamp at the point where the
 * clamp still has somewhere to move.
 */
function cameraTarget(state) {
  const anchor = state.hero || cam;
  const safe = safeRect();
  const halfW = safe.w / scale / 2;
  const halfH = safe.h / scale / 2;
  return {
    x:
      halfW * 2 >= arena.x + 2 * CAMERA_OVERSCAN
        ? arena.x / 2
        : clamp(anchor.x, halfW - CAMERA_OVERSCAN, arena.x - halfW + CAMERA_OVERSCAN),
    y:
      halfH * 2 >= arena.y + 2 * CAMERA_OVERSCAN
        ? arena.y / 2
        : clamp(anchor.y, halfH - CAMERA_OVERSCAN, arena.y - halfH + CAMERA_OVERSCAN),
  };
}

/** Presentation only, and therefore wall-clock rather than ticks -- the same
 *  convention `trail`, `corpses`, `floaters` and `callouts` follow. The
 *  exponential is what makes the follow look identical at 60 and at 144 Hz. */
function updateCamera(state, elapsed) {
  const target = cameraTarget(state);
  const k = 1 - Math.exp(-elapsed / CAMERA_TAU_MS);
  cam.x += (target.x - cam.x) * k;
  cam.y += (target.y - cam.y) * k;
}

/** No interpolation. A restart, a replacement character or a change of arena is
 *  a cut, not a pan: sliding the camera across the room would read as the view
 *  chasing something that is not there. */
function snapCamera(state) {
  cam = cameraTarget(state);
}

/**
 * Where world (0, 0) lands on the canvas, in CSS pixels: the camera as a
 * translation.
 *
 * Called from exactly two places -- `render`, which hands it to `ctx.translate`,
 * and `pointerToWorld`, which subtracts it back off. They are one matrix
 * written twice, and the cheapest way to keep two copies of a matrix from
 * drifting is to have only one. `cam` lands at the centre of the *safe* rect
 * rather than the centre of the canvas, which is what an open rail changes.
 *
 * Snapped to a whole device pixel: a fractional offset smears the grid, which
 * is drawn on half-pixel boundaries precisely so it stays crisp, and sets the
 * baked flagstones crawling as the camera eases. The snap lives here rather
 * than inside `render` so that the inverse is undone against the matrix that
 * was actually used, not against the one it was rounded from.
 */
function viewOrigin() {
  const safe = safeRect();
  return {
    x: Math.round((safe.x + safe.w / 2 - px(cam.x)) * dpr) / dpr,
    y: Math.round((safe.y + safe.h / 2 - px(cam.y)) * dpr) / dpr,
  };
}

// -------------------------------------------------------------------- input

/**
 * A click, in world units: the exact inverse of the matrix `render` sets up.
 *
 * It is the *same* matrix, read out of `viewOrigin()` rather than re-derived
 * here, and that is the whole point of the function existing. The forward
 * transform and this inverse are one thing written twice, and an inverse wrong
 * by half a rail width puts every click somewhere other than where it was made
 * -- most visibly at the screen edges, which is where the rails are.
 *
 * `getBoundingClientRect` is CSS pixels -- *not* the DPR-scaled backing store --
 * so this must divide by the rect, never by `canvas.width`. It used to read the
 * fraction across the rect and multiply by the arena, which was only correct
 * while the canvas showed the whole room and nothing else. With a camera the
 * pointer is an offset from the origin of the view; with a safe rect that
 * origin is no longer the middle of the canvas.
 *
 * Nothing is clamped here. A `Goto` is clamped into the arena by `milli`, so a
 * click out in the void parks the order against the wall exactly as a click
 * near the edge already did; the sword wants the raw bearing.
 */
function pointerToWorld(event) {
  const rect = canvas.getBoundingClientRect();
  const origin = viewOrigin();
  return {
    x: (event.clientX - rect.left - origin.x) / scale,
    y: (event.clientY - rect.top - origin.y) / scale,
  };
}

/**
 * Thousandths of a world unit, as an integer, clamped to the arena.
 *
 * The clamp is mandatory rather than tidy: an `i32` parameter arrives in wasm
 * through ToInt32, which *wraps*. A wild coordinate would not saturate, it
 * would reappear as a plausible-looking point on the other side of the world.
 */
function milli(value, limit) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(clamp(value, 0, limit) * 1000);
}

/**
 * Thousandths of a *direction* component, which is signed.
 *
 * Separate from `milli` rather than a parameter on it, because `milli` clamps
 * from zero: it exists for arena coordinates, which are never negative. Passing
 * a movement component through it silently floors every westward and northward
 * step to nothing, and the character then walks only south-east however you
 * hold the keys -- which reads as the input being ignored rather than as being
 * half-applied, and is a lot harder to see than it sounds.
 */
function milliSigned(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(clamp(value, -1, 1) * 1000);
}

function order(point) {
  wasm.set_goto(milli(point.x, arena.x), milli(point.y, arena.y));
}

function goTo(point, state) {
  intent = "goto";
  order(point);
  // The policy owns the reachability rule (a body cannot stand closer than its
  // own radius to a wall); the page only says so, rather than reimplementing
  // the collision rules in floating point on this side of the wall.
  const r = state.hero ? state.hero.radius : 0;
  // Asked of the page's own copy of the floor plan rather than reconstructed
  // from the arena box, which was the whole rule while the level *was* a box
  // and describes almost none of a carved one. Still only *hint* text -- the
  // sim decides where the character actually ends up, and this only says so.
  const unreachable = !standable(point.x, point.y, r);
  hint(
    unreachable
      ? "That point is in the rock. The character will get as close as a body can and stop."
      : `Ordered to (${point.x.toFixed(1)}, ${point.y.toFixed(1)}). It decides how to get there.`,
    unreachable
  );
}

// A drag traces a path. The waypoints live in the module -- `Sim` holds the
// queue and walks it one leg per *tick*, because one animation frame is up to
// `MAX_CATCHUP_TICKS` of catch-up and a page-side arrival test would overshoot
// a waypoint by that much on every stutter. Everything below is the gesture and
// the picture of it; nothing below decides when a leg is done.

/** How far apart the samples of a dragged path are, in world units.
 *
 *  Coarse on purpose: the waypoints are a route, not a recording. Sampling
 *  every pixel would fill `ROUTE_MAX` in a thumb's width of screen and hand the
 *  module a queue that describes one corner of the drag and nothing after it. */
const DRAG_SAMPLE = 1.2;

/** How far the pointer must get from where it pressed before a press counts as
 *  a drag rather than a click. Below this it is a tap, and a tap is the
 *  click-to-move this game has always had. */
const DRAG_THRESHOLD = 0.8;

/** Most waypoints a path may carry. Must match `ROUTE_MAX` in the module; the
 *  page trims to it so an over-long drag loses its middle rather than its end. */
const ROUTE_MAX = 24;

/** The path being traced right now, or `null`. Points are world units. */
let drag = null;

/** The path the module is walking, as the page last sent it, for drawing.
 *  Trimmed from the front as `route_len()` falls. */
let routeDrawn = [];

function beginDrag(p) {
  drag = { points: [p], from: p, at: p, far: 0 };
}

/**
 * One pointer move, folded into the gesture.
 *
 * **`far` is how far the hand ever got from where it pressed, and not the length
 * of the line it drew getting there.** Path length was the obvious version and
 * it accumulates jitter: a finger resting on a touchscreen emits a move every
 * frame with a pixel or two of noise on it, which at this zoom adds up to about
 * a world unit a second -- so a long press became a drag nobody performed, and
 * it did so on exactly the input the pointer events were adopted for. A
 * displacement cannot drift, and "how far it got from the spot" is what "never
 * left the spot" means. The running *max* rather than the current distance is
 * what keeps a gesture that loops back to its origin a drag.
 *
 * The thinning is a second, independent measurement: `DRAG_SAMPLE` off the last
 * point kept, which is what makes the samples evenly spaced along the path
 * rather than along the gesture's clock.
 */
function sampleDrag(p) {
  drag.at = p;
  drag.far = Math.max(drag.far, Math.hypot(p.x - drag.from.x, p.y - drag.from.y));
  const last = drag.points[drag.points.length - 1];
  if (Math.hypot(p.x - last.x, p.y - last.y) >= DRAG_SAMPLE) drag.points.push(p);
}

function cancelDrag() {
  drag = null;
}

function endDrag() {
  const d = drag;
  drag = null;
  if (!d) return;
  const state = parseFrame(readFrame());
  if (!state.hero) return;

  // A tap is a click. The threshold is on how far the hand got and not on the
  // point count, so a slow, shaky press that never left the spot is still a
  // click -- which is what the hand that made it meant.
  if (d.far < DRAG_THRESHOLD) {
    goTo(d.at, state);
    return;
  }

  // Where the hand actually stopped, which the thinning can have skipped: the
  // spacing is 1.2 units and the threshold 0.8, so a quick flick is a real drag
  // that ended between two samples. **The end of a path is the one point the
  // player definitely meant.** `d.at` is the very object `beginDrag` seeded
  // `points` with until a sample replaces it, so the identity test is exact
  // rather than an epsilon.
  if (d.at !== d.points[d.points.length - 1]) d.points.push(d.at);

  const path = trimPath(d.points);
  wasm.route_clear();
  for (const p of path) wasm.route_push(milli(p.x, arena.x), milli(p.y, arena.y));
  routeDrawn = path;
  intent = "goto";
  hint(`Path of ${path.length} set. It walks the legs in order and holds at the end.`);
}

/** Thins an over-long path by dropping from the middle, never the end.
 *
 *  The end is where the finger stopped, which is the one point the player
 *  definitely meant; the middle is the part of a gesture they were least
 *  precise about. Truncating instead would silently discard the destination and
 *  leave the character stopping somewhere nobody asked for. */
function trimPath(points) {
  if (points.length <= ROUTE_MAX) return points;
  const out = [];
  for (let i = 0; i < ROUTE_MAX - 1; i++) {
    out.push(points[Math.round((i * (points.length - 1)) / (ROUTE_MAX - 1))]);
  }
  out.push(points[points.length - 1]);
  return out;
}

/**
 * Stand down: hold this ground.
 *
 * Not `clear_order()`, which is a different thing entirely -- see `freeWill`.
 * Standing still is an order like any other, so it is expressed as one: a
 * `Goto` at the character's own feet, which the arrival rule satisfies
 * immediately.
 */
function standDown(state) {
  if (!state.hero) return;
  intent = "stand";
  order({ x: state.hero.x, y: state.hero.y });
  hint("Stood down. Holding this ground.");
}

/**
 * Free will: no order at all.
 *
 * `Order::Hold` means the character has been told nothing, not that it has been
 * told to stop. With nothing in sight the utility policy falls through to its
 * own search behaviour and drifts toward open ground -- the middle of an empty
 * room. That is the whole thesis of the project working in front of you: an
 * order is a rough direction, and without one the character still has its own
 * judgement.
 */
function freeWill() {
  intent = "free";
  wasm.clear_order();
  hint("Free will: no order at all. Watch it decide where to be.", true);
}

/**
 * Something to fight.
 *
 * Deliberately does not touch `intent`: a spawn is not an order, and the order
 * panel must go on describing whatever the character was last told. The page
 * chooses *what* walks in and the module chooses *where* -- a position rolled
 * here would be a float entering simulation state, and the same page would then
 * produce a different fight on every machine.
 */
function spawnMonster(kindCode, primary = SLOT_EMPTY, secondary = SLOT_EMPTY) {
  announceSpawn(bodyName(kindCode), wasm.spawn_monster(kindCode, primary, secondary));
}

/**
 * The Enemy rail's **[Spawn]**: whatever the template currently describes.
 *
 * Deliberately a second path rather than a flag on `spawnMonster`. `S` and `B`
 * still walk in a body on its own default kit, and a hotkey that quietly meant
 * something different after you touched a panel would be a worse surprise than
 * two spawn functions -- which is the same argument `spawn_from_template`'s own
 * doc comment makes on the Rust side.
 *
 * The body name is read back out of the module rather than off the dropdown,
 * for the same reason everything else on that rail is: what walked in is the
 * template the module is holding, not the one the page thinks it asked for.
 */
function spawnFromTemplate() {
  announceSpawn(bodyName(wasm.spawn_template_body()), wasm.spawn_from_template());
}

/** A body's display name, safe for a code the roster does not describe --
 *  `hero_body()` answers `SLOT_EMPTY` when there is nobody standing, and that
 *  must not index the roster. */
function bodyName(code) {
  const body = BODIES[code];
  return body ? body.name : "character";
}

function announceSpawn(name, standing) {
  if (!standing) {
    hint("The room is full. Nothing else fits.", true);
    return;
  }
  hint(
    standing === 1
      ? `A ${name} walks in. The character will notice it when it next looks.`
      : `A ${name} walks in. ${standing} monsters in the room now.`,
    true
  );
}

/**
 * A new character, into the room the last one died in.
 *
 * Not a restart. `restart()` opens a fresh room at tick zero; this leaves every
 * monster exactly where it was standing, still remembering what it was doing,
 * and drops somebody new in at the clearest spot on the floor. The module
 * refuses while a character is still up -- an order belongs to the faction, so
 * two heroes would share one click -- which is why the buttons this calls are
 * not on the page until yours has fallen.
 */
function swapInHero(kindCode, primary = SLOT_EMPTY, secondary = SLOT_EMPTY) {
  if (!wasm.swap_in_hero(kindCode, primary, secondary)) {
    hint("There is already a character in the room.", true);
    return;
  }
  // The rail describes a character that has just been replaced. Forget the
  // snapshot so the next frame re-reads body, kit and attributes rather than
  // matching its cache key against the one that fell.
  heroKey = "";
  intent = "none";
  // Everything from here down is the page's memory of the character that fell:
  // the path it walked, the path it was told to walk, and the fact that we have
  // already said it died. `bodies`, `corpses`, `floaters` and `callouts` are
  // deliberately *not* cleared -- the corpse should go on fading where it
  // dropped, and the number that killed it should finish rising off it.
  trail = [];
  // The module drops its own queue on a swap -- the dead character's path must
  // not walk the newcomer back into whatever killed it -- so a page that kept
  // the drawn copy would be drawing a route nobody is walking.
  routeDrawn = [];
  announcedFall = false;
  // The replacement drops in at the clearest spot on the floor, which can be
  // right across the room from where the last one fell. Cut to it.
  snapCamera(parseFrame(readFrame()));
  hint(`A ${bodyName(kindCode)} takes over. The monsters are where you left them.`, true);
}

/**
 * **[Re-Spawn]**, off the life globe: the body and kit the Hero rail is showing.
 *
 * Read out of the module rather than off the page's cache. The rail is editable
 * with the character down -- body, kit and every attribute -- and all of it
 * lands on the module's plan for the next spawn, so the module is where the
 * answer is. The page's own snapshot would be a second copy of it, and the copy
 * would be the stale one exactly when the player had just changed their mind.
 *
 * The attributes are not passed here and do not need to be: `swap_in_hero` takes
 * the sheet off the same plan. Which is the whole point -- a stat sheet is not
 * something the player should have to re-enter because something killed them.
 */
function respawnHero() {
  const body = wasm.hero_body();
  swapInHero(BODIES[body] ? body : BODY_FIGHTER, wasm.hero_loadout(0), wasm.hero_loadout(1));
}

function restart() {
  wasm.init(SEED);
  intent = "none";
  trail = [];
  // The path, both halves of it. `init` carves a new level, so a drag still
  // under the hand describes a floor plan that no longer exists -- letting it
  // release onto the new one would order a walk along a corridor the player
  // traced somewhere else. Same argument as `held.clear()` below.
  cancelDrag();
  routeDrawn = [];
  bodies = new Map();
  corpses = [];
  // A fresh room at tick zero: a number still climbing off a body that no
  // longer exists would be the page remembering a fight the sim has forgotten.
  floaters = [];
  callouts = [];
  announcedFall = false;
  orderKey = "";
  orderAcknowledged = false;
  // `init` builds a fresh `Sim`, which starts with both sides on the baseline
  // and nothing under manual control. The page has to agree, or its dropdowns
  // and toggles describe a module that no longer exists.
  held.clear();
  controlMask = 0;
  updateControlButtons();
  syncBehaviourPanel();
  // Both rails describe module state that `init` has just rebuilt -- a fresh
  // hero and a fresh spawn template. Drop the cache keys so the next read is a
  // real read rather than a match against a room that no longer exists.
  heroKey = "";
  enemyKey = "";
  heroCache = null;
  syncEnemyRail();
  // `init` carves a fresh level, so the baked paths describe one that no longer
  // exists. The loop's revision check would catch it on the next frame anyway;
  // doing it here means the first frame after a restart is already right -- and
  // that now includes the fog, which `init` has just cleared. `rebuildLevelPaths`
  // reads the visibility bytes itself for exactly this reason.
  //
  // `viewMode` is deliberately not reset. It is a preference about the page, and
  // a restart is about the room.
  rebuildLevelPaths(readMap(), wasm.map_revision());
  snapCamera(parseFrame(readFrame()));
  hint("Back to the first floor, at tick 0.");
}

/** Points the panel at whatever the module currently believes. */
function syncBehaviourPanel() {
  for (const side of [SIDE_HEROES, SIDE_MONSTERS]) {
    const select = document.getElementById(side === SIDE_HEROES ? "policy-heroes" : "policy-monsters");
    if (select) select.value = String(wasm.policy_kind(side));
    buildSliders(side);
  }
}

// ------------------------------------------------------------------ control
//
// Three independent thirds. Steering a swordsman, choosing what it holds and
// swinging the thing are different skills, and any of them can be handed over
// without the others -- which is most of what makes this page teach anything
// about the fight.

/** Which halves the player holds, mirrored so the page can label its toggles
 *  without asking wasm every frame. `wasm.control()` remains the truth. */
let controlMask = 0;

/** Keys currently held, for the feet. */
const held = new Set();

/** Where the pointer last was, in world units, for the sword. */
let pointer = { x: 0, y: 0, inside: false };

/** Which loadout slot the player is asking for, `0` or `1`.
 *
 *  A *request*, on exactly the same terms a policy's is: the sim honours it only
 *  when the limb is at guard and the slot is filled. The page shows what the sim
 *  actually did rather than what was asked for, which is why the chip reads off
 *  the frame and not off this. */
let wantSlot = 0;

/** Whether the attack button is down.
 *
 *  A button and not a bearing, which is the whole shape of the swing model: the
 *  pointer says where to cut, this says when, and the sim owns everything in
 *  between -- the windup, the arc, the extension, the recovery.
 *
 *  Releasing matters as much as pressing. An attack starts only on a press that
 *  follows a release, so holding this down throws exactly one cut and then
 *  waits. That is deliberate: the alternative is a blade that chains attacks
 *  back to back forever, which is the windmill this model exists to end. */
let striking = false;

/**
 * The three halves of a character you can take, one switch each.
 *
 * **Independent, and that took a change on the other side of the wall.** These
 * were five exclusive presets for one reason: `set_control` folded `LIMB` into
 * `LIMB | SLOT`, so of the eight combinations three did not exist and two of
 * them silently became a neighbour when pressed. A switch that lights itself is
 * worse than no switch, so the page stopped offering them.
 *
 * The module no longer folds anything, and the combination that fold existed to
 * prevent is now a mode worth having: **Aim** without **Action** hands you the
 * cuts and leaves the choice of weapon to the character -- which, since the
 * hero's default mind has a per-action opinion, is something to watch rather
 * than a bug.
 *
 * One table: the label, the bit, the key and the sentence the hint prints.
 * Splitting those apart is how a switch ends up saying one thing and doing
 * another.
 */
const CONTROL_TOGGLES = [
  {
    bit: CONTROL_FEET,
    label: "Movement",
    key: "C",
    on: "You have the feet. WASD to move; the character fights for itself.",
    off: "The feet are the character's again.",
  },
  {
    bit: CONTROL_SLOT,
    label: "Action",
    key: "V",
    on: "You choose what to hold with 1 and 2; the character decides when to use it.",
    off: "The character chooses what to hold again.",
  },
  {
    bit: CONTROL_LIMB,
    label: "Aim",
    key: "X",
    on: "You have the attack. Aim with the mouse and click to cut -- one click, one attack.",
    off: "The character aims and swings for itself again.",
  },
];

function setControl(mask) {
  wasm.set_control(mask & (CONTROL_FEET | CONTROL_LIMB | CONTROL_SLOT));
  // Read it back rather than storing what was asked for. The module has stopped
  // normalising, so today the two agree -- and the discipline stays, because
  // the day it starts again is the day a switch would otherwise start lying.
  controlMask = wasm.control();
  if (controlMask & CONTROL_FEET) intent = "manual";
  updateControlButtons();
}

/** One switch, flipped. The hint names what actually changed rather than
 *  reciting the whole mask, because the player pressed one thing. */
function toggleControl(bit) {
  const taking = !(controlMask & bit);
  setControl(taking ? controlMask | bit : controlMask & ~bit);
  const toggle = CONTROL_TOGGLES.find((t) => t.bit === bit);
  // Off the read-back, never off `taking`: a switch reporting "you have the
  // feet" for a bit the module declined would be the page describing a room it
  // is not in. And with nothing left held there is nothing to say about the
  // handover, so it goes back to saying what the floor is for.
  if (!controlMask) hint(DEFAULT_HINT);
  else if (toggle) hint(controlMask & bit ? toggle.on : toggle.off);
}

/** Builds the switches out of `CONTROL_TOGGLES`. Called once, at boot: the
 *  labels live in one place and the page reads them from there rather than the
 *  markup keeping a second copy. */
function buildControlGroup() {
  const host = document.getElementById("control-group");
  if (!host) return;
  host.replaceChildren();
  CONTROL_TOGGLES.forEach((toggle, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "seg";
    button.id = `btn-control-${index}`;
    // `switch`, not `radio`: three of these can be on at once, and a screen
    // reader told otherwise would announce a group that cannot exist.
    button.setAttribute("role", "switch");
    button.setAttribute("aria-checked", "false");
    const name = document.createElement("span");
    name.textContent = toggle.label;
    const key = document.createElement("kbd");
    key.textContent = toggle.key;
    button.append(name, key);
    button.addEventListener("click", () => {
      if (!dead) toggleControl(toggle.bit);
    });
    host.append(button);
  });
}

/** Lights each switch from `wasm.control()`. Never from what was asked for. */
function updateControlButtons() {
  CONTROL_TOGGLES.forEach((toggle, index) => {
    const button = document.getElementById(`btn-control-${index}`);
    if (button) button.setAttribute("aria-checked", String(Boolean(controlMask & toggle.bit)));
  });
}

// --------------------------------------------------- how the room is drawn
//
// Three modes, and they exist because they answer three different questions:
// what does this look like, what is actually happening, and what is the machine
// doing.

/**
 * The views, as one table: the label, the two booleans every draw call actually
 * reads, whether the tick strip is open, and the sentence pressing it prints.
 *
 * Reduced to two booleans the moment it is read. **Keeping the mode itself out
 * of the draw calls is what stops this becoming three renderers** -- every
 * drawing function asks "is the art on" or "is the fog on", never "which mode is
 * this", so a fourth mode later is a row in this table and nothing else.
 *
 * The hint lives in the row for the reason `CONTROL_TOGGLES` keeps its two
 * sentences: a label on screen and the line under it written in two different
 * places is how one of them ends up describing a mode that no longer exists.
 */
const VIEW_MODES = [
  {
    id: "regular",
    label: "Regular",
    art: true,
    fog: true,
    dev: false,
    hint: "The room as it looks, lit only where the character can see.",
  },
  {
    id: "tactical",
    label: "Tactical",
    art: false,
    fog: true,
    dev: false,
    hint: "Art off, every readout on -- a disc, a facing wedge, and the same fog.",
  },
  {
    id: "dev",
    label: "Dev",
    art: false,
    fog: false,
    dev: true,
    hint: "No fog at all: every body drawn wherever it is, and the tick strip open.",
  },
];

/** Which one is showing.
 *
 *  **Survives a `restart` and a descent**, deliberately: how a player wants the
 *  room drawn is a preference about the page, not state belonging to the run. */
let viewMode = "regular";

/** The row, never the id.
 *
 *  Named `currentView` and not `view` because `view` is already the
 *  `Float32Array` over the frame buffer -- two `let`s of the same name in one
 *  top-level scope is a `SyntaxError`, and the page would not boot at all. */
const currentView = () => VIEW_MODES.find((m) => m.id === viewMode) || VIEW_MODES[0];
const artOn = () => currentView().art;
const fogOn = () => currentView().fog;

/**
 * Whether the player can see this body.
 *
 * `[dev]` shows everything, which means **ignoring the column rather than asking
 * the module for a different answer**: the frame describes what the *player* can
 * see, and dev mode is a page that has chosen not to care.
 *
 * The column cannot be leaned on by itself for that. It reports every row
 * visible only when there is no hero standing -- a fog of war with nobody to be
 * fogged from is just a blank screen -- so `[dev]` with a character on the floor
 * would otherwise fade half the room out.
 */
function canSee(unit) {
  return !fogOn() || unit.visible;
}

/**
 * Shows the room a different way.
 *
 * Everything that has to agree about the mode is written here: the lit segment,
 * the tick strip, the baked paths, and the hint.
 */
function setViewMode(id) {
  const mode = VIEW_MODES.find((m) => m.id === id);
  if (!mode) return;
  viewMode = mode.id;
  updateViewButtons();
  // `[dev]` opening the tick strip is what replaced the chevron that used to sit
  // beside it. Two controls both called "dev" is one too many, and this is the
  // same intent stated once.
  const strip = document.getElementById("dev-strip");
  if (strip) strip.classList.toggle("open", mode.dev);
  // Both flags change what gets baked -- `fog` decides which of the five paths a
  // tile lands in, `art` decides whether the lit rock faces are built at all --
  // so the paths are rebuilt here.
  //
  // **Not by setting `levelPaths.revision = -1`.** The loop's revision-mismatch
  // branch is the *descend cut*: it also drops the trail, the bodies, the
  // corpses, the floaters and the route, snaps the camera and announces a new
  // floor. Pressing `G` on floor three would do every bit of that for a change
  // of palette. Calling the rebuild directly is what `restart` already does, and
  // it has the same second benefit -- the frame after the keypress is already
  // right rather than one frame late.
  rebuildLevelPaths(readMap(), wasm.map_revision());
  hint(mode.hint);
}

/** `G`. One key that steps through the list is why the group is a radiogroup and
 *  not three switches: there is nothing here to combine. */
function cycleViewMode() {
  const at = VIEW_MODES.findIndex((m) => m.id === viewMode);
  setViewMode(VIEW_MODES[(at + 1) % VIEW_MODES.length].id);
}

/**
 * Builds the selector out of `VIEW_MODES`, the way `buildControlGroup` builds
 * the switches: the labels live in one table and the markup reads them from
 * there rather than keeping a second copy.
 *
 * A genuine `radiogroup`, unlike the driving switches. That group's own comment
 * argues that three independent bits must **not** announce as one, and this is
 * the counter-example that makes the distinction worth stating: exactly one view
 * is ever lit, which is the single thing a radiogroup is for.
 */
function buildViewGroup() {
  const host = document.getElementById("view-group");
  if (!host) return;
  host.replaceChildren();
  VIEW_MODES.forEach((mode, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "seg";
    button.id = `btn-view-${index}`;
    button.setAttribute("role", "radio");
    button.setAttribute("aria-checked", "false");
    // The key named once, in a tooltip, rather than as a `kbd` badge per segment
    // like the switches carry. `G` cycles the whole group, so three badges
    // reading `G` would each be claiming that pressing it lands on *that* row.
    button.title = `${mode.label} -- G cycles the three`;
    button.textContent = mode.label;
    button.addEventListener("click", () => {
      if (!dead) setViewMode(mode.id);
    });
    host.append(button);
  });

  // One tab stop for the whole group, with the arrows moving inside it. That is
  // the radiogroup contract, and it is also why this listener is not optional:
  // `updateViewButtons` writes a roving `tabIndex`, and a roving tab stop with
  // no arrow keys behind it would leave two of the three unreachable from the
  // keyboard -- which is a worse page than the wrong ARIA role.
  const ARROW = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
  host.addEventListener("keydown", (event) => {
    const step = ARROW[event.key] || 0;
    if (!step || dead) return;
    event.preventDefault();
    const at = VIEW_MODES.findIndex((m) => m.id === viewMode);
    const next = (at + step + VIEW_MODES.length) % VIEW_MODES.length;
    setViewMode(VIEW_MODES[next].id);
    const button = document.getElementById(`btn-view-${next}`);
    if (button) button.focus();
  });
}

/** Lights the one segment that is showing, and moves the group's single tab stop
 *  with it. */
function updateViewButtons() {
  VIEW_MODES.forEach((mode, index) => {
    const button = document.getElementById(`btn-view-${index}`);
    if (!button) return;
    const on = mode.id === viewMode;
    button.setAttribute("aria-checked", String(on));
    button.tabIndex = on ? 0 : -1;
  });
}

/**
 * Pushes the player's live input across, once per frame.
 *
 * Everything crosses as integers -- thousandths for the vectors, a raw binary
 * angle for the aim -- for the same reason a click does: no float has any
 * business on the inward side of that wall.
 */
function pushInput(state) {
  if (!controlMask) return;
  let mx = 0;
  let my = 0;
  if (held.has("a")) mx -= 1;
  if (held.has("d")) mx += 1;
  // Screen y grows downward and world y grows downward with it, so "w" is -y.
  if (held.has("w")) my -= 1;
  if (held.has("s")) my += 1;
  const len = Math.hypot(mx, my);
  if (len > 1) {
    mx /= len;
    my /= len;
  }

  // Aim: the bearing from the character to the pointer. For the sword that is
  // the *line* a cut is thrown through and nothing else -- how far the blade
  // extends belongs to the attack now, not to the mouse. Distance from the
  // character still means something while the shield modifier is held, where
  // pulling in drops the guard and pushing out braces it.
  let aim = 0;
  let reach = 0;
  if (state.hero && pointer.inside) {
    const dx = pointer.x - state.hero.x;
    const dy = pointer.y - state.hero.y;
    aim = Math.round((Math.atan2(dy, dx) / TAU) * 65536) & 0xffff;
    const full = state.hero.radius + state.hero.actionLength;
    reach = clamp(Math.hypot(dx, dy) / Math.max(full, 0.001), 0, 1);
  }

  wasm.set_input(
    milliSigned(mx),
    milliSigned(my),
    aim,
    Math.round(clamp(reach, 0, 1) * 1000),
    wantSlot,
    // The side is left to the sim. Picking it is a real decision -- a cut from
    // the flank a guard is not on is much harder to answer -- but it is a
    // decision that wants its own control, and one the page does not have a
    // spare button for yet.
    striking ? STRIKE_NEAREST : STRIKE_NONE
  );
}

function bindInput() {
  // Pointer events and not mouse events, all four of them. A drag has to work
  // with a finger as well as a mouse, and one code path for mouse, pen and
  // touch is the only version of that which cannot grow a gesture that works
  // with one and not the others. `#arena` already carries `touch-action: none`,
  // so nothing in the browser fights the drag for the same swipe.
  canvas.addEventListener("pointerdown", (event) => {
    if (dead) return;
    const state = parseFrame(readFrame());
    if (!state.hero) {
      hint("There is nobody left to give orders to. Send in a new character, or press R.", true);
      return;
    }
    if (event.button === 2) {
      event.preventDefault();
      standDown(state);
      return;
    }
    if (event.button !== 0) return;

    // Capture on the canvas so a drag that leaves it still tracks -- and so the
    // matching `pointerup` arrives here rather than on whatever the finger
    // happened to be over when it lifted.
    canvas.setPointerCapture(event.pointerId);

    // Under manual sword control a press is a *cut*, not an order: the pointer
    // is already saying where every tick, and a `Goto` on top of it would fight
    // the feet the player may also be holding.
    if (controlMask & CONTROL_LIMB) {
      striking = true;
      return;
    }
    beginDrag(pointerToWorld(event));
  });

  canvas.addEventListener("pointermove", (event) => {
    const p = pointerToWorld(event);
    pointer = { x: p.x, y: p.y, inside: true };
    if (drag) sampleDrag(p);
  });

  // Release on the window rather than the canvas, and unconditionally. A button
  // released off-canvas or after control was handed back would otherwise stay
  // logically down, and a held attack button is a hand that never re-arms --
  // one cut and then a swordsman standing there for the rest of the fight.
  window.addEventListener("pointerup", (event) => {
    if (event.button !== 0) return;
    striking = false;
    endDrag();
  });
  // A cancelled pointer is the gesture being taken away rather than finished --
  // the browser starting a scroll, a palm arriving, the pen leaving range -- so
  // the path it was tracing is dropped instead of ordered. `pointerup` does not
  // follow one, which is why this is a listener and not a flag on that one.
  window.addEventListener("pointercancel", () => {
    striking = false;
    cancelDrag();
  });
  // One `blur` for all three, and there were two of these a moment ago -- one
  // per thing that had to be let go of. A second listener is how the third one
  // gets forgotten.
  window.addEventListener("blur", () => {
    striking = false;
    cancelDrag();
    held.clear();
  });

  // `pointerleave` fires on a touch lift as well as on a mouse leaving the
  // canvas, which would blank the manual-aim pointer at the end of every
  // gesture on a phone; `CONTROL_LIMB` is a keyboard-and-mouse affordance
  // today, so the type guard keeps this about the mouse it is written for.
  //
  // **The capture test is the load-bearing half.** Chromium fires a spurious
  // leave/enter pair around `setPointerCapture`, so without it a press that
  // does not move would blank the aim for as long as the hand held still --
  // aiming a cut at bearing zero, which is nothing the player did. Asking
  // whether we still hold this pointer is exactly that case, and it is also
  // true for the whole of a drag that genuinely left the canvas, which is when
  // the aim most wants to go on working.
  canvas.addEventListener("pointerleave", (event) => {
    if (event.pointerType !== "mouse") return;
    if (canvas.hasPointerCapture(event.pointerId)) return;
    pointer.inside = false;
  });

  // `passive: false` is what makes `preventDefault` allowed here; without it
  // the browser scrolls the page instead, and the page has nowhere to scroll.
  canvas.addEventListener(
    "wheel",
    (event) => {
      if (dead) return;
      event.preventDefault();
      // Exponential, so a notch is the same proportional change wherever you
      // are in the range. `resize` re-clamps and writes the result back.
      zoom *= Math.exp(-event.deltaY * 0.0015);
      resize();
    },
    { passive: false }
  );

  canvas.addEventListener("contextmenu", (event) => event.preventDefault());

  window.addEventListener("keyup", (event) => {
    held.delete(event.key.toLowerCase());
  });

  window.addEventListener("keydown", (event) => {
    if (dead || event.metaKey || event.ctrlKey || event.altKey) return;
    const key = event.key.toLowerCase();

    // `Tab` is the browser's again. It used to be the drawer, taken off the
    // browser before it could move focus; with two rails there is no single
    // panel for it to mean, and the thing it does natively -- walk the controls
    // that are actually on screen -- is exactly what the rails' `visibility`
    // handling exists to make correct. Q and E open them instead.

    // A focused slider or dropdown is typing, not playing. Without this, `S` in
    // a gene slider spawns a skitterer and the arrow keys do two things at
    // once -- and with two rails full of sliders this matters more than it did
    // with one drawer, not less.
    if (event.target instanceof Element && event.target.closest("input, select, textarea")) {
      if (event.key === "Escape") event.target.blur();
      return;
    }

    // WASD is only movement while the player holds the feet; otherwise "s" is
    // still the spawn key it has always been.
    if (controlMask & CONTROL_FEET && "wasd".includes(key)) {
      held.add(key);
      event.preventDefault();
      return;
    }
    if (event.key === "Escape") {
      // Whatever is open, outermost first. Escape means "back out of the thing
      // that is open", and standing the character down while a panel is
      // covering a third of the room is not what the player was asking for.
      if (keysOverlayOpen()) setKeysOverlay(false);
      else if (railOpen("hero")) setRail("hero", false);
      else if (railOpen("enemy")) setRail("enemy", false);
      else standDown(parseFrame(readFrame()));
    } else if (event.key === "?") {
      setKeysOverlay(!keysOverlayOpen());
    } else if (key === "f") {
      freeWill();
    } else if (key === "r") {
      restart();
    } else if (key === "c" || key === "v" || key === "x") {
      // One key per switch, back from the cycle-through-five-presets the
      // exclusive group needed. Three independent things want three
      // independent keys -- see `CONTROL_TOGGLES`, which is where the pairing
      // lives so the key and the label on screen cannot drift apart.
      const toggle = CONTROL_TOGGLES.find((t) => t.key.toLowerCase() === key);
      if (toggle && !event.repeat) toggleControl(toggle.bit);
    } else if (key === "q") {
      if (!event.repeat) setRail("enemy", !railOpen("enemy"));
    } else if (key === "e") {
      if (!event.repeat) setRail("hero", !railOpen("hero"));
    } else if (key === "s" || key === "b") {
      // The repeat guard is load-bearing rather than polite: held down, the
      // operating system's autorepeat would empty the frame's 64-row budget
      // into the room in about two seconds.
      if (!event.repeat) spawnMonster(key === "s" ? BODY_SKITTERER : BODY_BRUTE);
    } else if (key === "1" || key === "2") {
      // 1 and 2 choose what is in the hand rather than which body walks in.
      if (!event.repeat) selectSlot(key === "1" ? 0 : 1);
    } else if (key === "y") {
      // The vision discs. A view toggle rather than a control -- it changes
      // what the page shows and nothing about what the sim does, which is why
      // it does not go anywhere near `set_control`.
      if (!event.repeat) setVisionVisible(!visionShown());
    } else if (key === "g") {
      // The repeat guard is load-bearing rather than polite, like `s` and `b`
      // above: held down, the operating system's autorepeat would thrash the mode
      // and re-bake the level's five paths dozens of times a second.
      if (!event.repeat) cycleViewMode();
    } else if (event.key === " ") {
      // `preventDefault` is mandatory, not tidy: Space activates whatever button
      // holds focus, so without it a pause pressed after clicking any chip would
      // re-fire that chip instead. The typing guard above is the escape hatch --
      // Space in a slider is still a slider.
      event.preventDefault();
      if (!event.repeat) setPaused(!isPaused());
    }
  });

  for (const which of ["enemy", "hero"]) {
    const tab = RAILS[which].querySelector(".rail-tab");
    if (tab) tab.addEventListener("click", () => setRail(which, !railOpen(which)));
  }

  const keysButton = document.getElementById("btn-keys");
  if (keysButton) keysButton.addEventListener("click", () => setKeysOverlay(!keysOverlayOpen()));
  const keysClose = document.getElementById("btn-keys-close");
  if (keysClose) keysClose.addEventListener("click", () => setKeysOverlay(false));
  // The scrim, not the card: clicking the sheet of glass round a modal is how
  // everybody shuts one, and the card stops the click reaching here.
  overlayKeys.addEventListener("click", (event) => {
    if (event.target === overlayKeys) setKeysOverlay(false);
  });

  // The chevron that used to expand the dev strip is gone, and nothing replaced
  // its listener: `setViewMode` drives `dev-strip.classList.toggle("open", …)`
  // instead, so choosing `[dev]` and opening the strip are one act rather than
  // two controls both called "dev".

  document.getElementById("btn-standdown").addEventListener("click", () => {
    if (!dead) standDown(parseFrame(readFrame()));
  });
  document.getElementById("btn-freewill").addEventListener("click", () => {
    if (!dead) freeWill();
  });
  el.respawn.addEventListener("click", () => {
    if (!dead) respawnHero();
  });
  el.pause.addEventListener("click", () => {
    if (!dead) setPaused(!isPaused());
  });

  bindActionBar();
  bindHeroRail();
  bindEnemyRail();
  bindBehaviour();
}

// ---------------------------------------------------------------- behaviour
//
// A dropdown and a rack of sliders per side. The labels and ranges are read out
// of wasm rather than mirrored here, because a mirrored list rots: rename a
// gene in Rust and a mirror keeps confidently labelling the old one.

/** Reads a knob's name out of linear memory. */
const decoder = new TextDecoder();

function labelOf(side, index) {
  const ptr = wasm.policy_label_ptr(side, index);
  const len = wasm.policy_label_len(side, index);
  if (!ptr || !len) return "";
  return decoder.decode(new Uint8Array(memory.buffer, ptr, len));
}

// ------------------------------------------------------- loadout and spawn

/** Fills a `<select>` with the playable actions. `allowEmpty` adds the "none"
 *  row, which is how a fighter is given one thing and no way to change its
 *  mind. */
function fillActionSelect(select, allowEmpty) {
  select.replaceChildren();
  if (allowEmpty) {
    const none = document.createElement("option");
    none.value = String(SLOT_EMPTY);
    none.textContent = "— none —";
    select.append(none);
  }
  for (const action of ACTIONS) {
    const option = document.createElement("option");
    option.value = String(action.code);
    option.textContent = action.name;
    select.append(option);
  }
}

/** Fills a `<select>` with the bodies. */
function fillBodySelect(select) {
  select.replaceChildren();
  for (const body of BODIES) {
    const option = document.createElement("option");
    option.value = String(body.code);
    option.textContent = body.name;
    select.append(option);
  }
}

/** Drops one of session 3's 24x24 glyphs into an inline `<svg>` beside a
 *  dropdown. Filled, never stroked -- every path in `ICON_PATHS` is a closed
 *  outline, and a stroke-designed glyph renders as a blob under `fill`.
 *  An empty slot gets no glyph at all rather than a stand-in. */
function setKitIcon(select, code) {
  const path = select.parentElement && select.parentElement.querySelector(".kit-icon path");
  if (path) path.setAttribute("d", code === SLOT_EMPTY ? "" : iconPath(code));
}

// ------------------------------------------------------------- the two rails
//
// Left is a monster that has not arrived yet; right is the character on the
// floor. Both follow the same three steps and it is not optional:
//
//   1. write across (`set_hero_stat`, `set_spawn_template_body`, ...);
//   2. **read the value back** from the paired getter;
//   3. render from what came back.
//
// The module clamps, normalises and sometimes refuses outright, so a panel that
// rendered its own request would be showing the player a lie -- the same failure
// `setControl` has always guarded against. In practice that means every handler
// below writes and then drops its rail's cache key, and the next frame does a
// real read: a *refused* write leaves the key unchanged, so without the drop the
// dropdown would sit there showing a weapon the character never took.
//
// And rebuilt on change, never per frame: the racks and menus are built once and
// the syncs below move values, so a rail full of sliders is a string compare a
// frame rather than sixty DOM rebuilds a second.

/**
 * The five attributes, in the module's own selector order.
 *
 * `0` power, `1` agility, `2` intellect, `3` perception, `4` vitality -- shared
 * by `body_stat`, `hero_stat` and `spawn_template_stat`, which is why one table
 * drives both rails. An unknown selector is *refused* on the Rust side rather
 * than quietly writing power, so an off-by-one here fails loudly.
 */
const ATTRIBUTES = [
  { stat: 0, name: "power" },
  { stat: 1, name: "agility" },
  { stat: 2, name: "intellect" },
  { stat: 3, name: "perception" },
  { stat: 4, name: "vitality" },
];

/**
 * The attribute ceiling, **discovered rather than mirrored**.
 *
 * There is no export for `MAX_ATTRIBUTE`, and a `20` written here would be
 * exactly the sort of hand-copied constant the post-mortem above `BODIES` is
 * about: raise it in Rust and every slider on this page silently stops half a
 * dial short. So the module is asked instead. The spawn template is page-facing
 * configuration and not simulation state -- `set_spawn_template_stat` does not
 * even publish a frame -- so it can be pushed past any plausible ceiling, read
 * back, and put straight back the way it was found.
 */
function probeMaxAttribute() {
  const keep = wasm.spawn_template_stat(0);
  wasm.set_spawn_template_stat(0, 1000000);
  const max = wasm.spawn_template_stat(0);
  wasm.set_spawn_template_stat(0, keep);
  return max > 0 ? max : 20;
}

let maxAttribute = 20;

/** Builds one rack of five sliders. `onInput` gets the module's selector and the
 *  value asked for; what happens after that is the rail's business. */
function buildAttrRack(host, onInput) {
  host.replaceChildren();
  return ATTRIBUTES.map((attr) => {
    const row = document.createElement("div");
    row.className = "attr";

    const name = document.createElement("span");
    name.className = "attr-name";
    name.textContent = attr.name;

    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = "0";
    slider.max = String(maxAttribute);
    slider.step = "1";
    slider.value = "0";
    slider.setAttribute("aria-label", attr.name);

    const value = document.createElement("span");
    value.className = "attr-value";

    const effect = document.createElement("span");
    effect.className = "attr-effect";

    slider.addEventListener("input", () => onInput(attr.stat, Number(slider.value) | 0));

    row.append(name, slider, value, effect);
    host.append(row);
    return { stat: attr.stat, row, slider, value, effect };
  });
}

/** What an attribute *does*, for the line under its track. The derived readouts
 *  are the point of the Hero rail: an attribute that only ever showed a number
 *  would be a difficulty dial, which is the one thing this project claims it is
 *  not. `sight` is handed in rather than derived -- see `derived()`. */
function attrEffect(stat, d, sight) {
  switch (stat) {
    case 0:
      return `×${d.powerMultiplier.toFixed(2)} on impact speed`;
    case 1:
      return `${(d.moveSpeed * TICKS_PER_SECOND).toFixed(2)} units/s · ×${d.cadence.toFixed(2)} on every phase clock`;
    case 2:
      return `decides every ${d.decisionPeriod} ticks (${(d.decisionPeriod / TICKS_PER_SECOND).toFixed(2)} s)`;
    case 3:
      return `sees ${sight.toFixed(1)} units, ±${d.noise.toFixed(1)} error at range`;
    case 4:
      return `${d.maxHp} max hp`;
    default:
      return "";
  }
}

/** The five numbers as `derived()` wants them. */
function attrObject(values) {
  return {
    power: values[0],
    agility: values[1],
    intellect: values[2],
    perception: values[3],
    vitality: values[4],
  };
}

let heroRack = [];
let enemyRack = [];

/** The Hero rail's last honest read of the module, and the key that says
 *  whether anything moved.
 *
 *  No longer frozen when the character falls. The getters answer out of the
 *  module's plan for the next spawn once there is nobody standing, so there is
 *  still something true to read every frame -- and the player can still move it,
 *  which a frozen snapshot could not have shown. **[Re-Spawn]** asks the module
 *  directly rather than reading this. */
let heroKey = "";
let heroCache = null;
let lastHeroSight = 0;

let enemyKey = "";

/** Builds both rails out of the registry. Called once, after the tables have
 *  been read across and after the attribute ceiling has been asked for. */
function buildRails() {
  fillBodySelect(el.heroBody);
  fillActionSelect(el.loadout0, false);
  fillActionSelect(el.loadout1, true);
  heroRack = buildAttrRack(el.heroAttrs, (stat, value) => {
    wasm.set_hero_stat(stat, value);
    heroKey = "";
  });
  buildKitReadout();

  fillBodySelect(el.enemyBody);
  // Slot 0 has no "none" row: `Loadout::set` refuses to empty it, because a
  // fighter holding nothing has no rule to run.
  fillActionSelect(el.enemySlot0, false);
  fillActionSelect(el.enemySlot1, true);
  enemyRack = buildAttrRack(el.enemyAttrs, (stat, value) => {
    wasm.set_spawn_template_stat(stat, value);
    enemyKey = "";
    syncEnemyRail();
  });
  syncEnemyRail();
}

// ------------------------------------------------------------- the Hero rail

/**
 * Reads the hero's body, kit and attributes back and repaints if any moved.
 *
 * The attributes come from `hero_stat`, **not** from `BODIES[kind]`. That was
 * the body's baseline, and the moment a slider on this rail can move it the two
 * stop agreeing -- a panel reading the baseline would go on describing a
 * character that no longer exists, which is the exact failure the post-mortem
 * above `BODIES` records.
 *
 * `sight` is the one number taken off the frame instead: it is a body's own
 * column, and `derived()` no longer computes it because a formula copied into
 * this file would be describing a perception the player has since moved.
 *
 * **It reads and repaints while the character is dead, too.** Those getters
 * answer out of the module's plan for the next spawn once there is nobody
 * standing, so the rail goes on describing something real -- and the something
 * is exactly what the player is deciding about at that moment. This used to
 * freeze on the last live read and grey every row out, which put the panel
 * out of action at the one point in the session it had a decision to offer.
 *
 * Aliveness is off the *frame* rather than off `hero_body()`. The module used
 * to answer `SLOT_EMPTY` there and the page took that as its death signal; the
 * frame's own hero row is the same fact from the source the renderer is already
 * drawing, so there is one answer to the question instead of two.
 */
function syncHeroRail(state) {
  const alive = state.hero !== null;
  const body = wasm.hero_body();
  if (body !== SLOT_EMPTY) {
    const slots = [wasm.hero_loadout(0), wasm.hero_loadout(1)];
    const attrs = ATTRIBUTES.map((attr) => wasm.hero_stat(attr.stat));
    // A standing body's own sight column, or the archetype's while there is no
    // body -- a plan has no sight range until somebody is wearing it.
    lastHeroSight = state.hero ? state.hero.sight : BODIES[body] ? BODIES[body].sight : 0;
    const key = `${body}|${slots.join(",")}|${attrs.join(",")}|${lastHeroSight.toFixed(2)}|${alive}`;
    if (key !== heroKey) {
      heroKey = key;
      heroCache = { body, slots, attrs, alive, d: derived(attrObject(attrs)) };
      renderHeroRail();
    }
  }
  setHeroRailLive(alive);
  return heroCache ? heroCache.d : derived(attrObject(ATTRIBUTES.map(() => 6)));
}

function renderHeroRail() {
  const { body, slots, attrs, d } = heroCache;
  // Written unconditionally, including over a focused select: this is the
  // read-back, and the whole reason it exists is to be visible when the module
  // refused or clamped what the player asked for.
  el.heroBody.value = String(body);
  el.loadout0.value = String(slots[0]);
  el.loadout1.value = String(slots[1]);
  setKitIcon(el.loadout0, slots[0]);
  setKitIcon(el.loadout1, slots[1]);
  heroRack.forEach((row, i) => {
    row.slider.value = String(attrs[i]);
    setText(row.value, String(attrs[i]));
    setText(row.effect, attrEffect(row.stat, d, lastHeroSight));
  });
  setText(el.unitName, bodyName(body));
}

/** Says which character the rail is describing.
 *
 *  Nothing is disabled any more, and that is the change rather than an
 *  oversight: every row here now writes the module's plan for the next spawn as
 *  well as the body in the room, so with the character dead all three of them
 *  still do something -- they configure who comes back. Greying them out was
 *  correct while `set_hero_stat` answered `0` with nobody standing, and became
 *  a lie the moment it stopped.
 *
 *  What is left is the heading, which has to say *which* fighter is being
 *  described, or the panel is ambiguous in the one state where the answer
 *  matters. */
function setHeroRailLive(alive) {
  el.heroRailNote.classList.toggle("pending", !alive);
  setText(
    el.heroRailNote,
    alive
      ? "Every row here lands on the character standing in the room, immediately — body, kit and attributes alike. Nothing here waits for a respawn."
      : "Nobody is standing. Every row here describes the character you send in next — it keeps what you set, so the sheet is yours rather than the archetype's."
  );
}

/** The three lines under the kit: what is in the hand, what phase it is in, and
 *  what is stowed. Built once and rewritten in place -- `swingLeft` counts down
 *  every tick, and rebuilding a `dl` sixty times a second for that would be the
 *  pattern `fillStatsIfChanged` exists to avoid. */
let kitReadout = null;

function buildKitReadout() {
  el.loadoutReadout.replaceChildren();
  const rows = {};
  for (const name of ["in hand", "phase", "costs", "stowed"]) {
    const dt = document.createElement("dt");
    dt.textContent = name;
    const dd = document.createElement("dd");
    dd.textContent = "—";
    el.loadoutReadout.append(dt, dd);
    rows[name] = dd;
  }
  kitReadout = rows;
}

const SWING_NAMES = ["guard", "windup", "strike", "recover", "swap"];

/**
 * What the thing in hand costs **on this body**.
 *
 * The registry quotes every phase at cadence 1 and each body scales them, which
 * is most of the skill gradient: the same club is a 26-tick announcement on
 * paper and 33 on a Brute. One clause per role rather than a
 * guard/everything-else ternary -- legs have no reach and no telegraph, so the
 * blade wording once quoted a Run as "reaches 0.00 · announces for 0 ticks",
 * which is three true numbers adding up to a lie about what the thing does.
 */
function actionCost(action, d) {
  const draw = `${phaseTicks(action.ready, d.cadence)} to draw`;
  if (action.role === ROLE_GUARD) {
    return `guards ±${Math.round((action.arc / 65536) * 360)}° · ${draw}`;
  }
  if (action.role === ROLE_MOVE) {
    return `×${action.moveBonus.toFixed(2)} footspeed · no guard, no blade · ${draw}`;
  }
  if (action.role === ROLE_SHOOT) {
    // `length` is the *draw* on a Shoot row, not the reach -- an arrow carries
    // as far as its archer can see. Quoting it as reach would read as the
    // shortest weapon in the game.
    return `shoots as far as it sees · draws for ${phaseTicks(action.windup, d.cadence)} ticks · ${draw}`;
  }
  return `reaches ${action.length.toFixed(2)} · announces for ${phaseTicks(action.windup, d.cadence)} ticks · ${draw}`;
}

function syncKitReadout(state) {
  const hero = state.hero;
  if (!kitReadout) return;
  if (!hero) {
    for (const key of Object.keys(kitReadout)) setText(kitReadout[key], "—");
    return;
  }
  const action = actionOf(hero.action);
  setText(kitReadout["in hand"], action ? action.name : "nothing");
  setText(
    kitReadout.phase,
    hero.swing === SWING_SWAP ? `changing — ${hero.swingLeft} ticks` : SWING_NAMES[hero.swing] || "—"
  );
  // Quoted against the character's *live* cadence, not the body's baseline:
  // raise agility on the rail above and this number moves with it.
  setText(kitReadout.costs, action && heroCache ? actionCost(action, heroCache.d) : "—");
  setText(kitReadout.stowed, actionName(hero.slot === 0 ? hero.slot1 : hero.slot0));
}

function bindHeroRail() {
  el.heroBody.addEventListener("change", () => {
    if (!wasm.set_hero_body(Number(el.heroBody.value) | 0)) {
      // Only the *live* change can be refused now; the plan for the next spawn
      // always takes. So this is "the body in the room would not change", not
      // "there is nobody" -- which was the old message and is no longer a state
      // this row can be in.
      hint("The character in the room would not change body.", true);
    }
    // The body reset the loadout and the stat sheet with it
    // (`UnitSpec::set_body`, `World::set_body`), so every row has to be re-read
    // -- not just the one dropdown that was touched.
    heroKey = "";
  });
  el.loadout0.addEventListener("change", () => {
    if (!wasm.set_hero_loadout(0, Number(el.loadout0.value) | 0)) {
      hint("Not while that one is in the hand and moving.", true);
    }
    heroKey = "";
  });
  el.loadout1.addEventListener("change", () => {
    if (!wasm.set_hero_loadout(1, Number(el.loadout1.value) | 0)) {
      hint("Not while that one is in the hand and moving.", true);
    }
    heroKey = "";
  });
}

// ------------------------------------------------------------ the Enemy rail

/**
 * Reads the spawn template back and repaints if anything moved.
 *
 * Nothing standing in the room is touched by any of this. The template is what
 * the **[Spawn]** button will send in, and that is the difference the whole rail
 * turns on -- which is why it says so in a line at the top rather than leaving a
 * player to raise a slider mid-fight and wonder why the thing swinging at them
 * did not change.
 */
function syncEnemyRail() {
  const body = wasm.spawn_template_body();
  const slots = [wasm.spawn_template_slot(0), wasm.spawn_template_slot(1)];
  const attrs = ATTRIBUTES.map((attr) => wasm.spawn_template_stat(attr.stat));
  const key = `${body}|${slots.join(",")}|${attrs.join(",")}`;
  if (key === enemyKey) return;
  enemyKey = key;

  el.enemyBody.value = String(body);
  el.enemySlot0.value = String(slots[0]);
  el.enemySlot1.value = String(slots[1]);
  setKitIcon(el.enemySlot0, slots[0]);
  setKitIcon(el.enemySlot1, slots[1]);
  enemyRack.forEach((row, i) => {
    row.slider.value = String(attrs[i]);
    setText(row.value, String(attrs[i]));
    // No derived line on this rail. Sight is a function of a perception the
    // module has not been asked about for this template -- `body_stat(code, 7)`
    // is the *body's* baseline, not the edited one -- and computing it here
    // would be the mirrored formula house rule 3 exists to forbid.
  });
}

function bindEnemyRail() {
  el.enemyBody.addEventListener("change", () => {
    wasm.set_spawn_template_body(Number(el.enemyBody.value) | 0);
    // `UnitSpec::set_body` resets the stat sheet **and** the loadout together,
    // so all seven values are re-read. A panel that kept the previous body's
    // numbers here would be lying in seven rows at once.
    enemyKey = "";
    syncEnemyRail();
  });
  el.enemySlot0.addEventListener("change", () => {
    if (!wasm.set_spawn_template_slot(0, Number(el.enemySlot0.value) | 0)) {
      hint("That one cannot go in the first slot.", true);
    }
    enemyKey = "";
    syncEnemyRail();
  });
  el.enemySlot1.addEventListener("change", () => {
    if (!wasm.set_spawn_template_slot(1, Number(el.enemySlot1.value) | 0)) {
      hint("The module refused that action.", true);
    }
    enemyKey = "";
    syncEnemyRail();
  });
  const spawn = document.getElementById("btn-spawn-template");
  if (spawn) {
    spawn.addEventListener("click", () => {
      if (!dead) spawnFromTemplate();
    });
  }
}

// ------------------------------------------------------------ the action bar

/**
 * The two wide slots along the bottom of the screen.
 *
 * **Reads the frame, never the last click.** The sim refuses a swap mid-cut, so
 * "what did I ask for" and "what is in the hand" are different questions and
 * only the second one is worth a picture. Press `2` mid-swing and this bar goes
 * on showing slot 0 lit, because slot 0 is what the character is holding.
 *
 * During `SWING_SWAP` both slots dim: nothing is in the hand at all, and a
 * fighter changing its mind is the most punishable it ever gets.
 *
 * Under Auto the bar still shows what the AI is holding -- it is a readout
 * before it is a control -- and a click on it hints that you need the Action
 * control rather than doing nothing and looking broken.
 */
let actionBarKey = "";

function syncActionBar(state) {
  const hero = state.hero;
  const slots = [hero ? hero.slot0 : SLOT_EMPTY, hero ? hero.slot1 : SLOT_EMPTY];
  const held = hero ? hero.slot : 0;
  const swapping = !!hero && hero.swing === SWING_SWAP;
  const key = `${slots.join(",")}|${held}|${swapping ? 1 : 0}|${hero ? 1 : 0}`;
  if (key === actionBarKey) return;
  actionBarKey = key;

  for (let slot = 0; slot < 2; slot++) {
    const button = document.getElementById(`action-slot-${slot}`);
    if (!button) continue;
    const code = slots[slot];
    const path = button.querySelector("path");
    if (path) path.setAttribute("d", code === SLOT_EMPTY ? "" : iconPath(code));
    const name = button.querySelector(".action-name");
    if (name) setText(name, actionName(code));
    // Lit from the frame's `slot` column, and not while the hand is empty
    // mid-swap.
    button.classList.toggle("held", !swapping && !!hero && held === slot);
    button.classList.toggle("swapping", swapping);
    button.setAttribute("aria-pressed", String(!swapping && !!hero && held === slot));
    button.disabled = code === SLOT_EMPTY;
  }
}

function bindActionBar() {
  for (const slot of [0, 1]) {
    const button = document.getElementById(`action-slot-${slot}`);
    if (button) button.addEventListener("click", () => selectSlot(slot));
  }
}

/** Asks for a loadout slot to be in hand. A request, not a fact -- see
 *  `wantSlot`. */
function selectSlot(slot) {
  wantSlot = slot;
  if (!(controlMask & CONTROL_SLOT)) {
    hint("Flip the Action switch (V) first, or the character chooses for itself.", true);
  }
}

function buildSliders(side) {
  const host = document.getElementById(side === SIDE_HEROES ? "genes-heroes" : "genes-monsters");
  if (!host) return;
  host.textContent = "";
  const count = wasm.policy_weight_count(side);
  for (let i = 0; i < count; i++) {
    const row = document.createElement("label");
    row.className = "gene";

    const name = document.createElement("span");
    name.className = "gene-name";
    name.textContent = labelOf(side, i);

    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = "0";
    slider.max = "1000";
    slider.step = "1";
    slider.value = String(wasm.policy_gene(side, i));

    const value = document.createElement("span");
    value.className = "gene-value";

    const show = () => {
      value.textContent = (wasm.policy_weight(side, i) / 1000).toFixed(2);
    };
    slider.addEventListener("input", () => {
      wasm.set_policy_gene(side, i, Number(slider.value) | 0);
      show();
    });
    show();

    row.appendChild(name);
    row.appendChild(slider);
    row.appendChild(value);
    host.appendChild(row);
  }
  if (count === 0) {
    const none = document.createElement("p");
    none.className = "gene-none";
    none.textContent = "Nothing to tune.";
    host.appendChild(none);
  }
}

function bindBehaviour() {
  for (const side of [SIDE_HEROES, SIDE_MONSTERS]) {
    const id = side === SIDE_HEROES ? "policy-heroes" : "policy-monsters";
    const select = document.getElementById(id);
    if (!select) continue;
    for (const policy of POLICIES) {
      const option = document.createElement("option");
      option.value = String(policy.code);
      option.textContent = policy.label;
      select.appendChild(option);
    }
    select.value = String(wasm.policy_kind(side));
    select.addEventListener("change", () => {
      if (dead) return;
      wasm.set_policy(side, Number(select.value) | 0);
      buildSliders(side);
      hint(`${side === SIDE_HEROES ? "Heroes" : "Monsters"} now think like ${select.options[select.selectedIndex].textContent}.`);
    });
    buildSliders(side);
  }

  const reset = document.getElementById("btn-reset-genes");
  if (reset) {
    reset.addEventListener("click", () => {
      if (dead) return;
      for (const side of [SIDE_HEROES, SIDE_MONSTERS]) {
        wasm.reset_policy_genes(side);
        buildSliders(side);
      }
      hint("Weights restored to the hand-tuned baseline.");
    });
  }
}

// --------------------------------------------------------------------- draw

function px(x) {
  return x * scale;
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ---------------------------------------------------------------- the floor
//
// One flagstone tile, baked once into an offscreen canvas and repeated. The
// room is 24x16 world units and a wheel notch can put eighty device pixels on a
// world unit, so drawing the speckle live would be several thousand fills a
// frame for a texture that never changes. The pattern's *own* matrix does the
// zooming instead, which is a bitmap scale in the compositor rather than work
// on this thread -- and it is why the floor does not re-tile visibly as you
// zoom: the tile always covers exactly `TILE_WORLD` units whatever it was baked
// at, so only its sharpness changes at a rebake, never its layout.

/** World units across one baked tile. Four, so the tile seam falls exactly on a
 *  grid line and the masonry and the scale bar never disagree about where a
 *  stone ends. */
const TILE_WORLD = 4;

/** Courses per tile, and stones per course: a stone is half a world unit tall
 *  and one wide -- about a Fighter's diameter across and half that deep. Two
 *  world units to a stone was tried first and the room read as a brick wall
 *  photographed from the side; at this size the eye takes it as ground. */
const TILE_ROWS = 8;
const TILE_COLS = 4;

/** The baked tile, the pattern over it, and the device-pixel size it was baked
 *  at. Rebuilt when that size changes bucket and at no other time. */
let floorTile = null;
let floorPattern = null;
let floorTileSizeBaked = 0;

/** How many times the tile has been baked this session. Exists so the claim
 *  "the pattern is cached, not rebuilt per frame" can be *checked* from the
 *  console instead of believed: it should sit in single digits after a minute
 *  of wheeling the zoom about. */
let floorBakes = 0;

/**
 * A tiny xorshift, so the grain is a decision rather than a roll.
 *
 * Deliberately not the sim's PRNG, deliberately seeded from a constant, and
 * deliberately on this side of the wall: this is presentation, it never crosses
 * the boundary, and the only property it needs is that a rebake produces the
 * *same* tile -- otherwise zooming through a bucket boundary would reshuffle
 * every stone in the room under your feet.
 */
function grainRandom(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

/**
 * Device pixels across the baked tile, bucketed.
 *
 * `Math.round(scale)` is the zoom in whole CSS pixels per world unit; the tile
 * wants that times four world units times the device pixel ratio. Quantising
 * the result to 64-pixel steps is what turns "rebake on every wheel notch" into
 * "rebake at most six times ever", and the pattern matrix covers the difference
 * in between.
 */
function floorTileSize() {
  const want = Math.round(scale) * TILE_WORLD * dpr;
  return clamp(Math.round(want / 64) * 64, 128, 512);
}

/** Bakes one seamlessly repeatable flagstone tile, `size` device pixels square. */
function bakeFloorTile(size) {
  const tile = document.createElement("canvas");
  tile.width = size;
  tile.height = size;
  const g = tile.getContext("2d");
  const rand = grainRandom(0x9e3779b9);

  // The mortar, which is what every seam shows through to.
  g.fillStyle = "#0c1017";
  g.fillRect(0, 0, size, size);

  const rowH = size / TILE_ROWS;
  const colW = size / TILE_COLS;
  // Both quoted against the tile rather than the stone: a mortar line that
  // scaled with the course would swallow a third of a stone at eight courses.
  const seam = Math.max(0.75, size * 0.0035);
  const lip = Math.max(1, size * 0.003);
  for (let row = 0; row < TILE_ROWS; row++) {
    // Every other course is offset half a stone. The halves that fall off each
    // end are drawn anyway and the canvas clips them: once the tile repeats,
    // those two halves *are* the same stone, which is what keeps the vertical
    // seam invisible.
    const shift = row % 2 ? colW / 2 : 0;
    for (let col = -1; col <= TILE_COLS; col++) {
      const x = col * colW + shift;
      const y = row * rowH;
      const w = colW - 2 * seam;
      const h = rowH - 2 * seam;
      const tone = 20 + Math.floor(rand() * 11);
      g.fillStyle = `rgb(${tone},${tone + 4},${tone + 12})`;
      g.fillRect(x + seam, y + seam, w, h);
      // A lit top edge and a shadowed bottom one. Two flat fills, but they are
      // the difference between a stone with a face and a coloured rectangle.
      g.fillStyle = "rgba(190,212,248,0.05)";
      g.fillRect(x + seam, y + seam, w, lip);
      g.fillStyle = "rgba(0,0,0,0.30)";
      g.fillRect(x + seam, y + rowH - seam - lip, w, lip);
    }
  }

  // The grain. Single device pixels, some lighter than the stone and some
  // darker, and the only thing here that stops a flat fill reading as a swatch.
  const grains = Math.round(size * size * 0.01);
  for (let i = 0; i < grains; i++) {
    const x = Math.floor(rand() * size);
    const y = Math.floor(rand() * size);
    g.fillStyle =
      rand() < 0.5
        ? `rgba(206,224,255,${(0.02 + rand() * 0.05).toFixed(3)})`
        : `rgba(0,0,0,${(0.05 + rand() * 0.12).toFixed(3)})`;
    g.fillRect(x, y, 1, 1);
  }
  return tile;
}

/**
 * The floor pattern, baked on demand and re-aimed every frame.
 *
 * `setTransform` is the cheap half and it does run per frame: it is what makes
 * one tile cover `TILE_WORLD` world units at *any* zoom, whatever pixel size it
 * happens to have been baked at. Only the bake behind it is bucketed.
 */
function floorPatternNow() {
  const size = floorTileSize();
  if (!floorPattern || size !== floorTileSizeBaked) {
    floorTile = bakeFloorTile(size);
    floorPattern = ctx.createPattern(floorTile, "repeat");
    floorTileSizeBaked = floorPattern ? size : 0;
    floorBakes += 1;
  }
  if (floorPattern) {
    floorPattern.setTransform(new DOMMatrix().scale(px(TILE_WORLD) / floorTile.width));
  }
  return floorPattern;
}

/**
 * The level as five paths: open floor and bordering rock face, each split into
 * what the character can see *now* and what it merely remembers, plus the lit
 * rock edges.
 *
 * **Built once per level, not per frame.** A 48x32 level is 1536 tiles, and at
 * the top zoom bucket baking it into an offscreen canvas would be a 2304x1536
 * backing store rebuilt six times over. Five `Path2D`s cost 1536 `rect()` calls
 * once, and after that a fill is a fill.
 *
 * `revision` is `map_revision()`, which the module bumps only when the tiles
 * change; `vis` is `vis_revision()`, which it bumps when the character crosses a
 * tile and on a new level. `art` and `fog` are the flags this was baked under,
 * because both of them change what lands in which path. Anything else -- a tick,
 * a click, a slider -- leaves this alone.
 */
let levelPaths = {
  revision: -1,
  vis: -1,
  scale: 0,
  art: null,
  fog: null,
  floorLit: null,
  floorSeen: null,
  wallLit: null,
  wallSeen: null,
  edge: null,
};

/**
 * Rebuilds the level paths. Called when `map_revision()` moves, when
 * `vis_revision()` moves, when the pixel scale changes -- a `Path2D` holds
 * pixels, not world units -- and when the view mode changes what gets baked.
 *
 * Five paths, because the wall needs two of them and the fog doubles both halves.
 * **The face where rock meets floor is a separate path from the rock itself**,
 * and that is not decoration: the first version stroked every wall tile, which
 * drew a line down every seam between two pieces of rock and turned a solid mass
 * into a brick texture. Rock is one dark shape; only the edge you can actually
 * walk up to catches light.
 *
 * The visibility bytes are read here rather than passed in, unlike the map. There
 * are five call sites and only one of them -- the loop's `vis_revision` branch --
 * has any reason to know that fog exists; a page that read the buffer at four of
 * them would show the previous floor's fog at the fifth, because `restart`
 * rebuilds directly and the bytes it wants are the ones `init` has just cleared.
 */
function rebuildLevelPaths(map, revision) {
  const art = artOn();
  const fog = fogOn();
  // Not read at all with the fog off, where every tile is lit by definition.
  const vis = fog ? readVis() : null;
  const floorLit = new Path2D();
  const floorSeen = new Path2D();
  const wallLit = new Path2D();
  const wallSeen = new Path2D();
  // The lit rock faces -- and `null` rather than an empty path with the art off,
  // so `drawLevel` skips the stroke instead of stroking nothing: there is no
  // light in a tactical room for an edge to catch.
  const edge = art ? new Path2D() : null;
  const size = px(map.tile);
  // Off the grid is rock, exactly as the module has it, so the outside of the
  // level needs no special case here either.
  const solid = (tx, ty) =>
    tx < 0 || ty < 0 || tx >= map.cols || ty >= map.rows || map.tiles[ty * map.cols + tx] !== 0;
  // `2` in sight, `1` seen earlier, `0` never. With the fog off everything is
  // `2`, which is what makes `[dev]` cost exactly what the renderer costs today
  // rather than paying for a layer it does not draw.
  const seen = (tx, ty) => (!fog ? 2 : vis.tiles[ty * map.cols + tx] | 0);

  for (let ty = 0; ty < map.rows; ty++) {
    for (let tx = 0; tx < map.cols; tx++) {
      const lit = seen(tx, ty);
      // Never seen goes into no path at all. The page background is already the
      // void, which is exactly the right picture -- and it is also why nothing
      // below ever has to paint black over anything.
      if (lit === 0) continue;
      const x = px(tx * map.tile);
      const y = px(ty * map.tile);
      if (!solid(tx, ty)) {
        (lit === 2 ? floorLit : floorSeen).rect(x, y, size, size);
        continue;
      }
      // Only the faces that border open ground. Interior rock nobody can see is
      // left as void, which is cheaper and is also the right picture: a dungeon
      // reads as carved *out of* rock, so the parts you never reach should look
      // like the outside of the level, because that is what they are.
      //
      // **That test is on the floor plan and never on the fog.** A face that
      // borders open ground goes on bordering it whether or not anybody is
      // looking, and asking the fog here would flicker whole pieces of the rock
      // mass in and out as the lit disc swept across them.
      let exposed = false;
      // The edge is a lit-tiles-only path, so this is hoisted out of the four
      // face tests rather than repeated in each of them.
      const rim = edge !== null && lit === 2;
      if (!solid(tx, ty - 1)) {
        exposed = true;
        if (rim) {
          edge.moveTo(x, y);
          edge.lineTo(x + size, y);
        }
      }
      if (!solid(tx, ty + 1)) {
        exposed = true;
        if (rim) {
          edge.moveTo(x, y + size);
          edge.lineTo(x + size, y + size);
        }
      }
      if (!solid(tx - 1, ty)) {
        exposed = true;
        if (rim) {
          edge.moveTo(x, y);
          edge.lineTo(x, y + size);
        }
      }
      if (!solid(tx + 1, ty)) {
        exposed = true;
        if (rim) {
          edge.moveTo(x + size, y);
          edge.lineTo(x + size, y + size);
        }
      }
      if (exposed) (lit === 2 ? wallLit : wallSeen).rect(x, y, size, size);
    }
  }
  levelPaths = {
    revision,
    vis: vis ? vis.revision : wasm.vis_revision(),
    scale,
    art,
    fog,
    floorLit,
    floorSeen,
    wallLit,
    wallSeen,
    edge,
  };
}

/** How much of the floor's own brightness ground the character only *remembers*
 *  keeps.
 *
 *  Alpha against the void rather than a second palette: dim ground has to read as
 *  the same room with the light off, and two sets of stone colours would be two
 *  rooms. The canvas is cleared to transparent, so blending toward nothing is
 *  blending toward the page's own background -- which is the void. */
const SEEN_ALPHA = 0.4;

/** Where the lantern's falloff begins, as a fraction of sight range. */
const LANTERN_INNER = 0.6;

/**
 * The level, as lit stone standing in the dark.
 *
 * The flagstone pattern is unchanged and so is the space it is laid in -- the
 * origin is still the level's corner, so the stones stay nailed to the level
 * rather than swimming under the camera, and **clipping to a smaller region
 * therefore moves the fog boundary and leaves the masonry exactly where it was**.
 * What changed is only *where* it is painted: through the floor paths rather than
 * over a rectangle.
 *
 * Painted back to front: remembered floor, lit floor, remembered rock, lit rock,
 * the lit edges, and the lantern over the top of all of it.
 */
function drawLevel(state) {
  if (!levelPaths.floorLit) return;
  const w = px(arena.x);
  const h = px(arena.y);
  const art = artOn();
  // Asked for once, not once per pass: `floorPatternNow` re-aims the pattern
  // matrix on every call and bakes a new tile if the zoom bucket moved. With the
  // art off it is not called at all -- neither it nor `bakeFloorTile` is edited
  // for `[tactical]`, they are simply not reached.
  const pattern = art ? floorPatternNow() : null;

  // Remembered ground, then lit ground, and the only difference between the two
  // passes is the alpha. One body of code for both is what stops the fog boundary
  // becoming a place where the floor changes texture.
  for (const lit of [false, true]) {
    ctx.save();
    ctx.clip(lit ? levelPaths.floorLit : levelPaths.floorSeen);
    ctx.globalAlpha = lit ? 1 : SEEN_ALPHA;
    ctx.fillStyle = pattern || "#141a26";
    ctx.fillRect(0, 0, w, h);

    if (art) {
      // Lit from the middle. Without this the stone reads as a swatch of texture
      // rather than as somewhere with a light in it.
      const cx = w / 2;
      const cy = h / 2;
      const vignette = ctx.createRadialGradient(cx, cy, Math.min(w, h) * 0.16, cx, cy, Math.max(w, h) * 0.62);
      vignette.addColorStop(0, "rgba(9,11,16,0)");
      vignette.addColorStop(0.6, "rgba(9,11,16,0.20)");
      vignette.addColorStop(1, "rgba(9,11,16,0.62)");
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, w, h);
    }

    // The scale bar, and *only* the scale bar: one line every four units, far
    // fainter than the graph paper this replaced -- the stone carries the texture
    // now, so the grid no longer has to pretend to. Genuinely useful at this
    // size, where the far side of the level is off the screen.
    //
    // **It stays in every mode, and it is clipped to all the ground the character
    // knows about** -- which is why it is inside this loop rather than drawn once
    // outside it. Clipped to the lit region alone it would vanish from exactly
    // the explored ground a player measures across; clipped to nothing it would
    // repaint the unexplored void as graph paper and undo the one thing the fog
    // is for. It gives nothing away either way: an evenly spaced lattice says
    // where four units is, never where the floor is.
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(150,180,230,0.055)";
    ctx.beginPath();
    for (let x = TILE_WORLD; x < arena.x; x += TILE_WORLD) {
      ctx.moveTo(Math.round(px(x)) + 0.5, 0);
      ctx.lineTo(Math.round(px(x)) + 0.5, h);
    }
    for (let y = TILE_WORLD; y < arena.y; y += TILE_WORLD) {
      ctx.moveTo(0, Math.round(px(y)) + 0.5);
      ctx.lineTo(w, Math.round(px(y)) + 0.5);
    }
    ctx.stroke();
    ctx.restore();
  }

  // The rock: one dark mass, clearly darker than the lit floor beside it, with
  // light only on the faces you can walk up to. See `rebuildLevelPaths` for why
  // the two are separate paths. Remembered rock is dimmed on the same terms the
  // remembered floor is, so the boundary crosses stone and rock at once.
  ctx.save();
  ctx.fillStyle = "#0c1017";
  ctx.globalAlpha = SEEN_ALPHA;
  ctx.fill(levelPaths.wallSeen);
  ctx.globalAlpha = 1;
  ctx.fill(levelPaths.wallLit);
  if (levelPaths.edge) {
    ctx.strokeStyle = "rgba(150,185,235,0.20)";
    ctx.lineWidth = 1.5;
    ctx.lineCap = "square";
    ctx.stroke(levelPaths.edge);
  }
  ctx.restore();

  // Last, so it also takes the outer half of the edge stroke down with it at
  // range: a lit rock face at the far edge of sight should not be the brightest
  // line on screen.
  drawLantern(state, w, h);
}

/**
 * The soft edge on the lit region.
 *
 * A tile-granular answer has a stepped boundary, and a staircase is the one thing
 * about this fog that reads as a rendering artefact rather than as darkness. So
 * it is softened: a radial gradient on the character, clipped to the lit floor,
 * transparent out to `LANTERN_INNER` of sight range and the room's shadow colour
 * at the end of it.
 *
 * **This is presentation on top of an exact answer, not a second visibility
 * model. Nothing is revealed or hidden by it.** What can be seen was decided by
 * `Dungeon::sees` and baked into `floorLit`; painting a round falloff over a
 * jagged boundary does not move the boundary an inch. Do not try to make the two
 * agree -- the gradient is a circle and the answer is not, and the answer is the
 * one that is right.
 */
function drawLantern(state, w, h) {
  const hero = state.hero;
  if (!fogOn() || !hero || !(hero.sight > 0)) return;
  const x = px(hero.x);
  const y = px(hero.y);
  const far = px(hero.sight);
  const lamp = ctx.createRadialGradient(x, y, far * LANTERN_INNER, x, y, far);
  lamp.addColorStop(0, "rgba(9,11,16,0)");
  lamp.addColorStop(1, "rgba(9,11,16,0.55)");
  ctx.save();
  ctx.clip(levelPaths.floorLit);
  ctx.fillStyle = lamp;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

/**
 * The way out.
 *
 * Drawn shut as well as open, and that is the design decision rather than a
 * fallback: seeing where the exit is from the moment you arrive is what turns
 * "kill things" into "fight your way there". Aged on the wall clock like
 * everything else presentational in this file.
 */
function drawPortal(state, now) {
  if (!state.portalState) return;
  const x = px(state.portalX);
  const y = px(state.portalY);
  const r = px(0.9);
  const open = state.portalState === 2;

  ctx.save();
  if (!open) {
    // Shut: a dim ring, static, obviously not going anywhere.
    ctx.strokeStyle = "rgba(150,180,230,0.18)";
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 7]);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.stroke();
    ctx.restore();
    return;
  }

  const glow = ctx.createRadialGradient(x, y, 0, x, y, r * 1.7);
  glow.addColorStop(0, "rgba(110,231,255,0.30)");
  glow.addColorStop(1, "rgba(110,231,255,0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, r * 1.7, 0, TAU);
  ctx.fill();

  // Two arcs turning against each other, which reads as a way through rather
  // than as a marker on the floor.
  const spin = now / 900;
  ctx.lineCap = "round";
  for (let i = 0; i < 2; i++) {
    const sweep = spin * (i ? -1 : 1);
    ctx.strokeStyle = i ? "rgba(110,231,255,0.55)" : "rgba(180,245,255,0.85)";
    ctx.lineWidth = i ? 2 : 3;
    ctx.beginPath();
    ctx.arc(x, y, r * (i ? 0.62 : 1), sweep, sweep + TAU * 0.62);
    ctx.stroke();
  }
  ctx.restore();
}

function drawTrail() {
  if (trail.length < 2) return;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (let i = 1; i < trail.length; i++) {
    const t = i / trail.length;
    ctx.strokeStyle = `rgba(110,231,255,${(0.16 * t).toFixed(3)})`;
    ctx.lineWidth = 1 + 2 * t;
    ctx.beginPath();
    ctx.moveTo(px(trail[i - 1].x), px(trail[i - 1].y));
    ctx.lineTo(px(trail[i].x), px(trail[i].y));
    ctx.stroke();
  }
  ctx.restore();
}

/** Radius of the mark at a waypoint, in world units. Well under
 *  `drawDestination`'s 0.55 ring: one of these is a bead on a string and that
 *  one is the mark the character is actually walking to. */
const ROUTE_MARK = 0.18;

/**
 * The queued path: where the character is going after where it is going.
 *
 * Two things at once, and they are drawn the same way on purpose -- the path
 * being traced right now under the finger, and the path the module is
 * currently walking. A player mid-drag is looking at the same picture they will
 * be looking at a moment later, which is the whole reason a drag reads as
 * drawing rather than as guessing.
 *
 * Guarded on there being a character for the same reason `render` guards the
 * destination marker: the order outlives whoever was carrying it, and a line
 * drawn to somewhere nobody is walking is a promise the page cannot keep.
 */
function drawRoute(state, now) {
  const path = drag ? drag.points : routeDrawn;
  if (!state.hero || path.length < 1) return;
  const hx = px(state.hero.x);
  const hy = px(state.hero.y);

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // The whole plan, hero first, dim and dashed. The dashes crawl toward the far
  // end on the wall clock, which is what carries the *direction* of a path
  // whose legs are otherwise identical lines. `now` and not a tick, like the
  // portal's spin and the destination's beat: this describes an intention
  // rather than a motion, so it goes on crawling while the world is frozen.
  ctx.strokeStyle = "rgba(110,231,255,0.18)";
  ctx.lineWidth = 1.4;
  ctx.setLineDash([4, 6]);
  ctx.lineDashOffset = -((now / 55) % 10);
  ctx.beginPath();
  ctx.moveTo(hx, hy);
  for (const p of path) ctx.lineTo(px(p.x), px(p.y));
  ctx.stroke();

  // The leg being walked, over the top of that and solid. One leg is the only
  // part of a path the sim has been told about -- the rest is the page holding a
  // queue -- and drawing that difference is what stops a traced route reading
  // as one long ordered march.
  ctx.strokeStyle = "rgba(110,231,255,0.28)";
  ctx.lineWidth = 1.8;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(hx, hy);
  ctx.lineTo(px(path[0].x), px(path[0].y));
  ctx.stroke();

  // A bead at every waypoint, and **not at `path[0]` once the module is walking
  // it**: that one *is* the standing order, and `drawDestination` has already
  // put a much louder ring on exactly that spot. Two rings on one point read as
  // two waypoints. Mid-drag nothing has been sent yet, so every bead is the
  // page's to draw.
  ctx.strokeStyle = "rgba(110,231,255,0.22)";
  ctx.lineWidth = 1.2;
  for (let i = drag ? 0 : 1; i < path.length; i++) {
    ctx.beginPath();
    ctx.arc(px(path[i].x), px(path[i].y), px(ROUTE_MARK), 0, TAU);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * The destination, as the *simulation* holds it -- not as it was clicked.
 * They are the same number here, but drawing the sim's copy is what makes the
 * marker honest: it appears when the order lands, and it is dim until the
 * character has actually thought about it.
 */
function drawDestination(state, now, arrived) {
  if (state.orderKind !== ORDER_GOTO) return;
  const x = px(state.orderX);
  const y = px(state.orderY);
  const beat = (Math.sin(now / 380) + 1) / 2;
  const alpha = orderAcknowledged ? (arrived ? 0.32 : 0.45 + 0.35 * beat) : 0.16;
  const r = px(0.55) + (orderAcknowledged && !arrived ? beat * px(0.18) : 0);

  ctx.save();
  ctx.strokeStyle = `rgba(110,231,255,${alpha.toFixed(3)})`;
  ctx.lineWidth = 1.6;
  if (!orderAcknowledged) ctx.setLineDash([3, 4]);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.stroke();

  ctx.setLineDash([]);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = "#6ee7ff";
  ctx.beginPath();
  ctx.arc(x, y, 2, 0, TAU);
  ctx.fill();

  // A crosshair, so the exact point is readable at any zoom.
  ctx.globalAlpha = alpha * 0.7;
  ctx.beginPath();
  ctx.moveTo(x - r - 4, y);
  ctx.lineTo(x - r + 2, y);
  ctx.moveTo(x + r - 2, y);
  ctx.lineTo(x + r + 4, y);
  ctx.moveTo(x, y - r - 4);
  ctx.lineTo(x, y - r + 2);
  ctx.moveTo(x, y + r - 2);
  ctx.lineTo(x, y + r + 4);
  ctx.stroke();
  ctx.restore();
}

// The "it just thought" pulse used to live here: one amber ring emanating from
// the hero per decision tick. It went because it read as an ability firing
// rather than as a clock ticking, and a ring is the most attention-grabbing
// shape on a canvas -- it was pulling the eye off the swordplay sixty times a
// minute to say nothing. `state.decisionTick` is still in the frame and still
// drives the order-acknowledgement logic in `loop`; only the rings are gone.

/** Faction, not archetype, drives the colour: which side a body is on is the
 *  thing you must never have to think about. Archetype is legible from the
 *  *shape* now -- one silhouette per `UnitKind` -- which is why these two
 *  palettes never grew a third for a body type. */
// `wedge` outlived the facing wedge that named it -- a silhouette with a head
// on it has a facing, so the fan of light in front of every body went. The key
// stays because the *colour role* did: it is the faction tint used for anything
// drawn as a line or a hint rather than as flesh -- the rim light, the vision
// disc, the reach ring, the sprint chevrons, an arrow in flight.
//
// **And then the wedge came back, in `[tactical]` only**, which is not a
// contradiction of the paragraph above: what retired it was a shape that carried
// the facing for free, and a tactical body is a plain disc that carries nothing.
// The fan is the only thing left there that says which way something is pointing.
const HERO_SKIN = {
  glow: "110,231,255",
  body: ["#bff2ff", "#4fb9d8"],
  // The shaded end of the same hue. A silhouette painted in `body` alone came
  // out so pale that the rim light -- which is the thing carrying the faction
  // read at four pixels a body -- had nothing to be brighter than.
  deep: "#1b566c",
  wedge: "110,231,255",
  bar: "#6ee7ff",
};

const MONSTER_SKIN = {
  glow: "255,138,122",
  body: ["#ffc0b3", "#c04b38"],
  deep: "#67251a",
  wedge: "255,138,122",
  bar: "#ff8a7a",
};

function skinOf(unit) {
  return unit.faction === FACTION_HEROES ? HERO_SKIN : MONSTER_SKIN;
}

/** What a unit could touch at full extension. Drawn only while it is committed
 *  to an attack, so the ring appearing is the moment the character stopped
 *  travelling and started fighting.
 *
 *  The radius comes from the frame now rather than from a mirrored constant,
 *  because reach stopped being one number for everybody: a Brute reaches 1.45
 *  past a 0.70 body and a Skitterer 0.40 past a 0.30 one. */
/**
 * How far a body can see, as a disc on the floor.
 *
 * The number is `unit.sight`, straight off the frame -- column 27, the one
 * session 2 added precisely so this could exist without a formula on this side
 * of the wall. It is the single most explanatory number in the game and it was
 * completely invisible before: a Rogue sees 14.4 units and a Brute 7.8, which
 * is the whole reason the Brute keeps blundering into fights it did not choose.
 *
 * Deliberately nothing like `drawReach`. That is the *attack* ring -- tight,
 * dashed hard, and only there mid-swing -- and two rings meaning two different
 * things must not look alike. This one is a soft filled disc that is always
 * there, and the fill is kept almost to nothing because six of them overlap in
 * a crowded room and the floor has to stay readable through all six.
 */
function drawVision(unit) {
  if (!visionVisible || !(unit.sight > 0)) return;
  const skin = skinOf(unit);
  ctx.save();
  ctx.beginPath();
  ctx.arc(px(unit.x), px(unit.y), px(unit.sight), 0, TAU);
  ctx.fillStyle = `rgba(${skin.wedge},0.032)`;
  ctx.fill();
  ctx.strokeStyle = `rgba(${skin.wedge},0.17)`;
  ctx.lineWidth = 1;
  ctx.setLineDash([7, 9]);
  ctx.stroke();
  ctx.restore();
}

/** Whether the vision discs are drawn. Default on, toggled with `Y`.
 *
 *  Read through `visionShown()` and written through `setVisionVisible()` rather
 *  than poked directly, so the HUD can hang a button off the same switch the
 *  keyboard uses and the two cannot drift apart. */
let visionVisible = true;

function visionShown() {
  return visionVisible;
}

function setVisionVisible(on) {
  visionVisible = !!on;
  hint(
    visionVisible
      ? "Vision ranges shown. Each disc is exactly how far that body can see -- nothing outside it can be reacted to."
      : "Vision ranges hidden."
  );
}

function drawReach(unit, skin, now) {
  if (unit.intent !== INTENT_ATTACK) return;
  const beat = (Math.sin(now / 260) + 1) / 2;
  ctx.save();
  ctx.strokeStyle = `rgba(${skin.wedge},${(0.10 + 0.10 * beat).toFixed(3)})`;
  ctx.lineWidth = 1.2;
  ctx.setLineDash([3, 5]);
  ctx.beginPath();
  ctx.arc(px(unit.x), px(unit.y), px(unit.radius + unit.actionLength), 0, TAU);
  ctx.stroke();
  ctx.restore();
}

/** Spin, in raw angle units per tick, at which a blade is drawn at full heat.
 *  Roughly a Warrior's working speed. */
const HOT_SPIN = 1500;

/** Blade colour by attack phase.
 *
 *  Four states and they have to be four *looks*, not four shades of one. Only a
 *  striking blade can hurt anybody, so a page that drew every blade the same
 *  would be showing a fight in which everything is dangerous all the time --
 *  which is precisely the fight this model was built to stop being. */
const SWING_SKIN = {
  [SWING_GUARD]: { line: "rgba(210,220,235,0.45)", width: 0.16 },
  [SWING_WINDUP]: { line: "rgba(255,196,92,0.95)", width: 0.24 },
  [SWING_STRIKE]: { line: "rgba(255,255,255,1)", width: 0.30 },
  [SWING_RECOVER]: { line: "rgba(150,160,180,0.40)", width: 0.14 },
  // Mid-swap: nothing is in the hand and nothing is drawn, but the stub that
  // is left has to look inert rather than merely dim, because a fighter
  // changing its mind is the most punishable it ever gets.
  [SWING_SWAP]: { line: "rgba(120,128,145,0.25)", width: 0.10 },
};

/**
 * The swordplay: **one limb**, drawn as whatever is in it.
 *
 * This is the whole point of drawing anything. Damage is geometric -- it is
 * decided by where this segment is and how fast it is moving -- so a page that
 * drew only bodies would be hiding the entire game.
 *
 * What the blade shows is its **phase**, and that matters more than its speed
 * now. A blade chambered at guard is furniture; the same blade three ticks into
 * a windup is an attack you have most of a second to answer. Those two look
 * nothing alike here, and the amber line marking where a windup is *aimed* is
 * the single most useful thing on the canvas: during a windup the blade is
 * cocked away from that line, so a player who watches the blade covers the one
 * bearing the cut cannot arrive from.
 */
function drawLimb(unit, skin) {
  const x = px(unit.x);
  const y = px(unit.y);
  const r = px(unit.radius);

  ctx.save();
  ctx.translate(x, y);

  // A guard, as the wedge of body it is covering -- and **only** if what is in
  // hand actually guards. A tucked one covers nothing and is drawn as nothing,
  // which is honest: `block_leak` scales the arc by extension, so a hand held
  // in really does cover less.
  if (unit.role === ROLE_GUARD && unit.limbReach > 0.2 && unit.swing !== SWING_SWAP) {
    const half = (unit.actionArc * unit.limbReach) / 2;
    ctx.rotate(unit.limbAngle);
    ctx.fillStyle = `rgba(${skin.wedge},${(0.13 + 0.17 * unit.limbReach).toFixed(3)})`;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, r * 1.55, -half, half);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = `rgba(${skin.wedge},${(0.45 * unit.limbReach).toFixed(3)})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.55, -half, half);
    ctx.stroke();
    ctx.rotate(-unit.limbAngle);
  }

  // The declared line, drawn only while a cut is actually declared. This is the
  // telegraph made visible: an arrow along the bearing the blade is about to
  // sweep through, fading in as the windup runs out so "soon" and "now" look
  // different.
  //
  // **A drawn bow is included, and it is the case that matters most.** A bow
  // announces for thirty ticks and then puts a point across the room with no
  // hitbox anywhere on the archer -- so this dashed line is the *only* warning
  // the player ever gets, and it is precisely the tell the AI is scored on
  // reading. Its line runs out to sight rather than to `actionLength`, because
  // for a shot that field is the draw and not the reach.
  //
  // And it now runs out to sight *literally*. This used to be
  // `px(radius + actionLength) * 4` under a comment saying "runs out to sight",
  // which was a guess that happened to look about right on a Rogue -- exactly
  // the kind of eyeballed constant house rule 3 is about. `unit.sight` is the
  // honest number the comment was describing, and it arrives in the frame.
  if (
    (unit.role === ROLE_STRIKE || unit.role === ROLE_SHOOT) &&
    (unit.swing === SWING_WINDUP || unit.swing === SWING_STRIKE)
  ) {
    const imminent =
      unit.swing === SWING_STRIKE ? 1 : clamp(1 - unit.swingLeft / 30, 0.15, 1);
    const out =
      unit.role === ROLE_SHOOT
        ? px(unit.sight)
        : px(unit.radius + unit.actionLength);
    ctx.rotate(unit.limbLine);
    ctx.strokeStyle = `rgba(255,176,64,${(0.20 + 0.45 * imminent).toFixed(3)})`;
    ctx.lineWidth = Math.max(1, r * 0.12);
    ctx.setLineDash([Math.max(3, r * 0.3), Math.max(3, r * 0.35)]);
    ctx.beginPath();
    ctx.moveTo(r * 0.6, 0);
    ctx.lineTo(out, 0);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.rotate(-unit.limbLine);
  }

  // The blade. Hilt at the body's surface, tip at `radius + length * reach`,
  // which is precisely the segment `World::blade` builds and tests against.
  //
  // Gated on the role, so a guard is never drawn as a stick. That is not
  // cosmetic: the sim refuses a guard a blade hitbox, and a page that drew one
  // anyway would be teaching the player a threat that cannot exist.
  if (unit.role === ROLE_STRIKE && unit.limbReach > 0.05 && unit.swing !== SWING_SWAP) {
    const phase = SWING_SKIN[unit.swing] || SWING_SKIN[SWING_GUARD];
    const heat = clamp(Math.abs(unit.limbSpin) / HOT_SPIN, 0, 1);
    const hilt = r;
    const tip = px(unit.radius + unit.actionLength * unit.limbReach);
    ctx.rotate(unit.limbAngle);
    ctx.lineCap = "round";
    // A trailing smear opposite the swing, so which way it is travelling is
    // readable at a glance. Only on a live cut: a blade drifting back to guard
    // trails nothing worth watching, and smearing it would make a recovery --
    // the most punishable moment in the game -- look like a threat.
    if (unit.swing === SWING_STRIKE && heat > 0.05) {
      const sweep = Math.sign(unit.limbSpin) * -heat * 0.55;
      ctx.strokeStyle = `rgba(255,255,255,${(0.16 * heat).toFixed(3)})`;
      ctx.lineWidth = Math.max(2, r * 0.5);
      ctx.beginPath();
      ctx.arc(0, 0, (hilt + tip) / 2, 0, sweep, sweep > 0);
      ctx.stroke();
    }
    ctx.strokeStyle = phase.line;
    ctx.lineWidth = Math.max(1.6, r * phase.width);
    ctx.beginPath();
    ctx.moveTo(hilt, 0);
    ctx.lineTo(tip, 0);
    ctx.stroke();
    ctx.rotate(-unit.limbAngle);
  }

  // A bow, as a bow. **Never as a stick**: the sim gives a `Role::Shoot` limb no
  // blade hitbox at all, so drawing one would advertise a melee threat that
  // cannot exist -- the same lie the guard gate above exists to prevent. An arc
  // across the bearing says "this thing throws something" without saying "this
  // thing cuts", and it deepens as the draw runs out.
  if (unit.role === ROLE_SHOOT && unit.swing !== SWING_SWAP) {
    const out = px(unit.radius + unit.actionLength);
    const drawn =
      unit.swing === SWING_WINDUP ? clamp(1 - unit.swingLeft / 30, 0.2, 1) : 0.2;
    ctx.rotate(unit.limbAngle);
    ctx.strokeStyle =
      unit.swing === SWING_STRIKE
        ? "rgba(255,255,255,1)"
        : `rgba(255,196,92,${(0.35 + 0.5 * drawn).toFixed(3)})`;
    ctx.lineWidth = Math.max(1.6, r * 0.2);
    ctx.beginPath();
    ctx.arc(0, 0, out, -0.55, 0.55);
    ctx.stroke();
    ctx.rotate(-unit.limbAngle);
  }
  ctx.restore();
}

/** Hit, block and parry markers, straight from the frame.
 *
 *  Three distinguishable things rather than one flash, because "you were hit",
 *  "your shield stopped it" and "your blades crossed" are three different
 *  outcomes and telling them apart is how the swordplay becomes readable. */
function drawMarks(unit) {
  const x = px(unit.x);
  const y = px(unit.y);
  const r = px(unit.radius);

  if (unit.blockFlash > 0) {
    ctx.save();
    ctx.strokeStyle = `rgba(180,220,255,${(0.85 * unit.blockFlash).toFixed(3)})`;
    ctx.lineWidth = 2.5;
    ctx.translate(x, y);
    ctx.rotate(unit.limbAngle);
    const half = Math.max(0.35, (unit.actionArc * unit.limbReach) / 2);
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.7 + 4 * (1 - unit.blockFlash), -half, half);
    ctx.stroke();
    ctx.restore();
  }

  if (unit.parryFlash > 0) {
    ctx.save();
    ctx.strokeStyle = `rgba(255,235,150,${(0.9 * unit.parryFlash).toFixed(3)})`;
    ctx.lineWidth = 2;
    ctx.translate(x, y);
    ctx.rotate(unit.limbAngle);
    const at = px(unit.radius + unit.actionLength * unit.limbReach);
    const spark = 3 + 7 * (1 - unit.parryFlash);
    for (const angle of [-0.8, -0.25, 0.25, 0.8]) {
      ctx.beginPath();
      ctx.moveTo(at, 0);
      ctx.lineTo(at + Math.cos(angle) * spark, Math.sin(angle) * spark);
      ctx.stroke();
    }
    ctx.restore();
  }
}

// -------------------------------------------------------------- silhouettes
//
// One `Path2D` per `UnitKind`, built once at module scope in a coordinate space
// where **the sim's own body circle is the unit circle** and +x is the way the
// body is facing. `drawCharacter` scales that space by `px(unit.radius)` and
// nothing else, which is what stops the art and the hitbox drifting apart: a
// shoulder that overhangs the circle here overhangs it by the same fraction of
// the *real* radius at every zoom on every body, and the circle underneath is
// still drawn. House rule 4 -- the page never paints a shape the sim will treat
// as somewhere you can be hit and then hides where the hitbox actually is.
//
// Every one of these is a closed outline meant to be filled. None of them says
// anything about reach: what a body can touch is `drawLimb`'s business and it
// is gated on the role, because the sim refuses a guard and a runner a blade.

/** Broad shoulders, upright, square stance. Straight edges and cut corners, and
 *  the flattest leading edge in the roster: the Fighter is the only body here
 *  that squares up to what it is fighting. */
function fighterPath() {
  const p = new Path2D();
  p.moveTo(0.80, -0.30);
  p.lineTo(0.66, -0.86);
  p.lineTo(0.30, -1.14);
  p.lineTo(-0.40, -1.14);
  p.lineTo(-0.80, -0.80);
  p.lineTo(-0.80, 0.80);
  p.lineTo(-0.40, 1.14);
  p.lineTo(0.30, 1.14);
  p.lineTo(0.66, 0.86);
  p.lineTo(0.80, 0.30);
  p.closePath();
  return p;
}

/** Lean, hooded, narrow shoulders: half the beam of the Fighter and a third
 *  again as long, pointed at the front, because the hood is the tell. */
function roguePath() {
  const p = new Path2D();
  p.moveTo(1.08, 0);
  p.quadraticCurveTo(0.44, -0.36, 0.08, -0.56);
  p.lineTo(-0.54, -0.62);
  p.quadraticCurveTo(-1.00, -0.32, -0.92, 0);
  p.quadraticCurveTo(-1.00, 0.32, -0.54, 0.62);
  p.lineTo(0.08, 0.56);
  p.quadraticCurveTo(0.44, 0.36, 1.08, 0);
  p.closePath();
  return p;
}

/** Hulking, head sunk between two shoulder humps, wide base. The notch in the
 *  middle of the leading edge is the whole read: the Brute has no neck, and the
 *  head below sits down inside it. */
function brutePath() {
  const p = new Path2D();
  p.moveTo(0.28, -1.26);
  p.quadraticCurveTo(0.68, -0.76, 0.54, -0.38);
  p.lineTo(0.42, 0);
  p.lineTo(0.54, 0.38);
  p.quadraticCurveTo(0.68, 0.76, 0.28, 1.26);
  p.lineTo(-0.36, 1.30);
  p.quadraticCurveTo(-1.04, 1.00, -0.98, 0);
  p.quadraticCurveTo(-1.04, -1.00, -0.36, -1.30);
  p.closePath();
  return p;
}

/** A small central mass with six splayed legs. Nothing else in the roster has
 *  anything sticking out of it, which is what makes this readable at four
 *  pixels a body -- and four pixels is what a 0.30-radius Skitterer is at the
 *  default framing. */
function skittererPath() {
  const p = new Path2D();
  // Legs first, as their own closed sub-paths. Swept back rather than fanned
  // evenly, so the shape still says which way it is going.
  for (const angle of [-2.4, -1.62, -0.86, 0.86, 1.62, 2.4]) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    p.moveTo(c * 0.32 - s * 0.17, s * 0.32 + c * 0.17);
    p.lineTo(c * 1.18, s * 1.18);
    p.lineTo(c * 0.32 + s * 0.17, s * 0.32 - c * 0.17);
    p.closePath();
  }
  p.moveTo(0.74, 0);
  p.quadraticCurveTo(0.32, -0.50, -0.28, -0.48);
  p.quadraticCurveTo(-0.76, -0.30, -0.72, 0);
  p.quadraticCurveTo(-0.76, 0.30, -0.28, 0.48);
  p.quadraticCurveTo(0.32, 0.50, 0.74, 0);
  p.closePath();
  return p;
}

const SILHOUETTES = {
  [BODY_FIGHTER]: fighterPath(),
  [BODY_ROGUE]: roguePath(),
  [BODY_BRUTE]: brutePath(),
  [BODY_SKITTERER]: skittererPath(),
};

/** Where each archetype carries its head, in body radii along the facing, and
 *  how big it is. The Brute's is small and barely clear of its shoulders and
 *  the Skitterer's is out in front of it; from directly above, that difference
 *  is most of what tells two dark shapes apart. */
const HEADS = {
  [BODY_FIGHTER]: { at: 0.40, r: 0.32 },
  [BODY_ROGUE]: { at: 0.44, r: 0.28 },
  [BODY_BRUTE]: { at: 0.22, r: 0.30 },
  [BODY_SKITTERER]: { at: 0.46, r: 0.22 },
};

/** A body the roster does not describe still has to draw as something. The
 *  Fighter is the fallback because it is the roundest of the four: an unknown
 *  archetype reads as "a body" rather than miming a Brute it is not. */
function silhouetteOf(kind) {
  return SILHOUETTES[kind] || SILHOUETTES[BODY_FIGHTER];
}

function headOf(kind) {
  return HEADS[kind] || HEADS[BODY_FIGHTER];
}

/** Half the facing wedge's angle, and how far out it reaches, in body radii.
 *
 *  Wide and short rather than narrow and long: it is a statement about which way
 *  a disc is pointing, not a claim about what it can reach -- `drawReach` owns
 *  that and draws a ring, not a fan. */
const WEDGE_HALF = 0.62;
const WEDGE_REACH = 1.7;

/**
 * A character, as a character.
 *
 * Six passes, and the order of the first two is the point of the whole
 * function: the shadow separates the body from a floor that now has texture in
 * it, and then **the sim's collision circle is drawn, under the art and again
 * over it**. Every silhouette here overhangs that circle somewhere -- a Brute's
 * shoulders by a quarter of a radius, a Skitterer's legs by more -- and a
 * player who cannot see where the real edge is cannot read a shove, a wall stop
 * or why a blade that visibly clipped a leg did nothing. House rule 4.
 *
 * Faction drives colour and archetype drives shape, and neither crosses over.
 *
 * With `artOn()` false, passes 1 to 5 are replaced wholesale by a disc and a
 * wedge and pass 6 flashes the disc. **That is one branch and not two
 * functions**, which is what keeps every readout below it -- the limb, the
 * markers, the chevrons, the circle -- written once.
 *
 * `ghost` is `null` for a body the player can see and a `ghostOf` descriptor for
 * one it is only remembering; see `ghostOf` for what the three stages look like.
 */
function drawCharacter(unit, now, ghost) {
  const skin = skinOf(unit);
  const x = px(unit.x);
  const y = px(unit.y);
  const r = px(unit.radius);
  const path = silhouetteOf(unit.kind);
  const head = headOf(unit.kind);
  const art = artOn();

  if (!(r > 0)) return;

  ctx.save();
  // A ghost is this same body at a falling alpha, which is what makes losing
  // sight of something read as losing sight of it rather than as a sprite being
  // switched off. Set before the translate, so every pass below inherits it.
  if (ghost) ctx.globalAlpha = ghost.alpha;
  ctx.translate(x, y);
  // The body gradient is built here, *before* the rotation, so the light stays
  // where the room's light is instead of spinning with the character. It is in
  // pixels rather than radii for the same reason -- it is the only thing in
  // this function that does not belong to the body.
  //
  // Not built at all with the art off. A body is one colour when the question is
  // where it is, and this is the one thing in the function that is not free.
  let body = null;
  if (art) {
    body = ctx.createLinearGradient(0, -r, 0, r);
    body.addColorStop(0, skin.body[1]);
    body.addColorStop(1, skin.deep);
  }

  ctx.rotate(unit.facing);
  // Into the unit-radius space every path below is written in. Line widths go
  // with it, which is why the strokes from here down are quoted in radii.
  ctx.scale(r, r);

  if (ghost && ghost.outline) {
    // The last known pose, as an outline, and **nothing at all about what the
    // body is doing now**: no limb, no hit markers, no sprint chevrons, no
    // collision circle. Those four describe a body somebody is watching, and the
    // whole claim of a ghost is that nobody is.
    //
    // Dashed because that is already this page's word for "not confirmed" -- the
    // unacknowledged destination ring and the shut portal are both dashed -- and
    // an outline because the shape is remembered rather than seen.
    ctx.setLineDash([0.28, 0.22]);
    ctx.lineWidth = 0.11;
    ctx.strokeStyle = `rgba(${skin.glow},0.85)`;
    if (art) {
      ctx.stroke(path);
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, 1, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
    return;
  }

  if (!art) {
    // The pre-silhouette body: a disc and a wedge. No shadow (the light is art),
    // no silhouette (the shape of a Brute is art), no gradient (a body is one
    // colour when the question is where it is). The wedge stays, because which
    // way something is facing is the single most load-bearing fact on screen.
    //
    // The wedge goes down *first*, under the disc, so it reads as a fan coming
    // out from behind the body rather than as a tint across its front half --
    // which is what it looked like drawn over the top, and a two-tone body says
    // "wounded" on every other page in this genre.
    //
    // It carries the intent on exactly the alphas the rim light uses, so the two
    // modes agree about what "bearing down" looks like.
    const fan = unit.intent === INTENT_ATTACK ? 1 : unit.intent === INTENT_FLEE ? 0 : 0.5;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, WEDGE_REACH, -WEDGE_HALF, WEDGE_HALF);
    ctx.closePath();
    ctx.fillStyle = `rgba(${skin.wedge},${(0.08 + 0.20 * fan).toFixed(3)})`;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, TAU);
    ctx.fillStyle = skin.deep;
    ctx.fill();
    ctx.lineWidth = 1 / r;
    ctx.strokeStyle = skin.body[1];
    ctx.stroke();
  } else {
    // 1. The ground shadow: **the silhouette itself**, dropped down the screen.
    //    A plain ellipse was tried and a Brute -- two and a half radii across the
    //    beam and one and a half front to back -- wore it as a dark crescent
    //    sticking out of its chest whenever it turned side-on. The drop is
    //    counter-rotated so it stays down the *screen*: the light belongs to the
    //    room, not to the character, and must not spin when the body turns.
    const drop = 0.28;
    const sx = Math.sin(unit.facing) * drop;
    const sy = Math.cos(unit.facing) * drop;
    ctx.translate(sx, sy);
    ctx.fillStyle = "rgba(0,0,0,0.42)";
    ctx.fill(path);
    ctx.beginPath();
    ctx.arc(head.at, 0, head.r, 0, TAU);
    ctx.fill();
    ctx.translate(-sx, -sy);

    // 2. The body circle, rimmed and not filled. It was filled dark to begin
    //    with, and the Brute's notched front showed the fill through as a black
    //    hole punched in its chest -- the art has to *sit on* the circle, not
    //    stand in a well cut out of it. One device pixel wide whatever `r` is,
    //    which is why the width is quoted as its reciprocal.
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, TAU);
    ctx.strokeStyle = "rgba(150,180,230,0.30)";
    ctx.lineWidth = 1 / r;
    ctx.stroke();

    // 3. The silhouette.
    ctx.fillStyle = body;
    ctx.fill(path);
    ctx.strokeStyle = "rgba(9,11,16,0.85)";
    ctx.lineWidth = 0.09;
    ctx.stroke(path);

    // 4. The head, forward along the facing and in the *pale* end of the palette:
    //    it is the part of the body nearest the light, and painting it dark made
    //    it read as a hole rather than as a head.
    ctx.beginPath();
    ctx.arc(head.at, 0, head.r, 0, TAU);
    ctx.fillStyle = skin.body[0];
    ctx.fill();
    ctx.strokeStyle = "rgba(9,11,16,0.75)";
    ctx.lineWidth = 0.07;
    ctx.stroke();

    // 5. The rim light, in the faction colour, along the leading edge.
    //
    //    Clipped to the silhouette so it is an inner rim rather than a halo, and
    //    faded to nothing at the back, because at four pixels a body this line is
    //    the only thing left saying which side the thing is on.
    //
    //    It also carries the intent, which is what retired the facing wedge: a
    //    body bearing down burns at nearly full alpha and one backing off is
    //    barely lit. The *hue* never moves -- shifting that would trade a read
    //    you sometimes need for one you always do.
    const heat = unit.intent === INTENT_ATTACK ? 1 : unit.intent === INTENT_FLEE ? 0 : 0.5;
    ctx.save();
    ctx.clip(path);
    const rim = ctx.createLinearGradient(-0.7, 0, 1.05, 0);
    rim.addColorStop(0, `rgba(${skin.wedge},0)`);
    rim.addColorStop(1, `rgba(${skin.wedge},${(0.24 + 0.72 * heat).toFixed(3)})`);
    ctx.strokeStyle = rim;
    ctx.lineWidth = 0.20 + 0.20 * heat;
    ctx.stroke(path);
    ctx.restore();
  }

  // 6. The blow landing, clipped to the shapes that were actually drawn.
  //    Straight from the frame: the sim counts it down from its own
  //    `Event::Damage`, so the page no longer has to tell a blow from
  //    regeneration by watching health fall.
  //
  //    "The shapes that were actually drawn" is why this branches too: with the
  //    art off there is no silhouette and no head to flash, and flashing them
  //    anyway would print a Brute's shoulders on screen for four frames in a mode
  //    that has spent the whole function not drawing them.
  if (unit.hitFlash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${(0.75 * unit.hitFlash).toFixed(3)})`;
    if (art) {
      ctx.fill(path);
      ctx.beginPath();
      ctx.arc(head.at, 0, head.r, 0, TAU);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, 1, 0, TAU);
      ctx.fill();
    }
  }
  ctx.restore();

  // The collision circle once more, over the art this time. Faint, and always
  // there: see the block comment above.
  //
  // **Only where there is art on top of it to justify a second stroke.** With
  // the art off the disc that was just filled *is* the collision circle, so
  // drawing this would be a second line on the very same curve. House rule 4 is
  // satisfied either way: what it forbids is painting a shape the sim will treat
  // as hittable and then hiding where the real edge is, and in `[tactical]` the
  // shape and the edge are the same circle. A ghost is skipped for a different
  // reason -- it is not a hitbox at all.
  if (art && !ghost) {
    ctx.save();
    ctx.strokeStyle = "rgba(214,232,255,0.26)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  if (!ghost) {
    drawSprint(unit, skin, now);
    drawLimb(unit, skin);
    drawMarks(unit);
  }
}

/**
 * A runner, drawn as speed rather than as a stick.
 *
 * **Legs are not drawn in the hand, and that is deliberate.** `drawLimb` puts a
 * segment on screen because damage is geometric and the segment *is* the
 * hitbox; the sim refuses a `Role::Move` limb a blade at all
 * (`Role::is_live_capable`), so painting one would advertise a threat that
 * cannot exist -- the exact lie the role gates in `drawLimb` were added to
 * prevent.
 *
 * What is mechanically true about a runner is that it covers 1.35 units of
 * ground for every one everybody else covers, so that is what gets drawn:
 * chevrons trailing the direction of travel, pulsed like `drawReach`'s ring so
 * the two read as the same family of hint.
 */
function drawSprint(unit, skin, now) {
  if (unit.role !== ROLE_MOVE) return;
  const beat = (Math.sin(now / 150) + 1) / 2;
  const r = px(unit.radius);
  ctx.save();
  ctx.translate(px(unit.x), px(unit.y));
  ctx.rotate(unit.facing);
  ctx.strokeStyle = `rgba(${skin.wedge},${(0.35 + 0.35 * beat).toFixed(3)})`;
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  for (const back of [1.35, 1.85]) {
    ctx.beginPath();
    ctx.moveTo(-r * back + r * 0.45, -r * 0.55);
    ctx.lineTo(-r * back, 0);
    ctx.lineTo(-r * back + r * 0.45, r * 0.55);
    ctx.stroke();
  }
  ctx.restore();
}

/** How long an arrow is drawn, in world units. Presentation, not physics: the
 *  sim's arrow is a point, and `resolve_shots` tests the segment it travelled
 *  this tick rather than a shaft of any length. */
const SHAFT = 0.34;

/**
 * Arrows in flight.
 *
 * The one thing on this canvas that is neither a body nor attached to one, and
 * the reason the frame grew a section rather than a column. What it has to show
 * is **where it is going**, because that is the whole of what a player can do
 * about it: an arrow is dodged by not being on its line, and it carries no
 * other tell once it has left the bow.
 *
 * Tinted by faction like everything else, so an arrow reads as belonging to
 * whoever loosed it while it is still ambiguous which way it is crossing.
 */
function drawShots(shots) {
  if (!shots.length) return;
  ctx.save();
  ctx.lineCap = "round";
  for (const shot of shots) {
    const skin = shot.faction === FACTION_HEROES ? HERO_SKIN : MONSTER_SKIN;
    const x = px(shot.x);
    const y = px(shot.y);
    ctx.translate(x, y);
    ctx.rotate(shot.heading);
    // The shaft trails *behind* the point, so the bright end is the end that
    // arrives -- which is the end a player has to judge.
    ctx.strokeStyle = `rgba(${skin.wedge},0.55)`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-px(SHAFT), 0);
    ctx.lineTo(0, 0);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.95)";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-px(SHAFT) * 0.28, 0);
    ctx.lineTo(0, 0);
    ctx.stroke();
    ctx.rotate(-shot.heading);
    ctx.translate(-x, -y);
  }
  ctx.restore();
}

/** A health bar above the body. Drawn once anything is wounded or anything
 *  hostile is in the room, so an empty room looks exactly as it did before the
 *  spawn buttons existed and the bars *appearing* is itself the news. */
function drawHealth(unit, skin) {
  const frac = clamp(unit.maxHp > 0 ? unit.hp / unit.maxHp : 0, 0, 1);
  const w = Math.max(16, px(unit.radius) * 2.4);
  const h = 3.5;
  const x = px(unit.x) - w / 2;
  const y = px(unit.y) - px(unit.radius) - 8;

  ctx.save();
  ctx.fillStyle = "rgba(9,11,16,0.72)";
  roundRect(x - 1, y - 1, w + 2, h + 2, 2);
  ctx.fill();
  ctx.fillStyle = frac > LOW_HEALTH ? skin.bar : "#ff5f52";
  ctx.fillRect(x, y, w * frac, h);
  ctx.restore();
}

function drawCorpses() {
  for (const c of corpses) {
    const t = c.age / CORPSE_MS;
    if (t >= 1) continue;
    const skin = c.faction === FACTION_HEROES ? HERO_SKIN : MONSTER_SKIN;
    // Settling as it fades, so a death reads as a body going down rather than
    // a sprite being switched off. As its own silhouette, facing the way it was
    // facing: a Brute that fell has to be recognisable as the Brute that fell,
    // or the room after a fight is a scatter of anonymous smudges.
    const r = px(c.radius) * (1 - 0.45 * t);
    if (r < 0.4) continue;
    ctx.save();
    ctx.translate(px(c.x), px(c.y));
    ctx.rotate(c.facing);
    ctx.scale(r, r);
    ctx.fillStyle = `rgba(${skin.glow},${(0.42 * (1 - t)).toFixed(3)})`;
    ctx.fill(silhouetteOf(c.kind));
    ctx.restore();
  }
}

/** How long a body takes to fade once the character loses sight of it. */
const GHOST_FADE_MS = 400;
/** How long its last-known outline lingers after that. */
const GHOST_HOLD_MS = 2000;

/**
 * What to draw for a body the player cannot see, or `null` for nothing at all.
 *
 * Three stages, and the first one is the point: a monster that steps behind rock
 * **fades** rather than blinking out, so what the player loses is the live
 * picture and not the fact that something was there a second ago. After the fade
 * a dashed outline holds the last pose for two seconds, and then that goes too.
 *
 * | `lost` | drawn as |
 * |---|---|
 * | `0` | normally -- this function is not called |
 * | `< GHOST_FADE_MS` | normally, at falling alpha |
 * | `< GHOST_FADE_MS + GHOST_HOLD_MS` | dashed outline at the last pose, fading |
 * | beyond | not drawn |
 *
 * Aged on the wall clock like `trail`, the floaters and the corpses -- and on the
 * *paused-aware* clock, so a ghost does not quietly expire while the world is
 * frozen and the player is looking at it.
 */
function ghostOf(lost) {
  if (!(lost > 0)) return null;
  if (lost < GHOST_FADE_MS) return { alpha: 1 - lost / GHOST_FADE_MS, outline: false };
  const held = (lost - GHOST_FADE_MS) / GHOST_HOLD_MS;
  if (held >= 1) return null;
  // Never quite reaching zero: the last frame of an outline is at 0.45 * (1/60),
  // which is invisible, and easing all the way out is what stops the disappearance
  // itself being an event on screen.
  return { alpha: 0.45 * (1 - held), outline: true };
}

/**
 * One body: what it is, or what the page last saw of it.
 *
 * **A ghost goes through `drawCharacter` and not through a routine of its own.**
 * The alternative was a second small renderer for remembered bodies, and a second
 * renderer is how a Skitterer ends up with six legs in one mode and four in the
 * other.
 *
 * The pose comes out of `bodies`, which `syncBodies` froze at the moment sight was
 * lost -- see there for why that matters. Drawing the live row's coordinates
 * instead would be a wallhack with a fade on it.
 */
function drawBody(unit, now) {
  if (canSee(unit)) {
    drawCharacter(unit, now, null);
    return;
  }
  const remembered = bodies.get(unit.id);
  const ghost = ghostOf(remembered ? remembered.lost : 0);
  if (!ghost) return;
  // A shallow copy per unseen body per frame, capped by `MAX_UNITS`. The
  // alternative -- teaching `drawCharacter` to take a pose beside its unit --
  // spreads the frozen coordinates across two files' worth of call sites.
  const pose = Object.assign({}, unit, {
    x: remembered.x,
    y: remembered.y,
    radius: remembered.radius,
    facing: remembered.facing,
  });
  drawCharacter(pose, now, ghost);
}

// -------------------------------------------------------------- action icons
//
// **One table, two consumers.** These are 24x24 viewBox path-data strings and
// not draw calls, because the canvas is not the only thing that needs a picture
// of a knife: the callout pill below builds a `Path2D` out of each one, and the
// HUD's action bar and loadout selects inline the same string in an
// `<svg viewBox="0 0 24 24">`. One table is what makes it impossible for the
// canvas and the DOM to disagree about what a knife looks like.
//
// Every glyph is a **closed outline meant to be filled** -- `ctx.fill(path)` on
// one side, a bare `<path d>` with the default fill on the other. Do not stroke
// them; a stroke-designed glyph renders as a blob under `fill`, which is
// exactly the sort of thing that only shows up in one of the two consumers.
//
// Keyed on the **action code from the registry** (`ActionKind::code`, which is
// append-only), never on an index into `ACTIONS` and never on a name. A code
// with no entry here falls through to `ICON_FALLBACK` rather than throwing, so
// appending a ninth action in Rust adds an unlabelled ring to the page instead
// of a blank canvas and a stack trace.
const ICON_PATHS = {
  // 0 Punch -- a fist, knuckles forward.
  0: "M6 11h9c2.2 0 4 1.8 4 4v2c0 1.7-1.3 3-3 3H8c-1.7 0-3-1.3-3-3v-4l1-2z M7 10V7a1.5 1.5 0 0 1 3 0v3z M11 10V6a1.5 1.5 0 0 1 3 0v4z M15 10V7.2a1.5 1.5 0 0 1 3 0V10z",
  // 1 Knife -- one straight edge and one slanted back, a small guard, no
  // pommel. Asymmetric on purpose: that is what stops it reading as a short
  // sword at sixteen pixels.
  1: "M9.8 13.4V6.6L15 3.4v10z M7.4 14h9.2v1.7H7.4z M11 16.3h2.4v4.4H11z",
  // 2 Sword -- the reference blade: long, narrow, double-edged, round pommel.
  2: "M12 1.4l1.9 4.2v9h-3.8v-9z M5.6 15.2h12.8v1.9H5.6z M10.9 17.6h2.2v2.8h-2.2z M12 22.4a2 2 0 1 1 0-4 2 2 0 0 1 0 4z",
  // 3 Club -- all the weight at the top, and a handle you can barely see.
  3: "M12 1.6c3.1 0 5.4 2.2 5.4 5.2 0 2.6-1.3 4.2-2.2 5.6l-1 1.6h-4.4l-1-1.6C7.9 11 6.6 9.4 6.6 6.8c0-3 2.3-5.2 5.4-5.2z M10.6 15.4h2.8V22h-2.8z",
  // 4 Shield -- a heater, and the only glyph in the table with no point on it.
  4: "M12 2l8 3v7.2c0 4.6-3.3 8-8 10-4.7-2-8-5.4-8-10V5z",
  // 5 Run -- a chevron pair, which is what the sprint marks on the floor are.
  5: "M4.2 4l8.4 8-8.4 8-2.8-2.8L7 12 1.4 6.8z M13.6 4l8.4 8-8.4 8-2.8-2.8 5.6-5.2-5.6-5.2z",
  // 6 Bow -- a curve and a string, and nothing else. No arrow: at sixteen
  // pixels the third element is what turns a bow into a smudge.
  6: "M7.6 2.4a10.5 10.5 0 0 1 0 19.2l-1.4-1.5a8.4 8.4 0 0 0 0-16.2z M7 2.2h1.2v19.6H7z",
  // 7 Shortsword -- the Rogue's blade: broad, short, and stopped well before
  // the top of the box, so the length difference against the Sword is the read.
  7: "M12 3.6l2.5 4.6v5.2h-5V8.2z M6.6 14h10.8v1.9H6.6z M10.8 16.4h2.4v3.2h-2.4z M9.6 19.8h4.8v1.8H9.6z",
};

/** The glyph for a code the table does not know: a plain ring, drawn with the
 *  inner circle wound the other way so the hole survives a non-zero fill. It
 *  reads as "an action" and claims nothing about which one, which is the right
 *  thing to say about a row this file has never heard of. */
const ICON_FALLBACK =
  "M4 12A8 8 0 0 1 20 12A8 8 0 0 1 4 12ZM7.5 12A4.5 4.5 0 0 0 16.5 12A4.5 4.5 0 0 0 7.5 12Z";

/** The path data for an action code. This is the entry point session 4 wants:
 *  it hands back a string to drop into a `<path d>`. */
function iconPath(code) {
  return ICON_PATHS[code] || ICON_FALLBACK;
}

/** The same glyph as a `Path2D`, built once per code and kept. Parsing path
 *  data is not free and a callout would otherwise re-parse it sixty times a
 *  second for the nine hundred milliseconds it is up. */
const ICON_GLYPHS = new Map();

function iconGlyph(code) {
  let glyph = ICON_GLYPHS.get(code);
  if (!glyph) {
    glyph = new Path2D(iconPath(code));
    ICON_GLYPHS.set(code, glyph);
  }
  return glyph;
}

// ------------------------------------------------------- floaters and pills
//
// Both of these are seeded from `state.events` and both are aged in wall-clock
// milliseconds. Neither may be seeded from a frame that ran no ticks -- see
// `consumeEvents`, which is the only place either list grows.

/** The page's own copy of `--sans` from style.css:16. Repeated rather than read
 *  because `ctx.font` takes a font shorthand and cannot see a custom property.
 *  System faces only: a web font would be this repository's first external
 *  dependency. House rule 1. */
const SANS = 'ui-sans-serif, system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

/** How long a damage number lives, how far it climbs, and how many may be up at
 *  once. The cap is the interesting one: the event feed holds 32 rows and a
 *  crowded room can fill it, and thirty-two numbers on screen is not a readout,
 *  it is a snowstorm. */
const FLOATER_MS = 800;
const FLOATER_RISE = 0.8; // world units
const MAX_FLOATERS = 24;

/** How long an action callout hangs over its actor, and how long a repeat of
 *  the same action by the same actor is swallowed for. The second number is not
 *  optional: a Skitterer's punch has a five-tick windup, so without it the pill
 *  would strobe rather than read. */
const CALLOUT_MS = 900;
const CALLOUT_REPEAT_MS = 250;
const MAX_CALLOUTS = 8;

/**
 * Which side an event's `actor_index` is on, or `null` if nobody knows.
 *
 * Needed because a damage row names its **target**, and "I hit it" and "it hit
 * me" have to look different before the number is read. The unit rows answer it
 * for anything still standing; a body killed by the very blow the row describes
 * is already out of the frame, so the page's own memory of last frame answers
 * for that one -- which is why this must run before `syncBodies` buries it.
 */
function factionOfActor(state, actor) {
  for (const unit of state.units) {
    if (unit.index === actor) return unit.faction;
  }
  const prefix = `${actor}:`;
  for (const [id, seen] of bodies) {
    if (id.startsWith(prefix)) return seen.faction;
  }
  return null;
}

/**
 * Whether the player can see whoever an event row is about.
 *
 * A damage number over a body the character cannot see is information the
 * character does not have, and a callout naming the action it is winding up is
 * worse -- that is the single most useful tell in the game handed over for free.
 * So both are decided **once, as the row is consumed**, rather than per frame: an
 * event happened at an instant, and if the player was watching at that instant
 * they are entitled to the number even if the body then steps out of sight.
 *
 * Resolved the same way `factionOfActor` resolves its side, and for the same
 * reason: a body killed by the very blow this row describes is already out of the
 * frame, so the page's own memory answers for that one.
 */
function actorVisible(state, actor) {
  for (const unit of state.units) {
    if (unit.index === actor) return canSee(unit);
  }
  const prefix = `${actor}:`;
  for (const [id, seen] of bodies) {
    // `lost` is last frame's, which is the right frame: this runs before
    // `syncBodies`, and what is being asked is whether the character had eyes on
    // it when it fell.
    if (id.startsWith(prefix)) return !(seen.lost > 0);
  }
  // Nobody knows. Print it: a number the page cannot attribute is a much smaller
  // problem than one it silently swallows.
  return true;
}

/**
 * One `step()`'s worth of events, turned into things on screen.
 *
 * **Called once per step, never once per animation frame.** The module clears
 * the feed at the top of `step()` rather than per tick, so a frame that ran no
 * ticks -- which at 144 Hz is most of them -- is still holding the previous
 * call's rows, and reading those again prints every damage number twice. `loop`
 * therefore guards this with the same `ticks > 0` that guards the step itself,
 * and passes the frame parsed *after* it. (There is a second parse in `loop`,
 * before the step, for the manual-control input push; consuming from that one
 * would be the same bug a frame earlier.)
 */
function consumeEvents(state) {
  for (let i = 0; i < state.events.length; i++) {
    const event = state.events[i];
    // Nothing is seeded for a body the player cannot see. With the fog off this
    // is never true, so `[dev]` consumes exactly the feed it always did.
    if (!actorVisible(state, event.actor)) continue;
    if (event.kind === EVENT_DAMAGE || event.kind === EVENT_BLOCK) {
      floaters.push({
        kind: event.kind,
        x: event.x,
        y: event.y,
        amount: event.amount,
        hurt: factionOfActor(state, event.actor) === FACTION_HEROES,
        // Two blows on one tick land on the same handful of pixels often enough
        // to matter -- a Skitterer pair on the same flank does it constantly --
        // so each row is nudged sideways by its own place in the feed. From the
        // index and not from `Math.random`, so a run looks the same twice.
        jitter: ((i * 7) % 5) / 5 - 0.4,
        age: 0,
      });
      while (floaters.length > MAX_FLOATERS) floaters.shift();
    } else if (event.kind === EVENT_DECLARE) {
      pushCallout(event);
    }
    // EVENT_PARRY is deliberately not floated. `drawMarks` already puts sparks
    // on the blades that crossed, at the point they crossed at, and a second
    // announcement of the same instant would be noise.
  }
}

/** Ages every wall-clock effect. Called once a frame, before this frame's rows
 *  are consumed, so a floater seeded now starts its life at zero rather than
 *  one frame old. Both lists are pushed in time order, so dropping from the
 *  front is dropping the oldest. */
function ageEffects(elapsed) {
  for (const f of floaters) f.age += elapsed;
  while (floaters.length && floaters[0].age > FLOATER_MS) floaters.shift();
  for (const c of callouts) c.age += elapsed;
  while (callouts.length && callouts[0].age > CALLOUT_MS) callouts.shift();
}

function pushCallout(event) {
  const action = event.amount | 0;
  for (const c of callouts) {
    if (c.actor === event.actor && c.action === action && c.age < CALLOUT_REPEAT_MS) return;
  }
  // `x, y` is where the swinger was standing when it declared, kept only as the
  // fallback for after it falls: while it is alive the pill tracks it.
  callouts.push({ actor: event.actor, action, x: event.x, y: event.y, age: 0 });
  while (callouts.length > MAX_CALLOUTS) callouts.shift();
}

/**
 * Damage numbers, over everything.
 *
 * The colour carries more than the number does: warm white when something else
 * took it, red when the character did. A player has to be able to tell "I hit"
 * from "I was hit" across a room without reading a digit, and in a fight that
 * is decided in a second and a half there is not time to read one anyway.
 *
 * A **blocked** blow gets a tick instead of a number, and that is not a
 * shortcut. A guard eats almost all of a blow and leaks a fraction of it, so
 * the honest figure next to a real hit is something like `0.4` -- printing it
 * would say "that did nothing" about the single most dramatic thing that
 * happens in this game.
 */
function drawFloaters() {
  if (!floaters.length) return;
  const size = Math.round(clamp(px(0.42), 12, 20));
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `700 ${size}px ${SANS}`;
  ctx.lineJoin = "round";
  for (const f of floaters) {
    const t = f.age / FLOATER_MS;
    if (t >= 1) continue;
    // Eased out, so most of the climb happens in the first third and the number
    // is clear of the body by the time the eye arrives at it.
    const rise = (1 - (1 - t) * (1 - t)) * FLOATER_RISE;
    // And fading only in the last third, for the same reason: one that starts
    // fading immediately is one you have to already have been looking at.
    const alpha = t < 0.66 ? 1 : Math.max(0, 1 - (t - 0.66) / 0.34);
    const x = px(f.x + f.jitter * 0.3);
    const y = px(f.y - rise);

    if (f.kind === EVENT_BLOCK) {
      ctx.strokeStyle = `rgba(180,220,255,${(0.9 * alpha).toFixed(3)})`;
      ctx.lineWidth = 2.4;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(x - 5, y);
      ctx.lineTo(x - 1, y + 4.5);
      ctx.lineTo(x + 6, y - 5);
      ctx.stroke();
      continue;
    }

    // Floored at one rather than rounded to zero. A blow that took health off
    // did *something*, and a floating "0" over a body that just lost a sliver
    // is a worse lie than a rounded 1.
    const text = String(Math.max(1, Math.round(f.amount)));
    ctx.lineWidth = 3;
    ctx.strokeStyle = `rgba(6,8,13,${(0.85 * alpha).toFixed(3)})`;
    ctx.strokeText(text, x, y);
    ctx.fillStyle = f.hurt
      ? `rgba(255,104,92,${alpha.toFixed(3)})`
      : `rgba(255,241,214,${alpha.toFixed(3)})`;
    ctx.fillText(text, x, y);
  }
  ctx.restore();
}

/**
 * The "current action" pill: what a body has just committed to, named.
 *
 * Seeded from the declare rows, which the module derives from a per-entity
 * `Swing` transition rather than the page watching for one -- a Punch's windup
 * is five ticks and an animation frame is four, so a page polling for it would
 * miss most of them outright.
 *
 * The name comes from `ACTIONS`, which is read out of the registry at boot.
 * Never a hand-written list: `loadRegistry`'s block comment is about what
 * happens to hand-written lists in this file.
 */
function drawCallouts(state) {
  if (!callouts.length) return;
  ctx.save();
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  for (const c of callouts) {
    const t = c.age / CALLOUT_MS;
    if (t >= 1) continue;

    // Track the actor while it is standing. `actor` is `EntityId::index` with
    // no generation on it, which is a hint and not an identity -- but a slot
    // cannot be freed and refilled twice inside the 900 ms this pill lives, so
    // for this one purpose the hint is enough. Once the body is gone the pill
    // finishes where the declaration happened.
    let x = c.x;
    let y = c.y;
    let radius = 0.5;
    for (const unit of state.units) {
      if (unit.index === c.actor) {
        x = unit.x;
        y = unit.y;
        radius = unit.radius;
        break;
      }
    }

    const alpha = t < 0.72 ? Math.min(1, t / 0.06) : Math.max(0, 1 - (t - 0.72) / 0.28);
    const label = actionName(c.action);
    const h = 20;
    const icon = 14;
    const padX = 7;
    const gap = 5;
    ctx.font = `600 12px ${SANS}`;
    const w = padX * 2 + icon + gap + ctx.measureText(label).width;
    const cx = px(x);
    // Above the health bar rather than on it, and rising a few pixels as it
    // goes, so two pills over two bodies standing close together separate.
    const top = px(y) - px(radius) - 18 - h - 6 * (1 - (1 - t) * (1 - t));

    ctx.globalAlpha = alpha;
    roundRect(cx - w / 2, top, w, h, h / 2);
    ctx.fillStyle = "rgba(10,13,20,0.88)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,196,92,0.55)";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.save();
    ctx.translate(cx - w / 2 + padX, top + (h - icon) / 2);
    ctx.scale(icon / 24, icon / 24);
    ctx.fillStyle = "rgba(255,214,140,0.95)";
    ctx.fill(iconGlyph(c.action));
    ctx.restore();

    ctx.fillStyle = "rgba(233,240,252,0.96)";
    ctx.fillText(label, cx - w / 2 + padX + icon + gap, top + h / 2 + 0.5);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

function render(state, now, arrived) {
  // The camera, and the only place it is applied. Every draw below is written
  // in world-scaled space with the origin at the room's corner -- `px` is a
  // length, not a position -- so panning the view is a translation of the
  // matrix and nothing else has to know the camera exists.
  //
  // The translation itself comes from `viewOrigin()`, which `pointerToWorld`
  // reads too: the device-pixel snap and the safe rect's centre both have to be
  // in the inverse or clicks land somewhere other than where they were made.
  // The clear is still the whole canvas, not the safe rect -- the rails are
  // drawn over the glass rather than cut out of it, and a strip of last frame
  // left showing behind a translucent panel is a smear.
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, viewport.w, viewport.h);
  const origin = viewOrigin();
  ctx.translate(origin.x, origin.y);

  // The compositing order, and it is the map of the whole layer:
  //
  //   ground -> the way out -> trail -> route -> destination -> vision discs
  //          -> corpses -> reach rings -> monsters -> hero -> arrows
  //          -> health bars -> floaters -> callouts
  //
  // Three of those placements are load-bearing. **Vision goes under the
  // bodies**, because a disc drawn over one would put a wash of faction colour
  // across the blade you are trying to read, and six of them overlap in a busy
  // room. **Floaters and callouts go over everything**, including each other's
  // bodies, because a number you cannot read is not a number. And **the way out
  // is on the ground**, under the trail and everything else -- it is a place,
  // not a marker.
  //
  // What used to sit second here was the reachable box: the arena inset by one
  // body radius. It went with the rectangle it described. The honest successor
  // on a carved level would be a tint over gaps a body cannot fit down, which
  // is worth having only if playing without it turns out to want it.
  // The level takes the frame now: the lantern is centred on the character, and
  // that is the only reason -- everything else about the ground is baked.
  drawLevel(state);
  // Drawn in every mode, seen or not. See its own comment: seeing the exit from
  // the moment you arrive is what turns "kill things" into "fight your way
  // there", and the fog does not weaken that argument. One of the two knowing
  // inconsistencies in the fog; `left N` is the other, and it counts every
  // monster alive because it is the level's clear condition, not a perception.
  drawPortal(state, now);
  drawTrail();
  // Where it is going after where it is going, on the ground with the trail and
  // under the mark it is walking to now. Both halves of the picture in one call:
  // the path under the finger, and the path the module is working through.
  drawRoute(state, now);
  // No marker once the character is gone: the order outlives it in the world,
  // but a destination nobody is walking to is a promise the page cannot keep.
  if (state.hero) drawDestination(state, now, arrived);
  // **Everything that reads a body's live numbers is gated on being able to see
  // it**: the vision disc, the reach ring and the health bar. A health bar over a
  // body you cannot see is information the character does not have, and a reach
  // ring is worse -- it is a warning about a blow you were not told was coming.
  // `Y` still means what it means, and the character's own disc is always there,
  // because the hero's row reports visible unconditionally.
  for (const unit of state.units) {
    if (canSee(unit)) drawVision(unit);
  }
  drawCorpses();

  for (const unit of state.units) {
    if (canSee(unit)) drawReach(unit, skinOf(unit), now);
  }
  // Monsters first, then the hero: the character you are commanding must never
  // end up underneath the thing attacking it. Through `drawBody`, which is where
  // "or the memory of one" lives.
  for (const unit of state.monsters) drawBody(unit, now);
  if (state.hero) drawBody(state.hero, now);
  // Arrows over the bodies, so one crossing a fight is not hidden by it.
  drawShots(state.shots);

  const fighting = state.monsters.length > 0;
  for (const unit of state.units) {
    if (canSee(unit) && (fighting || unit.hp < unit.maxHp)) drawHealth(unit, skinOf(unit));
  }

  drawFloaters();
  drawCallouts(state);
}

// ---------------------------------------------------------------------- hud

// ------------------------------------------------------------- the life globe
//
// A canvas rather than a stack of divs, because the surface moves: the liquid
// has a wall-clock wobble on it, and a CSS keyframe would be an animation the
// page has no way to stop when the sim does. It is presentation all the way
// down -- house rule 6 -- so it is aged on `now` like `trail` and the floaters
// and never on a tick.

const globe = document.getElementById("globe");
const globeCtx = globe.getContext("2d");

/** The CSS size and device pixel ratio the backing store was last built for.
 *  The globe is sized in `vmin`, so both of these move on their own. */
let globeSize = 0;
let globeDpr = 0;

function drawGlobe(state, now) {
  const css = Math.max(1, Math.round(globe.clientWidth));
  if (css !== globeSize || dpr !== globeDpr) {
    globeSize = css;
    globeDpr = dpr;
    globe.width = Math.round(css * dpr);
    globe.height = Math.round(css * dpr);
  }

  const g = globeCtx;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, css, css);

  const hero = state.hero;
  const frac = hero && hero.maxHp > 0 ? clamp(hero.hp / hero.maxHp, 0, 1) : 0;
  // The same threshold `drawHealth` and `#hp-fill` use, from the same constant.
  const low = frac <= LOW_HEALTH;
  const mid = css / 2;
  const r = css / 2 - 3;

  g.save();
  g.beginPath();
  g.arc(mid, mid, r, 0, TAU);
  g.clip();

  // The empty well behind the liquid. Lit from the same upper-left the room is.
  const well = g.createRadialGradient(mid - r * 0.35, mid - r * 0.45, r * 0.08, mid, mid, r);
  well.addColorStop(0, "#1a2230");
  well.addColorStop(1, "#070910");
  g.fillStyle = well;
  g.fillRect(0, 0, css, css);

  if (hero && frac > 0) {
    // The liquid, filled from the bottom. Two sine waves at different rates so
    // the surface never settles into an obvious loop -- one is a pendulum.
    const top = mid + r - 2 * r * frac;
    const amp = Math.max(1.1, r * 0.05);
    g.beginPath();
    g.moveTo(mid - r, css);
    g.lineTo(mid - r, top);
    for (let x = -r; x <= r; x += 2) {
      const wobble =
        Math.sin((x / r) * 2.6 + now / 520) * amp + Math.sin((x / r) * 4.7 - now / 310) * amp * 0.4;
      g.lineTo(mid + x, top + wobble);
    }
    g.lineTo(mid + r, css);
    g.closePath();

    const liquid = g.createLinearGradient(0, top - r * 0.4, 0, css);
    if (low) {
      liquid.addColorStop(0, "#ff8a7a");
      liquid.addColorStop(1, "#7a1c14");
    } else {
      liquid.addColorStop(0, "#8ff2ff");
      liquid.addColorStop(1, "#14556c");
    }
    g.fillStyle = liquid;
    g.fill();

    // A brighter meniscus, so the top of the liquid reads as a surface rather
    // than as the edge of a fill.
    g.strokeStyle = low ? "rgba(255,220,210,0.75)" : "rgba(214,248,255,0.75)";
    g.lineWidth = 1.6;
    g.stroke();
  }

  // The inner shadow that turns a disc into a sphere.
  const sphere = g.createRadialGradient(mid - r * 0.3, mid - r * 0.35, r * 0.2, mid, mid, r);
  sphere.addColorStop(0, "rgba(255,255,255,0.10)");
  sphere.addColorStop(0.55, "rgba(0,0,0,0)");
  sphere.addColorStop(1, "rgba(0,0,0,0.55)");
  g.fillStyle = sphere;
  g.fillRect(0, 0, css, css);

  // Fallen: the globe dims and the button over it becomes the only thing to
  // look at. `updateBattle` is what reveals that button.
  if (!hero) {
    g.fillStyle = "rgba(9,11,16,0.72)";
    g.fillRect(0, 0, css, css);
  }
  g.restore();

  // The rim, which is the part that goes red. Two strokes: a wide soft one for
  // the glow and a hard one for the edge.
  const rim = !hero ? "90,100,120" : low ? "255,95,82" : "110,231,255";
  g.strokeStyle = `rgba(${rim},0.22)`;
  g.lineWidth = 5;
  g.beginPath();
  g.arc(mid, mid, r, 0, TAU);
  g.stroke();
  g.strokeStyle = `rgba(${rim},${hero ? 0.9 : 0.45})`;
  g.lineWidth = 2;
  g.beginPath();
  g.arc(mid, mid, r, 0, TAU);
  g.stroke();

  // The number over it. Not drawn once the character is gone -- the [Re-Spawn]
  // button is sitting there, and "0" under a button is a worse read than
  // nothing at all.
  if (hero) {
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = `700 ${Math.round(css * 0.28)}px ${SANS}`;
    const text = String(Math.max(0, Math.round(hero.hp)));
    g.lineJoin = "round";
    g.lineWidth = 4;
    g.strokeStyle = "rgba(6,8,13,0.85)";
    g.strokeText(text, mid, mid - css * 0.02);
    g.fillStyle = low ? "#ffd8d2" : "#eaf6ff";
    g.fillText(text, mid, mid - css * 0.02);
  }
}

function hex64(hi, lo) {
  return `0x${(hi >>> 0).toString(16).padStart(8, "0")}${(lo >>> 0).toString(16).padStart(8, "0")}`;
}

/** The one thing the page could not say before: who is left standing. */
function updateBattle(state) {
  // **The module's count, not the row count.** The frame's unit rows are capped,
  // so `state.monsters.length` saturates where `monstersLeft` does not, and the
  // number the player is counting down to zero must be the one the portal is
  // keyed on.
  const standing = state.monstersLeft;
  const monsters = `${standing} monster${standing === 1 ? "" : "s"}`;
  setText(el.battleRoster, `${state.hero ? "1 hero" : "no hero"}, ${monsters}`);

  // The run, in the top-left beside the brand. Depth is one-based on screen and
  // zero-based in the module: "floor 1" is where you start, and nobody counts
  // stairs from zero.
  setText(el.runDepth, String(state.depth + 1));
  setText(el.runMonsters, String(standing));

  // [Re-Spawn], over the dimmed globe. The module refuses a second character
  // while one is standing -- an order belongs to the faction, so two heroes
  // would share one click -- so the button only exists in the fallen state
  // anyway, and the globe is where the player is already looking when it
  // starts to mean anything.
  el.respawn.hidden = state.hero !== null;

  // Frozen or not goes on *this* line, and not on a badge of its own: this is
  // the line that answers "what is happening", and "nothing, until you say so"
  // is an answer to that question rather than a separate fact about the page.
  //
  // The line is two halves for that one reason -- the word for what the world is
  // doing, and the detail that qualifies it -- because **`paused` takes the
  // place of the first half and never the second.** Bolting a prefix onto the
  // whole sentence instead gives "paused -- battle -- 3 monsters standing", and
  // the count is exactly the thing the clock was stopped to read.
  //
  // With nobody standing the pause goes unmentioned, deliberately: an empty room
  // was not going anywhere, and the sentence that matters there is the one
  // saying how to get going again. The lit button is still saying it.
  let cls = "state";
  let head = "battle";
  let tail = `${monsters} standing`;
  if (!state.hero) {
    cls = "state dead";
    head = "the character has fallen";
    tail = "send in a new one, or press R for a new room";
  } else if (standing === 0) {
    cls = "state idle";
    if (state.portalState === 2) {
      head = "clear";
      tail = "the way out is open";
    } else {
      head = "quiet";
      tail = "nothing left to fight";
    }
  }
  el.battleState.className = cls;
  setText(el.battleState, `${state.hero && isPaused() ? "paused" : head} — ${tail}`);
}

function updateHud(state, stats, distance, arrived, settled, now) {
  const hero = state.hero;
  // Everything the frame drives, in one place. The kit readout and the action
  // bar read the frame; the Enemy rail reads the module's spawn template, which
  // nothing but this page can move -- it is re-read anyway, because a panel that
  // trusted its own last write is the failure 4.7 is about.
  syncKitReadout(state);
  syncActionBar(state);
  syncEnemyRail();
  drawGlobe(state, now);
  setText(el.simTick, String(wasm.tick()));
  setText(el.simHash, hex64(wasm.state_hash_hi(), wasm.state_hash_lo()));
  setText(el.simPosition, hero ? `${hero.x.toFixed(2)}, ${hero.y.toFixed(2)}` : "—");
  setText(el.unitHp, hero ? `${Math.round(hero.hp)} / ${Math.round(hero.maxHp)} hp` : "fallen");
  // The bar the eye reads, next to the number the eye checks. Same threshold the
  // bars on the canvas and the globe turn red at, from the same constant.
  const health = hero && hero.maxHp > 0 ? clamp(hero.hp / hero.maxHp, 0, 1) : 0;
  el.hpFill.style.width = `${(health * 100).toFixed(1)}%`;
  el.hpFill.classList.toggle("low", health <= LOW_HEALTH);
  setText(
    el.orderDecision,
    state.decisionTick > 0 ? `tick ${state.decisionTick} (every ${stats.decisionPeriod})` : "—"
  );
  updateBattle(state);

  if (!hero) {
    // Every order field below describes a character that is no longer there.
    el.orderState.className = "state dead";
    setText(el.orderState, "there is nobody left to give orders to");
    setText(el.orderDest, "—");
    setText(el.orderDistance, "—");
    return;
  }

  if (state.orderKind === ORDER_HOLD) {
    el.orderState.className = "state free";
    setText(
      el.orderState,
      intent === "free"
        ? "free will — no order at all; the character decides for itself"
        : "no order yet — the character is deciding for itself"
    );
    setText(el.orderDest, "—");
    setText(el.orderDistance, "—");
    return;
  }

  setText(el.orderDest, `${state.orderX.toFixed(2)}, ${state.orderY.toFixed(2)}`);
  setText(el.orderDistance, `${distance.toFixed(2)} units`);

  if (!orderAcknowledged) {
    el.orderState.className = "state";
    setText(el.orderState, "order received — waiting for its next decision");
  } else if (arrived && intent === "stand") {
    el.orderState.className = "state idle";
    setText(el.orderState, "stood down — holding this ground");
  } else if (arrived) {
    el.orderState.className = "state idle";
    setText(el.orderState, "arrived — standing where it stopped");
  } else if (settled) {
    // Short of the mark and no longer moving: the click was inside a wall, and
    // a body cannot stand closer than its own radius to one.
    el.orderState.className = "state idle";
    setText(el.orderState, "stopped — as close to the mark as a body can stand");
  } else {
    el.orderState.className = "state";
    setText(el.orderState, "walking there under its own steering");
  }
}

// --------------------------------------------------------------------- loop

let accumulator = 0;
let lastFrameTime = 0;

/** Whether the world is frozen. Presentation state, and the sim does not know:
 *  pausing is "stop calling `step`", which is the only definition that cannot
 *  drift out of sync with what is on screen.
 *
 *  Read through `isPaused()` and written through `setPaused()` so the button,
 *  the key and the HUD line all hang off one switch -- the same discipline
 *  `visionVisible` has. */
let paused = false;

function isPaused() {
  return paused;
}

function setPaused(on) {
  paused = !!on;
  // The glyph, the word and `aria-pressed` all written here, off the one
  // switch. Three faces of one fact, and this is the only control on the page
  // that can leave the room looking broken if two of them disagree.
  el.pause.setAttribute("aria-pressed", String(paused));
  setText(el.pauseGlyph, paused ? "▶" : "▌▌");
  setText(el.pauseLabel, paused ? "Resume" : "Pause");
  hint(
    paused
      ? "Frozen. Orders still land -- click, drag a path, stand down -- and nothing moves until you resume."
      : "Running again."
  );
}

/**
 * The page's entire memory, refreshed once a frame.
 *
 * Only deaths live here now. A blow landing used to as well, inferred from
 * health falling between two frames and guarded by an epsilon so that
 * out-of-combat regeneration did not read as one -- which still could not see a
 * blocked blow, because a blocked blow barely moves health at all. The sim
 * reports all three outcomes as frame columns instead, and this is left with
 * the one thing a frame genuinely cannot say: that a body which was here is
 * not any more.
 *
 * Keyed on the entity handle, never the row: `write_frame` omits the dead, so
 * one monster falling shifts every row below it up by one and a row-keyed
 * version of this would bury the wrong bodies.
 *
 * Deaths are no longer the only thing here. A body the character cannot see is a
 * body the frame still carries and the page must stop believing, so this is also
 * where a **ghost** is kept: the pose freezes and `lost` starts climbing.
 */
function syncBodies(state, now, elapsed) {
  const live = new Set();
  for (const unit of state.units) {
    live.add(unit.id);
    // Read **before** the `set` below, which replaces the object wholesale.
    // Reading it after would be reading this frame's own row back, and `lost`
    // would never climb off zero.
    const prior = bodies.get(unit.id);
    const visible = canSee(unit);
    // Milliseconds since the character last had eyes on it, `0` while it still
    // does, and **`Infinity` for a body it has never seen at all**.
    //
    // That third case is not a nicety. Every row is in the frame from the moment
    // the level is carved, so on the first frame of a floor there is no `prior`
    // for anything -- and starting those at `0` meant that on the second frame
    // they began ageing as though sight had just been lost, which drew every
    // monster on the level, at its real position, fading and then dashed, for the
    // two and a half seconds after every arrival. `Infinity + elapsed` is still
    // `Infinity`, so nothing downstream has to remember which case it is in:
    // `ghostOf` returns nothing, no corpse is banked, and no floater is seeded.
    //
    // Aged on the same paused-aware clock the corpses are, and reset the moment it
    // comes back -- a monster that steps out and back is one body, not two.
    const lost = visible ? 0 : prior && prior.lost < Infinity ? prior.lost + elapsed : Infinity;
    // **The pose freezes the moment sight is lost, and that is the whole honesty
    // of a ghost.** Kept live, it would be a dashed outline that follows a
    // monster through solid rock -- a wallhack with a fade on it. What the player
    // is shown is where the thing *was*. A body never seen has no pose worth
    // keeping, so it goes on tracking the live row until it has one.
    const pose = lost === 0 || lost === Infinity ? unit : prior;
    bodies.set(unit.id, {
      x: pose.x,
      y: pose.y,
      radius: pose.radius,
      faction: unit.faction,
      // Enough to draw the thing again after it has left the frame: which
      // silhouette it was and which way it was pointing when it stopped being
      // in one. `faction` earns a second keep here -- `factionOfActor` reads it
      // to colour the number that did the killing.
      kind: unit.kind,
      facing: pose.facing,
      lost,
    });
  }

  for (const [id, seen] of bodies) {
    if (live.has(id)) continue;
    // A body that was **already out of sight leaves no corpse**. A corpse is a
    // thing you watched fall: a solid silhouette fading in on top of a ghost's
    // dashed outline would announce a death the character never saw, and look
    // like the page glitching while it did it. The ghost is all the player gets,
    // and an outline that stops is indistinguishable from one that timed out --
    // which is the point. Risk 4 in the plan: correct, and it will look like a bug
    // to anybody who knows it died.
    if (seen.lost > 0) {
      bodies.delete(id);
      continue;
    }
    corpses.push({
      x: seen.x,
      y: seen.y,
      radius: seen.radius,
      faction: seen.faction,
      kind: seen.kind,
      facing: seen.facing,
      age: 0,
    });
    bodies.delete(id);
  }

  for (const c of corpses) c.age += elapsed;
  while (corpses.length && corpses[0].age > CORPSE_MS) corpses.shift();
}

function loop(now) {
  if (dead) return;
  rafId = requestAnimationFrame(loop);

  let elapsed = now - lastFrameTime;
  lastFrameTime = now;
  if (!Number.isFinite(elapsed) || elapsed < 0) elapsed = 0;
  if (elapsed > MAX_FRAME_MS) elapsed = MAX_FRAME_MS;
  accumulator += elapsed;

  let ticks = Math.floor(accumulator / TICK_MS);
  if (ticks > MAX_CATCHUP_TICKS) {
    // Drop the rest of the backlog rather than paying it off over the next
    // several frames, which is how a stutter becomes a spiral.
    ticks = MAX_CATCHUP_TICKS;
    accumulator = 0;
  } else {
    accumulator -= ticks * TICK_MS;
  }
  // Frozen: no ticks, and no backlog to pay off on resume either. Draining the
  // accumulator is what stops a minute spent paused from arriving as one
  // eight-tick lurch the moment play starts again.
  if (paused) {
    ticks = 0;
    accumulator = 0;
  }
  // Before stepping, not after: whatever the player is holding has to be in
  // place for the ticks that are about to run, or every input is one frame late.
  if (controlMask) pushInput(parseFrame(readFrame()));
  if (ticks > 0) wasm.step(ticks);
  if (dead) return;

  const state = parseFrame(readFrame());
  if (state.arenaX !== arena.x || state.arenaY !== arena.y) {
    arena = { x: state.arenaX, y: state.arenaY };
    resize();
    snapCamera(state);
  }
  // **Every level is the same size, so the check above will not fire on a
  // descent.** Without this one the page keeps the previous floor's baked
  // paths, pans the camera across a level it is not on, and ages floaters off
  // bodies that no longer exist. The same set of resets `restart` performs, for
  // the same reason.
  if (wasm.map_revision() !== levelPaths.revision) {
    rebuildLevelPaths(readMap(), wasm.map_revision());
    trail = [];
    // The waypoints describe a floor plan that no longer exists. `descend`
    // drops the module's own queue; a drag still under the hand is the page's
    // problem alone, and releasing it onto the new floor would order a walk
    // along a corridor from the last one.
    cancelDrag();
    routeDrawn = [];
    bodies = new Map();
    corpses = [];
    floaters = [];
    callouts = [];
    announcedFall = false;
    orderKey = "";
    orderAcknowledged = false;
    stillSince = 0;
    snapCamera(state);
    if (state.depth > 0) hint(`Level ${state.depth + 1}. Something else is down here.`);
  } else if (levelPaths.fog && wasm.vis_revision() !== levelPaths.vis) {
    // The lit region moved. Re-bake -- and **only here**: `vis_revision` moves
    // when the character crosses a tile, which is a few times a second at a run
    // and never on a frame where nothing changed.
    //
    // Guarded on the flags the paths were *baked* under rather than on `fogOn()`,
    // so that a mode change is caught by the branch below it and not by this one.
    rebuildLevelPaths(readMap(), wasm.map_revision());
  } else if (levelPaths.scale !== scale) {
    // A `Path2D` holds pixels. A zoom or a resize invalidates it just as surely
    // as a new level does -- it is only much less obvious, because the level is
    // still the right level and merely drawn at the wrong size.
    rebuildLevelPaths(readMap(), wasm.map_revision());
  } else if (levelPaths.art !== artOn() || levelPaths.fog !== fogOn()) {
    // Belt and braces on the view modes. `setViewMode` already rebuilds, so this
    // fires on no path that exists today -- it is here so that the recorded flags
    // are load-bearing rather than decorative, and so a future switch that forgets
    // to rebuild is one frame of the wrong picture instead of a level baked under
    // a mode nobody is in.
    rebuildLevelPaths(readMap(), wasm.map_revision());
  }

  // Drop the legs the module has finished. It is the authority on how far along
  // the path the character is -- the page asking that question for itself would
  // be a second copy of an arrival rule that lives in `Sim::follow_route`.
  const legs = wasm.route_len();
  if (legs < routeDrawn.length) routeDrawn = routeDrawn.slice(routeDrawn.length - legs);

  // The Hero rail, read back out of the module rather than off the frame's
  // `kind` column: the attributes are a live dial now, so `BODIES[kind]` is the
  // body's *baseline* and stops being the character the moment a slider moves.
  // The loop reads `decisionPeriod` and `moveSpeed` off the same answer.
  const stats = syncHeroRail(state);

  // Age first, then seed: a floater created below starts its life at zero
  // rather than one frame old.
  //
  // Presentation ages with the world and not with the wall clock, or a pause
  // would be a still world under drifting damage numbers. **The camera keeps
  // the real `elapsed`**, deliberately: panning, zooming and hovering a frozen
  // world is the point of freezing it, and a camera fed zero would refuse to
  // follow the click the player just made.
  const aged = paused ? 0 : elapsed;
  ageEffects(aged);
  // And seed **only from a frame that stepped**. `step()` clears the event feed
  // per call rather than per tick, so a frame that ran no ticks is still
  // looking at the previous call's rows -- consuming those a second time is
  // every damage number printed twice, which is exactly what it looks like.
  // This is also why it reads `state` and not the pre-step parse above.
  if (ticks > 0) consumeEvents(state);
  // After the events, never before: a body killed by a blow in that feed is
  // already out of the frame, and this is the call that forgets it.
  syncBodies(state, now, aged);

  if (!state.hero && !announcedFall) {
    announcedFall = true;
    hint("The character has fallen. Send in a new one and the fight goes on, or press R to start over.", true);
  }

  // A new order (any change to the header's order slot) restarts the "has it
  // acted on this yet" question. The answer is the first decision that happens
  // after the order landed -- which is exactly what the dim marker is showing.
  const key = `${state.orderKind}:${state.orderX}:${state.orderY}`;
  if (key !== orderKey) {
    orderKey = key;
    orderAcknowledged = false;
    orderIssuedAtDecision = state.decisionTick;
  }
  if (!orderAcknowledged && state.decisionTick !== orderIssuedAtDecision) {
    orderAcknowledged = true;
  }

  let distance = 0;
  let arrived = true;
  let settled = false;
  if (state.hero) {
    // "Has it stopped?" is answered by watching the body, not by recomputing
    // the sim's rules over here. A click within one body radius of a wall is
    // not reachable, so the character legitimately parks short of the mark --
    // and a renderer that reimplemented that clamp in floating point would be
    // a second copy of a rule that lives in the policy.
    const tickNow = wasm.tick();
    if (state.hero.x !== stillAt.x || state.hero.y !== stillAt.y) {
      stillAt = { x: state.hero.x, y: state.hero.y };
      stillSince = tickNow;
    }
    settled = tickNow - stillSince >= stats.decisionPeriod * 2;

    if (state.orderKind === ORDER_GOTO) {
      distance = Math.hypot(state.orderX - state.hero.x, state.orderY - state.hero.y);
      // The policy's arrival deadband is one tick of travel; below it the
      // character holds, which is why the HUD must not call that "still going".
      arrived = distance <= stats.moveSpeed * 1.5;
    }
    const last = trail[trail.length - 1];
    if (!last || Math.hypot(last.x - state.hero.x, last.y - state.hero.y) > 0.02) {
      trail.push({ x: state.hero.x, y: state.hero.y });
      if (trail.length > 150) trail.shift();
    }
  }

  // The rails, re-measured. This is the *only* recompute trigger the camera
  // needs, and it is here rather than on the rail toggle because a rail takes
  // 180 ms to slide: measuring once when the class goes on reads the strip the
  // rail is about to leave, and measuring again on `transitionend` snaps the
  // safe rect a third of the window sideways in one frame, which throws the
  // character across the screen. `railInsets()` reports the rect the rail is
  // covering *at this instant*, so asking every frame is what makes the view
  // breathe with the slide instead of teleporting at either end of it.
  //
  // `resize` only re-runs when something actually moved: it re-derives `scale`,
  // whose zoomed-out limit is the safe rect's width, and `floorTileSize()`
  // buckets on `scale` -- running it every frame would re-bake the flagstones
  // for nothing. The `ResizeObserver` and `window.resize` are still wired: they
  // catch the things the rails cannot, a stage that genuinely changed size and
  // a `devicePixelRatio` that changed under a window that did not.
  if (refreshInsets()) resize();

  updateCamera(state, elapsed);
  render(state, now, arrived || settled);
  updateHud(state, stats, distance, arrived, settled, now);

  if (hintUntil && now > hintUntil) {
    hintUntil = 0;
    hintEl.classList.remove("live");
    hintEl.textContent = DEFAULT_HINT;
  }
}

// --------------------------------------------------------------------- boot

async function loadModule(url) {
  // Streaming compilation needs the server to answer `application/wasm`; the
  // fallback exists so a wrong MIME type reads as one warning rather than a
  // bare TypeError with no explanation attached.
  try {
    return await WebAssembly.compileStreaming(fetch(url, { cache: "no-store" }));
  } catch (streamingError) {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`${url}: ${response.status} ${response.statusText}`);
    console.warn("streaming compile failed; check the Content-Type on web.wasm", streamingError);
    return await WebAssembly.compile(await response.arrayBuffer());
  }
}

/**
 * When the binary that is about to run was built.
 *
 * The `last-modified` of `web.wasm`, which is the honest answer: it describes
 * the artifact actually loaded rather than whatever a compile-time stamp
 * happened to freeze -- and a compile-time stamp goes stale the moment only a
 * dependency changed and the linker still relinked.
 *
 * A separate `HEAD` rather than reading the header off the fetch `loadModule`
 * makes: `compileStreaming` consumes the response body, so sharing it means
 * cloning the response and giving up the streaming path. One extra request
 * against a static file is much cheaper than that. A host that answers no
 * `HEAD` and no `last-modified` is not a failure -- `document.lastModified`
 * still says something true about the page.
 */
async function buildStamp(url) {
  try {
    const head = await fetch(url, { method: "HEAD", cache: "no-store" });
    const when = head.headers.get("last-modified");
    if (when) {
      const at = new Date(when);
      if (!Number.isNaN(at.getTime())) return at;
    }
  } catch {
    // A static host with no HEAD. Fall through.
  }
  return new Date(document.lastModified);
}

/** `YYYY-MM-DD HH:MM`, local, which is what a person reading it wants. */
function stampText(at) {
  const pad = (n) => String(n).padStart(2, "0");
  return (
    `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}` +
    ` ${pad(at.getHours())}:${pad(at.getMinutes())}`
  );
}

async function boot() {
  // Kicked off before the module loads and awaited after, so the extra
  // round-trip overlaps the compile instead of delaying it.
  const stamp = buildStamp("web.wasm");

  let instance;
  try {
    const module = await loadModule("web.wasm");
    instance = await WebAssembly.instantiate(module, buildImports(module));
  } catch (err) {
    die(
      "web.wasm did not load",
      "Serve the page with `node tools/serve.js` — a file:// page cannot instantiate WebAssembly, and the module has to be built for wasm32-unknown-unknown first.",
      err
    );
    return;
  }

  raw = instance.exports;
  memory = raw.memory;
  if (!(memory instanceof WebAssembly.Memory)) {
    die("web.wasm exports no memory", "The frame buffer lives in linear memory; without it there is nothing to read.");
    return;
  }
  wasm = {};
  try {
    for (const name of EXPORTS) wasm[name] = guard(name);
  } catch (err) {
    die("web.wasm is missing an export", "The page and the module disagree about the ABI.", err);
    return;
  }

  // The layout handshake, before anything reads a frame. A stride mismatch
  // paints a health bar out of a guard arc and looks like a rendering bug for
  // an hour, so it stops the page instead. This is what replaced the
  // append-only rule the frame used to be governed by: the rule forbade the
  // edit, and this makes the edit safe.
  const version = wasm.frame_layout_version();
  if (
    version !== FRAME_LAYOUT_VERSION ||
    wasm.unit_stride() !== UNIT_STRIDE ||
    wasm.shot_stride() !== SHOT_STRIDE ||
    wasm.event_stride() !== EVENT_STRIDE ||
    wasm.header_len() !== HEADER_LEN
  ) {
    const mine = `${HEADER_LEN} + ${UNIT_STRIDE} + ${SHOT_STRIDE} + ${EVENT_STRIDE}`;
    const theirs = `${wasm.header_len()} + ${wasm.unit_stride()} + ${wasm.shot_stride()} + ${wasm.event_stride()}`;
    die(
      "the page and the module disagree about the frame",
      `main.js is written against layout ${FRAME_LAYOUT_VERSION} (${mine}); web.wasm reports ${version} (${theirs}). Rebuild the wasm.`
    );
    return;
  }

  wasm.init(SEED);

  // The roster and the registry, read across once. Every table this file used
  // to keep by hand now comes from here -- see `loadRegistry` for what the old
  // mirror had drifted into claiming.
  loadRegistry();
  // The attribute ceiling is asked for rather than written down here -- see
  // `probeMaxAttribute`. It has to happen before the racks are built, because
  // it is the sliders' `max`.
  maxAttribute = probeMaxAttribute();
  buildRails();
  buildControlGroup();
  updateControlButtons();
  // The view selector, built from `VIEW_MODES` the same way. Only the lighting
  // pass runs at boot, not `setViewMode`: the default mode's dev strip is already
  // shut in the markup, and calling the setter here would hint at a mode nobody
  // chose and bake the paths before `resize` has decided what `scale` is.
  buildViewGroup();
  updateViewButtons();

  // The project's central claim as one number: this is what
  // `cargo run --release -p lab -- hash` prints natively, computed here by the
  // same fixed-point code compiled for a completely different machine.
  console.log(
    `auto-rpg: web.wasm ready. selftest hash ${hex64(wasm.selftest_hash_hi(), wasm.selftest_hash_lo())}` +
      " (must equal `cargo run --release -p lab -- hash`)"
  );

  const first = parseFrame(readFrame());
  arena = { x: first.arenaX, y: first.arenaY };
  syncHeroRail(first);
  resize();
  // After `resize`, because the paths are in pixels and `scale` is what
  // `resize` decides.
  rebuildLevelPaths(readMap(), wasm.map_revision());
  snapCamera(first);
  bindInput();
  hintEl.textContent = DEFAULT_HINT;
  stamp.then((at) => setText(el.buildStamp, stampText(at)));

  // The element, not just the window: the canvas host can change size without
  // the window doing anything -- a drawer opening, a scrollbar appearing -- and
  // a stale `scale` puts every click somewhere other than where it was made.
  if (typeof ResizeObserver === "function") {
    new ResizeObserver(() => resize()).observe(stage);
  }
  // Still needed alongside it: `devicePixelRatio` changes when the window moves
  // between monitors, and the element's box does not.
  window.addEventListener("resize", resize);
  document.addEventListener("visibilitychange", () => {
    // Coming back from a hidden tab, the accumulator would otherwise hold
    // however long the tab was away and the sim would fast-forward.
    accumulator = 0;
    lastFrameTime = performance.now();
  });

  lastFrameTime = performance.now();
  rafId = requestAnimationFrame(loop);
}

boot();
