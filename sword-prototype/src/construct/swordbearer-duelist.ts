import type { ConstructControlGraph } from "./actions.ts";
import type { ConstructProgram, Expression, ProgramRule } from "./program.ts";
import { validateProgram } from "./program.ts";
import type { SensorSpec } from "./sensors.ts";

/** Distances and speeds are immutable program semantics, not page tuning. */
export const SWORDBEARER_DUELIST = Object.freeze({
  retreatBelowM: 0.82,
  strikeBelowM: 2.60,
  turnDeadbandM: 1.20,
  dangerousRelativeSpeedMps: 3.50,
  retreatSpeedMps: 0.72,
});

const sensor = (id: string): Expression => Object.freeze({ op: "sensor", id });
const scalar = (value: number): Expression => Object.freeze({ op: "constant", value });
const metres = (value: number): Expression => Object.freeze({ op: "constant", value, unit: "metres" });
const speed = (value: number): Expression =>
  Object.freeze({ op: "constant", value, unit: "metres-per-second" });
const not = (value: Expression): Expression => Object.freeze({ op: "not", value });
const and = (...values: Expression[]): Expression => Object.freeze({ op: "and", values: Object.freeze(values) });
const lt = (left: Expression, right: Expression): Expression => Object.freeze({ op: "lt", left, right });
const lte = (left: Expression, right: Expression): Expression => Object.freeze({ op: "lte", left, right });
const gt = (left: Expression, right: Expression): Expression => Object.freeze({ op: "gt", left, right });
const gte = (left: Expression, right: Expression): Expression => Object.freeze({ op: "gte", left, right });
const parameter = (value: Expression) => Object.freeze({ kind: "expression" as const, value });
const rule = (value: ProgramRule): ProgramRule => Object.freeze({ ...value,
  parameters: Object.freeze(value.parameters) });

const upright = sensor("core-upright");
const visible = sensor("line-of-sight");
const range = sensor("opponent-range");
const lateral = sensor("opponent-local-x");
const relativeSpeed = sensor("opponent-relative-speed");
const below = (value: number): Expression => lt(range, metres(value));
const atLeast = (value: number): Expression => gte(range, metres(value));
const centred = (): Expression => and(
  gte(lateral, metres(-SWORDBEARER_DUELIST.turnDeadbandM)),
  lte(lateral, metres(SWORDBEARER_DUELIST.turnDeadbandM)),
);
const moveParameters = (forward: number, right: number, metresPerSecond: number) => Object.freeze({
  forward: parameter(scalar(forward)), right: parameter(scalar(right)), speed: parameter(speed(metresPerSecond)),
});

/**
 * The committed biped tactics use only the Swordbearer's declared public Actions.
 *
 * Locomotion rules are disjoint because move, turn, brace and recover share one group. Sword rules
 * are likewise disjoint because sweep and guard share the physical mount. That is a tactical choice,
 * not scheduler-refusal roulette; every simultaneous pair below owns different motor groups.
 */
export function swordbearerDuelistProgram(
  graph: ConstructControlGraph,
  sensors: readonly SensorSpec[],
): ConstructProgram {
  const combatBand = and(atLeast(SWORDBEARER_DUELIST.retreatBelowM),
    below(SWORDBEARER_DUELIST.strikeBelowM));
  const dangerousEntry = gte(relativeSpeed, speed(SWORDBEARER_DUELIST.dangerousRelativeSpeedMps));
  const rules: readonly ProgramRule[] = Object.freeze([
    rule({ id: "recover-from-fall", action: "recover", priority: 100, optional: false, dwellS: 0,
      condition: not(upright), utility: scalar(100), parameters: {} }),

    // A clinch leaves no sword travel. Step diagonally out, away from the measured local side.
    rule({ id: "retreat-opponent-right", action: "move", priority: 90, optional: false, dwellS: 0.04,
      condition: and(upright, below(SWORDBEARER_DUELIST.retreatBelowM), gte(lateral, metres(0))),
      utility: scalar(40), parameters: moveParameters(-1, -0.45, SWORDBEARER_DUELIST.retreatSpeedMps) }),
    rule({ id: "retreat-opponent-left", action: "move", priority: 90, optional: false, dwellS: 0.04,
      condition: and(upright, below(SWORDBEARER_DUELIST.retreatBelowM), lt(lateral, metres(0))),
      utility: scalar(40), parameters: moveParameters(-1, 0.45, SWORDBEARER_DUELIST.retreatSpeedMps) }),

    // Facing is corrected before translation or attack; one biped group cannot do both honestly.
    rule({ id: "turn-toward-right", action: "turn", priority: 85, optional: false, dwellS: 0.04,
      condition: and(upright, atLeast(SWORDBEARER_DUELIST.strikeBelowM),
        gt(lateral, metres(SWORDBEARER_DUELIST.turnDeadbandM))),
      utility: scalar(35), parameters: { yaw: parameter(scalar(1)) } }),
    rule({ id: "turn-toward-left", action: "turn", priority: 85, optional: false, dwellS: 0.04,
      condition: and(upright, atLeast(SWORDBEARER_DUELIST.strikeBelowM),
        lt(lateral, metres(-SWORDBEARER_DUELIST.turnDeadbandM))),
      utility: scalar(35), parameters: { yaw: parameter(scalar(-1)) } }),

    // Incoming speed switches both independently-owned groups from attack to physical defence.
    rule({ id: "brace-fast-entry", action: "brace", priority: 80, optional: false, dwellS: 0.03,
      condition: and(upright, below(SWORDBEARER_DUELIST.retreatBelowM), dangerousEntry),
      utility: scalar(32), parameters: {} }),
    rule({ id: "guard-fast-entry", action: "guard", priority: 79, optional: false, dwellS: 0.03,
      condition: and(upright, visible, below(SWORDBEARER_DUELIST.retreatBelowM), dangerousEntry),
      utility: scalar(31), parameters: {} }),

    // A sweep is paired with planted legs; local side chooses the physical wind/commit direction.
    rule({ id: "sweep-opponent-right", action: "sweep", priority: 70, optional: false, dwellS: 0.04,
      condition: and(upright, combatBand, gte(lateral, metres(0))),
      utility: scalar(28), parameters: { direction: parameter(scalar(1)) } }),
    rule({ id: "sweep-opponent-left", action: "sweep", priority: 70, optional: false, dwellS: 0.04,
      condition: and(upright, combatBand, lt(lateral, metres(0))),
      utility: scalar(28), parameters: { direction: parameter(scalar(-1)) } }),
    rule({ id: "brace-during-sweep", action: "brace", priority: 65, optional: false, dwellS: 0.03,
      condition: and(upright, combatBand), utility: scalar(24), parameters: {} }),

    // The Warrior closes under its own policy. A planted counter-fighter proved materially safer
    // than asking the first biped gait prototype to pursue and falling before its first sweep.
    rule({ id: "guard-open-distance", action: "guard", priority: 50, optional: false, dwellS: 0.06,
      condition: and(upright, visible, centred(), atLeast(SWORDBEARER_DUELIST.strikeBelowM)),
      utility: scalar(18), parameters: {} }),
    rule({ id: "brace-open-distance", action: "brace", priority: 40, optional: false, dwellS: 0.04,
      condition: and(upright, centred(), atLeast(SWORDBEARER_DUELIST.strikeBelowM)),
      utility: scalar(15), parameters: {} }),

    // The left arm, waist, neck and head are real free bodies. This disjoint posture group keeps
    // them controlled concurrently; omitting it made an otherwise legal biped program collapse.
    rule({ id: "stabilize-posture", action: "stabilize", priority: 10, optional: false, dwellS: 0,
      condition: Object.freeze({ op: "constant", value: true }), utility: scalar(2), parameters: {} }),
  ]);
  const program = Object.freeze({ version: 1 as const, id: "swordbearer-warrior-duelist", rules });
  validateProgram(program, graph, sensors);
  return program;
}
