import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { ResearchArtifact, canonicalJson } from "../src/learning/artifact.ts";
import { FEATURE_COLUMNS } from "../src/learning/features.ts";
import { RESEARCH_ARTIFACT_CONTRACT, decodeChampionSoFar, decodeResearchArtifact, deployedResearchMind,
  inProgressResearchArtifact, loadChampionSoFarMind, refuseInProgressResearchRegistration,
  requireLiveResearchBout } from "../src/learning/deployment.ts";
import { freezeTournamentManifest } from "../src/learning/tournament.ts";
import { EFFECTOR_NAMES, HAND_ACTION_NAMES, MOVEMENT_NAMES, STANCE_NAMES, TARGET_NAMES } from "../src/options.ts";
import { loadFrozenArtifacts } from "../scripts/tournament-executor.mjs";

const tables = { movement: MOVEMENT_NAMES, action: HAND_ACTION_NAMES, effector: EFFECTOR_NAMES,
  target: TARGET_NAMES, stance: STANCE_NAMES };
const model = { featureCount: FEATURE_COLUMNS.length, hiddenCount: 1,
  hiddenWeights: Array(FEATURE_COLUMNS.length).fill(0), hiddenBias: [0],
  ...Object.fromEntries(Object.entries(tables).map(([name, labels]) => [name,
    { labels, weights: Array(labels.length).fill(0), bias: Array(labels.length).fill(0) }])),
  persistenceWeights: [0], persistenceBias: 0 };
const finalArtifact = () => new ResearchArtifact({ algorithm: "dagger", ...RESEARCH_ARTIFACT_CONTRACT,
  payload: [...new TextEncoder().encode(canonicalJson(model))], provenance: { seed: 7, solverSteps: 4,
    trainingSplit: "train", validationSplit: "validation", configDigest: "synthetic" } }, RESEARCH_ARTIFACT_CONTRACT);

test("a_champion_so_far_artifact_reloads_and_refuses_policy_registration", async () => {
  const inProgress = inProgressResearchArtifact(finalArtifact(), "session19-proof"); const bytes = inProgress.toBytes();
  assert.equal(decodeChampionSoFar(bytes).data.provenance.status, "in-progress");
  assert.doesNotThrow(() => deployedResearchMind(decodeChampionSoFar(bytes), "warrior/sword+empty"));
  const loaded = await loadChampionSoFarMind(new Blob([bytes]), "warrior/sword+empty");
  assert.equal(loaded.mind.name, "dagger");
  assert.throws(() => refuseInProgressResearchRegistration(loaded.artifact),
    /in-progress research artifact cannot be registered as a policy or tournament candidate/);
  assert.throws(() => decodeChampionSoFar(finalArtifact().toBytes()), /requires an in-progress research artifact/);
  assert.doesNotThrow(() => refuseInProgressResearchRegistration(finalArtifact()));

  const digest = createHash("sha256").update(bytes).digest("hex");
  const job = { split: "test", cell: 0, mirror: 0, actorSide: "left", actorSeed: 11, opponentSeed: 12,
    unit: "warrior", loadout: "sword+empty", opponent: "specialist", boutCapSeconds: 1 };
  const manifest = freezeTournamentManifest({ candidates: [{ name: "candidate", algorithm: "dagger",
    artifactDigest: digest, artifactBytes: bytes.byteLength }], jobs: [job] });
  assert.throws(() => loadFrozenArtifacts(manifest, new Map([["candidate", bytes]])),
    /in-progress research artifact cannot be registered as a policy or tournament candidate/);
  assert.equal(decodeResearchArtifact(bytes).data.provenance.runId, "session19-proof");
});

test("the_debug_loader_refuses_the_setup_body_that_start_would_replace", () => {
  assert.throws(() => requireLiveResearchBout("select"), /load refused during select; start or restart the bout first/);
  assert.doesNotThrow(() => requireLiveResearchBout("fight"));
  assert.throws(() => requireLiveResearchBout("over"), /load refused during over; start or restart the bout first/);
});
