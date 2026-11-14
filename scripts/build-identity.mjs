import { createHash } from "node:crypto";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { parseSource, visitSyntax } from "./syntax.mjs";
import { dirname, resolve, relative, extname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
/** What runs of a build write, not what makes it: a file by its path, or a folder and all under it by its path and a slash. */
const OUTPUTS = Object.freeze(["assets/minds/notes.json", "assets/evaluations/", "public/assets/generated/"]);
const isOutput = path => OUTPUTS.some(output => output.endsWith("/") ? `${path}/`.startsWith(output) : path === output);
const TEXT = new Set([".ts", ".mts", ".mjs", ".cjs", ".js", ".json", ".css", ".html", ".svg", ".wgsl", ".glsl", ".sh", ".patch", ".py", ".ps1", ".md", ".txt", ".yml", ".yaml", ".xml", ".toml", ".csv", ".obj", ".mtl", ".gltf"]);

/** Whether a path contributes to the build, including a removed input in a historical Git diff. */
export function isBuildInput(file) {
  return !isOutput(file) && !file.split("/").includes("__pycache__") && !/\.py[co]$/.test(file) && (
    ["package.json", "package-lock.json", "vite.config.ts", "tsconfig.json"].includes(file)
    || !file.includes("/") && file.endsWith(".html")
    || /^(src|assets|public|scripts)\//.test(file)
    || file.startsWith("vendor/rapier/") && file.slice("vendor/rapier/".length).includes("/") === false && !file.endsWith(".md")
    || (file.startsWith("research/") && !file.startsWith("research/runs/") || file.startsWith("tests/harness/")) && [".ts", ".mjs", ".js"].includes(extname(file))
    || file.startsWith("node_modules/@dimforge/rapier3d-simd-compat/"));
}

/** A file's content as identities read it: a text file's line endings normalised. */
function contentOf(root, file) {
  const bytes = readFileSync(resolve(root, file));
  return TEXT.has(extname(file)) ? Buffer.from(bytes.toString("utf8").replace(/\r\n/g, "\n")) : bytes;
}

/** Canonical input bytes include untracked source; checkout line endings do not distinguish builds. */
export function hashBuildInputs(root, files) {
  const hash = createHash("sha256").update("auto-rpg-build/1\0");
  for (const file of [...files].sort()) {
    const content = contentOf(root, file);
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
  return files.map(file => relative(ROOT, resolve(ROOT, file)).replaceAll("\\", "/")).filter(isBuildInput);
}

/** Runtime code, input assets, dependency lock and the actual installed solver identify a build. */
export const currentBuildIdentity = () => hashBuildInputs(ROOT, buildInputs());

/** Test workers inherit one fingerprint of their parent's source snapshot, avoiding repeated asset reads. */
export const BUILD_IDENTITY = /^sha256:[0-9a-f]{64}$/.test(process.env.AUTO_RPG_BUILD_IDENTITY ?? "")
  ? process.env.AUTO_RPG_BUILD_IDENTITY : currentBuildIdentity();

/** The modules whose imports the walk reads. */
const CODE = new Set([".ts", ".mts", ".mjs", ".js"]);

/**
 * **What module `file` (its source `text`) imports**, read from its syntax, each relative
 * specifier resolved to a path from the root: `imports` what it loads as it loads (static imports,
 * re-exports and side-effect imports; an `import type` or `export type` left out, and an import of
 * types alone by name kept, which Node loads), `loads` the literal `import()`s it may load later,
 * and `computed` how many `import()`s name no literal. A bare specifier is a package's, which the
 * lockfile names.
 */
function importsOf(file, text) {
  const source = parseSource(file, text);
  const imports = [], loads = [];
  let computed = 0;
  const at = (specifier) => relative(ROOT, resolve(ROOT, dirname(file), specifier.replace(/\?.*$/, ""))).replaceAll("\\", "/");
  visitSyntax(source, node => {
    if (node.type === "ImportDeclaration" || ["ExportNamedDeclaration", "ExportAllDeclaration"].includes(node.type) && node.source) {
      if (node.importKind !== "type" && node.exportKind !== "type" && node.source.value.startsWith(".")) imports.push(at(node.source.value));
    } else if (node.type === "ImportExpression") {
      const specifier = node.source;
      if (specifier.type === "StringLiteral" || specifier.type === "TemplateLiteral" && specifier.expressions.length === 0) {
        const value = specifier.type === "StringLiteral" ? specifier.value : specifier.quasis[0].value.cooked;
        if (value.startsWith(".")) loads.push(at(value));
      } else computed++;
    }
  });
  return { imports: [...new Set(imports)].sort(), loads: [...new Set(loads)].sort(), computed };
}

/** What every run plays besides its closure: the lockfile, the vendored solver and the installed one. */
const RUNTIME = (file) => file === "package-lock.json" || file.startsWith("vendor/rapier/") || file.startsWith("node_modules/@dimforge/");

/**
 * **The file table**: every build input by path with the SHA-256 of its content (line endings
 * normalised), and for a module what it imports (`importsOf`). Read once a process.
 */
function readFileTable() {
  const files = {};
  for (const file of buildInputs().sort()) {
    const content = contentOf(ROOT, file), entry = { hash: createHash("sha256").update(content).digest("hex") };
    if (CODE.has(extname(file))) Object.assign(entry, importsOf(file, content.toString("utf8")));
    files[file] = entry;
  }
  return Object.freeze(files);
}

let table = null;

/**
 * **The static import closure** of `entries` over the file table (`readFileTable`), JSON
 * included, each literal `import()` followed. Refused for a module in it that imports what it
 * names by no literal, or a file that is no build input.
 */
function closureOf(entries) {
  const files = table ??= readFileTable(), closure = new Set(), stack = [...entries];
  while (stack.length > 0) {
    const file = stack.pop();
    if (closure.has(file)) continue;
    const entry = files[file];
    if (!entry) throw new Error(`${file} is in a closure and is no build input`);
    if (entry.computed > 0) throw new Error(`${file} imports a module it names by no literal, so its closure cannot be read`);
    closure.add(file);
    stack.push(...entry.imports ?? [], ...entry.loads ?? []);
  }
  for (const file of Object.keys(files)) if (RUNTIME(file)) closure.add(file);
  return { files, closure };
}

/**
 * **What a research run's implementation is**: each file of the closure (`closureOf`) of
 * `entries` with the lockfile and the solvers, by path, with its hash in the file table.
 */
export function implementationOf(entries) {
  const { files, closure } = closureOf(entries);
  return Object.fromEntries([...closure].sort().map((file) => [file, files[file].hash]));
}
