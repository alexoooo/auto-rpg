import test from "node:test";
import assert from "node:assert/strict";
import { kindsFor, partOf, PARTS, treeFaults, treeFits, withoutTuning } from "../src/core/mind/catalog.ts";
import { CLASSIC, QUADRUPED } from "../src/core/mind/config.ts";
import { PRESETS } from "../src/core/mind/controllers.ts";
import { modelSpec } from "../src/core/models.ts";
import { COMBAT, KICKER, withParts } from "./fixtures/minds.mjs";
import { CONFIG_KEYS } from "../src/core/mind/config-keys.ts";
import { STRIDE } from "../src/core/skills/stride.ts";
import { RUN } from "../src/core/skills/run.ts";
import { parseMind, writeMind } from "../src/ui/mind-link.ts";

const ROLES = ["mind", "sub-mind", "tactics", "behaviour", "move-rule", "locomotion", "guard", "executor", "support"];

test("every part has a role, a stage, frozen defaults of its own kind, and every slot's role has parts", () => {
  for (const [kind, part] of Object.entries(PARTS)) {
    assert.ok(ROLES.includes(part.role), kind);
    assert.ok(["game", "experimental"].includes(part.stage), kind);
    assert.equal(part.defaults.kind, kind);
    assert.ok(Object.isFrozen(part.defaults), kind);
    assert.deepEqual(treeFaults(part.defaults, part.needs ? [part.needs] : []), [], kind);
    for (const key of [...part.fields.map(field => field.key), ...part.slots.map(slot => slot.key), ...Object.keys(part.defaults)]) {
      assert.ok(Object.hasOwn(CONFIG_KEYS[kind], key), `${kind}.${key} belongs to the configuration`);
    }
    for (const slot of part.slots) assert.ok(Object.values(PARTS).some((other) => other.role === slot.role), `${kind}.${slot.key}`);
  }
  assert.deepEqual(new Set(Object.keys(PARTS)), new Set(Object.keys(CONFIG_KEYS)));
  assert.equal(partOf(CLASSIC), PARTS.fighter);
  assert.deepEqual(new Set(Object.values(PARTS).map((part) => part.role)), new Set(ROLES));
  for (const kind of ["point-fighter", "constructor", "toString", "staged-rise", "assisted-rise", "dynamic-rise"]) assert.throws(() => partOf({ kind }), /no part of kind/, kind);
});

test("controller settings survive links and validation independently of editor fields", () => {
  const stride = { kind: "stride", ...STRIDE, paced: true, lands: true, launch: .2, lead: .1, momentum: true, lever: .8, lengthen: .1 };
  const run = { kind: "run", ...RUN, drive: .2, lever: .8 };
  for (const locomotion of [stride, run]) {
    const config = { ...CLASSIC, locomotion };
    assert.deepEqual(parseMind(writeMind(config), modelSpec("workshop-fighter")), { config, faults: [] });
    assert.deepEqual(treeFaults({ ...config, locomotion: { ...locomotion, misspelled: true } }),
      [`locomotion: ${PARTS[locomotion.kind].label} has no setting misspelled`]);
  }
  assert.ok(!PARTS.stride.fields.some(field => field.key === "momentum"));
  assert.ok(treeFaults({ ...stride, momentum: "yes" }).length > 0, "hidden settings still validate their values");
  assert.ok(treeFaults({ ...run, lever: -1 }).length > 0);
});

test("a tree's faults say where they are, and every preset has none", () => {
  for (const [id, { config }] of Object.entries(PRESETS)) assert.deepEqual(treeFaults(config), [], id);
  assert.deepEqual(treeFaults({ ...CLASSIC, executors: [CLASSIC] }), ["executors.0: a mind part cannot go where a executor part goes"]);
  assert.deepEqual(treeFaults({ ...CLASSIC, executors: [] }), ["strike: missing executor recipe"]);
  assert.deepEqual(treeFaults({ ...CLASSIC, executors: [], actions: [], tactics: { kind: "stand" } }), []);
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
  assert.deepEqual(treeFaults({ ...standing, support: { kind: "support-fold" } }), ["support: a walk that drives the legs leaves no stance to fold"]);
});

test("a tree fits a body where every part does, and every part of a role is offered with why it cannot go", () => {
  const human = modelSpec("workshop-fighter"), reptile = modelSpec("reptile");
  assert.equal(treeFits(human, CLASSIC), true);
  assert.equal(treeFits(reptile, CLASSIC), false);
  assert.equal(treeFits(reptile, QUADRUPED), true);
  const offered = (role, spec) => kindsFor(role, spec).map(({ kind, reason }) => [kind, reason]);
  assert.deepEqual(offered("mind", human), [["options", null], ["fighter", null], ["quadruped", "does not fit this body"], ["direct", null]]);
  assert.deepEqual(offered("executor", human), [["recipe-strike", null], ["path-strike", null], ["driven-strike", null], ["front-kick", null], ["straight-punch", null], ["combination", null], ["whole-body-strike", null]]);
  assert.deepEqual(offered("tactics", reptile), [["script", "does not fit this body"], ["stand", "does not fit this body"], ["behaviours", "does not fit this body"]]);
  assert.deepEqual(offered("tactics", human), [["script", "this screen gives no script"], ["stand", null], ["behaviours", null]]);
  assert.deepEqual(kindsFor("tactics", human, ["script"]).map(({ reason }) => reason), [null, null, null]);
  assert.deepEqual(offered("sub-mind", human), [["stand-up", null], ["get-away", null], ["ground-fight", null], ["lie", null], ["support-recovery", null], ["research-rise", null]]);
  assert.deepEqual(offered("sub-mind", reptile), [["stand-up", "does not fit this body"], ["get-away", "does not fit this body"], ["ground-fight", "does not fit this body"], ["lie", null], ["support-recovery", "does not fit this body"], ["research-rise", "does not fit this body"]]);
});

test("a tree without its tuning keeps everything else, its slots' parts included", () => {
  assert.deepEqual(withoutTuning({ ...KICKER, executors: KICKER.executors.map(executor => ({ ...executor, tuning: {} })) }), KICKER);
  assert.deepEqual(withoutTuning({ ...KICKER, locomotion: { kind: "stance-walk", tuning: { turnLimit: 1 } } }), { ...KICKER, locomotion: { kind: "stance-walk" } });
  assert.deepEqual(withoutTuning({ ...withParts(CLASSIC, { tactics: { tuning: { edge: { band: 1, patience: 1, clinch: 0 } } } }), subs: [{ kind: "lie", tuning: { x: 1 } }, { kind: "support-recovery" }] }),
    { ...CLASSIC, subs: [{ kind: "lie" }, { kind: "support-recovery" }] });
  assert.deepEqual(withoutTuning({ ...QUADRUPED, tuning: { bite: { open: .1 } } }), QUADRUPED);
});
