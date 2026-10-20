import { CHARACTER_ATTRIBUTES, type AttributeName, type AttributeOverrides } from "../core/character-attributes.ts";
import { characterDefaults, resolveCharacter, type CharacterConfig, type ResolvedCharacter } from "../core/models.ts";
import type { Control } from "./controls.ts";

interface AttributeEditor extends Control {
  /** Validate and return a detached draft, or report its error before a page starts a new world. */
  read(): AttributeOverrides;
  /** Show another model or setup; explicit overrides belong to the supplied configuration. */
  set(character: CharacterConfig): void;
}

/** The same compact draft attribute editor for every character. Reset restores inheritance. */
export function attributeEditor(character: CharacterConfig, options: {
  change?: (attributes: AttributeOverrides, resolved: ResolvedCharacter | null) => void;
  apply?: (attributes: AttributeOverrides) => void;
} = {}): AttributeEditor {
  let model = character.model, draft: AttributeOverrides = { ...character.attributes };
  const element = document.createElement("details"), summary = document.createElement("summary");
  element.className = "attribute-editor"; summary.textContent = "Attributes"; element.append(summary);
  const fields = document.createElement("div"), error = document.createElement("p");
  fields.className = "attribute-fields"; error.className = "attribute-error"; error.setAttribute("role", "alert");
  const rows = new Map<AttributeName, { input: HTMLInputElement; reset: HTMLButtonElement }>();
  const button = (label: string, run: () => void) => {
    const b = Object.assign(document.createElement("button"), { type: "button", textContent: label });
    b.addEventListener("click", () => { b.blur(); run(); }); return b;
  };
  let apply: HTMLButtonElement | undefined;
  const validate = (): ResolvedCharacter | null => {
    try {
      const resolved = resolveCharacter({ model, attributes: draft });
      error.textContent = ""; error.hidden = true;
      if (apply) apply.disabled = false;
      return resolved;
    } catch (fault) {
      error.textContent = fault instanceof Error ? fault.message : String(fault); error.hidden = false;
      if (apply) apply.disabled = true;
      return null;
    }
  };
  const refresh = () => {
    const defaults = characterDefaults(model);
    for (const [name, row] of rows) {
      const value = draft[name] ?? defaults[name];
      if (document.activeElement !== row.input) row.input.value = Number.isFinite(value) ? String(value) : "";
      row.reset.disabled = draft[name] === undefined;
    }
    validate();
  };
  const changed = () => {
    refresh(); options.change?.(Object.freeze({ ...draft }), validate());
  };
  const update = (name: AttributeName, value: number | undefined) => {
    const next = { ...draft };
    if (value === undefined) delete next[name]; else next[name] = value;
    draft = next; changed();
  };
  for (const name of Object.keys(CHARACTER_ATTRIBUTES) as AttributeName[]) {
    const info = CHARACTER_ATTRIBUTES[name], row = document.createElement("div"), label = document.createElement("label");
    row.className = "attribute-field";
    const text = document.createElement("span"); text.textContent = `${info.label}, ${info.unit}`;
    const input = Object.assign(document.createElement("input"), { type: "number", step: "any", title: info.help });
    input.setAttribute("aria-label", `${info.label}, ${info.unit}`);
    input.addEventListener("input", () => update(name, input.valueAsNumber));
    input.addEventListener("change", () => input.blur());
    const value = () => draft[name] ?? characterDefaults(model)[name];
    const reset = button("Reset", () => update(name, undefined));
    reset.setAttribute("aria-label", `Reset ${info.label}`);
    const increment = (sign: number) => update(name, Number((value() + sign * info.step).toPrecision(12)));
    label.append(text, input);
    row.append(label, button("−", () => increment(-1)), button("+", () => increment(1)), reset);
    rows.set(name, { input, reset }); fields.append(row);
  }
  element.append(fields, button("Reset all", () => { draft = {}; changed(); }), error);
  const read = (): AttributeOverrides => {
    if (!validate()) { element.open = true; throw new Error(error.textContent ?? "Invalid attributes"); }
    return Object.freeze({ ...draft });
  };
  if (options.apply) {
    apply = button("Apply and restart", () => { options.apply!(read()); }); element.append(apply);
  }
  // Controls over the canvas retain pointer release so the game's held buttons can clear.
  for (const event of ["pointerdown", "pointermove"]) element.addEventListener(event, e => e.stopPropagation());
  refresh();
  return { element, read, refresh,
    set(character) { model = character.model; draft = { ...character.attributes }; refresh(); },
  };
}
