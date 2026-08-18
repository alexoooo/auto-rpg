// The studio shell's routing, the arena's rules, and the arena's teardown.
//
// v2-ui-01 said in as many words that "the disposal path is the new part and the
// part to test", and `picker.ts` says in its own header that everything which
// decides is a pure function "so a test can call it with no DOM at all". Neither
// had a test. This file is both, and the second is the reason the first is
// possible: the rules can be checked with nothing installed, and the teardown
// needs only enough of a browser to count what was registered and what was given
// back.
//
// **Why a hand-rolled DOM and not a DOM library.** The question being asked is
// not "does this render" -- nothing here looks at a pixel. It is "after two
// mounts and two disposals, does anything still hold a reference into a route
// that is gone", and that is a question about bookkeeping: listeners on targets
// that outlive the subtree, observers, animation frames and downloads. A fake
// that records exactly those four things answers it directly, in a file a reader
// can hold in their head, and it does not add a dependency to a repository whose
// deterministic core deliberately has none.
//
// The harness is driven by `web/index.html` rather than by a table written here:
// the option values and the element tags come out of the shipped template, so a
// template and a module that stop agreeing about their shared vocabulary fail
// here rather than passing against a copy that agrees with neither.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = path.join(ROOT, ".tools", "studio-test");
fs.mkdirSync(OUT, { recursive: true });

// `studio.ts` alone would be enough for `parseRoute`, but TypeScript follows a
// dynamic `import()` into the program, so naming it here also compiles both
// route modules -- which is what the disposal test needs and what keeps this
// file honest about compiling the same sources the browser runs.
const tsc = spawnSync(process.execPath, [
  path.join(ROOT, "node_modules", "typescript", "bin", "tsc"),
  "--ignoreConfig",
  "--target", "ES2022", "--module", "ES2022", "--moduleResolution", "bundler",
  "--ignoreDeprecations", "6.0", "--strict", "--skipLibCheck",
  "--outDir", OUT, "--rootDir", ROOT,
  "client/src/studio.ts", "client/src/arena/arena.ts", "client/src/arena/picker.ts",
], { cwd: ROOT, encoding: "utf8" });
assert.equal(tsc.status, 0, `TypeScript test compilation failed:\n${tsc.stdout}\n${tsc.stderr}`);
fs.writeFileSync(path.join(OUT, "package.json"), '{"type":"module"}\n');

const compiled = (relative) => pathToFileURL(path.join(OUT, relative)).href;
const picker = await import(compiled("client/src/arena/picker.js"));
const CONFIG = await import(compiled("client/src/runtime/arena-config.js"));

const SHELL_HTML = fs.readFileSync(path.join(ROOT, "web", "index.html"), "utf8");
const ONE = 65536;

// ------------------------------------------------------------------ the fake DOM

/**
 * The tag each `id` in the shipped template belongs to.
 *
 * `picker.ts` discriminates its controls with `instanceof HTMLSelectElement` and
 * `instanceof HTMLInputElement`, so a harness that answered every such test with
 * `true` would be testing a browser nobody has. Reading the tags out of the
 * template keeps the discrimination real without writing a second copy of the
 * template down here.
 */
function templateTags(html) {
  const tags = new Map();
  for (const match of html.matchAll(/<([a-z]+)\b[^>]*?\sid="([^"]+)"/g)) tags.set(match[2], match[1]);
  return tags;
}

/** What each control in the shipped template starts as: its selected option or its `value`. */
function templateValues(html) {
  const values = new Map();
  for (const match of html.matchAll(/<select\b[^>]*?\sid="([^"]+)"[^>]*>([\s\S]*?)<\/select>/g)) {
    const selected = /<option value="([^"]+)"[^>]*\sselected/.exec(match[2])?.[1];
    const first = /<option value="([^"]+)"/.exec(match[2])?.[1];
    values.set(match[1], { value: selected ?? first ?? "" });
  }
  for (const match of html.matchAll(/<input\b[^>]*?\sid="([^"]+)"[^>]*>/g)) {
    values.set(match[1], {
      value: /\svalue="([^"]*)"/.exec(match[0])?.[1] ?? "",
      max: /\smax="([^"]*)"/.exec(match[0])?.[1] ?? "",
      checked: /\schecked(?:[\s>=])/.test(match[0]),
    });
  }
  return values;
}

const TEMPLATE_TAGS = templateTags(SHELL_HTML);
const TEMPLATE_VALUES = templateValues(SHELL_HTML);

/** Every 2D call the two views make, answered by doing nothing and recording nothing. */
const CANVAS_2D_CALLS = [
  "clearRect", "fillRect", "strokeRect", "beginPath", "closePath", "moveTo", "lineTo",
  "arc", "fill", "stroke", "fillText", "save", "restore", "translate", "setLineDash",
  "setTransform", "scale", "rotate", "clip", "rect",
];

class FakeNode {
  constructor(harness, owner, tag, id) {
    this.harness = harness;
    /** The route subtree this node belongs to, or null for `window`/`document`. */
    this.owner = owner;
    this.tag = tag;
    this.id = id;
    this.value = "";
    this.max = "";
    this.checked = false;
    this.disabled = false;
    this.selected = false;
    this.title = "";
    this.className = "";
    this.textContent = "";
    this.innerHTML = "";
    this.width = 0;
    this.height = 0;
    this.children = [];
    this.attributes = new Map();
    this.classes = new Set();
    this.context = null;
    this.lookups = new Map();
    const defaults = TEMPLATE_VALUES.get(id);
    if (defaults !== undefined) {
      this.value = defaults.value;
      this.max = defaults.max ?? "";
      this.checked = defaults.checked ?? false;
    }
  }

  get valueAsNumber() {
    return this.value === "" ? Number.NaN : Number(this.value);
  }

  get classList() {
    const classes = this.classes;
    return {
      add: (name) => classes.add(name),
      remove: (name) => classes.delete(name),
      toggle: (name, on) => { if (on === false || (on === undefined && classes.has(name))) classes.delete(name); else classes.add(name); },
      contains: (name) => classes.has(name),
    };
  }

  /**
   * Auto-vivifying, and the same selector always answers with the same node.
   *
   * A harness that had to be told every id would fail as a missing-element
   * error the first time the template grew a control, which reads as a broken
   * test rather than as the lifecycle regression this file is looking for.
   */
  querySelector(selector) {
    const found = this.lookups.get(selector);
    if (found !== undefined) return found;
    const id = selector.startsWith("#") ? selector.slice(1) : "";
    const node = new FakeNode(this.harness, this.owner ?? this, TEMPLATE_TAGS.get(id) ?? "div", id);
    this.lookups.set(selector, node);
    return node;
  }

  getContext(kind) {
    if (kind !== "2d") return null;
    if (this.context === null) {
      const context = { canvas: this, fillStyle: "", strokeStyle: "", lineWidth: 1, lineCap: "butt", font: "", globalAlpha: 1 };
      for (const name of CANVAS_2D_CALLS) context[name] = () => undefined;
      this.context = context;
    }
    return this.context;
  }

  getBoundingClientRect() {
    return { x: 0, y: 0, left: 0, top: 0, right: 640, bottom: 360, width: 640, height: 360 };
  }

  addEventListener(type, listener) { this.harness.addListener(this, type, listener); }
  removeEventListener(type, listener) { this.harness.removeListener(this, type, listener); }
  setAttribute(name, value) { this.attributes.set(name, value); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  append(...nodes) { this.children.push(...nodes); }
  before() { /* placement is not what this harness measures */ }
  replaceChildren(...nodes) { this.children = [...nodes]; }
  click() { for (const entry of this.harness.listenersOn(this, "click")) entry.listener({ target: this }); }
  cloneNode() { return this; }
  get firstElementChild() { return this.content === undefined ? null : this.content.child; }
}

/** `window`, `document`, `ResizeObserver`, `requestAnimationFrame` and `fetch`, all counted. */
function installDom() {
  const saved = new Map();
  const harness = {
    listeners: [],
    observers: [],
    frames: new Map(),
    timers: new Set(),
    fetches: [],
    nextFrame: 1,

    addListener(target, type, listener) { this.listeners.push({ target, type, listener }); },
    removeListener(target, type, listener) {
      const index = this.listeners.findIndex(
        (entry) => entry.target === target && entry.type === type && entry.listener === listener);
      if (index !== -1) this.listeners.splice(index, 1);
    },
    listenersOn(target, type) {
      return this.listeners.filter((entry) => entry.target === target && entry.type === type);
    },
    liveListeners() {
      return this.listeners.map((entry) => `${entry.target.id || entry.target.tag} ${entry.type}`);
    },
    /**
     * What the shell's `root.replaceChildren()` does, in listener terms.
     *
     * `arena.ts` releases exactly three things and says why: everything else it
     * registered is on an element inside the route's own subtree, and the shell
     * drops that subtree whole. Modelling the drop is what makes "zero live
     * listeners" the literal assertion rather than a filtered one -- and it
     * keeps a `window` listener, which no subtree drop can reach, countable.
     */
    dropSubtree(container) {
      this.listeners = this.listeners.filter((entry) => entry.target.owner !== container);
    },
    liveObservers() {
      return this.observers.filter((entry) => !entry.disconnected).map((entry) => `observing ${entry.targets.length}`);
    },
    pendingFrames() { return this.frames.size; },
    /** Fire the one frame the loop has outstanding, the way a display would. */
    runFrame(now) {
      const [id, callback] = [...this.frames][0] ?? [];
      if (id === undefined) throw new Error("no animation frame is pending");
      this.frames.delete(id);
      callback(now);
    },
    container() {
      return new FakeNode(harness, null, "div", "route-arena-root");
    },
    restore() {
      for (const [name, value] of saved) {
        if (value === undefined) delete globalThis[name];
        else globalThis[name] = value;
      }
    },
  };

  const fakeWindow = new FakeNode(harness, null, "window", "");
  fakeWindow.devicePixelRatio = 1;
  fakeWindow.location = { hash: "" };
  fakeWindow.requestAnimationFrame = (callback) => {
    const id = harness.nextFrame++;
    harness.frames.set(id, callback);
    return id;
  };
  fakeWindow.cancelAnimationFrame = (id) => { harness.frames.delete(id); };
  fakeWindow.setInterval = (callback, delay) => {
    const handle = setInterval(callback, delay);
    harness.timers.add(handle);
    return handle;
  };
  fakeWindow.clearInterval = (handle) => { clearInterval(handle); harness.timers.delete(handle); };

  const fakeDocument = new FakeNode(harness, null, "document", "");
  fakeDocument.getElementById = (id) => {
    const node = fakeDocument.querySelector(`#${id}`);
    if (node.content === undefined && TEMPLATE_TAGS.get(id) === "template") {
      node.content = { child: new FakeNode(harness, null, "div", `${id}-root`), cloneNode: () => node.content };
    }
    return node;
  };
  fakeDocument.createElement = (tag) => new FakeNode(harness, null, tag, "");

  const anyNode = (predicate) => ({ [Symbol.hasInstance]: (value) => value instanceof FakeNode && predicate(value.tag) });
  const globals = {
    window: fakeWindow,
    document: fakeDocument,
    devicePixelRatio: 1,
    HTMLElement: anyNode(() => true),
    HTMLCanvasElement: anyNode((tag) => tag === "canvas"),
    HTMLInputElement: anyNode((tag) => tag === "input"),
    HTMLSelectElement: anyNode((tag) => tag === "select"),
    HTMLButtonElement: anyNode((tag) => tag === "button"),
    HTMLTemplateElement: anyNode((tag) => tag === "template"),
    ResizeObserver: class {
      constructor() {
        this.entry = { targets: [], disconnected: false };
        harness.observers.push(this.entry);
      }
      observe(target) { this.entry.targets.push(target); }
      unobserve(target) { this.entry.targets = this.entry.targets.filter((held) => held !== target); }
      disconnect() { this.entry.disconnected = true; this.entry.targets = []; }
    },
    requestAnimationFrame: (callback) => fakeWindow.requestAnimationFrame(callback),
    cancelAnimationFrame: (id) => fakeWindow.cancelAnimationFrame(id),
    fetch: (url, init = {}) => {
      const pending = { url, signal: init.signal ?? null, settle: null, reject: null };
      const promise = new Promise((resolve, reject) => {
        pending.settle = (body) => resolve({
          ok: true, status: 200, statusText: "OK",
          headers: { get: (name) => (name.toLowerCase() === "content-type" ? "application/json" : null) },
          json: async () => body,
        });
        pending.reject = reject;
      });
      // The real fetch rejects on abort rather than resolving, and the arena's
      // `load` distinguishes an aborted attempt from a failed one, so the fake
      // has to abort the same way or the branch under test never runs.
      pending.signal?.addEventListener("abort", () => {
        pending.reject(Object.assign(new Error("The operation was aborted."), { name: "AbortError" }));
      });
      harness.fetches.push(pending);
      return promise;
    },
  };
  for (const [name, value] of Object.entries(globals)) {
    saved.set(name, globalThis[name]);
    globalThis[name] = value;
  }
  return harness;
}

/** Let every microtask the route queued run before asking what it did. */
const settle = async () => { for (let n = 0; n < 8; n += 1) await Promise.resolve(); };

// -------------------------------------------------------------- the synthetic fight

/**
 * A recording with the shape `crates/lab/src/trace.rs` writes and none of its size.
 *
 * Written here rather than read from `web/fight.json` because `.gitignore`
 * excludes `web/fight*.json`: a fixture that is absent in a fresh clone would
 * make this test pass or skip depending on whether somebody had run
 * `npm run trace`, which is the class of silent hole this whole session is
 * closing.
 */
function syntheticTrace() {
  const region = (z) => ({ lower: [0, 0, z], upper: [0, 0, z + ONE], radius: ONE / 8, present: true });
  const arm = (x) => ({ hand: [x, 0, ONE], vel: [0, 0, 0], target: [x, 0, ONE], fatigue: 0 });
  const pose = (index, x) => ({
    id: [index, 1], body: [x, 0, 0], yaw: 0, vel: [0, 0, 0],
    arms: [arm(x - ONE), arm(x + ONE)],
    weapons: [null, { hilt: [x, 0, ONE], tip: [x + ONE, 0, ONE], radius: ONE / 32 }],
    shield: null,
    regions: [region(0), region(ONE), region(2 * ONE), region(3 * ONE)],
    integrity: [ONE, ONE, ONE, ONE], wound: [0, 0, 0, 0],
    blood: ONE, shock: 0, severed: 0, equipmentMask: 3,
    intent: "attack", target: null, hints: [0, 1],
  });
  const body = (index, kind, faction, carried) => ({
    index, kind, faction,
    anatomy: { standingHeight: 2 * ONE, shoulderHeight: ONE * 3 / 2, shoulderHalfWidth: ONE / 4, armLength: ONE * 3 / 4, handRadius: ONE / 16 },
    carried,
  });
  const frame = (t) => ({
    t, health: [ONE, ONE], projectiles: [], contacts: [],
    poses: [pose(0, -5 * ONE + t * ONE), pose(1, 5 * ONE)],
  });
  return {
    schema: "arpg-fight-trace-6", one: ONE, scenario: "duel", mirrored: false,
    fingerprint: "abc123", seed: 3, heroes: "composed", monsters: "composed",
    checkpoint: null, outcome: "Heroes", timedOut: false, ticks: 2, maxTicks: 3600,
    arena: [48 * ONE, 32 * ONE], frameCount: 3, truncated: false,
    impactThreshold: ONE / 4, contactEnergyFloor: 512,
    regionNames: ["head", "torso", "left arm", "right arm"],
    hintNames: ["idle", "strike"],
    contactKinds: ["blade-body", "blade-blade"],
    bodySlot: 255, noRegion: 255,
    bodies: [
      body(0, "Fighter", "Heroes", [
        { action: "Sword", binding: "Right", mass: ONE, balance: ONE / 2, geometry: "segment", length: ONE, radius: ONE / 32 },
        { action: "Shield", binding: "Left", mass: ONE, balance: ONE / 2, geometry: "shield", halfWidth: ONE / 2, halfHeight: ONE / 2, thickness: ONE / 16 },
      ]),
      body(1, "Brute", "Monsters", [
        { action: "Club", binding: "Both", mass: ONE, balance: ONE / 2, geometry: "segment", length: ONE, radius: ONE / 16 },
      ]),
    ],
    frames: [frame(0), frame(1), frame(2)],
  };
}

const side = (overrides = {}) => ({ anatomy: "fighter", left: "shield", right: "sword", twoHanded: false, policy: "composed", ...overrides });
const matchup = (a = {}, b = {}, seed = 3) => ({ a: side(a), b: side(b), seed });

// ----------------------------------------------------------------- the shell's routing

test("parse_route_falls_back_to_the_main_screen_and_hands_the_query_on_untouched", async () => {
  const harness = installDom();
  try {
    // `studio.ts` runs `main()` on import, so the shell needs a document to
    // find its three chrome elements in before `parseRoute` can be asked
    // anything. That is the whole reason this test installs a DOM at all.
    const { parseRoute } = await import(compiled("client/src/studio.js"));
    await settle();

    const route = (hash) => {
      const parsed = parseRoute(hash);
      return [parsed.path, [...parsed.params]];
    };
    assert.deepEqual(route(""), ["/", []]);
    assert.deepEqual(route("#/"), ["/", []]);
    assert.deepEqual(route("#/game"), ["/game", []]);
    assert.deepEqual(route("#/nonsense"), ["/", []]);
    assert.deepEqual(route("#/arena?trace=/fight-learned.json"),
      ["/arena", [["trace", "/fight-learned.json"]]]);
    // An empty path with a query is the main screen carrying parameters, not an
    // unknown route: `raw.slice(0, 0)` is falsy and `|| "/"` is what catches it.
    assert.deepEqual(route("#?a=1"), ["/", [["a", "1"]]]);
    // `location.hash` is everything after the *first* `#`, so a second one is a
    // character in a value. Splitting on `#` again would truncate the filename.
    assert.deepEqual(route("#/arena?trace=/fight%23two.json"),
      ["/arena", [["trace", "/fight#two.json"]]]);
    assert.deepEqual(route("#/arena?trace=/a#b.json"), ["/arena", [["trace", "/a#b.json"]]]);
    // An unknown path keeps its query rather than dropping it, so the fallback
    // is a redirect and not a reset.
    assert.deepEqual(route("#/nonsense?trace=/fight.json"), ["/", [["trace", "/fight.json"]]]);
  } finally {
    harness.restore();
  }
});

test("the_game_route_gives_the_dungeon_the_stage_and_keeps_instruments_in_reach", () => {
  const template = /<template id="route-game">([\s\S]*?)<\/template>/.exec(SHELL_HTML)?.[1] ?? "";
  assert.match(template, /<section class="game-stage" aria-label="Dungeon expedition">/);
  assert.doesNotMatch(template, /game-heading|id="game-title"|World \/ expedition/);
  assert.doesNotMatch(template, /The worker-owned simulation, inside the authored representative room\./,
    "the playable route must not put a marketing description over the world");
  assert.match(template, /<div class="game-state" aria-label="Party status">/);
  assert.match(template, /<output id="party-health">-- \/ --<\/output>/);
  assert.match(template, /<progress id="party-health-bar" max="1" value="0" aria-label="Party health"><\/progress>/);
  assert.match(template, /<aside class="game-command-deck" aria-label="Expedition controls">/);
  assert.match(template, /<details class="game-instruments">[\s\S]*?<summary>Systems and capture<\/summary>/);

  const canvas = template.indexOf('id="greybox"');
  const commands = template.indexOf('class="game-command-deck"');
  const instruments = template.indexOf('class="game-instruments"');
  assert.ok(canvas >= 0 && canvas < commands && commands < instruments,
    "the authored view must remain the primary content, ahead of controls and developer instruments");

  for (const id of ["greybox", "interaction-hint", "game-view-mode", "party-health",
    "party-health-bar", "seed", "reset", "pause",
    "slot-1", "slot-2", "control-movement", "control-action", "control-aim", "respawn",
    "spawn-kind", "spawn-primary", "spawn-secondary", "spawn", "diagnostic-hold-buffers",
    "diagnostic-release-buffers", "performance-start", "performance-download", "performance-progress",
    "performance-status", "status", "error", "diagnostics"]) {
    assert.equal(template.match(new RegExp(`id="${id}"`, "g"))?.length, 1,
      `#${id} must survive the composition exactly once`);
  }
  // **`withdraw` was on that list and the button is gone with the order it
  // withdrew.** Asserted absent rather than dropped quietly, for the reason the
  // sibling test gives about `goto-x` and `goto-y`: a control that reappears
  // over a channel nothing is connected to is a button that does nothing, and
  // the shell is where a reader would look for it first.
  assert.doesNotMatch(template, /id="withdraw"/);
});

test("the_game_route_keeps_fps_visible_outside_the_systems_drawer", () => {
  const template = /<template id="route-game">([\s\S]*?)<\/template>/.exec(SHELL_HTML)?.[1] ?? "";
  const fps = template.indexOf('id="game-fps"');
  const view = template.indexOf('id="game-view-mode"');
  const drawer = template.indexOf('class="game-instruments"');
  assert.ok(fps >= 0 && view >= 0 && drawer >= 0 && fps < drawer && view < drawer,
    "player instruments must remain visible when Systems and capture is closed");
  assert.match(template, /<output id="game-fps"[^>]*>-- FPS \/ -- ms worst<\/output>/);
});

test("game_modes_are_directly_selectable_and_the_obsolete_camera_toggle_is_gone", () => {
  const shell = fs.readFileSync(path.join(ROOT, "web", "index.html"), "utf8");
  const source = fs.readFileSync(path.join(ROOT, "client", "src", "v2.ts"), "utf8");
  for (const mode of ["world", "geometry", "top_down", "first_person", "free", "dev"]) {
    assert.match(shell, new RegExp(`<option value="${mode}"`));
  }
  assert.doesNotMatch(shell, /id="room-camera-toggle"/);
  assert.match(source, /event\.shiftKey\s*\?\s*-1\s*:\s*1/);
});

test("systems_drawer_reserves_the_bottom_hud_and_control_safe_area", () => {
  const shell = fs.readFileSync(path.join(ROOT, "web", "index.html"), "utf8");
  assert.match(shell, /\.game-support\s*\{[^}]*bottom:/s);
  assert.match(shell, /\.game-instruments\[open\]\s*\{[^}]*max-height:/s);
});

test("the_game_hud_keeps_performance_and_modes_above_the_world", () => {
  const template = /<template id="route-game">([\s\S]*?)<\/template>/.exec(SHELL_HTML)?.[1] ?? "";
  const systems = template.indexOf('class="game-instruments"');
  for (const id of ["game-fps", "game-view-mode", "control-movement", "control-action", "control-aim"]) {
    assert.ok(template.indexOf('id="' + id + '"') < systems, "#" + id + " must remain outside Systems");
  }
  assert.doesNotMatch(template, /id="goto-x"|id="goto-y"/);
});

test("tank_controls_are_hero_relative_and_key_release_sends_zero", () => {
  const source = fs.readFileSync(path.join(ROOT, "client", "src", "input", "greybox-input.ts"), "utf8");
  assert.match(source, /forward \/ length/);
  assert.match(source, /right \/ length/);
  assert.match(source, /window\.addEventListener\("keyup"/);
  assert.match(source, /#keys\.delete\(key\)[\s\S]*?#sendLive\(0\)/);
});

test("weapon_slots_take_slot_authority_before_sending_the_request", () => {
  const source = fs.readFileSync(path.join(ROOT, "client", "src", "v2.ts"), "utf8");
  assert.match(source, /setControlMask\(acceptedControlMask \| 4\)/);
  assert.match(source, /selectSlot: \(slot\)[\s\S]*?selectWeapon\(slot\)/);
});

test("weapon_slots_use_authored_art_instead_of_platform_emoji", () => {
  const shell = SHELL_HTML;
  assert.ok(shell.includes('id="slot-1" class="equipment-slot"'));
  assert.ok(shell.includes('id="slot-2" class="equipment-slot"'));
  assert.equal((shell.match(/<svg class="slot-art"/g) ?? []).length, 2);
  assert.equal(shell.includes("🛡") || shell.includes("⚔"), false,
    "weapon art must not regress to platform emoji");
});

test("g_cycles_the_game_view_and_the_selector_names_the_active_mode", () => {
  const source = fs.readFileSync(path.join(ROOT, "client", "src", "v2.ts"), "utf8");
  assert.match(source, /event\.key\.toLowerCase\(\) !== "g"/);
  assert.match(source, /setPresentationMode\(nextPresentationMode\(presentationMode, event\.shiftKey \? -1 : 1\)\)/);
  assert.match(source, /viewModeButton\.value = presentationMode/);
  const template = /<template id="route-game">([\s\S]*?)<\/template>/.exec(SHELL_HTML)?.[1] ?? "";
  assert.match(template, /<select id="game-view-mode"[^>]*>[\s\S]*?<option value="world">World<\/option>/);
});

// ------------------------------------------------------------------- the picker's rules

test("all_four_arena_hand_selects_offer_the_exact_browser_hand_vocabulary", () => {
  const optionValues = (id) => {
    const body = new RegExp(`<select id="${id}">([\\s\\S]*?)<\\/select>`).exec(SHELL_HTML)?.[1] ?? "";
    return [...body.matchAll(/<option value="([^"]+)"/g)].map((match) => match[1]);
  };
  for (const id of ["a-left", "a-right", "b-left", "b-right"]) {
    assert.deepEqual(optionValues(id), ["empty", "sword", "shield", "club", "bow"],
      `#${id} drifted from HAND_NAMES`);
  }
  assert.deepEqual(CONFIG.HAND_NAMES, ["empty", "sword", "shield", "club", "bow"]);
});

test("the_picker_refuses_every_noncanonical_bow_before_wasm_and_accepts_the_one_canonical_grip", () => {
  const left = picker.review(matchup({ left: "bow", right: "empty", twoHanded: true }), "live");
  assert.match(left.refusal, /^Fighter A carries Bow in its left hand/);
  assert.match(left.refusal, /sole right-hand item with two-handed selected/);

  const oneHanded = picker.review(matchup({ left: "empty", right: "bow", twoHanded: false }), "live");
  assert.match(oneHanded.refusal, /^Fighter A carries Bow one-handed/);
  assert.match(oneHanded.refusal, /canonical two-handed right-hand grip/);

  const occupied = picker.review(matchup({ left: "shield", right: "bow", twoHanded: true }), "live");
  assert.match(occupied.refusal, /^Fighter A carries Bow while its left hand carries shield/);
  assert.match(occupied.refusal, /sole right-hand item/);

  const canonical = matchup({ left: "empty", right: "bow", twoHanded: true });
  assert.deepEqual(picker.review(canonical, "live"), { refusal: null, notes: [] });
  const config = picker.arenaConfigOf(canonical);
  assert.deepEqual(config.fighters[0].hands,
    [CONFIG.HAND_ITEMS.empty, CONFIG.HAND_ITEMS.bow]);
  assert.equal(config.fighters[0].twoHanded, true);
  assert.deepEqual(CONFIG.carriedOf(config.fighters[0]),
    [{ hand: CONFIG.HAND_ITEMS.bow, binding: "Both" }, null]);
});

test("the_picker_refuses_an_empty_handed_fighter_by_naming_the_rust_that_forbids_it", () => {
  for (const mode of ["live", "recording"]) {
    for (const [label, chosen] of [["Fighter A", matchup({ left: "empty", right: "empty" })],
      ["Fighter B", matchup({}, { left: "empty", right: "empty" })]]) {
      const verdict = picker.review(chosen, mode);
      assert.ok(verdict.refusal !== null, `${label} empty-handed must be refused in ${mode}`);
      assert.match(verdict.refusal, new RegExp(`^${label} has both hands empty`));
      assert.match(verdict.refusal, /Loadout\.primary is an ActionKind rather than an Option/);
      assert.match(verdict.refusal, /validate_rows/);
      // The sentence a reader can act on, and specifically not the word the
      // plan singled out as the useless one.
      assert.doesNotMatch(verdict.refusal, /invalid/i);
      assert.deepEqual(verdict.notes, []);
    }
  }
  assert.equal(picker.review(matchup({ left: "empty" }, { right: "empty" }), "live").refusal, null);
});

test("the_picker_refuses_the_grips_the_simulation_refuses_and_encodes_the_legal_one", () => {
  // The three refusals restate `Scenario::duel_from` and its validators, so
  // each must name the rule and the control -- and the legal grip must survive
  // review, reach the config, and round-trip through the 120 bytes.
  // The left hand carries the sword so the earlier empty-handed refusal does
  // not answer first -- what is empty here is specifically the hand the grip
  // names.
  const emptyRight = picker.review(
    matchup({}, { left: "sword", right: "empty", twoHanded: true }), "live");
  assert.match(emptyRight.refusal, /^Fighter B is set two-handed with an empty right hand/);
  const plate = picker.review(
    matchup({ left: "empty", right: "shield", twoHanded: true }), "live");
  assert.match(plate.refusal, /^Fighter A is set two-handed on a shield/);
  assert.match(plate.refusal, /validate_equipment/);
  const fullLeft = picker.review(matchup({ twoHanded: true }), "live");
  assert.match(fullLeft.refusal, /^Fighter A is set two-handed while its left hand carries shield/);
  assert.match(fullLeft.refusal, /validate_bindings/);

  // The legal grip: club in the right hand, left empty. Reviewed clean,
  // carried into the config, and written into byte 1 of the right hand block
  // -- offset 8 + 56 + 12 + 22 + 1 = 99 for fighter B -- where decode finds it.
  const legal = matchup({}, { left: "empty", right: "club", twoHanded: true });
  assert.deepEqual(picker.review(legal, "live"), { refusal: null, notes: [] });
  const config = picker.arenaConfigOf(legal);
  assert.equal(config.fighters[1].twoHanded, true);
  assert.equal(config.fighters[0].twoHanded, false);
  const bytes = CONFIG.encodeArenaConfig(config);
  assert.equal(bytes[99], 1, "the marker missed the right hand block");
  assert.equal(bytes[8 + 12 + 1], 0, "the marker leaked onto fighter A");
  const decoded = CONFIG.decodeArenaConfig(bytes, config.seed);
  assert.equal(decoded.fighters[1].twoHanded, true);
  assert.equal(decoded.fighters[0].twoHanded, false);

  // The recording header spells it the way `lab trace` does: one carried slot,
  // bound Both, and no mirrored second copy.
  assert.deepEqual(CONFIG.carriedOf(config.fighters[1]),
    [{ hand: CONFIG.HAND_ITEMS.club, binding: "Both" }, null]);
});

test("learned_runs_live_and_is_noted_once_because_it_is_the_one_policy_that_fetches", () => {
  // **This test used to assert the opposite and it was right to.** `learned` had
  // no browser inference path, so the picker refused it for a live fight and
  // offered it only for a recorded one. v2-ui-08 split an inference-only
  // `learn-core`, landed policy code 4 and shipped the checkpoint at a URL, and
  // v2-ui-07 wired the fetch -- so every policy runs live and what is left of
  // the old rule is a *note*. The note is not a leftover either: a trained
  // fighter is a kind plus fifteen kilobytes of weights, and a fetch can fail in
  // ways a compiled-in script cannot.
  assert.deepEqual(picker.POLICIES.filter((option) => !option.live), [],
    "every articulated policy has a live driver since v2-ui-08");
  assert.deepEqual(picker.POLICIES.filter((option) => option.fetches !== undefined)
    .map((option) => option.code), ["learned"],
    "learned is the one policy that needs a file this build has to fetch");

  for (const chosen of [matchup({ policy: "learned" }), matchup({}, { policy: "learned" })]) {
    const live = picker.review(chosen, "live");
    assert.equal(live.refusal, null, "a live learned fight is no longer refused");
    assert.equal(live.notes.length, 1);
    // The file, by name, because "fetch one" and "rebuild the module" are the two
    // instructions `ARENA_NO_CHECKPOINT` exists to keep apart.
    assert.match(live.notes[0], /checkpoints\/v2-probe\.ckpt/);
    assert.doesNotMatch(live.notes[0], /no live fight can run/);

    // A *recorded* fight names what the digest is for instead: which learned
    // policy is on screen, since two checkpoints an hour apart are not the same
    // fighter. It used to name `fight-learned.json`, and that stopped being true
    // when [Run selected fight] stopped resolving the recordings table.
    const recorded = picker.review(chosen, "recording");
    assert.equal(recorded.refusal, null);
    assert.equal(recorded.notes.length, 1);
    assert.match(recorded.notes[0], /digest/);
  }
  // Both sides learned is still one note: a sentence printed twice reads as two
  // different problems.
  for (const mode of ["live", "recording"]) {
    const both = picker.review(matchup({ policy: "learned" }, { policy: "learned" }), mode);
    assert.equal(both.notes.length, 1, `${mode}: one note however many sides ask for it`);
  }
  // The empty hands are checked first, because a refusal a reader cannot act on
  // until they have fixed a different refusal is a worse first sentence.
  assert.match(picker.review(matchup({ policy: "learned", left: "empty", right: "empty" }), "live").refusal,
    /^Fighter A has both hands empty/);
  // A policy neither half of the vocabulary knows is still a refusal, and it says
  // which half moved rather than saying "invalid".
  assert.match(picker.review(matchup({ policy: "telepathy" }), "live").refusal,
    /not one of the six articulated policy codes/);
  assert.deepEqual(picker.review(matchup(), "live"), { refusal: null, notes: [] });
});

test("every_policy_pairing_resolves_to_the_one_recording_that_carries_it_or_to_none", () => {
  const offered = new Set(picker.POLICIES.map((option) => option.code));
  for (const recording of picker.RECORDINGS) {
    assert.ok(offered.has(recording.heroes) && offered.has(recording.monsters),
      `${recording.url} names a policy the picker does not offer`);
    const resolved = picker.resolveRecording(matchup({ policy: recording.heroes }, { policy: recording.monsters }));
    assert.equal(resolved, recording);
  }
  assert.deepEqual(picker.RECORDINGS.map((row) => row.url),
    ["/fight.json", "/fight-windmill.json", "/fight-learned.json"]);
  // A pairing nothing recorded, and the reversal of one that is: `heroes` and
  // `monsters` are not interchangeable.
  assert.equal(picker.resolveRecording(matchup({ policy: "composed" }, { policy: "windmill" })), null);
  assert.equal(picker.resolveRecording(matchup({ policy: "composed" }, { policy: "learned" })), null);
  assert.equal(picker.resolveRecording(matchup({ policy: "neutral" }, { policy: "neutral" })), null);
});

test("a_recording_command_exists_only_where_lab_trace_could_actually_produce_one", () => {
  const command = (a, b, seed = 3) => picker.recordingCommand(matchup({ policy: a }, { policy: b }, seed));
  assert.equal(command("composed", "composed"),
    "cargo run --release -p lab -- trace --seed 3 --policy composed");
  assert.equal(command("windmill", "windmill"),
    "cargo run --release -p lab -- trace --seed 3 --policy windmill");
  assert.equal(command("tactical", "tactical"),
    "cargo run --release -p lab -- trace --seed 3 --policy tactical");
  // `--attack-moves` edits composed rather than being a policy of its own.
  assert.equal(command("attack-moves", "attack-moves"),
    "cargo run --release -p lab -- trace --seed 3 --policy composed --attack-moves");
  assert.equal(command("learned", "composed"),
    "cargo run --release -p lab -- trace --seed 3 --policy learned "
      + "--checkpoint checkpoints/v2-probe.ckpt --opponent composed");
  assert.equal(command("learned", "windmill", 11),
    "cargo run --release -p lab -- trace --seed 11 --policy learned "
      + "--checkpoint checkpoints/v2-probe.ckpt --opponent windmill");
  // A mixed *scripted* pairing now has a command, which it did not before
  // combat-arms 03. `--policy` still installs one script on both sides -- that
  // is what makes a scripted trace a control -- but `--hero-policy` and
  // `--monster-policy` name a driver per side, so the corpus and the trace a
  // reader opens to look at it can be the same fight.
  assert.equal(command("composed", "windmill"),
    "cargo run --release -p lab -- trace --seed 3 --hero-policy composed --monster-policy windmill");
  assert.equal(command("openings", "attack-moves", 5),
    "cargo run --release -p lab -- trace --seed 5 --hero-policy openings --monster-policy attack-moves");
  assert.equal(command("openings", "openings"),
    "cargo run --release -p lab -- trace --seed 3 --policy openings");
  // `learned` keeps its own narrower spelling and is not a matchup arm, so a
  // pairing that puts it on the second side still has no command.
  assert.equal(command("composed", "learned"), null);
  assert.equal(command("learned", "learned"), null);
  // And `neutral` has none in either direction: it is an `ArticulatedPolicyKind`
  // the browser can select and not a `lab` script, so naming it would exit 2.
  assert.equal(command("neutral", "neutral"), null);
  assert.equal(command("learned", "neutral"), null);
  assert.equal(command("neutral", "composed"), null);
});

test("a_missing_recording_names_the_command_that_would_make_one_or_says_none_would", () => {
  const recordable = picker.missingRecording(matchup({ policy: "windmill" }, { policy: "windmill" }, 7));
  assert.match(recordable, /^No recording pairs windmill on Fighter A against windmill on Fighter B/);
  assert.match(recordable, /--seed 7 --policy windmill --out web\/fight-windmill\.json/);
  assert.match(recordable, /#\/arena\?trace=\/fight-windmill\.json/);
  // This asserted `/v2-ui-07/` while the prose named that session as future work.
  // It has landed, so the sentence points at the button instead -- and the point
  // of the assertion is unchanged: a reader who asked for a pairing nothing
  // recorded is told what to do next rather than shown an empty page.
  assert.match(recordable, /Press Run selected fight to run this pairing live instead/);
  assert.doesNotMatch(recordable, /v2-ui/);

  const mixed = picker.missingRecording(matchup({ policy: "learned" }, { policy: "windmill" }));
  assert.match(mixed, /--out web\/fight-learned-vs-windmill\.json/);

  const impossible = picker.missingRecording(matchup({ policy: "neutral" }, { policy: "composed" }));
  assert.match(impossible, /and no lab trace command produces one/);
  assert.doesNotMatch(impossible, /Record one with/);
});

test("a_recorded_loadout_reads_both_hands_out_of_the_body_header", () => {
  const trace = syntheticTrace();
  assert.deepEqual(picker.recordedLoadout(trace.bodies[0]),
    { anatomy: "fighter", left: "shield", right: "sword", twoHanded: false });
  // `GripBinding::Both` is one item on the right hand plus the flag -- the
  // same values the controls read -- and specifically not the item copied
  // into both hands, which is what this used to assert and what made a
  // recorded two-handed club incomparable with the controls describing one.
  assert.deepEqual(picker.recordedLoadout(trace.bodies[1]),
    { anatomy: "brute", left: "empty", right: "club", twoHanded: true });
  assert.deepEqual(picker.recordedLoadout({ ...trace.bodies[0], carried: [null, null] }),
    { anatomy: "fighter", left: "empty", right: "empty", twoHanded: false });
});

test("a_recording_mismatch_describes_what_is_on_screen_rather_than_what_was_picked", () => {
  const { frames: _frames, schema: _schema, ...header } = syntheticTrace();
  const picked = matchup({ anatomy: "fighter", left: "shield", right: "sword" },
    { anatomy: "brute", left: "empty", right: "club", twoHanded: true }, header.seed);
  assert.equal(picker.recordingMismatch(picked, header), null);

  const wrongHand = picker.recordingMismatch(matchup({ left: "club" },
    { anatomy: "brute", left: "empty", right: "club", twoHanded: true }, header.seed), header);
  assert.match(wrongHand, /Fighter A is a fighter holding shield left and sword right/);
  assert.doesNotMatch(wrongHand, /Fighter B/);

  // The grip is part of the loadout: the same hands without the flag is a
  // different fighter, and the description says the recorded one is two-handed.
  const wrongGrip = picker.recordingMismatch(matchup({},
    { anatomy: "brute", left: "empty", right: "club", twoHanded: false }, header.seed), header);
  assert.match(wrongGrip, /Fighter B is a brute holding club in both hands/);
  assert.doesNotMatch(wrongGrip, /Fighter A/);
  // Was `/v2-ui-07/`, for the reason above: the way out of a mismatch is now the
  // button rather than a session that had not landed.
  assert.match(wrongHand, /Press Run selected fight to run the one they describe/);
  assert.doesNotMatch(wrongHand, /v2-ui/);

  const wrongSeed = picker.recordingMismatch({ ...picked, seed: header.seed + 1 }, header);
  assert.match(wrongSeed, /The recording was run at seed 3\./);
  assert.doesNotMatch(wrongSeed, /holding/);

  // A header with fewer bodies than the picker has rows describes the ones it
  // has rather than inventing a disagreement about the ones it does not.
  assert.equal(picker.recordingMismatch(picked, { ...header, bodies: [header.bodies[0]] }), null);
});

test("tactical_is_policy_code_five_in_rust_config_and_the_picker", () => {
  const tactical = picker.POLICIES.find((option) => option.code === "tactical");
  assert.deepEqual(tactical, { code: "tactical", label: "tactical", live: true });
  assert.equal(CONFIG.policyCodeOf("tactical"), 5);
  const live = picker.review(matchup({ policy: "tactical" }), "live");
  assert.deepEqual(live, { refusal: null, notes: [] },
    "a live tactical fight needs no checkpoint fetch");
  assert.equal(picker.arenaConfigOf(matchup({ policy: "tactical" })).fighters[0].policy, 5);
});

test("robust strike is an explicit controlled preset with exact ordinal 3144 bytes", () => {
  const config = CONFIG.robustStrikeArenaConfig();
  const bytes = CONFIG.encodeArenaConfig(config);
  const view = new DataView(bytes.buffer);
  assert.equal(bytes.length, 120);
  assert.deepEqual([config.seed, config.maxTicks], [0, 53]);
  assert.deepEqual([view.getUint8(9), view.getUint8(65)], [5, 0]);
  assert.deepEqual([view.getInt32(12, true), view.getInt32(16, true)], [622592, 458752]);
  assert.deepEqual([view.getInt32(68, true), view.getInt32(72, true)], [786432, 524288]);
  assert.equal(view.getInt32(52, true), 131072);
  assert.equal(SHELL_HTML.includes("Robust Strike (controlled)"), true);
});

test("leaving the robust strike preset restores the ordinary attack-moves arena", async () => {
  const harness = installDom();
  try {
    const { mount } = await import(compiled("client/src/arena/arena.js"));
    const container = harness.container();
    const handle = await mount(container, new URLSearchParams());
    const preset = container.querySelector("#arena-preset");
    preset.value = "robust-strike";
    for (const entry of harness.listenersOn(preset, "change")) entry.listener({ target: preset });
    assert.equal(container.querySelector("#a-policy").value, "tactical");
    assert.equal(container.querySelector("#b-policy").value, "neutral");
    assert.equal(container.querySelector("#arena-seed").value, "0");
    assert.equal(container.querySelector("#a-policy").disabled, true);
    assert.match(container.querySelector("#picker-message").textContent,
      /Controlled demonstration: Tactical code 5.*neutral Brute.*Legs.*28 \+ 28 command schedule.*frame 53/);

    preset.value = "custom";
    for (const entry of harness.listenersOn(preset, "change")) entry.listener({ target: preset });
    // `attack-moves`, not `composed`: the custom default moved when the plain
    // composed script was measured to convert almost none of the doubled arm
    // rates -- the argument sits on `populatePolicies` in `arena.ts`.
    assert.deepEqual([container.querySelector("#a-policy").value,
      container.querySelector("#b-policy").value], ["attack-moves", "attack-moves"]);
    assert.equal(container.querySelector("#arena-seed").value, "3");
    assert.equal(container.querySelector("#a-policy").disabled, false);
    await handle.dispose();
    harness.dropSubtree(container);
  } finally {
    harness.restore();
  }
});

test("a_plain_arena_opens_without_fetching_a_recording", async () => {
  const harness = installDom();
  try {
    const { mount } = await import(compiled("client/src/arena/arena.js"));
    const container = harness.container();
    const handle = await mount(container, new URLSearchParams());
    assert.deepEqual(harness.fetches.map((request) => request.url), [],
      "plain #/arena must not guess that /fight.json exists");
    assert.equal(container.querySelector("#status").textContent, "Run a fight.");
    assert.match(SHELL_HTML,
      /<button id="fight" type="button">Run selected fight<\/button>/);
    await handle.dispose();
    harness.dropSubtree(container);
  } finally {
    harness.restore();
  }
});

test("an_empty_trace_query_is_refused_without_fetching_the_document", async () => {
  const harness = installDom();
  try {
    const { mount } = await import(compiled("client/src/arena/arena.js"));
    const container = harness.container();
    const handle = await mount(container, new URLSearchParams([["trace", ""]]));
    assert.deepEqual(harness.fetches.map((request) => request.url), []);
    assert.match(container.querySelector("#status").textContent,
      /^The trace query is empty; name a recording URL or remove trace to run a fight\.$/);
    assert.equal(container.querySelector("#status").classList.contains("error"), true);
    await handle.dispose();
    harness.dropSubtree(container);
  } finally {
    harness.restore();
  }
});

test("the_picker_names_the_loaded_fight_separately_from_the_next_matchup", async () => {
  const harness = installDom();
  try {
    const { mount } = await import(compiled("client/src/arena/arena.js"));
    const container = harness.container();
    const handle = await mount(container,
      new URLSearchParams([["trace", "/fight-learned.json"]]));
    harness.fetches[0].settle({
      ...syntheticTrace(), heroes: "learned", monsters: "composed", checkpoint: "0123456789abcdef",
    });
    await settle();
    container.querySelector("#b-policy").value = "windmill";
    for (const entry of harness.listenersOn(container.querySelector("#b-policy"), "change")) {
      entry.listener({ target: container.querySelector("#b-policy") });
    }
    const copy = container.querySelector("#picker-message").textContent;
    assert.match(copy, /Viewing recording: learned vs composed, seed 3/);
    assert.match(copy, /Next fight: learned vs windmill, seed 3/);
    await handle.dispose();
    harness.dropSubtree(container);
  } finally {
    harness.restore();
  }
});

test("checkpoint_copy_distinguishes_live_execution_from_recorded_provenance", () => {
  assert.equal(picker.checkpointCopy("live"),
    "Live learned fighter: loads checkpoints/v2-probe.ckpt and runs those weights.");
  assert.equal(picker.checkpointCopy("recording"),
    "Recorded fight: playback does not run AI; the digest identifies the weights used "
      + "when the recording was made.");
});

test("a_policy_mismatch_names_the_recording_that_is_still_on_screen", () => {
  const { frames: _frames, schema: _schema, ...header } = syntheticTrace();
  const picked = matchup({ policy: "learned" }, { policy: "windmill" }, header.seed);
  const mismatch = picker.recordingMismatch(picked, header);
  assert.match(mismatch, /The recording still on screen is composed vs composed/);
  assert.match(mismatch, /controls describe learned vs windmill/);
  assert.doesNotMatch(mismatch, /\. [a-z]/,
    "each independently useful mismatch clause must start as a sentence");
});

// --------------------------------------------------------------------- the disposal path

/**
 * What this file measures about the 3D stage: **nothing, and deliberately.**
 *
 * `FakeNode.getContext` answers `null` for everything but `"2d"`, so
 * `createRendererEngine` cannot get a `webgl2` context and `createArenaStage`
 * always rejects. That is not an oversight to be worked around -- a Babylon
 * engine needs a real GPU context and Node has none -- but it does mean every
 * count below is a count taken with no engine, no scene and no GPU memory in
 * play, and reading them as "the route leaks nothing" would be reading half a
 * sentence. The half they do cover is the half a fake DOM can see: listeners on
 * `window`, observers, animation frames and downloads.
 *
 * The other half is covered in two places and neither is here:
 *
 * - `the_arena_stage_owns_every_engine_it_builds_including_one_it_fails_on` in
 *   `client/test/render-contract.test.mjs` drives `createArenaStage` over a
 *   `NullEngine`, including the window where a failure used to leak an engine
 *   that nobody held a reference to. It injects the engine, so backend
 *   selection, the WebGPU-failure canvas replacement and context-loss recovery
 *   -- everything inside `createRendererEngine` -- are bypassed there too.
 * - By hand in Chrome, which is therefore the only evidence for that last part,
 *   and rightly so: context exhaustion is a property of a real driver. Five
 *   `#/arena` mounts interleaved with `#/` gave five `WebGPU1 engine` lines, no
 *   duplicates, no context-exhaustion warning, and the fifth still reported
 *   `webgpu, 24 sources, 37 instances`.
 *
 * `assertStageIsAbsent` below is what keeps this honest rather than merely
 * stated: if a future change made the stage buildable here, the sentence above
 * would be stale and this file would say so.
 */
async function assertStageIsAbsent(container, pass) {
  const label = container.querySelector("#label-three-quarter");
  // `startStage` dynamically imports Babylon before it can fail, and a module
  // graph that large does not arrive on a microtask, so this waits for the
  // sentence rather than assuming it is already written.
  for (let n = 0; n < 500 && label.textContent === "3/4 view"; n += 1) {
    await new Promise((resolve) => { setTimeout(resolve, 10); });
  }
  assert.match(label.textContent, /^3\/4 view -- unavailable: /,
    `pass ${pass}: the stage built an engine, so the counts here now mean something else`);
}

test("mounting_and_disposing_the_arena_twice_leaves_no_listener_observer_or_frame_behind", async () => {
  const harness = installDom();
  try {
    const { mount } = await import(compiled("client/src/arena/arena.js"));
    for (const pass of [1, 2]) {
      const container = harness.container();
      const handle = await mount(container,
        new URLSearchParams([["trace", "/fight.json"]]));

      // Registered, so that the assertions after `dispose` are about a teardown
      // and not about a mount that quietly did nothing.
      assert.ok(harness.liveListeners().includes("window keydown"), `pass ${pass}`);
      assert.deepEqual(harness.liveObservers(), ["observing 4"], `pass ${pass}`);
      assert.equal(harness.pendingFrames(), 1, `pass ${pass}`);
      assert.equal(harness.fetches.length, pass);

      harness.runFrame(16);
      harness.runFrame(32);
      assert.equal(harness.pendingFrames(), 1, "the playback loop must reschedule itself");

      harness.fetches[pass - 1].settle(syntheticTrace());
      await settle();
      assert.match(container.querySelector("#status").innerHTML, /seed 3/,
        "the recording must have reached the panels");
      await assertStageIsAbsent(container, pass);

      await handle.dispose();
      harness.dropSubtree(container);
      assert.deepEqual(harness.liveListeners(), [],
        `pass ${pass}: a listener outlived the route it was mounted for`);
      assert.deepEqual(harness.liveObservers(), [],
        `pass ${pass}: a ResizeObserver outlived the elements it was watching`);
      assert.equal(harness.pendingFrames(), 0,
        `pass ${pass}: an animation frame is still scheduled against detached canvases`);
      assert.equal(harness.timers.size, 0, `pass ${pass}: a timer outlived the route`);

      // Idempotent: the shell disposes on navigation and again on `pagehide`.
      await handle.dispose();
      assert.equal(harness.pendingFrames(), 0);
      assert.deepEqual(harness.liveListeners(), []);
    }
  } finally {
    harness.restore();
  }
});

test("a_truncated_recording_says_so_where_a_reader_can_see_it", async () => {
  // **The flag is only honest if something shows it.** `a_truncated_recording_says_so`
  // in `worker-protocol.test.mjs` proves the recorder *sets* `recordingTruncated`
  // when it hits `RECORDING_EVENT_ROW_CAP`; nothing proved the studio prints it,
  // and `describeFight`'s line could be deleted with every suite still green. A
  // flag nothing shows is not honesty, so this is the other half: the sentence a
  // reader actually gets, in `#status`, off the same `FightHeader.truncated` both
  // sources fill.
  const harness = installDom();
  try {
    const { mount } = await import(compiled("client/src/arena/arena.js"));
    const container = harness.container();
    const handle = await mount(container,
      new URLSearchParams([["trace", "/fight.json"]]));
    const trace = syntheticTrace();
    harness.fetches[0].settle({ ...trace, truncated: true, outcome: "recording truncated" });
    await settle();
    const status = container.querySelector("#status").innerHTML;
    assert.match(status, /recording truncated to 3 frames/,
      "a truncated recording must say so, and say how much of it there is");
    // Beside the rest of the line rather than instead of it: a reader who cannot
    // see which fight this is cannot act on the warning either.
    assert.match(status, /seed 3/);
    await handle.dispose();
    harness.dropSubtree(container);

    // And the untruncated fixture beside it, so the assertion above is about the
    // flag and not about a sentence the page prints unconditionally.
    const second = harness.container();
    const secondHandle = await mount(second,
      new URLSearchParams([["trace", "/fight.json"]]));
    harness.fetches[1].settle(trace);
    await settle();
    assert.doesNotMatch(second.querySelector("#status").innerHTML, /truncated/);
    await secondHandle.dispose();
    harness.dropSubtree(second);
  } finally {
    harness.restore();
  }
});

test("the_paired_frame_probe_advances_one_tick_a_frame_instead_of_reading_the_clock", async () => {
  const harness = installDom();
  try {
    const { mount } = await import(compiled("client/src/arena/arena.js"));
    const tickOf = (container) => Number(/tick (\d+)/.exec(container.querySelector("#tick").textContent)[1]);
    // The three-frame fixture would stop playback before the alternation has
    // said anything, so this repeats it into something long enough to step
    // through. The poses do not matter here; the transport does.
    const longTrace = () => {
      const base = syntheticTrace();
      const frames = Array.from({ length: 12 },
        (_, t) => ({ ...base.frames[t % base.frames.length], t }));
      return { ...base, frames, frameCount: frames.length, ticks: frames.length - 1 };
    };

    /** Play a fight and step `count` animation frames `gap` ms apart. */
    const run = async (params, gap, count) => {
      const container = harness.container();
      const handle = await mount(container,
        new URLSearchParams([["trace", "/fight.json"], ...params]));
      harness.fetches[harness.fetches.length - 1].settle(longTrace());
      await settle();
      container.querySelector("#play").click();
      // One frame first, and the count starts after it: the loop's `last` is the
      // `performance.now()` of the mount, so the first `elapsed` is whatever the
      // process clock happened to read and is not a frame interval at all.
      let now = performance.now();
      harness.runFrame(now);
      const start = tickOf(container);
      for (let n = 0; n < count; n += 1) { now += gap; harness.runFrame(now); }
      const advanced = tickOf(container) - start;
      await handle.dispose();
      harness.dropSubtree(container);
      return advanced;
    };

    // **The phase lock this mode exists to avoid.** `?stage=paired` draws the
    // three viewports on every other animation frame, so the frames between
    // them are the control -- and that only works if every frame draws the rest
    // of the page. Read off the wall clock instead, the tick advances on every
    // *other* frame at 1x on a 120 Hz display: the same period as the
    // alternation and locked to it, which would put every drawn frame in one
    // population and measure the whole page or nothing at all.
    assert.equal(await run([["stage", "paired"]], 8, 5), 5,
      "the probe must advance one tick a frame whatever the clock says");
    assert.equal(await run([["stage", "paired"]], 1, 5), 5,
      "and the same at any frame interval, because it does not read the clock");
    // The shipped route does read it: five frames a millisecond apart are a
    // twelfth of a tick at 1x, so nothing moves.
    assert.equal(await run([], 1, 5), 0);
    assert.equal(await run([], 17, 5), 5);
  } finally {
    harness.restore();
  }
});

test("disposing_the_arena_mid_download_aborts_it_and_the_late_answer_changes_nothing", async () => {
  const harness = installDom();
  try {
    const { mount } = await import(compiled("client/src/arena/arena.js"));
    const container = harness.container();
    const handle = await mount(container, new URLSearchParams([["trace", "/fight-learned.json"]]));
    const download = harness.fetches[0];
    assert.equal(download.url, "/fight-learned.json", "the deep link must reach the fetch");
    assert.equal(download.signal.aborted, false);

    await handle.dispose();
    assert.equal(download.signal.aborted, true, "an 8-9 MB download must not outlive its route");
    await settle();

    // The answer that arrives after the route is gone writes nothing: no frame
    // is rescheduled, no listener is re-registered, and the panels stay empty.
    harness.dropSubtree(container);
    assert.equal(harness.pendingFrames(), 0);
    assert.deepEqual(harness.liveListeners(), []);
    assert.deepEqual(harness.liveObservers(), []);
    assert.equal(container.querySelector("#status").innerHTML, "");
  } finally {
    harness.restore();
  }
});

test("every_registration_that_outlives_the_route_subtree_is_released_in_the_same_file", () => {
  // The arena's teardown is measured above; this is the same question asked of
  // `v2.ts`, whose mount needs a WebGL context, a module worker and the wasm
  // artifact and so cannot be harnessed honestly here at all. It is a weaker
  // check on purpose -- it reads source rather than behaviour -- and it exists
  // because the alternative for that file is no check.
  for (const relative of ["client/src/arena/arena.ts", "client/src/v2.ts"]) {
    const source = fs.readFileSync(path.join(ROOT, relative), "utf8");
    for (const match of source.matchAll(/\b(window|document)\.addEventListener\(\s*"([^"]+)"\s*,\s*([A-Za-z_$][\w$]*)/g)) {
      const release = new RegExp(`\\b${match[1]}\\.removeEventListener\\(\\s*"${match[2]}"\\s*,\\s*${match[3]}\\b`);
      assert.match(source, release,
        `${relative} registers ${match[1]} ${match[2]} and never gives it back`);
    }
    const balanced = [
      ["new ResizeObserver", /\bnew ResizeObserver\(/g, /\.disconnect\(\)/g],
      ["requestAnimationFrame", /\brequestAnimationFrame\(/g, /\bcancelAnimationFrame\(/g],
      ["setInterval", /\bsetInterval\(/g, /\bclearInterval\(/g],
    ];
    for (const [what, register, release] of balanced) {
      if ((source.match(register) ?? []).length === 0) continue;
      assert.ok((source.match(release) ?? []).length >= 1,
        `${relative} calls ${what} and never cancels it`);
    }
  }

  // **The one re-registration a disposal cannot reach**, checked the same weaker
  // way and for the same reason. `createArenaStage` calls back when a WebGPU
  // initialisation failure replaces the canvas, which can land arbitrarily late
  // -- after `dispose` has disconnected the observer and handed the route back
  // -- and re-observing there re-arms an observer nobody owns and delivers one
  // initial callback against detached canvases on the way. It cannot be driven
  // from this harness: the engine that would call it is the engine Node has no
  // context for.
  const arena = fs.readFileSync(path.join(ROOT, "client/src/arena/arena.ts"), "utf8");
  const callback = /onCanvasReplaced:[\s\S]*?onTerminal:/.exec(arena);
  assert.ok(callback, "arena.ts no longer registers an onCanvasReplaced callback");
  assert.match(callback[0], /if \(disposed\) return;[\s\S]*observer\.observe\(/,
    "onCanvasReplaced re-observes without first checking that the route is still up");
});

/**
 * Every module specifier a source imports, however the import is written.
 *
 * **Matched on the `from` clause and not on the start of a line**, which is the
 * whole correction here: the rule below used to be
 * `/^import[^\n]*(?:...)/m` and a multi-line `import { ... } from "..."` block
 * evaded it because the line carrying the specifier does not begin with
 * `import`. Dynamic `import("...")` is read too, since a rule about what a
 * module reaches that a `await import()` walks straight past is not a rule.
 */
function importedSpecifiers(source) {
  const found = [];
  for (const match of source.matchAll(/\bfrom\s*["']([^"']+)["']/g)) found.push(match[1]);
  for (const match of source.matchAll(/\bimport\s*\(\s*["']([^"']+)["']/g)) found.push(match[1]);
  return found;
}

test("the_arena_and_the_fight_modules_reach_neither_the_worker_nor_the_wasm", () => {
  // `#/arena` plays a fight it either recorded through a worker or downloaded as
  // JSON, and `npm run view` -- Vite with no wasm build at all -- must still open
  // it: the worker is built lazily on the first [Run selected fight], and a trace plays with
  // no wasm on the machine.
  //
  // **This assertion passed for two sessions while being broken, and the shape of
  // the break is worth more than the rule.** It was per line and anchored at
  // `^import`, so `client/src/fight/live.ts` imported `protocol/abi.generated.js`
  // through a multi-line block and was missed on a line break;
  // `client/src/arena/arena.ts` imported `runtime/sim-worker.js` and was missed
  // because the alternation spelled the other module with a literal dot; and
  // `live.ts` imported `runtime/arena-recorder.js` -- which itself imports
  // `protocol/abi.generated` -- and was missed because nothing named it. That is
  // the third architecture rule in this series enforced by scanning source text
  // that passed while broken, the others being a dependency test matching
  // `path = "../` byte-exactly and a bundle assertion reading one `<script src>`.
  //
  // So the reach is matched on the specifier, and the exceptions are named **by
  // file and by specifier with the reason**, because an exception that is a
  // formatting accident is not an exception -- it is a hole.
  const REACHES = /(?:sim\.worker|sim-worker|protocol\/abi|arena-recorder)/;
  // Two of them are refused outright and no allowlist may carry them: `sim.worker`
  // is the module that instantiates `/web.wasm`, and `sim-worker-host` is the
  // state machine that drives it. Either one in this graph is the failure the
  // rule was written for.
  const NEVER = /(?:sim\.worker|sim-worker-host)/;
  const ALLOWED = new Map([
    ["arena/arena.ts", new Map([
      // A module whose whole body is `new Worker(new URL("./sim.worker.ts", ...))`
      // inside a function. Vite emits the worker as its own chunk and nothing
      // fetches it until [Run selected fight] constructs one, so the static import costs a
      // reader with no wasm build nothing at all.
      ["../runtime/sim-worker.js", "the lazy worker factory; the Worker is constructed in onFight"],
    ])],
    ["fight/live.ts", new Map([
      // Generated constants. The packed rows this file decodes are addressed by
      // `POSE_*`, `REGION_*` and `COMBAT_EVENT_*`, and the rule's stated reason --
      // that such an import "would quietly make the release wasm a prerequisite
      // for looking at a fight" -- is not true of a table of integers.
      ["../protocol/abi.generated.js", "generated column offsets; a table of integers, no wasm"],
      // The seven index words, from the module that wrote them. A second copy
      // here would be a second answer to where a frame's rows begin.
      ["../runtime/arena-recorder.js", "RECORDING_INDEX_STRIDE and the INDEX_* words"],
    ])],
  ]);

  const seen = new Set();
  for (const directory of ["arena", "fight"]) {
    const where = path.join(ROOT, "client", "src", directory);
    for (const name of fs.readdirSync(where).filter((entry) => entry.endsWith(".ts"))) {
      const relative = `${directory}/${name}`;
      const source = fs.readFileSync(path.join(where, name), "utf8");
      assert.doesNotMatch(source, /WebAssembly\./, `client/src/${relative} names WebAssembly`);
      for (const specifier of importedSpecifiers(source)) {
        assert.doesNotMatch(specifier, NEVER,
          `client/src/${relative} imports ${specifier}, which instantiates the wasm`);
        if (!REACHES.test(specifier)) continue;
        const allowed = ALLOWED.get(relative);
        assert.ok(allowed?.has(specifier),
          `client/src/${relative} imports ${specifier}: either it does not belong in this `
          + `graph, or the exception belongs in this test's allowlist with its reason`);
        seen.add(`${relative} ${specifier}`);
      }
    }
  }
  // **The allowlist is exact and not a ceiling.** An entry nothing uses is an
  // exception granted for an import that has since moved, and the next one to
  // arrive would inherit it silently.
  const expected = [...ALLOWED].flatMap(([file, rows]) => [...rows.keys()].map((s) => `${file} ${s}`));
  assert.deepEqual([...seen].sort(), expected.sort(),
    "every allowlisted reach must still exist, and nothing else may reach");

  // **The old rule against the three shapes it missed**, so the correction is
  // demonstrated here rather than asserted in a comment.
  const OLD = /^import[^\n]*(?:sim\.worker|runtime\/sim-worker-host|protocol\/abi)/m;
  const shapes = [
    ['import { createSimWorker } from "../runtime/sim-worker.js";\n', "a hyphen, not a dot"],
    ['import {\n  POSE_BODY_X,\n} from "../protocol/abi.generated.js";\n', "a multi-line block"],
    ['import {\n  INDEX_TICK,\n} from "../runtime/arena-recorder.js";\n', "a module nothing named"],
  ];
  for (const [shape, why] of shapes) {
    assert.doesNotMatch(shape, OLD, `the old rule was expected to miss ${why}`);
    assert.ok(importedSpecifiers(shape).some((s) => REACHES.test(s)), `the new rule misses ${why}`);
  }
});
