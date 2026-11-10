import { defineConfig, type Plugin } from "vite";
import { currentBuildIdentity } from "./scripts/build-identity.mjs";

const sourcePath = (file: string): string => decodeURIComponent(new URL(file, import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, "$1");
const identityModules = ["./src/app/node/build-identity.ts", "./src/app/browser/build-identity.ts"].map(sourcePath);

/** The build's identity in its module, as Node reads it: the page's bundle and the world worker's each load it. */
const identity = (): Plugin => ({ name: "recording-build-identity", enforce: "pre",
  load(id) {
    // The identity as Node reads it.
    if (identityModules.includes(id.replaceAll("\\", "/"))) return `export const BUILD_IDENTITY = ${JSON.stringify(currentBuildIdentity())};\n`;
  },
  handleHotUpdate(context) {
    for (const module of context.server.moduleGraph.idToModuleMap.values()) if (module.file && identityModules.includes(module.file.replaceAll("\\", "/"))) context.server.moduleGraph.invalidateModule(module);
    // A running world and its recordings belong to one immutable source snapshot.
    context.server.ws.send({ type: "full-reload" });
    return [];
  },
});

/**
 * Cross-origin isolation, so a fight's minds may share memory with their workers
 * (`pageMinds`, `src/app/browser/worker/minds.ts`); a host that sets no headers gets them from `coi-sw.js`
 * (`src/app/browser/isolate.ts`).
 */
const ISOLATED = { "Cross-Origin-Opener-Policy": "same-origin", "Cross-Origin-Embedder-Policy": "require-corp" };

export default defineConfig({
  root: "src/app/browser",
  publicDir: "../../../public",
  plugins: [identity()],
  // strictPort: when 5180 is taken, usually by a forgotten dev server, fail rather than move to
  // 5181 and leave the old server's stale build on the address you are reading.
  server: {
    port: 5180, strictPort: true, headers: ISOLATED,
    // Research runs, toolchains and disposable work (`.tmp`, worktrees among it) are not browser
    // source. Watching them costs needless invalidations; on Windows an archive being extracted can
    // fail the watcher with EBUSY, and crawling `.tools` (toolchains, tens of thousands of files)
    // starves the server for minutes at startup. The watcher does not read `.gitignore`.
    watch: { ignored: ["**/research/runs/**", "**/.tools/**", "**/.tmp/**", "**/.cache/art/**"] },
    // Transform the browser entry graphs at server startup, before navigation
    // has to discover and wait on each level of their imports.
    warmup: { clientFiles: ["./app.ts", "./arena/main.ts", "./dungeon/main.ts", "./lab/main.ts"] },
  },
  preview: { headers: ISOLATED },
  // MuJoCo ships its .wasm beside its ESM bundle; Vite must not try to inline it.
  assetsInclude: ["**/*.wasm"],
  // MuJoCo's threaded build starts its pthreads as module workers of its own ES module (top-level
  // await included), which the default `iife` worker format cannot bundle; the world's worker
  // (`src/app/browser/worker/world.worker.ts`) loads its engine and minds' data as chunks, which it cannot either.
  worker: { format: "es", plugins: () => [identity()] },
  build: {
    outDir: "../../../dist",
    emptyOutDir: true,
    target: "es2022",
    chunkSizeWarningLimit: 4096,
    // Every page is named here; absolute paths also resolve in the dev dependency scanner.
    rollupOptions: { input: {
      index: sourcePath("./src/app/browser/index.html"),
      characterLab: sourcePath("./src/app/browser/character-lab/index.html"),
      physicsBench: sourcePath("./src/app/browser/physics-bench/index.html"),
    } },
  },
});
