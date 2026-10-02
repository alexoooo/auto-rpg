/**
 * **A mind hands its body to a sub-mind** (`hosting`, `src/core/mind/sub-mind.ts`): who has the
 * body each step, what the host is told, the sub-mind a config names (`subMind`), the one that
 * lies still (`lying`), and a body handed back. Node stand, Rapier, 120 Hz.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { createBody, SERVO_SECONDS } from "../src/core/body.ts";
import { centreOfToRef } from "../src/core/control/support.ts";
import { armed } from "../src/core/human/grip.ts";
import { modelSpec } from "../src/core/human/spec.ts";
import { woodenClub } from "../src/core/items/club.ts";
import { FIGHTER } from "../src/core/mind/config.ts";
import { fighterTactics } from "../src/core/mind/fighter.ts";
import { embody } from "../src/core/mind/mind.ts";
import { createMind } from "../src/core/mind/minds.ts";
import { STAND_ORDERS } from "../src/core/mind/orders.ts";
import { hosting } from "../src/core/mind/sub-mind.ts";
import { subMind } from "../src/core/mind/sub-minds.ts";
import { driveBy } from "../src/core/mind/tactics.ts";
import { GUARD } from "../src/core/skills/guard.ts";
import { STAND } from "../src/core/skills/strike.ts";
import { coreStand } from "./harness/core-stand.mjs";

const warrior = modelSpec("workshop-fighter");

test("the first sub-mind that wants the body has it, and the host looks on", async () => {
  const stand = await coreStand(warrior);
  const calls = [];
  let step = 0;
  /** A sub-mind that wants the body from step `from` to the step before `to`, and writes down each thing it is asked. */
  const sub = (name, from, to) => ({
    name,
    wants() { calls.push(`${name}.wants`); return step >= from && step < to; },
    begin() { calls.push(`${name}.begin`); },
    end() { calls.push(`${name}.end`); },
    step() { calls.push(`${name}.step`); },
  });
  const host = {
    name: "host",
    look() { calls.push("host.look"); },
    act() { calls.push("host.act"); },
    release() { calls.push("host.release"); },
    resume() { calls.push("host.resume"); },
    step() { calls.push("host.step"); },
  };
  const { mind, dispose } = embody(stand.built, stand.world, () => hosting(host, [sub("a", 10, 20), sub("b", 5, 30)]));
  try {
    assert.deepEqual([mind.name, mind.has, mind.state], ["host", "host", { has: -1, host: null, subs: [null, null] }]);
    const record = [];
    for (; step < 33; step++) {
      calls.length = 0;
      stand.step();
      record.push(`${step} ${mind.has} ${mind.state.has}: ${calls.join(" ")}`);
    }
    // Every step the host looks, and the sub-minds are asked in rank order as far as the first that wants the body.
    const asked = { host: "host.look a.wants b.wants", a: "host.look a.wants", b: "host.look a.wants b.wants" };
    const steps = (from, to, has, at, then) => Array.from({ length: to - from }, (_, k) => `${from + k} ${has} ${at}: ${asked[has]} ${then}`);
    assert.deepEqual(record, [
      ...steps(0, 5, "host", -1, "host.act"),
      "5 b 1: host.look a.wants b.wants host.release b.begin b.step",
      ...steps(6, 10, "b", 1, "b.step"),
      // One of higher rank takes it from one of lower: the host is told nothing, the body not being its own.
      "10 a 0: host.look a.wants b.end a.begin a.step",
      ...steps(11, 20, "a", 0, "a.step"),
      "20 b 1: host.look a.wants b.wants a.end b.begin b.step",
      ...steps(21, 30, "b", 1, "b.step"),
      "30 host -1: host.look a.wants b.wants b.end host.resume host.act",
      ...steps(31, 33, "host", -1, "host.act"),
    ]);
  } finally { dispose(); stand.dispose(); }
});

test("a sub-mind reads its host's view of this step", async () => {
  // A written host whose look counts its steps into a view, and a sub-mind that reads the count when it is asked.
  {
    const stand = await coreStand(warrior), view = { count: 0 }, read = [];
    const host = { name: "host", look() { view.count += 1; }, act() {}, release() {}, resume() {}, step() {} };
    const reader = { name: "reader", wants() { read.push(view.count); return false; }, begin() {}, end() {}, step() {} };
    const { dispose } = embody(stand.built, stand.world, () => hosting(host, [reader]));
    try {
      stand.step(5);
      assert.deepEqual(read, [1, 2, 3, 4, 5]);
    } finally { dispose(); stand.dispose(); }
  }
  // And a body's: the view its sub-minds are made with is the command layers', read on this step's senses.
  {
    const stand = await coreStand(warrior), read = [];
    const reader = (own, view) => ({ name: "reader", wants(senses) { read.push([view.time, senses.time, view.senses === senses]); return false; }, begin() {}, end() {}, step() {} });
    const body = createBody(stand.built, stand.world, { servoSeconds: SERVO_SECONDS, subs: [reader] });
    try {
      assert.equal(body.has, "command");
      stand.step(3);
      const dt = stand.world.dt;
      assert.deepEqual(read, [0, 1, 2].map((k) => [read[k][1], read[k][1], true]));
      assert.ok(read.every(([time], k) => Math.abs(time - k * dt) < 1e-12), JSON.stringify(read));
    } finally { body.dispose(); stand.dispose(); }
  }
});

test("a sub-mind's config names its kind", () => {
  const own = { muscles: null }, view = { down: false };
  const lie = subMind(own, view, { kind: "lie" });
  assert.equal(lie.name, "lie");
  assert.equal(lie.wants(), false);
  assert.throws(() => subMind(own, view, { kind: "nap" }), /no sub-mind of kind "nap"/);
});

/** How fast the fastest of `built`'s segments' centres moves, m/s. */
function fastest(built) {
  const v = new Vector3();
  return Math.max(...[...built.segments.values()].map((segment) => segment.body.linearVelocityToRef(v).length()));
}

test("a body that is down lies still", async () => {
  /** The Warrior under `config`, ordered to stand, shoved 120 N s forward at its middle trunk a second in: what is read of it from the step it is down, and 3 s on. */
  const felled = async (config) => {
    const stand = await coreStand(warrior);
    const { body } = createMind(stand.built, stand.world, config, { name: "felled", orders: () => STAND_ORDERS });
    try {
      stand.step(stand.seconds(1));
      const trunk = stand.built.segments.get("middleTrunk");
      trunk.body.applyImpulse(new Vector3(0, 0, 120), centreOfToRef(trunk, new Vector3()));
      const seen = { down: null, has: new Set(), asking: 0, short: 0, phases: new Set(), goals: new Set(), up: 0, late: 0 };
      for (let i = 0; i < stand.seconds(7); i++) {
        stand.step();
        const { view } = body;
        if (!view.down && seen.down === null) continue;
        seen.down ??= i;
        if (!view.down) seen.up += 1;
        seen.has.add(body.has);
        if (body.muscles.activation.some((level) => level !== 0) || body.muscles.velocity.some((speed) => speed !== 0)) seen.asking += 1;
        seen.short = Math.max(seen.short, view.stance.shortfall.force.length(), view.stance.shortfall.moment.length());
        seen.phases.add(view.stance.phase);
        seen.goals.add(body.state.mind.host.motor.standing === null ? "none" : "a stance");
        if (i >= seen.down + stand.seconds(3)) seen.late = Math.max(seen.late, fastest(stand.built));
      }
      return { ...seen, has: [...seen.has], phases: [...seen.phases], goals: [...seen.goals], fell: seen.down !== null && seen.down < stand.seconds(3) };
    } finally { body.dispose(); stand.dispose(); }
  };
  const lay = await felled(FIGHTER);
  assert.ok(lay.fell, "the shove fells it");
  assert.deepEqual({ has: lay.has, asking: lay.asking, short: lay.short, phases: lay.phases, goals: lay.goals, up: lay.up },
    { has: ["lie"], asking: 0, short: 0, phases: ["stand"], goals: ["none"], up: 0 }, "from the step it is down it asks its muscles and its stance nothing");
  assert.ok(lay.late < 0.05, `3 s on, the fastest of its segments moves ${lay.late} m/s`);
  // The control: a fighter with no sub-minds keeps its body, and drives it where it lies.
  const driven = await felled({ kind: "fighter", subs: [] });
  assert.ok(driven.fell);
  assert.deepEqual([driven.has, driven.goals], [["command"], ["a stance"]]);
  assert.ok(driven.asking > 0 && driven.short > 0 && driven.late > 0.5, `driven: ${driven.asking} steps asking, ${driven.short} short, ${driven.late} m/s 3 s on`);
});

test("what was asked is given up with the body, and asked again when it is back", async () => {
  const stand = await coreStand(warrior);
  /** A sub-mind that holds every freedom where it is for a tenth of a second from the world's step 60: longer, and the body it holds stiff has tipped past its feet. */
  const hold = (own) => ({
    name: "hold",
    wants: () => stand.world.steps >= 60 && stand.world.steps < 72,
    begin() {}, end() {},
    step() { own.muscles.activation.fill(1); own.muscles.velocity.fill(0); },
  });
  const body = createBody(stand.built, stand.world, { servoSeconds: SERVO_SECONDS, subs: [hold] });
  try {
    const height = body.view.stance.centre.y - body.view.stance.support.y;
    const goal = Object.freeze({ position: Object.freeze(body.view.knuckles.left.add(new Vector3(0, 0.1, 0.25)).asArray()), seconds: 0.4 });
    const command = Object.freeze({
      posture: GUARD, hands: Object.freeze({ left: goal, right: null }),
      // A push too light to move the body: what is read of it is whether it is asked.
      pushes: Object.freeze([Object.freeze({ channel: "wrist.right flexion", sense: 1, level: 0.02 })]),
      stance: Object.freeze({ feet: Object.freeze(["left", "right"]), centre: null, height, heading: 0, walk: null }),
    });
    body.drive(() => command);
    const { host } = body.state.mind;
    /** What the command layers hold of what they were asked, and how far the left hand's knuckles are from its goal, m. */
    const read = () => ({
      has: body.has, goal: host.goals.left !== null, reaching: host.motor.hands.left.goal !== null, standing: host.motor.standing !== null,
      pushes: host.motor.pushes.length,
      off: body.view.knuckles.left.subtract(Vector3.FromArray(goal.position)).length(),
    });
    stand.step(60);
    const reached = read();
    assert.deepEqual({ ...reached, off: null }, { has: "command", goal: true, reaching: true, standing: true, pushes: 1, off: null });
    assert.ok(reached.off < 0.08, `it reached its goal: ${reached.off} m off`);
    stand.step(12);
    assert.deepEqual({ ...read(), off: null }, { has: "hold", goal: false, reaching: false, standing: false, pushes: 0, off: null }, "held by another mind, it asks nothing");
    // Back, the same command is taken as a new one: the hand reaches again from where it is.
    stand.step();
    assert.deepEqual({ ...read(), off: null }, { has: "command", goal: true, reaching: true, standing: true, pushes: 1, off: null });
    stand.step(120);
    const again = read();
    assert.ok(again.off < 0.08 && !body.view.down, `it reached its goal again: ${again.off} m off`);
  } finally { body.dispose(); stand.dispose(); }
});

test("a body taken in the middle of a step forgets the step, and walks on", async () => {
  const stand = await coreStand(warrior);
  /** How long the body is held, in steps: stiff on one foot for four times this, it falls. */
  const HELD = 6;
  let from = null;
  /** A sub-mind that holds every freedom where it is for `HELD` steps, from the first step after 2 s at which a foot has swung a tenth of a second. */
  const hold = (own, view) => ({
    name: "hold",
    wants(senses) {
      if (from === null && senses.time > 2 && view.stance.phase === "swing" && stance.step.time > 0.1) from = stand.world.steps;
      return from !== null && stand.world.steps < from + HELD;
    },
    begin() {}, end() {},
    step() { own.muscles.activation.fill(1); own.muscles.velocity.fill(0); },
  });
  const body = createBody(stand.built, stand.world, { servoSeconds: SERVO_SECONDS, subs: [hold] });
  const stance = body.state.mind.host.motor.stance;
  try {
    driveBy(body, fighterTactics("walk", () => ({ move: { x: 0, z: 1 }, face: null, attack: null })));
    /** The stance's memory of the step under way. */
    const memory = () => ({
      plan: stance.plan.on, last: stance.last, stride: stance.stride, striding: stance.striding, pace: [...stance.pace],
      swing: stance.step.swing, lifted: stance.step.lifted, time: stance.step.time, held: stance.step.held,
      phase: stance.reading.phase, own: stance.reading.own, rolled: stance.feet.map((foot) => foot.rolled),
    });
    let before = null;
    while (body.has === "command" && stand.world.steps < stand.seconds(5)) { before = memory(); stand.step(); }
    assert.equal(body.has, "hold");
    // The fixture takes it with a step under way: a foot in the air, a plan, a walk's pace.
    assert.ok(before.plan && before.last.length === 1 && before.stride !== null && before.striding !== null && before.pace[1] > 0.5
      && before.swing !== null && before.lifted && before.time > 0.1 && before.held > 0 && before.phase === "swing" && before.own !== null, JSON.stringify(before));
    const blank = { plan: false, last: null, stride: null, striding: null, pace: [0, 0], swing: null, lifted: false, time: 0, held: 0, phase: "stand", own: null, rolled: [false, false] };
    assert.deepEqual(memory(), blank);
    stand.step(HELD - 1);
    assert.deepEqual([body.has, memory()], ["hold", blank]);
    // Back, it walks on from where it stands: 3 s later it has not gone down, and has gone a metre further.
    const { strides, centre } = body.view.stance, at = centre.z;
    let down = false;
    for (let i = 0; i < stand.seconds(3); i++) { stand.step(); down ||= body.view.down; }
    assert.equal(body.has, "command");
    assert.ok(!down && body.view.stance.strides >= strides + 6 && body.view.stance.centre.z > at + 1,
      `down ${down}, ${body.view.stance.strides - strides} strides, ${body.view.stance.centre.z - at} m on`);
  } finally { body.dispose(); stand.dispose(); }
});

test("a body handed back goes on from where it is", async () => {
  const stand = await coreStand(armed(warrior, "right", woodenClub()));
  // A point to its right, at head height: the strike skill walks it there, turning, and sets its feet.
  const ATTACK = Object.freeze({ move: null, face: null, attack: Object.freeze([1.6, 1.5, 0.4]) });
  const HELD = 0.4;
  let skills = null, until = null;
  /** A sub-mind that holds every freedom where it is, for `HELD` s from the step the first strike is chambering. */
  const hold = (own) => ({
    name: "hold",
    wants(senses) {
      if (until === null && skills.report.strike.phase === "chamber") until = senses.time + HELD;
      return until !== null && senses.time < until;
    },
    begin() {}, end() {},
    step() { own.muscles.activation.fill(1); own.muscles.velocity.fill(0); },
  });
  const body = createBody(stand.built, stand.world, { servoSeconds: SERVO_SECONDS, subs: [hold] });
  try {
    // What the tactics see each step they decide: the driver's own view, as the skills have been resumed on it.
    const decided = [];
    skills = driveBy(body, fighterTactics("back", ({ view, report }) => {
      decided.push({ time: view.time, resumed: view.resumed, phase: report.strike.phase, heading: report.heading, facing: view.stance.facing, thrown: report.strike.thrown.right });
      return ATTACK;
    }));
    const had = [];
    let down = false;
    const run = (steps) => {
      for (let i = 0; i < steps; i++) {
        stand.step();
        if (had.at(-1) !== body.has) had.push(body.has);
        down ||= body.view.down;
        assert.equal(body.view.resumed, false, "between steps nothing is resumed: it is the driver's to read");
      }
    };
    while (had.length < 3 && stand.world.steps < stand.seconds(20)) run(1);
    assert.deepEqual(had, ["command", "hold", "command"], "its first strike chambering, it was held, and handed back");
    // Held, the tactics did not decide; the step it is back, and that step alone, they are told.
    const back = decided.findIndex((step) => step.resumed), at = decided[back], before = decided[back - 1];
    assert.equal(decided.filter((step) => step.resumed).length, 1);
    assert.ok(Math.abs(at.time - before.time - HELD) < 2 * stand.world.dt, `nothing decided from ${before.time} s to ${at.time} s`);
    // The strike in hand is over, unthrown, and the legs' heading is the way the body faces.
    assert.deepEqual({ phase: at.phase, thrown: at.thrown, heading: at.heading }, { phase: null, thrown: 0, heading: at.facing });
    assert.ok(at.facing > 1 && Math.abs(at.facing - before.heading) < 0.1, `the fixture turned it to its right: it faces ${at.facing} rad, and was asked ${before.heading}`);
    // It goes on: within 4 s it has thrown a strike begun since, and has not gone down.
    const from = stand.world.steps;
    while (skills.report.strike.thrown.right === 0 && stand.world.steps < from + stand.seconds(4)) run(1);
    assert.equal(skills.report.strike.thrown.right, 1, "it threw a strike begun after the hand-back");
    assert.equal(down, false);
    // Its feet are square where they stand, so it places none: it stands its time again.
    assert.deepEqual(decided.slice(back + 1, back + 3).map((step) => step.phase), ["settle", "settle"]);
    // Begun from nothing: it stood again as long as a strike asks before it chambered.
    const chambered = decided.find((step, k) => k > back && step.phase === "chamber");
    assert.ok(chambered.time - at.time >= STAND - 2 * stand.world.dt, `back at ${at.time} s, it chambered at ${chambered.time} s`);
    assert.deepEqual(had, ["command", "hold", "command"]);
  } finally { body.dispose(); stand.dispose(); }
});
