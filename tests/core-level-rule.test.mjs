/**
 * **The rule that sets a body's level** (`levelsOf`, `src/core/rules/levels.ts`): a body with nothing
 * to do and nobody near is held; any other is `full` in the fight and `limp` out of it. Each read on
 * both sides of each of its distances, from each level it may be at.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { levelsOf, stirs } from "../src/core/rules/levels.ts";

/** The rule's distances, the test's own: each pair a line coming and a farther one going. */
const RULE = Object.freeze({ wake: 16, rest: 18, company: 4, clear: 5, settle: 3 });
const E = 0.01;
/** A body for the rule: an enemy in the fight at full, going somewhere, at the origin, unless `over` says. */
const ask = (over) => ({ level: "full", side: "enemy", at: { x: 0, z: 0 }, out: null, waiting: false, ...over });
const at = (x) => ({ x: x * 0.6, z: x * 0.8 });
/** A party member in the fight, going somewhere, `d` m off. */
const foe = (d, over = {}) => ask({ side: "party", at: at(d), ...over });
/** One of the body's own side going somewhere, `d` m off: no foe, so only by reach. */
const walker = (d) => ask({ at: at(d) });

/** A waiting body at `level` beside `other`: the levels of both. */
const beside = (level, other) => levelsOf([ask({ level, waiting: true }), other], RULE);

test("a_waiting_body_is_held_and_let_go_on_both_sides_of_each_distance", () => {
  const rows = {
    "full, a foe inside rest": beside("full", foe(RULE.rest - E)),
    "full, a foe outside rest": beside("full", foe(RULE.rest + E)),
    "full, a walker inside clear": beside("full", walker(RULE.clear - E)),
    "full, a walker outside clear": beside("full", walker(RULE.clear + E)),
    "held, a foe inside wake": beside("held", foe(RULE.wake - E)),
    "held, a foe outside wake": beside("held", foe(RULE.wake + E)),
    "held, a walker inside company": beside("held", walker(RULE.company - E)),
    "held, a walker outside company": beside("held", walker(RULE.company + E)),
    // Between the two lines a body stays as it is.
    "full, a foe between wake and rest": beside("full", foe((RULE.wake + RULE.rest) / 2)),
    "held, a foe between wake and rest": beside("held", foe((RULE.wake + RULE.rest) / 2)),
    "full, a walker between company and clear": beside("full", walker((RULE.company + RULE.clear) / 2)),
    "held, a walker between company and clear": beside("held", walker((RULE.company + RULE.clear) / 2)),
  };
  assert.deepEqual(rows, {
    "full, a foe inside rest": ["full", "full"],
    "full, a foe outside rest": ["held", "full"],
    "full, a walker inside clear": ["full", "full"],
    "full, a walker outside clear": ["held", "full"],
    "held, a foe inside wake": ["full", "full"],
    "held, a foe outside wake": ["held", "full"],
    "held, a walker inside company": ["full", "full"],
    "held, a walker outside company": ["held", "full"],
    "full, a foe between wake and rest": ["full", "full"],
    "held, a foe between wake and rest": ["held", "full"],
    "full, a walker between company and clear": ["full", "full"],
    "held, a walker between company and clear": ["held", "full"],
  });
  // Two waiting side by side with nobody near are both held.
  assert.deepEqual(levelsOf([ask({ waiting: true }), ask({ waiting: true, at: at(1) })], RULE), ["held", "held"]);
});

test("a_body_with_something_to_do_is_full_wherever_it_is", () => {
  const far = foe(1000, { waiting: true });
  assert.deepEqual([levelsOf([ask({})], RULE), levelsOf([ask({}), far], RULE), levelsOf([ask({ level: "held" }), far], RULE)],
    [["full"], ["full", "held"], ["full", "held"]]);
});

test("a_body_out_lies_loose_until_it_has_settled_and_nobody_walks_near", () => {
  /** A body out for `out` s at `level` beside `others`: its level. */
  const dead = (level, out, ...others) => levelsOf([ask({ level, out }), ...others], RULE)[0];
  const settled = RULE.settle + E;
  const rows = {
    "limp, out just under settle": dead("limp", RULE.settle - E),
    "limp, out just over settle": dead("limp", settled),
    "held, out just under settle": dead("held", RULE.settle - E),
    "limp, a walker inside clear": dead("limp", settled, walker(RULE.clear - E)),
    "limp, a walker outside clear": dead("limp", settled, walker(RULE.clear + E)),
    "held, a walker inside company": dead("held", settled, walker(RULE.company - E)),
    "held, a walker outside company": dead("held", settled, walker(RULE.company + E)),
    "limp, a foe that waits a metre off": dead("limp", settled, foe(1, { waiting: true })),
    "limp, a foe going somewhere a metre off": dead("limp", settled, foe(1)),
  };
  assert.deepEqual(rows, {
    "limp, out just under settle": "limp",
    "limp, out just over settle": "held",
    "held, out just under settle": "limp",
    "limp, a walker inside clear": "limp",
    "limp, a walker outside clear": "held",
    "held, a walker inside company": "limp",
    "held, a walker outside company": "held",
    "limp, a foe that waits a metre off": "held",
    "limp, a foe going somewhere a metre off": "limp",
  });
});

test("a_waiting_body_is_no_company", () => {
  const held = ask({ level: "held", waiting: true });
  assert.deepEqual([levelsOf([held, ask({ waiting: true, at: at(1) })], RULE), levelsOf([held, ask({ at: at(1) })], RULE)],
    [["held", "held"], ["full", "full"]]);
});

test("stirs_is_the_rule_s_own_letting_go", () => {
  const others = [foe(RULE.wake - E), foe(RULE.wake + E), walker(RULE.company - E), walker(RULE.company + E), foe(RULE.rest - E), walker(RULE.clear - E)];
  const read = others.map((other) => [stirs({ x: 0, z: 0 }, "enemy", [other], RULE), beside("held", other)[0] !== "held"]);
  assert.deepEqual(read.map(([stirred]) => stirred), [true, false, true, false, false, false]);
  assert.deepEqual(read.map(([stirred]) => stirred), read.map(([, letGo]) => letGo));
});
