import test from "node:test";
import assert from "node:assert/strict";
import { coreStand } from "./harness/core-stand.mjs";
import { humanSpec } from "../src/core/human/spec.ts";
import { createBody } from "../src/core/body.ts";
import { actionConfigFaults, configuredExecutors, configuredActionEstimates } from "../src/core/mind/action-config.ts";
import { REPERTOIRE, recipesFor } from "../src/core/skills/strikes.ts";

const spec = humanSpec("workshop-fighter");
const executor = { name: "punches", kind: "path-strike", overlap: true };
const action = { name: "jab", executor: "punches", effectors: ["hand.right"], regions: [{ kind: "mark", mark: "high" }], aim: { kind: "centre", lead: 0 }, family: "straight" };

test("recipe estimates retain measured net units and report unavailable heights", () => {
  const recipeAction = { ...action }; delete recipeAction.family;
  const providers = configuredActionEstimates(spec, [{ name: "punches", kind: "recipe-strike" }], [recipeAction]);
  assert.equal(providers.jab.unit, "net");
  const recipe = recipesFor(REPERTOIRE, spec, "right")[0];
  assert.ok(recipe);
  const view = { head: { y: 1 } };
  assert.equal(providers.jab.read(view, { kind: "point", at: [0, 1 + recipe.recipe.place.up, 1] }, "hand.right"), recipe.recipe.net);
  assert.equal(providers.jab.read(view, { kind: "point", at: [0, 100, 1] }, "hand.right"), null);
  assert.deepEqual(configuredActionEstimates(spec, [executor], [action]), {});
});

test("action names, executor references and endpoint capabilities are validated together", () => {
  assert.deepEqual(actionConfigFaults(spec, [executor], [action]), []);
  assert.deepEqual(actionConfigFaults(spec, [executor], [action, action]), ["duplicate or empty action name jab"]);
  assert.deepEqual(actionConfigFaults(spec, [executor], [{ ...action, executor: "missing" }]), ["jab: missing executor missing"]);
  assert.deepEqual(actionConfigFaults(spec, [executor], [{ ...action, effectors: ["foot.left"] }]), ["jab: executor cannot use foot.left"]);
  assert.deepEqual(actionConfigFaults(spec, [{ name: "punches", kind: "recipe-strike" }], [action]), ["jab: settings belong to a path executor"]);
});

test("named sharing creates one executor per name and none by equal settings", async () => {
  const stand = await coreStand(spec), body = createBody(stand.built, stand.world, { servoSeconds: 0.1 });
  try {
    const built = configuredExecutors(body, stand.world, [executor, { ...executor, name: "other" }],
      [action, { ...action, name: "hook", family: "hook" }, { ...action, name: "independent", executor: "other" }]);
    assert.deepEqual(built.map(e => e.name), ["punches", "other"]);
    assert.notEqual(built[0].executor.state, built[1].executor.state);
    assert.deepEqual(built[0].executor.needs("jab", "hand.right"), ["hand.right"]);
    assert.ok(built[0].executor.needs("hook", "hand.right").includes("trunk"));
  } finally { body.dispose(); stand.dispose(); }
});
