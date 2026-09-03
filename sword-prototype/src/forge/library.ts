import type { SavedConstruct } from "../construct/codec.ts";
import { parseSavedConstruct } from "../construct/codec.ts";
import { canonicalIntegrityJson, type IntegrityValue } from "../construct/integrity.ts";
import { canonicalSavedConstructJson } from "../construct/matchup.ts";
import type { SensorSpec } from "../construct/sensors.ts";

export const LEGACY_CONSTRUCT_LIBRARY_STORAGE_KEY = "sword-prototype.construct-library.v1";
export const CONSTRUCT_LIBRARY_STORAGE_KEY = "sword-prototype.construct-library.v5";
export const CONSTRUCT_LIBRARY_VERSION = 5 as const;
const MIGRATABLE_LIBRARY_STORAGE_KEYS = Object.freeze([
  "sword-prototype.construct-library.v4", "sword-prototype.construct-library.v3",
  "sword-prototype.construct-library.v2",
  LEGACY_CONSTRUCT_LIBRARY_STORAGE_KEY,
]);
export const CONSTRUCT_LIBRARY_MAX_ENTRIES = 32;
// The browser storage envelope has to fit comfortably inside the common 5 MiB origin quota.
// Individual files retain their independent 1 MiB ceiling in the SavedConstruct decoder.
export const CONSTRUCT_LIBRARY_MAX_BYTES = 4_000_000;
export const CONSTRUCT_LIBRARY_MAX_DEPTH = 66;

type Plain = Record<string, unknown>;

const utf8Bytes = (value: string): number => new TextEncoder().encode(value).byteLength;

const exactObject = (value: unknown, keys: readonly string[], context: string): Plain => {
  if (value === null || typeof value !== "object" || Array.isArray(value) ||
      (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
    throw new Error(`${context} must be an object`);
  }
  const source = value as Plain;
  const names = Object.keys(source);
  const unknown = names.find((name) => !keys.includes(name));
  if (unknown) throw new Error(`${context} has unknown field "${unknown}"`);
  const missing = keys.find((name) => !Object.prototype.hasOwnProperty.call(source, name));
  if (missing) throw new Error(`${context} is missing field "${missing}"`);
  return source;
};

/** Reject pathological nesting before JSON.parse can allocate a corresponding object graph. */
const enforceRawDepth = (text: string): void => {
  let depth = 0;
  let quoted = false;
  let escaped = false;
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
      if (depth > CONSTRUCT_LIBRARY_MAX_DEPTH) {
        throw new Error(`saved construct library exceeds maximum nesting depth ${CONSTRUCT_LIBRARY_MAX_DEPTH}`);
      }
    } else if (character === "}" || character === "]") {
      depth -= 1;
    }
  }
};

const canonicalEntry = (saved: SavedConstruct): IntegrityValue =>
  JSON.parse(canonicalSavedConstructJson(saved)) as IntegrityValue;

export function encodeConstructLibrary(
  entries: readonly SavedConstruct[],
  sensors: readonly SensorSpec[],
): string {
  if (entries.length > CONSTRUCT_LIBRARY_MAX_ENTRIES) {
    throw new Error(`saved construct library exceeds maximum ${CONSTRUCT_LIBRARY_MAX_ENTRIES} entries`);
  }
  const validated = entries.map((entry) => parseSavedConstruct(canonicalSavedConstructJson(entry), sensors));
  const names = new Set<string>();
  for (const entry of validated) {
    if (names.has(entry.name)) throw new Error(`saved construct library has duplicate name "${entry.name}"`);
    names.add(entry.name);
  }
  const text = canonicalIntegrityJson({
    entries: validated.map(canonicalEntry),
    version: CONSTRUCT_LIBRARY_VERSION,
  });
  if (utf8Bytes(text) > CONSTRUCT_LIBRARY_MAX_BYTES) {
    throw new Error(`saved construct library exceeds maximum ${CONSTRUCT_LIBRARY_MAX_BYTES} bytes`);
  }
  return text;
}

export function parseConstructLibrary(
  text: string,
  sensors: readonly SensorSpec[],
): readonly SavedConstruct[] {
  if (typeof text !== "string") throw new Error("saved construct library source must be JSON text");
  if (utf8Bytes(text) > CONSTRUCT_LIBRARY_MAX_BYTES) {
    throw new Error(`saved construct library source exceeds maximum ${CONSTRUCT_LIBRARY_MAX_BYTES} bytes`);
  }
  enforceRawDepth(text);
  let value: unknown;
  try { value = JSON.parse(text); }
  catch (error) {
    throw new Error(`saved construct library JSON is invalid: ${error instanceof Error ? error.message : String(error)}`);
  }
  const source = exactObject(value, ["version", "entries"], "saved construct library");
  if (![1, 2, 3, 4, CONSTRUCT_LIBRARY_VERSION].includes(source.version as number)) {
    throw new Error(`saved construct library version ${JSON.stringify(source.version)} is unsupported`);
  }
  if (!Array.isArray(source.entries)) throw new Error("saved construct library entries must be an array");
  if (source.entries.length > CONSTRUCT_LIBRARY_MAX_ENTRIES) {
    throw new Error(`saved construct library exceeds maximum ${CONSTRUCT_LIBRARY_MAX_ENTRIES} entries`);
  }
  const entries = source.entries.map((entry, index) => {
    try { return parseSavedConstruct(JSON.stringify(entry), sensors); }
    catch (error) {
      throw new Error(`saved construct library entry[${index}] is invalid: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
  const names = new Set<string>();
  for (const entry of entries) {
    if (names.has(entry.name)) throw new Error(`saved construct library has duplicate name "${entry.name}"`);
    names.add(entry.name);
  }
  // Re-encoding applies the final canonical byte ceiling before any caller can publish the replacement.
  encodeConstructLibrary(entries, sensors);
  return Object.freeze(entries);
}

export function replaceConstructLibraryEntry(
  entries: readonly SavedConstruct[],
  saved: SavedConstruct,
  sensors: readonly SensorSpec[],
): readonly SavedConstruct[] {
  const next = Object.freeze([...entries.filter((candidate) => candidate.name !== saved.name), saved]);
  encodeConstructLibrary(next, sensors);
  return next;
}

export interface ConstructLibraryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function loadConstructLibrary(
  storage: ConstructLibraryStorage,
  sensors: readonly SensorSpec[],
): readonly SavedConstruct[] {
  const source = storage.getItem(CONSTRUCT_LIBRARY_STORAGE_KEY);
  if (source !== null) return parseConstructLibrary(source, sensors);
  const legacy = MIGRATABLE_LIBRARY_STORAGE_KEYS.map((key) => storage.getItem(key)).find((row) => row !== null);
  if (legacy === undefined || legacy === null) return Object.freeze([]);
  // Parsing migrates the complete library in memory. Encoding also validates the final v5
  // envelope, so no partial replacement is observable if any entry refuses migration.
  const migrated = parseConstructLibrary(legacy, sensors);
  const encoded = encodeConstructLibrary(migrated, sensors);
  storage.setItem(CONSTRUCT_LIBRARY_STORAGE_KEY, encoded);
  return migrated;
}

/** Validation finishes before the envelope's one and only storage mutation. */
export function storeConstructLibrary(
  storage: ConstructLibraryStorage,
  entries: readonly SavedConstruct[],
  sensors: readonly SensorSpec[],
): void {
  const text = encodeConstructLibrary(entries, sensors);
  storage.setItem(CONSTRUCT_LIBRARY_STORAGE_KEY, text);
}
