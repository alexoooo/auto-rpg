/**
 * Pure boundary between the creator's KayKit Adventurers 1.0 graph and the
 * prototype's thirteen authoritative humanoid regions.
 *
 * Nothing in this file knows about Babylon, rendering or Havok. The eventual
 * unit adapter can therefore sample the same hierarchy on the fixed physics
 * clock in a browser and in the headless harness. More importantly, every
 * reduction below is explicit: an unfamiliar source joint, an uncovered
 * triangle or a broken creator socket is a refusal rather than a guessed pose.
 */

export type KayKitPhysicsBone =
  | "torso"
  | "head"
  | "pelvis"
  | "swordUpperArm"
  | "swordForearm"
  | "swordHand"
  | "offUpperArm"
  | "offForearm"
  | "offHand"
  | "thighLeft"
  | "shinLeft"
  | "thighRight"
  | "shinRight";

export type Matrix4 = readonly number[];

export interface KayKitSourceNode {
  name: string;
  parent: string | null;
  /** Column-major local matrix, matching glTF. */
  local: Matrix4;
}

/** Parent-before-child order is also the deterministic triangle tie-break. */
export const KAYKIT_REGION_ORDER: readonly KayKitPhysicsBone[] = Object.freeze([
  "torso", "head", "pelvis",
  "swordUpperArm", "swordForearm", "swordHand",
  "offUpperArm", "offForearm", "offHand",
  "thighLeft", "shinLeft", "thighRight", "shinRight",
]);

export const KAYKIT_TARGET_PARENT: Readonly<Record<KayKitPhysicsBone, KayKitPhysicsBone | null>> =
  Object.freeze({
    torso: null,
    head: "torso",
    pelvis: "torso",
    swordUpperArm: "torso",
    swordForearm: "swordUpperArm",
    swordHand: "swordForearm",
    offUpperArm: "torso",
    offForearm: "offUpperArm",
    offHand: "offForearm",
    thighLeft: "pelvis",
    shinLeft: "thighLeft",
    thighRight: "pelvis",
    shinRight: "thighRight",
  });

/**
 * Every joint in the creator GLB's skin, by its exact spelling.
 *
 * A null is an authored IK/control joint which may be animated but must never
 * own rendered triangles. Keeping those names in the table distinguishes a
 * known non-deforming control from an unknown joint introduced by source drift.
 */
export const KAYKIT_NATIVE_TO_PHYSICS: Readonly<Record<string, KayKitPhysicsBone | null>> =
  Object.freeze({
    root: "torso",
    hips: "pelvis",
    spine: "torso",
    chest: "torso",
    "upperarm.l": "offUpperArm",
    "lowerarm.l": "offForearm",
    "wrist.l": "offHand",
    "hand.l": "offHand",
    "handslot.l": "offHand",
    "upperarm.r": "swordUpperArm",
    "lowerarm.r": "swordForearm",
    "wrist.r": "swordHand",
    "hand.r": "swordHand",
    "handslot.r": "swordHand",
    head: "head",
    "upperleg.l": "thighLeft",
    "lowerleg.l": "shinLeft",
    "foot.l": "shinLeft",
    "toes.l": "shinLeft",
    "upperleg.r": "thighRight",
    "lowerleg.r": "shinRight",
    "foot.r": "shinRight",
    "toes.r": "shinRight",
    "kneeIK.l": null,
    "control-toe-roll.l": null,
    "control-heel-roll.l": null,
    "control-foot-roll.l": null,
    "heelIK.l": null,
    "IK-foot.l": null,
    "IK-toe.l": null,
    "kneeIK.r": null,
    "control-toe-roll.r": null,
    "control-heel-roll.r": null,
    "control-foot-roll.r": null,
    "heelIK.r": null,
    "IK-foot.r": null,
    "IK-toe.r": null,
    "elbowIK.l": null,
    "handIK.l": null,
    "elbowIK.r": null,
    "handIK.r": null,
  });

/** One creator joint supplies each authoritative target transform. */
export const KAYKIT_TARGET_SOURCE: Readonly<Record<KayKitPhysicsBone, string>> = Object.freeze({
  torso: "chest",
  head: "head",
  pelvis: "hips",
  swordUpperArm: "upperarm.r",
  swordForearm: "lowerarm.r",
  swordHand: "hand.r",
  offUpperArm: "upperarm.l",
  offForearm: "lowerarm.l",
  offHand: "hand.l",
  thighLeft: "upperleg.l",
  shinLeft: "lowerleg.l",
  thighRight: "upperleg.r",
  shinRight: "lowerleg.r",
});

const regionRank = new Map(KAYKIT_REGION_ORDER.map((name, index) => [name, index]));

const freezeMatrix = (matrix: readonly number[]): Matrix4 => Object.freeze(Array.from(matrix));

const checkedMatrix = (matrix: Matrix4, label: string): Matrix4 => {
  if (matrix.length !== 16 || matrix.some((value) => !Number.isFinite(value))) {
    throw new Error(`${label} must be a finite 4x4 matrix`);
  }
  return matrix;
};

export function multiplyMatrix4(left: Matrix4, right: Matrix4): Matrix4 {
  checkedMatrix(left, "left matrix");
  checkedMatrix(right, "right matrix");
  const result = Array<number>(16).fill(0);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      for (let at = 0; at < 4; at += 1) {
        result[column * 4 + row] += left[at * 4 + row] * right[column * 4 + at];
      }
    }
  }
  return freezeMatrix(result);
}

export function invertMatrix4(matrix: Matrix4): Matrix4 {
  checkedMatrix(matrix, "matrix");
  const rows = Array.from({ length: 4 }, (_, row) => [
    matrix[row], matrix[4 + row], matrix[8 + row], matrix[12 + row],
    row === 0 ? 1 : 0, row === 1 ? 1 : 0, row === 2 ? 1 : 0, row === 3 ? 1 : 0,
  ]);
  for (let column = 0; column < 4; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < 4; row += 1) {
      if (Math.abs(rows[row][column]) > Math.abs(rows[pivot][column])) pivot = row;
    }
    if (Math.abs(rows[pivot][column]) <= 1e-12) throw new Error("matrix is singular");
    [rows[column], rows[pivot]] = [rows[pivot], rows[column]];
    const divisor = rows[column][column];
    for (let at = 0; at < 8; at += 1) rows[column][at] /= divisor;
    for (let row = 0; row < 4; row += 1) {
      if (row === column) continue;
      const factor = rows[row][column];
      for (let at = 0; at < 8; at += 1) rows[row][at] -= factor * rows[column][at];
    }
  }
  const result = Array<number>(16);
  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 4; column += 1) result[column * 4 + row] = rows[row][4 + column];
  }
  return freezeMatrix(result);
}

/** Compose the TRS fields used by a glTF node into its column-major matrix. */
export function composeKayKitMatrix(
  translation: readonly number[] = [0, 0, 0],
  rotation: readonly number[] = [0, 0, 0, 1],
  scale: readonly number[] = [1, 1, 1],
): Matrix4 {
  if (translation.length !== 3 || rotation.length !== 4 || scale.length !== 3 ||
      [...translation, ...rotation, ...scale].some((value) => !Number.isFinite(value))) {
    throw new Error("KayKit TRS must contain finite translation, rotation and scale values");
  }
  const [x, y, z, w] = rotation;
  const [sx, sy, sz] = scale;
  const xx = x * x; const yy = y * y; const zz = z * z;
  const xy = x * y; const xz = x * z; const yz = y * z;
  const wx = w * x; const wy = w * y; const wz = w * z;
  return freezeMatrix([
    (1 - 2 * (yy + zz)) * sx, (2 * (xy + wz)) * sx, (2 * (xz - wy)) * sx, 0,
    (2 * (xy - wz)) * sy, (1 - 2 * (xx + zz)) * sy, (2 * (yz + wx)) * sy, 0,
    (2 * (xz + wy)) * sz, (2 * (yz - wx)) * sz, (1 - 2 * (xx + yy)) * sz, 0,
    translation[0], translation[1], translation[2], 1,
  ]);
}

function sourceWorldMatrices(nodes: readonly KayKitSourceNode[]): ReadonlyMap<string, Matrix4> {
  const source = new Map<string, KayKitSourceNode>();
  for (const node of nodes) {
    if (source.has(node.name)) throw new Error(`KayKit hierarchy duplicates node "${node.name}"`);
    checkedMatrix(node.local, `KayKit node "${node.name}"`);
    source.set(node.name, node);
  }
  const worlds = new Map<string, Matrix4>();
  const visiting = new Set<string>();
  const visit = (name: string): Matrix4 => {
    const known = worlds.get(name);
    if (known) return known;
    const node = source.get(name);
    if (!node) throw new Error(`KayKit hierarchy is missing node "${name}"`);
    if (visiting.has(name)) throw new Error(`KayKit hierarchy contains a cycle at "${name}"`);
    visiting.add(name);
    const world = node.parent === null
      ? freezeMatrix(node.local)
      : multiplyMatrix4(visit(node.parent), node.local);
    visiting.delete(name);
    worlds.set(name, world);
    return world;
  };
  for (const node of nodes) visit(node.name);
  return worlds;
}

export interface KayKitMappedTargets {
  /** Creator joint transforms in world/model space. */
  world: Readonly<Record<KayKitPhysicsBone, Matrix4>>;
  /** The same targets in the prototype's severable parent hierarchy. */
  local: Readonly<Record<KayKitPhysicsBone, Matrix4>>;
}

/** Solve creator-local transforms through the source hierarchy, then collapse them to 13 targets. */
export function solveKayKitMappedTargets(nodes: readonly KayKitSourceNode[]): KayKitMappedTargets {
  const sourceWorld = sourceWorldMatrices(nodes);
  const world = {} as Record<KayKitPhysicsBone, Matrix4>;
  const local = {} as Record<KayKitPhysicsBone, Matrix4>;
  for (const target of KAYKIT_REGION_ORDER) {
    const sourceName = KAYKIT_TARGET_SOURCE[target];
    const matrix = sourceWorld.get(sourceName);
    if (!matrix) throw new Error(`KayKit mapped target "${target}" is missing source joint "${sourceName}"`);
    world[target] = matrix;
  }
  for (const target of KAYKIT_REGION_ORDER) {
    const parent = KAYKIT_TARGET_PARENT[target];
    local[target] = parent
      ? multiplyMatrix4(invertMatrix4(world[parent]), world[target])
      : world[target];
  }
  return Object.freeze({ world: Object.freeze(world), local: Object.freeze(local) });
}

export interface KayKitTriangleRegion {
  triangle: number;
  indices: readonly [number, number, number];
  region: KayKitPhysicsBone;
}

/** Refuse a partition that drops or duplicates even one source triangle. */
export function assertExactTriangleCoverage(
  triangleCount: number,
  assignments: readonly Pick<KayKitTriangleRegion, "triangle">[],
): void {
  if (!Number.isInteger(triangleCount) || triangleCount < 0) {
    throw new Error("triangle count must be a non-negative integer");
  }
  const counts = Array<number>(triangleCount).fill(0);
  for (const assignment of assignments) {
    if (!Number.isInteger(assignment.triangle) || assignment.triangle < 0 || assignment.triangle >= triangleCount) {
      throw new Error(`triangle assignment ${assignment.triangle} is outside 0..${triangleCount - 1}`);
    }
    counts[assignment.triangle] += 1;
  }
  const duplicate = counts.findIndex((count) => count > 1);
  if (duplicate >= 0) throw new Error(`triangle ${duplicate} is assigned more than once`);
  const missing = counts.findIndex((count) => count === 0);
  if (missing >= 0) throw new Error(`triangle ${missing} is not assigned`);
}

export interface KayKitTriangleInput {
  /** Triangle index buffer; non-indexed primitives pass 0..vertexCount-1. */
  indices: readonly number[];
  /** Four skin joint indices per vertex. */
  joints: readonly number[];
  /** Four skin weights per vertex. */
  weights: readonly number[];
  /** Skin joint index to exact creator node name. */
  jointNames: readonly string[];
}

/**
 * Assign each triangle to exactly one severable region.
 *
 * All four influences on all three vertices are collapsed through the native
 * map and summed. Equal totals use `KAYKIT_REGION_ORDER`; changing a comparison
 * from `>` to `>=` therefore changes a tested answer rather than silently
 * reversing ties.
 */
export function assignKayKitTriangleRegions(input: KayKitTriangleInput): readonly KayKitTriangleRegion[] {
  if (input.indices.length % 3 !== 0) throw new Error("KayKit index buffer does not contain whole triangles");
  if (input.joints.length !== input.weights.length || input.joints.length % 4 !== 0) {
    throw new Error("KayKit skin requires four matching joints and weights per vertex");
  }
  const vertexCount = input.joints.length / 4;
  const assignments: KayKitTriangleRegion[] = [];
  for (let triangle = 0; triangle < input.indices.length / 3; triangle += 1) {
    const indices = input.indices.slice(triangle * 3, triangle * 3 + 3) as number[];
    if (indices.some((vertex) => !Number.isInteger(vertex) || vertex < 0 || vertex >= vertexCount)) {
      throw new Error(`triangle ${triangle} references a vertex outside 0..${vertexCount - 1}`);
    }
    const totals = new Map<KayKitPhysicsBone, number>();
    for (const vertex of indices) {
      for (let slot = 0; slot < 4; slot += 1) {
        const at = vertex * 4 + slot;
        const weight = input.weights[at];
        const jointIndex = input.joints[at];
        if (!Number.isFinite(weight) || weight < 0) throw new Error(`vertex ${vertex} has an invalid skin weight`);
        if (weight === 0) continue;
        if (!Number.isInteger(jointIndex) || jointIndex < 0 || jointIndex >= input.jointNames.length) {
          throw new Error(`vertex ${vertex} references unknown skin joint ${jointIndex}`);
        }
        const joint = input.jointNames[jointIndex];
        if (!Object.hasOwn(KAYKIT_NATIVE_TO_PHYSICS, joint)) {
          throw new Error(`KayKit skin joint "${joint}" has no native-to-physics mapping`);
        }
        const region = KAYKIT_NATIVE_TO_PHYSICS[joint];
        if (region === null) {
          throw new Error(`KayKit control joint "${joint}" carries a positive skin weight`);
        }
        totals.set(region, (totals.get(region) ?? 0) + weight);
      }
    }
    let winner: KayKitPhysicsBone | null = null;
    let best = -1;
    for (const region of KAYKIT_REGION_ORDER) {
      const total = totals.get(region) ?? 0;
      if (total > best) {
        winner = region;
        best = total;
      }
    }
    if (winner === null || best <= 0) throw new Error(`triangle ${triangle} has no mapped skin influence`);
    const frozenIndices = Object.freeze([indices[0], indices[1], indices[2]]) as readonly [number, number, number];
    assignments.push(Object.freeze({ triangle, indices: frozenIndices, region: winner }));
  }
  assertExactTriangleCoverage(input.indices.length / 3, assignments);
  return Object.freeze(assignments);
}

export type KayKitAccessoryName =
  | "1H_Sword"
  | "2H_Sword"
  | "1H_Sword_Offhand"
  | "Badge_Shield"
  | "Rectangle_Shield"
  | "Round_Shield"
  | "Spike_Shield";

export const KAYKIT_CREATOR_ACCESSORY: Readonly<Record<KayKitAccessoryName, {
  hand: "hand.l" | "hand.r";
  socket: "handslot.l" | "handslot.r";
}>> = Object.freeze({
  "1H_Sword": Object.freeze({ hand: "hand.r", socket: "handslot.r" }),
  "2H_Sword": Object.freeze({ hand: "hand.r", socket: "handslot.r" }),
  "1H_Sword_Offhand": Object.freeze({ hand: "hand.l", socket: "handslot.l" }),
  Badge_Shield: Object.freeze({ hand: "hand.l", socket: "handslot.l" }),
  Rectangle_Shield: Object.freeze({ hand: "hand.l", socket: "handslot.l" }),
  Round_Shield: Object.freeze({ hand: "hand.l", socket: "handslot.l" }),
  Spike_Shield: Object.freeze({ hand: "hand.l", socket: "handslot.l" }),
});

export interface KayKitAccessoryMount {
  hand: "hand.l" | "hand.r";
  socket: "handslot.l" | "handslot.r";
  accessory: KayKitAccessoryName;
  handWorld: Matrix4;
  socketWorld: Matrix4;
  accessoryWorld: Matrix4;
  socketFromHand: Matrix4;
  accessoryFromSocket: Matrix4;
  accessoryFromHand: Matrix4;
}

/** Derive every mount matrix from the creator hierarchy; no visual offset is accepted as input. */
export function deriveKayKitAccessoryMount(
  nodes: readonly KayKitSourceNode[],
  accessory: KayKitAccessoryName,
): KayKitAccessoryMount {
  const spec = KAYKIT_CREATOR_ACCESSORY[accessory];
  const byName = new Map(nodes.map((node) => [node.name, node]));
  const hand = byName.get(spec.hand);
  const socket = byName.get(spec.socket);
  const item = byName.get(accessory);
  if (!hand || !socket || !item) {
    throw new Error(`KayKit creator mount for "${accessory}" requires ${spec.hand}, ${spec.socket} and ${accessory}`);
  }
  if (socket.parent !== spec.hand) {
    throw new Error(`KayKit creator socket "${spec.socket}" is not a child of "${spec.hand}"`);
  }
  if (item.parent !== spec.socket) {
    throw new Error(`KayKit creator accessory "${accessory}" is not a child of "${spec.socket}"`);
  }
  const worlds = sourceWorldMatrices(nodes);
  const handWorld = worlds.get(spec.hand) as Matrix4;
  const socketWorld = worlds.get(spec.socket) as Matrix4;
  const accessoryWorld = worlds.get(accessory) as Matrix4;
  const socketFromHand = multiplyMatrix4(invertMatrix4(handWorld), socketWorld);
  const accessoryFromSocket = multiplyMatrix4(invertMatrix4(socketWorld), accessoryWorld);
  const accessoryFromHand = multiplyMatrix4(socketFromHand, accessoryFromSocket);
  return Object.freeze({
    hand: spec.hand,
    socket: spec.socket,
    accessory,
    handWorld,
    socketWorld,
    accessoryWorld,
    socketFromHand,
    accessoryFromSocket,
    accessoryFromHand,
  });
}

/** Exported only to make the tie-order contract inspectable by qualification tooling. */
export const kayKitRegionRank = (region: KayKitPhysicsBone): number => regionRank.get(region) as number;
