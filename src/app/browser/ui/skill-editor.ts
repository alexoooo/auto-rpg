import { buttonInput as button } from "./inputs.ts";
import { characterNamed } from "../../../core/bodies/models.ts";
import type { SkillChoices } from "../../../core/bodies/spec/body.ts";
import type { Control } from "./controls.ts";

/** **A skill a character may hold** (`Part.variations`): its name, what a page calls it, and its variations. */
export interface SkillOffer {
  readonly skill: string;
  readonly label: string;
  readonly variations: readonly string[];
}

interface SkillEditor extends Control {
  /** The skills held, each `skill/variation`; undefined where they are the character's own (`Character.skills`). */
  read(): SkillChoices | undefined;
  /** Show the character `character` (`CHARACTERS`) with `skills` in place of its own, or its own where undefined. */
  set(character: string, skills: SkillChoices | undefined): void;
}

/**
 * **Which skills a character holds** (`BodySpec.skills`): a box for each variation of each skill
 * currently offered, as many of one skill as it likes, starting from the character's own.
 * Reset gives them back; a change of body or equipment refreshes the offers.
 */
export function skillEditor(character: string, skills: SkillChoices | undefined, offers: () => readonly SkillOffer[],
  options: { change?: (skills: SkillChoices | undefined) => void } = {}): SkillEditor {
  let shown = character, chosen = skills;
  const element = document.createElement("details"), summary = document.createElement("summary");
  element.className = "skill-editor"; summary.textContent = "Skills"; element.append(summary);
  const fields = document.createElement("div");
  fields.className = "skill-fields";
  const boxes = new Map<string, HTMLInputElement>();
  let drawn = "";
  const current = (): SkillChoices => chosen ?? characterNamed(shown).skills;
  const refresh = () => {
    const available = offers(), key = JSON.stringify(available);
    if (key !== drawn) { drawn = key; draw(available); }
    const now = new Set(current());
    for (const [name, box] of boxes) box.checked = now.has(name);
    reset.disabled = chosen === undefined;
  };
  const draw = (available: readonly SkillOffer[]) => {
    boxes.clear(); fields.replaceChildren();
    for (const offer of available) {
      const row = document.createElement("div"), text = document.createElement("span"), variations = document.createElement("div");
      row.className = "skill-field"; text.className = "skill-name"; text.textContent = offer.label; text.title = offer.label;
      row.setAttribute("role", "group"); row.setAttribute("aria-label", offer.label);
      variations.className = "skill-variations"; row.append(text, variations);
      for (const variation of offer.variations) {
        const name = `${offer.skill}/${variation}`, label = document.createElement("label"), box = document.createElement("input");
        box.type = "checkbox"; box.setAttribute("aria-label", `${offer.label}: ${variation}`);
        box.addEventListener("change", () => {
          const next = current().filter((one) => one !== name);
          chosen = Object.freeze(box.checked ? [...next, name] : next); refresh(); options.change?.(chosen);
        });
        const nameText = document.createElement("span"); nameText.textContent = variation;
        label.append(box, nameText); variations.append(label); boxes.set(name, box);
      }
      fields.append(row);
    }
  };
  const reset = button("Reset all", () => { chosen = undefined; refresh(); options.change?.(chosen); });
  reset.className = "skill-reset";
  element.append(fields, reset);
  refresh();
  return {
    element,
    refresh,
    read: () => chosen,
    set(character, skills) { shown = character; chosen = skills; refresh(); },
  };
}
