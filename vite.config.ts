import { createReadStream, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, normalizePath, type Plugin } from "vite";

const repositoryRoot = fileURLToPath(new URL(".", import.meta.url));
const webRoot = resolve(repositoryRoot, "web");
const clientRoot = normalizePath(resolve(repositoryRoot, "client/src"));
const outputRoot = resolve(repositoryRoot, "dist");
const wasmArtifact = resolve(repositoryRoot, "target/wasm32-unknown-unknown/release/web.wasm");
const roomAssetRoot = resolve(webRoot, "assets3d");
const roomRuntimeAssets = Object.freeze([
  { url: "/assets3d/room_slice.glb", file: "room_slice.glb", type: "model/gltf-binary", output: "glb" },
  { url: "/assets3d/room_slice.json", file: "room_slice.json", type: "application/json; charset=utf-8", output: "sidecar" },
] as const);

function sha256(file: string): string {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function roomManifest() {
  const file = resolve(repositoryRoot, "tools/art/manifest.json");
  const value = JSON.parse(readFileSync(file, "utf8")) as {
    outputs?: Record<string, { path?: string; sha256?: string }>;
  };
  for (const asset of roomRuntimeAssets) {
    const output = value.outputs?.[asset.output];
    if (output?.path !== `web/assets3d/${asset.file}` || !/^[0-9a-f]{64}$/.test(output.sha256 ?? "")) {
      throw new Error(`room manifest does not pin ${asset.file}`);
    }
  }
  const validator = value.outputs?.validator;
  if (validator?.path !== "web/assets3d/room_slice.validator.json" || !/^[0-9a-f]{64}$/.test(validator.sha256 ?? "")) {
    throw new Error("room manifest does not pin room_slice.validator.json");
  }
  return value as { outputs: Record<string, { path: string; sha256: string }> };
}

function generatedRoomPins(): Record<"fixture" | "buildInputs" | "sidecar" | "glb" | "validator", string> {
  const source = readFileSync(resolve(clientRoot, "render/room-asset.generated.ts"), "utf8");
  const pin = (name: string): string => {
    const match = new RegExp(`export const ${name} = "([0-9a-f]{64})" as const;`).exec(source);
    if (match?.[1] === undefined) throw new Error(`generated room pin ${name} is missing`);
    return match[1];
  };
  const fixture = /export const ROOM_FIXTURE_ID = "([^"]+)" as const;/.exec(source)?.[1];
  if (fixture !== "v2-room-slice-1") throw new Error("generated room fixture identity is invalid");
  return { fixture, buildInputs: pin("ROOM_BUILD_INPUTS_SHA256"),
    sidecar: pin("ROOM_SIDECAR_SHA256"), glb: pin("ROOM_GLB_SHA256"),
    validator: pin("ROOM_VALIDATOR_SHA256") };
}

function verifyRoomAsset(file: string, kind: "glb" | "sidecar"): void {
  if (!existsSync(file)) throw new Error(`missing representative room asset: ${file}`);
  const bytes = readFileSync(file);
  if (kind === "glb") {
    if (bytes.length < 12 || bytes.subarray(0, 4).toString("ascii") !== "glTF" || bytes.readUInt32LE(4) !== 2 ||
        bytes.readUInt32LE(8) !== bytes.length) throw new Error("representative room GLB has invalid magic, version, or length");
  } else {
    const value = JSON.parse(bytes.toString("utf8")) as { schemaVersion?: unknown; fixtureId?: unknown };
    if (value.schemaVersion !== 1 || value.fixtureId !== "v2-room-slice-1") {
      throw new Error("representative room sidecar has an invalid schema identity");
    }
  }
}

function wasmArtifactPlugin(): Plugin {
  return {
    name: "auto-rpg-wasm-artifact",
    configureServer(server) {
      // Vite's repository-root fs allowance is required by /client-src, but it also
      // makes reviewed build evidence addressable through /@fs. The validator is
      // deliberately not a runtime input, including during development.
      server.middlewares.use((request, response, next) => {
        let pathname: string;
        try {
          pathname = decodeURIComponent(new URL(request.url ?? "/", "http://vite.invalid").pathname)
            .replaceAll("\\", "/").toLowerCase();
        } catch {
          next();
          return;
        }
        if (pathname.endsWith("/web/assets3d/room_slice.validator.json")) {
          response.statusCode = 404;
          response.end("Room validation evidence is not a runtime asset.\n");
          return;
        }
        next();
      });
      server.middlewares.use("/web.wasm", (_request, response) => {
        if (!existsSync(wasmArtifact)) {
          response.statusCode = 404;
          response.end("Build the release wasm artifact before opening /v2.html.\n");
          return;
        }
        response.setHeader("Content-Type", "application/wasm");
        createReadStream(wasmArtifact).pipe(response);
      });
      for (const asset of roomRuntimeAssets) {
        server.middlewares.use(asset.url, (request, response, next) => {
          if (request.url !== undefined && request.url !== "/" && request.url !== "") {
            next();
            return;
          }
          const file = resolve(roomAssetRoot, asset.file);
          if (!existsSync(file)) {
            response.statusCode = 404;
            response.end(`Missing generated room asset ${asset.file}.\n`);
            return;
          }
          response.setHeader("Content-Type", asset.type);
          response.setHeader("Content-Length", String(readFileSync(file).byteLength));
          createReadStream(file).pipe(response);
        });
      }
      server.middlewares.use("/assets3d", (_request, response) => {
        response.statusCode = 404;
        response.end("Unknown runtime room asset.\n");
      });
    },
    closeBundle() {
      if (!existsSync(wasmArtifact)) throw new Error(`missing release wasm artifact: ${wasmArtifact}`);
      copyFileSync(wasmArtifact, resolve(outputRoot, "web.wasm"));

      const manifest = roomManifest();
      const pins = generatedRoomPins();
      const roomOutputRoot = resolve(outputRoot, "assets3d");
      mkdirSync(roomOutputRoot, { recursive: true });
      for (const asset of roomRuntimeAssets) {
        const source = resolve(roomAssetRoot, asset.file);
        verifyRoomAsset(source, asset.output);
        if (sha256(source) !== manifest.outputs[asset.output]?.sha256 ||
            sha256(source) !== pins[asset.output]) {
          throw new Error(`representative room ${asset.file} differs from its manifest SHA-256`);
        }
        copyFileSync(source, resolve(roomOutputRoot, asset.file));
      }
      const sidecar = JSON.parse(readFileSync(resolve(roomAssetRoot, "room_slice.json"), "utf8")) as {
        fixtureId?: string; buildInputsSha256?: string;
      };
      if (sidecar.fixtureId !== pins.fixture || sidecar.buildInputsSha256 !== pins.buildInputs) {
        throw new Error("representative room sidecar differs from its generated identity pins");
      }
      const copiedRoomAssets = readdirSync(roomOutputRoot).sort();
      if (copiedRoomAssets.join(",") !== "room_slice.glb,room_slice.json") {
        throw new Error(`production room asset allowlist drifted: ${copiedRoomAssets.join(", ")}`);
      }
      const validator = resolve(roomAssetRoot, "room_slice.validator.json");
      if (!existsSync(validator) || sha256(validator) !== manifest.outputs.validator?.sha256 ||
          sha256(validator) !== pins.validator) {
        throw new Error("representative room validator report differs from its reviewed pins");
      }

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
