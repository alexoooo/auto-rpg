import type { Color3 } from "@babylonjs/core/Maths/math.color.js";

/**
 * **The lab's controls**: the kinds of thing a HUD section holds, each built from data. A section
 * or a scenario lists what it offers; the pressed state and the blur on click are here alone.
 */

export interface Control {
  readonly element: HTMLElement;
  /** Show what it reads now. */
  refresh(): void;
}

export interface Entry<T> {
  readonly value: T;
  readonly name: string;
  readonly title?: string;
}

/** What each of a list's values is called: a value without a name is a type error. */
export type Named<T extends string | number> = Readonly<Record<T, Omit<Entry<T>, "value">>>;

/** An entry for each of `values`, in their order. */
export function entries<T extends string | number>(values: readonly T[], named: Named<T>): Entry<T>[] {
  return values.map((value) => ({ value, ...named[value] }));
}

/** A control that reads nothing. */
const fixed = (element: HTMLElement): Control => ({ element, refresh() {} });

/** A button that blurs when clicked, so the keys stay the page's. */
function button(name: string, run: () => void, title?: string): HTMLButtonElement {
  const made = Object.assign(document.createElement("button"), { textContent: name });
  if (title) made.title = title;
  made.addEventListener("click", () => { made.blur(); run(); });
  return made;
}

/** `parts` in a row beside `label`, which is also read out. */
function field(label: string, parts: readonly Control[]): Control {
  const element = Object.assign(document.createElement("div"), { className: "field" });
  const row = Object.assign(document.createElement("div"), { className: "options" });
  row.setAttribute("role", "group");
  row.setAttribute("aria-label", label);
  row.append(...parts.map((part) => part.element));
  element.append(Object.assign(document.createElement("p"), { className: "label", textContent: label }), row);
  return { element, refresh: () => parts.forEach((part) => part.refresh()) };
}

/** A button that calls `run`. */
export function action(name: string, run: () => void, title?: string): Control {
  return fixed(button(name, run, title));
}

/** A button pressed while `on`; pressing it calls `flip`. */
export function toggle(name: string, on: () => boolean, flip: () => void, title?: string): Control {
  const refresh = (): void => element.setAttribute("aria-pressed", String(on()));
  const element = button(name, () => { try { flip(); } finally { refresh(); } }, title);
  refresh();
  return { element, refresh };
}

/** One of `options`, the `selected` one pressed; choosing another calls `pick`. */
export function choice<T>(label: string, options: readonly Entry<T>[], selected: () => T, pick: (value: T) => void): Control {
  // Choosing one releases another: all of them are read again.
  const all = field(label, options.map(({ value, name, title }) =>
    toggle(name, () => value === selected(), () => { if (value !== selected()) pick(value); all.refresh(); }, title)));
  return all;
}

/** Any of `options`, each pressed while `on`; pressing one calls `flip`. */
export function switches<T>(label: string, options: readonly Entry<T>[], on: (value: T) => boolean, flip: (value: T) => void): Control {
  return field(label, options.map(({ value, name, title }) => toggle(name, () => on(value), () => flip(value), title)));
}

/** A button for each of `options`, each calling `run` with its value. */
export function actions<T>(label: string, options: readonly Entry<T>[], run: (value: T) => void): Control {
  return field(label, options.map(({ value, name, title }) => action(name, () => run(value), title)));
}

/** A number moved down and up by `step` among those `allows` takes; a move calls `set`. */
export function quantity(label: string, step: number, allows: (value: number) => boolean, value: () => number, set: (value: number) => void): Control {
  const mover = (name: string, by: number): Control => {
    const element = button(name, () => { try { set(value() + by); } finally { all.refresh(); } });
    return { element, refresh: () => { element.disabled = !allows(value() + by); } };
  };
  const shown = document.createElement("output");
  const all = field(label, [mover("−", -step), { element: shown, refresh: () => { shown.textContent = String(value()); } }, mover("+", step)]);
  all.refresh();
  return all;
}

/** `control`, shown only while `visible`. */
export function when(visible: () => boolean, control: Control): Control {
  const element = document.createElement("div");
  element.append(control.element);
  const refresh = (): void => { element.hidden = !visible(); control.refresh(); };
  refresh();
  return { element, refresh };
}

/** `parts` under a heading. */
export function group(name: string, parts: readonly Control[]): Control {
  const element = Object.assign(document.createElement("section"), { className: "group" });
  element.append(Object.assign(document.createElement("h2"), { textContent: name }), ...parts.map((part) => part.element));
  return { element, refresh: () => parts.forEach((part) => part.refresh()) };
}

/** A list of named readings, in `rows`' order; `write` takes every row, and marks the rows of `alert`. */
export function readings<K extends string>(rows: Readonly<Record<K, { readonly name: string; readonly unit?: string }>>):
  Control & { write(values: Readonly<Record<K, string>>, alert?: readonly K[]): void } {
  const element = document.createElement("dl"), cells = {} as Record<K, HTMLElement>;
  for (const key of Object.keys(rows) as K[]) {
    const { name, unit } = rows[key], cell = document.createElement("span"), value = document.createElement("dd");
    value.append(cell, unit ? ` ${unit}` : "");
    element.append(Object.assign(document.createElement("dt"), { textContent: name }), value);
    cells[key] = cell;
  }
  return {
    ...fixed(element),
    write(values, alert = []) {
      for (const key of Object.keys(cells) as K[]) {
        cells[key].textContent = values[key];
        cells[key].classList.toggle("alert", alert.includes(key));
      }
    },
  };
}

/** A table under `columns`; `write` replaces its rows. */
export function table(columns: readonly string[]): Control & { write(rows: readonly (readonly string[])[]): void } {
  const line = (tag: "td" | "th", cells: readonly string[]): HTMLElement => {
    const made = document.createElement("tr");
    made.append(...cells.map((text) => Object.assign(document.createElement(tag), { textContent: text })));
    return made;
  };
  const element = document.createElement("table"), body = document.createElement("tbody");
  element.createTHead().append(line("th", columns));
  element.append(body);
  return { ...fixed(element), write: (rows) => body.replaceChildren(...rows.map((cells) => line("td", cells))) };
}

/** A line of small print, read from `text`. */
export function note(text: () => string): Control {
  const element = Object.assign(document.createElement("p"), { className: "note" });
  const refresh = (): void => { element.textContent = text(); };
  refresh();
  return { element, refresh };
}

/** What each mark drawn in the scene is, beside a swatch of its colour. */
export function legend(marks: readonly { readonly colour: Color3; readonly name: string }[]): Control {
  const element = Object.assign(document.createElement("p"), { className: "note" });
  for (const mark of marks) {
    const swatch = Object.assign(document.createElement("span"), { className: "swatch" });
    swatch.style.background = mark.colour.toHexString();
    element.append(swatch, `${mark.name} `);
  }
  return fixed(element);
}

/** The keys a scenario takes, and what each set does. */
export function keyHints(hints: readonly { readonly keys: readonly string[]; readonly does: string }[]): Control {
  const element = Object.assign(document.createElement("p"), { className: "keys" });
  hints.forEach((hint, i) => {
    element.append(i > 0 ? " · " : "", ...hint.keys.map((key) => Object.assign(document.createElement("kbd"), { textContent: key })), ` ${hint.does}`);
  });
  return fixed(element);
}
