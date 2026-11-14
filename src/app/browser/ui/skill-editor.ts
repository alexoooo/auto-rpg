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
 * of `offers`, as many of one skill as it likes, starting from the character's own. Reset gives
 * them back.
 */
export function skillEditor(character: string, skills: SkillChoices | undefined, offers: readonly SkillOffer[],
  options: { change?: (skills: SkillChoices | undefined) => void } = {}): SkillEditor {
  let shown = character, chosen = skills;
  const element = document.createElement("details"), summary = document.createElement("summary");
  element.className = "attribute-editor skill-editor"; summary.textContent = "Skills"; element.append(summary);
  const fields = document.createElement("div");
  fields.className = "attribute-fields";
  const boxes = new Map<string, HTMLInputElement>();
  const current = (): SkillChoices => chosen ?? characterNamed(shown).skills;
  const refresh = () => {
    const now = new Set(current());
    for (const [name, box] of boxes) box.checked = now.has(name);
    reset.disabled = chosen === undefined;
  };
  for (const offer of offers) {
    const row = document.createElement("div"), text = document.createElement("span");
    row.className = "attribute-field"; text.textContent = offer.label; row.append(text);
    for (const variation of offer.variations) {
      const name = `${offer.skill}/${variation}`, label = document.createElement("label"), box = document.createElement("input");
      box.type = "checkbox"; box.setAttribute("aria-label", `${offer.label}: ${variation}`);
      box.addEventListener("change", () => {
        const next = current().filter((one) => one !== name);
        chosen = Object.freeze(box.checked ? [...next, name] : next); refresh(); options.change?.(chosen);
      });
      label.append(box, ` ${variation}`); row.append(label); boxes.set(name, box);
    }
    fields.append(row);
  }
  const reset = button("Reset all", () => { chosen = undefined; refresh(); options.change?.(chosen); });
  element.append(fields, reset);
  refresh();
  return {
    element,
    refresh,
    read: () => chosen,
    set(character, skills) { shown = character; chosen = skills; refresh(); },
  };
}
