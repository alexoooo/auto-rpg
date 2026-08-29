export type IntegrityValue = null | boolean | number | string | readonly IntegrityValue[] |
  { readonly [key: string]: IntegrityValue };

export function canonicalIntegrityJson(value: IntegrityValue): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("canonical construct JSON cannot encode a non-finite number");
    return Object.is(value, -0) ? "0" : String(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalIntegrityJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) =>
    `${JSON.stringify(key)}:${canonicalIntegrityJson((value as { readonly [key: string]: IntegrityValue })[key])}`).join(",")}}`;
}

export function integrityDigest(text: string): string {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(text)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}
