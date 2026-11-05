import { regionsEditor } from "./mind-regions.ts";
import type { Region } from "../../../skills/framework/action.ts";

/** Structured editors are selected by declared field metadata, with plain JSON for other schemas. */
export function valueEditor(editor: string | undefined, text: string, changed: (text: string) => void, readOnly: boolean): HTMLElement {
  if (editor === "target-regions") {
    const value: unknown = JSON.parse(text);
    return regionsEditor(Array.isArray(value) ? value as Region[] : [], next => changed(JSON.stringify(next)), readOnly);
  }
  const input = document.createElement("textarea");
  input.value = text; input.disabled = readOnly;
  input.addEventListener("change", () => { input.blur(); changed(input.value); });
  return input;
}
