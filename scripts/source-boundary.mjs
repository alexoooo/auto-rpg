/** Responsibility, runtime and package boundaries for every source module. */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { builtinModules } from "node:module";
import ts from "typescript";

const ROOT = path.resolve(import.meta.dirname, "..");
const NODE_PACKAGES = new Set(builtinModules.map(name => name.replace(/^node:/, "")));

/** Public library entry points available to independently registered entrant packages. */
const PUBLISHED = new Set([
  "src/core/bodies/index.ts", "src/core/math/index.ts", "src/core/state.ts",
  "src/core/data/store.ts", "src/parts/index.ts", "src/parts/lookup.ts",
  "src/minds/index.ts", "src/minds/option/index.ts", "src/skills/config.ts",
  "src/skills/locomotion/navigation/navigator.ts", "src/skills/locomotion/move-rule-part.ts",
]);

/**
 * Responsibility order, lowest first: each rank names its folders and files by path prefix. A
 * module ranks where the longest prefix it starts with stands, so a folder inside a layer can rank
 * above the files at that layer's root. A module imports its own rank or a lower one.
 */
const RANKS = Object.freeze([
  ["src/core/", "src/core/math/", "src/core/data/"], ["src/core/physics/"], ["src/core/bodies/"], ["src/core/world/"],
  ["src/parts/"], ["src/combat/"], ["src/control/"], ["src/skills/"], ["src/minds/"],
  ["src/game/"], ["src/evaluation/"], ["src/entrants/"], ["src/app/"],
]);

/** The rank of `file`: where its longest matching prefix stands, or -1 where none matches. */
function rankOf(file) {
  let rank = -1, longest = 0;
  RANKS.forEach((prefixes, at) => {
    for (const prefix of prefixes) if (prefix.length > longest && file.startsWith(prefix)) { rank = at; longest = prefix.length; }
  });
  return rank;
}

/** Every import, including dynamic imports and re-exports, resolved relative to its owner. */
function imports(file, source) {
  return ts.preProcessFile(source, true, true).importedFiles.map(({ fileName }) => fileName.startsWith(".")
    ? path.posix.normalize(path.posix.join(path.posix.dirname(file), fileName)) : fileName);
}

/** Browser and Node-only names, outside strings and comments. These are not runtime-neutral contracts. */
function runtimeNames(file, source) {
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true), names = new Set(), local = new Set();
  const browser = /^(?:window|document|navigator|localStorage|sessionStorage|HTMLElement|HTML\w*Element|Document|Window|OffscreenCanvas|AudioContext|AudioBuffer|AudioNode|Worker|MessageEvent|Transferable|ImageBitmap|requestAnimationFrame|cancelAnimationFrame)$/;
  const node = /^(?:process|Buffer|__dirname|__filename)$/;
  const bindings = (at) => {
    if ((ts.isVariableDeclaration(at) || ts.isBindingElement(at) || ts.isParameter(at) || ts.isFunctionDeclaration(at) || ts.isFunctionExpression(at)
      || ts.isClassDeclaration(at) || ts.isInterfaceDeclaration(at) || ts.isTypeAliasDeclaration(at)
      || ts.isImportSpecifier(at) || ts.isImportClause(at) || ts.isNamespaceImport(at)) && at.name && ts.isIdentifier(at.name)) local.add(at.name.text);
    ts.forEachChild(at, bindings);
  };
  bindings(parsed);
  const visit = (at) => {
    if (ts.isIdentifier(at)) {
      const parent = at.parent;
      const member = ts.isPropertyAccessExpression(parent) && parent.name === at;
      const key = (ts.isPropertyAssignment(parent) || ts.isPropertySignature(parent) || ts.isMethodDeclaration(parent) || ts.isMethodSignature(parent)) && parent.name === at;
      if (!member && !key && !local.has(at.text)) {
        if (browser.test(at.text)) names.add(`browser name ${at.text}`);
        if (node.test(at.text)) names.add(`Node name ${at.text}`);
      }
    }
    ts.forEachChild(at, visit);
  };
  visit(parsed);
  return [...names].sort();
}

const runtime = (file) => file.split("/").includes("node") ? "node" : file.split("/").includes("browser") ? "browser" : "neutral";
const entrant = (file) => /^src\/entrants\/([^/]+)\//.exec(file)?.[1] ?? null;

/** Every direct edge is checked, so transitive dependencies obey the same runtime and ownership rules. */
export function sourceCrossings(files) {
  const layers = new Set(), runtimes = new Set(), ownership = new Set(), unplaced = new Set();
  for (const [file, source] of files) {
    const from = file;
    if (rankOf(from) < 0) { unplaced.add(file); continue; }
    const own = entrant(from), fromRuntime = runtime(from);
    for (const name of runtimeNames(file, source)) {
      if (fromRuntime === "neutral" || fromRuntime === "browser" && name.startsWith("Node") || fromRuntime === "node" && name.startsWith("browser")) runtimes.add(`${from}: ${name}`);
    }
    for (const target of imports(file, source)) {
      const to = target;
      if (to.startsWith("src/")) {
        if (rankOf(to) < 0) { unplaced.add(target); continue; }
        if (rankOf(to) > rankOf(from)) layers.add(`${from} -> ${to}`);
        const other = entrant(to);
        if (other !== null && other !== own && !(from.startsWith("src/app/") && to === `src/entrants/${other}/index.ts`)) ownership.add(`${from} -> ${to}`);
        if (own !== null && other !== own && !PUBLISHED.has(to)) ownership.add(`${from} -> ${to}`);
        const implementation = /^(src\/skills\/([^/]+)\/implementations\/[^/]+)\//.exec(to);
        if (implementation && !from.startsWith(implementation[1] + "/")) {
          if (from.startsWith(`src/skills/${implementation[2]}/`) || !to.endsWith("/index.ts") && !to.endsWith("/data/registration.ts")) ownership.add(`${from} -> ${to}`);
        }
        if (fromRuntime === "neutral" && runtime(to) !== "neutral" || fromRuntime === "node" && runtime(to) === "browser" || fromRuntime === "browser" && runtime(to) === "node") {
          runtimes.add(`${from} -> ${to}`);
        }
      } else if (own !== null && to.startsWith("assets/") && !to.startsWith(`assets/entrants/${own}/`)) {
        ownership.add(`${from} -> ${to}`);
      } else if (fromRuntime !== "node" && (to.startsWith("node:") || NODE_PACKAGES.has(to) || to.startsWith("scripts/"))
        || fromRuntime !== "browser" && (to.startsWith("@babylonjs/") || to.endsWith(".css"))) {
        runtimes.add(`${from} -> ${to}`);
      }
    }
  }
  return { unplaced: [...unplaced].sort(), layers: [...layers].sort(), runtimes: [...runtimes].sort(), ownership: [...ownership].sort() };
}

/** Read every source module; no builder list determines runtime coverage. */
export function sourceFiles(root = ROOT) {
  const out = [];
  const walk = (folder) => {
    for (const entry of fs.readdirSync(path.join(root, folder), { withFileTypes: true })) {
      const file = `${folder}/${entry.name}`;
      if (entry.isDirectory()) walk(file);
      else if (file.endsWith(".ts")) out.push([file, fs.readFileSync(path.join(root, file), "utf8")]);
    }
  };
  walk("src");
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const files = sourceFiles(), report = sourceCrossings(files);
  if (process.argv.includes("--json")) console.log(JSON.stringify({ modules: files.length, ...report }, null, 2));
  else {
    console.log(`Source boundary: ${files.length} modules`);
    for (const [kind, found] of Object.entries(report)) {
      console.log(`${kind}: ${found.length}`);
      for (const line of found) console.log(`  ${line}`);
    }
  }
  if (Object.values(report).some((found) => found.length > 0)) process.exitCode = 1;
}
