import { editorRow as row, editorPicker, editorButton, editorInput, partFieldInput } from "./editor-inputs.ts";
import type { ActionConfig, SkillKit } from "../core/skills/config.ts";
import type { PartConfig } from "../core/parts/parts.ts";
import { renamedInTactics } from "./mind-behaviours.ts";
import { scopeOf } from "../core/parts/entrant.ts";
import { allParts, isKind, partLookup, treeScope } from "../entrants/game.ts";
import type { Region } from "../core/skills/framework/action.ts";
import type { PartField } from "../core/parts/fields.ts";

/** A named action's editor keeps its executor reference distinct from its own identity. */
export function actionEditor<C extends SkillKit & PartConfig>(config: C, write: (config: C) => void, readOnly: boolean): HTMLElement {
  const root = document.createElement("div"); root.className = "mind-slot"; root.dataset.slot = "actions";
  const heading = document.createElement("span"); heading.textContent = "Actions"; root.append(heading);
  const set = (actions: readonly ActionConfig[]) => write({ ...config, actions });
  config.actions.forEach((action, index) => {
    const block = document.createElement("div"); block.className = "mind-item";
    const replace = (next: ActionConfig) => {
      const actions = config.actions.map((other, i) => i === index ? next : other);
      write(next.name === action.name ? { ...config, actions } : renamedInTactics({ ...config, actions }, action.name, next.name));
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

/** `field` of `config`, a choice or a box, writing `config` with the value it takes. */
function fieldRow<C>(field: PartField<C>, config: C, write: (config: C) => void, readOnly: boolean): HTMLElement {
  return row(field.label, partFieldInput(field, config, write, readOnly));
}

function input(label: string, value: string, changed: (value: string) => void, disabled: boolean, numeric = false): HTMLElement {
  return row(label, editorInput(value, changed, { disabled, numeric }));
}
const select = (label: string, values: readonly string[], value: string, changed: (value: string) => void, disabled: boolean) =>
  row(label, editorPicker(values.map(value => ({ value, text: value })), value, changed, disabled));
const button = (label: string, run: () => void, disabled: boolean) => editorButton(label, label, run, disabled);
