import test from "node:test";
import assert from "node:assert/strict";
import { CONTROLLERS, controllerOf, PRESETS } from "../src/core/mind/controllers.ts";
import { ARENA_KICKS, BODY_OPENINGS, BRAWLER, CLASSIC, COMBAT, KICKER, SCRAPPER } from "../src/core/mind/config.ts";
import { resolvePath } from "../src/core/mind/path-fighter.ts";
import { ATTACK_PATH } from "../src/core/skills/attack-path.ts";
import { createMind } from "../src/core/mind/minds.ts";
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

test("a controller names what is wrong with a config, and no mind is made of one with a fault", () => {
  for (const [id, { config }] of Object.entries(PRESETS)) assert.deepEqual(controllerOf(config).faults(config), [], id);
  const faults = (config) => controllerOf(config).faults(config);
  assert.deepEqual(faults({ ...SCRAPPER, hands: "right", combinations: "follow-up" }), ["combat combinations require alternate hands"]);
  assert.deepEqual(faults({ ...SCRAPPER, hands: "alternate", combinations: "overlap" }), []);
  assert.deepEqual(faults({ ...SCRAPPER, tuning: { kick: { swingSeconds: .3 } } }), ["kick settings need a fighter that kicks"]);
  assert.deepEqual(faults({ ...KICKER, tuning: { kick: { swingSeconds: -1 } } }), ["invalid kick settings"]);
  assert.deepEqual(faults({ ...COMBAT, spacingStep: -.1 }), ["invalid combat range learning settings"]);
  assert.deepEqual(faults({ ...COMBAT, tuning: { turnLimit: 0 } }), ["locomotion turn limit must be finite and positive"]);
  assert.match(faults({ ...COMBAT, tuning: { paths: { elbowExtension: 2 } } })[0], /^combat path settings/);
  assert.match(faults({ ...COMBAT, tuning: { openings: { headLateral: 2 } } })[0], /^opening preferences/);
  assert.deepEqual(faults({ ...CLASSIC, tuning: { edge: { band: -1, patience: 4 } } }), ["the edge needs a finite nonnegative band and patience"]);
  assert.deepEqual(faults({ ...CLASSIC, tuning: { edge: { band: .25, patience: 4 } } }), []);
  assert.deepEqual(faults({ kind: "direct", targets: {}, seconds: 0, speed: 1, activation: 1 }), ["invalid direct controller gains"]);
  assert.deepEqual(faults({ kind: "direct", targets: {}, seconds: .1, speed: 1, activation: 1 }), []);
  assert.throws(() => createMind(null, null, { ...COMBAT, hands: "left", combinations: "overlap" }, { name: "faulty" }), /combat combinations require alternate hands/);
});

test("a path fighter's settings are merged once, each over its default", () => {
  const combat = resolvePath(COMBAT), kicker = resolvePath(KICKER);
  assert.ok(Object.isFrozen(combat) && Object.isFrozen(combat.paths));
  assert.deepEqual(combat, { paths: ATTACK_PATH, openings: undefined, kick: null, execution: undefined, turnLimit: undefined, turnStartup: undefined });
  assert.deepEqual(resolvePath(BRAWLER).openings, BODY_OPENINGS);
  assert.deepEqual(resolvePath({ ...BRAWLER, tuning: { openings: { head: 1 } } }).openings, { ...BODY_OPENINGS, head: 1 });
  assert.deepEqual(kicker.kick, ARENA_KICKS);
  assert.deepEqual(resolvePath({ ...KICKER, tuning: { kick: { contactSpeed: 2 }, paths: { returnLimit: .05 }, turnLimit: 1 } }),
    { ...kicker, kick: { ...ARENA_KICKS, contactSpeed: 2 }, paths: { ...ATTACK_PATH, returnLimit: .05 }, turnLimit: 1 });
});
