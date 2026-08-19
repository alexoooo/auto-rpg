import { createReadStream, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, normalizePath, type Plugin } from "vite";
// One walker, shared with `render-contract.test.mjs` on purpose: the build
// assertion below and the test's are the same claim about the same graph, and
// two copies would eventually be two claims that both pass about different ones.
// It lives in `tools/` beside the other build-adjacent checkers rather than in
// the test tree, because this file importing out of `client/test/` pointed build
// configuration at tests to reach the one copy.
import { eagerChunks, readChunks, staticImportClosure, WASM_INSTANTIATION } from "./tools/chunk-graph.mjs";

const repositoryRoot = fileURLToPath(new URL(".", import.meta.url));
const webRoot = resolve(repositoryRoot, "web");
const clientRoot = normalizePath(resolve(repositoryRoot, "client/src"));
const outputRoot = resolve(repositoryRoot, "dist");
const wasmArtifact = resolve(repositoryRoot, "target/wasm32-unknown-unknown/release/web.wasm");
const roomAssetRoot = resolve(webRoot, "assets3d");
// The trained fighter, fetched rather than embedded in the wasm. v2-ui-08 made
// that choice deliberately: a checkpoint *is* a fighter, so the studio should be
// able to put a different one in the ring without a Rust rebuild, and 15 KB
// beside an 8 MB trace is nothing. `crates/web`'s `checkpoint_ptr` buffer takes
// the bytes and `load_checkpoint` judges them.
//
// One file and not the directory. On a clean clone `checkpoints/` holds exactly
// this artifact -- `checkpoints/*.log` is in `.gitignore` -- but a working tree
// that has run `lab learn-probe` also holds `train.log`, `evaluate.log` and
// `verify.log`, and a second `.ckpt` the moment anybody trains one. Serving a
// directory would put whichever of those a developer happens to have on the
// origin. The room assets one block up keep an allowlist for the same reason
// and this follows it.
const checkpointRoot = resolve(repositoryRoot, "checkpoints");
const shippedCheckpoint = Object.freeze({
  url: "/checkpoints/v2-probe.ckpt",
  file: "v2-probe.ckpt",
  type: "application/octet-stream",
} as const);
// `learn_core::CHECKPOINT_MAGIC`. Checked before shipping on `verifyRoomAsset`'s
// argument: the module refuses a file that is not a checkpoint and answers a
// reason code, and a build that shipped one anyway would move that failure from
// here to a reader's console.
const CHECKPOINT_MAGIC = "ARPGLRN1";
const roomRuntimeAssets = Object.freeze([
  { url: "/assets3d/room_slice.glb", file: "room_slice.glb", type: "model/gltf-binary", output: "glb" },
  { url: "/assets3d/room_slice.json", file: "room_slice.json", type: "application/json; charset=utf-8", output: "sidecar" },
] as const);
const roomTextureRuntimeAssets = Object.freeze([
  { url: "/assets3d/room_vfx_decal_atlas.png", file: "room_vfx_decal_atlas.png",
    type: "image/png", manifest: "vfxDecals" },
  { url: "/assets3d/room_vfx_flame.png", file: "room_vfx_flame.png",
    type: "image/png", manifest: "vfxFlame" },
] as const);
const combatantRuntimeAssets = Object.freeze([
  { url: "/assets3d/combatants.glb", file: "combatants.glb", type: "model/gltf-binary", output: "glb" },
  { url: "/assets3d/combatants.json", file: "combatants.json", type: "application/json; charset=utf-8", output: "sidecar" },
] as const);

function sha256(file: string): string {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function roomManifest() {
  const file = resolve(repositoryRoot, "tools/art/manifest.json");
  const value = JSON.parse(readFileSync(file, "utf8")) as {
    outputs?: Record<string, { path?: string; sha256?: string }>;
    runtimeTextures?: Record<string, { runtimePath?: string; sha256?: string }>;
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
  for (const asset of roomTextureRuntimeAssets) {
    const texture = value.runtimeTextures?.[asset.manifest];
    if (texture?.runtimePath !== `web/assets3d/${asset.file}` ||
        !/^[0-9a-f]{64}$/.test(texture.sha256 ?? "")) {
      throw new Error(`room manifest does not pin ${asset.file}`);
    }
  }
  return value as {
    outputs: Record<string, { path: string; sha256: string }>;
    runtimeTextures: Record<string, { runtimePath: string; sha256: string }>;
  };
}

function combatantManifest() {
  const file = resolve(repositoryRoot, "tools/art/combatants-manifest.json");
  const value = JSON.parse(readFileSync(file, "utf8")) as {
    outputs?: Record<string, { path?: string; sha256?: string }>;
  };
  for (const asset of combatantRuntimeAssets) {
    const output = value.outputs?.[asset.output];
    if (output?.path !== `web/assets3d/${asset.file}` || !/^[0-9a-f]{64}$/.test(output.sha256 ?? "")) {
      throw new Error(`combatant manifest does not pin ${asset.file}`);
    }
  }
  const validator = value.outputs?.validator;
  if (validator?.path !== "web/assets3d/combatants.validator.json" ||
      !/^[0-9a-f]{64}$/.test(validator.sha256 ?? "")) {
    throw new Error("combatant manifest does not pin combatants.validator.json");
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

function generatedCombatantPins(): Record<"fixture" | "buildInputs" | "sidecar" | "glb" | "validator", string> {
  const source = readFileSync(resolve(clientRoot, "render/combatant-asset.generated.ts"), "utf8");
  const pin = (name: string): string => {
    const match = new RegExp(`export const ${name} = "([0-9a-f]{64})" as const;`).exec(source);
    if (match?.[1] === undefined || /^0{64}$/.test(match[1])) {
      throw new Error(`generated combatant pin ${name} is missing`);
    }
    return match[1];
  };
  const fixture = /export const COMBATANT_FIXTURE_ID = "([^"]+)" as const;/.exec(source)?.[1];
  if (fixture !== "v2-combatants-2") throw new Error("generated combatant fixture identity is invalid");
  return { fixture, buildInputs: pin("COMBATANT_BUILD_INPUTS_SHA256"),
    sidecar: pin("COMBATANT_SIDECAR_SHA256"), glb: pin("COMBATANT_GLB_SHA256"),
    validator: pin("COMBATANT_VALIDATOR_SHA256") };
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

function verifyCombatantAsset(file: string, kind: "glb" | "sidecar"): void {
  if (!existsSync(file)) throw new Error(`missing representative combatant asset: ${file}`);
  const bytes = readFileSync(file);
  if (kind === "glb") {
    if (bytes.length < 12 || bytes.subarray(0, 4).toString("ascii") !== "glTF" ||
        bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length) {
      throw new Error("representative combatant GLB has invalid magic, version, or length");
    }
  } else {
    const value = JSON.parse(bytes.toString("utf8")) as { schemaVersion?: unknown; fixtureId?: unknown };
    if (value.schemaVersion !== 2 || value.fixtureId !== "v2-combatants-2") {
      throw new Error("representative combatant sidecar has an invalid schema identity");
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
        if (pathname.endsWith("/web/assets3d/room_slice.validator.json") ||
            pathname.endsWith("/web/assets3d/combatants.validator.json")) {
          response.statusCode = 404;
          response.end("Room validation evidence is not a runtime asset.\n");
          return;
        }
        next();
      });
      server.middlewares.use("/web.wasm", (_request, response) => {
        if (!existsSync(wasmArtifact)) {
          response.statusCode = 404;
          response.end("Build the release wasm artifact before opening the studio.\n");
          return;
        }
        response.setHeader("Content-Type", "application/wasm");
        // **`Content-Length`, which this handler used to omit**, and the room
        // asset handler below has always set. Without it the response is
        // chunked, so a keep-alive client cannot know the body ended until the
        // socket does -- and Node's global `fetch` agent holds that socket open
        // afterwards. `vite_dev_serves_the_studio_shell_its_game_route_and_the_wasm_from_the_web_root`
        // fetches this URL and then closes the server, and the leftover socket
        // kept the whole test process alive on about half of its runs: the test
        // passed every time and `npm run test:worker` reported a failure anyway,
        // which is the worst shape a flake can have.
        response.setHeader("Content-Length", String(statSync(wasmArtifact).size));
        createReadStream(wasmArtifact).pipe(response);
      });
      for (const asset of [...roomRuntimeAssets, ...roomTextureRuntimeAssets,
        ...combatantRuntimeAssets]) {
        server.middlewares.use(asset.url, (request, response, next) => {
          if (request.url !== undefined && request.url !== "/" && request.url !== "") {
            next();
            return;
          }
          const file = resolve(roomAssetRoot, asset.file);
          if (!existsSync(file)) {
            response.statusCode = 404;
            response.end(`Missing generated runtime asset ${asset.file}.\n`);
            return;
          }
          response.setHeader("Content-Type", asset.type);
          response.setHeader("Content-Length", String(readFileSync(file).byteLength));
          createReadStream(file).pipe(response);
        });
      }
      server.middlewares.use("/assets3d", (_request, response) => {
        response.statusCode = 404;
        response.end("Unknown runtime authored asset.\n");
      });
      server.middlewares.use(shippedCheckpoint.url, (request, response, next) => {
        if (request.url !== undefined && request.url !== "/" && request.url !== "") {
          next();
          return;
        }
        const file = resolve(checkpointRoot, shippedCheckpoint.file);
        if (!existsSync(file)) {
          response.statusCode = 404;
          response.end(`Missing ${shippedCheckpoint.file}; train one with lab learn-probe.\n`);
          return;
        }
        response.setHeader("Content-Type", shippedCheckpoint.type);
        response.setHeader("Content-Length", String(readFileSync(file).byteLength));
        createReadStream(file).pipe(response);
      });
      // Everything else under `checkpoints/` is evidence rather than a runtime
      // asset, and the training logs in particular are quoted in plans and
      // should not become addressable because they share a directory with the
      // one file that is.
      server.middlewares.use("/checkpoints", (_request, response) => {
        response.statusCode = 404;
        response.end("Unknown runtime checkpoint.\n");
      });
    },
    closeBundle() {
      if (!existsSync(wasmArtifact)) throw new Error(`missing release wasm artifact: ${wasmArtifact}`);
      copyFileSync(wasmArtifact, resolve(outputRoot, "web.wasm"));

      const manifest = roomManifest();
      const pins = generatedRoomPins();
      const combatants = combatantManifest();
      const combatantPins = generatedCombatantPins();
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
      for (const asset of roomTextureRuntimeAssets) {
        const source = resolve(roomAssetRoot, asset.file);
        if (sha256(source) !== manifest.runtimeTextures[asset.manifest]?.sha256) {
          throw new Error(`representative room ${asset.file} differs from its manifest SHA-256`);
        }
        copyFileSync(source, resolve(roomOutputRoot, asset.file));
      }
      for (const asset of combatantRuntimeAssets) {
        const source = resolve(roomAssetRoot, asset.file);
        verifyCombatantAsset(source, asset.output);
        if (sha256(source) !== combatants.outputs[asset.output]?.sha256 ||
            sha256(source) !== combatantPins[asset.output]) {
          throw new Error(`representative combatant ${asset.file} differs from its manifest SHA-256`);
        }
        copyFileSync(source, resolve(roomOutputRoot, asset.file));
      }
      const sidecar = JSON.parse(readFileSync(resolve(roomAssetRoot, "room_slice.json"), "utf8")) as {
        fixtureId?: string; buildInputsSha256?: string;
      };
      if (sidecar.fixtureId !== pins.fixture || sidecar.buildInputsSha256 !== pins.buildInputs) {
        throw new Error("representative room sidecar differs from its generated identity pins");
      }
      const combatantSidecar = JSON.parse(readFileSync(resolve(roomAssetRoot, "combatants.json"), "utf8")) as {
        fixtureId?: string; buildInputsSha256?: string;
      };
      if (combatantSidecar.fixtureId !== combatantPins.fixture ||
          combatantSidecar.buildInputsSha256 !== combatantPins.buildInputs) {
        throw new Error("representative combatant sidecar differs from its generated identity pins");
      }
      const copiedRoomAssets = readdirSync(roomOutputRoot).sort();
      if (copiedRoomAssets.join(",") !==
          "combatants.glb,combatants.json,room_slice.glb,room_slice.json," +
          "room_vfx_decal_atlas.png,room_vfx_flame.png") {
        throw new Error(`production room asset allowlist drifted: ${copiedRoomAssets.join(", ")}`);
      }
      const checkpoint = resolve(checkpointRoot, shippedCheckpoint.file);
      if (!existsSync(checkpoint)) throw new Error(`missing shipped checkpoint: ${checkpoint}`);
      const checkpointBytes = readFileSync(checkpoint);
      if (checkpointBytes.subarray(0, 8).toString("ascii") !== CHECKPOINT_MAGIC) {
        throw new Error("the shipped checkpoint does not start with ARPGLRN1");
      }
      const checkpointOutputRoot = resolve(outputRoot, "checkpoints");
      mkdirSync(checkpointOutputRoot, { recursive: true });
      copyFileSync(checkpoint, resolve(checkpointOutputRoot, shippedCheckpoint.file));
      const copiedCheckpoints = readdirSync(checkpointOutputRoot).sort();
      if (copiedCheckpoints.join(",") !== shippedCheckpoint.file) {
        throw new Error(`production checkpoint allowlist drifted: ${copiedCheckpoints.join(", ")}`);
      }

      const validator = resolve(roomAssetRoot, "room_slice.validator.json");
      if (!existsSync(validator) || sha256(validator) !== manifest.outputs.validator?.sha256 ||
          sha256(validator) !== pins.validator) {
        throw new Error("representative room validator report differs from its reviewed pins");
      }
      const combatantValidator = resolve(roomAssetRoot, "combatants.validator.json");
      if (!existsSync(combatantValidator) ||
          sha256(combatantValidator) !== combatants.outputs.validator?.sha256 ||
          sha256(combatantValidator) !== combatantPins.validator) {
        throw new Error("representative combatant validator report differs from its reviewed pins");
      }

      const htmlPath = resolve(outputRoot, "index.html");
      if (!existsSync(htmlPath)) throw new Error("Vite did not emit dist/index.html");
      const html = readFileSync(htmlPath, "utf8");

      const chunkRoot = resolve(outputRoot, "assets");
      const rawTypeScript = readdirSync(chunkRoot).filter((name) => name.endsWith(".ts") || name.endsWith(".tsx"));
      if (rawTypeScript.length !== 0) {
        throw new Error(`Vite emitted raw TypeScript: ${rawTypeScript.join(", ")}`);
      }

      // The main thread never instantiates WebAssembly, and exactly one separate
      // worker chunk does.
      //
      // This used to read the single `<script src>` out of the HTML and grep that
      // one chunk, which was the whole main thread while the entry owned every
      // module. `client/src/studio.ts` has no static imports -- every route is a
      // bare `import()` -- so the entry chunk is now a ~3.5 KB router and the game
      // code lives in lazy chunks the grep never opened; from that commit the
      // assertion passed no matter what any route did. Its companion failed the
      // same way: excluding only the entry chunk meant wasm glue statically
      // imported into a route would satisfy the worker check *and* leave the
      // main-thread grep clean. The property is about a closure and not a file, so
      // what is checked now is the closure. See `tools/chunk-graph.mjs`.
      const chunks = readChunks(chunkRoot);
      const instantiators = [...chunks].filter(([, code]) => WASM_INSTANTIATION.test(code)).map(([name]) => name);
      if (instantiators.length !== 1) {
        throw new Error(`exactly one emitted chunk may instantiate WebAssembly, but ${instantiators.length} do: ` +
          `${instantiators.join(", ") || "none"}`);
      }
      const worker = instantiators[0] as string;
      if (!(chunks.get(worker) ?? "").includes("web.wasm")) {
        throw new Error(`${worker} instantiates WebAssembly without naming web.wasm, so it is not the sim worker`);
      }
      const eager = eagerChunks(html);
      if (eager.size === 0) throw new Error("dist/index.html names no client chunk");
      if (staticImportClosure(chunks, eager).has(worker)) {
        throw new Error(`dist/index.html statically reaches ${worker}, so the wasm worker runs on the main thread`);
      }
    },
  };
}

export default defineConfig({
  root: webRoot,
  // The worker fetches `/web.wasm`; the studio is deliberately root-hosted, so its
  // HTML and hashed assets use the same absolute-origin contract.
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
    // One entry, and now the only one there could be. `legacy.html` was never in
    // this list either: four classic scripts sharing top-level `const`s are not a
    // module graph, so Rollup had nothing to do with them and the page was served
    // as static files instead. That is why retiring it changed nothing here -- it
    // was already outside every build, which was most of the argument for retiring
    // it.
    rollupOptions: { input: resolve(webRoot, "index.html") },
  },
});
