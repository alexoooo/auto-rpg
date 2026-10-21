import test from "node:test";
import assert from "node:assert/strict";
import { actionFeed, damageReadout, partLabel } from "../src/arena/fighter-readout.ts";
import { BODY_MODELS, modelSpec } from "../src/core/models.ts";
import { createPool } from "../src/core/rules/pool.ts";
import { rulebook } from "../src/core/rules/rulebook.ts";
import { actionInstances } from "../src/core/skills/action-instances.ts";
import { actionResources } from "../src/core/skills/action-resources.ts";

const body = { has: "command", level: "full" };
const rules = rulebook("arena");

test("every selectable body's diagram names each real damage pool part once", () => {
  for (const model of BODY_MODELS) {
    const spec = modelSpec(model), pool = createPool(spec, rules), damage = damageReadout(spec, pool);
    damage.sample(0);
    assert.deepEqual(damage.parts.map(part => part.name), spec.segments.map(part => part.name), model);
    assert.equal(new Set(damage.parts.map(part => part.path)).size, spec.segments.length, model);
    assert.ok(damage.parts.every(part => part.path && part.label && part.remaining === 1 && part.attached && part.flashUntil < 0), model);
  }
  assert.equal(partLabel("upperArm.left"), "Left upper arm");
  assert.equal(partLabel("shank.right"), "Right shin");
});

test("damage colouring reads local health, depleted attached parts and severed descendants", () => {
  const spec = modelSpec("workshop-fighter"), pool = createPool(spec, rules), damage = damageReadout(spec, pool);
  const part = name => damage.parts.find(part => part.name === name);
  damage.sample(0);
  pool.wound({ part: "forearm.left", damage: pool.max("forearm.left") / 4, clean: false });
  damage.sample(1);
  assert.equal(part("forearm.left").remaining, pool.hp("forearm.left") / pool.max("forearm.left"));
  assert.equal(Math.round(part("forearm.left").remaining * 100), 75);
  assert.equal(part("forearm.left").attached, true);
  assert.equal(part("forearm.left").flashUntil, 1.6);
  assert.equal(part("hand.left").remaining, 1);
  damage.sample(1.7);
  assert.equal(part("forearm.left").flashUntil, 1.6, "a steady wound does not restart the flash");
  pool.wound({ part: "middleTrunk", damage: pool.max("middleTrunk"), clean: false });
  damage.sample(2);
  assert.deepEqual([part("middleTrunk").remaining, part("middleTrunk").attached], [0, true]);
  const wound = pool.wound({ part: "upperArm.left", damage: pool.max("upperArm.left"), clean: true });
  assert.deepEqual(wound.severed, ["upperArm.left", "forearm.left", "hand.left"]);
  damage.sample(3);
  assert.deepEqual(wound.severed.map(name => [part(name).attached, part(name).flashUntil]), [[false, 3.6], [false, 3.6], [false, 3.6]]);
  assert.equal(part("hand.left").remaining, 1, "detached health is not mistaken for an attached healthy hand");
  assert.equal(part("hand.right").attached, true);
});

/** A finite public executor supplies real admission, contact attribution and terminal records. */
function runtime() {
  const endpoints = ["hand.left", "hand.right"].map(segment => ({ segment, point: "tip", points: {}, channels: [segment] }));
  const resources = actionResources(endpoints.map(endpoint => endpoint.segment), endpoints, []);
  const live = [];
  const executor = {
    state: { live }, needs: (_name, effector) => [effector], readiness: () => ({ kind: "ready" }),
    start(_view, request) { live.push({ ...request, phase: "prepare", withdrawn: false }); },
    update(_view, requests) {
      const changes = [];
      for (let i = live.length - 1; i >= 0; i--) {
        const item = live[i]; item.withdrawn ||= !requests.some(request => request.id === item.id);
        if (item.phase === "release") { changes.push({ id: item.id, ending: { kind: item.withdrawn ? "cancelled" : "completed" } }); live.splice(i, 1); }
        else { item.phase = item.withdrawn || item.phase === "commit" ? "release" : "commit"; changes.push({ id: item.id, phase: item.phase, stage: item.phase, holds: [item.effector] }); }
      }
      return changes;
    },
    command: () => ({}), resume() { live.length = 0; },
  };
  const set = actionInstances([{ name: "motion", executor }], [{ name: "Custom jab", executor: "motion", effectors: endpoints.map(endpoint => endpoint.segment) }], resources);
  const report = { get actions() { return set.live; }, get ledger() { return set.ledger; } };
  const request = (effector = "hand.right") => ({ id: set.instance(), action: "Custom jab", effector, target: { kind: "point", at: [0, 1, 1], body: "foe" } });
  const step = (time, requests) => set.step({ time, senses: { others: [] } }, requests, { heading: 0, placed: true, support: null, walk: null, lower: 0 }, 1 / 120);
  return { set, report, request, step };
}

test("the feed updates simultaneous admitted actions in place and excludes refused requests", () => {
  const f = runtime(), feed = actionFeed(), right = f.request(), left = f.request("hand.left"), refused = f.request();
  f.step(0, [right, left, refused]); feed.sample(f.report, body, 0);
  assert.deepEqual(feed.read(0).map(entry => [entry.key, entry.label, entry.detail]), [
    ["action:2", "Custom jab · Left hand", "Preparing"], ["action:1", "Custom jab · Right hand", "Preparing"],
  ]);
  assert.equal(f.set.ledger[0].ending.kind, "refused", "the fixture reaches a refused request");
  f.step(1, [right, left]); f.set.snapshot();
  f.set.observe(1, 1, [
    { effector: right.effector, target: { kind: "body", body: "foe", segment: "head", guard: false }, loaded: true, onset: true },
    { effector: left.effector, target: { kind: "body", body: "foe", segment: "forearm", guard: true }, loaded: true, onset: true },
  ]);
  feed.sample(f.report, body, 1);
  assert.deepEqual(feed.read(1).map(entry => entry.detail), ["Executing", "Executing"]);
  f.step(2, [right, left]); feed.sample(f.report, body, 2);
  assert.deepEqual(feed.read(2).map(entry => entry.detail), ["Recovering", "Recovering"]);
  f.step(3, [right, left]); feed.sample(f.report, body, 3); feed.sample(f.report, body, 3);
  assert.deepEqual(feed.read(3).map(entry => [entry.key, entry.detail, entry.active]), [["action:2", "Blocked", false], ["action:1", "Contact", false]]);
  const catchUp = actionFeed(); catchUp.sample(f.report, body, 3);
  assert.deepEqual(new Set(catchUp.read(3).map(entry => entry.detail)), new Set(["Contact", "Blocked"]), "terminal records recover actions completed between rendered frames");
});

test("short actions survive step sampling and their completed rows fade on the supplied fight clock", () => {
  const f = runtime(), feed = actionFeed(), ask = f.request();
  f.step(0, [ask]); feed.sample(f.report, body, 0);
  assert.equal(feed.read(20)[0].opacity, 1, "an active action does not expire");
  for (let step = 1; step <= 3; step++) { f.step(step / 120, [ask]); feed.sample(f.report, body, step / 120); }
  const ended = 3 / 120;
  assert.equal(feed.read(ended)[0].detail, "Missed");
  assert.equal(feed.read(ended + 4)[0].opacity, 1);
  const frozen = feed.read(ended + 5);
  assert.equal(frozen[0].opacity, .5);
  assert.deepEqual(feed.read(ended + 5), frozen, "pause and verdict can hold the same display clock");
  assert.deepEqual(feed.read(ended + 6), []);
  feed.sample(f.report, body, ended + 7);
  assert.deepEqual(feed.read(ended + 7), [], "retained terminal records do not resurrect expired rows");
  feed.reset();
  assert.deepEqual(feed.read(0), []);
});

test("behaviour changes debounce and recovery ownership replaces stale host reports", () => {
  const feed = actionFeed(), report = { actions: [], ledger: [], engagement: { phase: "guard" } };
  feed.sample(report, body, 0); feed.sample(report, body, .2);
  assert.deepEqual(feed.read(.2), []);
  report.engagement.phase = "approach";
  feed.sample(report, body, .25); feed.sample(report, body, .56);
  assert.deepEqual(feed.read(.56).map(entry => entry.label), ["Approaching"]);
  report.engagement.phase = "guard";
  feed.sample(report, body, .6); feed.sample(report, body, .91);
  feed.sample(report, { has: "stand-up", level: "full" }, .95);
  feed.sample(report, { has: "stand-up", level: "full" }, 1.26);
  assert.deepEqual(feed.read(1.26).map(entry => entry.label), ["Getting up", "Guarding", "Approaching"]);
  report.engagement.phase = "attack";
  feed.sample(report, body, 1.3); feed.sample(report, body, 2);
  assert.equal(feed.read(2).length, 3, "generic attack phases do not duplicate named actions");
  feed.sample(report, { has: "nobody", level: "idle" }, 2.1); feed.sample(report, { has: "nobody", level: "idle" }, 3);
  assert.equal(feed.read(3).length, 3);
  for (let i = 0; i < 7; i++) {
    report.engagement.phase = `Named option ${i}`;
    feed.sample(report, body, 3.1 + i * .4); feed.sample(report, body, 3.41 + i * .4);
  }
  assert.deepEqual(feed.read(5.81).map(entry => entry.label), [6, 5, 4, 3, 2].map(i => `Named option ${i}`));
  feed.reset(); feed.sample(undefined, body, 0);
  assert.deepEqual(feed.read(0), [], "a body without reports supplies no invented action entries");
});

test("cancelled preparation and an interrupted commitment retain their real terminal labels", () => {
  const f = runtime(), feed = actionFeed(), ask = f.request();
  f.step(0, [ask]); feed.sample(f.report, body, 0);
  f.step(1, []); f.step(2, []); feed.sample(f.report, body, 2);
  assert.equal(feed.read(2)[0].detail, "Cancelled");
  const next = f.request(); f.step(3, [next]); f.step(4, [next]);
  f.set.interrupt({ time: 4 }, "takeover"); feed.sample(f.report, body, 4);
  assert.equal(feed.read(4)[0].detail, "Interrupted");
});
