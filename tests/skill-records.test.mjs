import "./harness/preload-data.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { allParts, partLookup } from "../src/entrants/game.ts";
import { BODY_MODELS, modelHolding, modelSpec } from "../src/core/models.ts";
import { bodyKey } from "../src/core/spec/body.ts";
import { EXECUTORS } from "../src/core/skills/framework/executors.ts";
import { TECHNIQUES } from "../src/core/recovery/ground/techniques.ts";
import { EVALUATIONS } from "../src/evaluation/evaluations.ts";
import { stepUpRecipe, stepUpTuning, validSitBack } from "../src/core/recovery/ground/step-up.ts";
import { SIT_BACK } from "../src/core/recovery/rise/stages.ts";
import { coreStand } from "./harness/core-stand.mjs";
import { fallStart } from "../src/evaluation/fall.ts";
import { commandedBody } from "../src/core/mind/host.ts";
import { kitOf } from "../src/core/mind/kit.ts";
import { groundReading } from "../src/core/control/ground-reading.ts";
import { techniqueTrial } from "../src/evaluation/rising.ts";

/**
 * A skill's settings are its body's record (`SkillRecord`, `src/core/skills/framework/records.ts`)
 * where it reads one (`Part.reads`): a body with none does not use the skill and says so, its
 * executor's fit a returned refusal; a body with one is not refused for want of it. Each executor
 * is read on a body it fits and on that body under another model's name, so nothing but its key
 * differs.
 */
test("every executor that reads a record refuses a body with no record of its skill, and says so", () => {
  const executors = Object.entries(allParts()).filter(([, part]) => part.role === "executor");
  const reached = executors.map(([kind]) => kind);
  assert.ok(Object.keys(EXECUTORS).every((kind) => reached.includes(kind)), `the catalog's executors reached: ${reached.join(", ")}`);
  const recorded = executors.filter(([, part]) => part.reads?.(part.defaults).length);
  assert.ok(recorded.length > 1, `executors that read a record: ${recorded.map(([kind]) => kind).join(", ")}`);
  for (const [kind, part] of recorded) {
    const spec = BODY_MODELS.map((model) => modelSpec(model)).find((one) => part.fits(one, part.defaults, partLookup) === null);
    assert.ok(spec, `${kind} fits a body with its record`);
    const unrecorded = { ...spec, model: "unrecorded" };
    assert.match(part.fits(unrecorded, part.defaults, partLookup) ?? "", new RegExp(`not tuned for ${bodyKey(unrecorded).replace("+", "\\+")}`),
      `${kind} refuses a body with no record of it`);
  }
});

/**
 * Step up's route is timed by its body's records (`assets/core/step-up.json`, `sit-back.json`): a
 * body with no step-up record is refused the staged techniques, and one with no sit-back record
 * the sit-back's, each refusal naming the record it lacks; the bodies with records are not.
 */
test("a body with no step-up or sit-back record is refused the techniques that read them", () => {
  const warrior = modelSpec("workshop-fighter"), unrecorded = { ...warrior, model: "unrecorded" };
  const lacks = { "staged-roll": "step up", "staged-down": "step up", "sit-back": "sit-back", "front-sit-back": "sit-back" };
  for (const [kind, record] of Object.entries(lacks)) {
    const part = TECHNIQUES[kind];
    for (const model of ["workshop-fighter", "workshop-rogue", "crypt-skeleton"]) assert.equal(part.fits(modelSpec(model), part.defaults, partLookup), null, `${kind} fits the ${model}, which has its records`);
    assert.equal(part.fits(unrecorded, part.defaults, partLookup), `the ${record} is not tuned for ${bodyKey(unrecorded)}`, `${kind} refuses a body with no ${record} record`);
  }
});

test("recovery experiments override a body's stage pose without changing its record or recipe", () => {
  const spec = modelSpec("workshop-fighter"), base = stepUpTuning(spec), saved = structuredClone(base);
  const tuning = { ...base, stages: { ...base.stages, plant: { scale: .8, posture: { "knee.left flexion": 2 } } } };
  const config = { kind: "front-sit-back", tuning };
  assert.deepEqual(TECHNIQUES[config.kind].faults(config, partLookup), []);
  const stage = stepUpRecipe(tuning, SIT_BACK).rise.find(s => s.name === "plant"), original = SIT_BACK.rise.find(s => s.name === "plant");
  assert.deepEqual(stage, { ...original, seconds: original.seconds * .8, posture: { ...original.posture, "knee.left flexion": 2 } });
  assert.deepEqual(stepUpTuning(spec), saved);
  assert.equal(stepUpRecipe(tuning, SIT_BACK), stepUpRecipe(tuning, SIT_BACK));
  for (const value of [NaN, Infinity, "2"]) {
    const stages = { plant: { scale: 1, posture: { "knee.left flexion": value } } };
    assert.equal(validSitBack({ stages }), false);
    assert.deepEqual(TECHNIQUES[config.kind].faults({ ...config, tuning: { ...base, stages } }, partLookup), ["tuning: invalid step-up settings"]);
  }
});

test("a recovery loadout variant has its own cached settings and leaves the empty body's settings intact", () => {
  const empty = modelSpec("workshop-fighter"), armed = modelHolding("workshop-fighter", { left: "empty", right: "sword" });
  const first = stepUpTuning(empty), saved = structuredClone(first), loaded = stepUpTuning(armed);
  assert.notDeepEqual(loaded, first, "the sword's record uses its own recovery motion");
  assert.equal(stepUpTuning(armed), loaded);
  assert.equal(stepUpTuning(empty), first);
  assert.deepEqual(first, saved);
});

test("a recovery record supplies joint following without changing the base recipe", () => {
  const base = stepUpTuning(modelSpec("workshop-fighter")), before = structuredClone(stepUpRecipe(base));
  const follow = { channels: ["elbow.left flexion"], past: { "knee.left flexion": 2 }, span: .5 };
  const tuning = { ...base, stages: { ...base.stages, prop: { ...base.stages.prop, follow } } };
  assert.deepEqual(TECHNIQUES["front-sit-back"].faults({ kind: "front-sit-back", tuning }, partLookup), []);
  assert.deepEqual(stepUpRecipe(tuning, SIT_BACK).rise.find(s => s.name === "prop").follow, follow);
  assert.deepEqual(stepUpRecipe(base), before);
  for (const invalid of [{ ...follow, span: 0 }, { ...follow, span: Infinity }, { ...follow, channels: [] },
    { ...follow, channels: [1] }, { ...follow, past: {} }, { ...follow, past: { "knee.left flexion": NaN } }]) {
    const bad = { ...base, stages: { prop: { scale: 1, follow: invalid } } };
    assert.deepEqual(TECHNIQUES["front-sit-back"].faults({ kind: "front-sit-back", tuning: bad }, partLookup), ["tuning: invalid step-up settings"]);
  }
});

test("a recovery record selects loaded held support without changing the base recipe", () => {
  const base = stepUpTuning(modelSpec("workshop-fighter")), tuning = { ...base, heldSupport: "loaded" };
  assert.deepEqual(TECHNIQUES["front-sit-back"].faults({ kind: "front-sit-back", tuning }, partLookup), []);
  assert.equal(stepUpRecipe(tuning).heldSupport, "loaded");
  assert.equal(stepUpRecipe(tuning, SIT_BACK).heldSupport, "loaded");
  assert.equal(stepUpRecipe(base).heldSupport, undefined);
  for (const heldSupport of [true, "any", ""]) assert.deepEqual(
    TECHNIQUES["front-sit-back"].faults({ kind: "front-sit-back", tuning: { ...base, heldSupport } }, partLookup),
    ["tuning: invalid step-up settings"]);
});

test("momentum-aware side entries preserve the back roll and recipes without side rolls", () => {
  const base = stepUpTuning(modelHolding("workshop-fighter", { left: "buckler", right: "sword" }));
  const tuning = { ...base, sideSwing: "momentum" }, before = stepUpRecipe(base), after = stepUpRecipe(tuning);
  assert.deepEqual(after.roll.back, before.roll.back);
  for (const side of ["left", "right"]) {
    assert.equal(after.roll[side][0].name, "swing");
    assert.equal(after.roll[side][0].coast, true);
    assert.deepEqual(after.roll[side].slice(1), before.roll[side]);
    assert.ok(Object.isFrozen(after.roll[side]));
  }
  assert.deepEqual(stepUpRecipe(tuning, SIT_BACK).roll, stepUpRecipe(base, SIT_BACK).roll);
  assert.deepEqual(TECHNIQUES["staged-roll"].faults({ kind: "staged-roll", tuning }, partLookup), []);
  assert.deepEqual(TECHNIQUES["staged-roll"].faults({ kind: "staged-roll", tuning: { ...tuning, sideSwing: "always" } }, partLookup), ["tuning: invalid step-up settings"]);
});

test("a roll admitted by a previous side reading hands over when already on its front", async () => {
  const { spec, placement } = fallStart({ model: "workshop-fighter", seed: 1, start: "placed", posture: "front", mind: { kind: "option", chooser: { kind: "tree" } } });
  assert.ok(!("refused" in placement), "the front placement reaches the roll's already-complete case");
  const stand = await coreStand(spec, placement);
  let run;
  const body = commandedBody(stand.built, stand.world, {}, [(own, view, clock) => {
    run = TECHNIQUES["staged-roll"].make(own, view, clock, kitOf(partLookup, spec), { kind: "staged-roll" });
    return { name: "roll fixture", state: {}, wants: () => false, begin() {}, end() {}, step() {} };
  }]);
  try {
    const reader = groundReading(stand.built, stand.world.dt);
    let g;
    for (let i = 0; i < 360; i++) {
      stand.world.step(); g = reader.read();
      if (run.reached(g, "front")) break;
    }
    assert.equal(run.reached(g, "front"), true, `the placed body is physically at the roll's exit: ${JSON.stringify({ position: g.position, raw: g.raw, lie: g.lie, speed: g.velocity.length(), spin: g.spin, height: g.height })}`);
    assert.equal(run.admits({ ...g, raw: "left", position: "left" }, "left"), true, "a lagging posture reading admits the roll");
    run.begin("left");
    let end = null;
    for (let i = 0; i < 24 && end === null; i++) end = run.step(g, body.view.senses, stand.world.dt);
    assert.equal(end, "done");
  } finally { body.dispose(); stand.dispose(); }
});

test("a lagging ground label never admits a staged ground action on a standing body", async () => {
  const spec = modelSpec("workshop-fighter"), stand = await coreStand(spec);
  const runs = {};
  const previous = { "staged-roll": "back", "staged-down": "front", "front-sit-back": "front", "sit-back": "fours" };
  const body = commandedBody(stand.built, stand.world, {}, [(own, view, clock) => {
    for (const kind of Object.keys(previous)) runs[kind] = TECHNIQUES[kind].make(own, view, clock, kitOf(partLookup, spec), { kind });
    return { name: "standing admission", state: {}, wants: () => false, begin() {}, end() {}, step() {} };
  }]);
  try {
    const reader = groundReading(stand.built, stand.world.dt), speed = stepUpTuning(spec).settle.speed;
    let g;
    for (let i = 0; i < 120; i++) {
      stand.world.step(); g = reader.read();
      if (g.position === "standing" && g.raw === "standing" && g.velocity.length() < speed && g.spin < 2) break;
    }
    assert.ok(g.position === "standing" && g.raw === "standing" && g.velocity.length() < speed && g.spin < 2,
      "the fixture must stand slowly enough that only its posture can refuse the actions");
    assert.deepEqual(Object.fromEntries(Object.entries(runs).map(([kind, run]) => [kind, run.admits({ ...g, position: previous[kind] }, "left")])),
      { "staged-roll": false, "staged-down": false, "front-sit-back": false, "sit-back": false });
  } finally { body.dispose(); stand.dispose(); }
});

test("staged down hands the next skill the hands-and-knees posture its edge promises", async () => {
  const r = await techniqueTrial({ model: "workshop-fighter", held: "empty", seed: 1, start: "placed", posture: "front", technique: "staged-down" });
  assert.equal(r.candidateBegun, true, "placed-front seed 1 must begin staged down before its exit is checked");
  assert.deepEqual({ end: r.end, reached: r.reached, destination: r.destination }, { end: "done", reached: true, destination: "fours" });
});

/**
 * A default panel is a fixed list of a mind's entrants, and which entrants a mind has is its
 * bodies' records: every evaluation's panel names subjects it has, so a record dropped or not kept
 * cannot leave a panel naming a body that no longer strikes.
 */
test("every evaluation's default panel names entrants it has", () => {
  const panels = Object.values(EVALUATIONS).filter((evaluation) => evaluation.analysis?.panel?.length);
  assert.ok(panels.length > 0, "an evaluation has a default panel");
  for (const evaluation of panels) for (const id of evaluation.analysis.panel)
    assert.doesNotThrow(() => evaluation.subjects([id]), `${evaluation.id}'s panel names ${id}`);
});
