import type { ConstructControlGraph } from "./actions.ts";
import type { ConstructProgram, Expression, ProgramRule } from "./program.ts";
import { validateProgram } from "./program.ts";
import type { SensorSpec } from "./sensors.ts";

/** Distances and speeds are immutable program semantics, not page tuning. */
export const SWORDBEARER_DUELIST = Object.freeze({
  retreatBelowM: 0.82,
  strikeBelowM: 2.60,
});

const sensor = (id: string): Expression => Object.freeze({ op: "sensor", id });
const scalar = (value: number): Expression => Object.freeze({ op: "constant", value });
const metres = (value: number): Expression => Object.freeze({ op: "constant", value, unit: "metres" });
const and = (...values: Expression[]): Expression => Object.freeze({ op: "and", values: Object.freeze(values) });
const not = (value: Expression): Expression => Object.freeze({ op: "not", value });
const lt = (left: Expression, right: Expression): Expression => Object.freeze({ op: "lt", left, right });
const gte = (left: Expression, right: Expression): Expression => Object.freeze({ op: "gte", left, right });
const parameter = (value: Expression) => Object.freeze({ kind: "expression" as const, value });
const rule = (value: ProgramRule): ProgramRule => Object.freeze({ ...value,
  parameters: Object.freeze(value.parameters) });

const upright = sensor("core-upright");
const visible = sensor("line-of-sight");
const range = sensor("opponent-range");
const blockerPresent = sensor("opponent-blocker-present");
const below = (value: number): Expression => lt(range, metres(value));
const atLeast = (value: number): Expression => gte(range, metres(value));

/**
 * The committed biped tactics use only the Swordbearer's declared public Actions.
 *
 * Leg support and recovery share one group. Sword rules likewise share the physical mount. That is
 * a tactical choice, not scheduler-refusal roulette; every simultaneous pair below owns different
 * motor groups. The unqualified gait is absent rather than accepted and silently dishonoured.
 */
export function swordbearerDuelistProgram(
  graph: ConstructControlGraph,
  sensors: readonly SensorSpec[],
): ConstructProgram {
  const combatBand = and(atLeast(SWORDBEARER_DUELIST.retreatBelowM),
    below(SWORDBEARER_DUELIST.strikeBelowM));
  const rules: readonly ProgramRule[] = Object.freeze([
    // A clinch leaves no sword travel. The gait is not qualified, so both independently-owned
    // groups defend physically instead of pretending a retreat request can move this chassis.
    rule({ id: "brace-clinch", action: "brace", priority: 80, optional: false, dwellS: 0.03,
      condition: and(upright, below(SWORDBEARER_DUELIST.retreatBelowM)),
      utility: scalar(32), parameters: {} }),
    rule({ id: "guard-clinch", action: "guard", priority: 79, optional: false, dwellS: 0.03,
      condition: and(upright, visible, below(SWORDBEARER_DUELIST.retreatBelowM)),
      utility: scalar(31), parameters: {} }),

    // The rejected one-arm beat depended on a lossy collision pulse and never displaced the
    // buckler. A shielded opponent therefore gets an honest planted guard, not a relabelled attack.
    rule({ id: "guard-shielded-opponent", action: "guard", priority: 70, optional: false, dwellS: 0.03,
      condition: and(upright, visible, combatBand, blockerPresent), utility: scalar(28), parameters: {} }),
    rule({ id: "brace-shielded-opponent", action: "brace", priority: 65, optional: false, dwellS: 0.03,
      condition: and(upright, combatBand, blockerPresent), utility: scalar(24), parameters: {} }),
    rule({ id: "sweep-unblocked-opponent", action: "sweep", priority: 70, optional: false, dwellS: 0,
      condition: and(upright, visible, combatBand, not(blockerPresent)), utility: scalar(28),
      parameters: { direction: parameter(scalar(1)) } }),
    rule({ id: "brace-during-unblocked-sweep", action: "brace", priority: 65, optional: false, dwellS: 0.03,
      condition: and(upright, combatBand, not(blockerPresent)), utility: scalar(24), parameters: {} }),

    // The Warrior closes under its own policy. A planted counter-fighter proved materially safer
    // than asking the first biped gait prototype to pursue and falling before its first sweep.
    rule({ id: "guard-open-distance", action: "guard", priority: 50, optional: false, dwellS: 0.06,
      condition: and(upright, visible, atLeast(SWORDBEARER_DUELIST.strikeBelowM)),
      utility: scalar(18), parameters: {} }),
    rule({ id: "brace-open-distance", action: "brace", priority: 40, optional: false, dwellS: 0.04,
      condition: and(upright, atLeast(SWORDBEARER_DUELIST.strikeBelowM)),
      utility: scalar(15), parameters: {} }),

    // The left arm, waist, neck and head are real free bodies. This disjoint posture group keeps
    // them controlled concurrently while upright; omitting it made an otherwise legal planted
    // program collapse. Once fallen, no recovery request is fabricated.
    rule({ id: "stabilize-posture", action: "stabilize", priority: 10, optional: false, dwellS: 0,
      condition: Object.freeze({ op: "constant", value: true }), utility: scalar(2), parameters: {} }),
  ]);
  const program = Object.freeze({ version: 1 as const, id: "swordbearer-warrior-duelist", rules });
  validateProgram(program, graph, sensors);
  return program;
}
