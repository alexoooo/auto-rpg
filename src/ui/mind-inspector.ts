import { partOf } from "../core/mind/catalog.ts";
import type { MindConfig } from "../core/mind/config.ts";
import type { Holders } from "../core/skills/arbiter.ts";
import type { StrikeReport } from "../core/skills/strike.ts";
import type { BodySpec } from "../core/spec/body.ts";
import { mindEditor } from "./mind-editor.ts";

/** What an inspector reads of a body under a mind as it goes: who has the body and, for a fighter, which skill had each part of it and what its blow chose. */
interface Inspected {
  readonly body: { readonly has: string };
  readonly skills?: { readonly report: { readonly holders?: Holders; readonly strike?: Pick<StrikeReport, "choice"> } } | null;
}

/** The parts of a body a fighter's skills hold, as a person calls them. */
const HELD: readonly (readonly [keyof Holders, string])[] = [["legs", "Legs"], ["trunk", "Trunk"], ["left", "Left hand"], ["right", "Right hand"]];

/** The slot of a fighter's config that holds the skill `holder` names: the tactics move the legs by its walk. */
function slotOf(holder: Holders[keyof Holders]): "locomotion" | "guard" | "blow" | "kick" | "support" {
  switch (holder) {
    case "tactics": return "locomotion";
    case "guard": case "blow": case "kick": case "support": return holder;
    default: { const never: never = holder; throw new Error(`no holder ${JSON.stringify(never)}`); }
  }
}

/**
 * Who has the body, as a person reads it: nobody, or under a fighter its own mind (`"command"`,
 * the body's command layers, the fighter's one host) or a sub-mind; under a mind of another kind,
 * the name the body gives.
 */
const hasText = (has: string, fighter: boolean): string =>
  has === "nobody" ? "nobody" : !fighter ? has : has === "command" ? "its mind" : `its sub-mind ${has}`;

/**
 * **A mind's inspector**: the tree of `config`, read-only (`mindEditor`), with what `inspected`
 * reads of the body under it as it goes: who has the body (`PhysicalBody.has`) and which part
 * of the tree holds the legs, the trunk and each hand (`SkillReport.holders`), its slot marked
 * live. `inspected` answers null while there is no body to read.
 */
export function mindInspector(config: MindConfig, spec: BodySpec, inspected: () => Inspected | null): { readonly element: HTMLElement; refresh(): void } {
  const element = document.createElement("div"), live = document.createElement("dl");
  element.className = "mind-inspector"; live.className = "mind-live";
  const tree = mindEditor(config, { spec, readOnly: true });
  element.append(live, tree.element);
  const row = (term: string): HTMLElement => {
    const name = document.createElement("dt"), value = document.createElement("dd");
    name.textContent = term; live.append(name, value);
    return value;
  };
  const has = row("Has the body"), held = HELD.map(([key, label]) => [key, row(label)] as const);
  // A blow that chooses among others (`chooseSkill`): the option that has the body, and what each has landed of what it threw.
  const options = config.kind === "fighter" && config.blow.kind === "choose-blow" ? config.blow.options : null;
  const chose = options && row("Blow chosen");
  const slots = (key: string) => tree.element.querySelectorAll<HTMLElement>(`.mind-editor > div > .mind-part > .mind-slot[data-slot="${key}"]`);
  let shown = "";
  return {
    element,
    refresh() {
      const now = inspected(), holders = now?.skills?.report.holders, choice = now?.skills?.report.strike?.choice;
      const text = JSON.stringify([now?.body.has ?? null, holders ?? null, choice ?? null]);
      // The same reading draws nothing new.
      if (text === shown) return;
      shown = text;
      has.textContent = now ? hasText(now.body.has, config.kind === "fighter") : "no body";
      if (chose) chose.textContent = !choice || !options ? "-" : `${partOf(options[choice.option]!).label}; landed ${
        choice.counts.map(({ thrown, landed }, i) => `${partOf(options[i]!).label} ${landed} of ${thrown}`).join(", ")}`;
      const holding = new Set<string>();
      for (const [key, value] of held) {
        const holder = holders?.[key];
        if (!holder || config.kind !== "fighter") { value.textContent = "-"; continue; }
        const slot = slotOf(holder), part = config[slot];
        holding.add(slot);
        value.textContent = part ? partOf(part).label : slot;
      }
      if (now && config.kind === "fighter" && now.body.has !== "command" && now.body.has !== "nobody") holding.add("subs");
      for (const holder of tree.element.querySelectorAll<HTMLElement>(".mind-slot[data-slot]")) holder.classList.remove("live");
      for (const key of holding) for (const holder of slots(key)) holder.classList.add("live");
    },
  };
}
