import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { ResearchArtifact, canonicalJson } from "../src/learning/artifact.ts";
import { RESEARCH_ARTIFACT_CONTRACT, decodeResearchArtifact, deployedResearchMind } from "../src/learning/deployment.ts";
import { FEATURE_COLUMNS, FEATURE_VERSION } from "../src/learning/features.ts";
import { initialPopulation } from "../src/learning/genome.ts";
import { GRU_UNITS } from "../src/learning/recurrent-network.ts";
import { SeededRng } from "../src/learning/rng.ts";
import { TACTICAL_STATE_COLUMNS } from "../src/learning/tactical-model.ts";
import { freezeTournamentManifest } from "../src/learning/tournament.ts";
import { HAND_ACTION_NAMES, MOVEMENT_NAMES } from "../src/options.ts";
import { executeNextTournamentRows, loadFrozenArtifacts } from "../scripts/tournament-executor.mjs";

const payload = (value) => [...new TextEncoder().encode(canonicalJson(value))];
const provenance = { seed: 7, solverSteps: 4, trainingSplit: "train", validationSplit: "validation", configDigest: "synthetic" };
const artifact = (algorithm, model) => new ResearchArtifact({ algorithm, ...RESEARCH_ARTIFACT_CONTRACT,
  payload: payload(model), provenance }, RESEARCH_ARTIFACT_CONTRACT).toBytes();
const layer = (rows, columns) => ({ rows, columns, weights: Array(rows * columns).fill(0), bias: Array(rows).fill(0) });
const ppo = () => ({ weights: { inputSize: FEATURE_COLUMNS.length, units: GRU_UNITS,
  update: layer(GRU_UNITS, FEATURE_COLUMNS.length + GRU_UNITS), reset: layer(GRU_UNITS, FEATURE_COLUMNS.length + GRU_UNITS),
  candidate: layer(GRU_UNITS, FEATURE_COLUMNS.length + GRU_UNITS), movement: layer(MOVEMENT_NAMES.length, GRU_UNITS),
  action: layer(HAND_ACTION_NAMES.length, GRU_UNITS), value: layer(1, GRU_UNITS) } });
const dagger = () => ({ featureCount: FEATURE_COLUMNS.length, hiddenCount: 1,
  hiddenWeights: Array(FEATURE_COLUMNS.length).fill(0), hiddenBias: [0],
  movement: { labels: MOVEMENT_NAMES, weights: Array(MOVEMENT_NAMES.length).fill(0), bias: Array(MOVEMENT_NAMES.length).fill(0) },
  action: { labels: HAND_ACTION_NAMES, weights: Array(HAND_ACTION_NAMES.length).fill(0), bias: Array(HAND_ACTION_NAMES.length).fill(0) },
  persistenceWeights: [0], persistenceBias: 0 });
const lookahead = () => ({ version: 1, featureNames: TACTICAL_STATE_COLUMNS, tactics: {}, cells: {}, digest: "synthetic" });
const bytes = new Map([
  ["neat", artifact("neat-qd", initialPopulation(1, FEATURE_COLUMNS.length, MOVEMENT_NAMES.length + HAND_ACTION_NAMES.length + 1,
    9)[0])], ["dagger", artifact("dagger", dagger())], ["ppo", artifact("ppo", ppo())], ["lookahead", artifact("lookahead", lookahead())],
]);
const digest = (value) => createHash("sha256").update(value).digest("hex");
const candidates = [...bytes].map(([name, value]) => ({ name, algorithm: name === "neat" ? "neat-qd" : name,
  artifactDigest: digest(value), artifactBytes: value.byteLength }));
const job = Object.freeze({ split: "test", cell: 0, mirror: 0, actorSide: "left", actorSeed: 11, opponentSeed: 12,
  unit: "warrior", loadout: "sword+empty", opponent: "specialist", boutCapSeconds: 1 });
const manifest = freezeTournamentManifest({ candidates, jobs: [job] });

test("every_frozen_research_artifact_has_one_strict_deployment_runtime", () => {
  const loaded = loadFrozenArtifacts(manifest, bytes);
  for (const name of bytes.keys()) assert.doesNotThrow(() => deployedResearchMind(loaded.get(name), "warrior/sword+empty"));
  const changed = new Map(bytes); const corrupt = new Uint8Array(bytes.get("ppo")); corrupt[corrupt.length - 2] ^= 1; changed.set("ppo", corrupt);
  assert.throws(() => loadFrozenArtifacts(manifest, changed), /digest changed/);
});

test("the_executor_runs_only_the_next_frozen_indices_and_returns_mergeable_raw_rows", async () => {
  const loaded = loadFrozenArtifacts(manifest, bytes); const called = [];
  const mock = async (indexedJob, makeMind) => { called.push(indexedJob.index); makeMind(() => {});
    return { result: { winner: "left", seconds: 1 }, engagement: { viableOpportunities: 2, attacksInWindow: 1,
      damagingContactsInWindow: 1, nearRangeStallSeconds: 0, firstAttackSeconds: 0.2 }, actionCounts: { cut: 1 } }; };
  const rows = await executeNextTournamentRows({ manifest, rows: [], artifacts: loaded, maximum: 2, runResearchBout: mock });
  assert.deepEqual(called, [0, 0]); assert.deepEqual(rows.map((row) => row.candidate), ["neat", "dagger"]);
  assert.ok(rows.every((row) => row.manifestDigest === manifest.digest)); assert.deepEqual(rows[0].job, job);
  const resumed = await executeNextTournamentRows({ manifest, rows, artifacts: loaded, maximum: 1, runResearchBout: mock });
  assert.equal(resumed.at(-1).candidate, "ppo");
});

test("a_payload_shape_mismatch_refuses_before_the_mocked_bout_opens", () => {
  const bad = artifact("ppo", { weights: { inputSize: 1 } });
  const decoded = new ResearchArtifact({ algorithm: "ppo", ...RESEARCH_ARTIFACT_CONTRACT,
    payload: [...new TextEncoder().encode('{"weights":{"inputSize":1}}')], provenance }, RESEARCH_ARTIFACT_CONTRACT);
  assert.ok(bad.byteLength > 0);
  assert.throws(() => deployedResearchMind(decoded, "warrior/sword+empty"), /wrong recurrent feature\/action shape/);
});

/**
 * A header from the version before, refused before anything is built from it.
 *
 * The payload here is **executable**: the same bytes, resealed under the current
 * contract, decode and deploy and run a probe. Only the header is stale. That is
 * what makes this an ordering claim rather than a restatement of the envelope's
 * validator -- the artifact is not corrupt, it is not the wrong shape, and there
 * is nothing else for the refusal to be about.
 *
 * The stale table is synthetic and is meant to be. The real v3 columns were
 * deleted with v3, and reintroducing them here so that a test could name them
 * would put a copy of a retired contract back in the tree -- which is exactly
 * what `FEATURE_VERSION` exists to make unnecessary.
 */
test("a_synthetic_stale_feature_header_is_refused_before_network_execution", () => {
  const staleContract = Object.freeze({
    featureVersion: FEATURE_VERSION - 1,
    featureNames: Object.freeze(FEATURE_COLUMNS.slice(0, 66)),
    movementNames: MOVEMENT_NAMES,
    actionNames: HAND_ACTION_NAMES,
  });
  const model = dagger();
  const stale = new ResearchArtifact({ algorithm: "dagger", ...staleContract,
    payload: payload(model), provenance }, staleContract).toBytes();

  assert.throws(() => decodeResearchArtifact(stale),
    new RegExp(`research artifact feature version ${FEATURE_VERSION - 1} does not match runtime ${FEATURE_VERSION}`));
  // And not for any of the other reasons an artifact can be refused. A version
  // gate that reported "feature names do not match" would be telling whoever
  // reads the log to go and edit a column list, which is the wrong repair.
  assert.throws(() => decodeResearchArtifact(stale), (error) => {
    assert.doesNotMatch(error.message, /feature names|movement names|action names|checksum|feature count/);
    return true;
  });

  // The same model, under the current header, is a mind that runs -- so nothing
  // above was about the payload, and the refusal happened before a network was
  // ever constructed from it.
  const current = new ResearchArtifact({ algorithm: "dagger", ...RESEARCH_ARTIFACT_CONTRACT,
    payload: payload(model), provenance }, RESEARCH_ARTIFACT_CONTRACT).toBytes();
  const decoded = decodeResearchArtifact(current);
  assert.equal(decoded.data.featureVersion, FEATURE_VERSION);
  assert.doesNotThrow(() => deployedResearchMind(decoded, "warrior/sword+empty"));
});
