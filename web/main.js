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

/** Most unit rows a frame can carry. Mirrors `web::MAX_UNITS`, which is what
 *  `write_frame` stops at, and it is here only to size the parse pools below --
 *  nothing on this page *enforces* it. The pools grow if a future module ever
 *  publishes more, so a stale copy of this number costs one allocation on the
 *  first oversized frame rather than a truncated room. */
const MAX_UNITS = 64;

/** Floats per arrow, in a block that follows the units: [x, y, heading_raw,
 *  faction]. Arrows are not units -- no health, no loadout, no phase -- so they
 *  get their own short row rather than twenty-three dead floats each. */
const SHOT_STRIDE = 4;

/** Most arrow rows a frame can carry, mirroring `sim::rules::MAX_SHOTS`. Sizes
 *  the shot pool, on exactly the terms `MAX_UNITS` sizes the unit pool. */
const MAX_SHOTS = 32;

/** Floats per event, in a third block that follows the arrows:
 *  [kind, x, y, amount, actor_index].
 *
 *  Things that *happened*, as opposed to things that are. Every other row in the
 *  frame describes state that will still be there next frame; an event is gone
 *  the moment it is read, and what the page does with it -- a floating number, a
 *  callout bubble -- it then ages on its own wall clock, like `trail` and
 *  `corpses`. */
const EVENT_STRIDE = 5;

/** Most event rows a frame can carry, mirroring `web::MAX_EVENTS`. Sizes the
 *  event pool, on the same terms as the two above. */
const MAX_EVENTS = 32;

/**
 * The stride of the packed entity handle, and the reason it is exactly this.
 *
 * `unit.id` is `generation * ID_INDEX_SPAN + index`, one number rather than the
 * `"index:generation"` string this page used to build sixty times a second per
 * body. A `World` slot is recycled through a free list
 * (`crates/sim/src/world.rs`), so the live indices never climb past the number of
 * bodies standing at once -- which `web::MAX_UNITS` caps at 64. **128 is the next
 * power of two above that cap**, so the pair is packed without loss and, just as
 * importantly, `id % ID_INDEX_SPAN` gives the index back exactly.
 *
 * That last property is not decoration: `factionOfActor` and `actorVisible` look
 * a body up in `bodies` by index alone, because an event row carries
 * `EntityId::index` with no generation on it. They used to do it with a string
 * prefix match; now they do it with a modulo, which is the same question asked of
 * a cheaper representation.
 *
 * **Raise this before raising `MAX_UNITS` past 128.** Nothing checks it at
 * runtime -- an index of 128 would collide with generation 1's index 0, and the
 * failure would be a body drawn as another body rather than an exception.
 */
const ID_INDEX_SPAN = 128;

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

// `Order` discriminants, from crates/sim/src/command.rs.
const ORDER_HOLD = 0;
const ORDER_FOCUS = 3;
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
// Float32Array over the frame buffer; never held across a call into wasm.
//
// Called `frameBuf` and not `view`, which is what it was: `view` now names the
// blended picture the loop draws (see the interpolation block), and of the two
// that is much the more spoken-about noun on this page -- half a dozen call
// sites in `loop` say which of `curr` and `view` they are reading and why. A
// typed array "view" is jargon borrowed from the spec; this is the frame buffer.
let frameBuf = null;

const EXPORTS = [
  "init",
  "set_goto",
  // The other way to give an order: a body rather than a place. Named here as
  // well as beside `set_goto` because this list is the ABI the page actually
  // binds -- a name missing from it is not a link error, it is `wasm.set_focus`
  // arriving as `undefined` on the first click that tries to use it.
  "set_focus",
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

/** The cold half of every arm of `guard` below, out of line because it runs
 *  once in the life of the page and never again. Keeping it out of the arms is
 *  what lets each of them be small enough to inline. */
function trapped(name, err) {
  die("The simulation trapped", `${name}() trapped, so the module is poisoned and the loop has stopped.`, err);
}

/**
 * Every call into wasm goes through one of these. On a trap the loop stops and
 * the overlay comes up; every later call answers 0 so nothing else has to know
 * the module died mid-frame.
 *
 * **Fixed-arity wrappers, dispatched on the export's own `length`.** The single
 * `(...args) => fn(...args)` this replaced allocated an arguments array on
 * *every* boundary call, and the loop makes around thirty of them a frame.
 *
 * Cases 0 through 6 cover the whole ABI as it stands, and 6 is not padding:
 * **`set_input` takes six** (`crates/web/src/lib.rs`) and is called once a frame
 * on every manual-control frame, which makes it the widest *and* one of the
 * hottest. Three exports take three -- `spawn_monster`, `swap_in_hero`,
 * `set_policy_gene` -- and nothing takes four or five today; those two arms are
 * there so the range has no hole in it.
 *
 * The trap semantics are written out verbatim in every arm rather than factored
 * into a helper, and the repetition is the point -- a shared closure would put
 * back the indirection this exists to remove. Both halves are load-bearing in
 * every arm: `if (dead) return 0` is what stops a poisoned module from being
 * called a second time, and the `catch` is the only thing that brings the
 * overlay up.
 *
 * **The variadic `default` stays.** An export wider than six then still works --
 * one arguments array at a time, exactly as the whole file used to -- rather
 * than silently dropping its seventh argument, which is a bug that would present
 * as the module ignoring a parameter and nothing else. It is what kept
 * `set_input` correct while the enumerated cases stopped at three.
 */
function guard(name) {
  const fn = raw[name];
  if (typeof fn !== "function") {
    throw new Error(`web.wasm does not export ${name}()`);
  }
  switch (fn.length) {
    case 0:
      return () => {
        if (dead) return 0;
        try {
          return fn();
        } catch (err) {
          trapped(name, err);
          return 0;
        }
      };
    case 1:
      return (a) => {
        if (dead) return 0;
        try {
          return fn(a);
        } catch (err) {
          trapped(name, err);
          return 0;
        }
      };
    case 2:
      return (a, b) => {
        if (dead) return 0;
        try {
          return fn(a, b);
        } catch (err) {
          trapped(name, err);
          return 0;
        }
      };
    case 3:
      return (a, b, c) => {
        if (dead) return 0;
        try {
          return fn(a, b, c);
        } catch (err) {
          trapped(name, err);
          return 0;
        }
      };
    case 4:
      return (a, b, c, d) => {
        if (dead) return 0;
        try {
          return fn(a, b, c, d);
        } catch (err) {
          trapped(name, err);
          return 0;
        }
      };
    case 5:
      return (a, b, c, d, e) => {
        if (dead) return 0;
        try {
          return fn(a, b, c, d, e);
        } catch (err) {
          trapped(name, err);
          return 0;
        }
      };
    case 6:
      return (a, b, c, d, e, f) => {
        if (dead) return 0;
        try {
          return fn(a, b, c, d, e, f);
        } catch (err) {
          trapped(name, err);
          return 0;
        }
      };
    default:
      return (...args) => {
        if (dead) return 0;
        try {
          return fn(...args);
        } catch (err) {
          trapped(name, err);
          return 0;
        }
      };
  }
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
 *
 * **Nothing may call into wasm between `frameView()` and the end of the
 * `parseFrame` that consumes it**: an allocation in the module grows linear
 * memory and detaches this view, silently, into a zero-length one. The identity
 * check below is what makes a *later* frame a rebuild rather than a blank
 * screen; it cannot help mid-parse.
 *
 * That invariant used to be stated over a shorter span, because the page took a
 * boxed `Array` copy of the whole frame and parsed the copy -- 2,158 floats
 * promoted to doubles and boxed, measured at 0.380 ms of a 16.7 ms budget at 64
 * units, to feed a function that reads them one at a time. `parseFrame` is pure
 * arithmetic and calls into wasm nowhere, so it reads the live view directly and
 * the invariant simply covers more lines. See `docs/plans/perf-measurements.md`.
 */
function frameView() {
  const ptr = wasm.frame_ptr();
  const len = wasm.frame_len();
  if (
    frameBuf === null ||
    frameBuf.buffer !== memory.buffer ||
    frameBuf.byteOffset !== ptr ||
    frameBuf.length !== len
  ) {
    frameBuf = new Float32Array(memory.buffer, ptr, len);
  }
  return frameBuf;
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

// ------------------------------------------------------------- the parse pool
//
// **Nothing below allocates once the page is running.** `parseFrame` used to
// build a state object, an array per section, one 30-property object per unit,
// one per arrow and one per event -- and a template-string id per unit -- every
// animation frame. At 64 units that is ~3,840 objects and ~3,840 strings a
// second thrown at the collector for a picture that is thrown away 16 ms later,
// and it is the most likely source of a GC sawtooth in the worst-frame column.
//
// So the shape is inverted: `parseFrame(f, out)` *writes into* a state handed to
// it, and every row it hands back is a long-lived object that gets overwritten
// in place. The three states below are the whole of the allocation.
//
// **Two of them are ping-ponged and that is deliberate.** Session 3
// (`docs/plans/perf-03-cadence.md`) renders one tick behind by holding the
// previous parse and the current one at the same time and blending between them;
// a parse that reused one buffer would have `prev` and `curr` be the same object
// and the blend would interpolate a state with itself. It adds a third state for
// the blended picture and writes `blendUnit(a, b, t, out)` against the row shape
// `readUnit` fills.
//
// **The scratch state is not a nicety either.** Seven call sites parse outside
// the loop -- a click, Escape, a stand-down button, a hero swap, a restart, boot
// -- and they run *between* animation frames. Any of them writing into a
// ping-pong slot would scribble over a state the loop is still holding, and the
// symptom would be a body drawn where it was two frames ago. They get their own
// state, which nothing keeps.

/** One unit row, every field zeroed. Built once per pool slot at boot and then
 *  only ever assigned into, so the shape is fixed and the engine never has to
 *  reconsider it. Field order matches `readUnit`'s write order on purpose. */
function newUnitRow() {
  return {
    x: 0,
    y: 0,
    facing: 0,
    radius: 0,
    hp: 0,
    maxHp: 0,
    faction: 0,
    kind: 0,
    intent: 0,
    id: 0,
    index: 0,
    gen: 0,
    limbAngle: 0,
    limbReach: 0,
    limbSpin: 0,
    actionLength: 0,
    actionArc: 0,
    hitFlash: 0,
    blockFlash: 0,
    parryFlash: 0,
    swing: 0,
    swingLeft: 0,
    limbLine: 0,
    action: 0,
    role: 0,
    slot: 0,
    slot0: 0,
    slot1: 0,
    sight: 0,
    visible: false,
  };
}

/** One arrow row, on the same terms as `newUnitRow`. */
function newShotRow() {
  return { x: 0, y: 0, heading: 0, faction: 0 };
}

/** One event row, on the same terms as `newUnitRow`. */
function newEventRow() {
  return { kind: 0, x: 0, y: 0, amount: 0, actor: 0 };
}

/**
 * A complete parsed frame, with its own rows.
 *
 * `unitPool`, `shotPool` and `eventPool` are the storage and never change
 * length downward; `units`, `monsters`, `shots` and `events` are *views* onto
 * that storage whose length is reset every parse. The distinction is the one
 * thing here that is easy to get wrong: truncating the pool itself would delete
 * the objects past the new length and the next busier frame would parse into
 * holes.
 *
 * `monsters` aliases rows that are also in `units`, which is what it always did
 * -- they are two windows onto one row set within one state. **No row is ever
 * shared between two states**, which is what makes the ping-pong sound.
 */
function newFrameState() {
  const unitPool = [];
  for (let i = 0; i < MAX_UNITS; i++) unitPool.push(newUnitRow());
  const shotPool = [];
  for (let i = 0; i < MAX_SHOTS; i++) shotPool.push(newShotRow());
  const eventPool = [];
  for (let i = 0; i < MAX_EVENTS; i++) eventPool.push(newEventRow());
  return {
    arenaX: 48,
    arenaY: 32,
    orderKind: 0,
    orderX: 0,
    orderY: 0,
    decisionTick: 0,
    unitCount: 0,
    shotCount: 0,
    eventCount: 0,
    monstersLeft: 0,
    portalX: 0,
    portalY: 0,
    portalState: 0,
    depth: 0,
    unitPool,
    shotPool,
    eventPool,
    units: [],
    monsters: [],
    shots: [],
    events: [],
    // `EntityId::index` -> the row, or `null`. Rebuilt every parse; see
    // `parseFrame` for what it saves.
    byIndex: new Array(ID_INDEX_SPAN).fill(null),
    hero: null,
  };
}

/** The two states the loop ping-pongs between: `prev` and `curr`.
 *
 *  The third state this note used to promise exists -- session 3 landed -- but
 *  **not as a third element here**, which is what the promise assumed. `nextPool`
 *  alternates 0 and 1, so a third slot in the same array would either never be
 *  handed out or would break the alternation and let a parse scribble over the
 *  state `prev` is holding. It is `BLEND_STATE`, in the interpolation block
 *  below, because it is the same kind of thing `SCRATCH_STATE` is: a state with
 *  exactly one owner and no rotation. */
const FRAME_POOL = [newFrameState(), newFrameState()];
let framePool = 0;

/** The other one. Called once per parse in `loop` and nowhere else. */
function nextPool() {
  framePool ^= 1;
  return FRAME_POOL[framePool];
}

/** The state for parses that happen between animation frames -- see the note at
 *  the top of this block. Never held past the statement that asks for it. */
const SCRATCH_STATE = newFrameState();

function readUnit(f, u, out) {
  out.x = f[u];
  out.y = f[u + 1];
  // A binary angle: the whole turn is 65536, so no trigonometry crossed
  // the boundary. 0 is +x and the sense is counter-clockwise with +y up,
  // which is also how this canvas is drawn (world y grows downward on
  // screen), so the wedge points where the body moves.
  out.facing = (f[u + 2] / 65536) * TAU;
  out.radius = f[u + 3];
  out.hp = f[u + 4];
  out.maxHp = f[u + 5];
  out.faction = f[u + 6];
  out.kind = f[u + 7];
  out.intent = f[u + 8];
  // The entity handle as one number, to key a Map with. Both halves still, for
  // the reason the old comment gave -- a dead unit's slot is handed to the next
  // spawn, so the index alone would read as the same creature getting up again
  // -- but `index < MAX_UNITS < ID_INDEX_SPAN` makes the pair exactly
  // representable in a double, so this is the same identity with none of the
  // allocation. It was a `${index}:${gen}` template string, built once per body
  // per frame. See `ID_INDEX_SPAN` for why 128 and what it costs to change.
  out.id = f[u + 10] * ID_INDEX_SPAN + f[u + 9];
  // The index on its own, which is the *only* thing an event row carries as
  // `actor`. Kept beside `id` rather than divided back out of it: a floater
  // and a callout need to find which body a row was about, and doing arithmetic
  // sixty times a second to answer that would be silly. It is a hint
  // for grouping and not an identity -- `id` remains the only one of those.
  out.index = f[u + 9];
  // And the other half of the handle, on the same argument one line up, with
  // one addition: `set_focus` takes the two halves as two arguments, and it
  // takes both precisely because a dead unit's slot is handed to the next
  // spawn -- an index alone would let a click on a corpse lock onto whatever
  // walked in afterwards. So the pair has to survive the trip out to the page
  // and back, and unpacking `id` to reassemble something the frame already said
  // is work with a way to be wrong in it.
  out.gen = f[u + 10];
  // The limb -- one, now. Bearings arrive as binary angles like `facing`, for
  // the same reason: no trigonometry crosses the boundary.
  out.limbAngle = (f[u + 11] / 65536) * TAU;
  out.limbReach = f[u + 12];
  out.limbSpin = f[u + 13];
  out.actionLength = f[u + 14];
  out.actionArc = (f[u + 15] / 65536) * TAU;
  // Already-decayed 0..1 markers, computed by the sim from its own events.
  out.hitFlash = f[u + 16];
  out.blockFlash = f[u + 17];
  out.parryFlash = f[u + 18];
  // The attack. `limbLine` is where the cut is aimed, which during a windup
  // is a long way from where the blade is pointing -- the gap between the two
  // is the tell, and drawing it is the only reason the player can learn to
  // read one.
  out.swing = f[u + 19];
  out.swingLeft = f[u + 20];
  out.limbLine = (f[u + 21] / 65536) * TAU;
  // What is in the hand and what else is in the bag. `role` is what decides
  // whether this gets drawn as a blade or as an arc -- the page does not
  // infer that from the numbers, because "a short thing with a wide arc" and
  // "a guard" are the same numbers and very different pictures.
  out.action = f[u + 22];
  out.role = f[u + 23];
  out.slot = f[u + 24];
  out.slot0 = f[u + 25];
  out.slot1 = f[u + 26];
  // How far this body can see, in world units, straight off its own stat
  // sheet. Not derived here from `perception`, and not derived here ever
  // again: the hero's attributes are a live dial now, so a formula copied
  // into this file would be describing a character that has changed
  // underneath it. See the post-mortem above `BODIES`.
  out.sight = f[u + 27];
  // Whether the *player* can see this body -- not what the body itself
  // perceives, which is a different question the module never answers here.
  // With no hero standing this is 1 for everything: a fog of war with nobody
  // to be fogged from is just a blank screen.
  out.visible = f[u + 28] !== 0;
  return out;
}

/**
 * The frame, into `out`.
 *
 * `f` is the live `Float32Array` over linear memory -- see `frameView` for the
 * invariant that buys, and note that this function is pure arithmetic and calls
 * into wasm nowhere, which is what makes reading the live view safe.
 *
 * `out` is one of the states above. Hand it `nextPool()` from the loop and
 * `SCRATCH_STATE` from anywhere else.
 */
function parseFrame(f, out) {
  out.arenaX = f[0] || 48;
  out.arenaY = f[1] || 32;
  out.orderKind = f[2];
  out.orderX = f[3];
  out.orderY = f[4];
  out.decisionTick = f[5];
  out.unitCount = f[6];
  out.shotCount = f[7];
  out.eventCount = f[8];
  // The run. `monstersLeft` is the module's own count and not
  // `monsters.length`: the unit rows are capped, and the two must not be able
  // to disagree about whether the level is clear.
  out.monstersLeft = f[9];
  out.portalX = f[10];
  out.portalY = f[11];
  out.portalState = f[12];
  out.depth = f[13];
  out.hero = null;

  // Trust the buffer's length over the header's count. They agree, and the
  // belt-and-braces costs one `Math.min` a frame.
  const rows = Math.min(out.unitCount | 0, Math.floor((f.length - HEADER_LEN) / UNIT_STRIDE));
  // The pool only ever grows, and only if a module ever publishes more rows
  // than `MAX_UNITS` says it can. One comparison a frame against a page that
  // would otherwise silently drop bodies.
  while (out.unitPool.length < rows) out.unitPool.push(newUnitRow());
  // The side table, cleared before it is filled: a stale entry would answer for
  // a body that is no longer in the frame, which is exactly the mistake the
  // linear scans it replaces could not make.
  const byIndex = out.byIndex;
  byIndex.fill(null);
  let unitCount = 0;
  let monsterCount = 0;
  for (let i = 0; i < rows; i++) {
    const unit = readUnit(f, HEADER_LEN + i * UNIT_STRIDE, out.unitPool[i]);
    out.units[unitCount++] = unit;
    // `EntityId::index` -> row, built as we go for one array write per unit.
    // Three consumers scan for a row by index -- `drawCallouts` (per callout,
    // per frame), `factionOfActor` and `actorVisible` (per event row) -- and
    // each was O(units). Irrelevant at 6 x 64 and quadratic at 100+ units with
    // more events in flight, which is where this page is headed.
    if (unit.index < ID_INDEX_SPAN) byIndex[unit.index] = unit;
    if (unit.faction === FACTION_HEROES) {
      // Searched for, never taken from row zero: `write_frame` skips the dead,
      // so once the character can fall, every row can shift up by one.
      if (out.hero === null) out.hero = unit;
    } else {
      out.monsters[monsterCount++] = unit;
    }
  }
  // The *views* are truncated, never the pools. See `newFrameState`.
  out.units.length = unitCount;
  out.monsters.length = monsterCount;

  // The arrows, in the block that starts wherever the units stopped. Based off
  // `rows` rather than off `unitCount` for the same belt-and-braces reason: the
  // two agree, and reading the section from the wrong offset would draw arrows
  // out of somebody's health bar.
  const base = HEADER_LEN + rows * UNIT_STRIDE;
  const shots = Math.min(
    out.shotCount | 0,
    Math.floor((f.length - base) / SHOT_STRIDE)
  );
  while (out.shotPool.length < shots) out.shotPool.push(newShotRow());
  for (let i = 0; i < shots; i++) {
    const at = base + i * SHOT_STRIDE;
    const shot = out.shotPool[i];
    shot.x = f[at];
    shot.y = f[at + 1];
    shot.heading = (f[at + 2] / 65536) * TAU;
    shot.faction = f[at + 3];
    out.shots[i] = shot;
  }
  out.shots.length = shots;

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
    out.eventCount | 0,
    Math.floor((f.length - eventBase) / EVENT_STRIDE)
  );
  while (out.eventPool.length < rowCount) out.eventPool.push(newEventRow());
  for (let i = 0; i < rowCount; i++) {
    const at = eventBase + i * EVENT_STRIDE;
    const event = out.eventPool[i];
    // One of EVENT_DAMAGE / EVENT_BLOCK / EVENT_PARRY / EVENT_DECLARE, and
    // `amount` means something different under each.
    event.kind = f[at];
    event.x = f[at + 1];
    event.y = f[at + 2];
    event.amount = f[at + 3];
    // `EntityId::index` alone, deliberately without the generation: a row is
    // consumed in the frame it arrives in, and a floater is keyed on the
    // position it happened at rather than on who it happened to. This is a
    // hint for grouping, not an identity -- `unit.id` is still the only one
    // of those.
    event.actor = f[at + 4];
    out.events[i] = event;
  }
  out.events.length = rowCount;
  return out;
}

// ----------------------------------------------------------- interpolation
//
// **The sim runs at 60 ticks a second and the display does not.** `loop` asks
// for `Math.floor(accumulator / TICK_MS)` ticks, which is 0, 1 or occasionally 2
// depending on where rAF's jitter falls -- so a page that simply drew the frame
// it was handed drew every body moving in exactly those quanta. At 60 Hz that is
// a velocity ripple on everything in the room; at 120 or 144 Hz roughly half the
// frames advance the world by nothing at all, and the room visibly steps at 60
// under a camera that is gliding continuously. No amount of optimisation fixes
// that, because it is not a throughput problem: the acceptance test for all of
// this is that session 1's ticks histogram is **unchanged** and the room is
// smooth anyway.
//
// The fix is to hold the last two parsed states and draw a point between them.
// **`curr` is the truth and the blend is a picture**, and the two are kept
// strictly apart: `loop` says at every call site which of them it is taking and
// why, and `docs/plans/perf-03-cadence.md` carries the full assignment.
//
// **None of this reimplements a sim rule.** A convex combination of two states
// the sim actually produced is a display filter, not a prediction. Nothing here
// extrapolates past `curr`, nothing invents an arrival test, and no blended
// number is ever written back across the wall or used to derive an order -- the
// same discipline `loop`'s `arrived` comment already keeps about walls.
//
// The cost is one tick of latency: 16.7 ms, against a decision period of 1 to 30
// ticks (`sim::rules::decision_period`). Extrapolating would buy that back by
// having the page guess where the sim is going, and the page does not guess.

/** Two numbers, `t` of the way from `a` to `b`. */
function mix(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Two bearings, the short way round.
 *
 * The frame delivers radians -- `readUnit` divides the binary angle by 65536 --
 * so a body turning through north would otherwise take the long way home: 6.2
 * rad to 0.1 rad interpolated linearly is a full spin backwards inside one tick.
 * Folding the difference into (-pi, pi] is the whole of the fix.
 *
 * It cannot decide what to do about a turn of *more* than half a circle in one
 * tick, because there is genuinely no way to tell one of those apart from a
 * short turn the other way. `snapRow` covers the case that actually produces one
 * -- a swing changing phase -- by not blending the row at all.
 */
function lerpAngle(a, b, t) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  else if (d < -Math.PI) d += TAU;
  return a + d * t;
}

/**
 * Whether a row must be taken from `curr` outright rather than blended.
 *
 * **One predicate rather than five scattered guards**, because it is one idea:
 * these are the columns whose change means the two rows are not two samples of
 * the same continuous thing. It covers, in order of how often it fires:
 *
 *   * **the start and end of a swing** -- `swing` steps GUARD -> WINDUP ->
 *     STRIKE -> RECOVER -> GUARD, and the limb's line jumps to wherever the new
 *     phase aims it. Blending across that stutters the blade mid-arc;
 *   * **the pathological fast strike**, which sweeps more than half a turn in
 *     one tick and which `lerpAngle` would therefore run *backwards*. It is
 *     caught here for free, because such a sweep is always inside a phase
 *     change;
 *   * **a body entering or leaving the fog** -- `visible` flips, and the frozen
 *     ghost pose `syncBodies` keeps must not be slid into or out of;
 *   * **a weapon swap** -- `slot` and `action` move together, and the arc, the
 *     reach and the blade's bearing all belong to a different weapon afterwards;
 *   * **a role change**, which is what decides whether the page draws a blade or
 *     a guard arc at all -- half of one and half of the other is neither.
 *
 * The sixth case, **a spawn or a body seen for the first time**, has no `prev`
 * row to compare against at all and is handled by the caller.
 */
function snapRow(a, b) {
  return (
    a.swing !== b.swing ||
    a.action !== b.action ||
    a.slot !== b.slot ||
    a.role !== b.role ||
    a.visible !== b.visible
  );
}

/**
 * One unit row, `t` of the way from `a` to `b`, into `out`.
 *
 * Shaped exactly like `readUnit(f, u, out)` and for the same reason: it writes
 * into a long-lived row rather than building one, so a whole frame of blending
 * allocates nothing. This runs on **every** animation frame, including the ones
 * that step no ticks, so a version that returned fresh objects would reintroduce
 * per-frame the allocation the parse pool exists to remove.
 *
 * Three groups, and which group a field is in is a statement about what the
 * field *is*:
 *
 *   * **lerped** -- everything continuous: position, size, health, the limb's
 *     extension and spin, how much of the swing is left, the sight radius, and
 *     the three already-decayed flash markers;
 *   * **lerped the short way** -- `facing`, `limbAngle` and `limbLine`, the
 *     three live bearings, through `lerpAngle`;
 *   * **snapped** -- every identity and every discriminant, plus `actionLength`
 *     and `actionArc`. Those last two look like geometry and are not: they are
 *     **static properties of the action**, how long the weapon is and how wide
 *     its swing will be, and halfway between two weapons' arcs is no weapon.
 *
 * **`blendUnit(row, row, t, out)` is an exact copy** -- `mix(v, v, t)` is
 * `v + 0 * t` and `lerpAngle(v, v, t)` is the same -- which is what the snap
 * paths in `blend` use, rather than a second copy routine that could drift out
 * of step with this one field by field.
 */
function blendUnit(a, b, t, out) {
  out.x = mix(a.x, b.x, t);
  out.y = mix(a.y, b.y, t);
  out.facing = lerpAngle(a.facing, b.facing, t);
  out.radius = mix(a.radius, b.radius, t);
  out.hp = mix(a.hp, b.hp, t);
  out.maxHp = mix(a.maxHp, b.maxHp, t);
  out.faction = b.faction;
  out.kind = b.kind;
  out.intent = b.intent;
  out.id = b.id;
  out.index = b.index;
  out.gen = b.gen;
  out.limbAngle = lerpAngle(a.limbAngle, b.limbAngle, t);
  out.limbReach = mix(a.limbReach, b.limbReach, t);
  out.limbSpin = mix(a.limbSpin, b.limbSpin, t);
  out.actionLength = b.actionLength;
  out.actionArc = b.actionArc;
  out.hitFlash = mix(a.hitFlash, b.hitFlash, t);
  out.blockFlash = mix(a.blockFlash, b.blockFlash, t);
  out.parryFlash = mix(a.parryFlash, b.parryFlash, t);
  out.swing = b.swing;
  out.swingLeft = mix(a.swingLeft, b.swingLeft, t);
  out.limbLine = lerpAngle(a.limbLine, b.limbLine, t);
  out.action = b.action;
  out.role = b.role;
  out.slot = b.slot;
  out.slot0 = b.slot0;
  out.slot1 = b.slot1;
  out.sight = mix(a.sight, b.sight, t);
  out.visible = b.visible;
  return out;
}

/** The blended picture: one state, written into on every animation frame
 *  including the ones that step nothing. Pre-allocated on exactly the terms the
 *  two pooled states are, and owned by `loop` alone -- nothing else may write
 *  into it, and nothing may hold a row out of it past the frame it was drawn on.
 *  See `FRAME_POOL` for why it is not a third element of that array. */
const BLEND_STATE = newFrameState();

/**
 * How far an arrow may move between the two states before the page stops
 * believing it is the same arrow -- in world units **per tick of the gap**.
 *
 * The fastest thing in the game moves well under half a unit a tick:
 * `rules::shot_speed` is the bow tip's tangential speed times `BOW_EFFICIENCY`,
 * and `agility_multiplier` is clamped so that no tip in the game exceeds 0.537
 * units a tick (`DESIGN.md`, "Deliberate non-choices"). Three times that is a
 * threshold nothing legitimate reaches and a re-index almost always clears.
 *
 * **Per tick, and not flat.** The plan wrote it flat, which is right for the
 * ordinary 1- and 2-tick frame and wrong for the one that caught up eight: every
 * arrow in the air moves eight ticks' worth there, a flat threshold snaps the
 * whole flight, and it does so on exactly the frames the picture is already
 * worst. Scaling by the gap keeps this a re-index detector at every cadence.
 */
const SHOT_SNAP_UNITS = 1.5;

/**
 * `a` and `b`, `t` of the way between them, into `out`. The picture the page
 * draws.
 *
 * **Rows are matched by identity and never by row index.** `write_frame` skips
 * the dead (`crates/web/src/lib.rs`), so one monster falling shifts every row
 * below it up by one, and an index match would slide bodies across the room
 * every time something died. `byIndex` already exists for exactly this kind of
 * lookup, and the `id` check behind it is what makes the answer an identity
 * rather than a slot: a freed entity slot is handed to the next spawn, and the
 * generation is the half of the handle that says so.
 *
 * `span` is how many ticks apart the two states are and `lockHeld` is whether
 * they were parsed under the same focus; see the arrows and the order slots
 * below for what each is for.
 */
function blend(a, b, t, span, lockHeld, out) {
  // **At `t = 1` the picture *is* `curr`**, and that is not a rare case: it is
  // every frame the world is frozen. Blending a state with itself is the
  // identity all the way down, so one comparison here buys an exact copy
  // everywhere below without a second code path to keep in step.
  const from = t >= 1 ? b : a;

  out.arenaX = b.arenaX;
  out.arenaY = b.arenaY;
  out.decisionTick = b.decisionTick;
  out.unitCount = b.unitCount;
  out.shotCount = b.shotCount;
  out.monstersLeft = b.monstersLeft;
  out.portalX = b.portalX;
  out.portalY = b.portalY;
  out.portalState = b.portalState;
  out.depth = b.depth;

  // The order slots, which are the one subtle case on this whole page.
  //
  // Two kinds of order stand on them. Under a `Goto` they are a fixed point the
  // player clicked, and blending would slide the destination marker across the
  // room over a frame every time a new one is issued -- so it snaps. Under a
  // focus the module writes the **quarry's live position** there, so they move
  // every tick and the lock ring judders if it snaps -- so it blends.
  //
  // And blending is only right while it is the *same* quarry: a click naming
  // somebody else jumps those slots across the room exactly the way a fresh
  // `Goto` does. `locked` is the page's own record of who, and `lockHeld` says
  // it did not move between the two parses.
  //
  // Note that `loop`'s order key asks a different question of these same two
  // slots and therefore reads `curr`: it is keyed on `locked` *instead of* the
  // position precisely because the position moves every frame under a focus.
  out.orderKind = b.orderKind;
  const trackingSameQuarry =
    lockHeld && from.orderKind === ORDER_FOCUS && b.orderKind === ORDER_FOCUS;
  out.orderX = trackingSameQuarry ? mix(from.orderX, b.orderX, t) : b.orderX;
  out.orderY = trackingSameQuarry ? mix(from.orderY, b.orderY, t) : b.orderY;

  out.hero = null;
  const rows = b.units.length;
  while (out.unitPool.length < rows) out.unitPool.push(newUnitRow());
  const byIndex = out.byIndex;
  byIndex.fill(null);
  let unitCount = 0;
  let monsterCount = 0;
  for (let i = 0; i < rows; i++) {
    const to = b.units[i];
    // The same body one step ago, or nothing. `byIndex` is keyed on
    // `EntityId::index` alone, which is a slot and not an identity, so the `id`
    // test behind it is load-bearing: it is what stops a recycled slot reading
    // as the previous occupant getting up and walking to the new one's feet.
    // A row past `ID_INDEX_SPAN` reads `undefined` here, which is falsy, which
    // snaps -- see `ID_INDEX_SPAN` for why that cannot happen today.
    const was = from.byIndex[to.index];
    const source = was && was.id === to.id && !snapRow(was, to) ? was : to;
    const row = blendUnit(source, to, t, out.unitPool[i]);
    out.units[unitCount++] = row;
    if (row.index < ID_INDEX_SPAN) byIndex[row.index] = row;
    if (row.faction === FACTION_HEROES) {
      if (out.hero === null) out.hero = row;
    } else {
      out.monsters[monsterCount++] = row;
    }
  }
  // The views are truncated, never the pools -- see `newFrameState`.
  out.units.length = unitCount;
  out.monsters.length = monsterCount;

  // The arrows, matched by **row index** -- the one match in this file that is
  // not an identity, and a deliberate compromise rather than an oversight.
  // `ShotView` carries no handle by design (`crates/sim/src/world.rs`) and
  // `shots()` emits the live slots in ascending order, so an arrow landing
  // shifts every row after it up by one and row `i` becomes a different arrow.
  //
  // The correct fix is a `slot` column on the shot row, and it costs
  // `SHOT_STRIDE` 4 -> 5 and `FRAME_LAYOUT_VERSION` 6 -> 7 across five files in
  // a repo where four golden suites hang off the frame; `perf-03-cadence.md`
  // rules that its own session and not this one. Arrows are the fastest thing on
  // screen and therefore the most judder-visible, so leaving them raw was not an
  // option either.
  //
  // So the re-index is caught page-side by what it does: it moves a row a long
  // way in one frame, and an arrow does not. Faction rides along for free -- an
  // arrow cannot change sides, so two rows that disagree about it are certainly
  // two different arrows. Worst case is one arrow drawn without interpolation
  // for one frame, on the frame another arrow lands.
  const shots = b.shots.length;
  while (out.shotPool.length < shots) out.shotPool.push(newShotRow());
  const jump = SHOT_SNAP_UNITS * span;
  const jumpSq = jump * jump;
  for (let i = 0; i < shots; i++) {
    const to = b.shots[i];
    const was = from.shots[i];
    const shot = out.shotPool[i];
    let source = to;
    if (was && was.faction === to.faction) {
      const dx = to.x - was.x;
      const dy = to.y - was.y;
      if (dx * dx + dy * dy <= jumpSq) source = was;
    }
    shot.x = mix(source.x, to.x, t);
    shot.y = mix(source.y, to.y, t);
    shot.heading = lerpAngle(source.heading, to.heading, t);
    shot.faction = to.faction;
    out.shots[i] = shot;
  }
  out.shots.length = shots;

  // **No events, and that is the honest answer rather than a shortcut.** Every
  // other row in a frame describes state, which is a thing there is a halfway
  // point of; an event describes something that *happened*, at an instant, and
  // there is no halfway point between a blow landing and it not. The feed
  // belongs to the ticks that just ran, `consumeEvents` reads it off `curr`
  // exactly once per `step()`, and a copy of it here would be a second feed
  // sitting where somebody could consume it twice.
  out.eventCount = 0;
  out.events.length = 0;
  return out;
}

// ---------------------------------------------------------------------- perf
//
// Frame timing, in one place, with two audiences. The `fps` chip is always on
// and is for the player: a refresh rate and the worst frame in the last half
// second, because a judder complaint is about the tail and never about the mean.
// The breakdown behind `P` is for whoever is optimising, and it is off by
// default so that the loop pays one boolean for it.
//
// **A warning about what `render` means.** Canvas2D commands are queued;
// rasterisation and compositing happen after this callback returns. A small
// `render` with a large `idle` and a bad frame rate means the cost is in the
// compositor, not in this file. `idle` is the number that tells them apart.
//
// That is also why `loop` puts *every* statement it runs inside exactly one
// phase rather than only the interesting ones: `idle` is a remainder, so any
// work left unbracketed lands in it and reads as the compositor.
//
// A 500 ms window of `count`/`sum`/`max` rather than a ring buffer: a percentile
// over a hundred-odd samples is the second-worst sample with a sort in front of
// it, and pretending otherwise would be inventing precision. Half a second is
// slow enough to read and short enough that a stutter is still on screen when
// the number naming it appears.
const PERF_WINDOW_MS = 500;
const PERF_PHASES = ["input", "step", "parse", "level", "sync", "insets", "pick", "render", "hud", "idle"];

let perfDetail = false;
const perf = {
  windowStart: 0,
  frames: 0,
  worst: 0,
  interval: 0, // summed rAF intervals, for the median
  ticks: [0, 0, 0, 0], // 0, 1, 2, 3+ ticks in a frame
  dropped: 0, // frames that hit MAX_CATCHUP_TICKS and binned a backlog
  sum: {},
  max: {},
  fpsText: "—",
  detailText: "",
};
for (const name of PERF_PHASES) {
  perf.sum[name] = 0;
  perf.max[name] = 0;
}

let perfMark = 0;
/** How much of *this* frame the phases have accounted for, which is the whole
 *  of how `idle` is arrived at. Reset by `perfFrame`, never read anywhere else. */
let perfBusy = 0;

/** Opens a phase. A no-op with the breakdown off.
 *
 *  One mark and no stack: the phases in `loop` are strictly sequential and never
 *  nested, so a stack would be a data structure guarding against a shape the
 *  loop does not have. Nest one inside another and the outer one silently
 *  reports the inner one's span -- which is the cost of the simplicity, stated
 *  here rather than discovered later. */
function perfOpen() {
  if (!perfDetail) return;
  perfMark = performance.now();
}
/** Closes the phase opened by the matching `perfOpen`. */
function perfClose(name) {
  if (!perfDetail) return;
  const ms = performance.now() - perfMark;
  perf.sum[name] += ms;
  perfBusy += ms;
  if (ms > perf.max[name]) perf.max[name] = ms;
}

/**
 * One frame's worth of bookkeeping, and the window boundary.
 *
 * `elapsed` is the **raw** rAF interval, taken before the loop clamps it to
 * `MAX_FRAME_MS` -- a clamped value would quietly report a 250 ms stall as 250 ms
 * of smooth running, which is the one frame you most want to see.
 */
function perfFrame(now, elapsed, ticks, dropped) {
  perf.frames++;
  perf.interval += elapsed;
  if (elapsed > perf.worst) perf.worst = elapsed;
  perf.ticks[Math.min(ticks, 3)]++;
  if (dropped) perf.dropped++;

  // `idle` is the one phase nothing opens or closes: it is the interval minus
  // everything the nine other phases claimed. Clamped at zero because
  // `performance.now()` is coarse and the phases can sum a hair past the frame
  // they were measured in -- a negative idle would be arithmetic noise printed
  // as a finding.
  if (perfDetail) {
    const idle = Math.max(0, elapsed - perfBusy);
    perf.sum.idle += idle;
    if (idle > perf.max.idle) perf.max.idle = idle;
  }
  perfBusy = 0;

  if (now - perf.windowStart < PERF_WINDOW_MS) return;
  const span = (now - perf.windowStart) / 1000;
  const fps = perf.frames / span;
  const median = perf.interval / Math.max(perf.frames, 1);
  perf.fpsText = `${Math.round(fps)} · ${perf.worst.toFixed(0)}ms`;
  // A glance rather than a read: anything past about a frame and a half of the
  // observed cadence is a hitch whatever the refresh rate happens to be.
  perfWarn(perf.worst > median * 1.6);

  if (perfDetail) {
    // Means, not maxes: ten means fit on one line and ten mean/max pairs do not.
    // `max` is collected anyway for the one phase whose tail is the whole story
    // -- `level`, which fires on a tile crossing, a zoom or a mode change and
    // whose mean is therefore meaningless. Reading that spike is a one-word edit
    // here rather than a re-instrumentation.
    const parts = PERF_PHASES.map((n) => `${n} ${(perf.sum[n] / perf.frames).toFixed(2)}`);
    perf.detailText =
      `${parts.join(" · ")}   ticks ${perf.ticks[0]}:${perf.ticks[1]}:${perf.ticks[2]}:${perf.ticks[3]}` +
      (perf.dropped ? `  DROPPED ${perf.dropped}` : "");
  }

  perf.windowStart = now;
  perf.frames = 0;
  perf.worst = 0;
  perf.interval = 0;
  perf.ticks[0] = perf.ticks[1] = perf.ticks[2] = perf.ticks[3] = 0;
  perf.dropped = 0;
  for (const name of PERF_PHASES) {
    perf.sum[name] = 0;
    perf.max[name] = 0;
  }
}

function perfWarn(on) {
  if (el.perfFps) el.perfFps.classList.toggle("warn", on);
}

/** `P`, and `?perf=1` for a fresh load. Independent of `[dev]` on purpose --
 *  `[dev]` turns the fog off, so profiling in it measures a renderer that draws
 *  every body in the room, which is not the one anybody is complaining about.
 *  See the note in `docs/plans/perf-00-overview.md`.
 *
 *  A class on the same `dev-strip` element `setViewMode` writes `open` to, and
 *  fetched the same way it fetches it: two independent bits on one strip, so the
 *  breakdown is readable from `[regular]` and the tick/at/hash are unaffected. */
function setPerfDetail(on) {
  perfDetail = on;
  const strip = document.getElementById("dev-strip");
  if (strip) strip.classList.toggle("perf", on);
  if (!on) perf.detailText = "";
}

// ------------------------------------------------------------------ the page

const canvas = document.getElementById("arena");
/**
 * **A transparent backing store, deliberately. `{ alpha: false }` was tried,
 * measured and rejected -- do not try it again without reading this.**
 *
 * The argument for it is real: the arena is the bottom layer and the whole HUD
 * is DOM on top, so an opaque backing store lets the compositor skip blending
 * the canvas over the page.
 *
 * Two things stop it. The first is a trap and is fixable: an `alpha: false`
 * context starts opaque **black**, so `render`'s `clearRect` paints the void
 * `#000` instead of the page's own colour. That is one line -- the clear becomes
 * a fill of `--bg`.
 *
 * The second is not fixable and is the reason this stayed transparent. **The
 * void is not a flat colour.** `body` (`web/style.css`) is
 * `radial-gradient(1200px 700px at 50% 42%, #141a26 0%, transparent 70%)` over
 * `--bg`, so what shows through the canvas is a soft ambient wash across the
 * middle of the window -- `rgb(20,26,38)` at its centre against `rgb(9,11,16)`
 * at the corners. An opaque canvas cannot show it, and a flat fill of `--bg`
 * flattens the room's whole ambient light. It also silently changes the fog:
 * `SEEN_ALPHA` blends remembered ground *toward the page background*, which is
 * stated in that constant's own comment and in `rebuildLevelPaths`'s ("the page
 * background is already the void"). Reproducing the gradient in JS would be a
 * second copy of a background the stylesheet owns.
 *
 * What it bought, measured on this machine (Chrome, dpr 2, a 3456x1778 backing
 * store, one hero and three monsters, five runs of 100 `render()` calls each,
 * alternating fresh page loads): a median **0.28-0.34 ms transparent against
 * 0.22-0.23 ms opaque** -- around 0.06-0.11 ms of a 16.7 ms budget, and that is
 * command *issuance* only. The compositing saving, which is the actual claim,
 * could not be measured at all from inside the page. Session 1's headline is
 * that 4.17 of `render`'s 4.31 ms at 64 units is per-body drawing; this is not
 * where the frame is going, and it is not worth changing how the room is lit to
 * find out.
 */
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
  // The frame budget, beside the tick. `perfFps` is always on screen -- a
  // judder complaint has to be answerable without opening anything -- while
  // `perfDetail` is the ten-phase breakdown behind `P`. One preformatted string
  // rather than ten chips: ten chips would be ten CSSOM writes and a flex
  // reflow twice a second, in order to measure a flex reflow.
  perfFps: document.getElementById("perf-fps"),
  perfDetail: document.getElementById("perf-detail"),
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
  const was = rail.classList.contains("open");
  rail.classList.toggle("open", open);
  document.body.classList.toggle(`rail-${which}-open`, open);
  const tab = rail.querySelector(".rail-tab");
  if (tab) tab.setAttribute("aria-expanded", open ? "true" : "false");
  // No `resize()` call: the canvas host did not change size, because the rails
  // are `position: fixed` over it and neither the `ResizeObserver` nor
  // `window.resize` has anything to say about one opening. What changed is how
  // much of the glass the player can see, and that is the camera's business.
  //
  // So this is the one thing that has to be said, and it is said to the camera:
  // *a rail is moving now*. The loop re-measures `railInsets()` on every frame
  // for as long as that holds, which is what makes the view breathe with the
  // 180 ms slide instead of snapping at one end of it. Only on a real change --
  // toggling a rail to the state it is already in starts no transition, and
  // arming the flag for it would be 250 ms of layout flushes for a slide that
  // never happened.
  if (was !== open) railStartedMoving(which);
}

function railOpen(which) {
  const rail = RAILS[which];
  return !!rail && rail.classList.contains("open");
}

/**
 * Whether either rail is mid-slide, and therefore whether the camera has to
 * re-measure this frame.
 *
 * **Why there is a flag at all.** `refreshInsets()` costs 0.018 ms when the
 * layout is already clean and **0.666 ms when it is not**
 * (`docs/plans/perf-measurements.md`), and in the loop it never is -- the
 * previous frame's `updateHud` wrote to the DOM. Four `getBoundingClientRect()`
 * calls forcing a synchronous layout flush is 4% of a 16.7 ms frame, every
 * frame, to learn a number that only ever changes while a rail is actually
 * moving. The measurement itself is not cached and not replaced by an assumed
 * `--rail-w`: it still runs on **every frame of the slide**, which is the whole
 * argument the block above the call in `loop` makes.
 *
 * **Per rail rather than one flag for both**, because both can be in flight at
 * once: press `[` and then `]`, and a single flag would be cleared by the first
 * rail's `transitionend` while the second is still halfway across the screen.
 *
 * **The 250 ms timer is not belt-and-braces.** `transitionend` does not fire at
 * all under `prefers-reduced-motion: reduce` -- `web/style.css` sets
 * `.rail { transition: none }` there -- and does not fire for a transition that
 * was interrupted or never started. A flag left *up* costs four rects a frame
 * and nothing else; a flag stuck *down* over a rail that is still moving is a
 * stale safe rect, which throws the character across the screen. The timer is
 * what bounds the flag's life from the other end.
 *
 * **Everything that can move a rail has to come through here.** Today that is
 * `setRail` -- every keypress and every tab click funnels into it -- plus a tab
 * coming back into view, where a paused transition and a throttled timer can
 * have spent the flag on a slide that had not started yet (see the
 * `visibilitychange` handler). The window is the third mover and needs no flag:
 * it changes `--rail-w` and goes through `resize()`, which measures directly. A
 * future thing that resizes a rail without doing any of those must call
 * `railStartedMoving`, or the camera will not notice it.
 */
const RAIL_SETTLE_MS = 250;

const railMotion = {
  enemy: { moving: false, timer: 0 },
  hero: { moving: false, timer: 0 },
};

function railsMoving() {
  return railMotion.enemy.moving || railMotion.hero.moving;
}

function railStartedMoving(which) {
  const motion = railMotion[which];
  if (!motion) return;
  motion.moving = true;
  // Re-armed rather than left to run out: a second toggle part-way through the
  // first slide starts a fresh 180 ms of movement and must get a full window of
  // its own rather than inherit whatever was left of the previous one.
  if (motion.timer) clearTimeout(motion.timer);
  motion.timer = setTimeout(() => railSettled(which), RAIL_SETTLE_MS);
}

function railSettled(which) {
  const motion = railMotion[which];
  if (!motion) return;
  if (motion.timer) clearTimeout(motion.timer);
  motion.timer = 0;
  motion.moving = false;
  // One last measurement, **after** the flag is down. The loop stops measuring
  // the moment the last rail settles, so without this the safe rect would keep
  // whatever the final animating frame read rather than where the rail actually
  // came to rest -- a pixel or two under a `transitionend`, and the entire rail
  // width under `prefers-reduced-motion`, where the class flip *is* the whole
  // transition and no animating frame ever happened.
  if (refreshInsets()) resize();
}

// The end of the slide, from the rail itself. Filtered on both the element and
// the property, and both filters are load-bearing. The shut rule is
// `transition: transform 180ms ease, visibility 0s linear 180ms`, so the
// *visibility* transition fires a `transitionend` of its own -- immediately, on
// the way open, where it carries no delay -- and taking that one would clear the
// flag on the first frame of the slide, which is precisely the snap this exists
// to prevent. Controls inside the rail have transitions of their own and those
// bubble, hence the target test.
for (const which of ["enemy", "hero"]) {
  const rail = RAILS[which];
  if (!rail) continue;
  rail.addEventListener("transitionend", (event) => {
    if (event.target === rail && event.propertyName === "transform") railSettled(which);
  });
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
 *  only distinguishes things the sim cannot tell apart -- a walk somewhere and a
 *  stand-down, both of which are `Goto`.
 *
 *  A lock is its own discriminant and needs no help being recognised, and it is
 *  recorded here anyway: when the quarry falls the module leaves a `Goto` at the
 *  hero's feet behind it, and a stale `"stand"` from before the lock would make
 *  the panel call that a stand-down the player never performed. */
let intent = "none"; // "goto" | "focus" | "stand" | "free" | "manual" | "none"

/**
 * The `unit.id` of the locked quarry, or null.
 *
 * A **number** since the parse was pooled -- `generation * ID_INDEX_SPAN +
 * index` -- which means `null` is the only safe "nothing" here and every test
 * against it has to be `=== null` rather than a truthiness check. Entity index 0
 * at generation 0 packs to `0`, and a monster can hold that slot.
 *
 * Page-side because the module does not publish which body an `Order::Focus`
 * named, and does not need to: this page is what named it, and the frame already
 * carries where that body is standing now. What the page cannot get from the
 * header alone is how *big* the target is, which is the one thing the ring in
 * `drawLock` has to look up.
 *
 * Cleared off `orderKind`, and that one test is the whole of the bookkeeping:
 * every path that takes the order away from a focus moves that number --
 * `descend`, a hero swap, a stand-down, free will, and the quarry dying, which
 * session 4 turns into a `Goto` at the hero's own feet inside the tick loop.
 * There is no path that drops a focus without moving it, so nothing else has to
 * remember to clear this.
 */
let locked = null;

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
 *
 * **Not free, and therefore not called on every frame any more.** Four
 * `getBoundingClientRect()` calls against the dirty layout the loop always hands
 * it measured 0.666 ms. `resize` calls this unconditionally, because a resize is
 * an event; the loop calls it only while `railsMoving()` holds. See that
 * function for the whole of the gate.
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
 *
 * The key is `unit.id`, which is a **number** since the parse was pooled --
 * `generation * ID_INDEX_SPAN + index`. Cheaper to hash than the string it
 * replaced, and `id % ID_INDEX_SPAN` gets the index back for the two lookups
 * that only have one (`factionOfActor`, `actorVisible`).
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
/**
 * The order as the frame reports it, to spot a new one -- as three numbers.
 *
 * It was a `${kind}:${a}:${b}` template string, rebuilt every frame to detect a
 * change that happens a handful of times a minute. Three scalar comparisons say
 * the same thing and allocate nothing.
 *
 * `orderKeyA`/`orderKeyB` mean different things under different orders, which is
 * the whole reason the key exists rather than a plain `orderKind` test: under a
 * focus they are `locked` and nothing, and under everything else they are the
 * destination. See where they are written in `loop` for why a lock is keyed on
 * *who* and never on where.
 *
 * `-1` is the empty key: no `Order` discriminant is negative, so a fresh page, a
 * restart and a descent all read as "not the order that is standing".
 */
let orderKeyKind = -1;
let orderKeyA = 0;
let orderKeyB = 0;
let orderIssuedAtDecision = -1;
let orderAcknowledged = false;

/** Forgets whatever order the key was describing, so the next frame reads as a
 *  new one. Called wherever the world is replaced under it. */
function forgetOrderKey() {
  orderKeyKind = -1;
  orderKeyA = 0;
  orderKeyB = 0;
}
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
 * Snapped, because a fractional offset smears the grid -- which is drawn on
 * half-pixel boundaries precisely so it stays crisp -- and sets the baked
 * flagstones crawling as the camera eases. The snap lives here rather than
 * inside `render` so that the inverse is undone against the matrix that was
 * actually used, not against the one it was rounded from.
 *
 * **Snapped to a quarter of a device pixel and no longer to a whole one.** A
 * whole device pixel against a camera that eases continuously is a quantiser on
 * the one thing on this page that was already smooth: at `dpr = 1` the hero
 * moves about 3 CSS px a frame, so a 1 px quantum is a third of the velocity,
 * arriving as a ripple laid on top of everything the interpolation in
 * `blendUnit` just took out. A quarter pixel keeps the grid and the flagstones
 * honest -- the residual is a quarter of a pixel of blur on a line that is a
 * pixel wide -- and takes the ripple to under a tenth.
 *
 * There is a fully correct version of this, and it was deliberately not taken:
 * draw the level with the snapped origin and `ctx.translate` the fractional
 * remainder before everything that moves. It costs the invariant the two
 * paragraphs above and `pointerToWorld` are built on -- one matrix, written
 * twice -- because a click would then have to invert the *un-snapped* origin
 * while the flagstones were drawn from the snapped one. A quarter pixel is
 * enough by eye, so the invariant stands.
 */
function viewOrigin() {
  const safe = safeRect();
  // Quarter *device* pixels: `dpr` converts CSS to device and the 4 is the
  // subdivision, so this stays a whole number of device subpixels on a display
  // of any density.
  const q = dpr * 4;
  return {
    x: Math.round((safe.x + safe.w / 2 - px(cam.x)) * q) / q,
    y: Math.round((safe.y + safe.h / 2 - px(cam.y)) * q) / q,
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

/** How much slop a click gets around a body, in world units. A body is a small
 *  target at this zoom and a lock is a friendly gesture, so missing by a hair
 *  should still hit. Small enough that two adjacent bodies do not swell into one
 *  ambiguous blob -- and where they do overlap, `unitAt` breaks the tie by
 *  distance rather than by whichever row the frame happened to list first. */
const PICK_SLOP = 0.3;

/**
 * The enemy under `point`, or null.
 *
 * **Ones the player can see, only.** A lock onto something the fog is hiding
 * would be the page reading a body off the frame that the screen is not showing:
 * the click would look like it had been eaten by empty ground, and the order it
 * quietly produced would be about a monster the player has not met yet. Asked
 * through `canSee` rather than off the raw `visible` column, so that `[dev]`'s
 * "show me the whole room" is one answer everywhere instead of a mode where a
 * plainly drawn body refuses to be clicked; under the fog the two are the same
 * test, which is the case this rule is actually about.
 *
 * Nearest centre wins rather than first hit, so a click in the overlap of two
 * crowding bodies picks the one it landed nearer to.
 *
 * `state.monsters` is already every non-hero row, so there is no faction test
 * here and no way for this to hand back the character doing the clicking.
 */
function unitAt(point, state) {
  let best = null;
  let nearest = Infinity;
  for (const unit of state.monsters) {
    if (!canSee(unit)) continue;
    const d = Math.hypot(unit.x - point.x, unit.y - point.y);
    if (d > unit.radius + PICK_SLOP || d >= nearest) continue;
    nearest = d;
    best = unit;
  }
  return best;
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

/**
 * Names the enemy to fight. Answers whether the lock actually took.
 *
 * Beside `goTo` and shaped like it because the two are the halves of one
 * gesture: a tap on the floor is a place, and a tap on a body is a fight. The
 * module owns everything after that -- which ring to stop at is the weapon's
 * business, and the page has no opinion about how wide a bow's is.
 *
 * The answer is not decoration. `set_focus` refuses a handle that does not name
 * a living monster, and the caller needs to know so it can do something else
 * with the click rather than paint a lock that is not standing.
 */
function focusOn(foe) {
  if (!wasm.set_focus(foe.index, foe.gen)) {
    // Refused: a stale handle, or a body that fell in the gap between the frame
    // being drawn and the finger lifting. Say nothing rather than lie about a
    // lock -- and leave `intent` and `locked` exactly as they were, because a
    // mis-aimed click is not a request to drop the order that is standing.
    return false;
  }
  intent = "focus";
  locked = foe.id;
  hint("Locked on. It closes to its own weapon's range and follows if they run.");
  return true;
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
  // `SCRATCH_STATE` and never a pooled one: this runs between animation frames
  // and the loop is still holding both of those. Nothing here outlives the
  // function -- `focusOn` copies the handle out as a number, `goTo` reads a
  // radius -- so the scratch is free the moment this returns.
  const state = parseFrame(frameView(), SCRATCH_STATE);
  if (!state.hero) return;

  // A tap is a click. The threshold is on how far the hand got and not on the
  // point count, so a slow, shaky press that never left the spot is still a
  // click -- which is what the hand that made it meant.
  //
  // And a tap on a body is a different sentence from a tap on the floor. The
  // refusal falls straight through to the walk on purpose: a monster that died
  // between the frame being drawn and the finger lifting should still leave the
  // character heading for where it was standing, which is very nearly what the
  // player asked for, rather than eating the click and saying nothing.
  if (d.far < DRAG_THRESHOLD) {
    // **Hit-tested against the picture, not against the truth.** `view` is the
    // blend `loop` last drew; `state` is the frame as the module holds it, which
    // is up to a tick ahead of what was on the screen when the finger came down.
    // A body at a run covers most of its own radius in a tick, so testing
    // against `state` would miss clicks aimed squarely at a moving monster --
    // the click has to hit what the player was looking at. Everything the answer
    // is *used* for is exact: `focusOn` sends `index` and `gen`, and both are
    // snapped through the blend rather than interpolated.
    //
    // `view` is null only before the first frame has been drawn, where there was
    // nothing on screen to aim at and `state` is the only picture there is.
    const foe = unitAt(d.at, view || state);
    if (foe && focusOn(foe)) return;
    // The walk, and the radius it reads, come off the truth: this is an order
    // and not a picture.
    goTo(d.at, state);
    return;
  }

  // **A drag stays a route unconditionally**, and everything from here down is
  // untouched by the lock above: a path traced through a body is still a path.
  // Picking a body out of the middle of a drawn line would take the one gesture
  // on this page that is unambiguous and make it depend on what happened to be
  // standing where the finger stopped.
  //
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
  // matching its record against the one that fell.
  forgetHeroRail();
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
  snapCamera(parseFrame(frameView(), SCRATCH_STATE));
  // The loop's last parse describes the character that fell, standing wherever
  // it dropped. `pushInput` aims from `curr.hero`, so leaving it would aim the
  // newcomer's first frame from a dead body's feet. One skipped frame of aim is
  // the smaller lie.
  //
  // And `prev` with it, which is the hook session 3 said it wanted: the
  // replacement drops in at the clearest spot on the floor, which can be right
  // across the room, and a first frame blended from the old character's feet
  // would slide the newcomer in from where the last one died. The rotation in
  // `loop` would null `prev` anyway once it saw `curr` was null; saying so here
  // is what makes that a stated intention rather than a happy consequence.
  curr = null;
  prev = null;
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
  forgetOrderKey();
  orderAcknowledged = false;
  // The loop's last parse describes the room that no longer exists, and `prev`
  // the one before that. Same argument as `swapInHero`, one floor larger:
  // nothing may aim from, or interpolate towards, a room `init` has replaced.
  curr = null;
  prev = null;
  // `init` builds a fresh `Sim`, which starts with both sides on the baseline
  // and nothing under manual control. The page has to agree, or its dropdowns
  // and toggles describe a module that no longer exists.
  held.clear();
  controlMask = 0;
  updateControlButtons();
  syncBehaviourPanel();
  // Both rails describe module state that `init` has just rebuilt -- a fresh
  // hero and a fresh spawn template. Drop the records so the next read is a
  // real read rather than a match against a room that no longer exists.
  forgetHeroRail();
  forgetEnemyRail();
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
  snapCamera(parseFrame(frameView(), SCRATCH_STATE));
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
 *  Named `currentView` and not `view` because `view` is taken -- two `let`s of
 *  the same name in one top-level scope is a `SyntaxError` and the page would
 *  not boot at all. It used to be taken by the `Float32Array` over the frame
 *  buffer, which is now `frameBuf`; it is taken today by the blended state the
 *  loop draws. Either way this one keeps its longer name, because "the view" on
 *  this page means the camera and the picture and not a menu setting. */
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
    // `SCRATCH_STATE`, on the same terms as `endDrag`: a handler between frames
    // must not write into a state the loop is holding.
    const state = parseFrame(frameView(), SCRATCH_STATE);
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
      else standDown(parseFrame(frameView(), SCRATCH_STATE));
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
      //
      // **`Shift+S` sends in eight at once**, and it is an instrument rather
      // than a feature: profiling one Brute says nothing about a hundred units,
      // and `MAX_UNITS` is 64, so a full room is eight presses instead of
      // sixty-four. Deliberately the same spawn path called eight times, on the
      // same guards as the single key -- the module refuses once the room is
      // full and `announceSpawn` says so, which is the whole of the "the run is
      // over" case here.
      if (!event.repeat) {
        const body = key === "s" ? BODY_SKITTERER : BODY_BRUTE;
        const count = key === "s" && event.shiftKey ? 8 : 1;
        for (let i = 0; i < count; i++) spawnMonster(body);
      }
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
    } else if (key === "p") {
      // The frame breakdown, and **not** a view mode: `[dev]` turns the fog off,
      // so a breakdown that only opened there would be measuring a renderer that
      // draws every body in the room -- a different renderer from the one anybody
      // is complaining about. Its own key, readable from `[regular]`, and the two
      // bits sit on the same strip without touching each other.
      //
      // Repeat-guarded like `g` and for the same reason: held down it would
      // thrash a class on the strip dozens of times a second.
      if (!event.repeat) setPerfDetail(!perfDetail);
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
    if (!dead) standDown(parseFrame(frameView(), SCRATCH_STATE));
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

/**
 * Whether a rail's read-back has moved since the last one, and the record of it.
 *
 * **Numbers rather than a template string.** Both rails ran once a frame and
 * each built a fresh `${body}|${slots}|${attrs}` to notice a change that happens
 * a handful of times a minute: one string, two array joins and a pile of number
 * conversions, sixty times a second, for panels nobody is touching. The two
 * arrays below are allocated once at boot and written in place, so a frame where
 * nothing moved now allocates nothing at all. The wasm reads are untouched --
 * each is ~30 ns and `syncHeroRail` returns `stats`, which the loop needs.
 *
 * **`NaN` is the forget-what-you-read sentinel**, and it works for exactly the
 * reason `NaN !== NaN`: every path that has to force a repaint fills the record
 * with it and the next comparison cannot match whatever the module answers. That
 * is the same job the empty string did, in a form a number can carry.
 *
 * Every cell is compared *and* taken, in one pass, because a partial take would
 * leave the record describing half of one read and half of another.
 */
function railMoved(seen, read) {
  let moved = false;
  for (let i = 0; i < read.length; i++) {
    if (seen[i] !== read[i]) moved = true;
    seen[i] = read[i];
  }
  return moved;
}

/** The Hero rail's last honest read of the module, and the record that says
 *  whether anything moved.
 *
 *  Ten cells: the body, two kit slots, five attributes, the sight range and
 *  whether anybody is standing. `heroCache` still holds the shaped copy
 *  `renderHeroRail` and `syncKitReadout` read, and it is rebuilt only on the
 *  frames something actually changed.
 *
 *  No longer frozen when the character falls. The getters answer out of the
 *  module's plan for the next spawn once there is nobody standing, so there is
 *  still something true to read every frame -- and the player can still move it,
 *  which a frozen snapshot could not have shown. **[Re-Spawn]** asks the module
 *  directly rather than reading this. */
const HERO_CELLS = 3 + ATTRIBUTES.length + 2;
const heroRead = new Float64Array(HERO_CELLS);
const heroSeen = new Float64Array(HERO_CELLS).fill(NaN);
let heroCache = null;
let lastHeroSight = 0;

/** Drops the Hero rail's record, so the next `syncHeroRail` is a real read
 *  rather than a match against a character that no longer exists. */
function forgetHeroRail() {
  heroSeen.fill(NaN);
}

/** The Enemy rail's, on the same terms: the template's body, two kit slots and
 *  five attributes. */
const ENEMY_CELLS = 3 + ATTRIBUTES.length;
const enemyRead = new Float64Array(ENEMY_CELLS);
const enemySeen = new Float64Array(ENEMY_CELLS).fill(NaN);

function forgetEnemyRail() {
  enemySeen.fill(NaN);
}

/** Builds both rails out of the registry. Called once, after the tables have
 *  been read across and after the attribute ceiling has been asked for. */
function buildRails() {
  fillBodySelect(el.heroBody);
  fillActionSelect(el.loadout0, false);
  fillActionSelect(el.loadout1, true);
  heroRack = buildAttrRack(el.heroAttrs, (stat, value) => {
    wasm.set_hero_stat(stat, value);
    forgetHeroRail();
  });
  buildKitReadout();

  fillBodySelect(el.enemyBody);
  // Slot 0 has no "none" row: `Loadout::set` refuses to empty it, because a
  // fighter holding nothing has no rule to run.
  fillActionSelect(el.enemySlot0, false);
  fillActionSelect(el.enemySlot1, true);
  enemyRack = buildAttrRack(el.enemyAttrs, (stat, value) => {
    wasm.set_spawn_template_stat(stat, value);
    forgetEnemyRail();
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
    // The same reads in the same order, straight into the record. Nothing is
    // shaped into an array until something has actually moved.
    heroRead[0] = body;
    heroRead[1] = wasm.hero_loadout(0);
    heroRead[2] = wasm.hero_loadout(1);
    for (let i = 0; i < ATTRIBUTES.length; i++) heroRead[3 + i] = wasm.hero_stat(ATTRIBUTES[i].stat);
    // A standing body's own sight column, or the archetype's while there is no
    // body -- a plan has no sight range until somebody is wearing it.
    lastHeroSight = state.hero ? state.hero.sight : BODIES[body] ? BODIES[body].sight : 0;
    // Sight is the one cell that is not an integer, so it keeps the two-decimal
    // deadband the `toFixed(2)` in the old key gave it: it is a float off the
    // frame, and comparing it raw would repaint the whole rail for a change in
    // the fourth decimal that the readout cannot show.
    heroRead[3 + ATTRIBUTES.length] = Math.round(lastHeroSight * 100);
    heroRead[4 + ATTRIBUTES.length] = alive ? 1 : 0;
    if (railMoved(heroSeen, heroRead)) {
      const slots = [heroRead[1], heroRead[2]];
      const attrs = Array.from(ATTRIBUTES, (_, i) => heroRead[3 + i]);
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
    forgetHeroRail();
  });
  el.loadout0.addEventListener("change", () => {
    if (!wasm.set_hero_loadout(0, Number(el.loadout0.value) | 0)) {
      hint("Not while that one is in the hand and moving.", true);
    }
    forgetHeroRail();
  });
  el.loadout1.addEventListener("change", () => {
    if (!wasm.set_hero_loadout(1, Number(el.loadout1.value) | 0)) {
      hint("Not while that one is in the hand and moving.", true);
    }
    forgetHeroRail();
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
  // The same reads in the same order, into the record rather than into a fresh
  // string. See `railMoved`.
  enemyRead[0] = wasm.spawn_template_body();
  enemyRead[1] = wasm.spawn_template_slot(0);
  enemyRead[2] = wasm.spawn_template_slot(1);
  for (let i = 0; i < ATTRIBUTES.length; i++) enemyRead[3 + i] = wasm.spawn_template_stat(ATTRIBUTES[i].stat);
  if (!railMoved(enemySeen, enemyRead)) return;

  el.enemyBody.value = String(enemyRead[0]);
  el.enemySlot0.value = String(enemyRead[1]);
  el.enemySlot1.value = String(enemyRead[2]);
  setKitIcon(el.enemySlot0, enemyRead[1]);
  setKitIcon(el.enemySlot1, enemyRead[2]);
  enemyRack.forEach((row, i) => {
    row.slider.value = String(enemyRead[3 + i]);
    setText(row.value, String(enemyRead[3 + i]));
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
    forgetEnemyRail();
    syncEnemyRail();
  });
  el.enemySlot0.addEventListener("change", () => {
    if (!wasm.set_spawn_template_slot(0, Number(el.enemySlot0.value) | 0)) {
      hint("That one cannot go in the first slot.", true);
    }
    forgetEnemyRail();
    syncEnemyRail();
  });
  el.enemySlot1.addEventListener("change", () => {
    if (!wasm.set_spawn_template_slot(1, Number(el.enemySlot1.value) | 0)) {
      hint("The module refused that action.", true);
    }
    forgetEnemyRail();
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
 * The level as six paths: open floor and bordering rock face, each split into
 * what the character can see *now* and what it merely remembers, plus the lit
 * rock edges and the scale bar's lattice.
 *
 * **Built once per level, not per frame.** A 48x32 level is 1536 tiles, and at
 * the top zoom bucket baking it into an offscreen canvas would be a 2304x1536
 * backing store rebuilt six times over. Six `Path2D`s cost 1536 `rect()` calls
 * once, and after that a fill is a fill.
 *
 * `revision` is `map_revision()`, which the module bumps only when the tiles
 * change; `vis` is `vis_revision()`, which it bumps when the character crosses a
 * tile and on a new level. `art` and `fog` are the flags this was baked under,
 * because both of them change what lands in which path. Anything else -- a tick,
 * a click, a slider -- leaves this alone.
 *
 * `remembered` says whether anything landed in either of the two dim paths, so
 * `drawLevel` can skip the whole remembered pass rather than clip to an empty
 * region and fill through it. With the fog off nothing ever does -- `seen()`
 * below answers `2` for every tile -- so `[dev]` stops paying for a layer it
 * cannot draw.
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
  grid: null,
  remembered: false,
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
  // Anything at all in the two dim paths? Written by the tile loop and read by
  // `drawLevel`, which skips its whole remembered pass when nothing is.
  let remembered = false;
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
        if (lit !== 2) remembered = true;
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
      if (exposed) {
        (lit === 2 ? wallLit : wallSeen).rect(x, y, size, size);
        if (lit !== 2) remembered = true;
      }
    }
  }

  // The scale bar's lattice, baked with everything else rather than rebuilt from
  // scratch twice a frame. It is pure geometry off `arena` and `scale`, and this
  // is already the function that is re-run when either moves -- a `Path2D` holds
  // pixels, so the `levelPaths.scale` check in `loop` is exactly the invalidator
  // it needs, and a level whose size changed came with a new `map_revision`.
  //
  // Baking it does not change *which* clip it is stroked under: `drawLevel`
  // still strokes it once inside each pass, for the reason stated there.
  const grid = new Path2D();
  const gw = px(arena.x);
  const gh = px(arena.y);
  for (let x = TILE_WORLD; x < arena.x; x += TILE_WORLD) {
    grid.moveTo(Math.round(px(x)) + 0.5, 0);
    grid.lineTo(Math.round(px(x)) + 0.5, gh);
  }
  for (let y = TILE_WORLD; y < arena.y; y += TILE_WORLD) {
    grid.moveTo(0, Math.round(px(y)) + 0.5);
    grid.lineTo(gw, Math.round(px(y)) + 0.5);
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
    grid,
    remembered,
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
 * The room's own lighting, cached.
 *
 * **A property of the room and not of the camera**, which is the whole reason it
 * is keyed on `(w, h)` -- the arena's pixel extent -- and on nothing else. Built
 * around the *viewport* instead it would slide across the floor as the camera
 * panned, and a light that follows the eye is the one thing a room's lighting
 * must never do. `w` and `h` move only on a resize or a zoom, so this is
 * rebuilt on those and on no other frame; it used to be constructed twice per
 * frame, once inside each pass of the loop below.
 */
let vignette = null;
let vignetteW = 0;
let vignetteH = 0;

function arenaVignette(w, h) {
  if (vignette && vignetteW === w && vignetteH === h) return vignette;
  const cx = w / 2;
  const cy = h / 2;
  const built = ctx.createRadialGradient(cx, cy, Math.min(w, h) * 0.16, cx, cy, Math.max(w, h) * 0.62);
  built.addColorStop(0, "rgba(9,11,16,0)");
  built.addColorStop(0.6, "rgba(9,11,16,0.20)");
  built.addColorStop(1, "rgba(9,11,16,0.62)");
  vignette = built;
  vignetteW = w;
  vignetteH = h;
  return built;
}

/** The two passes, hoisted so the loop below is not iterating a fresh array
 *  sixty times a second. Remembered ground first, then lit. */
const LEVEL_PASSES = [false, true];

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
 *
 * `origin` is `render`'s, passed rather than re-derived: it is what says which
 * corner of the arena the window is currently over, and re-deriving it here
 * would be a second copy of the camera transform -- the mistake `pointerToWorld`
 * has a paragraph about.
 */
function drawLevel(state, origin) {
  if (!levelPaths.floorLit) return;
  const w = px(arena.x);
  const h = px(arena.y);
  const art = artOn();
  // Asked for once, not once per pass: `floorPatternNow` re-aims the pattern
  // matrix on every call and bakes a new tile if the zoom bucket moved. With the
  // art off it is not called at all -- neither it nor `bakeFloorTile` is edited
  // for `[tactical]`, they are simply not reached.
  const pattern = art ? floorPatternNow() : null;

  // The arena rect the window is actually over, in the same level-corner space
  // everything below draws in. The two composites are full-arena fills, and at
  // the top zoom bucket the arena is several screens wide -- so this is the
  // difference between filling what can be seen and filling the room. It is
  // clamped to the arena at both ends, so the fills never grow past what they
  // used to cover, whatever the camera's overscan is doing.
  //
  // **Only the fills shrink.** The pattern is anchored to the level's corner and
  // the vignette is built from the arena's own centre and extent, so neither of
  // them can tell the difference; a rectangle that ends off-screen and one that
  // ends at the wall paint identical pixels everywhere the eye can see them.
  // Both edges are clamped through the same monotone `clamp`, so the far one can
  // never land left of the near one and the rect can never come out inverted --
  // which is the one way a shrunk `fillRect` could paint somewhere the full one
  // did not. A zero-width rect is a no-op, so there is nothing to guard.
  const clipX = clamp(-origin.x, 0, w);
  const clipY = clamp(-origin.y, 0, h);
  const clipW = clamp(-origin.x + viewport.w, 0, w) - clipX;
  const clipH = clamp(-origin.y + viewport.h, 0, h) - clipY;

  // Remembered ground, then lit ground, and the only difference between the two
  // passes is the alpha. One body of code for both is what stops the fog boundary
  // becoming a place where the floor changes texture.
  for (const lit of LEVEL_PASSES) {
    // Nothing is remembered until the character has walked out of somewhere, and
    // with the fog off nothing ever is -- `rebuildLevelPaths` puts every tile in
    // the lit paths. The pass would clip to an empty region and paint nothing,
    // so `[dev]` was paying twice over for one picture. Skipping it is exactly
    // equivalent: an empty clip admits no pixels.
    if (!lit && !levelPaths.remembered) continue;
    ctx.save();
    ctx.clip(lit ? levelPaths.floorLit : levelPaths.floorSeen);
    ctx.globalAlpha = lit ? 1 : SEEN_ALPHA;
    ctx.fillStyle = pattern || "#141a26";
    ctx.fillRect(clipX, clipY, clipW, clipH);

    if (art) {
      // Lit from the middle. Without this the stone reads as a swatch of texture
      // rather than as somewhere with a light in it. Built once and cached --
      // see `arenaVignette` for why it is keyed on the room and not the window.
      ctx.fillStyle = arenaVignette(w, h);
      ctx.fillRect(clipX, clipY, clipW, clipH);
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
    //
    // The geometry is baked in `rebuildLevelPaths` and stroked here, once per
    // pass. It used to be a `beginPath` and two `moveTo`/`lineTo` loops over the
    // whole arena, run twice a frame, to redraw a lattice that changes only when
    // the zoom does.
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(150,180,230,0.055)";
    ctx.stroke(levelPaths.grid);
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
 * The lock: which body the character is fighting, and the line out to it.
 *
 * **Where** that body is comes off the header. Session 4 made the module write
 * the quarry's live position into the same two slots a `Goto` uses, so the mark
 * tracks a fleeing monster with no page-side lookup at all. What it does need a
 * lookup for is how *big* the target is -- a Brute and a Skitterer are not the
 * same thing to draw a ring around, and a fixed radius would sit inside one and
 * float well clear of the other. `locked` is the handle this page sent in the
 * first place, which is why it can ask.
 *
 * The lookup is allowed to miss and the picture survives it. It cannot miss
 * through any path that exists today -- the order and the rows come off one
 * frame -- and a mark that blinked out for a frame if it ever did would read as
 * the lock dropping, which is a worse lie than a ring an inch off the right size.
 *
 * **No `arrived`.** Arriving is a `Goto` notion: the character settles at a ring
 * its own weapon chooses, the quarry keeps walking, and there is no moment for
 * the mark to go quiet about. `orderAcknowledged` still dims it until the
 * character has had a thought, because that is about the decision clock and not
 * about which kind of order is standing.
 */
function drawLock(state, now) {
  // `!== null` and not a truthiness test: `locked` is a packed handle now, and
  // generation 0 of entity slot 0 packs to the number `0`. See `locked`.
  const quarry = locked !== null ? state.units.find((u) => u.id === locked) : null;
  const x = px(state.orderX);
  const y = px(state.orderY);
  const beat = (Math.sin(now / 380) + 1) / 2;
  const alpha = orderAcknowledged ? 0.4 + 0.35 * beat : 0.16;
  // Clear of the silhouette rather than on it. The mark is drawn *under* the
  // bodies -- see the compositing order in `render` -- so a ring at exactly the
  // quarry's radius would be a line the quarry stands on top of and hides. The
  // 0.45 fallback is a middling body, for the miss the paragraph above argues
  // cannot happen.
  const r = px((quarry ? quarry.radius : 0.45) + 0.2) + (orderAcknowledged ? beat * px(0.12) : 0);

  ctx.save();
  // The threat colour, and never the destination's cyan. Cyan is spent on this
  // page: the trail, the route, the waypoint beads and the destination ring all
  // mean *a place the character is going*. A lock painted in it would read as
  // one more of those instead of as the answer to "which one?". Taken from
  // `MONSTER_SKIN` rather than written out, so the ring and the body it is drawn
  // around cannot drift apart.
  ctx.strokeStyle = `rgba(${MONSTER_SKIN.glow},${alpha.toFixed(3)})`;
  ctx.lineWidth = 1.8;
  if (!orderAcknowledged) ctx.setLineDash([3, 4]);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);

  // A tether from the character to the quarry, so a lock on something that has
  // run off down a corridor is still legible once the ring is past the edge of
  // the view: the line leaves the screen pointing at it. Solid and very faint,
  // which is what keeps it apart from `drawRoute`'s crawling cyan dashes -- that
  // one is ground the character will cover, and this one only says who.
  //
  // No centre dot and no crosshair, which is the other half of the difference
  // from a destination. A `Goto` is an exact point and the crosshair is how it
  // stays readable at any zoom; a focus is a body that is already drawn, and a
  // crosshair laid over a silhouette is noise on the picture the player is
  // trying to read the blade off.
  ctx.strokeStyle = `rgba(${MONSTER_SKIN.glow},${(alpha * 0.35).toFixed(3)})`;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(px(state.hero.x), px(state.hero.y));
  ctx.lineTo(x, y);
  ctx.stroke();
  ctx.restore();
}

/**
 * The destination, as the *simulation* holds it -- not as it was clicked.
 * They are the same number here, but drawing the sim's copy is what makes the
 * marker honest: it appears when the order lands, and it is dim until the
 * character has actually thought about it.
 *
 * Two kinds of order stand on the same two header slots, and they get two
 * pictures. A place gets the cyan ring below; a body gets `drawLock`. Splitting
 * on the discriminant here rather than colouring one drawing two ways is what
 * lets the lock drop the parts of this that only make sense for a point.
 */
function drawDestination(state, now, arrived) {
  if (state.orderKind === ORDER_FOCUS) {
    drawLock(state, now);
    return;
  }
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
 * things must not look alike. This one is a soft disc that is always there.
 *
 * **`filled` is a performance gate, and it is the binding constraint on how many
 * bodies this page can draw.** The fill is area-scaled -- one disc is `pi*r^2`
 * with `r` up to 825 device pixels at a wide sight radius and a zoomed-in
 * camera -- so it costs the *rasteriser* enormously while costing the JS that
 * issues it nothing. Measured at a full room: 41 visible bodies fill 89.6
 * million device pixels onto a 6.5 million pixel canvas, **13.7x the screen in
 * alpha-blended fill**, and the frame strip reports it as `render 0.83` with the
 * whole cost hiding in `idle` -- which is exactly the trap the note at the top of
 * the perf block warns about. The discs also stop being readable long before
 * that: the fill was tuned so that six could overlap and the floor stay legible,
 * and sixty-three of them sum to an opaque wash.
 *
 * So the fill is spent only where it says something a ring cannot -- the body you
 * are commanding, and the body you have locked -- and everything else keeps the
 * dashed outline, which is circumference-scaled and therefore some four hundred
 * times cheaper at that radius. The edge of sight is what the overlay is *for*,
 * and the ring is still the thing that draws it.
 */
function drawVision(unit, filled) {
  if (!visionVisible || !(unit.sight > 0)) return;
  const skin = skinOf(unit);
  ctx.save();
  ctx.beginPath();
  ctx.arc(px(unit.x), px(unit.y), px(unit.sight), 0, TAU);
  if (filled) {
    ctx.fillStyle = `rgba(${skin.wedge},0.032)`;
    ctx.fill();
  }
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
  // One lookup rather than a scan: `parseFrame` builds the index -> row table
  // while it is already walking the rows.
  const unit = state.byIndex[actor];
  if (unit) return unit.faction;
  // And the page's own memory, which is keyed on the *whole* handle. The index
  // is the low half of it -- see `ID_INDEX_SPAN` -- so this asks "whichever
  // generation held slot `actor`", which is the same question the string prefix
  // match this replaced was asking.
  for (const [id, seen] of bodies) {
    if (id % ID_INDEX_SPAN === actor) return seen.faction;
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
  const unit = state.byIndex[actor];
  if (unit) return canSee(unit);
  for (const [id, seen] of bodies) {
    // `lost` is last frame's, which is the right frame: this runs before
    // `syncBodies`, and what is being asked is whether the character had eyes on
    // it when it fell.
    //
    // Matched on the index half of the handle, exactly as `factionOfActor` does
    // and for the reason stated there.
    if (id % ID_INDEX_SPAN === actor) return !(seen.lost > 0);
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
    //
    // One lookup rather than a scan of every row, per pill, per frame: the
    // index -> row table falls out of the parse for one array write per unit.
    let x = c.x;
    let y = c.y;
    let radius = 0.5;
    const actor = state.byIndex[c.actor];
    if (actor) {
      x = actor.x;
      y = actor.y;
      radius = actor.radius;
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
  // Cleared to *transparent*, and that is load-bearing rather than incidental:
  // the page's own background is what shows through as the void, and it is a
  // gradient. See the block above `getContext` for the measurement that settled
  // this -- a `clearRect` under an `alpha: false` context would paint the void
  // black, and the fill that fixes that flattens the room's ambient light.
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
  // that is the only reason -- everything else about the ground is baked. It
  // takes `origin` too, so it can clamp its two full-arena composites to the
  // window; passed rather than re-derived, so there is one camera transform on
  // this page and not two.
  drawLevel(state, origin);
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
  // The soft fill goes to the two bodies whose sight the player is actually
  // reasoning about -- the one being commanded, and the one it has been pointed
  // at -- and every other body keeps the ring alone. See `drawVision` for the
  // arithmetic; at a full room this is the difference between 15.7x the screen
  // in blended fill and 2.6x, and it is the whole of why a crowd was unplayable.
  for (const unit of state.units) {
    if (canSee(unit)) drawVision(unit, unit === state.hero || (locked !== null && unit.id === locked));
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

/**
 * The globe is redrawn at 30 Hz, not 60.
 *
 * It is a second canvas with a `setTransform`, a `clearRect`, a clip, three
 * gradients and a liquid surface built out of a `Math.sin` pair every two
 * pixels. The only thing on it that moves on its own is the wobble, which is two
 * slow sines -- nobody can see that stepping at 30, and the redraw is the entire
 * cost.
 *
 * **The health level is never late.** The throttle is broken the moment the
 * character's hit points change, so a blow lands on the globe on the frame it
 * lands in the world; only the wobble waits. `Math.round` because that is the
 * precision the globe itself is drawn at -- it is the number printed over the
 * liquid -- so this cannot be a redraw the picture would not show. `maxHp` is in
 * because a hero swap changes it and the liquid is a fraction of it.
 *
 * The DOM readouts beside it -- `el.unitHp` and the `#hp-fill` bar -- are
 * written every frame regardless, in `updateHud`. Nothing here touches them.
 */
const GLOBE_MS = 33;
let globeDrawnAt = -Infinity;
let globeDrawnHp = -1;
let globeDrawnMaxHp = -1;

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

/** The last width written into the health bar, in tenths of a percent, or `-1`
 *  for "nothing written yet". See the write itself for why it is a number and
 *  not the string. */
let hpFillTenths = -1;

/** `tickNow` is passed in rather than read here: `wasm.tick()` is a boundary
 *  call and the loop already needs the answer for `stillSince`. Two reads of a
 *  monotonic counter in one frame cannot disagree, but one is still one. */
function updateHud(state, stats, distance, arrived, settled, now, tickNow) {
  const hero = state.hero;
  // Everything the frame drives, in one place. The kit readout and the action
  // bar read the frame; the Enemy rail reads the module's spawn template, which
  // nothing but this page can move -- it is re-read anyway, because a panel that
  // trusted its own last write is the failure 4.7 is about.
  syncKitReadout(state);
  syncActionBar(state);
  syncEnemyRail();
  // The globe, at 30 Hz or on a change to the health it is drawing, whichever
  // comes first. See the block above `drawGlobe` for why that pair is the whole
  // of the condition -- and note that it is only the *canvas* that waits: the
  // number and the bar below are written every frame.
  const globeHp = hero ? Math.round(hero.hp) : -1;
  const globeMaxHp = hero ? Math.round(hero.maxHp) : -1;
  if (now - globeDrawnAt >= GLOBE_MS || globeHp !== globeDrawnHp || globeMaxHp !== globeDrawnMaxHp) {
    globeDrawnAt = now;
    globeDrawnHp = globeHp;
    globeDrawnMaxHp = globeMaxHp;
    drawGlobe(state, now);
  }
  setText(el.simTick, String(tickNow));
  // The frame budget. Both go through `setText`, which already refuses a write
  // that would not change anything -- and these two strings only move on a
  // window boundary, so this is a no-op on twenty-nine frames out of thirty.
  setText(el.perfFps, perf.fpsText);
  if (perfDetail) setText(el.perfDetail, perf.detailText);
  // The project's central claim, and it costs a full walk of every entity slot
  // per call -- twice, because the two halves are separate exports and each
  // recomputes the whole thing. `World::state_hash` writes ~20 fields per
  // entity slot including the dead ones, plus every shot slot, plus the orders
  // and objectives: ~2,600 hash writes a frame at 64 units, and it is the one
  // cost on this page that gets strictly worse as the room fills. Worth every
  // cycle when it is on screen and worth none of them when the strip is shut,
  // which is every frame nobody is in `[dev]` (`web/style.css`, `.dev-strip`).
  //
  // **Not memoised in Rust**, deliberately: that is cache state to invalidate in
  // every mutator, in a crate whose whole point is that the hash is recomputed
  // from the world. One `if` on the page is the right size of fix.
  if (currentView().dev) setText(el.simHash, hex64(wasm.state_hash_hi(), wasm.state_hash_lo()));
  setText(el.simPosition, hero ? `${hero.x.toFixed(2)}, ${hero.y.toFixed(2)}` : "—");
  setText(el.unitHp, hero ? `${Math.round(hero.hp)} / ${Math.round(hero.maxHp)} hp` : "fallen");
  // The bar the eye reads, next to the number the eye checks. Same threshold the
  // bars on the canvas and the globe turn red at, from the same constant.
  const health = hero && hero.maxHp > 0 ? clamp(hero.hp / hero.maxHp, 0, 1) : 0;
  // Written only when it changes, on `setText`'s discipline and for the same
  // reason the cursor below `pick` is: this was a fresh string and a CSSOM write
  // sixty times a second for a value that moves on damage. The guard is on the
  // **tenth of a percent**, which is the precision the bar is actually written
  // at, so the comparison and the string come off one number and cannot drift
  // apart the way comparing `health` against a rounded write would.
  const tenths = Math.round(health * 1000);
  if (tenths !== hpFillTenths) {
    hpFillTenths = tenths;
    el.hpFill.style.width = `${(tenths / 10).toFixed(1)}%`;
  }
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

  if (state.orderKind === ORDER_FOCUS) {
    // The two fields above are still true under a lock -- the header carries the
    // quarry's live position, so "destination" is where that body is standing
    // and the distance is the gap to it, both of which move while the panel is
    // open. What must not fall through is the state line: every arm below is
    // about arriving somewhere, and there is no arriving at something that walks
    // away. What the character does instead is close to the ring its own weapon
    // wants and stay on that ring, which is a standing condition and not an
    // event, so this says the same thing for as long as the lock holds.
    el.orderState.className = "state";
    setText(
      el.orderState,
      orderAcknowledged
        ? "locked on — closing to its own weapon's range, and following"
        : "locked on — waiting for its next decision"
    );
    return;
  }

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

/**
 * The frame the loop last parsed, or `null` before the first one.
 *
 * Held across animation frames for two reasons. The near one is `pushInput`,
 * which runs *before* `wasm.step()` and reads nothing but `state.hero`: the
 * module's frame at that moment is byte-identical to the one the previous
 * animation frame already parsed, so re-parsing it was a whole second parse of
 * the whole frame -- 0.577 ms at 64 units, on every manual-control frame -- to
 * arrive at a number the page was already holding.
 *
 * The far one is session 3 (`docs/plans/perf-03-cadence.md`), which added `prev`
 * beside this and blends the two. That is why the loop's parse goes through
 * `nextPool()` rather than into one fixed state.
 *
 * `null` wherever the world is replaced under it -- `restart`, `swapInHero` --
 * so nothing ever aims from, or interpolates towards, a room that is gone.
 */
let curr = null;

/**
 * The frame before that one, and the two clocks that place the pair.
 *
 * `prev` is `curr` as it was one **step** ago and not one animation frame ago:
 * a frame that runs no ticks leaves both states exactly where they were, and
 * that is the entire point -- `alpha` goes on climbing across those frames and
 * the room glides through them instead of standing still.
 *
 * `prevTick` and `currTick` are `wasm.tick()` at the moments those two states
 * were parsed. The gap between them is however many ticks that frame ran: 1
 * usually, 2 on a late one, never 0 (the rotation is guarded on it), and up to
 * `MAX_CATCHUP_TICKS` on a frame that was catching up.
 *
 * **Carrying the gap is what makes one `alpha` formula cover all of those.**
 * Without it the loop would have to split `wasm.step(n)` into
 * `step(n - 1) + step(1)` to get an exactly-one-tick-old `prev` -- and that
 * silently drops events, because `step()` clears the feed **per call and not per
 * tick**. See the event block in `parseFrame`. Nothing here splits a step.
 *
 * `null` on the first frame of the page, of a floor, and of a replacement
 * character. See `cutInterpolation`.
 */
let prev = null;
let prevTick = 0;
let currTick = 0;

/**
 * What `locked` was at the moment each of those two states was parsed.
 *
 * Only `blend` reads them, and only to answer one question. Under a focus the
 * module writes the quarry's **live position** into the header's two order
 * slots, so they are continuous and the lock ring judders if they are snapped --
 * but the instant the player locks onto somebody else they jump across the room,
 * and blending *that* slides the ring over there instead of cutting to it.
 * "Is it still the same quarry" is `locked`, which only moves when a click names
 * a different body.
 */
let prevLocked = null;
let currLocked = null;

/**
 * The picture: `prev` and `curr` blended, and what the last `render` drew.
 *
 * **A picture and never the truth.** Nothing derived from it is written back
 * across the wall, and no order is built out of it -- `pushInput` and `goTo`
 * both read `curr`. It is module-level for exactly one reader outside `loop`:
 * `endDrag`, where a click has to hit the body the player was actually looking
 * at rather than the one the module has since moved on to. See there.
 *
 * `null` until the first frame has been drawn.
 */
let view = null;

/**
 * Forget where the world was.
 *
 * A cut and not a pan: the same judgement `snapCamera` makes about the view,
 * made about the bodies, and called from the same places for the same reason.
 * After a descent or a change of arena `prev` describes a room that no longer
 * exists, and blending towards `curr` from it would slide every body in from
 * wherever it happened to be standing on the floor above.
 *
 * On a descent it is worse than untidy. `Sim::descend` builds a fresh `World`,
 * so **`wasm.tick()` goes backwards**: `currTick - prevTick` comes out large and
 * negative, `alpha` clamps to 0, and the whole first frame of the new floor
 * would be the old floor drawn at full strength.
 *
 * `restart` and `swapInHero` reach the same place by setting `curr = null`,
 * which the parse rotation turns into a null `prev` on the next frame. They run
 * between animation frames, where there is no `curr` worth keeping either.
 */
function cutInterpolation() {
  prev = curr;
  prevTick = currTick;
  prevLocked = currLocked;
}

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
  // Kept before the clamp, and only the instrument reads it. Reporting the
  // clamped value would describe a 250 ms stall as 250 ms of smooth running,
  // which is precisely the frame worth seeing.
  const rawElapsed = elapsed;
  if (elapsed > MAX_FRAME_MS) elapsed = MAX_FRAME_MS;
  accumulator += elapsed;

  let ticks = Math.floor(accumulator / TICK_MS);
  // Recorded rather than inferred: a frame that binned a backlog means the sim
  // is genuinely behind, which is a different situation from rAF jitter and must
  // never be read as it. `perfFrame` counts these separately for that reason.
  const droppedBacklog = ticks > MAX_CATCHUP_TICKS;
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
  //
  // **`curr`, and not a parse of its own.** This runs before `wasm.step()`, so
  // the module's frame is byte-identical to the one the previous animation frame
  // already parsed -- there was a second full `parseFrame` here, for a function
  // that reads `state.hero` and nothing else. The null guard covers the first
  // frame and the frames straight after a `restart` or a hero swap, where the
  // only cost is one frame with no aim in it.
  //
  // Its own phase still, because it is the manual-control path and it should be
  // possible to see that it now costs nothing.
  perfOpen();
  if (controlMask && curr) pushInput(curr);
  perfClose("input");

  perfOpen();
  if (ticks > 0) wasm.step(ticks);
  perfClose("step");
  // Closed *before* the poison check, so the one path out of this function that
  // skips `perfFrame` still leaves no phase open behind it.
  if (dead) return;

  // Two states and a blend, and this is the whole of session 3.
  //
  // `curr` is the truth -- the frame the module has just published -- and `prev`
  // is where the truth was one **step** ago. What gets drawn is a point between
  // them, chosen by how far into the current tick the wall clock has got.
  //
  // **On a frame that ran no ticks, neither state moves.** That is the 120 Hz
  // case and it is the point of the whole exercise: `alpha` goes on climbing
  // towards 1 across those frames and the room glides through them, instead of
  // standing still for every other refresh.
  perfOpen();
  if (ticks > 0 || curr === null) {
    prev = curr;
    prevTick = currTick;
    prevLocked = currLocked;
    // Into the *other* pool, never the one `prev` now holds. This is the whole
    // reason the parse ping-pongs; see the parse pool block for the shape.
    curr = parseFrame(frameView(), nextPool());
  } else {
    // No tick ran, so the module's *world* is exactly the world `curr` already
    // describes -- but not necessarily the same *frame*. `set_goto`,
    // `set_focus`, `clear_order` and `route_clear` all `publish()`, and they run
    // between animation frames; under a pause that is the only way the
    // destination marker ever moves at all. So the frame is re-read, in place,
    // **into `curr`'s own pool slot** -- `nextPool()` here would hand back the
    // slot `prev` is sitting in and scribble the past over with the present.
    parseFrame(frameView(), curr);
  }
  // The tick, once a frame, and read unconditionally. It was already read once
  // here for `stillSince` and the dev strip; it is now also half of `alpha`.
  // Not cached inside the branch above, because `wasm.tick()` is **not
  // monotonic** -- `Sim::descend` builds a fresh `World` and it restarts at 0 --
  // and a cached copy would be the one number on the page that could be a floor
  // out of date.
  currTick = wasm.tick();
  currLocked = locked;
  // Nothing behind us: the first frame of the page, of a floor, or of a
  // replacement character. Blending a state with itself is the identity, so
  // seeding it here is what spares every reader below a null case.
  if (prev === null) cutInterpolation();

  // How far between `prev` and `curr` the wall clock has got.
  //
  // `span` is the gap in ticks -- 1 on an ordinary frame, more on one that
  // caught up. `displayTick` is one tick behind the sim plus whatever fraction
  // of a tick the accumulator is still carrying: **one tick behind and never
  // ahead**, because extrapolating would be the page predicting, and it costs
  // 16.7 ms against a decision period of 1 to 30 ticks.
  //
  //   ticks = 1   ->  alpha = accumulator / TICK_MS, the ordinary case
  //   ticks = 0   ->  the same two states, a larger accumulator: alpha climbs
  //   ticks = 2   ->  the back half of a two-tick span, 0.5 .. 1
  //   dropped     ->  the accumulator is zeroed and the span is 8, so 7/8
  //
  // The last of those is the one worth checking: it lands *forward* of where the
  // previous frame left off, so binning a backlog never rewinds the picture.
  const span = Math.max(currTick - prevTick, 1);
  const displayTick = currTick - 1 + accumulator / TICK_MS;
  let alpha = clamp((displayTick - prevTick) / span, 0, 1);
  // **Frozen.** While paused, `ticks` is forced to 0 *and* the accumulator is
  // drained every frame, so `alpha` would sit at 0 -- the room would jump back a
  // tick the instant Space went down and forward again on the resume. A frozen
  // world is showing `curr`, exactly, which is what `alpha = 1` means.
  if (paused) alpha = 1;
  perfClose("parse");

  // `level`: everything that re-bakes the floor plan. Read its **max** and not
  // its mean -- every branch below is an event (a descent, a tile crossing, a
  // zoom, a mode change) rather than a per-frame cost, so a mean divided by the
  // frames that did nothing says nothing.
  //
  // **Every read in this phase is `curr`.** These are questions about which room
  // the module is in, and a blended answer to one of those is not a softer
  // answer, it is a wrong one: half a floor is not a floor.
  perfOpen();
  if (curr.arenaX !== arena.x || curr.arenaY !== arena.y) {
    arena = { x: curr.arenaX, y: curr.arenaY };
    resize();
    snapCamera(curr);
    // A cut for the bodies as well as for the view; see `cutInterpolation`.
    cutInterpolation();
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
    forgetOrderKey();
    orderAcknowledged = false;
    stillSince = 0;
    snapCamera(curr);
    // And the same cut for the bodies. **This is why the blend happens in the
    // phase below rather than beside the parse**: `prev` describes the floor
    // that has just been left, and on a descent `wasm.tick()` restarts at 0, so
    // an `alpha` computed against it clamps to zero and the first frame of the
    // new floor would be the old one drawn whole. See `cutInterpolation`.
    cutInterpolation();
    if (curr.depth > 0) hint(`Level ${curr.depth + 1}. Something else is down here.`);
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
  perfClose("level");

  // `sync`: the blend, the rails, the event feed, the bodies, the order question
  // and the trail. One phase for all of it because it is one pass over the frame
  // that was just parsed, and splitting it further would be six numbers nobody
  // has a decision to make about.
  perfOpen();

  // **The picture, one tick behind the truth.** Everything from here down names
  // which of the two states it is reading and why; `docs/plans/perf-03-cadence.md`
  // carries the full assignment, and the short version is that `curr` answers
  // questions about the world and `view` answers questions about the screen.
  //
  // It happens here rather than up beside the parse because the `level` phase
  // above is where a descent is noticed, and `cutInterpolation` has to have run
  // before anything blends across two floors. The cost lands in this phase's
  // number as a result, which is the honest place for it -- it is per-frame work
  // that turns the frame into something drawable, exactly like the parse.
  view = blend(prev, curr, alpha, span, prevLocked === currLocked, BLEND_STATE);

  // The tick, once a frame. `stillSince` below and the dev strip's tick chip
  // both want it, and it used to be two boundary calls -- one here inside the
  // hero guard and one inside `updateHud`. It is now read once in the `parse`
  // phase, because `alpha` needs it too, and this is the same number: three
  // readouts that cannot be a frame apart rather than two.
  const tickNow = currTick;

  // Drop the legs the module has finished. It is the authority on how far along
  // the path the character is -- the page asking that question for itself would
  // be a second copy of an arrival rule that lives in `Sim::follow_route`.
  const legs = wasm.route_len();
  if (legs < routeDrawn.length) routeDrawn = routeDrawn.slice(routeDrawn.length - legs);

  // The Hero rail, read back out of the module rather than off the frame's
  // `kind` column: the attributes are a live dial now, so `BODIES[kind]` is the
  // body's *baseline* and stops being the character the moment a slider moves.
  // The loop reads `decisionPeriod` and `moveSpeed` off the same answer.
  //
  // **`curr`.** Every cell in that rail is a number printed to two decimals or
  // an integer read back out of the module, and the one frame column it does
  // take -- `hero.sight` -- feeds a readout, not a picture. A blended sight
  // radius would repaint the whole rail on the frames the fourth decimal moved.
  const stats = syncHeroRail(curr);

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
  //
  // **`curr`, and it could not be anything else.** The feed belongs to the ticks
  // that just ran; `blend` publishes no events at all, and says why. Its
  // `actorVisible` and `factionOfActor` lookups go through `curr.byIndex` for
  // the same reason -- they are asking who did a thing that already happened.
  if (ticks > 0) consumeEvents(curr);
  // After the events, never before: a body killed by a blow in that feed is
  // already out of the frame, and this is the call that forgets it.
  //
  // **`view`, and this one is a real decision.** `syncBodies` freezes a pose the
  // moment sight is lost, and what it must freeze is the pose that was actually
  // drawn -- otherwise the ghost is a body standing up to a tick away from where
  // the player last saw it, which is exactly the lie the frozen pose exists to
  // avoid. The identities it keys on (`unit.id`, `faction`, `kind`) are snapped
  // through the blend, so the map is keyed on the truth and only the pose is a
  // picture.
  syncBodies(view, now, aged);

  if (!curr.hero && !announcedFall) {
    announcedFall = true;
    hint("The character has fallen. Send in a new one and the fight goes on, or press R to start over.", true);
  }

  // A new order (any change to the header's order slot) restarts the "has it
  // acted on this yet" question. The answer is the first decision that happens
  // after the order landed -- which is exactly what the dim marker is showing.
  //
  // **A lock is keyed on the quarry and not on where it is standing.** Those two
  // header slots carry the quarry's *live* position under a focus, so a key built
  // from them changes on every frame the thing so much as breathes -- which reads
  // as a brand new order sixty times a second, resets the question before it can
  // ever be answered, and pins the ring at the dim dashed treatment and the
  // readout at "waiting for its next decision" for the whole life of the lock.
  // The identity of a focus is *who*, not where; `locked` is that, and it only
  // moves when the player names somebody else.
  //
  // Three numbers rather than a template string. This built a fresh string every
  // frame to detect a change that happens a handful of times a minute; the two
  // halves mean different things under a focus and under everything else, which
  // is the whole reason there is a key here at all. `-1` stands in for "no
  // quarry", which no packed handle can be.
  //
  // **`curr` throughout**, and note that `blend` asks a *different* question of
  // these same two slots and therefore reads `view`: this one is "is this a new
  // order", which is about the order's identity, and that one is "where do I
  // draw the ring", which is about a position that moves every tick. Keep this
  // one on the truth and that one on the picture.
  const focused = curr.orderKind === ORDER_FOCUS;
  const keyA = focused ? (locked === null ? -1 : locked) : curr.orderX;
  const keyB = focused ? 0 : curr.orderY;
  if (curr.orderKind !== orderKeyKind || keyA !== orderKeyA || keyB !== orderKeyB) {
    orderKeyKind = curr.orderKind;
    orderKeyA = keyA;
    orderKeyB = keyB;
    orderAcknowledged = false;
    orderIssuedAtDecision = curr.decisionTick;
  }
  if (!orderAcknowledged && curr.decisionTick !== orderIssuedAtDecision) {
    orderAcknowledged = true;
  }
  // The page's half of the lock, dropped the moment the order stops being one.
  // Beside the block above because it is the same question asked of the same
  // header slot, and one test is the whole of it -- see `locked` for why there
  // is no path that drops a focus without moving `orderKind`.
  if (curr.orderKind !== ORDER_FOCUS) locked = null;

  let distance = 0;
  let arrived = true;
  let settled = false;
  if (curr.hero) {
    // "Has it stopped?" is answered by watching the body, not by recomputing
    // the sim's rules over here. A click within one body radius of a wall is
    // not reachable, so the character legitimately parks short of the mark --
    // and a renderer that reimplemented that clamp in floating point would be
    // a second copy of a rule that lives in the policy.
    //
    // `tickNow` is read once in the `parse` phase now, not here.
    //
    // **`curr`, and this is the single most important read on the page to get
    // right.** The interpolated hero's position changes on *every* frame, even
    // the ones where the sim did not move it: `alpha` climbs, so `view.hero.x`
    // creeps towards `curr.hero.x` and only equals it at the instant the next
    // tick lands. Watching `view` here would mean `stillSince` was reset every
    // frame, `settled` would never once fire, and the destination marker would
    // never go solid -- for a character standing perfectly still. The exact
    // equality test is what makes this work at all, and only an unblended
    // coordinate can satisfy it.
    if (curr.hero.x !== stillAt.x || curr.hero.y !== stillAt.y) {
      stillAt = { x: curr.hero.x, y: curr.hero.y };
      stillSince = tickNow;
    }
    settled = tickNow - stillSince >= stats.decisionPeriod * 2;

    if (curr.orderKind === ORDER_GOTO) {
      // **`curr`.** This prints in the panel to two decimals, and a distance
      // measured off a blended hero strobes its last digit at the refresh rate
      // for a body the sim is holding still.
      distance = Math.hypot(curr.orderX - curr.hero.x, curr.orderY - curr.hero.y);
      // **A display threshold, and no longer a copy of anything.** This used to
      // say the policy holds inside a deadband of one tick of travel, and there
      // is no deadband any more -- the leash relaxes continuously, so the last
      // fraction of a unit is a crawl the character never formally finishes.
      // Something still has to decide when the panel stops saying "still going",
      // and a tick and a half of travel is that judgement, made here because it
      // is a question about the readout rather than about the walk. Nothing
      // downstream acts on it, which is what makes inventing it here safe.
      arrived = distance <= stats.moveSpeed * 1.5;
    } else if (curr.orderKind === ORDER_FOCUS) {
      // The gap to the quarry, which the header carries live under a lock -- the
      // same arithmetic on the same two slots. **And no `arrived` off it.** The
      // ring the character settles on is the weapon's, this page does not know
      // how wide it is, and a deadband invented here would be a second copy of a
      // rule that lives in the policy -- which is the mistake the block above
      // exists to avoid making about walls.
      distance = Math.hypot(curr.orderX - curr.hero.x, curr.orderY - curr.hero.y);
    }
    // **`curr`.** The trail is the path the sim walked, not a resampling of it
    // at the refresh rate: a trail fed the blend would gain a point on every
    // frame rather than on every step, would fill its 150-point budget three
    // times as fast on a 144 Hz panel as on a 60 Hz one, and would describe a
    // different walk on each. Reading the truth also makes it free on the frames
    // that stepped nothing, because the test below cannot fire on those.
    const last = trail[trail.length - 1];
    if (!last || Math.hypot(last.x - curr.hero.x, last.y - curr.hero.y) > 0.02) {
      trail.push({ x: curr.hero.x, y: curr.hero.y });
      if (trail.length > 150) trail.shift();
    }
  }
  perfClose("sync");

  // `insets` gets a phase of its own **because it is a forced synchronous
  // layout**: `railInsets()` reads `getBoundingClientRect()` four times, which
  // makes the browser flush whatever style and layout work is pending. Session 1
  // settled the question the phase was added to ask -- 0.018 ms against a clean
  // layout and **0.666 ms against a dirty one**, which is what the loop always
  // hands it, because `updateHud` wrote to the DOM on the previous frame. 4% of
  // a frame, so it is gated below and this number now reads near zero except
  // while a rail is sliding.
  perfOpen();

  // The rails, re-measured -- **on every frame of the 180 ms slide, and on no
  // other frame.** The per-frame measurement is the part that matters and it is
  // unchanged: a rail takes 180 ms to cross, measuring once when the class goes
  // on reads the strip the rail is about to leave, and measuring again on
  // `transitionend` snaps the safe rect a third of the window sideways in one
  // frame, which throws the character across the screen. `railInsets()` reports
  // the rect the rail is covering *at this instant*, so asking every frame is
  // what makes the view breathe with the slide instead of teleporting at either
  // end of it.
  //
  // What changed is only *which* frames ask. `railsMoving()` is up from the
  // moment `setRail` flips a class until the rail's own `transitionend`, or
  // until a 250 ms timer says so where no `transitionend` is coming -- under
  // `prefers-reduced-motion`, or on a slide interrupted by a second toggle. The
  // final resting position is measured by `railSettled` after the flag drops,
  // which is what keeps the answer exact rather than one animation frame short.
  // See `railsMoving` for why a stale flag is the dangerous direction.
  //
  // `resize` only re-runs when something actually moved: it re-derives `scale`,
  // whose zoomed-out limit is the safe rect's width, and `floorTileSize()`
  // buckets on `scale` -- running it every frame would re-bake the flagstones
  // for nothing. The `ResizeObserver` and `window.resize` are still wired and
  // still call `refreshInsets()` directly through `resize`, under no flag at
  // all: they catch the things the rails cannot -- a stage that genuinely
  // changed size, a `--rail-w` that re-clamped under a narrower window, and a
  // `devicePixelRatio` that changed under a window that did not.
  if (railsMoving() && refreshInsets()) resize();
  perfClose("insets");

  // `pick`: the hit test under the cursor, which is O(monsters) and therefore
  // the one number in this list that grows with a full room.
  perfOpen();

  // The cursor as the affordance. A body under the pointer means the next click
  // is a lock rather than a walk, and this is the whole of how a player finds
  // that out: there is no tutorial, no button and nothing in the panel that
  // would say so before the fact.
  //
  // **Once a frame, off `pointer`, and not in the `pointermove` handler.** That
  // handler fires several times a frame on a mouse and would have to parse a
  // frame of its own to have anything to hit test against -- and one into
  // `SCRATCH_STATE`, since it runs between animation frames. The loop has
  // already paid for exactly one parse and one blend, and this reads them.
  //
  // The resting cursor belongs to the stylesheet (`#arena { cursor: crosshair }`),
  // so the else arm clears the inline style rather than writing a second copy of
  // that value here, where it could drift. The hand is the change: crosshair
  // says *aim at the floor*, and a hand says *this is a thing you can take*.
  //
  // Two gates, both about not advertising a gesture that is not on offer. Under
  // manual aim a press is a cut and not an order, so there is nothing to promise;
  // and a drag past the threshold is unconditionally a route, so the test mirrors
  // `endDrag`'s exactly -- a press that has not moved yet is still a tap and
  // still gets the hand.
  //
  // Written only when it changes, on `setText`'s discipline and for the same
  // reason: this is sixty assignments a second into the CSSOM for a value that
  // moves a handful of times a minute.
  //
  // **`view`, and it must be.** This is the same hit test `endDrag` performs on
  // the click itself, so the two have to agree about where the bodies are or the
  // cursor promises a lock the click then misses. Both of them ask the picture:
  // hit-testing against `curr` while drawing `view` means a click aimed at a
  // running monster misses by up to a tick of travel, which at a run is most of
  // a body radius.
  const picking = pointer.inside && !(controlMask & CONTROL_LIMB) && (!drag || drag.far < DRAG_THRESHOLD);
  const want = picking && view.hero && unitAt(pointer, view) ? "pointer" : "";
  if (canvas.style.cursor !== want) canvas.style.cursor = want;
  perfClose("pick");

  // `render` covers `updateCamera` as well as the canvas itself: the ease and
  // the device-pixel snap are what decide where everything is drawn, so they
  // belong to the picture rather than to the remainder. Both are session 3's
  // territory and neither is separable from the other by eye.
  //
  // And read this one with the queueing caveat at the top of the perf block in
  // mind -- it is the time spent *issuing* canvas commands, not the time spent
  // rasterising them.
  //
  // **`view` for both.** For `render` that is the whole point of the session,
  // and `drawCallouts`' actor lookup and `drawLock`'s quarry lookup fall out of
  // it for free -- both go through the blended state's own `byIndex` and `units`.
  // For `updateCamera` it is just as load-bearing: `cameraTarget` anchors on the
  // hero, and anchoring on the stepped one would feed the exponential smoother a
  // 60 Hz staircase and reintroduce, as a low-pass, exactly the ripple the blend
  // above just removed.
  perfOpen();
  updateCamera(view, elapsed);
  render(view, now, arrived || settled);
  perfClose("render");

  // `hud` includes `drawGlobe` and the two `state_hash` walks that feed a chip
  // which is `display: none` most of the time -- item 1 of `perf-02-page-waste.md`
  // lives inside this number.
  //
  // **`curr`, all of it.** The panel is decimals: `simPosition` and `orderDest`
  // print two of them, the health readout rounds to whole points, the globe's
  // liquid is keyed on that rounded number, and the kit and action bars read
  // discrete columns. Every one of those would strobe its last digit at the
  // refresh rate off a blended row -- and the globe would redraw sixty times a
  // second instead of thirty, because its throttle is broken by a change in the
  // health it is drawing.
  perfOpen();
  updateHud(curr, stats, distance, arrived, settled, now, tickNow);
  perfClose("hud");

  if (hintUntil && now > hintUntil) {
    hintUntil = 0;
    hintEl.classList.remove("live");
    hintEl.textContent = DEFAULT_HINT;
  }

  // Last, so the window boundary sees a complete frame. `rawElapsed` rather than
  // `elapsed` -- see the capture above.
  perfFrame(now, rawElapsed, ticks, droppedBacklog);
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

  // The scratch state, because the loop has not run yet and its two are still
  // empty. Nothing below holds `first` past `snapCamera`.
  const first = parseFrame(frameView(), SCRATCH_STATE);
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
    // And re-measure the rails, because a hidden tab is the one place the
    // camera's slide flag can be spent on a slide that never happened: a rail
    // toggled just before the tab went away has its transition paused and its
    // 250 ms timer throttled to whole seconds, so the flag can be down before
    // the rail has moved an inch, and the transition then runs on the way back
    // with nothing watching it. Arming both rails buys 250 ms of measurement on
    // return, which is the cheapest way to be sure the safe rect describes the
    // window the player is now looking at.
    if (document.visibilityState === "visible") {
      railStartedMoving("enemy");
      railStartedMoving("hero");
    }
  });

  // The breakdown, openable from the URL as well as from `P`, so a profiling
  // run can start with the first frame instead of with whenever a hand got to
  // the keyboard.
  if (new URLSearchParams(location.search).get("perf") === "1") setPerfDetail(true);

  lastFrameTime = performance.now();
  // Seeded, and not left at zero: the first window would otherwise be measured
  // from the epoch of `performance.now()` and report an absurd frame rate for
  // the first half second of every load.
  perf.windowStart = lastFrameTime;
  rafId = requestAnimationFrame(loop);
}

boot();
