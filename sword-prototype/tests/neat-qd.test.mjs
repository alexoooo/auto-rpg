import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { InnovationTracker, adaptiveCompatibilityThreshold, addRecurrentEdgeMutation, crossover,
  hasCycle, initialSparseGenome } from "../src/learning/genome.ts";
import { SeededRng } from "../src/learning/rng.ts";
import { RecurrentNeatNetwork } from "../src/learning/recurrent-neat.ts";
import { QualityArchive, qualityCell, selectValidationChampion } from "../src/learning/quality-diversity.ts";
import { curriculumDigest, curriculumStage, RESEARCH_CURRICULUM, RESEARCH_STRATA,
  opponentForArchive, sampleOpponentArchive, SHIPPED_OPPONENT_ARCHIVE } from "../src/learning/research-matrix.ts";
import { researchStateBytes } from "../src/learning/research.ts";
import { FEATURE_COLUMNS } from "../src/learning/features.ts";
import { META_OUTPUT_LAYOUT, readMetaOutput, selectDeployableTactic } from "../src/learning/meta.ts";
import { QD_BINS } from "../src/learning/quality-diversity.ts";
import { EFFECTOR_NAMES, HAND_ACTION_NAMES, TARGET_NAMES } from "../src/options.ts";

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

test("the_rollout_worker_refuses_a_command_line_rather_than_exiting_zero_having_done_nothing", () => {
  // Both trainers resolve on the worker's `message` and reject only on `error`
  // or a non-zero `exit`, so a worker that finishes without posting is the one
  // outcome neither can see: the promise never settles and the run hangs. The
  // port gate can produce exactly that, and the reachable way to reach it is a
  // person running the file. Asserted through a real process, because what is
  // being tested is the exit code and the sentence on stderr.
  const worker = fileURLToPath(new URL("../scripts/research-rollout-worker.mjs", import.meta.url));
  const run = spawnSync(process.execPath, [worker], { encoding: "utf8" });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /research-rollout-worker\.mjs is a worker-thread entry point with no command line/);
  // And importing it is still silent, which is why the gate exists at all:
  // `neatLabeler` is read by `tests/learning.test.mjs`.
  const imported = spawnSync(process.execPath, ["--input-type=module", "-e",
    `await import(${JSON.stringify(pathToFileURL(worker).href)});`], { encoding: "utf8" });
  assert.equal(imported.status, 0, imported.stderr);
});

/**
 * NEAT-QD's genome width tracked the widening with no edit, and that is checked
 * rather than assumed.
 *
 * `scripts/train-neat-qd.mjs` builds every genome at `META_OUTPUT_LAYOUT.width`
 * and seeds its `InnovationTracker` at `FEATURE_COLUMNS.length + 1 + outputs`,
 * so the population went from 13 outputs to 26 when the layout did. What that
 * *buys* is only real if a genome of that width decodes, so this builds one the
 * way the trainer does and takes it all the way through `readMetaOutput` to a
 * legal tuple -- which is the chain a width mismatch breaks, one bout into a run,
 * inside a worker.
 */
test("a_genome_built_at_the_layout_width_decodes_to_a_legal_tuple", () => {
  const rng = new SeededRng(310013);
  const innovations = new InnovationTracker(FEATURE_COLUMNS.length + 1 + META_OUTPUT_LAYOUT.width);
  const genome = initialSparseGenome(0, FEATURE_COLUMNS.length, META_OUTPUT_LAYOUT.width, rng, innovations);
  assert.equal(genome.nodes.filter((node) => node.kind === "output").length, META_OUTPUT_LAYOUT.width);
  const values = new RecurrentNeatNetwork(genome).run(FEATURE_COLUMNS.map(() => 0));
  assert.equal(values.length, 26);
  const output = readMetaOutput(values);
  assert.deepEqual([output.movementLogits.length, output.actionLogits.length, output.effectorLogits.length,
    output.targetLogits.length, output.stanceLogits.length], [5, 7, 3, 4, 6]);
  // A body, so the decode ends where a bout would: one legal tuple.
  const hand = (weapon, outboard) => ({ weapon, lost: false, reach: 1.4, tipSpeed: 0,
    tipVelocity: { x: 0, y: 0, z: 0 }, outboard, shoulder: { x: outboard * 0.2, y: 1.4, z: 0 }, tip: { x: outboard * 0.2, y: 1.4, z: 1 } });
  const body = { unit: "warrior", reach: 1.4, crownHeight: 1.8, vitalHeight: 1.1, collisionRadius: 0.3,
    naturalAttacks: {}, ground: { x: 0, y: 0, z: 0 }, facing: 0, shoulder: { x: 0.2, y: 1.4, z: 0 },
    tip: { x: 0.2, y: 1.4, z: 1 }, tipSpeed: 0, hands: { primary: hand("sword", 1), secondary: hand("empty", -1) },
    crouch: 0, trunkLean: 0, trunkTwist: 0, vitality: 1, health: {} };
  const view = { self: body, opponent: body, projectiles: [], measure: 1.2, clock: 0 };
  const tactic = selectDeployableTactic(view, output);
  assert.ok(HAND_ACTION_NAMES.includes(tactic.action) && EFFECTOR_NAMES.includes(tactic.effector) &&
    TARGET_NAMES.includes(tactic.target), JSON.stringify(tactic));
});

/**
 * The quality-diversity descriptor did **not** move with the output contract,
 * and the arithmetic is the reason.
 *
 * `QualityDescriptor` is three outcome measures binned at `QD_BINS` = 5, so 125
 * cells. Adding the chosen tuple as categorical dimensions multiplies that by
 * the tuple space: 7 actions x 3 effectors x 4 targets is 84 nominal and 72
 * legal on a humanoid, which is 9,000-10,500 cells against a full-budget run of
 * `populationSize` 128 x `generations` 80 = 10,240 genome evaluations. That is
 * fewer than one elite per cell before a single cell is ever revisited, which
 * stops it being an archive and makes it a list.
 *
 * The second reason is not arithmetic: this is an **outcome** descriptor -- what
 * the controller achieved -- and the chosen tuple is an input to that. Bolting
 * one onto the other changes what the archive measures rather than how finely.
 *
 * Pinned as a number so that widening it silently is a failure rather than a
 * decision nobody re-took.
 */
test("the_quality_archive_stays_a_125_cell_outcome_map_keyed_on_nothing_a_controller_chose", () => {
  const archive = new QualityArchive();
  for (let a = 0; a < QD_BINS; a += 1) for (let b = 0; b < QD_BINS; b += 1) for (let c = 0; c < QD_BINS; c += 1) {
    archive.offer({ descriptor: { opportunityConversion: (a + 0.5) / QD_BINS, contactConversion: (b + 0.5) / QD_BINS,
      nearRangeStallShare: (c + 0.5) / QD_BINS }, result: { terminalTier: 0, safetyTier: 0, feasible: true }, value: `${a}:${b}:${c}` });
  }
  assert.equal(archive.entries().length, QD_BINS ** 3);
  assert.equal(archive.entries().length, 125);
  // The cell key names three numbers and nothing about the tuple, which is the
  // fact a widening would have to change.
  assert.equal(qualityCell({ opportunityConversion: 0.41, contactConversion: 0.61, nearRangeStallShare: 0.19 }).split(":").length, 3);
  // **The arithmetic assertion that used to be here was against the wrong
  // number and is gone.** It read
  // `128 * 80 < 125 * HAND_ACTION_NAMES.length * EFFECTOR_NAMES.length * TARGET_NAMES.length`
  // -- 10,240 < 10,500 -- which is the *nominal* 7 x 3 x 4 = 84 product and not
  // a count of legal tuples. Measured, `|deployableTactics|` peaks at 21 on any
  // body and the union over the thirteen research cells is 24, so the widened
  // archive would be 125 x 24 = 3,000 cells against 10,240 evaluations: 3.4 per
  // cell, and the "fewer than one elite per cell" sentence it was carrying is
  // false. `quality-diversity.ts` re-takes the decision on the true figures and
  // records that the outcome-descriptor argument is now the only reason.
  //
  // What is asserted instead is that argument itself, and asserted so that it
  // can fail: the cell key is a function of the three outcome measures **and of
  // nothing else**, so a chosen tuple carried on the descriptor changes no cell
  // until somebody edits `qualityCell` on purpose.
  const outcome = { opportunityConversion: 0.41, contactConversion: 0.61, nearRangeStallShare: 0.19 };
  assert.equal(qualityCell({ ...outcome, action: "cut", effector: "secondary", target: "high" }), qualityCell(outcome),
    "the cell key reads something other than the three outcome measures");
  assert.equal(qualityCell(outcome), "2:3:0");
});
