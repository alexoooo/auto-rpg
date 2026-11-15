/** Persisted inputs identify their source build, serialization protocol and physical conditions. */
export interface RecordingIdentity {
  readonly build: string;
  readonly protocol: string;
  readonly configuration: string;
}

/** Configuration equality refuses values JSON would silently discard or turn into null. */
export function recordingKey(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${Array.from(value, recordingKey).join(",")}]`;
  if (typeof value === "object" && value !== null && Object.getPrototypeOf(value) === Object.prototype) {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${recordingKey((value as Record<string, unknown>)[key])}`).join(",")}}`;
  }
  throw new Error("recording configuration must be finite plain JSON");
}

/**
 * **What a build's identity is** (`BUILD_IDENTITY`, `scripts/build-identity.mjs`): the commit it was
 * built from, never a branch, followed where a build input was not committed by a mark no other
 * build shares.
 */
export const BUILD_IDENTITY_FORM = /^(git:[0-9a-f]{40,64}|unversioned)(\+uncommitted:[0-9a-f-]{36})?$/;

/** A recording's identity: its build's (`BUILD_IDENTITY_FORM`), its protocol and its configuration. */
export function recordingIdentity(build: string, protocol: string, configuration: unknown): RecordingIdentity {
  if (!BUILD_IDENTITY_FORM.test(build) || !protocol) throw new Error("a recording needs its build identity and protocol");
  return Object.freeze({ build, protocol, configuration: recordingKey(configuration) });
}

/**
 * Refuse persisted input of another protocol, other physical conditions or another recipe before
 * it changes a world or contributes a result. A recording made on another build is taken: this
 * build's code plays it, and the build it was made on is given back, for a reader to say.
 */
export function requireRecordingIdentity(value: unknown, expected: RecordingIdentity): string {
  const identity = typeof value === "object" && value !== null ? value as Partial<RecordingIdentity> : {};
  if (typeof identity.build !== "string" || !BUILD_IDENTITY_FORM.test(identity.build)) throw new Error("this recording has no build and protocol identity; make a new recording");
  if (identity.protocol !== expected.protocol) throw new Error(`this recording uses another protocol; expected ${expected.protocol}`);
  if (identity.configuration !== expected.configuration) throw new Error("this recording belongs to different physical conditions or a different recipe");
  return identity.build;
}
