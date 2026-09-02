import type { ConstructControlGraph } from "./actions.ts";
import type { ConstructProgram, Expression, ProgramRule } from "./program.ts";
import { validateProgram } from "./program.ts";
import type { SensorSpec } from "./sensors.ts";
import { humanoidLocomotionRules, humanoidOpponentAligned } from "./humanoid-locomotion-program.ts";

export interface TwinbladeDuelistTuning {
  readonly minimumCutRangeM?: number;
  readonly maximumCutRangeM?: number;
  readonly blockerOutwardM?: number;
  readonly cutterChamberCrossM?: number;
  readonly cutterChamberDropM?: number;
  readonly openLaneOffsetM?: number;
  readonly targetHeightOffsetM?: number;
  readonly blockerTargetHeightOffsetM?: number;
  readonly cutAdvanceFraction?: number;
  readonly motorSpeedFraction?: number;
  readonly motorForceFraction?: number;
  readonly travelMultiplier?: number;
  readonly settleAllowanceS?: number;
  readonly braceKneeRad?: number;
  readonly braceAnkleRad?: number;
  readonly braceSoleRad?: number;
}

// The 2026-09-01 fixed-step Havok bracket used a stationary, unarmed Warrior at 1.25 m in
// both mirrors. A 0.35 m height lift plus the controller's 0.13 s commit floor was the first
// measured pair to put left/first-cut and right/second-cut through the torso in one Action;
// mutating the lift to 0.18 m loses the second cut in the left mirror. The 2026-09-01 frozen
// active bracket then identified a different obstruction: at 1.65 m the first committed action
// began inside the Warrior's attack cadence, while 1.80 m preserved all four unshielded contacts.
// A blocker needs the independent 0.60 m high lane: an isolated always-high shield bracket won
// three of four cells, while torso-height shield paths remained blocked by hands and forearms.
// That isolated result is diagnostic rather than a qualification claim -- once a shield is lost,
// later Actions correctly return to the open torso lane. A fallen Twinblade keeps its armed Action
// responsible for the bounded rise instead of becoming passive under repeated hit interruption.
// The 0.20 carrier advance came from the same bracket: 0.30--0.50 increased early posture loss.
export const TWINBLADE_DUELIST = Object.freeze({ minimumCutRangeM: 0.85, maximumCutRangeM: 1.80,
  blockerOutwardM: 0.28, cutterChamberCrossM: 0.28, cutterChamberDropM: 0.15,
  openLaneOffsetM: 0.14,
  targetHeightOffsetM: 0.35,
  blockerTargetHeightOffsetM: 0.60,
  cutAdvanceFraction: 0.20,
  motorSpeedFraction: 1, motorForceFraction: 1, travelMultiplier: 0.75, settleAllowanceS: 0,
  braceKneeRad: -0.20, braceAnkleRad: 0.10, braceSoleRad: 0.08 });

const sensor = (id: string): Expression => Object.freeze({ op: "sensor", id });
const active = (action: string): Expression => Object.freeze({ op: "active", action });
const scalar = (value: number): Expression => Object.freeze({ op: "constant", value });
const metres = (value: number): Expression => Object.freeze({ op: "constant", value, unit: "metres" });
const seconds = (value: number): Expression => Object.freeze({ op: "constant", value, unit: "seconds" });
const radians = (value: number): Expression => Object.freeze({ op: "constant", value, unit: "radians" });
const parameter = (value: Expression) => Object.freeze({ kind: "expression" as const, value });
const and = (...values: Expression[]): Expression => Object.freeze({ op: "and", values: Object.freeze(values) });
const or = (...values: Expression[]): Expression => Object.freeze({ op: "or", values: Object.freeze(values) });
const not = (value: Expression): Expression => Object.freeze({ op: "not", value });
const lt = (left: Expression, right: Expression): Expression => Object.freeze({ op: "lt", left, right });
const gte = (left: Expression, right: Expression): Expression => Object.freeze({ op: "gte", left, right });
const rule = (value: ProgramRule): ProgramRule => Object.freeze({ ...value,
  parameters: Object.freeze(value.parameters) });

/** One stable command cell owns both blades and both supports; no collision edge drives phase state. */
export function twinbladeDuelistProgram(
  graph: ConstructControlGraph,
  sensors: readonly SensorSpec[],
  overrides: TwinbladeDuelistTuning = {},
): ConstructProgram {
  const tuning = Object.freeze({ ...TWINBLADE_DUELIST, ...overrides });
  const upright = sensor("core-upright");
  const visible = sensor("line-of-sight");
  const stableDownedOpponent = and(not(sensor("opponent-upright")), not(sensor("opponent-rising")));
  const targetable = or(visible, stableDownedOpponent);
  const supported = or(sensor("contact-left-foot"), sensor("contact-right-foot"));
  const range = sensor("opponent-range");
  const aligned = humanoidOpponentAligned();
  const admittedAttack = and(upright, targetable, supported, aligned,
    gte(range, metres(tuning.minimumCutRangeM)),
    lt(range, metres(tuning.maximumCutRangeM)));
  const recoveringAttack = and(not(upright), targetable, aligned,
    gte(range, metres(tuning.minimumCutRangeM)),
    lt(range, metres(tuning.maximumCutRangeM)));
  // Once the scheduler owns the combined cut, transient perception/posture flicker cannot
  // replace it with the passive mount rules. Hardware admission and explicit stops remain
  // scheduler authority and still cancel the action by name.
  const attack = or(admittedAttack, recoveringAttack, active("dual-cut"));
  const passive = not(attack);
  const locomotion = humanoidLocomotionRules({ retreatBelowM: tuning.minimumCutRangeM,
    closeAtM: tuning.maximumCutRangeM }).map((candidate) => rule({ ...candidate,
      condition: and(passive, candidate.condition) }));
  const rules: readonly ProgramRule[] = Object.freeze([
    ...locomotion,
    rule({ id: "dual-scissor-cut", action: "dual-cut", priority: 100, optional: false, dwellS: 0,
      condition: attack, utility: scalar(32), parameters: {
        "blocker-outward-m": parameter(metres(tuning.blockerOutwardM)),
        "cutter-chamber-cross-m": parameter(metres(tuning.cutterChamberCrossM)),
        "cutter-chamber-drop-m": parameter(metres(tuning.cutterChamberDropM)),
        "open-lane-offset-m": parameter(metres(tuning.openLaneOffsetM)),
        "target-height-offset-m": parameter(metres(tuning.targetHeightOffsetM)),
        "blocker-target-height-offset-m": parameter(metres(tuning.blockerTargetHeightOffsetM)),
        "cut-advance-fraction": parameter(scalar(tuning.cutAdvanceFraction)),
        "motor-speed-fraction": parameter(scalar(tuning.motorSpeedFraction)),
        "motor-force-fraction": parameter(scalar(tuning.motorForceFraction)),
        "travel-multiplier": parameter(scalar(tuning.travelMultiplier)),
        "settle-allowance-s": parameter(seconds(tuning.settleAllowanceS)),
        "brace-knee-rad": parameter(radians(tuning.braceKneeRad)),
        "brace-ankle-rad": parameter(radians(tuning.braceAnkleRad)),
        "brace-sole-rad": parameter(radians(tuning.braceSoleRad)),
      } }),
    rule({ id: "neutral-blades-outside-cut", action: "dual-mount-neutral", priority: 60,
      optional: false, dwellS: 0, condition: passive, utility: scalar(20), parameters: {} }),
    // An upright admission requires a real foot contact. Once fallen over verified ground, the
    // morphology's armed recovery-cut owns the same support authority; the controller requests
    // the bounded rise while its two mounts keep moving. Live topology and occupancy remain
    // engine authority rather than program facts.
    rule({ id: "brace-outside-cut", action: "brace", priority: 50, optional: false, dwellS: 0.03,
      condition: and(upright, aligned, passive,
        gte(range, metres(tuning.minimumCutRangeM)), lt(range, metres(tuning.maximumCutRangeM))),
      utility: scalar(18), parameters: {} }),
    rule({ id: "stabilize-posture", action: "stabilize", priority: 10, optional: false, dwellS: 0,
      condition: Object.freeze({ op: "constant", value: true }), utility: scalar(2), parameters: {} }),
  ]);
  const program = Object.freeze({ version: 1 as const, id: "twinblade-warrior-scissor-cut", rules });
  validateProgram(program, graph, sensors);
  return program;
}
