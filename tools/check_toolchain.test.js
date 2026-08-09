"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

const { blenderVersion, check, cleanVersion, validateManifest } = require("./check_toolchain.js");

function manifest() {
  return {
    schemaVersion: 1,
    node: "22.12.0",
    npm: "10.9.0",
    typescript: "6.0.3",
    vite: "8.1.5",
    babylon: "9.18.1",
    babylonLoaders: "9.18.1",
    babylonGltfInterface: "9.18.1",
    blender: "4.5.12",
    gltfValidator: "2.0.0-dev.3.10",
    downloads: {
      nodeWindowsX64Zip: {
        fileName: "node-v22.12.0-win-x64.zip",
        url: "https://nodejs.org/dist/v22.12.0/node-v22.12.0-win-x64.zip",
        archiveSha256: "c".repeat(64),
        archiveSha256Source: "https://nodejs.org/dist/v22.12.0/SHASUMS256.txt",
        binaryRelativePath: "node.exe",
        binarySha256: "d".repeat(64),
        localExecutablePath: ".tools/node-v22.12.0/node-v22.12.0-win-x64/node.exe",
        localNpmPath: ".tools/node-v22.12.0/node-v22.12.0-win-x64/npm.cmd",
        status: "verified",
      },
      blenderWindowsX64Zip: {
        fileName: "blender-4.5.12-windows-x64.zip",
        url: "https://download.blender.org/release/Blender4.5/blender-4.5.12-windows-x64.zip",
        archiveSha256: "a".repeat(64),
        archiveSha256Source: "https://download.blender.org/release/Blender4.5/blender-4.5.12.sha256",
        binaryRelativePath: "blender.exe",
        binarySha256: "b".repeat(64),
        localExecutablePath: ".tools/blender-4.5.12/blender-4.5.12-windows-x64/blender.exe",
        status: "verified",
      },
    },
  };
}

function fixture(value) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "auto-rpg-toolchain-"));
  fs.mkdirSync(path.join(root, "tools"));
  fs.writeFileSync(path.join(root, "tools", "toolchain.json"), `${JSON.stringify(value, null, 2)}\n`);
  fs.writeFileSync(path.join(root, ".node-version"), `${value.node}\n`);
  fs.writeFileSync(
    path.join(root, ".npmrc"),
    "engine-strict=true\nsave-exact=true\npackage-lock=true\nignore-scripts=true\nregistry=https://registry.npmjs.org/\n",
  );
  const pkg = {
    name: "fixture",
    version: "1.0.0",
    private: true,
    packageManager: `npm@${value.npm}`,
    dependencies: {
      "@babylonjs/core": value.babylon,
      "@babylonjs/loaders": value.babylonLoaders,
      "babylonjs-gltf2interface": value.babylonGltfInterface,
    },
    devDependencies: {
      "gltf-validator": value.gltfValidator,
      typescript: value.typescript,
      vite: value.vite,
    },
  };
  const lock = {
    name: "fixture",
    version: "1.0.0",
    lockfileVersion: 3,
    packages: {
      "": {
        name: "fixture",
        version: "1.0.0",
        dependencies: pkg.dependencies,
        devDependencies: pkg.devDependencies,
      },
      "node_modules/@babylonjs/core": { version: value.babylon },
      "node_modules/@babylonjs/loaders": { version: value.babylonLoaders },
      "node_modules/babylonjs-gltf2interface": { version: value.babylonGltfInterface },
      "node_modules/gltf-validator": { version: value.gltfValidator },
      "node_modules/typescript": { version: value.typescript },
      "node_modules/vite": { version: value.vite },
    },
  };
  fs.writeFileSync(path.join(root, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`);
  fs.writeFileSync(path.join(root, "package-lock.json"), `${JSON.stringify(lock, null, 2)}\n`);
  return root;
}

test("version_output_is_parsed_without_accepting_a_prefix_match", () => {
  assert.equal(cleanVersion("v22.12.0\n"), "22.12.0");
  assert.equal(cleanVersion("22.12.0-rc.1\n"), "22.12.0-rc.1");
  assert.equal(cleanVersion("release-22.12.0"), null);
  assert.equal(blenderVersion("Blender 4.5.12\n\tbuild date: 2026-01-01"), "4.5.12");
});

test("unresolved_blender_checksums_fail_closed", () => {
  const value = manifest();
  value.downloads.blenderWindowsX64Zip.status = "unresolved";
  value.downloads.blenderWindowsX64Zip.archiveSha256 = null;
  value.downloads.blenderWindowsX64Zip.archiveSha256Source = null;
  value.downloads.blenderWindowsX64Zip.binarySha256 = null;
  const errors = validateManifest(value);
  assert.ok(errors.some((error) => error.includes("identity is unresolved")));
  assert.ok(errors.some((error) => error.includes("archiveSha256")));
  assert.ok(errors.some((error) => error.includes("binarySha256")));
});

test("the_pinned_toolchain_matches_the_running_tools", () => {
  const value = manifest();
  const root = fixture(value);
  const result = check(root, {
    node: value.node,
    npm: value.npm,
    blender: null,
    gltfValidator: null,
  });
  assert.deepEqual(result.errors, []);
  assert.equal(result.notes.length, 2);
});

test("present_phase_tools_must_match_the_pin", () => {
  const value = manifest();
  const root = fixture(value);
  const result = check(root, {
    node: value.node,
    npm: value.npm,
    blender: "4.5.11",
    gltfValidator: "2.0.0-dev.3.9",
  });
  assert.ok(result.errors.some((error) => error.includes("Blender is 4.5.11")));
  assert.ok(result.errors.some((error) => error.includes("gltf-validator is 2.0.0-dev.3.9")));
});

test("version_manager_and_npm_policy_files_cannot_drift_from_the_manifest", () => {
  const value = manifest();
  const root = fixture(value);
  fs.writeFileSync(path.join(root, ".node-version"), "22.11.0\n");
  fs.writeFileSync(path.join(root, ".npmrc"), "save-exact=false\n");
  const result = check(root, {
    node: value.node,
    npm: value.npm,
    blender: null,
    gltfValidator: null,
  });
  assert.ok(result.errors.some((error) => error.includes(".node-version is 22.11.0")));
  assert.ok(result.errors.some((error) => error.includes("save-exact=true")));
  assert.ok(result.errors.some((error) => error.includes("ignore-scripts=true")));
});

test("package_manifest_and_lock_versions_match_the_toolchain", () => {
  const value = manifest();
  const root = fixture(value);
  const pkgFile = path.join(root, "package.json");
  const lockFile = path.join(root, "package-lock.json");
  const pkg = JSON.parse(fs.readFileSync(pkgFile, "utf8"));
  const lock = JSON.parse(fs.readFileSync(lockFile, "utf8"));
  pkg.packageManager = "npm@10.8.0";
  pkg.devDependencies.typescript = "6.0.2";
  lock.packages["node_modules/vite"].version = "8.1.4";
  fs.writeFileSync(pkgFile, `${JSON.stringify(pkg, null, 2)}\n`);
  fs.writeFileSync(lockFile, `${JSON.stringify(lock, null, 2)}\n`);
  const result = check(root, {
    node: value.node,
    npm: value.npm,
    blender: null,
    gltfValidator: null,
  });
  assert.ok(result.errors.some((error) => error.includes("packageManager is npm@10.8.0")));
  assert.ok(result.errors.some((error) => error.includes("package.json typescript is 6.0.2")));
  assert.ok(result.errors.some((error) => error.includes("resolved vite is 8.1.4")));
});

test("download_identity_is_tied_to_version_platform_and_official_host", () => {
  const value = manifest();
  value.downloads.blenderWindowsX64Zip.url = "https://example.com/blender.zip";
  value.downloads.blenderWindowsX64Zip.fileName = "blender-latest.zip";
  value.downloads.nodeWindowsX64Zip.archiveSha256Source = "https://example.com/SHASUMS256.txt";
  const errors = validateManifest(value);
  assert.ok(errors.some((error) => error.includes("filename")));
  assert.ok(errors.some((error) => error.includes("official release identity")));
  assert.ok(errors.some((error) => error.includes("Node archiveSha256Source")));
});
