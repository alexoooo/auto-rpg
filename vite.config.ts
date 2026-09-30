import { defineConfig } from "vite";

export default defineConfig({
  // strictPort: when 5180 is taken, usually by a forgotten dev server, fail rather than move to
  // 5181 and leave the old server's stale build on the address you are reading.
  server: {
    port: 5180, strictPort: true,
    // Research runs and review archives are not browser source. Watching them costs needless
    // invalidations, and on Windows an archive being extracted can fail the watcher with EBUSY.
    watch: { ignored: ["**/research/runs/**", "**/.review/**"] },
    // Transform the browser entry graphs at server startup, before navigation
    // has to discover and wait on each level of their imports.
    warmup: { clientFiles: ["./src/app.ts", "./src/arena/main.ts", "./src/dungeon/main.ts", "./src/core-lab/main.ts"] },
  },
  // MuJoCo ships its .wasm beside its ESM bundle; Vite must not try to inline it.
  assetsInclude: ["**/*.wasm"],
  // MuJoCo's threaded build starts its pthreads as module workers of its own ES module (top-level
  // await included), which the default `iife` worker format cannot bundle. No other page makes a worker.
  worker: { format: "es" },
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 4096,
    // Every page is named here: Vite's default is `index.html` alone, so another page works in dev,
    // where every request is served from source, and is absent from `dist`.
    // `physics-bench.html` is the physics bake-off (`research/physics-bakeoff/REPORT.md`).
    rollupOptions: { input: { index: "index.html", characterLab: "character-lab.html", physicsBench: "physics-bench.html" } },
  },
});
