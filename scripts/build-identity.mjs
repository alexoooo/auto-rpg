import { createHash } from "node:crypto";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { resolve, relative, extname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
/** What runs of a build write, not what makes it: a file by its path, or a folder and all under it by its path and a slash. */
const OUTPUTS = Object.freeze(["assets/minds/notes.json", "assets/evaluations/", "public/assets/generated/"]);
const isOutput = path => OUTPUTS.some(output => output.endsWith("/") ? `${path}/`.startsWith(output) : path === output);
const TEXT = new Set([".ts", ".mts", ".mjs", ".cjs", ".js", ".json", ".css", ".html", ".svg", ".wgsl", ".glsl", ".sh", ".patch"]);

/** Canonical input bytes include untracked source; checkout line endings do not distinguish builds. */
export function hashBuildInputs(root, files) {
  const hash = createHash("sha256").update("auto-rpg-build/1\0");
  for (const file of [...files].sort()) {
    const bytes = readFileSync(resolve(root, file));
    const content = TEXT.has(extname(file)) ? Buffer.from(bytes.toString("utf8").replace(/\r\n/g, "\n")) : bytes;
    hash.update(file.replaceAll("\\", "/") + "\0" + content.length + "\0").update(content);
  }
  return `sha256:${hash.digest("hex")}`;
}

/** What identifies a build, by path: runtime code, input assets, dependency lock and the installed solver. */
function buildInputs() {
  const files = ["package.json", "package-lock.json", "vite.config.ts", "tsconfig.json"];
  for (const entry of readdirSync(ROOT, { withFileTypes: true })) if (entry.isFile() && entry.name.endsWith(".html")) files.push(entry.name);
  const walk = (directory, codeOnly = false) => {
    if (!existsSync(resolve(ROOT, directory))) return;
    for (const entry of readdirSync(resolve(ROOT, directory), { withFileTypes: true })) {
      if (entry.name === "__pycache__" || /\.py[co]$/.test(entry.name)) continue;
      const file = `${directory}/${entry.name}`;
      if (entry.isDirectory() && file !== "research/runs" && !isOutput(file)) walk(file, codeOnly);
      else if (entry.isFile() && !isOutput(file) &&(!codeOnly || [".ts", ".mjs", ".js"].includes(extname(file)))) files.push(file);
    }
  };
  for (const directory of ["src", "assets", "public", "scripts"]) walk(directory);
  for (const entry of readdirSync(resolve(ROOT, "vendor/rapier"), { withFileTypes: true })) if (entry.isFile() && !entry.name.endsWith(".md")) files.push(`vendor/rapier/${entry.name}`);
  const solver = "node_modules/@dimforge/rapier3d-simd-compat";
  for (const file of ["package.json", "dist/rapier.mjs", "dist/rapier_wasm3d.js", "dist/rapier_wasm3d_bg.wasm"]) files.push(`${solver}/${file}`);
  walk("research", true);
  walk("tests/harness", true);
  return files.map(file => relative(ROOT, resolve(ROOT, file)).replaceAll("\\", "/"));
}

/** Runtime code, input assets, dependency lock and the actual installed solver identify a build. */
export const currentBuildIdentity = () => hashBuildInputs(ROOT, buildInputs());

/**
 * Not what a case plays: the scripts, research and test harness that run it, the pages, and the
 * evaluations' descriptions and their catalogue. What runs write is no build input (`OUTPUTS`).
 */
const notPlayed = (file) => /^(scripts|research|tests\/harness|src\/ratings)\//.test(file) || /^[^/]+\.html$/.test(file)
  || /^src\/evaluation\/([^/]+\/index|evaluations)\.ts$/.test(file);

/**
 * **The environment** a case's code is until each case names its own: the build's inputs less what
 * no case plays (`notPlayed`). Its `files` are what a record's commit must hold unchanged.
 */
export function environmentOf() {
  const files = buildInputs().filter((file) => !notPlayed(file));
  return { digest: hashBuildInputs(ROOT, files), files };
}

/** Test workers inherit one fingerprint of their parent's source snapshot, avoiding repeated asset reads. */
export const BUILD_IDENTITY = /^sha256:[0-9a-f]{64}$/.test(process.env.AUTO_RPG_BUILD_IDENTITY ?? "")
  ? process.env.AUTO_RPG_BUILD_IDENTITY : currentBuildIdentity();
