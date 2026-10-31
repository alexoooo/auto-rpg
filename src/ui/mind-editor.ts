import { editorRow as row, editorPicker as picker, editorButton as button, partFieldInput as fieldInput } from "./editor-inputs.ts";
import { techniqueEditor } from "./mind-ground.ts";
import { isKind, kindsFor, partOf, type EntryRule } from "../entrants/game.ts";
import { actionEditor, selectionEditor } from "./mind-actions.ts";
import type { MindConfig } from "../core/mind/config.ts";
import type { BehavioursConfig, FighterConfig } from "../core/tactics/config.ts";
import { slotsOf, type Part, type PartConfig, type Provision, type Slot } from "../core/parts/parts.ts";
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
  /** What the screen gives a mind (`Provision`): parts requiring an absent provision are omitted. Nothing unless given. */
  readonly provides?: readonly Provision[];
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
 * and disabling those that do not fit the body; a list slot's parts added, moved up and removed. Every change
 * draws the tree again.
 */
export function mindEditor(config: MindConfig, { spec: body, provides = [], entry = [], onChange, readOnly = false, onFault }: EditorOptions): MindEditor {
  const element = document.createElement("div"), tree = document.createElement("div"), fault = document.createElement("p");
  element.className = "mind-editor"; fault.className = "settings-fault";
  element.append(tree, fault);
  let current = config, spec = body;
  const faultsOf = (config: MindConfig): readonly string[] => mindFaults(config, spec, { provides, entry });
  const change = (next: PartConfig) => { draw(next as MindConfig); onChange?.(current); };

  /** Parts the screen supplies, with incompatible bodies explained by disabled choices. */
  const choices = (slot: Slot) => [
    ...(slot.optional && !slot.many ? [{ value: "", text: slot.fallback ? partOf(slot.fallback).label : "None" }] : []),
    ...kindsFor(slot.role, spec, provides, current).filter(({ part }) => !part.needs || provides.includes(part.needs))
      .map(({ kind, part, reason }) => ({ value: kind, text: reason ? `${named(part)}: ${reason}` : named(part), disabled: reason !== null })),
  ];
  const defaultsOf = (kind: string): PartConfig => partOf({ kind }).defaults;

  /** `config`'s part drawn into a block, `write` taking the part's config once changed. */
  const drawPart = (config: PartConfig, write: (config: PartConfig) => void): HTMLElement => {
    const block = document.createElement("div");
    block.className = "mind-part";
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
    if (config.kind === "behaviours") block.append(selectionEditor(config as BehavioursConfig, write, readOnly));
    // A part whose slots hold executors pairs its actions with them (`ActionConfig`): the action editor is the executor role's.
    if (slotsOf(part, config).some((slot) => slot.role === "executor") && "actions" in config) block.append(actionEditor(config as FighterConfig, write as (config: FighterConfig) => void, readOnly));
    for (const slot of slotsOf(part, config)) block.append(slot.role === "technique" && slot.many
      ? techniqueEditor((config as unknown as Record<string, readonly PartConfig[]>)[slot.key] ?? [], kindsFor(slot.role, spec, provides, current),
        (techniques) => write({ ...config, [slot.key]: techniques } as PartConfig), readOnly)
      : drawSlot(config, slot, write));
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
      const replace = (next: PartConfig) => {
        if (slot.role === "executor") {
          const before = child as PartConfig & { name: string }, after = next as PartConfig & { name: string }, fighter = config as FighterConfig;
          write({ ...fighter, executors: list.map((other, j) => j === i ? next : other),
            actions: fighter.actions.map(action => action.executor === before.name ? { ...action, executor: after.name } : action) } as unknown as FighterConfig);
        } else set(list.map((other, j) => j === i ? next : other));
      };
      line.append(picker(choices(slot), child.kind, (kind) => replace(slot.role === "executor" ? { ...defaultsOf(kind), name: (child as PartConfig & { name: string }).name } as PartConfig : defaultsOf(kind)), readOnly),
        button("↑", `Move ${slot.label.toLowerCase()} ${i + 1} up`, () => set(list.map((other, j) => j === i - 1 ? child : j === i ? list[i - 1]! : other)), readOnly || i === 0),
        button("✕", `Remove ${slot.label.toLowerCase()} ${i + 1}`, () => set(list.filter((_, j) => j !== i)), readOnly));
      item.append(line, drawPart(child, replace));
      holder.append(item);
    });
    if (!readOnly) {
      const add = picker([{ value: "", text: "Add…" }, ...choices(slot)], "", (kind) => { if (kind) {
        let next = defaultsOf(kind);
        if (slot.role === "executor") {
          const base = (next as PartConfig & { name: string }).name; let name = base, suffix = 2;
          while (list.some(entry => (entry as PartConfig & { name: string }).name === name)) name = `${base}-${suffix++}`;
          next = { ...next, name } as PartConfig;
        }
        set([...list, next]);
      } }, readOnly);
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
