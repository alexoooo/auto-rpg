import type { ConstructControlGraph } from "../construct/actions.ts";
import type { ConstructBlueprint, JointSpec, PartSpec, SocketSpec } from "../construct/blueprint.ts";
import { parseSavedConstruct, saveConstruct, type SavedConstruct } from "../construct/codec.ts";
import type { ConstructProgram } from "../construct/program.ts";
import type { SensorSpec } from "../construct/sensors.ts";
import { canonicalBlueprintJson } from "../construct/canonical.ts";
import { CONNECTED_PART_CATALOG, MODULE_CATALOG, MODULE_SOCKET_CATALOG, PART_CATALOG, instantiateConnectedPart,
  instantiateTwoAxisMount, partAttachmentSockets, type PartAttachmentSocketId } from "./catalog.ts";
import { ForgeHistory, reduceForge, type ForgeCommand, type ForgeResult } from "./model.ts";
import { reconcileForgeArtifact } from "./reconcile.ts";

export interface ForgePreviewHandle { dispose(): void; }

export interface ForgePublication {
  readonly kind: "apply" | "undo" | "redo" | "import";
  readonly blueprint: ConstructBlueprint;
  readonly control: ConstructControlGraph;
  readonly program: ConstructProgram;
  readonly command?: ForgeCommand;
  readonly saved?: SavedConstruct;
}

/** The Forge owns rollback around host publication just as it owns preview rollback. */
export interface ForgePublisher {
  capture(): unknown;
  publish(publication: ForgePublication): void;
  rollback(checkpoint: unknown): void;
}

export interface ForgeScreenOptions {
  readonly blueprint: ConstructBlueprint;
  readonly control: ConstructControlGraph;
  readonly program: ConstructProgram;
  readonly sensors: readonly SensorSpec[];
  readonly name?: string;
  readonly preview?: (blueprint: ConstructBlueprint) => ForgePreviewHandle;
  readonly onSaved?: (saved: SavedConstruct) => void;
  readonly publisher?: ForgePublisher;
  readonly onSection?: (section: "body" | "actions" | "mind" | "lab") => void;
}

const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[character] as string);

const oppositeAttachment: Readonly<Record<PartAttachmentSocketId, PartAttachmentSocketId>> = Object.freeze({
  top: "bottom", bottom: "top", left: "right", right: "left", front: "rear", rear: "front",
});
const sameFrame = (left: JointSpec["parentFrame"], right: JointSpec["parentFrame"]): boolean =>
  left.positionM.every((value, index) => value === right.positionM[index]) &&
  left.rotation.every((value, index) => value === right.rotation[index]);
const attachmentOccupied = (blueprint: ConstructBlueprint, part: string,
  frame: JointSpec["parentFrame"]): boolean => blueprint.joints.some((joint) =>
  (joint.parentPart === part && sameFrame(joint.parentFrame, frame)) ||
  (joint.childPart === part && sameFrame(joint.childFrame, frame)));

const freshId = (base: string, known: ReadonlySet<string>): string => {
  const stem = base.replace(/[^a-z0-9-]/g, "-").replace(/^-+/, "").slice(0, 38) || "part";
  if (!known.has(stem)) return stem;
  for (let index = 2; index < 10000; index += 1) {
    const candidate = `${stem}-${index}`.slice(0, 48);
    if (!known.has(candidate)) return candidate;
  }
  throw new Error(`cannot allocate another stable ID from "${base}"`);
};

export function forgeTreeMarkup(blueprint: ConstructBlueprint, selectedPart: string): string {
  const children = new Map<string, string[]>();
  for (const joint of blueprint.joints) {
    const rows = children.get(joint.parentPart) ?? [];
    rows.push(joint.childPart);
    children.set(joint.parentPart, rows);
  }
  const row = (id: string, depth: number): string => {
    const part = blueprint.parts.find((candidate) => candidate.id === id);
    if (!part) return "";
    return `<li style="--forge-depth:${depth}"><button type="button" data-forge-action="select-part" ` +
      `data-part="${escapeHtml(id)}" aria-pressed="${id === selectedPart}">${escapeHtml(id)}</button>` +
      `<span>${escapeHtml(part.shape.kind)} -- ${part.massKg.toFixed(1)} kg</span></li>` +
      (children.get(id) ?? []).sort().map((child) => row(child, depth + 1)).join("");
  };
  return `<ol class="forge-tree">${row(blueprint.rootPart, 0)}</ol>`;
}

/** Presentation precision only; authoritative values remain untouched in the blueprint. */
export const formatCombatValue = (value: number): string => Number(value.toFixed(2)).toString();
const durabilityRange = (rows: readonly Readonly<{ health: number }>[]): string => {
  if (rows.length === 0) return "none";
  const values = rows.map(({ health }) => health);
  const low = Math.min(...values); const high = Math.max(...values);
  return low === high ? formatCombatValue(low) : `${formatCombatValue(low)}-${formatCombatValue(high)}`;
};
const armourRange = (blueprint: ConstructBlueprint): string => {
  const values = [...blueprint.parts, ...blueprint.joints, ...blueprint.modules].map(({ armour }) => armour);
  const low = Math.min(...values); const high = Math.max(...values);
  return low === high ? formatCombatValue(low) : `${formatCombatValue(low)}-${formatCombatValue(high)}`;
};

export function forgeScreenMarkup(
  blueprint: ConstructBlueprint,
  selectedPart: string,
  selectedSocket: string | null,
  refusal: string | null,
  name: string,
  selectedAttachment: PartAttachmentSocketId = "top",
): string {
  const selected = blueprint.parts.find((part) => part.id === selectedPart) ?? blueprint.parts[0];
  const dimensions = selected.shape.kind === "box"
    ? `<fieldset class="forge-dimensions"><legend>Selected box dimensions (m)</legend>${selected.shape.sizeM.map((value, index) =>
      `<label>${["Width", "Height", "Depth"][index]}<input type="number" min="0.01" step="0.01" ` +
      `data-forge-dimension="${index}" value="${value}"></label>`).join("")}` +
      `<button type="button" data-forge-action="resize-selected">Apply dimensions</button></fieldset>`
    : `<p class="forge-muted">${escapeHtml(selected.id)} uses fixed ${selected.shape.kind} dimensions.</p>`;
  const sockets = blueprint.sockets.map((socket) => `<button type="button" data-forge-action="select-socket" ` +
    `data-socket="${escapeHtml(socket.id)}" aria-pressed="${socket.id === selectedSocket}">${escapeHtml(socket.id)} ` +
    `<small>${socket.accepts.map(escapeHtml).join(", ")}</small></button>`).join("");
  const mounted = blueprint.modules.map((module) => `<li>${escapeHtml(module.id)} <small>${escapeHtml(module.kind)}</small> ` +
    `<button type="button" data-forge-action="unmount-module" data-module="${escapeHtml(module.id)}">Unmount</button></li>`).join("");
  const totalMass = blueprint.parts.reduce((sum, part) => sum + part.massKg, 0);
  const attachmentSockets = partAttachmentSockets(selected).map((socket) => {
    const occupied = attachmentOccupied(blueprint, selected.id, socket.frame);
    return `<button type="button" data-forge-action="select-part-socket" data-part-socket="${socket.id}" ` +
      `aria-pressed="${socket.id === selectedAttachment}" ${occupied ? "disabled" : ""}>${socket.id} -- structural${occupied ? " (occupied)" : ""}</button>`;
  }).join("");
  return `<section class="construct-forge" aria-label="Construct Forge">
    <header><div><p class="forge-kicker">Construct Forge</p><h1>Build the body, then program it</h1></div>
      <nav aria-label="Forge sections"><button type="button" data-forge-tab="body" aria-current="page">Body</button>
      <button type="button" data-forge-tab="actions">Actions</button><button type="button" data-forge-tab="mind">Mind</button>
      <button type="button" data-forge-tab="lab">Lab</button></nav></header>
    <div class="forge-toolbar"><button type="button" data-forge-action="undo">Undo</button>
      <button type="button" data-forge-action="redo">Redo</button>
      <label>Name <input data-forge-name value="${escapeHtml(name)}"></label>
      <button type="button" data-forge-action="save">Save</button>
      <button type="button" data-forge-action="export">Export file</button>
      <label class="forge-file">Import file<input type="file" accept="application/json,.json" data-forge-import></label></div>
    <p class="forge-refusal" role="alert" ${refusal ? "" : "hidden"}>${escapeHtml(refusal ?? "")}</p>
    <div class="forge-grid"><aside><h2>Code-native parts</h2><div class="forge-catalog">${PART_CATALOG.map((entry) =>
      `<button type="button" data-forge-action="attach-part" data-catalog="${entry.id}"><b>${escapeHtml(entry.label)}</b>` +
      `<small>${escapeHtml(entry.shape.kind)} -- ${entry.massKg} kg -- ${escapeHtml(entry.shell.style)}</small></button>`).join("")}</div>
      <h2>Connected limb fragments</h2><div class="forge-catalog">${CONNECTED_PART_CATALOG.map((entry) =>
      `<button type="button" data-forge-action="attach-connected-part" data-catalog="${entry.id}"><b>${escapeHtml(entry.label)}</b>` +
      `<small>4 ordered joints -- declared foot socket -- exact Warden template</small></button>`).join("")}</div>
      <h2>Joint templates</h2><div class="forge-catalog"><button type="button" data-forge-action="attach-two-axis-mount"><b>Yaw + pitch tool mount</b>
        <small>declared y-axis bearing, x-axis bearing and dorsal output socket</small></button></div>
      <h2>Module socket templates</h2><div class="forge-catalog">${MODULE_SOCKET_CATALOG.map((entry) =>
        `<button type="button" data-forge-action="add-module-socket" data-catalog="${entry.id}"><b>${escapeHtml(entry.label)}</b>` +
        `<small>${entry.accepts.map(escapeHtml).join(", ")}</small></button>`).join("")}</div>
      <h2>Modules</h2><div class="forge-catalog">${MODULE_CATALOG.map((entry) =>
      `<button type="button" data-forge-action="mount-module" data-catalog="${entry.id}"><b>${escapeHtml(entry.label)}</b>` +
      `<small>${escapeHtml(entry.module.compatibilityTag)}</small></button>`).join("")}</div></aside>
      <main><h2>Connected body tree</h2>${forgeTreeMarkup(blueprint, selected.id)}${dimensions}
        <h2>Declared part attachment sockets</h2><div class="forge-sockets">${attachmentSockets}</div>
        <button type="button" data-forge-action="remove-selected" ${selected.id === blueprint.rootPart ? "disabled" : ""}>Remove subtree</button></main>
      <aside><h2>Snap sockets</h2><div class="forge-sockets">${sockets || "<p>No module sockets.</p>"}</div>
        <h2>Installed modules</h2><ul>${mounted || "<li>None</li>"}</ul>
        <dl class="forge-summary"><dt>Parts</dt><dd>${blueprint.parts.length}</dd><dt>Mass</dt><dd>${totalMass.toFixed(1)} kg</dd>
          <dt>Part durability</dt><dd>${durabilityRange(blueprint.parts)}</dd>
          <dt>Joint durability</dt><dd>${durabilityRange(blueprint.joints)}</dd>
          <dt>Module durability</dt><dd>${durabilityRange(blueprint.modules)}</dd>
          <dt>Armour</dt><dd>${armourRange(blueprint)}</dd>
          <dt>Blueprint</dt><dd><code>${canonicalBlueprintJson(blueprint).length} bytes</code></dd></dl></aside>
      <section class="forge-preview" aria-label="Transactional 3D preview"><div data-forge-preview></div>
        <p>Preview keeps the last valid machine when an edit or rebuild is refused.</p></section></div>
  </section>`;
}

export class ForgeScreen {
  private readonly host: HTMLElement;
  private readonly options: ForgeScreenOptions;
  private history: ForgeHistory;
  private control: ConstructControlGraph;
  private program: ConstructProgram;
  private sensors: readonly SensorSpec[];
  private name: string;
  private selectedPart: string;
  private selectedSocket: string | null = null;
  private selectedAttachment: PartAttachmentSocketId = "top";
  private refusal: string | null = null;
  private preview: ForgePreviewHandle | null = null;
  private artifactPast: { control: ConstructControlGraph; program: ConstructProgram }[] = [];
  private artifactFuture: { control: ConstructControlGraph; program: ConstructProgram }[] = [];

  constructor(host: HTMLElement, options: ForgeScreenOptions) {
    this.host = host;
    this.options = options;
    this.history = new ForgeHistory(options.blueprint);
    this.control = options.control;
    this.program = options.program;
    this.sensors = options.sensors;
    this.name = options.name ?? options.blueprint.id;
    this.selectedPart = options.blueprint.rootPart;
    host.addEventListener("click", this.onClick);
    host.addEventListener("change", this.onChange);
    this.rebuildPreview(options.blueprint);
    this.render();
  }

  get blueprint(): ConstructBlueprint { return this.history.blueprint; }

  /** Rebuild the current canonical body at bind pose; Action Workshop owns the button. */
  resetPreview(): void { this.rebuildPreview(this.blueprint); this.render(); }
  /** Remove the inert preview while a battle-equivalent physical probe owns the same arena space. */
  suspendPreview(): void { this.preview?.dispose(); this.preview = null; }

  /** Keep the saved artifact exact when the sibling Action Workshop changes it. */
  setControl(control: ConstructControlGraph): void { this.control = control; }

  /** Keep the saved artifact exact when the sibling Mind Workshop changes it. */
  setProgram(program: ConstructProgram): void { this.program = program; }

  dispose(): void {
    this.host.removeEventListener("click", this.onClick);
    this.host.removeEventListener("change", this.onChange);
    this.preview?.dispose();
    this.preview = null;
    this.host.innerHTML = "";
  }

  apply(command: ForgeCommand): ForgeResult {
    const candidate = reduceForge(this.history.blueprint, command);
    if (candidate.refusal) {
      this.refusal = candidate.refusal;
      this.render();
      return candidate;
    }
    let candidatePreview: ForgePreviewHandle | null = null;
    let candidateControl = this.control; let candidateProgram = this.program;
    if (command.kind === "unmount-module" || command.kind === "remove-subtree") {
      try {
        const reconciled = reconcileForgeArtifact(candidate.blueprint, this.control, this.program, this.sensors);
        candidateControl = reconciled.control; candidateProgram = reconciled.program;
      } catch (error) {
        this.refusal = error instanceof Error ? error.message : String(error); this.render();
        return Object.freeze({ blueprint: this.history.blueprint, refusal: this.refusal });
      }
    }
    try { candidatePreview = this.options.preview?.(candidate.blueprint) ?? null; }
    catch (error) {
      this.refusal = error instanceof Error ? error.message : String(error);
      this.render();
      return Object.freeze({ blueprint: this.history.blueprint, refusal: this.refusal });
    }
    try {
      this.publish({ kind: "apply", blueprint: candidate.blueprint, control: candidateControl,
        program: candidateProgram, command });
    } catch (error) {
      candidatePreview?.dispose();
      this.refusal = error instanceof Error ? error.message : String(error);
      this.render();
      return Object.freeze({ blueprint: this.history.blueprint, refusal: this.refusal });
    }
    const result = this.history.apply(command);
    this.artifactPast.push({ control: this.control, program: this.program }); this.artifactFuture = [];
    this.control = candidateControl; this.program = candidateProgram;
    this.preview?.dispose();
    this.preview = candidatePreview;
    this.refusal = null;
    if (!result.blueprint.parts.some((part) => part.id === this.selectedPart)) {
      this.selectedPart = result.blueprint.rootPart;
    }
    this.render();
    return result;
  }

  undo(): void { this.navigate("undo"); }
  redo(): void { this.navigate("redo"); }

  importText(text: string): SavedConstruct | null {
    const previous = { history: this.history, control: this.control, program: this.program, name: this.name,
      selectedPart: this.selectedPart, selectedSocket: this.selectedSocket, preview: this.preview,
      artifactPast: this.artifactPast, artifactFuture: this.artifactFuture };
    let candidatePreview: ForgePreviewHandle | null = null;
    try {
      const saved = parseSavedConstruct(text, this.sensors);
      const candidateHistory = new ForgeHistory(saved.blueprint);
      candidatePreview = this.options.preview?.(saved.blueprint) ?? null;
      // Host publication is part of the transaction. A refusal here must occur
      // before the old preview or any editor-owned state is discarded.
      this.publish({ kind: "import", blueprint: saved.blueprint, control: saved.control,
        program: saved.program, saved });
      this.preview = candidatePreview;
      this.history = candidateHistory;
      this.artifactPast = []; this.artifactFuture = [];
      this.control = saved.control;
      this.program = saved.program;
      this.name = saved.name;
      this.selectedPart = saved.blueprint.rootPart;
      this.selectedSocket = null;
      this.refusal = null;
      previous.preview?.dispose();
      this.render();
      return saved;
    } catch (error) {
      candidatePreview?.dispose();
      this.history = previous.history; this.control = previous.control; this.program = previous.program;
      this.name = previous.name; this.selectedPart = previous.selectedPart; this.selectedSocket = previous.selectedSocket;
      this.preview = previous.preview;
      this.artifactPast = previous.artifactPast; this.artifactFuture = previous.artifactFuture;
      this.refusal = error instanceof Error ? error.message : String(error);
      this.render();
      return null;
    }
  }

  private navigate(direction: "undo" | "redo"): void {
    const candidate = direction === "undo" ? this.history.peekUndo() : this.history.peekRedo();
    if (candidate === this.blueprint) { this.refusal = null; this.render(); return; }
    let candidatePreview: ForgePreviewHandle | null = null;
    const artifact = direction === "undo" ? this.artifactPast.at(-1) : this.artifactFuture.at(-1);
    if (!artifact) { this.refusal = null; this.render(); return; }
    try {
      candidatePreview = this.options.preview?.(candidate) ?? null;
      this.publish({ kind: direction, blueprint: candidate, control: artifact.control, program: artifact.program });
      direction === "undo" ? this.history.undo() : this.history.redo();
      if (direction === "undo") {
        this.artifactPast.pop(); this.artifactFuture.push({ control: this.control, program: this.program });
      } else {
        this.artifactFuture.pop(); this.artifactPast.push({ control: this.control, program: this.program });
      }
      this.control = artifact.control; this.program = artifact.program;
      this.preview?.dispose();
      this.preview = candidatePreview;
      this.refusal = null;
    } catch (error) {
      candidatePreview?.dispose();
      this.refusal = error instanceof Error ? error.message : String(error);
    }
    this.render();
  }

  private render(): void {
    this.host.innerHTML = forgeScreenMarkup(this.blueprint, this.selectedPart, this.selectedSocket, this.refusal, this.name, this.selectedAttachment);
  }

  private publish(publication: ForgePublication): void {
    const publisher = this.options.publisher;
    if (!publisher) return;
    const checkpoint = publisher.capture();
    try { publisher.publish(Object.freeze(publication)); }
    catch (error) {
      try { publisher.rollback(checkpoint); }
      catch (rollbackError) {
        throw new Error(`host publication refused (${error instanceof Error ? error.message : String(error)}); ` +
          `host rollback also refused (${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)})`);
      }
      throw error;
    }
  }

  private rebuildPreview(blueprint: ConstructBlueprint): void {
    if (!this.options.preview) return;
    try {
      const candidate = this.options.preview(blueprint);
      this.preview?.dispose();
      this.preview = candidate;
    } catch (error) {
      this.refusal = error instanceof Error ? error.message : String(error);
    }
  }

  private attach(catalogId: string): void {
    const entry = PART_CATALOG.find((candidate) => candidate.id === catalogId);
    const parent = this.blueprint.parts.find((candidate) => candidate.id === this.selectedPart);
    if (!entry || !parent) { this.refusal = `cannot attach unknown catalog part "${catalogId}"`; this.render(); return; }
    const known = new Set(this.blueprint.parts.map((part) => part.id));
    const id = freshId(entry.id, known);
    const bodyPart: PartSpec = {
      id, shape: structuredClone(entry.shape), massKg: entry.massKg,
      centreOfMassM: [0, 0, 0], friction: 0.72, restitution: 0.05,
      health: 5, armour: 0.6, vitalityWeight: 0, fatal: false,
      shell: structuredClone(entry.shell),
    };
    const parentPoint = partAttachmentSockets(parent).find(({ id }) => id === this.selectedAttachment);
    const childPoint = partAttachmentSockets(bodyPart).find(({ id }) => id === oppositeAttachment[this.selectedAttachment]);
    if (!parentPoint || !childPoint || !parentPoint.accepts.includes(entry.attachmentTag)) {
      this.refusal = `part socket "${this.selectedAttachment}" is incompatible with "${entry.label}"`; this.render(); return;
    }
    const occupied = attachmentOccupied(this.blueprint, parent.id, parentPoint.frame);
    if (occupied) { this.refusal = `part socket "${parent.id}/${this.selectedAttachment}" is occupied`; this.render(); return; }
    const joint: JointSpec = {
      id: freshId(`join-${id}`, new Set(this.blueprint.joints.map((row) => row.id))),
      parentPart: parent.id, childPart: id,
      parentFrame: structuredClone(parentPoint.frame), childFrame: structuredClone(childPoint.frame),
      angularAxes: [{ id: "x", minRad: -0.75, maxRad: 0.75,
        damping: 4, maxTorqueNm: 100, maxSpeedRadS: 3 }],
      health: 5, armour: 0.6,
    };
    const result = this.apply({ kind: "attach-catalog-fragment", part: bodyPart, joint,
      parentSocket: parentPoint.id, childSocket: childPoint.id, attachmentTag: entry.attachmentTag });
    if (!result.refusal) this.selectedPart = id;
    this.render();
  }

  private attachConnected(catalogId: string): void {
    try {
      // A connected catalog row is a whole branch attached to the selected
      // parent. Keep that parent selected so the four Warden-corner buttons
      // can be used consecutively from the core. Moving selection into the
      // first new limb made the remaining three clicks silently nest branches.
      const fragment = instantiateConnectedPart(this.blueprint, catalogId, this.selectedPart);
      this.apply({ kind: "attach-connected-fragment", ...fragment });
      this.render();
    } catch (error) {
      this.refusal = error instanceof Error ? error.message : String(error);
      this.render();
    }
  }

  private attachTwoAxisMount(): void {
    try {
      const fragment = instantiateTwoAxisMount(this.blueprint, this.selectedPart, this.selectedAttachment);
      const result = this.apply({ kind: "attach-catalog-mount", parts: fragment.parts, joints: fragment.joints,
        sockets: fragment.sockets, parentSocket: this.selectedAttachment });
      if (!result.refusal) {
        this.selectedPart = fragment.parts[1].id;
        this.selectedSocket = fragment.outputSocket;
      }
      this.render();
    } catch (error) {
      this.refusal = error instanceof Error ? error.message : String(error); this.render();
    }
  }

  private addModuleSocket(catalogId: string): void {
    const entry = MODULE_SOCKET_CATALOG.find(({ id }) => id === catalogId);
    const part = this.blueprint.parts.find(({ id }) => id === this.selectedPart);
    const point = part && partAttachmentSockets(part).find(({ id }) => id === this.selectedAttachment);
    if (!entry || !part || !point) { this.refusal = `cannot add unknown module socket "${catalogId}"`; this.render(); return; }
    if (attachmentOccupied(this.blueprint, part.id, point.frame) || this.blueprint.sockets.some((socket) =>
      socket.part === part.id && sameFrame(socket.frame, point.frame))) {
      this.refusal = `attachment face "${part.id}/${this.selectedAttachment}" is occupied`; this.render(); return;
    }
    const id = freshId(`${part.id}-${entry.id}-socket`, new Set(this.blueprint.sockets.map((socket) => socket.id)));
    const socket: SocketSpec = { id, part: part.id, frame: structuredClone(point.frame), accepts: [...entry.accepts] };
    const result = this.apply({ kind: "add-socket", socket });
    if (!result.refusal) this.selectedSocket = id;
    this.render();
  }

  private mount(catalogId: string): void {
    const entry = MODULE_CATALOG.find((candidate) => candidate.id === catalogId);
    const socket = this.blueprint.sockets.find((candidate) => candidate.id === this.selectedSocket);
    if (!entry) { this.refusal = `unknown module catalog entry "${catalogId}"`; this.render(); return; }
    if (!socket) { this.refusal = `select a compatible socket before mounting "${entry.label}"`; this.render(); return; }
    const moduleId = freshId(entry.id, new Set(this.blueprint.modules.map((module) => module.id)));
    const template = structuredClone(entry.module);
    const module = template.kind === "contact-sensor"
      ? { ...template, sensorChannels: [`contact-${moduleId}`, `slip-${moduleId}`] }
      : template;
    this.apply({ kind: "mount-module", module: {
      ...module, id: moduleId, socket: socket.id,
    } });
  }

  private save(): SavedConstruct | null {
    try {
      const saved = saveConstruct(this.name, this.blueprint, this.control, this.program, this.sensors);
      if (!this.options.onSaved) {
        throw new Error("Forge Save is unavailable: no saved-library handler is installed");
      }
      this.refusal = null;
      this.options.onSaved(saved);
      return saved;
    } catch (error) {
      this.refusal = error instanceof Error ? error.message : String(error);
      this.render();
      return null;
    }
  }

  private download(): void {
    let saved: SavedConstruct;
    try { saved = saveConstruct(this.name, this.blueprint, this.control, this.program, this.sensors); }
    catch (error) { this.refusal = error instanceof Error ? error.message : String(error); this.render(); return; }
    const blob = new Blob([JSON.stringify(saved, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${saved.name.replace(/[^a-z0-9-]+/gi, "-").toLowerCase() || "construct"}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  private readonly onClick = (event: Event): void => {
    const target = event.target as HTMLElement | null;
    const tab = target?.closest<HTMLButtonElement>("button[data-forge-tab]");
    if (tab) {
      const section = tab.dataset.forgeTab;
      if (section !== "body" && section !== "actions" && section !== "mind" && section !== "lab") return;
      if (this.options.onSection) this.options.onSection(section);
      else { this.refusal = `Forge section "${section}" is unavailable: no screen host is installed`; this.render(); }
      return;
    }
    const button = target?.closest<HTMLButtonElement>("button[data-forge-action]");
    if (!button) return;
    const value = button.dataset;
    switch (value.forgeAction) {
      case "undo": this.undo(); return;
      case "redo": this.redo(); return;
      case "select-part": this.selectedPart = value.part ?? this.selectedPart; this.selectedAttachment = "top"; this.render(); return;
      case "select-part-socket": this.selectedAttachment = (value.partSocket ?? "top") as PartAttachmentSocketId; this.render(); return;
      case "select-socket": this.selectedSocket = value.socket ?? null; this.render(); return;
      case "attach-part": this.attach(value.catalog ?? ""); return;
      case "attach-connected-part": this.attachConnected(value.catalog ?? ""); return;
      case "attach-two-axis-mount": this.attachTwoAxisMount(); return;
      case "add-module-socket": this.addModuleSocket(value.catalog ?? ""); return;
      case "remove-selected": this.apply({ kind: "remove-subtree", part: this.selectedPart }); return;
      case "mount-module": this.mount(value.catalog ?? ""); return;
      case "unmount-module": this.apply({ kind: "unmount-module", module: value.module ?? "" }); return;
      case "resize-selected": {
        const inputs = [...this.host.querySelectorAll<HTMLInputElement>("[data-forge-dimension]")]
          .sort((a, b) => Number(a.dataset.forgeDimension) - Number(b.dataset.forgeDimension));
        if (inputs.length !== 3) return;
        this.apply({ kind: "resize-box", part: this.selectedPart,
          sizeM: [Number(inputs[0].value), Number(inputs[1].value), Number(inputs[2].value)] });
        return;
      }
      case "save": this.save(); this.render(); return;
      case "export": this.download(); return;
    }
  };

  private readonly onChange = (event: Event): void => {
    const target = event.target as HTMLInputElement | null;
    if (!target) return;
    if (target.matches("[data-forge-name]")) { this.name = target.value; return; }
    if (!target.matches("[data-forge-import]") || !target.files?.[0]) return;
    void target.files[0].text().then((text) => this.importText(text));
  };
}
