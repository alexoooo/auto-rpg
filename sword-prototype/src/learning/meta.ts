import { freshIntent } from "../action-primitives.ts";
import { ATTACK_OPTION_NAMES, EFFECTOR_NAMES, HAND_ACTION_NAMES, MOVEMENT_NAMES, STANCE_NAMES, TACTIC_NAMES, TARGET_NAMES,
  asMeasured, chooseEffector, composeTactic,
  handActionOption, movementIntent, tacticEffectors, tacticTargets,
  type BehaviourRecord, type CombatOption, type EffectorName, type HandActionName, type MovementName, type OptionName,
  type StanceName, type TargetName } from "../options.ts";
import type { FighterView, Mind } from "../mind.ts";
import { SeededRng } from "./rng.ts";

export const MIN_PERSISTENCE = 0.10;
export const MAX_PERSISTENCE = 0.80;

/**
 * The persistence PPO and look-ahead both hardcode, in one place.
 *
 * PPO produces **25 of the 26 outputs** and this is the missing one. Making it
 * learned means a continuous action -- a Gaussian or Beta parameterisation with
 * its own log-probability in the ratio -- which `PPO_POLICY_HEADS`' own note
 * records as an algorithm change rather than a contract one.
 *
 * **It lived in `deployment.ts` until stage C2c and could not stay there.**
 * `lookahead.ts` kept its own literal `0.4` because `deployment.ts` imports
 * `lookaheadMind`, so importing back would have been a cycle -- and a cycle is
 * how a constant ends up spelled twice. This module is below both of them and
 * already owns `MIN_PERSISTENCE` and `MAX_PERSISTENCE`, which is the window this
 * number has to sit inside, so it is where the number belongs.
 */
export const UNLEARNED_PERSISTENCE = 0.4;

/**
 * The stance the look-ahead planner holds, and the measurement that chose it.
 *
 * Stage C2c widened the planner's cell key from `(movement, action)` to
 * `(movement, action, effector, target)` and **deliberately stopped short of the
 * stance**, on evidence rather than on cost. Stance is unmasked -- six on every
 * body -- so enumerating it is a flat 6x on the schedule, the beam and the
 * calibrated cell count: 775 tasks a split become 4,650, and a `sword+empty`
 * replan goes from 3,440 expanded nodes to 20,640.
 *
 * What that buys, measured on real Havok bodies (`docs/measurements.md`, "Session
 * 17 Stage C2c"): nine (cell, movement, action, effector, target) tuples, six
 * stances each, three seeds each, 4,800 solver steps a bout. At a **fixed** total
 * budget, six stance-keyed cells against one stance-free cell scored on the same
 * held-out rows.
 *
 * **The decision was taken on a broken statistic and it survives the fix.** The
 * columns it was read off were `|signedReachError|` 0.0081 against 0.0099 and
 * `contactBrier` 0.1387 against 0.1390, and session 19 established that the first
 * of those is identically zero in-sample and the second is 99.6 % irreducible
 * outcome variance. Re-asked on the same 126 held-out folds through the repaired
 * `calibrationFor` (`.review/calgate/p12-stance.mjs`, which calls
 * `fitTacticalModel` and `calibrateTacticalModel` rather than re-implementing
 * them):
 *
 * | column | stance-keyed | stance-free | keyed - free |
 * | --- | ---: | ---: | ---: |
 * | `reachError` | 0.0721 | 0.0709 | **+0.0012** |
 * | `contactRateError` | 0.0431 | 0.0477 | -0.0046 |
 * | `vitalityDeltaError` | 0.0241 | 0.0230 | **+0.0011** |
 *
 * **Read through the score this change introduced, stance-keying is marginally
 * *better*, and counting columns was the same fallacy the change condemns.**
 * "Two of three columns say worse" is a vote across three quantities in three
 * units -- which is exactly why `calibrationSeverity` exists. Through it, on the
 * same folds with the deployed limits and each fold keyed on its own tactic
 * (`.review/rem20/stance.mjs`): warrior 126 folds **0.73597 keyed against
 * 0.73751 free**, and all nine tuples, 162 folds, **0.63847 against 0.63967**.
 * Keyed wins both, by 0.05 % and 0.04 % of the 3.0-per-cell scale.
 *
 * **The decision is unchanged and the reason is the size, not the sign.** The
 * effect is under a tenth of a percent either way, which is not a difference; a
 * 6x enumeration cost buys a fit that is not measurably better on the columns
 * being fitted, and that is the whole argument. Adding the two centipede tuples
 * moves nothing on the raw columns either (162 folds: +0.0009, -0.0036, +0.0008).
 *
 * **Stance moves the fight and does not move these five columns**, which is a
 * statement about `TACTICAL_STATE_COLUMNS` rather than about stance: over the
 * same runs `hold+cover+primary+threat` dealt 182 damage under `slip-right`
 * against 751 under `upright`, and `extended` ran the full 4,800 steps where
 * `action-default` was dead by 1,500.
 *
 * **Those two figures are sums of three bouts, and this said "a bout".**
 * Corrected 2026-08-25 against the harness, which accumulates across its three
 * seeds. Re-asked at six seeds the spread survives -- 4.6x on totals, 4.7x on
 * medians, `slip-right` worst on both -- and the specific pair does not: the best
 * stance is `upright` on three seeds, `action-default` on two and `compact` on
 * one. **One stance's own spread across seeds is larger than the spread between
 * stances** (`action-default` 41.9 to 313.3 damage, `slip-left` 2.6 to 214.3), so
 * three bouts a cell can separate "`slip-right` is bad" from the rest and cannot
 * rank the other five. `docs/measurements.md` carries the table and the seeds.
 *
 * Whoever gives the tactical model a column that can see a posture gets to ask
 * this question again -- and note that the reason the stance is out of the beam
 * is *this*, a fact about the five columns, rather than the 6x enumeration cost.
 *
 * `"action-default"` and not one of the five named poses, because that is the
 * name for "whatever the skill established" -- `applyTacticStance` returns the
 * intent untouched for it -- so the planner claims no posture it did not decide.
 */
export const UNLEARNED_STANCE: StanceName = "action-default";

export type MetaOutputName = MovementName | HandActionName | EffectorName | TargetName | StanceName | "persistence";
/**
 * The ordered output contract every learned controller writes into.
 *
 * `tests/learning.test.mjs` pins it against the five vocabularies it is built
 * from, so the names cannot drift from the tables the executor refuses by.
 *
 * **It said that while typed `readonly string[]`, and the annotation was not
 * what widened it.** An explicit `: readonly string[]` was added when the layout
 * table landed and is worth removing, but removing it alone changes nothing:
 * `"persistence"` inside an array literal widens to `string` on its own, so the
 * *inferred* type here has been `readonly string[]` since the constant was
 * written -- checked with `tsc`, which refuses to assign the un-annotated
 * expression to the thirteen-name union. `as const` on the one literal is what
 * actually makes the type say what the sentence above says, and it is a
 * contract worth having in the type rather than only in a test: stage C2a
 * doubled this table, and a name misspelled into it should be a compile error
 * rather than a row that decodes to nothing.
 *
 * **The twenty-six names are distinct as plain strings, and that is checked
 * rather than assumed** (`the_twenty_six_output_names_are_distinct_columns`).
 * It matters because `readMetaOutput`'s finiteness refusal indexes straight into
 * this table by column, so a duplicated name would name two columns and a short
 * table would name none -- an error message pointing at the wrong head is worse
 * than one pointing at a number.
 */
export const META_OUTPUT_NAMES: readonly MetaOutputName[] =
  Object.freeze([...MOVEMENT_NAMES, ...HAND_ACTION_NAMES, ...EFFECTOR_NAMES, ...TARGET_NAMES, ...STANCE_NAMES,
    "persistence" as const]);

const MOVEMENT_AT = 0;
const ACTION_AT = MOVEMENT_AT + MOVEMENT_NAMES.length;
const EFFECTOR_AT = ACTION_AT + HAND_ACTION_NAMES.length;
const TARGET_AT = EFFECTOR_AT + EFFECTOR_NAMES.length;
const STANCE_AT = TARGET_AT + TARGET_NAMES.length;
const PERSISTENCE_AT = STANCE_AT + STANCE_NAMES.length;
/**
 * The same contract as offsets, because five places were deriving them.
 *
 * The `[5 movement][7 action][1 persistence]` layout was re-derived from
 * `MOVEMENT_NAMES.length` independently at `deployment.ts` twice -- once for the
 * width and once for the two slice bounds -- at `train-neat-qd.mjs`, at
 * `research-rollout-worker.mjs`, and in the artifact fixture in
 * `tests/tournament-executor.test.mjs`. Five chances to get an offset wrong the
 * next time the width moves, and stage C2a is the width moving to 26:
 * `[5 movement][7 action][3 effector][4 target][6 stance][1 persistence]`.
 *
 * **The `-1` was the one that could not survive it.** `deployment.ts` sliced the
 * action half as `values.slice(MOVEMENT_NAMES.length, -1)` and read persistence
 * as `values.at(-1)`, which is not "the action logits and the persistence" but
 * "everything after the movements except the last number, and the last number".
 * Those coincide only while exactly one scalar trails the table, which is a
 * property the thirteen-wide contract had and the twenty-six-wide one does not:
 * that same line now folds the effector, target and stance heads into the action
 * argmax -- a wrong argmax over a correct vector, which no width check can see.
 * Named offsets cannot express that mistake, and stage C1 landed them a commit
 * early precisely so that this widening could not reintroduce it.
 *
 * The offsets are written as a running sum of the five frozen tables rather than
 * as literals for the same reason nothing infers them from key order: a name
 * added to `TARGET_NAMES` has to move `stanceAt` and `persistenceAt` with it,
 * and a table of literals is a table that can be updated by halves.
 * `one_output_table_names_every_offset_a_decoder_reads` holds the sum to the
 * six numbers it currently comes to.
 */
export const META_OUTPUT_LAYOUT = Object.freeze({
  movementAt: MOVEMENT_AT,
  actionAt: ACTION_AT,
  effectorAt: EFFECTOR_AT,
  targetAt: TARGET_AT,
  stanceAt: STANCE_AT,
  persistenceAt: PERSISTENCE_AT,
  width: PERSISTENCE_AT + 1,
});

/** One learned output vector, split at the named offsets. `persistence` is already in seconds. */
export interface MetaOutput {
  readonly movementLogits: readonly number[];
  readonly actionLogits: readonly number[];
  readonly effectorLogits: readonly number[];
  readonly targetLogits: readonly number[];
  /**
   * Read by `selectDeployableTactic`, which stage C2b gave its fourth field --
   * an argmax over `STANCE_NAMES`, handed to `handActionOption`'s
   * `TacticExecution.stance`, where `applyTacticStance` is what finally consumes
   * it. The two sites that call it are `deployment.ts`'s NEAT branch and
   * `neatLabeler` in `scripts/research-rollout-worker.mjs`, and they moved
   * together for the reason `selectDeployableTactic`'s own note gives.
   *
   * The stance head is *not* part of the joint sum the action/effector/target
   * tuple is chosen by: legality is a property of the tuple and every stance is
   * legal on every body, so nothing masks it and there is nothing to trade it
   * against. Six names, and `applyTacticStance`'s own note records that during a
   * committing action only five of them are distinguishable.
   */
  readonly stanceLogits: readonly number[];
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
 * Split one output vector at the named offsets, or refuse it by width and by
 * finiteness.
 *
 * Taking the vector apart in one place is only worth it for the refusals, and
 * the argument for the width one was written down wrong. It said a stale-width
 * genome "used to decode to `undefined` logits and lose every `>` comparison in
 * an argmax -- a controller that always answers the first name in the table".
 * Measured against both pre-`c149e8c` decode sites on a twelve-wide vector whose
 * largest number sits where `recover` belongs (`[0,0,0,0,0,1,1,1,1,1,1,9]`), on
 * `sword+empty`, `bow+empty` and a centipede:
 *
 * - **The two sites answered different actions from the same numbers.**
 *   `deployment.ts` sliced the action half as `slice(MOVEMENT_NAMES.length, -1)`,
 *   which at twelve wide is six numbers, so `recover`'s index is off the end and
 *   `recover` cannot be chosen at all: it answered `cover`, and `bite` on the
 *   centipede. `research-rollout-worker.mjs` indexed each action by name, read
 *   the twelfth number, and answered `recover`.
 * - **Persistence was read off an action logit.** Both spelled it "the last
 *   number", which at twelve wide *is* `recover`'s logit, so the 9 clamped to +1
 *   and every decision came back at 0.7999999999999999 -- the top of the window,
 *   for as long as the genome lived.
 * - **`undefined` needs a vector shorter than that**, and even then the answer is
 *   not the first name. At nine wide the rollout worker's three highest action
 *   indices are `undefined`, lose every comparison, and the answer falls to its
 *   seed `recover` -- the *last* name in the table -- while `deployment.ts`
 *   throws `action has no supported tactic` on the centipede. Only the *movement*
 *   loop can answer "the first name", and only below five outputs.
 *
 * So the shape it prevents is two decoders disagreeing about one genome, not a
 * controller stuck on `close`.
 *
 * **The finiteness refusal is a second failure and had no guard at all.** It went
 * with `networkMetaMind` in stage A -- `learned meta-policy produced a non-finite
 * output` -- and nothing replaced it, while this function's docstring claimed to
 * be the one place a vector is taken apart and refused. `maskedArgmax` refuses a
 * non-finite *logit*, so what survived was the trailing scalar: a network that is
 * finite on the all-zero probe `deployedResearchMind` runs and overflows to `NaN`
 * on real features decodes to `persistence: NaN`, which makes
 * `researchLabelMind`'s `nextDecision` `NaN` and `view.clock >= nextDecision`
 * permanently false. Measured over four seconds at 60 Hz on a `sword+empty`
 * fixture, that is **38 decisions with a 0.10 s window against 14 with `NaN`**:
 * not a freeze -- a completed skill still forces a decision -- but the
 * persistence window silently ceases to exist, which is a controller quietly
 * running a different algorithm from the one being trained.
 */
export function readMetaOutput(values: readonly number[]): MetaOutput {
  if (values.length !== META_OUTPUT_LAYOUT.width) {
    throw new Error(`learned output vector is ${values.length} wide; the contract is ${META_OUTPUT_LAYOUT.width}`);
  }
  const at = values.findIndex((value) => !Number.isFinite(value));
  if (at >= 0) throw new Error(`learned output "${META_OUTPUT_NAMES[at]}" is ${values[at]}; the contract is a finite number`);
  return Object.freeze({
    movementLogits: values.slice(META_OUTPUT_LAYOUT.movementAt, META_OUTPUT_LAYOUT.actionAt),
    actionLogits: values.slice(META_OUTPUT_LAYOUT.actionAt, META_OUTPUT_LAYOUT.effectorAt),
    effectorLogits: values.slice(META_OUTPUT_LAYOUT.effectorAt, META_OUTPUT_LAYOUT.targetAt),
    targetLogits: values.slice(META_OUTPUT_LAYOUT.targetAt, META_OUTPUT_LAYOUT.stanceAt),
    stanceLogits: values.slice(META_OUTPUT_LAYOUT.stanceAt, META_OUTPUT_LAYOUT.persistenceAt),
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
 * **One loadout of the table moved when it did.** A body holding a two-hander
 * has one hand welded to the haft and ignored by `Fighter.update`, so `punch` is
 * no longer advertised on an archer whose only empty hand is the trailing one.
 * That closes a lie rather than removing a capability: the punch was posed and
 * thrown away, and `scripts/train-lookahead.mjs`'s `actionsFor` has never
 * offered it for a bow cell.
 *
 * **That closed `bow+empty` and the note here read as though it closed the
 * table.** `sword+empty` and `axe+empty` went on offering a runtime `punch` the
 * schedule never trained, which is the same disagreement with the schedule on
 * the wrong side of it. Both were corrected in the schedule.
 *
 * **"One row of thirteen" is two units of measure**, and this note used to say
 * it. There are seven loadouts and thirteen cells -- six loadouts on each of two
 * humanoid units, plus the centipede's bite -- so `bow+empty` is one *loadout*
 * of seven and two *cells* of thirteen. `LOADOUT_TACTICS` has a row per loadout;
 * `the_training_schedule_offers_exactly_what_the_runtime_mask_offers` reads this
 * mask off real bodies and compares all thirteen cells against those seven rows.
 * It compares **intact** bodies: a row keys on the loadout a body started with
 * and this mask keys on what is still attached, so severing a hand takes them
 * apart and no row can say otherwise. `calibratedPlannedTactics` in `lookahead.ts`
 * is what answers that.
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
 * **Seven, in the end, and each round of looking found the ones before it had
 * missed some.** Three in `src/`, a fourth in `research-rollout-worker.mjs`, a
 * fifth inlined in `collectTacticalTrace`, and a sixth and seventh in
 * `train-ppo.mjs` -- the seventh on bare `supportedOptions`, which is the mask
 * PPO's trajectory collector learns under while `deployment.ts` deploys under
 * this one. Four of the seven were on the *training* side, which is the half
 * that decides what a network is scored for.
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

/**
 * One legal (action, effector, target) tuple plus the stance to hold while doing
 * it: what tactic v2 actually decides.
 *
 * The stance is on this record and *not* in `deployableTactics`' enumeration,
 * and that asymmetry is the contract rather than an oversight: legality is a
 * property of the first three, every stance is legal on every body, and folding
 * six side-neutral names into a set whose whole job is masking would multiply it
 * by six for nothing. `deployableTactics` therefore answers three-field rows and
 * `selectDeployableTactic` answers four.
 */
export interface LegalTactic {
  readonly action: HandActionName;
  readonly effector: EffectorName;
  readonly target: TargetName;
}
export interface DeployableTactic extends LegalTactic {
  readonly stance: StanceName;
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
 * `selectDeployableTactic` below is what takes an argmax over it. Stage B built
 * it so the mask existed and could be tested against the executor;
 * `an_illegal_action_effector_target_tuple_is_masked_not_repaired` is the reader
 * that would notice the two coming apart.
 *
 * **Its enumeration order is not the tie-break order**, and depending on it
 * would have been a silent bug. This walks `HAND_ACTION_NAMES` outermost, then
 * `tacticEffectors`, then `tacticTargets` -- and `tacticTargets("cover")` is
 * `["threat", "vital"]`, which is `TARGET_NAMES` indices 3 then 0. A scan of
 * this list with `>` therefore breaks a `cover` tie toward `threat`, the *later*
 * name in the frozen table. `selectDeployableTactic` walks the three index
 * spaces itself and asks this function only for membership, so the two facts
 * stay separable: what is legal, and which legal tuple wins a tie.
 */
export function deployableTactics(view: FighterView): readonly LegalTactic[] {
  const allowed = deployableActions(view);
  const tuples: LegalTactic[] = [];
  for (const action of HAND_ACTION_NAMES) {
    if (!allowed.has(action)) continue;
    for (const effector of tacticEffectors(view, action)) {
      for (const target of tacticTargets(action)) tuples.push(Object.freeze({ action, effector, target }));
    }
  }
  return Object.freeze(tuples);
}

const tacticKey = (tactic: LegalTactic): string => `${tactic.action}|${tactic.effector}|${tactic.target}`;

/**
 * The one legal tuple a 26-output vector names: masked before the argmax, never
 * repaired after it.
 *
 * **The sum of three logits over the legal tuples, not three argmaxes.** Three
 * independent argmaxes answer `punch` on a hand holding a sword, or `low` on a
 * `punch` that cannot reach a knee from a shoulder socket, and there are only
 * two things to do about it afterwards: refuse a decision the network took in
 * good faith, or repair it into some neighbouring tuple nobody asked for. The
 * second is the silent redirection the whole of tactic v2 exists to remove --
 * `requireHand`'s `[preferred, other]` search was exactly that -- so the mask
 * goes in *front* of the comparison and the illegal tuples never enter it. Every
 * tuple this can answer is one `handActionOption` accepts, because the legality
 * comes from `deployableTactics`, which comes from `tacticEffectors` and
 * `tacticTargets`, which are what the option itself refuses by.
 *
 * **The tie-break is frozen and total**: lower action index, then lower effector
 * index, then lower target index, which is what the three ascending loops plus a
 * strict `>` come to. It is spelled as loops over the three index spaces rather
 * than as a scan of `deployableTactics` because that function's enumeration
 * order is *not* this order -- see its own note about `cover` -- and a tie-break
 * that follows whichever order an unrelated function happens to build is a
 * tie-break that moves when that function is tidied. Ties are not exotic here:
 * an untrained genome answers its biases, and a bias table seeded with zeros
 * makes every legal tuple a tie.
 *
 * **The stance is a plain argmax and joins none of that.** Every stance is legal
 * on every body, so there is no mask to put in front of the comparison and
 * nothing to trade the term against; folding it into the sum would let a
 * confident stance logit change which *action* is chosen, which is a trade
 * nobody asked for. `maskedArgmax` over the whole table is what it comes to, and
 * it is spelled that way so the refusal for a non-finite stance logit reads the
 * same as every other head's.
 *
 * **Both halves of the decoder seam read this, and they moved together.**
 * `deployment.ts`'s NEAT branch and `neatLabeler` in
 * `scripts/research-rollout-worker.mjs` were a joint-tuple argmax and a bare
 * action argmax for the whole of stage C2a, deliberately: moving one alone is
 * the training/deployment divergence stage C1 spent its budget closing, and
 * `the_training_decoder_and_the_deployment_decoder_answer_the_same_label` is the
 * test that catches it. It was watched going red under exactly that one-sided
 * move before either side was touched.
 */
export function selectDeployableTactic(view: FighterView, output: MetaOutput): DeployableTactic {
  const legal = new Set(deployableTactics(view).map(tacticKey));
  if (!legal.size) {
    throw new Error(`tactic has no legal action/effector/target tuple for unit "${view.self.unit}"`);
  }
  const logit = (values: readonly number[], index: number, column: string): number => {
    const value = values[index];
    if (!Number.isFinite(value)) throw new Error(`tactic ${column} logits contain a non-finite value`);
    return value as number;
  };
  let bestAction = -1; let bestEffector = -1; let bestTarget = -1; let score = -Infinity;
  for (let action = 0; action < HAND_ACTION_NAMES.length; action += 1) {
    for (let effector = 0; effector < EFFECTOR_NAMES.length; effector += 1) {
      for (let target = 0; target < TARGET_NAMES.length; target += 1) {
        if (!legal.has(`${HAND_ACTION_NAMES[action]}|${EFFECTOR_NAMES[effector]}|${TARGET_NAMES[target]}`)) continue;
        const sum = logit(output.actionLogits, action, "action") + logit(output.effectorLogits, effector, "effector") +
          logit(output.targetLogits, target, "target");
        if (sum > score) { score = sum; bestAction = action; bestEffector = effector; bestTarget = target; }
      }
    }
  }
  // Unmasked, and every index visited, so a non-finite stance logit is refused
  // in the same sentence shape as the three above rather than losing a
  // comparison silently. `STANCE_NAMES` has six entries, so the scan runs.
  let bestStance = -1; let stanceScore = -Infinity;
  for (let stance = 0; stance < STANCE_NAMES.length; stance += 1) {
    const value = logit(output.stanceLogits, stance, "stance");
    if (value > stanceScore) { stanceScore = value; bestStance = stance; }
  }
  // `legal` is non-empty and every key in it is one of the tuples enumerated
  // above -- `deployableTactics` draws its three fields from these same three
  // frozen tables -- so a finite sum was compared at least once.
  return Object.freeze({ action: HAND_ACTION_NAMES[bestAction] as HandActionName,
    effector: EFFECTOR_NAMES[bestEffector] as EffectorName, target: TARGET_NAMES[bestTarget] as TargetName,
    stance: STANCE_NAMES[bestStance] as StanceName });
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
