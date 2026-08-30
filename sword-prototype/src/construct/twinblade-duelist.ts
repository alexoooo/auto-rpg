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
  readonly motorSpeedFraction?: number;
  readonly motorForceFraction?: number;
  readonly travelMultiplier?: number;
  readonly settleAllowanceS?: number;
  readonly braceKneeRad?: number;
  readonly braceAnkleRad?: number;
  readonly braceSoleRad?: number;
}

export const TWINBLADE_DUELIST = Object.freeze({ minimumCutRangeM: 1.20, maximumCutRangeM: 1.70,
  blockerOutwardM: 0.28, cutterChamberCrossM: 0.28, cutterChamberDropM: 0.15, openLaneOffsetM: 0,
  motorSpeedFraction: 1, motorForceFraction: 1, travelMultiplier: 0.75, settleAllowanceS: 0.05,
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
  const blocker = sensor("opponent-blocker-present");
  const supported = or(sensor("contact-left-foot"), sensor("contact-right-foot"));
  const range = sensor("opponent-range");
  const aligned = humanoidOpponentAligned();
  const admittedAttack = and(upright, visible, blocker, supported, aligned,
    gte(range, metres(tuning.minimumCutRangeM)),
    lt(range, metres(tuning.maximumCutRangeM)));
  // Once the scheduler owns the combined cut, transient perception/posture flicker cannot
  // replace it with the passive mount rules. Hardware admission and explicit stops remain
  // scheduler authority and still cancel the action by name.
  const attack = or(admittedAttack, active("dual-cut"));
  const passive = not(attack);
  const locomotion = humanoidLocomotionRules({ retreatBelowM: tuning.minimumCutRangeM,
    closeAtM: tuning.maximumCutRangeM }).map((candidate) => rule({ ...candidate,
      condition: and(not(active("dual-cut")), candidate.condition) }));
  const rules: readonly ProgramRule[] = Object.freeze([
    ...locomotion,
    rule({ id: "dual-scissor-cut", action: "dual-cut", priority: 80, optional: false, dwellS: 0,
      condition: attack, utility: scalar(32), parameters: {
        "blocker-outward-m": parameter(metres(tuning.blockerOutwardM)),
        "cutter-chamber-cross-m": parameter(metres(tuning.cutterChamberCrossM)),
        "cutter-chamber-drop-m": parameter(metres(tuning.cutterChamberDropM)),
        "open-lane-offset-m": parameter(metres(tuning.openLaneOffsetM)),
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
    // The controller itself admits only after a real foot contact. Once admitted, contact sensor
    // flicker may not withdraw the one Action that owns support authority and turn an upright body
    // into a software knockdown. Live topology/contact revocation remains engine authority.
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
