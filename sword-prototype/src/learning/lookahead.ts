import type { FighterView, Intent, Mind } from "../mind.ts";
import { HAND_ACTION_NAMES, MOVEMENT_NAMES, asMeasured, chooseEffector, composeTactic, handActionOption, movementIntent,
  type CombatOption, type HandActionName, type MovementName } from "../options.ts";
import { deployableActions } from "./meta.ts";
import { predictTactical, predictTacticalCell, requireCalibration, type CalibrationLimits,
  type TacticalModel, type TacticalState } from "./tactical-model.ts";

export const LOOKAHEAD_DEPTH = 8;
export const LOOKAHEAD_WIDTH = 6;

export interface TacticPair { readonly movement: string; readonly action: string }
export interface LookaheadResult { readonly pair: TacticPair; readonly score: number; readonly expandedNodes: number;
  readonly sequence: readonly TacticPair[]; readonly diagnostics: LookaheadDiagnostics }
export interface LookaheadDiagnostics { readonly outcomePotential: number; readonly attackLikelihood: number;
  readonly exposure: number; readonly stall: number }

export function supportedTacticPairs(movements: readonly string[], actions: readonly string[],
  supported: (pair: TacticPair) => boolean): TacticPair[] {
  const result: TacticPair[] = [];
  for (const movement of movements) for (const action of actions) {
    const pair = Object.freeze({ movement, action }); if (supported(pair)) result.push(pair);
  }
  return result;
}

const diagnostics = (state: TacticalState, previous: TacticalState = state): LookaheadDiagnostics => Object.freeze({
  outcomePotential: state.vitalityPotential,
  attackLikelihood: Math.max(0, Math.min(1, state.contactProbability + Math.max(0, state.reachMargin - previous.reachMargin))),
  exposure: Math.max(0, state.threatAlignment) + Math.abs(state.facingError) * 0.375,
  stall: Math.abs(state.reachMargin - previous.reachMargin) < 1e-6 && state.contactProbability < 0.05 ? 1 : 0,
});
const scoreDiagnostics = (value: LookaheadDiagnostics): number => value.outcomePotential + value.attackLikelihood * 0.8 -
  value.exposure * 0.4 - value.stall * 0.25;
const scoreState = (state: TacticalState): number => scoreDiagnostics(diagnostics(state));

export function exactLookaheadNodeBudget(pairCount: number, depth = LOOKAHEAD_DEPTH, width = LOOKAHEAD_WIDTH): number {
  if (!Number.isInteger(pairCount) || pairCount <= 0 || !Number.isInteger(depth) || depth <= 0 ||
      !Number.isInteger(width) || width <= 0) throw new Error("lookahead budget dimensions must be positive integers");
  let beam = 1; let total = 0;
  for (let level = 0; level < depth; level += 1) { total += beam * pairCount; beam = Math.min(width, beam * pairCount); }
  return total;
}

export function boundedLookahead(model: TacticalModel, initial: TacticalState, pairs: readonly TacticPair[],
  depth = LOOKAHEAD_DEPTH, width = LOOKAHEAD_WIDTH, bodyLoadout?: string): LookaheadResult {
  if (!pairs.length) throw new Error("lookahead has no supported tactic pairs");
  if (!Number.isInteger(depth) || depth <= 0 || !Number.isInteger(width) || width <= 0) throw new Error("lookahead depth and width must be positive integers");
  let expandedNodes = 0;
  let beam = [{ state: initial, score: scoreState(initial), sequence: [] as TacticPair[], order: 0 }];
  for (let level = 0; level < depth; level += 1) {
    const next: typeof beam = [];
    for (const node of beam) pairs.forEach((pair, pairIndex) => {
      const key = `${pair.movement}+${pair.action}`; const state = bodyLoadout ?
        predictTacticalCell(model, bodyLoadout, key, node.state) : predictTactical(model, key, node.state);
      next.push({ state, score: node.score + scoreDiagnostics(diagnostics(state, node.state)), sequence: [...node.sequence, pair],
        order: node.order * pairs.length + pairIndex }); expandedNodes += 1;
    });
    next.sort((a, b) => b.score - a.score || a.order - b.order); beam = next.slice(0, width);
  }
  const best = beam[0];
  if (!best || !best.sequence[0]) throw new Error("lookahead produced no sequence");
  const budget = exactLookaheadNodeBudget(pairs.length, depth, width);
  if (expandedNodes !== budget) throw new Error(`lookahead expanded ${expandedNodes} nodes, expected exact budget ${budget}`);
  return Object.freeze({ pair: best.sequence[0], score: best.score, expandedNodes,
    sequence: Object.freeze(best.sequence), diagnostics: diagnostics(best.state) });
}

/** Owns the temporal commitment: predictions can request a guard, never steer a committed skill. */
export class LookaheadController {
  private committed: TacticPair | null = null;
  choose(model: TacticalModel, initial: TacticalState, pairs: readonly TacticPair[], cause: Readonly<{
    tacticComplete: boolean; capabilityChanged: boolean; predictionGuardFired: boolean }>): LookaheadResult | null {
    if (this.committed && !shouldReplan(cause.tacticComplete, cause.capabilityChanged, cause.predictionGuardFired)) return null;
    const result = boundedLookahead(model, initial, pairs); this.committed = result.pair; return result;
  }
  current(): TacticPair | null { return this.committed; }
  clear(): void { this.committed = null; }
}

export function shouldReplan(tacticComplete: boolean, capabilityChanged: boolean, predictionGuardFired: boolean): boolean {
  return tacticComplete || capabilityChanged || predictionGuardFired;
}

const wrapAngle = (value: number): number => { while (value > Math.PI) value -= Math.PI * 2;
  while (value < -Math.PI) value += Math.PI * 2; return value; };
export function tacticalStateFromView(view: FighterView, contactProbability = 0): TacticalState {
  const bearing = Math.atan2(view.opponent.ground.x - view.self.ground.x, view.opponent.ground.z - view.self.ground.z);
  const threats = Object.values(view.opponent.hands).filter((hand) => !hand.lost).sort((a, b) => b.tipSpeed - a.tipSpeed);
  const offensiveReach = Math.max(view.self.reach,
    ...Object.values(view.self.hands).filter((hand) => !hand.lost).map((hand) => hand.reach));
  return Object.freeze({ reachMargin: offensiveReach + view.opponent.collisionRadius - view.measure,
    facingError: wrapAngle(bearing - view.self.facing), threatAlignment: threats[0] ? Math.min(1, threats[0].tipSpeed / 30) : 0,
    contactProbability, vitalityPotential: view.self.vitality - view.opponent.vitality });
}

/** Runtime policy seam. It plans only at skill boundaries or when the published capability set changes. */
export function lookaheadMind(model: TacticalModel, bodyLoadout: string, limits: CalibrationLimits,
  depth = LOOKAHEAD_DEPTH, width = LOOKAHEAD_WIDTH,
  onDecision?: (view: FighterView, features: readonly number[], label: { movement: string; action: string; persistence: number }) => void): Mind {
  let movement: MovementName = "hold"; let action: HandActionName = "recover"; let option: CombatOption | null = null;
  let capability = "";
  return { name: `lookahead-${bodyLoadout}`, decide(view: FighterView, dt: number): Intent {
    const allowed = deployableActions(view);
    const nextCapability = [...allowed].sort().join("|"); const changed = capability !== "" && capability !== nextCapability;
    if (!option || option.done(view) || changed || !allowed.has(action)) {
      const pairs = supportedTacticPairs(MOVEMENT_NAMES, HAND_ACTION_NAMES,
        (pair) => allowed.has(pair.action as HandActionName));
      for (const pair of pairs) requireCalibration(model, `${pair.movement}+${pair.action}`, bodyLoadout, limits);
      const selected = boundedLookahead(model, tacticalStateFromView(view), pairs, depth, width, bodyLoadout).pair;
      movement = selected.movement as MovementName; action = selected.action as HandActionName;
      // Named, not defaulted: the look-ahead model is keyed on (movement,
      // action) alone, so the other two thirds of a tactic-v2 decision are the
      // measured line and the skill's own pose until session 20 widens the
      // cells. Saying so at the call site is what keeps that a decision.
      const effector = chooseEffector(view, action);
      if (effector === null) throw new Error(`lookahead refuses ${bodyLoadout}: no effector can perform "${action}"`);
      option = handActionOption(action, asMeasured(effector)); option.enter(view); capability = nextCapability;
      onDecision?.(view, [], { movement, action, persistence: 0.4 });
    }
    return composeTactic(view, movement, action, movementIntent(movement, view), option.decide(view, dt));
  } };
}
