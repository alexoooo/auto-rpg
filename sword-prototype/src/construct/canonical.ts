import { artifactChecksum, canonicalJson } from "../learning/artifact.ts";
import { CONSTRUCT_BLUEPRINT_LIMITS, validateBlueprint, type ConstructBlueprint,
  validateLegacyBlueprint, validateV2Blueprint, validateV3Blueprint, type FrameSpec,
  type LegacyConstructBlueprint, type V2ConstructBlueprint, type V3ConstructBlueprint,
  type LegacyModuleSpec, type ModuleSpec,
  type PrimitiveShape, type ShellSpec } from "./blueprint.ts";

const lexical = (left: string, right: string): number => left < right ? -1 : left > right ? 1 : 0;
const frame = (value: FrameSpec) => ({ positionM: [...value.positionM], rotation: [...value.rotation] });
const shell = (value: ShellSpec) => ({ style: value.style, visualClearanceM: value.visualClearanceM });
const shape = (value: PrimitiveShape): unknown => value.kind === "box" ? { kind: value.kind, sizeM: [...value.sizeM] }
  : value.kind === "sphere" ? { kind: value.kind, radiusM: value.radiusM }
    : { kind: value.kind, lengthM: value.lengthM, radiusM: value.radiusM };

const moduleValue = (module: ModuleSpec | LegacyModuleSpec): unknown => {
  const result: Record<string, unknown> = { armour: module.armour, compatibilityTag: module.compatibilityTag,
    geometry: [...module.geometry].sort((a, b) => lexical(a.id, b.id)).map((piece) => ({
      frame: frame(piece.frame), id: piece.id, shape: shape(piece.shape), shell: shell(piece.shell),
    })), health: module.health, id: module.id, kind: module.kind, massKg: module.massKg, socket: module.socket };
  for (const key of ["capacityJ", "maxOutputW", "maxHeatJ", "coolingW", "reloadSeconds", "heatPerShotJ",
    "energyPerShotJ", "ammunition"] as const) if (module[key] !== undefined) result[key] = module[key];
  if (module.sensorChannels) result.sensorChannels = [...module.sensorChannels].sort(lexical);
  if (module.striker) result.striker = { damageScale: module.striker.damageScale,
    localEdgeDirection: [...module.striker.localEdgeDirection], localFlatDirection: [...module.striker.localFlatDirection],
    localTipM: [...module.striker.localTipM] };
  if (module.projectile) result.projectile = {
    ...(Object.prototype.hasOwnProperty.call(module.projectile, "penetrationEfficiency")
      ? { penetrationEfficiency: (module.projectile as ModuleSpec["projectile"])?.penetrationEfficiency }
      : { damageScale: (module.projectile as LegacyModuleSpec["projectile"])?.damageScale }),
    lengthM: module.projectile.lengthM, massKg: module.projectile.massKg,
    muzzleSpeedMps: module.projectile.muzzleSpeedMps, poolSize: module.projectile.poolSize,
    radiusM: module.projectile.radiusM };
  if ("mountedContactStriker" in module && module.mountedContactStriker) {
    result.mountedContactStriker = { kind: module.mountedContactStriker.kind,
      localContactPoint: [...module.mountedContactStriker.localContactPoint],
      shoveSpecificImpulseMps: module.mountedContactStriker.shoveSpecificImpulseMps };
  }
  return result;
};

const blueprintValue = (blueprint: ConstructBlueprint | LegacyConstructBlueprint | V2ConstructBlueprint | V3ConstructBlueprint): unknown => ({ id: blueprint.id,
  joints: [...blueprint.joints].sort((a, b) => lexical(a.id, b.id)).map((joint) => ({
    angularAxes: [...joint.angularAxes].sort((a, b) => lexical(a.id, b.id)).map((axis) => ({
      damping: axis.damping, id: axis.id, maxRad: axis.maxRad, maxSpeedRadS: axis.maxSpeedRadS,
      maxTorqueNm: axis.maxTorqueNm, minRad: axis.minRad })), armour: joint.armour,
    childFrame: frame(joint.childFrame), childPart: joint.childPart, health: joint.health, id: joint.id,
    parentFrame: frame(joint.parentFrame), parentPart: joint.parentPart })),
  modules: [...blueprint.modules].sort((a, b) => lexical(a.id, b.id)).map(moduleValue),
  parts: [...blueprint.parts].sort((a, b) => lexical(a.id, b.id)).map((part) => ({ armour: part.armour,
    centreOfMassM: [...part.centreOfMassM], fatal: part.fatal, friction: part.friction, health: part.health,
    id: part.id, massKg: part.massKg, restitution: part.restitution, shape: shape(part.shape),
    shell: shell(part.shell), vitalityWeight: part.vitalityWeight })), rootPart: blueprint.rootPart,
  sockets: [...blueprint.sockets].sort((a, b) => lexical(a.id, b.id)).map((socket) => ({
    accepts: [...socket.accepts].sort(lexical), frame: frame(socket.frame), id: socket.id, part: socket.part })),
  version: blueprint.version });

export const canonicalBlueprintJson = (value: unknown): string => canonicalJson(blueprintValue(validateBlueprint(value)));
export const blueprintDigest = (value: unknown): string => artifactChecksum(canonicalBlueprintJson(value));
export const canonicalLegacyBlueprintJson = (value: unknown): string =>
  canonicalJson(blueprintValue(validateLegacyBlueprint(value)));
export const legacyBlueprintDigest = (value: unknown): string => artifactChecksum(canonicalLegacyBlueprintJson(value));
export const canonicalV2BlueprintJson = (value: unknown): string =>
  canonicalJson(blueprintValue(validateV2Blueprint(value)));
export const v2BlueprintDigest = (value: unknown): string => artifactChecksum(canonicalV2BlueprintJson(value));
export const canonicalV3BlueprintJson = (value: unknown): string =>
  canonicalJson(blueprintValue(validateV3Blueprint(value)));
export const v3BlueprintDigest = (value: unknown): string => artifactChecksum(canonicalV3BlueprintJson(value));

const refuseExcessiveSourceDepth = (text: string): void => {
  let depth = 0; let quoted = false; let escaped = false;
  for (const character of text) {
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') { quoted = true; continue; }
    if (character === "{" || character === "[") {
      depth += 1;
      if (depth > CONSTRUCT_BLUEPRINT_LIMITS.maxDepth) {
        throw new Error(`construct blueprint source exceeds maximum nesting depth ${CONSTRUCT_BLUEPRINT_LIMITS.maxDepth}`);
      }
    } else if (character === "}" || character === "]") depth -= 1;
  }
};

export function parseBlueprint(text: string): ConstructBlueprint {
  if (typeof text !== "string") throw new Error("construct blueprint source must be JSON text");
  const bytes = new TextEncoder().encode(text).length;
  if (bytes > CONSTRUCT_BLUEPRINT_LIMITS.maxBytes) throw new Error(`construct blueprint source exceeds maximum ${CONSTRUCT_BLUEPRINT_LIMITS.maxBytes} bytes`);
  refuseExcessiveSourceDepth(text);
  let decoded: unknown;
  try { decoded = JSON.parse(text); }
  catch (error) { throw new Error(`construct blueprint JSON is invalid: ${error instanceof Error ? error.message : String(error)}`); }
  const checked = validateBlueprint(decoded);
  if (new TextEncoder().encode(canonicalBlueprintJson(checked)).length > CONSTRUCT_BLUEPRINT_LIMITS.maxBytes) {
    throw new Error(`construct blueprint canonical form exceeds maximum ${CONSTRUCT_BLUEPRINT_LIMITS.maxBytes} bytes`);
  }
  return checked;
}
