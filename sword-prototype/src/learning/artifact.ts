export const RESEARCH_ARTIFACT_SCHEMA = 1;
export const RESEARCH_ALGORITHMS = Object.freeze(["neat-qd", "dagger", "ppo", "lookahead"] as const);
export type ResearchAlgorithm = typeof RESEARCH_ALGORITHMS[number];

export type ArtifactValue = null | boolean | number | string | readonly ArtifactValue[] |
  { readonly [key: string]: ArtifactValue };

/**
 * The header every research artifact carries, and it names *both* vocabularies.
 *
 * `featureVersion` and `featureNames` say what the network reads;
 * `tacticVersion` and the five name tables say what it writes -- `movementNames`,
 * `actionNames`, `effectorNames`, `targetNames`, `stanceNames`, one per block of
 * the 26-wide output contract. **This sentence said "four", which was neither
 * the tables carried nor the tables added** (stage C2a added three of them);
 * `deployment.ts` and `tournament-executor.test.mjs` both count five and are
 * right. The output half
 * used to be `movementNames` and `actionNames` alone, which was the whole of the
 * thirteen-wide contract -- so an artifact trained against it and deployed
 * against the twenty-six-wide one matched on every field it had and decoded to a
 * different controller. `fromBytes` spreads whatever it decoded and has **no
 * unknown-key rejection**, so an artifact from before this header grew does not
 * fail on a surplus key or a missing one; it arrives with `tacticVersion`
 * `undefined`, which is why the refusal for it is written out beside the
 * `featureVersion` one rather than left to the name comparisons.
 */
export interface ResearchArtifactData {
  readonly schema?: number;
  readonly algorithm: ResearchAlgorithm | string;
  readonly featureVersion: number;
  readonly featureNames: readonly string[];
  readonly tacticVersion: number;
  readonly movementNames: readonly string[];
  readonly actionNames: readonly string[];
  readonly effectorNames: readonly string[];
  readonly targetNames: readonly string[];
  readonly stanceNames: readonly string[];
  readonly payload: readonly number[];
  readonly provenance: Readonly<Record<string, ArtifactValue>>;
}

export interface ResearchArtifactContract {
  readonly featureVersion: number;
  readonly featureNames: readonly string[];
  readonly tacticVersion: number;
  readonly movementNames: readonly string[];
  readonly actionNames: readonly string[];
  readonly effectorNames: readonly string[];
  readonly targetNames: readonly string[];
  readonly stanceNames: readonly string[];
}

interface WireArtifact extends ResearchArtifactData { readonly schema: number; readonly checksum: string }

/**
 * `Array.isArray` first, because a field can now be genuinely absent.
 *
 * Before the header grew, every artifact in existence carried all three name
 * tables it then had -- `featureNames`, `movementNames`, `actionNames` -- and the
 * only way to reach this function was with two arrays. (This said "four", which
 * was the count of neither the old header nor the new one.) An
 * artifact written against the older header has no `effectorNames` at all, and
 * `undefined.length` is a `TypeError` whose message names neither the artifact
 * nor the field -- a refusal that reads as a crash in the decoder rather than as
 * a stale artifact. The `tacticVersion` gate above catches that case first; this
 * is what keeps the answer a sentence if it ever does not.
 */
const sameNames = (actual: readonly string[] | undefined, expected: readonly string[], label: string): void => {
  if (!Array.isArray(actual) || actual.length !== expected.length || actual.some((name, index) => name !== expected[index])) {
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

/** One page-safe spelling for every deterministic configuration fingerprint. */
export const canonicalDigest = (value: unknown): string => artifactChecksum(canonicalJson(value));

const validate = (data: ResearchArtifactData, contract: ResearchArtifactContract): void => {
  if ((data.schema ?? RESEARCH_ARTIFACT_SCHEMA) !== RESEARCH_ARTIFACT_SCHEMA) {
    throw new Error(`research artifact schema ${data.schema} is unsupported`);
  }
  if (!(RESEARCH_ALGORITHMS as readonly string[]).includes(data.algorithm)) {
    throw new Error(`research artifact algorithm "${data.algorithm}" is unknown`);
  }
  // `!==` and `JSON.stringify`, and both halves of that were measured rather
  // than assumed. Relaxing either comparison to `!=` accepts a header carrying
  // `"featureVersion": "4"` or `"tacticVersion": "2"` as a **string** -- an
  // artifact whose version is not a number is exactly the artifact this gate is
  // for, since a hand-edited or foreign writer is the only thing that produces
  // one, and `==` is the operator that cannot tell them apart. And the message
  // spelled the value bare, so that same string produced `research artifact
  // tactic version 2 does not match runtime 2`: a sentence that reads as a
  // contradiction, which is the precise failure the note below exists to
  // prevent. `JSON.stringify` quotes a string and leaves a number alone, so the
  // refusal names the real problem and `undefined` still reads as `undefined`.
  // `a_version_header_of_the_right_value_and_the_wrong_type_is_refused_by_type`
  // pins both, for both fields.
  if (data.featureVersion !== contract.featureVersion) {
    throw new Error(`research artifact feature version ${JSON.stringify(data.featureVersion)} does not match runtime ${contract.featureVersion}`);
  }
  // The output half of the header, refused in the same shape and for the same
  // reason as the input half above. Written as an explicit comparison rather
  // than left to the three name tables below because an artifact from before
  // this field existed carries `undefined` here, and "does not match runtime 2"
  // is the sentence whoever reads the log needs -- "effector names do not match"
  // would send them to edit a table that is not the problem.
  if (data.tacticVersion !== contract.tacticVersion) {
    throw new Error(`research artifact tactic version ${JSON.stringify(data.tacticVersion)} does not match runtime ${contract.tacticVersion}`);
  }
  sameNames(data.featureNames, contract.featureNames, "feature names");
  sameNames(data.movementNames, contract.movementNames, "movement names");
  sameNames(data.actionNames, contract.actionNames, "action names");
  sameNames(data.effectorNames, contract.effectorNames, "effector names");
  sameNames(data.targetNames, contract.targetNames, "target names");
  sameNames(data.stanceNames, contract.stanceNames, "stance names");
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
      actionNames: Object.freeze([...data.actionNames]), effectorNames: Object.freeze([...data.effectorNames]),
      targetNames: Object.freeze([...data.targetNames]), stanceNames: Object.freeze([...data.stanceNames]),
      payload: Object.freeze([...data.payload]),
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
