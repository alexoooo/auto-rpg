/**
 * **A mind's tree with some of its settings changed**: `base` with `change` laid over it, part by
 * part. A part `change` names keeps what of `base`'s it does not set, unless `change` names
 * another kind, which replaces it; a list, a null and a plain value replace what they fall on.
 */
export function withParts(base, change) {
  const plain = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
  if (!plain(base) || !plain(change) || ('kind' in change && change.kind !== base.kind)) return change;
  const out = { ...base };
  for (const [key, value] of Object.entries(change)) out[key] = key in base ? withParts(base[key], value) : value;
  return out;
}
