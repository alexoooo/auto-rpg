import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { stepControlledPair } from "../src/control-host.ts";
import {
  classifySupportedClosure,
  resolveSupportedPairSamples,
} from "../src/supported-locomotion.ts";
import { runSupportedLocomotionCell,
  SUPPORTED_LOCOMOTION_BASELINE_CONTRACT } from "../scripts/measure-supported-locomotion.mjs";

const request = (localForward, localRight, yaw = 0, recover = false) => ({
  localForward, localRight, yaw, recover,
});

const port = (name, order, value) => {
  let current = value;
  return {
    beginControlStep() { order.push(`begin-${name}`); },
    request(next) { current = next; order.push(`request-${name}`); },
    sample() { order.push(`sample-${name}`); return { request: current }; },
    commit(resolution) { order.push(`commit-${name}`); this.resolution = resolution; },
    clear(reason) { order.push(`clear-${name}:${reason}`); current = null; },
    resolution: null,
  };
};

test("both_bodies_decide_before_either_locomotion_port_commits", () => {
  const order = [];
  const leftPort = port("left", order, null);
  const rightPort = port("right", order, null);
  const body = (name, locomotion, next) => ({
    locomotion,
    observe() { order.push(`observe-${name}`); },
    control: { driver: {
      surface: "fixture", name,
      step() { order.push(`decide-${name}`); locomotion.request(next); },
      stop() {},
    } },
  });

  stepControlledPair(
    body("left", leftPort, request(1, 0)),
    body("right", rightPort, request(-1, 0)),
    1 / 240,
    4,
  );

  assert.deepEqual(order, [
    "observe-left", "observe-right",
    "begin-left", "begin-right",
    "decide-left", "request-left", "decide-right", "request-right",
    "sample-left", "sample-right", "commit-left", "commit-right",
  ]);
  assert.deepEqual(leftPort.resolution.allowed, request(1, 0));
  assert.deepEqual(rightPort.resolution.allowed, request(-1, 0));
});

test("swapping_step_call_order_cannot_change_pair_resolution", () => {
  const run = (reverse) => {
    const resolutions = new Map();
    const build = (name, next) => {
      const owned = port(name, [], null);
      const commit = owned.commit.bind(owned);
      owned.commit = (resolution) => { commit(resolution); resolutions.set(name, resolution); };
      return { locomotion: owned, observe() {}, control: { driver: { surface: "fixture", name,
        step() { owned.request(next); }, stop() {} } } };
    };
    const a = build("a", request(0.8, -0.2, 0.3));
    const b = build("b", request(-0.4, 0.1, -0.7, true));
    stepControlledPair(reverse ? b : a, reverse ? a : b, 1 / 240, 0);
    return resolutions;
  };
  const forward = run(false);
  const reverse = run(true);
  assert.deepEqual(forward.get("a"), reverse.get("a"));
  assert.deepEqual(forward.get("b"), reverse.get("b"));
});

test("an_absent_and_an_explicit_null_port_have_identical_no_op_semantics", () => {
  const run = (include, locomotion) => {
    const order = [];
    const body = (name, include) => ({
      ...(include ? { locomotion } : {}),
      observe() { order.push(`observe-${name}`); },
      control: { driver: { surface: "fixture", name,
        step() { order.push(`step-${name}`); }, stop() {} } },
    });
    stepControlledPair(body("left", include), body("right", include), 1 / 240, 0);
    return order;
  };
  assert.deepEqual(run(true, null), ["observe-left", "observe-right", "step-left", "step-right"]);
  assert.deepEqual(run(false, undefined), ["observe-left", "observe-right", "step-left", "step-right"]);
});

test("the_two_phase_wrapper_reproduces_the_frozen_pre_refactor_trace_exactly", () => {
  const run = (shared) => {
    const trace = [];
    const make = (name, start) => ({
      root: start,
      observe(opponent, clock) { trace.push(["observe", name, opponent.root, clock]); },
      control: { driver: { surface: "fixture", name,
        step(dt) { this.owner.root += dt * (name === "left" ? 2 : -3);
          trace.push(["driver", name, this.owner.root, dt]); }, stop() {}, owner: null } },
    });
    const left = make("left", 1); const right = make("right", 5);
    left.control.driver.owner = left; right.control.driver.owner = right;
    if (shared) stepControlledPair(left, right, 0.25, 7);
    else {
      left.observe(right, 7); right.observe(left, 7);
      left.control.driver.step(0.25); right.control.driver.step(0.25);
    }
    trace.push(["roots", left.root, right.root], ["controls", "idle", "brace"], ["combat-events"]);
    return trace;
  };
  assert.deepEqual(run(true), run(false));
});

test("page_bench_construct_lab_and_Workshop_share_the_same_pair_step", async () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const files = [];
  const walk = async (directory) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(target);
      else if (/\.(?:ts|mjs)$/.test(entry.name)) files.push(target);
    }
  };
  await Promise.all(["src", "scripts", "tests"].map((name) => walk(path.join(root, name))));
  const forbidden = new RegExp(
    String.raw`\.observe\([^\n]+\);\s*\r?\n\s*[^\n]+\.observe\([^\n]+\);\s*\r?\n\s*[^\n]+(?:\.update|\.control\.driver\.step)\(`,
    "g",
  );
  const violations = [];
  for (const file of files) {
    if (path.basename(file) === "control-host.ts" || path.basename(file) === "supported-locomotion-evidence.test.mjs") {
      continue;
    }
    const source = await readFile(file, "utf8");
    if (forbidden.test(source)) violations.push(path.relative(root, file));
    forbidden.lastIndex = 0;
  }
  assert.deepEqual(violations, [], `direct two-body schedules bypass the shared pair step: ${violations.join(", ")}`);
});

const contract = {
  expectedCells: [
    { scenario: "warrior-warrior", side: "left" },
    { scenario: "warrior-warrior", side: "right" },
  ],
  expectedSampleCount: 3,
  separationEnvelopeM: 1.1,
  requiredInwardEnvelopeDwellSamples: 2,
  maxPenetrationM: 0.02,
  maxPenetrationDwellSamples: 0,
  maxPartSpeedMps: 12,
  maxJointFrameErrorM: 0.08,
};

const samples = () => [
  { step: 0, separationM: 1.4, inwardRequested: true, compositePosture: true,
    penetrationM: 0, maxPartSpeedMps: 2, maxJointFrameErrorM: 0.01 },
  { step: 1, separationM: 1.05, inwardRequested: true, compositePosture: true,
    penetrationM: 0, maxPartSpeedMps: 2.5, maxJointFrameErrorM: 0.015 },
  { step: 2, separationM: 1.0, inwardRequested: true, compositePosture: true,
    penetrationM: 0.01, maxPartSpeedMps: 3, maxJointFrameErrorM: 0.02 },
];

const longestRun = (rows, accepts) => {
  let longest = 0; let current = 0;
  for (const row of rows) {
    current = accepts(row) ? current + 1 : 0;
    longest = Math.max(longest, current);
  }
  return longest;
};

const summary = (rows) => ({
  sampleCount: rows.length,
  minSeparationM: Math.min(...rows.map(({ separationM }) => separationM)),
  enteredEnvelope: rows.some(({ separationM }) => separationM <= contract.separationEnvelopeM),
  inwardEnvelopeDwellSamples: longestRun(rows,
    ({ inwardRequested, separationM }) => inwardRequested && separationM <= contract.separationEnvelopeM),
  postureLossSamples: rows.filter(({ compositePosture }) => !compositePosture).length,
  penetrationDwellSamples: longestRun(rows,
    ({ penetrationM }) => penetrationM > contract.maxPenetrationM),
  maxPenetrationM: Math.max(...rows.map(({ penetrationM }) => penetrationM)),
  maxPartSpeedMps: Math.max(...rows.map((row) => row.maxPartSpeedMps)),
  maxJointFrameErrorM: Math.max(...rows.map((row) => row.maxJointFrameErrorM)),
});

const goodEvidence = () => ({
  cells: contract.expectedCells.map(({ scenario, side }) => {
    const retained = samples();
    return { scenario, side, samples: retained, summary: summary(retained) };
  }),
});

test("closure_acceptance_is_recomputed_from_exact_unique_retained_cells", () => {
  const result = classifySupportedClosure(goodEvidence(), contract);
  assert.equal(result.status, "qualified", result.reasons.join("\n"));
  assert.deepEqual(result.cells.map(({ scenario, side }) => ({ scenario, side })), contract.expectedCells);

  const duplicate = goodEvidence();
  duplicate.cells.push(structuredClone(duplicate.cells[0]));
  const rejected = classifySupportedClosure(duplicate, contract);
  assert.equal(rejected.status, "rejected");
  assert.match(rejected.reasons.join("\n"), /duplicate cell warrior-warrior\/left/);
});

test("non_finite_relabelled_reordered_and_over_cap_evidence_is_refused", () => {
  const cases = [
    ["non-finite", (evidence) => { evidence.cells[0].samples[1].separationM = Number.NaN; }, /finite/],
    ["relabelled", (evidence) => { evidence.cells[0].side = "middle"; }, /unexpected cell/],
    ["reordered", (evidence) => { evidence.cells.reverse(); }, /order/],
    ["speed cap", (evidence) => {
      evidence.cells[0].samples[1].maxPartSpeedMps = 12.1;
      evidence.cells[0].summary.maxPartSpeedMps = 12.1;
    }, /part speed/],
    ["summary disagreement", (evidence) => { evidence.cells[0].summary.minSeparationM = 0; }, /summary/],
  ];
  for (const [label, mutate, pattern] of cases) {
    const evidence = goodEvidence(); mutate(evidence);
    const result = classifySupportedClosure(evidence, contract);
    assert.equal(result.status, "rejected", label);
    assert.match(result.reasons.join("\n"), pattern, label);
  }
});

test("a_closure_cell_must_really_request_move_enter_range_and_remain_inward", () => {
  const cases = [
    ["inward", (cell) => { cell.samples[1].inwardRequested = false; }, /inward dwell/],
    ["envelope", (cell) => {
      for (const row of cell.samples) row.separationM = 1.2;
    }, /never entered/],
    ["posture", (cell) => { cell.samples[1].compositePosture = false; }, /posture/],
    ["penetration", (cell) => { cell.samples[1].penetrationM = 0.03; }, /penetration dwell/],
    ["joint frame", (cell) => { cell.samples[1].maxJointFrameErrorM = 0.081; }, /joint-frame/],
  ];
  for (const [label, mutate, pattern] of cases) {
    const evidence = goodEvidence(); mutate(evidence.cells[0]);
    evidence.cells[0].summary = summary(evidence.cells[0].samples);
    const result = classifySupportedClosure(evidence, contract);
    assert.equal(result.status, "rejected", label);
    assert.match(result.reasons.join("\n"), pattern, label);
  }
});

test("a_forged_non_boolean_recovery_request_is_refused", () => {
  assert.throws(() => resolveSupportedPairSamples({ request: { ...request(0, 0), recover: 1 } },
    { request: null }, 1 / 240), /recover must be boolean/);
});

test("the_current_clinch_heap_trace_is_rejected_as_discombobulated", async () => {
  // This is the real shipping Swordbearer under Havok, not a classifier fixture. Keep one
  // facing here; the command-line baseline owns both facings and both scenarios.
  const sampleSteps = 360;
  const cell = await runSupportedLocomotionCell({
    scenario: "warrior-swordbearer", side: "left", sampleSteps,
  });
  const result = classifySupportedClosure({ cells: [cell] }, {
    ...SUPPORTED_LOCOMOTION_BASELINE_CONTRACT,
    expectedCells: [{ scenario: "warrior-swordbearer", side: "left" }],
    expectedSampleCount: sampleSteps,
    requiredInwardEnvelopeDwellSamples: 120,
  });

  assert.equal(result.status, "rejected");
  assert.match(result.reasons.join("\n"), /lost composite posture|penetration dwell|part speed/);
  assert.ok(cell.summary.enteredEnvelope, "a never-closing cell would not exercise the clinch");
  assert.ok(cell.summary.inwardEnvelopeDwellSamples >= 120,
    "the Warrior must remain commanded inward inside the frozen envelope");
});

test("the_supported_locomotion_measurement_refuses_every_unfrozen_flag", () => {
  const run = spawnSync(process.execPath,
    [fileURLToPath(new URL("../scripts/measure-supported-locomotion.mjs", import.meta.url)), "--quick"],
    { encoding: "utf8" });
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /accepts exactly "--baseline"/);
});
