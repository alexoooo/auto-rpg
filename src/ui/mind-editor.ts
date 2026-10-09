import { kindsFor, partOf, PARTS } from "../core/mind/catalog.ts";
import type { MindConfig } from "../core/mind/config.ts";
import type { PartField } from "../core/mind/fields.ts";
import type { Part, PartConfig, Provision, Slot } from "../core/mind/parts.ts";
import type { BodySpec } from "../core/spec/body.ts";
import { mindFaults } from "./mind-link.ts";

/** **A mind's editor**: its tree of parts, drawn and changed in place. */
interface MindEditor {
  readonly element: HTMLElement;
  /** The config as it stands. */
  readonly config: MindConfig;
  /** What is wrong with it (`mindFaults`). */
  readonly faults: readonly string[];
  /** Show `config` in place of what it shows, for a body of `spec` if given, or of the one it was for. */
  set(config: MindConfig, spec?: BodySpec): void;
}

interface EditorOptions {
  /** The body the mind is for: a part that does not fit it is offered disabled, with the reason. */
  readonly spec: BodySpec;
  /** What the screen gives a mind (`Provision`): a part that needs what it does not is offered disabled, with the reason. Nothing unless given. */
  readonly provides?: readonly Provision[];
  /** Called after each change a person makes. */
  readonly onChange?: (config: MindConfig) => void;
  /** Shown, never changed: an enemy's mind. */
  readonly readOnly?: boolean;
  /** What is said after the faults: what the screen does with a mind that has one. */
  readonly onFault?: string;
}

/** What a person calls `part`, its stage said where it is research. */
const named = (part: Part): string => part.stage === "experimental" ? `${part.label} (experimental)` : part.label;

/** A row: `label` beside `input`. */
function row(label: string, input: HTMLElement): HTMLElement {
  const made = document.createElement("label"), name = document.createElement("span");
  made.className = "field"; name.textContent = label;
  made.append(name, input);
  return made;
}

/** A picker of `options`, `value` chosen, which blurs on change so the keys stay the page's. */
function picker(options: readonly { readonly value: string; readonly text: string; readonly disabled?: boolean }[], value: string,
  change: (value: string) => void, readOnly: boolean): HTMLSelectElement {
  const select = document.createElement("select");
  for (const option of options) select.append(Object.assign(document.createElement("option"), { value: option.value, textContent: option.text, disabled: !!option.disabled }));
  select.value = value; select.disabled = readOnly;
  select.addEventListener("change", () => { select.blur(); change(select.value); });
  return select;
}

/** A button that blurs when clicked. */
function button(text: string, title: string, run: () => void, readOnly: boolean): HTMLButtonElement {
  const made = Object.assign(document.createElement("button"), { type: "button", textContent: text, title, disabled: readOnly });
  made.setAttribute("aria-label", title);
  made.addEventListener("click", () => { made.blur(); run(); });
  return made;
}

/** The input of a field of `config`, which writes what is set through the field (`PartField.write`). */
function fieldInput<C extends PartConfig>(field: PartField<C>, config: C, write: (config: C) => void, readOnly: boolean): HTMLElement {
  switch (field.kind) {
    case "choice":
      return picker(field.options.map(([value, text]) => ({ value, text })), field.read(config), (text) => write(field.write(config, text) ?? config), readOnly);
    case "number": {
      const input = Object.assign(document.createElement("input"), { type: "number", min: String(field.least), max: String(field.most), step: String(field.step), value: field.read(config), disabled: readOnly });
      input.setAttribute("aria-label", `${field.label}, ${field.unit}`);
      input.addEventListener("change", () => { input.blur(); write(field.write(config, input.value) ?? config); });
      return input;
    }
    default: { const never: never = field; throw new Error(`no field of kind ${JSON.stringify(never)}`); }
  }
}

/**
 * **A mind's editor** for a body of `spec`: each part's settings, its research `tuning` read-only,
 * and each slot's part chosen from every part of its role (`kindsFor`), the ones that cannot go
 * there disabled with the reason; a list slot's parts added, moved up and removed. Every change
 * draws the tree again.
 */
export function mindEditor(config: MindConfig, { spec: body, provides = [], onChange, readOnly = false, onFault }: EditorOptions): MindEditor {
  const element = document.createElement("div"), tree = document.createElement("div"), fault = document.createElement("p");
  element.className = "mind-editor"; fault.className = "settings-fault";
  element.append(tree, fault);
  let current = config, spec = body;
  const faultsOf = (config: MindConfig): readonly string[] => mindFaults(config, spec, provides);
  const change = (next: PartConfig) => { draw(next as MindConfig); onChange?.(current); };

  /** The kinds a slot may be set to, each disabled with the reason it cannot go there. */
  const choices = (slot: Slot) => [
    ...(slot.optional && !slot.many ? [{ value: "", text: "None" }] : []),
    ...kindsFor(slot.role, spec, provides).map(({ kind, part, reason }) => ({ value: kind, text: reason ? `${named(part)}: ${reason}` : named(part), disabled: reason !== null })),
  ];
  const defaultsOf = (kind: string): PartConfig => partOf({ kind }).defaults;

  /** `config`'s part drawn into a block, `write` taking the part's config once changed. */
  const drawPart = (config: PartConfig, write: (config: PartConfig) => void): HTMLElement => {
    const block = document.createElement("div");
    block.className = "mind-part";
    if (typeof config?.kind !== "string" || !Object.hasOwn(PARTS, config.kind)) {
      block.textContent = `No part of kind ${JSON.stringify((config as { kind?: unknown } | null)?.kind)}`;
      return block;
    }
    const part = partOf(config);
    for (const field of part.fields) block.append(row(field.label, fieldInput(field, config, write, readOnly)));
    const tuning = (config as { tuning?: unknown }).tuning;
    if (tuning !== undefined) {
      const shown = document.createElement("pre");
      shown.className = "mind-tuning"; shown.textContent = `Research tuning, read-only\n${JSON.stringify(tuning, null, 1)}`;
      block.append(shown);
    }
    for (const slot of part.slots) block.append(drawSlot(config, slot, write));
    return block;
  };

  /** `slot` of `config`: its part or parts, each with its own block beneath. */
  const drawSlot = (config: PartConfig, slot: Slot, write: (config: PartConfig) => void): HTMLElement => {
    const holder = document.createElement("div"), value = (config as unknown as Record<string, unknown>)[slot.key];
    holder.className = "mind-slot"; holder.dataset.slot = slot.key;
    const set = (next: unknown) => write({ ...config, [slot.key]: next } as PartConfig);
    if (!slot.many) {
      const child = value as PartConfig | null;
      holder.append(row(slot.label, picker(choices(slot), child?.kind ?? "", (kind) => set(kind ? defaultsOf(kind) : null), readOnly)));
      if (child) holder.append(drawPart(child, set));
      return holder;
    }
    const list: readonly PartConfig[] = Array.isArray(value) ? value : [];
    const heading = document.createElement("span");
    heading.className = "mind-slot-name"; heading.textContent = slot.label;
    holder.append(heading);
    list.forEach((child, i) => {
      const item = document.createElement("div"), line = document.createElement("div");
      item.className = "mind-item"; line.className = "mind-item-line";
      const replace = (next: PartConfig) => set(list.map((other, j) => j === i ? next : other));
      line.append(picker(choices(slot), child.kind, (kind) => replace(defaultsOf(kind)), readOnly),
        button("↑", `Move ${slot.label.toLowerCase()} ${i + 1} up`, () => set(list.map((other, j) => j === i - 1 ? child : j === i ? list[i - 1]! : other)), readOnly || i === 0),
        button("✕", `Remove ${slot.label.toLowerCase()} ${i + 1}`, () => set(list.filter((_, j) => j !== i)), readOnly));
      item.append(line, drawPart(child, replace));
      holder.append(item);
    });
    if (!readOnly) {
      const add = picker([{ value: "", text: "Add…" }, ...choices(slot)], "", (kind) => { if (kind) set([...list, defaultsOf(kind)]); }, readOnly);
      add.setAttribute("aria-label", `Add to ${slot.label.toLowerCase()}`);
      holder.append(add);
    }
    return holder;
  };

  const draw = (config: MindConfig) => {
    current = config;
    tree.replaceChildren(drawPart(config, change));
    const faults = faultsOf(config);
    fault.hidden = faults.length === 0;
    fault.textContent = faults.length ? `${faults.join("; ")}${onFault ? `: ${onFault}` : ""}` : "";
  };
  draw(config);
  return {
    element,
    get config() { return current; },
    get faults() { return faultsOf(current); },
    set(config, body) { if (body) spec = body; draw(config); },
  };
}
