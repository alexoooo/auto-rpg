import test from "node:test";
import assert from "node:assert/strict";
import { actionInstances, landed, blocked, cleanMiss } from "../src/core/skills/action-instances.ts";
import { actionResources } from "../src/core/skills/action-resources.ts";
import { saveState, loadState } from "../src/core/state.ts";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { effectorFeedback } from "../src/core/control/effector-feedback.ts";
import { buildBody } from "../src/core/build/build-body.ts";
import { sourced } from "../src/core/spec/quantity.ts";
import { coreStand, saveStand, loadStand } from "./harness/core-stand.mjs";
import { traceOf } from "./harness/trace.mjs";
import { lone } from "./fixtures/lone.mjs";

const around = { heading: 0, placed: true, support: null, walk: null, lower: 0 };
const point = { kind: "point", at: [0, 1, 1], body: "foe" };
const endpoints = ["hand.left", "hand.right", "foot.left", "foot.right"].map(segment => ({ segment, point: "tip", points: {}, channels: [`${segment} joint`] }));
const resources = actionResources(["spine", ...endpoints.flatMap(e => e.channels)], endpoints, ["foot.left", "foot.right"]);

/** A finite executor whose return holds the hand for one step after withdrawal. */
function executor(extra = []) {
  const state = { starts: 0, updates: 0, live: [] };
  return {
    state,
    needs(_action, effector) { return [effector, ...extra]; },
    readiness() { return { kind: "ready" }; },
    start(_view, request) { state.starts++; state.live.push({ id: request.id, effector: request.effector, phase: "prepare", withdrawn: false }); },
    update(_view, requests) {
      state.updates++;
      const result = [];
      for (let i = state.live.length - 1; i >= 0; i--) {
        const item = state.live[i];
        item.withdrawn ||= !requests.some(r => r.id === item.id);
        if (item.phase === "release") { result.push({ id: item.id, ending: { kind: item.withdrawn ? "cancelled" : "completed" } }); state.live.splice(i, 1); }
        else {
          item.phase = item.phase === "commit" || item.withdrawn ? "release" : "commit";
          result.push({ id: item.id, phase: item.phase, stage: item.phase, holds: [item.effector, ...extra] });
        }
      }
      return result;
    },
    command() { return {}; },
    resume() { state.live.length = 0; },
  };
}
function fixture(options, extra = []) {
  const motion = executor(extra), set = actionInstances([{ name: "motion", executor: motion }], [{ name: "hit", executor: "motion", effectors: endpoints.map(e => e.segment) }], resources, options);
  const request = (effector = "hand.right") => ({ id: set.instance(), action: "hit", effector, target: point });
  const step = (time, asks) => set.step({ time, senses: { others: [{ id: "foe", spec: { segments: ["head", "forearm", "shin"].map(name => ({ name })) } }] } }, asks, around, 1 / 120);
  return { motion, set, request, step };
}

test("admission reserves before execution and conflict refuses without starting", () => {
  const { set, motion, request, step } = fixture(undefined, ["trunk"]), first = request(), second = request("hand.left");
  step(0, [first, second]);
  assert.deepEqual(motion.state, { starts: 1, updates: 1, live: [{ id: 1, effector: "hand.right", phase: "prepare", withdrawn: false }] });
  assert.deepEqual(set.live.map(s => [s.id, s.phase, s.stage, s.holds]), [[1, "prepare", "admitting", ["hand.right", "trunk"]]]);
  assert.deepEqual(set.ledger, [{ ...second, sequence: 1, began: 0, ended: 0, ending: { kind: "refused", reason: "resources held" }, committed: false,
    contacts: { counts: { prepare: { target: 0, block: 0, incidental: 0, world: 0 }, commit: { target: 0, block: 0, incidental: 0, world: 0 }, release: { target: 0, block: 0, incidental: 0, world: 0 } }, loadedInCommit: false, blockedSegments: [], lastTarget: null }, observations: [], observed: 0 }]);
});

test("disjoint instances run together and withdrawal cannot be undone", () => {
  const { set, request, step } = fixture(), right = request(), left = request("hand.left");
  step(0, [right, left]);
  assert.equal(set.live.length, 2);
  step(1, [left]);
  assert.deepEqual(set.live.map(s => [s.id, s.phase]), [[1, "release"], [2, "commit"]]);
  const replacement = request();
  step(2, [right, left, replacement]);
  assert.deepEqual(set.live.map(s => [s.id, s.phase]), [[2, "release"], [3, "prepare"]]);
  assert.equal(set.ledger[0].ending.kind, "cancelled");
  assert.equal(set.ledger[0].committed, false);
});

test("a live action is ended at once where its executor can forget it, freeing its hand, and runs on where it cannot", () => {
  for (const stoppable of [true, false]) {
    const { set, motion, request, step } = fixture();
    if (stoppable) motion.interrupt = (_view, id) => { motion.state.live = motion.state.live.filter((item) => item.id !== id); };
    const right = request(), left = request("hand.left");
    step(0, [right, left]);
    set.stop({ time: 1 }, [right.id], "taken");
    if (!stoppable) { assert.deepEqual(set.live.map((s) => s.id), [right.id, left.id], "it runs on"); continue; }
    assert.deepEqual(set.live.map((s) => s.id), [left.id]);
    assert.deepEqual(motion.state.live.map((item) => item.id), [left.id], "its executor has forgotten it");
    assert.deepEqual([set.ledger.at(-1).id, set.ledger.at(-1).ending], [right.id, { kind: "interrupted", reason: "taken" }]);
    const next = request();
    step(1, [left, next]);
    assert.deepEqual(set.live.map((s) => s.id), [left.id, next.id], "the hand it held is free at once");
  }
});

test("ids are issued, ordered, unique, retired and target identity is immutable", () => {
  const { set, request, step } = fixture({ ledger: 1 }), first = request(), skipped = request(), third = request();
  assert.throws(() => step(0, [{ ...third, id: 4 }]), /unissued/);
  assert.throws(() => step(0, [first, first]), /duplicate/);
  assert.throws(() => step(0, [third, first]), /order/);
  step(0, [first, third]);
  assert.throws(() => step(1, [{ ...first, target: { ...point, body: "other" } }]), /changed/);
  step(1, [{ ...first, target: { ...point, at: [1, 1, 1] } }]);
  assert.deepEqual(set.live[0].target.at, [1, 1, 1]);
  step(2, [first]); step(3, [first]); step(4, [first, skipped, third]);
  assert.equal(set.live.length, 0);
  assert.equal(set.state.seen, 3);
});

test("contact attribution uses the submitted phase, exact totals outlive inspection, and replay keeps them", () => {
  const { set, request, step } = fixture({ observations: 1 }), first = request();
  step(0, [first]); set.snapshot();
  const target = { kind: "body", body: "foe", segment: "head", guard: false };
  set.observe(1, 1, [{ effector: first.effector, target, loaded: true, onset: true }]);
  step(1, [first]); set.snapshot();
  const saved = saveState(set.state);
  const finish = () => {
    set.observe(2, 2, [{ effector: first.effector, target: { ...target, segment: "forearm", guard: true }, loaded: true, onset: true },
      { effector: first.effector, target, loaded: true, onset: true }]);
    set.observe(2, 2, [{ effector: first.effector, target, loaded: true, onset: true }]);
    step(2, [first]); set.snapshot(); step(3, [first]);
    return structuredClone(set.ledger);
  };
  const result = finish(); loadState(set.state, saved); assert.deepEqual(finish(), result);
  assert.equal(result[0].observed, 3);
  assert.equal(result[0].observations.length, 1);
  assert.deepEqual(result[0].contacts, { counts: { prepare: { target: 1, block: 0, incidental: 0, world: 0 }, commit: { target: 1, block: 1, incidental: 0, world: 0 }, release: { target: 0, block: 0, incidental: 0, world: 0 } }, loadedInCommit: true, blockedSegments: ["forearm"], lastTarget: 2 });
  assert.equal(landed(result[0]), true); assert.equal(blocked(result[0]), true); assert.equal(cleanMiss(result[0]), false);
});

test("takeover ends instances once and later contacts cannot alter their records", () => {
  const { set, motion, request, step } = fixture(), first = request(); step(0, [first]); step(1, [first]); set.snapshot();
  set.observe(1, 1, [{ effector: first.effector, target: { kind: "body", body: "foe", segment: "head", guard: false }, loaded: true, onset: true }]);
  set.interrupt({ time: 0.9 }, "sub-mind");
  const ended = structuredClone(set.ledger);
  set.observe(2, 2, [{ effector: first.effector, target: { kind: "world" }, loaded: true, onset: true }]);
  set.resume({ time: 2 }); step(2, [first]);
  assert.deepEqual(set.ledger, ended);
  assert.deepEqual(ended[0].ending, { kind: "interrupted", reason: "sub-mind" });
  assert.equal(ended[0].ended, 1);
  assert.equal(ended[0].contacts.counts.commit.target, 1);
  assert.equal(set.live.length, 0); assert.equal(motion.state.live.length, 0);
});

test("anatomical footprints reject foreign writes and legs overlap feet", () => {
  assert.equal(resources.overlap(["legs"], ["foot.left"]), true);
  assert.equal(resources.overlap(["hand.left"], ["hand.right"]), false);
  assert.throws(() => resources.validate(["hand.right"], { posture: { "hand.left joint": 1 } }), /undeclared/);
  assert.throws(() => resources.validate(["hand.right"], { pushes: [{ channel: "spine", sense: 1, level: 1 }] }), /undeclared/);
  assert.throws(() => resources.validate(["foot.left"], { effectors: { "foot.left": {} } }), /needs legs/);
  assert.throws(() => resources.validate(["legs"], { support: 0.2 }), /trunk/);
  assert.throws(() => resources.validate(["hand.right"], { delegate: ["hand.left"] }), /unowned/);
  assert.throws(() => resources.validate(["hand.right"], { delegate: ["hand.right"], posture: { "hand.right joint": 1 } }), /undeclared/);
  assert.throws(() => resources.controls(["__proto__"]), /unknown resource/);
  assert.throws(() => resources.validatePatch(["legs"], { stance: { feet: ["left"] }, effectors: { "foot.left": {} } }), /two controllers/);
  resources.validate(["hand.right"], { posture: { "hand.right joint": 1 }, handPoses: { right: "fist" } });
});

test("released effectors attribute only to their replacement while overlapping retained resources keep attribution", () => {
  const motion = executor(["trunk"]), update = motion.update;
  motion.update = (...args) => update(...args).map(change => "holds" in change && change.phase === "release" ? { ...change, holds: ["trunk"] } : change);
  const replacement = executor();
  const set = actionInstances([{ name: "first", executor: motion }, { name: "next", executor: replacement }],
    [{ name: "hit", executor: "first", effectors: ["hand.right"] }, { name: "next", executor: "next", effectors: ["hand.right"] }], resources);
  const first = { id: set.instance(), action: "hit", effector: "hand.right", target: point };
  set.step({ time: 0 }, [first], around, 1 / 120);
  set.step({ time: 1 }, [first], around, 1 / 120);
  const next = { ...first, id: set.instance(), action: "next" };
  set.step({ time: 2 }, [first, next], around, 1 / 120); set.snapshot();
  assert.deepEqual(set.state.attribution.map(entry => entry.id), [next.id]);
  set.observe(3, 3, [{ effector: "hand.right", target: { kind: "body", body: "foe", segment: "head", guard: false }, loaded: true, onset: true }]);
  assert.equal(set.live[0].contacts.counts.release.target, 0);
  assert.equal(set.live[1].contacts.counts.prepare.target, 1);
  const foot = executor(["legs"]), footUpdate = foot.update;
  foot.update = (...args) => footUpdate(...args).map(change => "holds" in change ? { ...change, holds: ["legs"] } : change);
  const feet = actionInstances([{ name: "kick", executor: foot }], [{ name: "kick", executor: "kick", effectors: ["foot.left"] }], resources);
  const kick = { id: feet.instance(), action: "kick", effector: "foot.left", target: point };
  feet.step({ time: 0 }, [kick], around, 1 / 120); feet.step({ time: 1 }, [kick], around, 1 / 120); feet.snapshot();
  assert.deepEqual(feet.state.attribution.map(entry => entry.effector), ["foot.left"], "legs still owns the foot after its explicit name is dropped");
});

test("blocked segments follow the sensed anatomy and exact aggregates survive a zero-length history", () => {
  const { set, request, step } = fixture({ observations: 0 }), first = request();
  step(0, [first]); step(1, [first]); set.snapshot();
  for (const [i, segment] of ["shin", "forearm", "unknown", "shin"].entries()) {
    set.observe(i + 1, i + 1, [{ effector: first.effector, target: { kind: "body", body: "foe", segment, guard: true }, loaded: true, onset: true }]);
  }
  assert.deepEqual(set.live[0].contacts.blockedSegments, ["forearm", "shin"]);
  assert.equal(set.live[0].contacts.counts.commit.block, 4);
  assert.deepEqual(set.live[0].observations, []);
});

test("requests handed to executors cannot mutate protocol state and endings detach every retained fact", () => {
  const { set, motion, request, step } = fixture(), first = request(), received = [];
  const start = motion.start, update = motion.update;
  motion.start = (view, request) => { received.push(request); start(view, request); };
  motion.update = (view, requests) => { received.push(...requests); return update(view, requests); };
  step(0, [first]);
  assert.throws(() => { received[0].target.at[0] = 999; }, TypeError);
  step(1, [first]);
  assert.throws(() => { received[1].target.at[0] = 999; }, TypeError);
  const live = set.live[0];
  set.snapshot();
  set.observe(1, 1, [{ effector: first.effector, target: { kind: "body", body: "foe", segment: "head", guard: false }, loaded: true, onset: true }]);
  set.interrupt({ time: 2 }, "takeover");
  const ended = structuredClone(set.ledger[0]);
  live.contacts.counts.commit.target = 999; live.observations[0].struck.segment = "changed"; live.target.at[0] = 999;
  assert.deepEqual(set.ledger[0], ended);
});

test("a real hand interval is recorded before an earlier after-step takeover and later loading cannot change its ledger", async () => {
  const base = lone("attacker", "hand.right", 1, { held: .3, stiffness: null });
  const spec = { ...base, segments: base.segments.map(segment => ({ ...segment,
    points: { tip: sourced([.3, 0, 0], "m", "de-leva-1996", "the held contact fixture's endpoint") } })) };
  const stand = await coreStand(spec, { gravity: false, ground: false });
  const target = buildBody(lone("target", "trunk", 1, { stiffness: null }), stand.world, { position: [.39, 0, 0] });
  const hand = stand.built.segments.get("hand.right").body, other = target.segments.get("trunk").body;
  other.setFixed(true);
  const sampler = effectorFeedback(stand.built, ["hand.right"], body => body === other
    ? { kind: "body", body: "foe", segment: "trunk", guard: false } : null, undefined, { "hand.right": { point: "tip" } });
  const motion = executor(), map = actionResources([], [{ segment: "hand.right", channels: [] }], []);
  const set = actionInstances([{ name: "hit", executor: motion }], [{ name: "hit", executor: "hit", effectors: ["hand.right"] }], map);
  const first = { id: set.instance(), action: "hit", effector: "hand.right", target: point };
  stand.world.afterStep(() => { if (stand.world.steps === 2) set.interrupt({ time: stand.world.time }, "takeover"); });
  stand.world.beforeStep(() => {
    set.step({ time: stand.world.time }, [first], around, stand.world.dt); set.snapshot();
    if (stand.world.steps > 0) hand.applyForce(new Vector3(120, 0, 0), new Vector3(.3, 0, 0));
  });
  stand.world.afterPhysics(() => {
    sampler.read(stand.world.steps);
    set.observe(stand.world.steps, stand.world.time, sampler.state["hand.right"].pairs.map(pair => ({ ...pair, effector: "hand.right" })));
  });
  try {
    stand.step(2);
    const expected = { ...first, sequence: 1, began: 0, ended: 2 / 120, ending: { kind: "interrupted", reason: "takeover" }, committed: true,
      contacts: { counts: { prepare: { target: 0, block: 0, incidental: 0, world: 0 }, commit: { target: 1, block: 0, incidental: 0, world: 0 }, release: { target: 0, block: 0, incidental: 0, world: 0 } }, loadedInCommit: true, blockedSegments: [], lastTarget: 2 / 120 },
      observations: [{ step: 2, time: 2 / 120, phase: "commit", kind: "target", struck: { body: "foe", segment: "trunk" }, by: "hand.right" }], observed: 1 };
    assert.deepEqual(set.ledger, [expected]);
    stand.step(2);
    assert.deepEqual(set.ledger, [expected]);
  } finally { target.dispose(); stand.dispose(); }
});

test("every executor ending copies the whole interval ledger record", () => {
  for (const kind of ["completed", "cancelled", "lost", "stalled", "interrupted"]) {
    const { set, motion, request, step } = fixture(), first = request();
    step(0, [first]);
    if (kind !== "lost") step(1, [first]);
    set.snapshot();
    const target = { kind: "body", body: "foe", segment: "head", guard: false };
    set.observe(1, 1, [{ effector: first.effector, target, loaded: true, onset: true }]);
    const ending = kind === "completed" || kind === "cancelled" ? { kind } : { kind, reason: "fixture ending" };
    motion.update = () => [{ id: first.id, ending }];
    step(2, [first]);
    const committed = kind !== "lost", phase = committed ? "commit" : "prepare";
    const expected = { ...first, sequence: 1, began: 0, ended: 2, ending, committed,
      contacts: { counts: { prepare: { target: committed ? 0 : 1, block: 0, incidental: 0, world: 0 }, commit: { target: committed ? 1 : 0, block: 0, incidental: 0, world: 0 }, release: { target: 0, block: 0, incidental: 0, world: 0 } }, loadedInCommit: committed, blockedSegments: [], lastTarget: committed ? 1 : null },
      observations: [{ step: 1, time: 1, phase, kind: "target", by: "hand.right", struck: { body: "foe", segment: "head" } }], observed: 1 };
    assert.deepEqual(set.ledger, [expected], kind);
    assert.deepEqual(set.live, []);
  }
});

async function contactAction() {
  const base = lone("attacker", "hand.right", 1, { held: .3, stiffness: null });
  const spec = { ...base, segments: base.segments.map(segment => ({ ...segment,
    points: { tip: sourced([.3, 0, 0], "m", "de-leva-1996", "the held contact fixture's endpoint") } })) };
  const stand = await coreStand(spec, { gravity: false, ground: false });
  const target = buildBody(lone("target", "trunk", 1, { stiffness: null }), stand.world, { position: [.39, 0, 0] });
  const hand = stand.built.segments.get("hand.right").body, other = target.segments.get("trunk").body;
  other.setFixed(true);
  const sampler = effectorFeedback(stand.built, ["hand.right"], body => body === other
    ? { kind: "body", body: "foe", segment: "trunk", guard: false } : null, undefined, { "hand.right": { point: "tip" } });
  const state = { live: null };
  const motion = { state, needs: () => ["hand.right"], readiness: () => ({ kind: "ready" }),
    start(_view, request) { state.live = { id: request.id, age: 0 }; },
    update() {
      if (!state.live) return [];
      const live = state.live; live.age++;
      if (live.age >= 8) { state.live = null; return [{ id: live.id, ending: { kind: "completed" } }]; }
      const phase = live.age >= 6 ? "release" : "commit";
      return [{ id: live.id, phase, stage: phase, holds: ["hand.right"] }];
    }, command: () => ({}), resume() { state.live = null; } };
  const resources = actionResources([], [{ segment: "hand.right", channels: [] }], []);
  const actions = actionInstances([{ name: "hit", executor: motion }], [{ name: "hit", executor: "hit", effectors: ["hand.right"] }], resources);
  const request = { id: actions.instance(), action: "hit", effector: "hand.right", target: point };
  stand.world.beforeStep(() => {
    actions.step({ time: stand.world.time }, [request], around, stand.world.dt); actions.snapshot();
    if (stand.world.steps > 0) hand.applyForce(new Vector3(120, 0, 0), new Vector3(.3, 0, 0));
  });
  stand.world.afterPhysics(() => {
    sampler.read(stand.world.steps);
    actions.observe(stand.world.steps, stand.world.time, sampler.state["hand.right"].pairs.map(pair => ({ ...pair, effector: "hand.right" })));
  });
  const states = { actions: actions.state, feedback: sampler.state };
  return { stand, actions, sampler, states, save: () => saveStand(stand.world, states),
    load: saved => loadStand(stand.world, states, saved),
    finish() {
      const trace = traceOf([stand.built, target]), intervals = [];
      while (stand.world.steps < 10) {
        stand.step(); trace.take();
        intervals.push(saveState({ live: actions.live, attribution: actions.state.attribution, feedback: sampler.state }));
      }
      return { trace: trace.digest(), intervals, state: this.save().state, ledger: structuredClone(actions.ledger) };
    }, dispose() { target.dispose(); stand.dispose(); } };
}

test("a loaded hand and live action fork together, and forgetting episodes or exact summaries changes the ledger", async () => {
  const one = await contactAction(), twin = await contactAction(), noEpisode = await contactAction(), noSummary = await contactAction();
  try {
    one.stand.step(3);
    assert.equal(one.actions.live[0].phase, "commit");
    assert.equal(one.actions.live[0].contacts.counts.commit.target, 1);
    assert.equal(one.sampler.state["hand.right"].pairs[0].loaded, true);
    const saved = one.save(); twin.load(saved);
    const forgottenEpisode = structuredClone(saved);
    forgottenEpisode.state.feedback["hand.right"].episodes.clear(); noEpisode.load(forgottenEpisode);
    const forgottenSummary = structuredClone(saved);
    forgottenSummary.state.actions.live[0].contacts.counts.commit.target = 0; noSummary.load(forgottenSummary);
    const expected = one.finish(), replay = twin.finish(), episode = noEpisode.finish(), summary = noSummary.finish();
    assert.deepEqual(replay, expected);
    assert.equal(expected.ledger[0].contacts.counts.commit.target, 1);
    assert.equal(expected.ledger[0].observed, 1);
    assert.equal(expected.ledger[0].ending.kind, "completed");
    assert.equal(episode.trace, expected.trace); assert.equal(summary.trace, expected.trace);
    assert.equal(episode.ledger[0].contacts.counts.commit.target, 2, "forgetting a loaded episode invents another committed onset");
    assert.equal(summary.ledger[0].contacts.counts.commit.target, 0, "inspection history cannot reconstruct a forgotten exact summary");
    assert.notDeepEqual(episode.ledger, expected.ledger); assert.notDeepEqual(summary.ledger, expected.ledger);
    assert.ok(expected.intervals.some(interval => interval.attribution.some(snapshot => snapshot.phase === "release")));
    assert.deepEqual(expected.intervals.at(-1).attribution, [], "the completed instance retains no attribution");
  } finally { one.dispose(); twin.dispose(); noEpisode.dispose(); noSummary.dispose(); }
});
