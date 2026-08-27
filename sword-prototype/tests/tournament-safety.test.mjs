import assert from "node:assert/strict";
import test from "node:test";

import { freshIntent } from "../src/action-primitives.ts";
import { tournamentSafetyFromBout, tournamentSafetyObserver } from "../scripts/tournament-safety.mjs";

process.env.SWORD_MEASURE_LIBRARY = "1";
const { runResearchBout } = await import("../scripts/research-havok.mjs");

const view = (clock = 0) => ({ clock, self: { unit: "warrior", naturalAttacks: {}, hands: {
  primary: { weapon: "sword", lost: false }, secondary: { weapon: "empty", lost: false },
} } });
const legal = Object.freeze({ movement: "hold", action: "recover", effector: "primary",
  target: "threat", stance: "action-default", persistence: 0.4 });
const result = (seconds = 1) => ({ ending: "time", seconds });

const observed = ({ seconds = 1, afterVerdictIntent = false, postVerdictSample = true,
  intent = freshIntent(), label = legal, secondTactic = null } = {}) => {
  const observer = tournamentSafetyObserver();
  observer.observeTactic(view(0), label);
  observer.observeIntent(view(0), intent);
  observer.observeSample({ clock: 0 });
  if (secondTactic) observer.observeTactic(view(secondTactic.at), secondTactic.label);
  observer.observeVerdict();
  if (afterVerdictIntent) observer.observeIntent(view(seconds), freshIntent());
  if (postVerdictSample) observer.observeSample({ clock: seconds });
  return observer.finish(result(seconds));
};

test("a_complete_observed_bout_passes_all_five_safety_properties", () => {
  assert.deepEqual(observed(), { finiteAnatomical: true, capabilities: true,
    postVerdict: true, stuckActions: true, lifecycle: true });
});

test("a_non_finite_or_out_of_envelope_command_fails_finite_anatomical_safety", () => {
  for (const intent of [
    { ...freshIntent(), forward: Number.NaN },
    { ...freshIntent(), primary: { ...freshIntent().primary, pointerX: 1.01 } },
  ]) assert.equal(observed({ intent }).finiteAnatomical, false);
});

test("a_tuple_the_body_cannot_execute_fails_capability_safety", () => {
  const impossible = { ...legal, action: "shoot", target: "vital" };
  assert.equal(observed({ label: impossible }).capabilities, false);
});

test("an_intent_after_the_verdict_edge_fails_post_verdict_safety", () => {
  assert.equal(observed({ afterVerdictIntent: true }).postVerdict, false);
});

test("one_movement_or_action_for_at_least_five_seconds_and_95_percent_of_the_bout_is_stuck", () => {
  assert.equal(observed({ seconds: 10 }).stuckActions, false);
  const changed = { ...legal, movement: "close", action: "cut", target: "vital" };
  assert.equal(observed({ seconds: 10, secondTactic: { at: 9.50, label: changed } }).stuckActions, false);
  assert.equal(observed({ seconds: 10, secondTactic: { at: 9.49, label: changed } }).stuckActions, true);
  assert.equal(observed({ seconds: 10, secondTactic: { at: 5, label: { ...changed, action: legal.action,
    target: legal.target } } }).stuckActions, false, "a stuck action fails even while movement changes");
  assert.equal(observed({ seconds: 10, secondTactic: { at: 5, label: { ...changed, movement: legal.movement } } }).stuckActions,
    false, "a stuck movement fails even while action changes");
});

test("a_bout_without_a_live_post_verdict_tail_fails_lifecycle_safety", () => {
  assert.equal(observed({ postVerdictSample: false }).lifecycle, false);
  const observer = tournamentSafetyObserver();
  observer.observeTactic(view(1), legal); observer.observeIntent(view(1), freshIntent());
  observer.observeSample({ clock: 1 }); observer.observeSample({ clock: 0.5 }); observer.observeVerdict();
  observer.observeSample({ clock: 1 });
  assert.equal(observer.finish(result(1)).lifecycle, false, "a reversing lifecycle clock is also observed");
});

test("missing_invented_or_non_boolean_safety_evidence_is_refused_instead_of_passing", () => {
  const pass = observed();
  assert.deepEqual(tournamentSafetyFromBout({ safetyEvidence: pass }), pass);
  assert.throws(() => tournamentSafetyFromBout({}), /no complete measured safety evidence/);
  assert.throws(() => tournamentSafetyFromBout({ safetyEvidence: { ...pass, lifecycle: "yes" } }),
    /no complete measured safety evidence/);
  assert.throws(() => tournamentSafetyFromBout({ safetyEvidence: { ...pass, invented: true } }),
    /no complete measured safety evidence/);
});

test("a_candidate_with_no_tactic_observation_fails_capability_safety", () => {
  const observer = tournamentSafetyObserver();
  observer.observeIntent(view(0), freshIntent()); observer.observeSample({ clock: 0 }); observer.observeVerdict();
  observer.observeSample({ clock: 1 });
  assert.equal(observer.finish(result()).capabilities, false);

  const control = tournamentSafetyObserver({ requireTacticEvidence: false });
  control.observeIntent(view(0), freshIntent()); control.observeSample({ clock: 0 }); control.observeVerdict();
  control.observeSample({ clock: 1 });
  assert.equal(control.finish(result()).capabilities, true, "a non-label control is observed through its actual commands");
});

test("real_research_bodies_report_safety_only_after_the_verdict_tail_and_teardown_return", async () => {
  const cases = [
    { unit: "warrior", loadout: "sword+empty", label: legal },
    { unit: "centipede", loadout: "natural:bite", label: { ...legal, action: "bite", effector: "natural", target: "vital" } },
  ];
  for (const [index, sample] of cases.entries()) {
    const observer = tournamentSafetyObserver();
    const bout = await runResearchBout({ index, actorSide: "left", actorSeed: 81 + index, opponentSeed: 82 + index,
      unit: sample.unit, loadout: sample.loadout, opponent: "swinger", boutCapSeconds: 1 },
    (onDecision) => ({ name: "safety-probe", decide(liveView) {
      onDecision(liveView, [], sample.label);
      return freshIntent();
    } }), 240, null, { tournamentSafety: observer });
    assert.deepEqual(bout.safetyEvidence, { finiteAnatomical: true, capabilities: true,
      postVerdict: true, stuckActions: true, lifecycle: true }, sample.unit);
    assert.equal(bout.result.ending, "time", sample.unit);
  }
});
