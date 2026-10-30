import type { Ended, Readiness, Region } from "../core/skills/framework/action.ts";
import type { MenuEntry } from "../core/skills/framework/menu.ts";
import type { StrikeChoice } from "../core/command/commands.ts";
import { partLabel } from "./part-label.ts";

/** How long a choice stays ready before it counts as a new one to pause on, s: a readiness that flickers for a step or two is no choice. */
const HOLD = 0.2;

/** A choice's identity: its action, limb, foe and region. */
const choiceKey = (entry: MenuEntry): string => JSON.stringify([entry.action, entry.limb, entry.foe, entry.region]);

/** An action's name as a person reads it: `straight-punch`, Straight punch. */
const actionText = (action: string): string => { const words = action.replaceAll("-", " "); return words.charAt(0).toUpperCase() + words.slice(1); };
const regionText = (region: Region): string => region.kind === "mark" ? region.mark : partLabel(region.segment).toLowerCase();
const limbText = (limb: string): string => partLabel(limb).toLowerCase();

/** What `readiness` says, in a few words. */
function readinessText(readiness: Readiness): string {
  switch (readiness.kind) {
    case "ready": return "ready";
    case "position": return "out of position";
    case "waiting": return `waiting: ${readiness.reason}`;
    case "blocked": return `refused: ${readiness.reason}`;
    default: { const never: never = readiness; throw new Error(`unknown readiness ${JSON.stringify(never)}`); }
  }
}

/** How near a readiness is to starting: ready first, refused last. */
const NEARNESS: Readonly<Record<Readiness["kind"], number>> = { ready: 0, position: 1, waiting: 2, blocked: 3 };

/** What a person picking a choice orders: an attack on a foe, naming what the choice names of how. */
type PickedStrike = StrikeChoice & { readonly foe: string };

/** Whether an order can name `entry`: a strike at a foe's region, not an action on the body itself. */
const orderable = (entry: MenuEntry): entry is MenuEntry & { readonly foe: string; readonly region: Region } => entry.foe !== null && entry.region !== null;

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

/** One action at one target (a foe's region, or the body itself), with each limb it may use. */
interface Group {
  readonly action: string;
  readonly foe: string | null;
  readonly region: Region | null;
  readonly entries: MenuEntry[];
}

/** `menu` by action and target, in its order. */
function grouped(menu: readonly MenuEntry[]): Group[] {
  const groups = new Map<string, Group>();
  for (const entry of menu) {
    const key = JSON.stringify([entry.action, entry.foe, entry.region]);
    let group = groups.get(key);
    if (!group) groups.set(key, group = { action: entry.action, foe: entry.foe, region: entry.region, entries: [] });
    group.entries.push(entry);
  }
  return [...groups.values()];
}

/** The readiness of `group`'s limb nearest to starting. */
const nearest = (group: Group): Readiness => group.entries.reduce((best, entry) =>
  NEARNESS[entry.readiness.kind] < NEARNESS[best.kind] ? entry.readiness : best, group.entries[0]!.readiness);

/** `group`'s readiness in words: one where every limb's reads alike, else each limb's. */
function groupReadiness(group: Group): string {
  const texts = group.entries.map((entry) => readinessText(entry.readiness));
  return texts.every((text) => text === texts[0]) ? texts[0]! : group.entries.map((entry, i) => `${limbText(entry.limb)} ${texts[i]}`).join("; ");
}

/** `group`'s action and target in words, its foe named by `name`. */
const groupText = (group: Group, name: (foe: string) => string): string =>
  `${actionText(group.action)}${group.foe === null ? "" : ` at ${name(group.foe)} ${regionText(group.region!)}`}`;

/**
 * **A side's choices, listed** (`choicePanel`), read while the list is open, which a pause on a
 * choice opens (`refresh`'s `opens`): first each strike that could start or be walked to, an action
 * at a foe's region a line with its limbs, or why none can; then, folded, the rest (actions on the
 * body itself, and strikes refused). On a side a person leads (`picks`), each strike's limbs that
 * are not refused are buttons that order it with that limb, with one to leave the limb to the mind
 * where it has several, and one for each such foe to attack it as the mind chooses; each calls
 * `pick` with the attack and the entries it picks among.
 */
export function choicePanel(name: (foe: string) => string, pick: (strike: PickedStrike, among: readonly MenuEntry[]) => void) {
  const element = document.createElement("details"), summary = document.createElement("summary"), list = document.createElement("div");
  element.className = "hud-choices"; summary.textContent = "Choices"; element.append(summary, list);
  for (const type of ["pointerdown", "pointermove", "wheel"]) element.addEventListener(type, event => event.stopPropagation());
  summary.addEventListener("click", () => summary.blur());
  let previous = "", restOpen = false;
  const button = (text: string, act: () => void) => {
    const one = Object.assign(document.createElement("button"), { type: "button", textContent: text });
    one.addEventListener("click", () => { one.blur(); act(); });
    return one;
  };
  const line = (text: string) => Object.assign(document.createElement("p"), { textContent: text });
  return { element,
    reset(): void { previous = ""; restOpen = false; list.replaceChildren(); element.open = false; },
    refresh(menu: readonly MenuEntry[] | null, { picks, opens }: { readonly picks: boolean; readonly opens: boolean }): void {
      if (opens) element.open = true;
      if (!element.open) return;
      const signature = JSON.stringify([picks, menu?.map(entry => [choiceKey(entry), readinessText(entry.readiness)]) ?? null]);
      if (signature === previous) return;
      previous = signature;
      list.replaceChildren();
      if (!menu) { list.append(line("Its mind reports no choices")); return; }
      const groups = grouped(menu), open = groups.filter((group) => group.foe !== null && nearest(group).kind !== "blocked");
      const rest = groups.filter((group) => !open.includes(group));
      if (picks) for (const foe of new Set(open.map((group) => group.foe!)))
        list.append(button(`Attack ${name(foe)} (its own choice)`, () => pick({ foe }, [])));
      for (const group of open) {
        const row = document.createElement("div");
        row.className = "choice-row"; row.dataset.readiness = nearest(group).kind;
        row.append(line(`${groupText(group, name)} — ${groupReadiness(group)}`));
        const limbs = group.entries.filter((entry) => orderable(entry) && entry.readiness.kind !== "blocked");
        if (picks) {
          const buttons = document.createElement("div");
          buttons.className = "choice-limbs";
          for (const entry of limbs) if (orderable(entry))
            buttons.append(button(partLabel(entry.limb), () => pick({ foe: entry.foe, action: entry.action, limb: entry.limb, region: structuredClone(entry.region) }, [entry])));
          if (limbs.length > 1) buttons.append(button("Either", () => pick({ foe: group.foe!, action: group.action, region: structuredClone(group.region!) }, limbs)));
          row.append(buttons);
        }
        list.append(row);
      }
      if (!open.length) {
        // Where every strike is refused for one reason, that reason is why none can start.
        const refused = groups.flatMap((group) => group.foe === null ? [] : group.entries.map((entry) => entry.readiness.kind === "blocked" ? entry.readiness.reason : ""));
        const reasons = new Set(refused);
        list.append(line(`No strike can start now${reasons.size === 1 && refused[0] ? `: ${refused[0]}` : ""}`));
      }
      if (rest.length) {
        const folded = document.createElement("details"), title = document.createElement("summary");
        folded.className = "choice-rest"; folded.open = restOpen;
        title.textContent = `Not to pick now (${rest.length})`;
        title.addEventListener("click", () => title.blur());
        folded.addEventListener("toggle", () => { restOpen = folded.open; });
        folded.append(title, ...rest.map((group) => line(`${groupText(group, name)} · ${group.entries.map((entry) => limbText(entry.limb)).join(", ")} — ${groupReadiness(group)}`)));
        list.append(folded);
      }
    },
  };
}
