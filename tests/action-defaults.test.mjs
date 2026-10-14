import test from "node:test";
import assert from "node:assert/strict";
import { coreStand } from "./harness/core-stand.mjs";
import { humanSpec } from "../src/core/human/spec.ts";
import { createBody } from "../src/core/body.ts";
import { guardPosture, guardSkill } from "../src/core/skills/guard.ts";
import { locomotion, STANCE_LOWER } from "../src/core/skills/locomotion.ts";
import { skillSet } from "../src/core/skills/arbiter.ts";

async function fixture(make, services = {}) {
  const spec = humanSpec("workshop-fighter"), stand = await coreStand(spec, { posture: guardPosture(spec) });
  const body = createBody(stand.built, stand.world, { servoSeconds: .1 });
  const motion = make(body), legs = services.legs ?? locomotion(body.envelope);
  const skills = skillSet(body, {}, {...{ legs, guard: guardSkill(spec), ...services }, executors:[{ name: "motion", executor: motion }], actions:[{ name: "action", executor: "motion", effectors: ["hand.right"] }]});
  const request = { id: skills.instance(), action: "action", effector: "hand.right", target: { kind: "point", at: [0, 1, 1] } };
  const intent = { face: 0, move: null, guard: { left: null, right: null }, actions: [request] };
  return { ...stand, body, skills, motion, intent, dispose() { body.dispose(); stand.dispose(); } };
}
function motion(claim, holds = ["hand.right"], overlay) {
  const state = { id: 0, updates: 0 };
  return { state, needs() { return holds; }, readiness() { return { kind: "ready" }; },
    start(_view, request) { state.id = request.id; }, update() { state.updates++; return []; },
    command() { return claim; }, ...(overlay ? { overlay } : {}), resume() { state.id = 0; } };
}

test("default running posture cannot drive a silently reserved arm, and holders distinguish delegation from reservation", async () => {
  const legs = { state: {}, heading: 0, pace: 0, reference: 1, placed: true, envelope: null, resume() {},
    drive() { return { kind: "drive", posture: { "elbow.right flexion": 9, "elbow.left flexion": .6 }, pushes: [] }; } };
  const own = await fixture(() => motion({}), { legs });
  const delegated = await fixture(() => motion({ delegate: ["hand.right"] }), { legs });
  try {
    const command = own.skills.command(own.body.view, own.intent, own.world.dt);
    assert.equal(command.posture["elbow.right flexion"], undefined);
    assert.equal(command.posture["elbow.left flexion"], .6);
    assert.equal(command.handPoses.right, undefined);
    assert.equal(command.handPoses.left, "open");
    assert.equal(own.skills.report.holders["channel:elbow.right flexion"], 1);
    assert.equal(own.skills.report.holders["channel:elbow.left flexion"], "default");
    const delegatedCommand = delegated.skills.command(delegated.body.view, delegated.intent, delegated.world.dt);
    assert.equal(delegatedCommand.posture["elbow.right flexion"], 9);
    assert.equal(delegatedCommand.handPoses.right, "open");
    assert.equal(delegated.skills.report.holders["channel:elbow.right flexion"], "default");
    assert.equal(delegated.skills.report.reservations["channel:elbow.right flexion"], 1);
    delegated.skills.release(delegated.body.view);
    assert.deepEqual(delegated.skills.report.reservations, {});
  } finally { own.dispose(); delegated.dispose(); }
});

test("support gets only its controls, lowers a neutral stance once and advances once", async () => {
  const read = { lower: null, ticks: 0, posture: null };
  const support = { state: {}, report: { stage: "stand", ready: false }, resume() {},
    tick(_view, lower) { read.lower = lower; read.ticks++; },
    apply(stance, posture) { read.posture = posture; return { stance: { ...stance, height: stance.height - .2 }, posture: { ...posture, "lumbar flexion": .3 } }; } };
  const legs = { state: {}, heading: 0, pace: 0, reference: 1, placed: true, envelope: null, resume() {},
    goal(_view, _walk, _face, _dt, lower) { return { height: 1 - lower, feet: ["left", "right"], centre: null, heading: 0 }; } };
  const f = await fixture(() => motion({ support: .5, lower: .5, legs: { kind: "hold" }, posture: { "elbow.right flexion": .7 } },
    ["hand.right", "trunk", "legs"]), { support, legs });
  try {
    const command = f.skills.command(f.body.view, f.intent, f.world.dt);
    assert.equal(read.lower, .5); assert.equal(read.ticks, 1);
    assert.equal(command.stance.height, 1 - STANCE_LOWER - .2);
    assert.equal(read.posture["elbow.right flexion"], undefined);
    assert.equal(command.posture["elbow.right flexion"], .7);
    assert.equal(command.posture["lumbar flexion"], .3);
    support.apply = (stance, posture) => ({ stance, posture: { ...posture, "elbow.left flexion": 2 } });
    assert.throws(() => f.skills.command(f.body.view, f.intent, f.world.dt), /undeclared/);
  } finally { f.dispose(); }
});

test("final commands detach executor arrays, reject nonfinite writes and allow overlays only on their held controls", async () => {
  const claim = { effectors: { "hand.right": { seconds: .2, places: [{ point: "knuckles", position: [0, 0, 1] }] } } };
  const f = await fixture(() => motion(claim));
  try {
    const command = f.skills.command(f.body.view, f.intent, f.world.dt);
    claim.effectors["hand.right"].places[0].position[2] = 2;
    assert.equal(command.effectors["hand.right"].places[0].position[2], 1);
    assert.equal(Object.isFrozen(command.effectors["hand.right"].places[0].position), true);
    claim.effectors["hand.right"].places[0].position[2] = NaN;
    assert.throws(() => f.skills.command(f.body.view, f.intent, f.world.dt), /finite/);
    claim.effectors["hand.right"].places[0].position[2] = 1;
    f.motion.overlay = () => ({ posture: { "elbow.left flexion": .4 } });
    assert.throws(() => f.skills.command(f.body.view, f.intent, f.world.dt), /undeclared/);
  } finally { f.dispose(); }
});
