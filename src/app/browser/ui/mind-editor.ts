import { describeMind } from "../../../minds/catalog/catalog.ts";
import { optionApplies } from "../../../minds/option/parts.ts";
import { editorRow as row, editorPicker as picker, editorButton as button, partFieldInput as fieldInput } from "./editor-inputs.ts";
import { techniqueEditor } from "./mind-ground.ts";
import { GAME, isKind, kindsFor, partOf, partLookup, treeFaults, type EntryRule } from "../../catalog.ts";
import type { MindConfig } from "../../../minds/catalog/config.ts";
import { partOffered, slotsOf, type Part, type PartConfig, type Slot } from "../../../parts/parts.ts";
import { slotValue } from "../../../parts/tree.ts";
import type { BodySpec } from "../../../core/bodies/spec/body.ts";
import { mindFaults } from "../setup.ts";
import { recordingKey } from "../../../core/world/recording.ts";
import { buttonInput } from "./inputs.ts";

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
  /** The body the mind is for: Options use the skills this body can build; other incompatible parts show their refusal. */
  readonly spec: BodySpec;
  /** What the screen's scenario asks of a mind beyond fitting the body (`EntryRule`): a mind that does not meet it has that fault. Nothing unless given. */
  readonly entry?: readonly EntryRule[];
  /** Called after each change a person makes. */
  readonly onChange?: (config: MindConfig) => void;
  /** Shown, never changed: an enemy's mind. */
  readonly readOnly?: boolean;
  /** What is said after the faults: what the screen does with a mind that has one. */
  readonly onFault?: string;
}

/** What a person calls `part`, its stage said where it is research. */
const named = (part: Part): string => part.stage === "experimental" ? `${part.label} (experimental)` : part.label;

/**
 * **A mind's editor** for a body of `spec`: each part's settings, its research `tuning` read-only,
 * and each slot's part chosen from its role (`kindsFor`), omitting parts the screen cannot supply
 * and Options whose skills the body cannot build; other incompatible parts are disabled. List slots
 * support adding, reordering and removing parts. Every change
 * draws the tree again.
 */
export function mindEditor(config: MindConfig, { spec: body, entry = [], onChange, readOnly = false, onFault }: EditorOptions): MindEditor {
  const element = document.createElement("div"), tree = document.createElement("div"), fault = document.createElement("p");
  element.className = "mind-editor"; fault.className = "settings-fault";
  element.append(tree, fault);
  let current = config, spec = body, legs: PartConfig | null = null;
  const expanded = new Set<string>();
  const faultsOf = (config: MindConfig): readonly string[] => mindFaults(config, spec, { entry });
  const change = (next: PartConfig) => { draw(next as MindConfig); onChange?.(current); };

  const same = (a: PartConfig | null | undefined, b: PartConfig | undefined): boolean =>
    a != null && b !== undefined && recordingKey(a) === recordingKey(b);
  const defaultFallback = (slot: Slot): boolean => slot.fallback !== undefined && same(slot.fallback, partOf(slot.fallback).defaults);
  /** Options with no admitted skills stay in the configuration while their body or equipment changes. */
  const usable = (slot: Slot, config: PartConfig, siblings: readonly PartConfig[]): boolean => {
    // Invalid configurations remain editable so their faults can be corrected.
    if (slot.role !== "option" || !isKind(config.kind) || treeFaults(config).length > 0) return true;
    return optionApplies(config, { spec, parts: partLookup, options: siblings, legs });
  };

  /** Parts the screen supplies; Option choices use the same skill admission as their selected rows. */
  const choices = (slot: Slot, child?: PartConfig | null, siblings: readonly PartConfig[] = []) => [
    ...(slot.optional && !slot.many ? [{ value: "", text: slot.fallback ? `Default: ${partOf(slot.fallback).label}` : "None", disabled: false }] : []),
    ...kindsFor(slot.role, spec, current)
      .filter(({ kind, part }) => partOffered(part) || child?.kind === kind)
      .filter(({ kind, part, reason }) => slot.role !== "option" || kind === child?.kind || reason === null && usable(slot, part.defaults, siblings))
      .filter(({ kind }) => !defaultFallback(slot) || kind !== slot.fallback!.kind || child?.kind === kind && !same(child, slot.fallback))
      .map(({ kind, part, reason }) => ({ value: kind, text: reason ? `${named(part)}: ${reason}` : named(part), disabled: reason !== null })),
  ];
  const defaultsOf = (kind: string): PartConfig => partOf({ kind }).defaults;

  /** A selected part's settings stay closed until opened, including in the read-only inspector. */
  const settings = (child: PartConfig, content: HTMLElement, path: readonly (string | number)[], label: string) => {
    const panel = document.createElement("div"); panel.className = "mind-settings"; panel.append(content);
    panel.setAttribute("role", "group"); panel.setAttribute("aria-label", `${label} settings`);
    const key = JSON.stringify([...path, child.kind]);
    panel.hidden = !expanded.has(key);
    const toggle = buttonInput("", () => {
      panel.hidden = !panel.hidden;
      if (panel.hidden) expanded.delete(key); else expanded.add(key);
      show();
    }, { title: `${label} settings`, ariaLabel: `${label} settings` });
    toggle.className = "mind-settings-toggle";
    const show = () => { toggle.textContent = panel.hidden ? "▸" : "▾"; toggle.setAttribute("aria-expanded", String(!panel.hidden)); };
    show();
    const spacer = document.createElement("span"); spacer.className = "mind-settings-spacer";
    return { toggle: content.hasChildNodes() ? toggle : spacer, panel };
  };

  /** `config`'s part drawn into a block, `write` taking the part's config once changed. */
  const drawPart = (config: PartConfig, write: (config: PartConfig) => void, path: readonly (string | number)[] = []): HTMLElement => {
    const block = document.createElement("div");
    block.className = "mind-part"; block.dataset.path = JSON.stringify(path);
    if (!isKind(config?.kind)) {
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
    for (const slot of slotsOf(part, config)) {
      const child = slot.role === "technique" && slot.many
        ? techniqueEditor((slotValue(config, slot) ?? []) as readonly PartConfig[], kindsFor(slot.role, spec, current),
          (techniques) => write({ ...config, [slot.key]: techniques } as PartConfig), readOnly)
        : drawSlot(config, slot, write, path);
      if (child) block.append(child);
    }
    return block;
  };

  /** `slot` of `config`: its part or parts, each with its own block beneath. */
  const drawSlot = (config: PartConfig, slot: Slot, write: (config: PartConfig) => void, path: readonly (string | number)[]): HTMLElement | null => {
    const holder = document.createElement("div"), value = slotValue(config, slot);
    holder.className = "mind-slot"; holder.dataset.slot = slot.key;
    const set = (next: unknown) => write({ ...config, [slot.key]: next } as PartConfig);
    if (!slot.many) {
      const child = value as PartConfig | null;
      const chosen = child ?? slot.fallback, selected = defaultFallback(slot) && same(child, slot.fallback) ? "" : child?.kind ?? "";
      const options = choices(slot, child), fixed = options.length === 1 && options[0]!.value === selected && !options[0]!.disabled;
      const childPath = [...path, slot.key], content = chosen ? drawPart(chosen, set, childPath) : null;
      if (fixed && !content?.hasChildNodes()) return null;
      const line = document.createElement("div"); line.className = "mind-choice-line";
      const input = fixed ? document.createElement("span") : picker(options, selected, (kind) => set(kind ? defaultsOf(kind) : null), readOnly);
      if (fixed) input.textContent = options[0]!.text;
      const field = row(slot.label, input);
      if (chosen && content) {
        const detail = settings(chosen, content, childPath, slot.label);
        line.append(detail.toggle, field); holder.append(line, detail.panel);
      } else { line.append(field); holder.append(line); }
      return holder;
    }
    const list: readonly PartConfig[] = Array.isArray(value) ? value : [];
    const heading = document.createElement("span");
    heading.className = "mind-slot-name"; heading.textContent = slot.label;
    holder.append(heading);
    const shown = list.map((child, i) => ({ child, i })).filter(({ child }) => usable(slot, child, list));
    shown.forEach(({ child, i }, position) => {
      const previous = shown[position - 1]?.i;
      const item = document.createElement("div"), line = document.createElement("div");
      item.className = "mind-item"; line.className = "mind-item-line";
      const replace = (next: PartConfig) => set(list.map((other, j) => j === i ? next : other));
      const childPath = [...path, slot.key, i], detail = settings(child, drawPart(child, replace, childPath), childPath, isKind(child.kind) ? partOf(child).label : slot.label);
      line.append(detail.toggle, picker(choices(slot, child, list), child.kind, (kind) => replace(defaultsOf(kind)), readOnly),
        button("↑", `Move ${slot.label.toLowerCase()} ${position + 1} up`, () => set(list.map((other, j) => j === previous ? child : j === i ? list[previous!]! : other)), readOnly || previous === undefined),
        button("✕", `Remove ${slot.label.toLowerCase()} ${position + 1}`, () => set(list.filter((_, j) => j !== i)), readOnly));
      item.append(line, detail.panel);
      holder.append(item);
    });
    if (!readOnly) {
      const add = picker([{ value: "", text: "Add…" }, ...choices(slot, null, list)], "", (kind) => { if (kind) set([...list, defaultsOf(kind)]); }, readOnly);
      add.setAttribute("aria-label", `Add to ${slot.label.toLowerCase()}`);
      holder.append(add);
    }
    return holder;
  };

  const draw = (config: MindConfig) => {
    current = config;
    const faults = faultsOf(config);
    legs = faults.length ? null : describeMind(GAME, spec, config)?.components.find(part => part.role === "locomotion")?.config ?? null;
    tree.replaceChildren(drawPart(config, change));
    fault.hidden = faults.length === 0;
    fault.textContent = faults.length ? `${faults.join("; ")}${onFault ? `: ${onFault}` : ""}` : "";
  };
  draw(config);
  return {
    element,
    get config() { return current; },
    get faults() { return faultsOf(current); },
    set(config, body) { if (body) spec = body; expanded.clear(); draw(config); },
  };
}
