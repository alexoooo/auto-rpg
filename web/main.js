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
// slot0_action, slot1_action, sight_range, visible, vx, vy, stride,
// swing_span].
//
// That list was stale for a layout: it still named the two shield columns a
// character carried before it had one limb, so it counted thirty names against a
// stride of twenty-eight. `readUnit` below is the authority either way -- it is
// what indexes the row -- but a comment that miscounts the row is worse than no
// comment, because it is the thing somebody reaches for first.
const HEADER_LEN = 15;
const UNIT_STRIDE = 33;

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
 *  [kind, x, y, amount, actor_index, other_index, aux0, aux1].
 *
 *  Things that *happened*, as opposed to things that are. Every other row in the
 *  frame describes state that will still be there next frame; an event is gone
 *  the moment it is read, and what the page does with it -- a floating number, a
 *  callout bubble -- it then ages on its own wall clock, like `trail` and
 *  `corpses`.
 *
 *  `amount`, `aux0` and `aux1` all read differently under each `kind`. The
 *  table is in `EVENT_STRIDE`'s doc comment in crates/web/src/lib.rs and there
 *  is deliberately no second copy of it here: a table repeated in two files is a
 *  table that disagrees with itself. */
const EVENT_STRIDE = 8;

/** Most event rows a frame can carry, mirroring `web::MAX_EVENTS`. Sizes the
 *  event pool, on the same terms as the two above.
 *
 *  **The one mirrored constant with no export behind it**, which `lib.rs` calls
 *  deliberate: the module answers "were rows dropped" in `frame[14]` instead, so
 *  the page never has to know the cap to know it was hit. The price is that
 *  neither the boot handshake nor `wasm_check` can catch this number drifting
 *  from the module's, so **nothing here may state it as the module's cap** --
 *  it sizes a pool and no more. See `warnIfEventsWereDropped`. */
const MAX_EVENTS = 128;

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

/** Event `kind` codes, from crates/web/src/lib.rs, where the table of what each
 *  one's `amount`, `aux0` and `aux1` mean also lives.
 *
 *  **Append-only, and a page skips a kind it has never heard of rather than
 *  guessing at it** -- which is what lets an older page run against a newer
 *  module and draw nothing wrong. `consumeEvents` already behaves that way: it
 *  tests for the kinds it knows and falls through the rest. Seven of these
 *  eleven are consumed by nothing today; `art-09` takes the shove and the
 *  death, `art-10` and `art-11` take the rest. */
const EVENT_DAMAGE = 0;
const EVENT_BLOCK = 1;
const EVENT_PARRY = 2;
const EVENT_DECLARE = 3;
const EVENT_DEATH = 4;
const EVENT_LOOSE = 5;
const EVENT_PHASE = 6;
const EVENT_STEP = 7;
const EVENT_SHOVE = 8;
const EVENT_PORTAL = 9;
const EVENT_DESCEND = 10;

/** Frame layout this file is written against. Checked at boot against
 *  `frame_layout_version()`, and a mismatch stops the page rather than letting
 *  it paint a health bar out of a guard arc. */
const FRAME_LAYOUT_VERSION = 7;

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

/**
 * Health, printed: one decimal below ten and whole numbers above it.
 *
 * The same rule `drawFloaters` applies to damage, and for the same reason. A
 * Fighter has 12 hit points and a Skitterer 6, so a whole-number readout cannot
 * show a graze at all -- and a bar the player watches step 12, 11, 11, 10 while
 * three different blows land is worse than no number. Above ten the decimal
 * stops earning its width, which is why the rule has a knee in it rather than
 * being `toFixed(1)` everywhere.
 *
 * **Two places**, the vitals line and the life globe, on `LOW_HEALTH`'s
 * reasoning immediately above: this was about to be written out twice.
 */
const hp1 = (v) => (v >= 10 ? String(Math.round(v)) : (Math.round(v * 10) / 10).toFixed(1));

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
  // What stands on the floor plan and cannot be read out of it -- a doorway
  // today -- on a fourth buffer read on the same terms: when
  // `furniture_revision()` moves. `furniture_len()` counts *records*, not bytes;
  // `furniture_stride()` is how wide one is. See `readFurniture`.
  "furniture_ptr",
  "furniture_len",
  "furniture_stride",
  "furniture_revision",
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

/** Furniture kinds, from `FURNITURE_STRIDE`'s table in `crates/web/src/lib.rs`.
 *  Append-only: a new kind takes the next free value and never reuses one, so a
 *  page built against an older module cannot read a new meaning out of an old
 *  number. */
const FURNITURE_DOOR = 1;
const FURNITURE_TORCH = 2;

/** A torch's state byte: which face of its wall tile it hangs on.
 *
 *  **Only these two exist, and that is a fact about the camera.** The projection
 *  looks down the `+x`/`+y` diagonal, so a block shows exactly those two faces
 *  and hides the other two behind itself in every frame -- see `wallBlock`, whose
 *  `xFace`/`yFace` arguments are the same two directions and no others. A torch
 *  on a `-x` face would be a light with no lamp, so the module never emits one.
 *
 *  They are **not** `sim::Cardinal`'s own ordering, which is `NegX, PosX, NegY,
 *  PosY` in percept order and would give 1 and 3. The module writes an explicit
 *  mapping for exactly that reason; these are the numbers it writes. */
const TORCH_POS_X = 0;
const TORCH_POS_Y = 1;

/** The furniture the page last read, declared beside `levelMap` and `levelVis`
 *  and held on exactly the same terms. */
let levelFurniture = null;

/**
 * What stands on the floor plan and cannot be read out of it.
 *
 * One record per **tile**, `wasm.furniture_stride()` bytes wide:
 *
 *     [kind, tx, ty, state]
 *
 * `kind` is one of the `FURNITURE_*` codes above and is never 0. `state` is read
 * according to the kind; for a door it is `1` open and `0` shut. `furniture_len()`
 * counts records rather than bytes, which is why the view below is `count * stride`
 * long.
 *
 * **Why a list at all, when a door is a tile like any other.** It is not: a
 * *shut* door is solid, so `write_map` publishes it as `1` and the page cannot
 * tell it from rock; an *open* one is `OPEN` and the page cannot tell it from the
 * floor it was cut into. The tile buffer is a two-valued answer to a three-valued
 * question, deliberately -- rock is rock to everything that reads it -- and this
 * is where the third value lives.
 *
 * Copied out, like the map and the fog, because a view into linear memory is a
 * view that can detach; `readMap` has the whole argument. The three module calls
 * happen *before* the view is derived rather than after, so nothing calls into
 * wasm between the view and the copy -- the rule `readVis` states.
 *
 * The `doors` map is the bake's index into the same bytes: cell -> state, keyed
 * exactly as `levelMap.tiles` is, so `rebuildLevelPaths` can ask "is this tile a
 * doorway" once per solid tile instead of walking the record list. Built here
 * rather than in the bake because it changes when the *records* change and the
 * bake re-runs on a zoom, a mode switch and every tile the character crosses.
 *
 * `torches` is a flat array and not a map, because nothing ever asks "is there a
 * torch on this tile" -- the bake walks the torches themselves, fifty records
 * against three thousand tiles. A `Map` and an array is the difference between
 * the two questions the two kinds are actually asked.
 */
function readFurniture(cols) {
  const revision = wasm.furniture_revision();
  const count = wasm.furniture_len();
  const stride = wasm.furniture_stride();
  const live = new Uint8Array(memory.buffer, wasm.furniture_ptr(), count * stride);
  const bytes = new Uint8Array(live);
  const doors = new Map();
  const torches = [];
  for (let i = 0; i < count; i++) {
    const at = i * stride;
    if (bytes[at] === FURNITURE_DOOR) {
      doors.set(bytes[at + 2] * cols + bytes[at + 1], bytes[at + 3]);
    } else if (bytes[at] === FURNITURE_TORCH) {
      torches.push({ tx: bytes[at + 1], ty: bytes[at + 2], face: bytes[at + 3] });
    }
    // A kind this page has never heard of is skipped rather than guessed at,
    // which is the whole point of the codes being append-only: an older page
    // against a newer module draws what it knows and nothing wrong.
  }
  levelFurniture = { revision, count, stride, bytes, doors, torches };
  return levelFurniture;
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
// the blended picture and writes `blendUnit(a, b, t, span, out)` against the row
// shape `readUnit` fills.
//
// **The scratch state is not a nicety either.** Eight call sites parse outside
// the loop -- a pointer press, the release that ends a drag, Escape, a stand-down
// button, a hero swap, a restart, a view-mode change, boot -- and they run
// *between* animation frames. Any of them writing into a ping-pong slot would
// scribble over a state the loop is still holding, and the symptom would be a body
// drawn where it was two frames ago. They get their own state, which nothing keeps.
//
// The view-mode change is `iso-01`'s, and it is the newest reason this block
// exists rather than an exception to it: `setViewMode` swaps the projection and
// then has to snap the camera under the new matrix, which needs a state to read
// the hero out of, and `G` is a keypress like any other -- it arrives between
// frames, with `prev` and `curr` both live.

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
    vx: 0,
    vy: 0,
    stride: 0,
    swingSpan: 0,
  };
}

/** One arrow row, on the same terms as `newUnitRow`. */
function newShotRow() {
  return { x: 0, y: 0, heading: 0, faction: 0 };
}

/** One event row, on the same terms as `newUnitRow`. */
function newEventRow() {
  return { kind: 0, x: 0, y: 0, amount: 0, actor: 0, other: 0, aux0: 0, aux1: 0 };
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
    eventsDropped: 0,
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
  // Velocity, world units per tick, signed and small -- a Fighter's top speed
  // is about 0.048. Plain floats, not binary angles: no conversion here.
  //
  // In the frame rather than differenced across frames because a frame is up to
  // `MAX_CATCHUP_TICKS` ticks and often none, so a page-side difference would be
  // measuring rAF's jitter as much as the body's feet.
  out.vx = f[u + 29];
  out.vy = f[u + 30];
  // The walk cycle's phase, `0 <= stride < 1`, integrated by the module over
  // this body's own speed. **It wraps**, which is why `blendUnit` runs it
  // through `lerpWrap01` rather than `mix` -- and only across a single tick,
  // because a wrap two samples apart cannot be told which way it went.
  out.stride = f[u + 31];
  // How many ticks the current swing phase started with, so `swingLeft /
  // swingSpan` is an honest fraction. Zero at guard, where `swingLeft` means
  // nothing.
  out.swingSpan = f[u + 32];
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
  // How many event rows the module's own cap ate this frame. Zero in every
  // situation anybody has measured; `warnIfEventsWereDropped` is what says so
  // out loud if it ever is not, because a bound nobody can observe is a bound
  // nobody maintains.
  out.eventsDropped = f[14];
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
    // One of the eleven EVENT_* codes above, and `amount`, `aux0` and `aux1`
    // all mean something different under each. See `EVENT_STRIDE`.
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
    // The second party, or 255 for none: the attacker behind a blow, the killer
    // behind a death, the shover behind a shove. A hint for grouping on exactly
    // the terms `actor` is, and no more an identity.
    event.other = f[at + 5];
    event.aux0 = f[at + 6];
    event.aux1 = f[at + 7];
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
 * `lerpAngle` with a period of 1 instead of `TAU`.
 *
 * For `stride`, which is the walk cycle's phase and wraps 1 -> 0 every footfall.
 * A straight `mix` across that wrap runs the legs backwards through a whole
 * cycle inside one frame -- the same failure `lerpAngle` exists for, on a body
 * turning through north, and it fires here about once a fifth of a second per
 * walking body rather than occasionally.
 *
 * **It has `lerpAngle`'s blind spot, and the caller closes it rather than this
 * function.** Half a period one way is indistinguishable from half a period the
 * other, and two samples cannot recover a winding number -- so no better lerp
 * fixes it. What matters is the bound on the advance **between the two samples
 * being blended**, which is `span` ticks and not one: `blend` takes `span` from
 * `max(currTick - prevTick, 1)` and `loop` caps a frame at `MAX_CATCHUP_TICKS`,
 * so `span` reaches 8 every time a frame bins its backlog -- the ordinary path
 * whenever the tab regains focus. The fastest body in the game advances 0.153 of
 * a stride per tick (a Skitterer: radius 0.30, `move_speed` 0.0597,
 * `STRIDE_PER_RADIUS` 1.3), so one tick is comfortably under the half-period
 * bound, four ticks is 0.61 of a period and interpolates *backwards*, and eight
 * is 1.22 and wrong in direction and magnitude both. An earlier version of this
 * comment argued the bound from the module's own clamp, which is a clamp per
 * *tick* against a lerp per *frame* and therefore the wrong quantity entirely.
 *
 * So `blendUnit` calls this only at `span === 1` and snaps to `curr` otherwise.
 * The cost of snapping is one small jump in the walk phase, on a catch-up frame
 * where every position in the room jumps anyway; the cost of not snapping is
 * legs that run backwards for several frames afterwards, because the reversal is
 * then drawn across every following `ticks === 0` frame at a climbing alpha.
 * `snapRow` is the precedent: a column that cannot be honestly interpolated is
 * taken from `curr` outright.
 *
 * **The result is renormalised into `[0, 1)`**, which `a + d * t` on its own does
 * not give: 0.95 and 0.05 half way is 1.0 exactly. That is harmless under
 * `sin(stride * TAU)` and wrong under `Math.floor(stride * frameCount)`, which is
 * how a sprite sheet gets indexed -- and `readUnit`, `UNIT_STRIDE`'s doc,
 * `Trace::stride` and `tools/wasm_check.js` all promise `0 <= stride < 1`.
 *
 * **`Math.floor` alone does not close it**, which a fuzz over the unit square
 * found rather than an argument: `lerpWrap01(0.05, 0.95, 0.5)` lands a few parts
 * in 10^17 *below* zero, floors to -1, and `v - -1` rounds to exactly 1 in
 * float64 -- the one value being excluded, reintroduced by the exclusion. The
 * `w < 1` test is the fix, and 0 is the honest answer for it: the true result is
 * a whole period, and a whole period is none.
 *
 * `lerpWrap01(v, v, t)` is still exactly `v`, which `blendUnit`'s "an exact copy"
 * claim rests on: `d` is 0, so the subtraction is `v - Math.floor(v)` on a value
 * already in range, and the test below passes it through.
 */
function lerpWrap01(a, b, t) {
  let d = (b - a) % 1;
  if (d > 0.5) d -= 1;
  else if (d < -0.5) d += 1;
  const v = a + d * t;
  const w = v - Math.floor(v);
  return w < 1 ? w : 0;
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
 *   * **lerped** -- everything continuous: position, size, health, velocity, the
 *     limb's extension and spin, how much of the swing is left, the sight
 *     radius, and the three already-decayed flash markers;
 *   * **lerped the short way** -- `facing`, `limbAngle` and `limbLine`, the
 *     three live bearings, through `lerpAngle`;
 *   * **lerped the short way round 1, and only across a single tick** --
 *     `stride`, through `lerpWrap01`. Same idea with a period of one instead of
 *     a full turn, because the walk cycle's phase wraps every footfall. At
 *     `span > 1` it is snapped instead: two samples further apart than that
 *     cannot say which way round the cycle went. See `lerpWrap01`;
 *   * **snapped** -- every identity and every discriminant, plus `actionLength`,
 *     `actionArc` and `swingSpan`. Those three look like geometry and numbers
 *     and are neither: they are **static properties of the action or the phase**,
 *     and halfway between two weapons' arcs is no weapon.
 *
 * **`blendUnit(row, row, t, span, out)` is an exact copy** -- `mix(v, v, t)` is
 * `v + 0 * t`, `lerpAngle(v, v, t)` is the same, and `lerpWrap01(v, v, t)` is
 * too at either `span` -- which is what the snap paths in `blend` use, rather
 * than a second copy routine that could drift out of step with this one field
 * by field.
 */
function blendUnit(a, b, t, span, out) {
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
  out.vx = mix(a.vx, b.vx, t);
  out.vy = mix(a.vy, b.vy, t);
  // Blended across one tick and snapped across more than one. The gate is
  // `lerpWrap01`'s whole correctness argument and it lives here because `span`
  // does; `b` is `curr`, so this is the same "take the truth" answer `snapRow`
  // gives for a column that has stopped being two samples of one continuous
  // thing.
  out.stride = span === 1 ? lerpWrap01(a.stride, b.stride, t) : b.stride;
  // Snapped, with `actionLength` and `actionArc`: it is a *phase's length* and
  // there is no halfway between an axe's 33 ticks and a punch's 5. It would in
  // practice never come out wrong lerped -- `snapRow` already returns true
  // whenever `swing` changes, and this is constant within a phase -- so this is
  // the honest classification rather than a fix for a live bug.
  out.swingSpan = b.swingSpan;
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
 * below for what each is for, and `lerpWrap01` for the third reader of `span` --
 * the walk cycle, which is only interpolable at all across a single tick.
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
  // Carried across for completeness, so a blended state is a state and not
  // most of one. Nothing reads it from here -- `warnIfEventsWereDropped` asks
  // `curr`, beside `consumeEvents`, because it is a fact about the ticks that
  // just ran rather than about the picture being drawn.
  out.eventsDropped = b.eventsDropped;

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
    const row = blendUnit(source, to, t, span, out.unitPool[i]);
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
  // `SHOT_STRIDE` 4 -> 5 and another `FRAME_LAYOUT_VERSION` bump across five
  // files in a repo where four golden suites hang off the frame;
  // `perf-03-cadence.md` rules that its own session and not this one. (The
  // version numbers this used to name -- 6 -> 7 -- are `art-03`'s, which spent
  // that bump on a header float and four unit columns. The cost of the shot
  // slot is unchanged; only the number it would land on is.) Arrows are the
  // fastest thing on screen and therefore the most judder-visible, so leaving
  // them raw was not an option either.
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
 *  breakdown is readable from `[world]` and the tick/at/hash are unaffected. */
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
 * `radial-gradient(1200px 700px at 50% 42%, #1d1811 0%, transparent 70%)` over
 * `--bg`, so what shows through the canvas is a soft ambient wash across the
 * middle of the window -- `rgb(29,24,17)` at its centre against `rgb(11,10,8)`
 * at the corners. (`art-01` retoned both; they were `#141a26` over `#090b10`. That
 * moved the wash's hue and not its span -- about 14.5 levels of luminance against
 * the old 14.7 -- so the argument is exactly the one it always was, and the quote
 * is refreshed because a comment whose entire job is to stop a re-attempt is the
 * worst place in the file for a stale number.) An opaque canvas cannot show it, and
 * a flat fill of `--bg` flattens the room's whole ambient light. It also silently
 * changes the fog:
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
// The backend's one and only context. The element is the page's -- `main.js`
// owns the DOM -- and what is done *to* it is `draw.js`'s; see the rule at the
// top of that file.
dlBind(ctx);
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

/** How world coordinates become screen coordinates.
 *
 *  Six coefficients rather than a branch, because the alternative is `if (iso)`
 *  at forty call sites. The forward map is
 *
 *      sx = (ax*wx + bx*wy) * scale
 *      sy = (ay*wx + by*wy) * scale
 *
 *  and the inverse is its 2x2 inverse with the `scale` divided back out.
 *
 *  **`proj` is its own column in `VIEW_MODES` and `artOn()` never stands in for
 *  it.** Art is on in exactly one mode today and that is the mode going
 *  isometric, so the two bits are indistinguishable right now and will stop
 *  being the day a fourth mode exists. */
const PROJ_TOPDOWN = {
  id: "topdown",
  ax: 1, bx: 0,
  ay: 0, by: 1,
  ix: 1, jx: 0,
  iy: 0, jy: 1,
  ex: 1, ey: 1,        // a world circle of radius r -> ellipse (r*scale*ex, r*scale*ey)
  shear: false,        // `groundSpace` is a bare translate
  upright: false,      // bodies lie flat
};

/** Classic 2:1 isometric. `K = scale`, so `det = scale^2` -- the visible floor
 *  area and therefore `VIEW_UNITS_Y`'s meaning are preserved exactly, the vision
 *  disc's fill cost does not move, and a world unit of height is `px(1)`.
 *
 *  Inverse: A = scale*[[1,-1],[0.5,0.5]], det A = scale^2,
 *           A^-1 = (1/scale)*[[0.5, 1],[-0.5, 1]].
 *  Round trip: (1,0) -> (scale, scale/2) -> (1, 0); (0,1) -> (-scale, scale/2) -> (0, 1). */
const PROJ_ISO = {
  id: "iso",
  ax: 1,   bx: -1,
  ay: 0.5, by: 0.5,
  ix: 0.5,  jx: 1,
  iy: -0.5, jy: 1,
  ex: Math.SQRT2,      // 1.4142135623730951
  ey: Math.SQRT1_2,    // 0.7071067811865476, exactly ex/2
  shear: true,
  upright: true,
};

/** Which one is live.
 *
 *  Written by `setViewMode`, and once by `boot` -- which seeds it from the
 *  default row without calling the setter, for reasons argued at both ends.
 *  `assertProjection` assigns it too, but it saves and restores around the sweep,
 *  so the value is the same on both sides of that call. Nothing else touches it.
 *
 *  **The initialiser here is a fallback and not the default view's projection.**
 *  `VIEW_MODES` and `PROJECTIONS` are declared a thousand lines further down, so
 *  there is nothing to read at this point in the file and a `let` that has to hold
 *  something holds the one that cannot be wrong on its own terms. `boot` is the
 *  first place where both halves are in scope, and it is where they are made to
 *  agree. */
let PROJ = PROJ_TOPDOWN;

/** How tall a wall block stands, in world units.
 *
 *  A block is a cube whose vertical edge is `lift(WALL_H)`. Because the ground
 *  diamond's half-width is `px(1)` and `lift === px`, `WALL_H = 1.0` would be a
 *  literal cube.
 *
 *  1.6 is chest-high on a Fighter: tall enough that the depth interleave in
 *  `iso-04` is legible at a glance, short enough that a fight happening behind a
 *  wall is not simply gone. Tune by eye -- it is presentation only and the sim
 *  has no opinion about it. */
const WALL_H = 1.6;

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

/**
 * The arena's screen extent in multiples of `scale`.
 *
 *   topdown: { w: A,     h: B }
 *   iso:     { w: A + B, h: (A + B) / 2 + WALL_H }
 *
 * Iso is wider and shorter for the reason a diamond is: the room's two world
 * axes both run east, so the width is their sum, and both run south at half
 * rate, so the height is half their sum. `WALL_H` is added because the rock on
 * the northern boundary stands *above* world `y = 0` and a `fit` that ignored it
 * would crop the top row of blocks off the zoomed-out view.
 *
 * A fresh object per call and not a hoisted one, unlike `ARENA_BOX`: this runs
 * from `resize`, which is a rail transition and a window drag, not a frame.
 */
function arenaSpan() {
  const A = arena.x;
  const B = arena.y;
  return PROJ.shear ? { w: A + B, h: (A + B) / 2 + WALL_H } : { w: A, h: B };
}

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
  // `base` is the framing chosen above, and only `fit` is projection-dependent.
  //
  // `fit` is always below `base`, and the argument generalises rather than being
  // re-run per projection: `fit <= safe.h / span.h` and `base = safe.h /
  // VIEW_UNITS_Y`, so the bounds cannot cross whenever `span.h > VIEW_UNITS_Y`
  // -- whatever the window is and whatever the rails are doing. Top-down needs
  // `B > 11`, which for a 68x45 room is 45 > 11; iso needs `(A + B)/2 + WALL_H >
  // 11`, which is 58.1 > 11. The invariant is about the room being bigger than
  // the framing, and a room small enough to break it would be a room that fits
  // on screen at the chosen zoom, which is not a room this game has.
  const safe = safeRect();
  const span = arenaSpan();
  const fit = Math.min(safe.w / span.w, safe.h / span.h);
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
 * The screen-space bounding box of the arena's *ground*, pre-pan, in CSS pixels.
 * Filled into the caller's object, so the one caller that runs per frame can hand
 * it a hoisted one and the one that runs per level rebuild can hand it a fresh one.
 *
 * Under iso the room is a rhombus and the box is its four corners: world `(A, 0)`
 * is the east corner and world `(0, B)` the west, so the screen span is
 * `[-B, A] * scale`; world `(A, B)` is the south corner at `(A + B)/2 * scale`;
 * and world `(0, 0)` is the north corner, at screen `y = 0` exactly.
 *
 * **There are two boxes on this page and they differ in exactly one term.** This
 * is the ground box -- the floor and nothing else -- and it is what `levelPaths`
 * bakes, what `drawLevel` clamps its fills against and what the vignette is
 * centred on. `arenaBox` below is the camera box: the same rectangle with `y0`
 * pushed up by `lift(WALL_H)`, because rock standing on the northern boundary
 * reaches above world `y = 0` and the camera has to be allowed to look at it.
 * Deriving one from the other is deliberate -- written out twice they would drift,
 * and the drift would show up as a vignette that is off-centre by half a wall.
 */
function groundBox(out) {
  const A = arena.x;
  const B = arena.y;
  if (PROJ.shear) {
    out.x0 = -B * scale; // the west corner,  world (0, B)
    out.x1 = A * scale; // the east corner,  world (A, 0)
    out.y0 = 0; // the north corner, world (0, 0)
    out.y1 = ((A + B) * scale) / 2; // the south corner, world (A, B)
  } else {
    out.x0 = 0;
    out.y0 = 0;
    out.x1 = A * scale;
    out.y1 = B * scale;
  }
  return out;
}

/**
 * The arena's screen-space bounding box for the *camera*, pre-pan, in CSS pixels.
 *
 * Hoisted and mutated rather than returned fresh: `cameraTarget` runs every
 * frame and this file allocates nothing per frame.
 *
 * The ground box, less the wall height off the top -- and only under iso, where
 * height means anything at all. Top-down walls are flat tiles inside the arena
 * rect, so subtracting `lift(WALL_H)` there would let the camera drift a wall's
 * worth of void past the north edge for no rock to fill it with.
 */
const ARENA_BOX = { x0: 0, y0: 0, x1: 0, y1: 0 };

function arenaBox() {
  const box = groundBox(ARENA_BOX);
  if (PROJ.shear) box.y0 -= lift(WALL_H);
  return box;
}

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
 *
 * **The clamp is stated in screen space, and that is the change.** Under iso the
 * visible world region is a rhombus, so "how far east may the camera be" has no
 * answer in world `x` alone -- the wall you would run into depends on `y`. There
 * is no correct per-axis world clamp to write. What there is, in either
 * projection, is the arena's screen bounding box and a rectangle of glass: so
 * project the anchor, clamp the pixel, and un-project the result back into the
 * world units `cam` is stated in. `updateCamera` eases towards it exactly as
 * before and neither it nor `snapCamera` needs to know any of this happened.
 *
 * The two branches collapse into one expression each on the way, and the shape
 * is "clamp if the interval exists, centre if it does not" -- which is precisely
 * what the two `halfW * 2 >= arena.x + ...` tests were saying, said once.
 *
 * **It degenerates to the old code exactly**, which is worth writing down
 * because it is the whole licence for the rewrite. Top-down gives
 * `box = {0, 0, A*scale, B*scale}`, so the x interval is
 * `[hw - over, A*scale - hw + over]`; divide through by `scale` and it is
 * `[halfW - OVERSCAN, A - halfW + OVERSCAN]`, the old clamp character for
 * character. The non-empty test `loX <= hiX` rearranges to
 * `2*halfW <= A + 2*OVERSCAN`, the negation of the old centre test; and on the
 * one input where the two disagree about which branch to take -- exact equality
 * -- the interval has collapsed to the single point `A/2`, which is what the
 * centre branch returns anyway. Same number, both ways.
 */
function cameraTarget(state) {
  const anchor = state.hero || cam;
  const safe = safeRect();
  const box = arenaBox();
  const over = CAMERA_OVERSCAN * scale; // world units of permitted void, as pixels
  const hw = safe.w / 2;
  const hh = safe.h / 2;

  const loX = box.x0 + hw - over;
  const hiX = box.x1 - hw + over;
  const loY = box.y0 + hh - over;
  const hiY = box.y1 - hh + over;
  const sx = loX <= hiX ? clamp(projX(anchor.x, anchor.y), loX, hiX) : (box.x0 + box.x1) / 2;
  const sy = loY <= hiY ? clamp(projY(anchor.x, anchor.y), loY, hiY) : (box.y0 + box.y1) / 2;
  return { x: unprojX(sx, sy), y: unprojY(sx, sy) };
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
 *
 * **The projection goes inside the rounding and the snap survives it untouched.**
 * `projX`/`projY` turn `cam` into the pixel the camera sits on; everything after
 * that is a screen-space translation, and a screen-space translation has nothing
 * to say about which way the world axes run. So the grid stays on its half-pixel
 * boundaries and the flagstones stay still under an easing camera in either
 * projection, and `pointerToWorld` still inverts the number that was actually
 * used.
 */
function viewOrigin() {
  const safe = safeRect();
  // Quarter *device* pixels: `dpr` converts CSS to device and the 4 is the
  // subdivision, so this stays a whole number of device subpixels on a display
  // of any density.
  const q = dpr * 4;
  return {
    x: Math.round((safe.x + safe.w / 2 - projX(cam.x, cam.y)) * q) / q,
    y: Math.round((safe.y + safe.h / 2 - projY(cam.x, cam.y)) * q) / q,
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
 * That claim now covers the linear half as well. The translation still comes out
 * of `viewOrigin()`, and the 2x2 is `unprojX`/`unprojY` reading the same six
 * coefficients `projX`/`projY` read, so there is still exactly one matrix on the
 * page and the inverse cannot drift from the forward map without somebody
 * editing a row of `PROJ_TOPDOWN` on purpose. `assertProjection` at boot is what
 * catches that row being wrong.
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
  const sx = event.clientX - rect.left - origin.x;
  const sy = event.clientY - rect.top - origin.y;
  return { x: unprojX(sx, sy), y: unprojY(sx, sy) };
}

/** How much slop a click gets around a body, in world units. A body is a small
 *  target at this zoom and a lock is a friendly gesture, so missing by a hair
 *  should still hit. Small enough that two adjacent bodies do not swell into one
 *  ambiguous blob -- and where they do overlap, `unitAt` breaks the tie on a
 *  stated rule rather than on whichever row the frame happened to list first.
 *  Which rule depends on what the overlap *means*, and that differs by
 *  projection: see `unitAt`. */
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
 * **Never first hit -- and the tie-break differs by arm, because the two pictures
 * disagree about what an overlap is.** Flat, bodies are discs lying on the floor
 * and two that overlap are standing *beside* each other, so the nearer centre is
 * the one the click meant and `nearest` is the whole rule. Upright, two
 * overlapping billboards are not beside each other at all: one is *in front of*
 * the other, and the front one is what the player clicked whether or not its
 * centre is nearer -- a Skitterer at the feet of a Brute has the nearer centre
 * from most angles and is the one you cannot see. So that arm sorts on depth,
 * `x + y`, which is the same key the painter walks; the topmost thing drawn is
 * the thing picked, which is what "the picture and the pick agree" means.
 *
 * `state.monsters` is already every non-hero row, so there is no faction test
 * here and no way for this to hand back the character doing the clicking.
 *
 * **Two tests, because there are two pictures.** Top-down a body is a disc on
 * the floor and a click is inside it or it is not, which is the arm that has
 * always been here and is untouched. Under iso the painted body is a *billboard
 * standing above* its ground point, so a click on a monster's chest unprojects
 * to a world point roughly `bodyHeight` behind it and the circle test misses
 * every time. The upright arm tests the box the billboard actually occupies:
 * `px(r) * PROJ.ex` either side -- the same half-width `drawCharacter` scales by
 * and the semi-major axis of the body's ground ellipse -- from the top of its
 * head, `lift(bodyHeight(unit))` up, down past the feet by the ground ellipse's
 * *lower* half, so that the body and the ground it is standing on are both
 * clickable. `PICK_SLOP` is added on all four sides, in pixels, which is the
 * same world slop the flat arm adds to a radius.
 */
function unitAt(point, state) {
  // Re-projected here rather than carried on the point: `endDrag` fires frames
  // after the move that produced it and the camera pans in between. A world point
  // re-projected through the *current* origin is where the cursor is now; a
  // screen point stored at sample time is where it was. (`projX`/`projY` are
  // origin-free -- the camera is a `ctx.translate` and cancels out of both sides
  // of every comparison below -- so this is the whole of the conversion.)
  const sx = projX(point.x, point.y);
  const sy = projY(point.x, point.y);
  let best = null;
  let nearest = Infinity;
  let bestDepth = -Infinity;
  for (const unit of state.monsters) {
    if (!canSee(unit)) continue;
    if (!PROJ.upright) {
      const d = Math.hypot(unit.x - point.x, unit.y - point.y);
      if (d > unit.radius + PICK_SLOP || d >= nearest) continue;
      nearest = d;
      best = unit;
      continue;
    }
    const bx = projX(unit.x, unit.y);
    const by = projY(unit.x, unit.y);
    const halfW = px(unit.radius) * PROJ.ex + px(PICK_SLOP);
    const top = by - lift(bodyHeight(unit)) - px(PICK_SLOP);
    const bot = by + px(unit.radius) * PROJ.ey + px(PICK_SLOP);
    if (sx < bx - halfW || sx > bx + halfW || sy < top || sy > bot) continue;
    // Depth, not distance, and `nearest` is deliberately not consulted on this
    // arm -- see the tie-break paragraph above for why the two arms differ.
    const depth = unit.x + unit.y;
    if (depth <= bestDepth) continue;
    bestDepth = depth;
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
 * The views, as one table: the label, the three booleans every draw call actually
 * reads, which projection the room is drawn in, whether the tick strip is open,
 * and the sentence pressing it prints.
 *
 * Reduced to three booleans and a matrix the moment it is read. **Keeping the mode
 * itself out of the draw calls is what stops this becoming three renderers** --
 * every drawing function asks "is the art on" or "is the fog on" or reads `PROJ`,
 * never "which mode is this", so a fourth mode later is a row in this table and
 * nothing else.
 *
 * `proj` is a column of its own and **`art` is not allowed to stand in for it**,
 * even though the two agree in every row today: art is on in exactly one mode and
 * that is the mode going isometric, so the bits are indistinguishable right now
 * and would stop being the day somebody wants a fourth. The seam was built with
 * every row still saying `"topdown"`, so that a sign error in the matrix was
 * caught with nothing on screen to hide it; `world` is the row that then turned.
 *
 * **`tactical` and `dev` stay top-down on purpose, and not because nobody got to
 * them.** They are the A/B control for the whole conversion: one keypress puts the
 * same room, the same frame and the same camera under the old matrix, so "is this
 * the projection or is this a bug" is a question with an answer rather than an
 * argument. Every top-down arm added from here on is the code it replaced,
 * verbatim, for exactly that reason.
 *
 * The hint lives in the row for the reason `CONTROL_TOGGLES` keeps its two
 * sentences: a label on screen and the line under it written in two different
 * places is how one of them ends up describing a mode that no longer exists.
 */
const VIEW_MODES = [
  {
    id: "world",
    label: "World",
    art: true,
    fog: true,
    dev: false,
    readouts: false,
    proj: "iso",
    hint: "The room as it looks, lit only where the character can see.",
  },
  {
    id: "tactical",
    label: "Tactical",
    art: false,
    fog: true,
    dev: false,
    readouts: true,
    proj: "topdown",
    hint: "Art off, every readout on -- a disc, a facing wedge, sight and reach.",
  },
  {
    id: "dev",
    label: "Dev",
    art: false,
    fog: false,
    dev: true,
    readouts: true,
    proj: "topdown",
    hint: "No fog at all: every body drawn wherever it is, and the tick strip open.",
  },
];

/** Which one is showing.
 *
 *  **Survives a `restart` and a descent**, deliberately: how a player wants the
 *  room drawn is a preference about the page, not state belonging to the run. */
let viewMode = "world";

/** The row, never the id.
 *
 *  Named `currentView` and not `view` because `view` is taken -- two `let`s of
 *  the same name in one top-level scope is a `SyntaxError` and the page would
 *  not boot at all. It used to be taken by the `Float32Array` over the frame
 *  buffer, which is now `frameBuf`; it is taken today by the blended state the
 *  loop draws. Either way this one keeps its longer name, because "the view" on
 *  this page means the camera and the picture and not a menu setting. */
/** The `.find` predicate, hoisted out of the argument position.
 *
 *  An arrow literal written inline is a fresh closure on every call, and
 *  `currentView` is called three or four times a *body* a frame -- `artOn`, `fogOn`
 *  and `readoutsOn` all go through it and `skinOf` asks once per unit. That is a few
 *  hundred short-lived closures a second in a render path whose stated discipline is
 *  that it allocates nothing; see `wedgeFans`, which is the same argument about
 *  strings. It can be hoisted only because it closes over the module-scope
 *  `viewMode` rather than over a parameter -- `setViewMode`'s own `.find` is keyed on
 *  an `id` argument and has to stay where it is. */
function isCurrentMode(m) {
  return m.id === viewMode;
}

const currentView = () => VIEW_MODES.find(isCurrentMode) || VIEW_MODES[0];
const artOn = () => currentView().art;
const fogOn = () => currentView().fog;
/** Whether this mode paints the sim's own measurements over the picture: the sight
 *  radius, the facing wedge, the weapon's reach. A separate bit from `art` and not a
 *  negation of it -- `art` says whether a body is drawn as a silhouette or a disc, and
 *  this says whether the numbers behind it are drawn at all. The two agree in every row
 *  today and would stop agreeing the day somebody wants the art without the fog, or a
 *  measured view of the art. Same argument `proj` makes one column over. */
const readoutsOn = () => currentView().readouts;

/** The `proj` column resolved to the table `projX` and friends actually read.
 *  A row names its projection with a string for the same reason it names its
 *  hint with a sentence: the table is the description, and a row holding a live
 *  reference to a matrix would be two things that have to be edited together. */
const PROJECTIONS = { topdown: PROJ_TOPDOWN, iso: PROJ_ISO };

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
 * the tick strip, the projection, the framing, the camera, the baked paths, and
 * the hint. **The order of the middle four is load-bearing** and is argued for
 * where each one stands.
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

  // The matrix, before anything reads it. `PROJECTIONS` is indexed rather than
  // switched on so an unknown string in the table is a top-down room and not a
  // page of `NaN`.
  PROJ = PROJECTIONS[mode.proj] || PROJ_TOPDOWN;

  // `fit` is projection-dependent and `Path2D` holds *pixels*, so the scale has
  // to settle before anything is baked against it. Without this the first frame
  // after a mode change draws the room at the previous projection's scale.
  resize();

  // A projection change is a cut, not a pan: the camera's clamp is stated in
  // screen space, so the same character in the same room wants a different
  // `cam` under a different matrix, and easing across the difference would read
  // as the view chasing something that is not there. Same reasoning as the
  // descent and the restart, and the same call they make.
  snapCamera(parseFrame(frameView(), SCRATCH_STATE));

  // Both flags change what gets baked -- `fog` decides which of the paths a tile
  // lands in, `art` decides whether the lit rock faces are built at all --
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
  const at = VIEW_MODES.findIndex(isCurrentMode);
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
    const at = VIEW_MODES.findIndex(isCurrentMode);
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
 * What to send for `strike` this frame.
 *
 * The sim throws one cut per held button on purpose (`Hand::armed`, `hand.rs:250`): a
 * command that is not an attack re-arms the hand, so a policy pays one decision to
 * throw a second blow. That price is the intellect stat and it stays. What a player
 * holding a button is asking for is a rhythm, not a decision, so the page spends the
 * release for them -- in the two phases where a release costs nothing.
 *
 * **Not `Windup`.** Releasing there *cancels* the cut (`hand.rs:405`), which is the
 * feint, and is a control the player still has: let go during the windup and the blow
 * is called off. Auto-releasing there would feint forever and never land anything.
 * `Strike` is committed and cannot be recalled; `Recover` is already spent; and
 * releasing mid-cut is exactly how the sim's own comment says a policy queues the next
 * one.
 *
 * **The one artefact, stated here rather than found later.** This is answered once per
 * *frame* and `step` runs up to `MAX_CATCHUP_TICKS` ticks against that one answer, so a
 * catch-up burst can carry a `Windup` sample across into `Guard`: the hand is still
 * unarmed on the tick it reaches guard, nothing begins, and the next frame starts the
 * cut. One frame of delay on a stuttering frame rate, and never a stuck hand. The
 * alternative -- asking the module to re-evaluate per tick -- is a new export and a
 * genuine change to what crosses the boundary, for a defect nobody can see.
 *
 * Nothing new crosses the boundary. The module sees `Nearest, Nearest, None, None,
 * Nearest, ...` -- the same alternation a policy sends -- so no golden can move.
 */
function strikeCommand(hero) {
  if (!striking) return STRIKE_NONE;
  if (!hero) return STRIKE_NEAREST;
  return hero.swing === SWING_STRIKE || hero.swing === SWING_RECOVER
    ? STRIKE_NONE
    : STRIKE_NEAREST;
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
  // A **screen** intent: "w" is up the screen, in every projection. It used to
  // be a world intent -- "screen y grows downward and world y grows downward
  // with it, so w is -y" -- which was true flat and false the day the room
  // tilted. World `(0,-1)` through `PROJ_ISO` is screen `(+scale, -0.5*scale)`,
  // so `W` walked up and to the *right*: the four keys stayed a coherent
  // orthogonal set and were simply rotated 45 degrees off the screen, leaving
  // the player to think in the room's diagonals. Same class of error `iso-07`
  // fixed for the aim, from the same cause -- a control written before the
  // projection existed and never re-derived under it.
  if (held.has("w")) my -= 1;
  if (held.has("s")) my += 1;
  if (mx || my) {
    // `unprojX`/`unprojY` and not the four coefficients written out again: this
    // page has one inverse matrix, and `groundSpace`'s comment argues at length
    // about what a second copy of a 2x2 costs. They take screen *pixels* and
    // this is a direction, which is the same map -- the inverse is linear, a
    // direction is a difference of two points, and the `1 / scale` they carry
    // divides back out in the normalise below. `scale` cannot be zero to divide
    // by: `resize` clamps it between `fit` and `base * ZOOM_MAX`, both derived
    // from a `safeRect` that floors its own width and height at 120 px for
    // exactly this family of reasons.
    //
    // **What crosses the wall is still a world vector, and that is what makes
    // this legal rather than merely convenient.** Live input is camera-relative;
    // recorded input is not. `crates/sim/src/replay.rs` records submitted
    // commands rather than keystrokes, so a replay never learns that a camera
    // existed and cannot be moved by the zoom, the pan or the projection. The
    // confusing half, stated so nobody chases it: hold `W` and press `G` and the
    // character's *world* heading changes while its *screen* heading does not,
    // because "up the screen" is a different world direction in the two
    // projections. Both halves are right, and the replay records the two
    // different world vectors and reproduces them.
    const wx = unprojX(mx, my);
    const wy = unprojY(mx, my);
    // **Unconditional**, where this was `if (len > 1)`. Under iso a unit screen
    // vector comes back with a world length between 0.71 ("d") and 1.41 ("w"),
    // so a conditional normalise would walk the character across the screen 30%
    // slower than up it. What this buys instead is that world speed is uniform
    // in every screen direction, which is what `move_speed` means, and that
    // screen speed is *not* -- `D` crosses the screen at 1.41 * scale px per
    // world unit travelled and `W` climbs it at 0.71. That factor of two is the
    // projection and must not be compensated; compensating it would mean the
    // character's world speed changed with which way it was pointing.
    //
    // **Flat, this arm is the identity, which is why `[tactical]` and `[dev]`
    // are still the A/B control for the conversion.** `mx, my` are in {-1,0,1},
    // so the top-down pre-images are exactly `(mx, my) / scale` with lengths 0,
    // 1 and sqrt(2); the cardinals divide out exactly, since `hypot(a, 0)` is
    // `|a|` and `a / a` is 1 in IEEE. The diagonal is the one place the claim is
    // weaker than bit-for-bit: `a / hypot(a, a)` rounds one ulp away from
    // `1 / hypot(1, 1)` at about one `scale` in twenty. Nothing downstream can
    // see it -- `milliSigned` rounds to a thousandth and 707.107 is nowhere near
    // a boundary -- and a 1.8M-case sweep over `scale` and all nine key
    // combinations moved zero integers. Every value flat pushes across is the
    // value it pushed before.
    const len = Math.hypot(wx, wy);
    mx = wx / len;
    my = wy / len;
  }

  // Aim: the bearing from the character to the pointer. For the sword that is
  // the *line* a cut is thrown through and nothing else -- how far the blade
  // extends belongs to the attack now, not to the mouse. Distance from the
  // character still means something while the shield modifier is held, where
  // pulling in drops the guard and pushing out braces it.
  //
  // **Under an upright projection the bearing goes to the body under the cursor,
  // and to the ground point only when there is no body there.** This is the one
  // gameplay regression the isometric conversion introduced, and it is derivable
  // rather than a matter of taste: `pointer` is where the cursor lands on the
  // *floor*, and a screen offset of one world unit of height unprojects to a
  // ground offset of `(-1, -1)` -- 1.41 world units to the north-west, since
  // `lift === px` and the two world axes both climb the screen at the same rate.
  // So aiming at a Fighter's chest aims at the floor about 1.4 units behind it,
  // which at three units of engagement is a bearing error of up to 25 degrees,
  // and the cut goes past the target. `unitAt`'s upright arm tests the box the
  // billboard actually occupies, so it answers the question the player thinks
  // they are asking -- and it is the same hit test the cursor affordance and
  // `endDrag` use, so "what is under the cursor" means one thing on this page
  // rather than two.
  //
  // **Top-down keeps the raw ground point, and that is a decision rather than an
  // omission.** Flat, there is no height, so the cursor's ground point already *is*
  // the thing being pointed at and there is no error to correct. Applying the pick
  // there would not be fixing anything; it would replace "aim exactly where I
  // pointed" with "aim at the centre of whatever I am nearest", which is a
  // different feel, and a worse one in the cases where the difference shows --
  // cutting deliberately at the *edge* of a body, or past one at something behind
  // it. `[tactical]` and `[dev]` are the A/B control for the whole conversion, and
  // the conversion has already spent the one exception it could afford on
  // `drawRoute`'s dash cap, which was fixing a hazard rather than changing a feel.
  // It is arguably better flat as well; arguably is not a reason to change a
  // working control at the end of a conversion. If it is wanted there it is one
  // boolean, and it should be its own change with its own before and after.
  //
  // **The artefact, stated here rather than found later:** under iso you can no
  // longer aim *past* a body at something standing behind it, because the pointer
  // snaps to the body. That is the trade -- a control that hits what you point at,
  // at the cost of one you cannot easily point through. `reach` moves with the
  // bearing, since both come off the same `dx, dy`: a guard braced while the
  // cursor is over a monster is braced at that monster's distance rather than at
  // the phantom point behind it, which is the same correction, and it stops
  // responding to pushing further out for the same reason the bearing does.
  //
  // **Gated on the control mask as well as the projection, and `unitAt` still runs
  // at most once a frame.** The plan for this assumed it could hoist the cursor
  // affordance's pick, and there is nothing to hoist: that pick is gated on
  // `!(controlMask & CONTROL_LIMB)` -- under manual aim a press is a cut and there
  // is no lock to promise -- so the two are exactly complementary and never both
  // live on the same frame. The mask test is not just bookkeeping either. The
  // module reads `input_aim` and `input_reach` only under `CONTROL_LIMB`, so
  // without it this would be an O(monsters) walk with a `canSee` test each,
  // feeding two numbers nobody downstream consumes.
  let aim = 0;
  let reach = 0;
  if (state.hero && pointer.inside) {
    // `state`, which is `curr` -- the same frame `state.hero` was read from. The
    // affordance and `endDrag` pick against `view` because they are answering for
    // a click that landed on the picture; this is an input pushed *before* the
    // step, `view` at this point in `loop` is still the previous frame's blend,
    // and pairing last frame's monsters with this frame's hero is a worse answer
    // than taking both off the truth.
    const quarry = PROJ.upright && (controlMask & CONTROL_LIMB) ? unitAt(pointer, state) : null;
    const tx = quarry ? quarry.x : pointer.x;
    const ty = quarry ? quarry.y : pointer.y;
    const dx = tx - state.hero.x;
    const dy = ty - state.hero.y;
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
    strikeCommand(state.hero)
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

    // **`s` is gated on the feet; `w`, `a` and `d` are not.** `s` has to be,
    // because it is the page's one key collision: with Movement taken it walks
    // the character down-screen, and without it it is the spawn key it has
    // always been (`Shift+S` the same). That is resolved by the mask rather than
    // by rebinding either of them, and the keys overlay says so beside the WASD
    // row -- a player who takes a control channel and silently loses a hotkey is
    // owed a sentence somewhere they will read it.
    //
    // The other three are bound to nothing else, so gating their *capture* on
    // the mask bought nothing and cost one small surprise: press and hold `W`,
    // then press `C` to take the feet, and nothing moved until the key was
    // released and pressed again, because the keydown that would have added it
    // to `held` was thrown away. There are two independent reasons a held key
    // nobody has asked for can do no harm -- `pushInput` returns before
    // `set_input` with no channel held at all, and `drive_hero` ignores the
    // vector without `CONTROL_FEET`.
    if ("wad".includes(key) || (controlMask & CONTROL_FEET && key === "s")) {
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
      // is complaining about. Its own key, readable from `[world]`, and the two
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

/** World to screen, x and y separately.
 *
 *  Two scalar functions and not one point-returning function: a shared out-object
 *  would alias the moment two projections appear in one expression
 *  (`moveTo(project(a)); lineTo(project(b))`), and a fresh object per call would
 *  allocate in the hot path, which this file does not do. Two multiplies and an
 *  add inline to nothing. Under `topdown` these are literally `wx * scale`. */
function projX(wx, wy) {
  return (PROJ.ax * wx + PROJ.bx * wy) * scale;
}

function projY(wx, wy) {
  return (PROJ.ay * wx + PROJ.by * wy) * scale;
}

function unprojX(sx, sy) {
  return (PROJ.ix * sx + PROJ.jx * sy) / scale;
}

function unprojY(sx, sy) {
  return (PROJ.iy * sx + PROJ.jy * sy) / scale;
}

/** World units of *height* to screen pixels upward.
 *
 *  Identical to `px` by construction -- in a 2:1 projection with `K = scale` a
 *  unit cube's vertical edge is the ground diamond's half-width, which is
 *  `px(1)`. It exists as its own name so the call sites say which of the two
 *  things they mean, and so a future non-cube projection has one place to change. */
function lift(h) {
  return h * scale;
}

/** The CTM for anything lying flat on the floor, **emitted** as one
 *  `XFORM_PUSH` carrying the translate, the shear, and whatever rotation and
 *  scale the call site composed on top of them.
 *
 *  Its input space is exactly the space `drawLimb`, `drawMarks`, `drawSprint` and
 *  every decal already work in: screen pixels of top-down world offset from the
 *  anchor. So converting one of them was a one-line change at the top and nothing
 *  below it moved.
 *
 *  **The rotation and the scale are arguments here where they were separate `ctx`
 *  calls before `art-04`**, because a push is a unit and the CTM has to come out
 *  bit-identical: the backend applies translate, shear, rotate and scale in that
 *  order and no other, which is the order every one of these call sites was
 *  already written in. The rotation is not folded into the matrix -- see
 *  `DL_XFORM_PUSH`. `alpha` negative means "do not touch `globalAlpha`".
 *
 *  **The matrix is read out of the table and not typed a second time.**
 *  `ctx.transform(a,b,c,d,e,f)` composes x' = a*x + c*y + e, y' = b*x + d*y + f.
 *  The input is `(px(dx), px(dy)) = (dx*scale, dy*scale)` and the output has to be
 *  the forward projection's offset,
 *  `(projX(dx,dy), projY(dx,dy)) = ((ax*dx + bx*dy)*scale, (ay*dx + by*dy)*scale)`
 *  -- so `a, b, c, d` are `ax, ay, bx, by`, in that order, and for `PROJ_ISO` they
 *  come out `(1, 0.5, -1, 0.5)`, which is what this line used to spell as literals.
 *  Spelling them was the same 2x2 written twice: editing `PROJ_ISO`'s and not this
 *  one, or the reverse, would have put every ground decal on a different floor from
 *  every wall and body, **silently and with nothing to catch it** --
 *  `assertProjection`'s round trip proves a matrix against its own inverse and has
 *  no opinion about a copy of it living somewhere else. So the consistency with
 *  `projX`/`projY` is now by construction rather than by a second derivation, in
 *  the literal sense: this call reads the same six coefficients they read.
 *
 *  `ex` and `ey` are forced by this same 2x2 rather than chosen beside it -- a
 *  world circle of radius `r` under it comes out as an *axis-aligned* ellipse with
 *  semi-axes `r*scale*ex` and `r*scale*ey`, which is why anything wanting an
 *  explicit `ctx.ellipse` needs no rotation -- and `assertProjection` checks `ex`
 *  against the one the upright art was authored for. Between them the table is the
 *  single source for the whole ground map, and the round trip has stopped being the
 *  only thing standing between an edit and a silent skew.
 *
 *  **The `if (PROJ.shear)` guard stays, even though top-down's row is now the
 *  identity and composing it would be a no-op.** It is not what makes the pixels
 *  right; what it buys is that top-down still executes a bare `ctx.translate` with
 *  no second matrix multiply behind it, which is byte-identical to what it did
 *  before this line changed rather than merely equivalent to it. `Tactical` and
 *  `Dev` are the A/B control for the whole conversion and they are worth a branch.
 *  The backend keeps the guard honest from its own side: `dlApplyXform` skips the
 *  `ctx.transform` when the linear part it is handed is the identity, so the
 *  identity row emitted below still comes out as one `ctx.translate` and nothing
 *  else.
 *
 *  **det = ax*by - bx*ay = 1*0.5 - (-1)*0.5 = 1.** The shear is unimodular, so
 *  every ground fill covers exactly the pixels it covers today. That is the whole
 *  reason the isometric conversion is not a rasteriser regression, and it is why
 *  dash patterns keep their measured mark counts: dashing happens in user space and
 *  is transformed afterwards.
 *
 *  **What is on it, as of `iso-06`, which is everything that is going on it.**
 *
 *  Anchored to a *body*, from `iso-05`: `drawLimb`, `drawMarks` twice,
 *  `drawSprint`, `drawCorpse`'s flat arm, and `drawCharacter`'s ground pre-pass --
 *  shadow, facing wedge, collision ring -- which is the three passes that stayed
 *  on the floor when the body stood up.
 *
 *  Anchored to a *point in the room*, from `iso-06`: `drawVision`, `drawReach`,
 *  `drawLock`'s ring, `drawDestination`'s whole marker, `drawPortal`, `drawRoute`'s
 *  beads, and both of `drawShot`'s passes -- the ground shadow under an arrow in
 *  flight, and then the shaft itself, which lies in the world plane at shoulder
 *  height and so goes through the shear as well, under a screen-space lift applied
 *  before it. Every one of them was a one-line change at the top with nothing below
 *  it moving, because of the paragraph above.
 *
 *  Fourteen call sites, and this list is the register to grep when the question is
 *  what the shear touches -- so a fifteenth belongs here on the way in.
 *  **Re-counted at `art-04` commit 2, when the last six moved onto the seam:
 *  still fourteen, still these fourteen.** The conversion changed what a call
 *  site *looks* like -- a push with the rotation and the scale folded into it
 *  rather than a `ctx.transform` followed by two more calls -- and did not add,
 *  remove or move one. The `ctx` twin this function used to have beside it is
 *  gone with them; there is one of these again.
 *
 *  **Three things on the floor are deliberately *not* on it, and the rule is the
 *  same for all three.** `drawTrail`, `drawRoute`'s two polylines and `drawLock`'s
 *  tether project each endpoint instead. An affine map takes a line to a line, so
 *  the geometry is identical either way; what differs is the stroke, which the
 *  shear would stretch with the bearing. A line that is a *hint* keeps one weight;
 *  a ring that traces something the sim can measure goes through the shear and
 *  wears the anisotropy, because being the right shape matters more. `drawCorpse`'s
 *  upright arm is out for a different reason again, stated there.
 *
 *  **Every call site is balanced by `save`/`restore` -- `XFORM_PUSH`/`XFORM_POP`
 *  on the emitted side -- and none may be balanced any other way.**
 *  `ctx.transform` has no tidy inverse pair: a `translate` can be undone by
 *  translating back and a `rotate` by rotating back, and several of these
 *  functions used to do exactly that, but there is nothing to write here that puts
 *  the shear back. A missed `restore` leaks the shear into the next item in the
 *  merge walk, which under iso is somebody else's body. `DL_BARE` is the one
 *  exception and it is exactly the *other* two: it is for a hand-written
 *  rotation or translation inverse, and a shear may never be pushed with it. */
function pushGroundSpace(wx, wy, rot, scale, alpha) {
  const tx = projX(wx, wy);
  const ty = projY(wx, wy);
  if (PROJ.shear) dlXform(PROJ.ax, PROJ.ay, PROJ.bx, PROJ.by, tx, ty, rot, scale, alpha);
  else dlXform(1, 0, 0, 1, tx, ty, rot, scale, alpha);
}

/**
 * One map tile as a 2:1 diamond, appended to `p`. `x, y` is its **north** corner
 * and `w` is `px(map.tile)` -- which is the diamond's half-width and also its full
 * height, because 2:1 is what 2:1 means. The subpath is closed, so a fill sees it
 * as a face and not as an outline.
 *
 * The four corners are the tile's four world corners under the projection, with
 * `w` factored out of every one of them:
 *
 *     N (x,     y      )  = world (tx,   ty  )
 *     E (x + w, y + w/2)  = world (tx+1, ty  )
 *     S (x,     y + w  )  = world (tx+1, ty+1)
 *     W (x - w, y + w/2)  = world (tx,   ty+1)
 *
 * Check `S` against `projX`/`projY` with `ax, bx = 1, -1` and `ay, by = .5, .5`:
 * `projX = scale*T*((tx+1) - (ty+1)) = scale*T*(tx - ty) = x`, and
 * `projY = scale*T*(tx + ty + 2)/2 = y + w`. So the diamond is `2w` across and
 * `w` tall and the caller never has to call the projection at all -- two
 * multiplies per tile, which is what keeps a 3,060-tile bake cheap.
 *
 * Takes a `Path2D` rather than emitting an item: every caller is baking geometry
 * that outlives the frame, which is a paint source and not a drawing, and the two
 * habits are worth keeping apart. (The counterpart it used to be contrasted with
 * was `roundRect`, which drew on `ctx`; `art-04` turned that into a `ROUND_RECT`
 * item, because a callout pill's width comes out of `measureText` and no two
 * frames want the same one.) Lifted faces are `iso-03`'s and they are this same
 * shape with a height subtracted from `y`.
 */
function diamond(p, x, y, w) {
  p.moveTo(x, y);
  p.lineTo(x + w, y + w / 2);
  p.lineTo(x, y + w);
  p.lineTo(x - w, y + w / 2);
  p.closePath();
}

/**
 * One tile of rock as a *block*: a lifted top face appended to `top`, and up to
 * two vertical faces appended to `side`. `x, y` is the ground diamond's **north**
 * corner and `w` is `px(map.tile)`, exactly as `diamond` above takes them; `L` is
 * `lift(WALL_H)`, the block's vertical edge in pixels.
 *
 * **The top face is the ground diamond translated by `(0, -L)` and nothing else.**
 * That the offset is *uniform* is the whole reason a field of blocks reads as a
 * continuous plateau: lifted diamonds tile the plane exactly as ground diamonds
 * do, so a top face meets its neighbour's along a shared edge with no seam and no
 * overlap, which is the same guarantee the floor tiling already leans on.
 *
 * **Only two of the four vertical faces can ever be seen.** The camera looks from
 * `+x, +y`, so the `+x` face (screen lower-right) and the `+y` face (screen
 * lower-left) are the entire silhouette of a block; the `-x` and `-y` faces are
 * behind it in every frame of every level and are never emitted. That halves the
 * exposure test the top-down bake does, rather than porting it.
 *
 * `xFace` and `yFace` say whether the neighbour in that direction is open ground.
 * Where it is not, the face is an interior seam between two touching blocks and
 * nothing can see that either.
 *
 * Both quads are the projected images of the tile's world corners, with `w`
 * factored out the same way `diamond` factors it and with `L` subtracted from the
 * y of the lifted pair. Writing the ground diamond's corners `E = (x+w, y+w/2)`,
 * `S = (x, y+w)`, `W = (x-w, y+w/2)`:
 *
 *     +x face   the plane world x = tx+1, from world y = ty to ty+1   -> E, S
 *     +y face   the plane world y = ty+1, from world x = tx to tx+1   -> S, W
 *
 * so each is a parallelogram `L` tall standing on one edge of the diamond.
 *
 * **Both quads wind the same way and that is load-bearing.** `side` is filled
 * under the nonzero rule, and a near block's `+y` face genuinely can overlap a far
 * block's `+x` face on screen. Same orientation means the overlap winds to 2 and
 * fills; opposite orientations would wind to 0 and punch a hole clean through two
 * pieces of solid rock. They agree because each walks its top edge in the
 * diamond's own `N -> E -> S -> W` direction -- `E -> S` for `+x`, `S -> W` for
 * `+y` -- and then returns along the ground edge. Do not "tidy" either one into
 * the other order.
 *
 * Takes the two target paths rather than reaching for `levelPaths`, so `iso-04`
 * can hand it one depth row's band pair instead of the unbanded pair without
 * touching a line of the geometry.
 */
function wallBlock(top, side, x, y, w, L, xFace, yFace) {
  diamond(top, x, y - L, w);
  if (xFace) {
    side.moveTo(x + w, y + w / 2 - L);
    side.lineTo(x, y + w - L);
    side.lineTo(x, y + w);
    side.lineTo(x + w, y + w / 2);
    side.closePath();
  }
  if (yFace) {
    side.moveTo(x, y + w - L);
    side.lineTo(x - w, y + w / 2 - L);
    side.lineTo(x - w, y + w / 2);
    side.lineTo(x, y + w);
    side.closePath();
  }
}

/**
 * A *part* of one tile as a block: the same three quads `wallBlock` emits, over a
 * sub-rectangle of the tile rather than the whole of it.
 *
 * `x, y, w, L` are `wallBlock`'s exactly. `u0, v0, u1, v1` are the sub-rectangle
 * in **tile fractions** on the two world axes, so `(0, 0, 1, 1)` is the whole
 * tile and this function then emits precisely what `wallBlock(.., true, true)`
 * does -- which is the check that the projection below is the same one.
 *
 * A world point `(u, v)` inside the tile lands at screen
 * `(x + (u - v) * w, y + (u + v) * w / 2)`, because `projX` depends on `wx - wy`
 * and `projY` on `wx + wy` and `wallBlock`'s own corners are that formula with
 * the four unit values substituted. The lifted copy is the same minus `L`.
 *
 * **Both quads wind the same way, and that is load-bearing for the same reason
 * it is in `wallBlock`** -- read the paragraph there. Each walks its top edge in
 * the diamond's `N -> E -> S -> W` direction and returns along the ground edge,
 * so a jamb overlapping another jamb, or a wall block, winds to 2 and fills
 * rather than winding to 0 and punching a hole through solid geometry.
 *
 * **Both side faces unconditionally, no exposure test.** A jamb is at most a
 * quarter of a tile and the faces one could hide are the ones against the rock
 * the jamb is set into -- which stands one band nearer and is filled after it, so
 * the band walk covers them anyway. Two quads nobody sees, on at most two jambs
 * per doorway, is cheaper than a neighbour test that would have to know about
 * sub-tile geometry.
 */
function subBlock(top, side, x, y, w, L, u0, v0, u1, v1) {
  const nx = x + (u0 - v0) * w;
  const ny = y + ((u0 + v0) * w) / 2;
  const ex = x + (u1 - v0) * w;
  const ey = y + ((u1 + v0) * w) / 2;
  const sx = x + (u1 - v1) * w;
  const sy = y + ((u1 + v1) * w) / 2;
  const wx = x + (u0 - v1) * w;
  const wy = y + ((u0 + v1) * w) / 2;
  top.moveTo(nx, ny - L);
  top.lineTo(ex, ey - L);
  top.lineTo(sx, sy - L);
  top.lineTo(wx, wy - L);
  top.closePath();
  // The +x face: the plane u = u1, from v0 to v1.
  side.moveTo(ex, ey - L);
  side.lineTo(sx, sy - L);
  side.lineTo(sx, sy);
  side.lineTo(ex, ey);
  side.closePath();
  // The +y face: the plane v = v1, from u0 to u1.
  side.moveTo(sx, sy - L);
  side.lineTo(wx, wy - L);
  side.lineTo(wx, wy);
  side.lineTo(sx, sy);
  side.closePath();
}

/** How thick a jamb is, as a fraction of a tile. A quarter of a world unit is
 *  about half a Fighter's radius: a post you can see from across the room without
 *  it looking like the doorway has been bricked up to half its width. */
const JAMB = 0.22;

/**
 * The four orthogonal neighbours, and the slab of the tile a jamb stands in
 * against each: `[dx, dy, u0, v0, u1, v1]` in `subBlock`'s tile fractions.
 *
 * A doorway is a run of tiles spanning a corridor's width, cut through a wall --
 * so the *ends* of the run are exactly the door tiles with rock beside them, and
 * the tiles down its long sides are open floor. Which means the jambs need no
 * grouping and no run direction from the module: "put a post on every edge that
 * faces masonry" places two posts on a three-tile run and none in the middle of
 * it, for free, whichever way the run points.
 */
const JAMB_SIDES = [
  [0, -1, 0, 0, 1, JAMB],
  [0, 1, 0, 1 - JAMB, 1, 1],
  [-1, 0, 0, 0, JAMB, 1],
  [1, 0, 1 - JAMB, 0, 1, 1],
];

/**
 * A polygon painted flat on one visible face of a wall tile.
 *
 * The face is a plane of the world, so a point on it needs two numbers and not
 * three: `t` runs along the face from 0 to 1, and `h` is height as a fraction of
 * a block. `face` picks which of the two the camera can see, and the whole of
 * the difference between them is one sign.
 *
 * Substituting into `subBlock`'s own projection, a world point `(u, v)` in the
 * tile lands at `(x + (u - v) * w, y + (u + v) * w / 2)`, less `lift` for its
 * height. The `+x` face is `u = 1, v = t`, so `u - v = 1 - t` and `u + v = 1 + t`;
 * the `+y` face is `u = t, v = 1`, so `u - v = t - 1` and `u + v = 1 + t`. The
 * second coordinate is the same on both -- both faces stand on the same edge of
 * the diamond's `S` corner -- and the first is negated, which is the sign below.
 *
 * **The vertex list is walked backwards on the `+y` face, and that is winding and
 * not tidiness.** `t` and `h` map to screen with opposite handedness on the two
 * faces (the cross product of the two axes flips with the sign), so one polygon
 * order gives opposite windings on the two sides. Torch geometry is filled
 * nonzero like the rock's, so two sub-paths wound against each other punch a hole
 * through whatever they overlap -- the trap `wallBlock` and `subBlock` each have a
 * paragraph about, met here for the third time.
 */
function facePoly(p, x, y, w, L, face, poly) {
  const s = face === TORCH_POS_Y ? -1 : 1;
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    // Backwards on the `+y` face, for the paragraph above.
    const [t, h] = poly[s > 0 ? i : n - 1 - i];
    const sx = x + s * (1 - t) * w;
    const sy = y + ((1 + t) * w) / 2 - h * L;
    if (i === 0) p.moveTo(sx, sy);
    else p.lineTo(sx, sy);
  }
  p.closePath();
}

/** The three pieces of a torch, in `facePoly`'s `(t, h)` face coordinates: the
 *  bracket it is held in, the flame, and the flame's own core.
 *
 *  A block is `WALL_H = 1.6` world units tall, so `h = 0.5` is a little over head
 *  height on something the size of a Fighter and the fire burns above that.
 *  Narrow in `t`: a torch is a stick and a handful of flame, and anything much
 *  wider than a sixth of a tile reads as a hearth set into the wall.
 *
 *  **Three fills and not one, and each of the two boundaries is doing work.** A
 *  single bright shape on a dark wall reads as a hole in it. Dark iron under the
 *  fire is what says the light is *held* by something; a pale core inside a deeper
 *  orange is what says the shape is burning rather than painted, because a flame's
 *  whole visual signature is that it is hottest in the middle. At the default
 *  framing this is about forty pixels of wall, which is enough for both to tell.
 *
 *  The flame is five points rather than a triangle because a triangle reads as an
 *  arrowhead: the widest part sits below the middle and the tip leans back over
 *  it, which is the outline that says "fire" even when it is six pixels tall. */
const TORCH_BRACKET = [
  [0.45, 0.3],
  [0.55, 0.3],
  [0.55, 0.53],
  [0.45, 0.53],
];
const TORCH_FLAME = [
  [0.44, 0.5],
  [0.56, 0.5],
  [0.6, 0.62],
  [0.5, 0.8],
  [0.4, 0.62],
];
const TORCH_CORE = [
  [0.47, 0.54],
  [0.53, 0.54],
  [0.55, 0.63],
  [0.5, 0.72],
  [0.45, 0.63],
];

/** How thick a top-down torch mark is, as a fraction of a tile, and how far it is
 *  inset along the seam. One number for both, so the mark is a square-ish tick
 *  centred on the edge the face would stand on. */
const TORCH_MARK = 0.2;

/** The empty torch list, hoisted so the bake's `art ? furniture.torches : NO_TORCHES`
 *  allocates nothing on the modes that draw none. `Object.freeze` because a shared
 *  empty array that something pushes to is a bug that would present as torches in
 *  Tactical. */
const NO_TORCHES = Object.freeze([]);

// ---------------------------------------------------------------- the floor
//
// One flagstone tile, baked once into an offscreen canvas and repeated. The
// room is 68x45 world units and a wheel notch can put eighty device pixels on a
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

/** The pattern's own matrix, hoisted and rewritten in place.
 *
 *  The line this replaces built a fresh `DOMMatrix` every frame, which was
 *  forgivable while it was one uniform scale and is not now that it carries the
 *  projection: the file allocates nothing per frame anywhere else, and this is
 *  the moment to stop. `setTransform` reads the six numbers out and keeps
 *  nothing, so one object serves every frame for the life of the page. */
const PATTERN_M = new DOMMatrix();

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
  g.fillStyle = PAL.mortar;
  g.fillRect(0, 0, size, size);

  // **Red carries the contrast and blue is the flat channel**, which is the exact
  // inverse of what this bake did before `art-01`. The two ends of the walk are
  // `PAL.stoneLo` and `PAL.stoneHi`, *read* rather than transcribed: a flagstone is
  // a whole number of steps from the dark end toward the light one, so the palette
  // the rest of the repository quotes and the floor that actually gets painted
  // cannot drift apart. This produces the same tones the hand-written formula did
  // -- `(36,30,20)` to `(46,40,30)`, eleven steps about a mean of `(41,35,25)`, one
  // `rand()` draw per stone in the same order -- so the floor is identical to the
  // byte and the only thing that changed is which copy of the range is the source.
  //
  // One step drives all three channels, because the two ends are the same offset
  // apart on every one of them: a flagstone differs from its neighbour in how much
  // light it is getting, not in what it is made of, which is the whole claim the
  // umber palette makes. Retone an end to something that is *not* a uniform offset
  // and the red span is what still gets counted -- this is where you find that out.
  const stoneLo = palRgb(PAL.stoneLo);
  const stoneSteps = palRgb(PAL.stoneHi)[0] - stoneLo[0] + 1;

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
      // How far this stone is along the walk the top of the function sets up.
      const step = Math.floor(rand() * stoneSteps);
      g.fillStyle = `rgb(${stoneLo[0] + step},${stoneLo[1] + step},${stoneLo[2] + step})`;
      g.fillRect(x + seam, y + seam, w, h);
      // A lit top edge and a shadowed bottom one. Two flat fills, but they are
      // the difference between a stone with a face and a coloured rectangle.
      // Bone rather than sky: the lip is the room's own light landing on a
      // stone, and the room's light is a torch.
      g.fillStyle = "rgba(201,191,168,0.06)";
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
        ? `rgba(201,191,168,${(0.02 + rand() * 0.05).toFixed(3)})`
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
 *
 * **It also carries the projection**, which is what keeps the masonry lying on the
 * floor rather than floating over it. `CanvasPattern.setTransform` takes a
 * `DOMMatrix2DInit` mapping `x' = a*x + c*y + e`, `y' = b*x + d*y + f`, and the
 * pattern's own space is texels; so `k` converts a texel to world units and the
 * projection's own four coefficients convert world units to screen. The two
 * columns of `PROJ` land in the two columns of the matrix, in that order, and the
 * courses come out as diamonds aligned with the tile grid.
 *
 * Under `topdown` this is `a = d = scale * TILE_WORLD / floorTile.width` with
 * `b = c = 0`, because `ax = by = 1` and `bx = ay = 0` -- which is
 * `px(TILE_WORLD) / floorTile.width`, the uniform scale this replaced.
 *
 * *Algebraically* the same, and to a ULP rather than to the bit: this associates
 * as `scale * (4 / w)` where the line it replaced associated as `(4 * scale) / w`,
 * and for the three bucket widths that are not powers of two those round
 * differently about a third of the time. The gap is 2e-16 relative on a texture
 * scale, and this arm is unreachable from `[tactical]` and `[dev]` anyway --
 * `drawLevel` calls this only with the art on. Stated because "exactly" would be
 * a claim the next person could check and find false.
 *
 * `e` and `f` stay zero in both, and that is the load-bearing part: pattern-space
 * origin is canvas origin is world `(0, 0)`, so the stones stay nailed to the
 * level instead of crawling under a pan, and the reasoning in `drawLevel` about
 * clipping moving the fog boundary and nothing else survives verbatim.
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
    const k = TILE_WORLD / floorTile.width; // world units per pattern texel
    PATTERN_M.a = PROJ.ax * scale * k;
    PATTERN_M.b = PROJ.ay * scale * k;
    PATTERN_M.c = PROJ.bx * scale * k;
    PATTERN_M.d = PROJ.by * scale * k;
    PATTERN_M.e = 0;
    PATTERN_M.f = 0;
    floorPattern.setTransform(PATTERN_M);
  }
  return floorPattern;
}

/**
 * The grain, as one tile that is baked once and never again.
 *
 * **In screen space, not world space**, and that is the whole design rather than a
 * shortcut. Grain is a property of the *picture* and not of the floor: it does not
 * pan, it does not zoom, and it is therefore the one paint source on this page with
 * no invalidation rule at all -- `floorPattern` rebakes on a zoom bucket and
 * `arenaVignette` on the room's screen box, and this rebakes on nothing. A grain
 * anchored to the world would crawl under a pan, which is the exact artefact that
 * makes an overlay read as a filter somebody left on.
 *
 * It exists because a large dark area with nothing in it reads as a flat fill, and
 * after `art-01`'s vignette the largest areas on screen are exactly those. It is
 * composited over the bodies, the walls and the overlay layer -- not inside the
 * vignette and not gated on it -- because the emptiest part of the picture is the
 * part that needs it most.
 *
 * `grainRandom` again, at a different constant seed, for the reason `bakeFloorTile`
 * gives: a bake that rolled fresh numbers would fizz the moment anything caused a
 * rebake. Nothing does here, which makes the seed belt and braces, and it costs one
 * constant.
 *
 * **Speckle over transparency, not a grey veil**, and the composite is
 * `source-over`, set rather than inherited -- the line below says why, and
 * `drawTorchLight` is the only site in `web/` that sets anything else. `overlay` was
 * specified and is wrong on this backdrop: the separable overlay blend is `2*b*s`
 * for a backdrop below half, so against the near-black this session just produced
 * it multiplies toward zero and paints
 * *nothing* precisely where the grain is for. That is derivable rather than
 * measurable, so it settles the blend mode without a stopwatch. What is genuinely
 * unmeasured is the cost of one full-viewport translucent fill a frame, which needs
 * a foreground tab and the frame strip -- see "Performance notes" in DESIGN.md for
 * why a loop around a draw call cannot answer it. If the fps chip ever moves, this
 * is the only candidate in the session and `GRAIN_ALPHA` is the knob.
 */
const GRAIN_TILE = 256;
const GRAIN_DENSITY = 0.25; // fraction of the tile's pixels that get a mark
const GRAIN_ALPHA = 0.5; // what the whole tile is composited at

/** The grain, as a §3 paint-table index. `DL_NO_PAINT` until the first frame
 *  that wants it, and then forever: this is the one paint source on the page
 *  with no invalidation rule at all, so it belongs in the table's *static*
 *  region and it is the only thing `main.js` puts there lazily. */
let grainPaint = DL_NO_PAINT;

function bakeGrainTile() {
  const tile = document.createElement("canvas");
  tile.width = GRAIN_TILE;
  tile.height = GRAIN_TILE;
  const g = tile.getContext("2d");
  const rand = grainRandom(0x2545f491);
  // Half lighter than what is under it and half darker, which is what stops the
  // wash reading as a lift: a speckle that is only ever brighter is fog, and one
  // that is only ever darker is dirt on the lens. Bone rather than white for the
  // light half, so the grain belongs to the same palette as everything it lands on.
  const marks = Math.round(GRAIN_TILE * GRAIN_TILE * GRAIN_DENSITY);
  for (let i = 0; i < marks; i++) {
    const x = Math.floor(rand() * GRAIN_TILE);
    const y = Math.floor(rand() * GRAIN_TILE);
    g.fillStyle =
      rand() < 0.5
        ? `rgba(201,191,168,${(0.03 + rand() * 0.07).toFixed(3)})`
        : `rgba(0,0,0,${(0.04 + rand() * 0.10).toFixed(3)})`;
    g.fillRect(x, y, 1, 1);
  }
  return tile;
}

/**
 * One `fillRect` of grain over the whole picture.
 *
 * **The identity transform, so a tile pixel is a device pixel.** `render` leaves the
 * matrix at `dpr` with the camera translated into it, and painting through that
 * would scale the grain with the display and slide it under a pan -- both of the
 * things the tile exists not to do. The rect is the backing store's own size for
 * the same reason: `viewport` is CSS pixels and this space is not.
 */
function drawGrain() {
  if (grainPaint === DL_NO_PAINT) grainPaint = dlPatternStatic(bakeGrainTile(), "repeat");
  if (grainPaint === DL_NO_PAINT) return;
  // **`DL_XF_ABSOLUTE`, and it is the whole of the paragraph above.** Every other
  // push in the list *concatenates*; this one replaces. A concat here would
  // inherit `render`'s camera translate and the grain would slide under a pan,
  // and it would inherit the `dpr` scale and the grain would grow with the
  // display. The identity is what makes a tile pixel a device pixel, and the
  // rect below is the backing store's own size for the same reason.
  //
  // `DL_SOURCE_OVER` is said, not inherited, and the argument is unchanged by
  // the seam: `source-over` is the canvas default and every painter that changes
  // it restores it, so the flag moves nothing today -- but the grain is the last
  // fill in the frame, which makes "nothing today" a property of every draw call
  // before it rather than of this one. It is deliberately *not* something the
  // backend asserts on every push, because `drawTorchLight`'s pools are additive
  // and a push inside them that asserted the default would flatten them.
  dlXform(1, 0, 0, 1, 0, 0, 0, 1, GRAIN_ALPHA, DL_XF_ABSOLUTE | DL_SOURCE_OVER);
  dlPatternRect(0, 0, canvas.width, canvas.height, grainPaint);
  dlXformEnd();
}

/**
 * The level as paths: open floor and rock, each split into what the character can
 * see *now* and what it merely remembers, plus the lit rock edges and the scale
 * bar's lattice.
 *
 * **Rock is baked differently in the two projections and each leaves the other's
 * fields null:**
 *
 *     shared   floorLit  floorSeen  grid
 *     topdown  wallLit   wallSeen   edge          -- flat tiles and a stroked rim
 *              doorLit   doorSeen                 -- doorways, flat, over the rock
 *              torchLit  torchSeen                -- torches, flat, over the rock
 *     iso      wallTopSeen  wallSideSeen          -- remembered rock, unbanded
 *              wallBandTop[]  wallBandSide[]      -- lit rock, one pair per depth row
 *              doorTopSeen  doorSideSeen          -- remembered doorways, unbanded
 *              doorBandTop[]  doorBandSide[]      -- lit doorways, one pair per depth row
 *              torchStemSeen  torchFlameSeen  torchCoreSeen   -- remembered torches
 *              torchBandStem[]  torchBandFlame[]  torchBandCore[]  -- lit torches
 *
 * **The doorway pairs mirror the rock pairs exactly and exist for one reason: the
 * fills are one `fillStyle` each.** `fillBand` sets a colour and fills a path, so
 * door geometry appended to `wallBandTop` would be painted in the wall's own tone
 * and be invisible -- and the remembered pass a hundred lines down does the same
 * thing with `wallTopSeen`. A separate path is what a separate colour costs here.
 * `wallBlock`'s winding argument is the second reason and it is independent: `side`
 * is filled nonzero, so a sub-path wound the other way punches a hole clean through
 * solid rock, and keeping the doorways in their own path means the two bodies of
 * geometry can never be asked to agree about it.
 *
 * A doorway is *both* halves of that mirror because a shut door is a block like any
 * other and an open one is a pair of jambs standing in a hole, and the two are the
 * same tile a second apart. See `rebuildLevelPaths`.
 *
 * **The torch triples are that argument a third time, and they are a *triple*
 * because a flame is neither the bracket it sits in nor uniformly hot.** Three
 * fills, three tones, three paths -- and the two splits are where the whole
 * readability of a torch at five pixels comes from: dark iron under fire says "a
 * light" rather than "a warm smudge", and a pale core inside an orange flame says
 * "burning" rather than "painted orange". They are baked only with the art on,
 * unlike the doorways: a doorway is geometry a tactical plan needs and a torch is
 * paint, so `[tactical]` and `[dev]` stay byte-identical to what they drew before
 * this session.
 *
 * `torchLights` is not a path at all -- it is the additive floor light, one entry a
 * torch, and it lives here because it is invalidated by exactly the same things the
 * paths are. See its own note in `rebuildLevelPaths`.
 *
 * So it is **six paths** top-down -- five with the art off, where `edge` is null
 * as well, which is every top-down row `VIEW_MODES` actually ships; see `edge`'s
 * own declaration for why the six-path configuration is kept anyway -- and under
 * iso it is **five unbanded paths** plus two arrays of at most `bandCount` paths
 * each, of which the visible slice is filled per frame. Count the table: the
 * `shared` row is three, and iso adds the remembered pair to it. Nothing ever
 * reads the other projection's fields.
 *
 * (`iso-03` said seven unbanded under iso and was right at the time. `iso-04`
 * moved the *lit* pair into the band arrays, which subtracts two, and the figure
 * was edited as though it subtracted four. `grid` is inside both counts, which is
 * what makes six and five comparable at all.)
 *
 * **Why only the *lit* rock is banded, and what it costs.** The bands exist so
 * `walkDrawList` can interleave wall geometry with the bodies standing among it.
 * Remembered rock stays as the unbanded pair, drawn once in the ground layer, and
 * that is a **deferral with a known artefact** rather than a free simplification.
 *
 * The tempting argument is that a remembered block is out of the character's sight,
 * so anything it could occlude must be a ghost. It does not hold: a block being
 * beyond the sight radius says nothing about the strip *behind* it, which is nearer
 * and can be squarely inside it. Sight 9.6, hero at `(20, 20)`, block at
 * `(27, 27)` -- distance 9.9, so remembered, so unbanded and painted in the ground
 * layer. A live monster at `(25.5, 25.5)` is 7.8 away and fully visible; its depth
 * of 51 is behind the block's near plane at 56 and behind the block's own north
 * corner at 54, so its ground point lies under that top face, and nothing blocks
 * the character's line to it because the block is further along the very same ray.
 * A brightly lit, live body draws over a block it is standing behind.
 *
 * So the artefact is reachable and it is not a ghost. What bounds it is the
 * geometry: it needs a remembered block standing between the character and
 * something it can still see, which confines it to the annulus just outside the
 * sight boundary. And it is quiet when it happens -- the block is two fills at
 * `SEEN_ALPHA` over the void, so the rock that fails to occlude is the dimmest
 * thing on the page and a body coming through it reads as faint rather than as
 * wrong. Bounded, uncommon and faint is why it waits. **Escalation if it bites:**
 * `iso-07` §6, which is two more band arrays baked by the same code and four fills
 * a band instead of two -- this code applied twice, and nothing new to invent.
 *
 * `drawLevel` branches once to decide which set that is, and it branches on
 * **`levelPaths.proj` and not on the live `PROJ`** -- the projection this bake
 * actually used, so that a bake the invalidation missed is a stale *shape* rather
 * than a `ctx.fill(null)` thrown out of every frame from then on. `walkDrawList`
 * reads the same bake for the same reason, through `bandCount`.
 *
 * `bandCount`, `bandW`, `bandL` and `bandTile` are the four numbers the depth walk
 * needs and they are baked here rather than re-derived per frame, because all four
 * are pure geometry off the map, `WALL_H` and `scale`, and this is already the
 * function that re-runs when any of those moves. `bandW` is `px(map.tile)`, the
 * band's screen pitch, which the culling arithmetic divides by; `bandL` is
 * `lift(WALL_H)`, how far above its ground diamond a baked top face sits, which is
 * how far up-screen a band reaches; `bandTile` is `map.tile`, the *world* units one
 * band step spans, which is what turns a band index into the depth key bodies are
 * sorted on. Baking them is also what keeps `render` from calling `readMap()` sixty
 * times a second to ask a question whose answer changes once a level.
 *
 * **Built once per level, not per frame.** A 68x45 level is 3060 tiles, and at
 * the top zoom bucket baking it into an offscreen canvas would be a 3264x2160
 * backing store rebuilt six times over. The paths -- six of them top-down, and
 * under iso five plus up to `bandCount` band pairs -- cost a few thousand
 * segments once between them, and after that a fill is a fill. Banding does not
 * add a segment: it distributes the same ones across more objects.
 *
 * `revision` is `map_revision()`, which the module bumps only when the tiles
 * change; `vis` is `vis_revision()`, which it bumps when the character crosses a
 * tile and on a new level. `art` and `fog` are the flags this was baked under,
 * because both of them change what lands in which path, and `proj` is the matrix
 * it was baked under, which changes the shape of every tile in it. Anything else
 * -- a tick, a click, a slider -- leaves this alone.
 *
 * `bbox` is the arena's ground box in the pixels these paths are stated in, baked
 * here for the same reason the lattice is: it is pure geometry off `arena`,
 * `scale` and `PROJ`, and this is already the function that re-runs when any of
 * the three moves. `drawLevel` clamps its two full-arena fills against it and the
 * vignette is centred on it, so both of them stop needing to know that the arena
 * used to be an axis-aligned rectangle starting at the origin.
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
  furniture: -1,
  scale: 0,
  art: null,
  fog: null,
  proj: null,
  floorLit: null,
  floorSeen: null,
  wallLit: null,
  wallSeen: null,
  wallTopSeen: null,
  wallSideSeen: null,
  wallBandTop: null,
  wallBandSide: null,
  doorLit: null,
  doorSeen: null,
  doorTopSeen: null,
  doorSideSeen: null,
  doorBandTop: null,
  doorBandSide: null,
  doorTop: null,
  doorSide: null,
  torchLit: null,
  torchSeen: null,
  torchStemSeen: null,
  torchFlameSeen: null,
  torchCoreSeen: null,
  torchBandStem: null,
  torchBandFlame: null,
  torchBandCore: null,
  torchLights: [],
  bandCount: 0,
  bandW: 0,
  bandL: 0,
  bandTile: 0,
  edge: null,
  grid: null,
  bbox: null,
  remembered: false,
};

/** One depth row's `Path2D`, allocated the first time anything lands in it.
 *
 *  Most bands in a carved dungeon have rock in them, but not all -- a room's
 *  interior spans bands with nothing solid on them at all -- and a band nobody
 *  writes to stays `null`, which is what `fillBand` tests rather than filling an
 *  empty path. */
function bandPath(arr, d) {
  let p = arr[d];
  if (p === null) {
    p = new Path2D();
    arr[d] = p;
  }
  return p;
}

/**
 * Rebuilds the level paths. Called when `map_revision()` moves, when
 * `vis_revision()` moves, when the pixel scale changes -- a `Path2D` holds
 * pixels, not world units -- and when the view mode changes what gets baked.
 *
 * The inventory -- which paths there are, which projection leaves which of them
 * null, and why only the lit rock is banded -- is on `levelPaths` above.
 *
 * **The face where rock meets floor is a separate path from the rock itself**,
 * and that is not decoration: the first version stroked every wall tile, which
 * drew a line down every seam between two pieces of rock and turned a solid mass
 * into a brick texture. Rock is one dark shape; only the edge you can actually
 * walk up to catches light. Under iso that lesson is kept by other means -- a
 * block's top face is the lit one and its sides are not, so the mass says where it
 * ends without anything being stroked at all.
 *
 * The visibility bytes are read here rather than passed in, unlike the map. There
 * are **eight** call sites -- `boot`, `restart`, `setViewMode`, and the loop's five
 * invalidation arms (a new level, `vis_revision`, `scale`, the `art`/`fog` flags,
 * and `proj`) -- and exactly one of them, the `vis_revision` arm, has any reason to
 * know that fog exists at all. Reading the buffer at the call sites instead would
 * put that knowledge in all eight, and seven of them would be guessing. `restart`
 * is the one that proves it rather than merely illustrating it: it calls
 * `wasm.init` and then rebuilds directly, so the bytes it would have been holding
 * are the previous floor's and the ones it wants are the ones `init` has just
 * cleared.
 *
 * This said "five call sites" for a long while. The real count was already seven
 * before the isometric conversion started, and `iso-01` made it eight by adding the
 * `proj` arm. The number is worth keeping right because it *is* the scale of the
 * argument -- the reason to hide the read in here grows with every arm added, and a
 * stale count reads as though it had stopped growing.
 */
function rebuildLevelPaths(map, revision) {
  const art = artOn();
  const fog = fogOn();
  // Not read at all with the fog off, where every tile is lit by definition.
  const vis = fog ? readVis() : null;
  // Read in **every** mode, unlike the fog. Doorways are geometry and not a
  // readout: a door is a thing standing in the room whichever way the room is
  // being drawn, so the only thing `art` gets to decide about one is its tone.
  const furniture = readFurniture(map.cols);
  // Which room this is, read once for the whole bake rather than chased through
  // `PROJ` on every one of 3,060 tiles. The branches below are then local boolean
  // tests -- the projection is a decision the bake takes at the top and then only
  // consults, which is also why there is no second copy of the tile loop: one loop
  // that knows about two shapes is a great deal easier to keep honest than two
  // loops that each know about the fog, the exposure test and the dim paths.
  const iso = PROJ.shear;
  const floorLit = new Path2D();
  const floorSeen = new Path2D();
  // Rock, baked one of two ways, and each projection leaves the other's paths
  // null. Top-down it is a flat tile and the pair is `wallLit`/`wallSeen`, exactly
  // as it always was. Under iso it is a block -- a lifted top face and up to two
  // shaded sides -- and the fog splits each of those in turn, so these two are the
  // *remembered* half of that split. `drawLevel` branches once and reads only its
  // own projection's; filling a path nobody baked is the one thing that would throw
  // here.
  const wallLit = iso ? null : new Path2D();
  const wallSeen = iso ? null : new Path2D();
  const wallTopSeen = iso ? new Path2D() : null;
  const wallSideSeen = iso ? new Path2D() : null;
  // Lit rock, banded by depth row. `d = tx + ty`, so a band is one anti-diagonal
  // of the tile grid, every tile on it shares a north corner at screen y
  // `d * size / 2` -- `projY` depends on `wx + wy` and on nothing else -- and
  // `bandCount` is the number of distinct values `tx + ty` can take.
  //
  // **The lit pair and only the lit pair**, for the argument on `levelPaths`
  // above: the bands exist to interleave with bodies, and leaving the remembered
  // pair unbanded is a deferral with an artefact attached rather than a free one.
  // The counterexample and the escalation are both stated there.
  //
  // Two arrays of `null` rather than of paths. A band with no rock on it never
  // allocates, and a band with any lit rock on it allocates both -- so a band
  // whose every block is interior gets an empty `side` path that fills nothing.
  // That is one wasted object per such band per bake, against a `wallBlock`
  // signature that would otherwise have to learn about nulls.
  const bandCount = iso ? map.cols + map.rows - 1 : 0;
  const wallBandTop = iso ? new Array(bandCount).fill(null) : null;
  const wallBandSide = iso ? new Array(bandCount).fill(null) : null;
  // Doorways, in the same four shapes the rock takes and interleaved with it at
  // the same depths -- a shut door is a block on its tile's own band, and an open
  // one is two jambs on it. A separate set of paths and not a separate set of
  // bands: `fillBand` gains two lookups and up to two fills, and the depth walk
  // does not gain an entry to sort.
  const doorLit = iso ? null : new Path2D();
  const doorSeen = iso ? null : new Path2D();
  const doorTopSeen = iso ? new Path2D() : null;
  const doorSideSeen = iso ? new Path2D() : null;
  const doorBandTop = iso ? new Array(bandCount).fill(null) : null;
  const doorBandSide = iso ? new Array(bandCount).fill(null) : null;
  // Torches: a flat pair top-down, and under iso a remembered triple and a banded
  // one -- three because a bracket, a flame and the flame's core are three tones,
  // and a fill is one `fillStyle`. **Only with the art on**, unlike the doorways. A
  // doorway is geometry a tactical plan needs; a torch is paint, and `[tactical]`
  // and `[dev]` are the byte-identical A/B control the whole isometric conversion
  // is measured against. So this is the one piece of furniture that is a branch on
  // `art` rather than a tone chosen by it: with the art off nothing is baked, the
  // arrays stay null, and every fill below is skipped rather than drawn in a
  // flatter colour.
  const torchLit = art && !iso ? new Path2D() : null;
  const torchSeen = art && !iso ? new Path2D() : null;
  const torchStemSeen = art && iso ? new Path2D() : null;
  const torchFlameSeen = art && iso ? new Path2D() : null;
  const torchCoreSeen = art && iso ? new Path2D() : null;
  const torchBandStem = art && iso ? new Array(bandCount).fill(null) : null;
  const torchBandFlame = art && iso ? new Array(bandCount).fill(null) : null;
  const torchBandCore = art && iso ? new Array(bandCount).fill(null) : null;
  // The light the torches cast on the floor, one entry a torch. Not a path: a
  // gradient and the point it is centred on, which `drawTorchLight` fills through
  // additively. Built here for the reason `bandW` and `bbox` are -- it is pure
  // geometry off the furniture, `scale` and `PROJ`, and this is already the
  // function that re-runs when any of them moves.
  const torchLights = [];
  // The lit rock faces -- and `null` rather than an empty path with the art off,
  // so `drawLevel` skips the stroke instead of stroking nothing: there is no
  // light in a tactical room for an edge to catch.
  //
  // **`null` under iso as well, and for a happier reason.** The geometry below is
  // built from axis-aligned tile corners, so under a sheared matrix it would
  // stroke squares over diamonds -- but it was never waiting to be re-derived. A
  // rock tile is now flat fills of two different tones, a lit top face and its
  // shaded sides, and the silhouette *is* the seam where they meet: the rim comes
  // back for free and this stroke -- several hundred sub-paths, one per exposed
  // face, stroked every frame -- is simply deleted. The guard at `drawLevel`'s
  // `if (levelPaths.edge)` already handles a null, so nothing else here has to know.
  //
  // **No shipped view mode selects this path, and that is not a reason to delete
  // it.** `art` is true in exactly one `VIEW_MODES` row and that row is the
  // isometric one, so `art && !iso` is identically false, `rim` below is always
  // false, and neither the four `if (rim)` arms nor `drawLevel`'s stroke has run
  // since `iso-02`. What this is, is the **supported-but-unselected**
  // configuration: top-down with the art on, which is what `[world]` was before
  // the conversion. `drawCharacter`'s flat-art arm is its sibling and is unreachable
  // for the identical reason -- as is `headOf`'s result, computed for every body and
  // read only in that arm -- and both are kept on the same terms. A top-down art
  // mode is one row in `VIEW_MODES` away, and the code that would draw it is
  // correct, tested by having shipped, and cheaper to keep than to re-derive.
  //
  // Worth being explicit because the mirror cell is treated differently and
  // loudly: `assertProjection` asserts on `upright && !art`, which no arm handles
  // at all. This cell has an arm; it just has no row. The check there is about a
  // hole, and this note is about a door nobody is currently walking through.
  const edge = art && !iso ? new Path2D() : null;
  // Top-down: the side of a tile square. Iso: the ground diamond's half-width,
  // and also its full height. `diamond` has the derivation.
  const size = px(map.tile);
  // A block's vertical edge in pixels, read once for the same reason `size` is.
  // Nothing top-down has a height, and nothing there reads it.
  const L = lift(WALL_H);
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
  // Whether this tile is a doorway, open or shut. **The tile buffer cannot
  // answer this**: `write_map` publishes `u8::from(solid)`, so a shut door
  // arrives as a `1` indistinguishable from rock and an open one as a `0`
  // indistinguishable from the floor it was cut into. That is the whole reason
  // the furniture buffer exists.
  //
  // Off a `Map` built once per read of that buffer rather than by walking the
  // record list per tile: this is asked once for every solid tile on the level,
  // and a level is three thousand tiles against fifty door records.
  const doorway = (tx, ty) => furniture.doors.has(ty * map.cols + tx);

  for (let ty = 0; ty < map.rows; ty++) {
    for (let tx = 0; tx < map.cols; tx++) {
      const lit = seen(tx, ty);
      // Never seen goes into no path at all. The page background is already the
      // void, which is exactly the right picture -- and it is also why nothing
      // below ever has to paint black over anything.
      if (lit === 0) continue;
      // The tile's anchor. Top-down it is the north-*west* corner of a square;
      // under iso it is the north corner of a diamond, which is `projX`/`projY` of
      // world `(tx, ty) * map.tile` with `size` factored out of both -- an integer
      // times `size` either way, so the bake stays two multiplies per tile in both
      // projections and never calls the projection itself.
      const x = iso ? (tx - ty) * size : px(tx * map.tile);
      const y = iso ? ((tx + ty) * size) / 2 : px(ty * map.tile);
      if (!solid(tx, ty)) {
        const p = lit === 2 ? floorLit : floorSeen;
        // Four segments instead of one `rect`, so a 3,060-tile level bakes about
        // 12k of them -- once per revision, and a fill is still a fill afterwards.
        //
        // **No hairline down the seams.** Coincident edges inside a single
        // `Path2D` are rasterised in one coverage pass, which is the same
        // guarantee the `rect` tiling beside it has always relied on; it is not a
        // new promise, only a less obvious one.
        if (iso) diamond(p, x, y, size);
        else p.rect(x, y, size, size);
        if (lit !== 2) remembered = true;
        continue;
      }
      // Rock with a height. **The exposure gate is per *face* here and not per
      // tile**, which is the one rule this projection changes rather than
      // reshapes.
      //
      // The top face is emitted for *every* solid tile the fog has ever shown the
      // player, with no exposure test at all. Lifted diamonds tile the plane
      // exactly as ground diamonds do -- `wallBlock` has the argument -- so
      // all-tops is a continuous plateau at no extra visual cost, whereas keeping
      // the top-down rule would punch a hole in the middle of every rock mass
      // wider than two tiles and each hole would read as a pit.
      //
      // The side faces keep a neighbour test, but only in the two directions a
      // camera at `+x, +y` can see. The `-x` and `-y` halves of the four-way test
      // below are simply not here: those faces are behind their own block in every
      // frame.
      //
      // **That test is still on the floor plan and never on the fog**, for the
      // reason the top-down arm gives below: a face that borders open ground goes
      // on bordering it whether or not anybody is looking.
      //
      // **Known artefact, deliberately left in.** Interior rock the player has
      // *never* seen is `lit === 0` and was dropped at the top of this loop, so it
      // lands in no path at all and leaves a dark patch in the plateau. It is
      // expected to be invisible -- `WALL_TOP` and the page's void gradient are
      // near-identical -- and it is also the honest picture, since unexplored rock
      // is the outside of the level. If it ever reads as a *pit*, the escape hatch
      // is `iso-07` §7: also emit a top face for solid tiles 4-adjacent to a seen
      // one. It is gated on the artefact actually being observed rather than done
      // here, because it leaks fog information -- one tile of rock beyond the
      // boundary is one tile of map the character has not earned.
      //
      // **Lit rock goes into its depth row's band pair and remembered rock into
      // the unbanded pair**, which is the one structural difference `iso-04` made
      // here. `wallBlock` takes its two target paths as arguments precisely so
      // this line can hand it a band instead of a field, and not one character of
      // the geometry below the call knows which it got.
      //
      // **A shut doorway is a block like any other and takes the same call**,
      // into the doorway pair rather than the rock pair so that it can carry a
      // warmer tone and read as worked timber. Nothing about the geometry
      // changes -- `wallBlock` takes its two target paths as arguments for
      // exactly this, and the neighbour tests below stay on the floor plan, so a
      // three-tile doorway is one mass with no seams down the middle of it in
      // precisely the way a three-tile lump of rock is.
      //
      // An *open* doorway never reaches here: it is `OPEN` in the tiles, so it
      // took the floor branch above. Its jambs are baked after this loop.
      if (iso) {
        const d = tx + ty;
        const door = doorway(tx, ty);
        const tops = door ? doorBandTop : wallBandTop;
        const sides = door ? doorBandSide : wallBandSide;
        const top = lit === 2 ? bandPath(tops, d) : door ? doorTopSeen : wallTopSeen;
        const side = lit === 2 ? bandPath(sides, d) : door ? doorSideSeen : wallSideSeen;
        wallBlock(top, side, x, y, size, L, !solid(tx + 1, ty), !solid(tx, ty + 1));
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
        // Flat, and gated on bordering open ground: this is the top-down arm and
        // it is the line it has always been. Height, the two visible side faces
        // and the per-face gate are the iso arm above, and they stop here. The
        // one thing that is new is which of two path pairs it lands in, on the
        // same argument the iso arm makes -- a doorway is a tone, and a tone is a
        // path.
        const door = doorway(tx, ty);
        const wall = lit === 2 ? wallLit : wallSeen;
        (door ? (lit === 2 ? doorLit : doorSeen) : wall).rect(x, y, size, size);
        if (lit !== 2) remembered = true;
      }
    }
  }

  // The frame: two jambs standing in every **open** doorway.
  //
  // Without them a doorway that opens simply stops existing -- the tiles say
  // floor, the bake draws floor, and a wall the player pushed through turns into
  // a hole they cannot remember making. What is left behind is the two posts the
  // door was hung on, which is what a doorway looks like from either side.
  //
  // A loop over the doorways and not over the tiles: fifty records against three
  // thousand tiles, and the geometry is per-*edge* rather than per-tile anyway.
  // The jambs land in the same depth bands the wall blocks do, so rock standing
  // in front of a doorway still occludes it, and in the same door paths a shut
  // door uses, so a doorway is one colour whichever state it is in.
  //
  // **A remembered doorway draws with its *current* open flag, and that is
  // accepted rather than fixed.** The player learns that a door they cannot see
  // has been opened, which is a small wallhack. The alternative is per-tile
  // remembered door state -- a second copy of the furniture buffer, frozen at
  // last sight, invalidated per tile -- for a fact the player can infer anyway
  // from a monster that has started coming. The fog here remembers *geometry*
  // and not *events*, everywhere else too: remembered rock is drawn at whatever
  // the floor plan says today, and a door is the first thing on the floor plan
  // that can change during a level. This is that rule meeting its first
  // exception and keeping the rule.
  for (const [cell, open] of furniture.doors) {
    if (!open) continue;
    const tx = cell % map.cols;
    const ty = (cell / map.cols) | 0;
    const lit = seen(tx, ty);
    // Never seen goes into no path at all, exactly as a tile does.
    if (lit === 0) continue;
    const x = iso ? (tx - ty) * size : px(tx * map.tile);
    const y = iso ? ((tx + ty) * size) / 2 : px(ty * map.tile);
    const d = tx + ty;
    for (const [dx, dy, u0, v0, u1, v1] of JAMB_SIDES) {
      // A post goes where the doorway meets masonry. The second test is what
      // stops a run of three from growing posts *between* its own tiles: a shut
      // doorway is solid, so a neighbour that is another doorway would read as
      // rock here on the frame before it opens.
      if (!solid(tx + dx, ty + dy) || doorway(tx + dx, ty + dy)) continue;
      if (iso) {
        const top = lit === 2 ? bandPath(doorBandTop, d) : doorTopSeen;
        const side = lit === 2 ? bandPath(doorBandSide, d) : doorSideSeen;
        subBlock(top, side, x, y, size, L, u0, v0, u1, v1);
      } else {
        // Top-down a jamb has no height, so it is the same slab drawn flat --
        // two thin marks either side of the gap, which is as much as a plan view
        // of a doorway has ever been.
        const p = lit === 2 ? doorLit : doorSeen;
        p.rect(x + u0 * size, y + v0 * size, (u1 - u0) * size, (v1 - v0) * size);
      }
      if (lit !== 2) remembered = true;
    }
  }

  // The torches: a bracket, a flame and the flame's core on the face of a wall
  // tile, and the pool of light each one throws on the floor in front of it.
  //
  // A loop over the records and not over the tiles, exactly as the jambs are, and
  // for a stronger reason: fifty torches against three thousand tiles, and the
  // tile buffer cannot answer "is there a torch here" at all -- rock is rock to
  // `write_map`, and which piece of rock is a room's wall is a question only the
  // generator has ever been able to answer.
  //
  // **A torch is on the wall, so it is baked into the wall's own depth bands.**
  // It is not a ground decal: it is mounted on a vertical face at height, and if
  // it is to be occluded by the rock standing in front of it then it has to be
  // filled at that rock's depth. Putting it on its own tile's band gets that for
  // nothing -- no new depth-list entry, nothing more to sort -- because it is on
  // the same anti-diagonal as the block it hangs on and is therefore covered by
  // exactly what covers that block.
  //
  // **A remembered torch draws dimmed and casts no light**, which is `world-07`
  // §4 and is most of why the light list is built here rather than at draw time.
  // Lighting a room you cannot currently see is a wallhack: the falloff would
  // spill through a doorway and tell the player the shape of a room they have not
  // walked into. The rule is one line -- only `lit === 2` puts an entry in
  // `torchLights` -- and it holds because this bake re-runs whenever the fog
  // moves.
  //
  // **The whole loop is skipped with the art off**, which is the one place a
  // piece of furniture is a branch rather than a tone. See the path declarations
  // above for why, and `world-07`'s acceptance test 4 for what it buys: `[G]` to
  // Tactical is identical to before this session, to the pixel.
  // The pool's screen radius, read once for the same reason `size` and `L` are.
  const far = px(TORCH_LIGHT);
  for (const torch of art ? furniture.torches : NO_TORCHES) {
    const { tx, ty, face } = torch;
    const lit = seen(tx, ty);
    if (lit === 0) continue;
    const x = iso ? (tx - ty) * size : px(tx * map.tile);
    const y = iso ? ((tx + ty) * size) / 2 : px(ty * map.tile);
    if (iso) {
      const d = tx + ty;
      const stem = lit === 2 ? bandPath(torchBandStem, d) : torchStemSeen;
      const flame = lit === 2 ? bandPath(torchBandFlame, d) : torchFlameSeen;
      const core = lit === 2 ? bandPath(torchBandCore, d) : torchCoreSeen;
      facePoly(stem, x, y, size, L, face, TORCH_BRACKET);
      facePoly(flame, x, y, size, L, face, TORCH_FLAME);
      facePoly(core, x, y, size, L, face, TORCH_CORE);
    } else {
      // Top-down a wall face has no image on the glass, so the torch is a mark
      // *on the seam* the face would be: a short bar along the tile edge it hangs
      // from. This is the supported-but-unselected top-down-with-art
      // configuration that `edge` above has the long note about, and it is kept
      // on the same terms.
      const p = lit === 2 ? torchLit : torchSeen;
      const near = size * (1 - TORCH_MARK);
      const long = size * (1 - 2 * TORCH_MARK);
      const off = size * TORCH_MARK;
      if (face === TORCH_POS_Y) p.rect(x + off, y + near, long, size * TORCH_MARK);
      else p.rect(x + near, y + off, size * TORCH_MARK, long);
    }
    if (lit !== 2) {
      remembered = true;
      continue;
    }
    // The pool, on the floor at the foot of the face the torch hangs on: the
    // `+x` face is the plane `wx = tx + 1` and the `+y` face `wy = ty + 1`, and
    // the light is centred on the middle of whichever it is. **Not lifted by the
    // torch's own height** -- what is being drawn is where the light lands, and
    // the brightest floor is the floor directly under the flame.
    const wx = (face === TORCH_POS_X ? tx + 1 : tx + 0.5) * map.tile;
    const wy = (face === TORCH_POS_Y ? ty + 1 : ty + 0.5) * map.tile;
    const lx = projX(wx, wy);
    const ly = projY(wx, wy);
    const glow = ctx.createRadialGradient(lx, ly, 0, lx, ly, far);
    for (const [stop, colour] of TORCH_STOPS) glow.addColorStop(stop, colour);
    // A phase off the tile so no two torches in a room pulse together, which is
    // the one thing that would make the flicker read as a global brightness
    // wobble rather than as fire. Integer arithmetic on the tile, so it is stable
    // across a rebake and a torch does not jump phase when the character crosses
    // a tile.
    torchLights.push({ x: lx, y: ly, far, glow, phase: ((tx * 7 + ty * 13) % 32) / 32 });
  }

  // The scale bar's lattice, baked with everything else rather than rebuilt from
  // scratch twice a frame. It is pure geometry off `arena` and `scale`, and this
  // is already the function that is re-run when either moves -- a `Path2D` holds
  // pixels, so the `levelPaths.scale` check in `loop` is exactly the invalidator
  // it needs, and a level whose size changed came with a new `map_revision`.
  //
  // Baking it does not change *which* clip it is stroked under: `drawLevel`
  // still strokes it once inside each pass, for the reason stated there.
  //
  // **The lattice means the same thing in both projections and the loops below say
  // so**: same spacing, same two families, one line every `TILE_WORLD` units along
  // each world axis. What changes is only where a world line lands on the glass. A
  // line at world `x = c` runs from `(c, 0)` to `(c, arena.y)`, and under a sheared
  // matrix that is a diagonal from one wall to another rather than a vertical from
  // one edge to the other -- so the iso arm is `projX`/`projY` of the two ends and
  // nothing else. The result is two families of parallels at +/-26.57 degrees, which
  // is not merely tolerable but *better*: an isometric scale bar that runs along
  // the tile grid's own directions is one you can actually count tiles down.
  //
  // The `Math.round(...) + 0.5` half-pixel snap is dropped under iso, and only
  // there. It exists to put a 1px vertical or horizontal stroke on a device pixel
  // centre instead of straddling two, and a 26.57-degree line straddles two
  // everywhere along its length whatever you round its endpoints to. The lattice
  // comes out a hair softer; at `rgba(150,180,230,0.055)` nobody will find it.
  const grid = new Path2D();
  const gw = px(arena.x);
  const gh = px(arena.y);
  for (let x = TILE_WORLD; x < arena.x; x += TILE_WORLD) {
    if (iso) {
      grid.moveTo(projX(x, 0), projY(x, 0));
      grid.lineTo(projX(x, arena.y), projY(x, arena.y));
    } else {
      grid.moveTo(Math.round(px(x)) + 0.5, 0);
      grid.lineTo(Math.round(px(x)) + 0.5, gh);
    }
  }
  for (let y = TILE_WORLD; y < arena.y; y += TILE_WORLD) {
    if (iso) {
      grid.moveTo(projX(0, y), projY(0, y));
      grid.lineTo(projX(arena.x, y), projY(arena.x, y));
    } else {
      grid.moveTo(0, Math.round(px(y)) + 0.5);
      grid.lineTo(gw, Math.round(px(y)) + 0.5);
    }
  }

  levelPaths = {
    revision,
    vis: vis ? vis.revision : wasm.vis_revision(),
    furniture: furniture.revision,
    scale,
    art,
    fog,
    proj: PROJ.id,
    floorLit,
    floorSeen,
    wallLit,
    wallSeen,
    wallTopSeen,
    wallSideSeen,
    wallBandTop,
    wallBandSide,
    doorLit,
    doorSeen,
    doorTopSeen,
    doorSideSeen,
    doorBandTop,
    doorBandSide,
    // **The one thing `art` decides about a doorway**, baked here rather than
    // branched on at every fill: a door draws in every mode, and with the art off
    // it drops the warmth and keeps the separation. Top-down there is no second
    // face, so the first of the two is the tone the whole flat tile takes.
    doorTop: art ? DOOR_TOP : DOOR_TOP_FLAT,
    doorSide: art ? DOOR_XFACE : DOOR_XFACE_FLAT,
    torchLit,
    torchSeen,
    torchStemSeen,
    torchFlameSeen,
    torchCoreSeen,
    torchBandStem,
    torchBandFlame,
    torchBandCore,
    torchLights,
    bandCount,
    // The band's screen pitch, the block height the bands were baked at, and the
    // band's world span. Zero top-down, where nothing reads any of them -- see
    // `levelPaths` for what each one is for.
    bandW: iso ? size : 0,
    bandL: iso ? L : 0,
    bandTile: iso ? map.tile : 0,
    edge,
    grid,
    // A fresh object rather than the hoisted `ARENA_BOX`, and the exception proves
    // that rule rather than breaking it: this runs on a revision change, a zoom or
    // a mode switch, never on a frame, and handing out a reference to the object
    // `cameraTarget` overwrites sixty times a second is how a baked value stops
    // being baked.
    bbox: groundBox({ x0: 0, y0: 0, x1: 0, y1: 0 }),
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
 * is keyed on the arena's own screen box -- `levelPaths.bbox` -- and on nothing
 * else. Built around the *viewport* instead it would slide across the floor as the
 * camera panned, and a light that follows the eye is the one thing a room's
 * lighting must never do. The box moves only on a resize, a zoom or a projection
 * change, so this is rebuilt on those and on no other frame; it used to be
 * constructed twice per frame, once inside each pass of the loop below.
 *
 * It used to be keyed on `(px(arena.x), px(arena.y))`, which said the same thing
 * back when the arena's screen box was that rectangle with a corner at the origin.
 * Under iso it is a rhombus starting at `x = -arena.y * scale`, so the box is
 * passed rather than re-derived -- and **the box's centre is still the room's
 * centre**, which is what lets the paragraph above stand unedited. One line of
 * proof: the room's middle is world `(A/2, B/2)`, and
 * `projX(A/2, B/2) = (A - B) * scale / 2 = (x0 + x1) / 2`,
 * `projY(A/2, B/2) = (A + B) * scale / 4 = (y0 + y1) / 2`. Both hold trivially
 * top-down as well, where the box is `{0, 0, A*scale, B*scale}`.
 *
 * The ground box and not `arenaBox()`, deliberately: the camera box has `y0`
 * pushed up by a wall's height, and centring the room's light half a wall north of
 * the room is exactly the kind of quarter-truth that reads as "the lighting is
 * slightly off" and takes an afternoon to name.
 *
 * **The gradient is circular and the fill squashes it**, which is the answer to a
 * question this comment used to leave open: a round falloff over a 2:1 box was
 * costed at three lines and deferred pending whether anybody noticed. Pushing the
 * rim from 0.62 to 0.80 is what settled it, because the asymmetry scales with the
 * darkness. The arithmetic, once, since the direction is the opposite of the one
 * people guess: the room is a diamond inscribed in this box, one corner on each
 * edge, and the box is exactly 2:1 whatever the room's proportions are -- `projX`
 * spans `A + B` and `projY` half of it. So the east and west corners sit about
 * `w/2` from the centre and the north and south ones about `h/2 = w/4`, against an
 * outer radius of `0.62w` and an inner of `0.08w`: a circle reaches 78% of its
 * falloff at the east corner and 33% at the north one. (Exactly `w/2` and `w/4` on
 * a square room; 9.01 and 4.61 against 9 and 4.5 on a 10x8, which is the shape the
 * generator actually makes.) **East and west go nearly black while north and south
 * stay legible**, on a room that is symmetric about both. The squash puts all four
 * at the same fraction.
 *
 * It is done at the fill and not here, because a gradient object has no aspect to
 * give it -- see the call in `drawLevel`, which carries the same un-squash algebra
 * `drawLantern` derives at length and for the same reason.
 */
let vignette = null;
let vignetteX0 = 0;
let vignetteY0 = 0;
let vignetteX1 = 0;
let vignetteY1 = 0;

function arenaVignette(bb) {
  if (
    vignette &&
    vignetteX0 === bb.x0 &&
    vignetteY0 === bb.y0 &&
    vignetteX1 === bb.x1 &&
    vignetteY1 === bb.y1
  ) {
    return vignette;
  }
  const w = bb.x1 - bb.x0;
  const h = bb.y1 - bb.y0;
  const cx = (bb.x0 + bb.x1) / 2;
  const cy = (bb.y0 + bb.y1) / 2;
  const built = ctx.createRadialGradient(cx, cy, Math.min(w, h) * 0.16, cx, cy, Math.max(w, h) * 0.62);
  // `PAL.void` as an rgba triple, and a rim at 0.80 rather than 0.62. The
  // concept's frame edge is *gone*, not dim, and 0.62 left the corners of the
  // room legible from across it -- which is the same picture as an evenly lit
  // room with a filter over it. The middle stop moves with the rim so the knee
  // stays where it was rather than the whole curve steepening at the end.
  built.addColorStop(0, "rgba(11,10,8,0)");
  built.addColorStop(0.6, "rgba(11,10,8,0.28)");
  built.addColorStop(1, "rgba(11,10,8,0.80)");
  vignette = built;
  vignetteX0 = bb.x0;
  vignetteY0 = bb.y0;
  vignetteX1 = bb.x1;
  vignetteY1 = bb.y1;
  return built;
}

/** The two passes, hoisted so the loop below is not iterating a fresh array
 *  sixty times a second. Remembered ground first, then lit. */
const LEVEL_PASSES = [false, true];

/** The room's palette, and the whole of it.
 *
 *  Named rather than inline because the concept's look is a *relationship*
 *  between these tones -- rock lighter than distant floor, flame brighter than
 *  anything, blood the only saturation -- and a relationship that is spelled out
 *  at fifteen call sites is a relationship that drifts.
 *
 *  **Every entry here is read by something**, and that is the property that keeps
 *  this object a relationship rather than a list of colours somebody liked. The one
 *  exception is `rockLip`, which is marked as reserved on its own line; an entry
 *  that is neither read nor marked is a swatch and belongs deleted. `stoneLo` and
 *  `stoneHi` are the pair that most wants checking, because they are not drawn
 *  directly -- `bakeFloorTile` walks from one to the other and they are exactly its
 *  two ends, derived rather than transcribed. */
const PAL = {
  void:       "#0b0a08", // never-seen, and the page's own background
  mortar:     "#100d0a", // what every seam shows through to
  stoneLo:    "#241e14", // darkest flagstone; `bakeFloorTile` is where it is realised
  stoneHi:    "#2e281e", // brightest flagstone, same
  rockSide:   "#1e1a14", // a block's +x / +y faces
  rockTop:    "#3a342c", // a block's lit top face
  rockLip:    "#57503f", // the lit edge of a course -- reserved, unread until `art-07` courses the walls
  timberTop:  "#5a3d1c", // a door, lit face
  timberSide: "#33220f",
  iron:       "#2a1d10", // a torch bracket
  flame:      "#e8842c",
  flameCore:  "#fff0c4",
  bone:       "#c9bfa8", // highlights and any text on the canvas
  boneDim:    "#8c8474",
  blood:      "#7a1010",
  bloodHot:   "#c0392b",
  cold:       "#3d4f5c", // portal and magic, and nothing else
};

/** A `PAL` hex as `[r, g, b]`.
 *
 *  `PAL` is hexes because `fillStyle` takes a string, but two kinds of call site
 *  cannot use one: anything that wants a tone at an alpha needs `rgba(r,g,b,a)`,
 *  and `bakeFloorTile` needs to do arithmetic between two of them. Both used to
 *  keep hand-typed copies of the channels and one of them had already drifted off
 *  its hex -- see `drawGlobe`'s rim -- which is the entire argument for parsing the
 *  string instead of trusting a comment to keep two spellings in step.
 *
 *  Called at module scope and inside the floor bake, both of which happen a handful
 *  of times in the life of the page. It parses a string; it does not belong on a
 *  frame's path. */
function palRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** A block of rock, under iso, as two flat tones.
 *
 *  Both sit above `PAL.mortar`, which is what a seam in the floor shows through
 *  to: that is `(16,13,10)`, the side face is `(30,26,20)` about twice it and the
 *  top is `(58,52,44)`, about twice that again. The mass therefore reads lighter
 *  than the dark between the stones, which is the right direction -- rock with a
 *  top face catching the room's light is not the same thing as a hole in the floor
 *  plan. The gap between the two tones is `(28,26,24)`, which is **brightness with
 *  the hue held still**, and that gap is the entire cue that says "height" at this
 *  resolution.
 *
 *  **The contrast used to be carried by the blue channel and is now carried by
 *  brightness alone**, which is the one thing to know before retuning any of this.
 *  Top and side were `(22,28,40)` and `(14,19,28)`, a gap of `(8,9,12)` where the
 *  twelve was blue doing most of the work; the room was blue bordering on
 *  monochrome and that was the channel with room to move in it. It is umber now,
 *  the three channels stay in a fixed ratio through every tone in `PAL`, and what
 *  separates two surfaces is how much light each is getting. Reaching for a
 *  channel here is how the room goes back to being cold.
 *
 *  **The top face is not darker than the lit floor, and under iso it does not have
 *  to be.** This comment used to claim both tones sat well under any lit floor tile
 *  beside them; that was never measured against the stone. `bakeFloorTile` fills
 *  `rgb(tone+16, tone+10, tone)` with `tone` uniform on `20..30`, so the flagstones
 *  run from `(36,30,20)` to `(46,40,30)` about a mean of `(41,35,25)` -- `WALL_TOP`
 *  now sits clear *above* that range where it used to land inside it, and
 *  `WALL_XFACE` sits just under the darkest stone. The two faces therefore bracket
 *  the floor instead of straddling it, which is a better read than the palette this
 *  replaced managed and was not the reason for the retone. And past roughly 60% of
 *  the vignette's radius the lit floor is darker than the rock standing beside it,
 *  because the falloff paints on the floor and not on the rock.
 *
 *  The premise changed, not the arithmetic. Top-down you see only the top of
 *  everything, so **tone is the only cue** there is: floor and rock are two flat
 *  fills in the same plane, and the rock had to be darker than the darkest floor or
 *  the floor plan stopped being readable at all. That is what `#0c1017` is for and
 *  it is still correct in the branch that uses it. Under iso a block has height, a
 *  silhouette and two shaded faces, so the distinction is carried by *shape*, and
 *  the top face is then free to catch light -- which is the whole reason it is a
 *  separate tone from the sides rather than the same one lifted.
 *
 *  So rock is *brighter* than distant floor, deliberately. A lit surface facing the
 *  room's light, standing over ground the lantern no longer reaches, is the
 *  ordinary isometric read and not a regression to be tuned back out. What it does
 *  cost is recorded as `iso-07` §9: the falloff stops at the rock line, so the
 *  plateau is lit identically at every distance.
 *
 *  **One side colour and one `side` path**, so the `+x` and `+y` faces are the
 *  same tone. Giving the `+y` face a third, darker tone (`#090d14`) is `iso-07`
 *  §2 and it is gated on the blocks actually reading flat, because it costs a
 *  third baked path here and a third fill per depth band in `iso-04`.
 *
 *  These are fills and there is deliberately no stroke among them. The silhouette
 *  of a block is exactly where the two tones meet each other and the floor, so the
 *  rim that `edge` used to stroke comes back for free -- see `rebuildLevelPaths`,
 *  which is where the stroke stopped being baked. */
const WALL_TOP = PAL.rockTop; // catches what light the room has
const WALL_XFACE = PAL.rockSide; // the +x face, half lit

/** A doorway, in the same two tones a block of rock takes and for the same two
 *  faces -- so a shut door is a block, an open one is a pair of jambs, and both
 *  are recognisably the same material.
 *
 *  **Brighter and more saturated than everything around them, and no longer a
 *  different hue at all.** The old argument here was that the room was blue
 *  bordering on monochrome, so a warm tone was the loudest thing the palette could
 *  say without raising a voice -- `(59,44,29)` against a `(22,28,40)` wall top was
 *  a hue flip *and* most of a doubling of brightness, and it cost nothing to say.
 *  **That argument died with the blue.** Against `PAL.rockTop` at `(58,52,44)` the
 *  same timber is the same family at the same brightness, and a shut door would be
 *  indistinguishable from a wall block from across the room.
 *
 *  **Every number below is relative luminance**, `0.2126R + 0.7152G + 0.0722B` --
 *  the metric `TORCH_IRON` sixty lines down names and computes twice, and the one
 *  this comment is held to. It previously quoted a lift measured on the red channel
 *  alone in the same sentence as a margin measured on luminance, which flattered
 *  the first number by a third and hid what follows.
 *
 *  **Brightness is the thing that got worse, and saying so is the point of this
 *  paragraph.** `(90,61,28)` is 64.8 against the rock top's 52.7: a lift of
 *  **1.23x**. The pair this replaced was 46.1 on a 27.6 wall top, which is
 *  **1.67x**. Door-against-rock contrast therefore *fell by about a quarter* under
 *  a retone whose stated purpose was to buy the door its read back. What survives
 *  intact is the margin over the floor: the door clears the brightest flagstone
 *  (`(46,40,30)`, 40.6) by 24.2 and clears the rock top by 12.1, so the gap to the
 *  ground is exactly twice the gap to the masonry.
 *
 *  **So what actually carries the door now is chroma, not brightness.** The rock
 *  spans fourteen levels from its reddest channel to its bluest and the timber
 *  spans sixty-two -- four times over -- so at four pixels the door is the
 *  only thing in the masonry with any colour in it at all. That is the one axis
 *  that got wider, and it is wide because everything around it is deliberately
 *  empty on it. A room whose materials all hold one warm ratio leaves exactly one
 *  free channel, and the door is what it is being spent on.
 *
 *  **If acceptance test 3 fails on a real screen** -- "a shut door is findable from
 *  across a dark room" -- the knob is `PAL.timberTop`, moved with `PAL.timberSide`
 *  behind it so the face ratio below survives. Getting back to 1.67x wants roughly
 *  `(122,83,38)`, which is luminance 88. **The bound is `PAL.flame` at 147**: a door
 *  may not climb far enough to read as a light, because "flame is brighter than
 *  anything" is one of the three claims `PAL` exists to make. Do not reach for hue
 *  instead -- that is the channel this palette emptied on purpose, and DESIGN.md's
 *  "Art direction" is where it says so.
 *
 *  The pair keeps rock's own relationship between its two faces -- top brighter,
 *  `+x` face a shade over half of it, 0.56 here against rock's 0.50 on that same
 *  luminance -- so the height cue reads identically on both materials.
 *
 *  Timber rather than iron because timber is the warm one, and because a door
 *  that reads as metal reads as *locked*, which is a rule this game does not
 *  have. */
const DOOR_TOP = PAL.timberTop;
const DOOR_XFACE = PAL.timberSide;

/** The same pair with the art off.
 *
 *  Doors are geometry and draw in every view -- `[tactical]` and `[dev]` are the
 *  byte-identical A/B control for the whole isometric conversion, and a doorway
 *  the control cannot show is a doorway you cannot check the conversion against.
 *  What the tactical modes drop is the *warmth*, not the door: these are a plain
 *  step up from `#0c1017`, the one flat tone top-down rock has, so the doorway
 *  separates from the masonry without pretending there is a light in the room. */
const DOOR_TOP_FLAT = "#1f2230";
const DOOR_XFACE_FLAT = "#161a26";

/** A torch: dark iron, fire, and the hotter middle of the fire.
 *
 *  **The two steps are what make a torch readable at five pixels, and they are
 *  wider than they used to be because they are now carrying the whole read.**
 *  When the room was blue, a torch was three warm marks on a cold wall and the hue
 *  alone said "fire"; umber took that away, so the brightness ladder has to do it
 *  unaided. `(42,29,16)` under `(232,132,44)` under `(255,240,196)`, mounted on a
 *  wall face of `(30,26,20)`. On relative luminance those are 31, 147 and 240: the
 *  bracket-to-flame step went from 3.3x to **4.8x** and the flame-to-core step from
 *  1.57x to **1.63x**, which is the whole of what the retone did here. The second
 *  step is the difference between a shape that is burning and a shape that is
 *  painted orange, and it is small on purpose -- a core that clears the flame by as
 *  much as the flame clears the bracket reads as two flames.
 *
 *  **The rule this comment used to state was never satisfied by its own numbers,
 *  and is recorded here rather than quietly dropped.** It said the bracket must be
 *  darker than the flame by more than the flame is brighter than the wall, which
 *  reduces to "the bracket is darker than the wall"; at `(58,42,26)` on a
 *  `(14,19,28)` face it was two and a half times brighter, so the inequality it
 *  asserted was off by a quarter. It is off by 4% now -- 116 against 121 -- which
 *  is as close as this palette gets while the bracket is still iron rather than a
 *  hole. **What that costs is the bracket's own silhouette:** at 31 against a wall
 *  face of 26 the fixture is nearly the tone of the stone it is bolted to, where it
 *  used to be 2.4x it. That is accepted rather than overlooked. The thing that has
 *  to be found from across a room is the *light*, and a fixture that is a shade off
 *  the wall is what a real bracket looks like; if a torch ever stops reading as a
 *  fixture at all, the answer is `PAL.iron` going darker than `PAL.rockSide` --
 *  which finally makes the sentence above true -- and not a warmer bracket, because
 *  warm is what the flame is for.
 *
 *  The core is deliberately the brightest flat fill in the file -- brighter than
 *  the hero's own skin. It is the only thing in the room that is supposed to *be*
 *  a light rather than lit by one, and `arenaVignette` does not reach it, because
 *  the bands are filled after `drawLevel` has returned. So a torch across a dark
 *  room stays the brightest thing on the screen at any distance, which is exactly
 *  the read `world-07` asks for: the room is lit *from* something. */
const TORCH_IRON = PAL.iron;
const TORCH_FLAME_TONE = PAL.flame;
const TORCH_CORE_TONE = PAL.flameCore;

/** World units the pool of light on the floor reaches.
 *
 *  Five, which is most of the way across a room (6-10 by 5-8) without being all
 *  of it -- so a torch lights the wall it is on and the floor in front of it, and
 *  two torches on one wall overlap in the middle. The overlap is the case the
 *  additive blend below exists for and it wants to be the *common* case, not a
 *  corner one. */
const TORCH_LIGHT = 5;

/** The falloff, as gradient stops.
 *
 *  **Read under `lighter`, so these are additions and not covers.** A stop of
 *  `rgba(255,176,92,0.26)` adds `(66,46,24)` to whatever is under it and falls to
 *  nothing at the rim. Against the flagstones, which run `(36,30,20)` to
 *  `(46,40,30)` about a mean of `(41,35,25)`, that lands a lit pool at `(107,81,49)`
 *  -- about 2.35x the stone it is painted on, summed over the channels.
 *
 *  **The stops did not move when the room did, and the arithmetic is why.** The
 *  floor got brighter by roughly a tenth and the addition is fixed, so the same
 *  stop is a tenth less of a lift than it was; that is a smaller loss than it
 *  sounds, because it is the *ratio* that moved and not the pool. What did change
 *  is the argument. This used to say the hue was doing the work -- that the palette
 *  was blue bordering on monochrome, so warmth read as light long before brightness
 *  did. **The floor is warm now, so that is gone**, and the pool separates on two
 *  things instead: it is 2.35x as bright, and it is *more saturated* than the stone
 *  under it, `(107,81,49)` spanning 58 levels where `(41,35,25)` spans 16. Adding a
 *  warm light to a warm floor still saturates it, which is the property that
 *  survived the retone.
 *
 *  If a pool ever stops reading as *lit* in the room, the first stop is the knob.
 *  **Do not raise it past the point where the pool's rim goes hard** -- that is
 *  what the second stop at `0.45` is holding back, and a hard rim reads as a decal
 *  rather than as light.
 *
 *  Hoisted rather than written inside the bake, because the bake builds one
 *  gradient per torch per rebuild and a fresh array of arrays each time would be
 *  the only allocation in it that was not the gradient itself. */
const TORCH_STOPS = [
  [0, "rgba(255,176,92,0.26)"],
  [0.45, "rgba(255,150,70,0.10)"],
  [1, "rgba(255,140,60,0)"],
];

/** How much of the light a flicker takes away at its lowest, and how fast.
 *
 *  A tenth, at a shade over one cycle a second, with a phase per torch. Small on
 *  purpose: a flame that visibly pulses reads as a broken shader, and what is
 *  wanted is only that the room is not perfectly still. **It cannot move the fog
 *  boundary** -- that is `floorLit`, the clip this is painted through, and it is
 *  the sim's answer rather than something the page animates. */
const TORCH_FLICKER = 0.1;
const TORCH_FLICKER_HZ = 1.1;

/**
 * The level, as lit stone standing in the dark.
 *
 * The space the flagstone pattern is laid in is unchanged -- the origin is still
 * world `(0, 0)`, so the stones stay nailed to the level rather than swimming
 * under the camera, and **clipping to a smaller region therefore moves the fog
 * boundary and leaves the masonry exactly where it was**. What changed is only
 * *where* it is painted: through the floor paths rather than over a rectangle.
 *
 * The pattern's own matrix now carries the projection as well as the zoom, which
 * changes the shape of a course and not its anchor -- `e` and `f` stay zero, so
 * every sentence above is still true word for word under iso. `floorPatternNow`
 * has the derivation.
 *
 * Painted back to front: remembered floor, lit floor, remembered rock, and then
 * top-down the lit rock and the lit edges as well, with the lantern over the top
 * of all of it. **Under iso the lit rock is not here at all** -- it is banded by
 * depth row and filled by `walkDrawList`, after every flat ground decal, so that
 * a wall can occlude what stands behind it.
 *
 * `origin` is `render`'s, passed rather than re-derived: it is what says which
 * corner of the arena the window is currently over, and re-deriving it here
 * would be a second copy of the camera transform -- the mistake `pointerToWorld`
 * has a paragraph about.
 */
function drawLevel(state, now, origin) {
  if (!levelPaths.floorLit) return;
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
  //
  // **The bounds are the baked box and no longer `[0, px(arena.x)]`.** Under iso
  // the arena's screen box is a rhombus's bounding rect starting at
  // `x = -arena.y * scale`, and a clamp to zero would have chopped the entire
  // western half of the room out of both composites -- the pattern fill and the
  // vignette -- leaving a hard vertical line down the middle of the floor.
  //
  // The correctness argument above survives the change intact, and it is worth
  // saying why rather than re-deriving it. It rests on two facts and neither one
  // is about the projection: `clamp` is monotone, and the interval is the same at
  // both ends. `-origin.x` is a *screen-space translation* of a box already stated
  // in screen pixels -- the projection was applied when the box was baked, once,
  // and what happens here is a subtraction. Subtracting a constant is monotone, so
  // `near <= far` still implies `clamp(near) <= clamp(far)`, so the rect still
  // cannot invert. A sheared matrix would have broken this argument if it were
  // applied *here*; it is not, and the top-level CTM stays translate-only for
  // exactly this family of reasons.
  const bb = levelPaths.bbox;
  const clipX = clamp(-origin.x, bb.x0, bb.x1);
  const clipY = clamp(-origin.y, bb.y0, bb.y1);
  const clipW = clamp(-origin.x + viewport.w, bb.x0, bb.x1) - clipX;
  const clipH = clamp(-origin.y + viewport.h, bb.y0, bb.y1) - clipY;

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
    // **The pass is a `CLIP_PUSH` carrying its own alpha**, which is the `save`,
    // the `clip` and the `globalAlpha` of the three lines it replaces, in one
    // item. The fog keeps its authority exactly where it had it: which region a
    // pass is clipped to and at what alpha is decided here, out of the bake, and
    // the backend only obeys. Nothing downstream can reveal a tile `floorLit`
    // does not contain, because the region is not a thing the backend chooses.
    dlClip(dlPaintFrame(lit ? levelPaths.floorLit : levelPaths.floorSeen), lit ? 1 : SEEN_ALPHA);
    if (pattern) dlPatternRect(clipX, clipY, clipW, clipH, dlPaintFrame(pattern));
    else dlRect(clipX, clipY, clipW, clipH, "#141a26");

    // The torches, on the floor they light, and **inside this pass rather than
    // after the loop**. Two things fall out of that placement and both are load
    // bearing:
    //
    // - It is under this pass's own `clip(floorLit)`, which is the clip
    //   `drawLantern` uses and for the same reason: light lands on floor the
    //   character can see and nowhere else.
    // - It is before the vignette below, so the room's edges still fall away over
    //   the top of it. Painted after the loop instead, the torches would sit on
    //   top of the falloff and every room would be evenly lit again, which is the
    //   picture this session exists to replace.
    //
    // **The lit pass only**, which is `world-07` §4's fog rule for free: a torch
    // in a remembered-but-unseen tile is not in `torchLights` at all, so it casts
    // nothing. Even if it were, this pass is the one at `globalAlpha = 1`.
    if (lit) drawTorchLight(now, origin);

    if (art) {
      // Lit from the middle. Without this the stone reads as a swatch of texture
      // rather than as somewhere with a light in it. Built once and cached --
      // see `arenaVignette` for why it is keyed on the room and not the window.
      //
      // **Squashed 2:1 about the room's centre**, which is where the round
      // gradient becomes an elliptical one. `arenaVignette` has the arithmetic
      // for why a circle over this box is wrong by a factor of two and which
      // corners pay for it; what is here is the transform and the rect it forces.
      //
      // The rect has to be un-squashed or the fill stops short of the bottom of
      // the window, and how short depends on where the camera is -- exactly the
      // bug `drawLantern` documents at length. Same algebra, same two lines: the
      // squash maps user `(u, v)` to `(u, cy + (v - cy) / 2)`, so the rect whose
      // *image* is `[clipY, clipY + clipH]` starts at `2 * clipY - cy` and is
      // twice as tall. `x` is untouched by a `scale(1, k)` between two
      // translates, so `clipX` and `clipW` do not move.
      const cy = (bb.y0 + bb.y1) / 2;
      let vy = clipY;
      let vh = clipH;
      if (PROJ.shear) {
        dlXform(1, 0, 0, 0.5, 0, cy, 0, 1, -1);
        dlTranslateBare(0, -cy);
        vy = 2 * clipY - cy;
        vh = clipH * 2;
      } else {
        dlXform(1, 0, 0, 1, 0, 0, 0, 1, -1);
      }
      // A `LIGHT`, and it takes light away rather than adding it -- see the kind.
      // It inherits the pass alpha from the clip above, which is what dims the
      // whole remembered pass and the vignette over it together.
      dlLight(clipX, vy, clipW, vh, dlPaintFrame(arenaVignette(bb)));
      dlXformEnd();
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
    dlPath(dlPaintFrame(levelPaths.grid), DL_STROKE, "rgba(150,180,230,0.055)", DL_NO_PAINT, 1, 0, 0);
    dlClipEnd();
  }

  // The rock. **Top-down it is one dark mass, clearly darker than the lit floor
  // beside it**, with light only on the faces you can walk up to -- see
  // `rebuildLevelPaths` for why the two are separate paths. **Under iso it is a lit
  // top face standing over shaded sides, and it is not darker than the floor at
  // all**; `WALL_TOP` carries that argument in full, and the short version is that
  // height and silhouette do the separating there, so the top is free to catch the
  // room's light. Remembered rock is dimmed on the same terms the remembered floor
  // is in both arms, so the fog boundary crosses stone and rock at once.
  //
  // **Under iso there is no edge stroke at all, and that is the point rather than
  // an omission.** Top-down, rock is one flat tone, so the only way to say where a
  // mass ends is to draw a line there -- a separate path of several hundred
  // sub-paths, one per exposed face, stroked every frame. Under iso a block is a lit
  // top face and a shaded side face, and the silhouette is exactly where those two
  // tones meet each other and the floor. The rim is implied by the fills, so the
  // conversion *deletes* that stroke instead of porting it, and the measurements say
  // strokes are the scarce resource here while fills are effectively free.
  //
  // **How much it was worth is not known**, and this comment used to call it "the
  // second-largest stroke on the page", which nothing measured. "Performance notes"
  // ranks no strokes: the one attribution it records is `drawVision` at 80% of all
  // *dashing*, and `edge` is undashed, so it never appeared in that accounting at
  // all -- and the same section concludes that a large solid arc costs nothing.
  // What is known is the count and the cadence: several hundred sub-paths, every
  // frame, now zero. Deleting work whose price was never taken is still the right
  // direction; claiming a rank for it was not.
  //
  // **Which baseline that is cheaper than matters, and it is not the previous
  // commit.** `edge` was set to null under iso in `iso-02`, not here, so the stroke
  // had already gone before this branch existed. Measured against `iso-02` this
  // session only *adds* work under iso: a top face for every seen solid tile rather
  // than only the exposed ones, two side quads per boundary tile, and four fills a
  // frame where there were two. The claim worth making is about the projections and
  // not about the commits -- an isometric room is cheaper than the top-down room it
  // replaces, which is not the direction anybody expects a projection change to
  // move the frame -- and fills being free is the reason adding these ones is still
  // expected to come out flat rather than worse. A `render` mean that does not fall
  // against `iso-02` is therefore not a regression to chase.
  //
  // **Under iso this draws the remembered rock and nothing else.** The lit blocks
  // moved into the depth walk in `iso-04` -- `walkDrawList` fills them one band at
  // a time, interleaved with the bodies standing among them -- and what is left
  // here is the unbanded remembered pair. That it stays in the ground layer is a
  // deferral with a stated artefact and not a free choice; `levelPaths` has the
  // counterexample, the bound and the escalation.
  //
  // **The lantern is not unaffected by that move, and an earlier draft of this
  // comment said it was.** The argument it made was that `drawLantern` below clips
  // to `levelPaths.floorLit` and so has never put a pixel on rock. A clip is a
  // *screen-space* region, not a set of world tiles, and under iso those are not
  // the same thing: a block's top face is its ground diamond raised by
  // `L = lift(WALL_H)`, which is 1.6 times the height of the diamond it stands on,
  // so it overhangs the floor diamonds behind it. Take a block whose ground north
  // corner is at screen `yn` and the floor tile at `(tx - 1, ty - 1)`, which
  // projects to the same screen column: the top face spans
  // `[yn - 1.6*size, yn - 0.6*size]` and that floor diamond spans `[yn - size, yn]`,
  // so 0.4 of a `size` of lit rock sat inside the lantern's clip and was darkened by
  // it. Top-down the claim is genuinely true -- square tiles, disjoint regions --
  // which is exactly why it reads as safe.
  //
  // So there **is** an iso-only visual change in this session beyond the occlusion
  // itself: lit rock used to be partly darkened at range and now is not darkened at
  // all, because the bands are filled after `drawLevel` has returned. **The new
  // picture is the more consistent one**, and that is the argument for leaving it.
  // What was lost was never lighting. It was a sliver whose size and position came
  // out of which floor diamond happened to lie behind which block, so two identical
  // blocks the same distance from the lantern were shaded differently according to
  // whether the ground behind them was lit -- an accident of geometry wearing a
  // falloff's clothes. The plateau is now uniformly lit at every distance, which is
  // what the note above the `drawLantern` call already says the room's two falloffs
  // do. Whether the falloff *should* reach the rock at all is a real question and it
  // is already open, with its options and their costs, as `iso-07` §9.
  //
  // **Of the pair of overlaps this comment used to record, the move fixed one.**
  // All-tops-then-all-sides paints two blocks in path order rather than in depth
  // order wherever they overlap on screen, which can only happen between tiles
  // whose `tx - ty` differ by at most one and whose `tx + ty` differ by two or
  // more -- diagonal-only neighbours. The **within-class** case, two lit blocks
  // disagreeing by twelve counts of blue out of 255, is the one that is gone:
  // inside a band `tx - ty` steps by two, so no two lit blocks land in one fill
  // where they can overlap, and the bands themselves go down in depth order.
  //
  // The **across-class** case is untouched, and it is worth being blunt that the
  // move did not help it. That one is a lit top face painting over the side face
  // of a *nearer* remembered block -- a full `SEEN_ALPHA` step, alpha 0.4 giving
  // way to 1.0, rather than twelve counts -- and it is reachable whenever the
  // character can see past a corner to rock standing beyond ground it only
  // remembers. Banding lit rock cannot reach it, because the case is
  // lit-against-remembered by definition; if anything the move made it
  // *structural*, since all remembered rock is now filled here and all lit rock in
  // the depth walk afterwards, so the losing order is guaranteed rather than an
  // accident of four fills. It goes when the remembered pair is banded too, which
  // is the same deferral `levelPaths` argues and the same escalation, `iso-07` §6.
  //
  // The within-class case also survives among remembered blocks by themselves,
  // which are still one unbanded tops-then-sides pass. Both faces are at alpha 0.4
  // over the void there, so the whole disagreement is twelve counts on the dimmest
  // thing on the page.
  //
  // **Fill what was baked**, not what is live. Every path below came out of
  // `rebuildLevelPaths`, which records the matrix it used as `levelPaths.proj`, so
  // this branch has to choose the arm that bake chose -- `levelPaths.bbox` is read
  // off the bake a few lines above for exactly the same reason. The two agree on
  // every frame that exists today; the loop's `levelPaths.proj !== PROJ.id` guard is
  // what catches them coming apart, and it runs before this does.
  //
  // A missed invalidation used to be one frame of square tiles under a sheared
  // matrix. The iso arm would instead reach for paths a top-down bake left null,
  // and `ctx.fill(null)` throws a `TypeError` -- and `loop` re-arms rAF *before*
  // it calls `render`, so that is not one bad frame but every frame, forever, with
  // the whole HUD block below the throw skipped each time. Reading the bake turns
  // that back into something survivable.
  //
  // **"One frame stale" is no longer symmetric, and this comment used to say it
  // was.** A top-down bake under an iso `PROJ` still is: the arm below draws every
  // rock tile, lit and remembered, as flat squares in a sheared room, and
  // `walkDrawList` adds nothing because `bandCount` is zero on a top-down bake.
  // The other direction lost that. An iso bake under a top-down `PROJ` takes the
  // arm above, which is now the remembered pair alone -- and `render` gates the
  // depth walk on `PROJ.upright`, so nothing fills the bands either. **Every lit
  // block on the level is missing for that frame**, where before this session it
  // was drawn in the wrong shape. Still not reachable, and by the same guard: the
  // loop's `levelPaths.proj !== PROJ.id` arm rebuilds before `render` is called.
  //
  // `floorPatternNow` above is deliberately left reading the live `PROJ`: the worst
  // a mismatch does there is shear the masonry wrongly for a frame, which is a
  // slightly wrong picture and not a dead page.
  //
  // **The doorways are filled after the rock in both arms**, on the same argument
  // `fillBand` makes about the order inside a band: a door is set into a wall, so
  // where the two overlap on screen the door should win. They are dimmed by the
  // same `SEEN_ALPHA` the rock is -- a remembered doorway is remembered geometry
  // and there is nothing special about it -- and the tone they take is the one the
  // bake chose, which is where `artOn()` was consulted.
  //
  // **The torches are last of all, and they are `null` with the art off.** A
  // remembered torch is a torch drawn dimmed and casting no light -- the sprite
  // stays because the fog here remembers geometry, and the light goes because
  // lighting a room you cannot see is a wallhack. Both halves are already decided
  // by the time this runs: the dimming is this pass's `SEEN_ALPHA`, and the light
  // is absent because the bake only put lit torches in `torchLights`.
  //
  // **The `save` moves inside the branch**, because the two arms want different
  // things from it: the iso one sets `SEEN_ALPHA` once and lets seven fills
  // inherit it, so the alpha rides on the push; the top-down one assigns it
  // between fills, so there it rides on the items. Both are the transcription
  // rule stated on `DL_F_ALPHA`, and the pair is the clearest example of it in
  // the file.
  if (levelPaths.proj === "iso") {
    dlXform(1, 0, 0, 1, 0, 0, 0, 1, SEEN_ALPHA);
    dlPath(dlPaintFrame(levelPaths.wallTopSeen), DL_FILL, WALL_TOP, DL_NO_PAINT, 0, 0, 0);
    dlPath(dlPaintFrame(levelPaths.wallSideSeen), DL_FILL, WALL_XFACE, DL_NO_PAINT, 0, 0, 0);
    dlPath(dlPaintFrame(levelPaths.doorTopSeen), DL_FILL, levelPaths.doorTop, DL_NO_PAINT, 0, 0, 0);
    dlPath(dlPaintFrame(levelPaths.doorSideSeen), DL_FILL, levelPaths.doorSide, DL_NO_PAINT, 0, 0, 0);
    if (levelPaths.torchStemSeen) {
      dlPath(dlPaintFrame(levelPaths.torchStemSeen), DL_FILL, TORCH_IRON, DL_NO_PAINT, 0, 0, 0);
      dlPath(dlPaintFrame(levelPaths.torchFlameSeen), DL_FILL, TORCH_FLAME_TONE, DL_NO_PAINT, 0, 0, 0);
      dlPath(dlPaintFrame(levelPaths.torchCoreSeen), DL_FILL, TORCH_CORE_TONE, DL_NO_PAINT, 0, 0, 0);
    }
  } else {
    dlXform(1, 0, 0, 1, 0, 0, 0, 1, -1);
    // **Top-down rock, and deliberately no longer the same six characters as the
    // floor's mortar.** These two literals were identical up to `art-01` and it
    // was a coincidence rather than a relationship: this is the flat modes' single
    // rock tone, the one cue there is when floor and rock are two fills in the same
    // plane, and `bakeFloorTile`'s seam is a shadow between two lit stones. The
    // retone moved the mortar to `PAL.mortar` and left this alone, because
    // `[tactical]` and `[dev]` are the byte-identical A/B control and nothing
    // reachable with the art off may move. Anybody unifying them is repainting the
    // control.
    dlAlpha(SEEN_ALPHA);
    dlPath(dlPaintFrame(levelPaths.wallSeen), DL_FILL, "#0c1017", DL_NO_PAINT, 0, 0, 0);
    dlAlpha(1);
    dlPath(dlPaintFrame(levelPaths.wallLit), DL_FILL, "#0c1017", DL_NO_PAINT, 0, 0, 0);
    // Top-down a doorway is one flat tone, exactly as rock is, so both passes
    // take the first of the bake's two colours.
    dlAlpha(SEEN_ALPHA);
    dlPath(dlPaintFrame(levelPaths.doorSeen), DL_FILL, levelPaths.doorTop, DL_NO_PAINT, 0, 0, 0);
    dlAlpha(1);
    dlPath(dlPaintFrame(levelPaths.doorLit), DL_FILL, levelPaths.doorTop, DL_NO_PAINT, 0, 0, 0);
    if (levelPaths.torchLit) {
      // Top-down there is no wall face and no depth walk, so both halves of a
      // torch are one mark on the tile seam and both passes fill it here.
      dlAlpha(SEEN_ALPHA);
      dlPath(dlPaintFrame(levelPaths.torchSeen), DL_FILL, TORCH_FLAME_TONE, DL_NO_PAINT, 0, 0, 0);
      dlAlpha(1);
      dlPath(dlPaintFrame(levelPaths.torchLit), DL_FILL, TORCH_FLAME_TONE, DL_NO_PAINT, 0, 0, 0);
    }
    if (levelPaths.edge) {
      // No alpha of its own: it inherits the `1` the fill above it stated, which
      // is what the line it replaces did with the ambient `globalAlpha`.
      dlPath(dlPaintFrame(levelPaths.edge), DL_STROKE | DL_CAP_SQUARE, "rgba(150,185,235,0.20)", DL_NO_PAINT, 1.5, 0, 0);
    }
  }
  dlXformEnd();

  // Last, so that top-down it also takes the outer half of the edge stroke down
  // with it at range: a lit rock face at the far edge of sight should not be the
  // brightest line on screen.
  //
  // **Under iso it does not reach the lit rock at all**, and it is the draw order
  // that says so rather than the clip. The clip is `levelPaths.floorLit`, and the
  // vignette a few lines above is painted inside the floor pass's own clip, but
  // both of those are screen-space regions and a raised top face overhangs the
  // floor diamonds behind it -- the rock pass above works that overlap out. What
  // makes the falloffs miss the rock is the order they are drawn in: the vignette
  // is painted in the floor loop, before any rock exists to darken, and every lit
  // block is filled after this call returns, by `walkDrawList`. The one seam left
  // is a *remembered* block's top face where it overhangs lit floor, which this
  // fill does still catch -- two fills at `SEEN_ALPHA` over the void, dimmed twice
  // on the dimmest thing on the page, and inside the same open question below.
  // So the room's lighting stops at the rock line: the plateau is lit uniformly at
  // every distance, however far from the lantern it stands. Top-down that was
  // invisible, because rock was darker than any floor and there was nothing there
  // for a falloff to darken. Under iso the top face catches light, so it is now
  // visible -- a known limitation, recorded with its options and their costs as
  // `iso-07` §9, and not something to patch by clipping this fill differently.
  drawLantern(state, clipX, clipY, clipW, clipH);
}

/**
 * The pools of light the torches throw on the floor.
 *
 * **The first thing in this file that adds light rather than taking it away**, and
 * the only `globalCompositeOperation` in `web/` that is not `source-over`. There is
 * one other site and it is `drawGrain`, which sets the default *back* rather than
 * inheriting it, and says why on the line.
 *
 * Both existing falloffs are *darkening* overlays: `arenaVignette` paints `PAL.void`
 * over the floor at up to 0.80 and `drawLantern` paints the older `rgba(9,11,16,a)`
 * at 0.55, so the room is lit by not being darkened. (The lantern kept the cold
 * literal through `art-01` because it draws in every view and `[tactical]` and
 * `[dev]` must not move by a byte. Be honest about the size of that: the two
 * near-blacks are `(9,11,16)` and `PAL.void`'s `(11,10,8)`, **eight levels of blue
 * apart**, so about 4.4 levels where the gradient reaches its 0.55 and less
 * everywhere inside it -- not the one level this comment used to claim. Small, and
 * paid over **the largest cold surface the retone left in the room**: the falloff
 * covers all the lit floor out to sight range, every frame, in the one view whose
 * whole subject is that the room is umber. Warming it means either a per-view
 * literal here or two control modes that move, and this session chose the cold
 * floor over either.) A torch is the opposite: it has to paint the floor brighter
 * than the floor, which a wash over the top cannot do at any alpha.
 *
 * `lighter` also composes correctly where two pools overlap, which is the common
 * case in a room with three torches on one wall and the case a plain alpha wash
 * gets visibly wrong -- two overlapping washes at 0.26 come out darker than one,
 * because each is blending toward its own colour rather than adding to what is
 * under it.
 *
 * **Called from inside `drawLevel`'s lit pass**, under that pass's own
 * `clip(floorLit)` and at its `globalAlpha = 1`, and before the vignette. See the
 * call for why each of those three matters.
 *
 * Everything expensive is baked. Each entry carries its gradient, built once per
 * level bake by `rebuildLevelPaths` -- so a frame is a cull, a `save`, a
 * transform and a `fillRect` per *visible* torch, and the level's other hundred
 * cost a comparison each.
 *
 * **Squashed 2:1 about each torch, exactly as `drawLantern` is**, so a pool of
 * light lies on the floor like everything else on it rather than standing up out
 * of the plane. The rect is un-squashed by the same algebra `drawLantern` derives
 * at length: the transform maps `v -> y + (v - y) / 2`, so a box of `2 * far`
 * about the centre paints a `far`-tall ellipse's worth of pixels. It is per torch
 * and not once for the loop because the squash is *about the torch* -- one
 * `ctx.scale` cannot be centred on a hundred different points.
 */
function drawTorchLight(now, origin) {
  const lights = levelPaths.torchLights;
  if (lights.length === 0) return;
  // The window, in the same level-corner space the baked centres are stated in.
  // A pool is `far` wide and `far / 2` tall on the glass after the squash, so a
  // box of `far` either side in both axes is a bound rather than an estimate.
  const x0 = -origin.x;
  const y0 = -origin.y;
  const x1 = x0 + viewport.w;
  const y1 = y0 + viewport.h;
  // `DL_ADDITIVE` on the push, which is `ctx.globalCompositeOperation =
  // "lighter"` inside a `save`: a blend mode is state and belongs where a pop
  // can put it back, or it leaks into the vignette painted after it.
  dlXform(1, 0, 0, 1, 0, 0, 0, 1, -1, DL_ADDITIVE);
  for (const light of lights) {
    const { x, y, far } = light;
    if (x + far < x0 || x - far > x1 || y + far < y0 || y - far > y1) continue;
    // A shade of flicker, out of phase per torch. `now` is the wall clock, like
    // every other presentational animation here, so it keeps its cadence when the
    // sim is paused or catching up.
    const flicker =
      1 - TORCH_FLICKER * (0.5 + 0.5 * Math.sin(now * 0.001 * TAU * TORCH_FLICKER_HZ + light.phase * TAU));
    // `translate(x, y); scale(1, 0.5); translate(-x, -y)` in the two items that
    // spell it: a push carrying the first translate and the **non-uniform**
    // linear part, then a bare translate back inside it. The squash cannot ride
    // on `DL_F_SCALE`, which is uniform by construction because every scale in
    // the depth layer is -- a body that scaled unevenly would be a body whose
    // line widths stopped being line widths -- so a 2:1 squash is a matrix.
    if (PROJ.shear) {
      dlXform(1, 0, 0, 0.5, x, y, 0, 1, flicker);
      dlTranslateBare(-x, -y);
    } else {
      dlXform(1, 0, 0, 1, 0, 0, 0, 1, flicker);
    }
    dlLight(x - far, y - far, far * 2, far * 2, dlPaintFrame(light.glow));
    dlXformEnd();
  }
  dlXformEnd();
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
 *
 * **The rect is the viewport and not the arena**, on exactly the argument
 * `drawLevel` makes about its own two fills, and it matters more here than it
 * does there: this one is a gradient, so every pixel of it is an interpolation
 * and a blend rather than a copy. At zoom 1 the arena is 4124x2749 CSS pixels
 * against a 1728x945 viewport -- **seven times the area, at two device pixels to
 * the CSS pixel, every frame** -- and all of it outside the window was being
 * blended and then thrown away.
 *
 * **That ratio is the top-down one, which is now the weaker of the two.** The
 * measurement was taken before the projection existed and the dimensions are still
 * right, but under iso the ground box is the arena's two axes summed on both
 * components -- about 6873 x 3436 for the same room, since `projX` spans
 * `w + h` and `projY` half of it -- so it is roughly **14.5 times** the same
 * viewport. The argument survives a fortiori: whichever projection is live, the
 * rect that is filled is the window, and the saving is larger under the one the
 * game actually ships.
 *
 * The gradient is still *built* from the hero and
 * the sight radius, in the level's own space, so the falloff lands in exactly the
 * same place on exactly the same pixels; only the rectangle it is painted through
 * shrinks. The clip does not save this on its own: `floorLit` is all the lit
 * floor on the level, not the lit floor on screen.
 *
 * **Squashed 2:1 under iso**, which is `iso-06`'s only change here. Everything
 * else lying on this floor is an ellipse now, and a round falloff among them was
 * the last thing on the ground still shaped like the top-down view. It is the
 * *aspect* that is being matched, not the size: `far` stays `px(sight)`, in the
 * pre-squash space, so the softening keeps the extent it has always had. (A world
 * circle of `sight` projects with semi-major `px(sight) * PROJ.ex`, which is a
 * factor of root two wider than this -- and deliberately not chased, because the
 * paragraph above is the whole point: the lantern is a cosmetic softening of an
 * exact tile-granular fact, not a second visibility model, and making it agree
 * with the vision ring would be making it look like the answer.)
 */
function drawLantern(state, x0, y0, w, h) {
  const hero = state.hero;
  if (!fogOn() || !hero || !(hero.sight > 0)) return;
  const x = projX(hero.x, hero.y);
  const y = projY(hero.x, hero.y);
  const far = px(hero.sight);
  // Built before the clip and before the squash, exactly as it was: no transform
  // is open here, so `dlRadialGradient`'s replay is a no-op and the falloff lands
  // on the same pixels it always has.
  const lamp = dlRadialGradient(
    x, y, far * LANTERN_INNER, x, y, far,
    "rgba(9,11,16,0)",
    "rgba(9,11,16,0.55)"
  );
  dlClip(dlPaintFrame(levelPaths.floorLit));

  // **The rect has to be un-squashed or the fill stops short of the window**, and
  // that is a bug you cannot see from the code: the squash is about the character,
  // so how far short it stops depends on where the character is standing.
  //
  // The squash maps user `(u, v)` to `(u, y + (v - y) / 2)`. Solving that for the
  // rect whose *image* is the one this function was handed:
  //
  //     y + (ry      - y) / 2 = y0      ->  ry = 2 * y0 - y
  //     y + (ry + rh - y) / 2 = y0 + h  ->  rh = 2 * h
  //
  // so the painted region is exactly `[x0, x0 + w] x [y0, y0 + h]`, the same
  // device pixels as before the squash, with no dependence on `scale` or on the
  // camera -- which is what makes "at every zoom, with the camera anywhere" a
  // one-line proof rather than four corner cases. `x` is untouched by a
  // `scale(1, k)` between two translates, so `x0` and `w` do not move.
  //
  // The squash is **bare**, inside the clip's own save rather than in one of its
  // own: that is the single `save`/`restore` pair this function has always had,
  // and `CLIP_PUSH` is now the thing holding it. A bare push emitted inside a
  // clip is unwound by the `CLIP_POP`, which is why `dlClip` goes on the open
  // stack even though a clip does not move the matrix.
  let ry = y0;
  let rh = h;
  if (PROJ.shear) {
    dlXformBare(1, 0, 0, 0.5, x, y, 0, 1);
    dlTranslateBare(-x, -y);
    ry = 2 * y0 - y;
    rh = h * 2;
  }
  dlLight(x0, ry, w, rh, lamp);
  dlClipEnd();
}

/**
 * The way out, which is only ever open.
 *
 * **There is no shut state to draw any more, and that is a deletion worth
 * reading before re-adding one.** This used to paint a dim static ring wherever
 * the level's exit room was, from the moment the floor opened, and the argument
 * was: *"drawn shut as well as open, and that is the design decision rather than
 * a fallback -- seeing where the exit is from the moment you arrive is what
 * turns 'kill things' into 'fight your way there'."* Still a fair description of
 * what that bought. **The user asked for the other trade**: nothing marks the
 * exit while monsters live, and the last kill *is* the exit -- it blooms where
 * the last thing died, already open. The module now reports `PORTAL_NONE` for
 * the whole of the fight and never reports the old `1`, so the guard below is
 * the whole of "draw nothing yet".
 *
 * Aged on the wall clock like everything else presentational in this file.
 */
function drawPortal(state, now) {
  if (!state.portalState) return;
  const r = px(0.9);

  // All three passes -- the glow and the two spinning arcs -- lie on the floor,
  // and every one of them was already written as a screen offset from the
  // portal's anchor, so this is the whole of the conversion.
  pushGroundSpace(state.portalX, state.portalY, 0, 1, -1);

  // Built inside the push, because that is where it was built: the falloff is
  // stated in the portal's own space and the shear is in force when it is made.
  // `dlRadialGradient` replays the open transforms onto the context for exactly
  // this reason -- it is still one `createRadialGradient` a frame, in the same
  // place in the same matrix, and `art-04` §3 (D3) is why it is still per frame.
  const glow = dlRadialGradient(0, 0, 0, 0, 0, r * 1.7, "rgba(110,231,255,0.30)", "rgba(110,231,255,0)");
  dlEllipse(0, 0, r * 1.7, DL_FILL, null, glow, 0, 0, 0);

  // Two arcs turning against each other, which reads as a way through rather
  // than as a marker on the floor.
  //
  // **The spin eases under iso, and that is correct -- do not "fix" it.** `sweep`
  // is an angle in the *pre-shear* space, so once it is sheared the arc's ends no
  // longer sweep the screen at a uniform rate: fastest across the wide axis of the
  // ellipse, slowest across the compressed one. That is what a ring spinning flat
  // on the ground looks like from this angle, and making it uniform on screen
  // would be making it spin about an axis the floor does not have.
  const spin = now / 900;
  for (let i = 0; i < 2; i++) {
    const sweep = spin * (i ? -1 : 1);
    dlArc(
      0, 0, r * (i ? 0.62 : 1), sweep, sweep + TAU * 0.62,
      DL_STROKE | DL_CAP_ROUND,
      i ? "rgba(110,231,255,0.55)" : "rgba(180,245,255,0.85)",
      i ? 2 : 3
    );
  }
  dlXformEnd();
}

/** Where the character has been. **Not `groundSpace`, and verified rather than
 *  converted in `iso-06`:** an affine map takes a line to a line, so projecting
 *  each endpoint puts the segment exactly where the shear would have, and leaves
 *  the *width* isotropic instead of stretching it with the bearing. A trail is a
 *  hint drawn on the floor rather than a thing measured on it, so the one that
 *  keeps a constant weight is the right one. Same argument as `drawRoute`'s two
 *  polylines. */
function drawTrail() {
  if (trail.length < 2) return;
  // The cap and the join were one `ctx.lineCap` and one `ctx.lineJoin` above the
  // loop, inside a `save` that existed to scope them; a stroke carries both now,
  // so the scope has nothing left to hold.
  for (let i = 1; i < trail.length; i++) {
    const t = i / trail.length;
    dlPolyBegin();
    dlPoint(projX(trail[i - 1].x, trail[i - 1].y), projY(trail[i - 1].x, trail[i - 1].y));
    dlPoint(projX(trail[i].x, trail[i].y), projY(trail[i].x, trail[i].y));
    dlPolyEnd(
      DL_CAP_ROUND | DL_JOIN_ROUND,
      `rgba(110,231,255,${(0.16 * t).toFixed(3)})`,
      1 + 2 * t,
      0, 0
    );
  }
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
  const hx = projX(state.hero.x, state.hero.y);
  const hy = projY(state.hero.x, state.hero.y);

  // The whole plan, hero first, dim and dashed. The dashes crawl toward the far
  // end on the wall clock, which is what carries the *direction* of a path
  // whose legs are otherwise identical lines. `now` and not a tick, like the
  // portal's spin and the destination's beat: this describes an intention
  // rather than a motion, so it goes on crawling while the world is frozen.
  //
  // **The dash is capped now**, which is the one substantive change `iso-06` made
  // in here and is a pre-existing problem rather than an isometric one. The path
  // the module is walking is `ROUTE_MAX` legs of `DRAG_SAMPLE` world units -- some
  // 2,500 screen pixels at default framing, 248 marks -- and that grew with the
  // zoom and with the bearing and with nothing stopping it. **The path under the
  // finger is worse and is the case that matters:** `sampleDrag` thins to
  // `DRAG_SAMPLE` spacing but does not cap the count, so `drag.points` is as long
  // as the player cares to scribble, and `trimPath`'s `ROUTE_MAX` is only applied
  // on the way out in `endDrag`. That is precisely the shape of the bug
  // `MAX_DASH_SEGMENTS` was added to prevent, and this was the last uncapped dash
  // on the page. See `pathDash`.
  //
  // **The cap reaches `[tactical]` and `[dev]` too, and that is deliberate.**
  // `drawRoute` runs above `render`'s projection branch, so this is the one place
  // in the whole conversion where the A/B control does not draw what it drew
  // before: at default framing the cap engages past 960 screen pixels of
  // polyline, which is about nine legs, and a ten-waypoint route that was a fine
  // dotted crawl becomes a coarser dashed one. That is a fair trade and not an
  // oversight. The control exists to isolate what the *projection* changed, and
  // an unbounded dash is a performance hazard the top-down page had all along --
  // fixing it in one mode and not the other would leave the two disagreeing about
  // something that has nothing to do with the projection, which is worse.
  //
  // **The length is measured on the *screen* polyline, and that is the space the
  // cap has to be stated in.** `setLineDash` is a user-space pattern, and the user
  // space this path is built in is screen pixels -- the points are pre-projected
  // and the top-level CTM is translate-only -- so the number of marks the
  // rasteriser cuts is this sum over this period, not a world length over
  // anything. It is accumulated in the loop that is building the path anyway, so
  // it costs one `hypot` per leg and no second walk.
  //
  // **The span is accumulated while the points are being written into the list**,
  // which is the same single walk it always was -- one `hypot` per leg, no second
  // pass -- except that the walk now fills `dlPts` instead of the current path.
  dlPolyBegin();
  dlPoint(hx, hy);
  let lastX = hx;
  let lastY = hy;
  let span = 0;
  for (const p of path) {
    const sx = projX(p.x, p.y);
    const sy = projY(p.x, p.y);
    span += Math.hypot(sx - lastX, sy - lastY);
    dlPoint(sx, sy);
    lastX = sx;
    lastY = sy;
  }
  const dash = pathDash(span, 4, 6);
  // The crawl is quoted in pixels per millisecond and stays that whatever the
  // pattern is; what has to follow the pattern is the *wrap*, which is why the
  // modulus is the period rather than the literal 10. Under the cap the period is
  // `4 + 6` and this is the expression it replaces, to the byte. Over it, a fixed
  // 10 would jump the dashes back by a fraction of a stretched period every 10 px
  // of crawl -- a stutter on the one line whose whole job is to say which way the
  // path runs.
  //
  // It is the only `lineDashOffset` on the page, and it is on the item because
  // the `save` that used to contain it is gone: a dash offset left behind on the
  // context would set somebody else's line crawling.
  dlPolyEnd(
    DL_CAP_ROUND | DL_JOIN_ROUND | DL_DASHED,
    "rgba(110,231,255,0.18)",
    1.4,
    dash[0], dash[1],
    -((now / 55) % (dash[0] + dash[1]))
  );

  // The leg being walked, over the top of that and solid. One leg is the only
  // part of a path the sim has been told about -- the rest is the page holding a
  // queue -- and drawing that difference is what stops a traced route reading
  // as one long ordered march.
  dlPolyBegin();
  dlPoint(hx, hy);
  dlPoint(projX(path[0].x, path[0].y), projY(path[0].x, path[0].y));
  dlPolyEnd(DL_CAP_ROUND | DL_JOIN_ROUND, "rgba(110,231,255,0.28)", 1.8, 0, 0);

  // A bead at every waypoint, and **not at `path[0]` once the module is walking
  // it**: that one *is* the standing order, and `drawDestination` has already
  // put a much louder ring on exactly that spot. Two rings on one point read as
  // two waypoints. Mid-drag nothing has been sent yet, so every bead is the
  // page's to draw.
  //
  // A bead is a mark *on the floor* -- it says "the character will stand here" --
  // so unlike the two polylines above it goes through `groundSpace` and comes out
  // as an ellipse with the same 2:1 aspect as the tile it is sitting on. One
  // push/pop per bead, because `groundSpace` is a matrix and there is no tidy
  // inverse to translate back by. A stroke apiece either way, so the pair is the
  // whole added cost and it is two matrix pushes.
  for (let i = drag ? 0 : 1; i < path.length; i++) {
    pushGroundSpace(path[i].x, path[i].y, 0, 1, -1);
    dlEllipse(0, 0, px(ROUTE_MARK), DL_STROKE | DL_CAP_ROUND | DL_JOIN_ROUND, "rgba(110,231,255,0.22)", DL_NO_PAINT, 1.2, 0, 0);
    dlXformEnd();
  }
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
  const x = projX(state.orderX, state.orderY);
  const y = projY(state.orderX, state.orderY);
  const beat = (Math.sin(now / 380) + 1) / 2;
  const alpha = orderAcknowledged ? 0.4 + 0.35 * beat : 0.16;
  // Clear of the silhouette rather than on it. The mark is drawn *under* the
  // bodies -- see the compositing order in `render` -- so a ring at exactly the
  // quarry's radius would be a line the quarry stands on top of and hides. The
  // 0.45 fallback is a middling body, for the miss the paragraph above argues
  // cannot happen.
  const r = px((quarry ? quarry.radius : 0.45) + 0.2) + (orderAcknowledged ? beat * px(0.12) : 0);

  // The threat colour, and never the destination's cyan. Cyan is spent on this
  // page: the trail, the route, the waypoint beads and the destination ring all
  // mean *a place the character is going*. A lock painted in it would read as
  // one more of those instead of as the answer to "which one?". Taken from
  // `monsterSkin()` rather than written out, so the ring and the body it is drawn
  // around cannot drift apart -- including about which of the two skin tables is
  // live, which is the thing the split made possible to get wrong.
  // The ring is drawn around a body standing on the floor, so it lies on the
  // floor: the same `arc(0, 0, r)` it was, in `groundSpace`, which makes it the
  // ellipse the quarry's own collision ring is. The `[3, 4]` pattern is applied
  // in user space and so keeps its ~50 marks -- and it travels on the item,
  // which is what retired the `setLineDash([])` that used to follow it and the
  // outer `save` that used to scope the style.
  pushGroundSpace(state.orderX, state.orderY, 0, 1, -1);
  dlEllipse(
    0, 0, r,
    DL_STROKE | (orderAcknowledged ? 0 : DL_DASHED),
    `rgba(${monsterSkin().glow},${alpha.toFixed(3)})`,
    DL_NO_PAINT,
    1.8,
    3, 4
  );
  dlXformEnd();

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
  //
  // **Two projected endpoints and not `groundSpace`**, on `drawTrail`'s argument:
  // an affine map takes a line to a line, so the sheared segment and this one are
  // the same segment, and drawing it in screen space keeps the tether one weight
  // whichever way it runs. Which matters more here than it does for a trail --
  // this line is at `alpha * 0.35` and is meant to be findable, not variable.
  dlPolyBegin();
  dlPoint(projX(state.hero.x, state.hero.y), projY(state.hero.x, state.hero.y));
  dlPoint(x, y);
  dlPolyEnd(0, `rgba(${monsterSkin().glow},${(alpha * 0.35).toFixed(3)})`, 1.2, 0, 0);
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
  const beat = (Math.sin(now / 380) + 1) / 2;
  const alpha = orderAcknowledged ? (arrived ? 0.32 : 0.45 + 0.35 * beat) : 0.16;
  const r = px(0.55) + (orderAcknowledged && !arrived ? beat * px(0.18) : 0);

  // **The whole marker goes on the floor, crosshair included.** The ring alone
  // would have left the arms standing up the screen through it, which is the one
  // arrangement that reads as two unrelated marks on one spot. Inside the shear
  // the arms come out along the world axes -- the `+x` pair down-right, the `+y`
  // pair down-left -- so the crosshair lands parallel to the tile grid and says
  // which square the order is on as well as which point. The centre dot goes in
  // with them: it is a 2 px round dot top-down and a 2 px flat one here, and a
  // circle left standing among them would be the only thing in the marker that
  // did not belong to the floor.
  pushGroundSpace(state.orderX, state.orderY, 0, 1, -1);
  const ring = `rgba(110,231,255,${alpha.toFixed(3)})`;
  dlEllipse(0, 0, r, DL_STROKE | (orderAcknowledged ? 0 : DL_DASHED), ring, DL_NO_PAINT, 1.6, 3, 4);

  // The one inline cyan left on the canvas, and **the swap is gated because this
  // marker draws in every view.** `[tactical]` and `[dev]` are the A/B control and
  // must not move by a byte, so the flat modes keep the literal they have always
  // had and only the umber room takes `PAL.cold` -- which is the room's one cold
  // tone, reserved for the portal and the order and nothing else. The ring and the
  // crosshair around it stay as they are in both: at alpha 0.16 to 0.80 they are
  // what says *where*, and `PAL.cold` is a dark tone that would cost a gameplay
  // marker its read on a floor this warm. Two tones in one marker is the honest
  // price of a cold room going brown.
  dlAlpha(alpha);
  dlEllipse(0, 0, 2, DL_FILL, artOn() ? PAL.cold : "#6ee7ff", DL_NO_PAINT, 0, 0, 0);

  // A crosshair, so the exact point is readable at any zoom.
  //
  // **Four disjoint segments in one path and one stroke**, which is what
  // `DL_SEGMENTS` exists for: four items would be four strokes, and the stroke
  // count is the number `art-04` §5.1 makes the seam accountable for. It keeps
  // the ring's own `strokeStyle` and width, exactly as it did when both were
  // ambient state left over from the arc above.
  dlAlpha(alpha * 0.7);
  dlPolyBegin();
  dlPoint(-r - 4, 0);
  dlPoint(-r + 2, 0);
  dlPoint(r - 2, 0);
  dlPoint(r + 4, 0);
  dlPoint(0, -r - 4);
  dlPoint(0, -r + 2);
  dlPoint(0, r - 2);
  dlPoint(0, r + 4);
  dlPolyEnd(DL_SEGMENTS, ring, 1.6, 0, 0);
  dlXformEnd();
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
// **And then the wedge came back, twice**, which is not a contradiction of the
// paragraph above: what retired it was a shape that carried the facing for free,
// and neither of the two bodies that got it back carries one. A `[tactical]` body
// is a plain disc, and an isometric one is a billboard that cannot turn away from
// the camera to show you where its front is. For both, the fan on the ground is
// the only thing on screen saying which way something is pointing -- so both read
// it out of `fan` below, and cannot disagree about it.

/** The wedge tint, hoisted out of the skin because two keys have to hold it and
 *  a `fan` that disagreed with its own `wedge` would be a body whose facing
 *  changed colour with its intent. `glow` keeps its own literal in the readout
 *  pair below: it is the same tint there and it is not the same role.
 *
 *  **Four now, because the skins split**, and the art pair is hoisted on the
 *  identical argument -- `wedge`, `fan` and, there, `glow` as well all have to
 *  hold one string, and the art skins would otherwise write it three times each.
 *  These two are the desaturated ends: `PAL.cold` brightened, and a brick that is
 *  the flame's hue with the fire taken out of it. */
const HERO_WEDGE = "110,231,255";
const MONSTER_WEDGE = "255,138,122";
const HERO_WEDGE_ART = "127,166,189";
const MONSTER_WEDGE_ART = "168,84,66";

/**
 * The facing wedge's fill, baked once per skin.
 *
 * `fan` -- how far open the intent reads -- takes exactly three values, so the
 * whole page has exactly six of these strings and not one of them ever changes.
 * Before this, every wedge built its own: `[tactical]` had always done it, but
 * standing bodies up gave `world` a wedge too, which took `drawCharacter` from
 * one dynamic colour string per body to two -- some 7,700 short-lived strings a
 * second at `MAX_UNITS` and 60 fps, in a render path whose whole discipline is
 * that it allocates nothing. Hoisted for exactly the reason `HERO_THROUGH` is
 * hoisted: *so the frame does not build a string to say it*. `world-01` put that
 * second wedge behind `readoutsOn()` and took the doubling back out again, which
 * retires the measurement and not the table -- the paragraph below is why.
 *
 * The arithmetic stays here rather than being folded to three literals, so the
 * rule is still legible -- a `0.08` floor plus `0.20` of the fan -- and so the
 * strings are the same characters `toFixed(3)` produced at the call sites:
 * `0.080`, `0.180`, `0.280`. `[tactical]` must not move by a byte.
 *
 * Indexed low to high in `fan`, which is low to high in how much of a threat the
 * body is: fleeing, neither, bearing down.
 */
function wedgeFans(rgb) {
  return [0, 0.5, 1].map((fan) => `rgba(${rgb},${(0.08 + 0.20 * fan).toFixed(3)})`);
}

/** The readout skins -- **byte-identical to what they have always been** -- and
 *  the art skins beside them.
 *
 *  Two tables and not one retone, because the two modes want opposite things.
 *  `[tactical]`'s disc is a *diagnostic*: cyan against red at full chroma is the
 *  most separable pair on a dark screen and it should stay that. `[world]`'s body
 *  is a figure in a torchlit room, where full chroma is the one thing the concept
 *  never does -- the faction read there is carried by the rim light's hue at low
 *  alpha and by the ring on the floor, not by the fill.
 *
 *  **The team ring is the one saturation exception and it stays subordinate.**
 *  Both art glows are pulled a long way toward grey: `127,166,189` is `PAL.cold`
 *  brightened, not the readout's `110,231,255`. The concept's rings are thin and
 *  dim and read only because everything around them is brown. If a body's faction
 *  is ever hard to call at a glance the answer is ring alpha on hover and
 *  selection, not chroma on the fill. */
const HERO_SKIN_FLAT = {
  glow: "110,231,255",
  body: ["#bff2ff", "#4fb9d8"],
  // The shaded end of the same hue. A silhouette painted in `body` alone came
  // out so pale that the rim light -- which is the thing carrying the faction
  // read at four pixels a body -- had nothing to be brighter than.
  deep: "#1b566c",
  wedge: HERO_WEDGE,
  fan: wedgeFans(HERO_WEDGE),
  bar: "#6ee7ff",
};

const MONSTER_SKIN_FLAT = {
  glow: "255,138,122",
  body: ["#ffc0b3", "#c04b38"],
  deep: "#67251a",
  wedge: MONSTER_WEDGE,
  fan: wedgeFans(MONSTER_WEDGE),
  bar: "#ff8a7a",
};

const HERO_SKIN_ART = {
  glow: HERO_WEDGE_ART,
  body: ["#8fa8b4", "#38505e"],
  deep: "#141c22",
  wedge: HERO_WEDGE_ART,
  fan: wedgeFans(HERO_WEDGE_ART),
  bar: "#7fa6bd",
};

const MONSTER_SKIN_ART = {
  glow: MONSTER_WEDGE_ART,
  body: ["#a89080", "#5a4032"],
  deep: "#1c1410",
  wedge: MONSTER_WEDGE_ART,
  fan: wedgeFans(MONSTER_WEDGE_ART),
  bar: "#c0705e",
};

/** Which of the six a body wants. **Both wedges read this and neither spells the
 *  ternary out for itself** -- the fan on the floor under an isometric body and
 *  the fan under a `[tactical]` disc exist to agree about what "bearing down"
 *  looks like, and two copies of a three-way choice is how they would stop.
 *  Every intent code that is not one of the two named ones -- including 0, which
 *  is most bodies most of the time -- reads as the middle. */
function wedgeFill(skin, intent) {
  return skin.fan[intent === INTENT_ATTACK ? 2 : intent === INTENT_FLEE ? 0 : 1];
}

/** Which of the four a body wants. **Gated on `artOn()` and not on
 *  `PROJ.upright`**, and this is the one place in the file where that is the right
 *  bit: a skin is what a body is *painted* in, which is the shape question, and
 *  the space question is asked separately inside `drawCharacter`. A top-down art
 *  mode -- the supported-but-unselected configuration `rebuildLevelPaths` argues
 *  for keeping -- would want the umber skins and the flat geometry, and this
 *  returns exactly that.
 *
 *  Every call site that used to write the ternary out for itself now comes through
 *  here, which is what keeps an arrow, a corpse and the body that shot or dropped
 *  it from disagreeing about which table is live. */
function skinOf(unit) {
  const hero = unit.faction === FACTION_HEROES;
  if (!artOn()) return hero ? HERO_SKIN_FLAT : MONSTER_SKIN_FLAT;
  return hero ? HERO_SKIN_ART : MONSTER_SKIN_ART;
}

/** The monster tint on its own, for the two marks that are about a threat rather
 *  than about a body: the lock ring and its tether. `drawLock` takes it from the
 *  skin rather than writing it out so the ring and the body it is drawn around
 *  cannot drift apart, and that argument only survives the split if the mode
 *  question is asked in one place. */
function monsterSkin() {
  return artOn() ? MONSTER_SKIN_ART : MONSTER_SKIN_FLAT;
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
 * million device pixels onto a 6.5 million pixel canvas -- **13.41x the screen in
 * alpha-blended fill, from this function alone** -- and the frame strip reports it
 * as `render 0.83` with the whole cost hiding in `idle`, which is exactly the trap
 * the note at the top of the perf block warns about. (An earlier draft quoted 13.7
 * here. That is the *fps* of the shipped build in the dash table below it, not an
 * overdraw figure at all; `DESIGN.md` records this one as 13.41x, beside
 * `drawLantern` at 1.74x, `drawLevel` at 0.50x and `drawCharacter` -- the obvious
 * suspect, and the wrong one -- at 0.04x.) The discs also stop being readable long
 * before that: the fill was tuned so that six could overlap and the floor stay
 * legible, and sixty-three of them sum to an opaque wash.
 *
 * So the fill is spent only where it says something a ring cannot -- the body you
 * are commanding, and the body you have locked -- and everything else keeps the
 * dashed outline. The edge of sight is what the overlay is *for*, and the ring is
 * still the thing that draws it.
 *
 * **The ring was not free either, and capping the fill did not fix the page.** An
 * earlier draft of this comment called the outline "some four hundred times
 * cheaper", which is true of stroke *coverage* and beside the point: a dashed
 * stroke is cut into one sub-path per mark before any of it is rasterised, and
 * under a fixed `[7, 9]` pixel pattern that count follows the circumference --
 * growing with sight radius and again with zoom. At eight bodies this one function
 * was cutting 3,363 sub-paths a frame, 80% of all the dashing here, and the page
 * ran at 13 fps.
 *
 * So the ring is **solid**, and that is a performance decision before it is a
 * visual one. Measured on a paused room, two rounds: 13.7 fps as shipped, 40.5
 * with the dash count capped at twelve, **53.8 solid**, against a 59.3 ceiling
 * with every stroke in the page suppressed. Skipping these rings entirely scored
 * 52.3 -- the same as drawing them solid -- so a large solid arc costs nothing and
 * the whole bill was the dashing. Capping the count is the wrong lever: the cost
 * is superlinear, five times the marks cost nearly nine times the time, and twelve
 * dashes on a ring this size reads as a dotted line rather than a soft edge.
 *
 * `drawReach` keeps its dash and needs no cap. It was measured fully dashed at
 * 567 segments a frame inside the 52.3 result, because its radius is small -- the
 * cost lives in the product of mark count and radius, not in dashing as such.
 * Which leaves the two rings looking *more* distinct than before, not less: sight
 * is a soft continuous edge, reach is a hard dashed one.
 */
function drawVision(unit, filled) {
  if (!visionVisible || !(unit.sight > 0)) return;
  const skin = skinOf(unit);
  const r = px(unit.sight);
  // **The one place the fill area had to be checked, and it is unchanged.** The
  // measurements this whole function is tuned against -- the **whole page's**
  // blended fill at a full room, 15.69x the screen before the `filled` gate and
  // 2.60x after it, of which this function's own share was 13.41x -- are areas, and
  // `groundSpace` is unimodular, so the disc that was a circle of `r` is now an
  // ellipse of `r*sqrt2` by `r/sqrt2` covering exactly the same pixels. The ring is
  // solid here for the reason above, so there is no mark count to move either; the
  // only thing that changes is the perimeter, up 9%, which is stroke coverage on a
  // 1 px line at alpha 0.09.
  //
  // **This ring and `drawReach`'s are the two that justified `XFORM_PUSH`**, and
  // this one is the solid half of the pair: the 1 px line comes out 0.9 to 1.4 px
  // depending on which way the arc is running, because the shear is in the *CTM*
  // when the stroke is taken and a stroke width is a user-space quantity. An item
  // that carried a pre-projected ellipse and a width would have had to pick one
  // number and would have picked the wrong one everywhere but two bearings. The
  // matrix travels instead, and the anisotropy comes out of the rasteriser exactly
  // as it did when this was a `ctx.transform`.
  pushGroundSpace(unit.x, unit.y, 0, 1, -1);
  if (filled) {
    dlEllipse(0, 0, r, DL_FILL, `rgba(${skin.wedge},0.032)`, DL_NO_PAINT, 0, 0, 0);
  }
  // Down from 0.17, because a continuous line lays down roughly twice the ink the
  // 7-on-9-off pattern did over the same circumference, and this ring has to sit
  // under everything else in the overlay without competing with it.
  //
  // Solid, and it says so: an undashed stroke item makes the backend state
  // `setLineDash(NO_DASH)`, which is the `ctx.setLineDash(NO_DASH)` this line
  // replaces and is there for the same reason -- a ring this size cut into marks
  // is the bug `MAX_DASH_SEGMENTS` exists for, and it cost the page 40 fps once.
  dlEllipse(0, 0, r, DL_STROKE, `rgba(${skin.wedge},0.09)`, DL_NO_PAINT, 1, 0, 0);
  dlXformEnd();
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

/** The empty dash list, hoisted so the strokes that want a solid line are not
 *  handing the allocator a fresh array per body per frame. */
const NO_DASH = [];

/** A ceiling on how many pieces a dashed ring may be cut into. **Not a tuning
 *  knob -- a guard against one specific bug, which has already been paid for
 *  once.**
 *
 *  A dash pattern is cut into one sub-path per mark *before* anything is
 *  rasterised, so a pattern quoted in fixed pixels costs `circumference / period`
 *  -- which grows with the radius and again with zoom, the two directions this
 *  camera actually moves, and is bounded by nothing. `drawVision` hit 3,363 marks
 *  a frame that way and cost the page 40 fps; the note on that function has the
 *  measurements. The cost is in the *product* of mark count and radius, so small
 *  rings are free at any density: `drawReach` was measured at 567 marks a frame
 *  inside a result that was already at the ceiling.
 *
 *  96 is therefore set to leave every dash on the page today exactly as it looks
 *  -- `drawReach` at its measured radius comes to 91 -- and to bite only when a
 *  radius runs away, which is the case nobody notices until the frame rate goes.
 *  A ring that needs to *look* coarser should say so in its own pattern. */
const MAX_DASH_SEGMENTS = 96;

/** An `on`/`off` dash pattern in pixels, stretched only as far as it must be to
 *  keep a ring of `radius` under `MAX_DASH_SEGMENTS` pieces.
 *
 *  Under the ceiling it returns exactly the pattern asked for, so nothing that
 *  fits looks any different. The ratio between mark and gap is preserved, so it
 *  stretches rather than turning into some other dash. */
function arcDash(radius, on, off) {
  const period = on + off;
  const want = (TAU * radius) / MAX_DASH_SEGMENTS;
  if (want <= period) return [on, off];
  const k = want / period;
  return [on * k, off * k];
}

/** `arcDash` for a path whose length is known rather than implied by a radius.
 *  Same contract, same ceiling, and the two are deliberately the same four lines
 *  with `TAU * radius` swapped for `length` -- a circumference *is* a length, and
 *  writing the general one as the special one's sibling is what keeps a future
 *  change to `MAX_DASH_SEGMENTS` from being applied to only half the page.
 *
 *  **`length` must be measured in the space the dash is applied in**, which is the
 *  user space in force at the `stroke`, not the world and not the device. For the
 *  one caller today -- `drawRoute`'s plan polyline -- that is screen pixels,
 *  because its points are pre-projected and the top-level CTM is translate-only.
 *  A caller that built its path inside `groundSpace` would owe the *pre-shear*
 *  length instead, and the two differ by up to root two.
 *
 *  Returns a fresh two-element array, as `arcDash` does. Called once a frame from
 *  one place, against a render path that otherwise allocates nothing per frame;
 *  that is the same order of churn `arcDash` already makes per attacking body and
 *  is well inside what the rule is protecting. */
function pathDash(length, on, off) {
  const period = on + off;
  const want = length / MAX_DASH_SEGMENTS;
  if (want <= period) return [on, off];
  const k = want / period;
  return [on * k, off * k];
}

function drawReach(unit, skin, now) {
  if (unit.intent !== INTENT_ATTACK) return;
  const beat = (Math.sin(now / 260) + 1) / 2;
  const r = px(unit.radius + unit.actionLength);
  // **The mark count does not move, and that is the whole argument for a shear
  // rather than an `ellipse` call.** `setLineDash` is a user-space pattern, the
  // user-space path is still `arc(0, 0, r)`, so the rasteriser cuts the same
  // `TAU * r / 8` sub-paths it cut top-down -- 91 on the measured radius, 567 a
  // frame across the room, inside the 52 fps result `MAX_DASH_SEGMENTS` records.
  // Converting this to an explicit ellipse would have changed that number
  // silently, which is exactly the bug class that cost the page 40 fps.
  //
  // **And that survives the seam for exactly the same reason it survived the
  // shear.** The item carries the pattern as two numbers and the matrix as an
  // `XFORM_PUSH`; the backend states the dash and then strokes a circle, so the
  // cutting still happens in the pre-shear user space and the count is still
  // `TAU * r / period`. An item that pre-flattened the ring to screen space
  // would have changed the number silently all over again -- which is why
  // `art-04` §4 names this function and `drawVision` as the pair that decides
  // whether the kind is right.
  pushGroundSpace(unit.x, unit.y, 0, 1, -1);
  const dash = arcDash(r, 3, 5);
  dlEllipse(
    0, 0, r,
    DL_STROKE | DL_DASHED,
    `rgba(${skin.wedge},${(0.10 + 0.10 * beat).toFixed(3)})`,
    DL_NO_PAINT,
    1.2,
    dash[0], dash[1]
  );
  dlXformEnd();
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
/** What a lifted blade leaves on the floor.
 *
 *  **One tone for all four phases, deliberately.** The phase is carried by the
 *  bright blade at the hand, where the eye is; the shadow's job is to say *where
 *  the hitbox is*, and a shadow that also changed colour would be a second,
 *  fainter, redundant readout competing with the first. Dark rather than dim
 *  faction colour, because it is a shadow and the floor under it is already
 *  warm. Hoisted for `wedgeFans`' reason: so the frame does not build a string
 *  to say it. */
const BLADE_SHADOW = "rgba(0,0,0,0.34)";

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
  const r = px(unit.radius);

  // **Everything below lies on the floor**, and that is a claim about the sim and
  // not about the art: a blade's hitbox is a segment in the world plane at the
  // body's own height, and the guard arc, the declared line and the bow are all
  // quoted in the same world-plane radii. `groundSpace` is exactly the space they
  // were already written in -- screen pixels of top-down world offset from the
  // body -- so under iso every one of them lands on the ground where the sim
  // tests it, and top-down this is the bare `ctx.translate` it replaced.
  //
  // The `rotate(theta)` / `rotate(-theta)` pairs below are left alone, and
  // `art-04` gave them a second reason to be. Canvas composes
  // `CTM * R(theta) * R(-theta)` back to `CTM` whatever `CTM` is, so the shear
  // never made them any less an inverse pair than they were -- and they emit as
  // `DL_BARE` pushes rather than as a push and a pop for the *precision* reason
  // that flag exists: a save and a restore would put the matrix back exactly,
  // where this puts it back to within an ulp, and the session that moved them
  // was gated on drawing the same pixels rather than better ones.
  //
  // `setLineDash` is applied in user space and transformed afterwards, so the
  // declared line's mark count is unchanged -- the property `iso-00` §4 says is
  // the whole reason this is a shear and not an ellipse call. It travels on the
  // item now, which is why the `setLineDash([])` that used to follow the
  // declared line is gone: it was there so the *next* stroke would not inherit
  // the dash, and a stroke that carries its own cannot.
  pushGroundSpace(unit.x, unit.y, 0, 1, -1);

  // A guard, as the wedge of body it is covering -- and **only** if what is in
  // hand actually guards. A tucked one covers nothing and is drawn as nothing,
  // which is honest: `block_leak` scales the arc by extension, so a hand held
  // in really does cover less.
  if (unit.role === ROLE_GUARD && unit.limbReach > 0.2 && unit.swing !== SWING_SWAP) {
    const half = (unit.actionArc * unit.limbReach) / 2;
    dlRotateBare(unit.limbAngle);
    dlArc(
      0, 0, r * 1.55, -half, half,
      DL_FILL | DL_SECTOR,
      `rgba(${skin.wedge},${(0.13 + 0.17 * unit.limbReach).toFixed(3)})`,
      0
    );
    dlArc(
      0, 0, r * 1.55, -half, half,
      DL_STROKE,
      `rgba(${skin.wedge},${(0.45 * unit.limbReach).toFixed(3)})`,
      2
    );
    dlRotateBare(-unit.limbAngle);
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
    // **`swingSpan`, not a literal 30.** This divided by 30 for every action in
    // the game, which is right for a bow and wrong for everything else: a
    // Brute's club telegraphs for 33 ticks and a Punch for 5, so the amber line
    // faded in at a third of the right rate on one and finished fading before
    // the windup was a fifth over on the other. `art-03` put the phase's real
    // length in the frame precisely so this could stop guessing, and
    // `swingProgress` is that read. **The one expression in this session that
    // moves a pixel in `[tactical]` and `[dev]`** -- it and its twin on the bow
    // below, which is the same call. Both move an alpha and nothing else, and
    // putting the literal back makes all eight flat captures byte-identical to
    // the commit before this one, which is how the gate was read.
    const imminent =
      unit.swing === SWING_STRIKE ? 1 : clamp(swingProgress(unit), 0.15, 1);
    const out =
      unit.role === ROLE_SHOOT
        ? px(unit.sight)
        : px(unit.radius + unit.actionLength);
    dlRotateBare(unit.limbLine);
    dlPolyBegin();
    dlPoint(r * 0.6, 0);
    dlPoint(out, 0);
    dlPolyEnd(
      DL_DASHED,
      `rgba(255,176,64,${(0.20 + 0.45 * imminent).toFixed(3)})`,
      Math.max(1, r * 0.12),
      Math.max(3, r * 0.3),
      Math.max(3, r * 0.35)
    );
    dlRotateBare(-unit.limbLine);
  }

  // The blade. Hilt at the body's surface, tip at `radius + length * reach`,
  // which is precisely the segment `World::blade` builds and tests against.
  //
  // Gated on the role, so a guard is never drawn as a stick. That is not
  // cosmetic: the sim refuses a guard a blade hitbox, and a page that drew one
  // anyway would be teaching the player a threat that cannot exist. The gate is
  // `bladeLive` now, in one place, because `drawRig` needs the same answer.
  //
  // **Upright, this is the blade's *shadow* and the blade itself is in the rig.**
  // The sim is 2D and has no opinion about height, so the plan-view position is
  // the truth and the height is a rendering choice -- drawing the blade at hand
  // height changes nothing the sim can measure. What it costs is readability,
  // because the bright thing is no longer where it hits. So the line stays here,
  // dim, exactly where the hitbox is, and `rigEmitBlade` puts the bright one at
  // the hand and sorts it among the segments. `drawShot` is the same structure:
  // a ground shadow under a lifted shaft, and the shadow is the thing that makes
  // the altitude readable at all.
  //
  // Top-down there is no altitude to read, the shadow and the blade would be the
  // same pixels, and `[tactical]` and `[dev]` are the A/B control for the whole
  // conversion -- so that arm is what it has always been, line for line.
  if (bladeLive(unit)) {
    const phase = SWING_SKIN[unit.swing] || SWING_SKIN[SWING_GUARD];
    const heat = clamp(Math.abs(unit.limbSpin) / HOT_SPIN, 0, 1);
    const hilt = r;
    const tip = px(unit.radius + unit.actionLength * unit.limbReach);
    dlRotateBare(unit.limbAngle);
    if (PROJ.upright) {
      dlPolyBegin();
      dlPoint(hilt, 0);
      dlPoint(tip, 0);
      dlPolyEnd(DL_CAP_ROUND, BLADE_SHADOW, Math.max(1.6, r * phase.width), 0, 0);
    } else {
      // A trailing smear opposite the swing, so which way it is travelling is
      // readable at a glance. Only on a live cut: a blade drifting back to guard
      // trails nothing worth watching, and smearing it would make a recovery --
      // the most punishable moment in the game -- look like a threat.
      //
      // The round cap used to be one `ctx.lineCap` covering both strokes; it is
      // per item now, on `drawShot`'s own argument for scoping it that way.
      if (unit.swing === SWING_STRIKE && heat > 0.05) {
        const sweep = Math.sign(unit.limbSpin) * -heat * 0.55;
        dlArc(
          0, 0, (hilt + tip) / 2, 0, sweep,
          DL_STROKE | DL_CAP_ROUND | (sweep > 0 ? DL_CCW : 0),
          `rgba(255,255,255,${(0.16 * heat).toFixed(3)})`,
          Math.max(2, r * 0.5)
        );
      }
      dlPolyBegin();
      dlPoint(hilt, 0);
      dlPoint(tip, 0);
      dlPolyEnd(DL_CAP_ROUND, phase.line, Math.max(1.6, r * phase.width), 0, 0);
    }
    dlRotateBare(-unit.limbAngle);
  }

  // A bow, as a bow. **Never as a stick**: the sim gives a `Role::Shoot` limb no
  // blade hitbox at all, so drawing one would advertise a melee threat that
  // cannot exist -- the same lie the guard gate above exists to prevent. An arc
  // across the bearing says "this thing throws something" without saying "this
  // thing cuts", and it deepens as the draw runs out.
  if (unit.role === ROLE_SHOOT && unit.swing !== SWING_SWAP) {
    const out = px(unit.radius + unit.actionLength);
    // The same literal, the same fix, and it is here rather than left behind
    // because a wrong constant sitting next to its corrected twin is worse than
    // two wrong constants: the next person to read this would take the pair as a
    // deliberate difference. A bow's nominal windup happens to be 30, so this is
    // the one call site the old number was ever close for -- and only on a body
    // of average agility, since `phase_ticks` scales it.
    const drawn = unit.swing === SWING_WINDUP ? clamp(swingProgress(unit), 0.2, 1) : 0.2;
    dlRotateBare(unit.limbAngle);
    dlArc(
      0, 0, out, -0.55, 0.55,
      DL_STROKE,
      unit.swing === SWING_STRIKE
        ? "rgba(255,255,255,1)"
        : `rgba(255,196,92,${(0.35 + 0.5 * drawn).toFixed(3)})`,
      Math.max(1.6, r * 0.2)
    );
    dlRotateBare(-unit.limbAngle);
  }
  dlXformEnd();
}

/** Hit, block and parry markers, straight from the frame.
 *
 *  Three distinguishable things rather than one flash, because "you were hit",
 *  "your shield stopped it" and "your blades crossed" are three different
 *  outcomes and telling them apart is how the swordplay becomes readable. */
function drawMarks(unit) {
  const r = px(unit.radius);

  // Both markers land on the floor with the limb that produced them -- they are
  // drawn at `limbAngle`, off the same world-plane geometry -- so both go through
  // `groundSpace`, which is a bare `ctx.translate` top-down.
  if (unit.blockFlash > 0) {
    pushGroundSpace(unit.x, unit.y, unit.limbAngle, 1, -1);
    const half = Math.max(0.35, (unit.actionArc * unit.limbReach) / 2);
    dlArc(
      0, 0, r * 1.7 + 4 * (1 - unit.blockFlash), -half, half,
      DL_STROKE,
      `rgba(180,220,255,${(0.85 * unit.blockFlash).toFixed(3)})`,
      2.5
    );
    dlXformEnd();
  }

  if (unit.parryFlash > 0) {
    pushGroundSpace(unit.x, unit.y, unit.limbAngle, 1, -1);
    const at = px(unit.radius + unit.actionLength * unit.limbReach);
    const spark = 3 + 7 * (1 - unit.parryFlash);
    // Hoisted out of the loop, where it used to be one `ctx.strokeStyle` over
    // four strokes: four sparks are four items now and each carries its colour,
    // so building the string inside would hand the allocator four copies of it.
    const line = `rgba(255,235,150,${(0.9 * unit.parryFlash).toFixed(3)})`;
    for (const angle of [-0.8, -0.25, 0.25, 0.8]) {
      dlPolyBegin();
      dlPoint(at, 0);
      dlPoint(at + Math.cos(angle) * spark, Math.sin(angle) * spark);
      dlPolyEnd(0, line, 2, 0, 0);
    }
    dlXformEnd();
  }
}

// --------------------------------------------------- silhouettes, from above
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
// **These are the top-down view and they stay that.** `iso-05` added a second
// set below -- `UPRIGHTS`, the same four archetypes from the side -- rather than
// replacing these, because `Tactical` and `Dev` still look straight down and the
// page can cycle between the two with `G`. `drawCharacter`, `drawCorpse` and
// `drawHeroThrough` each pick one, on `PROJ.upright` and never on `artOn()`.
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

/** Where each archetype carries its head, and how big it is -- **one table read
 *  two ways**, because the two projections disagree about what a body's long
 *  axis is and about nothing else.
 *
 *  `r` is the head's radius in body radii in both.
 *
 *  `at` is a **distance along the body**, in body radii, and which body axis
 *  that is depends on which way the body is being looked at. Flat, it is *along
 *  the facing*: how far forward of centre the head sits, seen from directly
 *  above. Upright, it is *up the body*: how far the head's centre rides above
 *  the top of the torso, which is the same statement about the same anatomy
 *  turned ninety degrees, because the axis the head is offset along is the one
 *  the body is longest on and the projection is what decides whether that axis
 *  runs across the floor or up the screen.
 *
 *  The Brute's is small and barely clear of its shoulders and the Skitterer's is
 *  carried out at the end of it. From directly above, that difference is most of
 *  what tells two dark shapes apart; from the side, it is a head sunk in a notch
 *  against a head held clear on a neck, which is the same read. */
const HEADS = {
  [BODY_FIGHTER]: { at: 0.40, r: 0.32 },
  [BODY_ROGUE]: { at: 0.44, r: 0.28 },
  [BODY_BRUTE]: { at: 0.22, r: 0.30 },
  [BODY_SKITTERER]: { at: 0.46, r: 0.22 },
};

/**
 * How tall each archetype stands, in body radii.
 *
 * **A Skitterer is not a short Fighter.** `Body::radius()` gives a Skitterer 0.30
 * and a Fighter 0.45, so scaling one silhouette by radius alone would draw the
 * bug as a small man at four fifths scale; 1.1 radii against 3.0 is what makes it
 * a thing that runs along the floor rather than a thing that walks.
 *
 * **These are ratios, so read the roster before reading them as heights.** The
 * Rogue is the leanest and takes the largest multiplier, but on a 0.35 radius
 * that is 1.12 world units -- the *shortest* of the three uprights, under the
 * Fighter's 1.35. The Brute takes the smallest multiplier and, on a 0.70 radius,
 * still comes out 1.89: the biggest body in the room by a distance, in both
 * directions at once. Tuning one of these numbers is tuning a ratio and the
 * result is a height; the two orderings are not the same ordering.
 *
 * At default framing (`scale ~ 86`): a Fighter is `0.45 * 3.0 * 86 = 116` px tall
 * and `2 * 0.45 * 86 * sqrt(2) = 109` px wide, a Brute 163 by 170. The bodies are
 * genuinely stocky because the sim's bodies are genuinely stocky -- close to a
 * 1-unit-diameter body standing on a 1-unit tile. Presentation only; the sim has
 * no opinion about height and nothing crosses the wall.
 *
 * Read through `bodyHeight` and never indexed raw, so the fallback is in one
 * place. `bodyTopWorld` is the other consumer and it is the one that matters:
 * everything hung over a body -- health bar, callout, floater -- and the pick box
 * in `unitAt` all measure from the number this returns, so a body whose art and
 * whose anchor disagree is a body whose bar floats off its head.
 */
const BODY_H = {
  [BODY_FIGHTER]: 3.0,
  [BODY_ROGUE]: 3.2,
  [BODY_BRUTE]: 2.7,
  [BODY_SKITTERER]: 1.1,
};

function bodyHeight(unit) {
  return unit.radius * (BODY_H[unit.kind] || BODY_H[BODY_FIGHTER]);
}

// ------------------------------------------------------- upright silhouettes
//
// The same four archetypes seen **from the side**, for the projection that
// stands bodies up. These do not replace `SILHOUETTES`: both top-down modes
// still draw those, and both tables are live at once in a page that can cycle
// between the two with `G`.
//
// **The space.** One uniform scale by `s = px(unit.radius) * PROJ.ex` -- an
// `XFORM_PUSH` since `art-04`, and a `ctx.scale(s, s)` before that -- feet at
// the origin, `-y` up. Three properties, and every number in this session comes
// out of them:
//
//   * **Half-width is exactly 1**, so a body is `px(r) * ex` either side of its
//     ground point. That is not a free choice: `px(r) * ex` is the semi-major
//     axis of the body's own ground ellipse, so a narrower billboard would stand
//     *inside* its own footprint and a wider one would overhang it. Every path
//     below touches `x = +/-1` somewhere and none exceeds it.
//   * **The top is `-BODY_H[kind] / ex`**, which is `lift(bodyHeight(unit))`
//     divided by `s` -- the same height in world units that `bodyTopWorld` hands
//     the health bar, arrived at by dividing rather than by being typed twice.
//     `2.121` does not appear anywhere here on purpose: a literal is how the art
//     and `anchorY` drift a pixel apart per zoom bucket and nobody can say why.
//   * **Uniform, not anisotropic.** Line widths stay isotropic and the head stays
//     a circle, which is what lets the head be one `arc` in both projections.
//
// **The head is part of the outline, not a bump drawn over it.** Each path
// finishes with the *upper half of the head circle itself*, so the crown is at
// `cy - r`, which is `uprightTop(kind)` by construction -- the path's topmost
// point is the anchor height exactly, and `drawHeroThrough`, `unitAt`'s box and
// `anchorY` are all quoting the same number rather than three roundings of it.
// The pale head disc `drawCharacter` paints afterwards then sits *inside* the
// silhouette, exactly as it does top-down.
//
// Placeholder, and deliberately so -- `iso-00` says the structure is the
// deliverable and the art is not. What is load-bearing is the extent; what the
// silhouette does between its edges is not.

/** The `ex` these paths were authored against.
 *
 *  `PROJ.ex` cannot be read here: the paths are built once at module scope,
 *  before any view mode exists to ask, and they are only ever drawn under a
 *  projection whose `upright` is true -- of which `PROJ_ISO` is the only one.
 *  `assertProjection` checks that at boot, across the whole table, so a second
 *  upright projection with a different `ex` says so rather than drawing every
 *  body at the wrong height. */
const UPRIGHT_EX = PROJ_ISO.ex;

/** Path-space y of the top of the head. Negative: `-y` is up. */
function uprightTop(kind) {
  return -(BODY_H[kind] || BODY_H[BODY_FIGHTER]) / UPRIGHT_EX;
}

/** `HEADS`, converted into the billboard's space once.
 *
 *  `cy`/`r` are the head circle: the crown sits exactly on `uprightTop`, so `cy`
 *  is that plus the radius. `shoulder` is where the torso tops out -- `at` above
 *  the head's centre, per `HEADS` -- and it is the only place the reinterpreted
 *  `at` is read. A Brute's `at` (0.22) is *smaller* than its head radius (0.30),
 *  so its shoulders come out above the head's equator and the head sits down in
 *  a notch between them; a Rogue's 0.44 holds the hood clear on a neck. The
 *  difference draws itself.
 *
 *  Divided by `UPRIGHT_EX` because `HEADS` is quoted in body radii and one body
 *  radius is `1 / ex` of this space's unit. */
function uprightHead(kind) {
  const head = HEADS[kind] || HEADS[BODY_FIGHTER];
  const r = head.r / UPRIGHT_EX;
  const cy = uprightTop(kind) + r;
  return { r, cy, shoulder: cy + head.at / UPRIGHT_EX };
}

const UPRIGHT_HEADS = {
  [BODY_FIGHTER]: uprightHead(BODY_FIGHTER),
  [BODY_ROGUE]: uprightHead(BODY_ROGUE),
  [BODY_BRUTE]: uprightHead(BODY_BRUTE),
  [BODY_SKITTERER]: uprightHead(BODY_SKITTERER),
};

/** Squarish torso, flat top, square shoulders at the full half-width. The
 *  Fighter is the one body here that squares up to what it is fighting, and from
 *  the side that is a straight shoulder line and a straight flank. */
function fighterUprightPath() {
  const p = new Path2D();
  const head = UPRIGHT_HEADS[BODY_FIGHTER];
  const sy = head.shoulder;
  p.moveTo(-0.66, 0);
  p.lineTo(-0.72, sy * 0.42);
  p.lineTo(-1.00, sy * 0.94);
  p.lineTo(-1.00, sy);
  p.lineTo(-head.r, sy);
  // The neck is the implicit line `arc` draws to its own start point, and the
  // dome is the head circle's top half, so the apex is `cy - r` exactly.
  p.arc(0, head.cy, head.r, Math.PI, TAU);
  p.lineTo(head.r, sy);
  p.lineTo(1.00, sy);
  p.lineTo(1.00, sy * 0.94);
  p.lineTo(0.72, sy * 0.42);
  p.lineTo(0.66, 0);
  p.closePath();
  return p;
}

/** Narrow through the shoulders and hooded, with the cloak flaring to the full
 *  half-width at the hem -- which is where a Rogue's footprint actually is. The
 *  hood is a peak rather than a dome: two quadratics that meet at the crown and
 *  stand off the head circle either side of it, because the peak is the tell. */
function rogueUprightPath() {
  const p = new Path2D();
  const head = UPRIGHT_HEADS[BODY_ROGUE];
  const sy = head.shoulder;
  const top = uprightTop(BODY_ROGUE);
  p.moveTo(-1.00, 0);
  p.lineTo(-0.54, sy * 0.58);
  p.lineTo(-0.44, sy);
  p.lineTo(-head.r, sy);
  p.quadraticCurveTo(-head.r * 1.9, head.cy - head.r * 0.3, 0, top);
  p.quadraticCurveTo(head.r * 1.9, head.cy - head.r * 0.3, head.r, sy);
  p.lineTo(0.44, sy);
  p.lineTo(0.54, sy * 0.58);
  p.lineTo(1.00, 0);
  p.closePath();
  return p;
}

/** Wide, with a shoulder hump either side of a notch the head sits down inside.
 *  The notch is the whole read, exactly as it is from above: the Brute has no
 *  neck, and only the crown clears the humps. */
function bruteUprightPath() {
  const p = new Path2D();
  const head = UPRIGHT_HEADS[BODY_BRUTE];
  const sy = head.shoulder;
  p.moveTo(-0.82, 0);
  p.lineTo(-0.90, sy * 0.50);
  p.lineTo(-1.00, sy * 0.88);
  p.lineTo(-0.86, sy - 0.10);
  p.lineTo(-0.52, sy - 0.16);
  p.lineTo(-head.r, sy);
  p.arc(0, head.cy, head.r, Math.PI, TAU);
  p.lineTo(head.r, sy);
  p.lineTo(0.52, sy - 0.16);
  p.lineTo(0.86, sy - 0.10);
  p.lineTo(1.00, sy * 0.88);
  p.lineTo(0.90, sy * 0.50);
  p.lineTo(0.82, 0);
  p.closePath();
  return p;
}

/** Low and wide, four feet on the ground and the legs splayed to the full
 *  half-width either side, with the head carried up off the front of a body that
 *  is barely a body. One outline and not a body plus loose leg sub-paths: a leg
 *  that overlapped the body with the opposite winding would cancel under the
 *  nonzero rule and punch a hole through the middle of it, which is the trap
 *  `wallBlock` documents. */
function skittererUprightPath() {
  const p = new Path2D();
  const head = UPRIGHT_HEADS[BODY_SKITTERER];
  const sy = head.shoulder;
  p.moveTo(-0.46, sy * 0.45);
  p.lineTo(-1.00, 0);
  p.lineTo(-0.30, sy * 0.20);
  p.lineTo(-0.60, 0);
  p.lineTo(0.60, 0);
  p.lineTo(0.30, sy * 0.20);
  p.lineTo(1.00, 0);
  p.lineTo(0.46, sy * 0.45);
  p.lineTo(0.30, sy);
  p.lineTo(head.r, sy);
  // Right to left over the crown -- the outline runs the other way round on this
  // one, because the legs are traced from the left.
  p.arc(0, head.cy, head.r, 0, Math.PI, true);
  p.lineTo(-0.30, sy);
  p.closePath();
  return p;
}

const UPRIGHTS = {
  [BODY_FIGHTER]: fighterUprightPath(),
  [BODY_ROGUE]: rogueUprightPath(),
  [BODY_BRUTE]: bruteUprightPath(),
  [BODY_SKITTERER]: skittererUprightPath(),
};

/** The same eight paths again, as **paint table indices** (`art-04` §3).
 *
 *  Registered once at load, in the table's static region, because that is what
 *  they are: eight `Path2D`s built at module scope that outlive every frame. An
 *  item references a shape by index and knows nothing about what a `Path2D` is,
 *  which is the whole of the insurance -- a second backend maps the same index
 *  to a mesh and the extract passes do not change a line.
 *
 *  Two tables and not one lookup with a flag: each caller wants one specific
 *  view and says which, which is the argument the `Path2D` pair below was
 *  written with and it does not change on the way through the seam. */
const SILHOUETTE_PAINT = {
  [BODY_FIGHTER]: dlPaintStatic(SILHOUETTES[BODY_FIGHTER]),
  [BODY_ROGUE]: dlPaintStatic(SILHOUETTES[BODY_ROGUE]),
  [BODY_BRUTE]: dlPaintStatic(SILHOUETTES[BODY_BRUTE]),
  [BODY_SKITTERER]: dlPaintStatic(SILHOUETTES[BODY_SKITTERER]),
};

const UPRIGHT_PAINT = {
  [BODY_FIGHTER]: dlPaintStatic(UPRIGHTS[BODY_FIGHTER]),
  [BODY_ROGUE]: dlPaintStatic(UPRIGHTS[BODY_ROGUE]),
  [BODY_BRUTE]: dlPaintStatic(UPRIGHTS[BODY_BRUTE]),
  [BODY_SKITTERER]: dlPaintStatic(UPRIGHTS[BODY_SKITTERER]),
};

/** A body the roster does not describe still has to draw as something. The
 *  Fighter is the fallback because it is the roundest of the four: an unknown
 *  archetype reads as "a body" rather than miming a Brute it is not.
 *
 *  **`!== undefined` and not `||`**, which is what changed when these started
 *  returning indices: a `Path2D` is always truthy and index 0 is a perfectly good
 *  table slot that is not, so the idiom the `Path2D` versions used would silently
 *  hand every Fighter the Fighter's own entry and every unknown body it too --
 *  right by luck, and wrong the day slot 0 is somebody else. */
function silhouettePaintOf(kind) {
  const at = SILHOUETTE_PAINT[kind];
  return at === undefined ? SILHOUETTE_PAINT[BODY_FIGHTER] : at;
}

/** The same fallback, on the same argument, for the side view. Kept beside
 *  `silhouettePaintOf` rather than folded into it with a flag: `drawCorpse` and
 *  `drawCharacter` each want one specific view and say which. */
function uprightPaintOf(kind) {
  const at = UPRIGHT_PAINT[kind];
  return at === undefined ? UPRIGHT_PAINT[BODY_FIGHTER] : at;
}

function headOf(kind) {
  return HEADS[kind] || HEADS[BODY_FIGHTER];
}

function uprightHeadOf(kind) {
  return UPRIGHT_HEADS[kind] || UPRIGHT_HEADS[BODY_FIGHTER];
}

// ------------------------------------------------------------------- the rig
//
// `web/rig.js` holds the tables and the argument for the space they are written
// in; this is the join between them and the sim. Read that file's header first
// -- everything below assumes its two projection lines.

/**
 * Which rig an archetype uses, on exactly `silhouettePaintOf`'s argument: the
 * Fighter's is the fallback, because a body the roster does not describe still
 * has to draw as something and the Fighter is the roundest of the four.
 *
 * **The table is here and not in `rig.js`, and that is the split working rather
 * than a leak.** A `UnitKind` code is sim knowledge -- it is an ABI value out of
 * `kind_code` -- and `rig.js`'s whole claim is that it holds proportions and no
 * sim knowledge at all. So that file says what an upright thing and a crawling
 * thing are shaped like, and this line says which of the two a Skitterer is.
 */
const RIGS = {
  [BODY_FIGHTER]: RIG_UPRIGHT,
  [BODY_ROGUE]: RIG_UPRIGHT,
  [BODY_BRUTE]: RIG_UPRIGHT,
  [BODY_SKITTERER]: RIG_CRAWLER,
};

function rigOf(kind) {
  return RIGS[kind] || RIG_UPRIGHT;
}

/**
 * The archetype's shoulder, as a height in body radii.
 *
 * `UPRIGHT_HEADS` carries it as a billboard-space `y`, which is
 * `-height / UPRIGHT_EX`, so this is that read the other way round. It exists as
 * its own name because the rig quotes every height as a fraction of it and a
 * negation buried in a table row is a sign error waiting to happen.
 */
function shoulderHeight(kind) {
  return -uprightHeadOf(kind).shoulder * UPRIGHT_EX;
}

/**
 * How high the hand rides above the feet, in **body radii** -- the rig's own
 * unit, so it goes straight into `rigProject`'s third argument.
 *
 * The one number shared by the rig's arm and the lifted blade, and it has to be
 * one number or the two come apart: the arm would reach for a hilt the blade is
 * not at. `drawRig` and `rigEmitBlade` are two functions and would otherwise be
 * two copies of `shoulderHeight(kind) * RIG_HAND`.
 *
 * **The sim has no opinion about it and cannot be given one.** A blade's hitbox
 * is a segment in the world plane; height is a rendering choice and drawing the
 * blade at hand height changes nothing the sim can measure. What it costs is
 * readability -- the bright thing is no longer where it hits -- which is what
 * `drawLimb`'s floor shadow buys back. That shadow is on the floor and so takes
 * no height at all; the *world* height, for anything that ever wants one, is
 * `lift(unit.radius * handHeight(unit.kind))`.
 */
function handHeight(kind) {
  return shoulderHeight(kind) * RIG_HAND;
}

/**
 * How far a body has turned away from looking at the viewer, wrapped to
 * `(-pi, pi]`. Zero is facing the camera; `+/-pi` is facing away; `+/-pi/2` are
 * the two profiles.
 *
 * **`pi/4` is not a magic number**: the camera looks down the `+x/+y` diagonal,
 * which `wallBlock` states as the reason only two of a block's four faces are
 * ever emitted, so world bearing `pi/4` is the bearing that projects straight
 * down the screen -- toward the viewer. `assertProjection` proves it at boot
 * rather than taking it on trust.
 *
 * Wrapped rather than left raw because every consumer takes a `sin` or a `cos`
 * of it, which are periodic anyway -- so the wrap is for the one consumer that
 * will not be: `art-06`'s eight-way facing index, `round(b / (TAU/8)) & 7`.
 */
function camBearing(facing) {
  let b = (facing - Math.PI / 4) % TAU;
  if (b > Math.PI) b -= TAU;
  else if (b <= -Math.PI) b += TAU;
  return b;
}

/** The world height above the ground point that anything hung over a body has to
 *  clear. Under `topdown` that is the top of the disc, which is the body's own
 *  radius and is what every anchor here has always used; under iso, the top of
 *  the head. One function, so the bar, the pill, the floater and the pick box
 *  cannot each pick a different answer. */
function bodyTopWorld(unit) {
  return PROJ.upright ? bodyHeight(unit) : unit.radius;
}

/** The screen y everything hung over a body hangs from.
 *
 *  `lift === px` in both projections, so top-down this is
 *  `projY(x, y) - px(radius)` -- **exactly** the expression the health bar, the
 *  callout pill and the floater each wrote out for themselves before this
 *  existed, with `projY(x, y)` being `px(y)` there. Nothing about `Tactical` or
 *  `Dev` moves. */
function anchorY(unit) {
  return projY(unit.x, unit.y) - lift(bodyTopWorld(unit));
}

/** Half the facing wedge's angle, and how far out it reaches, in body radii.
 *
 *  Wide and short rather than narrow and long: it is a statement about which way
 *  a disc is pointing, not a claim about what it can reach -- `drawReach` owns
 *  that and draws a ring, not a fan. */
const WEDGE_HALF = 0.62;
const WEDGE_REACH = 1.7;

// ------------------------------------------------------------ the rig, drawn
//
// **The scratch, and why it is typed arrays at module scope.** Seven segments a
// body, sixty-four bodies, sixty frames a second. `Array.prototype.sort` on a
// fresh array of records would be 64 arrays and 448 objects a frame in a render
// path whose whole discipline is that it allocates nothing (`main.js`'s parse
// pool states the rule); an insertion sort over indices into preallocated lanes
// is the same answer the depth walk already gives for the same question, at the
// same size.

const RIG_MAX_SEG = 12;
const rigOrder = new Int32Array(RIG_MAX_SEG);
const rigKey = new Float64Array(RIG_MAX_SEG);
const rigX0 = new Float64Array(RIG_MAX_SEG);
const rigY0 = new Float64Array(RIG_MAX_SEG);
const rigX1 = new Float64Array(RIG_MAX_SEG);
const rigY1 = new Float64Array(RIG_MAX_SEG);
const rigWide = new Float64Array(RIG_MAX_SEG);
const rigShape = new Int32Array(RIG_MAX_SEG);
const rigInk = new Int32Array(RIG_MAX_SEG);
let rigCount = 0;

/**
 * A body-local point into billboard space, into three module-scope scalars.
 *
 * `web/rig.js`'s header derives these two lines and `assertProjection` proves
 * them against `groundSpace` plus `lift` at boot. Out-params rather than a
 * returned pair for `projX`/`projY`'s own reason: a shared out-object would
 * alias the moment two projections appear in one expression, and a fresh one per
 * call would allocate seven times a body per frame.
 *
 * `rigOutD` is the depth key **and** twice the ground part of `rigOutY`, which
 * is not a coincidence to be tidied away -- it is the whole of why things
 * further from the camera sit higher on the screen for free.
 */
let rigOutX = 0;
let rigOutY = 0;
let rigOutD = 0;

function rigProject(along, side, height, cosB, sinB) {
  rigOutD = along * cosB + side * sinB;
  rigOutX = side * cosB - along * sinB;
  rigOutY = rigOutD / 2 - height / UPRIGHT_EX;
}

/** One resolved segment into the scratch. `key` is the depth the sort runs on;
 *  for a two-ended piece it is the mean of its ends, which is continuous in the
 *  facing where either end alone would not be. */
function rigPush(x0, y0, x1, y1, wide, shape, ink, key) {
  if (rigCount >= RIG_MAX_SEG) return;
  const at = rigCount++;
  rigX0[at] = x0;
  rigY0[at] = y0;
  rigX1[at] = x1;
  rigY1[at] = y1;
  rigWide[at] = wide;
  rigShape[at] = shape;
  rigInk[at] = ink;
  rigKey[at] = key;
}

/** Whether there is a blade in the hand at all -- **one predicate, two callers**,
 *  because `drawRig` lifts it to the hand under iso and `drawLimb` keeps it on
 *  the floor top-down, and a gate written twice is a gate that drifts. The sim
 *  refuses a guard and a runner a blade hitbox, so a page that drew one anyway
 *  would be teaching the player a threat that cannot exist. */
function bladeLive(unit) {
  return unit.role === ROLE_STRIKE && unit.limbReach > 0.05 && unit.swing !== SWING_SWAP;
}

/**
 * How far through its current phase a limb is: `0` at the start, `1` at the end.
 *
 * **`swingSpan` and never a literal.** `drawLimb` used to divide by 30 for every
 * action in the game -- right for a bow and wrong for everything else, because a
 * Brute's club telegraphs for 33 ticks and a Punch for 5. `art-03` put the
 * phase's real length in the frame precisely so this could be an honest
 * fraction, and it is the *measured* length rather than the nominal one from
 * `action.rs`: a punished recovery genuinely is longer than the book says.
 *
 * Zero at guard, where `swingLeft` means nothing and `swingSpan` is zero.
 *
 * **Every pose in the rig is a function of this and none is a function of
 * `now`**, which is what makes a Brute's 33-tick windup visibly last 33 ticks --
 * by construction rather than by tuning -- and what makes a paused world hold
 * the pose it was paused in.
 */
function swingProgress(unit) {
  if (!(unit.swingSpan > 0)) return 0;
  return clamp(1 - unit.swingLeft / unit.swingSpan, 0, 1);
}

/**
 * The body, as parts.
 *
 * Called from inside `drawCharacter`'s billboard push, so everything below is in
 * the space `UPRIGHTS` is written in: half-width 1, feet at the origin, `-y` up,
 * crown at `uprightTop(kind)`. `s` is that space's scale in pixels, and the only
 * thing it is needed for is quoting a stroke width the blade wants in pixels.
 *
 * Three passes: **resolve** every row of the rig table into a pair of billboard
 * points and a depth key; **sort** by that key; **emit**. Nothing here paints,
 * and the middle pass is the whole of the z-order -- there is no table, and if a
 * segment pops at a facing boundary the key is mis-signed rather than a row
 * being in the wrong place.
 *
 * **Every pose the sim has an opinion about comes out of the snapshot.**
 * `stride` is the walk, `vx`/`vy` are whether it is walking at all,
 * `swing`/`swingLeft`/`swingSpan` are the attack, `limbAngle`/`limbReach` are
 * where the hand and the blade actually are. A body that is walled, shoved to a
 * stop or simply standing still freezes for free, because the sim's own numbers
 * stopped moving.
 *
 * **`now` buys exactly one thing and it is the idle breath** -- see `RIG_BREATH`
 * for why that is the exception rather than the hole. It is the frozen-aware
 * clock `render` was handed, so a pinned clock pins the pose.
 */
function drawRig(unit, skin, s, now) {
  const rig = rigOf(unit.kind);
  const inks = rigInksOf(skin);
  if (inks === null) return;
  const head = uprightHeadOf(unit.kind);
  const shoulder = shoulderHeight(unit.kind);
  const b = camBearing(unit.facing);
  const cosB = Math.cos(b);
  const sinB = Math.sin(b);

  // How much of a walk cycle to draw. **Speed, not a differenced stride** -- see
  // `RIG_WALK_FULL`, which carries the correction and the argument. Divided by
  // the radius because that is what the module's own stride clock divides by.
  const walk = clamp(Math.hypot(unit.vx, unit.vy) / (unit.radius * RIG_WALK_FULL), 0, 1);
  const phase = unit.stride * TAU;

  // The bob: down at the extremes of the stride, up in the middle, at twice the
  // stride's frequency because a body bobs once per foot and there are two.
  // Expressed as a *compression of the whole stack* rather than an offset, so
  // the feet stay on the floor without anything having to be told to.
  const swingSin = Math.sin(phase);
  const page = bodies.get(unit.id);
  const recoil = page && page.recoil > 0 ? page.recoil : 0;
  const hScale =
    1 - RIG_BOB * walk * swingSin * swingSin - RIG_RECOIL_SQUASH * recoil;

  // The idle breath, and it is **zero unless the body is genuinely idle**: the
  // limb at rest and the walk faded out. Two multiplications rather than a
  // promise, so it cannot ride on top of a windup, a strike or a stride -- and
  // the loop below applies it to the torso and the head alone, so it cannot
  // reach the hand height the hilt is measured from, the blade, the shield or
  // the legs. `RIG_BREATH` carries the argument for why this one pose is
  // allowed a clock at all.
  const resting = unit.swing === SWING_GUARD || unit.swing === SWING_SWAP;
  const breath = resting
    ? 1 +
      RIG_BREATH *
        (1 - walk) *
        Math.sin((now / RIG_BREATH_MS + unit.id * RIG_BREATH_STAGGER) * TAU)
    : 1;

  // The lean and the brace, both of them `along` offsets applied in proportion
  // to how far up the body a point is -- so the feet never move and the head
  // moves most. **Garnish, and clamped hard**: it may never misrepresent reach,
  // bearing or phase, and none of it reaches the hilt or the blade, which come
  // out of `limbAngle` further down.
  const progress = swingProgress(unit);
  const brace =
    unit.swing === SWING_WINDUP
      ? -progress
      : unit.swing === SWING_STRIKE
        ? 1 - progress
        : unit.swing === SWING_RECOVER
          ? -0.25 * (1 - progress)
          : 0;
  const leanA = (page ? page.leanAlong : 0) + RIG_BRACE * brace - RIG_RECOIL_TIP * recoil;
  const leanS = page ? page.leanSide : 0;

  // Where the hand is, in the rig's own coordinates: the sim's own limb bearing,
  // relative to the facing, at the body's surface. This is the hilt of
  // `World::blade` exactly -- the same point, arrived at by rotating into the
  // body frame instead of by projecting from the world, and `assertProjection`
  // checks the two agree.
  const rel = unit.limbAngle - unit.facing;
  const handAlong = Math.cos(rel);
  const handSide = -Math.sin(rel);
  const handH = handHeight(unit.kind);
  // A swap has nothing in the hand: the arm returns to its neutral carry over
  // the swap's own duration, which is the one place `progress` poses a limb
  // directly rather than through the sim's own `limbReach`.
  const armed = unit.role !== ROLE_MOVE;
  const carry = unit.swing === SWING_SWAP ? progress : 0;

  rigCount = 0;
  for (let i = 0; i < rig.length; i++) {
    const row = rig[i];
    if (row.grain === RIG_IMAGE) continue;
    if (row.slot === RIG_SLOT_SHIELD && !(unit.role === ROLE_GUARD && unit.swing !== SWING_SWAP)) {
      continue;
    }

    if (row.slot === RIG_SLOT_WEAPON) {
      if (!bladeLive(unit)) continue;
      // **Not placed by the table at all.** Hilt at `radius` along `limbAngle`,
      // tip at `radius + actionLength * limbReach`, which is precisely the
      // segment `World::blade` builds and tests against -- continuous, never
      // quantised, and the one thing in this function that is not negotiable.
      // Neither end takes the lean, the brace, the recoil or the bob.
      const tipR = 1 + (unit.actionLength * unit.limbReach) / unit.radius;
      rigProject(handAlong, handSide, handH, cosB, sinB);
      const hx = rigOutX;
      const hy = rigOutY;
      const hd = rigOutD;
      rigProject(handAlong * tipR, handSide * tipR, handH, cosB, sinB);
      rigPush(hx, hy, rigOutX, rigOutY, 0, RIG_BLADE, 0, (hd + rigOutD) / 2);
      continue;
    }

    // The proximal end is always the table's, and the distal end is where the
    // posing happens. Both are resolved to plain body-local radii here and the
    // lean is applied once, below, to whatever came out -- which is what keeps
    // the four cases four lines each instead of four copies of the projection.
    let a0 = row.a0;
    let s0 = row.side;
    let h0 = row.h0 * shoulder;
    let a1 = row.a1;
    let s1 = row.side;
    let h1 = row.h1 * shoulder;

    if (row.slot === RIG_SLOT_HEAD) {
      // **The head's height is not a fraction of the shoulder.** It is the head
      // circle `UPRIGHT_HEADS` already describes, read back out of billboard
      // space, so its crown lands on `uprightTop(kind)` -- which is `anchorY`'s
      // height, `unitAt`'s box top and `drawHeroThrough`'s outline top, all four
      // being one number. A rig whose top segment does not reach it is a rig
      // that hangs the health bar off nothing.
      h1 = -head.cy * UPRIGHT_EX;
    } else if (row.slot === RIG_SLOT_SHIELD) {
      // On the limb's own bearing and not on the off hand's, because the sim has
      // exactly one limb and it is the one the guard arc is drawn at. A shield
      // on the other arm would be the page saying a body is covered somewhere
      // the sim will not defend -- the same lie the role gates in `drawLimb`
      // exist to prevent, one level along.
      a1 = handAlong * RIG_SHIELD_OUT;
      s1 = handSide * RIG_SHIELD_OUT;
      h1 = handH;
    } else if (row.slot === RIG_SLOT_ARM && row.main && armed) {
      // The main arm reaches for the hand and stops solving there. Nothing looks
      // for an elbow and nothing should -- an elbow is invisible at 116 px of
      // Fighter. Mid-swap there is nothing in the hand, so it returns to the
      // table's neutral carry over the swap's own duration.
      a1 = handAlong + (row.a1 - handAlong) * carry;
      s1 = handSide + (row.side - handSide) * carry;
      h1 = handH + (row.h1 * shoulder - handH) * carry;
    } else {
      // Everything that walks. One row written twice at opposite `phase` is what
      // makes the far leg the near leg half a cycle ago, and the foot comes off
      // the floor on the forward half of its own swing so that a walk is a walk
      // rather than a shuffle.
      const legPhase = phase + row.phase * TAU;
      a1 += row.swing * Math.sin(legPhase) * walk;
      if (row.slot === RIG_SLOT_LEG) {
        h1 += RIG_FOOT * shoulder * walk * Math.max(0, Math.cos(legPhase));
      }
    }

    // A disc is a point, so both of its ends are the same end. Said here once
    // rather than in each branch that makes one: it is a property of the shape
    // and not of the slot, and the depth key would otherwise be the mean of a
    // head and a pair of feet.
    if (row.shape === RIG_DISC) {
      a0 = a1;
      s0 = s1;
      h0 = h1;
    }

    // The bob and the recoil compress the stack; the lean and the brace tip it.
    // Both are scaled by how far up the body a point is, so the feet stay on the
    // floor and on the collision ring without anything having to be told to.
    //
    // The breath rides on the same height scale, and **on these two rows only**
    // -- which is the whole of the guarantee that it never moves the hand, the
    // hilt or the blade. It does leave the shoulder a fraction of a pixel out of
    // line with the arm hanging off it, and that is what `rigLimbPath`'s
    // twentieth of overshoot at each end is for.
    const rise = row.slot === RIG_SLOT_TORSO || row.slot === RIG_SLOT_HEAD ? breath : 1;
    const f0 = h0 / shoulder;
    const f1 = h1 / shoulder;
    rigProject(a0 + leanA * f0, s0 + leanS * f0, h0 * hScale * rise, cosB, sinB);
    const x0 = rigOutX;
    const y0 = rigOutY;
    const d0 = rigOutD;
    rigProject(a1 + leanA * f1, s1 + leanS * f1, h1 * hScale * rise, cosB, sinB);
    const wide = row.shape === RIG_DISC ? row.wide * head.r : row.wide;
    rigPush(x0, y0, rigOutX, rigOutY, wide, row.shape, inks[row.tone], (d0 + rigOutD) / 2);
  }

  // **Insertion sort, ascending, over indices.** Seven items and a nearly sorted
  // list frame to frame, which is the case insertion sort is best at and the
  // case TimSort would allocate a work array for.
  for (let i = 0; i < rigCount; i++) {
    let j = i;
    while (j > 0 && rigKey[rigOrder[j - 1]] > rigKey[i]) {
      rigOrder[j] = rigOrder[j - 1];
      j--;
    }
    rigOrder[j] = i;
  }

  for (let k = 0; k < rigCount; k++) {
    const at = rigOrder[k];
    if (rigShape[at] === RIG_BLADE) {
      rigEmitBlade(unit, s, rigX0[at], rigY0[at], rigX1[at], rigY1[at]);
      continue;
    }
    rigEmitPiece(at);
  }
}

/**
 * One resolved segment, as **one `PATH_FILL` and no stroke**.
 *
 * `DESIGN.md`'s measurement is unambiguous -- killing `stroke()` alone recovered
 * 43 fps while fills, rects, sprites and text were collectively free -- and a
 * stroke per segment would be seven new strokes a body where there is currently
 * one. The edge definition the stroke was providing comes out of the fill
 * instead: `rig.js`'s two gradients run across `x = -1 .. 1` of the **unit**
 * path, and the matrix below is what makes that interval this segment's own
 * short axis, at any size, on any body, at any zoom.
 *
 * The matrix is `T * R * diag(w, len)` folded into one `ctx.transform`, because
 * `dlApplyXform` runs translate, then the linear part, then the rotation -- so a
 * rotation asked for by name would be applied in the already-scaled space and
 * come out sheared. Written out, local `(0, 0)` is the proximal end, local
 * `(0, -1)` is the distal end, and local `x = +/-1` is `w` either side of the
 * line between them.
 */
function rigEmitPiece(at) {
  const x0 = rigX0[at];
  const y0 = rigY0[at];
  const dx = rigX1[at] - x0;
  const dy = rigY1[at] - y0;
  const w = rigWide[at];
  if (rigShape[at] === RIG_DISC) {
    dlXform(w, 0, 0, w, x0, y0, 0, 1, -1);
    dlPath(RIG_DISC_PAINT, DL_FILL, null, rigInk[at], 0, 0, 0);
    dlXformEnd();
    return;
  }
  const len = Math.hypot(dx, dy);
  // A segment with no length has no short axis either, so there is nothing for
  // the gradient to run across and nothing to draw. It happens: a Skitterer with
  // a zero radius is skipped upstream, but a leg at the exact bottom of its
  // swing on a body of vanishing scale is not.
  if (!(len > 1e-9)) return;
  const ux = dx / len;
  const uy = dy / len;
  dlXform(w * uy, -w * ux, -dx, -dy, x0, y0, 0, 1, -1);
  dlPath(RIG_LIMB_PAINT, DL_FILL, null, rigInk[at], 0, 0, 0);
  dlXformEnd();
}

/**
 * The blade, at the hand, **at its sorted place among the segments**.
 *
 * This is `drawLimb`'s blade lifted off the floor, and it is here rather than
 * there for one property: sorted with the rest of the rig on §2's depth key, it
 * passes *behind* the torso as the figure turns away. Nothing tabulates that --
 * the hilt and the tip go through the same two lines every other segment does,
 * and the key does the rest.
 *
 * **Still a stroke, and deliberately.** Every other piece of the rig is a fill,
 * but a blade is a line in the world that the sim tests as a line, and its four
 * phase colours and four widths are the single most useful readout on the
 * canvas. One stroke per attacking body is what it costs today and what it costs
 * now; what changed is where the line is, not how many of them there are.
 *
 * The trailing smear is a **polyline through the same projection** rather than
 * the ground-space `arc` it used to be. An arc could only be drawn in a space
 * where the shear was in force, and the blade has left that space; seven points
 * through `rigProject` put the smear on the arc the hand is actually sweeping,
 * at hand height, for the same one stroke.
 */
function rigEmitBlade(unit, s, hx, hy, tx, ty) {
  const phase = SWING_SKIN[unit.swing] || SWING_SKIN[SWING_GUARD];
  const heat = clamp(Math.abs(unit.limbSpin) / HOT_SPIN, 0, 1);
  const r = px(unit.radius);
  if (unit.swing === SWING_STRIKE && heat > 0.05) {
    // Opposite the swing, so which way it is travelling is readable at a glance.
    // Only on a live cut: a blade drifting back to guard trails nothing worth
    // watching, and smearing it would make a recovery -- the most punishable
    // moment in the game -- look like a threat.
    const sweep = Math.sign(unit.limbSpin) * -heat * 0.55;
    const mid = (1 + (unit.actionLength * unit.limbReach) / unit.radius) / 2;
    const rel = unit.limbAngle - unit.facing;
    const b = camBearing(unit.facing);
    const cosB = Math.cos(b);
    const sinB = Math.sin(b);
    const handH = handHeight(unit.kind);
    dlPolyBegin();
    for (let i = 0; i <= 6; i++) {
      const a = rel + (sweep * i) / 6;
      rigProject(Math.cos(a) * mid, -Math.sin(a) * mid, handH, cosB, sinB);
      dlPoint(rigOutX, rigOutY);
    }
    dlPolyEnd(
      DL_CAP_ROUND | DL_LOCAL_WIDTH,
      `rgba(255,255,255,${(0.16 * heat).toFixed(3)})`,
      Math.max(2, r * 0.5) / s,
      0,
      0
    );
  }
  dlPolyBegin();
  dlPoint(hx, hy);
  dlPoint(tx, ty);
  // The width is quoted in **billboard units** and says so, because this space is
  // a uniform `scale(s)` and a width in screen pixels would come out `s` times
  // too fat. Divided rather than re-tuned, so the blade is the same weight on
  // screen it has always been.
  dlPolyEnd(
    DL_CAP_ROUND | DL_LOCAL_WIDTH,
    phase.line,
    Math.max(1.6, r * phase.width) / s,
    0,
    0
  );
}

/**
 * A character, as a character.
 *
 * **Six passes flat, seven upright**, and the order of the first two is the point
 * of the whole function: the shadow separates the body from a floor that now has
 * texture in it, and then **the sim's collision circle is drawn, under the art and
 * again over it**. Every silhouette here overhangs that circle somewhere -- a
 * Brute's shoulders by a quarter of a radius, a Skitterer's legs by more -- and a
 * player who cannot see where the real edge is cannot read a shove, a wall stop
 * or why a blade that visibly clipped a leg did nothing. House rule 4.
 *
 * The seventh is the facing wedge, which the upright arm's ground pre-pass slips
 * between those two. It is not an extra flourish -- flat, the facing is in the
 * rotation of every path below and in the rim light's direction, and a billboard
 * has neither, so the wedge on the floor is the whole of which way a body points.
 * The numbering in the code counts the upright sequence 1 to 7 and the flat one
 * 1 to 6; the last pass is shared and carries both numbers.
 *
 * Faction drives colour and archetype drives shape, and neither crosses over.
 *
 * With `artOn()` false, passes 1 to 5 of the flat sequence -- which is the only
 * sequence an artless mode can be in, since `assertProjection` refuses a row that
 * stands bodies up without art -- are replaced wholesale by a disc and a wedge, and
 * pass 6 flashes the disc. **That is one branch and not two
 * functions**, which is what keeps every readout below it -- the limb, the
 * markers, the chevrons, the circle -- written once. `iso-05` added a second
 * branch inside the first and honoured the same rule: a body stands up here or
 * it lies flat here, and either way the limb, the markers and the chevrons below
 * are the same three calls.
 *
 * **The projection branch is on `PROJ.upright` and never on `art`.** They are
 * one bit today, because art is on in exactly the mode that is isometric, and
 * they stop being it the day a fourth view mode exists -- `iso-00` §3 calls this
 * the single easiest mistake in the conversion. Only two of the four
 * combinations are reachable: `!art` is both top-down modes, and `art` is the
 * isometric one.
 *
 * **Upright, the passes split across two spaces.** Three of them lie on the
 * floor and go through `groundSpace` -- the shadow, the facing wedge and the
 * sim's collision circle -- and then the body itself is a billboard standing on
 * that ground point. The shadow stops being decoration there and becomes
 * load-bearing: it is the only thing saying *where* an upright billboard is
 * standing, and without it the body floats. The facing wedge is the one of the
 * three that `readoutsOn()` can take away, and in the only upright row there is
 * it does; the collision circle beneath it never can, and the pass itself argues
 * both halves.
 *
 * `ghost` is `null` for a body the player can see and a `ghostOf` descriptor for
 * one it is only remembering; see `ghostOf` for what the three stages look like.
 */
function drawCharacter(unit, now, ghost) {
  const skin = skinOf(unit);
  const x = projX(unit.x, unit.y);
  const y = projY(unit.x, unit.y);
  const r = px(unit.radius);
  const upright = PROJ.upright;
  // The body's own outline, as a §3 paint-table index rather than as the
  // `Path2D` it used to be. Every use below is a fill, a stroke or a clip, and
  // all three take an index; nothing in here has any business knowing what a
  // `Path2D` is.
  const shape = upright ? uprightPaintOf(unit.kind) : silhouettePaintOf(unit.kind);
  const head = headOf(unit.kind);
  const tall = upright ? uprightHeadOf(unit.kind) : null;
  const art = artOn();
  // The billboard's half-width, and it is not a free choice: `px(r) * ex` is the
  // semi-major axis of this body's ground ellipse, so scaling by anything else
  // would stand the figure inside or outside its own footprint. Uniform, so line
  // widths stay isotropic and the head stays a circle. `ex` is 1 top-down, where
  // nothing reads this.
  const s = r * PROJ.ex;

  if (!(r > 0)) return;

  // The flat passes, before the body stands up on them. A ghost's *outline*
  // stage draws none of them for the reason it draws no limb and no hit marker:
  // they describe a body somebody is watching, and the whole claim of an outline
  // is that nobody is. A ghost still *fading* is a body that was being watched a
  // moment ago and gets the lot, at its falling alpha.
  //
  // **`art` in this gate is not the projection being read off the wrong bit.**
  // These are the art body's own first passes -- its shadow, its wedge, its ring
  // -- lifted out of the arm below because they belong on the floor rather than
  // on the billboard, and the `!art` arm still draws its own disc and its own
  // wedge in its own space. The projection question is `upright` and it is asked
  // separately, right beside it.
  if (upright && art && !(ghost && ghost.outline)) {
    pushGroundSpace(unit.x, unit.y, 0, 1, ghost ? ghost.alpha : -1);

    // 1. The ground shadow. **One flat ellipse, and cheaper than what it
    //    replaces.** Top-down this is the silhouette dropped down the screen plus
    //    the head circle -- two fills -- because a plain ellipse under a rotating
    //    Brute wore as a dark crescent out of its chest. Nothing rotates here, so
    //    the honest shape is the body's own footprint slightly overspilled, which
    //    `groundSpace` turns into the correct ellipse for free.
    dlEllipse(0, 0, r * 1.05, DL_FILL, "rgba(0,0,0,0.42)", DL_NO_PAINT, 0, 0, 0);

    // 2. The facing wedge, on the floor: literally `[tactical]`'s fan with a
    //    unimodular shear in front of it, so it costs the same pixels and would
    //    say the same thing in the same alphas -- out of the same baked table, so
    //    "the same alphas" is a fact rather than a hope.
    //
    //    **And no mode ships today that reaches it.** The pass is the whole of
    //    which way an upright body points -- a billboard cannot turn to face you
    //    -- and that is exactly what made it the loudest thing on the floor once
    //    there was art underneath: a filled fan the size of the body, in a mode
    //    whose claim is that it draws the room and not the numbers. `[world]`
    //    pays for the gate in facing, which the limb on the ground and the body's
    //    own travel now carry alone. Kept rather than deleted because it is the
    //    only upright wedge there is, and the row that wants art *and* readouts
    //    is one `readouts: true` away.
    if (readoutsOn()) {
      dlRotateBare(unit.facing);
      dlArc(
        0, 0, r * WEDGE_REACH, -WEDGE_HALF, WEDGE_HALF,
        DL_FILL | DL_SECTOR,
        wedgeFill(skin, unit.intent),
        0
      );
      dlRotateBare(-unit.facing);
    }

    // 3. The sim's collision circle, which **must** survive standing the body up
    //    (house rule 4). Under `groundSpace` it is the same `arc(0, 0, px(r))` it
    //    is top-down and comes out as an ellipse lying exactly on the sim's
    //    circle. Drawn under the billboard rather than over it, so the body plants
    //    on it: the near half is what the eye reads and the far half is behind the
    //    feet, which is what standing on something looks like. The hairline is
    //    quoted as 1 rather than `1 / r` because this space is already screen
    //    pixels; the shear makes it 0.9 to 1.4 px with direction, which is fine
    //    for placeholder. **Unconditional where the pass above it is not**, and
    //    house rule 4 is the whole of why: the page never paints a shape the sim
    //    will treat as hittable and then hides where the real edge is.
    // Faint, and the only mark left on the floor. It used to sit under a filled
    // facing wedge and had to carry over it; alone on bare ground at 0.30 it reads
    // as a drawn ring rather than as the edge of a body. Bone rather than sky, and
    // a shade fainter with it: on a warm floor the old blue-white was the only cold
    // mark under every body in the room, which is a hue the concept spends on the
    // team rings alone.
    dlEllipse(0, 0, r, DL_STROKE, "rgba(201,191,168,0.14)", DL_NO_PAINT, 1, 0, 0);
    dlXformEnd();
  }

  // **Two pushes where there was one `save` and three `ctx` calls**, and the
  // split is where the gradient is built rather than anywhere arbitrary: the
  // translate has to be in force when the flat body's gradient is made and the
  // rotation and the scale must not be, which is a boundary the old code drew
  // with the order of its statements and this one has to draw with an item.
  //
  // A ghost is this same body at a falling alpha, which is what makes losing
  // sight of something read as losing sight of it rather than as a sprite being
  // switched off. Set on the outer push, so every pass below inherits it.
  dlXform(1, 0, 0, 1, x, y, 0, 1, ghost ? ghost.alpha : -1);
  // The body gradient is built here, *before* the rotation, so the light stays
  // where the room's light is instead of spinning with the character. It is in
  // pixels rather than radii for the same reason -- it is the only thing in
  // this function that does not belong to the body.
  //
  // Not built at all with the art off. A body is one colour when the question is
  // where it is, and this is the one thing in the function that is not free.
  //
  // Nor upright, where it is built after the scale instead and in that space's
  // own units -- see below.
  //
  // Still built per body per frame, and `art-04` §3 (D3) says so out loud rather
  // than quietly hoisting it: this session's gate is that nothing changes, and
  // the paragraph below is an argument about *when* a gradient is made that a
  // hoist would be answering by accident.
  let body = DL_NO_PAINT;
  if (art && !upright) {
    body = dlLinearGradient(0, -r, 0, r, skin.body[1], skin.deep);
  }

  if (upright) {
    // **No rotation.** A billboard faces the camera by construction, and which
    // way the body is actually pointing is now in the rig -- every segment is
    // placed through `camBearing`, so a body genuinely turns rather than being
    // told which way it points by the wedge on the floor. The wedge stays for
    // the rows that want a readout, and the shape carries it either way.
    //
    // Into the billboard space `UPRIGHTS` is written in: half-width 1, feet at
    // the origin, crown at `uprightTop(kind)`. The rig is written in the same
    // space and `rig.js` derives it from `PROJ_ISO`'s own coefficients.
    //
    // **The per-body gradient this branch used to build is gone**, and it is one
    // of the six `art-04` §3 (D3) recorded as still being built per frame: the
    // billboard's body ramp painted one fill of one silhouette, and there is no
    // longer a fill of a silhouette to paint. The rig's own ramps are two per
    // *skin*, declared once at boot in the paint table's static region. Two of
    // the six are therefore retired here and the rest are still D3's.
    dlXform(1, 0, 0, 1, 0, 0, 0, s, -1);
  } else {
    // The facing, and then the unit-radius space every path below is written
    // in. Line widths go with it, which is why the strokes from here down are
    // quoted in radii and carry `DL_LOCAL_WIDTH` to say so.
    dlXform(1, 0, 0, 1, 0, 0, unit.facing, r, -1);
  }

  if (ghost && ghost.outline) {
    // The last known pose, as an outline, and **nothing at all about what the
    // body is doing now**: no limb, no hit markers, no sprint chevrons, no
    // collision circle. Those four describe a body somebody is watching, and the
    // whole claim of a ghost is that nobody is.
    //
    // Dashed because that is already this page's word for "not confirmed" -- the
    // unacknowledged destination ring and the shut portal are both dashed -- and
    // an outline because the shape is remembered rather than seen.
    const outline = `rgba(${skin.glow},0.85)`;
    if (art) {
      dlPath(shape, DL_STROKE | DL_DASHED | DL_LOCAL_WIDTH, outline, DL_NO_PAINT, 0.11, 0.28, 0.22);
    } else {
      dlEllipse(0, 0, 1, DL_STROKE | DL_DASHED | DL_LOCAL_WIDTH, outline, DL_NO_PAINT, 0.11, 0.28, 0.22);
    }
    // Both pushes, on the early return as on the normal path below. This is the
    // one early return inside a transform in the file and it is the reason the
    // static push and pop counts here do not match; every dynamic path balances.
    dlXformEnd();
    dlXformEnd();
    return;
  }

  // **Three arms and not four.** The shape question is `art` and the space
  // question is `upright`, and they are asked separately on purpose -- but that
  // leaves `upright && !art` as a cell no `VIEW_MODES` row selects and no arm
  // here handles: this one would draw a screen-space `arc(0, 0, 1)` inside the
  // billboard's scale, which comes out a *round* disc where the sim's circle
  // projects to an ellipse twice as wide as it is tall. It is checked rather
  // than forgotten -- `assertProjection` walks the whole table at boot and says
  // exactly what would break -- so this arm may go on assuming a flat body.
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
    // modes agree about what "bearing down" looks like -- `wedgeFill` is where
    // that agreement lives now, and the isometric ground wedge reads the same row.
    //
    // Gated for the reason the isometric one is, and not because any row reaches
    // it with the readouts off: `readouts` is on in exactly the two rows that
    // have the art off, so nothing draws a flat body without them today. It is
    // the discipline `assertProjection` applies to `upright && !art` one arm
    // over -- a fourth row must not be able to select a picture this file has
    // never drawn.
    if (readoutsOn()) {
      dlArc(
        0, 0, WEDGE_REACH, -WEDGE_HALF, WEDGE_HALF,
        DL_FILL | DL_SECTOR,
        wedgeFill(skin, unit.intent),
        0
      );
    }

    dlEllipse(0, 0, 1, DL_FILL, skin.deep, DL_NO_PAINT, 0, 0, 0);
    dlEllipse(0, 0, 1, DL_STROKE | DL_LOCAL_WIDTH, skin.body[1], DL_NO_PAINT, 1 / r, 0, 0);
  } else if (upright) {
    // The billboard. Its three flat passes -- shadow, wedge, collision ring, which
    // are 1 to 3 -- went down on the floor above, before this space existed; what
    // is left is the body itself.
    //
    // 4 and 5. **The rig.** `art-05` replaced the two passes that used to be
    //    here -- one fill of `UPRIGHTS[kind]` plus a stroke, and one head disc
    //    plus a stroke -- with a short list of segments that are placed, posed
    //    and depth-sorted from the snapshot every frame. `drawRig` is the whole
    //    of it and `web/rig.js` carries the argument for the space it works in.
    //
    //    **`UPRIGHTS` did not go away; it stopped being the body.** It is the
    //    *silhouette* now, and four things still want a whole-body outline and
    //    none of them wants seven: the rim light two lines down clips to it,
    //    `drawHeroThrough` strokes it over the depth walk, the ghost's dashed
    //    outline above is it, and the hit flash at the bottom of this function
    //    fills it once rather than flashing seven segments for the same picture
    //    at seven times the cost. `assertProjection` still checks it -- and now
    //    the rig with it -- against the live `ex`.
    //
    //    **And it is still filled, once, in the room's own darkness, under the
    //    parts.** Not a second body: a *mass*. Three things need it and the
    //    first two were found by drawing the rig without it.
    //
    //      * The rim light below clips to this outline and is a stroke *on* it.
    //        With nothing filled underneath, that stroke is the only lit thing
    //        in the shape and a figure reads as a hollow ring at every size.
    //      * The archetype read is the silhouette's -- that is `iso-05`'s whole
    //        argument for `UPRIGHTS` existing -- and at forty pixels a body the
    //        gaps between seven segments are the difference between a Brute and
    //        a smudge.
    //      * The dark outline stroke this pass used to carry is gone with the
    //        stroke-per-segment ban, and a fill in `PAL.void` separates the body
    //        from a lit floor for one fill instead of one stroke.
    //
    //    Flat, and the darkest thing in the palette, so nothing about the pose
    //    is legible in it -- everything that moves is a segment over the top.
    //    "Detail is in the silhouette, not in the interior" is the concept's
    //    instruction and this is the literal reading of it.
    dlPath(shape, DL_FILL, PAL.void, DL_NO_PAINT, 0, 0, 0);
    drawRig(unit, skin, s, now);

    // 6. The rim light, verbatim from the flat arm below including its gradient
    //    line, because `ctx.clip` takes any closed path and this one is closed.
    //    What it means changes with the projection and the code does not: flat it
    //    runs back-to-front along the facing, upright it runs across the body from
    //    the shaded side to the lit one, and either way it is a bright inner edge
    //    carrying the intent in its alpha. The *hue* never moves.
    //
    //    **It is what carries the faction at four pixels a body and it is not a
    //    candidate for deletion**, which is worth saying beside a rig whose fills
    //    are deliberately between `skin.deep` and the void: the body went darker
    //    in this session and the one line that says whose side it is on did not.
    //    That it still clips to the silhouette rather than to the segments is the
    //    point -- an inner rim round the whole figure is one stroke, and a rim
    //    per segment would be seven strokes drawing the creases between a body's
    //    own parts.
    const heat = unit.intent === INTENT_ATTACK ? 1 : unit.intent === INTENT_FLEE ? 0 : 0.5;
    dlClip(shape);
    const rim = dlLinearGradient(
      -0.7, 0, 1.05, 0,
      `rgba(${skin.wedge},0)`,
      `rgba(${skin.wedge},${(0.24 + 0.72 * heat).toFixed(3)})`
    );
    dlPath(shape, DL_STROKE | DL_LOCAL_WIDTH, null, rim, 0.20 + 0.20 * heat, 0, 0);
    dlClipEnd();
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
    //
    //    The step aside and the step back are a `DL_BARE` pair for the reason
    //    `drawLimb`'s rotations are: an inverse written by hand is what the file
    //    does today, and a save and a restore would put the matrix back more
    //    exactly than it does.
    dlTranslateBare(sx, sy);
    dlPath(shape, DL_FILL, "rgba(0,0,0,0.42)", DL_NO_PAINT, 0, 0, 0);
    dlEllipse(head.at, 0, head.r, DL_FILL, "rgba(0,0,0,0.42)", DL_NO_PAINT, 0, 0, 0);
    dlTranslateBare(-sx, -sy);

    // 2. The body circle, rimmed and not filled. It was filled dark to begin
    //    with, and the Brute's notched front showed the fill through as a black
    //    hole punched in its chest -- the art has to *sit on* the circle, not
    //    stand in a well cut out of it. One device pixel wide whatever `r` is,
    //    which is why the width is quoted as its reciprocal.
    // Bone, and moved with the collision ring in the ground pre-pass rather than
    // left behind it: the two are the same mark in two arms of one function, and a
    // pair written to mirror each other is a pair that has to be retoned together
    // or the mirror stops being one.
    dlEllipse(0, 0, 1, DL_STROKE | DL_LOCAL_WIDTH, "rgba(201,191,168,0.28)", DL_NO_PAINT, 1 / r, 0, 0);

    // 3. The silhouette. Same outline tone as the billboard arm above, for the
    //    same reason.
    dlPath(shape, DL_FILL, null, body, 0, 0, 0);
    dlPath(shape, DL_STROKE | DL_LOCAL_WIDTH, "rgba(11,10,8,0.85)", DL_NO_PAINT, 0.09, 0, 0);

    // 4. The head, forward along the facing and in the *pale* end of the palette:
    //    it is the part of the body nearest the light, and painting it dark made
    //    it read as a hole rather than as a head.
    dlEllipse(head.at, 0, head.r, DL_FILL, skin.body[0], DL_NO_PAINT, 0, 0, 0);
    dlEllipse(head.at, 0, head.r, DL_STROKE | DL_LOCAL_WIDTH, "rgba(11,10,8,0.75)", DL_NO_PAINT, 0.07, 0, 0);

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
    dlClip(shape);
    const rim = dlLinearGradient(
      -0.7, 0, 1.05, 0,
      `rgba(${skin.wedge},0)`,
      `rgba(${skin.wedge},${(0.24 + 0.72 * heat).toFixed(3)})`
    );
    dlPath(shape, DL_STROKE | DL_LOCAL_WIDTH, null, rim, 0.20 + 0.20 * heat, 0, 0);
    dlClipEnd();
  }

  // The last pass -- **6 on the flat arm and 7 on the upright one**, the one place
  // the two sequences meet, because it is the only pass both arms share code for.
  //
  //    The blow landing, clipped to the shapes that were actually drawn.
  //    Straight from the frame: the sim counts it down from its own
  //    `Event::Damage`, so the page no longer has to tell a blow from
  //    regeneration by watching health fall.
  //
  //    "The shapes that were actually drawn" is why this branches too: with the
  //    art off there is no silhouette and no head to flash, and flashing them
  //    anyway would print a Brute's shoulders on screen for four frames in a mode
  //    that has spent the whole function not drawing them.
  //    `shape` is already whichever silhouette was filled, so only the head has to
  //    be asked which space it is in -- and the flat line is left as it was
  //    rather than folded into a pair of variables that would evaluate to it.
  if (unit.hitFlash > 0) {
    const flash = `rgba(255,255,255,${(0.75 * unit.hitFlash).toFixed(3)})`;
    if (art) {
      dlPath(shape, DL_FILL, flash, DL_NO_PAINT, 0, 0, 0);
      if (upright) dlEllipse(0, tall.cy, tall.r, DL_FILL, flash, DL_NO_PAINT, 0, 0, 0);
      else dlEllipse(head.at, 0, head.r, DL_FILL, flash, DL_NO_PAINT, 0, 0, 0);
    } else {
      dlEllipse(0, 0, 1, DL_FILL, flash, DL_NO_PAINT, 0, 0, 0);
    }
  }
  dlXformEnd();
  dlXformEnd();

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
  //
  // **And not upright either**, for the first reason rather than a new one: a
  // billboard stands *above* its circle instead of on top of it, so there is no
  // art covering the ring to justify a second pass -- and this one is a screen
  // circle, which under iso would be drawn round rather than as the ellipse the
  // ring actually is. The ring itself is unconditional and went down with the
  // other two flat passes at the top of this function.
  //
  // No push around it: it is a screen circle at the base matrix, and the `save`
  // it used to sit in was scoping a `strokeStyle` and a `lineWidth` that an item
  // now carries for itself.
  if (art && !ghost && !upright) {
    dlEllipse(x, y, r, DL_STROKE, "rgba(214,232,255,0.26)", DL_NO_PAINT, 1, 0, 0);
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
  // On the floor, trailing the body: `groundSpace` rather than a bare translate,
  // so under iso the chevrons lie on the ground the runner is covering instead of
  // standing up in the air behind it. Top-down `groundSpace` *is* that translate.
  pushGroundSpace(unit.x, unit.y, unit.facing, 1, -1);
  const line = `rgba(${skin.wedge},${(0.35 + 0.35 * beat).toFixed(3)})`;
  for (const back of [1.35, 1.85]) {
    dlPolyBegin();
    dlPoint(-r * back + r * 0.45, -r * 0.55);
    dlPoint(-r * back, 0);
    dlPoint(-r * back + r * 0.45, r * 0.55);
    dlPolyEnd(DL_CAP_ROUND, line, 2, 0, 0);
  }
  dlXformEnd();
}

/** How long an arrow is drawn, in world units. Presentation, not physics: the
 *  sim's arrow is a point, and `resolve_shots` tests the segment it travelled
 *  this tick rather than a shaft of any length. */
const SHAFT = 0.34;

/** How high an arrow flies, in world units. **Presentation only.** The sim's
 *  arrow is a point and `resolve_shots` tests the segment it travelled this
 *  tick; this file does not get to invent an altitude the hit test does not know
 *  about. So the number is constant and the flight is flat -- a parabola would be
 *  the page making up physics that the sim would then disagree with.
 *
 *  Nothing crosses the wall for it: `parseFrame` reads `{x, y, heading, faction}`
 *  off a shot row and there is no z column to read. */
const SHOT_Z = 0.55;

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
function drawShot(shot) {
  // Through `skinOf`, which is the same ternary this line used to spell out plus
  // the mode question the split added. An arrow in flight and the body that loosed
  // it must be on the same table.
  const skin = skinOf(shot);
  // **State is per arrow and not per volley**, which is what `iso-04` changed in
  // here. `drawShots` used to hoist a `save`, a `lineCap` and a `restore` outside
  // its loop; under iso an arrow is drawn from inside the depth walk with
  // wall-band fills and whole bodies between one arrow and the next, so a
  // `lineCap` set once at the top would be state leaking across somebody else's
  // draw call in both directions. The pixels are the same either way, and they
  // stay the same only because the state is scoped to the one call that wants it.
  //
  // `art-04` took the argument one step further and made it structural: a stroke
  // carries its own cap, its own width and its own dash on the item, so there is
  // no longer a scope for anything to leak out of.
  //
  // It also retired the manual `rotate(-heading); translate(-x, -y)` that used to
  // put the matrix back, and `iso-06` gives that retirement its real reason:
  // `groundSpace` is a `ctx.transform` and there is no tidy inverse to write. The
  // old pairs were exact under any CTM, so this was never a precision fix.
  //
  // **The depth key does not move.** `buildDrawList` sorts an arrow on
  // `shot.x + shot.y`, its ground point, and the lift below is a screen-space
  // translate applied at paint time that the sort never sees. That is the right
  // way round rather than an oversight: the arrow is occluded by whatever its
  // *ground point* says occludes it, which is what keeps `iso-04`'s occlusion
  // working -- an arrow at `SHOT_Z` behind a `WALL_H` block is still behind it.
  const upright = PROJ.upright;

  // The ground shadow first, and it is not decoration: it is the only thing that
  // makes the altitude readable, and it marks the point the sim actually tests.
  // House rule 4.
  //
  // **Upright only.** From directly above, a height is invisible by construction:
  // the arrow and its shadow are the same pixels, so top-down this pass would put
  // a black dot under every arrow that says nothing, and `Tactical` and `Dev` are
  // the A/B control for the conversion. Same gate, and the same reason, as
  // `drawCharacter`'s ground pre-pass.
  if (upright) {
    pushGroundSpace(shot.x, shot.y, 0, 1, -1);
    dlEllipse(0, 0, px(0.1), DL_FILL, "rgba(0,0,0,0.35)", DL_NO_PAINT, 0, 0, 0);
    dlXformEnd();
  }

  // The shaft, lying in the world plane at shoulder height.
  //
  // The lift comes **before** `groundSpace`, so it is in screen space -- straight
  // up the screen, which is what a height is. Put after it, the same two numbers
  // would be a step along the world `-y` axis: the shear takes `(0, -L)` to screen
  // `(L, -L/2)`, so the arrow would slide diagonally across the floor by an amount
  // that grows with the height, which is a translation and not an altitude.
  // The lift is its own push rather than a field on the one below it, because a
  // translate composed into the ground matrix would be a different sequence of
  // float operations from the two calls it replaces -- and the two happen to be
  // in the one function whose whole comment is about a translation that must not
  // become a step across the floor.
  if (upright) dlXform(1, 0, 0, 1, 0, -lift(SHOT_Z), 0, 1, -1);
  // The arrow itself is flat on the world plane, so `rotate(heading)` under the
  // shear points it along its own world bearing and foreshortens the shaft with
  // it: one crossing the screen east-west draws longer than one crossing
  // north-south, which is the same arrow seen from a different angle.
  pushGroundSpace(shot.x, shot.y, shot.heading, 1, -1);
  // The shaft trails *behind* the point, so the bright end is the end that
  // arrives -- which is the end a player has to judge.
  dlPolyBegin();
  dlPoint(-px(SHAFT), 0);
  dlPoint(0, 0);
  dlPolyEnd(DL_CAP_ROUND, `rgba(${skin.wedge},0.55)`, 1.5, 0, 0);
  dlPolyBegin();
  dlPoint(-px(SHAFT) * 0.28, 0);
  dlPoint(0, 0);
  dlPolyEnd(DL_CAP_ROUND, "rgba(255,255,255,0.95)", 2.5, 0, 0);
  dlXformEnd();
  if (upright) dlXformEnd();
}

/** Every arrow in the frame, in frame order. **The top-down entry point**: under
 *  iso the arrows go through the depth walk one at a time instead, sorted in
 *  among the bodies, and this is not called at all. */
function drawShots(shots) {
  for (const shot of shots) drawShot(shot);
}

/** A health bar above the body. Drawn once anything is wounded or anything
 *  hostile is in the room, so an empty room looks exactly as it did before the
 *  spawn buttons existed and the bars *appearing* is itself the news.
 *
 *  **In the overlay layer, so it is never occluded.** A body standing on a wall's
 *  north side is cut in half by the rock and its bar is not, which is the right
 *  way round: the bar is drawn at all only because `canSee` says the character
 *  can see that body, and half a health bar behind a block would be the page
 *  taking back information the sim has already granted. It is the same argument
 *  `drawHeroThrough` makes -- the room's depth is a picture and the readouts hung
 *  over it are not part of that picture.
 *
 *  Its width is still a radius thing and its height still `anchorY`'s: a bar as
 *  tall as the body it belongs to would be a wall of colour over a Rogue. */
function drawHealth(unit, skin) {
  const frac = clamp(unit.maxHp > 0 ? unit.hp / unit.maxHp : 0, 0, 1);
  const w = Math.max(16, px(unit.radius) * 2.4);
  const h = 3.5;
  const x = projX(unit.x, unit.y) - w / 2;
  const y = anchorY(unit) - 8;

  dlRoundRect(x - 1, y - 1, w + 2, h + 2, 2, DL_FILL, "rgba(9,11,16,0.72)", 0);
  dlRect(x, y, w * frac, h, frac > LOW_HEALTH ? skin.bar : "#ff5f52");
}

/** One corpse. **Both skips stay in here** rather than being lifted into the
 *  caller: `buildDrawList` tests only the first of them, on the equivalent
 *  `age < CORPSE_MS`, and leaving the pair where they are is what stops the two
 *  ever drifting apart. A corpse that lands in the draw list and then draws
 *  nothing costs one call. */
function drawCorpse(c) {
  const t = c.age / CORPSE_MS;
  if (t >= 1) return;
  // Through `skinOf` for the reason `drawShot` gives: a corpse is the body that
  // was standing here a moment ago and may not change table on the way down.
  const skin = skinOf(c);
  // Settling as it fades, so a death reads as a body going down rather than
  // a sprite being switched off. As its own silhouette, facing the way it was
  // facing: a Brute that fell has to be recognisable as the Brute that fell,
  // or the room after a fight is a scatter of anonymous smudges.
  const r = px(c.radius) * (1 - 0.45 * t);
  if (r < 0.4) return;
  if (PROJ.upright) {
    // The same body that was standing a moment ago, sinking into the floor as it
    // fades. **No rotation** -- there is none in the billboard that preceded it,
    // and the shrink is toward the ground point rather than toward the middle, so
    // what settles is a figure going down on the spot it died on.
    //
    // Not `groundSpace`: this is the *upright* silhouette and shearing it would
    // lay a standing figure over on the floor at 26.57 degrees, which is neither
    // standing nor lying down.
    dlXform(1, 0, 0, 1, projX(c.x, c.y), projY(c.x, c.y), 0, r * PROJ.ex, -1);
    dlPath(
      uprightPaintOf(c.kind),
      DL_FILL,
      `rgba(${skin.glow},${(0.42 * (1 - t)).toFixed(3)})`,
      DL_NO_PAINT,
      0, 0, 0
    );
  } else {
    pushGroundSpace(c.x, c.y, c.facing, r, -1);
    dlPath(
      silhouettePaintOf(c.kind),
      DL_FILL,
      `rgba(${skin.glow},${(0.42 * (1 - t)).toFixed(3)})`,
      DL_NO_PAINT,
      0, 0, 0
    );
  }
  dlXformEnd();
}

/** Every corpse on the floor, oldest first. **The top-down entry point**, on
 *  exactly the terms `drawShots` is: under iso each corpse goes through the depth
 *  walk at its own depth instead. */
function drawCorpses() {
  for (const c of corpses) drawCorpse(c);
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

/** The page's own copy of `--sans` from style.css:29. Repeated rather than read
 *  because `ctx.font` takes a font shorthand and cannot see a custom property.
 *  System faces only: a web font would be this repository's first external
 *  dependency. House rule 1. */
const SANS = 'ui-sans-serif, system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

/** How long a damage number lives, how far it climbs, and how many may be up at
 *  once. The cap is the interesting one and **the argument for it got stronger,
 *  not weaker, when the feed grew**: the event feed holds 128 rows now, most of
 *  which are footfalls and phase changes that float nothing -- but a crowded
 *  room can still put dozens of damage rows in one frame, and two dozen numbers
 *  on screen is already not a readout, it is a snowstorm. So this stays at 24
 *  while `MAX_EVENTS` quadrupled. */
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
  // **A row with no actor at all reads `undefined` here, and that works by
  // accident.** `EVENT_PORTAL` and `EVENT_DESCEND` carry `actor = 255`, which
  // is past `ID_INDEX_SPAN`, so this lookup is `undefined`, the loop below
  // matches nothing, and the function answers `true` -- which is the right
  // answer for a fact about the level rather than about a body. It is an
  // accident because `byIndex` is only 128 long: raise `MAX_UNITS` past that
  // and 255 becomes a live slot, at which point a portal row would inherit
  // whatever body happens to be standing in it. See `ID_INDEX_SPAN`.
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
      // The row is handed over, not the index: the pill copies the two body
      // numbers it needs off it once, here, so that it never has to ask a body
      // that may not exist by the time it is drawn. See `pushCallout`.
      pushCallout(event, state.byIndex[event.actor]);
    } else if (event.kind === EVENT_SHOVE && event.amount >= RIG_SHOVE_FLOOR) {
      // A flinch, on the body that was shoved -- `actor` is the shoved one and
      // `other` is whoever did it.
      //
      // **The threshold is not optional and the module says so.** `EVENT_SHOVE`
      // is by far the highest-rate row in the feed, about 5.7 a tick and nine
      // rows in ten of everything the frame carries, and almost all of them are
      // `World::apply_recoil` billing a fighter for its own swing. A blow
      // landing is rare and large; a recoil is constant and small. Without
      // `RIG_SHOVE_FLOOR` every swinging body in the room twitches continuously,
      // and `amount` is in the row precisely so a consumer can have a floor.
      //
      // Seeded onto the page's own record and **not** onto anything the sim can
      // see. `drawRig` tips and squashes the stack by it; it never translates
      // the feet, because the sim has already moved the body -- the shove *is*
      // the position change, and doubling it would stand the figure off its own
      // collision ring.
      const body = state.byIndex[event.actor];
      const page = body ? bodies.get(body.id) : null;
      if (page) page.recoil = 1;
    }
    // EVENT_PARRY is deliberately not floated. `drawMarks` already puts sparks
    // on the blades that crossed, at the point they crossed at, and a second
    // announcement of the same instant would be noise.
    //
    // And the six kinds this function has never heard of fall straight
    // through, which is the append-only rule working rather than an omission --
    // see the `EVENT_*` block. `art-09` takes the death and the rest.
  }
}

/** Says once, and only once, that the module's event cap ate rows.
 *
 *  `frame[14]` is the module's own count of what `MAX_EVENTS` turned away, and
 *  it is in the header precisely so that "the cap is generous" is checkable from
 *  the console instead of believed. Latched rather than printed per frame,
 *  because a warning that repeats sixty times a second is a warning nobody
 *  reads -- and because the interesting fact is *that it happened at all*.
 *
 *  Called from `loop` beside `consumeEvents` and under the same `ticks > 0`
 *  guard: a frame that stepped nothing is still holding the last call's header,
 *  and counting that twice would overstate the first occurrence.
 *
 *  **It does not name the cap**, and that is the point rather than an omission.
 *  `MAX_EVENTS` is the one mirrored constant with no export behind it, so this
 *  page's copy cannot be checked against the module's at boot or by
 *  `wasm_check`; printing it here would let a stale 128 send somebody to edit a
 *  number that is no longer there. The count that *is* printed came out of
 *  `frame[14]`, which the module wrote this frame, and the file to go and read
 *  is named instead of the value in it. */
let eventsDroppedWarned = false;
function warnIfEventsWereDropped(state) {
  if (eventsDroppedWarned || !(state.eventsDropped > 0)) return;
  eventsDroppedWarned = true;
  console.warn(
    `[frame] the module dropped ${state.eventsDropped} event rows this frame ` +
      `(its own count, from frame[14]). Damage numbers and callouts are being ` +
      `lost; raise MAX_EVENTS in crates/web/src/lib.rs, not here.`
  );
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

function pushCallout(event, actor) {
  const action = event.amount | 0;
  for (const c of callouts) {
    if (c.actor === event.actor && c.action === action && c.age < CALLOUT_REPEAT_MS) return;
  }
  // `x, y` is where the swinger was standing when it declared, kept only as the
  // fallback for after it falls: while it is alive the pill tracks it.
  //
  // `radius, kind` are the same idea about the *height* the pill hangs at, and
  // they are not a fallback -- they are the answer, alive or dead. **A callout is
  // a thing that was said, and where it hangs is a property of the moment it was
  // said, not of whether the sayer is still standing.** These are exactly the two
  // fields `bodyTopWorld` reads, so the record answers that question for itself
  // for the whole of its 900 ms.
  //
  // Which matters because a pill routinely outlives its body: a callout is
  // declared at *windup*, `CALLOUT_MS` is 900, and the blow it names is often the
  // one that gets the swinger killed. This used to fall back to a fixed 0.5-radius
  // Fighter, so on the single frame the actor's row left the frame the pill
  // teleported to whatever height *that* body would have hung at -- at
  // `scale = 86`, up 13 px for a Fighter, up 33 for a Rogue, **down 34 for a
  // Brute and up 101 for a Skitterer**, straight up or down, mid-fade, while the
  // player is reading it. Nothing was exempt, because 0.5 is not a radius any
  // body in the roster has. Top-down the same discontinuity was at worst 17 px,
  // so it was never new in kind; standing bodies up made it six times worse and
  // made it impossible to miss.
  //
  // Kept as the two inputs rather than as a baked height, so that cycling the
  // view with `G` mid-pill re-answers under the live projection exactly as a live
  // body does. The 0.5 Fighter survives only for the case it was always really
  // for: a declaring row that is *already* gone, which `actorVisible` can let
  // through on the page's own memory of last frame.
  callouts.push({
    actor: event.actor,
    action,
    x: event.x,
    y: event.y,
    radius: actor ? actor.radius : 0.5,
    kind: actor ? actor.kind : BODY_FIGHTER,
    age: 0,
  });
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
 *
 * **The rescale moved the number and not the tick.** Numbers used to be rounded
 * to whole points, which was right against a 14-point blow and is not against a
 * 3.6 one; they now carry a decimal below ten. The tick's argument survives
 * untouched, because it was never an argument about absolute size -- a braced
 * block still leaks `BLOCK_LEAK_BRACED`, 0.08 of the blow, which is 0.29 of a
 * Fighter's best and reads exactly as small beside a hit as it always did.
 */
function drawFloaters() {
  if (!floaters.length) return;
  const size = Math.round(clamp(px(0.42), 12, 20));
  // Built once for the whole pass, exactly as the `ctx.font` it replaces was:
  // every item below carries a reference to this one string, so the frame hands
  // the allocator the same single template literal it always did.
  const font = `700 ${size}px ${SANS}`;
  // The alignment, the baseline and the round join were four `ctx` writes above
  // this loop, inside a `save` whose only job was to scope them. They are item
  // fields now, which is what makes the round join -- shared by the block tick
  // and the numbers' outline -- a property of the marks rather than of the
  // order the marks happen to be drawn in.
  const TEXT_STATE = DL_ALIGN_CENTER | DL_BASELINE_MIDDLE;
  for (const f of floaters) {
    const t = f.age / FLOATER_MS;
    if (t >= 1) continue;
    // Eased out, so most of the climb happens in the first third and the number
    // is clear of the body by the time the eye arrives at it.
    const rise = (1 - (1 - t) * (1 - t)) * FLOATER_RISE;
    // And fading only in the last third, for the same reason: one that starts
    // fading immediately is one you have to already have been looking at.
    const alpha = t < 0.66 ? 1 : Math.max(0, 1 - (t - 0.66) / 0.34);
    // **The rise is a height, not a walk north.** Folding it into `f.y` and
    // projecting that -- which is what this did -- makes a number climb
    // *diagonally* up and to the left under iso, because travelling north is what
    // that expression says and travelling north is what it would look like. A
    // number rising off a body rises up the screen. So the rise comes out of the
    // projection and becomes a `lift`, which is the same pixels: `lift === px`
    // in both projections, so `FLOATER_RISE` keeps its exact meaning.
    //
    // The jitter comes out of the *y* for the same reason and lands, exactly, as
    // a horizontal screen nudge in both projections: `ax` is 1 in both tables, so
    // the x picks up `f.jitter * 0.3 * scale` px and the y -- projected from the
    // unjittered point -- picks up nothing. Which is what it is for. It is a hand's
    // width sideways so two numbers over two bodies standing close together
    // separate, and sideways on the screen is where it has to be.
    //
    // Top-down these are **output-identical, and only the x is byte-identical.**
    // `projX(wx, wy)` is `px(wx)` and `projY(wx, wy)` is `px(wy)` there, so the x
    // is the expression it always was -- it never read `f.y` at all. The y is
    // not: it was `px(f.y - rise)` and is now `px(f.y) - px(rise)`, which are
    // equal in the reals and not always equal in doubles, because the subtraction
    // now happens after two roundings instead of before one. Roughly a third of
    // sampled inputs come out one or two ulp apart, worst case under 2e-12 px --
    // eleven orders of magnitude under the quarter-device-pixel snap `viewOrigin`
    // already applies to every one of these, and far under anything `fillText`
    // can resolve. So no glyph moves and the `[tactical]` picture is the same
    // picture; what is not claimed is that the number handed to the canvas is the
    // same bits, because for a third of frames it is not. Worth the extra
    // sentence: it is the one expression this session changed rather than moved,
    // and the next person diffing draw calls will find it.
    const x = projX(f.x + f.jitter * 0.3, f.y);
    const y = projY(f.x, f.y) - lift(rise);

    if (f.kind === EVENT_BLOCK) {
      dlPolyBegin();
      dlPoint(x - 5, y);
      dlPoint(x - 1, y + 4.5);
      dlPoint(x + 6, y - 5);
      dlPolyEnd(
        DL_CAP_ROUND | DL_JOIN_ROUND,
        `rgba(180,220,255,${(0.9 * alpha).toFixed(3)})`,
        2.4,
        0, 0
      );
      continue;
    }

    // One decimal below ten, and no floor. Rounding was right when a blow was 14
    // and a graze was 1.7; at a best blow of 3.6 it rounds a Skitterer's cut and a
    // Rogue's to the same "2", and it rounds every point of the power stat away --
    // one point is 0.075 of a multiplier, which is a quarter of a point of damage
    // and exactly the thing this scale exists to make visible. And the floor now
    // lies in the other direction: a graze is 0.12 of a blow, so "1" over a
    // six-health Skitterer claims a seventh of its bar for something that took a
    // twentieth.
    const text = f.amount >= 10
      ? String(Math.round(f.amount))
      : (Math.round(f.amount * 10) / 10).toFixed(1);
    // The outline and the body are two items because they are two colours, and
    // the outline is the one the seam counts as a stroke -- which is right: a
    // `strokeText` tessellates every glyph's contour exactly as a `stroke` does.
    dlText(
      text, x, y, font,
      DL_STROKE | DL_JOIN_ROUND | TEXT_STATE,
      `rgba(6,8,13,${(0.85 * alpha).toFixed(3)})`,
      3
    );
    dlText(
      text, x, y, font,
      DL_FILL | TEXT_STATE,
      f.hurt ? `rgba(255,104,92,${alpha.toFixed(3)})` : `rgba(255,241,214,${alpha.toFixed(3)})`,
      0
    );
  }
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
  // **One `font`, measured with and drawn with.** It used to be a `ctx.font`
  // assignment inside the loop and a `ctx.measureText` on the next line, which
  // were the same font because they were adjacent. Across the seam they are a
  // query into `draw.js` and an item consumed a few hundred items later, and
  // "adjacent" stops being an argument -- a pill sized in one font and filled in
  // another is a defect this shape makes possible and the old one could not.
  // So there is one binding and both read it, which is the only version of that
  // guarantee that survives somebody editing one of the two lines.
  const font = `600 12px ${SANS}`;
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
    //
    // **Only the position comes from the live row.** How high the pill hangs is
    // `bodyTopWorld(c)` -- the record carries the `radius` and `kind` it was
    // declared with, which is the whole of what that function reads -- so the
    // height is continuous across the frame the actor falls on instead of
    // snapping to a stand-in body's. See `pushCallout` for the rule and the
    // pixels it was worth.
    let x = c.x;
    let y = c.y;
    const actor = state.byIndex[c.actor];
    if (actor) {
      x = actor.x;
      y = actor.y;
    }

    const alpha = t < 0.72 ? Math.min(1, t / 0.06) : Math.max(0, 1 - (t - 0.72) / 0.28);
    const label = actionName(c.action);
    const h = 20;
    const icon = 14;
    const padX = 7;
    const gap = 5;
    const w = padX * 2 + icon + gap + dlMeasureTextWidth(font, label);
    const cx = projX(x, y);
    // Above the health bar rather than on it, and rising a few pixels as it
    // goes, so two pills over two bodies standing close together separate.
    const top = projY(x, y) - lift(bodyTopWorld(c)) - 18 - h - 6 * (1 - (1 - t) * (1 - t));

    // The pill's alpha covered five draws and was put back with a
    // `globalAlpha = 1` at the bottom of the loop rather than with a `restore`.
    // A push carrying it is the same thing said the way the rest of the list
    // says it, and it cannot be left behind by a `continue`.
    dlXform(1, 0, 0, 1, 0, 0, 0, 1, alpha);
    dlRoundRect(cx - w / 2, top, w, h, h / 2, DL_FILL, "rgba(10,13,20,0.88)", 0);
    dlRoundRect(cx - w / 2, top, w, h, h / 2, DL_STROKE, "rgba(255,196,92,0.55)", 1);

    dlXform(1, 0, 0, 1, cx - w / 2 + padX, top + (h - icon) / 2, 0, icon / 24, -1);
    dlPath(dlPaintFrame(iconGlyph(c.action)), DL_FILL, "rgba(255,214,140,0.95)", DL_NO_PAINT, 0, 0, 0);
    dlXformEnd();

    dlText(
      label,
      cx - w / 2 + padX + icon + gap,
      top + h / 2 + 0.5,
      font,
      DL_FILL | DL_BASELINE_MIDDLE,
      "rgba(233,240,252,0.96)",
      0
    );
    dlXformEnd();
  }
}

// ---------------------------------------------------------------- the depth layer
//
// **Walls that occlude what stands behind them**, which is the whole of what this
// layer is for and the reason the room has depth at all. Under iso only: top-down
// the walls are drawn inside `drawLevel` before anything else and every body is
// over them, which is correct there, because top-down there is nothing to be
// behind.
//
// The depth key is `wx + wy`, in world units, for everything on the ground. That
// is exactly what `projY` depends on -- `projY = (wx + wy) * scale / 2` -- so it
// *is* the screen y of the ground point, which is what a painter's algorithm
// sorts on. Nothing here needs a second derivation of "which is in front".
//
// The walls do not go in that list. They are already sorted -- baked once per
// level into one `Path2D` per depth row, `d = tx + ty` -- so the frame's work is a
// **merge**: walk the sorted item list, and before each item flush every band that
// stands in front of it.

const ITEM_BODY = 0;
const ITEM_CORPSE = 1;
const ITEM_SHOT = 2;

/**
 * The frame's drawable things, in one pooled list.
 *
 * **Pooled exactly like the parse rows, and for the same reason** -- see the
 * parse pool's block comment: nothing on this page allocates once it is running,
 * and a fresh array of fresh `{kind, ref, depth}` objects sixty times a second is
 * a GC sawtooth built into the render path. `drawItems` only ever grows, and only
 * when a frame carries more rows than any frame before it has, which the caps
 * bound at `MAX_UNITS` bodies plus `MAX_SHOTS` arrows plus however many corpses
 * can be laid down inside `CORPSE_MS`.
 *
 * `drawCount` is the live length. The slots past it hold last frame's references
 * and are never read: `pushItem` overwrites all three fields of a slot before
 * anything can look at it.
 */
const drawItems = [];
let drawCount = 0;

function resetDrawList() {
  drawCount = 0;
}

function pushItem(kind, ref, depth) {
  while (drawItems.length <= drawCount) drawItems.push({ kind: 0, ref: null, depth: 0 });
  const it = drawItems[drawCount++];
  it.kind = kind;
  it.ref = ref;
  it.depth = depth;
}

/**
 * The depth of the point a body will actually be **painted** at.
 *
 * **The sort key has to be the depth of the thing on screen, because the merge
 * walk is a painter's algorithm and a painter sorts what it paints.** That is the
 * rule rather than the special case below, and it is worth stating as one: the day
 * any part of a body stops being drawn at its live ground point, this is the
 * function that has to be told. `iso-05` stands these up as billboards and will
 * come straight back here.
 *
 * Today the two come apart in exactly one place, and that is a ghost. `drawBody`
 * paints an unseen body at the frozen pose out of `bodies` rather than at its live
 * row -- drawing the live row would be a wallhack with a fade on it -- so
 * `unit.x + unit.y` would sort a ghost at coordinates nothing on screen is
 * standing on. Top-down that cost nothing, because nothing was sorted at all.
 * Under iso a Skitterer that steps behind rock and keeps running north has its
 * outline painted at the corridor mouth and sorted at the far-north depth, so every
 * wall band between the two flushes before it and the ghost comes out cut in half
 * by a block it is plainly standing south of; send it south instead and the ghost
 * floats over a block it is behind. Bounded by the `GHOST_FADE_MS + GHOST_HOLD_MS`
 * a pose survives, and plainly visible for every millisecond of it.
 *
 * **No ghost-staging logic here, deliberately.** This never asks whether the ghost
 * has expired, and it must not learn to: a body past `GHOST_HOLD_MS`, and a body
 * the character has never seen at all, draw nothing whatever, so their depth
 * decides nothing and falling back to the live coordinates is harmless. One copy
 * of the staging, in `drawBody`, is what keeps the two answers from drifting.
 *
 * `bodies` is a `Map` and `get` allocates nothing, so this keeps the frame's
 * no-allocation rule intact.
 */
function bodyDepth(unit) {
  if (canSee(unit)) return unit.x + unit.y;
  const remembered = bodies.get(unit.id);
  return remembered ? remembered.x + remembered.y : unit.x + unit.y;
}

/**
 * Everything that stands on the floor this frame, unsorted.
 *
 * **The same set the top-down arm draws, and no more.** Corpses, the monsters, the
 * hero, the arrows. It is `state.monsters` and `state.hero` rather than
 * `state.units` on purpose, exactly as the arm it replaces: `parseFrame` files
 * only the *first* hero-faction row as `state.hero`, so a second one is in `units`
 * and in neither of these -- and it is not drawn today either. Changing that set
 * is not this session's business.
 *
 * The corpse test is `age < CORPSE_MS`, which is `drawCorpse`'s own `t >= 1` skip
 * with the division taken off both sides. It is a *filter*, not a contract: both
 * of `drawCorpse`'s skips are still inside `drawCorpse`, so the worst this can be
 * wrong by is one item pushed that draws nothing.
 *
 * The hero goes in like anything else. See `drawHeroThrough` for why that is safe
 * and what replaces the rule it breaks.
 *
 * A body's depth comes from `bodyDepth` rather than from its live row, because an
 * unseen one is drawn at a remembered pose and the sort has to agree with the
 * paint. A corpse and an arrow are each drawn exactly where they say they are, so
 * for those two the live coordinates *are* the answer.
 *
 * **Nothing here is culled against the window, and nothing needs to be.** The wall
 * bands are, because a band is a diagonal across the whole room and there are
 * `cols + rows - 1` of them; a body is one draw call and the list is bounded by
 * `MAX_UNITS` at 64 plus `MAX_SHOTS` at 32 plus the corpses. `canSee` already
 * skips the ones the character cannot see, in `drawBody`, and an off-screen draw
 * call is a clipped no-op in the rasteriser. Culling here would buy a hundred
 * comparisons and cost a screen-bounds test that has to agree with the camera.
 */
function buildDrawList(state) {
  resetDrawList();
  for (const c of corpses) if (c.age < CORPSE_MS) pushItem(ITEM_CORPSE, c, c.x + c.y);
  for (const unit of state.monsters) pushItem(ITEM_BODY, unit, bodyDepth(unit));
  if (state.hero) pushItem(ITEM_BODY, state.hero, bodyDepth(state.hero));
  for (const shot of state.shots) pushItem(ITEM_SHOT, shot, shot.x + shot.y);
}

/**
 * Insertion sort, ascending by depth.
 *
 * **Not `Array.prototype.sort`, and that is a measurement rather than a taste.**
 * V8's sort is TimSort, which allocates a work array above about 22 elements, and
 * this list runs to a hundred in a full room -- so the one call would put a
 * kilobyte of garbage per frame into a render path whose entire discipline is that
 * it allocates nothing.
 *
 * Insertion sort is also the *right* algorithm for this input, not merely the
 * allocation-free one: the list is near-sorted every single frame, because bodies
 * move by fractions of a world unit between frames and the build order is already
 * roughly depth order. Insertion sort is O(n) on a nearly sorted list and pays
 * its O(n^2) only on the frame after a teleport.
 *
 * **Permuting the pool is safe.** The slots are interchangeable containers; every
 * one of them has all three of its fields overwritten by `pushItem` before
 * anything reads it, so it does not matter which slot a given frame's item lands
 * in or which one it landed in last frame.
 */
function sortDrawList() {
  for (let i = 1; i < drawCount; i++) {
    const it = drawItems[i];
    const d = it.depth;
    let j = i - 1;
    while (j >= 0 && drawItems[j].depth > d) {
      drawItems[j + 1] = drawItems[j];
      j--;
    }
    drawItems[j + 1] = it;
  }
}

/** One depth row of lit masonry: the rock's tops, then its sides, then the same
 *  two for any doorway on the band, then the bracket, the flame and the flame's
 *  core for any torch on it. Each is `null` for a band the bake never wrote to --
 *  a band that crosses only open floor, or only rock the character has never seen
 *  -- and a `side` can be an empty path where every block on the band is interior.
 *
 *  **Up to seven fills a band, and the reason there are that many paths at all is
 *  that a fill is one `fillStyle`.** Door geometry appended to `wallBandTop` would
 *  come out in the wall's own colour and be invisible; a flame appended to the
 *  door's would come out as timber. What all seven *share* is the band, which is
 *  the expensive half -- there is no new entry in the depth list and nothing new
 *  to sort, and a doorway or a torch is occluded by the rock in front of it
 *  because it is on the same anti-diagonal its own tile is.
 *
 *  The order within a band is the order the materials are set into each other. A
 *  door is set into a wall, so where a jamb and the block beside it overlap the
 *  jamb wins; a torch is nailed to the face of whichever of the two it hangs on,
 *  so it wins over both.
 *
 *  **The torch paths are `null` with the art off**, which is the one asymmetry: a
 *  doorway is geometry a tactical plan needs and a torch is paint, so `[tactical]`
 *  and `[dev]` bake none and fill none. */
function fillBand(d) {
  const top = levelPaths.wallBandTop[d];
  if (top !== null) dlPath(dlPaintFrame(top), DL_FILL, WALL_TOP, DL_NO_PAINT, 0, 0, 0);
  const side = levelPaths.wallBandSide[d];
  if (side !== null) dlPath(dlPaintFrame(side), DL_FILL, WALL_XFACE, DL_NO_PAINT, 0, 0, 0);
  const doorTop = levelPaths.doorBandTop[d];
  if (doorTop !== null) dlPath(dlPaintFrame(doorTop), DL_FILL, levelPaths.doorTop, DL_NO_PAINT, 0, 0, 0);
  const doorSide = levelPaths.doorBandSide[d];
  if (doorSide !== null) dlPath(dlPaintFrame(doorSide), DL_FILL, levelPaths.doorSide, DL_NO_PAINT, 0, 0, 0);
  if (levelPaths.torchBandStem === null) return;
  const stem = levelPaths.torchBandStem[d];
  if (stem !== null) {
    dlPath(dlPaintFrame(stem), DL_FILL, TORCH_IRON, DL_NO_PAINT, 0, 0, 0);
    // Always all three, and never one without the others: `bandPath` allocates
    // them in the same iteration of the bake, so a band with a bracket on it has
    // a flame and a core on it.
    dlPath(dlPaintFrame(levelPaths.torchBandFlame[d]), DL_FILL, TORCH_FLAME_TONE, DL_NO_PAINT, 0, 0, 0);
    dlPath(dlPaintFrame(levelPaths.torchBandCore[d]), DL_FILL, TORCH_CORE_TONE, DL_NO_PAINT, 0, 0, 0);
  }
}

function drawItem(it, now) {
  if (it.kind === ITEM_BODY) drawBody(it.ref, now);
  else if (it.kind === ITEM_CORPSE) drawCorpse(it.ref);
  else drawShot(it.ref);
}

/**
 * The merge walk: the sorted items and the sorted bands, in one pass.
 *
 * **A wall block at band `d` occludes anything whose ground point is behind its
 * near plane.** The near plane is the block's south corner, at world
 * `wx + wy = (d + 2) * tile`: the tile spans `[tx*T, (tx+1)*T]` on each axis, so
 * its largest `wx + wy` is `(tx + 1 + ty + 1) * T`. That value is the band's sort
 * key, and the rule is then uniform with the items' own -- flush the band before
 * the first item that stands at or in front of it, which leaves everything behind
 * it already painted and therefore covered.
 *
 * With a block at `(tx, ty)`, `d = tx + ty`, and a body standing on the middle of
 * an adjacent tile:
 *
 * | body position | body depth | `(d+2)*T <= depth`? | result |
 * |---|---|---|---|
 * | tile **south** of the wall | `(d+2)*T` | true  | band fills first -> body over the wall, and it is nearer |
 * | tile **north** of the wall | `d*T`     | false | body first, band after -> the wall occludes it |
 * | tile **east**  of the wall | `(d+2)*T` | true  | band first -> body over the wall |
 *
 * That table is the argument for the whole session; the code below is four lines
 * of it.
 *
 * **`(d + 2) * tile` and not `d + 2`.** The plan wrote the bare comparison, which
 * is right only while a tile is one world unit. It is, today -- and
 * `map_tile_size_milli` exists in the module precisely so that the page does not
 * bake that in, with a comment saying a client that gets it wrong draws the whole
 * level at the wrong scale while every test still passes. So the band's key is
 * converted into the world rather than the depth key into tiles, which also keeps
 * `depth` meaning exactly `wx + wy` -- the thing `projY` depends on, and the thing
 * every comment here reasons about.
 *
 * **Ties keep build order, because the sort is stable**, so two things standing on
 * the same ground point come out corpse, body, arrow -- which is the order the
 * top-down arm draws them in, and it is what keeps "arrows over the bodies, so one
 * crossing a fight is not hidden by it" true here as well.
 */
function walkDrawList(now, origin) {
  // **The visible band range in two divisions.** Band `d` spans screen y
  // `[d*w/2 - L, (d+2)*w/2]`: `projY` depends only on `wx + wy`, so every tile on
  // the band has its north corner at exactly `d*w/2` and its south corner at
  // `(d+2)*w/2`, and the lifted top face is that same interval raised by `L`. So
  // the band intersects the window iff `(d+2)*w/2 >= yTop` and `d*w/2 - L <= yBot`,
  // which is `d >= 2*yTop/w - 2` and `d <= 2*(yBot + L)/w`.
  //
  // `floor` on the first and `ceil` on the second, so each rounds *outward*: the
  // range can include a band that turns out to be off screen, and can never drop
  // one that is on it. At default framing that is about two dozen bands and four
  // dozen fills a frame, which the measurements say is nothing.
  //
  // **Reads the bake, like `drawLevel`.** `bandCount` is zero for a top-down bake,
  // and a frame that reached here with one is a stale bake the loop's
  // `levelPaths.proj` guard did not catch. The guard below makes that bodies in
  // depth order over no walls, rather than a division by a zero band width.
  //
  // All four numbers come out of the bake and none is re-derived here. `bandL` is
  // the one that had to be added for it: `lift(WALL_H)` off the live `scale` is
  // equal to the baked one on every frame that can exist, but the paragraph above
  // reasons about the height the *bands were baked at*, and a value that has to
  // match the bake should be read from it rather than recomputed and argued about.
  let band = 0;
  let lastBand = -1;
  if (levelPaths.bandCount > 0) {
    const w = levelPaths.bandW;
    const L = levelPaths.bandL;
    const hi = levelPaths.bandCount - 1;
    const yTop = -origin.y;
    const yBot = -origin.y + viewport.h;
    band = clamp(Math.floor((2 * yTop) / w) - 2, 0, hi);
    lastBand = clamp(Math.ceil((2 * (yBot + L)) / w), 0, hi);
  }
  const tile = levelPaths.bandTile;

  // One `save`/`restore` for the whole walk, not one per band: `fillBand` leaves a
  // `fillStyle` behind and every item draw saves and restores its own state, so
  // this is the only place the walk could leak into the overlay layer below it.
  //
  // **`globalAlpha` is set here and not assumed.** The lines `fillBand` replaced
  // stated it, inside `drawLevel`'s own save; `fillBand` fills at whatever the
  // ambient alpha happens to be, and every caller today leaves it at 1. Setting it
  // inside this save makes that a local invariant rather than a file-wide one --
  // the walls are lit rock and are meant to be opaque, and nothing above this
  // should be able to make them not.
  //
  // Both of those are now the root `XFORM_PUSH` below -- an identity matrix and
  // an alpha, which is `ctx.save()` and `ctx.globalAlpha = 1` and nothing else.
  // It matters more since commit 2 than it did before it, and for exactly the
  // reason it was written: the ground layer emits into the same list now, so the
  // thing this push is holding the walls apart from is no longer "the overlay
  // below" but a route bead and a vision ring three items up.
  //
  // **The merge itself has not moved and must not** (`art-04` §6). The three
  // lines that carry it -- the band cursor, the `(band + 2) * tile` comparison
  // and the flush after the last item -- are the same three lines, in the same
  // order, over the same module-scope pool sorted by the same insertion sort.
  // What changed is that `fillBand` and `drawItem` now *emit* where they used to
  // paint, and `dlDraw` walks what they emitted in exactly the order they
  // emitted it. The reset and the walk are `render`'s, not this function's:
  // there is one list a frame.
  dlXform(1, 0, 0, 1, 0, 0, 0, 1, 1);
  for (let i = 0; i < drawCount; i++) {
    const it = drawItems[i];
    while (band <= lastBand && (band + 2) * tile <= it.depth) fillBand(band++);
    drawItem(it, now);
  }
  // Whatever is left of the visible range stands in front of every item there was.
  while (band <= lastBand) fillBand(band++);
  dlXformEnd();
}

/** The hero's outline, over the whole scene. Built once from the skin so the
 *  outline and the body cannot disagree about what "hero" is coloured, and so the
 *  frame does not build a string to say it.
 *
 *  **The art table and not a branch**, because `drawHeroThrough` is called from
 *  inside `render`'s `PROJ.upright` arm and nothing else calls it. A ternary here
 *  would be a mode question asked at module scope, where the answer cannot change,
 *  and would put a second copy of the choice `skinOf` makes somewhere nobody would
 *  think to look for it. */
const HERO_THROUGH = `rgba(${HERO_SKIN_ART.glow},0.55)`;

/**
 * The hero, read through whatever is standing in front of it.
 *
 * **This is the successor to "the hero draws last", and it is a replacement rather
 * than a weakening.** The old rule said monsters first and then the hero, so that
 * the character you are commanding could never end up underneath the thing
 * attacking it. Under iso that rule cannot be kept without lying about geometry:
 * a hero standing north of a wall block *is* behind it, and drawing it in front
 * would make the room's depth mean nothing exactly when the player is relying on
 * it. So the hero is depth-sorted like everything else, and the old rule's
 * *intent* -- that you can always see what you are commanding -- is carried by
 * this instead. The hero is never in front of everything, and it is never
 * *invisible*.
 *
 * One stroke of one small closed path, unconditional. Where nothing covers the
 * hero it sits exactly on its own edge and reads as a slightly brighter rim;
 * where a monster or a wall covers it, it reads through. Strokes are the scarce
 * resource on this page and this is one un-dashed outline of one body, which is
 * the cheapest possible thing that could do the job.
 *
 * **It traces the body's own billboard**, from `UPRIGHTS`, under exactly the
 * transform `drawCharacter` used -- `translate` to the ground point, uniform
 * `scale(px(r) * ex)`, no rotation. Not a re-derivation of it and not an
 * approximating box: an outline half a body off the body it is outlining is
 * worse than no outline, because it reads as a second thing standing there.
 * `lineWidth` is divided back out by the scale, so it comes out 1.5 device
 * pixels at every zoom the way it did when this was a screen circle.
 *
 * Called only from the depth-walk arm of `render`, which is `PROJ.upright` only,
 * so there is no flat arm here to keep. Top-down the hero is simply drawn last,
 * which is the old rule and still correct there.
 *
 * **No depth bias on the hero, now or later without reading this.** Giving it
 * `depth + 0.35` so it wins near-ties breaks the merge walk's monotonicity: the
 * band cursor has already advanced past a band that a later, shallower item still
 * needs drawn before it, and the cursor cannot go back. The symptom is one frame
 * of flicker as a body crosses a band boundary, which is miserable to chase. If
 * the knob is ever wanted it belongs in `iso-07` §4, with its artefact stated.
 */
function drawHeroThrough(hero) {
  const s = px(hero.radius) * PROJ.ex;
  if (!(s > 0)) return;
  dlXform(1, 0, 0, 1, projX(hero.x, hero.y), projY(hero.x, hero.y), 0, s, -1);
  dlPath(uprightPaintOf(hero.kind), DL_STROKE | DL_LOCAL_WIDTH, HERO_THROUGH, DL_NO_PAINT, 1.5 / s, 0, 0);
  dlXformEnd();
}

/**
 * A pinned wall clock for the painters, **off by default and never set by the
 * page**. A session instrument for `art-04`, not a golden and not in `tools/`.
 *
 * Pausing the sim freezes the *tick*; it does not freeze `now`. Seven painters
 * animate on the wall clock and keep animating while paused -- the portal's two
 * counter-spinning arcs, the torch flicker, `drawReach`'s beat,
 * `drawLock`/`drawDestination`'s beat, `drawRoute`'s dash offset, `drawTrail`
 * and `drawSprint`'s chevrons -- so two `toDataURL()` strings taken a frame
 * apart on a paused room differ, and the refactor gate `art-04` is built on
 * ("the same picture, byte for byte, before and after") cannot be run at all
 * without this. It is one comparison per frame on a value the loop already has.
 *
 * From the console: `freezeRenderClock(1000)` to pin it, `freezeRenderClock()`
 * to hand the painters the real clock back.
 */
let frozenRenderNow = null;

function freezeRenderClock(at) {
  frozenRenderNow = Number.isFinite(at) ? at : null;
}

function renderClock(now) {
  return frozenRenderNow === null ? now : frozenRenderNow;
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

  // **One list, from the floor to the last arrow.** Commit 1 had to reset and
  // draw three times, because `drawReach` still painted straight onto the
  // context between the corpses and the bodies and that ordering may not move.
  // With the ground layer emitting there is nothing left in between, so the two
  // layers concatenate -- and concatenating runs that were flushed separately is
  // provably the same picture, because `dlDraw` is a straight walk in emission
  // order and emission order is paint order. The overlay joins in commit 3 and
  // then the frame is one list and one walk.
  dlReset();
  dlLayerIs(DL_GROUND);

  // The compositing order, and it is the map of the whole layer. Three layers
  // under iso, and the middle one collapses to a flat list top-down:
  //
  //   GROUND LAYER   (no depth; today's painter order)
  //     level          floor passes (pattern -> vignette -> grid, all three
  //                    inside each pass's own clip) -> walls -> lantern
  //     the way out -> trail -> route -> destination -> vision discs
  //     iso            -> reach rings, hoisted ahead of the depth walk
  //   DEPTH LAYER
  //     iso            lit wall bands  x  { corpses, monsters, hero, arrows }
  //     top-down       corpses -> reach rings -> monsters -> hero -> arrows,
  //                    with the walls already down inside the level
  //   OVERLAY LAYER  (screen space)
  //     hero outline   iso only
  //     health bars -> floaters -> callouts
  //     art           -> grain, one cached tile over the whole canvas
  //
  // Three of those placements are load-bearing. **Vision goes under the
  // bodies**, because a disc drawn over one would put a wash of faction colour
  // across the blade you are trying to read, and six of them overlap in a busy
  // room. **Floaters and callouts go over everything**, including each other's
  // bodies, because a number you cannot read is not a number. And **the way out
  // is on the ground**, under the trail and everything else -- it is a place,
  // not a marker. It is also nothing at all for most of a floor: nothing marks
  // the exit while monsters live, so this row is empty until the level is
  // cleared and then blooms at the last kill.
  //
  // **Two more are inside the `level` row, and an earlier draft of this diagram
  // had both of them wrong** -- it listed "floor passes, lantern, remembered walls,
  // grid", which is neither the order `drawLevel` runs nor an order that would
  // work. The grid is stroked *inside* each floor pass rather than after the walls,
  // because it is clipped to all the ground the character knows about and that clip
  // is the pass's own; `drawLevel` argues that where it strokes it. And the lantern
  // is **last**, after the rock rather than before it: twenty lines above the
  // `drawLantern` call turn on exactly that ordering, first top-down (it takes the
  // outer half of the edge stroke down with it at range) and then under iso (it
  // misses the lit bands entirely, because those are filled after `drawLevel` has
  // returned -- which is draw order and not the clip).
  //
  // The reach rings were missing from the diagram altogether, on the iso side. They
  // are a ground decal like any other and the branch below hoists them ahead of the
  // depth walk for that reason; top-down they stay in the depth list between the
  // corpses and the bodies, which is the argument on the branch itself.
  //
  // **What used to be a fourth load-bearing rule was "monsters first, then the
  // hero", and it could not survive the depth layer.** Its successor is
  // `drawHeroThrough`, which carries the argument in full: the hero is
  // depth-sorted like everything else and is never *invisible*, because it gets an
  // outline pass over the whole scene after the depth walk. What the old rule was
  // protecting -- that you can always see what you are commanding -- is what
  // survives, and what it was asserting, that the hero is in front of the room,
  // is what an isometric room cannot be told.
  //
  // What used to sit second here was the reachable box: the arena inset by one
  // body radius. It went with the rectangle it described. The honest successor
  // on a carved level would be a tint over gaps a body cannot fit down, which
  // is worth having only if playing without it turns out to want it.
  // The level takes the frame now: the lantern is centred on the character, and
  // that is the only reason -- everything else about the ground is baked. It
  // takes `origin` too, so it can clamp its two full-arena composites to the
  // window; passed rather than re-derived, so there is one camera transform on
  // this page and not two. And `now`, for the torch flicker -- the wall clock,
  // like every other presentational animation in this file, never the tick.
  drawLevel(state, now, origin);
  // Drawn in every mode, seen or not -- and now only ever *after* the level is
  // cleared, at the spot the last thing died. See its own comment for the
  // decision that retired the shut ring this used to draw as well. It stays
  // outside the fog on a weaker but still good argument: the exit only exists
  // because you cleared the room, so there is nothing left on the floor to
  // discover it *from*, and a way out you have to re-find after earning it is a
  // fetch quest. One of the two knowing inconsistencies in the fog; `left N` is
  // the other, and it counts every monster alive because it is the level's clear
  // condition, not a perception.
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
  // arithmetic; at a full room this gate is the difference between 15.69x the
  // screen in blended fill **across the whole page** and 2.60x, and it is the whole
  // of why a crowd was unplayable.
  //
  // **`readoutsOn()` sits at the call and never inside `drawVision` or
  // `drawReach`**, and the same goes for the reach loops below and the wedge in
  // `drawCharacter`'s ground pre-pass. Those functions are not touched by this
  // column at all, so `[tactical]` -- the A/B control for the whole isometric
  // conversion -- is the same code drawing the same pixels it drew before the
  // mode existed. A gate inside the function would have been fewer lines and
  // would have put the mode question in the middle of the drawing, which is the
  // one thing this table is arranged to prevent. `Y` is unaffected: it is
  // `drawVision`'s own first line, so it governs the two modes that still have
  // discs and means nothing in `[world]`, which has none to hide.
  for (const unit of state.units) {
    if (readoutsOn() && canSee(unit)) drawVision(unit, unit === state.hero || (locked !== null && unit.id === locked));
  }
  // **One branch, and everything that differs between the two projections is
  // inside it.** Above this line and below it, both modes run the same calls in
  // the same order.
  //
  // **Gated on `PROJ.upright` and never on `artOn()`.** They are the same bit
  // today, because art is on in exactly the one mode that is isometric, and they
  // stop being the day a fourth view mode exists -- see the `PROJ_TOPDOWN` table
  // for why the projection has its own column. This is the single easiest mistake
  // to make in this conversion.
  //
  // **The reach-ring loop is written twice and that is deliberate.** Under iso it
  // has to come before the depth walk, because a reach ring is a flat ground decal
  // and every ground decal now precedes the walls -- which is *more* correct than
  // hoisting it would be: a ring that runs onto rock should be hidden by the rock.
  // Top-down it has to stay exactly where it is, between the corpses and the
  // bodies, or `Tactical` and `Dev` stop being byte-identical: today a reach ring
  // is painted over a corpse and hoisting the loop would put it under one. Under
  // top-down the walls are drawn inside `drawLevel` before anything else, so
  // "ground decals precede the walls" is already true there and there is nothing
  // to gain by moving it. Two copies of one line is the honest cost of keeping the
  // A/B control intact, and the control is worth more than the line.
  if (PROJ.upright) {
    for (const unit of state.units) {
      if (readoutsOn() && canSee(unit)) drawReach(unit, skinOf(unit), now);
    }
    // The whole depth layer: build, sort, merge with the wall bands. Bodies go
    // through `drawBody`, which is where "or the memory of one" lives.
    dlLayerIs(DL_DEPTH);
    buildDrawList(state);
    sortDrawList();
    walkDrawList(now, origin);
    // Over the walk and under the health bars. The successor to "the hero draws
    // last" -- `drawHeroThrough` has the argument. It is an overlay mark emitted
    // from the depth branch, which is why the layer label changes here and not
    // at the bottom of the branch.
    dlLayerIs(DL_OVERLAY);
    if (state.hero && canSee(state.hero)) drawHeroThrough(state.hero);
  } else {
    // Today's lines, verbatim, and they are the A/B control for the whole
    // conversion. Do not tidy them toward the arm above.
    //
    // **One list, and the reach-ring loop is still exactly where it was.** Commit
    // 1 had to break this arm into three lists because a ring painted onto the
    // context between two runs that emitted; the ordering it protects -- a ring
    // over a corpse and under a body -- is unchanged, and it is now carried by
    // the position of the loop in the *emission* order rather than by a flush.
    // That is a stronger guarantee than it was, not a weaker one: there is one
    // sequence and one walk, and nothing can get between them.
    dlLayerIs(DL_DEPTH);
    drawCorpses();

    dlLayerIs(DL_GROUND);
    for (const unit of state.units) {
      if (readoutsOn() && canSee(unit)) drawReach(unit, skinOf(unit), now);
    }
    // Monsters first, then the hero: the character you are commanding must never
    // end up underneath the thing attacking it. Through `drawBody`, which is where
    // "or the memory of one" lives.
    dlLayerIs(DL_DEPTH);
    for (const unit of state.monsters) drawBody(unit, now);
    if (state.hero) drawBody(state.hero, now);
    // Arrows over the bodies, so one crossing a fight is not hidden by it.
    drawShots(state.shots);
  }

  dlLayerIs(DL_OVERLAY);
  const fighting = state.monsters.length > 0;
  for (const unit of state.units) {
    if (canSee(unit) && (fighting || unit.hp < unit.maxHp)) drawHealth(unit, skinOf(unit));
  }

  drawFloaters();
  drawCallouts(state);

  // The grain, last of everything and over the lot. **Gated on `artOn()` and not
  // on the projection**: it is a treatment of the picture, and `[tactical]` and
  // `[dev]` are the A/B control, which a wash over the whole canvas would end.
  //
  // "Last of everything" is now a fact about the list rather than about this
  // line: the grain is the final item emitted, and the walk below is in emission
  // order, so nothing can get over it without being written after it here.
  if (artOn()) drawGrain();

  // **One list, one walk, the whole frame.** Everything above this line emitted;
  // this is the only call into the backend a frame makes, and after it the
  // context is exactly as `render`'s preamble left it. That is the end state
  // `art-04` was paid for: the seam is one function call wide.
  dlDraw();
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
 * lands in the world; only the wobble waits. Rounded to *tenths* because that is
 * the precision the globe itself is drawn at -- it is the number printed over the
 * liquid, and `hp1` prints a decimal below ten -- so this cannot be a redraw the
 * picture would not show. It was whole points when the number was, and the two
 * have to move together or the argument in this paragraph stops being true.
 * `maxHp` is in because a hero swap changes it and the liquid is a fraction of it.
 *
 * The DOM readouts beside it -- `el.unitHp` and the `#hp-fill` bar -- are
 * written every frame regardless, in `updateHud`. Nothing here touches them.
 */
const GLOBE_MS = 33;
let globeDrawnAt = -Infinity;
let globeDrawnHp = -1;
let globeDrawnMaxHp = -1;

/** The globe's three rim tones as `r,g,b` triples, because the rim is stroked twice
 *  at two alphas and `rgba()` cannot be handed a hex. Built once at module scope,
 *  not per redraw -- this is 30 Hz work, but it is still work that never changes. */
const GLOBE_RIM_DEAD = palRgb(PAL.boneDim).join(",");
const GLOBE_RIM_LOW = palRgb(PAL.bloodHot).join(",");
const GLOBE_RIM_OK = palRgb(PAL.bone).join(",");

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

  // The empty well behind the liquid. Lit from the same upper-left the room is,
  // and in the room's own stone rather than in a blue-grey: this is the inside of
  // a vessel standing in an umber dungeon, and it is what a globe at one hit point
  // is almost entirely made of.
  const well = g.createRadialGradient(mid - r * 0.35, mid - r * 0.45, r * 0.08, mid, mid, r);
  well.addColorStop(0, "#241a14");
  well.addColorStop(1, PAL.void);
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

    // **Blood in both states, and `low` is now a brightness alarm rather than a
    // hue change.** It used to be cyan going red, which is the loudest signal a
    // globe can send and is exactly the one a globe that is red to begin with
    // cannot send. What replaces it is the pool *lighting up*: `PAL.bloodHot` at
    // the surface over `PAL.blood` at depth, where a healthy globe is `PAL.blood`
    // over near-black. That is a jump in brightness across the whole liquid, at
    // the same `LOW_HEALTH` threshold, and it is still the thing you catch out of
    // the corner of an eye with the globe in the bottom corner.
    //
    // Stop 0 is the surface and stop 1 the bottom of the vessel, so the two tones
    // are also just where light and depth put them.
    const liquid = g.createLinearGradient(0, top - r * 0.4, 0, css);
    liquid.addColorStop(0, low ? PAL.bloodHot : PAL.blood);
    liquid.addColorStop(1, low ? PAL.blood : PAL.void);
    g.fillStyle = liquid;
    g.fill();

    // A brighter meniscus, so the top of the liquid reads as a surface rather
    // than as the edge of a fill. Bone, and the same bone at any health: the
    // surface catches the room's light whatever is under it, and the state is
    // carried by the two things above and below that are large.
    g.strokeStyle = "rgba(201,191,168,0.75)";
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
    g.fillStyle = "rgba(11,10,8,0.72)";
    g.fillRect(0, 0, css, css);
  }
  g.restore();

  // The rim, which is the part that goes red. Two strokes: a wide soft one for
  // the glow and a hard one for the edge. `PAL.bone` is the band of warm iron the
  // vessel is set in; `PAL.bloodHot` is what it does at the threshold, and it is
  // the *only* place on the page where the low state is announced by something
  // that is not itself the amount. Dead drops to `PAL.boneDim` at 0.45 alpha --
  // the same iron with nothing lit behind it.
  //
  // Read from `PAL` rather than typed out. All three of these were spelled as
  // literal triples until the sentence above was checked against them, which is the
  // cheapest possible demonstration of why a comment naming a constant and a line
  // repeating its channels is two copies of one fact.
  const rim = !hero ? GLOBE_RIM_DEAD : low ? GLOBE_RIM_LOW : GLOBE_RIM_OK;
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
    const text = hp1(Math.max(0, hero.hp));
    g.lineJoin = "round";
    g.lineWidth = 4;
    g.strokeStyle = "rgba(11,10,8,0.85)";
    g.strokeText(text, mid, mid - css * 0.02);
    // Bone at any health. The colour used to fork with `low` and no longer needs
    // to: the liquid behind it changes brightness at that threshold and the rim
    // around it changes hue, so a third copy of the same bit was buying nothing
    // and cost the number its one job, which is to be the same legible number all
    // the way down.
    g.fillStyle = PAL.bone;
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
    // **Where**, not just "send in a new one". A replacement now arrives at the
    // spot the last one died rather than somewhere safe, and a player who is
    // not told that reads their second death in ten seconds as the button being
    // broken.
    tail = "send in a new one where it fell, or press R for a new room";
  } else if (standing === 0) {
    cls = "state idle";
    // "Opened", past tense and where: the exit is not a fixture of the level
    // that has unlocked, it is a thing that has just appeared at the last kill,
    // and the player has to be told to look there. `quiet` is the branch for a
    // room with nothing in it and no exit either -- a sandbox scenario, and the
    // one place `portalState` is still 0 with nothing standing.
    head = state.portalState ? "clear" : "quiet";
    tail = state.portalState ? "the way out opened at the last kill" : "nothing left to fight";
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
  // Keyed in tenths, because tenths are what the globe prints now (`hp1`). Keyed
  // in whole points -- which is what this was -- a graze worth 0.4 changes the
  // number over the liquid without changing the key, and the globe shows the old
  // one until the 30 Hz tick catches up.
  const globeHp = hero ? Math.round(hero.hp * 10) : -1;
  const globeMaxHp = hero ? Math.round(hero.maxHp * 10) : -1;
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
  // One decimal below ten, the same rule the floaters and the globe follow. A
  // bar that runs 0 to 12 rounded to whole points cannot show the graze that
  // just took a twentieth of it, and this is the readout a player checks a
  // number against rather than glances at.
  setText(el.unitHp, hero ? `${hp1(hero.hp)} / ${hp1(hero.maxHp)} hp` : "fallen");
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

    // ---- the rig's page-side state, and it is exactly three things.
    //
    // **Everything the rig can get out of the frame, it gets out of the frame.**
    // The walk comes from `stride` and `vx`/`vy`, the attack from `swing`,
    // `swingLeft` and `swingSpan`, the blade from `limbAngle` and `limbReach` --
    // none of that is here, and none of it should be. What is here is the two
    // things a single frame genuinely cannot answer: how the velocity is
    // *changing*, and how long ago somebody was shoved.
    //
    // The lean is **garnish** and the rule about garnish is absolute: it may
    // never misrepresent reach, bearing or phase. It moves the torso and the
    // head, it does not reach the blade, and it is clamped to `RIG_LEAN` radii
    // before it leaves this function.
    //
    // `dv` is a difference of *blended* velocities across an animation frame,
    // which is not an acceleration in any unit anybody would name -- a frame is
    // up to `MAX_CATCHUP_TICKS` ticks and often none. That is tolerable here and
    // nowhere else in this session, because the result is clamped to a hard
    // bound and low-passed before it moves a pixel: the worst a bad estimate can
    // do is lean a figure the full third of a radius it was always allowed to.
    // The walk deliberately does *not* work this way; see `RIG_WALK_FULL`.
    let leanAlong = 0;
    let leanSide = 0;
    let recoil = 0;
    if (prior) {
      // Aged on the paused-aware clock with the floaters, the callouts and the
      // corpses, so a frozen world does not quietly finish somebody's flinch
      // while the player is looking at it.
      recoil = Math.max(0, (prior.recoil || 0) - elapsed / RIG_RECOIL_MS);
      leanAlong = prior.leanAlong || 0;
      leanSide = prior.leanSide || 0;
      if (visible) {
        const dvx = unit.vx - prior.vx;
        const dvy = unit.vy - prior.vy;
        // Into the body frame. `+along` is the facing and `+side` is the body's
        // left, which is `(sin f, -cos f)` in a world whose `+y` is down the
        // screen -- the same left `rig.js` projects.
        const cf = Math.cos(unit.facing);
        const sf = Math.sin(unit.facing);
        const wantA = clamp((dvx * cf + dvy * sf) / RIG_LEAN_FULL, -1, 1) * RIG_LEAN;
        const wantS = clamp((dvx * sf - dvy * cf) / RIG_LEAN_FULL, -1, 1) * RIG_LEAN;
        const k = clamp(elapsed / RIG_LEAN_MS, 0, 1);
        leanAlong += (wantA - leanAlong) * k;
        leanSide += (wantS - leanSide) * k;
      }
    }

    bodies.set(unit.id, {
      x: pose.x,
      y: pose.y,
      radius: pose.radius,
      faction: unit.faction,
      // The velocity the next frame differences against, and the pose's rather
      // than the live row's for the reason every other field here is: a ghost is
      // a body nobody is watching, and an acceleration read off a row the player
      // cannot see is the same wallhack the frozen position exists to prevent.
      vx: pose.vx,
      vy: pose.vy,
      leanAlong,
      leanSide,
      recoil,
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
  // already parsed -- there was a second full `parseFrame` here, and deleting it
  // is what this argument bought. The null guard covers the first frame and the
  // frames straight after a `restart` or a hero swap, where the only cost is one
  // frame with no aim in it.
  //
  // **What `pushInput` reads out of that state is no longer just `state.hero`**,
  // and an earlier draft of this comment said it was. `iso-07` gave the manual aim
  // a hit test: under an upright projection with `CONTROL_LIMB` held it calls
  // `unitAt(pointer, state)`, which walks `state.monsters` and asks `canSee` per
  // row. Passing `curr` got *more* load-bearing when that landed rather than less
  // -- the pick has to see the same frame the hero was read from, and `view` at
  // this point in `loop` is still last frame's blend.
  //
  // Its own phase still, and now for the opposite reason to the one that was
  // written here. This used to say the phase "costs nothing"; under `[world]`
  // with the limb modifier held it carries an O(monsters) walk, so it is a number
  // that grows with a full room and wants to be visible when it does. In every
  // other configuration -- both top-down modes, or the modifier not held -- it is
  // still the two hypots and a `set_input` it was. `pushInput`'s own comment has
  // the gate and why the cost is only paid where the module will read the result.
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
  } else if (wasm.furniture_revision() !== levelPaths.furniture) {
    // A door opened. **This fires on no path that exists today** and is here for
    // the same reason the `art`/`fog` and `proj` arms below are: the module moves
    // `map_revision` and `furniture_revision` together on both of the two paths
    // that can move either -- a new floor, and the tick a door opens -- so the
    // first arm has already caught it.
    //
    // `world-07` was supposed to be the day it started firing and it was not:
    // the torches are furniture the floor plan genuinely has nothing to say
    // about, but they are fixed for the life of a level, so they move only when
    // the floor plan does. What this still guards is a piece of furniture that
    // changes on its own -- a torch that goes out, a chest that opens -- and the
    // failure is a doorway drawn shut over a hole forever rather than for one
    // frame.
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
  } else if (levelPaths.proj !== PROJ.id) {
    // The same belt and the same braces, on the matrix. `setViewMode` writes
    // `PROJ` and then rebuilds, and the `scale` arm above would very likely catch
    // a projection change anyway -- `fit` is projection-dependent, so the zoom
    // usually moves with it. **Usually is not a guarantee**, and the failure it
    // guards is the nastiest of the four: a stale projection leaves the *shape* of
    // every baked tile wrong while the level, the fog and the zoom are all right,
    // which is a bug that looks like a broken matrix rather than a missed
    // invalidation. Recording `proj` and then not checking it would be worse than
    // not recording it.
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
  if (ticks > 0) {
    consumeEvents(curr);
    // Under the same guard and for the same reason: `frame[14]` belongs to the
    // ticks that just ran, and a frame that stepped nothing is still holding
    // the last call's header.
    warnIfEventsWereDropped(curr);
  }
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

  // `pick`: the hit test under the cursor, which is O(monsters) and therefore one
  // of the two numbers in this list that grow with a full room. It was the only
  // one when this line was written; `input` became the other in `iso-07`, which
  // gave the manual aim a pick of its own. A frame still pays for at most one of
  // them, on the complementary gates argued below.
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
  // **The first of those gates is why this is still the only `unitAt` a frame
  // pays for.** `pushInput` picks too, to aim the sword at a body rather than at
  // the floor behind it -- but only under `CONTROL_LIMB`, which is exactly the
  // mask this one refuses. The two are complementary and never both run.
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
  render(view, renderClock(now), arrived || settled);
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

/**
 * Both projections, forward then back, on a coarse grid.
 *
 * The same argument as the `FRAME_LAYOUT_VERSION` handshake above it, one layer
 * out: a page with no test harness can still check the one thing that would
 * otherwise cost a day. `PROJ_TOPDOWN` and `PROJ_ISO` each carry a 2x2 and its
 * inverse written out by hand, and a sign wrong in the second one does not crash
 * -- it puts every click a plausible distance from where it was made, which
 * reads as a gameplay bug and not as a matrix typo. Costs nothing at boot and
 * turns that into a console line.
 *
 * **Every row, including any not currently selected.** Written when `PROJ_ISO`
 * was still unreachable and this was the only thing that would notice it going
 * wrong before anything drew through it; `world` selects it now, so the sweep
 * has stopped being the sole witness for that row and has not stopped being the
 * sole witness for the next one somebody adds.
 *
 * The four checks below are the same idea one layer down, and each covers a
 * seam the round trip cannot see. The round trip proves a matrix against its own
 * inverse and says nothing about the two booleans beside it, nothing about the
 * `ex` the upright art was baked against, nothing about which `VIEW_MODES` row
 * pairs that projection with which `art` setting, and nothing about which row
 * claims to be for reading numbers off while suppressing them -- and every one
 * of those is a bit the renderer branches on.
 */
function assertProjection() {
  const was = PROJ;
  for (const p of [PROJ_TOPDOWN, PROJ_ISO]) {
    PROJ = p;
    for (let wx = 0; wx <= 48; wx += 6) {
      for (let wy = 0; wy <= 32; wy += 4) {
        const sx = projX(wx, wy);
        const sy = projY(wx, wy);
        console.assert(
          Math.abs(unprojX(sx, sy) - wx) < 1e-9 && Math.abs(unprojY(sx, sy) - wy) < 1e-9,
          `projection ${p.id} round-trip failed at ${wx},${wy}`
        );
      }
    }
  }
  PROJ = was;

  // **`shear` and `upright` are one bit written twice, and nothing else in the
  // file checks that they agree.** Three places read the pair and no two of them
  // read the same member: `rebuildLevelPaths` decides on `shear` whether to band
  // the lit rock, `render` gates the depth walk on `upright`, and `drawLevel`
  // gates on the `proj` id the bake recorded. Today all three agree because both
  // flags are `false` in one row and `true` in the other.
  //
  // A fourth row with `shear: true, upright: false` would bake every lit block
  // into a band, draw only the remembered pair, and never walk -- so **all lit
  // rock on the level would simply be missing**, with nothing thrown and nothing
  // logged. That is the failure class `iso-00` §3 names for `art` and `iso`, one
  // level down: two bits that are the same bit today and stop being it the day the
  // table grows a row. A projection that genuinely wants them apart has to make
  // the bake and the walk read one bit first; until it does, this says so at boot.
  //
  // Over `PROJECTIONS` rather than the pair above, so a fourth row is checked by
  // being added to the table and not by remembering to come back here.
  for (const p of Object.values(PROJECTIONS)) {
    console.assert(
      p.shear === p.upright,
      `projection ${p.id} has shear ${p.shear} and upright ${p.upright}: the wall bake reads one and the depth walk reads the other`
    );
    // **The silhouette and the rig are both baked against one `ex` and there is
    // only one place that says which.** `UPRIGHTS` is built at module scope,
    // before a view mode exists to ask, so its paths are authored against
    // `PROJ_ISO.ex` literally -- half-width 1 meaning `px(r) * ex`, and a crown
    // at `-BODY_H / ex` meaning `lift(bodyHeight(unit))`.
    //
    // **And since `art-05` it guards more than the art it was written for.**
    // `UPRIGHTS` stopped being the body and became the silhouette -- the outline
    // `drawHeroThrough`, the ghost, `drawCorpse` and the hit flash each want and
    // none of which wants seven pieces -- while the body itself is `drawRig`,
    // whose `height / ex` term is the same expression `uprightTop` uses and is
    // the reason a segment declared at `BODY_H[kind]` lands on the crown the
    // health bar hangs from. So a second upright projection with a different
    // `ex` would now draw every body at the wrong height *and* stand its parts
    // at a different one from its own outline -- silently, because all three
    // halves of the mistake are self-consistent. Rebuilding the paths and
    // re-deriving `rigProject` per projection is the fix if that day comes;
    // until then this is the tripwire.
    console.assert(
      !p.upright || p.ex === UPRIGHT_EX,
      `projection ${p.id} stands bodies up with ex ${p.ex}, but UPRIGHTS and drawRig were both authored against ${UPRIGHT_EX}`
    );
  }

  // **The rig's projection is the ground projection, and this is the proof.**
  //
  // `rigProject` gets a body-local point onto the screen by rotating into the
  // facing and collecting terms in `camBearing`; `groundSpace` plus `lift` gets
  // a *world* point there by the route every decal on the floor already takes.
  // The two have to agree exactly or the drawn weapon is not on the projected
  // true blade line -- which is the one claim in `art-05` that is not
  // negotiable, since the blade is the hitbox.
  //
  // Nothing else can catch it. The two derivations share no code: one is two
  // lines of trigonometry in billboard units, the other is `PROJ_ISO`'s 2x2
  // applied to a world offset. A sign error in either draws a plausible figure
  // holding a blade a few degrees off the segment the sim is testing, which
  // looks like nothing at all until somebody dies to a cut they were watching.
  //
  // It also pins `pi/4` as the camera bearing: `camBearing(PI/4)` is zero, and a
  // body at that facing has its forward point straight down the screen and
  // nearest the camera, which is what "the camera looks down the +x/+y diagonal"
  // means in numbers.
  const wasProj = PROJ;
  PROJ = PROJ_ISO;
  const wasScale = scale;
  scale = 64;
  for (const facing of [0, 0.7, Math.PI / 4, 2.3, -1.9, Math.PI]) {
    for (const [along, side, height] of [[1, 0, 0], [0, 1, 0.5], [-0.4, -0.8, 2.1]]) {
      const radius = 0.45;
      const s = px(radius) * PROJ.ex;
      const cf = Math.cos(facing);
      const sf = Math.sin(facing);
      // The same point as a world offset: forward along the facing, and left,
      // which is `(sin f, -cos f)` in a world whose `+y` is down the screen.
      const wx = radius * (along * cf + side * sf);
      const wy = radius * (along * sf - side * cf);
      const wantX = projX(wx, wy);
      const wantY = projY(wx, wy) - lift(radius * height);
      rigProject(along, side, height, Math.cos(camBearing(facing)), Math.sin(camBearing(facing)));
      console.assert(
        Math.abs(rigOutX * s - wantX) < 1e-9 && Math.abs(rigOutY * s - wantY) < 1e-9,
        `rigProject disagrees with groundSpace at facing ${facing}, local ${along},${side},${height}: ` +
          `got ${rigOutX * s},${rigOutY * s} want ${wantX},${wantY}`
      );
      // And the depth key really is twice the ground part of the y term, which
      // is the whole of "things further from the camera sit higher on the
      // screen, by exactly half the depth key".
      console.assert(
        Math.abs(rigOutD / 2 - height / UPRIGHT_EX - rigOutY) < 1e-12,
        `rigProject's depth key is not the y term's numerator at facing ${facing}`
      );
    }
  }
  console.assert(Math.abs(camBearing(Math.PI / 4)) < 1e-12, "camBearing(pi/4) is not zero");
  // The crown, which is the assertion `art-05` would have wanted before it
  // started rather than after: a segment declared at `BODY_H[kind]` has to land
  // on `uprightTop(kind)`, or the rig hangs the health bar off nothing.
  for (const kind of [BODY_FIGHTER, BODY_ROGUE, BODY_BRUTE, BODY_SKITTERER]) {
    rigProject(0, 0, BODY_H[kind], 1, 0);
    console.assert(
      Math.abs(rigOutY - uprightTop(kind)) < 1e-12,
      `a rig segment at BODY_H[${kind}] does not reach uprightTop: ${rigOutY} vs ${uprightTop(kind)}`
    );
  }
  scale = wasScale;
  PROJ = wasProj;

  // **The fourth cell of `drawCharacter`'s branch table, closed the same way.**
  // The shape branch there is on `art` and the space branch is on
  // `PROJ.upright`, which is right and is what `iso-00` §3 asks for -- but the
  // two are never composed, so `upright && !art` falls through to the flat arm
  // *inside* the billboard's `ctx.scale(px(r) * ex)`. What that draws is a
  // screen-space `arc(0, 0, 1)`: a **round** disc, roughly 61 px across at
  // default framing, standing where the sim's circle projects to a 61 x 30
  // ellipse. Its `lineWidth = 1 / r` comes out 1.4 device pixels rather than
  // one. And the ground pre-pass that paints the honest collision ring is gated
  // `upright && art`, so the real edge would not be drawn at all -- a shape the
  // sim treats as hittable, painted the wrong shape, with nothing on screen
  // showing where the hitbox is. House rule 4, and `iso-00` §3's failure class
  // one level down: two bits that are the same bit today.
  //
  // Over `VIEW_MODES` rather than `PROJECTIONS`, because a projection cannot be
  // artless on its own -- a *mode* pairs the two -- and so a fourth row is
  // checked by being added to the table rather than by remembering this exists.
  // The fix, when somebody wants that mode, is a real upright `!art` arm: a
  // plain billboard in billboard space and the ring left to the ground pre-pass.
  // That is a session and not a line, so until then this says so at boot.
  for (const mode of VIEW_MODES) {
    const p = PROJECTIONS[mode.proj] || PROJ_TOPDOWN;
    console.assert(
      mode.art || !p.upright,
      `view mode ${mode.id} stands bodies up with art off: drawCharacter has no upright !art arm, so its collision circle would be drawn round and the real ellipse not at all`
    );
  }

  for (const m of VIEW_MODES) {
    // A dev view is a view you read numbers off. One with the readouts suppressed
    // is a worse [world] with the fog off, which is not a mode anybody wants and
    // is the kind of row that gets added by copying the one above it.
    if (m.dev && !m.readouts) throw new Error(`view "${m.id}": dev without readouts`);
  }
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
  //
  // **The projection is taken from the table here even so**, on the line below.
  // Everything else the setter does is either already true in the markup or a
  // courtesy the page is entitled to defer; the matrix is neither. Every draw call
  // below reads it, so leaving it at its declaration's fallback is not "the
  // preference has not been applied yet", it is a different room.
  buildViewGroup();
  updateViewButtons();

  // `viewMode`'s initialiser and `PROJ`'s are two declarations of the same fact,
  // and this is the line that makes them agree. `PROJ` cannot derive itself where
  // it is declared -- `VIEW_MODES` and `PROJECTIONS` are a thousand lines further
  // down the file and do not exist yet -- so it holds `PROJ_TOPDOWN` as a
  // fallback, and boot is the first point at which both halves are in scope.
  //
  // Without it the page came up with `viewMode === "world"` and a top-down
  // matrix: it baked and drew a flat room with the art on while the `World`
  // segment was lit, and the isometric room only appeared after three presses of
  // `G` -- all the way round the three modes and back to `world`, where the
  // setter finally wrote what the segment had been claiming since load. It shipped
  // that way from `iso-02`, which is the commit where `world` turned, because
  // that is the commit where the two initialisers stopped saying the same thing.
  //
  // **Before `resize`**, which is the whole reason it sits up here rather than
  // beside the frame parse below: `resize` computes `fit` from `arenaSpan()`,
  // which branches on `PROJ.shear`, and `rebuildLevelPaths` and `snapCamera` after
  // it both work in pixels that came from that `scale` under this matrix. Ordered
  // for the same reason `setViewMode` orders its middle four, and it is the same
  // three calls in the same sequence.
  //
  // Indexed and not switched on, exactly as `setViewMode` indexes it, so an
  // unknown string in the table is a top-down room rather than a page of `NaN`.
  PROJ = PROJECTIONS[currentView().proj] || PROJ_TOPDOWN;

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
  // After `resize`, because `scale` divides out of the inverse and a zero would
  // make every round trip `NaN` -- which `console.assert` would then report as
  // forty failures with nothing wrong.
  assertProjection();
  // The rig's two gradients per skin, into the paint table's **static** region.
  //
  // Here rather than at `dlBind` because a gradient needs a context *and* the
  // palette, and `PAL` and the skins are declared four thousand lines further
  // down this file -- a `const` in the same classic script is in its temporal
  // dead zone until then. Here rather than at first use because a branch per
  // body per frame to answer a question settled once at boot is the sort of
  // thing that ends up in a profile.
  //
  // **The two art skins only.** The rig draws in exactly the mode that has art
  // on and stands bodies up; `[tactical]` and `[dev]` get `skinOf`'s flat pair
  // and never reach `drawRig` at all, and building ramps they would never paint
  // with would be four more entries in a table that is capped at 64.
  rigBuildInks([HERO_SKIN_ART, MONSTER_SKIN_ART], PAL.void);
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
