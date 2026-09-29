/**
 * The core's boundary: `src/core/` reaches nothing but itself, the engine packages, data files
 * under `assets/`, and the engine glue it has taken on purpose.
 *
 * The rule is the plan's first (`docs/plans/2026-09-28-core-foundation.md`, "Rules for the
 * core"). It is checked on the **transitive** closure, because the old path's coupling ran through
 * files that looked harmless: `src/physics.ts` holds no body knowledge and still imports
 * `src/config.ts`. So an outside file is admitted by name, with its reason, and its own imports
 * are held to the same rule.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const ROOT = path.resolve(import.meta.dirname, "..");
const CORE = "src/core/";

/** Packages the core may import, by prefix. The browser runs the core, so no `node:` builtins. */
const PACKAGES = ["@babylonjs/core/", "@dimforge/rapier3d-simd-compat"];

/**
 * Files outside `src/core/` the core has taken, with why. Empty until the core takes one; each
 * entry is engine glue that holds no body knowledge, and its imports must pass this same check.
 */
const TAKEN = new Map([]);

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
      if (inside(target) || TAKEN.has(target) || isData(target)) visit(target, [...chain, file]);
      else violations.push(`${route} imports ${target}`);
    }
  };
  for (const entry of entries) visit(entry, []);
  return violations;
}

const inCore = (file) => file.startsWith(CORE);

test("nothing the core reaches leaves the core, its packages, its data or the glue it has taken", () => {
  const sources = filesUnder(CORE).filter((file) => file.endsWith(".ts"));
  assert.ok(sources.length > 0, "src/core/ has no modules, so this test would pass on nothing");
  assert.deepEqual(boundaryViolations(sources, inCore), []);
});

test("the boundary check finds a crossing where there is one", () => {
  // The control: the legacy human's body, held to the core's rule, reaches the golem tables and
  // the old global tuning. If the walk stopped finding these, the test above would prove nothing.
  const violations = boundaryViolations(["src/golem/humanoid/body.ts"],
    (file) => file.startsWith("src/golem/humanoid/"));
  assert.ok(violations.some((line) => line.endsWith(" imports src/golem/config.ts")), violations.join("\n"));
  // And transitively: `src/physics.ts` holds no body knowledge but imports `src/config.ts`, so
  // taking it would carry the old tuning in.
  const glue = boundaryViolations(["src/physics.ts"], (file) => file === "src/physics.ts");
  assert.ok(glue.some((line) => line.endsWith(" imports src/config.ts")), glue.join("\n"));
});

test("every file the core has taken exists and is outside it", () => {
  for (const [file, why] of TAKEN) {
    assert.ok(fs.existsSync(path.join(ROOT, file)), file);
    assert.ok(!inCore(file), `${file} is inside the core and needs no entry`);
    assert.ok(why.length > 0, `${file} says why it was taken`);
  }
});

test("the core turns vectors in double precision, never through Babylon's float32 matrices", () => {
  // `Vector3.rotateByQuaternionToRef` builds a rotation `Matrix`, a Float32Array: a point turned
  // through it carries 1e-8 m of noise, which made a Jacobian differenced by 1e-7 rad a quarter
  // wrong and the inverse kinematics wander (H75). `applyRotationQuaternionToRef` is exact.
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
