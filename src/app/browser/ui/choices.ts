import { choiceKey, orderable } from "../../../game/arena/choice-watch.ts";
import { buttonInput as button } from "./inputs.ts";
import type { Readiness, Region } from "../../../skills/framework/action.ts";
import type { MenuEntry } from "../../../skills/framework/menu.ts";
import type { StrikeChoice } from "../../../minds/command/commands.ts";
import { partLabel } from "../../../game/part-label.ts";

/** A skill's name as a person reads it: `straight-punch`, Straight punch. */
const skillText = (skill: string): string => { const words = skill.replaceAll("-", " "); return words.charAt(0).toUpperCase() + words.slice(1); };
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

/** One skill at one target (a foe's region, or the body itself), with each limb it may use. */
interface Group {
  readonly skill: string;
  readonly foe: string | null;
  readonly region: Region | null;
  readonly entries: MenuEntry[];
}

/** `menu` by skill and target, in its order. */
function grouped(menu: readonly MenuEntry[]): Group[] {
  const groups = new Map<string, Group>();
  for (const entry of menu) {
    const key = JSON.stringify([entry.skill, entry.foe, entry.region]);
    let group = groups.get(key);
    if (!group) groups.set(key, group = { skill: entry.skill, foe: entry.foe, region: entry.region, entries: [] });
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

/** `group`'s skill and target in words, its foe named by `name`. */
const groupText = (group: Group, name: (foe: string) => string): string =>
  `${skillText(group.skill)}${group.foe === null ? "" : ` at ${name(group.foe)} ${regionText(group.region!)}`}`;

/**
 * **A side's choices, listed** (`choicePanel`), read while the list is open, which a pause on a
 * choice opens (`refresh`'s `opens`): first each strike that could start or be walked to, a skill
 * at a foe's region a line with its limbs, or why none can; then, folded, the rest (skills on the
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
  const line = (text: string) => Object.assign(document.createElement("p"), { textContent: text });
  return { element,
    reset(): void { previous = ""; restOpen = false; list.replaceChildren(); element.open = false; },
    /** Show `choices`' menu while the list is open; a closed list asks none. */
    refresh(choices: () => readonly MenuEntry[] | null, { picks, opens }: { readonly picks: boolean; readonly opens: boolean }): void {
      if (opens) element.open = true;
      if (!element.open) return;
      const menu = choices();
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
            buttons.append(button(partLabel(entry.limb), () => pick({ foe: entry.foe, skill: entry.skill, limb: entry.limb, region: structuredClone(entry.region) }, [entry])));
          if (limbs.length > 1) buttons.append(button("Either", () => pick({ foe: group.foe!, skill: group.skill, region: structuredClone(group.region!) }, limbs)));
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
