// Audits the two dependency graphs this repository admits.
//
// Cargo owns the whole workspace, where **every member** may reach only local
// workspace crates -- see AUDITED below for what each of the seven would cost.
// npm owns presentation tooling, where dependencies are
// allowed but every top-level request and every resolved artifact is pinned.
// Neither lockfile is treated as evidence about itself: the manifests, Cargo's
// view of its graph, and npm's resolved package records have to agree.
//
//     node tools/check_deps.js
//     node tools/check_deps.js --root path/to/a/fixture
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const DEPENDENCY_FIELDS = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"];
// **Every workspace member is audited, and the walk below seeds from all of
// them rather than from this list.** That distinction is the whole of a defect
// a review found: the seeds used to be a five-name set, `web` and `lab` were
// neither in it nor reachable from anything in it, and `sha2 = "0.10.8"` added
// straight to crates/web/Cargo.toml compiled into web.wasm, shipped to a
// browser, and left this audit printing "passed".
//
// The rule being enforced is the **no-dependency** one and not the determinism
// one -- four of the seven are not deterministic code at all. What each class
// would cost:
//
//   fx, sim, policy   the authoritative core, where a dependency is a
//                     determinism hazard on top of a supply-chain one
//   learn-core        floating point upstream of an argmax, no authoritative
//                     state -- but it is `crates/web`'s dependency, so anything
//                     it pulled in is compiled into web.wasm and handed to a
//                     browser
//   learn             the crate most likely to attract one, because v2-19 asks
//                     for a SHA-256 and `sha2` is one line away. That hash is
//                     hand-rolled in crates/learn-core/src/checkpoint.rs
//                     precisely because this audit would refuse the alternative
//   web               the browser boundary itself. fx, sim, policy and
//                     learn-core are all its direct dependencies, so shipping
//                     to a browser is this crate's consequence first and
//                     theirs by inheritance -- and its manifest says "no
//                     wasm-bindgen, no js-sys, no web-sys", which until now
//                     nothing checked
//   lab               `learn`'s one host, and the binary that prints every
//                     pinned hash
//
// The names are therefore a **presence** assertion and nothing more: the walk
// covers whatever Cargo reports, so a crate that disappeared would otherwise
// quietly shrink the audit instead of failing it.
const AUDITED = new Set(["fx", "sim", "policy", "learn-core", "learn", "lab", "web"]);
const LIFECYCLE_SCRIPTS = new Set([
  "preinstall", "install", "postinstall", "prepublish", "preprepare", "prepare",
  "postprepare", "prepublishOnly", "publish", "postpublish", "dependencies",
]);
const TOOL_MANIFESTS = [
  /^\.node-version$/,
  /^\.npmrc$/,
  /^Cargo\.toml$/,
  /^Cargo\.lock$/,
  /^package\.json$/,
  /^package-lock\.json$/,
  /^manifest\.json$/,
  /^toolchain\.json$/,
  /^requirements(?:[-.].*)?\.txt$/i,
  /^Pipfile(?:\.lock)?$/,
  /^Gemfile(?:\.lock)?$/,
  /^composer\.(?:json|lock)$/,
  /^pyproject\.toml$/,
  /^poetry\.lock$/,
  /^uv\.lock$/,
  /^environment(?:[-.].*)?\.ya?ml$/i,
  /^blender_manifest\.toml$/,
  /^deno\.jsonc?$/,
  /^bun\.lockb?$/,
  /^yarn\.lock$/,
  /^pnpm-lock\.yaml$/,
];
// These generated room records participate in the reviewed asset contract but use
// semantic filenames rather than the generic manifest.json convention. Keep the
// exception path-exact so an arbitrary JSON file cannot become a dependency input.
const AUDITED_MANIFEST_PATHS = new Set([
  "web/assets3d/room_slice.json",
  "web/assets3d/room_slice.validator.json",
  "tools/art/combatants-manifest.json",
  "web/assets3d/combatants.json",
  "web/assets3d/combatants.validator.json",
]);

function isAuditedManifestPath(relativePath, baseName) {
  return AUDITED_MANIFEST_PATHS.has(relativePath)
    || TOOL_MANIFESTS.some((pattern) => pattern.test(baseName));
}
// `.tools` is the ignored installation cache checked by check_toolchain.js.
// Walking a Blender distribution would audit Blender's own bundled templates
// as though they were dependency declarations committed by this repository.
// The remaining entries are generated dependency graphs. This list used to skip
// only installation caches, so adding the standalone warrior package made its
// Vinext output's two `.vite/manifest.json` files look like reviewed inputs.
// Those files describe a build we just produced; auditing them as sources both
// reverses the dependency direction and makes a clean tree differ from a built
// one. Their source package and lock remain visible and are audited below.
const SKIP_DIRS = new Set([
  ".git", ".next", ".tools", ".vinext", ".wrangler",
  "dist", "node_modules", "out", "target",
]);

// Vite's locked graph carries fsevents for native file watching on macOS. npm
// marks the package as having an install script even on hosts where the whole
// optional package is skipped. This is deliberately a predicate over the full
// lock record rather than permission by name: a version, path, platform or
// optionality change turns it back into an unaudited lifecycle script.
const LIFECYCLE_ALLOWLIST = {
  "node_modules/fsevents": {
    version: "2.3.3",
    optional: true,
    os: ["darwin"],
    direct: false,
    transitive: true,
  },
  // Sites' local Vinext path uses these three binary dispatch packages. npm
  // install is still run with scripts disabled in this repository; these exact
  // lock records are admitted so their declared lifecycle hooks cannot make a
  // version drift invisible to the dependency gate.
  "node_modules/sharp": {
    version: "0.34.5",
    direct: false,
    transitive: true,
  },
  "node_modules/workerd": {
    version: "1.20260515.1",
    direct: false,
    transitive: true,
  },
  "node_modules/wrangler/node_modules/esbuild": {
    version: "0.27.3",
    direct: false,
    transitive: true,
  },
};

function readJson(file, errors) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    errors.push(`${relative(file)}: cannot read valid JSON (${err.message})`);
    return null;
  }
}

let auditRoot = process.cwd();
function relative(file) {
  return path.relative(auditRoot, file) || path.basename(file);
}

function cargoMetadata(root, errors) {
  const out = spawnSync("cargo", ["metadata", "--format-version", "1", "--no-deps"], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
  });
  if (out.error) {
    errors.push(`Cargo.toml: could not run cargo metadata (${out.error.message})`);
    return null;
  }
  if (out.status !== 0) {
    const detail = (out.stderr || out.stdout || "no diagnostic").trim();
    errors.push(`Cargo.toml: cargo metadata failed: ${detail}`);
    return null;
  }
  try {
    return JSON.parse(out.stdout);
  } catch (err) {
    errors.push(`Cargo.toml: cargo metadata returned invalid JSON (${err.message})`);
    return null;
  }
}

function dependencySource(dep) {
  if (dep.source === null && dep.path) return "path";
  if (typeof dep.source !== "string") return "unknown";
  if (dep.source.startsWith("registry+")) return "registry";
  if (dep.source.startsWith("git+")) return "git";
  return "unknown";
}

function auditCargo(root, errors) {
  const manifest = path.join(root, "Cargo.toml");
  if (!fs.existsSync(manifest)) {
    errors.push("Cargo.toml: workspace manifest is missing");
    return;
  }
  const metadata = cargoMetadata(root, errors);
  if (!metadata) return;

  let canonicalRoot;
  try {
    canonicalRoot = fs.realpathSync(root);
  } catch (err) {
    errors.push(`Cargo.toml: cannot resolve workspace root (${err.message})`);
    return;
  }

  const packagesByDir = new Map();
  for (const pkg of metadata.packages || []) {
    const manifestPath = path.resolve(pkg.manifest_path);
    if (!fs.existsSync(manifestPath)) {
      errors.push(`${relative(manifestPath)}: cargo metadata names a missing workspace manifest`);
      continue;
    }
    try {
      const packageDir = fs.realpathSync(path.dirname(manifestPath));
      const rel = path.relative(canonicalRoot, packageDir);
      if (rel.startsWith("..") || path.isAbsolute(rel)) {
        errors.push(`${relative(manifestPath)}: workspace package ${pkg.name} leaves the repository after realpath resolution`);
      }
      packagesByDir.set(packageDir, pkg);
    } catch (err) {
      errors.push(`${relative(manifestPath)}: cannot resolve workspace package directory (${err.message})`);
    }
  }

  // `--no-deps` reports the workspace members and nothing else, so seeding from
  // every package is exactly "audit every crate this repository owns" -- and it
  // cannot be defeated by adding an eighth crate and forgetting a list.
  const queue = [];
  const seen = new Set();
  for (const pkg of metadata.packages || []) {
    queue.push({ pkg, trail: [pkg.name] });
  }
  for (const required of AUDITED) {
    if (!(metadata.packages || []).some((pkg) => pkg.name === required)) {
      errors.push(`Cargo.toml: audited workspace crate ${required} is missing`);
    }
  }

  while (queue.length) {
    const { pkg, trail } = queue.shift();
    if (seen.has(pkg.id)) continue;
    seen.add(pkg.id);
    for (const target of pkg.targets || []) {
      if (Array.isArray(target.kind) && target.kind.includes("custom-build")) {
        errors.push(
          `${relative(pkg.manifest_path)}: audited dependency path ${trail.join(" -> ")} `
          + `uses forbidden custom-build target ${target.name}`,
        );
      }
    }
    for (const dep of pkg.dependencies || []) {
      const kind = dep.kind || "normal";
      const source = dependencySource(dep);
      const nextTrail = [...trail, `${dep.name} (${kind}, ${source})`];
      if (source === "registry" || source === "git") {
        errors.push(`${relative(pkg.manifest_path)}: audited dependency path ${nextTrail.join(" -> ")} is forbidden`);
        continue;
      }
      if (source !== "path") {
        errors.push(`${relative(pkg.manifest_path)}: dependency ${dep.name} has unrecognized Cargo source ${String(dep.source)}`);
        continue;
      }
      let depDir;
      try {
        depDir = fs.realpathSync(path.resolve(dep.path));
      } catch (err) {
        errors.push(`${relative(pkg.manifest_path)}: local dependency ${dep.name} cannot be resolved (${err.message})`);
        continue;
      }
      const rel = path.relative(canonicalRoot, depDir);
      if (rel.startsWith("..") || path.isAbsolute(rel)) {
        errors.push(`${relative(pkg.manifest_path)}: audited dependency path ${nextTrail.join(" -> ")} leaves the workspace`);
        continue;
      }
      const target = packagesByDir.get(depDir);
      if (!target) {
        errors.push(`${relative(pkg.manifest_path)}: local dependency ${dep.name} is not a workspace package, so its sources cannot be audited`);
        continue;
      }
      queue.push({ pkg: target, trail: nextTrail });
    }
  }
}

function exactVersion(value) {
  return typeof value === "string" && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(value);
}

function configuredRegistry(root) {
  const npmrc = path.join(root, ".npmrc");
  if (!fs.existsSync(npmrc)) return "https://registry.npmjs.org/";
  for (const raw of fs.readFileSync(npmrc, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith(";")) continue;
    const match = /^registry\s*=\s*(\S+)\s*$/.exec(line);
    if (match) return match[1].endsWith("/") ? match[1] : `${match[1]}/`;
  }
  return "https://registry.npmjs.org/";
}

function validIntegrity(value) {
  if (typeof value !== "string" || !value.trim()) return false;
  const sizes = { sha256: 32, sha384: 48, sha512: 64 };
  return value.trim().split(/\s+/).every((token) => {
    const match = /^(sha256|sha384|sha512)-([A-Za-z0-9+/]+={0,2})$/.exec(token);
    if (!match) return false;
    const bytes = Buffer.from(match[2], "base64");
    return bytes.length === sizes[match[1]] && bytes.toString("base64") === match[2];
  });
}

function parentPackageLocation(where) {
  const at = where.lastIndexOf("/node_modules/");
  return at === -1 ? "" : where.slice(0, at);
}

function resolveLockedDependency(packages, where, name) {
  let owner = where;
  for (;;) {
    const candidate = owner ? `${owner}/node_modules/${name}` : `node_modules/${name}`;
    if (packages[candidate]) return candidate;
    if (!owner) return null;
    owner = parentPackageLocation(owner);
  }
}

function lockReachability(packages) {
  const reachable = new Set([""]);
  const incoming = new Map();
  const queue = [""];
  while (queue.length) {
    const where = queue.shift();
    const entry = packages[where] || {};
    // npm 7+ installs peer dependencies into the lock graph. Ignoring those
    // edges made the Sites graph's Webpack and source-map closure look orphaned
    // even though the package that requested each peer was reachable.
    const fields = where === ""
      ? DEPENDENCY_FIELDS
      : ["dependencies", "optionalDependencies", "peerDependencies"];
    for (const field of fields) {
      for (const name of Object.keys(entry[field] || {})) {
        const target = resolveLockedDependency(packages, where, name);
        if (!target) continue;
        if (!incoming.has(target)) incoming.set(target, new Set());
        incoming.get(target).add(where);
        if (!reachable.has(target)) {
          reachable.add(target);
          queue.push(target);
        }
      }
    }
  }
  return { reachable, incoming };
}

function auditNpm(root, errors) {
  const manifestFile = path.join(root, "package.json");
  const lockFile = path.join(root, "package-lock.json");
  if (!fs.existsSync(manifestFile) && !fs.existsSync(lockFile)) return;
  if (!fs.existsSync(manifestFile)) {
    errors.push("package.json: missing beside package-lock.json");
    return;
  }
  if (!fs.existsSync(lockFile)) {
    errors.push("package-lock.json: missing beside package.json");
    return;
  }
  const manifest = readJson(manifestFile, errors);
  const lock = readJson(lockFile, errors);
  if (!manifest || !lock) return;
  if (lock.lockfileVersion !== 3) errors.push(`package-lock.json: lockfileVersion must be 3, got ${String(lock.lockfileVersion)}`);
  if (!lock.packages || typeof lock.packages !== "object" || !lock.packages[""]) {
    errors.push("package-lock.json: packages[\"\"] root record is missing");
    return;
  }

  const rootRecord = lock.packages[""];
  for (const field of DEPENDENCY_FIELDS) {
    const requested = manifest[field] || {};
    const locked = rootRecord[field] || {};
    for (const [name, version] of Object.entries(requested)) {
      if (!exactVersion(version)) errors.push(`package.json: ${field}.${name} must be an exact version, got ${JSON.stringify(version)}`);
      if (locked[name] !== version) {
        errors.push(`package-lock.json: packages[\"\"].${field}.${name} is ${JSON.stringify(locked[name])}, manifest requests ${JSON.stringify(version)}`);
      }
      const entry = lock.packages[`node_modules/${name}`];
      if (!entry) errors.push(`package-lock.json: missing lock entry node_modules/${name}`);
      else if (exactVersion(version) && entry.version !== version) {
        errors.push(`package-lock.json: node_modules/${name} resolved ${JSON.stringify(entry.version)}, manifest pins ${version}`);
      }
    }
    for (const name of Object.keys(locked)) {
      if (!(name in requested)) errors.push(`package-lock.json: packages[\"\"].${field}.${name} is absent from package.json`);
    }
  }

  for (const name of Object.keys(manifest.scripts || {})) {
    if (LIFECYCLE_SCRIPTS.has(name)) errors.push(`package.json: lifecycle script ${name} is not allowlisted`);
  }

  const registry = configuredRegistry(root);
  const graph = lockReachability(lock.packages);
  for (const [where, entry] of Object.entries(lock.packages)) {
    if (where === "") continue;
    if (!entry || typeof entry !== "object") {
      errors.push(`package-lock.json: ${where} is not a package record`);
      continue;
    }
    if (!graph.reachable.has(where)) {
      errors.push(`package-lock.json: ${where} is unreachable from the root manifest`);
    }
    if (entry.hasInstallScript) auditLockedLifecycle(where, entry, rootRecord, graph, errors);
    if (typeof entry.version !== "string" || !entry.version) errors.push(`package-lock.json: ${where} has no resolved version`);
    if (typeof entry.resolved !== "string" || !entry.resolved.startsWith(registry)) {
      errors.push(`package-lock.json: ${where} resolved from non-registry source ${JSON.stringify(entry.resolved)}; expected ${registry}`);
    }
    if (!validIntegrity(entry.integrity)) {
      errors.push(`package-lock.json: ${where} has no valid lockfile integrity`);
    }
    for (const field of ["dependencies", "optionalDependencies"]) {
      const dependencies = entry[field] || {};
      if (!dependencies || typeof dependencies !== "object" || Array.isArray(dependencies)) {
        errors.push(`package-lock.json: ${where}.${field} is not a dependency map`);
        continue;
      }
      for (const name of Object.keys(dependencies)) {
        if (!resolveLockedDependency(lock.packages, where, name)) {
          errors.push(`package-lock.json: ${where}.${field}.${name} has no lock entry in its npm ancestor chain`);
        }
      }
    }
  }
}

function auditNpmRoots(root, errors) {
  // The root client was the repository's only npm graph when this audit was
  // written, and `auditNpm(root)` encoded that fact as though it were a rule.
  // A top-level independent experiment is useful only if its independence does
  // not also make its lock invisible. Discover every source package manifest
  // through the same fail-closed walk that inventories tool manifests, then
  // audit each package/lock pair with the existing graph checks.
  const roots = new Set();
  walk(root, (file) => {
    if (path.basename(file) === "package.json") roots.add(path.dirname(file));
  });
  for (const packageRoot of [...roots].sort()) auditNpm(packageRoot, errors);
}

function auditLockedLifecycle(where, entry, rootRecord, graph, errors) {
  const allowed = LIFECYCLE_ALLOWLIST[where];
  if (!allowed) {
    errors.push(`package-lock.json: ${where} has an unaudited lifecycle install script`);
    return;
  }
  const packageName = where.slice(where.lastIndexOf("node_modules/") + "node_modules/".length);
  const direct = DEPENDENCY_FIELDS.some((field) => rootRecord[field] && packageName in rootRecord[field]);
  const transitive = graph.reachable.has(where)
    && [...(graph.incoming.get(where) || [])].some((parent) => parent !== "");
  const exactOptional = allowed.optional === undefined || entry.optional === allowed.optional;
  const exactOs = allowed.os === undefined || (Array.isArray(entry.os)
    && entry.os.length === allowed.os.length
    && entry.os.every((value, i) => value === allowed.os[i]));
  const exactDirect = allowed.direct === undefined || direct === allowed.direct;
  const exactTransitive = allowed.transitive === undefined || transitive === allowed.transitive;
  if (entry.version === allowed.version && exactOptional && exactOs && exactDirect && exactTransitive) return;
  const expected = [
    allowed.transitive ? "transitive" : null,
    `version ${allowed.version}`,
    allowed.optional === undefined ? null : `optional ${allowed.optional}`,
    allowed.os === undefined ? null : `os ${JSON.stringify(allowed.os)}`,
    allowed.direct === undefined ? null : `direct ${allowed.direct}`,
  ].filter(Boolean).join(", ");
  errors.push(
    `package-lock.json: ${where} has a lifecycle install script but does not match its audited exception `
    + `(expected ${expected}; got version `
    + `${JSON.stringify(entry.version)}, optional ${JSON.stringify(entry.optional)}, os ${JSON.stringify(entry.os)}, `
    + `direct ${direct}, reachable transitive ${transitive})`,
  );
}

function walk(dir, visit) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    if (item.isDirectory() && SKIP_DIRS.has(item.name)) continue;
    const file = path.join(dir, item.name);
    if (item.isDirectory()) walk(file, visit);
    else if (item.isFile()) visit(file);
  }
}

function auditToolManifests(root, errors) {
  const toolchainFile = path.join(root, "tools", "toolchain.json");
  if (!fs.existsSync(toolchainFile)) {
    errors.push("tools/toolchain.json: dependency and tool manifest inventory is missing");
    return;
  }
  const toolchain = readJson(toolchainFile, errors);
  if (!toolchain) return;
  if (!Array.isArray(toolchain.manifests) || toolchain.manifests.some((v) => typeof v !== "string")) {
    errors.push("tools/toolchain.json: manifests must be an array of repository-relative paths");
    return;
  }

  const covered = new Set();
  for (const value of toolchain.manifests) {
    const rel = value.replaceAll("\\", "/");
    const resolved = path.resolve(root, rel);
    const inside = path.relative(root, resolved);
    if (!rel || path.isAbsolute(rel) || inside.startsWith("..") || path.isAbsolute(inside)) {
      errors.push(`tools/toolchain.json: manifest path ${JSON.stringify(value)} leaves the repository`);
      continue;
    }
    if (covered.has(rel)) {
      errors.push(`tools/toolchain.json: manifest ${rel} is listed more than once`);
      continue;
    }
    covered.add(rel);
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
      errors.push(`tools/toolchain.json: listed manifest ${rel} is missing`);
    }
  }

  const found = new Set();
  walk(root, (file) => {
    const rel = path.relative(root, file).replaceAll("\\", "/");
    const base = path.basename(file);
    if (!isAuditedManifestPath(rel, base)) return;
    found.add(rel);
    if (!covered.has(rel)) {
      errors.push(`${rel}: tool or asset dependency manifest is not covered by tools/toolchain.json`);
    }
  });
  for (const rel of covered) {
    if (!found.has(rel)) {
      errors.push(`tools/toolchain.json: ${rel} is listed as a manifest but its filename is not an audited manifest form`);
    }
  }
}

function audit(root) {
  auditRoot = path.resolve(root);
  const errors = [];
  auditCargo(auditRoot, errors);
  auditNpmRoots(auditRoot, errors);
  auditToolManifests(auditRoot, errors);
  return errors;
}

function rootFromArgs(argv) {
  const at = argv.indexOf("--root");
  if (at === -1) return path.resolve(__dirname, "..");
  if (!argv[at + 1]) throw new Error("--root requires a directory");
  return path.resolve(argv[at + 1]);
}

if (require.main === module) {
  let errors;
  try {
    errors = audit(rootFromArgs(process.argv.slice(2)));
  } catch (err) {
    console.error(`dependency audit could not start: ${err.message}`);
    process.exitCode = 1;
  }
  if (errors && errors.length) {
    console.error(`dependency audit failed with ${errors.length} problem${errors.length === 1 ? "" : "s"}:`);
    for (const error of errors) console.error(`  - ${error}`);
    process.exitCode = 1;
  } else if (errors) {
    console.log("dependency audit passed: every workspace crate reaches workspace paths only, and the npm lock is pinned");
  }
}

module.exports = { audit };
