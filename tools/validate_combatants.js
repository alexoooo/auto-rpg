// Fail-closed validation for the representative semantically animated combatants.
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const validator = require("gltf-validator");
const {
  assertFiniteDeep, canonicalBytes, parseGlb, sha256, validateUriPolicy,
} = require("./validate_assets.js");

const ROOT = path.resolve(__dirname, "..");
const SHA256 = /^[0-9a-f]{64}$/;
const KINDS = Object.freeze(["fighter", "brute"]);
const SEMANTICS = Object.freeze([
  "root", "pelvis", "torso", "head",
  "arm_left", "hand_left", "arm_right", "hand_right",
  "socket_weapon_left", "socket_weapon_right", "socket_shield",
  "region_head", "region_torso", "region_left_arm", "region_right_arm", "region_legs",
  "idle", "walk", "stagger", "fall",
]);
const CLIPS = Object.freeze(["idle", "walk", "stagger", "fall"]);
const BONES = Object.freeze([
  "root", "pelvis", "torso", "head",
  "arm_left", "hand_left", "socket_weapon_left",
  "arm_right", "hand_right", "socket_weapon_right", "socket_shield",
  "region_head", "region_torso", "region_left_arm", "region_right_arm", "region_legs",
]);
const MATERIALS = Object.freeze([
  "combatant_bone", "combatant_burgundy", "combatant_dark_steel", "combatant_hide",
  "combatant_leather", "combatant_skin", "combatant_steel",
]);

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function exactKeys(value, expected, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value) ||
      JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...expected].sort())) {
    throw new Error(`${label} has extra or missing keys`);
  }
}

function parseCombatantSidecar(bytes) {
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  if (buffer.length === 0 || buffer.length > 2 * 1024 * 1024) {
    throw new Error("combatant sidecar exceeds its parser bound");
  }
  const value = JSON.parse(buffer.toString("utf8"));
  exactKeys(value, ["schemaVersion", "fixtureId", "buildInputsSha256", "glbSha256", "coordinates",
    "semanticNames", "archetypes", "counts", "estimatedGpuResidency", "payloadBytes"], "combatant sidecar");
  if (value.schemaVersion !== 1 || value.fixtureId !== "v2-combatants-1" ||
      !SHA256.test(value.buildInputsSha256) || !SHA256.test(value.glbSha256) ||
      JSON.stringify(value.semanticNames) !== JSON.stringify(SEMANTICS) ||
      !Array.isArray(value.archetypes) || value.archetypes.length !== 2) {
    throw new Error("combatant sidecar identity is invalid");
  }
  assertFiniteDeep(value, "combatant sidecar");
  exactKeys(value.coordinates, ["sceneHandedness", "upAxis", "groundAxes", "metresPerUnit"],
    "combatant sidecar coordinates");
  exactKeys(value.counts, ["nodes", "meshes", "materials", "vertices", "triangles", "animations", "skins"],
    "combatant sidecar counts");
  exactKeys(value.estimatedGpuResidency, ["sourceBufferBytes", "decodedTextureBytes", "totalBytes"],
    "combatant sidecar residency");
  for (const archetype of value.archetypes) {
    exactKeys(archetype, ["kind", "height", "nodePrefix", "skeleton", "nodes", "meshes", "clips"],
      `combatant sidecar ${archetype.kind}`);
    if (!KINDS.includes(archetype.kind) || !Number.isFinite(archetype.height) || archetype.height <= 0 ||
        archetype.nodePrefix !== `${archetype.kind.toUpperCase()}_` ||
        !Array.isArray(archetype.nodes) || archetype.nodes.length !== SEMANTICS.length ||
        !Array.isArray(archetype.meshes) || !Array.isArray(archetype.clips) ||
        archetype.clips.length !== CLIPS.length) throw new Error("combatant archetype shape is invalid");
    exactKeys(archetype.skeleton, ["node", "skin", "bones"], `${archetype.kind} skeleton`);
    for (const node of archetype.nodes) {
      exactKeys(node, ["semantic", "node", "parent", "translation", "rotation", "scale"],
        `${archetype.kind} semantic node`);
    }
    for (const mesh of archetype.meshes) {
      exactKeys(mesh, ["semantic", "node", "parent", "materialRole", "primitiveCount",
        "vertexCount", "triangleCount", "bounds"], `${archetype.kind} mesh`);
      exactKeys(mesh.bounds, ["min", "max"], `${archetype.kind} mesh bounds`);
    }
    for (const clip of archetype.clips) {
      exactKeys(clip, ["semantic", "animation", "durationSeconds", "looping"],
        `${archetype.kind} clip`);
    }
  }
  return value;
}

function validateManifest(manifest) {
  if (manifest.schemaVersion !== 1 || manifest.generatorVersion !== 1 || manifest.license !== "MIT" ||
      manifest.fixtureId !== "v2-combatants-1" || manifest.generatorSeed !== 3235823838 ||
      manifest.toolchain?.blender !== "4.5.12" ||
      !SHA256.test(manifest.toolchain?.blenderBinarySha256 ?? "") ||
      JSON.stringify(manifest.semanticNames) !== JSON.stringify(SEMANTICS) ||
      JSON.stringify(manifest.clips) !== JSON.stringify(CLIPS)) {
    throw new Error("combatant manifest identity is invalid");
  }
  if (manifest.coordinates?.sceneHandedness !== "right" || manifest.coordinates?.upAxis !== "+Y" ||
      JSON.stringify(manifest.coordinates?.groundAxes) !== JSON.stringify(["+X", "+Z"]) ||
      manifest.coordinates?.metresPerUnit !== 1) throw new Error("combatant manifest coordinates are invalid");
  if (manifest.export?.format !== "GLB" || manifest.export?.applyModifiers !== true ||
      manifest.export?.exportMaterials !== "EXPORT" || manifest.export?.exportYup !== true ||
      manifest.export?.useSelection !== true || manifest.export?.animations !== true ||
      manifest.export?.skins !== true || manifest.export?.morphs !== false) {
    throw new Error("combatant manifest export contract is invalid");
  }
  const texture = manifest.texture;
  if (texture?.path !== "tools/art/textures/concept-material-atlas.png" ||
      !SHA256.test(texture?.sha256 ?? "") || texture?.mimeType !== "image/png" ||
      texture?.width !== 1254 || texture?.height !== 1254 ||
      texture?.embeddedWidth !== 512 || texture?.embeddedHeight !== 512 ||
      typeof texture?.provenance !== "string" || texture.provenance.length > 160) {
    throw new Error("combatant manifest texture contract is invalid");
  }
  if (JSON.stringify(Object.keys(manifest.materials ?? {}).sort()) !== JSON.stringify([...MATERIALS].sort())) {
    throw new Error("combatant manifest material closure is invalid");
  }
  if (!Array.isArray(manifest.archetypes) || manifest.archetypes.length !== 2 ||
      JSON.stringify(manifest.archetypes.map(({ kind }) => kind)) !== JSON.stringify(KINDS)) {
    throw new Error("combatant manifest archetype closure is invalid");
  }
  for (const archetype of manifest.archetypes) {
    if (archetype.nodePrefix !== `${archetype.kind.toUpperCase()}_` ||
        !Array.isArray(archetype.meshNames) || archetype.meshNames.length < 16 ||
        new Set(archetype.meshNames).size !== archetype.meshNames.length) {
      throw new Error(`combatant manifest ${archetype.kind} mesh closure is invalid`);
    }
  }
  for (const [key, file] of [["glb", "combatants.glb"], ["sidecar", "combatants.json"],
    ["validator", "combatants.validator.json"]]) {
    if (manifest.outputs?.[key]?.path !== `web/assets3d/${file}` ||
        !SHA256.test(manifest.outputs[key].sha256)) throw new Error(`combatant manifest ${key} output is invalid`);
  }
}

function nodeParents(gltf) {
  const parents = new Map();
  for (const [index, node] of (gltf.nodes ?? []).entries()) {
    for (const child of node.children ?? []) {
      if (parents.has(child)) throw new Error(`combatant node ${child} has more than one parent`);
      parents.set(child, node.name ?? `node-${index}`);
    }
  }
  return parents;
}

function validateSemanticClosure(parsed, sidecar, manifest) {
  const gltf = parsed.gltf;
  validateUriPolicy(gltf);
  if ((gltf.skins ?? []).length !== 2 || (gltf.cameras ?? []).length !== 0 ||
      (gltf.extensions?.KHR_lights_punctual?.lights ?? []).length !== 0) {
    throw new Error("combatant GLB contains a forbidden skin, camera, or light");
  }
  const names = (gltf.nodes ?? []).map((node) => node.name);
  if (names.some((name) => typeof name !== "string") || new Set(names).size !== names.length) {
    throw new Error("combatant GLB node names are missing or duplicated");
  }
  const expected = new Set();
  for (const archetype of manifest.archetypes) {
    expected.add(archetype.nodePrefix + "armature");
    for (const semantic of SEMANTICS) expected.add(archetype.nodePrefix + semantic);
    for (const mesh of archetype.meshNames) expected.add(archetype.nodePrefix + "mesh_" + mesh);
  }
  if (names.length !== expected.size || names.some((name) => !expected.has(name))) {
    throw new Error(`combatant GLB node closure drifted: ${names.filter((name) => !expected.has(name)).join(",")}`);
  }
  const materialNames = (gltf.materials ?? []).map((material) => material.name);
  if (materialNames.length !== MATERIALS.length ||
      materialNames.some((name) => !MATERIALS.includes(name)) ||
      new Set(materialNames).size !== materialNames.length) throw new Error("combatant material closure drifted");
  if ((gltf.images ?? []).length !== 1 || gltf.images[0].uri !== undefined ||
      gltf.images[0].mimeType !== "image/png") throw new Error("combatant atlas must be one embedded PNG");
  const imageView = gltf.bufferViews[gltf.images[0].bufferView];
  const imageBytes = parsed.bin.subarray(imageView.byteOffset ?? 0, (imageView.byteOffset ?? 0) + imageView.byteLength);
  if (imageBytes.readUInt32BE(16) !== 512 || imageBytes.readUInt32BE(20) !== 512) {
    throw new Error("combatant embedded atlas dimensions drifted");
  }
  const animationNames = (gltf.animations ?? []).map((animation) => animation.name);
  const expectedAnimations = manifest.archetypes.flatMap(({ nodePrefix }) =>
    CLIPS.map((clip) => nodePrefix + clip));
  if (animationNames.length !== expectedAnimations.length ||
      animationNames.some((name) => !expectedAnimations.includes(name)) ||
      new Set(animationNames).size !== animationNames.length) {
    throw new Error(`combatant animation closure drifted: ${animationNames.join(",")}`);
  }
  for (const animation of gltf.animations) {
    const prefix = animation.name.startsWith("FIGHTER_") ? "FIGHTER_"
      : animation.name.startsWith("BRUTE_") ? "BRUTE_" : null;
    const boneNames = BONES;
    if (prefix === null || animation.channels.length !== boneNames.length * 3 ||
        animation.channels.some((channel) => {
          const target = gltf.nodes[channel.target.node]?.name;
          return !boneNames.includes(target?.slice(prefix.length)) ||
            !["translation", "rotation", "scale"].includes(channel.target.path);
        })) throw new Error(`combatant animation ${animation.name} targets non-cosmetic nodes`);
  }
  for (const archetype of manifest.archetypes) {
    const skin = (gltf.skins ?? []).find(({ name }) => name === archetype.nodePrefix + "armature");
    const expectedBones = BONES.map((name) => archetype.nodePrefix + name);
    if (!skin || skin.inverseBindMatrices === undefined ||
        JSON.stringify(skin.joints.map((index) => gltf.nodes[index]?.name)) !== JSON.stringify(expectedBones)) {
      throw new Error(`combatant ${archetype.kind} skin/bone closure drifted`);
    }
    for (const node of gltf.nodes.filter(({ name }) => name?.startsWith(archetype.nodePrefix + "mesh_"))) {
      if (gltf.skins[node.skin]?.name !== archetype.nodePrefix + "armature") {
        throw new Error(`combatant ${archetype.kind} mesh is not bound to its exact skin`);
      }
    }
  }
  const parents = nodeParents(gltf);
  for (const archetype of sidecar.archetypes) {
    const manifestArchetype = manifest.archetypes.find(({ kind }) => kind === archetype.kind);
    if (!manifestArchetype || archetype.nodePrefix !== manifestArchetype.nodePrefix ||
        archetype.height !== Number(manifestArchetype.height) ||
        archetype.skeleton.node !== archetype.nodePrefix + "armature" ||
        archetype.skeleton.skin !== archetype.nodePrefix + "armature" ||
        JSON.stringify(archetype.skeleton.bones) !== JSON.stringify(
          BONES.map((name) => archetype.nodePrefix + name)) ||
        JSON.stringify(archetype.nodes.map(({ semantic }) => semantic)) !== JSON.stringify(SEMANTICS) ||
        JSON.stringify(archetype.meshes.map(({ semantic }) => semantic)) !== JSON.stringify(manifestArchetype.meshNames) ||
        JSON.stringify(archetype.clips.map(({ semantic }) => semantic)) !== JSON.stringify(CLIPS)) {
      throw new Error(`combatant sidecar ${archetype.kind} semantic closure drifted`);
    }
    for (const item of [...archetype.nodes, ...archetype.meshes]) {
      const index = names.indexOf(item.node);
      if (index < 0 || (parents.get(index) ?? null) !== item.parent) {
        throw new Error(`combatant sidecar ${item.node} parent drifted`);
      }
    }
  }
}

function counts(gltf) {
  let vertices = 0;
  let triangles = 0;
  for (const mesh of gltf.meshes ?? []) for (const primitive of mesh.primitives ?? []) {
    const position = gltf.accessors[primitive.attributes.POSITION];
    const indices = gltf.accessors[primitive.indices];
    vertices += position.count;
    triangles += indices.count / 3;
    if (!Number.isSafeInteger(triangles)) throw new Error("combatant primitive is not triangles");
    if (primitive.targets !== undefined) throw new Error("combatant morph targets are forbidden");
  }
  return {
    nodes: (gltf.nodes ?? []).length, meshes: (gltf.meshes ?? []).length,
    materials: (gltf.materials ?? []).length, vertices, triangles,
    animations: (gltf.animations ?? []).length, skins: (gltf.skins ?? []).length,
  };
}

async function validateCombatantAsset(options) {
  const manifest = JSON.parse(fs.readFileSync(options.manifest, "utf8"));
  validateManifest(manifest);
  const glbBytes = fs.readFileSync(options.glb);
  const sidecarBytes = fs.readFileSync(options.sidecar);
  const sidecar = parseCombatantSidecar(sidecarBytes);
  const parsed = parseGlb(glbBytes);
  validateSemanticClosure(parsed, sidecar, manifest);
  const actualCounts = counts(parsed.gltf);
  if (Object.keys(actualCounts).some((key) => sidecar.counts[key] !== actualCounts[key])) {
    throw new Error("combatant sidecar aggregate counts drifted");
  }
  const sourceBufferBytes = (parsed.gltf.bufferViews ?? []).reduce((sum, view) => sum + view.byteLength, 0);
  const residency = {
    sourceBufferBytes, decodedTextureBytes: 512 * 512 * 4,
    totalBytes: sourceBufferBytes + 512 * 512 * 4,
  };
  if (Object.keys(residency).some((key) => sidecar.estimatedGpuResidency[key] !== residency[key]) ||
      residency.totalBytes > manifest.budgets.estimatedGpuBytes) {
    throw new Error("combatant sidecar residency drifted");
  }
  const raw = await (options.validator ?? validator).validateBytes(new Uint8Array(glbBytes),
    { uri: "combatants.glb", maxIssues: 10000 });
  const messages = [...(raw.issues?.messages ?? [])].map((issue) => ({
    code: issue.code, message: issue.message, pointer: issue.pointer ?? "", severity: issue.severity,
  })).sort((a, b) => a.severity - b.severity || a.code.localeCompare(b.code) ||
    a.pointer.localeCompare(b.pointer));
  const errors = messages.filter(({ severity }) => severity === 0);
  const warnings = messages.filter(({ severity }) => severity === 1);
  if (errors.length || warnings.length) {
    throw new Error(`gltf-validator reported ${errors.length} errors and ${warnings.length} warnings: ${messages.map(({ code }) => code).join(", ")}`);
  }
  const buildManifest = { ...manifest };
  delete buildManifest.outputs;
  const buildInputsSha256 = sha256(canonicalBytes(buildManifest));
  const artifactSha256 = sha256(glbBytes);
  const sidecarSha256 = sha256(sidecarBytes);
  if (sidecar.buildInputsSha256 !== buildInputsSha256 || sidecar.glbSha256 !== artifactSha256 ||
      sidecar.payloadBytes !== glbBytes.length + sidecarBytes.length) {
    throw new Error("combatant sidecar identity or payload drifted");
  }
  const report = stable({
    schemaVersion: 1, fixtureId: manifest.fixtureId, validatorVersion: raw.validatorVersion,
    artifactSha256, sidecarSha256, buildInputsSha256,
    payloadBytes: glbBytes.length + sidecarBytes.length, residency, counts: actualCounts,
    issues: {
      numErrors: errors.length, numWarnings: warnings.length,
      numInfos: messages.filter(({ severity }) => severity === 2).length,
      numHints: messages.filter(({ severity }) => severity === 3).length, messages,
    },
  });
  const reportBytes = canonicalBytes(report);
  if (!options.skipExpectedHashes) {
    if (manifest.outputs.glb.sha256 !== artifactSha256 ||
        manifest.outputs.sidecar.sha256 !== sidecarSha256 ||
        manifest.outputs.validator.sha256 !== sha256(reportBytes)) {
      throw new Error("combatant asset differs from its manifest SHA-256");
    }
  }
  if (options.report) fs.writeFileSync(options.report, reportBytes);
  return report;
}

function parseArguments(argv) {
  if (!argv.length || argv[0].startsWith("--")) {
    throw new Error("usage: node tools/validate_combatants.js path/to/combatants.glb [--sidecar file] [--manifest file] [--report file] [--skip-expected-hashes]");
  }
  const result = { glb: path.resolve(argv[0]), skipExpectedHashes: false };
  for (let index = 1; index < argv.length; index++) {
    const argument = argv[index];
    if (argument === "--skip-expected-hashes") result.skipExpectedHashes = true;
    else if (["--sidecar", "--manifest", "--report"].includes(argument)) {
      const value = argv[++index];
      if (!value || value.startsWith("--")) throw new Error(`${argument} needs a path`);
      result[argument.slice(2)] = path.resolve(value);
    } else throw new Error(`unknown argument: ${argument}`);
  }
  result.sidecar ??= result.glb.replace(/\.glb$/i, ".json");
  result.manifest ??= path.join(ROOT, "tools", "art", "combatants-manifest.json");
  return result;
}

async function main() {
  try {
    const report = await validateCombatantAsset(parseArguments(process.argv.slice(2)));
    console.log(`combatant asset valid: ${report.artifactSha256}; ${report.payloadBytes} bytes; estimated residency ${report.residency.totalBytes} bytes`);
  } catch (error) {
    console.error(`combatant asset validation failed:\n- ${error.message}`);
    process.exitCode = 1;
  }
}

if (require.main === module) void main();

module.exports = {
  parseArguments, parseCombatantSidecar, validateCombatantAsset, validateManifest,
  validateSemanticClosure,
};
