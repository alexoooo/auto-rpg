import type { ConstructControlSnapshot, MotorTargetDiagnostic } from "../construct/control.ts";
import type { ActiveActionDiagnostic, SchedulerEvent } from "../construct/scheduler.ts";
import type { PhysicalSupportedLocomotionDiagnostic } from "../supported-locomotion-production.ts";

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
  readonly locomotion: readonly Readonly<{ step: number; diagnostic: PhysicalSupportedLocomotionDiagnostic }>[];
  readonly final: ConstructControlSnapshot;
}

/** Reduce a complete physical probe without allowing its final idle/restart tick to erase evidence. */
export function summarizeProbeSnapshots(snapshots: readonly ConstructControlSnapshot[]): ProbeTimeline {
  if (snapshots.length === 0) throw new Error("physical probe produced no control snapshots");
  const scheduler: ProbeTimelineEvent[] = []; const active: ProbeActiveSample[] = [];
  const locomotion: { step: number; diagnostic: PhysicalSupportedLocomotionDiagnostic }[] = [];
  let priorEvent = ""; const priorPhase = new Map<string, string>();
  let priorLocomotionSignature = "";
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
    if (snapshot.locomotion) {
      const row = snapshot.locomotion;
      const motionSignature = (value: PhysicalSupportedLocomotionDiagnostic["requested"]): string => value === null
        ? "none" : `${value.localForward},${value.localRight},${value.yaw},${value.recover}`;
      const signature = `${row.state.state}\0${row.activeGroup ?? ""}\0${row.blockedReason ?? ""}\0` +
        `${row.releaseReason ?? ""}\0${row.recoveryProgress ?? ""}\0${motionSignature(row.requested)}\0` +
        `${motionSignature(row.allowed)}\0${row.supportGroups.map((group) =>
          `${group.id}:${group.live}:${group.bindings.map((binding) => `${binding.id}:${binding.live}`).join(",")}`).join(";")}`;
      if (signature !== priorLocomotionSignature || step % 12 === 0 || step === snapshots.length - 1) {
        locomotion.push(Object.freeze({ step, diagnostic: row }));
      }
      priorLocomotionSignature = signature;
    }
  });
  return Object.freeze({
    scheduler: Object.freeze(scheduler.slice(-96)), active: Object.freeze(active.slice(-96)),
    motors: Object.freeze({ writes, targetsAtLimit, targetLimitFraction: writes === 0 ? 0 : targetsAtLimit / writes,
      byJoint: Object.freeze(Object.fromEntries([...motorRows].map(([id, row]) => [id, Object.freeze({ ...row })]))) }),
    locomotion: Object.freeze(locomotion.slice(-96)),
    final: snapshots.at(-1) as ConstructControlSnapshot,
  });
}
