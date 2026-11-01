import type { ConditionConfig } from "../core/intent/conditions.ts";
import { CONDITIONS } from "../core/intent/conditions.ts";
import type { PartConfig } from "../core/parts/parts.ts";
import type { PartField } from "../core/parts/fields.ts";
import type { BehavioursConfig, FocusRuleConfig, SelectorConfig } from "../core/tactics/config.ts";
import { editorRow as row, editorPicker, editorButton, editorInput, partFieldInput } from "./editor-inputs.ts";

/** `config` with what its behaviours' rules name `from` named `to`: as it is where its tactics are not behaviours chosen by rules. */
export function renamedInTactics<C extends PartConfig>(config: C, from: string, to: string): C {
  const tactics = (config as { tactics?: BehavioursConfig }).tactics;
  if (tactics?.kind !== "behaviours" || tactics.choose.kind !== "rules") return config;
  const rename = (names: readonly string[]) => names.map(name => name === from ? to : name);
  return { ...config, tactics: { ...tactics, choose: { ...tactics.choose,
    rules: tactics.choose.rules.map(rule => ({ ...rule, actions: rename(rule.actions) })), otherwise: rename(tactics.choose.otherwise) } } };
}

/** Focus and selection are plain data edited beside the ranked behaviour list. */
export function selectionEditor(config: BehavioursConfig, write: (config: BehavioursConfig) => void, readOnly: boolean): HTMLElement {
  const root = document.createElement("div"); root.className = "mind-slot"; root.dataset.slot = "selection";
  config.target.forEach((focus, i) => {
    const replace = (next: FocusRuleConfig) => write({ ...config, target: config.target.map((other, j) => j === i ? next : other) });
    root.append(select("Focus", ["ordered", "current", "nearest"], focus.kind, kind => replace(kind === "nearest" ? { kind, prefer: "standing-first" } : { kind: kind as "ordered" }), readOnly));
    if (focus.kind === "nearest") root.append(select("Prefer", ["standing", "standing-first"], focus.prefer, prefer => replace({ ...focus, prefer: prefer as "standing" }), readOnly));
    root.append(button("Move focus up", () => write({ ...config, target: config.target.map((other, j) => j === i - 1 ? focus : j === i ? config.target[i - 1]! : other) }), readOnly || i === 0),
      button("Remove focus", () => write({ ...config, target: config.target.filter((_, j) => j !== i) }), readOnly));
  });
  root.append(button("Add focus", () => write({ ...config, target: [...config.target, { kind: "nearest", prefer: "standing-first" }] }), readOnly));
  const choose = config.choose, set = (next: SelectorConfig) => write({ ...config, choose: next });
  root.append(select("Choose action", ["first-ready", "rotate", "scored", "estimate", "rules"], choose.kind, kind => set(kind === "rules" ?
    { kind, rethink: choose.rethink, patience: choose.patience, rules: [], otherwise: [] } : { kind: kind as "rotate", rethink: choose.rethink, patience: choose.patience }), readOnly));
  root.append(input("Rethink, s", String(choose.rethink), value => set({ ...choose, rethink: Number(value) }), readOnly, true),
    input("Patience, s", String(choose.patience), value => set({ ...choose, patience: Number(value) }), readOnly, true));
  if (choose.kind === "rules") {
    choose.rules.forEach((rule, i) => {
      const replace = (next: typeof rule) => set({ ...choose, rules: choose.rules.map((other, j) => j === i ? next : other) });
      root.append(select("When", Object.keys(CONDITIONS), rule.when.kind, kind => replace({ ...rule, when: kind === "when-distance" ?
        { kind, of: "foe", than: "under", metres: 1 } : kind === "follow-up" ? { kind, seconds: .5 } : { kind: kind as "always" } }), readOnly));
      for (const field of CONDITIONS[rule.when.kind].fields as readonly PartField<ConditionConfig>[]) root.append(fieldRow(field, rule.when, when => replace({ ...rule, when }), readOnly));
      root.append(input("Actions, in order", rule.actions.join(", "), value => replace({ ...rule, actions: names(value) }), readOnly),
        button("Move rule up", () => set({ ...choose, rules: choose.rules.map((other, j) => j === i - 1 ? rule : j === i ? choose.rules[i - 1]! : other) }), readOnly || i === 0),
        button("Remove rule", () => set({ ...choose, rules: choose.rules.filter((_, j) => j !== i) }), readOnly));
    });
    root.append(button("Add rule", () => set({ ...choose, rules: [...choose.rules, { when: { kind: "always" }, actions: [] }] }), readOnly),
      input("Otherwise actions", choose.otherwise.join(", "), value => set({ ...choose, otherwise: names(value) }), readOnly));
  }
  return root;
}

const names = (value: string) => value.split(",").map(v => v.trim()).filter(Boolean);
const fieldRow = <C>(field: PartField<C>, config: C, write: (config: C) => void, readOnly: boolean) => row(field.label, partFieldInput(field, config, write, readOnly));
const input = (label: string, value: string, changed: (value: string) => void, disabled: boolean, numeric = false) => row(label, editorInput(value, changed, { disabled, numeric }));
const select = (label: string, values: readonly string[], value: string, changed: (value: string) => void, disabled: boolean) =>
  row(label, editorPicker(values.map(value => ({ value, text: value })), value, changed, disabled));
const button = (label: string, run: () => void, disabled: boolean) => editorButton(label, label, run, disabled);
