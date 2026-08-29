import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";

import { CONFIG } from "../src/config.ts";
import { FightEnd } from "../src/fight-end.ts";
import { BoutRecorder, sampleBoutRecorder, wireBoutRecorder } from "../src/recorder.ts";
import { saveConstruct } from "../src/construct/codec.ts";
import { constructLabConfigDigest } from "../src/construct/lab-config.ts";
import { ConstructLabBout } from "../src/construct/lab-bout.ts";
import { constructCapabilityLosses } from "../src/construct/lab-runner.ts";
import { canonicalConstructLabRowJson, classifyConstructStuck,
  recomputeConstructLabReport } from "../src/construct/lab-report.ts";
import { prepareConstructBoutJob, runPreparedConstructLabJobInScene } from "../src/construct/lab-job.ts";
import { createConstructBoutJobs } from "../src/construct/matchup.ts";
import { WARDEN_SENSORS, wardenBlueprint, wardenControl, wardenProgram } from "../src/construct/warden.ts";
import { explainConstructLabRow, labScreenMarkup, validateConstructLabSelection } from "../src/forge/lab-screen.ts";
import { createConstructHeadlessArena } from "../scripts/construct-headless-arena.mjs";
import { runConstructBatch } from "../scripts/run-construct-bouts.mjs";
import { runConstructBoutJob as runFixtureBout } from "./fixtures/construct-lab-engine.mjs";

const fixtureEngineUrl = new URL("./fixtures/construct-lab-engine.mjs", import.meta.url);

const saved = (name, overrides = {}) => saveConstruct(
  name,
  overrides.blueprint ?? wardenBlueprint("crossbow"),
  overrides.control ?? wardenControl("crossbow"),
  overrides.program ?? wardenProgram("crossbow"),
  WARDEN_SENSORS,
);

const matchupJobs = (overrides = {}) => createConstructBoutJobs(
  overrides.left ?? saved("Left"),
  overrides.right ?? saved("Right"),
  overrides.seeds ?? [3, 4, 5],
  {
    mirrored: overrides.mirrored ?? true,
    arenaDigest: overrides.arenaDigest ?? "arena-a",
    configDigest: overrides.configDigest ?? constructLabConfigDigest(overrides.boutCapSteps ?? 3600),
    boutCapSteps: overrides.boutCapSteps ?? 3600,
  },
);

const withTemporaryDirectory = async (fn) => {
  const directory = await mkdtemp(path.join(tmpdir(), "construct-lab-test-"));
  try { return await fn(directory); }
  finally { await rm(directory, { recursive: true, force: true }); }
};

const canonicalFiles = async (directory) => Promise.all(["rows.jsonl", "state.json", "report.json"]
  .map((name) => readFile(path.join(directory, name), "utf8")));

const entries = [
  { id: "warden-a", label: "Warden A", blueprintDigest: "body-a", controlDigest: "control-a", programDigest: "mind-a" },
  { id: "warden-b", label: "Warden B", blueprintDigest: "body-b", controlDigest: "control-b", programDigest: "mind-b" },
];
const row = {
  job: 7, seed: 20260828, winner: "left",
  actionTrace: ["aim", "fire", "cover"],
  refusals: [{ id: "fire", reason: "ammo:warden-crossbow is empty" }],
  capabilityLosses: [{ id: "dorsal-mount", reason: "bearing-dorsal-pitch severed" }],
};

const coverCommand = Object.freeze({ version: 1, requests: Object.freeze([Object.freeze({
  request: Object.freeze({ action: "cover", parameters: Object.freeze({
    joint: "bearing-shield", "angle-rad": 0.5,
  }) }),
  priority: 0,
  sourceIndex: 0,
})]) });
const emptyCommand = Object.freeze({ version: 1, requests: Object.freeze([]) });
const schedulerEvents = (recorder, side) => recorder.controlEvents
  .filter((event) => event.side === side && event.kind === "control")
  .flatMap((event) => event.payload.scheduler);

test("the_Lab_explains_each_capability_loss_and_action_refusal_by_stable_ID", () => {
  const explanation = explainConstructLabRow(row);
  assert.match(explanation, /fire: ammo:warden-crossbow is empty/);
  assert.match(explanation, /dorsal-mount: bearing-dorsal-pitch severed/);
  const markup = labScreenMarkup(entries, [row], null);
  assert.match(markup, /data-job="7"/);
  assert.match(markup, /Open raw explanation/);
});

test("the_Lab_foundation_exposes_visible_batch_compare_and_raw_row_controls", () => {
  const markup = labScreenMarkup(entries, [], null);
  assert.match(markup, /Run visible bout/);
  assert.match(markup, /Queue small local batch/);
  assert.match(markup, /Compare revisions/);
  assert.match(markup, /Left Mind/);
  assert.match(markup, /Right Mind/);
  assert.match(markup, /Choose a raw row to inspect stable IDs/);
  assert.match(markup, /hidden browser tab is never presented as rendering performance evidence/);
});

test("active_construct_handover_publishes_one_terminal_cancellation_before_the_new_driver_can_overwrite_it", async () => {
  const arena = await createConstructHeadlessArena();
  const bout = new ConstructLabBout(arena.scene, saved("Handover left"), saved("Handover right"),
    WARDEN_SENSORS, CONFIG.fighter.separation);
  const recorder = new BoutRecorder();
  try {
    const left = bout.construct("left");
    left.control.recording.attach(recorder, "left");
    left.control.installCommandSource("cover-before-handover", () => coverCommand);
    const frame = bout.step(1 / CONFIG.world.physicsHz);
    left.control.recording.sample(1 / CONFIG.world.physicsHz, 0);
    assert.equal(frame.left.snapshot.active.some(({ action }) => action === "cover"), true);

    left.control.installCommandSource("empty-after-handover", () => emptyCommand);
    assert.equal(schedulerEvents(recorder, "left")
      .filter(({ kind, action, reason }) => kind === "cancelled" && action === "cover" &&
        reason === "control handover").length, 1,
    "handover publishes at the lifecycle edge rather than waiting for another host sample");
    left.control.driver.step(1 / CONFIG.world.physicsHz);
    left.control.recording.sample(1 / CONFIG.world.physicsHz, 1 / CONFIG.world.physicsHz);
    const terminal = schedulerEvents(recorder, "left")
      .filter(({ kind, action, reason }) => kind === "cancelled" && action === "cover" && reason === "control handover");
    assert.equal(terminal.length, 1, "the replacement command cannot overwrite or duplicate the old terminal row");
  } finally {
    bout.dispose();
    arena.dispose();
  }
});

test("disposing_an_attached_construct_with_an_active_action_publishes_one_terminal_before_detach", async () => {
  const arena = await createConstructHeadlessArena();
  const bout = new ConstructLabBout(arena.scene, saved("Dispose left"), saved("Dispose right"),
    WARDEN_SENSORS, CONFIG.fighter.separation);
  const recorder = new BoutRecorder();
  try {
    const left = bout.construct("left");
    left.control.recording.attach(recorder, "left");
    left.control.installCommandSource("cover-before-dispose", () => coverCommand);
    const frame = bout.step(1 / CONFIG.world.physicsHz);
    left.control.recording.sample(1 / CONFIG.world.physicsHz, 0);
    assert.equal(frame.left.snapshot.active.some(({ action }) => action === "cover"), true);

    left.control.dispose();
    left.control.recording.sample(1 / CONFIG.world.physicsHz, 1 / CONFIG.world.physicsHz);
    const terminal = schedulerEvents(recorder, "left")
      .filter(({ kind, action, reason }) => kind === "cancelled" && action === "cover" && reason === "dispose");
    assert.equal(terminal.length, 1, "detach cannot discard or republish the disposal cancellation");
  } finally {
    bout.dispose();
    arena.dispose();
  }
});

test("the_real_fight_end_transition_flushes_construct_verdict_cancellations_after_sampling_closes", async () => {
  const arena = await createConstructHeadlessArena();
  const bout = new ConstructLabBout(arena.scene, saved("Verdict left"), saved("Verdict right"),
    WARDEN_SENSORS, CONFIG.fighter.separation);
  const recorder = new BoutRecorder();
  try {
    const left = bout.construct("left"); const right = bout.construct("right");
    left.control.installCommandSource("left-cover-before-verdict", () => coverCommand);
    right.control.installCommandSource("right-cover-before-verdict", () => coverCommand);
    wireBoutRecorder(recorder, left, right);
    const frame = bout.step(1 / CONFIG.world.physicsHz);
    sampleBoutRecorder(recorder, left, right, 1 / CONFIG.world.physicsHz, 0);
    assert.equal(frame.left.snapshot.active.some(({ action }) => action === "cover"), true);
    assert.equal(frame.right.snapshot.active.some(({ action }) => action === "cover"), true);

    const ending = new FightEnd([
      { fighter: left, combat: { stop() {} } },
      { fighter: right, combat: { stop() {} } },
    ]);
    assert.equal(ending.transition("fight", "over"), true);
    const terminalCount = (side) => schedulerEvents(recorder, side)
      .filter(({ kind, action, reason }) => kind === "cancelled" && action === "cover" && reason === "verdict").length;
    assert.deepEqual([terminalCount("left"), terminalCount("right")], [1, 1],
      "the verdict is durable without a post-verdict host sample");
    assert.equal(ending.transition("fight", "over"), false);
    assert.deepEqual([terminalCount("left"), terminalCount("right")], [1, 1],
      "the one-shot arena authority edge cannot duplicate terminal rows");
  } finally {
    bout.dispose();
    arena.dispose();
  }
});

test("left_and_right_Minds_are_independent_but_each_must_match_its_body_control_contract", () => {
  assert.deepEqual(validateConstructLabSelection(entries, {
    left: "warden-a", leftProgram: "warden-a", right: "warden-b", rightProgram: "warden-b",
  }), { left: "warden-a", leftProgram: "warden-a", right: "warden-b", rightProgram: "warden-b" });
  assert.throws(() => validateConstructLabSelection(entries, {
    left: "warden-a", leftProgram: "warden-b", right: "warden-b", rightProgram: "warden-b",
  }), /Left Mind "warden-b" cannot drive construct "warden-a"/);
  assert.throws(() => validateConstructLabSelection(entries, {
    left: "warden-a", leftProgram: "warden-a", right: "warden-b", rightProgram: "warden-a",
  }), /Right Mind "warden-a" cannot drive construct "warden-b"/);
});

test("the_Lab_screen_has_no_worker_or_report_implementation_hidden_in_the_UI", async () => {
  const source = await readFile(new URL("../src/forge/lab-screen.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /new\s+Worker|performance\.now|navigator\.hardwareConcurrency/);
  assert.match(source, /onBatch/);
  assert.match(source, /onCompare/);
});

test("the_batch_harness_preserves_the_engine_row_and_action_trace_without_page_state", async () => {
  await withTemporaryDirectory(async (directory) => {
    const [job] = matchupJobs({ seeds: [9], mirrored: false });
    const direct = await runFixtureBout(job);
    const batch = await runConstructBatch({ jobs: [job], outDirectory: directory, workers: 1, engineUrl: fixtureEngineUrl });
    assert.equal(canonicalConstructLabRowJson(batch.rows[0]), canonicalConstructLabRowJson(direct));
    assert.deepEqual(batch.rows[0].actionTrace, ["close-distance", "fire"]);
  });
});

test("page_and_headless_lab_run_the_same_construct_matchup_and_action_trace", async () => {
  await withTemporaryDirectory(async (directory) => {
    const left = saved("Left");
    const right = saved("Right");
    const [job] = matchupJobs({ left, right, seeds: [9], mirrored: false, boutCapSteps: 4 });
    const pagePrepared = prepareConstructBoutJob(job, WARDEN_SENSORS);
    const headless = await runConstructBatch({ jobs: [job], outDirectory: directory, workers: 1 });
    const pageHost = await createConstructHeadlessArena();
    try {
      const pageCallable = runPreparedConstructLabJobInScene(pageHost.scene, job, pagePrepared, WARDEN_SENSORS);
      assert.equal(canonicalConstructLabRowJson(pageCallable), canonicalConstructLabRowJson(headless.rows[0]));
      assert.equal(headless.rows[0].ending, "time");
      assert.equal(headless.rows[0].steps, 4);
      assert.equal(headless.rows[0].limitation, null);
      assert.ok(headless.rows[0].progress.every(({ progress, epsilon }) =>
        Number.isFinite(progress) && Number.isFinite(epsilon) && epsilon > 0));
    } finally {
      pageHost.dispose();
    }
  });
});

test("Lab_runtime_and_sensor_identity_refuse_stale_prepared_jobs_and_resume_rows", async () => {
  const changedSensors = WARDEN_SENSORS.map((sensor) => sensor.id === "opponent-range"
    ? Object.freeze({ ...sensor, unit: "scalar" }) : sensor);
  const [job] = matchupJobs({ seeds: [12], mirrored: false, boutCapSteps: 4 });
  assert.throws(() => prepareConstructBoutJob(job, changedSensors), /runtime\/schema\/sensor config digest is stale/);
  await withTemporaryDirectory(async (directory) => {
    await runConstructBatch({ jobs: [job], outDirectory: directory, workers: 1, engineUrl: fixtureEngineUrl });
    const [changed] = matchupJobs({ seeds: [12], mirrored: false, boutCapSteps: 4,
      configDigest: constructLabConfigDigest(4, changedSensors) });
    await assert.rejects(runConstructBatch({ jobs: [changed], outDirectory: directory, workers: 1,
      resume: true, engineUrl: fixtureEngineUrl }), /resume identity/);
  });
});

test("declared_seed_initial_conditions_rerun_exactly_and_different_seeds_diverge_physically", async () => {
  const run = async (seed) => {
    const [job] = matchupJobs({ seeds: [seed], mirrored: false, boutCapSteps: 12 });
    const arena = await createConstructHeadlessArena();
    try {
      return runPreparedConstructLabJobInScene(arena.scene, job, prepareConstructBoutJob(job, WARDEN_SENSORS),
        WARDEN_SENSORS);
    } finally { arena.dispose(); }
  };
  const first = await run(29); const repeated = await run(29); const different = await run(43);
  assert.equal(canonicalConstructLabRowJson(repeated), canonicalConstructLabRowJson(first));
  assert.notEqual(different.range.finalM, first.range.finalM,
    "different declared seeds must alter the physical trajectory, not only the row label");
});

test("browser_and_Node_hosts_cross_the_same_saved_bytes_and_matchup_adapter", async () => {
  const browserHost = await readFile(new URL("../src/forge/lab-host.ts", import.meta.url), "utf8");
  const nodeHost = await readFile(new URL("../scripts/construct-bout-engine.mjs", import.meta.url), "utf8");
  for (const source of [browserHost, nodeHost]) {
    assert.match(source, /prepareConstructBoutJob/);
    assert.match(source, /runPreparedConstructLabJobInScene/);
    assert.doesNotMatch(source, /parseSavedConstruct|runConstructLabBout/);
  }
  assert.ok(browserHost.indexOf("const prepared = prepareConstructBoutJob") < browserHost.indexOf("new NullEngine"),
    "browser saved bytes and identity must refuse before a solver world is allocated");
  assert.ok(nodeHost.indexOf("const prepared = prepareConstructBoutJob") <
    nodeHost.indexOf("const arena = await createConstructHeadlessArena"),
    "Node saved bytes and identity must refuse before a solver world is allocated");
});

test("a_mirrored_job_swaps_the_exact_saved_contestants_while_preserving_arena_factions", () => {
  const left = saved("Crossbow", {
    blueprint: wardenBlueprint("crossbow"), control: wardenControl("crossbow"), program: wardenProgram("crossbow"),
  });
  const right = saved("Sword", {
    blueprint: wardenBlueprint("sword"), control: wardenControl("sword"), program: wardenProgram("sword"),
  });
  const [normal, mirrored] = matchupJobs({ left, right, seeds: [19], mirrored: true });
  assert.equal(normal.matchup.mirrored, false);
  assert.equal(normal.matchup.left.blueprintDigest, left.digests.blueprint);
  assert.equal(normal.matchup.right.blueprintDigest, right.digests.blueprint);
  assert.equal(JSON.parse(normal.leftSavedJson).name, "Crossbow");
  assert.equal(JSON.parse(normal.rightSavedJson).name, "Sword");

  assert.equal(mirrored.matchup.mirrored, true);
  assert.equal(mirrored.matchup.left.faction, "left");
  assert.equal(mirrored.matchup.right.faction, "right");
  assert.equal(mirrored.matchup.left.blueprintDigest, right.digests.blueprint);
  assert.equal(mirrored.matchup.right.blueprintDigest, left.digests.blueprint);
  assert.equal(JSON.parse(mirrored.leftSavedJson).name, "Sword");
  assert.equal(JSON.parse(mirrored.rightSavedJson).name, "Crossbow");
});

test("move_advances_toward_the_opponent_at_facing_zero_and_pi", async () => {
  const moveProgram = structuredClone(wardenProgram("crossbow"));
  moveProgram.id = "warden-mind-move-probe";
  moveProgram.rules = moveProgram.rules.filter(({ id }) => id === "close-distance");
  moveProgram.rules[0].condition = { op: "constant", value: true };
  const left = saved("Left mover", { program: moveProgram });
  const right = saved("Right mover", { program: moveProgram });
  const arena = await createConstructHeadlessArena();
  const bout = new ConstructLabBout(arena.scene, left, right, WARDEN_SENSORS, CONFIG.fighter.separation);
  try {
    const initial = bout.rootPositions();
    let minimumSupport = 4;
    let maximumSlip = 0;
    let invalidTwoFootSupport = "";
    let observedSwingClearance = false;
    for (let step = 0; step < 240; step += 1) {
      const sample = bout.step(1 / CONFIG.world.physicsHz);
      if (step < 60) continue;
      for (const side of [sample.left, sample.right]) {
        const planted = Object.entries(side.snapshot.facts)
          .filter(([id, value]) => id.startsWith("contact:foot-") && value === true)
          .map(([id]) => id.slice("contact:foot-".length)).sort();
        minimumSupport = Math.min(minimumSupport, planted.length);
        const construct = bout.construct(side.side);
        const plantedHeights = planted.map((corner) => construct.runtime.part(`limb-${corner}-foot`).node.position.y);
        if (plantedHeights.length > 0) {
          const contactHeight = plantedHeights.reduce((sum, value) => sum + value, 0) / plantedHeights.length;
          if (planted.length === 2) {
            const key = planted.join(",");
            const lifted = ["front-left", "front-right", "rear-left", "rear-right"]
              .filter((corner) => !planted.includes(corner))
              .some((corner) => construct.runtime.part(`limb-${corner}-foot`).node.position.y - contactHeight > 0.02);
            if (key !== "front-left,rear-right" && key !== "front-right,rear-left" && lifted) {
              invalidTwoFootSupport = key;
            }
          }
          for (const corner of ["front-left", "front-right", "rear-left", "rear-right"]) {
            if (!planted.includes(corner) &&
              construct.runtime.part(`limb-${corner}-foot`).node.position.y - contactHeight > 0.01) {
              observedSwingClearance = true;
            }
          }
        }
        for (const [id, value] of Object.entries(side.snapshot.facts)) if (id.startsWith("slip:foot-")) {
          maximumSlip = Math.max(maximumSlip, Number(value));
        }
      }
    }
    const final = bout.rootPositions();
    const leftForwardM = final.left.z - initial.left.z;
    const rightForwardM = -(final.right.z - initial.right.z);
    assert.ok(leftForwardM > 0.05, `facing 0 moved ${leftForwardM} m along forward`);
    assert.ok(rightForwardM > 0.05, `facing pi moved ${rightForwardM} m along forward`);
    assert.ok(minimumSupport >= 2, `crawl retained only ${minimumSupport} declared foot contacts`);
    assert.equal(invalidTwoFootSupport, "", `two-foot support was not a declared diagonal: ${invalidTwoFootSupport}`);
    assert.equal(observedSwingClearance, true, "a returning foot physically clears planted foot height");
    assert.ok(maximumSlip < 4, `maximum planted-foot tangential slip was ${maximumSlip} m/s`);
    for (const side of ["left", "right"]) {
      const core = bout.construct(side).runtime.part("core").node;
      const up = Vector3.Up().rotateByQuaternionToRef(core.rotationQuaternion, new Vector3());
      assert.ok(Vector3.Dot(up, Vector3.Up()) > 0.72, `${side} core remained physically upright`);
    }
  } finally {
    bout.dispose();
    arena.dispose();
  }
});

test("physical_action_admission_consumes_power_and_reports_heat_from_the_fixed_step_ledger", async () => {
  const left = saved("Powered left"); const right = saved("Powered right");
  const arena = await createConstructHeadlessArena();
  const bout = new ConstructLabBout(arena.scene, left, right, WARDEN_SENSORS, CONFIG.fighter.separation);
  try {
    const first = bout.step(1 / CONFIG.world.physicsHz).left.snapshot.facts;
    let last = first;
    for (let step = 0; step < 120; step += 1) last = bout.step(1 / CONFIG.world.physicsHz).left.snapshot.facts;
    assert.ok(last["power-charge-j"] < first["power-charge-j"], "motor actions spend fixed-step power");
    assert.ok(last["heat-j"] >= 0 && Number.isFinite(last["heat-j"]));
  } finally {
    bout.dispose(); arena.dispose();
  }
});

test("the_physical_Mind_bus_publishes_joint_speed_and_local_opponent_vectors_only_while_hardware_survives", async () => {
  const leftSaved = saved("Sensor left"); const rightSaved = saved("Sensor right");
  const arena = await createConstructHeadlessArena();
  const bout = new ConstructLabBout(arena.scene, leftSaved, rightSaved, WARDEN_SENSORS, CONFIG.fighter.separation);
  try {
    const left = bout.construct("left"); const right = bout.construct("right");
    const joint = left.runtime.joint("bearing-dorsal-yaw");
    const frames = joint.liveFrames();
    const parentAngular = new Vector3(0.2, -0.1, 0.3);
    const axis = Vector3.Up().rotateByQuaternionToRef(frames.parent.rotation, new Vector3());
    joint.parent.body.setAngularVelocity(parentAngular);
    joint.child.body.setAngularVelocity(parentAngular.add(axis.scale(1.25)));
    left.observe(right, 0);
    assert.ok(Math.abs(left.control.sensors.read("joint-speed-bearing-dorsal-yaw").value - 1.25) < 1e-6);
    assert.ok(Number.isFinite(left.control.sensors.read("joint-angle-bearing-dorsal-yaw").value));
    assert.equal(left.control.sensors.read("core-roll-rad").unit, "radians");
    assert.equal(left.control.sensors.read("core-pitch-rad").unit, "radians");
    assert.ok(Number.isFinite(left.control.sensors.read("core-roll-rad").value));
    assert.ok(Number.isFinite(left.control.sensors.read("core-pitch-rad").value));

    for (const part of right.runtime.parts.values()) part.node.position.x += 0.2;
    left.observe(right, 0.1);
    assert.ok(Math.abs(left.control.sensors.read("opponent-local-vx").value - 2) < 1e-6);
    for (const id of ["opponent-local-x", "opponent-local-y", "opponent-local-z",
      "opponent-local-vx", "opponent-local-vy", "opponent-local-vz"]) {
      assert.ok(Number.isFinite(left.control.sensors.read(id).value), `${id} is a finite physical fact`);
    }

    left.state.damageModule("warden-sensor", 1000);
    left.state.damageJoint("bearing-dorsal-yaw", 1000);
    left.observe(right, 0.2);
    assert.equal(left.control.sensors.has("opponent-local-x"), false);
    assert.equal(left.control.sensors.has("core-roll-rad"), false);
    assert.equal(left.control.sensors.has("core-pitch-rad"), false);
    assert.equal(left.control.sensors.has("joint-speed-bearing-dorsal-yaw"), false);
    assert.throws(() => left.control.sensors.read("opponent-local-x"), /has no value/);
    assert.throws(() => left.control.sensors.read("joint-speed-bearing-dorsal-yaw"), /has no value/);
  } finally {
    bout.dispose(); arena.dispose();
  }
});

test("Lab_capability_loss_uses_action_rows_and_reasons_even_when_a_sibling_action_keeps_the_group_live", async () => {
  const control = structuredClone(wardenControl("crossbow"));
  control.actions.push({ id: "dorsal-hold", controller: "hold-joints", group: "dorsal-mount",
    claims: [], parameters: {} });
  const arena = await createConstructHeadlessArena();
  const bout = new ConstructLabBout(arena.scene, saved("Capability left", { control }), saved("Capability right"),
    WARDEN_SENSORS, CONFIG.fighter.separation);
  try {
    const before = bout.step(1 / CONFIG.world.physicsHz).left;
    bout.construct("left").state.damageModule("warden-sensor", 1000);
    const after = bout.step(1 / CONFIG.world.physicsHz).left;
    assert.ok(after.availableGroups.includes("dorsal-mount"), "aim keeps the group physically useful");
    const fire = after.snapshot.capabilities.find(({ action }) => action === "fire");
    assert.equal(fire.available, false);
    assert.match(fire.reason, /missing sensor "line-of-sight"/);
    assert.deepEqual(constructCapabilityLosses("left", before.snapshot.capabilities, after.snapshot.capabilities)
      .filter(({ id }) => id.endsWith("/fire")), [{ id: "left/dorsal-mount/fire", reason: fire.reason }]);
  } finally { bout.dispose(); arena.dispose(); }
});

test("one_two_and_four_workers_produce_identical_indexed_rows_and_report_bytes", async () => {
  await withTemporaryDirectory(async (directory) => {
    const jobs = matchupJobs();
    const outputs = [];
    for (const workers of [1, 2, 4]) {
      const output = path.join(directory, String(workers));
      await runConstructBatch({ jobs, outDirectory: output, workers, engineUrl: fixtureEngineUrl,
        engineOptions: { delays: { 0: 25, 1: 2, 2: 15 } } });
      outputs.push(await canonicalFiles(output));
    }
    assert.deepEqual(outputs[1], outputs[0]);
    assert.deepEqual(outputs[2], outputs[0]);
  });
});

test("a_failed_worker_terminates_its_slow_peer_before_that_peer_can_commit", async () => {
  await withTemporaryDirectory(async (directory) => {
    const output = path.join(directory, "run");
    const completed = path.join(directory, "completed");
    const jobs = matchupJobs({ seeds: [70, 71], mirrored: false });
    await assert.rejects(runConstructBatch({
      jobs,
      outDirectory: output,
      workers: 2,
      engineUrl: fixtureEngineUrl,
      engineOptions: { failIndices: [0], delays: { 1: 80 }, completionMarkerDirectory: completed },
    }), /fixture failure for job 0/);
    await new Promise((resolve) => setTimeout(resolve, 120));
    await assert.rejects(readFile(path.join(completed, "1"), "utf8"), (error) => error?.code === "ENOENT");
  });
});

test("wall_and_CPU_telemetry_cannot_change_canonical_report_or_resume_bytes", async () => {
  await withTemporaryDirectory(async (directory) => {
    const jobs = matchupJobs({ seeds: [12, 13] });
    const first = path.join(directory, "first");
    const second = path.join(directory, "second");
    await runConstructBatch({ jobs, outDirectory: first, workers: 1, engineUrl: fixtureEngineUrl });
    await runConstructBatch({ jobs, outDirectory: second, workers: 4, engineUrl: fixtureEngineUrl,
      engineOptions: { delays: { 0: 30 } } });
    assert.deepEqual(await canonicalFiles(second), await canonicalFiles(first));
    assert.notEqual(await readFile(path.join(second, "telemetry.json"), "utf8"),
      await readFile(path.join(first, "telemetry.json"), "utf8"));
  });
});

test("an_interrupted_batch_resumes_at_the_first_missing_job_without_replaying_complete_rows", async () => {
  await withTemporaryDirectory(async (directory) => {
    const output = path.join(directory, "run");
    const markers = path.join(directory, "markers");
    const jobs = matchupJobs({ seeds: [20, 21], mirrored: true });
    await assert.rejects(runConstructBatch({
      jobs, outDirectory: output, workers: 2, engineUrl: fixtureEngineUrl,
      engineOptions: { delays: { 0: 80, 1: 0 }, markerDirectory: markers, rejectRepeatIndices: [1] },
      onCommitted: (completed) => { if (completed.job === 1) throw new Error("simulated coordinator interruption"); },
    }), /simulated coordinator interruption/);
    const interruptedState = JSON.parse(await readFile(path.join(output, "state.json"), "utf8"));
    assert.deepEqual(interruptedState.completed, [1]);
    const resumed = await runConstructBatch({ jobs, outDirectory: output, workers: 2, resume: true,
      engineUrl: fixtureEngineUrl, engineOptions: { markerDirectory: markers, rejectRepeatIndices: [1] } });
    assert.equal(resumed.rows.length, jobs.length);
    assert.deepEqual(JSON.parse(await readFile(path.join(output, "state.json"), "utf8")).completed, [0, 1, 2, 3]);
  });
});

test("an_out_of_order_completed_job_is_durable_before_the_contiguous_prefix_reaches_it", async () => {
  await withTemporaryDirectory(async (directory) => {
    const output = path.join(directory, "run");
    const jobs = matchupJobs({ seeds: [30, 31], mirrored: false });
    await assert.rejects(runConstructBatch({ jobs, outDirectory: output, workers: 2, engineUrl: fixtureEngineUrl,
      engineOptions: { delays: { 0: 60, 1: 0 } },
      onCommitted: (completed) => { if (completed.job === 1) throw new Error("stop after out-of-order row"); },
    }), /stop after out-of-order row/);
    assert.equal(JSON.parse(await readFile(path.join(output, "jobs", "00000001.json"), "utf8")).job, 1);
    assert.deepEqual(JSON.parse(await readFile(path.join(output, "state.json"), "utf8")).completed, [1]);
  });
});

test("a_changed_blueprint_program_arena_or_config_digest_refuses_resume_before_solver_work", async () => {
  await withTemporaryDirectory(async (directory) => {
    const baseline = matchupJobs({ seeds: [40], mirrored: false });
    await runConstructBatch({ jobs: baseline, outDirectory: directory, workers: 1, engineUrl: fixtureEngineUrl });
    const blueprint = { ...wardenBlueprint("crossbow"), id: "warden-crossbow-revision" };
    const program = { ...wardenProgram("crossbow"), id: "warden-mind-revision" };
    const variants = [
      matchupJobs({ seeds: [40], mirrored: false, left: saved("Left", { blueprint }) }),
      matchupJobs({ seeds: [40], mirrored: false, left: saved("Left", { program }) }),
      matchupJobs({ seeds: [40], mirrored: false, arenaDigest: "arena-b" }),
      matchupJobs({ seeds: [40], mirrored: false, configDigest: "config-b" }),
    ];
    for (const jobs of variants) {
      await assert.rejects(runConstructBatch({ jobs, outDirectory: directory, workers: 1, resume: true,
        engineUrl: fixtureEngineUrl }), /resume identity does not match/);
    }
  });
});

test("the_report_recomputes_every_aggregate_from_raw_rows", async () => {
  const jobs = matchupJobs({ seeds: [50, 51], mirrored: false });
  const rows = await Promise.all(jobs.map((job) => runFixtureBout(job)));
  const report = recomputeConstructLabReport(rows, "run-a");
  assert.equal(report.aggregate.bouts, 2);
  assert.equal(report.aggregate.leftWins + report.aggregate.rightWins + report.aggregate.draws, 2);
  assert.equal(report.aggregate.damage.left, rows.reduce((sum, row) => sum + row.left.damage, 0));
  assert.equal(report.aggregate.damage.right, rows.reduce((sum, row) => sum + row.right.damage, 0));
  assert.equal(report.aggregate.actions.requests, rows.reduce((sum, row) => sum + row.left.requests + row.right.requests, 0));
  assert.equal(report.aggregate.energyJ, rows.reduce((sum, row) => sum + row.left.energyJ + row.right.energyJ, 0));
  assert.equal(report.aggregate.peakHeatJ, Math.max(...rows.flatMap((row) => [row.left.peakHeatJ, row.right.peakHeatJ])));
  assert.equal(report.aggregate.meanRangeM, rows.reduce((sum, row) => sum + row.range.meanM, 0) / rows.length);
});

test("an_action_that_never_completes_is_reported_as_stuck_not_as_activity", () => {
  const sample = (step, progress, capabilityAvailable = true) => ({
    step, side: "left", action: "fire", group: "dorsal-mount", phase: "charging",
    progress, epsilon: 0.01, capabilityAvailable,
  });
  const stationary = Array.from({ length: 7 }, (_, index) => sample(index + 1, 0.25));
  assert.deepEqual(classifyConstructStuck(stationary, 5), [{
    side: "left", action: "fire", group: "dorsal-mount", phase: "charging", firstStep: 1, lastStep: 7,
  }]);
  const moving = stationary.map((value, index) => index === 3 ? sample(value.step, 0.5) : value);
  assert.deepEqual(classifyConstructStuck(moving, 5), []);
  assert.deepEqual(classifyConstructStuck(stationary.map((value) => sample(value.step, 0.005)), 5), []);
  assert.deepEqual(classifyConstructStuck(stationary.map((value, index) => index === 3
    ? sample(value.step, value.progress, false) : value), 5), []);
});
