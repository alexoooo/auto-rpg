import test from "node:test";
import assert from "node:assert/strict";
import { createBody, SERVO_SECONDS } from "../src/core/body.ts";
import { modelSpec } from "../src/core/models.ts";
import { skillSet } from "../src/core/skills/arbiter.ts";
import { pathParts } from "../src/core/skills/combat.ts";
import { coreStand } from "./harness/core-stand.mjs";

const DT = 1 / 120;
const STANCE = { feet: ["left", "right"], centre: null, height: 1, heading: .2 };
const PLACED = { ...STANCE, heading: -.4 };
const goal = point => ({ places: [{ point, position: [0, 1, .5] }], seconds: .2 });
const COVER = { left: goal("knuckles"), right: goal("knuckles") }, THROWN = goal("knuckles");
const request = { id: 1, action: "strike", effector: "hand.right", target: { kind: "point", at: [0, 1.6, 1] } };
const intent = (skills, actions = [{ ...request, id: skills.instance() }]) => ({ move: [.5, 0], face: .3, guard: { left: null, right: null }, actions });

function parts(claim = { effectors: { "hand.right": THROWN }, handPoses: { right: "fist" } }, needs = ["hand.right"], support = null) {
  const calls = [], state = { id: null };
  const legs = { state: {}, heading: .1, placed: true, pace: 0, reference: null,
    resume: () => calls.push(["resume", "legs"]),
    goal: (_, walk, face, __, lower) => { calls.push(["goal", walk, face, lower]); return STANCE; },
    place: (_, footing, lower) => { calls.push(["place", footing, lower]); return PLACED; } };
  const guard = { resume: () => calls.push(["resume", "guard"]), command: () => COVER };
  const executor = { state, needs: () => needs, readiness: () => ({ kind: "ready" }),
    start: (_view, request) => { state.id = request.id; calls.push(["start", request.id]); },
    update: () => state.id === null ? [] : [{ id: state.id, phase: "commit", stage: "swing", holds: needs }],
    command: () => claim, resume: () => { state.id = null; calls.push(["resume", "executor"]); },
    interrupt: (_view, id) => { if (state.id === id) state.id = null; calls.push(["interrupt", id]); } };
  return { calls, parts: { legs, guard, support, executors: [{ name: "motion", executor }], actions: [{ name: "strike", executor: "motion", effectors: ["hand.right"] }] } };
}
async function standing() {
  const stand = await coreStand(modelSpec("workshop-fighter"));
  const body = createBody(stand.built, stand.world, { servoSeconds: SERVO_SECONDS, feedback: true });
  return { ...stand, body, dispose() { body.dispose(); stand.dispose(); } };
}

test("a named action owns its hand while guard and locomotion fill the other controls", async () => {
  const s = await standing();
  try {
    const made = parts(), skills = skillSet(s.body, {}, made.parts), command = skills.command(s.body.view, intent(skills), DT);
    assert.deepEqual(command.effectors, { "hand.left": COVER.left, "hand.right": THROWN });
    assert.deepEqual(command.handPoses, { left: "open", right: "fist" });
    assert.deepEqual(command.stance, STANCE);
    assert.equal(skills.report.holders["effector:hand.right"], 1);
    assert.equal(skills.report.holders["effector:hand.left"], "default");
    assert.equal(skills.report.holders.stance, "default");
    assert.deepEqual(made.calls, [["start", 1], ["goal", [.5, 0], .3, undefined]]);
    assert.equal(skills.state.command, command);
  } finally { s.dispose(); }
});

test("only an action that owns legs can hold, walk, place or steer them", async () => {
  const s = await standing();
  try {
    const footing = { left: [0, 0], right: [.3, 0] };
    for (const legs of [{ kind: "hold" }, { kind: "walk", walk: [.2, .1], face: -1 }, { kind: "place", footing }]) {
      const made = parts({ legs, lower: .1, steer: .25 }, ["hand.right", "legs"]), skills = skillSet(s.body, {}, made.parts);
      const command = skills.command(s.body.view, intent(skills), DT);
      const expected = legs.kind === "place" ? ["place", footing, .1] : ["goal", legs.kind === "walk" ? legs.walk : null, legs.kind === "walk" ? -1 : .3, .1];
      assert.deepEqual(made.calls.at(-1), expected);
      assert.equal(command.stance.heading, (legs.kind === "place" ? PLACED : STANCE).heading + .25);
      assert.equal(skills.report.holders.stance, 1);
    }
    const invalid = skillSet(s.body, {}, parts({ legs: { kind: "hold" } }).parts);
    assert.throws(() => invalid.command(s.body.view, intent(invalid), DT), /legs|stance|resource|unowned|outside|escapes/);
  } finally { s.dispose(); }
});

test("support is claimed by an action before its lowering is applied", async () => {
  const s = await standing(), seen = [];
  try {
    const support = { state: {}, report: { stage: "low", ready: true }, resume() {},
      tick: (_view, lower, moving) => seen.push([lower, moving]),
      apply: (_stance, posture) => ({ stance: PLACED, posture: { ...posture, "lumbar flexion": .5 } }) };
    const made = parts({ legs: { kind: "hold" }, support: .5 }, ["hand.right", "legs", "trunk"], support), skills = skillSet(s.body, {}, made.parts);
    const command = skills.command(s.body.view, intent(skills), DT);
    assert.deepEqual(seen, [[.5, false]]);
    assert.deepEqual(command.stance, PLACED);
    assert.equal(command.posture["lumbar flexion"], .5);
    assert.equal(skills.report.holders["channel:lumbar flexion"], 1);
    assert.equal(skills.report.holders.stance, 1);
  } finally { s.dispose(); }
});

test("an interrupt in the intent ends its action at once and the guard has its hand in the same step", async () => {
  const s = await standing();
  try {
    const made = parts(), skills = skillSet(s.body, {}, made.parts);
    assert.deepEqual(skills.command(s.body.view, intent(skills), DT).effectors["hand.right"], THROWN);
    const command = skills.command(s.body.view, { ...intent(skills, []), interrupt: [1] }, DT);
    assert.deepEqual([command.effectors["hand.right"], skills.report.actions, skills.report.holders["effector:hand.right"]], [COVER.right, [], "default"]);
    assert.deepEqual(skills.report.ledger.map(record => [record.id, record.ending.kind]), [[1, "interrupted"]]);
    assert.deepEqual(made.calls.filter(call => call[0] === "interrupt"), [["interrupt", 1]]);
  } finally { s.dispose(); }
});

test("releasing the host records interruption and resumes every continuous service", async () => {
  const s = await standing();
  try {
    const made = parts(), skills = skillSet(s.body, {}, made.parts);
    skills.command(s.body.view, intent(skills), DT);
    skills.release(s.body.view, "idle");
    assert.deepEqual(skills.report.ledger.map(record => record.ending), [{ kind: "interrupted", reason: "idle" }]);
    assert.deepEqual(skills.report.actions, []);
    assert.deepEqual(made.calls.filter(call => call[0] === "resume").map(call => call[1]).sort(), ["executor", "guard", "legs"]);
    assert.deepEqual(skills.report.reservations, {});
  } finally { s.dispose(); }
});

test("path parts declare named families and optional support and kick execution", async () => {
  const s = await standing();
  try {
    const plain = pathParts(s.body), full = pathParts(s.body, { ground: true });
    assert.equal(plain.support, null);
    assert.deepEqual(plain.executors.map(entry => entry.name), ["paths"]);
    assert.deepEqual(plain.actions.map(action => action.name), ["straight", "cross", "hook", "downward", "overhand", "uppercut"]);
    assert.equal(typeof full.support.tick, "function");
    assert.deepEqual(Object.keys(skillSet(s.body, {}, full).state), ["actions", "legs", "navigation", "support", "tactics", "command", "owners", "reservations"]);
  } finally { s.dispose(); }
});
