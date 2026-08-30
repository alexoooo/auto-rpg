import type { Expression, ProgramRule } from "./program.ts";
import { SUPPORTED_BIPED_LIMP_V1 } from "./biped.ts";

export interface HumanoidLocomotionProgramTuning {
  readonly retreatBelowM: number;
  readonly closeAtM: number;
  readonly turnDeadbandM?: number;
  readonly closeSpeedMps?: number;
  readonly retreatSpeedMps?: number;
}

export const HUMANOID_LOCOMOTION_PROGRAM_V1 = Object.freeze({
  TURN_DEADBAND_M: 0.16,
  CLOSE_SPEED_MPS: 1.20,
  RETREAT_SPEED_MPS: 0.80,
});

const sensor = (id: string): Expression => Object.freeze({ op: "sensor", id });
const constant = (value: number | boolean): Expression => Object.freeze({ op: "constant", value });
const metres = (value: number): Expression => Object.freeze({ op: "constant", value, unit: "metres" });
const and = (...values: Expression[]): Expression => Object.freeze({ op: "and", values: Object.freeze(values) });
const not = (value: Expression): Expression => Object.freeze({ op: "not", value });
const lt = (left: Expression, right: Expression): Expression => Object.freeze({ op: "lt", left, right });
const gt = (left: Expression, right: Expression): Expression => Object.freeze({ op: "gt", left, right });
const gte = (left: Expression, right: Expression): Expression => Object.freeze({ op: "gte", left, right });
const lte = (left: Expression, right: Expression): Expression => Object.freeze({ op: "lte", left, right });
const parameter = (value: Expression) => Object.freeze({ kind: "expression" as const, value });
const rule = (value: ProgramRule): ProgramRule => Object.freeze({ ...value,
  parameters: Object.freeze(value.parameters) });

export function humanoidOpponentAligned(
  turnDeadbandM: number = HUMANOID_LOCOMOTION_PROGRAM_V1.TURN_DEADBAND_M,
): Expression {
  const lateral = sensor("opponent-local-x");
  return and(gte(lateral, metres(-turnDeadbandM)), lte(lateral, metres(turnDeadbandM)));
}

/**
 * Authored locomotion is ordinary Action data. Full and one-support rules are all present;
 * capability admission decides which exact hardware group is live, never rule order or utility.
 */
export function humanoidLocomotionRules(tuning: HumanoidLocomotionProgramTuning): readonly ProgramRule[] {
  const turnDeadbandM = tuning.turnDeadbandM ?? HUMANOID_LOCOMOTION_PROGRAM_V1.TURN_DEADBAND_M;
  const closeSpeedMps = tuning.closeSpeedMps ?? HUMANOID_LOCOMOTION_PROGRAM_V1.CLOSE_SPEED_MPS;
  const retreatSpeedMps = tuning.retreatSpeedMps ?? HUMANOID_LOCOMOTION_PROGRAM_V1.RETREAT_SPEED_MPS;
  if (![tuning.retreatBelowM, tuning.closeAtM, turnDeadbandM, closeSpeedMps, retreatSpeedMps]
    .every(Number.isFinite) || tuning.retreatBelowM <= 0 || tuning.closeAtM <= tuning.retreatBelowM ||
      turnDeadbandM <= 0 || closeSpeedMps <= 0 || closeSpeedMps > 1.6 ||
      retreatSpeedMps <= 0 || retreatSpeedMps > 1.6) {
    throw new Error("humanoid locomotion program tuning is outside its supported bounds");
  }
  const upright = sensor("core-upright");
  const range = sensor("opponent-range");
  const lateral = sensor("opponent-local-x");
  const aligned = humanoidOpponentAligned(turnDeadbandM);
  const close = and(upright, aligned, gte(range, metres(tuning.closeAtM)));
  const retreat = and(upright, lt(range, metres(tuning.retreatBelowM)));
  const turnLeft = and(upright, gte(range, metres(tuning.retreatBelowM)),
    lt(lateral, metres(-turnDeadbandM)));
  const turnRight = and(upright, gte(range, metres(tuning.retreatBelowM)),
    gt(lateral, metres(turnDeadbandM)));
  const fullMoveParameters = (forward: number, speed: number) => Object.freeze({
    forward: parameter(constant(forward)), right: parameter(constant(0)), speed: parameter(Object.freeze({
      op: "constant", value: speed, unit: "metres-per-second",
    })),
  });
  const limpParameters = (forward: number, yaw: number) => Object.freeze({
    forward: parameter(constant(forward)), right: parameter(constant(0)), yaw: parameter(constant(yaw)),
    speed: parameter(Object.freeze({ op: "constant", value: SUPPORTED_BIPED_LIMP_V1.MAX_SPEED_MPS,
      unit: "metres-per-second" })),
  });
  const rules: ProgramRule[] = [
    rule({ id: "recover-support", action: "recover", priority: 96, optional: false, dwellS: 0,
      condition: not(upright), utility: constant(40), parameters: {} }),
    rule({ id: "full-retreat-clinch", action: "move", priority: 74, optional: false, dwellS: 0,
      condition: retreat, utility: constant(30), parameters: fullMoveParameters(-1, retreatSpeedMps) }),
    rule({ id: "full-close-distance", action: "move", priority: 73, optional: false, dwellS: 0,
      condition: close, utility: constant(29), parameters: fullMoveParameters(1, closeSpeedMps) }),
    rule({ id: "full-turn-left", action: "turn", priority: 72, optional: false, dwellS: 0,
      condition: turnLeft, utility: constant(28), parameters: { yaw: parameter(constant(-1)) } }),
    rule({ id: "full-turn-right", action: "turn", priority: 72, optional: false, dwellS: 0,
      condition: turnRight, utility: constant(28), parameters: { yaw: parameter(constant(1)) } }),
  ];
  for (const side of ["left", "right"] as const) {
    const own = sensor(`contact-${side}-foot`);
    const other = sensor(`contact-${side === "left" ? "right" : "left"}-foot`);
    const soleSupport = and(own, not(other));
    const add = (id: string, condition: Expression, forward: number, yaw: number, utility: number): void => {
      rules.push(rule({ id: `limp-${side}-${id}`, action: `limp-${side}`, priority: 62,
        optional: false, dwellS: 0, condition: and(soleSupport, condition), utility: constant(utility),
        parameters: limpParameters(forward, yaw) }));
    };
    add("retreat", retreat, -1, 0, 24);
    add("close", close, 1, 0, 23);
    add("turn-left", turnLeft, 0, -1, 22);
    add("turn-right", turnRight, 0, 1, 22);
  }
  return Object.freeze(rules);
}
