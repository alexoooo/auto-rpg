import test from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { modelSpec } from "../src/core/models.ts";
import { PUNCHER } from "../src/core/mind/config.ts";
import { guardPosture } from "../src/core/skills/guard.ts";
import { deciding, labActor } from "../src/lab/actor.ts";
import { startAttack } from "../src/lab/attack-mode.ts";
import { labAddress, labMind, LAB_PRESETS } from "../src/lab/scenarios.ts";
import { coreStand } from "./harness/core-stand.mjs";

const spec = modelSpec("workshop-fighter");

test("Attack defaults to a game mind and refuses tactics that require a scenario script", () => {
  assert.deepEqual(labAddress("?scenario=attack").mind, PUNCHER);
  const result = labMind(LAB_PRESETS.script.config, spec, "attack");
  assert.ok(result.faults.length > 0);
  assert.deepEqual(result.plays, PUNCHER);
});

test("selected physical targets reach the ordinary fighter through senses and orders", async () => {
  const stand = await coreStand(spec, { posture: guardPosture(spec) });
  let intent;
  const actor = labActor(stand.built, stand.world, { mind: PUNCHER,
    around: (tactics) => deciding(tactics, (sight, dt) => intent = tactics.decide(sight, dt)) });
  const attack = startAttack(actor, { count: 3, seed: 7 });
  try {
    const initial = attack.frame();
    assert.equal(initial.targets.length, 3);
    assert.ok(initial.targets.every(target => !target.hit));
    const selected = initial.targets.find(target => target.id !== initial.selected);
    attack.select(selected.id);
    stand.step();
    assert.equal(attack.skills.report.engagement.focus, selected.id);
    assert.ok(attack.skills.report.engagement.candidates.every(candidate => candidate.target.body === selected.id));
    assert.ok(["guard", "approach"].includes(attack.skills.report.engagement.phase));
    assert.deepEqual(intent.actions, [], "approach does not issue a premature request");
    assert.equal(actor.body.view.senses.others.length, 3);
    stand.step(10);
    assert.equal(attack.frame().hits, 0);
    const still = attack.frame().targets.find(target => target.id === selected.id);
    assert.ok(Vector3.Distance(Vector3.FromArray(still.centre), Vector3.FromArray(selected.centre)) < 1e-6);
    attack.state.speed = 0.4;
    attack.wind.settings = { rate: 120, strength: 1 };
    stand.step(12);
    const moved = attack.frame().targets.find(target => target.id === selected.id);
    assert.ok(Vector3.Distance(Vector3.FromArray(moved.centre), Vector3.FromArray(still.centre)) > 0.03);
    const seen = actor.body.view.senses.others.find(target => target.id === selected.id);
    assert.equal(attack.skills.report.engagement.focus, seen.id);
    assert.ok(attack.skills.report.engagement.candidates.every(candidate => candidate.target.body === seen.id));
    assert.ok(attack.wind.state.count > 0);
    attack.select("missing");
    assert.equal(attack.frame().selected, selected.id);
  } finally { attack.dispose(); stand.dispose(); }
});

test("a physical impact releases a target, then removes its collider and senses before replacing it", async () => {
  const stand = await coreStand(spec, { posture: guardPosture(spec) });
  const hung = [], removed = [];
  const actor = labActor(stand.built, stand.world, { mind: LAB_PRESETS.guard.config });
  const attack = startAttack(actor, { count: 1, seed: 7, hears: (built) => {
    hung.push(built); return { dispose: () => removed.push(built) };
  } });
  const original = attack.frame().targets[0].id;
  const segment = hung[0].segments.values().next().value;
  const velocity = new Vector3(), impulse = new Vector3();
  // A physical moving target is driven into the guard; the scenario must read the solver's contact.
  const incoming = stand.world.beforeStep(() => {
    if (attack.frame().hits) return;
    const at = stand.built.segments.get("upperTrunk").node.position;
    segment.body.linearVelocityToRef(velocity);
    impulse.copyFrom(at).subtractInPlace(segment.node.position).normalize().scaleInPlace(3).subtractInPlace(velocity).scaleInPlace(segment.rigid.mass);
    segment.body.applyImpulse(impulse, segment.node.position);
  });
  try {
    for (let step = 0; step < 360 && !attack.frame().hits; step++) stand.step();
    incoming.dispose();
    assert.equal(attack.frame().hits, 1);
    assert.deepEqual(attack.frame().ledger, [], "a torso impact without a requested action earns no action contact");
    assert.equal(attack.frame().selected, null);
    assert.equal(attack.frame().targets[0].hit, true);
    const when = stand.world.time;
    stand.step(20);
    assert.equal(attack.frame().targets[0].id, original);
    assert.ok(attack.frame().targets[0].fade < 1);
    assert.equal(actor.body.view.senses.others[0].out, true);
    while (stand.world.time - when < 0.65) stand.step();
    assert.deepEqual(removed, [hung[0]]);
    assert.equal(hung.length, 2);
    assert.equal(attack.frame().targets.length, 1);
    assert.notEqual(attack.frame().targets[0].id, original);
    assert.deepEqual(actor.body.view.senses.others.map(target => target.id), [attack.frame().targets[0].id]);
    stand.step(2);
  } finally { incoming.dispose(); attack.dispose(); stand.dispose(); }
});

test("a game attack order approaches and physically hits a seeded target", async () => {
  const stand = await coreStand(spec, { posture: guardPosture(spec) });
  const actor = labActor(stand.built, stand.world, { mind: PUNCHER });
  const attack = startAttack(actor, { count: 1, seed: 42 });
  try {
    const phases = new Set();
    for (let step = 0; step < 1800 && !attack.state.hits && !actor.body.view.down; step++) {
      stand.step(); phases.add(attack.skills.report.engagement?.phase);
      for (const action of attack.skills.report.actions) phases.add(action.phase);
    }
    assert.ok(phases.has("approach"), [...phases].join(", "));
    assert.ok(phases.has("commit"), [...phases].join(", "));
    assert.equal(attack.state.hits, 1, JSON.stringify(attack.frame()));
    assert.equal(attack.frame().targets[0].hit, true);
  } finally { attack.dispose(); stand.dispose(); }
});
