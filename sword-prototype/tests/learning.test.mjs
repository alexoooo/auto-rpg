import assert from "node:assert/strict";
import { test } from "node:test";

import { freshIntent } from "../src/action-primitives.ts";
import { FEATURE_COLUMNS, FEATURE_VERSION } from "../src/learning/features.ts";
import { SEED_RANGES, forcedOptionEvaluationMind, mirroredEvaluationJobs, validateSeedRanges } from "../src/learning/evaluation.ts";
import { InnovationTracker, addEdgeMutation, addNodeMutation, breedGeneration, crossover, hasCycle, initialPopulation, innovationTrackerFor, speciate, speciesSelectionWeights } from "../src/learning/genome.ts";
import { MAX_PERSISTENCE, META_OUTPUT_LAYOUT, META_OUTPUT_NAMES, MIN_PERSISTENCE, decodeMetaPersistence,
  deployableActions, deployableTactics, fitnessComponents, noveltyDescriptor, randomMetaMind, readMetaOutput,
  selectDeployableTactic, supportedOptions } from "../src/learning/meta.ts";
import { RESEARCH_ARTIFACT_CONTRACT, decodeResearchArtifact, deployedResearchMind, supportedActionIndices } from "../src/learning/deployment.ts";
import { ResearchArtifact, canonicalJson } from "../src/learning/artifact.ts";
import { neatLabeler } from "../scripts/research-rollout-worker.mjs";
import { maskedArgmax } from "../src/learning/recurrent-network.ts";
import { RecurrentNeatNetwork } from "../src/learning/recurrent-neat.ts";
import { researchLabelMind } from "../src/learning/research-policy.ts";
import { EFFECTOR_NAMES, HAND_ACTION_NAMES, MOVEMENT_NAMES, STANCE_NAMES, TARGET_NAMES, behaviourRecord,
  scriptedMetaMind, tacticEffectors } from "../src/options.ts";
import { STRIKER_KINDS, WEAPON_KINDS } from "../src/hands.ts";
import { trainDaggerModel } from "../src/learning/dagger.ts";
import { GRU_UNITS } from "../src/learning/recurrent-network.ts";
import { TACTICAL_TEACHER_VERSION, tacticalTeacher } from "../src/learning/tactical-teacher.ts";
import { fitTacticalModel } from "../src/learning/tactical-model.ts";
import { plannedTacticKey } from "../src/learning/lookahead.ts";
import { partitionIndexed, restoreIndexed } from "../src/learning/jobs.ts";
import { Network } from "../src/learning/network.ts";
import { SeededRng } from "../src/learning/rng.ts";
import { probeLabel, RESEARCH_LABEL_FIELDS } from "./fixtures/label.mjs";
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
  const mind = researchLabelMind("neat-qd", (view) => { labelled += 1; return probeLabel(view, "hold", "cut", 0.10); });
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
  assert.deepEqual(META_OUTPUT_NAMES,
    [...MOVEMENT_NAMES, ...HAND_ACTION_NAMES, ...EFFECTOR_NAMES, ...TARGET_NAMES, ...STANCE_NAMES, "persistence"]);
});

test("one_output_table_names_every_offset_a_decoder_reads", () => {
  // The offsets as literals, on purpose. Deriving them here from
  // `MOVEMENT_NAMES.length` would make this test agree with any table the code
  // happens to build, which is the sixth re-derivation rather than a pin on the
  // other five. Six numbers now rather than four: stage C2a widened the contract
  // from 13 to 26 by putting three logit blocks in front of the trailing scalar.
  assert.deepEqual({ ...META_OUTPUT_LAYOUT },
    { movementAt: 0, actionAt: 5, effectorAt: 12, targetAt: 15, stanceAt: 19, persistenceAt: 25, width: 26 });
  assert.equal(META_OUTPUT_NAMES.length, META_OUTPUT_LAYOUT.width);
  // Twenty-six distinguishable values, and the whole decoded record compared
  // against a fresh one. Both halves matter: a slice that ran one short would
  // still pass a movement-only check, and the persistence read is the one that
  // used to be spelled `.at(-1)` -- the read the three new blocks would have
  // been swallowed by.
  const values = [0.01, 0.02, 0.03, 0.04, 0.05, 0.11, 0.12, 0.13, 0.14, 0.15, 0.16, 0.17,
    0.21, 0.22, 0.23, 0.31, 0.32, 0.33, 0.34, 0.41, 0.42, 0.43, 0.44, 0.45, 0.46, 0];
  assert.deepEqual({ ...readMetaOutput(values) }, {
    movementLogits: [0.01, 0.02, 0.03, 0.04, 0.05],
    actionLogits: [0.11, 0.12, 0.13, 0.14, 0.15, 0.16, 0.17],
    effectorLogits: [0.21, 0.22, 0.23],
    targetLogits: [0.31, 0.32, 0.33, 0.34],
    stanceLogits: [0.41, 0.42, 0.43, 0.44, 0.45, 0.46],
    persistence: decodeMetaPersistence(0),
  });
  // Thirteen wide is the *old* contract rather than an arbitrary short vector,
  // which is what a genome bred before this stage actually is.
  assert.throws(() => readMetaOutput(values.slice(0, 13)), /vector is 13 wide; the contract is 26/);
  assert.throws(() => readMetaOutput(values.slice(0, 25)), /vector is 25 wide; the contract is 26/);
  assert.throws(() => readMetaOutput([...values, 0]), /vector is 27 wide; the contract is 26/);
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

test("the_twenty_six_output_names_are_distinct_columns", () => {
  // `readMetaOutput`'s finiteness refusal indexes straight into `META_OUTPUT_NAMES`
  // by column, so the table has to be exactly as long as the contract and has to
  // name each column once. Two columns sharing a name would produce a refusal
  // pointing at the wrong head, which is worse than one pointing at a number --
  // and at 26 names drawn from five separately-frozen vocabularies, a collision
  // is a thing somebody can introduce without noticing.
  assert.equal(META_OUTPUT_NAMES.length, 26);
  assert.equal(new Set(META_OUTPUT_NAMES).size, 26, "no output column is named twice");
  // **All twenty-six, as literals, and every one of them poisoned.** This
  // probed six indices -- 0, 7, 13, 17, 20, 25 -- and the name says twenty-six:
  // swapping `slip-left` and `slip-right` at 23/24 left it green, and so would
  // any reordering inside a block whose two ends happened to be sampled.
  // Literals rather than a concatenation of the five vocabularies, for the same
  // reason `one_output_table_names_every_offset_a_decoder_reads` writes its
  // offsets out: a table derived from the same source as the code agrees with
  // whatever that source says, including a swap inside `STANCE_NAMES`.
  const names = ["close", "hold", "circle-left", "circle-right", "disengage",
    "cover", "cut", "thrust", "punch", "shoot", "bite", "recover",
    "primary", "secondary", "natural",
    "vital", "high", "low", "threat",
    "action-default", "upright", "compact", "extended", "slip-left", "slip-right",
    "persistence"];
  assert.deepEqual([...META_OUTPUT_NAMES], names);
  const finite = Array.from({ length: 26 }, (_, index) => index / 100);
  const poisoned = (index, value) => finite.map((entry, at) => at === index ? value : entry);
  names.forEach((name, index) => {
    assert.throws(() => readMetaOutput(poisoned(index, NaN)),
      new RegExp(`learned output "${name}" is NaN`), `column ${index}`);
  });
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
 * One 26-wide output vector, written as its five named blocks.
 *
 * A bare array of twenty-six numbers is a thing nobody can check by eye, and
 * three of the tests below care about exactly one block. Every block defaults to
 * zeros, so a test states only the block it is about and the rest is visibly
 * neutral rather than accidentally decisive.
 */
const outputVector = ({ movement = [0, 0, 0, 0, 0], action = [0, 0, 0, 0, 0, 0, 0], effector = [0, 0, 0],
  target = [0, 0, 0, 0], stance = [0, 0, 0, 0, 0, 0], persistence = 0 } = {}) => {
  const values = [...movement, ...action, ...effector, ...target, ...stance, persistence];
  assert.equal(values.length, META_OUTPUT_LAYOUT.width, "the fixture writes the whole contract");
  return values;
};

/**
 * A genome whose twenty-six outputs are exactly the numbers asked for.
 *
 * Every node is `identity` with no incoming edge, so `RecurrentNeatNetwork.run`
 * answers each output node's bias. A bred genome would work too and would prove
 * less: the point below is which *index* each decoder reads, and that is only
 * visible when the twenty-six values are told apart.
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
  //
  // **The three blocks stage C2a added carry real numbers, and that is the whole
  // of this test's ability to see a one-sided move.** They were written as zeros,
  // which makes the joint sum degenerate to the action logit and the two decoders
  // agree *by construction*: wiring `selectDeployableTactic` into `deployment.ts`
  // alone -- exactly the split `selectDeployableTactic`'s own note says is
  // refused -- left the whole suite green. The effector and target blocks below
  // are the tuple test's, chosen so the joint rule and the bare action argmax
  // disagree; the divergence is asserted outright a few lines down so the
  // fixture's discriminating power is checked rather than hoped for.
  const movementLogits = [0.1, 0.5, 0.2, 0.3, 0.4];
  const actionLogits = [0.1, 0.2, 0.3, 0.9, 0.4, 0.5, 0.05];
  const effectorLogits = [1.00, 0.10, 0];
  const targetLogits = [0.20, 0.30, 1.00, 0];
  // Non-zero, and `compact` on top, so a decoder that dropped the stance head or
  // took its argmax over the wrong slice answers `action-default` and fails --
  // the same trap the effector and target blocks were written as zeros into.
  const stanceLogits = [0.1, 0.2, 0.9, 0.3, 0.4, 0.5];
  assert.deepEqual(HAND_ACTION_NAMES, ["cover", "cut", "thrust", "punch", "shoot", "bite", "recover"]);
  assert.deepEqual(STANCE_NAMES[2], "compact");
  const outputs = outputVector({ movement: movementLogits, action: actionLogits,
    effector: effectorLogits, target: targetLogits, stance: stanceLogits, persistence: 0.5 });
  const genome = constantGenome(outputs);
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
  // agreeing on a wrong answer is still a failure. All six fields of every
  // label, because a parity check on three of them is a parity check that a
  // one-sided move in the other three survives. `persistence` is the trailing
  // scalar decoded, which is the read that used to be spelled `.at(-1)`; the
  // last digit of it is the 0.35 literal `decodeMetaPersistence` argues for,
  // written out rather than rounded away.
  const expected = Object.fromEntries(Object.entries({
    "sword+empty": ["thrust", "primary", "low"], "sword+shield": ["thrust", "primary", "low"],
    "sword+buckler": ["thrust", "primary", "low"], "axe+empty": ["cut", "primary", "low"],
    "bow+empty": ["shoot", "primary", "low"], "empty+empty": ["punch", "primary", "high"],
    "natural:bite": ["bite", "natural", "vital"],
  }).map(([loadout, [action, effector, target]]) => [loadout, { movement: "hold", action, effector, target,
    stance: "compact", persistence: 0.6249999999999999 }]));
  assert.deepEqual(deployed, expected);
  assert.deepEqual(rollout, expected);
  // And the answers are legal on the body that produced them, asked of the mask
  // itself rather than of either decoder -- the whole tuple, not just the action.
  for (const [loadout, view] of Object.entries(views)) {
    const row = expected[loadout];
    assert.ok(deployableActions(view).has(row.action), loadout);
    assert.ok(deployableTactics(view).some((tuple) => tuple.action === row.action &&
      tuple.effector === row.effector && tuple.target === row.target), `${loadout}: ${row.action}+${row.effector}+${row.target}`);
  }

  // **The fixture can exhibit the defect it exists for, stated as numbers.** Both
  // decoders take the joint tuple now, so what the fixture has to be able to see
  // is a decoder that reverted to the bare action argmax `neatLabeler` used to
  // hold. On `sword+empty` these same twenty-six values give the joint rule
  // `thrust+primary+low` -- 0.30 + 1.00 + 1.00 = 2.30 against
  // `punch+secondary+high`'s 0.90 + 0.10 + 0.30 -- while a bare argmax over the
  // action block answers `punch`. Two of the seven loadouts in `views` diverge;
  // one is enough, and the whole table is written out so that a change which
  // quietly reduces it to zero is a failure rather than a silently weaker test.
  //
  // **Seven is this fixture's count and no longer the matrix's**, which is eight
  // loadouts over fifteen cells since `sword+axe` landed. That row is absent
  // here on purpose rather than by oversight: this test is about two decoders
  // agreeing, and the loadout that would strengthen it -- the only one where the
  // effector term can move an *attacking* answer -- is already covered against
  // both of its counterfactuals in `tests/ppo.test.mjs`.
  const bare = Object.fromEntries(Object.entries(views).map(([loadout, view]) =>
    [loadout, HAND_ACTION_NAMES[maskedArgmax(actionLogits, supportedActionIndices(view), "action")]]));
  assert.deepEqual(bare, { "sword+empty": "punch", "sword+shield": "thrust", "sword+buckler": "thrust",
    "axe+empty": "punch", "bow+empty": "shoot", "empty+empty": "punch", "natural:bite": "bite" });
  assert.deepEqual(Object.keys(bare).filter((loadout) => bare[loadout] !== expected[loadout].action),
    ["sword+empty", "axe+empty"]);
});

test("a_logit_tie_is_broken_by_table_order_in_both_decoders", () => {
  // `>` and not `>=`, in the rollout worker's hand-rolled argmax and in
  // `maskedArgmax` alike: two names at the same logit resolve to the earlier one
  // in the frozen table. Nothing pinned it -- flipping either comparison left
  // the whole suite green -- and a tie-break that flips on one side of the seam
  // is one genome decoding to two controllers, which is the defect the parity
  // test above exists for with the ties left out of it.
  const movementLogits = [0.1, 0.9, 0.2, 0.9, 0.3];
  const actionLogits = [0.8, 0.2, 0.3, 0.8, 0.1, 0.05, 0.4];
  assert.deepEqual(MOVEMENT_NAMES, ["close", "hold", "circle-left", "circle-right", "disengage"]);
  assert.deepEqual(HAND_ACTION_NAMES, ["cover", "cut", "thrust", "punch", "shoot", "bite", "recover"]);
  const genome = constantGenome(outputVector({ movement: movementLogits, action: actionLogits, persistence: 0.5 }));
  const bytes = new ResearchArtifact({ algorithm: "neat-qd", ...RESEARCH_ARTIFACT_CONTRACT,
    payload: [...new TextEncoder().encode(canonicalJson(genome))],
    provenance: { seed: 7, solverSteps: 4, trainingSplit: "train", validationSplit: "validation", configDigest: "synthetic" },
  }, RESEARCH_ARTIFACT_CONTRACT).toBytes();
  const view = learningView("sword", "empty");
  let deployed = null; let rollout = null;
  const mind = deployedResearchMind(decodeResearchArtifact(bytes), "warrior/sword+empty",
    (_view, features, label) => { deployed = { ...label }; rollout = { ...neatLabeler(genome)(view, features) }; });
  mind.decide(view, 1 / 240);
  const expected = { movement: "hold", action: "cover", effector: "primary", target: "vital",
    stance: "action-default", persistence: 0.6249999999999999 };
  assert.deepEqual(deployed, expected); assert.deepEqual(rollout, expected);
});

test("a_non_finite_learned_output_is_refused_by_name_before_it_deletes_the_persistence_window", () => {
  // Three refusals, each naming the offending output. `maskedArgmax` already
  // refuses a non-finite *logit*; the trailing scalar had nothing watching it
  // once `networkMetaMind` went, and this function's own docstring claimed to be
  // the one place a vector is taken apart and refused.
  const finite = outputVector({ movement: [0.01, 0.02, 0.03, 0.04, 0.05],
    action: [0.11, 0.12, 0.13, 0.14, 0.15, 0.16, 0.17], effector: [0.21, 0.22, 0.23],
    target: [0.31, 0.32, 0.33, 0.34], stance: [0.41, 0.42, 0.43, 0.44, 0.45, 0.46] });
  const poisoned = (index, value) => finite.map((entry, at) => at === index ? value : entry);
  assert.throws(() => readMetaOutput(poisoned(META_OUTPUT_LAYOUT.persistenceAt, NaN)), /learned output "persistence" is NaN/);
  assert.throws(() => readMetaOutput(poisoned(0, Infinity)), /learned output "close" is Infinity/);
  assert.throws(() => readMetaOutput(poisoned(7, -Infinity)), /learned output "thrust" is -Infinity/);

  // The genome the existing guards let through. `deployedResearchMind` probes
  // the network on an all-zero feature vector, which is finite here; the
  // overflow needs a real body, and every research body publishes
  // `self_vitality` at 1.
  const vitality = FEATURE_COLUMNS.indexOf("self_vitality");
  assert.ok(vitality >= 0);
  const base = constantGenome(outputVector({ movement: [0.1, 0.5, 0.2, 0.3, 0.4],
    action: [0.1, 0.2, 0.3, 0.9, 0.4, 0.5, 0.05], persistence: 0.5 }));
  const hidden = FEATURE_COLUMNS.length + 1 + META_OUTPUT_LAYOUT.width;
  const persistence = FEATURE_COLUMNS.length + 1 + META_OUTPUT_LAYOUT.persistenceAt;
  const overflowing = { ...base,
    nodes: [...base.nodes, { id: hidden, kind: "hidden", bias: 0, activation: "identity" }],
    // `MAX_VALUE x 1` is finite, `x 10` is not, and `Infinity - Infinity` is
    // `NaN` -- so the persistence node is 0.5 at zeros and `NaN` on a body.
    edges: [{ innovation: 1, from: vitality, to: hidden, weight: Number.MAX_VALUE, enabled: true },
      { innovation: 2, from: hidden, to: persistence, weight: 10, enabled: true },
      { innovation: 3, from: hidden, to: persistence, weight: -10, enabled: true }] };
  assert.equal(new RecurrentNeatNetwork(overflowing).run(FEATURE_COLUMNS.map(() => 0))[META_OUTPUT_LAYOUT.persistenceAt], 0.5);
  const bytes = new ResearchArtifact({ algorithm: "neat-qd", ...RESEARCH_ARTIFACT_CONTRACT,
    payload: [...new TextEncoder().encode(canonicalJson(overflowing))],
    provenance: { seed: 7, solverSteps: 4, trainingSplit: "train", validationSplit: "validation", configDigest: "synthetic" },
  }, RESEARCH_ARTIFACT_CONTRACT).toBytes();
  const mind = deployedResearchMind(decodeResearchArtifact(bytes), "warrior/sword+empty");
  assert.throws(() => mind.decide(learningView("sword", "empty"), 1 / 240), /learned output "persistence" is NaN/);

  // And what the refusal prevents, measured rather than argued. `nextDecision`
  // becomes `NaN`, `view.clock >= NaN` is permanently false, and the persistence
  // window stops existing -- the controller still re-decides when a skill
  // finishes, so it is a silent change of algorithm rather than a freeze.
  const drive = (persistenceSeconds) => { const view = learningView("sword", "empty"); let decisions = 0;
    const stalled = researchLabelMind("stall", (probed) => { decisions += 1;
      return probeLabel(probed, "hold", "cover", persistenceSeconds); });
    for (let frame = 0; frame < 240; frame += 1) { view.clock = frame / 60; stalled.decide(view, 1 / 60); }
    return { decisions, persistenceSeconds: stalled.diagnostic().persistenceSeconds,
      windowIsFinite: Number.isFinite(stalled.diagnostic().persistenceRemaining) }; };
  assert.deepEqual(drive(0.10), { decisions: 38, persistenceSeconds: 0.10, windowIsFinite: true });
  assert.deepEqual(drive(NaN), { decisions: 14, persistenceSeconds: NaN, windowIsFinite: false });
});

test("diagnostics_report_the_decision_without_changing_it", () => {
  let labelled = 0;
  const mind = researchLabelMind("neat-qd", (probed) => { labelled += 1; return probeLabel(probed, "close", "cut"); });
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
  const mind = researchLabelMind("dagger", (probed) => { labelled += 1;
    return probeLabel(probed, "hold", "cover", labelled === 1 ? 0.80 : 0.10); });
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
  const mind = researchLabelMind("neat-qd", (probed) => ({ ...probeLabel(probed, "hold", "cut", 0.10), action: "shoot" }));
  assert.throws(() => mind.decide(view, 1 / 240), /research policy produced unsupported action "shoot"/);
});

/** The independent per-head argmax the joint rule replaces, written out so the two can be compared. */
const independentArgmax = (logits, names) => names[logits.reduce((best, value, index) => value > logits[best] ? index : best, 0)];

test("the_learned_tuple_is_the_best_legal_sum_of_action_effector_and_target_logits", () => {
  const view = learningView("sword", "empty");
  // A sword in the primary and nothing in the secondary, which is the loadout
  // where every third of the tuple has a different answer: only the sword hand
  // can cut or thrust, only the empty hand can punch, and only a cut or a thrust
  // may be aimed low.
  //
  // The three logit blocks below are chosen so that the *independent* argmaxes
  // name `punch` + `primary` + `low`. Each of those three names is legal on this
  // body on its own, and no pair of them is obviously wrong -- the triple is what
  // is impossible. That is the case a repair pass cannot handle honestly: it has
  // to throw away a head the network meant, and whichever one it picks is a
  // decision nobody made.
  const action = [0, 0.30, 0.20, 1.00, 0, 0, 0];
  const effector = [1.00, 0.10, 0];
  const target = [0.20, 0.30, 1.00, 0];
  assert.equal(independentArgmax(action, HAND_ACTION_NAMES), "punch");
  assert.equal(independentArgmax(effector, EFFECTOR_NAMES), "primary");
  assert.equal(independentArgmax(target, TARGET_NAMES), "low");
  assert.equal(deployableTactics(view).some((row) => row.action === "punch" && row.effector === "primary" && row.target === "low"),
    false, "the independently-argmaxed triple is not a legal tuple");

  // The answer, whole, against a literal. `cut+primary+low` sums to 2.30 and the
  // best any other legal tuple reaches is `thrust+primary+low` at 2.20 -- so the
  // rule keeps the effector and the target the network was most sure of and
  // drops the action, which is a trade no per-head repair can make.
  assert.deepEqual({ ...selectDeployableTactic(view, readMetaOutput(outputVector({ action, effector, target }))) },
    { action: "cut", effector: "primary", target: "low", stance: "action-default" });

  // And the trade goes the other way when the action head is sure enough:
  // `punch+secondary+high` at 3.40 beats `cut+primary+low` at 2.30. A rule that
  // simply preferred the highest legal action logit, or the highest legal
  // effector, would answer one of these two and be wrong about the other.
  const insistent = [0, 0.30, 0.20, 3.00, 0, 0, 0];
  assert.deepEqual({ ...selectDeployableTactic(view, readMetaOutput(outputVector({ action: insistent, effector, target }))) },
    { action: "punch", effector: "secondary", target: "high", stance: "action-default" });

  // **The effector term, on a body where it decides something.** Everything
  // above runs on `sword+empty`, where every action that can win has exactly one
  // legal effector -- only the sword hand cuts or thrusts, only the empty hand
  // punches -- so the effector logits cannot change the answer and multiplying
  // that term by zero left all 501 tests passing. This is the loadout where they
  // can: a sword and an **axe**, two different one-handed weapons, so `cut` is
  // legal in either hand and only the effector head can tell them apart.
  // Asymmetric on purpose rather than two swords: an asymmetric pair also has an
  // action the two hands do not share, which is what makes "the effector head
  // decided" separable from "the loadout decided".
  const mixed = learningView("sword", "axe");
  assert.deepEqual([...tacticEffectors(mixed, "cut")], ["primary", "secondary"],
    "the fixture has to offer one action in two hands, or it proves nothing about the effector term");
  assert.deepEqual([...tacticEffectors(mixed, "thrust")], ["primary"], "and an axe has no point");
  // `cut` alone in the action head, the *second* hand in the effector head, and
  // `high` in the target head, so all three terms are separately decisive:
  // `cut+secondary+high` is 1.00 + 1.00 + 0.50 = 2.50, against `cut+primary+high`
  // at 1.50 and `cut+secondary+vital` at 2.00.
  const handed = readMetaOutput(outputVector({ action: [0, 1.00, 0, 0, 0, 0, 0], effector: [0, 1.00, 0],
    target: [0, 0.50, 0, 0] }));
  assert.deepEqual({ ...selectDeployableTactic(mixed, handed) },
    { action: "cut", effector: "secondary", target: "high", stance: "action-default" });
  // Both counterfactuals as literals, because "the effector head decided this"
  // is only checkable against what the answer would be without it. Zeroing the
  // effector term ties the two hands and the tie-break takes `primary`; zeroing
  // the target term ties the three heights and takes `vital`. Each is one of the
  // two mutations this case was watched failing under.
  assert.deepEqual({ ...selectDeployableTactic(mixed,
    readMetaOutput(outputVector({ action: [0, 1.00, 0, 0, 0, 0, 0], target: [0, 0.50, 0, 0] }))) },
  { action: "cut", effector: "primary", target: "high", stance: "action-default" });
  assert.deepEqual({ ...selectDeployableTactic(mixed,
    readMetaOutput(outputVector({ action: [0, 1.00, 0, 0, 0, 0, 0], effector: [0, 1.00, 0] }))) },
  { action: "cut", effector: "secondary", target: "vital", stance: "action-default" });
  // **The stance term joins none of that, and this is the case that says so.**
  // A stance logit large enough to dominate every other head changes the stance
  // and *only* the stance: if it were summed into the tuple comparison it would
  // change nothing on its own (it is constant across tuples), but a rule that
  // masked the stance by action -- the obvious next mistake -- would answer
  // `action-default` here.
  assert.deepEqual({ ...selectDeployableTactic(mixed, readMetaOutput(outputVector({
    action: [0, 1.00, 0, 0, 0, 0, 0], effector: [0, 1.00, 0], target: [0, 0.50, 0, 0],
    stance: [0, 0, 0, 0, 9, 0] }))) },
  { action: "cut", effector: "secondary", target: "high", stance: "slip-left" });
});

test("a_tied_legal_tuple_is_broken_by_action_then_effector_then_target_index", () => {
  const view = learningView("sword", "empty");
  // An all-zero vector is not an exotic input: an untrained genome answers its
  // biases and `initialSparseGenome` seeds those at zero, so on the first
  // generation of every NEAT run *every* legal tuple ties.
  const tied = readMetaOutput(outputVector());
  assert.deepEqual({ ...selectDeployableTactic(view, tied) },
    { action: "cover", effector: "primary", target: "vital", stance: "action-default" });
  // The discriminating half, and the reason the rule walks the index spaces
  // rather than scanning `deployableTactics`. `tacticTargets("cover")` is
  // `["threat", "vital"]` -- table indices 3 then 0 -- so the enumeration order
  // of the legal set puts `threat` first, and a scan of it with `>` would answer
  // `threat` here. "Lower target index" is `vital`.
  assert.deepEqual(deployableTactics(view)[0], { action: "cover", effector: "primary", target: "threat" });

  // The same discrimination on a second action, so a fix that special-cased
  // `cover` would still fail. `recover` shares the defensive target row.
  const recovering = readMetaOutput(outputVector({ action: [0, 0, 0, 0, 0, 0, 1] }));
  assert.deepEqual({ ...selectDeployableTactic(view, recovering) },
    { action: "recover", effector: "primary", target: "vital", stance: "action-default" });

  // Effector is the middle key and needs its own case: tie the two hands on an
  // action both can perform and the lower index wins, without the target moving.
  const covering = readMetaOutput(outputVector({ action: [1, 0, 0, 0, 0, 0, 0], effector: [0.5, 0.5, 0] }));
  assert.deepEqual({ ...selectDeployableTactic(view, covering) },
    { action: "cover", effector: "primary", target: "vital", stance: "action-default" });
});

test("a_body_that_can_still_fight_always_has_a_legal_tuple_and_one_that_cannot_is_refused_by_name", () => {
  // The centipede: no hand slots at all, a published bite. The whole set rather
  // than a membership check, because "non-empty" is satisfied by a set with the
  // wrong contents and this is what `recover` staying capability-neutral buys.
  const jaws = jawedView();
  assert.deepEqual(deployableTactics(jaws).map((row) => ({ ...row })), [
    { action: "bite", effector: "natural", target: "vital" },
    { action: "recover", effector: "natural", target: "threat" },
    { action: "recover", effector: "natural", target: "vital" },
  ]);
  assert.deepEqual({ ...selectDeployableTactic(jaws, readMetaOutput(outputVector())) },
    { action: "bite", effector: "natural", target: "vital", stance: "action-default" });

  // A warrior that has lost both hands, and this is the half the plan for this
  // stage had backwards. The *executor's* rule is capability-neutral -- `recover`
  // answers the natural effector with no hand at all, and `cover` answers nothing
  // -- which is the separation the last exhaustive look-ahead run bought. But
  // `supportedOptions`' first line refuses a body with no attached hand and no
  // natural attack outright, so the deployment *mask* is empty for it, and no
  // amount of legality below that gate puts a tuple back.
  const armless = learningView("sword", "empty");
  armless.self.hands.primary.lost = true; armless.self.hands.secondary.lost = true;
  assert.deepEqual([...tacticEffectors(armless, "recover")], ["natural"], "recovery needs no hand");
  assert.deepEqual([...tacticEffectors(armless, "cover")], [], "a cover needs a hand to place");
  assert.deepEqual(deployableTactics(armless), [], "and the mask is the stricter of the two");
  // So the selection refuses by name rather than falling through `maskedArgmax`'s
  // `has no supported tactic`, which names a head and not the body.
  assert.throws(() => selectDeployableTactic(armless, readMetaOutput(outputVector())),
    /tactic has no legal action\/effector\/target tuple for unit "warrior"/);
  // Nothing in production reaches that throw today: every controller goes inert
  // at the same boundary before it decides. This is the sentence whoever gives a
  // learned controller an armless cell will read.
  assert.equal(supportedOptions(armless).size, 0);
});

test("the_factorized_policy_uses_a_published_natural_bite_without_fabricated_hands", () => {
  const v = learningView(); v.self.hands = {}; v.self.naturalAttacks = { bite: { reach: 0.7, ready: true, active: false } };
  v.self.collisionRadius = 0.2; v.opponent.collisionRadius = 0.3; v.measure = 0.8;
  const mind = researchLabelMind("neat-qd", (probed) => probeLabel(probed, "hold", "bite", 0.10));
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

const HEAD_TABLES = { movement: MOVEMENT_NAMES, action: HAND_ACTION_NAMES, effector: EFFECTOR_NAMES,
  target: TARGET_NAMES, stance: STANCE_NAMES };
const sealed = (algorithm, model) => decodeResearchArtifact(new ResearchArtifact({ algorithm, ...RESEARCH_ARTIFACT_CONTRACT,
  payload: [...new TextEncoder().encode(canonicalJson(model))],
  provenance: { seed: 7, solverSteps: 4, trainingSplit: "train", validationSplit: "validation", configDigest: "synthetic" },
}, RESEARCH_ARTIFACT_CONTRACT).toBytes());

/**
 * Every producer of a research label writes the same six field names, checked
 * against the one list rather than against each other.
 *
 * The same construct as `COMBAT_FIELDS`, and it exists because the same defect
 * happened one level up: `DaggerLabel` widened, and the things that build one are
 * in as many files with no shared declaration between them.
 *
 * **Five, and this said four.** The teacher, a trained DAgger model, the NEAT
 * decoder, the PPO decoder -- and the look-ahead beam, which became a producer the
 * moment stage C2c gave it an effector and an aim of its own to name. Four of the
 * five go through `deployedResearchMind` here rather than being called directly,
 * because that is the seam a tournament actually runs, and a label that is right in
 * the decoder and wrong at the seam is the failure this cannot be allowed to miss.
 * The teacher is the fifth and is called directly, because nothing deploys it.
 *
 * The look-ahead payload is a model whose every cell carries one row with an
 * identical before and after: the delta is zero, so every cell ties and the beam's
 * frozen tie-break picks the first -- and a one-row cell calibrates to 0/0/0 in all
 * three gated columns, which is what gets it past `LOOKAHEAD_CALIBRATION_LIMITS`.
 * It still does under session 19's repaired statistics, and for a stronger reason
 * than before rather than by luck: `reachError` and `vitalityDeltaError` are mean
 * absolute residuals about a mean taken over that same single row, and
 * `contactRateError` is a fitted rate against the rate of the rows it was fitted
 * on, so all three are exactly zero for a group of one. That degeneracy is a real
 * property of the trainer at low budgets -- `MIN_SPLIT_STEPS_PER_JOB` in
 * `scripts/train-lookahead.mjs` is the warning it earned and
 * `docs/measurements.md` records the bracket; here it is what makes a synthetic
 * artifact deployable without a Havok trace.
 */
test("every_producer_of_a_research_label_writes_the_same_six_fields", () => {
  const view = learningView("sword", "empty");
  const seen = {};
  seen.teacher = tacticalTeacher(view);

  const daggerRow = (action, step) => ({ featureVersion: FEATURE_VERSION, features: FEATURE_COLUMNS.map((_, index) => index / 200),
    label: { movement: "hold", action, effector: "primary", target: "vital", stance: "action-default", persistence: 0.4 },
    unitCell: "warrior/sword+empty", sourceSeed: 1, sourceStep: step, iteration: 0, teacherVersion: TACTICAL_TEACHER_VERSION });
  const model = trainDaggerModel([daggerRow("cover", 0), daggerRow("cut", 1)], FEATURE_COLUMNS.length,
    HEAD_TABLES, TACTICAL_TEACHER_VERSION, 2, 0.01, 5, 4);

  const layer = (rows, columns) => ({ rows, columns, weights: Array(rows * columns).fill(0), bias: Array(rows).fill(0) });
  const ppo = { weights: { inputSize: FEATURE_COLUMNS.length, units: GRU_UNITS,
    update: layer(GRU_UNITS, FEATURE_COLUMNS.length + GRU_UNITS), reset: layer(GRU_UNITS, FEATURE_COLUMNS.length + GRU_UNITS),
    candidate: layer(GRU_UNITS, FEATURE_COLUMNS.length + GRU_UNITS),
    ...Object.fromEntries(Object.entries(HEAD_TABLES).map(([name, table]) => [name, layer(table.length, GRU_UNITS)])),
    value: layer(1, GRU_UNITS) } };

  const flat = { reachMargin: -0.2, facingError: 0.1, threatAlignment: 0, contactProbability: 0, vitalityPotential: 0 };
  const lookahead = fitTacticalModel(MOVEMENT_NAMES.flatMap((movement) =>
    deployableTactics(view).map((tactic) => ({ tactic: plannedTacticKey({ movement, ...tactic }),
      bodyLoadout: "warrior/sword+empty", before: flat, after: flat, contact: false }))));

  for (const [algorithm, payload] of [["dagger", model], ["ppo", ppo],
    ["neat-qd", constantGenome(outputVector({ action: [0, 1, 0, 0, 0, 0, 0], persistence: 0.2 }))],
    ["lookahead", lookahead]]) {
    const mind = deployedResearchMind(sealed(algorithm, payload), "warrior/sword+empty",
      (_view, _features, label) => { seen[algorithm] = { ...label }; });
    mind.decide(learningView("sword", "empty"), 1 / 240);
  }
  assert.deepEqual(Object.keys(seen).sort(), ["dagger", "lookahead", "neat-qd", "ppo", "teacher"],
    "every producer was actually reached");
  for (const [name, label] of Object.entries(seen)) {
    assert.deepEqual(Object.keys(label).sort(), [...RESEARCH_LABEL_FIELDS], name);
    assert.ok(MOVEMENT_NAMES.includes(label.movement), `${name} movement ${label.movement}`);
    assert.ok(HAND_ACTION_NAMES.includes(label.action), `${name} action ${label.action}`);
    assert.ok(EFFECTOR_NAMES.includes(label.effector), `${name} effector ${label.effector}`);
    assert.ok(TARGET_NAMES.includes(label.target), `${name} target ${label.target}`);
    assert.ok(STANCE_NAMES.includes(label.stance), `${name} stance ${label.stance}`);
    assert.ok(Number.isFinite(label.persistence), `${name} persistence ${label.persistence}`);
  }
  // PPO produces 25 of the 26 outputs: its persistence is the shared constant
  // rather than a head, which is recorded here as a number so a session that
  // adds the sixth head has to come and delete this line.
  assert.equal(seen.ppo.persistence, 0.4);
});

/**
 * A tuple no body can perform is refused by name, and by exactly one rule.
 *
 * `researchLabelMind` refuses an *action* outside `deployableActions`, because
 * that mask is stricter than the executor. It deliberately does **not** re-check
 * the tuple: `handActionOption` refuses an unknown effector, target or stance at
 * construction and an illegal triple at `enter`, through the same
 * `tacticEffectors` and `AIMED_TARGETS` that `deployableTactics` is built from.
 * A second copy at the seam is how `deployableActions`' own note records seven
 * copies of one legality rule drifting apart.
 *
 * This is the shape a DAgger model can produce and the two masked decoders
 * cannot: `predictDagger` argmaxes each head over its whole table with no mask
 * at all, so a model that has learned `punch` and `low` from different rows can
 * name a triple no body has.
 */
test("an_illegal_learned_tuple_is_refused_by_name_and_never_repaired", () => {
  const view = learningView("sword", "empty");
  assert.equal(deployableTactics(view).some((row) => row.action === "punch" && row.target === "low"), false);
  const illegalAim = researchLabelMind("dagger", (probed) => ({ ...probeLabel(probed, "hold", "punch"), target: "low" }));
  assert.throws(() => illegalAim.decide(view, 1 / 240), /option "punch" requires a punch target of vital, high, not "low"/);
  // The other third of the triple, on the same body: the sword hand cannot punch.
  const illegalHand = researchLabelMind("dagger", (probed) => ({ ...probeLabel(probed, "hold", "punch"), effector: "primary" }));
  assert.throws(() => illegalHand.decide(view, 1 / 240), /option "punch" requires an empty primary hand/);
  // And a stance outside the table, which the option refuses at construction.
  const unknownStance = researchLabelMind("dagger", (probed) => ({ ...probeLabel(probed, "hold", "cover"), stance: "crouch" }));
  assert.throws(() => unknownStance.decide(view, 1 / 240), /unknown stance "crouch"/);
  // The legal one still runs, so the three refusals above are about the tuple
  // rather than about this seam refusing everything.
  const legal = researchLabelMind("dagger", (probed) => probeLabel(probed, "hold", "punch"));
  assert.doesNotThrow(() => legal.decide(view, 1 / 240));
});
