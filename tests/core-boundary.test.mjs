/**
 * The core's boundary: `src/core/` reaches nothing but itself, its packages and data files under
 * `assets/`, checked over the transitive closure of its imports. The entrants build on the core and
 * each reaches only the core and its own folder; the pages build on both, never the reverse. Also
 * here: the bans on float32 rotations and cached world matrices, the arithmetic, the engine seam and
 * the mind seam, each held over the core and the entrants alike.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { programOver, sourcesUnder } from "./harness/program.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const CORE = "src/core/";

/** Where the game's minds are written: the core and the entrants, held to the same arithmetic, rotations and reads. */
const SIMULATED = [CORE, "src/entrants/"];
const isSimulated = (file) => SIMULATED.some((folder) => file.startsWith(folder));

/** Packages the core may import, by prefix. The browser runs the core, so no `node:` builtins. */
const PACKAGES = ["@babylonjs/core/", "@dimforge/rapier3d-simd-compat"];

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
  // The control: the arena's page, held to the core's rule as if `src/arena/` were a core, reaches
  // the page's routes and the core. If the walk stopped finding these, the test above would prove nothing.
  const violations = boundaryViolations(["src/arena/main.ts"], (file) => file.startsWith("src/arena/"));
  assert.ok(violations.includes("src/arena/main.ts imports src/app-route.ts"), violations.join("\n"));
  // And transitively, through the bout the page imports.
  assert.ok(violations.some((line) => line.startsWith("src/arena/main.ts -> src/arena/duel.ts imports src/core/")),
    violations.join("\n"));
});

test("the core turns vectors in double precision, never through Babylon's float32 matrices", () => {
  // `Vector3.rotateByQuaternionToRef` builds a rotation `Matrix`, a Float32Array: a point turned
  // through it carries 1e-8 m of noise, a hundred times what the reach's solve stops at
  // (`IK_TOLERANCE`, `src/core/control/kinematics.ts`). `applyRotationQuaternionToRef` is exact.
  const banned = /rotateByQuaternion|toRotationMatrix|TransformCoordinates|TransformNormal|\bMatrix\b/;
  const offenders = [];
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (!entry.name.endsWith(".ts")) continue;
      for (const [index, line] of fs.readFileSync(full, "utf8").split(/\r?\n/).entries()) {
        const code = line.replace(/\/\/.*$/, "").replace(/^\s*\*.*$/, "");
        if (banned.test(code)) offenders.push(`${path.relative(ROOT, full)}:${index + 1}`);
      }
    }
  };
  for (const folder of SIMULATED) walk(path.join(ROOT, folder));
  assert.deepEqual(offenders, [], "a core or entrant file turns a vector through a float32 matrix");
});

test("the core reads world transforms from its nodes, never through a cached world matrix", () => {
  // `getWorldMatrix()` short-circuits on the render id, and reading it stamps that id: every later
  // reader in the frame, a person at the console among them, reads the first sample. The core
  // reads `position` and `rotationQuaternion`; read out of the source, as no scene catches it cheaply.
  const banned = /\.getWorldMatrix\(|\.absolutePosition|\.absoluteRotationQuaternion|computeWorldMatrix\(/;
  const offenders = [];
  for (const file of SIMULATED.flatMap(filesUnder).filter((name) => name.endsWith(".ts"))) {
    for (const [index, line] of fs.readFileSync(path.join(ROOT, file), "utf8").split(/\r?\n/).entries()) {
      const code = line.replace(/\/\/.*$/, "").replace(/^\s*\*.*$/, "");
      if (banned.test(code)) offenders.push(`${file}:${index + 1}`);
    }
  }
  assert.deepEqual(offenders, [], "a core or entrant file reads a world matrix");
  // The control: the rule finds a reader where there is one.
  assert.ok(banned.test("const at = mesh.getWorldMatrix().getTranslation();"));
});

/**
 * What Babylon reads through the cached world matrix, by the name it is declared under on a node:
 * the matrix itself, and every position, direction, pivot, scale and distance derived from it.
 */
const WORLD_MATRIX_READERS = new Set([
  "getWorldMatrix", "worldMatrixFromCache", "computeWorldMatrix",
  "absolutePosition", "absoluteRotationQuaternion", "absoluteScaling", "getAbsolutePosition",
  "getAbsolutePivotPoint", "getAbsolutePivotPointToRef",
  "forward", "up", "right", "getDirection", "getDirectionToRef",
  "getPositionInCameraSpace", "getDistanceToCamera",
]);
/** Babylon's classes a node of the core is one of. */
const NODE_CLASSES = new Set(["Node", "TransformNode", "AbstractMesh"]);

/**
 * Each read under `src/core/` of a `WORLD_MATRIX_READERS` name that Babylon declares on a node, as
 * `"file name"`, through the checker: a regex on `.right` would refuse the core's own `hand.right`.
 */
function worldMatrixReads(overlay = {}) {
  const { checker, sources } = programOver([...sourcesUnder("src/core", ".ts"), ...sourcesUnder("src/entrants", ".ts")], overlay);
  const reads = [];
  const visit = (node, file) => {
    if (ts.isPropertyAccessExpression(node) && WORLD_MATRIX_READERS.has(node.name.text)) {
      const onNode = (checker.getSymbolAtLocation(node.name)?.declarations ?? []).some((declaration) =>
        declaration.getSourceFile().fileName.includes("/node_modules/@babylonjs/core/")
        && ts.isClassLike(declaration.parent) && NODE_CLASSES.has(declaration.parent.name?.text));
      if (onNode) reads.push(`${file} ${node.name.text}`);
    }
    ts.forEachChild(node, (child) => visit(child, file));
  };
  for (const { source, file } of sources()) if (isSimulated(file)) visit(source, file);
  return reads;
}

test("the core reads nothing Babylon derives from a cached world matrix, whatever its name", () => {
  assert.deepEqual(worldMatrixReads(), []);
  // The control: the world's module reading every one of those names off a mesh is refused for each,
  // so no name in the list is one Babylon does not declare; a plain record's `right` beside them is not.
  const world = "src/core/world.ts", names = [...WORLD_MATRIX_READERS];
  const probe = `${fs.readFileSync(path.join(ROOT, world), "utf8")}
import type { AbstractMesh as ProbeMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
export const probe = (mesh: ProbeMesh, hand: { right: number }): unknown[] =>
  [hand.right, ${names.map((name) => `mesh.${name}`).join(", ")}];
`;
  assert.deepEqual(worldMatrixReads({ [world]: probe }), names.map((name) => `${world} ${name}`));
});

/**
 * What of `Math` is the same double in every JavaScript engine: its constants (each "the Number
 * value for" its real, the nearest double), and the operations IEEE 754 or whole-number arithmetic
 * fix. Everything else of it (a sine, an exponential, a power, `hypot`) is right to about the last
 * bit and each engine's own.
 */
const EXACT_MATH = new Set(["PI", "SQRT2", "SQRT1_2", "abs", "max", "min", "sqrt", "ceil", "floor", "trunc", "round", "sign", "fround", "imul"]);

/** The relative modules `file` imports for their values: a type-only import brings no arithmetic. */
function valueImports(file) {
  const source = ts.createSourceFile(file, fs.readFileSync(path.join(ROOT, file), "utf8"), ts.ScriptTarget.Latest, true), out = [];
  for (const statement of source.statements) {
    const from = (ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) && statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier) ? statement.moduleSpecifier.text : null;
    if (!from?.startsWith(".")) continue;
    const clause = ts.isImportDeclaration(statement) ? statement.importClause : null;
    const typeOnly = ts.isExportDeclaration(statement) ? statement.isTypeOnly : clause !== null && clause !== undefined && (clause.isTypeOnly
      || !clause.name && clause.namedBindings !== undefined && ts.isNamedImports(clause.namedBindings) && clause.namedBindings.elements.every((element) => element.isTypeOnly));
    if (!typeOnly) out.push(path.posix.normalize(path.posix.join(path.posix.dirname(file), from)));
  }
  return out;
}

/**
 * Every module outside the core that `entries` reach through their relative value imports
 * (`valueImports`), themselves included, entering none of `cut`.
 */
function reachedBeside(entries, cut = new Set()) {
  const seen = new Set();
  const visit = (file) => {
    if (seen.has(file) || cut.has(file) || !file.endsWith(".ts")) return;
    seen.add(file);
    for (const target of valueImports(file)) visit(target);
  };
  entries.forEach(visit);
  return [...seen].filter((file) => !inCore(file));
}

/**
 * The bout's and the Crypt run's builders (`WORLD_BUILDERS.bout` and `.crypt`,
 * `src/evaluation/worlds.ts`) and the list of every evaluation (`EVALUATIONS`).
 */
const BOUT_BUILDER = "src/evaluation/bout.ts", CRYPT_BUILDER = "src/evaluation/crypt.ts", EVALUATION_LIST = "src/evaluation/evaluations.ts";

/**
 * The Crypt's look: modules a Crypt run reaches that only draw (its decals, its dressing, the fog's
 * shader) and decide nothing a body meets or a mind senses, so they may take the engine's arithmetic.
 */
const CRYPT_LOOK = new Set(["src/dungeon/decals.ts", "src/dungeon/dressing.ts", "src/dungeon/fog-plugin.ts"]);

/** The falls' builders (the Lab's starts and shoves, and the rising bed's techniques alone) and the Lab's scenarios. */
const FALL_BUILDERS = ["src/evaluation/fall.ts", "src/evaluation/rising.ts"];
const LAB_SCENARIOS = ["src/lab/scenarios.ts", "src/lab/lab-scenario.ts", "src/lab/attack-scenario.ts", "src/lab/locomotion-scenario.ts",
  "src/lab/stance-scenario.ts", "src/lab/ground-scenario.ts"];

/** Each listed evaluation's cases (the `cases.ts` beside its module), which write their worlds. */
const caseModules = () => ts.preProcessFile(fs.readFileSync(path.join(ROOT, EVALUATION_LIST), "utf8"), true, true).importedFiles
  .filter(({ fileName }) => fileName.startsWith("./") && fileName.endsWith("/index.ts"))
  .map(({ fileName }) => path.posix.join(path.posix.dirname(EVALUATION_LIST), path.posix.dirname(fileName), "cases.ts"));

/**
 * The modules beside the core that a case's world is built with: all that the bout's builder, the
 * Crypt run's, each evaluation's cases, the falls' builders and the Lab's scenarios reach, less the
 * Crypt's look.
 */
const worldReach = () => reachedBeside([BOUT_BUILDER, CRYPT_BUILDER, ...caseModules(), ...FALL_BUILDERS, ...LAB_SCENARIOS]);
const worldBuilders = () => worldReach().filter((file) => !CRYPT_LOOK.has(file));

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
  const builders = worldBuilders(), reached = worldReach(), files = [...new Set([...SIMULATED.flatMap(filesUnder).filter((name) => name.endsWith(".ts")), ...builders])];
  // The bout's and the Crypt's worlds and a battery's cases are reached, each exemption names a module a case reaches, and a cut one that exists.
  assert.ok(files.includes("src/core/math/real.ts") && ["src/arena/duel.ts", "src/arena/room.ts", "src/evaluation/blade/cases.ts", "src/dungeon/run.ts",
    "src/dungeon/party-placement.ts", "src/dungeon/level.ts", "src/dungeon/world.ts", "src/lab/ground-mode.ts", "src/lab/ground-starts.ts",
    "src/lab/stance-mode.ts", "src/lab/ground-environment.ts", "src/lab/track.ts", ...FALL_BUILDERS, ...LAB_SCENARIOS].every((name) => builders.includes(name))
    && [...CRYPT_LOOK].every((name) => reached.includes(name)) && [...FALL_BUILDERS, ...builders].every((name) => fs.existsSync(path.join(ROOT, name))),
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

/**
 * Babylon's math the core calls, each read in Babylon's source and found to be IEEE's arithmetic
 * and a square root and nothing else, so the same in every JavaScript engine. A member not listed
 * is read before it is: `Quaternion.RotationAxis`, `Slerp`, the Euler angles and the angle
 * between vectors take the engine's sine, cosine or arctangent, and the core has its own
 * (`src/core/math/turn.ts`).
 */
const EXACT_BABYLON = new Set([
  "Quaternion.Identity", "Quaternion.Inverse", "Quaternion.InverseToRef", "Quaternion.RotationQuaternionFromAxis", "Quaternion.clone", "Quaternion.copyFrom",
  "Quaternion.copyFromFloats", "Quaternion.multiply", "Quaternion.multiplyInPlace", "Quaternion.multiplyToRef", "Quaternion.normalize",
  "Quaternion.scaleInPlace", "Quaternion.set", "Quaternion.w", "Quaternion.x", "Quaternion.y", "Quaternion.z",
  "Vector3.Cross", "Vector3.CrossToRef", "Vector3.Distance", "Vector3.Dot", "Vector3.Forward", "Vector3.Right", "Vector3.Up",
  "Vector3.UpReadOnly", "Vector3.add", "Vector3.addInPlace", "Vector3.addInPlaceFromFloats", "Vector3.applyRotationQuaternionToRef",
  "Vector3.copyFrom", "Vector3.length", "Vector3.lengthSquared", "Vector3.normalize", "Vector3.scale", "Vector3.scaleInPlace",
  "Vector3.set", "Vector3.setAll", "Vector3.subtract", "Vector3.subtractInPlace", "Vector3.subtractToRef",
  "Vector3.x", "Vector3.y", "Vector3.z",
]);

/**
 * Each member of Babylon's math read under `src/core/`, as `"file Class.member"`, through the
 * checker: the name alone does not say whose `length` it is.
 */
function babylonMathReads(overlay = {}) {
  const { checker, sources } = programOver([...sourcesUnder("src/core", ".ts"), ...sourcesUnder("src/entrants", ".ts")], overlay);
  const reads = new Set();
  const visit = (node, file) => {
    if (ts.isPropertyAccessExpression(node)) {
      for (const declaration of checker.getSymbolAtLocation(node.name)?.declarations ?? []) {
        if (!declaration.getSourceFile().fileName.includes("/node_modules/@babylonjs/core/Maths/")) continue;
        const member = `${ts.isClassLike(declaration.parent) ? declaration.parent.name?.text : "?"}.${node.name.text}`;
        reads.add(`${file} ${member}`);
      }
    }
    ts.forEachChild(node, (child) => visit(child, file));
  };
  for (const { source, file } of sources()) if (isSimulated(file)) visit(source, file);
  return [...reads];
}

test("the core calls only the Babylon math it has read and found exact", () => {
  const reads = babylonMathReads(), memberOf = (read) => read.split(" ")[1];
  assert.deepEqual(reads.filter((read) => !EXACT_BABYLON.has(memberOf(read))), []);
  // The list is what the core calls and no more: a member it has stopped calling leaves it.
  const called = new Set(reads.map(memberOf));
  assert.deepEqual([...EXACT_BABYLON].filter((member) => !called.has(member)), []);
  // The control: the world's module turning by Babylon's own trigonometry is refused for each such
  // call, and for a member nobody has read; the exact ones beside them are not.
  const world = "src/core/world.ts";
  const probe = `${fs.readFileSync(path.join(ROOT, world), "utf8")}
import { Quaternion as ProbeQuaternion, Vector3 as ProbeVector3 } from "@babylonjs/core/Maths/math.vector.js";
export const probe = (q: ProbeQuaternion, v: ProbeVector3): unknown[] => [
  ProbeQuaternion.RotationAxis(v, 1), ProbeQuaternion.Slerp(q, q, 0.5), q.toEulerAngles(), ProbeQuaternion.FromEulerAngles(0, 1, 0),
  ProbeVector3.GetAngleBetweenVectors(v, v, v), ProbeVector3.Lerp(v, v, 0.5), v.length(), q.w, ProbeQuaternion.InverseToRef(q, q)];
`;
  assert.deepEqual(babylonMathReads({ [world]: probe }).filter((read) => !EXACT_BABYLON.has(memberOf(read))), ["RotationAxis", "Slerp", "toEulerAngles", "FromEulerAngles"]
    .map((name) => `${world} Quaternion.${name}`).concat([`${world} Vector3.GetAngleBetweenVectors`, `${world} Vector3.Lerp`]));
});

/** Packages that are a physics engine: only that engine's module in `src/core/engine/` imports one. */
const ENGINE_PACKAGES = ["@dimforge/"];
/** The contract and the list of engines; every other module in `src/core/engine/` is an engine's. */
const SEAM = new Set(["src/core/engine/engine.ts", "src/core/engine/engines.ts"]);
const isEngineModule = (file) => file.startsWith("src/core/engine/") && !SEAM.has(file);

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
      if (isEngineModule(target) && file !== "src/core/engine/engines.ts" && !isEngineModule(file)) out.push(`${file} imports the engine module ${target}`);
    }
  }
  return out;
}

test("the core and its lab reach an engine only through the seam: engine.ts's contract and engines.ts's list", () => {
  const files = [...filesUnder(CORE), ...filesUnder("src/lab/")].filter((file) => file.endsWith(".ts"))
    .map((file) => [file, fs.readFileSync(path.join(ROOT, file), "utf8")]);
  assert.ok(files.some(([file]) => isEngineModule(file)), "no engine module, so this test would pass on nothing");
  assert.ok(files.some(([file]) => file === "src/lab/main.ts"), "no lab, so its half of this test would pass on nothing");
  assert.deepEqual(seamCrossings(files), []);
  // The control: the lab loading Rapier itself, and the build reaching Rapier's package, are found.
  assert.deepEqual(seamCrossings([
    ["src/lab/main.ts", `import { loadRapier } from "../core/engine/rapier.ts";`],
    ["src/core/build/build-body.ts", `import RAPIER from "@dimforge/rapier3d-simd-compat";`],
  ]), [
    "src/lab/main.ts imports the engine module src/core/engine/rapier.ts",
    `src/core/build/build-body.ts imports the engine package "@dimforge/rapier3d-simd-compat"`,
  ]);
});

/** The muscle driver's module, which declares `driveMuscles`. */
const MUSCLE_DRIVER = "src/core/muscle/driver.ts";

/**
 * The files under `src/`, beside the driver's own, that name `driveMuscles`: through the checker,
 * so an import under another name and a read off the module's namespace are both found.
 */
function muscleDrivers(overlay = {}) {
  const { checker, sources } = programOver([...new Set([...sourcesUnder("src", ".ts"), ...Object.keys(overlay)])], overlay);
  const isDriver = (symbol) => {
    const target = symbol && symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
    return (target?.declarations ?? []).some((declaration) => ts.isFunctionDeclaration(declaration)
      && declaration.name?.text === "driveMuscles" && declaration.getSourceFile().fileName.endsWith(`/${MUSCLE_DRIVER}`));
  };
  const found = new Set();
  const visit = (node, file) => {
    if (ts.isIdentifier(node) && isDriver(checker.getSymbolAtLocation(node))) found.add(file);
    ts.forEachChild(node, (child) => visit(child, file));
  };
  for (const { source, file } of sources()) if (file.startsWith("src/") && file !== MUSCLE_DRIVER) visit(source, file);
  return [...found].sort();
}

test("in the game's source only the mind seam drives muscles", () => {
  assert.deepEqual(muscleDrivers(), ["src/core/mind/mind.ts"]);
  // The control: a page driving muscles itself is found, under another name and off the namespace.
  assert.deepEqual(muscleDrivers({
    "src/lab/renamed.ts": `import { driveMuscles as drive } from "../core/muscle/driver.ts";\nexport const d = drive;\n`,
    "src/lab/spaced.ts": `import * as driver from "../core/muscle/driver.ts";\nexport const d = driver.driveMuscles;\n`,
    // Reading the muscles is not driving them.
    "src/lab/reader.ts": `import type { MuscleDriver } from "../core/muscle/driver.ts";\nexport const ceiling = (d: MuscleDriver): number => d.ceiling[0]!;\n`,
  }), ["src/core/mind/mind.ts", "src/lab/renamed.ts", "src/lab/spaced.ts"]);
});

/** The folders a mind and its toolkit are written in, which meet the world through the report and the order sheet alone. */
const MIND_FOLDERS = ["src/core/mind/", "src/core/intent/", "src/core/navigation/", "src/core/perception/", "src/core/tactics/", "src/core/recovery/", "src/core/skills/",
  "src/core/control/", "src/core/reptile/", "src/core/option/", "src/entrants/"];

/** The adapters in those folders, which make the report and carry out the order sheet, and so hold the world. */
const MIND_ADAPTERS = new Set([
  "src/core/mind/mind.ts", "src/core/mind/hosted.ts", "src/core/mind/host.ts", "src/core/mind/senses.ts",
  "src/core/mind/object-senses.ts", "src/core/mind/direct.ts", "src/core/mind/motion.ts", "src/core/mind/minds.ts",
  "src/core/mind/body-actions.ts", "src/core/mind/sheets.ts", "src/core/control/assist.ts",
]);

/** What a mind's source never imports: the engine, the world, the builder, the read view's maker and the hands' port. */
const MIND_BARRED = ["src/core/engine/", "src/core/world.ts", "src/core/build/build-body.ts", "src/core/build/read-view.ts", "src/core/build/hand-poses.ts"];

/** The folder a Commander is written in, which meets its team through the view and the orders alone. */
const COMMAND_FOLDERS = ["src/core/command/"];

/** What a Commander's source never imports: what a mind may not, and a body, a fight's enlistment, a mind's host or the senses' hub. */
const COMMAND_BARRED = [...MIND_BARRED, "src/core/body.ts", "src/core/physical-body.ts", "src/core/combatant.ts", "src/core/mind/host.ts", "src/core/mind/senses.ts"];

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
    ["src/entrants/sly/mind.ts", `import type { World } from "../../core/world.ts";\nimport { readView } from "../../core/build/read-view.ts";\nexport const w = globalThis;\n`],
    ["src/core/skills/sly.ts", `import type { SegmentBody } from "../engine/engine.ts";\nimport RAPIER from "@dimforge/rapier3d-simd-compat";\n`],
    ["src/core/mind/host.ts", `import type { World } from "../world.ts";\n`],
    ["src/entrants/lucky/mind.ts", `export const pick = () => Math.random() < .5 ? Date.now() : performance.now();\n`],
  ]), [
    "src/entrants/sly/mind.ts imports src/core/world.ts",
    "src/entrants/sly/mind.ts imports src/core/build/read-view.ts",
    "src/entrants/sly/mind.ts reads globalThis",
    "src/core/skills/sly.ts imports src/core/engine/engine.ts",
    `src/core/skills/sly.ts imports the engine package "@dimforge/rapier3d-simd-compat"`,
    "src/entrants/lucky/mind.ts reads Math.random",
    "src/entrants/lucky/mind.ts reads the date",
    "src/entrants/lucky/mind.ts reads performance.now",
  ]);
});

/**
 * **The core's layers, bottom first** ([layers](../docs/architecture.md#the-layers)): each module
 * of `src/core/` by its folder, or by its file where one is named, the longest entry ruling. A
 * module imports its own layer or one below.
 */
const LAYERS = [
  ["math/", "state.ts", "sources.ts"],
  ["spec/", "human/", "items/", "reptile/spec.ts", "reptile/physique.ts", "character-attributes.ts"],
  ["engine/", "world.ts", "recording.ts"],
  ["build/", "read-body.ts", "read-motion.ts", "clock.ts"],
  ["muscle/", "rules/", "touches.ts", "control/assist.ts"],
  ["parts/", "data/", "learning/"],
  ["control/", "mind/", "body.ts", "physical-body.ts", "observation.ts", "equipment.ts", "human/equipment.ts"],
  ["skills/", "intent/", "navigation/", "perception/", "mind/kit.ts", "mind/decider.ts", "mind/engagement.ts", "mind/report.ts"],
  ["tactics/", "recovery/"],
  ["option/", "reptile/", "command/", "mind/config.ts", "mind/controller.ts", "mind/minds.ts", "mind/drill-opponent.ts",
    "tactics/fighter-kind.ts", "tactics/fighter.ts", "parts/entrant.ts"],
  ["toolkit.ts", "models.ts", "combatant.ts", "tasks/"],
];

/** Where the layers meet by design: the registries that list every kind of mind and part, and import each. */
const LAYER_REGISTRIES = new Set(["parts/lookup.ts", "parts/catalog.ts", "mind/kinds.ts", "toolkit.ts"]);

/**
 * **Today's imports up the layers**, each `from -> to` under `src/core/`, by what removes it. The
 * list is exact: an import up the layers not on it fails, and so does one the code no longer has,
 * so it only shrinks.
 */
const UP_STACK = [
  // The data store typed by what each key's reader declares (layering step 10).
  "data/edge-profiles.ts -> skills/framework/profile.ts", "data/gait-profiles.ts -> skills/framework/profile.ts", "data/store.ts -> skills/framework/profile.ts",
  "data/store.ts -> skills/strikes/punch-records.ts", "data/straight-punch.ts -> skills/strikes/punch-records.ts", "data/strike-profiles.ts -> skills/framework/profile.ts",
  // The body's ground reading and its lie beside the view's other readings (layering step 10).
  "body.ts -> recovery/ground/reading.ts", "perception/threat.ts -> recovery/ground/reading.ts", "perception/threat.ts -> recovery/rise/staged.ts",
  "mind/kit.ts -> recovery/rise/lowering.ts", "body.ts -> mind/kit.ts",
  // A mind's host takes its wiring, one way into a body (layering step 8).
  "mind/host.ts -> mind/minds.ts",
  // A part's fit by the body's command refusal: the body's shape, read from its spec for a second body family.
  "parts/parts.ts -> body.ts",
  // The engine's contact friction in a spec module (layering step 10).
  "engine/rapier.ts -> read-body.ts",
];

/** The layer of `file` (under `src/core/`) by `LAYERS`, the longest entry ruling; -1 for none. */
function layerOf(file) {
  let found = -1, length = -1;
  LAYERS.forEach((layer, i) => { for (const at of layer) if ((file === at || at.endsWith("/") && file.startsWith(at)) && at.length > length) { found = i; length = at.length; } });
  return found;
}

/** Each import among `files` (path under `src/core/` and source) that goes up the layers, `from -> to`, each once; and each module with no layer. */
function layerCrossings(files) {
  const up = new Set(), unlayered = [];
  for (const [file, source] of files) {
    const from = layerOf(file);
    if (from < 0) { unlayered.push(file); continue; }
    if (LAYER_REGISTRIES.has(file)) continue;
    for (const { fileName: specifier } of ts.preProcessFile(source, true, true).importedFiles) {
      if (!specifier.startsWith(".")) continue;
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(`${CORE}${file}`), specifier));
      if (target.startsWith(CORE) && layerOf(target.slice(CORE.length)) > from) up.add(`${file} -> ${target.slice(CORE.length)}`);
    }
  }
  return { up: [...up].sort(), unlayered };
}

test("the core's imports run down its layers: an import up them is one of today's, listed, and the list is exact", () => {
  const files = filesUnder(CORE).filter((file) => file.endsWith(".ts")).map((file) => [file.slice(CORE.length), fs.readFileSync(path.join(ROOT, file), "utf8")]);
  assert.ok(files.length > 100, "fewer than a hundred core modules read, so this test would pass on nothing");
  const { up, unlayered } = layerCrossings(files);
  assert.deepEqual(unlayered, [], "every core module has a layer");
  assert.deepEqual(up, [...UP_STACK].sort(), "the imports up the layers are exactly those listed");
  // The control: a skill reaching tactics, and a module in no layer, are found; a registry is not held to it.
  assert.deepEqual(layerCrossings([
    ["skills/sly.ts", `import { tacticsOf } from "../tactics/tactics-part.ts";\nimport type { MindConfig } from "../mind/config.ts";\nimport { dot } from "../spec/vec.ts";\n`],
    ["nowhere/sly.ts", ""],
    ["mind/kinds.ts", `import { OPTION_MIND } from "../option/mind.ts";\n`],
  ]), { up: ["skills/sly.ts -> mind/config.ts", "skills/sly.ts -> tactics/tactics-part.ts"], unlayered: ["nowhere/sly.ts"] });
});

/** The game's list of entrants and its catalog: the only modules that import every entrant. */
const ENTRANT_LISTS = new Set(["src/entrants/index.ts", "src/entrants/game.ts"]);

/** The entrant `file` is written in, `src/entrants/<name>/`, or null. */
const entrantOf = (file) => /^src\/entrants\/([^/]+)\//.exec(file)?.[1] ?? null;

/**
 * Each import among `files` (path and source) that leaves what an entrant may reach: the core, its
 * own folder and its own data (`assets/entrants/<name>/`), and the Babylon math the core turns with.
 * The game's lists may import any entrant.
 */
function entrantCrossings(files) {
  const crossings = [];
  for (const [file, source] of files) {
    const name = entrantOf(file);
    if (name === null || ENTRANT_LISTS.has(file)) continue;
    for (const { fileName: specifier } of ts.preProcessFile(source, true, true).importedFiles) {
      if (!specifier.startsWith(".")) {
        if (!specifier.startsWith("@babylonjs/core/Maths/")) crossings.push(`${file} imports the package "${specifier}"`);
        continue;
      }
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier));
      if (!target.startsWith(CORE) && entrantOf(target) !== name && !target.startsWith(`assets/entrants/${name}/`)) crossings.push(`${file} imports ${target}`);
    }
  }
  return crossings;
}

test("an entrant reaches only the core, its own folder and its own data: never another entrant, a world, an evaluation or a screen", () => {
  const files = filesUnder("src/entrants/").filter((file) => file.endsWith(".ts")).map((file) => [file, fs.readFileSync(path.join(ROOT, file), "utf8")]);
  assert.ok(new Set(files.map(([file]) => entrantOf(file)).filter(Boolean)).size > 1, "fewer than two entrants, so this test would pass on nothing");
  assert.deepEqual(entrantCrossings(files), []);
  // The control: an entrant reaching another entrant, a screen, an evaluation and another's data is found; the game's list is not held to it.
  assert.deepEqual(entrantCrossings([
    ["src/entrants/sly/index.ts", `import { CLASSIC } from "../classic/presets.ts";\nimport { Duel } from "../../arena/duel.ts";\nimport { MINDS } from "../game.ts";\n`],
    ["src/entrants/sly/data.ts", `import guard from "../../../assets/entrants/classic/guard.json" with { type: "json" };\nimport { opponentOf } from "../../evaluation/drill-opponents.ts";\n`],
    ["src/entrants/index.ts", `import { SLY } from "./sly/index.ts";\n`],
  ]), [
    "src/entrants/sly/index.ts imports src/entrants/classic/presets.ts",
    "src/entrants/sly/index.ts imports src/arena/duel.ts",
    "src/entrants/sly/index.ts imports src/entrants/game.ts",
    "src/entrants/sly/data.ts imports assets/entrants/classic/guard.json",
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
    ["src/core/command/sly.ts", `import type { PhysicalBody } from "../physical-body.ts";
import type { World } from "../world.ts";
export const w = globalThis;
`],
    ["src/core/command/sly-too.ts", `import { enlist } from "../combatant.ts";
import RAPIER from "@dimforge/rapier3d-simd-compat";
`],
  ], command), [
    "src/core/command/sly.ts imports src/core/physical-body.ts",
    "src/core/command/sly.ts imports src/core/world.ts",
    "src/core/command/sly.ts reads globalThis",
    "src/core/command/sly-too.ts imports src/core/combatant.ts",
    `src/core/command/sly-too.ts imports the engine package "@dimforge/rapier3d-simd-compat"`,
  ]);
});
