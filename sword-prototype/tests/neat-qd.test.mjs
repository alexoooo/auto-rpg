import test from "node:test";
import assert from "node:assert/strict";

import { InnovationTracker, adaptiveCompatibilityThreshold, addRecurrentEdgeMutation, crossover,
  hasCycle, initialSparseGenome } from "../src/learning/genome.ts";
import { SeededRng } from "../src/learning/rng.ts";
import { RecurrentNeatNetwork } from "../src/learning/recurrent-neat.ts";
import { QualityArchive, qualityCell, selectValidationChampion } from "../src/learning/quality-diversity.ts";
import { curriculumDigest, curriculumStage, RESEARCH_CURRICULUM, RESEARCH_STRATA,
  opponentForArchive, sampleOpponentArchive, SHIPPED_OPPONENT_ARCHIVE } from "../src/learning/research-matrix.ts";
import { researchStateBytes } from "../src/learning/research.ts";

test("recurrent_neat_preserves_historical_markings_and_rejects_enabled_cycles_without_delay", () => {
  const rng = new SeededRng(310013); const innovations = new InnovationTracker(6);
  const genome = initialSparseGenome(0, 3, 2, rng, innovations);
  assert.equal(hasCycle({ nodes: genome.nodes, edges: [{ innovation: 999, from: 4, to: 4, weight: 1, enabled: true }] }), true);
  assert.equal(addRecurrentEdgeMutation(genome, rng, innovations), true);
  const recurrent = genome.edges.find((edge) => edge.recurrent);
  assert.ok(recurrent); assert.equal(hasCycle(genome), false, "a recurrent edge is an explicit one-step delay");
  const twin = new InnovationTracker(6); assert.equal(twin.edge(recurrent.from, recurrent.to), 0);
});

test("adaptive_speciation_moves_both_directions_toward_the_frozen_species_band", () => {
  assert.equal(adaptiveCompatibilityThreshold(1.5, 5), 1.4);
  assert.equal(adaptiveCompatibilityThreshold(1.5, 6), 1.5);
  assert.equal(adaptiveCompatibilityThreshold(1.5, 12), 1.5);
  assert.equal(adaptiveCompatibilityThreshold(1.5, 13), 1.6);
});

test("innovation_correct_crossover_applies_disabled_gene_inheritance", () => {
  const make = (id, enabled) => ({ id, nodes: [
    { id: 0, kind: "input", bias: 0, activation: "identity" },
    { id: 1, kind: "bias", bias: 0, activation: "identity" },
    { id: 2, kind: "output", bias: 0, activation: "tanh" },
  ], edges: [{ innovation: 7, from: 0, to: 2, weight: id, enabled }], fitness: 1, adjustedFitness: 0, novelty: 0 });
  const first = make(1, false); const second = make(2, true);
  let disabled = 0;
  for (let seed = 1; seed <= 200; seed += 1) if (!crossover(first, second, new SeededRng(seed), seed).edges[0].enabled) disabled += 1;
  assert.ok(disabled > 120 && disabled < 180, `disabled inheritance should be near 75%, got ${disabled}/200`);
  const left = make(3, true); const right = make(4, true);
  right.edges = [{ innovation: 8, from: 0, to: 2, weight: 4, enabled: true }];
  const equal = crossover(left, right, new SeededRng(7), 9);
  assert.deepEqual(equal.edges.map((edge) => edge.innovation), [7, 8], "equal-fitness parents retain either parent's disjoint innovations");
});

test("the_neat_qd_initializer_is_minimal_sparse_not_a_dense_finished_network", () => {
  const genome = initialSparseGenome(2, 20, 8, new SeededRng(4), new InnovationTracker(29));
  assert.ok(genome.edges.length >= 8, "every output retains its bias seed");
  assert.ok(genome.edges.length < (20 + 1) * 8 / 2, `${genome.edges.length} edges is sparse`);
});

test("a_recurrent_edge_reads_exactly_the_previous_decision_state", () => {
  const network = new RecurrentNeatNetwork({ nodes: [
    { id: 0, kind: "input", bias: 0, activation: "identity" },
    { id: 1, kind: "bias", bias: 0, activation: "identity" },
    { id: 2, kind: "output", bias: 0, activation: "identity" },
  ], edges: [
    { innovation: 0, from: 0, to: 2, weight: 1, enabled: true },
    { innovation: 1, from: 2, to: 2, weight: 0.5, enabled: true, recurrent: true },
  ] });
  assert.deepEqual(network.run([2]), [2]);
  assert.deepEqual(network.run([0]), [1]);
  assert.deepEqual(network.run([0]), [0.5]);
  network.reset(); assert.deepEqual(network.run([0]), [0]);
});

test("map_elites_keeps_the_best_feasible_controller_in_each_exact_behavior_cell", () => {
  const archive = new QualityArchive(); const descriptor = { opportunityConversion: 0.41, contactConversion: 0.61, nearRangeStallShare: 0.19 };
  assert.equal(qualityCell(descriptor), "2:3:0");
  archive.offer({ descriptor, result: { terminalTier: 0, safetyTier: 2, feasible: true }, value: "first" });
  archive.offer({ descriptor, result: { terminalTier: 1, safetyTier: 1, feasible: true }, value: "winner" });
  assert.equal(archive.get(descriptor).value, "winner");
  assert.equal(selectValidationChampion([
    { id: 0, macroScore: 100, worstCellScore: -20, value: "brittle" },
    { id: 1, macroScore: 40, worstCellScore: 10, value: "robust" },
  ]), "robust", "validation selection cannot hide a failed cell behind its macro mean");
});

test("novel_but_stalling_behavior_cannot_displace_a_feasible_elite", () => {
  const archive = new QualityArchive(); const descriptor = { opportunityConversion: 0.2, contactConversion: 0.2, nearRangeStallShare: 0.9 };
  archive.offer({ descriptor, result: { terminalTier: 0, safetyTier: 1, feasible: true }, value: "feasible" });
  assert.equal(archive.offer({ descriptor, result: { terminalTier: 99, safetyTier: 99, feasible: false }, value: "novel-stall" }), false);
  assert.equal(archive.get(descriptor).value, "feasible");
});

test("the_curriculum_schedule_is_seed_independent_complete_and_in_the_config_digest", () => {
  assert.equal(curriculumStage(0).name, "stationary"); assert.equal(curriculumStage(0.75).name, "complete");
  assert.equal(curriculumDigest(), curriculumDigest()); assert.ok(curriculumDigest().length === 8);
  assert.deepEqual(RESEARCH_CURRICULUM.at(-1).strata, RESEARCH_STRATA);
});

test("the_final_quarter_contains_every_frozen_loadout_opponent_and_unit_stratum", () => {
  for (const fraction of [0.75, 0.90, 1]) assert.deepEqual(curriculumStage(fraction).strata, RESEARCH_STRATA);
});

test("opponent_archive_sampling_is_indexed_and_worker_count_independent", () => {
  const serial = Array.from({ length: 20 }, (_, index) => sampleOpponentArchive(SHIPPED_OPPONENT_ARCHIVE, 310013, index).id);
  const shuffled = [...Array(20).keys()].reverse().map((index) => [index, sampleOpponentArchive(SHIPPED_OPPONENT_ARCHIVE, 310013, index).id])
    .sort((a, b) => a[0] - b[0]).map((row) => row[1]);
  assert.deepEqual(shuffled, serial);
  for (const entry of SHIPPED_OPPONENT_ARCHIVE) assert.equal(opponentForArchive(entry, "specialist"), entry.policy,
    `sampled archive entry ${entry.id} must control the actual rollout opponent`);
  assert.equal(opponentForArchive({ id: "champion:1", stage: 1, policy: "champion", artifactDigest: "abc" }, "random-meta"), "random-meta");
});

test("neat_qd_resume_reproduces_the_same_population_archive_and_report_bytes", () => {
  const state = { population: [{ id: 2 }, { id: 1 }], archive: [["0:0:0", 2]], reports: [{ generation: 0 }] };
  assert.deepEqual(researchStateBytes(state), researchStateBytes(JSON.parse(JSON.stringify(state))));
});
