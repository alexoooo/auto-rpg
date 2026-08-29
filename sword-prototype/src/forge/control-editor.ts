import {
  CONSTRUCT_ACTION_VERSION,
  validateConstructCommand,
  validateControlGraph,
  type ActionSpec,
  type ConstructCommand,
  type ConstructControlGraph,
  type ControlGroupSpec,
  type ParameterSpec,
  type QuantityUnit,
} from "../construct/actions.ts";
import { compatibleControllers, type ControllerCompatibility } from "../construct/controllers.ts";
import type { ConstructBlueprint } from "../construct/blueprint.ts";

export interface ControlEditorSelection { readonly joints: readonly string[]; readonly modules: readonly string[]; }
export interface ControlEditorOptions {
  readonly graph: ConstructControlGraph;
  readonly availableJoints: readonly string[];
  readonly availableModules: readonly string[];
  readonly blueprint: ConstructBlueprint;
  readonly onChange?: (graph: ConstructControlGraph) => void;
  readonly onProbe?: (command: ConstructCommand) => void;
  readonly onReset?: () => void;
  readonly onControllerPick?: (descriptor: ControllerCompatibility) => void;
}
export interface ActionDraft {
  readonly id: string; readonly controller: string; readonly group: string;
  readonly claims: readonly string[]; readonly parameters: Readonly<Record<string, ParameterSpec>>;
}

const UNITS: readonly QuantityUnit[] = ["scalar", "metres", "metres-per-second", "radians",
  "radians-per-second", "seconds", "joules", "watts"];
const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[character] as string);
export const updateOrderedSelection = (order: readonly string[], id: string, checked: boolean): readonly string[] =>
  checked ? [...order.filter((row) => row !== id), id] : order.filter((row) => row !== id);

/** The picker asks the controller registry for descriptors; controller names are never dispatched here. */
export function controllerChoicesForSelection(selection: ControlEditorSelection,
  blueprint?: ConstructBlueprint): readonly ControllerCompatibility[] {
  const choices = compatibleControllers(selection.joints.length, selection.modules.length);
  if (!("bindings" in selection)) return choices;
  const bindings = (selection as ControlGroupSpec).bindings;
  return choices.filter((row) => row.bindings.every((requirement) => {
    if (requirement.repeat === "once") {
      const binding = bindings[requirement.role];
      return binding !== undefined && compatibleBinding(binding, requirement.joints, requirement.modules,
        requirement.allowAdditionalModules) && compatibleHardware(requirement.role, binding, blueprint);
    }
    return Object.values(bindings).filter((binding) => compatibleBinding(binding, requirement.joints, requirement.modules) &&
      compatibleHardware(requirement.role, binding, blueprint)).length >= 3;
  }) && (row.role !== "two-axis-mount" || compatibleMountTopology(bindings, blueprint)));
}

const compatibleMountTopology = (bindings: ControlGroupSpec["bindings"],
  blueprint?: ConstructBlueprint): boolean => {
  if (!blueprint) return true;
  const yawId = bindings.yaw?.joints[0]; const pitchId = bindings.pitch?.joints[0];
  if (!yawId || !pitchId) return false;
  const yaw = blueprint.joints.find(({ id }) => id === yawId);
  const pitch = blueprint.joints.find(({ id }) => id === pitchId);
  if (!yaw || !pitch || yaw.childPart !== pitch.parentPart) return false;
  return (bindings.output?.modules ?? []).some((id) => {
    const module = blueprint.modules.find((row) => row.id === id);
    const socket = module && blueprint.sockets.find((row) => row.id === module.socket);
    return socket?.part === pitch.childPart;
  });
};

const descriptor = (controller: string, group: ControlGroupSpec, blueprint?: ConstructBlueprint): ControllerCompatibility => {
  const found = controllerChoicesForSelection(group, blueprint).find((candidate) => candidate.controller === controller);
  if (!found) throw new Error(`controller "${controller}" is not compatible with group "${group.id}"`);
  return found;
};

export function actionParametersForDescriptor(row: ControllerCompatibility, group: ControlGroupSpec): Readonly<Record<string, ParameterSpec>> {
  return Object.freeze(Object.fromEntries(Object.entries(row.parameters).map(([name, spec]) => {
    if (name === "joint" && spec.kind === "enum") {
      if (group.joints.length === 0) throw new Error(`controller "${row.controller}" needs a group joint`);
      return [name, Object.freeze({ kind: "enum", values: Object.freeze([...group.joints]) })];
    }
    return [name, spec];
  })));
}

const compatibleBinding = (binding: ControlGroupSpec["bindings"][string], joints: number, modules: number,
  allowAdditionalModules = false): boolean => binding.joints.length === joints &&
  (allowAdditionalModules ? binding.modules.length >= modules : binding.modules.length === modules);

const compatibleHardware = (role: string, binding: ControlGroupSpec["bindings"][string],
  blueprint?: ConstructBlueprint): boolean => {
  if (!blueprint) return true;
  const modules = binding.modules.map((id) => blueprint.modules.find((row) => row.id === id));
  const joints = binding.joints.map((id) => blueprint.joints.find((row) => row.id === id));
  if (modules.some((row) => !row) || joints.some((row) => !row)) return false;
  if (role === "yaw") return joints[0]?.angularAxes.some(({ id }) => id === "y") ?? false;
  if (role === "pitch") return joints[0]?.angularAxes.some(({ id }) => id === "x") ?? false;
  if (role === "output") return modules.some((module) => module?.kind === "launcher" || module?.kind === "sword");
  if (role === "launcher") return modules.length === 1 && modules[0]?.kind === "launcher";
  if (role === "sword") return modules.length === 1 && modules[0]?.kind === "sword";
  if (role !== "limb" && role !== "left-foot" && role !== "right-foot") return true;
  if (joints.length !== 4 || modules.length !== 1 || modules[0]?.kind !== "contact-sensor") return false;
  for (let index = 1; index < joints.length; index += 1) {
    if (joints[index - 1]?.childPart !== joints[index]?.parentPart) return false;
  }
  const socket = blueprint.sockets.find(({ id }) => id === modules[0]?.socket);
  return socket?.part === joints.at(-1)?.childPart;
};

/** Descriptor admission is shared by reducers and DOM; the live controller still validates on entry. */
export function validateActionDescriptor(graph: ConstructControlGraph, draft: ActionDraft,
  blueprint?: ConstructBlueprint): ActionSpec {
  const group = graph.groups.find((candidate) => candidate.id === draft.group);
  if (!group) throw new Error(`action "${draft.id}" references missing group "${draft.group}"`);
  const row = descriptor(draft.controller, group, blueprint);
  for (const binding of row.bindings) {
    if (binding.repeat === "once") {
      const found = group.bindings[binding.role];
      if (!found || !compatibleBinding(found, binding.joints, binding.modules, binding.allowAdditionalModules)) {
        throw new Error(`controller "${row.controller}" requires binding "${binding.role}" with ` +
          `${binding.joints} joint(s) and ${binding.modules} module(s)`);
      }
    } else {
      const count = Object.values(group.bindings).filter((candidate) => compatibleBinding(candidate, binding.joints, binding.modules)).length;
      if (count < 3) throw new Error(`controller "${row.controller}" requires at least three limb bindings with ` +
        `${binding.joints} joints and ${binding.modules} module`);
    }
  }
  const missing = row.requiredParameters.find((name) => !Object.prototype.hasOwnProperty.call(draft.parameters, name));
  if (missing) throw new Error(`controller "${row.controller}" requires parameter descriptor "${missing}"`);
  const templates = actionParametersForDescriptor(row, group);
  for (const name of row.requiredParameters) {
    const expected = templates[name]; const actual = draft.parameters[name];
    if (actual.kind !== expected.kind) {
      throw new Error(`controller "${row.controller}" parameter "${name}" must use ${expected.kind}, got ${actual.kind}`);
    }
    if (actual.kind === "number" && expected.kind === "number" && actual.unit !== expected.unit) {
      throw new Error(`controller "${row.controller}" parameter "${name}" must use ${expected.unit}, got ${actual.unit}`);
    }
    if (actual.kind === "enum" && expected.kind === "enum" && actual.values.some((value) => !expected.values.includes(value))) {
      throw new Error(`controller "${row.controller}" parameter "${name}" has a choice outside its compatible group`);
    }
  }
  return Object.freeze({ ...draft });
}

export function replaceControlGroup(graph: ConstructControlGraph, group: ControlGroupSpec,
  blueprint?: ConstructBlueprint): ConstructControlGraph {
  const next = graph.groups.some(({ id }) => id === group.id)
    ? graph.groups.map((row) => row.id === group.id ? group : row) : [...graph.groups, group];
  const validated = validateControlGraph({ ...graph, groups: next });
  for (const action of validated.actions) validateActionDescriptor(validated, action, blueprint);
  return validated;
}
export function replaceControlAction(graph: ConstructControlGraph, draft: ActionDraft,
  blueprint?: ConstructBlueprint): ConstructControlGraph {
  const action = validateActionDescriptor(graph, draft, blueprint);
  const next = graph.actions.some(({ id }) => id === action.id)
    ? graph.actions.map((row) => row.id === action.id ? action : row) : [...graph.actions, action];
  return validateControlGraph({ ...graph, actions: next });
}
export const removeControlAction = (graph: ConstructControlGraph, id: string): ConstructControlGraph =>
  validateControlGraph({ ...graph, actions: graph.actions.filter((action) => action.id !== id) });
export const removeControlGroup = (graph: ConstructControlGraph, id: string): ConstructControlGraph =>
  validateControlGraph({ ...graph, groups: graph.groups.filter((group) => group.id !== id),
    actions: graph.actions.filter((action) => action.group !== id) });

const defaultParameter = (spec: ActionSpec["parameters"][string]): number | string | boolean => {
  switch (spec.kind) { case "boolean": return false; case "enum": return spec.values[0]; case "number": return Math.max(spec.min, Math.min(spec.max, 0)); }
};
/** The workshop probe crosses the same parser boundary as a battle command. */
export function constructProbeCommand(graph: ConstructControlGraph, actionId: string,
  parameters?: Readonly<Record<string, number | string | boolean>>): ConstructCommand {
  const action = graph.actions.find((candidate) => candidate.id === actionId);
  if (!action) throw new Error(`cannot probe unknown construct action "${actionId}"`);
  const requestParameters = parameters ?? Object.fromEntries(Object.entries(action.parameters).map(([name, spec]) => [name, defaultParameter(spec)]));
  const command: ConstructCommand = Object.freeze({ version: CONSTRUCT_ACTION_VERSION, requests: Object.freeze([{
    request: Object.freeze({ action: action.id, parameters: requestParameters }), priority: 0, sourceIndex: 0,
  }]) });
  return validateConstructCommand(graph, command);
}
export function constructProbeCommands(graph: ConstructControlGraph, actionIds: readonly string[]): ConstructCommand {
  if (actionIds.length === 0) throw new Error("queue at least one installed action before probing");
  const requests = actionIds.map((id, sourceIndex) => {
    const action = graph.actions.find(({ id: candidate }) => candidate === id);
    if (!action) throw new Error(`cannot probe unknown construct action "${id}"`);
    return { request: { action: id, parameters: Object.fromEntries(Object.entries(action.parameters)
      .map(([name, spec]) => [name, defaultParameter(spec)])) }, priority: 0, sourceIndex };
  });
  return validateConstructCommand(graph, { version: CONSTRUCT_ACTION_VERSION, requests });
}

const parameterMarkup = (parameters: Readonly<Record<string, ParameterSpec>>): string => Object.entries(parameters)
  .map(([name, spec]) => `<fieldset class="workshop-parameter" data-workshop-parameter="${escapeHtml(name)}"><legend>${escapeHtml(name)}</legend>` +
    `<label>Controller-owned kind<select data-parameter-kind disabled><option ${spec.kind === "number" ? "selected" : ""}>number</option>` +
    `<option ${spec.kind === "enum" ? "selected" : ""}>enum</option><option ${spec.kind === "boolean" ? "selected" : ""}>boolean</option></select></label>` +
    (spec.kind === "number" ? `<label>Minimum<input type="number" step="any" data-parameter-min value="${spec.min}"></label>` +
      `<label>Maximum<input type="number" step="any" data-parameter-max value="${spec.max}"></label>` +
      `<label>Unit<select data-parameter-unit>${UNITS.map((unit) => `<option ${unit === spec.unit ? "selected" : ""}>${unit}</option>`).join("")}</select></label>`
      : spec.kind === "enum" ? `<label>Choices (comma separated)<input data-parameter-values value="${escapeHtml(spec.values.join(", "))}"></label>` : "") +
    `</fieldset>`).join("");
const bindingSummary = (group: ControlGroupSpec): string => Object.entries(group.bindings)
  .map(([role, row]) => `${escapeHtml(role)} (${row.joints.length}j/${row.modules.length}m)`).join(", ") || "none";

export function controlEditorMarkup(graph: ConstructControlGraph, availableJoints: readonly string[], availableModules: readonly string[],
  refusal: string | null = null, selectedGroup = graph.groups[0]?.id ?? "", selectedController = "",
  draftBindings: ControlGroupSpec["bindings"] = {}, actionParameters: Readonly<Record<string, ParameterSpec>> = {},
  blueprint?: ConstructBlueprint, queuedActions: readonly string[] = [], orderedJoints: readonly string[] = []): string {
  const group = graph.groups.find(({ id }) => id === selectedGroup) ?? graph.groups[0];
  const descriptors = group ? controllerChoicesForSelection(group, blueprint) : [];
  const picked = descriptors.find(({ controller }) => controller === selectedController) ?? descriptors[0];
  const groupRows = graph.groups.map((row) => `<article class="workshop-card"><h3>${escapeHtml(row.id)}</h3>` +
    `<p><b>Joints:</b> ${row.joints.map(escapeHtml).join(", ") || "none"}</p><p><b>Modules:</b> ${row.modules.map(escapeHtml).join(", ") || "none"}</p>` +
    `<p><b>Bindings:</b> ${bindingSummary(row)}</p><button type="button" data-workshop-action="edit-group" data-group="${escapeHtml(row.id)}">Edit group</button> ` +
    `<button type="button" data-workshop-action="delete-group" data-group="${escapeHtml(row.id)}">Delete group and its actions</button></article>`).join("");
  const actionRows = graph.actions.map((action) => `<article class="workshop-card"><h3>${escapeHtml(action.id)}</h3>` +
    `<p>${escapeHtml(action.controller)} -&gt; <b>${escapeHtml(action.group)}</b></p><p>Claims: ${action.claims.map(escapeHtml).join(", ") || "none"}</p>` +
    `<button type="button" data-workshop-action="edit-action" data-action="${escapeHtml(action.id)}">Edit</button> ` +
    `<button type="button" data-workshop-action="delete-action" data-action="${escapeHtml(action.id)}">Delete</button> ` +
    `<button type="button" data-workshop-action="queue" data-action="${escapeHtml(action.id)}">Add to probe queue</button> ` +
    `<button type="button" data-workshop-action="probe" data-action="${escapeHtml(action.id)}">Probe exact command</button></article>`).join("");
  const roleRows = Object.entries(draftBindings).map(([role, row]) => `<li><b>${escapeHtml(role)}</b> -- ` +
    `${row.joints.map(escapeHtml).join(", ") || "no joints"}; ${row.modules.map(escapeHtml).join(", ") || "no modules"} ` +
    `<button type="button" data-workshop-action="delete-binding" data-role="${escapeHtml(role)}">Remove binding</button></li>`).join("");
  return `<section class="action-workshop" aria-label="Action Workshop"><header><p class="forge-kicker">Action Workshop</p><h2>Turn hardware into reusable skills</h2></header>
    <p class="forge-refusal" role="alert" ${refusal ? "" : "hidden"}>${escapeHtml(refusal ?? "")}</p><div class="workshop-grid"><section><h2>1 -- Groups</h2>${groupRows || "<p>No groups yet.</p>"}
      <fieldset><legend>Create or replace a group</legend>${availableJoints.map((id) => `<label><input type="checkbox" data-workshop-joint value="${escapeHtml(id)}">${escapeHtml(id)}</label>`).join("")}
        ${availableModules.map((id) => `<label><input type="checkbox" data-workshop-module value="${escapeHtml(id)}">${escapeHtml(id)}</label>`).join("")}
        <label>Group ID<input data-workshop-group-id pattern="[a-z][a-z0-9-]{0,47}"></label><fieldset><legend>Bind a controller role to selected hardware</legend>
          <label>Role name<input data-workshop-role-id pattern="[a-z][a-z0-9-]{0,47}"></label><p class="forge-muted">Check the role's joints and modules above, then add the role. Ordered joint selection is preserved.</p>
          <output data-workshop-joint-order>Joint click order: ${escapeHtml(orderedJoints.join(" -> ") || "none")}</output>
          <button type="button" data-workshop-action="add-binding">Add role binding</button><ul>${roleRows || "<li>No role bindings yet.</li>"}</ul></fieldset>
        <button type="button" data-workshop-action="add-group">Create or replace valid group</button></fieldset></section>
      <section><h2>2 -- Actions</h2><label>Group<select data-workshop-action-group>${graph.groups.map((row) => `<option value="${escapeHtml(row.id)}" ${row.id === group?.id ? "selected" : ""}>${escapeHtml(row.id)}</option>`).join("")}</select></label>
        <label>Compatible controller template<select data-workshop-controller>${descriptors.map((row) => `<option value="${escapeHtml(row.controller)}" ${row.controller === picked?.controller ? "selected" : ""}>${escapeHtml(row.controller)} -- ${escapeHtml(row.role)}</option>`).join("")}</select></label>
        <p class="forge-muted">${picked ? `Requires ${picked.bindings.map((row) => `${escapeHtml(row.role)}: ${row.joints}j/${row.modules}m`).join(", ") || "no named roles"}.` : "Select a compatible group."}</p>
        <label>Action ID<input data-workshop-action-id pattern="[a-z][a-z0-9-]{0,47}"></label><label>Claims (comma separated module: or resource:)<input data-workshop-claims placeholder="resource:balance"></label>
        <div data-workshop-parameters><h3>Saved parameter descriptors</h3>${parameterMarkup(actionParameters)}</div><label>Extra parameter name<input data-workshop-extra-parameter pattern="[a-z][a-z0-9-]{0,47}"></label>
        <button type="button" data-workshop-action="add-parameter">Add numeric parameter</button> <button type="button" data-workshop-action="add-action">Create or replace valid action</button>${actionRows || "<p>No actions yet.</p>"}</section>
      <section><h2>3 -- Live test</h2><p>Probe requests enter the public <code>ConstructCommand</code> path. Queue several actions to inspect arbitration and refusal together. No motor handle is exposed.</p>
        <output data-workshop-queue>${escapeHtml(queuedActions.join(" + ") || "Queue is empty")}</output>
        <button type="button" data-workshop-action="probe-queue">Probe queued requests together</button>
        <button type="button" data-workshop-action="clear-queue">Clear queue</button>
        <output data-workshop-probe>Choose an installed action.</output><button type="button" data-workshop-action="reset">Reset preview to bind pose</button></section></div></section>`;
}

export class ControlEditor {
  private readonly host: HTMLElement; private readonly options: ControlEditorOptions; private graphValue: ConstructControlGraph;
  private refusal: string | null = null; private selectedGroup = ""; private selectedController = "";
  private bindingDraft: Record<string, { joints: readonly string[]; modules: readonly string[] }> = {};
  private parameterDraft: Record<string, ParameterSpec> = {};
  private jointOrder: string[] = []; private probeQueue: string[] = [];
  constructor(host: HTMLElement, options: ControlEditorOptions) {
    this.host = host; this.options = options; this.graphValue = validateControlGraph(options.graph); this.selectedGroup = this.graphValue.groups[0]?.id ?? ""; this.seedController();
    host.addEventListener("click", this.onClick); host.addEventListener("change", this.onChange); this.render();
  }
  get graph(): ConstructControlGraph { return this.graphValue; }
  dispose(): void { this.host.removeEventListener("click", this.onClick); this.host.removeEventListener("change", this.onChange); this.host.innerHTML = ""; }
  addGroup(group: ControlGroupSpec): boolean { return this.commit(() => replaceControlGroup(this.graphValue, group, this.options.blueprint)); }
  addAction(action: ActionDraft): boolean { return this.commit(() => replaceControlAction(this.graphValue, action, this.options.blueprint)); }
  probe(actionId: string, parameters?: Readonly<Record<string, number | string | boolean>>): ConstructCommand | null {
    try { const command = constructProbeCommand(this.graphValue, actionId, parameters); this.refusal = null; this.options.onProbe?.(command); this.render(); return command; }
    catch (error) { this.fail(error); return null; }
  }
  probeQueued(): ConstructCommand | null { try { const command = constructProbeCommands(this.graphValue, this.probeQueue);
    this.refusal = null; this.options.onProbe?.(command); this.render(); return command; }
    catch (error) { this.fail(error); return null; } }
  private commit(operation: () => ConstructControlGraph): boolean { try { this.graphValue = operation(); this.refusal = null; this.options.onChange?.(this.graphValue); this.render(); return true; }
    catch (error) { this.fail(error); return false; } }
  private fail(error: unknown): void { this.refusal = error instanceof Error ? error.message : String(error); this.render(); }
  private currentGroup(): ControlGroupSpec | undefined { return this.graphValue.groups.find(({ id }) => id === this.selectedGroup); }
  private seedController(controller?: string): void { const group = this.currentGroup(); const choices = group ? controllerChoicesForSelection(group, this.options.blueprint) : [];
    const row = choices.find((candidate) => candidate.controller === controller) ?? choices[0]; this.selectedController = row?.controller ?? "";
    this.parameterDraft = row && group ? { ...actionParametersForDescriptor(row, group) } : {}; }
  private render(): void { this.host.innerHTML = controlEditorMarkup(this.graphValue, this.options.availableJoints, this.options.availableModules,
    this.refusal, this.selectedGroup, this.selectedController, this.bindingDraft, this.parameterDraft, this.options.blueprint, this.probeQueue, this.jointOrder); }
  private checked(selector: string): string[] { const checked = [...this.host.querySelectorAll<HTMLInputElement>(selector)].filter((input) => input.checked).map((input) => input.value);
    return selector.includes("joint") ? this.jointOrder.filter((id) => checked.includes(id)) : checked; }
  private readParameters(): Record<string, ParameterSpec> { const result: Record<string, ParameterSpec> = {};
    for (const field of this.host.querySelectorAll<HTMLElement>("[data-workshop-parameter]")) { const name = field.dataset.workshopParameter ?? "";
      const kind = field.querySelector<HTMLSelectElement>("[data-parameter-kind]")?.value;
      if (kind === "boolean") result[name] = { kind }; else if (kind === "enum") result[name] = { kind, values: (field.querySelector<HTMLInputElement>("[data-parameter-values]")?.value ?? "").split(",").map((value) => value.trim()).filter(Boolean) };
      else result[name] = { kind: "number", min: Number(field.querySelector<HTMLInputElement>("[data-parameter-min]")?.value), max: Number(field.querySelector<HTMLInputElement>("[data-parameter-max]")?.value),
        unit: (field.querySelector<HTMLSelectElement>("[data-parameter-unit]")?.value ?? "scalar") as QuantityUnit }; }
    return result; }
  private readonly onClick = (event: Event): void => { const button = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>("button[data-workshop-action]"); if (!button) return;
    const action = button.dataset.workshopAction;
    if (action === "probe") { this.probe(button.dataset.action ?? ""); return; }
    if (action === "queue") { this.probeQueue = [...this.probeQueue, button.dataset.action ?? ""]; this.render(); return; }
    if (action === "probe-queue") { this.probeQueued(); return; }
    if (action === "clear-queue") { this.probeQueue = []; this.render(); return; }
    if (action === "delete-action") { this.commit(() => removeControlAction(this.graphValue, button.dataset.action ?? "")); return; }
    if (action === "delete-group") { this.commit(() => removeControlGroup(this.graphValue, button.dataset.group ?? ""));
      this.selectedGroup = this.graphValue.groups[0]?.id ?? ""; this.seedController(); this.render(); return; }
    if (action === "delete-binding") { const role = button.dataset.role ?? ""; const remaining = { ...this.bindingDraft };
      delete remaining[role]; this.bindingDraft = remaining; this.render(); return; }
    if (action === "reset") { if (this.options.onReset) this.options.onReset(); else this.fail("Action Workshop reset is unavailable: no preview reset handler is installed"); return; }
    if (action === "edit-group") { const group = this.graphValue.groups.find(({ id }) => id === button.dataset.group); if (!group) return;
      this.bindingDraft = { ...group.bindings }; this.selectedGroup = group.id; this.jointOrder = [...group.joints]; this.render(); const id = this.host.querySelector<HTMLInputElement>("[data-workshop-group-id]"); if (id) id.value = group.id;
      for (const selector of ["joint", "module"] as const) for (const input of this.host.querySelectorAll<HTMLInputElement>(`[data-workshop-${selector}]`)) input.checked = group[`${selector}s`].includes(input.value); return; }
    if (action === "add-binding") { const role = this.host.querySelector<HTMLInputElement>("[data-workshop-role-id]")?.value ?? "";
      const joints = this.checked("[data-workshop-joint]"); const modules = this.checked("[data-workshop-module]"); this.bindingDraft = { ...this.bindingDraft, [role]: { joints, modules } };
      const allJoints = [...new Set(Object.values(this.bindingDraft).flatMap((binding) => binding.joints))];
      const allModules = [...new Set(Object.values(this.bindingDraft).flatMap((binding) => binding.modules))];
      try { replaceControlGroup(this.graphValue, { id: "draft", joints: allJoints, modules: allModules, bindings: this.bindingDraft }, this.options.blueprint); this.refusal = null; this.render(); } catch (error) { this.fail(error); } return; }
    if (action === "add-group") { const id = this.host.querySelector<HTMLInputElement>("[data-workshop-group-id]")?.value ?? "";
      const group = { id,
        joints: [...new Set([...Object.values(this.bindingDraft).flatMap((binding) => binding.joints), ...this.checked("[data-workshop-joint]")])],
        modules: [...new Set([...Object.values(this.bindingDraft).flatMap((binding) => binding.modules), ...this.checked("[data-workshop-module]")])],
        bindings: this.bindingDraft };
      if (this.addGroup(group)) { this.selectedGroup = id; this.bindingDraft = {}; this.seedController(); this.render(); } return; }
    if (action === "add-parameter") { const name = this.host.querySelector<HTMLInputElement>("[data-workshop-extra-parameter]")?.value ?? "";
      this.parameterDraft = { ...this.readParameters(), [name]: { kind: "number", min: -1, max: 1, unit: "scalar" } }; this.render(); return; }
    if (action === "edit-action") { const row = this.graphValue.actions.find(({ id }) => id === button.dataset.action); if (!row) return;
      this.selectedGroup = row.group; this.seedController(row.controller); this.parameterDraft = { ...row.parameters }; this.render(); const id = this.host.querySelector<HTMLInputElement>("[data-workshop-action-id]"); if (id) id.value = row.id;
      const claims = this.host.querySelector<HTMLInputElement>("[data-workshop-claims]"); if (claims) claims.value = row.claims.join(", "); return; }
    if (action === "add-action") { const id = this.host.querySelector<HTMLInputElement>("[data-workshop-action-id]")?.value ?? "";
      const claims = (this.host.querySelector<HTMLInputElement>("[data-workshop-claims]")?.value ?? "").split(",").map((row) => row.trim()).filter(Boolean);
      this.addAction({ id, controller: this.selectedController, group: this.selectedGroup, claims, parameters: this.readParameters() }); }
  };
  private readonly onChange = (event: Event): void => { const target = event.target as HTMLSelectElement | null;
    if (target instanceof HTMLInputElement && target.matches("[data-workshop-joint]")) {
      this.jointOrder = [...updateOrderedSelection(this.jointOrder, target.value, target.checked)];
      const output = this.host.querySelector<HTMLOutputElement>("[data-workshop-joint-order]");
      if (output) output.value = `Joint click order: ${this.jointOrder.join(" -> ") || "none"}`;
      return;
    }
    if (target?.matches("[data-workshop-action-group]")) { this.selectedGroup = target.value; this.seedController(); this.render(); return; }
    if (target?.matches("[data-workshop-controller]")) { this.seedController(target.value); const group = this.currentGroup(); if (group) this.options.onControllerPick?.(descriptor(this.selectedController, group, this.options.blueprint)); this.render(); }
  };
}
