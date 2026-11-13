import { buttonInput as button } from "./inputs.ts";
import { characterSkills, type BodyModel } from "../../../core/bodies/models.ts";
import type { SkillChoices } from "../../../core/bodies/spec/body.ts";
import type { Control } from "./controls.ts";

/** **A skill a character may choose** (`ExecutorPart.variations`): its name, what a page calls it, and its variations. */
export interface SkillOffer {
  readonly skill: string;
  readonly label: string;
  readonly variations: readonly string[];
}

interface SkillEditor extends Control {
  /** The skills chosen, each by its variation; undefined where they are the model's character's (`characterSkills`). */
  read(): SkillChoices | undefined;
  /** Show `model`'s character with `skills` in place of its own, or its own where undefined. */
  set(model: BodyModel, skills: SkillChoices | undefined): void;
}

/** What the variation picker calls a skill the character does not have. */
const NONE = "";

/**
 * **Which skills a character has, and which variation of each** (`BodySpec.skills`): a picker a
 * skill of `offers`, none or one of its variations, starting from the model's character's.
 * Reset gives back the character's own.
 */
export function skillEditor(model: BodyModel, skills: SkillChoices | undefined, offers: readonly SkillOffer[],
  options: { change?: (skills: SkillChoices | undefined) => void } = {}): SkillEditor {
  let shown = model, chosen = skills;
  const element = document.createElement("details"), summary = document.createElement("summary");
  element.className = "attribute-editor skill-editor"; summary.textContent = "Skills"; element.append(summary);
  const fields = document.createElement("div");
  fields.className = "attribute-fields";
  const pickers = new Map<string, HTMLSelectElement>();
  const current = (): SkillChoices => chosen ?? characterSkills(shown);
  const refresh = () => {
    const now = current();
    for (const [skill, picker] of pickers) picker.value = now[skill] ?? NONE;
    reset.disabled = chosen === undefined;
  };
  for (const offer of offers) {
    const row = document.createElement("div"), label = document.createElement("label"), text = document.createElement("span"), picker = document.createElement("select");
    row.className = "attribute-field"; text.textContent = offer.label;
    picker.setAttribute("aria-label", `${offer.label} variation`);
    picker.append(Object.assign(document.createElement("option"), { value: NONE, textContent: "None" }),
      ...offer.variations.map((variation) => Object.assign(document.createElement("option"), { value: variation, textContent: variation })));
    picker.addEventListener("change", () => {
      const next: Record<string, string> = { ...current() };
      if (picker.value === NONE) delete next[offer.skill]; else next[offer.skill] = picker.value;
      chosen = Object.freeze(next); refresh(); options.change?.(chosen);
    });
    label.append(text, picker); row.append(label); fields.append(row); pickers.set(offer.skill, picker);
  }
  const reset = button("Reset all", () => { chosen = undefined; refresh(); options.change?.(chosen); });
  element.append(fields, reset);
  refresh();
  return {
    element,
    refresh,
    read: () => chosen,
    set(model, skills) { shown = model; chosen = skills; refresh(); },
  };
}
