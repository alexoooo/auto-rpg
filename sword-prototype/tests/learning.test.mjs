import assert from "node:assert/strict";
import { test } from "node:test";

import { freshIntent } from "../src/action-primitives.ts";
import { FEATURE_COLUMNS, FEATURE_VERSION } from "../src/learning/features.ts";
import { SEED_RANGES, forcedOptionEvaluationMind, mirroredEvaluationJobs, validateSeedRanges } from "../src/learning/evaluation.ts";
import { InnovationTracker, addEdgeMutation, addNodeMutation, breedGeneration, crossover, hasCycle, initialPopulation, innovationTrackerFor, speciate, speciesSelectionWeights } from "../src/learning/genome.ts";
import { MAX_PERSISTENCE, META_OUTPUT_LAYOUT, META_OUTPUT_NAMES, MIN_PERSISTENCE, decodeMetaPersistence,
  deployableActions, fitnessComponents, noveltyDescriptor, randomMetaMind, readMetaOutput, supportedOptions } from "../src/learning/meta.ts";
import { RESEARCH_ARTIFACT_CONTRACT, decodeResearchArtifact, deployedResearchMind, supportedActionIndices } from "../src/learning/deployment.ts";
import { ResearchArtifact, canonicalJson } from "../src/learning/artifact.ts";
import { neatLabeler } from "../scripts/research-rollout-worker.mjs";
import { maskedArgmax } from "../src/learning/recurrent-network.ts";
import { researchLabelMind } from "../src/learning/research-policy.ts";
import { HAND_ACTION_NAMES, MOVEMENT_NAMES, behaviourRecord, scriptedMetaMind } from "../src/options.ts";
import { STRIKER_KINDS, WEAPON_KINDS } from "../src/hands.ts";
import { partitionIndexed, restoreIndexed } from "../src/learning/jobs.ts";
import { Network } from "../src/learning/network.ts";
import { SeededRng } from "../src/learning/rng.ts";
import { assertCompleteView } from "./fixtures/view.mjs";

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
  // Two arms, neither of them a bow: the refusal names the missing weapon *and*
  // the hand it was looked for in, which action v1's `requires a bow` could not
  // -- there was no exact effector for it to name.
  assert.throws(() => forcedOptionEvaluationMind("shoot").decide(view, 1 / 60),
    /option "shoot" requires a bow in the primary hand/);
  view.self.hands.primary.lost = true; view.self.hands.secondary.lost = true; view.clock = 2;
  for (let frame = 0; frame < 4; frame += 1) assert.doesNotThrow(() => cut.decide(view, 1 / 60));
  assert.equal(cut.selected, "recover");
  // And with no arm left the refusal changes to the nearer cause. It used to say
  // `requires a bow` here too, which is true and useless: handing a bow to a
  // severed arm fixes nothing, and the probe's caller needs to know which of the
  // two things is missing.
  const unsupported = forcedOptionEvaluationMind("shoot");
  assert.throws(() => unsupported.decide(view, 1 / 60), /option "shoot" requires an attached primary hand/);
});

test("a_learned_policy_can_repeat_one_completed_option_and_goes_inert_after_last_hand_loss", () => {
  const hand = (weapon, outboard) => ({ weapon, lost: false, reach: 1.4, tipSpeed: 0, tipVelocity: STILL(), outboard,
    shoulder: { x: outboard * 0.2, y: 1.4, z: 0 }, tip: { x: outboard * 0.2, y: 1.4, z: 1 } });
  const body = () => { const primary = hand("sword", 1); return { ...SHAPE, naturalAttacks: {}, ground: { x: 0, y: 0, z: 0 }, facing: 0,
    shoulder: primary.shoulder, tip: primary.tip, tipSpeed: 0, hands: { primary, secondary: hand("empty", -1) },
    crouch: 0, trunkLean: 0, trunkTwist: 0, vitality: 1, health: {} }; };
  const view = assertCompleteView({ self: body(), opponent: body(), projectiles: [], measure: 1.2, clock: 0 });
  view.opponent.ground.z = 1.4;
  let labelled = 0;
  const mind = researchLabelMind("neat-qd", () => { labelled += 1; return { movement: "hold", action: "cut", persistence: 0.10 }; });
  let fallingEdges = 0; let guarded = true;
  // The tactic pair is sampled every frame, not read once at the end. The line
  // this replaced asserted `selectedAction === "cut"` against a stub that
  // returns nothing else, so `labelled >= 2` above already entailed it -- and
  // its message named switching, which a final value cannot see: a policy that
  // left `cut` and came back would end on the same string. Counting changes
  // across the whole run is what `switches === 0` meant on the deleted
  // meta-controller, and `researchLabelMind` has no `switches` to read.
  let pairChanges = 0; let pair = null;
  for (let frame = 0; frame < 200; frame += 1) { view.clock = frame / 60; const intent = mind.decide(view, 1 / 60);
    if (guarded && !intent.primary.guard) fallingEdges += 1; guarded = intent.primary.guard;
    const next = `${mind.selectedMovement}+${mind.selectedAction}`;
    if (pair !== null && next !== pair) pairChanges += 1; pair = next; }
  assert.ok(fallingEdges >= 2, `expected repeated cut commits, got ${fallingEdges}`);
  assert.ok(labelled >= 2, `expected the finished stroke to be re-entered, got ${labelled} decisions`);
  assert.equal(pairChanges, 0, `re-entering one completed option is not a switch, saw ${pairChanges} tactic changes`);
  view.self.hands.primary.lost = true; view.self.hands.secondary.lost = true;
  const inert = mind.decide(view, 1 / 60);
  // Inert is the whole command or it is not inert. Two leaves of nineteen were
  // asserted here, so a handless branch that turned, crouched and thrust with
  // the off hand passed the test named for going inert. `freshIntent()` is what
  // that branch returns, so comparing against it covers every leaf at once and
  // grows with the command.
  assert.deepEqual(inert, freshIntent());
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

test("one_output_table_names_every_offset_a_decoder_reads", () => {
  // The offsets as literals, on purpose. Deriving them here from
  // `MOVEMENT_NAMES.length` would make this test agree with any table the code
  // happens to build, which is the sixth re-derivation rather than a pin on the
  // other five.
  assert.deepEqual({ ...META_OUTPUT_LAYOUT }, { movementAt: 0, actionAt: 5, persistenceAt: 12, width: 13 });
  assert.equal(META_OUTPUT_NAMES.length, META_OUTPUT_LAYOUT.width);
  // Thirteen distinguishable values, and the whole decoded record compared
  // against a fresh one. Both halves matter: a slice that ran one short would
  // still pass a movement-only check, and the persistence read is the one that
  // used to be spelled `.at(-1)`.
  const values = [0.01, 0.02, 0.03, 0.04, 0.05, 0.11, 0.12, 0.13, 0.14, 0.15, 0.16, 0.17, 0];
  assert.deepEqual({ ...readMetaOutput(values) }, {
    movementLogits: [0.01, 0.02, 0.03, 0.04, 0.05],
    actionLogits: [0.11, 0.12, 0.13, 0.14, 0.15, 0.16, 0.17],
    persistence: decodeMetaPersistence(0),
  });
  assert.throws(() => readMetaOutput(values.slice(0, 12)), /vector is 12 wide; the contract is 13/);
  assert.throws(() => readMetaOutput([...values, 0]), /vector is 14 wide; the contract is 13/);
  // The rescale, as the literals it actually produces. It reaches
  // `MIN_PERSISTENCE` exactly and stops one ulp short of `MAX_PERSISTENCE`; that
  // is the window every rollout in the tree was taken under, and writing the
  // decode as `(MAX - MIN) / 2` would move all three of these numbers.
  assert.equal(decodeMetaPersistence(-1), MIN_PERSISTENCE);
  assert.equal(decodeMetaPersistence(0), 0.44999999999999996);
  assert.equal(decodeMetaPersistence(1), 0.7999999999999999);
  assert.ok(decodeMetaPersistence(1) < MAX_PERSISTENCE);
  assert.equal(decodeMetaPersistence(-40), decodeMetaPersistence(-1));
  assert.equal(decodeMetaPersistence(40), decodeMetaPersistence(1));
});

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

/** A jawed body with no hand slots at all, which is what a centipede publishes. */
const jawedView = () => {
  const view = learningView();
  return assertCompleteView({ ...view, self: { ...view.self, unit: "centipede", hands: {},
    naturalAttacks: { bite: { reach: 1.1, ready: true, active: false } } } });
};

/**
 * A genome whose thirteen outputs are exactly the numbers asked for.
 *
 * Every node is `identity` with no incoming edge, so `RecurrentNeatNetwork.run`
 * answers each output node's bias. A bred genome would work too and would prove
 * less: the point below is which *index* each decoder reads, and that is only
 * visible when the thirteen values are told apart.
 */
const constantGenome = (values) => ({ id: 0, fitness: 0, adjustedFitness: 0, novelty: 0, edges: [],
  nodes: [
    ...Array.from({ length: FEATURE_COLUMNS.length }, (_, id) => ({ id, kind: "input", bias: 0, activation: "identity" })),
    { id: FEATURE_COLUMNS.length, kind: "bias", bias: 0, activation: "identity" },
    ...values.map((bias, index) => ({ id: FEATURE_COLUMNS.length + 1 + index, kind: "output", bias, activation: "identity" })),
  ] });

test("the_training_decoder_and_the_deployment_decoder_answer_the_same_label", () => {
  // `punch` is the highest action logit of the seven, deliberately: it is the
  // one name the two decoders disagreed about. The rollout worker kept its own
  // legality table, and that table did not know a bow welds the off hand to the
  // stave -- so on `bow+empty` it offered `punch`, won with it, and handed
  // `researchLabelMind` an action the deployment mask refuses, which kills the
  // run with `research policy produced unsupported action "punch"`. Both sides
  // now ask `deployableActions`.
  const movementLogits = [0.1, 0.5, 0.2, 0.3, 0.4];
  const actionLogits = [0.1, 0.2, 0.3, 0.9, 0.4, 0.5, 0.05];
  assert.deepEqual(HAND_ACTION_NAMES, ["cover", "cut", "thrust", "punch", "shoot", "bite", "recover"]);
  const genome = constantGenome([...movementLogits, ...actionLogits, 0.5]);
  const bytes = new ResearchArtifact({ algorithm: "neat-qd", ...RESEARCH_ARTIFACT_CONTRACT,
    payload: [...new TextEncoder().encode(canonicalJson(genome))],
    provenance: { seed: 7, solverSteps: 4, trainingSplit: "train", validationSplit: "validation", configDigest: "synthetic" },
  }, RESEARCH_ARTIFACT_CONTRACT).toBytes();

  const views = { "sword+empty": learningView("sword", "empty"), "sword+shield": learningView("sword", "shield"),
    "sword+buckler": learningView("sword", "buckler"), "axe+empty": learningView("axe", "empty"),
    "bow+empty": learningView("bow", "empty"), "empty+empty": learningView("empty", "empty"),
    "natural:bite": jawedView() };
  const deployed = {}; const rollout = {};
  for (const [loadout, view] of Object.entries(views)) {
    const mind = deployedResearchMind(decodeResearchArtifact(bytes), `warrior/${loadout}`,
      // The rollout labeler is run on the *same* features the deployment seam
      // just wrote, so the two answers differ only where the decoders differ.
      (_view, features, label) => { deployed[loadout] = { ...label }; rollout[loadout] = { ...neatLabeler(genome)(view, features) }; });
    mind.decide(view, 1 / 240);
  }
  // Both tables whole, against a third written out by hand -- so the two
  // agreeing on a wrong answer is still a failure. `persistence` is the trailing
  // scalar decoded, which is the read that used to be spelled `.at(-1)`; the
  // last digit of it is the 0.35 literal `decodeMetaPersistence` argues for,
  // written out rather than rounded away.
  const expected = Object.fromEntries(Object.entries({ "sword+empty": "punch", "sword+shield": "thrust",
    "sword+buckler": "thrust", "axe+empty": "punch", "bow+empty": "shoot", "empty+empty": "punch",
    "natural:bite": "bite" }).map(([loadout, action]) => [loadout, { movement: "hold", action, persistence: 0.6249999999999999 }]));
  assert.deepEqual(deployed, expected);
  assert.deepEqual(rollout, expected);
  // And the answers are legal on the body that produced them, asked of the mask
  // itself rather than of either decoder.
  for (const [loadout, view] of Object.entries(views)) assert.ok(deployableActions(view).has(expected[loadout].action), loadout);
});

test("diagnostics_report_the_decision_without_changing_it", () => {
  let labelled = 0;
  const mind = researchLabelMind("neat-qd", () => { labelled += 1; return { movement: "close", action: "cut", persistence: 0.4 }; });
  const view = learningView();
  mind.decide(view, 1 / 240); const before = labelled;
  const first = mind.diagnostic(); const second = mind.diagnostic();
  assert.equal(labelled, before, "a diagnostic read must not decide again");
  assert.deepEqual(first, second);
  assert.equal(first.movement, mind.selectedMovement); assert.equal(first.action, mind.selectedAction);
  assert.equal(Object.isFrozen(first), true); assert.equal(Object.isFrozen(first.topLogits), true);
  // A labeler answers a decision, not a scored table, so the readout carries no
  // logits at all rather than an invented ranking. The deleted network
  // controller published its top three; whatever replaces it in the 26-output
  // contract will have to say what it is publishing here.
  assert.deepEqual(first.topLogits, []);
});

test("a_diagnostic_reports_the_active_persistence_window_rather_than_a_fresh_one", () => {
  const view = learningView(); view.opponent.ground.z = 0.8; view.opponent.shoulder.z = 0.8; view.measure = 0.6;
  let labelled = 0;
  const mind = researchLabelMind("dagger", () => { labelled += 1;
    return { movement: "hold", action: "cover", persistence: labelled === 1 ? 0.80 : 0.10 }; });
  mind.decide(view, 1 / 240);
  assert.equal(labelled, 1); assert.equal(mind.diagnostic().persistenceSeconds, 0.80);
  view.clock = 0.05; mind.decide(view, 1 / 240);
  assert.equal(labelled, 1, "a decision inside its own window is not re-taken");
  assert.equal(mind.diagnostic().persistenceSeconds, 0.80, "the readout is the live window, not the next one");
  assert.ok(Math.abs(mind.diagnostic().persistenceRemaining - 0.75) < 1e-9, mind.diagnostic().persistenceRemaining);
  // And the other direction, because a readout frozen at its first value passes
  // the assertion above exactly as well as one that tracks the live window.
  view.clock = 0.85; mind.decide(view, 1 / 240);
  assert.equal(labelled, 2); assert.equal(mind.diagnostic().persistenceSeconds, 0.10);
});

test("a_learned_action_the_loadout_cannot_perform_is_masked_and_then_refused_by_name", () => {
  const view = learningView("sword", "empty");
  const allowed = supportedOptions(view);
  assert.equal(allowed.has("shoot"), false, "neither hand carries a bow"); assert.equal(allowed.has("cut"), true);
  // The mask is the one `deployment.ts` hands `maskedArgmax`, read from the
  // module rather than rebuilt here: a controller whose largest action logit is
  // `shoot` deploys `cut` instead of shooting a bow it does not hold.
  const logits = HAND_ACTION_NAMES.map((name) => name === "shoot" ? 100 : name === "cut" ? 2 : -1);
  assert.equal(HAND_ACTION_NAMES[maskedArgmax(logits, supportedActionIndices(view), "action")], "cut");
  // Below the mask the seam refuses rather than substituting. That direction is
  // the one worth pinning: a masked choice is still a decision, while an
  // unmasked one arriving at execution would be an option the body cannot do.
  const mind = researchLabelMind("neat-qd", () => ({ movement: "hold", action: "shoot", persistence: 0.10 }));
  assert.throws(() => mind.decide(view, 1 / 240), /research policy produced unsupported action "shoot"/);
});

test("the_factorized_policy_uses_a_published_natural_bite_without_fabricated_hands", () => {
  const v = learningView(); v.self.hands = {}; v.self.naturalAttacks = { bite: { reach: 0.7, ready: true, active: false } };
  v.self.collisionRadius = 0.2; v.opponent.collisionRadius = 0.3; v.measure = 0.8;
  const mind = researchLabelMind("neat-qd", () => ({ movement: "hold", action: "bite", persistence: 0.10 }));
  const intent = mind.decide(v, 1 / 240);
  // The natural channel, and the primary hand left alone. This asserted
  // `intent.primary.thrust` -- the alias itself, on a body whose `hands` is an
  // empty object, so the test named "without fabricated hands" was reading a
  // fabricated hand.
  assert.equal(mind.selectedAction, "bite");
  assert.equal(intent.natural.thrust, true); assert.equal(intent.primary.thrust, false);
  assert.equal(intent.actingHand, null, "jaws are not a hand");
  assert.equal(intent.forward, 0);
});
