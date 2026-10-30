import { BEHAVIOURS, CLASSIC } from "../../src/entrants/classic/presets.ts";
import { FIGHTING, PATH_STRIKES } from "../../src/core/mind/config.ts";
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
 * **A fighter of the path strikes** (`PATH_STRIKES`): Classic's parts with opening tactics, its
 * blows at the body and its low blow from the support fold.
 */
export const PATHS = deepFreeze({ ...CLASSIC, ...PATH_STRIKES,
  tactics: { ...FIGHTING, choose: { kind: 'estimate', rethink: .2, patience: 2 }, list: [
    { kind: 'follow-orders' }, { kind: 'clear-of-walls' }, { kind: 'ground' }, { kind: 'attack' },
    { kind: 'approach', spacing: 0, spacingStep: 0 }, { kind: 'cover', guard: 'predictive' }] } });

/**
 * **The opening fighters the opening tactics' and the path strike's checks play**, of the path
 * fighter's parts (`PATHS`): Combat throws straight blows at the head and has no low support;
 * Brawler aims the path blows at the body with no low support; Kicker is the path fighter kicking as well.
 */
export const COMBAT = deepFreeze({ ...PATHS, support: null,
  tactics: { ...FIGHTING, choose: { kind: 'estimate', rethink: .2, patience: 2 }, list: [{ kind: 'follow-orders' }, { kind: 'attack' }, { kind: 'approach' }, { kind: 'cover', guard: 'cover' }] },
  actions: PATHS.actions.filter(action => action.family === 'straight' || action.family === 'cross').map(action => ({ ...action, regions: [{ kind: 'mark', mark: 'high' }], aim: { kind: 'surface', tuning: {} } })) });
export const BRAWLER = deepFreeze({ ...COMBAT, actions: PATHS.actions.filter(action => action.family !== 'downward') });
export const KICKER = deepFreeze({ ...PATHS, executors: [...PATHS.executors, { name: 'kick', kind: 'front-kick' }],
  actions: [...PATHS.actions, { name: 'kick', executor: 'kick', effectors: ['foot.left', 'foot.right'], regions: [{ kind: 'mark', mark: 'legs' }], aim: { kind: 'leg-height', height: .4 } }] });

/** A fighter of behaviours shares focus and named actions with the standard recipe fighter. */
export const behaving = (list) => deepFreeze({ ...BEHAVIOURS, tactics: { ...FIGHTING, list: [{ kind: 'follow-orders' }, ...list, { kind: 'cover', guard: 'cover' }] } });
