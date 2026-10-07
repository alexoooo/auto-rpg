import test from "node:test";
import assert from "node:assert/strict";
import { CONTROLLERS, controllerOf } from "../src/core/mind/controllers.ts";
import { BODY_MODELS, modelSpec } from "../src/core/models.ts";
import { CONTROLS, controlsFor } from "../src/arena/matchup.ts";

test("every preset is its controller's kind, under an id no other controller uses", () => {
  const ids = [];
  for (const [kind, controller] of Object.entries(CONTROLLERS)) for (const [id, preset] of Object.entries(controller.presets)) {
    assert.equal(preset.config.kind, kind, id);
    assert.ok(Object.isFrozen(preset.config), id);
    assert.equal(controllerOf(preset.config), controller);
    ids.push(id);
  }
  assert.deepEqual(ids, ["classic", "combat", "brawler", "scrapper", "kicker", "crawl"]);
  assert.deepEqual(Object.keys(CONTROLS), ids);
  assert.throws(() => controllerOf({ kind: "point-fighter" }), /no mind of kind "point-fighter"/);
});

test("each controller says which bodies its presets fit, and the Arena offers just those", () => {
  const humanoid = ["classic", "combat", "brawler", "scrapper", "kicker"];
  for (const model of BODY_MODELS) {
    const spec = modelSpec(model), fitting = [];
    for (const controller of Object.values(CONTROLLERS)) for (const [id, preset] of Object.entries(controller.presets))
      if (controller.fits(spec, preset.config)) fitting.push(id);
    assert.deepEqual(fitting, model === "reptile" ? ["crawl"] : humanoid, model);
    assert.deepEqual(controlsFor(model), fitting, model);
    assert.equal(CONTROLLERS.direct.fits(spec, { kind: "direct", targets: {}, seconds: .1, speed: 1, activation: 1 }), true);
  }
});
