/**
 * **The control foundation's jobs and summaries** (`research/control-foundation.mjs`,
 * `research/control-foundation-trials.mjs`, `research/competencies.mjs`, `research/physiques.mjs`):
 * which jobs a suite makes, how a summary counts their rows, and what a competency's figures read,
 * with no physical trial run.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { foundationJobs, foundationTrial } from "../research/control-foundation-trials.mjs";
import { runFoundation, summarizeCompetencies, summarizeFoundation } from "../research/control-foundation.mjs";
import { PHYSIQUE_GRID, physiqueGrid, physiqueLabel, physiqueRanges } from "../research/physiques.mjs";
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

test("workers preserve task order, report unsupported tasks and terminate on a failed job", async () => {
  const jobs = foundationJobs({ suite: "integrated", models: ["workshop-fighter"], samples: 1 });
  const rows = await runFoundation(jobs, { workers: 2 });
  assert.deepEqual(rows.map((r) => r.job), jobs);
  assert.ok(rows.every((r) => r.result.status === "unsupported"));
  const summary = summarizeFoundation(rows);
  assert.deepEqual(summary.cells.map((c) => [c.measured, c.unsupported, c.success]), [[0, 1, null], [0, 1, null]]);
  await assert.rejects(runFoundation([{ task: "unknown" }], { workers: 1 }), /unknown foundation task/);
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
  const cell = (competency, hz, meets, physique = "default") => ({ competency, model: "workshop-fighter", physique, held: "empty", hz, actuation: "symmetric", meets });
  assert.deepEqual(RATES, [120, 480]);
  assert.deepEqual(competencyPasses([cell("walk", 120, true), cell("walk", 480, true), cell("punch", 480, false), cell("punch", 120, true), cell("kick", 120, true),
    cell("walk", 120, true, "size=1.18"), cell("walk", 480, false, "size=1.18")]), [
    { cell: "walk/workshop-fighter/default/empty/symmetric", meets: { 120: true, 480: true }, passes: true },
    { cell: "punch/workshop-fighter/default/empty/symmetric", meets: { 120: true, 480: false }, passes: false },
    { cell: "kick/workshop-fighter/default/empty/symmetric", meets: { 120: true }, passes: false },
    { cell: "walk/workshop-fighter/size=1.18/empty/symmetric", meets: { 120: true, 480: false }, passes: false }]);
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

test("the physique grid is its record's axes, any of which a run replaces, and a default job is the job it was", () => {
  assert.deepEqual(Object.keys(PHYSIQUE_GRID), ["size", "weight", "strength", "speed"]);
  assert.deepEqual([physiqueGrid().length, physiqueGrid(physiqueRanges(), "full").length], [9, 81]);
  const wider = physiqueRanges({ size: [1.3, 0.8, 1, 1.1] });
  assert.deepEqual(wider.size, [0.8, 1, 1.1, 1.3]);
  assert.deepEqual([physiqueGrid(wider).length, physiqueGrid(wider, "full").length], [10, 108]);
  assert.deepEqual(physiqueGrid(physiqueRanges({ weight: [], strength: [], speed: [] })), [{}, { size: 0.9 }, { size: 1.18 }]);
  assert.deepEqual(new Set(physiqueGrid(physiqueRanges(), "full").map(physiqueLabel)).size, 81);
  assert.deepEqual([physiqueLabel({}), physiqueLabel({ speed: 1.15, size: 0.9 })], ["default", "size=0.9,speed=1.15"]);
  for (const bad of [{ reach: [1.1] }, { size: [0] }, { weight: [Number.NaN] }]) assert.throws(() => physiqueRanges(bad), /physique/);
  assert.throws(() => physiqueGrid(physiqueRanges(), "half"), /design/);

  const plain = foundationJobs({ suite: "competency", samples: 1 }), grid = foundationJobs({ suite: "competency", samples: 1, grid: "axes" });
  assert.equal(grid.length, 9 * plain.length);
  const ids = new Set(grid.map((j) => j.id));
  assert.ok(plain.every((j) => ids.has(j.id)), "the default physique's jobs keep their ids");
  assert.ok(grid.every((j) => j.physique === undefined || Object.keys(j.physique).length === 1));
  const ranged = foundationJobs({ suite: "competency", samples: 1, grid: "axes", ranges: { size: [1.3], weight: [], strength: [], speed: [] } });
  assert.deepEqual(new Set(ranged.map((j) => physiqueLabel(j.physique))), new Set(["default", "size=1.3"]));
  // The job reads its own body: a shove is per kilogram of it, and full reach is its own arm's.
  const at = (jobs, label, pick) => jobs.find((j) => physiqueLabel(j.physique) === label && pick(j));
  const shove = (j) => j.competency === "stand" && j.level === 0.5 && j.model === "workshop-fighter" && j.held === "empty";
  assert.ok(Math.abs(at(ranged, "size=1.3", shove).impulse / at(ranged, "default", shove).impulse - 1.3 ** 3) < 1e-12);
  const reach = (j) => j.competency === "punch" && j.placement === "reach" && j.hand === "right" && j.model === "workshop-fighter";
  assert.ok(at(ranged, "size=1.3", reach).ahead > at(ranged, "default", reach).ahead + 0.1);
  // A place and a kick's target stand where they did in the body's own proportions; weight moves neither.
  const place = (j) => j.competency === "punch" && j.placement === "place" && j.mode === "hit" && j.hand === "right" && j.model === "workshop-rogue";
  const kick = (j) => j.competency === "kick" && j.foot === "left" && j.mode === "hit" && j.model === "workshop-rogue" && j.held === "empty";
  for (const pick of [place, kick]) {
    const big = at(ranged, "size=1.3", pick), plain = at(ranged, "default", pick);
    assert.ok(Math.abs(big.ahead - 1.3 * plain.ahead) < 1e-12 && big.height > 1.29 * plain.height, JSON.stringify([big, plain]));
  }
  const heavy = foundationJobs({ suite: "competency", samples: 1, grid: "axes", ranges: { size: [], weight: [1.25], strength: [], speed: [] } });
  for (const pick of [place, kick]) assert.deepEqual([at(heavy, "weight=1.25", pick).ahead, at(heavy, "weight=1.25", pick).height], [at(heavy, "default", pick).ahead, at(heavy, "default", pick).height]);
  for (const bad of [{ suite: "defense", grid: "axes" }, { suite: "competency", grid: "half" }, { suite: "competency", ranges: { size: [1.1] } }])
    assert.throws(() => foundationJobs({ samples: 1, ...bad }), /grid|physique/);
  // The summary keeps a physique's cell apart from the default's.
  const row = (physique) => ({ job: { competency: "stand", model: "workshop-fighter", held: "empty", hz: 120, actuation: "symmetric", level: 0.2, ...(physique && { physique }) },
    result: { status: "measured", outcome: { success: true, fell: false, steps: 0 } } });
  assert.deepEqual(summarizeCompetencies([row(), row({ size: 1.18 })]).map((c) => [c.cell, c.physique]),
    [["stand/workshop-fighter/default/empty/120/symmetric", "default"], ["stand/workshop-fighter/size=1.18/empty/120/symmetric", "size=1.18"]]);
});
