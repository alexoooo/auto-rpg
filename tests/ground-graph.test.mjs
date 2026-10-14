import test from "node:test";
import assert from "node:assert/strict";
import { choose, graphWork, reachable } from "../src/core/mind/ground/graph.ts";

const technique = (edges, admits = () => true, sides = ["left", "right"]) => ({ edges: edges.map(([from, to]) => ({ from, to })), admits, sides });
const registry = {
  plant: technique([["front", "standing"]]),
  roll: technique([["back", "front"]]),
  reverse: technique([["front", "back"]]),
  sit: technique([["back", "sitting"]]),
  post: technique([["sitting", "standing"]]),
  whole: technique([["back", "standing"]]),
};
const failedPlant = ["left", "right"].map(side => ({ technique: "plant", side, from: "front", count: 2 }));
const reading = (position, side = null) => ({ position, side });
const step = (technique, from, to, side = "left") => ({ technique, side, from, to });

test("player order, not route length, chooses the first admitted recovery", () => {
  const work = graphWork();
  assert.deepEqual(choose(["sit", "whole", "post"], reading("back"), registry, [], [], work),
    [step("sit", "back", "sitting"), step("post", "sitting", "standing")]);
  assert.deepEqual(choose(["whole", "sit", "post"], reading("back"), registry, [], [], work), [step("whole", "back", "standing")]);
});

test("live admission and reading side take precedence over a technique's rank and side declaration", () => {
  const techniques = { ...registry, whole: technique([["back", "standing"]], () => false) };
  assert.deepEqual(choose(["whole", "sit", "post"], reading("back", "right"), techniques, [], [], graphWork()),
    [step("sit", "back", "sitting", "right"), step("post", "sitting", "standing")]);
  techniques.sit = technique([["back", "sitting"]], (_, side) => side === "left", ["right", "left"]);
  assert.equal(choose(["sit", "post"], reading("back", "right"), techniques, [], [], graphWork())[0].side, "left");
});

test("a failed front rise takes the back detour and retains its purpose at the next choice", () => {
  const order = ["plant", "roll", "reverse", "sit", "post"], work = graphWork();
  const route = choose(order, reading("front"), registry, failedPlant, [], work);
  assert.deepEqual(route, [step("reverse", "front", "back"), step("sit", "back", "sitting"), step("post", "sitting", "standing")]);
  assert.deepEqual(choose(order, reading("back"), registry, [], route.slice(1), work), route.slice(1));
  assert.equal(choose(["plant", "roll", "reverse"], reading("front"), registry, failedPlant, [], work), null);
});

test("failed-out sides belong to their technique and settled starting position only", () => {
  const failures = [{ technique: "whole", side: "left", from: "back", count: 2 },
    { technique: "whole", side: "right", from: "front", count: 2 }, { technique: "sit", side: "right", from: "back", count: 2 }];
  assert.deepEqual(choose(["whole"], reading("back", "left"), registry, failures, [], graphWork()), [step("whole", "back", "standing", "right")]);
  failures.push({ technique: "whole", side: "right", from: "back", count: 2 });
  assert.equal(choose(["whole"], reading("back"), registry, failures, [], graphWork()), null);
});

test("a future edge failed on every side rules out its route without asking its live admission", () => {
  const techniques = { ...registry, post: technique([["sitting", "standing"]], () => { throw new Error("future body is unknown"); }) };
  assert.equal(choose(["sit", "post", "whole"], reading("back"), techniques, [], [], graphWork())[0].technique, "sit");
  const failures = ["left", "right"].map(side => ({ technique: "post", side, from: "sitting", count: 2 }));
  assert.deepEqual(choose(["sit", "post", "whole"], reading("back"), techniques, failures, [], graphWork()), [step("whole", "back", "standing")]);
});

test("a stale route, an inadmissible next edge or a changed config starts a fresh search", () => {
  const intention = [step("sit", "back", "sitting"), step("post", "sitting", "standing")], work = graphWork();
  assert.deepEqual(choose(["plant", "sit", "post"], reading("front"), registry, [], intention, work), [step("plant", "front", "standing")]);
  const techniques = { ...registry, sit: technique([["back", "sitting"]], () => false) };
  assert.deepEqual(choose(["sit", "post", "whole"], reading("back"), techniques, [], intention, work), [step("whole", "back", "standing")]);
  assert.deepEqual(choose(["whole"], reading("back"), registry, [], intention, work), [step("whole", "back", "standing")]);
});

test("reachability rejects dead ends and cycles independently for back and front", () => {
  const work = graphWork();
  assert.equal(reachable(["plant"], "front", registry, work), true);
  assert.equal(reachable(["plant"], "back", registry, work), false);
  assert.equal(reachable(["roll", "reverse"], "back", registry, work), false);
  assert.equal(reachable(["roll", "plant"], "back", registry, work), true);
  assert.equal(reachable([], "standing", registry, work), true);
});

test("choice reads inputs without changing readings, failures, order or retained route", () => {
  const order = Object.freeze(["sit", "post"]), current = Object.freeze(reading("back"));
  const route = Object.freeze([Object.freeze(step("sit", "back", "sitting")), Object.freeze(step("post", "sitting", "standing"))]);
  const failures = Object.freeze([Object.freeze({ technique: "sit", side: "left", from: "back", count: 1 })]);
  assert.deepEqual(choose(order, current, registry, failures, route, graphWork()), route);
  assert.equal(choose(order, reading("standing"), registry, failures, [], graphWork()), null);
});
