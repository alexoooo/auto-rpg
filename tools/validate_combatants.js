// Fail-closed validation for the representative semantically animated combatants.
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
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
const MATERIAL_ROLES = Object.freeze([
  "combatant_bone", "combatant_burgundy", "combatant_dark_steel", "combatant_hide",
  "combatant_leather", "combatant_skin", "combatant_steel",
]);
const MATERIALS = Object.freeze([
  "fighter_burgundy", "fighter_dark_steel", "fighter_leather", "fighter_skin",
  "fighter_steel", "brute_bone", "brute_hide", "brute_leather", "brute_skin",
  "equipment_dark_steel", "equipment_hide", "equipment_steel",
]);
const LODS = Object.freeze(["high", "mid", "low"]);

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
  if (value.schemaVersion !== 2 || value.fixtureId !== "v2-combatants-2" ||
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
    exactKeys(archetype, ["kind", "height", "nodePrefix", "skeleton", "nodes", "lods", "clips"],
      `combatant sidecar ${archetype.kind}`);
    if (!KINDS.includes(archetype.kind) || !Number.isFinite(archetype.height) || archetype.height <= 0 ||
        archetype.nodePrefix !== `${archetype.kind.toUpperCase()}_` ||
        !Array.isArray(archetype.nodes) || archetype.nodes.length !== SEMANTICS.length ||
        !Array.isArray(archetype.lods) || archetype.lods.length !== LODS.length ||
        !Array.isArray(archetype.clips) ||
        archetype.clips.length !== CLIPS.length) throw new Error("combatant archetype shape is invalid");
    exactKeys(archetype.skeleton, ["node", "skin", "bones"], `${archetype.kind} skeleton`);
    for (const node of archetype.nodes) {
      exactKeys(node, ["semantic", "node", "parent", "translation", "rotation", "scale"],
        `${archetype.kind} semantic node`);
    }
    for (const [lodIndex, lod] of archetype.lods.entries()) {
      exactKeys(lod, ["level", "maxTriangles", "meshes"], `${archetype.kind} LOD`);
      if (lod.level !== LODS[lodIndex] || !Number.isSafeInteger(lod.maxTriangles) ||
          lod.maxTriangles <= 0 || !Array.isArray(lod.meshes)) {
        throw new Error("combatant LOD shape is invalid");
      }
      for (const mesh of lod.meshes) {
        exactKeys(mesh, ["semantic", "node", "parent", "material", "materialRole", "primitiveCount",
          "vertexCount", "triangleCount", "bounds"], `${archetype.kind} ${lod.level} mesh`);
        exactKeys(mesh.bounds, ["min", "max"], `${archetype.kind} ${lod.level} mesh bounds`);
      }
    }
    for (const clip of archetype.clips) {
      exactKeys(clip, ["semantic", "animation", "durationSeconds", "looping"],
        `${archetype.kind} clip`);
    }
  }
  return value;
}

function validateCombatantPresentation(sidecar) {
  const byKind = (kind) => {
    const value = sidecar.archetypes.find((archetype) => archetype.kind === kind);
    if (!value) throw new Error(`combatant presentation has no ${kind}`);
    return value;
  };
  const node = (value, semantic) => {
    const result = value.nodes.find((item) => item.semantic === semantic);
    if (!result) throw new Error(`combatant presentation has no ${value.kind} ${semantic} node`);
    return result;
  };
  const mesh = (value, semantic) => {
    const result = value.lods.find(({ level }) => level === "mid")?.meshes
      .find((item) => item.semantic === semantic);
    if (!result) throw new Error(`combatant presentation has no ${value.kind} ${semantic} mesh`);
    return result;
  };
  const extent = (item, axis) => item.bounds.max[axis] - item.bounds.min[axis];
  const shoulderWidth = (value) =>
    node(value, "arm_right").translation[0] - node(value, "arm_left").translation[0];
  const fighter = byKind("fighter");
  const brute = byKind("brute");
  const fighterShoulders = shoulderWidth(fighter);
  const bruteShoulders = shoulderWidth(brute);
  if (fighterShoulders < 0.72 || fighterShoulders > 0.86 ||
      bruteShoulders < 1.02 || bruteShoulders > 1.20 ||
      bruteShoulders / brute.height - fighterShoulders / fighter.height < 0.04) {
    throw new Error("combatant presentation shoulder proportions drifted");
  }
  if (extent(mesh(fighter, "head_helmet"), 1) < 0.38 ||
      extent(mesh(brute, "head"), 1) < 0.50) {
    throw new Error("combatant presentation head height drifted");
  }
  const sword = mesh(fighter, "sword");
  const shield = mesh(fighter, "shield");
  const club = mesh(brute, "club");
  if (extent(sword, 0) * extent(sword, 1) < 0.075) {
    throw new Error("combatant presentation sword projected area drifted");
  }
  if (extent(shield, 0) * extent(shield, 1) < 0.48) {
    throw new Error("combatant presentation shield projected area drifted");
  }
  if (extent(club, 0) * extent(club, 1) < 0.26) {
    throw new Error("combatant presentation club projected area drifted");
  }
  const pixels = (value, item, axis) => extent(item, axis) / value.height * 40;
  if (pixels(fighter, sword, 0) < 2 || pixels(fighter, shield, 0) < 14 ||
      pixels(brute, club, 0) < 5 ||
      bruteShoulders / brute.height * 40 - fighterShoulders / fighter.height * 40 < 2.5) {
    throw new Error("combatant presentation 40-pixel silhouette drifted");
  }
}

function validateManifest(manifest) {
  if (manifest.schemaVersion !== 2 || manifest.generatorVersion !== 2 || manifest.license !== "MIT" ||
      manifest.fixtureId !== "v2-combatants-2" || manifest.generatorSeed !== 3235823838 ||
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
  const textureSets = [
    ["fighter", "tools/art/textures/combatant-fighter-albedo-v2.png", 2048],
    ["brute", "tools/art/textures/combatant-brute-albedo-v2.png", 2048],
    ["equipment", "tools/art/textures/combatant-equipment-albedo-v2.png", 1024],
  ];
  if (!Array.isArray(manifest.textures) || manifest.textures.length !== textureSets.length ||
      manifest.textures.some((texture, index) => {
        const [set, path, size] = textureSets[index];
        return texture?.set !== set || texture?.path !== path ||
          !SHA256.test(texture?.sha256 ?? "") || texture?.mimeType !== "image/png" ||
          texture?.width !== 1254 || texture?.height !== 1254 ||
          texture?.embeddedWidth !== size || texture?.embeddedHeight !== size ||
          !Array.isArray(texture?.metallicQuadrants) || texture.metallicQuadrants.length !== 4 ||
          typeof texture?.provenance !== "string" || texture.provenance.length > 160;
      })) {
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
        new Set(archetype.meshNames).size !== archetype.meshNames.length ||
        !Array.isArray(archetype.lods) || archetype.lods.length !== LODS.length ||
        archetype.lods.some((lod, index) => lod.level !== LODS[index] ||
          !Number.isSafeInteger(lod.maxTriangles) || lod.maxTriangles <= 0)) {
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
  validateCombatantPresentation(sidecar);
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
    for (const lod of LODS) for (const mesh of archetype.meshNames) {
      expected.add(archetype.nodePrefix + "lod_" + lod + "_mesh_" + mesh);
    }
  }
  if (names.length !== expected.size || names.some((name) => !expected.has(name))) {
    throw new Error(`combatant GLB node closure drifted: ${names.filter((name) => !expected.has(name)).join(",")}`);
  }
  const materialNames = (gltf.materials ?? []).map((material) => material.name);
  if (materialNames.length !== MATERIALS.length ||
      materialNames.some((name) => !MATERIALS.includes(name)) ||
      new Set(materialNames).size !== materialNames.length) throw new Error("combatant material closure drifted");
  if ((gltf.images ?? []).length !== 9 || gltf.images.some((image) =>
    image.uri !== undefined || image.mimeType !== "image/png")) {
    throw new Error("combatant baked maps must be nine embedded PNGs");
  }
  const imageDimensions = gltf.images.map((image) => {
    const imageView = gltf.bufferViews[image.bufferView];
    const imageBytes = parsed.bin.subarray(imageView.byteOffset ?? 0,
      (imageView.byteOffset ?? 0) + imageView.byteLength);
    return [imageBytes.readUInt32BE(16), imageBytes.readUInt32BE(20)];
  });
  if (imageDimensions.filter(([width, height]) => width === 2048 && height === 2048).length !== 6 ||
      imageDimensions.filter(([width, height]) => width === 1024 && height === 1024).length !== 3) {
    throw new Error("combatant embedded baked-map dimensions drifted");
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
    for (const node of gltf.nodes.filter(({ name }) => name?.startsWith(archetype.nodePrefix + "lod_"))) {
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
        JSON.stringify(archetype.lods.map(({ level }) => level)) !== JSON.stringify(LODS) ||
        archetype.lods.some((lod, index) =>
          lod.maxTriangles !== manifestArchetype.lods[index].maxTriangles ||
          JSON.stringify(lod.meshes.map(({ semantic }) => semantic)) !==
            JSON.stringify(manifestArchetype.meshNames)) ||
        JSON.stringify(archetype.clips.map(({ semantic }) => semantic)) !== JSON.stringify(CLIPS)) {
      throw new Error(`combatant sidecar ${archetype.kind} semantic closure drifted`);
    }
    for (const item of [...archetype.nodes, ...archetype.lods.flatMap(({ meshes }) => meshes)]) {
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
  const decodedTextureBytes = manifest.textures.reduce((sum, texture) =>
    sum + texture.embeddedWidth * texture.embeddedHeight * 4 * 3, 0);
  const residency = {
    sourceBufferBytes, decodedTextureBytes,
    totalBytes: sourceBufferBytes + decodedTextureBytes,
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
    throw new Error(`gltf-validator reported ${errors.length} errors and ${warnings.length} warnings: ${messages.map(({ code, pointer, message }) => `${code} ${pointer}: ${message}`).join(" | ")}`);
  }
  const buildManifest = { ...manifest };
  delete buildManifest.outputs;
  const buildDigest = crypto.createHash("sha256");
  buildDigest.update(canonicalBytes(buildManifest));
  for (const name of ["combatants.py", "build_combatants.py"]) {
    buildDigest.update(Buffer.from(`\0${name}\0`, "ascii"));
    buildDigest.update(fs.readFileSync(path.join(path.dirname(options.manifest), name)));
  }
  const buildInputsSha256 = buildDigest.digest("hex");
  const artifactSha256 = sha256(glbBytes);
  const sidecarSha256 = sha256(sidecarBytes);
  if (sidecar.buildInputsSha256 !== buildInputsSha256 || sidecar.glbSha256 !== artifactSha256 ||
      sidecar.payloadBytes !== glbBytes.length + sidecarBytes.length) {
    throw new Error("combatant sidecar identity or payload drifted");
  }
  const report = stable({
    schemaVersion: 2, fixtureId: manifest.fixtureId, validatorVersion: raw.validatorVersion,
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
  validateCombatantPresentation, validateSemanticClosure,
};
