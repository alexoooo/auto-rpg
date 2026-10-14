import test from "node:test";
import assert from "node:assert/strict";
import { humanoidSpec } from "../src/core/human/spec.ts";
import { RISE, stageFaults } from "../src/core/mind/rise/stages.ts";
import { STEP_UP, stepUpRecipe } from "../src/core/mind/ground/step-up.ts";
import { TECHNIQUES } from "../src/core/mind/ground/techniques.ts";
import { risingTrial } from "../research/rising-trial.mjs";

test("step up plays RISE's stages in order, each timed and completed as its model's tuning says", () => {
  const shape = stages => stages.map(stage => [stage.kind, stage.name]);
  for (const [model, tuning] of Object.entries(STEP_UP)) {
    const recipe = stepUpRecipe(tuning);
    assert.deepEqual(shape(recipe.rise), shape(RISE.rise));
    for (const lie of ["back", "left", "right"]) assert.deepEqual(shape(recipe.roll[lie]), shape(RISE.roll[lie]));
    recipe.rise.forEach((stage, k) => {
      const timing = tuning.stages[stage.name];
      assert.equal(stage.seconds, RISE.rise[k].seconds * timing.scale, stage.name);
      if (stage.kind === "bear") assert.deepEqual(stage.progress, timing.progress, stage.name);
    });
    recipe.roll.back.forEach((stage, k) => assert.equal(stage.seconds, RISE.roll.back[k].seconds * tuning.stages[`roll ${stage.name}`].scale));
    assert.deepEqual(recipe.progress, { settleSpeed: tuning.settle.speed, settleSeconds: tuning.settle.seconds });
    assert.deepEqual(stageFaults(recipe, humanoidSpec(model)), [], model);
  }
  assert.deepEqual(Object.keys(STEP_UP).sort(), ["crypt-skeleton", "workshop-fighter", "workshop-rogue"]);
});

test("a bearing stage's own completion must be finite and positive", () => {
  const warrior = STEP_UP["workshop-fighter"], stages = { ...warrior.stages, fours: { scale: 1, progress: { speed: 0, near: Number.NaN } } };
  const faults = stageFaults(stepUpRecipe({ ...warrior, stages }), humanoidSpec("workshop-fighter"));
  assert.deepEqual(faults, ["fours's progress speed must be finite and positive", "fours's progress near must be finite and positive"]);
});

test("step up is the game's, offered from every way a body lies, kneels or sits, and leads with the left foot", () => {
  const spec = TECHNIQUES["step-up"];
  assert.equal(spec.stage, "game");
  assert.deepEqual(spec.sides, ["left"]);
  assert.deepEqual(spec.edges.map(edge => edge.from).sort(), ["back", "between", "fours", "front", "half-kneel", "kneeling", "left", "right", "sitting"]);
  assert.ok(spec.edges.every(edge => edge.to === "standing"));
});

test("a Warrior placed half kneeling joins the route there and stands, at Balance 0, within 4.5 s", async () => {
  const r = await risingTrial({ id: 0, model: "workshop-fighter", held: "empty", seed: 2, start: "placed", posture: "half-kneel",
    sub: "stand-up", techniques: ["step-up"], balance: 0, cap: 6 });
  assert.deepEqual([r.status, r.handBackReason], ["stood", "ready"]);
  assert.ok(r.handback <= 4.5, `handed back at ${r.handback} s`);
  assert.deepEqual(r.attempts.map(a => [a.technique, a.end]), [["step-up", "done"], ["steady", "ready"]]);
  // Joined at its half kneel: it never lay slack to read its lie, nor rolled.
  assert.deepEqual(Object.keys(r.phases).sort(), ["execute", "idle", "rise", "steady"]);
  assert.ok(r.phases.idle <= .25 + 1e-9, `waited ${r.phases.idle} s for its reading`);
  assert.deepEqual(r.assist, { forcePeak: 0, momentPeak: 0, forceImpulse: 0, momentImpulse: 0 });
});
