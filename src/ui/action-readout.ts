import type { SkillReport } from "../core/skills/skills.ts";
import type { ActionStatus, Ended } from "../core/skills/action.ts";

/** Public candidates, live commitments and exact contact totals for Arena and Lab inspection. */
export function actionReadout() {
  const element = document.createElement("div");
  element.className = "action-readout";
  let previous = "";
  const text = (value: string) => { const row = document.createElement("p"); row.textContent = value; element.append(row); };
  const contacts = (record: ActionStatus | Ended) => {
    const counts = record.contacts.counts;
    const phases = (["prepare", "commit", "release"] as const).map(phase => `${phase}: ${Object.entries(counts[phase]).map(([kind, count]) => `${kind} ${count}`).join(", ")}`);
    const total = Object.values(counts).reduce((sum, phase) => sum + Object.values(phase).reduce((a, b) => a + b, 0), 0);
    text(phases.join("; "));
    for (const observation of record.observations) text(`${observation.time.toFixed(3)} s · ${observation.phase} · ${observation.kind} · ${observation.struck ? `${observation.struck.body}/${observation.struck.segment}` : "world or object"}`);
    if (total > record.observations.length) text(`${total - record.observations.length} observation entries omitted; totals include every onset.`);
  };
  return { element, refresh(report: Partial<SkillReport> | null) {
    const state = JSON.stringify([report?.engagement, report?.actions, report?.ledger]);
    if (state === previous) return;
    const open = element.querySelector("details")?.open ?? false;
    previous = state; element.replaceChildren();
    if (!report) return;
    const engagement = report.engagement;
    if (engagement) {
      text(`Focus: ${engagement.focus ?? "none"}${engagement.lost ? " (lost)" : ""} · ${engagement.phase}`);
      for (const candidate of engagement.candidates ?? []) {
        const ready = candidate.readiness;
        const region = candidate.target.region;
        text(`${candidate.key === engagement.pending?.key ? "Pending · " : ""}${candidate.action} · ${candidate.effector} · ${candidate.target.body}/${region.kind === "mark" ? region.mark : region.segment} · ${ready.kind}${"reason" in ready ? `: ${ready.reason}` : ""}${candidate.estimate ? ` · ${candidate.estimate.value.toFixed(3)} ${candidate.estimate.unit}` : ""}`);
      }
    }
    for (const action of report.actions ?? []) {
      text(`#${action.id} ${action.action} · ${action.effector} · ${action.phase}/${action.stage} · holds ${action.holds.join(", ") || "none"}`);
      contacts(action);
    }
    const ledger = report.ledger ?? [];
    if (ledger.length) {
      const details = document.createElement("details"), summary = document.createElement("summary"), history = document.createElement("div");
      details.open = open;
      summary.textContent = `Recent endings (${ledger.length})`; details.append(summary, history); element.append(details);
      for (const record of ledger) {
        const row = document.createElement("p");
        row.textContent = `#${record.id} ${record.action} · ${record.ending.kind}${record.ending.reason ? `: ${record.ending.reason}` : ""} · committed ${record.committed ? "yes" : "no"} · target ${record.contacts.counts.commit.target}, blocked ${record.contacts.counts.commit.block}, incidental ${record.contacts.counts.commit.incidental}, world ${record.contacts.counts.commit.world} · ${record.observed} onsets, ${record.observed - record.observations.length} omitted`;
        history.append(row);
        for (const observation of record.observations) {
          const event = document.createElement("p");
          event.textContent = `${observation.time.toFixed(3)} s · ${observation.phase} · ${observation.kind} · ${observation.struck ? `${observation.struck.body}/${observation.struck.segment}` : "world or object"}`;
          history.append(event);
        }
      }
    }
  } };
}
