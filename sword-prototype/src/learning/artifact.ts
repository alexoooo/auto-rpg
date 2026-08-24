export const RESEARCH_ARTIFACT_SCHEMA = 1;
export const RESEARCH_ALGORITHMS = Object.freeze(["neat-qd", "dagger", "ppo", "lookahead"] as const);
export type ResearchAlgorithm = typeof RESEARCH_ALGORITHMS[number];

export type ArtifactValue = null | boolean | number | string | readonly ArtifactValue[] |
  { readonly [key: string]: ArtifactValue };

export interface ResearchArtifactData {
  readonly schema?: number;
  readonly algorithm: ResearchAlgorithm | string;
  readonly featureVersion: number;
  readonly featureNames: readonly string[];
  readonly movementNames: readonly string[];
  readonly actionNames: readonly string[];
  readonly payload: readonly number[];
  readonly provenance: Readonly<Record<string, ArtifactValue>>;
}

export interface ResearchArtifactContract {
  readonly featureVersion: number;
  readonly featureNames: readonly string[];
  readonly movementNames: readonly string[];
  readonly actionNames: readonly string[];
}

interface WireArtifact extends ResearchArtifactData { readonly schema: number; readonly checksum: string }

const sameNames = (actual: readonly string[], expected: readonly string[], label: string): void => {
  if (actual.length !== expected.length || actual.some((name, index) => name !== expected[index])) {
    throw new Error(`research artifact ${label} do not match runtime ${label}`);
  }
};

const validatePlain = (value: unknown, path: string, seen = new Set<object>()): void => {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`research artifact ${path} is non-finite`);
    return;
  }
  if (typeof value !== "object") throw new Error(`research artifact ${path} is not plain data`);
  if (seen.has(value)) throw new Error(`research artifact ${path} is cyclic`);
  seen.add(value);
  if (Array.isArray(value)) value.forEach((entry, index) => validatePlain(entry, `${path}[${index}]`, seen));
  else {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) throw new Error(`research artifact ${path} is not plain data`);
    for (const [key, entry] of Object.entries(value)) validatePlain(entry, `${path}.${key}`, seen);
  }
  seen.delete(value);
};

const freezePlain = (value: ArtifactValue): ArtifactValue => {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return Object.freeze(value.map((entry) => freezePlain(entry)));
  return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, freezePlain(entry)])));
};

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("canonical JSON cannot encode a non-finite number");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value !== "object") throw new Error(`canonical JSON cannot encode ${typeof value}`);
  return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(",")}}`;
}

/** FNV-1a is an integrity checksum, not an authenticity claim. Public assets carry SHA-256 separately. */
export function artifactChecksum(text: string): string {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(text)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

const validate = (data: ResearchArtifactData, contract: ResearchArtifactContract): void => {
  if ((data.schema ?? RESEARCH_ARTIFACT_SCHEMA) !== RESEARCH_ARTIFACT_SCHEMA) {
    throw new Error(`research artifact schema ${data.schema} is unsupported`);
  }
  if (!(RESEARCH_ALGORITHMS as readonly string[]).includes(data.algorithm)) {
    throw new Error(`research artifact algorithm "${data.algorithm}" is unknown`);
  }
  if (data.featureVersion !== contract.featureVersion) {
    throw new Error(`research artifact feature version ${data.featureVersion} does not match runtime ${contract.featureVersion}`);
  }
  sameNames(data.featureNames, contract.featureNames, "feature names");
  sameNames(data.movementNames, contract.movementNames, "movement names");
  sameNames(data.actionNames, contract.actionNames, "action names");
  if (!Array.isArray(data.payload) || data.payload.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) {
    throw new Error("research artifact payload must contain bytes");
  }
  validatePlain(data.provenance, "provenance");
  const provenance = data.provenance as Readonly<Record<string, ArtifactValue>>;
  if (!Number.isSafeInteger(provenance.seed) || !Number.isSafeInteger(provenance.solverSteps) || (provenance.solverSteps as number) <= 0 ||
      provenance.trainingSplit !== "train" || provenance.validationSplit !== "validation" ||
      typeof provenance.configDigest !== "string" || provenance.configDigest.length === 0) {
    throw new Error("research artifact provenance must name seed, solverSteps, train/validation splits and configDigest");
  }
};

export class ResearchArtifact {
  readonly data: Readonly<ResearchArtifactData>;
  constructor(data: ResearchArtifactData, contract: ResearchArtifactContract) {
    validate(data, contract);
    this.data = Object.freeze({ ...data, schema: RESEARCH_ARTIFACT_SCHEMA,
      featureNames: Object.freeze([...data.featureNames]), movementNames: Object.freeze([...data.movementNames]),
      actionNames: Object.freeze([...data.actionNames]), payload: Object.freeze([...data.payload]),
      provenance: freezePlain({ ...data.provenance }) as Readonly<Record<string, ArtifactValue>> });
  }
  toBytes(): Uint8Array {
    const body = canonicalJson(this.data);
    const wire: WireArtifact = { ...this.data, schema: RESEARCH_ARTIFACT_SCHEMA, checksum: artifactChecksum(body) } as WireArtifact;
    return new TextEncoder().encode(canonicalJson(wire));
  }
  static fromBytes(bytes: Uint8Array, contract: ResearchArtifactContract): ResearchArtifact {
    let decoded: unknown;
    try { decoded = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
    catch (error) { throw new Error("research artifact is not valid UTF-8 JSON", { cause: error }); }
    if (!decoded || Array.isArray(decoded) || typeof decoded !== "object") throw new Error("research artifact root must be an object");
    const { checksum, ...body } = decoded as unknown as WireArtifact;
    if (typeof checksum !== "string" || artifactChecksum(canonicalJson(body)) !== checksum) {
      throw new Error("research artifact checksum does not match its payload");
    }
    return new ResearchArtifact(body, contract);
  }
}
