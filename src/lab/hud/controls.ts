import type { Color3 } from "@babylonjs/core/Maths/math.color.js";

/**
 * **The lab's controls**: the kinds of thing a HUD section holds, each built from data. A section
 * or a scenario lists what it offers; the pressed state and the blur on click are here alone.
 */

interface Control {
  readonly element: HTMLElement;
  /** Show what it reads now. */
  refresh(): void;
}

export interface Entry<T> {
  readonly value: T;
  readonly name: string;
  readonly title?: string;
}

/** A button that blurs once clicked, so the keys stay the page's. */
function button(name: string, run: () => void, title?: string): HTMLButtonElement {
  const made = Object.assign(document.createElement("button"), { textContent: name });
  if (title) made.title = title;
  made.addEventListener("click", () => { made.blur(); run(); });
  return made;
}

function row(label: string, parts: readonly HTMLElement[]): HTMLElement {
  const made = Object.assign(document.createElement("div"), { className: "models" });
  made.setAttribute("role", "group");
  made.setAttribute("aria-label", label);
  made.append(...parts);
  return made;
}

function field(label: string, parts: readonly HTMLElement[]): HTMLElement {
  const made = Object.assign(document.createElement("div"), { className: "field" });
  made.append(Object.assign(document.createElement("p"), { className: "label", textContent: label }), row(label, parts));
  return made;
}

/** One of `options`, the `selected` one pressed; choosing another calls `pick`. */
export function choice<T>(label: string, options: readonly Entry<T>[], selected: () => T, pick: (value: T) => void): Control {
  const refresh = (): void => options.forEach((option, i) => buttons[i]!.setAttribute("aria-pressed", String(option.value === selected())));
  const buttons = options.map((option) => button(option.name, () => {
    try { if (option.value !== selected()) pick(option.value); } finally { refresh(); }
  }, option.title));
  refresh();
  return { element: field(label, buttons), refresh };
}

/** A button for each of `options`, each calling `run` with its value. */
export function actions<T>(label: string, options: readonly Entry<T>[], run: (value: T) => void): HTMLElement {
  return field(label, options.map((option) => button(option.name, () => run(option.value), option.title)));
}

interface Readings<K extends string> {
  readonly element: HTMLElement;
  /** Write every row; the rows of `alert` are marked. */
  write(values: Readonly<Record<K, string>>, alert?: readonly K[]): void;
}

/** A list of named readings, in `rows`' order. */
export function readings<K extends string>(rows: Readonly<Record<K, { readonly name: string; readonly unit?: string }>>): Readings<K> {
  const element = document.createElement("dl"), cells = {} as Record<K, HTMLElement>;
  for (const key of Object.keys(rows) as K[]) {
    const { name, unit } = rows[key], cell = document.createElement("span"), value = document.createElement("dd");
    value.append(cell, unit ? ` ${unit}` : "");
    element.append(Object.assign(document.createElement("dt"), { textContent: name }), value);
    cells[key] = cell;
  }
  return {
    element,
    write(values, alert = []) {
      for (const key of Object.keys(cells) as K[]) {
        cells[key].textContent = values[key];
        cells[key].classList.toggle("alert", alert.includes(key));
      }
    },
  };
}

/** A line of small print. */
export function note(text: string): HTMLElement {
  return Object.assign(document.createElement("p"), { className: "note", textContent: text });
}

/** What each mark drawn in the scene is, beside a swatch of its colour. */
export function legend(marks: readonly { readonly colour: Color3; readonly name: string }[]): HTMLElement {
  const made = note("");
  for (const mark of marks) {
    const swatch = Object.assign(document.createElement("span"), { className: "swatch" });
    swatch.style.background = mark.colour.toHexString();
    made.append(swatch, `${mark.name} `);
  }
  return made;
}

/** The keys a scenario takes, and what each set does. */
export function keyHints(hints: readonly { readonly keys: readonly string[]; readonly does: string }[]): HTMLElement {
  const made = Object.assign(document.createElement("p"), { className: "keys" });
  hints.forEach((hint, i) => {
    made.append(i > 0 ? " · " : "", ...hint.keys.map((key) => Object.assign(document.createElement("kbd"), { textContent: key })), ` ${hint.does}`);
  });
  return made;
}
