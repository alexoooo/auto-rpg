import type { ConstructControlGraph } from "./actions.ts";
import type { ConstructProgram, Expression, ProgramRule } from "./program.ts";
import { validateProgram } from "./program.ts";
import type { SensorSpec } from "./sensors.ts";
import { humanoidLocomotionRules, humanoidOpponentAligned } from "./humanoid-locomotion-program.ts";

/** Distances and speeds are immutable program semantics, not page tuning. */
export const SWORDBEARER_DUELIST = Object.freeze({
  // The supported pair's measured collision envelope bottoms out near 1.03 m. The old 0.82 m
  // threshold was unreachable by construction, so the authored Mind could never demonstrate
  // retreat. The 1.15 m boundary leaves a full sword-length working circle; 1.25 m made the
  // fighter reverse into its own active blade while the Warrior's buckler was still closing.
  retreatBelowM: 1.15,
  // A metre-long sword needs a measured 1.85 m working stop. The controller commits only below
  // 2.10 m, which keeps the physical arc in reach without claiming a hit through an open lane.
  strikeBelowM: 2.10,
  closeAtM: 1.85,
});

const sensor = (id: string): Expression => Object.freeze({ op: "sensor", id });
const scalar = (value: number): Expression => Object.freeze({ op: "constant", value });
const metres = (value: number): Expression => Object.freeze({ op: "constant", value, unit: "metres" });
const radians = (value: number): Expression => Object.freeze({ op: "constant", value, unit: "radians" });
const metresPerSecond = (value: number): Expression => Object.freeze({ op: "constant", value,
  unit: "metres-per-second" });
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
const blockerX = sensor("opponent-blocker-local-x");
const leftArmReady = sensor("left-arm-ready");
const swordReady = sensor("sword-ready");
const coreRoll = sensor("core-roll-rad");
const corePitch = sensor("core-pitch-rad");
const sweepActive: Expression = Object.freeze({ op: "active", action: "sweep" });
const offhandGuardActive: Expression = Object.freeze({ op: "active", action: "offhand-guard" });
const below = (value: number): Expression => lt(range, metres(value));
const atLeast = (value: number): Expression => gte(range, metres(value));
const dodgeBand = and(upright, visible, blockerPresent, atLeast(SWORDBEARER_DUELIST.retreatBelowM),
  below(SWORDBEARER_DUELIST.closeAtM));
const leftOfCore = lt(blockerX, metres(-0.08));
const rightOfCore = gte(blockerX, metres(0.08));
// A supported carrier is still nominally upright while it begins the fast transition into a
// knockdown. Stowing at 0.45 rad gives the physical blade/core contact a motor target before
// that release, rather than waiting for a free falling weapon to solve itself through the core.
const precarious = or(lt(coreRoll, radians(-0.45)), gte(coreRoll, radians(0.45)),
  lt(corePitch, radians(-0.45)), gte(corePitch, radians(0.45)));

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
      condition: and(swordReady, upright, visible, below(SWORDBEARER_DUELIST.retreatBelowM)),
      utility: scalar(31), parameters: {} }),

    // The unarmed left chain has an actual forward-side defensive pose. It deliberately does not
    // claim to cross the chassis: the four declared X hinges cannot do that. The real forearm
    // instead keeps an opponent's blade out of the left-front vital lane without becoming an
    // unearned damage source.
    rule({ id: "offhand-core-guard", action: "offhand-guard", priority: 80, optional: false, dwellS: 0,
      condition: and(leftArmReady, upright, visible, below(SWORDBEARER_DUELIST.strikeBelowM)),
      utility: scalar(27), parameters: {} }),

    // The old raw-gait body could only survive this band by guarding. Assisted support changes the
    // premise: a shield is now something to strike and physically displace, not a reason for two
    // authored Minds to stare forever. Damage still has to cross the ordinary sword collider.
    // Direction is latched by authored policy, not recomputed from a near-zero lateral sensor.
    // The latter restarted almost every sweep as two bodies crossed by millimetres, leaving the
    // blade permanently in its wind phase. The target-centred controller already snapshots and
    // mirrors the actual opponent geometry at Action admission. A falling body is the hard
    // boundary: its live stroke must relinquish scoring and let recovery own the assembly rather
    // than continue to rake an opponent as prone debris.
    rule({ id: "sweep-visible-opponent", action: "sweep", priority: 90, optional: false, dwellS: 0,
      condition: and(swordReady, upright, or(sweepActive, and(visible, combatBand))), utility: scalar(28),
      parameters: { direction: parameter(scalar(1)) } }),
    // A shield tells the Mind which occupied side to leave. The two conditions have an honest
    // 160 mm neutral gap, so they can never request contradictory carrier authority at once.
    rule({ id: "dodge-right-of-shield", action: "dodge-right", priority: 78, optional: false, dwellS: 0.25,
      condition: and(dodgeBand, leftOfCore), utility: scalar(26), parameters: {
        forward: parameter(scalar(0.20)), right: parameter(scalar(1)),
        speed: parameter(metresPerSecond(1.05)),
      } }),
    rule({ id: "dodge-left-of-shield", action: "dodge-left", priority: 78, optional: false, dwellS: 0.25,
      condition: and(dodgeBand, rightOfCore), utility: scalar(26), parameters: {
        forward: parameter(scalar(0.20)), right: parameter(scalar(-1)),
        speed: parameter(metresPerSecond(1.05)),
      } }),
    rule({ id: "brace-shielded-opponent", action: "brace", priority: 65, optional: false, dwellS: 0.03,
      condition: and(upright, aligned, combatBand, below(SWORDBEARER_DUELIST.closeAtM), blockerPresent),
      utility: scalar(24), parameters: {} }),
    rule({ id: "brace-during-unblocked-sweep", action: "brace", priority: 65, optional: false, dwellS: 0.03,
      condition: and(upright, aligned, combatBand, below(SWORDBEARER_DUELIST.closeAtM), not(blockerPresent)),
      utility: scalar(24), parameters: {} }),

    // Guarding at open range can accompany the lower-body close action. It is useful defensive
    // intent rather than a substitute for locomotion, so a lost support chain does not freeze aim.
    rule({ id: "guard-open-distance", action: "guard", priority: 50, optional: false, dwellS: 0.06,
      condition: and(swordReady, upright, visible, atLeast(SWORDBEARER_DUELIST.strikeBelowM)),
      utility: scalar(18), parameters: {} }),
    // Stowing is not an attack. It catches the sword on its declared carrier before prone solver
    // motion can fold the last free swing back through the torso.
    rule({ id: "stow-fallen-sword", action: "stow-sword", priority: 95, optional: false, dwellS: 0,
      condition: and(swordReady, or(not(upright), precarious)), utility: scalar(30), parameters: {
        // The 1.40-rad outward yaw is the shared safe lane. The controller latches the declared
        // alternate pitch only when the live semantic blade/core margin reaches this guardrail.
        yaw: parameter(radians(1.40)), pitch: parameter(radians(0)),
        "tilted-pitch": parameter(radians(0.20)),
        "minimum-clearance-m": parameter(metres(0.05)),
      } }),
    // The normal hold preserves the upper-arm's ordinary opening pose before combat. It yields
    // whenever the real defensive action owns that same declared joint chain; a missing-arm
    // capability is handled by the hardware fact alongside the guard rule.
    rule({ id: "stabilize-posture", action: "stabilize", priority: 10, optional: false, dwellS: 0,
      condition: and(leftArmReady, not(offhandGuardActive)), utility: scalar(2), parameters: {} }),
  ]);
  const program = Object.freeze({ version: 1 as const, id: "swordbearer-warrior-duelist", rules });
  validateProgram(program, graph, sensors);
  return program;
}
