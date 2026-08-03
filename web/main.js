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
// entity_index, entity_generation, sword_angle_raw, sword_reach, sword_spin,
// shield_angle_raw, shield_reach, weapon_length, shield_arc_raw, hit_flash,
// block_flash, parry_flash].
const HEADER_LEN = 7;
const UNIT_STRIDE = 21;

// Bits accepted by `set_control`, from crates/web/src/lib.rs.
const CONTROL_FEET = 1;
const CONTROL_SWORD = 2;

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
// The first two are also what `swap_in_hero` accepts, and it accepts nothing
// else: a hero built from a monster archetype is a character the HUD would
// describe with the wrong stat block.
const KIND_WARRIOR = 0;
const KIND_SCOUT = 1;
const KIND_BRUTE = 2;
const KIND_SKITTERER = 3;

/** How long a corpse lingers. Milliseconds of wall clock, not ticks: this is an
 *  animation and the sim has no opinion about it.
 *
 *  Hit, block and parry markers used to be timed here too, inferred from health
 *  falling between frames. They now arrive as frame columns from the sim, which
 *  is both simpler and the only way to see a *blocked* blow -- most of the drama
 *  and almost none of the damage. */
const CORPSE_MS = 520;

/** The seed for the room. Nothing in an empty room is random, but the number
 *  is what makes this run the same run every time it is opened. */
const SEED = 1;

/**
 * Stats, and what each one does to the AI -- the claim this page exists to
 * make visible. Mirrored from `crates/sim/src/entity.rs` (`base_stats`) and
 * `crates/sim/src/rules.rs` (the derivations), and used for presentation only:
 * nothing here is fed back into the simulation, so the copy cannot desync
 * anything, it can only be out of date on screen.
 */
const ARCHETYPES = [
  // stats, then the weapon: reach beyond the body, top swing speed in raw angle
  // units per tick, and shield arc half-width in degrees. Mirrored from
  // `UnitKind::weapon` in crates/sim/src/entity.rs.
  { name: "warrior", power: 6, agility: 6, intellect: 8, perception: 6, vitality: 8, reach: 0.95, spin: 2000, arc: 62 },
  { name: "scout", power: 4, agility: 12, intellect: 10, perception: 14, vitality: 4, reach: 0.55, spin: 3000, arc: 45 },
  { name: "brute", power: 12, agility: 2, intellect: 2, perception: 3, vitality: 14, reach: 1.45, spin: 950, arc: 23 },
  { name: "skitterer", power: 3, agility: 9, intellect: 12, perception: 5, vitality: 2, reach: 0.40, spin: 2600, arc: 17 },
];

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

function derived(a) {
  return {
    // "20 - intellect, floored at 1" -- ticks between decisions.
    decisionPeriod: clamp(20 - a.intellect, 1, 120),
    // "(250 + 12 * agility) / 100" units per second, held per tick in the sim.
    moveSpeed: (250 + 12 * a.agility) / (100 * TICKS_PER_SECOND),
    sight: (60 + 6 * a.perception) / 10,
    noise: clamp(15 - a.perception, 0, 15) / 10,
    maxHp: 20 + 8 * a.vitality,
    // Agility drives the hands as well as the feet: "clamp(0.70 + 0.04 *
    // agility, 0.55, 2.00)" scales torque, top spin and extension alike. The
    // half-turn time is what a swing actually costs, which is the number that
    // decides whether an opponent can answer it.
    swing: halfTurnTicks(a),
    // Damage is impact speed now, not a constant, so what power buys is a
    // multiplier on however hard you happened to be swinging:
    // "clamp(0.55 + 0.075 * power, 0.55, 3.0)".
    powerMultiplier: clamp(0.55 + 0.075 * a.power, 0.55, 3.0),
  };
}

/** Ticks to bring a blade half a turn, bang-bang: ramp to the ceiling, coast,
 *  brake. Mirrors `Hand::drive`, and like the rest of `derived` it is for the
 *  panel only -- nothing computed here goes back across the boundary. */
function halfTurnTicks(a) {
  const mult = clamp(0.7 + 0.04 * a.agility, 0.55, 2.0);
  // Torque is quoted at a tucked hand; a committed blade turns at 55% of it.
  const torque = archetypeTorque(a.name) * mult * 0.55;
  const ceiling = a.spin * mult;
  const half = 32768;
  const rampUnits = (ceiling * ceiling) / (2 * torque);
  if (2 * rampUnits >= half) return Math.round(2 * Math.sqrt(half / (2 * torque)));
  return Math.round((2 * ceiling) / torque + (half - 2 * rampUnits) / ceiling);
}

function archetypeTorque(name) {
  return { warrior: 190, scout: 400, brute: 48, skitterer: 330 }[name] || 190;
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
    // The hands. Bearings arrive as binary angles like `facing`, for the same
    // reason: no trigonometry crosses the boundary.
    swordAngle: (f[u + 11] / 65536) * TAU,
    swordReach: f[u + 12],
    swordSpin: f[u + 13],
    shieldAngle: (f[u + 14] / 65536) * TAU,
    shieldReach: f[u + 15],
    weaponLength: f[u + 16],
    shieldArc: (f[u + 17] / 65536) * TAU,
    // Already-decayed 0..1 markers, computed by the sim from its own events.
    hitFlash: f[u + 18],
    blockFlash: f[u + 19],
    parryFlash: f[u + 20],
  };
}

function parseFrame(f) {
  const state = {
    arenaX: f[0] || 24,
    arenaY: f[1] || 16,
    orderKind: f[2],
    orderX: f[3],
    orderY: f[4],
    decisionTick: f[5],
    unitCount: f[6],
    units: [],
    monsters: [],
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
  stats: document.getElementById("stats"),
  orderState: document.getElementById("order-state"),
  orderDest: document.getElementById("order-dest"),
  orderDistance: document.getElementById("order-distance"),
  orderDecision: document.getElementById("order-decision"),
  battleState: document.getElementById("battle-state"),
  battleRoster: document.getElementById("battle-roster"),
  swapRow: document.getElementById("swap-row"),
  simTick: document.getElementById("sim-tick"),
  simPosition: document.getElementById("sim-position"),
  simHash: document.getElementById("sim-hash"),
};

const drawer = document.getElementById("drawer");
const menuButton = document.getElementById("btn-menu");

const DEFAULT_HINT = "Click the floor. The character walks there its own way.";

/**
 * The drawer holding everything that is worth reading but not worth watching.
 *
 * A class rather than the `hidden` attribute, because it has to slide in both
 * directions and `display: none` cannot be animated. The stylesheet takes
 * `visibility` with it, which is what keeps the sliders inside out of the tab
 * order while it is shut -- otherwise `Tab` would open the panel and then walk
 * straight into controls nobody can see.
 */
function setDrawer(open) {
  drawer.classList.toggle("open", open);
  menuButton.setAttribute("aria-expanded", open ? "true" : "false");
}

function drawerOpen() {
  return drawer.classList.contains("open");
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

let viewport = { w: 0, h: 0 }; // the canvas, in CSS pixels
let dpr = 1; // stored, because `render` re-establishes the base matrix each frame
let zoom = 1; // the player's wheel adjustment, re-clamped on every resize
let cam = { x: 12, y: 8 }; // the centre of the view, in world units
let scale = 1; // CSS pixels per world unit

let trail = [];
let pulses = [];

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

/** Where a body was when it stopped being in the frame. Drawn fading, then
 *  dropped; purely a wall-clock animation, like the pulses. */
let corpses = [];

let announcedFall = false;
let lastDecisionSeen = -1;
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
  const box = stage.getBoundingClientRect();
  viewport = {
    w: Math.max(1, Math.floor(Math.max(120, box.width))),
    h: Math.max(1, Math.floor(Math.max(120, box.height))),
  };

  // Two bounds and a preference. `fit` is the scale at which the whole room is
  // on screen, and it is the zoomed-out limit: past it you would be looking at
  // void for no reason. `base` is the framing chosen above. `fit` is always
  // below `base` -- h/16 < h/11 whatever the window is -- so the bounds cannot
  // cross however the page is dragged about.
  const fit = Math.min(viewport.w / arena.x, viewport.h / arena.y);
  const base = viewport.h / VIEW_UNITS_Y;
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
  canvas.width = Math.round(viewport.w * dpr);
  canvas.height = Math.round(viewport.h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

// ------------------------------------------------------------------- camera

/**
 * Where the camera wants to be: the character, pulled back inside the walls.
 *
 * The clamp is what keeps the room's edge meaningful. Walk into a corner and
 * the view stops while the character keeps going, which is the ordinary ARPG
 * read of "you are against the wall" -- and it is why void is only ever visible
 * on an axis the view is genuinely wider than the room on.
 */
function cameraTarget(state) {
  const anchor = state.hero || cam;
  const halfW = viewport.w / scale / 2;
  const halfH = viewport.h / scale / 2;
  return {
    x: halfW * 2 >= arena.x ? arena.x / 2 : clamp(anchor.x, halfW, arena.x - halfW),
    y: halfH * 2 >= arena.y ? arena.y / 2 : clamp(anchor.y, halfH, arena.y - halfH),
  };
}

/** Presentation only, and therefore wall-clock rather than ticks -- the same
 *  convention `trail`, `pulses` and `corpses` follow. The exponential is what
 *  makes the follow look identical at 60 and at 144 Hz. */
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

// -------------------------------------------------------------------- input

/**
 * A click, in world units: the exact inverse of the matrix `render` sets up.
 *
 * `getBoundingClientRect` is CSS pixels -- *not* the DPR-scaled backing store --
 * so this must divide by the rect, never by `canvas.width`. It used to read the
 * fraction across the rect and multiply by the arena, which was only correct
 * while the canvas showed the whole room and nothing else. With a camera the
 * pointer is an offset from the centre of the view, and the centre of the view
 * is `cam`.
 *
 * Nothing is clamped here. A `Goto` is clamped into the arena by `milli`, so a
 * click out in the void parks the order against the wall exactly as a click
 * near the edge already did; the sword wants the raw bearing.
 */
function pointerToWorld(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: cam.x + (event.clientX - rect.left - rect.width / 2) / scale,
    y: cam.y + (event.clientY - rect.top - rect.height / 2) / scale,
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
  const unreachable =
    point.x < r || point.y < r || point.x > arena.x - r || point.y > arena.y - r;
  hint(
    unreachable
      ? "That point is inside the wall. The character will get as close as a body can and stop."
      : `Ordered to (${point.x.toFixed(1)}, ${point.y.toFixed(1)}). It decides how to get there.`,
    unreachable
  );
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
function spawnMonster(kindCode) {
  const name = ARCHETYPES[kindCode].name;
  const standing = wasm.spawn_monster(kindCode);
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
function swapInHero(kindCode) {
  if (!wasm.swap_in_hero(kindCode)) {
    hint("There is already a character in the room.", true);
    return;
  }
  intent = "none";
  // Everything from here down is the page's memory of the character that fell:
  // the path it walked, the rings its thinking left, and the fact that we have
  // already said it died. `bodies` and `corpses` are deliberately *not* cleared
  // -- the corpse should go on fading where it dropped.
  trail = [];
  pulses = [];
  announcedFall = false;
  // The module puts `last_decision_tick` back to zero for a character that has
  // not thought yet. Recording that here first is what stops the change from
  // reading as a decision and flashing a ring nobody took.
  lastDecisionSeen = 0;
  // The replacement drops in at the clearest spot on the floor, which can be
  // right across the room from where the last one fell. Cut to it.
  snapCamera(parseFrame(readFrame()));
  hint(`A ${ARCHETYPES[kindCode].name} takes over. The monsters are where you left them.`, true);
}

function restart() {
  wasm.init(SEED);
  intent = "none";
  trail = [];
  pulses = [];
  bodies = new Map();
  corpses = [];
  announcedFall = false;
  lastDecisionSeen = -1;
  orderKey = "";
  orderAcknowledged = false;
  // `init` builds a fresh `Sim`, which starts with both sides on the baseline
  // and nothing under manual control. The page has to agree, or its dropdowns
  // and toggles describe a module that no longer exists.
  held.clear();
  shieldModifier = false;
  controlMask = 0;
  updateControlButtons();
  syncBehaviourPanel();
  snapCamera(parseFrame(readFrame()));
  hint("Room restarted at tick 0.");
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
// Two independent halves. Steering a swordsman and steering a sword are
// different skills, and either can be handed over without the other -- which is
// most of what makes this page teach anything about the fight.

/** Which halves the player holds, mirrored so the page can label its toggles
 *  without asking wasm every frame. `wasm.control()` remains the truth. */
let controlMask = 0;

/** Keys currently held, for the feet. */
const held = new Set();

/** Where the pointer last was, in world units, for the sword. */
let pointer = { x: 0, y: 0, inside: false };

/** While held, the pointer steers the shield hand instead of the sword. */
let shieldModifier = false;

function setControl(mask) {
  controlMask = mask & (CONTROL_FEET | CONTROL_SWORD);
  wasm.set_control(controlMask);
  if (controlMask & CONTROL_FEET) intent = "manual";
  updateControlButtons();
  hint(controlDescription());
}

function controlDescription() {
  const feet = controlMask & CONTROL_FEET;
  const sword = controlMask & CONTROL_SWORD;
  if (feet && sword) return "You have the feet and the sword. WASD to move, mouse to aim, hold Shift to guard.";
  if (feet) return "You have the feet. WASD to move; the character fights for itself.";
  if (sword) return "You have the sword. Aim with the mouse, hold Shift to steer the shield instead.";
  return DEFAULT_HINT;
}

function updateControlButtons() {
  const feet = document.getElementById("btn-control-feet");
  const sword = document.getElementById("btn-control-sword");
  if (feet) feet.setAttribute("aria-pressed", String(!!(controlMask & CONTROL_FEET)));
  if (sword) sword.setAttribute("aria-pressed", String(!!(controlMask & CONTROL_SWORD)));
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

  // Aim: the bearing from the character to the pointer, and how far out it is
  // as an extension. Pulling the mouse in tucks the blade; pushing it out
  // commits -- two degrees of freedom from one pointer, which is as close to
  // Die by the Sword's mouse as a top-down view gets.
  let aim = 0;
  let reach = 0;
  if (state.hero && pointer.inside) {
    const dx = pointer.x - state.hero.x;
    const dy = pointer.y - state.hero.y;
    aim = Math.round((Math.atan2(dy, dx) / TAU) * 65536) & 0xffff;
    const full = state.hero.radius + state.hero.weaponLength;
    reach = clamp(Math.hypot(dx, dy) / Math.max(full, 0.001), 0, 1);
  }

  wasm.set_input(
    milliSigned(mx),
    milliSigned(my),
    aim,
    Math.round(clamp(reach, 0, 1) * 1000),
    shieldModifier ? 1 : 0
  );
}

function bindInput() {
  canvas.addEventListener("mousedown", (event) => {
    if (dead) return;
    const state = parseFrame(readFrame());
    if (!state.hero) {
      hint("There is nobody left to give orders to. Send in a new character, or press R.", true);
      return;
    }
    if (event.button === 2) {
      event.preventDefault();
      standDown(state);
    } else if (event.button === 0) {
      // Under manual sword control a click is not an order -- the pointer is
      // already saying something every tick, and a `Goto` on top of it would
      // fight the feet the player may also be holding.
      if (!(controlMask & CONTROL_SWORD)) goTo(pointerToWorld(event), state);
    }
  });

  canvas.addEventListener("mousemove", (event) => {
    const p = pointerToWorld(event);
    pointer = { x: p.x, y: p.y, inside: true };
  });
  canvas.addEventListener("mouseleave", () => {
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
    if (event.key === "Shift") shieldModifier = false;
  });
  window.addEventListener("blur", () => {
    held.clear();
    shieldModifier = false;
  });

  window.addEventListener("keydown", (event) => {
    if (dead || event.metaKey || event.ctrlKey || event.altKey) return;
    const key = event.key.toLowerCase();

    // Tab is the drawer, everywhere. It has to be taken off the browser before
    // it moves focus, and it is deliberately handled before the guard below so
    // the panel can still be shut from inside itself.
    if (event.key === "Tab") {
      event.preventDefault();
      setDrawer(!drawerOpen());
      return;
    }

    // A focused slider or dropdown is typing, not playing. Without this, `S` in
    // a gene slider spawns a skitterer and the arrow keys do two things at
    // once -- true before the drawer existed, and much easier to hit now that
    // there is a panel full of controls one keystroke away.
    if (event.target instanceof Element && event.target.closest("input, select, textarea")) {
      if (event.key === "Escape") event.target.blur();
      return;
    }

    if (event.key === "Shift") shieldModifier = true;
    // WASD is only movement while the player holds the feet; otherwise "s" is
    // still the spawn key it has always been.
    if (controlMask & CONTROL_FEET && "wasd".includes(key)) {
      held.add(key);
      event.preventDefault();
      return;
    }
    if (event.key === "Escape") {
      // The drawer first. Escape means "back out of the thing that is open",
      // and standing the character down while a panel is covering half the
      // room is not what the player was asking for.
      if (drawerOpen()) setDrawer(false);
      else standDown(parseFrame(readFrame()));
    } else if (key === "f") {
      freeWill();
    } else if (key === "r") {
      restart();
    } else if (key === "c") {
      if (!event.repeat) setControl(controlMask ^ CONTROL_FEET);
    } else if (key === "v") {
      if (!event.repeat) setControl(controlMask ^ CONTROL_SWORD);
    } else if (key === "s" || key === "b") {
      // The repeat guard is load-bearing rather than polite: held down, the
      // operating system's autorepeat would empty the frame's 64-row budget
      // into the room in about two seconds.
      if (!event.repeat) spawnMonster(key === "s" ? KIND_SKITTERER : KIND_BRUTE);
    } else if (key === "1" || key === "2") {
      if (!event.repeat) swapInHero(key === "1" ? KIND_WARRIOR : KIND_SCOUT);
    }
  });

  menuButton.addEventListener("click", () => setDrawer(!drawerOpen()));

  document.getElementById("btn-standdown").addEventListener("click", () => {
    if (!dead) standDown(parseFrame(readFrame()));
  });
  document.getElementById("btn-freewill").addEventListener("click", () => {
    if (!dead) freeWill();
  });
  document.getElementById("btn-spawn-skitterer").addEventListener("click", () => {
    if (!dead) spawnMonster(KIND_SKITTERER);
  });
  document.getElementById("btn-spawn-brute").addEventListener("click", () => {
    if (!dead) spawnMonster(KIND_BRUTE);
  });
  document.getElementById("btn-swap-warrior").addEventListener("click", () => {
    if (!dead) swapInHero(KIND_WARRIOR);
  });
  document.getElementById("btn-swap-scout").addEventListener("click", () => {
    if (!dead) swapInHero(KIND_SCOUT);
  });
  document.getElementById("btn-control-feet").addEventListener("click", () => {
    if (!dead) setControl(controlMask ^ CONTROL_FEET);
  });
  document.getElementById("btn-control-sword").addEventListener("click", () => {
    if (!dead) setControl(controlMask ^ CONTROL_SWORD);
  });

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

/**
 * The room, as a lit rectangle standing in the dark.
 *
 * This used to fill the canvas, which was true only while the canvas *was* the
 * arena. Now the floor is drawn at its own size in world units and the canvas
 * is left transparent everywhere else, so the page's background shows through
 * as void and the wall is a boundary you can actually see the character stop
 * against.
 */
function drawFloor() {
  const w = px(arena.x);
  const h = px(arena.y);

  ctx.save();
  roundRect(0, 0, w, h, 10);
  ctx.clip();

  const floor = ctx.createLinearGradient(0, 0, w * 0.6, h);
  floor.addColorStop(0, "#161b26");
  floor.addColorStop(1, "#0f131c");
  ctx.fillStyle = floor;
  ctx.fillRect(0, 0, w, h);

  // One line per world unit, brighter every four: the grid is the scale bar.
  // The half-pixel offsets still land on a device pixel because `render` snaps
  // the camera translation to one before any of this is drawn.
  ctx.lineWidth = 1;
  for (let x = 1; x < arena.x; x++) {
    ctx.strokeStyle = x % 4 === 0 ? "rgba(150,180,230,0.14)" : "rgba(150,180,230,0.06)";
    ctx.beginPath();
    ctx.moveTo(Math.round(px(x)) + 0.5, 0);
    ctx.lineTo(Math.round(px(x)) + 0.5, h);
    ctx.stroke();
  }
  for (let y = 1; y < arena.y; y++) {
    ctx.strokeStyle = y % 4 === 0 ? "rgba(150,180,230,0.14)" : "rgba(150,180,230,0.06)";
    ctx.beginPath();
    ctx.moveTo(0, Math.round(px(y)) + 0.5);
    ctx.lineTo(w, Math.round(px(y)) + 0.5);
    ctx.stroke();
  }
  ctx.restore();

  // The wall. This was a CSS box-shadow on the canvas, which drew a line round
  // the *screen* the moment the canvas stopped being the room.
  ctx.save();
  ctx.strokeStyle = "#242b3a";
  ctx.lineWidth = 1.5;
  roundRect(0, 0, w, h, 10);
  ctx.stroke();
  ctx.restore();
}

/** The box a body can actually stand in: the arena inset by one radius. Drawn
 *  faintly because it is the difference between "it ignored my click" and "it
 *  got as close as a body can". */
function drawReachable(radius) {
  if (!radius) return;
  ctx.save();
  ctx.setLineDash([4, 6]);
  ctx.strokeStyle = "rgba(160,190,230,0.07)";
  ctx.lineWidth = 1;
  ctx.strokeRect(px(radius), px(radius), px(arena.x - 2 * radius), px(arena.y - 2 * radius));
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

/** The "it just thought" pulse: one ring per decision tick. At intellect 8
 *  that is five a second, and you can watch it slow down on a dimmer build. */
function drawPulses(hero) {
  if (!hero) return;
  ctx.save();
  for (const p of pulses) {
    const t = p.age / 420;
    if (t >= 1) continue;
    ctx.strokeStyle = `rgba(255,207,112,${(0.30 * (1 - t)).toFixed(3)})`;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(px(hero.x), px(hero.y), px(hero.radius) + t * px(0.9), 0, TAU);
    ctx.stroke();
  }
  ctx.restore();
}

/** Faction, not archetype, drives the colour: which side a body is on is the
 *  thing you must never have to think about. Archetype is legible anyway from
 *  the radius, which is a sim value -- a brute is more than twice a skitterer. */
const HERO_SKIN = {
  glow: "110,231,255",
  body: ["#bff2ff", "#4fb9d8"],
  wedge: "110,231,255",
  bar: "#6ee7ff",
};

const MONSTER_SKIN = {
  glow: "255,138,122",
  body: ["#ffc0b3", "#c04b38"],
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
function drawReach(unit, skin, now) {
  if (unit.intent !== INTENT_ATTACK) return;
  const beat = (Math.sin(now / 260) + 1) / 2;
  ctx.save();
  ctx.strokeStyle = `rgba(${skin.wedge},${(0.10 + 0.10 * beat).toFixed(3)})`;
  ctx.lineWidth = 1.2;
  ctx.setLineDash([3, 5]);
  ctx.beginPath();
  ctx.arc(px(unit.x), px(unit.y), px(unit.radius + unit.weaponLength), 0, TAU);
  ctx.stroke();
  ctx.restore();
}

/** Spin, in raw angle units per tick, at which a blade is drawn at full heat.
 *  Roughly a Warrior's working speed. */
const HOT_SPIN = 1500;

/**
 * The swordplay: a blade on one side, a guard on the other.
 *
 * This is the whole point of drawing anything. Damage is geometric now -- it is
 * decided by where this segment is and how fast it is moving -- so a page that
 * drew only bodies would be hiding the entire game. The blade brightens with
 * its own speed, because speed *is* the damage, and the guard is drawn as the
 * arc it actually covers rather than as a shape, because that arc is exactly
 * what the block test asks about.
 */
function drawHands(unit, skin) {
  const x = px(unit.x);
  const y = px(unit.y);
  const r = px(unit.radius);

  ctx.save();
  ctx.translate(x, y);

  // The shield, as the wedge of body it is covering. A tucked shield covers
  // nothing and is drawn as nothing, which is honest: `blocks` scales the arc
  // by extension, so a hand held in really does guard less.
  if (unit.shieldReach > 0.2) {
    const half = (unit.shieldArc * unit.shieldReach) / 2;
    ctx.rotate(unit.shieldAngle);
    ctx.fillStyle = `rgba(${skin.wedge},${(0.13 + 0.17 * unit.shieldReach).toFixed(3)})`;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, r * 1.55, -half, half);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = `rgba(${skin.wedge},${(0.45 * unit.shieldReach).toFixed(3)})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.55, -half, half);
    ctx.stroke();
    ctx.rotate(-unit.shieldAngle);
  }

  // The blade. Hilt at the body's surface, tip at `radius + length * reach`,
  // which is precisely the segment `World::blade` builds and tests against.
  if (unit.swordReach > 0.05) {
    const heat = clamp(Math.abs(unit.swordSpin) / HOT_SPIN, 0, 1);
    const hilt = r;
    const tip = px(unit.radius + unit.weaponLength * unit.swordReach);
    ctx.rotate(unit.swordAngle);
    ctx.lineCap = "round";
    // A trailing smear opposite the swing, so which way it is travelling is
    // readable at a glance -- which is the read the whole fight turns on.
    if (heat > 0.05) {
      const sweep = Math.sign(unit.swordSpin) * -heat * 0.55;
      ctx.strokeStyle = `rgba(255,255,255,${(0.16 * heat).toFixed(3)})`;
      ctx.lineWidth = Math.max(2, r * 0.5);
      ctx.beginPath();
      ctx.arc(0, 0, (hilt + tip) / 2, 0, sweep, sweep > 0);
      ctx.stroke();
    }
    ctx.strokeStyle = `rgba(255,255,255,${(0.5 + 0.5 * heat).toFixed(3)})`;
    ctx.lineWidth = Math.max(1.6, r * 0.22);
    ctx.beginPath();
    ctx.moveTo(hilt, 0);
    ctx.lineTo(tip, 0);
    ctx.stroke();
    ctx.rotate(-unit.swordAngle);
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
    ctx.rotate(unit.shieldAngle);
    const half = Math.max(0.35, (unit.shieldArc * unit.shieldReach) / 2);
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
    ctx.rotate(unit.swordAngle);
    const at = px(unit.radius + unit.weaponLength * unit.swordReach);
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

function drawUnit(unit, now) {
  const skin = skinOf(unit);
  const x = px(unit.x);
  const y = px(unit.y);
  const r = px(unit.radius);

  ctx.save();
  const glow = ctx.createRadialGradient(x, y, r * 0.3, x, y, r * 2.6);
  glow.addColorStop(0, `rgba(${skin.glow},0.16)`);
  glow.addColorStop(1, `rgba(${skin.glow},0)`);
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, r * 2.6, 0, TAU);
  ctx.fill();

  // The facing wedge, drawn in the same frame the body moves in. Brighter when
  // the unit is bearing down on something, thinner when it is backing off --
  // the two halves of `UtilityPolicy`'s decision, on screen.
  ctx.translate(x, y);
  ctx.rotate(unit.facing);
  const committed = unit.intent === INTENT_ATTACK;
  const spread = unit.intent === INTENT_FLEE ? 0.26 : 0.42;
  ctx.fillStyle = `rgba(${skin.wedge},${committed ? 0.34 : 0.2})`;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, r * 2.1, -spread, spread);
  ctx.closePath();
  ctx.fill();
  ctx.rotate(-unit.facing);

  const body = ctx.createLinearGradient(0, -r, 0, r);
  body.addColorStop(0, skin.body[0]);
  body.addColorStop(1, skin.body[1]);
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();

  // The blow landing. Straight from the frame now: the sim counts it down from
  // its own `Event::Damage`, so the page no longer has to tell a blow from
  // regeneration by watching health fall.
  if (unit.hitFlash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${(0.75 * unit.hitFlash).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.fill();
  }

  ctx.strokeStyle = "rgba(9,11,16,0.85)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();

  drawHands(unit, skin);
  drawMarks(unit);
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
  ctx.fillStyle = frac > 0.35 ? skin.bar : "#ff5f52";
  ctx.fillRect(x, y, w * frac, h);
  ctx.restore();
}

function drawCorpses() {
  ctx.save();
  for (const c of corpses) {
    const t = c.age / CORPSE_MS;
    if (t >= 1) continue;
    const skin = c.faction === FACTION_HEROES ? HERO_SKIN : MONSTER_SKIN;
    ctx.fillStyle = `rgba(${skin.glow},${(0.4 * (1 - t)).toFixed(3)})`;
    ctx.beginPath();
    // Settling as it fades, so a death reads as a body going down rather than
    // a sprite being switched off.
    ctx.arc(px(c.x), px(c.y), px(c.radius) * (1 - 0.45 * t), 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

function render(state, now, arrived) {
  // The camera, and the only place it is applied. Every draw below is written
  // in world-scaled space with the origin at the room's corner -- `px` is a
  // length, not a position -- so panning the view is a translation of the
  // matrix and nothing else has to know the camera exists.
  //
  // Snapped to a whole device pixel: a fractional offset would smear the grid,
  // which is drawn on half-pixel boundaries precisely so it stays crisp.
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, viewport.w, viewport.h);
  ctx.translate(
    Math.round((viewport.w / 2 - px(cam.x)) * dpr) / dpr,
    Math.round((viewport.h / 2 - px(cam.y)) * dpr) / dpr
  );

  drawFloor();
  drawReachable(state.hero ? state.hero.radius : 0);
  drawTrail();
  // No marker once the character is gone: the order outlives it in the world,
  // but a destination nobody is walking to is a promise the page cannot keep.
  if (state.hero) drawDestination(state, now, arrived);
  drawCorpses();
  drawPulses(state.hero);

  for (const unit of state.units) drawReach(unit, skinOf(unit), now);
  // Monsters first, then the hero: the character you are commanding must never
  // end up underneath the thing attacking it.
  for (const unit of state.monsters) drawUnit(unit, now);
  if (state.hero) drawUnit(state.hero, now);

  const fighting = state.monsters.length > 0;
  for (const unit of state.units) {
    if (fighting || unit.hp < unit.maxHp) drawHealth(unit, skinOf(unit));
  }
}

// ---------------------------------------------------------------------- hud

function fillStats(kind) {
  const a = ARCHETYPES[kind] || ARCHETYPES[0];
  const d = derived(a);
  const rows = [
    ["intellect", a.intellect, `thinks every ${d.decisionPeriod} ticks (${(d.decisionPeriod / TICKS_PER_SECOND).toFixed(2)} s)`],
    ["agility", a.agility, `${(d.moveSpeed * TICKS_PER_SECOND).toFixed(2)} units/s · half a turn in ${d.swing} ticks`],
    ["perception", a.perception, `sees ${d.sight.toFixed(1)} units, ±${d.noise.toFixed(1)} error at range`],
    ["power", a.power, `×${d.powerMultiplier.toFixed(2)} on impact speed`],
    ["vitality", a.vitality, `${d.maxHp} health`],
    ["weapon", `${a.reach.toFixed(2)}`, `reach past the body · guards ±${a.arc}°`],
  ];
  el.stats.replaceChildren();
  for (const [name, value, effect] of rows) {
    const dt = document.createElement("dt");
    dt.append(`${name} `);
    const b = document.createElement("b");
    b.textContent = String(value);
    dt.append(b);
    const dd = document.createElement("dd");
    dd.textContent = effect;
    el.stats.append(dt, dd);
  }
  setText(el.unitName, a.name);
  return d;
}

function hex64(hi, lo) {
  return `0x${(hi >>> 0).toString(16).padStart(8, "0")}${(lo >>> 0).toString(16).padStart(8, "0")}`;
}

/** The one thing the page could not say before: who is left standing. */
function updateBattle(state) {
  const standing = state.monsters.length;
  const monsters = `${standing} monster${standing === 1 ? "" : "s"}`;
  setText(el.battleRoster, `${state.hero ? "1 hero" : "no hero"}, ${monsters}`);

  // The swap control lives in this panel rather than in the strip under the
  // arena because this is where the player is already looking when it starts to
  // mean anything, and it means nothing every other second of the session.
  el.swapRow.hidden = state.hero !== null;

  if (!state.hero) {
    el.battleState.className = "state dead";
    setText(el.battleState, "the character has fallen — send in a new one, or press R for a new room");
  } else if (standing === 0) {
    el.battleState.className = "state idle";
    setText(el.battleState, "quiet — nothing in the room to fight");
  } else {
    el.battleState.className = "state";
    setText(el.battleState, `battle — ${monsters} standing`);
  }
}

function updateHud(state, stats, distance, arrived, settled) {
  const hero = state.hero;
  setText(el.simTick, String(wasm.tick()));
  setText(el.simHash, hex64(wasm.state_hash_hi(), wasm.state_hash_lo()));
  setText(el.simPosition, hero ? `${hero.x.toFixed(2)}, ${hero.y.toFixed(2)}` : "—");
  setText(el.unitHp, hero ? `${Math.round(hero.hp)} / ${Math.round(hero.maxHp)} hp` : "fallen");
  // The bar the eye reads, next to the number the eye checks. Same third-full
  // threshold the bars on the canvas turn red at.
  const health = hero && hero.maxHp > 0 ? clamp(hero.hp / hero.maxHp, 0, 1) : 0;
  el.hpFill.style.width = `${(health * 100).toFixed(1)}%`;
  el.hpFill.classList.toggle("low", health <= 0.35);
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

let statsCacheKind = -1;
let statsCache = derived(ARCHETYPES[0]);

/** The stat panel only changes when the archetype does, so it is built once
 *  rather than sixty times a second. */
function fillStatsIfChanged(state) {
  // With the hero gone the panel freezes on the archetype that fell rather than
  // snapping back to the default: there is no new character to describe, and
  // the loop still reads `decisionPeriod` and `moveSpeed` off the cache.
  const kind = state.hero ? state.hero.kind : Math.max(statsCacheKind, 0);
  if (kind !== statsCacheKind) {
    statsCacheKind = kind;
    statsCache = fillStats(kind);
  }
  return statsCache;
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
 */
function syncBodies(state, now, elapsed) {
  const live = new Set();
  for (const unit of state.units) {
    live.add(unit.id);
    bodies.set(unit.id, {
      x: unit.x,
      y: unit.y,
      radius: unit.radius,
      faction: unit.faction,
    });
  }

  for (const [id, seen] of bodies) {
    if (live.has(id)) continue;
    corpses.push({ x: seen.x, y: seen.y, radius: seen.radius, faction: seen.faction, age: 0 });
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

  const stats = fillStatsIfChanged(state);
  syncBodies(state, now, elapsed);

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

  if (state.decisionTick !== lastDecisionSeen) {
    lastDecisionSeen = state.decisionTick;
    if (pulses.length > 6) pulses.shift();
    pulses.push({ age: 0 });
  }
  for (const p of pulses) p.age += elapsed;
  while (pulses.length && pulses[0].age > 420) pulses.shift();

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

  updateCamera(state, elapsed);
  render(state, now, arrived || settled);
  updateHud(state, stats, distance, arrived, settled);

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

async function boot() {
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

  wasm.init(SEED);

  // The project's central claim as one number: this is what
  // `cargo run --release -p lab -- hash` prints natively, computed here by the
  // same fixed-point code compiled for a completely different machine.
  console.log(
    `auto-rpg: web.wasm ready. selftest hash ${hex64(wasm.selftest_hash_hi(), wasm.selftest_hash_lo())}` +
      " (must equal `cargo run --release -p lab -- hash`)"
  );

  const first = parseFrame(readFrame());
  arena = { x: first.arenaX, y: first.arenaY };
  fillStatsIfChanged(first);
  resize();
  snapCamera(first);
  bindInput();
  hintEl.textContent = DEFAULT_HINT;

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
