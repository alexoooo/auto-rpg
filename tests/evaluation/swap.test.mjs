import "./fixtures/swap/hooks.mjs";
import test from "node:test";
import assert from "node:assert/strict";
const { BOUT_ENGINE } = await import("../../research/bout.mjs");
const { MINDS } = await import("../../src/app/catalog.ts");
const { EVALUATIONS } = await import("../../src/app/node/evaluation.ts");
const { resolveSubjects } = await import("../../scripts/evaluation-subjects.mjs");
const { casesOf } = await import("../../src/evaluation/run.ts");
const { slotsOf } = await import("../../src/evaluation/compare.ts");

/** Sword strikes expose loadout widening when added to a calibrated bare-hand source. */
const SWORD_STRIKES = MINDS.option.config.options.filter(option => option.kind === "strike-sword-thrust");

test("CLI ablations inherit calibrated bodies and loadouts before scheduling paired cases", () => {
  const evaluation = EVALUATIONS.tournament, panel = "option/man/empty,empty";
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
      { engine: BOUT_ENGINE, schedule: { kind: "versus", panel: [panel] } });
    assert.deepEqual(dropped, []);
    const slots = slotsOf(units, counterpart, [panel]);
    assert.deepEqual(new Set(slots.map(slot => slot.subject)), new Set(subjects.map(one => one.id)), "every candidate has a paired baseline");
    assert.deepEqual(new Set(slots.flatMap(slot => [...slot.mine, ...slot.theirs].map(one => one.key))),
      new Set(units.flatMap(unit => unit.map(one => one.key))), "no unpaired work reaches the schedule");
    const withOther = resolveSubjects(evaluation, [panel], id, changes);
    assert.deepEqual(withOther.subjects, [...subjects, ...evaluation.subjects([panel])], "other requested subjects retain their scope");
    if (id === "swap-unarmed") assert.ok(evaluation.subjects([candidate]).some(one => one.value.model === "man"
      && !baseline.some(before => JSON.stringify(before.value.loadout) === JSON.stringify(one.value.loadout))),
    "the fixture also exposes loadout widening on the calibrated body");
  }
});

test("mind batteries admit only a named calibration's bodies and preserve that scope through CLI ablations", () => {
  for (const evaluation of [EVALUATIONS.court, EVALUATIONS.crowd]) {
    const cases = subjects => casesOf(evaluation, evaluation.defaultProtocol, subjects,
      { engine: BOUT_ENGINE, schedule: { kind: "all" } });
    const named = evaluation.subjects(["swap-stub"]), original = JSON.stringify(named);
    const custom = evaluation.subjects([{ id: named[0].id, label: named[0].label, value: named[0].value }]);
    assert.deepEqual(named, [{ ...custom[0], models: ["man"] }]);
    const raw = cases(custom), modelOf = one => one.world.kind === "crypt" ? one.world.crypt.party[0].model : one.condition.model;
    assert.ok(raw.units.length > 0, "the fixture fits the battery's equipment and bodies");
    const allowed = raw.units.filter(unit => modelOf(unit[0]) === "man");
    assert.ok(allowed.length > 0, "the named calibration reaches eligible cases");
    assert.deepEqual(cases(named), {
      units: allowed,
      dropped: raw.units.filter(unit => modelOf(unit[0]) !== "man").map(([one]) => ({
        subjects: one.subjects, condition: one.condition,
        reasons: [`swap-stub: named calibration allows man; ${modelOf(one)} is unavailable`],
      })),
    }, "admission filters cases without changing an eligible recipe or key");
    if (evaluation === EVALUATIONS.court) assert.ok(raw.units.some(unit => modelOf(unit[0]) === "woman"),
      "the equipped fixture exposes calibration leakage independently of physical fit");
    const resolved = resolveSubjects(evaluation, [], "swap-stub", ["rate=30"]);
    assert.deepEqual(resolved.subjects[0].models, named[0].models);
    const independent = cases(evaluation.subjects(resolved.choice));
    assert.deepEqual(cases(resolved.subjects).units, independent.units.filter(unit => modelOf(unit[0]) === "man"),
      "the changed configuration keeps its source's scope before scheduling");
    assert.equal(JSON.stringify(named), original, "admission never changes the subject or its configuration");
    const unavailable = (evaluation === EVALUATIONS.court ? ["man", "woman"] : ["man"])
      .map(model => `named calibration allows no bodies; ${model} is unavailable`).join("; ");
    assert.deepEqual(cases([{ ...named[0], models: [] }]), { refused: `Warrior calibration fits no condition of ${evaluation.id} standard: ${unavailable}` });
  }
  const evaluation = EVALUATIONS.crowd;
  const cases = subjects => casesOf(evaluation, evaluation.defaultProtocol, subjects,
    { engine: BOUT_ENGINE, schedule: { kind: "all" } });
  for (const id of ["swap-skeleton"]) {
    assert.deepEqual(cases(evaluation.subjects([id])), { refused: "Skeleton calibration fits no condition of crowd standard: named calibration allows skeleton; man is unavailable" });
    assert.deepEqual(cases(resolveSubjects(evaluation, [], id, ["rate=30"]).subjects),
      { refused: "Skeleton calibration with rate=30 fits no condition of crowd standard: named calibration allows skeleton; man is unavailable" });
    assert.ok(cases(evaluation.subjects([{ id, label: id, value: MINDS[id].config }])).units.length > 0,
      "an independent configuration still runs on physically compatible bodies");
  }
});

test("a match admits complete pairs within named calibrations and preserves the scope of ablations", () => {
  const evaluation = EVALUATIONS.match;
  const cases = subjects => casesOf(evaluation, "standard", subjects,
    { engine: BOUT_ENGINE, schedule: { kind: "all" } });
  for (const [id, model] of [["swap-stub", "man"], ["swap-unarmed", "man"]]) {
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
  const unavailable = "named calibration allows skeleton; man is unavailable; named calibration allows skeleton; woman is unavailable";
  assert.deepEqual(cases(evaluation.subjects(["swap-skeleton", "option"])), { refused: `Skeleton calibration fits no condition of match standard: ${unavailable}` });
  assert.deepEqual(cases(resolveSubjects(evaluation, ["option"], "swap-skeleton", ["rate=30"]).subjects), { refused: `Skeleton calibration with rate=30 fits no condition of match standard: ${unavailable}` });
});

test("every evaluation's default panel names entrants it has", () => {
  const panels = Object.values(EVALUATIONS).filter((evaluation) => evaluation.analysis?.panel?.length);
  assert.ok(panels.length > 0, "an evaluation has a default panel");
  for (const evaluation of panels) for (const id of evaluation.analysis.panel)
    assert.doesNotThrow(() => evaluation.subjects([id]), `${evaluation.id}'s panel names ${id}`);
});

test("every evaluation protocol and the Node stand play on the game's engine", async () => {
  const { DEFAULT_ENGINE } = await import("../../src/core/physics/engines.ts");
  const protocols = Object.values(EVALUATIONS).flatMap((evaluation) => Object.entries(evaluation.protocols).map(([protocol, cases]) => ({ at: `${evaluation.id}/${protocol}`, engine: cases.engine })));
  assert.ok(protocols.some(({ at }) => at === "rising-target/standard"), "the falls are among the protocols read");
  assert.deepEqual(protocols.filter(({ engine }) => engine !== undefined && engine !== DEFAULT_ENGINE), []);
  if (process.env.CORE_ENGINE === undefined) assert.equal((await import("../harness/core-stand.mjs")).CORE_ENGINE, DEFAULT_ENGINE);
});


test("custom subjects retain execution scope through normalization", async () => {
  const scope = { models: ["man"], character: { strength: 1.1 } };
  const choice = { id: "independent", label: "Independent", value: MINDS.option.config, ...scope };
  for (const name of ["locomotion", "match", "court", "rising-target"]) {
    const [subject] = EVALUATIONS[name].subjects(name === "match" ? [choice, "option"] : [choice]);
    assert.deepEqual({ models: subject.models, character: subject.character }, scope, `${name} retains execution facts`);
  }
  const entrants = EVALUATIONS.tournament.subjects([choice]);
  assert.ok(entrants.length > 0, "the restricted custom mind enters at least one loadout");
  assert.ok(entrants.every(subject => subject.value.model === "man"));
  assert.ok(entrants.every(subject => JSON.stringify(subject.character) === JSON.stringify(scope.character)));
  const [strike] = EVALUATIONS.strike.subjects([{ ...choice, value: { mind: choice.value, skill: "straight-punch" } }]);
  assert.deepEqual({ models: strike.models, character: strike.character }, scope);
});

test("a run's rows refuse incomplete or conflicting cases", async () => {
  const { indexRows } = await import("../../src/evaluation/rows.ts");
  const row = { key: "case", reading: { met: true }, digest: "trace", played: 0, fault: null };
  assert.deepEqual([...indexRows([{ name: "first", rows: [row] }, { name: "again", rows: [row] }])], [["case", row]]);
  for (const field of ["reading", "digest", "fault"]) {
    const partial = { ...row }; delete partial[field];
    assert.throws(() => indexRows([{ name: `missing-${field}`, rows: [partial] }]), /not whole/);
  }
  assert.throws(() => indexRows([{ name: "first", rows: [row] }, { name: "other", rows: [{ ...row, reading: { met: false } }] }]),
    /case case reads differently in first and other/);
});

test("a table cell is valued only on every protocol case with none faulted", async () => {
  const { keep, valueOf } = await import("../../src/evaluation/table/judge.ts");
  const { caseName } = await import("../../src/evaluation/results.ts");
  const conditions = EVALUATIONS.locomotion.protocols.run.conditions.filter(condition => condition.model === "man"
    && condition.loadout.left === "empty" && condition.loadout.right === "empty");
  assert.ok(conditions.some(condition => condition.kind === "run-held") && conditions.some(condition => condition.kind === "run-turn")
    && conditions.some(condition => condition.kind === "run-stop"), "the fixture reaches every run kind");
  const reading = { judge: "orders" }, names = conditions.map(caseName);
  assert.equal(new Set(names).size, names.length, "each condition has a name of its own");
  const trials = conditions.map((condition, k) => ({ at: names[k], kept: keep(reading, { kind: condition.kind, fell: false, lost: 1, downFor: null }), outcome: null }));
  assert.equal(valueOf(reading, [trials[0]], names, 8).value, null, "one trial cannot value the cell");
  assert.equal(valueOf(reading, trials, names, 8).value, 1, "a trial of every case values it");
  const valued = valueOf(reading, [{ ...trials[0], kept: null }, ...trials.slice(1)], names, 8);
  assert.deepEqual({ value: valued.value, trials: valued.trials.size, figures: valued.figures },
    { value: null, trials: trials.length - 1, figures: `${trials.length - 1} of ${trials.length} trials counted, 0 fell, 0 ended down; ${trials.length} of ${trials.length} cases, 1 faulted` });
});


test("Cover requires an attempted attack before untouched can pass", async () => {
  const { readCover } = await import("../../src/evaluation/cover/read.ts");
  const { modelSpec } = await import("../../src/core/bodies/models.ts");
  const spec = modelSpec("man"), world = { time: 0 };
  const attacker = { actions: { kit: [{ action: "punch", regions: [{ kind: "mark", mark: "high" }] }] }, report: { actions: [], ledger: [] } };
  const duel = { blows: [], duelists: { left: { built: { spec }, body: { down: false }, minded: { skills: { report: { guard: { covering: [] } } } } },
    right: { built: { spec }, minded: { skills: attacker } } } };
  const reader = readCover({ world, duel }, { seconds: 8 });
  world.time = 8; reader.afterStep();
  const reading = { outcome: "unreached", attempted: false, touches: { head: 0, guard: 0, body: 0 }, taken: 0, headTaken: 0,
    covering: 0, first: null, blows: 0, shielded: 0, down: false, seconds: 8 };
  assert.deepEqual(reader.reading(), reading);
  assert.equal(EVALUATIONS.cover.outcome(reader.reading()).passed, false);
  attacker.report.actions.push({ action: "punch", target: { kind: "body", id: "left" } });
  reader.afterStep();
  assert.deepEqual(reader.reading(), { ...reading, outcome: "untouched", attempted: true });
  assert.equal(EVALUATIONS.cover.outcome(reader.reading()).passed, true, "an attempted attack can miss a successful cover");
});
