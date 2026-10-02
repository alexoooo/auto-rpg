/**
 * The core's boundary: `src/core/` reaches nothing but itself, its packages and data files under
 * `assets/`, checked over the transitive closure of its imports. The pages build on the core,
 * never the reverse. Also here: the core's bans on float32 rotations and cached world matrices, its
 * arithmetic, the engine seam and the mind seam.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { programOver, sourcesUnder } from "./harness/program.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const CORE = "src/core/";

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
  walk(path.join(ROOT, CORE));
  assert.deepEqual(offenders, [], "a core file turns a vector through a float32 matrix");
});

test("the core reads world transforms from its nodes, never through a cached world matrix", () => {
  // `getWorldMatrix()` short-circuits on the render id, and reading it stamps that id: every later
  // reader in the frame, a person at the console among them, reads the first sample. The core
  // reads `position` and `rotationQuaternion`; read out of the source, as no scene catches it cheaply.
  const banned = /\.getWorldMatrix\(|\.absolutePosition|\.absoluteRotationQuaternion|computeWorldMatrix\(/;
  const offenders = [];
  for (const file of filesUnder(CORE).filter((name) => name.endsWith(".ts"))) {
    for (const [index, line] of fs.readFileSync(path.join(ROOT, file), "utf8").split(/\r?\n/).entries()) {
      const code = line.replace(/\/\/.*$/, "").replace(/^\s*\*.*$/, "");
      if (banned.test(code)) offenders.push(`${file}:${index + 1}`);
    }
  }
  assert.deepEqual(offenders, [], "a core file reads a world matrix");
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
  const { checker, sources } = programOver(sourcesUnder("src/core", ".ts"), overlay);
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
  for (const { source, file } of sources()) if (file.startsWith(CORE)) visit(source, file);
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
 * What of `Math` is the same double in every JavaScript engine: its constants, and the operations
 * IEEE 754 or whole-number arithmetic fix. Everything else of it (a sine, an exponential, a power,
 * `hypot`) is right to about the last bit and each engine's own.
 */
const EXACT_MATH = new Set(["PI", "SQRT2", "abs", "max", "min", "sqrt", "ceil", "floor", "trunc", "round", "sign", "fround", "imul"]);

/** The modules beside the core whose numbers go into a bout's world: the arena's bout and its solids. */
const WORLD_BUILDERS = ["src/arena/duel.ts", "src/arena/room.ts"];

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

test("the core, and what builds a bout's world, compute with IEEE's operations and the core's own functions", () => {
  const files = [...filesUnder(CORE).filter((name) => name.endsWith(".ts")), ...WORLD_BUILDERS];
  assert.ok(files.includes("src/core/math/real.ts") && WORLD_BUILDERS.every((name) => fs.existsSync(path.join(ROOT, name))));
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
  "Quaternion.Identity", "Quaternion.InverseToRef", "Quaternion.RotationQuaternionFromAxis", "Quaternion.clone", "Quaternion.copyFrom",
  "Quaternion.copyFromFloats", "Quaternion.multiplyInPlace", "Quaternion.multiplyToRef", "Quaternion.normalize",
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
  const { checker, sources } = programOver(sourcesUnder("src/core", ".ts"), overlay);
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
  for (const { source, file } of sources()) if (file.startsWith(CORE)) visit(source, file);
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
