import test from "node:test";
import assert from "node:assert/strict";
import { buildBout } from "../src/evaluation/bout.ts";
import { traceOf } from "../src/evaluation/trace.ts";
import { CONTROLLERS } from "../src/core/mind/controllers.ts";
import { loadState, saveState } from "../src/core/state.ts";
import { lowGuard } from "../src/core/entrants/vanguard/low-guard.ts";
import { STANCE_LOWER } from "../src/core/skills/locomotion.ts";
import { CAP_SECONDS } from "../src/arena/duel.ts";
import { BOUT_ENGINE } from "../research/bout.mjs";
import { adaptiveGuard } from "../src/core/entrants/vanguard/adaptive-guard.ts";

/** Ordinary policies with distinguishable decisions and an external contact signal. */
function learningFixture(signal) {
  const make = pace => { const state = { calls: 0 }; return { name: "fixture", state, engagement: { phase: "attack", focus: "foe" },
    decide() { state.calls++; return { move: null, face: 0, guard: { left: null, right: null }, actions: [], pace }; } }; };
  const attacking = make(1), defensive = make(2), policy = adaptiveGuard(attacking, defensive, true);
  const zero = { x: 0, y: 0, z: 0 }, foe = { id: "foe", out: false, spec: { marks: { middle: ["trunk"] }, segments: [{ name: "trunk" }] },
    segments: new Map([["trunk", { centre: zero, velocity: zero, spin: zero }]]) };
  const feedback = () => ({ completedStep: 0, velocity: [3, 0, 0], pairs: [] });
  const left = feedback(), right = feedback(), view = { time: 0, senses: { others: [foe] }, effectors: { "hand.left": { feedback: left }, "hand.right": { feedback: right } } };
  const action = { id: 1, action: "strike", effector: "hand.right", phase: "commit", target: { kind: "body", body: "foe", region: { kind: "mark", mark: "middle" } } };
  const sight = { view, report: { actions: [] } };
  const clock = { previous: 1, time: 0 };
  const step = () => {
    view.time = ++clock.time; left.completedStep = clock.time; right.completedStep = clock.time;
    sight.report.actions = clock.time % 2 ? [action] : [];
    const impulse = signal(clock.previous, clock.time);
    right.pairs = impulse > 0 && sight.report.actions.length ? [{ onset: true, loaded: true, impulse,
      target: { kind: "body", body: "foe", segment: "trunk", guard: false }, point: [0, 0, 0], normal: [1, 0, 0] }] : [];
    const decision = policy.decide(sight, 1 / 120); clock.previous = decision.pace; return decision;
  };
  return { policy, attacking, defensive, clock, step };
}

test("policy learning credits observed target impacts and forks both policies and its feedback memory", () => {
  const { policy, attacking, defensive, clock, step } = learningFixture(mode => mode === 2 ? 1 : 0);
  while (clock.time < CAP_SECONDS && (!policy.state.samples.every(n => n > 0) || clock.previous !== 2)) step();
  assert.ok(attacking.state.calls > 0 && defensive.state.calls > 0, "the fixture probes both policies");
  assert.equal(clock.previous, 2, "observed target impacts favour the productive policy");
  const saved = saveState(policy.state), checkpoint = { ...clock };
  const tail = () => { const decisions = []; for (let i = 0; i < 20; i++) decisions.push(step()); return { decisions, state: saveState(policy.state) }; };
  const first = tail(); loadState(policy.state, saved); Object.assign(clock, checkpoint);
  assert.deepEqual(tail(), first, "policy scores, motion samples and both decision memories replay exactly");
});

test("a quiet policy trial is revisited when the contact conditions change", () => {
  const change = CAP_SECONDS / 3;
  const { clock, step } = learningFixture((mode, time) => mode === 1 ? .1 : time > change ? 1 : 0);
  let quietTrial = false, revisited = false;
  while (clock.time < CAP_SECONDS) {
    const decision = step();
    if (decision.pace === 2) { if (clock.time <= change) quietTrial = true; else revisited = true; }
  }
  assert.ok(quietTrial, "the fixture first samples the policy while its target contacts are absent");
  assert.ok(revisited, "an earlier zero score does not prevent trying the policy after conditions change");
});

test("a committed body-relative punch forks during its stroke and returns exactly", async () => {
  const config = { ...CONTROLLERS.vanguard.defaults, commitAim: true, predictAim: true };
  const built = await buildBout({ left: "workshop-fighter", right: "workshop-fighter", gap: .9,
    minds: { left: config, right: config } }, { engine: BOUT_ENGINE });
  try {
    const { duel, world } = built;
    duel.play([]);
    const striking = () => duel.duelists.left.minded.skills.report.actions.some(action => action.phase === "commit");
    // The ordinary mind smoke test forks before this stroke has selected its body-relative aim.
    while (duel.clock < 3 && !striking()) world.step();
    assert.ok(striking(), "the fixture reaches a committed punch before its deadline");
    const saved = duel.save(), until = duel.steps + world.hz / 2;
    const tail = () => {
      const trace = traceOf([duel.duelists.left.built, duel.duelists.right.built]);
      while (duel.steps < until) { world.step(); trace.take(); }
      return { trace: trace.digest(), minds: saveState({ left: duel.duelists.left.minded.state, right: duel.duelists.right.minded.state }) };
    };
    const first = tail();
    duel.load(saved);
    assert.ok(striking(), "the loaded fork restores the live commitment");
    assert.deepEqual(tail(), first, "both the moving aim and recovery survive the fork to the bit");
  } finally { built.dispose(); }
});

/** A low opponent in reach, a facing body and support that never becomes ready. */
function lowFixture() {
  const state = { calls: 0 }, spec = { held: [] };
  const base = { name: "fixture", state, engagement: { phase: "guard", focus: "foe" }, decide() {
    state.calls++;
    return { move: null, face: Math.PI / 2, guard: { left: null, right: null }, actions: [] };
  } };
  const view = { time: 0, down: false, stance: { centre: { x: 0, y: 1, z: 0 }, support: { y: 0 }, facing: Math.PI / 2 },
    senses: { others: [{ id: "foe", out: false, spec: { marks: { high: "head" } }, segments: new Map([["head", { centre: { x: .4, y: .3, z: 0 } }]]) }] } };
  const sight = { view, report: { support: { stage: "stand", ready: false } } };
  return { layer: lowGuard(base, spec, () => null), sight };
}

test("unready low support returns toward standing without first becoming ready, and its wait forks", () => {
  const { layer, sight } = lowFixture(), { view } = sight;
  const first = layer.tactics.decide(sight, 1);
  assert.ok(first.lower > STANCE_LOWER, "the fixture requests its low preparation");
  sight.report.support.stage = "wait";
  view.time = 2; layer.tactics.decide(sight, 1);
  const saved = saveState(layer.tactics.state);
  const tail = () => {
    const commands = [];
    for (view.time = 3; view.time < CAP_SECONDS; view.time++) commands.push(layer.tactics.decide(sight, 1));
    return { commands, state: saveState(layer.tactics.state) };
  };
  const once = tail();
  assert.ok(once.commands.some(command => command.lower <= STANCE_LOWER), "preparation is abandoned within the bout while support remains unready");
  assert.equal(sight.report.support.ready, false);
  loadState(layer.tactics.state, saved);
  assert.deepEqual(tail(), once, "the failed preparation's complete state and decisions fork exactly");
});

test("a closed low guard preserves an action's reserved hand pose", () => {
  for (const reserved of ["left", "right"]) {
    const { layer, sight } = lowFixture(), original = { posture: {}, pushes: [], stance: null, handPoses: { left: "open", right: "open" } };
    const base = { state: {}, envelope: null, report: { reservations: { [`pose:${reserved}`]: 0 } }, command: () => original };
    const intent = { ...layer.tactics.decide(sight, 1), guard: { left: { threat: [1, .3, 0], guarded: [0, .3, 0] }, right: { threat: [1, .3, 0], guarded: [0, .3, 0] } } };
    const command = layer.skills(base).command(sight.view, intent, 1), free = reserved === "left" ? "right" : "left";
    assert.deepEqual(command, { ...original, handPoses: { [reserved]: "open", [free]: "fist" } });
    assert.deepEqual(original.handPoses, { left: "open", right: "open" }, "the guard does not mutate its service's command");
  }
});
