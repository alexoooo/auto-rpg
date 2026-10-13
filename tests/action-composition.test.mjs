import test from "node:test";
import assert from "node:assert/strict";
import { coreStand, saveStand, loadStand } from "./harness/core-stand.mjs";
import { humanSpec } from "../src/core/human/spec.ts";
import { createBody } from "../src/core/body.ts";
import { guardPosture, guardSkill } from "../src/core/skills/guard.ts";
import { locomotion } from "../src/core/skills/locomotion.ts";
import { actionSkillSet } from "../src/core/skills/action-skill-set.ts";

const spec = humanSpec("workshop-fighter");
const guard = guardPosture(spec);

test("replacing the driver interrupts its actions and detaches its interval reader", async () => {
  const own = await fixture();
  try {
    own.step(3);
    const observed = own.skills.state.actions.observedStep;
    own.body.drive(null);
    const records = structuredClone(own.skills.report.ledger);
    assert.equal(records.length, 2);
    assert.ok(records.every(record => record.ending.kind === "interrupted" && record.ending.reason === "replaced"));
    assert.ok(records.every(record => record.ended === own.world.time));
    own.step(2);
    assert.equal(own.skills.state.actions.observedStep, observed);
    assert.deepEqual(own.skills.report.ledger, records);
  } finally { own.dispose(); }
});

/** Independently owned elbow motion, with a bounded release and no action on the other arm. */
function arm(side, overlay = false) {
  const state = { live: null, commands: 0 };
  return {
    state,
    needs() { return [`hand.${side}`]; },
    readiness() { return { kind: "ready" }; },
    start(_view, request) { state.live = { id: request.id, time: 0 }; },
    update(_view, requests, _around, dt) {
      if (!state.live) return [];
      state.live.time += dt;
      if (!requests.length) { const id = state.live.id; state.live = null; return [{ id, ending: { kind: "completed" } }]; }
      return [{ id: state.live.id, phase: "commit", stage: "extension", holds: [`hand.${side}`] }];
    },
    command() { return { posture: { [`elbow.${side} flexion`]: 0.5 } }; },
    ...(overlay ? { overlay(_view, _id, base) {
      assert.equal(Object.isFrozen(base), true);
      assert.equal(Object.isFrozen(base.posture), true);
      assert.throws(() => { base.posture["elbow.left flexion"] = 9; }, TypeError);
      return { posture: { [`elbow.${side} flexion`]: 0.4 } };
    } } : {}),
    resume() { state.live = null; },
  };
}

async function fixture(reverse = false, overlay = false) {
  const stand = await coreStand(spec, { posture: guard });
  const body = createBody(stand.built, stand.world, { servoSeconds: 0.1, feedback: true });
  const left = arm("left", overlay), right = arm("right", overlay), entries = [{ name: "left", executor: left }, { name: "right", executor: right }];
  if (reverse) entries.reverse();
  const skills = actionSkillSet(body, { legs: locomotion(body.envelope), guard: guardSkill(spec) }, entries,
    [{ name: "left", executor: "left", effectors: ["hand.left"] }, { name: "right", executor: "right", effectors: ["hand.right"] }]);
  const requests = ["left", "right"].map(side => ({ id: skills.instance(), action: side, effector: `hand.${side}`, target: { kind: "point", at: [0, 1, 1] } }));
  const intent = { face: 0, move: null, guard: { left: null, right: null }, actions: requests };
  body.drive((view, dt) => skills.command(view, intent, dt), skills.release);
  return { ...stand, body, skills, intent, left, right, dispose() { body.dispose(); stand.dispose(); } };
}

test("disjoint commands compose identically in either registration order and move both arms", async () => {
  const one = await fixture(), two = await fixture(true);
  try {
    const before = one.body.view.angles["elbow.left flexion"];
    one.step(24); two.step(24);
    assert.deepEqual(one.skills.state.command, two.skills.state.command);
    assert.deepEqual(one.body.view.angles, two.body.view.angles);
    assert.ok(Math.abs(one.body.view.angles["elbow.left flexion"] - before) > 0.01);
    assert.equal(one.skills.report.holders["effector:hand.left"], 1);
    assert.equal(one.skills.report.holders["effector:hand.right"], 2);
    assert.ok(Math.abs(one.left.state.live.time - 23 / 120) < 1e-12);
    assert.equal(one.left.state.commands, 0);
  } finally { one.dispose(); two.dispose(); }
});

test("overlays read an immutable common base, and a fork restores ownership and commands", async () => {
  const one = await fixture(false, true), two = await fixture(false, true);
  try {
    one.step(8);
    const saved = saveStand(one.world, { body: one.body.state, skills: one.skills.state });
    loadStand(two.world, { body: two.body.state, skills: two.skills.state }, saved);
    one.step(8); two.step(8);
    assert.deepEqual(one.skills.state.command, two.skills.state.command);
    assert.deepEqual(one.body.view.angles, two.body.view.angles);
    assert.equal(one.skills.state.command.posture["elbow.right flexion"], 0.4);
    one.intent.actions = []; one.step();
    assert.equal(one.skills.report.actions.length, 0);
    assert.equal(one.skills.state.command.posture["elbow.right flexion"], guard["elbow.right flexion"]);
  } finally { one.dispose(); two.dispose(); }
});
