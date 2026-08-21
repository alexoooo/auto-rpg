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
const INPUT = await import(compiled("client/src/arena/arena-input.js"));
const CURSOR = await import(compiled("client/src/arena/arena-hand-cursor.js"));
const CONTROL = await import(compiled("client/src/arena/control-lab.js"));
const CLOCK = await import(compiled("client/src/arena/controlled-clock.js"));

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
    this.style = {};
    this.dataset = {};
    this.hidden = false;
    this.attributes = new Map();
    this.classes = new Set();
    this.context = null;
    this.capturedPointers = new Set();
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
    if (id === "arena-3d") {
      const parent = this.querySelector("#arena-stage");
      node.parentElement = parent;
      parent.children.push(node);
    }
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
  append(...nodes) {
    for (const node of nodes) {
      if (node.parentElement !== undefined) {
        node.parentElement.children = node.parentElement.children.filter((child) => child !== node);
      }
      node.parentElement = this;
      this.children.push(node);
    }
  }
  prepend(...nodes) {
    for (const node of [...nodes].reverse()) {
      if (node.parentElement !== undefined) {
        node.parentElement.children = node.parentElement.children.filter((child) => child !== node);
      }
      node.parentElement = this;
      this.children.unshift(node);
    }
  }
  before() { /* placement is not what this harness measures */ }
  remove() {
    if (this.parentElement !== undefined) {
      this.parentElement.children = this.parentElement.children.filter((child) => child !== this);
    }
  }
  replaceChildren(...nodes) { this.children = [...nodes]; }
  click() { for (const entry of this.harness.listenersOn(this, "click")) entry.listener({ target: this }); }
  setPointerCapture(id) { this.capturedPointers.add(id); }
  releasePointerCapture(id) { this.capturedPointers.delete(id); }
  hasPointerCapture(id) { return this.capturedPointers.has(id); }
  requestPointerLock() {
    globalThis.document.pointerLockElement = this;
    queueMicrotask(() => {
      for (const entry of this.harness.listenersOn(globalThis.document, "pointerlockchange")) entry.listener({});
    });
    return Promise.resolve();
  }
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
    /** Every `new Worker` the route constructed, newest last. */
    workers: [],
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
  fakeWindow.setTimeout = (callback, delay) => setTimeout(callback, delay);
  fakeWindow.clearTimeout = (handle) => clearTimeout(handle);

  const fakeDocument = new FakeNode(harness, null, "document", "");
  fakeDocument.getElementById = (id) => {
    const node = fakeDocument.querySelector(`#${id}`);
    if (node.content === undefined && TEMPLATE_TAGS.get(id) === "template") {
      node.content = { child: new FakeNode(harness, null, "div", `${id}-root`), cloneNode: () => node.content };
    }
    return node;
  };
  fakeDocument.createElement = (tag) => new FakeNode(harness, null, tag, "");
  fakeDocument.pointerLockElement = null;
  fakeDocument.exitPointerLock = async () => { fakeDocument.pointerLockElement = null; };

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
    /**
     * A `Worker` that records rather than runs.
     *
     * **`createSimWorker` is reached and not stubbed around**, which is the
     * point: the lazy-worker rule this file already enforces says the module is
     * imported statically and the `Worker` is constructed only on [Fight], and a
     * test that replaced the factory would prove that about its own stub. What
     * is faked is the browser primitive, one level below the rule.
     */
    Worker: class {
      constructor(url) {
        this.url = String(url);
        this.sent = [];
        this.listeners = new Map();
        this.terminated = false;
        harness.workers.push(this);
      }
      addEventListener(kind, listener) {
        const held = this.listeners.get(kind) ?? [];
        held.push(listener);
        this.listeners.set(kind, held);
      }
      postMessage(message, transfer = []) { this.sent.push({ message, transfer }); }
      terminate() { this.terminated = true; }
      emit(data) { for (const listener of this.listeners.get("message") ?? []) listener({ data }); }
    },
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
    fingerprint: "abc123", seed: 3, heroes: "scripted", monsters: "scripted",
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

const side = (overrides = {}) => ({ anatomy: "fighter", left: "shield", right: "sword", twoHanded: false, policy: "scripted", control: "policy", ...overrides });
const matchup = (a = {}, b = {}, seed = 3, maxTicks = 3_600) => ({
  a: side(a), b: side(b), seed, maxTicks,
});

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

test("the_picker_says_when_a_choice_it_honours_shows_the_reader_nothing", () => {
  // **`learned_runs_live_and_is_noted_once_because_it_is_the_one_policy_that_
  // fetches` stood here and its subject is gone.** `learned` had no browser
  // inference path, then had one, and then stopped being a picker policy at all
  // when v2-ui-08 moved `#/arena` onto `PolicyKind` -- a registry with
  // no `learned` entry, because a trained fighter is a kind plus fifteen
  // kilobytes of weights and a policy byte has nowhere to put a checkpoint.
  //
  // What replaces it is the same *shape* of claim about two different choices,
  // and both were measured through the wasm ABI on 2026-08-19 rather than
  // reasoned: two `neutral` fighters move no pose word at all in 3,600 ticks,
  // and `scripted` against `scripted-level` produces the same state hash to the
  // bit because this arena's floor is flat. Both requests are honoured exactly
  // as specified, so neither can be a refusal -- and a dropdown that shows the
  // reader the same fight, or no fight, without saying so is the shape
  // `AGENTS.md` calls a control accepting an input it cannot act on.
  assert.deepEqual(picker.POLICIES.filter((option) => !option.live), [],
    "every embodied policy has a live driver");
  assert.deepEqual(picker.POLICIES.filter((option) => option.fetches !== undefined), [],
    "no embodied policy fetches an asset");

  const both = picker.review(matchup({ policy: "neutral" }, { policy: "neutral" }), "live");
  assert.equal(both.refusal, null, "neutral is a legal choice and not a refusal");
  assert.equal(both.notes.length, 1);
  assert.match(both.notes[0], /control condition/);
  assert.match(both.notes[0], /no pose word/);

  // One side neutral is a fight, so it is not noted.
  assert.deepEqual(picker.review(matchup({ policy: "neutral" }, { policy: "tactical" }), "live"),
    { refusal: null, notes: [] });

  // And the level note, on either side and once for both.
  for (const chosen of [
    matchup({ policy: "scripted-level" }),
    matchup({}, { policy: "scripted-level" }),
    matchup({ policy: "scripted-level" }, { policy: "scripted-level" }),
  ]) {
    const verdict = picker.review(chosen, "live");
    assert.equal(verdict.refusal, null);
    assert.equal(verdict.notes.length, 1, "one note however many sides ask for it");
    assert.match(verdict.notes[0], /the same fight, byte for byte/);
    assert.match(verdict.notes[0], /embodied --slope/);
  }

  // The empty hands are checked first, because a refusal a reader cannot act on
  // until they have fixed a different refusal is a worse first sentence.
  assert.match(picker.review(matchup({ policy: "neutral", left: "empty", right: "empty" }), "live").refusal,
    /^Fighter A has both hands empty/);
  // A policy neither half of the vocabulary knows is still a refusal, and it says
  // which half moved rather than saying "invalid". **The count comes from
  // `POLICIES.length` now**: this assertion read "the six articulated policy
  // codes" verbatim while the table held seven rows and then five, which is the
  // third instance of that trap recorded in this repository.
  const unknown = picker.review(matchup({ policy: "telepathy" }), "live").refusal;
  assert.match(unknown, new RegExp(`not one of the ${picker.POLICIES.length} embodied policy codes`));
  assert.match(unknown, /Arena policy reader/);
  // And the retired names are refused by name, which is what a saved matchup
  // from before v2-ui-08 arrives as.
  for (const gone of ["composed", "windmill", "attack-moves", "openings", "learned"]) {
    assert.match(picker.review(matchup({ policy: gone }), "live").refusal,
      new RegExp(`is set to ${gone}, which is not one of`));
  }
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
    ["/fight.json", "/fight-tactical.json"]);
  // A pairing nothing recorded, and a mixed one built from two that are:
  // `heroes` and `monsters` are not interchangeable, and both rows being
  // symmetric is exactly the case a `find` reading one side would get away with.
  assert.equal(picker.resolveRecording(matchup({ policy: "scripted" }, { policy: "tactical" })), null);
  assert.equal(picker.resolveRecording(matchup({ policy: "tactical" }, { policy: "scripted" })), null);
  assert.equal(picker.resolveRecording(matchup({ policy: "neutral" }, { policy: "neutral" })), null);
});

test("a_recording_command_exists_only_where_lab_trace_could_actually_produce_one", () => {
  const command = (a, b, seed = 3) => picker.recordingCommand(matchup({ policy: a }, { policy: b }, seed));
  // **Every picker code is a `lab` policy since v2-ui-08**, which is the whole
  // of what that step did here: `lab trace` had a `Script` vocabulary of its own
  // -- composed, windmill, attack-moves, tactical, openings -- and `--policy`,
  // `--hero-policy` and `--monster-policy` now read
  // `PolicyKind::from_name`, the same registry this table is. So the
  // list is derived rather than restated, and this loop is what says the
  // derivation holds for every row rather than for the two somebody typed out.
  for (const option of picker.POLICIES.filter((row) => row.code !== "learned-roster")) {
    assert.equal(command(option.code, option.code),
      `cargo run --release -p lab -- trace --seed 3 --policy ${option.code}`);
  }
  assert.equal(command("learned-roster", "scripted"),
    "cargo run --release -p lab -- trace --seed 3 --policy learned-roster --opponent scripted");
  assert.equal(command("scripted", "learned-roster"), null);
  assert.equal(command("learned-roster", "learned-roster"), null);
  assert.equal(command("scripted", "tactical"),
    "cargo run --release -p lab -- trace --seed 3 --hero-policy scripted --monster-policy tactical");
  assert.equal(command("tactical-fixed-guard", "neutral", 5),
    "cargo run --release -p lab -- trace --seed 5 --hero-policy tactical-fixed-guard "
      + "--monster-policy neutral");
  // **`neutral` has a command now and used to have none**, which is the two
  // vocabularies merging rather than a widening: it was an
  // `ArticulatedPolicyKind` the browser could select and not a `lab` script, so
  // naming it exited 2.
  assert.equal(command("neutral", "neutral"),
    "cargo run --release -p lab -- trace --seed 3 --policy neutral");
  // And a name from neither half still has none. It is unreachable from the
  // controls -- `review` refuses it before the button is enabled -- and reachable
  // from a `?trace=` header and from a saved matchup, and the alternative to
  // `null` is printing a command that exits 2 at the reader's shell.
  assert.equal(command("composed", "composed"), null);
  assert.equal(command("learned", "scripted"), null);
  assert.equal(command("scripted", "windmill"), null);
});

test("a_missing_recording_names_the_command_that_would_make_one_or_says_none_would", () => {
  const recordable = picker.missingRecording(matchup({ policy: "neutral" }, { policy: "neutral" }, 7));
  assert.match(recordable, /^No recording pairs neutral on Fighter A against neutral on Fighter B/);
  assert.match(recordable, /--seed 7 --policy neutral --out web\/fight-neutral\.json/);
  assert.match(recordable, /#\/arena\?trace=\/fight-neutral\.json/);
  // This asserted `/v2-ui-07/` while the prose named that session as future work.
  // It has landed, so the sentence points at the button instead -- and the point
  // of the assertion is unchanged: a reader who asked for a pairing nothing
  // recorded is told what to do next rather than shown an empty page.
  assert.match(recordable, /Press Run selected fight to run this pairing live instead/);
  assert.doesNotMatch(recordable, /v2-ui/);

  const mixed = picker.missingRecording(matchup({ policy: "scripted" }, { policy: "neutral" }));
  assert.match(mixed, /--out web\/fight-scripted-vs-neutral\.json/);

  // A name from neither vocabulary, which is what a matchup saved before
  // v2-ui-08 arrives as. `review` refuses it before the button is enabled, so
  // this sentence is what a `?trace=` header carrying one produces.
  const impossible = picker.missingRecording(matchup({ policy: "windmill" }, { policy: "scripted" }));
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

test("the_picker_and_the_config_agree_on_every_policy_code", () => {
  // **Was `tactical_is_policy_code_five_in_rust_config_and_the_picker`**, which
  // pinned one row and one number. v2-ui-08 moved both halves onto
  // `PolicyKind`, where `tactical` is `3` and not `5` -- so a test
  // written around one row would have to be re-recorded every time the registry
  // grows, and a test written around one row is also the shape that let
  // `POLICIES` and `ARENA_POLICY_NAMES` drift apart in the first place. Every
  // row, both directions.
  assert.equal(picker.POLICIES.length, CONFIG.ARENA_POLICY_NAMES.length,
    "the picker and the config disagree about how many policies there are");
  picker.POLICIES.forEach((option, code) => {
    assert.equal(CONFIG.ARENA_POLICY_NAMES[code], option.code,
      `POLICIES[${code}] and ARENA_POLICY_NAMES[${code}] name different policies`);
    assert.equal(CONFIG.policyCodeOf(option.code), code,
      `${option.code} does not round-trip to ${code}`);
    assert.equal(picker.arenaConfigOf(matchup({ policy: option.code })).fighters[0].policy, code,
      `${option.code} did not reach the buffer as ${code}`);
  });
  // The registry itself, so a *reordering* that kept both sides agreeing is
  // still caught. These are `PolicyKind::code`'s own numbers and the
  // enum is append-only.
  assert.deepEqual([...CONFIG.ARENA_POLICY_NAMES],
    ["neutral", "scripted", "scripted-level", "tactical", "tactical-fixed-guard",
      "learned-roster"]);
});

// **`robust strike is an explicit controlled preset with exact ordinal 3144
// bytes` and `leaving the robust strike preset restores the ordinary
// attack-moves arena` stood here.** Between them they pinned
// `robustStrikeArenaConfig`'s 120 bytes, the `demo` dropdown's second option,
// the disabling of every picker control while it was selected, the sentence it
// wrote, and the restoration of the custom defaults on the way out. v2-ui-08
// deleted the Rust preset those bytes addressed -- `crates/web/src/lib.rs`
// carries the reasons, and the short one is that the frozen schedule wrote world
// bearings into what is now a torso frame -- so the dropdown, its markup and
// both tests went with it. `the_arena_opens_on_a_pairing_that_fights` below is
// what covers the defaults the second of them also happened to assert.

// ------------------------------------------------- the split screen and its control

test("the_arena_configures_a_on_the_left_and_b_on_the_right", () => {
  // Read off the shipped template, because the claim is about the *screen*: two
  // columns, A first, and both carrying the same controls in the same order. A
  // comparison whose two halves are laid out differently is one a reader has to
  // translate before they can make it.
  const sides = [...SHELL_HTML.matchAll(
    /<div class="picker-side (hero|monster)">([\s\S]*?)<\/div>\s*(?=<div class="picker-side|<\/div>)/g)];
  assert.equal(sides.length, 2, "the picker is not two side columns");
  assert.deepEqual(sides.map((match) => match[1]), ["hero", "monster"],
    "Fighter A is not the left-hand column");
  const controlsOf = (body) => [...body.matchAll(/\sid="([^"]+)"/g)]
    .map((match) => match[1]).filter((id) => !id.endsWith("-preview-dress"));
  const [a, b] = sides.map((match) => controlsOf(match[2]));
  assert.deepEqual(a, ["a-anatomy", "a-left", "a-right", "a-two-handed", "a-control",
    "a-off-hand-row", "a-off-hand"]);
  assert.deepEqual(b.map((id) => id.replace(/^b-/, "a-")), a,
    "the two columns do not carry the same controls in the same order");
  // The labels a refusal names, so a sentence saying "Fighter A" points at a
  // column a reader can see.
  assert.match(sides[0][2], /<span class="side">Fighter A<\/span>/);
  assert.match(sides[1][2], /<span class="side">Fighter B<\/span>/);
});

test("the_preview_cards_are_pinned_to_the_same_columns_as_their_camera_viewports", () => {
  const hero = /\.picker-side\.hero\s*\{[^}]*grid-column:\s*(\d+)/.exec(SHELL_HTML);
  const monster = /\.picker-side\.monster\s*\{[^}]*grid-column:\s*(\d+)/.exec(SHELL_HTML);
  assert.equal(hero?.[1], "1", "Fighter A must overlay the preview's left half");
  assert.equal(monster?.[1], "2", "Fighter B must overlay the preview's right half");
  assert.match(SHELL_HTML,
    /@media \(max-width: 44rem\)[\s\S]*?\.picker-sides\s*\{[^}]*repeat\(2,/,
    "narrow layout must retain two columns because the canvas retains two horizontal viewports");
});

test("selection_and_fight_share_one_fixed_shell_with_closed_drawers_and_bounded_timeouts", () => {
  assert.match(SHELL_HTML, /\.route-arena\s*\{[^}]*position:\s*fixed;[^}]*inset:\s*0;[^}]*height:\s*100svh/,
    "the arena must own one route-local viewport rather than document scroll");
  assert.match(SHELL_HTML,
    /\.route-arena\[data-phase="fight"\]\s*\{[^}]*grid-template-rows:\s*minmax\(0,\s*1fr\)/,
    "fight mode must give the stage the only flexible shell row");
  assert.match(SHELL_HTML,
    /\.route-arena\[data-phase="fight"\] \.stage-row\s*\{[^}]*grid-row:\s*1/,
    "the fight stage must explicitly occupy the full game-screen row");
  for (const id of ["arena-plans-panel", "arena-replay-panel", "arena-details-panel"]) {
    assert.match(SHELL_HTML, new RegExp(`id="${id}" hidden`), `${id} must open closed`);
  }
  for (const id of ["arena-eyes", "arena-plans", "arena-replay", "arena-details"]) {
    assert.equal(TEMPLATE_TAGS.get(id), "button", `${id} must be an edge control`);
  }
  assert.match(SHELL_HTML, /\.route-arena \[hidden\]\s*\{\s*display:\s*none\s*!important;/,
    "author display rules must not override the route's hidden authority");
  for (const selector of ["> .stage-row", "> #arena-replay-panel",
    "> #arena-details-panel"]) {
    assert.match(SHELL_HTML, new RegExp(`\\.route-arena\\[data-phase="select"\\][\\s\\S]*?${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^}]*display:\\s*none`),
      `selection must explicitly hide ${selector}`);
  }
  assert.match(SHELL_HTML,
    /<div id="arena-replay-panel" hidden>[\s\S]*?<figure>[\s\S]*?id="chart"[\s\S]*?id="arena-replay-controls"[\s\S]*?<\/div>\s*<\/div>/,
    "Replay chart and controls must share one positioned drawer");
  assert.match(SHELL_HTML,
    /<div class="panels" id="arena-details-panel" hidden>[\s\S]*?<p class="legend">[\s\S]*?<\/p>\s*<\/div>/,
    "fight help must live inside the hidden Details drawer, not consume a shell grid row");
  assert.deepEqual([...SHELL_HTML.matchAll(/<option value="(3600|10800|18000|36000)"/g)]
    .map((match) => Number(match[1])), [3_600, 10_800, 18_000, 36_000]);
  assert.equal(TEMPLATE_VALUES.get("arena-time-limit").value, "3600");
  assert.equal(picker.arenaConfigOf(matchup({}, {}, 9, 36_000)).maxTicks, 36_000);
  assert.match(picker.summariseMatchup(matchup({}, {}, 9, 10_800)), /180 second limit/);
  assert.match(SHELL_HTML, /id="arena-health-a"[^>]*max="65536"[^>]*value="65536"/);
  assert.match(SHELL_HTML, /id="arena-health-b"[^>]*max="65536"[^>]*value="65536"/);
});

test("zero_over_max_and_midfight_timeout_changes_are_refused_by_name", () => {
  const harness = installDom();
  try {
    const container = harness.container();
    const time = container.querySelector("#arena-time-limit");
    for (const invalid of [0, 36_001, 1.5]) {
      time.value = String(invalid);
      assert.throws(() => picker.readMatchup(container),
        /ARENA_TIME_LIMIT_INVALID: .*outside 1\.\.36000 ticks/);
    }
    time.value = "36000";
    assert.equal(picker.readMatchup(container).maxTicks, 36_000);
    const source = fs.readFileSync(path.join(ROOT, "client/src/arena/arena.ts"), "utf8");
    assert.match(source, /timeLimitInput\.disabled = next === "fight"/,
      "the matchup fingerprint must not change after fight phase begins");
  } finally {
    harness.restore();
  }
});

test("the_seed_and_the_fight_button_belong_to_the_matchup_and_not_to_side_b", () => {
  // They were jammed into the end of Fighter B's row when the picker was two
  // stacked rows, which read as an accident of the layout the moment the layout
  // became two columns: a seed and a [Fight] belong to the pair, and a matchup
  // has no side. Asserted from both directions -- in the footer, and out of
  // both columns -- because "present in the footer" would pass over a copy.
  const footer = /<div class="picker-footer" id="picker-footer">([\s\S]*?)<\/div>\s*<!--/
    .exec(SHELL_HTML)?.[1];
  assert.ok(footer !== undefined, "the picker has no matchup footer");
  assert.match(footer, /id="arena-seed"/);
  assert.match(footer, /id="fight"/);
  assert.match(footer, /id="picker-message"/);
  const columns = [...SHELL_HTML.matchAll(
    /<div class="picker-side (?:hero|monster)">([\s\S]*?)<\/div>\s*(?=<div class="picker-side|<\/div>)/g)];
  for (const [, body] of columns) {
    assert.doesNotMatch(body, /id="arena-seed"/, "the seed is still inside a fighter column");
    assert.doesNotMatch(body, /id="fight"/, "the button is still inside a fighter column");
  }
  // And exactly one of each in the whole template, so the assertions above are
  // about the only copy there is.
  assert.equal(SHELL_HTML.match(/id="arena-seed"/g).length, 1);
  assert.equal(SHELL_HTML.match(/id="fight"/g).length, 1);
});

test("both_sides_driven_by_you_is_refused_by_naming_the_one_keyboard", () => {
  assert.equal(picker.HUMAN_CONTROL_LABEL,
    "you (keys + visible cursor hand)");
  const both = picker.review(matchup({ control: "human" }, { control: "human" }), "live");
  assert.match(both.refusal, /^Fighter A and Fighter B are both set to be driven by you/);
  assert.match(both.refusal, /one keyboard and one reserved hand-control channel/);
  assert.match(both.refusal, /Set one of the two back to a policy/);
  assert.deepEqual(both.notes, []);
  // The word the plan singled out as the useless one, absent here as it is from
  // every other refusal this module writes.
  assert.doesNotMatch(both.refusal, /invalid/i);
  // **Bounded from the other side.** One human side is refused by a *different*
  // sentence -- the build's, below -- so this refusal has to be about the pair
  // rather than about the presence of a human at all.
  for (const one of [matchup({ control: "human" }), matchup({}, { control: "human" })]) {
    assert.doesNotMatch(picker.review(one, "live").refusal ?? "",
      /both set to be driven by you/, "one human side answered the two-keyboards refusal");
  }
});

test("a_human_side_uses_the_configured_strike_hand_else_right", () => {
  // A shield is not a strike hand, so shield-left/empty-right reaches the
  // documented Right fallback and names the empty hand.
  for (const [label, chosen] of [
    ["Fighter A", matchup({ control: "human", left: "shield", right: "empty" })],
    ["Fighter B", matchup({}, { control: "human", left: "shield", right: "empty" })],
  ]) {
    const verdict = picker.review(chosen, "live");
    assert.match(verdict.refusal, new RegExp(`^${label} is set to be driven by you`));
    assert.match(verdict.refusal, /right hand is empty and the right hand is reserved for direct control/);
    assert.match(verdict.refusal, new RegExp(`Give ${label} a weapon in that hand`));
    assert.deepEqual(verdict.notes, []);
  }
  // A left-only sword is the important opposite: it is the strike hand, so the
  // picker must not reimplement the old always-Right rule.
  assert.equal(picker.review(matchup({ left: "shield", right: "empty" }), "live").refusal, null);
  const leftOnly = matchup({ control: "human", left: "sword", right: "empty" });
  assert.equal(picker.humanArmOf(leftOnly.a), "left");
  assert.equal(picker.review(leftOnly, "live").refusal, null);
  assert.equal(picker.humanArmOf(matchup({ control: "human", left: "shield", right: "empty" }).a),
    "right");
});

test("one_human_side_reaches_the_configuration_without_the_retired_refusal", () => {
  for (const chosen of [matchup({ control: "human" }), matchup({}, { control: "human" })]) {
    const verdict = picker.review(chosen, "live");
    assert.equal(verdict.refusal, null);
    assert.equal(CONFIG.ARENA_CONTROL_UNAVAILABLE, 29);
    assert.match(CONFIG.ARENA_REFUSALS[CONFIG.ARENA_CONTROL_UNAVAILABLE], /no arena input path/);
  }
  assert.equal(picker.review(matchup(), "live").refusal, null);
  const config = picker.arenaConfigOf(matchup({ control: "human" }));
  assert.equal(config.fighters[0].control, CONFIG.ARENA_CONTROL_HUMAN);
  assert.equal(config.fighters[1].control, CONFIG.ARENA_CONTROL_POLICY);
  assert.equal(CONFIG.encodeArenaConfig(config)[8 + 2], CONFIG.ARENA_CONTROL_HUMAN);
});

test("the_picker_and_the_config_agree_on_every_control_code", () => {
  // **Driven from the encoder's list and checked against the picker**, which is
  // the shape `the_picker_and_the_config_agree_on_every_policy_code` next door
  // uses and the reason it is worth copying: a test that iterated a list it
  // also defined would agree with itself over any two vocabularies.
  assert.deepEqual([...CONFIG.ARENA_CONTROL_NAMES], ["policy", "human"]);
  CONFIG.ARENA_CONTROL_NAMES.forEach((name, code) => {
    assert.equal(CONFIG.controlCodeOf(name), code, `${name} does not round-trip to ${code}`);
    assert.equal(picker.arenaConfigOf(matchup({ control: name })).fighters[0].control, code,
      `${name} did not reach the buffer as ${code}`);
    // And out the other end of the 120 bytes, per side, so a control written
    // into one fighter block cannot be read out of the other.
    const config = picker.arenaConfigOf(matchup({}, { control: name }));
    const decoded = CONFIG.decodeArenaConfig(CONFIG.encodeArenaConfig(config), config.seed);
    assert.equal(decoded.fighters[1].control, code);
    assert.equal(decoded.fighters[0].control, CONFIG.ARENA_CONTROL_POLICY);
  });
  // The two named constants are the array's own indices, so a reordering that
  // kept both sides agreeing is still caught.
  assert.equal(CONFIG.ARENA_CONTROL_POLICY, 0);
  assert.equal(CONFIG.ARENA_CONTROL_HUMAN, 1);
  assert.equal(CONFIG.controlCodeOf("keyboard"), null, "an unknown control answered a code");
  // The "driven by" select offers the five policies and exactly one entry that
  // is not one, which is what makes it one control rather than two.
  const harness = installDom();
  try {
    const container = harness.container();
    picker.populatePolicies(container, "tactical", "scripted");
    for (const id of ["#a-control", "#b-control"]) {
      const offered = container.querySelector(id).children.map((node) => node.value);
      assert.deepEqual(offered,
        [...picker.POLICIES.map((option) => option.code), picker.HUMAN_CONTROL],
        `${id} is not the policy list plus one entry`);
    }
    for (const id of ["#a-off-hand", "#b-off-hand"]) {
      assert.deepEqual(container.querySelector(id).children.map((node) => node.value),
        picker.POLICIES.map((option) => option.code),
        `${id} offers something that is not a policy`);
    }
  } finally {
    harness.restore();
  }
});

test("the_off_hand_policy_is_hidden_and_disabled_while_a_side_is_driven_by_a_policy", async () => {
  const harness = installDom();
  try {
    const { mount } = await import(compiled("client/src/arena/arena.js"));
    const container = harness.container();
    const handle = await mount(container, new URLSearchParams());
    const row = container.querySelector("#a-off-hand-row");
    const offHand = container.querySelector("#a-off-hand");
    assert.equal(row.hidden, true, "the off-hand row opened visible over a policy-driven side");
    assert.equal(offHand.disabled, true, "the off-hand select opened enabled");
    // **Disabled and not read**, which is the half that matters: a stale value
    // left in a hidden control must not reach the buffer. The side is
    // policy-driven, so `policy` is the driven-by select's own value.
    offHand.value = "neutral";
    assert.equal(picker.readMatchup(container).a.policy, "tactical");

    // Hand the side to a keyboard and the row is the one thing left to choose.
    container.querySelector("#a-control").value = picker.HUMAN_CONTROL;
    for (const entry of harness.listenersOn(container.querySelector("#a-control"), "change")) {
      entry.listener({ target: container.querySelector("#a-control") });
    }
    assert.equal(row.hidden, false, "the off-hand row stayed hidden over a human side");
    assert.equal(offHand.disabled, false, "the off-hand select stayed disabled over a human side");
    const chosen = picker.readMatchup(container).a;
    assert.deepEqual([chosen.control, chosen.policy], ["human", "neutral"],
      "a human side did not take its policy from the off-hand row");
    // Fighter B is untouched, so the two columns are independent.
    assert.equal(container.querySelector("#b-off-hand-row").hidden, true);
    assert.equal(picker.readMatchup(container).b.control, "policy");
    await handle.dispose();
    harness.dropSubtree(container);
  } finally {
    harness.restore();
  }
});

test("the_arena_opens_on_a_pairing_that_fights", async () => {
  // The half of the deleted preset test that was about something else: the
  // controls the page opens with. **`tactical` against `scripted`**, where it
  // was `attack-moves` on both sides and then `tactical` on both sides -- of the
  // five embodied entries `tactical` is the only one that aims, and a first look
  // at this page should not open on the entry least likely to land a blow, while
  // the side facing it is the control that entry was built to beat. A mirror
  // match is the one pairing that shows a reader nothing about the dropdown this
  // page is built around. The argument sits on `populatePolicies` in `arena.ts`;
  // this is what would notice it drifting.
  //
  // **The pair is asserted rather than the left-hand side**, and that is the
  // whole reason this line is here rather than being folded into the "opens with
  // something live" check below: every entry in the registry is live, so a
  // default that quietly went back to `tactical` on both sides would keep the
  // button enabled and keep the page fighting -- and would stop being a
  // comparison.
  const harness = installDom();
  try {
    const { mount } = await import(compiled("client/src/arena/arena.js"));
    const container = harness.container();
    const handle = await mount(container, new URLSearchParams());
    assert.deepEqual([container.querySelector("#a-control").value,
      container.querySelector("#b-control").value], ["tactical", "scripted"]);
    // Both sides open policy-driven, which is the only pairing this build can
    // install: a human side is refused by name until arena-05.
    assert.deepEqual([picker.readMatchup(container).a.control,
      picker.readMatchup(container).b.control], ["policy", "policy"]);
    assert.equal(container.querySelector("#arena-seed").value, "3");
    // Nothing disables the controls any more *except the two off-hand rows*,
    // and the exception is the point rather than a leftover: the only thing
    // that ever disabled a control here was the deleted preset, and a control
    // left disabled by a dropdown that no longer exists would be unreachable
    // rather than merely unused. An off-hand policy over a policy-driven side
    // is a different case -- the side's own policy byte is already answering
    // that question -- and
    // `the_off_hand_policy_is_hidden_and_disabled_while_a_side_is_driven_by_a_policy`
    // is what says it becomes reachable the moment the side is handed to a
    // keyboard. Named one by one so that a *third* disabled control is a
    // failure here rather than a widened filter.
    const offHand = ["a-off-hand", "b-off-hand"];
    for (const control of picker.pickerControls(container)) {
      assert.equal(control.disabled, offHand.includes(control.id),
        `${control.id} opened ${control.disabled ? "disabled" : "enabled"}`);
    }
    // And the `demo` dropdown is gone from the markup rather than left showing
    // one option.
    assert.equal(SHELL_HTML.includes("arena-preset"), false);
    assert.equal(SHELL_HTML.includes("Robust Strike"), false);
    // The opening matchup is one the picker accepts, which is what makes the
    // button live on the first paint.
    assert.equal(container.querySelector("#fight").disabled, false);
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

test("the_selection_screen_opens_with_no_wasm_present", async () => {
  const harness = installDom();
  try {
    const { mount } = await import(compiled("client/src/arena/arena.js"));
    const container = harness.container();
    const handle = await mount(container, new URLSearchParams());
    assert.equal(container.querySelector("#picker-sides").hidden, false);
    assert.equal(container.querySelector("#arena-3d").parentElement.id, "picker-sides");
    await assertStageIsAbsent(container, "selection without wasm");
    const urls = harness.fetches.map((request) => String(request.url));
    assert.equal(urls.some((url) => /(?:web\.wasm|fight(?:-[^/]*)?\.json|recording)/.test(url)), false,
      `opening the picker requested a wasm or recording URL: ${urls.join(", ")}`);
    assert.ok(urls.every((url) => /\/assets3d\/combatants\.(?:json|glb)$/.test(url)),
      `the picker may fetch only its intended combatant asset: ${urls.join(", ")}`);
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
    // **The loaded header still says `learned`, and that is not a leftover.**
    // `lab trace --policy learned` writes one, and `?trace=` is the only way a
    // page reaches such a fight now that no live policy code names a network --
    // so a recorded header naming a policy the picker cannot select is exactly
    // the case this test is for.
    const handle = await mount(container,
      new URLSearchParams([["trace", "/fight-learned.json"]]));
    harness.fetches[0].settle({
      ...syntheticTrace(), heroes: "learned", monsters: "scripted", checkpoint: "0123456789abcdef",
    });
    await settle();
    container.querySelector("#b-control").value = "neutral";
    for (const entry of harness.listenersOn(container.querySelector("#b-control"), "change")) {
      entry.listener({ target: container.querySelector("#b-control") });
    }
    const copy = container.querySelector("#picker-message").textContent;
    assert.match(copy, /Viewing recording: learned vs scripted, seed 3/);
    assert.match(copy, /Next fight: tactical vs neutral, seed 3/);
    // The recorded checkpoint note, which is the one arm of `checkpointCopy`
    // that still has a caller.
    assert.match(copy, /the digest identifies the weights used/);
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

test("the_span_slider_says_when_it_has_stopped_driving_the_stage_camera", () => {
  assert.equal(TEMPLATE_TAGS.get("arena-follow"), "select");
  assert.equal(TEMPLATE_TAGS.get("arena-view"), "select");
  assert.equal(TEMPLATE_TAGS.get("arena-refit"), "button");
  assert.equal(TEMPLATE_TAGS.get("arena-span-owner"), "span");
  assert.match(SHELL_HTML,
    /id="arena-span-owner">\(all five panels\)<\/span>/,
    "an unattended fight must open with the old all-panel ownership stated");

  const source = fs.readFileSync(path.join(ROOT, "client/src/arena/arena.ts"), "utf8");
  assert.match(source, /stage\?\.cameraMode\(\) === "fit"/);
  assert.match(source, /"\(plan \+ elevation; Refit restores 3\/4\)"/);
  assert.match(source, /stage\?\.orbit\(event\.buttons, event\.movementX, event\.movementY\)/);
  assert.match(source, /stage\.zoom\(event\.deltaY, \[/);
  assert.match(source, /refitButton\.addEventListener\("click"/);
});

test("the_camera_controls_pin_their_vocabulary_and_promoted_label_mode", () => {
  assert.deepEqual(TEMPLATE_VALUES.get("arena-follow"), { value: "both" });
  assert.deepEqual(TEMPLATE_VALUES.get("arena-view"), { value: "threeQuarter" });
  assert.match(SHELL_HTML, /class="stage"[^>]*data-main-view="threeQuarter"/);
  const source = fs.readFileSync(path.join(ROOT, "client/src/arena/arena.ts"), "utf8");
  assert.match(source, /stageHost\.dataset\.mainView = view/);
  assert.match(source, /followInput\.value = "both";[\s\S]*?stage\?\.refit\(\)/);
});

test("a_wheel_over_the_three_quarter_view_stays_consumed_at_both_zoom_clamps", () => {
  const source = fs.readFileSync(path.join(ROOT, "client/src/arena/arena.ts"), "utf8");
  const listener = /stageHost\.addEventListener\("wheel", \(event\) => \{([\s\S]*?)\n  \}, \{ passive: false \}\);/.exec(source);
  assert.ok(listener, "the arena has no non-passive stage wheel owner");
  assert.match(listener[1], /hitsThreeQuarter\(event\)/,
    "wheel must hit-test the live 3/4 viewport after promotion");
  assert.match(listener[1], /stage\.zoom\(event\.deltaY, \[[\s\S]*event\.preventDefault\(\);/,
    "a claimed wheel must stay consumed when zoom cannot move farther");
  assert.doesNotMatch(listener[1], /cameraChangeSerial/,
    "a zoom clamp must not transfer the gesture to page scrolling");
});

test("a_policy_mismatch_names_the_recording_that_is_still_on_screen", () => {
  const { frames: _frames, schema: _schema, ...header } = syntheticTrace();
  const picked = matchup({ policy: "tactical" }, { policy: "neutral" }, header.seed);
  const mismatch = picker.recordingMismatch(picked, header);
  assert.match(mismatch, /The recording still on screen is scripted vs scripted/);
  assert.match(mismatch, /controls describe tactical vs neutral/);
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

// ------------------------------------------------------------ the streamed fight
//
// The worker's half of `#/arena`, as three messages rather than one. What these
// tests are about is the *order* they arrive in: the old channel could only post
// a fight that had finished, so a page written against a fake that posts
// everything at once would assert nothing at all about the thing this session
// changed. Every fake below posts an opening, is checked, posts a chunk, is
// checked again, and only then finishes.

const ABI = await import(compiled("client/src/protocol/abi.generated.js"));
const PROTOCOL = await import(compiled("client/src/protocol/messages.js"));
const RECORDER = await import(compiled("client/src/runtime/arena-recorder.js"));

/** The opening message, with the synthetic trace's own bodies inside it. */
function syntheticOpening(requestId) {
  const trace = syntheticTrace();
  return {
    kind: "arenaOpened", version: PROTOCOL.WORKER_PROTOCOL_VERSION, requestId,
    spectator: true, one: ONE, scenario: "configured-duel-v1", mirrored: false,
    fingerprint: "0x00000000deadbeef", seed: 3, heroes: "scripted", monsters: "scripted",
    checkpoint: null, maxTicks: 3_600, arena: [48 * ONE, 32 * ONE],
    arenaStreamLayoutVersion: RECORDER.ARENA_STREAM_LAYOUT_VERSION,
    recordingIndexStride: RECORDER.RECORDING_INDEX_STRIDE,
    poseLayoutVersion: ABI.POSE_LAYOUT_VERSION, poseStride: ABI.POSE_STRIDE,
    regionLayoutVersion: ABI.REGION_LAYOUT_VERSION, regionStride: ABI.REGION_STRIDE,
    regionsPerBody: ABI.REGIONS_PER_BODY,
    articulatedProjectileLayoutVersion: ABI.ARTICULATED_PROJECTILE_LAYOUT_VERSION,
    articulatedProjectileStride: ABI.ARTICULATED_PROJECTILE_STRIDE,
    combatEventLayoutVersion: ABI.COMBAT_EVENT_LAYOUT_VERSION,
    combatEventStride: ABI.COMBAT_EVENT_STRIDE,
    embodiedStanceLayoutVersion: RECORDER.EMBODIED_STANCE_LAYOUT_VERSION,
    embodiedStanceStride: RECORDER.EMBODIED_STANCE_STRIDE,
    embodiedStanceCapacity: RECORDER.EMBODIED_STANCE_CAPACITY,
    acceptedCommandLayoutVersion: RECORDER.ACCEPTED_COMMAND_LAYOUT_VERSION,
    acceptedCommandStride: RECORDER.ACCEPTED_COMMAND_STRIDE,
    acceptedCommandCapacity: RECORDER.ACCEPTED_COMMAND_CAPACITY,
    acceptedCommandSchema: RECORDER.ACCEPTED_COMMAND_SCHEMA,
    replayBaseline: Uint8Array.of(0).buffer,
    controlledFaction: null,
    decisionPeriods: [12, 18],
    armMinReach: ONE / 4,
    impactThreshold: ONE / 4, contactEnergyFloor: 512,
    bodySlot: 255, noRegion: 4_294_967_295,
    regionNames: trace.regionNames, hintNames: trace.hintNames, contactKinds: trace.contactKinds,
    bodies: trace.bodies,
  };
}

/** One chunk of two-body frames, with chunk-relative index starts. */
function syntheticChunk(requestId, firstFrame, frameCount, humanYaw = 0, humanSevered = 0,
  acceptedPayload = null) {
  const bodies = 2;
  const poses = new Uint32Array(frameCount * bodies * ABI.POSE_STRIDE);
  const regions = new Uint32Array(frameCount * bodies * ABI.REGIONS_PER_BODY * ABI.REGION_STRIDE);
  const index = new Uint32Array(frameCount * RECORDER.RECORDING_INDEX_STRIDE);
  const health = new Int32Array(frameCount * 2);
  const stances = new Uint32Array(frameCount * bodies * RECORDER.EMBODIED_STANCE_STRIDE);
  for (let frame = 0; frame < frameCount; frame += 1) {
    const tick = firstFrame + frame;
    for (let body = 0; body < bodies; body += 1) {
      const at = (frame * bodies + body) * ABI.POSE_STRIDE;
      poses[at + ABI.POSE_ENTITY_INDEX] = body;
      poses[at + ABI.POSE_ENTITY_GENERATION] = 0;
      // Bodies eleven units apart and closing, so `adopt`'s default span and
      // azimuth have something real to read.
      poses[at + ABI.POSE_BODY_X] = body === 0 ? tick * 16 : 11 * ONE;
      poses[at + ABI.POSE_BODY_YAW_RAW] = body === 0 ? humanYaw : 0;
      poses[at + ABI.POSE_SEVERED_MASK] = body === 0 ? humanSevered : 0;
      const bodyX = poses[at + ABI.POSE_BODY_X];
      poses[at + ABI.POSE_LEFT_TARGET_X] = bodyX + ONE / 2;
      poses[at + ABI.POSE_LEFT_TARGET_Z] = ONE;
      poses[at + ABI.POSE_RIGHT_TARGET_X] = bodyX + ONE / 2;
      poses[at + ABI.POSE_RIGHT_TARGET_Z] = ONE;
      for (let region = 0; region < ABI.REGIONS_PER_BODY; region += 1) {
        const regionAt = ((frame * bodies + body) * ABI.REGIONS_PER_BODY + region) * ABI.REGION_STRIDE;
        regions[regionAt + ABI.REGION_LOWER_X] = bodyX;
        regions[regionAt + ABI.REGION_LOWER_Z] = region === 2 || region === 3 ? ONE * 3 / 2 : 0;
        regions[regionAt + ABI.REGION_PRESENT] = 1;
      }
      const stanceAt = (frame * bodies + body) * RECORDER.EMBODIED_STANCE_STRIDE;
      stances[stanceAt] = body;
      stances[stanceAt + 1] = 0;
    }
    const at = frame * RECORDER.RECORDING_INDEX_STRIDE;
    index[at + RECORDER.INDEX_TICK] = tick;
    index[at + RECORDER.INDEX_POSE_START] = frame * bodies;
    index[at + RECORDER.INDEX_POSE_COUNT] = bodies;
    index[at + RECORDER.INDEX_REGION_START] = frame * bodies * ABI.REGIONS_PER_BODY;
    index[at + RECORDER.INDEX_REGION_COUNT] = bodies * ABI.REGIONS_PER_BODY;
    index[at + RECORDER.INDEX_STANCE_START] = frame * bodies;
    index[at + RECORDER.INDEX_STANCE_COUNT] = bodies;
    index[at + RECORDER.INDEX_COMMAND_START] = acceptedPayload === null ? 0 : frame;
    index[at + RECORDER.INDEX_COMMAND_COUNT] = acceptedPayload === null ? 0 : 1;
    health[frame * 2] = ONE;
    health[frame * 2 + 1] = ONE;
  }
  const commands = acceptedPayload === null ? new Uint8Array() : new Uint8Array(frameCount * 70);
  if (acceptedPayload !== null) {
    for (let frame = 0; frame < frameCount; frame += 1) {
      const row = frame * 70;
      const view = new DataView(commands.buffer, row, 70);
      view.setUint32(0, firstFrame + frame - 1, true);
      view.setUint32(4, 0, true); view.setUint32(8, 0, true); view.setUint8(12, 2);
      commands.set(acceptedPayload, row + 13);
    }
  }
  return {
    kind: "arenaChunk", version: PROTOCOL.WORKER_PROTOCOL_VERSION, requestId,
    firstFrame, frameCount,
    poses: poses.buffer, regions: regions.buffer,
    projectiles: new ArrayBuffer(0), events: new ArrayBuffer(0), stances: stances.buffer,
    commands: commands.buffer,
    index: index.buffer, health: health.buffer,
  };
}

function syntheticFinish(requestId, frameCount) {
  return {
    kind: "arenaFinished", version: PROTOCOL.WORKER_PROTOCOL_VERSION, requestId,
    outcome: "Decision(Heroes)", timedOut: true, ticks: frameCount - 1, frameCount,
    recordingTruncated: false,
    posesDropped: 0, regionsDropped: 0, articulatedProjectilesDropped: 0,
    combatEventsDropped: 0, embodiedStancesDropped: 0, acceptedCommandsDropped: 0,
    stateDigestDomain: 2, stateDigestSchema: 1, stateDigestLo: 0, stateDigestHi: 0,
  };
}

/** Mount `#/arena`, press [Fight], and hand back the worker it built. */
async function pressFight(harness) {
  const { mount } = await import(compiled("client/src/arena/arena.js"));
  const container = harness.container();
  const handle = await mount(container, new URLSearchParams());
  assert.equal(harness.workers.length, 0,
    "the worker must not exist before Fight is pressed");
  container.querySelector("#fight").click();
  await settle();
  const worker = harness.workers.at(-1);
  assert.ok(worker !== undefined, "pressing Fight did not construct a worker");
  const start = worker.sent.at(-1).message;
  assert.equal(start.kind, "arenaStart");
  return { container, handle, worker, requestId: start.requestId };
}

const tickOf = (container) => {
  const shown = /tick (\d+)/.exec(container.querySelector("#tick").textContent);
  return shown === null ? null : Number(shown[1]);
};

async function controlledRoute(harness, captureKind = "mouse", firstChunk = true, inputLog,
  practice = false) {
  const { mount } = await import(compiled("client/src/arena/arena.js"));
  const container = harness.container();
  let stageHooks = null;
  const fakeStage = {
    pinchHits: 0,
    guideVisible: false, guideShows: 0, guideClears: 0, disposeCalls: 0,
    description: () => "test stage", show() {}, clear() {}, resize() {},
    setMode: async () => {}, mode: () => "geometry", cameraMode: () => "fit",
    cameraBasis: () => ({ right: [0, 1, 0], up: [0, 0, 1] }),
    projectHand: () => [0.5, 0.5], projectHandIndicator: () => ({ point: [0.5, 0.5], inFront: true }),
    activeViewport: () => ({ x: 0, y: 0, width: 1, height: 1 }),
    threeQuarterViewport: () => ({ x: 0, y: 0, width: 1, height: 1 }), cameraChangeSerial: () => 0,
    containsThreeQuarterPoint: () => true, follow() {}, orbit: () => false, pan: () => true,
    zoom() { this.pinchHits++; },
    promote() {}, refit() {}, setRelative: () => null, setEyes() {},
    showPreview() {}, setPhase() {}, drawPreview() {},
    showHandGuide() { this.guideVisible = true; this.guideShows++; },
    clearHandGuide() { this.guideVisible = false; this.guideClears++; },
    dispose() { this.disposeCalls++; },
    debug: { counts: () => ({}) },
  };
  const handle = await mount(container, new URLSearchParams(), async (hooks) => {
    stageHooks = hooks;
    return fakeStage;
  }, inputLog);
  await settle();
  if (practice) container.querySelector("#arena-practice-hand").click();
  else {
    const control = container.querySelector("#a-control");
    control.value = "human";
    for (const entry of harness.listenersOn(control, "change")) entry.listener({ target: control });
  }
  container.querySelector("#fight").click();
  await settle();
  await settle();
  const worker = harness.workers.at(-1);
  const start = worker.sent.find((entry) => entry.message.kind === "arenaStart").message;
  worker.emit({ ...syntheticOpening(start.requestId), heroes: "you + tactical off hand",
    controlledFaction: 0 });
  if (firstChunk) worker.emit(syntheticChunk(start.requestId, 0, 1));
  await settle();
  if (practice) assert.equal(container.querySelector("#arena-reset-drill").hidden, false,
    "Practice hand did not survive into the fight phase");
  if (captureKind === "touch" && firstChunk) {
    const host = container.querySelector("#arena-stage");
    const canvas = container.querySelector("#arena-3d");
    for (const entry of harness.listenersOn(host, "pointerdown")) entry.listener({
      target: canvas, pointerType: "touch", pointerId: 40, button: 0,
      clientX: 200, clientY: 180, timeStamp: 0, preventDefault() {},
    });
  }
  let frame = 0;
  let now = performance.now();
  const key = (code, key = code) => {
    const event = { target: globalThis.window, key, code, preventDefault() {} };
    for (const entry of harness.listenersOn(globalThis.window, "keydown")) entry.listener(event);
  };
  const release = (code, key = code) => {
    const event = { target: globalThis.window, key, code, preventDefault() {} };
    for (const entry of harness.listenersOn(globalThis.window, "keyup")) entry.listener(event);
  };
  const nextInput = async () => {
    const before = worker.sent.filter((entry) => entry.message.kind === "arenaInput").length;
    now += 20;
    harness.runFrame(now);
    await settle();
    const inputs = worker.sent.filter((entry) => entry.message.kind === "arenaInput");
    assert.ok(inputs.length > before, "the route did not stage input on the next control tick");
    return inputs.at(-1).message;
  };
  const runFrame = async (elapsedMs) => {
    now += elapsedMs;
    harness.runFrame(now);
    await settle();
  };
  const acknowledge = async (input, publishedYaw = new DataView(input.bytes).getUint16(12, true),
    severed = 0, publishReceipt = false) => {
    frame += 1;
    const payload = publishReceipt ? new Uint8Array(input.bytes).slice(4) : null;
    worker.emit(syntheticChunk(start.requestId, frame, 1, publishedYaw, severed, payload));
    worker.emit({ kind: "arenaInputAck", version: 2, requestId: input.requestId,
      arenaRequestId: start.requestId, steppedTicks: 1 });
    await settle();
  };
  return { container, handle, worker, start, key, release, nextInput, acknowledge, runFrame,
    fakeStage, terminal: (message = "lost") => stageHooks.onTerminal(message) };
}

function directHandFixture() {
  const bodyZ = 10 * ONE;
  const shoulderZ = bodyZ + Math.round(1.2 * ONE); // 0.2 below the static shoulder.
  const region = (lower = [0, 0, bodyZ]) => ({ lower, upper: lower, radius: ONE / 8, present: true });
  const target = [ONE / 2, 0, bodyZ + Math.round(0.8 * ONE)]; // half of posed 1.6 height.
  const arm = { hand: target, vel: [0, 0, 0], target, fatigue: 0 };
  const pose = {
    id: [0, 1], body: [0, 0, bodyZ], yaw: 0, vel: [0, 0, 0], arms: [arm, arm],
    weapons: [null, null], shield: null,
    regions: [region(), region(), region([-ONE / 4, 0, shoulderZ]), region([0, 0, shoulderZ])],
    integrity: [], wound: [], blood: ONE, shock: 0, severed: 0, equipmentMask: 0,
    intent: "hold", target: null, hints: [0, 0],
  };
  const input = new INPUT.ArenaInput();
  input.configureArm(1, {
    standingHeight: Math.round(1.8 * ONE), shoulderHeight: Math.round(1.4 * ONE),
    armLength: Math.round(0.75 * ONE),
  }, 12_345);
  assert.equal(input.synchronize(pose), true);
  return { input, pose };
}

const commandArm = (bytes, limb = 1) => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const at = limb === 0 ? 23 : 37;
  return {
    bearing: view.getUint16(at, true), height: view.getInt32(at + 2, true),
    reach: view.getInt32(at + 6, true), effort: view.getInt32(at + 10, true),
    plane: view.getUint16(limb === 0 ? 57 : 59, true),
  };
};

test("all_seven_virtual_hand_constants_are_exact_and_explicitly_uncalibrated", () => {
  assert.deepEqual([
    INPUT.BODY_TURN_INPUT_LEAD_RAW, INPUT.VIRTUAL_HAND_SENSITIVITY,
    CURSOR.CURSOR_HAND_SPAN_ARM_LENGTHS, INPUT.EXTEND_DRAG_SENSITIVITY,
    INPUT.TOUCH_PINCH_SPREAD_RATIO, INPUT.SWING_DRAG_DEAD_ZONE_PX,
    INPUT.SWING_DRAG_FULL_EFFORT_PX_S,
  ], [8_192, 0.006, 1, 0.004, 0.75, 6, 900]);
  assert.deepEqual(CONTROL.CONTROL_FEEL_CONSTANTS, {
    bodyTurnInputLeadRaw: 8_192, virtualHandSensitivity: 0.006,
    cursorHandSpanArmLengths: 1, extendDragSensitivity: 0.004,
    touchPinchSpreadRatio: 0.75, swingDragDeadZonePx: 6,
    swingDragFullEffortPxS: 900,
  });
});

test("the_input_sidecar_cap_is_exact_and_a_dropped_row_makes_a_report_ineligible", () => {
  const log = new CONTROL.ControlInputLog();
  const row = { sampleMs: 0, tickSeen: 0, view: "threeQuarter", channel: "keyboard",
    inputDevice: null, captureActive: false,
    action: "KeyW:down", saturated: false, powered: false, travelCss: 0,
    desired: null, shoulder: null, armLength: null, target: null, bodyYaw: null,
    basis: { right: [1, 0, 0], up: [0, 0, 1] } };
  for (let index = 0; index < CONTROL.CONTROL_INPUT_ROW_CAP; index += 1) log.append(row);
  assert.deepEqual([log.rows().length, log.dropped, log.reportEligible],
    [CONTROL.CONTROL_INPUT_ROW_CAP, 0, true]);
  log.append(row);
  assert.deepEqual([log.rows().length, log.dropped, log.reportEligible],
    [CONTROL.CONTROL_INPUT_ROW_CAP, 1, false]);
  const manifests = log.manifests().size;
  assert.equal(log.beginAttempt(), 0);
  assert.equal(log.manifests().size, manifests, "an ineligible attempt grew the manifest map");
});

test("a_final_endpoint_breaks_the_pointer_coalescing_anchor_and_preserves_owner_order", () => {
  const log = new CONTROL.ControlInputLog();
  const row = { tickSeen: 0, view: "threeQuarter", channel: "cut", inputDevice: "mouse",
    captureActive: true, saturated: false, travelCss: 1, shoulder: [0, 0, 0], armLength: 1,
    target: null, bodyYaw: 0, basis: { right: [1, 0, 0], up: [0, 0, 1] } };
  log.append({ ...row, sampleMs: 5, powered: true, desired: [0, 0, 0] }, 1, true);
  log.append({ ...row, sampleMs: 6, powered: true, desired: [0.4, 0, 0],
    action: "pointerup-final" }, 1, false);
  log.append({ ...row, sampleMs: 7, powered: false, desired: [0.8, 0, 0] }, 1, true);
  assert.deepEqual(log.rows().map((sample) => [sample.sampleMs, sample.action ?? null,
    sample.powered]), [[5, null, true], [6, "pointerup-final", true], [7, null, false]]);
  const powered = log.rows().filter((sample) => sample.powered)
    .map((sample) => ({ right: sample.desired[0], up: sample.desired[1] }));
  assert.equal(CONTROL.classifyCut(powered).family, "left-to-right",
    "coalescing changed which owned endpoint the classifier consumed");
});

test("a_ten_minute_one_kilohertz_pointer_stream_is_coalesced_below_the_120_hz_cap", () => {
  const log = new CONTROL.ControlInputLog();
  const row = { tickSeen: 0, view: "threeQuarter", channel: "cut",
    inputDevice: "mouse", captureActive: true, saturated: false, powered: true, travelCss: 1,
    desired: null, shoulder: null, armLength: null, target: null, bodyYaw: null,
    basis: { right: [1, 0, 0], up: [0, 0, 1] } };
  for (let sampleMs = 0; sampleMs < 600_000; sampleMs += 1) {
    log.append({ ...row, sampleMs }, 1, true);
  }
  log.append({ ...row, sampleMs: 600_000, action: "pointerup-final" }, 1, false);
  assert.ok(log.rows().length <= CONTROL.CONTROL_INPUT_ROW_CAP);
  assert.deepEqual([log.dropped, log.reportEligible, log.rows().at(-1).action],
    [0, true, "pointerup-final"]);
});

test("a_post_cap_primary_down_is_refused_without_throwing_or_growing_manifests", async () => {
  const harness = installDom();
  try {
    const log = new CONTROL.ControlInputLog();
    const route = await controlledRoute(harness, "mouse", true, log, true);
    const row = { sampleMs: 0, tickSeen: 0, view: "threeQuarter", channel: "keyboard",
      inputDevice: null, captureActive: false, action: "cap", saturated: false, powered: false,
      travelCss: 0, desired: null, shoulder: null, armLength: null, target: null, bodyYaw: null,
      basis: { right: [1, 0, 0], up: [0, 0, 1] } };
    const already = log.rows().length;
    for (let index = already; index < CONTROL.CONTROL_INPUT_ROW_CAP; index += 1) log.append(row);
    log.append(row);
    const manifests = log.manifests().size;
    const host = route.container.querySelector("#arena-stage");
    const canvas = route.container.querySelector("#arena-3d");
    assert.doesNotThrow(() => {
      for (const entry of harness.listenersOn(host, "pointerdown")) entry.listener({
        target: canvas, pointerType: "mouse", pointerId: 93, button: 0, buttons: 1,
        clientX: 200, clientY: 180, timeStamp: 10, preventDefault() {},
      });
    });
    assert.equal(log.manifests().size, manifests);
    assert.match(route.container.querySelector("#control-status").textContent,
      /CONTROL_INPUT_EVIDENCE_INELIGIBLE/);
    await route.handle.dispose(); harness.dropSubtree(route.container);
  } finally { harness.restore(); }
});

test("five_named_cut_fixtures_use_the_frozen_camera_basis", () => {
  const named = [
    ["left-to-right", [[0, 0], [0.4, 0.02]]],
    ["right-to-left", [[0.4, 0], [0, -0.02]]],
    ["overhead", [[0, 0.4], [0.02, 0]]],
    ["rising-diagonal", [[0, 0], [0.3, 0.3]]],
    ["falling-diagonal", [[0, 0.3], [0.3, 0]]],
  ];
  for (const [family, points] of named) {
    assert.equal(CONTROL.classifyCut(points.map(([right, up]) => ({ right, up }))).family, family);
  }
  const basis = { right: [0, 1, 0], up: [0, 0, 1] };
  const before = CONTROL.cutPoint([10, 2, 3], [10, 1, 2], 2, basis);
  const afterBodyTranslation = CONTROL.cutPoint([110, -48, 3], [110, -49, 2], 2, basis);
  assert.deepEqual(afterBodyTranslation, before,
    "body translation leaked into a shoulder-relative cut");
});

test("ambiguous_short_and_returning_paths_are_unclassified", () => {
  assert.equal(CONTROL.classifyCut([{ right: 0, up: 0 }, { right: 0.29, up: 0 }]).family,
    "unclassified");
  assert.equal(CONTROL.classifyCut([
    { right: 0, up: 0 }, { right: 0.5, up: 0 }, { right: 0.02, up: 0 },
  ]).family, "unclassified");
  assert.deepEqual([
    CONTROL.CUT_MIN_NET_TRAVEL, CONTROL.CUT_MIN_AXIS_TRAVEL,
    CONTROL.CUT_MIN_PATH_EFFICIENCY, CONTROL.CUT_AXIS_DOMINANCE,
    CONTROL.CUT_ENDPOINT_TOLERANCE,
  ], [0.30, 0.20, 0.65, 1.75, 0.10]);
});

test("control_receipt_tick_t_joins_publication_t_plus_one", () => {
  const trace = syntheticTrace();
  const frames = trace.frames.map((frame) => ({ ...frame,
    poses: frame.poses.map((pose) => ({ ...pose, id: [pose.id[0], 0] })) }));
  const { frames: _frames, schema: _schema, ...header } = trace;
  const source = { header, decisionPeriods: [12, 18],
    frameCount: () => frames.length, frameAt: (index) => frames[index] };
  const baseline = Uint8Array.of(9);
  const evidence = new Uint8Array(48 + baseline.length + CONTROL.CONTROL_RECEIPT_BYTES);
  evidence.set(new TextEncoder().encode("ARPGCTL1"));
  const view = new DataView(evidence.buffer);
  view.setUint16(8, 3, true); view.setUint8(10, 2);
  view.setUint16(12, 70, true); view.setUint16(14, 57, true); view.setUint16(16, 2, true);
  view.setUint32(20, baseline.length, true); view.setUint32(24, 1, true);
  view.setUint32(28, 1, true); view.setUint8(32, 0); view.setUint8(34, 2);
  view.setUint16(36, 1, true);
  evidence.set(baseline, 48);
  const at = 49;
  view.setUint32(at, 0, true); view.setUint32(at + 4, 0, true); view.setUint32(at + 8, 0, true);
  view.setUint8(at + 12, 2);
  const right = at + 13 + 33;
  view.setUint16(right, 123, true); view.setInt32(right + 2, ONE / 2, true);
  view.setInt32(right + 6, ONE / 2, true); view.setInt32(right + 10, ONE / 2, true);
  const parsed = CONTROL.parseControlEvidence(evidence, 1);
  const joined = CONTROL.joinControlReceipt(parsed, source, 1);
  assert.deepEqual([joined[0].receiptTick, joined[0].publishedTick], [0, 1]);
  assert.deepEqual(joined[0].desired, frames[1].poses[0].arms[1].target);
  assert.deepEqual(joined[0].achieved, frames[1].poses[0].arms[1].hand);
  const metadata = { sourceIdentity: null, createdAt: "2026-08-20T00:00:00.000Z", operator: null,
    environment: { userAgent: null, platform: null, viewportCss: null, devicePixelRatio: null,
      hardwareConcurrency: null, timeZone: null, screenPixels: null, refreshHz: null,
      pageZoom: null, graphicsBackend: null, inputDevice: null, inputDevices: [],
      pointerCaptureActive: false, pointerCaptureEver: false,
      arenaView: "threeQuarter" } };
  const report = CONTROL.controlLabReport(source, evidence, 1, [], metadata);
  assert.deepEqual(Object.keys(report).sort(), ["attempts", "classifier", "config", "constants",
    "controlledFaction", "finalTick", "fingerprint", "inputRows", "metadata", "outcome",
    "schema", "seed", "stateDigest", "status", "summary", "tickRows"].sort());
  assert.deepEqual([report.schema, report.status, report.finalTick, report.outcome],
    ["arpg-arena-control-report-1", "foreground-calibration-owed", 1, source.header.outcome]);
  assert.deepEqual([report.config.scenario, report.config.seed, report.config.primaryArm,
    report.config.decisionPeriodTicks], [source.header.scenario, 3, 1, 12]);
  assert.deepEqual(report.constants, CONTROL.CONTROL_FEEL_CONSTANTS);
  assert.equal(report.tickRows.length, 1);
  assert.equal(report.summary.effortRaw.count, 1);
  assert.equal(report.summary.errorArmLengths.count, 1);
  assert.equal(report.metadata.sourceIdentity, null, "missing provenance was invented");

  const deadFrames = [frames[0], { ...frames[1], poses: [] }];
  const deadSource = { header, decisionPeriods: [12, 18], frameCount: () => deadFrames.length,
    frameAt: (index) => deadFrames[index] };
  const death = CONTROL.joinControlReceipt(parsed, deadSource, 1);
  assert.deepEqual([death.length, death[0].publishedTick, death[0].desired, death[0].missing],
    [1, 1, null, "controlled-body-absent"]);
  const deathReport = CONTROL.controlLabReport(deadSource, evidence, 1, [], metadata);
  assert.deepEqual([deathReport.summary.summaryComplete, deathReport.summary.severances],
    [false, null], "terminal pose loss was reported as a complete zero-severance summary");
  const missingSource = { header, frameCount: () => 1, frameAt: () => frames[0] };
  assert.throws(() => CONTROL.joinControlReceipt(parsed, missingSource, 1), /no publication 1/);
  const invalidAnatomy = { header: { ...header, bodies: [{ ...header.bodies[0], anatomy: null },
    header.bodies[1]] }, decisionPeriods: [12, 18],
    frameCount: source.frameCount, frameAt: source.frameAt };
  assert.throws(() => CONTROL.controlLabReport(invalidAnatomy, evidence, 1, [], metadata),
    /CONTROL_REPORT_REFUSED: controlled fighter anatomy/);
  assert.throws(() => CONTROL.controlLabReport({ ...source, decisionPeriods: undefined },
    evidence, 1, [], metadata), /CONTROL_REPORT_REFUSED: authoritative decision period/);
});

test("hidden_time_is_discarded_instead_of_becoming_tick_debt", () => {
  const clock = new CLOCK.ControlledClock(0);
  assert.equal(clock.advance(250), 15);
  for (let tick = 0; tick < 15; tick += 1) { assert.equal(clock.beginTick(), true); clock.settleTick(); }
  assert.equal(clock.advance(500), 15);
  for (let tick = 0; tick < 15; tick += 1) { assert.equal(clock.beginTick(), true); clock.settleTick(); }
  clock.stop(500); assert.equal(clock.advance(1_500), 0); clock.resume(1_500);
  assert.equal(clock.advance(1_750), 15);
  for (let tick = 0; tick < 15; tick += 1) { assert.equal(clock.beginTick(), true); clock.settleTick(); }
  assert.equal(clock.advance(2_000), 15);
  assert.equal(clock.dueTicks, 15);
});

test("practice_hand_is_an_ordinary_human_versus_neutral_configuration", async () => {
  const harness = installDom();
  try {
    const { mount } = await import(compiled("client/src/arena/arena.js"));
    const container = harness.container();
    const handle = await mount(container, new URLSearchParams());
    container.querySelector("#arena-practice-hand").click();
    const chosen = picker.readMatchup(container);
    assert.deepEqual(chosen, matchup({ policy: "tactical", control: "human" }, {
      anatomy: "brute", left: "empty", right: "club", policy: "neutral", control: "policy",
    }));
    assert.deepEqual(picker.arenaConfigOf(chosen), picker.arenaConfigOf({ ...chosen }),
      "Practice hand added state outside the ordinary picker configuration");
    await handle.dispose(); harness.dropSubtree(container);
  } finally { harness.restore(); }
});

test("mouse_motion_changes_the_arm_and_not_the_body", () => {
  const { input } = directHandFixture();
  const before = input.encode([9, 2], 7_777);
  input.moveWeapon(20, -10, 20, 1_000, { right: [0, 1, 0], up: [0, 0, 1] });
  const after = input.encode([9, 2], 7_777);
  assert.deepEqual([...after.slice(4, 23)], [...before.slice(4, 23)]);
  assert.notDeepEqual(commandArm(after), commandArm(before));
});

test("the_first_sample_near_each_edge_requests_the_corresponding_envelope_side", () => {
  const cursor = new CURSOR.ArenaHandCursor();
  const canvas = { left: 100, top: 50, width: 400, height: 200 };
  const viewport = { x: 0.25, y: 0, width: 0.75, height: 1 };
  assert.deepEqual([cursor.sample(200, 150, canvas, viewport).qx,
    cursor.sample(500, 150, canvas, viewport).qx], [-1, 1]);
  assert.deepEqual([cursor.sample(350, 50, canvas, viewport).qy,
    cursor.sample(350, 250, canvas, viewport).qy], [1, -1]);
});

test("cursor_a_to_b_to_a_is_exact_and_repeated_samples_past_each_edge_are_equal", () => {
  const cursor = new CURSOR.ArenaHandCursor();
  const canvas = { left: 0, top: 0, width: 300, height: 200 };
  const viewport = { x: 0, y: 0, width: 1, height: 1 };
  const a = cursor.sample(30, 100, canvas, viewport);
  cursor.sample(270, 30, canvas, viewport);
  assert.deepEqual(cursor.sample(30, 100, canvas, viewport), a);
  assert.deepEqual(cursor.sample(-10_000, 100, canvas, viewport),
    cursor.sample(-20_000, 100, canvas, viewport));
  const corner = cursor.sample(300, 0, canvas, viewport);
  assert.ok(Math.abs(Math.hypot(corner.qx, corner.qy) - 1) < 1e-12,
    "the corner was clamped independently instead of radially");
});

test("route_saturation_survives_raf_and_farther_edge_samples_do_not_raise_effort", async () => {
  const harness = installDom();
  try {
    const route = await controlledRoute(harness);
    const host = route.container.querySelector("#arena-stage");
    const canvas = route.container.querySelector("#arena-3d");
    const fire = (kind, clientX) => {
      for (const entry of harness.listenersOn(host, kind)) entry.listener({
        target: canvas, pointerType: "mouse", pointerId: 51, button: 0, buttons: 1,
        clientX, clientY: 180, timeStamp: clientX / 10, preventDefault() {},
      });
    };
    fire("pointerdown", 10_000);
    fire("pointermove", 20_000);
    const first = await route.nextInput();
    const firstBytes = [...new Uint8Array(first.bytes)];
    await route.acknowledge(first);
    await route.runFrame(1);
    const reticle = host.children.find((child) => child.className === "arena-hand-reticle");
    assert.equal(reticle?.classList.contains("saturated"), true,
      "rAF erased saturation without a new cursor sample");
    fire("pointermove", 30_000);
    const second = await route.nextInput();
    assert.deepEqual([...new Uint8Array(second.bytes)], firstBytes,
      "raw beyond-edge travel changed the clamped command or effort");
    await route.handle.dispose(); harness.dropSubtree(route.container);
  } finally { harness.restore(); }
});

test("mouse_capture_survives_either_button_release_until_both_are_up", async () => {
  const harness = installDom();
  try {
    for (const first of [0, 2]) {
      const route = await controlledRoute(harness);
      const host = route.container.querySelector("#arena-stage");
      const canvas = route.container.querySelector("#arena-3d");
      const second = first === 0 ? 2 : 0;
      const down = (button, buttons) => {
        for (const entry of harness.listenersOn(host, "pointerdown")) entry.listener({
          target: canvas, pointerType: "mouse", pointerId: 52, button, buttons,
          clientX: 200, clientY: 180, timeStamp: 10 + buttons, preventDefault() {},
        });
      };
      const up = (button, buttons) => {
        for (const entry of harness.listenersOn(host, "pointerup")) entry.listener({
          target: canvas, pointerType: "mouse", pointerId: 52, button, buttons,
          clientX: 200, clientY: 180, timeStamp: 20 + buttons, preventDefault() {},
        });
      };
      down(first, first === 0 ? 1 : 2); down(second, 3);
      assert.equal(canvas.hasPointerCapture(52), true);
      up(first, second === 0 ? 1 : 2);
      assert.equal(canvas.hasPointerCapture(52), true, `button ${first} released both-button capture`);
      up(second, 0);
      assert.equal(canvas.hasPointerCapture(52), false);
      await route.handle.dispose(); harness.dropSubtree(route.container);
    }
  } finally { harness.restore(); }
});

test("touch_up_reduces_its_final_position_while_cancel_does_not", async () => {
  const results = [];
  const finalRows = [];
  for (const ending of ["pointerup", "pointercancel"]) {
    const harness = installDom();
    try {
      const inputLog = new CONTROL.ControlInputLog();
      const route = await controlledRoute(harness, "touch", true, inputLog, true);
      const host = route.container.querySelector("#arena-stage");
      const canvas = route.container.querySelector("#arena-3d");
      for (const entry of harness.listenersOn(host, "pointermove")) entry.listener({
        target: canvas, pointerType: "touch", pointerId: 40, clientX: 210, clientY: 180,
        timeStamp: 20, movementX: 10, movementY: 0, buttons: 1, preventDefault() {},
      });
      const before = await route.nextInput();
      await route.acknowledge(before);
      for (const entry of harness.listenersOn(host, ending)) entry.listener({
        target: canvas, pointerType: "touch", pointerId: 40, clientX: 240, clientY: 180,
        timeStamp: 30, button: 0, buttons: 0, preventDefault() {},
      });
      results.push(commandArm(new Uint8Array((await route.nextInput()).bytes)));
      finalRows.push(inputLog.rows().filter((row) => row.action === "pointerup-final"));
      await route.handle.dispose(); harness.dropSubtree(route.container);
    } finally { harness.restore(); }
  }
  assert.notDeepEqual(results[0], results[1],
    "pointerup discarded its owned final position or cancel consumed one it did not own");
  assert.equal(finalRows[0].length, 1);
  assert.equal(finalRows[0][0].powered, true);
  assert.equal(finalRows[1].length, 0, "pointercancel fabricated a final sidecar sample");
});

test("mouse_up_records_its_material_endpoint_with_the_pre_release_owner", async () => {
  const harness = installDom();
  try {
    const inputLog = new CONTROL.ControlInputLog();
    const route = await controlledRoute(harness, "mouse", true, inputLog, true);
    const host = route.container.querySelector("#arena-stage");
    const canvas = route.container.querySelector("#arena-3d");
    for (const entry of harness.listenersOn(host, "pointerdown")) entry.listener({
      target: canvas, pointerType: "mouse", pointerId: 88, button: 0, buttons: 1,
      clientX: 200, clientY: 180, timeStamp: 10, preventDefault() {},
    });
    for (const entry of harness.listenersOn(host, "pointerup")) entry.listener({
      target: canvas, pointerType: "mouse", pointerId: 88, button: 0, buttons: 0,
      clientX: 260, clientY: 180, timeStamp: 20, preventDefault() {},
    });
    const final = inputLog.rows().filter((row) => row.action === "pointerup-final");
    assert.equal(final.length, 1);
    assert.deepEqual([final[0].channel, final[0].powered, final[0].clientXCss], ["cut", true, 260]);
    await route.handle.dispose(); harness.dropSubtree(route.container);
  } finally { harness.restore(); }
});

test("capture_acquire_loss_and_reacquire_are_logged_before_ownership_is_cleared", async () => {
  const harness = installDom();
  try {
    const inputLog = new CONTROL.ControlInputLog();
    const route = await controlledRoute(harness, "mouse", true, inputLog, true);
    const host = route.container.querySelector("#arena-stage");
    const canvas = route.container.querySelector("#arena-3d");
    for (const entry of harness.listenersOn(host, "pointerdown")) entry.listener({
      target: canvas, pointerType: "mouse", pointerId: 89, button: 0, buttons: 1,
      clientX: 200, clientY: 180, timeStamp: 10, preventDefault() {},
    });
    for (const entry of harness.listenersOn(host, "lostpointercapture")) entry.listener({
      target: canvas, pointerType: "mouse", pointerId: 89, buttons: 0,
    });
    const lifecycle = inputLog.rows().filter((row) => row.channel === "lifecycle");
    assert.ok(lifecycle.some((row) => row.action === "reacquire:mouse"));
    const acquired = lifecycle.findIndex((row) => row.action === "capture-acquired:mouse");
    const lost = lifecycle.findIndex((row) => row.action === "lost-capture:mouse");
    assert.ok(acquired >= 0 && lost > acquired && lifecycle[lost].captureActive,
      "lost capture was logged after its owner had already been cleared");
    await route.handle.dispose(); harness.dropSubtree(route.container);
  } finally { harness.restore(); }
});

test("the_sidecar_names_body_camera_view_and_drawer_transitions_without_rewriting_the_target", async () => {
  const harness = installDom();
  try {
    const inputLog = new CONTROL.ControlInputLog();
    const route = await controlledRoute(harness, "mouse", true, inputLog, true);
    const initial = await route.nextInput();
    await route.acknowledge(initial);
    route.key("KeyW", "w"); route.release("KeyW", "w");
    const change = (id, value) => {
      const control = route.container.querySelector(`#${id}`); control.value = value;
      for (const entry of harness.listenersOn(control, "change")) entry.listener({ target: control });
    };
    change("arena-follow", "b"); change("arena-camera-mode", "relative");
    change("arena-view", "firstPersonA");
    route.container.querySelector("#arena-refit").click();
    route.container.querySelector("#arena-eyes").click();
    const host = route.container.querySelector("#arena-stage");
    const canvas = route.container.querySelector("#arena-3d");
    for (const entry of harness.listenersOn(host, "wheel")) entry.listener({
      target: canvas, deltaY: 10, clientX: 200, clientY: 180, timeStamp: 50,
      preventDefault() {},
    });
    const rows = inputLog.rows();
    assert.deepEqual(new Set(rows.map((row) => row.channel)),
      new Set(["lifecycle", "keyboard", "follow", "camera-mode", "promotion", "refit",
        "drawer", "wheel"]));
    assert.ok(rows.filter((row) => row.channel !== "lifecycle")
      .every((row) => Number.isInteger(row.tickSeen) && row.target !== null),
      "an independence transition omitted its tick or staged-target witness");
    assert.ok(rows.filter((row) => row.channel === "lifecycle")
      .every((row) => Number.isInteger(row.tickSeen)),
    "a lifecycle transition omitted its latest published tick");
    assert.deepEqual(rows.filter((row) => row.channel === "keyboard").map((row) => row.action),
      ["KeyW:down", "KeyW:up"]);
    await route.handle.dispose(); harness.dropSubtree(route.container);
  } finally { harness.restore(); }
});

test("change_closes_every_fight_drawer_and_resets_its_aria_before_selection", async () => {
  for (const opened of ["eyes", "plans", "replay", "details"]) {
    const harness = installDom();
    try {
      const route = await controlledRoute(harness);
      const button = route.container.querySelector(`#arena-${opened}`);
      button.click();
      assert.equal(button.getAttribute("aria-expanded"), "true", `${opened} did not open`);
      route.container.querySelector("#change-matchup").click();
      assert.equal(route.container.getAttribute("data-phase"), "select");
      assert.equal(route.container.querySelector("#arena-stage").getAttribute("data-eyes-open"),
        "false");
      for (const drawer of ["eyes", "plans", "replay", "details"]) {
        assert.equal(route.container.querySelector(`#arena-${drawer}`).getAttribute("aria-expanded"),
          "false", `${opened} -> Change left ${drawer} aria open`);
      }
      for (const panel of ["arena-plans-panel", "arena-replay-panel", "arena-details-panel"]) {
        assert.equal(route.container.querySelector(`#${panel}`).hidden, true,
          `${opened} -> Change left ${panel} visible`);
      }
      await route.handle.dispose(); harness.dropSubtree(route.container);
    } finally { harness.restore(); }
  }
});

test("a_finished_practice_run_downloads_raw_receipts_and_the_exact_self_describing_report", async () => {
  const harness = installDom();
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  const blobs = [];
  URL.createObjectURL = (blob) => { blobs.push(blob); return `blob:test-${blobs.length}`; };
  URL.revokeObjectURL = () => {};
  try {
    const inputLog = new CONTROL.ControlInputLog();
    const route = await controlledRoute(harness, "mouse", true, inputLog, true);
    route.container.querySelector("#arena-drill-label").value = "named-cut";
    route.container.querySelector("#arena-cut-family").value = "left-to-right";
    route.container.querySelector("#arena-pair-id").value = "pair-a";
    const stageHost = route.container.querySelector("#arena-stage");
    const stageCanvas = route.container.querySelector("#arena-3d");
    for (const entry of harness.listenersOn(stageHost, "pointerdown")) entry.listener({
      target: stageCanvas, pointerType: "mouse", pointerId: 90, button: 0, buttons: 1,
      clientX: 200, clientY: 180, timeStamp: 10, preventDefault() {},
    });
    for (const entry of harness.listenersOn(stageHost, "pointermove")) entry.listener({
      target: stageCanvas, pointerType: "mouse", pointerId: 90, button: 0, buttons: 1,
      clientX: 280, clientY: 180, timeStamp: 20, movementX: 80, movementY: 0,
      preventDefault() {},
    });
    const input = await route.nextInput();
    await route.acknowledge(input, undefined, 1, true);
    route.worker.emit(syntheticFinish(route.start.requestId, 2));
    await settle(); await settle();
    const hudToggle = route.container.querySelector("#arena-control-hud-toggle");
    hudToggle.click();
    assert.match(route.container.querySelector("#arena-control-hud").textContent,
      /candidate input: bearing.*accepted command: bearing.*published target:/s);
    const raw = route.container.querySelector("#arena-save-evidence");
    const report = route.container.querySelector("#arena-save-control-report");
    assert.deepEqual([raw.disabled, report.disabled], [false, false]);
    raw.click(); report.click();
    assert.equal(blobs.length, 2);
    const decoded = JSON.parse(await blobs[1].text());
    assert.deepEqual([decoded.schema, decoded.status, decoded.outcome, decoded.finalTick],
      ["arpg-arena-control-report-1", "foreground-calibration-owed", "Decision(Heroes)", 1]);
    assert.equal(Object.keys(decoded.constants).length, 7);
    assert.deepEqual([decoded.config.scenario, decoded.config.controlledFaction,
      decoded.config.decisionPeriodTicks,
      decoded.metadata.sourceIdentity, decoded.metadata.environment.refreshHz],
    ["configured-duel-v1", 0, 12, null, null]);
    assert.deepEqual([decoded.metadata.environment.inputDevice,
      decoded.metadata.environment.inputDevices,
      decoded.metadata.environment.pointerCaptureEver], ["mouse", ["mouse"], true]);
    assert.deepEqual([decoded.tickRows.length, decoded.summary.effortRaw.count], [1, 1]);
    assert.ok(Array.isArray(decoded.tickRows[0].contacts));
    assert.deepEqual(decoded.attempts[0].manifest,
      { requestedFamily: "left-to-right", drillLabel: "named-cut", pairId: "pair-a" });
    route.container.querySelector("#arena-eyes").click();
    route.container.querySelector("#arena-reset-drill").click();
    assert.deepEqual([
      route.container.querySelector("#arena-camera-mode").value,
      route.container.querySelector("#arena-view").value,
      route.container.querySelector("#arena-stage").getAttribute("data-eyes-open"),
      route.container.querySelector("#arena-control-hud-toggle").getAttribute("aria-pressed"),
    ], ["fixed", "threeQuarter", "false", "true"]);
    assert.equal(report.disabled, true, "Reset drill left the prior report downloadable");
    await route.handle.dispose(); harness.dropSubtree(route.container);
  } finally {
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
    harness.restore();
  }
});

test("a_touch_practice_report_retains_device_and_capture_history_after_terminal_clear", async () => {
  const harness = installDom();
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  const blobs = [];
  URL.createObjectURL = (blob) => { blobs.push(blob); return `blob:touch-${blobs.length}`; };
  URL.revokeObjectURL = () => {};
  try {
    const inputLog = new CONTROL.ControlInputLog();
    const route = await controlledRoute(harness, "touch", true, inputLog, true);
    const host = route.container.querySelector("#arena-stage");
    const canvas = route.container.querySelector("#arena-3d");
    for (const entry of harness.listenersOn(host, "pointermove")) entry.listener({
      target: canvas, pointerType: "touch", pointerId: 40, clientX: 230, clientY: 180,
      timeStamp: 20, movementX: 30, movementY: 0, buttons: 1, preventDefault() {},
    });
    const input = await route.nextInput();
    await route.acknowledge(input, undefined, 0, true);
    route.worker.emit(syntheticFinish(route.start.requestId, 2));
    await settle(); await settle();
    route.container.querySelector("#arena-save-control-report").click();
    const decoded = JSON.parse(await blobs.at(-1).text());
    assert.deepEqual([decoded.metadata.environment.inputDevice,
      decoded.metadata.environment.inputDevices,
      decoded.metadata.environment.pointerCaptureEver], ["touch", ["touch"], true]);
    assert.ok(decoded.inputRows.some((row) => row.action === "terminal:touch"
      && row.captureActive), "terminal clear erased touch capture before the sidecar saw it");
    await route.handle.dispose(); harness.dropSubtree(route.container);
  } finally {
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
    harness.restore();
  }
});

test("touch_claim_releases_mouse_capture_and_suppresses_compatibility_mouse", async () => {
  const harness = installDom();
  try {
    const route = await controlledRoute(harness);
    const host = route.container.querySelector("#arena-stage");
    const canvas = route.container.querySelector("#arena-3d");
    const down = (event) => {
      for (const entry of harness.listenersOn(host, "pointerdown")) entry.listener({
        target: canvas, button: 0, buttons: 1, clientX: 200, clientY: 180,
        preventDefault() {}, ...event,
      });
    };
    down({ pointerType: "mouse", pointerId: 60, timeStamp: 10 });
    assert.equal(canvas.hasPointerCapture(60), true);
    down({ pointerType: "touch", pointerId: 61, timeStamp: 20 });
    assert.equal(canvas.hasPointerCapture(60), false, "touch left the old mouse owner captured");
    assert.equal(canvas.hasPointerCapture(61), true);
    down({ pointerType: "mouse", pointerId: 62, timeStamp: 21,
      sourceCapabilities: { firesTouchEvents: true } });
    down({ pointerType: "mouse", pointerId: 63, timeStamp: 22 });
    assert.equal(canvas.hasPointerCapture(62), false, "explicit compatibility mouse took ownership");
    assert.equal(canvas.hasPointerCapture(63), false, "bounded compatibility fallback took ownership");
    await route.handle.dispose(); harness.dropSubtree(route.container);
  } finally { harness.restore(); }
});

test("renderer_terminal_clears_and_disposes_the_captured_stage_once", async () => {
  const harness = installDom();
  try {
    const inputLog = new CONTROL.ControlInputLog();
    const route = await controlledRoute(harness, "mouse", true, inputLog, true);
    route.fakeStage.showHandGuide([0, 0, 0], [1, 0, 1]);
    route.terminal("device lost");
    assert.equal(route.fakeStage.guideVisible, false);
    assert.ok(route.fakeStage.guideClears >= 1);
    assert.equal(route.fakeStage.disposeCalls, 1);
    assert.match(route.container.querySelector("#label-three-quarter").textContent, /renderer lost: device lost/);
    assert.ok(inputLog.rows().some((row) => row.channel === "lifecycle"
      && row.action === "renderer-loss:mouse"), "renderer loss cleared before logging ownership");
    await route.handle.dispose();
    await route.handle.dispose();
    assert.equal(route.fakeStage.disposeCalls, 1, "route disposal re-disposed a terminal stage");
    harness.dropSubtree(route.container);
  } finally { harness.restore(); }
});

test("absolute_hand_a_to_b_to_a_returns_to_the_exact_rest_anchored_command", () => {
  const { input } = directHandFixture();
  const basis = { right: [0, 1, 0], up: [0, 0, 1] };
  input.placeWeapon(-0.4, 0.2, 100, 0, 16, basis);
  const first = [...input.encode(null, 0)];
  input.placeWeapon(0.6, -0.3, 140, 50, 16, basis);
  input.placeWeapon(-0.4, 0.2, 100, 50, 16, basis);
  assert.deepEqual([...input.encode(null, 0)], first);
});

test("the_hand_reticle_clamps_marks_clears_and_disposes_without_owning_input", async () => {
  const harness = installDom();
  try {
    const { createHandReticle } = await import(compiled("client/src/arena/hand-reticle.js"));
    const host = harness.container();
    const reticle = createHandReticle(host);
    const error = host.children[0];
    const achieved = host.children[1];
    const marker = host.children.at(-1);
    assert.equal(marker.hidden, true);
    reticle.update([1.4, -0.2], true, { x: 0, y: 0, width: 1, height: 1 }, [100, 100]);
    assert.deepEqual([marker.style.left, marker.style.top], ["92%", "17.33333333333333%"]);
    assert.equal(marker.classList.contains("captured"), true);
    assert.equal(marker.classList.contains("offscreen"), true);
    reticle.update([0.25, 0.25], false, { x: 0, y: 0, width: 1, height: 1 }, [100, 100]);
    reticle.updateAchieved([0.75, 0.5], { x: 0, y: 0, width: 1, height: 1 }, [100, 100], 0.5);
    assert.deepEqual([marker.style.left, marker.style.top], ["25%", "25%"]);
    assert.deepEqual([achieved.style.left, achieved.style.top], ["75%", "50%"]);
    assert.equal(error.hidden, false, "distinct desired and achieved sources drew no error");
    assert.equal(error.style.backgroundColor, "rgb(236, 141, 154)",
      "desired-first ordering painted the default zero-error colour");
    assert.notEqual(error.style.width, "0px", "achieved marker reused the desired source");
    reticle.update([0.4, 0.25], false, { x: 0, y: 0, width: 1, height: 1 }, [100, 100]);
    assert.equal(error.hidden, true, "a desired event recoloured a stale achieved publication");
    reticle.updateAchieved([0.7, 0.5], { x: 0, y: 0, width: 1, height: 1 }, [100, 100], 0.3);
    assert.equal(error.hidden, false);
    reticle.update(null, false);
    assert.deepEqual([marker.style.left, marker.style.top], ["40%", "25%"]);
    assert.equal(marker.classList.contains("offscreen"), false);
    reticle.clear();
    assert.equal(marker.hidden, true);
    assert.equal(marker.classList.contains("captured"), false);
    reticle.updateAchieved([0.75, 0.5], { x: 0, y: 0, width: 1, height: 1 }, [100, 100], 0.5);
    reticle.update([0.25, 0.25], false, { x: 0, y: 0, width: 1, height: 1 }, [100, 100]);
    assert.equal(error.hidden, true, "achieved-first ordering invented a matched error line");
    reticle.updateAchieved([0.75, 0.5], { x: 0, y: 0, width: 1, height: 1 }, [100, 100], 0.5);
    assert.equal(error.hidden, false);
    reticle.dispose();
    assert.equal(host.children.includes(marker), false);
  } finally { harness.restore(); }
});

test("height_is_body_relative_uses_the_posed_standing_height_and_is_continuous", () => {
  const { input } = directHandFixture();
  assert.equal(commandArm(input.encode(null, 0)).height, ONE / 2,
    "elevated body or lowered shoulder leaked static/absolute height into the inverse");
  input.moveWeapon(0, -1, 20, 1_000, { right: [0, 1, 0], up: [0, 0, 1] });
  const height = commandArm(input.encode(null, 0)).height;
  assert.ok(height > ONE / 2 && height < ONE / 2 + 1_000,
    "height snapped to a combat band instead of remaining a continuous raw value");
});

test("reach_uses_the_exported_physical_minimum_and_not_a_second_quarter", () => {
  const { input } = directHandFixture();
  input.buttonTransition("extend", true);
  input.moveWeapon(0, 100_000, 20, 1_000, { right: [1, 0, 0], up: [0, 0, 1] }, "extend");
  assert.equal(commandArm(input.encode(null, 0)).reach, 12_345);
  assert.notEqual(commandArm(input.encode(null, 0)).reach, ONE / 4);
});

test("a_guard_moves_at_resting_effort_and_fast_powered_paths_order_effort", () => {
  const slow = directHandFixture().input;
  slow.moveWeapon(10, 0, 1_000, 1_000, { right: [0, 1, 0], up: [0, 0, 1] });
  assert.equal(commandArm(slow.encode(null, 0)).effort, ONE / 2);
  const poweredSlow = directHandFixture().input;
  poweredSlow.buttonTransition("cut", true);
  poweredSlow.moveWeapon(10, 0, 1_000, 1_000, { right: [0, 1, 0], up: [0, 0, 1] });
  const poweredFast = directHandFixture().input;
  poweredFast.buttonTransition("cut", true);
  poweredFast.moveWeapon(10, 0, 10, 1_000, { right: [0, 1, 0], up: [0, 0, 1] });
  const a = commandArm(poweredSlow.encode(null, 0));
  const b = commandArm(poweredFast.encode(null, 0));
  assert.deepEqual([a.bearing, a.height, a.reach], [b.bearing, b.height, b.reach]);
  assert.ok(a.effort >= ONE / 2 && b.effort > a.effort);
  poweredFast.clear();
  assert.equal(commandArm(poweredFast.encode(null, 0)).effort, ONE / 2,
    "focus loss left the parked arm powered");
});

test("a_secondary_drag_scales_the_shoulder_to_hand_distance_and_holds_its_direction", () => {
  const { input } = directHandFixture();
  const before = input.desiredHand();
  input.buttonTransition("extend", true);
  input.moveWeapon(50_000, -25, 20, 1_000, { right: [0, 1, 0], up: [0, 0, 1] }, "extend");
  const after = input.desiredHand();
  assert.ok(after[0] > before[0]);
  assert.equal(after[1], before[1]);
  assert.equal(commandArm(input.encode(null, 0)).bearing, 0, "secondary dx leaked into the cut channel");
});

test("extension_round_trips_and_clamps_to_the_exported_reach_envelope", () => {
  const { input } = directHandFixture();
  const initial = input.desiredHand();
  input.buttonTransition("extend", true);
  input.moveWeapon(0, -20, 20, 1_000, { right: [0, 1, 0], up: [0, 0, 1] }, "extend");
  input.moveWeapon(0, 20, 20, 1_000, { right: [0, 1, 0], up: [0, 0, 1] }, "extend");
  const roundTrip = input.desiredHand();
  assert.ok(Math.hypot(...roundTrip.map((value, at) => value - initial[at])) < 2,
    "equal extension drags did not round-trip shoulder-to-hand distance");
  input.moveWeapon(0, -1_000_000, 20, 1_000, { right: [0, 1, 0], up: [0, 0, 1] }, "extend");
  assert.equal(commandArm(input.encode(null, 0)).reach, ONE);
  input.moveWeapon(0, 1_000_000, 20, 1_000, { right: [0, 1, 0], up: [0, 0, 1] }, "extend");
  assert.equal(commandArm(input.encode(null, 0)).reach, 12_345);
});

test("pitched_three_quarter_and_first_person_bases_move_in_sim_camera_axes", () => {
  for (const [name, basis] of [
    ["three-quarter", { right: [0, 1, 0], up: [-0.3, 0.4, 0.8660254] }],
    ["first-person", { right: [0, 1, 0], up: [0.5, 0, 0.8660254] }],
  ]) {
    const { input } = directHandFixture();
    const before = input.desiredHand();
    input.moveWeapon(0, -20, 20, 1_000, basis);
    const after = input.desiredHand();
    const expected = basis.up;
    assert.ok((after[0] - before[0]) * expected[0] >= 0
      && (after[1] - before[1]) * expected[1] >= 0
      && after[2] > before[2], `${name} pitch was mixed in Babylon rather than sim axes`);

    const thrust = directHandFixture().input;
    const thrustBefore = thrust.desiredHand();
    thrust.buttonTransition("extend", true);
    thrust.moveWeapon(400, -20, 20, 1_000, basis, "extend");
    const thrustAfter = thrust.desiredHand();
    assert.ok(thrustAfter[0] > thrustBefore[0], `${name} secondary drag did not thrust forward`);
    assert.equal(thrustAfter[1], thrustBefore[1], `${name} camera right leaked into thrust direction`);
  }
});

test("powered_cuts_encode_signed_elbow_planes_and_cross_the_angle_seam_the_short_way", () => {
  const planeFor = (theta) => {
    const { input } = directHandFixture();
    input.buttonTransition("cut", true);
    input.moveWeapon(10, 0, 10, 1_000,
      { right: [0, Math.sin(theta), -Math.cos(theta)], up: [0, 0, 1] }, "cut");
    return commandArm(input.encode(null, 0)).plane;
  };
  const positive = planeFor(Math.PI / 2);
  const negative = planeFor(-Math.PI / 2);
  assert.ok(positive > 16_000 && positive < 18_000);
  assert.ok(negative > 47_000 && negative < 50_000);
  const beforeSeam = planeFor(Math.PI - Math.PI / 180);
  const afterSeam = planeFor(-Math.PI + Math.PI / 180);
  const circular = Math.min(Math.abs(afterSeam - beforeSeam), ONE - Math.abs(afterSeam - beforeSeam));
  assert.ok(circular > 300 && circular < 500,
    "the encoded plane took the long route across the signed-angle seam");

  const seam = directHandFixture().input;
  seam.buttonTransition("cut", true);
  const gesture = (theta) => seam.moveWeapon(10, 0, 10, 1_000,
    { right: [0, Math.sin(theta), -Math.cos(theta)], up: [0, 0, 1] }, "cut");
  gesture(Math.PI - Math.PI / 180);
  const signedBefore = seam.armTarget.plane;
  gesture(-Math.PI + Math.PI / 180);
  const signedAfter = seam.armTarget.plane;
  assert.ok(Math.abs(signedAfter - signedBefore) < 1_000,
    "nearest-equivalent plane state reversed almost a whole turn at the seam");
});

test("the_most_recent_powered_button_owns_each_whole_delta_and_new_presses_get_a_new_dead_zone", () => {
  const { input } = directHandFixture();
  input.buttonTransition("cut", true);
  input.moveWeapon(7, 0, 10, 1_000, { right: [0, 1, 0], up: [0, 0, 1] });
  const cut = commandArm(input.encode(null, 0));
  input.buttonTransition("extend", true);
  // Transition-event delta belonged to cut; the next belongs wholly to extend.
  input.moveWeapon(99, -7, 10, 1_000, { right: [0, 1, 0], up: [0, 0, 1] }, "cut");
  const transition = commandArm(input.encode(null, 0));
  input.moveWeapon(99, -7, 10, 1_000, { right: [0, 1, 0], up: [0, 0, 1] });
  const extended = commandArm(input.encode(null, 0));
  assert.notEqual(transition.bearing, cut.bearing);
  assert.equal(extended.bearing, transition.bearing);
  input.buttonTransition("extend", false); // cut resumes with its accumulated travel.
  input.buttonTransition("cut", false);
  input.buttonTransition("cut", true); // genuinely new press resets travel.
  input.moveWeapon(1, 0, 1, 1_000, { right: [0, 1, 0], up: [0, 0, 1] });
  assert.equal(commandArm(input.encode(null, 0)).effort, ONE / 2);
});

test("a_missing_or_severed_primary_arm_is_not_encoded_from_a_stale_target", () => {
  const { input, pose } = directHandFixture();
  const broken = { ...pose, severed: 1 << 3 };
  assert.equal(input.synchronize(broken), false);
  assert.deepEqual(commandArm(input.encode(null, 0)),
    { bearing: 0, height: ONE / 2, reach: 0, effort: 0, plane: 0 });
});

test("two_touch_parallel_motion_is_extension_while_opposed_motion_is_camera_only", async () => {
  for (const mode of ["parallel", "opposed"]) {
    const harness = installDom();
    try {
      const route = await controlledRoute(harness, "touch");
      const host = route.container.querySelector("#arena-stage");
      const canvas = route.container.querySelector("#arena-3d");
      const baseline = await route.nextInput();
      const before = Uint8Array.from(new Uint8Array(baseline.bytes));
      await route.acknowledge(baseline, 0);
      for (const entry of harness.listenersOn(host, "pointerdown")) entry.listener({
        target: canvas, pointerType: "touch", pointerId: 41, button: 0,
        clientX: 240, clientY: 180, preventDefault() {},
      });
      const move = (pointerId, clientX, clientY) => {
        for (const entry of harness.listenersOn(host, "pointermove")) entry.listener({
          target: canvas, pointerType: "touch", pointerId, clientX, clientY,
          movementX: 0, movementY: 0, buttons: 1, preventDefault() {},
        });
      };
      if (mode === "parallel") { move(40, 200, 170); move(41, 240, 170); }
      else { move(40, 190, 180); move(41, 250, 180); }
      const staged = await route.nextInput();
      const after = new Uint8Array(staged.bytes);
      assert.deepEqual([...after.slice(4, 23)], [...before.slice(4, 23)],
        `${mode} touch changed navigation/intent`);
      if (mode === "parallel") {
        assert.equal(route.fakeStage.pinchHits, 0);
        assert.notDeepEqual(commandArm(after), commandArm(before));
      } else {
        assert.equal(route.fakeStage.pinchHits, 1);
        assert.deepEqual([...after.slice(23)], [...before.slice(23)],
          "a pinch changed an arm command byte");
      }
      await route.handle.dispose(); harness.dropSubtree(route.container);
    } finally { harness.restore(); }
  }
});

test("a_stationary_second_touch_is_classified_after_the_bounded_gesture_window", async () => {
  const harness = installDom();
  try {
    const route = await controlledRoute(harness, "touch");
    const host = route.container.querySelector("#arena-stage");
    const canvas = route.container.querySelector("#arena-3d");
    for (const entry of harness.listenersOn(host, "pointerdown")) entry.listener({
      target: canvas, pointerType: "touch", pointerId: 41, button: 0,
      clientX: 240, clientY: 180, timeStamp: 10, preventDefault() {},
    });
    const move = (x, timeStamp) => {
      for (const entry of harness.listenersOn(host, "pointermove")) entry.listener({
        target: canvas, pointerType: "touch", pointerId: 40,
        clientX: x, clientY: 180, timeStamp, movementX: 0, movementY: 0,
        buttons: 1, preventDefault() {},
      });
    };
    move(195, 20); // waits for the other finger or the bounded deadline
    assert.equal(route.fakeStage.pinchHits, 0);
    move(190, 60); // the anchored second finger now yields a real pinch
    assert.equal(route.fakeStage.pinchHits, 1);
    await route.handle.dispose(); harness.dropSubtree(route.container);
  } finally { harness.restore(); }
});

test("lifting_one_of_two_touches_rebaselines_the_remaining_drag", async () => {
  const harness = installDom();
  try {
    const route = await controlledRoute(harness, "touch");
    const host = route.container.querySelector("#arena-stage");
    const canvas = route.container.querySelector("#arena-3d");
    for (const entry of harness.listenersOn(host, "pointerdown")) entry.listener({
      target: canvas, pointerType: "touch", pointerId: 41, button: 0,
      clientX: 240, clientY: 180, timeStamp: 10, preventDefault() {},
    });
    for (const entry of harness.listenersOn(host, "pointerup")) entry.listener({
      target: canvas, pointerType: "touch", pointerId: 41, timeStamp: 20,
    });
    const baseline = await route.nextInput();
    const before = commandArm(new Uint8Array(baseline.bytes));
    await route.acknowledge(baseline);
    for (const entry of harness.listenersOn(host, "pointermove")) entry.listener({
      target: canvas, pointerType: "touch", pointerId: 40,
      clientX: 215, clientY: 180, timeStamp: 30, movementX: 0, movementY: 0,
      buttons: 1, preventDefault() {},
    });
    const after = commandArm(new Uint8Array((await route.nextInput()).bytes));
    assert.notDeepEqual(after, before, "the remaining finger stopped controlling the parked hand");
    await route.handle.dispose(); harness.dropSubtree(route.container);
  } finally { harness.restore(); }
});

test("a_severed_primary_releases_capture_but_held_body_input_keeps_the_worker_draining", async () => {
  const harness = installDom();
  try {
    const inputLog = new CONTROL.ControlInputLog();
    const route = await controlledRoute(harness, "mouse", true, inputLog, true);
    route.fakeStage.showHandGuide([0, 0, 0], [1, 0, 1]);
    route.key("KeyW");
    const beforeLoss = await route.nextInput();
    await route.acknowledge(beforeLoss, 0, 1 << 3);
    const afterLoss = await route.nextInput();
    const view = new DataView(afterLoss.bytes);
    assert.equal(globalThis.document.pointerLockElement, null);
    assert.match(route.container.querySelector("#status").textContent, /CONTROL_PRIMARY_ARM_UNAVAILABLE/);
    assert.equal(route.fakeStage.guideVisible, false, "arm loss left the desired-hand guide visible");
    assert.equal(view.getInt32(4, true), ONE, "arm loss cleared held body movement");
    assert.equal(commandArm(new Uint8Array(afterLoss.bytes)).reach, 0);
    assert.ok(inputLog.rows().some((row) => row.channel === "lifecycle"
      && row.action === "arm-loss:mouse"), "arm loss cleared before logging ownership");
    await route.acknowledge(afterLoss);
    const continued = await route.nextInput();
    assert.equal(continued.ticksDue, 1, "arm loss stranded the controlled worker");
    await route.handle.dispose(); harness.dropSubtree(route.container);
  } finally { harness.restore(); }
});

test("human_frame_zero_and_the_first_control_clock_tick_reach_the_live_route", async () => {
  const harness = installDom();
  try {
    const route = await controlledRoute(harness);
    assert.equal(tickOf(route.container), 0, "the Human route did not draw publication frame 0");
    route.key("KeyW");
    const input = await route.nextInput();
    assert.equal(input.ticksDue, 1);
    assert.equal(new DataView(input.bytes).getInt32(4, true), ONE);
    await route.handle.dispose(); harness.dropSubtree(route.container);
  } finally { harness.restore(); }
});

test("selection_finish_and_disposal_clear_the_desired_hand_guide", async () => {
  for (const ending of ["selection", "finish", "dispose"]) {
    const harness = installDom();
    try {
      const route = await controlledRoute(harness);
      route.fakeStage.showHandGuide([0, 0, 0], [1, 0, 1]);
      if (ending === "selection") route.container.querySelector("#change-matchup").click();
      else if (ending === "finish") route.worker.emit(syntheticFinish(route.start.requestId, 1));
      else await route.handle.dispose();
      await settle();
      assert.equal(route.fakeStage.guideVisible, false, `${ending} left the guide visible`);
      if (ending !== "dispose") await route.handle.dispose();
      harness.dropSubtree(route.container);
    } finally { harness.restore(); }
  }
});

test("a_human_fight_starts_without_take_controls_or_pointer_lock", () => {
  const source = fs.readFileSync(path.join(ROOT, "client/src/arena/arena.ts"), "utf8");
  assert.doesNotMatch(SHELL_HTML, /id="take-controls"/);
  assert.doesNotMatch(source, /requestPointerLock|pointerlockchange|pointerlockerror/);
  assert.match(source, /capture = "mouse";\s*resumeControlledFight\(performance\.now\(\)\)/);
});

test("the_unlocked_cursor_path_registers_no_pointer_lock_lifecycle", () => {
  const source = fs.readFileSync(path.join(ROOT, "client/src/arena/arena.ts"), "utf8");
  assert.doesNotMatch(source, /requestPointerLock|pointerlockchange|pointerlockerror|exitPointerLock/);
  assert.doesNotMatch(SHELL_HTML, /id="take-controls"/);
});

test("thirty_sixty_one_hundred_twenty_and_one_hundred_forty_four_hertz_stage_the_same_yaw_sequence", async () => {
  const sequences = [];
  for (const hz of [30, 60, 120, 144]) {
    const harness = installDom();
    try {
      const route = await controlledRoute(harness);
      route.key("KeyQ");
      const yaws = [];
      let acknowledged = 0;
      let publishedYaw = 0;
      for (let display = 0; display < hz; display += 1) {
        await route.runFrame(1_000 / hz);
        for (;;) {
          const inputs = route.worker.sent.filter((entry) => entry.message.kind === "arenaInput");
          if (acknowledged >= inputs.length) break;
          const input = inputs[acknowledged++].message;
          assert.equal(input.ticksDue, 1, `${hz} Hz batched distinct yaw ticks`);
          const commandedYaw = new DataView(input.bytes).getUint16(12, true);
          assert.equal(commandedYaw, (publishedYaw + 8_192) & 0xffff,
            `${hz} Hz integrated an old command instead of rebasing on published yaw`);
          yaws.push(commandedYaw);
          // The achieved body deliberately trails the target by a non-divisor
          // of the lead. Echoing the command here would let an open-loop
          // integrator pass while Q remained held.
          publishedYaw = (publishedYaw + 997) & 0xffff;
          await route.acknowledge(input, publishedYaw);
        }
      }
      assert.equal(yaws.length, 60, `${hz} Hz did not drain exactly sixty sampled ticks`);
      sequences.push(yaws);
      await route.handle.dispose(); harness.dropSubtree(route.container);
    } finally { harness.restore(); }
  }
  for (const sequence of sequences.slice(1)) assert.deepEqual(sequence, sequences[0]);
  assert.deepEqual(sequences[0].slice(0, 3), [8_192, 9_189, 10_186]);
});

test("key_down_reaches_a_controlled_fight_within_two_ticks_and_follow_defaults_to_the_human", async () => {
  const harness = installDom();
  try {
    const route = await controlledRoute(harness);
    const { container, handle, worker } = route;
    assert.equal(container.querySelector("#arena-follow").value, "a");

    const keyEvent = { target: globalThis.window, key: "w", code: "KeyW",
      preventDefault() { this.prevented = true; } };
    for (const entry of harness.listenersOn(globalThis.window, "keydown")) entry.listener(keyEvent);
    const input = await route.nextInput();
    assert.ok(input, "a held key did not reach the worker within two ticks");
    assert.ok(input.ticksDue >= 1 && input.ticksDue <= 2);
    const view = new DataView(input.bytes);
    assert.deepEqual([view.getInt32(4, true), view.getInt32(8, true)], [ONE, 0]);
    assert.equal(view.getUint8(14), 1, "live body input did not target the opponent");
    await handle.dispose();
    harness.dropSubtree(container);
  } finally {
    harness.restore();
  }
});

test("w_and_s_move_in_the_torsos_forward_axis", async () => {
  for (const [code, expected] of [["KeyW", ONE], ["KeyS", -ONE]]) {
    const harness = installDom();
    try {
      const route = await controlledRoute(harness);
      route.key(code);
      const input = await route.nextInput();
      const view = new DataView(input.bytes);
      assert.deepEqual([view.getInt32(4, true), view.getInt32(8, true)], [expected, 0]);
      await route.handle.dispose(); harness.dropSubtree(route.container);
    } finally { harness.restore(); }
  }
});

test("a_and_d_strafe_while_q_and_e_turn_the_body", async () => {
  for (const [code, yaw, side] of [
    ["KeyA", 0, ONE], ["KeyD", 0, -ONE],
    ["KeyQ", 8_192, 0], ["KeyE", 65_536 - 8_192, 0],
  ]) {
    const harness = installDom();
    try {
      const route = await controlledRoute(harness);
      route.key(code);
      const input = await route.nextInput();
      const view = new DataView(input.bytes);
      assert.equal(view.getUint16(12, true), yaw, `${code} wrote the wrong yaw`);
      assert.equal(view.getInt32(8, true), side, `${code} wrote the wrong sidestep`);
      await route.handle.dispose(); harness.dropSubtree(route.container);
    } finally { harness.restore(); }
  }
});

test("released_turn_rebases_w_and_a_only_commands_on_the_latest_published_yaw", async () => {
  for (const movement of ["KeyW", "KeyA"]) {
    const harness = installDom();
    try {
      const route = await controlledRoute(harness);
      route.key("KeyQ");
      const turning = await route.nextInput();
      assert.equal(new DataView(turning.bytes).getUint16(12, true), 8_192);
      await route.acknowledge(turning, 1_337); // The body has not reached its commanded lead.
      route.release("KeyQ");
      route.key(movement);
      const moving = await route.nextInput();
      const view = new DataView(moving.bytes);
      assert.equal(view.getUint16(12, true), 1_337,
        `${movement} retained the stale turn target instead of published body yaw`);
      assert.notEqual(view.getUint16(12, true), 8_192);
      await route.handle.dispose(); harness.dropSubtree(route.container);
    } finally { harness.restore(); }
  }
});

test("mouse_motion_changes_no_navigation_or_body_yaw_byte", async () => {
  const harness = installDom();
  try {
    const route = await controlledRoute(harness);
    const stage = route.container.querySelector("#arena-stage");
    const canvas = route.container.querySelector("#arena-3d");
    for (const entry of harness.listenersOn(stage, "pointermove")) entry.listener({
      target: canvas, pointerId: 17, movementX: 90, movementY: -40, buttons: 1,
      preventDefault() {},
    });
    const input = await route.nextInput();
    const view = new DataView(input.bytes);
    assert.deepEqual([view.getInt32(4, true), view.getInt32(8, true), view.getUint16(12, true)],
      [0, 0, 0]);
    await route.handle.dispose(); harness.dropSubtree(route.container);
  } finally { harness.restore(); }
});

test("movement_x_and_y_cannot_change_the_absolute_cursor_result", async () => {
  const commands = [];
  for (const movementX of [-50_000, 90_000]) {
    const harness = installDom();
    try {
      const route = await controlledRoute(harness);
      const stage = route.container.querySelector("#arena-stage");
      const canvas = route.container.querySelector("#arena-3d");
      for (const entry of harness.listenersOn(stage, "pointermove")) entry.listener({
        target: canvas, pointerId: 17, pointerType: "mouse", clientX: 320, clientY: 220,
        movementX, movementY: -movementX, buttons: 1, timeStamp: 20, preventDefault() {},
      });
      commands.push([...new Uint8Array((await route.nextInput()).bytes)]);
      await route.handle.dispose(); harness.dropSubtree(route.container);
    } finally { harness.restore(); }
  }
  assert.deepEqual(commands[0], commands[1]);
});

test("camera_motion_with_a_non_neutral_hand_changes_no_command_byte", async () => {
  const harness = installDom();
  try {
    const route = await controlledRoute(harness);
    const host = route.container.querySelector("#arena-stage");
    const canvas = route.container.querySelector("#arena-3d");
    for (const entry of harness.listenersOn(host, "pointermove")) entry.listener({
      target: canvas, pointerId: 17, movementX: 30, movementY: -8, buttons: 1, preventDefault() {},
    });
    const before = await route.nextInput();
    await route.acknowledge(before, 0);
    route.fakeStage.orbit = () => true;
    for (const entry of harness.listenersOn(host, "pointerdown")) entry.listener({
      target: canvas, pointerId: 90, pointerType: "mouse", button: 1,
      clientX: 100, clientY: 100, preventDefault() {},
    });
    for (const entry of harness.listenersOn(host, "pointermove")) entry.listener({
      target: canvas, pointerId: 90, movementX: 80, movementY: 40, buttons: 4, preventDefault() {},
    });
    const after = await route.nextInput();
    assert.deepEqual([...new Uint8Array(after.bytes)], [...new Uint8Array(before.bytes)]);
    await route.handle.dispose(); harness.dropSubtree(route.container);
  } finally { harness.restore(); }
});

test("blur_hidden_and_pause_clear_every_held_input", async () => {
  for (const stop of ["blur", "hidden", "pause"]) {
    const harness = installDom();
    try {
      const inputLog = new CONTROL.ControlInputLog();
      const route = await controlledRoute(harness, "mouse", true, inputLog, true);
      route.key("KeyW", "w");
      if (stop === "blur") {
        for (const entry of harness.listenersOn(globalThis.window, "blur")) entry.listener({});
      } else if (stop === "hidden") {
        globalThis.document.visibilityState = "hidden";
        for (const entry of harness.listenersOn(globalThis.document, "visibilitychange")) entry.listener({});
      } else route.key("Space", " ");
      await settle();
      const input = route.worker.sent.filter((entry) => entry.message.kind === "arenaInput").at(-1).message;
      const view = new DataView(input.bytes);
      assert.deepEqual([view.getInt32(4, true), view.getInt32(8, true), view.getUint8(14)],
        [0, 0, 0], `${stop} left held input staged`);
      assert.equal(input.ticksDue, 0, `${stop} advanced a tick while staging neutral`);
      assert.equal(route.worker.sent.filter((entry) => entry.message.kind === "arenaChunk").length, 0,
        `${stop} produced a new authoritative frame`);
      assert.equal(route.container.querySelector("#play").textContent, "Play",
        `${stop} did not pause a fight still being produced`);
      assert.ok(inputLog.rows().some((row) => row.channel === "lifecycle"
        && row.action === `${stop}:mouse`), `${stop} cleared before logging capture ownership`);
      await route.handle.dispose(); harness.dropSubtree(route.container);
    } finally { harness.restore(); }
  }
});

test("space_pauses_a_fight_that_is_still_being_produced", async () => {
  const harness = installDom();
  try {
    const route = await controlledRoute(harness);
    assert.equal(route.container.querySelector("#play").textContent, "Pause");
    route.key("Space", " ");
    assert.equal(route.container.querySelector("#play").textContent, "Play");
    await route.handle.dispose(); harness.dropSubtree(route.container);
  } finally { harness.restore(); }
});

test("pause_resumes_without_take_controls_and_outlives_the_stale_neutral_ack", async () => {
  const harness = installDom();
  try {
    const route = await controlledRoute(harness);
    route.key("Space", " ");
    const neutral = route.worker.sent.filter((entry) => entry.message.kind === "arenaInput").at(-1).message;
    assert.equal(neutral.ticksDue, 0);
    route.key("Space", " ");
    assert.equal(route.container.querySelector("#play").textContent, "Pause");
    route.key("KeyQ");
    route.worker.emit({ kind: "arenaInputAck", version: 2, requestId: neutral.requestId,
      arenaRequestId: route.start.requestId, steppedTicks: 0 });
    await settle();
    await route.runFrame(20);
    const fresh = route.worker.sent.filter((entry) => entry.message.kind === "arenaInput").at(-1).message;
    assert.notEqual(fresh.requestId, neutral.requestId);
    assert.equal(fresh.ticksDue, 1);
    assert.equal(new DataView(fresh.bytes).getUint16(12, true), 8_192);
    await route.handle.dispose(); harness.dropSubtree(route.container);
  } finally { harness.restore(); }
});

test("movement_keys_after_a_controlled_fight_finishes_are_not_swallowed_or_restarted", async () => {
  const harness = installDom();
  try {
    const route = await controlledRoute(harness);
    route.worker.emit(syntheticFinish(route.start.requestId, 1));
    await settle();
    const before = route.worker.sent.filter((entry) => entry.message.kind === "arenaInput").length;
    const event = { target: globalThis.window, key: "w", code: "KeyW", prevented: false,
      preventDefault() { this.prevented = true; } };
    for (const entry of harness.listenersOn(globalThis.window, "keydown")) entry.listener(event);
    await route.runFrame(20);
    assert.equal(event.prevented, false);
    assert.equal(route.worker.sent.filter((entry) => entry.message.kind === "arenaInput").length, before);
    assert.equal(route.container.querySelector("#play").textContent, "Play");
    await route.handle.dispose(); harness.dropSubtree(route.container);
  } finally { harness.restore(); }
});

test("the_arena_draws_a_frame_before_the_fight_has_finished", async () => {
  const harness = installDom();
  try {
    const { container, handle, worker, requestId } = await pressFight(harness);
    // Nothing drawn yet, and the transport says so: the fight has been asked
    // for and no frame of it exists.
    assert.equal(tickOf(container), null);
    assert.equal(container.querySelector("#scrub").disabled, true);

    worker.emit(syntheticOpening(requestId));
    await settle();
    // **The opening draws no frame and names the fight**, which is the whole of
    // what "knowable when" buys: there is nothing to draw and everything to say.
    assert.equal(tickOf(container), null, "an opening message carries no frames");
    assert.match(container.querySelector("#status").innerHTML, /scripted/);

    worker.emit(syntheticChunk(requestId, 0, PROTOCOL.ARENA_STREAM_CHUNK_TICKS));
    await settle();
    // **This is the assertion the session exists for.** A frame is on screen and
    // the fight has not finished: no `arenaFinished` has been posted, and the
    // worker is by construction still producing.
    assert.equal(tickOf(container), 0, "frame 0 must be drawn before the fight ends");
    assert.equal(container.querySelector("#scrub").disabled, false,
      "the transport must be usable on a fight that is still being produced");
    assert.equal(container.querySelector("#scrub").max,
      String(PROTOCOL.ARENA_STREAM_CHUNK_TICKS - 1),
      "the scrub covers what has been produced, not what was asked for");
    assert.equal(worker.sent.filter((one) => one.message.kind === "arenaFinished").length, 0);

    // And the rest of the fight afterwards, so the check above is about the
    // ordering rather than about a fake that posted everything at once.
    const frames = PROTOCOL.ARENA_STREAM_CHUNK_TICKS * 3;
    for (let first = PROTOCOL.ARENA_STREAM_CHUNK_TICKS; first < frames;
      first += PROTOCOL.ARENA_STREAM_CHUNK_TICKS) {
      worker.emit(syntheticChunk(requestId, first, PROTOCOL.ARENA_STREAM_CHUNK_TICKS));
    }
    worker.emit(syntheticFinish(requestId, frames));
    await settle();
    assert.equal(container.querySelector("#scrub").max, String(frames - 1));
    assert.match(container.querySelector("#status").innerHTML, /Decision\(Heroes\)/);

    await handle.dispose();
    harness.dropSubtree(container);
  } finally {
    harness.restore();
  }
});

test("a_fight_in_progress_reports_no_outcome_rather_than_a_default", async () => {
  const harness = installDom();
  try {
    const { container, handle, worker, requestId } = await pressFight(harness);
    worker.emit(syntheticOpening(requestId));
    worker.emit(syntheticChunk(requestId, 0, PROTOCOL.ARENA_STREAM_CHUNK_TICKS));
    await settle();
    const during = container.querySelector("#status").innerHTML;
    // **The three dishonest answers, each refused by name.** A default string
    // claims a result that has not happened; an absent field prints as
    // `undefined`; and `null` printed raw is the same thing wearing a type.
    assert.doesNotMatch(during, /undefined/, "an unfinished fight printed undefined");
    assert.doesNotMatch(during, /null/, "an unfinished fight printed its own null");
    assert.doesNotMatch(during, /Decision|Draw|HeroesWin|MonstersWin|MutualDestruction/,
      "an unfinished fight claimed an Outcome");
    assert.doesNotMatch(during, /decided it/,
      "an unfinished fight said what decided it");
    assert.match(during, /still fighting at tick/);
    assert.match(during, /still being produced/);

    worker.emit(syntheticFinish(requestId, PROTOCOL.ARENA_STREAM_CHUNK_TICKS));
    await settle();
    const after = container.querySelector("#status").innerHTML;
    assert.match(after, /Decision\(Heroes\)/);
    assert.match(after, /the clock decided it/);
    assert.doesNotMatch(after, /still fighting/);

    await handle.dispose();
    harness.dropSubtree(container);
  } finally {
    harness.restore();
  }
});

test("a_starving_playhead_says_so_instead_of_stalling_silently", async () => {
  const harness = installDom();
  try {
    const { container, handle, worker, requestId } = await pressFight(harness);
    const chunk = PROTOCOL.ARENA_STREAM_CHUNK_TICKS;
    worker.emit(syntheticOpening(requestId));
    worker.emit(syntheticChunk(requestId, 0, chunk));
    await settle();
    // [Fight] plays: watching the fight happen is what the button now means.
    assert.equal(container.querySelector("#play").textContent, "Pause");

    // Run the playhead into the end of what has been produced, a display frame
    // at a time: 17 ms is one simulation tick at 1x, so where it stops is the
    // lead rather than the granularity of the step it took to get there.
    let now = performance.now();
    harness.runFrame(now);
    for (let n = 0; n < 2 * chunk; n += 1) { now += 17; harness.runFrame(now); }
    const held = tickOf(container);
    // **Held rather than clamped, and said rather than hidden.** Clamping would
    // stutter one frame at a time against the producer, which reads as a broken
    // renderer; a page that silently stops advancing is indistinguishable from
    // one that crashed.
    //
    // Where it stops is `produced - lead` exactly, which is what the lead *is*:
    // the number of frames the playhead keeps in hand so that one late chunk is
    // survivable. It is neither the last produced frame (that is the clamp this
    // replaced) nor the first (that would be no playback at all).
    assert.equal(held, chunk - PROTOCOL.ARENA_STREAM_LEAD_TICKS);
    assert.ok(held < chunk - 1, "the playhead ran up against the producer");
    assert.ok(held > 0, "the playhead never started");
    assert.match(container.querySelector("#status").innerHTML,
      /waiting for the fight to be produced/);

    // And it resumes when production catches up, which is what makes the
    // sentence above a state rather than a dead end.
    worker.emit(syntheticChunk(requestId, chunk, chunk));
    await settle();
    for (let n = 0; n < 4; n += 1) { now += 17; harness.runFrame(now); }
    assert.ok(tickOf(container) > held, "the playhead did not resume when frames arrived");
    assert.doesNotMatch(container.querySelector("#status").innerHTML,
      /waiting for the fight to be produced/);

    await handle.dispose();
    harness.dropSubtree(container);
  } finally {
    harness.restore();
  }
});

test("a_cancelled_stream_keeps_the_frames_it_already_delivered", async () => {
  const harness = installDom();
  try {
    const { container, handle, worker, requestId } = await pressFight(harness);
    const chunk = PROTOCOL.ARENA_STREAM_CHUNK_TICKS;
    worker.emit(syntheticOpening(requestId));
    worker.emit(syntheticChunk(requestId, 0, chunk));
    worker.emit(syntheticChunk(requestId, chunk, chunk));
    await settle();
    assert.equal(container.querySelector("#scrub").max, String(chunk * 2 - 1));

    // The worker's own cancel refusal, which is what settles the *start*
    // request. No `arenaFinished` follows it: a fight that was stopped has no
    // outcome, and this channel does not invent one.
    worker.emit({ kind: "arenaRejected", version: PROTOCOL.WORKER_PROTOCOL_VERSION, requestId,
      reason: "cancelled", packed: 0, detail: "the recording was cancelled" });
    await settle();

    // **The frames survive the refusal.** They are the part of the fight the
    // reader watched, and throwing them away because the last chunk never came
    // would be the page forgetting something it had already shown.
    assert.equal(tickOf(container) !== null, true, "a cancelled fight left no frame on screen");
    assert.equal(container.querySelector("#scrub").disabled, false);
    assert.equal(container.querySelector("#scrub").max, String(chunk * 2 - 1));
    const status = container.querySelector("#status").innerHTML;
    assert.match(status, /still fighting at tick/, "the fight it kept is still named");
    assert.match(status, /cancelled/, "the refusal is not shown");
    assert.doesNotMatch(status, /still being produced/,
      "a stopped fight must stop claiming it is being produced");
    // And the playhead stops waiting for a producer that has gone.
    assert.equal(container.querySelector("#play").textContent, "Play");

    await handle.dispose();
    harness.dropSubtree(container);
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
