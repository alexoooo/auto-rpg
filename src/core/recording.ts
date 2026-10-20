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

/** A build fingerprint is content identity, never a mutable branch or commit label. */
export function recordingIdentity(build: string, protocol: string, configuration: unknown): RecordingIdentity {
  if (!/^sha256:[0-9a-f]{64}$/.test(build) || !protocol) throw new Error("a recording needs its content build identity and protocol");
  return Object.freeze({ build, protocol, configuration: recordingKey(configuration) });
}

/** Refuse incompatible persisted input before it changes a world or contributes a result. */
export function requireRecordingIdentity(value: unknown, expected: RecordingIdentity): void {
  if (typeof value !== "object" || value === null) throw new Error("this recording has no build and protocol identity; make a new recording");
  const identity = value as Partial<RecordingIdentity>;
  if (identity.protocol !== expected.protocol) throw new Error(`this recording uses another protocol; expected ${expected.protocol}`);
  if (identity.build !== expected.build) throw new Error("this recording was made on different source, assets or solver; rerun its recipe on this build");
  if (identity.configuration !== expected.configuration) throw new Error("this recording belongs to different physical conditions or a different recipe");
}
