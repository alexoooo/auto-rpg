import { valueEditor } from "./value-editors.ts";
import { selectInput } from "./inputs.ts";
import type { PartField } from "../../../parts/fields.ts";
import type { PartLookup } from "../../../parts/lookup.ts";

/** A labelled editor input; editors share its layout and keyboard behaviour. */
export function editorRow(label: string, input: HTMLElement): HTMLElement {
  const row = document.createElement("label"), name = document.createElement("span");
  row.className = "field"; name.textContent = label; row.append(name, input); return row;
}

/** A text or numeric input used by list editors without a declared part field. */
export function editorInput(value: string, changed: (value: string) => void, options: { readonly disabled: boolean; readonly numeric: boolean }): HTMLInputElement {
  const input = Object.assign(document.createElement("input"), { type: options.numeric ? "number" : "text", value, disabled: options.disabled });
  if (options.numeric) input.step = "any";
  input.addEventListener("change", () => { input.blur(); changed(input.value); }); return input;
}

/** Every part editor uses the field's labels, limits, units and write validation, its choices among `parts`. */
export function partFieldInput<C>(field: PartField<C>, { config, parts, write, readOnly }: { readonly config: C; readonly parts: PartLookup; write(config: C): void; readonly readOnly: boolean }): HTMLElement {
  const changed = (value: string) => write(field.write(config, value, parts) ?? config);
  switch (field.kind) {
    case "json": return valueEditor(field.editor, { text: field.read(config), changed, readOnly });
    case "choice": return selectInput(field.options(parts).map(([value, text]) => ({ value, text })), field.read(config), changed, { disabled: readOnly });
    case "text": return editorInput(field.read(config), changed, { disabled: readOnly, numeric: false });
    case "number": {
      const input = editorInput(field.read(config), changed, { disabled: readOnly, numeric: true });
      input.min = String(field.least); input.max = String(field.most); input.step = String(field.step);
      input.setAttribute("aria-label", `${field.label}, ${field.unit}`); return input;
    }
    default: { const never: never = field; throw new Error(`no field of kind ${JSON.stringify(never)}`); }
  }
}
