import type { ActionConfig, BehavioursConfig, ConditionConfig, FighterConfig, FocusRuleConfig, SelectorConfig } from "../core/mind/config.ts";
import { CONDITIONS } from "../core/mind/conditions.ts";
import { executorPart } from "../core/mind/executor-parts.ts";
import type { PartField } from "../core/mind/fields.ts";

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
    const executor = config.executors.find(e => e.name === action.executor), part = executor && executorPart(executor);
    for (const effector of part?.effectors ?? []) {
      const box = document.createElement("input"); box.type = "checkbox"; box.checked = action.effectors.includes(effector); box.disabled = readOnly;
      box.addEventListener("change", () => { box.blur(); replace({ ...action, effectors: box.checked ? [...action.effectors, effector] : action.effectors.filter(e => e !== effector) }); });
      block.append(row(effector, box));
    }
    const regions = document.createElement("div");
    action.regions.forEach((region, i) => {
      const replaceRegion = (next: ActionConfig["regions"][number]) => replace({ ...action, regions: action.regions.map((other, j) => j === i ? next : other) });
      regions.append(select("Region", ["high", "middle", "legs", "any", "segment"], region.kind === "mark" ? region.mark : "segment", value =>
        replaceRegion(value === "segment" ? { kind: "segment", segment: "head" } : { kind: "mark", mark: value as "high" }), readOnly));
      if (region.kind === "segment") regions.append(input("Segment", region.segment, segment => replaceRegion({ kind: "segment", segment }), readOnly));
      regions.append(button("Remove region", () => replace({ ...action, regions: action.regions.filter((_, j) => j !== i) }), readOnly));
    });
    regions.append(button("Add region", () => replace({ ...action, regions: [...action.regions, { kind: "mark", mark: "high" }] }), readOnly)); block.append(regions);
    block.append(select("Aim", ["centre", "surface", "leg-height"], action.aim.kind, kind => replace({ ...action,
      aim: kind === "centre" ? { kind, lead: 0 } : kind === "surface" ? { kind, tuning: { head: 0, upperTrunk: 0, middleTrunk: 0 } } : { kind: "leg-height", height: .4 } }), readOnly));
    const aim = action.aim;
    if (aim.kind === "centre") block.append(input("Prediction, s", String(aim.lead), value => replace({ ...action, aim: { ...aim, lead: Number(value) } }), readOnly, true));
    if (aim.kind === "leg-height") block.append(input("Height, m", String(aim.height), value => replace({ ...action, aim: { ...aim, height: Number(value) } }), readOnly, true));
    if (aim.kind === "surface") for (const key of Object.keys(aim.tuning) as (keyof typeof aim.tuning)[]) block.append(input(key, String(aim.tuning[key]), value =>
      replace({ ...action, aim: { ...aim, tuning: { ...aim.tuning, [key]: Number(value) } } }), readOnly, true));
    if (part?.paths) {
      block.append(select("Path", ["straight", "cross", "hook", "downward", "overhand", "uppercut"], action.family ?? "straight", family => replace({ ...action, family: family as ActionConfig["family"] }), readOnly));
      block.append(input("Arm extension", action.armExtension === undefined ? "" : String(action.armExtension), value => replace({ ...action, armExtension: value === "" ? undefined : Number(value) }), readOnly, true));
      block.append(input("Lower support, m", action.lower === undefined ? "" : String(action.lower), value => replace({ ...action, lower: value === "" ? undefined : Number(value) }), readOnly, true));
    }
    block.append(button("Move action up", () => set(config.actions.map((other, i) => i === index - 1 ? action : i === index ? config.actions[index - 1]! : other)), readOnly || index === 0),
      button("Remove action", () => set(config.actions.filter((_, i) => i !== index)), readOnly)); root.append(block);
  });
  root.append(button("Add action", () => {
    const executor = config.executors[0]; if (!executor) return;
    let name = "action", suffix = 2; while (config.actions.some(a => a.name === name)) name = `action-${suffix++}`;
    const part = executorPart(executor);
    set([...config.actions, { name, executor: executor.name, effectors: [...part.effectors], regions: [{ kind: "mark", mark: "high" }], aim: { kind: "centre", lead: 0 }, ...(part.paths ? { family: "straight" as const } : {}) }]);
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
      for (const field of CONDITIONS[rule.when.kind].fields as readonly PartField<ConditionConfig>[]) {
        root.append(field.kind === "choice" ? row(field.label, selectInput(field.options.map(([value]) => value), field.read(rule.when), value => replace({ ...rule, when: field.write(rule.when, value) ?? rule.when }), readOnly)) :
          input(field.label, field.read(rule.when), value => replace({ ...rule, when: field.write(rule.when, value) ?? rule.when }), readOnly, field.kind === "number"));
      }
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
