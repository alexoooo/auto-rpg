const PIECE_NAMES = Object.freeze([
  "floor_a", "floor_b", "floor_c", "floor_d",
  "wall_straight", "wall_run_2", "wall_run_3", "wall_run_5", "wall_run_8",
  "wall_inside", "wall_outside", "wall_end",
  "door_frame", "door_leaf", "torch_bracket", "decal_rubble", "decal_root", "prop_barrel",
] as const);

const MATERIAL_ROLES = Object.freeze([
  "floor_current", "stone_current", "wood_current", "metal_current", "overburden_current",
] as const);
const SHA256 = /^[0-9a-f]{64}$/;
const MAX_ASSET_JSON_BYTES = 4 * 1024 * 1024;
export const ROOM_MAX_PAYLOAD_BYTES = 67_108_864;
export const ROOM_MAX_GPU_BYTES = 268_435_456;
// Exact exported instance capacity: 1,929 matrices mirrored for the main and
// shadow instance buffers. The global ceiling below remains the independent
// denial boundary; this exact value catches one-sided exporter/runtime drift.
const ROOM_INSTANCE_BUFFER_BYTES = 246_912;
const ROOM_SHADOW_MAP_BYTES = 1024 * 1024 * 4;
export const ROOM_RUNTIME_MAP_SHA256 = "a20ba5f64ef55bd7716c2a7cf17f3065619876d1ded2e81b05199b5282222907" as const;

export type RoomPieceName = typeof PIECE_NAMES[number];
export type RoomMaterialRole = typeof MATERIAL_ROLES[number];
export type RoomVector3 = readonly [number, number, number];
export type RoomQuaternion = readonly [number, number, number, number];

export type RoomPieceContract = Readonly<{
  name: RoomPieceName;
  node: `ROOM_${RoomPieceName}`;
  materialRole: RoomMaterialRole;
  primitiveCount: 1;
  vertexCount: number;
  triangleCount: number;
  bounds: Readonly<{ min: RoomVector3; max: RoomVector3 }>;
  collisionDebugBounds: Readonly<{ min: RoomVector3; max: RoomVector3 }>;
  pivot: "ground-centre" | "lower-hinge";
  allowedQuarterTurns: readonly (0 | 1 | 2 | 3)[];
}>;

export type RoomSocketContract = Readonly<{
  name: "SOCKET_torch_flame";
  parent: "ROOM_torch_bracket";
  translation: RoomVector3;
  rotation: RoomQuaternion;
}>;

export type RoomAssetSidecar = Readonly<{
  schemaVersion: 1;
  fixtureId: "v2-room-slice-1";
  buildInputsSha256: string;
  glbSha256: string;
  coordinates: Readonly<{
    sceneHandedness: "right";
    upAxis: "+Y";
    groundAxes: readonly ["+X", "+Z"];
    metresPerUnit: 1;
    tileSize: 1;
  }>;
  pieces: readonly RoomPieceContract[];
  sockets: readonly [RoomSocketContract];
  counts: Readonly<{
    nodes: number; meshes: number; materials: number; vertices: number; triangles: number;
  }>;
  estimatedGpuResidency: Readonly<{
    sourceBufferBytes: number; decodedTextureBytes: number; instanceBufferBytes: number;
    shadowMapBytes: number; totalBytes: number;
  }>;
  runtimeFixture: Readonly<{
    mapSha256: typeof ROOM_RUNTIME_MAP_SHA256;
    mapBytes: 1536;
    solidTiles: 175;
  }>;
  styling: Readonly<{
    id: "painted-cathedral-v4";
    mode: "deterministic-vertex-color";
    attribute: "room_style";
    textures: true;
  }>;
  payloadBytes: number;
}>;

function record(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[], label: string): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new TypeError(`${label} has unexpected or missing fields`);
  }
}

function literal<T extends string | number | boolean>(value: unknown, expected: T, label: string): T {
  if (value !== expected) throw new TypeError(`${label} must be ${JSON.stringify(expected)}`);
  return expected;
}

function safeCount(value: unknown, label: string, maximum = ROOM_MAX_GPU_BYTES): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new TypeError(`${label} must be a nonnegative safe integer`);
  }
  if ((value as number) > maximum) throw new TypeError(`${label} exceeds its documented limit`);
  return value as number;
}

function finite(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new TypeError(`${label} must be finite`);
  return value;
}

function tuple(value: unknown, length: 3 | 4, label: string): readonly number[] {
  if (!Array.isArray(value) || value.length !== length) throw new TypeError(`${label} must have length ${length}`);
  return Object.freeze(value.map((item, index) => finite(item, `${label}[${index}]`)));
}

function bounds(value: unknown, label: string): Readonly<{ min: RoomVector3; max: RoomVector3 }> {
  const source = record(value, label);
  exactKeys(source, ["min", "max"], label);
  const min = tuple(source.min, 3, `${label}.min`) as RoomVector3;
  const max = tuple(source.max, 3, `${label}.max`) as RoomVector3;
  for (let axis = 0; axis < 3; axis++) if ((min[axis] ?? 0) > (max[axis] ?? 0)) {
    throw new TypeError(`${label} min exceeds max`);
  }
  return Object.freeze({ min, max });
}

function piece(value: unknown, index: number): RoomPieceContract {
  const label = `room sidecar pieces[${index}]`;
  const source = record(value, label);
  exactKeys(source, ["name", "node", "materialRole", "primitiveCount", "vertexCount", "triangleCount",
    "bounds", "collisionDebugBounds", "pivot", "allowedQuarterTurns"], label);
  if (typeof source.name !== "string" || !PIECE_NAMES.includes(source.name as RoomPieceName)) {
    throw new TypeError(`${label}.name is unknown`);
  }
  const name = source.name as RoomPieceName;
  const node = `ROOM_${name}` as const;
  literal(source.node, node, `${label}.node`);
  if (typeof source.materialRole !== "string" || !MATERIAL_ROLES.includes(source.materialRole as RoomMaterialRole)) {
    throw new TypeError(`${label}.materialRole is unknown`);
  }
  literal(source.primitiveCount, 1, `${label}.primitiveCount`);
  if (source.pivot !== "ground-centre" && source.pivot !== "lower-hinge") {
    throw new TypeError(`${label}.pivot is unknown`);
  }
  if (!Array.isArray(source.allowedQuarterTurns) || source.allowedQuarterTurns.length === 0 ||
      source.allowedQuarterTurns.some((turn) => turn !== 0 && turn !== 1 && turn !== 2 && turn !== 3) ||
      new Set(source.allowedQuarterTurns).size !== source.allowedQuarterTurns.length) {
    throw new TypeError(`${label}.allowedQuarterTurns is invalid`);
  }
  return Object.freeze({
    name, node, materialRole: source.materialRole as RoomMaterialRole, primitiveCount: 1,
    vertexCount: safeCount(source.vertexCount, `${label}.vertexCount`, ROOM_MAX_PAYLOAD_BYTES),
    triangleCount: safeCount(source.triangleCount, `${label}.triangleCount`, ROOM_MAX_PAYLOAD_BYTES),
    bounds: bounds(source.bounds, `${label}.bounds`),
    collisionDebugBounds: bounds(source.collisionDebugBounds, `${label}.collisionDebugBounds`),
    pivot: source.pivot,
    allowedQuarterTurns: Object.freeze([...source.allowedQuarterTurns]) as readonly (0 | 1 | 2 | 3)[],
  });
}

export function parseRoomAssetSidecar(bytes: Uint8Array): RoomAssetSidecar {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0 || bytes.byteLength > MAX_ASSET_JSON_BYTES) {
    throw new RangeError("room sidecar byte length is invalid");
  }
  let unknown: unknown;
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    unknown = JSON.parse(text) as unknown;
  } catch (error) {
    throw new TypeError(`room sidecar is not canonical UTF-8 JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  const source = record(unknown, "room sidecar");
  exactKeys(source, ["schemaVersion", "fixtureId", "buildInputsSha256", "glbSha256", "coordinates",
    "pieces", "sockets", "counts", "estimatedGpuResidency", "runtimeFixture", "styling", "payloadBytes"], "room sidecar");
  literal(source.schemaVersion, 1, "room sidecar schemaVersion");
  literal(source.fixtureId, "v2-room-slice-1", "room sidecar fixtureId");
  for (const key of ["buildInputsSha256", "glbSha256"] as const) {
    if (typeof source[key] !== "string" || !SHA256.test(source[key])) throw new TypeError(`room sidecar ${key} is invalid`);
  }
  const coordinateSource = record(source.coordinates, "room sidecar coordinates");
  exactKeys(coordinateSource, ["sceneHandedness", "upAxis", "groundAxes", "metresPerUnit", "tileSize"],
    "room sidecar coordinates");
  literal(coordinateSource.sceneHandedness, "right", "room sidecar handedness");
  literal(coordinateSource.upAxis, "+Y", "room sidecar up axis");
  literal(coordinateSource.metresPerUnit, 1, "room sidecar metres per unit");
  literal(coordinateSource.tileSize, 1, "room sidecar tile size");
  if (!Array.isArray(coordinateSource.groundAxes) || coordinateSource.groundAxes.length !== 2 ||
      coordinateSource.groundAxes[0] !== "+X" || coordinateSource.groundAxes[1] !== "+Z") {
    throw new TypeError("room sidecar ground axes are invalid");
  }
  if (!Array.isArray(source.pieces) || source.pieces.length !== PIECE_NAMES.length) {
    throw new TypeError(`room sidecar must contain ${PIECE_NAMES.length} pieces`);
  }
  const pieces = Object.freeze(source.pieces.map(piece));
  if (new Set(pieces.map((item) => item.name)).size !== PIECE_NAMES.length ||
      PIECE_NAMES.some((name) => !pieces.some((item) => item.name === name))) {
    throw new TypeError("room sidecar piece set is incomplete or duplicated");
  }
  if (!Array.isArray(source.sockets) || source.sockets.length !== 1) {
    throw new TypeError("room sidecar must contain one socket");
  }
  const socketSource = record(source.sockets[0], "room sidecar socket");
  exactKeys(socketSource, ["name", "parent", "translation", "rotation"], "room sidecar socket");
  const socket = Object.freeze({
    name: literal(socketSource.name, "SOCKET_torch_flame", "room sidecar socket name"),
    parent: literal(socketSource.parent, "ROOM_torch_bracket", "room sidecar socket parent"),
    translation: tuple(socketSource.translation, 3, "room sidecar socket translation") as RoomVector3,
    rotation: tuple(socketSource.rotation, 4, "room sidecar socket rotation") as RoomQuaternion,
  });
  const length = Math.hypot(...socket.rotation);
  if (Math.abs(length - 1) > 0.00001) throw new TypeError("room sidecar socket rotation is not normalized");

  const countSource = record(source.counts, "room sidecar counts");
  exactKeys(countSource, ["nodes", "meshes", "materials", "vertices", "triangles"], "room sidecar counts");
  const counts = Object.freeze({
    nodes: safeCount(countSource.nodes, "room sidecar node count"),
    meshes: safeCount(countSource.meshes, "room sidecar mesh count"),
    materials: safeCount(countSource.materials, "room sidecar material count"),
    vertices: safeCount(countSource.vertices, "room sidecar vertex count", ROOM_MAX_PAYLOAD_BYTES),
    triangles: safeCount(countSource.triangles, "room sidecar triangle count", ROOM_MAX_PAYLOAD_BYTES),
  });
  if (counts.meshes !== PIECE_NAMES.length || counts.nodes !== PIECE_NAMES.length + 1 ||
      counts.materials !== MATERIAL_ROLES.length ||
      counts.vertices !== pieces.reduce((sum, item) => sum + item.vertexCount, 0) ||
      counts.triangles !== pieces.reduce((sum, item) => sum + item.triangleCount, 0)) {
    throw new TypeError("room sidecar aggregate counts disagree with its pieces");
  }
  const gpuSource = record(source.estimatedGpuResidency, "room sidecar GPU estimate");
  exactKeys(gpuSource, ["sourceBufferBytes", "decodedTextureBytes", "instanceBufferBytes", "shadowMapBytes", "totalBytes"],
    "room sidecar GPU estimate");
  const gpuValues = {
    sourceBufferBytes: safeCount(gpuSource.sourceBufferBytes, "room sidecar source bytes"),
    decodedTextureBytes: safeCount(gpuSource.decodedTextureBytes, "room sidecar texture bytes"),
    instanceBufferBytes: safeCount(gpuSource.instanceBufferBytes, "room sidecar instance bytes"),
    shadowMapBytes: safeCount(gpuSource.shadowMapBytes, "room sidecar shadow bytes"),
    totalBytes: safeCount(gpuSource.totalBytes, "room sidecar total GPU bytes"),
  };
  if (gpuValues.totalBytes !== gpuValues.sourceBufferBytes + gpuValues.decodedTextureBytes +
      gpuValues.instanceBufferBytes + gpuValues.shadowMapBytes) {
    throw new TypeError("room sidecar GPU estimate total is inconsistent");
  }
  if (gpuValues.instanceBufferBytes !== ROOM_INSTANCE_BUFFER_BYTES ||
      gpuValues.shadowMapBytes !== ROOM_SHADOW_MAP_BYTES || gpuValues.totalBytes > ROOM_MAX_GPU_BYTES) {
    throw new TypeError("room sidecar GPU estimate violates the documented capacity budget");
  }
  const runtimeSource = record(source.runtimeFixture, "room sidecar runtime fixture");
  exactKeys(runtimeSource, ["mapSha256", "mapBytes", "solidTiles"], "room sidecar runtime fixture");
  const runtimeFixture = Object.freeze({
    mapSha256: literal(runtimeSource.mapSha256, ROOM_RUNTIME_MAP_SHA256, "room sidecar runtime map SHA-256"),
    mapBytes: literal(runtimeSource.mapBytes, 1536, "room sidecar runtime map bytes"),
    solidTiles: literal(runtimeSource.solidTiles, 175, "room sidecar runtime solid tiles"),
  });
  const stylingSource = record(source.styling, "room sidecar styling");
  exactKeys(stylingSource, ["id", "mode", "attribute", "textures"], "room sidecar styling");
  const styling = Object.freeze({
    id: literal(stylingSource.id, "painted-cathedral-v4", "room sidecar styling id"),
    mode: literal(stylingSource.mode, "deterministic-vertex-color", "room sidecar styling mode"),
    attribute: literal(stylingSource.attribute, "room_style", "room sidecar styling attribute"),
    textures: literal(stylingSource.textures, true, "room sidecar styling textures"),
  });
  const sockets: readonly [RoomSocketContract] = Object.freeze([socket]);
  const payloadBytes = safeCount(source.payloadBytes, "room sidecar payload bytes", ROOM_MAX_PAYLOAD_BYTES);
  if (payloadBytes === 0) throw new TypeError("room sidecar payload bytes must be positive");
  return Object.freeze({
    schemaVersion: 1, fixtureId: "v2-room-slice-1",
    buildInputsSha256: source.buildInputsSha256 as string, glbSha256: source.glbSha256 as string,
    coordinates: Object.freeze({ sceneHandedness: "right", upAxis: "+Y",
      groundAxes: Object.freeze(["+X", "+Z"] as const), metresPerUnit: 1, tileSize: 1 }),
    pieces, sockets, counts,
    estimatedGpuResidency: Object.freeze(gpuValues), runtimeFixture, styling,
    payloadBytes,
  });
}
