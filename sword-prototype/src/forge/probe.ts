import type { ConstructControlSnapshot, MotorTargetDiagnostic } from "../construct/control.ts";
import type { ActiveActionDiagnostic, SchedulerEvent } from "../construct/scheduler.ts";

export interface ProbeTimelineEvent extends SchedulerEvent { readonly step: number; }
export interface ProbeActiveSample extends ActiveActionDiagnostic { readonly step: number; }
export interface ProbeMotorSummary {
  readonly writes: number;
  readonly targetsAtLimit: number;
  readonly targetLimitFraction: number;
  readonly byJoint: Readonly<Record<string, Readonly<{ writes: number; targetsAtLimit: number }>>>;
}
export interface ProbeTimeline {
  readonly scheduler: readonly ProbeTimelineEvent[];
  readonly active: readonly ProbeActiveSample[];
  readonly motors: ProbeMotorSummary;
  readonly final: ConstructControlSnapshot;
}

/** Reduce a complete physical probe without allowing its final idle/restart tick to erase evidence. */
export function summarizeProbeSnapshots(snapshots: readonly ConstructControlSnapshot[]): ProbeTimeline {
  if (snapshots.length === 0) throw new Error("physical probe produced no control snapshots");
  const scheduler: ProbeTimelineEvent[] = []; const active: ProbeActiveSample[] = [];
  let priorEvent = ""; const priorPhase = new Map<string, string>();
  const motorRows = new Map<string, { writes: number; targetsAtLimit: number }>();
  let writes = 0; let targetsAtLimit = 0;
  snapshots.forEach((snapshot, step) => {
    for (const event of snapshot.events) {
      const signature = `${event.kind}\0${event.action}\0${event.group}\0${event.reason ?? ""}`;
      // Admission repeats every tick. Preserve its first occurrence and every real transition.
      if (signature !== priorEvent) scheduler.push(Object.freeze({ ...event, step }));
      priorEvent = signature;
    }
    for (const row of snapshot.active) {
      const key = `${row.group}/${row.action}`; const changed = priorPhase.get(key) !== row.phase;
      if (changed || step % 12 === 0 || step === snapshots.length - 1) {
        active.push(Object.freeze({ ...row, step }));
      }
      priorPhase.set(key, row.phase);
    }
    for (const target of snapshot.motorTargets ?? Object.freeze([] as MotorTargetDiagnostic[])) {
      writes += 1; if (target.targetAtLimit) targetsAtLimit += 1;
      const row = motorRows.get(target.joint) ?? { writes: 0, targetsAtLimit: 0 };
      row.writes += 1; if (target.targetAtLimit) row.targetsAtLimit += 1; motorRows.set(target.joint, row);
    }
  });
  return Object.freeze({
    scheduler: Object.freeze(scheduler.slice(-96)), active: Object.freeze(active.slice(-96)),
    motors: Object.freeze({ writes, targetsAtLimit, targetLimitFraction: writes === 0 ? 0 : targetsAtLimit / writes,
      byJoint: Object.freeze(Object.fromEntries([...motorRows].map(([id, row]) => [id, Object.freeze({ ...row })]))) }),
    final: snapshots.at(-1) as ConstructControlSnapshot,
  });
}
