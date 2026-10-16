import test from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { actionTactics, actionCondition } from "../src/core/mind/action-tactics.ts";
import { humanSpec } from "../src/core/human/spec.ts";
import { saveState, loadState } from "../src/core/state.ts";
import { rangeOf } from "../src/core/skills/strike.ts";

const spec = humanSpec("workshop-fighter");
const high = { kind: "mark", mark: "high" };
const action = (name = "punch", effector = "hand.right", regions = [high]) => ({ name, executor: name, effectors: [effector], regions, aim: { kind: "centre", lead: 0 } });
const config = (choose = "first-ready") => ({ target: [{ kind: "ordered" }, { kind: "current" }, { kind: "nearest", prefer: "standing-first" }],
  choose: { kind: choose, rethink: .12, patience: .5 }, list: [{ kind: "follow-orders" }, { kind: "attack" }, { kind: "approach" }] });
const foe = (id, z) => ({ id, side: "foe", out: false, down: false, spec, centre: new Vector3(0, 1, z),
  segments: new Map([["head", { centre: new Vector3(0, 1.7, z), velocity: new Vector3() }]]) });
function sight() {
  let issued = 0;
  return { view: { time: 0, head: new Vector3(0, 1.7, 0), stance: { centre: new Vector3(), velocity: new Vector3(), phase: "stand" },
    senses: { side: "own", others: [foe("near", 1), foe("far", 2)], solids: [] } },
  report: { heading: 0, actions: [], ledger: [] }, envelope: null,
  instance() { return ++issued; }, readiness() { return { kind: "ready" }; } };
}
const position = () => ({ kind: "position", window: { at: [0, 1, 2], along: [.7, .9], across: [-.1, .1], facing: .3, speed: .4 } });

test("ordered focus beats proximity and its loss never falls through to another body", () => {
  const body = sight(), tactics = actionTactics(spec, [action()], config(), () => ({ move: null, face: null, foe: "far" }));
  assert.equal(tactics.decide(body, 1 / 120).actions[0].target.body, "far");
  body.view.time = .01; body.view.senses.others[1].out = true;
  assert.deepEqual(tactics.decide(body, 1 / 120).actions, []);
  assert.equal(tactics.state.focus, null); assert.equal(tactics.state.lost, true);
  assert.equal(tactics.engagement.phase, "lost");
});

test("current focus stays sticky and only absent regions enable the declared fallback", () => {
  const body = sight(), regions = [{ kind: "segment", segment: "missing" }, high, { kind: "mark", mark: "middle" }];
  const tactics = actionTactics(spec, [action("punch", "hand.right", regions)], config());
  const first = tactics.decide(body, 1 / 120);
  assert.deepEqual(first.actions[0].target.region, high);
  assert.deepEqual(tactics.state.candidates.map(candidate => [candidate.eligible, candidate.readiness.kind]), [[false, "blocked"], [true, "ready"], [false, "blocked"]]);
  body.view.senses.others[0].centre.z = 3;
  body.view.senses.others[1].centre.z = .2;
  body.view.time = .2;
  assert.equal(tactics.decide(body, 1 / 120).actions[0].target.body, "near");
});

test("waiting keeps a pending candidate and alternatives wait for the bounded rebuild", () => {
  const body = sight(), calls = [];
  body.readiness = (_view, name) => { calls.push(name); return name === "kick" ? position() : { kind: "waiting", reason: "cooldown" }; };
  const tactics = actionTactics(spec, [action("kick", "foot.right"), action()], config());
  assert.deepEqual(tactics.decide(body, 1 / 120).actions, []);
  assert.equal(tactics.state.pending.key, tactics.state.candidates[0].key);
  body.view.time = .01;
  body.readiness = (_view, name) => { calls.push(name); return name === "kick" ? { kind: "waiting", reason: "cooldown" } : { kind: "ready" }; };
  assert.deepEqual(tactics.decide(body, 1 / 120).actions, []);
  assert.equal(tactics.state.pending.key, tactics.state.candidates[0].key);
  body.view.time = .12;
  assert.equal(tactics.decide(body, 1 / 120).actions[0].action, "punch");
  assert.ok(calls.filter(name => name === "punch").length >= 2);
});

test("a cached ready alternative is rechecked before selection and rotation follows actual admission", () => {
  const body = sight(), actions = [action("kick", "foot.right"), action()], tactics = actionTactics(spec, actions, config("rotate"));
  body.readiness = (_view, name) => name === "kick" ? { kind: "waiting", reason: "cooldown" } : { kind: "ready" };
  const first = tactics.decide(body, 1 / 120).actions[0];
  assert.equal(first.action, "punch");
  body.report.actions = [{ ...first, contacts: { lastTarget: null } }];
  body.view.time = .12;
  body.readiness = (_view, name) => name === "punch" ? { kind: "blocked", reason: "owned" } : { kind: "ready" };
  const next = tactics.decide(body, 1 / 120).actions;
  assert.equal(next.length, 2); assert.deepEqual(next[0], first); assert.equal(next[1].action, "kick");
  assert.equal(tactics.state.lastStarted, tactics.state.candidates[1].key);
});

test("edge holds the focus's reach before patience yields to the shared approach", () => {
  const body = sight(), range = rangeOf(spec, "right", 0), distance = range.reach + range.along[1] + .1;
  body.view.senses.others = [foe("near", distance)]; body.readiness = position;
  const settings = config(); settings.list = [{ kind: "edge", band: .2, patience: .3 }, { kind: "approach" }];
  const tactics = actionTactics(spec, [action()], settings);
  assert.equal(tactics.decide(body, 1 / 120).move, null);
  assert.equal(tactics.state.phase, "edge");
  body.view.time = .31;
  assert.ok(tactics.decide(body, 1 / 120).move[0] > 0);
  assert.equal(tactics.state.phase, "approach");
});

test("moving orders withdraw all live commitments and the shared window drives an unreserved approach", () => {
  const body = sight(); let orders = null; body.envelope = { walk: { value: .4 }, ways: { forward: { value: .5 }, right: { value: .4 }, back: { value: .4 }, left: { value: .4 } }, turns: [], tried: null };
  body.readiness = position;
  const tactics = actionTactics(spec, [action()], config(), () => orders);
  const entering = tactics.decide(body, 1 / 120);
  assert.ok(entering.move[0] > 0); assert.deepEqual(entering.actions, []);
  body.report.actions = [{ id: 1, action: "punch", effector: "hand.right", target: { kind: "body", body: "near", region: high } }];
  orders = { move: { x: 1, z: 0 }, face: null, destination: 4 };
  const moving = tactics.decide(body, 1 / 120);
  assert.deepEqual(moving.actions, []); assert.equal(moving.destination, 4);
  assert.ok(moving.move[0] > 0); assert.equal(moving.move[1], 0); assert.equal(moving.face, Math.PI / 2);
});

test("estimate selection uses declared units and recipe net providers without executor inspection", () => {
  const body = sight(), actions = [action("weak"), action("strong")];
  const estimates = { weak: { unit: "net", read: () => 1 }, strong: { unit: "net", read: () => 3 } };
  const tactics = actionTactics(spec, actions, config("estimate"), undefined, estimates);
  assert.equal(tactics.decide(body, 1 / 120).actions[0].action, "strong");
  assert.deepEqual(tactics.state.candidates.map(candidate => candidate.estimate), [{ unit: "net", value: 1 }, { unit: "net", value: 3 }]);
  assert.throws(() => actionTactics(spec, actions, config("estimate")), /comparable/);
  assert.throws(() => actionTactics(spec, actions, config("estimate"), undefined, { ...estimates, strong: { unit: "opening", read: () => 3 } }), /comparable/);
  const unavailable = actionTactics(spec, actions, config("estimate"), undefined, { ...estimates, strong: { unit: "net", read: () => null } });
  assert.equal(unavailable.decide(sight(), 1 / 120).actions[0].action, "weak");
});

test("scored selection keeps exact reader statistics across ledger eviction and ignores inspection history", () => {
  const body = sight(), actions = [action("one"), action("two")], tactics = actionTactics(spec, actions, config("scored"));
  const record = (sequence, name, targets) => ({ sequence, action: name, committed: true, ending: { kind: "completed" },
    contacts: { counts: { commit: { target: targets } }, loadedInCommit: targets > 0 }, observations: [] });
  body.report.ledger = [record(1, "one", 0), record(2, "two", 1)];
  assert.equal(tactics.decide(body, 1 / 120).actions[0].action, "two");
  body.report.ledger = [record(3, "two", 0)]; body.view.time = .2;
  tactics.decide(body, 1 / 120);
  assert.deepEqual(tactics.state.counts, { one: { committed: 1, landed: 0 }, two: { committed: 2, landed: 1 } });
  assert.equal(tactics.state.missed, 0);
});

test("candidate decisions and pending patience fork with plain data", () => {
  const one = sight(), two = sight(); one.readiness = position; two.readiness = position;
  const a = actionTactics(spec, [action()], config("rotate")), b = actionTactics(spec, [action()], config("rotate"));
  a.decide(one, 1 / 120); loadState(b.state, saveState(a.state));
  one.view.time = .2; two.view.time = .2;
  assert.deepEqual(a.decide(one, 1 / 120), b.decide(two, 1 / 120));
  assert.deepEqual(saveState(a.state), saveState(b.state));
  one.view.time = .8; two.view.time = .8;
  assert.deepEqual(a.decide(one, 1 / 120), b.decide(two, 1 / 120));
  assert.equal(a.state.pending.since, .8);
});

test("shared rule conditions separate proximity from focus and follow exact live target times", () => {
  const body = sight(), focus = body.view.senses.others[1];
  assert.equal(actionCondition({ kind: "when-distance", of: "foe", than: "under", metres: 1.5 }, body, null, focus), true);
  body.view.time = 1;
  body.report.actions = [{ target: { body: "far" }, contacts: { lastTarget: .9 } }];
  assert.equal(actionCondition({ kind: "follow-up", seconds: .2 }, body, null, focus), true);
  assert.equal(actionCondition({ kind: "follow-up", seconds: .05 }, body, null, focus), false);
  const settings = config(); settings.choose = { ...settings.choose, kind: "rules", rules: [{ when: { kind: "target-down" }, actions: ["kick"] }], otherwise: ["punch"] };
  const tactics = actionTactics(spec, [action("kick", "foot.right"), action()], settings);
  body.report.actions = [];
  assert.equal(tactics.decide(body, 1 / 120).actions[0].action, "punch");
});

test("conditional pending choices expire with their condition and an out body stops requesting",()=>{
  const body=sight(),settings=config();body.view.time=1;
  settings.choose={kind:'rules',rethink:1,patience:2,rules:[{when:{kind:'follow-up',seconds:.2},actions:['follow']}],otherwise:['punch']};
  body.report.ledger=[{sequence:1,action:'punch',committed:true,ending:{kind:'completed'},target:{kind:'body',body:'near'},contacts:{lastTarget:.9,loadedInCommit:true,counts:{commit:{target:1}}}}];
  body.readiness=(_view,name)=>name==='follow'?position():{kind:'ready'};
  const tactics=actionTactics(spec,[action('follow'),action()],settings);
  assert.deepEqual(tactics.decide(body,1/120).actions,[]);
  assert.equal(tactics.state.candidates.find(candidate=>candidate.key===tactics.state.pending.key).action,'follow');
  body.view.time=1.11;
  assert.equal(tactics.decide(body,1/120).actions[0].action,'punch');
  body.view.senses.out=true;
  assert.deepEqual(tactics.decide(body,1/120).actions,[]);assert.equal(tactics.state.phase,'out');assert.equal(tactics.state.pending,null);
});