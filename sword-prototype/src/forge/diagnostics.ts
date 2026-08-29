import type { ActiveActionDiagnostic, SchedulerEvent } from "../construct/scheduler.ts";

export interface RuleDecisionDiagnostic {
  readonly rule: string;
  readonly utility: number;
  readonly selected: boolean;
  readonly decisiveFacts: Readonly<Record<string, number | boolean | string>>;
}

export interface CapabilityDiagnostic {
  readonly id: string;
  readonly available: boolean;
  readonly reason: string | null;
}

export interface ConstructDiagnosticFrame {
  readonly at: number;
  readonly paused: boolean;
  readonly rules: readonly RuleDecisionDiagnostic[];
  readonly scheduler: readonly (SchedulerEvent & Readonly<{ step?: number }>)[];
  readonly active: readonly (ActiveActionDiagnostic & Readonly<{ step?: number }>)[];
  readonly capabilities: readonly CapabilityDiagnostic[];
  readonly resources?: Readonly<Record<string, number | boolean | string>>;
  readonly combat?: readonly Readonly<{
    effectorId: string;
    target: string;
    damage: number;
    severed: boolean;
    blocked: boolean;
  }>[];
  readonly probeMotor?: Readonly<{ writes: number; targetsAtLimit: number; targetLimitFraction: number }>;
}

const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[character] as string);

export function diagnosticsMarkup(frame: ConstructDiagnosticFrame): string {
  const rules = frame.rules.map((rule) => `<li data-selected="${rule.selected}"><b>${escapeHtml(rule.rule)}</b>` +
    `<span>utility ${Number.isFinite(rule.utility) ? rule.utility.toFixed(3) : "unavailable"}</span>` +
    `<small>${Object.entries(rule.decisiveFacts).map(([id, value]) => `${escapeHtml(id)}=${escapeHtml(String(value))}`).join(" -- ") || "no decisive facts"}</small></li>`).join("");
  const scheduler = frame.scheduler.map((event) => `<li data-kind="${event.kind}"><b>${escapeHtml(event.action)}</b>` +
    `<span>${escapeHtml(event.kind)} in ${escapeHtml(event.group)}</span><small>${event.step === undefined ? "" : `step ${event.step} -- `}${escapeHtml(event.reason ?? "claims admitted")}</small></li>`).join("");
  const active = frame.active.map((row) => `<li><b>${escapeHtml(row.action)}</b><span>${escapeHtml(row.phase)}</span>` +
    `<small>${row.step === undefined ? "" : `step ${row.step} -- `}${escapeHtml(row.group)} -- ${escapeHtml(row.detail)} -- progress ${Number.isFinite(row.progress) ? row.progress.toFixed(4) : "unavailable"} / ` +
    `epsilon ${Number.isFinite(row.epsilon) ? row.epsilon.toFixed(4) : "unavailable"}</small></li>`).join("");
  const capabilities = frame.capabilities.map((row) => `<li data-available="${row.available}"><b>${escapeHtml(row.id)}</b>` +
    `<span>${row.available ? "available" : "lost"}</span><small>${escapeHtml(row.reason ?? "installed hardware is live")}</small></li>`).join("");
  const resources = Object.entries(frame.resources ?? {}).map(([id, value]) => `<li><b>${escapeHtml(id)}</b>` +
    `<span>${escapeHtml(typeof value === "number" ? value.toFixed(3) : String(value))}</span></li>`).join("");
  const combat = (frame.combat ?? []).map((row) => `<li data-severed="${row.severed}"><b>${escapeHtml(row.effectorId)}</b>` +
    `<span>${row.blocked ? "blocked" : `${row.damage.toFixed(2)} damage${row.severed ? " -- severed" : ""}`}</span>` +
    `<small>${escapeHtml(row.target)}</small></li>`).join("");
  const probeMotor = frame.probeMotor ? `<section><h3>Probe motor travel limits</h3><p data-probe-motor-saturation>` +
    `${frame.probeMotor.targetsAtLimit}/${frame.probeMotor.writes} commanded targets at a joint travel stop ` +
    `(${(frame.probeMotor.targetLimitFraction * 100).toFixed(1)}%). This does not infer measured torque.</p></section>` : "";
  return `<section class="construct-diagnostics" data-paused="${frame.paused}" aria-label="Construct decision timeline">` +
    `<header><div><p class="forge-kicker">Decision timeline</p><h2>${frame.paused ? "Paused -- evidence stays visible" : `Live -- ${frame.at.toFixed(2)} s`}</h2></div>` +
    `<span class="diagnostic-clock">${frame.at.toFixed(3)} s</span></header><div class="diagnostic-columns">` +
    `<section><h3>Mind rules</h3><ol>${rules || "<li>No evaluated rules.</li>"}</ol></section>` +
    `<section><h3>Requests and claims</h3><ol>${scheduler || "<li>No scheduler events.</li>"}</ol></section>` +
    `<section><h3>Active phases</h3><ol>${active || "<li>No active controllers.</li>"}</ol></section>` +
    `<section><h3>Hardware capabilities</h3><ol>${capabilities || "<li>No capability changes.</li>"}</ol></section>` +
    `<section><h3>Power, heat and ammunition</h3><ol>${resources || "<li>No resource ledger.</li>"}</ol></section>` +
    `<section><h3>Damage by effector</h3><ol>${combat || "<li>No scored contacts.</li>"}</ol></section>` +
    probeMotor +
    `</div></section>`;
}

export class ConstructDiagnosticsPanel {
  private readonly host: HTMLElement;
  private frame: ConstructDiagnosticFrame;

  constructor(host: HTMLElement, initial: ConstructDiagnosticFrame) {
    this.host = host;
    this.frame = initial;
    this.render();
  }

  update(frame: ConstructDiagnosticFrame): void { this.frame = frame; this.render(); }

  setPaused(paused: boolean): void { this.frame = { ...this.frame, paused }; this.render(); }

  dispose(): void { this.host.innerHTML = ""; }

  private render(): void { this.host.innerHTML = diagnosticsMarkup(this.frame); }
}
