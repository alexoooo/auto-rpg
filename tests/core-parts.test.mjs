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
    assert.deepEqual(treeFaults(part.defaults), [], kind);
    for (const slot of part.slots) assert.ok(Object.values(PARTS).some((other) => other.role === slot.role), `${kind}.${slot.key}`);
  }
  assert.deepEqual(Object.keys(PARTS), ["fighter", "quadruped", "direct", "lie", "staged-rise", "support-recovery", "seek", "openings",
    "stance-walk", "cover-guard", "recipe-strike", "path-strike", "front-kick", "support-fold"]);
  assert.equal(partOf(CLASSIC), PARTS.fighter);
  assert.deepEqual(new Set(Object.values(PARTS).map((part) => part.role)), new Set(ROLES));
  for (const kind of ["point-fighter", "constructor", "toString"]) assert.throws(() => partOf({ kind }), /no part of kind/, kind);
});

test("a tree's faults say where they are, and every preset has none", () => {
  for (const [id, { config }] of Object.entries(PRESETS)) assert.deepEqual(treeFaults(config), [], id);
  assert.deepEqual(treeFaults(withParts(COMBAT, { tactics: { hands: "right", combinations: "follow-up" } })), ["tactics: combat combinations require alternate hands"]);
  assert.deepEqual(treeFaults({ ...CLASSIC, blow: null, kick: CLASSIC }), ["blow: a blow part is needed", "kick: a mind part cannot go where a kick part goes"]);
  assert.deepEqual(treeFaults({ ...CLASSIC, subs: [{ kind: "lie" }, CLASSIC, { kind: "fly" }, null] }), [
    "subs.1: a mind part cannot go where a sub-mind part goes", 'subs.2: no part of kind "fly"', "subs.3: no part of kind undefined"]);
  assert.deepEqual(treeFaults({ ...CLASSIC, subs: { kind: "lie" } }), ["subs: a list of sub-mind parts"]);
  assert.deepEqual(treeFaults({ ...CLASSIC, subs: [] }), []);
  assert.deepEqual(treeFaults({ kind: "fly" }), ['no part of kind "fly"']);
});

test("a tree fits a body where every part does, and every part of a role is offered with why it cannot go", () => {
  const human = modelSpec("workshop-fighter"), reptile = modelSpec("reptile");
  assert.equal(treeFits(human, CLASSIC), true);
  assert.equal(treeFits(reptile, CLASSIC), false);
  assert.equal(treeFits(reptile, QUADRUPED), true);
  const offered = (role, spec) => kindsFor(role, spec).map(({ kind, reason }) => [kind, reason]);
  assert.deepEqual(offered("mind", human), [["fighter", null], ["quadruped", "does not fit this body"], ["direct", null]]);
  assert.deepEqual(offered("blow", human), [["recipe-strike", null], ["path-strike", null]]);
  assert.deepEqual(offered("tactics", reptile), [["seek", "does not fit this body"], ["openings", "does not fit this body"]]);
  assert.deepEqual(offered("sub-mind", reptile), [["lie", null], ["staged-rise", "does not fit this body"], ["support-recovery", "does not fit this body"]]);
});

test("a tree without its tuning keeps everything else, its slots' parts included", () => {
  assert.deepEqual(withoutTuning(withParts(KICKER, { locomotion: { tuning: { turnLimit: 1 } }, blow: { tuning: { paths: { returnLimit: .05 } } }, kick: { tuning: { contactSpeed: 2 } } })), KICKER);
  assert.deepEqual(withoutTuning({ ...withParts(CLASSIC, { tactics: { tuning: { edge: { band: 1, patience: 1 } } } }), subs: [{ kind: "lie", tuning: { x: 1 } }, { kind: "staged-rise" }] }),
    { ...CLASSIC, subs: [{ kind: "lie" }, { kind: "staged-rise" }] });
  assert.deepEqual(withoutTuning({ ...QUADRUPED, tuning: { bite: { open: .1 } } }), QUADRUPED);
});
