import test from "node:test";
import assert from "node:assert/strict";
import { buildBout } from "../src/evaluation/bout.ts";
import { traceOf } from "../src/evaluation/trace.ts";
import { loadState, saveState } from "../src/core/state.ts";
import { lowGuard, lowGuardSkills } from "../src/entrants/vanguard/low-guard.ts";
import { STANCE_LOWER } from "../src/core/skills/locomotion/locomotion.ts";
import { CAP_SECONDS } from "../src/arena/duel.ts";
import { BOUT_ENGINE } from "../research/bout.mjs";
import { adaptiveGuard } from "../src/entrants/vanguard/adaptive-guard.ts";
import { routeAround } from "../src/entrants/vanguard/route-around.ts";
import { partLookup, treeFaults, replacedAt, FIGHT_ENTRY, CONTROLLERS, MINDS, GAME } from "../src/entrants/game.ts";
import { VANGUARD } from "../src/entrants/vanguard/index.ts";
import { navigatorOf } from "../src/core/navigation/navigator.ts";
import { flank } from "../src/entrants/vanguard/flank.ts";
import { modelSpec } from "../src/core/models.ts";
import { coreStand } from "./harness/core-stand.mjs";
import { bodyHost } from "../src/core/mind/host.ts";
import { prepareTacticsSkills, tacticsOf } from "../src/core/tactics/tactics-part.ts";
import { labMind, labPresets } from "../src/lab/scenarios.ts";
import { controlsFor } from "../src/arena/matchup.ts";
import { labActor } from "../src/lab/actor.ts";
import { standIntent } from "../src/core/intent/intent.ts";
import { parseMind, writeMind } from "../src/ui/mind-link.ts";
import { engagementLines } from "../src/ui/action-readout.ts";
import { VANGUARD_EXCHANGE } from "../src/entrants/vanguard/exchange.ts";
import { builtAngles, createMind } from "../src/core/mind/minds.ts";
import { cos, hypot, sin } from "../src/core/math/real.ts";
import { armedActions, actionConfigFaults } from "../src/core/tactics/action-config.ts";
import { LOADOUTS, withLoadout } from "../src/core/items/held.ts";
import { holdsNothing } from "../src/core/skills/strikes/held-strike.ts";

test("Vanguard routes held weapons and empty hands through their supported actions", () => {
  for (const [model, id] of [["workshop-fighter", "vanguard-warrior"], ["workshop-rogue", "vanguard-rogue"], ["crypt-skeleton", "vanguard-skeleton"]]) {
    const bare = modelSpec(model), config = MINDS[id].config;
    const punches = config.actions.filter(action => config.executors.find(executor => executor.name === action.executor).kind === "vanguard:punch");
    assert.deepEqual(armedActions(partLookup, bare, config.executors, config.actions), punches, "equipment choices do not enter an empty-handed kit");
    for (const loadout of LOADOUTS) {
      const spec = withLoadout(bare, loadout), actions = armedActions(partLookup, spec, config.executors, config.actions);
      assert.deepEqual(actionConfigFaults(partLookup, spec, config.executors, actions), []);
      for (const action of actions) {
        const executor = config.executors.find(executor => executor.name === action.executor);
        for (const hand of action.effectors) assert.equal(holdsNothing(spec, hand), executor.kind === "vanguard:punch",
          `${id}, ${JSON.stringify(loadout)}: ${executor.kind} uses the correct physical endpoint`);
      }
    }
    for (const loadout of LOADOUTS) assert.equal(controlsFor(model, loadout).includes(id), armedActions(partLookup, withLoadout(bare, loadout), config.executors, config.actions).length > 0,
      `${id} is offered with ${JSON.stringify(loadout)} exactly where it has an action`);
    const occupied = withLoadout(bare, { left: "buckler", right: "sword" });
    assert(armedActions(partLookup, occupied, config.executors, config.actions).some(action => action.effectors.includes("hand.right")),
      "a shield and sword leave a physical weapon action available");
  }
});

test("Vanguard weapon actions drive a held physical endpoint with both hands occupied", async () => {
  for (const [held, action] of [["sword", "cut"], ["sword", "thrust"]]) {
    const config = MINDS["vanguard-warrior"].config, spec = withLoadout(modelSpec("workshop-fighter"), { left: "buckler", right: held });
    const stand = await coreStand(spec, { joints: builtAngles(GAME, spec, config), engine: BOUT_ENGINE });
    const state = { active: null, target: null, started: false, driven: false, peak: 0 };
    const script = { state, decide(sight) {
      const view = sight.view, heading = sight.report.heading;
      if (!state.active && view.time >= 2) {
        state.target ??= { kind: "point", at: [view.stance.centre.x, view.head.y - .3, view.stance.centre.z + .6] };
        const around = { heading, placed: view.stance.phase === "stand", support: sight.report.support ?? null, walk: null, lower: STANCE_LOWER };
        let ready = sight.readiness(view, action, "hand.right", state.target, around);
        if (ready.kind === "position") {
          const along = (ready.window.along[0] + ready.window.along[1]) / 2, across = (ready.window.across[0] + ready.window.across[1]) / 2;
          state.target.at = [view.stance.centre.x + along * sin(heading) + across * cos(heading), state.target.at[1],
            view.stance.centre.z + along * cos(heading) - across * sin(heading)];
          ready = sight.readiness(view, action, "hand.right", state.target, around);
        }
        if (ready.kind === "ready") { state.active = { id: sight.instance(), action, effector: "hand.right", target: state.target }; state.started = true; }
      }
      return { move: null, face: heading, guard: {}, actions: state.active ? [state.active] : [] };
    } };
    const minded = createMind(GAME, stand.built, stand.world, config, { name: "weapon fixture", orders: () => null, script });
    try {
      while (!state.driven && stand.world.time < 8 && !minded.body.down) {
        stand.world.step();
        if (!minded.skills.report.actions.some(one => one.phase === "commit" && one.action === action)) continue;
        const speed = hypot(...minded.body.view.effectors["hand.right"].feedback.velocity);
        state.peak = Math.max(state.peak, speed);
        const command = minded.skills.state.command, goal = command.effectors?.["hand.right"], item = spec.held.find(one => one.segment === "hand.right").item;
        const controlsItem = command.pushes.length > 0 || goal?.places.some(place => Object.hasOwn(item.points, place.point));
        state.driven = !!controlsItem && speed > .1;
      }
      assert(state.started, `${held}/${action}: the physical fixture never reached admission`);
      assert.equal(minded.body.down, false, `${held}/${action}: the fixture fell before the weapon moved`);
      assert(state.driven, `${held}/${action}: no committed weapon motion, ${JSON.stringify(state)}`);
    } finally { minded.body.dispose(); stand.dispose(); }
  }
});

/** A detached public report, read through the same formatter as inspection. */
function reportOf(tactics) {
  const before = saveState(tactics.state), report = JSON.parse(JSON.stringify(tactics.engagement));
  assert.deepEqual(engagementLines(tactics.engagement), engagementLines(report));
  assert.deepEqual(saveState(tactics.state), before, "reading a report changes no decision memory");
  return report;
}

test("contact selection credits guarded impacts once, ignores unowned work and replays its decisions", () => {
  const foe = { id: "foe", side: "other", out: false, down: false, centre: { x: 0, y: 1, z: 1 },
    spec: { segments: [{ name: "trunk" }, { name: "guard" }], marks: { middle: ["trunk"] } },
    segments: new Map([["guard", { centre: { x: 0, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: 0 }, spin: { x: 0, y: 0, z: 0 } }]]) };
  const feedback = (speed) => ({ completedStep: 0, velocity: [speed, 0, 0], pairs: [] });
  const view = { time: 0, resumed: false, down: false, stance: { centre: { x: 0, y: 1, z: 0 }, phase: "stand" },
    senses: { side: "self", out: false, others: [foe] }, effectors: { "hand.right": { feedback: feedback(1) }, "hand.left": { feedback: feedback(2) } } };
  const report = { heading: 0, actions: [], ledger: [] }, clock = { id: 0, step: 0 };
  const sight = { view, report, instance: () => ++clock.id,
    readiness: () => report.actions.length ? { kind: "waiting", reason: "resources held" } : { kind: "ready" } };
  const action = { name: "strike", executor: "punch", effectors: ["hand.right", "hand.left"], regions: [{ kind: "mark", mark: "middle" }] };
  const tactics = VANGUARD_EXCHANGE.make({ spec: { effectors: action.effectors.map(segment => ({ segment })) },
    actions: [action], estimates: {}, aims: new Map(), orders: () => null, parts: partLookup },
    { ...VANGUARD_EXCHANGE.defaults, list: [{ kind: "attack" }], revisit: 8 });
  const dt = 1 / 120, read = () => tactics.decide(sight, dt);
  const advance = () => { view.time = ++clock.step * dt; for (const e of Object.values(view.effectors)) e.feedback.completedStep = clock.step; };
  const impact = impulse => ({ target: { kind: "body", body: "foe", segment: "guard", guard: true }, point: [0, 0, 0], normal: [1, 0, 0], impulse, loaded: true, onset: true });
  const emptyCounts = () => Object.fromEntries(["prepare", "commit", "release"].map(phase => [phase, { target: 0, block: 0, incidental: 0, world: 0 }]));
  const end = request => { const counts = emptyCounts(); counts.commit.block = 1; return { ...request, sequence: report.ledger.length + 1, began: view.time - 2 * dt, ended: view.time,
    committed: true, ending: { kind: "completed" }, contacts: { counts, loadedInCommit: true, blockedSegments: ["guard"], lastTarget: null },
    observations: [{ phase: "commit", kind: "block", by: request.effector, struck: { body: "foe", segment: "guard" }, step: clock.step - 1, time: view.time - dt }], observed: 1 }; };
  const first = read().actions[0];
  assert.equal(first.effector, "hand.right");
  report.actions = [{ ...first, phase: "commit" }]; advance(); view.effectors[first.effector].feedback.pairs = [impact(3)]; read();
  read();
  advance(); report.actions = []; view.effectors[first.effector].feedback.pairs = []; report.ledger.push(end(first));
  const second = read().actions[0];
  assert.equal(second.effector, "hand.left", "an untried available hand gets a trial");
  report.actions = [{ ...second, phase: "commit" }]; advance(); view.effectors[second.effector].feedback.pairs = [impact(2)]; read();
  advance(); report.actions = []; view.effectors[second.effector].feedback.pairs = []; report.ledger.push(end(second));
  const chosen = read().actions[0];
  assert.equal(chosen.effector, "hand.left", "guard impacts count once per completed interval, so the stronger hand wins");
  report.actions = [{ ...chosen, phase: "commit" }]; advance(); view.effectors[chosen.effector].feedback.pairs = [impact(2)]; read();
  report.ledger.push(end({ ...chosen, id: 999 })); read();
  advance(); report.actions = []; view.effectors[chosen.effector].feedback.pairs = []; report.ledger.push(end(chosen));
  const next = read().actions[0];
  assert.equal(next.effector, "hand.left", "another policy's completed work is not a zero-score trial");
  report.actions = [{ ...next, phase: "commit" }]; advance(); read();
  const state = saveState(tactics.state), checkpoint = structuredClone({ view, report, clock });
  const tail = () => { const result = []; for (let i = 0; i < 4; i++) { advance();
      view.effectors[next.effector].feedback.pairs = i % 2 === 0 ? [impact(1)] : [];
      result.push({ intent: read(), report: reportOf(tactics) }); }
    return { result, state: saveState(tactics.state) }; };
  const expected = tail(); loadState(tactics.state, state); Object.assign(view, checkpoint.view); Object.assign(report, checkpoint.report); Object.assign(clock, checkpoint.clock);
  assert.deepEqual(tail(), expected);
});

test("each humanoid is offered only its own named Vanguard calibration", () => {
  for (const [model, id] of [["workshop-fighter", "vanguard-warrior"], ["workshop-rogue", "vanguard-rogue"], ["crypt-skeleton", "vanguard-skeleton"]]) {
    assert.deepEqual(controlsFor(model).filter(choice => choice.startsWith("vanguard-")), [id]);
    assert.deepEqual(labPresets(modelSpec(model), "attack").filter(preset => preset.config.kind === "vanguard:mind").map(preset => preset.id), [id]);
  }
});

test("a Vanguard preset's edited slots reach construction unchanged and its full configuration links", async () => {
  const spec = modelSpec("crypt-skeleton"), presets = Object.entries(VANGUARD.presets);
  for (const [, { config }] of presets) assert.deepEqual(parseMind(writeMind(config), spec, FIGHT_ENTRY), { config, faults: [] });
  const base = MINDS["vanguard-skeleton"].config;
  const edited = replacedAt(replacedAt(replacedAt(replacedAt(base, "tactics.flank", false), "executors.punch.lead", .2),
    "executors.punch.anchorAtDrive", false), "locomotion", { kind: "stance-walk" });
  const stand = await coreStand(spec), seen = [];
  const parts = { of(role, config) {
    const part = partLookup.of(role, config);
    return ["tactics", "locomotion", "executor"].includes(role) ? { ...part, make(...args) { seen.push({ role, config: args[1] }); return part.make(...args); } } : part;
  } };
  const host = bodyHost(stand.built, stand.world, {}, parts);
  try {
    CONTROLLERS["vanguard:mind"].create(host.host, edited, { name: "fixture", orders: () => null });
    assert.deepEqual(seen.find(one => one.role === "tactics").config, edited.tactics);
    assert.deepEqual(seen.find(one => one.role === "locomotion").config, edited.locomotion);
    assert.deepEqual(seen.filter(one => one.role === "executor").map(one => one.config), edited.executors);
  } finally { host.made().dispose(); stand.dispose(); }
});

test("low-guard dependencies are checked through every nested planner before a bout runs", async () => {
  const base = MINDS["vanguard-warrior"].config;
  for (const tactics of [base.tactics, { kind: "vanguard:plan", plan: { kind: "vanguard:plan", plan: base.tactics } }]) {
    for (const support of [null, { kind: "absent-support" }]) {
      const config = { ...base, tactics, support }, faults = treeFaults(config);
      assert.ok(faults.length > 0, "missing or incompatible support cannot enter the runtime");
      if (support === null) assert.ok(faults.some(fault => fault.includes("lowGuard needs the support fold")));
      await assert.rejects(buildBout({ left: "workshop-fighter", right: "workshop-fighter", minds: { left: config, right: base } }, { engine: BOUT_ENGINE }));
    }
    assert.deepEqual(treeFaults({ ...base, tactics }), []);
  }
});

test("nested Vanguard planners prepare the inner skills once and preserve them through their low covers", () => {
  const state = { prepared: 0 }, inner = { name: "fixture", state, decision: { focus: null }, decide: () => standIntent(0) };
  const part = { make: () => inner, decisionCapabilities: () => ["focus"],
    prepareSkills(_making, _config, skills, decision) { state.prepared++; assert.equal(decision(), inner.decision); return { ...skills, inner: true }; } };
  const making = { spec: modelSpec("workshop-fighter"), orders: () => null,
    parts: { of: (role, config) => config.kind === "fixture" ? part : partLookup.of(role, config) } };
  const config = { kind: "vanguard:plan", lowGuard: true, plan: { kind: "vanguard:plan", lowGuard: true, plan: { kind: "fixture" } } };
  const tactics = tacticsOf(making, config);
  const skills = { report: {}, envelope: null, state: {} }, prepared = prepareTacticsSkills(making, config, skills, () => tactics.decision);
  assert.equal(state.prepared, 1);
  assert.equal(prepared.inner, true);
  assert.equal(prepared.state, skills.state);
  assert.equal(prepared.report, skills.report);
});

test("the Lab drives Vanguard's chosen kit, with its planner or a supplied script", async () => {
  const config = MINDS["vanguard-rogue"].config, spec = modelSpec("workshop-rogue");
  assert.deepEqual(labMind(config, spec, "attack"), { plays: config, faults: [] });
  const stand = await coreStand(spec), actor = labActor(stand.built, stand.world, { mind: config });
  try {
    const planned = actor.drive(), skills = planned.skills;
    stand.step();
    assert.ok(engagementLines(planned.report.engagement).some(line => line.startsWith("Evasion policy:")));
    const state = { calls: 0 }, observed = [], script = { name: "fixture", state, decide() { state.calls++; return { ...standIntent(0), move: [.1, 0] }; } };
    const scripted = actor.drive(script, { watch: sight => observed.push(sight.report) });
    stand.step();
    assert.equal(state.calls, 1);
    assert.deepEqual(observed, [scripted.skills.report]);
    assert.equal(scripted.state.decider, state);
    assert.ok(skills.gait.envelope.turns.length > 0, "the fixture exposes measured turn limits");
    assert.ok(scripted.skills.state.legs.legs.walkTime > 0, "the selected walk actually runs its startup turn interval");
    assert.deepEqual(scripted.skills.gait.envelope, skills.gait.envelope, "the same calibrated legs drive both paths");
  } finally { actor.dispose(); stand.dispose(); }
});

test("a contact-triggered step preserves live strokes and orders, and forks its active decision", () => {
  const state = { calls: 0 }, intent = { move: null, face: 0, guard: {}, actions: [] };
  const base = { name: "fixture", state, decision: { focus: "foe" }, engagement: { phase: "attack", focus: "foe" }, decide() { state.calls++; return intent; } };
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
  assert.equal(reportOf(policy).details.find(detail => detail.label === "Blocked step").value, "stepping");
  const next = () => { view.time += .1; return { decision: policy.decide(sight, .1), state: saveState(policy.state), report: reportOf(policy) }; };
  const first = next(); loadState(policy.state, saved); view.time = time;
  assert.deepEqual(next(), first, "the active step and nested policy memory replay together");
  base.engagement = { phase: "out", focus: "wrong-target" };
  loadState(policy.state, saved); view.time = time;
  const withoutReport = next();
  assert.deepEqual(withoutReport.decision, first.decision, "report labels and focus do not control the step");
  assert.deepEqual(withoutReport.state, first.state);
  orders = { move: [1, 0] };
  assert.equal(policy.decide(sight, .1), intent, "user movement takes precedence");
  assert.equal(reportOf(policy).details.find(detail => detail.label === "Blocked step").value, "movement ordered");
  orders = null; loadState(policy.state, saved); view.resumed = true;
  assert.equal(policy.decide(sight, .1), intent, "a sub-mind return abandons the interrupted step");
  view.resumed = false;
  assert.equal(policy.decide(sight, .1), intent, "old contact records cannot launch it again after resumption");
});

test("an obstructed attack entry asks navigation for a feasible range point and forks that request", () => {
  const spec = { segments: [] }, foe = { id: "foe", side: "right", out: false, spec, centre: { x: 2, y: 1, z: 0 }, velocity: { x: 0, y: 0, z: 0 } };
  const window = { at: [2, 1, 0], along: [.8, 1.2], across: [-.1, .1], facing: .3, speed: .1 };
  const engagement = { phase: "approach", focus: "foe", pending: { key: "strike" },
    candidates: [{ key: "strike", action: "strike", effector: "hand.right", target: { body: "foe", region: { kind: "mark", mark: "middle" } }, readiness: { kind: "position", window } }] };
  const intent = { move: null, face: 3.141592653589793 / 2, actions: [], movement: { kind: "place", points: [{ x: 1, z: 0 }], near: .04 } };
  const base = { name: "fixture", state: { calls: 0 }, decision: { focus: "foe", approach: window }, engagement, decide() { this.state.calls++; return intent; } };
  const routed = routeAround(base, () => null), navigator = navigatorOf(partLookup, spec, null);
  const view = { time: 0, stance: { centre: { x: -2, y: 1, z: 0 }, velocity: { x: 0, z: 0 } },
    senses: { side: "left", others: [foe], solids: [{ name: "pillar", kind: "box", centre: [1, 1, 0], size: [.8, 2, 1] }] } };
  const sight = { view, report: { heading: intent.face, navigation: navigator.report } }, gait = { envelope: null, stopping: 1 };
  navigator.step(sight, intent.movement, gait, 1, 1 / 120);
  assert.equal(navigator.report.status, "unreachable", "the fixture's ordinary entry is inside a pillar");
  const saved = saveState({ tactics: routed.state, navigation: navigator.state });
  const next = () => { const decision = routed.decide(sight, 1 / 120), movement = navigator.step(sight, decision.movement, gait, 1, 1 / 120);
    return { decision, movement, status: navigator.report.status, goal: { ...navigator.report.goal }, state: saveState({ tactics: routed.state, navigation: navigator.state }), report: reportOf(routed) }; };
  const first = next();
  assert.equal(first.decision.movement.kind, "range");
  assert.match(first.report.details.find(detail => detail.label === "Entry routing").value, /exact entry unreachable/);
  assert.equal(first.status, "moving", "the actual navigator finds another reachable entry");
  assert.ok(first.movement.move, "the feasible route asks for physical travel");
  loadState({ tactics: routed.state, navigation: navigator.state }, saved);
  assert.deepEqual(next(), first, "the fallback and route replay together");
  base.engagement = undefined;
  loadState({ tactics: routed.state, navigation: navigator.state }, saved);
  const withoutReport = next();
  assert.deepEqual(withoutReport.decision, first.decision, "routing works with no inspection report");
  assert.deepEqual(withoutReport.movement, first.movement);
  assert.deepEqual(withoutReport.state, first.state);
  intent.actions = [{ id: 1 }];
  assert.equal(routed.decide(sight, 1 / 120), intent, "an admitted action returns control to ordinary tactics");
  assert.equal(routed.state.active, false);
});

/** Ordinary policies with distinguishable decisions and an external contact signal. */
function learningFixture(signal, wrap = (attacking, defensive) => adaptiveGuard(attacking, defensive, true)) {
  const make = pace => { const state = { calls: 0 }; return { name: "fixture", state, decision: { focus: "foe", evading: pace === 2, approach: null }, engagement: { phase: "attack", focus: "foe" },
    decide() { state.calls++; return { move: null, face: 0, guard: {}, actions: [], pace }; } }; };
  const attacking = make(1), defensive = make(2), policy = wrap(attacking, defensive);
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
  const tail = () => { const decisions = []; for (let i = 0; i < 20; i++) decisions.push({ decision: step(), report: reportOf(policy) }); return { decisions, state: saveState(policy.state) }; };
  const first = tail(); loadState(policy.state, saved); Object.assign(clock, checkpoint);
  assert.deepEqual(tail(), first, "policy scores, motion samples and both decision memories replay exactly");
});

test("adaptive and nested planners prepare one shared kit and forward the active decision across switches and forks", () => {
  let preparations = 0, prepared, active;
  const fixture = learningFixture(() => 0, (attacking, defensive) => {
    const behaviourPart = { make: (_making, config) => config.list.some(item => item.kind === "evade") ? defensive : attacking,
      prepareSkills(_making, _config, skills, decision) {
        preparations++;
        return { ...skills, command() { active = decision(); return active; } };
      } };
    const making = { spec: modelSpec("workshop-fighter"), orders: () => null,
      parts: { of: (role, config) => config.kind === "behaviours" ? behaviourPart : partLookup.of(role, config) } };
    const config = { kind: "vanguard:plan", plan: { ...MINDS["vanguard-warrior"].config.tactics, lowGuard: false, routeAround: false } };
    const tactics = tacticsOf(making, config);
    prepared = prepareTacticsSkills(making, config, { state: {}, report: {} }, () => tactics.decision);
    for (const policy of [attacking, defensive]) Object.defineProperty(policy, "engagement", {
      get() { throw new Error("diagnostic report read by adaptive decisions"); },
    });
    return tactics;
  });
  const seen = new Set();
  for (let i = 0; i < 25; i++) {
    const intent = fixture.step(); prepared.command(); seen.add(active);
    assert.equal(active, fixture.policy.decision);
    assert.equal(intent.pace, active.evading ? .2 : 1, "the pace layer reads the selected operational context");
  }
  assert.deepEqual(seen, new Set([fixture.attacking.decision, fixture.defensive.decision]));
  assert.equal(preparations, 1);
  const saved = saveState(fixture.policy.state), clock = { ...fixture.clock };
  const tail = () => Array.from({ length: 20 }, () => { const intent = fixture.step(); prepared.command(); return { intent, context: { ...active } }; });
  const first = tail(); loadState(fixture.policy.state, saved); Object.assign(fixture.clock, clock);
  assert.deepEqual(tail(), first);
  assert.equal(preparations, 1, "policy changes and restored state do not rebuild the shared kit");
});

test("enabled Vanguard layers reject a planner that lacks their operational context", () => {
  const base = MINDS["vanguard-warrior"].config;
  for (const [layer, capability] of [["lowGuard", "focus"], ["flank", "focus"], ["slowEvade", "evading"], ["routeAround", "approach"]]) {
    const tactics = { kind: "vanguard:plan", [layer]: true, plan: { kind: "stand" } };
    assert.ok(treeFaults({ ...base, tactics }).some(fault => fault.includes(`${layer} needs a plan providing ${capability}`)));
    assert.deepEqual(treeFaults({ ...base, tactics: { ...tactics, [layer]: false } }), []);
  }
});

test("adaptive evasion rejects identical policy lists after every evade behaviour is removed", () => {
  for (const id of ["vanguard-warrior", "vanguard-rogue", "vanguard-skeleton"]) {
    const base = MINDS[id].config;
    for (const list of [[], base.tactics.plan.list.filter(behaviour => behaviour.kind !== "evade")]) {
      const tactics = { ...base.tactics, plan: { ...base.tactics.plan, list } }, config = { ...base, tactics };
      const faults = treeFaults(config);
      assert.ok(faults.includes("tactics: adaptiveEvade needs an evade behaviour in its plan"));
      assert.deepEqual(parseMind(writeMind(config), modelSpec("workshop-fighter"), FIGHT_ENTRY).faults, faults);
      assert.deepEqual(treeFaults({ ...base, tactics: { ...tactics, adaptiveEvade: false, revisitEvade: false } }), []);
    }
    assert.deepEqual(treeFaults(base), [], "the selected adaptive policy still has a distinct evasion alternative");
  }
});

test("low-cover decisions and skill commands do not read diagnostic reports", () => {
  const { layer, sight, base } = lowFixture();
  const saved = saveState(layer.tactics.state), original = { posture: {}, pushes: [], stance: null, handPoses: {} };
  const skills = layer.skills({ state: {}, envelope: null, report: { reservations: {} }, command: () => original });
  const next = () => { const intent = layer.tactics.decide(sight, 1); return { intent, command: skills.command(sight.view, intent, 1), state: saveState(layer.tactics.state) }; };
  const expected = next();
  for (const report of [undefined, { phase: "out", focus: "another-foe", candidates: [], pending: null }]) {
    loadState(layer.tactics.state, saved); base.engagement = report;
    assert.deepEqual(next(), expected);
  }
  loadState(layer.tactics.state, saved);
  Object.defineProperty(base, "engagement", { get() { throw new Error("diagnostic report read by a decision"); } });
  assert.deepEqual(next(), expected);
});

test("Vanguard movement layers preserve stricter intent and ordered ceilings, including direct steps and zero", () => {
  const fixture = (kind, pace, ordered = null) => {
    const intent = Object.freeze({ move: kind === "evade-step" ? Object.freeze([.6, .8]) : null, face: 0,
      guard: Object.freeze({}), actions: Object.freeze([{ id: 1 }]), ...(pace === undefined ? {} : { pace }),
      ...(kind === "evade-route" ? { movement: Object.freeze({ kind: "direct", direction: Object.freeze({ x: 1, z: 0 }) }) } : {}) });
    const base = { name: "fixture", state: {}, decision: { focus: "foe", evading: true }, decide: () => intent };
    const orders = () => ordered;
    if (kind.startsWith("evade-")) {
      const making = { orders, parts: { of: (role, config) => config.kind === "fixture" ? { make: () => base } : partLookup.of(role, config) } };
      return { intent, tactics: tacticsOf(making, { kind: "vanguard:plan", slowEvade: true, plan: { kind: "fixture" } }), sight: {} };
    }
    if (kind === "flank") {
      const foe = { id: "foe", out: false, centre: { x: 0, y: 1, z: 1 }, spec: { marks: { high: "head" } },
        segments: new Map([["head", { centre: { x: 0, y: 1.5, z: 1 } }], ["guard", { centre: { x: .2, y: 1, z: 1 } }]]) };
      const sight = { view: { time: 1, down: false, stance: { centre: { x: 0, y: 1, z: 0 }, support: { y: 0 } },
        senses: { others: [foe], solids: [] } }, report: { heading: 0, actions: [], ledger: [1, 2].map(sequence => ({
          sequence, target: { kind: "body", body: "foe" }, committed: true,
          contacts: { counts: { commit: { target: 0, block: 1 } }, blockedSegments: ["guard"] },
        })) } };
      return { intent, sight, tactics: flank(base, { segments: [] }, orders) };
    }
    const low = lowFixture(orders);
    low.base.decide = () => intent;
    if (kind === "low-approach") low.sight.view.senses.others[0].segments.get("head").centre.x = .9;
    else low.sight.view.stance.facing = 0;
    return { intent, sight: low.sight, tactics: low.layer.tactics };
  };
  for (const kind of ["evade-step", "evade-route", "low-approach", "low-turn", "flank"]) {
    const reference = fixture(kind), ordinary = reference.tactics.decide(reference.sight, 1 / 120);
    assert.ok(ordinary.pace > 0, `${kind} reaches its movement layer`);
    if (kind === "low-approach") assert.equal(ordinary.movement?.kind, "range");
    else if (kind === "evade-route") assert.equal(ordinary.movement?.kind, "direct");
    else assert.ok(ordinary.move?.some(value => value !== 0), `${kind} requests a direct step`);
    for (const pace of [undefined, 0, .05, 2]) for (const orderedPace of [undefined, 0, .05, 2]) {
      const ordered = Object.freeze({ face: null, ...(orderedPace === undefined ? {} : { pace: orderedPace }) });
      const { intent, tactics, sight } = fixture(kind, pace, ordered), before = JSON.stringify({ intent, ordered });
      const ceiling = Math.min(ordinary.pace, pace ?? Infinity, orderedPace ?? Infinity);
      let move = ordinary.move;
      if (move && !ordinary.movement) {
        const speed = Math.sqrt(move[0] * move[0] + move[1] * move[1]);
        if (speed > ceiling) move = ceiling === 0 ? null : move.map(value => value * (ceiling / speed));
      }
      assert.deepEqual(tactics.decide(sight, 1 / 120), { ...ordinary, move, pace: ceiling },
        `${kind} preserves the least ceiling: intent ${pace}, order ${orderedPace}`);
      assert.equal(JSON.stringify({ intent, ordered }), before, "the layer owns its changed intent");
    }
    for (const move of [null, { kind: "direct", direction: { x: 1, z: 0 } }]) {
      const { intent, tactics, sight } = fixture(kind, .05, { face: null, move, pace: 0 });
      assert.equal(tactics.decide(sight, 1 / 120), intent, "explicit movement orders retain precedence");
    }
  }
});

test("a quiet policy trial is revisited when the contact conditions change", () => {
  const change = CAP_SECONDS / 3;
  const { policy, clock, step } = learningFixture((mode, time) => mode === 1 ? .1 : time > change ? 1 : 0);
  let quietTrial = false, revisited = false, explained = false;
  while (clock.time < CAP_SECONDS) {
    const decision = step();
    explained ||= reportOf(policy).details.some(detail => detail.label === "Policy selection" && detail.value === "scheduled revisit");
    if (decision.pace === 2) { if (clock.time <= change) quietTrial = true; else revisited = true; }
  }
  assert.ok(quietTrial, "the fixture first samples the policy while its target contacts are absent");
  assert.ok(revisited, "an earlier zero score does not prevent trying the policy after conditions change");
  assert.ok(explained, "the report identifies a scheduled revisit rather than claiming a score improvement");
});

test("independent body-relative punches fork through preparation, commitment and released recovery", async () => {
  const base = CONTROLLERS["vanguard:mind"].defaults;
  const config = { ...base,
    executors: base.executors.flatMap(executor => executor.name === "punch"
      ? ["left", "right"].map(side => ({ ...executor, name: `punch.${side}`, predict: true, anchorAtDrive: true, overlapReturn: true, returnHold: .1 })) : [executor]),
    actions: base.actions.flatMap(action => action.executor === "punch"
      ? ["left", "right"].map(side => ({ ...action, name: `strike.${side}`, executor: `punch.${side}`, effectors: [`hand.${side}`] })) : [action]),
  };
  const built = await buildBout({ left: "workshop-fighter", right: "workshop-fighter", gap: 1.2,
    minds: { left: config, right: config } }, { engine: BOUT_ENGINE });
  try {
    const { duel, world } = built;
    duel.play([]);
    for (const phase of ["prepare", "commit", "free-return"]) {
      const reached = () => duel.duelists.left.minded.skills.report.actions.some(action => phase === "free-return"
        ? action.phase === "release" && action.holds.length === 0 : action.phase === phase);
      while (duel.clock < CAP_SECONDS && !reached()) world.step();
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
function lowFixture(orders = () => null) {
  // Two empty hands that can cover (`handsOf`): knuckles at the end of each arm.
  const hand = (name) => ({ name, points: { knuckles: { value: [0, 0, 0] } } });
  const state = { calls: 0 }, spec = { held: [], effectors: [{ segment: "hand.left" }, { segment: "hand.right" }], segments: [hand("hand.left"), hand("hand.right")] };
  const base = { name: "fixture", state, decision: { focus: "foe" }, engagement: { phase: "guard", focus: "foe" }, decide() {
    state.calls++;
    return { move: null, face: Math.PI / 2, guard: {}, actions: [] };
  } };
  const view = { time: 0, down: false, stance: { centre: { x: 0, y: 1, z: 0 }, support: { y: 0 }, facing: Math.PI / 2 },
    senses: { others: [{ id: "foe", out: false, spec: { marks: { high: "head" } }, segments: new Map([["head", { centre: { x: .4, y: .3, z: 0 } }]]) }] } };
  const sight = { view, report: { support: { stage: "stand", ready: false } } };
  const tactics = lowGuard(base, spec, orders);
  return { layer: { tactics, skills: skills => lowGuardSkills(skills, spec, () => tactics.decision) }, sight, base };
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
    return { commands, state: saveState(layer.tactics.state), report: reportOf(layer.tactics) };
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

test('a planted low guard yields an unmet entry, finishes rising, and preserves orders and live actions', () => {
  const movement = { kind: 'place', points: [{ x: 0, z: .1 }], near: .04 };
  const request = { id: 1, action: 'low-punch', effector: 'hand.right', target: { kind: 'body', body: 'foe', region: { kind: 'mark', mark: 'middle' } } };
  let actions = [], orders = null;
  const decision = { focus: 'foe', approach: { at: [0, .3, .5], along: [.4, .6], across: [-.1, .1], facing: .3, speed: .1 } };
  const base = { name: 'entry fixture', state: {}, decision,
    decide: () => ({ move: null, face: 0, movement, guard: {}, actions }) };
  const guard = lowGuard(base, modelSpec('workshop-fighter'), () => orders, true);
  const sight = { view: { time: 0, down: false, stance: { centre: { x: 0, y: 1, z: 0 }, support: { y: 0 }, facing: 0 },
    senses: { others: [{ id: 'foe', out: false, spec: { marks: { high: 'head' } }, segments: new Map([['head', { centre: { x: 0, y: .3, z: .5 } }]]) }] } },
    report: { actions: [], support: { stage: 'low', ready: true } } };
  const step = () => { const intent = guard.decide(sight, .1); sight.view.time += .1; return intent; };
  assert.ok(step().lower > STANCE_LOWER, 'the fixture reaches an actual planted-low request before testing its exit');
  const saved = saveState(guard.state), start = sight.view.time;
  const untilRise = () => {
    for (let i = 0; i < 200; i++) { const intent = step(); if (intent.lower === STANCE_LOWER) return { intent, time: sight.view.time }; }
    assert.fail('ready support with no admissible attack holds the legs indefinitely');
  };
  const first = untilRise();
  assert.deepEqual(first.intent, { move: null, face: 0, movement: undefined, lower: STANCE_LOWER,
    guard: {}, actions: [] });
  loadState(guard.state, saved); sight.view.time = start;
  assert.deepEqual(untilRise(), first, 'the entry wait and rise decision fork exactly');
  sight.report.support = { stage: 'rise', ready: false };
  assert.equal(step().lower, STANCE_LOWER);
  sight.report.support = { stage: 'stand', ready: false };
  assert.equal(step().lower, STANCE_LOWER, 'the rise finishes before low support is requested again');
  assert.ok(step().lower > STANCE_LOWER);
  sight.report.support = { stage: 'low', ready: true }; sight.report.actions = [request]; actions = [request];
  for (let i = 0; i < 200; i++) {
    const intent = step(); assert.equal(intent.actions, actions); assert.ok(intent.lower > STANCE_LOWER);
    assert.equal(intent.interrupt, undefined, 'an owned stroke is left to its executor');
  }
  actions = []; sight.report.actions = []; orders = { move: null };
  assert.deepEqual(step(), { move: null, face: 0, movement, guard: {}, actions: [] }, 'an explicit movement order keeps the base intent');
  orders = null; sight.report.support = { stage: 'low', ready: true }; actions = [request];
  for (let i = 0; i < 200; i++) {
    const intent = step();
    assert.equal(intent.actions, actions, 'a ready new request gets its chance to acquire the body');
    assert.ok(intent.lower > STANCE_LOWER, 'a new request is not preempted by the reposition timer');
  }

});

test("the configured fallen-target wait stops the chase, preserves owned actions and orders, and is neutral without a fall", () => {
  const live = { id: 1, action: "strike", effector: "hand.right", target: { kind: "point", at: [1, 1, 0] } };
  const intent = { move: [1, 0], movement: { kind: "direct", direction: { x: 1, z: 0 } }, face: 1, guard: {}, actions: [live, { ...live, id: 2 }] };
  let orders = null;
  const make = waitFallen => {
    const base = { name: "fixture", state: { calls: 0 }, decision: { focus: "foe" }, decide() { this.state.calls++; return intent; } };
    const parts = { of: (role, config) => config.kind === "fixture" ? { make: () => base } : partLookup.of(role, config) };
    return tacticsOf({ spec: modelSpec("workshop-rogue"), orders: () => orders, parts },
      { kind: "vanguard:plan", lowGuard: true, waitFallen, plan: { kind: "fixture" } });
  };
  const foe = { id: "foe", out: false, down: true, spec: { marks: { high: "head" } },
    segments: new Map([["head", { centre: { x: 1.5, y: .3, z: 0 } }]]) };
  const sight = { view: { time: 0, down: false, stance: { centre: { x: 0, y: 1, z: 0 }, support: { y: 0 }, facing: 0 }, senses: { others: [foe] } },
    report: { heading: .2, support: { stage: "stand", ready: false }, actions: [] } };
  const policy = make(true), standing = policy.decide(sight, 1 / 120);
  assert.deepEqual(standing, { ...intent, move: null, movement: undefined, face: .2, lower: STANCE_LOWER, actions: [] });
  sight.report.actions = [live];
  assert.deepEqual(policy.decide(sight, 1 / 120), { ...intent, actions: [live] }, "the owned request continues, but no new stroke starts");
  orders = { move: [1, 0] };
  assert.equal(policy.decide(sight, 1 / 120), intent, "explicit movement retains the entire base intent");
  orders = null; sight.report.actions = []; sight.report.support.stage = "low";
  policy.decide(sight, 1 / 120); assert.equal(policy.state.rising, true);
  foe.down = false;
  assert.equal(policy.decide(sight, 1 / 120).lower, STANCE_LOWER, "the rise continues after the target gets up");
  const saved = saveState(policy.state), next = () => ({ intent: policy.decide(sight, 1 / 120), state: saveState(policy.state) });
  const once = next(); loadState(policy.state, saved); assert.deepEqual(next(), once, "the complete planner memory forks");
  sight.report.support.stage = "stand";
  assert.equal(policy.decide(sight, 1 / 120).lower, STANCE_LOWER);
  assert.ok(policy.decide(sight, 1 / 120).movement, "ordinary approach resumes after the rise completes");
  const ordinary = make(false), optional = make(true);
  for (let step = 0; step < 240; step++) {
    sight.view.time = step / 10;
    foe.segments.get("head").centre.y = step % 17 < 15 ? .3 : 1.2;
    foe.segments.get("head").centre.x = step % 31 < 10 ? 1.5 : .4;
    sight.report.support.stage = ["stand", "low", "rise"][step % 3];
    sight.report.actions = step % 5 === 0 ? [live] : [];
    orders = step % 11 === 0 ? { move: [1, 0] } : null;
    assert.deepEqual(optional.decide(sight, .1), ordinary.decide(sight, .1));
    assert.deepEqual(saveState(optional.state), saveState(ordinary.state), "all saved state stays exact while no observed opponent fall can activate the option");
  }
  const config = MINDS["vanguard-rogue"].config;
  assert.deepEqual(treeFaults({ ...config, tactics: { ...config.tactics, lowGuard: false, waitFallen: true } }), ["tactics: waitFallen needs lowGuard"]);
});
