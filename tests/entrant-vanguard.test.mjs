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
import { routeAround } from "../src/core/entrants/vanguard/route-around.ts";
import { partLookup } from "../src/core/mind/catalog.ts";
import { navigatorOf } from "../src/core/mind/navigator.ts";
import { flank } from "../src/core/entrants/vanguard/flank.ts";

test("a contact-triggered step preserves live strokes and orders, and forks its active decision", () => {
  const state = { calls: 0 }, intent = { move: null, face: 0, guard: {}, actions: [] };
  const base = { name: "fixture", state, engagement: { phase: "attack", focus: "foe" }, decide() { state.calls++; return intent; } };
  let orders = null;
  const policy = flank(base, { segments: [] }, () => orders);
  const foe = { id: "foe", out: false, centre: { x: 0, y: 1, z: 1 }, spec: { marks: { high: "head" } },
    segments: new Map([["head", { centre: { x: 0, y: 1.5, z: 1 } }], ["guard", { centre: { x: .2, y: 1, z: 1 } }]]) };
  const view = { time: 0, down: false, resumed: false, stance: { centre: { x: 0, y: 1, z: 0 }, support: { y: 0 } },
    senses: { others: [foe], solids: [] } };
  const sight = { view, report: { heading: 0, ledger: [], actions: [{ id: 1 }] } };
  for (let sequence = 1; sequence <= CAP_SECONDS; sequence++) {
    sight.report.ledger.push({ sequence, target: { kind: "body", body: "foe" }, committed: true,
      contacts: { counts: { commit: { target: 0, block: 1 } }, blockedSegments: ["guard"] } });
    view.time += .1;
    assert.equal(policy.decide(sight, .1), intent, "the current stroke retains its controls despite repeated blocks");
  }
  sight.report.actions = [];
  const active = policy.decide(sight, .1);
  assert.ok(active.move?.[1] < 0, "a free step moves away from the sensed blocking limb");
  const saved = saveState(policy.state), time = view.time;
  const next = () => { view.time += .1; return { decision: policy.decide(sight, .1), state: saveState(policy.state) }; };
  const first = next(); loadState(policy.state, saved); view.time = time;
  assert.deepEqual(next(), first, "the active step and nested policy memory replay together");
  orders = { move: [1, 0] };
  assert.equal(policy.decide(sight, .1), intent, "user movement takes precedence");
  orders = null; loadState(policy.state, saved); view.resumed = true;
  assert.equal(policy.decide(sight, .1), intent, "a sub-mind return abandons the interrupted step");
  view.resumed = false;
  assert.equal(policy.decide(sight, .1), intent, "old contact records cannot launch it again after resumption");
});

test("an obstructed attack entry asks navigation for a feasible range point and forks that request", () => {
  const spec = { segments: [] }, foe = { id: "foe", side: "right", out: false, spec, centre: { x: 2, y: 1, z: 0 }, velocity: { x: 0, y: 0, z: 0 } };
  const window = { at: [2, 1, 0], along: [.8, 1.2], across: [-.1, .1], facing: .3, speed: .1 };
  const engagement = { phase: "approach", focus: "foe", pending: { key: "strike" },
    candidates: [{ key: "strike", readiness: { kind: "position", window } }] };
  const intent = { move: null, face: 3.141592653589793 / 2, actions: [], movement: { kind: "place", points: [{ x: 1, z: 0 }], near: .04 } };
  const base = { name: "fixture", state: { calls: 0 }, engagement, decide() { this.state.calls++; return intent; } };
  const routed = routeAround(base, () => null), navigator = navigatorOf(partLookup, spec, null);
  const view = { time: 0, stance: { centre: { x: -2, y: 1, z: 0 }, velocity: { x: 0, z: 0 } },
    senses: { side: "left", others: [foe], solids: [{ name: "pillar", kind: "box", centre: [1, 1, 0], size: [.8, 2, 1] }] } };
  const sight = { view, report: { heading: intent.face, navigation: navigator.report } }, gait = { envelope: null, stopping: 1 };
  navigator.step(sight, intent.movement, gait, 1, 1 / 120);
  assert.equal(navigator.report.status, "unreachable", "the fixture's ordinary entry is inside a pillar");
  const saved = saveState({ tactics: routed.state, navigation: navigator.state });
  const next = () => { const decision = routed.decide(sight, 1 / 120), movement = navigator.step(sight, decision.movement, gait, 1, 1 / 120);
    return { decision, movement, status: navigator.report.status, goal: { ...navigator.report.goal }, state: saveState({ tactics: routed.state, navigation: navigator.state }) }; };
  const first = next();
  assert.equal(first.decision.movement.kind, "range");
  assert.equal(first.status, "moving", "the actual navigator finds another reachable entry");
  assert.ok(first.movement.move, "the feasible route asks for physical travel");
  loadState({ tactics: routed.state, navigation: navigator.state }, saved);
  assert.deepEqual(next(), first, "the fallback and route replay together");
  intent.actions = [{ id: 1 }];
  assert.equal(routed.decide(sight, 1 / 120), intent, "an admitted action returns control to ordinary tactics");
  assert.equal(routed.state.active, false);
});

/** Ordinary policies with distinguishable decisions and an external contact signal. */
function learningFixture(signal) {
  const make = pace => { const state = { calls: 0 }; return { name: "fixture", state, engagement: { phase: "attack", focus: "foe" },
    decide() { state.calls++; return { move: null, face: 0, guard: {}, actions: [], pace }; } }; };
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

test("independent body-relative punches fork through preparation, commitment and released recovery", async () => {
  const base = CONTROLLERS.vanguard.defaults;
  const config = { ...base,
    executors: base.executors.flatMap(executor => executor.name === "punch"
      ? ["left", "right"].map(side => ({ ...executor, name: `punch.${side}`, predict: true, anchorAtDrive: true, overlapReturn: true, returnHold: .1 })) : [executor]),
    actions: base.actions.flatMap(action => action.executor === "punch"
      ? ["left", "right"].map(side => ({ ...action, name: `strike.${side}`, executor: `punch.${side}`, effectors: [`hand.${side}`] })) : [action]),
  };
  const built = await buildBout({ left: "workshop-fighter", right: "workshop-fighter", gap: .9,
    minds: { left: config, right: config } }, { engine: BOUT_ENGINE });
  try {
    const { duel, world } = built;
    duel.play([]);
    for (const phase of ["prepare", "commit", "free-return"]) {
      const reached = () => duel.duelists.left.minded.skills.report.actions.some(action => phase === "free-return"
        ? action.phase === "release" && action.holds.length === 0 : action.phase === phase);
      const deadline = duel.clock + 3;
      while (duel.clock < deadline && !reached()) world.step();
      assert.ok(reached(), `the fixture reaches ${phase} before its deadline`);
      const saved = duel.save(), until = duel.steps + world.hz / 2;
      const tail = () => {
        const trace = traceOf([duel.duelists.left.built, duel.duelists.right.built]);
        while (duel.steps < until) { world.step(); trace.take(); }
        return { trace: trace.digest(), minds: saveState({ left: duel.duelists.left.minded.state, right: duel.duelists.right.minded.state }) };
      };
      const first = tail();
      duel.load(saved);
      assert.ok(reached(), "the loaded fork restores its live phase");
      assert.deepEqual(tail(), first, "preparation aim, commitment and recovery replay together to the bit");
    }
  } finally { built.dispose(); }
});

/** A low opponent in reach, a facing body and support that never becomes ready. */
function lowFixture() {
  // Two empty hands that can cover (`handsOf`): knuckles at the end of each arm.
  const hand = (name) => ({ name, points: { knuckles: { value: [0, 0, 0] } } });
  const state = { calls: 0 }, spec = { held: [], effectors: [{ segment: "hand.left" }, { segment: "hand.right" }], segments: [hand("hand.left"), hand("hand.right")] };
  const base = { name: "fixture", state, engagement: { phase: "guard", focus: "foe" }, decide() {
    state.calls++;
    return { move: null, face: Math.PI / 2, guard: {}, actions: [] };
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
  for (const reserved of ["hand.left", "hand.right"]) {
    const { layer, sight } = lowFixture(), original = { posture: {}, pushes: [], stance: null, handPoses: { "hand.left": "open", "hand.right": "open" } };
    const base = { state: {}, envelope: null, report: { reservations: { [`pose:${reserved}`]: 0 } }, command: () => original };
    const intent = { ...layer.tactics.decide(sight, 1), guard: { "hand.left": { threat: [1, .3, 0], guarded: [0, .3, 0] }, "hand.right": { threat: [1, .3, 0], guarded: [0, .3, 0] } } };
    const command = layer.skills(base).command(sight.view, intent, 1), free = reserved === "hand.left" ? "hand.right" : "hand.left";
    assert.deepEqual(command, { ...original, handPoses: { [reserved]: "open", [free]: "fist" } });
    assert.deepEqual(original.handPoses, { "hand.left": "open", "hand.right": "open" }, "the guard does not mutate its service's command");
  }
});
