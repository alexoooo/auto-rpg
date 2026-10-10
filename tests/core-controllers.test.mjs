import test from "node:test";
import assert from "node:assert/strict";
import { CONTROLLERS, controllerOf, PRESETS } from "../src/core/mind/controllers.ts";
import { CLASSIC, RECIPE_FIGHTER, SCRAPPER } from "../src/core/mind/config.ts";
import { treeFaults } from "../src/core/mind/catalog.ts";
import { createMind } from "../src/core/mind/minds.ts";
import { BODY_MODELS, modelSpec } from "../src/core/models.ts";
import { CONTROLS, controlsFor } from "../src/arena/matchup.ts";
import { STRAIGHT_PUNCH } from "../src/core/skills/straight-punch.ts";
import { COMBAT, KICKER, withParts } from "./fixtures/minds.mjs";

test("every preset is its controller's kind, under an id no other controller uses", () => {
  const ids = [];
  for (const [kind, controller] of Object.entries(CONTROLLERS)) for (const [id, preset] of Object.entries(controller.presets)) {
    assert.equal(preset.config.kind, kind, id);
    assert.ok(Object.isFrozen(preset.config), id);
    assert.equal(controllerOf(preset.config), controller);
    ids.push(id);
  }
  assert.deepEqual(ids, ["classic", "puncher", "scrapper", "behaviours", "crawl"]);
  assert.deepEqual(Object.keys(CONTROLS), ids);
  assert.throws(() => controllerOf({ kind: "point-fighter" }), /no mind of kind "point-fighter"/);
});

test("each controller says which bodies its presets fit, and the Arena offers just those", () => {
  const humanoid = ["classic", "puncher", "scrapper", "behaviours"];
  for (const model of BODY_MODELS) {
    const spec = modelSpec(model), fitting = [];
    for (const controller of Object.values(CONTROLLERS)) for (const [id, preset] of Object.entries(controller.presets))
      if (controller.fits(spec, preset.config)) fitting.push(id);
    assert.deepEqual(fitting, model === "reptile" ? ["crawl"] : humanoid, model);
    assert.deepEqual(controlsFor(model), fitting, model);
    assert.equal(CONTROLLERS.direct.fits(spec, { kind: "direct", targets: {}, seconds: .1, speed: 1, activation: 1 }), true);
  }
});

test("every preset id reads to its tree: tactics, a skill of each role and the sub-minds", () => {
  const walk = { kind: "stance-walk" }, guard = { kind: "cover-guard" }, seek = { kind: "seek", guard: "pose", aim: "head", range: "close" };
  const openings = { kind: "openings", hands: "alternate", strikes: "linear", prefers: "head", defence: "cover", combinations: "none", spacing: 0, spacingStep: 0 };
  const path = { kind: "path-strike", overlap: false }, recovery = [{ kind: "support-recovery" }];
  const fighter = (tactics, blow, kick, support, subs) => ({ kind: "fighter", tactics, locomotion: walk, guard, blow, kick, support, subs });
  const body = { ...openings, strikes: "mixed", prefers: "body" };
  const rise = [{ kind: "staged-rise" }];
  const behaving = (list) => ({ kind: "behaviours", list: [{ kind: "follow-orders" }, ...list, { kind: "cover", guard: "cover" }] });
  assert.deepEqual(Object.fromEntries(Object.entries(PRESETS).map(([id, { config }]) => [id, config])), {
    classic: fighter(seek, { kind: "recipe-strike" }, null, null, [{ kind: "staged-rise" }]),
    puncher: fighter({ ...seek, range: "edge" }, { kind: "straight-punch", ...STRAIGHT_PUNCH }, null, null, [{ kind: "staged-rise" }]),
    scrapper: fighter(body, path, null, { kind: "support-fold" }, recovery),
    behaviours: fighter(behaving([{ kind: "strike", hands: "alternate", aim: "head", blow: { kind: "recipe-strike" } }]), null, null, null, rise),
    crawl: { kind: "quadruped" },
  });
  assert.deepEqual(RECIPE_FIGHTER, { ...CLASSIC, subs: [{ kind: "lie" }] });
});

test("a tree names what is wrong with it where it is, and no mind is made of one with a fault", () => {
  for (const [id, { config }] of Object.entries(PRESETS)) assert.deepEqual(treeFaults(config), [], id);
  assert.deepEqual(treeFaults(withParts(SCRAPPER, { tactics: { hands: "right", combinations: "follow-up" } })), ["tactics: combat combinations require alternate hands"]);
  assert.deepEqual(treeFaults(withParts(SCRAPPER, { tactics: { combinations: "overlap" } })), ["blow: overlapping combinations need a blow that may begin while the other hand returns"]);
  assert.deepEqual(treeFaults(withParts(SCRAPPER, { tactics: { combinations: "overlap" }, blow: { overlap: true } })), []);
  assert.deepEqual(treeFaults(withParts(KICKER, { kick: { tuning: { swingSeconds: -1 } } })), ["kick: invalid kick settings"]);
  assert.deepEqual(treeFaults(withParts(KICKER, { kick: { tuning: { swingSeconds: .3 } } })), []);
  assert.deepEqual(treeFaults(withParts(COMBAT, { tactics: { spacingStep: -.1 } })), ["tactics: invalid combat range learning settings"]);
  assert.deepEqual(treeFaults(withParts(COMBAT, { locomotion: { tuning: { turnLimit: 0 } } })), ["locomotion: locomotion turn limit must be finite and positive"]);
  assert.match(treeFaults(withParts(COMBAT, { blow: { tuning: { paths: { elbowExtension: 2 } } } }))[0], /^blow: combat path settings/);
  assert.match(treeFaults(withParts(COMBAT, { tactics: { tuning: { openings: { headLateral: 2 } } } }))[0], /^tactics: opening preferences/);
  assert.deepEqual(treeFaults(withParts(CLASSIC, { tactics: { tuning: { edge: { band: -1, patience: 4, clinch: 0 } } } })), ["tactics: the edge needs a finite nonnegative band, patience and clinch"]);
  assert.deepEqual(treeFaults(withParts(CLASSIC, { tactics: { tuning: { edge: { band: .25, patience: 4, clinch: .7 } } } })), []);
  // A skill the tactics never ask of, or a blow that cannot carry out what they ask, is a fault at its slot.
  assert.deepEqual(treeFaults(withParts(CLASSIC, { blow: { kind: "path-strike", overlap: false } })), ["blow: the path strike carries out a blow only along a path, and these tactics name none"]);
  assert.deepEqual(treeFaults(withParts(CLASSIC, { kick: { kind: "front-kick" }, support: { kind: "support-fold" } })), ["kick: these tactics never kick", "support: these tactics never fight from low support"]);
  assert.deepEqual(treeFaults(withParts(COMBAT, { blow: { kind: "recipe-strike" } })), []);
  const faults = (config) => controllerOf(config).faults(config);
  assert.deepEqual(faults({ kind: "direct", targets: {}, seconds: 0, speed: 1, activation: 1 }), ["invalid direct controller gains"]);
  assert.deepEqual(faults({ kind: "direct", targets: {}, seconds: .1, speed: 1, activation: 1 }), []);
  assert.throws(() => createMind(null, null, withParts(COMBAT, { tactics: { hands: "left", combinations: "follow-up" } }), { name: "faulty" }), /tactics: combat combinations require alternate hands/);
  assert.deepEqual(treeFaults(withParts(COMBAT, { tactics: { hands: "left", combinations: "overlap" } })),
    ["blow: overlapping combinations need a blow that may begin while the other hand returns", "tactics: combat combinations require alternate hands"]);
});
