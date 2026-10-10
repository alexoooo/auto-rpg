import { BEHAVIOURS, OPENINGS, SCRAPPER } from '../../src/core/mind/config.ts';
import { deepFreeze } from '../../src/core/state.ts';

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

/**
 * **The opening fighters the opening tactics' and the path strike's checks play**, of the
 * Scrapper's parts: Combat throws straight blows at the head and has no low support; Brawler aims
 * the Scrapper's blows at the body with no low support; Kicker is the Scrapper kicking as well.
 */
export const COMBAT = deepFreeze({ ...SCRAPPER, tactics: OPENINGS, support: null });
export const BRAWLER = deepFreeze({ ...SCRAPPER, support: null });
export const KICKER = deepFreeze({ ...SCRAPPER, kick: { kind: 'front-kick' } });

/** A fighter of behaviours: orders followed first, then `list`, then the hands covering, as `BEHAVIOURS` is. */
export const behaving = (list) => deepFreeze({ ...BEHAVIOURS, tactics: { kind: 'behaviours', list: [{ kind: 'follow-orders' }, ...list, { kind: 'cover', guard: 'cover' }] } });
