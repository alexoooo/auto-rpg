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

test("every evaluation's default panel names entrants it has", () => {
  const panels = Object.values(EVALUATIONS).filter((evaluation) => evaluation.analysis?.panel?.length);
  assert.ok(panels.length > 0, "an evaluation has a default panel");
  for (const evaluation of panels) for (const id of evaluation.analysis.panel)
    assert.doesNotThrow(() => evaluation.subjects([id]), `${evaluation.id}'s panel names ${id}`);
});
