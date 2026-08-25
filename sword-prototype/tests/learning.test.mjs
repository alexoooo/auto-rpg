import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

import { FEATURE_COLUMNS, FEATURE_VERSION } from "../src/learning/features.ts";
import { Checkpoint } from "../src/learning/checkpoint.ts";
import { SEED_RANGES, evaluationMirrorSeeds, forcedOptionEvaluationMind, mirroredEvaluationJobs, seedRangesOverlap, validateSeedRanges } from "../src/learning/evaluation.ts";
import { InnovationTracker, addEdgeMutation, addNodeMutation, breedGeneration, crossover, hasCycle, initialPopulation, innovationTrackerFor, speciate, speciesSelectionWeights } from "../src/learning/genome.ts";
import { fitnessComponents, learnedMetaMind, META_OUTPUT_NAMES, networkMetaMind, noveltyDescriptor, randomMetaMind } from "../src/learning/meta.ts";
import { HAND_ACTION_NAMES, MOVEMENT_NAMES, OPTION_NAMES, behaviourRecord, scriptedMetaMind } from "../src/options.ts";
import { STRIKER_KINDS, WEAPON_KINDS } from "../src/hands.ts";
import { partitionIndexed, restoreIndexed } from "../src/learning/jobs.ts";
import { Network } from "../src/learning/network.ts";
import { SeededRng } from "../src/learning/rng.ts";
import { assessPromotion, selectValidationChampion, validateDefaultTrainingReport } from "../src/learning/promotion.ts";
import { runPromotionEvaluation } from "../scripts/promotion-evaluator.mjs";
import { assertCompleteView, assertCompleteBody } from "./fixtures/view.mjs";

const digest = (value) => JSON.stringify(value);

/**
 * The parts of a hand-rolled view that are not a hand, and the zero velocity a
 * still hand carries.
 *
 * Five body facts and one hand field, all of them read by `selectThreat`, all of
 * them absent from every fixture in this file until feature v4 went looking for
 * them. `projectiles` threw; the rest arrived as `undefined` and became `NaN`,
 * which loses a comparison rather than failing one. `tests/fixtures/view.mjs`
 * carries the argument and the check.
 */
const SHAPE = { unit: "warrior", reach: 0.7, crownHeight: 1.8, vitalHeight: 1.1, collisionRadius: 0.3 };
const STILL = () => ({ x: 0, y: 0, z: 0 });

test("the_same_seed_builds_the_same_initial_population_and_first_generation", () => {
  const a = initialPopulation(8, 4, 3, 77); const b = initialPopulation(8, 4, 3, 77);
  a.forEach((genome, i) => { genome.fitness = i % 3; b[i].fitness = i % 3; });
  const nextA = breedGeneration(a, 91, 2, innovationTrackerFor(a)); const nextB = breedGeneration(b, 91, 2, innovationTrackerFor(b));
  assert.equal(digest(a), digest(b)); assert.equal(digest(nextA), digest(nextB));
  for (const genome of nextA) assert.equal(new Set(genome.edges.map((edge) => edge.innovation)).size, genome.edges.length);
});

test("the_ci_sized_training_smoke_runs_eight_genomes_three_generations_and_two_mirrored_bouts", () => {
  const run = () => { let population = initialPopulation(8, 4, 3, 8080); let evaluations = 0;
    for (let generation = 0; generation < 3; generation += 1) {
      for (const genome of population) { let score = 0; for (let mirror = 0; mirror < 2; mirror += 1) {
        score += new Network(genome).run([mirror, generation / 3, genome.id / 8, 1])[0]; evaluations += 1; }
        genome.fitness = score / 2; }
      if (generation < 2) population = breedGeneration(population, 8080 ^ (generation + 1), 2, innovationTrackerForTest(population));
    }
    return { evaluations, population: digest(population) }; };
  const innovationTrackerForTest = (population) => { const maxNode = Math.max(...population.flatMap((g) => g.nodes.map((n) => n.id))) + 1;
    const tracker = new InnovationTracker(maxNode, Math.max(...population.flatMap((g) => g.edges.map((e) => e.innovation))) + 1);
    population.flatMap((g) => g.edges).forEach((edge) => tracker.observe(edge)); return tracker; };
  assert.deepEqual(run(), run()); assert.equal(run().evaluations, 48);
});

test("mutation_can_add_a_node_and_an_edge_without_creating_a_cycle", () => {
  const genome = initialPopulation(1, 3, 2, 8)[0]; const innovations = new InnovationTracker(6); const rng = new SeededRng(9);
  assert.equal(addNodeMutation(genome, rng, innovations), true);
  assert.equal(addEdgeMutation(genome, rng, innovations), true); for (let i = 0; i < 64; i += 1) addEdgeMutation(genome, rng, innovations);
  assert.equal(hasCycle(genome), false); assert.doesNotThrow(() => new Network(genome));
  const hidden = genome.nodes.find((node) => node.kind === "hidden"); const output = genome.nodes.find((node) => node.id === genome.edges.find((edge) => edge.from === hidden.id).to);
  assert.equal(hasCycle({ nodes: genome.nodes, edges: [...genome.edges,
    { innovation: 999999, from: output.id, to: hidden.id, weight: 1, enabled: true }] }), true);
});

test("crossover_keeps_matching_innovations_and_the_fitter_disjoint_genes", () => {
  const [fitter, other] = initialPopulation(2, 2, 2, 5); fitter.fitness = 2; other.fitness = 1;
  fitter.edges.push({ innovation: 999, from: 0, to: 3, weight: 4, enabled: false });
  other.edges = other.edges.filter((edge) => edge.innovation !== 0);
  const child = crossover(fitter, other, new SeededRng(2), 4);
  assert.equal(child.edges.some((edge) => edge.innovation === 999), true);
  assert.equal(child.edges.length, fitter.edges.length);
  other.nodes.find((node) => node.kind === "output").bias = 7;
  const otherChild = crossover(fitter, other, { chance: () => true }, 5);
  assert.equal(otherChild.nodes.find((node) => node.kind === "output").bias, 7);
});

test("fragmented_species_cannot_turn_elite_one_into_an_entire_unmutated_generation", () => {
  const population = initialPopulation(5, 2, 2, 99); population.forEach((genome, index) => {
    genome.fitness = 5 - index; genome.edges.forEach((edge) => { edge.weight += index * 20; }); });
  const structure = (genome) => digest({ nodes: genome.nodes, edges: genome.edges });
  const before = new Set(population.map(structure)); const next = breedGeneration(population, 100, 1, innovationTrackerFor(population));
  assert.ok(next.filter((genome) => before.has(structure(genome))).length < next.length);
  assert.equal(digest(next[0].nodes), digest(population[0].nodes)); assert.equal(digest(next[0].edges), digest(population[0].edges));
});

test("species_sharing_prevents_one_large_species_from_taking_every_slot", () => {
  const population = initialPopulation(5, 2, 2, 1); const outlier = structuredClone(population[4]);
  outlier.edges[0].weight = 100; population[4] = outlier; population.forEach((genome) => { genome.fitness = 10; });
  const species = speciate(population, 1.5); assert.equal(species.length, 2);
  const large = species.find((group) => group.members.length === 4); const small = species.find((group) => group.members.length === 1);
  assert.equal(large.members[0].adjustedFitness, 2.5); assert.equal(small.members[0].adjustedFitness, 10);
});

test("negative_species_fitness_keeps_its_relative_selection_pressure", () => {
  const population = initialPopulation(2, 2, 2, 17); population[0].fitness = -0.01; population[1].fitness = -1;
  population[1].edges[0].weight = 100; const groups = speciate(population, 1.5); const weights = speciesSelectionWeights(groups);
  assert.equal(groups.length, 2); assert.ok(weights[0] > weights[1]); assert.equal(weights[1], 0.0001);
});

test("non_attack_option_entries_do_not_dilute_attack_novelty", () => {
  const record = behaviourRecord(); record.seconds = 1; record.blocks = 10;
  record.attackAttempts.close = 10; record.attackAttempts.cover = 20; record.attackAttempts.cut = 2;
  assert.equal(noveltyDescriptor(record)[4], 0.5);
});

test("elapsed_survival_cannot_reward_a_draw_or_loss", () => {
  const short = behaviourRecord(); short.seconds = 1; short.vitality = 1;
  const long = { ...short, seconds: 30 };
  assert.equal(fitnessComponents(short, 1, 0).survival, 0);
  assert.equal(fitnessComponents(long, 1, 0).total, fitnessComponents(short, 1, 0).total);
  assert.ok(fitnessComponents(short, 1, 0).total < 0);
  short.win = true; assert.ok(fitnessComponents(short, 1, 0).total > 0);
});

test("engagement_is_a_hard_feasibility_gate_not_a_positive_reward", () => {
  const feasible = behaviourRecord(); feasible.win = true; feasible.engagement.viableOpportunities = 1;
  feasible.engagement.attacksInWindow = 1;
  const avoider = behaviourRecord(); avoider.win = true; avoider.damage = 1000;
  avoider.engagement.retreatOutsideReachSeconds = 10;
  assert.equal(fitnessComponents(feasible, 1, 0).feasible, true);
  assert.equal(fitnessComponents(avoider, 1, 0).feasible, false);
  assert.ok(fitnessComponents(feasible, 1, 0).total > fitnessComponents(avoider, 1, 0).total);
});

test("train_validation_and_test_seed_ranges_do_not_overlap", () => {
  assert.doesNotThrow(() => validateSeedRanges(SEED_RANGES));
  assert.throws(() => validateSeedRanges({ train: [0, 10], validation: [10, 20], test: [30, 40] }), /overlap/);
});

test("mirrored_evaluation_charges_both_spawn_sides_to_one_genome", () => {
  const jobs = mirroredEvaluationJobs(20260823, "train", 6); assert.equal(jobs.length, 6);
  for (let cell = 0; cell < 3; cell += 1) { const pair = jobs.filter((job) => job.cell === cell);
    assert.deepEqual(pair.map((job) => job.actorSide), ["left", "right"]); assert.equal(pair[0].seed, pair[1].seed); }
  assert.throws(() => mirroredEvaluationJobs(20260823, "train", 3), /positive even/);
});

test("a_forced_option_retires_after_capability_loss_but_initially_unsupported_still_refuses", () => {
  const hand = (weapon, lost = false) => ({ weapon, lost, reach: 1.4, tipSpeed: 0, tipVelocity: STILL(), outboard: 1,
    shoulder: { x: 0, y: 1.4, z: 0 }, tip: { x: 0, y: 1.4, z: 1 } });
  const body = (primary) => ({ ...SHAPE, naturalAttacks: {}, ground: { x: 0, y: 0, z: 0 }, facing: 0, shoulder: primary.shoulder,
    tip: primary.tip, tipSpeed: 0, hands: { primary, secondary: hand("empty") }, crouch: 0, trunkLean: 0, trunkTwist: 0, vitality: 1, health: {} });
  const view = assertCompleteView({ self: body(hand("sword")), opponent: body(hand("sword")),
    projectiles: [], measure: 1.2, clock: 0 });
  const cut = forcedOptionEvaluationMind("cut"); assert.doesNotThrow(() => cut.decide(view, 1 / 60));
  view.self.hands.primary.lost = true; view.self.hands.secondary.lost = true; view.clock = 2;
  for (let frame = 0; frame < 4; frame += 1) assert.doesNotThrow(() => cut.decide(view, 1 / 60));
  assert.equal(cut.selected, "recover");
  const unsupported = forcedOptionEvaluationMind("shoot"); assert.throws(() => unsupported.decide(view, 1 / 60), /option "shoot" requires a bow/);
});

test("a_learned_meta_policy_can_repeat_one_completed_option_and_goes_inert_after_last_hand_loss", () => {
  const hand = (weapon, outboard) => ({ weapon, lost: false, reach: 1.4, tipSpeed: 0, tipVelocity: STILL(), outboard,
    shoulder: { x: outboard * 0.2, y: 1.4, z: 0 }, tip: { x: outboard * 0.2, y: 1.4, z: 1 } });
  const body = () => { const primary = hand("sword", 1); return { ...SHAPE, naturalAttacks: {}, ground: { x: 0, y: 0, z: 0 }, facing: 0,
    shoulder: primary.shoulder, tip: primary.tip, tipSpeed: 0, hands: { primary, secondary: hand("empty", -1) },
    crouch: 0, trunkLean: 0, trunkTwist: 0, vitality: 1, health: {} }; };
  const view = assertCompleteView({ self: body(), opponent: body(), projectiles: [], measure: 1.2, clock: 0 });
  view.opponent.ground.z = 1.4;
  const nodes = [...Array.from({ length: FEATURE_COLUMNS.length }, (_, id) => ({ id, kind: "input" })),
    ...Array.from({ length: META_OUTPUT_NAMES.length }, (_, index) => ({ id: FEATURE_COLUMNS.length + index, kind: "output" }))];
  const network = { nodes, run() { const output = Array(META_OUTPUT_NAMES.length).fill(-1); output[META_OUTPUT_NAMES.indexOf("cut")] = 1; return output; } };
  const mind = networkMetaMind(network); let fallingEdges = 0; let guarded = true;
  for (let frame = 0; frame < 200; frame += 1) { view.clock = frame / 60; const intent = mind.decide(view, 1 / 60);
    if (guarded && !intent.primary.guard) fallingEdges += 1; guarded = intent.primary.guard; }
  assert.ok(fallingEdges >= 2, `expected repeated cut commits, got ${fallingEdges}`); assert.ok(mind.entries.cut >= 2); assert.equal(mind.switches, 0);
  view.self.hands.primary.lost = true; view.self.hands.secondary.lost = true;
  assert.doesNotThrow(() => mind.decide(view, 1 / 60)); assert.equal(mind.selected, "recover");
  const random = randomMetaMind(4); assert.doesNotThrow(() => random.decide(view, 1 / 60)); assert.equal(random.selected, "recover");
  const scripted = scriptedMetaMind("duelist", 4); assert.doesNotThrow(() => scripted.decide(view, 1 / 60)); assert.equal(scripted.selected, "recover");
});

test("worker_count_and_completion_order_do_not_change_the_indexed_generation", () => {
  const values = Array.from({ length: 17 }, (_, index) => `genome-${index}`);
  const one = restoreIndexed(partitionIndexed(values, 1), values.length);
  const manyFinishedBackwards = partitionIndexed(values, 8).reverse().map((batch) => [...batch].reverse());
  assert.deepEqual(restoreIndexed(manyFinishedBackwards, values.length), one);
  assert.throws(() => restoreIndexed([[{ index: 0, value: "a" }, { index: 0, value: "b" }]], 2), /missing or duplicate/);
});

test("the_runtime_learning_shape_is_the_versioned_feature_table_plus_exact_option_outputs", () => {
  // 99 columns, and both halves of that number are checked below rather than
  // asserted here as a total somebody can quietly re-record: 66 v3 columns plus
  // the 33 v4 adds, minus the one v4 removed. The list itself is derived --
  // `STRIKER_KINDS`, `WEAPON_KINDS`, `MOVEMENT_NAMES` and `HAND_ACTION_NAMES` all
  // feed it -- so a kind added to `GRIPS` moves this number and is meant to.
  assert.equal(FEATURE_VERSION, 4); assert.equal(FEATURE_COLUMNS.length, 99);
  assert.equal(new Set(FEATURE_COLUMNS).size, 99, "no column name is written twice");
  // The one v3 column this session deleted, by name, because a deletion nobody
  // pins is a deletion that comes back.
  assert.equal(FEATURE_COLUMNS.includes("time_since_damage"), false,
    "the misnamed single damage clock is gone, replaced by dealt/received");
  // The nine-name striker one-hot is the whole of `GRIPS` rather than
  // `WEAPON_KINDS`, which is that list with the loosed kinds filtered out.
  assert.deepEqual(STRIKER_KINDS.filter((kind) => !WEAPON_KINDS.includes(kind)), ["arrow", "bite"]);
  assert.equal(STRIKER_KINDS.length, 9);
  for (const kind of STRIKER_KINDS) assert.ok(FEATURE_COLUMNS.includes(`threat_kind_${kind}`), kind);
  assert.deepEqual(META_OUTPUT_NAMES, [...MOVEMENT_NAMES, ...HAND_ACTION_NAMES, "persistence"]);
});

const checkpointFixture = () => {
  const genome = initialPopulation(1, FEATURE_COLUMNS.length, META_OUTPUT_NAMES.length, 44)[0];
  return { genome, data: { featureVersion: FEATURE_VERSION, featureNames: FEATURE_COLUMNS,
    optionNames: META_OUTPUT_NAMES.slice(0, -1), nodes: genome.nodes, edges: genome.edges,
    provenance: { seed: 44, configDigest: "0123456789abcdef" } } };
};

const learningView = (primary = "sword", secondary = "empty") => {
  const hand = (weapon, outboard, z) => ({ weapon, lost: false, reach: weapon === "bow" ? 0.8 : 1.4,
    tipSpeed: 0, tipVelocity: STILL(), outboard, shoulder: { x: outboard * 0.2, y: 1.4, z }, tip: { x: outboard * 0.2, y: 1.4, z: z + 1 } });
  const body = (a, b, z, facing) => ({ ...SHAPE, naturalAttacks: {}, ground: { x: 0, y: 0, z }, facing, shoulder: a.shoulder,
    tip: a.tip, tipSpeed: 0, hands: { primary: a, secondary: b }, crouch: 0, trunkLean: 0, trunkTwist: 0,
    vitality: 1, health: {} });
  const mine = body(hand(primary, 1, 0), hand(secondary, -1, 0), 0, 0);
  const theirs = body(hand("sword", 1, 1.4), hand("empty", -1, 1.4), 1.4, Math.PI);
  return assertCompleteView({ self: mine, opponent: theirs, projectiles: [], measure: 1.2, clock: 0 });
};

test("a_checkpoint_round_trips_and_replays_the_same_option_sequence", () => {
  const { data } = checkpointFixture(); const first = new Checkpoint(data); const replay = Checkpoint.fromBytes(first.toBytes());
  const samples = Array.from({ length: 12 }, (_, row) => FEATURE_COLUMNS.map((_, column) => Math.sin(row * 3 + column)));
  const sequence = (network) => samples.map((features) => {
    const output = network.run(features); return output.indexOf(Math.max(...output.slice(0, -1)));
  });
  assert.deepEqual(sequence(first.network()), sequence(replay.network()));
  assert.deepEqual(replay.provenance, data.provenance);
});

test("a_checkpoint_refuses_wrong_features_options_cycles_nans_and_trailing_bytes", () => {
  const { data, genome } = checkpointFixture();
  assert.throws(() => new Checkpoint({ ...data, featureNames: [...FEATURE_COLUMNS].reverse() }), /feature names/);
  assert.throws(() => new Checkpoint({ ...data, optionNames: [...data.optionNames].reverse() }), /option names/);
  assert.throws(() => new Checkpoint({ ...data, nodes: genome.nodes.map((node, i) => i ? node : { ...node, bias: Number.NaN }) }), /non-finite/);
  const hiddenA = { id: 1000, kind: "hidden", bias: 0, activation: "tanh" };
  const hiddenB = { id: 1001, kind: "hidden", bias: 0, activation: "tanh" };
  assert.throws(() => new Checkpoint({ ...data, nodes: [...genome.nodes, hiddenA, hiddenB], edges: [...genome.edges,
    { innovation: 99999, from: hiddenA.id, to: hiddenB.id, weight: 1, enabled: true },
    { innovation: 100000, from: hiddenB.id, to: hiddenA.id, weight: 1, enabled: true }] }), /cycle/);
  assert.throws(() => new Checkpoint({ ...data, edges: [...genome.edges, { ...genome.edges[0] }] }), /duplicate innovation/);
  assert.throws(() => new Checkpoint({ ...data, edges: [...genome.edges,
    { ...genome.edges[0], innovation: 99998 }] }), /duplicate connection/);
  const outputNode = genome.nodes.find((node) => node.kind === "output");
  assert.throws(() => new Checkpoint({ ...data, edges: [...genome.edges,
    { innovation: 99997, from: outputNode.id, to: 0, weight: 1, enabled: false }] }), /node roles/);
  const hiddenC = { id: 1002, kind: "hidden", bias: 0, activation: "tanh" };
  assert.throws(() => new Checkpoint({ ...data, nodes: [...genome.nodes, hiddenC], edges: [...genome.edges,
    { innovation: 99996, from: 0, to: hiddenC.id, weight: 1, enabled: true, recurrent: true }] }), /has no recurrence field/);
  const nested = { seed: 44, configDigest: "0123456789abcdef", selection: { split: "validation" } };
  const immutable = new Checkpoint({ ...data, provenance: nested }); const immutableBytes = immutable.toBytes();
  nested.selection.split = "test"; assert.deepEqual(immutable.toBytes(), immutableBytes);
  assert.equal(immutable.provenance.selection.split, "validation");
  const bytes = new Checkpoint(data).toBytes(); const trailing = new Uint8Array(bytes.length + 1); trailing.set(bytes);
  assert.throws(() => Checkpoint.fromBytes(trailing), /trailing/);
});

test("a_missing_or_corrupt_checkpoint_is_refused_by_name", () => {
  assert.throws(() => learnedMetaMind(null), /learned-v1 checkpoint is missing/);
  assert.throws(() => learnedMetaMind(new Uint8Array([1, 2, 3])), /learned-v1 checkpoint is corrupt or incompatible/);
});

test("diagnostics_report_the_decision_without_changing_it", () => {
  const { data } = checkpointFixture(); const checkpoint = new Checkpoint(data); let runs = 0;
  const network = checkpoint.network(); const original = network.run.bind(network);
  network.run = (features) => { runs += 1; return original(features); };
  const mind = networkMetaMind(network); const view = learningView();
  mind.decide(view, 1 / 240); const before = runs;
  const first = mind.diagnostic(); const second = mind.diagnostic();
  assert.equal(runs, before, "a diagnostic read must not decide again");
  assert.deepEqual(first, second); assert.equal(first.option, mind.selected); assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.topLogits), true); assert.ok(first.topLogits.length <= 3);
});

test("diagnostics_keep_the_active_persistence_duration_while_logits_are_re_evaluated", () => {
  const nodes = [...Array.from({ length: FEATURE_COLUMNS.length }, (_, id) => ({ id, kind: "input" })),
    ...Array.from({ length: META_OUTPUT_NAMES.length }, (_, index) => ({ id: FEATURE_COLUMNS.length + index, kind: "output" }))];
  let runs = 0; const network = { nodes, run() {
    const output = Array(META_OUTPUT_NAMES.length).fill(-1); output[1] = 1; output.at(-1); output[output.length - 1] = runs++ ? -1 : 1; return output;
  } };
  const mind = networkMetaMind(network); const view = learningView(); view.opponent.ground.z = 0.8; view.opponent.shoulder.z = 0.8; view.measure = 0.6;
  mind.decide(view, 1 / 240);
  const persistence = mind.diagnostic().persistenceSeconds;
  view.clock = 0.11; mind.decide(view, 1 / 240);
  assert.equal(mind.diagnostic().persistenceSeconds, persistence);
});

test("the_learned_policy_never_selects_an_option_the_loadout_cannot_perform", () => {
  const nodes = [...Array.from({ length: FEATURE_COLUMNS.length }, (_, id) => ({ id, kind: "input" })),
    ...Array.from({ length: META_OUTPUT_NAMES.length }, (_, index) => ({ id: FEATURE_COLUMNS.length + index, kind: "output" }))];
  const network = { nodes, run() { const output = Array(META_OUTPUT_NAMES.length).fill(-1);
    output[META_OUTPUT_NAMES.indexOf("shoot")] = 100; output[META_OUTPUT_NAMES.indexOf("cut")] = 2; return output; } };
  const mind = networkMetaMind(network); const view = learningView("sword", "empty");
  mind.decide(view, 1 / 240);
  assert.equal(mind.selected, "cut", "shoot is masked when neither hand carries a bow");
  assert.equal(mind.diagnostic().topLogits.some((row) => row.option === "shoot"), false,
    "the readout does not advertise an unavailable option");
});

test("the_factorized_policy_uses_a_published_natural_bite_without_fabricated_hands", () => {
  const nodes = [...Array.from({ length: FEATURE_COLUMNS.length }, (_, id) => ({ id, kind: "input" })),
    ...Array.from({ length: META_OUTPUT_NAMES.length }, (_, index) => ({ id: FEATURE_COLUMNS.length + index, kind: "output" }))];
  const network = { nodes, run() { const output = Array(META_OUTPUT_NAMES.length).fill(-1);
    output[META_OUTPUT_NAMES.indexOf("hold")] = 1; output[META_OUTPUT_NAMES.indexOf("bite")] = 2; return output; } };
  const v = learningView(); v.self.hands = {}; v.self.naturalAttacks = { bite: { reach: 0.7, ready: true, active: false } };
  v.self.collisionRadius = 0.2; v.opponent.collisionRadius = 0.3; v.measure = 0.8;
  const mind = networkMetaMind(network); const intent = mind.decide(v, 1 / 240);
  assert.equal(mind.selectedAction, "bite"); assert.equal(intent.primary.thrust, true); assert.equal(intent.forward, 0);
});

test("feature_v4_rejects_the_unpromoted_v2_checkpoint", () => {
  const { data } = checkpointFixture();
  assert.throws(() => new Checkpoint({ ...data, featureVersion: 2 }), /feature version 2 does not match runtime 4/);
  const legacy = new Checkpoint({ ...data, featureVersion: 2 },
    { featureVersion: 2, featureNames: data.featureNames, optionNames: data.optionNames });
  assert.throws(() => learnedMetaMind(legacy), /feature v2 checkpoint cannot run as feature v4/);
  // And the version one behind, which is the case the old literal got exactly
  // backwards: `learnedMetaMind` compared against a hardcoded `3` and refused
  // every freshly written v4 checkpoint with a message claiming v4 was stale.
  const previous = new Checkpoint({ ...data, featureVersion: FEATURE_VERSION - 1 },
    { featureVersion: FEATURE_VERSION - 1, featureNames: data.featureNames, optionNames: data.optionNames });
  assert.throws(() => learnedMetaMind(previous), /feature v3 checkpoint cannot run as feature v4/);
  // The current one runs, which is the direction a version literal fails in
  // silently: a gate that refuses everything looks exactly like a strict gate.
  assert.doesNotThrow(() => learnedMetaMind(new Checkpoint(data)));
});

test("promotion_selects_across_runs_without_looking_at_test_evidence", () => {
  // `FEATURE_VERSION`, not a literal. The gate reads the runtime's table now, so
  // a row pinned at 2 -- which is what this fixture said, and what the gate
  // itself said, for two whole versions -- is an experiment run against a
  // feature vector this build cannot execute.
  const run = (runId, seed, championDigest, validationScore, testScore) => ({ runId, seed, championDigest,
    validationScore, testScore, population: 128, generations: 80, mirroredBouts: 24, workers: 8,
    trainerProtocol: 3, configDigest: "0123456789abcdef", featureVersion: FEATURE_VERSION,
    optionNames: OPTION_NAMES });
  const selected = selectValidationChampion([
    run("a", 1, "a1", 1.5, 100),
    run("b", 2, "b1", 2.0, -100),
    run("c", 3, "c1", 1.7, 500),
  ]);
  assert.equal(selected.runId, "b");
  // Both directions of the version gate, because one that refuses everything and
  // one that refuses nothing pass the same single-sided assertion.
  assert.throws(() => selectValidationChampion([
    run("a", 1, "a1", 1.5, 100), { ...run("b", 2, "b1", 2, -100), featureVersion: FEATURE_VERSION - 1 },
    run("c", 3, "c1", 1.7, 500),
  ]), /experiment b does not match/);
  assert.throws(() => selectValidationChampion([
    run("a", 1, "a1", 1.5, 100), run("b", 1, "b1", 2, -100), run("c", 3, "c1", 1.7, 500),
  ]), /not independent/);
  assert.throws(() => selectValidationChampion([
    run("a", 1, "a1", 1.5, 100), { ...run("b", 2, "b1", 2, -100), generations: 79 }, run("c", 3, "c1", 1.7, 500),
  ]), /not a default/);
});

test("promotion_provenance_requires_every_generation_row_in_order", () => {
  const provenance = { seed: 77, configDigest: "0123456789abcdef" };
  const complete = {
    config: { version: 3, seed: 77, population: 128, generations: 80, mirroredBouts: 24 },
    configDigest: provenance.configDigest,
    championDigest: "champion",
    reports: Array.from({ length: 80 }, (_, generation) => ({ generation })),
  };
  assert.doesNotThrow(() => validateDefaultTrainingReport(complete, "champion", provenance));
  assert.throws(() => validateDefaultTrainingReport(
    { ...complete, reports: complete.reports.slice(0, -1) }, "champion", provenance,
  ), /exactly 80 rows/);
  const misindexed = structuredClone(complete); misindexed.reports[43].generation = 44;
  assert.throws(() => validateDefaultTrainingReport(misindexed, "champion", provenance), /row 43 must have index 43/);
});

test("every_promotion_threshold_is_a_hard_gate", () => {
  const counts = { close: 10, disengage: 10, cover: 10, cut: 10, thrust: 0, punch: 0, shoot: 0, recover: 0 };
  const good = { splitOverlap: false, heldOutWinScore: 0.7, scriptedWinScore: 0.6, randomWinScore: 0.4,
    loadouts: [{ name: "sword", learnedWinRate: 0.55, specialistWinRate: 0.70 }], decisionCounts: counts,
    motifs: [{ name: "cover -> cut", learned: 3, scripted: 2 }, { name: "disengage -> cover", learned: 2, scripted: 1 }],
    safety: { finiteIntents: true, supportedOptions: true, noStuckOption: true, noPostVerdictAction: true } };
  assert.equal(assessPromotion(good).promoted, true);
  assert.equal(assessPromotion({ ...good, heldOutWinScore: 0.6 }).promoted, false, "scripted must be beaten, not tied");
  assert.equal(assessPromotion({ ...good, loadouts: [{ name: "sword", learnedWinRate: 0.549, specialistWinRate: 0.70 }] }).promoted, false);
  assert.equal(assessPromotion({ ...good, decisionCounts: { ...counts, disengage: 0 } }).promoted, true,
    "close, cover and cut still clear the diversity gate");
  assert.equal(assessPromotion({ ...good, decisionCounts: { ...counts, disengage: 0, cut: 0 } }).promoted, false);
  assert.equal(assessPromotion({ ...good, motifs: good.motifs.slice(0, 1) }).promoted, false);
  assert.equal(assessPromotion({ ...good, splitOverlap: true }).promoted, false);
  assert.equal(assessPromotion({ ...good, randomWinScore: 0.7 }).promoted, false);
  assert.equal(assessPromotion({ ...good, safety: { ...good.safety, finiteIntents: false } }).promoted, false);
  assert.equal(assessPromotion({ ...good, safety: { ...good.safety, supportedOptions: false } }).promoted, false);
  assert.equal(assessPromotion({ ...good, safety: { ...good.safety, noStuckOption: false } }).promoted, false);
  assert.equal(assessPromotion({ ...good, safety: { ...good.safety, noPostVerdictAction: false } }).promoted, false);
});

test("the_compact_unpromoted_evidence_recomputes_the_recorded_failure", () => {
  const report = JSON.parse(readFileSync(new URL("../asset-src/learning/unpromoted-v1.json", import.meta.url), "utf8"));
  const rows = (featureVersion) => report.experiments.map((row) => ({ ...row,
    validationScore: row.bestValidation, championDigest: row.championSha256,
    population: report.configuration.population, generations: report.configuration.generations,
    mirroredBouts: report.configuration.mirroredBouts, workers: report.configuration.workers,
    trainerProtocol: report.configuration.trainerProtocol, featureVersion,
    optionNames: report.configuration.optionNames }));
  /**
   * This evidence was recorded against feature v2 and says so, and the gate now
   * reads the runtime's table -- so replaying it as it stands is refused, and
   * that refusal is correct rather than an obstacle. A v2 champion is a network
   * whose 66 inputs mean different things to a 99-column v4 build; promoting one
   * would install a checkpoint `learnedMetaMind` then refuses anyway, one seam
   * further down and after the selection has already been believed.
   *
   * The literal that was here before was `2`, which is to say it was pinned at
   * exactly this file's version -- so the gate would have gone on passing this
   * and refusing every experiment anybody actually ran, in either direction,
   * without ever looking wrong.
   */
  assert.throws(() => selectValidationChampion(rows(report.configuration.featureVersion)),
    /does not match the protocol-v3 feature and option contract/);
  assert.equal(report.configuration.featureVersion, 2, "the recorded evidence is v2 and stays v2");
  // The ordering itself is still the property under test, so it is asked at the
  // version this build can execute. What is being checked here is that the
  // selection rule reproduces the recorded champion, not that a two-version-old
  // artifact is installable.
  const selected = selectValidationChampion(rows(FEATURE_VERSION));
  assert.equal(selected.runId, report.selection.selectedRunId);
  const stored = report.promotionEvaluation;
  const decision = assessPromotion({
    splitOverlap: seedRangesOverlap(report.configuration.seedRanges),
    heldOutWinScore: stored.winScores.learned,
    scriptedWinScore: stored.winScores.scripted,
    randomWinScore: stored.winScores.random,
    loadouts: stored.loadouts.map((row) => ({ name: row.name, learnedWinRate: row.learned,
      specialistWinRate: row.scriptedSpecialist })),
    decisionCounts: stored.decisionCounts,
    motifs: stored.motifsPer100Decisions,
    safety: stored.safety,
  });
  assert.equal(report.status, "unpromoted");
  assert.equal(decision.promoted, false);
  assert.deepEqual(decision.failures, stored.failures);
});

test("promotion_evaluation_covers_every_loadout_on_both_mirrored_sides", async () => {
  const { data } = checkpointFixture(); const bytes = new Checkpoint(data).toBytes(); const seen = []; const seenSeeds = [];
  await assert.rejects(runPromotionEvaluation({ checkpointBytes: bytes, baseSeed: 55, bouts: 2,
    freshHavok: async () => ({}), runBout: () => ({}) }), /training-report is required/);
  const hand = (weapon, outboard, z) => ({ weapon, lost: false, reach: 1.4, tipSpeed: 0, tipVelocity: STILL(), outboard,
    shoulder: { x: outboard * 0.2, y: 1.4, z }, tip: { x: outboard * 0.2, y: 1.4, z: z + (z ? -1 : 1) } });
  // The opponent is filled in by `runBout` below once both halves exist, so the
  // whole view cannot be checked here; the half that is finished is. `body` is
  // what a real `describe` writes and `assertCompleteBody` is the same list.
  const view = (loadout, z, facing) => { const primary = hand(loadout.primary, 1, z); const secondary = hand(loadout.secondary, -1, z);
    const body = { ...SHAPE, naturalAttacks: {}, ground: { x: 0, y: 0, z }, facing, shoulder: primary.shoulder, tip: primary.tip, tipSpeed: 0,
      hands: { primary, secondary }, crouch: 0, trunkLean: 0, trunkTwist: 0, vitality: 1, health: {} };
    assertCompleteBody(body, `${loadout.primary}+${loadout.secondary}`);
    return { self: body, opponent: null, projectiles: [], measure: 1.2, clock: 0 }; };
  const runBout = (opts) => { const actorSide = opts.left === "swinger" ? "right" : "left";
    const loadout = actorSide === "left" ? opts.leftLoadout : opts.rightLoadout; seen.push(`${loadout.primary}+${loadout.secondary}/${actorSide}`);
    seenSeeds.push(opts.seeds[0]);
    const actor = view(loadout, 0, 0); const enemy = view({ primary: "sword", secondary: "empty" }, 1.4, Math.PI);
    actor.opponent = enemy.self; enemy.opponent = actor.self;
    for (let frame = 0; frame < 30; frame += 1) { actor.clock = frame / 60; enemy.clock = frame / 60;
      (actorSide === "left" ? opts.leftMind : opts.rightMind).decide(actor, 1 / 60);
      opts.onSample?.({ left: { view: actorSide === "left" ? actor : enemy }, right: { view: actorSide === "right" ? actor : enemy } }); }
    return { ending: "exhaustion", winner: actorSide, seconds: 0.5 }; };
  const original = console.log; console.log = () => {};
  let report; try { report = await runPromotionEvaluation({ checkpointBytes: bytes, baseSeed: 55, bouts: 2,
    trainingReport: { config: { version: 3, seed: 44, population: 128, generations: 80, mirroredBouts: 24 },
      configDigest: "0123456789abcdef", championDigest: createHash("sha256").update(bytes).digest("hex"),
      reports: Array.from({ length: 80 }, (_, generation) => ({ generation })) },
    freshHavok: async () => ({}), runBout }); } finally { console.log = original; }
  assert.deepEqual(report.loadouts.map((row) => row.name), ["sword", "shield", "axe", "bow", "bare-hands"]);
  for (const loadout of ["sword+empty", "sword+shield", "axe+empty", "bow+empty", "empty+empty"]) {
    assert.ok(seen.includes(`${loadout}/left`)); assert.ok(seen.includes(`${loadout}/right`));
  }
  assert.equal(seenSeeds.includes(evaluationMirrorSeeds(55, "test", 0)[0]), false,
    "the trainer's already reported test cell is excluded");
  assert.equal(new Set(seenSeeds).size, 5, "each loadout owns one seed shared by controllers and mirrors");
});
