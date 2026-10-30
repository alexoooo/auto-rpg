/**
 * **A part of any converted role swaps in from outside the shared code** (Node, core world,
 * vendored Rapier, 120 Hz). The fixture entrants (`tests/fixtures/swap/`), a fighter and Option Mind,
 * are registered by a line each of the kinds list, outside `src/`, and hold a stub of each
 * converted role as their own parts. For each, chosen by its config alone: the catalog offers it to
 * its own mind's slot and refuses it in another's tree, the part its maker made is the part a bout
 * runs, the bout forks and resumes to the bit and replays from its order sheets, and its tree goes
 * through a link unchanged. One bout, the two fixtures facing, holds every stub at once; an
 * executor is made with the configured guard's posture, and the fork falls inside a sub-mind's
 * takeover and resumes across its handback. A body the command layers cannot read refuses a mind
 * on them for what they lack, at construction too, and every stock legs for what they stand on.
 * The stub Commander, a line of the Commanders list from outside `src/`, leads a team and is a
 * Crypt subject. The Lab opens a fixture mind for what it takes, not for its kind. The stub
 * evaluation, a folder and a line of the evaluations list, plays a lone body; the stub end rule, a
 * line of the end rules list, ends a bout whose recipe names it and its start arrangement. A
 * planner's own report reaches the readout a person reads. The quadruped fixture holds a stub of
 * each of the quadruped's roles (motor, gait, bite, planner), and the Option Mind fixture one aim, one
 * chooser, one option and one balance.
 */
import "./fixtures/swap/hooks.mjs";
import test from "node:test";
import assert from "node:assert/strict";

const { buildBout } = await import("../src/evaluation/bout.ts");
const { BOUT_ENGINE } = await import("../research/bout.mjs");
const { SIDES } = await import("../src/arena/duel.ts");
const { FIGHT_ENTRY, kindsFor, treeFaults, treeRefusal } = await import("../src/core/mind/catalog.ts");
const { createMind } = await import("../src/core/mind/minds.ts");
const { STAND_ORDERS } = await import("../src/core/mind/orders.ts");
const { entrantSubjects } = await import("../src/evaluation/tournament/entrants.ts");
const { MINDS } = await import("../src/core/mind/controllers.ts");
const { createBody } = await import("../src/core/body.ts");
const { coreStand } = await import("./harness/core-stand.mjs");
const { CONTROLLERS } = await import("../src/core/mind/controllers.ts");
const { BLADE_FIGHTER, FIGHTING } = await import("../src/core/mind/config.ts");
const { modelHolding, modelSpec } = await import("../src/core/models.ts");
const { traceOf } = await import("../src/evaluation/trace.ts");
const { parseMind, writeMind } = await import("../src/ui/mind-link.ts");
const { GAME_CONFIGS, STUBS, SWAP_DEFAULTS, SWAP_OPTION_DEFAULTS, SWAP_QUADRUPED_DEFAULTS } = await import("./fixtures/swap/mind.mjs");
const { STUB_POSTURE } = await import("./fixtures/swap/stub-guard.mjs");
const { STRAIGHT_NAVIGATION } = await import("./fixtures/swap/straight-navigation.mjs");
const { STUB_BLOW } = await import("./fixtures/swap/stub-blow.mjs");
const { STUB_TAKEOVER, TAKEOVER } = await import("./fixtures/swap/stub-takeover.mjs");
const { saveState } = await import("../src/core/state.ts");
const { COMMANDERS } = await import("../src/core/command/commanders.ts");
const { teamOfOne } = await import("../src/arena/team.ts");
const { CRYPT_CLEAR } = await import("../src/evaluation/crypt-clear/index.ts");
const { labMind, labPresets, labAddress, labHref } = await import("../src/lab/scenarios.ts");
const { controlsFor } = await import("../src/arena/matchup.ts");
const { EVALUATIONS } = await import("../src/evaluation/evaluations.ts");
const { playRow } = await import("../src/evaluation/play.ts");
const { caseNames } = await import("../src/evaluation/code.ts");
const { endingText } = await import("../src/arena/end-rule.ts");
const { engagementLines } = await import("../src/ui/action-readout.ts");
const { labActor } = await import("../src/lab/actor.ts");
const { standIntent } = await import("../src/core/mind/intent.ts");
const { resolveSubjects } = await import("../scripts/evaluation-subjects.mjs");
const { casesOf } = await import("../src/evaluation/run.ts");
const { slotsOf } = await import("../src/evaluation/compare.ts");

/** The bout's steps and the step it is forked at. */
const STEPS = 240, FORK = 120;
const spec = modelSpec("workshop-fighter");

test("the fixture entrants are registered from outside src/", () => {
  for (const config of [SWAP_DEFAULTS, SWAP_OPTION_DEFAULTS, SWAP_QUADRUPED_DEFAULTS]) {
    assert.ok(Object.hasOwn(CONTROLLERS, config.kind), `the hook put ${config.kind}'s line in the kinds list`);
    assert.deepEqual(treeFaults(config), [], `${config.kind} holding every stub of its own has no fault`);
  }
});

test("the Lab plays the fixture fighter, prepares its planner once, and replaces it completely with a supplied script", async () => {
  assert.deepEqual(labMind(SWAP_DEFAULTS, spec, "stance"), { plays: SWAP_DEFAULTS, faults: [] });
  assert.deepEqual(labMind(SWAP_OPTION_DEFAULTS, spec, "stance").faults, ["the Lab drives a mind that takes its script, as a fighter does"]);
  const stand = await coreStand(spec), actor = labActor(stand.built, stand.world, { mind: SWAP_DEFAULTS });
  try {
    const skills = actor.drive(); stand.step();
    assert.equal(skills.state.preparation.built, 1);
    assert.equal(skills.state.preparation.steps, 1);
    const state = { steps: 0 }, script = { name: "fixture", state, decide() { state.steps++; return standIntent(); } };
    const scripted = actor.drive(script); stand.step();
    assert.equal(state.steps, 1);
    assert.equal(scripted.state.preparation, undefined, "replacing the planner also replaces its preparation");
  } finally { actor.dispose(); stand.dispose(); }
});

test("an external preset's model calibration governs Arena, Lab and evaluation choices, and named Lab links round-trip", () => {
  const rogue = modelSpec("workshop-rogue");
  assert.ok(controlsFor("workshop-fighter").includes("swap-stub"));
  assert.ok(!controlsFor("workshop-rogue").includes("swap-stub"));
  assert.ok(labPresets(spec, "attack").some(preset => preset.id === "swap-stub"));
  assert.ok(!labPresets(rogue, "attack").some(preset => preset.id === "swap-stub"));
  assert.deepEqual(treeRefusal(rogue, SWAP_DEFAULTS), null, "calibration availability does not change a custom tree's physical fit");
  const entrants = entrantSubjects(["swap-stub"]);
  assert.deepEqual([...new Set(entrants.map(entrant => entrant.value.model))], ["workshop-fighter"]);
  assert.throws(() => entrantSubjects(["swap-stub/workshop-rogue/empty,empty"]), /is no entrant/);
  const address = labAddress("?scenario=attack&mind=swap-stub");
  assert.deepEqual(address.mind, SWAP_DEFAULTS);
  assert.equal(new URLSearchParams(labHref(address)).get("mind"), "swap-stub");
  assert.notDeepEqual(labAddress("?scenario=attack&model=workshop-rogue&mind=swap-stub").mind, SWAP_DEFAULTS);
  const custom = labHref({ ...address, model: "workshop-rogue" });
  assert.notEqual(new URLSearchParams(custom).get("mind"), "swap-stub", "a named calibration is not offered for another model");
  assert.deepEqual(labAddress(custom).mind, SWAP_DEFAULTS, "a whole custom tree still travels unchanged");
});

test("CLI ablations inherit calibrated bodies and loadouts before scheduling paired cases", () => {
  const evaluation = EVALUATIONS.tournament, panel = "option/workshop-fighter/empty,empty";
  for (const [id, changes] of [["swap-stub", ["tactics.choose.patience=0.5"]],
    ["swap-unarmed", [`executors=${JSON.stringify([...MINDS["swap-unarmed"].config.executors, ...BLADE_FIGHTER.executors])}`,
      `actions=${JSON.stringify([...MINDS["swap-unarmed"].config.actions, ...BLADE_FIGHTER.actions])}`]]]) {
    const baseline = evaluation.subjects([id]), original = JSON.stringify(MINDS[id].config);
    const { choice, subjects } = resolveSubjects(evaluation, [], id, changes), candidate = choice[0];
    const kits = (subjects) => subjects.map(({ value: { model, loadout } }) => ({ model, loadout }));
    assert.ok(baseline.length > 0, "the source has entrants to compare");
    assert.ok(evaluation.subjects([candidate]).some(one => !kits(baseline).some(kit =>
      JSON.stringify(kit) === JSON.stringify(kits([one])[0]))), "the unrestricted candidate would widen the comparison");
    assert.deepEqual(kits(subjects), kits(baseline), "the CLI retains the source's complete kit scope and order");
    assert.deepEqual(subjects.map(one => one.value.mind), subjects.map(() => candidate.value));
    assert.equal(JSON.stringify(MINDS[id].config), original, "replacement owns its config");
    const counterpart = new Map(subjects.map((one, k) => [one.id, baseline[k].id]));
    assert.deepEqual(subjects.map(one => one.id.slice(candidate.id.length)), baseline.map(one => one.id.slice(id.length)));
    const { units, dropped } = casesOf(evaluation, evaluation.defaultProtocol, [...subjects, ...baseline, ...evaluation.subjects([panel])],
      { engine: BOUT_ENGINE, code: () => "scope-fixture", schedule: { kind: "versus", panel: [panel] } });
    assert.deepEqual(dropped, []);
    const slots = slotsOf(units, counterpart, [panel]);
    assert.deepEqual(new Set(slots.map(slot => slot.subject)), new Set(subjects.map(one => one.id)), "every candidate has a paired baseline");
    assert.deepEqual(new Set(slots.flatMap(slot => [...slot.mine, ...slot.theirs].map(one => one.key))),
      new Set(units.flatMap(unit => unit.map(one => one.key))), "no unpaired work reaches the schedule");
    const withOther = resolveSubjects(evaluation, [panel], id, changes);
    assert.deepEqual(withOther.subjects, [...subjects, ...evaluation.subjects([panel])], "other requested subjects retain their scope");
    if (id === "swap-unarmed") assert.ok(evaluation.subjects([candidate]).some(one => one.value.model === "workshop-fighter"
      && !baseline.some(before => JSON.stringify(before.value.loadout) === JSON.stringify(one.value.loadout))),
    "the fixture also exposes loadout widening on the calibrated body");
  }
});

test("CLI resolution preserves whole-config expansion, batteries and two-subject matches", () => {
  const id = "vanguard-skeleton", raw = JSON.stringify(MINDS[id].config), evaluation = EVALUATIONS.tournament;
  assert.deepEqual(resolveSubjects(evaluation, [id]).subjects, evaluation.subjects([id]));
  const custom = resolveSubjects(evaluation, [raw]);
  assert.deepEqual(custom.subjects, evaluation.subjects(custom.choice));
  assert.ok(custom.subjects.some(one => one.value.model !== "crypt-skeleton"), "an unscoped custom config still expands beyond its named calibration");
  const punchesOnly = MINDS[id].config.actions.map(action => {
    const executor = MINDS[id].config.executors.find(executor => executor.name === action.executor);
    return executor.kind === "vanguard-punch" ? `actions.${action.name}.effectors=["hand.right"]` : `actions.${action.name}=null`;
  });
  const narrowed = resolveSubjects(evaluation, [], id, punchesOnly);
  const baseline = evaluation.subjects([id]);
  assert.ok(baseline.some(one => one.value.loadout.right !== "empty"), "the source can strike with its other hand while holding an item");
  assert.deepEqual(narrowed.subjects.map(one => ({ model: one.value.model, loadout: one.value.loadout })),
    baseline.filter(one => one.value.loadout.right === "empty").map(one => ({ model: one.value.model, loadout: one.value.loadout })),
    "an ablation still drops source loadouts the changed config cannot play");
  for (const [evaluation, names] of [[EVALUATIONS.court, []], [EVALUATIONS.crowd, []], [EVALUATIONS.match, ["counter"]]]) {
    const resolved = resolveSubjects(evaluation, names, id, ["tactics.flank=false"]);
    const expected = evaluation.subjects(resolved.choice);
    expected[0] = { ...expected[0], models: MINDS[id].models };
    assert.deepEqual(resolved.subjects, expected);
    assert.equal(resolved.subjects[0].value.tactics.flank, false);
  }
});

test("mind batteries admit only a named calibration's bodies and preserve that scope through CLI ablations", () => {
  for (const evaluation of [EVALUATIONS.court, EVALUATIONS.crowd]) {
    const cases = subjects => casesOf(evaluation, evaluation.defaultProtocol, subjects,
      { engine: BOUT_ENGINE, code: () => "battery-scope", schedule: { kind: "all" } });
    const named = evaluation.subjects(["swap-stub"]), original = JSON.stringify(named);
    const custom = evaluation.subjects([{ id: named[0].id, label: named[0].label, value: named[0].value }]);
    assert.deepEqual(named, [{ ...custom[0], models: ["workshop-fighter"] }]);
    const raw = cases(custom), modelOf = one => one.world.kind === "crypt" ? one.world.crypt.party[0].model : one.condition.model;
    assert.ok(raw.units.length > 0, "the fixture fits the battery's equipment and bodies");
    const allowed = raw.units.filter(unit => modelOf(unit[0]) === "workshop-fighter");
    assert.ok(allowed.length > 0, "the named calibration reaches eligible cases");
    assert.deepEqual(cases(named), {
      units: allowed,
      dropped: raw.units.filter(unit => modelOf(unit[0]) !== "workshop-fighter").map(([one]) => ({
        subjects: one.subjects, condition: one.condition,
        reasons: [`swap-stub: named calibration allows workshop-fighter; ${modelOf(one)} is unavailable`],
      })),
    }, "admission filters cases without changing an eligible recipe or key");
    if (evaluation === EVALUATIONS.court) assert.ok(raw.units.some(unit => modelOf(unit[0]) === "workshop-rogue"),
      "the equipped fixture exposes calibration leakage independently of physical fit");
    const resolved = resolveSubjects(evaluation, [], "swap-stub", ["tactics.choose.patience=0.5"]);
    assert.deepEqual(resolved.subjects[0].models, named[0].models);
    const independent = cases(evaluation.subjects(resolved.choice));
    assert.deepEqual(cases(resolved.subjects).units, independent.units.filter(unit => modelOf(unit[0]) === "workshop-fighter"),
      "the changed configuration keeps its source's scope before scheduling");
    assert.equal(JSON.stringify(named), original, "admission never changes the subject or its configuration");
    assert.throws(() => cases([{ ...named[0], models: [] }]), /fits no condition.*named calibration allows no bodies/);
  }
  const evaluation = EVALUATIONS.crowd;
  const cases = subjects => casesOf(evaluation, evaluation.defaultProtocol, subjects,
    { engine: BOUT_ENGINE, code: () => "crowd-scope", schedule: { kind: "all" } });
  for (const id of ["vanguard-rogue", "vanguard-skeleton"]) {
    assert.throws(() => cases(evaluation.subjects([id])), /fits no condition.*named calibration allows/);
    assert.throws(() => cases(resolveSubjects(evaluation, [], id, ["tactics.lowGuard=false"]).subjects),
      /fits no condition.*named calibration allows/);
    assert.ok(cases(evaluation.subjects([{ id, label: id, value: MINDS[id].config }])).units.length > 0,
      "an independent configuration still runs on physically compatible bodies");
  }
});

test("a match admits complete pairs within named calibrations and preserves the scope of ablations", () => {
  const evaluation = EVALUATIONS.match;
  const cases = subjects => casesOf(evaluation, "standard", subjects,
    { engine: BOUT_ENGINE, code: () => "match-scope", schedule: { kind: "all" } });
  for (const [id, model] of [["vanguard-warrior", "workshop-fighter"], ["vanguard-rogue", "workshop-rogue"], ["swap-stub", "workshop-fighter"]]) {
    const named = evaluation.subjects([id, "duellist"]), before = JSON.stringify(named);
    const scoped = cases(named), raw = cases(evaluation.subjects([{ id, label: id, value: MINDS[id].config }, "duellist"]));
    assert.ok(scoped.units.length > 0, "the calibration has complete cases");
    assert.deepEqual(scoped.units, raw.units.filter(unit => unit.every(one => one.world.recipe.left === model && one.world.recipe.right === model)),
      "scope filters complete units without changing their recipes or keys");
    assert.ok(raw.units.some(unit => unit.some(one => one.world.recipe.left !== model)), "the independent configuration exercises wider physical fit");
    assert.equal(JSON.stringify(named), before, "admission preserves its subjects");
  }
  const original = cases(evaluation.subjects(["vanguard-warrior", "counter"]));
  const changed = cases(resolveSubjects(evaluation, ["counter"], "vanguard-warrior", ["tactics.routeAround=false"]).subjects);
  assert.deepEqual(changed.units.map(unit => unit.map(one => one.condition)), original.units.map(unit => unit.map(one => one.condition)));
  assert.throws(() => cases(evaluation.subjects(["vanguard-skeleton", "counter"])), /fits no condition.*named calibration allows crypt-skeleton/);
  assert.throws(() => cases(resolveSubjects(evaluation, ["counter"], "vanguard-skeleton", ["tactics.flank=false"]).subjects), /fits no condition/);
});

test("nested planner structure faults reach links without invoking unsafe ancestor validators", () => {
  const base = MINDS["vanguard-skeleton"].config, plan = base.tactics.plan;
  const foreign = STUBS.find(stub => stub.part.defaults.kind === "stub-tactics").part;
  const cases = [
    [{ kind: "missing-plan" }, "", 'no part of kind "missing-plan"'],
    [{ kind: "vanguard-plan" }, ".plan", "a tactics part is needed"],
    [{ kind: "shield-guard" }, "", "a guard part cannot go where a tactics part goes"],
    [{ ...plan, list: {} }, ".list", "a list of behaviour parts"],
    [{ ...plan, list: [{ kind: "missing-behaviour" }] }, ".list.0", 'no part of kind "missing-behaviour"'],
    [foreign.defaults, "", `${foreign.label} is swap-stub's own part`],
  ];
  for (const [leaf, suffix, fault] of cases) for (const depth of [1, 2, 3]) {
    let tactics = leaf;
    for (let i = 0; i < depth; i++) tactics = { kind: "vanguard-plan", plan: tactics };
    const config = { ...base, tactics }, faults = [`tactics${".plan".repeat(depth)}${suffix}: ${fault}`];
    assert.deepEqual(treeFaults(config), faults);
    assert.deepEqual(parseMind(JSON.stringify(config), modelSpec("crypt-skeleton"), FIGHT_ENTRY), { config, faults },
      "the screen's link parser returns the faulty configuration and its diagnostic");
  }
});

test("structurally valid nested planners retain ancestor and child semantic faults in order", () => {
  const base = MINDS["vanguard-skeleton"].config, plan = FIGHTING;
  const wrap = plan => ({ kind: "vanguard-plan", revisitEvade: true, plan });
  const tactics = wrap(wrap({ ...plan, choose: { ...plan.choose, rethink: -1 } }));
  assert.deepEqual(treeFaults({ ...base, tactics }), [
    "tactics: revisitEvade needs adaptive evasion",
    "tactics.plan: revisitEvade needs adaptive evasion",
    "tactics.plan.plan: selection needs finite nonnegative rethink and positive patience",
  ]);
  assert.deepEqual(treeFaults({ ...base, tactics: { kind: "vanguard-plan", plan: { kind: "vanguard-plan", plan } } }), []);
});

for (const { part, at, mind, place } of STUBS) {
  const kind = part.defaults.kind, game = GAME_CONFIGS[mind];
  test(`${kind}: offered in its own mind's ${part.role} slot only, and a fault in another mind's tree`, () => {
    assert.ok(kindsFor(part.role, spec, [], mind).some((offered) => offered.kind === kind));
    assert.ok(!kindsFor(part.role, spec, [], game.kind).some((offered) => offered.kind === kind));
    assert.deepEqual(treeFaults(place(game)), [`${at}: ${part.label} is ${mind}'s own part`]);
  });
}

test("a body without the command layer refuses a mind for what the layer lacks, at construction too, and every legs for what they stand on", async () => {
  const reptile = modelSpec("reptile"), layer = /^the command layer needs /;
  assert.match(treeRefusal(reptile, BLADE_FIGHTER) ?? "", layer);
  const legs = kindsFor("locomotion", reptile);
  assert.ok(legs.length > 0, "the fixture offers legs to refuse");
  for (const { kind, reason } of legs) assert.equal(reason, "needs a left and a right foot, each with a box sole", kind);
  const stand = await coreStand(reptile);
  assert.throws(() => createBody(stand.built, stand.world, { servoSeconds: .1 }), (error) => layer.test(error.message.replace(/^reptile: /, "")));
});

test("a Commander registered from outside src/ is listed, leads a team of one and is a Crypt subject", async () => {
  assert.ok(Object.hasOwn(COMMANDERS, "stub-hold"), "the hook put the stub's line in the Commanders list");
  const { world, duel, dispose } = await buildBout({ left: "workshop-fighter", right: "workshop-rogue", gap: 3 }, { engine: BOUT_ENGINE });
  const team = teamOfOne(duel, "left", { kind: "stub-hold" });
  try {
    for (let i = 0; i < world.hz; i++) world.step();
    assert.ok(team.commander.state.decided > 0, "the stub's maker made the Commander that led");
  } finally { team.dispose(); dispose(); }
  const [subject] = CRYPT_CLEAR.subjects(["stub-hold"]);
  assert.deepEqual(CRYPT_CLEAR.protocols.standard.faults(subject.value, CRYPT_CLEAR.protocols.standard.conditions[0]), [], "it leads a party, so the Crypt-clearing task takes it");
});

test("a planner keeps clear of a solid as its body's navigator does: the stock one steps out of a column's clearance, the straight stub keeps clear of nothing", async () => {
  const game = { ...SWAP_DEFAULTS, navigation: { kind: "visibility-navigation" } }, straight = { ...SWAP_DEFAULTS, navigation: STRAIGHT_NAVIGATION.defaults };
  const { duel, dispose } = await buildBout({ left: "workshop-fighter", right: "workshop-fighter", gap: 3, minds: { left: game, right: straight } }, { engine: BOUT_ENGINE });
  try {
    // A body 0.2 m from a column's face, inside a humanoid's clearance: what each planner's sight is given (`Sight.clearance`).
    const column = { name: "column", kind: "box", centre: [0, 1, 0], size: [0.4, 2, 0.4] }, view = { stance: { centre: { x: 0.4, y: 1, z: 0 } }, senses: { solids: [column] } };
    const [left, right] = SIDES.map((side) => duel.duelists[side].minded.skills.clearance);
    assert.ok(left.exit(view)?.[0] > 0, "the game's navigator steps the body out of the column's clearance, away from it");
    assert.equal(right.exit(view), null, "the straight stub, the navigator its config names, keeps clear of nothing");
    assert.deepEqual(right.keepClear(view, -Math.PI / 2, [1, 0]), [1, 0], "nor steers a walk into the column");
  } finally { dispose(); }
});

test("an evaluation registered from outside src/ plays its lone-body case through the one play loop, and its code names its world and mind", async () => {
  const evaluation = EVALUATIONS["stub-stand"];
  assert.ok(evaluation, "the hook put the stub's line in the evaluations list");
  const [subject] = evaluation.subjects([{ id: "swap-stub", label: "Swap stubs", value: SWAP_DEFAULTS }]);
  const cases = evaluation.protocols.standard, [condition] = cases.conditions, world = cases.world([subject.value], condition, BOUT_ENGINE, [subject.character ?? {}]);
  const row = await playRow("stub", world, cases.seconds, (built) => cases.read(built, condition));
  assert.equal(row.fault, null, `the case played: ${row.fault?.message}`);
  assert.deepEqual(row.reading, { down: false, seconds: 1 }, "the fixture fighter stands alone a second");
  const names = caseNames(world);
  assert.deepEqual([names.world, names.kinds], ["lone", ["swap-stub"]]);
});

test("an end rule registered from outside src/ ends a bout whose recipe names it, from the start its recipe arranges", async () => {
  const recipe = { left: "workshop-fighter", right: "workshop-rogue", minds: { left: SWAP_DEFAULTS, right: SWAP_DEFAULTS },
    start: { left: { at: [0, -0.5], heading: 0 }, right: { at: [0, 3], heading: Math.PI } }, ends: [{ kind: "stub-ring", radius: 2 }] };
  const { world, duel, dispose } = await buildBout(recipe, { engine: BOUT_ENGINE });
  try {
    world.step();
    assert.deepEqual({ ...duel.verdict }, { winner: "left", ending: "rung out", time: duel.clock }, "the right starts outside the ring and is rung out at once");
    assert.equal(endingText("rung out"), "by leaving the ring");
  } finally { dispose(); }
  assert.ok(caseNames({ kind: "bout", engine: BOUT_ENGINE, recipe, tape: [] }).parts.includes("stub-ring"), "a case that plays the rule holds its code");
  await assert.rejects(buildBout({ ...recipe, ends: [{ kind: "nowhere" }] }, { engine: BOUT_ENGINE }), /no end rule "nowhere"/);
});

test("a mind that never strikes carries a club on a stand, is refused from a bout for the bout's rule, and enters no default pool", async () => {
  const still = { ...SWAP_DEFAULTS, actions: [] }, club = { left: "empty", right: "club" }, held = modelHolding("workshop-fighter", club);
  assert.deepEqual([treeFaults(still), treeRefusal(held, still)], [[], null], "fit is what the body can carry out, not what it uses");
  const stand = await coreStand(held);
  const minded = createMind(stand.built, stand.world, still, { name: "stand", orders: () => STAND_ORDERS });
  for (let i = 0; i < stand.world.hz; i++) stand.world.step();
  assert.equal(minded.body.down, false, "the mind holds its body up a second on the stand");
  const recipe = { left: "workshop-fighter", right: "workshop-fighter", gap: 3, minds: { left: still, right: SWAP_DEFAULTS }, loadouts: { left: club, right: club } };
  assert.ok(FIGHT_ENTRY.includes("attacks"), "a fight asks for an attack");
  await assert.rejects(buildBout(recipe, { engine: BOUT_ENGINE }), { message: "the left mind cannot play workshop-fighter carrying empty,club: it strikes with nothing the body has" });
  const fixtures = Object.keys(MINDS).filter((id) => id.startsWith("swap-"));
  assert.ok(fixtures.length > 0, "the fixture minds are among those a person may pick");
  assert.deepEqual(entrantSubjects([]).filter((subject) => fixtures.some((id) => subject.id.startsWith(`${id}/`))), [], "an experimental mind is in no default pool");
});

test("each part a bout runs is the one its config names, and the bout forks, resumes, replays and links", async () => {
  const minds = { left: SWAP_DEFAULTS, right: SWAP_OPTION_DEFAULTS };
  const recipe = { left: "workshop-fighter", right: "workshop-fighter", gap: 3, minds };
  const played = async (hooks, fork) => {
    const { world, duel, dispose } = await buildBout(recipe, { engine: BOUT_ENGINE, hooks });
    try {
      duel.play([]);
      const builts = SIDES.map((side) => duel.duelists[side].built), trace = traceOf(builts), tail = traceOf(builts);
      const run = (until, traces) => { while (duel.steps < until) { world.step(); for (const one of traces) one.take(); } };
      run(FORK, [trace]);
      const saved = fork ? duel.save() : null, atFork = SIDES.map((side) => duel.duelists[side].minded.body.state.mind?.has ?? null);
      run(STEPS, [trace, tail]);
      const states = SIDES.map((side) => ({ kind: minds[side].kind, mind: saveState(duel.duelists[side].minded.state), body: saveState(duel.duelists[side].minded.body.state),
        lines: duel.duelists[side].minded.report ? engagementLines(duel.duelists[side].minded.report.engagement) : null }));
      let resumed = null;
      if (saved) { duel.load(saved); const again = traceOf(builts); run(STEPS, [again]); resumed = again.digest(); }
      return { digest: trace.digest(), tail: tail.digest(), resumed, states, atFork, sheets: Object.fromEntries(SIDES.map((side) => [side, duel.duelists[side].sheets])) };
    } finally { dispose(); }
  };
  const first = await played({ record: true }, true);
  const taker = SWAP_DEFAULTS.subs.findIndex((sub) => sub.kind === STUB_TAKEOVER.defaults.kind);
  assert.ok(FORK >= TAKEOVER.FROM && STEPS >= TAKEOVER.UNTIL, "the bout is long enough to fork inside the takeover and hand back after it");
  assert.equal(first.atFork[SIDES.indexOf("left")], taker, "the fixture forked while the takeover stub had the body");
  for (const state of first.states) for (const { part, read } of STUBS.filter((stub) => stub.mind === state.kind)) {
    const kind = part.defaults.kind, own = read(state.mind, state.body);
    assert.equal(own?.stub, kind, `the ${part.role} the mind runs is its config's stub`);
    assert.ok(own.steps > 0, `the ${kind} stub was asked`);
  }
  for (const state of first.states.filter((state) => state.kind === SWAP_DEFAULTS.kind)) {
    assert.equal(state.mind.preparation.built, 1, "the configured planner prepared the shared kit once");
    assert.ok(state.mind.preparation.steps > 0, "its prepared command path runs in the actual bout");
    assert.equal(state.mind.preparation.focus, state.mind.tactics.inner.decision.focus, "preparation reads the live operational context");
    assert.deepEqual(read(STUB_BLOW, state).guard, STUB_POSTURE, "the executor is made with the configured guard's posture, where its blows return");
    const standUp = state.body.mind.subs[0];
    assert.equal(standUp.steady.motor.stub, "stub-motor", "the stand-up's steady is made with the configured motor");
    const motors = Object.entries(standUp.techniques).filter(([, technique]) => technique.motor);
    assert.ok(motors.length > 0, "the fixture's stand-up has a technique with a motor");
    for (const [name, technique] of motors) assert.equal(technique.motor.stub, "stub-motor", `its ${name} is made with the configured motor`);
    assert.equal(state.body.mind.has, -1, "the takeover stub handed the body back to its host");
    assert.ok(state.lines.includes(`Decided: ${state.mind.tactics.steps} steps`), `the readout shows the planner's own detail of what it reports: ${state.lines.join(" | ")}`);
  }
  assert.equal(first.resumed, first.tail, "the bout forked and resumed is the bout");
  const replay = await played({ replay: first.sheets }, false);
  assert.equal(replay.digest, first.digest, "the replay is the bout");
  for (const side of SIDES) assert.deepEqual(parseMind(writeMind(minds[side]), modelSpec("workshop-fighter"), FIGHT_ENTRY), { config: minds[side], faults: [] },
    `${minds[side].kind}'s tree goes through a link unchanged`);
});

test("each part a quadruped's config names is the one its mind runs, and its bout forks and resumes", async () => {
  const minds = { left: SWAP_QUADRUPED_DEFAULTS, right: CONTROLLERS.quadruped.defaults };
  const { world, duel, dispose } = await buildBout({ left: "reptile", right: "reptile", gap: 2, minds }, { engine: BOUT_ENGINE });
  try {
    duel.play([]);
    const builts = SIDES.map((side) => duel.duelists[side].built);
    const run = (until, trace) => { while (duel.steps < until) { world.step(); trace?.take(); } };
    run(FORK);
    const saved = duel.save(), tail = traceOf(builts);
    run(STEPS, tail);
    const body = saveState(duel.duelists.left.minded.body.state);
    for (const { part, read } of STUBS.filter((stub) => stub.mind === SWAP_QUADRUPED_DEFAULTS.kind)) {
      const own = read(null, body), kind = part.defaults.kind;
      assert.equal(own?.stub, kind, `the ${part.role} the quadruped runs is its config's stub`);
      assert.ok(own.steps > 0, `the ${kind} stub was asked`);
    }
    duel.load(saved);
    const again = traceOf(builts);
    run(STEPS, again);
    assert.equal(again.digest(), tail.digest(), "the bout forked and resumed is the bout");
  } finally { dispose(); }
});

/** `part`'s stub state in a side's saved mind and body state. */
function read(part, { mind, body }) {
  return STUBS.find((stub) => stub.part === part).read(mind, body);
}
