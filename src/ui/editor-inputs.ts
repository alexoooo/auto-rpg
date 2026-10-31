import { buttonInput, selectInput } from "./inputs.ts";
import type { PartField } from "../core/parts/fields.ts";

/** A labelled editor input; editors share its layout and keyboard behaviour. */
export function editorRow(label: string, input: HTMLElement): HTMLElement {
  const row = document.createElement("label"), name = document.createElement("span");
  row.className = "field"; name.textContent = label; row.append(name, input); return row;
}

/** A picker with presentation labels and per-option refusal, blurred after a choice. */
export function editorPicker(options: readonly { readonly value: string; readonly text: string; readonly disabled?: boolean }[], value: string,
  change: (value: string) => void, readOnly: boolean): HTMLSelectElement {
  return selectInput(options, value, change, { disabled: readOnly });
}

/** A button that gives keyboard control back to the page. */
export function editorButton(text: string, title: string, run: () => void, readOnly: boolean): HTMLButtonElement {
  return buttonInput(text, run, { title, ariaLabel: title, disabled: readOnly });
}

/** A text or numeric input used by list editors without a declared part field. */
export function editorInput(value: string, changed: (value: string) => void, options: { readonly disabled: boolean; readonly numeric: boolean }): HTMLInputElement {
  const input = Object.assign(document.createElement("input"), { type: options.numeric ? "number" : "text", value, disabled: options.disabled });
  if (options.numeric) input.step = "any";
  input.addEventListener("change", () => { input.blur(); changed(input.value); }); return input;
}

/** Every part editor uses the field's labels, limits, units and write validation. */
export function partFieldInput<C>(field: PartField<C>, config: C, write: (config: C) => void, readOnly: boolean): HTMLElement {
  const changed = (value: string) => write(field.write(config, value) ?? config);
  switch (field.kind) {
    case "choice": return editorPicker(field.options.map(([value, text]) => ({ value, text })), field.read(config), changed, readOnly);
    case "text": return editorInput(field.read(config), changed, { disabled: readOnly, numeric: false });
    case "number": {
      const input = editorInput(field.read(config), changed, { disabled: readOnly, numeric: true });
      input.min = String(field.least); input.max = String(field.most); input.step = String(field.step);
      input.setAttribute("aria-label", `${field.label}, ${field.unit}`); return input;
    }
    default: { const never: never = field; throw new Error(`no field of kind ${JSON.stringify(never)}`); }
  }
}
