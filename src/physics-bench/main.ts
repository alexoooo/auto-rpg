/**
 * **The physics bake-off's browser page** (`physics-bench.html`): the same engines, cases and
 * scaling runs as `research/physics-bakeoff/` in Node, here on the page's main thread, one engine
 * loaded at a time on demand. Nothing is drawn; the page is a timer.
 *
 * `?auto=1` runs every chosen setting (`chosen.ts`): load, both fidelity cases, then the scaling
 * runs; `?n=1,2,4` and `?layouts=spaced` narrow the runs, `?only=mujoco,rapier` the rows. Results
 * land in the table and on `window.__physicsBench` for a console or a driver to read.
 *
 * The page's clock is coarse (Chrome rounds `performance.now()` to 0.1 ms without cross-origin
 * isolation, which GitHub Pages cannot give), so a step's median and 95th percentile are rounded to
 * it; the mean is exact over the run.
 */
import havokWasmUrl from "@babylonjs/havok/lib/esm/HavokPhysics.wasm?url";
import mujocoWasmUrl from "@mujoco/mujoco/mujoco.wasm?url";
import mujocoMtWasmUrl from "@mujoco/mujoco/mt/mujoco.wasm?url";
import mujocoMtWorkerUrl from "@mujoco/mujoco/mt?worker&url";
import { forearmChain, scaling, standingFoot, standingHuman, type Factory, type Layout, type ScalingResult } from "./cases.ts";
import { CHOSEN, mujocoThreaded, type Chosen } from "./chosen.ts";

interface Loaded { readonly initMs: number; readonly factory: Factory }

const loaded = new Map<string, Promise<Loaded>>();

async function loadEngine(name: Chosen["engine"]): Promise<Loaded> {
  const t0 = performance.now();
  switch (name) {
    case "havok": {
      const [{ default: HavokPhysics }, { createHavok }] = await Promise.all([import("@babylonjs/havok"), import("./engines/havok.ts")]);
      const hk = await HavokPhysics({ locateFile: () => havokWasmUrl });
      return { initMs: performance.now() - t0, factory: (s, st) => createHavok(hk, s, st) };
    }
    case "mujoco": {
      const [{ default: loadMujoco }, { createMujoco }] = await Promise.all([import("@mujoco/mujoco"), import("./engines/mujoco.ts")]);
      // Emscripten's `locateFile`: the bundler's URL for the wasm, which Vite's pre-bundling moves.
      const mj = await loadMujoco({ locateFile: () => mujocoWasmUrl });
      return { initMs: performance.now() - t0, factory: (s, st) => createMujoco(mj, s, st) };
    }
    case "mujoco-mt": {
      // Emscripten pthreads: a worker pool of navigator.hardwareConcurrency, on SharedArrayBuffer.
      if (!globalThis.crossOriginIsolated) throw new Error("the threaded build needs cross-origin isolation (?mt=1 installs coi-sw.js)");
      const [{ default: loadMujoco }, { createMujoco }] = await Promise.all([import("@mujoco/mujoco/mt"), import("./engines/mujoco.ts")]);
      // Each pthread starts from a blob that imports the worker bundle. A worker started from its
      // own URL is matched against service-worker scopes by that URL, so under a page-scoped
      // coi-sw.js it would load without COEP and be refused; a blob worker inherits the page's.
      const main = new Blob([`import ${JSON.stringify(new URL(mujocoMtWorkerUrl, location.href).href)};`], { type: "text/javascript" });
      const mj = await loadMujoco({ locateFile: () => mujocoMtWasmUrl, mainScriptUrlOrBlob: main } as never);
      return { initMs: performance.now() - t0, factory: (s, st) => createMujoco(mj as never, s, st) };
    }
    case "rapier":
    case "rapier-simd": {
      const [R, { createRapier }] = await Promise.all([
        name === "rapier" ? import("@dimforge/rapier3d-compat").then((m) => m.default) : import("@dimforge/rapier3d-simd-compat").then((m) => m.default),
        import("./engines/rapier.ts")]);
      await R.init();
      return { initMs: performance.now() - t0, factory: (s, st) => createRapier(R as never, s, st) };
    }
    default: {
      const never: never = name;
      throw new Error(`unknown engine ${String(never)}`);
    }
  }
}

const engineOf = (name: Chosen["engine"]): Promise<Loaded> => {
  let p = loaded.get(name);
  if (!p) loaded.set(name, (p = loadEngine(name)));
  return p;
};

const params = new URLSearchParams(location.search);
const NS = (params.get("n") ?? "1,2,4,8,16,32").split(",").map(Number);
const LAYOUTS = (params.get("layouts") ?? "spaced,pile").split(",") as Layout[];
const ONLY = params.get("only")?.split(",");
const REPEATS = Number(params.get("repeats") ?? "3");
/** `?mt=1`: MuJoCo's threaded build at `?threads=1,2,4,8` beside the single-threaded MuJoCo row, and nothing else. */
const MT = params.get("mt") === "1";
const THREADS = (params.get("threads") ?? "1,2,4,8").split(",").map(Number);
const ROWS: readonly Chosen[] = MT ? [CHOSEN.find((c) => c.tag === "mujoco")!, ...THREADS.map(mujocoThreaded)] : CHOSEN;

interface Row { tag: string; kind: string; humans?: number; [k: string]: unknown }
const results: Row[] = [];
const state = { status: "idle", results, loads: {} as Record<string, unknown> };
(window as unknown as { __physicsBench: typeof state }).__physicsBench = state;

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const f = (x: number, d = 3): string => (Number.isFinite(x) ? x.toFixed(d) : "-");
/**
 * Yield to the page between runs. A message, not a timer: Chrome throttles a hidden tab's timers to
 * one wake-up a minute after five minutes, which would stretch a run over hours.
 */
const yielder = new MessageChannel();
const tick = (): Promise<void> => new Promise((r) => { yielder.port1.onmessage = () => r(); yielder.port2.postMessage(0); });

function show(row: Row, cells: string[]): void {
  results.push(row);
  const tr = document.createElement("tr");
  for (const c of cells) { const td = document.createElement("td"); td.textContent = c; tr.append(td); }
  $("rows").append(tr);
}

const median = (xs: number[]): number => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2; };

async function runChosen(c: Chosen, what: { fidelity: boolean; scaling: boolean }): Promise<void> {
  $("status").textContent = `${c.tag}: loading`;
  const e = await engineOf(c.engine);
  state.loads[c.engine] = { initMs: e.initMs };
  if (what.fidelity) {
    $("status").textContent = `${c.tag}: case A`; await tick();
    const a = standingFoot(e.factory, c.settings, c.conditioning?.["foot.left"] ?? 1);
    show({ tag: c.tag, kind: "A", ...a }, [c.tag, "case A", a.standing ? "standing" : "FELL", `spin ${f(a.footSpinRms, 4)}`, `tilt ${f(a.footTiltMaxLate)}`, `drift ${f(a.comDrift)} mm`, `${f(a.msPerStep)} ms`]);
    $("status").textContent = `${c.tag}: case B`; await tick();
    const b = forearmChain(e.factory, c.settings);
    show({ tag: c.tag, kind: "B", ...b, elbow: undefined }, [c.tag, "case B", `hand ${f(b.handJitterRms, 4)}`, `wrist ${f(b.wristJitterRms, 4)}`, `ring ${f(b.ringRms)}`, `over ${f(b.overshoot)}`, `${f(b.msPerStep)} ms`]);
    $("status").textContent = `${c.tag}: case C`; await tick();
    const h = standingHuman(e.factory, c.settings, c.conditioning, 10);
    show({ tag: c.tag, kind: "C", ...h }, [c.tag, "case C", `com ${f(h.comAtHalf)} -> ${f(h.comAtEnd)} m`, `drift ${f(h.comDrift, 1)} mm`, `speed ${f(h.maxSpeedLate, 2)} m/s`]);
  }
  if (!what.scaling) return;
  for (const kind of LAYOUTS) for (const humans of NS) {
    $("status").textContent = `${c.tag}: ${kind} x${humans}`; await tick();
    const runs: ScalingResult[] = [];
    for (let k = 0; k < REPEATS; k++) {
      runs.push(scaling(e.factory, c.settings, kind, humans, {
        conditioning: c.conditioning,
      }));
      await tick();
    }
    const pick = (g: (r: ScalingResult) => number): number => median(runs.map(g));
    const row = {
      tag: c.tag, kind, humans,
      totalMean: pick((r) => r.total.mean), totalMedian: pick((r) => r.total.median), totalP95: pick((r) => r.total.p95),
      solverMean: pick((r) => r.solver.mean), readMean: pick((r) => r.read.mean), controlMean: pick((r) => r.control.mean),
      upright: runs.map((r) => r.upright),
    };
    show(row, [c.tag, `${kind} x${humans}`, `mean ${f(row.totalMean)}`, `p95 ${f(row.totalP95, 1)}`, `solver ${f(row.solverMean)}`, `read ${f(row.readMean)}`, `control ${f(row.controlMean)}`]);
  }
}

function resourceSizes(): Record<string, unknown> {
  return Object.fromEntries((performance.getEntriesByType("resource") as PerformanceResourceTiming[])
    .filter((r) => /wasm|havok|mujoco|rapier/i.test(r.name))
    .map((r) => [r.name.replace(location.origin, ""), { transfer: r.transferSize, encoded: r.encodedBodySize, decoded: r.decodedBodySize, ms: r.duration }]));
}

async function runAll(what: { fidelity: boolean; scaling: boolean }): Promise<void> {
  state.status = "running";
  for (const c of ROWS) {
    if (ONLY && !ONLY.includes(c.tag)) continue;
    try { await runChosen(c, what); } catch (err) { show({ tag: c.tag, kind: "error", error: String(err) }, [c.tag, "ERROR", String(err)]); }
  }
  state.loads["resources"] = resourceSizes();
  state.status = "done";
  $("status").textContent = "done";
}

$("run").addEventListener("click", () => void runAll({ fidelity: true, scaling: true }));
$("run-fidelity").addEventListener("click", () => void runAll({ fidelity: true, scaling: false }));
/**
 * **Cross-origin isolation without server headers.** GitHub Pages sets no headers, and
 * SharedArrayBuffer needs COOP and COEP; `coi-sw.js` (`public/`) is a service worker that adds them
 * to every response in its scope. Asked for the threaded build and not isolated, the page installs
 * it and reloads once (a session flag stops a loop where service workers are unavailable).
 */
async function isolate(): Promise<boolean> {
  if (globalThis.crossOriginIsolated || !MT) return true;
  if (!("serviceWorker" in navigator)) return false;
  // Scoped to this page, so the game in the same origin is never served through it.
  await navigator.serviceWorker.register(new URL("coi-sw.js", document.baseURI), { scope: new URL("physics-bench.html", document.baseURI).pathname });
  let tried = false;
  try { tried = sessionStorage.getItem("coi-reloaded") === "1"; sessionStorage.setItem("coi-reloaded", "1"); } catch { /* storage blocked */ }
  if (tried) return false;
  await navigator.serviceWorker.ready;
  location.reload();
  return false;
}

void isolate().then((ok) => {
  state.loads["crossOriginIsolated"] = globalThis.crossOriginIsolated;
  $("ua").textContent = `${navigator.userAgent} | crossOriginIsolated=${String(globalThis.crossOriginIsolated)} | hardwareConcurrency=${navigator.hardwareConcurrency}`;
  if (ok && params.get("auto") === "1") void runAll({ fidelity: true, scaling: true });
});
