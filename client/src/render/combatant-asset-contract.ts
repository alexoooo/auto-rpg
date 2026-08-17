import { RIG_CLIPS, RIG_NODES } from "./rig-names.js";

export const COMBATANT_MAX_PAYLOAD_BYTES = 16_777_216;
export const COMBATANT_MAX_GPU_BYTES = 67_108_864;
const MAX_JSON_BYTES = 2 * 1024 * 1024;
const SHA256 = /^[0-9a-f]{64}$/;
const KINDS = Object.freeze(["fighter", "brute"] as const);
const MATERIALS = Object.freeze([
  "combatant_bone", "combatant_burgundy", "combatant_dark_steel", "combatant_hide",
  "combatant_leather", "combatant_skin", "combatant_steel",
] as const);
const SKELETON_BONES = Object.freeze([
  "root", "pelvis", "torso", "head",
  "arm_left", "hand_left", "socket_weapon_left",
  "arm_right", "hand_right", "socket_weapon_right", "socket_shield",
  "region_head", "region_torso", "region_left_arm", "region_right_arm", "region_legs",
] as const);
const MESHES = Object.freeze({
  fighter: Object.freeze([
    "pelvis_skirt", "pelvis_belt", "torso_cuirass", "torso_breastplate", "torso_cape",
    "head_face", "head_helmet", "head_visor", "head_plume",
    "arm_left", "arm_right", "forearm_left", "forearm_right",
    "pauldron_left", "pauldron_right", "hand_left", "hand_right",
    "leg_left", "leg_right", "boot_left", "boot_right", "shield", "sword",
  ] as const),
  brute: Object.freeze([
    "pelvis_kilt", "pelvis_belt", "torso_hide", "torso_mantle", "torso_buckle",
    "head", "head_brow", "horn_left", "horn_right", "tusk_left", "tusk_right",
    "arm_left", "arm_right", "forearm_left", "forearm_right", "hand_left", "hand_right",
    "leg_left", "leg_right", "boot_left", "boot_right", "club",
  ] as const),
});

export type CombatantKind = typeof KINDS[number];
export type CombatantMaterialRole = typeof MATERIALS[number];
export type CombatantVector3 = readonly [number, number, number];
export type CombatantQuaternion = readonly [number, number, number, number];

export type CombatantNodeContract = Readonly<{
  semantic: string;
  node: string;
  parent: string | null;
  translation: CombatantVector3;
  rotation: CombatantQuaternion;
  scale: CombatantVector3;
}>;

export type CombatantMeshContract = Readonly<{
  semantic: string;
  node: string;
  parent: string | null;
  materialRole: CombatantMaterialRole;
  primitiveCount: number;
  vertexCount: number;
  triangleCount: number;
  bounds: Readonly<{ min: CombatantVector3; max: CombatantVector3 }>;
}>;

export type CombatantClipContract = Readonly<{
  semantic: typeof RIG_CLIPS[number];
  animation: string;
  durationSeconds: number;
  looping: boolean;
}>;

export type CombatantArchetypeContract = Readonly<{
  kind: CombatantKind;
  height: number;
  nodePrefix: "FIGHTER_" | "BRUTE_";
  skeleton: Readonly<{ node: string; skin: string; bones: readonly string[] }>;
  nodes: readonly CombatantNodeContract[];
  meshes: readonly CombatantMeshContract[];
  clips: readonly CombatantClipContract[];
}>;

export type CombatantAssetSidecar = Readonly<{
  schemaVersion: 1;
  fixtureId: "v2-combatants-1";
  buildInputsSha256: string;
  glbSha256: string;
  coordinates: Readonly<{
    sceneHandedness: "right";
    upAxis: "+Y";
    groundAxes: readonly ["+X", "+Z"];
    metresPerUnit: 1;
  }>;
  semanticNames: readonly string[];
  archetypes: readonly [CombatantArchetypeContract, CombatantArchetypeContract];
  counts: Readonly<{
    nodes: number; meshes: number; materials: number;
    vertices: number; triangles: number; animations: number; skins: number;
  }>;
  estimatedGpuResidency: Readonly<{
    sourceBufferBytes: number; decodedTextureBytes: number; totalBytes: number;
  }>;
  payloadBytes: number;
}>;

function record(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new TypeError(`${label} has unexpected or missing fields`);
  }
}

function count(value: unknown, label: string, maximum = COMBATANT_MAX_GPU_BYTES): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > maximum) {
    throw new TypeError(`${label} is outside its documented bound`);
  }
  return value as number;
}

function tuple(value: unknown, length: 3 | 4, label: string): readonly number[] {
  if (!Array.isArray(value) || value.length !== length ||
      value.some((item) => typeof item !== "number" || !Number.isFinite(item))) {
    throw new TypeError(`${label} is not a finite tuple of length ${length}`);
  }
  return Object.freeze([...value]) as readonly number[];
}

function text(value: unknown, label: string, maximum = 96): string {
  if (typeof value !== "string" || value.length === 0 || value.length > maximum) {
    throw new TypeError(`${label} is not bounded text`);
  }
  return value;
}

function parentFor(semantic: string, prefix: string): string | null {
  const parent: Record<string, string | null> = {
    root: "armature", pelvis: "root", torso: "pelvis", head: "torso",
    arm_left: "torso", hand_left: "arm_left", arm_right: "torso", hand_right: "arm_right",
    socket_weapon_left: "hand_left", socket_weapon_right: "hand_right", socket_shield: "root",
    region_head: "root", region_torso: "root", region_left_arm: "root",
    region_right_arm: "root", region_legs: "root",
    idle: "root", walk: "root", stagger: "root", fall: "root",
  };
  const value = parent[semantic];
  if (value === undefined) throw new TypeError(`unknown combatant semantic node ${semantic}`);
  return value === null ? null : prefix + value;
}

function parseNode(value: unknown, semantic: string, prefix: string): CombatantNodeContract {
  const source = record(value, `combatant node ${semantic}`);
  exactKeys(source, ["semantic", "node", "parent", "translation", "rotation", "scale"],
    `combatant node ${semantic}`);
  if (source.semantic !== semantic || source.node !== prefix + semantic ||
      source.parent !== parentFor(semantic, prefix)) throw new TypeError(`combatant node ${semantic} identity drifted`);
  const rotation = tuple(source.rotation, 4, `combatant node ${semantic} rotation`) as CombatantQuaternion;
  if (Math.abs(Math.hypot(...rotation) - 1) > 0.00001) {
    throw new TypeError(`combatant node ${semantic} rotation is not normalized`);
  }
  return Object.freeze({
    semantic, node: source.node as string, parent: source.parent as string | null,
    translation: tuple(source.translation, 3, `combatant node ${semantic} translation`) as CombatantVector3,
    rotation, scale: tuple(source.scale, 3, `combatant node ${semantic} scale`) as CombatantVector3,
  });
}

function parseMesh(value: unknown, semantic: string, prefix: string): CombatantMeshContract {
  const label = `combatant mesh ${semantic}`;
  const source = record(value, label);
  exactKeys(source, ["semantic", "node", "parent", "materialRole", "primitiveCount",
    "vertexCount", "triangleCount", "bounds"], label);
  if (source.semantic !== semantic || source.node !== prefix + "mesh_" + semantic ||
      (source.parent !== null && (typeof source.parent !== "string" || !source.parent.startsWith(prefix))) ||
      typeof source.materialRole !== "string" ||
      !MATERIALS.includes(source.materialRole as CombatantMaterialRole)) {
    throw new TypeError(`${label} identity drifted`);
  }
  const boundsSource = record(source.bounds, `${label} bounds`);
  exactKeys(boundsSource, ["min", "max"], `${label} bounds`);
  const min = tuple(boundsSource.min, 3, `${label} min`) as CombatantVector3;
  const max = tuple(boundsSource.max, 3, `${label} max`) as CombatantVector3;
  if (min.some((item, index) => item > (max[index] ?? item))) throw new TypeError(`${label} bounds are inverted`);
  return Object.freeze({
    semantic, node: source.node as string, parent: source.parent as string | null,
    materialRole: source.materialRole as CombatantMaterialRole,
    primitiveCount: count(source.primitiveCount, `${label} primitive count`, 16),
    vertexCount: count(source.vertexCount, `${label} vertex count`, 50_000),
    triangleCount: count(source.triangleCount, `${label} triangle count`, 80_000),
    bounds: Object.freeze({ min, max }),
  });
}

function parseArchetype(value: unknown, expectedKind: CombatantKind): CombatantArchetypeContract {
  const source = record(value, `combatant ${expectedKind}`);
  exactKeys(source, ["kind", "height", "nodePrefix", "skeleton", "nodes", "meshes", "clips"], `combatant ${expectedKind}`);
  const prefix = expectedKind === "fighter" ? "FIGHTER_" : "BRUTE_";
  if (source.kind !== expectedKind || source.nodePrefix !== prefix ||
      typeof source.height !== "number" || !Number.isFinite(source.height) ||
      source.height < 1 || source.height > 3) throw new TypeError(`combatant ${expectedKind} identity drifted`);
  if (!Array.isArray(source.nodes) || source.nodes.length !== RIG_NODES.length ||
      !Array.isArray(source.meshes) || source.meshes.length !== MESHES[expectedKind].length ||
      !Array.isArray(source.clips) || source.clips.length !== RIG_CLIPS.length) {
    throw new TypeError(`combatant ${expectedKind} semantic arrays drifted`);
  }
  const rawNodes = source.nodes as unknown[];
  const rawMeshes = source.meshes as unknown[];
  const rawClips = source.clips as unknown[];
  const skeletonSource = record(source.skeleton, `combatant ${expectedKind} skeleton`);
  exactKeys(skeletonSource, ["node", "skin", "bones"], `combatant ${expectedKind} skeleton`);
  const expectedBones = SKELETON_BONES.map((name) => prefix + name);
  if (skeletonSource.node !== prefix + "armature" || skeletonSource.skin !== prefix + "armature" ||
      !Array.isArray(skeletonSource.bones) ||
      skeletonSource.bones.length !== expectedBones.length ||
      skeletonSource.bones.some((name, index) => name !== expectedBones[index])) {
    throw new TypeError(`combatant ${expectedKind} skeleton closure drifted`);
  }
  const nodes = Object.freeze(RIG_NODES.map((semantic, index) => parseNode(rawNodes[index], semantic, prefix)));
  const meshes = Object.freeze(MESHES[expectedKind].map((semantic, index) =>
    parseMesh(rawMeshes[index], semantic, prefix)));
  const clips = Object.freeze(RIG_CLIPS.map((semantic, index) => {
    const clip = record(rawClips[index], `combatant ${expectedKind} clip ${semantic}`);
    exactKeys(clip, ["semantic", "animation", "durationSeconds", "looping"],
      `combatant ${expectedKind} clip ${semantic}`);
    if (clip.semantic !== semantic || clip.animation !== prefix + semantic ||
        typeof clip.durationSeconds !== "number" || !Number.isFinite(clip.durationSeconds) ||
        clip.durationSeconds <= 0 || clip.durationSeconds > 10 ||
        clip.looping !== (semantic === "idle" || semantic === "walk")) {
      throw new TypeError(`combatant ${expectedKind} clip ${semantic} drifted`);
    }
    return Object.freeze({
      semantic, animation: clip.animation as string,
      durationSeconds: clip.durationSeconds, looping: clip.looping,
    });
  }));
  const skeleton = Object.freeze({
    node: skeletonSource.node as string, skin: skeletonSource.skin as string,
    bones: Object.freeze([...expectedBones]),
  });
  return Object.freeze({ kind: expectedKind, height: source.height, nodePrefix: prefix, skeleton, nodes, meshes, clips });
}

export function parseCombatantAssetSidecar(bytes: Uint8Array): CombatantAssetSidecar {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0 || bytes.byteLength > MAX_JSON_BYTES) {
    throw new RangeError("combatant sidecar byte length is invalid");
  }
  let unknown: unknown;
  try {
    unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  } catch (error) {
    throw new TypeError(`combatant sidecar is not canonical UTF-8 JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  const source = record(unknown, "combatant sidecar");
  exactKeys(source, ["schemaVersion", "fixtureId", "buildInputsSha256", "glbSha256", "coordinates",
    "semanticNames", "archetypes", "counts", "estimatedGpuResidency", "payloadBytes"], "combatant sidecar");
  if (source.schemaVersion !== 1 || source.fixtureId !== "v2-combatants-1" ||
      typeof source.buildInputsSha256 !== "string" || !SHA256.test(source.buildInputsSha256) ||
      typeof source.glbSha256 !== "string" || !SHA256.test(source.glbSha256)) {
    throw new TypeError("combatant sidecar identity is invalid");
  }
  const coordinates = record(source.coordinates, "combatant coordinates");
  exactKeys(coordinates, ["sceneHandedness", "upAxis", "groundAxes", "metresPerUnit"], "combatant coordinates");
  if (coordinates.sceneHandedness !== "right" || coordinates.upAxis !== "+Y" ||
      coordinates.metresPerUnit !== 1 || !Array.isArray(coordinates.groundAxes) ||
      coordinates.groundAxes.length !== 2 || coordinates.groundAxes[0] !== "+X" ||
      coordinates.groundAxes[1] !== "+Z") throw new TypeError("combatant coordinate convention drifted");
  if (!Array.isArray(source.semanticNames) || source.semanticNames.length !== RIG_NODES.length ||
      source.semanticNames.some((name, index) => name !== RIG_NODES[index]) ||
      !Array.isArray(source.archetypes) || source.archetypes.length !== 2) {
    throw new TypeError("combatant sidecar semantic closure drifted");
  }
  const rawArchetypes = source.archetypes as unknown[];
  const archetypes = Object.freeze(KINDS.map((kind, index) => parseArchetype(rawArchetypes[index], kind))) as
    readonly [CombatantArchetypeContract, CombatantArchetypeContract];
  const countSource = record(source.counts, "combatant counts");
  exactKeys(countSource, ["nodes", "meshes", "materials", "vertices", "triangles", "animations", "skins"], "combatant counts");
  const counts = Object.freeze({
    nodes: count(countSource.nodes, "combatant node count", 96),
    meshes: count(countSource.meshes, "combatant mesh count", 48),
    materials: count(countSource.materials, "combatant material count", 7),
    vertices: count(countSource.vertices, "combatant vertex count", 50_000),
    triangles: count(countSource.triangles, "combatant triangle count", 80_000),
    animations: count(countSource.animations, "combatant animation count", 8),
    skins: count(countSource.skins, "combatant skin count", 2),
  });
  if (counts.nodes !== RIG_NODES.length * 2 + MESHES.fighter.length + MESHES.brute.length + 2 ||
      counts.meshes !== MESHES.fighter.length + MESHES.brute.length ||
      counts.materials !== MATERIALS.length || counts.animations !== RIG_CLIPS.length * 2 || counts.skins !== 2 ||
      counts.vertices !== archetypes.flatMap(({ meshes }) => meshes).reduce((sum, mesh) => sum + mesh.vertexCount, 0) ||
      counts.triangles !== archetypes.flatMap(({ meshes }) => meshes).reduce((sum, mesh) => sum + mesh.triangleCount, 0)) {
    throw new TypeError("combatant aggregate counts disagree with semantic rows");
  }
  const gpuSource = record(source.estimatedGpuResidency, "combatant residency");
  exactKeys(gpuSource, ["sourceBufferBytes", "decodedTextureBytes", "totalBytes"], "combatant residency");
  const residency = Object.freeze({
    sourceBufferBytes: count(gpuSource.sourceBufferBytes, "combatant source bytes"),
    decodedTextureBytes: count(gpuSource.decodedTextureBytes, "combatant texture bytes"),
    totalBytes: count(gpuSource.totalBytes, "combatant total GPU bytes"),
  });
  if (residency.decodedTextureBytes !== 512 * 512 * 4 ||
      residency.totalBytes !== residency.sourceBufferBytes + residency.decodedTextureBytes ||
      residency.totalBytes > COMBATANT_MAX_GPU_BYTES) throw new TypeError("combatant residency contract drifted");
  const payloadBytes = count(source.payloadBytes, "combatant payload bytes", COMBATANT_MAX_PAYLOAD_BYTES);
  if (payloadBytes === 0) throw new TypeError("combatant payload must be nonempty");
  return Object.freeze({
    schemaVersion: 1, fixtureId: "v2-combatants-1",
    buildInputsSha256: text(source.buildInputsSha256, "combatant build-input SHA-256"),
    glbSha256: text(source.glbSha256, "combatant GLB SHA-256"),
    coordinates: Object.freeze({
      sceneHandedness: "right", upAxis: "+Y",
      groundAxes: Object.freeze(["+X", "+Z"] as const), metresPerUnit: 1,
    }),
    semanticNames: Object.freeze([...RIG_NODES]), archetypes, counts,
    estimatedGpuResidency: residency, payloadBytes,
  });
}
