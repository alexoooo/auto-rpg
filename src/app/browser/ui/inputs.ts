/** Shared DOM inputs give keyboard control back to the screen after use. */
export function buttonInput(text: string, run: () => void, options: { readonly title?: string; readonly disabled?: boolean; readonly ariaLabel?: string } = {}): HTMLButtonElement {
  const button = Object.assign(document.createElement("button"), { type: "button", textContent: text, disabled: options.disabled ?? false });
  if (options.title) button.title = options.title;
  if (options.ariaLabel) button.setAttribute("aria-label", options.ariaLabel);
  button.addEventListener("click", () => { button.blur(); run(); }); return button;
}

/** A shared select preserves option labels, refusal and hints. */
export function selectInput(options: readonly { readonly value: string; readonly text: string; readonly disabled?: boolean; readonly title?: string }[], value: string,
  change: (value: string) => void, settings: { readonly disabled?: boolean } = {}): HTMLSelectElement {
  const select = document.createElement("select");
  for (const option of options) select.append(Object.assign(document.createElement("option"), { value: option.value, textContent: option.text, disabled: !!option.disabled, title: option.title ?? "" }));
  select.value = value; select.disabled = settings.disabled ?? false;
  select.addEventListener("change", () => { select.blur(); change(select.value); }); return select;
}
