/**
 * **A part of any converted role swaps in from outside the shared code** (Node, core world,
 * vendored Rapier, 120 Hz). The fixture entrant (`tests/fixtures/swap/`, `swap`), with an Option
 * Mind of its own, over its kit or the quadruped's frame, is registered by a line of the entrants list, outside
 * `src/`, and holds a stub of each converted role as its own parts (`swap:<kind>`). For each,
 * chosen by its config alone: the catalog offers it in its own entrant's trees and no other's, a
 * tree that names it and another entrant's kinds is refused, the part its maker made is the part a bout
 * runs, the bout forks and resumes to the bit and replays from its order sheets, and its tree goes
 * through a link unchanged. One bout, the two fixtures facing, holds every stub at once; an
 * executor is made with the configured guard's posture, and each technique of the rise with the
 * configured motor. A body a mind's parts cannot drive refuses the mind
 * for what the first of them lacks, at construction too, and every stock legs for what they stand on.
 * The stub Commander, a line of the Commanders list from outside `src/`, leads a team and is a
 * Crypt subject. The Lab opens a fixture mind for what it takes, not for its kind. The stub
 * evaluation, a folder and a line of the evaluations list, plays a lone body; the stub end rule, a
 * line of the end rules list, ends a bout whose recipe names it and its start arrangement. The
 * quadruped fixture, Option Mind over the quadruped's frame, holds a stub of each of the frame's roles (motor, gait, bite, stalk), and
 * the Option Mind fixture one aim, one chooser, one option and one balance.
 */
import "./fixtures/swap/hooks.mjs";
import test from "node:test";
import assert from "node:assert/strict";

const { buildBout } = await import("../src/evaluation/bout.ts");
const { BOUT_ENGINE } = await import("../research/bout.mjs");
const { SIDES } = await import("../src/arena/duel.ts");
const { FIGHT_ENTRY, GAME, kindsFor, partLookup, partOf, treeFaults, treeRefusal, treeScope, unusedParts, withoutTuning } = await import("../src/entrants/game.ts");
const { createMind } = await import("../src/core/mind/minds.ts");
const { STAND_ORDERS } = await import("../src/core/intent/orders.ts");
const { entrantSubjects } = await import("../src/evaluation/tournament/entrants.ts");
const { MINDS } = await import("../src/entrants/game.ts");
const { commandedBody } = await import("../src/core/mind/host.ts");
const { coreStand } = await import("./harness/core-stand.mjs");
const { CONTROLLERS } = await import("../src/entrants/game.ts");
const { modelHolding, modelSpec } = await import("../src/core/models.ts");
const { traceOf } = await import("../src/evaluation/trace.ts");
const { parseMind, writeMind } = await import("../src/ui/mind-link.ts");
const { GAME_CONFIGS, STUBS, SWAP_DEFAULTS, SWAP_OPTION_DEFAULTS, SWAP_QUADRUPED_DEFAULTS } = await import("./fixtures/swap/mind.mjs");
const { STUB_POSTURE } = await import("./fixtures/swap/stub-guard.mjs");
const { OTHER_OPTION } = await import("./fixtures/swap/other.mjs");
const { STRAIGHT_NAVIGATION } = await import("./fixtures/swap/straight-navigation.mjs");
const { STUB_BLOW } = await import("./fixtures/swap/stub-blow.mjs");
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
const { labActor } = await import("../src/lab/actor.ts");
const { standIntent } = await import("../src/core/intent/intent.ts");
const { resolveSubjects } = await import("../scripts/evaluation-subjects.mjs");
const { casesOf } = await import("../src/evaluation/run.ts");
const { slotsOf } = await import("../src/evaluation/compare.ts");

/** The bout's steps and the step it is forked at. */
const STEPS = 240, FORK = 120;
const spec = modelSpec("workshop-fighter");

test("the fixture entrant is registered from outside src/", () => {
  assert.deepEqual(GAME.faults, [], "the game's lists with the fixture's line have no fault");
  for (const config of [SWAP_DEFAULTS, SWAP_OPTION_DEFAULTS, SWAP_QUADRUPED_DEFAULTS]) {
    assert.ok(Object.hasOwn(CONTROLLERS, config.kind), `the hook put the swap entrant's line, with ${config.kind}, in the entrants list`);
    assert.equal(treeScope(config), "swap", `${config.kind}'s tree is the swap entrant's`);
    assert.deepEqual(treeFaults(config), [], `${config.kind} holding every stub of its own has no fault`);
  }
});

test("the Lab plays the fixture Option Mind by a supplied script made orders, decided once a step, its instrument reading first", async () => {
  // A mind that carries out orders plays a scripted scenario by its script made orders.
  assert.deepEqual(labMind(SWAP_OPTION_DEFAULTS, spec, "stance"), { plays: SWAP_OPTION_DEFAULTS, faults: [] });
  const stand = await coreStand(spec), actor = labActor(stand.built, stand.world, { mind: SWAP_OPTION_DEFAULTS });
  try {
    const state = { steps: 0 }, seen = [], script = { name: "fixture", state, decide() { state.steps++; return standIntent(); } };
    const scripted = actor.drive(script, { watch: (sight) => seen.push(sight.report) });
    stand.step(); stand.step();
    assert.equal(state.steps, 2, "the script decides once a step, however often the mind asks its orders");
    assert.equal(seen.length, 2, "its instrument reads each step the script decides");
    assert.ok(seen.every((report) => report === scripted.skills.report), "the instrument reads what the mind's skills report");
    assert.equal(scripted, actor.mind, "the mind driven is the actor's own");
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
  assert.deepEqual(labAddress(custom).mind, withoutTuning(SWAP_DEFAULTS), "a whole custom tree still travels unchanged but for the parts its research passes in");
});

/** Option Mind's sword thrust, to widen a bare-hand source's loadouts. */
const SWORD_STRIKES = MINDS.option.config.options.filter((option) => option.kind === "strike-sword-thrust");

test("CLI ablations inherit calibrated bodies and loadouts before scheduling paired cases", () => {
  const evaluation = EVALUATIONS.tournament, panel = "option/workshop-fighter/empty,empty";
  assert.ok(SWORD_STRIKES.length > 0, "Option Mind has a sword blow to widen with");
  for (const [id, changes] of [["swap-stub", ["rate=30"]],
    ["swap-unarmed", [`options=${JSON.stringify([...MINDS["swap-unarmed"].config.options, ...SWORD_STRIKES])}`]]]) {
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
  const id = "swap-skeleton", raw = JSON.stringify(MINDS[id].config), evaluation = EVALUATIONS.tournament;
  assert.deepEqual(resolveSubjects(evaluation, [id]).subjects, evaluation.subjects([id]));
  const custom = resolveSubjects(evaluation, [raw]);
  assert.deepEqual(custom.subjects, evaluation.subjects(custom.choice));
  assert.ok(custom.subjects.some(one => one.value.model !== "crypt-skeleton"), "an unscoped custom config still expands beyond its named calibration");
  // A bare-hand source strikes with its other hand while one holds an item; its punch made the club's blow, it strikes only where a hand holds a club.
  const unarmed = "swap-unarmed", punch = MINDS[unarmed].config.options.findIndex(option => option.kind === "strike-straight-punch");
  const club = MINDS.option.config.options.find(option => option.kind === "strike-club-blow");
  const narrowed = resolveSubjects(evaluation, [], unarmed, [`options.${punch}=${JSON.stringify(club)}`]);
  const baseline = evaluation.subjects([unarmed]), clubbed = (loadout) => loadout.right === "club" || loadout.left === "club";
  assert.ok(baseline.some(one => one.value.loadout.right !== "empty"), "the source can strike with its other hand while holding an item");
  assert.ok(baseline.some(one => !clubbed(one.value.loadout)), "the source plays loadouts with no club, which the change drops");
  assert.deepEqual(narrowed.subjects.map(one => ({ model: one.value.model, loadout: one.value.loadout })),
    baseline.filter(one => clubbed(one.value.loadout)).map(one => ({ model: one.value.model, loadout: one.value.loadout })),
    "an ablation still drops source loadouts the changed config cannot play");
  for (const [evaluation, names] of [[EVALUATIONS.court, []], [EVALUATIONS.crowd, []], [EVALUATIONS.match, ["option"]]]) {
    const resolved = resolveSubjects(evaluation, names, id, ["rate=30"]);
    const expected = evaluation.subjects(resolved.choice);
    expected[0] = { ...expected[0], models: MINDS[id].models };
    assert.deepEqual(resolved.subjects, expected);
    assert.equal(resolved.subjects[0].value.rate, 30);
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
    const resolved = resolveSubjects(evaluation, [], "swap-stub", ["rate=30"]);
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
  for (const id of ["swap-skeleton"]) {
    assert.throws(() => cases(evaluation.subjects([id])), /fits no condition.*named calibration allows/);
    assert.throws(() => cases(resolveSubjects(evaluation, [], id, ["rate=30"]).subjects),
      /fits no condition.*named calibration allows/);
    assert.ok(cases(evaluation.subjects([{ id, label: id, value: MINDS[id].config }])).units.length > 0,
      "an independent configuration still runs on physically compatible bodies");
  }
});

test("a match admits complete pairs within named calibrations and preserves the scope of ablations", () => {
  const evaluation = EVALUATIONS.match;
  const cases = subjects => casesOf(evaluation, "standard", subjects,
    { engine: BOUT_ENGINE, code: () => "match-scope", schedule: { kind: "all" } });
  for (const [id, model] of [["swap-stub", "workshop-fighter"], ["swap-unarmed", "workshop-fighter"]]) {
    const named = evaluation.subjects([id, "option"]), before = JSON.stringify(named);
    const scoped = cases(named), raw = cases(evaluation.subjects([{ id, label: id, value: MINDS[id].config }, "option"]));
    assert.ok(scoped.units.length > 0, "the calibration has complete cases");
    assert.deepEqual(scoped.units, raw.units.filter(unit => unit.every(one => one.world.recipe.left === model && one.world.recipe.right === model)),
      "scope filters complete units without changing their recipes or keys");
    assert.ok(raw.units.some(unit => unit.some(one => one.world.recipe.left !== model)), "the independent configuration exercises wider physical fit");
    assert.equal(JSON.stringify(named), before, "admission preserves its subjects");
  }
  const original = cases(evaluation.subjects(["swap-stub", "option"]));
  const changed = cases(resolveSubjects(evaluation, ["option"], "swap-stub", ["rate=30"]).subjects);
  assert.deepEqual(changed.units.map(unit => unit.map(one => one.condition)), original.units.map(unit => unit.map(one => one.condition)));
  assert.throws(() => cases(evaluation.subjects(["swap-skeleton", "option"])), /fits no condition.*named calibration allows crypt-skeleton/);
  assert.throws(() => cases(resolveSubjects(evaluation, ["option"], "swap-skeleton", ["rate=30"]).subjects), /fits no condition/);
});

test("nested slot faults reach links with their path, another entrant's part however deep makes the tree two entrants', and a part made for another body layer is refused", () => {
  const base = MINDS.option.config, reptile = MINDS["option-reptile"].config, warrior = modelSpec("workshop-fighter"), crawler = modelSpec("reptile");
  const option = STUBS.find(stub => stub.part.defaults.kind === "swap:stub-option").part, objective = STUBS.find(stub => stub.part.defaults.kind === "swap:stub-objective").part;
  for (const [config, faults] of [
    [{ ...base, chooser: { kind: "missing-chooser" } }, ['chooser: no part of kind "missing-chooser"']],
    [{ ...base, chooser: { kind: "shield-guard" } }, ["chooser: a guard part cannot go where a chooser part goes"]],
    [{ ...base, chooser: { ...base.chooser, objective: { kind: "missing-objective" } } }, ['chooser.objective: no part of kind "missing-objective"']],
    [{ ...base, options: {} }, ["options: a list of option parts"]],
    [{ ...base, rate: -1 }, ["rate: a positive number of times a second"]],
  ]) {
    assert.deepEqual(treeFaults(config), faults);
    assert.deepEqual(parseMind(JSON.stringify(config), warrior, FIGHT_ENTRY), { config, faults }, "the screen's link parser returns the faulty configuration and its diagnostic");
  }
  // Another entrant's part, in a list or a slot below a slot, makes the tree two entrants': refused at its root, through a link too.
  const other = { ...base, options: [...base.options, OTHER_OPTION.defaults] }, two = (first, second) => `it names the kinds of ${first} and ${second}: a tree is one entrant's`;
  for (const [config, faults] of [
    [{ ...other, options: [...other.options, option.defaults] }, [two("other", "swap")]],
    [{ ...other, chooser: { kind: "valued", depth: 2, objective: objective.defaults } }, [two("swap", "other")]],
  ]) {
    assert.deepEqual(treeFaults(config), faults);
    assert.deepEqual(parseMind(JSON.stringify(config), warrior, FIGHT_ENTRY), { config, faults });
  }
  // A chooser or an option made for another body layer is refused where it is, through a link too: one of the kit's over the quadruped's frame, and the frame's over the kit.
  for (const [config, spec, faults] of [
    [{ ...reptile, options: [...reptile.options, option.defaults] }, crawler, [`options.${reptile.options.length}: swap:stub-option is made for Option Mind's own kit, not the quadruped frame`]],
    [{ ...base, chooser: reptile.chooser }, warrior, ["chooser: quadruped-valued is made for the quadruped frame, not Option Mind's own kit"]],
  ]) {
    assert.deepEqual(treeFaults(config), faults);
    assert.deepEqual(parseMind(JSON.stringify(config), spec, FIGHT_ENTRY), { config, faults });
  }
});

for (const { part, mind, place } of STUBS) {
  const kind = part.defaults.kind, game = GAME_CONFIGS[mind];
  test(`${kind}: offered in a ${part.role} slot of its own entrant's trees only, and placed in a tree of the toolkit's parts makes it its entrant's`, () => {
    const offered = (tree) => kindsFor(part.role, spec, tree).some((one) => one.kind === kind);
    assert.ok(offered(MINDS[mind].config), "offered where the tree is the swap entrant's");
    assert.ok(!offered(game), "not offered where the tree names the toolkit's kinds alone");
    assert.ok(!offered(MINDS["option-reptile"].config), "not offered where the tree is another entrant's");
    assert.equal(treeScope(place(game)), "swap", "placed, it makes the tree the swap entrant's");
  });
}

test("a body a mind's parts cannot drive refuses the mind for what the first of them lacks, at construction too, every legs for what they stand on, and leaves out a skill it cannot use", async () => {
  const reptile = modelSpec("reptile"), soles = "needs a left and a right foot, each with a box sole";
  const option = MINDS.option.config;
  // What lies under its skills is read first: the legs, which stand on the body's soles.
  assert.equal(treeRefusal(reptile, option), `no locomotion part fits reptile: Move ${soles}`, "a skill the body cannot use refuses nothing; the legs name what they stand on");
  const skills = option.options.filter((one) => one.skill).map((one) => one.skill);
  assert.ok(skills.some((skill) => partOf(skill).role === "executor") && skills.some((skill) => partOf(skill).role === "technique"), "the mind names blows and skills on the ground");
  assert.deepEqual(unusedParts(reptile, option), skills.flatMap((skill) => {
    const refused = partOf(skill).fits(reptile, skill, partLookup);
    return refused === null ? [] : [`${partOf(skill).label}: ${refused}`];
  }), "each skill left out names what it needs");
  assert.ok(unusedParts(reptile, option).some((left) => left.endsWith("to strike with")), "a blow left out names the limb it strikes with");
  const legs = kindsFor("locomotion", reptile);
  assert.ok(legs.length > 0, "the fixture offers legs to refuse");
  for (const { kind, reason } of legs) assert.equal(reason, soles, kind);
  // Built on a body it cannot stand, the command layers' motor refuses it for what its stance lacks.
  const stand = await coreStand(reptile);
  assert.throws(() => commandedBody(stand.built, stand.world, { servoSeconds: .1 }), (error) => error.message === `reptile: the stance ${soles}`);
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
  assert.deepEqual(CRYPT_CLEAR.protocols.alone.faults(subject.value, CRYPT_CLEAR.protocols.alone.conditions[0]), [], "it leads a party, so the Crypt-clearing task takes it");
});

test("a planner keeps clear of a solid as its body's navigator does: the stock one steps out of a column's clearance, the straight stub keeps clear of nothing", async () => {
  const navigating = (navigation) => ({ ...SWAP_DEFAULTS, options: SWAP_DEFAULTS.options.map((option) => option.kind === "walk" ? { ...option, navigation } : option) });
  const game = navigating({ kind: "visibility-navigation" }), straight = navigating(STRAIGHT_NAVIGATION.defaults);
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
  assert.deepEqual([names.world, names.kinds], ["lone", ["swap:option"]]);
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
  const still = { ...SWAP_DEFAULTS, options: SWAP_DEFAULTS.options.filter((option) => !option.kind.includes("strike-")) }, club = { left: "empty", right: "club" }, held = modelHolding("workshop-fighter", club);
  assert.deepEqual([treeFaults(still), treeRefusal(held, still)], [[], null], "fit is what the body can carry out, not what it uses");
  const stand = await coreStand(held);
  const minded = createMind(GAME, stand.built, stand.world, still, { name: "stand", orders: () => STAND_ORDERS });
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
  const minds = { left: SWAP_DEFAULTS, right: SWAP_OPTION_DEFAULTS }, presets = { left: "swap-stub", right: "swap-option" };
  const recipe = { left: "workshop-fighter", right: "workshop-fighter", gap: 3, minds };
  const played = async (hooks, fork) => {
    const { world, duel, dispose } = await buildBout(recipe, { engine: BOUT_ENGINE, hooks });
    try {
      duel.play([]);
      const builts = SIDES.map((side) => duel.duelists[side].built), trace = traceOf(builts), tail = traceOf(builts);
      const run = (until, traces) => { while (duel.steps < until) { world.step(); for (const one of traces) one.take(); } };
      run(FORK, [trace]);
      const saved = fork ? duel.save() : null;
      run(STEPS, [trace, tail]);
      const states = SIDES.map((side) => ({ kind: minds[side].kind, preset: presets[side], mind: saveState(duel.duelists[side].minded.state), body: saveState(duel.duelists[side].minded.body.state) }));
      let resumed = null;
      if (saved) { duel.load(saved); const again = traceOf(builts); run(STEPS, [again]); resumed = again.digest(); }
      return { digest: trace.digest(), tail: tail.digest(), resumed, states, sheets: Object.fromEntries(SIDES.map((side) => [side, duel.duelists[side].sheets])) };
    } finally { dispose(); }
  };
  const first = await played({ record: true }, true);
  for (const state of first.states) for (const { part, read } of STUBS.filter((stub) => stub.mind === state.preset)) {
    const kind = part.defaults.kind, own = read(state.mind, state.body);
    assert.equal(own?.stub, kind, `the ${part.role} the mind runs is its config's stub`);
    assert.ok(own.steps > 0, `the ${kind} stub was asked`);
  }
  for (const state of first.states.filter((state) => state.preset === "swap-stub")) {
    assert.deepEqual(read(STUB_BLOW, state).guard, STUB_POSTURE, "the executor is made with the configured guard's posture, where its blows return");
    // Each ground skill's executor keeps its technique's run (`groundSkills`).
    const runs = state.mind.skills.actions.executors.flatMap((executor) => executor.run ? [executor.run] : []);
    assert.equal(runs.find((run) => run.climb)?.motor.stub, "swap:stub-motor", "the rise's steady is made with the configured motor");
    const motors = runs.filter((run) => run.motor);
    assert.ok(motors.length > 1, "the fixture's rise has a technique with a motor beside its steady");
    for (const [i, run] of motors.entries()) assert.equal(run.motor.stub, "swap:stub-motor", `its run ${i} with a motor is made with the configured motor`);
  }
  assert.equal(first.resumed, first.tail, "the bout forked and resumed is the bout");
  const replay = await played({ replay: first.sheets }, false);
  assert.equal(replay.digest, first.digest, "the replay is the bout");
  for (const side of SIDES) assert.deepEqual(parseMind(writeMind(minds[side]), modelSpec("workshop-fighter"), FIGHT_ENTRY), { config: withoutTuning(minds[side]), faults: [] },
    `${minds[side].kind}'s tree goes through a link unchanged but for the parts its research passes in`);
});

test("each part a quadruped's config names is the one its mind runs, and its bout forks and resumes", async () => {
  const minds = { left: SWAP_QUADRUPED_DEFAULTS, right: MINDS["option-reptile"].config };
  const { world, duel, dispose } = await buildBout({ left: "reptile", right: "reptile", gap: 1, minds }, { engine: BOUT_ENGINE });
  try {
    duel.play([]);
    const builts = SIDES.map((side) => duel.duelists[side].built);
    const run = (until, trace) => { while (duel.steps < until) { world.step(); trace?.take(); } };
    run(FORK);
    const saved = duel.save(), tail = traceOf(builts);
    run(STEPS, tail);
    const body = saveState(duel.duelists.left.minded.body.state);
    for (const { part, read } of STUBS.filter((stub) => stub.mind === "swap-quadruped")) {
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
