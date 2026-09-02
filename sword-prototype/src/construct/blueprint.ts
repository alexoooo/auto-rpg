export const CONSTRUCT_BLUEPRINT_VERSION = 4 as const;
export const CONSTRUCT_BLUEPRINT_LIMITS = Object.freeze({ maxBytes: 1_048_576, maxDepth: 64,
  maxParts: 128, maxJoints: 127, maxSockets: 256, maxModules: 256,
  maxModulePrimitives: 16, maxModuleSensorChannels: 24, maxSensorChannels: 256 });

export type Triple = readonly [number, number, number];
export type Rotation = readonly [number, number, number, number];
export interface FrameSpec { readonly positionM: Triple; readonly rotation: Rotation }
export type AttachmentFrame = FrameSpec;
export type PrimitiveShape = Readonly<{ kind: "box"; sizeM: Triple }> |
  Readonly<{ kind: "capsule" | "cylinder"; lengthM: number; radiusM: number }> |
  Readonly<{ kind: "sphere"; radiusM: number }>;
export type ShellStyle = "plate" | "collar" | "bearing" | "piston" | "core" | "support";
export interface ShellSpec { readonly style: ShellStyle; readonly visualClearanceM: number }
export interface PartSpec { readonly id: string; readonly shape: PrimitiveShape; readonly massKg: number;
  readonly centreOfMassM: Triple; readonly friction: number; readonly restitution: number;
  readonly health: number; readonly armour: number; readonly vitalityWeight: number; readonly fatal: boolean;
  readonly shell: ShellSpec }
export interface AngularAxisSpec { readonly id: "x" | "y" | "z"; readonly minRad: number;
  readonly maxRad: number; readonly damping: number; readonly maxTorqueNm: number; readonly maxSpeedRadS: number }
export interface JointSpec { readonly id: string; readonly parentPart: string; readonly childPart: string;
  readonly parentFrame: FrameSpec; readonly childFrame: FrameSpec; readonly angularAxes: readonly AngularAxisSpec[];
  readonly health: number; readonly armour: number }
export interface SocketSpec { readonly id: string; readonly part: string; readonly frame: FrameSpec; readonly accepts: readonly string[] }
export type ModuleKind = "contact-sensor" | "attitude-sensor" | "opponent-sensor" |
  "power-core" | "shield" | "sword" | "launcher" | "magazine";
export interface ModulePrimitiveSpec { readonly id: string; readonly frame: FrameSpec;
  readonly shape: PrimitiveShape; readonly shell: ShellSpec }
export interface StrikerSpec { readonly localTipM: Triple; readonly localEdgeDirection: Triple;
  readonly localFlatDirection: Triple; readonly damageScale: number }
export interface ProjectileSpec { readonly poolSize: number; readonly massKg: number; readonly radiusM: number;
  readonly lengthM: number; readonly muzzleSpeedMps: number; readonly penetrationEfficiency: number }
export interface MountedContactStrikerSpec { readonly kind: "authored-shove";
  readonly localContactPoint: Triple; readonly shoveSpecificImpulseMps: number }
export interface ModuleSpec { readonly id: string; readonly kind: ModuleKind; readonly socket: string;
  readonly compatibilityTag: string; readonly geometry: readonly ModulePrimitiveSpec[]; readonly massKg: number;
  readonly health: number; readonly armour: number; readonly capacityJ?: number; readonly maxOutputW?: number;
  readonly maxHeatJ?: number; readonly coolingW?: number; readonly reloadSeconds?: number;
  readonly heatPerShotJ?: number; readonly energyPerShotJ?: number; readonly ammunition?: number;
  readonly sensorChannels?: readonly string[]; readonly striker?: StrikerSpec; readonly projectile?: ProjectileSpec;
  readonly mountedContactStriker?: MountedContactStrikerSpec }
export interface ConstructBlueprint { readonly version: 4; readonly id: string; readonly rootPart: string;
  readonly parts: readonly PartSpec[]; readonly joints: readonly JointSpec[];
  readonly sockets: readonly SocketSpec[]; readonly modules: readonly ModuleSpec[] }
export interface LegacyProjectileSpec extends Omit<ProjectileSpec, "penetrationEfficiency"> {
  readonly damageScale: number }
export interface LegacyModuleSpec extends Omit<ModuleSpec, "projectile" | "mountedContactStriker"> {
  readonly projectile?: LegacyProjectileSpec }
export interface LegacyConstructBlueprint extends Omit<ConstructBlueprint, "version" | "modules"> {
  readonly version: 1; readonly modules: readonly LegacyModuleSpec[] }
export interface V2ConstructBlueprint extends Omit<ConstructBlueprint, "version" | "modules"> {
  readonly version: 2; readonly modules: readonly LegacyModuleSpec[] }
export interface V3ConstructBlueprint extends Omit<ConstructBlueprint, "version" | "mountedContactStriker"> {
  readonly version: 3 }

type Plain = Record<string, unknown>;
const ID = /^[a-z][a-z0-9-]{0,47}$/;
const KINDS: readonly ModuleKind[] = ["contact-sensor", "attitude-sensor", "opponent-sensor", "power-core", "shield", "sword", "launcher", "magazine"];
const STYLES: readonly ShellStyle[] = ["plate", "collar", "bearing", "piston", "core", "support"];
const OPTIONAL = ["capacityJ", "maxOutputW", "maxHeatJ", "coolingW", "reloadSeconds", "heatPerShotJ", "energyPerShotJ", "ammunition", "sensorChannels", "striker", "projectile", "mountedContactStriker"] as const;
const OWNED: Readonly<Record<ModuleKind, readonly string[]>> = { "contact-sensor": ["sensorChannels"],
  "attitude-sensor": ["sensorChannels"], "opponent-sensor": ["sensorChannels"],
  "power-core": ["capacityJ", "maxOutputW"], shield: [], sword: ["striker"], magazine: ["ammunition"],
  launcher: ["maxHeatJ", "coolingW", "reloadSeconds", "heatPerShotJ", "energyPerShotJ", "projectile"] };

const object = (value: unknown, context: string): Plain => {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) throw new Error(`${context} must be an object`);
  return value as Plain;
};
const fields = (source: Plain, required: readonly string[], optional: readonly string[], context: string): void => {
  const allowed = new Set([...required, ...optional]); const unknown = Object.keys(source).find((key) => !allowed.has(key));
  if (unknown) throw new Error(`${context} has unknown field "${unknown}"`);
  const missing = required.find((key) => !Object.prototype.hasOwnProperty.call(source, key));
  if (missing) throw new Error(`${context} is missing field "${missing}"`);
};
const array = (value: unknown, context: string, field: string): readonly unknown[] => {
  if (!Array.isArray(value)) throw new Error(`${context} field "${field}" must be an array`); return value;
};
const id = (value: unknown, context: string, field: string): string => {
  if (typeof value !== "string" || !ID.test(value)) throw new Error(`${context} field "${field}" must match [a-z][a-z0-9-]{0,47}`); return value;
};
const finite = (value: unknown, context: string, field: string): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${context} field "${field}" must be finite`); return value;
};
const positive = (value: unknown, context: string, field: string): number => {
  const result = finite(value, context, field); if (result <= 0) throw new Error(`${context} field "${field}" must be positive`); return result;
};
const nonNegative = (value: unknown, context: string, field: string): number => {
  const result = finite(value, context, field); if (result < 0) throw new Error(`${context} field "${field}" must be non-negative`); return result;
};
const integer = (value: unknown, context: string, field: string): number => {
  const result = positive(value, context, field); if (!Number.isSafeInteger(result)) throw new Error(`${context} field "${field}" must be a positive integer`); return result;
};
const tuple = (value: unknown, count: number, context: string, field: string): readonly number[] => {
  if (!Array.isArray(value) || value.length !== count) throw new Error(`${context} field "${field}" must contain ${count} finite numbers`);
  return value.map((entry, index) => finite(entry, context, `${field}[${index}]`));
};
const triple = (value: unknown, context: string, field: string): Triple => Object.freeze(tuple(value, 3, context, field)) as Triple;
const unit = (value: unknown, context: string, field: string): Triple => { const result = triple(value, context, field);
  if (Math.abs(result.reduce((sum, entry) => sum + entry * entry, 0) - 1) > 1e-6) throw new Error(`${context} field "${field}" must be normalized`); return result; };
const rotation = (value: unknown, context: string, field: string): Rotation => { const result = Object.freeze(tuple(value, 4, context, field)) as Rotation;
  if (Math.abs(result.reduce((sum, entry) => sum + entry * entry, 0) - 1) > 1e-6) throw new Error(`${context} field "${field}" must be a normalized quaternion`); return result; };
const frame = (value: unknown, context: string, field: string): FrameSpec => { const source = object(value, `${context} field "${field}"`);
  fields(source, ["positionM", "rotation"], [], `${context} field "${field}"`); return Object.freeze({ positionM: triple(source.positionM, context, `${field}.positionM`), rotation: rotation(source.rotation, context, `${field}.rotation`) }); };
const shape = (value: unknown, context: string, field = "shape"): PrimitiveShape => { const source = object(value, `${context} field "${field}"`);
  if (source.kind === "box") { fields(source, ["kind", "sizeM"], [], `${context} field "${field}"`); const sizeM = triple(source.sizeM, context, `${field}.sizeM`); sizeM.forEach((entry, index) => positive(entry, context, `${field}.sizeM[${index}]`)); return Object.freeze({ kind: source.kind, sizeM }); }
  if (source.kind === "capsule" || source.kind === "cylinder") { fields(source, ["kind", "lengthM", "radiusM"], [], `${context} field "${field}"`); return Object.freeze({ kind: source.kind, lengthM: positive(source.lengthM, context, `${field}.lengthM`), radiusM: positive(source.radiusM, context, `${field}.radiusM`) }); }
  if (source.kind === "sphere") { fields(source, ["kind", "radiusM"], [], `${context} field "${field}"`); return Object.freeze({ kind: source.kind, radiusM: positive(source.radiusM, context, `${field}.radiusM`) }); }
  throw new Error(`${context} field "${field}.kind" is unknown`);
};
const shell = (value: unknown, context: string, field = "shell"): ShellSpec => { const source = object(value, `${context} field "${field}"`);
  fields(source, ["style", "visualClearanceM"], [], `${context} field "${field}"`); if (!STYLES.includes(source.style as ShellStyle)) throw new Error(`${context} field "${field}.style" is unknown`);
  return Object.freeze({ style: source.style as ShellStyle, visualClearanceM: nonNegative(source.visualClearanceM, context, `${field}.visualClearanceM`) }); };
const idList = (value: unknown, context: string, field: string, maximum = Number.MAX_SAFE_INTEGER): readonly string[] => { const rows = array(value, context, field).map((entry, index) => id(entry, context, `${field}[${index}]`));
  if (rows.length > maximum) throw new Error(`${context} field "${field}" exceeds maximum ${maximum}`); if (new Set(rows).size !== rows.length) throw new Error(`${context} field "${field}" contains a duplicate member`); return Object.freeze(rows); };

const inverseRotate = (value: Triple, rotationValue: Rotation): Triple => {
  const [x, y, z, w] = rotationValue;
  const ux = -x; const uy = -y; const uz = -z;
  const dot = ux * value[0] + uy * value[1] + uz * value[2];
  const square = ux * ux + uy * uy + uz * uz;
  return [
    2 * dot * ux + (w * w - square) * value[0] + 2 * w * (uy * value[2] - uz * value[1]),
    2 * dot * uy + (w * w - square) * value[1] + 2 * w * (uz * value[0] - ux * value[2]),
    2 * dot * uz + (w * w - square) * value[2] + 2 * w * (ux * value[1] - uy * value[0]),
  ];
};

const pointOnPrimitive = (point: Triple, primitive: ModulePrimitiveSpec): boolean => {
  const translated: Triple = [point[0] - primitive.frame.positionM[0], point[1] - primitive.frame.positionM[1],
    point[2] - primitive.frame.positionM[2]];
  const local = inverseRotate(translated, primitive.frame.rotation);
  const epsilon = 1e-6;
  if (primitive.shape.kind === "box") {
    const half = primitive.shape.sizeM.map((value) => value / 2);
    return local.every((value, index) => Math.abs(value) <= half[index] + epsilon) &&
      local.some((value, index) => Math.abs(Math.abs(value) - half[index]) <= epsilon);
  }
  if (primitive.shape.kind === "sphere") {
    return Math.abs(Math.hypot(...local) - primitive.shape.radiusM) <= epsilon;
  }
  if (primitive.shape.kind === "cylinder") {
    const radial = Math.hypot(local[0], local[2]); const half = primitive.shape.lengthM / 2;
    return radial <= primitive.shape.radiusM + epsilon && Math.abs(local[1]) <= half + epsilon &&
      (Math.abs(radial - primitive.shape.radiusM) <= epsilon || Math.abs(Math.abs(local[1]) - half) <= epsilon);
  }
  const halfSegment = Math.max(0, primitive.shape.lengthM / 2 - primitive.shape.radiusM);
  const segmentY = Math.max(-halfSegment, Math.min(halfSegment, local[1]));
  return Math.abs(Math.hypot(local[0], local[1] - segmentY, local[2]) - primitive.shape.radiusM) <= epsilon;
};

function parseModule(value: unknown, blueprint: string, index: number, version: 1 | 2 | 3 | 4): ModuleSpec | LegacyModuleSpec {
  const source = object(value, `blueprint "${blueprint}" module[${index}]`); const context = `module "${typeof source.id === "string" ? source.id : `<index ${index}>`}"`;
  fields(source, ["id", "kind", "socket", "compatibilityTag", "geometry", "massKg", "health", "armour"], OPTIONAL, context);
  if (!KINDS.includes(source.kind as ModuleKind)) throw new Error(`${context} field "kind" is unknown`); const kind = source.kind as ModuleKind;
  for (const name of OPTIONAL) if (Object.prototype.hasOwnProperty.call(source, name) &&
      !OWNED[kind].includes(name) && !(name === "mountedContactStriker" && kind === "shield" && version === 4)) {
    throw new Error(`${context} field "${name}" is not owned by kind "${kind}"`);
  }
  for (const name of OWNED[kind]) if (!Object.prototype.hasOwnProperty.call(source, name)) throw new Error(`${context} kind "${kind}" is missing field "${name}"`);
  const geometrySource = array(source.geometry, context, "geometry"); if (!geometrySource.length || geometrySource.length > CONSTRUCT_BLUEPRINT_LIMITS.maxModulePrimitives) throw new Error(`${context} field "geometry" must contain 1 to 16 primitives`);
  const geometry = geometrySource.map((entry, at): ModulePrimitiveSpec => { const primitive = object(entry, `${context} geometry[${at}]`); fields(primitive, ["id", "frame", "shape", "shell"], [], `${context} geometry[${at}]`);
    return Object.freeze({ id: id(primitive.id, `${context} geometry[${at}]`, "id"), frame: frame(primitive.frame, `${context} geometry[${at}]`, "frame"), shape: shape(primitive.shape, `${context} geometry[${at}]`), shell: shell(primitive.shell, `${context} geometry[${at}]`) }); });
  if (new Set(geometry.map((row) => row.id)).size !== geometry.length) throw new Error(`${context} field "geometry" has duplicate id`);
  const result: Plain = { id: id(source.id, context, "id"), kind, socket: id(source.socket, context, "socket"), compatibilityTag: id(source.compatibilityTag, context, "compatibilityTag"), geometry: Object.freeze(geometry), massKg: positive(source.massKg, context, "massKg"), health: positive(source.health, context, "health"), armour: nonNegative(source.armour, context, "armour") };
  for (const name of ["capacityJ", "maxOutputW", "maxHeatJ", "reloadSeconds", "heatPerShotJ", "energyPerShotJ"] as const) if (source[name] !== undefined) result[name] = positive(source[name], context, name);
  if (source.coolingW !== undefined) result.coolingW = nonNegative(source.coolingW, context, "coolingW"); if (source.ammunition !== undefined) result.ammunition = integer(source.ammunition, context, "ammunition");
  if (source.sensorChannels !== undefined) result.sensorChannels = idList(source.sensorChannels, context,
    "sensorChannels", CONSTRUCT_BLUEPRINT_LIMITS.maxModuleSensorChannels);
  if (source.striker !== undefined) { const striker = object(source.striker, `${context} field "striker"`); fields(striker, ["localTipM", "localEdgeDirection", "localFlatDirection", "damageScale"], [], `${context} field "striker"`);
    const tip = triple(striker.localTipM, context, "striker.localTipM"); const edge = unit(striker.localEdgeDirection, context, "striker.localEdgeDirection"); const flat = unit(striker.localFlatDirection, context, "striker.localFlatDirection");
    if (Math.abs(edge[0] * flat[0] + edge[1] * flat[1] + edge[2] * flat[2]) > 1e-6) throw new Error(`${context} field "striker" directions must be orthogonal`);
    if (!geometry.some((primitive) => pointOnPrimitive(tip, primitive))) throw new Error(`${context} field "striker.localTipM" must lie on declared geometry`);
    result.striker = Object.freeze({ localTipM: tip, localEdgeDirection: edge, localFlatDirection: flat, damageScale: positive(striker.damageScale, context, "striker.damageScale"),
    }); }
  if (source.projectile !== undefined) {
    const projectile = object(source.projectile, `${context} field "projectile"`);
    const field = version <= 2 ? "damageScale" : "penetrationEfficiency";
    fields(projectile, ["poolSize", "massKg", "radiusM", "lengthM", "muzzleSpeedMps", field], [], `${context} field "projectile"`);
    const bounded = positive(projectile[field], context, `projectile.${field}`);
    if (version >= 3 && bounded > 1) throw new Error(`${context} field "projectile.penetrationEfficiency" must be at most 1`);
    const parsed: Record<string, unknown> = { poolSize: integer(projectile.poolSize, context, "projectile.poolSize"),
      massKg: positive(projectile.massKg, context, "projectile.massKg"),
      radiusM: positive(projectile.radiusM, context, "projectile.radiusM"),
      lengthM: positive(projectile.lengthM, context, "projectile.lengthM"),
      muzzleSpeedMps: positive(projectile.muzzleSpeedMps, context, "projectile.muzzleSpeedMps"), [field]: bounded };
    result.projectile = Object.freeze(parsed);
  }
  if (source.mountedContactStriker !== undefined) {
    const mounted = object(source.mountedContactStriker, `${context} field "mountedContactStriker"`);
    fields(mounted, ["kind", "localContactPoint", "shoveSpecificImpulseMps"], [], `${context} field "mountedContactStriker"`);
    if (mounted.kind !== "authored-shove") throw new Error(`${context} field "mountedContactStriker.kind" is unknown`);
    const localContactPoint = triple(mounted.localContactPoint, context, "mountedContactStriker.localContactPoint");
    const shove = positive(mounted.shoveSpecificImpulseMps, context, "mountedContactStriker.shoveSpecificImpulseMps");
    if (shove > 0.014) throw new Error(`${context} field "mountedContactStriker.shoveSpecificImpulseMps" must be at most 0.014`);
    if (!geometry.some((primitive) => pointOnPrimitive(localContactPoint, primitive))) {
      throw new Error(`${context} field "mountedContactStriker.localContactPoint" must lie on declared geometry`);
    }
    result.mountedContactStriker = Object.freeze({ kind: mounted.kind, localContactPoint,
      shoveSpecificImpulseMps: shove });
  }
  return Object.freeze(result) as unknown as ModuleSpec | LegacyModuleSpec;
}

function topology(blueprint: ConstructBlueprint | LegacyConstructBlueprint | V2ConstructBlueprint | V3ConstructBlueprint): void {
  const parts = new Set(blueprint.parts.map((part) => part.id)); if (!parts.has(blueprint.rootPart)) throw new Error(`blueprint "${blueprint.id}" field "rootPart" references missing part "${blueprint.rootPart}"`);
  const parent = new Map<string, JointSpec>(); const children = new Map<string, JointSpec[]>();
  for (const joint of blueprint.joints) { if (!parts.has(joint.parentPart)) throw new Error(`joint "${joint.id}" field "parentPart" references missing part "${joint.parentPart}"`); if (!parts.has(joint.childPart)) throw new Error(`joint "${joint.id}" field "childPart" references missing part "${joint.childPart}"`); if (joint.childPart === blueprint.rootPart) throw new Error(`joint "${joint.id}" field "childPart" makes root part "${blueprint.rootPart}" a child`); if (parent.has(joint.childPart)) throw new Error(`joint "${joint.id}" field "childPart" repeats part "${joint.childPart}"`); parent.set(joint.childPart, joint); const rows = children.get(joint.parentPart) ?? []; rows.push(joint); children.set(joint.parentPart, rows); }
  const reached = new Set<string>(); const active = new Set<string>(); const visit = (part: string): void => { if (active.has(part)) throw new Error(`part "${part}" field "joints" creates a cycle`); if (reached.has(part)) return; reached.add(part); active.add(part); for (const joint of children.get(part) ?? []) visit(joint.childPart); active.delete(part); }; visit(blueprint.rootPart);
  const disconnected = blueprint.parts.find((part) => !reached.has(part.id)); if (disconnected) throw new Error(`part "${disconnected.id}" field "joints" is disconnected from root part "${blueprint.rootPart}"`); if (blueprint.joints.length !== blueprint.parts.length - 1) throw new Error(`blueprint "${blueprint.id}" field "joints" must contain one edge per non-root part`);
}

function validateBlueprintVersion(value: unknown, version: 1 | 2 | 3 | 4): ConstructBlueprint | LegacyConstructBlueprint | V2ConstructBlueprint | V3ConstructBlueprint {
  const source = object(value, "construct blueprint"); const named = typeof source.id === "string" ? source.id : "<unknown>"; fields(source, ["version", "id", "rootPart", "parts", "joints", "sockets", "modules"], [], `blueprint "${named}"`); if (source.version !== version) throw new Error(`blueprint "${named}" field "version" ${JSON.stringify(source.version)} is unsupported`); const blueprintId = id(source.id, `blueprint "${named}"`, "id");
  const partsSource = array(source.parts, `blueprint "${blueprintId}"`, "parts"); const jointsSource = array(source.joints, `blueprint "${blueprintId}"`, "joints"); const socketsSource = array(source.sockets, `blueprint "${blueprintId}"`, "sockets"); const modulesSource = array(source.modules, `blueprint "${blueprintId}"`, "modules");
  for (const [name, rows, maximum] of [["parts", partsSource, 128], ["joints", jointsSource, 127], ["sockets", socketsSource, 256], ["modules", modulesSource, 256]] as const) if (rows.length > maximum) throw new Error(`construct blueprint field "${name}" exceeds maximum ${maximum}`);
  const parts = partsSource.map((entry, index): PartSpec => { const row = object(entry, `blueprint "${blueprintId}" part[${index}]`); const context = `part "${typeof row.id === "string" ? row.id : `<index ${index}>`}"`; fields(row, ["id", "shape", "massKg", "centreOfMassM", "friction", "restitution", "health", "armour", "vitalityWeight", "fatal", "shell"], [], context); const restitution = nonNegative(row.restitution, context, "restitution"); if (restitution > 1) throw new Error(`${context} field "restitution" must be at most 1`); if (typeof row.fatal !== "boolean") throw new Error(`${context} field "fatal" must be boolean`); return Object.freeze({ id: id(row.id, context, "id"), shape: shape(row.shape, context), massKg: positive(row.massKg, context, "massKg"), centreOfMassM: triple(row.centreOfMassM, context, "centreOfMassM"), friction: nonNegative(row.friction, context, "friction"), restitution, health: positive(row.health, context, "health"), armour: nonNegative(row.armour, context, "armour"), vitalityWeight: nonNegative(row.vitalityWeight, context, "vitalityWeight"), fatal: row.fatal, shell: shell(row.shell, context) }); });
  const joints = jointsSource.map((entry, index): JointSpec => { const row = object(entry, `blueprint "${blueprintId}" joint[${index}]`); const context = `joint "${typeof row.id === "string" ? row.id : `<index ${index}>`}"`; fields(row, ["id", "parentPart", "childPart", "parentFrame", "childFrame", "angularAxes", "health", "armour"], [], context); const axesSource = array(row.angularAxes, context, "angularAxes"); if (!axesSource.length || axesSource.length > 3) throw new Error(`${context} field "angularAxes" must contain 1 to 3 axes`); const angularAxes = axesSource.map((entryAxis, at): AngularAxisSpec => { const axis = object(entryAxis, `${context} angularAxes[${at}]`); fields(axis, ["id", "minRad", "maxRad", "damping", "maxTorqueNm", "maxSpeedRadS"], [], `${context} angularAxes[${at}]`); if (axis.id !== "x" && axis.id !== "y" && axis.id !== "z") throw new Error(`${context} field "angularAxes[${at}].id" is unknown`); const minRad = finite(axis.minRad, context, `angularAxes[${at}].minRad`); const maxRad = finite(axis.maxRad, context, `angularAxes[${at}].maxRad`); if (minRad > maxRad) throw new Error(`${context} field "angularAxes[${at}]" has min greater than max`); return Object.freeze({ id: axis.id, minRad, maxRad, damping: nonNegative(axis.damping, context, `angularAxes[${at}].damping`), maxTorqueNm: positive(axis.maxTorqueNm, context, `angularAxes[${at}].maxTorqueNm`), maxSpeedRadS: positive(axis.maxSpeedRadS, context, `angularAxes[${at}].maxSpeedRadS`) }); }); if (new Set(angularAxes.map((axis) => axis.id)).size !== angularAxes.length) throw new Error(`${context} field "angularAxes" contains a duplicate axis`); return Object.freeze({ id: id(row.id, context, "id"), parentPart: id(row.parentPart, context, "parentPart"), childPart: id(row.childPart, context, "childPart"), parentFrame: frame(row.parentFrame, context, "parentFrame"), childFrame: frame(row.childFrame, context, "childFrame"), angularAxes: Object.freeze(angularAxes), health: positive(row.health, context, "health"), armour: nonNegative(row.armour, context, "armour") }); });
  const sockets = socketsSource.map((entry, index): SocketSpec => { const row = object(entry, `blueprint "${blueprintId}" socket[${index}]`); const context = `socket "${typeof row.id === "string" ? row.id : `<index ${index}>`}"`; fields(row, ["id", "part", "frame", "accepts"], [], context); const accepts = idList(row.accepts, context, "accepts"); if (!accepts.length) throw new Error(`${context} field "accepts" must not be empty`); return Object.freeze({ id: id(row.id, context, "id"), part: id(row.part, context, "part"), frame: frame(row.frame, context, "frame"), accepts }); });
  const modules = modulesSource.map((entry, index) => parseModule(entry, blueprintId, index, version)); for (const [name, rows] of [["parts", parts], ["joints", joints], ["sockets", sockets], ["modules", modules]] as const) if (new Set(rows.map((row) => row.id)).size !== rows.length) throw new Error(`blueprint "${blueprintId}" field "${name}" has duplicate id`);
  const blueprint = Object.freeze({ version, id: blueprintId, rootPart: id(source.rootPart, `blueprint "${blueprintId}"`, "rootPart"), parts: Object.freeze(parts), joints: Object.freeze(joints), sockets: Object.freeze(sockets), modules: Object.freeze(modules) }) as unknown as ConstructBlueprint | LegacyConstructBlueprint | V2ConstructBlueprint | V3ConstructBlueprint; if (!parts.some((part) => part.fatal || part.vitalityWeight > 0)) throw new Error(`blueprint "${blueprintId}" field "parts" must contain a fatal or positive-vitality part`); topology(blueprint);
  const partIds = new Set(parts.map((part) => part.id)); const socketMap = new Map(sockets.map((socket) => [socket.id, socket])); const occupied = new Map<string, string>(); for (const socket of sockets) if (!partIds.has(socket.part)) throw new Error(`socket "${socket.id}" field "part" references missing part "${socket.part}"`); for (const module of modules) { const socket = socketMap.get(module.socket); if (!socket) throw new Error(`module "${module.id}" field "socket" references missing socket "${module.socket}"`); if (occupied.has(module.socket)) throw new Error(`module "${module.id}" field "socket" is already occupied by module "${occupied.get(module.socket)}"`); if (!socket.accepts.includes(module.compatibilityTag)) throw new Error(`module "${module.id}" field "compatibilityTag" "${module.compatibilityTag}" is incompatible with socket "${socket.id}"`); occupied.set(module.socket, module.id);
    if (module.projectile) {
      const energy = 0.5 * module.projectile.massKg * module.projectile.muzzleSpeedMps ** 2;
      if ((module.energyPerShotJ ?? 0) < energy) {
        throw new Error(`module "${module.id}" projectile muzzle energy ${energy} J exceeds energyPerShotJ ${module.energyPerShotJ ?? 0} J`);
      }
    }
  } const channels = modules.reduce((sum, module) => sum + (module.sensorChannels?.length ?? 0), 0); if (channels > 256) throw new Error(`construct blueprint field "sensorChannels" exceeds maximum 256`); return blueprint;
}

export const validateBlueprint = (value: unknown): ConstructBlueprint =>
  validateBlueprintVersion(value, CONSTRUCT_BLUEPRINT_VERSION) as ConstructBlueprint;

/** Frozen v1 grammar used only to authenticate saved bytes before migration. */
export const validateLegacyBlueprint = (value: unknown): LegacyConstructBlueprint =>
  validateBlueprintVersion(value, 1) as LegacyConstructBlueprint;

export const validateV2Blueprint = (value: unknown): V2ConstructBlueprint =>
  validateBlueprintVersion(value, 2) as V2ConstructBlueprint;

export const validateV3Blueprint = (value: unknown): V3ConstructBlueprint =>
  validateBlueprintVersion(value, 3) as V3ConstructBlueprint;
