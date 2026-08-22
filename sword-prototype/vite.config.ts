import { defineConfig } from "vite";

export default defineConfig({
  // strictPort matters more than it looks. Without it Vite silently moves to
  // 5181 when 5180 is taken -- usually by an earlier dev server nobody noticed
  // was still alive -- and you end up reading a stale build while editing a live
  // one. Failing loudly is the whole point.
  server: { port: 5180, strictPort: true },
  // Havok ships a .wasm beside its ESM bundle; Vite must not try to inline it.
  assetsInclude: ["**/*.wasm"],
  build: { target: "es2022", chunkSizeWarningLimit: 4096 },
});
