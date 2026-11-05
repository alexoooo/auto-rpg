import { CHARACTER_ATTRIBUTES, attributeError, type AttributeName, type AttributeOverrides } from "../core/bodies/character-attributes.ts";
import { balanceFrom } from "../combat/rulebook.ts";
import { hasteFrom } from "../core/bodies/human/attributes.ts";

/** The flat `balance=` and `haste=` parameters of an Arena or Lab link: one value for both sides, or `left,right`. */
export function legacyAttributes(query: URLSearchParams, side = 0): AttributeOverrides {
  const values: Partial<Record<AttributeName, number>> = {};
  for (const name of ["balance", "haste"] as const) {
    const text = query.get(name);
    if (text === null) continue;
    const parts = text.split(","), part = parts[Math.min(side, parts.length - 1)]!;
    values[name] = parts.length > 2 ? NaN : (name === "balance" ? balanceFrom(part) : hasteFrom(part)) ?? NaN;
  }
  return values;
}

/**
 * A scoped character's overrides from a setup link, each a number as written. Invalid supplied values remain visible errors (`attributeError`).
 */
export function readAttributes(query: URLSearchParams, scope: string, legacy: AttributeOverrides = {}): AttributeOverrides {
  const values: Record<string, unknown> = { ...legacy };
  for (const name of Object.keys(CHARACTER_ATTRIBUTES) as AttributeName[]) {
    const text = query.get(`${scope}.${name}`);
    if (text === null) continue;
    values[name] = text.trim() === "" ? NaN : Number(text);
  }
  return Object.freeze(values) as AttributeOverrides;
}

/** Write only explicit overrides; resetting a field removes it instead of pinning its current default. */
export function writeAttributes(query: URLSearchParams, scope: string, attributes: AttributeOverrides): void {
  for (const name of Object.keys(CHARACTER_ATTRIBUTES) as AttributeName[]) {
    const key = `${scope}.${name}`, value = attributes[name];
    if (value === undefined) query.delete(key);
    else {
      const error = attributeError(name, value);
      if (error) throw new Error(error);
      query.set(key, String(value));
    }
  }
}
