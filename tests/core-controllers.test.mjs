import test from "node:test";
import assert from "node:assert/strict";
import { CONTROLLERS, controllerOf, PRESETS } from "../src/core/mind/controllers.ts";
import { CLASSIC, RECIPE_FIGHTER, SCRAPPER, STAND_UP } from "../src/core/mind/config.ts";
import { treeFaults } from "../src/core/mind/catalog.ts";
import { createMind } from "../src/core/mind/minds.ts";
import { BODY_MODELS, modelSpec } from "../src/core/models.ts";
import { CONTROLS, controlsFor } from "../src/arena/matchup.ts";
import { STRAIGHT_PUNCH } from "../src/core/skills/straight-punch.ts";
import { COMBAT, withParts } from "./fixtures/minds.mjs";

test("every preset is its controller's kind, under an id no other controller uses", () => {
  const ids = [];
  for (const [kind, controller] of Object.entries(CONTROLLERS)) for (const [id, preset] of Object.entries(controller.presets)) {
    assert.equal(preset.config.kind, kind, id);
    assert.ok(Object.isFrozen(preset.config), id);
    assert.equal(controllerOf(preset.config), controller);
    ids.push(id);
  }
  assert.deepEqual(ids, ["classic", "puncher", "counter", "scrapper", "behaviours", "options", "crawl"]);
  assert.deepEqual(Object.keys(CONTROLS), ids);
  assert.throws(() => controllerOf({ kind: "point-fighter" }), /no mind of kind "point-fighter"/);
});

test("each controller says which bodies its presets fit, and the Arena offers just those", () => {
  const humanoid = ["classic", "puncher", "counter", "scrapper", "behaviours", "options"];
  for (const model of BODY_MODELS) {
    const spec = modelSpec(model), fitting = [];
    for (const controller of Object.values(CONTROLLERS)) for (const [id, preset] of Object.entries(controller.presets))
      if (controller.fits(spec, preset.config)) fitting.push(id);
    assert.deepEqual(fitting, model === "reptile" ? ["crawl"] : humanoid, model);
    assert.deepEqual(controlsFor(model), fitting, model);
    assert.equal(CONTROLLERS.direct.fits(spec, { kind: "direct", targets: {}, seconds: .1, speed: 1, activation: 1 }), true);
  }
});

test("presets bind actions to explicitly named execution state", () => {
  for (const [id, { config }] of Object.entries(CONTROLLERS.fighter.presets)) {
    assert.equal(config.tactics.kind, "behaviours", id);
    assert.deepEqual(config.subs, [STAND_UP], id);
    assert.equal(Object.hasOwn(config, "blow"), false);
    assert.equal(Object.hasOwn(config, "kick"), false);
    for (const action of config.actions) assert.equal(config.executors.filter(executor => executor.name === action.executor).length, 1, action.name);
  }
  assert.deepEqual(RECIPE_FIGHTER, { ...CLASSIC, locomotion: { kind: "stance-walk" }, subs: [{ kind: "lie" }] });
  assert.deepEqual(PRESETS.puncher.config.executors, [{ name: "punch", kind: "straight-punch", ...STRAIGHT_PUNCH }]);
  assert.equal(SCRAPPER.actions.find(action => action.family === "downward").lower, .5);
  assert.deepEqual(SCRAPPER.support, { kind: "support-fold" });
});

test("invalid names and executor settings are rejected before making a mind", () => {
  const replace = (config, patch) => ({ ...config, executors: config.executors.map((executor, i) => i ? executor : { ...executor, ...patch }) });
  for (const [id, { config }] of Object.entries(PRESETS)) assert.deepEqual(treeFaults(config), [], id);
  assert.deepEqual(treeFaults({ ...CLASSIC, executors: [] }), ["strike: missing executor recipe"]);
  assert.deepEqual(treeFaults({ ...CLASSIC, executors: [...CLASSIC.executors, ...CLASSIC.executors] }), ["executors need distinct nonempty names"]);
  assert.deepEqual(treeFaults(replace(CLASSIC, { reach: 1 })), ["executors.0: Recipe strike has no setting reach"]);
  assert.match(treeFaults(replace(COMBAT, { tuning: { paths: { elbowExtension: 2 } } }))[0], /invalid path settings/);
  assert.deepEqual(treeFaults({ ...COMBAT, locomotion: { kind: "stance-walk", tuning: { turnLimit: 0 } } }), ["locomotion: locomotion turn limit must be finite and positive"]);
  assert.deepEqual(treeFaults(withParts(SCRAPPER, { locomotion: { tuning: { turnLimit: 1 } } })), ["locomotion: Move has no setting tuning"]);
  assert.deepEqual(treeFaults({ ...SCRAPPER, locomotion: { kind: "stance-walk", tuning: { turnLimt: 1 } } }), ["locomotion: Walk in the stance has no tuning turnLimt"]);
  assert.deepEqual(treeFaults({ ...CLASSIC, tactics: { ...CLASSIC.tactics, choose: { kind: "rules", rethink: .1, patience: 1, rules: [], otherwise: ["missing"] } } }), ["selector: no action missing"]);
  assert.throws(() => createMind(null, null, { ...CLASSIC, executors: [] }, { name: "faulty" }), /missing executor recipe/);
  assert.deepEqual(CONTROLLERS.direct.faults({ kind: "direct", targets: {}, seconds: 0, speed: 1, activation: 1 }), ["invalid direct controller gains"]);
});
