import type { Ended, Region } from "../core/skills/framework/action.ts";
import type { MenuEntry } from "../core/skills/framework/menu.ts";

/** How long a choice stays ready before it counts as a new one to pause on, s: a readiness that flickers for a step or two is no choice. */
const HOLD = 0.2;

/** A choice's identity: its skill, limb, foe and region. */
export const choiceKey = (entry: MenuEntry): string => JSON.stringify([entry.skill, entry.limb, entry.foe, entry.region]);

/** Whether an order can name `entry`: a strike at a foe's region, not a skill on the body itself. */
export const orderable = (entry: MenuEntry): entry is MenuEntry & { readonly foe: string; readonly region: Region } => entry.foe !== null && entry.region !== null;

/**
 * **What a body could choose, watched**: `changed` says whether it has a new choice since it last
 * looked: an entry of its menu an order can name ready for `HOLD` s that was not (but those last
 * picked, which the body is already carrying out), an action of its ended (refused ones aside), a
 * foe newly sensed, or the body gone down or got up. Its first look sees nothing new.
 */
export function choiceWatch() {
  const state = { since: new Map<string, number>(), offered: new Set<string>(), picked: new Set<string>(),
    ended: null as number | null, foes: new Set<string>(), down: null as boolean | null };
  return {
    reset(): void {
      state.since.clear(); state.offered.clear(); state.picked.clear(); state.ended = null; state.foes.clear(); state.down = null;
    },
    /** The person picked among `entries`: their readiness asks for no choice. */
    picked(entries: readonly MenuEntry[]): void { state.picked = new Set(entries.map(choiceKey)); },
    changed(menu: readonly MenuEntry[], ended: readonly Ended[], down: boolean, time: number): boolean {
      const first = state.down === null;
      let changed = false;
      const ready = new Set<string>();
      for (const entry of menu) if (entry.readiness.kind === "ready" && orderable(entry)) ready.add(choiceKey(entry));
      for (const key of [...state.since.keys()]) if (!ready.has(key)) { state.since.delete(key); state.offered.delete(key); }
      for (const key of ready) {
        const since = state.since.get(key) ?? time;
        state.since.set(key, since);
        if (time - since >= HOLD && !state.offered.has(key)) { state.offered.add(key); changed ||= !state.picked.has(key); }
      }
      const last = ended.reduce((most, record) => record.ending.kind === "refused" ? most : Math.max(most, record.sequence), state.ended ?? 0);
      if (!first && last > (state.ended ?? 0)) changed = true;
      state.ended = last;
      for (const entry of menu) if (entry.foe !== null && !state.foes.has(entry.foe)) { state.foes.add(entry.foe); changed ||= !first; }
      if (!first && down !== state.down) changed = true;
      state.down = down;
      return changed;
    },
  };
}
