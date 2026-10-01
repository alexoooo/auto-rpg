/**
 * The core's boundary: `src/core/` reaches nothing but itself, its packages and data files under
 * `assets/`, checked over the transitive closure of its imports. The pages build on the core,
 * never the reverse. Also here: the core's bans on float32 rotations and cached world matrices, and
 * the engine seam.
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
  // through it carries 1e-8 m of noise, enough to make a Jacobian differenced by 1e-7 rad a quarter
  // wrong. `applyRotationQuaternionToRef` is exact.
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
