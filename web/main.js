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
// unit: [x, y, facing_raw, radius, hp, max_hp, faction, kind, intent].
const HEADER_LEN = 7;
const UNIT_STRIDE = 9;

// `Order` discriminants, from crates/sim/src/action.rs.
const ORDER_HOLD = 0;
const ORDER_GOTO = 4;

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
  { name: "warrior", power: 6, agility: 6, intellect: 8, perception: 6, vitality: 8 },
  { name: "scout", power: 4, agility: 12, intellect: 10, perception: 14, vitality: 4 },
  { name: "brute", power: 12, agility: 2, intellect: 2, perception: 3, vitality: 14 },
  { name: "skitterer", power: 3, agility: 9, intellect: 12, perception: 5, vitality: 2 },
];

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

function derived(a) {
  return {
    // "20 - intellect, floored at 1" -- ticks between decisions.
    decisionPeriod: clamp(20 - a.intellect, 1, 120),
    // "(250 + 12 * agility) / 100" units per second, held per tick in the sim.
    moveSpeed: (250 + 12 * a.agility) / (100 * TICKS_PER_SECOND),
    attackPeriod: clamp(40 - a.agility, 8, 240),
    sight: (60 + 6 * a.perception) / 10,
    noise: clamp(15 - a.perception, 0, 15) / 10,
    damage: (20 + 12 * a.power) / 10,
    maxHp: 20 + 8 * a.vitality,
  };
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
  "step",
  "frame_ptr",
  "frame_len",
  "tick",
  "state_hash_lo",
  "state_hash_hi",
  "selftest_hash_lo",
  "selftest_hash_hi",
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

function parseFrame(f) {
  const state = {
    arenaX: f[0] || 24,
    arenaY: f[1] || 16,
    orderKind: f[2],
    orderX: f[3],
    orderY: f[4],
    decisionTick: f[5],
    unitCount: f[6],
    hero: null,
  };
  if (state.unitCount >= 1 && f.length >= HEADER_LEN + UNIT_STRIDE) {
    const u = HEADER_LEN;
    state.hero = {
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
    };
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
  stats: document.getElementById("stats"),
  orderState: document.getElementById("order-state"),
  orderDest: document.getElementById("order-dest"),
  orderDistance: document.getElementById("order-distance"),
  orderDecision: document.getElementById("order-decision"),
  simTick: document.getElementById("sim-tick"),
  simPosition: document.getElementById("sim-position"),
  simHash: document.getElementById("sim-hash"),
};

const DEFAULT_HINT = "Click the floor. The character walks there its own way.";

/** What the player last asked for. The frame is the truth about the order; this
 *  only distinguishes two things the sim cannot tell apart -- a walk somewhere
 *  and a stand-down, both of which are `Goto`. */
let intent = "none"; // "goto" | "stand" | "free" | "none"

/** The handle of the pending animation frame, so a trap can cancel it. */
let rafId = 0;

let arena = { x: 24, y: 16 };
let cssWidth = 0;
let cssHeight = 0;
let scale = 1; // CSS pixels per world unit

let trail = [];
let pulses = [];
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
  const available = { w: Math.max(120, box.width), h: Math.max(120, box.height) };
  const aspect = arena.x / arena.y;
  let w = available.w;
  let h = w / aspect;
  if (h > available.h) {
    h = available.h;
    w = h * aspect;
  }
  cssWidth = Math.max(1, Math.floor(w));
  cssHeight = Math.max(1, Math.floor(h));
  scale = cssWidth / arena.x;

  // Cap the device pixel ratio: a 4x display would otherwise quadruple the
  // fill cost of every frame for no visible gain.
  const dpr = clamp(window.devicePixelRatio || 1, 1, 3);
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;
  canvas.width = Math.round(cssWidth * dpr);
  canvas.height = Math.round(cssHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

// -------------------------------------------------------------------- input

/** A click, in world units. `getBoundingClientRect` is CSS pixels -- *not* the
 *  DPR-scaled backing store -- so this must divide by the rect, never by
 *  `canvas.width`. */
function pointerToWorld(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * arena.x,
    y: ((event.clientY - rect.top) / rect.height) * arena.y,
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

function restart() {
  wasm.init(SEED);
  intent = "none";
  trail = [];
  pulses = [];
  lastDecisionSeen = -1;
  orderKey = "";
  orderAcknowledged = false;
  hint("Room restarted at tick 0.");
}

function bindInput() {
  canvas.addEventListener("mousedown", (event) => {
    if (dead) return;
    const state = parseFrame(readFrame());
    if (event.button === 2) {
      event.preventDefault();
      standDown(state);
    } else if (event.button === 0) {
      goTo(pointerToWorld(event), state);
    }
  });

  canvas.addEventListener("contextmenu", (event) => event.preventDefault());

  window.addEventListener("keydown", (event) => {
    if (dead || event.metaKey || event.ctrlKey || event.altKey) return;
    const key = event.key.toLowerCase();
    if (event.key === "Escape") {
      standDown(parseFrame(readFrame()));
    } else if (key === "f") {
      freeWill();
    } else if (key === "r") {
      restart();
    }
  });

  document.getElementById("btn-standdown").addEventListener("click", () => {
    if (!dead) standDown(parseFrame(readFrame()));
  });
  document.getElementById("btn-freewill").addEventListener("click", () => {
    if (!dead) freeWill();
  });
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

function drawFloor() {
  ctx.save();
  roundRect(0, 0, cssWidth, cssHeight, 10);
  ctx.clip();

  const floor = ctx.createLinearGradient(0, 0, cssWidth * 0.6, cssHeight);
  floor.addColorStop(0, "#161b26");
  floor.addColorStop(1, "#0f131c");
  ctx.fillStyle = floor;
  ctx.fillRect(0, 0, cssWidth, cssHeight);

  // One line per world unit, brighter every four: the grid is the scale bar.
  ctx.lineWidth = 1;
  for (let x = 1; x < arena.x; x++) {
    ctx.strokeStyle = x % 4 === 0 ? "rgba(150,180,230,0.14)" : "rgba(150,180,230,0.06)";
    ctx.beginPath();
    ctx.moveTo(Math.round(px(x)) + 0.5, 0);
    ctx.lineTo(Math.round(px(x)) + 0.5, cssHeight);
    ctx.stroke();
  }
  for (let y = 1; y < arena.y; y++) {
    ctx.strokeStyle = y % 4 === 0 ? "rgba(150,180,230,0.14)" : "rgba(150,180,230,0.06)";
    ctx.beginPath();
    ctx.moveTo(0, Math.round(px(y)) + 0.5);
    ctx.lineTo(cssWidth, Math.round(px(y)) + 0.5);
    ctx.stroke();
  }
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

function drawHero(hero) {
  if (!hero) return;
  const x = px(hero.x);
  const y = px(hero.y);
  const r = px(hero.radius);

  ctx.save();
  const glow = ctx.createRadialGradient(x, y, r * 0.3, x, y, r * 2.6);
  glow.addColorStop(0, "rgba(110,231,255,0.16)");
  glow.addColorStop(1, "rgba(110,231,255,0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, r * 2.6, 0, TAU);
  ctx.fill();

  // The facing wedge, drawn in the same frame the body moves in.
  ctx.translate(x, y);
  ctx.rotate(hero.facing);
  ctx.fillStyle = "rgba(110,231,255,0.22)";
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, r * 2.1, -0.42, 0.42);
  ctx.closePath();
  ctx.fill();
  ctx.rotate(-hero.facing);

  const body = ctx.createLinearGradient(0, -r, 0, r);
  body.addColorStop(0, "#bff2ff");
  body.addColorStop(1, "#4fb9d8");
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = "rgba(9,11,16,0.85)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

function render(state, now, arrived) {
  ctx.clearRect(0, 0, cssWidth, cssHeight);
  drawFloor();
  drawReachable(state.hero ? state.hero.radius : 0);
  drawTrail();
  drawDestination(state, now, arrived);
  drawPulses(state.hero);
  drawHero(state.hero);
}

// ---------------------------------------------------------------------- hud

function fillStats(kind) {
  const a = ARCHETYPES[kind] || ARCHETYPES[0];
  const d = derived(a);
  const rows = [
    ["intellect", a.intellect, `thinks every ${d.decisionPeriod} ticks (${(d.decisionPeriod / TICKS_PER_SECOND).toFixed(2)} s)`],
    ["agility", a.agility, `${(d.moveSpeed * TICKS_PER_SECOND).toFixed(2)} units/s · swings every ${d.attackPeriod}`],
    ["perception", a.perception, `sees ${d.sight.toFixed(1)} units, ±${d.noise.toFixed(1)} error`],
    ["power", a.power, `${d.damage.toFixed(1)} damage a hit`],
    ["vitality", a.vitality, `${d.maxHp} health`],
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

function updateHud(state, stats, distance, arrived, settled) {
  const hero = state.hero;
  setText(el.simTick, String(wasm.tick()));
  setText(el.simHash, hex64(wasm.state_hash_hi(), wasm.state_hash_lo()));
  setText(el.simPosition, hero ? `${hero.x.toFixed(2)}, ${hero.y.toFixed(2)}` : "—");
  setText(el.unitHp, hero ? `${Math.round(hero.hp)} / ${Math.round(hero.maxHp)} hp` : "—");
  setText(
    el.orderDecision,
    state.decisionTick > 0 ? `tick ${state.decisionTick} (every ${stats.decisionPeriod})` : "—"
  );

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
  const kind = state.hero ? state.hero.kind : 0;
  if (kind !== statsCacheKind) {
    statsCacheKind = kind;
    statsCache = fillStats(kind);
  }
  return statsCache;
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
  if (ticks > 0) wasm.step(ticks);
  if (dead) return;

  const state = parseFrame(readFrame());
  if (state.arenaX !== arena.x || state.arenaY !== arena.y) {
    arena = { x: state.arenaX, y: state.arenaY };
    resize();
  }

  const stats = fillStatsIfChanged(state);

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
  bindInput();
  hintEl.textContent = DEFAULT_HINT;

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
