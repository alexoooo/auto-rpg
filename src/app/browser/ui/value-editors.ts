import { regionsEditor } from "./mind-regions.ts";
import { isRegion } from "../../../minds/orders.ts";

/** Structured editors are selected by declared field metadata, with plain JSON for other schemas. */
export function valueEditor(editor: string | undefined, { text, changed, readOnly }: {
  readonly text: string; changed(text: string): void; readonly readOnly: boolean;
}): HTMLElement {
  if (editor === "target-regions") {
    const value: unknown = JSON.parse(text);
    return regionsEditor(Array.isArray(value) && value.every(isRegion) ? value : [], { write: next => changed(JSON.stringify(next)), readOnly });
  }
  const input = document.createElement("textarea");
  input.value = text; input.disabled = readOnly;
  input.addEventListener("change", () => { input.blur(); changed(input.value); });
  return input;
}
