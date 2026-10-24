import test from "node:test";
import assert from "node:assert/strict";
import { driveBy, engagementWithDetails } from "../src/core/mind/tactics.ts";
import { saveState } from "../src/core/state.ts";
import { fighterFaults } from "../src/core/mind/fighter.ts";
import { partLookup } from "../src/core/mind/catalog.ts";
import { coreStand } from "./harness/core-stand.mjs";
import { modelSpec } from "../src/core/models.ts";
import { labActor } from "../src/lab/actor.ts";
import { COUNTER_PUNCHER } from "../src/core/mind/config.ts";
import { standIntent } from "../src/core/mind/intent.ts";
import { prepareTacticsSkills } from "../src/core/mind/tactics-part.ts";
import { actionTactics } from "../src/core/mind/action-tactics.ts";
import { FIGHTING } from "../src/core/mind/config.ts";

test("report layers preserve a changing inner report, compose details and read without side effects", () => {
  const state = { choice: 0 }, reports = [
    { phase: "attack", focus: "foe", lost: false, candidates: [], pending: null, offers: [], details: [{ label: "Inner", value: "first" }] },
    { phase: "cover", focus: null, lost: true, candidates: [{ key: "other" }], pending: { key: "other" }, offers: [{ name: "cover" }], details: [{ label: "Inner", value: "second" }] },
  ];
  const inner = () => reports[state.choice], middle = engagementWithDetails(inner, () => [{ label: "Middle", value: String(state.choice) }]);
  const outer = engagementWithDetails(() => middle, () => [{ label: "Outer", value: "last" }]);
  for (state.choice = 0; state.choice < reports.length; state.choice++) {
    const before = saveState(state), snapshot = () => JSON.parse(JSON.stringify(outer));
    assert.deepEqual(snapshot(), { ...inner(), details: [...inner().details, { label: "Middle", value: String(state.choice) }, { label: "Outer", value: "last" }] });
    assert.deepEqual(snapshot(), snapshot());
    assert.deepEqual(saveState(state), before);
  }
  assert.deepEqual(JSON.parse(JSON.stringify(engagementWithDetails(() => undefined, () => [{ label: "Layer", value: "active" }]))),
    { phase: "unreported", details: [{ label: "Layer", value: "active" }] });
});

test("the driver prepares skills once, and uses the prepared report, resume, command and release", () => {
  const calls = [], view = { resumed: true }, body = { view, drive(command, release) { this.command = command; this.release = release; } };
  const original = { state: {}, report: { original: true } };
  const prepared = { report: { prepared: true }, envelope: null, clearance: {}, instance() {}, readiness() {},
    resume(value) { calls.push(["resume", value]); }, command(value, intent, dt) { calls.push(["command", value, intent, dt]); return "command"; },
    release() {} };
  const tactics = { name: "fixture",
    decide(sight, dt) { assert.equal(sight.report, prepared.report); calls.push(["decide", dt]); return "intent"; } };
  const part = { prepareSkills(_making, _config, skills, decision) {
    assert.equal(skills, original); assert.equal(decision(), tactics.decision); calls.push("prepare"); return prepared;
  } };
  const making = { parts: { of: () => part } };
  assert.equal(driveBy(body, tactics, () => prepareTacticsSkills(making, { kind: "fixture" }, original, () => tactics.decision)), prepared);
  for (let i = 0; i < 2; i++) assert.equal(body.command(view, .1), "command");
  assert.equal(body.release, prepared.release);
  assert.deepEqual(calls, ["prepare", ["resume", view], ["decide", .1], ["command", view, "intent", .1],
    ["resume", view], ["decide", .1], ["command", view, "intent", .1]]);
});

test("a planner validates its kit dependencies through another planner's delegation", () => {
  const child = { kitFaults: (_config, kit) => kit.support === null ? ["needs support"] : [] };
  const wrapper = { kitFaults: (config, kit, parts) => (parts.of("tactics", config.plan).kitFaults?.(config.plan, kit, parts) ?? []).map(fault => `plan: ${fault}`) };
  const parts = { of: (role, config) => config.kind === "wrapper" ? wrapper : config.kind === "child" ? child : partLookup.of(role, config) };
  const config = { ...COUNTER_PUNCHER, actions: [], executors: [], support: null, tactics: { kind: "wrapper", plan: { kind: "wrapper", plan: { kind: "child" } } } };
  assert.deepEqual(fighterFaults(config, parts), ["tactics: plan: plan: needs support"]);
  assert.deepEqual(fighterFaults({ ...config, support: { kind: "support-fold" } }, parts), []);
});

test("behaviour decision context resets each step and does not derive authority from phase labels", () => {
  let mode = "evade";
  const window = { at: [0, 1, 1], along: [.5, 1], across: [-.1, .1], facing: .3, speed: .1 };
  const part = { make: () => ({ decide(turn) {
    turn.phase = "arbitrary display label";
    if (mode === "evade") turn.evading = true;
    if (mode === "approach") turn.approach = window;
  } }) };
  const tactics = actionTactics({ spec: {}, actions: [], estimates: {}, aims: new Map(), orders: () => null, parts: { of: () => part } },
    { ...FIGHTING, list: [{ kind: "fixture" }] });
  const sight = { view: { time: 0, senses: { others: [], side: "left" }, stance: { centre: { x: 0, z: 0 } } },
    report: { actions: [], ledger: [], heading: 0 } };
  for (const [choice, expected] of [["evade", { focus: null, evading: true, approach: null }],
    ["approach", { focus: null, evading: false, approach: window }], ["idle", { focus: null, evading: false, approach: null }]]) {
    mode = choice; tactics.decide(sight, .1);
    assert.deepEqual(tactics.decision, expected);
    assert.equal(tactics.engagement.phase, "arbitrary display label");
  }
  mode = "evade"; tactics.decide(sight, .1); sight.view.senses.out = true; tactics.decide(sight, .1);
  assert.deepEqual(tactics.decision, { focus: null, evading: false, approach: null });
});

test("the Lab's supplied script replaces configured tactics and passes through its instrument", async () => {
  const stand = await coreStand(modelSpec("workshop-fighter")), state = { calls: 0 }, seen = [];
  const script = { name: "fixture", state, decide(sight) { state.calls++; return standIntent(sight.report.heading); } };
  const actor = labActor(stand.built, stand.world, { mind: COUNTER_PUNCHER });
  try {
    const skills = actor.drive(script, { watch: sight => seen.push(sight.report) });
    for (let i = 0; i < 3; i++) stand.step();
    assert.equal(state.calls, 3);
    assert.equal(seen.length, state.calls);
    assert.ok(seen.every(report => report === skills.report));
    assert.equal(skills.state.tactics, state, "the supplied script's memory belongs to the driven kit");
  } finally { actor.dispose(); stand.dispose(); }
});

test("a drill that fights until a moment is its mind's own bout up to that moment, to the bit", async () => {
  const { MINDS } = await import("../src/core/mind/controllers.ts");
  const { buildBout } = await import("../src/evaluation/bout.ts");
  const { striker } = await import("../src/evaluation/strike/cases.ts");
  // The Vanguard's planner wraps another and prepares the skills: every hook a drill must pass on.
  const mind = MINDS["vanguard-warrior"].config, foe = MINDS.counter.config;
  const recipe = (left) => ({ left: "workshop-fighter", right: "workshop-fighter", capSeconds: 31, recoverySeconds: null, entry: [], ends: [], minds: { left, right: foe } });
  const plain = await buildBout(recipe(mind)), drilled = await buildBout(recipe(striker({ mind, action: "strike" }, "right", "high", { after: 0, moment: 1 })));
  const poses = (built) => ["left", "right"].flatMap((side) => [...built.duel.duelists[side].built.segments.values()]
    .flatMap(({ node: { position: p, rotationQuaternion: q } }) => [p.x, p.y, p.z, q.x, q.y, q.z, q.w]));
  const phase = () => drilled.duel.duelists.left.minded.skills.report.engagement?.phase;
  try {
    plain.duel.play([]); drilled.duel.play([]);
    let steps = 0;
    for (; phase() === "fighting" && steps < 20 * 120; steps++) {
      plain.world.step(); drilled.world.step();
      if (phase() === "fighting") assert.deepEqual(poses(drilled), poses(plain), `the bouts part at step ${steps + 1}, before the moment`);
    }
    assert.notEqual(phase(), "fighting", "the fixture's fight never came to its first action in 20 s");
  } finally { plain.dispose(); drilled.dispose(); }
});
