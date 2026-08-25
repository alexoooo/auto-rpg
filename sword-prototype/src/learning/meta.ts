import { freshIntent } from "../action-primitives.ts";
import { ATTACK_OPTION_NAMES, HAND_ACTION_NAMES, MOVEMENT_NAMES, TACTIC_NAMES, asMeasured, chooseEffector, composeTactic,
  handActionOption, movementIntent, tacticEffectors, tacticTargets,
  type BehaviourRecord, type CombatOption, type EffectorName, type HandActionName, type MovementName, type OptionName,
  type TargetName } from "../options.ts";
import type { FighterView, Mind } from "../mind.ts";
import { SeededRng } from "./rng.ts";

export const MIN_PERSISTENCE = 0.10;
export const MAX_PERSISTENCE = 0.80;
/**
 * The ordered output contract every learned controller writes into.
 *
 * `tests/learning.test.mjs` pins it against the two vocabularies it is built
 * from, so the names cannot drift from the tables the executor refuses by.
 */
export const META_OUTPUT_NAMES: readonly string[] = Object.freeze([...MOVEMENT_NAMES, ...HAND_ACTION_NAMES, "persistence"]);

/**
 * The same contract as offsets, because five places were deriving them.
 *
 * The `[5 movement][7 action][1 persistence]` layout was re-derived from
 * `MOVEMENT_NAMES.length` independently at `deployment.ts` twice -- once for the
 * width and once for the two slice bounds -- at `train-neat-qd.mjs`, at
 * `research-rollout-worker.mjs`, and in the artifact fixture in
 * `tests/tournament-executor.test.mjs`. Five chances to get an offset wrong the
 * next time the width moves, and the width is about to move to 26.
 *
 * **The `-1` was the one that could not survive it.** `deployment.ts` sliced the
 * action half as `values.slice(MOVEMENT_NAMES.length, -1)` and read persistence
 * as `values.at(-1)`, which is not "the action logits and the persistence" but
 * "everything after the movements except the last number, and the last number".
 * Those coincide only while exactly one scalar trails the table. Adding the
 * effector, target and stance heads puts three more logit blocks in front of
 * that scalar, and the `-1` form would have silently swallowed all three into
 * the action slice -- a wrong argmax over a correct vector, which no width check
 * can see. Named offsets cannot express that mistake.
 */
export const META_OUTPUT_LAYOUT = Object.freeze({
  movementAt: 0,
  actionAt: MOVEMENT_NAMES.length,
  persistenceAt: MOVEMENT_NAMES.length + HAND_ACTION_NAMES.length,
  width: MOVEMENT_NAMES.length + HAND_ACTION_NAMES.length + 1,
});

/** One learned output vector, split at the named offsets. `persistence` is already in seconds. */
export interface MetaOutput {
  readonly movementLogits: readonly number[];
  readonly actionLogits: readonly number[];
  readonly persistence: number;
}

/**
 * The trailing scalar as seconds.
 *
 * A network writes an unbounded number and both decode sites mapped it onto the
 * persistence window the same way; this is that map, once.
 *
 * `0.35` is deliberately **not** spelled `(MAX_PERSISTENCE - MIN_PERSISTENCE) / 2`,
 * which is the derivation it looks like. In doubles that expression is
 * 0.35000000000000003, so the tidier spelling moves every decoded persistence in
 * its last bit and turns collapsing two copies into one into a behaviour change.
 * The measured consequence of keeping the literal is that the map lands on
 * `MIN_PERSISTENCE` exactly at -1 and on 0.7999999999999999 at +1, one ulp under
 * `MAX_PERSISTENCE` -- which is what every rollout so far was taken under, so it
 * is the window rather than a rounding error to fix. `tests/learning.test.mjs`
 * pins both endpoints as the literals they are.
 */
export const decodeMetaPersistence = (raw: number): number =>
  MIN_PERSISTENCE + (Math.max(-1, Math.min(1, raw)) + 1) * 0.35;

/**
 * Split one output vector at the named offsets, or refuse it by width.
 *
 * The refusal is the point of taking the vector apart in one place: a genome
 * bred against a stale output count used to arrive here as a short array, decode
 * to `undefined` logits, and lose every `>` comparison in an argmax -- which is a
 * controller that always answers the first name in the table, and looks exactly
 * like a controller with an opinion.
 */
export function readMetaOutput(values: readonly number[]): MetaOutput {
  if (values.length !== META_OUTPUT_LAYOUT.width) {
    throw new Error(`learned output vector is ${values.length} wide; the contract is ${META_OUTPUT_LAYOUT.width}`);
  }
  return Object.freeze({
    movementLogits: values.slice(META_OUTPUT_LAYOUT.movementAt, META_OUTPUT_LAYOUT.actionAt),
    actionLogits: values.slice(META_OUTPUT_LAYOUT.actionAt, META_OUTPUT_LAYOUT.persistenceAt),
    persistence: decodeMetaPersistence(values[META_OUTPUT_LAYOUT.persistenceAt] as number),
  });
}

/**
 * What a body can do at all, asked of the one legality rule rather than of a
 * second copy of it.
 *
 * The predicates used to live here -- `isStriking && !empty` for `cut`,
 * `hasPoint` for `thrust`, and so on -- beside a near-identical set inside the
 * option's own `requireHand`, which is how a mask and an executor come to
 * disagree. `tacticEffectors` is now the single answer to "who could perform
 * this", and this is that question asked as "could anybody".
 *
 * **One row of the table moved when it did.** A body holding a two-hander has
 * one hand welded to the haft and ignored by `Fighter.update`, so `punch` is no
 * longer advertised on an archer whose only empty hand is the trailing one.
 * That closes a lie rather than removing a capability: the punch was posed and
 * thrown away, and `scripts/train-lookahead.mjs`'s `actionsFor` has never
 * offered it for a bow cell.
 *
 * **That closed one row of thirteen, and the note here read as though it closed
 * the table.** `sword+empty` and `axe+empty` went on offering a runtime `punch`
 * the schedule never trained, which is the same disagreement with the schedule
 * on the wrong side of it. Both were corrected in the schedule;
 * `the_training_schedule_offers_exactly_what_the_runtime_mask_offers` reads this
 * mask off real bodies and compares the whole thirteen-row table.
 */
export function supportedOptions(view: FighterView): ReadonlySet<OptionName> {
  if (!Object.values(view.self.hands).some((hand) => !hand.lost) && !Object.keys(view.self.naturalAttacks ?? {}).length) return new Set<OptionName>();
  const values = new Set<OptionName>(MOVEMENT_NAMES);
  for (const action of HAND_ACTION_NAMES) if (tacticEffectors(view, action).length) values.add(action);
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

/** One legal (action, effector, target) tuple: what tactic v2 actually decides. */
export interface DeployableTactic {
  readonly action: HandActionName;
  readonly effector: EffectorName;
  readonly target: TargetName;
}

/**
 * Every tuple a deployed controller may choose, in frozen table order.
 *
 * `deployableActions` extended rather than forked, which is the rule that
 * function's own note is about: the action half is the same set, and the two
 * inner loops read the same `tacticEffectors` and `tacticTargets` the executor
 * refuses by. So **a tuple in this set can always be executed**, and an illegal
 * tuple is refused by name rather than *repaired* into a legal one.
 *
 * The converse does not hold, and the note here claimed it did by saying there
 * was "nowhere for a mask and an executor to disagree". This set is the smaller
 * of the two: `supportedOptions` refuses outright for a body with no attached
 * hand and no natural attack, so an armless warrior gets an empty set here while
 * `handActionOption("recover", asMeasured("natural"))` still enters on it. That
 * is the mask being stricter than the executor, which is the safe direction and
 * is deliberate -- a controller must not be offered a body it cannot fight with
 * -- but it is a difference and it is measured: probed on an armless warrior,
 * this answers `[]` and the executor answers yes.
 *
 * Stage C is what takes an argmax over it. Stage B builds it so the mask exists
 * and can be tested against the executor; nothing production reads it yet, and
 * `an_illegal_action_effector_target_tuple_is_masked_not_repaired` is the reader
 * that would notice the two coming apart.
 */
export function deployableTactics(view: FighterView): readonly DeployableTactic[] {
  const allowed = deployableActions(view);
  const tuples: DeployableTactic[] = [];
  for (const action of HAND_ACTION_NAMES) {
    if (!allowed.has(action)) continue;
    for (const effector of tacticEffectors(view, action)) {
      for (const target of tacticTargets(action)) tuples.push(Object.freeze({ action, effector, target }));
    }
  }
  return Object.freeze(tuples);
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
      selectedMovement = nextMovement; selectedAction = nextAction;
      // Named at the call site rather than defaulted inside the option. The
      // control decides nothing about effector, target or stance yet -- the
      // output contract is still thirteen wide -- so it asks for the hand the
      // old search would have found and the aim the record was taken at, and
      // says so. Stage C is where a network fills these three in.
      const effector = chooseEffector(view, selectedAction);
      if (effector === null) throw new Error(`random meta control chose "${selectedAction}", which this body has no effector for`);
      current = handActionOption(selectedAction, asMeasured(effector)); current.enter(view);
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
