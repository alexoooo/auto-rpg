import test from "node:test";
import assert from "node:assert/strict";
import { CONTROLLERS, controllerOf, MINDS, PRESETS } from "../src/core/mind/controllers.ts";
import { CLASSIC, RECIPE_FIGHTER, SCRAPPER, STAND_UP } from "../src/core/mind/config.ts";
import { treeFaults, treeFits } from "../src/core/mind/catalog.ts";
import { armedActions, strikesWithAll } from "../src/core/mind/action-config.ts";
import { armedWith, heldBy, HELD } from "../src/core/items/held.ts";
import { createMind } from "../src/core/mind/minds.ts";
import { BODY_MODELS, modelSpec } from "../src/core/models.ts";
import { CONTROLS, controlsFor } from "../src/arena/matchup.ts";
import { STRAIGHT_PUNCH } from "../src/core/skills/straight-punch.ts";
import { COMBAT, withParts } from "./fixtures/minds.mjs";

/** The game's own presets, in the order they are offered: an entrant's mind adds to them, after. */
const GAME = ["options", "classic", "puncher", "counter", "scrapper", "behaviours", "crawl"];

test("every preset is its controller's kind, under an id no other controller uses", () => {
  const ids = [];
  for (const [kind, controller] of Object.entries(CONTROLLERS)) for (const [id, preset] of Object.entries(controller.presets)) {
    assert.equal(preset.config.kind, kind, id);
    assert.ok(Object.isFrozen(preset.config), id);
    assert.equal(controllerOf(preset.config), controller);
    ids.push(id);
  }
  assert.deepEqual(ids.slice(0, GAME.length), GAME);
  assert.equal(new Set(ids).size, ids.length, "an id twice");
  assert.deepEqual(Object.keys(PRESETS), ids);
  assert.throws(() => controllerOf({ kind: "point-fighter" }), /no mind of kind "point-fighter"/);
});

test("a person may pick every preset and every mind that has none, under its kind with its defaults", () => {
  const unpreset = Object.entries(CONTROLLERS).filter(([, controller]) => Object.keys(controller.presets).length === 0);
  assert.ok(unpreset.some(([kind]) => kind === "direct"), "the joint-feedback mind has no preset");
  assert.deepEqual(Object.keys(MINDS), [...Object.keys(PRESETS), ...unpreset.map(([kind]) => kind)]);
  for (const [kind, controller] of unpreset) assert.deepEqual(MINDS[kind], { label: controller.label, config: controller.defaults }, kind);
  assert.deepEqual(Object.keys(CONTROLS), Object.keys(MINDS));
  for (const [id, { config }] of Object.entries(MINDS)) assert.deepEqual(treeFaults(config), [], id);
});

test("each controller says which bodies and loadouts its minds fit, and the Arena offers just those", () => {
  const humanoid = GAME.slice(0, -1);
  for (const model of BODY_MODELS) {
    const spec = modelSpec(model), fitting = [];
    for (const controller of Object.values(CONTROLLERS)) for (const [id, preset] of Object.entries(controller.presets))
      if (controller.fits(spec, preset.config) && GAME.includes(id)) fitting.push(id);
    assert.deepEqual(fitting, model === "reptile" ? ["crawl"] : humanoid, model);
    assert.ok(controlsFor(model, "empty").includes("direct"), model);
    for (const held of HELD) {
      // What the hand holds is on the body every part's `fits` reads, so a mind made for one loadout is offered with no other.
      const holds = model !== "reptile" || held === "empty";
      const body = holds ? armedWith(spec, "right", held) : null;
      assert.deepEqual(controlsFor(model, held), body ? Object.keys(MINDS).filter((id) => treeFits(body, MINDS[id].config)) : [], `${model} holding ${held}`);
      if (body) assert.equal(heldBy(body, "right"), held);
    }
  }
});

test("a mind fits a loadout it strikes with, and throws only the blows its armed body can: a punch with a hand that holds nothing", () => {
  const minds = ["options", "classic", "puncher", "counter", "scrapper", "behaviours"];
  for (const model of BODY_MODELS.filter((model) => model !== "reptile")) {
    const club = armedWith(modelSpec(model), "right", "club");
    assert.deepEqual(minds.map((id) => [id, treeFits(modelSpec(model), MINDS[id].config), treeFits(club, MINDS[id].config)]), [
      ["options", true, true], ["classic", true, true], ["puncher", true, false], ["counter", true, false], ["scrapper", true, true], ["behaviours", true, true]], model);
  }
  const { executors, actions } = MINDS.options.config, bare = modelSpec("workshop-fighter");
  assert.deepEqual(armedActions(bare, executors, actions), actions, "an empty-handed body throws every blow as it is");
  // The club in the right hand: its punch is the left's, its one-two (a drive of each hand) is not thrown, its swung blow is either hand's.
  assert.deepEqual(armedActions(armedWith(bare, "right", "club"), executors, actions).map((action) => [action.name, action.effectors]),
    [["strike", ["hand.left"]], ["downward", ["hand.right", "hand.left"]]]);
  // In the left, the Puncher's punch is the right's, and it still has none with the club.
  const puncher = MINDS.puncher.config, left = armedWith(bare, "left", "club");
  assert.deepEqual(armedActions(left, puncher.executors, puncher.actions).map((action) => action.effectors), [["hand.right"]]);
  assert.equal(strikesWithAll(left, puncher.executors, puncher.actions), false);
  assert.equal(strikesWithAll(left, [], []), true, "a mind of no blows asks nothing of what its body holds");
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
