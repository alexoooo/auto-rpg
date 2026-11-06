import test from "node:test";
import assert from "node:assert/strict";
import { applicationContext } from "../src/app/context.ts";
import { createMatchup } from "../src/game/arena/matchup.ts";
import { mindLinks } from "../src/minds/config-link.ts";
import { modelSpec } from "../src/core/bodies/models.ts";
import { dataOf } from "../src/core/data/store.ts";

test("Arena setup loads compatibility data before offering Option Mind", async () => {
  const context = applicationContext("setup-test"), { catalog } = context;
  const { readControls, linkedMind } = createMatchup(context), { mindFaults } = mindLinks(catalog);
  assert.throws(() => dataOf("stomp"), /mind data "stomp" is not loaded/);
  await catalog.loadFitData();
  const search = "?control=option&matchup=workshop-fighter,workshop-rogue";
  assert.deepEqual(readControls(search), { left: "option", right: "option" });
  for (const [side, model] of [["left", "workshop-fighter"], ["right", "workshop-rogue"]]) {
    const mind = linkedMind(search, side), spec = modelSpec(model);
    assert.deepEqual(mind, { config: catalog.minds.option.config, faults: [] });
    assert.deepEqual(mindFaults(mind.config, spec), []);
    assert.equal(catalog.kindsFor("executor", spec, mind.config).find(part => part.kind === "stomp").reason, null);
  }
  const reptile = modelSpec("reptile"), config = catalog.minds.option.config;
  assert.equal(catalog.kindsFor("aim", reptile, config).find(part => part.kind === "first-exposed").reason, null);
  assert.equal(catalog.kindsFor("executor", reptile, config).find(part => part.kind === "jaw-bite").reason, null);
  assert.throws(() => dataOf("straight-punch"), /mind data "straight-punch" is not loaded/);
});
