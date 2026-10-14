/** Technique phase contracts and the actual joint-rate conversion, on the Node/Rapier stand. */
import test from "node:test";
import assert from "node:assert/strict";
import { phaseClock, poseDrive, REACHED_SECONDS, TECHNIQUES, mirrorPosture, mirrorLimbs } from "../src/core/mind/ground/techniques.ts";
import { plantPostures, PLANT_UP } from "../src/core/mind/ground/plant-up.ts";
import { humanSpec } from "../src/core/human/spec.ts";
import { driveMuscles } from "../src/core/muscle/driver.ts";
import { saveState, loadState } from "../src/core/state.ts";
import { coreStand, saveStand, loadStand } from "./harness/core-stand.mjs";
import { plantSettings, searchSchedule, searchStarts, techniqueScore } from "../research/rising-search.mjs";
import { techniqueTrial } from "../research/rising-technique.mjs";
import { armClearance } from "../src/core/mind/ground/clearance.ts";
import { flatten } from "../src/core/mind/ground/flatten.ts";
import { rollBack } from "../src/core/mind/ground/roll-back.ts";
import { sitUp } from "../src/core/mind/ground/sit-up.ts";
import { postUp } from "../src/core/mind/ground/post-up.ts";
import { createBody } from "../src/core/body.ts";
import { groundPlacement } from "../src/lab/ground-starts.ts";
import { RISE } from "../src/core/mind/rise/stages.ts";
import poses from "../assets/research/posture-holds.json" with { type: "json" };
import { centreOfToRef } from "../src/core/control/support.ts";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";

test("a phase ends by its own event, and failure, no progress and deadline are distinct ends", () => {
  const clock = phaseClock(), step = input => clock.step({ inside: true, event: false, deadline: 1, ...input }, .1);
  assert.equal(step({ event: true }), "done");
  clock.reset(); assert.equal(step({ inside: false, event: true }), "failed");
  clock.reset(); assert.equal(step({ progress: { value: 0, gain: .1, window: .2 } }), null);
  assert.equal(step({ progress: { value: .05, gain: .1, window: .2 } }), null);
  assert.equal(step({ progress: { value: .05, gain: .1, window: .2 } }), "stalled");
  clock.reset(); for (let i = 0; i < 10; i++) assert.equal(step({}), null);
  assert.equal(step({ event: true }), "timed-out");
});

test("reached must hold continuously for the fixed duration and clock state forks", () => {
  const clock = phaseClock(), input = { inside: true, event: true, deadline: 1, hold: REACHED_SECONDS };
  for (let i = 0; i < 5; i++) assert.equal(clock.step(input, 1 / 120), null);
  const saved = saveState(clock.state);
  assert.equal(clock.step({ ...input, event: false }, 1 / 120), null);
  assert.equal(clock.state.reached, 0);
  loadState(clock.state, saved);
  for (let i = 0; i < 6; i++) assert.equal(clock.step(input, 1 / 120), null);
  assert.equal(clock.step(input, 1 / 120), "done");
});

test("a swung shoulder's pose rates become coupled motor speeds before physics", async () => {
  const spec = humanSpec("workshop-fighter"), posture = { "shoulder.left flexion": 1.2, "shoulder.left abduction": .9, "shoulder.left internal rotation": .3 };
  const stand = await coreStand(spec, { ground: false, gravity: false, pinned: "upperTrunk", posture });
  let convert, written, coupling;
  const muscles = driveMuscles(stand.built, stand.world, driver => {
    convert ??= poseDrive(driver);
    const goals = Object.fromEntries(driver.channels.map((c, i) => [c.name, driver.angle(i) + c.dof.spec.bind.value]));
    goals["shoulder.left flexion"] += .1;
    convert(goals, .2, 3);
    const first = driver.channel("shoulder.left flexion");
    written = [...driver.velocity.slice(first, first + 3)];
    coupling = [0, 1, 2].map(k => driver.turning(first + k, 0) * .5);
  });
  try {
    stand.step();
    assert.ok(written.some((value, i) => i > 0 && Math.abs(value) > .05), JSON.stringify(written));
    for (let i = 0; i < 3; i++) assert.ok(Math.abs(written[i] - coupling[i]) < 1e-8);
  } finally { muscles.dispose(); stand.dispose(); }
});

test("the search budget and objective cannot trade reached or surviving for shorter failures", () => {
  const schedule = searchSchedule();
  assert.equal(schedule.length, 14); assert.equal(schedule.reduce((sum, stage) => sum + stage.episodes, 0), 34560);
  assert.deepEqual(schedule.slice(0, 4).map(stage => [stage.generations, stage.lambda, stage.starts]), Array.from({ length: 4 }, () => [40, 12, 8]));
  for (const task of schedule) assert.equal(searchStarts(task.stage).length, 8);
  assert.deepEqual(searchStarts("predecessor").map(start => start.after), Array(8).fill("roll"));
  assert.equal(schedule.at(-1).factor, 1);
  assert.ok(techniqueScore([{ reached: true, survived: false, seconds: 8 }]) > techniqueScore(Array(8).fill({ reached: false, survived: true, seconds: 0 })));
  assert.ok(techniqueScore([{ reached: true, survived: true, seconds: 8 }]) > techniqueScore([{ reached: true, survived: false, seconds: 0 }]));
  assert.equal(techniqueScore([{ reached: false, survived: false, seconds: 0 }]), techniqueScore([{ reached: false, survived: false, seconds: 8 }]));
  assert.throws(() => plantSettings([0]), /unit cube/);
  assert.equal(TECHNIQUES["plant-up"].stage, "experimental"); assert.deepEqual(TECHNIQUES["plant-up"].sides, ["left"]);
  assert.equal(TECHNIQUES.roll.stage, "experimental");
  assert.ok(Object.isFrozen(PLANT_UP)); assert.ok(Object.isFrozen(plantPostures(humanSpec("workshop-fighter"))));
});

test("a real planted start reports physical failure instead of timing its way to done", async () => {
  const row = await techniqueTrial({ model: "workshop-fighter", start: "placed", posture: "fours", seed: 4, cap: .25 });
  assert.equal(row.reached, false); assert.equal(row.survived, false); assert.notEqual(row.end, "done");
  assert.ok(row.trail.some(entry => entry.phase === "plant"));
  assert.deepEqual(row.assist, { force: 0, moment: 0 });
  assert.ok(Object.keys(row.saturation).some(channel => channel.startsWith("plant/")));
});

test("a failed physical predecessor delivers its live end to a separately timed candidate", async () => {
  const row = await techniqueTrial({ model: "workshop-rogue", start: "placed", posture: "back", seed: 1,
    after: "roll", cap: .25 });
  assert.equal(row.predecessor, "timed-out");
  assert.ok(row.predecessorSeconds > 2 && row.predecessorSeconds <= 8);
  assert.equal(row.candidateBegun, true);
  assert.equal(row.seconds, .25); assert.equal(row.end, "timed-out");
  assert.ok(row.endedAt >= row.predecessorSeconds + .25);
  assert.ok(row.trail.some(entry => entry.phase.startsWith("predecessor:")));
  assert.ok(row.trail.some(entry => !entry.phase.startsWith("predecessor:") && entry.at >= row.predecessorSeconds));
  assert.ok(Object.keys(row.saturation).some(channel => channel.startsWith("brace/")));
});

test("arm clearance reads anatomical projection, including a forearm below the trunk", async () => {
  const spec = humanSpec("workshop-fighter");
  const folded = { "shoulder.left flexion": 1, "shoulder.right flexion": 1, "elbow.left flexion": 1.5, "elbow.right flexion": 1.5 };
  for (const [posture, expected] of [[folded, false], [{ "shoulder.left abduction": 1.5, "shoulder.right abduction": 1.5 }, true]]) {
    const stand = await coreStand(spec, { ground: false, gravity: false, posture });
    try { assert.equal(armClearance(stand.built)(), expected); }
    finally { stand.dispose(); }
  }
});

test("repositioning and the second route drive real bodies, and interruption changes state alone", async () => {
  const spec = humanSpec("workshop-fighter");
  for (const [make, posture, side] of [[flatten, "back", "left"], [rollBack, "front", "right"], [sitUp, "back", "left"], [postUp, "back", "left"]]) {
    const placement = groundPlacement(spec, { seed: 1, ground: { start: "placed", posture, degrees: null, impulse: null, foe: 0, gusts: false } });
    const stand = await coreStand(spec, placement);
    let run;
    const body = createBody(stand.built, stand.world, { servoSeconds: .1, subs: [(own, view) => {
      run = make(own, view);
      return { name: "fixture-technique", state: run.state, wants: () => true, begin: () => run.begin(side), end: () => run.end(),
        step(senses, dt) { if (view.ground) run.step(view.ground, senses, dt); } };
    }] });
    try {
      stand.step(12);
      assert.ok(body.muscles.activation.some(value => value > 0), make.name);
      assert.equal(run.reached(body.view.ground, "standing"), false);
      const saved = saveStand(stand.world, { body: body.state });
      stand.step(6); const continuation = saveState(body.state);
      loadStand(stand.world, { body: body.state }, saved); stand.step(6);
      assert.deepEqual(saveState(body.state), continuation, `${make.name} keeps all evolving memory in its body state`);
      const before = { speed: [...body.muscles.velocity], activation: [...body.muscles.activation] };
      run.end();
      assert.equal(run.state.ended, "interrupted");
      assert.deepEqual({ speed: [...body.muscles.velocity], activation: [...body.muscles.activation] }, before);
      assert.deepEqual([body.assist.given.force.length(), body.assist.given.moment.length()], [0, 0]);
    } finally { body.dispose(); stand.dispose(); }
  }
});

test("postures and bearing chains mirror twice, and the actual half-kneel centre mirrors within a millimetre", async () => {
  const spec = humanSpec("workshop-fighter"), installed = poses.find(p => p.model === spec.model && p.id === "half-kneel");
  const original = Object.fromEntries(spec.joints.flatMap(j => j.dofs.map((d, k) => [`${j.name} ${d.positive}`, installed.placement.joints[j.name][k] + d.bind.value])));
  const mirrored = mirrorPosture(original);
  assert.deepEqual(mirrorPosture(mirrored), original); assert.deepEqual(mirrorLimbs(mirrorLimbs(RISE.limbs)), RISE.limbs);
  const centres = [];
  for (const posture of [original, mirrored]) {
    const stand = await coreStand(spec, { ground: false, gravity: false, posture });
    try {
      const centre = new Vector3(), point = new Vector3(); let mass = 0;
      for (const part of stand.built.segments.values()) { centreOfToRef(part, point); centre.addInPlace(point.scaleInPlace(part.rigid.mass)); mass += part.rigid.mass; }
      centres.push(centre.scaleInPlace(1 / mass));
    } finally { stand.dispose(); }
  }
  assert.ok(Math.abs(centres[0].x + centres[1].x) < .001, `x ${centres.map(c => c.x)}`);
  assert.ok(Math.abs(centres[0].y - centres[1].y) < .001);
  assert.ok(Math.abs(centres[0].z - centres[1].z) < .001);
});
