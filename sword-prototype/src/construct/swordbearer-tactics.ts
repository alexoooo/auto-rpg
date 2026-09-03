import type { ConstructCommand, ConstructControlGraph, ScheduledActionRequest } from "./actions.ts";
import type { ConstructDecisionDiagnostic } from "./mind.ts";
import type { ProgramRuntimeState } from "./program.ts";
import type { SensorFrame, SensorSpec } from "./sensors.ts";

/**
 * The fixed Effigy is an authored opponent, not a saved-program substitution.  Its mechanics
 * remain completely public: every change of lane, guard and stroke is one ordinary action in its
 * own graph.  The state here remembers tactical intent long enough for a physical action to
 * complete; it does not own a transform, collision body or damage channel.
 */
export type SwordbearerTacticalPhase =
  | "approach" | "orbit-left" | "orbit-right" | "guard" | "chamber"
  | "commit" | "withdraw" | "counter" | "recover";

export const SWORDBEARER_TACTICS_V1 = Object.freeze({
  approachSpeedMps: 1.20,
  approachForward: 1,
  orbit: Object.freeze({ forward: 0.35, right: 0.80, yaw: 0.70, speed: 1.05 }),
  withdraw: Object.freeze({ forward: -0.80, right: 0.35, yaw: 0.45, speed: 0.95 }),
  dodgeSpeedMps: 1.05,
  retreatBelowM: 1.15,
  workingAtM: 1.85,
  sweepBelowM: 2.10,
  incomingWeaponSpeedMps: 5,
  chamberS: 0.16,
  guardClearS: 0.18,
  withdrawS: 0.52,
  withdrawExitAboveM: 1.33,
  orbitBeforeCommitS: 0.48,
});

const numberFact = (frame: SensorFrame, id: string, fallback = 0): number => {
  if (!frame.has(id)) return fallback;
  const value = frame.read(id).value;
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
};
const booleanFact = (frame: SensorFrame, id: string): boolean => frame.has(id) && frame.read(id).value === true;

const scheduled = (action: string, parameters: Readonly<Record<string, number>>,
  priority: number, sourceIndex: number): ScheduledActionRequest => Object.freeze({
  request: Object.freeze({ action, parameters: Object.freeze({ ...parameters }) }), priority, sourceIndex,
});

const phaseReason = (phase: SwordbearerTacticalPhase, threat: boolean, visible: boolean): string => {
  if (!visible) return "no line of sight";
  if (phase === "recover") return "recovering support";
  if (phase === "guard" && threat) return "guarding incoming blade";
  if (phase === "withdraw") return "leaving committed lane";
  return "blocked lane";
};

export class SwordbearerTactics {
  readonly name = "swordbearer-authored-tactics-v1";
  private phase: SwordbearerTacticalPhase = "approach";
  private phaseElapsedS = 0;
  private orbitSign: -1 | 1 = 1;
  private sweepWasActive = false;
  private guardClearS = 0;
  private last: ConstructDecisionDiagnostic = Object.freeze({ program: this.name,
    selectedRules: Object.freeze([]), requests: Object.freeze([]), rules: Object.freeze([]),
    phase: "approach", reason: "no line of sight" });

  constructor(graph: ConstructControlGraph, sensors: readonly SensorSpec[]) {
    if (sensors.length === 0) throw new Error("Swordbearer tactics requires installed sensor hardware");
    for (const id of ["advance", "withdraw", "orbit-left", "orbit-right", "recover", "guard", "sweep"]) {
      if (!graph.actions.some((action) => action.id === id)) {
        throw new Error(`Swordbearer tactics requires declared action "${id}"`);
      }
    }
  }

  decide(frame: SensorFrame, dt: number, runtime?: ProgramRuntimeState): ConstructCommand {
    const tuned = SWORDBEARER_TACTICS_V1;
    const upright = booleanFact(frame, "core-upright");
    const visible = booleanFact(frame, "line-of-sight");
    const sword = booleanFact(frame, "sword-ready");
    const leftArm = booleanFact(frame, "left-arm-ready");
    const range = numberFact(frame, "opponent-range", Number.POSITIVE_INFINITY);
    const clearance = numberFact(frame, "sword-core-clearance-m", 1);
    const weaponPresent = booleanFact(frame, "opponent-weapon-present");
    const weaponSpeed = numberFact(frame, "opponent-weapon-speed-mps");
    const weaponZ = numberFact(frame, "opponent-weapon-local-z");
    const weaponVz = numberFact(frame, "opponent-weapon-local-vz");
    const threat = visible && weaponPresent && weaponSpeed >= tuned.incomingWeaponSpeedMps && weaponZ > 0 && weaponVz < 0;
    const sweepActive = runtime?.isActionActive("sweep") === true;

    if (!Number.isFinite(dt) || dt <= 0) throw new Error("Swordbearer tactics requires a positive finite timestep");
    this.phaseElapsedS += dt;
    this.guardClearS = threat ? 0 : this.guardClearS + dt;
    if (!upright) this.enter("recover");
    else if (this.phase === "recover") this.enter(range >= tuned.workingAtM ? "approach" : this.orbitPhase());
    else if (this.phase === "commit" && this.sweepWasActive && !sweepActive) {
      this.orbitSign = this.orbitSign === 1 ? -1 : 1;
      this.enter("withdraw");
    } else if ((this.phase === "commit" || this.phase === "counter") && !sweepActive && !visible) {
      // A strike may finish across a briefly occluded lane -- its mount latched the target at
      // admission -- but a new strike may not begin blind.  More importantly, do not leave a
      // "commit" label attached to an empty weapon group: that was the source of the old
      // start/cancel churn in physical bouts.
      this.enter(this.orbitPhase());
    } else if (this.phase === "withdraw" && this.phaseElapsedS >= tuned.withdrawS &&
      range >= tuned.withdrawExitAboveM) this.enter(this.orbitPhase());
    else if (this.phase === "withdraw") { /* hold one real departure lane until it has earned room */ }
    else if (range < tuned.retreatBelowM && this.phase !== "commit") this.enter("withdraw");
    else if (range > tuned.workingAtM && this.phase !== "commit") this.enter("approach");
    else if (threat && this.phase !== "commit") this.enter("guard");
    else if (this.phase === "approach") this.enter(this.orbitPhase());
    else if (this.phase === "guard" && this.guardClearS >= tuned.guardClearS) this.enter(this.orbitPhase());
    else if ((this.phase === "orbit-left" || this.phase === "orbit-right") &&
      this.phaseElapsedS >= tuned.orbitBeforeCommitS && visible && sword && clearance >= 0.025 &&
      range >= tuned.retreatBelowM && range <= tuned.sweepBelowM) this.enter("chamber");
    else if (this.phase === "chamber" && this.phaseElapsedS >= tuned.chamberS) this.enter(threat ? "counter" : "commit");
    else if (this.phase === "counter" && sweepActive) this.enter("commit");
    this.sweepWasActive = sweepActive;

    const locomotion = this.locomotionRequest(range);
    const requests: ScheduledActionRequest[] = [locomotion];
    const swordAction = this.swordRequest(sword, visible, clearance, threat);
    if (swordAction) requests.push(swordAction);
    if (leftArm && threat && this.phase !== "commit" && this.phase !== "counter") {
      requests.push(scheduled("offhand-guard", {}, 82, 2));
    } else if (leftArm) requests.push(scheduled("stabilize", {}, 10, 3));
    const command: ConstructCommand = Object.freeze({ version: 1, requests: Object.freeze(requests) });
    const reason = phaseReason(this.phase, threat, visible);
    const selected = Object.freeze(requests.map(({ request }) => request.action));
    this.last = Object.freeze({ program: this.name, selectedRules: selected, requests: selected,
      rules: Object.freeze(selected.map((action, index) => Object.freeze({ rule: `${this.phase}:${action}`,
        utility: requests[index].priority, selected: true, decisiveFacts: Object.freeze({ range, threat, visible }) }))),
      phase: this.phase, reason });
    return command;
  }

  diagnostic(): ConstructDecisionDiagnostic { return this.last; }

  private enter(phase: SwordbearerTacticalPhase): void {
    if (this.phase === phase) return;
    this.phase = phase;
    this.phaseElapsedS = 0;
  }

  private orbitPhase(): "orbit-left" | "orbit-right" { return this.orbitSign < 0 ? "orbit-left" : "orbit-right"; }

  private locomotionRequest(range: number): ScheduledActionRequest {
    const tuning = SWORDBEARER_TACTICS_V1;
    if (this.phase === "recover") return scheduled("recover", {}, 100, 0);
    if (this.phase === "approach") return scheduled("advance", { forward: tuning.approachForward, right: 0,
      yaw: 0, speed: tuning.approachSpeedMps }, 74, 0);
    if (this.phase === "withdraw" || range < tuning.retreatBelowM) {
      const side = this.orbitSign;
      return scheduled("withdraw", { forward: tuning.withdraw.forward, right: tuning.withdraw.right * side,
        yaw: tuning.withdraw.yaw * side, speed: tuning.withdraw.speed }, 78, 0);
    }
    if (this.phase === "commit" || this.phase === "counter") {
      // The supported carrier owns translation as well as yaw. Holding a short, planted lane
      // through a mounted stroke is a real biped action, not a transform freeze. A bounded
      // carrier turn keeps the living fighter from reading the attack as a stationary turret,
      // while zero translation preserves the mount's latched target chord. The two measured
      // moving-stroke candidates also regressed support or sword/core clearance, so motion stays
      // outside the stroke rather than laundering instability into a better attack count.
      return scheduled("advance", { forward: 0, right: 0, yaw: this.orbitSign * 0.28, speed: 0 }, 80, 0);
    }
    if (this.phase === "chamber" || this.phase === "guard") {
      return scheduled("advance", { forward: 0, right: 0, yaw: 0, speed: 0 }, 80, 0);
    }
    const side = this.phase === "orbit-left" ? -1 : this.phase === "orbit-right" ? 1 : this.orbitSign;
    return scheduled(side < 0 ? "orbit-left" : "orbit-right", { forward: tuning.orbit.forward,
      right: tuning.orbit.right * side, yaw: tuning.orbit.yaw * side, speed: tuning.orbit.speed }, 75, 0);
  }

  private swordRequest(sword: boolean, visible: boolean, clearance: number,
    threat: boolean): ScheduledActionRequest | null {
    // A committed mount snapshots its lane at admission.  Withdrawing it because an ordinary
    // live clearance warning flickered during a moving carrier recreated the old permanent wind
    // pose; the mount's own controller keeps the physical stop and remains the safety authority.
    if (sword && (this.phase === "commit" || this.phase === "counter") && (visible || this.sweepWasActive)) {
      return scheduled("sweep", { direction: this.orbitSign }, 92, 1);
    }
    if (!sword || !visible || clearance < 0.025) return null;
    if (threat || this.phase === "guard" || this.phase === "chamber") return scheduled("guard", {}, 70, 1);
    return scheduled("guard", {}, 40, 1);
  }
}
