import test from "node:test";
import assert from "node:assert/strict";
import { allParts, partLookup } from "../src/entrants/game.ts";
import { modelSpec } from "../src/core/models.ts";
import { bodyKey } from "../src/core/spec/body.ts";
import { EXECUTORS } from "../src/core/skills/framework/executors.ts";
import { TECHNIQUES } from "../src/core/recovery/ground/techniques.ts";
import { EVALUATIONS } from "../src/evaluation/evaluations.ts";

/**
 * A skill's settings are its body's record (`SkillRecord`, `src/core/skills/framework/records.ts`)
 * where it reads one (`Part.reads`): a body with none does not use the skill and says so, its
 * executor's fit a returned refusal; a body with one is not refused for want of it. The unrecorded
 * body is the Warrior under another model's name, so nothing but its key differs.
 */
test("every executor that reads a record refuses a body with no record of its skill, and says so", () => {
  const warrior = modelSpec("workshop-fighter"), unrecorded = { ...warrior, model: "unrecorded" };
  const executors = Object.entries(allParts()).filter(([, part]) => part.role === "executor");
  const reached = executors.map(([kind]) => kind);
  assert.ok(Object.keys(EXECUTORS).every((kind) => reached.includes(kind)), `the catalog's executors reached: ${reached.join(", ")}`);
  for (const [kind, part] of executors.filter(([, part]) => part.reads?.(part.defaults).length)) {
    assert.equal(part.fits(warrior, part.defaults, partLookup), null, `${kind} fits the Warrior, which has its record`);
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
