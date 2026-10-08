import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { foundationJobs, foundationTrial, attackAccounting, proportion } from "../research/control-foundation-trials.mjs";
import { runFoundation, summarizeFoundation } from "../research/control-foundation.mjs";
import { COMPETENCY, RATES, competencyFigures, competencyPasses, fullReach } from "../research/competencies.mjs";
import { modelSpec } from "../src/core/models.ts";
import { rigidPoints } from "../src/core/build/rigid.ts";
import { aimOf } from "../src/core/skills/strikes.ts";

test("support entry jobs keep missing bodies explicit and reject inapplicable prediction settings", async () => {
  const jobs = foundationJobs({ suite: "support-entry", actuation: "directional" });
  assert.equal(jobs.length, 12); assert.equal(new Set(jobs.map((j) => j.id)).size, 12);
  assert.throws(() => foundationJobs({ suite: "support-entry", split: "held-out" }), /held-out/);
  for (const suite of ["support-entry", "posture-hold"]) assert.throws(() => foundationJobs({ suite, jointStops: true }), /motion probe suite/);
  const rows = await Promise.all(jobs.filter((j) => j.model !== "workshop-fighter").map(async (job) => ({ job, result: await foundationTrial(job) })));
  const cells = summarizeFoundation(rows).cells;
  assert.equal(cells.length, 8); assert.ok(cells.every((c) => c.unsupported === 1 && c.measured === 0 && c.success.count === 0));
});

test("support entry's worker watch starts after its physical fall bootstrap", {
  todo: "the open hand bears on its palm's measured hull, and this support was tuned on the open capsule",
}, () => {
  const directory = mkdtempSync(join(tmpdir(), "foundation-entry-"));
  try {
    execFileSync(process.execPath, ["research/control-foundation.mjs", "--suite", "support-entry", "--models", "workshop-fighter",
      "--workers", "1", "--actuation", "directional", "--out", directory],
    { env: { ...process.env, CORE_ENGINE: "rapier-coordinate-coulomb" }, timeout: 120000, stdio: "pipe" });
    const rows = readFileSync(join(directory, "rows.jsonl"), "utf8").trim().split("\n").map(JSON.parse);
    assert.equal(rows.length, 4);
    const failed = rows.find((r) => r.job.direction === 1).result.outcome;
    assert.equal(failed.complete, true); assert.equal(failed.steps, 4800); assert.equal(failed.success, false);
    assert.ok(rows.every((r) => r.result.outcome.replayExact));
    assert.equal(rows.filter((r) => r.result.outcome.success).length, 3);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("installed posture jobs keep gain/posture cells and missing body witnesses explicit", async () => {
  const jobs = foundationJobs({ suite: "posture-hold", actuation: "directional" });
  assert.equal(jobs.length, 27); assert.equal(new Set(jobs.map((j) => j.id)).size, 27);
  assert.throws(() => foundationJobs({ suite: "posture-hold", split: "held-out" }), /held-out/);
  const barefoot = foundationJobs({ suite: "posture-hold", actuation: "directional", envelope: "barefoot" });
  assert.ok(jobs.every((j) => !("envelope" in j)) && barefoot.every((j) => j.envelope === "barefoot"), "the boot's jobs keep their identity");
  assert.equal(new Set([...jobs, ...barefoot].map((j) => j.id)).size, 54);
  for (const invalid of [{ suite: "posture-hold", envelope: "toe" }, { suite: "baseline", envelope: "barefoot" }]) assert.throws(() => foundationJobs(invalid), /envelope/);
  const missing = jobs.filter((j) => j.model !== "workshop-fighter");
  const rows = await Promise.all(missing.map(async (job) => ({ job, result: await foundationTrial(job) })));
  assert.ok(rows.every((r) => r.result.status === "unsupported"));
  const summary = summarizeFoundation(rows);
  assert.equal(summary.cells.length, 18);
  assert.ok(summary.cells.every((c) => c.unsupported === 1 && c.measured === 0 && c.success.count === 0));
});

test("defense trials keep hand/loadout denominators and pair physical protection against pose", async () => {
  const jobs = foundationJobs({ suite: "defense", models: ["workshop-fighter"], samples: 1, actuation: "directional" });
  assert.equal(jobs.length, 12);
  assert.deepEqual([...new Set(jobs.map((j) => j.hands))], ["left", "right", "both"]);
  assert.deepEqual([...new Set(jobs.map((j) => j.held))], ["empty", "club"]);
  const rows = await runFoundation(jobs.slice(0, 2), { workers: 2 });
  assert.ok(rows.every((r) => r.result.outcome.replayExact && r.result.outcome.steps === 1200));
  const [prediction, pose] = rows.map((r) => r.result.outcome);
  assert.equal(prediction.success, true); assert.ok(pose.protectedImpulse > prediction.protectedImpulse);
  const summary = summarizeFoundation(rows);
  assert.equal(summary.cells.length, 2);
  assert.ok(summary.cells.every((c) => c.success.count === 1));
  assert.equal(summary.pairedDefense.length, 1);
  assert.equal(summary.pairedDefense[0].protectedImpulseSavedNs, pose.protectedImpulse - prediction.protectedImpulse);
});

test("foundation starts are reproducible, split-disjoint and explicit about unsupported equipment", () => {
  const options = { models: ["workshop-fighter"], samples: 3 };
  const a = foundationJobs(options), b = foundationJobs({ ...options, split: "held-out" });
  assert.deepEqual(a, foundationJobs(options));
  assert.equal(new Set(a.map((j) => j.id)).size, a.length);
  assert.ok(a.every((j) => !b.some((other) => other.id === j.id)));
  const seeds = new Set(a.map((j) => j.seed).filter((s) => s !== undefined));
  assert.ok(b.filter((j) => j.seed !== undefined).every((j) => !seeds.has(j.seed)));
  assert.equal(a.filter((j) => j.task === "unsupported").length, 2);
  assert.deepEqual([...new Set(a.filter((j) => j.task === "strike").map((j) => j.hand))], ["left", "right"]);
  assert.throws(() => foundationJobs({ from: 999999, samples: 2 }), /split/);
  assert.throws(() => foundationJobs({ hz: 0 }), /hz/);
  assert.throws(() => foundationJobs({ suite: "typo" }), /suite/);
  assert.throws(() => foundationJobs({ actuation: "typo" }), /actuation/);
  const directional = foundationJobs({ ...options, actuation: "directional" });
  assert.ok(directional.every((j, i) => j.actuation === "directional" && j.id !== a[i].id));
});

test("preparation counts commitments, not frames in a swing or aborted approaches", () => {
  const meter = attackAccounting();
  for (const [phase, time] of [["approach", 1], ["place", 2], ["chamber", 4], ["swing", 5], ["swing", 6], [null, 7],
    ["approach", 8], [null, 9], ["settle", 10], ["swing", 12]]) meter.take(phase, time);
  assert.deepEqual(meter.preparations, [3, 2]);
  assert.deepEqual(proportion(0, 0), { successes: 0, count: 0, rate: null, interval95: null });
  const interval = proportion(1, 2);
  assert.equal(interval.rate, 0.5);
  assert.ok(interval.interval95[0] > 0 && interval.interval95[0] < 0.1 && interval.interval95[1] > 0.9);
  assert.throws(() => proportion(2, 1), /counts/);
});

test("the common runner hosts both reach controllers and keeps their denominators separate", async () => {
  const jobs = foundationJobs({ suite: "reach", models: ["workshop-fighter"], samples: 1, actuation: "directional" });
  assert.deepEqual(jobs.map((j) => [j.controller, j.policyPeriodSteps, j.hz, j.held]), [["actuator", 4, 120, "empty"], ["layered", 4, 120, "empty"]]);
  assert.throws(() => foundationJobs({ suite: "reach", hz: 480 }), /120/);
  const rows = await runFoundation(jobs, { workers: 2 });
  assert.ok(rows.every((r) => r.result.outcome.terminated && !r.result.outcome.truncated && r.result.outcome.invalid === null));
  assert.deepEqual(rows[0].result.outcome.goal, rows[1].result.outcome.goal);
  assert.notEqual(rows[0].result.outcome.observationDigest, rows[1].result.outcome.observationDigest);
  const summary = summarizeFoundation(rows);
  assert.equal(summary.cells.length, 2);
  assert.ok(summary.cells.every((c) => c.success.successes === 1 && c.success.count === 1));
});

test("a physical strike repeats on fresh worlds and a missing target does not score a hit", async () => {
  const jobs = foundationJobs({ models: ["workshop-fighter"], samples: 1 });
  const at = jobs.find((j) => j.task === "strike" && j.held === "club" && j.hand === "right" && j.target === "place");
  const miss = jobs.find((j) => j.task === "strike" && j.held === "club" && j.hand === "right" && j.target === "miss");
  const a = await foundationTrial(at), b = await foundationTrial(at), absent = await foundationTrial(miss);
  assert.deepEqual(a, b);
  assert.equal(a.status, "measured");
  assert.ok(a.outcome.usefulHit && a.outcome.done > 0 && a.physical.steps > 120);
  assert.equal(absent.outcome.usefulHit, false);
  assert.equal(absent.outcome.done, 0);
  assert.notEqual(a.physical.digest, absent.physical.digest);
  assert.ok(a.physical.maxJointAnchorSeparationMetres > 0);
  assert.equal(a.physical.assistForceIntegralNs, 0);
  const directional = await foundationTrial({ ...at, actuation: "directional" });
  assert.notEqual(directional.physical.digest, a.physical.digest, "the selected actuator law reaches the physical fixture");
});

test("workers preserve task order, report unsupported tasks and terminate on a failed job", async () => {
  const jobs = foundationJobs({ suite: "integrated", models: ["workshop-fighter"], samples: 1 });
  const rows = await runFoundation(jobs, { workers: 2 });
  assert.deepEqual(rows.map((r) => r.job), jobs);
  assert.ok(rows.every((r) => r.result.status === "unsupported"));
  const summary = summarizeFoundation(rows);
  assert.deepEqual(summary.cells.map((c) => [c.measured, c.unsupported, c.success]), [[0, 1, null], [0, 1, null]]);
  await assert.rejects(runFoundation([{ task: "unknown" }], { workers: 1 }), /unknown foundation task/);
});

test("the common bar runner measures each release separately and replays its loaded branch", async () => {
  const jobs = foundationJobs({ suite: "bar", models: ["workshop-fighter"], samples: 1, actuation: "directional" });
  assert.deepEqual(jobs.map((j) => [j.held, j.release]), [["shared-club", "left"], ["shared-club", "right"]]);
  const rows = await runFoundation(jobs, { workers: 2 });
  assert.ok(rows.every((r) => r.result.outcome.success && r.result.outcome.replayExact));
  assert.ok(rows.every((r) => r.result.physical.assistForceIntegralNs === 0));
  assert.deepEqual(summarizeFoundation(rows).cells.map((c) => [c.success.successes, c.success.count]), [[1, 1], [1, 1]]);
});

test("standing bar trials have separate denominators and enforce physical support gates", {
  todo: "the open hand bears on its palm's measured hull, and this support was tuned on the open capsule",
}, async () => {
  const options = { suite: "bar", models: ["workshop-fighter"], samples: 1, actuation: "directional" };
  const jobs = foundationJobs({ ...options, support: "standing" });
  assert.throws(() => foundationJobs({ ...options, support: "unknown" }), /support/);
  assert.ok(jobs.every((j, i) => j.support === "standing" && j.id !== foundationJobs(options)[i].id));
  const rows = await runFoundation(jobs, { workers: 2 });
  assert.ok(rows.every((r) => r.result.outcome.success && !r.result.outcome.fell && r.result.outcome.rejectedSteps === 0));
  assert.ok(rows.every((r) => r.result.configuration.pin === null && r.result.outcome.replayExact));
  const summary = summarizeFoundation([...rows, ...rows.map((r) => ({ ...r, job: { ...r.job, support: "pinned" } }))]);
  assert.equal(summary.cells.length, 4);
  assert.ok(summary.cells.every((c) => c.success.count === 1));
});

test("the common runner preserves side-specific support outcomes and replay", async () => {
  const jobs = foundationJobs({ suite: "support", models: ["crypt-skeleton"], samples: 1, actuation: "directional" });
  assert.deepEqual(jobs.map((j) => j.side), ["left", "right"]);
  const rows = await runFoundation(jobs, { workers: 2 });
  assert.ok(rows.every((r) => r.result.outcome.success && r.result.outcome.replayExact));
  assert.deepEqual(summarizeFoundation(rows).cells.map((c) => [c.success.successes, c.success.count]), [[1, 1], [1, 1]]);
});

test("point-strike trials separate hands, loadouts and intentional misses", async () => {
  const jobs = foundationJobs({ suite: "point-strike", models: ["workshop-fighter"], samples: 1, actuation: "directional" });
  assert.equal(jobs.length, 12);
  assert.equal(new Set(jobs.map((j) => j.id)).size, 12);
  const selected = jobs.filter((j) => j.hands === "both" && j.held === "club");
  const rows = await runFoundation(selected, { workers: 2 });
  assert.ok(rows.every((r) => r.result.outcome.success && r.result.outcome.replayExact));
  assert.ok(rows[0].result.outcome.strikes.every((s) => s.contacts > 0));
  assert.ok(rows[1].result.outcome.strikes.every((s) => s.contacts === 0));
  assert.deepEqual(summarizeFoundation(rows).cells.map((c) => [c.success.successes, c.success.count]), [[1, 1], [1, 1]]);
});

test("shared strike jobs retain hold/release and hit/miss denominators", () => {
  const config = { suite: "point-strike", models: ["workshop-fighter"], samples: 1, actuation: "directional" };
  const shared = foundationJobs({ ...config, shared: true, centreControl: true, continueSeconds: 10 });
  assert.deepEqual(shared.map((j) => [j.hands, j.held, j.miss, j.shared]), [
    ["both", "club", false, {}], ["both", "club", false, { release: "left" }], ["both", "club", false, { release: "right" }],
    ["both", "club", true, {}], ["both", "club", true, { release: "left" }], ["both", "club", true, { release: "right" }],
  ]);
  assert.equal(new Set(shared.map((j) => j.id)).size, 6);
  const independent = foundationJobs(config);
  assert.ok(shared.every((j) => independent.every((other) => j.id !== other.id)));
  const rows = shared.map((job) => ({ job, result: { status: "measured", outcome: { success: false } } }));
  assert.equal(summarizeFoundation(rows).cells.length, 6);
  assert.throws(() => foundationJobs({ suite: "bar", shared: true }), /shared equipment/);
});

test("moving strikes keep tracked, fixed-aim and miss outcomes separate", async () => {
  const jobs = foundationJobs({ suite: "moving-strike", models: ["workshop-fighter"], samples: 1, actuation: "directional" });
  assert.equal(jobs.length, 18);
  assert.equal(new Set(jobs.map((j) => j.id)).size, 18);
  const selected = jobs.filter((j) => j.hands === "left" && j.held === "empty");
  assert.deepEqual(selected.map((j) => [j.miss, j.swing.tracking, j.swing.delay]), [[false, true, 3], [false, false, 3], [true, true, 3]]);
  const rows = await runFoundation(selected, { workers: 2 });
  assert.ok(rows.every((r) => r.result.outcome.replayExact));
  assert.ok(rows.every((r) => r.result.outcome.strikes.every((s) => s.targetTravel > 0.1 && s.targetSpeed > 0.5)));
  assert.equal(rows[2].result.outcome.strikes[0].contacts, 0);
  assert.equal(summarizeFoundation(rows).cells.length, 3);
  assert.ok(summarizeFoundation(rows).cells.every((c) => c.success.count === 1));
  const extended = foundationJobs({ suite: "moving-strike", models: ["workshop-fighter"], samples: 1, actuation: "directional", centreControl: true, continueSeconds: 10 });
  assert.ok(extended.every((j, i) => j.centreControl && j.continueSeconds === 10 && j.watchSeconds === 17 && j.id !== jobs[i].id));
  const compared = [...rows, ...rows.map((r) => ({ ...r, job: { ...r.job, centreControl: true, continueSeconds: 10 } }))];
  assert.equal(summarizeFoundation(compared).cells.length, 6);
  assert.throws(() => foundationJobs({ suite: "bar", centreControl: true }), /point-strike suite/);
  assert.throws(() => foundationJobs({ suite: "point-strike", continueSeconds: NaN }), /continuation/);
});

test("guard differences compare the same side and start and recovery excludes shoves held", () => {
  const outcome = (damage) => ({ seconds: 10, sides: [{ headDamage: damage, damage: damage + 1, fallen: false }, { headDamage: 8, damage: 9, fallen: true }] });
  const job = { model: "workshop-fighter", held: "club", seed: 4, hz: 120, task: "bout" };
  const rows = [
    { job: { ...job, guard: "pose" }, result: { status: "measured", outcome: outcome(4) } },
    { job: { ...job, guard: "left-cover" }, result: { status: "measured", outcome: outcome(1) } },
    { job: { ...job, guard: "pose", actuation: "directional" }, result: { status: "measured", outcome: outcome(19) } },
    ...[{ fell: true, risen: true, up: true }, { fell: true, risen: true, up: false }, { fell: false }].map((o) =>
      ({ job: { ...job, task: "recovery" }, result: { status: "measured", outcome: o } })),
  ];
  const summary = summarizeFoundation(rows);
  assert.deepEqual(summary.pairedGuard, [{ pair: "workshop-fighter/club/4/120/symmetric", guard: "left-cover", headDamageSaved: 3,
    damageSaved: 3, poseFallen: false, coverFallen: false, poseSeconds: 10, coverSeconds: 10 }]);
  assert.equal(summary.cells.at(-1).success.count, 2);
  assert.equal(summary.cells.at(-1).success.successes, 1);
});


test("the CLI records the corrected Rapier profile used by its physical workers", () => {
  const directory = mkdtempSync(join(tmpdir(), "foundation-coordinate-"));
  try {
    execFileSync(process.execPath, ["research/control-foundation.mjs", "--suite", "bar", "--models", "crypt-skeleton",
      "--samples", "1", "--workers", "1", "--support", "standing", "--actuation", "directional", "--joint-stops", "--out", directory],
    { env: { ...process.env, CORE_ENGINE: "rapier-coordinate" }, timeout: 120000, stdio: "pipe" });
    const manifest = JSON.parse(readFileSync(join(directory, "manifest.json"), "utf8"));
    const rows = readFileSync(join(directory, "rows.jsonl"), "utf8").trim().split("\n").map(JSON.parse);
    assert.equal(manifest.engine, "rapier-coordinate");
    assert.ok(manifest.engineRevision.endsWith("/coordinate-limits"));
    assert.equal(rows.length, 2);
    for (const row of rows) {
      assert.equal(row.result.configuration.engineRevision, manifest.engineRevision);
      assert.equal(row.result.outcome.replayExact, true);
      assert.equal(row.result.outcome.releaseContinuous, true);
      assert.equal(row.result.outcome.success, true);
      assert.equal(row.result.configuration.jointStops, true);
      assert.equal(row.result.physical.stops.steps, row.result.outcome.steps);
      assert.equal(row.result.physical.stops.rejectedSteps, 0);
      assert.ok(row.result.physical.stops.nearSteps > 0);
      assert.ok(row.result.physical.stops.peakAccelerationViolation < row.result.configuration.stopPrediction.accelerationTolerance);
    }
  } finally {
    const target = realpathSync(directory);
    assert.equal(dirname(target), realpathSync(tmpdir()));
    assert.ok(basename(target).startsWith("foundation-coordinate-"));
    rmSync(target, { recursive: true, force: true });
  }
});


test("joint-stop comparisons retain distinct manifests and defense denominators", () => {
  const options = { suite: "defense", models: ["workshop-fighter"], samples: 1 };
  const base = foundationJobs(options), stopped = foundationJobs({ ...options, jointStops: true });
  assert.deepEqual(base, foundationJobs({ ...options, jointStops: false }));
  assert.ok(stopped.every((job, i) => job.jointStops && job.id !== base[i].id));
  for (const suite of ["support", "recovery", "baseline", "integrated", "reach"]) assert.throws(() => foundationJobs({ suite, jointStops: true }), /motion probe/);
  assert.throws(() => foundationJobs({ ...options, jointStops: "yes" }), /motion probe/);
  const rows = [...base, ...stopped].map((job) => ({ job, result: { status: "measured", outcome: { success: true, protectedImpulse: job.variant === "pose" ? 2 : 0, fell: false } } }));
  const summary = summarizeFoundation(rows);
  assert.equal(summary.cells.length, 24); assert.equal(summary.pairedDefense.length, 12);
  assert.ok(summary.pairedDefense.every((pair) => pair.protectedImpulseSavedNs === 2));
});

test("the competency suite has a row for every competency in every cell, and none outside its own suite", () => {
  const jobs = foundationJobs({ suite: "competency", samples: 1 }), cells = new Map();
  assert.equal(new Set(jobs.map((j) => j.id)).size, jobs.length);
  for (const j of jobs) cells.set(`${j.model}/${j.held}`, [...(cells.get(`${j.model}/${j.held}`) ?? []), j]);
  assert.deepEqual([...cells.keys()], ["workshop-fighter/empty", "workshop-fighter/club", "workshop-rogue/empty", "workshop-rogue/club"]);
  for (const [cell, members] of cells) {
    const count = (c) => members.filter((j) => j.competency === c).length, club = cell.endsWith("club");
    assert.deepEqual([count("stand"), count("guard"), count("punch"), count("walk"), count("rise"), count("kick"), count("run")],
      [COMPETENCY.stand.levels.length * COMPETENCY.stand.ways, 6, club ? 1 : 6, COMPETENCY.walk.speeds.length * COMPETENCY.walk.ways + 2, COMPETENCY.rise.ways, 4, 1], cell);
    assert.equal(members.filter((j) => j.task === "unsupported").length, club ? 2 : 1, cell);
  }
  const held = foundationJobs({ suite: "competency", samples: 1, split: "held-out" });
  assert.ok(held.every((j) => !jobs.some((d) => d.id === j.id)));
  assert.deepEqual(new Set(foundationJobs({ suite: "competency", samples: 1, competency: "kick" }).map((j) => j.competency)), new Set(["kick"]));
  assert.throws(() => foundationJobs({ suite: "competency", competency: "swim" }), /competency/);
  assert.throws(() => foundationJobs({ suite: "defense", competency: "guard" }), /competency/);
  assert.throws(() => foundationJobs({ suite: "competency", hz: 240 }), /120, 480/);
});

test("full reach puts the strike point of a straight arm from the built shoulder on the target", () => {
  const length = (a, b) => Math.sqrt(a.reduce((sum, v, i) => sum + (v - b[i]) * (v - b[i]), 0));
  for (const model of ["workshop-fighter", "workshop-rogue"]) for (const hand of ["left", "right"]) {
    const spec = modelSpec(model), centre = (name) => spec.joints.find((j) => j.name === name).centre.value;
    const strike = rigidPoints(spec, spec.segments.find((s) => s.name === `hand.${hand}`)).get(aimOf(spec, hand)).value;
    const arm = length(centre(`shoulder.${hand}`), centre(`elbow.${hand}`)) + length(centre(`elbow.${hand}`), centre(`wrist.${hand}`))
      + length(centre(`wrist.${hand}`), strike);
    const x = hand === "right" ? 0.1 : -0.1, ahead = fullReach(model, hand, x, 1.55);
    assert.ok(Math.abs(length(centre(`shoulder.${hand}`), [x, 1.55, ahead]) - arm) < 1e-12, `${model} ${hand}`);
    assert.ok(ahead > centre(`shoulder.${hand}`)[2]);
    assert.equal(fullReach(model, hand, x, 1.55 + 2 * arm), null);
  }
});

test("competency figures: the least shove and fastest walk held every way, blows landed, rises, and gaps meet nothing", () => {
  const row = (job, outcome) => ({ job: { model: "workshop-fighter", held: "empty", hz: 120, actuation: "symmetric", ...job }, result: { status: "measured", outcome } });
  const { levels, ways } = COMPETENCY.stand;
  // Every way held up to 0.5 N s/kg, one way fell at 0.6, and every way held again at 0.8: the rule stops at the first miss.
  const stand = levels.flatMap((level) => Array.from({ length: ways }, (_, k) => row({ competency: "stand", level },
    { success: !(level === 0.6 && k === 3), fell: level === 0.6 && k === 3, steps: 1 })));
  const s = competencyFigures("stand", stand);
  assert.equal(s.level, 0.5); assert.equal(s.meets, true);
  assert.deepEqual(s.levels.map((l) => l.held), levels.map((l) => l === 0.6 ? ways - 1 : ways));
  assert.equal(competencyFigures("stand", stand.map((r) => r.job.level === 0.2 ? { ...r, result: { status: "measured", outcome: { success: false } } } : r)).level, 0);
  // Upright through 1.0 m/s and falling at 1.4; one heading lags at every speed and barely moves at 1.0, so the speed
  // travelled is that heading's at 0.7. A fall at 0.5 stops the ladder below it.
  const walking = (fell, along) => COMPETENCY.walk.speeds.flatMap((speed) => Array.from({ length: COMPETENCY.walk.ways }, (_, k) =>
    row({ competency: "walk", trial: "walk", speed }, { success: !fell(speed, k), fell: fell(speed, k), along: along(speed, k) })));
  const lagging = (speed, k) => k !== 2 ? speed : speed === 1 ? 0.2 : speed * 0.9;
  const turning = [1, -1].map((sense) => row({ competency: "walk", trial: "turn", sense }, { success: sense === 1, fell: sense !== 1 }));
  const w = competencyFigures("walk", [...walking((speed) => speed > 1, lagging), ...turning]);
  assert.equal(w.upright, 1); assert.equal(w.speed, 0.7 * 0.9); assert.deepEqual(w.turns, { held: 1, count: 2 }); assert.equal(w.meets, false);
  assert.deepEqual(w.speeds.map((s) => [s.held, s.fell, s.slowest]), [[4, 0, 0.3 * 0.9], [4, 0, 0.5 * 0.9], [4, 0, 0.7 * 0.9], [4, 0, 0.2], [0, 4, 1.4 * 0.9]]);
  const stopped = competencyFigures("walk", walking((speed, k) => speed > 1 || speed === 0.5 && k === 0, lagging));
  assert.equal(stopped.upright, 0.3); assert.equal(stopped.speed, 0.3 * 0.9);
  const upright = turning.map((r) => ({ ...r, result: { status: "measured", outcome: { success: true, fell: false } } }));
  const brisk = competencyFigures("walk", [...walking(() => false, (speed) => speed), ...upright]);
  assert.equal(brisk.speed, 1.4); assert.equal(brisk.meets, true);
  assert.equal(competencyFigures("walk", [...walking(() => false, (speed) => speed * 0.9), ...upright]).meets, false);
  const cell = (competency, hz, meets) => ({ cell: `${competency}/workshop-fighter/empty/${hz}/symmetric`, meets });
  assert.deepEqual(RATES, [120, 480]);
  assert.deepEqual(competencyPasses([cell("walk", 120, true), cell("walk", 480, true), cell("punch", 480, false), cell("punch", 120, true), cell("kick", 120, true)]), [
    { cell: "walk/workshop-fighter/empty/symmetric", meets: { 120: true, 480: true }, passes: true },
    { cell: "punch/workshop-fighter/empty/symmetric", meets: { 120: true, 480: false }, passes: false },
    { cell: "kick/workshop-fighter/empty/symmetric", meets: { 120: true }, passes: false }]);
  const punch = (outcome) => row({ competency: "punch", hand: "right", placement: "place", mode: "hit" }, { success: true, fell: false, impulse: 5, cycleSeconds: [0.3], ...outcome });
  const strong = competencyFigures("punch", [punch({ blows: 4, landed: 4, speeds: [7, 8, 9, 7], firstContactSeconds: 0.3 })]);
  assert.equal(strong.meets, true); assert.deepEqual(strong.parts[0].blows, { landed: 4, count: 4 }); assert.equal(strong.parts[0].slowest, 7);
  for (const weak of [{ blows: 4, landed: 3, speeds: [7, 8, 9], firstContactSeconds: 0.3 }, { blows: 4, landed: 4, speeds: [7, 8, 9, 6], firstContactSeconds: 0.3 },
    { blows: 4, landed: 4, speeds: [7, 8, 9, 7], firstContactSeconds: 0.6 }]) assert.equal(competencyFigures("punch", [punch(weak)]).meets, false, JSON.stringify(weak));
  const rise = (fell, risen, seconds) => row({ competency: "rise" }, { fell, risen, up: risen, seconds });
  const r = competencyFigures("rise", [rise(true, true, 4), rise(true, true, 8), rise(true, true, 5), rise(false, false, null)]);
  assert.deepEqual([r.fallen, r.risen, r.seconds, r.slowest, r.meets], [3, 3, 5, 8, true]);
  assert.equal(competencyFigures("rise", [rise(true, true, 4), rise(true, false, null)]).meets, false);
  const gap = { job: { competency: "punch", task: "unsupported" }, result: { status: "unsupported" } };
  assert.equal(competencyFigures("punch", [gap, punch({ blows: 4, landed: 4, speeds: [8, 8, 8, 8], firstContactSeconds: 0.3 })]).meets, false);
  assert.deepEqual(competencyFigures("run", [gap]), { competency: "run", trials: 1, measured: 0, unsupported: 1, meets: false });
});

test("competency trials replay on fresh worlds, and a miss lands nothing a hit lands", async () => {
  const jobs = foundationJobs({ suite: "competency", models: ["workshop-fighter"], samples: 1 });
  const pick = [jobs.find((j) => j.competency === "stand" && j.level === 0.3 && j.held === "empty"),
    jobs.find((j) => j.competency === "walk" && j.trial === "walk" && j.speed === 0.3 && j.held === "club"),
    jobs.find((j) => j.competency === "punch" && j.hand === "right" && j.placement === "place" && j.mode === "hit"),
    jobs.find((j) => j.competency === "punch" && j.hand === "right" && j.mode === "miss"),
    jobs.find((j) => j.competency === "kick" && j.foot === "left" && j.mode === "hit" && j.held === "empty")];
  const [a, b] = await Promise.all([runFoundation(pick, { workers: 5 }), runFoundation(pick, { workers: 5 })]);
  assert.deepEqual(a.map((r) => r.result.outcome), b.map((r) => r.result.outcome));
  const [stand, walk, hit, miss, kick] = a.map((r) => r.result.outcome);
  assert.ok(stand.success && !stand.fell);
  assert.ok(walk.success && !walk.fell && walk.along > 0.2 && walk.along < 0.4, `walked ${walk.along}`);
  assert.ok(hit.success && hit.landed > 0 && hit.landed <= hit.blows && hit.speeds.length === hit.landed, JSON.stringify(hit));
  // The planted cross at its own cell reads 4.4 to 5 m/s over its last 10 cm, and the front kick 1.1 to 1.5 m/s at contact
  // (docs/reference/competencies.md#baseline).
  assert.ok(hit.speeds.every((v) => v > 4 && v < 5.5) && hit.firstContactSeconds > 0.25 && hit.firstContactSeconds < 0.5, JSON.stringify(hit.speeds));
  assert.ok(miss.success && miss.blows > 0 && miss.landed === 0 && miss.contacts === 0 && miss.speed === null, JSON.stringify(miss));
  assert.ok(kick.success && kick.landed > 0 && kick.speeds.every((v) => v > 1 && v < 1.6), JSON.stringify(kick));
});
