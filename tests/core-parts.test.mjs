import test from "node:test";
import assert from "node:assert/strict";
import { kindsFor, partOf, PARTS, treeFaults, treeFits, withoutTuning } from "../src/core/mind/catalog.ts";
import { CLASSIC, COMBAT, KICKER, QUADRUPED } from "../src/core/mind/config.ts";
import { PRESETS } from "../src/core/mind/controllers.ts";
import { modelSpec } from "../src/core/models.ts";
import { withParts } from "./fixtures/minds.mjs";

const ROLES = ["mind", "sub-mind", "tactics", "locomotion", "guard", "blow", "kick", "support"];

test("every part has a role, a stage, frozen defaults of its own kind, and every slot's role has parts", () => {
  for (const [kind, part] of Object.entries(PARTS)) {
    assert.ok(ROLES.includes(part.role), kind);
    assert.ok(["game", "experimental"].includes(part.stage), kind);
    assert.equal(part.defaults.kind, kind);
    assert.ok(Object.isFrozen(part.defaults), kind);
    assert.deepEqual(treeFaults(part.defaults, part.needs ? [part.needs] : []), [], kind);
    for (const slot of part.slots) assert.ok(Object.values(PARTS).some((other) => other.role === slot.role), `${kind}.${slot.key}`);
  }
  assert.deepEqual(Object.keys(PARTS), ["fighter", "quadruped", "direct", "lie", "staged-rise", "support-recovery", "seek", "openings", "script", "stand",
    "stance-walk", "cover-guard", "recipe-strike", "path-strike", "driven-strike", "whole-body-strike", "choose-blow", "front-kick", "support-fold"]);
  assert.equal(partOf(CLASSIC), PARTS.fighter);
  assert.deepEqual(new Set(Object.values(PARTS).map((part) => part.role)), new Set(ROLES));
  for (const kind of ["point-fighter", "constructor", "toString"]) assert.throws(() => partOf({ kind }), /no part of kind/, kind);
});

test("a tree's faults say where they are, and every preset has none", () => {
  for (const [id, { config }] of Object.entries(PRESETS)) assert.deepEqual(treeFaults(config), [], id);
  assert.deepEqual(treeFaults(withParts(COMBAT, { tactics: { hands: "right", combinations: "follow-up" } })), ["tactics: combat combinations require alternate hands"]);
  assert.deepEqual(treeFaults({ ...CLASSIC, blow: null, kick: CLASSIC }), ["kick: a mind part cannot go where a kick part goes"]);
  assert.deepEqual(treeFaults({ ...CLASSIC, blow: null }), ["blow: these tactics throw blows, and the fighter has none"]);
  assert.deepEqual(treeFaults({ ...CLASSIC, blow: null, tactics: { kind: "stand" } }), []);
  assert.deepEqual(treeFaults({ ...CLASSIC, subs: [{ kind: "lie" }, CLASSIC, { kind: "fly" }, null] }), [
    "subs.1: a mind part cannot go where a sub-mind part goes", 'subs.2: no part of kind "fly"', "subs.3: no part of kind undefined"]);
  assert.deepEqual(treeFaults({ ...CLASSIC, subs: { kind: "lie" } }), ["subs: a list of sub-mind parts"]);
  assert.deepEqual(treeFaults({ ...CLASSIC, subs: [] }), []);
  assert.deepEqual(treeFaults({ kind: "fly" }), ['no part of kind "fly"']);
});

test("a part that needs what a screen gives is a fault where the screen gives none, and only there", () => {
  assert.deepEqual(Object.entries(PARTS).filter(([, part]) => part.needs).map(([kind, part]) => [kind, part.needs]), [["script", "script"]]);
  const scripted = withParts(CLASSIC, { tactics: { kind: "script" } }), standing = withParts(CLASSIC, { tactics: { kind: "stand" } });
  assert.deepEqual(treeFaults(scripted), ["tactics: this screen gives no script"]);
  assert.deepEqual(treeFaults(scripted, ["script"]), []);
  assert.deepEqual(treeFaults(standing), []);
  // The screen's fault stands with the part's own, where the part is in the tree.
  assert.deepEqual(treeFaults({ ...scripted, kick: { kind: "front-kick" } }), ["kick: these tactics never kick", "tactics: this screen gives no script"]);
  assert.deepEqual(treeFaults({ ...standing, support: { kind: "support-fold" } }), ["support: these tactics never fight from low support"]);
});

test("a tree fits a body where every part does, and every part of a role is offered with why it cannot go", () => {
  const human = modelSpec("workshop-fighter"), reptile = modelSpec("reptile");
  assert.equal(treeFits(human, CLASSIC), true);
  assert.equal(treeFits(reptile, CLASSIC), false);
  assert.equal(treeFits(reptile, QUADRUPED), true);
  const offered = (role, spec) => kindsFor(role, spec).map(({ kind, reason }) => [kind, reason]);
  assert.deepEqual(offered("mind", human), [["fighter", null], ["quadruped", "does not fit this body"], ["direct", null]]);
  assert.deepEqual(offered("blow", human), [["recipe-strike", null], ["path-strike", null], ["driven-strike", null], ["whole-body-strike", null], ["choose-blow", null]]);
  assert.deepEqual(offered("tactics", reptile), [["seek", "does not fit this body"], ["openings", "does not fit this body"], ["script", "does not fit this body"], ["stand", "does not fit this body"]]);
  // Every tactics part is offered on every screen; the script only where the screen gives one.
  assert.deepEqual(offered("tactics", human), [["seek", null], ["openings", null], ["script", "this screen gives no script"], ["stand", null]]);
  assert.deepEqual(kindsFor("tactics", human, ["script"]).map(({ reason }) => reason), [null, null, null, null]);
  assert.deepEqual(offered("sub-mind", reptile), [["lie", null], ["staged-rise", "does not fit this body"], ["support-recovery", "does not fit this body"]]);
});

test("a tree without its tuning keeps everything else, its slots' parts included", () => {
  assert.deepEqual(withoutTuning(withParts(KICKER, { locomotion: { tuning: { turnLimit: 1 } }, blow: { tuning: { paths: { returnLimit: .05 } } }, kick: { tuning: { contactSpeed: 2 } } })), KICKER);
  assert.deepEqual(withoutTuning({ ...withParts(CLASSIC, { tactics: { tuning: { edge: { band: 1, patience: 1 } } } }), subs: [{ kind: "lie", tuning: { x: 1 } }, { kind: "staged-rise" }] }),
    { ...CLASSIC, subs: [{ kind: "lie" }, { kind: "staged-rise" }] });
  assert.deepEqual(withoutTuning({ ...QUADRUPED, tuning: { bite: { open: .1 } } }), QUADRUPED);
});
