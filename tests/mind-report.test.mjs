import test from "node:test";
import assert from "node:assert/strict";
import { createMind } from "../src/core/mind/minds.ts";
import { GAME } from "../src/entrants/game.ts";
import { modelSpec } from "../src/core/models.ts";
import { coreStand } from "./harness/core-stand.mjs";

test("a mind publishes detached report snapshots at its answer, reusing only unchanged data", async () => {
  const stand = await coreStand(modelSpec("workshop-fighter"), { gravity: false, ground: false, mirrored: true, delay: 1 });
  const contacts = { counts: Object.fromEntries(["prepare", "commit", "release"].map(phase => [phase,
    { target: 0, block: 0, incidental: 0, world: 0 }])), loadedInCommit: false, blockedSegments: [], lastTarget: null };
  const action = { id: 1, action: "punch", effector: "hand.right", target: { kind: "point", at: [0, 1, 0] },
    phase: "prepare", stage: "ready", holds: ["hand.right"], observations: [], contacts, aim: null };
  const live = { engagement: null, prospects: [{ foe: "foe", dealt: 0, taken: 0 }], heading: -0,
    gait: null, kit: null, navigation: { request: { kind: "place", points: [{ x: 1, z: 2 }], near: .1, by: "foe" },
      status: "moving", remaining: Infinity, goal: { x: 1, z: 2 }, route: [{ x: 0, z: 0 }, { x: 1, z: 2 }] },
    actions: [action], ended: [], menu: null };
  const navigation = live.navigation;
  live.navigation = Object.defineProperties({}, Object.fromEntries(Object.keys(navigation).map(key =>
    [key, { enumerable: true, get: () => navigation[key] }])));
  const copy = () => {
    const { engagement, menu, gait, kit, ...data } = live;
    return { ...structuredClone(data), gait, kit };
  };
  let change = () => {};
  const catalog = { treeFaults: () => [], treeLookup: () => GAME.partLookup, controllerOf: () => ({
    create(host) { host.take(() => ({ name: "report fixture", step: () => change() })); return { state: { live }, report: live }; },
  }) };
  const mind = createMind(catalog, stand.built, stand.world, { kind: "report fixture" }, { name: "fixture", orders: () => null });
  const read = () => {
    const { report } = mind;
    return { prospects: report.prospects, heading: report.heading, navigation: report.navigation,
      actions: report.actions, ended: report.ended, gait: report.gait, kit: report.kit };
  };
  try {
    const expected = copy(), initial = read();
    assert.deepEqual(initial, expected);
    stand.step();
    const same = read();
    assert.deepEqual(same, expected);
    for (const key of ["prospects", "navigation", "actions", "ended"]) assert.equal(same[key], initial[key], `${key} is unchanged`);

    // The answer precedes the next decision on a delayed mirror: even a first read after that
    // decision must see what was published, not its live mutations.
    change = () => {
      live.prospects[0].dealt = .25;
      live.heading = 0;
      live.navigation.route[1].x = 3;
      delete live.navigation.request.by;
      action.contacts.counts.commit.target++;
      action.target.at[0] = 4;
      action.observations.push({ step: 1, time: 0, phase: "commit", kind: "target", struck: null, by: "hand.right" });
      live.ended.push({ ...structuredClone(action), sequence: 1, began: 0, ended: 1, ending: { kind: "completed" }, committed: true, observed: 1 });
    };
    stand.step();
    change = () => {};
    assert.notDeepEqual(copy(), expected, "the decision changes every mutable report collection");
    assert.deepEqual(read(), expected, "the just-published answer stays detached from the next decision");
    const changed = copy();
    stand.step();
    const published = read();
    assert.deepEqual(published, changed, "the following answer publishes every nested change and removed key");
    assert.equal(published.navigation.route[0], initial.navigation.route[0], "an unchanged route point survives a sibling's change");
    assert.equal(published.actions[0].contacts.counts.prepare, initial.actions[0].contacts.counts.prepare,
      "unchanged contact counts survive a sibling's change");
    assert.deepEqual(initial, expected, "a retained report stays unchanged");

    live.actions.length = 0;
    live.navigation = null;
    live.prospects = null;
    live.ended.length = 0;
    const cleared = copy();
    stand.step();
    assert.deepEqual(read(), cleared, "null fields and emptied arrays replace the previous snapshot");
    assert.deepEqual(initial, expected);
  } finally { mind.body.dispose(); stand.dispose(); }
});
