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
export function importsOf(file, text) {
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
  return { imports: [...new Set(imports)].sort(), loads: [...new Set(loads)].sort(), computed, source };
}

/**
 * **Where a case's code is cut**: the toolkit's kinds list (each kind's controller begins its own code, which
 * a case holds for the kinds its world names) and the entrants list (each entrant's manifest begins its own code, which a case
 * holds for each entrant whose kinds its trees name), the world kinds list (each kind's builder begins its
 * own code, which a case holds for the kind of world it plays), each role's list of parts and the
 * Commanders and end rules lists (each entry's module begins its own code, which a case holds for the parts its
 * minds' trees name, `treeKinds`, and the Commanders it plays), the build's identity (its value is the whole tree's, so a case holds no recording
 * identity) and the mind data store (each key's module joins the code of a case whose minds read
 * it, `treeData`).
 */
export const CUTS = Object.freeze({
  kinds: Object.freeze(["src/app/mind-kinds.ts", "src/app/entrants.ts"]), worlds: "src/evaluation/worlds.ts", identity: "src/app/node/build-identity.ts", store: "src/core/data/store.ts",
  roles: Object.freeze(["src/app/registration/aims.ts", "src/app/registration/navigations.ts", "src/app/registration/executors.ts", "src/app/registration/guards.ts", "src/app/registration/supports.ts", "src/app/registration/techniques.ts", "src/app/registration/leg-adapters.ts", "src/app/registration/locomotions.ts", "src/app/registration/gait-parts.ts", "src/app/registration/move-rules.ts", "src/app/registration/motors.ts", "src/app/registration/balances.ts", "src/app/registration/quadruped-parts.ts", "src/app/registration/option-choosers.ts", "src/app/registration/option-kinds.ts", "src/app/registration/option-objectives.ts", "src/app/registration/option-predictions.ts", "src/app/registration/commanders.ts", "src/game/arena/ends.ts"]),
});

/** What every case plays besides its closure: the lockfile, the vendored solver and the installed one. */
const RUNTIME = (file) => file === "package-lock.json" || file.startsWith("vendor/rapier/") || file.startsWith("node_modules/@dimforge/");

/**
 * A list's entries, each entry's module: refused unless `file` holds its imports and one exported
 * literal of what they import, optionally frozen, and nothing else. A kinds list is an array (its kinds' modules in
 * its order); the world kinds list and a role's list an object (each kind's module by its kind).
 */
function listOf(file, { source }) {
  const bound = new Map(), refuse = (why) => { throw new Error(`${file} holds its imports and its list and nothing else: ${why}`); };
  const object = file === CUTS.worlds || CUTS.roles.includes(file), literal = object ? "ObjectExpression" : "ArrayExpression";
  const entry = element => element?.type === "Identifier" && bound.has(element.name) ? bound.get(element.name) : refuse("an entry that is no imported name");
  const contents = node => node.type === "CallExpression" && node.arguments.length === 1
    && node.callee.type === "MemberExpression" && !node.callee.computed && node.callee.object.type === "Identifier"
    && node.callee.object.name === "Object" && node.callee.property.name === "freeze" ? node.arguments[0] : node;
  let list = null;
  for (const statement of source.body) {
    if (statement.type === "ImportDeclaration") {
      const target = relative(ROOT, resolve(ROOT, dirname(file), statement.source.value)).replaceAll("\\", "/");
      if (statement.importKind !== "type") for (const element of statement.specifiers)
        if (element.type === "ImportSpecifier" && element.importKind !== "type") bound.set(element.local.name, target);
      continue;
    }
    const exported = statement.type === "ExportNamedDeclaration" && statement.declaration?.type === "VariableDeclaration";
    const [declaration, ...more] = exported ? statement.declaration.declarations : [];
    if (list || !declaration || more.length > 0 || !declaration.init || contents(declaration.init).type !== literal) refuse(`unexpected ${statement.type}`);
    const value = contents(declaration.init);
    list = !object ? value.elements.map(entry)
      : Object.fromEntries(value.properties.map(property => property.type === "ObjectProperty" && !property.computed && ["Identifier", "StringLiteral"].includes(property.key.type)
        ? [property.key.name ?? property.key.value, entry(property.value)] : refuse("an entry that is no kind and imported name")));
  }
  return list ?? refuse("no list");
}

/** The mind data store's modules by key: each loader's literal `import()`. */
function storeModules(file, { source }) {
  const modules = {};
  visitSyntax(source, node => {
    if (node.type === "ObjectProperty" && !node.computed && ["StringLiteral", "Identifier"].includes(node.key.type)) {
      const specifier = visitSyntax(node.value, inner => inner.type === "ImportExpression" && inner.source.type === "StringLiteral" ? inner.source.value : undefined);
      if (specifier) modules[node.key.name ?? node.key.value] = relative(ROOT, resolve(ROOT, dirname(file), specifier)).replaceAll("\\", "/");
    }
  });
  return modules;
}

/**
 * **The file table**: every build input by path with the SHA-256 of its content (line endings
 * normalised), and for a module what it imports (`importsOf`); a kinds list names its kinds'
 * modules (`kinds`), the world kinds list its builders' (`worlds`), a role's list its parts'
 * (`parts`) and the store its data's (`data`). What a case's code is drawn from
 * (`fileTable`, read once a process).
 */
function readFileTable() {
  const files = {};
  for (const file of buildInputs().sort()) {
    const content = contentOf(ROOT, file), entry = { hash: createHash("sha256").update(content).digest("hex") };
    if (CODE.has(extname(file))) {
      const read = importsOf(file, content.toString("utf8"));
      Object.assign(entry, { imports: read.imports, loads: read.loads, computed: read.computed });
      if (CUTS.kinds.includes(file)) entry.kinds = listOf(file, read);
      if (file === CUTS.worlds) entry.worlds = listOf(file, read);
      if (CUTS.roles.includes(file)) entry.parts = listOf(file, read);
      if (file.endsWith("/data/registration.ts") || file.startsWith("src/entrants/")) entry.data = storeModules(file, read);
    }
    files[file] = entry;
  }
  return Object.freeze(files);
}

let table = null;

/** The file table (`readFileTable`) as this process first read it. */
export const fileTable = () => table ??= readFileTable();

/**
 * **The static import closure** of `entries` over `files` (`fileTable`), JSON included, cut at the
 * cut points (`CUTS`) unless `cut` is false: the kinds lists, the world kinds list and the build's
 * identity are not in it, and the store's loads not followed. Refused for a module in it that imports what it names by
 * no literal, or a file that is no build input.
 */
export function closureOf(files, entries, { cut = true } = {}) {
  const closure = new Set(), stack = [...entries];
  while (stack.length > 0) {
    const file = stack.pop();
    if (closure.has(file) || cut && (CUTS.kinds.includes(file) || file === CUTS.worlds || file === CUTS.identity || CUTS.roles.includes(file))) continue;
    const entry = files[file];
    if (!entry) throw new Error(`${file} is in a case's closure and is no build input`);
    if (entry.computed > 0) throw new Error(`${file} imports a module it names by no literal, so its closure cannot be read`);
    closure.add(file);
    stack.push(...entry.imports ?? [], ...cut && (file === CUTS.store || file.endsWith("/data/registration.ts")) ? [] : entry.loads ?? []);
  }
  return closure;
}

/** The digest of `paths` as `files` hashes them. */
const digestOf = (files, paths) => {
  const hash = createHash("sha256").update("auto-rpg-code/1\0");
  for (const path of [...paths].sort()) hash.update(`${path}\0${files[path].hash}\n`);
  return `sha256:${hash.digest("hex")}`;
};

/**
 * **A case's code**, for the cases of `caseModule` (`src/evaluation/<id>/cases.ts`) over `files`
 * (`fileTable`), the kinds of mind registered, the toolkit's in its kinds list's order (`kinds`).
 *
 * - `environment`: the closure (`closureOf`) of the player, the case module and the application
 *   context and catalog, with
 *   the lockfile and the solvers: what every case plays, whatever its world.
 * - `own(kind)`: a kind's own code: a toolkit kind's controller's closure less the environment, or
 *   for an entrant's kind (`<entrant>:<kind>`) its manifest's (`src/entrants/<entrant>/index.ts`)
 *   with `assets/entrants/<entrant>/`; `data(key)` likewise the closure of a mind data key's module.
 * - `code({ world, kinds, parts, data })`: a case's, the environment with the own code of the kind
 *   of world it plays (its builder's closure less the environment, the builder as the world kinds
 *   list names it), of each kind of mind its world names, of each part their trees name that a
 *   role's list holds (its module's closure less the environment) or an entrant registers (its
 *   entrant's own code) and of each data key their minds
 *   read (`added`): its `digest` is the case key's `code`, its `files` what a result's commit must hold
 *   unchanged, and `own` the digest of `added` alone, null where nothing is added (a version's
 *   `code`, `versionOf`, read of a subject's parts, which name no world).
 */
export function caseCoder(files, caseModule, kinds) {
  const [toolkitList, entrantList] = CUTS.kinds, listed = files[toolkitList]?.kinds ?? [], entrants = files[entrantList]?.kinds ?? [];
  const unscoped = kinds.filter((kind) => !kind.includes(":"));
  if (listed.length !== unscoped.length) throw new Error(`the toolkit's kinds list names ${listed.length} kinds, and ${unscoped.length} are registered`);
  const environment = closureOf(files, ["src/evaluation/play.ts", caseModule, "src/app/context.ts", "src/app/catalog.ts"]);
  for (const file of Object.keys(files)) if (RUNTIME(file)) environment.add(file);
  const beyond = (entry) => [...closureOf(files, [entry])].filter((file) => !environment.has(file));
  const owned = new Map(), data = new Map(), built = new Map(), partCode = new Map(), codes = new Map();
  const listedParts = Object.assign({}, ...CUTS.roles.map((list) => files[list]?.parts ?? {}));
  const own = (kind) => {
    const scope = kind.includes(":") ? kind.slice(0, kind.indexOf(":")) : null;
    const key = scope ?? kind;
    if (!owned.has(key)) {
      if (scope === null) {
        const at = unscoped.indexOf(kind);
        if (at < 0) throw new Error(`no kind of mind ${JSON.stringify(kind)}`);
        owned.set(key, beyond(listed[at]));
      } else {
        const manifest = `src/entrants/${scope}/index.ts`;
        if (!entrants.includes(manifest)) throw new Error(`no entrant ${JSON.stringify(scope)} in the entrants list`);
        owned.set(key, [...beyond(manifest), ...Object.keys(files).filter((file) => file.startsWith(`assets/entrants/${scope}/`) && !environment.has(file))]);
      }
    }
    return owned.get(key);
  };
  const read = (key) => {
    const module = Object.values(files).map((entry) => entry.data?.[key]).find(Boolean);
    if (!module) throw new Error(`the store has no data ${JSON.stringify(key)}`);
    if (!data.has(key)) data.set(key, beyond(module));
    return data.get(key);
  };
  const world = (kind) => {
    const module = files[CUTS.worlds]?.worlds?.[kind];
    if (!module) throw new Error(`the world kinds list has no kind ${JSON.stringify(kind)}`);
    if (!built.has(kind)) built.set(kind, beyond(module));
    return built.get(kind);
  };
  /** A part's own code where a role's list holds it, its entrant's where an entrant registers it; none where neither, its code the environment's or its mind's. */
  const part = (kind) => {
    if (kind.includes(":")) return own(kind);
    if (!Object.hasOwn(listedParts, kind)) return [];
    if (!partCode.has(kind)) partCode.set(kind, beyond(listedParts[kind]));
    return partCode.get(kind);
  };
  return {
    environment: { digest: digestOf(files, environment), files: [...environment].sort() },
    own, data: read,
    code(named) {
      const parts = [...new Set(named.parts ?? [])].filter((kind) => Object.hasOwn(listedParts, kind) || kind.includes(":")).sort();
      const id = JSON.stringify([named.world ?? null, [...new Set(named.kinds)].sort(), parts, [...new Set(named.data)].sort()]);
      if (!codes.has(id)) {
        const added = new Set([...named.world ? world(named.world) : [], ...named.kinds.flatMap(own), ...parts.flatMap(part), ...named.data.flatMap(read)]);
        codes.set(id, { digest: digestOf(files, [...environment, ...added]), files: [...environment, ...added].sort(), added: [...added].sort(),
          own: added.size > 0 ? digestOf(files, added) : null });
      }
      return codes.get(id);
    },
  };
}

/**
 * **What a research run's implementation is**: each file of the uncut closure (`closureOf`) of
 * `entries` with the lockfile and the solvers, by path, with its hash in the file table.
 */
export function implementationOf(entries) {
  const files = fileTable(), closure = closureOf(files, entries, { cut: false });
  for (const file of Object.keys(files)) if (RUNTIME(file)) closure.add(file);
  return Object.fromEntries([...closure].sort().map((file) => [file, files[file].hash]));
}
