export interface ConstructLabEntry {
  readonly id: string;
  readonly label: string;
  readonly blueprintDigest: string;
  readonly controlDigest: string;
  readonly programDigest: string;
}

export interface ConstructLabRow {
  readonly job: number;
  readonly winner: "left" | "right" | "draw";
  readonly seed: number;
  readonly actionTrace: readonly string[];
  readonly refusals: readonly Readonly<{ id: string; reason: string }>[];
  readonly capabilityLosses: readonly Readonly<{ id: string; reason: string }>[];
  readonly limitation?: string | null;
  readonly stuck?: readonly Readonly<{
    side: "left" | "right";
    group: string;
    action: string;
    phase: string;
  }>[];
}

export interface ConstructLabSelection {
  readonly left: string;
  readonly right: string;
  readonly leftProgram: string;
  readonly rightProgram: string;
}

export interface ConstructLabOptions {
  readonly entries: readonly ConstructLabEntry[];
  readonly initialSelection?: ConstructLabSelection;
  readonly onVisibleBout?: (selection: ConstructLabSelection) => void | Promise<void | readonly ConstructLabRow[]>;
  readonly onBatch?: (selection: ConstructLabSelection) => void | Promise<void | readonly ConstructLabRow[]>;
  readonly onCompare?: (selection: ConstructLabSelection) => void | Promise<void | readonly ConstructLabRow[]>;
}

export function validateConstructLabSelection(
  entries: readonly ConstructLabEntry[],
  selection: ConstructLabSelection,
): ConstructLabSelection {
  const leftEntry = entries.find((entry) => entry.id === selection.left);
  const rightEntry = entries.find((entry) => entry.id === selection.right);
  const leftProgramEntry = entries.find((entry) => entry.id === selection.leftProgram);
  const rightProgramEntry = entries.find((entry) => entry.id === selection.rightProgram);
  if (!leftEntry || !rightEntry || !leftProgramEntry || !rightProgramEntry) {
    throw new Error("Auto-battle Lab selection no longer names a saved construct");
  }
  if (leftEntry.controlDigest !== leftProgramEntry.controlDigest) {
    throw new Error(`Left Mind "${selection.leftProgram}" cannot drive construct "${selection.left}"`);
  }
  if (rightEntry.controlDigest !== rightProgramEntry.controlDigest) {
    throw new Error(`Right Mind "${selection.rightProgram}" cannot drive construct "${selection.right}"`);
  }
  return selection;
}

const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[character] as string);

export function explainConstructLabRow(row: ConstructLabRow): string {
  const refusal = row.refusals.map(({ id, reason }) => `${id}: ${reason}`).join("; ") || "no action refusals";
  const loss = row.capabilityLosses.map(({ id, reason }) => `${id}: ${reason}`).join("; ") || "no capability losses";
  const stuck = row.stuck?.map(({ side, group, action, phase }) => `${side}/${group}/${action}:${phase}`).join("; ") ||
    "no proven stuck interval";
  const limitation = row.limitation ? ` Limitation: ${row.limitation}` : "";
  return `Job ${row.job} -- seed ${row.seed} -- ${row.winner}. Actions: ${row.actionTrace.join(" -> ") || "none"}. ` +
    `Refusals: ${refusal}. Capability: ${loss}. Stuck: ${stuck}.${limitation}`;
}

export function labScreenMarkup(entries: readonly ConstructLabEntry[], rows: readonly ConstructLabRow[], refusal: string | null,
  busy = false): string {
  const options = entries.map((entry) => `<option value="${escapeHtml(entry.id)}">${escapeHtml(entry.label)} -- ` +
    `${escapeHtml(entry.blueprintDigest)}/${escapeHtml(entry.programDigest)}</option>`).join("");
  return `<section class="construct-lab" aria-label="Auto-battle Lab"><header><p class="forge-kicker">Auto-battle Lab</p>` +
    `<h2>Build -- program -- battle -- diagnose</h2></header><p class="forge-refusal" role="alert" ${refusal ? "" : "hidden"}>${escapeHtml(refusal ?? "")}</p>` +
    `<div class="lab-controls"><label>Left construct<select data-lab-left>${options}</select></label>` +
    `<label>Left Mind<select data-lab-left-program>${options}</select></label>` +
    `<label>Right construct<select data-lab-right>${options}</select></label>` +
    `<label>Right Mind<select data-lab-right-program>${options}</select></label>` +
    `<button type="button" data-lab-action="visible" ${busy ? "disabled" : ""}>Run visible bout</button>` +
    `<button type="button" data-lab-action="batch" ${busy ? "disabled" : ""}>Queue small local batch</button>` +
    `<button type="button" data-lab-action="compare" ${busy ? "disabled" : ""}>Compare revisions</button></div>` +
    `<p role="status" aria-live="polite">${busy ? "Lab job is running; indexed rows are reported as each host commits them." : "Lab is ready."}</p>` +
    `<p class="forge-muted">A hidden browser tab is never presented as rendering performance evidence. Canonical rows come from indexed jobs.</p>` +
    `<table><thead><tr><th>Job</th><th>Seed</th><th>Winner</th><th>Explanation</th></tr></thead><tbody>${rows.map((row) =>
      `<tr><td>${row.job}</td><td>${row.seed}</td><td>${row.winner}</td><td><button type="button" data-lab-action="explain" ` +
      `data-job="${row.job}">Open raw explanation</button></td></tr>`).join("") || `<tr><td colspan="4">No rows yet.</td></tr>`}</tbody></table>` +
    `<output data-lab-explanation aria-live="polite">Choose a raw row to inspect stable IDs.</output></section>`;
}

export class ConstructLabScreen {
  private readonly host: HTMLElement;
  private readonly options: ConstructLabOptions;
  private rows: readonly ConstructLabRow[] = [];
  private refusal: string | null = null;
  private busy = false;
  private selected: ConstructLabSelection | null;

  constructor(host: HTMLElement, options: ConstructLabOptions) {
    this.host = host;
    this.options = options;
    this.selected = options.initialSelection ?? (options.entries[0] ? { left: options.entries[0].id, right: options.entries[0].id,
      leftProgram: options.entries[0].id, rightProgram: options.entries[0].id } : null);
    host.addEventListener("click", this.onClick);
    this.render();
  }

  setRows(rows: readonly ConstructLabRow[]): void { this.rows = rows; this.refusal = null; this.render(); }

  dispose(): void { this.host.removeEventListener("click", this.onClick); this.host.innerHTML = ""; }

  selection(): ConstructLabSelection | null {
    const left = this.host.querySelector<HTMLSelectElement>("[data-lab-left]")?.value;
    const right = this.host.querySelector<HTMLSelectElement>("[data-lab-right]")?.value;
    const leftProgram = this.host.querySelector<HTMLSelectElement>("[data-lab-left-program]")?.value;
    const rightProgram = this.host.querySelector<HTMLSelectElement>("[data-lab-right-program]")?.value;
    if (!left || !right || !leftProgram || !rightProgram) {
      this.refusal = "Auto-battle Lab requires left/right construct and Mind selections";
      this.render();
      return null;
    }
    try {
      return validateConstructLabSelection(this.options.entries, { left, right, leftProgram, rightProgram });
    } catch (error) {
      this.refusal = error instanceof Error ? error.message : String(error);
      this.render();
      return null;
    }
  }

  private render(): void {
    this.host.innerHTML = labScreenMarkup(this.options.entries, this.rows, this.refusal, this.busy);
    if (!this.selected) return;
    for (const [field, value] of [["left", this.selected.left], ["right", this.selected.right],
      ["left-program", this.selected.leftProgram], ["right-program", this.selected.rightProgram]] as const) {
      const select = this.host.querySelector<HTMLSelectElement>(`[data-lab-${field}]`); if (select) select.value = value;
    }
  }

  private async run(kind: "visible" | "batch" | "compare"): Promise<void> {
    if (this.busy) return;
    const selection = this.selection();
    if (!selection) return;
    this.selected = selection;
    const callback = kind === "visible" ? this.options.onVisibleBout : kind === "batch" ? this.options.onBatch : this.options.onCompare;
    if (!callback) { this.refusal = `Auto-battle Lab ${kind} action is unavailable: no host handler is installed`; this.render(); return; }
    this.busy = true;
    this.refusal = null;
    this.render();
    try {
      const rows = await callback(selection);
      if (rows) this.rows = rows;
    } catch (error) {
      this.refusal = error instanceof Error ? error.message : String(error);
    } finally {
      this.busy = false;
      this.render();
    }
  }

  private readonly onClick = (event: Event): void => {
    const target = event.target as HTMLElement | null;
    const button = target?.closest<HTMLButtonElement>("button[data-lab-action]");
    if (!button) return;
    const action = button.dataset.labAction;
    if (action === "visible" || action === "batch" || action === "compare") { void this.run(action); return; }
    if (action !== "explain") return;
    const row = this.rows.find((candidate) => candidate.job === Number(button.dataset.job));
    const output = this.host.querySelector<HTMLOutputElement>("[data-lab-explanation]");
    if (!row || !output) { this.refusal = `Auto-battle Lab cannot explain missing job "${button.dataset.job ?? ""}"`; this.render(); return; }
    output.value = explainConstructLabRow(row);
  };
}
