import { defineConfig } from "vite";

export default defineConfig({
  server: { port: 5180 },
  // Havok ships a .wasm beside its ESM bundle; Vite must not try to inline it.
  assetsInclude: ["**/*.wasm"],
  build: { target: "es2022", chunkSizeWarningLimit: 4096 },
});
