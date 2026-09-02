import type { ConstructControlGraph } from "./actions.ts";
import type { ConstructProgram, Expression, ProgramRule } from "./program.ts";
import { validateProgram } from "./program.ts";
import type { SensorSpec } from "./sensors.ts";
import { humanoidLocomotionRules, humanoidOpponentAligned } from "./humanoid-locomotion-program.ts";

/** Distances and speeds are immutable program semantics, not page tuning. */
export const SWORDBEARER_DUELIST = Object.freeze({
  // The supported pair's measured collision envelope bottoms out near 1.03 m. The old 0.82 m
  // threshold was unreachable by construction, so the authored Mind could never demonstrate
  // retreat. The 1.25 m boundary admits the retreat before the first supported weapon shove can
  // release the body; the narrower 1.12 m bracket reached range but was knocked down first.
  retreatBelowM: 1.25,
  strikeBelowM: 2.60,
  closeAtM: 1.35,
});

const sensor = (id: string): Expression => Object.freeze({ op: "sensor", id });
const scalar = (value: number): Expression => Object.freeze({ op: "constant", value });
const metres = (value: number): Expression => Object.freeze({ op: "constant", value, unit: "metres" });
const and = (...values: Expression[]): Expression => Object.freeze({ op: "and", values: Object.freeze(values) });
const or = (...values: Expression[]): Expression => Object.freeze({ op: "or", values: Object.freeze(values) });
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
const sweepActive: Expression = Object.freeze({ op: "active", action: "sweep" });
const below = (value: number): Expression => lt(range, metres(value));
const atLeast = (value: number): Expression => gte(range, metres(value));

/**
 * The committed biped tactics use only the Swordbearer's declared public Actions.
 *
 * Full and one-support locomotion remain ordinary declared Actions. Sword rules likewise share the
 * physical mount. That is a tactical choice, not scheduler-refusal roulette; every simultaneous
 * pair below either owns different motor groups or is refused by the graph before execution.
 */
export function swordbearerDuelistProgram(
  graph: ConstructControlGraph,
  sensors: readonly SensorSpec[],
): ConstructProgram {
  const combatBand = and(atLeast(SWORDBEARER_DUELIST.retreatBelowM),
    below(SWORDBEARER_DUELIST.strikeBelowM));
  const aligned = humanoidOpponentAligned();
  const rules: readonly ProgramRule[] = Object.freeze([
    ...humanoidLocomotionRules({ retreatBelowM: SWORDBEARER_DUELIST.retreatBelowM,
      closeAtM: SWORDBEARER_DUELIST.closeAtM }),
    rule({ id: "guard-clinch", action: "guard", priority: 79, optional: false, dwellS: 0.03,
      condition: and(upright, visible, below(SWORDBEARER_DUELIST.retreatBelowM)),
      utility: scalar(31), parameters: {} }),

    // The old raw-gait body could only survive this band by guarding. Assisted support changes the
    // premise: a shield is now something to strike and physically displace, not a reason for two
    // authored Minds to stare forever. Damage still has to cross the ordinary sword collider.
    // Direction is latched by authored policy, not recomputed from a near-zero lateral sensor.
    // The latter restarted almost every sweep as two bodies crossed by millimetres, leaving the
    // blade permanently in its wind phase. The target-centred controller already snapshots and
    // mirrors the actual opponent geometry at Action admission. Once admitted, `active` keeps the
    // same request above the clinch guard until the physical controller completes; transient LOS
    // and range changes used to withdraw a healthy sweep halfway through its first stroke.
    rule({ id: "sweep-visible-opponent", action: "sweep", priority: 90, optional: false, dwellS: 0,
      condition: or(sweepActive, and(upright, visible, combatBand)), utility: scalar(28),
      parameters: { direction: parameter(scalar(1)) } }),
    rule({ id: "brace-shielded-opponent", action: "brace", priority: 65, optional: false, dwellS: 0.03,
      condition: and(upright, aligned, combatBand, below(SWORDBEARER_DUELIST.closeAtM), blockerPresent),
      utility: scalar(24), parameters: {} }),
    rule({ id: "brace-during-unblocked-sweep", action: "brace", priority: 65, optional: false, dwellS: 0.03,
      condition: and(upright, aligned, combatBand, below(SWORDBEARER_DUELIST.closeAtM), not(blockerPresent)),
      utility: scalar(24), parameters: {} }),

    // Guarding at open range can accompany the lower-body close action. It is useful defensive
    // intent rather than a substitute for locomotion, so a lost support chain does not freeze aim.
    rule({ id: "guard-open-distance", action: "guard", priority: 50, optional: false, dwellS: 0.06,
      condition: and(upright, visible, atLeast(SWORDBEARER_DUELIST.strikeBelowM)),
      utility: scalar(18), parameters: {} }),
    // The left arm remains a real free chain while the locomotion Action owns the body support.
    rule({ id: "stabilize-posture", action: "stabilize", priority: 10, optional: false, dwellS: 0,
      condition: Object.freeze({ op: "constant", value: true }), utility: scalar(2), parameters: {} }),
  ]);
  const program = Object.freeze({ version: 1 as const, id: "swordbearer-warrior-duelist", rules });
  validateProgram(program, graph, sensors);
  return program;
}
