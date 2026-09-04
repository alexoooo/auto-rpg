import { defineConfig } from "vite";

export default defineConfig({
  // strictPort matters more than it looks. Without it Vite silently moves to
  // 5181 when 5180 is taken -- usually by an earlier dev server nobody noticed
  // was still alive -- and you end up reading a stale build while editing a live
  // one. Failing loudly is the whole point.
  server: { port: 5180, strictPort: true },
  // Havok ships a .wasm beside its ESM bundle; Vite must not try to inline it.
  assetsInclude: ["**/*.wasm"],
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 4096,
    // Two entries, and both have to be named. Vite's default is `index.html` alone, so a
    // second page builds fine in dev -- where every request is served from source -- and is
    // simply absent from `dist`, which is the failure that looks like a routing problem and is
    // a config one. `bench.html` is the golem effector bench.
    rollupOptions: { input: { index: "index.html", bench: "bench.html" } },
  },
});
