import { createReadStream, copyFileSync, existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, normalizePath, type Plugin } from "vite";

const repositoryRoot = fileURLToPath(new URL(".", import.meta.url));
const webRoot = resolve(repositoryRoot, "web");
const clientRoot = normalizePath(resolve(repositoryRoot, "client/src"));
const outputRoot = resolve(repositoryRoot, "dist");
const wasmArtifact = resolve(repositoryRoot, "target/wasm32-unknown-unknown/release/web.wasm");

function wasmArtifactPlugin(): Plugin {
  return {
    name: "auto-rpg-wasm-artifact",
    configureServer(server) {
      server.middlewares.use("/web.wasm", (_request, response) => {
        if (!existsSync(wasmArtifact)) {
          response.statusCode = 404;
          response.end("Build the release wasm artifact before opening /v2.html.\n");
          return;
        }
        response.setHeader("Content-Type", "application/wasm");
        createReadStream(wasmArtifact).pipe(response);
      });
    },
    closeBundle() {
      if (!existsSync(wasmArtifact)) throw new Error(`missing release wasm artifact: ${wasmArtifact}`);
      copyFileSync(wasmArtifact, resolve(outputRoot, "web.wasm"));

      const htmlPath = resolve(outputRoot, "v2.html");
      if (!existsSync(htmlPath)) throw new Error("Vite did not emit dist/v2.html");
      const html = readFileSync(htmlPath, "utf8");
      const mainMatch = html.match(/<script[^>]+src="\/([^\"]+\.js)"/);
      if (!mainMatch?.[1]) throw new Error("dist/v2.html does not name its client chunk");
      const mainPath = resolve(outputRoot, mainMatch[1]);
      const mainCode = readFileSync(mainPath, "utf8");
      if (mainCode.includes("WebAssembly.instantiate")) {
        throw new Error("the v2 main-thread chunk instantiates WebAssembly");
      }

      const emittedAssets = readdirSync(resolve(outputRoot, "assets"));
      const rawTypeScript = emittedAssets.filter((name) => name.endsWith(".ts") || name.endsWith(".tsx"));
      if (rawTypeScript.length !== 0) {
        throw new Error(`Vite emitted raw TypeScript: ${rawTypeScript.join(", ")}`);
      }
      const scripts = emittedAssets
        .filter((name) => /-[A-Za-z0-9_-]{8,}\.js$/.test(name));
      if (scripts.length < 2) throw new Error("Vite did not emit separate hashed client and worker chunks");
      const workerExists = scripts.some((name) => {
        if (resolve(outputRoot, "assets", name) === mainPath) return false;
        const code = readFileSync(resolve(outputRoot, "assets", name), "utf8");
        return code.includes("WebAssembly.instantiate") && code.includes("web.wasm");
      });
      if (!workerExists) throw new Error("no emitted worker chunk owns the wasm instantiation");
    },
  };
}

export default defineConfig({
  root: webRoot,
  // The worker fetches `/web.wasm`; v2 is deliberately a root-hosted diagnostic,
  // so its HTML and hashed assets use the same absolute-origin contract.
  base: "/",
  publicDir: false,
  resolve: {
    // The HTML lives under `web/`, but the module graph deliberately does not.
    // A browser normalizes `../client` to `/client` before Vite can resolve it;
    // this stable URL keeps dev and build on the same explicit filesystem alias.
    alias: [{ find: "/client-src", replacement: clientRoot }],
  },
  server: { fs: { allow: [repositoryRoot] } },
  plugins: [wasmArtifactPlugin()],
  build: {
    outDir: outputRoot,
    emptyOutDir: true,
    rollupOptions: { input: resolve(webRoot, "v2.html") },
  },
});
