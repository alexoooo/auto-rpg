import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import {
  auditExperiments,
  decideExperiment,
  snapshotExperiment,
  validateReviewOutputs,
} from "../scripts/experiment-state.mjs";

const views = [
  "front", "front_left", "left", "back_left",
  "back", "back_right", "right", "front_right",
];

test("an_experiment_snapshot_is_immutable_and_a_decision_advances_the_checkpoint", () => {
  const root = fixture();
  try {
    writeReview(root, "baseline", 0.8);
    snapshotExperiment(root, "0001-first", "baseline");
    assert.throws(
      () => snapshotExperiment(root, "0001-first", "baseline"),
      /already exists/,
    );

    writeFileSync(resolve(root, "asset-src/build_warrior.py"), "candidate\n");
    writeReview(root, "candidate", 0.7);
    snapshotExperiment(root, "0001-first", "candidate");
    const recordPath = resolve(root, "experiments/0001-first.md");
    writeFileSync(recordPath, readFileSync(recordPath, "utf8")
      .replace("- Decision:", "- Decision: accept after inspecting the evidence.")
      .replace("Pending review.", "All eight views were inspected and changed as expected."));

    const state = decideExperiment(root, "0001-first", "accepted");
    assert.equal(state.latestAcceptedExperiment, "0001-first");
    assert.equal(state.distance, 0.7);
    assert.match(readFileSync(recordPath, "utf8"), /^Status: accepted$/m);
    assert.equal(auditExperiments(root).latestClosedExperiment, "0001-first");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("stale_review_bytes_are_refused_before_a_snapshot", () => {
  const root = fixture();
  try {
    writeReview(root, "baseline", 0.8);
    writeFileSync(resolve(root, ".review/front.png"), "changed after scoring\n");
    assert.throws(() => validateReviewOutputs(root), /front beauty render hash mismatch/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("an_archived_phase_bootstraps_the_next_sequential_experiment", () => {
  const root = fixture();
  try {
    const statePath = resolve(root, "experiments/accepted-state.json");
    const state = JSON.parse(readFileSync(statePath, "utf8"));
    const archive = resolve(root, "experiments/archive/phase-01");
    mkdirSync(archive, { recursive: true });
    const checkpoint = {
      experimentId: "0001-first",
      distance: state.distance,
      assetSourceSha256: state.assetSourceSha256,
      reportSha256: state.reportSha256,
    };
    const manifestPath = resolve(archive, "manifest.json");
    writeFileSync(manifestPath, `${JSON.stringify({
      schemaVersion: 1,
      phaseId: "phase-01",
      firstExperiment: "0001-first",
      lastExperiment: "0001-first",
      recordCount: 1,
      acceptedCheckpoint: checkpoint,
    })}\n`);
    writeFileSync(statePath, `${JSON.stringify({
      ...state,
      schemaVersion: 2,
      activePhase: "phase-02",
      latestClosedExperiment: "0001-first",
      latestAcceptedExperiment: "0001-first",
      archivedPhases: [{
        phaseId: "phase-01",
        firstExperiment: "0001-first",
        lastExperiment: "0001-first",
        recordCount: 1,
        manifestSha256: hash(manifestPath),
        acceptedCheckpoint: checkpoint,
      }],
    }, null, 2)}\n`);
    rmSync(resolve(root, "experiments/0001-first.md"), { force: true });
    writeFileSync(resolve(root, "experiments/progress/README.md"), "# Active phase\n");
    writeFileSync(resolve(root, "experiments/0002-second.md"), `# 0002: Second\n\nStatus: proposed\n\n## Pre-registration\n\n- Observation: visible mismatch\n- Hypothesis: the registered edit lowers distance\n- Change boundary: one source feature\n- Expected movement: perceptual components improve\n- Reject if: aggregate improvement is less than 0.001\n`);

    writeReview(root, "baseline", state.distance);
    snapshotExperiment(root, "0002-second", "baseline");
    assert.equal(auditExperiments(root).experiments, 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function fixture() {
  const root = mkdtempSync(resolve(tmpdir(), "warrior-experiment-state-"));
  mkdirSync(resolve(root, "asset-src"), { recursive: true });
  mkdirSync(resolve(root, "experiments/progress"), { recursive: true });
  mkdirSync(resolve(root, ".review/similarity"), { recursive: true });
  writeFileSync(resolve(root, "asset-src/build_warrior.py"), "baseline\n");
  writeFileSync(resolve(root, "experiments/progress/0000-baseline.png"), "initial\n");
  writeFileSync(resolve(root, "experiments/progress/README.md"), "# Visual progress\n");
  writeFileSync(resolve(root, "experiments/0001-first.md"), `# 0001: First\n\nStatus: proposed\n\n## Pre-registration\n\n- Observation: visible mismatch\n- Hypothesis: the registered edit lowers distance\n- Change boundary: one source feature\n- Expected movement: perceptual components improve\n- Reject if: aggregate improvement is less than 0.001\n\n## Result\n\n- Decision:\n\n## Diagnostics and visual review\n\nPending review.\n\n## Protocol reflection\n\nPending.\n\n## Next question\n\nPending.\n`);
  writeFileSync(resolve(root, "experiments/accepted-state.json"), `${JSON.stringify({
    schemaVersion: 1,
    continuityEnforcedAfter: "0001-first",
    latestClosedExperiment: "0000-bootstrap",
    latestAcceptedExperiment: "0000-bootstrap",
    distance: 0.8,
    assetSourceSha256: hash(resolve(root, "asset-src/build_warrior.py")),
    reportSha256: "bootstrap",
  }, null, 2)}\n`);
  return root;
}

function writeReview(root, label, distance) {
  const review = resolve(root, ".review");
  const inputs = {};
  for (const view of views) {
    const beautyPath = resolve(review, `${view}.png`);
    const partsPath = resolve(review, `${view}.parts.png`);
    writeFileSync(beautyPath, `${label} ${view} beauty\n`);
    writeFileSync(partsPath, `${label} ${view} parts\n`);
    writeFileSync(resolve(review, "similarity", `${view}-mask-overlay.png`), `${label} ${view} overlay\n`);
    inputs[view] = { beautySha256: hash(beautyPath), partsSha256: hash(partsPath) };
  }
  const landmarksPath = resolve(review, "landmarks.json");
  writeFileSync(landmarksPath, `${label} landmarks\n`);
  const report = {
    canonical: true,
    distance,
    componentWeights: { silhouette: 1 },
    views: Object.fromEntries(views.map((view) => [view, {
      distance,
      components: { silhouette: distance },
    }])),
    inputs: {
      candidate: inputs,
      candidateLandmarksSha256: hash(landmarksPath),
    },
  };
  writeFileSync(resolve(review, "similarity/report.json"), `${JSON.stringify(report)}\n`);
  writeFileSync(resolve(review, "similarity/report.html"), "<p>report</p>\n");
}

function hash(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}
