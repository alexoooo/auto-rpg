import { freshIntent } from "../action-primitives.ts";
import type { FighterView, Intent, Mind } from "../mind.ts";
import { MOVEMENT_NAMES, composeTactic, handActionOption, movementIntent,
  type CombatOption, type EffectorName, type HandActionName, type MovementName, type TargetName } from "../options.ts";
import { UNLEARNED_PERSISTENCE, UNLEARNED_STANCE, deployableTactics, type LegalTactic } from "./meta.ts";
import { calibrationRefusal, predictTactical, predictTacticalCell, type CalibrationLimits,
  type TacticalModel, type TacticalState } from "./tactical-model.ts";
import type { DaggerLabel } from "./dagger.ts";

export const LOOKAHEAD_DEPTH = 8;
export const LOOKAHEAD_WIDTH = 6;

/**
 * One cell of the search: a movement, and the whole legal tuple that performs
 * the action.
 *
 * **It was `TacticPair` and two fields until stage C2c**, and the rename is not
 * tidying: a record called a pair carrying four fields is the kind of wrong name
 * this directory's rule about wrong comments is about. What widened is the
 * planner's *key space*, so what a plan names has to widen with it -- otherwise
 * the search chooses an action and the executor is handed an effector and an aim
 * that nothing planned, which is `requireHand`'s old silent hand search wearing a
 * different hat.
 *
 * The stance is deliberately absent and `UNLEARNED_STANCE` carries the
 * measurement that decided it.
 */
export interface PlannedTactic {
  readonly movement: string;
  readonly action: string;
  readonly effector: string;
  readonly target: string;
}
export interface LookaheadResult { readonly tactic: PlannedTactic; readonly score: number; readonly expandedNodes: number;
  readonly sequence: readonly PlannedTactic[]; readonly diagnostics: LookaheadDiagnostics }
export interface LookaheadDiagnostics { readonly outcomePotential: number; readonly attackLikelihood: number;
  readonly exposure: number; readonly stall: number }

/**
 * The one spelling of a tactical cell key, read by the beam, by the calibration
 * filter and by the trace collector in `scripts/train-lookahead.mjs`.
 *
 * It was a template literal at those three sites and stage C2c had to lengthen
 * all three at once -- which is a rule stated three times, and the shape this
 * directory has a gotcha about. A trace row keyed differently from the beam is
 * not a crash: `predictTacticalCell` refuses a key it has never seen, so the
 * whole search would refuse every cell and `lookaheadMind` would report that no
 * model can fly this body, which reads as an under-spent budget rather than as a
 * grammar mismatch.
 */
export const plannedTacticKey = (tactic: PlannedTactic): string =>
  `${tactic.movement}+${tactic.action}+${tactic.effector}+${tactic.target}`;

/** The same cell without its movement: what a *body* offers, which is what a capability signature is about. */
const legalTacticKey = (tactic: Readonly<{ action: string; effector: string; target: string }>): string =>
  `${tactic.action}|${tactic.effector}|${tactic.target}`;

/**
 * The cross product of the movement head and the body's legal tuples, in frozen
 * table order: movement outermost, then whatever order the tuples arrived in.
 *
 * The `supported` predicate this used to take is gone with the widening, and its
 * disappearance is the point rather than a simplification. It existed to filter
 * `MOVEMENT_NAMES x HAND_ACTION_NAMES` down to the actions a body could perform,
 * which is a legality rule -- and legality now arrives already applied, from
 * `deployableTactics`, which is built from the same `tacticEffectors` and
 * `tacticTargets` the executor refuses by. So every cell this produces is one
 * `handActionOption` accepts, by construction rather than by a predicate the
 * caller supplies and could get wrong.
 */
export function supportedPlannedTactics(movements: readonly string[],
  tactics: readonly LegalTactic[]): PlannedTactic[] {
  const result: PlannedTactic[] = [];
  for (const movement of movements) for (const tactic of tactics) {
    result.push(Object.freeze({ movement, action: tactic.action, effector: tactic.effector, target: tactic.target }));
  }
  return result;
}

/**
 * The cells this model can actually predict, out of the ones the body can do.
 *
 * **A per-loadout schedule row cannot describe a mask that depends on live body
 * state, and that is why this is a filter rather than another row.** The
 * look-ahead schedule keys on the loadout a body *started* with; the runtime
 * mask keys on what is still attached. They agree on an intact body and come
 * apart the moment a hand comes off -- a `bow+empty` whose bow hand is severed
 * loses the two-handed weld and its empty hand starts offering `punch`, which
 * the `cover, shoot, recover` row for that loadout was never asked to train. The
 * search then named a cell the model had never seen and threw
 * `tactic "close+punch" has no calibrated model` in the middle of a bout.
 * Severance is routine -- the `duelist-swinger` null control reports 10 severs
 * in 120 bouts -- and adding rows chases states, of which there are more than
 * there are loadouts.
 *
 * **Stage C2c gave it a second job it did not have to be told about.** A severed
 * hand now also takes away *effectors*: `cover` on an intact `sword+empty` is
 * two tuples and one tuple on a body that has lost its shield hand, and the
 * schedule row for the loadout still carries both. The filter answers that for
 * the same reason and with no extra rule, because it asks the model what it has
 * rather than asking the body what it lost.
 *
 * Declining to search a cell is **not** the silent repair the plan forbids.
 * Repairing an illegal action would be: substituting a legal name for one the
 * body cannot perform, so that the decision reported is not the decision made.
 * This narrows only the *search*, and it narrows it by the search's own
 * competence -- the tactics whose predictions the model has calibrated. Every
 * cell that survives is still one `deployableTactics` offered, so the executor
 * below can always enter what is chosen. When nothing survives, `lookaheadMind`
 * refuses by name rather than choosing anyway.
 */
export function calibratedPlannedTactics(model: TacticalModel, tactics: readonly PlannedTactic[],
  bodyLoadout: string, limits: CalibrationLimits): PlannedTactic[] {
  return tactics.filter((tactic) => calibrationRefusal(model, plannedTacticKey(tactic), bodyLoadout, limits) === null);
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

/**
 * Exactly how many nodes a replan expands, which is enforced and not estimated.
 *
 * The beam saturates on the first level for any cell count at or above the
 * width, so this reduces to `43 * cells` for every real body: `1 + 6 * 7` levels
 * of expansion at depth 8 and width 6. There is no pruning relief, which is why
 * the cost of widening the key is exactly linear in the tuple count and why
 * stage C2c's decision about the stance was worth measuring rather than
 * guessing.
 */
export function exactLookaheadNodeBudget(tacticCount: number, depth = LOOKAHEAD_DEPTH, width = LOOKAHEAD_WIDTH): number {
  if (!Number.isInteger(tacticCount) || tacticCount <= 0 || !Number.isInteger(depth) || depth <= 0 ||
      !Number.isInteger(width) || width <= 0) throw new Error("lookahead budget dimensions must be positive integers");
  let beam = 1; let total = 0;
  for (let level = 0; level < depth; level += 1) { total += beam * tacticCount; beam = Math.min(width, beam * tacticCount); }
  return total;
}

/**
 * The beam, and the one number in it that has a ceiling.
 *
 * `order` is the tie-break: a base-`cells` numeral, one digit per level, so two
 * equally scored sequences are separated by the earliest level at which they
 * differ. That is exact only while the numeral fits a double's integer range,
 * `cells^depth <= Number.MAX_SAFE_INTEGER`, which at `depth` 8 is **cells <= 98**
 * -- 98^8 is 8.51e15 and 99^8 is 9.23e15 against a limit of 9.01e15. Past it two
 * distinct orders can round to the same value and the tie-break stops being total,
 * silently: the sort still returns something, and it is no longer the frozen order
 * `reordering_object_properties_does_not_change_the_selected_sequence` pins.
 *
 * **Not a defect today and it is one option away from being one.** The widest
 * shipped body is `sword+empty` at 80 cells; the stance-keyed column the record
 * hands session 20 as a live possibility is **480**, where the numeral overflows by
 * six orders of magnitude. Whoever widens the key past 98 cells at depth 8 owes the
 * tie-break a representation that does not -- a lexicographic compare of the index
 * path, say -- rather than a wider float.
 */
export function boundedLookahead(model: TacticalModel, initial: TacticalState, tactics: readonly PlannedTactic[],
  depth = LOOKAHEAD_DEPTH, width = LOOKAHEAD_WIDTH, bodyLoadout?: string): LookaheadResult {
  // A guard for a direct caller, and no longer the thing a bout hits. It used to
  // be reached from `lookaheadMind` by a fighter that had lost both arms -- a
  // generic throw for a body fact -- which is answered above the call now, by
  // name where the model is at fault and by an inert command where the body is.
  if (!tactics.length) throw new Error("lookahead has no supported tactic cells");
  if (!Number.isInteger(depth) || depth <= 0 || !Number.isInteger(width) || width <= 0) throw new Error("lookahead depth and width must be positive integers");
  let expandedNodes = 0;
  let beam = [{ state: initial, score: scoreState(initial), sequence: [] as PlannedTactic[], order: 0 }];
  for (let level = 0; level < depth; level += 1) {
    const next: typeof beam = [];
    for (const node of beam) tactics.forEach((tactic, tacticIndex) => {
      const key = plannedTacticKey(tactic); const state = bodyLoadout ?
        predictTacticalCell(model, bodyLoadout, key, node.state) : predictTactical(model, key, node.state);
      next.push({ state, score: node.score + scoreDiagnostics(diagnostics(state, node.state)), sequence: [...node.sequence, tactic],
        order: node.order * tactics.length + tacticIndex }); expandedNodes += 1;
    });
    next.sort((a, b) => b.score - a.score || a.order - b.order); beam = next.slice(0, width);
  }
  const best = beam[0];
  if (!best || !best.sequence[0]) throw new Error("lookahead produced no sequence");
  const budget = exactLookaheadNodeBudget(tactics.length, depth, width);
  if (expandedNodes !== budget) throw new Error(`lookahead expanded ${expandedNodes} nodes, expected exact budget ${budget}`);
  return Object.freeze({ tactic: best.sequence[0], score: best.score, expandedNodes,
    sequence: Object.freeze(best.sequence), diagnostics: diagnostics(best.state) });
}

/** Owns the temporal commitment: predictions can request a guard, never steer a committed skill. */
export class LookaheadController {
  private committed: PlannedTactic | null = null;
  choose(model: TacticalModel, initial: TacticalState, tactics: readonly PlannedTactic[], cause: Readonly<{
    tacticComplete: boolean; capabilityChanged: boolean; predictionGuardFired: boolean }>): LookaheadResult | null {
    if (this.committed && !shouldReplan(cause.tacticComplete, cause.capabilityChanged, cause.predictionGuardFired)) return null;
    const result = boundedLookahead(model, initial, tactics); this.committed = result.tactic; return result;
  }
  current(): PlannedTactic | null { return this.committed; }
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

/**
 * Runtime policy seam. It plans only at skill boundaries or when the published
 * capability set changes -- and only over cells this model can predict.
 *
 * It used to call `requireCalibration` on every pair the mask offered and let
 * the first uncalibrated one throw, which made a routine severance fatal:
 * `calibratedPlannedTactics` above carries why a schedule row cannot answer that
 * and a filter can.
 *
 * **The capability signature is the tuple set, not the action set.** It was the
 * sorted action names until stage C2c, and an action set cannot see a lost
 * effector. `sword+shield` is the body that shows it: lose the shield hand and it
 * still offers `cover`, `cut`, `thrust` and `recover` -- the same four names --
 * while four of its fourteen tuples have gone with the hand, so the signature was
 * equal and no replan fired. (`sword+empty` does not show it, because its off
 * hand is the only one that can `punch`, so losing it moves the action set too.
 * A rule checked only against the loadout that happens to expose it is a rule
 * with one witness.) The plan would then stay committed until the skill finished
 * on its own, and if the committed tuple had named the lost hand,
 * `handActionOption`'s per-step check refuses it by name mid-skill -- a throw
 * where a replan was available. Keying on the tuples costs one join of a list the
 * search is about to build anyway.
 *
 * **`onDecision` gets a whole `DaggerLabel` and an EMPTY feature vector, and that
 * asymmetry is stated here because the type cannot state it.** The other three
 * algorithms reach the hook through `researchLabelMind`, which writes a real
 * `FeatureWriter` vector and passes it; this seam has no `FeatureWriter` and hands
 * `[]`. The label is uniform across the four and the features are not. Nothing
 * currently reads them on this path -- the one row-writing hook is DAgger's, and
 * `research-havok.mjs` ignores the argument -- but `DeployedDecisionLabel`'s note
 * makes the label uniform, and a reader who took the whole signature as uniform
 * would build rows of nothing here. Whoever gives this seam a row writer gives it a
 * `FeatureWriter` first, on the same `setTactic`-then-`write` cadence
 * `researchLabelMind` uses, and deletes this paragraph.
 */
export function lookaheadMind(model: TacticalModel, bodyLoadout: string, limits: CalibrationLimits,
  depth = LOOKAHEAD_DEPTH, width = LOOKAHEAD_WIDTH,
  onDecision?: (view: FighterView, features: readonly number[], label: DaggerLabel) => void): Mind {
  let movement: MovementName = "hold"; let action: HandActionName = "recover";
  let planned: PlannedTactic | null = null; let option: CombatOption | null = null;
  let capability = "";
  return { name: `lookahead-${bodyLoadout}`, decide(view: FighterView, dt: number): Intent {
    // A body with no attached hand and no jaws can perform nothing, which is a
    // fact about the body rather than about the model, so it is inert and not a
    // refusal -- the same answer `researchLabelMind` gives on the same empty
    // mask. `boundedLookahead` used to be handed the empty cell list and throw
    // `lookahead has no supported tactic cells` mid-bout for a fighter that had
    // simply lost both arms. Asked of `deployableTactics` rather than of
    // `deployableActions`, which is the same question one layer down: the tuple
    // list is empty exactly when the action mask is, because `recover` is
    // unconditional and answers the natural effector on a body with no hand.
    const legal = deployableTactics(view);
    if (!legal.length) { option = null; planned = null; return freshIntent(); }
    const offered = new Set(legal.map(legalTacticKey));
    const nextCapability = [...offered].sort().join(" ");
    const changed = capability !== "" && capability !== nextCapability;
    if (!option || option.done(view) || changed || !planned || !offered.has(legalTacticKey(planned))) {
      const searchable = calibratedPlannedTactics(model, supportedPlannedTactics(MOVEMENT_NAMES, legal), bodyLoadout, limits);
      if (!searchable.length) {
        throw new Error(`lookahead refuses ${bodyLoadout}: no calibrated model for any tactic on ` +
          `[${[...new Set(legal.map((tactic) => tactic.action))].join(", ")}]`);
      }
      const selected = boundedLookahead(model, tacticalStateFromView(view), searchable, depth, width, bodyLoadout).tactic;
      planned = selected; movement = selected.movement as MovementName; action = selected.action as HandActionName;
      // Four of the six fields are the plan's own; the other two are named
      // constants and say so. `UNLEARNED_STANCE` carries the measurement that
      // kept the stance out of the beam, and `UNLEARNED_PERSISTENCE` is the same
      // 0.4 PPO writes -- both were literals here for exactly as long as this
      // file was another stage's.
      option = handActionOption(action, { effector: selected.effector as EffectorName,
        target: selected.target as TargetName, stance: UNLEARNED_STANCE });
      option.enter(view); capability = nextCapability;
      // `[]` and not a feature vector: this seam owns no `FeatureWriter`. The
      // docstring above says so, because the parameter's type cannot.
      onDecision?.(view, [], { movement, action, effector: selected.effector, target: selected.target,
        stance: UNLEARNED_STANCE, persistence: UNLEARNED_PERSISTENCE });
    }
    return composeTactic(view, movement, action, movementIntent(movement, view), option.decide(view, dt));
  } };
}
