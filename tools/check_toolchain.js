// Fails closed when the tools that can change checked-in output drift from the
// versions and binaries reviewed in tools/toolchain.json.
//
// Node and npm are the repository's host toolchain and are therefore required.
// Blender and gltf-validator are phase tools: an ordinary Rust checkout need
// not have them installed, but a copy that is present must be exactly the copy
// named by the manifest. An unresolved download identity is always an error --
// absence is allowed; an unaudited artifact source is not.
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const MANIFEST = path.join("tools", "toolchain.json");
const SHA256 = /^[0-9a-f]{64}$/;

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(`${file}: ${error.message}`);
  }
}

function cleanVersion(text) {
  const match = String(text).match(/(?:^|\s)v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)(?:\s|$)/);
  return match ? match[1] : null;
}

function blenderVersion(text) {
  const match = String(text).match(/^Blender\s+(\d+\.\d+\.\d+)(?:\s|$)/m);
  return match ? match[1] : null;
}

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function command(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8", windowsHide: true });
  if (result.error && result.error.code === "ENOENT") return null;
  if (result.error) throw new Error(`could not run ${command}: ${result.error.message}`);
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || "no diagnostic").trim();
    throw new Error(`${command} exited ${result.status}: ${detail}`);
  }
  return `${result.stdout || ""}\n${result.stderr || ""}`;
}

function findCommand(name) {
  const finder = process.platform === "win32" ? "where.exe" : "which";
  const found = spawnSync(finder, [name], { encoding: "utf8", windowsHide: true });
  if (found.error || found.status !== 0) return null;
  return (found.stdout || "").split(/\r?\n/).map((line) => line.trim()).find(Boolean) || null;
}

function npmVersion() {
  const besideNode = path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
  const unixPrefix = path.resolve(path.dirname(process.execPath), "..", "lib", "node_modules", "npm", "bin", "npm-cli.js");
  const cli = [process.env.npm_execpath, besideNode, unixPrefix].find((file) => file && fs.existsSync(file));
  if (cli) return readJson(path.resolve(path.dirname(cli), "..", "package.json")).version;
  const output = command("npm", ["--version"]);
  return output && cleanVersion(output);
}

function validateManifest(manifest) {
  const errors = [];
  const exactKeys = [
    "node", "npm", "typescript", "vite", "babylon", "babylonLoaders",
    "babylonGltfInterface", "blender", "gltfValidator",
  ];
  if (manifest.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  for (const key of exactKeys) {
    if (typeof manifest[key] !== "string" || cleanVersion(manifest[key]) !== manifest[key]) {
      errors.push(`${key} must be an exact semantic version`);
    }
  }

  const nodeDownload = manifest.downloads && manifest.downloads.nodeWindowsX64Zip;
  if (!nodeDownload || typeof nodeDownload !== "object") {
    errors.push("downloads.nodeWindowsX64Zip is required");
  } else {
    const fileName = `node-v${manifest.node}-win-x64.zip`;
    if (nodeDownload.fileName !== fileName) errors.push("Node ZIP filename does not match the pinned version and Windows x64 platform");
    if (nodeDownload.url !== `https://nodejs.org/dist/v${manifest.node}/${fileName}`) {
      errors.push("Node ZIP URL is not the expected official release identity");
    }
    if (nodeDownload.archiveSha256Source !== `https://nodejs.org/dist/v${manifest.node}/SHASUMS256.txt`) {
      errors.push("Node archiveSha256Source is not the exact official SHASUMS256.txt identity");
    }
    if (nodeDownload.binaryRelativePath !== "node.exe") errors.push("Node binaryRelativePath must be node.exe");
    if (nodeDownload.localExecutablePath !== `.tools/node-v${manifest.node}/node-v${manifest.node}-win-x64/node.exe`) {
      errors.push("Node localExecutablePath does not match the project-local portable layout");
    }
    if (nodeDownload.localNpmPath !== `.tools/node-v${manifest.node}/node-v${manifest.node}-win-x64/npm.cmd`) {
      errors.push("Node localNpmPath does not match the project-local portable layout");
    }
    validateVerifiedDownload("Node", nodeDownload, errors);
  }

  const download = manifest.downloads && manifest.downloads.blenderWindowsX64Zip;
  if (!download || typeof download !== "object") {
    errors.push("downloads.blenderWindowsX64Zip is required");
    return errors;
  }
  if (download.fileName !== `blender-${manifest.blender}-windows-x64.zip`) {
    errors.push("Blender ZIP filename does not match the pinned Blender version and Windows x64 platform");
  }
  if (download.url !== `https://download.blender.org/release/Blender4.5/${download.fileName}`) {
    errors.push("Blender ZIP URL is not the expected official release identity");
  }
  if (download.archiveSha256Source !== `https://download.blender.org/release/Blender4.5/blender-${manifest.blender}.sha256`) {
    errors.push("Blender archiveSha256Source is not the exact official checksum identity");
  }
  if (download.binaryRelativePath !== "blender.exe") {
    errors.push("Blender binaryRelativePath must be blender.exe for the Windows x64 ZIP");
  }
  if (download.localExecutablePath !== `.tools/blender-${manifest.blender}/blender-${manifest.blender}-windows-x64/blender.exe`) {
    errors.push("Blender localExecutablePath does not match the project-local portable layout");
  }
  validateVerifiedDownload("Blender", download, errors);
  return errors;
}

function validateVerifiedDownload(name, download, errors) {
  if (download.status !== "verified") {
    errors.push(`${name} download identity is unresolved: verify the archive and extracted binary SHA-256 values, then set status to verified`);
  }
  if (typeof download.archiveSha256 !== "string" || !SHA256.test(download.archiveSha256)) {
    errors.push(`${name} archiveSha256 must be a lowercase 64-digit SHA-256`);
  }
  if (typeof download.binarySha256 !== "string" || !SHA256.test(download.binarySha256)) {
    errors.push(`${name} binarySha256 must be a lowercase 64-digit SHA-256`);
  }
}

function installedValidatorVersion(root) {
  const file = path.join(root, "node_modules", "gltf-validator", "package.json");
  return fs.existsSync(file) ? readJson(file).version : null;
}

function checkOwnershipFiles(root, manifest) {
  const errors = [];
  const nodeFile = path.join(root, ".node-version");
  const nodePin = fs.existsSync(nodeFile) ? fs.readFileSync(nodeFile, "utf8").trim() : null;
  if (nodePin !== manifest.node) errors.push(`.node-version is ${nodePin || "missing"}; expected ${manifest.node}`);

  const npmrcFile = path.join(root, ".npmrc");
  const npmrc = new Map();
  if (fs.existsSync(npmrcFile)) {
    for (const raw of fs.readFileSync(npmrcFile, "utf8").split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const at = line.indexOf("=");
      if (at !== -1) npmrc.set(line.slice(0, at), line.slice(at + 1));
    }
  }
  const required = {
    "engine-strict": "true",
    "save-exact": "true",
    "package-lock": "true",
    "ignore-scripts": "true",
    registry: "https://registry.npmjs.org/",
  };
  for (const [key, value] of Object.entries(required)) {
    if (npmrc.get(key) !== value) errors.push(`.npmrc must set ${key}=${value}`);
  }
  return errors;
}

function checkPackageFiles(root, manifest) {
  const errors = [];
  const packageFile = path.join(root, "package.json");
  const lockFile = path.join(root, "package-lock.json");
  if (!fs.existsSync(packageFile)) return ["package.json is missing"];
  if (!fs.existsSync(lockFile)) return ["package-lock.json is missing"];
  const pkg = readJson(packageFile);
  const lock = readJson(lockFile);
  const expected = [
    ["typescript", "typescript", "devDependencies"],
    ["vite", "vite", "devDependencies"],
    ["babylon", "@babylonjs/core", "dependencies"],
    ["babylonLoaders", "@babylonjs/loaders", "dependencies"],
    ["babylonGltfInterface", "babylonjs-gltf2interface", "dependencies"],
    ["gltfValidator", "gltf-validator", "devDependencies"],
  ];
  if (pkg.packageManager !== `npm@${manifest.npm}`) {
    errors.push(`package.json packageManager is ${pkg.packageManager || "missing"}; expected npm@${manifest.npm}`);
  }
  const lockRoot = lock.packages && lock.packages[""];
  if (!lockRoot) errors.push("package-lock.json has no root package entry");
  for (const [manifestKey, packageName, section] of expected) {
    const version = manifest[manifestKey];
    const declared = pkg[section] && pkg[section][packageName];
    if (declared !== version) errors.push(`package.json ${packageName} is ${declared || "missing"}; expected ${version}`);
    const lockedDeclaration = lockRoot && lockRoot[section] && lockRoot[section][packageName];
    if (lockedDeclaration !== version) {
      errors.push(`package-lock.json root ${packageName} is ${lockedDeclaration || "missing"}; expected ${version}`);
    }
    const resolved = lock.packages && lock.packages[`node_modules/${packageName}`];
    if (!resolved || resolved.version !== version) {
      errors.push(`package-lock.json resolved ${packageName} is ${(resolved && resolved.version) || "missing"}; expected ${version}`);
    }
  }
  return errors;
}

function projectPath(root, relative) {
  return path.resolve(root, ...relative.split("/"));
}

function selectedNode(root, manifest) {
  const download = manifest.downloads.nodeWindowsX64Zip;
  const localNode = projectPath(root, download.localExecutablePath);
  const localNpm = projectPath(root, download.localNpmPath);
  if (fs.existsSync(localNode)) {
    const version = path.resolve(process.execPath) === localNode
      ? process.versions.node
      : cleanVersion(command(localNode, ["--version"]));
    const npmPackage = path.join(path.dirname(localNpm), "node_modules", "npm", "package.json");
    return {
      node: version,
      nodePath: localNode,
      npm: fs.existsSync(localNpm) && fs.existsSync(npmPackage) ? readJson(npmPackage).version : null,
      npmPath: localNpm,
      local: true,
    };
  }
  return { node: process.versions.node, nodePath: process.execPath, npm: npmVersion(), npmPath: findCommand("npm"), local: false };
}

function check(root = ROOT, actual = {}) {
  const manifest = readJson(path.join(root, MANIFEST));
  const errors = validateManifest(manifest);
  errors.push(...checkOwnershipFiles(root, manifest));
  errors.push(...checkPackageFiles(root, manifest));
  const notes = [];

  const discoveredNode = actual.node === undefined || actual.npm === undefined ? selectedNode(root, manifest) : null;
  const node = actual.node === undefined ? discoveredNode.node : actual.node;
  const npm = actual.npm === undefined ? discoveredNode.npm : actual.npm;
  const nodePath = actual.nodePath === undefined ? discoveredNode && discoveredNode.nodePath : actual.nodePath;
  if (node !== manifest.node) errors.push(`Node is ${node || "unavailable"}; expected ${manifest.node}`);
  if (npm !== manifest.npm) errors.push(`npm is ${npm || "unavailable"}; expected ${manifest.npm}`);
  const expectedNodeSha = manifest.downloads.nodeWindowsX64Zip.binarySha256;
  if (nodePath && fs.existsSync(nodePath) && SHA256.test(expectedNodeSha)) {
    const digest = sha256(nodePath);
    if (digest !== expectedNodeSha) errors.push(`Node binary SHA-256 is ${digest}; expected ${expectedNodeSha}`);
  }

  let blender = actual.blender;
  let blenderPath = actual.blenderPath;
  if (blender === undefined) {
    const local = projectPath(root, manifest.downloads.blenderWindowsX64Zip.localExecutablePath);
    if (fs.existsSync(local)) {
      // The reviewed executable digest is a stronger identity than its own
      // version banner, and checking it without launching Blender keeps this
      // repository check usable in restricted and headless environments.
      blenderPath = local;
      blender = manifest.blender;
    } else {
      blenderPath = findCommand("blender");
      blender = blenderPath ? blenderVersion(command(blenderPath, ["--version"])) : null;
    }
  }
  if (blender === null) {
    notes.push("Blender is not installed; its version and binary digest will be checked when present");
  } else {
    if (blender !== manifest.blender) errors.push(`Blender is ${blender || "unparseable"}; expected ${manifest.blender}`);
    const expected = manifest.downloads.blenderWindowsX64Zip.binarySha256;
    if (blenderPath && fs.existsSync(blenderPath) && typeof expected === "string" && SHA256.test(expected)) {
      const digest = sha256(blenderPath);
      if (digest !== expected) errors.push(`Blender binary SHA-256 is ${digest}; expected ${expected}`);
    }
  }

  const validator = actual.gltfValidator === undefined ? installedValidatorVersion(root) : actual.gltfValidator;
  if (validator === null) {
    notes.push("gltf-validator is not installed; its version will be checked when present");
  } else if (validator !== manifest.gltfValidator) {
    errors.push(`gltf-validator is ${validator || "unparseable"}; expected ${manifest.gltfValidator}`);
  }

  return { errors, notes, manifest };
}

function main() {
  let result;
  try {
    result = check();
  } catch (error) {
    console.error(`toolchain check failed:\n- ${error.message}`);
    process.exitCode = 1;
    return;
  }
  for (const note of result.notes) console.log(`toolchain: ${note}`);
  if (result.errors.length) {
    console.error(`toolchain check failed:\n${result.errors.map((error) => `- ${error}`).join("\n")}`);
    process.exitCode = 1;
    return;
  }
  console.log("toolchain: pinned versions and binary identities match");
}

if (require.main === module) main();

module.exports = { blenderVersion, check, cleanVersion, validateManifest };
