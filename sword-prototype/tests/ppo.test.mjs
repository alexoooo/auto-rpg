import test from "node:test";
import assert from "node:assert/strict";

import { GRU_UNITS, RecurrentPolicy, maskedArgmax, maskedCategorical } from "../src/learning/recurrent-network.ts";
import { clippedPolicyTerm, clippedValueLoss, deterministicMinibatchOrder, generalizedAdvantages,
  tacticalBoundaryReward, encodePpoResume, equalBudgetPpoArms, freezeOpponentLeague, indexedLeagueOpponent,
  ppoHeadUpdate, PPO_POLICY_HEADS, selectPpoArm } from "../src/learning/ppo.ts";
import { EFFECTOR_NAMES, HAND_ACTION_NAMES, MOVEMENT_NAMES, STANCE_NAMES, TARGET_NAMES,
  handActionOption, tacticTargets } from "../src/options.ts";
import { argmaxHeadPick, recurrentTactic } from "../src/learning/deployment.ts";
import { deployableTactics } from "../src/learning/meta.ts";
import { collectPpoTrajectory, initialPpoWeights, opponentRoute, trainPpo } from "../scripts/train-ppo.mjs";
import { assertCompleteView } from "./fixtures/view.mjs";

const layer = (rows, columns, bias = 0) => ({ rows, columns, weights: Array(rows * columns).fill(0), bias: Array(rows).fill(bias) });
/**
 * A recurrent policy's weights, with every head sized from the frozen table it
 * indexes.
 *
 * **It said `action: layer(6, GRU_UNITS)` against a seven-name table, and had
 * since the file was written.** Nothing caught it: `finiteLayer` was handed
 * `weights.action.rows` as the row count to check `weights.action` against,
 * which is a check that cannot fail. So this fixture was a policy whose seventh
 * action -- `recover`, the one name in every legal mask -- had no row at all,
 * and `dense` answered six logits where the decoder reads seven.
 */
const HEAD_TABLES = { movement: MOVEMENT_NAMES, action: HAND_ACTION_NAMES, effector: EFFECTOR_NAMES,
  target: TARGET_NAMES, stance: STANCE_NAMES };
const weights = () => ({ inputSize: 3, units: GRU_UNITS,
  update: layer(GRU_UNITS, GRU_UNITS + 3), reset: layer(GRU_UNITS, GRU_UNITS + 3),
  candidate: layer(GRU_UNITS, GRU_UNITS + 3),
  ...Object.fromEntries(Object.entries(HEAD_TABLES).map(([name, table]) => [name, layer(table.length, GRU_UNITS)])),
  value: layer(1, GRU_UNITS) });

test("masked_policy_heads_never_sample_or_argmax_an_unsupported_tactic", () => {
  assert.equal(maskedArgmax([100, 4, 3], new Set([1, 2]), "movement"), 1);
  assert.equal(maskedCategorical([100, 4, 3], new Set([1, 2]), 0, "movement").index, 1);
  assert.throws(() => maskedArgmax([1, 2], new Set(), "action"), /action has no supported tactic/);
});

test("the_frozen_league_cannot_be_rewritten_by_the_current_training_worker", () => {
  const source = [{ id: "control", kind: "specialist", digest: "fixed" }]; const league = freezeOpponentLeague(source);
  source[0].digest = "live-worker-write";
  assert.equal(league[0].digest, "fixed"); assert.ok(Object.isFrozen(league)); assert.ok(Object.isFrozen(league[0]));
  assert.equal(indexedLeagueOpponent(league, 310013, 4).digest, "fixed");
});

test("a_learned_league_entry_without_its_decoded_champion_is_refused", () => {
  const champion = { id: "dagger:real", kind: "dagger", digest: "abc" };
  assert.throws(() => opponentRoute(champion), /has no decoded champion artifact/);
  const factory = () => ({ name: "decoded" });
  assert.equal(opponentRoute(champion, new Map([[champion.id, factory]])).controller, factory);
});

test("an_indexed_arm_boundary_resume_is_byte_identical_to_an_uninterrupted_havok_run", async () => {
  const config = { seed: 310013, solverSteps: 8, workers: 1 };
  const uninterrupted = await trainPpo(config); const interrupted = await trainPpo({ ...config, stopAfterJobs: 1 });
  assert.equal(interrupted.complete, false);
  const resumed = await trainPpo({ ...config, resumeBytes: interrupted.resume });
  for (const name of ["artifact", "report", "resume"]) assert.deepEqual(resumed[name], uninterrupted[name]);
});

test("random_and_dagger_initializations_receive_the_same_solver_step_budget", () => {
  const arms = equalBudgetPpoArms(310013, 1800);
  assert.deepEqual(arms.map((arm) => arm.initialization), ["random", "dagger"]);
  assert.deepEqual(arms.map((arm) => arm.solverSteps), [1800, 1800]);
  assert.throws(() => selectPpoArm([{ split: "test", arm: "random", macro: 1, worstCell: 1 }]), /cannot read test rows/);
});

test("ppo_resume_reproduces_weights_optimizer_state_and_report_bytes", () => {
  const state = { update: 7, firstMoment: [0.1, 0.2], secondMoment: [0.3, 0.4], consumedSolverSteps: 960 };
  const uninterrupted = encodePpoResume([1, 2], state, [{ index: 0 }, { index: 1 }]);
  const resumed = encodePpoResume([1, 2], { ...state }, [{ index: 0 }, { index: 1 }]);
  assert.deepEqual(resumed, uninterrupted);
});

test("a_tactic_produces_one_return_across_its_complete_temporal_boundary", () => {
  const reward = tacticalBoundaryReward({ startVitalityPotential: 0.2, endVitalityPotential: 0.5,
    nearRangeProgress: 0.1, terminal: 1 });
  assert.ok(Math.abs(reward - 4.4) < 1e-12);
});

test("telescoping_progress_cannot_be_farmed_by_crossing_one_range_boundary_repeatedly", () => {
  const forward = tacticalBoundaryReward({ startVitalityPotential: 0, endVitalityPotential: 0,
    nearRangeProgress: 100, terminal: 0 });
  const back = tacticalBoundaryReward({ startVitalityPotential: 0, endVitalityPotential: 0,
    nearRangeProgress: -100, terminal: 0 });
  assert.equal(forward + back, 0);
  assert.equal(forward, 0.2);
});

test("a_healthy_time_limit_retreat_earns_less_than_a_damaging_exchange", () => {
  const retreat = tacticalBoundaryReward({ startVitalityPotential: 0.8, endVitalityPotential: 0.8,
    nearRangeProgress: -0.2, terminal: 0, durationSeconds: 600 });
  const exchange = tacticalBoundaryReward({ startVitalityPotential: 0.2, endVitalityPotential: 0.7,
    nearRangeProgress: 0, terminal: 0 });
  assert.ok(retreat < exchange);
});

test("ppo_clipping_and_advantages_match_the_pinned_hand_calculation", () => {
  assert.equal(clippedPolicyTerm(0.5, 0.75, 2, 0.2), 2.4);
  assert.equal(clippedPolicyTerm(0.5, 0.25, -2, 0.2), -1.6);
  assert.equal(clippedValueLoss(1, 2, 0, 0.2), 2);
  const advantages = generalizedAdvantages([
    { reward: 1, value: 0.5, nextValue: 0.4, terminal: false },
    { reward: 2, value: 0.4, nextValue: 0, terminal: true },
  ], 0.9, 0.8);
  assert.ok(Math.abs(advantages[1] - 1.6) < 1e-12);
  assert.ok(Math.abs(advantages[0] - 2.012) < 1e-12);
});

/**
 * One boundary over five heads, with a different number of supported outputs on
 * each, so the entropy divisor is pinned rather than merely positive.
 *
 * The supported counts are 2, 2, 3, 4 and 6 -- deliberately not all equal. With
 * all-zero weights every head is uniform over its own legal set, so the
 * per-head entropies are `ln 2`, `ln 2`, `ln 3`, `ln 4` and `ln 6`, and the
 * reported mean over one row is their sum over five. The old divisor was the
 * head count spelled as a literal `2`, which would report 2.5x that number; a
 * divisor of `rows.length` alone would report 5x it. The only assertion on this
 * field anywhere in the tree was `report.entropy > 0`, which every one of those
 * satisfies.
 */
const supportedCounts = { movement: 2, action: 2, effector: 3, target: 4, stance: 6 };
const headBoundary = (hidden, extra = {}) => ({ hidden, oldValue: 0, valueTarget: 1, advantage: 1,
  ...Object.fromEntries(PPO_POLICY_HEADS.flatMap((name) => [[name, 0],
    [`${name}Supported`, Array.from({ length: supportedCounts[name] }, (_, index) => index)],
    [`old${name[0].toUpperCase()}${name.slice(1)}Probability`, 0.5]])), ...extra });

test("ppo_updates_policy_weights_value_head_and_reports_clipping_and_entropy", () => {
  const heads = { ...Object.fromEntries(PPO_POLICY_HEADS.map((name) =>
    [name, layer(supportedCounts[name], 2)])), value: layer(1, 2) };
  const report = ppoHeadUpdate(heads, [headBoundary([1, -0.5], { action: 1 })], 310013);
  for (const name of PPO_POLICY_HEADS) {
    assert.notDeepEqual(heads[name].weights, Array(supportedCounts[name] * 2).fill(0), name);
  }
  assert.notDeepEqual(heads.value.weights, [0, 0]);
  assert.ok(report.valueLoss > 0);
  assert.ok(report.clippedGradientNorm <= 0.5 + 1e-12);
  // The pinned value: the mean per-head entropy of one row, to the last bit the
  // sum happens to land on. A wrong divisor is a wrong number here, not a wrong
  // sign.
  const expected = (2 * Math.log(2) + Math.log(3) + Math.log(4) + Math.log(6)) / PPO_POLICY_HEADS.length;
  assert.ok(Math.abs(report.entropy - expected) < 1e-12,
    `entropy ${report.entropy} against ${expected}`);
  // And the two divisors it is not, written out so this cannot be satisfied by
  // an accident of arithmetic.
  assert.ok(Math.abs(report.entropy - expected * 2.5) > 1e-3, "not the literal 2 it used to divide by");
  assert.ok(Math.abs(report.entropy - expected * 5) > 1e-3, "not rows.length alone");
});

test("the_reported_entropy_is_a_mean_over_rows_as_well_as_over_heads", () => {
  const heads = () => ({ ...Object.fromEntries(PPO_POLICY_HEADS.map((name) =>
    [name, layer(supportedCounts[name], 2)])), value: layer(1, 2) });
  const one = ppoHeadUpdate(heads(), [headBoundary([1, -0.5])], 310013);
  // Two identical rows, so the sum doubles and the mean does not. A divisor that
  // had grown a head count but lost `rows.length` passes the test above.
  const two = ppoHeadUpdate(heads(), [headBoundary([1, -0.5]), headBoundary([1, -0.5])], 310013);
  assert.ok(Math.abs(one.entropy - two.entropy) < 1e-9, `${one.entropy} against ${two.entropy}`);
});

test("truncated_bptt_moves_all_three_gru_gate_matrices_under_the_same_clip", () => {
  const recurrent = () => ({ ...layer(2, 3), weights: Array(6).fill(0.03) });
  const output = (rows) => ({ ...layer(rows, 2), weights: Array(rows * 2).fill(0.08) });
  const network = { update: recurrent(), reset: recurrent(), candidate: recurrent(),
    ...Object.fromEntries(PPO_POLICY_HEADS.map((name) => [name, output(2)])), value: output(1) };
  const before = [network.update, network.reset, network.candidate].map((gate) => [...gate.weights]);
  const boundary = (input, previousHidden, hidden, movement, action) => ({ ...headBoundary(hidden, { movement, action }),
    input, previousHidden,
    ...Object.fromEntries(PPO_POLICY_HEADS.map((name) => [`${name}Supported`, [0, 1]])) });
  const report = ppoHeadUpdate(network, [boundary([0.4], [0, 0], [0.1, -0.05], 0, 1),
    boundary([-0.2], [0.1, -0.05], [0.04, 0.02], 1, 0)], 310013);
  for (const [index, gate] of [network.update, network.reset, network.candidate].entries())
    assert.notDeepEqual(gate.weights, before[index]);
  assert.ok(report.recurrentGradientNorm > 0); assert.ok(report.clippedGradientNorm <= 0.5 + 1e-12);
});

test("seeded_minibatches_and_league_jobs_are_worker_count_independent", () => {
  const a = deterministicMinibatchOrder(100, 310013); const b = deterministicMinibatchOrder(100, 310013);
  assert.deepEqual(a, b); assert.notDeepEqual(a, deterministicMinibatchOrder(100, 310019));
  assert.deepEqual([...a].sort((x, y) => x - y), Array.from({ length: 100 }, (_, index) => index));
});

test("deterministic_inference_replays_the_same_tactic_sequence", () => {
  const a = new RecurrentPolicy(weights()); const b = new RecurrentPolicy(weights());
  const traceA = []; const traceB = [];
  for (const input of [[0, 0, 0], [1, -1, 0.5], [0.1, 0.2, 0.3]]) {
    traceA.push(a.step(input)); traceB.push(b.step(input));
  }
  assert.deepEqual(traceA, traceB);
  a.reset(); assert.deepEqual(a.snapshot(), Array(GRU_UNITS).fill(0));
});

/**
 * The PPO half of the training/deployment seam, which had no guard at all.
 *
 * NEAT has `the_training_decoder_and_the_deployment_decoder_answer_the_same_label`
 * and it genuinely goes red under a one-sided move. PPO's only end-to-end test
 * was the Havok resume, which compares a run against itself -- so **two
 * mutations to `collectPpoTrajectory` left the whole suite green**: swapping
 * `maskedCategorical` for `argmaxHeadPick`, which deletes exploration from an
 * on-policy algorithm and makes every `oldXProbability` exactly 1 so the
 * importance ratio is 1 for every sample forever; and storing each head's full
 * index range in place of `tactic.supported[name]`, which is the precise
 * property `deployment.ts`'s `recurrentTactic` and the record claim correctness
 * for.
 *
 * Both are caught by rebuilding what the update will do from what the collector
 * stored. Every boundary carries its own `input` and `previousHidden`, so the
 * five logit vectors are recomputable exactly -- and the probability
 * `ppoHeadUpdate` renormalizes over the stored support is then a number this
 * test can compute independently and compare. A widened support renormalizes
 * over the wrong denominator; an argmax reports 1 where the softmax says 0.2.
 *
 * The third assertion is the one that says *sampled*: on at least one head of
 * one boundary the collector must have taken something other than its largest
 * legal logit. Under `argmaxHeadPick` that count is zero by construction.
 *
 * `tacticTargets` is a pure function of the action, so the aim head's stored
 * conditional is checked for **exact equality** rather than mere narrowness,
 * with no need for the live body.
 */
test("the_ppo_trajectory_stores_the_conditionals_it_sampled_under_rather_than_the_whole_table", async () => {
  const trajectory = await collectPpoTrajectory({ seed: 310013, initialization: "random", solverSteps: 240 });
  assert.ok(trajectory.boundaries.length >= 2, `${trajectory.boundaries.length} boundaries is not a trajectory`);
  const policy = new RecurrentPolicy(trajectory.weights);
  const capitalised = (name) => `old${name[0].toUpperCase()}${name.slice(1)}Probability`;
  let explored = 0; let narrowed = 0;
  for (const [row, boundary] of trajectory.boundaries.entries()) {
    policy.restore(boundary.previousHidden);
    const step = policy.step(boundary.input);
    for (const name of PPO_POLICY_HEADS) {
      const logits = step[`${name}Logits`];
      const supported = boundary[`${name}Supported`];
      const chosen = boundary[name]; const stored = boundary[capitalised(name)];
      assert.ok(supported.includes(chosen), `${row}/${name}: index ${chosen} is outside its own stored support`);
      if (supported.length < logits.length) narrowed += 1;
      // The renormalisation `ppoHeadUpdate` performs, rebuilt from the stored
      // support alone: a support that is not the one the sample was drawn under
      // gives a different denominator, and an argmax reports 1.
      const peak = Math.max(...supported.map((index) => logits[index]));
      const total = supported.reduce((sum, index) => sum + Math.exp(logits[index] - peak), 0);
      const expected = Math.exp(logits[chosen] - peak) / total;
      assert.ok(Math.abs(stored - expected) < 1e-12,
        `${row}/${name}: stored probability ${stored} against ${expected} over the stored support`);
      if (supported.length > 1) {
        assert.ok(stored < 1 - 1e-9,
          `${row}/${name}: probability 1 over ${supported.length} legal outputs is an argmax, not a sample`);
        if (chosen !== maskedArgmax(logits, new Set(supported), name)) explored += 1;
      }
    }
    const action = HAND_ACTION_NAMES[boundary.action];
    assert.deepEqual([...boundary.targetSupported].sort((a, b) => a - b),
      tacticTargets(action).map((target) => TARGET_NAMES.indexOf(target)).sort((a, b) => a - b),
      `${row}: the aim support is not ${action}'s conditional`);
    assert.ok(boundary.targetSupported.length < TARGET_NAMES.length, `${row}: the aim head was not masked at all`);
    assert.ok(boundary.actionSupported.length < HAND_ACTION_NAMES.length, `${row}: the action head was not masked at all`);
  }
  assert.ok(narrowed > 0, "no head was masked on any boundary, so the comparison above proves nothing");
  assert.ok(explored > 0,
    "every head took its largest legal logit on every boundary -- the collector argmaxed rather than sampled");
});

/**
 * A body whose two hands hold different things, so the effector mask decides
 * something -- and, since the remediation pass, one that can also have lost a
 * hand or been given jaws.
 *
 * The three options exist because the `["natural"]` branch of `tacticEffectors`
 * was unreachable from every fixture here: it fires only when **no** hand is
 * attached, and four intact humanoids never get near it. A fixture that cannot
 * exhibit the defect is the shape `AGENTS.md` records twice.
 */
const BITE = Object.freeze({ bite: Object.freeze({ reach: 0.9, ready: true, active: false }) });
const handedView = (primary = "sword", secondary = "empty",
  { lostPrimary = false, lostSecondary = false, bite = false, handless = false } = {}) => {
  const hand = (weapon, outboard, lost = false) => ({ weapon, lost, reach: weapon === "bow" ? 0.8 : 1.4, tipSpeed: 0,
    tipVelocity: { x: 0, y: 0, z: 0 }, outboard, shoulder: { x: outboard * 0.2, y: 1.4, z: 0 },
    tip: { x: outboard * 0.2, y: 1.4, z: 1 } });
  const body = (a, b, z, facing, hands, natural, unit) => ({ unit, reach: 1.4, crownHeight: 1.8, vitalHeight: 1.1,
    collisionRadius: 0.3, naturalAttacks: natural, ground: { x: 0, y: 0, z }, facing, shoulder: a.shoulder, tip: a.tip,
    tipSpeed: 0, hands, crouch: 0, trunkLean: 0, trunkTwist: 0, vitality: 1, health: {} });
  const own = hand(primary, 1, lostPrimary); const off = hand(secondary, -1, lostSecondary);
  const theirs = hand("sword", 1); const theirOff = hand("empty", -1);
  return assertCompleteView({
    self: body(own, off, 0, 0, handless ? {} : { primary: own, secondary: off },
      bite ? BITE : {}, handless ? "centipede" : "warrior"),
    opponent: body(theirs, theirOff, 1.4, Math.PI, { primary: theirs, secondary: theirOff }, {}, "warrior"),
    projectiles: [], measure: 1.2, clock: 0 });
};

/**
 * PPO's five heads are sampled independently, and the masks are what stop that
 * producing a tuple the executor refuses.
 *
 * The masks are conditioned in contract order -- the effector's on the action
 * that was just picked, the aim's on the same -- which are exactly the three
 * loops `deployableTactics` builds its set from. So the triple is a member of
 * that set **by construction** rather than by a refusal after the fact, which is
 * what a factorized policy needs: three independent argmaxes over the full tables
 * answer `punch+primary+low` on a sword+empty body, and there is nothing honest
 * to do with that afterwards.
 *
 * Swept over every logit ordering rather than sampled: the picker below takes the
 * `k`th legal index of each head, so every combination of per-head preferences is
 * exercised on every fixture.
 *
 * **The executor is driven, and until the remediation pass it was not.** This
 * asserted membership in `deployableTactics(view)` and nothing else -- a set
 * built from the same `tacticEffectors` and `tacticTargets` that
 * `recurrentTactic` masks with, so it was a mask compared against itself and
 * would have gone green on any joint error the two shared. `handActionOption`
 * is what actually refuses a tuple at run time, three hundred solver steps into
 * a worker, so `.enter(view)` is called on the real option for the real tuple
 * and for **all six stances**, which the tuple set does not enumerate.
 *
 * The fixture set gained the two bodies it could not previously describe: one
 * with a severed hand, and two with a natural attack -- a warrior that has lost
 * both arms and a centipede that never had any. Those are the only bodies where
 * `tacticEffectors` answers `["natural"]`, so the branch that decodes it was
 * never entered here at all.
 */
test("every_conditionally_masked_pick_is_a_tuple_the_executor_accepts", () => {
  const fixtures = {
    "sword+empty": handedView("sword", "empty"),
    "sword+axe": handedView("sword", "axe"),
    "bow+empty": handedView("bow", "empty"),
    "empty+empty": handedView("empty", "empty"),
    "sword(lost)+empty": handedView("sword", "empty", { lostPrimary: true }),
    "sword+axe(lost)": handedView("sword", "axe", { lostSecondary: true }),
    "both lost+bite": handedView("sword", "empty", { lostPrimary: true, lostSecondary: true, bite: true }),
    "centipede+bite": handedView("empty", "empty", { handless: true, bite: true }),
  };
  let checked = 0; let entered = 0; const effectors = new Set();
  for (const [loadout, view] of Object.entries(fixtures)) {
    const legal = new Set(deployableTactics(view).map((row) => `${row.action}|${row.effector}|${row.target}`));
    assert.ok(legal.size > 0, `${loadout} has no legal tuple at all`);
    for (let k = 0; k < 8; k += 1) {
      const kth = (logits, supported) => { const list = [...supported].sort((a, b) => a - b);
        return Object.freeze({ index: list[k % list.length], probability: 1 / list.length }); };
      const step = { movementLogits: Array(5).fill(0), actionLogits: Array(7).fill(0), effectorLogits: Array(3).fill(0),
        targetLogits: Array(4).fill(0), stanceLogits: Array(6).fill(0), value: 0, hidden: [] };
      const tactic = recurrentTactic(view, step, kth);
      assert.ok(legal.has(`${tactic.action}|${tactic.effector}|${tactic.target}`),
        `${loadout} k=${k}: ${tactic.action}+${tactic.effector}+${tactic.target}`);
      // The recorded supports are the conditionals the update renormalizes over,
      // not marginals: the effector list is this action's, so a two-handed bow
      // offers one hand and a sword+axe offers two for `cut`.
      assert.deepEqual([...tactic.supported.effector].sort((a, b) => a - b),
        [...new Set(deployableTactics(view).filter((row) => row.action === tactic.action)
          .map((row) => EFFECTOR_NAMES.indexOf(row.effector)))].sort((a, b) => a - b));
      effectors.add(tactic.effector);
      checked += 1;
    }
    // The executor itself, over every legal tuple this body has and every stance
    // -- the stance is on the decision and not in the tuple set, so a tuple
    // sweep alone leaves five sixths of the decision space unentered.
    for (const row of deployableTactics(view)) for (const stance of STANCE_NAMES) {
      const option = handActionOption(row.action, { effector: row.effector, target: row.target, stance });
      option.enter(view); entered += 1;
    }
  }
  assert.equal(checked, 64);
  // 16 + 17 + 7 + 12 + 6 + 10 + 3 + 3 = 74 legal tuples over the eight bodies,
  // each entered at all six stances. Asserted as a literal so a sweep that
  // quietly stopped iterating is a failure rather than a fast pass -- and note
  // that **no body here reaches 21**, which is the widest `deployableTactics`
  // any body has; `docs/measurements.md` carries that count and where it lives.
  assert.equal(entered, 74 * STANCE_NAMES.length);
  assert.equal(entered, 444);
  // All three effectors were produced, so the `natural` decode is exercised
  // rather than merely available.
  assert.deepEqual([...effectors].sort(), ["natural", "primary", "secondary"]);
});

/**
 * The independent argmax the conditional mask replaces, on the one body where it
 * is wrong -- so the test above is checking something rather than restating a
 * mask that could not fail.
 */
test("three_independent_argmaxes_would_have_produced_an_illegal_tuple", () => {
  const view = handedView("sword", "empty");
  const step = { movementLogits: [0, 0, 0, 0, 0], actionLogits: [0, 0.30, 0.20, 1.00, 0, 0, 0],
    effectorLogits: [1.00, 0.10, 0], targetLogits: [0.20, 0.30, 1.00, 0], stanceLogits: Array(6).fill(0), value: 0, hidden: [] };
  const independent = (logits, names) => names[logits.reduce((best, value, index) => value > logits[best] ? index : best, 0)];
  assert.deepEqual([independent(step.actionLogits, HAND_ACTION_NAMES), independent(step.effectorLogits, EFFECTOR_NAMES),
    independent(step.targetLogits, TARGET_NAMES)], ["punch", "primary", "low"]);
  assert.equal(deployableTactics(view).some((row) => row.action === "punch" && row.effector === "primary" && row.target === "low"),
    false, "the independently-argmaxed triple is not a legal tuple");
  // What the conditional mask answers instead: `punch` still wins the action
  // head, and the effector and aim are then argmaxed over what a punch can
  // actually do -- the empty hand, and vital or high.
  const tactic = recurrentTactic(view, step, argmaxHeadPick);
  assert.deepEqual({ action: tactic.action, effector: tactic.effector, target: tactic.target },
    { action: "punch", effector: "secondary", target: "high" });
});

/**
 * `finiteLayer` validated each head's row count **against that same head**, so a
 * head of any size passed.
 *
 * `finiteLayer(weights.movement, weights.movement.rows, ...)` cannot fail; the
 * value head one line below passed a literal `1` and was the only one that meant
 * anything. The row counts come from the runtime name tables now, so a policy
 * with six action rows over a seven-name table is refused rather than deployed
 * with `recover` -- the one name in every legal mask -- off the end of its own
 * matrix.
 */
test("a_head_whose_row_count_is_not_its_runtime_table_is_refused_by_name", () => {
  assert.doesNotThrow(() => new RecurrentPolicy(weights()));
  for (const [name, table] of Object.entries(HEAD_TABLES)) {
    const short = weights(); short[name] = layer(table.length - 1, GRU_UNITS);
    assert.throws(() => new RecurrentPolicy(short),
      new RegExp(`${name} head layer must be a finite ${table.length}x${GRU_UNITS} matrix`), name);
    const missing = weights(); delete missing[name];
    assert.throws(() => new RecurrentPolicy(missing), new RegExp(`${name} head layer must be`), `${name} absent`);
  }
  // The initializer the trainer actually uses agrees with the runtime tables,
  // which is the pairing that would otherwise be checked only by a bout.
  assert.doesNotThrow(() => new RecurrentPolicy(initialPpoWeights(310013, "random")));
  assert.doesNotThrow(() => new RecurrentPolicy(initialPpoWeights(310013, "dagger")));
});
