import { defineConfig, type Plugin } from "vite";
import { currentBuildIdentity } from "./scripts/build-identity.mjs";

const identityModule = decodeURIComponent(new URL("./src/build-identity.ts", import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, "$1");

/** The build's identity in its module, as Node reads it: the page's bundle and the world worker's each load it. */
const identity = (): Plugin => ({ name: "recording-build-identity", enforce: "pre",
  load(id) {
    // The identity as Node reads it.
    if (id.replaceAll("\\", "/") === identityModule) return `export const BUILD_IDENTITY = ${JSON.stringify(currentBuildIdentity())};\n`;
  },
  handleHotUpdate(context) {
    const module = [...context.server.moduleGraph.idToModuleMap.values()].find(module => module.file?.replaceAll("\\", "/") === identityModule);
    if (module) context.server.moduleGraph.invalidateModule(module);
    // A running world and its recordings belong to one immutable source snapshot.
    context.server.ws.send({ type: "full-reload" });
    return [];
  },
});

export default defineConfig({
  plugins: [identity()],
  // strictPort: when 5180 is taken, usually by a forgotten dev server, fail rather than move to
  // 5181 and leave the old server's stale build on the address you are reading.
  server: {
    port: 5180, strictPort: true,
    // Research runs, toolchains and disposable work (`.tmp`, worktrees among it) are not browser
    // source. Watching them costs needless invalidations; on Windows an archive being extracted can
    // fail the watcher with EBUSY, and crawling `.tools` (toolchains, tens of thousands of files)
    // starves the server for minutes at startup. The watcher does not read `.gitignore`.
    watch: { ignored: ["**/research/runs/**", "**/.tools/**", "**/.tmp/**", "**/.cache/art/**"] },
    // Transform the browser entry graphs at server startup, before navigation
    // has to discover and wait on each level of their imports.
    warmup: { clientFiles: ["./src/app.ts", "./src/arena/main.ts", "./src/dungeon/main.ts", "./src/lab/main.ts"] },
  },
  // MuJoCo ships its .wasm beside its ESM bundle; Vite must not try to inline it.
  assetsInclude: ["**/*.wasm"],
  // MuJoCo's threaded build starts its pthreads as module workers of its own ES module (top-level
  // await included), which the default `iife` worker format cannot bundle; the world's worker
  // (`src/worker/world.worker.ts`) loads its engine and minds' data as chunks, which it cannot either.
  worker: { format: "es", plugins: () => [identity()] },
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 4096,
    // Every page is named here: Vite's default is `index.html` alone, so another page works in dev,
    // where every request is served from source, and is absent from `dist`.
    // `physics-bench.html` is the physics bake-off (`research/physics-bakeoff/REPORT.md`).
    rollupOptions: { input: { index: "index.html", characterLab: "character-lab.html", physicsBench: "physics-bench.html",
      controlFoundation: "control-foundation.html", controlTasks: "control-tasks.html" } },
  },
});
