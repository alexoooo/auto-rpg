/** Responsibility, runtime and package boundaries for every source module. */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { builtinModules } from "node:module";
import { bindingNames, moduleImports, parseSource, visitSyntax } from "./syntax.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const NODE_PACKAGES = new Set(builtinModules.map(name => name.replace(/^node:/, "")));

/** Public library entry points available to independently registered entrant packages. */
const PUBLISHED = new Set([
  "src/core/bodies/index.ts", "src/core/math/index.ts", "src/core/state.ts",
  "src/core/data/store.ts", "src/parts/index.ts", "src/parts/lookup.ts",
  "src/minds/index.ts", "src/minds/option/index.ts", "src/skills/config.ts",
  "src/skills/framework/navigation.ts", "src/skills/locomotion/move/move-rule-part.ts",
]);

/**
 * Responsibility order, lowest first: each rank names its folders and files by path prefix. A
 * module ranks where the longest prefix it starts with stands, so a folder inside a layer can rank
 * above the files at that layer's root. A module imports its own rank or a lower one.
 */
const RANKS = Object.freeze([
  ["src/core/", "src/core/math/", "src/core/data/"], ["src/core/physics/"], ["src/core/bodies/"], ["src/core/world/"],
  ["src/parts/"], ["src/combat/"], ["src/control/"],
  ["src/skills/", "src/skills/framework/"], ["src/skills/reach/"], ["src/skills/perception/"], ["src/skills/locomotion/"], ["src/skills/intent/"],
  ["src/skills/guard/"], ["src/skills/strikes/"], ["src/skills/recovery/"], ["src/skills/assembly/"],
  ["src/minds/"], ["src/minds/catalog/"], ["src/minds/seat/"], ["src/minds/option/", "src/minds/command/"], ["src/minds/index.ts"],
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
  return moduleImports(file, source).map(fileName => fileName.startsWith(".")
    ? path.posix.normalize(path.posix.join(path.posix.dirname(file), fileName)) : fileName);
}

/** Browser and Node-only names, outside strings and comments. These are not runtime-neutral contracts. */
function runtimeNames(file, source) {
  const parsed = parseSource(file, source), names = new Set(), local = new Set();
  const browser = /^(?:window|document|navigator|localStorage|sessionStorage|HTMLElement|HTML\w*Element|Document|Window|OffscreenCanvas|AudioContext|AudioBuffer|AudioNode|Worker|MessageEvent|Transferable|ImageBitmap|requestAnimationFrame|cancelAnimationFrame)$/;
  const node = /^(?:process|Buffer|__dirname|__filename)$/;
  visitSyntax(parsed, at => {
    if (["VariableDeclarator", "FunctionDeclaration", "FunctionExpression", "ClassDeclaration", "TSInterfaceDeclaration", "TSTypeAliasDeclaration"].includes(at.type))
      for (const name of bindingNames(at.id)) local.add(name);
    if (["ImportSpecifier", "ImportDefaultSpecifier", "ImportNamespaceSpecifier"].includes(at.type)) local.add(at.local.name);
    if (at.params) for (const parameter of at.params) for (const name of bindingNames(parameter)) local.add(name);
  });
  visitSyntax(parsed, (at, parent) => {
    if (at.type === "Identifier") {
      const member = ["MemberExpression", "OptionalMemberExpression"].includes(parent?.type) && !parent.computed && parent.property === at;
      const key = ["ObjectProperty", "ObjectMethod", "ClassMethod", "TSPropertySignature", "TSMethodSignature"].includes(parent?.type) && !parent.computed && parent.key === at;
      if (!member && !key && !local.has(at.name)) {
        if (browser.test(at.name)) names.add(`browser name ${at.name}`);
        if (node.test(at.name)) names.add(`Node name ${at.name}`);
      }
    }
  });
  return [...names].sort();
}

const runtime = (file) => file.split("/").includes("node") ? "node" : file.split("/").includes("browser") ? "browser" : "neutral";
const entrant = (file) => /^src\/entrants\/([^/]+)\//.exec(file)?.[1] ?? null;

/** The areas of skills (`src/skills/<area>/`): each a folder a skill, beside the area's `shared/` and `data/`. */
const AREAS = new Set(["guard", "locomotion", "strikes", "recovery"]);
/** The folders in an area that are no skill's: what its skills do alike, naming none of them, and the area's records' loaders. */
const AREA_FOLDERS = new Set(["shared", "data"]);
/** The folders in a skill's folder that are its own code, not a variation: its records' loaders. */
const SKILL_FOLDERS = new Set(["data"]);

/**
 * **Where `file` is among the skills**, or null outside every area: its area's shared folder where
 * it is in it (`src/skills/<area>/shared/`), else the skill's folder it is in
 * (`src/skills/<area>/<skill>/`) and the variation's (`<skill>/<variation>/`) where it is in one. A
 * skill's folder holds its part, its variations' folders and its `data/`.
 */
function placeOf(file) {
  const found = /^src\/skills\/([^/]+)\/(?:([^/]+)\/(?:([^/]+)\/)?)?/.exec(file);
  if (!found || !AREAS.has(found[1])) return null;
  const area = `src/skills/${found[1]}/`;
  if (found[2] === "shared") return { shared: `${area}shared/`, skill: null, variation: null };
  if (found[2] === undefined || AREA_FOLDERS.has(found[2])) return { shared: null, skill: null, variation: null };
  const skill = `${area}${found[2]}/`;
  return { shared: null, skill, variation: found[3] === undefined || SKILL_FOLDERS.has(found[3]) ? null : `${skill}${found[3]}/` };
}

/**
 * Whether the import of `to` by `from` crosses a variation's bounds, in every area: a variation
 * reads only its own folder, the areas' shared code and code outside the areas, never another
 * variation or skill; only its own skill's code reads it; and shared code reads no skill's.
 */
function crossesVariation(from, to) {
  const there = placeOf(to);
  if (there === null) return false;
  const here = placeOf(from);
  return here?.shared != null && there.skill !== null
    || here?.variation != null && !to.startsWith(here.variation) && there.shared === null
    || there.variation !== null && !from.startsWith(there.skill);
}

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
        if (crossesVariation(from, to)) ownership.add(`${from} -> ${to}`);
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
