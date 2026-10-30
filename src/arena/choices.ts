import type { Ended, Readiness, Region } from "../core/skills/action.ts";
import type { MenuEntry } from "../core/skills/menu.ts";
import type { StrikeChoice } from "../core/command/commands.ts";
import { partLabel } from "./fighter-readout.ts";

/** How long a choice stays ready before it counts as a new one to pause on, s: a readiness that flickers for a step or two is no choice. */
const HOLD = 0.2;

/** A choice's identity: its action, limb, foe and region. */
export const choiceKey = (entry: MenuEntry): string => JSON.stringify([entry.action, entry.limb, entry.foe, entry.region]);

const title = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const regionText = (region: Region): string => region.kind === "mark" ? region.mark : partLabel(region.segment).toLowerCase();

/** What `readiness` says, in a few words. */
export function readinessText(readiness: Readiness): string {
  switch (readiness.kind) {
    case "ready": return "ready";
    case "position": return "out of position";
    case "waiting": return `waiting: ${readiness.reason}`;
    case "blocked": return `refused: ${readiness.reason}`;
    default: { const never: never = readiness; throw new Error(`unknown readiness ${JSON.stringify(never)}`); }
  }
}

/** `entry` as a person reads it: its action and limb, and, where it aims at a foe, the foe (named by `name`) and the region. */
export const choiceText = (entry: MenuEntry, name: (foe: string) => string): string =>
  `${title(entry.action)} · ${partLabel(entry.limb)}${entry.foe === null ? "" : ` · ${name(entry.foe)} ${regionText(entry.region!)}`}`;

/** What a person picking `entry` orders: its action, limb and region at its foe. Null for an action on the body itself, which orders do not name. */
export const pickedStrike = (entry: MenuEntry): (StrikeChoice & { readonly foe: string }) | null =>
  entry.foe === null || entry.region === null ? null : { foe: entry.foe, action: entry.action, limb: entry.limb, region: structuredClone(entry.region) };

/**
 * **What a body could choose, watched**: `changed` says whether it has a new choice since it last
 * looked: an entry of its menu a person can order (`pickedStrike`) ready for `HOLD` s that was not
 * (but the one last picked, which the body is already carrying out), an action of its ended (refused ones aside), a foe newly sensed, or
 * the body gone down or got up. Its first look sees nothing new.
 */
export function choiceWatch() {
  const state = { since: new Map<string, number>(), offered: new Set<string>(), picked: null as string | null,
    ended: null as number | null, foes: new Set<string>(), down: null as boolean | null };
  return {
    reset(): void {
      state.since.clear(); state.offered.clear(); state.picked = null; state.ended = null; state.foes.clear(); state.down = null;
    },
    /** The person picked `entry`: its readiness asks for no choice. */
    picked(entry: MenuEntry): void { state.picked = choiceKey(entry); },
    changed(menu: readonly MenuEntry[], ended: readonly Ended[], down: boolean, time: number): boolean {
      const first = state.down === null;
      let changed = false;
      const ready = new Set<string>();
      for (const entry of menu) if (entry.readiness.kind === "ready" && pickedStrike(entry)) ready.add(choiceKey(entry));
      for (const key of [...state.since.keys()]) if (!ready.has(key)) { state.since.delete(key); state.offered.delete(key); }
      for (const key of ready) {
        const since = state.since.get(key) ?? time;
        state.since.set(key, since);
        if (time - since >= HOLD && !state.offered.has(key)) { state.offered.add(key); changed ||= key !== state.picked; }
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

/**
 * **A side's choices, listed** (`choicePanel`): each entry of its menu with its readiness, read while
 * the list is open, which a pause on a choice opens (`refresh`'s `opens`). On a side a person leads
 * (`picks`), each entry an order can name and that is not refused is a button that orders it
 * (`pick`), with one for each foe to fight it the mind's own way (`own`).
 */
export function choicePanel(name: (foe: string) => string, pick: (entry: MenuEntry) => void, own: (foe: string) => void) {
  const element = document.createElement("details"), summary = document.createElement("summary"), list = document.createElement("div");
  element.className = "hud-choices"; summary.textContent = "Choices"; element.append(summary, list);
  for (const type of ["pointerdown", "pointermove", "wheel"]) element.addEventListener(type, event => event.stopPropagation());
  summary.addEventListener("click", () => summary.blur());
  let previous = "";
  const button = (text: string, act: () => void) => {
    const one = Object.assign(document.createElement("button"), { type: "button", textContent: text });
    one.addEventListener("click", () => { one.blur(); act(); });
    return one;
  };
  return { element,
    reset(): void { previous = ""; list.replaceChildren(); element.open = false; },
    refresh(menu: readonly MenuEntry[] | null, { picks, opens }: { readonly picks: boolean; readonly opens: boolean }): void {
      if (opens) element.open = true;
      if (!element.open) return;
      const signature = JSON.stringify([picks, menu?.map(entry => [choiceKey(entry), readinessText(entry.readiness)]) ?? null]);
      if (signature === previous) return;
      previous = signature;
      list.replaceChildren();
      if (!menu) { list.append(Object.assign(document.createElement("p"), { textContent: "Its mind reports no choices" })); return; }
      if (picks) for (const foe of new Set(menu.flatMap(entry => entry.foe ?? []))) list.append(button(`Fight ${name(foe)} its own way`, () => own(foe)));
      for (const entry of menu) {
        const text = `${choiceText(entry, name)} — ${readinessText(entry.readiness)}`;
        const row = picks && pickedStrike(entry) && entry.readiness.kind !== "blocked" ? button(text, () => pick(entry))
          : Object.assign(document.createElement("p"), { textContent: text });
        row.dataset.readiness = entry.readiness.kind;
        list.append(row);
      }
    },
  };
}
