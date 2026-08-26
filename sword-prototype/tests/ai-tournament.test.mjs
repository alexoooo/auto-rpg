import assert from "node:assert/strict";
import test from "node:test";

import { ATTACK_OPTION_NAMES, EFFECTOR_NAMES, FREE_CHOICE_HEADS, HAND_ACTION_NAMES, MOVEMENT_NAMES, STANCE_NAMES,
  TACTIC_KEY_DELIMITER, TARGET_NAMES, chooseEffector, parseTacticCountKey, tacticCountKey,
  tacticEffectors } from "../src/options.ts";
import { deployableActions } from "../src/learning/meta.ts";
import { researchLabelMind } from "../src/learning/research-policy.ts";
import { runResearchBout } from "../scripts/research-havok.mjs";
import { RESEARCH_STRATA, researchMatrix } from "../src/learning/research-matrix.ts";
import { tacticsFor } from "../scripts/train-lookahead.mjs";
import { assertCommonTournamentMatrix, assessTournamentCandidate, candidateFromRawRows, freezeTournamentManifest,
  headUtilisation, mergeBehaviourRecord, recomputeTournamentReport, tacticMarginal,
  mergeTournamentRows, nextTournamentBatch, resumeTournament, tournamentVerdict, validateTournamentManifest } from "../src/learning/tournament.ts";

const candidates = Object.freeze([
  { name: "dagger", algorithm: "dagger", artifactDigest: "a".repeat(64), artifactBytes: 100 },
  { name: "ppo", algorithm: "ppo", artifactDigest: "b".repeat(64), artifactBytes: 200 },
]);
const jobs = researchMatrix("test", 20260824).slice(0, 2).map((job, index) => ({ ...job, cell: index }));
const manifest = () => freezeTournamentManifest({ candidates, jobs });
const safety = Object.freeze({ finiteAnatomical: true, capabilities: true, postVerdict: true, stuckActions: true, lifecycle: true });

/**
 * A behaviour record that can exist.
 *
 * The fixture here was `{ close: 10, cover: 10, cut: 10 }` and `close` is a
 * **movement**, not a hand action -- the producer has only ever keyed on
 * `label.action`, so no run could have written that map. It passed the
 * three-diverse-actions gate by counting a movement as one of the three, and it
 * passed only because nothing validated the names. Both are fixed by tuple
 * keying: `tacticMarginal(counts, "action")` cannot see a movement, and
 * `validateTacticRecord` refuses a key whose second field is not in
 * `HAND_ACTION_NAMES`.
 *
 * `tacticCountKey` rather than a hand-written `"close|cut|primary|vital|action-default"`,
 * because the producer builds keys with that function and a fixture spelling
 * them by hand is the second copy of a key format that the validator would then
 * disagree with silently.
 */
const key = (movement, action, effector = "primary", target = "vital", stance = "action-default") =>
  tacticCountKey({ movement, action, effector, target, stance });
const behaviour = (scale = 1) => ({
  tacticCounts: { [key("close", "cut")]: 10 * scale, [key("hold", "cover", "secondary", "threat")]: 10 * scale,
    [key("circle-left", "thrust", "primary", "high", "slip-left")]: 10 * scale },
  // Both hands are attached in this fixture, so every decision had a real
  // effector choice. There is no `action` map: every body that can decide has two
  // or more legal actions, so a free-action count would be the action marginal --
  // the theorem beside `FREE_CHOICE_HEADS`.
  freeChoiceCounts: { effector: { primary: 20 * scale, secondary: 10 * scale } },
});
const row = (candidate, job, index, overrides = {}) => ({ manifestDigest: manifest().digest, index, candidate, job, outcome: "win", seconds: 8,
  engagement: { opportunities: 10, attacks: 8, contacts: 4, nearRangeStallSeconds: 0.2,
    firstAttackSeconds: 1, meaningful: 4 }, ...behaviour(), safety, ...overrides });
const rows = (order = candidates) => [
  ...order.flatMap((candidate) => jobs.map((job, index) => row(candidate.name, job, index))),
  ...["scripted-meta-control", "random-meta-control", "specialist-control"].flatMap((controller) =>
    jobs.map((job, index) => row(controller, job, index, { outcome: "loss" }))),
];

test("all_controllers_run_the_same_cells_seeds_mirrors_and_opponents", () => {
  assert.doesNotThrow(() => assertCommonTournamentMatrix(rows(), manifest()));
  assert.throws(() => assertCommonTournamentMatrix(rows().slice(1), manifest()), /exact frozen cells/);
});

const cell = (overrides = {}) => ({ name: "warrior/sword", meaningfulEngagement: 3,
  opportunityAttackRate: 0.8, attackContactRate: 0.4, nearRangeStallShare: 0.1,
  firstAttackP90Seconds: 2, symmetricTimeCapRate: 0, score: 0.8, specialistScore: 0.8, ...overrides });
const candidate = (overrides = {}) => ({ name: "good", algorithm: "dagger", artifactBytes: 100,
  meanScore: 0.8, confidenceLow: 0.7, confidenceHigh: 0.9, scriptedScore: 0.6, randomScore: 0.4,
  cells: [cell()], ...behaviour(), safety, ...overrides });

test("a_candidate_with_the_best_mean_but_a_dead_cell_is_rejected", () => {
  const dead = candidate({ name: "dead", meanScore: 0.99, cells: [cell(), cell({ name: "broot/bow", meaningfulEngagement: 0 })] });
  assert.equal(tournamentVerdict([candidate(), dead]).promoted, "good");
});

test("a_candidate_that_wins_by_time_limit_avoidance_is_rejected", () => {
  const runner = candidate({ cells: [cell({ symmetricTimeCapRate: 0.11 })] });
  assert.equal(tournamentVerdict([runner]).promoted, null);
});

test("a_candidate_that_reads_an_unsupported_capability_is_rejected_by_name", () => {
  const invalid = candidate({ safety: { ...safety, capabilities: false } });
  const verdict = tournamentVerdict([invalid]);
  assert.equal(verdict.promoted, null); assert.ok(verdict.candidates[0].failures.includes("capability failure"));
});

test("selection_uses_validation_and_test_is_opened_exactly_once", () => {
  const frozen = manifest(); assert.equal(frozen.selectedOn, "validation"); assert.doesNotThrow(() => validateTournamentManifest(frozen));
  assert.equal(resumeTournament(rows().slice(0, -1), frozen).length, 1);
  assert.throws(() => resumeTournament(rows(), frozen), /cannot be opened twice/);
  const partial = rows().slice(0, 2); const expected = nextTournamentBatch(partial, frozen, 2);
  const byIdentity = new Map(rows().map((value) => [`${value.candidate}:${value.index}`, value]));
  const incoming = expected.map(({ candidate, index }) => byIdentity.get(`${candidate}:${index}`));
  assert.equal(mergeTournamentRows(partial, incoming, frozen).length, 4);
  assert.throws(() => mergeTournamentRows(partial, [...incoming].reverse(), frozen), /indexed order/);
  assert.throws(() => nextTournamentBatch([{ ...partial[0], candidate: "unknown" }], frozen, 1), /unknown tournament controller/);
  assert.throws(() => nextTournamentBatch([{ ...partial[0], manifestDigest: "changed" }], frozen, 1), /different frozen manifest/);
  assert.throws(() => nextTournamentBatch([{ ...partial[0], outcome: "timeout" }], frozen, 1), /invalid outcome/);
  assert.throws(() => nextTournamentBatch([{ ...partial[0], safety: { ...safety, lifecycle: "yes" } }], frozen, 1), /invalid safety evidence/);
});

test("reordering_controllers_does_not_change_any_fight_record_or_verdict", () => {
  const report = { manifest: manifest(), rawRows: rows() };
  const reordered = { ...report, rawRows: rows([...candidates].reverse()) };
  assert.deepEqual(reordered.rawRows.map((value) => value).sort((a, b) => a.candidate.localeCompare(b.candidate) || a.index - b.index),
    report.rawRows.map((value) => value).sort((a, b) => a.candidate.localeCompare(b.candidate) || a.index - b.index));
  assert.deepEqual(recomputeTournamentReport(reordered), recomputeTournamentReport(report));
});

test("the_tournament_report_recomputes_its_verdict_from_raw_rows", () => {
  const report = { manifest: manifest(), rawRows: rows(), verdict: { promoted: "invented" } };
  assert.notEqual(recomputeTournamentReport(report).promoted, report.verdict.promoted);
  const impossible = rows(); impossible[0] = { ...impossible[0], engagement: { ...impossible[0].engagement, attacks: 11 } };
  assert.throws(() => recomputeTournamentReport({ manifest: manifest(), rawRows: impossible }), /impossible engagement attribution/);
});

test("no_passing_candidate_produces_no_promoted_artifact", () => {
  assert.equal(tournamentVerdict([candidate({ cells: [cell({ attackContactRate: 0 })] })]).promoted, null);
});

test("a_statistical_tie_selects_the_frozen_smaller_then_named_candidate", () => {
  const large = candidate({ name: "ppo", algorithm: "ppo", artifactBytes: 200, meanScore: 0.9,
    confidenceLow: 0.7, confidenceHigh: 0.95 });
  const small = candidate({ name: "dagger", algorithm: "dagger", artifactBytes: 100, meanScore: 0.8,
    confidenceLow: 0.72, confidenceHigh: 0.91 });
  assert.equal(tournamentVerdict([large, small]).promoted, "dagger");
  const named = candidate({ name: "a", algorithm: "dagger", artifactBytes: 100 });
  assert.equal(tournamentVerdict([{ ...named, name: "z" }, named]).promoted, "a");
});

test("changing_a_threshold_after_test_opening_invalidates_the_manifest", () => {
  const frozen = structuredClone(manifest()); frozen.thresholds.minOpportunityAttackRate = 0;
  assert.throws(() => validateTournamentManifest(frozen), /changed after test was opened/);
});

test("the_frozen_manifest_owns_its_candidate_and_job_records", () => {
  const mutableCandidates = candidates.map((value) => ({ ...value }));
  const mutableJobs = jobs.map((value) => ({ ...value }));
  const frozen = freezeTournamentManifest({ candidates: mutableCandidates, jobs: mutableJobs });
  mutableCandidates[0].name = "changed"; mutableJobs[0].seed += 1;
  assert.equal(frozen.candidates[0].name, "dagger");
  assert.notEqual(frozen.jobs[0].seed, mutableJobs[0].seed);
  assert.doesNotThrow(() => validateTournamentManifest(frozen));
});

/**
 * The tuple key, over the whole vocabulary rather than over a sample.
 *
 * **Coverage space: every one of the 5 x 7 x 3 x 4 x 6 = 2520 combinations of
 * the five frozen tables**, legal or not. That is deliberate and is the widest
 * space rather than the right-sized one: the key format is over the
 * *vocabulary*, and a key for an illegal tuple still has to round-trip so that
 * the row validator can refuse the tuple by name rather than fail to parse it.
 * Enumerating the lot costs a few milliseconds and removes "the sample missed
 * the one name with the delimiter in it" as a way to be wrong.
 */

/**
 * The delimiter's whole claim, checked against the names rather than asserted in
 * a comment: three of the twenty-five contain a hyphen, which is why the
 * delimiter is not one, and none of them may contain the bar.
 *
 * **It exists under this name because `TACTIC_KEY_DELIMITER`'s docstring cites
 * it by name and the test did not exist**, which is the wrong-comment defect
 * with the citation pointing at nothing at all. The assertion was inline inside
 * the round-trip test below; it is a claim about the vocabulary rather than
 * about the key format, and a reader following the citation has to land on
 * something.
 *
 * Coverage space: all 25 names in all five frozen tables, which is the whole
 * vocabulary the key is over.
 */
test("the_tuple_key_delimiter_appears_in_no_option_name", () => {
  const tables = [MOVEMENT_NAMES, HAND_ACTION_NAMES, EFFECTOR_NAMES, TARGET_NAMES, STANCE_NAMES];
  let seen = 0;
  for (const table of tables) {
    for (const name of table) {
      assert.ok(!name.includes(TACTIC_KEY_DELIMITER), `option name "${name}" contains the tuple-key delimiter`);
      seen += 1;
    }
  }
  assert.equal(seen, 25, "the five frozen tables hold 25 names between them");
  // The hyphen half of the same argument, which is why the delimiter is not one.
  assert.ok(tables.flat().filter((name) => name.includes("-")).length >= 3);
});

test("a_tuple_key_round_trips_through_the_builder_and_the_parser", () => {
  let seen = 0;
  for (const movement of MOVEMENT_NAMES) for (const action of HAND_ACTION_NAMES) for (const effector of EFFECTOR_NAMES) {
    for (const target of TARGET_NAMES) for (const stance of STANCE_NAMES) {
      const tuple = { movement, action, effector, target, stance };
      const written = tacticCountKey(tuple);
      assert.deepEqual({ ...parseTacticCountKey(written) }, tuple, written);
      assert.equal(tacticCountKey(parseTacticCountKey(written)), written);
      seen += 1;
    }
  }
  assert.equal(seen, MOVEMENT_NAMES.length * HAND_ACTION_NAMES.length * EFFECTOR_NAMES.length *
    TARGET_NAMES.length * STANCE_NAMES.length);
});

/**
 * The refusals a malformed record earns, each naming the offending part.
 *
 * **This is the deserialization guard and not a restatement of the producer's
 * invariants.** Every tuple that reaches the live record is legal by
 * construction -- `onDecision` fires after the option has been entered and after
 * the unsupported-action throw -- but a *row* is JSON a previous run wrote, and
 * nothing about the producer survives a file. `nextTournamentBatch` is the entry
 * point here because it is the one every resume path goes through and it
 * validates before it schedules.
 */
const rowWith = (behaviour) => [{ ...row(candidates[0].name, jobs[0], 0), ...behaviour }];
test("a_malformed_behaviour_record_is_refused_by_the_part_that_is_wrong", () => {
  const frozen = manifest();
  const counts = (written) => ({ tacticCounts: { [written]: 4 }, freeChoiceCounts: { effector: {} } });
  assert.throws(() => nextTournamentBatch(rowWith(counts("close|cut|primary|vital")), frozen, 1),
    /5 names in movement\|action\|effector\|target\|stance order, not 4/);
  // Five names, every one of them real, in the wrong order: `close` is a
  // movement sitting in the action slot. A record keyed on a *set* of names
  // could not tell this from a correct key.
  assert.throws(() => nextTournamentBatch(rowWith(counts("close|close|primary|vital|action-default")), frozen, 1),
    /which requires an action of cover, cut, thrust, punch, shoot, bite, recover, not "close"/);
  // **`"as-measured"` is deliberately outside `TARGET_NAMES`** -- it is the
  // opponent's own shoulder line a scripted caller asks for through
  // `asMeasured`, and no learned output can name it because it is not in the
  // table an argmax indexes. So a key built from a scripted probe's label does
  // not parse, and that is correct rather than a hole: the three tournament
  // controls never call `onDecision` at all, and every candidate labeler picks
  // its target out of `TARGET_NAMES`, so no tournament row can carry one. A
  // record that does is a record from somewhere else.
  assert.throws(() => nextTournamentBatch(rowWith(counts("close|punch|primary|as-measured|action-default")), frozen, 1),
    /a target of vital, high, low, threat, not "as-measured"/);
  assert.throws(() => nextTournamentBatch(rowWith(counts("close|cut|primary|vital|crouching")), frozen, 1),
    /a stance of action-default, upright, compact, extended, slip-left, slip-right, not "crouching"/);
  const legal = key("close", "cut");
  // `action` is a real head of the tuple and is *not* a free-choice head, which
  // makes it the sharpest case for this refusal: it was one until 2026-08-25,
  // and a resumed row from before the deletion carries it.
  for (const stale of ["action", "stance"]) {
    assert.throws(() => nextTournamentBatch(rowWith({ tacticCounts: { [legal]: 4 },
      freeChoiceCounts: { effector: { primary: 4 }, [stale]: { cut: 4 } } }), frozen, 1),
    new RegExp(`free-choice head "${stale}", not effector`));
  }
  assert.throws(() => nextTournamentBatch(rowWith({ tacticCounts: { [legal]: 4 },
    freeChoiceCounts: { effector: { tertiary: 4 } } }), frozen, 1),
  /a free-choice effector of primary, secondary, natural, not "tertiary"/);
  // A count of zero, so the consistency check below cannot fire and the table
  // check is the only thing that can refuse this. Watched under the mutation
  // that disables the table check: without this case the *consistency* refusal
  // catches an out-of-table name too, and the two would be indistinguishable.
  assert.throws(() => nextTournamentBatch(rowWith({ tacticCounts: { [legal]: 4 },
    freeChoiceCounts: { effector: { tertiary: 0 } } }), frozen, 1),
  /a free-choice effector of primary, secondary, natural, not "tertiary"/);
  // The well-formed shape is accepted, so the refusals above are about the
  // malformation and not about the entry point.
  assert.doesNotThrow(() => nextTournamentBatch(rowWith({ tacticCounts: { [legal]: 4 },
    freeChoiceCounts: { effector: { primary: 4 } } }), frozen, 1));
});

/**
 * A count is a count: neither half of the record may carry a fraction or a
 * negative.
 *
 * **Both refusals survived deletion with 556 green until 2026-08-25**, and the
 * consistency check does not stand in for either: `1.5 <= 38` and `-5 <= 38`, so
 * a fractional or negative free-choice count sails past the one arithmetic test
 * the record has. The tactic-count half is the same shape one field up.
 *
 * `Number.isSafeInteger` and not `Number.isInteger`, so a count past 2^53 -- the
 * point where JSON round-tripping stops being reversible and `+1` stops
 * changing the value -- is refused too.
 */
test("a_fractional_or_negative_count_is_refused_in_either_half_of_the_record", () => {
  const frozen = manifest(); const legal = key("close", "cut");
  const free = (effector) => rowWith({ tacticCounts: { [legal]: 38 }, freeChoiceCounts: { effector } });
  for (const bad of [1.5, -5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53]) {
    assert.throws(() => nextTournamentBatch(free({ primary: bad }), frozen, 1),
      /has an invalid free-choice effector count for "primary"/, `free-choice count ${bad}`);
  }
  const joint = (count) => rowWith({ tacticCounts: { [legal]: count }, freeChoiceCounts: { effector: {} } });
  for (const bad of [1.5, -5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53]) {
    assert.throws(() => nextTournamentBatch(joint(bad), frozen, 1),
      /has an invalid tactic count for "close\|cut\|primary\|vital\|action-default"/, `tactic count ${bad}`);
  }
  // The controls beside them: the same records with integral counts are accepted,
  // so each refusal above is about the number and not about the shape.
  assert.doesNotThrow(() => nextTournamentBatch(free({ primary: 38 }), frozen, 1));
  assert.doesNotThrow(() => nextTournamentBatch(joint(38), frozen, 1));
});

/**
 * The one check that is arithmetic rather than spelling.
 *
 * A free choice is a *subset* of all choices of the same option, so its count
 * can never exceed that option's marginal in the joint map. Two maps written by
 * one producer that disagree on that are two maps, one of which is wrong -- a
 * free choice counted on a decision the joint map never recorded, or a tuple
 * credited to a different option name than the free choice was.
 */
test("a_free_choice_count_above_its_own_tactic_marginal_is_refused", () => {
  const frozen = manifest(); const cut = key("close", "cut");
  assert.throws(() => nextTournamentBatch(rowWith({ tacticCounts: { [cut]: 10 },
    freeChoiceCounts: { effector: { primary: 11 } } }), frozen, 1),
  /recorded 11 free effector choices of "primary" against a tactic marginal of 10/);
  assert.throws(() => nextTournamentBatch(rowWith({ tacticCounts: { [cut]: 10 },
    freeChoiceCounts: { effector: { secondary: 1 } } }), frozen, 1),
  /recorded 1 free effector choices of "secondary" against a tactic marginal of 0/);
  assert.doesNotThrow(() => nextTournamentBatch(rowWith({ tacticCounts: { [cut]: 10 },
    freeChoiceCounts: { effector: { primary: 10 } } }), frozen, 1));
});

/**
 * The diversity gate keeps its exact former meaning: it counts *actions*, and
 * fragmenting one action across more tuples manufactures none.
 *
 * **The brief for this change asked for a cut split across three effectors and
 * that is a record which cannot exist**, which is worth writing down rather than
 * approximating: `tacticEffectors(view, "cut")` answers attached hands holding a
 * held striker, so `cut` reaches at most two effectors on any body and never
 * `natural`. The widest split a real cut-only record can carry is two effectors
 * x three targets (x five movements x six stances), and six tuples is already
 * past the point -- each is a sixth of the decisions, comfortably over
 * `MIN_ACTION_SHARE`, and the action marginal is still the single name `cut`.
 *
 * The passing control beside it is what makes this a claim about the gate rather
 * than about the fixture: the same 60 decisions spread over three *actions* pass.
 */
test("a_cut_only_fighter_split_across_every_tuple_it_can_reach_still_fails_the_diversity_gate", () => {
  const fragmented = {};
  for (const effector of ["primary", "secondary"]) for (const target of ["vital", "high", "low"]) {
    fragmented[key("close", "cut", effector, target)] = 10;
  }
  assert.equal(Object.keys(fragmented).length, 6);
  assert.deepEqual(Object.keys(tacticMarginal(fragmented, "action")), ["cut"]);
  const onlyCuts = candidate({ tacticCounts: fragmented,
    freeChoiceCounts: { effector: { primary: 30, secondary: 30 } } });
  assert.deepEqual(assessTournamentCandidate(onlyCuts).failures,
    ["fewer than three non-recover actions occupy at least 8% of decisions"]);
  const varied = candidate({ tacticCounts: { [key("close", "cut")]: 20, [key("hold", "thrust")]: 20,
    [key("hold", "cover", "secondary", "threat")]: 20 }, freeChoiceCounts: { effector: {} } });
  assert.deepEqual(assessTournamentCandidate(varied).failures, []);
});

/**
 * `MIN_ACTION_SHARE` bounded from **both** sides, and the `recover` exclusion
 * made load-bearing.
 *
 * **The suite pinned this constant to `[0, 0.286]` and that looked like
 * coverage.** Setting `MIN_ACTION_SHARE` to `0` passed 556/556, and so did
 * deleting the `name !== "recover"` exclusion outright: every fixture in the
 * file spread its decisions evenly over three real actions, so no fixture had an
 * action near the floor and none leaned on `recover` to reach three. A test that
 * bounds a constant from one side is satisfied by a range wider than the
 * decision, which is the exact shape `AGENTS.md` warns about.
 *
 * Two records, chosen so the true 0.08 sits between them:
 *
 *   * `justOver` counts 46/45/9 out of 100 -- `cover` at **0.09** -- and passes.
 *     Raise the floor past 0.09 and the third action stops counting: red.
 *   * `justUnder` counts 50/45/4/1 -- `cover` at **0.04** -- and fails. Lower the
 *     floor below 0.04 and the third action starts counting: also red.
 *
 * So the pair pins the constant into `(0.04, 0.09]`, which is a range narrower
 * than the decision rather than wider than it.
 *
 * `leansOnRecover` is the third: 40 cuts, 40 thrusts and 20 recovers. Two
 * non-recover actions clear the floor, so it must fail -- and it passes the
 * moment the exclusion is deleted, because `recover` at 0.20 would be the third.
 * The change's own comment argues the exclusion is *more* meaningful under tuple
 * keying, since `recover` now means the `HAND_ACTION_NAMES` member and nothing
 * else; an argument for a line with no test behind it is how the line gets
 * deleted by the next person who reads it as redundant.
 */
test("the_action_share_floor_and_the_recover_exclusion_are_both_load_bearing", () => {
  const spread = (counts) => Object.fromEntries(Object.entries(counts)
    .map(([action, count]) => [key(action === "cover" ? "hold" : "close", action,
      "primary", action === "cover" || action === "recover" ? "threat" : "vital"), count]));
  const gateFailure = "fewer than three non-recover actions occupy at least 8% of decisions";
  const of = (counts) => candidate({ tacticCounts: spread(counts), freeChoiceCounts: { effector: {} } });

  const justOver = of({ cut: 46, thrust: 45, cover: 9 });
  assert.equal(Object.values(spread({ cut: 46, thrust: 45, cover: 9 })).reduce((a, b) => a + b, 0), 100);
  assert.deepEqual(assessTournamentCandidate(justOver).failures, [], "cover at 0.09 must clear a floor of 0.08");

  const justUnder = of({ cut: 50, thrust: 45, cover: 4, recover: 1 });
  assert.deepEqual(assessTournamentCandidate(justUnder).failures, [gateFailure],
    "cover at 0.04 must not clear a floor of 0.08");

  const leansOnRecover = of({ cut: 40, thrust: 40, recover: 20 });
  assert.deepEqual(assessTournamentCandidate(leansOnRecover).failures, [gateFailure],
    "recover at 0.20 is excluded by name and cannot be the third action");
});

/**
 * The statistic the record was widened for: "never varied" and "never had a
 * choice" are the same modal share and two different records.
 *
 * Both fixtures below chose `primary` on all forty decisions -- identical joint
 * maps, identical marginals, an identical modal share of 1.0. The only thing
 * separating them is the free-choice denominator, and separating them is the
 * whole reason a tournament can now say anything about a learned effector head.
 * The whole utilisation record is asserted against a freshly built one rather
 * than a field or two, because a spot check on `modalShare` passes on both.
 */
test("head_utilisation_separates_a_head_that_never_varied_from_one_that_never_had_a_choice", () => {
  const counts = { [key("close", "cut")]: 20, [key("hold", "thrust")]: 20 };
  const confounded = { tacticCounts: counts, freeChoiceCounts: { effector: {} } };
  const free = { tacticCounts: counts, freeChoiceCounts: { effector: { primary: 40 } } };
  const expected = (effectorFree) => ({
    movement: { decisions: 40, freeChoiceDecisions: 40, chosen: 2, modal: "close", modalShare: 0.5, freeModal: "close", freeModalShare: 0.5 },
    action: { decisions: 40, freeChoiceDecisions: 40, chosen: 2, modal: "cut", modalShare: 0.5, freeModal: "cut", freeModalShare: 0.5 },
    effector: { decisions: 40, freeChoiceDecisions: effectorFree, chosen: 1, modal: "primary", modalShare: 1,
      freeModal: effectorFree ? "primary" : null, freeModalShare: effectorFree ? 1 : 0 },
    target: { decisions: 40, freeChoiceDecisions: 40, chosen: 1, modal: "vital", modalShare: 1, freeModal: "vital", freeModalShare: 1 },
    stance: { decisions: 40, freeChoiceDecisions: 40, chosen: 1, modal: "action-default", modalShare: 1,
      freeModal: "action-default", freeModalShare: 1 },
  });
  assert.deepEqual(headUtilisation(confounded), expected(0));
  assert.deepEqual(headUtilisation(free), expected(40));
  assert.notDeepEqual(headUtilisation(confounded), headUtilisation(free));
  // `bite` is the only action with a single legal target, so it is the only
  // thing that can move the *derived* target denominator off the decision count.
  const jaws = headUtilisation({ tacticCounts: { [key("hold", "bite", "natural")]: 7 }, freeChoiceCounts: { effector: {} } });
  assert.equal(jaws.target.freeChoiceDecisions, 0);
  assert.equal(jaws.target.freeModal, null);
  assert.equal(jaws.target.freeModalShare, 0);
  // ...and it moves it only for `bite`. `punch` has two legal targets, so a
  // record made only of punches has a free target denominator equal to its
  // decisions. Without this control the derived denominator could be a constant
  // zero and the assertion above would still pass.
  const fists = headUtilisation({ tacticCounts: { [key("hold", "punch", "primary", "high")]: 7 }, freeChoiceCounts: { effector: {} } });
  assert.equal(fists.target.freeChoiceDecisions, 7);
  assert.equal(fists.target.freeModal, "high");
});

/**
 * The number this whole change exists to produce: the modal option over all
 * decisions and the modal option over the free ones can name **different**
 * options, and reporting only the first states the opposite conclusion.
 *
 * **The record below is not invented.** It is what a real
 * `warrior/sword+shield` bout writes -- `.review/rem26/inverted.mjs`, seed
 * 310013, opponent `specialist`, 2400 solver steps, a policy that cuts with the
 * sword hand on 7 of every 10 decisions and covers with the shield hand on the
 * other 3 -- transcribed key for key and count for count. On a `sword+shield`
 * body only `cover` and `recover` reach two hands, so the 27 covers are exactly
 * the decisions where the effector head had a choice, and it took `secondary` on
 * every one of them.
 *
 *     reported before   modal = primary,  modalShare = 0.719
 *     the truth         on all 27 free decisions it chose secondary, every time
 *
 * Watched failing before the fix: `headUtilisation` kept only the *sum* of
 * `freeChoiceCounts[head]`, so `freeModal`/`freeModalShare` did not exist and
 * the per-option split was discarded.
 *
 * The whole record is asserted against a freshly built one rather than the two
 * new fields, for the reason `AGENTS.md` gives: a list of field names does not
 * grow with the record and a spot check passes on a record that is wrong
 * elsewhere.
 */
test("the_free_choice_modal_and_the_all_decision_modal_can_name_different_options", () => {
  const measured = {
    tacticCounts: { [key("close", "cut", "primary", "vital")]: 69,
      [key("close", "cover", "secondary", "threat")]: 27 },
    freeChoiceCounts: { effector: { secondary: 27 } },
  };
  const heads = headUtilisation(measured);
  assert.deepEqual(heads, {
    movement: { decisions: 96, freeChoiceDecisions: 96, chosen: 1, modal: "close", modalShare: 1, freeModal: "close", freeModalShare: 1 },
    action: { decisions: 96, freeChoiceDecisions: 96, chosen: 2, modal: "cut", modalShare: 69 / 96, freeModal: "cut", freeModalShare: 69 / 96 },
    effector: { decisions: 96, freeChoiceDecisions: 27, chosen: 2, modal: "primary", modalShare: 69 / 96,
      freeModal: "secondary", freeModalShare: 1 },
    target: { decisions: 96, freeChoiceDecisions: 96, chosen: 2, modal: "vital", modalShare: 69 / 96, freeModal: "vital", freeModalShare: 69 / 96 },
    stance: { decisions: 96, freeChoiceDecisions: 96, chosen: 1, modal: "action-default", modalShare: 1,
      freeModal: "action-default", freeModalShare: 1 },
  });
  // The inversion said out loud, so a reader of the failure sees which claim broke.
  assert.notEqual(heads.effector.modal, heads.effector.freeModal);
  assert.equal(heads.effector.modal, "primary");
  assert.equal(heads.effector.freeModal, "secondary");
});

/**
 * The modal option is the **most**-used one.
 *
 * **Reporting the least-used option instead passed 556/556**, because every
 * marginal in every fixture in this file was a two-way tie or a singleton: with
 * all counts equal, `b[1] - a[1]` never decides anything and only the
 * `localeCompare` tie-break is ever reached, so flipping the comparator changed
 * no answer anywhere. The fixture below is deliberately three-way and
 * *unequal*, and the name order is chosen to cross the count order -- `cover`
 * sorts first alphabetically and is the least used, `thrust` sorts last and is
 * the most -- so the tie-break cannot stand in for the comparison.
 */
test("the_modal_option_is_the_most_used_one_and_not_the_least", () => {
  const heads = headUtilisation({
    tacticCounts: { [key("close", "cover", "primary", "threat")]: 5, [key("close", "cut")]: 15,
      [key("close", "thrust")]: 30 },
    freeChoiceCounts: { effector: { primary: 30, secondary: 20 } },
  });
  assert.equal(heads.action.modal, "thrust", "thrust is used most and sorts last by name");
  assert.equal(heads.action.modalShare, 30 / 50);
  // The recorded head, whose free distribution is a separate ordering with its
  // own most-used option.
  assert.equal(heads.effector.freeModal, "primary");
  assert.equal(heads.effector.freeModalShare, 30 / 50);
  // The tie-break is still the tie-break, asserted where the counts are equal so
  // that the case above cannot be satisfied by it.
  const tied = headUtilisation({ tacticCounts: { [key("close", "thrust")]: 10, [key("close", "cut")]: 10 },
    freeChoiceCounts: { effector: {} } });
  assert.equal(tied.action.modal, "cut", "an exact tie falls back to the name order");
});

/**
 * The aggregate the report actually prints, whole, against a fresh one.
 *
 * **`candidateFromRawRows`'s free-choice merge is the only production
 * aggregation of the statistic, and deleting it left 556 green.** With it gone
 * every candidate reports `freeChoiceDecisions: 0` on every head, so a whole
 * tournament silently says "the body never offered a second hand" -- which is
 * indistinguishable from a true reading of a one-handed matrix. The merge lives
 * in `mergeBehaviourRecord` now, because `scripts/evaluate-ai.mjs` needs the
 * same fold per cell and two copies of a summation is the defect this directory
 * has a rule about.
 *
 * The rows here carry deliberately *different* records so the merge has to be a
 * sum rather than a copy of the first or the last, and the joint half is
 * asserted beside the free half so a merge that drops either is red.
 */
test("an_aggregated_candidate_carries_the_free_choice_counts_its_rows_recorded", () => {
  const mine = candidates[0].name;
  const first = row(mine, jobs[0], 0, { tacticCounts: { [key("close", "cut")]: 6, [key("hold", "cover", "secondary", "threat")]: 4 },
    freeChoiceCounts: { effector: { secondary: 4 } } });
  const second = row(mine, jobs[1], 1, { tacticCounts: { [key("close", "cut")]: 1, [key("hold", "cover", "primary", "threat")]: 9 },
    freeChoiceCounts: { effector: { primary: 9 } } });
  const others = rows().filter((entry) => entry.candidate !== mine);
  const aggregate = candidateFromRawRows(candidates[0], [first, second, ...others]);
  assert.deepEqual(aggregate.tacticCounts, { [key("close", "cut")]: 7,
    [key("hold", "cover", "secondary", "threat")]: 4, [key("hold", "cover", "primary", "threat")]: 9 });
  assert.deepEqual(aggregate.freeChoiceCounts, { effector: { secondary: 4, primary: 9 } });
  // The same fold, reached through the exported helper the per-cell reader in
  // `scripts/evaluate-ai.mjs` calls -- so the grouping that report does is the
  // aggregation this test covers and not a second copy of it.
  assert.deepEqual(mergeBehaviourRecord([first, second]),
    { tacticCounts: aggregate.tacticCounts, freeChoiceCounts: aggregate.freeChoiceCounts });
  // And it reaches `headUtilisation`, which is what the report prints: 13 of the
  // 20 decisions had an effector choice, and the free modal is the primary.
  const heads = headUtilisation(aggregate);
  assert.equal(heads.effector.decisions, 20);
  assert.equal(heads.effector.freeChoiceDecisions, 13);
  assert.equal(heads.effector.freeModal, "primary");
});

/**
 * The producer, end to end through real Havok bouts.
 *
 * **Coverage space: two warrior cells of the fifteen -- `empty+empty` and
 * `sword+empty` -- one train bout each at seed 310013, 1200 solver steps (5 s)
 * per bout, every decision at `MIN_PERSISTENCE`.** Two rather than fifteen, and
 * these two rather than any others, because the thing this test is about needs a
 * body where the recorded head had a choice and a body where it did not, and
 * these are the pair that differ in exactly that and nothing else: two empty
 * fists can both `punch`, and only the sword hand can `cut`. Sweeping all
 * fifteen would cost thirteen more bouts to make the same distinction twice.
 * The third cell worth a bout is `sword+axe`, where the choice is on an
 * *attacking* action, and it has its own test below.
 *
 * `MIN_PERSISTENCE` for the reason `tests/lookahead.test.mjs` gives for the same
 * choice: at the 0.4 s a planner holds, five seconds is about a dozen decisions,
 * which is too few for any share taken off it to mean anything.
 */
test("a_real_bout_produces_a_behaviour_record_that_is_internally_consistent", async () => {
  const matrix = researchMatrix("train", 310013);
  const boutFor = async (loadout, action) => {
    const at = matrix.findIndex((entry) => entry.unit === "warrior" && entry.loadout === loadout);
    assert.ok(at >= 0, `no train job for warrior/${loadout}`);
    // Not `probeLabel`: that fixture asks for `asMeasured`, whose target is the
    // opponent's shoulder line and is deliberately not in `TARGET_NAMES`, so a
    // key built from it does not parse. A deployed labeler always names a real
    // region -- it argmaxes that table -- so naming one here is what makes this
    // probe stand in for the thing being recorded.
    return runResearchBout({ ...matrix[at], index: at }, (onDecision) =>
      researchLabelMind("record-probe", (view) => ({ movement: "close", action,
        effector: chooseEffector(view, action), target: "vital", stance: "action-default", persistence: 0.1 }),
      onDecision), 1200);
  };
  const fists = await boutFor("empty+empty", "punch");
  const sword = await boutFor("sword+empty", "cut");
  for (const [name, bout] of [["empty+empty", fists], ["sword+empty", sword]]) {
    const total = Object.values(bout.tacticCounts).reduce((sum, count) => sum + count, 0);
    assert.ok(bout.decisions > 20, `${name} took only ${bout.decisions} decisions`);
    assert.equal(total, bout.decisions, `${name} joint map must count every decision exactly once`);
    for (const head of FREE_CHOICE_HEADS) {
      const marginal = tacticMarginal(bout.tacticCounts, head);
      for (const [option, count] of Object.entries(bout.freeChoiceCounts[head])) {
        assert.ok(count <= (marginal[option] ?? 0),
          `${name}: ${count} free ${head} choices of "${option}" against a marginal of ${marginal[option] ?? 0}`);
      }
    }
    // Every key the producer wrote parses, which is the round trip across the
    // two functions the producer and the validator hold one each of.
    for (const written of Object.keys(bout.tacticCounts)) {
      assert.equal(tacticCountKey(parseTacticCountKey(written)), written);
    }
  }
  // The discrimination the whole change exists for, taken off two real bodies:
  // the effector marginal says `primary` on both, and only the free-choice
  // denominator says one of them had a second hand available and the other never
  // did.
  const chosen = (bout) => Object.keys(tacticMarginal(bout.tacticCounts, "effector"));
  assert.deepEqual(chosen(fists), ["primary"]);
  assert.deepEqual(chosen(sword), ["primary"]);
  assert.equal(headUtilisation(sword).effector.freeChoiceDecisions, 0,
    "only the sword hand can cut, so no cut decision ever had an effector choice");
  assert.equal(headUtilisation(fists).effector.freeChoiceDecisions, fists.decisions,
    "both fists can punch, so every punch decision had an effector choice");
});

/**
 * The reason `sword+axe` is in the strata, asserted rather than written down.
 *
 * The effector head is the one head of five whose free set a joint map cannot
 * recover, and it can only be *judged* on a cell where the body offered two
 * hands. Measured over every stratum before this loadout existed
 * (`.review/sa27/cells.mjs`, 39 bouts then), the only actions that ever offered
 * two legal effectors on an armed body were `cover` and `recover` -- so the
 * question "did this head learn anything?" was answerable on 2 cells of 13, both
 * of them the weaponless `empty+empty` pair, and the better a candidate was at
 * attacking the less its record could say. `sword+axe` is the loadout that
 * breaks that, and this test is what stops it being removed by accident.
 *
 * **Two halves, because either one alone is satisfied by its own setup.** The
 * first is a real Havok bout on the cell: what the body actually publishes,
 * sampled at every physics step, so a hand lost mid-bout is inside the space. It
 * would pass against a `tacticEffectors` that answered both hands for
 * everything. The second is the whole matrix projected onto "which attacking
 * actions name two hands", asserted as a complete record against a freshly
 * stated one -- which fails if `sword+axe` leaves `HUMANOID_RESEARCH_LOADOUTS`,
 * fails if a second loadout quietly acquires the property, and fails if the
 * rule that gives it the property changes for everybody.
 *
 * `thrust` is the half of this the decision note got wrong, and it is the more
 * interesting half. It reaches **one** hand here, not two: `isHeldStriker`
 * accepts an axe and `hasPoint` refuses it. So the loadout does not merely offer
 * a choice, it offers a choice on one attack and withholds it on the attack
 * beside it -- which is what separates "the effector head decided" from "the
 * loadout decided", and is why this row rather than `sword+sword`.
 *
 * Coverage space of the bout: one `warrior/sword+axe` train job at seed 310013,
 * mirror 0, 1200 solver steps (5 s), every decision at 0.1 s persistence. It
 * cannot see `broot`, mirror 1, another seed, or a bout long enough for the axe
 * hand to come off -- the second half is what covers the other fourteen cells,
 * and `the_training_schedule_offers_exactly_what_the_runtime_mask_offers` in
 * `tests/lookahead.test.mjs` is what pins the table it reads to real bodies on
 * all fifteen.
 */
test("an_attacking_action_names_two_hands_on_exactly_one_armed_research_loadout", async () => {
  const matrix = researchMatrix("train", 310013);
  const at = matrix.findIndex((entry) => entry.unit === "warrior" && entry.loadout === "sword+axe");
  assert.ok(at >= 0, "the research matrix has no warrior/sword+axe cell, so no armed body can exercise the effector head");
  const seen = new Set();
  const bout = await runResearchBout({ ...matrix[at], index: at }, (onDecision) =>
    researchLabelMind("two-striker-probe", (view) => ({ movement: "close", action: "cut",
      effector: chooseEffector(view, "cut"), target: "vital", stance: "action-default", persistence: 0.1 }),
    onDecision), 1200, null, {
      onSample({ view }) {
        for (const action of HAND_ACTION_NAMES) seen.add(`${action}=${tacticEffectors(view, action).join("|")}`);
      },
    });
  assert.ok(bout.decisions > 20, `sword+axe took only ${bout.decisions} decisions`);
  // Every distinct answer the published body gave over the whole bout, not the
  // first: a set with two members for one action would mean the capability moved
  // mid-probe, which is a fact worth failing on rather than sampling past.
  assert.deepEqual([...seen].sort(), ["bite=", "cover=primary|secondary", "cut=primary|secondary",
    "punch=", "recover=primary|secondary", "shoot=", "thrust=primary"]);
  // The consequence for the record the tournament reads: a candidate that spends
  // every decision attacking still has a free-effector denominator, which is
  // exactly what no armed cell could offer before.
  assert.equal(headUtilisation(bout).effector.freeChoiceDecisions, bout.decisions,
    "every cut decision on a two-striker body had a second hand available");

  // The matrix-wide half. `tacticsFor` reads `LOADOUT_TACTICS`, which
  // `the_training_schedule_offers_exactly_what_the_runtime_mask_offers` pins to
  // real published bodies on every cell, so this is the runtime rule asked once
  // per loadout rather than a second copy of it.
  const twoHanded = Object.fromEntries([...new Set(RESEARCH_STRATA.map((row) => row.loadout))].map((loadout) => {
    const rows = tacticsFor(loadout);
    return [loadout, ATTACK_OPTION_NAMES.filter((action) =>
      new Set(rows.filter((row) => row.action === action).map((row) => row.effector)).size > 1)];
  }));
  assert.deepEqual(twoHanded, { "sword+empty": [], "sword+shield": [], "sword+buckler": [],
    "sword+axe": ["cut"], "axe+empty": [], "bow+empty": [], "empty+empty": ["punch"], "natural:bite": [] });
});

/**
 * The theorem behind `FREE_CHOICE_HEADS`, asserted on live bodies rather than
 * only written down.
 *
 * A free-action map was carried for one session and deleted on 2026-08-25
 * because it is identically `tacticMarginal(counts, "action")`: every body that
 * can decide at all offers two or more legal hand actions, so the "free" filter
 * never excludes a decision. **A theorem a program relies on and no test reads
 * is a comment**, and this one has a boundary a future edit can cross -- a body
 * with a natural attack not named `bite` decides with `recover` alone -- so
 * something has to notice.
 *
 * Coverage space: every body every decision of two real Havok bouts publishes --
 * `warrior/empty+empty` and `warrior/natural:bite` is not reachable from a
 * warrior job, so the second cell is the centipede, which is the body closest to
 * the boundary: no hands at all, and its whole action set is `{bite, recover}`.
 * Seed 310013, 1200 solver steps each, `MIN_PERSISTENCE`. The exhaustive
 * synthetic sweep behind the same claim is `.review/rem26/theorem.mjs` (400
 * shapes) and the every-cell sweep is `.review/sa27/cells.mjs` (45 bouts, and 39
 * before `sword+axe` joined the strata; its ancestor `.review/rem26/cells.mjs`
 * no longer runs, because it still reads the free-action map this theorem
 * deleted). Neither is in the suite because both take real bouts or a
 * hand-rolled body table, and this is the cheap live reader for the one property
 * the deletion rests on.
 */
test("every_body_that_can_decide_offers_two_or_more_legal_actions", async () => {
  const matrix = researchMatrix("train", 310013);
  const smallest = async (unit, loadout, action, effector) => {
    const at = matrix.findIndex((entry) => entry.unit === unit && entry.loadout === loadout);
    assert.ok(at >= 0, `no train job for ${unit}/${loadout}`);
    let least = Infinity; let decisions = 0;
    await runResearchBout({ ...matrix[at], index: at }, (onDecision) =>
      researchLabelMind("mask-probe", () => ({ movement: "close", action, effector,
        target: "vital", stance: "action-default", persistence: 0.1 }),
      (view, features, label) => {
        decisions += 1;
        least = Math.min(least, HAND_ACTION_NAMES.filter((name) => deployableActions(view).has(name)).length);
        onDecision(view, features, label);
      }), 1200);
    assert.ok(decisions > 20, `${unit}/${loadout} took only ${decisions} decisions`);
    return least;
  };
  assert.ok(await smallest("warrior", "empty+empty", "punch", "primary") >= 2);
  // The centipede publishes no hands at all, so `{bite, recover}` is its entire
  // action set and it is exactly two -- the tight case, not a comfortable one.
  assert.equal(await smallest("centipede", "natural:bite", "bite", "natural"), 2);
});
