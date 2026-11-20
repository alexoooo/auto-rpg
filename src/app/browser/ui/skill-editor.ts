import { buttonInput as button } from "./inputs.ts";
import { svgIcon } from "../dom.ts";
import { allParts } from "../../catalog.ts";
import { characterNamed } from "../../../core/bodies/models.ts";
import type { SkillChoices } from "../../../core/bodies/spec/body.ts";
import type { Control } from "./controls.ts";
import type { SkillOffer } from "../../../minds/catalog/catalog.ts";

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
  const groups = new Map<string, HTMLDetailsElement>();
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
    const expanded = new Set([...groups].filter(([, group]) => group.open).map(([name]) => name));
    const parts = allParts();
    boxes.clear(); fields.replaceChildren();
    groups.clear();
    for (const offer of available) {
      let group = groups.get(offer.group);
      if (!group) {
        group = document.createElement("details");
        group.className = "skill-group"; group.open = expanded.has(offer.group);
        const heading = document.createElement("summary"); heading.textContent = offer.group;
        group.append(heading); groups.set(offer.group, group); fields.append(group);
      }
      const multiple = offer.variations.length > 1;
      const row = document.createElement(multiple ? "div" : "label"), title = document.createElement("span");
      row.className = "skill-field"; title.className = "skill-name"; title.textContent = offer.label;
      const icon = parts[offer.skill]?.icon;
      if (icon) row.append(svgIcon(icon));
      row.append(title);
      const variations = multiple ? document.createElement("div") : null;
      if (variations) {
        row.setAttribute("role", "group"); row.setAttribute("aria-label", offer.label);
        variations.className = "skill-variations"; row.append(variations);
      }
      for (const variation of offer.variations) {
        const name = `${offer.skill}/${variation}`, box = document.createElement("input");
        box.type = "checkbox";
        box.addEventListener("change", () => {
          const next = current().filter((one) => one !== name);
          chosen = Object.freeze(box.checked ? [...next, name] : next); refresh(); options.change?.(chosen);
        });
        if (variations) {
          const label = document.createElement("label");
          label.append(box, variation); variations.append(label);
        } else row.append(box);
        boxes.set(name, box);
      }
      group.append(row);
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
