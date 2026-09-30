import { defineConfig } from "vite";

export default defineConfig({
  // strictPort matters more than it looks. Without it Vite silently moves to
  // 5181 when 5180 is taken -- usually by an earlier dev server nobody noticed
  // was still alive -- and you end up reading a stale build while editing a live
  // one. Failing loudly is the whole point.
  server: {
    port: 5180, strictPort: true,
    // Research logs and isolated regression archives are not browser source. Besides needless
    // invalidations, watching a Windows archive while it is extracted can fail with EBUSY.
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
