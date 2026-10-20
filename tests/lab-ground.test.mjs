/** The ground Lab and Node bed share actual placements, disturbances and controller readings. */
import test from "node:test";
import assert from "node:assert/strict";
import { modelSpec } from "../src/core/models.ts";
import { uprightness } from "../src/core/control/ground.ts";
import { groundPlacement, groundPlacementFaults, groundPostures, GROUND_POSTURES } from "../src/lab/ground-starts.ts";
import { groundShove, ROUND_FALLS, startGround, STAND_CHECK, targetImpulse } from "../src/lab/ground-mode.ts";
import { groundMind } from "../src/lab/ground-config.ts";
import { labAddress, labHref, LAB_PRESETS } from "../src/lab/scenarios.ts";
import { labActor } from "../src/lab/actor.ts";
import { CLASSIC, PUNCHER, STAND_UP } from "../src/core/mind/config.ts";
import { risingOptions, risingJobs, risingReport } from "../research/rising-bed.mjs";
import { risingTrial } from "../research/rising-trial.mjs";
import { coreStand } from "./harness/core-stand.mjs";
import { groundTechnique } from "../src/lab/ground-technique.ts";

const address = (start, seed = 4, posture = "back") => {
  const defaults = labAddress("?scenario=ground");
  return { ...defaults, seed, ground: { ...defaults.ground, start, posture } };
};

test("ground address preserves each restart control and selects only installed postures", () => {
  const input = { ...address("placed", 12, "fours"), ground: { ...address("placed").ground, drive: "plant-up", rise: "learned-rise", waypoint: "plant", posture: "fours", degrees: 172, impulse: 83, foe: 2, gusts: true } };
  assert.deepEqual(labAddress(labHref(input)), input);
  assert.deepEqual(groundPostures(modelSpec("workshop-fighter")), GROUND_POSTURES);
  assert.deepEqual(groundPostures(modelSpec("workshop-rogue")), ["back", "front", "left", "right"]);
  assert.deepEqual(groundShove(input), { degrees: 172, impulse: 83 });
  assert.deepEqual(groundShove(address("shoved", 3)), groundShove(address("shoved", 3)));
  assert.notDeepEqual(groundShove(address("shoved", 3)), groundShove(address("shoved", 4)));
  assert.deepEqual(groundMind(LAB_PRESETS.script.config).subs, [{ kind: "support-recovery" }]);
  assert.equal(groundMind(CLASSIC), CLASSIC);
  assert.deepEqual(labAddress("?scenario=ground").mind.subs, [{ kind: "support-recovery" }]);
  assert.deepEqual(labAddress("?scenario=ground&mind=script").mind.subs, [{ kind: "lie" }]);
});

test("clear dropped starts reproduce exact joint geometry with their lowest shape 0.3 m above ground", async () => {
  const spec = modelSpec("workshop-fighter");
  const placements = [4, 5].map(seed => groundPlacement(spec, address("dropped", seed)));
  assert.notDeepEqual(placements[0], placements[1]);
  for (const [i, placement] of placements.entries()) {
    assert.deepEqual(groundPlacement(spec, address("dropped", i + 4)), placement);
    assert.deepEqual(groundPlacementFaults(spec, placement), []);
    for (const joint of spec.joints) for (const [k, dof] of joint.dofs.entries())
      assert.ok(placement.joints[joint.name][k] >= dof.min.value && placement.joints[joint.name][k] <= dof.max.value);
    const stand = await coreStand(spec, placement);
    try { assert.ok(Math.abs(uprightness(stand.built).lowest() - .3) < 1e-6); }
    finally { stand.dispose(); }
  }
  assert.throws(() => groundPlacement(spec, address("dropped", 1)), /five draws/);
});

test("placement overlap reads shape geometry before physics and refuses coincident nonadjacent segments", () => {
  const spec = modelSpec("workshop-fighter"), root = spec.segments.find(part => part.name === "lowerTrunk");
  const placement = groundPlacement(spec, address("shoved"));
  assert.deepEqual(groundPlacementFaults(spec, placement), []);
  const overlapping = { ...spec, segments: [...spec.segments, { ...root, name: "overlap-witness" }] };
  assert.ok(groundPlacementFaults(overlapping, placement).includes("lowerTrunk overlaps overlap-witness"));
  assert.throws(() => groundPlacement(modelSpec("workshop-rogue"), address("placed", 1, "fours")), /no installed fours/);
});

test("a placed body starts its selected sub-mind on its first step; the hung foe is sensed", async () => {
  const spec = modelSpec("workshop-fighter"), at = address("placed", 1, "fours");
  at.ground.foe = 1;
  const stand = await coreStand(spec, groundPlacement(spec, at));
  const run = startGround(labActor(stand.built, stand.world, { mind: groundMind(LAB_PRESETS.script.config) }), at);
  try {
    assert.equal(run.body.has, "command");
    stand.step();
    assert.equal(run.body.has, "recovery: rise");
    assert.equal(run.meter.state.falls, 1);
    assert.ok(run.dummy);
    assert.equal(run.body.observe().senses.others[0].id, "ground-foe");
    assert.equal(run.body.observe().senses.others[0].out, false);
    stand.step(29);
    // Range perturbations and the controller's limp settle phase need not preserve the installed support.
    assert.equal(run.body.view.ground.raw, "between");
    assert.ok(run.frame().trail.some(entry => entry.controller === "recovery: rise"));
    assert.ok(Object.values(run.frame().phases).reduce((a, b) => a + b, 0) > .2);
  } finally { run.dispose(); stand.dispose(); }
});

test("the first shove follows one second of standing, and another shove reuses the same body", async () => {
  const spec = modelSpec("workshop-fighter"), at = address("shoved"), pushed = [];
  at.ground.degrees = 90; at.ground.impulse = 60;
  const stand = await coreStand(spec, groundPlacement(spec, at));
  const run = startGround(labActor(stand.built, stand.world, { mind: groundMind(LAB_PRESETS.script.config) }), at,
    { pushed: (segment, impulse) => pushed.push({ step: stand.world.steps, name: segment.spec.name, impulse: impulse.asArray() }) });
  try {
    stand.step(120); assert.deepEqual(pushed, []);
    stand.step(); assert.equal(pushed.length, 1); assert.equal(pushed[0].step, 120);
    assert.equal(pushed[0].name, "middleTrunk"); assert.ok(Math.abs(pushed[0].impulse[0] - 60) < 1e-10);
    const body = run.body; run.shove(); stand.step(); assert.equal(run.body, body); assert.equal(pushed.length, 2);
  } finally { run.dispose(); stand.dispose(); }
});

test("the bed fixes target directions and counts failures, duplicates and assisted runs against the gates", () => {
  const options = risingOptions(["--target"]), jobs = risingJobs(options);
  assert.equal(jobs.length, 64); assert.equal(new Set(jobs.map(job => `${job.model}/${job.held}/${job.degrees}`)).size, 64);
  assert.throws(() => risingOptions(["--target", "--models", "workshop-fighter"]), /fixes models/);
  assert.throws(() => risingOptions(["--seeds", "1,1"]), /invalid seeds/);
  assert.throws(() => risingOptions(["--sub", "imaginary"]), /unsupported/);
  const rows = jobs.map(job => ({ ...job, stood: true, status: "stood", handback: 1, verified: 3, phases: { settle: 1 }, assist: { forceImpulse: 0, momentImpulse: 0 } }));
  assert.equal(risingReport(rows, true).claims.meetsOwnerTarget, true);
  const failed = rows.map((row, i) => i < 4 ? { ...row, stood: false, verified: null } : row);
  assert.equal(risingReport(failed, true).claims.meetsOwnerTarget, false);
  assert.equal(risingReport(failed, true).groups[0].within6, 12);
  const duplicates = rows.map((row, i) => i === 1 ? rows[0] : row);
  assert.equal(risingReport(duplicates, true).gates.completeUniqueDirections, false);
  assert.equal(risingReport([{ ...rows[0], balance: 1 }, ...rows.slice(1)], true).gates.balanceZero, false);
  const allFailed = rows.map(row => ({ ...row, stood: false, handback: null, verified: null }));
  assert.equal(risingReport(allFailed).groups[0].median, 30);
  assert.equal(risingReport(rows).claims.meetsOwnerTarget, "not evaluated by the everyday bed");
  const everyday = risingJobs(risingOptions(["--models", "workshop-fighter", "--held", "empty", "--seeds", "7-8"]));
  assert.equal(everyday.length, 18);
});

test("the bed executes a physical episode and returns an honest capped failure with phase and assist readings", async () => {
  const row = await risingTrial({ id: 0, model: "workshop-fighter", held: "empty", seed: 1, start: "placed", posture: "fours", sub: "support-recovery", balance: 0, cap: .1 });
  assert.equal(row.status, "failed"); assert.equal(row.stood, false); assert.equal(row.handback, null);
  assert.ok(row.trail.some(entry => entry.controller === "recovery: rise"));
  assert.ok(Object.values(row.phases).reduce((a, b) => a + b, 0) >= .1 - 1e-9);
  assert.deepEqual(row.assist, { forcePeak: 0, momentPeak: 0, forceImpulse: 0, momentImpulse: 0 });
  assert.equal(row.attempts.at(-1).end, "cap");
});

test("standalone technique beds retain predecessors, fit models, and their eight-second failure cap", () => {
  const options = risingOptions(["--technique", "plant-up", "--after", "roll", "--starts", "dropped", "--held", "empty", "--seeds", "1"]);
  const jobs = risingJobs(options);
  assert.deepEqual(jobs.map(job => [job.model, job.technique, job.after]), [
    ["workshop-fighter", "plant-up", "roll"], ["workshop-rogue", "plant-up", "roll"],
    ["crypt-skeleton", "plant-up", "roll"],
  ]);
  assert.throws(() => risingOptions(["--technique", "plant-up", "--target"]), /standalone techniques/);
  assert.throws(() => risingOptions(["--after", "roll"]), /requires --technique/);
  assert.throws(() => risingOptions(["--technique", "plant-up", "--models", "reptile"]), /models/);
  const report = risingReport(jobs.map(job => ({ ...job, cap: 8, reached: false, stood: false, handback: null, status: "failed", phases: {} })));
  assert.equal(report.mode, "standalone technique"); assert.equal(report.cap, 8);
  assert.ok(report.groups.every(group => group.median === 8 && group.stood === 0 && group.reached === 0));
});

test("the experimental stand-up bed drives the skeleton and reports its actual capped outcome", async () => {
  // This draw has geometric clearance, so the fixture exercises the controller after construction.
  const row = await risingTrial({ id: 0, model: "crypt-skeleton", held: "empty", seed: 0, start: "placed", posture: "back", sub: "stand-up", balance: 0, cap: .1 });
  assert.equal(row.stood, false); assert.equal(row.handback, null);
  assert.ok(row.trail.some(entry => entry.controller.startsWith("stand up:")), JSON.stringify(row));
  assert.deepEqual(row.assist, { forcePeak: 0, momentPeak: 0, forceImpulse: 0, momentImpulse: 0 });
});

test("a standalone Lab technique retains its terminal attempt until restart", async () => {
  const spec = modelSpec("workshop-fighter"), at = address("placed", 4, "front");
  const stand = await coreStand(spec, groundPlacement(spec, at));
  const actor = labActor(stand.built, stand.world, { mind: LAB_PRESETS.script.config,
    subs: [(own, view, world) => groundTechnique("plant-up", own, view, world)] });
  const run = startGround(actor, at);
  try {
    stand.step(8 * 120);
    const attempts = structuredClone(run.frame().attempts);
    assert.equal(attempts.length, 1);
    assert.notEqual(attempts[0].end, "cap");
    assert.equal(run.frame().techniqueReached, attempts[0].end === "done");
    run.shove(); stand.step(2 * 120);
    assert.deepEqual(run.frame().attempts, attempts);
  } finally { run.dispose(); stand.dispose(); }
});

test("a round shoves at the target's impulse, and shoves again only once its stand is verified and the body is back on its feet", async () => {
  const spec = modelSpec("workshop-fighter"), at = address("round"), pushed = [];
  const stand = await coreStand(spec, groundPlacement(spec, at));
  const run = startGround(labActor(stand.built, stand.world, { mind: { ...PUNCHER, subs: [STAND_UP] } }), at,
    { pushed: (segment, impulse) => pushed.push({ step: stand.world.steps, impulse: impulse.asArray(), falls: run.state.falls.length }) });
  try {
    stand.step(121);
    assert.equal(pushed.length, 1); assert.equal(pushed[0].step, 120);
    assert.ok(Math.abs(Math.hypot(...pushed[0].impulse) - targetImpulse(stand.built)) < 1e-9, "the target's 1.5 N s a kg");
    let verified = null;
    while (pushed.length < 2 && stand.world.time < 40) {
      stand.step();
      if (verified === null && run.check.state.stage === "holding") verified = stand.world.time;
    }
    const [fall] = run.state.falls;
    assert.ok(verified !== null, "its stand was verified");
    assert.equal(fall.end, "stood"); assert.equal(fall.degrees, 0);
    assert.ok(fall.verified > 0 && fall.verified < STAND_CHECK.cap);
    // The next shove: after the hold and the walk, the next way round, and the check begun afresh.
    assert.equal(pushed.length, 2); assert.equal(pushed[1].falls, 1);
    assert.ok(pushed[1].step / stand.world.hz >= verified + STAND_CHECK.standing + STAND_CHECK.walking);
    assert.equal(run.check.state.takeover, null);
    assert.deepEqual(run.frame().round, { falls: 1, of: ROUND_FALLS, stood: 1, within6: Number(fall.verified <= 6), median: fall.verified });
  } finally { run.dispose(); stand.dispose(); }
});


test("an equipped rising trial builds both named hands and keeps them distinct from the owner target", async () => {
  const loadout = { left: "buckler", right: "club" }, job = { id: 0, model: "workshop-fighter", held: "empty", loadout,
    seed: 1, start: "shoved", degrees: 0, balance: 0, grit: 0, gusts: false, target: false, sub: "stand-up" };
  let items;
  const row = await risingTrial(job, { stop: (_world, built) => {
    items = built.spec.held.map(({ segment, item }) => [segment, item.name]).sort(); return true;
  } });
  assert.deepEqual(items, [["hand.left", "buckler"], ["hand.right", "wooden club"]]);
  assert.deepEqual(row.loadout, loadout);
  assert.equal(risingReport([row]).groups[0].key, "shoved/workshop-fighter/buckler,club");
  await assert.rejects(risingTrial({ ...job, target: true }), /owner target fixes its loadouts/);
  await assert.rejects(risingTrial({ ...job, loadout: { left: "unknown", right: "club" } }), /left hand/);
  assert.ok(risingJobs(risingOptions(["--target"])).every((one) => !Object.hasOwn(one, "loadout")), "the canonical target's jobs are unchanged");
});
