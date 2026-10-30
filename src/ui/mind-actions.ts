import type { ActionConfig, BehavioursConfig, ConditionConfig, FighterConfig, FocusRuleConfig, SelectorConfig } from "../core/mind/config.ts";
import { CONDITIONS } from "../core/mind/conditions.ts";
import { scopeOf } from "../core/parts/entrant.ts";
import { allParts, isKind, partLookup, treeScope } from "../entrants/game.ts";
import type { Region } from "../core/skills/action.ts";
import type { PartField } from "../core/parts/fields.ts";

/** A named action's editor keeps its executor reference distinct from its own identity. */
export function actionEditor(config: FighterConfig, write: (config: FighterConfig) => void, readOnly: boolean): HTMLElement {
  const root = document.createElement("div"); root.className = "mind-slot"; root.dataset.slot = "actions";
  const heading = document.createElement("span"); heading.textContent = "Actions"; root.append(heading);
  const set = (actions: readonly ActionConfig[]) => write({ ...config, actions });
  config.actions.forEach((action, index) => {
    const block = document.createElement("div"); block.className = "mind-item";
    const replace = (next: ActionConfig) => {
      const actions = config.actions.map((other, i) => i === index ? next : other), tactics = config.tactics;
      if (next.name !== action.name && tactics.kind === "behaviours" && tactics.choose.kind === "rules") {
        const rename = (names: readonly string[]) => names.map(name => name === action.name ? next.name : name);
        write({ ...config, actions, tactics: { ...tactics, choose: { ...tactics.choose,
          rules: tactics.choose.rules.map(rule => ({ ...rule, actions: rename(rule.actions) })), otherwise: rename(tactics.choose.otherwise) } } });
      } else set(actions);
    };
    block.append(input("Name", action.name, value => replace({ ...action, name: value }), readOnly),
      select("Executor", config.executors.map(e => e.name), action.executor, value => replace({ ...action, executor: value }), readOnly));
    const executor = config.executors.find(e => e.name === action.executor), part = executor && partLookup.of("executor", executor);
    for (const effector of part?.effectors ?? []) {
      const box = document.createElement("input"); box.type = "checkbox"; box.checked = action.effectors.includes(effector); box.disabled = readOnly;
      box.addEventListener("change", () => { box.blur(); replace({ ...action, effectors: box.checked ? [...action.effectors, effector] : action.effectors.filter(e => e !== effector) }); });
      block.append(row(effector, box));
    }
    if (part?.aims) {
      const regions = document.createElement("div"), held = action.regions ?? [];
      held.forEach((region, i) => {
        const replaceRegion = (next: Region) => replace({ ...action, regions: held.map((other, j) => j === i ? next : other) });
        regions.append(select("Region", ["high", "middle", "legs", "any", "segment"], region.kind === "mark" ? region.mark : "segment", value =>
          replaceRegion(value === "segment" ? { kind: "segment", segment: "head" } : { kind: "mark", mark: value as "high" }), readOnly));
        if (region.kind === "segment") regions.append(input("Segment", region.segment, segment => replaceRegion({ kind: "segment", segment }), readOnly));
        regions.append(button("Remove region", () => replace({ ...action, regions: held.filter((_, j) => j !== i) }), readOnly));
      });
      regions.append(button("Add region", () => replace({ ...action, regions: [...held, { kind: "mark", mark: "high" }] }), readOnly)); block.append(regions);
      const aims = Object.entries(allParts()).filter(([kind, one]) => one.role === "aim" && (scopeOf(kind) === null || scopeOf(kind) === treeScope(config)));
      const aim = action.aim ?? null, aimPart = aim && isKind(aim.kind) ? partLookup.of("aim", aim) : null;
      block.append(select("Aim", aims.map(([kind]) => kind), aim?.kind ?? "", kind => replace({ ...action, aim: partLookup.of("aim", { kind }).defaults }), readOnly));
      for (const field of aimPart?.fields ?? []) block.append(fieldRow(field, aim!, next => replace({ ...action, aim: next }), readOnly));
    }
    for (const field of part?.actionFields ?? []) block.append(fieldRow(field, action, replace, readOnly));
    block.append(button("Move action up", () => set(config.actions.map((other, i) => i === index - 1 ? action : i === index ? config.actions[index - 1]! : other)), readOnly || index === 0),
      button("Remove action", () => set(config.actions.filter((_, i) => i !== index)), readOnly)); root.append(block);
  });
  root.append(button("Add action", () => {
    const executor = config.executors[0]; if (!executor) return;
    let name = "action", suffix = 2; while (config.actions.some(a => a.name === name)) name = `action-${suffix++}`;
    const part = partLookup.of("executor", executor);
    set([...config.actions, { ...part.actionDefaults, name, executor: executor.name, effectors: [...part.effectors],
      ...part.aims ? { regions: [{ kind: "mark" as const, mark: "high" as const }], aim: { kind: "centre", lead: 0 } } : {} }]);
  }, readOnly || !config.executors.length));
  return root;
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

/** `field` of `config`, a choice or a box, writing `config` with the value it takes. */
function fieldRow<C>(field: PartField<C>, config: C, write: (config: C) => void, readOnly: boolean): HTMLElement {
  return field.kind === "choice" ? row(field.label, selectInput(field.options.map(([value]) => value), field.read(config), value => write(field.write(config, value) ?? config), readOnly))
    : input(field.label, field.read(config), value => write(field.write(config, value) ?? config), readOnly, field.kind === "number");
}

const names = (value: string) => value.split(",").map(v => v.trim()).filter(Boolean);
function row(label: string, child: HTMLElement): HTMLElement {
  const row = document.createElement("label"), name = document.createElement("span"); row.className = "field"; name.textContent = label; row.append(name, child); return row;
}
function input(label: string, value: string, changed: (value: string) => void, disabled: boolean, numeric = false): HTMLElement {
  const input = Object.assign(document.createElement("input"), { type: numeric ? "number" : "text", value, disabled });
  if (numeric) input.step = "any";
  input.addEventListener("change", () => { input.blur(); changed(input.value); }); return row(label, input);
}
function selectInput(values: readonly string[], selected: string, changed: (value: string) => void, disabled: boolean): HTMLElement {
  const select = document.createElement("select"); select.disabled = disabled;
  values.forEach(value => select.append(Object.assign(document.createElement("option"), { value, textContent: value })));
  select.value = selected; select.addEventListener("change", () => { select.blur(); changed(select.value); }); return select;
}
const select = (label: string, values: readonly string[], value: string, changed: (value: string) => void, disabled: boolean) => row(label, selectInput(values, value, changed, disabled));
function button(label: string, run: () => void, disabled: boolean): HTMLElement {
  const button = Object.assign(document.createElement("button"), { type: "button", textContent: label, disabled });
  button.addEventListener("click", () => { button.blur(); run(); }); return button;
}
