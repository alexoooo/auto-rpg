import { hasPoint, isShooting, isStriking, type WeaponKind } from "../hands.ts";
import { freshIntent } from "../action-primitives.ts";
import { ATTACK_OPTION_NAMES, HAND_ACTION_NAMES, MOVEMENT_NAMES, TACTIC_NAMES, composeTactic, handActionOption, movementIntent,
  type BehaviourRecord, type CombatOption, type HandActionName, type MovementName, type OptionName } from "../options.ts";
import type { FighterView, Mind } from "../mind.ts";
import { SeededRng } from "./rng.ts";

export const MIN_PERSISTENCE = 0.10;
export const MAX_PERSISTENCE = 0.80;
/**
 * The ordered output contract every learned controller writes into.
 *
 * Nothing in production reads it yet, which is the problem it names rather than a
 * reason to delete it. The `[5 movement][7 action][1 persistence]` layout is
 * re-derived from `MOVEMENT_NAMES.length` at four independent sites --
 * `deployment.ts` twice, once for the width and once for the two slice offsets,
 * `train-neat-qd.mjs` and `research-rollout-worker.mjs` -- plus the artifact
 * fixture in `tests/tournament-executor.test.mjs`. Each is a separate chance to
 * get an offset wrong the next time the width moves, and the width is about to.
 * This is the table they are meant to collapse onto; `tests/learning.test.mjs`
 * pins it against the two vocabularies it is built from in the meantime.
 */
export const META_OUTPUT_NAMES = Object.freeze([...MOVEMENT_NAMES, ...HAND_ACTION_NAMES, "persistence"]);

const has = (view: FighterView, predicate: (kind: WeaponKind) => boolean): boolean =>
  Object.values(view.self.hands).some((hand) => !hand.lost && predicate(hand.weapon));
export function supportedOptions(view: FighterView): ReadonlySet<OptionName> {
  if (!Object.values(view.self.hands).some((hand) => !hand.lost) && !Object.keys(view.self.naturalAttacks ?? {}).length) return new Set<OptionName>();
  const values = new Set<OptionName>([...MOVEMENT_NAMES, "recover"]);
  if (Object.values(view.self.hands).some((hand) => !hand.lost)) values.add("cover");
  if (has(view, (kind) => isStriking(kind) && kind !== "empty")) values.add("cut");
  if (has(view, hasPoint)) values.add("thrust");
  if (has(view, (kind) => kind === "empty")) values.add("punch");
  if (has(view, isShooting)) values.add("shoot");
  if (view.self.naturalAttacks?.bite) values.add("bite");
  return values;
}

/**
 * What a deployed controller may choose: `supportedOptions` with `cover`
 * removed when no hand survives.
 *
 * One function because it was three verbatim copies, and the one that mattered
 * was not the one anybody was reading. `deployment.ts` projected it onto indices
 * for the argmax, `lookahead.ts` built its capability signature from it, and
 * `research-policy.ts` held its own -- and it is *that* copy the
 * `research policy produced unsupported action` refusal reads, so an edit to the
 * argmax's mask alone would have masked one policy and executed another. Three
 * copies of a legality rule with the argmax on one and the refusal on another is
 * the shape this directory's rule about a caller holding its own copy is about.
 *
 * **The `cover` deletion is redundant against `supportedOptions` today**, which
 * is measured rather than assumed: `supportedOptions` adds `cover` only when a
 * hand is attached, so the delete fires exactly when there is nothing to delete.
 * Removing it entirely changed **zero** of 394 probed capability cells (every
 * ordered weapon pair, both loss flags, with and without a natural bite, plus
 * the handless body), while removing `thrust` from the same line moved 324 lines
 * of that record -- so the probe can see a mask change and this one is not one.
 * It stays because it is the statement the deployment seam makes on its own
 * behalf: `cover` needs a hand, and nothing below here re-checks that. It also
 * explains how three copies drifted apart unnoticed -- a redundant guard is a
 * guard nothing can catch you getting wrong.
 *
 * `recover` is unconditional and `cover` is not, and that asymmetry is
 * load-bearing: it is the fix the last exhaustive look-ahead run bought, having
 * exposed a hand-only recovery path in Centipede. A fighter with no attached
 * hand must still have a legal set or `maskedArgmax` throws on it.
 */
export function deployableActions(view: FighterView): ReadonlySet<OptionName> {
  const allowed = new Set(supportedOptions(view));
  if (!Object.values(view.self.hands).some((hand) => !hand.lost)) allowed.delete("cover");
  return allowed;
}

export interface MetaLogit {
  readonly option: OptionName;
  readonly value: number;
}

export interface MetaDiagnostic {
  readonly option: OptionName;
  readonly movement: MovementName;
  readonly action: HandActionName;
  readonly persistenceSeconds: number;
  readonly persistenceRemaining: number;
  readonly topLogits: readonly MetaLogit[];
}

export interface MetaMind extends Mind {
  readonly selected: OptionName;
  readonly selectedMovement: MovementName;
  readonly selectedAction: HandActionName;
  readonly switches: number;
  readonly entries: Readonly<Record<OptionName, number>>;
  /** A frozen reading of the last decision. Reading it never runs the policy. */
  diagnostic(): MetaDiagnostic;
}

const EMPTY_LOGITS: readonly MetaLogit[] = Object.freeze([]);
/** The one constructor for a `MetaDiagnostic`, shared with the research minds. */
export const metaDiagnosticSnapshot = (
  option: OptionName, movement: MovementName, action: HandActionName,
  persistenceSeconds: number,
  persistenceRemaining: number,
  logits: readonly MetaLogit[] = EMPTY_LOGITS,
): MetaDiagnostic => Object.freeze({
  option,
  movement,
  action,
  persistenceSeconds,
  persistenceRemaining,
  topLogits: Object.freeze(logits.map((row) => Object.freeze({ ...row }))),
});

export function randomMetaMind(seed: number): MetaMind {
  const rng = new SeededRng(seed); let selectedMovement: MovementName = "hold"; let selectedAction: HandActionName = "recover";
  let current: CombatOption | null = null; let until = -1; let switches = 0;
  const entries = Object.fromEntries(TACTIC_NAMES.map((name) => [name, 0])) as Record<OptionName, number>;
  let persistenceSeconds = 0; let observedClock = 0;
  return { name: "random-meta-control", get selected() { return selectedAction; }, get selectedMovement() { return selectedMovement; },
    get selectedAction() { return selectedAction; }, get switches() { return switches; }, entries,
    diagnostic() { return metaDiagnosticSnapshot(selectedAction, selectedMovement, selectedAction, persistenceSeconds, Math.max(0, until - observedClock)); },
    decide(view, dt) {
    observedClock = view.clock;
    if (supportedOptions(view).size === 0) { current = null; if (selectedAction !== "recover" || selectedMovement !== "hold") switches += 1;
      selectedMovement = "hold"; selectedAction = "recover"; return freshIntent(); }
    if (!current || current.done(view) || view.clock >= until || !supportedOptions(view).has(selectedAction)) {
      const nextMovement = rng.choose(MOVEMENT_NAMES); const actions = HAND_ACTION_NAMES.filter((name) => supportedOptions(view).has(name));
      const nextAction = rng.choose(actions); if (current && (nextMovement !== selectedMovement || nextAction !== selectedAction)) switches += 1;
      selectedMovement = nextMovement; selectedAction = nextAction; current = handActionOption(selectedAction); current.enter(view);
      entries[selectedMovement] += 1; entries[selectedAction] += 1;
      persistenceSeconds = MIN_PERSISTENCE + rng.next() * (MAX_PERSISTENCE - MIN_PERSISTENCE); until = view.clock + persistenceSeconds;
    }
    return composeTactic(view, selectedMovement, selectedAction, movementIntent(selectedMovement, view), current.decide(view, dt));
  } };
}

export function metaDiagnostic(mind: Mind): MetaDiagnostic | null {
  const candidate = mind as Partial<MetaMind>;
  return typeof candidate.diagnostic === "function" ? candidate.diagnostic() : null;
}

/**
 * The three below lost their last non-test caller in session 17.
 *
 * `train-meta.mjs` and `training-evaluator.mjs` were the only things that scored
 * a genome with them; the four research directions score through
 * `scripts/research-havok.mjs` and `learning/tournament.ts` instead. They are
 * kept for now because each carries a decision the tests state as a sentence --
 * a draw and a loss are both terminal failures, elapsed survival is worth
 * exactly zero, engagement is a hard feasibility gate rather than positive
 * reward, and novelty may guide search but may not change a verdict -- and
 * `tournament.ts` re-expresses those in its own terms rather than importing
 * them. Whoever confirms the two agree deletes these; nobody has.
 */
export interface FitnessComponents { feasible: boolean; win: number; vitality: number; efficiency: number; survival: number; switchCost: number; total: number }
export function fitnessComponents(record: BehaviourRecord, opponentVitality: number, switches: number): FitnessComponents {
  // A time-cap draw and a loss are both terminal failures. Elapsed survival
  // previously paid a healthy runner for avoiding the fight; it is retained as
  // a zero-valued report field only so old experiment readers refuse no rows.
  const win = record.win ? 4 : -4; const vitality = Math.max(-0.5, Math.min(0.5, (record.vitality - opponentVitality) * 0.5));
  const efficiency = Math.min(0.5, record.damage / Math.max(1, record.damage + (1 - record.vitality) * 300) * 0.5);
  const survival = 0;
  const feasible = record.engagement.attacksInWindow > 0 ||
    (record.engagement.viableOpportunities === 0 && record.engagement.retreatOutsideReachSeconds === 0);
  const switchCost = Math.min(0.5, switches * 0.01); return { feasible, win, vitality, efficiency, survival, switchCost,
    total: (feasible ? 0 : -100) + win + vitality + efficiency - switchCost };
}

export function noveltyDescriptor(record: BehaviourRecord): number[] {
  const seconds = Math.max(record.seconds, 1e-9); const attacks = ATTACK_OPTION_NAMES.reduce((sum, name) => sum + record.attackAttempts[name], 0);
  return [...record.rangeBins.map((value) => value / seconds), Math.min(1, record.blocks / Math.max(1, attacks * 10)),
    record.contacts.primary / Math.max(1, record.contacts.primary + record.contacts.secondary),
    Math.min(1, Object.keys(record.transitions).length / Math.max(1, attacks)), record.crouchTime / seconds,
    Math.min(1, record.trunkTwistSignChanges / seconds)];
}

export function noveltyScore(descriptor: readonly number[], archive: readonly (readonly number[])[], neighbours = 5): number {
  if (!archive.length) return 0;
  const distances = archive.map((other) => Math.hypot(...descriptor.map((value, index) => value - (other[index] ?? 0)))).sort((a, b) => a - b);
  const nearest = distances.slice(0, Math.min(neighbours, distances.length)); return nearest.reduce((a, b) => a + b, 0) / nearest.length;
}
