/**
 * **What each engine costs before it steps**: the bytes a page downloads (raw, gzip and brotli, as a
 * static host would compress them), the time to instantiate it and the memory it holds with 32
 * humans built, and the time to build a world of 32. Node harness; init and memory are read in a fresh process per engine, three
 * processes each, medians.
 *
 *     node research/physics-bakeoff/load-cost.mjs
 *
 * Writes `results/load-cost.json`.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { gzipSync, brotliCompressSync, constants } from "node:zlib";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const nm = (p) => fileURLToPath(new URL(`../../node_modules/${p}`, import.meta.url));

/** What a page fetches for each engine: the files its browser build loads. */
const FILES = {
  mujoco: ["@mujoco/mujoco/mujoco.js", "@mujoco/mujoco/mujoco.wasm"],
  "mujoco-mt": ["@mujoco/mujoco/mt/mujoco.js", "@mujoco/mujoco/mt/mujoco.wasm"],
  // The compat builds inline the wasm as base64 in the JS; the non-compat package ships the .wasm.
  rapier: ["@dimforge/rapier3d-compat/dist/rapier.mjs"],
  "rapier-simd": ["@dimforge/rapier3d-simd-compat/dist/rapier.mjs"],
  "rapier-wasm-only": ["@dimforge/rapier3d-compat/dist/rapier_wasm3d_bg.wasm"],
  "rapier-simd-wasm-only": ["@dimforge/rapier3d-simd-compat/dist/rapier_wasm3d_bg.wasm"],
};

function sizes() {
  const out = {};
  for (const [name, files] of Object.entries(FILES)) {
    let raw = 0, gzip = 0, brotli = 0;
    for (const f of files) {
      let bytes;
      try { bytes = readFileSync(nm(f)); } catch { out[name] = { missing: f }; break; }
      raw += bytes.length;
      gzip += gzipSync(bytes, { level: 9 }).length;
      brotli += brotliCompressSync(bytes, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length;
    }
    if (!out[name]) out[name] = { files, raw, gzip, brotli };
  }
  return out;
}

const mb = (b) => (b / 1048576).toFixed(2);

async function one(engine) {
  const { load } = await import("./engines.mjs");
  const { scaling, layoutOf } = await import("../../src/physics-bench/cases.ts");
  const { humanModel, lowest, placed } = await import("../../src/physics-bench/model.ts");
  const before = process.memoryUsage();
  const e = await load(engine);
  const loaded = process.memoryUsage();
  // Every engine at the chosen conditioning (`chosen.ts`): the feet at x100.
  const cond = { "foot.left": 100, "foot.right": 100 };
  // Building a world of 32 humans (MuJoCo: writing and compiling the MJCF), timed on its own.
  const human = humanModel();
  const scene = { models: layoutOf("spaced", 32).map((o) => placed(human, [o[0], o[1] - lowest(human), o[2]])), ground: true, conditioning: cond };
  const t0 = performance.now();
  e.factory(scene, { hz: 120, substeps: 1 }).dispose();
  const build32Ms = performance.now() - t0;
  let built;
  scaling(e.factory, { hz: 120, substeps: 1 }, "spaced", 32, {
    conditioning: cond, warmup: 10, measure: 10, mark: (p) => { if (p === "end") built = process.memoryUsage(); },
  });
  // A build that does not export its heap view aborts on the read (MuJoCo), so each is tried.
  const heapOf = (k) => { try { return e.module[k]?.length ?? null; } catch { return null; } };
  const heap = heapOf("HEAPU8") ?? heapOf("HEAP8");
  process.stdout.write(JSON.stringify({
    initMs: e.initMs,
    build32Ms,
    rssLoadedMB: (loaded.rss - before.rss) / 1048576,
    rss32MB: (built.rss - before.rss) / 1048576,
    arrayBuffers32MB: built.arrayBuffers / 1048576,
    wasmHeapMB: heap === null ? null : heap / 1048576,
  }));
  // The threaded MuJoCo build keeps its worker threads alive.
  process.exit(0);
}

if (process.argv[2] === "--one") {
  await one(process.argv[3]);
} else {
  const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[s.length >> 1]; };
  const result = { harness: `Node ${process.version}, ${process.platform}`, sizes: sizes(), cold: {} };
  for (const [name, s] of Object.entries(result.sizes)) {
    if (s.missing) console.log(`${name}: missing ${s.missing}`);
    else console.log(`${name}: raw ${mb(s.raw)} MB, gzip ${mb(s.gzip)} MB, brotli ${mb(s.brotli)} MB`);
  }
  for (const engine of ["mujoco", "mujoco-mt", "rapier", "rapier-simd"]) {
    const runs = [0, 1, 2].map(() => JSON.parse(execFileSync(process.execPath, [fileURLToPath(import.meta.url), "--one", engine], { cwd: here, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).split("\n").filter((l) => l.startsWith("{")).pop()));
    const pick = (k) => (runs[0][k] === null ? null : median(runs.map((r) => r[k])));
    const row = Object.fromEntries(Object.keys(runs[0]).map((k) => [k, pick(k)]));
    result.cold[engine] = { ...row, runs };
    console.log(`${engine}: init ${row.initMs.toFixed(1)} ms, 32 humans built in ${row.build32Ms.toFixed(1)} ms, rss +${row.rssLoadedMB.toFixed(1)} MB loaded, +${row.rss32MB.toFixed(1)} MB with 32 humans, arrayBuffers ${row.arrayBuffers32MB.toFixed(1)} MB, wasm heap ${row.wasmHeapMB ?? "-"} MB`);
  }
  writeFileSync(new URL("./results/load-cost.json", import.meta.url), JSON.stringify(result, null, 2) + "\n");
}
