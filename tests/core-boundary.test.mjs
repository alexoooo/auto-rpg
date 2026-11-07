/**
 * Every source module follows its responsibility, runtime and package boundaries. The physical
 * core stays within its engine package and owned data; entrants use public library APIs. Exact
 * arithmetic, trusted engine adapters and the Mind/Commander contracts are checked separately.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { sourceCrossings, sourceFiles } from "../scripts/source-boundary.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const CORE = "src/core/";

/** Where the game's minds are written: the core and the entrants, held to the same arithmetic and reads. */
const SIMULATED = [CORE, "src/parts/", "src/combat/", "src/control/", "src/skills/", "src/minds/", "src/entrants/"];
const isSimulated = (file) => SIMULATED.some((folder) => file.startsWith(folder));

/**
 * Packages the core may import, by prefix: its physics engine alone. The browser runs the core, so no
 * `node:` builtins; the renderer is the pages' (`src/app/browser/render/`), so no `@babylonjs/`.
 */
const PACKAGES = ["@dimforge/rapier3d-simd-compat"];

const isData = (file) => file.startsWith("assets/") && file.endsWith(".json");

/** Every file under a directory, repository-relative with forward slashes. */
function filesUnder(directory) {
  const out = [];
  const walk = (relative) => {
    for (const entry of fs.readdirSync(path.join(ROOT, relative), { withFileTypes: true })) {
      const child = `${relative}${entry.name}`;
      if (entry.isDirectory()) walk(`${child}/`);
      else out.push(child);
    }
  };
  if (fs.existsSync(path.join(ROOT, directory))) walk(directory);
  return out;
}

/**
 * Walk the imports reachable from `entries`, treating `inside(file)` as the core. Returns every
 * import that leaves what the core may reach, with the chain that led to it.
 */
function boundaryViolations(entries, inside) {
  const violations = [];
  const seen = new Set();
  const visit = (file, chain) => {
    if (seen.has(file)) return;
    seen.add(file);
    if (isData(file)) return;
    const source = fs.readFileSync(path.join(ROOT, file), "utf8");
    for (const { fileName: specifier } of ts.preProcessFile(source, true, true).importedFiles) {
      const route = [...chain, file].join(" -> ");
      if (!specifier.startsWith(".")) {
        if (!PACKAGES.some((prefix) => specifier === prefix || specifier.startsWith(prefix))) {
          violations.push(`${route} imports the package "${specifier}"`);
        }
        continue;
      }
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier));
      if (!fs.existsSync(path.join(ROOT, target)) || !path.posix.extname(target)) {
        violations.push(`${route} imports "${specifier}", which is no file (Node needs the extension)`);
        continue;
      }
      if (inside(target) || isData(target)) visit(target, [...chain, file]);
      else violations.push(`${route} imports ${target}`);
    }
  };
  for (const entry of entries) visit(entry, []);
  return violations;
}

const inCore = (file) => file.startsWith(CORE);

test("nothing the core reaches leaves the core, its packages or its data", () => {
  const sources = filesUnder(CORE).filter((file) => file.endsWith(".ts"));
  assert.ok(sources.length > 0, "src/core/ has no modules, so this test would pass on nothing");
  assert.deepEqual(boundaryViolations(sources, inCore), []);
});

test("the boundary check finds a crossing where there is one", () => {
  // The control: the arena's page, held to the core's rule as if `src/game/arena/` were a core, reaches
  // the page's routes, the renderer and the core. If the walk stopped finding these, the test above would prove nothing.
  const violations = boundaryViolations(["src/app/browser/arena/main.ts"], (file) => file.startsWith("src/game/arena/"));
  assert.ok(violations.includes("src/app/browser/arena/main.ts imports src/game/route.ts"), violations.join("\n"));
  assert.ok(violations.includes(`src/app/browser/arena/main.ts imports the package "@babylonjs/core/Engines/engine.js"`), violations.join("\n"));
  // And transitively, through the bout the page imports.
  assert.ok(violations.some((line) => line.startsWith("src/app/browser/arena/main.ts -> src/game/arena/duel.ts imports src/core/")),
    violations.join("\n"));
});

/**
 * What of `Math` is the same double in every JavaScript engine: its constants (each "the Number
 * value for" its real, the nearest double), and the operations IEEE 754 or whole-number arithmetic
 * fix. Everything else of it (a sine, an exponential, a power, `hypot`) is right to about the last
 * bit and each engine's own.
 */
const EXACT_MATH = new Set(["PI", "SQRT2", "SQRT1_2", "abs", "max", "min", "sqrt", "ceil", "floor", "trunc", "round", "sign", "fround", "imul"]);

/**
 * What `file` imports for its values, a relative module by its path and a package by its name: a
 * type-only import brings no arithmetic and loads nothing.
 */
function valueImports(file) {
  const source = ts.createSourceFile(file, fs.readFileSync(path.join(ROOT, file), "utf8"), ts.ScriptTarget.Latest, true), out = [];
  for (const statement of source.statements) {
    const from = (ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) && statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier) ? statement.moduleSpecifier.text : null;
    if (!from) continue;
    const clause = ts.isImportDeclaration(statement) ? statement.importClause : null;
    const typeOnly = ts.isExportDeclaration(statement) ? statement.isTypeOnly : clause !== null && clause !== undefined && (clause.isTypeOnly
      || !clause.name && clause.namedBindings !== undefined && ts.isNamedImports(clause.namedBindings) && clause.namedBindings.elements.every((element) => element.isTypeOnly));
    if (!typeOnly) out.push(from.startsWith(".") ? path.posix.normalize(path.posix.join(path.posix.dirname(file), from)) : from);
  }
  return out;
}

/** Every module `entries` reach through their relative value imports (`valueImports`), themselves included. */
function reached(entries) {
  const seen = new Set();
  const visit = (file) => {
    if (seen.has(file) || !file.endsWith(".ts")) return;
    seen.add(file);
    for (const target of valueImports(file)) visit(target);
  };
  entries.forEach(visit);
  return [...seen];
}

/**
 * The bout's and the Crypt run's builders (`WORLD_BUILDERS.bout` and `.crypt`,
 * `src/evaluation/worlds.ts`) and the list of every evaluation (`EVALUATIONS`).
 */
const BOUT_BUILDER = "src/evaluation/bout.ts", CRYPT_BUILDER = "src/evaluation/crypt.ts", EVALUATION_LIST = "src/evaluation/evaluations.ts";

/** The falls' builders (the Lab's starts and shoves, and the rising bed's techniques alone) and the Lab's scenarios. */
const FALL_BUILDERS = ["src/evaluation/fall.ts", "src/evaluation/rising.ts"];
const LAB_SCENARIOS = ["src/game/lab/scenarios.ts", "src/app/browser/lab/lab-scenario.ts", "src/app/browser/lab/attack-scenario.ts", "src/app/browser/lab/locomotion-scenario.ts",
  "src/app/browser/lab/stance-scenario.ts", "src/app/browser/lab/ground-scenario.ts", "src/app/browser/lab/reach-scenario.ts"];

/** The world worker's entry, which steps the Arena's, the crowd fight's and the Crypt's worlds (`src/app/worker/`). */
const WORLD_WORKER = "src/app/browser/worker/world.worker.ts";

/** Each listed evaluation's cases (the `cases.ts` beside its module), which write their worlds. */
const caseModules = () => ts.preProcessFile(fs.readFileSync(path.join(ROOT, EVALUATION_LIST), "utf8"), true, true).importedFiles
  .filter(({ fileName }) => fileName.startsWith(".") && fileName.endsWith("/index.ts"))
  .map(({ fileName }) => path.posix.join(path.posix.dirname(EVALUATION_LIST), path.posix.dirname(fileName), "cases.ts"));

/**
 * The modules beside the core that a case's world is built with: all that the bout's builder, the
 * Crypt run's, each evaluation's cases, the falls' builders and the Lab's scenarios reach.
 */
const worldBuilders = () => reached([BOUT_BUILDER, CRYPT_BUILDER, ...caseModules(), ...FALL_BUILDERS, ...LAB_SCENARIOS]).filter((file) => !inCore(file));

/**
 * Each use in `text` of arithmetic an engine rounds its own way, as `"file what"`: a member of
 * `Math` outside `EXACT_MATH`, `Math` handed on whole or read by a computed name, and the power
 * operator. Read from the syntax tree, so a comment or a string that names one is not a use.
 */
function engineArithmetic(text, file) {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true), found = [];
  const visit = (node) => {
    if (ts.isIdentifier(node) && node.text === "Math") {
      const parent = node.parent, member = ts.isPropertyAccessExpression(parent) && parent.expression === node ? parent.name.text : null;
      const isOwnName = (ts.isPropertyAccessExpression(parent) || ts.isPropertyAssignment(parent)) && parent.name === node;
      if (member === null ? !isOwnName : !EXACT_MATH.has(member)) found.push(`${file} Math${member === null ? "" : `.${member}`}`);
    }
    if (ts.isBinaryExpression(node) && (node.operatorToken.kind === ts.SyntaxKind.AsteriskAsteriskToken
      || node.operatorToken.kind === ts.SyntaxKind.AsteriskAsteriskEqualsToken)) found.push(`${file} ${node.operatorToken.getText(source)}`);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

test("the core, and what builds a case's world, compute with IEEE's operations and the core's own functions", () => {
  const builders = worldBuilders(), files = [...new Set([...SIMULATED.flatMap(filesUnder).filter((name) => name.endsWith(".ts")), ...builders])];
  // The core's own functions and vectors, the bout's and the Crypt's worlds and a battery's cases are read.
  assert.ok(["src/core/math/real.ts", "src/core/math/vector.ts"].every((name) => files.includes(name)) && ["src/game/arena/duel.ts", "src/game/arena/solids.ts",
    "src/evaluation/strike/cases.ts", "src/game/dungeon/run.ts", "src/game/dungeon/party-placement.ts", "src/game/dungeon/level.ts", "src/game/dungeon/solids.ts",
    "src/game/lab/ground-mode.ts", "src/game/lab/ground-starts.ts", "src/game/lab/stance-mode.ts", "src/game/lab/ground-environment.ts", "src/game/lab/track.ts",
    ...FALL_BUILDERS, ...LAB_SCENARIOS].every((name) => builders.includes(name)) && builders.every((name) => fs.existsSync(path.join(ROOT, name))),
  `the builders found are ${builders.join(", ")}`);
  assert.deepEqual(files.flatMap((file) => engineArithmetic(fs.readFileSync(path.join(ROOT, file), "utf8"), file)), []);
  // The control: each way of reaching the engine's arithmetic is found, and what is exact, or only named, is not.
  const probe = `
    /** Not a use: Math.sin(x), and x ** 2. */
    const exact = Math.max(Math.abs(-1), Math.sqrt(2), Math.PI, Math.floor(1.5)), named = "Math.cos(1) ** 2", own = { Math: 1 }.Math;
    const a = Math.sin(1), b = Math.hypot(3, 4), c = Math.pow(2, 0.5), d = 2 ** 0.5, { cos } = Math, e = Math["atan2"](1, 1);
    let f = 2; f **= 3;
  `;
  assert.deepEqual(engineArithmetic(probe, "probe.ts"),
    ["probe.ts Math.sin", "probe.ts Math.hypot", "probe.ts Math.pow", "probe.ts **", "probe.ts Math", "probe.ts Math", "probe.ts **="]);
});

/** Each `@babylonjs/` package a module among `files` imports for its values, as `"file package"`. */
const rendererImports = (files) => files.flatMap((file) => valueImports(file).filter((target) => target.startsWith("@babylonjs/")).map((target) => `${file} ${target}`));

test("a headless world loads no renderer: the bout's, the Crypt run's, the cases', the falls' and the world worker's modules import nothing of Babylon", () => {
  const headless = reached([BOUT_BUILDER, CRYPT_BUILDER, ...caseModules(), ...FALL_BUILDERS, WORLD_WORKER]);
  assert.ok(["src/game/arena/solids.ts", "src/game/dungeon/solids.ts", "src/app/worker/duel-stage.ts", "src/app/worker/crypt-stage.ts", "src/core/world/world.ts"]
    .every((name) => headless.includes(name)), `the modules found are ${headless.join(", ")}`);
  assert.deepEqual(rendererImports(headless), []);
  // The control: the Arena's room, which draws, is found importing Babylon, through what it reaches as well.
  const drawn = rendererImports(reached(["src/app/browser/arena/room.ts"]));
  assert.ok(drawn.includes("src/app/browser/arena/room.ts @babylonjs/core/Meshes/meshBuilder.js") && drawn.some((line) => line.startsWith("src/app/browser/environment/crypt-kit.ts ")), drawn.join("\n"));
});

/** Packages that are a physics engine: only that engine's module in `src/core/physics/` imports one. */
const ENGINE_PACKAGES = ["@dimforge/"];
/** The contract and the list of engines; every other module in `src/core/physics/` is an engine's. */
const SEAM = new Set(["src/core/physics/engine.ts", "src/core/physics/engines.ts"]);
const isEngineModule = (file) => file.startsWith("src/core/physics/") && !SEAM.has(file);

/**
 * The crossings of the engine seam among `files` ([file, source] pairs): an engine package imported
 * outside its engine's module, and an engine's module imported by anything but the list of engines.
 */
function seamCrossings(files) {
  const out = [];
  for (const [file, source] of files) {
    for (const { fileName: specifier } of ts.preProcessFile(source, true, true).importedFiles) {
      if (!specifier.startsWith(".")) {
        if (ENGINE_PACKAGES.some((prefix) => specifier.startsWith(prefix)) && !isEngineModule(file)) out.push(`${file} imports the engine package "${specifier}"`);
        continue;
      }
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier));
      if (isEngineModule(target) && file !== "src/core/physics/engines.ts" && !isEngineModule(file)) out.push(`${file} imports the engine module ${target}`);
    }
  }
  return out;
}

test("the core and its lab reach an engine only through the seam: engine.ts's contract and engines.ts's list", () => {
  const files = [...filesUnder(CORE), ...filesUnder("src/game/lab/"), ...filesUnder("src/app/browser/lab/")].filter((file) => file.endsWith(".ts"))
    .map((file) => [file, fs.readFileSync(path.join(ROOT, file), "utf8")]);
  assert.ok(files.some(([file]) => isEngineModule(file)), "no engine module, so this test would pass on nothing");
  assert.ok(files.some(([file]) => file === "src/app/browser/lab/main.ts"), "no lab, so its half of this test would pass on nothing");
  assert.deepEqual(seamCrossings(files), []);
  // The control: the lab loading Rapier itself, and the build reaching Rapier's package, are found.
  assert.deepEqual(seamCrossings([
    ["src/app/browser/lab/main.ts", `import { loadRapier } from "../../../core/physics/rapier.ts";`],
    ["src/core/bodies/build/build-body.ts", `import RAPIER from "@dimforge/rapier3d-simd-compat";`],
  ]), [
    "src/app/browser/lab/main.ts imports the engine module src/core/physics/rapier.ts",
    `src/core/bodies/build/build-body.ts imports the engine package "@dimforge/rapier3d-simd-compat"`,
  ]);
});

/** The folders a mind and its toolkit are written in, which meet the world through the report and the order sheet alone. */
const MIND_FOLDERS = ["src/minds/", "src/skills/intent/", "src/skills/locomotion/navigation/", "src/skills/perception/", "src/skills/recovery/", "src/skills/",
  "src/control/", "src/skills/quadruped/", "src/minds/option/", "src/entrants/"];

/** The adapters in those folders, which make the report and carry out the order sheet, and so hold the world. */
const MIND_ADAPTERS = new Set([
  "src/minds/embodiment.ts", "src/minds/host.ts", "src/minds/physical-body.ts", "src/core/world/senses.ts",
  "src/core/bodies/object-senses.ts", "src/minds/minds.ts",
  "src/minds/sheets.ts", "src/minds/mirror.ts", "src/core/bodies/assist.ts",
]);

/** What a mind's source never imports: the engine, the world, the builder, the read view's maker and the hands' port. */
const MIND_BARRED = ["src/core/physics/", "src/core/world/world.ts", "src/core/bodies/build/build-body.ts", "src/core/bodies/build/read-view.ts", "src/core/bodies/build/configurations.ts"];

/** The folder a Commander is written in, which meets its team through the view and the orders alone. */
const COMMAND_FOLDERS = ["src/minds/command/"];

/** What a Commander's source never imports: what a mind may not, and a body, a fight's enlistment, a mind's host or the senses' hub. */
const COMMAND_BARRED = [...MIND_BARRED, "src/control/body.ts", "src/minds/physical-body.ts", "src/game/combatant.ts", "src/minds/host.ts", "src/core/world/senses.ts"];

/**
 * Each of `files` (path and source) under `folders`, beside `adapters`, that imports what `barred`
 * names, imports the engine's package, or reads `globalThis`: a mind's folders by default.
 */
function mindCrossings(files, { folders = MIND_FOLDERS, adapters = MIND_ADAPTERS, barred = MIND_BARRED } = {}) {
  const crossings = [];
  for (const [file, source] of files) {
    if (!folders.some((folder) => file.startsWith(folder)) || adapters.has(file)) continue;
    for (const { fileName: specifier } of ts.preProcessFile(source, true, true).importedFiles) {
      if (specifier.startsWith("@dimforge/rapier")) crossings.push(`${file} imports the engine package "${specifier}"`);
      if (!specifier.startsWith(".")) continue;
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier));
      if (barred.some((one) => target === one || one.endsWith("/") && target.startsWith(one))) crossings.push(`${file} imports ${target}`);
    }
    if (/\bglobalThis\b/.test(source)) crossings.push(`${file} reads globalThis`);
    for (const [pattern, what] of CHANCES) if (pattern.test(source)) crossings.push(`${file} reads ${what}`);
  }
  return crossings;
}

/** What a mind may not draw from beside its host's seed (`BodyHost.seed`): the machine's chance and its clocks. */
const CHANCES = [[/\bMath\s*\.\s*random\b/, "Math.random"], [/\bcrypto\s*\.\s*getRandomValues\b/, "crypto.getRandomValues"],
  [/\bDate\s*\.\s*now\b|\bnew\s+Date\b/, "the date"], [/\bperformance\s*\.\s*now\b/, "performance.now"]];

test("a mind and its toolkit reach no engine, world, builder, global or chance but its seed: only the report and the order sheet", () => {
  const files = MIND_FOLDERS.flatMap(filesUnder).filter((file) => file.endsWith(".ts")).map((file) => [file, fs.readFileSync(path.join(ROOT, file), "utf8")]);
  assert.ok(files.length > 50, "no mind's source, so this test would pass on nothing");
  for (const adapter of MIND_ADAPTERS) assert.ok(fs.existsSync(path.join(ROOT, adapter)), `${adapter} is no file: an adapter exempted that is not there`);
  assert.deepEqual(mindCrossings(files), []);
  // The control: an entrant and a skill reaching past the boundary are found, and an adapter is not held to it.
  assert.deepEqual(mindCrossings([
    ["src/entrants/sly/mind.ts", `import type { World } from "../../core/world/world.ts";\nimport { readView } from "../../core/bodies/build/read-view.ts";\nexport const w = globalThis;\n`],
    ["src/skills/sly.ts", `import type { SegmentBody } from "../core/physics/engine.ts";\nimport RAPIER from "@dimforge/rapier3d-simd-compat";\n`],
    ["src/minds/host.ts", `import type { World } from "../../core/world/world.ts";\n`],
    ["src/entrants/lucky/mind.ts", `export const pick = () => Math.random() < .5 ? Date.now() : performance.now();\n`],
  ]), [
    "src/entrants/sly/mind.ts imports src/core/world/world.ts",
    "src/entrants/sly/mind.ts imports src/core/bodies/build/read-view.ts",
    "src/entrants/sly/mind.ts reads globalThis",
    "src/skills/sly.ts imports src/core/physics/engine.ts",
    `src/skills/sly.ts imports the engine package "@dimforge/rapier3d-simd-compat"`,
    "src/entrants/lucky/mind.ts reads Math.random",
    "src/entrants/lucky/mind.ts reads the date",
    "src/entrants/lucky/mind.ts reads performance.now",
  ]);
});

/** Every source module is checked by responsibility and runtime, including modules no world builder reaches. */
test("source imports follow responsibility, runtime and package ownership", () => {
  const files = sourceFiles();
  assert.ok(files.some(([file]) => file.startsWith("src/core/")) && files.some(([file]) => file.startsWith("src/app/browser/"))
    && files.some(([file]) => file.startsWith("src/app/node/")) && files.some(([file]) => file.startsWith("src/entrants/")), "source coverage includes foundations, both runtimes and entrants");
  const report = sourceCrossings(files);
  assert.deepEqual(Object.entries(report).filter(([, found]) => found.length > 0), []);
  const probe = sourceCrossings([
    ["src/skills/private.ts", `import { thinker } from "../minds/private.ts";`],
    ["src/game/alone.ts", `import { draw } from "../app/browser/draw.ts";`],
    ["src/game/reads.ts", `import { read } from "../evaluation/read.ts";`],
    ["src/entrants/one/mind.ts", `import { other } from "../two/mind.ts";`],
    ["src/core/bodies/alone.ts", `export const seen = document.hidden;`],
    ["src/app/browser/alone.ts", `import fs from "node:fs";`],
    ["src/skills/alone.ts", `import fs from "fs";`],
    ["src/entrants/one/private.ts", `import { privateMind } from "../../minds/mind.ts";`],
    ["src/unknown/alone.ts", ""],
  ]);
  assert.deepEqual(probe.unplaced, ["src/unknown/alone.ts"]);
  assert.deepEqual(probe.layers, ["src/game/alone.ts -> src/app/browser/draw.ts", "src/game/reads.ts -> src/evaluation/read.ts", "src/skills/private.ts -> src/minds/private.ts"]);
  assert.deepEqual(probe.runtimes, ["src/app/browser/alone.ts -> node:fs", "src/core/bodies/alone.ts: browser name document", "src/game/alone.ts -> src/app/browser/draw.ts", "src/skills/alone.ts -> fs"]);
  assert.ok(probe.ownership.includes("src/entrants/one/mind.ts -> src/entrants/two/mind.ts"));
  assert.ok(probe.ownership.includes("src/entrants/one/private.ts -> src/minds/mind.ts"));
});

/** The game's list of entrants and its catalog: the only modules that import every entrant. */
const ENTRANT_LISTS = new Set(["src/app/entrants.ts", "src/app/catalog.ts"]);

/** The entrant `file` is written in, `src/entrants/<name>/`, or null. */
const entrantOf = (file) => /^src\/entrants\/([^/]+)\//.exec(file)?.[1] ?? null;

/**
 * Each import among `files` (path and source) that leaves what an entrant may reach: the core, its
 * own folder and its own data (`assets/entrants/<name>/`); no package. The game's lists may import any
 * entrant.
 */
function entrantCrossings(files) {
  const crossings = [];
  for (const [file, source] of files) {
    const name = entrantOf(file);
    if (name === null || ENTRANT_LISTS.has(file)) continue;
    for (const { fileName: specifier } of ts.preProcessFile(source, true, true).importedFiles) {
      if (!specifier.startsWith(".")) {
        crossings.push(`${file} imports the package "${specifier}"`);
        continue;
      }
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier));
      if (!SIMULATED.filter(folder => folder !== "src/entrants/").some(folder => target.startsWith(folder)) && entrantOf(target) !== name && !target.startsWith(`assets/entrants/${name}/`)) crossings.push(`${file} imports ${target}`);
    }
  }
  return crossings;
}

test("an entrant reaches only libraries, its own folder and its own data", () => {
  const files = filesUnder("src/entrants/").filter((file) => file.endsWith(".ts")).map((file) => [file, fs.readFileSync(path.join(ROOT, file), "utf8")]);
  assert.ok(new Set(files.map(([file]) => entrantOf(file)).filter(Boolean)).size > 1, "fewer than two entrants, so this test would pass on nothing");
  assert.deepEqual(entrantCrossings(files), []);
  // The control: an entrant reaching another entrant, a screen, an evaluation and another's data is found; the game's list is not held to it.
  assert.deepEqual(entrantCrossings([
    ["src/entrants/sly/index.ts", `import { OPTION_PRESETS } from "../option/mind.ts";\nimport { Duel } from "../../game/arena/duel.ts";\nimport { MINDS } from "../../app/catalog.ts";\nimport { Vector3 } from "@babylonjs/core/Maths/math.vector.js";\n`],
    ["src/entrants/sly/data.ts", `import guard from "../../../assets/entrants/option/guard.json" with { type: "json" };\nimport { opponentOf } from "../../evaluation/drill-opponents.ts";\n`],
    ["src/app/entrants.ts", `import { SLY } from "./sly/index.ts";\n`],
  ]), [
    "src/entrants/sly/index.ts imports src/entrants/option/mind.ts",
    "src/entrants/sly/index.ts imports src/game/arena/duel.ts",
    "src/entrants/sly/index.ts imports src/app/catalog.ts",
    `src/entrants/sly/index.ts imports the package "@babylonjs/core/Maths/math.vector.js"`,
    "src/entrants/sly/data.ts imports assets/entrants/option/guard.json",
    "src/entrants/sly/data.ts imports src/evaluation/drill-opponents.ts",
  ]);
});

test("a Commander reaches no engine, world, body or global: only its team's view and the orders it gives", () => {
  const command = { folders: COMMAND_FOLDERS, adapters: new Set(), barred: COMMAND_BARRED };
  const files = COMMAND_FOLDERS.flatMap(filesUnder).filter((file) => file.endsWith(".ts")).map((file) => [file, fs.readFileSync(path.join(ROOT, file), "utf8")]);
  assert.ok(files.length > 0, "no Commander's source, so this test would pass on nothing");
  assert.deepEqual(mindCrossings(files, command), []);
  // The control: a Commander reaching a body, the world or the engine is found.
  assert.deepEqual(mindCrossings([
    ["src/minds/command/sly.ts", `import type { PhysicalBody } from "../physical-body.ts";
import type { World } from "../../core/world/world.ts";
export const w = globalThis;
`],
    ["src/minds/command/sly-too.ts", `import { enlist } from "../../game/combatant.ts";
import RAPIER from "@dimforge/rapier3d-simd-compat";
`],
  ], command), [
    "src/minds/command/sly.ts imports src/minds/physical-body.ts",
    "src/minds/command/sly.ts imports src/core/world/world.ts",
    "src/minds/command/sly.ts reads globalThis",
    "src/minds/command/sly-too.ts imports src/game/combatant.ts",
    `src/minds/command/sly-too.ts imports the engine package "@dimforge/rapier3d-simd-compat"`,
  ]);
});
