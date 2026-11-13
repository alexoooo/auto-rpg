import { ATTRIBUTE_NAMES, type AttributeOverrides } from "../core/bodies/character-attributes.ts";

/**
 * A scoped character's overrides from a setup link, each a number as written. Invalid supplied values remain visible errors (`attributeError`).
 */
export function readAttributes(query: URLSearchParams, scope: string): AttributeOverrides {
  const values: Record<string, unknown> = {};
  for (const name of ATTRIBUTE_NAMES) {
    const text = query.get(`${scope}.${name}`);
    if (text === null) continue;
    values[name] = text.trim() === "" ? NaN : Number(text);
  }
  return Object.freeze(values) as AttributeOverrides;
}

/** Preserve explicit drafts, including invalid values the editor reports; resetting removes an override. */
export function writeAttributes(query: URLSearchParams, scope: string, attributes: AttributeOverrides): void {
  for (const name of ATTRIBUTE_NAMES) {
    const key = `${scope}.${name}`, value = attributes[name];
    if (value === undefined) query.delete(key);
    else {
      query.set(key, String(value));
    }
  }
}
